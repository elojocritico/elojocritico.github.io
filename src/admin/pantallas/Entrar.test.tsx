import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const f = vi.hoisted(() => ({
  signIn: vi.fn(),
  verif: vi.fn(),
  reset: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../firebase", () => ({ auth: { nombre: "auth" }, db: {}, configurado: true }));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: f.signIn,
  sendEmailVerification: f.verif,
  sendPasswordResetEmail: f.reset,
  signOut: f.signOut,
}));

import { Entrar } from "./Entrar";

async function rellenar(correo = "ana@x.es", clave = "secreto1") {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText("Correo"), correo);
  await u.type(screen.getByLabelText("Contraseña"), clave);
  return u;
}

beforeEach(() => {
  Object.values(f).forEach((m) => m.mockReset().mockResolvedValue(undefined));
});

describe("Entrar", () => {
  it("contraseña incorrecta: mensaje en llano, sin codigos", async () => {
    f.signIn.mockRejectedValue({ code: "auth/invalid-credential" });
    render(<Entrar />);
    const u = await rellenar();
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El correo o la contraseña no son correctos");
    expect(screen.queryByText(/auth\//)).toBeNull();
  });

  it("sin conexion: lo dice claro", async () => {
    f.signIn.mockRejectedValue({ code: "auth/network-request-failed" });
    render(<Entrar />);
    const u = await rellenar();
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No hay conexión");
  });

  it("muestra el aviso de usuario no autorizado que llega de la sesion", () => {
    render(<Entrar errorInicial="Tu correo no tiene permiso para entrar. Pide acceso a un administrador." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Tu correo no tiene permiso para entrar. Pide acceso a un administrador");
  });

  it("correo sin confirmar: envia verificacion, cierra sesion y ofrece reenviar", async () => {
    const user = { emailVerified: false };
    f.signIn.mockResolvedValue({ user });
    render(<Entrar />);
    const u = await rellenar();
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText(/Te hemos enviado un correo para confirmar tu dirección/)).toBeInTheDocument();
    expect(f.verif).toHaveBeenCalledWith(user);
    expect(f.signOut).toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Reenviar el correo" }));
    await waitFor(() => expect(f.verif).toHaveBeenCalledTimes(2));
  });

  it("correo confirmado: no cierra sesion ni envia nada", async () => {
    f.signIn.mockResolvedValue({ user: { emailVerified: true } });
    render(<Entrar />);
    const u = await rellenar();
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(f.signIn).toHaveBeenCalledWith({ nombre: "auth" }, "ana@x.es", "secreto1"));
    expect(f.verif).not.toHaveBeenCalled();
    expect(f.signOut).not.toHaveBeenCalled();
  });

  it("contraseña olvidada: pide el correo y envia el enlace", async () => {
    render(<Entrar />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "¿Has olvidado la contraseña?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe primero tu correo");
    await u.type(screen.getByLabelText("Correo"), "ana@x.es");
    await u.click(screen.getByRole("button", { name: "¿Has olvidado la contraseña?" }));
    expect(await screen.findByText(/te hemos enviado un enlace/)).toBeInTheDocument();
    expect(f.reset).toHaveBeenCalledWith({ nombre: "auth" }, "ana@x.es");
  });
});
