import type { ReactNode, Ref } from "react";

export function Aviso({ tipo = "info", children, id, ref }: { tipo?: "info" | "error" | "ok"; children: ReactNode; id?: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <div id={id} ref={ref} tabIndex={-1} className={`aviso aviso-${tipo}`} role={tipo === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
