import { describe, it, expect } from "vitest";
import { extractoDesde, textoPlano } from "./extracto";

describe("extractoDesde", () => {
  it("devuelve el texto entero si es corto, sin etiquetas", () => {
    expect(extractoDesde("<h2>Hola</h2><p>un <strong>texto</strong> corto</p>")).toBe("Hola un texto corto");
  });
  it("corta en una palabra entera y añade puntos suspensivos", () => {
    const e = extractoDesde("<p>" + "palabra ".repeat(60) + "</p>", 50);
    expect(e.endsWith("…")).toBe(true);
    expect(e.length).toBeLessThanOrEqual(51);
    expect(e).not.toMatch(/palabr…$/);
  });
  it("no se traga scripts ni su texto", () => {
    expect(textoPlano("<p>a</p><script>alert(1)</script>")).toBe("a");
  });
  it("vacío si no hay texto", () => {
    expect(extractoDesde("")).toBe("");
  });
});
