// Capa de datos de la moderación de comentarios. Recibe la base de datos como parámetro para poder probarse con el simulador.
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, startAfter, updateDoc, where,
  type DocumentSnapshot, type Firestore, type Unsubscribe,
} from "firebase/firestore";

export const POR_PAGINA = 25;
const TROZO_IN = 30;

export type EstadoComentario = "pendiente" | "aprobado" | "rechazado" | "spam";
export type Pendiente = { id: string; articuloSlug: string; nombre: string; correo: string; texto: string; creadoEn: string };
export type Cursor = DocumentSnapshot;
export type Pagina = { comentarios: Pendiente[]; cursor: Cursor | null; hayMas: boolean };

/** Un comentario del archivo (el que viene de la web antigua), tal como lo publica /comentarios-archivo/<dirección>.json. */
export type ComentarioArchivo = { id: string; autor: string; fecha: string; html: string; respuestaA: string | null; oculto?: boolean };

function aFecha(v: unknown): string {
  if (typeof v === "string") return v;
  const t = (v as { toDate?: () => Date } | null)?.toDate?.();
  return t ? t.toISOString() : "";
}

const aPendiente = (id: string, d: Record<string, unknown>): Pendiente => ({
  id,
  articuloSlug: String(d.articuloSlug ?? ""),
  nombre: String(d.nombre ?? ""),
  correo: String(d.correo ?? ""),
  texto: String(d.texto ?? ""),
  creadoEn: aFecha(d.creadoEn),
});

/** Pendientes de revisar, los más antiguos primero, de 25 en 25. */
export async function listarPendientes(db: Firestore, cursor: Cursor | null = null): Promise<Pagina> {
  const q = query(
    collection(db, "comentarios"), where("estado", "==", "pendiente"), orderBy("creadoEn", "asc"),
    ...(cursor ? [startAfter(cursor)] : []), limit(POR_PAGINA + 1),
  );
  const s = await getDocs(q);
  const docs = s.docs.slice(0, POR_PAGINA);
  const hayMas = s.docs.length > POR_PAGINA;
  return { comentarios: docs.map((d) => aPendiente(d.id, d.data())), cursor: hayMas ? docs[docs.length - 1] : null, hayMas };
}

/** Aprobar, rechazar o marcar como spam: solo cambia el estado (es lo único que permiten las reglas). */
export async function moderar(db: Firestore, id: string, estado: Exclude<EstadoComentario, "pendiente">) {
  await updateDoc(doc(db, "comentarios", id), { estado });
}

/** Títulos de los artículos a partir de sus direcciones; los que no se encuentren quedan sin título. */
export async function titulosDe(db: Firestore, slugs: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(slugs.filter(Boolean))];
  const r: Record<string, string> = {};
  for (let i = 0; i < unicos.length; i += TROZO_IN) {
    const s = await getDocs(query(collection(db, "articulos"), where("slug", "in", unicos.slice(i, i + TROZO_IN))));
    s.docs.forEach((d) => (r[String(d.data().slug)] = String(d.data().titulo ?? "")));
  }
  return r;
}

/** Única escucha en tiempo real del panel: el número de comentarios pendientes. */
export function suscribirPendientes(db: Firestore, alCambiar: (n: number) => void, alFallar: () => void): Unsubscribe {
  return onSnapshot(query(collection(db, "comentarios"), where("estado", "==", "pendiente")), (s) => alCambiar(s.size), alFallar);
}

// ------------------------------------------------------------------------------------------------------------
// Comentarios del archivo ocultos: archivoOcultos/{dirección} = { ids: [...] }

export async function leerOcultos(db: Firestore, slug: string): Promise<string[]> {
  const s = await getDoc(doc(db, "archivoOcultos", slug));
  const ids = s.exists() ? s.data().ids : [];
  return Array.isArray(ids) ? ids.map(String) : [];
}

/** Oculta o vuelve a mostrar un comentario del archivo. Devuelve la lista de ocultos que ha quedado. */
export async function cambiarOculto(db: Firestore, slug: string, id: string, ocultar: boolean): Promise<string[]> {
  const ref = doc(db, "archivoOcultos", slug);
  return runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    const actual: string[] = s.exists() && Array.isArray(s.data().ids) ? s.data().ids.map(String) : [];
    const nuevos = ocultar ? (actual.includes(id) ? actual : [...actual, id]) : actual.filter((x) => x !== id);
    tx.set(ref, { ids: nuevos }, { merge: true }); // merge: no pisa "textos" (copia del texto de los ocultos, la escribe el exportador)
    return nuevos;
  });
}

/** Lee los comentarios del archivo de un artículo (fichero estático de la web). Sin fichero = ninguno. */
export async function cargarArchivo(slug: string, traer: typeof fetch = fetch): Promise<ComentarioArchivo[]> {
  const r = await traer(`/comentarios-archivo/${encodeURIComponent(slug)}.json`);
  if (r.status === 404) return [];
  if (!r.ok) throw Object.assign(new Error("archivo"), { code: "unavailable" });
  const datos = await r.json();
  return Array.isArray(datos) ? (datos as ComentarioArchivo[]) : [];
}

/** Texto plano de un comentario del archivo (viene en HTML ya saneado; aquí solo se muestra como texto). */
export function textoPlano(html: string): string {
  const d = new DOMParser().parseFromString(html.replace(/<\/p>\s*<p[^>]*>|<br\s*\/?>/gi, "\n"), "text/html");
  return (d.body.textContent ?? "").trim();
}
