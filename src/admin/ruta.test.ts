import { describe, it, expect } from "vitest";
import { leerRuta } from "./ruta";

describe("leerRuta", () => {
  it("lee pantalla e id del hash", () => {
    expect(leerRuta("")).toEqual({ pantalla: "inicio" });
    expect(leerRuta("#/")).toEqual({ pantalla: "inicio" });
    expect(leerRuta("#/articulos")).toEqual({ pantalla: "articulos" });
    expect(leerRuta("#/editar/abc%20d")).toEqual({ pantalla: "editar", id: "abc d" });
  });
});
