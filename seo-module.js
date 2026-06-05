// ════════════════════════════════════════════════════════════════
// SEO MODULE V8 — Sitemap dinámico, RSS, robots.txt, Schema.org, IndexNow
// Estrategia: dominar clusters litúrgicos de alto volumen
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://catolicosgpt.com';

// ── Slugify ──
function slugify(text) {
  return (text || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ── Escape XML/HTML ──
function escXml(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escHtml(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════════════════════
// LAYOUT COMPARTIDO — Todas las páginas SEO usan este template
// ══════════════════════════════════════════════════════════════
function renderPage({ title, description, canonical, ogType = 'website', ogImage = '', breadcrumbs = [], schemaLD = [], body, activeNav = '', keywords = '' }) {
  const navLinks = [
    { href: '/evangelio-de-hoy', label: 'Evangelio' },
    { href: '/lecturas-de-hoy', label: 'Lecturas' },
    { href: '/santo-del-dia', label: 'Santo del día' },
    { href: '/oraciones', label: 'Oraciones' },
    { href: '/novenas', label: 'Novenas' },
    { href: '/infografias', label: 'Infografías' },
    { href: '/blog', label: 'Blog' },
    { href: '/', label: 'Chat IA' },
  ];

  const breadcrumbsLD = breadcrumbs.length > 0 ? [{
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((b, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": b.name,
      "item": BASE_URL + b.url
    }))
  }] : [];

  const orgLD = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "CatolicosGPT",
    "url": BASE_URL,
    "logo": BASE_URL + "/favicon.svg",
    "description": "Plataforma católica con inteligencia artificial basada en el Magisterio de la Iglesia",
    "sameAs": []
  };

  const allSchema = [orgLD, ...breadcrumbsLD, ...schemaLD];

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
${keywords ? `<meta name="keywords" content="${escHtml(keywords)}">` : ''}
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${BASE_URL}${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:url" content="${BASE_URL}${canonical}">
${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
<meta property="og:site_name" content="CatolicosGPT">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="CatolicosGPT Feed" href="${BASE_URL}/feed.xml">
<link rel="stylesheet" href="/styles.css">
${allSchema.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')}
<style>
.seo-shell{max-width:860px;margin:0 auto;padding:30px clamp(16px,4vw,32px) 60px}
.seo-hero{text-align:center;padding:50px 20px 24px}
.seo-hero h1{font-family:var(--font-display);font-size:clamp(30px,5vw,48px);font-weight:700;color:var(--espresso);line-height:1.1;margin-bottom:10px}
.seo-hero .it{font-style:italic;color:transparent;background:var(--grad-gold);-webkit-background-clip:text;background-clip:text}
.seo-hero p{font-family:var(--font-display);font-size:clamp(15px,2vw,18px);color:var(--ink-2);max-width:640px;margin:0 auto}
.seo-breadcrumb{font-size:12px;color:var(--ink-3);margin-bottom:20px}
.seo-breadcrumb a{color:var(--gold-deep);text-decoration:none}
.seo-breadcrumb a:hover{text-decoration:underline}
.seo-card{background:#fff;border:1px solid var(--hairline);border-radius:16px;padding:clamp(18px,3vw,28px);margin-bottom:20px;box-shadow:var(--shadow-sm)}
.seo-card h2{font-family:var(--font-display);font-size:clamp(22px,3.5vw,30px);font-weight:700;color:var(--espresso);margin-bottom:12px;line-height:1.2}
.seo-card h3{font-family:var(--font-display);font-size:19px;font-weight:600;color:var(--maroon);margin:22px 0 8px}
.seo-card p{font-family:var(--font-display);font-size:17px;line-height:1.75;color:var(--ink);margin-bottom:14px}
.seo-card blockquote{border-left:4px solid var(--gold);padding:14px 20px;margin:20px 0;background:rgba(188,138,54,.07);border-radius:0 12px 12px 0;font-style:italic;color:var(--coffee);font-size:17px;line-height:1.6}
.seo-card ul,.seo-card ol{margin:12px 0;padding-left:24px;font-size:16px;line-height:1.7}
.seo-card li{margin-bottom:6px}
.seo-card strong{color:var(--espresso)}
.seo-card a{color:var(--gold-deep);text-decoration:underline;text-underline-offset:2px}
.seo-card hr{border:none;border-top:1px solid var(--hairline);margin:24px 0}
.seo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin:20px 0}
.seo-grid-item{background:#fff;border:1px solid var(--hairline);border-radius:12px;padding:16px;text-decoration:none;color:inherit;transition:.15s var(--ease)}
.seo-grid-item:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);border-color:var(--gold)}
.seo-grid-item h3{font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--espresso);margin-bottom:4px}
.seo-grid-item p{font-size:13px;color:var(--ink-2);line-height:1.5;margin:0}
.seo-grid-item .tag{font-size:10px;font-weight:700;color:var(--gold-deep);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;display:block}
.seo-footer-links{max-width:1200px;margin:0 auto;padding:40px clamp(16px,4vw,32px);display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:24px}
.seo-footer-links h4{font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--espresso);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
.seo-footer-links a{display:block;font-size:13px;color:var(--ink-2);text-decoration:none;padding:3px 0;line-height:1.5}
.seo-footer-links a:hover{color:var(--gold-deep)}
.seo-cta{text-align:center;padding:40px 20px;background:var(--cream-2);border-radius:20px;margin:30px 0}
.seo-cta h3{font-family:var(--font-display);font-size:22px;color:var(--espresso);margin-bottom:8px}
.seo-cta p{color:var(--ink-2);font-size:15px;margin-bottom:16px}
.seo-cta a{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:var(--grad-gold);color:#3a2a0c;font-weight:700;border-radius:99px;text-decoration:none;font-size:14px;transition:.15s}
.seo-cta a:hover{transform:translateY(-1px);box-shadow:var(--shadow-md)}
.seo-table{width:100%;border-collapse:collapse;margin:16px 0;font-size:15px}
.seo-table th{background:var(--cream-2);text-align:left;padding:10px 14px;font-size:13px;font-weight:700;color:var(--espresso);text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--gold)}
.seo-table td{padding:10px 14px;border-bottom:1px solid var(--hairline);color:var(--ink);vertical-align:top}
.seo-table tr:hover td{background:rgba(188,138,54,.04)}
@media(max-width:768px){
  .nav{padding:8px 12px;height:56px}
  .brand-mark{width:28px;height:28px}
  .brand-word{font-size:15px}
  .nav-link:not(.active):not(.nav-user){display:none}
  .seo-hero{padding:30px 16px 16px}
  .seo-grid{grid-template-columns:1fr}
  .seo-footer-links{grid-template-columns:1fr 1fr}
}
</style>
</head>
<body>
<header class="nav">
  <a href="/" class="brand" style="text-decoration:none">
    <div class="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold-deep)" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 5v13M8 9h8"/></svg></div>
    <span class="brand-word">Católicos<span class="gpt">GPT</span></span>
  </a>
  <nav class="nav-links">
    ${navLinks.map(n => `<a class="nav-link${activeNav === n.href ? ' active' : ''}" href="${n.href}" style="text-decoration:none">${n.label}</a>`).join('\n    ')}
  </nav>
</header>

${body}

<!-- ═══ FOOTER SEO — INTERNAL LINKING ═══ -->
<footer style="background:var(--cream-3);border-top:1px solid var(--hairline)">
  <div class="seo-footer-links">
    <div>
      <h4>Liturgia diaria</h4>
      <a href="/evangelio-de-hoy">Evangelio de hoy</a>
      <a href="/lecturas-de-hoy">Lecturas de hoy</a>
      <a href="/santo-del-dia">Santo del día</a>
      <a href="/misas">Horarios de misa</a>
    </div>
    <div>
      <h4>Oraciones</h4>
      <a href="/oraciones">Todas las oraciones</a>
      <a href="/oraciones/padre-nuestro">Padre Nuestro</a>
      <a href="/oraciones/ave-maria">Ave María</a>
      <a href="/oraciones/rosario">Santo Rosario</a>
    </div>
    <div>
      <h4>Novenas</h4>
      <a href="/novenas">Todas las novenas</a>
      <a href="/novenas/san-jose">Novena a San José</a>
      <a href="/novenas/divina-misericordia">Divina Misericordia</a>
      <a href="/novenas/guadalupe">Virgen de Guadalupe</a>
    </div>
    <div>
      <h4>Recursos</h4>
      <a href="/infografias">Infografías católicas</a>
      <a href="/blog">Blog católico</a>
      <a href="/videos">Videos</a>
      <a href="/podcast">Podcast</a>
      <a href="/santos">Santoral</a>
    </div>
    <div>
      <h4>Herramientas IA</h4>
      <a href="/">Chat con IA católica</a>
      <a href="/infografias/crear">Crear infografía con IA</a>
      <a href="/planes">Planes premium</a>
    </div>
  </div>
  <div style="text-align:center;padding:20px;font-size:12px;color:var(--ink-3);border-top:1px solid var(--hairline)">
    © ${new Date().getFullYear()} <a href="/" style="color:var(--gold-deep);text-decoration:none;font-weight:600">CatolicosGPT</a> — Basado en el Magisterio de la Iglesia Católica · <a href="/blog" style="color:var(--gold-deep);text-decoration:none">Blog</a> · <a href="/feed.xml" style="color:var(--gold-deep);text-decoration:none">RSS</a> · <a href="/sitemap.xml" style="color:var(--gold-deep);text-decoration:none">Sitemap</a>
  </div>
</footer>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════
// ROBOTS.TXT
// ══════════════════════════════════════════════════════════════
function generateRobotsTxt() {
  return `User-agent: *
Allow: /

# Programmatic SEO pages
Allow: /evangelio-de-hoy
Allow: /lecturas-de-hoy
Allow: /santo-del-dia
Allow: /oraciones/
Allow: /novenas/
Allow: /santos
Allow: /blog/
Allow: /infografias/
Allow: /podcast/
Allow: /videos

# Admin
Disallow: /admin
Disallow: /api/admin/

# Assets
Disallow: /api/auth/

Sitemap: ${BASE_URL}/sitemap.xml
`;
}

// ══════════════════════════════════════════════════════════════
// RSS FEED
// ══════════════════════════════════════════════════════════════
function generateRSS(blogPosts = [], infografias = [], podcasts = []) {
  const now = new Date().toUTCString();
  const items = [];

  // Blog posts
  blogPosts.slice(0, 20).forEach(p => {
    items.push({
      title: p.titulo || '',
      link: `${BASE_URL}/blog/${p.slug}`,
      description: p.descripcion || p.extracto || '',
      pubDate: new Date(p.fechaCreacion || Date.now()).toUTCString(),
      category: p.categoria || 'artículo'
    });
  });

  // Infografías
  infografias.slice(0, 10).forEach(i => {
    items.push({
      title: i.titulo || i.tema || '',
      link: `${BASE_URL}/infografias/${i.slug}`,
      description: i.descripcion || '',
      pubDate: new Date(i.fechaCreacion || Date.now()).toUTCString(),
      category: 'infografía'
    });
  });

  // Podcasts
  podcasts.slice(0, 10).forEach(p => {
    items.push({
      title: p.titulo || '',
      link: `${BASE_URL}/podcast/${p.slug}`,
      description: p.descripcion || '',
      pubDate: new Date(p.fechaCreacion || Date.now()).toUTCString(),
      category: 'podcast'
    });
  });

  // Sort by date desc
  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>CatolicosGPT — Blog y contenido católico</title>
  <link>${BASE_URL}</link>
  <description>Artículos, infografías, podcasts y recursos católicos basados en el Magisterio de la Iglesia</description>
  <language>es</language>
  <lastBuildDate>${now}</lastBuildDate>
  <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
  <image>
    <url>${BASE_URL}/favicon.svg</url>
    <title>CatolicosGPT</title>
    <link>${BASE_URL}</link>
  </image>
${items.map(i => `  <item>
    <title>${escXml(i.title)}</title>
    <link>${i.link}</link>
    <guid isPermaLink="true">${i.link}</guid>
    <description>${escXml(i.description)}</description>
    <pubDate>${i.pubDate}</pubDate>
    <category>${escXml(i.category)}</category>
  </item>`).join('\n')}
</channel>
</rss>`;
}

// ══════════════════════════════════════════════════════════════
// SITEMAP DINÁMICO COMPLETO
// ══════════════════════════════════════════════════════════════
function generateSitemap({ infografias = [], blogPosts = [], podcasts = [], seoTopics = [], oraciones = [], novenas = [], santosMeses = [] }) {
  const today = new Date().toISOString().slice(0, 10);

  const urls = [];
  const add = (loc, freq, prio, lastmod = today, image = null) => urls.push({ loc, freq, prio, lastmod, image });

  // ── Estáticas de alto valor ──
  add('/', 'daily', '1.0');
  add('/evangelio-de-hoy', 'daily', '0.98');
  add('/lecturas-de-hoy', 'daily', '0.98');
  add('/santo-del-dia', 'daily', '0.95');
  add('/oraciones', 'weekly', '0.90');
  add('/novenas', 'weekly', '0.90');
  add('/santos', 'monthly', '0.85');
  add('/infografias', 'daily', '0.90');
  add('/blog', 'weekly', '0.85');
  add('/podcast', 'weekly', '0.80');
  add('/videos', 'weekly', '0.80');
  add('/misas', 'daily', '0.80');
  add('/planes', 'monthly', '0.60');

  // ── Oraciones individuales ──
  oraciones.forEach(o => {
    const slug = slugify(o.nombre);
    add('/oraciones/' + slug, 'monthly', '0.75');
  });

  // ── Novenas individuales ──
  novenas.forEach(n => {
    const slug = slugify(n.nombre);
    add('/novenas/' + slug, 'monthly', '0.75');
  });

  // ── Infografías ──
  infografias.forEach(i => {
    const img = i.imagenes?.[0]?.url || null;
    add('/infografias/' + i.slug, 'monthly', '0.80', i.fechaISO || today, img ? { url: img, title: i.titulo || i.tema || '' } : null);
  });

  // ── Blog posts admin ──
  blogPosts.forEach(p => {
    add('/blog/' + p.slug, 'weekly', '0.80', (p.fechaModificacion || p.fechaCreacion || '').slice(0, 10) || today);
  });

  // ── Blog SEO topics legacy ──
  seoTopics.forEach(t => {
    add('/blog/' + t.slug, 'weekly', '0.75');
  });

  // ── Podcasts ──
  podcasts.forEach(p => {
    add('/podcast/' + p.slug, 'monthly', '0.70', (p.fechaCreacion || '').slice(0, 10) || today);
  });

  // ── Santoral por mes ──
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  meses.forEach(m => {
    add('/santos/' + m, 'monthly', '0.70');
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(u => {
    let xml = `  <url><loc>${BASE_URL}${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.prio}</priority>`;
    if (u.image) {
      xml += `<image:image><image:loc>${escXml(u.image.url)}</image:loc><image:title>${escXml(u.image.title)}</image:title></image:image>`;
    }
    xml += '</url>';
    return xml;
  }).join('\n')}
</urlset>`;
}

// ══════════════════════════════════════════════════════════════
// IndexNow — notificar a Bing/Yandex de nuevo contenido
// ══════════════════════════════════════════════════════════════
async function pingIndexNow(urlPath) {
  const key = 'catolicosgpt-indexnow-key';
  try {
    await fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(BASE_URL + urlPath)}&key=${key}`, {
      signal: AbortSignal.timeout(5000)
    });
    console.log('[IndexNow] Pinged:', urlPath);
  } catch(e) {
    console.warn('[IndexNow]', e.message);
  }
}

module.exports = {
  BASE_URL, slugify, escXml, escHtml,
  renderPage, generateRobotsTxt, generateRSS, generateSitemap, pingIndexNow
};
