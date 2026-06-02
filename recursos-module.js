// ════════════════════════════════════════════════════════════════
// RECURSOS RELACIONADOS — Matcheo inteligente chat → infografías/videos
// Después de cada respuesta del bot, busca en los catálogos qué
// recursos visuales podrían interesar al usuario.
// ════════════════════════════════════════════════════════════════

const { loadCatalog: loadInfografiasCatalog } = require('./infografias-module');
const { loadVideos } = require('./videos-module');

// Normalizar para comparación
function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Extraer términos clave del texto de pregunta/respuesta
function extractKeyTerms(text) {
  if (!text) return [];
  const t = norm(text);

  // Diccionario de términos católicos relevantes (santos, devociones, sacramentos, etc.)
  const catholicTerms = [
    // Santos populares
    'san jose', 'virgen maria', 'maria', 'santa maria', 'jesus', 'cristo', 'jesucristo',
    'san pedro', 'san pablo', 'san juan', 'san andres', 'san agustin', 'santo tomas',
    'san francisco', 'santo domingo', 'san antonio', 'san ignacio', 'san benito',
    'santa teresa', 'santa teresita', 'santa rita', 'santa monica', 'santa clara',
    'san juan pablo', 'san pio', 'padre pio', 'madre teresa',
    'guadalupe', 'fatima', 'lourdes', 'carmen', 'rosario',
    // Devociones
    'rosario', 'eucaristia', 'confesion', 'comunion', 'bautismo',
    'sagrado corazon', 'divina misericordia', 'novena',
    // Doctrina
    'mandamientos', 'sacramentos', 'virtudes', 'pecados capitales',
    'credo', 'oracion', 'mision', 'evangelio', 'biblia',
    // Liturgia
    'cuaresma', 'adviento', 'navidad', 'pascua', 'semana santa',
    'misa', 'liturgia', 'homilia', 'predica',
    // Iglesia
    'papa', 'iglesia', 'magisterio', 'enciclica', 'catecismo',
    'apostoles', 'martir', 'beato', 'santo'
  ];

  const found = [];
  for (const term of catholicTerms) {
    if (t.includes(term)) found.push(term);
  }
  return found;
}

// Calcular score de match entre un recurso y los términos clave
function scoreMatch(resource, terms) {
  if (!terms.length) return 0;
  const text = norm([
    resource.titulo || resource.tema || '',
    resource.descripcion || '',
    resource.keywords || '',
    resource.categoria || '',
    resource.tipo || '',
    resource.altText || ''
  ].join(' '));

  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) {
      // Bonus si está en el título
      const inTitle = norm(resource.titulo || resource.tema || '').includes(term);
      score += inTitle ? 3 : 1;
    }
  }
  return score;
}

// Función principal: encuentra recursos relacionados a la conversación
function findRelatedResources(userQuestion, botResponse, opts = {}) {
  const maxResults = opts.maxResults || 4;
  // Combinar pregunta + respuesta para extraer términos
  const combined = (userQuestion || '') + ' ' + (botResponse || '');
  const terms = extractKeyTerms(combined);

  if (!terms.length) return { infografias: [], videos: [], totalInfografias: 0, totalVideos: 0, queryTerm: '' };

  // Buscar en infografías
  let infografias = [];
  try {
    const infoCatalog = loadInfografiasCatalog();
    const allInf = (infoCatalog.infografias || []).filter(i => i.publicado !== false);
    const scored = allInf
      .map(i => ({ resource: i, score: scoreMatch(i, terms) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    infografias = scored.slice(0, maxResults).map(x => x.resource);
  } catch(e) { console.error('[Recursos] infografias:', e.message); }

  // Buscar en videos
  let videos = [];
  try {
    const videosCatalog = loadVideos();
    const allVid = (videosCatalog.videos || []).filter(v => v.publicado !== false);
    const scoredV = allVid
      .map(v => ({ resource: v, score: scoreMatch(v, terms) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    videos = scoredV.slice(0, maxResults).map(x => x.resource);
  } catch(e) { console.error('[Recursos] videos:', e.message); }

  // Term principal para el filtro de "ver más"
  const queryTerm = terms[0] || '';
  // Contar totales (para saber si mostrar "ver más")
  let totalInfografias = 0, totalVideos = 0;
  try {
    const infoCatalog = loadInfografiasCatalog();
    totalInfografias = (infoCatalog.infografias || []).filter(i => scoreMatch(i, terms) > 0).length;
  } catch(e) {}
  try {
    const videosCatalog = loadVideos();
    totalVideos = (videosCatalog.videos || []).filter(v => scoreMatch(v, terms) > 0).length;
  } catch(e) {}

  return { infografias, videos, totalInfografias, totalVideos, queryTerm, terms };
}

module.exports = { findRelatedResources, extractKeyTerms };
