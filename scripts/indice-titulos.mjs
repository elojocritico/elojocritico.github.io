// Indice de titulos para el buscador del panel: indices/titulos = { direccion: titulo } (todos menos la papelera).
// Lo comparten el exportador y el importador para que tengan siempre la misma forma.
const esTexto = (v) => typeof v === "string";

/** Titulo que va al indice para un articulo (o null si no debe estar: papelera o sin titulo). */
export function tituloParaIndice(d) {
  return d && d.estado !== "papelera" && esTexto(d.titulo) && d.titulo.trim() ? d.titulo.trim() : null;
}

/** Quita del indice las entradas que no son validas (direcciones reservadas o con "/", titulos que no son texto). */
export function limpiarIndice(titulos) {
  for (const id of Object.keys(titulos)) if (/^__.*__$/.test(id) || id.includes("/") || !esTexto(titulos[id])) delete titulos[id];
  return titulos;
}
