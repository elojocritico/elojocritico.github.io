import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const estado = vi.hoisted(() => ({ cb: null as null | ((u: unknown) => unknown), signOut: vi.fn(), getDoc: vi.fn() }));

vi.mock("./firebase", () => ({ auth: {}, db: {}, configurado: true }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => unknown) => {
    estado.cb = cb;
    return () => {};
  },
  signOut: estado.signOut,
}));
vi.mock("firebase/firestore", () => ({ doc: () => ({}), getDoc: estado.getDoc }));

import { usarSesion, papelDe } from "./sesion";

beforeEach(() => {
  estado.signOut.mockReset().mockResolvedValue(undefined);
  estado.getDoc.mockReset();
});

describe("papelDe", () => {
  it("compara en minusculas y rechaza papeles raros", () => {
    expect(papelDe({ "ana@x.es": "admin" }, "Ana@X.es")).toBe("admin");
    expect(papelDe({ "Ana@X.es": "editor" }, "ana@x.es")).toBe("editor");
    expect(papelDe({ "ana@x.es": "jefe" }, "ana@x.es")).toBeNull();
    expect(papelDe(undefined, "a@b.c")).toBeNull();
  });
});

describe("usarSesion", () => {
  it("usuario autorizado: devuelve su papel", async () => {
    estado.getDoc.mockResolvedValue({ data: () => ({ usuarios: { "ana@x.es": "editor" } }) });
    const { result } = renderHook(() => usarSesion());
    expect(result.current.cargando).toBe(true);
    await estado.cb!({ email: "Ana@x.es", emailVerified: true });
    await waitFor(() => expect(result.current.papel).toBe("editor"));
    expect(result.current.cargando).toBe(false);
  });

  it("usuario no autorizado: cierra la sesion y avisa", async () => {
    estado.getDoc.mockResolvedValue({ data: () => ({ usuarios: { "otra@x.es": "admin" } }) });
    const { result } = renderHook(() => usarSesion());
    await estado.cb!({ email: "intruso@x.es", emailVerified: true });
    await waitFor(() => expect(result.current.error).toMatch(/no tiene permiso/));
    expect(estado.signOut).toHaveBeenCalled();
    expect(result.current.usuario).toBeNull();
  });

  it("permiso denegado por las reglas: tambien sale con el mensaje", async () => {
    estado.getDoc.mockRejectedValue({ code: "permission-denied" });
    const { result } = renderHook(() => usarSesion());
    await estado.cb!({ email: "x@x.es", emailVerified: true });
    await waitFor(() => expect(result.current.error).toMatch(/no tiene permiso/));
    expect(estado.signOut).toHaveBeenCalled();
  });

  it("sin conexion: mensaje de conexion y no cierra sesion", async () => {
    estado.getDoc.mockRejectedValue({ code: "unavailable" });
    const { result } = renderHook(() => usarSesion());
    await estado.cb!({ email: "x@x.es", emailVerified: true });
    await waitFor(() => expect(result.current.error).toMatch(/No hay conexión/));
    expect(estado.signOut).not.toHaveBeenCalled();
  });

  it("correo sin verificar: no entra ni consulta la lista", async () => {
    const { result } = renderHook(() => usarSesion());
    await estado.cb!({ email: "x@x.es", emailVerified: false });
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.usuario).toBeNull();
    expect(estado.getDoc).not.toHaveBeenCalled();
  });
});
