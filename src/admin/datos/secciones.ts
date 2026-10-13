import lista from "../../../contenido/secciones.json";

export type Seccion = { slug: string; nombre: string };
export const SECCIONES: Seccion[] = lista as Seccion[];
export const nombreDeSeccion = (slug: string) => SECCIONES.find((s) => s.slug === slug)?.nombre ?? slug;
