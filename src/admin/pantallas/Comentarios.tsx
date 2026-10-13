import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { Aviso } from "../componentes/Aviso";
import { Ayuda } from "../componentes/Ayuda";
import { Boton } from "../componentes/Boton";
import { BotonAyuda } from "../componentes/BotonAyuda";
import { Cargando } from "../componentes/Cargando";
import {
  cambiarOculto, cargarArchivo, leerOcultos, listarPendientes, moderar, textoPlano, titulosDe,
  type ComentarioArchivo, type Cursor, type Pendiente,
} from "../datos/comentarios";
import { listarArticulos, type Resumen } from "../datos/articulos";
import { mensajeDeCambio, mensajeDeError } from "../mensajes";
import { irA } from "../ruta";

function fechaLlana(iso: string) {
  const f = new Date(iso);
  return isNaN(f.getTime()) ? "" : f.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

type Veredicto = "aprobado" | "rechazado" | "spam";
const HECHO: Record<Veredicto, string> = {
  aprobado: "Comentario aprobado. Se verá en la web cuando pulses «Publicar cambios».",
  rechazado: "Comentario rechazado. No se publicará.",
  spam: "Comentario marcado como spam. No se publicará.",
};

function Pendientes() {
  const [lista, setLista] = useState<Pendiente[]>([]);
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enCurso = useRef(false);

  const cargar = useCallback(async (despues: Cursor | null) => {
    if (!db) return;
    const p = await listarPendientes(db, despues);
    const nuevos = await titulosDe(db, p.comentarios.map((c) => c.articuloSlug)).catch(() => ({}));
    setTitulos((t) => ({ ...t, ...nuevos }));
    setLista((l) => (despues ? [...l, ...p.comentarios] : p.comentarios));
    setCursor(p.cursor);
  }, []);

  useEffect(() => {
    let vigente = true;
    cargar(null)
      .catch((e) => vigente && setError(mensajeDeError(e)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [cargar]);

  async function verMas() {
    setCargandoMas(true);
    try {
      await cargar(cursor);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargandoMas(false);
    }
  }

  async function decidir(c: Pendiente, v: Veredicto) {
    if (!db || enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setError(null);
    setOk(null);
    try {
      await moderar(db, c.id, v);
      setLista((l) => l.filter((x) => x.id !== c.id));
      setOk(HECHO[v]);
    } catch (e) {
      setError(mensajeDeCambio(e));
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  return (
    <section aria-label="Comentarios pendientes">
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {cargando ? (
        <Cargando />
      ) : lista.length === 0 && !error ? (
        <p>No hay comentarios por revisar.</p>
      ) : (
        <ul className="lista-articulos">
          {lista.map((c) => (
            <li key={c.id} className="articulo comentario">
              <p className="meta-articulo">
                <strong>{c.nombre}</strong>
                {c.creadoEn && <span>{fechaLlana(c.creadoEn)}</span>}
                {c.correo && <span>Correo (privado): {c.correo}</span>}
              </p>
              <p className="texto-comentario">{c.texto}</p>
              <p className="meta-articulo">
                En el artículo:{" "}
                <a href={`/${encodeURIComponent(c.articuloSlug)}/`} target="_blank" rel="noopener noreferrer">
                  {titulos[c.articuloSlug] || c.articuloSlug}
                </a>
              </p>
              <div className="acciones">
                <Boton variante="principal" disabled={ocupado} onClick={() => decidir(c, "aprobado")}>
                  Aprobar
                </Boton>
                <Boton disabled={ocupado} onClick={() => decidir(c, "rechazado")}>
                  Rechazar
                </Boton>
                <Boton variante="peligro" disabled={ocupado} onClick={() => decidir(c, "spam")}>
                  Spam
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor && !cargando && (
        <div className="fila-botones fila-izquierda">
          <Boton disabled={cargandoMas} onClick={verMas}>
            {cargandoMas ? "Cargando…" : "Más →"}
          </Boton>
        </div>
      )}
    </section>
  );
}

function Archivo() {
  const [escrito, setEscrito] = useState("");
  const [resultados, setResultados] = useState<Resumen[] | null>(null);
  const [elegido, setElegido] = useState<Resumen | null>(null);
  const [comentarios, setComentarios] = useState<ComentarioArchivo[]>([]);
  const [ocultos, setOcultos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enCurso = useRef(false);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (!db || !escrito.trim()) return;
    setError(null);
    setElegido(null);
    setCargando(true);
    try {
      const p = await listarArticulos(db, { estado: "todos", texto: escrito.trim() });
      setResultados(p.articulos);
    } catch (e2) {
      setError(mensajeDeError(e2));
    } finally {
      setCargando(false);
    }
  }

  async function elegir(a: Resumen) {
    if (!db) return;
    setElegido(a);
    setError(null);
    setCargando(true);
    try {
      const [cs, oc] = await Promise.all([cargarArchivo(a.slug), leerOcultos(db, a.slug)]);
      setComentarios(cs);
      setOcultos(oc);
    } catch (e) {
      setComentarios([]);
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  async function alternar(c: ComentarioArchivo) {
    if (!db || !elegido || enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setError(null);
    try {
      setOcultos(await cambiarOculto(db, elegido.slug, c.id, !ocultos.includes(c.id)));
    } catch (e) {
      setError(mensajeDeCambio(e));
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  return (
    <section aria-label="Comentarios del archivo">
      <form className="filtros" role="search" onSubmit={buscar}>
        <label>
          Buscar artículo por título
          <input type="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="Escribe una palabra del título" />
        </label>
        <Boton type="submit">Buscar</Boton>
      </form>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!elegido && resultados && !cargando && (
        resultados.length === 0 ? (
          <p>No hay ningún artículo que coincida con la búsqueda.</p>
        ) : (
          <ul className="lista-articulos">
            {resultados.map((a) => (
              <li key={a.id} className="articulo">
                <h3>{a.titulo || "(Sin título)"}</h3>
                <div className="acciones">
                  <Boton onClick={() => elegir(a)}>Ver sus comentarios del archivo</Boton>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
      {cargando && <Cargando />}
      {elegido && !cargando && (
        <>
          <h2>{elegido.titulo}</h2>
          <div className="fila-botones fila-izquierda">
            <Boton onClick={() => setElegido(null)}>Elegir otro artículo</Boton>
          </div>
          {comentarios.length === 0 && !error ? (
            <p>Este artículo no tiene comentarios del archivo.</p>
          ) : (
            <ul className="lista-articulos">
              {comentarios.map((c) => {
                const oculto = ocultos.includes(c.id);
                const sinTexto = c.oculto === true || c.html === "";
                return (
                  <li key={c.id} className="articulo comentario">
                    {oculto ? (
                      <p className="meta-articulo">
                        <strong>Comentario oculto (nº {c.id})</strong>
                        {c.fecha && <span>{fechaLlana(c.fecha)}</span>}
                        <span className="etiqueta etiqueta-papelera">Oculto</span>
                      </p>
                    ) : sinTexto ? (
                      <p className="meta-articulo">
                        <strong>Comentario nº {c.id}</strong>
                        <span>Volverá a verse en la web cuando pulses «Publicar cambios».</span>
                      </p>
                    ) : (
                      <>
                        <p className="meta-articulo">
                          <strong>{c.autor}</strong>
                          {c.fecha && <span>{fechaLlana(c.fecha)}</span>}
                        </p>
                        <p className="texto-comentario">{textoPlano(c.html)}</p>
                      </>
                    )}
                    <div className="acciones">
                      <Boton disabled={ocupado} onClick={() => alternar(c)}>
                        {oculto ? "Mostrar" : "Ocultar"}
                      </Boton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function Comentarios(_: { usuario: User }) {
  const [pestana, setPestana] = useState<"pendientes" | "archivo">("pendientes");
  return (
    <main className="pantalla-articulos">
      <header className="barra">
        <h1>Comentarios</h1>
        <div className="barra-botones">
          <BotonAyuda seccion="comentarios" />
          <Boton onClick={() => irA("")}>Volver al inicio</Boton>
        </div>
      </header>
      <div className="fila-botones fila-izquierda" role="tablist" aria-label="Qué comentarios ver">
        <Boton role="tab" aria-selected={pestana === "pendientes"} variante={pestana === "pendientes" ? "principal" : "secundario"} onClick={() => setPestana("pendientes")}>
          Pendientes
        </Boton>
        <Boton role="tab" aria-selected={pestana === "archivo"} variante={pestana === "archivo" ? "principal" : "secundario"} onClick={() => setPestana("archivo")}>
          Archivo
        </Boton>
      </div>
      {pestana === "pendientes" ? <Pendientes /> : <Archivo />}
      <Ayuda>
        Los comentarios nuevos no se ven en la web hasta que los apruebes y pulses «Publicar cambios». Los del archivo son los de la web antigua: puedes ocultar los que no quieras mostrar.
      </Ayuda>
    </main>
  );
}
