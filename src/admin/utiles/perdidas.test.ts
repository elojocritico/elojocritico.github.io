import { describe, it, expect } from "vitest";
import { avisoDePerdidas, contarElementos, contarFotosPendientes } from "./perdidas";

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

  describe("fotos pendientes", () => {
    const marca = (n: string) => `<span class="img-perdida" data-original="/wp-content/uploads/2014/12/${n}.jpg">Imagen no recuperada</span>`;
    it("cuenta las marcas del texto", () => {
      expect(contarFotosPendientes(`<p>${marca("a")} y ${marca("b")}</p>`)).toBe(2);
      expect(contarFotosPendientes("<p>nada</p>")).toBe(0);
    });
    it("poner una foto en lugar de una marca no avisa de ninguna pérdida", () => {
      const antes = `<p>${marca("a")}</p>`;
      expect(avisoDePerdidas(antes, '<p><img src="https://res.cloudinary.com/x/a.jpg" alt="a"></p>')).toBeNull();
    });
    it("con dos marcas y una sola foto nueva, avisa de la que falta", () => {
      const antes = `<p>${marca("a")}${marca("b")}</p>`;
      expect(avisoDePerdidas(antes, '<p><img src="https://res.cloudinary.com/x/a.jpg" alt="a"></p>')).toMatch(/1 aviso de «imagen no recuperada»/);
    });
    it("borrar una marca sin poner foto sigue avisando; una foto nueva que no sustituye nada no evita avisar de otras pérdidas", () => {
      expect(avisoDePerdidas(`<p>${marca("a")}</p>`, "<p>x</p>")).toMatch(/1 aviso/);
      expect(avisoDePerdidas(`${ivoox}`, '<img src="https://res.cloudinary.com/x/a.jpg" alt="a">')).toMatch(/vídeo/);
    });
  });
});
