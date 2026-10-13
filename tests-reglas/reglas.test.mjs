import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, serverTimestamp, setLogLevel, FieldPath } from "firebase/firestore";
import assert from "node:assert/strict";
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";

setLogLevel("silent");
let env;
const ADMIN = "admin@eoc.test", EDITOR = "editor@eoc.test", SINPAPEL = "otro@eoc.test", FUERA = "intruso@eoc.test";
const auth = (e, verificado = true) => env.authenticatedContext("u-" + e, { email: e, email_verified: verificado }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

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
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "ajustes/global"), {
      destacado: null, enlaces: [], queEsEoc: { titulo: "", cuerpoHtml: "" },
      adsense: { activo: false, cliente: "", bloque: "" },
      usuarios: { [ADMIN]: "admin", [EDITOR]: "editor", [SINPAPEL]: "lector" },
    });
    await setDoc(doc(db, "articulos/a1"), { titulo: "Hola", estado: "publicado" });
    await setDoc(doc(db, "articulos/a1/versiones/v1"), { titulo: "Hola", guardadoPor: EDITOR });
    await setDoc(doc(db, "comentarios/c1"), { articuloSlug: "x", nombre: "N", correo: "p@q.r", texto: "t", respuestaA: null, estado: "pendiente", origen: "nuevo" });
    await setDoc(doc(db, "archivoOcultos/x"), { ids: [] });
    await setDoc(doc(db, "estado/sistema"), { publicarPendiente: false, lecturasHoy: 0 });
  });
});

const comentario = (o = {}) => ({
  articuloSlug: "mi-articulo", nombre: "Ana", correo: "ana@x.es", texto: "Buen articulo",
  respuestaA: null, estado: "pendiente", origen: "nuevo", creadoEn: serverTimestamp(), ...o,
});
const sinCampo = (c) => { const x = comentario(); delete x[c]; return x; };

describe("lector malicioso (anonimo)", () => {
  it("crea un comentario valido", async () => {
    await assertSucceeds(addDoc(collection(anon(), "comentarios"), comentario()));
  });
  it("acepta correo vacio y respuestaA string", async () => {
    await assertSucceeds(addDoc(collection(anon(), "comentarios"), comentario({ correo: "", respuestaA: "c1" })));
  });
  it("no puede crear un comentario ya aprobado", async () => {
    await assertFails(addDoc(collection(anon(), "comentarios"), comentario({ estado: "aprobado" })));
  });
  it("no puede crear con origen distinto de nuevo", async () => {
    await assertFails(addDoc(collection(anon(), "comentarios"), comentario({ origen: "archivo" })));
  });
  it("rechaza texto enorme (900 KB, cerca del limite de Firestore)", async () => {
    await assertFails(addDoc(collection(anon(), "comentarios"), comentario({ texto: "a".repeat(900 * 1024) })));
  });
  it("rechaza texto vacio, texto de 3001, nombre vacio o de 61, correo de 121", async () => {
    const c = collection(anon(), "comentarios");
    await assertFails(addDoc(c, comentario({ texto: "" })));
    await assertFails(addDoc(c, comentario({ texto: "a".repeat(3001) })));
    await assertFails(addDoc(c, comentario({ nombre: "" })));
    await assertFails(addDoc(c, comentario({ nombre: "n".repeat(61) })));
    await assertFails(addDoc(c, comentario({ correo: "c".repeat(121) })));
  });
  it("acepta los limites exactos (60, 3000, 120)", async () => {
    await assertSucceeds(addDoc(collection(anon(), "comentarios"), comentario({ nombre: "n".repeat(60), texto: "a".repeat(3000), correo: "c".repeat(120) })));
  });
  it("rechaza campos extra", async () => {
    await assertFails(addDoc(collection(anon(), "comentarios"), comentario({ admin: true })));
  });
  it("rechaza si falta un campo obligatorio", async () => {
    for (const c of ["nombre", "texto", "correo", "articuloSlug", "respuestaA", "creadoEn", "estado", "origen"])
      await assertFails(addDoc(collection(anon(), "comentarios"), sinCampo(c)));
  });
  it("rechaza articuloSlug con barra, vacio o largo", async () => {
    const c = collection(anon(), "comentarios");
    await assertFails(addDoc(c, comentario({ articuloSlug: "a/b" })));
    await assertFails(addDoc(c, comentario({ articuloSlug: "" })));
    await assertFails(addDoc(c, comentario({ articuloSlug: "a".repeat(201) })));
  });
  it("respuestaA: enorme o con barra denegada, id normal permitido", async () => {
    const c = collection(anon(), "comentarios");
    await assertFails(addDoc(c, comentario({ respuestaA: "a".repeat(900 * 1024) })));
    await assertFails(addDoc(c, comentario({ respuestaA: "a/b" })));
    await assertFails(addDoc(c, comentario({ respuestaA: "a".repeat(65) })));
    await assertSucceeds(addDoc(c, comentario({ respuestaA: "Ab_1-xyz" })));
  });
  it("rechaza creadoEn falsificado o respuestaA no string", async () => {
    const c = collection(anon(), "comentarios");
    await assertFails(addDoc(c, comentario({ creadoEn: new Date("2020-01-01") })));
    await assertFails(addDoc(c, comentario({ respuestaA: 5 })));
  });
  it("no puede leer comentarios (ni uno ni la lista)", async () => {
    await assertFails(getDoc(doc(anon(), "comentarios/c1")));
    await assertFails(getDocs(collection(anon(), "comentarios")));
  });
  it("no puede modificar ni borrar comentarios", async () => {
    await assertFails(updateDoc(doc(anon(), "comentarios/c1"), { estado: "aprobado" }));
    await assertFails(deleteDoc(doc(anon(), "comentarios/c1")));
  });
  it("no puede leer ni escribir articulos", async () => {
    await assertFails(getDoc(doc(anon(), "articulos/a1")));
    await assertFails(setDoc(doc(anon(), "articulos/a2"), { titulo: "x" }));
    await assertFails(updateDoc(doc(anon(), "articulos/a1"), { titulo: "x" }));
    await assertFails(deleteDoc(doc(anon(), "articulos/a1")));
  });
  it("no puede leer ni escribir ajustes, estado ni archivoOcultos", async () => {
    await assertFails(getDoc(doc(anon(), "ajustes/global")));
    await assertFails(updateDoc(doc(anon(), "ajustes/global"), { destacado: "x" }));
    await assertFails(getDoc(doc(anon(), "estado/sistema")));
    await assertFails(updateDoc(doc(anon(), "estado/sistema"), { publicarPendiente: true }));
    await assertFails(setDoc(doc(anon(), "archivoOcultos/x"), { ids: ["1"] }));
  });
  it("no puede tocar colecciones desconocidas", async () => {
    await assertFails(setDoc(doc(anon(), "otra/x"), { a: 1 }));
    await assertFails(getDoc(doc(anon(), "otra/x")));
  });
});

describe("usuario con sesion pero no autorizado", () => {
  it("no lee ajustes, articulos ni comentarios, ni escribe", async () => {
    const db = auth(FUERA);
    await assertFails(getDoc(doc(db, "ajustes/global")));
    await assertFails(getDoc(doc(db, "articulos/a1")));
    await assertFails(getDoc(doc(db, "comentarios/c1")));
    await assertFails(setDoc(doc(db, "articulos/a2"), { titulo: "x" }));
  });
  it("si puede crear un comentario publico (como cualquier lector)", async () => {
    await assertSucceeds(addDoc(collection(auth(FUERA), "comentarios"), comentario()));
  });
});

describe("autorizado sin papel de editor/admin", () => {
  it("lee ajustes y estado, pero no articulos, comentarios ni escribe", async () => {
    const db = auth(SINPAPEL);
    await assertSucceeds(getDoc(doc(db, "ajustes/global")));
    await assertSucceeds(getDoc(doc(db, "estado/sistema")));
    await assertFails(getDoc(doc(db, "articulos/a1")));
    await assertFails(getDoc(doc(db, "comentarios/c1")));
    await assertFails(updateDoc(doc(db, "estado/sistema"), { publicarPendiente: true }));
    await assertFails(updateDoc(doc(db, "ajustes/global"), { destacado: "x" }));
  });
});

describe("editor", () => {
  it("lee y escribe articulos", async () => {
    const db = auth(EDITOR);
    await assertSucceeds(getDoc(doc(db, "articulos/a1")));
    await assertSucceeds(setDoc(doc(db, "articulos/a2"), { titulo: "Nuevo" }));
    await assertSucceeds(updateDoc(doc(db, "articulos/a1"), { titulo: "Editado" }));
  });
  it("no puede borrar articulos del todo (ni siquiera en la papelera)", async () => {
    const db = auth(EDITOR);
    await assertFails(deleteDoc(doc(db, "articulos/a1")));
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "articulos/p1"), { estado: "papelera" }); });
    await assertFails(deleteDoc(doc(db, "articulos/p1")));
  });
  it("crea y lee versiones, pero no las modifica ni borra", async () => {
    const db = auth(EDITOR);
    await assertSucceeds(setDoc(doc(db, "articulos/a1/versiones/v2"), { titulo: "v2" }));
    await assertSucceeds(getDoc(doc(db, "articulos/a1/versiones/v1")));
    await assertSucceeds(getDocs(collection(db, "articulos/a1/versiones")));
    await assertFails(updateDoc(doc(db, "articulos/a1/versiones/v1"), { titulo: "x" }));
    await assertFails(setDoc(doc(db, "articulos/a1/versiones/v1"), { titulo: "x" }));
    await assertFails(deleteDoc(doc(db, "articulos/a1/versiones/v1")));
  });
  it("lee comentarios, cambia su estado y los borra", async () => {
    const db = auth(EDITOR);
    await assertSucceeds(getDocs(collection(db, "comentarios")));
    await assertSucceeds(updateDoc(doc(db, "comentarios/c1"), { estado: "aprobado" }));
    await assertSucceeds(deleteDoc(doc(db, "comentarios/c1")));
  });
  it("escribe archivoOcultos", async () => {
    await assertSucceeds(setDoc(doc(auth(EDITOR), "archivoOcultos/x"), { ids: ["1"] }));
  });
  describe("archivoOcultos.textos (copia del texto de los ocultos)", () => {
    const TEXTOS = { "7": { id: "7", autor: "A", fecha: "2018-01-01T10:00", html: "<p>t</p>", respuestaA: null } };
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "archivoOcultos/t"), { ids: ["7"], textos: TEXTOS });
      });
    });
    it("un editor lee los textos", async () => {
      const s = await assertSucceeds(getDoc(doc(auth(EDITOR), "archivoOcultos/t")));
      assert.deepEqual(s.data().textos, TEXTOS);
    });
    it("un lector o alguien sin papel no los lee", async () => {
      await assertFails(getDoc(doc(anon(), "archivoOcultos/t")));
      await assertFails(getDoc(doc(auth(SINPAPEL), "archivoOcultos/t")));
    });
    it("un editor puede cambiar ids sin tocar los textos", async () => {
      await assertSucceeds(setDoc(doc(auth(EDITOR), "archivoOcultos/t"), { ids: ["7", "8"] }, { merge: true }));
      await assertSucceeds(updateDoc(doc(auth(ADMIN), "archivoOcultos/t"), { ids: [] }));
    });
    it("un editor o admin no puede escribir, cambiar ni vaciar los textos", async () => {
      for (const quien of [EDITOR, ADMIN]) {
        const db = auth(quien);
        await assertFails(updateDoc(doc(db, "archivoOcultos/t"), { textos: {} }));
        await assertFails(updateDoc(doc(db, "archivoOcultos/t"), { textos: { "7": { ...TEXTOS["7"], html: "<p>otro</p>" } } }));
        await assertFails(setDoc(doc(db, "archivoOcultos/t"), { ids: ["7"] })); // reemplazar sin textos los borraría
        await assertFails(setDoc(doc(db, "archivoOcultos/nuevo"), { ids: [], textos: TEXTOS }));
        await assertFails(deleteDoc(doc(db, "archivoOcultos/t")));
      }
    });
    it("no admite otros campos", async () => {
      await assertFails(updateDoc(doc(auth(EDITOR), "archivoOcultos/t"), { otro: 1 }));
    });
  });
  it("lee ajustes pero no puede escribirlos", async () => {
    const db = auth(EDITOR);
    await assertSucceeds(getDoc(doc(db, "ajustes/global")));
    await assertFails(updateDoc(doc(db, "ajustes/global"), { destacado: "x" }));
  });
  it("no puede tocar usuarios (ni auto-ascenderse a admin)", async () => {
    const db = auth(EDITOR);
    await assertFails(updateDoc(doc(db, "ajustes/global"), { usuarios: { [EDITOR]: "admin" } }));
    await assertFails(updateDoc(doc(db, "ajustes/global"), new FieldPath("usuarios", "nuevo@x.es"), "editor"));
  });
  it("editor: solo cambia estado en comentarios, con valor valido", async () => {
    const db = auth(EDITOR);
    await assertFails(updateDoc(doc(db, "comentarios/c1"), { texto: "manipulado" }));
    await assertFails(updateDoc(doc(db, "comentarios/c1"), { estado: "aprobado", nombre: "otro" }));
    await assertFails(updateDoc(doc(db, "comentarios/c1"), { estado: "inventado" }));
    await assertSucceeds(updateDoc(doc(db, "comentarios/c1"), { estado: "aprobado" }));
  });
  it("solo escribe publicarPendiente en estado/sistema", async () => {
    const db = auth(EDITOR);
    await assertSucceeds(getDoc(doc(db, "estado/sistema")));
    await assertSucceeds(updateDoc(doc(db, "estado/sistema"), { publicarPendiente: true }));
    await assertFails(updateDoc(doc(db, "estado/sistema"), { publicarPendiente: "si" }));
    await assertFails(updateDoc(doc(db, "estado/sistema"), { lecturasHoy: 99 }));
    await assertFails(updateDoc(doc(db, "estado/sistema"), { publicarPendiente: true, ultimaPublicacion: "x" }));
    await assertFails(setDoc(doc(db, "estado/sistema"), { lecturasHoy: 1 }));
  });
  it("no puede tocar colecciones desconocidas", async () => {
    await assertFails(setDoc(doc(auth(EDITOR), "otra/x"), { a: 1 }));
  });
});

describe("admin", () => {
  it("hace todo lo del editor", async () => {
    const db = auth(ADMIN);
    await assertSucceeds(setDoc(doc(db, "articulos/a3"), { titulo: "x" }));
    await assertSucceeds(updateDoc(doc(db, "comentarios/c1"), { estado: "spam" }));
    await assertSucceeds(setDoc(doc(db, "articulos/a1/versiones/v9"), { titulo: "v" }));
    await assertFails(updateDoc(doc(db, "articulos/a1/versiones/v1"), { titulo: "x" }));
  });
  it("escribe ajustes, incluidos usuarios", async () => {
    const db = auth(ADMIN);
    await assertSucceeds(updateDoc(doc(db, "ajustes/global"), { destacado: "x" }));
    await assertSucceeds(updateDoc(doc(db, "ajustes/global"), new FieldPath("usuarios", "nuevo@x.es"), "editor"));
    const d = (await getDoc(doc(db, "ajustes/global"))).data();
    assert.equal(d.usuarios["nuevo@x.es"], "editor");
    assert.equal(d.usuarios.nuevo, undefined);
  });
  it("no puede borrar ajustes/global ni quedarse sin admins", async () => {
    const db = auth(ADMIN);
    await assertFails(deleteDoc(doc(db, "ajustes/global")));
    await assertFails(updateDoc(doc(db, "ajustes/global"), { usuarios: { [EDITOR]: "editor" } }));
    await assertFails(updateDoc(doc(db, "ajustes/global"), { usuarios: {} }));
    await assertSucceeds(updateDoc(doc(db, "ajustes/global"), { usuarios: { [ADMIN]: "admin", [EDITOR]: "editor" } }));
  });
  it("puede escribir publicarPendiente", async () => {
    await assertSucceeds(updateDoc(doc(auth(ADMIN), "estado/sistema"), { publicarPendiente: true }));
  });
  it("ajustes: publicidad y enlaces se validan (cliente, bloque, máximo 20 enlaces)", async () => {
    const ref = doc(auth(ADMIN), "ajustes/global");
    const ad = (o) => ({ adsense: { activo: true, cliente: "ca-pub-1234567890123456", bloque: "1234567890", ...o } });
    await assertSucceeds(updateDoc(ref, ad({})));
    await assertSucceeds(updateDoc(ref, ad({ activo: false, cliente: "", bloque: "" })));
    await assertFails(updateDoc(ref, ad({ cliente: 'ca-pub-1"><script>' })));
    await assertFails(updateDoc(ref, ad({ cliente: "ca-pub-123" })));
    await assertFails(updateDoc(ref, ad({ cliente: "ca-pub-1234567890123456x" })));
    await assertFails(updateDoc(ref, ad({ bloque: "12345" })));
    await assertFails(updateDoc(ref, ad({ bloque: "123456789a" })));
    await assertFails(updateDoc(ref, ad({ activo: "si" })));
    await assertFails(updateDoc(ref, { adsense: "x" }));
    const enlaces = (n) => Array.from({ length: n }, (_, i) => ({ nombre: "E" + i, url: "https://e.es/" + i }));
    await assertSucceeds(updateDoc(ref, { enlaces: enlaces(20) }));
    await assertFails(updateDoc(ref, { enlaces: enlaces(21) }));
    await assertFails(updateDoc(ref, { enlaces: "javascript:alert(1)" }));
  });
});

describe("correo verificado y mayusculas", () => {
  it("correo en la lista pero sin verificar: denegado", async () => {
    await assertFails(getDoc(doc(auth(EDITOR, false), "articulos/a1")));
    await assertFails(getDoc(doc(auth(ADMIN, false), "ajustes/global")));
    await assertFails(updateDoc(doc(auth(ADMIN, false), "ajustes/global"), { destacado: "x" }));
  });
  it("el correo del token se compara en minusculas", async () => {
    await assertSucceeds(getDoc(doc(auth("Editor@EOC.test"), "articulos/a1")));
  });
});

describe("sin ajustes/global (arranque)", () => {
  it("nadie autenticado obtiene permisos si el documento no existe", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), "ajustes/global")); });
    await assertFails(getDoc(doc(auth(ADMIN), "articulos/a1")));
    await assertFails(setDoc(doc(auth(ADMIN), "ajustes/global"), { usuarios: { [ADMIN]: "admin" } }));
  });
});

describe("borrado definitivo y indice de titulos", () => {
  const aPapelera = () => env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "articulos/p1"), { estado: "papelera" });
    await setDoc(doc(ctx.firestore(), "articulos/p1/versiones/v1"), { titulo: "x" });
    await setDoc(doc(ctx.firestore(), "indices/titulos"), { a1: "Hola" });
  });
  it("el admin borra un articulo de la papelera junto con sus versiones", async () => {
    await aPapelera();
    const db = auth(ADMIN);
    await assertSucceeds(deleteDoc(doc(db, "articulos/p1/versiones/v1")));
    await assertSucceeds(deleteDoc(doc(db, "articulos/p1")));
  });
  it("el admin no borra un articulo que no esta en la papelera, ni sus versiones", async () => {
    const db = auth(ADMIN);
    await assertFails(deleteDoc(doc(db, "articulos/a1")));
    await assertFails(deleteDoc(doc(db, "articulos/a1/versiones/v1")));
  });
  it("el editor no borra versiones de un articulo en la papelera", async () => {
    await aPapelera();
    await assertFails(deleteDoc(doc(auth(EDITOR), "articulos/p1/versiones/v1")));
  });
  it("indices/titulos: lo leen los autorizados; nadie lo escribe desde el cliente", async () => {
    await aPapelera();
    await assertSucceeds(getDoc(doc(auth(EDITOR), "indices/titulos")));
    await assertSucceeds(getDoc(doc(auth(ADMIN), "indices/titulos")));
    await assertFails(getDoc(doc(anon(), "indices/titulos")));
    await assertFails(getDoc(doc(auth(SINPAPEL), "indices/titulos")));
    await assertFails(getDoc(doc(auth(FUERA), "indices/titulos")));
    await assertFails(setDoc(doc(auth(ADMIN), "indices/titulos"), { x: "y" }));
    await assertFails(updateDoc(doc(auth(EDITOR), "indices/titulos"), { x: "y" }));
    await assertFails(deleteDoc(doc(auth(ADMIN), "indices/titulos")));
  });
});
