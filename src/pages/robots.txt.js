// Pide a los buscadores que no indexen el panel ni los comentarios del archivo (los usa el panel).
export function GET({ site }) {
  const base = String(site ?? "").replace(/\/$/, "");
  const cuerpo = ["User-agent: *", "Disallow: /comentarios-archivo/", "Disallow: /admin/", `Sitemap: ${base}/sitemap-index.xml`, ""].join("\n");
  return new Response(cuerpo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
