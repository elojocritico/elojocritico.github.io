import { it, expect, beforeAll, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const vacio = mkdtempSync(join(tmpdir(), "eocm-vacio-"));
const dir = mkdtempSync(join(tmpdir(), "eocm-"));
beforeAll(() => {
  writeFileSync(join(dir, "podcast.json"), JSON.stringify([
    { id: "1", titulo: "Viejo", fecha: "2011-11-27", duracion: "00:39", mp3: null, url: "https://www.ivoox.com/a", descripcion: "x" },
    { id: "2", titulo: "Nuevo", fecha: "2026-10-11", duracion: null, mp3: "https://x/a.mp3", url: "https://www.ivoox.com/b", descripcion: "" },
    { id: "3", titulo: "Sin fecha", fecha: null, duracion: "rara", mp3: null, url: "https://www.ivoox.com/c" }]));
  writeFileSync(join(dir, "videos.json"), JSON.stringify([
    { id: "a", titulo: "Sin fecha", fecha: null, duracion: null },
    { id: "b", titulo: "Antiguo", fecha: "2020-01-01", duracion: 60 },
    { id: "c", titulo: "Reciente", fecha: "2026-10-10", duracion: 3846 }]));
});
it("JSON ausente devuelve []", async () => {
  process.env.EOC_CONTENIDO = vacio;
  const m = await import("./medios");
  expect(m.episodios()).toEqual([]);
  expect(m.videos()).toEqual([]);
});
it("valida y ordena, lo más reciente primero y sin fecha al final", async () => {
  process.env.EOC_CONTENIDO = dir;
  const m = await import("./medios");
  expect(m.episodios().map((e) => e.id)).toEqual(["2", "1", "3"]);
  expect(m.episodios()[2].descripcion).toBe("");
  expect(m.videos().map((v) => v.id)).toEqual(["c", "b", "a"]);
});
it("JSON inválido lanza error", async () => {
  const malo = mkdtempSync(join(tmpdir(), "eocm-malo-"));
  writeFileSync(join(malo, "videos.json"), "{no es json");
  process.env.EOC_CONTENIDO = malo;
  const m = await import("./medios");
  expect(() => m.videos()).toThrow();
});
it("un registro malo se descarta con aviso, sin tirar el archivo", async () => {
  const d = mkdtempSync(join(tmpdir(), "eocm-parcial-"));
  writeFileSync(join(d, "videos.json"), JSON.stringify([
    { id: "ok", titulo: "Bueno", fecha: null, duracion: null },
    { id: "mal", titulo: "", fecha: null, duracion: null }]));
  process.env.EOC_CONTENIDO = d;
  const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  const m = await import("./medios");
  expect(m.videos().map((v) => v.id)).toEqual(["ok"]);
  expect(aviso).toHaveBeenCalled();
  aviso.mockRestore();
});
it("un JSON que no es lista lanza error", async () => {
  const d = mkdtempSync(join(tmpdir(), "eocm-obj-"));
  writeFileSync(join(d, "videos.json"), JSON.stringify({ a: 1 }));
  process.env.EOC_CONTENIDO = d;
  const m = await import("./medios");
  expect(() => m.videos()).toThrow();
});
it("duracionLegible", async () => {
  const { duracionLegible: d } = await import("./medios");
  expect(d(3846)).toBe("1 h 04 min");
  expect(d("00:45:10")).toBe("45 min");
  expect(d("19:36")).toBe("19 min");
  expect(d(45)).toBe("45 s");
  expect(d("00:39")).toBe("39 s");
  expect(d(null)).toBe("");
  expect(d("rara")).toBe("");
  expect(d(7200)).toBe("2 h 00 min");
});
