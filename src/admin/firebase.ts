import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

/** Lee y valida la configuracion; devuelve null si falta o esta mal escrita. */
export function leerConfiguracion(texto: string | undefined): FirebaseOptions | null {
  if (!texto) return null;
  try {
    const c = JSON.parse(texto);
    return c && typeof c === "object" && typeof c.projectId === "string" && typeof c.apiKey === "string" ? c : null;
  } catch {
    return null;
  }
}

const config = leerConfiguracion(import.meta.env.PUBLIC_FIREBASE_CONFIG);
export const configurado = config !== null;

let auth: Auth | null = null;
let db: Firestore | null = null;

if (config) {
  const app = getApps()[0] ?? initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  if (import.meta.env.PUBLIC_EMULADOR === "1" && !(globalThis as { __eocEmu?: boolean }).__eocEmu) {
    (globalThis as { __eocEmu?: boolean }).__eocEmu = true;
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
}

export { auth, db };
