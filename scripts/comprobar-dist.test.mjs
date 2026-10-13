import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITE_FICHEROS_CLOUDFLARE, comprobarDist, contarFicherosCloudflare, rastrosDelSimulador } from "./comprobar-dist.mjs";

const ENV_OK = { PUBLIC_FIREBASE_CONFIG: '{"apiKey":"x"}', PUBLIC_CLOUDINARY_NUBE: "nube", PUBLIC_CLOUDINARY_PRESET: "preset" };

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
  expect(comprobarDist({ dist, imagenes, env: ENV_OK })).toEqual([]);
});
it("detecta rastros del simulador en cualquier fichero de texto", () => {
  const { dist, imagenes } = montar();
  writeFileSync(join(dist, "admin", "app.js"), 'connectFirestoreEmulator(db,"127.0.0.1:8080")');
  writeFileSync(join(dist, "index.html"), "projectId: demo-elojocritico");
  expect(rastrosDelSimulador(dist).sort()).toEqual(["127.0.0.1:8080 en admin/app.js", "demo-elojocritico en index.html"]);
  const p = comprobarDist({ dist, imagenes, env: ENV_OK });
  expect(p).toHaveLength(1);
  expect(p[0]).toContain("simulador");
});
it("exige las variables de Cloudinary y de Firebase y que no esté PUBLIC_EMULADOR", () => {
  const { dist, imagenes } = montar();
  const p = comprobarDist({ dist, imagenes, env: { PUBLIC_EMULADOR: "1", PUBLIC_CLOUDINARY_NUBE: "  " } }).join("\n");
  expect(p).toMatch(/PUBLIC_EMULADOR/);
  expect(p).toMatch(/PUBLIC_FIREBASE_CONFIG/);
  expect(p).toMatch(/PUBLIC_CLOUDINARY_NUBE/);
  expect(p).toMatch(/PUBLIC_CLOUDINARY_PRESET/);
});
it("cuenta los ficheros de la copia de Cloudflare: dist sin su img/ + imágenes sin .git", () => {
  const { dist, imagenes } = montar();
  mkdirSync(join(dist, "img"));
  writeFileSync(join(dist, "img", "vieja.webp"), "x"); // no cuenta: la carpeta img/ de dist la sustituyen las imágenes
  expect(contarFicherosCloudflare(dist, imagenes)).toBe(2 + 2);
});
it("falla si la copia de Cloudflare llega al límite de ficheros (20.000 por defecto)", () => {
  const { dist, imagenes } = montar(); // 4 ficheros
  expect(comprobarDist({ dist, imagenes, env: ENV_OK, limite: 5 })).toEqual([]);
  const p = comprobarDist({ dist, imagenes, env: ENV_OK, limite: 4 });
  expect(p).toHaveLength(1);
  expect(p[0]).toMatch(/4 ficheros \(el límite es 4\)/);
  expect(LIMITE_FICHEROS_CLOUDFLARE).toBe(20000);
});
it("si no existe dist, lo dice", () => {
  expect(comprobarDist({ dist: join(tmpdir(), "no-existe-eoc"), env: ENV_OK })[0]).toMatch(/No existe/);
});
