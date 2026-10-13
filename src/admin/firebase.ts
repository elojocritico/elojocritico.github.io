import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { leerConfiguracion } from "../lib/configuracion";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

export { leerConfiguracion };

const config = leerConfiguracion(import.meta.env.PUBLIC_FIREBASE_CONFIG);
export const configurado = config !== null;

let auth: Auth | null = null;
let db: Firestore | null = null;

if (config) {
  const app = getApps()[0] ?? initializeApp(config);
  // App Check va antes de usar Firestore. En el simulador no se usa. Si falta la clave, el panel funciona igual (App Check no estará activo).
  const clave = import.meta.env.PUBLIC_RECAPTCHA_V3;
  if (clave && import.meta.env.PUBLIC_EMULADOR !== "1") {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(clave), isTokenAutoRefreshEnabled: true });
  }
  auth = getAuth(app);
  db = getFirestore(app);
  if (import.meta.env.PUBLIC_EMULADOR === "1" && !(globalThis as { __eocEmu?: boolean }).__eocEmu) {
    (globalThis as { __eocEmu?: boolean }).__eocEmu = true;
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
}

export { auth, db };
