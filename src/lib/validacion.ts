// Validaciones compartidas por el panel (al guardar), la web (al leer los ajustes) y, en espejo, firestore.rules.
// Defensa en profundidad: lo que llega a la web pública nunca se fía de lo guardado.
export const REGEX_CLIENTE = /^ca-pub-\d{16}$/;
export const REGEX_BLOQUE = /^\d{10}$/;
export const REGEX_ENLACE = /^https?:\/\//i;

/** Dirección web http(s) bien formada. */
export function esUrlWeb(valor: string): boolean {
  const v = (valor ?? "").trim();
  if (!REGEX_ENLACE.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const esCliente = (v: string) => REGEX_CLIENTE.test(v);
export const esBloque = (v: string) => REGEX_BLOQUE.test(v);
