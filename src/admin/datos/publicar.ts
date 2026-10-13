// "Publicar cambios": cuántos cambios hay sin publicar y la petición de publicar.
import { collection, doc, getCountFromServer, getDoc, query, updateDoc, where, type Firestore } from "firebase/firestore";

export type Cuenta = { nunca: boolean; cambios: number | null; pendiente: boolean };
export type Resultado = { rapido: boolean };
export const TIEMPO_ESPERA_MS = 10_000;

function aIso(v: unknown): string | null {
  if (typeof v === "string") return v || null;
  const t = (v as { toDate?: () => Date } | null)?.toDate?.();
  return t ? t.toISOString() : null;
}

/**
 * Cambios sin publicar = artículos (sin contar borradores, que no están en la web) guardados después de la última exportación (estado/sistema.ultimaExportacion).
 * Si nunca ha habido exportación, no se puede contar: `nunca: true`.
 * (Los comentarios no se cuentan: no guardan la fecha en que se moderaron, y la cuenta sería inexacta.)
 */
export async function contarCambios(db: Firestore): Promise<Cuenta> {
  const s = await getDoc(doc(db, "estado", "sistema"));
  const d = s.exists() ? s.data() : {};
  const pendiente = d.publicarPendiente === true;
  const desde = aIso(d.ultimaExportacion);
  if (!desde) return { nunca: true, cambios: null, pendiente };
  const c = await getCountFromServer(query(collection(db, "articulos"), where("estado", "in", ["publicado", "programado", "papelera"]), where("actualizadoEn", ">", desde)));
  return { nunca: false, cambios: c.data().count, pendiente };
}

type Opciones = {
  /** PUBLIC_URL_PUBLICAR; si falta o no es segura, solo se deja la marca y se publica en la siguiente ronda automática. */
  url: string | undefined;
  obtenerToken: () => Promise<string>;
  fetchFn?: typeof fetch;
  tiempoMs?: number;
};

/** Solo https, o http en la propia máquina (simulador). */
export function urlPublicarSegura(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

/**
 * Deja la marca «publicar pendiente». Si eso falla, lanza el error (nunca se da por hecho).
 * Después, si hay dirección segura, la avisa con el token del usuario (10 s como máximo, contando también el pedir el token):
 * `rapido: true` si respondió bien. Un fallo al avisar no es un error: la marca ya está puesta y se publicará en la siguiente ronda.
 */
export async function publicarCambios(db: Firestore, { url, obtenerToken, fetchFn, tiempoMs = TIEMPO_ESPERA_MS }: Opciones): Promise<Resultado> {
  await updateDoc(doc(db, "estado", "sistema"), { publicarPendiente: true });
  if (!urlPublicarSegura(url)) return { rapido: false };
  const control = new AbortController();
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => {
      control.abort();
      rechazar(new Error("tiempo"));
    }, tiempoMs);
  });
  limite.catch(() => {}); // evita el aviso de rechazo sin atender cuando todo va bien
  try {
    const token = await Promise.race([obtenerToken(), limite]);
    const llamar = fetchFn ?? fetch;
    const r = await Promise.race([
      llamar(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: control.signal, redirect: "error" }),
      limite,
    ]);
    return { rapido: r.ok === true };
  } catch {
    return { rapido: false };
  } finally {
    clearTimeout(reloj);
  }
}
