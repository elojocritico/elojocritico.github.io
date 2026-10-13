// Envío de un comentario del público. Lo usa el formulario de la web (sin React) y las pruebas.
// Las reglas del servidor exigen estos mismos límites; aquí se comprueban antes para avisar en llano.
import { addDoc, collection, serverTimestamp, type Firestore } from "firebase/firestore";
import { MENSAJE_FALLO, revisar, type DatosComentario } from "./reglasComentario";

export { LIMITES, MENSAJE_GRACIAS, MENSAJE_FALLO, revisar, type DatosComentario } from "./reglasComentario";
export type Resultado = { ok: true; enviado: boolean } | { ok: false; error: string };

/**
 * Guarda el comentario como "pendiente". Si la trampa para robots viene rellena, finge que ha ido bien y no escribe nada.
 * Las respuestas a otros comentarios no se admiten desde el formulario: respuestaA es siempre null.
 */
export async function enviarComentario(db: Firestore, d: DatosComentario): Promise<Resultado> {
  if ((d.trampa ?? "").trim() !== "") return { ok: true, enviado: false };
  const aviso = revisar(d);
  if (aviso) return { ok: false, error: aviso };
  try {
    await addDoc(collection(db, "comentarios"), {
      articuloSlug: d.articuloSlug,
      nombre: d.nombre.trim(),
      correo: (d.correo ?? "").trim(),
      texto: d.texto.trim(),
      respuestaA: null,
      estado: "pendiente",
      origen: "nuevo",
      creadoEn: serverTimestamp(),
    });
    return { ok: true, enviado: true };
  } catch {
    return { ok: false, error: MENSAJE_FALLO };
  }
}
