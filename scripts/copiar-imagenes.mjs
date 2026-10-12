// Solo en local: copia ../imagenes a public/img. En producción las sirve el repositorio "img" (plan 4).
import { cpSync, existsSync } from "node:fs";
const origen = process.env.EOC_IMAGENES ?? "../imagenes";
if (!existsSync(origen)) { console.log(`No hay ${origen}; se omite`); process.exit(0); }
cpSync(origen, "public/img", { recursive: true });
console.log(`Imágenes copiadas desde ${origen}`);
