import { videos } from "../../lib/medios";
import { paginaDe } from "../../lib/medios-paginas";
export function GET() {
  const datos = videos().map((x, i) => ({ t: x.titulo, u: `${paginaDe("videos", i)}#v-${x.id}`, f: x.fecha ?? "" }));
  return new Response(JSON.stringify(datos), { headers: { "Content-Type": "application/json" } });
}
