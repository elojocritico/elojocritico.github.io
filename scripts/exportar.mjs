// Exportador: lleva lo publicado en Firestore a contenido/ (de donde se genera la web) y las fotos nuevas a imagenes/.
//
// Uso:  npm run exportar                 (incremental: solo lo cambiado desde la última exportación)
//       npm run exportar -- --completo   (todo; sirve de copia de seguridad)
// Simulador: define FIRESTORE_EMULATOR_HOST (y GCLOUD_PROJECT). Proyecto real: --real y GOOGLE_APPLICATION_CREDENTIALS.
// Variables: EOC_CONTENIDO (por defecto ./contenido), EOC_IMAGENES (por defecto ../imagenes).
// Se ejecuta con tsx porque reutiliza el saneador de la web (src/lib/sanear.ts): lo que ve el editor en la vista previa es lo que se publica.
//
// Garantías:
//  - Primero lee todo y lo prepara en memoria; si Firestore falla, no se toca contenido/ y se sale con código 1.
//  - Cada fichero se escribe entero (fichero temporal + renombrar).
//  - estado/sistema.ultimaExportacion solo avanza si todo ha ido bien.
//  - Solo se escribe o borra para direcciones de artículos que existen en Firestore y que son seguras como nombre de fichero.
//  - Salida: una línea CAMBIOS=1 si hay algo nuevo que subir al repositorio, o CAMBIOS=0.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import { resolverDestino } from "./destino-firebase.mjs";
import { iniciarAdmin } from "./crear-admin.mjs";
import { estable } from "./importar.mjs";
import { sanear } from "../src/lib/sanear.ts";
import { esBloque, esCliente, esUrlWeb } from "../src/lib/validacion.ts";
import { ArticuloZ } from "../src/lib/contenido.ts";
import { RESERVADAS } from "../src/admin/utiles/direccion.ts";
import { utcAMadrid } from "../src/lib/madrid.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const LOTE = 400;
const DIAS_PAPELERA = 30;
const PROGRAMADA = "publicación programada";
const MAX_IMAGEN = 30 * 1024 * 1024;
const CLOUDINARY = /^(?:https:)?\/\/res\.cloudinary\.com\//i;

/** Dirección usable como nombre de fichero (y válida para la web). */
export function slugSeguro(s) {
  // eslint-disable-next-line no-control-regex
  return typeof s === "string" && /^[^/\\]{1,200}$/.test(s) && !s.includes("..") && !/[\x00-\x1f]/.test(s) && /^[^/\s]+$/.test(s);
}
const json = (v) => JSON.stringify(v, null, 2).replace(/\n/g, "\r\n"); // igual que los ficheros de la migración
const iso = (v) => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : typeof v === "string" ? v : "");
const esTexto = (v) => typeof v === "string";
const leerJson = (f) => JSON.parse(readFileSync(f, "utf-8"));

function mismoJson(ruta, texto) {
  if (!existsSync(ruta)) return false;
  try {
    return estable(leerJson(ruta)) === estable(JSON.parse(texto));
  } catch {
    return false;
  }
}
function escribirAtomico(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp-${process.pid}`;
  writeFileSync(tmp, datos);
  renameSync(tmp, ruta);
}

/** ¿Debe estar en la web? Publicado, o programado cuya fecha ya ha llegado. */
export function debePublicarse(d, ahoraMs) {
  if (d?.estado === "publicado") return true;
  if (d?.estado !== "programado") return false;
  const t = Date.parse(d.fechaPublicacion ?? "");
  return !isNaN(t) && t <= ahoraMs;
}

const limpiarNombre = (nombre) =>
  nombre.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "imagen";

export async function exportar({
  db = getFirestore(), dirContenido = process.env.EOC_CONTENIDO ?? resolve(AQUI, "..", "contenido"),
  dirImagenes = process.env.EOC_IMAGENES ?? resolve(AQUI, "..", "..", "imagenes"),
  completo = false, ahora = new Date(), traer = globalThis.fetch, log = console.log,
} = {}) {
  const inicio = ahora.toISOString();
  const ahoraMs = ahora.getTime();
  const avisos = [];
  const aviso = (m) => avisos.push(m);
  const ruta = (...p) => join(dirContenido, ...p);

  // ---------------------------------------------------------------------------------------------------------
  // 1. Lectura de Firestore (nada se escribe todavía en contenido/)
  const estadoSnap = await db.doc("estado/sistema").get();
  const estadoInicial = estadoSnap.exists ? estadoSnap.data() : {};
  const ultima = esTexto(estadoInicial.ultimaExportacion) && !isNaN(Date.parse(estadoInicial.ultimaExportacion)) ? estadoInicial.ultimaExportacion : null;
  const todo = completo || !ultima;

  /** @type {Map<string, any>} */
  const articulos = new Map();
  if (todo) {
    (await db.collection("articulos").get()).forEach((s) => articulos.set(s.id, s.data()));
  } else {
    const [cambiados, programados] = await Promise.all([
      db.collection("articulos").where("actualizadoEn", ">", ultima).get(),
      db.collection("articulos").where("estado", "==", "programado").get(),
    ]);
    cambiados.forEach((s) => articulos.set(s.id, s.data()));
    programados.forEach((s) => articulos.set(s.id, s.data()));
  }
  const papelera = await db.collection("articulos").where("estado", "==", "papelera").select("enPapeleraDesde", "estado").get();
  const [aprobados, ocultosSnap, ajustesSnap, indiceSnap] = await Promise.all([
    db.collection("comentarios").where("estado", "==", "aprobado").get(),
    db.collection("archivoOcultos").get(),
    db.doc("ajustes/global").get(),
    db.doc("indices/titulos").get(),
  ]);

  // Programados vencidos: pasan a "publicado" (con versión), en una transacción, como cualquier otro cambio hecho por una persona.
  for (const [id, d] of [...articulos]) {
    if (d.estado === "programado" && debePublicarse(d, ahoraMs)) {
      const ref = db.collection("articulos").doc(id);
      const nuevo = await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) return null;
        const actual = s.data();
        if (actual.estado !== "programado" || !debePublicarse(actual, ahoraMs)) return actual;
        tx.set(ref.collection("versiones").doc(), { ...actual, guardadoEn: inicio, guardadoPor: PROGRAMADA });
        tx.update(ref, { estado: "publicado", actualizadoEn: inicio, actualizadoPor: PROGRAMADA });
        return { ...actual, estado: "publicado", actualizadoEn: inicio, actualizadoPor: PROGRAMADA };
      });
      if (nuevo) articulos.set(id, nuevo);
      else articulos.delete(id);
    } else if (d.estado === "programado" && isNaN(Date.parse(d.fechaPublicacion ?? ""))) {
      aviso(`El artículo "${id}" está programado con una fecha no válida; no se publica.`);
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // 2. Preparación en memoria
  const textos = new Map(); // ruta -> contenido (texto) que hay que escribir
  const borrar = new Set(); // rutas que hay que borrar
  const imagenes = new Map(); // ruta -> Buffer
  const resumen = { publicados: 0, retirados: 0, comentarios: 0, imagenes: 0 };

  const preparar = (rutaFichero, objeto) => {
    const t = json(objeto);
    if (!mismoJson(rutaFichero, t)) textos.set(rutaFichero, t);
  };
  const quitar = (rutaFichero) => {
    if (existsSync(rutaFichero)) borrar.add(rutaFichero);
  };

  // --- Fotos de Cloudinary -> imagenes/AAAA/MM/*.webp
  const rutaManifiesto = ruta("imagenes-cloudinary.json");
  const manifiesto = existsSync(rutaManifiesto) ? leerJson(rutaManifiesto) : {};
  const manifiestoNuevo = { ...manifiesto };
  const reservados = new Map(); // ruta de imagen (/img/...) -> url que la usa en esta ejecución
  const hechas = new Map(); // url -> resultado
  const rutaImagen = (src) => join(dirImagenes, ...src.replace(/^\/img\//, "").split("/"));

  async function convertirCloudinary(url, fecha) {
    const limpia = url.replace(/&amp;/g, "&");
    const completa = limpia.startsWith("//") ? "https:" + limpia : limpia;
    if (hechas.has(completa)) return hechas.get(completa);
    const previo = manifiesto[completa];
    if (previo && existsSync(rutaImagen(previo.src)) && existsSync(rutaImagen(previo.tarjeta))) {
      hechas.set(completa, previo);
      return previo;
    }
    let respuesta;
    try {
      respuesta = await traer(completa);
    } catch (e) {
      throw new Error(`No se ha podido descargar la foto ${completa}: ${e?.message ?? e}`);
    }
    if (!respuesta?.ok) throw new Error(`No se ha podido descargar la foto ${completa} (respuesta ${respuesta?.status}).`);
    const tipo = respuesta.headers?.get?.("content-type") ?? "";
    if (tipo && !/^image\//i.test(tipo)) throw new Error(`La dirección ${completa} no es una foto (${tipo}).`);
    const datos = Buffer.from(await respuesta.arrayBuffer());
    if (datos.length > MAX_IMAGEN) throw new Error(`La foto ${completa} es demasiado grande.`);
    let src, tarjeta;
    if (previo) ({ src, tarjeta } = previo); // mismos nombres que la vez anterior (faltaba el fichero)
    else {
      const [anio, mes] = /^\d{4}-\d{2}/.test(fecha) ? fecha.split("-") : ["varios", "00"];
      let ultimoSegmento = "";
      try {
        ultimoSegmento = decodeURIComponent(new URL(completa).pathname.split("/").filter(Boolean).pop() ?? "");
      } catch {
        ultimoSegmento = "";
      }
      const base = limpiarNombre(ultimoSegmento.replace(/\.[A-Za-z0-9]+$/, ""));
      const prefijo = `/img/${anio}/${mes}/`;
      const ocupada = (p) => (reservados.has(p) ? reservados.get(p) !== completa : existsSync(rutaImagen(p)));
      for (let n = 1; ; n++) {
        const nombre = n === 1 ? base : `${base}-${n}`;
        const a = `${prefijo}${nombre}.webp`, b = `${prefijo}${nombre}-640.webp`;
        if (!ocupada(a) && !ocupada(b)) {
          src = a;
          tarjeta = b;
          break;
        }
      }
    }
    let grande, pequena;
    try {
      grande = await sharp(datos).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
      pequena = await sharp(datos).rotate().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    } catch (e) {
      throw new Error(`No se ha podido leer la foto ${completa}: ${e?.message ?? e}`);
    }
    reservados.set(src, completa);
    reservados.set(tarjeta, completa);
    imagenes.set(rutaImagen(src), grande.data);
    imagenes.set(rutaImagen(tarjeta), pequena);
    const r = { src, tarjeta, ancho: grande.info.width, alto: grande.info.height };
    manifiestoNuevo[completa] = r;
    hechas.set(completa, r);
    resumen.imagenes++;
    return r;
  }

  const publicadosAhora = new Set();
  const retirar = [];
  for (const [id, d] of articulos) {
    if (!slugSeguro(id)) {
      aviso(`Se ignora el artículo con dirección no válida: ${JSON.stringify(id)}`);
      continue;
    }
    const fichero = ruta("articulos", `${id}.json`);
    if (!debePublicarse(d, ahoraMs)) {
      retirar.push(id);
      continue;
    }
    if (RESERVADAS.includes(id)) {
      aviso(`El artículo "${id}" usa una dirección reservada para la web; no se publica.`);
      continue;
    }
    const fecha = utcAMadrid(d.fechaPublicacion).slice(0, 10);
    if (!fecha) {
      aviso(`El artículo "${id}" no tiene una fecha de publicación válida; no se publica.`);
      continue;
    }
    const existente = existsSync(fichero) ? leerJson(fichero) : {};
    // Cuerpo: se sanea (script, onerror, javascript:...) y las fotos de Cloudinary se bajan a imagenes/.
    let cuerpo = esTexto(d.cuerpoHtml) ? d.cuerpoHtml : "";
    const conDatos = (cuerpo.match(/<img\b[^>]*\ssrc\s*=\s*["']?\s*data:/gi) ?? []).length;
    if (conDatos) aviso(`El artículo "${id}" tenía ${conDatos} foto(s) sin subir (pegadas desde otro sitio); se han quitado. Hay que volver a subirlas.`);
    cuerpo = sanear(cuerpo);
    const reemplazos = new Map();
    for (const tag of new Set(cuerpo.match(/<img\b[^>]*>/gi) ?? [])) {
      const m = /\ssrc="([^"]*)"/.exec(tag);
      if (!m || !CLOUDINARY.test(m[1])) continue;
      const r = await convertirCloudinary(m[1], fecha);
      const sinMedidas = tag.replace(/\s(?:width|height)="[^"]*"/gi, "");
      reemplazos.set(tag, sinMedidas.replace(/\ssrc="[^"]*"/, ` src="${r.src}" width="${r.ancho}" height="${r.alto}"`));
    }
    for (const [de, a] of reemplazos) cuerpo = cuerpo.split(de).join(a);

    // Portada
    let portada = null;
    const p = d.portada;
    if (p && typeof p === "object" && esTexto(p.src) && p.src) {
      const alt = esTexto(p.alt) ? p.alt : "";
      if (/^\s*data:/i.test(p.src)) aviso(`La portada del artículo "${id}" era una foto sin subir; se ha quitado. Hay que volver a subirla.`);
      else if (CLOUDINARY.test(p.src)) {
        const r = await convertirCloudinary(p.src, fecha);
        portada = { src: r.src, tarjeta: r.tarjeta, alt };
      } else if (/^(?:\/(?!\/)|https?:\/\/)/i.test(p.src)) {
        const tarjetaOk = esTexto(p.tarjeta) && /^(?:\/(?!\/)|https?:\/\/)/i.test(p.tarjeta) && !CLOUDINARY.test(p.tarjeta);
        portada = { src: p.src, tarjeta: tarjetaOk ? p.tarjeta : p.src, alt };
      } else aviso(`La portada del artículo "${id}" tiene una dirección no admitida; se ha quitado.`);
    }

    const salida = {
      slug: id,
      titulo: esTexto(d.titulo) ? d.titulo.trim() : "",
      subtitulo: esTexto(d.subtitulo) ? d.subtitulo : "",
      fecha,
      autor: esTexto(d.autor) && d.autor.trim() ? d.autor : "El Ojo Crítico",
      secciones: Array.isArray(d.secciones) ? d.secciones.filter(esTexto) : [],
      etiquetas: Array.isArray(d.etiquetas) ? d.etiquetas.filter(esTexto) : [],
      portada,
      extracto: esTexto(d.extracto) ? d.extracto : "",
      cuerpoHtml: cuerpo,
      destacado: d.destacado === true,
      origen: (esTexto(d.origen) && d.origen) || (esTexto(existente.origen) && existente.origen) || "",
    };
    const valido = ArticuloZ.safeParse(salida);
    if (!valido.success) {
      aviso(`El artículo "${id}" no es válido para la web (${valido.error.issues[0]?.message ?? "datos incorrectos"}); no se publica.`);
      continue;
    }
    if (Array.isArray(existente.enlacesExternos)) salida.enlacesExternos = existente.enlacesExternos; // dato de la migración
    publicadosAhora.add(id);
    resumen.publicados++;
    preparar(fichero, salida);
  }
  for (const id of retirar) {
    const f = ruta("articulos", `${id}.json`);
    if (existsSync(f)) resumen.retirados++;
    quitar(f);
  }

  // --- Papelera de más de 30 días: se borra el artículo y sus versiones (y su JSON si quedara)
  const limitePapelera = ahoraMs - DIAS_PAPELERA * 86400000;
  const aPurgar = [];
  papelera.forEach((s) => {
    const t = Date.parse(s.data().enPapeleraDesde ?? "");
    if (!isNaN(t) && t < limitePapelera) aPurgar.push(s.id);
  });
  for (const id of aPurgar) if (slugSeguro(id)) quitar(ruta("articulos", `${id}.json`));

  // --- Estado (existe / publicado) de las direcciones que no hemos leído entero: comentarios y ocultos
  const conocido = new Map(); // dirección -> {existe, publicado}
  for (const id of articulos.keys()) conocido.set(id, { existe: true, publicado: publicadosAhora.has(id) });
  async function estadoDe(slugs) {
    const faltan = [...new Set(slugs)].filter((s) => slugSeguro(s) && !conocido.has(s));
    for (let i = 0; i < faltan.length; i += 300) {
      const trozo = faltan.slice(i, i + 300);
      const snaps = await db.getAll(...trozo.map((s) => db.collection("articulos").doc(s)), { fieldMask: ["estado", "fechaPublicacion"] });
      snaps.forEach((s, j) => conocido.set(trozo[j], { existe: s.exists, publicado: s.exists && debePublicarse(s.data(), ahoraMs) && !RESERVADAS.includes(trozo[j]) }));
    }
  }

  // --- Comentarios aprobados -> contenido/comentarios/<dirección>.json
  const porArticulo = new Map();
  aprobados.forEach((s) => {
    const c = s.data();
    if (!esTexto(c.articuloSlug) || !esTexto(c.nombre) || !esTexto(c.texto)) return;
    const lista = porArticulo.get(c.articuloSlug) ?? [];
    lista.push({ id: s.id, nombre: c.nombre, fecha: iso(c.creadoEn), texto: c.texto });
    porArticulo.set(c.articuloSlug, lista);
  });
  const dirComentarios = ruta("comentarios");
  const conFichero = existsSync(dirComentarios) ? readdirSync(dirComentarios).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];
  const candidatos = [...new Set([...porArticulo.keys(), ...conFichero])].filter((s) => {
    if (slugSeguro(s)) return true;
    if (porArticulo.has(s)) aviso(`Comentarios ignorados: dirección de artículo no válida ${JSON.stringify(s)}.`);
    return false;
  });
  await estadoDe(candidatos);
  for (const slug of candidatos) {
    const info = conocido.get(slug);
    if (!info?.existe) {
      if (porArticulo.has(slug)) aviso(`Hay comentarios para "${slug}", pero ese artículo no existe; no se publican.`);
      continue;
    }
    const f = ruta("comentarios", `${slug}.json`);
    const lista = (porArticulo.get(slug) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
    if (info.publicado && lista.length) {
      preparar(f, lista);
      resumen.comentarios += lista.length;
    } else quitar(f);
  }

  // --- Archivo: comentarios ocultos (el texto pasa a Firestore y se vacía en el repositorio; al mostrarlos se restaura)
  const ocultosPorSlug = {};
  const guardarTextos = []; // antes de escribir ficheros
  const quitarTextos = []; // después
  const docsOcultos = [];
  ocultosSnap.forEach((s) => docsOcultos.push([s.id, s.data()]));
  await estadoDe(docsOcultos.map(([s]) => s));
  for (const [slug, d] of docsOcultos) {
    if (!slugSeguro(slug) || !conocido.get(slug)?.existe) {
      aviso(`Comentarios ocultos ignorados: el artículo ${JSON.stringify(slug)} no existe.`);
      continue;
    }
    const ids = [...new Set((Array.isArray(d.ids) ? d.ids : []).map(String))];
    if (ids.length) ocultosPorSlug[slug] = ids;
    const textosGuardados = d.textos && typeof d.textos === "object" ? d.textos : {};
    const fArchivo = ruta("comentarios-archivo", `${slug}.json`);
    if (!existsSync(fArchivo)) continue;
    const oculto = new Set(ids);
    const mover = {};
    const quitarIds = [];
    const nuevos = leerJson(fArchivo).map((c) => {
      const id = String(c.id);
      const vacio = (c.html ?? "") === "" && (c.autor ?? "") === "";
      if (oculto.has(id)) {
        if (!vacio) {
          mover[id] = c;
          return { id: c.id, autor: "", fecha: c.fecha, html: "", respuestaA: c.respuestaA ?? null };
        }
        if (!textosGuardados[id]) aviso(`El comentario oculto ${id} de "${slug}" ya estaba vacío y no hay copia de su texto; no se podrá volver a mostrar.`);
        return c;
      }
      if (textosGuardados[id]) {
        quitarIds.push(id);
        return vacio ? textosGuardados[id] : c;
      }
      return c;
    });
    if (Object.keys(mover).length) guardarTextos.push([slug, mover]);
    if (quitarIds.length) quitarTextos.push([slug, quitarIds]);
    preparar(fArchivo, nuevos);
  }
  const fOcultos = ruta("archivo-ocultos.json");
  const ordenados = Object.fromEntries(Object.entries(ocultosPorSlug).sort(([a], [b]) => (a < b ? -1 : 1)));
  if (existsSync(fOcultos) || Object.keys(ordenados).length) preparar(fOcultos, ordenados);

  // --- Ajustes y "Qué es EOC"
  if (ajustesSnap.exists) {
    const a = ajustesSnap.data();
    const enlaces = (Array.isArray(a.enlaces) ? a.enlaces : []).filter((e) => {
      const bien = e && esTexto(e.nombre) && esTexto(e.url) && esUrlWeb(e.url);
      if (!bien) aviso(`Un enlace de Ajustes se ha descartado (la dirección no es http/https): ${JSON.stringify(e?.nombre ?? "")}`);
      return bien;
    }).map((e) => ({ nombre: e.nombre, url: e.url }));
    let adsense = { activo: a.adsense?.activo === true, cliente: esTexto(a.adsense?.cliente) ? a.adsense.cliente : "", bloque: esTexto(a.adsense?.bloque) ? a.adsense.bloque : "" };
    if ((adsense.cliente !== "" && !esCliente(adsense.cliente)) || (adsense.bloque !== "" && !esBloque(adsense.bloque))) {
      aviso("La publicidad se ha desactivado: el código de cuenta o de bloque no es válido.");
      adsense = { activo: false, cliente: "", bloque: "" };
    }
    preparar(ruta("ajustes.json"), { destacado: esTexto(a.destacado) && a.destacado ? a.destacado : null, enlaces, adsense });
    const q = a.queEsEoc;
    const cuerpoQue = q && esTexto(q.cuerpoHtml) ? sanear(q.cuerpoHtml) : "";
    if (q && esTexto(q.titulo) && q.titulo.trim() && cuerpoQue) preparar(ruta("paginas", "que-es-eoc.json"), { titulo: q.titulo, cuerpoHtml: cuerpoQue });
  } else aviso("No hay ajustes guardados; se dejan los de contenido/ como estaban.");

  // --- Índice de títulos para el buscador del panel: indices/titulos = { dirección: título } (todos menos la papelera)
  let titulos = indiceSnap.exists && !todo ? { ...indiceSnap.data() } : null;
  if (!titulos) {
    titulos = {};
    const todos = todo ? [...articulos.entries()] : (await db.collection("articulos").select("titulo", "estado").get()).docs.map((s) => [s.id, s.data()]);
    for (const [id, d] of todos) if (d.estado !== "papelera" && esTexto(d.titulo) && d.titulo.trim()) titulos[id] = d.titulo.trim();
  } else {
    for (const [id, d] of articulos) {
      if (d.estado !== "papelera" && esTexto(d.titulo) && d.titulo.trim()) titulos[id] = d.titulo.trim();
      else delete titulos[id];
    }
  }
  for (const id of aPurgar) delete titulos[id];
  for (const id of Object.keys(titulos)) if (/^__.*__$/.test(id) || id.includes("/") || !esTexto(titulos[id])) delete titulos[id];
  const indiceCambia = !indiceSnap.exists || estable(indiceSnap.data()) !== estable(titulos);

  // ---------------------------------------------------------------------------------------------------------
  // 3. Escritura. Ya está todo leído y preparado.
  for (const [slug, mover] of guardarTextos) {
    await db.collection("archivoOcultos").doc(slug).set({ textos: mover }, { merge: true }); // antes de vaciar el fichero del repositorio
  }
  for (const [r, datos] of imagenes) escribirAtomico(r, datos);
  if (JSON.stringify(manifiestoNuevo) !== JSON.stringify(manifiesto)) textos.set(rutaManifiesto, json(manifiestoNuevo));
  for (const [r, t] of textos) escribirAtomico(r, t);
  for (const r of borrar) rmSync(r, { force: true });
  const cambios = textos.size > 0 || borrar.size > 0 || imagenes.size > 0;

  // 4. Lo que va a Firestore tras haber escrito los ficheros
  for (const [slug, ids] of quitarTextos) {
    await db.collection("archivoOcultos").doc(slug).update(...ids.flatMap((id) => [new FieldPath("textos", id), FieldValue.delete()]));
  }
  for (const id of aPurgar) {
    const ref = db.collection("articulos").doc(id);
    const versiones = (await ref.collection("versiones").select().get()).docs.map((s) => s.ref);
    for (let i = 0; i < versiones.length; i += LOTE) {
      const lote = db.batch();
      versiones.slice(i, i + LOTE).forEach((r) => lote.delete(r));
      await lote.commit();
    }
    await ref.delete();
  }
  if (indiceCambia) await db.doc("indices/titulos").set(titulos);
  await db.runTransaction(async (tx) => {
    const ref = db.doc("estado/sistema");
    const actual = await tx.get(ref);
    const cambio = { ultimaExportacion: inicio };
    if (estadoInicial.publicarPendiente === true && actual.exists && actual.data().publicarPendiente === true) cambio.publicarPendiente = false;
    tx.set(ref, cambio, { merge: true });
  });

  const lineas = [
    `${todo ? "Exportación completa" : "Exportación incremental"}: ${articulos.size} artículo(s) revisados.`,
    `Artículos en la web: ${resumen.publicados} escritos o al día; ${resumen.retirados} retirados.`,
    `Comentarios aprobados publicados: ${resumen.comentarios}. Fotos nuevas convertidas: ${resumen.imagenes}.`,
    `Ficheros escritos: ${textos.size + imagenes.size}; borrados: ${borrar.size}. Papelera vaciada: ${aPurgar.length}.`,
    ...avisos.map((m) => `AVISO: ${m}`),
    `CAMBIOS=${cambios ? 1 : 0}`,
  ];
  lineas.forEach((l) => log(l));
  return { cambios, avisos, resumen, escritos: [...textos.keys(), ...imagenes.keys()], borrados: [...borrar], purgados: aPurgar };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const destino = resolverDestino();
    console.log(destino.mensaje);
    iniciarAdmin();
    await exportar({ completo: destino.args.includes("--completo") });
  } catch (e) {
    console.error("✗ No se ha podido exportar:", e?.message ?? e);
    process.exit(1);
  }
}
