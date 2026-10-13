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

/** Decide si se puede salir de la pantalla actual hacia `destino` (un hash, p. ej. "#/articulos"). `true` = adelante. */
export type Bloqueador = (destino: string) => boolean | Promise<boolean>;

let bloqueador: Bloqueador | null = null;
let hashAceptado: string | null = null;

/**
 * Registra una función que puede impedir el cambio de pantalla (por ejemplo, con cambios sin guardar).
 * Si devuelve false, la dirección se restaura sin añadir nada al historial y la pantalla no cambia.
 * Si devuelve una promesa, también se restaura y, si luego resuelve a true, se navega al destino.
 * Devuelve la función que lo quita.
 */
export function bloquearNavegacion(fn: Bloqueador): () => void {
  bloqueador = fn;
  return () => {
    if (bloqueador === fn) bloqueador = null;
  };
}

/** Avisa al router de que la dirección se ha cambiado a propósito sin cambiar de pantalla (p. ej. con replaceState). */
export function sincronizarHash() {
  hashAceptado = window.location.hash;
}

export function usarRuta(): Ruta {
  const [ruta, setRuta] = useState<Ruta>(() => leerRuta(window.location.hash));
  useEffect(() => {
    hashAceptado = window.location.hash;
    const aceptar = (hash: string) => {
      hashAceptado = hash;
      setRuta(leerRuta(hash));
    };
    const alCambiar = () => {
      const nuevo = window.location.hash;
      if (nuevo === hashAceptado) return;
      const permiso = bloqueador ? bloqueador(nuevo) : true;
      if (permiso === true) return aceptar(nuevo);
      // Bloqueado: se vuelve a la dirección anterior reemplazándola (sin crear otra entrada en el historial).
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + (hashAceptado ?? ""));
      if (typeof permiso !== "boolean") {
        void permiso.then((ok) => {
          if (!ok) return;
          window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + nuevo);
          aceptar(nuevo);
        });
      }
    };
    window.addEventListener("hashchange", alCambiar);
    return () => {
      window.removeEventListener("hashchange", alCambiar);
      hashAceptado = null;
    };
  }, []);
  return ruta;
}
