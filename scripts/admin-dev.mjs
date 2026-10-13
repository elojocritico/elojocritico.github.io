// Arranca la web con el panel conectado al simulador de Firebase (npm run simulador, en otra ventana).
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  PUBLIC_EMULADOR: "1",
  PUBLIC_FIREBASE_CONFIG:
    process.env.PUBLIC_FIREBASE_CONFIG ?? JSON.stringify({ projectId: "demo-elojocritico", apiKey: "demo" }),
};
const hijo = spawn("npx", ["astro", "dev", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
hijo.on("exit", (c) => process.exit(c ?? 1));
