// ════════════════════════════════════════════════════════════════
// SEO MODULE — Generador de XML Sitemaps, RSS Feeds, y canonical
// tags para potenciar el sitio CatólicosGPT en motores de búsqueda
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const APP_URL = process.env.APP_URL || 'https://www.catolicosgpt.com';

// ── Sitemap Generator ──
function generateSitemapXML({ infografias = [], posts = [], sementeras = [] } = {}) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">`;

  const addUrl = (loc, priority = '0.5', changefreq = 'weekly', lastmod = null) => {
    const modStr = lastmod ? `<lastmod>${lastmod}</lastmod>` : `<lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`;
    xml += `
  <url>
    <loc>${APP_URL}${loc}</loc>
    ${modStr}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  };

  // 1. Core pages
  addUrl('/', '1.0', 'daily');
  addUrl('/preguntas-frecuentes', '0.9', 'weekly');
  addUrl('/infografias', '0.8', 'daily');
  addUrl('/blog', '0.8', 'daily');
  addUrl('/podcasts', '0.7', 'weekly');
  addUrl('/videos', '0.7', 'weekly');
  addUrl('/misa-de-hoy', '0.8', 'daily');
  addUrl('/santo-del-dia', '0.8', 'daily');
  addUrl('/liturgia-de-las-horas', '0.8', 'daily');

  // 2. Infografías
  infografias.forEach(inf => {
    const fecha = inf.fechaCreacion ? inf.fechaCreacion.slice(0, 10) : null;
    addUrl(`/infografias/${inf.slug}`, '0.7', 'monthly', fecha);
  });

  // 3. Blog posts
  posts.forEach(p => {
    const fecha = p.fechaCreacion ? p.fechaCreacion.slice(0, 10) : null;
    addUrl(`/blog/${p.slug}`, '0.7', 'weekly', fecha);
  });

  // 4. Secciones SEO temáticas (sementeras)
  sementeras.forEach(sem => {
    addUrl(`/recursos/${sem.slug}`, '0.6', 'weekly');
  });

  xml += '\n</urlset>';
  return xml;
}

// ── RSS Feed ──
function generateRSSFeed({ posts = [], infografias = [] } = {}) {
  let rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>CatólicosGPT — Blog e Infografías</title>
  <link>${APP_URL}</link>
  <description>Asistente Católico Virtual con Inteligencia Artificial, base de datos de catequesis, liturgia, y generador de infografías.</description>
  <language>es-es</language>
  <atom:link href="${APP_URL}/rss.xml" rel="self" type="application/rss+xml" />
  <pubDate>${new Date().toUTCString()}</pubDate>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <generator>CatólicosGPT Engine 2026</generator>`;

  // Combinar posts e infografías
  const combinados = [
    ...posts.map(p => ({
      titulo: p.titulo,
      link: `/blog/${p.slug}`,
      desc: p.extracto || p.descripcion || 'Artículo de formación de fe católico.',
      fecha: new Date(p.fechaCreacion || Date.now()).toUTCString(),
      id: `post-${p.slug}`
    })),
    ...infografias.map(i => ({
      titulo: `${i.titulo || i.tema} (Infografía)`,
      link: `/infografias/${i.slug}`,
      desc: i.metaDescription || 'Visualización catequética interactiva en alta resolución.',
      fecha: new Date(i.fechaCreacion || Date.now()).toUTCString(),
      id: `inf-${i.slug}`
    }))
  ];

  // Ordenar descendente por fecha
  combinados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  combinados.slice(0, 30).forEach(item => {
    rss += `
  <item>
    <title><![CDATA[${item.titulo}]]></title>
    <link>${APP_URL}${item.link}</link>
    <guid isPermaLink="true">${APP_URL}${item.link}</guid>
    <pubDate>${item.fecha}</pubDate>
    <description><![CDATA[${item.desc}]]></description>
  </item>`;
  });

  rss += '\n</channel>\n</rss>';
  return rss;
}

module.exports = { generateSitemapXML, generateRSSFeed };
