// Se ejecuta con `npm run test:emulador` (firebase emulators:exec con Auth + Firestore).
import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { crearCuentas } from "../scripts/crear-cuentas.mjs";
import { iniciarAdmin } from "../scripts/crear-admin.mjs";

iniciarAdmin();
const auth = getAuth();
const db = getFirestore();
const callar = () => {};
const pedir = (correo) => db.doc(`solicitudesCuenta/${correo}`).set({ pedidoEn: "2026-01-01T00:00:00.000Z", pedidoPor: "jefe@ejemplo.es" });
const existe = async (correo) => (await db.doc(`solicitudesCuenta/${correo}`).get()).exists;

beforeEach(async () => {
  const { users } = await auth.listUsers();
  await auth.deleteUsers(users.map((u) => u.uid));
  await db.recursiveDelete(db.collection("ajustes"));
  await db.recursiveDelete(db.collection("solicitudesCuenta"));
  await db.doc("ajustes/global").set({ usuarios: { "jefe@ejemplo.es": "admin", "nueva@ejemplo.es": "editor", "otra@ejemplo.es": "admin" } });
});

describe("crear-cuentas (simulador)", () => {
  it("sin solicitudes no hace nada", async () => {
    const r = await crearCuentas({ log: callar });
    expect(r).toEqual({ creadas: [], existentes: [], sinPapel: [], fallidas: [] });
  });

  it("crea la cuenta sin verificar y con contraseña, y borra la solicitud", async () => {
    await pedir("nueva@ejemplo.es");
    const r = await crearCuentas({ log: callar });
    expect(r.creadas).toEqual(["nueva@ejemplo.es"]);
    const u = await auth.getUserByEmail("nueva@ejemplo.es");
    expect(u.emailVerified).toBe(false);
    expect(u.disabled).toBe(false);
    expect(u.passwordHash).toBeTruthy(); // tiene contraseña, pero nadie la conoce
    expect(await existe("nueva@ejemplo.es")).toBe(false);
  });

  it("si la cuenta ya existe, no la toca: solo borra la solicitud", async () => {
    await auth.createUser({ email: "nueva@ejemplo.es", password: "clave-que-ya-tenia", emailVerified: true });
    await pedir("nueva@ejemplo.es");
    const r = await crearCuentas({ log: callar });
    expect(r.existentes).toEqual(["nueva@ejemplo.es"]);
    expect((await auth.getUserByEmail("nueva@ejemplo.es")).emailVerified).toBe(true);
    expect(await existe("nueva@ejemplo.es")).toBe(false);
  });

  it("sin papel en la lista de usuarios: borra la solicitud y no crea nada", async () => {
    await pedir("intruso@ejemplo.es");
    const r = await crearCuentas({ log: callar });
    expect(r.sinPapel).toEqual(["intruso@ejemplo.es"]);
    await expect(auth.getUserByEmail("intruso@ejemplo.es")).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(await existe("intruso@ejemplo.es")).toBe(false);
  });

  it("procesa todas; si una falla, sigue con las demás y la deja pendiente", async () => {
    await pedir("nueva@ejemplo.es");
    await pedir("otra@ejemplo.es");
    const authRoto = {
      getUserByEmail: (c) => auth.getUserByEmail(c),
      createUser: (d) => (d.email === "nueva@ejemplo.es" ? Promise.reject(Object.assign(new Error("boom"), { code: "auth/internal-error" })) : auth.createUser(d)),
    };
    const antes = console.error;
    console.error = () => {};
    let r;
    try { r = await crearCuentas({ auth: authRoto, log: callar }); } finally { console.error = antes; }
    expect(r.creadas).toEqual(["otra@ejemplo.es"]);
    expect(r.fallidas).toEqual([{ correo: "nueva@ejemplo.es", motivo: "auth/internal-error" }]);
    expect(await existe("nueva@ejemplo.es")).toBe(true);
    expect(await existe("otra@ejemplo.es")).toBe(false);
  });

  it("como comando: crea la cuenta, sale con 0 y termina solo", async () => {
    await pedir("nueva@ejemplo.es");
    const r = spawnSync(process.execPath, ["scripts/crear-cuentas.mjs"], { encoding: "utf-8", env: process.env, timeout: 30000 });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("nueva@ejemplo.es: cuenta creada");
    expect(r.stdout).toContain("1 creadas");
    expect((await auth.getUserByEmail("nueva@ejemplo.es")).emailVerified).toBe(false);
  });
});
