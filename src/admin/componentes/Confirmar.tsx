import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Boton } from "./Boton";

type Props = {
  titulo: string;
  children?: ReactNode;
  textoSi?: string;
  textoNo?: string;
  peligro?: boolean;
  /** Mientras la acción está en marcha, el botón de confirmar no se puede volver a pulsar. */
  ocupado?: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
};

const ENFOCABLES = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana de confirmacion para cualquier accion que no se pueda deshacer.
 * Mantiene el foco dentro mientras esta abierta, se cierra con Escape y devuelve el foco a donde estaba.
 */
export function Confirmar({ titulo, children, textoSi = "Sí, continuar", textoNo = "No, cancelar", peligro, ocupado, alConfirmar, alCancelar }: Props) {
  const dialogo = useRef<HTMLDivElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const botonNo = useRef<HTMLButtonElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    // Si hay un campo en el contenido (p. ej. una lista), se empieza por el; si no, por "No", la opcion segura.
    const primero = contenido.current?.querySelector<HTMLElement>(ENFOCABLES);
    (primero ?? botonNo.current)?.focus();
    return () => anterior?.focus?.();
  }, []);

  const alPulsar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      alCancelar();
      return;
    }
    if (e.key !== "Tab") return;
    const lista = Array.from(dialogo.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? []);
    if (lista.length === 0) return e.preventDefault();
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || !dialogo.current?.contains(activo))) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && (activo === ultimo || !dialogo.current?.contains(activo))) {
      e.preventDefault();
      primero.focus();
    }
  };

  return (
    <div className="velo">
      <div ref={dialogo} className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby={idTitulo} onKeyDown={alPulsar}>
        <h2 id={idTitulo}>{titulo}</h2>
        <div ref={contenido}>{children}</div>
        <div className="fila-botones">
          <Boton ref={botonNo} variante="secundario" onClick={alCancelar}>
            {textoNo}
          </Boton>
          <Boton variante={peligro ? "peligro" : "principal"} disabled={ocupado} onClick={alConfirmar}>
            {textoSi}
          </Boton>
        </div>
      </div>
    </div>
  );
}
