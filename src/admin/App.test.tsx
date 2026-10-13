import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./firebase", () => ({ auth: null, db: null, configurado: false }));

import App from "./App";

describe("App", () => {
  it("sin configuracion: explica el problema en vez de romperse", () => {
    render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("El panel aún no está configurado. Consulta la Ayuda.");
  });
});
