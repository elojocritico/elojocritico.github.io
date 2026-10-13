import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const d = vi.hoisted(() => ({ contarCambios: vi.fn(), publicarCambios: vi.fn() }));
vi.mock("../firebase", () => ({ auth: {}, db: { falso: true }, configurado: true }));
vi.mock("../datos/publicar", async () => ({ ...(await vi.importActual<object>("../datos/publicar")), ...d }));
vi.mock("../ruta", async () => ({ ...(await vi.importActual<object>("../ruta")), irA: vi.fn() }));

import { Publicar, MSG_RAPIDO, MSG_LENTO } from "./Publicar";

const BD = { falso: true };
const usuario = { email: "ana@x.es", getIdToken: vi.fn(async () => "token-123") } as never;

beforeEach(() => {
  Object.values(d).forEach((f) => f.mockReset());
  d.contarCambios.mockResolvedValue({ nunca: false, cambios: 3, pendiente: false });
  d.publicarCambios.mockResolvedValue({ rapido: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("Publicar cambios", () => {
  it("muestra el contador de cambios sin publicar", async () => {
    render(<Publicar usuario={usuario} />);
    expect(await screen.findByText("3 cambios sin publicar en la web")).toBeInTheDocument();
  });

  it("singular, cero y «nunca»", async () => {
    d.contarCambios.mockResolvedValue({ nunca: false, cambios: 1, pendiente: false });
    const { unmount } = render(<Publicar usuario={usuario} />);
    expect(await screen.findByText("1 cambio sin publicar en la web")).toBeInTheDocument();
    unmount();
    d.contarCambios.mockResolvedValue({ nunca: true, cambios: null, pendiente: false });
    render(<Publicar usuario={usuario} />);
    expect(await screen.findByText("Todavía no se ha publicado ningún cambio")).toBeInTheDocument();
  });

  it("con 0 cambios de artículos pero publicación pendiente (comentarios o ajustes) avisa de que hay cambios", async () => {
    d.contarCambios.mockResolvedValue({ nunca: false, cambios: 0, pendiente: true });
    render(<Publicar usuario={usuario} />);
    expect(await screen.findByText("Hay cambios sin publicar (comentarios o ajustes)")).toBeInTheDocument();
  });

  it("con 0 cambios y sin pendiente: no hay cambios", async () => {
    d.contarCambios.mockResolvedValue({ nunca: false, cambios: 0, pendiente: false });
    render(<Publicar usuario={usuario} />);
    expect(await screen.findByText("No hay cambios sin publicar en la web")).toBeInTheDocument();
  });

  it("sin dirección de publicación: «Se publicará en menos de 1 hora»", async () => {
    vi.stubEnv("PUBLIC_URL_PUBLICAR", "");
    render(<Publicar usuario={usuario} />);
    await userEvent.click(await screen.findByRole("button", { name: "Publicar cambios ahora" }));
    expect(await screen.findByText(MSG_LENTO)).toBeInTheDocument();
    expect(d.publicarCambios).toHaveBeenCalledWith(BD, expect.objectContaining({ url: undefined }));
  });

  it("con dirección y respuesta buena: «Publicando… estará en la web en unos minutos» (y se pide el token del usuario)", async () => {
    vi.stubEnv("PUBLIC_URL_PUBLICAR", "https://publicar.test/x");
    d.publicarCambios.mockImplementation(async (_db: unknown, o: { obtenerToken: () => Promise<string> }) => {
      expect(await o.obtenerToken()).toBe("token-123");
      return { rapido: true };
    });
    render(<Publicar usuario={usuario} />);
    await userEvent.click(await screen.findByRole("button", { name: "Publicar cambios ahora" }));
    expect(await screen.findByText(MSG_RAPIDO)).toBeInTheDocument();
    expect(d.publicarCambios).toHaveBeenCalledWith(BD, expect.objectContaining({ url: "https://publicar.test/x", obtenerAppCheck: expect.any(Function) }));
  });

  it("con dirección pero fallo al avisar: «Se publicará en menos de 1 hora»", async () => {
    vi.stubEnv("PUBLIC_URL_PUBLICAR", "https://publicar.test/x");
    d.publicarCambios.mockResolvedValue({ rapido: false });
    render(<Publicar usuario={usuario} />);
    await userEvent.click(await screen.findByRole("button", { name: "Publicar cambios ahora" }));
    expect(await screen.findByText(MSG_LENTO)).toBeInTheDocument();
  });

  it("si no se puede guardar la petición, no dice que se publicará", async () => {
    d.publicarCambios.mockRejectedValue({ code: "unavailable" });
    render(<Publicar usuario={usuario} />);
    await userEvent.click(await screen.findByRole("button", { name: "Publicar cambios ahora" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No hay conexión/);
    expect(screen.queryByText(MSG_LENTO)).toBeNull();
    expect(screen.queryByText(MSG_RAPIDO)).toBeNull();
  });

  it("un doble clic solo lanza una publicación", async () => {
    let fin: (v: { rapido: boolean }) => void = () => {};
    d.publicarCambios.mockReturnValue(new Promise((r) => (fin = r)));
    render(<Publicar usuario={usuario} />);
    const boton = await screen.findByRole("button", { name: "Publicar cambios ahora" });
    await userEvent.dblClick(boton);
    expect(d.publicarCambios).toHaveBeenCalledTimes(1);
    fin({ rapido: false });
    await waitFor(() => expect(screen.getByText(MSG_LENTO)).toBeInTheDocument());
  });

  it("si no se pueden contar los cambios, avisa pero deja publicar", async () => {
    d.contarCambios.mockRejectedValue({ code: "unavailable" });
    render(<Publicar usuario={usuario} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/No se han podido contar/);
    expect(screen.getByRole("button", { name: "Publicar cambios ahora" })).toBeEnabled();
  });
});
