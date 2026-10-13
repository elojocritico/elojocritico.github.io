import { useEffect, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Boton } from "../componentes/Boton";
import { Cargando } from "../componentes/Cargando";
import { Ayuda } from "../componentes/Ayuda";
import { calcularSemaforo, type Color } from "../semaforo";
import { irA } from "../ruta";
import type { Papel } from "../sesion";

const TEXTO_COLOR: Record<Color, string> = { verde: "Todo en orden", amarillo: "Hace unos días", rojo: "Revisar", gris: "Aún no hay datos" };

function fechaCorta(ms: number | null) {
  return ms === null ? "" : new Date(ms).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export function Inicio({ usuario, papel }: { usuario: User; papel: Papel }) {
  const [estado, setEstado] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [noConsultable, setNoConsultable] = useState(false);

  useEffect(() => {
    if (!db) return;
    let vigente = true;
    getDoc(doc(db, "estado", "sistema"))
      .then((d) => vigente && setEstado(d.exists() ? d.data() : null))
      .catch(() => {
        if (!vigente) return;
        setNoConsultable(true);
        setEstado(null);
      });
    // Unica escucha en tiempo real del panel: el contador de comentarios pendientes.
    const cancelar = onSnapshot(
      query(collection(db, "comentarios"), where("estado", "==", "pendiente")),
      (s) => setPendientes(s.size),
      () => setPendientes(null),
    );
    return () => {
      vigente = false;
      cancelar();
    };
  }, []);

  const puntos = calcularSemaforo(estado, Date.now());
  const hayDatos = puntos.some((p) => p.color !== "gris");
  const publicarPendiente = estado?.publicarPendiente === true;
  const nombre = (usuario.email ?? "").split("@")[0];

  return (
    <main className="pantalla-inicio">
      <header className="barra">
        <h1>Hola, {nombre}</h1>
        <Boton onClick={() => auth && signOut(auth)}>Salir</Boton>
      </header>
      <p className="papel">{papel === "admin" ? "Administrador" : "Editor"}</p>

      <nav className="botones-grandes" aria-label="Qué quieres hacer">
        <Boton variante="principal" className="grande" onClick={() => irA("nuevo")}>
          Escribir artículo
        </Boton>
        <Boton className="grande" onClick={() => irA("articulos")}>
          Mis artículos
        </Boton>
        <Boton className="grande" onClick={() => irA("comentarios")}>
          Comentarios pendientes{pendientes !== null && <span className="contador">{` (${pendientes})`}</span>}
        </Boton>
        <Boton className="grande" onClick={() => irA("publicar")}>
          Publicar cambios{estado !== undefined && <span className="contador">{publicarPendiente ? " (hay cambios)" : " (al día)"}</span>}
        </Boton>
      </nav>

      <section className="semaforo" aria-label="Estado de la web">
        <h2>Estado de la web</h2>
        {estado === undefined ? (
          <Cargando />
        ) : !hayDatos ? (
          <p className="punto">
            <span className="luz luz-gris" aria-hidden="true" /> {noConsultable ? "No se puede consultar" : "Aún no hay datos"}
          </p>
        ) : (
          <ul>
            {puntos.map((p) => (
              <li key={p.campo} className="punto">
                <span className={`luz luz-${p.color}`} aria-hidden="true" />
                <strong>{p.nombre}</strong>: {p.fecha ? fechaCorta(p.fecha) : "Aún no hay datos"} <span className="meta">{TEXTO_COLOR[p.color]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Ayuda>Los cambios que guardes no se ven en la web hasta que pulses «Publicar cambios».</Ayuda>
    </main>
  );
}
