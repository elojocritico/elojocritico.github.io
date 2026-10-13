import { describe, expect, it } from "vitest";
import { crearContadorClics, CLICS_PARA_ADMIN } from "./gestoAdmin";

describe("gesto de entrada al panel", () => {
  it("7 clics rápidos llevan al panel", () => {
    const registrar = crearContadorClics();
    const decisiones = Array.from({ length: CLICS_PARA_ADMIN }, (_, i) => registrar(1000 + i * 200));
    expect(decisiones.slice(0, 6).every((d) => d === "esperar")).toBe(true);
    expect(decisiones[6]).toBe("admin");
  });

  it("6 clics no bastan", () => {
    const registrar = crearContadorClics();
    const decisiones = Array.from({ length: 6 }, (_, i) => registrar(i * 200));
    expect(decisiones).not.toContain("admin");
  });

  it("clics lentos (fuera de los 3 segundos) no cuentan", () => {
    const registrar = crearContadorClics();
    const decisiones = Array.from({ length: 10 }, (_, i) => registrar(i * 600));
    expect(decisiones).not.toContain("admin");
  });

  it("tras llegar al panel la cuenta vuelve a empezar", () => {
    const registrar = crearContadorClics();
    for (let i = 0; i < 7; i++) registrar(i * 100);
    expect(registrar(800)).toBe("esperar");
  });
});
