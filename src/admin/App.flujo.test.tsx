import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const s = vi.hoisted(() => ({
  valor: { usuario: null, papel: null, cargando: false, error: null } as Record<string, unknown>,
  signIn: vi.fn(),
}));
vi.mock("./firebase", () => ({ auth: {}, db: {}, configurado: true }));
vi.mock("./sesion", () => ({ usarSesion: () => s.valor }));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: s.signIn,
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
}));

import App from "./App";

describe("App: rechazo de la lista de autorizados", () => {
  it("tras enviar el formulario, la sesion pasa a 'cargando' y vuelve con el error: se ve el aviso", async () => {
    s.signIn.mockResolvedValue({ user: { emailVerified: true } });
    const { rerender } = render(<App />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Correo"), "intruso@x.es");
    await u.type(screen.getByLabelText("Contraseña"), "secreto1");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    s.valor = { usuario: null, papel: null, cargando: true, error: null };
    rerender(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(screen.queryByRole("button", { name: "Entrar" })).toBeNull();
    s.valor = { usuario: null, papel: null, cargando: false, error: "Tu correo no tiene permiso para entrar. Pide acceso a un administrador." };
    rerender(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("Tu correo no tiene permiso para entrar");
  });
});
