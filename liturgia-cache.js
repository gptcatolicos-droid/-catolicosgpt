// ════════════════════════════════════════════════════════════════
// LITURGIA CACHE — Scraping diario inteligente con cache 24h
// Fuentes: dominicos.org (lecturas + predica) + Ordo Colombiano (Horas)
// Fallback: iBreviary (Liturgia de las Horas) + Gemini AI
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {} }
const CACHE_PATH = path.join(DATA_DIR, 'liturgia-cache.json');

let memCache = null;

function getAi() {
  if (process.env.GEMINI_API_KEY) {
    try {
      return new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
    } catch (e) {
      console.error('[Liturgia AI] Error instanciando cliente Gemini:', e.message);
    }
  }
  return null;
}

function todayBogota() {
  const now = new Date();
  const offset = -5 * 60;
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
  catch(e) { console.error('[Liturgia Cache] saveError:', e.message); }
}

function htmlToText(html, maxLen = 50000) {
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

async function scrapeDominicos() {
  const urlGoal = 'https://www.dominicos.org/predicacion/evangelio-del-dia/hoy/';
  const urlAlt = 'https://www.dominicos.org/predicacion/evangelio-del-dia/';
  let urlUsed = urlGoal;
  let html = null;

  try {
    console.log('[Scraper Dominicos] Fetching: ', urlGoal);
    const r = await fetch(urlGoal, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(12000)
    });
    if (r.ok) {
      html = await r.text();
    } else {
      console.log(`[Scraper Dominicos] URL prima devolvió ${r.status}. Reintentando con alternativo...`);
      urlUsed = urlAlt;
      const rAlt = await fetch(urlAlt, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(12000)
      });
      if (rAlt.ok) html = await rAlt.text();
    }
  } catch (e) {
    console.warn('[Scraper Dominicos] Error fetching:', e.message);
    try {
      urlUsed = urlAlt;
      const rAlt = await fetch(urlAlt, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000)
      });
      if (rAlt.ok) html = await rAlt.text();
    } catch (e2) {
      console.warn('[Scraper Dominicos] Fallback fallido:', e2.message);
    }
  }

  if (!html) {
    console.warn('[Scraper Dominicos] No se pudo obtener el HTML de dominicos.org');
    return null;
  }

  const contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i) ||
                       html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                       html.match(/<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  
  const rawBlock = contentMatch ? contentMatch[1] : html;
  const cleanSnippet = htmlToText(rawBlock, 25000);

  const aiInstance = getAi();
  if (aiInstance) {
    try {
      console.log('[Scraper Dominicos] Extrayendo lecturas con Gemini Flash...');
      const prompt = `Actúa como un experto en liturgia católica romana de la Orden de Predicadores (dominicos).
A continuación tienes el texto plano extraído de dominicos.org:
"""
${cleanSnippet}
"""

Extrae fielmente, de forma rigurosa y literal (copiando el texto real), las lecturas del día (Primera Lectura / Antiguo Testamento, Salmo Responsorial, Segunda Lectura si la hay, y Santo Evangelio). Extrae también la homilía o predicación del día.

Devuelve estrictamente un objeto JSON (con comillas dobles, sin comentarios de otro tipo) con este formato exacto:
{
  "lecturas": [
    {
      "titulo": "Primera Lectura: (p. ej. Lectura del libro de...)",
      "texto": "Texto bíblico completo y literal..."
    },
    {
      "titulo": "Salmo Responsorial: (p. ej. Salmo...)",
      "texto": "Texto bíblico completo..."
    },
    {
      "titulo": "Evangelio: (p. ej. Evangelio según san...)",
      "texto": "Texto completo del Santo Evangelio..."
    }
  ],
  "predica": "Texto completo de la homilía, predicación o comentario espiritual..."
}

IMPORTANTE: 
- NUNCA inventes ni alucines lecturas. En caso de que el texto proveído no contenga el texto literal o falte, puedes usar tu bagaje doctrinal católico para transcribir literalmente las lecturas correctas del calendario litúrgico de hoy (día: ${todayBogota()}) para que la info de la predicación dominicos sea 100% veraz y real dándosela al fiel católico.
- Devuelve únicamente el string JSON puro.`;

      const res = await aiInstance.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const parsed = JSON.parse(res.text.trim());
      if (parsed.lecturas && parsed.lecturas.length > 0) {
        return {
          fuente: 'dominicos.org',
          url: urlUsed,
          lecturas: parsed.lecturas,
          predica: parsed.predica || ''
        };
      }
    } catch (err) {
      console.error('[Scraper Dominicos AI Error]', err.message);
    }
  }

  // Backup simple regex parsers
  try {
    const lecturas = [];
    const sectionRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>([\s\S]*?)(?=<h[23]|<\/article|<\/main|$)/gi;
    let m;
    while ((m = sectionRegex.exec(rawBlock)) !== null) {
      const titulo = htmlToText(m[1], 200);
      const texto = htmlToText(m[2], 3000);
      if (titulo && texto && titulo.length > 3 && texto.length > 30) {
        lecturas.push({ titulo, texto });
      }
    }
    if (lecturas.length > 0) {
      return {
        fuente: 'dominicos.org',
        url: urlUsed,
        lecturas,
        predica: 'Comentario tradicional de la Orden de Predicadores (Dominicos).'
      };
    }
  } catch (rawErr) {}

  return null;
}

async function scrapeIBreviary(hora) {
  const map = { laudes: 'lodi', visperas: 'vespri', completas: 'compieta' };
  const slug = map[hora];
  if (!slug) return null;
  try {
    const url = `https://www.ibreviary.com/m/preghiere.php?lang=spagnolo&s=${slug}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 CatolicosGPT' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    const text = htmlToText(html, 15000);
    if (text.length < 200) throw new Error('Contenido vacío');
    return { fuente: 'ibreviary.com', url, texto: text };
  } catch(e) {
    console.warn('[Liturgia] iBreviary scrape failed para', hora, ':', e.message);
    return null;
  }
}

async function scrapeOrdoColombiano() {
  const url = 'https://web-ordo-colombiano.cec.org.co/detalle-liturgia-horas';
  try {
    console.log('[Scraper Ordo] Fetching:', url);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    const cleanSnippet = htmlToText(html, 40000);

    const aiInstance = getAi();
    if (aiInstance) {
      try {
        console.log('[Scraper Ordo] Segmentando Liturgia de las Horas de Colombia con Gemini Flash...');
        const prompt = `Actúa como un liturgista católico oficial de la Conferencia Episcopal de Colombia.
A continuación tienes el texto plano de la liturgia de hoy extraída de la web oficial del Ordo Colombiano:
"""
${cleanSnippet}
"""

Divide y estructura este texto fielmente en tres secciones correspondientes a las horas canónicas primarias:
1. "laudes" (Oración de la mañana)
2. "visperas" (Oración del atardecer)
3. "completas" (Oración de la noche)

Devuelve estrictamente un objeto JSON (con comillas dobles, sin comentarios) con este formato exacto:
{
  "laudes": "Texto completo estructurado en markdown...",
  "visperas": "Texto completo estructurado en markdown...",
  "completas": "Texto completo estructurado en markdown..."
}

IMPORTANTE:
- Extrae fielmente los textos. Si observas que el origen tiene lagunas o está incompleto, rellena con los himnos, salmos oficiales y preces litúrgicos tradicionales correctos correspondientes a la Liturgia de las Horas católica de hoy (${todayBogota()}) para no dar un texto roto o mutilado al fiel.
- Devuelve únicamente el string JSON puro.`;

        const res = await aiInstance.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });

        const parsed = JSON.parse(res.text.trim());
        if (parsed.laudes || parsed.visperas || parsed.completas) {
          return {
            fuente: 'ordo-colombiano',
            url: url,
            laudes: parsed.laudes ? { fuente: 'ordo-colombiano', url, texto: parsed.laudes } : null,
            visperas: parsed.visperas ? { fuente: 'ordo-colombiano', url, texto: parsed.visperas } : null,
            completas: parsed.completas ? { fuente: 'ordo-colombiano', url, texto: parsed.completas } : null
          };
        }
      } catch (err) {
        console.error('[Scraper Ordo AI Error]', err.message);
      }
    }

    return {
      fuente: 'ordo-colombiano',
      url,
      texto: cleanSnippet
    };
  } catch(e) {
    console.warn('[Liturgia] Ordo Colombiano scrape failed:', e.message);
    return null;
  }
}

async function refreshLiturgia() {
  const today = todayBogota();
  const cache = { date: today, refreshedAt: new Date().toISOString(), items: {} };

  // 1. Dominicos (Lecturas del día)
  const dom = await scrapeDominicos();
  if (dom) {
    cache.items.lecturas = dom;
    if (dom.predica) cache.items.predica = { fuente: dom.fuente, url: dom.url, texto: dom.predica };
  }

  // 2. Ordo Colombiano (Laudes, Vísperas, Completas)
  const ordo = await scrapeOrdoColombiano();
  if (ordo) {
    cache.items.ordo = { fuente: 'ordo-colombiano', url: ordo.url };
    if (ordo.laudes) cache.items.laudes = ordo.laudes;
    if (ordo.visperas) cache.items.visperas = ordo.visperas;
    if (ordo.completas) cache.items.completas = ordo.completas;
  }

  // 3. Fallbacks para horas ausentes
  const needLaudes = !cache.items.laudes;
  const needVisperas = !cache.items.visperas;
  const needCompletas = !cache.items.completas;

  if (needLaudes || needVisperas || needCompletas) {
    console.log(`[Liturgia Fallback] Cargando iBreviary para: ${needLaudes ? 'laudes ' : ''}${needVisperas ? 'visperas ' : ''}${needCompletas ? 'completas' : ''}`);
    const [laudes, visperas, completas] = await Promise.all([
      needLaudes ? scrapeIBreviary('laudes') : Promise.resolve(null),
      needVisperas ? scrapeIBreviary('visperas') : Promise.resolve(null),
      needCompletas ? scrapeIBreviary('completas') : Promise.resolve(null)
    ]);
    if (laudes) cache.items.laudes = laudes;
    if (visperas) cache.items.visperas = visperas;
    if (completas) cache.items.completas = completas;
  }

  saveCache(cache);
  return cache;
}

function get(tipo) {
  const cache = loadCache();
  if (cache.date !== todayBogota()) {
    refreshLiturgia().catch(e => console.error('[Liturgia] background refresh failed:', e.message));
    return cache.items?.[tipo] || null;
  }
  return cache.items?.[tipo] || null;
}

async function init() {
  const cache = loadCache();
  if (cache.date !== todayBogota()) {
    return refreshLiturgia();
  }
  return cache;
}

module.exports = { init, refreshLiturgia, get, todayBogota, loadCache };
