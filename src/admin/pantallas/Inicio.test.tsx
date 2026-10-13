import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const f = vi.hoisted(() => ({ estado: null as null | Record<string, unknown>, pendientes: 3, fallo: false }));
vi.mock("../firebase", () => ({ auth: {}, db: {}, configurado: true }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDoc: async () => { if (f.fallo) throw { code: "permission-denied" }; return { exists: () => f.estado !== null, data: () => f.estado }; },
  onSnapshot: (_q: unknown, ok: (s: { size: number }) => void) => {
    ok({ size: f.pendientes });
    return () => {};
  },
}));

import { Inicio } from "./Inicio";

const usuario = { email: "Ana@x.es" } as never;

describe("Inicio", () => {
  it("sin datos: 4 botones grandes y semaforo gris", async () => {
    f.estado = null;
    render(<Inicio usuario={usuario} papel="admin" />);
    expect(screen.getByText("Hola, Ana")).toBeInTheDocument();
    expect(screen.getAllByRole("button").filter((b) => b.classList.contains("grande"))).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Escribir artículo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mis artículos" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Comentarios pendientes\s*\(3\)/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Publicar cambios/ })).toBeInTheDocument();
    expect(await screen.findByText("Aún no hay datos")).toBeInTheDocument();
    expect(document.querySelectorAll(".luz-gris").length).toBe(1);
    expect(document.querySelectorAll(".luz-verde, .luz-rojo, .luz-amarillo").length).toBe(0);
  });

  it("con datos: colores segun antiguedad", async () => {
    const ahora = Date.now();
    f.estado = {
      publicarPendiente: true,
      ultimaPublicacion: new Date(ahora - 3600_000).toISOString(),
      ultimaExportacion: new Date(ahora - 4 * 86400_000).toISOString(),
      ultimaSincronizacionMedios: new Date(ahora - 30 * 86400_000).toISOString(),
      ultimaCopia: null,
    };
    render(<Inicio usuario={usuario} papel="editor" />);
    expect(await screen.findByRole("button", { name: /Publicar cambios\s*\(hay cambios\)/ })).toBeInTheDocument();
    expect(document.querySelectorAll(".luz-verde").length).toBe(1);
    expect(document.querySelectorAll(".luz-amarillo").length).toBe(1);
    expect(document.querySelectorAll(".luz-rojo").length).toBe(1);
    expect(document.querySelectorAll(".luz-gris").length).toBe(1);
  });
});

describe("Inicio sin acceso al estado", () => {
  it("si la lectura falla: gris con 'No se puede consultar'", async () => {
    f.fallo = true;
    render(<Inicio usuario={usuario} papel="admin" />);
    expect(await screen.findByText("No se puede consultar")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay datos")).toBeNull();
    f.fallo = false;
  });
});
