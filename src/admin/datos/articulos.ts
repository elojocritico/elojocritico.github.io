// Capa de datos de "Mis artículos". Recibe la base de datos como parámetro para poder probarse contra el simulador.
// Todas las fechas que guarda son texto ISO (new Date().toISOString()), igual que el importador.
import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, startAfter, startAt, endAt, where, writeBatch,
  type DocumentSnapshot, type Firestore, type QueryConstraint, type QuerySnapshot,
} from "firebase/firestore";
import type { Papel } from "../sesion";

export const POR_PAGINA = 25;
/** Con más coincidencias que esto en el índice de títulos, se pide al usuario que afine la búsqueda. */
export const MAX_COINCIDENCIAS = 90;
const TROZO_IN = 30; // límite de valores de una consulta "in"
const TROZO_BORRADO = 400;
/** Valor reservado del importador: el panel nunca debe escribirlo en actualizadoPor. */
const RESERVADO = "migración";

export type Estado = "borrador" | "programado" | "publicado" | "papelera";
export const NOMBRE_ESTADO: Record<Estado, string> = {
  borrador: "Borrador", programado: "Programado", publicado: "Publicado", papelera: "En la papelera",
};

export type Resumen = {
  id: string; slug: string; titulo: string; estado: Estado; secciones: string[];
  actualizadoEn: string; actualizadoPor: string; fechaPublicacion: string; enPapeleraDesde: string | null;
};

export type Filtros = { estado?: Estado | "todos"; seccion?: string; texto?: string };
type Modo = "normal" | "indice" | "prefijo";
/** Cursor opaco: lo devuelve una página y se pasa tal cual para pedir la siguiente. */
export type Cursor = { tipo: "doc"; doc: DocumentSnapshot; modo: Modo } | { tipo: "resto"; resto: Resumen[] };
export type Pagina = {
  articulos: Resumen[]; cursor: Cursor | null; hayMas: boolean;
  /** "indice": búsqueda en el índice de títulos; "prefijo": búsqueda simple por el principio del título. */
  modo: Modo; truncado: boolean;
};

export class ErrorArticulo extends Error {
  constructor(public code: "articulo/no-existe" | "articulo/estado" | "articulo/solo-admin" | "articulo/sin-usuario") {
    super(code);
  }
}

const aResumen = (id: string, d: Record<string, unknown>): Resumen => ({
  id,
  slug: String(d.slug ?? id),
  titulo: String(d.titulo ?? ""),
  estado: (d.estado as Estado) ?? "borrador",
  secciones: Array.isArray(d.secciones) ? (d.secciones as string[]) : [],
  actualizadoEn: String(d.actualizadoEn ?? ""),
  actualizadoPor: String(d.actualizadoPor ?? ""),
  fechaPublicacion: String(d.fechaPublicacion ?? ""),
  enPapeleraDesde: (d.enPapeleraDesde as string | null) ?? null,
});

/** Minúsculas y sin tildes, para comparar títulos. */
export const normalizar = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

function filtrosDe(f: Filtros): QueryConstraint[] {
  const r: QueryConstraint[] = [];
  if (f.estado && f.estado !== "todos") r.push(where("estado", "==", f.estado));
  else r.push(where("estado", "in", ["borrador", "programado", "publicado"])); // la papelera solo se ve si se pide
  if (f.seccion) r.push(where("secciones", "array-contains", f.seccion));
  return r;
}

function paginaDeConsulta(s: QuerySnapshot, modo: Modo): Pagina {
  const docs = s.docs.slice(0, POR_PAGINA);
  const hayMas = s.docs.length > POR_PAGINA;
  return {
    articulos: docs.map((d) => aResumen(d.id, d.data())),
    cursor: hayMas ? { tipo: "doc", doc: docs[docs.length - 1], modo } : null,
    hayMas, modo, truncado: false,
  };
}

function paginaDeLista(lista: Resumen[], truncado: boolean): Pagina {
  const resto = lista.slice(POR_PAGINA);
  return { articulos: lista.slice(0, POR_PAGINA), cursor: resto.length ? { tipo: "resto", resto } : null, hayMas: resto.length > 0, modo: "indice", truncado };
}

/**
 * Una página de 25 artículos. Sin texto: por fecha de cambio, del más reciente al más antiguo.
 * Con texto: usa el índice de títulos si existe; si no, busca por el principio del título.
 * Para la página siguiente se pasa el cursor de la anterior.
 */
export async function listarArticulos(db: Firestore, filtros: Filtros = {}, cursor: Cursor | null = null): Promise<Pagina> {
  if (cursor?.tipo === "resto") return paginaDeLista(cursor.resto, false);
  const texto = (filtros.texto ?? "").trim();
  const coleccion = collection(db, "articulos");
  const despues = cursor ? [startAfter(cursor.doc)] : [];

  if (!texto) {
    const q = query(coleccion, ...filtrosDe(filtros), orderBy("actualizadoEn", "desc"), ...despues, limit(POR_PAGINA + 1));
    return paginaDeConsulta(await getDocs(q), "normal");
  }

  if (!cursor) {
    const indice = await getDoc(doc(db, "indices", "titulos"));
    if (indice.exists()) return buscarEnIndice(db, indice.data() as Record<string, string>, texto, filtros);
  }
  const q = query(coleccion, ...filtrosDe(filtros), orderBy("titulo"), startAt(texto), endAt(texto + ""), ...despues, limit(POR_PAGINA + 1));
  return paginaDeConsulta(await getDocs(q), "prefijo");
}

async function buscarEnIndice(db: Firestore, indice: Record<string, string>, texto: string, filtros: Filtros): Promise<Pagina> {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  const todas = Object.entries(indice).filter(([, t]) => {
    const n = normalizar(String(t));
    return palabras.every((p) => n.includes(p));
  });
  const slugs = todas.slice(0, MAX_COINCIDENCIAS).map(([s]) => s);
  const encontrados: Resumen[] = [];
  for (let i = 0; i < slugs.length; i += TROZO_IN) {
    const s = await getDocs(query(collection(db, "articulos"), where("slug", "in", slugs.slice(i, i + TROZO_IN))));
    s.docs.forEach((d) => encontrados.push(aResumen(d.id, d.data())));
  }
  const queEstado = filtros.estado && filtros.estado !== "todos" ? filtros.estado : null;
  const lista = encontrados
    .filter((a) => (queEstado ? a.estado === queEstado : a.estado !== "papelera"))
    .filter((a) => !filtros.seccion || a.secciones.includes(filtros.seccion))
    .sort((a, b) => (a.actualizadoEn < b.actualizadoEn ? 1 : a.actualizadoEn > b.actualizadoEn ? -1 : 0));
  return paginaDeLista(lista, todas.length > MAX_COINCIDENCIAS);
}

// ---------------------------------------------------------------------------------------------------------------
// Acciones. Todas guardan primero una versión (copia de lo anterior) y marcan quién y cuándo, dentro de una transacción.

async function cambiar(db: Firestore, id: string, usuario: string, calcular: (actual: Record<string, unknown>) => Record<string, unknown>) {
  const quien = (usuario ?? "").trim();
  if (!quien || quien === RESERVADO) throw new ErrorArticulo("articulo/sin-usuario");
  const ref = doc(db, "articulos", id);
  const refVersion = doc(collection(db, "articulos", id, "versiones"));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ErrorArticulo("articulo/no-existe");
    const actual = snap.data();
    const cambios = calcular(actual);
    const ahora = new Date().toISOString();
    tx.set(refVersion, { ...actual, guardadoEn: ahora, guardadoPor: quien });
    tx.update(ref, { ...cambios, actualizadoEn: ahora, actualizadoPor: quien });
  });
}

export const despublicar = (db: Firestore, id: string, usuario: string) =>
  cambiar(db, id, usuario, (a) => {
    if (a.estado !== "publicado" && a.estado !== "programado") throw new ErrorArticulo("articulo/estado");
    return { estado: "borrador" };
  });

/** "Mover a otra sección": el artículo queda en esa única sección. */
export const moverSeccion = (db: Firestore, id: string, usuario: string, seccion: string) =>
  cambiar(db, id, usuario, (a) => {
    if (a.estado === "papelera" || !seccion.trim()) throw new ErrorArticulo("articulo/estado");
    return { secciones: [seccion] };
  });

export const enviarAPapelera = (db: Firestore, id: string, usuario: string) =>
  cambiar(db, id, usuario, (a) => {
    if (a.estado === "papelera") throw new ErrorArticulo("articulo/estado");
    return { estadoAntesDePapelera: a.estado ?? "borrador", estado: "papelera", enPapeleraDesde: new Date().toISOString() };
  });

export const restaurar = (db: Firestore, id: string, usuario: string) =>
  cambiar(db, id, usuario, (a) => {
    if (a.estado !== "papelera") throw new ErrorArticulo("articulo/estado");
    const antes = a.estadoAntesDePapelera;
    const estado = antes === "publicado" || antes === "programado" || antes === "borrador" ? antes : "borrador";
    return { estado, estadoAntesDePapelera: null, enPapeleraDesde: null };
  });

/** Solo administradores y solo desde la papelera: borra el artículo y todas sus versiones. */
export async function borrarDefinitivamente(db: Firestore, id: string, papel: Papel) {
  if (papel !== "admin") throw new ErrorArticulo("articulo/solo-admin");
  const ref = doc(db, "articulos", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new ErrorArticulo("articulo/no-existe");
  if (snap.data().estado !== "papelera") throw new ErrorArticulo("articulo/estado");
  const versiones = (await getDocs(collection(db, "articulos", id, "versiones"))).docs.map((d) => d.ref);
  for (let i = 0; i < versiones.length; i += TROZO_BORRADO) {
    const lote = writeBatch(db);
    versiones.slice(i, i + TROZO_BORRADO).forEach((r) => lote.delete(r));
    await lote.commit();
  }
  await writeBatch(db).delete(ref).commit();
}
