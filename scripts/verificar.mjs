// Comprobaciones antes de publicar. Si algo falla, sale con código 1 y NO se debe desplegar.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RESERVADOS = new Set(["articulos", "tema", "anio", "revista", "podcast", "videos", "que-es-eoc", "buscar",
  "img", "logo", "pagefind", "admin", "comentarios-archivo", "category", "feed", "wp-content", "404", "rss.xml"]);
const LIMITE_MB = 950;

function* ficheros(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* ficheros(p); else yield p;
  }
}

const INICIO_CUERPO = /<div\b[^>]*\sdata-cuerpo(?=[\s=>/])[^>]*>/g;

/**
 * Separa el HTML de una página en el texto de los cuerpos de artículo (contenedores con data-cuerpo) y el resto.
 * Si un contenedor no cierra bien, no se aparta nada de él (así un fallo de plantilla nunca se esconde como aviso).
 */
export function separarCuerpos(html) {
  const cuerpos = [];
  let resto = "", desde = 0;
  INICIO_CUERPO.lastIndex = 0;
  let m;
  while ((m = INICIO_CUERPO.exec(html))) {
    const ini = m.index + m[0].length;
    let prof = 1, fin = -1;
    const marcas = /<(\/?)div\b[^>]*>/g;
    marcas.lastIndex = ini;
    for (let t; (t = marcas.exec(html)); ) {
      prof += t[1] ? -1 : 1;
      if (prof === 0) { fin = t.index; break; }
    }
    if (fin < 0) continue;
    resto += html.slice(desde, ini);
    cuerpos.push(html.slice(ini, fin));
    desde = fin;
    INICIO_CUERPO.lastIndex = fin;
  }
  return { cuerpos, resto: resto + html.slice(desde) };
}

function enlaceRoto(dist, href) {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/img/") || href.startsWith("/pagefind/")) return false;
  try {
    const ruta = decodeURIComponent(href.split(/[?#]/)[0]);
    const destino = join(dist, ruta);
    return !(ruta.endsWith("/") ? existsSync(join(destino, "index.html")) : existsSync(destino));
  } catch {
    return true; // enlace que no se puede decodificar: se da por roto
  }
}

/**
 * Enlaces internos rotos. Los de dentro del cuerpo de un artículo (texto de la web antigua) son avisos: no impiden publicar.
 * Los de plantillas, menús y listados son errores.
 */
export function revisarEnlaces(dist) {
  const errores = [], avisos = [];
  for (const f of ficheros(dist)) {
    if (!f.endsWith(".html")) continue;
    const donde = "/" + relative(dist, f).split(sep).join("/");
    const { cuerpos, resto } = separarCuerpos(readFileSync(f, "utf-8"));
    for (const [lista, texto] of [[errores, resto], [avisos, cuerpos.join("\n")]]) {
      for (const [, href] of texto.matchAll(/href="([^"]+)"/g)) if (enlaceRoto(dist, href)) lista.push(`${href} (en ${donde})`);
    }
  }
  return { errores: [...new Set(errores)], avisos: [...new Set(avisos)] };
}

export const enlacesInternosRotos = (dist) => revisarEnlaces(dist).errores;

const slugs = (contenido) => readdirSync(join(contenido, "articulos")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
export const paginasDeArticulosQueFaltan = (dist, contenido) => slugs(contenido).filter((s) => !existsSync(join(dist, s, "index.html")));
export const slugsReservados = (contenido) => slugs(contenido).filter((s) => RESERVADOS.has(s));

/** Umbral de bajada: falla si hay más de un 5 % menos de artículos que en la versión publicada. Sin dato publicado, no se aplica. */
export function bajadaDeArticulos(actual, publicados, maxPorcentaje = 5) {
  const p = Number(publicados);
  if (publicados === undefined || publicados === "" || !Number.isFinite(p) || p <= 0) return null;
  if (actual >= p * (1 - maxPorcentaje / 100)) return null;
  return `Hay ${actual} artículos y la versión publicada tiene ${p}: bajan más de un ${maxPorcentaje} %. Si es a propósito (por ejemplo, se han enviado muchos artículos a la papelera), ejecuta Publicar a mano marcando aceptar_bajada (mira MANUAL.md).`;
}

export function tamanoMB(dir, excluir) {
  let total = 0;
  for (const f of ficheros(dir)) {
    const rel = relative(dir, f).split(sep);
    if (excluir.includes(rel[0])) continue;
    total += statSync(f).size;
  }
  return total / 1024 / 1024;
}

function esProgramaPrincipal() {
  let a = resolve(process.argv[1] ?? "");
  let b = resolve(fileURLToPath(import.meta.url));
  if (process.platform === "win32") { a = a.toLowerCase(); b = b.toLowerCase(); }
  return a === b;
}

if (esProgramaPrincipal()) {
  const dist = "dist", contenido = "contenido";
  const problemas = [];
  const reservados = slugsReservados(contenido);
  if (reservados.length) problemas.push(`Artículos con nombre reservado: ${reservados.join(", ")}`);
  const faltan = paginasDeArticulosQueFaltan(dist, contenido);
  if (faltan.length) problemas.push(`Artículos sin página (${faltan.length}): ${faltan.slice(0, 20).join(", ")}`);
  const { errores: rotos, avisos } = revisarEnlaces(dist);
  if (avisos.length) console.log(`AVISO: ${avisos.length} enlaces internos rotos dentro del texto de artículos (no impiden publicar):\n  ${avisos.slice(0, 50).join("\n  ")}`);
  if (rotos.length) problemas.push(`Enlaces internos rotos (${rotos.length}):\n  ${rotos.slice(0, 50).join("\n  ")}`);
  const bajada = bajadaDeArticulos(slugs(contenido).length, process.env.EOC_ARTICULOS_PUBLICADOS);
  if (bajada) problemas.push(bajada);
  const mb = tamanoMB(dist, ["img"]);
  if (mb > LIMITE_MB) problemas.push(`La web ocupa ${mb.toFixed(0)} MB (límite ${LIMITE_MB} MB)`);
  if (problemas.length) {
    console.error("✗ NO SE PUEDE PUBLICAR:\n- " + problemas.join("\n- "));
    process.exit(1);
  }
  console.log(`✓ Todo correcto · ${slugs(contenido).length} artículos · ${mb.toFixed(0)} MB sin imágenes`);
}
