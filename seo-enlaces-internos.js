// ════════════════════════════════════════════════════════════════════════════
// SEO ENLACES INTERNOS — enlaces relacionados y preguntas frecuentes
// para artículos del blog, calculados al vuelo desde el propio contenido
// del artículo. Así cualquier artículo ya publicado (sin importar cuántos
// haya en el catálogo) recibe esto de inmediato, sin reescribir lo guardado.
// ════════════════════════════════════════════════════════════════════════════

const { escapeHtml } = require('./blog-module');

function normalizar(texto) {
  return (texto || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function palabrasClave(post) {
  const base = `${post.titulo || ''} ${post.keywords || ''} ${post.categoria || ''}`;
  const vacias = new Set(['para', 'como', 'sobre', 'desde', 'entre', 'este', 'esta', 'estos', 'estas', 'catolico', 'catolica', 'catolicos', 'catolicas', 'guia', 'completa', 'completo', 'practica', 'practico']);
  return normalizar(base).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !vacias.has(w));
}

function puntuarRelacion(a, b) {
  let puntos = 0;
  if (a.categoria && a.categoria === b.categoria) puntos += 3;
  const palabrasA = new Set(palabrasClave(a));
  palabrasClave(b).forEach(p => { if (palabrasA.has(p)) puntos += 1; });
  return puntos;
}

// Hasta `max` artículos publicados relacionados con `post`, por categoría y
// solapamiento de palabras clave del título/keywords.
function articulosRelacionados(post, todosLosPosts, max = 4) {
  return (todosLosPosts || [])
    .filter(p => p.slug !== post.slug && p.publicado !== false)
    .map(p => ({ post: p, puntos: puntuarRelacion(post, p) }))
    .filter(x => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || new Date(b.post.fechaCreacion || 0) - new Date(a.post.fechaCreacion || 0))
    .slice(0, max)
    .map(x => x.post);
}

// Hasta `max` infografías relacionadas, buscando por categoría y palabras
// clave del artículo en el catálogo de infografías ya existente.
function infografiasRelacionadas(post, getInfografiasFn, max = 2) {
  if (typeof getInfografiasFn !== 'function') return [];
  const terminos = [post.categoria, ...palabrasClave(post).slice(0, 3)].filter(Boolean);
  const encontradas = new Map();
  for (const termino of terminos) {
    let resultado;
    try { resultado = getInfografiasFn({ q: termino, limit: max * 2 }); } catch (e) { resultado = null; }
    (resultado && resultado.items || []).forEach(i => { if (!encontradas.has(i.slug)) encontradas.set(i.slug, i); });
    if (encontradas.size >= max) break;
  }
  return Array.from(encontradas.values()).slice(0, max);
}

function extraerSeccionesMarkdown(md) {
  if (!md) return [];
  const secciones = [];
  let actual = null;
  for (const linea of md.split('\n')) {
    const encabezado = linea.match(/^#{2,3}\s+(.+)$/);
    if (encabezado) {
      if (actual) secciones.push(actual);
      actual = { titulo: encabezado[1].trim(), texto: '' };
      continue;
    }
    if (actual) actual.texto += linea + '\n';
  }
  if (actual) secciones.push(actual);
  return secciones;
}

function limpiarMarkdownInline(texto) {
  return (texto || '')
    .replace(/\[infografia:[^\]]+\]/g, '')
    .replace(/\[video:[^\]]+\]/g, '')
    .replace(/\[podcast:[^\]]+\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENCABEZADOS_PREGUNTA = /^(¿|qué|que|cómo|como|cuándo|cuando|cuál|cual|cuáles|cuales|por qué|por que|quién|quien|quiénes|quienes|dónde|donde)/i;
const ENCABEZADOS_GENERICOS = /^(introducci[oó]n|conclusi[oó]n|reflexi[oó]n( final)?|resumen|cierre)\b/i;

function comoPregunta(tituloSeccion, tituloArticulo) {
  const limpio = tituloSeccion.trim();
  if (ENCABEZADOS_PREGUNTA.test(limpio)) {
    return limpio.endsWith('?') ? limpio : `¿${limpio.replace(/^¿/, '')}?`;
  }
  return `¿Qué debes saber sobre "${limpio}" en ${tituloArticulo}?`;
}

// Hasta `max` preguntas frecuentes, extraídas de los propios encabezados
// (##/###) y párrafos del artículo. Si el artículo no tiene encabezados
// (los muy cortos), cae en una única pregunta basada en su descripción.
function preguntasFrecuentes(post, max = 4) {
  const secciones = extraerSeccionesMarkdown(post.contenidoMd)
    .map(s => ({ titulo: s.titulo, texto: limpiarMarkdownInline(s.texto) }))
    .filter(s => s.texto.length > 60 && !ENCABEZADOS_GENERICOS.test(s.titulo));

  const preguntas = secciones.slice(0, max).map(s => ({
    q: comoPregunta(s.titulo, post.titulo),
    a: s.texto.length > 320 ? `${s.texto.slice(0, 317).trim()}…` : s.texto
  }));

  if (preguntas.length === 0) {
    const resumen = limpiarMarkdownInline(post.descripcion || post.extracto || '');
    if (resumen) preguntas.push({ q: `¿Qué es "${post.titulo}"?`, a: resumen });
  }
  return preguntas;
}

function tarjetaLista(titulo, emoji, items, hrefDe, tituloDe) {
  return `
    <div class="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
      <h4 class="font-display font-bold text-maroon uppercase tracking-wider text-[11px] border-b pb-1">${emoji} ${titulo}</h4>
      <ul class="flex flex-col gap-1.5">
        ${items.map(item => `<li><a href="${hrefDe(item)}" class="hover:underline text-ink hover:text-maroon font-medium flex items-center gap-1.5">&#x271F; ${escapeHtml(tituloDe(item))}</a></li>`).join('')}
      </ul>
    </div>
  `;
}

// Arma el bloque completo (enlaces internos en el cuerpo, tarjetas de
// relacionados/infografías y el acordeón de preguntas frecuentes con su
// JSON-LD) para insertar dentro del <article> del post.
function renderBloqueSEO(post, { todosLosPosts = [], getInfografiasFn } = {}) {
  const relacionados = articulosRelacionados(post, todosLosPosts, 4);
  const infografias = infografiasRelacionadas(post, getInfografiasFn, 2);
  const preguntas = preguntasFrecuentes(post, 4);

  let enlacesEnElCuerpo = '';
  if (relacionados.length) {
    const enlaces = relacionados.slice(0, 2)
      .map(p => `<a href="/blog/${p.slug}" class="text-maroon underline hover:text-gold font-semibold">${escapeHtml(p.titulo)}</a>`);
    enlacesEnElCuerpo = `
      <p class="text-ink leading-relaxed font-serif text-sm sm:text-base mt-4">
        Para seguir profundizando en este tema, también puede interesarte ${enlaces.join(' y ')}.
      </p>
    `;
  }

  let tarjetasRelacionadas = '';
  if (relacionados.length || infografias.length) {
    tarjetasRelacionadas = `
      <div class="mt-8 pt-6 border-t border-border">
        <h3 class="font-display font-semibold text-base text-maroon uppercase tracking-wider mb-4">Sigue leyendo y profundizando</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
          ${relacionados.length ? tarjetaLista('Artículos relacionados', '📖', relacionados, p => `/blog/${p.slug}`, p => p.titulo) : ''}
          ${infografias.length ? tarjetaLista('Infografías relacionadas', '🖼️', infografias, i => `/infografias/${i.slug}`, i => i.titulo) : ''}
        </div>
      </div>
    `;
  }

  let faqHtml = '';
  let faqJsonLd = '';
  if (preguntas.length) {
    faqHtml = `
      <div class="mt-8 bg-white border rounded-xl p-5 sm:p-7 shadow-sm">
        <h3 class="font-display font-semibold text-base text-maroon mb-5 uppercase tracking-widest border-b pb-2">Preguntas Frecuentes (FAQ)</h3>
        <div class="flex flex-col gap-4">
          ${preguntas.map((f, idx) => `
          <div class="${idx < preguntas.length - 1 ? 'border-b pb-3.5' : ''} flex flex-col gap-2">
            <h4 class="font-display font-semibold text-sm text-espresso flex items-start gap-2">
              <span class="text-gold font-bold font-mono">Q${idx + 1}.</span> ${escapeHtml(f.q)}
            </h4>
            <p class="text-xs sm:text-sm text-ink-2 pl-6 leading-relaxed">${escapeHtml(f.a)}</p>
          </div>`).join('')}
        </div>
      </div>
    `;
    faqJsonLd = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: preguntas.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    })}</script>`;
  }

  return { enlacesEnElCuerpo, tarjetasRelacionadas, faqHtml, faqJsonLd, preguntas, relacionados, infografias };
}

module.exports = {
  palabrasClave,
  articulosRelacionados,
  infografiasRelacionadas,
  preguntasFrecuentes,
  renderBloqueSEO
};
