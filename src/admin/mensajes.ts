export const SIN_PERMISO = "Tu correo no tiene permiso para entrar. Pide acceso a un administrador.";
export const SIN_CONEXION = "No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.";
export const SIN_CONFIGURAR = "El panel aún no está configurado. Avisa a la persona que administra la web.";
export const CORREO_ENVIADO =
  "Te hemos enviado un correo para confirmar tu dirección. Ábrelo, pulsa el enlace y vuelve a entrar.";

/** Traduce los codigos de error de Firebase a frases en llano. */
export function mensajeDeError(error: unknown): string {
  const codigo = String((error as { code?: string } | null)?.code ?? "");
  switch (codigo) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "El correo o la contraseña no son correctos. Revísalos e inténtalo de nuevo.";
    case "auth/invalid-email":
      return "Ese correo no parece correcto. Revisa que esté bien escrito.";
    case "auth/missing-password":
      return "Escribe tu contraseña.";
    case "auth/too-many-requests":
      return "Has probado demasiadas veces. Espera unos minutos y vuelve a intentarlo.";
    case "auth/user-disabled":
      return "Esta cuenta está desactivada. Pide ayuda a un administrador.";
    case "auth/network-request-failed":
    case "unavailable":
      return SIN_CONEXION;
    case "permission-denied":
    case "auth/unauthorized-user":
      return SIN_PERMISO;
    default:
      return "Algo no ha ido bien. Inténtalo de nuevo en un momento.";
  }
}
