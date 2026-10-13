// Decide si el flujo horario tiene algo que hacer. Imprime TRABAJO=1 o TRABAJO=0.
// Cuesta pocas lecturas: estado/sistema, los artículos programados y 1 solicitud de cuenta como máximo.
//
// Hay trabajo si:
//  - estado/sistema.publicarPendiente es true (alguien pulsó "Publicar cambios"), o
//  - hay artículos programados cuya fecha ya ha llegado, o
//  - hay alguna solicitud de cuenta (solicitudesCuenta/{correo}) sin atender, o
//  - la web desplegada no es el commit descargado (EOC_COMMIT_ACTUAL frente a estado/sistema.ultimoDespliegue), o
//  - la última copia de seguridad falta o tiene más de 25 h Y el último intento de copia (estado/sistema.ultimoIntentoCopia,
//    que anota el flujo al empezar el trabajo de la noche) falta o tiene más de 20 h: entonces NOCHE=1 y el flujo hace el trabajo
//    nocturno. Así, si la copia falla de forma persistente, se reintenta como mucho cada 20 h y no cada hora (cuota de Firestore).
// Salida: TRABAJO=1|0, NOCHE=1|0, AL_DIA=1|0 y COPIA_RECIENTE=1|0 (copia de menos de 20 h: el disparo nocturno repetido no la rehace).
// Uso:  node scripts/hay-trabajo.mjs --real
import { getApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fileURLToPath } from "node:url";
import { resolverDestino } from "./destino-firebase.mjs";
import { iniciarAdmin } from "./crear-admin.mjs";

const HORAS_COPIA = 25;
const HORAS_ENTRE_INTENTOS = 20;
const HORAS_COPIA_RECIENTE = 20;

/**
 * commit: SHA de la versión descargada (opcional). Si se indica y no coincide con estado/sistema.ultimoDespliegue,
 * la web publicada no es esta versión (p. ej. falló GitHub Pages tras subir el contenido) y hay que desplegar.
 * Devuelve { trabajo, motivo, noche, alDia, copiaReciente }:
 *  - noche: la última copia de seguridad falta o tiene más de 25 h (el disparo nocturno pudo perderse) y no se ha intentado en las últimas 20 h: hay que hacer el trabajo de la noche.
 *  - copiaReciente: la última copia tiene menos de 20 h (sirve para no repetir la noche si el disparo nocturno llega dos veces).
 *  - alDia: lo desplegado es este commit (true si no se indicó commit).
 */
export async function hayTrabajo(db, ahora = new Date(), commit = undefined) {
  const estado = await db.doc("estado/sistema").get();
  const d = estado.exists ? estado.data() ?? {} : {};
  const copia = Date.parse(d.ultimaCopia ?? "");
  const intento = Date.parse(d.ultimoIntentoCopia ?? "");
  const copiaVieja = isNaN(copia) || ahora.getTime() - copia > HORAS_COPIA * 3600_000;
  const intentoViejo = isNaN(intento) || ahora.getTime() - intento > HORAS_ENTRE_INTENTOS * 3600_000;
  const noche = copiaVieja && intentoViejo;
  const copiaReciente = !isNaN(copia) && ahora.getTime() - copia < HORAS_COPIA_RECIENTE * 3600_000;
  const alDia = !commit || d.ultimoDespliegue === commit;
  const r = (trabajo, motivo) => ({ trabajo, motivo, noche, alDia, copiaReciente });

  if (d.publicarPendiente === true) return r(true, "hay una publicación pendiente");
  if (!alDia) return r(true, "la web publicada no corresponde a la última versión del repositorio");
  if (noche) return r(true, "falta la copia de seguridad de la noche");

  // Solo por estado (como el exportador): filtrar también por fecha pediría un índice compuesto. Los programados son pocos.
  const programados = await db.collection("articulos").where("estado", "==", "programado").get();
  const vencido = programados.docs.find((x) => {
    const t = Date.parse(x.data()?.fechaPublicacion ?? "");
    return !isNaN(t) && t <= ahora.getTime();
  });
  if (vencido) return r(true, `el artículo programado ${vencido.id} ya debe salir`);

  // La colección puede no existir todavía: una consulta vacía no es un error.
  const solicitudes = await db.collection("solicitudesCuenta").limit(1).get();
  if (!solicitudes.empty) return r(true, "hay solicitudes de cuenta");

  return r(false, "nada que hacer");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const destino = resolverDestino();
    console.log(destino.mensaje);
    iniciarAdmin();
    const r = await hayTrabajo(getFirestore(), new Date(), process.env.EOC_COMMIT_ACTUAL || undefined);
    console.log(`Motivo: ${r.motivo}`);
    console.log(`TRABAJO=${r.trabajo ? 1 : 0}`);
    console.log(`NOCHE=${r.noche ? 1 : 0}`);
    console.log(`AL_DIA=${r.alDia ? 1 : 0}`);
    console.log(`COPIA_RECIENTE=${r.copiaReciente ? 1 : 0}`);
  } catch (e) {
    console.error("✗ No se ha podido comprobar si hay trabajo:", e?.message ?? e);
    process.exitCode = 1;
  } finally {
    try { await deleteApp(getApp()); } catch {}
  }
}
