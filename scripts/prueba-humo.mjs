// Prueba de humo tras desplegar en GitHub Pages: la portada, un artículo de esta compilación, /revista/ y /admin/ deben responder 200.
// GitHub Pages tarda un poco en propagar el despliegue, así que cada dirección se reintenta (por defecto 18 veces cada 10 s, unos 3 minutos).
// Si alguna sigue sin responder 200, sale con código 1 (el flujo falla y llega el correo de aviso). Se ejecuta DESPUÉS de confirmar la
// exportación: la web ya está desplegada y confirmar no depende de esta prueba.
//
// Uso:  node scripts/prueba-humo.mjs [dirección-base] [dist] [carpeta-de-artículos]
//       (por defecto: https://elojocritico.github.io/, dist y contenido/articulos)
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_POR_DEFECTO = "https://elojocritico.github.io/";
const RUTAS_FIJAS = ["/", "/revista/", "/admin/"];

/** Primer artículo (por orden alfabético) de contenido/articulos cuya página existe en dist/<dirección>/index.html, o null. */
export function articuloDePrueba(dist, dirArticulos) {
  if (!existsSync(dirArticulos)) return null;
  const slugs = readdirSync(dirArticulos).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  return slugs.find((s) => existsSync(join(dist, s, "index.html"))) ?? null;
}

/** Direcciones completas a comprobar: portada, un artículo, /revista/ y /admin/. */
export function urlsDePrueba(base, dist, dirArticulos) {
  const raiz = String(base || BASE_POR_DEFECTO).replace(/\/+$/, "");
  const rutas = [...RUTAS_FIJAS];
  const articulo = articuloDePrueba(dist, dirArticulos);
  if (articulo) rutas.splice(1, 0, `/${encodeURIComponent(articulo)}/`);
  return { urls: rutas.map((r) => raiz + r), hayArticulo: articulo !== null };
}

/**
 * Reintenta cada dirección hasta que dé 200. Devuelve la lista de las que no han llegado a dar 200 (vacía si todo va bien).
 * `traer` y `dormir` se pueden sustituir en las pruebas.
 */
export async function comprobarUrls(urls, { traer = globalThis.fetch, intentos = 18, esperaMs = 10_000, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log } = {}) {
  const pendientes = new Map(urls.map((u) => [u, "sin respuesta"]));
  for (let i = 1; i <= intentos && pendientes.size; i++) {
    for (const u of [...pendientes.keys()]) {
      try {
        const res = await traer(u, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
        if (res.status === 200) {
          pendientes.delete(u);
          log(`✓ ${u} responde 200 (intento ${i})`);
        } else pendientes.set(u, `HTTP ${res.status}`);
      } catch (e) {
        pendientes.set(u, e?.message ?? String(e));
      }
    }
    if (pendientes.size && i < intentos) await dormir(esperaMs);
  }
  return [...pendientes].map(([url, motivo]) => ({ url, motivo }));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [base, dist = "dist", dirArticulos = join("contenido", "articulos")] = process.argv.slice(2);
  const { urls, hayArticulo } = urlsDePrueba(base, dist, dirArticulos);
  if (!hayArticulo) console.log("::warning::No se ha encontrado ningún artículo compilado para la prueba de humo; se comprueba lo demás.");
  const fallos = await comprobarUrls(urls);
  if (fallos.length) {
    console.error("✗ La web desplegada no responde como debe:\n- " + fallos.map((f) => `${f.url} (${f.motivo})`).join("\n- "));
    process.exitCode = 1;
  } else console.log("✓ La web publicada responde.");
}
