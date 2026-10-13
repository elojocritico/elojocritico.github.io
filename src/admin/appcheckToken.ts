// Token de App Check del panel, a mejor esfuerzo: si App Check no está iniciado (simulador, sin clave) o falla, devuelve null.
import { getToken } from "firebase/app-check";
import * as fb from "./firebase";

export async function tokenAppCheck(): Promise<string | null> {
  try {
    const ac = (fb as { appCheck?: Parameters<typeof getToken>[0] | null }).appCheck;
    if (!ac) return null;
    const r = await getToken(ac, false);
    return r.token || null;
  } catch {
    return null;
  }
}
