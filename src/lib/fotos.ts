// Fotos del sitio público: dimensiones reales (leídas del disco en el build), portada efectiva y nota de fotos perdidas.
import { existsSync, openSync, readSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { imageSize } from "image-size";

/** Una portada más estrecha que esto (px) se sustituye por la foto más ancha del cuerpo, si la hay. */
export const PORTADA_MINIMA = 600;
/** Si el ancho real es menor que el hueco, la foto se muestra a su tamaño sobre fondo difuminado.
 *  Destacado de portada: hueco de ~700 px (2/3 de 1080) -> 600. Tarjeta: hueco de ~300-350 px (rejilla de 3) -> 400. */
export const UMBRAL_DESTACADO = 600;
export const UMBRAL_TARJETA = 400;

export const NOTA_FOTOS_PERDIDAS = "Algunas imágenes de este artículo no se han podido recuperar.";

export type Portada = { src: string; tarjeta: string; alt: string };
export type PortadaEfectiva = Portada & {
  /** Ancho real (px) de `src` y de `tarjeta`; null si no se pudo leer el archivo. */
  anchoSrc: number | null;
  anchoTarjeta: number | null;
  /** true si se ha cambiado la portada original por una foto del cuerpo. */
  sustituida: boolean;
};
export type LectorAncho = (ruta: string) => number | null;

const dirImagenes = () => process.env.EOC_IMAGENES ?? resolve(process.cwd(), "..", "imagenes");
const cache = new Map<string, number | null>();

/** Ancho real de una ruta pública /img/AAAA/MM/x.webp, leído de ../imagenes (EOC_IMAGENES). null si no existe el archivo. Con caché. */
export const leerAncho: LectorAncho = (ruta) => {
  if (!/^\/img\/[^?#]+$/.test(ruta) || ruta.includes("..")) return null;
  const clave = dirImagenes() + "|" + ruta;
  if (cache.has(clave)) return cache.get(clave)!;
  let ancho: number | null = null;
  const archivo = join(dirImagenes(), ruta.slice("/img/".length));
  try {
    if (existsSync(archivo)) ancho = imageSize(new Uint8Array(readHead(archivo))).width ?? null;
  } catch { ancho = null; }
  cache.set(clave, ancho);
  return ancho;
};
function readHead(archivo: string): Buffer {
  // Las cabeceras de WebP/JPEG/PNG caben en los primeros KB; JPEG con mucho EXIF puede necesitar más.
  const fd = openSync(archivo, "r");
  try {
    const b = Buffer.alloc(65536);
    const n = readSync(fd, b, 0, b.length, 0);
    return b.subarray(0, n);
  } finally { closeSync(fd); }
}

/** Rutas /img/... de las <img> del cuerpo (sin repetir, en orden). */
export function imagenesDelCuerpo(html: string): string[] {
  const rutas: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc="(\/img\/[^"?#]+)"/gi)) if (!rutas.includes(m[1])) rutas.push(m[1]);
  return rutas;
}

/** nombre.webp -> nombre-640.webp (variante de tarjeta). */
export const variante640 = (src: string) => src.replace(/(\.[a-z0-9]+)$/i, "-640$1");

/** Portada que se usa en tarjetas, destacado y og:image: la original, salvo que sea estrecha (< PORTADA_MINIMA)
 *  y alguna foto del cuerpo sea más ancha; entonces, la más ancha del cuerpo. Sin archivos en disco, la original. */
export function elegirPortada(portada: Portada | null, cuerpoHtml: string, leer: LectorAncho = leerAncho): PortadaEfectiva | null {
  const anchoOriginal = portada ? leer(portada.src) : null;
  const sinCambio = (): PortadaEfectiva | null => portada && {
    ...portada, anchoSrc: anchoOriginal, anchoTarjeta: leer(portada.tarjeta), sustituida: false,
  };
  if (portada && (anchoOriginal === null || anchoOriginal >= PORTADA_MINIMA)) return sinCambio();
  let mejor: { src: string; ancho: number } | null = null;
  for (const src of imagenesDelCuerpo(cuerpoHtml)) {
    if (portada && src === portada.src) continue;
    const ancho = leer(src);
    if (ancho !== null && (!mejor || ancho > mejor.ancho)) mejor = { src, ancho };
  }
  const base = anchoOriginal ?? 0;
  if (!mejor || mejor.ancho <= base) return sinCambio();
  const v = variante640(mejor.src);
  const anchoV = leer(v);
  return {
    src: mejor.src, tarjeta: anchoV !== null ? v : mejor.src, alt: portada?.alt ?? "",
    anchoSrc: mejor.ancho, anchoTarjeta: anchoV !== null ? anchoV : mejor.ancho, sustituida: true,
  };
}

const cachePortadas = new Map<string, PortadaEfectiva | null>();
/** Portada efectiva de un artículo, calculada una sola vez por build. */
export function portadaDe(a: { slug: string; portada: Portada | null; cuerpoHtml: string }): PortadaEfectiva | null {
  if (!cachePortadas.has(a.slug)) cachePortadas.set(a.slug, elegirPortada(a.portada, a.cuerpoHtml));
  return cachePortadas.get(a.slug)!;
}

/** ¿La foto es más estrecha que su hueco? Sin ancho conocido, no (comportamiento de siempre). */
export const esPequena = (ancho: number | null, umbral: number) => ancho !== null && ancho < umbral;

/** El cuerpo tiene alguna marca de foto perdida. */
export const tieneFotosPerdidas = (cuerpoHtml: string) => /<span\b[^>]*\bclass="[^"]*\bimg-perdida\b/i.test(cuerpoHtml);

const CENTINELA = "\uE000";
const MARCA_PERDIDA = /<span\b[^>]*\bclass="[^"]*\bimg-perdida\b[^"]*"[^>]*>[^<]*<\/span>/gi;
// Elemento que solo contiene espacios, saltos de línea, un pie vacío o el rastro de una marca quitada.
const VACIO = /<(p|figure|figcaption|div|a|li|h[1-6]|strong|em|b|i|u|span|blockquote)\b[^>]*>((?:\s|&nbsp;|<br\s*\/?>|<figcaption\b[^>]*>(?:\s|&nbsp;)*<\/figcaption>|\uE000)*)<\/\1>/gi;

/**
 * Para la web pública: quita del HTML las marcas de foto perdida (el texto «Imagen no recuperada» no debe indexarse ni verse)
 * y los elementos que se quedan vacíos por ello (párrafo, pie, figura...), para no dejar huecos. No toca elementos que ya
 * estuvieran vacíos sin tener nada que ver con una marca. El editor del panel sigue viendo las marcas (esto solo se usa al construir).
 */
export function quitarMarcasPerdidas(cuerpoHtml: string): string {
  if (!MARCA_PERDIDA.test(cuerpoHtml)) return cuerpoHtml;
  MARCA_PERDIDA.lastIndex = 0;
  let html = cuerpoHtml.replace(MARCA_PERDIDA, CENTINELA);
  for (let previo = ""; previo !== html; ) {
    previo = html;
    html = html.replace(VACIO, (todo, _etiqueta, dentro: string) => (dentro.includes(CENTINELA) ? CENTINELA : todo));
  }
  return html.split(CENTINELA).join("");
}
