import { it, expect } from "vitest";
import { anotarEstado, camposAnotar, datosAnotar } from "./estado-sistema.mjs";

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
  const datos = datosAnotar(["--publicacion", "--copia"], ahora);
  expect(datos).toEqual({ ultimaPublicacion: "2026-10-13T21:00:00.000Z", ultimaCopia: "2026-10-13T21:00:00.000Z" });
  await anotarEstado(db, datos);
  expect(db.escrituras).toEqual([{ ruta: "estado/sistema", datos, opciones: { merge: true } }]);
});
it("--despliegue <sha> escribe ultimoDespliegue (y solo si el SHA es completo)", async () => {
  const sha = "a".repeat(40);
  expect(datosAnotar(["--despliegue", sha])).toEqual({ ultimoDespliegue: sha });
  expect(datosAnotar(["--despliegue", sha, "--medios"], new Date("2026-10-13T21:00:00.000Z"))).toEqual({ ultimaSincronizacionMedios: "2026-10-13T21:00:00.000Z", ultimoDespliegue: sha });
  expect(() => datosAnotar(["--despliegue"])).toThrow(/SHA/);
  expect(() => datosAnotar(["--despliegue", "abc"])).toThrow(/SHA/);
  const db = dbFalsa();
  await anotarEstado(db, datosAnotar(["--despliegue", sha]));
  expect(db.escrituras[0].datos).toEqual({ ultimoDespliegue: sha });
});
it("sin nada que escribir no toca Firestore", async () => {
  const db = dbFalsa();
  expect(await anotarEstado(db, datosAnotar([]))).toEqual({});
  expect(db.escrituras).toEqual([]);
});
