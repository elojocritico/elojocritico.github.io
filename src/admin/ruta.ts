import { useEffect, useState } from "react";

export type Ruta = { pantalla: string; id?: string };

/** "#/editar/abc" -> { pantalla: "editar", id: "abc" }; vacio -> inicio. */
export function leerRuta(hash: string): Ruta {
  const partes = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (partes.length === 0) return { pantalla: "inicio" };
  return partes[1] ? { pantalla: partes[0], id: partes[1] } : { pantalla: partes[0] };
}

export function irA(destino: string) {
  window.location.hash = destino.startsWith("#") ? destino : "#/" + destino.replace(/^\//, "");
}

export function usarRuta(): Ruta {
  const [ruta, setRuta] = useState<Ruta>(() => leerRuta(window.location.hash));
  useEffect(() => {
    const alCambiar = () => setRuta(leerRuta(window.location.hash));
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);
  return ruta;
}
