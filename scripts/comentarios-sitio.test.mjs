// Construye la web con un contenido de prueba y comprueba cómo salen los comentarios en la página de un artículo.
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const raiz = mkdtempSync(join(tmpdir(), "eoc-sitio-"));
const cont = join(raiz, "contenido"), salida = join(raiz, "dist");
const art = (slug) => ({
  slug, titulo: "Título " + slug, subtitulo: "", fecha: "2020-01-02", autor: "El Ojo Crítico", secciones: ["fraudes"], etiquetas: [],
  portada: null, extracto: "x", cuerpoHtml: "<p>Cuerpo</p>", destacado: false, origen: "",
});
const escribir = (rel, datos) => {
  mkdirSync(join(cont, rel, ".."), { recursive: true });
  writeFileSync(join(cont, rel), JSON.stringify(datos));
};
const pagina = (slug) => readFileSync(join(salida, slug, "index.html"), "utf-8");

beforeAll(() => {
  for (const s of ["con", "sin"]) escribir(`articulos/${s}.json`, art(s));
  escribir("secciones.json", [{ slug: "fraudes", nombre: "Fraudes" }]);
  escribir("ajustes.json", { destacado: "con", enlaces: [], adsense: { activo: false, cliente: "", bloque: "" } });
  escribir("paginas/que-es-eoc.json", { titulo: "Qué es", cuerpoHtml: "<p>x</p>" });
  for (const f of ["podcast", "videos", "revista", "redirecciones"]) escribir(`${f}.json`, []);
  escribir("comentarios-archivo/con.json", [
    { id: "1", autor: "Visible", fecha: "2014-12-30T20:41", html: "<p>Comentario visible del archivo</p>", respuestaA: null },
    { id: "2", autor: "Oculto", fecha: "2014-12-31T10:00", html: "<p>Comentario oculto del archivo</p>", respuestaA: null },
    { id: "3", autor: "Respuesta", fecha: "2015-01-01T10:00", html: "<p>Respuesta al oculto</p>", respuestaA: "2" },
  ]);
  escribir("archivo-ocultos.json", { con: ["2"], otro: ["9"] });
  escribir("comentarios/con.json", [
    { id: "n1", nombre: "Lector <b>Nuevo</b>", fecha: "2026-10-01T10:00:00.000Z", texto: "Primera línea <script>alert(1)</script>\nSegunda línea" },
  ]);
  execFileSync(process.execPath, ["node_modules/astro/astro.js", "build"], {
    env: { ...process.env, EOC_CONTENIDO: cont, EOC_SALIDA: salida, PUBLIC_FIREBASE_CONFIG: "" },
    stdio: "pipe", timeout: 240000,
  });
}, 300000);

describe("comentarios en la página del artículo", () => {
  it("muestra los aprobados escritos como texto (nunca como HTML), con saltos de línea", () => {
    const h = pagina("con");
    expect(h).toContain("Comentarios de los lectores (1)");
    expect(h).toContain("Lector &lt;b&gt;Nuevo&lt;/b&gt;");
    expect(h).toContain("Primera línea &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(h).not.toContain("<script>alert(1)</script>");
    expect(h).not.toContain("<b>Nuevo</b>");
    expect(h).toMatch(/<p[^>]*>Primera línea[^<]*<\/p><p[^>]*>Segunda línea<\/p>/);
  });

  it("los aprobados van encima de los del archivo", () => {
    const h = pagina("con");
    expect(h.indexOf("Comentarios de los lectores")).toBeLessThan(h.indexOf("Comentarios del archivo"));
  });

  it("no muestra el comentario oculto del archivo, pero sí el resto (la respuesta queda en el nivel principal)", () => {
    const h = pagina("con");
    expect(h).toContain("Comentario visible del archivo");
    expect(h).not.toContain("Comentario oculto del archivo");
    expect(h).toContain("Respuesta al oculto");
    expect(h).toContain("Comentarios del archivo (2)");
  });

  it("el contador de la cabecera suma aprobados y archivo visibles", () => {
    expect(pagina("con")).toContain("3 comentarios");
  });

  it("un artículo sin comentarios no muestra ninguna sección", () => {
    const h = pagina("sin");
    expect(h).not.toContain("Comentarios de los lectores");
    expect(h).not.toContain("Comentarios del archivo");
  });

  it("sin configuración de Firebase no hay botón de escribir comentario", () => {
    expect(pagina("con")).not.toContain("Escribir un comentario");
  });

  it("el panel puede leer los comentarios del archivo completos (con los ocultos) en /comentarios-archivo/", () => {
    expect(existsSync(join(salida, "comentarios-archivo", "con.json"))).toBe(true);
    const todos = JSON.parse(readFileSync(join(salida, "comentarios-archivo", "con.json"), "utf-8"));
    expect(todos.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(readdirSync(join(salida, "comentarios-archivo"))).toEqual(["con.json"]);
  });
});
