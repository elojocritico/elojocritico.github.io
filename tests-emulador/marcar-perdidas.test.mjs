// Se ejecuta con `npm run test:emulador`.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import { iniciarAdmin } from "../scripts/crear-admin.mjs";
import { importar } from "../scripts/importar.mjs";
import { marcarPerdidas, anotarMarcas, textoInforme, rutaValida } from "../scripts/marcar-perdidas.mjs";
import { cambiarCuerpos } from "../scripts/cambiar-cuerpo.mjs";
import { sanear } from "../src/lib/sanear.ts";

iniciarAdmin();
const db = getFirestore();
const dir = mkdtempSync(join(tmpdir(), "eoc-mp-"));
mkdirSync(join(dir, "articulos"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const M = '<span class="img-perdida">Imagen no recuperada</span>';
const R1 = "/wp-content/uploads/2014/12/a-300x200.jpg";
const R2 = "/wp-content/uploads/2015/01/b.png";
const art = (slug, cuerpoHtml) => ({
  slug, titulo: "T " + slug, subtitulo: "", fecha: "2020-03-04", autor: "A", secciones: ["s"], etiquetas: [],
  portada: null, extracto: "x", cuerpoHtml, destacado: false, origen: "wp",
});
const CUERPOS = {
  dos: `<p>${M}</p><p>texto</p><p>${M}</p>`,
  desajuste: `<p>${M}</p><p>${M}</p><p>${M}</p>`,
  editado: `<p>${M}</p>`,
  sinlista: `<p>${M}</p>`,
  sinmarcas: "<p>nada</p>",
  invalida: `<p>${M}</p><p>${M}</p>`,
};
for (const [s, c] of Object.entries(CUERPOS)) writeFileSync(join(dir, "articulos", s + ".json"), JSON.stringify(art(s, c)));
const PERDIDAS = {
  dos: [R1, R2],
  desajuste: [R1, R2],
  editado: [R1],
  invalida: [R1, "/wp-content/uploads/con espacio.jpg"],
};
const callar = () => {};
const sistema = async () => (await db.doc("estado/sistema").get()).data();

beforeEach(async () => {
  for (const c of ["articulos", "ajustes", "estado", "indices", "borrados"]) await db.recursiveDelete(db.collection(c));
  await importar({ db, dirContenido: dir, log: callar });
});

describe("anotarMarcas / rutaValida", () => {
  it("anota en orden, deja las ya anotadas y detecta el desajuste", () => {
    expect(anotarMarcas(CUERPOS.dos, [R1, R2]).html).toBe(
      `<p><span class="img-perdida" data-original="${R1}">Imagen no recuperada</span></p><p>texto</p><p><span class="img-perdida" data-original="${R2}">Imagen no recuperada</span></p>`);
    const una = anotarMarcas(CUERPOS.dos, [R1, R2]).html;
    expect(anotarMarcas(una, [R1, R2]).html).toBe(una);
    expect(anotarMarcas(CUERPOS.dos, [R1]).desajuste).toBe(true);
    expect(anotarMarcas(CUERPOS.dos, undefined).desajuste).toBe(true);
  });
  it("lo que anota lo conserva el saneador y las rutas raras no se anotan", () => {
    const a = anotarMarcas(CUERPOS.dos, [R1, R2]).html;
    expect(sanear(a)).toBe(a);
    const m = anotarMarcas(CUERPOS.invalida, [R1, "/wp-content/x y.jpg"]);
    expect(m.anotadas).toBe(1);
    expect(m.invalidas).toEqual(["/wp-content/x y.jpg"]);
    for (const mala of ["http://x/wp-content/a.jpg", "/wp-content/../a", "/wp-content/a b", "/otra/a.jpg", ""]) expect(rutaValida(mala), mala).toBe(false);
    expect(rutaValida(R1)).toBe(true);
  });
});

describe("marcarPerdidas (simulador)", () => {
  it("anota solo lo que cuadra, deja versión y marca publicar pendiente", async () => {
    const antes = (await db.doc("articulos/dos").get()).data();
    const r = await marcarPerdidas({ db, dirContenido: dir, perdidas: PERDIDAS, log: callar });
    expect(r.revisados).toBe(5);
    expect(r.anotados.sort()).toEqual(["dos", "editado", "invalida"].sort());
    expect(r.desajustes).toEqual([{ slug: "desajuste", marcas: 3, rutas: 2 }]);
    expect(r.sinLista).toEqual(["sinlista"]);

    const dos = (await db.doc("articulos/dos").get()).data();
    expect(dos.cuerpoHtml).toBe(anotarMarcas(CUERPOS.dos, [R1, R2]).html);
    expect(dos.fotosPendientes).toBe(2);
    expect(dos.actualizadoPor).toBe("script marcar-perdidas");
    expect(dos.actualizadoEn).not.toBe(antes.actualizadoEn);
    expect(dos.titulo).toBe(antes.titulo);

    const versiones = await db.collection("articulos/dos/versiones").get();
    expect(versiones.size).toBe(1);
    expect(versiones.docs[0].data()).toMatchObject({ ...antes, guardadoPor: "script marcar-perdidas" });
    expect(typeof versiones.docs[0].data().guardadoEn).toBe("string");

    const s = await sistema();
    expect(s.publicarPendiente).toBe(true);
    expect(typeof s.publicarPendienteEn).toBe("string");

    // Desajuste y sin lista: el cuerpo no cambia, pero sí el contador y no hay versión ni aviso de publicar.
    for (const slug of ["desajuste", "sinlista"]) {
      const d = (await db.doc(`articulos/${slug}`).get()).data();
      expect(d.cuerpoHtml).toBe(CUERPOS[slug]);
      expect(d.actualizadoPor).toBe("migración");
      expect(d.actualizadoEn).toBe(antes.actualizadoEn);
      expect((await db.collection(`articulos/${slug}/versiones`).get()).size).toBe(0);
    }
    expect((await db.doc("articulos/desajuste").get()).data().fotosPendientes).toBe(3);
    expect((await db.doc("articulos/sinmarcas").get()).data().fotosPendientes).toBeUndefined();
    // Marca con ruta no válida: se anota la buena y la otra queda como estaba.
    expect((await db.doc("articulos/invalida").get()).data().cuerpoHtml).toBe(`<p><span class="img-perdida" data-original="${R1}">Imagen no recuperada</span></p><p>${M}</p>`);
    expect(r.invalidas).toEqual([{ slug: "invalida", rutas: ["/wp-content/uploads/con espacio.jpg"] }]);
    expect(textoInforme(r)).toContain("desajuste: 3 marcas en el cuerpo, 2 rutas");
  });

  it("es idempotente: la segunda vez no escribe nada", async () => {
    await marcarPerdidas({ db, dirContenido: dir, perdidas: PERDIDAS, log: callar });
    const r2 = await marcarPerdidas({ db, dirContenido: dir, perdidas: PERDIDAS, log: callar });
    expect(r2.escrituras).toBe(0);
    expect(r2.anotados).toEqual([]);
    expect(r2.yaAnotados).toBe(3);
    expect(r2.saltados).toEqual([]);
    expect((await db.collection("articulos/dos/versiones").get()).size).toBe(1);
  });

  it("no toca un artículo editado en el panel desde la importación, y lo lista", async () => {
    const editado = "<p>Cambiado a mano</p>" + M;
    await db.doc("articulos/editado").update({ cuerpoHtml: editado, actualizadoPor: "ana@eoc.es" });
    const r = await marcarPerdidas({ db, dirContenido: dir, perdidas: PERDIDAS, log: callar });
    expect(r.saltados).toEqual([{ slug: "editado", motivo: "editado desde la importación" }]);
    const d = (await db.doc("articulos/editado").get()).data();
    expect(d).toMatchObject({ cuerpoHtml: editado, actualizadoPor: "ana@eoc.es" });
    expect(d.fotosPendientes).toBeUndefined();
    expect((await db.collection("articulos/editado/versiones").get()).size).toBe(0);
    expect(r.anotados.sort()).toEqual(["dos", "invalida"]);
  });

  it("--simular no escribe nada", async () => {
    const r = await marcarPerdidas({ db, dirContenido: dir, perdidas: PERDIDAS, simular: true, log: callar });
    expect(r.anotados.length).toBe(3);
    expect(r.escrituras).toBe(0);
    expect((await db.doc("articulos/dos").get()).data().cuerpoHtml).toBe(CUERPOS.dos);
    expect((await sistema()).publicarPendiente).toBe(false);
  });

  it("una edición hecha mientras corre no se pisa (precondición): el lote falla y no queda nada a medias", async () => {
    // db que, justo antes de confirmar el lote, deja que «alguien» guarde el artículo.
    const dbCarrera = new Proxy(db, {
      get(t, prop) {
        if (prop !== "batch") return typeof t[prop] === "function" ? t[prop].bind(t) : t[prop];
        return () => {
          const b = t.batch();
          const confirmar = b.commit.bind(b);
          b.commit = async () => { await t.doc("articulos/dos").update({ titulo: "Otro", actualizadoPor: "ana@eoc.es" }); return confirmar(); };
          return b;
        };
      },
    });
    await expect(marcarPerdidas({ db: dbCarrera, dirContenido: dir, perdidas: PERDIDAS, log: callar })).rejects.toThrow();
    const d = (await db.doc("articulos/dos").get()).data();
    expect(d).toMatchObject({ titulo: "Otro", cuerpoHtml: CUERPOS.dos });
    expect((await db.collection("articulos/dos/versiones").get()).size).toBe(0);
    expect((await sistema()).publicarPendiente).toBe(false);
  });
});

describe("cambiarCuerpos", () => {
  it("se niega a escribir como «migración» o sin usuario", async () => {
    await expect(cambiarCuerpos(db, ["dos"], () => null, { usuario: "migración" })).rejects.toThrow();
    await expect(cambiarCuerpos(db, ["dos"], () => null, { usuario: " " })).rejects.toThrow();
  });
  it("informa de los que no existen", async () => {
    const r = await cambiarCuerpos(db, ["no-existe"], () => ({ cuerpoHtml: "x" }), { usuario: "t" });
    expect(r.noExisten).toEqual(["no-existe"]);
    expect(r.escrituras).toBe(0);
  });
});
