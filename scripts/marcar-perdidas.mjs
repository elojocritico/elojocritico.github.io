// Pone a cada «Imagen no recuperada» el nombre de la foto original: <span class="img-perdida" data-original="/wp-content/uploads/AAAA/MM/foto.jpg">.
// Así, cuando aparezca la foto, el editor sabe cuál es cuál. También guarda en cada artículo con marcas cuántas fotos faltan (fotosPendientes).
//
// Uso:  npx tsx scripts/marcar-perdidas.mjs [--real] [--simular] [--perdidas=RUTA.json] [--contenido=DIR] [--base=COMMIT] [--informe=RUTA.md]
//   (con tsx porque reutiliza el saneador de la web, src/lib/sanear.ts, el mismo que usa la exportación)
//   --base      lee el «cuerpo original» de los artículos del commit indicado (git show COMMIT:contenido/articulos/<slug>.json) en vez
//               de la carpeta contenido/ actual. Hay que usar 4b2ba1e (migración final = lo que tiene Firestore): la publicación
//               automática (d4e1e91) reescribió contenido/ con los cuerpos ya normalizados por el saneador.
//   --perdidas  informes/perdidas-por-articulo.json ({slug: [ruta, ...]}, en orden de aparición), lo genera la migración:
//               python -m eoc_migracion.perdidas --wayback ../wayback --informes ../informes
//   --simular   no escribe nada; solo calcula y cuenta (y escribe el informe).
// Sin simulador hay que añadir --real (y GOOGLE_APPLICATION_CREDENTIALS); si no, se niega a escribir.
//
// Reglas:
//  - Un artículo solo se toca si su cuerpo en Firestore es IGUAL (una vez pasado por el saneador, para que no importe la
//    normalización) al del original (nadie lo ha editado desde la importación) o ya es el resultado de este script. Si no, no se
//    cambia su cuerpo, sale en el informe, y aun así se le actualiza el contador fotosPendientes (dato interno: sin versión
//    ni «publicar pendiente», actualizadoPor intacto).
//  - Solo se anota si el número de marcas del cuerpo coincide con el de rutas de la migración; si no, se deja y sale en el informe.
//  - Idempotente: las marcas que ya llevan data-original no se tocan; una segunda pasada no escribe nada.
//  - Cada artículo cambiado deja una versión en su historial (como el panel) y se marca «publicar pendiente».
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getFirestore } from "firebase-admin/firestore";
import { getApp, deleteApp } from "firebase-admin/app";
import { resolverDestino } from "./destino-firebase.mjs";
import { iniciarAdmin } from "./crear-admin.mjs";
import { execFileSync } from "node:child_process";
import { cambiarCuerpos } from "./cambiar-cuerpo.mjs";
import { sanear } from "../src/lib/sanear.ts";

export const USUARIO = "script marcar-perdidas";
const AQUI = dirname(fileURLToPath(import.meta.url));

// Mismo criterio que rutaOriginalValida de src/lib/sanear.ts (el saneador descarta lo que no cumpla): relativa a /wp-content/, sin espacios ni «..».
const RUTA_VALIDA = /^\/wp-content\/[^\s"'<>\\\x00-\x1f\x7f]+$/;
export function rutaValida(r) {
  if (typeof r !== "string" || !RUTA_VALIDA.test(r) || r.includes("..")) return false;
  try {
    return !decodeURIComponent(r).includes("..");
  } catch {
    return false;
  }
}

// Apertura de una marca (class="img-perdida" en cualquier posición de atributos).
const MARCA = /<span\b[^>]*\bclass="img-perdida"[^>]*>/g;
const escapar = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function contarMarcas(html) {
  return (String(html).match(MARCA) ?? []).length;
}

/**
 * Añade data-original, en orden, a las marcas que no lo tienen.
 * Devuelve { html, marcas, anotadas, invalidas } o { html, marcas, desajuste: true } si el número de marcas no coincide con las rutas.
 */
export function anotarMarcas(html, rutas) {
  const marcas = contarMarcas(html);
  if (!Array.isArray(rutas) || marcas !== rutas.length) return { html, marcas, desajuste: true };
  let i = 0;
  let anotadas = 0;
  const invalidas = [];
  const salida = html.replace(MARCA, (apertura) => {
    const ruta = rutas[i++];
    if (/\bdata-original=/.test(apertura)) return apertura; // ya anotada: no se toca
    if (!rutaValida(ruta)) {
      invalidas.push(ruta);
      return apertura;
    }
    anotadas++;
    return apertura.replace('class="img-perdida"', `class="img-perdida" data-original="${escapar(ruta)}"`);
  });
  return { html: salida, marcas, anotadas, invalidas };
}

const leer = (f) => JSON.parse(readFileSync(f, "utf-8"));

/** Artículos de contenido/ con marcas «imagen no recuperada»: { slug: cuerpoHtml }. */
export function articulosConMarcas(dirContenido) {
  const dir = join(dirContenido, "articulos");
  const r = {};
  if (!existsSync(dir)) return r;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const a = leer(join(dir, f));
    if (contarMarcas(a.cuerpoHtml ?? "") > 0) r[a.slug ?? f.replace(/\.json$/, "")] = a.cuerpoHtml;
  }
  return r;
}

/** Igual que articulosConMarcas, pero leyendo los JSON de un commit de git (git show REF:./articulos/<slug>.json, con cwd = contenido/). */
export function articulosConMarcasDeGit(dirContenido, ref) {
  if (!/^[0-9A-Za-z._\/-]+$/.test(ref) || ref.startsWith("-")) throw new Error(`Commit no válido: ${ref}`);
  const git = (...args) => execFileSync("git", args, { cwd: dirContenido, encoding: "utf-8", maxBuffer: 1 << 28 });
  let ficheros;
  try {
    // Solo los ficheros que mencionan la marca (git grep es mucho más rápido que leerlos todos).
    ficheros = git("grep", "-l", "img-perdida", ref, "--", "articulos/").split(/\r?\n/).map((f) => f.trim().replace(/^.*?:articulos\//, "")).filter((f) => f.endsWith(".json"));
  } catch (e) {
    if (e?.status === 1) ficheros = []; // git grep sin resultados
    else throw new Error(`No puedo leer contenido/articulos del commit ${ref}: ${e?.message ?? e}`);
  }
  const r = {};
  for (const f of ficheros.sort()) {
    const a = JSON.parse(git("show", `${ref}:./articulos/${f}`));
    if (contarMarcas(a.cuerpoHtml ?? "") > 0) r[a.slug ?? f.replace(/\.json$/, "")] = a.cuerpoHtml;
  }
  return r;
}

export async function marcarPerdidas({ db = getFirestore(), dirContenido = resolve(AQUI, "..", "contenido"), base: baseRef, perdidas, usuario = USUARIO, simular = false, log = console.log } = {}) {
  const base = baseRef ? articulosConMarcasDeGit(dirContenido, baseRef) : articulosConMarcas(dirContenido); // lo importado
  const igual = (a, b) => sanear(a) === sanear(b); // sin importar la normalización del saneador
  const slugs = Object.keys(base);
  const informe = { desajustes: [], sinLista: [], invalidas: [], anotados: [], yaAnotados: 0, soloContador: [] };

  const decidir = (slug, doc) => {
    const original = base[slug];
    const rutas = perdidas[slug];
    const actual = String(doc.cuerpoHtml ?? "");
    const marcas = contarMarcas(actual);
    // Número de fotos que faltan (se mantiene aunque no se pueda anotar, y también en los artículos editados a mano).
    const extra = { fotosPendientes: marcas };
    const editado = { saltar: "editado desde la importación", extra };
    if (!rutas) {
      if (!igual(actual, original)) return editado;
      informe.sinLista.push(slug);
      return { extra };
    }
    const esperado = anotarMarcas(original, rutas);
    if (esperado.desajuste) {
      if (!igual(actual, original)) return editado;
      informe.desajustes.push({ slug, marcas: esperado.marcas, rutas: rutas.length });
      return { extra };
    }
    const yaAnotado = igual(actual, esperado.html);
    if (!yaAnotado && !igual(actual, original)) return editado;
    if (esperado.invalidas.length) informe.invalidas.push({ slug, rutas: esperado.invalidas });
    if (yaAnotado) {
      informe.yaAnotados++;
      return { extra };
    }
    // Se anota el cuerpo de Firestore (no el de referencia), para conservar su forma tal como está guardado.
    const nuevo = anotarMarcas(actual, rutas);
    return { cuerpoHtml: nuevo.html, extra: { fotosPendientes: nuevo.marcas } };
  };

  const r = await cambiarCuerpos(db, slugs, decidir, { usuario, simular });
  informe.anotados = r.cuerpoCambiado;
  informe.soloContador = r.soloDatos;
  const res = { revisados: slugs.length, ...informe, saltados: r.saltados, noExisten: r.noExisten, escrituras: r.escrituras, simulado: simular };
  log(
    `${res.revisados} artículos con marcas: ${res.anotados.length} anotados` + (simular ? " (simulado)" : "") +
      `, ${res.yaAnotados} ya estaban, ${res.desajustes.length} con número de marcas distinto (no se tocan), ` +
      `${res.saltados.length} editados desde la importación (no se tocan), ${res.noExisten.length} sin documento. Escrituras: ${res.escrituras}.`,
  );
  return res;
}

export function textoInforme(res) {
  const L = [];
  L.push("# Marcas con nombre de la foto original", "");
  L.push(`- Artículos con marcas revisados: ${res.revisados}${res.simulado ? " (SIMULACIÓN: no se escribió nada)" : ""}`);
  L.push(`- Anotados ahora (con versión en el historial y «publicar pendiente»): ${res.anotados.length}`);
  L.push(`- Ya estaban anotados: ${res.yaAnotados}`);
  L.push(`- Número de marcas distinto del de rutas de la migración (no se anotan): ${res.desajustes.length}`);
  L.push(`- Editados desde la importación (cuerpo intacto; solo se actualiza el contador): ${res.saltados.length}`);
  L.push(`- Sin documento en Firestore: ${res.noExisten.length}`);
  L.push(`- Con alguna ruta no válida (se deja esa marca sin nombre): ${res.invalidas.length}`);
  L.push(`- Con marcas pero sin lista de rutas: ${res.sinLista.length}`);
  L.push(`- Escrituras: ${res.escrituras}`, "");
  const bloque = (titulo, filas) => L.push(`## ${titulo}`, "", ...(filas.length ? filas : ["(ninguno)"]), "");
  bloque("No coincide el número de marcas (revisar a mano)", res.desajustes.map((d) => `- ${d.slug}: ${d.marcas} marcas en el cuerpo, ${d.rutas} rutas en la migración`));
  bloque("Editados desde la importación (no se tocan)", res.saltados.map((s) => `- ${s.slug}: ${s.motivo}`));
  bloque("Sin documento en Firestore", res.noExisten.map((s) => `- ${s}`));
  bloque("Rutas no válidas", res.invalidas.map((d) => `- ${d.slug}: ${d.rutas.join(", ")}`));
  bloque("Con marcas pero sin lista de rutas", res.sinLista.map((s) => `- ${s}`));
  return L.join("\n");
}

async function cerrar() {
  try { await deleteApp(getApp()); } catch {}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const destino = resolverDestino();
    console.log(destino.mensaje);
    const opcion = (n, defecto) => destino.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? defecto;
    const simular = destino.args.includes("--simular");
    const rutaPerdidas = resolve(opcion("perdidas", join(AQUI, "..", "..", "informes", "perdidas-por-articulo.json")));
    const rutaInforme = resolve(opcion("informe", join(AQUI, "..", "..", "informes", "marcar-perdidas.md")));
    const dirContenido = resolve(opcion("contenido", join(AQUI, "..", "contenido")));
    const base = opcion("base", undefined);
    if (!existsSync(rutaPerdidas)) throw new Error(`Falta ${rutaPerdidas}. Genéralo con: python -m eoc_migracion.perdidas (ver cabecera de este script).`);
    iniciarAdmin();
    const t = Date.now();
    const res = await marcarPerdidas({ dirContenido, base, perdidas: leer(rutaPerdidas), simular });
    mkdirSync(dirname(rutaInforme), { recursive: true });
    writeFileSync(rutaInforme, textoInforme(res), "utf-8");
    console.log(`Informe: ${rutaInforme}`);
    console.log(`✓ Hecho en ${((Date.now() - t) / 1000).toFixed(1)} s.`);
  } catch (e) {
    console.error("✗ No se han podido marcar las fotos perdidas:", e?.message ?? e);
    process.exitCode = 1;
  } finally {
    await cerrar();
  }
}
