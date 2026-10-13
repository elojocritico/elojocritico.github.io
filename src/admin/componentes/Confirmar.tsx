import type { ReactNode } from "react";
import { Boton } from "./Boton";

type Props = {
  titulo: string;
  children?: ReactNode;
  textoSi?: string;
  textoNo?: string;
  peligro?: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
};

/** Ventana de confirmacion para cualquier accion que no se pueda deshacer. */
export function Confirmar({ titulo, children, textoSi = "Sí, continuar", textoNo = "No, cancelar", peligro, alConfirmar, alCancelar }: Props) {
  return (
    <div className="velo">
      <div className="dialogo" role="alertdialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
        <div className="fila-botones">
          <Boton variante="secundario" onClick={alCancelar}>
            {textoNo}
          </Boton>
          <Boton variante={peligro ? "peligro" : "principal"} onClick={alConfirmar}>
            {textoSi}
          </Boton>
        </div>
      </div>
    </div>
  );
}
