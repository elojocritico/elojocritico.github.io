import { describe, it, expect } from "vitest";
import { colorDeAntiguedad, calcularSemaforo } from "./semaforo";

const ahora = Date.parse("2026-10-13T12:00:00Z");
const hace = (h: number) => new Date(ahora - h * 3600_000).toISOString();

describe("semaforo", () => {
  it("verde, amarillo, rojo y gris segun la antiguedad", () => {
    expect(colorDeAntiguedad(hace(2), ahora)).toBe("verde");
    expect(colorDeAntiguedad(hace(24 * 4), ahora)).toBe("amarillo");
    expect(colorDeAntiguedad(hace(24 * 10), ahora)).toBe("rojo");
    expect(colorDeAntiguedad(null, ahora)).toBe("gris");
    expect(colorDeAntiguedad("basura", ahora)).toBe("gris");
  });
  it("acepta Timestamps de Firestore", () => {
    expect(colorDeAntiguedad({ toMillis: () => ahora - 1000 }, ahora)).toBe("verde");
    expect(colorDeAntiguedad({ seconds: (ahora - 1000) / 1000 }, ahora)).toBe("verde");
  });
  it("sin estado, todo gris", () => {
    expect(calcularSemaforo(null, ahora).every((p) => p.color === "gris")).toBe(true);
  });
});
