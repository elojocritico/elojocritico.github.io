import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
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
  integrations: [sitemap()],
});
