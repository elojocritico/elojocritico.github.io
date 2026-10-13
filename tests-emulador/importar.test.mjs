// Se ejecuta con `npm run test:emulador`.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import { iniciarAdmin } from "../scripts/crear-admin.mjs";
import { importar } from "../scripts/importar.mjs";

iniciarAdmin();
const db = getFirestore();
const dir = mkdtempSync(join(tmpdir(), "eoc-imp-"));
mkdirSync(join(dir, "articulos"));
mkdirSync(join(dir, "paginas"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const art = (slug, extra = {}) => ({
  slug, titulo: "T " + slug, subtitulo: "", fecha: "2020-03-04", autor: "A", secciones: ["s"], etiquetas: ["e"],
  portada: null, extracto: "x", cuerpoHtml: "<p>hola</p>", destacado: false, origen: "wp", enlacesExternos: ["http://a"], ...extra,
});
for (const s of ["uno", "dos", "ñandú-tres"]) writeFileSync(join(dir, "articulos", s + ".json"), JSON.stringify(art(s)));
writeFileSync(join(dir, "ajustes.json"), JSON.stringify({ destacado: "uno", enlaces: [{ nombre: "a", url: "/a" }], adsense: { activo: false, cliente: "", bloque: "" } }));
writeFileSync(join(dir, "paginas", "que-es-eoc.json"), JSON.stringify({ titulo: "Qué", cuerpoHtml: "<p>q</p>" }));

const callar = () => {};

beforeEach(async () => {
  await db.recursiveDelete(db.collection("articulos"));
  await db.recursiveDelete(db.collection("ajustes"));
  await db.recursiveDelete(db.collection("estado"));
});

describe("importar (simulador)", () => {
  it("crea artículos, ajustes y estado; la segunda vez no escribe nada", async () => {
    const r = await importar({ db, dirContenido: dir, log: callar });
    expect(r.articulos).toMatchObject({ total: 3, creados: 3, actualizados: 0, sinCambios: 0, editadosEnPanel: 0 });
    const d = (await db.doc("articulos/uno").get()).data();
    expect(d).toMatchObject({
      slug: "uno", estado: "publicado", fechaPublicacion: "2020-03-04T12:00:00+02:00",
      creadoEn: "2020-03-04T12:00:00+02:00", actualizadoEn: "2020-03-04T12:00:00+02:00",
      actualizadoPor: "migración", enPapeleraDesde: null, origen: "wp",
    });
    expect(d.enlacesExternos).toBeUndefined();
    expect((await db.doc("articulos/ñandú-tres").get()).exists).toBe(true);
    const a = (await db.doc("ajustes/global").get()).data();
    expect(a).toMatchObject({ usuarios: {}, destacado: "uno", queEsEoc: { titulo: "Qué", cuerpoHtml: "<p>q</p>" } });
    expect((await db.doc("estado/sistema").get()).exists).toBe(true);

    const r2 = await importar({ db, dirContenido: dir, log: callar });
    expect(r2.escrituras).toBe(0);
    expect(r2.articulos).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 3 });
  });

  it("actualiza un artículo cambiado y respeta los editados en el panel", async () => {
    await importar({ db, dirContenido: dir, log: callar });
    await db.doc("articulos/dos").update({ titulo: "Editado por Ana", actualizadoPor: "ana@x" });
    await db.doc("articulos/uno").update({ titulo: "roto" });
    const r = await importar({ db, dirContenido: dir, log: callar });
    expect(r.articulos).toMatchObject({ creados: 0, actualizados: 1, sinCambios: 1, editadosEnPanel: 1 });
    expect((await db.doc("articulos/dos").get()).data().titulo).toBe("Editado por Ana");
    expect((await db.doc("articulos/uno").get()).data().titulo).toBe("T uno");
  });

  it("conserva usuarios y no pisa ajustes que el panel ya tiene", async () => {
    await db.doc("ajustes/global").set({ usuarios: { "ana@x.es": "admin" }, destacado: "otro" });
    await db.doc("estado/sistema").set({ publicarPendiente: true });
    await importar({ db, dirContenido: dir, log: callar });
    const a = (await db.doc("ajustes/global").get()).data();
    expect(a.usuarios).toEqual({ "ana@x.es": "admin" });
    expect(a.destacado).toBe("otro");
    expect(a.enlaces).toEqual([{ nombre: "a", url: "/a" }]);
    expect(a.queEsEoc.titulo).toBe("Qué");
    expect((await db.doc("estado/sistema").get()).data()).toEqual({ publicarPendiente: true });
  });
});
