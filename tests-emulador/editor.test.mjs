// Guardado del editor de artículos contra el simulador, pasando por las reglas reales (usuarios autenticados).
// Se ejecuta con `npm run test:emulador`.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, collection, setLogLevel } from "firebase/firestore";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { guardarArticulo, listarVersiones, cargarArticulo, existeDireccion, marcarPublicarPendiente, CAMPOS_VACIOS } from "../src/admin/datos/guardar.ts";
import { ErrorArticulo } from "../src/admin/datos/articulos.ts";

setLogLevel("silent");
const ADMIN = "admin@eoc.test", EDITOR = "editor@eoc.test";
let env;
const como = (correo) => env.authenticatedContext("u-" + correo, { email: correo, email_verified: true }).firestore();
const sembrar = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
const campos = (extra = {}) => ({ ...CAMPOS_VACIOS, titulo: "Un título", cuerpoHtml: "<p>hola</p>", secciones: ["historia"], ...extra });
const nuevo = (db, id, extra = {}) =>
  guardarArticulo(db, { id, esNuevo: true, cargadoEn: null, campos: campos(), estado: "borrador", usuario: EDITOR, ...extra });
const codigo = async (promesa) => {
  try { await promesa; } catch (e) { return e instanceof ErrorArticulo ? e.code : "otro:" + (e?.code ?? e?.message); }
  return "ok";
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
    await setDoc(doc(db, "ajustes/global"), { usuarios: { [ADMIN]: "admin", [EDITOR]: "editor" } });
    await setDoc(doc(db, "estado/sistema"), { publicarPendiente: false });
  });
});

describe("guardarArticulo: artículo nuevo", () => {
  it("crea el artículo con la dirección como identificador, fechas en UTC y el correo de quien lo guarda", async () => {
    const db = como(EDITOR);
    const r = await nuevo(db, "mi-articulo", { campos: campos({ etiquetas: ["a"], destacado: true }) });
    const d = (await getDoc(doc(db, "articulos/mi-articulo"))).data();
    expect(d).toMatchObject({
      slug: "mi-articulo", titulo: "Un título", estado: "borrador", destacado: true, etiquetas: ["a"], secciones: ["historia"],
      actualizadoPor: EDITOR, enPapeleraDesde: null, portada: null, actualizadoEn: r.actualizadoEn, creadoEn: r.actualizadoEn,
    });
    for (const f of ["fechaPublicacion", "creadoEn", "actualizadoEn"]) expect(d[f]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
    expect((await getDocs(collection(db, "articulos/mi-articulo/versiones"))).size).toBe(0);
  });

  it("guarda cuántas fotos pendientes (marcas de foto perdida) tiene el texto, y lo actualiza al poner una foto", async () => {
    const db = como(EDITOR);
    const marca = '<span class="img-perdida" data-original="/wp-content/uploads/2014/12/a.jpg">Imagen no recuperada</span>';
    const r = await nuevo(db, "con-fotos", { campos: campos({ cuerpoHtml: `<p>${marca} y ${marca}</p>` }) });
    expect((await getDoc(doc(db, "articulos/con-fotos"))).data().fotosPendientes).toBe(2);
    await guardarArticulo(db, {
      id: "con-fotos", esNuevo: false, cargadoEn: r.actualizadoEn, estado: "borrador", usuario: EDITOR,
      campos: campos({ cuerpoHtml: `<p>${marca} y <img src="https://res.cloudinary.com/x/a.jpg" alt="a"></p>` }),
    });
    expect((await getDoc(doc(db, "articulos/con-fotos"))).data().fotosPendientes).toBe(1);
  });

  it("no pisa un artículo que ya existe con esa dirección", async () => {
    const db = como(EDITOR);
    await nuevo(db, "repetido");
    expect(await codigo(nuevo(db, "repetido", { campos: campos({ titulo: "Otro" }) }))).toBe("articulo/direccion-ocupada");
    expect((await cargarArticulo(db, "repetido")).titulo).toBe("Un título");
    expect(await existeDireccion(db, "repetido")).toBe(true);
    expect(await existeDireccion(db, "libre")).toBe(false);
  });

  it("no guarda sin título ni con el usuario reservado o vacío", async () => {
    const db = como(EDITOR);
    expect(await codigo(nuevo(db, "a", { campos: campos({ titulo: "   " }) }))).toBe("articulo/sin-titulo");
    expect(await codigo(nuevo(db, "b", { usuario: "migración" }))).toBe("articulo/sin-usuario");
    expect(await codigo(nuevo(db, "c", { usuario: " " }))).toBe("articulo/sin-usuario");
    expect(await existeDireccion(db, "a")).toBe(false);
  });
});

describe("guardarArticulo: artículo existente", () => {
  it("cada guardado crea una versión con cómo estaba y conserva campos que el editor no toca", async () => {
    const db = como(EDITOR);
    const n = await nuevo(db, "x");
    await sembrar((a) => setDoc(doc(a, "articulos/x"), { origen: "wp" }, { merge: true }));
    const r = await guardarArticulo(db, {
      id: "x", esNuevo: false, cargadoEn: n.actualizadoEn, campos: campos({ titulo: "Nuevo título" }), estado: "publicado",
      fechaPublicacion: "2026-07-01T07:30:00.000Z", usuario: EDITOR,
    });
    const d = (await getDoc(doc(db, "articulos/x"))).data();
    expect(d).toMatchObject({ titulo: "Nuevo título", estado: "publicado", fechaPublicacion: "2026-07-01T07:30:00.000Z", origen: "wp", creadoEn: n.actualizadoEn });
    expect(r.actualizadoEn > n.actualizadoEn || r.actualizadoEn === d.actualizadoEn).toBe(true);
    const v = await listarVersiones(db, "x");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ titulo: "Un título", estado: "borrador", guardadoPor: EDITOR, actualizadoEn: n.actualizadoEn });
    expect(v[0].guardadoEn).toMatch(/Z$/);
  });

  it("si no se indica fecha de publicación conserva la que tiene", async () => {
    const db = como(EDITOR);
    const n = await nuevo(db, "f", { fechaPublicacion: "2020-01-01T11:00:00.000Z" });
    await guardarArticulo(db, { id: "f", esNuevo: false, cargadoEn: n.actualizadoEn, campos: campos(), estado: "borrador", usuario: EDITOR });
    expect((await cargarArticulo(db, "f")).fechaPublicacion).toBe("2020-01-01T11:00:00.000Z");
  });

  it("avisa de conflicto si alguien lo cambió y no escribe nada; con forzar guarda y deja la versión del otro en el historial", async () => {
    const db = como(EDITOR);
    const n = await nuevo(db, "c");
    // Ana (admin) guarda mientras el editor tenía el artículo abierto
    await guardarArticulo(como(ADMIN), { id: "c", esNuevo: false, cargadoEn: n.actualizadoEn, campos: campos({ titulo: "Cambio de Ana" }), estado: "borrador", usuario: ADMIN });

    const intento = { id: "c", esNuevo: false, cargadoEn: n.actualizadoEn, campos: campos({ titulo: "Mi cambio" }), estado: "borrador", usuario: EDITOR };
    let error;
    try { await guardarArticulo(db, intento); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(ErrorArticulo);
    expect(error.code).toBe("articulo/conflicto");
    expect(error.detalle.actual).toMatchObject({ titulo: "Cambio de Ana", actualizadoPor: ADMIN });
    expect((await cargarArticulo(db, "c")).titulo).toBe("Cambio de Ana");
    expect(await listarVersiones(db, "c")).toHaveLength(1); // solo la de Ana; el intento fallido no escribió nada

    await guardarArticulo(db, { ...intento, forzar: true });
    expect((await cargarArticulo(db, "c")).titulo).toBe("Mi cambio");
    const titulos = (await listarVersiones(db, "c")).map((v) => v.titulo);
    expect(titulos).toContain("Cambio de Ana"); // nada se pierde en silencio
  });

  it("dos guardados a la vez con el mismo punto de partida: uno se guarda y el otro recibe el aviso", async () => {
    const n = await nuevo(como(EDITOR), "carrera");
    const lanzar = (correo, titulo) =>
      codigo(guardarArticulo(como(correo), { id: "carrera", esNuevo: false, cargadoEn: n.actualizadoEn, campos: campos({ titulo }), estado: "borrador", usuario: correo }));
    const res = await Promise.all([lanzar(EDITOR, "De editor"), lanzar(ADMIN, "De admin")]);
    expect(res.sort()).toEqual(["articulo/conflicto", "ok"]);
  });

  it("no existe -> error; en la papelera no se puede editar", async () => {
    const db = como(EDITOR);
    expect(await codigo(guardarArticulo(db, { id: "nada", esNuevo: false, cargadoEn: "x", campos: campos(), estado: "borrador", usuario: EDITOR }))).toBe("articulo/no-existe");
    const n = await nuevo(db, "p");
    await sembrar((a) => setDoc(doc(a, "articulos/p"), { estado: "papelera" }, { merge: true }));
    expect(await codigo(guardarArticulo(db, { id: "p", esNuevo: false, cargadoEn: n.actualizadoEn, campos: campos(), estado: "borrador", usuario: EDITOR }))).toBe("articulo/estado");
  });

  it("un correo sin permiso no puede guardar (las reglas lo impiden)", async () => {
    const intruso = como("intruso@x.es");
    expect(await codigo(nuevo(intruso, "z", { usuario: "intruso@x.es" }))).toBe("otro:permission-denied");
  });
});

describe("marcarPublicarPendiente", () => {
  it("marca que hay cambios por publicar y no falla si no se puede", async () => {
    await marcarPublicarPendiente(como(EDITOR));
    expect((await getDoc(doc(como(EDITOR), "estado/sistema"))).data().publicarPendiente).toBe(true);
    await expect(marcarPublicarPendiente(como("intruso@x.es"))).resolves.toBeUndefined();
  });
});
