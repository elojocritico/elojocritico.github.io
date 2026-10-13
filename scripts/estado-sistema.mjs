// Anota en estado/sistema cuándo terminó cada tarea automática (lo muestra el semáforo del panel).
//
// Uso:  node scripts/estado-sistema.mjs --real [--publicacion] [--medios] [--copia]
//   --publicacion  ultimaPublicacion
//   --medios       ultimaSincronizacionMedios
//   --copia        ultimaCopia
// Sin simulador hay que añadir --real (y GOOGLE_APPLICATION_CREDENTIALS); si no, se niega a escribir.
import { getApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fileURLToPath } from "node:url";
import { resolverDestino } from "./destino-firebase.mjs";
import { iniciarAdmin } from "./crear-admin.mjs";

const CAMPOS = { "--publicacion": "ultimaPublicacion", "--medios": "ultimaSincronizacionMedios", "--copia": "ultimaCopia" };

/** Campos de estado/sistema que corresponden a los indicadores pedidos (en el orden de CAMPOS). */
export function camposAnotar(args) {
  const desconocidos = args.filter((a) => !(a in CAMPOS));
  if (desconocidos.length) throw new Error(`Opción desconocida: ${desconocidos.join(" ")}`);
  return Object.entries(CAMPOS).filter(([flag]) => args.includes(flag)).map(([, campo]) => campo);
}

export async function anotarEstado(db, campos, ahora = new Date()) {
  if (!campos.length) return {};
  const cambio = Object.fromEntries(campos.map((c) => [c, ahora.toISOString()]));
  await db.doc("estado/sistema").set(cambio, { merge: true });
  return cambio;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const destino = resolverDestino();
    console.log(destino.mensaje);
    const campos = camposAnotar(destino.args);
    if (!campos.length) throw new Error("Indica qué anotar: --publicacion, --medios y/o --copia.");
    iniciarAdmin();
    const r = await anotarEstado(getFirestore(), campos);
    console.log(`Estado anotado: ${Object.keys(r).join(", ")}`);
  } catch (e) {
    console.error("✗ No se ha podido anotar el estado:", e?.message ?? e);
    process.exitCode = 1;
  } finally {
    try { await deleteApp(getApp()); } catch {}
  }
}
