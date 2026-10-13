// Ajustes, usuarios y "Publicar cambios" contra el simulador, pasando por las reglas reales.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, FieldPath, setLogLevel } from "firebase/firestore";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { leerAjustes, guardarAjustes, cambiarUsuario, pedirCuenta, ErrorAjustes } from "../src/admin/datos/ajustes.ts";
import { contarCambios, publicarCambios } from "../src/admin/datos/publicar.ts";

setLogLevel("silent");
const ADMIN = "admin@eoc.test", EDITOR = "editor@eoc.test";
let env;
const como = (correo) => env.authenticatedContext("u-" + correo, { email: correo, email_verified: true }).firestore();
const sembrar = async (fn) => {
  let r;
  await env.withSecurityRulesDisabled(async (ctx) => { r = await fn(ctx.firestore()); });
  return r;
};
const leer = async () => (await sembrar((db) => getDoc(doc(db, "ajustes/global")))).data();
const BASE = {
  destacado: null, enlaces: [], queEsEoc: { titulo: "", cuerpoHtml: "" },
  adsense: { activo: false, cliente: "", bloque: "" },
  usuarios: { [ADMIN]: "admin", [EDITOR]: "editor" },
};

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
    await setDoc(doc(db, "ajustes/global"), BASE);
    await setDoc(doc(db, "estado/sistema"), { publicarPendiente: false, ultimaExportacion: null });
  });
});

describe("ajustes", () => {
  it("guardar ajustes deja la marca de publicación pendiente", async () => {
    expect((await sembrar((db) => getDoc(doc(db, "estado/sistema")))).data().publicarPendiente).toBe(false);
    await guardarAjustes(como(ADMIN), ADMIN, "", { destacado: "x" });
    const e = (await sembrar((db) => getDoc(doc(db, "estado/sistema")))).data();
    expect(e.publicarPendiente).toBe(true);
    expect(e.publicarPendienteEn).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("un guardado que falla (conflicto) no deja la marca", async () => {
    await expect(guardarAjustes(como(ADMIN), ADMIN, "otra-version", { destacado: "x" })).rejects.toMatchObject({ code: "ajustes/conflicto" });
    expect((await sembrar((db) => getDoc(doc(db, "estado/sistema")))).data().publicarPendiente).toBe(false);
  });

  it("lee los ajustes con la marca de versión (vacía si nunca se han guardado desde el panel)", async () => {
    const a = await leerAjustes(como(ADMIN));
    expect(a.version).toBe("");
    expect(a.usuarios).toEqual(BASE.usuarios);
  });

  it("guarda solo lo que se cambia, con fecha ISO y el correo de quien guarda", async () => {
    const v = await guardarAjustes(como(ADMIN), ADMIN, "", { destacado: "mi-articulo" });
    const d = await leer();
    expect(d.destacado).toBe("mi-articulo");
    expect(d.adsense).toEqual(BASE.adsense);
    expect(d.actualizadoPor).toBe(ADMIN);
    expect(d.actualizadoEn).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(v).toBe(d.actualizadoEn);
  });

  it("si otra persona guardó entre medias, avisa y no pisa su cambio", async () => {
    const a = await leerAjustes(como(ADMIN));
    await sembrar((db) => setDoc(doc(db, "ajustes/global"), { ...BASE, destacado: "del-otro", actualizadoEn: "2030-01-01T00:00:00.000Z", actualizadoPor: "otro@eoc.test" }));
    await expect(guardarAjustes(como(ADMIN), ADMIN, a.version, { destacado: "mio" })).rejects.toMatchObject({ code: "ajustes/conflicto" });
    expect((await leer()).destacado).toBe("del-otro");
  });

  it("rechaza datos inválidos y a un editor", async () => {
    await expect(guardarAjustes(como(ADMIN), ADMIN, "", { adsense: { activo: true, cliente: "x", bloque: "1" } })).rejects.toBeInstanceOf(ErrorAjustes);
    await expect(guardarAjustes(como(ADMIN), ADMIN, "", { enlaces: [{ nombre: "a", url: "javascript:alert(1)" }] })).rejects.toBeInstanceOf(ErrorAjustes);
    await expect(guardarAjustes(como(ADMIN), "migración", "", { destacado: null })).rejects.toBeInstanceOf(ErrorAjustes);
    await expect(guardarAjustes(como(EDITOR), EDITOR, "", { destacado: "x" })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("sanea el texto de «Qué es EOC»", async () => {
    const sucio = "<p>Hola</p><script>alert(1)</script><img src=x onerror=alert(1)>";
    await guardarAjustes(como(ADMIN), ADMIN, "", { queEsEoc: { titulo: "Qué es", cuerpoHtml: sucio } });
    const q = (await leer()).queEsEoc;
    expect(q.cuerpoHtml).toContain("<p>Hola</p>");
    expect(q.cuerpoHtml).not.toMatch(/script|onerror/);
  });
});

describe("usuarios", () => {
  it("añade con el correo en minúsculas (y con puntos) sin crear campos anidados", async () => {
    const v = (await leerAjustes(como(ADMIN))).version;
    await cambiarUsuario(como(ADMIN), ADMIN, v, "  Nuevo.Nombre@Ejemplo.ES ", "editor");
    const d = await leer();
    expect(d.usuarios["nuevo.nombre@ejemplo.es"]).toBe("editor");
    expect(Object.keys(d.usuarios).sort()).toEqual([ADMIN, EDITOR, "nuevo.nombre@ejemplo.es"].sort());
    expect(d.actualizadoPor).toBe(ADMIN);
  });

  it("cambia el papel y quita un usuario", async () => {
    let v = (await leerAjustes(como(ADMIN))).version;
    v = await cambiarUsuario(como(ADMIN), ADMIN, v, EDITOR, "admin");
    expect((await leer()).usuarios[EDITOR]).toBe("admin");
    await cambiarUsuario(como(ADMIN), ADMIN, v, EDITOR, null);
    expect((await leer()).usuarios[EDITOR]).toBeUndefined();
  });

  it("no deja quitar ni degradar al último administrador", async () => {
    await expect(cambiarUsuario(como(ADMIN), ADMIN, "", ADMIN, null)).rejects.toMatchObject({ code: "ajustes/ultimo-admin" });
    await expect(cambiarUsuario(como(ADMIN), ADMIN, "", ADMIN, "editor")).rejects.toMatchObject({ code: "ajustes/ultimo-admin" });
    expect((await leer()).usuarios[ADMIN]).toBe("admin");
  });

  it("las reglas también lo impiden si alguien se salta la comprobación", async () => {
    await expect(updateDoc(doc(como(ADMIN), "ajustes/global"), new FieldPath("usuarios", ADMIN), "editor")).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("valida correo y papel, y detecta conflicto", async () => {
    await expect(cambiarUsuario(como(ADMIN), ADMIN, "", "no-es-correo", "editor")).rejects.toMatchObject({ code: "ajustes/correo" });
    await expect(cambiarUsuario(como(ADMIN), ADMIN, "", "a@b.es", "superjefe")).rejects.toMatchObject({ code: "ajustes/papel" });
    await expect(cambiarUsuario(como(ADMIN), ADMIN, "vieja", "a@b.es", "editor")).rejects.toMatchObject({ code: "ajustes/conflicto" });
  });

  it("un editor no puede tocar usuarios", async () => {
    await expect(cambiarUsuario(como(EDITOR), EDITOR, "", "a@b.es", "admin")).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("publicar cambios", () => {
  const ISO = "2024-06-01T10:00:00.000Z";

  it("sin exportación previa: nunca publicado", async () => {
    expect(await contarCambios(como(EDITOR))).toEqual({ nunca: true, cambios: null, pendiente: false });
  });

  it("cuenta los artículos cambiados después de la última exportación", async () => {
    await sembrar(async (db) => {
      await setDoc(doc(db, "estado/sistema"), { publicarPendiente: true, ultimaExportacion: ISO });
      for (const [n, f, e] of [
        [1, "2024-05-01T00:00:00.000Z", "publicado"], [2, "2024-06-02T00:00:00.000Z", "publicado"], [3, "2024-06-03T00:00:00.000Z", "programado"],
        [4, "2024-06-04T00:00:00.000Z", "papelera"], [5, "2024-06-05T00:00:00.000Z", "borrador"],
      ]) {
        await setDoc(doc(db, "articulos/a" + n), { slug: "a" + n, titulo: "T" + n, estado: e, actualizadoEn: f });
      }
    });
    // cuenta en todos los estados: despublicar (pasar a borrador) también cambia la web
    expect(await contarCambios(como(EDITOR))).toEqual({ nunca: false, cambios: 4, pendiente: true });
  });

  it("marca publicarPendiente (un editor puede) y, sin dirección, será en menos de 1 hora", async () => {
    const r = await publicarCambios(como(EDITOR), { url: undefined, obtenerToken: async () => "t" });
    expect(r).toEqual({ rapido: false });
    expect((await sembrar((db) => getDoc(doc(db, "estado/sistema")))).data().publicarPendiente).toBe(true);
    expect(typeof (await sembrar((db) => getDoc(doc(db, "estado/sistema")))).data().publicarPendienteEn).toBe("string");
  });

  it("con dirección, envía el token; si responde bien es rápido; si falla, queda programado igual", async () => {
    const f = vi.fn(async () => ({ ok: true }));
    expect(await publicarCambios(como(ADMIN), { url: "https://x.test/p", obtenerToken: async () => "tok", fetchFn: f })).toEqual({ rapido: true });
    expect(f).toHaveBeenCalledWith("https://x.test/p", expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer tok" } }));
    const mal = vi.fn(async () => { throw new Error("red"); });
    expect(await publicarCambios(como(ADMIN), { url: "https://x.test/p", obtenerToken: async () => "tok", fetchFn: mal })).toEqual({ rapido: false });
  });

  it("solo avisa a direcciones https (o localhost) y no sigue redirecciones", async () => {
    const f = vi.fn(async () => ({ ok: true }));
    const r = await publicarCambios(como(ADMIN), { url: "http://evil.test/p", obtenerToken: async () => "tok", fetchFn: f });
    expect(r).toEqual({ rapido: false });
    await publicarCambios(como(ADMIN), { url: "javascript:alert(1)", obtenerToken: async () => "tok", fetchFn: f });
    expect(f).not.toHaveBeenCalled();
    await publicarCambios(como(ADMIN), { url: "http://localhost:8787/p", obtenerToken: async () => "tok", fetchFn: f });
    await publicarCambios(como(ADMIN), { url: "http://127.0.0.1:8787/p", obtenerToken: async () => "tok", fetchFn: f });
    expect(f).toHaveBeenCalledTimes(2);
    await publicarCambios(como(ADMIN), { url: "https://x.test/p", obtenerToken: async () => "tok", fetchFn: f });
    expect(f).toHaveBeenLastCalledWith("https://x.test/p", expect.objectContaining({ redirect: "error" }));
  });

  it("si el token tarda más del tiempo máximo, no se queda colgado", async () => {
    const f = vi.fn();
    const r = await publicarCambios(como(ADMIN), { url: "https://x.test/p", obtenerToken: () => new Promise(() => {}), fetchFn: f, tiempoMs: 50 });
    expect(r).toEqual({ rapido: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("si no se puede escribir la marca, falla y no se llama a la dirección", async () => {
    const f = vi.fn();
    await expect(publicarCambios(como("intruso@x.es"), { url: "https://x.test/p", obtenerToken: async () => "t", fetchFn: f })).rejects.toMatchObject({ code: "permission-denied" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("pedirCuenta (solicitudesCuenta)", () => {
  const solicitud = async (c) => (await sembrar((db) => getDoc(doc(db, "solicitudesCuenta", c)))).data();
  it("un admin anota la solicitud con el correo en minúsculas; repetirla no falla ni la cambia", async () => {
    expect(await pedirCuenta(como(ADMIN), "Admin@Eoc.Test", "  Nueva@Ejemplo.ES ")).toBe(true);
    const s = await solicitud("nueva@ejemplo.es");
    expect(Object.keys(s).sort()).toEqual(["pedidoEn", "pedidoPor"]);
    expect(s.pedidoPor).toBe(ADMIN);
    expect(s.pedidoEn).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(await pedirCuenta(como(ADMIN), ADMIN, "nueva@ejemplo.es")).toBe(false);
    expect(await solicitud("nueva@ejemplo.es")).toEqual(s);
  });
  it("un editor no puede, y un correo malo se rechaza antes de escribir", async () => {
    await expect(pedirCuenta(como(EDITOR), EDITOR, "nueva@ejemplo.es")).rejects.toMatchObject({ code: "permission-denied" });
    await expect(pedirCuenta(como(ADMIN), ADMIN, "no-es-correo")).rejects.toMatchObject({ code: "ajustes/correo" });
    expect(await solicitud("nueva@ejemplo.es")).toBeUndefined();
  });
});
