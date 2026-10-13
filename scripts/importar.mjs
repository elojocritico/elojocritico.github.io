// Importa el contenido migrado (contenido/) a Firestore. Idempotente: no reescribe lo que ya es igual.
// Uso:  node scripts/importar.mjs [directorio-contenido]
// Simulador: define FIRESTORE_EMULATOR_HOST (y GCLOUD_PROJECT). Proyecto real: GOOGLE_APPLICATION_CREDENTIALS.
// Sin simulador hay que añadir --real (y GOOGLE_APPLICATION_CREDENTIALS); si no, se niega a escribir.
// RESERVADO: el valor "migración" en actualizadoPor es solo de este script. El panel NUNCA debe escribirlo
// (el editor de artículos debe imponerlo): con él el importador se creería dueño del artículo y lo pisaría.
// Los comentarios del archivo NO se importan (siguen en el repositorio).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getFirestore } from "firebase-admin/firestore";
import { resolverDestino } from "./destino-firebase.mjs";
import { mediodiaMadridUtc } from "../src/lib/madrid.js";
import { iniciarAdmin, AJUSTES_POR_DEFECTO, ESTADO_POR_DEFECTO } from "./crear-admin.mjs";

const LOTE = 400;
const MIGRACION = "migración";

// Serialización estable (claves ordenadas) para comparar sin depender del orden.
export function estable(v) {
  if (Array.isArray(v)) return "[" + v.map(estable).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + estable(v[k])).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

export function docArticulo(a) {
  // Mediodía de España de ese día, en UTC ("...Z") con el desfase correcto (invierno +1, verano +2).
  const iso = mediodiaMadridUtc(a.fecha);
  if (!iso) throw new Error(`Fecha no válida en el artículo ${a.slug}: ${a.fecha}`);
  return {
    slug: a.slug, titulo: a.titulo ?? "", subtitulo: a.subtitulo ?? "", cuerpoHtml: a.cuerpoHtml ?? "", extracto: a.extracto ?? "",
    portada: a.portada ?? null, autor: a.autor ?? "", secciones: a.secciones ?? [], etiquetas: a.etiquetas ?? [],
    estado: "publicado", fechaPublicacion: iso, destacado: !!a.destacado,
    creadoEn: iso, actualizadoEn: iso, actualizadoPor: MIGRACION, enPapeleraDesde: null, origen: a.origen ?? null,
  };
}

const leer = (f) => JSON.parse(readFileSync(f, "utf-8"));

export async function importar({ db = getFirestore(), dirContenido = resolve(dirname(fileURLToPath(import.meta.url)), "..", "contenido"), log = console.log } = {}) {
  const dirArt = join(dirContenido, "articulos");
  const ficheros = existsSync(dirArt) ? readdirSync(dirArt).filter((f) => f.endsWith(".json")).sort() : [];
  const nuevos = ficheros.map((f) => docArticulo(leer(join(dirArt, f))));
  const r = { total: nuevos.length, creados: 0, actualizados: 0, sinCambios: 0, editadosEnPanel: 0 };
  let escrituras = 0;
  let lote = db.batch();
  let enLote = 0;
  const escribir = async (ref, datos, opciones) => {
    if (opciones) lote.set(ref, datos, opciones);
    else lote.set(ref, datos);
    escrituras++;
    if (++enLote >= LOTE) {
      await lote.commit();
      lote = db.batch();
      enLote = 0;
    }
  };

  for (let i = 0; i < nuevos.length; i += 300) {
    const trozo = nuevos.slice(i, i + 300);
    const refs = trozo.map((d) => db.collection("articulos").doc(d.slug));
    const existentes = await db.getAll(...refs);
    for (let j = 0; j < trozo.length; j++) {
      const snap = existentes[j];
      if (!snap.exists) {
        r.creados++;
        await escribir(refs[j], trozo[j]);
        continue;
      }
      const actual = snap.data();
      if (actual.actualizadoPor !== MIGRACION) {
        r.editadosEnPanel++;
        continue;
      }
      const propios = Object.fromEntries(Object.keys(trozo[j]).map((k) => [k, actual[k]]));
      if (estable(propios) === estable(trozo[j])) {
        r.sinCambios++;
        continue;
      }
      r.actualizados++;
      await escribir(refs[j], trozo[j], { merge: true });
    }
  }

  // Ajustes: solo se rellena lo que falta; después manda el panel. Nunca se toca "usuarios".
  const ajustesJson = existsSync(join(dirContenido, "ajustes.json")) ? leer(join(dirContenido, "ajustes.json")) : {};
  const quePath = join(dirContenido, "paginas", "que-es-eoc.json");
  const queEsEoc = existsSync(quePath) ? leer(quePath) : null;
  const deseados = {};
  for (const k of ["destacado", "enlaces", "adsense"]) if (ajustesJson[k] !== undefined) deseados[k] = ajustesJson[k];
  if (queEsEoc) deseados.queEsEoc = { titulo: queEsEoc.titulo ?? "", cuerpoHtml: queEsEoc.cuerpoHtml ?? "" };
  const refAj = db.doc("ajustes/global");
  const actAj = await refAj.get();
  const faltan = {};
  const base = actAj.exists ? actAj.data() : {};
  for (const [k, v] of Object.entries({ ...AJUSTES_POR_DEFECTO, ...deseados })) if (base[k] === undefined) faltan[k] = v;
  if (!actAj.exists) await escribir(refAj, { ...faltan, usuarios: {} });
  else if (Object.keys(faltan).length) await escribir(refAj, faltan, { merge: true });

  const refEst = db.doc("estado/sistema");
  if (!(await refEst.get()).exists) await escribir(refEst, ESTADO_POR_DEFECTO);

  if (enLote) await lote.commit();
  log(
    `${r.total} artículos: ${r.creados} creados, ${r.actualizados} actualizados, ${r.sinCambios} sin cambios` +
      (r.editadosEnPanel ? `, ${r.editadosEnPanel} editado(s) en el panel, no se toca` : ""),
  );
  log(`Ajustes: ${Object.keys(faltan).length ? "completados (" + Object.keys(faltan).join(", ") + ")" : "sin cambios"}. Escrituras totales: ${escrituras}.`);
  return { articulos: r, escrituras, ajustes: faltan };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const destino = resolverDestino();
    console.log(destino.mensaje);
    iniciarAdmin();
    const t = Date.now();
    await importar({ dirContenido: destino.args[0] ? resolve(destino.args[0]) : undefined });
    console.log(`✓ Hecho en ${((Date.now() - t) / 1000).toFixed(1)} s.`);
  } catch (e) {
    console.error("✗ No se ha podido importar:", e?.message ?? e);
    process.exit(1);
  }
}
