import { sanear } from "../../lib/sanear";

/** Texto plano de un trozo de HTML (sin ejecutar nada: se lee con un analizador sin pantalla). */
export function textoPlano(html: string): string {
  const doc = new DOMParser().parseFromString(sanear(html).replace(/<\/(p|h[1-6]|li|blockquote|figcaption|tr)>|<br\s*\/?>/gi, " "), "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Extracto automático: el principio del texto, cortado en una palabra entera. */
export function extractoDesde(html: string, maximo = 200): string {
  const t = textoPlano(html);
  if (t.length <= maximo) return t;
  const corte = t.slice(0, maximo + 1);
  const ultimo = corte.lastIndexOf(" ");
  return (ultimo > maximo * 0.6 ? corte.slice(0, ultimo) : t.slice(0, maximo)).replace(/[\s.,;:!?¡¿-]+$/, "") + "…";
}
