import { it, expect, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, statSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIvoox, parseYoutube, fusionar, escribirAtomico } from "./medios.mjs";
import { main } from "./sincronizar-medios.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const ivooxXml = readFileSync(join(aqui, "fixtures", "ivoox.xml"), "utf8");
const youtubeXml = readFileSync(join(aqui, "fixtures", "youtube.xml"), "utf8");

it("parseIvoox lee los 3 items con id, título, fecha, mp3 y duración", () => {
  const eps = parseIvoox(ivooxXml);
  expect(eps).toHaveLength(3);
  expect(eps[0]).toMatchObject({
    id: "182002206",
    fecha: "2026-10-11",
    duracion: "19:36",
    mp3: "https://www.ivoox.com/manuel-carballal-el-argonauta-del-misterio-n-5_mf_182002206_feed_1.mp3",
    url: "https://www.ivoox.com/manuel-carballal-el-argonauta-del-misterio-n-5-audios-mp3_rf_182002206_1.html",
  });
  expect(eps[0].titulo).toContain("Argonauta del Misterio nº 5");
  expect(eps.map((e) => e.id)).toEqual(["182002206", "182002095", "182002050"]);
  expect(eps[0].descripcion).not.toMatch(/\n/);
});

const item = (extra) => `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><item>${extra}</item></channel></rss>`;

it("decodifica entidades en títulos y quita etiquetas de la descripción", () => {
  const xml = item(`<title>Ni &quot;uno&quot; &amp; dos</title><link>https://www.ivoox.com/x_rf_5_1.html</link><description><![CDATA[<p>Hola&nbsp;<b>mundo</b> &amp; más</p>]]></description><pubDate>Mon, 01 Jan 2024 00:30:00 +0100</pubDate><guid>https://www.ivoox.com/5</guid>`);
  const [e] = parseIvoox(xml);
  expect(e.titulo).toBe('Ni "uno" & dos');
  expect(e.descripcion).toBe("Hola mundo & más");
  expect(e.fecha).toBe("2024-01-01");
});

it("un item sin enclosure ni duración da mp3 y duracion null; id sale del guid si el link no lo trae", () => {
  const xml = item(`<title>Sin audio</title><link>https://www.ivoox.com/otra-cosa.html</link><guid>https://www.ivoox.com/777</guid>`);
  const [e] = parseIvoox(xml);
  expect(e).toMatchObject({ id: "777", mp3: null, duracion: null, fecha: null, descripcion: "" });
});

it("la descripción se corta a 300 caracteres", () => {
  const xml = item(`<title>t</title><link>https://www.ivoox.com/x_rf_9_1.html</link><description>${"a".repeat(500)}</description>`);
  expect(parseIvoox(xml)[0].descripcion).toHaveLength(300);
});

it("parseYoutube lee 3 entries con id y fecha, sin confundir la fecha del canal", () => {
  const vs = parseYoutube(youtubeXml);
  expect(vs).toHaveLength(3);
  expect(vs[0]).toMatchObject({ id: "qWYlprZyqac", fecha: "2026-10-10", duracion: null });
  expect(vs[0].titulo).toContain("Santa Compaña");
  expect(vs.map((v) => v.id)).toEqual(["qWYlprZyqac", "2PEhAuXnaI8", "7xLVC0aNDv0"]);
});

it("XML roto, vacío o ajeno da [] sin lanzar", () => {
  for (const malo of ["<rss><channel><item><title>x", "", "no es xml", "<html></html>", null, undefined]) {
    expect(parseIvoox(malo)).toEqual([]);
    expect(parseYoutube(malo)).toEqual([]);
  }
});

const v = (id, fecha, titulo = id, extra = {}) => ({ id, fecha, titulo, duracion: null, ...extra });

it("fusionar no duplica, añade nuevos y marca cambios", () => {
  const { lista, cambios } = fusionar([v("a", "2024-01-01")], [v("a", "2024-01-01"), v("b", "2024-02-01")]);
  expect(lista.map((x) => x.id)).toEqual(["b", "a"]);
  expect(cambios).toBe(true);
});

it("fusionar sin novedades no marca cambios", () => {
  const ex = [v("b", "2024-02-01"), v("a", "2024-01-01")];
  const { lista, cambios } = fusionar(ex, [v("a", "2024-01-01")]);
  expect(cambios).toBe(false);
  expect(lista).toEqual(ex);
});

it("fusionar actualiza el título y un nulo nunca pisa un valor", () => {
  const ex = [v("a", "2024-01-01", "viejo", { duracion: 90 })];
  const { lista, cambios } = fusionar(ex, [v("a", null, "nuevo", { duracion: null })]);
  expect(lista).toEqual([v("a", "2024-01-01", "nuevo", { duracion: 90 })]);
  expect(cambios).toBe(true);
});

it("fusionar rellena fecha ausente, ordena desc, sin fecha al final y estable", () => {
  const ex = [v("x", null), v("a", "2024-01-01"), v("y", null), v("m", "2024-05-01")];
  const { lista } = fusionar(ex, [v("x", "2023-01-01")]);
  expect(lista.map((e) => e.id)).toEqual(["m", "a", "x", "y"]);
  const { lista: l2 } = fusionar([v("p", "2024-01-01"), v("q", "2024-01-01")], []);
  expect(l2.map((e) => e.id)).toEqual(["p", "q"]);
});

it("fusionar con nuevos vacío nunca reduce la lista", () => {
  const ex = [v("a", "2024-01-01"), v("b", null)];
  expect(fusionar(ex, []).lista).toHaveLength(2);
});

it("escribirAtomico escribe JSON, crea carpetas y no deja .tmp", () => {
  const dir = mkdtempSync(join(tmpdir(), "eoc-at-"));
  const ruta = join(dir, "sub", "d.json");
  escribirAtomico(ruta, [{ a: "ñ" }]);
  expect(JSON.parse(readFileSync(ruta, "utf8"))).toEqual([{ a: "ñ" }]);
  expect(readdirSync(join(dir, "sub"))).toEqual(["d.json"]);
  escribirAtomico(ruta, [1]);
  expect(JSON.parse(readFileSync(ruta, "utf8"))).toEqual([1]);
});

// ---- programa ----
function raizTemporal() {
  const raiz = mkdtempSync(join(tmpdir(), "eoc-main-"));
  mkdirSync(join(raiz, "contenido"));
  return raiz;
}
const resp = (cuerpo, ok = true, status = 200) => ({ ok, status, text: async () => cuerpo });
const fetchDe = (mapa) => async (url) => {
  const r = mapa(url);
  if (r instanceof Error) throw r;
  return r;
};
const esIvoox = (u) => String(u).includes("ivoox");
const esperaCero = { reintentos: 2, retardoMs: 0 };

it("main: crea los dos JSON, imprime CAMBIOS=1 y devuelve código 0", async () => {
  const raiz = raizTemporal();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const r = await main({ raiz, ...esperaCero, fetch: fetchDe((u) => resp(esIvoox(u) ? ivooxXml : youtubeXml)) });
  const salida = log.mock.calls.flat().join("\n");
  log.mockRestore();
  expect(r.codigo).toBe(0);
  expect(salida).toContain("CAMBIOS=1");
  expect(JSON.parse(readFileSync(join(raiz, "contenido", "podcast.json"), "utf8"))).toHaveLength(3);
  expect(JSON.parse(readFileSync(join(raiz, "contenido", "videos.json"), "utf8"))).toHaveLength(3);
});

it("main: sin novedades imprime CAMBIOS=0 y no reescribe los ficheros", async () => {
  const raiz = raizTemporal();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const f = fetchDe((u) => resp(esIvoox(u) ? ivooxXml : youtubeXml));
  await main({ raiz, ...esperaCero, fetch: f });
  const p = join(raiz, "contenido", "podcast.json");
  const antiguo = new Date("2020-01-01T00:00:00Z");
  utimesSync(p, antiguo, antiguo);
  utimesSync(join(raiz, "contenido", "videos.json"), antiguo, antiguo);
  log.mockClear();
  const r = await main({ raiz, ...esperaCero, fetch: f });
  const salida = log.mock.calls.flat().join("\n");
  log.mockRestore();
  expect(r.codigo).toBe(0);
  expect(salida).toContain("CAMBIOS=0");
  expect(statSync(p).mtime.getTime()).toBe(antiguo.getTime());
  expect(statSync(join(raiz, "contenido", "videos.json")).mtime.getTime()).toBe(antiguo.getTime());
});

it("main: un feed caído da código 1, deja su fichero intacto y procesa el otro", async () => {
  const raiz = raizTemporal();
  const p = join(raiz, "contenido", "podcast.json");
  const previo = JSON.stringify([{ id: "1", titulo: "t", fecha: "2020-01-01", duracion: null, mp3: null, url: "u", descripcion: "" }]);
  writeFileSync(p, previo);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const r = await main({ raiz, ...esperaCero, fetch: fetchDe((u) => (esIvoox(u) ? new Error("sin red") : resp(youtubeXml))) });
  log.mockRestore();
  err.mockRestore();
  expect(r.codigo).toBe(1);
  expect(readFileSync(p, "utf8")).toBe(previo);
  expect(existsSync(p + ".tmp")).toBe(false);
  expect(JSON.parse(readFileSync(join(raiz, "contenido", "videos.json"), "utf8"))).toHaveLength(3);
});

it("main: feed con HTTP 500 o sin elementos cuenta como fallo y no toca nada", async () => {
  for (const mapa of [() => resp("", false, 500), () => resp("<rss><channel></channel></rss>")]) {
    const raiz = raizTemporal();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await main({ raiz, ...esperaCero, fetch: fetchDe(mapa) });
    log.mockRestore();
    err.mockRestore();
    expect(r.codigo).toBe(1);
    expect(readdirSync(join(raiz, "contenido"))).toEqual([]);
  }
});

it("main: reintenta y se recupera de un fallo puntual", async () => {
  const raiz = raizTemporal();
  let n = 0;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const r = await main({
    raiz,
    ...esperaCero,
    fetch: fetchDe((u) => (esIvoox(u) && n++ === 0 ? new Error("corte") : resp(esIvoox(u) ? ivooxXml : youtubeXml))),
  });
  log.mockRestore();
  expect(r.codigo).toBe(0);
  expect(n).toBe(2);
});
