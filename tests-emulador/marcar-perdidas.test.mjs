// Se ejecuta con `npm run test:emulador`.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
    expect((await db.doc("articulos/sinmarcas").get()).data().fotosPendientes).toBe(0);
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

  it("un cuerpo igual al original salvo por la normalización del saneador SÍ se anota", async () => {
    const crudo = `<p>${M}</p><P>texto<br></P><p>${M}</p>`; // el saneador lo reescribe (<P> → <p>, <br> → <br />)
    const normalizado = sanear(crudo);
    expect(normalizado).not.toBe(crudo);
    const d2 = mkdtempSync(join(tmpdir(), "eoc-mp2-"));
    mkdirSync(join(d2, "articulos"));
    writeFileSync(join(d2, "articulos", "normal.json"), JSON.stringify(art("normal", crudo)));
    try {
      await importar({ db, dirContenido: d2, log: callar });
      await db.doc("articulos/normal").update({ cuerpoHtml: normalizado }); // lo que dejó la exportación en el checkout / lo que hay en Firestore
      const r = await marcarPerdidas({ db, dirContenido: d2, perdidas: { normal: [R1, R2] }, log: callar });
      expect(r.anotados).toEqual(["normal"]);
      expect(r.saltados).toEqual([]);
      const d = (await db.doc("articulos/normal").get()).data();
      expect(d.cuerpoHtml).toBe(anotarMarcas(normalizado, [R1, R2]).html);
      expect(d.fotosPendientes).toBe(2);
      // y la segunda pasada no escribe nada
      const r2 = await marcarPerdidas({ db, dirContenido: d2, perdidas: { normal: [R1, R2] }, log: callar });
      expect(r2.escrituras).toBe(0);
      expect(r2.yaAnotados).toBe(1);
    } finally {
      rmSync(d2, { recursive: true, force: true });
    }
  });

  it("no toca el cuerpo de un artículo editado en el panel, lo lista, pero sí actualiza el contador fotosPendientes (sin versión ni autor)", async () => {
    const editado = "<p>Cambiado a mano</p>" + M + M;
    await db.doc("articulos/editado").update({ cuerpoHtml: editado, actualizadoPor: "ana@eoc.es" });
    const antes = (await db.doc("articulos/editado").get()).data();
    const r = await marcarPerdidas({ db, dirContenido: dir, perdidas: PERDIDAS, log: callar });
    expect(r.saltados).toEqual([{ slug: "editado", motivo: "editado desde la importación" }]);
    const d = (await db.doc("articulos/editado").get()).data();
    expect(d).toMatchObject({ cuerpoHtml: editado, actualizadoPor: "ana@eoc.es", actualizadoEn: antes.actualizadoEn });
    expect(d.fotosPendientes).toBe(2); // el contador sí se pone al día
    expect((await db.collection("articulos/editado/versiones").get()).size).toBe(0);
    expect(r.anotados.sort()).toEqual(["dos", "invalida"]);
  });

  it("--base lee el cuerpo original de un commit de git (no de la carpeta actual)", async () => {
    const repo = mkdtempSync(join(tmpdir(), "eoc-mp3-"));
    const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo, encoding: "utf-8" });
    try {
      git("init", "-q");
      mkdirSync(join(repo, "contenido", "articulos"), { recursive: true });
      for (const [s, c] of Object.entries(CUERPOS)) writeFileSync(join(repo, "contenido", "articulos", s + ".json"), JSON.stringify(art(s, c)));
      git("add", "-A");
      git("commit", "-q", "-m", "base");
      const base = git("rev-parse", "HEAD").trim();
      // La carpeta «actual» cambia (como hizo la publicación automática): ya no coincide con Firestore.
      writeFileSync(join(repo, "contenido", "articulos", "dos.json"), JSON.stringify(art("dos", "<p>otra cosa</p>")));
      const dirContenido = join(repo, "contenido");
      const sinBase = await marcarPerdidas({ db, dirContenido, perdidas: PERDIDAS, simular: true, log: callar });
      expect(sinBase.revisados).toBe(4); // «dos» ya no tiene marcas en la carpeta actual
      const r = await marcarPerdidas({ db, dirContenido, base, perdidas: PERDIDAS, log: callar });
      expect(r.revisados).toBe(5);
      expect(r.anotados.sort()).toEqual(["dos", "editado", "invalida"]);
      expect(r.saltados).toEqual([]);
      await expect(marcarPerdidas({ db, dirContenido, base: "no-existe-12345", perdidas: PERDIDAS, log: callar })).rejects.toThrow();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
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

describe("cambiarCuerpos: orden de los lotes", () => {
  it("«publicar pendiente» va en el último lote y cada versión va en el mismo lote que su artículo", async () => {
    const N = 230; // 2 operaciones por artículo: más de 400 → varios lotes
    const slugs = Array.from({ length: N }, (_, i) => "lote-" + String(i).padStart(3, "0"));
    for (let i = 0; i < N; i += 100) {
      const b = db.batch();
      for (const s of slugs.slice(i, i + 100)) b.set(db.doc("articulos/" + s), art(s, "<p>a</p>"));
      await b.commit();
    }
    const commits = [];
    const dbEspia = new Proxy(db, {
      get(t, prop) {
        if (prop !== "batch") return typeof t[prop] === "function" ? t[prop].bind(t) : t[prop];
        return () => {
          const b = t.batch();
          const ops = [];
          commits.push(ops);
          for (const m of ["set", "update"]) {
            const f = b[m].bind(b);
            b[m] = (ref, ...resto) => { ops.push(ref.path); return f(ref, ...resto); };
          }
          return b;
        };
      },
    });
    const r = await cambiarCuerpos(dbEspia, slugs, () => ({ cuerpoHtml: "<p>b</p>" }), { usuario: "t" });
    expect(r.cuerpoCambiado.length).toBe(N);
    const llenos = commits.filter((c) => c.length);
    expect(llenos.length).toBeGreaterThan(1);
    expect(llenos.slice(0, -1).flat()).not.toContain("estado/sistema");
    expect(llenos.at(-1)).toContain("estado/sistema");
    for (const c of llenos) {
      const arts = c.filter((p) => /^articulos\/[^/]+$/.test(p));
      const vers = c.filter((p) => p.includes("/versiones/")).map((p) => p.split("/")[1]);
      expect(vers.sort()).toEqual(arts.map((p) => p.split("/")[1]).sort());
    }
    expect((await sistema()).publicarPendiente).toBe(true);
  });
});
