import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth } from "../firebase";
import { Boton } from "../componentes/Boton";
import { Aviso } from "../componentes/Aviso";
import { Ayuda } from "../componentes/Ayuda";
import { CORREO_ENVIADO, mensajeDeError } from "../mensajes";

type Mensaje = { tipo: "info" | "error" | "ok"; texto: string };

export function Entrar({ errorInicial }: { errorInicial?: string | null }) {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(errorInicial ? { tipo: "error", texto: errorInicial } : null);
  const [sinVerificar, setSinVerificar] = useState(false);

  async function entrar(e?: FormEvent) {
    e?.preventDefault();
    if (!auth) return;
    setMensaje(null);
    setSinVerificar(false);
    setOcupado(true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, correo.trim(), clave);
      if (!user.emailVerified) {
        await sendEmailVerification(user);
        await signOut(auth);
        setSinVerificar(true);
        setMensaje({ tipo: "info", texto: CORREO_ENVIADO });
      }
      // Si el correo esta confirmado, la sesion detecta el acceso y cambia de pantalla sola.
    } catch (err) {
      setMensaje({ tipo: "error", texto: mensajeDeError(err) });
    } finally {
      setOcupado(false);
    }
  }

  async function olvidada() {
    if (!auth) return;
    if (!correo.trim()) {
      setMensaje({ tipo: "error", texto: "Escribe primero tu correo y vuelve a pulsar aquí." });
      return;
    }
    setOcupado(true);
    try {
      await sendPasswordResetEmail(auth, correo.trim());
      setMensaje({ tipo: "ok", texto: "Si ese correo tiene cuenta, te hemos enviado un enlace para elegir una contraseña nueva." });
    } catch (err) {
      setMensaje({ tipo: "error", texto: mensajeDeError(err) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="pantalla-entrar">
      <h1>Panel de El Ojo Crítico</h1>
      <p>Entra con tu correo y tu contraseña.</p>
      <form onSubmit={entrar}>
        <label>
          Correo
          <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
        </label>
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        <Boton type="submit" variante="principal" disabled={ocupado}>
          {ocupado ? "Un momento…" : "Entrar"}
        </Boton>
        {sinVerificar && (
          <Boton onClick={() => entrar()} disabled={ocupado}>
            Reenviar el correo
          </Boton>
        )}
      </form>
      <p>
        <button type="button" className="enlace" onClick={olvidada} disabled={ocupado}>
          ¿Has olvidado la contraseña?
        </button>
      </p>
      <Ayuda>Si no tienes cuenta o no te deja entrar, pide a un administrador que te dé acceso.</Ayuda>
    </main>
  );
}
