import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "eoc-"));
const art = (slug: string, fecha: string, secciones: string[]) => ({
  slug, titulo: slug.toUpperCase(), subtitulo: "", fecha, autor: "El Ojo Crítico", secciones, etiquetas: [],
  portada: null, extracto: "x", cuerpoHtml: "<p>" + "palabra ".repeat(450) + "</p>", destacado: false, origen: "", enlacesExternos: [],
});
beforeAll(() => {
  mkdirSync(join(dir, "articulos"), { recursive: true });
  mkdirSync(join(dir, "comentarios-archivo"), { recursive: true });
  mkdirSync(join(dir, "paginas"), { recursive: true });
  for (const a of [art("a", "2014-12-28", ["fraudes"]), art("b", "2020-01-01", ["fraudes", "ufologia"]),
                   art("c", "2018-05-05", ["ufologia"]), art("d", "2019-05-05", ["fraudes"])])
    writeFileSync(join(dir, "articulos", a.slug + ".json"), JSON.stringify(a));
  writeFileSync(join(dir, "comentarios-archivo", "a.json"), JSON.stringify([
    { id: "1", autor: "P", fecha: "2014-12-30T20:41", html: "<p>h</p>", respuestaA: null },
    { id: "2", autor: "Q", fecha: "2014-12-31T10:00", html: "<p>r</p>", respuestaA: "1" }]));
  writeFileSync(join(dir, "secciones.json"), JSON.stringify([{ slug: "fraudes", nombre: "Fraudes" }, { slug: "ufologia", nombre: "Ufología" }]));
  writeFileSync(join(dir, "ajustes.json"), JSON.stringify({ destacado: "c", enlaces: [], adsense: { activo: false, cliente: "", bloque: "" } }));
  writeFileSync(join(dir, "paginas", "que-es-eoc.json"), JSON.stringify({ titulo: "Qué es", cuerpoHtml: "<p>x</p>" }));
  process.env.EOC_CONTENIDO = dir;
});

describe("contenido", () => {
  it("ordena por fecha descendente y valida", async () => {
    const c = await import("./contenido");
    expect(c.articulos().map((a) => a.slug)).toEqual(["b", "d", "c", "a"]);
  });
  it("relacionados comparten sección, excluyen el propio y van por fecha", async () => {
    const c = await import("./contenido");
    const todos = c.articulos();
    expect(c.relacionados(c.articulo("a")!, todos).map((a) => a.slug)).toEqual(["b", "d"]);
  });
  it("destacado elegido o el más reciente si no existe", async () => {
    const c = await import("./contenido");
    const todos = c.articulos();
    expect(c.destacado(todos, c.ajustes()).slug).toBe("c");
    expect(c.destacado(todos, { ...c.ajustes(), destacado: "no-existe" }).slug).toBe("b");
  });
  it("fechas de comentarios en hora de España: 23:30 UTC ya es el día siguiente", async () => {
    const c = await import("./contenido");
    expect(c.fechaLargaMadrid("2024-01-31T23:30:00.000Z")).toBe("1 feb 2024"); // invierno: UTC+1
    expect(c.fechaLargaMadrid("2024-06-30T23:30:00.000Z")).toBe("1 jul 2024"); // verano: UTC+2
    expect(c.fechaLargaMadrid("2024-06-30T21:30:00.000Z")).toBe("30 jun 2024");
    expect(c.fechaHoraMadrid("2024-01-31T23:30:00.000Z")).toBe("1 feb 2024, 00:30");
    expect(c.fechaHoraMadrid("2024-06-30T23:30:00.000Z")).toBe("1 jul 2024, 01:30");
    expect(c.fechaLargaMadrid("2014-12-28")).toBe("28 dic 2014"); // sin hora: igual que fechaLarga
    expect(c.fechaHoraMadrid("2014-12-28")).toBe("28 dic 2014");
  });
  it("hayAnuncio exige activo, cliente y bloque", async () => {
    const { hayAnuncio } = await import("./contenido");
    expect(hayAnuncio({ activo: true, cliente: "ca-pub-1234567890123456", bloque: "1234567890" })).toBe(true);
    expect(hayAnuncio({ activo: true, cliente: "ca-pub-1234567890123456", bloque: "" })).toBe(false);
    expect(hayAnuncio({ activo: true, cliente: "", bloque: "1234567890" })).toBe(false);
    expect(hayAnuncio({ activo: false, cliente: "ca-pub-1234567890123456", bloque: "1234567890" })).toBe(false);
  });
  it("árbol de comentarios, años, fecha larga y lectura", async () => {
    const c = await import("./contenido");
    const arbol = c.arbolComentarios(c.comentariosArchivo("a"));
    expect(arbol).toHaveLength(1);
    expect(arbol[0].respuestas[0].id).toBe("2");
    expect(c.comentariosArchivo("b")).toEqual([]);
    expect(c.anios(c.articulos())).toEqual([2020, 2019, 2018, 2014]);
    expect(c.fechaLarga("2014-12-28")).toBe("28 dic 2014");
    expect(c.minutosLectura("<p>" + "palabra ".repeat(450) + "</p>")).toBe(2);
    expect(c.nombreSeccion("ufologia")).toBe("Ufología");
  });
});
