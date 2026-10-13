// Las direcciones reservadas deben ser las mismas en la web, el panel y la migración.
import { it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const lista = (texto) => [...texto.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
const verificar = lista(/const RESERVADOS = new Set\(\[([\s\S]*?)\]\)/.exec(readFileSync("scripts/verificar.mjs", "utf-8"))[1]);
const panel = lista(/export const RESERVADAS = \[([\s\S]*?)\]/.exec(readFileSync("src/admin/utiles/direccion.ts", "utf-8"))[1]);

it("verificar.mjs y el panel tienen la misma lista", () => {
  expect(verificar).toContain("comentarios-archivo");
  expect(panel).toEqual(verificar);
});

const py = "../migracion/eoc_migracion/secciones.py";
it.skipIf(!existsSync(py))("la migración (secciones.py) tiene la misma lista", () => {
  const bloque = /RESERVADOS = \{([\s\S]*?)\}/.exec(readFileSync(py, "utf-8"))[1];
  expect(lista(bloque)).toEqual(verificar);
});
