// Firestore no admite documentos de más de 1 MiB. En modo de prueba las fotos van dentro del propio artículo (data:),
// así que antes de guardar se calcula el tamaño y, si no cabe, se dice la causa en llano.
export const LIMITE_BYTES = 900 * 1024;

const bytes = (t: string) => new TextEncoder().encode(t).length;

/** Mensaje en llano si el artículo no cabe; null si cabe. `documento` es lo que se va a escribir. */
export function problemaDeTamano(documento: { portada?: { src: string } | null; cuerpoHtml?: string } & Record<string, unknown>): string | null {
  const total = bytes(JSON.stringify(documento));
  if (total <= LIMITE_BYTES) return null;
  const portada = documento.portada?.src ?? "";
  const cuerpo = documento.cuerpoHtml ?? "";
  if (portada.startsWith("data:") && bytes(portada) >= bytes(cuerpo)) {
    return "La foto de portada es demasiado grande para el modo de prueba. Quítala o elige una foto más pequeña.";
  }
  if (/src="data:/i.test(cuerpo)) {
    return "Hay demasiadas fotos pegadas en el texto para el modo de prueba. Quita alguna o usa fotos más pequeñas.";
  }
  return "El artículo es demasiado grande para guardarse. Acórtalo o quita alguna foto.";
}
