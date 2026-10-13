import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { elegirPortada, imagenesDelCuerpo, leerAncho, variante640, esPequena, tieneFotosPerdidas, quitarMarcasPerdidas, portadaDe, NOTA_FOTOS_PERDIDAS } from "./fotos";

const anchos: Record<string, number> = {
  "/img/a/chica.webp": 300, "/img/a/chica-640.webp": 300, "/img/a/grande.webp": 1200, "/img/a/grande-640.webp": 640,
  "/img/a/media.webp": 800, "/img/a/otra.webp": 500,
};
const lector = (r: string) => anchos[r] ?? null;
const p = (src: string) => ({ src, tarjeta: variante640(src), alt: "x" });

describe("elegirPortada", () => {
  it("deja la portada si es ancha", () => {
    const r = elegirPortada(p("/img/a/grande.webp"), '<img src="/img/a/media.webp">', lector)!;
    expect(r.src).toBe("/img/a/grande.webp");
    expect(r.sustituida).toBe(false);
    expect(r.anchoSrc).toBe(1200);
  });
  it("usa la foto más ancha del cuerpo si la portada es pequeña", () => {
    const r = elegirPortada(p("/img/a/chica.webp"), '<img src="/img/a/otra.webp"><img alt="" src="/img/a/grande.webp"><img src="/img/a/media.webp">', lector)!;
    expect(r.src).toBe("/img/a/grande.webp");
    expect(r.tarjeta).toBe("/img/a/grande-640.webp");
    expect(r.anchoTarjeta).toBe(640);
    expect(r.alt).toBe("x");
    expect(r.sustituida).toBe(true);
  });
  it("sin portada usa la mejor del cuerpo; sin nada, null", () => {
    expect(elegirPortada(null, '<img src="/img/a/media.webp">', lector)!.src).toBe("/img/a/media.webp");
    expect(elegirPortada(null, "<p>hola</p>", lector)).toBeNull();
  });
  it("no sustituye si la del cuerpo no es más ancha, ni si no hay archivos (comportamiento actual)", () => {
    expect(elegirPortada(p("/img/a/chica.webp"), '<img src="/img/a/otra.webp">', (r) => (r === "/img/a/chica.webp" ? 700 : 500))!.sustituida).toBe(false);
    const r = elegirPortada(p("/img/a/chica.webp"), '<img src="/img/a/grande.webp">', () => null)!;
    expect(r.src).toBe("/img/a/chica.webp");
    expect(r.anchoSrc).toBeNull();
  });
  it("ignora fotos del cuerpo que no están en /img/", () => {
    expect(imagenesDelCuerpo('<img src="https://x.com/a.jpg"><img class="izq" src="/img/b/c.webp" width="3"><img src="/img/b/c.webp">')).toEqual(["/img/b/c.webp"]);
  });
});

describe("esPequena", () => {
  it("compara con el umbral y tolera ancho desconocido", () => {
    expect(esPequena(300, 400)).toBe(true);
    expect(esPequena(400, 400)).toBe(false);
    expect(esPequena(null, 400)).toBe(false);
  });
});

describe("marcas de foto perdida", () => {
  it("detecta la marca (con o sin data-original) y nada más", () => {
    expect(tieneFotosPerdidas('<p>a</p><span class="img-perdida">Imagen no recuperada</span>')).toBe(true);
    expect(tieneFotosPerdidas('<span class="img-perdida" data-original="/wp-content/x.jpg">Imagen no recuperada</span>')).toBe(true);
    expect(tieneFotosPerdidas("<p>sin marcas</p>")).toBe(false);
    expect(tieneFotosPerdidas("<p>img-perdida</p>")).toBe(false);
  });
  it("la nota es el texto acordado", () => {
    expect(NOTA_FOTOS_PERDIDAS).toBe("Algunas imágenes de este artículo no se han podido recuperar.");
  });
});

describe("leerAncho (disco real)", () => {
  const dir = mkdtempSync(join(tmpdir(), "eoc-img-"));
  const antes = process.env.EOC_IMAGENES;
  afterEach(() => { process.env.EOC_IMAGENES = antes; if (antes === undefined) delete process.env.EOC_IMAGENES; });
  it("lee el ancho de un webp, y devuelve null si falta el archivo o la carpeta", async () => {
    mkdirSync(join(dir, "2020", "01"), { recursive: true });
    writeFileSync(join(dir, "2020", "01", "f.webp"), await sharp({ create: { width: 321, height: 50, channels: 3, background: "#888" } }).webp().toBuffer());
    process.env.EOC_IMAGENES = dir;
    expect(leerAncho("/img/2020/01/f.webp")).toBe(321);
    expect(leerAncho("/img/2020/01/no.webp")).toBeNull();
    expect(leerAncho("/img/../../etc/x.webp")).toBeNull();
    process.env.EOC_IMAGENES = join(dir, "no-existe");
    expect(leerAncho("/img/2020/01/f.webp")).toBeNull();
    expect(portadaDe({ slug: "zz", portada: p("/img/2020/01/f.webp"), cuerpoHtml: "" })!.anchoSrc).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("quitarMarcasPerdidas", () => {
  const M = '<span class="img-perdida" data-original="/wp-content/uploads/2014/12/a.jpg">Imagen no recuperada</span>';
  it("sin marcas devuelve el HTML tal cual", () => {
    const h = "<p>hola</p><p></p>";
    expect(quitarMarcasPerdidas(h)).toBe(h);
  });
  it("quita la marca y su texto, pero deja el resto del párrafo", () => {
    expect(quitarMarcasPerdidas(`<p>Antes ${M} después</p>`)).toBe("<p>Antes  después</p>");
    expect(quitarMarcasPerdidas(`<p>${M}</p><p>texto</p>`)).toBe("<p>texto</p>");
    expect(quitarMarcasPerdidas('<p><span class="img-perdida">Imagen no recuperada</span></p>x')).toBe("x");
  });
  it("quita lo que queda vacío: párrafos, figuras con pie vacío, enlaces y énfasis anidados", () => {
    expect(quitarMarcasPerdidas(`<figure class="centro">${M}<figcaption></figcaption></figure><p>a</p>`)).toBe("<p>a</p>");
    expect(quitarMarcasPerdidas(`<p><em><a href="/x">${M}</a></em><br></p><p>b</p>`)).toBe("<p>b</p>");
    expect(quitarMarcasPerdidas(`<figure><img src="/img/a.webp" alt=""><figcaption>${M}</figcaption></figure>`)).toBe('<figure><img src="/img/a.webp" alt=""></figure>');
  });
  it("no toca vacíos que no tienen que ver con una marca", () => {
    expect(quitarMarcasPerdidas(`<p></p><p>${M}</p><p>&nbsp;</p>`)).toBe("<p></p><p>&nbsp;</p>");
  });
  it("el texto de la marca no sobrevive en ningún caso", () => {
    expect(quitarMarcasPerdidas(`<p>${M}${M}</p><div>${M}</div>`)).not.toContain("no recuperada");
  });
});
