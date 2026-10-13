import { describe, it, expect } from "vitest";
import { autorEnLlano, esAutorDeSistema } from "./autor";

describe("autorEnLlano", () => {
  it("traduce los valores del sistema y deja los correos", () => {
    expect(autorEnLlano("migración")).toBe("Importado de la web antigua");
    expect(autorEnLlano("publicación programada")).toBe("Publicación programada");
    expect(autorEnLlano("ana@x.es")).toBe("ana@x.es");
    expect(autorEnLlano("")).toBe("autor desconocido");
    expect(autorEnLlano(undefined)).toBe("autor desconocido");
  });
  it("distingue personas de programas", () => {
    expect(esAutorDeSistema("migración")).toBe(true);
    expect(esAutorDeSistema("publicación programada")).toBe(true);
    expect(esAutorDeSistema("ana@x.es")).toBe(false);
    expect(esAutorDeSistema("")).toBe(false);
  });
});
