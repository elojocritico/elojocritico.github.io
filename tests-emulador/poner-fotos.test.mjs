// Se ejecuta con `npm run test:emulador`.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import { iniciarAdmin } from "../scripts/crear-admin.mjs";
import { importar } from "../scripts/importar.mjs";
import { ponerFotos, rechazo, sustituirUna, textoInforme } from "../scripts/poner-fotos.mjs";
import { sanear } from "../src/lib/sanear.ts";

iniciarAdmin();
const db = getFirestore();
const dir = mkdtempSync(join(tmpdir(), "eoc-pf-"));
mkdirSync(join(dir, "articulos"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const R1 = "/wp-content/uploads/2013/10/eoc-45-203x300.jpg";
const R2 = "/wp-content/uploads/2014/01/otra.jpg";
const marca = (r) => `<span class="img-perdida" data-original="${r}">Imagen no recuperada</span>`;
const IMG1 = '<img alt="Portada de El Ojo Crítico nº 45" height="567" loading="lazy" src="/img/portadas/eoc-045.webp" width="400" />';
const IMG2 = '<img alt="" height="200" loading="lazy" src="/img/2014/01/otra.webp" width="300" />';
const art = (slug, cuerpoHtml) => ({
  slug, titulo: "T " + slug, subtitulo: "", fecha: "2020-03-04", autor: "A", secciones: ["s"], etiquetas: [],
  portada: null, extracto: "x", cuerpoHtml, destacado: false, origen: "wp",
});
const CUERPOS = {
  dos: `<p>${marca(R1)}</p><p>texto</p><p>${marca(R2)}</p>`,
  repetida: `<p>${marca(R1)}</p><p>${marca(R1)}</p>`,
  sinmarca: "<p>nada</p>",
};
for (const [s, c] of Object.entries(CUERPOS)) writeFileSync(join(dir, "articulos", s + ".json"), JSON.stringify(art(s, c)));
const CAMBIOS = [
  { slug: "dos", buscar: marca(R1), poner: IMG1, motivo: "portada" },
  { slug: "dos", buscar: marca(R2), poner: IMG2, motivo: "wayback" },
  { slug: "repetida", buscar: marca(R1), poner: IMG1, motivo: "portada" },
  { slug: "sinmarca", buscar: marca(R1), poner: IMG1, motivo: "portada" },
  { slug: "no-existe", buscar: marca(R1), poner: IMG1, motivo: "portada" },
];
const callar = () => {};
const sistema = async () => (await db.doc("estado/sistema").get()).data();

beforeEach(async () => {
  for (const c of ["articulos", "ajustes", "estado", "indices", "borrados"]) await db.recursiveDelete(db.collection(c));
  await importar({ db, dirContenido: dir, log: callar });
});

describe("rechazo / sustituirUna", () => {
  it("solo acepta marca -> img", () => {
    expect(rechazo(CAMBIOS[0])).toBe(null);
    expect(rechazo({ slug: "x", buscar: "<p>hola</p>", poner: IMG1 })).toMatch(/marca/);
    expect(rechazo({ slug: "x", buscar: marca(R1), poner: "<script>x</script>" })).toMatch(/img/);
    expect(rechazo({ buscar: marca(R1), poner: IMG1 })).toMatch(/slug/);
  });
  it("sustituye solo la primera aparición exacta", () => {
    const h = `${marca(R1)}|${marca(R1)}`;
    expect(sustituirUna(h, marca(R1), IMG1)).toBe(`${IMG1}|${marca(R1)}`);
    expect(sustituirUna("<p>nada</p>", marca(R1), IMG1)).toBe(null);
  });
  it("lo que pone lo conserva el saneador", () => {
    const h = `<p>${IMG1}</p><p>${IMG2}</p>`;
    expect(sanear(h)).toBe(h);
  });
});

describe("ponerFotos (simulador)", () => {
  it("cambia solo la marca exacta, recalcula fotosPendientes, deja versión y marca publicar pendiente", async () => {
    const antes = (await db.doc("articulos/dos").get()).data();
    const r = await ponerFotos({ db, cambios: CAMBIOS, simular: false, log: callar });
    expect(r.aplicados).toBe(3);
    expect(r.articulos.sort()).toEqual(["dos", "repetida"]);
    expect(r.noEncontrados.map((x) => x.slug)).toEqual(["sinmarca"]);
    expect(r.noExisten).toEqual(["no-existe"]);

    const dos = (await db.doc("articulos/dos").get()).data();
    expect(dos.cuerpoHtml).toBe(`<p>${IMG1}</p><p>texto</p><p>${IMG2}</p>`);
    expect(dos.fotosPendientes).toBe(0);
    expect(dos.actualizadoPor).toBe("script poner-fotos");
    expect(dos.titulo).toBe(antes.titulo);
    const versiones = await db.collection("articulos/dos/versiones").get();
    expect(versiones.size).toBe(1);
    expect(versiones.docs[0].data()).toMatchObject({ ...antes, guardadoPor: "script poner-fotos" });
    const s = await sistema();
    expect(s.publicarPendiente).toBe(true);
    // un artículo sin su marca no se toca
    const sm = (await db.doc("articulos/sinmarca").get()).data();
    expect(sm.cuerpoHtml).toBe("<p>nada</p>");
    expect(sm.actualizadoPor).toBe("migración");
    expect((await db.collection("articulos/sinmarca/versiones").get()).size).toBe(0);
    expect(textoInforme(r)).toContain("Marcas cambiadas por su foto: 3");
  });

  it("una marca repetida se cambia aparición a aparición (un cambio = una aparición)", async () => {
    await ponerFotos({ db, cambios: CAMBIOS.filter((c) => c.slug === "repetida"), simular: false, log: callar });
    const d = (await db.doc("articulos/repetida").get()).data();
    expect(d.cuerpoHtml).toBe(`<p>${IMG1}</p><p>${marca(R1)}</p>`);
    expect(d.fotosPendientes).toBe(1);
  });

  it("la misma foto dos veces en un artículo: dos cambios iguales las cambian las dos, y repetir no hace nada", async () => {
    const dos = CAMBIOS.filter((c) => c.slug === "repetida");
    await ponerFotos({ db, cambios: [...dos, ...dos], simular: false, log: callar });
    expect((await db.doc("articulos/repetida").get()).data()).toMatchObject({ cuerpoHtml: `<p>${IMG1}</p><p>${IMG1}</p>`, fotosPendientes: 0 });
    const r2 = await ponerFotos({ db, cambios: [...dos, ...dos], simular: false, log: callar });
    expect(r2.escrituras).toBe(0);
  });

  it("es idempotente: la segunda vez no escribe nada", async () => {
    await ponerFotos({ db, cambios: CAMBIOS, simular: false, log: callar });
    const r2 = await ponerFotos({ db, cambios: CAMBIOS, simular: false, log: callar });
    expect(r2.escrituras).toBe(0);
    expect(r2.aplicados).toBe(0);
    expect(r2.articulos).toEqual([]);
    expect(r2.yaPuestos.length).toBe(3);
    expect((await db.collection("articulos/dos/versiones").get()).size).toBe(1);
  });

  it("no toca un cuerpo editado a mano que ya no tiene la marca", async () => {
    const editado = "<p>Reescrito por Ana</p>";
    await db.doc("articulos/dos").update({ cuerpoHtml: editado, actualizadoPor: "ana@eoc.es" });
    const r = await ponerFotos({ db, cambios: CAMBIOS.filter((c) => c.slug === "dos"), simular: false, log: callar });
    expect(r.aplicados).toBe(0);
    expect(r.noEncontrados.length).toBe(2);
    const d = (await db.doc("articulos/dos").get()).data();
    expect(d).toMatchObject({ cuerpoHtml: editado, actualizadoPor: "ana@eoc.es" });
  });

  it("si cambia solo una de las dos marcas, deja la otra y su contador", async () => {
    await db.doc("articulos/dos").update({ cuerpoHtml: `<p>${marca(R1)}</p><p>editado</p>` });
    const r = await ponerFotos({ db, cambios: CAMBIOS.filter((c) => c.slug === "dos"), simular: false, log: callar });
    expect(r.aplicados).toBe(1);
    const d = (await db.doc("articulos/dos").get()).data();
    expect(d.cuerpoHtml).toBe(`<p>${IMG1}</p><p>editado</p>`);
    expect(d.fotosPendientes).toBe(0);
  });

  it("rechaza cambios mal formados sin tocar nada", async () => {
    const r = await ponerFotos({ db, cambios: [{ slug: "dos", buscar: "<p>texto</p>", poner: IMG1 }], simular: false, log: callar });
    expect(r.rechazados.length).toBe(1);
    expect(r.escrituras).toBe(0);
    expect((await db.doc("articulos/dos").get()).data().cuerpoHtml).toBe(CUERPOS.dos);
  });

  it("simular no escribe nada", async () => {
    const r = await ponerFotos({ db, cambios: CAMBIOS, simular: true, log: callar });
    expect(r.aplicados).toBe(3);
    expect(r.escrituras).toBe(0);
    expect((await db.doc("articulos/dos").get()).data().cuerpoHtml).toBe(CUERPOS.dos);
    expect((await sistema()).publicarPendiente).toBe(false);
  });
});
