import { describe, it, expect } from "vitest";
import { madridAUtc, utcAMadrid, mediodiaMadridUtc } from "./madrid.js";

describe("madridAUtc", () => {
  it("en invierno España va una hora por delante de UTC", () => {
    expect(madridAUtc("2026-01-15T09:30")).toBe("2026-01-15T08:30:00.000Z");
  });
  it("en verano va dos horas por delante", () => {
    expect(madridAUtc("2026-07-01T09:30")).toBe("2026-07-01T07:30:00.000Z");
  });
  it("respeta los días del cambio de hora", () => {
    expect(madridAUtc("2026-03-28T23:00")).toBe("2026-03-28T22:00:00.000Z"); // aún invierno
    expect(madridAUtc("2026-03-29T12:00")).toBe("2026-03-29T10:00:00.000Z"); // ya verano
    expect(madridAUtc("2026-10-24T12:00")).toBe("2026-10-24T10:00:00.000Z");
    expect(madridAUtc("2026-10-25T12:00")).toBe("2026-10-25T11:00:00.000Z"); // ya invierno
  });
  it("la hora repetida de octubre usa la primera; la inexistente de marzo se lleva a la hora de verano", () => {
    expect(madridAUtc("2026-10-25T02:30")).toBe("2026-10-25T00:30:00.000Z");
    expect(madridAUtc("2026-03-29T02:30")).toBe("2026-03-29T01:30:00.000Z");
  });
  it("rechaza fechas que no existen o textos raros", () => {
    for (const malo of ["", "hola", "2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01T25:00", "2026-01-01", null, undefined])
      expect(madridAUtc(malo as never)).toBeNull();
  });
});

describe("utcAMadrid", () => {
  it("convierte de vuelta en invierno y en verano", () => {
    expect(utcAMadrid("2026-01-15T08:30:00.000Z")).toBe("2026-01-15T09:30");
    expect(utcAMadrid("2026-07-01T07:30:00.000Z")).toBe("2026-07-01T09:30");
  });
  it("entiende fechas antiguas con desfase y devuelve vacío si no es fecha", () => {
    expect(utcAMadrid("2020-03-04T12:00:00+02:00")).toBe("2020-03-04T11:00");
    expect(utcAMadrid("basura")).toBe("");
    expect(utcAMadrid("")).toBe("");
  });
  it("ida y vuelta", () => {
    for (const f of ["2026-03-15T08:05", "2026-08-15T23:59", "2026-12-31T00:00"]) expect(utcAMadrid(madridAUtc(f)!)).toBe(f);
  });
});

describe("mediodiaMadridUtc", () => {
  it("las 12:00 de España son las 11:00Z en invierno y las 10:00Z en verano", () => {
    expect(mediodiaMadridUtc("2020-03-04")).toBe("2020-03-04T11:00:00.000Z");
    expect(mediodiaMadridUtc("2020-08-04")).toBe("2020-08-04T10:00:00.000Z");
  });
});
