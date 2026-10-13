import { describe, it, expect, vi } from "vitest";

vi.mock("firebase/firestore", () => ({ doc: vi.fn(), updateDoc: vi.fn(async () => {}), collection: vi.fn(), getCountFromServer: vi.fn(), getDoc: vi.fn(), query: vi.fn(), where: vi.fn() }));
import { publicarCambios } from "./publicar";

const BD = {} as never;
const ok = () => vi.fn(async () => ({ ok: true }) as Response);

describe("publicarCambios y App Check", () => {
  it("envía X-Firebase-AppCheck cuando hay token", async () => {
    const f = ok();
    await publicarCambios(BD, { url: "https://p.test/", obtenerToken: async () => "id", obtenerAppCheck: async () => "ac", fetchFn: f as never });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ Authorization: "Bearer id", "X-Firebase-AppCheck": "ac" });
  });

  it("sin App Check (null, error o sin función) no envía la cabecera", async () => {
    for (const obtenerAppCheck of [async () => null, async () => { throw new Error("x"); }, undefined]) {
      const f = ok();
      await publicarCambios(BD, { url: "https://p.test/", obtenerToken: async () => "id", obtenerAppCheck, fetchFn: f as never });
      expect((f.mock.calls[0][1] as RequestInit).headers).toEqual({ Authorization: "Bearer id" });
    }
  });
});
