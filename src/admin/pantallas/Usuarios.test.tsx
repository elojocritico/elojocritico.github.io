import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const d = vi.hoisted(() => ({ leerAjustes: vi.fn(), cambiarUsuario: vi.fn() }));
vi.mock("../firebase", () => ({ auth: {}, db: { falso: true }, configurado: true }));
vi.mock("../datos/ajustes", async () => ({ ...(await vi.importActual<object>("../datos/ajustes")), leerAjustes: d.leerAjustes, cambiarUsuario: d.cambiarUsuario }));
vi.mock("../ruta", async () => ({ ...(await vi.importActual<object>("../ruta")), irA: vi.fn() }));

import { Usuarios, INSTRUCCIONES_NUEVO } from "./Usuarios";
import { ErrorAjustes } from "../datos/ajustes";

const BD = { falso: true };
const usuario = { email: "Ana@x.es" } as never;
const lista = (extra = {}) => ({ usuarios: { "ana@x.es": "admin", "bea@x.es": "editor", ...extra }, version: "v1" });

beforeEach(() => {
  Object.values(d).forEach((f) => f.mockReset());
  d.leerAjustes.mockResolvedValue({ ...lista() });
  d.cambiarUsuario.mockResolvedValue("v2");
});

describe("Usuarios", () => {
  it("un editor que llega por la dirección solo ve el aviso", () => {
    render(<Usuarios usuario={usuario} papel="editor" />);
    expect(screen.getByText("Esta sección es solo para administradores.")).toBeInTheDocument();
    expect(d.leerAjustes).not.toHaveBeenCalled();
  });

  it("lista a las personas con su papel", async () => {
    render(<Usuarios usuario={usuario} papel="admin" />);
    expect(await screen.findByText("bea@x.es")).toBeInTheDocument();
    expect(screen.getByText("Administrador (tú)")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("añade con el correo en minúsculas y muestra las instrucciones", async () => {
    render(<Usuarios usuario={usuario} papel="admin" />);
    await screen.findByText("bea@x.es");
    await userEvent.type(screen.getByLabelText("Correo"), " Nuevo@Ejemplo.ES ");
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));
    await waitFor(() => expect(d.cambiarUsuario).toHaveBeenCalledWith(BD, "Ana@x.es", "v1", "nuevo@ejemplo.es", "editor"));
    expect(await screen.findByText(INSTRUCCIONES_NUEVO)).toBeInTheDocument();
    expect(screen.getByText("nuevo@ejemplo.es")).toBeInTheDocument();
  });

  it("rechaza un correo mal escrito y uno ya existente", async () => {
    render(<Usuarios usuario={usuario} papel="admin" />);
    await screen.findByText("bea@x.es");
    await userEvent.type(screen.getByLabelText("Correo"), "esto-no-es-correo");
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no parece correcto/);
    await userEvent.clear(screen.getByLabelText("Correo"));
    await userEvent.type(screen.getByLabelText("Correo"), "BEA@x.es");
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ya está en la lista/);
    expect(d.cambiarUsuario).not.toHaveBeenCalled();
  });

  it("quita a alguien solo tras confirmar", async () => {
    render(<Usuarios usuario={usuario} papel="admin" />);
    await screen.findByText("bea@x.es");
    await userEvent.click(screen.getByRole("button", { name: "Quitar a bea@x.es" }));
    expect(d.cambiarUsuario).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sí, quitar" }));
    await waitFor(() => expect(d.cambiarUsuario).toHaveBeenCalledWith(BD, "Ana@x.es", "v1", "bea@x.es", null));
    await waitFor(() => expect(screen.queryByText("bea@x.es")).toBeNull());
  });

  it("no se puede quitar ni degradar al último administrador (ni a uno mismo)", async () => {
    render(<Usuarios usuario={usuario} papel="admin" />);
    await screen.findByText("bea@x.es");
    expect(screen.getByRole("button", { name: "Quitar a ana@x.es" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hacer editor a ana@x.es" })).toBeDisabled();
    expect(screen.getByText(/único administrador/)).toBeInTheDocument();
  });

  it("con dos administradores se puede quitar a otro, pero no a uno mismo", async () => {
    d.leerAjustes.mockResolvedValue({ ...lista({ "bea@x.es": "admin" }) });
    render(<Usuarios usuario={usuario} papel="admin" />);
    await screen.findByText("bea@x.es");
    expect(screen.getByRole("button", { name: "Quitar a bea@x.es" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Quitar a ana@x.es" })).toBeDisabled();
  });

  it("si el servidor protege al último administrador, lo dice en llano", async () => {
    d.leerAjustes.mockResolvedValue({ ...lista({ "bea@x.es": "admin" }) });
    d.cambiarUsuario.mockRejectedValue(new ErrorAjustes("ajustes/ultimo-admin"));
    render(<Usuarios usuario={usuario} papel="admin" />);
    await screen.findByText("bea@x.es");
    await userEvent.click(screen.getByRole("button", { name: "Hacer editor a bea@x.es" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/al menos un administrador/);
  });
});
