import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "astro/zod";

export const RAIZ_CONTENIDO = () => process.env.EOC_CONTENIDO ?? resolve(process.cwd(), "contenido");
const leer = (rel: string) => JSON.parse(readFileSync(join(RAIZ_CONTENIDO(), rel), "utf-8"));

const ArticuloZ = z.object({
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
const AjustesZ = z.object({
  destacado: z.string().nullable(),
  enlaces: z.array(z.object({ nombre: z.string(), url: z.string() })),
  adsense: z.object({ activo: z.boolean(), cliente: z.string(), bloque: z.string() }),
});

export type Articulo = z.infer<typeof ArticuloZ>;
export type Comentario = z.infer<typeof ComentarioZ>;
export type Ajustes = z.infer<typeof AjustesZ>;
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

export function comentariosArchivo(slug: string): Comentario[] {
  const rel = join("comentarios-archivo", `${slug}.json`);
  return existsSync(join(RAIZ_CONTENIDO(), rel)) ? z.array(ComentarioZ).parse(leer(rel)) : [];
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
