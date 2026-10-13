import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Confirmar } from "./Confirmar";

describe("Confirmar", () => {
  it("empieza en la opcion segura (No) y confirma o cancela con los botones", async () => {
    const si = vi.fn(), no = vi.fn();
    render(<Confirmar titulo="¿Seguro?" alConfirmar={si} alCancelar={no} />);
    expect(screen.getByRole("alertdialog", { name: "¿Seguro?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, cancelar" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Sí, continuar" }));
    expect(si).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "No, cancelar" }));
    expect(no).toHaveBeenCalledOnce();
  });

  it("Escape cancela", async () => {
    const no = vi.fn(), si = vi.fn();
    render(<Confirmar titulo="t" alConfirmar={si} alCancelar={no} />);
    await userEvent.keyboard("{Escape}");
    expect(no).toHaveBeenCalledOnce();
    expect(si).not.toHaveBeenCalled();
  });

  it("el foco da la vuelta con Tab y con Mayus+Tab sin salir del dialogo", async () => {
    render(
      <>
        <button>fuera</button>
        <Confirmar titulo="t" peligro textoSi="Borrar" alConfirmar={() => {}} alCancelar={() => {}} />
      </>,
    );
    const no = screen.getByRole("button", { name: "No, cancelar" });
    const borrar = screen.getByRole("button", { name: "Borrar" });
    expect(no).toHaveFocus();
    await userEvent.tab();
    expect(borrar).toHaveFocus();
    await userEvent.tab();
    expect(no).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(borrar).toHaveFocus();
    expect(screen.getByRole("button", { name: "fuera" })).not.toHaveFocus();
  });

  it("si el contenido tiene un campo, el foco empieza ahi; al cerrar el foco vuelve al boton que lo abrio", async () => {
    function Prueba() {
      return (
        <>
          <button id="abre">abrir</button>
          <Confirmar titulo="t" alConfirmar={() => {}} alCancelar={() => {}}>
            <select aria-label="Sección">
              <option>a</option>
            </select>
          </Confirmar>
        </>
      );
    }
    const { rerender } = render(<button id="abre">abrir</button>);
    document.getElementById("abre")!.focus();
    rerender(<Prueba />);
    // (El boton "abrir" de Prueba es otro nodo; lo importante es el foco inicial en el campo.)
    expect(screen.getByLabelText("Sección")).toHaveFocus();
  });

  it("devuelve el foco al elemento que lo tenia antes de abrirse", () => {
    const { rerender } = render(<button>origen</button>);
    const origen = screen.getByRole("button", { name: "origen" });
    origen.focus();
    rerender(
      <>
        <button>origen</button>
        <Confirmar titulo="t" alConfirmar={() => {}} alCancelar={() => {}} />
      </>,
    );
    expect(screen.getByRole("button", { name: "No, cancelar" })).toHaveFocus();
    rerender(<button>origen</button>);
    expect(screen.getByRole("button", { name: "origen" })).toHaveFocus();
  });
});
