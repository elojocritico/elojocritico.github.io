import type { ComponentProps, ReactNode } from "react";

type Props = ComponentProps<"button"> & { variante?: "principal" | "secundario" | "peligro"; children: ReactNode };

export function Boton({ variante = "secundario", className = "", children, ...resto }: Props) {
  return (
    <button type="button" className={`boton boton-${variante} ${className}`.trim()} {...resto}>
      {children}
    </button>
  );
}
