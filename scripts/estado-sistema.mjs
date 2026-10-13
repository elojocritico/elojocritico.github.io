// Anota en estado/sistema cuándo terminó cada tarea automática (lo muestra el semáforo del panel).
//
// Uso:  node scripts/estado-sistema.mjs --real [--publicacion] [--medios] [--copia]
//   --publicacion  ultimaPublicacion
//   --medios       ultimaSincronizacionMedios
//   --copia        ultimaCopia
//   --despliegue <sha>  ultimoDespliegue: commit que acaba de desplegarse en GitHub Pages (solo lo escribe el flujo)
// Sin simulador hay que añadir --real (y GOOGLE_APPLICATION_CREDENTIALS); si no, se niega a escribir.
import { getApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fileURLToPath } from "node:url";
import { resolverDestino } from "./destino-firebase.mjs";
import { iniciarAdmin } from "./crear-admin.mjs";

const CAMPOS = { "--publicacion": "ultimaPublicacion", "--medios": "ultimaSincronizacionMedios", "--copia": "ultimaCopia" };

/** Campos de estado/sistema que corresponden a los indicadores pedidos (en el orden de CAMPOS), sin el commit del despliegue. */
export function camposAnotar(args) {
  const { banderas } = separar(args);
  return Object.entries(CAMPOS).filter(([flag]) => banderas.includes(flag)).map(([, campo]) => campo);
}

function separar(args) {
  const banderas = [];
  let commit = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--despliegue") {
      commit = args[++i];
      if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error("--despliegue necesita el SHA completo del commit.");
    } else if (args[i] in CAMPOS) banderas.push(args[i]);
    else throw new Error(`Opción desconocida: ${args[i]}`);
  }
  return { banderas, commit };
}

/** Datos a escribir (sin hora): campos con la hora actual y, si se pide, ultimoDespliegue con el SHA. */
export function datosAnotar(args, ahora = new Date()) {
  const { commit } = separar(args);
  const datos = Object.fromEntries(camposAnotar(args).map((c) => [c, ahora.toISOString()]));
  if (commit) datos.ultimoDespliegue = commit;
  return datos;
}

export async function anotarEstado(db, datos) {
  if (!Object.keys(datos).length) return {};
  await db.doc("estado/sistema").set(datos, { merge: true });
  return datos;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const destino = resolverDestino();
    console.log(destino.mensaje);
    const datos = datosAnotar(destino.args);
    if (!Object.keys(datos).length) throw new Error("Indica qué anotar: --publicacion, --medios, --copia y/o --despliegue <sha>.");
    iniciarAdmin();
    const r = await anotarEstado(getFirestore(), datos);
    console.log(`Estado anotado: ${Object.keys(r).join(", ")}`);
  } catch (e) {
    console.error("✗ No se ha podido anotar el estado:", e?.message ?? e);
    process.exitCode = 1;
  } finally {
    try { await deleteApp(getApp()); } catch {}
  }
}
