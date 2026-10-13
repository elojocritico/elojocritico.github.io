// El aviso de «cambios sin guardar» al cambiar de pantalla, probado con la aplicación entera (router incluido).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const g = vi.hoisted(() => ({ listarArticulos: vi.fn(), existeDireccion: vi.fn(), guardarArticulo: vi.fn() }));
vi.mock("./firebase", () => ({ auth: {}, db: { falso: true }, configurado: true }));
vi.mock("./sesion", () => ({ usarSesion: () => ({ usuario: { email: "ana@x.es" }, papel: "editor", cargando: false, error: null }) }));
vi.mock("./datos/articulos", async () => ({ ...(await vi.importActual<object>("./datos/articulos")), listarArticulos: g.listarArticulos }));
vi.mock("./datos/guardar", async () => ({ ...(await vi.importActual<object>("./datos/guardar")), existeDireccion: g.existeDireccion, guardarArticulo: g.guardarArticulo }));
vi.mock("./componentes/EditorTexto", () => ({
  EditorTexto: ({ inicial, alCambiar }: { inicial: string; alCambiar: (h: string) => void }) => (
    <textarea aria-label="Texto del artículo" defaultValue={inicial} onChange={(e) => alCambiar(e.target.value)} />
  ),
}));

import App from "./App";

const irAlHash = async (hash: string) => {
  window.location.hash = hash;
  await new Promise((r) => setTimeout(r, 20)); // jsdom lanza hashchange de forma asíncrona
};

beforeEach(() => {
  g.listarArticulos.mockResolvedValue({ articulos: [], cursor: null, hayMas: false, modo: "normal", truncado: false });
  g.existeDireccion.mockResolvedValue(false);
  window.location.hash = "#/nuevo";
});
afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "";
});

describe("App: salir del editor con cambios sin guardar", () => {
  it("no cambia de pantalla ni pierde lo escrito, restaura la dirección sin añadir historial y pregunta", async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText(/^Título/), "Mi borrador");
    const reemplazo = vi.spyOn(window.history, "replaceState");
    const antes = window.history.length;

    await irAlHash("#/articulos"); // equivale a pulsar «atrás» o un enlace del menú
    const dialogo = await screen.findByRole("alertdialog", { name: "Tienes cambios sin guardar" });
    expect(screen.getByLabelText(/^Título/)).toHaveValue("Mi borrador");
    expect(screen.queryByRole("heading", { name: "Mis artículos" })).toBeNull();
    expect(window.location.hash).toBe("#/nuevo");
    expect(reemplazo.mock.calls.some((c) => String(c[2]).endsWith("#/nuevo"))).toBe(true);
    expect(window.history.length).toBe(antes + 1); // solo la entrada de la navegación simulada; la restauración no añade ninguna
    expect(within(dialogo).getByRole("button", { name: "Seguir editando" })).toHaveFocus();

    // «Atrás» repetido: sigue sin añadir entradas ni salir
    await userEvent.click(within(dialogo).getByRole("button", { name: "Seguir editando" }));
    const largo = window.history.length;
    await irAlHash("#/articulos");
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(window.history.length).toBe(largo + 1);
    expect(window.location.hash).toBe("#/nuevo");
    expect(screen.getByLabelText(/^Título/)).toHaveValue("Mi borrador");
  });

  it("«Seguir editando» se queda con todo intacto", async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText(/^Título/), "Algo");
    await irAlHash("#/");
    await userEvent.click(await screen.findByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText(/^Título/)).toHaveValue("Algo");
  });

  it("«Salir sin guardar» navega a donde se quería ir", async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText(/^Título/), "Algo");
    await irAlHash("#/articulos");
    await userEvent.click(await screen.findByRole("button", { name: "Salir sin guardar" }));
    expect(await screen.findByRole("heading", { name: "Mis artículos" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/articulos");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("sin cambios se navega sin preguntar", async () => {
    render(<App />);
    await screen.findByLabelText(/^Título/);
    await irAlHash("#/articulos");
    expect(await screen.findByRole("heading", { name: "Mis artículos" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("después de guardar ya no pregunta", async () => {
    g.guardarArticulo.mockResolvedValue({ actualizadoEn: "2026-01-01T10:00:00.000Z" });
    render(<App />);
    await userEvent.type(await screen.findByLabelText(/^Título/), "Guardado");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await screen.findByText("Borrador guardado.");
    await irAlHash("#/articulos");
    expect(await screen.findByRole("heading", { name: "Mis artículos" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
