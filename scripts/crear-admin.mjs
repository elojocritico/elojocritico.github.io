// Crea (o actualiza) un administrador: usuario de Auth con el correo confirmado + entrada en ajustes/global.usuarios.
// Tambien deja listos ajustes/global y estado/sistema, que el panel no puede crear por las reglas.
//
// Uso:  node scripts/crear-admin.mjs correo@x.es contraseña   (o CONTRASENA_ADMIN=... node scripts/crear-admin.mjs correo@x.es)
// Sin simulador hay que añadir --real (y GOOGLE_APPLICATION_CREDENTIALS); si no, se niega a escribir.
// Simulador: define FIREBASE_AUTH_EMULATOR_HOST y FIRESTORE_EMULATOR_HOST (los pone `firebase emulators:exec`).
// Proyecto real: define GOOGLE_APPLICATION_CREDENTIALS (y GCLOUD_PROJECT si la clave no trae el proyecto).
import { initializeApp, getApps, getApp, deleteApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { fileURLToPath } from "node:url";
import { resolverDestino } from "./destino-firebase.mjs";

export const AJUSTES_POR_DEFECTO = {
  destacado: null,
  enlaces: [],
  queEsEoc: { titulo: "", cuerpoHtml: "" },
  adsense: { activo: false, cliente: "", bloque: "" },
};

export const ESTADO_POR_DEFECTO = {
  publicarPendiente: false,
  ultimaPublicacion: null,
  ultimaExportacion: null,
  ultimaSincronizacionMedios: null,
  ultimaCopia: null,
  lecturasHoy: null,
};

export function iniciarAdmin() {
  if (getApps().length) return getApps()[0];
  const emulador = process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || (emulador ? "demo-elojocritico" : undefined);
  return initializeApp(emulador ? { projectId } : { credential: applicationDefault(), projectId });
}

export async function crearAdmin({ correo, contrasena, auth = getAuth(), db = getFirestore() }) {
  const email = String(correo ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo no parece válido.");
  if (!contrasena || contrasena.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

  let existia = true;
  try {
    const u = await auth.getUserByEmail(email);
    await auth.updateUser(u.uid, { password: contrasena, emailVerified: true, disabled: false });
  } catch (e) {
    if (e?.code !== "auth/user-not-found") throw e;
    existia = false;
    await auth.createUser({ email, password: contrasena, emailVerified: true });
  }

  const ajustes = db.doc("ajustes/global");
  await db.runTransaction(async (t) => {
    const actual = await t.get(ajustes);
    if (actual.exists) t.set(ajustes, { usuarios: { [email]: "admin" } }, { merge: true });
    else t.set(ajustes, { ...AJUSTES_POR_DEFECTO, usuarios: { [email]: "admin" } });
  });

  const estado = db.doc("estado/sistema");
  await db.runTransaction(async (t) => {
    if (!(await t.get(estado)).exists) t.set(estado, ESTADO_POR_DEFECTO);
  });

  return { email, usuarioNuevo: !existia };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let destino;
  try {
    destino = resolverDestino(process.argv.slice(2), process.env, ["firestore", "auth"]);
  } catch (e) {
    console.error("✗", e.message);
    process.exit(1);
  }
  console.log(destino.mensaje);
  const [correo, contrasenaArg] = destino.args;
  // Mejor por variable de entorno: asi la contraseña no queda en el historial de la terminal.
  const contrasena = contrasenaArg || process.env.CONTRASENA_ADMIN;
  if (!correo || !contrasena) {
    console.error("Uso: node scripts/crear-admin.mjs correo@x.es [contraseña] [--real]  (o define CONTRASENA_ADMIN)");
    process.exit(2);
  }
  try {
    iniciarAdmin();
    const r = await crearAdmin({ correo, contrasena });
    console.log(`✓ ${r.email} es administrador (${r.usuarioNuevo ? "cuenta creada" : "cuenta ya existía"}).`);
    if (!r.usuarioNuevo) console.warn("⚠ Atención: esa cuenta ya existía y su contraseña se ha cambiado por la nueva.");
  } catch (e) {
    console.error("✗ No se ha podido crear el administrador:", e?.message ?? e);
    process.exitCode = 1;
  } finally {
    try { await deleteApp(getApp()); } catch {}
  }
}
