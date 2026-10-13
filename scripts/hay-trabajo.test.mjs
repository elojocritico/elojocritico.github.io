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
const COPIA_RECIENTE = "2026-10-13T00:00:00.000Z"; // 10 h antes de AHORA
const ok = (extra = {}) => ({ ultimaCopia: COPIA_RECIENTE, ...extra });

it("publicarPendiente: hay trabajo sin consultar nada más", async () => {
  const db = dbFalsa({ estado: { publicarPendiente: true } });
  const r = await hayTrabajo(db, AHORA);
  expect(r.trabajo).toBe(true);
  expect(db.lecturas).toEqual(["estado/sistema"]);
});
it("programado vencido: hay trabajo; programado futuro: no", async () => {
  const vencido = dbFalsa({ estado: ok({ publicarPendiente: false }), articulos: { a: { estado: "programado", fechaPublicacion: "2026-10-13T09:59:00.000Z" } } });
  const r = await hayTrabajo(vencido, AHORA);
  expect(r.trabajo).toBe(true);
  expect(r.motivo).toContain("programado a");
  const futuro = dbFalsa({ estado: ok(), articulos: { a: { estado: "programado", fechaPublicacion: "2026-10-13T10:01:00.000Z" } } });
  expect((await hayTrabajo(futuro, AHORA)).trabajo).toBe(false);
});
it("fecha ilegible o artículos no programados no cuentan", async () => {
  const db = dbFalsa({ estado: ok(), articulos: { a: { estado: "programado", fechaPublicacion: "ayer" }, b: { estado: "publicado", fechaPublicacion: "2020-01-01T00:00:00.000Z" } } });
  expect((await hayTrabajo(db, AHORA)).trabajo).toBe(false);
});
it("solicitud de cuenta pendiente: hay trabajo", async () => {
  const db = dbFalsa({ estado: ok(), solicitudes: ["nuevo@x.es"] });
  const r = await hayTrabajo(db, AHORA);
  expect(r.trabajo).toBe(true);
  expect(r.motivo).toContain("cuenta");
});
it("sin nada pendiente: no hay trabajo, con pocas lecturas", async () => {
  const db = dbFalsa({ estado: ok() });
  expect(await hayTrabajo(db, AHORA)).toEqual({ trabajo: false, motivo: "nada que hacer", noche: false, alDia: true });
  expect(db.lecturas).toEqual(["estado/sistema", "articulos?estado==programado", "solicitudesCuenta limit 1"]);
});

const SHA = "b".repeat(40);
it("ultimoDespliegue igual al commit descargado: al día; distinto o ausente: hay trabajo", async () => {
  const igual = await hayTrabajo(dbFalsa({ estado: ok({ ultimoDespliegue: SHA }) }), AHORA, SHA);
  expect(igual).toMatchObject({ trabajo: false, alDia: true });
  const distinto = await hayTrabajo(dbFalsa({ estado: ok({ ultimoDespliegue: "c".repeat(40) }) }), AHORA, SHA);
  expect(distinto).toMatchObject({ trabajo: true, alDia: false });
  const falta = await hayTrabajo(dbFalsa({ estado: ok() }), AHORA, SHA);
  expect(falta).toMatchObject({ trabajo: true, alDia: false });
});
it("sin commit indicado no se comprueba el despliegue", async () => {
  expect(await hayTrabajo(dbFalsa({ estado: ok() }), AHORA)).toMatchObject({ trabajo: false, alDia: true });
});
it("ultimaCopia ausente o de hace más de 25 h: modo noche (hay trabajo); reciente: normal", async () => {
  const falta = await hayTrabajo(dbFalsa({ estado: {} }), AHORA);
  expect(falta).toMatchObject({ trabajo: true, noche: true });
  const sinDoc = await hayTrabajo(dbFalsa({}), AHORA);
  expect(sinDoc).toMatchObject({ trabajo: true, noche: true });
  const vieja = await hayTrabajo(dbFalsa({ estado: { ultimaCopia: "2026-10-12T08:59:00.000Z" } }), AHORA); // 25 h 1 min
  expect(vieja).toMatchObject({ trabajo: true, noche: true });
  const limite = await hayTrabajo(dbFalsa({ estado: { ultimaCopia: "2026-10-12T09:00:00.000Z" } }), AHORA); // 25 h justas
  expect(limite).toMatchObject({ trabajo: false, noche: false });
  const reciente = await hayTrabajo(dbFalsa({ estado: ok() }), AHORA);
  expect(reciente).toMatchObject({ trabajo: false, noche: false });
});
it("el modo noche se señala aunque haya otro motivo de trabajo", async () => {
  const r = await hayTrabajo(dbFalsa({ estado: { publicarPendiente: true } }), AHORA);
  expect(r).toMatchObject({ trabajo: true, noche: true });
});
