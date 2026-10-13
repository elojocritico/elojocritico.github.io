import { describe, it, expect } from "vitest";
import { problemaDeTamano } from "./tamano";

const grande = "data:image/jpeg;base64," + "A".repeat(1_000_000);

describe("problemaDeTamano", () => {
  it("un artículo normal cabe", () => {
    expect(problemaDeTamano({ cuerpoHtml: "<p>hola</p>", portada: null })).toBeNull();
  });
  it("nombra la foto de portada si es la que ocupa", () => {
    expect(problemaDeTamano({ cuerpoHtml: "<p>hola</p>", portada: { src: grande } })).toMatch(/foto de portada es demasiado grande para el modo de prueba/);
  });
  it("nombra las fotos pegadas en el texto", () => {
    expect(problemaDeTamano({ cuerpoHtml: `<p><img src="${grande}"></p>`, portada: null })).toMatch(/Hay demasiadas fotos pegadas en el texto/);
  });
  it("cuenta bytes, no letras (las tildes pesan más)", () => {
    expect(problemaDeTamano({ cuerpoHtml: "é".repeat(500_000), portada: null })).toMatch(/demasiado grande/);
  });
});
