import { describe, it, expect } from "vitest";
import { hayConflicto } from "./conflicto";

describe("hayConflicto", () => {
  it("no hay conflicto si la fecha de cambio es la misma", () => {
    expect(hayConflicto("2026-01-01T10:00:00.000Z", "2026-01-01T10:00:00.000Z")).toBe(false);
  });
  it("hay conflicto si otra persona guardó después", () => {
    expect(hayConflicto("2026-01-01T10:00:00.000Z", "2026-01-01T10:05:00.000Z")).toBe(true);
  });
  it("hay conflicto si falta alguna de las dos fechas (no se puede asegurar)", () => {
    expect(hayConflicto("", "2026-01-01T10:00:00.000Z")).toBe(true);
    expect(hayConflicto("2026-01-01T10:00:00.000Z", undefined)).toBe(true);
    expect(hayConflicto(null, null)).toBe(true);
  });
});
