// Lectores de los feeds de iVoox y YouTube, fusión de listas y escritura atómica.
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { writeFileSync, renameSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const MESES = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const NOMBRADAS = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// Las entidades las decodificamos nosotros, una sola vez, también dentro de CDATA.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  trimValues: true,
  isArray: (nombre) => nombre === "item" || nombre === "entry",
});

function decodificar(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NOMBRADAS[e.toLowerCase()] ?? m;
  });
}

function texto(v) {
  if (v == null) return "";
  if (typeof v === "object") return texto(v["#text"]);
  return String(v);
}

const limpio = (v) => decodificar(texto(v)).replace(/\s+/g, " ").trim();
const atributo = (v, nombre) => (v && typeof v === "object" && v["@_" + nombre] != null ? decodificar(String(v["@_" + nombre])).trim() : "");

function aTextoPlano(html, max) {
  let s = texto(html).replace(/<[^>]*>/g, " ");
  s = decodificar(s);
  if (/<\/?[a-z][^>]*>/i.test(s)) s = s.replace(/<[^>]*>/g, " ");
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function analizar(xml) {
  if (typeof xml !== "string" || !xml.trim()) return null;
  try {
    if (XMLValidator.validate(xml) !== true) return null;
    return parser.parse(xml);
  } catch {
    return null;
  }
}

function fechaRfc822(s) {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(s);
  if (m && MESES[m[2].toLowerCase()]) return `${m[3]}-${MESES[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export function parseIvoox(xml) {
  const doc = analizar(xml);
  const items = doc?.rss?.channel?.item;
  if (!Array.isArray(items)) return [];
  const salida = [];
  for (const it of items) {
    const url = limpio(it.link);
    const guid = limpio(it.guid);
    const id = /_rf_(\d+)_/.exec(url)?.[1] ?? /(\d+)\/?$/.exec(guid)?.[1];
    const titulo = limpio(it.title);
    if (!id || !titulo) continue;
    const fechaTxt = limpio(it.pubDate);
    salida.push({
      id,
      titulo,
      fecha: fechaTxt ? fechaRfc822(fechaTxt) : null,
      duracion: limpio(it["itunes:duration"]) || null,
      mp3: atributo(it.enclosure, "url") || null,
      url,
      descripcion: aTextoPlano(it.description, 300),
    });
  }
  return salida;
}

export function parseYoutube(xml) {
  const doc = analizar(xml);
  const entradas = doc?.feed?.entry;
  if (!Array.isArray(entradas)) return [];
  const salida = [];
  for (const e of entradas) {
    const id = limpio(e["yt:videoId"]);
    const titulo = limpio(e.title);
    if (!id || !titulo) continue;
    const pub = limpio(e.published);
    salida.push({
      id,
      titulo,
      fecha: /^\d{4}-\d{2}-\d{2}/.test(pub) ? pub.slice(0, 10) : null,
      duracion: null,
    });
  }
  return salida;
}

const vacio = (v) => v === null || v === undefined || v === "";

export function fusionar(existentes, nuevos) {
  const porId = new Map();
  for (const e of existentes) {
    if (porId.has(e.id)) porId.set(e.id, { ...porId.get(e.id), ...Object.fromEntries(Object.entries(e).filter(([, v]) => !vacio(v))) });
    else porId.set(e.id, { ...e });
  }
  for (const n of nuevos) {
    const previo = porId.get(n.id);
    if (!previo) {
      porId.set(n.id, { ...n });
      continue;
    }
    const mezcla = { ...previo };
    for (const [k, v] of Object.entries(n)) if (!vacio(v)) mezcla[k] = v;
    porId.set(n.id, mezcla);
  }
  const lista = [...porId.values()]
    .map((x, i) => [x, i])
    .sort(([a, i], [b, j]) => {
      if (a.fecha && b.fecha && a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      if (!a.fecha !== !b.fecha) return a.fecha ? -1 : 1;
      return i - j;
    })
    .map(([x]) => x);
  return { lista, cambios: JSON.stringify(lista) !== JSON.stringify(existentes) };
}

export function escribirAtomico(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = ruta + ".tmp";
  try {
    writeFileSync(tmp, JSON.stringify(datos, null, 2) + "\n", "utf8");
    renameSync(tmp, ruta);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
