// Cambia el cuerpo de artículos YA existentes en Firestore dejando el rastro que deja el panel:
//  - copia del artículo tal como estaba en articulos/<slug>/versiones/<id> (mismo formato que escribirVersion del panel:
//    todos los campos + guardadoEn + guardadoPor), para poder volver atrás desde el historial;
//  - actualizadoEn / actualizadoPor del artículo;
//  - estado/sistema.publicarPendiente = true (+ publicarPendienteEn), para que se vea el aviso «hay cambios sin publicar»;
//    se escribe en el ÚLTIMO lote.
// Escribe por lotes (scripts/lotes.mjs) y con precondición de «no tocado desde que lo leí»: si alguien edita un artículo
// mientras corre, el lote falla en vez de pisarlo (se vuelve a lanzar y listo; los scripts que lo usan son idempotentes).
// Lo usan marcar-perdidas.mjs y (más adelante) la inserción de fotos recuperadas.
import { crearEscritor } from "./lotes.mjs";

// Este valor NO puede ser «migración» (reservado al importador, que si lo ve se cree dueño del artículo y lo pisa).
export const RESERVADO = "migración";

/**
 * @param db        Firestore (admin)
 * @param slugs     artículos a mirar
 * @param decidir   (slug, datos, snap) => null            nada que hacer
 *                                       | { saltar: "motivo", extra? }  el cuerpo no se toca; sale en `saltados` (si trae `extra`, eso sí se fusiona, sin versión ni aviso)
 *                                       | { cuerpoHtml?, extra? } cuerpoHtml nuevo (con versión + marca de publicar pendiente)
 *                                                              y/o `extra`: otros campos que se fusionan sin versión ni
 *                                                              aviso de publicar (datos internos, p. ej. fotosPendientes)
 * @param opciones  usuario (obligatorio, nunca «migración»), simular (no escribe), ahora, trozo
 */
export async function cambiarCuerpos(db, slugs, decidir, { usuario, simular = false, ahora = new Date().toISOString(), trozo = 300 } = {}) {
  const quien = String(usuario ?? "").trim();
  if (!quien || quien === RESERVADO) throw new Error("Hace falta un nombre de usuario para el historial (y no puede ser «migración»).");
  const r = { cuerpoCambiado: [], soloDatos: [], sinCambios: 0, saltados: [], noExisten: [], escrituras: 0 };
  const w = crearEscritor(db);
  const refSistema = db.doc("estado/sistema");

  for (let i = 0; i < slugs.length; i += trozo) {
    const parte = slugs.slice(i, i + trozo);
    const refs = parte.map((s) => db.collection("articulos").doc(s));
    const snaps = await db.getAll(...refs);
    for (let j = 0; j < parte.length; j++) {
      const slug = parte[j];
      const snap = snaps[j];
      if (!snap.exists) {
        r.noExisten.push(slug);
        continue;
      }
      const actual = snap.data();
      const d = decidir(slug, actual, snap);
      if (!d) {
        r.sinCambios++;
        continue;
      }
      const saltar = Boolean(d.saltar);
      if (saltar) r.saltados.push({ slug, motivo: d.saltar });
      // Un artículo saltado no cambia de cuerpo, pero sí puede recibir `extra` (datos internos).
      const cambiaCuerpo = !saltar && typeof d.cuerpoHtml === "string" && d.cuerpoHtml !== actual.cuerpoHtml;
      const extra = Object.fromEntries(Object.entries(d.extra ?? {}).filter(([k, v]) => JSON.stringify(actual[k] ?? null) !== JSON.stringify(v ?? null)));
      if (!cambiaCuerpo && Object.keys(extra).length === 0) {
        if (!saltar) r.sinCambios++;
        continue;
      }
      (cambiaCuerpo ? r.cuerpoCambiado : r.soloDatos).push(slug);
      if (simular) continue;
      const precondicion = { lastUpdateTime: snap.updateTime };
      if (cambiaCuerpo) {
        // Versión y artículo van siempre en el mismo lote (si no cabe el par, se vacía antes).
        await w.reservar(2, JSON.stringify(actual).length * 2 + 400);
        await w.set(db.collection("articulos").doc(slug).collection("versiones").doc(), { ...actual, guardadoEn: ahora, guardadoPor: quien });
        await w.update(refs[j], { ...extra, cuerpoHtml: d.cuerpoHtml, actualizadoEn: ahora, actualizadoPor: quien }, precondicion);
      } else {
        await w.update(refs[j], extra, precondicion);
      }
    }
  }
  // «Publicar pendiente» se escribe lo ÚLTIMO: si un lote anterior falla, no queda el aviso sin cambios detrás.
  if (r.cuerpoCambiado.length && !simular) await w.set(refSistema, { publicarPendiente: true, publicarPendienteEn: ahora }, { merge: true });
  await w.vaciar();
  r.escrituras = w.escrituras;
  return r;
}
