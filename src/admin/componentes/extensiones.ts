// Extensiones de TipTap del editor de artículos. Además de lo que se puede escribir con la barra de herramientas,
// conocen todo lo que tienen los artículos migrados (reproductores, tablas, fotos con pie, notas, marcas de la migración),
// para que abrir y guardar un artículo antiguo no se lo coma en silencio.
import { Node, mergeAttributes } from "@tiptap/core";
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

/** Nombre de la foto original a partir de data-original (último trozo de la ruta); null si no hay. */
export function nombreOriginal(original: unknown): string | null {
  if (typeof original !== "string" || !original) return null;
  const ultimo = original.split("?")[0].split("/").filter(Boolean).pop();
  if (!ultimo) return null;
  try {
    return decodeURIComponent(ultimo);
  } catch {
    return ultimo;
  }
}

/** Texto alternativo por defecto de una foto puesta en lugar de una marca: el nombre original sin la extensión. */
export const altDeOriginal = (original: unknown) => (nombreOriginal(original) ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "");

export type OpcionesFotoPendiente = {
  /** Sube la foto elegida; devuelve su dirección (y un aviso opcional). */
  subir: (f: File) => Promise<{ url: string; aviso?: string }>;
  /** Mensajes para quien edita (aviso de modo de prueba). */
  alAviso?: (mensaje: string, tipo: "info" | "error") => void;
  /** Texto de un error de subida en llano. */
  mensajeDeError?: (e: unknown) => string;
};

/**
 * «Imagen no recuperada»: marca que dejó la migración donde no se pudo rescatar una foto.
 * En el editor es un recuadro «Foto pendiente» que no se puede escribir dentro (un solo bloque), con el botón «Poner foto».
 * Se guarda tal como llegó: <span class="img-perdida" data-original="...">Imagen no recuperada</span>.
 */
export const ImagenPerdida = Node.create<OpcionesFotoPendiente>({
  name: "imagenPerdida",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  priority: 60,
  addOptions() {
    return { subir: async () => { throw new Error("Sin subida"); } };
  },
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
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { class: "img-perdida" }), "Imagen no recuperada"],
  addNodeView() {
    const opciones = this.options;
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span");
      dom.className = "foto-pendiente";
      dom.setAttribute("contenteditable", "false");
      dom.setAttribute("data-foto-pendiente", "");
      const titulo = document.createElement("strong");
      titulo.textContent = "Foto pendiente";
      const nombre = document.createElement("span");
      nombre.className = "foto-pendiente-nombre";
      nombre.textContent = nombreOriginal(node.attrs.original) ?? "sin nombre";
      const mensaje = document.createElement("span");
      mensaje.className = "foto-pendiente-mensaje";
      mensaje.setAttribute("role", "status");
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "foto-pendiente-boton";
      boton.textContent = "Poner foto";
      const archivo = document.createElement("input");
      archivo.type = "file";
      archivo.accept = "image/*";
      archivo.hidden = true;
      archivo.setAttribute("data-testid", "elegir-foto-pendiente");
      dom.append(titulo, nombre, boton, mensaje, archivo);

      let ocupado = false;
      boton.addEventListener("mousedown", (e) => e.preventDefault());
      boton.addEventListener("click", () => { if (!ocupado) archivo.click(); });
      archivo.addEventListener("change", async () => {
        const f = archivo.files?.[0];
        archivo.value = "";
        if (!f || ocupado) return;
        ocupado = true;
        boton.disabled = true;
        boton.textContent = "Subiendo la foto…";
        mensaje.textContent = "";
        try {
          const r = await opciones.subir(f);
          const pos = typeof getPos === "function" ? getPos() : undefined;
          const actual = pos === undefined ? null : editor.state.doc.nodeAt(pos);
          if (pos === undefined || !actual || actual.type.name !== "imagenPerdida") {
            mensaje.textContent = "Esta foto pendiente ya no está en el texto, así que no se ha puesto.";
            return;
          }
          const alt = altDeOriginal(node.attrs.original) || "Foto";
          editor.chain().insertContentAt({ from: pos, to: pos + actual.nodeSize }, { type: "image", attrs: { src: r.url, alt } }).run();
          if (r.aviso) opciones.alAviso?.(r.aviso, "info");
        } catch (e) {
          mensaje.textContent = opciones.mensajeDeError?.(e) ?? (e instanceof Error && e.message ? e.message : "No se ha podido subir la foto.");
        } finally {
          ocupado = false;
          boton.disabled = false;
          boton.textContent = "Poner foto";
        }
      });
      return {
        dom,
        // Los clics y cambios de dentro del recuadro (botón, selector de archivo) son de él, no del editor.
        stopEvent: (ev) => ev.target === boton || ev.target === archivo,
        ignoreMutation: () => true,
      };
    };
  },
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

export function extensionesEditor(fotoPendiente?: OpcionesFotoPendiente) {
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
    fotoPendiente ? ImagenPerdida.configure(fotoPendiente) : ImagenPerdida,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Youtube.configure({ nocookie: true, controls: true, width: 560, height: 315 }),
    Placeholder.configure({ placeholder: "Escribe aquí tu artículo…" }),
  ];
}
