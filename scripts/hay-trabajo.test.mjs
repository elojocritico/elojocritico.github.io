import { it, expect } from "vitest";
import { hayTrabajo } from "./hay-trabajo.mjs";

/** Firestore simulado: estado/sistema, artículos (con estado) y solicitudes de cuenta. */
function dbFalsa({ estado, articulos = {}, solicitudes = [] } = {}) {
  const lecturas = [];
  return {
    lecturas,
    doc: (ruta) => ({ get: async () => { lecturas.push(ruta); return { exists: estado !== undefined, data: () => estado }; } }),
    collection: (nombre) => ({
      where: (campo, op, valor) => ({
        get: async () => {
          lecturas.push(`${nombre}?${campo}${op}${valor}`);
          const docs = Object.entries(articulos).filter(([, d]) => d[campo] === valor).map(([id, d]) => ({ id, data: () => d }));
          return { docs, empty: !docs.length };
        },
      }),
      limit: (n) => ({
        get: async () => {
          lecturas.push(`${nombre} limit ${n}`);
          const docs = solicitudes.slice(0, n).map((id) => ({ id }));
          return { docs, empty: !docs.length };
        },
      }),
    }),
  };
}
const AHORA = new Date("2026-10-13T10:00:00.000Z");

it("publicarPendiente: hay trabajo sin consultar nada más", async () => {
  const db = dbFalsa({ estado: { publicarPendiente: true } });
  const r = await hayTrabajo(db, AHORA);
  expect(r.trabajo).toBe(true);
  expect(db.lecturas).toEqual(["estado/sistema"]);
});
it("programado vencido: hay trabajo; programado futuro: no", async () => {
  const vencido = dbFalsa({ estado: { publicarPendiente: false }, articulos: { a: { estado: "programado", fechaPublicacion: "2026-10-13T09:59:00.000Z" } } });
  const r = await hayTrabajo(vencido, AHORA);
  expect(r.trabajo).toBe(true);
  expect(r.motivo).toContain("programado a");
  const futuro = dbFalsa({ estado: {}, articulos: { a: { estado: "programado", fechaPublicacion: "2026-10-13T10:01:00.000Z" } } });
  expect((await hayTrabajo(futuro, AHORA)).trabajo).toBe(false);
});
it("fecha ilegible o artículos no programados no cuentan", async () => {
  const db = dbFalsa({ estado: {}, articulos: { a: { estado: "programado", fechaPublicacion: "ayer" }, b: { estado: "publicado", fechaPublicacion: "2020-01-01T00:00:00.000Z" } } });
  expect((await hayTrabajo(db, AHORA)).trabajo).toBe(false);
});
it("solicitud de cuenta pendiente: hay trabajo", async () => {
  const db = dbFalsa({ estado: {}, solicitudes: ["nuevo@x.es"] });
  const r = await hayTrabajo(db, AHORA);
  expect(r.trabajo).toBe(true);
  expect(r.motivo).toContain("cuenta");
});
it("sin nada pendiente (y sin estado/sistema ni colección de solicitudes): no hay trabajo, con pocas lecturas", async () => {
  const db = dbFalsa({});
  expect(await hayTrabajo(db, AHORA)).toEqual({ trabajo: false, motivo: "nada que hacer" });
  expect(db.lecturas).toEqual(["estado/sistema", "articulos?estado==programado", "solicitudesCuenta limit 1"]);
});
