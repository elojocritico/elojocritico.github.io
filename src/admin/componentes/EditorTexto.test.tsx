import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../subirImagen", async () => ({
  ...(await vi.importActual<object>("../subirImagen")),
  subirImagen: vi.fn(async () => ({ url: "data:image/jpeg;base64,AAAA", aviso: "Modo de prueba: la foto no se guarda en internet" })),
}));
import { EditorTexto } from "./EditorTexto";

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
