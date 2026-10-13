// Extensiones de TipTap del editor de artículos. Además de lo que se puede escribir con la barra de herramientas,
// conocen todo lo que tienen los artículos migrados (reproductores, tablas, fotos con pie, notas, marcas de la migración),
// para que abrir y guardar un artículo antiguo no se lo coma en silencio.
import { Node, Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { srcIframePermitido } from "../../lib/sanear";

const ALINEA: Record<string, string> = { alignleft: "izq", alignright: "der", aligncenter: "centro", izq: "izq", der: "der", centro: "centro" };
const claseAlinea = (el: HTMLElement) =>
  (el.getAttribute("class") ?? "").split(/\s+/).map((c) => ALINEA[c]).find(Boolean) ?? null;

/** Reproductores incrustados (iVoox, YouTube, Vimeo) tal como vienen en los artículos: <iframe> suelto o dentro de un párrafo. */
export const Reproductor = Node.create({
  name: "reproductor",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  priority: 50,
  addAttributes() {
    const texto = (nombre: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(nombre),
      renderHTML: (a: Record<string, unknown>) => (a[nombre] ? { [nombre]: a[nombre] } : {}),
    });
    return {
      // El src ya viene normalizado (https) desde getAttrs: no se vuelve a leer del HTML original.
      src: { default: null, parseHTML: () => null, renderHTML: (a: Record<string, unknown>) => (a.src ? { src: a.src } : {}) },
      width: texto("width"), height: texto("height"),
      allowfullscreen: {
        default: null,
        parseHTML: (el: HTMLElement) => (el.hasAttribute("allowfullscreen") ? "" : null),
        renderHTML: (a: Record<string, unknown>) => (a.allowfullscreen === null || a.allowfullscreen === undefined ? {} : { allowfullscreen: "" }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "iframe[src]",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          if (e.closest("[data-youtube-video]")) return false; // esos los lee la extensión de YouTube
          const src = srcIframePermitido(e.getAttribute("src"));
          return src ? { src } : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["iframe", mergeAttributes(HTMLAttributes, { loading: "lazy" })];
  },
});

/** <figure> con foto y pie (<figcaption>), con la alineación izq / der / centro. */
export const Figura = Node.create({
  name: "figura",
  group: "block",
  content: "block+ pieDeFoto?",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (el: HTMLElement) => claseAlinea(el),
        renderHTML: (a: Record<string, unknown>) => (a.class ? { class: a.class } : {}),
      },
    };
  },
  parseHTML: () => [{ tag: "figure" }],
  renderHTML: ({ HTMLAttributes }) => ["figure", HTMLAttributes, 0],
});

export const PieDeFoto = Node.create({
  name: "pieDeFoto",
  content: "inline*",
  defining: true,
  parseHTML: () => [{ tag: "figcaption" }],
  renderHTML: ({ HTMLAttributes }) => ["figcaption", HTMLAttributes, 0],
});

/** «Imagen no recuperada»: marca que dejó la migración donde no se pudo rescatar una foto. */
export const ImagenPerdida = Mark.create({
  name: "imagenPerdida",
  inclusive: false,
  // data-original: nombre de la foto original (/wp-content/uploads/...). Se conserva al abrir y guardar; la interfaz para usarlo llega después.
  addAttributes() {
    return {
      original: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-original"),
        renderHTML: (a: Record<string, unknown>) => (a.original ? { "data-original": a.original } : {}),
      },
    };
  },
  parseHTML: () => [{ tag: "span.img-perdida" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { class: "img-perdida" }), 0],
});

/** Foto dentro del texto: en línea (para poder ir dentro de un enlace), con alineación y con fotos pegadas en modo de prueba (data:). */
const Foto = Image.configure({ inline: true, allowBase64: true }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (el: HTMLElement) => claseAlinea(el),
        renderHTML: (a: Record<string, unknown>) => (a.class ? { class: a.class } : {}),
      },
    };
  },
});

/** Enlaces: conserva el título y las marcas «roto» / «archivado» de la migración. */
const Enlace = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      title: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("title"),
        renderHTML: (a: Record<string, unknown>) => (a.title ? { title: a.title } : {}),
      },
      class: {
        default: null,
        parseHTML: (el: HTMLElement) => (el.classList.contains("roto") ? "roto" : el.classList.contains("archivado") ? "archivado" : null),
        renderHTML: (a: Record<string, unknown>) => (a.class ? { class: a.class } : {}),
      },
    };
  },
});

export function extensionesEditor() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: false, underline: false, code: false, codeBlock: false, strike: false,
    }),
    Enlace.configure({ openOnClick: false, autolink: true, linkOnPaste: true, protocols: ["http", "https", "mailto"] }),
    Underline,
    Superscript,
    Subscript,
    Foto,
    Figura,
    PieDeFoto,
    Reproductor,
    ImagenPerdida,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Youtube.configure({ nocookie: true, controls: true, width: 560, height: 315 }),
    Placeholder.configure({ placeholder: "Escribe aquí tu artículo…" }),
  ];
}
