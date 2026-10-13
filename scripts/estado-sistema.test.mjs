import { it, expect } from "vitest";
import { anotarEstado, camposAnotar } from "./estado-sistema.mjs";

function dbFalsa() {
  const escrituras = [];
  return { escrituras, doc: (ruta) => ({ set: async (datos, opciones) => escrituras.push({ ruta, datos, opciones }) }) };
}

it("traduce las opciones a campos de estado/sistema", () => {
  expect(camposAnotar(["--copia", "--publicacion"])).toEqual(["ultimaPublicacion", "ultimaCopia"]);
  expect(camposAnotar(["--medios"])).toEqual(["ultimaSincronizacionMedios"]);
  expect(camposAnotar([])).toEqual([]);
  expect(() => camposAnotar(["--otra"])).toThrow(/desconocida/);
});
it("escribe solo los campos pedidos, con la hora en ISO y sin pisar el resto (merge)", async () => {
  const db = dbFalsa();
  const ahora = new Date("2026-10-13T21:00:00.000Z");
  const r = await anotarEstado(db, ["ultimaPublicacion", "ultimaCopia"], ahora);
  expect(r).toEqual({ ultimaPublicacion: "2026-10-13T21:00:00.000Z", ultimaCopia: "2026-10-13T21:00:00.000Z" });
  expect(db.escrituras).toEqual([{ ruta: "estado/sistema", datos: r, opciones: { merge: true } }]);
});
it("sin campos no escribe nada", async () => {
  const db = dbFalsa();
  expect(await anotarEstado(db, [])).toEqual({});
  expect(db.escrituras).toEqual([]);
});
