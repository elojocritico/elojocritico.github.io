import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const d = vi.hoisted(() => ({ leerAjustes: vi.fn(), guardarAjustes: vi.fn(), listarArticulos: vi.fn(), titulosDe: vi.fn() }));
vi.mock("../firebase", () => ({ auth: {}, db: { falso: true }, configurado: true }));
vi.mock("../datos/ajustes", async () => ({ ...(await vi.importActual<object>("../datos/ajustes")), leerAjustes: d.leerAjustes, guardarAjustes: d.guardarAjustes }));
vi.mock("../datos/articulos", async () => ({ ...(await vi.importActual<object>("../datos/articulos")), listarArticulos: d.listarArticulos }));
vi.mock("../datos/comentarios", async () => ({ ...(await vi.importActual<object>("../datos/comentarios")), titulosDe: d.titulosDe }));
vi.mock("../ruta", async () => ({ ...(await vi.importActual<object>("../ruta")), irA: vi.fn() }));
vi.mock("../componentes/EditorTexto", () => ({
  EditorTexto: ({ inicial, alCambiar }: { inicial: string; alCambiar: (h: string) => void }) => (
    <textarea aria-label="Texto de Qué es EOC" defaultValue={inicial} onChange={(e) => alCambiar(e.target.value)} />
  ),
}));

import { Ajustes } from "./Ajustes";
import { ErrorAjustes } from "../datos/ajustes";

const BD = { falso: true };
const usuario = { email: "ana@x.es" } as never;
const base = (extra = {}) => ({
  destacado: null,
  enlaces: [{ nombre: "Uno", url: "https://uno.es" }, { nombre: "Dos", url: "http://dos.es" }],
  queEsEoc: { titulo: "Qué es", cuerpoHtml: "<p>hola</p>" },
  adsense: { activo: false, cliente: "", bloque: "" },
  usuarios: { "ana@x.es": "admin" }, version: "v1", ...extra,
});

beforeEach(() => {
  Object.values(d).forEach((f) => f.mockReset());
  d.leerAjustes.mockResolvedValue(base());
  d.guardarAjustes.mockResolvedValue("v2");
  d.titulosDe.mockResolvedValue({ "mi-art": "Mi artículo" });
  d.listarArticulos.mockResolvedValue({
    articulos: [{ id: "x", slug: "mi-art", titulo: "Mi artículo", estado: "publicado", secciones: [] }], cursor: null, hayMas: false, modo: "indice", truncado: false,
  });
});

const seccion = (nombre: string) => screen.getByRole("heading", { name: nombre }).closest("section")!;

describe("Ajustes", () => {
  it("un editor que llega por la dirección solo ve el aviso y no se lee nada", () => {
    render(<Ajustes usuario={usuario} papel="editor" />);
    expect(screen.getByText("Esta sección es solo para administradores.")).toBeInTheDocument();
    expect(d.leerAjustes).not.toHaveBeenCalled();
  });

  it("destacado: busca por título, elige y guarda; «el más reciente» guarda null", async () => {
    render(<Ajustes usuario={usuario} papel="admin" />);
    const s = await screen.findByRole("heading", { name: "Artículo destacado" }).then(() => seccion("Artículo destacado"));
    expect(within(s).getByText(/El más reciente/)).toBeInTheDocument();
    await userEvent.click(within(s).getByRole("button", { name: "Elegir otro artículo" }));
    await userEvent.type(within(s).getByLabelText("Busca por el título"), "mi art");
    await userEvent.click(within(s).getByRole("button", { name: "Buscar" }));
    expect(d.listarArticulos).toHaveBeenCalledWith(BD, { estado: "publicado", texto: "mi art" });
    await userEvent.click(await within(s).findByRole("button", { name: "Elegir «Mi artículo»" }));
    await userEvent.click(within(s).getByRole("button", { name: "Guardar el destacado" }));
    await waitFor(() => expect(d.guardarAjustes).toHaveBeenCalledWith(BD, "ana@x.es", "v1", { destacado: "mi-art" }));
    expect(await screen.findByText(/Guardado\. Se verá en la web cuando pulses/)).toBeInTheDocument();

    await userEvent.click(within(s).getByRole("button", { name: "Usar siempre el más reciente" }));
    await userEvent.click(within(s).getByRole("button", { name: "Guardar el destacado" }));
    await waitFor(() => expect(d.guardarAjustes).toHaveBeenLastCalledWith(BD, "ana@x.es", "v2", { destacado: null }));
  });

  it("enlaces: reordena, añade, quita y guarda en el nuevo orden", async () => {
    render(<Ajustes usuario={usuario} papel="admin" />);
    const s = await screen.findByLabelText("Nombre del enlace 1").then(() => seccion("Enlaces afines"));
    await userEvent.click(within(s).getByRole("button", { name: "Bajar el enlace 1" }));
    expect(within(s).getByLabelText("Nombre del enlace 1")).toHaveValue("Dos");
    await userEvent.click(within(s).getByRole("button", { name: "Añadir un enlace" }));
    await userEvent.type(within(s).getByLabelText("Nombre del enlace 3"), "Tres");
    await userEvent.clear(within(s).getByLabelText("Dirección del enlace 3"));
    await userEvent.type(within(s).getByLabelText("Dirección del enlace 3"), "https://tres.es");
    await userEvent.click(within(s).getByRole("button", { name: "Quitar el enlace 2" }));
    await userEvent.click(within(s).getByRole("button", { name: "Guardar los enlaces" }));
    await waitFor(() =>
      expect(d.guardarAjustes).toHaveBeenCalledWith(BD, "ana@x.es", "v1", {
        enlaces: [{ nombre: "Dos", url: "http://dos.es" }, { nombre: "Tres", url: "https://tres.es" }],
      }),
    );
  });

  it("enlaces: no guarda direcciones que no sean http(s) ni nombres vacíos", async () => {
    render(<Ajustes usuario={usuario} papel="admin" />);
    const s = await screen.findByLabelText("Nombre del enlace 1").then(() => seccion("Enlaces afines"));
    const url = within(s).getByLabelText("Dirección del enlace 1");
    await userEvent.clear(url);
    await userEvent.type(url, "javascript:alert(1)");
    await userEvent.click(within(s).getByRole("button", { name: "Guardar los enlaces" }));
    expect(await within(s).findByRole("alert")).toHaveTextContent(/dirección válida/);
    await userEvent.clear(url);
    await userEvent.type(url, "https://ok.es");
    await userEvent.clear(within(s).getByLabelText("Nombre del enlace 1"));
    await userEvent.click(within(s).getByRole("button", { name: "Guardar los enlaces" }));
    expect(await within(s).findByRole("alert")).toHaveTextContent(/no tiene nombre/);
    expect(d.guardarAjustes).not.toHaveBeenCalled();
  });

  it("enlaces: no deja pasar de 20", async () => {
    d.leerAjustes.mockResolvedValue(base({ enlaces: Array.from({ length: 20 }, (_, i) => ({ nombre: "E" + i, url: "https://e.es/" + i })) }));
    render(<Ajustes usuario={usuario} papel="admin" />);
    const s = await screen.findByLabelText("Nombre del enlace 20").then(() => seccion("Enlaces afines"));
    expect(within(s).getByRole("button", { name: "Añadir un enlace" })).toBeDisabled();
  });

  it("Qué es EOC: guarda título y cuerpo", async () => {
    render(<Ajustes usuario={usuario} papel="admin" />);
    const s = await screen.findByLabelText("Texto de Qué es EOC").then(() => seccion("Qué es EOC"));
    await userEvent.clear(within(s).getByLabelText("Título de la página"));
    await userEvent.type(within(s).getByLabelText("Título de la página"), "Nuevo");
    await userEvent.click(within(s).getByRole("button", { name: "Guardar «Qué es EOC»" }));
    await waitFor(() =>
      expect(d.guardarAjustes).toHaveBeenCalledWith(BD, "ana@x.es", "v1", { queEsEoc: { titulo: "Nuevo", cuerpoHtml: "<p>hola</p>" } }),
    );
  });

  it("publicidad: valida el código de cuenta y el de bloque y luego guarda", async () => {
    render(<Ajustes usuario={usuario} papel="admin" />);
    const s = await screen.findByLabelText("Código de cuenta").then(() => seccion("Publicidad"));
    await userEvent.click(within(s).getByLabelText("Mostrar publicidad en la web"));
    await userEvent.click(within(s).getByRole("button", { name: "Guardar la publicidad" }));
    expect(await within(s).findByRole("alert")).toHaveTextContent(/rellenar/);
    await userEvent.type(within(s).getByLabelText("Código de cuenta"), "ca-pub-123");
    await userEvent.type(within(s).getByLabelText("Código de bloque"), "1234567890");
    await userEvent.click(within(s).getByRole("button", { name: "Guardar la publicidad" }));
    expect(await within(s).findByRole("alert")).toHaveTextContent(/ca-pub-/);
    expect(d.guardarAjustes).not.toHaveBeenCalled();
    await userEvent.clear(within(s).getByLabelText("Código de cuenta"));
    await userEvent.type(within(s).getByLabelText("Código de cuenta"), "ca-pub-1234567890123456");
    await userEvent.click(within(s).getByRole("button", { name: "Guardar la publicidad" }));
    await waitFor(() =>
      expect(d.guardarAjustes).toHaveBeenCalledWith(BD, "ana@x.es", "v1", { adsense: { activo: true, cliente: "ca-pub-1234567890123456", bloque: "1234567890" } }),
    );
  });

  it("si otra persona ha guardado antes, avisa en llano y ofrece recargar", async () => {
    d.guardarAjustes.mockRejectedValue(new ErrorAjustes("ajustes/conflicto"));
    render(<Ajustes usuario={usuario} papel="admin" />);
    const s = await screen.findByLabelText("Código de cuenta").then(() => seccion("Publicidad"));
    await userEvent.click(within(s).getByLabelText("Mostrar publicidad en la web"));
    await userEvent.type(within(s).getByLabelText("Código de cuenta"), "ca-pub-1234567890123456");
    await userEvent.type(within(s).getByLabelText("Código de bloque"), "1234567890");
    await userEvent.click(within(s).getByRole("button", { name: "Guardar la publicidad" }));
    expect(await screen.findByText(/Otra persona ha cambiado los ajustes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recargar la página" })).toBeInTheDocument();
  });

  it("si no hay conexión no dice que se ha guardado", async () => {
    d.guardarAjustes.mockRejectedValue({ code: "unavailable" });
    render(<Ajustes usuario={usuario} papel="admin" />);
    const s = await screen.findByLabelText("Código de cuenta").then(() => seccion("Publicidad"));
    await userEvent.click(within(s).getByLabelText("Mostrar publicidad en la web"));
    await userEvent.type(within(s).getByLabelText("Código de cuenta"), "ca-pub-1234567890123456");
    await userEvent.type(within(s).getByLabelText("Código de bloque"), "1234567890");
    await userEvent.click(within(s).getByRole("button", { name: "Guardar la publicidad" }));
    expect(await screen.findByText(/tus cambios no se han guardado/)).toBeInTheDocument();
    expect(screen.queryByText(/^Guardado/)).toBeNull();
  });
});
