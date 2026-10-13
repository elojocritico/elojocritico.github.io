import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const d = vi.hoisted(() => ({
  listarPendientes: vi.fn(), moderar: vi.fn(), titulosDe: vi.fn(), leerOcultos: vi.fn(), cambiarOculto: vi.fn(), cargarArchivo: vi.fn(), listarArticulos: vi.fn(),
}));
vi.mock("../firebase", () => ({ auth: {}, db: { falso: true }, configurado: true }));
vi.mock("../datos/comentarios", async () => ({
  ...(await vi.importActual<object>("../datos/comentarios")),
  listarPendientes: d.listarPendientes, moderar: d.moderar, titulosDe: d.titulosDe,
  leerOcultos: d.leerOcultos, cambiarOculto: d.cambiarOculto, cargarArchivo: d.cargarArchivo,
}));
vi.mock("../datos/articulos", async () => ({ ...(await vi.importActual<object>("../datos/articulos")), listarArticulos: d.listarArticulos }));
vi.mock("../ruta", () => ({ irA: vi.fn() }));

import { Comentarios } from "./Comentarios";

const BD = { falso: true };
const pend = (id: string, extra = {}) => ({ id, articuloSlug: "mi-art", nombre: "Lector " + id, correo: id + "@x.es", texto: "Texto " + id, creadoEn: "2024-05-01T10:00:00.000Z", ...extra });
const usuario = { email: "ana@x.es" } as never;

beforeEach(() => {
  Object.values(d).forEach((f) => f.mockReset());
  d.listarPendientes.mockResolvedValue({ comentarios: [pend("a"), pend("b", { texto: "<script>alert(1)</script>" })], cursor: null, hayMas: false });
  d.titulosDe.mockResolvedValue({ "mi-art": "Mi artículo" });
  d.moderar.mockResolvedValue(undefined);
  d.leerOcultos.mockResolvedValue(["2"]);
  d.cambiarOculto.mockImplementation(async (_b: unknown, _s: string, id: string, ocultar: boolean) => (ocultar ? ["2", id] : []));
  d.cargarArchivo.mockResolvedValue([
    { id: "1", autor: "Pepe", fecha: "2014-12-30T20:41", html: "<p>Hola <b>mundo</b></p>", respuestaA: null },
    { id: "2", autor: "", fecha: "2014-12-31T10:00", html: "", respuestaA: "1", oculto: true },
  ]);
  d.listarArticulos.mockResolvedValue({ articulos: [{ id: "x", slug: "mi-art", titulo: "Mi artículo", estado: "publicado", secciones: [] }], cursor: null, hayMas: false, modo: "indice", truncado: false });
});

const tarjeta = (nombre: string) => screen.getByText(nombre).closest("li")!;

describe("Comentarios: pendientes", () => {
  it("muestra nombre, texto como texto, correo privado y enlace al artículo", async () => {
    render(<Comentarios usuario={usuario} />);
    expect(await screen.findByText("Lector a")).toBeInTheDocument();
    const a = within(tarjeta("Lector a"));
    expect(a.getByText("Texto a")).toBeInTheDocument();
    expect(a.getByText(/a@x\.es/)).toBeInTheDocument();
    expect(a.getAllByRole("link", { name: "Mi artículo" })[0]).toHaveAttribute("href", "/mi-art/");
    // el texto con etiquetas se ve literal, no como HTML
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(d.listarPendientes).toHaveBeenCalledWith(BD, null);
  });

  it.each([["Aprobar", "aprobado"], ["Rechazar", "rechazado"], ["Spam", "spam"]])("%s guarda el estado y quita el comentario de la lista", async (boton, estado) => {
    render(<Comentarios usuario={usuario} />);
    await screen.findByText("Lector a");
    await userEvent.click(within(tarjeta("Lector a")).getByRole("button", { name: boton }));
    await waitFor(() => expect(d.moderar).toHaveBeenCalledWith(BD, "a", estado));
    await waitFor(() => expect(screen.queryByText("Lector a")).toBeNull());
    expect(screen.getByText("Lector b")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("si no se puede guardar, avisa en llano y deja el comentario en la lista", async () => {
    d.moderar.mockRejectedValue({ code: "unavailable" });
    render(<Comentarios usuario={usuario} />);
    await screen.findByText("Lector a");
    await userEvent.click(within(tarjeta("Lector a")).getByRole("button", { name: "Aprobar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No hay conexión con el servidor; tus cambios no se han guardado.");
    expect(screen.getByText("Lector a")).toBeInTheDocument();
  });

  it("sin pendientes lo dice", async () => {
    d.listarPendientes.mockResolvedValue({ comentarios: [], cursor: null, hayMas: false });
    render(<Comentarios usuario={usuario} />);
    expect(await screen.findByText("No hay comentarios por revisar.")).toBeInTheDocument();
  });

  it("«Más» pide la página siguiente con el cursor", async () => {
    const cursor = { c: 1 };
    d.listarPendientes.mockResolvedValueOnce({ comentarios: [pend("a")], cursor, hayMas: true }).mockResolvedValueOnce({ comentarios: [pend("z")], cursor: null, hayMas: false });
    render(<Comentarios usuario={usuario} />);
    await screen.findByText("Lector a");
    await userEvent.click(screen.getByRole("button", { name: "Más →" }));
    expect(await screen.findByText("Lector z")).toBeInTheDocument();
    expect(d.listarPendientes).toHaveBeenLastCalledWith(BD, cursor);
  });
});

describe("Comentarios: archivo", () => {
  async function abrir() {
    render(<Comentarios usuario={usuario} />);
    await screen.findByText("Lector a");
    await userEvent.click(screen.getByRole("tab", { name: "Archivo" }));
    await userEvent.type(screen.getByLabelText("Buscar artículo por título"), "Mi{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Ver sus comentarios del archivo" }));
    await screen.findByText("Pepe");
  }

  it("busca el artículo, carga sus comentarios y marca los ocultos", async () => {
    await abrir();
    expect(d.listarArticulos).toHaveBeenCalledWith(BD, { estado: "todos", texto: "Mi" });
    expect(d.cargarArchivo).toHaveBeenCalledWith("mi-art");
    expect(d.leerOcultos).toHaveBeenCalledWith(BD, "mi-art");
    expect(screen.getByText("Hola mundo")).toBeInTheDocument();
    expect(within(tarjeta("Comentario oculto (nº 2)")).getByText("Oculto")).toBeInTheDocument();
    expect(within(tarjeta("Comentario oculto (nº 2)")).getByRole("button", { name: "Mostrar" })).toBeInTheDocument();
    expect(screen.queryByText("Quico")).toBeNull();
    expect(within(tarjeta("Pepe")).getByRole("button", { name: "Ocultar" })).toBeInTheDocument();
  });

  it("Ocultar y Mostrar guardan el cambio", async () => {
    await abrir();
    await userEvent.click(within(tarjeta("Pepe")).getByRole("button", { name: "Ocultar" }));
    await waitFor(() => expect(d.cambiarOculto).toHaveBeenCalledWith(BD, "mi-art", "1", true));
    expect(await within((await screen.findByText("Comentario oculto (nº 1)")).closest("li")!).findByText("Oculto")).toBeInTheDocument();
    await userEvent.click(within(tarjeta("Comentario oculto (nº 2)")).getByRole("button", { name: "Mostrar" }));
    await waitFor(() => expect(d.cambiarOculto).toHaveBeenLastCalledWith(BD, "mi-art", "2", false));
    const vuelve = (await screen.findByText("Comentario nº 2")).closest("li")!;
    expect(within(vuelve).queryByText("Oculto")).toBeNull();
    expect(within(vuelve).getByText(/Publicar cambios/)).toBeInTheDocument();
    expect(within(vuelve).getByRole("button", { name: "Ocultar" })).toBeInTheDocument();
  });

  it("si el cambio falla, avisa y no cambia lo que se ve", async () => {
    await abrir();
    d.cambiarOculto.mockRejectedValue({ code: "permission-denied" });
    await userEvent.click(within(tarjeta("Pepe")).getByRole("button", { name: "Ocultar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(within(tarjeta("Pepe")).queryByText("Oculto")).toBeNull();
  });
});
