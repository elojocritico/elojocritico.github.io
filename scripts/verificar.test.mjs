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
