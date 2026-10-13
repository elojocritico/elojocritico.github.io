// Se ejecuta con `npm run test:emulador` (firebase emulators:exec con Auth + Firestore).
import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { crearAdmin, iniciarAdmin } from "../scripts/crear-admin.mjs";

iniciarAdmin();
const auth = getAuth();
const db = getFirestore();

async function limpiar() {
  const { users } = await auth.listUsers();
  await auth.deleteUsers(users.map((u) => u.uid));
  await db.recursiveDelete(db.collection("ajustes"));
  await db.recursiveDelete(db.collection("estado"));
}

beforeEach(limpiar);

describe("crear-admin (simulador)", () => {
  it("crea usuario verificado, ajustes/global y estado/sistema desde cero", async () => {
    const r = await crearAdmin({ correo: "Jefe@Ejemplo.es", contrasena: "clave-segura-1" });
    expect(r).toEqual({ email: "jefe@ejemplo.es", usuarioNuevo: true });
    const u = await auth.getUserByEmail("jefe@ejemplo.es");
    expect(u.emailVerified).toBe(true);
    const ajustes = (await db.doc("ajustes/global").get()).data();
    expect(ajustes).toEqual({
      usuarios: { "jefe@ejemplo.es": "admin" },
      destacado: null,
      enlaces: [],
      queEsEoc: { titulo: "", cuerpoHtml: "" },
      adsense: { activo: false, cliente: "", bloque: "" },
    });
    const estado = (await db.doc("estado/sistema").get()).data();
    expect(estado).toMatchObject({ publicarPendiente: false, ultimaPublicacion: null, ultimaCopia: null });
  });

  it("si ajustes/global existe, anade el admin sin tocar el resto ni los otros usuarios", async () => {
    await db.doc("ajustes/global").set({
      usuarios: { "ana@x.es": "editor" },
      destacado: "mi-articulo",
      enlaces: [{ texto: "a", url: "/a" }],
      queEsEoc: { titulo: "T", cuerpoHtml: "<p>x</p>" },
      adsense: { activo: true, cliente: "c", bloque: "b" },
    });
    await db.doc("estado/sistema").set({ publicarPendiente: true });
    await crearAdmin({ correo: "jefe@ejemplo.es", contrasena: "clave-segura-1" });
    const a = (await db.doc("ajustes/global").get()).data();
    expect(a.usuarios).toEqual({ "ana@x.es": "editor", "jefe@ejemplo.es": "admin" });
    expect(a.destacado).toBe("mi-articulo");
    expect(a.adsense.activo).toBe(true);
    expect((await db.doc("estado/sistema").get()).data()).toEqual({ publicarPendiente: true });
  });

  it("si la cuenta ya existe, la deja verificada y cambia la contraseña", async () => {
    await auth.createUser({ email: "jefe@ejemplo.es", password: "vieja-clave-1", emailVerified: false });
    const r = await crearAdmin({ correo: "jefe@ejemplo.es", contrasena: "nueva-clave-2" });
    expect(r.usuarioNuevo).toBe(false);
    expect((await auth.getUserByEmail("jefe@ejemplo.es")).emailVerified).toBe(true);
  });

  it("rechaza correos y contraseñas malos", async () => {
    await expect(crearAdmin({ correo: "no-es-correo", contrasena: "clave-segura-1" })).rejects.toThrow(/correo/);
    await expect(crearAdmin({ correo: "a@b.es", contrasena: "123" })).rejects.toThrow(/contraseña/);
  });

  it("funciona como comando: node scripts/crear-admin.mjs correo contraseña", () => {
    const r = spawnSync(process.execPath, ["scripts/crear-admin.mjs", "cli@ejemplo.es", "clave-segura-1"], { encoding: "utf-8", env: process.env, timeout: 30000 });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("cli@ejemplo.es es administrador");
  });

  it("acepta la contraseña por CONTRASENA_ADMIN y avisa si la cuenta ya existía", () => {
    const env = { ...process.env, CONTRASENA_ADMIN: "clave-segura-1" };
    const a = spawnSync(process.execPath, ["scripts/crear-admin.mjs", "env@ejemplo.es"], { encoding: "utf-8", env, timeout: 30000 });
    expect(a.status, a.stderr).toBe(0);
    expect(a.stderr).not.toContain("Atención");
    const b = spawnSync(process.execPath, ["scripts/crear-admin.mjs", "env@ejemplo.es"], { encoding: "utf-8", env, timeout: 30000 });
    expect(b.status, b.stderr).toBe(0);
    expect(b.stderr).toContain("ya existía y su contraseña se ha cambiado");
  });
});
