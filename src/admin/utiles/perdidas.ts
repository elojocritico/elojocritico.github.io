// Antes de guardar se comprueba que el editor no se "come" vídeos, tablas, fotos... del artículo sin que nadie lo sepa.
import { sanear } from "../../lib/sanear";

type Elemento = { clave: string; patron: RegExp; uno: string; varios: string };

export const ELEMENTOS: Elemento[] = [
  { clave: "iframe", patron: /<iframe\b/g, uno: "vídeo o reproductor", varios: "vídeos o reproductores" },
  { clave: "table", patron: /<table\b/g, uno: "tabla", varios: "tablas" },
  { clave: "img", patron: /<img\b/g, uno: "foto", varios: "fotos" },
  { clave: "figure", patron: /<figure\b/g, uno: "foto con pie", varios: "fotos con pie" },
  { clave: "perdida", patron: /<span class="img-perdida"/g, uno: "foto pendiente", varios: "fotos pendientes" },
  { clave: "roto", patron: /<a [^>]*class="(roto|archivado)"/g, uno: "enlace marcado como roto o archivado", varios: "enlaces marcados como rotos o archivados" },
  { clave: "tabla-celdas", patron: /<(td|th)\b/g, uno: "celda de tabla", varios: "celdas de tablas" },
];

/** Cuántos elementos de cada tipo quedan en el HTML una vez saneado (que es lo que se publica). */
export function contarElementos(html: string): Record<string, number> {
  const limpio = sanear(html);
  return Object.fromEntries(ELEMENTOS.map((e) => [e.clave, (limpio.match(e.patron) ?? []).length]));
}

/** Cuántas «fotos pendientes» (marcas de foto perdida) quedan en el cuerpo ya saneado. Se guarda en el artículo como fotosPendientes. */
export const contarFotosPendientes = (html: string) => contarElementos(html).perdida;

/** Frase en llano si al guardar se perderían elementos que había al abrir; null si no se pierde nada. */
export function avisoDePerdidas(antes: string, despues: string): string | null {
  const a = contarElementos(antes);
  const d = contarElementos(despues);
  const partes: string[] = [];
  // Poner una foto en lugar de una «foto pendiente» no es perder nada: cada foto nueva compensa una marca que ya no está.
  const fotosNuevas = Math.max(0, d.img - a.img);
  for (const e of ELEMENTOS) {
    const faltan = a[e.clave] - d[e.clave] - (e.clave === "perdida" ? Math.min(fotosNuevas, a.perdida - d.perdida) : 0);
    if (faltan > 0) partes.push(`${faltan} ${faltan === 1 ? e.uno : e.varios}`);
  }
  if (partes.length === 0) return null;
  return `Al guardar se perderían ${partes.join(", ")}. ¿Seguro?`;
}
