import { Boton } from "./Boton";
import { irA } from "../ruta";

/** Botón «?» de cada pantalla: abre la parte del manual que habla de ella (#/ayuda/<sección>). */
export function BotonAyuda({ seccion }: { seccion: string }) {
  return (
    <Boton className="boton-ayuda" aria-label="Ayuda sobre esta pantalla" title="Ayuda sobre esta pantalla" onClick={() => irA("ayuda/" + seccion)}>
      ?
    </Boton>
  );
}
