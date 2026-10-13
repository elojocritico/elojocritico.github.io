import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { Aviso } from "../componentes/Aviso";
import { Ayuda } from "../componentes/Ayuda";
import { Boton } from "../componentes/Boton";
import { Cargando } from "../componentes/Cargando";
import { Confirmar } from "../componentes/Confirmar";
import { EditorTexto } from "../componentes/EditorTexto";
import {
  AVISOS_AJUSTES, ErrorAjustes, MAX_ENLACES, guardarAjustes, leerAjustes, problemaDeAdsense, problemaDeEnlaces,
  type Adsense, type Ajustes as DatosAjustes, type Cambios, type Enlace,
} from "../datos/ajustes";
import { listarArticulos, type Resumen } from "../datos/articulos";
import { titulosDe } from "../datos/comentarios";
import { mensajeDeCambio } from "../mensajes";
import { bloquearNavegacion, irA } from "../ruta";
import type { Papel } from "../sesion";

export function SoloAdmin() {
  return (
    <main>
      <Aviso>Esta sección es solo para administradores.</Aviso>
      <Boton onClick={() => irA("")}>Volver al inicio</Boton>
    </main>
  );
}

type Mensaje = { tipo: "ok" | "error" | "info"; texto: string };
type Guardar = (cambios: Cambios) => Promise<boolean>;
type Seccion = { ajustes: DatosAjustes; guardar: Guardar; ocupado: boolean; marcar: (nombre: string, sucio: boolean) => void };

function mensajeDe(e: unknown): string {
  if (e instanceof ErrorAjustes) return e.detalle ?? AVISOS_AJUSTES[e.code] ?? "No se ha podido guardar.";
  return mensajeDeCambio(e);
}

export function Ajustes({ usuario, papel }: { usuario: User; papel: Papel }) {
  if (papel !== "admin") return <SoloAdmin />;
  return <AjustesAdmin usuario={usuario} />;
}

function AjustesAdmin({ usuario }: { usuario: User }) {
  const correo = usuario.email ?? "";
  const [ajustes, setAjustes] = useState<DatosAjustes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pregunta, setPregunta] = useState<string | null>(null); // destino al que se quería ir con cambios sin guardar
  const version = useRef("");
  const enCurso = useRef(false);
  const sucios = useRef(new Set<string>());
  const [haySucio, setHaySucio] = useState(false);
  const avisoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db) return;
    let vigente = true;
    leerAjustes(db)
      .then((a) => {
        if (!vigente) return;
        version.current = a.version;
        setAjustes(a);
      })
      .catch((e) => vigente && setError(mensajeDe(e)));
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (mensaje) avisoRef.current?.focus();
  }, [mensaje]);

  useEffect(() => {
    if (!haySucio) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    const quitar = bloquearNavegacion((destino) => {
      if (sucios.current.size === 0) return true;
      setPregunta(destino);
      return false;
    });
    return () => {
      window.removeEventListener("beforeunload", aviso);
      quitar();
    };
  }, [haySucio]);

  const marcar = useCallback((nombre: string, sucio: boolean) => {
    if (sucio) sucios.current.add(nombre);
    else sucios.current.delete(nombre);
    setHaySucio(sucios.current.size > 0);
  }, []);

  const guardar: Guardar = async (cambios) => {
    if (!db || enCurso.current) return false;
    enCurso.current = true;
    setOcupado(true);
    setMensaje(null);
    try {
      version.current = await guardarAjustes(db, correo, version.current, cambios);
      setMensaje({ tipo: "ok", texto: "Guardado. Se verá en la web cuando pulses «Publicar cambios»." });
      return true;
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDe(e) });
      return false;
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  };

  if (error) return <main><Aviso tipo="error">{error}</Aviso><Boton onClick={() => irA("")}>Volver al inicio</Boton></main>;
  if (!ajustes) return <Cargando />;

  const comun: Seccion = { ajustes, guardar, ocupado, marcar };

  return (
    <main className="pantalla-ajustes">
      <header className="barra">
        <h1>Ajustes de la web</h1>
        <Boton onClick={() => irA("")}>Volver al inicio</Boton>
      </header>
      {mensaje && <Aviso ref={avisoRef} tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {mensaje?.tipo === "error" && mensaje.texto === AVISOS_AJUSTES["ajustes/conflicto"] && (
        <Boton variante="principal" onClick={() => window.location.reload()}>Recargar la página</Boton>
      )}

      <Destacado {...comun} />
      <Enlaces {...comun} />
      <QueEsEoc {...comun} />
      <Publicidad {...comun} />

      <Ayuda>Los ajustes se guardan por separado, cada uno con su botón. No se ven en la web hasta que pulses «Publicar cambios».</Ayuda>

      {pregunta !== null && (
        <Confirmar
          titulo="Tienes cambios sin guardar"
          textoSi="Salir sin guardar"
          textoNo="Seguir editando"
          peligro
          alCancelar={() => setPregunta(null)}
          alConfirmar={() => {
            const destino = pregunta;
            setPregunta(null);
            sucios.current.clear();
            setHaySucio(false);
            irA(destino);
          }}
        >
          <p>Si sales ahora, se perderá lo que has cambiado desde el último guardado.</p>
        </Confirmar>
      )}
    </main>
  );
}

// --- Artículo destacado ---------------------------------------------------------------------------------------------

function Destacado({ ajustes, guardar, ocupado, marcar }: Seccion) {
  const [elegido, setElegido] = useState<string | null>(ajustes.destacado);
  const [guardado, setGuardado] = useState<string | null>(ajustes.destacado);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Resumen[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [verBuscador, setVerBuscador] = useState(false);

  useEffect(() => {
    if (!db || !elegido) return setTitulo("");
    let vigente = true;
    titulosDe(db, [elegido])
      .then((t) => vigente && setTitulo(t[elegido] ?? ""))
      .catch(() => vigente && setTitulo(""));
    return () => {
      vigente = false;
    };
  }, [elegido]);

  useEffect(() => marcar("destacado", elegido !== guardado), [elegido, guardado, marcar]);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (!db || !texto.trim()) return;
    setBuscando(true);
    setFallo(null);
    try {
      const p = await listarArticulos(db, { estado: "publicado", texto });
      setResultados(p.articulos);
    } catch (err) {
      setResultados(null);
      setFallo(mensajeDeCambio(err));
    } finally {
      setBuscando(false);
    }
  }

  const elegir = (a: Resumen) => {
    setElegido(a.slug);
    setTitulo(a.titulo);
    setResultados(null);
    setVerBuscador(false);
    setTexto("");
  };

  return (
    <section className="seccion-ajuste" aria-labelledby="aj-destacado">
      <h2 id="aj-destacado">Artículo destacado</h2>
      <p className="meta">Es el artículo grande que se ve arriba en la portada.</p>
      <p>
        <strong>Ahora:</strong>{" "}
        {elegido === null ? "El más reciente (cambia solo cuando publicas un artículo nuevo)" : titulo || elegido}
      </p>
      <div className="fila-botones fila-izquierda">
        <Boton onClick={() => setVerBuscador((v) => !v)}>Elegir otro artículo</Boton>
        <Boton disabled={elegido === null} onClick={() => setElegido(null)}>Usar siempre el más reciente</Boton>
      </div>
      {verBuscador && (
        <form onSubmit={buscar} className="buscador">
          <label>
            Busca por el título
            <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          <Boton type="submit" disabled={buscando || !texto.trim()}>Buscar</Boton>
        </form>
      )}
      {buscando && <Cargando />}
      {fallo && <Aviso tipo="error">{fallo}</Aviso>}
      {resultados && (resultados.length === 0 ? (
        <p>No hay artículos publicados con ese título.</p>
      ) : (
        <ul className="lista-articulos">
          {resultados.map((a) => (
            <li key={a.id}>
              <span>{a.titulo}</span>{" "}
              <Boton onClick={() => elegir(a)} aria-label={`Elegir «${a.titulo}»`}>Elegir</Boton>
            </li>
          ))}
        </ul>
      ))}
      <div className="fila-botones fila-izquierda">
        <Boton
          variante="principal"
          disabled={ocupado || elegido === guardado}
          onClick={async () => {
            if (await guardar({ destacado: elegido })) setGuardado(elegido);
          }}
        >
          Guardar el destacado
        </Boton>
      </div>
    </section>
  );
}

// --- Enlaces afines --------------------------------------------------------------------------------------------------

function Enlaces({ ajustes, guardar, ocupado, marcar }: Seccion) {
  const [lista, setLista] = useState<Enlace[]>(ajustes.enlaces);
  const [guardada, setGuardada] = useState(JSON.stringify(ajustes.enlaces));
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => marcar("enlaces", JSON.stringify(lista) !== guardada), [lista, guardada, marcar]);

  const cambiar = (i: number, campo: keyof Enlace, valor: string) => setLista(lista.map((e, k) => (k === i ? { ...e, [campo]: valor } : e)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    const n = [...lista];
    [n[i], n[j]] = [n[j], n[i]];
    setLista(n);
  };

  async function alGuardar() {
    const p = problemaDeEnlaces(lista);
    setProblema(p);
    if (p) return;
    const limpia = lista.map((e) => ({ nombre: e.nombre.trim(), url: e.url.trim() }));
    if (await guardar({ enlaces: limpia })) {
      setLista(limpia);
      setGuardada(JSON.stringify(limpia));
    }
  }

  return (
    <section className="seccion-ajuste" aria-labelledby="aj-enlaces">
      <h2 id="aj-enlaces">Enlaces afines</h2>
      <p className="meta">Webs amigas que aparecen en el pie de la página. Máximo {MAX_ENLACES}.</p>
      <ol className="lista-enlaces">
        {lista.map((e, i) => (
          <li key={i}>
            <label>
              Nombre
              <input value={e.nombre} onChange={(ev) => cambiar(i, "nombre", ev.target.value)} aria-label={`Nombre del enlace ${i + 1}`} />
            </label>
            <label>
              Dirección
              <input value={e.url} inputMode="url" onChange={(ev) => cambiar(i, "url", ev.target.value)} aria-label={`Dirección del enlace ${i + 1}`} />
            </label>
            <div className="fila-botones fila-izquierda">
              <Boton disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir el enlace ${i + 1}`}>Subir</Boton>
              <Boton disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label={`Bajar el enlace ${i + 1}`}>Bajar</Boton>
              <Boton variante="peligro" onClick={() => setLista(lista.filter((_, k) => k !== i))} aria-label={`Quitar el enlace ${i + 1}`}>Quitar</Boton>
            </div>
          </li>
        ))}
      </ol>
      {lista.length === 0 && <p>Todavía no hay enlaces.</p>}
      {problema && <Aviso tipo="error">{problema}</Aviso>}
      <div className="fila-botones fila-izquierda">
        <Boton disabled={lista.length >= MAX_ENLACES} onClick={() => setLista([...lista, { nombre: "", url: "https://" }])}>Añadir un enlace</Boton>
        <Boton variante="principal" disabled={ocupado || JSON.stringify(lista) === guardada} onClick={() => void alGuardar()}>Guardar los enlaces</Boton>
      </div>
    </section>
  );
}

// --- Qué es EOC ----------------------------------------------------------------------------------------------------------

function QueEsEoc({ ajustes, guardar, ocupado, marcar }: Seccion) {
  const [titulo, setTitulo] = useState(ajustes.queEsEoc.titulo);
  const [cuerpo, setCuerpo] = useState(ajustes.queEsEoc.cuerpoHtml);
  const [guardado, setGuardado] = useState({ titulo: ajustes.queEsEoc.titulo, cuerpo: ajustes.queEsEoc.cuerpoHtml });
  const [aviso, setAviso] = useState<Mensaje | null>(null);
  const [clave, setClave] = useState(0);

  const sucio = titulo !== guardado.titulo || cuerpo !== guardado.cuerpo;
  useEffect(() => marcar("queEsEoc", sucio), [sucio, marcar]);

  return (
    <section className="seccion-ajuste" aria-labelledby="aj-que">
      <h2 id="aj-que">Qué es EOC</h2>
      <p className="meta">El texto de la página que presenta la revista.</p>
      <label className="campo">
        Título de la página
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <EditorTexto key={clave} inicial={cuerpo} alCambiar={setCuerpo} alAviso={(texto, tipo) => setAviso({ tipo, texto })} />
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <div className="fila-botones fila-izquierda">
        <Boton
          variante="principal"
          disabled={ocupado || !sucio}
          onClick={async () => {
            if (await guardar({ queEsEoc: { titulo, cuerpoHtml: cuerpo } })) setGuardado({ titulo, cuerpo });
          }}
        >
          Guardar «Qué es EOC»
        </Boton>
        <Boton
          disabled={!sucio}
          onClick={() => {
            setTitulo(guardado.titulo);
            setCuerpo(guardado.cuerpo);
            setClave((k) => k + 1);
          }}
        >
          Deshacer mis cambios
        </Boton>
      </div>
    </section>
  );
}

// --- Publicidad (AdSense) --------------------------------------------------------------------------------------------------

function Publicidad({ ajustes, guardar, ocupado, marcar }: Seccion) {
  const [a, setA] = useState<Adsense>(ajustes.adsense);
  const [guardado, setGuardado] = useState(JSON.stringify(ajustes.adsense));
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => marcar("adsense", JSON.stringify(a) !== guardado), [a, guardado, marcar]);

  async function alGuardar() {
    const p = problemaDeAdsense(a);
    setProblema(p);
    if (p) return;
    const limpio = { activo: a.activo, cliente: a.cliente.trim(), bloque: a.bloque.trim() };
    if (await guardar({ adsense: limpio })) {
      setA(limpio);
      setGuardado(JSON.stringify(limpio));
    }
  }

  return (
    <section className="seccion-ajuste" aria-labelledby="aj-publi">
      <h2 id="aj-publi">Publicidad</h2>
      <p className="meta">
        Si activas la publicidad, la web muestra anuncios de Google AdSense. Los dos códigos te los da tu cuenta de AdSense: el código de cuenta
        empieza por «ca-pub-» y el de bloque son 10 números. Si no los tienes, deja la publicidad desactivada.
      </p>
      <label className="casilla">
        <input type="checkbox" checked={a.activo} onChange={(e) => setA({ ...a, activo: e.target.checked })} />
        Mostrar publicidad en la web
      </label>
      <label className="campo">
        Código de cuenta
        <input value={a.cliente} placeholder="ca-pub-1234567890123456" onChange={(e) => setA({ ...a, cliente: e.target.value })} />
      </label>
      <label className="campo">
        Código de bloque
        <input value={a.bloque} placeholder="1234567890" inputMode="numeric" onChange={(e) => setA({ ...a, bloque: e.target.value })} />
      </label>
      {problema && <Aviso tipo="error">{problema}</Aviso>}
      <div className="fila-botones fila-izquierda">
        <Boton variante="principal" disabled={ocupado || JSON.stringify(a) === guardado} onClick={() => void alGuardar()}>Guardar la publicidad</Boton>
      </div>
    </section>
  );
}
