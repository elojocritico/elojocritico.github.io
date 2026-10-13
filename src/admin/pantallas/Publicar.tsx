import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { Aviso } from "../componentes/Aviso";
import { Ayuda } from "../componentes/Ayuda";
import { Boton } from "../componentes/Boton";
import { BotonAyuda } from "../componentes/BotonAyuda";
import { Cargando } from "../componentes/Cargando";
import { tokenAppCheck } from "../appcheckToken";
import { contarCambios, publicarCambios, type Cuenta } from "../datos/publicar";
import { mensajeDeCambio } from "../mensajes";
import { irA } from "../ruta";

export const MSG_RAPIDO = "Publicando… estará en la web en unos minutos.";
export const MSG_LENTO = "Se publicará en menos de 1 hora.";

type Mensaje = { tipo: "ok" | "error"; texto: string };

export function textoCambios(c: Cuenta): string {
  if (c.nunca) return "Todavía no se ha publicado ningún cambio";
  if (c.cambios === 0) return c.pendiente ? "Hay cambios sin publicar (comentarios o ajustes)" : "No hay cambios sin publicar en la web";
  return c.cambios === 1 ? "1 cambio sin publicar en la web" : `${c.cambios} cambios sin publicar en la web`;
}

export function Publicar({ usuario }: { usuario: User }) {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enCurso = useRef(false);
  const avisoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db) return;
    let vigente = true;
    contarCambios(db)
      .then((c) => vigente && setCuenta(c))
      // Si no se puede contar, el botón sigue funcionando: solo se avisa.
      .catch((e) => vigente && (setFallo(mensajeDeCambio(e)), setCuenta({ nunca: true, cambios: null, pendiente: false })));
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (mensaje) avisoRef.current?.focus();
  }, [mensaje]);

  async function publicar() {
    if (!db || enCurso.current) return; // evita el doble clic antes de que React repinte
    enCurso.current = true;
    setOcupado(true);
    setMensaje(null);
    try {
      const url = (import.meta.env.PUBLIC_URL_PUBLICAR as string | undefined)?.trim() || undefined;
      const r = await publicarCambios(db, { url, obtenerToken: () => usuario.getIdToken(), obtenerAppCheck: tokenAppCheck });
      setMensaje({ tipo: "ok", texto: r.rapido ? MSG_RAPIDO : MSG_LENTO });
      setCuenta((c) => (c ? { ...c, pendiente: true } : c));
    } catch (e) {
      // La marca no se ha podido guardar: no se da por publicado.
      setMensaje({ tipo: "error", texto: mensajeDeCambio(e) + " No se ha pedido publicar." });
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  return (
    <main className="pantalla-publicar">
      <header className="barra">
        <h1>Publicar cambios</h1>
        <div className="barra-botones">
          <BotonAyuda seccion="publicar-cambios" />
          <Boton onClick={() => irA("")}>Volver al inicio</Boton>
        </div>
      </header>
      {!cuenta ? (
        <Cargando />
      ) : (
        <>
          <p className="grande-texto" aria-live="polite">{textoCambios(cuenta)}</p>
          {cuenta.pendiente && <p className="meta">Ya hay una publicación pedida; saldrá en la próxima ronda.</p>}
          {fallo && <Aviso tipo="error">{fallo} No se han podido contar los cambios, pero puedes publicar igualmente.</Aviso>}
        </>
      )}
      {mensaje && <Aviso ref={avisoRef} tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      <div className="fila-botones fila-izquierda">
        <Boton variante="principal" className="grande" disabled={ocupado || !cuenta} onClick={() => void publicar()}>
          {ocupado ? "Un momento…" : "Publicar cambios ahora"}
        </Boton>
      </div>
      <Ayuda>Al publicar, la web se actualiza con todo lo que has guardado: artículos, comentarios aprobados y ajustes. Si no pulsas el botón, se publicará solo en menos de 1 hora.</Ayuda>
    </main>
  );
}
