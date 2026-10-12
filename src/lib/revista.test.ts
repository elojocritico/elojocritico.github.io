import { it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "eocr-"));
beforeAll(() => {
  writeFileSync(join(dir, "revista.json"), JSON.stringify([
    { slug: "1", numero: "1", fecha: "1994", paginas: 6, pdf: "eoc-001.pdf", portada: "eoc-001.jpg", mb: 4.2, indice: [] },
    { slug: "91-92", numero: "91/92", fecha: "2020", paginas: 80, pdf: "eoc-091-092.pdf", portada: "eoc-091-092.jpg", mb: 1, indice: [] },
    { slug: "101", numero: "101", fecha: "2026", paginas: 90, pdf: "eoc-101.pdf", portada: "eoc-101.jpg", mb: 31, indice: [] }]));
  process.env.EOC_CONTENIDO = dir;
});
it("ordena y construye URLs", async () => {
  const r = await import("./revista");
  expect(r.numeros().map((n) => n.slug)).toEqual(["101", "91-92", "1"]);
  const n = r.numeros()[1];
  expect(r.urlPdf(n)).toBe("https://laspitesdegrao.github.io/el-ojo-critico/pdf/eoc-091-092.pdf");
  expect(r.urlPortada(n)).toBe("https://laspitesdegrao.github.io/el-ojo-critico/portadas/eoc-091-092.jpg");
  expect(r.urlVisor(n)).toBe("https://laspitesdegrao.github.io/el-ojo-critico/visor/web/viewer.html?file=../../pdf/eoc-091-092.pdf");
});
