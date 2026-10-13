// Cómo se muestra "quién hizo el cambio". Dos valores no son personas: los escriben los programas (importador y exportador).
const SISTEMA: Record<string, string> = {
  "migración": "Importado de la web antigua",
  "publicación programada": "Publicación programada",
  "script marcar-perdidas": "Arreglo automático de fotos",
  "script poner-fotos": "Arreglo automático de fotos",
};

/** Nombre en llano de quien hizo un cambio (el correo, o el motivo si lo hizo un programa). */
export function autorEnLlano(quien: string | null | undefined): string {
  const q = (quien ?? "").trim();
  return SISTEMA[q] ?? (q || "autor desconocido");
}

/** true si el cambio lo hizo un programa y no una persona. */
export const esAutorDeSistema = (quien: string | null | undefined) => (quien ?? "").trim() in SISTEMA;
