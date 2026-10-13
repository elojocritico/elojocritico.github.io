import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const d = vi.hoisted(() => ({
  listarArticulos: vi.fn(), despublicar: vi.fn(), enviarAPapelera: vi.fn(), moverSeccion: vi.fn(), restaurar: vi.fn(), borrarDefinitivamente: vi.fn(),
}));
vi.mock("../firebase", () => ({ auth: {}, db: { falso: true }, configurado: true }));
vi.mock("../datos/articulos", async () => ({
  ...(await vi.importActual<object>("../datos/articulos")),
  ...d,
}));
vi.mock("../ruta", () => ({ irA: vi.fn() }));

import { Articulos } from "./Articulos";
import { irA } from "../ruta";

const BD = { falso: true };
const usuario = { email: "ana@x.es" } as never;
const res = (id: string, extra = {}) => ({
  id, slug: "slug-" + id, titulo: "Título " + id, estado: "publicado", secciones: ["historia"],
  actualizadoEn: "2024-05-01T10:00:00.000Z", actualizadoPor: "ana@x.es", fechaPublicacion: "", enPapeleraDesde: null, ...extra,
});
const pagina = (articulos: unknown[], extra = {}) => ({ articulos, cursor: null, hayMas: false, modo: "normal", truncado: false, ...extra });

beforeEach(() => {
  Object.values(d).forEach((f) => f.mockReset());
  d.listarArticulos.mockResolvedValue(pagina([res("a"), res("b", { estado: "borrador" }), res("c", { estado: "programado" })]));
  for (const k of ["despublicar", "enviarAPapelera", "moverSeccion", "restaurar", "borrarDefinitivamente"] as const) d[k].mockResolvedValue(undefined);
  vi.mocked(irA).mockClear();
});

const fila = (titulo: string) => screen.getByRole("heading", { name: titulo }).closest("li")!;

describe("Articulos", () => {
  it("muestra estados en lenguaje llano y las acciones que corresponden a cada uno", async () => {
    render(<Articulos usuario={usuario} papel="editor" />);
    expect(await screen.findByRole("heading", { name: "Título a" })).toBeInTheDocument();
    const a = within(fila("Título a"));
    expect(a.getByText("Publicado")).toBeInTheDocument();
    expect(a.getByRole("link", { name: "Ver en la web" })).toHaveAttribute("href", "/slug-a/");
    expect(a.getByRole("link", { name: "Ver en la web" })).toHaveAttribute("target", "_blank");
    expect(a.getByRole("button", { name: "Despublicar" })).toBeInTheDocument();
    const b = within(fila("Título b"));
    expect(b.getByText("Borrador")).toBeInTheDocument();
    expect(b.queryByRole("link", { name: "Ver en la web" })).toBeNull();
    expect(b.queryByRole("button", { name: "Despublicar" })).toBeNull();
    expect(within(fila("Título c")).getByText("Programado")).toBeInTheDocument();
    expect(within(fila("Título c")).queryByRole("link", { name: "Ver en la web" })).toBeNull();
    await userEvent.click(a.getByRole("button", { name: "Editar" }));
    expect(irA).toHaveBeenCalledWith("editar/a");
  });

  it("quien hizo el cambio: correo, o en llano si lo hizo un programa (nunca «migración»)", async () => {
    d.listarArticulos.mockResolvedValue(pagina([
      res("a"), res("m", { actualizadoPor: "migración" }), res("p", { actualizadoPor: "publicación programada" }),
    ]));
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    expect(within(fila("Título a")).getByText(/por ana@x.es/)).toBeInTheDocument();
    const m = within(fila("Título m"));
    expect(m.getByText(/Importado de la web antigua/)).toBeInTheDocument();
    expect(m.queryByText(/migración/)).toBeNull();
    expect(m.queryByText(/ por /)).toBeNull();
    const p = within(fila("Título p"));
    expect(p.getByText(/Publicación programada/)).toBeInTheDocument();
    expect(p.queryByText(/ por /)).toBeNull();
  });

  it("cambiar el estado o la seccion o buscar aplica la consulta con esos filtros", async () => {
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    expect(d.listarArticulos).toHaveBeenLastCalledWith(BD, { estado: "todos", seccion: "", texto: "", conFotosPendientes: false });
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "borrador");
    await waitFor(() => expect(d.listarArticulos).toHaveBeenLastCalledWith(BD, { estado: "borrador", seccion: "", texto: "", conFotosPendientes: false }));
    await userEvent.selectOptions(screen.getByLabelText("Sección"), "historia");
    await waitFor(() => expect(d.listarArticulos).toHaveBeenLastCalledWith(BD, { estado: "borrador", seccion: "historia", texto: "", conFotosPendientes: false }));
    await userEvent.type(screen.getByLabelText("Buscar por título"), "Roswell{Enter}");
    await waitFor(() => expect(d.listarArticulos).toHaveBeenLastCalledWith(BD, { estado: "borrador", seccion: "historia", texto: "Roswell", conFotosPendientes: false }));
  });

  it("«Con fotos pendientes» filtra la lista y cada artículo dice cuántas fotos le faltan", async () => {
    d.listarArticulos.mockResolvedValue(pagina([res("a", { fotosPendientes: 3 }), res("b", { fotosPendientes: 1 }), res("c", { fotosPendientes: 0 })]));
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    expect(within(fila("Título a")).getByText("Faltan 3 fotos")).toBeInTheDocument();
    expect(within(fila("Título b")).getByText("Falta 1 foto")).toBeInTheDocument();
    expect(within(fila("Título c")).queryByText(/Falta/)).toBeNull();
    await userEvent.click(screen.getByLabelText("Con fotos pendientes"));
    await waitFor(() => expect(d.listarArticulos).toHaveBeenLastCalledWith(BD, { estado: "todos", seccion: "", texto: "", conFotosPendientes: true }));
  });

  it("busqueda simple: avisa de que hay que escribir el principio del titulo", async () => {
    d.listarArticulos.mockResolvedValue(pagina([res("a")], { modo: "prefijo" }));
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    expect(screen.queryByText(/Búsqueda simple/)).toBeNull();
    await userEvent.type(screen.getByLabelText("Buscar por título"), "Tít{Enter}");
    expect(await screen.findByText(/Búsqueda simple: escribe el principio del título/)).toBeInTheDocument();
  });

  it("Más antiguos pide la pagina siguiente con el cursor y la añade", async () => {
    const cursor = { tipo: "resto", resto: [] };
    d.listarArticulos.mockResolvedValueOnce(pagina([res("a")], { cursor, hayMas: true }));
    d.listarArticulos.mockResolvedValueOnce(pagina([res("z")]));
    render(<Articulos usuario={usuario} papel="editor" />);
    await userEvent.click(await screen.findByRole("button", { name: "Más antiguos →" }));
    expect(await screen.findByRole("heading", { name: "Título z" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Título a" })).toBeInTheDocument();
    expect(d.listarArticulos).toHaveBeenLastCalledWith(BD, expect.anything(), cursor);
    expect(screen.queryByRole("button", { name: "Más antiguos →" })).toBeNull();
  });

  it("enviar a la papelera pide confirmacion y no hace nada si se cancela", async () => {
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    await userEvent.click(within(fila("Título a")).getByRole("button", { name: "Enviar a la papelera" }));
    expect(screen.getByRole("alertdialog", { name: "¿Enviar a la papelera?" })).toBeInTheDocument();
    expect(d.enviarAPapelera).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "No, cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(d.enviarAPapelera).not.toHaveBeenCalled();

    await userEvent.click(within(fila("Título a")).getByRole("button", { name: "Enviar a la papelera" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, enviar a la papelera" }));
    expect(d.enviarAPapelera).toHaveBeenCalledWith(BD, "a", "ana@x.es");
    expect(await screen.findByText(/está en la papelera/)).toBeInTheDocument();
    await waitFor(() => expect(d.listarArticulos).toHaveBeenCalledTimes(2)); // se vuelve a pedir la lista
  });

  it("un doble clic en confirmar lanza la acción una sola vez y el botón queda desactivado mientras tanto", async () => {
    let acabar!: () => void;
    d.enviarAPapelera.mockReturnValue(new Promise<void>((ok) => (acabar = ok)));
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    await userEvent.click(within(fila("Título a")).getByRole("button", { name: "Enviar a la papelera" }));
    const si = screen.getByRole("button", { name: "Sí, enviar a la papelera" });
    await userEvent.dblClick(si);
    expect(d.enviarAPapelera).toHaveBeenCalledTimes(1);
    expect(si).toBeDisabled();
    acabar();
    expect(await screen.findByText(/está en la papelera/)).toBeInTheDocument();
    expect(d.enviarAPapelera).toHaveBeenCalledTimes(1);
  });

  it("un doble clic en Restaurar tampoco lo repite", async () => {
    d.listarArticulos.mockResolvedValue(pagina([res("p", { estado: "papelera" })]));
    let acabar!: () => void;
    d.restaurar.mockReturnValue(new Promise<void>((ok) => (acabar = ok)));
    render(<Articulos usuario={usuario} papel="editor" />);
    await userEvent.selectOptions(await screen.findByLabelText("Estado"), "papelera");
    await userEvent.dblClick(await screen.findByRole("button", { name: "Restaurar" }));
    expect(d.restaurar).toHaveBeenCalledTimes(1);
    acabar();
    await screen.findByText(/se ha recuperado/);
  });

  it("despublicar pide confirmacion", async () => {
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    await userEvent.click(within(fila("Título a")).getByRole("button", { name: "Despublicar" }));
    expect(d.despublicar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, despublicar" }));
    expect(d.despublicar).toHaveBeenCalledWith(BD, "a", "ana@x.es");
  });

  it("mover a otra seccion usa la seccion elegida", async () => {
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    await userEvent.click(within(fila("Título a")).getByRole("button", { name: "Mover a otra sección" }));
    const dialogo = screen.getByRole("alertdialog");
    await userEvent.selectOptions(within(dialogo).getByLabelText("Sección"), "fraudes");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Mover" }));
    expect(d.moverSeccion).toHaveBeenCalledWith(BD, "a", "ana@x.es", "fraudes");
  });

  it("papelera: Restaurar directo; Borrar definitivamente solo para admin y con confirmacion", async () => {
    d.listarArticulos.mockResolvedValue(pagina([res("p", { estado: "papelera" })]));
    const { unmount } = render(<Articulos usuario={usuario} papel="editor" />);
    await userEvent.selectOptions(await screen.findByLabelText("Estado"), "papelera");
    await screen.findByRole("heading", { name: "Título p" });
    expect(screen.queryByRole("button", { name: "Borrar definitivamente" })).toBeNull();
    expect(screen.getByText(/30 días en la papelera se borran solos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(d.restaurar).toHaveBeenCalledWith(BD, "p", "ana@x.es");
    unmount();

    render(<Articulos usuario={usuario} papel="admin" />);
    await userEvent.selectOptions(await screen.findByLabelText("Estado"), "papelera");
    await userEvent.click(await screen.findByRole("button", { name: "Borrar definitivamente" }));
    expect(screen.getByRole("alertdialog", { name: "¿Borrar para siempre?" })).toBeInTheDocument();
    expect(d.borrarDefinitivamente).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, borrar para siempre" }));
    expect(d.borrarDefinitivamente).toHaveBeenCalledWith(BD, "p", "admin", "ana@x.es");
    expect(await screen.findByText(/borrado para siempre/)).toBeInTheDocument();
  });

  it("si una accion falla sin conexion lo dice y no da el cambio por hecho", async () => {
    d.enviarAPapelera.mockRejectedValue({ code: "unavailable" });
    render(<Articulos usuario={usuario} papel="editor" />);
    await screen.findByRole("heading", { name: "Título a" });
    await userEvent.click(within(fila("Título a")).getByRole("button", { name: "Enviar a la papelera" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, enviar a la papelera" }));
    expect(await screen.findByText("No hay conexión con el servidor; tus cambios no se han guardado.")).toBeInTheDocument();
    expect(screen.queryByText(/está en la papelera\./)).toBeNull();
    expect(d.listarArticulos).toHaveBeenCalledTimes(1);
  });

  it("si la lista no carga, lo explica; lista vacia con mensaje", async () => {
    d.listarArticulos.mockRejectedValueOnce({ code: "unavailable" });
    const { unmount } = render(<Articulos usuario={usuario} papel="editor" />);
    expect(await screen.findByText(/No hay conexión con el servidor/)).toBeInTheDocument();
    unmount();
    d.listarArticulos.mockResolvedValue(pagina([]));
    render(<Articulos usuario={usuario} papel="editor" />);
    expect(await screen.findByText("No hay artículos con estos filtros.")).toBeInTheDocument();
  });
});
