// Pantalla de Ayuda: muestra el manual (MANUAL.md, incluido al construir la web) por secciones.
import manualTexto from "../../../MANUAL.md?raw";
import { Boton } from "../componentes/Boton";
import { Bloques, leerManual, enLinea } from "../utiles/markdown";
import { irA } from "../ruta";

export const MANUAL = leerManual(manualTexto);

/** Dirección de la sección de ayuda de cada pantalla (la usan los botones «?» y las pruebas). */
export const AYUDA_DE: Record<string, string> = {
  entrar: "entrar",
  inicio: "el-semaforo",
  articulos: "editar-y-deshacer",
  editor: "escribir-y-publicar",
  comentarios: "comentarios",
  publicar: "publicar-cambios",
  ajustes: "ajustes",
  usuarios: "dar-acceso",
};

export function Ayuda({ seccion }: { seccion?: string }) {
  const elegida = MANUAL.secciones.find((s) => s.id === seccion);
  const lista = elegida ? [elegida] : MANUAL.secciones;
  return (
    <main className="pantalla-ayuda">
      <header className="barra">
        <h1>{elegida ? elegida.titulo : "Ayuda"}</h1>
        <Boton onClick={() => irA("")}>Volver al inicio</Boton>
      </header>

      {!elegida && MANUAL.intro.length > 0 && <Bloques bloques={MANUAL.intro} clave="intro" />}
      {seccion && !elegida && <p>No se ha encontrado esa parte del manual. Aquí tienes todo.</p>}

      {!elegida && (
        <nav aria-label="Índice del manual">
          <h2>Índice</h2>
          <ul>
            {MANUAL.secciones.map((s) => (
              <li key={s.id}>
                <a href={"#/ayuda/" + s.id}>{s.titulo}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {lista.map((s) => (
        <section key={s.id} id={"ayuda-" + s.id} aria-label={s.titulo}>
          {!elegida && <h2>{enLinea(s.titulo)}</h2>}
          <Bloques bloques={s.bloques} clave={s.id} />
        </section>
      ))}

      {elegida && (
        <div className="fila-botones fila-izquierda">
          <Boton onClick={() => irA("ayuda")}>Ver todo el manual</Boton>
        </div>
      )}
    </main>
  );
}
