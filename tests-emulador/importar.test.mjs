// Se ejecuta con `npm run test:emulador`.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getFirestore } from "firebase-admin/firestore";
import { resolverDestino } from "../scripts/destino-firebase.mjs";
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

describe("importar como comando: protección del proyecto real", () => {
  const limpio = () => {
    const env = { ...process.env };
    for (const k of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) delete env[k];
    return env;
  };
  const correr = (args, env) => spawnSync(process.execPath, ["scripts/importar.mjs", ...args], { encoding: "utf-8", env });

  it("sin simulador y sin --real se niega y no escribe nada", async () => {
    const r = correr([dir], limpio());
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--real");
    expect((await db.collection("articulos").get()).size).toBe(0);
  });

  it("con --real pero sin credenciales también se niega", () => {
    const r = correr([dir, "--real"], limpio());
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("GOOGLE_APPLICATION_CREDENTIALS");
  });

  it("con el simulador funciona e indica el destino", async () => {
    const r = correr([dir], process.env);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("Destino: simulador");
    expect((await db.collection("articulos").get()).size).toBe(3);
  });
});

describe("resolverDestino", () => {
  it("anuncia el proyecto real solo con --real y credenciales", () => {
    const d = resolverDestino(["x", "--real"], { GOOGLE_APPLICATION_CREDENTIALS: "k.json", GCLOUD_PROJECT: "eoc" });
    expect(d).toMatchObject({ real: true, args: ["x"], mensaje: "Destino: proyecto REAL eoc" });
  });
});
