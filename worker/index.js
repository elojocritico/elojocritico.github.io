// Worker «eoc-publicar»: camino rápido del botón «Publicar cambios» del panel.
// Verifica el token de Firebase del usuario, comprueba su papel en ajustes/global (con su propio token, así se aplican las reglas)
// y lanza repository_dispatch «publicar» en GitHub. Si falla, el flujo horario de GitHub publica igualmente.
import { createRemoteJWKSet, jwtVerify } from "jose";

export const ORIGENES_PERMITIDOS = ["https://elojocritico.github.io", "https://elojocritico.pages.dev"];
export const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
export const TIEMPO_MAXIMO_MS = 10_000;
const PAPELES = ["admin", "editor"];

let jwksGoogle;
/** Claves públicas de Google (se cachean mientras viva el Worker). */
function clavesDeGoogle() {
  jwksGoogle ??= createRemoteJWKSet(new URL(JWKS_URL), { timeoutDuration: 5000 });
  return jwksGoogle;
}

class Rechazo extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

function cabecerasCors(origen) {
  return {
    "Access-Control-Allow-Origin": origen,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, X-Firebase-AppCheck, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function responder(estado, cuerpo, origen) {
  const h = { "Content-Type": "application/json" };
  if (origen) Object.assign(h, cabecerasCors(origen));
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: h });
}

/** Verifica firma, caducidad, aud, iss y correo verificado. Devuelve el correo en minúsculas. */
export async function verificarToken(token, proyecto, claves = clavesDeGoogle()) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, claves, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${proyecto}`,
      audience: proyecto,
    }));
  } catch {
    throw new Rechazo(401, "Token no válido");
  }
  if (!payload.sub || typeof payload.email !== "string" || !payload.email || payload.email_verified !== true) {
    throw new Rechazo(401, "Correo sin verificar");
  }
  return payload.email.toLowerCase();
}

/** Papel del correo en ajustes/global. Una lectura denegada por las reglas o un documento ausente = sin papel. */
async function leerPapel({ token, appCheck, proyecto, correo, fetchFn, signal }) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(proyecto)}/databases/(default)/documents/ajustes/global`;
  const cabeceras = { Authorization: `Bearer ${token}` };
  if (appCheck) cabeceras["X-Firebase-AppCheck"] = appCheck;
  const r = await fetchFn(url, { method: "GET", headers: cabeceras, signal });
  if (r.status === 401 || r.status === 403 || r.status === 404) throw new Rechazo(403, "Sin permiso");
  if (!r.ok) throw new Rechazo(502, "No se pudo leer la lista de usuarios");
  const doc = await r.json();
  const papel = doc?.fields?.usuarios?.mapValue?.fields?.[correo]?.stringValue;
  if (!PAPELES.includes(papel)) throw new Rechazo(403, "Sin permiso");
  return papel;
}

async function lanzarPublicacion({ secreto, repo, fetchFn, signal }) {
  const r = await fetchFn(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "eoc-publicar",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${secreto}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "publicar" }),
    signal,
  });
  if (!r.ok) throw new Rechazo(502, "GitHub no aceptó la petición");
}

/**
 * Crea el manejador. `deps` es para las pruebas: `verificar(token, proyecto)` y `fetchFn`.
 */
export function crearManejador(deps = {}) {
  const verificar = deps.verificar ?? verificarToken;
  return async function manejar(request, env) {
    const origen = request.headers.get("Origin");
    const permitido = origen !== null && ORIGENES_PERMITIDOS.includes(origen);
    if (!permitido) return responder(403, { error: "Origen no permitido" }, null);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecerasCors(origen) });
    if (request.method !== "POST") return responder(405, { error: "Método no permitido" }, origen);
    if (new URL(request.url).pathname !== "/") return responder(404, { error: "No existe" }, origen);

    const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "");
    if (!m) return responder(401, { error: "Falta el token" }, origen);
    const token = m[1];

    const proyecto = env.FIREBASE_PROJECT_ID;
    const secreto = env.GITHUB_TOKEN_PUBLICAR;
    if (!proyecto || !secreto) return responder(500, { error: "Worker mal configurado" }, origen);

    const fetchFn = deps.fetchFn ?? fetch;
    const signal = AbortSignal.timeout(TIEMPO_MAXIMO_MS); // 10 s para todo el trabajo
    try {
      const correo = await verificar(token, proyecto);
      await leerPapel({ token, appCheck: request.headers.get("X-Firebase-AppCheck"), proyecto, correo, fetchFn, signal });
      await lanzarPublicacion({ secreto, repo: env.GITHUB_REPO || "elojocritico/elojocritico.github.io", fetchFn, signal });
      return responder(200, { ok: true }, origen);
    } catch (e) {
      if (e instanceof Rechazo) return responder(e.estado, { error: e.message }, origen);
      return responder(502, { error: "Fallo al contactar con los servicios" }, origen); // red o tiempo agotado; sin detalles (nunca el token)
    }
  };
}

const manejar = crearManejador();
export default { fetch: (request, env) => manejar(request, env) };
