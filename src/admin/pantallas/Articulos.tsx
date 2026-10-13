import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { Aviso } from "../componentes/Aviso";
import { Ayuda } from "../componentes/Ayuda";
import { Boton } from "../componentes/Boton";
import { Cargando } from "../componentes/Cargando";
import { Confirmar } from "../componentes/Confirmar";
import {
  borrarDefinitivamente, despublicar, enviarAPapelera, listarArticulos, moverSeccion, restaurar,
  NOMBRE_ESTADO, MAX_COINCIDENCIAS, type Cursor, type Estado, type Filtros, type Pagina, type Resumen,
} from "../datos/articulos";
import { SECCIONES, nombreDeSeccion } from "../datos/secciones";
import { mensajeDeCambio, mensajeDeError } from "../mensajes";
import { irA } from "../ruta";
import type { Papel } from "../sesion";

type Accion =
  | { tipo: "despublicar" | "papelera" | "borrar" | "mover"; articulo: Resumen };

function fechaLlana(iso: string) {
  const f = new Date(iso);
  return isNaN(f.getTime()) ? "" : f.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function Articulos({ usuario, papel }: { usuario: User; papel: Papel }) {
  const correo = usuario.email ?? "";
  const [estado, setEstado] = useState<Estado | "todos">("todos");
  const [seccion, setSeccion] = useState("");
  const [escrito, setEscrito] = useState("");
  const [texto, setTexto] = useState("");
  const [articulos, setArticulos] = useState<Resumen[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [modo, setModo] = useState<Pagina["modo"]>("normal");
  const [truncado, setTruncado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [seccionNueva, setSeccionNueva] = useState(SECCIONES[0]?.slug ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [version, setVersion] = useState(0); // sube para volver a pedir la lista
  const peticion = useRef(0);
  const enCurso = useRef(false); // evita que un doble clic lance la misma acción dos veces antes de que React repinte

  const filtros: Filtros = { estado, seccion, texto };

  useEffect(() => {
    if (!db) return;
    const esta = ++peticion.current;
    setCargando(true);
    setError(null);
    listarArticulos(db, { estado, seccion, texto })
      .then((p) => {
        if (esta !== peticion.current) return;
        setArticulos(p.articulos);
        setCursor(p.cursor);
        setModo(p.modo);
        setTruncado(p.truncado);
      })
      .catch((e) => esta === peticion.current && (setError(mensajeDeError(e)), setArticulos([]), setCursor(null)))
      .finally(() => esta === peticion.current && setCargando(false));
  }, [estado, seccion, texto, version]);

  const verMas = useCallback(async () => {
    if (!db || !cursor) return;
    setCargandoMas(true);
    try {
      const p = await listarArticulos(db, filtros, cursor);
      setArticulos((a) => [...a, ...p.articulos]);
      setCursor(p.cursor);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargandoMas(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, estado, seccion, texto]);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setTexto(escrito.trim());
  };

  async function ejecutar(a: Accion) {
    if (!db || enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setError(null);
    setOk(null);
    const { id, titulo } = a.articulo;
    try {
      if (a.tipo === "despublicar") await despublicar(db, id, correo);
      else if (a.tipo === "papelera") await enviarAPapelera(db, id, correo);
      else if (a.tipo === "mover") await moverSeccion(db, id, correo, seccionNueva);
      else await borrarDefinitivamente(db, id, papel, correo);
      setOk(
        {
          despublicar: `«${titulo}» ya no está publicado. Ahora es un borrador.`,
          papelera: `«${titulo}» está en la papelera. Puedes recuperarlo durante 30 días.`,
          mover: `«${titulo}» se ha movido a ${nombreDeSeccion(seccionNueva)}.`,
          borrar: `«${titulo}» se ha borrado para siempre.`,
        }[a.tipo] + (a.tipo === "borrar" ? "" : " Recuerda pulsar «Publicar cambios» para que se vea en la web."),
      );
      setAccion(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setAccion(null);
      setError(mensajeDeCambio(e));
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  async function alRestaurar(a: Resumen) {
    if (!db || enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setError(null);
    setOk(null);
    try {
      await restaurar(db, a.id, correo);
      setOk(`«${a.titulo}» se ha recuperado de la papelera.`);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(mensajeDeCambio(e));
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  const enPapelera = estado === "papelera";

  return (
    <main className="pantalla-articulos">
      <header className="barra">
        <h1>Mis artículos</h1>
        <Boton onClick={() => irA("")}>Volver al inicio</Boton>
      </header>

      <div className="fila-botones fila-izquierda">
        <Boton variante="principal" onClick={() => irA("nuevo")}>
          Escribir artículo
        </Boton>
      </div>

      <form className="filtros" role="search" onSubmit={buscar}>
        <label>
          Buscar por título
          <input type="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="Escribe una palabra del título" />
        </label>
        <Boton type="submit">Buscar</Boton>
        <label>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as Estado | "todos")}>
            <option value="todos">Todos</option>
            <option value="borrador">{NOMBRE_ESTADO.borrador}</option>
            <option value="programado">{NOMBRE_ESTADO.programado}</option>
            <option value="publicado">{NOMBRE_ESTADO.publicado}</option>
            <option value="papelera">{NOMBRE_ESTADO.papelera}</option>
          </select>
        </label>
        <label>
          Sección
          <select value={seccion} onChange={(e) => setSeccion(e.target.value)}>
            <option value="">Todas</option>
            {SECCIONES.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
      </form>

      {texto && modo === "prefijo" && !cargando && <Aviso>Búsqueda simple: escribe el principio del título (respeta mayúsculas y tildes).</Aviso>}
      {texto && truncado && <Aviso>Hay muchos resultados; se muestran solo los {MAX_COINCIDENCIAS} primeros. Escribe más del título para afinar.</Aviso>}
      {enPapelera && <Aviso>Los artículos que llevan más de 30 días en la papelera se borran solos.</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {cargando ? (
        <Cargando />
      ) : articulos.length === 0 && !error ? (
        <p>{texto ? "No hay ningún artículo que coincida con la búsqueda." : enPapelera ? "La papelera está vacía." : "No hay artículos con estos filtros."}</p>
      ) : (
        <ul className="lista-articulos">
          {articulos.map((a) => (
            <li key={a.id} className="articulo">
              <h3>{a.titulo || "(Sin título)"}</h3>
              <p className="meta-articulo">
                <span className={`etiqueta etiqueta-${a.estado}`}>{NOMBRE_ESTADO[a.estado] ?? a.estado}</span>
                {a.secciones.length > 0 && <span>{a.secciones.map(nombreDeSeccion).join(", ")}</span>}
                {a.actualizadoEn && (
                  <span>
                    Cambiado el {fechaLlana(a.actualizadoEn)}
                    {a.actualizadoPor ? ` por ${a.actualizadoPor}` : ""}
                  </span>
                )}
              </p>
              <div className="acciones">
                {a.estado === "papelera" ? (
                  <>
                    <Boton disabled={ocupado} onClick={() => alRestaurar(a)}>
                      Restaurar
                    </Boton>
                    {papel === "admin" && (
                      <Boton variante="peligro" disabled={ocupado} onClick={() => setAccion({ tipo: "borrar", articulo: a })}>
                        Borrar definitivamente
                      </Boton>
                    )}
                  </>
                ) : (
                  <>
                    <Boton onClick={() => irA("editar/" + a.id)}>Editar</Boton>
                    {a.estado === "publicado" && (
                      <a className="boton boton-secundario" href={`/${a.slug}/`} target="_blank" rel="noopener noreferrer">
                        Ver en la web
                      </a>
                    )}
                    {(a.estado === "publicado" || a.estado === "programado") && (
                      <Boton disabled={ocupado} onClick={() => setAccion({ tipo: "despublicar", articulo: a })}>
                        Despublicar
                      </Boton>
                    )}
                    <Boton
                      disabled={ocupado}
                      onClick={() => {
                        setSeccionNueva(a.secciones[0] ?? SECCIONES[0]?.slug ?? "");
                        setAccion({ tipo: "mover", articulo: a });
                      }}
                    >
                      Mover a otra sección
                    </Boton>
                    <Boton disabled={ocupado} onClick={() => setAccion({ tipo: "papelera", articulo: a })}>
                      Enviar a la papelera
                    </Boton>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {cursor && !cargando && (
        <div className="fila-botones fila-izquierda">
          <Boton disabled={cargandoMas} onClick={verMas}>
            {cargandoMas ? "Cargando…" : "Más antiguos →"}
          </Boton>
        </div>
      )}

      <Ayuda>
        Un artículo enviado a la papelera se puede recuperar durante 30 días. Lo que cambies aquí no se ve en la web hasta que pulses «Publicar cambios».
      </Ayuda>

      {accion?.tipo === "despublicar" && (
        <Confirmar
          titulo="¿Quitar de la web?"
          textoSi="Sí, despublicar"
          ocupado={ocupado}
          alCancelar={() => setAccion(null)}
          alConfirmar={() => ejecutar(accion)}
        >
          <p>«{accion.articulo.titulo}» pasará a borrador y dejará de verse en la web cuando publiques los cambios.</p>
        </Confirmar>
      )}
      {accion?.tipo === "papelera" && (
        <Confirmar
          titulo="¿Enviar a la papelera?"
          textoSi="Sí, enviar a la papelera"
          ocupado={ocupado}
          alCancelar={() => setAccion(null)}
          alConfirmar={() => ejecutar(accion)}
        >
          <p>«{accion.articulo.titulo}» estará 30 días en la papelera. Durante ese tiempo puedes recuperarlo.</p>
        </Confirmar>
      )}
      {accion?.tipo === "mover" && (
        <Confirmar
          titulo="Mover a otra sección"
          textoSi="Mover"
          ocupado={ocupado}
          alCancelar={() => setAccion(null)}
          alConfirmar={() => ejecutar(accion)}
        >
          <p>«{accion.articulo.titulo}» quedará solo en la sección que elijas.</p>
          <label className="campo-dialogo">
            Sección
            <select value={seccionNueva} onChange={(e) => setSeccionNueva(e.target.value)}>
              {SECCIONES.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        </Confirmar>
      )}
      {accion?.tipo === "borrar" && (
        <Confirmar
          titulo="¿Borrar para siempre?"
          textoSi="Sí, borrar para siempre"
          peligro
          ocupado={ocupado}
          alCancelar={() => setAccion(null)}
          alConfirmar={() => ejecutar(accion)}
        >
          <p>«{accion.articulo.titulo}» y todas sus versiones anteriores se borrarán. Esto no se puede deshacer.</p>
        </Confirmar>
      )}
    </main>
  );
}
