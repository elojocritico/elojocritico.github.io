import type { ReactNode } from "react";

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "error" | "ok"; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
