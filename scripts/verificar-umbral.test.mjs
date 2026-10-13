import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bajadaDeArticulos } from "./verificar.mjs";

it("umbral: falla solo si bajan más de un 5 % respecto a lo publicado", () => {
  expect(bajadaDeArticulos(95, "100")).toBeNull(); // justo un 5 %: aún vale
  expect(bajadaDeArticulos(94, "100")).toContain("bajan más de un 5 %");
  expect(bajadaDeArticulos(120, "100")).toBeNull();
});
it("umbral: sin dato publicado (uso local) o con dato inválido no se aplica", () => {
  expect(bajadaDeArticulos(0, undefined)).toBeNull();
  expect(bajadaDeArticulos(0, "")).toBeNull();
  expect(bajadaDeArticulos(0, "abc")).toBeNull();
  expect(bajadaDeArticulos(0, "0")).toBeNull();
});
it("verificar: EOC_ARTICULOS_PUBLICADOS hace fallar la salida si hay una bajada fuerte", () => {
  const raiz = mkdtempSync(join(tmpdir(), "eocv-umbral-"));
  const dist = join(raiz, "dist"), cont = join(raiz, "contenido");
  mkdirSync(join(dist, "a"), { recursive: true });
  mkdirSync(join(cont, "articulos"), { recursive: true });
  writeFileSync(join(cont, "articulos", "a.json"), JSON.stringify({ slug: "a" }));
  writeFileSync(join(dist, "index.html"), '<a href="/a/">a</a>');
  writeFileSync(join(dist, "a", "index.html"), "<p>a</p>");
  const prog = fileURLToPath(new URL("./verificar.mjs", import.meta.url));
  const entorno = { ...process.env };
  delete entorno.EOC_ARTICULOS_PUBLICADOS;
  const correr = (extra) => spawnSync(process.execPath, [prog], { cwd: raiz, encoding: "utf8", timeout: 30000, env: { ...entorno, ...extra } });
  expect(correr({}).status).toBe(0);
  expect(correr({ EOC_ARTICULOS_PUBLICADOS: "1" }).status).toBe(0);
  const mal = correr({ EOC_ARTICULOS_PUBLICADOS: "10" });
  expect(mal.status).toBe(1);
  expect(mal.stderr).toContain("la versión publicada tiene 10");
});
