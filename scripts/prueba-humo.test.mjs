import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { articuloDePrueba, comprobarUrls, urlsDePrueba } from "./prueba-humo.mjs";

function montar() {
  const raiz = mkdtempSync(join(tmpdir(), "eoch-"));
  const dist = join(raiz, "dist"), arts = join(raiz, "contenido", "articulos");
  mkdirSync(arts, { recursive: true });
  mkdirSync(join(dist, "b-articulo"), { recursive: true });
  writeFileSync(join(arts, "a-sin-pagina.json"), "{}");
  writeFileSync(join(arts, "b-articulo.json"), "{}");
  writeFileSync(join(dist, "b-articulo", "index.html"), "x");
  return { dist, arts };
}
const sinEspera = { dormir: async () => {}, log: () => {} };

it("elige el primer artículo que sí tiene página en dist", () => {
  const { dist, arts } = montar();
  expect(articuloDePrueba(dist, arts)).toBe("b-articulo");
  expect(articuloDePrueba(dist, join(arts, "no-existe"))).toBeNull();
});
it("direcciones: portada, un artículo, /revista/ y /admin/, sin barras dobles", () => {
  const { dist, arts } = montar();
  expect(urlsDePrueba("https://elojocritico.github.io/", dist, arts)).toEqual({
    urls: ["https://elojocritico.github.io/", "https://elojocritico.github.io/b-articulo/", "https://elojocritico.github.io/revista/", "https://elojocritico.github.io/admin/"],
    hayArticulo: true,
  });
  const sin = urlsDePrueba("", dist, join(arts, "no-existe"));
  expect(sin.hayArticulo).toBe(false);
  expect(sin.urls).toEqual(["https://elojocritico.github.io/", "https://elojocritico.github.io/revista/", "https://elojocritico.github.io/admin/"]);
});
it("reintenta hasta que la propagación termina", async () => {
  const llamadas = [];
  const traer = async (u) => { llamadas.push(u); return { status: llamadas.length <= 2 ? 404 : 200 }; };
  expect(await comprobarUrls(["https://x/a/"], { traer, intentos: 5, ...sinEspera })).toEqual([]);
  expect(llamadas).toHaveLength(3);
});
it("si tras todos los intentos alguna no da 200, la devuelve con el motivo; las demás no se repiten", async () => {
  const llamadas = [];
  const traer = async (u) => { llamadas.push(u); if (u.endsWith("/malo/")) throw new Error("red caída"); return { status: u.endsWith("/roto/") ? 500 : 200 }; };
  const fallos = await comprobarUrls(["https://x/", "https://x/roto/", "https://x/malo/"], { traer, intentos: 3, ...sinEspera });
  expect(fallos).toEqual([{ url: "https://x/roto/", motivo: "HTTP 500" }, { url: "https://x/malo/", motivo: "red caída" }]);
  expect(llamadas.filter((u) => u === "https://x/")).toHaveLength(1);
  expect(llamadas.filter((u) => u === "https://x/roto/")).toHaveLength(3);
});
