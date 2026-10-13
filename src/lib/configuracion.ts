import type { FirebaseOptions } from "firebase/app";

/** Lee y valida la configuración de Firebase (texto JSON); devuelve null si falta o está mal escrita. */
export function leerConfiguracion(texto: string | undefined): FirebaseOptions | null {
  if (!texto) return null;
  try {
    const c = JSON.parse(texto);
    return c && typeof c === "object" && typeof c.projectId === "string" && typeof c.apiKey === "string" ? c : null;
  } catch {
    return null;
  }
}
