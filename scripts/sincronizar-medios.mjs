// Sincroniza contenido/podcast.json (iVoox) y contenido/videos.json (YouTube).
// Nunca escribe si un feed falla; solo escribe lo que cambió. Imprime CAMBIOS=0|1.
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIvoox, parseYoutube, fusionar, escribirAtomico } from "./medios.mjs";

export const FEED_IVOOX = "https://feeds.ivoox.com/feed_fg_f127567_filtro_1.xml";
export const FEED_YOUTUBE = "https://www.youtube.com/feeds/videos.xml?channel_id=UCvXlGvuefNBjBN8c11_4BBQ";

const RAIZ_POR_DEFECTO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function descargar(url, { fetch: f, reintentos, retardoMs, timeoutMs }) {
  let ultimo;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const r = await f(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Mozilla/5.0 (sincronizador elojocritico.info)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      ultimo = e;
      if (intento < reintentos) await espera(retardoMs * (intento + 1));
    }
  }
  throw ultimo;
}

function leerExistentes(ruta) {
  if (!existsSync(ruta)) return [];
  const datos = JSON.parse(readFileSync(ruta, "utf8"));
  if (!Array.isArray(datos)) throw new Error("el fichero existente no es una lista");
  return datos;
}

async function sincronizarUno({ nombre, url, parse, archivo }, opciones, contenido) {
  const xml = await descargar(url, opciones);
  const nuevos = parse(xml);
  if (nuevos.length < 1) throw new Error("el feed no contiene ningún elemento válido");
  const ruta = join(contenido, archivo);
  const existentes = leerExistentes(ruta);
  const { lista, cambios } = fusionar(existentes, nuevos);
  if (cambios) escribirAtomico(ruta, lista);
  return { nombre, cambios, total: lista.length, anadidos: lista.length - existentes.length };
}

export async function main({ fetch: f = globalThis.fetch, raiz = RAIZ_POR_DEFECTO, reintentos = 2, retardoMs = 2000, timeoutMs = 30000 } = {}) {
  const opciones = { fetch: f, reintentos, retardoMs, timeoutMs };
  const contenido = join(raiz, "contenido");
  const feeds = [
    { nombre: "podcast", url: FEED_IVOOX, parse: parseIvoox, archivo: "podcast.json" },
    { nombre: "videos", url: FEED_YOUTUBE, parse: parseYoutube, archivo: "videos.json" },
  ];
  let fallos = 0;
  let hayCambios = false;
  for (const feed of feeds) {
    try {
      const r = await sincronizarUno(feed, opciones, contenido);
      hayCambios ||= r.cambios;
      console.log(`${r.nombre}: ${r.cambios ? "actualizado" : "sin novedades"} (${r.total} en total, ${r.anadidos} nuevos)`);
    } catch (e) {
      fallos++;
      console.error(`${feed.nombre}: FALLO, no se ha tocado nada (${e?.message ?? e})`);
    }
  }
  console.log(`CAMBIOS=${hayCambios ? 1 : 0}`);
  return { codigo: fallos > 0 ? 1 : 0, cambios: hayCambios };
}

const norm = (p) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
if (process.argv[1] && norm(process.argv[1]) === norm(fileURLToPath(import.meta.url))) {
  const { codigo } = await main();
  process.exitCode = codigo;
}
