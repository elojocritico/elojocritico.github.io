import { describe, it, expect } from "vitest";
import { sanear } from "./sanear";

describe("sanear: lo peligroso", () => {
  it("quita script, style y su contenido", () => {
    expect(sanear("<p>Hola</p><script>alert(1)</script><style>p{}</style>")).toBe("<p>Hola</p>");
  });
  it("quita onerror, onclick y cualquier atributo on*", () => {
    const s = sanear('<img src="/a.jpg" onerror="alert(1)" alt="x"><p onclick="x()">t</p>');
    expect(s).not.toMatch(/on(error|click)/i);
    expect(s).toContain('<img alt="x" src="/a.jpg" />');
  });
  it("quita enlaces javascript: (también disfrazados) pero conserva el texto", () => {
    for (const h of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " java\tscript:alert(1)", "&#106;avascript:alert(1)", "vbscript:x", "data:text/html,<b>"]) {
      const s = sanear(`<p><a href="${h}">pulsa</a></p>`);
      expect(s, h).toBe("<p>pulsa</p>");
    }
  });
  it("quita imágenes con data: o javascript:", () => {
    expect(sanear('<p>a</p><img src="data:image/png;base64,AAAA">')).toBe("<p>a</p>");
    expect(sanear('<img src="javascript:alert(1)">')).toBe("");
  });
  it("quita iframes de sitios desconocidos y de esquemas raros", () => {
    expect(sanear('<iframe src="https://malo.example/x"></iframe><p>t</p>')).toBe("<p>t</p>");
    expect(sanear('<iframe src="https://www.youtube.com.malo.example/embed/x"></iframe>')).toBe("");
    expect(sanear('<iframe src="javascript:alert(1)"></iframe>')).toBe("");
    expect(sanear('<iframe srcdoc="<script>1</script>"></iframe>')).toBe("");
  });
  it("quita formularios, botones, objetos y su contenido, y los comentarios", () => {
    expect(sanear('<form action="/x"><input name="a"><button>Enviar</button></form><p>ok</p><!-- secreto --><object data="x">o</object><embed src="x">')).toBe("<p>ok</p>");
  });
  it("quita la basura de Word: etiquetas desconocidas, estilos y clases", () => {
    const word = '<p class="MsoNormal" style="margin:0"><span style="font-size:12pt"><o:p></o:p>Texto <b style="x">fuerte</b></span></p><!--[if gte mso 9]><xml>x</xml><![endif]-->';
    expect(sanear(word)).toBe("<p>Texto <b>fuerte</b></p>");
  });
  it("no deja pasar atributos style, class ni id en general", () => {
    expect(sanear('<p style="color:red" class="x" id="y">a</p>')).toBe("<p>a</p>");
  });
});

describe("sanear: lo permitido", () => {
  it("conserva texto con formato, títulos, listas, citas y tablas", () => {
    const html = '<h2>T</h2><p>a <strong>b</strong> <em>c</em> <u>d</u></p><ul><li>x</li></ul><ol><li>y</li></ol><blockquote><p>c</p></blockquote><hr /><table><tbody><tr><td colspan="2">1</td></tr></tbody></table>';
    expect(sanear(html)).toBe(html);
  });
  it("conserva enlaces http, https, mailto, relativos y anclas", () => {
    for (const h of ["http://a.es/x", "https://a.es/x", "mailto:a@b.es", "/pagina/", "#nota", "pagina.html"]) {
      expect(sanear(`<p><a href="${h}" title="t">e</a></p>`)).toBe(`<p><a href="${h}" title="t">e</a></p>`);
    }
  });
  it("quita target y rel de los enlaces", () => {
    expect(sanear('<p><a href="https://a.es" target="_blank" rel="x">e</a></p>')).toBe('<p><a href="https://a.es">e</a></p>');
  });
  it("pasa las imágenes http a https", () => {
    expect(sanear('<img src="http://a.es/f.jpg" alt="x" width="10" height="5">')).toBe('<img alt="x" height="5" src="https://a.es/f.jpg" width="10" />');
  });
  it("conserva los iframes de YouTube, Vimeo e iVoox, los pasa a https y los carga en diferido", () => {
    for (const src of ["https://www.youtube.com/embed/abc", "https://www.youtube-nocookie.com/embed/abc", "https://player.vimeo.com/video/1", "https://www.ivoox.com/player_ej_1.html", "http://www.youtube.com/embed/abc", "//www.youtube.com/embed/abc"]) {
      const s = sanear(`<iframe src="${src}" width="560" height="315" allowfullscreen></iframe>`);
      expect(s, src).toMatch(/^<iframe allowfullscreen(="")? height="315" loading="lazy" src="https:\/\/[^"]+" width="560"><\/iframe>$/);
    }
  });
  it("las clases de alineación se reducen a izq, der y centro", () => {
    expect(sanear('<img class="alignleft size-full" src="/a.jpg">')).toBe('<img class="izq" src="/a.jpg" />');
    expect(sanear('<figure class="aligncenter"><img src="/a.jpg"></figure>')).toBe('<figure class="centro"><img src="/a.jpg" /></figure>');
    expect(sanear('<img class="der" src="/a.jpg">')).toBe('<img class="der" src="/a.jpg" />');
    expect(sanear('<img class="malo" src="/a.jpg">')).toBe('<img src="/a.jpg" />');
  });
  it("convierte los recuadros de pie de foto de WordPress", () => {
    expect(sanear('<div class="wp-caption"><img src="/a.jpg"><p class="wp-caption-text">Pie</p></div>')).toBe('<figure><img src="/a.jpg" /><figcaption>Pie</figcaption></figure>');
  });
  it("elimina párrafos vacíos, salvo los que llevan imagen o vídeo", () => {
    expect(sanear("<p>a</p><p>&nbsp;</p><p> </p><p><br></p><p>b</p>")).toBe("<p>a</p><p>b</p>");
    expect(sanear('<p><img src="/a.jpg"></p>')).toBe('<p><img src="/a.jpg" /></p>');
  });
  it("es idempotente", () => {
    const una = sanear('<p>a <a href="javascript:x">b</a></p><iframe src="http://www.youtube.com/embed/1"></iframe><img src="http://a.es/x.jpg">');
    expect(sanear(una)).toBe(una);
  });
  it("no se rompe con entradas vacías", () => {
    expect(sanear("")).toBe("");
    expect(sanear(undefined as never)).toBe("");
  });
});
