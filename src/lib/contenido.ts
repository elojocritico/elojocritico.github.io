import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "astro/zod";
import { esBloque, esCliente, esUrlWeb } from "./validacion";

export const RAIZ_CONTENIDO = () => process.env.EOC_CONTENIDO ?? resolve(process.cwd(), "contenido");
const leer = (rel: string) => JSON.parse(readFileSync(join(RAIZ_CONTENIDO(), rel), "utf-8"));

export const ArticuloZ = z.object({
  slug: z.string().regex(/^[^/\s]+$/),
  titulo: z.string().min(1),
  subtitulo: z.string().default(""),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  autor: z.string().default("El Ojo Crítico"),
  secciones: z.array(z.string()).default([]),
  etiquetas: z.array(z.string()).default([]),
  portada: z.object({ src: z.string(), tarjeta: z.string(), alt: z.string().default("") }).nullable().default(null),
  extracto: z.string().default(""),
  cuerpoHtml: z.string(),
  destacado: z.boolean().default(false),
  origen: z.string().default(""),
});
const ComentarioZ = z.object({ id: z.string(), autor: z.string(), fecha: z.string(), html: z.string(), respuestaA: z.string().nullable() });
const AjustesZ = z
  .object({
    destacado: z.string().nullable(),
    enlaces: z.array(z.object({ nombre: z.string(), url: z.string() })),
    adsense: z.object({ activo: z.boolean(), cliente: z.string(), bloque: z.string() }),
  })
  // Defensa en profundidad: lo guardado en el panel se vuelve a comprobar antes de pintarlo en la web.
  // Lo inválido se descarta con un aviso; nunca se rompe la construcción.
  .transform((a) => {
    const enlaces = a.enlaces.filter((e) => {
      const bien = esUrlWeb(e.url);
      if (!bien) console.warn(`[ajustes] Enlace descartado (la dirección no es http/https): ${JSON.stringify(e.nombre)}`);
      return bien;
    });
    let adsense = a.adsense;
    const { cliente, bloque } = adsense;
    if ((cliente !== "" && !esCliente(cliente)) || (bloque !== "" && !esBloque(bloque))) {
      console.warn("[ajustes] Publicidad desactivada: el código de cuenta o de bloque no es válido.");
      adsense = { activo: false, cliente: "", bloque: "" };
    }
    return { ...a, enlaces, adsense };
  });

export type Articulo = z.infer<typeof ArticuloZ>;
export type Comentario = z.infer<typeof ComentarioZ>;
const NuevoComentarioZ = z.object({ id: z.string(), nombre: z.string(), fecha: z.string(), texto: z.string() });
export type Ajustes = z.infer<typeof AjustesZ>;
export type ComentarioNuevo = z.infer<typeof NuevoComentarioZ>;
export type Seccion = { slug: string; nombre: string };
export type NodoComentario = Comentario & { respuestas: NodoComentario[] };

let _cache: Articulo[] | null = null;
export function articulos(): Articulo[] {
  if (_cache) return _cache;
  const dir = join(RAIZ_CONTENIDO(), "articulos");
  _cache = readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => {
      const r = ArticuloZ.safeParse(leer(join("articulos", f)));
      if (!r.success) throw new Error(`Artículo inválido ${f}: ${r.error.message}`);
      return r.data;
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.slug.localeCompare(b.slug));
  return _cache;
}
export const articulo = (slug: string) => articulos().find((a) => a.slug === slug);

/** Identificadores de comentarios del archivo ocultados desde el panel (contenido/archivo-ocultos.json). Sin fichero = ninguno. */
export function ocultosArchivo(slug: string): Set<string> {
  const rel = "archivo-ocultos.json";
  if (!existsSync(join(RAIZ_CONTENIDO(), rel))) return new Set();
  const datos = z.record(z.string(), z.array(z.string())).parse(leer(rel));
  return new Set(datos[slug] ?? []);
}
/** Todos los comentarios del archivo tal como están en el fichero (el panel los lee enteros para poder mostrar los ocultos). */
export function comentariosArchivoTodos(slug: string): Comentario[] {
  const rel = join("comentarios-archivo", `${slug}.json`);
  return existsSync(join(RAIZ_CONTENIDO(), rel)) ? z.array(ComentarioZ).parse(leer(rel)) : [];
}
export function slugsComentariosArchivo(): string[] {
  const dir = join(RAIZ_CONTENIDO(), "comentarios-archivo");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];
}
/** Lo que se publica para el panel: los ocultos van sin texto ni autor (solo su número), para que no queden públicos. */
export function comentariosArchivoParaPanel(slug: string) {
  const ocultos = ocultosArchivo(slug);
  return comentariosArchivoTodos(slug).map((c) =>
    ocultos.has(c.id) ? { id: c.id, autor: "", fecha: c.fecha, html: "", respuestaA: c.respuestaA, oculto: true } : c);
}
/** Comentarios del archivo que se muestran en la web: sin los ocultos. */
export function comentariosArchivo(slug: string): Comentario[] {
  const ocultos = ocultosArchivo(slug);
  return comentariosArchivoTodos(slug).filter((c) => !ocultos.has(c.id));
}
/** Comentarios nuevos ya aprobados (contenido/comentarios/<dirección>.json, los genera el exportador), del más antiguo al más reciente. */
export function comentariosAprobados(slug: string): ComentarioNuevo[] {
  const rel = join("comentarios", `${slug}.json`);
  if (!existsSync(join(RAIZ_CONTENIDO(), rel))) return [];
  return z.array(NuevoComentarioZ).parse(leer(rel)).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
export const secciones = (): Seccion[] => leer("secciones.json");
export const nombreSeccion = (slug: string) => secciones().find((s) => s.slug === slug)?.nombre ?? slug;
export const ajustes = (): Ajustes => AjustesZ.parse(leer("ajustes.json"));
export const paginaQueEs = (): { titulo: string; cuerpoHtml: string } => leer("paginas/que-es-eoc.json");

export function relacionados(a: Articulo, todos: Articulo[], n = 3): Articulo[] {
  return todos.filter((x) => x.slug !== a.slug && x.secciones.some((s) => a.secciones.includes(s))).slice(0, n);
}
export function destacado(todos: Articulo[], aj: Ajustes): Articulo {
  return todos.find((a) => a.slug === aj.destacado) ?? todos[0];
}
export const anios = (todos: Articulo[]) => [...new Set(todos.map((a) => Number(a.fecha.slice(0, 4))))].sort((a, b) => b - a);

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}
/** El anuncio solo se pinta con la publicidad activada y con código de cuenta y de bloque (sin bloque saldría un hueco roto). */
export const hayAnuncio = (a: { activo?: boolean; cliente?: string; bloque?: string }) => a.activo === true && !!a.cliente && !!a.bloque;

const MADRID = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
function enMadrid(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso)) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  return Object.fromEntries(MADRID.formatToParts(t).map((x) => [x.type, x.value])) as Record<string, string>;
}
/** Como fechaLarga, pero para un instante (con hora): el día es el de España (Europe/Madrid), no el de UTC. Sin hora, igual que fechaLarga. */
export function fechaLargaMadrid(iso: string): string {
  const p = enMadrid(iso);
  return p ? `${Number(p.day)} ${MESES[Number(p.month) - 1]} ${p.year}` : fechaLarga(iso);
}
/** "28 dic 2014, 00:30" en hora de España. Sin hora en el texto, solo la fecha. */
export function fechaHoraMadrid(iso: string): string {
  const p = enMadrid(iso);
  return p ? `${Number(p.day)} ${MESES[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute}` : fechaLarga(iso);
}
export function minutosLectura(html: string): number {
  const palabras = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palabras / 220));
}
export function arbolComentarios(cs: Comentario[]): NodoComentario[] {
  const nodos = new Map(cs.map((c) => [c.id, { ...c, respuestas: [] as NodoComentario[] }]));
  const raiz: NodoComentario[] = [];
  for (const n of nodos.values()) {
    const padre = n.respuestaA ? nodos.get(n.respuestaA) : undefined;
    (padre ? padre.respuestas : raiz).push(n);
  }
  return raiz;
}
