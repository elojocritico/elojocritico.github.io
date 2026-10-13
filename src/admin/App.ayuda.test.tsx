// Cada pantalla tiene su botón «?» y lleva a la parte correcta del manual.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const s = vi.hoisted(() => ({
  valor: { usuario: null, papel: null, cargando: false, error: null } as Record<string, unknown>,
}));
vi.mock("./firebase", () => ({ auth: {}, db: {}, configurado: true }));
vi.mock("./sesion", () => ({ usarSesion: () => s.valor }));
vi.mock("firebase/auth", () => ({ signInWithEmailAndPassword: vi.fn(), sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), signOut: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: () => ({}), collection: () => ({}), query: () => ({}), where: () => ({}), orderBy: () => ({}), limit: () => ({}),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  getDocs: async () => ({ docs: [], size: 0 }),
  getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
  onSnapshot: (_q: unknown, ok: (x: { size: number }) => void) => (ok({ size: 0 }), () => {}),
}));
vi.mock("./datos/ajustes", async (original) => ({
  ...(await original<typeof import("./datos/ajustes")>()),
  leerAjustes: async () => ({
    version: "v1", destacado: null, enlaces: [], queEsEoc: { titulo: "", cuerpoHtml: "" },
    adsense: { activo: false, cliente: "", bloque: "" }, usuarios: { "ana@x.es": "admin" },
  }),
}));
vi.mock("./datos/articulos", async (original) => ({
  ...(await original<typeof import("./datos/articulos")>()),
  listarArticulos: async () => ({ articulos: [], cursor: null, modo: "normal", truncado: false }),
}));

vi.mock("./datos/guardar", async (original) => {
  const o = await original<typeof import("./datos/guardar")>();
  return {
    ...o,
    cargarArticulo: async (_db: unknown, id: string) => ({
      ...o.CAMPOS_VACIOS, titulo: "Un artículo", slug: id, estado: "borrador", fechaPublicacion: "", creadoEn: "2026-01-01T00:00:00.000Z",
      actualizadoEn: "2026-01-01T00:00:00.000Z", actualizadoPor: "ana@x.es", enPapeleraDesde: null,
    }),
  };
});

import App from "./App";
import { MANUAL, AYUDA_DE } from "./pantallas/Ayuda";

const usuario = { email: "ana@x.es", getIdToken: async () => "t" };

const PANTALLAS: [string, string, string][] = [
  // [nombre, hash de la pantalla, sección que debe abrir su «?»]
  ["Inicio", "", "el-semaforo"],
  ["Mis artículos", "#/articulos", "editar-y-deshacer"],
  ["Escribir artículo", "#/nuevo", "escribir-y-publicar"],
  ["Editar artículo", "#/editar/abc", "escribir-y-publicar"],
  ["Comentarios", "#/comentarios", "comentarios"],
  ["Ajustes", "#/ajustes", "ajustes"],
  ["Usuarios", "#/usuarios", "dar-acceso"],
  ["Publicar cambios", "#/publicar", "publicar-cambios"],
];

describe("botón «?» de cada pantalla", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  for (const [nombre, hash, seccion] of PANTALLAS) {
    it(`${nombre}: tiene «Ayuda sobre esta pantalla» y abre #/ayuda/${seccion}`, async () => {
      s.valor = { usuario, papel: "admin", cargando: false, error: null };
      window.location.hash = hash;
      render(<App />);
      const boton = await screen.findByRole("button", { name: "Ayuda sobre esta pantalla" });
      expect(boton).toHaveTextContent("?");
      await userEvent.setup().click(boton);
      await waitFor(() => expect(window.location.hash).toBe("#/ayuda/" + seccion));
      // Y se ve esa parte del manual.
      const titulo = MANUAL.secciones.find((x) => x.id === seccion)!.titulo;
      expect(await screen.findByRole("heading", { level: 1, name: titulo })).toBeInTheDocument();
    });
  }

  it("Entrar (sin sesión): tiene su «?» y se puede leer la ayuda sin haber entrado", async () => {
    s.valor = { usuario: null, papel: null, cargando: false, error: null };
    render(<App />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Ayuda sobre esta pantalla" }));
    await waitFor(() => expect(window.location.hash).toBe("#/ayuda/entrar"));
    expect(await screen.findByRole("heading", { level: 1, name: "Entrar" })).toBeInTheDocument();
  });

  it("el inicio tiene la entrada «Ayuda» del menú, también para editores", async () => {
    s.valor = { usuario, papel: "editor", cargando: false, error: null };
    window.location.hash = "";
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Ayuda" }));
    await waitFor(() => expect(window.location.hash).toBe("#/ayuda"));
    expect(await screen.findByRole("heading", { level: 1, name: "Ayuda" })).toBeInTheDocument();
  });

  it("todas las secciones de AYUDA_DE existen en el manual", () => {
    for (const id of Object.values(AYUDA_DE)) expect(MANUAL.secciones.map((x) => x.id)).toContain(id);
  });
});

describe("pantalla de Ayuda", () => {
  it("#/ayuda enseña el índice y todas las secciones; el índice enlaza a cada una", async () => {
    s.valor = { usuario, papel: "editor", cargando: false, error: null };
    window.location.hash = "#/ayuda";
    render(<App />);
    const indice = await screen.findByRole("navigation", { name: "Índice del manual" });
    expect(within(indice).getAllByRole("link")).toHaveLength(MANUAL.secciones.length);
    expect(within(indice).getByRole("link", { name: "Papelera" })).toHaveAttribute("href", "#/ayuda/papelera");
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(MANUAL.secciones.length);
  });

  it("una sección que no existe muestra todo el manual con un aviso", async () => {
    window.location.hash = "#/ayuda/no-existe";
    render(<App />);
    expect(await screen.findByText(/No se ha encontrado esa parte del manual/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Índice del manual" })).toBeInTheDocument();
  });

  it("una sección sola ofrece 'Ver todo el manual'", async () => {
    window.location.hash = "#/ayuda/papelera";
    render(<App />);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Ver todo el manual" }));
    await waitFor(() => expect(window.location.hash).toBe("#/ayuda"));
    expect(await screen.findByRole("navigation", { name: "Índice del manual" })).toBeInTheDocument();
  });
});
