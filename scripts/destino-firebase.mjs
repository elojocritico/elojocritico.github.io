// Decide a que Firebase habla un script de administracion y evita tocar el proyecto real por accidente.
// Simulador: FIRESTORE_EMULATOR_HOST o FIREBASE_AUTH_EMULATOR_HOST definidos.
// Proyecto real: hace falta el indicador --real Y GOOGLE_APPLICATION_CREDENTIALS.
// servicios: los que usa el script ("firestore", "auth"); el modo simulador exige el simulador de todos ellos.
const VARIABLES = { firestore: "FIRESTORE_EMULATOR_HOST", auth: "FIREBASE_AUTH_EMULATOR_HOST" };
export function resolverDestino(argv = process.argv.slice(2), env = process.env, servicios = ["firestore"]) {
  const hay = Object.values(VARIABLES).filter((v) => env[v]);
  const faltan = servicios.map((x) => VARIABLES[x]).filter((v) => !env[v]);
  if (hay.length && faltan.length) {
    throw new Error(
      "Configuración mezclada: hay un simulador activo, pero falta " + faltan.join(" y ") + ", así que una parte iría al proyecto REAL. No se ha escrito nada.\n" +
        "Arranca todos los simuladores necesarios (npm run simulador) o quita las variables del simulador.",
    );
  }
  const emulador = hay.length > 0;
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT;
  const args = argv.filter((a) => a !== "--real");
  if (emulador) return { real: false, projectId: projectId || "demo-elojocritico", args, mensaje: `Destino: simulador (${projectId || "demo-elojocritico"})` };
  if (!argv.includes("--real")) {
    throw new Error(
      "No hay simulador activo, así que este comando tocaría el proyecto REAL. No se ha escrito nada.\n" +
        "Si de verdad quieres hacerlo, añade --real (y define GOOGLE_APPLICATION_CREDENTIALS). Para probar, usa el simulador.",
    );
  }
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS (la clave de servicio) para trabajar con el proyecto real. No se ha escrito nada.");
  return { real: true, projectId, args, mensaje: `Destino: proyecto REAL ${projectId ?? "(el de la clave de servicio)"}` };
}
