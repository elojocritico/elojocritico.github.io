import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const g = vi.hoisted(() => ({
  guardarArticulo: vi.fn(), cargarArticulo: vi.fn(), existeDireccion: vi.fn(), marcarPublicarPendiente: vi.fn(), listarVersiones: vi.fn(),
}));
vi.mock("../firebase", () => ({ auth: {}, db: { falso: true }, configurado: true }));
vi.mock("../datos/guardar", async () => ({ ...(await vi.importActual<object>("../datos/guardar")), ...g }));
vi.mock("../ruta", async () => ({ ...(await vi.importActual<object>("../ruta")), irA: vi.fn() }));
// TipTap necesita un navegador de verdad: aquí el cuadro de texto se sustituye por uno simple.
vi.mock("../componentes/EditorTexto", () => ({
  EditorTexto: ({ inicial, alCambiar }: { inicial: string; alCambiar: (h: string) => void }) => (
    <textarea aria-label="Texto del artículo" defaultValue={inicial} onChange={(e) => alCambiar(e.target.value)} />
  ),
}));

import { Editor } from "./Editor";
import { irA } from "../ruta";
import { ErrorArticulo } from "../datos/articulos";

const BD = { falso: true };
const usuario = { email: "ana@x.es" } as never;
const existente = (extra = {}) => ({
  slug: "viejo", titulo: "Título viejo", subtitulo: "", cuerpoHtml: "<p>texto</p>", extracto: "", portada: null, autor: "Ana",
  secciones: ["historia"], etiquetas: ["uno", "dos"], estado: "borrador", fechaPublicacion: "2020-01-01T11:00:00.000Z", destacado: false,
  creadoEn: "2020-01-01T11:00:00.000Z", actualizadoEn: "2020-01-02T11:00:00.000Z", actualizadoPor: "bea@x.es", enPapeleraDesde: null, ...extra,
});

async function escribirNuevo(titulo = "Mi artículo", texto = "Hola") {
  render(<Editor usuario={usuario} />);
  await userEvent.type(screen.getByLabelText(/^Título/), titulo);
  if (texto) fireEvent.change(screen.getByLabelText("Texto del artículo"), { target: { value: `<p>${texto}</p>` } });
}

beforeEach(() => {
  Object.values(g).forEach((f) => f.mockReset());
  g.existeDireccion.mockResolvedValue(false);
  g.guardarArticulo.mockResolvedValue({ actualizadoEn: "2026-01-01T10:00:00.000Z" });
  g.marcarPublicarPendiente.mockResolvedValue(undefined);
  g.listarVersiones.mockResolvedValue([]);
  g.cargarArticulo.mockResolvedValue(existente());
  vi.mocked(irA).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Editor: guardar", () => {
  it("no deja guardar sin título y lo dice claramente", async () => {
    render(<Editor usuario={usuario} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(await screen.findByText("Escribe un título para poder guardar.")).toBeInTheDocument();
    expect(g.guardarArticulo).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(g.guardarArticulo).not.toHaveBeenCalled();
  });

  it("un título de solo espacios tampoco vale", async () => {
    render(<Editor usuario={usuario} />);
    await userEvent.type(screen.getByLabelText(/^Título/), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(g.guardarArticulo).not.toHaveBeenCalled();
  });

  it("guarda un borrador nuevo con la dirección propuesta, el correo de quien escribe y un extracto automático", async () => {
    await escribirNuevo("El Año del Ñandú", "Un texto para el extracto");
    expect(screen.getByLabelText("Dirección de la página")).toHaveValue("el-ano-del-nandu");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(await screen.findByText("Borrador guardado.")).toBeInTheDocument();
    const p = g.guardarArticulo.mock.calls[0][1];
    expect(g.guardarArticulo.mock.calls[0][0]).toEqual(BD);
    expect(p).toMatchObject({ id: "el-ano-del-nandu", esNuevo: true, estado: "borrador", usuario: "ana@x.es", cargadoEn: null });
    expect(p.campos.titulo).toBe("El Año del Ñandú");
    expect(p.campos.extracto).toBe("Un texto para el extracto");
  });

  it("publicar un artículo nuevo lo marca como publicado con la fecha de ahora y avisa de «Publicar cambios»", async () => {
    await escribirNuevo();
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText(/Publicado\. Pulsa «Publicar cambios»/)).toBeInTheDocument();
    const p = g.guardarArticulo.mock.calls[0][1];
    expect(p.estado).toBe("publicado");
    expect(p.fechaPublicacion).toMatch(/Z$/);
    expect(Math.abs(Date.now() - new Date(p.fechaPublicacion).getTime())).toBeLessThan(5000);
    expect(g.marcarPublicarPendiente).toHaveBeenCalledWith(expect.objectContaining(BD));
  });

  it("no publica un artículo sin texto", async () => {
    await escribirNuevo("Solo título", "");
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText(/todavía no tiene texto/)).toBeInTheDocument();
    expect(g.guardarArticulo).not.toHaveBeenCalled();
  });

  it("no guarda dos veces si se pulsa dos veces seguidas", async () => {
    let acabar!: (v: unknown) => void;
    g.guardarArticulo.mockReturnValue(new Promise((ok) => (acabar = ok)));
    await escribirNuevo();
    const boton = screen.getByRole("button", { name: "Guardar borrador" });
    await userEvent.dblClick(boton);
    expect(g.guardarArticulo).toHaveBeenCalledTimes(1);
    acabar({ actualizadoEn: "2026-01-01T10:00:00.000Z" });
    await screen.findByText("Borrador guardado.");
  });

  it("sin conexión no da nada por guardado", async () => {
    g.guardarArticulo.mockRejectedValue({ code: "unavailable" });
    await escribirNuevo();
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText("No hay conexión con el servidor; tus cambios no se han guardado.")).toBeInTheDocument();
    expect(screen.queryByText(/^(Borrador guardado|Publicado)\./)).toBeNull();
    // al reintentar, vuelve a intentar guardar
    g.guardarArticulo.mockResolvedValue({ actualizadoEn: "2026-01-01T10:00:00.000Z" });
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText(/^Publicado\./)).toBeInTheDocument();
  });

  it("con el navegador sin conexión ni lo intenta", async () => {
    const spy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await escribirNuevo();
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(await screen.findByText("No hay conexión con el servidor; tus cambios no se han guardado.")).toBeInTheDocument();
    expect(g.guardarArticulo).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("si el servidor está agotado, lo explica", async () => {
    g.guardarArticulo.mockRejectedValue({ code: "resource-exhausted" });
    await escribirNuevo();
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(await screen.findByText(/límite de uso/)).toBeInTheDocument();
  });
});

describe("Editor: programar", () => {
  const programar = async (valor: string) => {
    await userEvent.click(screen.getByRole("button", { name: "Programar" }));
    fireEvent.change(screen.getByLabelText(/Fecha y hora de publicación/), { target: { value: valor } });
    await userEvent.click(screen.getByRole("button", { name: "Programar para esa hora" }));
  };

  it("una fecha pasada se convierte en publicar, con un aviso", async () => {
    await escribirNuevo();
    await programar("2020-01-01T10:00");
    expect(await screen.findByText(/Esa fecha ya había pasado, así que el artículo se ha publicado ahora/)).toBeInTheDocument();
    const p = g.guardarArticulo.mock.calls[0][1];
    expect(p.estado).toBe("publicado");
    expect(Math.abs(Date.now() - new Date(p.fechaPublicacion).getTime())).toBeLessThan(5000);
  });

  it("una fecha futura se guarda como programada, pasando la hora de España a UTC (verano e invierno)", async () => {
    await escribirNuevo();
    await programar("2099-07-01T09:30");
    expect(await screen.findByText(/Programado\. Saldrá solo en la web el .*2099.*\(hora de España\)\./)).toBeInTheDocument();
    expect(screen.queryByText(/Pulsa «Publicar cambios»/)).toBeNull();
    expect(g.guardarArticulo.mock.calls[0][1]).toMatchObject({ estado: "programado", fechaPublicacion: "2099-07-01T07:30:00.000Z" });
    g.guardarArticulo.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Programar" }));
    fireEvent.change(screen.getByLabelText(/Fecha y hora de publicación/), { target: { value: "2099-01-15T09:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Programar para esa hora" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalled());
    expect(g.guardarArticulo.mock.calls[0][1].fechaPublicacion).toBe("2099-01-15T08:30:00.000Z");
  });

  it("una fecha vacía o inventada no se acepta", async () => {
    await escribirNuevo();
    await programar("");
    expect(await screen.findByText(/La fecha y la hora no son válidas/)).toBeInTheDocument();
    expect(g.guardarArticulo).not.toHaveBeenCalled();
  });
});

describe("Editor: dirección de la página", () => {
  it("avisa si ya existe y no deja guardar", async () => {
    g.existeDireccion.mockResolvedValue(true);
    await escribirNuevo("Repetido");
    expect(await screen.findByText(/Ya existe un artículo con esa dirección/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(g.guardarArticulo).not.toHaveBeenCalled();
  });

  it("no admite rutas reservadas de la web", async () => {
    await escribirNuevo("Admin");
    expect(await screen.findByText(/está reservada para la web/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(g.guardarArticulo).not.toHaveBeenCalled();
  });

  it("se puede editar a mano y deja de seguir al título", async () => {
    await escribirNuevo("Primero");
    const campo = screen.getByLabelText("Dirección de la página");
    await userEvent.clear(campo);
    await userEvent.type(campo, "mi-direccion");
    await userEvent.type(screen.getByLabelText(/^Título/), " más");
    expect(campo).toHaveValue("mi-direccion");
    expect(screen.getByText("mi-direccion", { selector: "strong" })).toBeInTheDocument();
  });

  it("en un artículo existente es de solo lectura y explica por qué", async () => {
    render(<Editor usuario={usuario} id="viejo" />);
    const campo = await screen.findByLabelText("Dirección de la página");
    expect(campo).toHaveAttribute("readonly");
    expect(campo).toHaveValue("viejo");
    expect(screen.getByText(/La dirección no se puede cambiar una vez guardado el artículo/)).toBeInTheDocument();
  });
});

describe("Editor: artículo existente y conflictos", () => {
  it("carga el artículo y guarda con el actualizadoEn que se cargó", async () => {
    render(<Editor usuario={usuario} id="viejo" />);
    expect(await screen.findByDisplayValue("Título viejo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("uno, dos")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await screen.findByText("Borrador guardado.");
    expect(g.guardarArticulo.mock.calls[0][1]).toMatchObject({ id: "viejo", esNuevo: false, cargadoEn: "2020-01-02T11:00:00.000Z", usuario: "ana@x.es" });
    // un segundo guardado usa ya el nuevo actualizadoEn
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalledTimes(2));
    expect(g.guardarArticulo.mock.calls[1][1].cargadoEn).toBe("2026-01-01T10:00:00.000Z");
  });

  it("si el artículo no existe, lo dice", async () => {
    g.cargarArticulo.mockResolvedValue(null);
    render(<Editor usuario={usuario} id="nada" />);
    expect(await screen.findByText(/no existe/)).toBeInTheDocument();
  });

  it("un artículo en la papelera no se edita", async () => {
    g.cargarArticulo.mockResolvedValue(existente({ estado: "papelera" }));
    render(<Editor usuario={usuario} id="viejo" />);
    expect(await screen.findByText(/está en la papelera/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar" })).toBeNull();
  });

  const conflicto = () => new ErrorArticulo("articulo/conflicto", { actual: existente({ titulo: "Título de Bea", actualizadoEn: "2020-01-03T09:00:00.000Z", actualizadoPor: "bea@x.es" }) });

  it("si alguien lo cambió, avisa con las dos opciones y, al guardar los míos, fuerza el guardado", async () => {
    g.guardarArticulo.mockRejectedValueOnce(conflicto());
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Este artículo ha cambiado desde que lo abriste" });
    expect(within(dialogo).getByText(/bea@x\.es/)).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Ver los cambios del otro" })).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar los míos de todas formas" }));
    await screen.findByText("Borrador guardado.");
    expect(g.guardarArticulo).toHaveBeenCalledTimes(2);
    expect(g.guardarArticulo.mock.calls[0][1].forzar).toBeFalsy();
    expect(g.guardarArticulo.mock.calls[1][1].forzar).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("«Ver los cambios del otro» muestra qué es distinto y permite quedarse con lo del otro", async () => {
    g.guardarArticulo.mockRejectedValueOnce(conflicto());
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver los cambios del otro" }));
    const panel = await screen.findByRole("region", { name: "Cambios de la otra persona" });
    expect(within(panel).getByText("Título de Bea")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Quedarme con lo de la otra persona" }));
    expect(await screen.findByDisplayValue("Título de Bea")).toBeInTheDocument();
    // y ahora guarda sin conflicto, con el punto de partida del otro
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalledTimes(2));
    expect(g.guardarArticulo.mock.calls[1][1].cargadoEn).toBe("2020-01-03T09:00:00.000Z");
  });

  it("si el artículo está publicado, guardar como borrador pide confirmar", async () => {
    g.cargarArticulo.mockResolvedValue(existente({ estado: "publicado" }));
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    expect(screen.queryByRole("button", { name: "Programar" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(g.guardarArticulo).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Sí, guardar como borrador" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalled());
    expect(g.guardarArticulo.mock.calls[0][1].estado).toBe("borrador");
  });

  it("al publicar cambios de un artículo ya publicado conserva su fecha de publicación", async () => {
    g.cargarArticulo.mockResolvedValue(existente({ estado: "publicado" }));
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar y publicar cambios" }));
    await waitFor(() => expect(g.guardarArticulo).toHaveBeenCalled());
    expect(g.guardarArticulo.mock.calls[0][1]).toMatchObject({ estado: "publicado", fechaPublicacion: undefined });
  });
});

describe("Editor: historial y vista previa", () => {
  it("lista las versiones y permite volver a una, pidiendo confirmación", async () => {
    g.listarVersiones.mockResolvedValue([
      { ...existente({ titulo: "Título antiguo", cuerpoHtml: "<p>antiguo</p>" }), id: "v1", guardadoEn: "2020-01-02T12:00:00.000Z", guardadoPor: "bea@x.es" },
    ]);
    render(<Editor usuario={usuario} id="viejo" />);
    await screen.findByDisplayValue("Título viejo");
    await userEvent.click(screen.getByRole("button", { name: "Historial" }));
    const lista = await screen.findByRole("region", { name: "Historial de versiones" });
    expect(await within(lista).findByText("Título antiguo")).toBeInTheDocument();
    expect(within(lista).getByText(/bea@x\.es/)).toBeInTheDocument();
    await userEvent.click(within(lista).getByRole("button", { name: "Volver a esta versión" }));
    await userEvent.click(await screen.findByRole("button", { name: "Sí, volver a esta versión" }));
    expect(screen.getByDisplayValue("Título antiguo")).toBeInTheDocument();
    expect(screen.getByLabelText("Texto del artículo")).toHaveValue("<p>antiguo</p>");
    expect(screen.getByText(/Todavía no está guardada/)).toBeInTheDocument();
    expect(g.guardarArticulo).not.toHaveBeenCalled();
  });

  it("el botón Historial no está en un artículo nuevo", async () => {
    render(<Editor usuario={usuario} />);
    expect(screen.queryByRole("button", { name: "Historial" })).toBeNull();
  });

  it("la vista previa usa el saneado de la web: no deja pasar scripts, onerror ni javascript:", async () => {
    await escribirNuevo("Prueba", "");
    fireEvent.change(screen.getByLabelText("Texto del artículo"), {
      target: { value: '<p>Hola <a href="javascript:alert(1)">enlace</a></p><script>alert(2)</script><img src="x.jpg" onerror="alert(3)"><p>&nbsp;</p>' },
    });
    await userEvent.click(screen.getByRole("button", { name: "Vista previa" }));
    const previa = screen.getByRole("article", { name: "Vista previa" });
    const cuerpo = previa.querySelector(".cuerpo")!;
    expect(cuerpo.innerHTML).not.toMatch(/script|onerror|javascript:/i);
    expect(cuerpo.textContent).toContain("Hola enlace");
    expect(cuerpo.querySelector("img")?.getAttribute("src")).toBe("x.jpg");
    expect(within(previa).getByRole("heading", { name: "Prueba" })).toBeInTheDocument();
  });
});

describe("Editor: salir", () => {
  it("con cambios sin guardar pide confirmar antes de salir", async () => {
    render(<Editor usuario={usuario} />);
    await userEvent.type(screen.getByLabelText(/^Título/), "algo");
    await userEvent.click(screen.getByRole("button", { name: "Volver a Mis artículos" }));
    expect(irA).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Salir sin guardar" }));
    expect(irA).toHaveBeenCalledWith("articulos");
  });
  it("sin cambios sale directamente", async () => {
    render(<Editor usuario={usuario} />);
    await userEvent.click(screen.getByRole("button", { name: "Volver a Mis artículos" }));
    expect(irA).toHaveBeenCalledWith("articulos");
  });
});
