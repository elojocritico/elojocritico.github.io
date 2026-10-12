export const POR_PAGINA = 24;
export const CANAL_YOUTUBE = "https://www.youtube.com/@eoceoc6437";
export const CANAL_IVOOX = "https://www.ivoox.com/podcast-podcast-el-ojo-critico_sq_f127567_1.html";
/** Ruta de la página donde cae el elemento nº `indice` (0 = el más reciente). */
export const paginaDe = (base: "podcast" | "videos", indice: number) => {
  const n = Math.floor(indice / POR_PAGINA) + 1;
  return n === 1 ? `/${base}/` : `/${base}/${n}/`;
};
