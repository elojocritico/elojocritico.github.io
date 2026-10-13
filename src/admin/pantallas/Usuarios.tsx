import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { Aviso } from "../componentes/Aviso";
import { Ayuda } from "../componentes/Ayuda";
import { Boton } from "../componentes/Boton";
import { Cargando } from "../componentes/Cargando";
import { Confirmar } from "../componentes/Confirmar";
import { AVISOS_AJUSTES, ErrorAjustes, cambiarUsuario, esCorreo, leerAjustes, normalizarCorreo } from "../datos/ajustes";
import { mensajeDeCambio } from "../mensajes";
import { irA } from "../ruta";
import type { Papel } from "../sesion";
import { SoloAdmin } from "./Ajustes";

export const INSTRUCCIONES_NUEVO =
  "Dile a esa persona que entre en la web /admin/, pulse «¿Has olvidado la contraseña?» con su correo y siga el enlace; después tendrá que confirmar su correo.";

export const NOTA_SIN_CUENTA = "(Si esa persona aún no tiene cuenta, el administrador técnico tendrá que crearla.)";

type Mensaje = { tipo: "ok" | "error"; texto: string };
const NOMBRE: Record<Papel, string> = { admin: "Administrador", editor: "Editor" };

function mensajeDe(e: unknown): string {
  if (e instanceof ErrorAjustes) return AVISOS_AJUSTES[e.code] ?? "No se ha podido guardar.";
  return mensajeDeCambio(e);
}

export function Usuarios({ usuario, papel }: { usuario: User; papel: Papel }) {
  if (papel !== "admin") return <SoloAdmin />;
  return <UsuariosAdmin usuario={usuario} />;
}

function UsuariosAdmin({ usuario }: { usuario: User }) {
  const yo = normalizarCorreo(usuario.email ?? "");
  const [lista, setLista] = useState<Record<string, Papel> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [correo, setCorreo] = useState("");
  const [papelNuevo, setPapelNuevo] = useState<Papel>("editor");
  const [quitar, setQuitar] = useState<string | null>(null);
  const [instrucciones, setInstrucciones] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const version = useRef("");
  const enCurso = useRef(false);
  const avisoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db) return;
    let vigente = true;
    leerAjustes(db)
      .then((a) => {
        if (!vigente) return;
        version.current = a.version;
        setLista(a.usuarios);
      })
      .catch((e) => vigente && setError(mensajeDe(e)));
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (mensaje) avisoRef.current?.focus();
  }, [mensaje]);

  const admins = lista ? Object.values(lista).filter((p) => p === "admin").length : 0;

  /** Cambia a una persona (papel null = quitarla). Devuelve true si se guardó. */
  async function aplicar(para: string, papel: Papel | null, exito: string): Promise<boolean> {
    if (!db || enCurso.current) return false;
    enCurso.current = true;
    setOcupado(true);
    setMensaje(null);
    try {
      version.current = await cambiarUsuario(db, usuario.email ?? "", version.current, para, papel);
      const clave = normalizarCorreo(para);
      setLista((l) => {
        const n: Record<string, Papel> = {};
        for (const [k, v] of Object.entries(l ?? {})) if (k.trim().toLowerCase() !== clave) n[k] = v;
        if (papel) n[clave] = papel;
        return n;
      });
      setMensaje({ tipo: "ok", texto: exito });
      return true;
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDe(e) });
      return false;
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  async function añadir(e: FormEvent) {
    e.preventDefault();
    const c = normalizarCorreo(correo);
    if (!esCorreo(c)) return setMensaje({ tipo: "error", texto: AVISOS_AJUSTES["ajustes/correo"] });
    if (lista && Object.keys(lista).some((k) => k.trim().toLowerCase() === c)) {
      return setMensaje({ tipo: "error", texto: "Esa persona ya está en la lista. Para cambiar su papel, usa el botón de su fila." });
    }
    if (await aplicar(c, papelNuevo, `${c} ya tiene permiso como ${NOMBRE[papelNuevo].toLowerCase()}.`)) {
      setCorreo("");
      setInstrucciones(c);
    }
  }

  if (error) return <main><Aviso tipo="error">{error}</Aviso><Boton onClick={() => irA("")}>Volver al inicio</Boton></main>;
  if (!lista) return <Cargando />;

  const filas = Object.entries(lista).sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="pantalla-usuarios">
      <header className="barra">
        <h1>Usuarios</h1>
        <Boton onClick={() => irA("")}>Volver al inicio</Boton>
      </header>
      <p className="meta">Estas son las personas que pueden entrar en el panel. Los administradores lo pueden todo; los editores solo escriben artículos y moderan comentarios.</p>
      {mensaje && <Aviso ref={avisoRef} tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {mensaje?.tipo === "error" && mensaje.texto === AVISOS_AJUSTES["ajustes/conflicto"] && (
        <Boton variante="principal" onClick={() => window.location.reload()}>Recargar la página</Boton>
      )}

      <ul className="lista-articulos" aria-label="Personas con permiso">
        {filas.map(([c, p]) => {
          const soyYo = c.trim().toLowerCase() === yo;
          const ultimo = p === "admin" && admins <= 1;
          return (
            <li key={c}>
              <strong>{c}</strong> <span className="meta">{NOMBRE[p] ?? p}{soyYo ? " (tú)" : ""}</span>
              <div className="fila-botones fila-izquierda">
                {p === "admin" ? (
                  <Boton disabled={ocupado || ultimo || soyYo} onClick={() => void aplicar(c, "editor", `${c} ahora es editor.`)} aria-label={`Hacer editor a ${c}`}>Hacer editor</Boton>
                ) : (
                  <Boton disabled={ocupado} onClick={() => void aplicar(c, "admin", `${c} ahora es administrador.`)} aria-label={`Hacer administrador a ${c}`}>Hacer administrador</Boton>
                )}
                <Boton variante="peligro" disabled={ocupado || ultimo || soyYo} onClick={() => setQuitar(c)} aria-label={`Quitar a ${c}`}>Quitar</Boton>
              </div>
              {ultimo && <p className="meta">Es el único administrador: no se puede quitar. Nombra antes a otra persona.</p>}
              {soyYo && !ultimo && <p className="meta">No puedes cambiarte a ti mismo; pídeselo a otro administrador.</p>}
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="us-nuevo">
        <h2 id="us-nuevo">Añadir a una persona</h2>
        <form onSubmit={añadir} className="campos-editor" noValidate>
          <label>
            Correo
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Papel
            <select value={papelNuevo} onChange={(e) => setPapelNuevo(e.target.value as Papel)}>
              <option value="editor">Editor (artículos y comentarios)</option>
              <option value="admin">Administrador (todo)</option>
            </select>
          </label>
          <div className="fila-botones fila-izquierda">
            <Boton type="submit" variante="principal" disabled={ocupado || !correo.trim()}>Añadir</Boton>
          </div>
        </form>
        {instrucciones && (
          <Aviso tipo="info">
            <strong>Falta un paso para {instrucciones}.</strong> {INSTRUCCIONES_NUEVO}
            <br />
            <small>{NOTA_SIN_CUENTA}</small>
          </Aviso>
        )}
      </section>

      <Ayuda>Quitar a alguien le impide entrar en el panel; sus artículos no se borran. Siempre tiene que haber al menos un administrador.</Ayuda>

      {quitar !== null && (
        <Confirmar
          titulo={`¿Quitar a ${quitar}?`}
          textoSi="Sí, quitar"
          peligro
          ocupado={ocupado}
          alCancelar={() => setQuitar(null)}
          alConfirmar={async () => {
            const c = quitar;
            await aplicar(c, null, `${c} ya no tiene permiso para entrar.`);
            setQuitar(null);
          }}
        >
          <p>Esta persona ya no podrá entrar en el panel. Sus artículos se quedan como están.</p>
        </Confirmar>
      )}
    </main>
  );
}
