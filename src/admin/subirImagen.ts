// Subida de fotos. Adaptado de Clave 45 (lib/cloudinary-upload.ts): se comprime en el navegador y se sube a Cloudinary
// con un preset sin firma, así que en el código no hay ninguna clave. Sin configuración, o con el simulador, la foto se
// queda dentro de la propia página (URL "data:") y se avisa claramente.
import imageCompression from "browser-image-compression";

export const AVISO_PRUEBA = "Modo de prueba: la foto no se guarda en internet";
export const CARPETA = "elojocritico";
const MAX_ANCHO = 1920;
const MAX_MB = 1.5;
const MAX_PRUEBA_BYTES = 400 * 1024; // en modo de prueba la foto va dentro del artículo, que no puede pasar de 1 MB

export type Subida = { url: string; aviso?: string };

export class ErrorSubida extends Error {}

const comprimible = (f: File) => f.type.startsWith("image/") && f.type !== "image/svg+xml" && f.type !== "image/gif";

async function comprimir(file: File, maxMB: number, ancho: number): Promise<File> {
  if (!comprimible(file)) return file;
  try {
    return await imageCompression(file, { maxSizeMB: maxMB, maxWidthOrHeight: ancho, useWebWorker: true, initialQuality: 0.85 });
  } catch {
    return file; // si no se puede comprimir se sube tal cual
  }
}

function aDataUrl(file: Blob): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => mal(new ErrorSubida("No se ha podido leer la foto."));
    r.readAsDataURL(file);
  });
}

/** Sube una foto y devuelve su dirección. Lanza ErrorSubida con un mensaje en llano si algo falla. */
export async function subirImagen(file: File): Promise<Subida> {
  if (!file.type.startsWith("image/")) throw new ErrorSubida("Ese archivo no es una foto. Elige una imagen (JPG, PNG o WebP).");
  const nube = import.meta.env.PUBLIC_CLOUDINARY_NUBE;
  const preset = import.meta.env.PUBLIC_CLOUDINARY_PRESET;

  if (import.meta.env.PUBLIC_EMULADOR === "1" || !nube || !preset) {
    const pequena = await comprimir(file, MAX_PRUEBA_BYTES / 1048576, 1280);
    if (pequena.size > MAX_PRUEBA_BYTES) throw new ErrorSubida("En modo de prueba la foto es demasiado grande. Elige una más pequeña.");
    return { url: await aDataUrl(pequena), aviso: AVISO_PRUEBA };
  }

  const lista = await comprimir(file, MAX_MB, MAX_ANCHO);
  const form = new FormData();
  form.append("file", lista);
  form.append("upload_preset", preset);
  form.append("folder", CARPETA);
  let res: Response;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(nube)}/image/upload`, { method: "POST", body: form });
  } catch {
    throw new ErrorSubida("No se ha podido subir la foto. Revisa tu conexión y vuelve a intentarlo.");
  }
  if (!res.ok) throw new ErrorSubida("No se ha podido subir la foto. Inténtalo de nuevo; si sigue fallando, avisa a quien administra la web.");
  const datos = (await res.json().catch(() => null)) as { secure_url?: string } | null;
  if (!datos?.secure_url?.startsWith("https://")) throw new ErrorSubida("La subida de la foto no ha terminado bien. Inténtalo de nuevo.");
  return { url: datos.secure_url };
}

/** Miniatura 16:9 para las tarjetas. Con fotos de Cloudinary se pide ya recortada; con otras, se usa la misma dirección. */
export function urlTarjeta(src: string): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(src);
  return m ? `${m[1]}c_fill,ar_16:9,w_640,q_auto,f_auto/${m[2]}` : src;
}
