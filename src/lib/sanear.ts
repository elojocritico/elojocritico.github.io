// Saneado del HTML de los artículos. Misma lista permitida que migracion/eoc_migracion/limpieza.py.
// Lo usan la vista previa del panel y (Tarea 8) el exportador: lo que se ve en la vista previa es lo que se publica.
import sanitizeHtml from "sanitize-html";

const ETIQUETAS = [
  "p", "br", "strong", "b", "em", "i", "u", "a", "img", "blockquote", "ul", "ol", "li",
  "h2", "h3", "h4", "figure", "figcaption", "table", "thead", "tbody", "tr", "td", "th",
  "hr", "sup", "sub", "iframe", "span",
];
const ATRIBUTOS: Record<string, string[]> = {
  a: ["href", "title", "class"],
  span: ["class"],
  img: ["src", "alt", "width", "height", "class", "loading"],
  figure: ["class"],
  iframe: ["src", "width", "height", "allowfullscreen", "loading"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};
const ALINEA: Record<string, string> = { alignleft: "izq", alignright: "der", aligncenter: "centro", izq: "izq", der: "der", centro: "centro" };
const IFRAME_OK = /^https?:\/\/(www\.)?(youtube(-nocookie)?\.com|player\.vimeo\.com|ivoox\.com)\//i;
const ELIMINAR_CON_CONTENIDO = ["script", "style", "noscript", "form", "input", "button", "object", "embed", "textarea", "select", "option"];
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x20\x7f]/g;

/** True si la URL es http(s), mailto, relativa o un ancla. Descarta javascript:, data:, etc. */
export function urlSegura(valor: string | undefined): boolean {
  if (!valor) return false;
  const v = valor.replace(CONTROL, "").toLowerCase();
  return v.startsWith("http:") || v.startsWith("https:") || v.startsWith("mailto:") || v.startsWith("/") || v.startsWith("#") || !v.includes(":");
}

/** Etiqueta inventada que no está permitida: sanitize-html la quita y deja su texto. */
const QUITAR = "x-quitar";

/** Dirección https de un iframe permitido (YouTube, Vimeo, iVoox), o null si no se permite. */
export function srcIframePermitido(src: string | null | undefined): string | null {
  let u = src ?? "";
  if (u.startsWith("//")) u = "https:" + u;
  return IFRAME_OK.test(u) ? aHttps(u) : null;
}

type Atributos = Record<string, string>;
function aHttps(u: string) {
  return /^http:\/\//i.test(u) ? "https://" + u.slice(7) : u;
}

function transformar(tagName: string, attribs: Atributos) {
  let nombre = tagName.toLowerCase();
  let a: Atributos = { ...attribs };
  const clases = (a.class ?? "").split(/\s+/);
  if (nombre === "div" && clases.includes("wp-caption")) nombre = "figure";
  else if (clases.includes("wp-caption-text")) nombre = "figcaption";
  const alinea = clases.map((c) => ALINEA[c]).find(Boolean);
  delete a.class;
  if ((nombre === "img" || nombre === "figure") && alinea) a.class = alinea;
  // Marcas de la migración: enlaces rotos/archivados y "imagen no recuperada" (las clases las filtra allowedClasses).
  if (nombre === "a") {
    const marca = clases.find((c) => c === "roto" || c === "archivado");
    if (marca) a.class = marca;
  }
  if (nombre === "span") {
    if (clases.includes("img-perdida")) a.class = "img-perdida";
    else nombre = QUITAR; // un span suelto no se publica, pero se conserva su texto
  }
  if (nombre === "a" && !urlSegura(a.href)) nombre = QUITAR;
  if (nombre === "img") {
    if (!urlSegura(a.src)) a = {}; // sin dirección válida: se descarta en el filtro de abajo
    else {
      a.src = aHttps(a.src);
      a.loading = "lazy";
    }
  }
  if (nombre === "iframe") {
    if (a.src?.startsWith("//")) a.src = "https:" + a.src;
    if (IFRAME_OK.test(a.src ?? "")) {
      a.src = aHttps(a.src);
      a.loading = "lazy";
    } else a = {};
  }
  // Atributos en orden alfabético, como hace la migración: salida estable.
  return { tagName: nombre, attribs: Object.fromEntries(Object.entries(a).sort(([x], [y]) => (x < y ? -1 : 1))) };
}

const OPCIONES: sanitizeHtml.IOptions = {
  allowedTags: ETIQUETAS,
  allowedAttributes: ATRIBUTOS,
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowedClasses: { img: ["izq", "der", "centro"], figure: ["izq", "der", "centro"], a: ["roto", "archivado"], span: ["img-perdida"] },
  allowProtocolRelative: true,
  nonTextTags: ELIMINAR_CON_CONTENIDO,
  disallowedTagsMode: "discard",
  transformTags: { "*": transformar },
  // Un iframe o una imagen sin dirección permitida no se publican.
  exclusiveFilter: (f) => (f.tag === "iframe" || f.tag === "img") && !f.attribs.src,
};

const PARRAFO_VACIO = /<p>(?:\s|&nbsp;| |<\/?(?:br|strong|b|em|i|u|a|sup|sub)(?:\s[^>]*)?\/?>)*<\/p>/g;

export function sanear(html: string): string {
  if (typeof html !== "string" || !html) return "";
  let salida = sanitizeHtml(html, OPCIONES);
  let antes: string;
  do {
    antes = salida;
    salida = salida.replace(PARRAFO_VACIO, "");
  } while (salida !== antes);
  return salida.trim();
}
