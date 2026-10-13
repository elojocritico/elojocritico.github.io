// Horas de España (Europe/Madrid) <-> UTC, con el cambio de hora de verano/invierno bien resuelto.
// Es JavaScript plano para que lo usen tanto el panel como el importador (scripts/importar.mjs).

const FORMATO = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Hora de pared de Madrid en un instante, como milisegundos "en UTC" (sirve para restar y obtener el desfase). */
function paredDeMadrid(ms) {
  const p = Object.fromEntries(FORMATO.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/**
 * "2026-07-01T09:30" (hora de España) -> "2026-07-01T07:30:00.000Z".
 * Devuelve null si el texto no es una fecha y hora real (p. ej. 30 de febrero).
 * En la hora que no existe (salto de marzo) se usa la hora de verano; en la repetida (octubre), la primera.
 */
export function madridAUtc(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(local ?? "").trim());
  if (!m) return null;
  const [a, mes, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)];
  const pared = Date.UTC(a, mes - 1, d, h, mi, s);
  const comprobar = new Date(pared);
  if (comprobar.getUTCFullYear() !== a || comprobar.getUTCMonth() !== mes - 1 || comprobar.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  // Se prueba con los dos desfases posibles de Madrid (+1 y +2 horas) y se queda con el que cuadra.
  const candidatos = [2, 1].map((horas) => pared - horas * 3600000).filter((ms) => paredDeMadrid(ms) === pared);
  const ms = candidatos[0] ?? pared - 2 * 3600000 - (paredDeMadrid(pared - 2 * 3600000) - pared); // hora inexistente: se corrige
  return new Date(ms).toISOString();
}

/** "2026-07-01T07:30:00.000Z" -> "2026-07-01T09:30" (para un campo de fecha y hora). "" si no es una fecha. */
export function utcAMadrid(iso) {
  const t = new Date(iso).getTime();
  if (!iso || isNaN(t)) return "";
  return new Date(paredDeMadrid(t)).toISOString().slice(0, 16);
}

/** "2020-03-04" -> las 12:00 de ese día en Madrid, en UTC. Lo usa el importador. */
export function mediodiaMadridUtc(fecha) {
  return madridAUtc(`${fecha}T12:00`);
}
