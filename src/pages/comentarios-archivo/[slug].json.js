// El panel lee de aquí los comentarios del archivo de un artículo (con los ocultos incluidos, para poder volver a mostrarlos).
import { comentariosArchivoTodos, slugsComentariosArchivo } from "../../lib/contenido";
export function getStaticPaths() {
  return slugsComentariosArchivo().map((slug) => ({ params: { slug } }));
}
export function GET({ params }) {
  return new Response(JSON.stringify(comentariosArchivoTodos(params.slug)), { headers: { "Content-Type": "application/json" } });
}
