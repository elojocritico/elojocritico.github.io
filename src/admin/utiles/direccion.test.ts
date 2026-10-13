import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { direccionDesdeTitulo, problemaDeDireccion, RESERVADAS, MAX_DIRECCION } from "./direccion";

describe("direccionDesdeTitulo", () => {
  it("pasa a minúsculas, quita tildes y cambia ñ por n", () => {
    expect(direccionDesdeTitulo("El Año de la Ñandú: ¡Crítica!")).toBe("el-ano-de-la-nandu-critica");
  });
  it("cambia signos y espacios por un solo guion y no deja guiones en los extremos", () => {
    expect(direccionDesdeTitulo("  ¿Qué?  ---  ¡Hola, mundo!  ")).toBe("que-hola-mundo");
    expect(direccionDesdeTitulo("a/b\\c_d.e")).toBe("a-b-c-d-e");
  });
  it("corta a 80 letras sin dejar un guion al final", () => {
    const largo = direccionDesdeTitulo("palabra ".repeat(30));
    expect(largo.length).toBeLessThanOrEqual(MAX_DIRECCION);
    expect(largo.endsWith("-")).toBe(false);
    const justo = direccionDesdeTitulo("a".repeat(79) + " b");
    expect(justo).toBe("a".repeat(79));
  });
  it("devuelve vacío si no hay letras ni números", () => {
    expect(direccionDesdeTitulo("¿¡?!")).toBe("");
    expect(direccionDesdeTitulo("")).toBe("");
  });
  it("conserva los números", () => {
    expect(direccionDesdeTitulo("Roswell 1947")).toBe("roswell-1947");
  });
});

describe("problemaDeDireccion", () => {
  it("acepta una dirección normal", () => {
    expect(problemaDeDireccion("mi-articulo-2")).toBeNull();
  });
  it("rechaza vacía, con caracteres raros o demasiado larga", () => {
    expect(problemaDeDireccion("")).toMatch(/Escribe/);
    expect(problemaDeDireccion("Mayúscula")).toMatch(/solo puede llevar/);
    expect(problemaDeDireccion("con espacio")).toMatch(/solo puede llevar/);
    expect(problemaDeDireccion("-empieza")).toMatch(/solo puede llevar/);
    expect(problemaDeDireccion("a".repeat(81))).toMatch(/demasiado larga/);
  });
  it("rechaza las rutas reservadas de la web", () => {
    for (const r of ["admin", "tema", "revista", "buscar", "img"]) expect(problemaDeDireccion(r), r).toMatch(/reservada/);
  });
  it("la lista de reservadas es la misma que usa la comprobación de la web (scripts/verificar.mjs)", () => {
    const fuente = readFileSync("scripts/verificar.mjs", "utf8");
    const bloque = /const RESERVADOS = new Set\(\[([\s\S]*?)\]\)/.exec(fuente)![1];
    const deVerificar = [...bloque.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...RESERVADAS].sort()).toEqual([...deVerificar].sort());
  });
});
