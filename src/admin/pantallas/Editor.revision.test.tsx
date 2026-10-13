// Segunda ronda de pruebas del editor: contenido que no se pierde, tamaño, navegación y conflictos que ya estaban guardados.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const g = vi.hoisted(() => ({
  guardarArticulo: vi.fn(), cargarArticulo: vi.fn(), existeDireccion: vi.fn(), marcarPublicarPendiente: vi.fn(), listarVersiones: vi.fn(),
}));
vi.mock("../firebase", () => ({ auth: {}, db: { falso: true }, configurado: true }));
vi.mock("../datos/guardar", async () => ({ ...(await vi.importActual<object>("../datos/guardar")), ...g }));
vi.mock("../ruta", () => ({ irA: vi.fn() }));
vi.mock("../componentes/EditorTexto", () => ({
  EditorTexto: ({ inicial, alCambiar }: { inicial: string; alCambiar: (h: string) => void }) => (
    <textarea aria-label="Texto del artículo" defaultValue={inicial} onChange={(e) => alCambiar(e.target.value)} />
  ),
}));

vi.mock("../subirImagen", async () => ({
  ...(await vi.importActual<object>("../subirImagen")),
  subirImagen: vi.fn(async () => ({ url: "data:image/jpeg;base64,AAAA", aviso: "Modo de prueba: la foto no se guarda en internet" })),
}));

import { Editor } from "./Editor";
import { irA } from "../ruta";
import { ErrorArticulo } from "../datos/articulos";

const usuario = { email: "ana@x.es" } as never;
const IVOOX = '<iframe allowfullscreen="" height="120" src="https://www.ivoox.com/player_ej_1.html" width="100%"></iframe>';
const existente = (extra = {}) => ({
  slug: "viejo", titulo: "Título viejo", subtitulo: "", cuerpoHtml: `<p>texto</p>${IVOOX}`, extracto: "", portada: null, autor: "Ana",
  secciones: ["historia"], etiquetas: [], estado: "borrador", fechaPublicacion: "2020-01-01T11:00:00.000Z", destacado: false,
  creadoEn: "2020-01-01T11:00:00.000Z", actualizadoEn: "2020-01-02T11:00:00.000Z", actualizadoPor: "bea@x.es", enPapeleraDesde: null, ...extra,
});
const cambiarTexto = (html: string) => fireEvent.change(screen.getByLabelText("Texto del artículo"), { target: { value: html } });

beforeEach(() => {
  Object.values(g).forEach((f) => f.mockReset());
  g.existeDireccion.mockResolvedValue(false);
  g.guardarArticulo.mockResolvedValue({ actualizadoEn: "2026-01-01T10:00:00.000Z" });
  g.marcarPublicarPendiente.mockResolvedValue(undefined);
  g.listarVersiones.mockResolvedValue([]);
  g.cargarArticulo.mockResolvedValue(existente());
  vi.mocked(irA).mockClear();
  window.location.hash = "";
});

describe("Editor: no perder partes del artículo en silencio", () => {
  it("si al guardar se perdería un vídeo, avisa y «Cancelar» es lo que queda a mano", async () => {
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    cambiarTexto("<p>texto cambiado</p>");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Se perdería parte del artículo" });
    expect(within(dialogo).getByText("Al guardar se perderían 1 vídeo o reproductor. ¿Seguro?")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(g.guardarArticulo).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(g.guardarArticulo).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await userEvent.click(await screen.findByRole("button", { name: "Sí, guardar de todas formas" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalledTimes(1));
  });

  it("si no se pierde nada (solo se cambia el texto) guarda sin preguntar", async () => {
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    cambiarTexto(`<p>otro texto</p>${IVOOX}`);
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await screen.findByText("Borrador guardado.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("tras guardar, lo guardado es el nuevo punto de comparación", async () => {
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    cambiarTexto("<p>sin vídeo</p>");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await userEvent.click(await screen.findByRole("button", { name: "Sí, guardar de todas formas" }));
    await screen.findByText("Borrador guardado.");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("Editor: tamaño del artículo y fotos de prueba", () => {
  const grande = "data:image/jpeg;base64," + "A".repeat(1_000_000);

  it("una portada de prueba demasiado grande no se escribe y se nombra la causa; la miniatura de una portada data: va vacía", async () => {
    render(<Editor usuario={usuario} />);
    await userEvent.type(screen.getByLabelText(/^Título/), "Con foto");
    cambiarTexto("<p>texto</p>");
    // portada pequeña: se guarda con tarjeta vacía
    const pequena = "data:image/jpeg;base64,AAAA";
    const entrada = screen.getByTestId("elegir-portada") as HTMLInputElement;
    await userEvent.upload(entrada, new File(["x"], "f.jpg", { type: "image/jpeg" }));
    await screen.findByText("Modo de prueba: la foto no se guarda en internet");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalled());
    expect(g.guardarArticulo.mock.calls[0][1].campos.portada).toMatchObject({ src: pequena, tarjeta: "" });

    // ahora el texto con una foto enorme
    g.guardarArticulo.mockClear();
    cambiarTexto(`<p><img src="${grande}"></p>`);
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(await screen.findByText(/Hay demasiadas fotos pegadas en el texto/)).toBeInTheDocument();
    expect(g.guardarArticulo).not.toHaveBeenCalled();
  });

  it("la vista previa avisa de que las fotos de prueba no se muestran", async () => {
    render(<Editor usuario={usuario} />);
    cambiarTexto('<p><img src="data:image/jpeg;base64,AAAA"></p>');
    await userEvent.click(screen.getByRole("button", { name: "Vista previa" }));
    expect(screen.getByText(/las fotos de prueba no se muestran/)).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Vista previa" }).querySelector("img")).toBeNull();
  });
});

describe("Editor: salir con cambios sin guardar", () => {
  it("al cambiar de pantalla por la dirección del navegador pregunta y vuelve atrás; «Salir sin guardar» continúa", async () => {
    render(<Editor usuario={usuario} />);
    await userEvent.type(screen.getByLabelText(/^Título/), "algo");
    window.location.hash = "#/articulos";
    const dialogo = await screen.findByRole("alertdialog", { name: "Tienes cambios sin guardar" });
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(irA).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Salir sin guardar" }));
    expect(irA).toHaveBeenCalledWith("#/articulos");
  });

  it("«Seguir editando» se queda", async () => {
    render(<Editor usuario={usuario} />);
    await userEvent.type(screen.getByLabelText(/^Título/), "algo");
    window.location.hash = "#/inicio";
    await userEvent.click(await screen.findByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(irA).not.toHaveBeenCalled();
  });

  it("sin cambios no pregunta", async () => {
    render(<Editor usuario={usuario} />);
    window.location.hash = "#/articulos";
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("Editor: conflicto que en realidad ya estaba guardado", () => {
  it("si lo que hay en el servidor lo guardé yo y es lo mismo que intento guardar, no se avisa", async () => {
    g.cargarArticulo.mockResolvedValue(existente({ cuerpoHtml: "<p>texto</p>" }));
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    g.guardarArticulo.mockImplementationOnce(async (_db: unknown, p: { campos: object }) => {
      throw new ErrorArticulo("articulo/conflicto", {
        actual: existente({ ...p.campos, cuerpoHtml: "<p>texto</p>", actualizadoPor: "ana@x.es", actualizadoEn: "2026-02-02T10:00:00.000Z" }),
      });
    });
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(await screen.findByText("Borrador guardado.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // y el siguiente guardado parte del nuevo punto
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalledTimes(2));
    expect(g.guardarArticulo.mock.calls[1][1].cargadoEn).toBe("2026-02-02T10:00:00.000Z");
  });

  it("si lo guardó otra persona, sigue avisando aunque los campos coincidan", async () => {
    g.cargarArticulo.mockResolvedValue(existente({ cuerpoHtml: "<p>texto</p>" }));
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    g.guardarArticulo.mockImplementationOnce(async (_db: unknown, p: { campos: object }) => {
      throw new ErrorArticulo("articulo/conflicto", { actual: existente({ ...p.campos, cuerpoHtml: "<p>texto</p>", actualizadoPor: "bea@x.es" }) });
    });
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(await screen.findByRole("alertdialog", { name: "Este artículo ha cambiado desde que lo abriste" })).toBeInTheDocument();
  });
});

describe("Historial: autor de la importación", () => {
  it("muestra «Importado de la web antigua» cuando el autor es «migración»", async () => {
    g.listarVersiones.mockResolvedValue([{ ...existente({ actualizadoPor: "migración" }), id: "v1", guardadoEn: "2020-01-02T12:00:00.000Z", guardadoPor: "ana@x.es" }]);
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    await userEvent.click(screen.getByRole("button", { name: "Historial" }));
    const lista = await screen.findByRole("region", { name: "Historial de versiones" });
    expect(await within(lista).findByText(/Importado de la web antigua/)).toBeInTheDocument();
    expect(within(lista).queryByText(/migración/)).toBeNull();
  });
});
