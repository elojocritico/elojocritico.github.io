export type Color = "verde" | "amarillo" | "rojo" | "gris";

const HORA = 3600_000;

/** Acepta ISO, milisegundos, Timestamp de Firestore o Date; devuelve ms o null. */
export function aMilisegundos(valor: unknown): number | null {
  if (valor == null) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    const t = Date.parse(valor);
    return Number.isNaN(t) ? null : t;
  }
  if (valor instanceof Date) return valor.getTime();
  const v = valor as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

/** Verde: menos de 48 h; amarillo: menos de 7 dias; rojo: mas; gris: sin dato. */
export function colorDeAntiguedad(valor: unknown, ahora: number): Color {
  const t = aMilisegundos(valor);
  if (t === null) return "gris";
  const edad = ahora - t;
  if (edad < 48 * HORA) return "verde";
  if (edad < 7 * 24 * HORA) return "amarillo";
  return "rojo";
}

export const PUNTOS = [
  { campo: "ultimaPublicacion", nombre: "Última publicación" },
  { campo: "ultimaExportacion", nombre: "Última exportación del contenido" },
  { campo: "ultimaSincronizacionMedios", nombre: "Última revisión de podcast y vídeos" },
  { campo: "ultimaCopia", nombre: "Última copia de seguridad" },
] as const;

export type Punto = { campo: string; nombre: string; color: Color; fecha: number | null };

export function calcularSemaforo(estado: Record<string, unknown> | null | undefined, ahora: number): Punto[] {
  return PUNTOS.map((p) => ({
    ...p,
    color: colorDeAntiguedad(estado?.[p.campo], ahora),
    fecha: aMilisegundos(estado?.[p.campo]),
  }));
}
