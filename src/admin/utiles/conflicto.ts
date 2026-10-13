// Dos personas editando a la vez: se compara la fecha de último cambio que se cargó con la que hay ahora.

/**
 * True si el artículo ha cambiado desde que se abrió.
 * `cargadoEn` es lo que tenía "actualizadoEn" al abrir el artículo; `actualEn`, lo que tiene ahora en el servidor.
 * Si falta alguna de las dos no se puede asegurar que sea el mismo estado: se trata como cambio.
 */
export function hayConflicto(cargadoEn: string | null | undefined, actualEn: string | null | undefined): boolean {
  if (!cargadoEn || !actualEn) return true;
  return cargadoEn !== actualEn;
}
