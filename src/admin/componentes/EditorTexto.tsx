// Editor de texto del artículo. Adaptado de Clave 45 (RichTextEditor.tsx) con TipTap 3:
// títulos, negrita, cursiva, cita, listas, enlace, foto y vídeo de YouTube.
import { useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import { sanear, urlSegura } from "../../lib/sanear";
import { subirImagen, ErrorSubida } from "../subirImagen";

type Props = {
  /** Texto con el que arranca el editor. Para cambiarlo desde fuera hay que volver a montar el componente (cambiar su `key`). */
  inicial: string;
  alCambiar: (html: string) => void;
  /** Mensajes para la persona: avisos de modo de prueba o errores al subir fotos. */
  alAviso: (mensaje: string, tipo: "info" | "error") => void;
};

export function EditorTexto({ inicial, alCambiar, alAviso }: Props) {
  const archivo = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false, underline: false, code: false, codeBlock: false, strike: false,
      }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, protocols: ["http", "https", "mailto"] }),
      Underline,
      Image.configure({ inline: false }),
      Youtube.configure({ nocookie: true, controls: true, width: 560, height: 315 }),
      Placeholder.configure({ placeholder: "Escribe aquí tu artículo…" }),
    ],
    content: inicial,
    shouldRerenderOnTransaction: true,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "cuerpo texto-editable", role: "textbox", "aria-multiline": "true", "aria-label": "Texto del artículo" },
      // Lo que se pega (de Word o de otra web) pasa por el mismo saneado que la web publicada.
      transformPastedHTML: (html) => sanear(html),
    },
    onUpdate: ({ editor: e }) => alCambiar(e.getHTML()),
  });

  if (!editor) return <p className="cargando">Cargando el editor…</p>;

  const enlace = () => {
    const anterior = (editor.getAttributes("link").href as string) ?? "";
    const url = window.prompt("¿A qué dirección lleva el enlace? (déjalo vacío para quitarlo)", anterior || "https://");
    if (url === null) return;
    const limpia = url.trim();
    if (limpia === "" || limpia === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!urlSegura(limpia)) return alAviso("Ese enlace no es válido. Debe empezar por http://, https:// o mailto:", "error");
    editor.chain().focus().extendMarkRange("link").setLink({ href: limpia }).run();
  };

  const video = () => {
    const url = window.prompt("Pega la dirección del vídeo de YouTube");
    if (!url?.trim()) return;
    if (!editor.commands.setYoutubeVideo({ src: url.trim() })) alAviso("Esa dirección no parece un vídeo de YouTube.", "error");
  };

  async function alElegirFoto(f: File | undefined) {
    if (archivo.current) archivo.current.value = "";
    if (!f) return;
    try {
      const r = await subirImagen(f);
      const alt = window.prompt("Describe la foto en pocas palabras (para quien no la puede ver). Puedes dejarlo vacío.") ?? "";
      editor?.chain().focus().setImage({ src: r.url, alt: alt.trim() }).run();
      if (r.aviso) alAviso(r.aviso, "info");
    } catch (e) {
      alAviso(e instanceof ErrorSubida ? e.message : "No se ha podido subir la foto.", "error");
    }
  }

  return (
    <div className="editor-texto">
      <Barra editor={editor} enlace={enlace} video={video} foto={() => archivo.current?.click()} />
      <EditorContent editor={editor} />
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        hidden
        data-testid="elegir-foto-texto"
        onChange={(e) => alElegirFoto(e.target.files?.[0])}
      />
    </div>
  );
}

function Barra({ editor, enlace, video, foto }: { editor: Editor; enlace: () => void; video: () => void; foto: () => void }) {
  const b = (texto: string, nombre: string, accion: () => void, activo = false) => (
    <button type="button" className={"herr" + (activo ? " activa" : "")} aria-label={nombre} aria-pressed={activo} title={nombre} onMouseDown={(e) => e.preventDefault()} onClick={accion}>
      {texto}
    </button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="barra-herramientas" role="toolbar" aria-label="Formato del texto">
      {b("Título", "Título", () => c().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      {b("Subtítulo", "Subtítulo", () => c().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
      {b("N", "Negrita", () => c().toggleBold().run(), editor.isActive("bold"))}
      {b("C", "Cursiva", () => c().toggleItalic().run(), editor.isActive("italic"))}
      {b("S", "Subrayado", () => c().toggleUnderline().run(), editor.isActive("underline"))}
      {b("Cita", "Cita", () => c().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {b("Lista", "Lista con puntos", () => c().toggleBulletList().run(), editor.isActive("bulletList"))}
      {b("1. 2.", "Lista numerada", () => c().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {b("Enlace", "Enlace", enlace, editor.isActive("link"))}
      {b("Foto", "Insertar foto", foto)}
      {b("Vídeo", "Insertar vídeo de YouTube", video)}
      {b("Deshacer", "Deshacer", () => c().undo().run())}
      {b("Rehacer", "Rehacer", () => c().redo().run())}
    </div>
  );
}
