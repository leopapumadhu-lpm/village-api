// api/routes/seo.js (optional)
export function getRobotsTxt() {
  return `User-agent: *
Allow: /
Sitemap: ${process.env.API_BASE_URL}/sitemap.xml
Disallow: /admin/
Disallow: /api/`;
}

export function getSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${process.env.API_BASE_URL}/</loc><priority>1.0</priority></url>
  <url><loc>${process.env.API_BASE_URL}/docs</loc><priority>0.9</priority></url>
  <url><loc>${process.env.API_BASE_URL}/api-docs</loc><priority>0.8</priority></url>
</urlset>`;
}
