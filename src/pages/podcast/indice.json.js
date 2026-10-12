import { episodios } from "../../lib/medios";
import { paginaDe } from "../../lib/medios-paginas";
export function GET() {
  const datos = episodios().map((x, i) => ({ t: x.titulo, u: `${paginaDe("podcast", i)}#ep-${x.id}`, f: x.fecha ?? "" }));
  return new Response(JSON.stringify(datos), { headers: { "Content-Type": "application/json" } });
}
