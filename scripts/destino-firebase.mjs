// Decide a que Firebase habla un script de administracion y evita tocar el proyecto real por accidente.
// Simulador: FIRESTORE_EMULATOR_HOST o FIREBASE_AUTH_EMULATOR_HOST definidos.
// Proyecto real: hace falta el indicador --real Y GOOGLE_APPLICATION_CREDENTIALS.
export function resolverDestino(argv = process.argv.slice(2), env = process.env) {
  const emulador = env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST;
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
