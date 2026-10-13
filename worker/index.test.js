import { describe, it, expect, vi, beforeAll } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { crearManejador, verificarToken } from "./index.js";

const PROYECTO = "elojocritico-87f48";
const ORIGEN = "https://elojocritico.github.io";
const ENV = { FIREBASE_PROJECT_ID: PROYECTO, GITHUB_TOKEN_PUBLICAR: "ghp-secreto", GITHUB_REPO: "elojocritico/elojocritico.github.io" };

let par, otroPar;
beforeAll(async () => {
  par = await generateKeyPair("RS256");
  otroPar = await generateKeyPair("RS256");
});

async function firmar({ aud = PROYECTO, iss = `https://securetoken.google.com/${PROYECTO}`, exp = "1h", email = "Ana@X.es", verificado = true, sub = "uid1", clave } = {}) {
  const claims = { email_verified: verificado };
  if (email !== null) claims.email = email;
  const j = new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp);
  if (sub) j.setSubject(sub);
  return j.sign(clave ?? par.privateKey);
}

const docAjustes = (usuarios) => ({
  fields: { usuarios: { mapValue: { fields: Object.fromEntries(Object.entries(usuarios).map(([k, v]) => [k, { stringValue: v }])) } } },
});
const json = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado });

/** fetch falso: Firestore y GitHub. */
function red({ ajustes = json(docAjustes({ "ana@x.es": "editor" })), github = new Response(null, { status: 204 }) } = {}) {
  return vi.fn(async (url) => (String(url).startsWith("https://firestore.googleapis.com") ? ajustes : github));
}

function manejador(fetchFn) {
  return crearManejador({ verificar: (t, p) => verificarToken(t, p, par.publicKey), fetchFn });
}

function peticion({ metodo = "POST", origen = ORIGEN, token, appCheck, ruta = "/" } = {}) {
  const h = {};
  if (origen) h.Origin = origen;
  if (token) h.Authorization = `Bearer ${token}`;
  if (appCheck) h["X-Firebase-AppCheck"] = appCheck;
  return new Request(`https://eoc-publicar.test${ruta}`, { method: metodo, headers: h });
}

const llamadasA = (f, prefijo) => f.mock.calls.filter(([u]) => String(u).startsWith(prefijo));

describe("autenticación", () => {
  it("token caducado: 401 y no se llama a nadie", async () => {
    const f = red();
    const r = await manejador(f)(peticion({ token: await firmar({ exp: "-1m" }) }), ENV);
    expect(r.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("token de otro proyecto (aud): 401", async () => {
    const f = red();
    const r = await manejador(f)(peticion({ token: await firmar({ aud: "otro-proyecto" }) }), ENV);
    expect(r.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("token de otro emisor (iss): 401", async () => {
    const r = await manejador(red())(peticion({ token: await firmar({ iss: "https://securetoken.google.com/otro" }) }), ENV);
    expect(r.status).toBe(401);
  });

  it("firmado con otra clave: 401", async () => {
    const r = await manejador(red())(peticion({ token: await firmar({ clave: otroPar.privateKey }) }), ENV);
    expect(r.status).toBe(401);
  });

  it("correo sin verificar: 401", async () => {
    const f = red();
    const r = await manejador(f)(peticion({ token: await firmar({ verificado: false }) }), ENV);
    expect(r.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("sin correo en el token: 401", async () => {
    const r = await manejador(red())(peticion({ token: await firmar({ email: null }) }), ENV);
    expect(r.status).toBe(401);
  });

  it("sin cabecera Authorization: 401", async () => {
    const r = await manejador(red())(peticion(), ENV);
    expect(r.status).toBe(401);
  });
});

describe("papel", () => {
  it("usuario que no está en la lista: 403 y no se lanza el dispatch", async () => {
    const f = red({ ajustes: json(docAjustes({ "otra@x.es": "admin" })) });
    const r = await manejador(f)(peticion({ token: await firmar() }), ENV);
    expect(r.status).toBe(403);
    expect(llamadasA(f, "https://api.github.com")).toHaveLength(0);
  });

  it("papel desconocido: 403", async () => {
    const f = red({ ajustes: json(docAjustes({ "ana@x.es": "lector" })) });
    expect((await manejador(f)(peticion({ token: await firmar() }), ENV)).status).toBe(403);
  });

  it("Firestore deniega la lectura (reglas): 403", async () => {
    const f = red({ ajustes: json({ error: { status: "PERMISSION_DENIED" } }, 403) });
    const r = await manejador(f)(peticion({ token: await firmar() }), ENV);
    expect(r.status).toBe(403);
    expect(llamadasA(f, "https://api.github.com")).toHaveLength(0);
  });

  it("Firestore caído: 502", async () => {
    const f = red({ ajustes: json({}, 503) });
    expect((await manejador(f)(peticion({ token: await firmar() }), ENV)).status).toBe(502);
  });
});

describe("publicar", () => {
  it("editor válido: una sola llamada a GitHub con el cuerpo y cabeceras correctos", async () => {
    const f = red();
    const r = await manejador(f)(peticion({ token: await firmar() }), ENV);
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEN);
    const gh = llamadasA(f, "https://api.github.com");
    expect(gh).toHaveLength(1);
    const [url, init] = gh[0];
    expect(url).toBe("https://api.github.com/repos/elojocritico/elojocritico.github.io/dispatches");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ event_type: "publicar" });
    expect(init.headers).toMatchObject({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: "Bearer ghp-secreto",
    });
    expect(init.headers["User-Agent"]).toBeTruthy();
  });

  it("admin también puede; el correo se compara en minúsculas", async () => {
    const f = red({ ajustes: json(docAjustes({ "ana@x.es": "admin" })) });
    const r = await manejador(f)(peticion({ token: await firmar({ email: "ANA@X.ES" }) }), ENV);
    expect(r.status).toBe(200);
  });

  it("lee Firestore con el token del usuario y reenvía X-Firebase-AppCheck sin cambios", async () => {
    const f = red();
    const token = await firmar();
    await manejador(f)(peticion({ token, appCheck: "ac-token" }), ENV);
    const [url, init] = llamadasA(f, "https://firestore.googleapis.com")[0];
    expect(url).toBe(`https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents/ajustes/global`);
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Authorization: `Bearer ${token}`, "X-Firebase-AppCheck": "ac-token" });
  });

  it("sin App Check no se envía la cabecera", async () => {
    const f = red();
    await manejador(f)(peticion({ token: await firmar() }), ENV);
    expect(llamadasA(f, "https://firestore.googleapis.com")[0][1].headers).not.toHaveProperty("X-Firebase-AppCheck");
  });

  it("GitHub rechaza: 502", async () => {
    const f = red({ github: new Response("{}", { status: 403 }) });
    expect((await manejador(f)(peticion({ token: await firmar() }), ENV)).status).toBe(502);
  });

  it("fallo de red: 502 y la respuesta no contiene el token", async () => {
    const f = vi.fn(async () => {
      throw new Error("caído");
    });
    const token = await firmar();
    const r = await manejador(f)(peticion({ token }), ENV);
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain(token);
  });

  it("sin secreto de GitHub configurado: 500", async () => {
    const r = await manejador(red())(peticion({ token: await firmar() }), { ...ENV, GITHUB_TOKEN_PUBLICAR: "" });
    expect(r.status).toBe(500);
  });

  it("las llamadas salientes llevan señal de tiempo máximo", async () => {
    const f = red();
    await manejador(f)(peticion({ token: await firmar() }), ENV);
    for (const [, init] of f.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("CORS y método", () => {
  it("preflight desde un origen permitido: 204 con cabeceras", async () => {
    for (const origen of ["https://elojocritico.github.io", "https://elojocritico.pages.dev"]) {
      const r = await manejador(red())(peticion({ metodo: "OPTIONS", origen }), ENV);
      expect(r.status).toBe(204);
      expect(r.headers.get("Access-Control-Allow-Origin")).toBe(origen);
      expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      const permitidas = r.headers.get("Access-Control-Allow-Headers").toLowerCase();
      expect(permitidas).toContain("authorization");
      expect(permitidas).toContain("x-firebase-appcheck");
    }
  });

  it("preflight desde otro origen: 403 sin cabeceras CORS", async () => {
    const r = await manejador(red())(peticion({ metodo: "OPTIONS", origen: "https://malo.example" }), ENV);
    expect(r.status).toBe(403);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("POST desde otro origen o sin origen: 403 y no se llama a nadie", async () => {
    const f = red();
    const token = await firmar();
    for (const origen of ["https://malo.example", "https://elojocritico.github.io.malo.example", null]) {
      const r = await manejador(f)(peticion({ origen, token }), ENV);
      expect(r.status).toBe(403);
      expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("GET: 405; otra ruta: 404", async () => {
    expect((await manejador(red())(peticion({ metodo: "GET" }), ENV)).status).toBe(405);
    expect((await manejador(red())(peticion({ ruta: "/otra" }), ENV)).status).toBe(404);
  });
});
