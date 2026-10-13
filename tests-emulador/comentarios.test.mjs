// Moderación de comentarios y formulario público contra el simulador, pasando por las reglas reales.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, collection, setLogLevel } from "firebase/firestore";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { listarPendientes, contarPendientes, moderar, titulosDe, leerOcultos, cambiarOculto, POR_PAGINA } from "../src/admin/datos/comentarios.ts";
import { enviarComentario, MENSAJE_FALLO } from "../src/lib/enviarComentario.ts";

setLogLevel("silent");
const ADMIN = "admin@eoc.test", EDITOR = "editor@eoc.test";
let env;
const como = (correo) => env.authenticatedContext("u-" + correo, { email: correo, email_verified: true }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();
const sembrar = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
const com = (n, extra = {}) => ({
  articuloSlug: "art-1", nombre: "Lector " + n, correo: "l" + n + "@x.es", texto: "Texto " + n, respuestaA: null,
  estado: "pendiente", origen: "nuevo", creadoEn: `2024-01-${String(n + 1).padStart(2, "0")}T10:00:00.000Z`, ...extra,
});

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

describe("pendientes y moderación", () => {
  it("lista solo los pendientes, los más antiguos primero, de 25 en 25", async () => {
    await sembrar(async (db) => {
      for (let i = 0; i < 27; i++) await setDoc(doc(db, "comentarios/c" + i), com(i));
      await setDoc(doc(db, "comentarios/ya"), com(0, { estado: "aprobado" }));
    });
    const db = como(EDITOR);
    const p1 = await listarPendientes(db);
    expect(p1.comentarios).toHaveLength(POR_PAGINA);
    expect(p1.comentarios[0].id).toBe("c0");
    expect(p1.hayMas).toBe(true);
    const p2 = await listarPendientes(db, p1.cursor);
    expect(p2.comentarios.map((c) => c.id)).toEqual(["c25", "c26"]);
    expect(p2.hayMas).toBe(false);
  });

  it.each(["aprobado", "rechazado", "spam"])("un editor puede pasar un comentario a %s y no cambia nada más", async (estado) => {
    await sembrar((db) => setDoc(doc(db, "comentarios/c1"), com(1)));
    await moderar(como(EDITOR), "c1", estado);
    const d = (await getDoc(doc(como(EDITOR), "comentarios/c1"))).data();
    expect(d).toMatchObject({ ...com(1), estado });
  });

  it("un lector no puede moderar ni leer comentarios", async () => {
    await sembrar((db) => setDoc(doc(db, "comentarios/c1"), com(1)));
    await expect(moderar(anonimo(), "c1", "aprobado")).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDocs(collection(anonimo(), "comentarios"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("titulosDe devuelve el título de cada dirección", async () => {
    await sembrar(async (db) => {
      await setDoc(doc(db, "articulos/a1"), { slug: "art-1", titulo: "Primero" });
      await setDoc(doc(db, "articulos/a2"), { slug: "art-2", titulo: "Segundo" });
    });
    expect(await titulosDe(como(EDITOR), ["art-1", "art-2", "art-1", "no-existe"])).toEqual({ "art-1": "Primero", "art-2": "Segundo" });
  });
});

describe("publicación pendiente y contador", () => {
  const pendiente = async () => (await getDoc(doc(como(ADMIN), "estado/sistema"))).data().publicarPendiente;
  beforeEach(async () => {
    await sembrar((db) => setDoc(doc(db, "estado/sistema"), { publicarPendiente: false }));
  });

  it("aprobar un comentario deja la marca", async () => {
    await sembrar((db) => setDoc(doc(db, "comentarios/c1"), com(1)));
    await moderar(como(EDITOR), "c1", "aprobado");
    expect(await pendiente()).toBe(true);
  });
  it("rechazar uno pendiente no cambia la web: sin marca", async () => {
    await sembrar((db) => setDoc(doc(db, "comentarios/c1"), com(1)));
    await moderar(como(EDITOR), "c1", "rechazado");
    expect(await pendiente()).toBe(false);
  });
  it("cambiar uno ya aprobado (a spam) sí deja la marca", async () => {
    await sembrar((db) => setDoc(doc(db, "comentarios/c1"), com(1, { estado: "aprobado" })));
    await moderar(como(EDITOR), "c1", "spam");
    expect(await pendiente()).toBe(true);
  });
  it("ocultar o mostrar un comentario del archivo deja la marca", async () => {
    await cambiarOculto(como(EDITOR), "art-1", "10", true);
    expect(await pendiente()).toBe(true);
    await sembrar((db) => setDoc(doc(db, "estado/sistema"), { publicarPendiente: false }));
    await cambiarOculto(como(EDITOR), "art-1", "10", false);
    expect(await pendiente()).toBe(true);
  });
  it("contarPendientes cuenta solo los pendientes, sin leerlos", async () => {
    await sembrar(async (db) => {
      for (let i = 0; i < 4; i++) await setDoc(doc(db, "comentarios/c" + i), com(i));
      await setDoc(doc(db, "comentarios/ya"), com(0, { estado: "aprobado" }));
    });
    expect(await contarPendientes(como(EDITOR))).toBe(4);
  });
});

describe("comentarios del archivo ocultos", () => {
  it("ocultar y mostrar mantienen la lista sin repetidos", async () => {
    const db = como(EDITOR);
    expect(await leerOcultos(db, "art-1")).toEqual([]);
    expect(await cambiarOculto(db, "art-1", "10", true)).toEqual(["10"]);
    expect(await cambiarOculto(db, "art-1", "10", true)).toEqual(["10"]);
    expect(await cambiarOculto(db, "art-1", "11", true)).toEqual(["10", "11"]);
    expect(await leerOcultos(db, "art-1")).toEqual(["10", "11"]);
    expect(await cambiarOculto(db, "art-1", "10", false)).toEqual(["11"]);
    expect(await leerOcultos(db, "art-1")).toEqual(["11"]);
    expect(await leerOcultos(db, "otro")).toEqual([]);
  });

  it("un lector no puede leer ni cambiar los ocultos", async () => {
    await expect(cambiarOculto(anonimo(), "art-1", "10", true)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(leerOcultos(anonimo(), "art-1")).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("formulario público (enviarComentario)", () => {
  const datos = { articuloSlug: "art-1", nombre: "  Ana ", texto: " Hola\nmundo ", correo: "ana@x.es" };

  it("un lector sin sesión crea un comentario pendiente que cumple las reglas", async () => {
    expect(await enviarComentario(anonimo(), datos)).toEqual({ ok: true, enviado: true });
    const [c] = (await sembrarLeer()).docs;
    expect(c.data()).toMatchObject({ articuloSlug: "art-1", nombre: "Ana", texto: "Hola\nmundo", correo: "ana@x.es", respuestaA: null, estado: "pendiente", origen: "nuevo" });
    expect(c.data().creadoEn.toDate).toBeTypeOf("function");
  });

  it("la trampa para robots rellena: parece que ha ido bien pero no se escribe nada", async () => {
    expect(await enviarComentario(anonimo(), { ...datos, trampa: "http://spam" })).toEqual({ ok: true, enviado: false });
    expect((await sembrarLeer()).size).toBe(0);
  });

  it("textos fuera de los límites se rechazan antes de enviar", async () => {
    for (const malo of [{ nombre: "" }, { texto: "   " }, { nombre: "n".repeat(61) }, { texto: "a".repeat(3001) }, { correo: "c".repeat(121) }]) {
      const r = await enviarComentario(anonimo(), { ...datos, ...malo });
      expect(r.ok).toBe(false);
    }
    expect((await sembrarLeer()).size).toBe(0);
  });

  it("si el servidor lo rechaza, devuelve el aviso en llano", async () => {
    const r = await enviarComentario(anonimo(), { ...datos, articuloSlug: "con/barra" });
    expect(r).toEqual({ ok: false, error: MENSAJE_FALLO });
    expect((await sembrarLeer()).size).toBe(0);
  });
});

const sembrarLeer = async () => {
  let r;
  await env.withSecurityRulesDisabled(async (ctx) => { r = await getDocs(collection(ctx.firestore(), "comentarios")); });
  return r;
};
