// Mini lector de Markdown para el manual: títulos, párrafos, listas, negrita, cursiva, código y enlaces.
// Todo se convierte en elementos de React (nunca en HTML en bruto), así que el texto no puede inyectar nada.
import type { ReactNode } from "react";

export type Bloque =
  | { tipo: "h3"; texto: string }
  | { tipo: "p"; texto: string }
  | { tipo: "ul" | "ol"; items: string[] }
  | { tipo: "codigo"; texto: string };

export type SeccionManual = { id: string; titulo: string; bloques: Bloque[] };
export type Manual = { titulo: string; intro: Bloque[]; secciones: SeccionManual[] };

const ITEM_OL = /^\d+\.\s+(.*)$/;
const ITEM_UL = /^[-*]\s+(.*)$/;

/** Convierte líneas de Markdown en bloques. */
export function leerBloques(lineas: string[]): Bloque[] {
  const bloques: Bloque[] = [];
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i];
    if (linea.trim() === "") {
      i++;
      continue;
    }
    if (linea.startsWith("```")) {
      const codigo: string[] = [];
      i++;
      while (i < lineas.length && !lineas[i].startsWith("```")) codigo.push(lineas[i++]);
      i++;
      bloques.push({ tipo: "codigo", texto: codigo.join("\n") });
      continue;
    }
    const h = /^###\s+(.*)$/.exec(linea);
    if (h) {
      bloques.push({ tipo: "h3", texto: h[1].trim() });
      i++;
      continue;
    }
    const lista = ITEM_OL.test(linea) ? ("ol" as const) : ITEM_UL.test(linea.trim()) && !linea.startsWith(" ") ? ("ul" as const) : null;
    if (lista) {
      const regla = lista === "ol" ? ITEM_OL : ITEM_UL;
      const items: string[] = [];
      while (i < lineas.length) {
        const l = lineas[i];
        const m = regla.exec(l.trim());
        if (m && !l.startsWith(" ")) items.push(m[1]);
        else if (l.trim() !== "" && l.startsWith(" ") && items.length) {
          // Una línea con sangría que sigue a un elemento: si es "- ...", va dentro de él (sublista simple); si no, continúa su texto.
          const sub = /^\s+[-*]\s+(.*)$/.exec(l);
          items[items.length - 1] += sub ? "\n• " + sub[1] : " " + l.trim();
        } else break;
        i++;
      }
      bloques.push({ tipo: lista, items });
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() !== "" && !/^(###\s|```)/.test(lineas[i]) && !ITEM_OL.test(lineas[i]) && !(ITEM_UL.test(lineas[i]) && !lineas[i].startsWith(" "))) parrafo.push(lineas[i++].trim());
    bloques.push({ tipo: "p", texto: parrafo.join(" ") });
  }
  return bloques;
}

/** Parte el manual en introducción y secciones (`## Título {#id}`). */
export function leerManual(md: string): Manual {
  const lineas = md.replace(/\r\n?/g, "\n").split("\n");
  let titulo = "";
  const intro: string[] = [];
  const crudas: { id: string; titulo: string; lineas: string[] }[] = [];
  let enFence = false;
  for (const l of lineas) {
    if (l.startsWith("```")) enFence = !enFence;
    const t = !enFence && /^#\s+(.*)$/.exec(l);
    const s = !enFence && /^##\s+(.*?)\s*(?:\{#([\w-]+)\})?\s*$/.exec(l);
    if (t) titulo = t[1].trim();
    else if (s) crudas.push({ id: s[2] ?? "", titulo: s[1].trim(), lineas: [] });
    else (crudas.length ? crudas[crudas.length - 1].lineas : intro).push(l);
  }
  return { titulo, intro: leerBloques(intro), secciones: crudas.map((c) => ({ id: c.id, titulo: c.titulo, bloques: leerBloques(c.lineas) })) };
}

/** Solo se aceptan enlaces web, de correo o internos del panel. */
export function enlaceSeguro(url: string): boolean {
  return /^(https?:\/\/|mailto:|#)/i.test(url.trim());
}

const MARCAS = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;

/** Texto con negrita, cursiva, código y enlaces -> elementos de React. */
export function enLinea(texto: string, clave = "t"): ReactNode[] {
  return texto.split(MARCAS).map((trozo, i) => {
    const k = `${clave}-${i}`;
    if (i % 2 === 0) return trozo;
    if (trozo.startsWith("**")) return <strong key={k}>{enLinea(trozo.slice(2, -2), k)}</strong>;
    if (trozo.startsWith("`")) return <code key={k}>{trozo.slice(1, -1)}</code>;
    if (trozo.startsWith("[")) {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(trozo)!;
      return enlaceSeguro(m[2]) ? (
        <a key={k} href={m[2]} target={m[2].startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer">
          {m[1]}
        </a>
      ) : (
        m[1]
      );
    }
    return <em key={k}>{enLinea(trozo.slice(1, -1), k)}</em>;
  });
}

function Item({ texto, clave }: { texto: string; clave: string }) {
  const [primero, ...sub] = texto.split("\n• ");
  return (
    <li>
      {enLinea(primero, clave)}
      {sub.length > 0 && (
        <ul>
          {sub.map((s, i) => (
            <li key={i}>{enLinea(s, `${clave}-s${i}`)}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function Bloques({ bloques, clave = "b" }: { bloques: Bloque[]; clave?: string }) {
  return (
    <>
      {bloques.map((b, i) => {
        const k = `${clave}${i}`;
        if (b.tipo === "h3") return <h3 key={k}>{enLinea(b.texto, k)}</h3>;
        if (b.tipo === "p") return <p key={k}>{enLinea(b.texto, k)}</p>;
        if (b.tipo === "codigo") return <pre key={k}><code>{b.texto}</code></pre>;
        const Lista = b.tipo === "ol" ? "ol" : "ul";
        return (
          <Lista key={k}>
            {b.items.map((t, j) => (
              <Item key={j} texto={t} clave={`${k}-${j}`} />
            ))}
          </Lista>
        );
      })}
    </>
  );
}
