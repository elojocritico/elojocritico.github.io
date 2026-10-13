import { configurado } from "./firebase";
import { usarSesion } from "./sesion";
import { usarRuta, irA } from "./ruta";
import { Cargando } from "./componentes/Cargando";
import { Aviso } from "./componentes/Aviso";
import { Boton } from "./componentes/Boton";
import { Entrar } from "./pantallas/Entrar";
import { Inicio } from "./pantallas/Inicio";
import { Articulos } from "./pantallas/Articulos";
import { Comentarios } from "./pantallas/Comentarios";
import { Editor } from "./pantallas/Editor";
import { Ajustes } from "./pantallas/Ajustes";
import { Usuarios } from "./pantallas/Usuarios";
import { Publicar } from "./pantallas/Publicar";
import { SIN_CONFIGURAR } from "./mensajes";

function Pronto() {
  return (
    <main>
      <Aviso>Esta pantalla estará lista muy pronto.</Aviso>
      <Boton onClick={() => irA("")}>Volver al inicio</Boton>
    </main>
  );
}

function Panel() {
  const sesion = usarSesion();
  const ruta = usarRuta();
  if (sesion.cargando) return <Cargando />;
  if (!sesion.usuario || !sesion.papel) return <Entrar errorInicial={sesion.error} />;
  if (ruta.pantalla === "inicio") return <Inicio usuario={sesion.usuario} papel={sesion.papel} />;
  if (ruta.pantalla === "articulos") return <Articulos usuario={sesion.usuario} papel={sesion.papel} />;
  if (ruta.pantalla === "comentarios") return <Comentarios usuario={sesion.usuario} />;
  if (ruta.pantalla === "nuevo") return <Editor key="nuevo" usuario={sesion.usuario} />;
  if (ruta.pantalla === "editar" && ruta.id) return <Editor key={ruta.id} usuario={sesion.usuario} id={ruta.id} />;
  if (ruta.pantalla === "ajustes") return <Ajustes usuario={sesion.usuario} papel={sesion.papel} />;
  if (ruta.pantalla === "usuarios") return <Usuarios usuario={sesion.usuario} papel={sesion.papel} />;
  if (ruta.pantalla === "publicar") return <Publicar usuario={sesion.usuario} />;
  return <Pronto />;
}

export default function App() {
  if (!configurado) {
    return (
      <main>
        <Aviso tipo="error">{SIN_CONFIGURAR}</Aviso>
      </main>
    );
  }
  return <Panel />;
}
