import rss from "@astrojs/rss";
import { articulos } from "../lib/contenido";
export function GET(context) {
  return rss({
    title: "El Ojo Crítico",
    description: "Cuadernos de Investigación para Investigadores de Anomalías",
    site: context.site,
    items: articulos().slice(0, 30).map((a) => ({ title: a.titulo, pubDate: new Date(a.fecha), description: a.extracto, link: `/${a.slug}/` })),
  });
}
