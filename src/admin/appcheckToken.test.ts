import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ getToken: vi.fn(), appCheck: { actual: null as unknown } }));
vi.mock("firebase/app-check", () => ({ getToken: m.getToken }));
vi.mock("./firebase", () => ({ get appCheck() { return m.appCheck.actual; } }));
import { tokenAppCheck } from "./appcheckToken";

beforeEach(() => { m.getToken.mockReset(); m.appCheck.actual = null; });

describe("tokenAppCheck", () => {
  it("sin App Check iniciado: null", async () => {
    expect(await tokenAppCheck()).toBeNull();
    expect(m.getToken).not.toHaveBeenCalled();
  });
  it("con App Check: el token (sin forzar renovación)", async () => {
    m.appCheck.actual = { ac: true };
    m.getToken.mockResolvedValue({ token: "tok" });
    expect(await tokenAppCheck()).toBe("tok");
    expect(m.getToken).toHaveBeenCalledWith({ ac: true }, false);
  });
  it("si falla: null", async () => {
    m.appCheck.actual = { ac: true };
    m.getToken.mockRejectedValue(new Error("x"));
    expect(await tokenAppCheck()).toBeNull();
  });
});
