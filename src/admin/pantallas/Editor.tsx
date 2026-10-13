// Editor de artículos: escribir, guardar borrador, programar, publicar, vista previa e historial.
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { Aviso } from "../componentes/Aviso";
import { Ayuda } from "../componentes/Ayuda";
import { Boton } from "../componentes/Boton";
import { Cargando } from "../componentes/Cargando";
import { Confirmar } from "../componentes/Confirmar";
import { EditorTexto } from "../componentes/EditorTexto";
import { Historial } from "../componentes/Historial";
import { ErrorArticulo, NOMBRE_ESTADO, type Estado } from "../datos/articulos";
import {
  CAMPOS_VACIOS, camposDe, cargarArticulo, existeDireccion, guardarArticulo, marcarPublicarPendiente,
  type Articulo, type Campos, type Portada, type Version,
} from "../datos/guardar";
import { SECCIONES, nombreDeSeccion } from "../datos/secciones";
import { mensajeDeCambio, mensajeDeError } from "../mensajes";
import { irA } from "../ruta";
import { subirImagen, urlTarjeta, ErrorSubida } from "../subirImagen";
import { sanear } from "../../lib/sanear";
import { direccionDesdeTitulo, limpiarDireccion, problemaDeDireccion } from "../utiles/direccion";
import { extractoDesde, textoPlano } from "../utiles/extracto";
import { fechaHoraLlana, madridAUtc, utcAMadrid } from "../utiles/fechas";

type Modo = "borrador" | "publicar" | "programar";
type Mensaje = { tipo: "info" | "error" | "ok"; texto: string };
type Comprobacion = "ocupada" | "libre" | null;

const SIN_CONEXION_CAMBIOS = "No hay conexión con el servidor; tus cambios no se han guardado.";
const SERVIDOR = "elojocritico.github.io";

const etiquetasDe = (texto: string) => Array.from(new Set(texto.split(",").map((e) => e.trim()).filter(Boolean)));
const sinTexto = (html: string) => textoPlano(html) === "" && !/<(img|iframe)\b/i.test(html);

const NOMBRES_CAMPO: [keyof Campos, string][] = [
  ["titulo", "Título"], ["subtitulo", "Subtítulo"], ["cuerpoHtml", "Texto"], ["extracto", "Extracto"], ["autor", "Autor"],
  ["secciones", "Secciones"], ["etiquetas", "Etiquetas"], ["portada", "Foto de portada"], ["destacado", "Destacar en portada"],
];

function resumenCampo(a: Articulo, k: keyof Campos): string {
  const v = a[k];
  if (k === "cuerpoHtml") {
    const t = textoPlano(String(v));
    return t.length > 600 ? t.slice(0, 600) + "…" : t || "(vacío)";
  }
  if (k === "secciones") return (v as string[]).map(nombreDeSeccion).join(", ") || "(ninguna)";
  if (k === "etiquetas") return (v as string[]).join(", ") || "(ninguna)";
  if (k === "portada") return v ? "Hay una foto (" + (a.portada?.alt || "sin descripción") + ")" : "(sin foto)";
  if (k === "destacado") return v ? "Sí" : "No";
  return String(v) || "(vacío)";
}

export function Editor({ usuario, id }: { usuario: User; id?: string }) {
  const correo = usuario.email ?? "";
  const [cargando, setCargando] = useState(!!id);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [campos, setCampos] = useState<Campos>(CAMPOS_VACIOS);
  const [etiquetasTexto, setEtiquetasTexto] = useState("");
  const [idArticulo, setIdArticulo] = useState(id ?? "");
  const [direccion, setDireccion] = useState("");
  const [direccionTocada, setDireccionTocada] = useState(false);
  const [comprobacion, setComprobacion] = useState<Comprobacion>(null);
  const [esNuevo, setEsNuevo] = useState(!id);
  const [cargadoEn, setCargadoEn] = useState<string | null>(null);
  const [estadoActual, setEstadoActual] = useState<Estado | null>(null);
  const [fechaActual, setFechaActual] = useState("");
  const [programando, setProgramando] = useState(false);
  const [fechaLocal, setFechaLocal] = useState("");
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [guardados, setGuardados] = useState(0);
  const [claveTexto, setClaveTexto] = useState(0);
  const [conflicto, setConflicto] = useState<{ otro: Articulo; modo: Modo; fecha?: string } | null>(null);
  const [verOtro, setVerOtro] = useState(false);
  const [pregunta, setPregunta] = useState<null | { tipo: "borrador" } | { tipo: "salir" } | { tipo: "version"; version: Version }>(null);
  const guardando = useRef(false); // evita guardados dobles aunque se pulse dos veces antes de que React repinte
  const avisoRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLInputElement>(null);
  const archivoPortada = useRef<HTMLInputElement>(null);

  // --- Carga de un artículo existente ---------------------------------------------------------------------------
  useEffect(() => {
    if (!id) return;
    if (!db) return;
    let vigente = true;
    cargarArticulo(db, id)
      .then((a) => {
        if (!vigente) return;
        if (!a) return setErrorCarga("Este artículo no existe. Puede que se haya borrado.");
        setCampos(camposDe(a));
        setEtiquetasTexto(a.etiquetas.join(", "));
        setEstadoActual(a.estado);
        setFechaActual(a.fechaPublicacion);
        setCargadoEn(a.actualizadoEn);
        setFechaLocal(a.estado === "programado" ? utcAMadrid(a.fechaPublicacion) : "");
        setDireccion(id);
        setClaveTexto((c) => c + 1);
      })
      .catch((e) => vigente && setErrorCarga(mensajeDeError(e)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [id]);

  // --- Aviso de cambios sin guardar al cerrar o recargar la pestaña -----------------------------------------------
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sucio]);

  useEffect(() => {
    if (mensaje) avisoRef.current?.focus();
  }, [mensaje]);

  // --- Dirección: se propone desde el título y se avisa si ya existe -------------------------------------------------
  useEffect(() => {
    if (!esNuevo || !db || problemaDeDireccion(direccion)) {
      setComprobacion(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      existeDireccion(db!, direccion)
        .then((existe) => vigente && setComprobacion(existe ? "ocupada" : "libre"))
        .catch(() => vigente && setComprobacion(null)); // sin conexión: se vuelve a comprobar al guardar
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [direccion, esNuevo]);

  const cambiar = useCallback(<K extends keyof Campos>(k: K, v: Campos[K]) => {
    setCampos((c) => ({ ...c, [k]: v }));
    setSucio(true);
  }, []);

  const alCambiarTitulo = (t: string) => {
    cambiar("titulo", t);
    if (esNuevo && !direccionTocada) setDireccion(direccionDesdeTitulo(t));
  };

  const alAviso = useCallback((texto: string, tipo: "info" | "error") => setMensaje({ tipo, texto }), []);
  const alCambiarTexto = useCallback((html: string) => cambiar("cuerpoHtml", html), [cambiar]);

  // --- Foto de portada ------------------------------------------------------------------------------------------------
  async function subirPortada(f: File | undefined) {
    if (archivoPortada.current) archivoPortada.current.value = "";
    if (!f) return;
    setSubiendo(true);
    try {
      const r = await subirImagen(f);
      const portada: Portada = { src: r.url, tarjeta: urlTarjeta(r.url), alt: campos.portada?.alt ?? "" };
      cambiar("portada", portada);
      setMensaje(r.aviso ? { tipo: "info", texto: r.aviso } : null);
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof ErrorSubida ? e.message : "No se ha podido subir la foto." });
    } finally {
      setSubiendo(false);
    }
  }

  // --- Guardar ------------------------------------------------------------------------------------------------------
  async function guardar(modo: Modo, opciones: { forzar?: boolean; confirmadoBorrador?: boolean; fecha?: string } = {}) {
    if (!db || guardando.current) return;
    setMensaje(null);
    const error = (texto: string) => setMensaje({ tipo: "error", texto });

    if (!campos.titulo.trim()) {
      error("Escribe un título para poder guardar.");
      tituloRef.current?.focus();
      return;
    }
    if (esNuevo) {
      const problema = problemaDeDireccion(direccion);
      if (problema) return error(problema);
      if (comprobacion === "ocupada") return error("Ya existe un artículo con esa dirección. Cambia la dirección de la página.");
    }
    if (modo !== "borrador" && sinTexto(campos.cuerpoHtml)) return error("El artículo todavía no tiene texto. Escribe algo antes de publicarlo.");
    if (typeof navigator !== "undefined" && navigator.onLine === false) return error(SIN_CONEXION_CAMBIOS);

    // Qué estado y fecha le tocan
    const ahora = new Date();
    let estado: Exclude<Estado, "papelera"> = "borrador";
    let fecha: string | undefined = opciones.fecha;
    let aviso = "";
    if (modo === "borrador") {
      if ((estadoActual === "publicado" || estadoActual === "programado") && !opciones.confirmadoBorrador) {
        setPregunta({ tipo: "borrador" });
        return;
      }
    } else if (modo === "publicar") {
      estado = "publicado";
      if (estadoActual !== "publicado" && !fecha) fecha = ahora.toISOString();
    } else {
      const utc = madridAUtc(fechaLocal);
      if (!utc) return error("La fecha y la hora no son válidas. Revisa el día y la hora (hora de España).");
      if (new Date(utc).getTime() <= ahora.getTime()) {
        estado = "publicado";
        fecha = ahora.toISOString();
        aviso = "Esa fecha ya había pasado, así que el artículo se ha publicado ahora. ";
      } else {
        estado = "programado";
        fecha = utc;
      }
    }

    guardando.current = true;
    setOcupado(true);
    try {
      const guardado: Campos = {
        ...campos,
        extracto: campos.extracto.trim() || extractoDesde(campos.cuerpoHtml),
        etiquetas: etiquetasDe(etiquetasTexto),
        portada: campos.portada ? { ...campos.portada, tarjeta: campos.portada.tarjeta || urlTarjeta(campos.portada.src) } : null,
      };
      const id2 = esNuevo ? direccion : idArticulo || id!;
      const r = await guardarArticulo(db, {
        id: id2, esNuevo, cargadoEn, campos: guardado, estado, fechaPublicacion: fecha, usuario: correo, forzar: opciones.forzar,
      });
      const eraPublicable = estadoActual === "publicado" || estadoActual === "programado";
      if (estado !== "borrador" || eraPublicable) void marcarPublicarPendiente(db);
      if (esNuevo) window.history.replaceState(null, "", "#/editar/" + encodeURIComponent(id2));
      setIdArticulo(id2);
      setEsNuevo(false);
      setCargadoEn(r.actualizadoEn);
      setEstadoActual(estado);
      if (fecha) setFechaActual(fecha);
      setCampos(guardado);
      setSucio(false);
      setConflicto(null);
      setVerOtro(false);
      setProgramando(false);
      setGuardados((n) => n + 1);
      const hasta = estado === "programado" ? fechaHoraLlana(fecha!) : "";
      setMensaje({
        tipo: "ok",
        texto:
          aviso +
          (estado === "borrador"
            ? "Borrador guardado."
            : estado === "programado"
              ? `Programado para el ${hasta} (hora de España).`
              : "Publicado.") +
          (estado === "borrador" ? "" : " Pulsa «Publicar cambios» en el inicio para que se vea en la web."),
      });
    } catch (e) {
      if (e instanceof ErrorArticulo && e.code === "articulo/conflicto") {
        setConflicto({ otro: e.detalle!.actual as Articulo, modo, fecha: opciones.fecha });
        setVerOtro(false);
      } else {
        setMensaje({ tipo: "error", texto: mensajeDeCambio(e) });
      }
    } finally {
      guardando.current = false;
      setOcupado(false);
    }
  }

  function quedarmeConLoDelOtro() {
    if (!conflicto) return;
    const { otro } = conflicto;
    setCampos(camposDe(otro));
    setEtiquetasTexto(otro.etiquetas.join(", "));
    setEstadoActual(otro.estado);
    setFechaActual(otro.fechaPublicacion);
    setCargadoEn(otro.actualizadoEn);
    setClaveTexto((c) => c + 1);
    setSucio(false);
    setConflicto(null);
    setVerOtro(false);
    setMensaje({ tipo: "info", texto: "Ahora ves la versión de la otra persona. Tus cambios sin guardar se han descartado." });
  }

  function aplicarVersion(v: Version) {
    setCampos(camposDe(v));
    setEtiquetasTexto(v.etiquetas.join(", "));
    setClaveTexto((c) => c + 1);
    setSucio(true);
    setMensaje({
      tipo: "info",
      texto: `Has cargado la versión del ${fechaHoraLlana(v.actualizadoEn || v.guardadoEn)}. Todavía no está guardada: pulsa «Guardar borrador» o «Publicar» para quedarte con ella.`,
    });
  }

  const salir = () => (sucio ? setPregunta({ tipo: "salir" }) : irA("articulos"));

  // --- Pantalla -----------------------------------------------------------------------------------------------------
  if (cargando) return <Cargando />;
  if (errorCarga) {
    return (
      <main className="pantalla-editor">
        <Aviso tipo="error">{errorCarga}</Aviso>
        <Boton onClick={() => irA("articulos")}>Volver a Mis artículos</Boton>
      </main>
    );
  }
  if (estadoActual === "papelera") {
    return (
      <main className="pantalla-editor">
        <Aviso>Este artículo está en la papelera. Para editarlo, recupéralo desde «Mis artículos».</Aviso>
        <Boton onClick={() => irA("articulos")}>Volver a Mis artículos</Boton>
      </main>
    );
  }

  const publicado = estadoActual === "publicado";
  const problemaDir = esNuevo ? problemaDeDireccion(direccion) : null;
  const bloqueado = ocupado || subiendo;
  const etiquetasPortada = campos.portada;
  const diferencias = conflicto ? NOMBRES_CAMPO.filter(([k]) => JSON.stringify(conflicto.otro[k]) !== JSON.stringify(k === "etiquetas" ? etiquetasDe(etiquetasTexto) : campos[k])) : [];

  return (
    <main className="pantalla-editor">
      <header className="barra">
        <h1>{esNuevo ? "Escribir artículo" : "Editar artículo"}</h1>
        <Boton onClick={salir}>Volver a Mis artículos</Boton>
      </header>
      {estadoActual && (
        <p className="meta-articulo">
          <span className={`etiqueta etiqueta-${estadoActual}`}>{NOMBRE_ESTADO[estadoActual]}</span>
          {estadoActual === "programado" && fechaActual && <span>Se publicará el {fechaHoraLlana(fechaActual)} (hora de España)</span>}
        </p>
      )}

      <div className="campos-editor">
        <label>
          Título (obligatorio)
          <input ref={tituloRef} type="text" value={campos.titulo} maxLength={200} onChange={(e) => alCambiarTitulo(e.target.value)} />
        </label>

        <label>
          Subtítulo
          <input type="text" value={campos.subtitulo} maxLength={300} onChange={(e) => cambiar("subtitulo", e.target.value)} />
        </label>

        <div className="campo-direccion">
          <label>
            Dirección de la página
            {esNuevo ? (
              <input
                type="text"
                value={direccion}
                aria-describedby="ayuda-direccion"
                onChange={(e) => {
                  setDireccionTocada(true);
                  setDireccion(e.target.value.toLowerCase());
                  setSucio(true);
                }}
                onBlur={() => setDireccion((d) => limpiarDireccion(d))}
              />
            ) : (
              <input type="text" value={direccion} readOnly aria-describedby="ayuda-direccion" />
            )}
          </label>
          <p id="ayuda-direccion" className="pista">
            Así se verá: {SERVIDOR}/<strong>{direccion || "…"}</strong>/
            {!esNuevo && <> · La dirección no se puede cambiar una vez publicado.</>}
          </p>
          {problemaDir && direccion !== "" && <Aviso tipo="error">{problemaDir}</Aviso>}
          {esNuevo && !problemaDir && comprobacion === "ocupada" && (
            <Aviso tipo="error">Ya existe un artículo con esa dirección. Cambia la dirección de la página para no pisarlo.</Aviso>
          )}
        </div>

        <label>
          Autor
          <input type="text" value={campos.autor} placeholder="Nombre que aparecerá como autor" onChange={(e) => cambiar("autor", e.target.value)} />
        </label>

        <fieldset>
          <legend>Secciones</legend>
          <div className="casillas">
            {SECCIONES.map((s) => (
              <label key={s.slug} className="casilla">
                <input
                  type="checkbox"
                  checked={campos.secciones.includes(s.slug)}
                  onChange={(e) => cambiar("secciones", e.target.checked ? [...campos.secciones, s.slug] : campos.secciones.filter((x) => x !== s.slug))}
                />
                {s.nombre}
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          Etiquetas (separadas por comas)
          <input
            type="text"
            value={etiquetasTexto}
            onChange={(e) => {
              setEtiquetasTexto(e.target.value);
              setSucio(true);
            }}
          />
        </label>

        <fieldset>
          <legend>Foto de portada</legend>
          <div
            className="zona-portada"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void subirPortada(e.dataTransfer.files?.[0]);
            }}
          >
            {etiquetasPortada ? (
              <img className="portada-vista" src={etiquetasPortada.src} alt={etiquetasPortada.alt || "Foto de portada"} />
            ) : (
              <p>Arrastra una foto hasta aquí, o pulsa «Elegir foto».</p>
            )}
            <p className="pista">La portada se muestra con proporción 16:9 (panorámica); los bordes de la foto pueden quedar recortados.</p>
            <div className="fila-botones fila-izquierda">
              <Boton disabled={subiendo} onClick={() => archivoPortada.current?.click()}>
                {subiendo ? "Subiendo la foto…" : etiquetasPortada ? "Cambiar foto" : "Elegir foto"}
              </Boton>
              {etiquetasPortada && (
                <Boton onClick={() => cambiar("portada", null)}>Quitar foto</Boton>
              )}
            </div>
            <input ref={archivoPortada} type="file" accept="image/*" hidden data-testid="elegir-portada" onChange={(e) => void subirPortada(e.target.files?.[0])} />
          </div>
          {etiquetasPortada && (
            <label>
              Descripción de la foto (para quien no la puede ver)
              <input type="text" value={etiquetasPortada.alt} onChange={(e) => cambiar("portada", { ...etiquetasPortada, alt: e.target.value })} />
            </label>
          )}
        </fieldset>

        <label>
          Extracto (si lo dejas vacío, se genera solo)
          <textarea rows={3} value={campos.extracto} maxLength={400} onChange={(e) => cambiar("extracto", e.target.value)} />
        </label>

        <div>
          <span className="rotulo">Texto del artículo</span>
          <EditorTexto key={claveTexto} inicial={campos.cuerpoHtml} alCambiar={alCambiarTexto} alAviso={alAviso} />
        </div>

        <label className="casilla">
          <input type="checkbox" checked={campos.destacado} onChange={(e) => cambiar("destacado", e.target.checked)} />
          Destacar en portada
        </label>
      </div>

      {vistaPrevia && (
        <article className="articulo vista-previa" aria-label="Vista previa">
          <p className="pista">Así se verá en la web.</p>
          {campos.secciones.map((s) => (
            <span key={s} className="etiqueta" style={{ marginRight: 12 }}>{nombreDeSeccion(s)}</span>
          ))}
          <h1>{campos.titulo || "(Sin título)"}</h1>
          {campos.subtitulo && <p style={{ font: "20px/1.4 var(--serif)" }}>{campos.subtitulo}</p>}
          <div className="meta">{campos.autor}</div>
          {campos.portada && <img className="portada-vista" src={campos.portada.src} alt={campos.portada.alt} />}
          <div className="cuerpo" style={{ marginTop: 24 }} dangerouslySetInnerHTML={{ __html: sanear(campos.cuerpoHtml) }} />
        </article>
      )}

      {verHistorial && !esNuevo && db && (
        <Historial db={db} id={idArticulo || id!} version={guardados} alCerrar={() => setVerHistorial(false)} alVolver={(v) => setPregunta({ tipo: "version", version: v })} />
      )}

      {conflicto && verOtro && (
        <section className="cambios-del-otro" aria-label="Cambios de la otra persona">
          <h2>Lo que cambió la otra persona</h2>
          <p>
            {conflicto.otro.actualizadoPor || "Alguien"} guardó el artículo el {fechaHoraLlana(conflicto.otro.actualizadoEn)}. Esto es lo que es distinto de lo tuyo:
          </p>
          {diferencias.length === 0 ? (
            <p>No se ven diferencias en los campos del artículo.</p>
          ) : (
            <dl>
              {diferencias.map(([k, nombre]) => (
                <div key={k}>
                  <dt>{nombre}</dt>
                  <dd>{resumenCampo(conflicto.otro, k)}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="fila-botones fila-izquierda">
            <Boton onClick={quedarmeConLoDelOtro}>Quedarme con lo de la otra persona</Boton>
            <Boton variante="peligro" disabled={bloqueado} onClick={() => void guardar(conflicto.modo, { forzar: true, fecha: conflicto.fecha })}>
              Guardar los míos de todas formas
            </Boton>
            <Boton onClick={() => setVerOtro(false)}>Seguir editando</Boton>
          </div>
        </section>
      )}

      {programando && !publicado && (
        <div className="programar">
          <label>
            Fecha y hora de publicación (hora de España)
            <input type="datetime-local" value={fechaLocal} onChange={(e) => setFechaLocal(e.target.value)} />
          </label>
          <Boton variante="principal" disabled={bloqueado} onClick={() => void guardar("programar")}>
            Programar para esa hora
          </Boton>
        </div>
      )}

      {mensaje && (
        <Aviso tipo={mensaje.tipo} ref={avisoRef}>
          {mensaje.texto}
        </Aviso>
      )}

      <div className="fila-botones fila-izquierda botones-editor">
        <Boton disabled={bloqueado} onClick={() => void guardar("borrador")}>
          Guardar borrador
        </Boton>
        {!publicado && (
          <Boton disabled={bloqueado} aria-expanded={programando} onClick={() => setProgramando((p) => !p)}>
            Programar
          </Boton>
        )}
        <Boton variante="principal" disabled={bloqueado} onClick={() => void guardar("publicar")}>
          {publicado ? "Guardar y publicar cambios" : "Publicar"}
        </Boton>
        <Boton aria-pressed={vistaPrevia} onClick={() => setVistaPrevia((v) => !v)}>
          {vistaPrevia ? "Cerrar la vista previa" : "Vista previa"}
        </Boton>
        {!esNuevo && (
          <Boton aria-pressed={verHistorial} onClick={() => setVerHistorial((v) => !v)}>
            Historial
          </Boton>
        )}
      </div>

      <Ayuda>
        «Guardar borrador» guarda sin que se vea en la web. «Programar» publica el artículo a la hora que elijas (hora de España). «Publicar» lo publica ya. Cada vez que guardas se conserva una copia, y desde «Historial» puedes volver a cualquiera. Lo que publiques no se ve en la web hasta que pulses «Publicar cambios» en el inicio.
      </Ayuda>

      {conflicto && !verOtro && (
        <Confirmar
          titulo="Este artículo ha cambiado desde que lo abriste"
          textoSi="Guardar los míos de todas formas"
          textoNo="Ver los cambios del otro"
          peligro
          alCancelar={() => setVerOtro(true)}
          alConfirmar={() => void guardar(conflicto.modo, { forzar: true, fecha: conflicto.fecha })}
        >
          <p>
            {conflicto.otro.actualizadoPor || "Otra persona"} lo guardó el {fechaHoraLlana(conflicto.otro.actualizadoEn)}. Si guardas los tuyos, lo que ella escribió se sustituye (queda una copia en el historial).
          </p>
        </Confirmar>
      )}
      {pregunta?.tipo === "borrador" && (
        <Confirmar
          titulo="¿Quitar el artículo de la web?"
          textoSi="Sí, guardar como borrador"
          alCancelar={() => setPregunta(null)}
          alConfirmar={() => {
            setPregunta(null);
            void guardar("borrador", { confirmadoBorrador: true });
          }}
        >
          <p>El artículo está {estadoActual === "programado" ? "programado" : "publicado"}. Si lo guardas como borrador, dejará de verse en la web cuando publiques los cambios.</p>
        </Confirmar>
      )}
      {pregunta?.tipo === "salir" && (
        <Confirmar
          titulo="Tienes cambios sin guardar"
          textoSi="Salir sin guardar"
          textoNo="Seguir editando"
          peligro
          alCancelar={() => setPregunta(null)}
          alConfirmar={() => {
            setPregunta(null);
            setSucio(false);
            irA("articulos");
          }}
        >
          <p>Si sales ahora, se perderá lo que has escrito desde el último guardado.</p>
        </Confirmar>
      )}
      {pregunta?.tipo === "version" && (
        <Confirmar
          titulo="¿Volver a esta versión?"
          textoSi="Sí, volver a esta versión"
          alCancelar={() => setPregunta(null)}
          alConfirmar={() => {
            const v = pregunta.version;
            setPregunta(null);
            aplicarVersion(v);
          }}
        >
          <p>El texto que ves ahora se sustituirá por el de esa versión. No se guarda hasta que pulses un botón de guardar, y lo de ahora quedará en el historial.</p>
        </Confirmar>
      )}
    </main>
  );
}
