// Comprobaciones de producción tras `npm run build`. Si algo falla, sale con código 1 y NO se debe desplegar.
//  - dist/ no contiene rastros del simulador (demo-elojocritico, 127.0.0.1:8080).
//  - Las variables PUBLIC_ de Cloudinary, Firebase y reCAPTCHA existen y no se compiló con PUBLIC_EMULADOR.
// Aparte (--cloudflare, justo antes de subir a Cloudflare): la carpeta de la copia tiene menos de 20.000 ficheros y ninguno de 25 MiB o más.
// Uso:  node scripts/comprobar-dist.mjs [dist]
//       node scripts/comprobar-dist.mjs --cloudflare [dist-cloudflare]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMITE_FICHEROS_CLOUDFLARE = 20000;
export const LIMITE_BYTES_CLOUDFLARE = 25 * 1024 * 1024;
const RASTROS = ["demo-elojocritico", "127.0.0.1:8080"];
const EXTENSIONES_TEXTO = new Set([".html", ".js", ".mjs", ".css", ".json", ".xml", ".txt", ".map", ".svg", ".webmanifest"]);

function* ficheros(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* ficheros(p);
    else yield p;
  }
}

export function rastrosDelSimulador(dist) {
  const encontrados = [];
  for (const f of ficheros(dist)) {
    if (!EXTENSIONES_TEXTO.has(extname(f).toLowerCase()) || statSync(f).size > 50 * 1024 * 1024) continue;
    const texto = readFileSync(f, "utf-8");
    for (const r of RASTROS) if (texto.includes(r)) encontrados.push(`${r} en ${f.slice(dist.length + 1).split(sep).join("/")}`);
  }
  return encontrados;
}

/** Ficheros de una carpeta (recursivo). */
export function contarFicheros(carpeta) {
  let n = 0;
  for (const _ of ficheros(carpeta)) n++;
  return n;
}

/**
 * Límites de Cloudflare Pages sobre la carpeta que se va a subir (dist-cloudflare: la web más las imágenes bajo img/):
 * menos de 20.000 ficheros y ninguno de 25 MiB o más. Es una comprobación APARTE de comprobarDist: si falla, solo falla el despliegue
 * en Cloudflare (GitHub Pages no tiene estos límites y no debe quedarse sin publicar por ellos).
 */
export function comprobarCloudflare(carpeta, { limite = LIMITE_FICHEROS_CLOUDFLARE, maxBytes = LIMITE_BYTES_CLOUDFLARE } = {}) {
  if (!existsSync(carpeta)) return [`No existe la carpeta ${carpeta} de la copia de Cloudflare.`];
  const problemas = [];
  let total = 0;
  const grandes = [];
  for (const f of ficheros(carpeta)) {
    total++;
    if (statSync(f).size >= maxBytes) grandes.push(f.slice(carpeta.length + 1).split(sep).join("/"));
  }
  if (total >= limite) problemas.push(`La copia de Cloudflare tendría ${total} ficheros (el límite es ${limite}).`);
  if (grandes.length) problemas.push(`Hay ${grandes.length} fichero(s) de 25 MiB o más, que Cloudflare Pages no admite:\n  ${grandes.slice(0, 20).join("\n  ")}`);
  return problemas;
}

export function comprobarDist({ dist, env = process.env }) {
  if (!existsSync(dist)) return [`No existe la carpeta ${dist}: ¿ha fallado la compilación?`];
  const problemas = [];
  if (env.PUBLIC_EMULADOR) problemas.push("La compilación se hizo con PUBLIC_EMULADOR definido.");
  // PUBLIC_RECAPTCHA_V3 conserva su nombre, pero contiene la clave de sitio de reCAPTCHA Enterprise (App Check).
  for (const v of ["PUBLIC_FIREBASE_CONFIG", "PUBLIC_RECAPTCHA_V3", "PUBLIC_CLOUDINARY_NUBE", "PUBLIC_CLOUDINARY_PRESET"]) {
    if (!String(env[v] ?? "").trim()) problemas.push(`Falta la variable ${v} (variables del repositorio en GitHub).`);
  }
  const rastros = rastrosDelSimulador(dist);
  if (rastros.length) problemas.push(`dist/ contiene rastros del simulador:\n  ${rastros.slice(0, 20).join("\n  ")}`);
  return problemas;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const cloudflare = args[0] === "--cloudflare";
  const carpeta = (cloudflare ? args[1] : args[0]) ?? (cloudflare ? "dist-cloudflare" : "dist");
  const problemas = cloudflare ? comprobarCloudflare(carpeta) : comprobarDist({ dist: carpeta });
  if (problemas.length) {
    console.error((cloudflare ? "✗ NO SE PUEDE SUBIR A CLOUDFLARE:\n- " : "✗ NO SE PUEDE PUBLICAR:\n- ") + problemas.join("\n- "));
    process.exit(1);
  }
  console.log(cloudflare ? `✓ copia de Cloudflare correcta · ${contarFicheros(carpeta)} ficheros` : "✓ dist correcto");
}
