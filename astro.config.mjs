import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import { readFileSync, existsSync } from "node:fs";

const fichero = "./contenido/redirecciones.json";
const redirects = existsSync(fichero)
  ? Object.fromEntries(JSON.parse(readFileSync(fichero, "utf-8")).map((r) => [r.desde, r.hacia]))
  : {};

export default defineConfig({
  site: process.env.EOC_SITE ?? "https://elojocritico.github.io",
  trailingSlash: "always",
  build: { format: "directory" },
  redirects,
  // El panel (/admin/) no entra en el mapa del sitio; React solo se carga alli (client:only).
  integrations: [sitemap({ filter: (pagina) => !new URL(pagina).pathname.startsWith("/admin/") }), react()],
});
