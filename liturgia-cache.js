// ════════════════════════════════════════════════════════════════
// LITURGIA CACHE — Scraping diario con cache 24h
// Fuentes: dominicos.org (lecturas + predica) + iBreviary (Liturgia de las Horas)
// Fallback: Ordo Colombiano + Magisterium AI
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {} }
const CACHE_PATH = path.join(DATA_DIR, 'liturgia-cache.json');

let memCache = null;

function todayBogota() {
  // Bogotá UTC-5 — calculamos la fecha local
  const now = new Date();
  const offset = -5 * 60; // minutos desde UTC
  const bogotaTime = new Date(now.getTime() + (offset - now.getTimezoneOffset()) * 60000);
  return bogotaTime.toISOString().slice(0, 10);
}

function loadCache() {
  if (memCache) return memCache;
  try { memCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')); return memCache; }
  catch(e) { return { date: '', items: {} }; }
}

function saveCache(cache) {
  memCache = cache;
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)); }
  catch(e) { console.error('[Liturgia Cache] save:', e.message); }
}

// Helper: limpiar HTML a texto plano
function htmlToText(html, maxLen = 5000) {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen);
}

// ── SCRAPER 1: Dominicos.org — Lecturas del día + predica ──
async function scrapeDominicos() {
  try {
    const r = await fetch('https://www.dominicos.org/predicacion/evangelio-del-dia/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();

    // Intentar múltiples selectores — dominicos cambia su HTML periódicamente
    const contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i) ||
                         html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                         html.match(/<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                         html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<footer/i) ||
                         html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (!contentMatch) throw new Error('No content block found');
    const block = contentMatch[1];

    // Parse readings — buscar h2, h3 y también strong/b como separadores
    const lecturas = [];
    const sectionRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>([\s\S]*?)(?=<h[23]|<\/article|<\/main|<footer|$)/gi;
    let m;
    while ((m = sectionRegex.exec(block)) !== null) {
      const titulo = htmlToText(m[1], 200);
      const texto = htmlToText(m[2], 2500);
      if (titulo && texto && titulo.length > 3 && texto.length > 30) {
        lecturas.push({ titulo, texto });
      }
    }

    // Fallback: si no encontró secciones h2/h3, intentar con párrafos grandes
    if (lecturas.length === 0) {
      const fullText = htmlToText(block, 8000);
      if (fullText.length > 100) {
        lecturas.push({ titulo: 'Lectura del día', texto: fullText });
      }
    }

    if (lecturas.length === 0) throw new Error('No lecturas found after parsing');

    // Try to extract predica (homily)
    const predicaMatch = block.match(/(?:comentario|predicaci[óo]n|reflexi[óo]n|homil[ií]a)[\s\S]{0,200}<\/h[23]>([\s\S]*?)(?=<h[23]|<\/article|$)/i);
    const predica = predicaMatch ? htmlToText(predicaMatch[1], 3500) : null;

    console.log('[Liturgia] ✅ Dominicos: ' + lecturas.length + ' lecturas' + (predica ? ' + predica' : ''));
    return { fuente: 'dominicos.org', url: 'https://www.dominicos.org/predicacion/evangelio-del-dia/', lecturas, predica };
  } catch(e) {
    console.warn('[Liturgia] Dominicos scrape failed:', e.message);
    return null;
  }
}

// ── SCRAPER 2: iBreviary — Liturgia de las Horas (Laudes, Vísperas, Completas) ──
async function scrapeIBreviary(hora) {
  // Mapeo: laudes/visperas/completas → URL de iBreviary
  const map = {
    laudes: 'lodi',     // iBreviary italiano usa estos slugs
    visperas: 'vespri',
    completas: 'compieta',
    oficio: 'ufficio'
  };
  const slug = map[hora];
  if (!slug) return null;
  try {
    // iBreviary tiene versión española
    const url = `https://www.ibreviary.com/m/preghiere.php?lang=spagnolo&s=${slug}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 CatolicosGPT' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    const text = htmlToText(html, 8000);
    if (text.length < 200) throw new Error('Contenido vacío');
    return { fuente: 'ibreviary.com', url, texto: text };
  } catch(e) {
    console.warn('[Liturgia] iBreviary scrape failed para', hora, ':', e.message);
    return null;
  }
}

// ── SCRAPER 3: Ordo Colombiano (fallback) ──
async function scrapeOrdoColombiano() {
  try {
    const r = await fetch('https://web-ordo-colombiano.cec.org.co/detalle-solo-liturgia-horas', {
      headers: { 'User-Agent': 'Mozilla/5.0 CatolicosGPT' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    const text = htmlToText(html, 10000);
    return { fuente: 'ordo-colombiano', url: 'https://web-ordo-colombiano.cec.org.co/detalle-solo-liturgia-horas', texto: text };
  } catch(e) {
    console.warn('[Liturgia] Ordo Colombiano scrape failed:', e.message);
    return null;
  }
}

// ── SCRAPER 4: Ciudad Redonda (backup lecturas) ──
async function scrapeCiudadRedonda() {
  try {
    const r = await fetch('https://www.ciudadredonda.org/evangelio-lecturas-hoy/', {
      headers: { 'User-Agent': 'Mozilla/5.0 CatolicosGPT' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    
    const lecturas = [];
    // Ciudad Redonda estructura: secciones con h3 o h4 para cada lectura
    const sectionRegex = /<h[234][^>]*>([\s\S]*?)<\/h[234]>([\s\S]*?)(?=<h[234]|<footer|<div[^>]*class="[^"]*footer|$)/gi;
    let m;
    while ((m = sectionRegex.exec(html)) !== null) {
      const titulo = htmlToText(m[1], 200).trim();
      const texto = htmlToText(m[2], 2500).trim();
      if (titulo && texto && titulo.length > 3 && texto.length > 30 &&
          !titulo.toLowerCase().includes('comentario') && !titulo.toLowerCase().includes('cookie')) {
        lecturas.push({ titulo, texto });
      }
    }
    
    if (lecturas.length === 0) throw new Error('No se encontraron lecturas');
    console.log('[Liturgia] ✅ Ciudad Redonda: ' + lecturas.length + ' lecturas');
    return { fuente: 'ciudadredonda.org', url: 'https://www.ciudadredonda.org/evangelio-lecturas-hoy/', lecturas };
  } catch(e) {
    console.warn('[Liturgia] Ciudad Redonda scrape failed:', e.message);
    return null;
  }
}

// ── SCRAPER 5: Evangeli.net (backup evangelio) ──
async function scrapeEvangeli() {
  try {
    const r = await fetch('https://evangeli.net/evangelio', {
      headers: { 'User-Agent': 'Mozilla/5.0 CatolicosGPT' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    
    // Evangeli.net tiene el evangelio en un bloque principal
    const textoMatch = html.match(/<div[^>]*class="[^"]*evangeli[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i) ||
                       html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (!textoMatch) throw new Error('No content found');
    
    const texto = htmlToText(textoMatch[1], 3000);
    if (texto.length < 50) throw new Error('Texto muy corto');
    
    const tituloMatch = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    const titulo = tituloMatch ? htmlToText(tituloMatch[1], 200) : 'Evangelio del día';
    
    console.log('[Liturgia] ✅ Evangeli.net: evangelio encontrado');
    return { fuente: 'evangeli.net', url: 'https://evangeli.net/evangelio', lecturas: [{ titulo, texto }] };
  } catch(e) {
    console.warn('[Liturgia] Evangeli.net scrape failed:', e.message);
    return null;
  }
}

// ── REFRESH COMPLETO (corre en cron diario + on-demand si cache stale) ──
async function refreshLiturgia() {
  const today = todayBogota();
  console.log('[Liturgia] 🔄 Refreshing cache para', today);
  const cache = { date: today, refreshedAt: new Date().toISOString(), items: {} };

  // Lecturas + predica desde dominicos (con fallbacks)
  let dom = await scrapeDominicos();
  
  // Fallback 1: Ciudad Redonda
  if (!dom || !dom.lecturas || dom.lecturas.length === 0) {
    console.log('[Liturgia] Dominicos falló, intentando Ciudad Redonda...');
    dom = await scrapeCiudadRedonda();
  }
  
  // Fallback 2: Evangeli.net
  if (!dom || !dom.lecturas || dom.lecturas.length === 0) {
    console.log('[Liturgia] Ciudad Redonda falló, intentando Evangeli.net...');
    dom = await scrapeEvangeli();
  }
  
  if (dom) {
    cache.items.lecturas = dom;
    if (dom.predica) cache.items.predica = { fuente: dom.fuente, url: dom.url, texto: dom.predica };
    console.log('[Liturgia] ✅ Lecturas obtenidas de:', dom.fuente, '—', (dom.lecturas || []).length, 'lecturas');
  } else {
    console.error('[Liturgia] ❌ TODAS las fuentes de lecturas fallaron');
  }

  // Liturgia de las Horas (en paralelo)
  const [laudes, visperas, completas] = await Promise.all([
    scrapeIBreviary('laudes'),
    scrapeIBreviary('visperas'),
    scrapeIBreviary('completas')
  ]);
  if (laudes) cache.items.laudes = laudes;
  if (visperas) cache.items.visperas = visperas;
  if (completas) cache.items.completas = completas;

  // Ordo Colombiano como fallback adicional
  const ordo = await scrapeOrdoColombiano();
  if (ordo) cache.items.ordo = ordo;

  saveCache(cache);
  console.log('[Liturgia] ✅ Cache refreshed:', Object.keys(cache.items).join(', '));
  return cache;
}

// ── OBTENER del cache (con refresh background si stale) ──
function get(tipo) {
  const cache = loadCache();
  if (cache.date !== todayBogota()) {
    // Refresh en background — no bloqueamos respuesta
    refreshLiturgia().catch(e => console.error('[Liturgia] background refresh:', e.message));
    // Devolver lo que haya (puede ser stale pero útil)
    return cache.items?.[tipo] || null;
  }
  return cache.items?.[tipo] || null;
}

// ── INIT al boot del servidor: refrescar si stale ──
async function init() {
  const cache = loadCache();
  if (cache.date !== todayBogota()) {
    console.log('[Liturgia] Cache stale, refreshing on boot...');
    return refreshLiturgia();
  }
  console.log('[Liturgia] Cache OK para', cache.date, '— items:', Object.keys(cache.items).join(', '));
  return cache;
}

module.exports = { init, refreshLiturgia, get, todayBogota, loadCache };
