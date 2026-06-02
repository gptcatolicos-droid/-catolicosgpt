// ════════════════════════════════════════════════════════════════
// VIDEOS MODULE — Catálogo de videos YouTube embebidos
// Admin pega URL → IA genera título/desc/keywords → publica en /videos
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {} }
const VIDEOS_PATH = path.join(DATA_DIR, 'videos-catalog.json');
const VIDEOS_BACKUP = path.join(__dirname, 'data', 'videos-catalog.json');

function loadVideos() {
  try {
    const d = JSON.parse(fs.readFileSync(VIDEOS_PATH, 'utf-8'));
    if (d && d.videos) return d;
  } catch(e) {}
  try {
    const d = JSON.parse(fs.readFileSync(VIDEOS_BACKUP, 'utf-8'));
    if (d && d.videos) return d;
  } catch(e) {}
  return { version: '1.0', total: 0, categorias: [], videos: [] };
}

function saveVideos(c) {
  const json = JSON.stringify(c, null, 2);
  try { fs.writeFileSync(VIDEOS_PATH, json); } catch(e) { console.error('[Videos]', e.message); }
  try { fs.writeFileSync(VIDEOS_BACKUP, json); } catch(e) {}
}

// Extract YouTube video ID from various URL formats or iframe code
function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  // iframe embed code
  const iframeMatch = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (iframeMatch) return iframeMatch[1];
  // URLs
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  // Just the ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  return null;
}

// Get YouTube metadata via oEmbed (no API key needed)
async function getYouTubeMetadata(videoId) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) throw new Error('oEmbed HTTP ' + r.status);
    return await r.json();
  } catch(e) {
    console.warn('[Videos] oEmbed failed:', e.message);
    return {
      title: 'Video sin título',
      author_name: 'YouTube',
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
    };
  }
}

// Enrich with AI (GPT-4o-mini) — genera título SEO, descripción, keywords, categoría
async function enrichVideoWithAI(originalTitle, contextHint, openai) {
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 600,
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: 'Eres experto en SEO católico. Generas metadata optimizada para videos católicos en español.'
      }, {
        role: 'user',
        content: `Genera metadata SEO para este video católico:
Título original de YouTube: "${originalTitle}"
${contextHint ? 'Contexto adicional: ' + contextHint : ''}

Responde SOLO JSON válido en español (sin markdown, sin backticks):
{
  "titulo": "Título SEO optimizado en español (50-65 chars, atractivo)",
  "descripcion": "Descripción 140-180 chars que explica qué aprenderá el espectador",
  "keywords": "5-7 keywords católicas relevantes separadas por comas",
  "categoria": "una sola de: homilia, catequesis, testimonio, oracion, doctrina, biblia, liturgia, vida-santos",
  "altText": "Texto alt SEO para Google Images",
  "slug": "url-slug-amigable-en-espanol"
}`
      }]
    });
    let text = r.choices[0].message.content.trim();
    text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    const parsed = JSON.parse(text);
    return {
      titulo: parsed.titulo || originalTitle,
      descripcion: parsed.descripcion || '',
      keywords: parsed.keywords || '',
      categoria: parsed.categoria || 'catequesis',
      altText: parsed.altText || parsed.titulo || originalTitle,
      slug: (parsed.slug || originalTitle).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    };
  } catch(e) {
    console.error('[Videos AI] Error:', e.message);
    return {
      titulo: originalTitle,
      descripcion: 'Video católico en CatólicosGPT',
      keywords: 'católico, video, fe',
      categoria: 'catequesis',
      altText: originalTitle,
      slug: originalTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    };
  }
}

// Get videos with filtering
function getVideos({ categoria = null, q = null, page = 1, limit = 12 } = {}) {
  const catalog = loadVideos();
  let items = catalog.videos || [];
  if (categoria) items = items.filter(v => v.categoria === categoria);
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter(v =>
      (v.titulo || '').toLowerCase().includes(ql) ||
      (v.descripcion || '').toLowerCase().includes(ql) ||
      (v.keywords || '').toLowerCase().includes(ql)
    );
  }
  const total = items.length;
  const start = (page - 1) * limit;
  return { total, page, limit, items: items.slice(start, start + limit) };
}

function getVideoBySlug(slug) {
  const catalog = loadVideos();
  return (catalog.videos || []).find(v => v.slug === slug);
}

function deleteVideo(slug) {
  const catalog = loadVideos();
  const before = (catalog.videos || []).length;
  catalog.videos = (catalog.videos || []).filter(v => v.slug !== slug);
  catalog.total = catalog.videos.length;
  saveVideos(catalog);
  return before !== catalog.videos.length;
}

module.exports = {
  loadVideos, saveVideos, extractYouTubeId, getYouTubeMetadata,
  enrichVideoWithAI, getVideos, getVideoBySlug, deleteVideo
};
