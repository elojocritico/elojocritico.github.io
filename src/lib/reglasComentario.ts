// Límites y mensajes del formulario de comentarios. Sin dependencias: se carga con la página.
export const LIMITES = { nombre: 60, texto: 3000, correo: 120 } as const;
export const MENSAJE_GRACIAS = "Gracias. Tu comentario se publicará cuando lo revise un moderador";
export const MENSAJE_FALLO = "No se ha podido enviar ahora. Inténtalo más tarde";

export type DatosComentario = { articuloSlug: string; nombre: string; texto: string; correo?: string; trampa?: string };

/** Campo del formulario al que se refiere un aviso. */
export function campoDelAviso(d: DatosComentario): "nombre" | "texto" | "correo" | null {
  const nombre = d.nombre.trim(), texto = d.texto.trim(), correo = (d.correo ?? "").trim();
  if (!nombre || nombre.length > LIMITES.nombre) return "nombre";
  if (!texto || texto.length > LIMITES.texto) return "texto";
  if (correo.length > LIMITES.correo) return "correo";
  return null;
}

/** Devuelve un aviso en llano si algo no cumple los límites, o null si todo está bien. */
export function revisar(d: DatosComentario): string | null {
  const nombre = d.nombre.trim(), texto = d.texto.trim(), correo = (d.correo ?? "").trim();
  if (!nombre) return "Escribe tu nombre.";
  if (nombre.length > LIMITES.nombre) return `El nombre no puede tener más de ${LIMITES.nombre} letras.`;
  if (!texto) return "Escribe tu comentario.";
  if (texto.length > LIMITES.texto) return `El comentario no puede tener más de ${LIMITES.texto} letras.`;
  if (correo.length > LIMITES.correo) return `El correo no puede tener más de ${LIMITES.correo} letras.`;
  if (!d.articuloSlug || d.articuloSlug.includes("/") || d.articuloSlug.length > 200) return MENSAJE_FALLO;
  return null;
}
