// Ejecuta un comando (p. ej. firebase) con el Java portatil del proyecto en el PATH.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { delimiter, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raizJdk = resolve(aqui, "..", "..", ".herramientas", "jdk");
const env = { ...process.env };
if (existsSync(raizJdk)) {
  for (const d of readdirSync(raizJdk)) {
    const bin = join(raizJdk, d, "bin");
    if (existsSync(bin)) {
      const clave = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
      env[clave] = bin + delimiter + (env[clave] ?? "");
      env.JAVA_HOME = join(raizJdk, d);
      break;
    }
  }
}
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("Uso: node scripts/con-java.mjs <comando> [args]");
  process.exit(2);
}
// Cada argumento se entrecomilla para que shell:true no lo parta (p. ej. el comando de emulators:exec).
const comillas = (a) => (/[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a);
const hijo = spawn(cmd, args.map(comillas), { stdio: "inherit", env, shell: true });
hijo.on("exit", (c) => process.exit(c ?? 1));
