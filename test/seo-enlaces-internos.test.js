'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const seoEnlaces = require('../seo-enlaces-internos');
const blog = require('../blog-module');

const todosLosPosts = blog.loadBlog().posts;

function post(slug) {
  const p = todosLosPosts.find(x => x.slug === slug);
  assert.ok(p, `fixture ${slug} debe existir en data/blog-catalog.json`);
  return p;
}

test('articulosRelacionados nunca incluye al propio artículo', () => {
  const p = post('eucaristia-fuente-culmen-vida-cristiana');
  const relacionados = seoEnlaces.articulosRelacionados(p, todosLosPosts, 10);
  assert.ok(!relacionados.some(r => r.slug === p.slug));
});

test('articulosRelacionados prioriza la misma categoría', () => {
  const p = post('eucaristia-fuente-culmen-vida-cristiana'); // doctrina
  const relacionados = seoEnlaces.articulosRelacionados(p, todosLosPosts, 4);
  assert.ok(relacionados.length > 0);
  assert.ok(relacionados.every(r => r.categoria === 'doctrina' || r.categoria !== p.categoria));
  // El primer resultado, si hay empate posible, debe ser de la misma categoría cuando exista.
  const hayDoctrina = todosLosPosts.some(x => x.categoria === 'doctrina' && x.slug !== p.slug);
  if (hayDoctrina) assert.equal(relacionados[0].categoria, 'doctrina');
});

test('preguntasFrecuentes extrae preguntas de los encabezados ## y ### del artículo', () => {
  const p = post('introduccion-al-magisterio-de-la-iglesia');
  const preguntas = seoEnlaces.preguntasFrecuentes(p, 4);
  assert.ok(preguntas.length > 0, 'debe generar al menos una pregunta');
  preguntas.forEach(f => {
    assert.ok(f.q.includes('?'), `la pregunta "${f.q}" debe terminar en interrogación`);
    assert.ok(f.a.length > 0);
    assert.ok(!f.a.includes('#'), 'la respuesta no debe conservar marcado markdown');
  });
});

test('preguntasFrecuentes cae en una pregunta desde la descripción cuando el artículo no tiene encabezados', () => {
  const p = { slug: 'articulo-sin-secciones', titulo: 'Un Artículo Muy Corto', descripcion: 'Una descripción breve del tema.', contenidoMd: 'Solo un párrafo sin encabezados.' };
  const preguntas = seoEnlaces.preguntasFrecuentes(p, 4);
  assert.equal(preguntas.length, 1);
  assert.match(preguntas[0].q, /Un Artículo Muy Corto/);
  assert.equal(preguntas[0].a, 'Una descripción breve del tema.');
});

test('renderBloqueSEO produce HTML de tarjetas, JSON-LD válido y escapa el contenido', () => {
  const p = post('rezo-santo-rosario-misterios-gracias');
  const malicioso = { ...p, titulo: p.titulo + ' <script>alert(1)</script>' };
  const bloque = seoEnlaces.renderBloqueSEO(malicioso, { todosLosPosts, getInfografiasFn: require('../infografias-module').getInfografias });

  assert.ok(bloque.faqHtml.includes('Preguntas Frecuentes'));
  assert.doesNotMatch(bloque.faqHtml, /<script>alert/);

  if (bloque.faqJsonLd) {
    const json = bloque.faqJsonLd.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    const parsed = JSON.parse(json);
    assert.equal(parsed['@type'], 'FAQPage');
    assert.ok(parsed.mainEntity.length > 0);
  }
});

test('infografiasRelacionadas no revienta si no se pasa función de búsqueda', () => {
  const p = post('san-jose-patrono-iglesia-universal');
  assert.deepEqual(seoEnlaces.infografiasRelacionadas(p, undefined, 2), []);
});

test('recursosPdfRelacionados enlaza al PDF de Bautismo desde un artículo sobre sacramentos', () => {
  const p = post('sacramento-confirmacion-sello-espiritu');
  const recursos = seoEnlaces.recursosPdfRelacionados(p, 2);
  assert.ok(recursos.some(r => r.slug === 'el-sacramento-del-bautismo'));
});

test('recursosPdfRelacionados prioriza el recurso "Niños" en un artículo de catequesis infantil', () => {
  const p = { slug: 'ficticio', titulo: 'Explicando la Parábola del Sembrador a los Niños de la Parroquia', categoria: 'catequesis-ninos', keywords: 'parabola, sembrador, niños' };
  const recursos = seoEnlaces.recursosPdfRelacionados(p, 3);
  assert.ok(recursos.length > 0);
  assert.equal(recursos[0].slug, 'parabola-del-sembrador-para-ninos');
});

test('renderBloqueSEO incluye la tarjeta de guías PDF cuando hay coincidencia', () => {
  const p = post('sacramento-confirmacion-sello-espiritu');
  const bloque = seoEnlaces.renderBloqueSEO(p, { todosLosPosts, getInfografiasFn: undefined });
  assert.ok(bloque.recursosPdf.length > 0);
  assert.match(bloque.tarjetasRelacionadas, /Guías en PDF para descargar/);
  assert.match(bloque.tarjetasRelacionadas, /\/catequesis-ia\/recursos\//);
});
