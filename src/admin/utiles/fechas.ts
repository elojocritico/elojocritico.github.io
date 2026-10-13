// Fechas del panel: se guardan en UTC ("...Z") y se muestran y se piden en hora de España.
export { madridAUtc, utcAMadrid, mediodiaMadridUtc } from "../../lib/madrid.js";

/** "3 de mayo de 2026, 09:30" en hora de España; "" si no es una fecha. */
export function fechaHoraLlana(iso: string): string {
  const f = new Date(iso);
  if (!iso || isNaN(f.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(f);
}

