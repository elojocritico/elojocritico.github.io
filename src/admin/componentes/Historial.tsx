import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { listarVersiones, type Version } from "../datos/guardar";
import { NOMBRE_ESTADO } from "../datos/articulos";
import { mensajeDeError } from "../mensajes";
import { fechaHoraLlana } from "../utiles/fechas";
import { Aviso } from "./Aviso";
import { Boton } from "./Boton";
import { Cargando } from "./Cargando";

type Props = {
  db: Firestore;
  id: string;
  /** Cambia cada vez que se guarda, para volver a pedir la lista. */
  version: number;
  alVolver: (v: Version) => void;
  alCerrar: () => void;
};

/** Lista de versiones anteriores del artículo (cada guardado crea una). */
export function Historial({ db, id, version, alVolver, alCerrar }: Props) {
  const [lista, setLista] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setLista(null);
    setError(null);
    listarVersiones(db, id)
      .then((v) => vigente && setLista(v))
      .catch((e) => vigente && setError(mensajeDeError(e)));
    return () => {
      vigente = false;
    };
  }, [db, id, version]);

  return (
    <section className="historial" aria-label="Historial de versiones">
      <div className="barra">
        <h2>Historial</h2>
        <Boton onClick={alCerrar}>Cerrar el historial</Boton>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!error && lista === null && <Cargando />}
      {lista && lista.length === 0 && <p>Todavía no hay versiones anteriores. Cada vez que guardes, se conservará una copia de cómo estaba el artículo.</p>}
      {lista && lista.length > 0 && (
        <ul className="lista-versiones">
          {lista.map((v) => (
            <li key={v.id}>
              <div>
                <strong>{fechaHoraLlana(v.actualizadoEn || v.guardadoEn) || "Fecha desconocida"}</strong>
                <span> · {v.actualizadoPor || v.guardadoPor || "autor desconocido"} · {NOMBRE_ESTADO[v.estado] ?? v.estado}</span>
                <div className="meta-articulo">{v.titulo || "(Sin título)"}</div>
              </div>
              <Boton onClick={() => alVolver(v)}>Volver a esta versión</Boton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
