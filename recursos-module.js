// ════════════════════════════════════════════════════════════════
// RECURSOS MODULE — Cargar recursos locales (Catecismo, Biblia, Santos...)
// Búsqueda inteligente semántica y por expresiones regulares
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

function leerDataset(nombre) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, nombre), 'utf8'));
  } catch(e) {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', nombre), 'utf8'));
    } catch(e2) {
      console.warn(`[Recursos] No se pudo leer el dataset ${nombre}:`, e2.message);
      return null;
    }
  }
}

// Cargar todos los datasets para la búsqueda local estructurada al iniciar el servidor
const DATASETS = {
  catecismo: leerDataset('catecismo.json'),
  biblia: leerDataset('biblia.json'),
  santos: leerDataset('santos.json'),
  docVaticano: leerDataset('documentos_vaticano.json'),
  oraciones: leerDataset('oraciones.json'),
  novenas: leerDataset('novenas.json'),
  moralYEscatologia: leerDataset('moral_escatologia.json'),
  historiaIglesia: leerDataset('historia_iglesia.json'),
  faq: leerDataset('faq_catolico.json'),
  leonXIV: leerDataset('papa_leon_xiv.json'),
  enciclica: leerDataset('enciclica_magnifica_humanitas.json')
};

// ── Búsqueda Local Estructurada ──
function consultarRecursosLocales(query) {
  const q = (query || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const resultados = [];

  // 1. Oraciones
  const oraciones = DATASETS.oraciones;
  if (oraciones && oraciones.oraciones_principales) {
    const encontradas = oraciones.oraciones_principales.filter(o => 
      o.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
      o.texto_es.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)
    );
    encontradas.forEach(o => {
      resultados.push({
        tipo: 'oracion',
        titulo: `Oración: ${o.nombre}`,
        contenido: o.texto_es,
        metadata: { tipo_oracion: o.tipo, origen: o.origen, cuando: o.cuando_rezar }
      });
    });
  }

  // 2. Novenas
  const novenas = DATASETS.novenas;
  if (novenas && novenas.novenas) {
    novenas.novenas.forEach(n => {
      if (n.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) {
        resultados.push({
          tipo: 'novena',
          titulo: n.nombre,
          contenido: `Oración preparatoria: ${n.oracion_preparatoria}\n\nTiene ${n.dias.length} días de meditación.`,
          metadata: { fechas: n.fechas, tambien_cuando: n.tambien_cuando }
        });
      }
    });
  }

  // 3. Santos (Santoral)
  const santos = DATASETS.santos;
  if (santos && santos.santos_por_mes) {
    Object.entries(santos.santos_por_mes).forEach(([mes, lista]) => {
      lista.forEach(s => {
        if (s.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
            s.descripcion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) {
          resultados.push({
            tipo: 'santoral',
            titulo: `${s.nombre} (${s.tipo})`,
            contenido: `${s.descripcion}\nMes: ${mes}, Día: ${s.dia}`,
            metadata: { dia: s.dia, mes, tipo: s.tipo }
          });
        }
      });
    });
  }

  // 4. León XIV y su encíclica
  const leonXIV = DATASETS.leonXIV;
  if (leonXIV) {
    // Buscar en preguntas frecuentes
    if (leonXIV.preguntas_frecuentes) {
      leonXIV.preguntas_frecuentes.forEach(pf => {
        if (pf.pregunta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
            pf.respuesta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) {
          resultados.push({
            tipo: 'papa_leon_xiv',
            titulo: pf.pregunta,
            contenido: pf.respuesta,
            metadata: { papa: 'León XIV' }
          });
        }
      });
    }

    // Buscar en biografía/temas prioritarios
    const biografiaStr = JSON.stringify(leonXIV.biografia);
    if (q.includes('leon xiv') || q.includes('león xiv') || q.includes('prevost') || q.includes('nuevo papa') || biografiaStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) {
      resultados.push({
        tipo: 'papa_leon_xiv',
        titulo: `Papa León XIV (Robert Francis Prevost)`,
        contenido: `Elegido el ${leonXIV.elegido}. Origen: ${leonXIV.origen}. Lema episcopal: "${leonXIV.lema_episcopal}" (${leonXIV.lema_significado}).\n` +
                   `Biografía básica: ${leonXIV.biografia.mision_peru} ${leonXIV.biografia.vaticano} ${leonXIV.biografia.conclave}\n` +
                   `Temas prioritarios: ${leonXIV.temas_prioritarios.join(', ')}`,
        metadata: { orden: leonXIV.orden_religiosa, lema: leonXIV.lema_episcopal }
      });
    }
  }

  const enciclica = DATASETS.enciclica;
  if (enciclica) {
    const enciclicaStr = JSON.stringify(enciclica);
    if (q.includes('magnifica') || q.includes('humanitas') || q.includes('inteligencia artificial') || q.includes('ia') || q.includes('babel') || enciclicaStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) {
      // Buscar conceptos clave
      const conceptosMatch = [];
      Object.entries(enciclica.conceptos_clave).forEach(([clave, desc]) => {
        if (clave.includes(q) || desc.toLowerCase().includes(q) || q.includes('ia') || q.includes('algoritmo') || q.includes('digital')) {
          conceptosMatch.push(`**${clave.toUpperCase().replace(/_/g, ' ')}**: ${desc}`);
        }
      });

      // Buscar citas destacadas
      const citasMatch = enciclica.citas_destacadas.filter(c => c.texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));

      resultados.push({
        tipo: 'enciclica_magnifica_humanitas',
        titulo: `Encíclica Magnifica Humanitas (Papa León XIV, 2026)`,
        contenido: `Tema principal: ${enciclica.tema}.\n` +
                   `Resumen ejecutivo: ${enciclica.resumen_ejecutivo}\n` +
                   (conceptosMatch.length > 0 ? `\nConceptos clave encontrados:\n${conceptosMatch.join('\n')}` : '') +
                   (citasMatch.length > 0 ? `\n\nCita destacada: "${citasMatch[0].texto}" (${citasMatch[0].fuente})` : ''),
        metadata: { papa: 'León XIV', fecha: enciclica.fecha }
      });
    }
  }

  // 5. Moral y Escatología
  const moralY = DATASETS.moralYEscatologia;
  if (moralY) {
    // Buscar en moral sexual y de la vida
    if (moralY.moral_sexual_y_vida) {
      Object.entries(moralY.moral_sexual_y_vida).forEach(([tema, info]) => {
        const infoStr = JSON.stringify(info).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (tema.toLowerCase().includes(q) || infoStr.includes(q)) {
          resultados.push({
            tipo: 'moral_de_vida',
            titulo: `Doctrina Moral sobre: ${tema.toUpperCase().replace(/_/g, ' ')}`,
            contenido: `Posición oficial de la Iglesia: ${info.posicion_oficial || info.posicion || info.indisolubilidad || info.persona}\n` +
                       `Fundamento/Razón: ${info.fundamento || info.razon || info.tendencia || ''}\n` +
                       `Documentos citados: ${(info.documentos || []).join(', ') || ''}`,
            metadata: { tema }
          });
        }
      });
    }

    // Buscar en escatología
    if (moralY.escatologia_completa) {
      Object.entries(moralY.escatologia_completa).forEach(([tema, info]) => {
        const infoStr = typeof info === 'string' ? info : JSON.stringify(info);
        if (tema.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
            infoStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) {
          resultados.push({
            tipo: 'escatologia',
            titulo: `Escatología (Novísimos): ${tema.toUpperCase()}`,
            contenido: typeof info === 'string' ? info : (info.que_es ? `${info.que_es}\nFundamento: ${info.fundamento || ''}\nNota: ${info.nota || info.cuerpo || ''}` : JSON.stringify(info)),
            metadata: { tema }
          });
        }
      });
    }
  }

  // 6. Historia de la Iglesia
  const hist = DATASETS.historiaIglesia;
  if (hist && hist.periodos) {
    hist.periodos.forEach(p => {
      p.eventos.forEach(ev => {
        if (ev.evento.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
            ev.descripcion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) {
          resultados.push({
            tipo: 'historia_iglesia',
            titulo: `Historia: ${ev.evento} (Año ${ev.año})`,
            contenido: ev.descripcion,
            metadata: { periodo: p.periodo, año: ev.año }
          });
        }
      });
    });
  }

  // 7. FAQ de CatólicosGPT
  const faq = DATASETS.faq;
  if (faq && faq.categorias) {
    Object.entries(faq.categorias).forEach(([cat, list]) => {
      list.forEach(item => {
        if (item.q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
            item.a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) {
          resultados.push({
            tipo: 'faq',
            titulo: item.q,
            contenido: item.a,
            metadata: { categoria: cat, fuente: item.fuente }
          });
        }
      });
    });
  }

  return resultados;
}

// ── Corpus local de respaldo ────────────────────────────────────────────────
// Este índice no sustituye la API de Magisterium. Sólo permite una respuesta
// prudente cuando las credenciales o la red no están disponibles. Incluye
// únicamente fragmentos cuyo origen está identificado en el dataset local.
let corpusRespaldo = null;

function normalizarParaBusqueda(value) {
  return String(value || '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9áéíóúüñ]+/gi, ' ')
    .trim();
}

function tokensDeConsulta(query) {
  const stopWords = new Set([
    'que', 'como', 'cual', 'cuál', 'para', 'sobre', 'desde', 'donde', 'dónde',
    'cuando', 'quien', 'quién', 'esto', 'esta', 'este', 'los', 'las', 'una',
    'uno', 'del', 'con', 'por', 'the', 'and', 'catolico', 'catolica', 'iglesia'
  ]);
  return [...new Set(normalizarParaBusqueda(query).split(/\s+/).filter(token => token.length > 2 && !stopWords.has(token)))];
}

function crearCorpusRespaldo() {
  const entradas = [];
  const agregar = ({ tipo, titulo, contenido, referencia, url, metadata = {} }) => {
    const cleanTitle = String(titulo || '').trim();
    const cleanContent = String(contenido || '').trim();
    if (!cleanTitle || !cleanContent) return;
    entradas.push({
      tipo: tipo || 'recurso_local',
      titulo: cleanTitle,
      contenido: cleanContent,
      referencia: referencia || null,
      url: url || null,
      metadata
    });
  };

  // Catecismo: recorremos su estructura para no perder los numerales.
  const catecismo = DATASETS.catecismo;
  const recorrerCatecismo = (node, trail = []) => {
    if (Array.isArray(node)) {
      node.forEach(item => recorrerCatecismo(item, trail));
      return;
    }
    if (!node || typeof node !== 'object') return;
    const siguienteTrail = node.titulo ? [...trail, node.titulo] : trail;
    if (node.cic && node.texto) {
      agregar({
        tipo: 'catecismo',
        titulo: `${siguienteTrail[siguienteTrail.length - 1] || 'Catecismo'} · CIC ${node.cic}`,
        contenido: node.texto,
        referencia: `CIC ${node.cic}`,
        url: 'https://www.vatican.va/archive/catechism_sp/index_sp.html',
        metadata: { fuente: 'Catecismo de la Iglesia Católica', cic: node.cic }
      });
    }
    Object.entries(node).forEach(([key, value]) => {
      if (!['cic', 'texto', 'titulo'].includes(key)) recorrerCatecismo(value, siguienteTrail);
    });
  };
  recorrerCatecismo(catecismo);

  // Biblia: el dataset actual contiene pasajes clave de los Evangelios.
  const evangelios = DATASETS.biblia?.evangelios || {};
  Object.values(evangelios).forEach(libro => {
    (libro.pasajes_clave || []).forEach(pasaje => {
      agregar({
        tipo: 'biblia',
        titulo: `${libro.nombre || 'Sagrada Escritura'} · ${pasaje.ref || ''}`.trim(),
        contenido: pasaje.texto,
        referencia: pasaje.ref || null,
        url: 'https://www.vatican.va/archive/bible/index_sp.htm',
        metadata: { fuente: 'Sagrada Escritura', pasaje: pasaje.nombre || null }
      });
    });
  });

  // Documentos pontificios identificados. Se excluye cualquier título que no
  // tenga una fuente oficial verificable en esta base local.
  const documentos = DATASETS.docVaticano || {};
  ['encíclicas_sociales', 'encíclicas_doctrinales'].forEach(grupo => {
    (documentos[grupo] || []).forEach(documento => {
      if (normalizarParaBusqueda(documento.nombre).includes('magnifica humanitas')) return;
      agregar({
        tipo: 'documento_pontificio',
        titulo: documento.nombre,
        contenido: [documento.tema, documento.resumen, ...(documento.citas_clave || [])].filter(Boolean).join('\n'),
        referencia: documento.año ? String(documento.año) : null,
        url: 'https://www.vatican.va/content/vatican/es.html',
        metadata: { fuente: 'Vatican.va', papa: documento.papa || null, año: documento.año || null }
      });
    });
  });

  // Oraciones y preguntas locales conservan siempre la atribución disponible.
  (DATASETS.oraciones?.oraciones_principales || []).forEach(oracion => {
    agregar({
      tipo: 'oracion',
      titulo: oracion.nombre,
      contenido: oracion.texto_es,
      referencia: oracion.origen || null,
      metadata: { fuente: oracion.origen || 'Tradición católica', tipo: oracion.tipo || null }
    });
  });
  Object.entries(DATASETS.faq?.categorias || {}).forEach(([categoria, preguntas]) => {
    (preguntas || []).forEach(pregunta => {
      agregar({
        tipo: 'faq',
        titulo: pregunta.q,
        contenido: pregunta.a,
        referencia: pregunta.fuente || null,
        metadata: { fuente: pregunta.fuente || 'Corpus FAQ local', categoria }
      });
    });
  });

  return entradas;
}

function buscarRecursosDeRespaldo(query, { limit = 4 } = {}) {
  const consulta = normalizarParaBusqueda(query);
  const tokens = tokensDeConsulta(query);
  if (!consulta || !tokens.length) return [];
  if (!corpusRespaldo) corpusRespaldo = crearCorpusRespaldo();

  return corpusRespaldo
    .map(entrada => {
      const titulo = normalizarParaBusqueda(entrada.titulo);
      const contenido = normalizarParaBusqueda(entrada.contenido);
      let score = (titulo.includes(consulta) || contenido.includes(consulta)) ? 14 : 0;
      tokens.forEach(token => {
        if (titulo.includes(token)) score += 7;
        if (contenido.includes(token)) score += 2;
      });
      return { ...entrada, score };
    })
    .filter(entrada => entrada.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(Number(limit) || 4, 8)))
    .map(({ score, ...entrada }) => entrada);
}

module.exports = {
  leerDataset,
  consultarRecursosLocales,
  buscarRecursosDeRespaldo,
  crearCorpusRespaldo,
  DATASETS
};
