// Pone en los artículos las fotos recuperadas: cambia una marca «Imagen no recuperada» concreta por su <img>.
// Lee informes/cambios-cuerpos.json (lo genera _scripts/fotos_revistas.py --aplicar):
//   [{ slug, buscar: "<span class=\"img-perdida\" data-original=\"...\">Imagen no recuperada</span>", poner: "<img ... />", motivo }]
//
// Uso:  npx tsx scripts/poner-fotos.mjs [--real] [--simular] [--cambios=RUTA.json] [--informe=RUTA.md]
//   Por defecto SIMULA (cuenta lo que haría y no escribe nada). Escribe con --real (proyecto real, hace falta
//   GOOGLE_APPLICATION_CREDENTIALS) o contra el simulador (FIRESTORE_EMULATOR_HOST) si no se pone --simular.
//
// Reglas:
//  - Solo se sustituye UNA aparición de la marca exacta por cada cambio (la primera que quede); si el cuerpo ya no la tiene
//    (foto ya puesta, o editada a mano) ese cambio no hace nada. Idempotente: la segunda pasada no escribe nada
//    (con la misma foto repetida k veces en un artículo se piden k <img> iguales; si ya hay k, está hecho).
//  - `buscar` debe ser una marca de foto perdida y `poner` una <img>; cualquier otra cosa se rechaza (no se aplica).
//  - Recalcula fotosPendientes (marcas que quedan en el cuerpo).
//  - Cada artículo cambiado deja una versión en el historial (como el panel) y se marca «publicar pendiente» (cambiar-cuerpo.mjs).
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getFirestore } from "firebase-admin/firestore";
import { getApp, deleteApp } from "firebase-admin/app";
import { resolverDestino } from "./destino-firebase.mjs";
import { iniciarAdmin } from "./crear-admin.mjs";
import { cambiarCuerpos } from "./cambiar-cuerpo.mjs";
import { contarMarcas } from "./marcar-perdidas.mjs";

export const USUARIO = "script poner-fotos";
const AQUI = dirname(fileURLToPath(import.meta.url));

const ES_MARCA = /^<span\b[^>]*\bclass="img-perdida"[^>]*>[^<]*<\/span>$/;
const ES_IMG = /^<img\b[^>]*\bsrc="[^"]+"[^>]*\/?>$/;

/** ¿El cambio es válido? Devuelve null o el motivo del rechazo. */
export function rechazo(c) {
  if (!c || typeof c.slug !== "string" || !c.slug) return "sin slug";
  if (typeof c.buscar !== "string" || !ES_MARCA.test(c.buscar)) return "«buscar» no es una marca de foto perdida";
  if (typeof c.poner !== "string" || !ES_IMG.test(c.poner)) return "«poner» no es una <img>";
  return null;
}

/** Sustituye la primera aparición de `buscar` por `poner`. Devuelve null si no está. */
export function sustituirUna(html, buscar, poner) {
  const i = html.indexOf(buscar);
  if (i < 0) return null;
  return html.slice(0, i) + poner + html.slice(i + buscar.length);
}

/**
 * @param db       Firestore (admin)
 * @param cambios  [{slug, buscar, poner, motivo}]
 * Devuelve { cambios, rechazados, aplicados (nº de marcas cambiadas), articulos (slugs cambiados), yaPuestos, noEncontrados, noExisten, escrituras, simulado }
 */
export async function ponerFotos({ db = getFirestore(), cambios, usuario = USUARIO, simular = true, log = console.log } = {}) {
  const porSlug = new Map();
  const rechazados = [];
  for (const c of cambios) {
    const r = rechazo(c);
    if (r) {
      rechazados.push({ slug: c?.slug, motivo: r });
      continue;
    }
    if (!porSlug.has(c.slug)) porSlug.set(c.slug, []);
    porSlug.get(c.slug).push(c);
  }
  const informe = { aplicados: 0, yaPuestos: [], noEncontrados: [] };

  const cuantas = (h, t) => h.split(t).length - 1;

  const decidir = (slug, doc) => {
    let cuerpo = String(doc.cuerpoHtml ?? "");
    let n = 0;
    // Cambios idénticos (la misma foto dos veces en el artículo) se agrupan: el grupo pide k fotos puestas. Si ya hay k o más
    // <img> iguales, está hecho (así una segunda pasada no vuelve a cambiar la marca repetida que quedara).
    const grupos = new Map();
    for (const c of porSlug.get(slug)) {
      const k = c.buscar + "\n" + c.poner;
      if (!grupos.has(k)) grupos.set(k, { c, k: 0 });
      grupos.get(k).k++;
    }
    for (const { c, k } of grupos.values()) {
      const faltan = k - cuantas(cuerpo, c.poner);
      if (faltan <= 0) {
        informe.yaPuestos.push({ slug, buscar: c.buscar });
        continue;
      }
      let puestas = 0;
      for (let i = 0; i < faltan; i++) {
        const nuevo = sustituirUna(cuerpo, c.buscar, c.poner);
        if (nuevo === null) break;
        cuerpo = nuevo;
        puestas++;
      }
      if (puestas === 0) informe.noEncontrados.push({ slug, buscar: c.buscar });
      n += puestas;
    }
    if (n === 0) return null;
    informe.aplicados += n;
    return { cuerpoHtml: cuerpo, extra: { fotosPendientes: contarMarcas(cuerpo) } };
  };

  const r = await cambiarCuerpos(db, [...porSlug.keys()], decidir, { usuario, simular });
  const res = { cambios: cambios.length, rechazados, ...informe, articulos: r.cuerpoCambiado, noExisten: r.noExisten, saltados: r.saltados, escrituras: r.escrituras, simulado: simular };
  log(
    `${res.cambios} cambios en ${porSlug.size} artículos: ${res.aplicados} marcas cambiadas en ${res.articulos.length} artículos` + (simular ? " (simulado)" : "") +
      `, ${res.yaPuestos.length} ya puestas, ${res.noEncontrados.length} sin su marca (no se tocan), ${res.rechazados.length} rechazados, ${res.noExisten.length} sin documento. Escrituras: ${res.escrituras}.`,
  );
  return res;
}

export function textoInforme(res) {
  const L = ["# Fotos puestas en los artículos", ""];
  L.push(`- Cambios pedidos: ${res.cambios}${res.simulado ? " (SIMULACIÓN: no se escribió nada)" : ""}`);
  L.push(`- Marcas cambiadas por su foto: ${res.aplicados} en ${res.articulos.length} artículos`);
  L.push(`- Ya estaban puestas: ${res.yaPuestos.length}`);
  L.push(`- La marca ya no está en el cuerpo (editado a mano; no se toca): ${res.noEncontrados.length}`);
  L.push(`- Rechazados por formato: ${res.rechazados.length}`);
  L.push(`- Artículos que no existen: ${res.noExisten.length}`);
  L.push(`- Escrituras: ${res.escrituras}`, "");
  const bloque = (t, filas) => L.push(`## ${t}`, "", ...(filas.length ? filas : ["(ninguno)"]), "");
  bloque("Sin su marca", res.noEncontrados.map((x) => `- ${x.slug}: ${x.buscar}`));
  bloque("Rechazados", res.rechazados.map((x) => `- ${x.slug}: ${x.motivo}`));
  bloque("Sin documento", res.noExisten.map((s) => `- ${s}`));
  return L.join("\n");
}

async function cerrar() {
  try {
    await deleteApp(getApp());
  } catch {}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const argv = process.argv.slice(2);
    const emulador = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
    // Sin --real y sin simulador: se lee el proyecto real pero SOLO se simula (nunca escribe).
    const destino = resolverDestino(!emulador && !argv.includes("--real") ? [...argv, "--real"] : argv);
    const simular = argv.includes("--simular") || (!emulador && !argv.includes("--real"));
    console.log(destino.mensaje + (simular ? " — SIMULACIÓN (no escribe)" : " — ESCRIBE"));
    const opcion = (n, defecto) => destino.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? defecto;
    const rutaCambios = resolve(opcion("cambios", join(AQUI, "..", "..", "informes", "cambios-cuerpos.json")));
    const rutaInforme = resolve(opcion("informe", join(AQUI, "..", "..", "informes", "poner-fotos.md")));
    if (!existsSync(rutaCambios)) throw new Error(`Falta ${rutaCambios}. Genéralo con: python -X utf8 _scripts/fotos_revistas.py --aplicar`);
    iniciarAdmin();
    const t = Date.now();
    const res = await ponerFotos({ cambios: JSON.parse(readFileSync(rutaCambios, "utf-8")), simular });
    mkdirSync(dirname(rutaInforme), { recursive: true });
    writeFileSync(rutaInforme, textoInforme(res), "utf-8");
    console.log(`Informe: ${rutaInforme}`);
    console.log(`✓ Hecho en ${((Date.now() - t) / 1000).toFixed(1)} s.`);
  } catch (e) {
    console.error("✗ No se han podido poner las fotos:", e?.message ?? e);
    process.exitCode = 1;
  } finally {
    await cerrar();
  }
}
