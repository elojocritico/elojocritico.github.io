// Exportador Firestore -> contenido/ contra el simulador. Se ejecuta con `npm run test:emulador`.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import sharp from "sharp";
import { getFirestore } from "firebase-admin/firestore";
import { iniciarAdmin } from "../scripts/crear-admin.mjs";
import { exportar, slugSeguro } from "../scripts/exportar.mjs";

iniciarAdmin();
const db = getFirestore();
const raiz = mkdtempSync(join(tmpdir(), "eoc-exp-"));
afterAll(() => { try { rmSync(raiz, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Windows puede tener aún abierta una imagen; es una carpeta temporal */ } });

let n = 0;
let dir, img, fuera;
const J = (...p) => join(dir, ...p);
const leer = (...p) => JSON.parse(readFileSync(J(...p), "utf-8"));
const escribir = (rel, obj) => {
  mkdirSync(join(dir, ...rel.split("/").slice(0, -1)), { recursive: true });
  writeFileSync(J(...rel.split("/")), JSON.stringify(obj, null, 2));
};

function arbol(base) {
  const r = {};
  const ir = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) ir(p);
      else r[relative(base, p)] = readFileSync(p).toString("base64");
    }
  };
  ir(base);
  return r;
}

const AHORA = new Date("2024-06-01T12:00:00.000Z");
const dias = (d, desde = AHORA) => new Date(desde.getTime() + d * 86400000).toISOString();
const doc = (slug, extra = {}) => ({
  slug, titulo: "Título " + slug, subtitulo: "sub", cuerpoHtml: "<p>Hola " + slug + "</p>", extracto: "ext", portada: null, autor: "Ana",
  secciones: ["misterio"], etiquetas: ["x"], estado: "publicado", fechaPublicacion: "2024-05-10T10:00:00.000Z", destacado: false,
  creadoEn: "2024-05-10T10:00:00.000Z", actualizadoEn: "2024-05-10T10:00:00.000Z", actualizadoPor: "ana@eoc.test", enPapeleraDesde: null, ...extra,
});
const poner = (slug, extra) => db.doc("articulos/" + slug).set(doc(slug, extra));
const correr = async (extra = {}) => {
  const salida = [];
  const r = await exportar({ db, dirContenido: dir, dirImagenes: img, ahora: AHORA, log: (l) => salida.push(l), ...extra });
  return { ...r, salida };
};
const png = (w = 100, h = 80) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 20, b: 20 } } }).png().toBuffer();
const falsoFetch = (mapa, llamadas = []) => async (url) => {
  llamadas.push(url);
  const buf = mapa[url];
  if (!buf) return { ok: false, status: 404, headers: { get: () => "text/html" }, arrayBuffer: async () => new ArrayBuffer(0) };
  return { ok: true, status: 200, headers: { get: () => "image/png" }, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};

beforeEach(async () => {
  for (const c of ["articulos", "comentarios", "archivoOcultos", "ajustes", "estado", "indices"]) await db.recursiveDelete(db.collection(c));
  const base = join(raiz, "t" + ++n);
  dir = join(base, "contenido");
  img = join(base, "imagenes");
  fuera = base;
  mkdirSync(dir, { recursive: true });
  await db.doc("ajustes/global").set({
    destacado: null, enlaces: [{ nombre: "A", url: "https://a.es/" }], queEsEoc: { titulo: "Qué es", cuerpoHtml: "<p>q</p>" },
    adsense: { activo: false, cliente: "", bloque: "" }, usuarios: { "admin@eoc.test": "admin" },
  });
  await db.doc("estado/sistema").set({ publicarPendiente: false, ultimaExportacion: null, ultimaPublicacion: null });
});

describe("artículos", () => {
  it("exporta un publicado con los campos que lee la web (fecha en hora de España)", async () => {
    await poner("uno", { fechaPublicacion: "2024-05-10T22:30:00.000Z", subtitulo: "S", etiquetas: ["a", "b"], destacado: true });
    const r = await correr();
    expect(r.cambios).toBe(true);
    expect(r.salida.at(-1)).toBe("CAMBIOS=1");
    expect(leer("articulos", "uno.json")).toEqual({
      slug: "uno", titulo: "Título uno", subtitulo: "S", fecha: "2024-05-11", autor: "Ana", secciones: ["misterio"], etiquetas: ["a", "b"],
      portada: null, extracto: "ext", cuerpoHtml: "<p>Hola uno</p>", destacado: true, origen: "",
    });
  });

  it("no exporta borradores ni programados futuros; exporta el programado vencido y lo pasa a publicado con versión", async () => {
    await poner("borr", { estado: "borrador" });
    await poner("futuro", { estado: "programado", fechaPublicacion: dias(3) });
    await poner("vencido", { estado: "programado", fechaPublicacion: dias(-1) });
    await poner("fecha-mala", { estado: "programado", fechaPublicacion: "no es fecha" });
    const r = await correr();
    expect(existsSync(J("articulos", "borr.json"))).toBe(false);
    expect(existsSync(J("articulos", "futuro.json"))).toBe(false);
    expect(existsSync(J("articulos", "fecha-mala.json"))).toBe(false);
    expect(existsSync(J("articulos", "vencido.json"))).toBe(true);
    expect(r.avisos.join("\n")).toMatch(/fecha-mala/);
    const v = (await db.doc("articulos/vencido").get()).data();
    expect(v).toMatchObject({ estado: "publicado", actualizadoPor: "publicación programada", actualizadoEn: AHORA.toISOString() });
    const vers = await db.collection("articulos/vencido/versiones").get();
    expect(vers.size).toBe(1);
    expect(vers.docs[0].data()).toMatchObject({ estado: "programado", guardadoPor: "publicación programada", guardadoEn: AHORA.toISOString() });
    expect((await db.doc("articulos/futuro").get()).data().estado).toBe("programado");
  });

  it("un programado que vence entre dos exportaciones se publica en la segunda", async () => {
    await poner("luego", { estado: "programado", fechaPublicacion: dias(1) });
    await correr();
    expect(existsSync(J("articulos", "luego.json"))).toBe(false);
    await correr({ ahora: new Date(dias(2)) });
    expect(existsSync(J("articulos", "luego.json"))).toBe(true);
    expect((await db.doc("articulos/luego").get()).data().estado).toBe("publicado");
  });

  it("papelera o borrador borran el JSON ya exportado; un publicado migrado conserva el suyo y sus datos de migración", async () => {
    escribir("articulos/viejo.json", { slug: "viejo", titulo: "x", fecha: "2020-01-01", cuerpoHtml: "<p>x</p>" });
    escribir("articulos/migrado.json", { slug: "migrado", titulo: "M", fecha: "2020-01-02", cuerpoHtml: "<p>m</p>", origen: "https://elojocritico.info/migrado/", enlacesExternos: ["http://a.es"] });
    escribir("articulos/despub.json", { slug: "despub", titulo: "D", fecha: "2020-01-02", cuerpoHtml: "<p>d</p>" });
    escribir("articulos/sin-doc.json", { slug: "sin-doc", titulo: "S", fecha: "2020-01-02", cuerpoHtml: "<p>s</p>" });
    await poner("viejo", { estado: "papelera", enPapeleraDesde: dias(-2) });
    await poner("despub", { estado: "borrador" });
    await poner("migrado", { titulo: "M", cuerpoHtml: "<p>m</p>", fechaPublicacion: "2020-01-02T11:00:00.000Z", origen: "https://elojocritico.info/migrado/" });
    await correr();
    expect(existsSync(J("articulos", "viejo.json"))).toBe(false);
    expect(existsSync(J("articulos", "despub.json"))).toBe(false);
    expect(leer("articulos", "migrado.json")).toMatchObject({ origen: "https://elojocritico.info/migrado/", enlacesExternos: ["http://a.es"] });
    expect(existsSync(J("articulos", "sin-doc.json"))).toBe(true); // no existe en Firestore: no se toca
  });

  it("vacía la papelera de más de 30 días (artículo y versiones, en lotes) y deja la reciente", async () => {
    await poner("vieja", { estado: "papelera", enPapeleraDesde: dias(-31) });
    await poner("reciente", { estado: "papelera", enPapeleraDesde: dias(-29) });
    for (let i = 0; i < 5; i++) await db.doc(`articulos/vieja/versiones/v${i}`).set({ titulo: "v" + i });
    await db.doc("articulos/reciente/versiones/v0").set({ titulo: "v" });
    const r = await correr();
    expect(r.purgados).toEqual(["vieja"]);
    expect((await db.doc("articulos/vieja").get()).exists).toBe(false);
    expect((await db.collection("articulos/vieja/versiones").get()).size).toBe(0);
    expect((await db.doc("articulos/reciente").get()).exists).toBe(true);
    expect((await db.collection("articulos/reciente/versiones").get()).size).toBe(1);
  });

  it("sanea el HTML: sin <script>, onerror ni javascript:", async () => {
    await poner("sucio", {
      cuerpoHtml: '<p>ok</p><script>alert(1)</script><img src="https://x.es/a.png" onerror="alert(2)"><a href="javascript:alert(3)">clic</a><a href=" JaVa\nScRiPt:alert(4)">otro</a><iframe src="https://evil.es/x"></iframe>',
    });
    await correr();
    const html = leer("articulos", "sucio.json").cuerpoHtml;
    expect(html).not.toMatch(/<script|alert|onerror|javascript:|evil\.es/i);
    expect(html).toContain("<p>ok</p>");
  });

  it("una segunda ejecución sin cambios da CAMBIOS=0 (incremental y completa)", async () => {
    await poner("a");
    await poner("b", { estado: "borrador" });
    await db.collection("comentarios").add({ articuloSlug: "a", nombre: "N", correo: "n@x.es", texto: "hola", respuestaA: null, estado: "aprobado", origen: "nuevo", creadoEn: "2024-05-12T10:00:00.000Z" });
    const r1 = await correr();
    expect(r1.cambios).toBe(true);
    const antes = arbol(dir);
    const r2 = await correr();
    expect(r2.cambios).toBe(false);
    expect(r2.salida.at(-1)).toBe("CAMBIOS=0");
    const r3 = await correr({ completo: true });
    expect(r3.cambios).toBe(false);
    expect(arbol(dir)).toEqual(antes);
    expect((await db.doc("estado/sistema").get()).data().ultimaExportacion).toBe(AHORA.toISOString());
  });

  it("incremental: solo reexporta lo cambiado desde la última exportación", async () => {
    await poner("a");
    await poner("b");
    await correr();
    escribir("articulos/b.json", { ...leer("articulos", "b.json"), titulo: "TOCADO A MANO" }); // un incremental no debe reescribirlo
    await db.doc("articulos/a").update({ titulo: "Nuevo título", actualizadoEn: dias(1) });
    const r = await correr({ ahora: new Date(dias(2)) });
    expect(r.cambios).toBe(true);
    expect(leer("articulos", "a.json").titulo).toBe("Nuevo título");
    expect(leer("articulos", "b.json").titulo).toBe("TOCADO A MANO");
    await correr({ ahora: new Date(dias(3)), completo: true }); // la completa lo repone
    expect(leer("articulos", "b.json").titulo).toBe("Título b");
  });

  it("al terminar, publicarPendiente vuelve a false", async () => {
    await db.doc("estado/sistema").update({ publicarPendiente: true });
    await poner("a");
    await correr();
    expect((await db.doc("estado/sistema").get()).data()).toMatchObject({ publicarPendiente: false, ultimaExportacion: AHORA.toISOString() });
  });

  it("un artículo que no valdría para la web se omite con aviso, sin romper el resto", async () => {
    await poner("sin-titulo", { titulo: "  " });
    await poner("admin"); // dirección reservada
    await poner("bien");
    const r = await correr();
    expect(existsSync(J("articulos", "sin-titulo.json"))).toBe(false);
    expect(existsSync(J("articulos", "admin.json"))).toBe(false);
    expect(existsSync(J("articulos", "bien.json"))).toBe(true);
    expect(r.avisos.length).toBe(2);
  });
});

describe("seguridad de las direcciones", () => {
  it("slugSeguro", () => {
    for (const mala of ["", "..", "a..b", "a/b", "a\\b", "con espacio", "x".repeat(201), "a\u0000b", "a\nb", undefined, 5]) expect(slugSeguro(mala), String(mala)).toBe(false);
    for (const buena of ["ñandú-tres", "1414-una-luz", "a.b", "x".repeat(200)]) expect(slugSeguro(buena), buena).toBe(true);
  });

  it("no escribe ni borra nada fuera de contenido/articulos ni para direcciones raras", async () => {
    writeFileSync(join(fuera, "escape.json"), "no me toques");
    mkdirSync(J("articulos"), { recursive: true });
    for (const s of ["a..b", "..%2Fescape", "con espacio", "a\\b", "x..", "..escape"]) await poner(s);
    await poner("normal");
    const r = await correr();
    expect(readFileSync(join(fuera, "escape.json"), "utf-8")).toBe("no me toques");
    expect(readdirSync(J("articulos"))).toEqual(["normal.json"]);
    expect(r.avisos.length).toBeGreaterThanOrEqual(5);
    // Y borrar tampoco: un fichero con ese nombre queda donde está si la dirección no es segura.
    await db.doc("articulos/a..b").update({ estado: "borrador", actualizadoEn: dias(1) });
    writeFileSync(J("articulos", "a..b.json"), "{}");
    await correr({ ahora: new Date(dias(2)) });
    expect(existsSync(J("articulos", "a..b.json"))).toBe(true);
  });
});

describe("comentarios nuevos", () => {
  const com = (slug, texto, creadoEn, estado = "aprobado", extra = {}) =>
    db.collection("comentarios").add({ articuloSlug: slug, nombre: "N " + texto, correo: "secreto@x.es", texto, respuestaA: null, estado, origen: "nuevo", creadoEn, ...extra });

  it("publica solo los aprobados, de más antiguo a más reciente, sin correo", async () => {
    await poner("a");
    await com("a", "segundo", "2024-05-14T10:00:00.000Z");
    await com("a", "primero", "2024-05-12T10:00:00.000Z");
    await com("a", "pendiente", "2024-05-13T10:00:00.000Z", "pendiente");
    await com("a", "rechazado", "2024-05-13T11:00:00.000Z", "rechazado");
    await com("a", "spam", "2024-05-13T12:00:00.000Z", "spam");
    await correr();
    const lista = leer("comentarios", "a.json");
    expect(lista.map((c) => c.texto)).toEqual(["primero", "segundo"]);
    expect(Object.keys(lista[0]).sort()).toEqual(["fecha", "id", "nombre", "texto"]);
    expect(JSON.stringify(lista)).not.toContain("secreto");
    expect(lista[0].fecha).toBe("2024-05-12T10:00:00.000Z");
  });

  it("acepta fechas de servidor (Timestamp) y solo escribe para artículos publicados que existen", async () => {
    const { Timestamp } = await import("firebase-admin/firestore");
    await poner("a");
    await poner("borr", { estado: "borrador" });
    await com("a", "ts", Timestamp.fromDate(new Date("2024-05-20T08:00:00Z")));
    await com("borr", "de borrador", "2024-05-12T10:00:00.000Z");
    await com("no-existe", "huérfano", "2024-05-12T10:00:00.000Z");
    await com("../fuera", "traversal", "2024-05-12T10:00:00.000Z");
    const r = await correr();
    expect(leer("comentarios", "a.json")[0].fecha).toBe("2024-05-20T08:00:00.000Z");
    expect(readdirSync(J("comentarios"))).toEqual(["a.json"]);
    expect(existsSync(join(dir, "..", "fuera.json"))).toBe(false);
    expect(r.avisos.length).toBeGreaterThanOrEqual(2);
  });

  it("si un comentario deja de estar aprobado, su fichero se actualiza o se borra; también si el artículo se despublica", async () => {
    await poner("a");
    await poner("b");
    const ca = await com("a", "uno", "2024-05-12T10:00:00.000Z");
    await com("b", "dos", "2024-05-12T10:00:00.000Z");
    await correr();
    expect(existsSync(J("comentarios", "a.json"))).toBe(true);
    await ca.update({ estado: "rechazado" });
    await db.doc("articulos/b").update({ estado: "borrador", actualizadoEn: dias(1) });
    await correr({ ahora: new Date(dias(2)) });
    expect(existsSync(J("comentarios", "a.json"))).toBe(false);
    expect(existsSync(J("comentarios", "b.json"))).toBe(false);
  });
});

describe("archivo: ocultar y volver a mostrar", () => {
  const original = [
    { id: "1", autor: "Pepe", fecha: "2018-01-01T10:00", html: "<p>uno</p>", respuestaA: null },
    { id: "2", autor: "Luisa", fecha: "2018-01-02T10:00", html: "<p>dos</p>", respuestaA: "1" },
    { id: "3", autor: "Marta", fecha: "2018-01-03T10:00", html: "<p>tres</p>", respuestaA: null },
  ];
  beforeEach(async () => {
    await poner("a");
    escribir("comentarios-archivo/a.json", original);
  });

  it("al ocultar, el texto pasa a Firestore y se vacía en el repositorio; al mostrar de nuevo se restaura", async () => {
    await db.doc("archivoOcultos/a").set({ ids: ["2"] });
    const r1 = await correr();
    const f1 = leer("comentarios-archivo", "a.json");
    expect(f1[1]).toEqual({ id: "2", autor: "", fecha: "2018-01-02T10:00", html: "", respuestaA: "1" });
    expect(f1[0]).toEqual(original[0]);
    expect(JSON.stringify(f1)).not.toContain("dos");
    expect((await db.doc("archivoOcultos/a").get()).data()).toEqual({ ids: ["2"], textos: { 2: original[1] } });
    expect(leer("archivo-ocultos.json")).toEqual({ a: ["2"] });
    expect(r1.cambios).toBe(true);

    expect((await correr()).cambios).toBe(false); // estable

    await db.doc("archivoOcultos/a").update({ ids: [] });
    const r3 = await correr();
    expect(leer("comentarios-archivo", "a.json")).toEqual(original);
    expect((await db.doc("archivoOcultos/a").get()).data()).toEqual({ ids: [], textos: {} });
    expect(leer("archivo-ocultos.json")).toEqual({});
    expect(r3.cambios).toBe(true);
    expect((await correr()).cambios).toBe(false);
  });

  it("varios ocultos a la vez, y un oculto nuevo conserva los anteriores", async () => {
    await db.doc("archivoOcultos/a").set({ ids: ["1"] });
    await correr();
    await db.doc("archivoOcultos/a").update({ ids: ["1", "3"] });
    await correr();
    const f = leer("comentarios-archivo", "a.json");
    expect(f.map((c) => c.html)).toEqual(["", "<p>dos</p>", ""]);
    expect(Object.keys((await db.doc("archivoOcultos/a").get()).data().textos).sort()).toEqual(["1", "3"]);
    await db.doc("archivoOcultos/a").update({ ids: ["3"] });
    await correr();
    expect(leer("comentarios-archivo", "a.json").map((c) => c.html)).toEqual(["<p>uno</p>", "<p>dos</p>", ""]);
  });

  it("ignora los ocultos de un artículo que no existe", async () => {
    await db.doc("archivoOcultos/fantasma").set({ ids: ["9"] });
    const r = await correr();
    expect(existsSync(J("archivo-ocultos.json"))).toBe(false); // nada que ocultar: no se crea el fichero
    expect(r.avisos.join()).toMatch(/fantasma/);
  });
});

describe("ajustes", () => {
  it("escribe ajustes.json sin usuarios, descarta enlaces no http(s) y desactiva publicidad inválida", async () => {
    await db.doc("ajustes/global").update({
      destacado: "uno",
      enlaces: [{ nombre: "Bien", url: "https://ok.es/" }, { nombre: "Mal", url: "javascript:alert(1)" }],
      adsense: { activo: true, cliente: "ca-pub-1", bloque: "123" },
    });
    const r = await correr();
    const a = leer("ajustes.json");
    expect(a).toEqual({ destacado: "uno", enlaces: [{ nombre: "Bien", url: "https://ok.es/" }], adsense: { activo: false, cliente: "", bloque: "" } });
    expect(JSON.stringify(a)).not.toContain("admin@eoc.test");
    expect(r.avisos.length).toBe(2);
  });

  it("'Qué es EOC' se sanea; si está vacío se conserva el fichero actual", async () => {
    escribir("paginas/que-es-eoc.json", { titulo: "Antiguo", cuerpoHtml: "<p>antiguo</p>" });
    await db.doc("ajustes/global").update({ queEsEoc: { titulo: "Nuevo", cuerpoHtml: '<p>hola</p><script>x()</script><a href="javascript:y()">z</a>' } });
    await correr();
    expect(leer("paginas", "que-es-eoc.json")).toEqual({ titulo: "Nuevo", cuerpoHtml: "<p>hola</p>z" });
    await db.doc("ajustes/global").update({ queEsEoc: { titulo: "", cuerpoHtml: "" } });
    await correr({ completo: true });
    expect(leer("paginas", "que-es-eoc.json").titulo).toBe("Nuevo");
  });
});

describe("índice de títulos", () => {
  it("indices/titulos = { dirección: título } para todos menos la papelera, y se mantiene en incremental", async () => {
    await poner("a");
    await poner("b", { estado: "borrador", titulo: "Borrador B" });
    await poner("c", { estado: "papelera", enPapeleraDesde: dias(-1) });
    await correr();
    expect((await db.doc("indices/titulos").get()).data()).toEqual({ a: "Título a", b: "Borrador B" });
    await db.doc("articulos/a").update({ titulo: "A nueva", actualizadoEn: dias(1) });
    await db.doc("articulos/b").update({ estado: "papelera", enPapeleraDesde: dias(1), actualizadoEn: dias(1) });
    await poner("d", { actualizadoEn: dias(1) });
    await correr({ ahora: new Date(dias(2)) });
    expect((await db.doc("indices/titulos").get()).data()).toEqual({ a: "A nueva", d: "Título d" });
  });
});

describe("fotos", () => {
  const URL1 = "https://res.cloudinary.com/demo/image/upload/v1/carpeta/Foto%20Ñandú%20(1).png";
  const URL2 = "https://res.cloudinary.com/otra/image/upload/v2/Foto-Nandu-1.png";

  it("baja las fotos de Cloudinary, las convierte a WebP 1600/640 y reescribe las direcciones", async () => {
    const grande = await png(2400, 1200);
    const llamadas = [];
    await poner("con-fotos", {
      portada: { src: URL1, tarjeta: URL1, alt: "pie" },
      cuerpoHtml: `<p>x</p><img src="${URL1}" alt="a" width="5" height="5"><img src="https://otro.es/f.jpg" alt="b">`,
    });
    const traer = falsoFetch({ [URL1]: grande }, llamadas);
    const r = await correr({ traer });
    const a = leer("articulos", "con-fotos.json");
    expect(a.portada).toEqual({ src: "/img/2024/05/foto-nandu-1.webp", tarjeta: "/img/2024/05/foto-nandu-1-640.webp", alt: "pie" });
    expect(a.cuerpoHtml).toContain('src="/img/2024/05/foto-nandu-1.webp"');
    expect(a.cuerpoHtml).toContain('width="1600" height="800"');
    expect(a.cuerpoHtml).toContain("https://otro.es/f.jpg");
    expect(a.cuerpoHtml).not.toContain("cloudinary");
    expect(llamadas).toEqual([URL1]); // una sola descarga aunque salga dos veces
    const m1600 = await sharp(join(img, "2024", "05", "foto-nandu-1.webp")).metadata();
    const m640 = await sharp(join(img, "2024", "05", "foto-nandu-1-640.webp")).metadata();
    expect([m1600.format, m1600.width, m1600.height]).toEqual(["webp", 1600, 800]);
    expect([m640.format, m640.width, m640.height]).toEqual(["webp", 640, 320]);
    expect(r.cambios).toBe(true);
    expect(r.resumen.imagenes).toBe(1);

    // Segunda vez (completa): no vuelve a descargar ni cambia nada.
    const r2 = await correr({ traer, completo: true });
    expect(llamadas.length).toBe(1);
    expect(r2.cambios).toBe(false);
  });

  it("no agranda las fotos pequeñas y, si dos fotos distintas dan el mismo nombre, añade -2", async () => {
    await poner("uno", { cuerpoHtml: `<img src="${URL1}" alt="">` });
    await poner("dos", { cuerpoHtml: `<img src="${URL2}" alt="">` });
    await correr({ traer: falsoFetch({ [URL1]: await png(300, 200), [URL2]: await png(400, 100) }) });
    const u = leer("articulos", "uno.json").cuerpoHtml, d = leer("articulos", "dos.json").cuerpoHtml;
    const nombres = [u, d].map((h) => /src="([^"]+)"/.exec(h)[1]).sort();
    expect(nombres).toEqual(["/img/2024/05/foto-nandu-1-2.webp", "/img/2024/05/foto-nandu-1.webp"]);
    expect((await sharp(join(img, "2024", "05", "foto-nandu-1.webp")).metadata()).width).toBeLessThanOrEqual(400);
    // Los nombres no cambian en la siguiente completa
    await correr({ completo: true, traer: falsoFetch({}) });
    expect([leer("articulos", "uno.json").cuerpoHtml, leer("articulos", "dos.json").cuerpoHtml].map((h) => /src="([^"]+)"/.exec(h)[1]).sort()).toEqual(nombres);
  });

  it("si falta el fichero de una foto ya convertida, la vuelve a bajar con el mismo nombre", async () => {
    await poner("uno", { cuerpoHtml: `<img src="${URL1}" alt="">` });
    const traer = falsoFetch({ [URL1]: await png(300, 200) });
    await correr({ traer });
    rmSync(img, { recursive: true, force: true });
    const r = await correr({ traer, completo: true });
    expect(existsSync(join(img, "2024", "05", "foto-nandu-1.webp"))).toBe(true);
    expect(r.cambios).toBe(true);
    expect(leer("articulos", "uno.json").cuerpoHtml).toContain("/img/2024/05/foto-nandu-1.webp");
  });

  it("quita las fotos data: del cuerpo y de la portada, con aviso", async () => {
    const d = "data:image/png;base64,iVBORw0KGgo=";
    await poner("datos", { portada: { src: d, tarjeta: d, alt: "" }, cuerpoHtml: `<p>a</p><img src="${d}" alt=""><p>b</p>` });
    const r = await correr();
    const a = leer("articulos", "datos.json");
    expect(a.portada).toBeNull();
    expect(a.cuerpoHtml).not.toMatch(/data:|<img/);
    expect(r.avisos.filter((m) => /datos/.test(m)).length).toBe(2);
  });

  it("solo descarga de res.cloudinary.com por https", async () => {
    const llamadas = [];
    await poner("raro", { cuerpoHtml: '<img src="https://res.cloudinary.com.evil.es/x.png" alt=""><img src="http://127.0.0.1/x.png" alt="">', portada: { src: "javascript:alert(1)", tarjeta: "", alt: "" } });
    const r = await correr({ traer: falsoFetch({}, llamadas) });
    expect(llamadas).toEqual([]);
    expect(leer("articulos", "raro.json").portada).toBeNull();
    expect(r.avisos.length).toBe(1);
  });

  it("si no se puede bajar una foto, falla sin tocar contenido/ ni avanzar la última exportación", async () => {
    await poner("a");
    await poner("b", { cuerpoHtml: `<img src="${URL1}" alt="">` });
    const antes = arbol(dir);
    await expect(correr({ traer: falsoFetch({}) })).rejects.toThrow(/No se ha podido descargar/);
    expect(arbol(dir)).toEqual(antes);
    expect(existsSync(img)).toBe(false);
    expect((await db.doc("estado/sistema").get()).data().ultimaExportacion).toBeNull();
  });
});

describe("si Firestore falla", () => {
  it("no toca contenido/ y avisa con un error", async () => {
    escribir("articulos/viejo.json", { slug: "viejo", titulo: "V", fecha: "2020-01-01", cuerpoHtml: "<p>v</p>" });
    escribir("ajustes.json", { destacado: null, enlaces: [], adsense: { activo: false, cliente: "", bloque: "" } });
    const antes = arbol(dir);
    const roto = {
      doc: () => ({ get: async () => { throw new Error("Firestore no responde"); } }),
      collection: () => { throw new Error("Firestore no responde"); },
    };
    await expect(exportar({ db: roto, dirContenido: dir, dirImagenes: img, ahora: AHORA, log: () => {} })).rejects.toThrow(/no responde/);
    expect(arbol(dir)).toEqual(antes);
  });

  it("si cae a medias (tras leer parte), tampoco escribe nada", async () => {
    await poner("a");
    const antes = arbol(dir);
    const real = db;
    const a_medias = new Proxy(real, {
      get(t, p) {
        if (p === "getAll") return async () => { throw new Error("se cayó la conexión"); };
        const v = t[p];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    await db.collection("comentarios").add({ articuloSlug: "a", nombre: "N", correo: "", texto: "t", respuestaA: null, estado: "aprobado", origen: "nuevo", creadoEn: "2024-05-12T10:00:00.000Z" });
    await db.doc("articulos/otro").set(doc("otro", { estado: "borrador" })); // comentario de un artículo no leído -> getAll
    await db.collection("comentarios").add({ articuloSlug: "otro", nombre: "N", correo: "", texto: "t", respuestaA: null, estado: "aprobado", origen: "nuevo", creadoEn: "2024-05-12T10:00:00.000Z" });
    await db.doc("estado/sistema").update({ ultimaExportacion: "2024-05-30T00:00:00.000Z" });
    await expect(exportar({ db: a_medias, dirContenido: dir, dirImagenes: img, ahora: AHORA, log: () => {} })).rejects.toThrow(/conexión/);
    expect(arbol(dir)).toEqual(antes);
    expect(statSync(dir).isDirectory()).toBe(true);
  });
});
