// Entrada discreta al panel: 7 clics rápidos sobre el logo de la cabecera llevan a /admin/ (como en Clave 45).
// Un clic normal sigue llevando a la portada, tras una pausa corta para ver si llegan más clics.

export const CLICS_PARA_ADMIN = 7;
export const VENTANA_MS = 3000; // los 7 clics deben caber en 3 segundos
export const ESPERA_NAVEGAR_MS = 450; // sin más clics en este tiempo, el clic cuenta como normal

export type Decision = "admin" | "esperar";

/** Lleva la cuenta de clics recientes; devuelve "admin" al llegar al umbral (y reinicia la cuenta). */
export function crearContadorClics(umbral = CLICS_PARA_ADMIN, ventanaMs = VENTANA_MS) {
  let marcas: number[] = [];
  return function registrar(ahora: number): Decision {
    marcas = [...marcas.filter((t) => ahora - t < ventanaMs), ahora];
    if (marcas.length >= umbral) {
      marcas = [];
      return "admin";
    }
    return "esperar";
  };
}

/** Engancha el gesto al enlace del logo. Con teclado (detail 0) el enlace funciona como siempre. */
export function engancharGestoAdmin(enlace: HTMLAnchorElement, ir: (url: string) => void = (url) => location.assign(url)) {
  const registrar = crearContadorClics();
  let reloj: ReturnType<typeof setTimeout> | undefined;
  enlace.addEventListener("click", (e) => {
    if (e.detail === 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    clearTimeout(reloj);
    if (registrar(Date.now()) === "admin") {
      ir("/admin/");
      return;
    }
    const destino = enlace.href;
    reloj = setTimeout(() => ir(destino), ESPERA_NAVEGAR_MS);
  });
}
