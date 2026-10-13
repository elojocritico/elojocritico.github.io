import type { ReactNode } from "react";

/** Explicacion corta y plegable, para no llenar la pantalla. */
export function Ayuda({ titulo = "¿Necesitas ayuda?", children }: { titulo?: string; children: ReactNode }) {
  return (
    <details className="ayuda">
      <summary>{titulo}</summary>
      <div>{children}</div>
    </details>
  );
}
