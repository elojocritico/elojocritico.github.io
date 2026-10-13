// Prueba de ida y vuelta con artículos migrados de verdad: abrirlos en el editor y sacar el HTML no debe perder nada.
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/react";
import { extensionesEditor } from "./extensiones";
import { sanear } from "../../lib/sanear";
import migrados from "../../lib/fixtures/migrados.json";

const cuenta = (html: string, patron: RegExp) => (html.match(patron) ?? []).length;
const MARCAS: [string, RegExp][] = [
  ["iframe", /<iframe\b/g], ["table", /<table\b/g], ["td/th", /<t[dh]\b/g], ["figure", /<figure\b/g], ["figcaption", /<figcaption\b/g],
  ["img", /<img\b/g], ["sup", /<sup\b/g], ["sub", /<sub\b/g], ["h4", /<h4\b/g], ["h2", /<h2\b/g], ["h3", /<h3\b/g],
  ["span.img-perdida", /<span class="img-perdida"/g], ["a.roto", /<a [^>]*class="roto"/g], ["a.archivado", /<a [^>]*class="archivado"/g],
  ["clase de imagen", /<img [^>]*class="(izq|der|centro)"/g], ["figure con clase", /<figure class="(izq|der|centro)"/g],
  ["enlaces", /<a [^>]*href=/g], ["blockquote", /<blockquote\b/g], ["li", /<li\b/g],
];
const soloTexto = (h: string) => sanear(h).replace(/<[^>]+>/g, "").replace(/&[a-z]+;|\s+/g, "");

function porElEditor(html: string): string {
  const e = new Editor({ extensions: extensionesEditor(), content: html });
  const salida = e.getHTML();
  e.destroy();
  return salida;
}

describe("el editor no se come el contenido migrado", () => {
  for (const [slug, html] of Object.entries(migrados as Record<string, string>)) {
    it(`«${slug}»`, () => {
      const antes = sanear(html);
      const despues = sanear(porElEditor(html));
      for (const [nombre, patron] of MARCAS) expect(cuenta(despues, patron), nombre).toBe(cuenta(antes, patron));
      expect(soloTexto(despues)).toBe(soloTexto(antes));
    });
  }

  it("una foto pegada en modo de prueba (data:) sobrevive", () => {
    const html = '<p><img src="data:image/jpeg;base64,AAAA" alt="x"></p>';
    expect(porElEditor(html)).toContain('src="data:image/jpeg;base64,AAAA"');
  });

  it("los vídeos de YouTube que inserta el propio editor siguen funcionando", () => {
    const e = new Editor({ extensions: extensionesEditor(), content: "<p>a</p>" });
    e.commands.setYoutubeVideo({ src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    const html = sanear(e.getHTML());
    e.destroy();
    expect(html).toMatch(/<iframe [^>]*src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  });

  it("el reproductor conserva la dirección normalizada (https), no la original", () => {
    expect(porElEditor('<p><iframe src="http://www.ivoox.com/player_ej_1.html"></iframe></p>')).toContain('src="https://www.ivoox.com/player_ej_1.html"');
    expect(porElEditor('<iframe src="//www.youtube.com/embed/abc"></iframe>')).toContain('src="https://www.youtube.com/embed/abc"');
  });

  it("un iframe de un sitio no permitido no entra en el editor", () => {
    expect(porElEditor('<p>a</p><iframe src="https://malo.example/x"></iframe>')).not.toContain("iframe");
  });
});
