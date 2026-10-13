// El manual (MANUAL.md) no puede separarse de la pantalla real: cada texto entre « » tiene que existir en src/admin.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { leerManual } from "./utiles/markdown";

const RAIZ = resolve(__dirname, "../..");
const md = readFileSync(join(RAIZ, "MANUAL.md"), "utf-8");
const manual = leerManual(md);

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return fuentes(p);
    return /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}
// Solo código (.ts/.tsx) y sin comentarios: un texto que solo aparezca en un comentario no cuenta como interfaz.
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const codigo = fuentes(__dirname).map((p) => sinComentarios(readFileSync(p, "utf-8"))).join("\n");

const REQUERIDAS = [
  "Entrar", "Escribir y publicar", "Programar", "Editar y deshacer (historial)", "Papelera", "Comentarios", "Publicar cambios",
  "El semáforo", "Si llega un correo de aviso", "Dar acceso a otra persona", "Cambiar a la copia de Cloudflare",
];

describe("MANUAL.md", () => {
  it("tiene todas las secciones pedidas, cada una con su dirección", () => {
    const titulos = manual.secciones.map((s) => s.titulo);
    for (const t of REQUERIDAS) expect(titulos, t).toContain(t);
    for (const s of manual.secciones) expect(s.id, s.titulo).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(new Set(manual.secciones.map((s) => s.id)).size).toBe(manual.secciones.length);
    expect(manual.secciones.at(-1)!.titulo).toBe("Para la persona técnica");
  });

  it("las secciones que se completan en el plan 4 lo dicen claramente", () => {
    for (const t of ["Si llega un correo de aviso", "Cambiar a la copia de Cloudflare"]) {
      const s = manual.secciones.find((x) => x.titulo === t)!;
      expect(JSON.stringify(s.bloques)).toContain("Esta sección se completará cuando la web esté publicada");
    }
  });

  it("cada texto entre « » existe en la interfaz del panel", () => {
    const citas = [...md.matchAll(/«([^»]+)»/g)].map((m) => m[1]);
    expect(citas.length).toBeGreaterThan(80);
    const faltan = [...new Set(citas)].filter((c) => !codigo.includes(c));
    expect(faltan).toEqual([]);
  });

  it("fuera de la parte técnica no usa jerga", () => {
    const usuarioFinal = manual.secciones.filter((s) => s.id !== "tecnica");
    const texto = JSON.stringify([manual.intro, usuarioFinal]).toLowerCase();
    for (const palabra of ["slug", "deploy", "build", "commit", "firestore", "repositorio", "github", "git "]) {
      expect(texto, palabra).not.toContain(palabra);
    }
  });

  it("la parte técnica cubre los comandos con --real, la exportación en dos pasos, las reglas y el historial de git", () => {
    const t = JSON.stringify(manual.secciones.find((s) => s.id === "tecnica")!.bloques);
    for (const x of ["crear-admin", "importar", "exportar", "--real", "--sin-confirmar", "--confirmar", "npm run simulador", "firestore.rules", "git filter-repo"]) {
      expect(t, x).toContain(x);
    }
  });

  it("avisa de que un comentario oculto sigue en versiones antiguas de la web", () => {
    const t = JSON.stringify(manual.secciones.find((s) => s.id === "comentarios")!.bloques);
    expect(t).toContain("versiones anteriores");
  });
});
