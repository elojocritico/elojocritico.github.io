import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "astro/zod";
import { RAIZ_CONTENIDO } from "./contenido";

const FechaZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null);
const EpisodioZ = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  fecha: FechaZ,
  duracion: z.string().nullable().default(null),
  mp3: z.string().nullable().default(null),
  url: z.string(),
  descripcion: z.string().default(""),
});
const VideoZ = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  fecha: FechaZ,
  duracion: z.number().nullable().default(null),
});
export type Episodio = z.infer<typeof EpisodioZ>;
export type Video = z.infer<typeof VideoZ>;

function cargar<T>(nombre: string, esquema: z.ZodType<T, z.ZodTypeDef, unknown>): T[] {
  const ruta = join(RAIZ_CONTENIDO(), nombre);
  if (!existsSync(ruta)) return [];
  const r = z.array(esquema).safeParse(JSON.parse(readFileSync(ruta, "utf-8")));
  if (!r.success) throw new Error(`${nombre} inválido: ${r.error.message}`);
  return r.data;
}
// Más reciente primero; lo que no tiene fecha va al final, en su orden original.
function ordenar<T extends { fecha: string | null }>(xs: T[]): T[] {
  const con = xs.filter((x) => x.fecha).sort((a, b) => b.fecha!.localeCompare(a.fecha!));
  return [...con, ...xs.filter((x) => !x.fecha)];
}
export const episodios = (): Episodio[] => ordenar(cargar("podcast.json", EpisodioZ));
export const videos = (): Video[] => ordenar(cargar("videos.json", VideoZ));

export function duracionLegible(d: number | string | null | undefined): string {
  let seg: number;
  if (typeof d === "number") seg = d;
  else if (typeof d === "string" && /^\d+(:\d{1,2}){1,2}$/.test(d)) {
    seg = d.split(":").map(Number).reduce((t, n) => t * 60 + n, 0);
  } else return "";
  if (!Number.isFinite(seg) || seg <= 0) return "";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min`;
  return `${Math.round(seg)} s`;
}
