import { configurado } from "./firebase";
import { usarSesion } from "./sesion";
import { usarRuta, irA } from "./ruta";
import { Cargando } from "./componentes/Cargando";
import { Aviso } from "./componentes/Aviso";
import { Boton } from "./componentes/Boton";
import { Entrar } from "./pantallas/Entrar";
import { Inicio } from "./pantallas/Inicio";
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
