// Comprobaciones antes de publicar. Si algo falla, sale con código 1 y NO se debe desplegar.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RESERVADOS = new Set(["articulos", "tema", "anio", "revista", "podcast", "videos", "que-es-eoc", "buscar",
  "img", "logo", "pagefind", "admin", "category", "feed", "wp-content", "404", "rss.xml"]);
const LIMITE_MB = 950;

function* ficheros(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* ficheros(p); else yield p;
  }
}

export function enlacesInternosRotos(dist) {
  const rotos = [];
  for (const f of ficheros(dist)) {
    if (!f.endsWith(".html")) continue;
    const html = readFileSync(f, "utf-8");
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/img/") || href.startsWith("/pagefind/")) continue;
      let ok = false;
      try {
        const ruta = decodeURIComponent(href.split(/[?#]/)[0]);
        const destino = join(dist, ruta);
        ok = ruta.endsWith("/") ? existsSync(join(destino, "index.html")) : existsSync(destino);
      } catch {
        ok = false; // enlace que no se puede decodificar: se da por roto
      }
      if (!ok) rotos.push(`${href} (en /${relative(dist, f).split(sep).join("/")})`);
    }
  }
  return [...new Set(rotos)];
}

const slugs = (contenido) => readdirSync(join(contenido, "articulos")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
export const paginasDeArticulosQueFaltan = (dist, contenido) => slugs(contenido).filter((s) => !existsSync(join(dist, s, "index.html")));
export const slugsReservados = (contenido) => slugs(contenido).filter((s) => RESERVADOS.has(s));

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
  const rotos = enlacesInternosRotos(dist);
  if (rotos.length) problemas.push(`Enlaces internos rotos (${rotos.length}):\n  ${rotos.slice(0, 50).join("\n  ")}`);
  const mb = tamanoMB(dist, ["img"]);
  if (mb > LIMITE_MB) problemas.push(`La web ocupa ${mb.toFixed(0)} MB (límite ${LIMITE_MB} MB)`);
  if (problemas.length) {
    console.error("✗ NO SE PUEDE PUBLICAR:\n- " + problemas.join("\n- "));
    process.exit(1);
  }
  console.log(`✓ Todo correcto · ${slugs(contenido).length} artículos · ${mb.toFixed(0)} MB sin imágenes`);
}
