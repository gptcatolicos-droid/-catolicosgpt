// ════════════════════════════════════════════════════════════════
// PODCAST MODULE — Catálogo de podcasts católicos
// Integrado con shortcodes en el blog y visualizaciones en la web
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PODCAST_PATH = path.join(DATA_DIR, 'podcast-catalog.json');
const PODCAST_BACKUP = path.join(__dirname, 'data', 'podcast-catalog.json');

const DEFAULT_PODCASTS = {
  version: "1.0",
  total: 4,
  podcasts: [
    {
      id: "pod-001",
      slug: "la-biblia-en-un-ano",
      titulo: "La Biblia en un año (Fr. Mike Schmitz)",
      autor: "Ascension / Fr. Mike Schmitz",
      descripcion: "El podcast de estudio bíblico más famoso del mundo, adaptado al español por Fr. Mike Schmitz. Una guía completa para leer la Escritura.",
      embedUrl: "https://open.spotify.com/embed/show/4O7IitE99w5nO2n6B7tYfW",
      embedHtml: `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/show/4O7IitE99w5nO2n6B7tYfW?utm_source=generator" width="100%" height="232" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`,
      spotifyUrl: "https://open.spotify.com/show/4O7IitE99w5nO2n6B7tYfW",
      categoria: "biblia",
      publicado: true
    },
    {
      id: "pod-002",
      slug: "el-catecismo-en-un-ano",
      titulo: "El Catecismo en un año (Fr. Mike)",
      autor: "Ascension / Fr. Mike Schmitz",
      descripcion: "Aprende el Catecismo de la Iglesia Católica de una manera profunda e inspiradora, capitulo por capitulo en un año.",
      embedUrl: "https://open.spotify.com/embed/show/4K7R6qFv0E2T8f2T8f9fA",
      embedHtml: `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/show/4K7R6qFv0E2T8f2T8f9fA?utm_source=generator" width="100%" height="232" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`,
      spotifyUrl: "https://open.spotify.com/show/4K7R6qFv0E2T8f2T8f9fA",
      categoria: "catecismo",
      publicado: true
    },
    {
      id: "pod-003",
      slug: "diez-minutos-con-jesus",
      titulo: "10 Minutos con Jesús",
      autor: "Sacerdotes varios",
      descripcion: "Reflexiones diarias del Evangelio explicadas por sacerdotes de manera cercana e inspiradora. Ideal para tu meditación diaria.",
      embedUrl: "https://open.spotify.com/embed/show/6XN5m4Q4f4f4FfeHjgSgA8",
      embedHtml: `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/show/6XN5m4Q4f4f4FfeHjgSgA8?utm_source=generator" width="100%" height="232" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`,
      spotifyUrl: "https://open.spotify.com/show/6XN5m4Q4f4f4FfeHjgSgA8",
      categoria: "oracion",
      publicado: true
    }
  ]
};

function loadPodcasts() {
  try {
    const d = JSON.parse(fs.readFileSync(PODCAST_PATH, 'utf-8'));
    if (d && d.podcasts) return d;
  } catch(e) {}
  try {
    const d = JSON.parse(fs.readFileSync(PODCAST_BACKUP, 'utf-8'));
    if (d && d.podcasts) return d;
  } catch(e) {}
  return DEFAULT_PODCASTS;
}

function savePodcasts(c) {
  const json = JSON.stringify(c, null, 2);
  try { fs.writeFileSync(PODCAST_PATH, json); } catch(e) { console.error('[Podcasts save]', e.message); }
  try { fs.writeFileSync(PODCAST_BACKUP, json); } catch(e) {}
}

function getPodcasts({ categoria = null, q = null } = {}) {
  const c = loadPodcasts();
  let items = c.podcasts.filter(p => p.publicado !== false);
  if (categoria) items = items.filter(p => p.categoria === categoria);
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter(p => p.titulo.toLowerCase().includes(ql) || p.descripcion.toLowerCase().includes(ql));
  }
  return items;
}

function getPodcastBySlug(slug) {
  return loadPodcasts().podcasts.find(p => p.slug === slug);
}

module.exports = { loadPodcasts, savePodcasts, getPodcasts, getPodcastBySlug };
