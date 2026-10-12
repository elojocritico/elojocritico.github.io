import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ_CONTENIDO } from "./contenido";

export const REVISTA_BASE = "https://laspitesdegrao.github.io/el-ojo-critico/";
export type Numero = { slug: string; numero: string; fecha: string; paginas: number; pdf: string; portada: string; mb: number; indice: { titulo: string; pagina: number }[] };

export function numeros(): Numero[] {
  const lista: Numero[] = JSON.parse(readFileSync(join(RAIZ_CONTENIDO(), "revista.json"), "utf-8"));
  return lista.sort((a, b) => parseInt(b.numero) - parseInt(a.numero));
}
export const urlPdf = (n: Numero) => `${REVISTA_BASE}pdf/${n.pdf}`;
export const urlPortada = (n: Numero) => `${REVISTA_BASE}portadas/${n.portada}`;
export const urlVisor = (n: Numero) => `${REVISTA_BASE}visor/web/viewer.html?file=../../pdf/${n.pdf}`;
