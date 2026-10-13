import { describe, it, expect } from "vitest";
import { avisoDePerdidas, contarElementos } from "./perdidas";

const ivoox = '<iframe allowfullscreen="" height="120" src="https://www.ivoox.com/player_ej_1.html" width="100%"></iframe>';

describe("avisoDePerdidas", () => {
  it("no avisa si no se pierde nada, ni si solo se añade", () => {
    expect(avisoDePerdidas(`<p>a</p>${ivoox}`, `<p>b</p>${ivoox}`)).toBeNull();
    expect(avisoDePerdidas("<p>a</p>", `<p>a</p>${ivoox}`)).toBeNull();
  });
  it("avisa en llano de los vídeos que se perderían", () => {
    expect(avisoDePerdidas(`${ivoox}${ivoox}`, "<p>a</p>")).toBe("Al guardar se perderían 2 vídeos o reproductores. ¿Seguro?");
    expect(avisoDePerdidas(ivoox, "")).toBe("Al guardar se perderían 1 vídeo o reproductor. ¿Seguro?");
  });
  it("cuenta tablas y fotos", () => {
    const a = avisoDePerdidas('<table><tbody><tr><td>x</td></tr></tbody></table><img src="/a.jpg">', "<p>x</p>");
    expect(a).toMatch(/1 tabla/);
    expect(a).toMatch(/1 foto/);
  });
  it("cuenta lo que se publica, no lo que se escribe (un iframe no permitido no cuenta)", () => {
    expect(contarElementos('<iframe src="https://malo.example/x"></iframe>').iframe).toBe(0);
    expect(avisoDePerdidas('<iframe src="https://malo.example/x"></iframe>', "")).toBeNull();
  });
});
