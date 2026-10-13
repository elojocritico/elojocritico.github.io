import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Bloques, enlaceSeguro, leerBloques, leerManual } from "./markdown";

describe("leerManual", () => {
  it("separa título, introducción y secciones con su dirección", () => {
    const m = leerManual("# Manual\n\nHola\n\n## Uno {#uno}\n\ntexto\n\n## Dos {#dos}\n\n1. a\n2. b\n");
    expect(m.titulo).toBe("Manual");
    expect(m.intro).toEqual([{ tipo: "p", texto: "Hola" }]);
    expect(m.secciones.map((s) => [s.id, s.titulo])).toEqual([["uno", "Uno"], ["dos", "Dos"]]);
    expect(m.secciones[1].bloques).toEqual([{ tipo: "ol", items: ["a", "b"] }]);
  });

  it("un # dentro de un bloque de código no cuenta como título", () => {
    const m = leerManual("# T\n\n## A {#a}\n\n```\n## no\n# tampoco\n```\n");
    expect(m.secciones).toHaveLength(1);
    expect(m.secciones[0].bloques).toEqual([{ tipo: "codigo", texto: "## no\n# tampoco" }]);
  });

  it("listas con sublista, líneas que continúan y párrafos de varias líneas", () => {
    const b = leerBloques(["3. Rellena:", "   - uno", "   - dos", "4. Sigue", "   y continúa", "", "Línea A", "línea B"]);
    expect(b).toEqual([
      { tipo: "ol", items: ["Rellena:\n• uno\n• dos", "Sigue y continúa"] },
      { tipo: "p", texto: "Línea A línea B" },
    ]);
  });
});

describe("Bloques (seguro)", () => {
  it("negrita, cursiva, código y enlaces seguros", () => {
    render(<Bloques bloques={leerBloques(["**fuerte** y *suave* y `x` y [web](https://a.es)"])} />);
    expect(screen.getByText("fuerte").tagName).toBe("STRONG");
    expect(screen.getByText("suave").tagName).toBe("EM");
    expect(screen.getByText("x").tagName).toBe("CODE");
    const a = screen.getByRole("link", { name: "web" });
    expect(a).toHaveAttribute("href", "https://a.es");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("no genera HTML ni enlaces javascript:", () => {
    const { container } = render(<Bloques bloques={leerBloques(["<img src=x onerror=alert(1)> [malo](javascript:alert(1)) <script>x</script>"])} />);
    expect(container.querySelector("img, script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.textContent).toContain("malo");
    expect(enlaceSeguro("javascript:alert(1)")).toBe(false);
    expect(enlaceSeguro("https://a.es")).toBe(true);
    expect(enlaceSeguro("#/ayuda/x")).toBe(true);
  });
});
