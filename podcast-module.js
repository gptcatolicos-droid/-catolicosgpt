// ════════════════════════════════════════════════════════════════
// PODCAST MODULE — Embed de Spotify / Apple Podcasts / SoundCloud / Ivoox / YouTube
// Admin pega URL → sistema detecta plataforma → genera embed → IA enriquece metadata
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {} }
const PODCAST_PATH = path.join(DATA_DIR, 'podcast-catalog.json');
const PODCAST_BACKUP = path.join(__dirname, 'data', 'podcast-catalog.json');

function loadPodcasts() {
  try {
    const d = JSON.parse(fs.readFileSync(PODCAST_PATH, 'utf-8'));
    if (d && d.podcasts) return d;
  } catch(e) {}
  try {
    const d = JSON.parse(fs.readFileSync(PODCAST_BACKUP, 'utf-8'));
    if (d && d.podcasts) return d;
  } catch(e) {}
  return { version: '1.0', total: 0, podcasts: [] };
}

function savePodcasts(c) {
  const json = JSON.stringify(c, null, 2);
  try { fs.writeFileSync(PODCAST_PATH, json); } catch(e) { console.error('[Podcast save]', e.message); }
  try { fs.writeFileSync(PODCAST_BACKUP, json); } catch(e) {}
}

// Detectar plataforma desde URL y generar embed URL + iframe HTML
function detectPlatform(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();

  // Spotify (track, episode, show, playlist)
  // https://open.spotify.com/episode/XXX  o  /show/XXX  o  /track/XXX  o  /playlist/XXX
  let m = s.match(/open\.spotify\.com\/(episode|show|track|playlist|album)\/([a-zA-Z0-9]+)/);
  if (m) {
    return {
      plataforma: 'spotify',
      tipo: m[1],
      id: m[2],
      embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=catolicosgpt`,
      embedHtml: `<iframe style="border-radius:12px;border:0" src="https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=catolicosgpt" width="100%" height="232" frameborder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`,
      sourceUrl: s
    };
  }

  // Apple Podcasts
  // https://podcasts.apple.com/xx/podcast/.../id123456789?i=1000000000
  m = s.match(/podcasts\.apple\.com\/([a-z]{2})\/podcast\/[^/]+\/id(\d+)(?:\?i=(\d+))?/);
  if (m) {
    const country = m[1], showId = m[2], episodeId = m[3];
    const embedSrc = episodeId
      ? `https://embed.podcasts.apple.com/${country}/podcast/id${showId}?i=${episodeId}&theme=auto`
      : `https://embed.podcasts.apple.com/${country}/podcast/id${showId}?theme=auto`;
    return {
      plataforma: 'apple',
      tipo: episodeId ? 'episode' : 'show',
      id: episodeId || showId,
      embedUrl: embedSrc,
      embedHtml: `<iframe allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" frameborder="0" height="175" style="width:100%;overflow:hidden;border-radius:10px" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="${embedSrc}" loading="lazy"></iframe>`,
      sourceUrl: s
    };
  }

  // SoundCloud
  // https://soundcloud.com/user/track-name
  m = s.match(/soundcloud\.com\/([\w-]+)\/([\w-]+)/);
  if (m) {
    return {
      plataforma: 'soundcloud',
      tipo: 'track',
      id: `${m[1]}-${m[2]}`,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(s)}&color=%23bc8a36&auto_play=false`,
      embedHtml: `<iframe width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(s)}&color=%23bc8a36&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true" loading="lazy"></iframe>`,
      sourceUrl: s
    };
  }

  // Ivoox (popular en LATAM católico)
  // https://www.ivoox.com/...episode_xx_1_.html
  m = s.match(/ivoox\.com\/.*?(?:audios?|episodio[^_]*)_(\d+)(?:_\d+)?\.html/i) ||
      s.match(/ivoox\.com\/.*?-(\d+)_\d+_\d+\.html/i);
  if (m) {
    const audioId = m[1];
    return {
      plataforma: 'ivoox',
      tipo: 'audio',
      id: audioId,
      embedUrl: `https://www.ivoox.com/player_ej_${audioId}_4_1.html?c1=ff6600`,
      embedHtml: `<iframe id="ivooxplayer" frameborder="0" scrolling="no" height="200" style="border:1px solid #efefef;width:100%" src="https://www.ivoox.com/player_ej_${audioId}_4_1.html?c1=ff6600" loading="lazy"></iframe>`,
      sourceUrl: s
    };
  }

  // YouTube (videos de audio/música)
  m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (m) {
    return {
      plataforma: 'youtube',
      tipo: 'video',
      id: m[1],
      embedUrl: `https://www.youtube.com/embed/${m[1]}?rel=0`,
      embedHtml: `<iframe src="https://www.youtube.com/embed/${m[1]}?rel=0" width="100%" height="232" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" loading="lazy" style="border-radius:12px;border:0"></iframe>`,
      sourceUrl: s
    };
  }

  // iframe completo pegado
  if (s.includes('<iframe') && s.includes('src="')) {
    const srcMatch = s.match(/src="([^"]+)"/);
    if (srcMatch) {
      const src = srcMatch[1];
      // Detectar plataforma del iframe
      if (src.includes('spotify.com')) {
        const sm = src.match(/embed\/(episode|show|track|playlist|album)\/([a-zA-Z0-9]+)/);
        if (sm) return detectPlatform(`https://open.spotify.com/${sm[1]}/${sm[2]}`);
      }
      return {
        plataforma: 'iframe',
        tipo: 'embed',
        id: btoa(src).slice(0, 20),
        embedUrl: src,
        embedHtml: s,
        sourceUrl: src
      };
    }
  }

  return null;
}

// IA enrichment para podcast
async function enrichPodcastWithAI(originalTitle, contextHint, plataforma, openai) {
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 600,
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: 'Eres experto en SEO católico. Generas metadata optimizada para podcast católicos en español.'
      }, {
        role: 'user',
        content: `Genera metadata SEO para este podcast católico:
Plataforma: ${plataforma}
Título: "${originalTitle || '(sin título)'}"
${contextHint ? 'Contexto: ' + contextHint : ''}

Responde SOLO JSON válido en español (sin markdown):
{
  "titulo": "Título SEO en español (50-65 chars)",
  "descripcion": "Descripción 140-180 chars que explica el contenido",
  "keywords": "5-7 keywords católicas separadas por comas",
  "categoria": "una sola de: meditacion, rosario, novena, homilia, conferencia, testimonio, musica, predicacion, biblia, doctrina",
  "altText": "Texto alt SEO",
  "slug": "url-slug-amigable"
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
      titulo: parsed.titulo || originalTitle || 'Podcast católico',
      descripcion: parsed.descripcion || '',
      keywords: parsed.keywords || '',
      categoria: parsed.categoria || 'meditacion',
      altText: parsed.altText || parsed.titulo || originalTitle || '',
      slug: (parsed.slug || originalTitle || 'podcast').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
    };
  } catch(e) {
    console.error('[Podcast AI]', e.message);
    const fallback = (originalTitle || 'podcast').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    return {
      titulo: originalTitle || 'Podcast católico',
      descripcion: 'Podcast católico en CatólicosGPT',
      keywords: 'católico, podcast, fe',
      categoria: 'meditacion',
      altText: originalTitle || 'Podcast',
      slug: fallback
    };
  }
}

function getPodcasts({ categoria = null, plataforma = null, q = null, page = 1, limit = 12 } = {}) {
  const catalog = loadPodcasts();
  let items = (catalog.podcasts || []).filter(p => p.publicado !== false);
  if (categoria) items = items.filter(p => p.categoria === categoria);
  if (plataforma) items = items.filter(p => p.plataforma === plataforma);
  if (q) {
    const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    items = items.filter(p => {
      const text = `${p.titulo||''} ${p.descripcion||''} ${p.keywords||''} ${p.categoria||''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return text.includes(ql);
    });
  }
  items.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
  const total = items.length;
  const start = (page - 1) * limit;
  return { total, page, limit, items: items.slice(start, start + limit) };
}

function getPodcastBySlug(slug) {
  const catalog = loadPodcasts();
  return (catalog.podcasts || []).find(p => p.slug === slug);
}

function deletePodcast(slug) {
  const catalog = loadPodcasts();
  const before = (catalog.podcasts || []).length;
  catalog.podcasts = (catalog.podcasts || []).filter(p => p.slug !== slug);
  catalog.total = catalog.podcasts.length;
  savePodcasts(catalog);
  return before !== catalog.podcasts.length;
}

module.exports = {
  loadPodcasts, savePodcasts, detectPlatform, enrichPodcastWithAI,
  getPodcasts, getPodcastBySlug, deletePodcast
};
