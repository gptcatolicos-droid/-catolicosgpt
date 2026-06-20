// ════════════════════════════════════════════════════════════════
// VIDEOS MODULE — Canales y Videos de YouTube curados católicos
// Clasificados por categoría: apologética, catequesis, liturgia, música...
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const VIDEOS_PATH = path.join(DATA_DIR, 'videos-catalog.json');
const VIDEOS_BACKUP = path.join(__dirname, 'data', 'videos-catalog.json');

const DEFAULT_VIDEOS = {
  version: "1.0",
  total: 4,
  videos: [
    {
      id: "vid-001",
      slug: "como-defender-la-fe",
      titulo: "¿Cómo responder a los ataques a la fe católica?",
      canal: "Tekton Centro Televisivo",
      youtubeId: "WPhOOn26zts",
      comentario: "Una serie de consejos prácticos de apologética para defender la doctrina católica con mansedumbre, caridad y fundamentos bíblicos.",
      categoria: "apologetica",
      publicado: true
    },
    {
      id: "vid-002",
      slug: "historia-del-catecismo",
      titulo: "La Historia del Catecismo de la Iglesia Católica",
      canal: "HM Televisión",
      youtubeId: "W7oRUKV-yVw",
      comentario: "Un documental excelente sobre la gestación del Catecismo promulgado por San Juan Pablo II en 1992 y su importancia para el cristiano de hoy.",
      categoria: "catequesis",
      publicado: true
    },
    {
      id: "vid-003",
      slug: "la-liturgia-explicada",
      titulo: "Partes de la Santa Misa Explicadas Paso a Paso",
      canal: "Catholic Link",
      youtubeId: "wD1Vp83b4B0",
      comentario: "Un video animado perfecto para comprender la riqueza teológica detrás de cada gesto, palabra y momento en la celebración eucarística.",
      categoria: "liturgia",
      publicado: true
    }
  ]
};

function loadVideos() {
  try {
    const d = JSON.parse(fs.readFileSync(VIDEOS_PATH, 'utf-8'));
    if (d && d.videos) return d;
  } catch(e) {}
  try {
    const d = JSON.parse(fs.readFileSync(VIDEOS_BACKUP, 'utf-8'));
    if (d && d.videos) return d;
  } catch(e) {}
  return DEFAULT_VIDEOS;
}

function saveVideos(c) {
  const json = JSON.stringify(c, null, 2);
  try { fs.writeFileSync(VIDEOS_PATH, json); } catch(e) { console.error('[Videos save]', e.message); }
  try { fs.writeFileSync(VIDEOS_BACKUP, json); } catch(e) {}
}

function getVideos({ categoria = null, q = null } = {}) {
  const c = loadVideos();
  let items = c.videos.filter(v => v.publicado !== false);
  if (categoria) items = items.filter(v => v.categoria === categoria);
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter(v => v.titulo.toLowerCase().includes(ql) || v.comentario.toLowerCase().includes(ql));
  }
  return items;
}

function getVideoBySlug(slug) {
  return loadVideos().videos.find(v => v.slug === slug);
}

module.exports = { loadVideos, saveVideos, getVideos, getVideoBySlug };
