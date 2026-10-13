// Capa de datos de "Mis artículos" contra el simulador, pasando por las reglas reales (usuarios autenticados).
// Se ejecuta con `npm run test:emulador`.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, collection, setLogLevel } from "firebase/firestore";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  listarArticulos, despublicar, moverSeccion, enviarAPapelera, restaurar, borrarDefinitivamente, POR_PAGINA, ErrorArticulo,
} from "../src/admin/datos/articulos.ts";

setLogLevel("silent");
const ADMIN = "admin@eoc.test", EDITOR = "editor@eoc.test";
let env;
const como = (correo) => env.authenticatedContext("u-" + correo, { email: correo, email_verified: true }).firestore();

const art = (n, extra = {}) => ({
  slug: "art-" + n, titulo: "Artículo " + n, subtitulo: "", cuerpoHtml: "<p>x</p>", extracto: "", portada: null, autor: "A",
  secciones: ["historia"], etiquetas: [], estado: "publicado", fechaPublicacion: "2020-01-01T12:00:00+02:00", destacado: false,
  creadoEn: "2020-01-01T12:00:00+02:00", actualizadoEn: "2020-01-01T12:00:00+02:00", actualizadoPor: "migración", enPapeleraDesde: null, ...extra,
});
const sembrar = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-elojocritico",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await sembrar(async (db) => {
    await setDoc(doc(db, "ajustes/global"), { usuarios: { [ADMIN]: "admin", [EDITOR]: "editor" } });
  });
});

describe("listarArticulos", () => {
  it("pagina de 25 en 25, del cambio más reciente al más antiguo, sin la papelera", async () => {
    await sembrar(async (db) => {
      for (let i = 0; i < 30; i++) {
        await setDoc(doc(db, "articulos/a" + i), art(i, { actualizadoEn: `2021-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z` }));
      }
      await setDoc(doc(db, "articulos/papelera1"), art(99, { estado: "papelera", actualizadoEn: "2030-01-01T00:00:00.000Z" }));
    });
    const db = como(EDITOR);
    const p1 = await listarArticulos(db, {});
    expect(p1.articulos).toHaveLength(POR_PAGINA);
    expect(p1.articulos[0].id).toBe("a29");
    expect(p1.hayMas).toBe(true);
    const p2 = await listarArticulos(db, {}, p1.cursor);
    expect(p2.articulos.map((a) => a.id)).toEqual(["a4", "a3", "a2", "a1", "a0"]);
    expect(p2.hayMas).toBe(false);
    expect(p2.cursor).toBeNull();
  });

  it("filtra por estado y por sección; la papelera solo si se pide", async () => {
    await sembrar(async (db) => {
      await setDoc(doc(db, "articulos/a"), art(1, { estado: "borrador", secciones: ["fraudes"] }));
      await setDoc(doc(db, "articulos/b"), art(2, { estado: "publicado", secciones: ["fraudes", "historia"] }));
      await setDoc(doc(db, "articulos/c"), art(3, { estado: "programado", secciones: ["historia"] }));
      await setDoc(doc(db, "articulos/d"), art(4, { estado: "papelera", secciones: ["fraudes"] }));
    });
    const db = como(EDITOR);
    const ids = async (f) => (await listarArticulos(db, f)).articulos.map((a) => a.id).sort();
    expect(await ids({})).toEqual(["a", "b", "c"]);
    expect(await ids({ estado: "borrador" })).toEqual(["a"]);
    expect(await ids({ estado: "papelera" })).toEqual(["d"]);
    expect(await ids({ seccion: "fraudes" })).toEqual(["a", "b"]);
    expect(await ids({ seccion: "fraudes", estado: "publicado" })).toEqual(["b"]);
    expect(await ids({ estado: "todos" })).toEqual(["a", "b", "c"]);
  });

  it("sin índice de títulos: búsqueda simple por el principio del título", async () => {
    await sembrar(async (db) => {
      await setDoc(doc(db, "articulos/a"), art(1, { titulo: "Roswell y los mitos" }));
      await setDoc(doc(db, "articulos/b"), art(2, { titulo: "Roswell 1947" }));
      await setDoc(doc(db, "articulos/c"), art(3, { titulo: "El caso Roswell" }));
      await setDoc(doc(db, "articulos/d"), art(4, { titulo: "Roswell oculto", estado: "borrador" }));
    });
    const db = como(EDITOR);
    const p = await listarArticulos(db, { texto: "Roswell" });
    expect(p.modo).toBe("prefijo");
    expect(p.articulos.map((a) => a.titulo)).toEqual(["Roswell 1947", "Roswell oculto", "Roswell y los mitos"]);
    const q = await listarArticulos(db, { texto: "Roswell", estado: "borrador" });
    expect(q.articulos.map((a) => a.id)).toEqual(["d"]);
  });

  it("con índice de títulos: busca dentro del título, sin tildes ni mayúsculas, y respeta filtros", async () => {
    await sembrar(async (db) => {
      await setDoc(doc(db, "articulos/a"), art(1, { slug: "uno", titulo: "El caso Roswell", actualizadoEn: "2022-01-01T00:00:00.000Z" }));
      await setDoc(doc(db, "articulos/b"), art(2, { slug: "dos", titulo: "Más sobre ROSWELL", actualizadoEn: "2023-01-01T00:00:00.000Z", estado: "borrador" }));
      await setDoc(doc(db, "articulos/c"), art(3, { slug: "tres", titulo: "Roswell en la papelera", estado: "papelera" }));
      await setDoc(doc(db, "articulos/d"), art(4, { slug: "cuatro", titulo: "Otra cosa" }));
      await setDoc(doc(db, "indices/titulos"), { uno: "El caso Roswell", dos: "Más sobre ROSWELL", tres: "Roswell en la papelera", cuatro: "Otra cosa" });
    });
    const db = como(EDITOR);
    const p = await listarArticulos(db, { texto: "mas roswell" });
    expect(p.modo).toBe("indice");
    expect(p.articulos.map((a) => a.id)).toEqual(["b"]);
    const q = await listarArticulos(db, { texto: "roswell" });
    expect(q.articulos.map((a) => a.id)).toEqual(["b", "a"]); // más reciente primero, sin la papelera
    expect((await listarArticulos(db, { texto: "roswell", estado: "papelera" })).articulos.map((a) => a.id)).toEqual(["c"]);
    expect((await listarArticulos(db, { texto: "roswell", estado: "publicado" })).articulos.map((a) => a.id)).toEqual(["a"]);
  });

  it("con índice: más de 25 coincidencias se reparten en páginas usando el cursor", async () => {
    const indice = {};
    await sembrar(async (db) => {
      for (let i = 0; i < 40; i++) {
        await setDoc(doc(db, "articulos/x" + i), art(i, { slug: "s" + i, titulo: "Luces " + i, actualizadoEn: `2021-02-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }));
        indice["s" + i] = "Luces " + i;
      }
      await setDoc(doc(db, "indices/titulos"), indice);
    });
    const db = como(EDITOR);
    const p1 = await listarArticulos(db, { texto: "luces" });
    expect(p1.articulos).toHaveLength(25);
    expect(p1.hayMas).toBe(true);
    const p2 = await listarArticulos(db, { texto: "luces" }, p1.cursor);
    expect(p2.articulos).toHaveLength(15);
    expect(p2.hayMas).toBe(false);
  });
});

describe("acciones", () => {
  const sembrarUno = (extra = {}) => sembrar((db) => setDoc(doc(db, "articulos/a1"), art(1, extra)));
  const leer = async (ruta) => (await getDoc(doc(como(ADMIN), ruta))).data();
  const versiones = async () => (await getDocs(collection(como(ADMIN), "articulos/a1/versiones"))).docs.map((d) => d.data());

  it("despublicar: pasa a borrador, guarda versión y quién lo hizo", async () => {
    await sembrarUno();
    await despublicar(como(EDITOR), "a1", EDITOR);
    const a = await leer("articulos/a1");
    expect(a).toMatchObject({ estado: "borrador", actualizadoPor: EDITOR });
    expect(a.actualizadoEn > "2025").toBe(true);
    expect(a.actualizadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    const v = await versiones();
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ estado: "publicado", titulo: "Artículo 1", actualizadoPor: "migración", guardadoPor: EDITOR });
    expect(v[0].guardadoEn).toBe(a.actualizadoEn);
  });

  it("despublicar un borrador o algo en la papelera da error y no escribe nada", async () => {
    await sembrarUno({ estado: "borrador" });
    await expect(despublicar(como(EDITOR), "a1", EDITOR)).rejects.toMatchObject({ code: "articulo/estado" });
    expect(await versiones()).toHaveLength(0);
  });

  it("mover de sección deja solo esa sección y guarda versión", async () => {
    await sembrarUno({ secciones: ["historia", "fraudes"] });
    await moverSeccion(como(EDITOR), "a1", EDITOR, "ufologia");
    expect((await leer("articulos/a1")).secciones).toEqual(["ufologia"]);
    expect((await versiones())[0].secciones).toEqual(["historia", "fraudes"]);
  });

  it("papelera recuerda el estado anterior y restaurar lo devuelve", async () => {
    await sembrarUno({ estado: "programado" });
    await enviarAPapelera(como(EDITOR), "a1", EDITOR);
    let a = await leer("articulos/a1");
    expect(a).toMatchObject({ estado: "papelera", estadoAntesDePapelera: "programado" });
    expect(a.enPapeleraDesde).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await restaurar(como(EDITOR), "a1", EDITOR);
    a = await leer("articulos/a1");
    expect(a).toMatchObject({ estado: "programado", estadoAntesDePapelera: null, enPapeleraDesde: null });
    expect(await versiones()).toHaveLength(2);
  });

  it("restaurar sin estado anterior guardado (p. ej. papelera antigua) devuelve a borrador", async () => {
    await sembrarUno({ estado: "papelera", enPapeleraDesde: "2026-01-01T00:00:00.000Z" });
    await restaurar(como(EDITOR), "a1", EDITOR);
    expect((await leer("articulos/a1")).estado).toBe("borrador");
  });

  it("nunca escribe 'migración' ni un usuario vacío como autor del cambio", async () => {
    await sembrarUno();
    await expect(despublicar(como(EDITOR), "a1", "migración")).rejects.toBeInstanceOf(ErrorArticulo);
    await expect(despublicar(como(EDITOR), "a1", "")).rejects.toBeInstanceOf(ErrorArticulo);
    expect((await leer("articulos/a1")).estado).toBe("publicado");
  });

  it("un artículo que ya no existe da un error claro", async () => {
    await expect(enviarAPapelera(como(EDITOR), "no-hay", EDITOR)).rejects.toMatchObject({ code: "articulo/no-existe" });
  });

  it("borrar definitivamente: solo admin, solo desde la papelera; borra también las versiones", async () => {
    await sembrarUno({ estado: "papelera" });
    await sembrar(async (db) => {
      await setDoc(doc(db, "articulos/a1/versiones/v1"), { titulo: "v1" });
      await setDoc(doc(db, "articulos/a1/versiones/v2"), { titulo: "v2" });
    });
    await expect(borrarDefinitivamente(como(EDITOR), "a1", "editor")).rejects.toMatchObject({ code: "articulo/solo-admin" });
    // Aunque el editor se saltase la comprobación del panel, las reglas lo impiden.
    await assertFails(borrarDefinitivamente(como(EDITOR), "a1", "admin"));
    expect(await leer("articulos/a1")).toBeDefined();
    await borrarDefinitivamente(como(ADMIN), "a1", "admin");
    expect(await leer("articulos/a1")).toBeUndefined();
    expect(await versiones()).toHaveLength(0);
  });

  it("borrar definitivamente algo que no está en la papelera se rechaza", async () => {
    await sembrarUno();
    await expect(borrarDefinitivamente(como(ADMIN), "a1", "admin")).rejects.toMatchObject({ code: "articulo/estado" });
    expect(await leer("articulos/a1")).toBeDefined();
  });
});
