import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enlacesInternosRotos, paginasDeArticulosQueFaltan, tamanoMB, slugsReservados } from "./verificar.mjs";

function montar() {
  const raiz = mkdtempSync(join(tmpdir(), "eocv-"));
  const dist = join(raiz, "dist"), cont = join(raiz, "contenido");
  mkdirSync(join(dist, "a"), { recursive: true });
  mkdirSync(join(dist, "img"), { recursive: true });
  mkdirSync(join(cont, "articulos"), { recursive: true });
  writeFileSync(join(dist, "index.html"), '<a href="/a/">a</a><a href="/b/">b</a><a href="https://x.com/">x</a><a href="#y">y</a><a href="/img/z.webp">z</a><a href="/rss.xml">r</a>');
  writeFileSync(join(dist, "a", "index.html"), '<a href="/">i</a>');
  writeFileSync(join(dist, "rss.xml"), "<rss/>");
  writeFileSync(join(dist, "img", "grande.bin"), Buffer.alloc(2 * 1024 * 1024));
  for (const s of ["a", "c", "revista"]) writeFileSync(join(cont, "articulos", s + ".json"), JSON.stringify({ slug: s }));
  return { dist, cont };
}

it("detecta enlaces internos rotos e ignora externos, anclas e /img/", () => {
  const { dist } = montar();
  expect(enlacesInternosRotos(dist)).toEqual(["/b/ (en /index.html)"]);
});
it("detecta artículos sin página y slugs reservados", () => {
  const { dist, cont } = montar();
  expect(paginasDeArticulosQueFaltan(dist, cont)).toEqual(["c", "revista"]);
  expect(slugsReservados(cont)).toEqual(["revista"]);
});
it("mide tamaño excluyendo carpetas", () => {
  const { dist } = montar();
  expect(tamanoMB(dist, [])).toBeGreaterThan(1.9);
  expect(tamanoMB(dist, ["img"])).toBeLessThan(0.1);
});

import { revisarEnlaces, separarCuerpos } from "./verificar.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PAGINA = (cuerpo, fuera = "") =>
  `<html><nav><a href="/a/">ok</a>${fuera}</nav><div class="cuerpo" data-cuerpo style="x"><p>t</p><div class="n"><a href="/roto-cuerpo/">r</a></div>${cuerpo}</div><footer><a href="/">i</a></footer></html>`;

it("enlaces rotos dentro del cuerpo de un artículo son avisos; fuera, errores", () => {
  const { dist } = montar();
  writeFileSync(join(dist, "a", "index.html"), PAGINA('<a href="/otro-roto/">o</a>', '<a href="/menu-roto/">m</a>'));
  const r = revisarEnlaces(dist);
  expect(r.errores).toEqual(["/menu-roto/ (en /a/index.html)", "/b/ (en /index.html)"]);
  expect(r.avisos).toEqual(["/roto-cuerpo/ (en /a/index.html)", "/otro-roto/ (en /a/index.html)"]);
});
it("un enlace roto en el pie (después del cuerpo) sigue siendo error", () => {
  const { dist } = montar();
  writeFileSync(join(dist, "a", "index.html"), PAGINA("").replace("<footer>", '<footer><a href="/pie-roto/">p</a>'));
  expect(revisarEnlaces(dist).errores).toContain("/pie-roto/ (en /a/index.html)");
});
it("si el contenedor del cuerpo no cierra, no se esconde nada como aviso", () => {
  expect(separarCuerpos('<div data-cuerpo><div><a href="/x/">x</a>')).toEqual({ cuerpos: [], resto: '<div data-cuerpo><div><a href="/x/">x</a>' });
});
it("verificar: con solo avisos sale con 0 y los imprime; con errores sale con 1", () => {
  const raiz = mkdtempSync(join(tmpdir(), "eocv-cli-"));
  const dist = join(raiz, "dist"), cont = join(raiz, "contenido");
  mkdirSync(join(dist, "a"), { recursive: true });
  mkdirSync(join(cont, "articulos"), { recursive: true });
  writeFileSync(join(cont, "articulos", "a.json"), JSON.stringify({ slug: "a" }));
  writeFileSync(join(dist, "index.html"), '<a href="/a/">a</a>');
  writeFileSync(join(dist, "a", "index.html"), PAGINA(""));
  const prog = fileURLToPath(new URL("./verificar.mjs", import.meta.url));
  const correr = () => spawnSync(process.execPath, [prog], { cwd: raiz, encoding: "utf8", timeout: 30000 });
  const ok = correr();
  expect(ok.status).toBe(0);
  expect(ok.stdout).toContain("AVISO");
  expect(ok.stdout).toContain("/roto-cuerpo/");
  writeFileSync(join(dist, "index.html"), '<a href="/a/">a</a><a href="/menu-roto/">m</a>');
  const mal = correr();
  expect(mal.status).toBe(1);
  expect(mal.stderr).toContain("/menu-roto/");
});
