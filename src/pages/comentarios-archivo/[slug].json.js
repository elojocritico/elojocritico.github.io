// El panel lee de aquí los comentarios del archivo de un artículo. Los ocultos van sin texto (solo su número):
// el texto completo sigue en el repositorio, pero no se publica.
import { comentariosArchivoParaPanel, slugsComentariosArchivo } from "../../lib/contenido";
export function getStaticPaths() {
  return slugsComentariosArchivo().map((slug) => ({ params: { slug } }));
}
export function GET({ params }) {
  return new Response(JSON.stringify(comentariosArchivoParaPanel(params.slug)), { headers: { "Content-Type": "application/json" } });
}
