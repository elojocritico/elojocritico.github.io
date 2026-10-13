import { describe, it, expect } from "vitest";
import { leerConfiguracion } from "./firebase";

describe("leerConfiguracion", () => {
  it("rechaza lo que falta o esta mal escrito", () => {
    expect(leerConfiguracion(undefined)).toBeNull();
    expect(leerConfiguracion("")).toBeNull();
    expect(leerConfiguracion("{no es json")).toBeNull();
    expect(leerConfiguracion('{"projectId":"x"}')).toBeNull();
  });
  it("acepta una configuracion valida", () => {
    expect(leerConfiguracion('{"projectId":"demo-elojocritico","apiKey":"demo"}')).toMatchObject({ projectId: "demo-elojocritico" });
  });
});
