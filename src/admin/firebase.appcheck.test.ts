import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const orden: string[] = [];
const m = vi.hoisted(() => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaV3Provider: vi.fn(),
  getFirestore: vi.fn(),
}));
vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ app: true })), getApps: () => [] }));
vi.mock("firebase/auth", () => ({ getAuth: vi.fn(() => ({})), connectAuthEmulator: vi.fn() }));
vi.mock("firebase/firestore", () => ({ getFirestore: (...a: unknown[]) => { orden.push("firestore"); return m.getFirestore(...a); }, connectFirestoreEmulator: vi.fn() }));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: (...a: unknown[]) => { orden.push("appcheck"); return m.initializeAppCheck(...a); },
  ReCaptchaV3Provider: function (this: unknown, clave: string) { m.ReCaptchaV3Provider(clave); },
}));

const CONFIG = '{"projectId":"demo-x","apiKey":"k"}';
beforeEach(() => {
  vi.resetModules();
  orden.length = 0;
  m.initializeAppCheck.mockReset();
  m.ReCaptchaV3Provider.mockReset();
  delete (globalThis as { __eocEmu?: boolean }).__eocEmu;
  vi.stubEnv("PUBLIC_FIREBASE_CONFIG", CONFIG);
});
afterEach(() => vi.unstubAllEnvs());

describe("App Check del panel", () => {
  it("con clave y sin simulador: se inicia con reCAPTCHA v3 antes de usar Firestore", async () => {
    vi.stubEnv("PUBLIC_RECAPTCHA_V3", "clave-publica");
    vi.stubEnv("PUBLIC_EMULADOR", "");
    await import("./firebase");
    expect(m.ReCaptchaV3Provider).toHaveBeenCalledWith("clave-publica");
    expect(m.initializeAppCheck).toHaveBeenCalledWith({ app: true }, expect.objectContaining({ isTokenAutoRefreshEnabled: true }));
    expect(orden.indexOf("appcheck")).toBeGreaterThanOrEqual(0);
    expect(orden.indexOf("appcheck")).toBeLessThan(orden.indexOf("firestore"));
  });

  it("en modo simulador no se inicia", async () => {
    vi.stubEnv("PUBLIC_RECAPTCHA_V3", "clave-publica");
    vi.stubEnv("PUBLIC_EMULADOR", "1");
    await import("./firebase");
    expect(m.initializeAppCheck).not.toHaveBeenCalled();
  });

  it("sin clave no se inicia", async () => {
    vi.stubEnv("PUBLIC_RECAPTCHA_V3", "");
    vi.stubEnv("PUBLIC_EMULADOR", "");
    await import("./firebase");
    expect(m.initializeAppCheck).not.toHaveBeenCalled();
  });
});
