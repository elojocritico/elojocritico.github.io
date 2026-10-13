// Crea las cuentas de Auth que piden los administradores desde el panel (colección solicitudesCuenta/{correo}).
// Lo llama el flujo publicar.yml cada hora. Para cada solicitud:
//  - si el correo ya no tiene papel en ajustes/global.usuarios, la borra sin crear nada (defensa extra);
//  - si ya existe un usuario de Auth con ese correo, solo borra la solicitud;
//  - si no existe, crea la cuenta con una contraseña aleatoria que nadie conoce y emailVerified: false, y borra la solicitud.
// La persona elige su contraseña con «¿Has olvidado la contraseña?» en /admin/ (eso también le confirma el correo).
// La solicitud solo se borra cuando la cuenta ya existe. Si una falla, se siguen procesando las demás y el comando sale con código 1.
//
// Uso:  node scripts/crear-cuentas.mjs --real   (sin --real solo funciona contra el simulador de Auth + Firestore)
import { getApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolverDestino } from "./destino-firebase.mjs";
import { iniciarAdmin } from "./crear-admin.mjs";

/** Oculta un correo para los registros (los de GitHub Actions son públicos): n***@e***.es */
export function ocultarCorreo(correo) {
  const [local = "", dominio = ""] = String(correo).split("@");
  const punto = dominio.lastIndexOf(".");
  const nombre = punto > 0 ? dominio.slice(0, punto) : dominio;
  const final = punto > 0 ? dominio.slice(punto) : "";
  return `${local.slice(0, 1)}***@${nombre.slice(0, 1)}***${final}`;
}

/** Devuelve { creadas, existentes, sinPapel, fallidas: [{ correo, motivo }] }. Nunca registra contraseñas. */
export async function crearCuentas({ auth = getAuth(), db = getFirestore(), log = console.log } = {}) {
  const r = { creadas: [], existentes: [], sinPapel: [], fallidas: [] };
  const solicitudes = await db.collection("solicitudesCuenta").get();
  if (solicitudes.empty) {
    log("No hay solicitudes de cuenta.");
    return r;
  }
  const ajustes = await db.doc("ajustes/global").get();
  const usuarios = (ajustes.exists ? ajustes.data()?.usuarios : null) ?? {};
  const conPapel = new Set();
  for (const [k, v] of Object.entries(usuarios)) if (v === "admin" || v === "editor") conPapel.add(k.trim().toLowerCase());

  for (const s of solicitudes.docs) {
    const correo = s.id.trim().toLowerCase();
    const oculto = ocultarCorreo(correo);
    try {
      if (!conPapel.has(correo)) {
        await s.ref.delete();
        r.sinPapel.push(correo);
        log(`- ${oculto}: ya no tiene papel en la lista de usuarios; solicitud borrada, no se crea cuenta.`);
        continue;
      }
      let existia = true;
      try {
        await auth.getUserByEmail(correo);
      } catch (e) {
        if (e?.code !== "auth/user-not-found") throw e;
        existia = false;
      }
      if (!existia) {
        try {
          await auth.createUser({ email: correo, password: randomBytes(24).toString("base64url"), emailVerified: false });
        } catch (e) {
          if (e?.code !== "auth/email-already-exists") throw e;
          existia = true; // la creó otro a la vez
        }
      }
      await s.ref.delete(); // solo cuando la cuenta ya existe
      if (existia) {
        r.existentes.push(correo);
        log(`- ${oculto}: la cuenta ya existía; solicitud borrada.`);
      } else {
        r.creadas.push(correo);
        log(`✓ ${oculto}: cuenta creada.`);
      }
    } catch (e) {
      // Solo el código: el mensaje de firebase-admin puede repetir el correo.
      const motivo = typeof e?.code === "string" ? e.code : "error";
      r.fallidas.push({ correo, motivo });
      console.error(`✗ ${oculto}: no se ha podido atender la solicitud (${motivo}).`);
    }
  }
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const destino = resolverDestino(process.argv.slice(2), process.env, ["firestore", "auth"]);
    console.log(destino.mensaje);
    iniciarAdmin();
    const r = await crearCuentas();
    console.log(`Resumen: ${r.creadas.length} creadas, ${r.existentes.length} ya existían, ${r.sinPapel.length} sin papel, ${r.fallidas.length} con error.`);
    if (r.fallidas.length) process.exitCode = 1;
  } catch (e) {
    console.error("✗ No se han podido crear las cuentas:", typeof e?.code === "string" ? e.code : "error");
    process.exitCode = 1;
  } finally {
    try { await deleteApp(getApp()); } catch {}
  }
}
