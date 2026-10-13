// Decide si el flujo horario tiene algo que hacer. Imprime TRABAJO=1 o TRABAJO=0.
// Cuesta pocas lecturas: estado/sistema, los artículos programados y 1 solicitud de cuenta como máximo.
//
// Hay trabajo si:
//  - estado/sistema.publicarPendiente es true (alguien pulsó "Publicar cambios"), o
//  - hay artículos programados cuya fecha ya ha llegado, o
//  - hay alguna solicitud de cuenta (solicitudesCuenta/{correo}) sin atender.
// Uso:  node scripts/hay-trabajo.mjs --real
import { getApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fileURLToPath } from "node:url";
import { resolverDestino } from "./destino-firebase.mjs";
import { iniciarAdmin } from "./crear-admin.mjs";

export async function hayTrabajo(db, ahora = new Date()) {
  const estado = await db.doc("estado/sistema").get();
  if (estado.exists && estado.data()?.publicarPendiente === true) return { trabajo: true, motivo: "hay una publicación pendiente" };

  // Solo por estado (como el exportador): filtrar también por fecha pediría un índice compuesto. Los programados son pocos.
  const programados = await db.collection("articulos").where("estado", "==", "programado").get();
  const vencido = programados.docs.find((d) => {
    const t = Date.parse(d.data()?.fechaPublicacion ?? "");
    return !isNaN(t) && t <= ahora.getTime();
  });
  if (vencido) return { trabajo: true, motivo: `el artículo programado ${vencido.id} ya debe salir` };

  // La colección puede no existir todavía: una consulta vacía no es un error.
  const solicitudes = await db.collection("solicitudesCuenta").limit(1).get();
  if (!solicitudes.empty) return { trabajo: true, motivo: "hay solicitudes de cuenta" };

  return { trabajo: false, motivo: "nada que hacer" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const destino = resolverDestino();
    console.log(destino.mensaje);
    iniciarAdmin();
    const r = await hayTrabajo(getFirestore());
    console.log(`Motivo: ${r.motivo}`);
    console.log(`TRABAJO=${r.trabajo ? 1 : 0}`);
  } catch (e) {
    console.error("✗ No se ha podido comprobar si hay trabajo:", e?.message ?? e);
    process.exitCode = 1;
  } finally {
    try { await deleteApp(getApp()); } catch {}
  }
}
