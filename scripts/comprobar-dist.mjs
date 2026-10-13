// Comprobaciones de producción tras `npm run build`. Si algo falla, sale con código 1 y NO se debe desplegar.
//  - dist/ no contiene rastros del simulador (demo-elojocritico, 127.0.0.1:8080).
//  - Las variables PUBLIC_ de Cloudinary y de Firebase existen y no se compiló con PUBLIC_EMULADOR.
//  - La copia de Cloudflare (dist + imágenes bajo img/) tiene menos de 20.000 ficheros (límite de Cloudflare Pages).
// Uso:  node scripts/comprobar-dist.mjs [dist] [carpeta-de-imágenes]    (por defecto: dist y EOC_IMAGENES o ../imagenes)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMITE_FICHEROS_CLOUDFLARE = 20000;
const RASTROS = ["demo-elojocritico", "127.0.0.1:8080"];
const EXTENSIONES_TEXTO = new Set([".html", ".js", ".mjs", ".css", ".json", ".xml", ".txt", ".map", ".svg", ".webmanifest"]);

function* ficheros(dir, saltar = () => false) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (saltar(e, p)) continue;
    if (e.isDirectory()) yield* ficheros(p, saltar);
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

/** Ficheros que tendría dist-cloudflare: dist (sin su img/, que lo sustituyen las imágenes) más las imágenes (sin .git). */
export function contarFicherosCloudflare(dist, imagenes) {
  const imgDeDist = resolve(dist, "img");
  let n = 0;
  for (const _ of ficheros(dist, (e, p) => e.isDirectory() && resolve(p) === imgDeDist)) n++;
  if (imagenes && existsSync(imagenes)) for (const _ of ficheros(imagenes, (e) => e.isDirectory() && e.name === ".git")) n++;
  return n;
}

export function comprobarDist({ dist, imagenes, env = process.env, limite = LIMITE_FICHEROS_CLOUDFLARE }) {
  if (!existsSync(dist)) return [`No existe la carpeta ${dist}: ¿ha fallado la compilación?`];
  const problemas = [];
  if (env.PUBLIC_EMULADOR) problemas.push("La compilación se hizo con PUBLIC_EMULADOR definido.");
  for (const v of ["PUBLIC_FIREBASE_CONFIG", "PUBLIC_CLOUDINARY_NUBE", "PUBLIC_CLOUDINARY_PRESET"]) {
    if (!String(env[v] ?? "").trim()) problemas.push(`Falta la variable ${v} (variables del repositorio en GitHub).`);
  }
  const rastros = rastrosDelSimulador(dist);
  if (rastros.length) problemas.push(`dist/ contiene rastros del simulador:\n  ${rastros.slice(0, 20).join("\n  ")}`);
  const total = contarFicherosCloudflare(dist, imagenes);
  if (total >= limite) problemas.push(`La copia de Cloudflare tendría ${total} ficheros (el límite es ${limite}).`);
  return problemas;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const dist = process.argv[2] ?? "dist";
  const imagenes = process.argv[3] ?? process.env.EOC_IMAGENES ?? resolve("..", "imagenes");
  const problemas = comprobarDist({ dist, imagenes });
  if (problemas.length) {
    console.error("✗ NO SE PUEDE PUBLICAR:\n- " + problemas.join("\n- "));
    process.exit(1);
  }
  console.log(`✓ dist correcto · ${contarFicherosCloudflare(dist, imagenes)} ficheros en la copia de Cloudflare`);
}
