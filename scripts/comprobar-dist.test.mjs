import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITE_BYTES_CLOUDFLARE, LIMITE_FICHEROS_CLOUDFLARE, comprobarCloudflare, comprobarDist, contarFicheros, rastrosDelSimulador } from "./comprobar-dist.mjs";

const ENV_OK = { PUBLIC_FIREBASE_CONFIG: '{"apiKey":"x"}', PUBLIC_RECAPTCHA_V3: "clave-de-sitio", PUBLIC_CLOUDINARY_NUBE: "nube", PUBLIC_CLOUDINARY_PRESET: "preset" };

function montar() {
  const raiz = mkdtempSync(join(tmpdir(), "eocd-"));
  const dist = join(raiz, "dist"), imagenes = join(raiz, "imagenes");
  mkdirSync(join(dist, "admin"), { recursive: true });
  mkdirSync(join(imagenes, "2020"), { recursive: true });
  mkdirSync(join(imagenes, ".git"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<p>hola</p>");
  writeFileSync(join(dist, "admin", "index.html"), "<script>const c={apiKey:1}</script>");
  writeFileSync(join(imagenes, "2020", "a.webp"), "x");
  writeFileSync(join(imagenes, "2020", "b.webp"), "x");
  writeFileSync(join(imagenes, ".git", "HEAD"), "ref");
  return { dist, imagenes };
}

it("un dist correcto no da problemas", () => {
  const { dist, imagenes } = montar();
  expect(comprobarDist({ dist, env: ENV_OK })).toEqual([]);
});
it("detecta rastros del simulador en cualquier fichero de texto", () => {
  const { dist, imagenes } = montar();
  writeFileSync(join(dist, "admin", "app.js"), 'connectFirestoreEmulator(db,"127.0.0.1:8080")');
  writeFileSync(join(dist, "index.html"), "projectId: demo-elojocritico");
  expect(rastrosDelSimulador(dist).sort()).toEqual(["127.0.0.1:8080 en admin/app.js", "demo-elojocritico en index.html"]);
  const p = comprobarDist({ dist, env: ENV_OK });
  expect(p).toHaveLength(1);
  expect(p[0]).toContain("simulador");
});
it("exige las variables de Cloudinary, Firebase y reCAPTCHA y que no esté PUBLIC_EMULADOR", () => {
  const { dist, imagenes } = montar();
  const p = comprobarDist({ dist, env: { PUBLIC_EMULADOR: "1", PUBLIC_CLOUDINARY_NUBE: "  " } }).join("\n");
  expect(p).toMatch(/PUBLIC_EMULADOR/);
  expect(p).toMatch(/PUBLIC_FIREBASE_CONFIG/);
  expect(p).toMatch(/PUBLIC_RECAPTCHA_V3/);
  expect(p).toMatch(/PUBLIC_CLOUDINARY_NUBE/);
  expect(p).toMatch(/PUBLIC_CLOUDINARY_PRESET/);
});
it("los límites de Cloudflare NO forman parte de comprobarDist (no bloquean GitHub Pages)", () => {
  const { dist } = montar();
  for (let n = 0; n < 30; n++) writeFileSync(join(dist, `f${n}.html`), "x");
  expect(comprobarDist({ dist, env: ENV_OK })).toEqual([]);
});
it("cuenta los ficheros de la carpeta de la copia de Cloudflare", () => {
  const { dist, imagenes } = montar();
  expect(contarFicheros(dist)).toBe(2);
  expect(contarFicheros(imagenes)).toBe(3);
});
it("comprobarCloudflare: falla si se llega al límite de ficheros (20.000 por defecto)", () => {
  const { dist } = montar(); // 2 ficheros
  expect(comprobarCloudflare(dist, { limite: 3 })).toEqual([]);
  const p = comprobarCloudflare(dist, { limite: 2 });
  expect(p).toHaveLength(1);
  expect(p[0]).toMatch(/2 ficheros \(el límite es 2\)/);
  expect(LIMITE_FICHEROS_CLOUDFLARE).toBe(20000);
});
it("comprobarCloudflare: falla si un fichero llega a 25 MiB", () => {
  const { dist } = montar();
  writeFileSync(join(dist, "admin", "grande.bin"), Buffer.alloc(1024));
  expect(comprobarCloudflare(dist, { maxBytes: 2048 })).toEqual([]);
  const p = comprobarCloudflare(dist, { maxBytes: 1024 });
  expect(p).toHaveLength(1);
  expect(p[0]).toMatch(/25 MiB[\s\S]*admin\/grande\.bin/);
  expect(LIMITE_BYTES_CLOUDFLARE).toBe(25 * 1024 * 1024);
});
it("comprobarCloudflare: si no existe la carpeta, lo dice", () => {
  expect(comprobarCloudflare(join(tmpdir(), "no-existe-eoc-cf"))[0]).toMatch(/No existe/);
});
it("si no existe dist, lo dice", () => {
  expect(comprobarDist({ dist: join(tmpdir(), "no-existe-eoc"), env: ENV_OK })[0]).toMatch(/No existe/);
});
