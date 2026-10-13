// Capa de datos del editor de artículos. Recibe la base de datos como parámetro para poder probarse contra el simulador.
// Todas las fechas que guarda son texto ISO en UTC ("...Z").
import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, type Firestore } from "firebase/firestore";
import { ErrorArticulo, escribirVersion, validarUsuario, type Estado } from "./articulos";
import { marcarPublicarPendiente } from "./publicar";
import { hayConflicto } from "../utiles/conflicto";
import { contarFotosPendientes } from "../utiles/perdidas";

export type Portada = { src: string; tarjeta: string; alt: string };

/** Lo que escribe la persona en el editor. */
export type Campos = {
  titulo: string; subtitulo: string; cuerpoHtml: string; extracto: string; portada: Portada | null;
  autor: string; secciones: string[]; etiquetas: string[]; destacado: boolean;
};

export type Articulo = Campos & {
  slug: string; estado: Estado; fechaPublicacion: string; creadoEn: string; actualizadoEn: string; actualizadoPor: string;
  enPapeleraDesde: string | null;
};

export type Version = Articulo & { id: string; guardadoEn: string; guardadoPor: string };

export const CAMPOS_VACIOS: Campos = {
  titulo: "", subtitulo: "", cuerpoHtml: "", extracto: "", portada: null, autor: "", secciones: [], etiquetas: [], destacado: false,
};

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function aArticulo(d: Record<string, unknown>, id: string): Articulo {
  const p = d.portada as Partial<Portada> | null | undefined;
  return {
    slug: String(d.slug ?? id), titulo: String(d.titulo ?? ""), subtitulo: String(d.subtitulo ?? ""), cuerpoHtml: String(d.cuerpoHtml ?? ""),
    extracto: String(d.extracto ?? ""),
    portada: p && typeof p === "object" && p.src ? { src: String(p.src), tarjeta: String(p.tarjeta ?? p.src), alt: String(p.alt ?? "") } : null,
    autor: String(d.autor ?? ""), secciones: lista(d.secciones), etiquetas: lista(d.etiquetas),
    estado: (d.estado as Estado) ?? "borrador", fechaPublicacion: String(d.fechaPublicacion ?? ""), destacado: d.destacado === true,
    creadoEn: String(d.creadoEn ?? ""), actualizadoEn: String(d.actualizadoEn ?? ""), actualizadoPor: String(d.actualizadoPor ?? ""),
    enPapeleraDesde: (d.enPapeleraDesde as string | null) ?? null,
  };
}

/** Solo los campos que se editan (sin estado, fechas ni autoría). */
export function camposDe(a: Campos): Campos {
  return {
    titulo: a.titulo, subtitulo: a.subtitulo, cuerpoHtml: a.cuerpoHtml, extracto: a.extracto, portada: a.portada,
    autor: a.autor, secciones: a.secciones, etiquetas: a.etiquetas, destacado: a.destacado,
  };
}

export async function cargarArticulo(db: Firestore, id: string): Promise<Articulo | null> {
  const s = await getDoc(doc(db, "articulos", id));
  return s.exists() ? aArticulo(s.data(), id) : null;
}

/** ¿Hay ya un artículo con esta dirección? (la dirección es el identificador) */
export async function existeDireccion(db: Firestore, direccion: string): Promise<boolean> {
  return (await getDoc(doc(db, "articulos", direccion))).exists();
}

export type Peticion = {
  /** Dirección de la página = identificador del artículo. */
  id: string;
  esNuevo: boolean;
  /** "actualizadoEn" que tenía el artículo al abrirlo. Se compara con el de ahora para avisar si alguien lo cambió. */
  cargadoEn: string | null;
  campos: Campos;
  estado: Exclude<Estado, "papelera">;
  /** Si no se indica, se conserva la que ya tiene (o la de ahora en un artículo nuevo). */
  fechaPublicacion?: string;
  usuario: string;
  /** "Guardar los míos de todas formas": no avisa del conflicto, pero la versión del otro queda guardada en el historial. */
  forzar?: boolean;
};

/**
 * Crea o actualiza un artículo en una sola transacción:
 *  - nuevo: falla si la dirección ya existe;
 *  - existente: falla con "articulo/conflicto" si alguien lo cambió desde que se abrió (salvo `forzar`);
 *  - guarda una copia de lo anterior en el historial y anota quién y cuándo.
 * Devuelve el nuevo "actualizadoEn", que hay que usar como `cargadoEn` en el siguiente guardado.
 */
export async function guardarArticulo(db: Firestore, p: Peticion): Promise<{ actualizadoEn: string }> {
  const quien = validarUsuario(p.usuario);
  if (!p.campos.titulo.trim()) throw new ErrorArticulo("articulo/sin-titulo");
  const ref = doc(db, "articulos", p.id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const ahora = new Date().toISOString();
    const c = { ...p.campos, titulo: p.campos.titulo.trim(), fotosPendientes: contarFotosPendientes(p.campos.cuerpoHtml) };
    if (p.esNuevo) {
      if (snap.exists()) throw new ErrorArticulo("articulo/direccion-ocupada");
      tx.set(ref, {
        slug: p.id, ...c, estado: p.estado, fechaPublicacion: p.fechaPublicacion ?? ahora,
        creadoEn: ahora, actualizadoEn: ahora, actualizadoPor: quien, enPapeleraDesde: null,
      });
      return { actualizadoEn: ahora };
    }
    if (!snap.exists()) throw new ErrorArticulo("articulo/no-existe");
    const actual = snap.data();
    if (actual.estado === "papelera") throw new ErrorArticulo("articulo/estado");
    if (!p.forzar && hayConflicto(p.cargadoEn, String(actual.actualizadoEn ?? ""))) {
      throw new ErrorArticulo("articulo/conflicto", { actual: aArticulo(actual, p.id) });
    }
    escribirVersion(tx, db, p.id, actual, ahora, quien);
    tx.update(ref, {
      ...c, estado: p.estado, fechaPublicacion: p.fechaPublicacion ?? actual.fechaPublicacion ?? ahora,
      actualizadoEn: ahora, actualizadoPor: quien,
    });
    return { actualizadoEn: ahora };
  });
}

/** Las últimas versiones (copias de cómo estaba el artículo antes de cada cambio), de la más reciente a la más antigua. */
export async function listarVersiones(db: Firestore, id: string, maximo = 30): Promise<Version[]> {
  const s = await getDocs(query(collection(db, "articulos", id, "versiones"), orderBy("guardadoEn", "desc"), limit(maximo)));
  return s.docs.map((d) => ({ ...aArticulo(d.data(), id), id: d.id, guardadoEn: String(d.data().guardadoEn ?? ""), guardadoPor: String(d.data().guardadoPor ?? "") }));
}

export { marcarPublicarPendiente };
