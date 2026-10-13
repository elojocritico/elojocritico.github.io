// "Dirección de la página": el nombre que va en la web, p. ej. elojocritico.github.io/<dirección>/
// Es también el identificador del artículo, por eso no puede repetirse ni chocar con rutas propias de la web.

export const MAX_DIRECCION = 80;

/** Mismas rutas reservadas que scripts/verificar.mjs (hay una prueba que comprueba que siguen iguales). */
export const RESERVADAS = [
  "articulos", "tema", "anio", "revista", "podcast", "videos", "que-es-eoc", "buscar",
  "img", "logo", "pagefind", "admin", "category", "feed", "wp-content", "404", "rss.xml",
];

/** Del título a una dirección: minúsculas, sin tildes, ñ -> n, signos y espacios -> "-", máximo 80 letras. */
export function direccionDesdeTitulo(titulo: string): string {
  const base = (titulo ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, MAX_DIRECCION).replace(/-+$/g, "");
}

/** Lo que escribe la persona al editar la dirección a mano: se limpia igual que un título. */
export const limpiarDireccion = (texto: string) => direccionDesdeTitulo(texto);

/** Mensaje en llano si la dirección no sirve; null si está bien. (No mira si ya existe: eso se pregunta a la base de datos.) */
export function problemaDeDireccion(direccion: string): string | null {
  if (!direccion) return "Escribe una dirección para la página.";
  if (direccion.length > MAX_DIRECCION) return `La dirección es demasiado larga (máximo ${MAX_DIRECCION} letras).`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(direccion)) return "La dirección solo puede llevar letras sin tilde, números y guiones.";
  if (RESERVADAS.includes(direccion)) return "Esa dirección está reservada para la web. Elige otra.";
  return null;
}
