import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../subirImagen", async () => ({
  ...(await vi.importActual<object>("../subirImagen")),
  subirImagen: vi.fn(async () => ({ url: "data:image/jpeg;base64,AAAA", aviso: "Modo de prueba: la foto no se guarda en internet" })),
}));
import { EditorTexto } from "./EditorTexto";
import { subirImagen, ErrorSubida } from "../subirImagen";

// jsdom no calcula posiciones en pantalla, y ProseMirror las pide al mover el cursor.
const sinRectangulos = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Record<string, unknown>[]) {
  proto.getClientRects ??= sinRectangulos;
  proto.getBoundingClientRect ??= () => new DOMRect();
}

describe("EditorTexto", () => {
  it("muestra el texto inicial y los botones de formato en español", async () => {
    render(<EditorTexto inicial="<h2>Hola</h2><p>Mundo</p>" alCambiar={() => {}} alAviso={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Hola" })).toBeInTheDocument();
    for (const n of ["Título", "Subtítulo", "Negrita", "Cursiva", "Cita", "Lista con puntos", "Lista numerada", "Enlace", "Insertar foto", "Insertar vídeo de YouTube", "Deshacer", "Rehacer"]) {
      expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    }
  });

  it("al elegir una foto la inserta y avisa del modo de prueba", async () => {
    const alAviso = vi.fn();
    const alCambiar = vi.fn();
    vi.spyOn(window, "prompt").mockReturnValue("Una foto");
    render(<EditorTexto inicial="<p>Hola</p>" alCambiar={alCambiar} alAviso={alAviso} />);
    await screen.findByRole("toolbar");
    await userEvent.upload(screen.getByTestId("elegir-foto-texto"), new File(["x"], "f.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(alAviso).toHaveBeenCalledWith("Modo de prueba: la foto no se guarda en internet", "info"));
    await waitFor(() => expect(alCambiar).toHaveBeenCalled());
    expect(alCambiar.mock.calls.at(-1)![0]).toContain('<img src="data:image/jpeg;base64,AAAA" alt="Una foto"');
  });

  it("rechaza un enlace javascript:", async () => {
    const alAviso = vi.fn();
    vi.spyOn(window, "prompt").mockReturnValue("javascript:alert(1)");
    render(<EditorTexto inicial="<p>Hola</p>" alCambiar={() => {}} alAviso={alAviso} />);
    await userEvent.click(await screen.findByRole("button", { name: "Enlace" }));
    expect(alAviso).toHaveBeenCalledWith(expect.stringContaining("no es válido"), "error");
  });
});

describe("EditorTexto: foto pendiente", () => {
  const marca = (n = "/wp-content/uploads/2014/12/Mi%20foto.jpg") => `<p>Antes <span class="img-perdida" data-original="${n}">Imagen no recuperada</span> después</p>`;
  const archivoFalso = () => new File(["x"], "nueva.jpg", { type: "image/jpeg" });

  it("la marca se ve como un recuadro «Foto pendiente» con el nombre original y el botón «Poner foto»", async () => {
    render(<EditorTexto inicial={marca()} alCambiar={() => {}} alAviso={() => {}} />);
    const caja = (await screen.findByText("Foto pendiente")).closest("[data-foto-pendiente]") as HTMLElement;
    expect(caja).toBeTruthy();
    expect(caja.textContent).toContain("Mi foto.jpg");
    expect(caja.getAttribute("contenteditable")).toBe("false");
    expect(within(caja).getByRole("button", { name: "Poner foto" })).toBeInTheDocument();
  });

  it("sin nombre dice «sin nombre»", async () => {
    render(<EditorTexto inicial={'<p><span class="img-perdida">Imagen no recuperada</span></p>'} alCambiar={() => {}} alAviso={() => {}} />);
    expect(await screen.findByText("sin nombre")).toBeInTheDocument();
  });

  it("«Poner foto» sube la foto y sustituye la marca en el mismo sitio, con el nombre original como texto alternativo", async () => {
    const alCambiar = vi.fn();
    const alAviso = vi.fn();
    vi.mocked(subirImagen).mockResolvedValueOnce({ url: "https://res.cloudinary.com/x/nueva.jpg", aviso: "Modo de prueba: la foto no se guarda en internet" });
    render(<EditorTexto inicial={marca()} alCambiar={alCambiar} alAviso={alAviso} />);
    await screen.findByText("Foto pendiente");
    await userEvent.upload(screen.getByTestId("elegir-foto-pendiente"), archivoFalso());
    await waitFor(() => expect(screen.queryByText("Foto pendiente")).toBeNull());
    const html = alCambiar.mock.calls.at(-1)![0] as string;
    expect(html).toContain('<img src="https://res.cloudinary.com/x/nueva.jpg" alt="Mi foto"');
    expect(html).not.toContain("img-perdida");
    expect(html).toMatch(/Antes <img[^>]*> después/);
    expect(alAviso).toHaveBeenCalledWith("Modo de prueba: la foto no se guarda en internet", "info");
  });

  it("mientras sube dice «Subiendo la foto…»; si falla, deja la marca y explica el error", async () => {
    let fallar!: (e: Error) => void;
    vi.mocked(subirImagen).mockImplementationOnce(() => new Promise((_, mal) => { fallar = mal; }));
    const alCambiar = vi.fn();
    render(<EditorTexto inicial={marca()} alCambiar={alCambiar} alAviso={() => {}} />);
    await screen.findByText("Foto pendiente");
    await userEvent.upload(screen.getByTestId("elegir-foto-pendiente"), archivoFalso());
    expect(await screen.findByRole("button", { name: "Subiendo la foto…" })).toBeDisabled();
    fallar(new ErrorSubida("No se ha podido subir la foto. Revisa tu conexión y vuelve a intentarlo."));
    expect(await screen.findByText(/Revisa tu conexión/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poner foto" })).toBeEnabled();
    expect(screen.getByText("Foto pendiente")).toBeInTheDocument();
    expect(alCambiar).not.toHaveBeenCalled();
  });
});
