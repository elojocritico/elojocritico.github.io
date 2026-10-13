import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "eoc-aj-"));
const poner = (o: unknown) => writeFileSync(join(dir, "ajustes.json"), JSON.stringify(o));
beforeAll(() => {
  process.env.EOC_CONTENIDO = dir;
});
afterEach(() => vi.restoreAllMocks());

describe("ajustes() en la web pública", () => {
  it("descarta enlaces que no sean http(s) (javascript:, data:, vacíos) y avisa, sin romper", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    poner({
      destacado: null,
      enlaces: [
        { nombre: "Bien", url: "https://ok.es/x" }, { nombre: "Mal", url: "javascript:alert(1)" },
        { nombre: "Datos", url: "data:text/html,<script>1</script>" }, { nombre: "Http", url: "http://ok.es" }, { nombre: "Vacío", url: "" },
      ],
      adsense: { activo: false, cliente: "", bloque: "" },
    });
    const { ajustes } = await import("./contenido");
    expect(ajustes().enlaces.map((e) => e.nombre)).toEqual(["Bien", "Http"]);
    expect(aviso).toHaveBeenCalled();
  });

  it("un cliente o bloque inválido desactiva la publicidad y no llega a la página", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    poner({ destacado: null, enlaces: [], adsense: { activo: true, cliente: 'ca-pub-1"><script>', bloque: "1234567890" } });
    const { ajustes } = await import("./contenido");
    expect(ajustes().adsense).toEqual({ activo: false, cliente: "", bloque: "" });
    poner({ destacado: null, enlaces: [], adsense: { activo: true, cliente: "ca-pub-1234567890123456", bloque: "12" } });
    expect(ajustes().adsense).toEqual({ activo: false, cliente: "", bloque: "" });
    expect(aviso).toHaveBeenCalledTimes(2);
  });

  it("con datos válidos no cambia nada", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = { destacado: "x", enlaces: [{ nombre: "A", url: "https://a.es" }], adsense: { activo: true, cliente: "ca-pub-1234567890123456", bloque: "1234567890" } };
    poner(a);
    const { ajustes } = await import("./contenido");
    expect(ajustes()).toEqual(a);
    expect(aviso).not.toHaveBeenCalled();
  });
});
