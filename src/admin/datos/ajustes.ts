// Capa de datos de Ajustes y Usuarios (ajustes/global). Recibe la base de datos como parámetro para poder probarse con el simulador.
// Cada guardado va en una transacción que compara la marca de versión (actualizadoEn de ajustes/global) con la que vio quien guarda:
// si otra persona guardó mientras tanto, no se pisa su cambio.
import { deleteField, doc, FieldPath, getDoc, runTransaction, type Firestore } from "firebase/firestore";
import { sanear } from "../../lib/sanear";
import { esBloque, esCliente, esUrlWeb } from "../../lib/validacion";
import type { Papel } from "../sesion";

export const MAX_ENLACES = 20;
/** Valor reservado del importador: el panel nunca debe escribirlo en actualizadoPor. */
const RESERVADO = "migración";

export type Enlace = { nombre: string; url: string };
export type Adsense = { activo: boolean; cliente: string; bloque: string };
export type QueEsEoc = { titulo: string; cuerpoHtml: string };
export type Ajustes = {
  destacado: string | null; enlaces: Enlace[]; queEsEoc: QueEsEoc; adsense: Adsense;
  usuarios: Record<string, Papel>;
  /** Marca de versión: lo que valía actualizadoEn al leer ("" si nunca se ha guardado desde el panel). */
  version: string;
};
export type Cambios = Partial<Pick<Ajustes, "destacado" | "enlaces" | "queEsEoc" | "adsense">>;

export class ErrorAjustes extends Error {
  constructor(
    public code:
      | "ajustes/conflicto" | "ajustes/no-existe" | "ajustes/sin-usuario" | "ajustes/enlace" | "ajustes/muchos-enlaces"
      | "ajustes/adsense" | "ajustes/correo" | "ajustes/papel" | "ajustes/ultimo-admin" | "ajustes/destacado",
    public detalle?: string,
  ) {
    super(code);
  }
}

export const AVISOS_AJUSTES: Record<string, string> = {
  "ajustes/conflicto": "Otra persona ha cambiado los ajustes mientras tú los editabas. Recarga la página para ver sus cambios y vuelve a hacer los tuyos; así no se pierde nada.",
  "ajustes/no-existe": "No se encuentran los ajustes de la web. Avisa a la persona que administra la web.",
  "ajustes/sin-usuario": "No se ha podido saber quién eres. Sal y vuelve a entrar.",
  "ajustes/muchos-enlaces": `Puede haber como máximo ${MAX_ENLACES} enlaces.`,
  "ajustes/adsense": "Los datos de publicidad no son correctos.",
  "ajustes/correo": "Ese correo no parece correcto. Revisa que esté bien escrito.",
  "ajustes/papel": "Elige si la persona será administradora o editora.",
  "ajustes/ultimo-admin": "Tiene que quedar al menos un administrador. Primero nombra administrador a otra persona.",
  "ajustes/destacado": "El artículo destacado no es válido.",
};

const CORREO = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

export { esUrlWeb };

/** Devuelve el problema en llano o null si los enlaces están bien. */
export function problemaDeEnlaces(enlaces: Enlace[]): string | null {
  if (enlaces.length > MAX_ENLACES) return AVISOS_AJUSTES["ajustes/muchos-enlaces"];
  for (const [i, e] of enlaces.entries()) {
    if (!e.nombre.trim()) return `El enlace ${i + 1} no tiene nombre.`;
    if (!esUrlWeb(e.url)) return `El enlace «${e.nombre.trim()}» no tiene una dirección válida. Debe empezar por http:// o https://`;
  }
  return null;
}

/** Devuelve el problema en llano o null si los datos de AdSense están bien. */
export function problemaDeAdsense(a: Adsense): string | null {
  const cliente = a.cliente.trim(), bloque = a.bloque.trim();
  if (a.activo && (!cliente || !bloque)) return "Para activar la publicidad hay que rellenar el código de cuenta y el código de bloque.";
  if (cliente && !esCliente(cliente)) return "El código de cuenta debe ser como ca-pub-1234567890123456 (ca-pub- y 16 números).";
  if (bloque && !esBloque(bloque)) return "El código de bloque debe tener 10 números.";
  return null;
}

export const normalizarCorreo = (c: string) => c.trim().toLowerCase();
export const esCorreo = (c: string) => CORREO.test(normalizarCorreo(c));

function quien(usuario: string): string {
  const q = (usuario ?? "").trim();
  if (!q || q === RESERVADO) throw new ErrorAjustes("ajustes/sin-usuario");
  return q;
}

const aVersion = (v: unknown) => (typeof v === "string" ? v : "");

function aAjustes(d: Record<string, unknown>): Ajustes {
  const q = (d.queEsEoc ?? {}) as Partial<QueEsEoc>;
  const a = (d.adsense ?? {}) as Partial<Adsense>;
  return {
    destacado: typeof d.destacado === "string" && d.destacado ? d.destacado : null,
    enlaces: Array.isArray(d.enlaces) ? (d.enlaces as Enlace[]).map((e) => ({ nombre: String(e?.nombre ?? ""), url: String(e?.url ?? "") })) : [],
    queEsEoc: { titulo: String(q.titulo ?? ""), cuerpoHtml: String(q.cuerpoHtml ?? "") },
    adsense: { activo: a.activo === true, cliente: String(a.cliente ?? ""), bloque: String(a.bloque ?? "") },
    usuarios: (d.usuarios ?? {}) as Record<string, Papel>,
    version: aVersion(d.actualizadoEn),
  };
}

export async function leerAjustes(db: Firestore): Promise<Ajustes> {
  const s = await getDoc(doc(db, "ajustes", "global"));
  if (!s.exists()) throw new ErrorAjustes("ajustes/no-existe");
  return aAjustes(s.data());
}

/** Valida y limpia los cambios; lanza ErrorAjustes si algo no es correcto. */
function prepararCambios(c: Cambios): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if ("destacado" in c) {
    if (c.destacado !== null && (typeof c.destacado !== "string" || !c.destacado.trim() || c.destacado.includes("/"))) throw new ErrorAjustes("ajustes/destacado");
    r.destacado = c.destacado === null ? null : c.destacado!.trim();
  }
  if (c.enlaces) {
    const problema = problemaDeEnlaces(c.enlaces);
    if (problema) throw new ErrorAjustes(c.enlaces.length > MAX_ENLACES ? "ajustes/muchos-enlaces" : "ajustes/enlace", problema);
    r.enlaces = c.enlaces.map((e) => ({ nombre: e.nombre.trim(), url: e.url.trim() }));
  }
  if (c.adsense) {
    const problema = problemaDeAdsense(c.adsense);
    if (problema) throw new ErrorAjustes("ajustes/adsense", problema);
    r.adsense = { activo: c.adsense.activo === true, cliente: c.adsense.cliente.trim(), bloque: c.adsense.bloque.trim() };
  }
  if (c.queEsEoc) r.queEsEoc = { titulo: c.queEsEoc.titulo.trim(), cuerpoHtml: sanear(c.queEsEoc.cuerpoHtml) };
  return r;
}

/**
 * Guarda solo los campos indicados. `version` es la marca que se vio al abrir; si ya no coincide, se lanza "ajustes/conflicto".
 * Devuelve la nueva marca de versión.
 */
export async function guardarAjustes(db: Firestore, usuario: string, version: string, cambios: Cambios): Promise<string> {
  const correo = quien(usuario);
  const datos = prepararCambios(cambios);
  const ref = doc(db, "ajustes", "global");
  const ahora = new Date().toISOString();
  await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new ErrorAjustes("ajustes/no-existe");
    if (aVersion(s.data().actualizadoEn) !== version) throw new ErrorAjustes("ajustes/conflicto");
    tx.update(ref, { ...datos, actualizadoEn: ahora, actualizadoPor: correo });
  });
  return ahora;
}

/**
 * Añade, cambia de papel (papel = "admin" | "editor") o quita (papel = null) a una persona de la lista de autorizados.
 * El correo se guarda siempre en minúsculas, con FieldPath (los correos llevan puntos). Nunca deja la lista sin administrador.
 * Devuelve la nueva marca de versión.
 */
export async function cambiarUsuario(db: Firestore, usuario: string, version: string, correo: string, papel: Papel | null): Promise<string> {
  const quienSoy = quien(usuario);
  const clave = normalizarCorreo(correo);
  if (!esCorreo(clave)) throw new ErrorAjustes("ajustes/correo");
  if (papel !== null && papel !== "admin" && papel !== "editor") throw new ErrorAjustes("ajustes/papel");
  const ref = doc(db, "ajustes", "global");
  const ahora = new Date().toISOString();
  await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new ErrorAjustes("ajustes/no-existe");
    const d = s.data();
    if (aVersion(d.actualizadoEn) !== version) throw new ErrorAjustes("ajustes/conflicto");
    const actuales = (d.usuarios ?? {}) as Record<string, string>;
    // Resultado final, para comprobar que sigue habiendo un administrador.
    const resultado: Record<string, string> = {};
    for (const [k, v] of Object.entries(actuales)) if (k.trim().toLowerCase() !== clave) resultado[k] = v;
    if (papel !== null) resultado[clave] = papel;
    if (!Object.values(resultado).includes("admin")) throw new ErrorAjustes("ajustes/ultimo-admin");
    // Se borran las variantes con mayúsculas de ese mismo correo y se escribe la clave en minúsculas.
    const pares: unknown[] = [];
    for (const k of Object.keys(actuales)) if (k !== clave && k.trim().toLowerCase() === clave) pares.push(new FieldPath("usuarios", k), deleteField());
    pares.push(new FieldPath("usuarios", clave), papel === null ? deleteField() : papel);
    pares.push("actualizadoEn", ahora, "actualizadoPor", quienSoy);
    const [campo, valor, ...resto] = pares as [FieldPath, unknown, ...unknown[]];
    tx.update(ref, campo, valor, ...resto);
  });
  return ahora;
}
