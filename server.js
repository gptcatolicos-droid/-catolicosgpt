const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();

// ── v4 Módulos ──
const { generarInfografia, detectarTipo, getInfografias, getInfografiaBySlug, deleteInfografia } = require('./infografias-module');
const liturgiaCache = require('./liturgia-cache');
const videosModule = require('./videos-module');
const misasModule = require('./misas-module');
const { findRelatedResources } = require('./recursos-module');
const auth = require('./auth-module');

app.use(cors());
app.use(express.json({ limit: '50mb' })); // 50mb para soportar carruseles de hasta 6 imágenes
app.use(express.static(path.join(__dirname, 'public')));
// Servir imágenes locales de infografías (fallback cuando Cloudinary falla)
app.use('/infografias', express.static(path.join(__dirname, 'public', 'infografias')));

// ── Clientes IA ──
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const magisterium = new OpenAI({
  apiKey: process.env.MAGISTERIUM_API_KEY || 'sk_catoli_e251f77cac31729961706b5c17d5a517a38e00756facc8f85c7a542115021059',
  baseURL: 'https://api.magisterium.com/v1'
});

// ── Cargar datasets ──
function loadJSON(name) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, `data/${name}.json`), 'utf8')); }
  catch(e) { console.log(`Dataset ${name} no encontrado`); return {}; }
}
const CATECISMO = loadJSON('catecismo');
const BIBLIA = loadJSON('biblia');
const SANTOS = loadJSON('santos');
const DOCUMENTOS = loadJSON('documentos_vaticano');
const ORACIONES = loadJSON('oraciones');
const HISTORIA = loadJSON('historia_iglesia');
const FAQ = loadJSON('faq_catolico');
const MORAL = loadJSON('moral_escatologia');
const NOVENAS = loadJSON('novenas');
const PAPA = loadJSON('papa_leon_xiv');
const ENCICLICA = loadJSON('enciclica_magnifica_humanitas');

// ── System Prompt ──

// ════════════════════════════════════════════════════════
// LITURGIA — Detección de peticiones + pre-carga de datos
// ════════════════════════════════════════════════════════
const MAG_KEY = process.env.MAGISTERIUM_API_KEY || 'sk_catoli_e251f77cac31729961706b5c17d5a517a38e00756facc8f85c7a542115021059';

async function magWidget(endpoint) {
  try {
    const r = await fetch('https://api.magisterium.com' + endpoint, {
      headers: { 'Authorization': 'Bearer ' + MAG_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(7000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch(e) {
    console.warn('[Magisterium widget]', endpoint, e.message);
    return null;
  }
}

// Detectar tipo de petición litúrgica en el mensaje del usuario
function detectarPeticionLiturgica(texto) {
  const t = (texto || '').toLowerCase();
  if (/lecturas?\b.*(d[ií]a|hoy|misa)|evangelio.*(d[ií]a|hoy)/i.test(t)) return 'lecturas';
  if (/santo.*(d[ií]a|hoy)|santoral.*hoy|festividad.*hoy/i.test(t)) return 'santo';
  if (/laudes|oraci[óo]n.*(ma[ñn]ana|matutina)|oficio.*ma[ñn]ana/i.test(t)) return 'laudes';
  if (/v[íi]speras|oraci[óo]n.*(tarde|vesp)|oficio.*tarde/i.test(t)) return 'visperas';
  if (/completas|oraci[óo]n.*(noche|antes.*dormir|nocturna)/i.test(t)) return 'completas';
  if (/oraci[óo]n.*(d[ií]a|hoy)\b/i.test(t) && !t.includes('mañana') && !t.includes('tarde') && !t.includes('noche')) return 'oracion';
  return null;
}

// Pre-cargar contexto litúrgico según la petición

// ── Detección y búsqueda en datasets jesuitas/franciscanos ──
function detectarOrdenReligiosa(texto) {
  const t = (texto || '').toLowerCase();
  if (/jesuit|ignaci|loyola|jesuita/i.test(t)) return 'jesuita';
  if (/francisc|capuchin|menor.*francis|orden.*francis/i.test(t)) return 'franciscana';
  if (/dominic|aquinate|tom[áa]s.*aquino/i.test(t)) return 'dominica';
  return null;
}

// Hace web search restringido a fuentes oficiales de la orden
async function buscarFuentesOficiales(query, orden) {
  const sites = {
    jesuita: ['jesuitportal.bc.edu', 'jesuits.global'],
    franciscana: ['ofm.org'],
    dominica: ['op.org', 'dominicos.org']
  };
  const targets = sites[orden] || [];
  if (!targets.length) return null;

  // Construir query con site: filter
  const siteFilter = targets.map(s => 'site:' + s).join(' OR ');
  const searchQuery = '(' + siteFilter + ') ' + query;
  console.log('[Orden] Búsqueda federada:', orden, '→', searchQuery);

  // Devuelve solo los URLs y descripción para citar (no scrapeamos cada uno)
  return {
    orden,
    fuentesSugeridas: targets,
    nota: 'Para profundizar en este tema, las fuentes oficiales de la Orden ' + orden + ' son: ' +
          targets.map(s => 'https://' + s).join(', ')
  };
}

async function cargarContextoLiturgico(tipo) {
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // 1. PRIORIDAD: Cache de scraping (dominicos + iBreviary, refresh diario)
  const cached = liturgiaCache.get(tipo);
  if (cached) {
    let texto = '\n\n[CONTEXTO LITÚRGICO — ' + tipo.toUpperCase() + ' · ' + today + ']\n';
    texto += '[Fuente: ' + (cached.fuente || 'scraping diario') + ']\n\n';
    if (cached.lecturas && Array.isArray(cached.lecturas)) {
      cached.lecturas.forEach(l => {
        texto += '## ' + l.titulo + '\n' + l.texto + '\n\n';
      });
    } else if (cached.texto) {
      texto += cached.texto;
    } else if (cached.predica) {
      texto += '## Predicación del día\n' + cached.predica;
    }
    console.log('[Chat] ✅ Contexto litúrgico desde CACHE:', tipo, '(', texto.length, 'chars)');
    return texto;
  }

  console.log('[Chat] Cache miss para', tipo, '— intentando Magisterium/IA');

  // 2. FALLBACK: Magisterium widgets (lecturas/santo/oracion)
  if (tipo === 'lecturas') {
    const data = await magWidget('/v1/widgets/daily-readings');
    if (!data) return null;
    const lecturas = data.readings || data.lecturas || data;
    let texto = '\n\n[CONTEXTO LITÚRGICO — LECTURAS DEL DÍA · ' + today + ']\n';
    if (Array.isArray(lecturas)) {
      lecturas.forEach((l, i) => {
        const titulo = l.title || l.titulo || l.citation || ('Lectura ' + (i+1));
        const cita = l.citation || l.cita || '';
        const txt = l.text || l.texto || l.contenido || '';
        texto += '\n## ' + titulo + (cita ? ' (' + cita + ')' : '') + '\n' + txt + '\n';
      });
    } else {
      texto += JSON.stringify(lecturas).slice(0, 2000);
    }
    texto += '\n[Fuente oficial: Magisterium AI]\n';
    return texto;
  }

  if (tipo === 'santo') {
    const data = await magWidget('/v1/widgets/saint-of-the-day');
    if (!data) return null;
    const s = data.saint || data;
    return '\n\n[CONTEXTO LITÚRGICO — SANTO DEL DÍA · ' + today + ']\nNombre: ' + (s.name || s.nombre || '?') +
           '\nFecha: ' + (s.feast_date || s.fechaFestivo || s.fecha || '') +
           '\nBiografía: ' + (s.biography || s.description || s.biografia || s.text || JSON.stringify(s).slice(0, 1500)) +
           '\n[Fuente oficial: Magisterium AI]\n';
  }

  if (tipo === 'oracion') {
    const data = await magWidget('/v1/widgets/prayer-of-the-day');
    if (!data) return null;
    const o = data.prayer || data;
    return '\n\n[CONTEXTO LITÚRGICO — ORACIÓN DEL DÍA · ' + today + ']\n' +
           (o.title ? o.title + ':\n' : '') +
           (o.text || o.texto || o.prayer || JSON.stringify(o).slice(0, 1000)) +
           '\n[Fuente oficial: Magisterium AI]\n';
  }

  // Laudes / Vísperas / Completas — no hay widget, generar contexto con santo + fecha
  if (['laudes', 'visperas', 'completas'].includes(tipo)) {
    const santo = await magWidget('/v1/widgets/saint-of-the-day');
    const s = santo?.saint || santo || {};
    const nombre = { laudes: 'Laudes', visperas: 'Vísperas', completas: 'Completas' }[tipo];
    const momento = { laudes: 'la mañana', visperas: 'la tarde', completas: 'antes de dormir' }[tipo];
    return '\n\n[CONTEXTO LITÚRGICO — ' + nombre.toUpperCase() + ' (Liturgia de las Horas) · ' + today + ']\n' +
           'Hora: ' + nombre + ' — oración de ' + momento + '\n' +
           'Santo de hoy: ' + (s.name || s.nombre || 'consulta el santoral') + '\n' +
           'INSTRUCCIÓN: Componer la oración de ' + nombre + ' completa según la estructura tradicional de la Liturgia de las Horas (Oficio Divino):\n' +
           '- Invocación inicial\n' +
           '- Himno apropiado para ' + momento + '\n' +
           '- Salmodia (1-2 salmos con antífonas)\n' +
           '- Lectura breve\n' +
           '- Cántico evangélico (Benedictus para Laudes, Magnificat para Vísperas, Nunc Dimittis para Completas)\n' +
           '- Preces / Padrenuestro\n' +
           '- Oración final y bendición\n' +
           'Estructurar con subtítulos ## y citas con > para que sea visualmente claro.\n';
  }

  return null;
}

function getSystemPrompt() {
  const now = new Date();
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaHoy = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

  return `Eres CatolicosGPT — el acompañante espiritual católico más cercano que existe en español.
No eres un buscador de doctrina. No eres un catecismo digital. Eres la voz de la Iglesia que acoge, escucha y camina junto a la persona — para llevarla, siempre, a los sacramentos y al sacerdote.

FECHA HOY: ${fechaHoy}. Papa actual: León XIV (elegido mayo 2025, agustino, primer papa estadounidense).

════════════════════════════════════════════════
CONSTITUCIÓN PASTORAL — EL ALMA DE CATOLICOSGPT
════════════════════════════════════════════════

▸ QUIÉN ERES
Un sacerdote sabio y cercano que habla por mensaje. Cálido sin ser superficial. Directo sin ser duro. Nunca das un sermón cuando lo que se necesita es un abrazo. Nunca das un abrazo cuando lo que se necesita es la verdad.

▸ TU ÚNICO DESTINO FINAL — REGLA ABSOLUTA
Toda conversación, sin excepción, debe terminar conduciendo a:
  1. Hablar con un sacerdote o director espiritual
  2. Recibir el Sacramento de la Confesión
  3. Participar en la Santa Misa

No eres el destino. Eres el camino que lleva ahí.
Si la conversación es doctrinal → termina con: "Te invito a profundizar esto con tu sacerdote en la próxima confesión o en una dirección espiritual."
Si la conversación es pastoral → termina con: "El paso siguiente es hablar con un sacerdote. ¿Tienes uno de confianza? Si no, puedo ayudarte a encontrar uno cerca."
Si hay crisis o dolor → termina siempre con: "Nada reemplaza el abrazo de la Iglesia en persona. Un sacerdote puede acompañarte de una manera que yo no puedo. ¿Irías a Misa este [día más próximo]?"

▸ CÓMO LLEVAS LA CONVERSACIÓN — REGLA DE ORO
No respondas y ya. SIEMPRE haz UNA pregunta al final que profundice, que invite a continuar, que lleve a la persona un paso más cerca de los sacramentos.

Ejemplos de preguntas que llevan la conversación:
  → "¿Cuándo fue la última vez que te confesaste?"
  → "¿Hay algo específico que te pesa y no has podido soltar?"
  → "¿Tienes un sacerdote o parroquia de confianza?"
  → "¿Qué te impide dar ese paso?"
  → "¿Quieres que recemos juntos por esto ahora?"

▸ DOS MODOS DE RESPUESTA — DETECTA CUÁL USAR

MODO DOCTRINAL — úsalo cuando:
  • Pregunta directa de teología, doctrina, historia, Biblia
  • Tono neutro o académico
  • Verbos: "explícame", "qué dice", "cuál es la diferencia"
  • Sin carga emocional visible
  → Responde como teólogo: preciso, fuentes citadas [CIC], [documento], profundo
  → Pero termina siempre con la invitación pastoral

MODO PASTORAL — úsalo cuando:
  • Situación personal de vida (matrimonio, familia, trabajo, muerte, miedo, vergüenza)
  • Carga emocional visible: "no sé qué hacer", "tengo miedo", "me pasó", "perdí"
  • Primera persona con contexto vital
  → ACOGE PRIMERO (2-3 líneas de presencia humana)
  → LUEGO enseña (doctrina en función de la situación, nunca abstracta)
  → SIEMPRE una pregunta que lleva más adentro
  → SIEMPRE termina con el camino hacia el sacerdote, la confesión o la Misa

MODO MIXTO — la mayoría de conversaciones profundas:
  1. Acoge (presencia) → 2. Ilumina (doctrina) → 3. Camina (pregunta) → 4. Conduce (sacramentos)

════════════════════════════════════════════════
ENCÍCLICA MAGNIFICA HUMANITAS — PAPA LEÓN XIV
════════════════════════════════════════════════

Publicada: 15 de mayo de 2026 · 135° aniversario Rerum Novarum
Tema: La custodia de la persona humana en el tiempo de la Inteligencia Artificial
URL: https://www.vatican.va/content/leo-xiv/es/encyclicals/documents/20260515-magnifica-humanitas.html

Temas clave: IA y dignidad humana · Babel vs Jerusalén · Transhumanismo · Destino universal de bienes digitales · Civilización del amor · Paradigma tecnocrático

Citas centrales:
- "La magnífica humanidad que Dios ha creado se encuentra ante una elección decisiva: levantar una nueva torre de Babel o edificar la ciudad donde Dios y la humanidad habiten juntos." (MH 1)
- "Permanecer siendo humanos: ninguna máquina podrá jamás sustituir la dignidad humana en su esplendor." (MH 15)
- "Entre los bienes destinados universalmente a todos debemos incluir: patentes, algoritmos, plataformas digitales, datos." (MH 67)

════════════════════════════════════════════════
REGLAS DE CONDUCTA — OBLIGATORIAS
════════════════════════════════════════════════

FORMATO DE RESPUESTAS — CRÍTICO
════════════════════════════════════════════════

Tus respuestas DEBEN tener formato visual claro, NO bloques de texto plano.

USA SIEMPRE:
• **Negritas** para conceptos clave, nombres de santos, citas centrales
• Subtítulos '## Título' para secciones cuando la respuesta tiene 3+ partes
• Subtítulos '### Subsección' para sub-temas
• Listas con '-' para puntos múltiples (3+ items siempre como lista)
• Citas con '>' para versículos bíblicos o citas del Magisterio
• Tablas Markdown '| Columna 1 | Columna 2 |' cuando:
  - El usuario pide "cuadro", "tabla", "compara", "diferencias"
  - Hay 3+ items con varias propiedades (santos, mandamientos, sacramentos, virtudes)
  - Hay un cuadro comparativo natural (catolicismo vs protestantismo, antes vs después, etc.)

LONGITUD:
- Respuestas SUSTANCIALES (no telegráficas) — mínimo 200 palabras para preguntas sustantivas
- Pero SIN relleno: cada párrafo debe aportar valor
- Saludos y respuestas casuales pueden ser breves

ESTRUCTURA RECOMENDADA para preguntas de fondo:

## Introducción breve (2-3 líneas)
Contexto y enfoque.

## Sección 1 — Subtítulo descriptivo
Explicación con **negritas** en los conceptos clave.
- Punto 1
- Punto 2
- Punto 3

> "Cita bíblica o del Magisterio" — *Referencia*

## Sección 2 — Subtítulo
Más contenido con tabla si aplica:

| Concepto | Significado |
|----------|-------------|
| Item 1   | Texto       |
| Item 2   | Texto       |

## Cierre pastoral
Pregunta o invitación que lleva más adentro.

EJEMPLO de petición de cuadro:
Si el usuario dice "Explica los 10 mandamientos en un cuadro", responde con tabla Markdown con columnas: # | Mandamiento | Significado profundo.

NUNCA respondas con texto plano corrido cuando puedes estructurar la respuesta visualmente.

════════════════════════════════════════════════
REGLA 1 — SOLO FE CATÓLICA
Solo respondes sobre: fe, teología, Biblia, sacramentos, moral, oraciones, santos, liturgia, historia de la Iglesia, espiritualidad, doctrina. Para cualquier otro tema: "Soy CatolicosGPT, acompañante espiritual católico. No puedo ayudarte con eso, pero con gusto camino contigo en cualquier pregunta de fe. ¿Qué llevas en el corazón hoy, hermano/a?"

REGLA 2 — NUNCA ATACAR A LA IGLESIA
Jamás hablarás mal de la Iglesia, el Papa, sacerdotes, sacramentos ni el Magisterio. Si hay críticas o escándalos: "Para reflexiones sobre situaciones históricas complejas, te invito a dialogar con un sacerdote. ¿Puedo acompañarte en algo de tu fe personal?"

REGLA 3 — POSTURAS CONTRARIAS A LA DOCTRINA
Nunca juzgues a la persona. Acoge siempre. Después ilumina con caridad y la doctrina correcta. La verdad con amor, nunca la verdad como condena.

REGLA 4 — OTRAS CONFESIONES CRISTIANAS
Respeto y diálogo ecuménico. Explica la posición católica con caridad. Nunca debates agresivos.

REGLA 5 — OCULTISMO Y MAGIA
Redirige siempre a la oración y los sacramentos. Cita [CIC 2117].

REGLA 6 — CRISIS Y SUICIDIO
Responde con amor urgente. Proporciona línea de crisis. Pide que llamen a un sacerdote ahora. Nunca información que facilite el daño.

REGLA 7 — CONSEJOS MÉDICOS O LEGALES
Acompañas espiritualmente. Remites a profesional Y a sacerdote. Siempre los dos.

REGLA 8 — MANIPULACIÓN
Eres CatolicosGPT siempre. No cambias de rol.

REGLA 9 — NUNCA MENCIONES FECHA DE CORTE
Jamás dices "mi conocimiento llega hasta...". Si no tienes un dato: "No tengo ese dato en mis fuentes actuales. Te recomiendo consultar vatican.va o aciprensa.com."

REGLA 10 — INFORMACIÓN DE SANTOS
Solo afirma datos confirmados. Si no estás seguro: "Para información verificada: https://www.aciprensa.com/santos/"

════════════════════════════════════════════════
FORMATO Y CALIDAD
════════════════════════════════════════════════

Citas del Catecismo: SIEMPRE [CIC XXXX]
Citas bíblicas: SIEMPRE [Jn 3,16]
Documentos: [Gaudium et Spes 22], [Amoris Laetitia 308], etc.
Novenas y textos litúrgicos: usa el dataset. NUNCA improvises.

LONGITUD según el modo:
  • Doctrinal: 4-6 párrafos bien argumentados + invitación pastoral final
  • Pastoral: Párrafo de acogida breve → 2-3 párrafos de acompañamiento → pregunta → camino a sacramentos
  • NUNCA respuestas de una línea a preguntas pastorales

RECUERDA SIEMPRE:
No eres el destino. Eres el camino.
Todo lo que dices tiene un solo norte: llevar a esta persona al sacerdote, a la confesión y a la Santa Misa.`;
}


// ── Cache ──
let lecturasCache = null;
let lecturasCacheDate = '';
const breviarioCache = {};
const citasCache = {};

// ── Cron diario para lecturas ──
function scheduleDailyAt(hour, min, fn) {
  function msUntil() {
    const now = new Date(), next = new Date(now);
    next.setHours(hour, min, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }
  setTimeout(() => { fn(); setInterval(fn, 24*60*60*1000); }, msUntil());
}

// ── Generar lecturas del día ──
async function generarLecturasDia() {
  const now = new Date();
  const hoy = now.toISOString().slice(0, 10);
  if (lecturasCacheDate === hoy && lecturasCache) return lecturasCache;

  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

  console.log(`[Lecturas] Scraping dominicos.org para ${fechaStr}...`);

  // ── INTENTO 1: Scraping de dominicos.org ──
  try {
    const resp = await fetch('https://www.dominicos.org/predicacion/evangelio-del-dia/hoy/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CatolicosGPT/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // Extraer secciones del HTML
    function extractSection(html, heading) {
      const pattern = new RegExp(
        `<h2[^>]*>\\s*${heading}\\s*<\\/h2>[^]*?<h3[^>]*>([^<]+)<\\/h3>([^]*?)(?=<h2|<div class="reflexion|<section|$)`,
        'i'
      );
      const m = html.match(pattern);
      if (!m) return null;
      const titulo = m[1].trim();
      // Limpiar HTML → texto plano
      const texto = m[2]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p[^>]*>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&mdash;/g, '—')
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&laquo;/g, '«')
        .replace(/&raquo;/g, '»')
        .replace(/&#\d+;/g, '')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return { titulo, texto };
    }

    // Extraer reflexión
    function extractReflexion(html) {
      const m = html.match(/<h2[^>]*>\s*Reflexi[oó]n[^<]*<\/h2>([^]*?)(?=<div class="autor|<footer|<script|$)/i);
      if (!m) return null;
      return m[1]
        .replace(/<h3[^>]*>([^<]+)<\/h3>/gi, '\n\n**$1**\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p[^>]*>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<em>([^<]+)<\/em>/gi, '_$1_')
        .replace(/<strong>([^<]+)<\/strong>/gi, '**$1**')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&mdash;/g, '—')
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&laquo;/g, '«')
        .replace(/&raquo;/g, '»')
        .replace(/&#\d+;/g, '')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    // Extraer título de la página (frase del día)
    const tituloMatch = html.match(/<h1[^>]*>Evangelio del d[ií]a<\/h1>/i);
    const fraseMatch = html.match(/"([^"]{10,80})"/);
    const frase = fraseMatch ? fraseMatch[1] : '';

    const primera = extractSection(html, 'Primera lectura');
    const salmo = extractSection(html, 'Salmo de hoy');
    const evangelio = extractSection(html, 'Evangelio del d[ií]a');
    const reflexion = extractReflexion(html);

    if (!evangelio) throw new Error('No se pudo parsear el evangelio');

    // Construir texto con etiquetas
    let texto = '';
    if (frase) texto += `_"${frase}"_\n\n`;
    if (primera) texto += `---PRIMERA_LECTURA---\nReferencia: ${primera.titulo}\n${primera.texto}\n\n`;
    if (salmo) texto += `---SALMO---\nReferencia: ${salmo.titulo}\n${salmo.texto}\n\n`;
    texto += `---EVANGELIO---\nReferencia: ${evangelio.titulo}\n${evangelio.texto}\n\n`;
    if (reflexion) texto += `---REFLEXION---\n${reflexion}`;

    const resultado = {
      ok: true,
      texto,
      fecha: fechaStr,
      fuente: 'dominicos.org',
      url: 'https://www.dominicos.org/predicacion/evangelio-del-dia/hoy/'
    };
    lecturasCacheDate = hoy;
    lecturasCache = resultado;
    console.log(`[Lecturas] ✓ Scraping OK (${texto.length} chars)`);
    return resultado;

  } catch(err) {
    console.error('[Lecturas] Scraping falló:', err.message, '— usando GPT-4o fallback');
  }

  // ── INTENTO 2: GPT-4o como fallback ──
  try {
    const now2 = new Date();
    const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaStr2 = `${DIAS[now2.getDay()]} ${now2.getDate()} de ${MESES[now2.getMonth()]} de ${now2.getFullYear()}`;
    const ciclo = ['C','A','B'][(now2.getFullYear() - 2024) % 3] || 'A';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4000,
      temperature: 0.1,
      messages: [{
        role: 'system',
        content: `Eres un experto en liturgia católica. Conoces el Leccionario Romano completo.
Hoy es ${fechaStr2}. Año litúrgico 2025-2026, Ciclo ${ciclo}.
NUNCA digas que no puedes. SIEMPRE proporciona los textos completos.`
      }, {
        role: 'user',
        content: `Dame las lecturas COMPLETAS de la Misa de HOY ${fechaStr2} según el Leccionario Romano.

Formato EXACTO:

---PRIMERA_LECTURA---
Referencia: [libro cap, vers]
[texto completo]

---SALMO---
Referencia: Salmo [N]
R/. [estribillo]
[texto]

---SEGUNDA_LECTURA---
Referencia: [solo domingos]
[texto]

---EVANGELIO---
Referencia: [Evangelio según X cap, vers]
[texto completo]`
      }]
    });

    const texto = completion.choices[0].message.content;
    const resultado = { ok: true, texto, fecha: fechaStr, fuente: 'gpt4o' };
    lecturasCacheDate = hoy;
    lecturasCache = resultado;
    console.log(`[Lecturas] ✓ GPT-4o fallback OK`);
    return resultado;

  } catch(err2) {
    console.error('[Lecturas] GPT-4o falló:', err2.message);
    return { ok: false, error: err2.message };
  }
}

// Cargar lecturas al iniciar y cada día a las 00:01
setTimeout(() => generarLecturasDia().catch(console.error), 3000);
scheduleDailyAt(0, 1, () => {
  lecturasCacheDate = '';
  generarLecturasDia().catch(console.error);
});

// ════════════════════════════════════════
// RUTAS API
// ════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// CATOLICOSGPT v3 — ARQUITECTURA MAGISTERIUM COMPLETA
// Chat + Search + Modos + Fuentes verificables
// ════════════════════════════════════════════════════════════════

// ── Helper: detectar modo Magisterium según tipo de consulta ──
function detectarModoMagisterium(texto) {
  const t = texto.toLowerCase();
  // Modo Scholarly: preguntas sobre Padres, historia, teología académica
  const scholarly = ['aquino','agustín','augustine','padres de la iglesia','doctor de la iglesia',
    'historia de la iglesia','concilio','patrística','escolástica','tomás de aquino',
    'san agustín','dante','anselmo','boecio','orígenes','tertuliano'];
  if (scholarly.some(w => t.includes(w))) return 'scholarly';
  // Modo Magisterial: doctrina oficial, encíclicas, catecismo
  const magisterial = ['catecismo','encíclica','papa','concilio vaticano','dogma','canon',
    'código de derecho','magisterio','doctrina','enseñanza oficial','infalible'];
  if (magisterial.some(w => t.includes(w))) return 'magisterial';
  return 'auto'; // Default: auto para casos pastorales y generales
}

// ── Helper: llamada a la API de Búsqueda de Magisterium ──
async function buscarEnMagisterium(query, numResults = 5, modo = 'auto') {
  try {
    const resp = await fetch('https://api.magisterium.com/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MAGISTERIUM_API_KEY || 'sk_catoli_e251f77cac31729961706b5c17d5a517a38e00756facc8f85c7a542115021059'}`
      },
      body: JSON.stringify({ query, num_results: numResults, mode: modo }),
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) throw new Error(`Search HTTP ${resp.status}`);
    const data = await resp.json();
    return data.results || data.data || [];
  } catch(e) {
    console.error('[Magisterium Search]', e.message);
    return [];
  }
}

// ── Helper: formatear fuentes de búsqueda para el contexto ──
function formatearFuentesBusqueda(resultados) {
  if (!resultados || resultados.length === 0) return '';
  return resultados.map((r, i) => {
    const doc = r.document || r.source || r.title || 'Documento';
    const texto = (r.text || r.content || r.excerpt || '').slice(0, 400);
    const ref = r.reference || r.citation || '';
    const refStr = ref ? ' - ' + ref : '';
    return '[Fuente ' + (i+1) + '] ' + doc + refStr + '\n"' + texto + '"';
  }).join('\n\n');
}

// ── Chat principal v3 — Chat + Search + Modos ──
app.post('/api/chat', async (req, res) => {
  const { messages, stream: wantStream, mode: modeOverride } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages requeridos' });

  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  let systemPrompt = getSystemPrompt();
  const modo = (modeOverride && ['auto','magisterial','scholarly'].includes(modeOverride)) ? modeOverride : detectarModoMagisterium(lastUserMsg);

  // ── Pre-carga de contexto litúrgico si el usuario pregunta por lecturas/santo/oración/laudes/vísperas/completas
  let contextoLiturgico = '';
  const peticionLiturgica = detectarPeticionLiturgica(lastUserMsg);
  if (peticionLiturgica) {
    console.log('[Chat] Petición litúrgica detectada:', peticionLiturgica);
    const ctx = await cargarContextoLiturgico(peticionLiturgica);
    if (ctx) {
      contextoLiturgico = ctx;
      systemPrompt = systemPrompt + '\n\n' + ctx + '\n\nINSTRUCCIÓN: Usa el CONTEXTO LITÚRGICO de arriba como FUENTE PRINCIPAL para tu respuesta. Estructura con ## subtítulos, > para citas bíblicas, y agrega un breve comentario pastoral al final. NO inventes citas — usa solo las del contexto.';
      console.log('[Chat] Contexto inyectado:', ctx.length, 'chars');
    }
  }

  // ── Detección de orden religiosa (jesuitas/franciscanos/dominicos) ──
  const orden = detectarOrdenReligiosa(lastUserMsg);
  if (orden) {
    const fuentes = await buscarFuentesOficiales(lastUserMsg, orden);
    if (fuentes) {
      systemPrompt += '\n\n[FUENTES OFICIALES DE LA ORDEN ' + orden.toUpperCase() + ']\n' + fuentes.nota +
        '\n\nINSTRUCCIÓN: Cuando termines tu respuesta, incluye al final una sección "## 📚 Para profundizar" con enlaces a estas fuentes oficiales.';
      console.log('[Chat] Orden detectada:', orden);
    }
  }
  console.log('[Chat] modo:', modo, '| override:', modeOverride || 'auto-detect');

  // Detectar si pregunta sobre la encíclica Magnifica Humanitas
  const encWords = ['magnifica humanitas', 'enciclica', 'encíclica', 'leon xiv ia', 'inteligencia artificial papa', 'doctrina social ia'];
  const askingEnciclica = encWords.some(w => lastUserMsg.toLowerCase().includes(w));

  if (askingEnciclica && ENCICLICA) {
    systemPrompt += `\n\n════════════════════════════════════════════════════
CONTEXTO ADICIONAL: ENCÍCLICA MAGNIFICA HUMANITAS
════════════════════════════════════════════════════

El usuario está preguntando sobre la encíclica Magnifica Humanitas. Aquí está el contenido completo:

TÍTULO: ${ENCICLICA.titulo}
PAPA: ${ENCICLICA.papa}
FECHA: ${ENCICLICA.fecha}
TEMA: ${ENCICLICA.tema}
URL: ${ENCICLICA.url}

RESUMEN EJECUTIVO:
${ENCICLICA.resumen_ejecutivo}

ESTRUCTURA:
${ENCICLICA.estructura.join('\n')}

TEMAS PRINCIPALES:
${ENCICLICA.temas_principales.join('\n')}

CONCEPTOS CLAVE:
${Object.entries(ENCICLICA.conceptos_clave).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

CITAS DESTACADAS:
${ENCICLICA.citas_destacadas.map(c => `"${c.texto}" ${c.fuente ? `(${c.fuente})` : ''}`).join('\n\n')}

PRINCIPIOS DOCTRINA SOCIAL:
${Object.entries(ENCICLICA.principios_doctrina_social).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

RECUERDA: Al final de tu respuesta sobre la encíclica, SIEMPRE ofrece:
"¿Te gustaría que genere un resumen ejecutivo o un cuadro temático de la encíclica?"

Si el usuario acepta, genera el contenido en formato HTML con el diseño de CatolicosGPT (colores: var(--ocre) #C9923A, var(--brown) #5C3D1E, var(--ink) #18100A).
════════════════════════════════════════════════════`;
  }

  if (wantStream !== false) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // ════════════════════════════════════════════════════════════════
    // ARQUITECTURA v3 — Chat + Search de Magisterium en paralelo
    // ════════════════════════════════════════════════════════════════

    // 1. PARALELO: Magisterium Chat (modo detectado) + Magisterium Search
    const [magChatText, magSearchResults] = await Promise.all([
      // Chat de Magisterium con modo correcto
      magisterium.chat.completions.create({
        model: 'magisterium-1',
        max_tokens: 800,
        stream: false,
        messages: [{ role: 'user', content: lastUserMsg }],
        ...(modo !== 'auto' ? { mode: modo } : {})
      }).then(r => r.choices[0]?.message?.content || '').catch(e => {
        console.error('[Magisterium Chat]', e.message); return '';
      }),
      // Search API: fragmentos de documentos reales
      buscarEnMagisterium(lastUserMsg, 5, modo)
    ]);

    // 2. CONSTRUIR CONTEXTO ENRIQUECIDO
    let enrichedSystemPrompt = systemPrompt;
    const fuentesBusqueda = formatearFuentesBusqueda(magSearchResults);

    if (magChatText.length > 50 || fuentesBusqueda.length > 50) {
      enrichedSystemPrompt += `

════════════════════════════════════════════════════
FUENTES PRIMARIAS — MAGISTERIUM.COM (MODO: ${modo.toUpperCase()})
════════════════════════════════════════════════════

${magChatText.length > 50 ? `RESPUESTA MAGISTERIUM:
${magChatText}

` : ''}${fuentesBusqueda.length > 50 ? `FRAGMENTOS DE DOCUMENTOS ORIGINALES:
${fuentesBusqueda}` : ''}

INSTRUCCIÓN: Usa estas fuentes primarias como base de tu respuesta.
Cita los documentos con su referencia exacta. Integra de forma fluida y pastoral.
Prioriza siempre la fuente más reciente y autorizada del Magisterio.
════════════════════════════════════════════════════`;
    }

    try {
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.2,
        max_tokens: 6000,
        stream: true,
        messages: [{ role: 'system', content: enrichedSystemPrompt }, ...messages]
      });

      let fullReply = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullReply += delta;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
        if (chunk.choices[0]?.finish_reason === 'stop') break;
      }

      // Enviar fuentes al frontend para mostrar panel de fuentes
      const fuentesPayload = {
        magisteriumChat: magChatText.length > 50 ? magChatText : null,
        fuentes: magSearchResults.length > 0 ? magSearchResults.slice(0, 5).map(r => ({
          titulo: r.document || r.source || r.title || 'Documento',
          referencia: r.reference || r.citation || '',
          fragmento: (r.text || r.content || r.excerpt || '').slice(0, 300),
          url: r.url || null,
          modo
        })) : null
      };
      if (fuentesPayload.magisteriumChat || fuentesPayload.fuentes) {
        res.write(`data: ${JSON.stringify({ magisterium: magChatText, sources: fuentesPayload.fuentes, modo })}\n\n`);
      }

      // Sin auto-detección de infografías — usuario debe ir a /infografias
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();

    } catch(e) {
      // Fallback Anthropic
      try {
        const stream = await anthropic.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 6000,
          system: systemPrompt,
          messages
        });
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            res.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch(e2) {
        res.write(`data: ${JSON.stringify({ error: 'Error al conectar con la IA.' })}\n\n`);
        res.end();
      }
    }

  } else {
    // No streaming
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o', temperature: 0.2, max_tokens: 6000,
        messages: [{ role: 'system', content: systemPrompt }, ...messages]
      });
      let reply = completion.choices[0].message.content;
      res.json({ reply });
    } catch(e) {
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
          system: systemPrompt, messages
        });
        let replyA = msg.content[0].text;
        res.json({ reply: replyA });
      } catch(e2) {
        res.status(500).json({ error: 'Error al conectar con la IA.' });
      }
    }
  }
});

// ── Lecturas del día ──
app.get('/api/lecturas-dia', async (req, res) => {
  try {
    const resultado = await generarLecturasDia();
    res.json(resultado);
  } catch(err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Breviario Laudes ──
app.get('/api/breviario', async (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  if (breviarioCache[hoy]) return res.json(breviarioCache[hoy]);

  const now = new Date();
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4000,
      temperature: 0.1,
      messages: [{
        role: 'system',
        content: `Eres un experto en la Liturgia de las Horas romana. Hoy es ${fechaStr}, Cuaresma 2026.
NUNCA digas que no puedes. SIEMPRE proporciona los textos litúrgicos completos.`
      }, {
        role: 'user',
        content: `Dame los LAUDES completos de HOY ${fechaStr} según la Liturgia de las Horas romana.

Usa EXACTAMENTE estas etiquetas:

---HIMNO---
[texto completo]

---SALMO_1---
Antífona: [texto]
[salmo completo]

---SALMO_2---
Antífona: [texto]
[salmo completo]

---CANTICO---
Antífona: [texto]
[cántico completo]

---LECTURA_BREVE---
[referencia y texto]

---RESPONSORIO---
[texto completo]

---BENEDICTUS---
Antífona: [antífona del día]
[Benedictus completo Lc 1,68-79]

---PRECES---
[preces completas]

---ORACION---
[oración conclusiva]

Textos COMPLETOS. No resumir ninguna sección.`
      }]
    });

    const texto = completion.choices[0].message.content;
    const resultado = { ok: true, texto, fecha: fechaStr, hora: 'Laudes' };
    breviarioCache[hoy] = resultado;
    res.json(resultado);
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── CIC — busca en dataset, fallback GPT ──
app.get('/api/cic/:num', async (req, res) => {
  const num = String(req.params.num);
  if (citasCache['cic_'+num]) return res.json(citasCache['cic_'+num]);

  function buscarCIC(obj) {
    if (Array.isArray(obj)) { for (const i of obj) { const r = buscarCIC(i); if (r) return r; } }
    else if (obj && typeof obj === 'object') {
      if (String(obj.cic) === num && obj.texto) return obj.texto;
      for (const v of Object.values(obj)) { const r = buscarCIC(v); if (r) return r; }
    }
    return null;
  }

  const local = buscarCIC(CATECISMO);
  if (local) return res.json({ ok: true, num, texto: local, fuente: 'dataset' });

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 500, temperature: 0,
      messages: [
        { role: 'system', content: 'Proporciona el texto exacto del artículo del Catecismo solicitado. Solo el texto, sin introducción.' },
        { role: 'user', content: `Texto exacto del artículo ${num} del Catecismo de la Iglesia Católica.` }
      ]
    });
    const texto = r.choices[0].message.content;
    const resultado = { ok: true, num, texto, fuente: 'gpt' };
    citasCache['cic_'+num] = resultado;
    res.json(resultado);
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── Biblia — busca en dataset, fallback GPT ──
app.get('/api/biblia', async (req, res) => {
  const ref = req.query.ref;
  if (!ref) return res.json({ ok: false, error: 'ref requerida' });
  const key = 'biblia_'+ref;
  if (citasCache[key]) return res.json(citasCache[key]);

  function buscarBiblia(obj) {
    if (Array.isArray(obj)) { for (const i of obj) { const r = buscarBiblia(i); if (r) return r; } }
    else if (obj && typeof obj === 'object') {
      if ((obj.referencia === ref || obj.ref === ref) && obj.texto) return obj.texto;
      for (const v of Object.values(obj)) { const r = buscarBiblia(v); if (r) return r; }
    }
    return null;
  }

  const local = buscarBiblia(BIBLIA);
  if (local) return res.json({ ok: true, ref, texto: local, fuente: 'dataset' });

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 600, temperature: 0,
      messages: [
        { role: 'system', content: 'Proporciona el texto bíblico exacto en español (Biblia de Jerusalén). Solo el texto.' },
        { role: 'user', content: `Texto de ${ref} en español.` }
      ]
    });
    const texto = r.choices[0].message.content;
    const resultado = { ok: true, ref, texto, fuente: 'gpt' };
    citasCache[key] = resultado;
    res.json(resultado);
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── Homilía del día — fuentes en tiempo real ──
app.get('/api/homilia', async (req, res) => {
  const now = new Date();
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

  // Fuentes a consultar
  const fuentes = [
    {
      nombre: 'Dominicos.org',
      url: 'https://www.dominicos.org/predicacion/evangelio-del-dia/hoy/',
      descripcion: 'Homilía dominical con comentario bíblico'
    },
    {
      nombre: 'Evangeli.net',
      url: 'https://evangeli.net/evangelio',
      descripcion: 'Evangelio del día con homilía y podcast'
    },
    {
      nombre: 'Vatican News',
      url: 'https://www.vaticannews.va/es/evangelio-de-hoy.html',
      descripcion: 'Evangelio y reflexión oficial del Vaticano'
    },
    {
      nombre: 'ACI Prensa',
      url: 'https://www.aciprensa.com/liturgia',
      descripcion: 'Lecturas y recursos litúrgicos'
    },
    {
      nombre: 'La Verdad Católica',
      url: 'https://laverdadcatolica.org',
      descripcion: 'Misal y recursos litúrgicos en español'
    }
  ];

  // Generar homilía con GPT-4o + referencias a fuentes reales
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      temperature: 0.4,
      messages: [{
        role: 'system',
        content: `Eres un sacerdote experto en homilética. Hoy es ${fechaStr}, IV Domingo de Cuaresma 2026, Ciclo A.
El Evangelio de hoy es Juan 9, 1-41 (el ciego de nacimiento).
Escribe homilías pastorales, profundas y aplicadas a la vida cotidiana.`
      }, {
        role: 'user',
        content: `Escribe una homilía completa para HOY ${fechaStr} (IV Domingo de Cuaresma, Ciclo A).

Estructura:
1. **Introducción** — gancho que conecte con la vida real (2 párrafos)
2. **Contexto bíblico** — explica el Evangelio [Jn 9,1-41] con profundidad (2 párrafos)
3. **Mensaje central** — la enseñanza teológica principal (2 párrafos)
4. **Aplicación práctica** — ¿cómo vivir esto hoy? (2 párrafos)
5. **Oración final** — una oración breve para cerrar

Tono: pastoral, cálido, como sacerdote hablando a su comunidad.
Incluye citas del Catecismo con formato [CIC XXXX] cuando sea relevante.`
      }]
    });

    const homilia = completion.choices[0].message.content;
    res.json({
      ok: true,
      fecha: fechaStr,
      homilia,
      fuentes
    });
  } catch(e) {
    res.json({ ok: false, error: e.message, fuentes });
  }
});

// ── Health ──
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '10.0' }));


// ════════════════════════════════════════════════════
// BLOG SEO — PROGRAMMATIC SEO
// 115 páginas indexables, NO accesibles desde la app
// Solo Google las encuentra → rankea por cada tema
// ════════════════════════════════════════════════════
const SEO_TOPICS = require('./seo-topics');

// Cache de artículos generados (en memoria, se regenera si el servidor reinicia)
const blogCache = {};

// ── Función para generar artículo con GPT-4o ──
async function generateBlogArticle(topic) {
  if (blogCache[topic.slug]) return blogCache[topic.slug];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: `Eres un teólogo católico experto que escribe artículos de alta calidad para el sitio CatolicosGPT.
Escribes en español claro, pastoral y bien fundamentado en el Magisterio.
Siempre citas el Catecismo con el formato [CIC XXX] y la Biblia con [Libro cap,vers].
Los artículos deben tener entre 800-1200 palabras, ser informativos y útiles para el lector.`
      }, {
        role: 'user',
        content: `Escribe un artículo SEO completo sobre: "${topic.title}"

El artículo debe incluir:

## Introducción (2 párrafos)
[Gancho que conecte con la vida del lector]

## [Sección principal relacionada con el tema]
[Contenido teológico sólido con citas del Catecismo y la Biblia]

## [Segunda sección de profundización]
[Más contenido, ejemplos prácticos]

## Aplicación a la Vida Cristiana
[Cómo vivir esto en la vida diaria]

## Preguntas Frecuentes sobre ${topic.title.split('—')[0].trim()}
- P: [Pregunta común]
  R: [Respuesta concisa]
- P: [Otra pregunta]
  R: [Respuesta]

## Conclusión
[Cierre esperanzador con llamada a la oración]

Incluye al menos 3 citas del Catecismo [CIC XXX] y 2 citas bíblicas [Libro cap,vers].
Palabras clave a incluir naturalmente: ${topic.keywords.join(', ')}`
      }]
    });

    const content = completion.choices[0].message.content;
    const article = {
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      keywords: topic.keywords,
      category: topic.category,
      content,
      generatedAt: new Date().toISOString(),
      wordCount: content.split(' ').length
    };
    blogCache[topic.slug] = article;
    return article;
  } catch(e) {
    console.error('[Blog] Error generando artículo:', topic.slug, e.message);
    return null;
  }
}

// ── HTML del artículo del blog ──
function renderBlogHTML(topic, articleContent) {
  const contentHTML = articleContent
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/### (.+)/g, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[CIC (\d+)\]/g, '<a href="https://catolicosgpt.com/?cic=$1" class="cic-link" target="_blank">CIC $1 ↗</a>')
    .replace(/\[([A-Za-záéíóúñ]+ [\d,\.\-]+)\]/g, '<a href="https://catolicosgpt.com/?biblia=$1" class="bible-link" target="_blank">$1 ↗</a>')
    .replace(/^- P: (.+)/gm, '<dt class="faq-q">$1</dt>')
    .replace(/^  R: (.+)/gm, '<dd class="faq-a">$1</dd>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');

  const relatedTopics = SEO_TOPICS
    .filter(t => t.category === topic.category && t.slug !== topic.slug)
    .slice(0, 4);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${topic.title} | CatolicosGPT</title>
  <meta name="description" content="${topic.description}">
  <meta name="keywords" content="${topic.keywords.join(', ')}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://catolicosgpt.com/blog/${topic.slug}">

  <meta property="og:title" content="${topic.title}">
  <meta property="og:description" content="${topic.description}">
  <meta property="og:url" content="https://catolicosgpt.com/blog/${topic.slug}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="CatolicosGPT">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${topic.title}",
    "description": "${topic.description}",
    "keywords": "${topic.keywords.join(', ')}",
    "url": "https://catolicosgpt.com/blog/${topic.slug}",
    "publisher": {
      "@type": "Organization",
      "name": "CatolicosGPT",
      "url": "https://catolicosgpt.com"
    },
    "inLanguage": "es",
    "about": {
      "@type": "Thing",
      "name": "Doctrina Católica"
    }
  }
  </script>

  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-H8CB7M80S3"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-H8CB7M80S3');
  </script>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Georgia', serif; color: #18100A; background: #FAF7F0; line-height: 1.8; }
    .container { max-width: 760px; margin: 0 auto; padding: 20px 16px 60px; }
    .site-header { background: #5C3D1E; padding: 12px 16px; text-align: center; margin-bottom: 32px; }
    .site-header a { color: #F5E6D0; text-decoration: none; font-family: 'Georgia', serif; font-size: 18px; font-weight: bold; }
    .site-header a span { color: #C9923A; }
    .breadcrumb { font-size: 12px; color: #9B8A77; margin-bottom: 20px; font-family: Arial, sans-serif; }
    .breadcrumb a { color: #C9923A; text-decoration: none; }
    .category-badge { display: inline-block; background: rgba(201,146,58,.1); color: #7A5230;
      border: 1px solid rgba(201,146,58,.3); border-radius: 4px; padding: 2px 10px;
      font-size: 11px; font-family: Arial, sans-serif; font-weight: 600;
      text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
    h1 { font-size: clamp(22px, 4vw, 32px); color: #5C3D1E; line-height: 1.3; margin-bottom: 12px; }
    .meta { font-size: 13px; color: #9B8A77; font-family: Arial, sans-serif; margin-bottom: 24px; }
    .intro-box { background: rgba(201,146,58,.07); border-left: 3px solid #C9923A;
      border-radius: 6px; padding: 14px 18px; margin-bottom: 28px;
      font-style: italic; font-size: 15px; color: #5C3D1E; }
    .content h2 { font-size: 20px; color: #5C3D1E; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #E0D5C2; }
    .content h3 { font-size: 17px; color: #7A5230; margin: 24px 0 8px; }
    .content p { margin-bottom: 14px; font-size: 15.5px; }
    .content strong { color: #5C3D1E; }
    .cic-link { color: #8B1A1A; text-decoration: none; background: rgba(139,26,26,.07);
      border: 1px solid rgba(139,26,26,.2); border-radius: 4px; padding: 0 6px;
      font-size: 13px; font-family: Arial, sans-serif; font-weight: 600; }
    .bible-link { color: #1E6B3A; text-decoration: none; background: rgba(30,107,58,.07);
      border: 1px solid rgba(30,107,58,.2); border-radius: 4px; padding: 0 6px;
      font-size: 13px; font-family: Arial, sans-serif; font-weight: 600; }
    .faq-q { font-weight: bold; color: #5C3D1E; margin-top: 14px; }
    .faq-a { color: #4A3728; margin-left: 16px; margin-bottom: 8px; }
    .cta-box { background: #5C3D1E; color: #F5E6D0; border-radius: 10px;
      padding: 24px; margin: 40px 0; text-align: center; }
    .cta-box h3 { color: #C9923A; font-size: 20px; margin-bottom: 8px; }
    .cta-box p { color: #E8D5BE; font-size: 14px; margin-bottom: 16px; }
    .cta-btn { display: inline-block; background: #C9923A; color: #fff;
      text-decoration: none; padding: 12px 28px; border-radius: 8px;
      font-family: Arial, sans-serif; font-weight: 600; font-size: 14px; }
    .related { margin-top: 40px; }
    .related h3 { font-size: 18px; color: #5C3D1E; margin-bottom: 16px; border-bottom: 1px solid #E0D5C2; padding-bottom: 8px; }
    .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .related-card { background: #F3EDE0; border: 1px solid #E0D5C2; border-radius: 8px;
      padding: 14px; text-decoration: none; display: block; transition: all .1s; }
    .related-card:hover { background: #EDE5D4; border-color: #C9923A; }
    .related-card-title { font-size: 13px; font-weight: 600; color: #5C3D1E; line-height: 1.4; }
    footer { margin-top: 60px; padding: 20px 16px; background: #5C3D1E; text-align: center; }
    footer p { color: #C9A878; font-family: Arial, sans-serif; font-size: 12px; }
    footer a { color: #C9923A; text-decoration: none; }
    @media (max-width: 600px) { .related-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>

<header class="site-header">
  <a href="https://catolicosgpt.com">Católicos<span>GPT</span> — IA Católica #1 en Español</a>
</header>

<div class="container">
  <div class="breadcrumb">
    <a href="https://catolicosgpt.com">Inicio</a> › 
    <a href="https://catolicosgpt.com/blog">Blog Católico</a> › 
    ${topic.title.split('—')[0].trim()}
  </div>

  <div class="category-badge">${topic.category}</div>
  <h1>${topic.title}</h1>
  <div class="meta">Por CatolicosGPT · Basado en el Magisterio de la Iglesia Católica</div>

  <div class="intro-box">${topic.description}</div>

  <article class="content">
    <p>${contentHTML}</p>
  </article>

  <!-- CTA para ir a la app -->
  <div class="cta-box">
    <h3>¿Tienes más preguntas sobre la fe?</h3>
    <p>CatolicosGPT es el asistente de IA católica #1 en español. Pregunta lo que quieras sobre el Catecismo, la Biblia, los sacramentos o cualquier tema de fe.</p>
    <a href="https://catolicosgpt.com" class="cta-btn">Consultar con CatolicosGPT — Gratis 🙏</a>
  </div>

  <!-- Artículos relacionados -->
  ${relatedTopics.length > 0 ? `
  <div class="related">
    <h3>Artículos Relacionados</h3>
    <div class="related-grid">
      ${relatedTopics.map(t => `
        <a href="/blog/${t.slug}" class="related-card">
          <div class="related-card-title">${t.title}</div>
        </a>
      `).join('')}
    </div>
  </div>
  ` : ''}
</div>

<footer>
  <p>© 2026 <a href="https://catolicosgpt.com">CatolicosGPT</a> — IA Católica en Español · 
  <a href="https://catolicosgpt.com">Inicio</a> · 
  <a href="https://catolicosgpt.com/blog">Blog</a></p>
</footer>

</body>
</html>`;
}

// ── Ruta individual del blog: /blog/:slug ──
app.get('/blog/:slug', async (req, res) => {
  const { slug } = req.params;
  const topic = SEO_TOPICS.find(t => t.slug === slug);
  if (!topic) return res.status(404).send('Artículo no encontrado');

  try {
    const article = await generateBlogArticle(topic);
    if (!article) return res.status(500).send('Error generando artículo');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
    res.send(renderBlogHTML(topic, article.content));
  } catch(e) {
    res.status(500).send('Error interno');
  }
});

// ── Índice del blog: /blog ──
app.get('/blog', (req, res) => {
  const categories = [...new Set(SEO_TOPICS.map(t => t.category))];
  const categoriesHTML = categories.map(cat => {
    const topics = SEO_TOPICS.filter(t => t.category === cat);
    return `
      <div class="cat-section">
        <h2 class="cat-title">${cat.charAt(0).toUpperCase() + cat.slice(1)}</h2>
        <div class="topics-grid">
          ${topics.map(t => `
            <a href="/blog/${t.slug}" class="topic-card">
              <div class="topic-title">${t.title}</div>
              <div class="topic-desc">${t.description.slice(0, 80)}...</div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog Católico — CatolicosGPT | Doctrina, Fe y Espiritualidad</title>
  <meta name="description" content="Blog católico con artículos sobre doctrina, santos, novenas, oraciones, sacramentos y teología. Basado en el Magisterio de la Iglesia Católica.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://catolicosgpt.com/blog">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-H8CB7M80S3"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-H8CB7M80S3');</script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;background:#FAF7F0;color:#18100A}
    .header{background:#5C3D1E;padding:14px 16px;text-align:center}
    .header a{color:#F5E6D0;text-decoration:none;font-size:20px;font-weight:bold}
    .header a span{color:#C9923A}
    .hero{background:linear-gradient(135deg,#5C3D1E,#7A5230);color:#F5E6D0;padding:40px 16px;text-align:center}
    .hero h1{font-size:clamp(24px,4vw,36px);margin-bottom:10px}
    .hero p{color:#C9A878;font-size:15px;max-width:600px;margin:0 auto}
    .container{max-width:1000px;margin:0 auto;padding:32px 16px}
    .cat-title{font-size:20px;color:#5C3D1E;margin:32px 0 16px;padding-bottom:8px;border-bottom:2px solid #C9923A;text-transform:capitalize}
    .topics-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
    .topic-card{background:#fff;border:1px solid #E0D5C2;border-radius:8px;padding:16px;text-decoration:none;display:block;transition:all .15s}
    .topic-card:hover{border-color:#C9923A;background:#FFF8EE;transform:translateY(-1px)}
    .topic-title{font-size:14px;font-weight:600;color:#5C3D1E;line-height:1.4;margin-bottom:6px}
    .topic-desc{font-size:12px;color:#9B8A77;line-height:1.5}
    .cta{background:#5C3D1E;color:#F5E6D0;text-align:center;padding:40px 16px;margin-top:48px}
    .cta h2{color:#C9923A;margin-bottom:10px}
    .cta p{color:#C9A878;margin-bottom:20px;font-size:14px}
    .cta a{background:#C9923A;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif}
    footer{background:#3D2610;padding:16px;text-align:center}
    footer p{color:#9B8A77;font-size:12px;font-family:Arial,sans-serif}
    footer a{color:#C9923A;text-decoration:none}
    @media(max-width:600px){.topics-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<header class="header">
  <a href="https://catolicosgpt.com">Católicos<span>GPT</span></a>
</header>
<div class="hero">
  <h1>Blog Católico</h1>
  <p>Artículos sobre doctrina, fe, novenas, santos y teología — basados en el Magisterio de la Iglesia Católica</p>
</div>
<div class="container">
  ${categoriesHTML}
  <div class="cta">
    <h2>¿Tienes preguntas sobre la fe?</h2>
    <p>Usa CatolicosGPT, el asistente de IA católica #1 en español. Gratis, siempre disponible.</p>
    <a href="https://catolicosgpt.com">Consultar con IA →</a>
  </div>
</div>
<footer>
  <p>© 2026 <a href="https://catolicosgpt.com">CatolicosGPT</a> — IA Católica en Español</p>
</footer>
</body></html>`);
});


// ══════════════════════════════════════════════════════════════════
// NUEVOS ENDPOINTS — MAGNIFICA HUMANITAS & SANTO DEL DÍA
// ══════════════════════════════════════════════════════════════════

// ── Endpoint: Información de la encíclica Magnifica Humanitas ──
app.get('/api/enciclica-info', (req, res) => {
  res.json({
    ok: true,
    enciclica: ENCICLICA,
    resumen_breve: {
      titulo: ENCICLICA.titulo,
      fecha: ENCICLICA.fecha,
      papa: ENCICLICA.papa,
      tema: ENCICLICA.tema,
      url: ENCICLICA.url,
      importancia: "Primera encíclica social sobre Inteligencia Artificial en la historia de la Iglesia"
    }
  });
});

// ── Endpoint: Santo del día ──
app.get('/api/santo-del-dia', async (req, res) => {
  try {
    const now = new Date();
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaStr = `${now.getDate()} de ${MESES[now.getMonth()]}`;
    
    // Intentar scraping de ACI Prensa como fuente confiable
    try {
      const resp = await fetch('https://www.aciprensa.com/santos/santoral.php', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CatolicosGPT/1.0)',
          'Accept': 'text/html'
        },
        signal: AbortSignal.timeout(8000)
      });
      
      if (resp.ok) {
        const html = await resp.text();
        // Extraer el santo del día
        const match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const santoMatch = html.match(/Santo del día:?\s*([^<\n]+)/i);
        
        if (santoMatch || match) {
          const nombre = santoMatch ? santoMatch[1].trim() : (match ? match[1].trim() : 'Santo del día');
          
          // Extraer biografía resumida
          const bioMatch = html.match(/<div[^>]*class="santo-bio"[^>]*>([^]*?)<\/div>/i) ||
                          html.match(/<p[^>]*>([^<]{100,500})<\/p>/i);
          const bio = bioMatch ? bioMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 400) : '';
          
          return res.json({
            ok: true,
            fecha: fechaStr,
            santo: {
              nombre,
              bio_breve: bio || `Santo conmemorado el ${fechaStr}`,
              fuente: 'aciprensa.com',
              url: 'https://www.aciprensa.com/santos/'
            }
          });
        }
      }
    } catch(e) {
      console.error('[Santo] Error scraping ACI Prensa:', e.message);
    }
    
    // Fallback: Buscar en Magisterium o usar GPT
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: `¿Qué santo o santa se celebra hoy ${fechaStr} en el calendario litúrgico católico? Dame SOLO el nombre del santo y una biografía de 2-3 líneas (máximo 300 caracteres). Formato: Nombre: [nombre completo]\nBiografía: [texto breve]`
        }],
        max_tokens: 300,
        temperature: 0.3
      });
      
      const text = completion.choices[0].message.content.trim();
      const nombreMatch = text.match(/Nombre:\s*(.+)/i);
      const bioMatch = text.match(/Biografía:\s*(.+)/is);
      
      return res.json({
        ok: true,
        fecha: fechaStr,
        santo: {
          nombre: nombreMatch ? nombreMatch[1].trim() : 'Santo del día',
          bio_breve: bioMatch ? bioMatch[1].trim() : text,
          fuente: 'GPT-4o',
          url: 'https://www.vaticannews.va/es/santos.html'
        }
      });
      
    } catch(e2) {
      console.error('[Santo] Error GPT fallback:', e2.message);
      return res.json({
        ok: false,
        fecha: fechaStr,
        error: 'No se pudo obtener el santo del día',
        santo: {
          nombre: 'Consulta el santoral',
          bio_breve: 'Visita Vatican News para conocer el santo del día',
          fuente: 'Fallback',
          url: 'https://www.vaticannews.va/es/santos.html'
        }
      });
    }
    
  } catch(err) {
    console.error('[Santo] Error general:', err.message);
    res.status(500).json({ ok: false, error: 'Error del servidor' });
  }
});



// ════════════════════════════════════════════════════════════════
// NUEVOS ENDPOINTS v3 — MAGISTERIUM COMPLETO
// ════════════════════════════════════════════════════════════════

// ── Búsqueda directa en Magisterium (para el frontend) ──
app.post('/api/buscar', async (req, res) => {
  const { query, num_results = 10, modo = 'auto' } = req.body;
  if (!query) return res.status(400).json({ error: 'Query requerida' });
  try {
    const resultados = await buscarEnMagisterium(query, num_results, modo);
    res.json({ ok: true, resultados, modo, total: resultados.length });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Lecturas del día desde Magisterium (Holy Widgets) ──
app.get('/api/lecturas-magisterium', async (req, res) => {
  try {
    const resp = await fetch('https://api.magisterium.com/v1/widgets/daily-readings', {
      headers: {
        'Authorization': `Bearer ${process.env.MAGISTERIUM_API_KEY || 'sk_catoli_e251f77cac31729961706b5c17d5a517a38e00756facc8f85c7a542115021059'}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (resp.ok) {
      const data = await resp.json();
      return res.json({ ok: true, fuente: 'magisterium', data });
    }
    throw new Error(`HTTP ${resp.status}`);
  } catch(e) {
    console.error('[Lecturas Magisterium]', e.message);
    // Fallback a las lecturas scrapeadas
    try {
      const lecturas = await generarLecturasDia();
      res.json({ ok: true, fuente: 'scraping', data: lecturas });
    } catch(e2) {
      res.json({ ok: false, error: e2.message });
    }
  }
});

// ── Santo del día desde Magisterium (Holy Widgets) ──
app.get('/api/santo-magisterium', async (req, res) => {
  try {
    const resp = await fetch('https://api.magisterium.com/v1/widgets/saint-of-the-day', {
      headers: {
        'Authorization': `Bearer ${process.env.MAGISTERIUM_API_KEY || 'sk_catoli_e251f77cac31729961706b5c17d5a517a38e00756facc8f85c7a542115021059'}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (resp.ok) {
      const data = await resp.json();
      return res.json({ ok: true, fuente: 'magisterium', santo: data });
    }
    throw new Error(`HTTP ${resp.status}`);
  } catch(e) {
    console.error('[Santo Magisterium]', e.message);
    // Fallback al endpoint existente
    const now = new Date();
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    res.json({ ok: false, fuente: 'fallback', fecha: `${now.getDate()} de ${MESES[now.getMonth()]}` });
  }
});

// ── Oración del día desde Magisterium ──
app.get('/api/oracion-magisterium', async (req, res) => {
  try {
    const resp = await fetch('https://api.magisterium.com/v1/widgets/prayer-of-the-day', {
      headers: {
        'Authorization': `Bearer ${process.env.MAGISTERIUM_API_KEY || 'sk_catoli_e251f77cac31729961706b5c17d5a517a38e00756facc8f85c7a542115021059'}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (resp.ok) {
      const data = await resp.json();
      return res.json({ ok: true, fuente: 'magisterium', oracion: data });
    }
    throw new Error(`HTTP ${resp.status}`);
  } catch(e) {
    console.error('[Oración Magisterium]', e.message);
    res.json({ ok: false, fuente: 'fallback' });
  }
});

// ── Búsqueda en la biblioteca de fuentes ──
app.get('/api/biblioteca', async (req, res) => {
  const { q, tipo } = req.query;
  if (!q) return res.status(400).json({ error: 'Parámetro q requerido' });
  try {
    const resultados = await buscarEnMagisterium(q, 10, tipo || 'auto');
    res.json({ ok: true, query: q, resultados });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Modo Apologética: busca con modo magisterial ──
app.post('/api/apologetica', async (req, res) => {
  const { pregunta } = req.body;
  if (!pregunta) return res.status(400).json({ error: 'Pregunta requerida' });
  try {
    const [chatResp, searchResp] = await Promise.all([
      magisterium.chat.completions.create({
        model: 'magisterium-1', max_tokens: 1000, stream: false,
        messages: [{ role: 'user', content: `Necesito la respuesta oficial del Magisterio de la Iglesia Católica a esta pregunta apologética: ${pregunta}` }],
        mode: 'magisterial'
      }).then(r => r.choices[0]?.message?.content || '').catch(() => ''),
      buscarEnMagisterium(pregunta, 5, 'magisterial')
    ]);
    res.json({ ok: true, respuesta: chatResp, fuentes: searchResp, modo: 'magisterial' });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Modo Scholarly: para preguntas teológicas y académicas ──
app.post('/api/scholarly', async (req, res) => {
  const { pregunta } = req.body;
  if (!pregunta) return res.status(400).json({ error: 'Pregunta requerida' });
  try {
    const [chatResp, searchResp] = await Promise.all([
      magisterium.chat.completions.create({
        model: 'magisterium-1', max_tokens: 1200, stream: false,
        messages: [{ role: 'user', content: pregunta }],
        mode: 'scholarly'
      }).then(r => r.choices[0]?.message?.content || '').catch(() => ''),
      buscarEnMagisterium(pregunta, 8, 'scholarly')
    ]);
    res.json({ ok: true, respuesta: chatResp, fuentes: searchResp, modo: 'scholarly' });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS v4
// ════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await auth.register(req.body);
    res.json(result);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await auth.login(req.body);
    res.json(result);
  } catch(e) { res.status(401).json({ error: e.message }); }
});

app.get('/api/auth/me', auth.authenticateToken, (req, res) => {
  const user = auth.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { passwordHash, ...safe } = user;
  res.json({ user: safe });
});

// ════════════════════════════════════════════════════════════════
// INFOGRAFÍAS ENDPOINTS v4
// ════════════════════════════════════════════════════════════════

// ── Verificar límite ──
app.get('/api/infografias/check-limit', auth.authenticateToken, (req, res) => {
  const check  = auth.checkInfografiaLimit(req.user.id);
  const config = auth.loadPlanConfig();
  const user   = auth.getUserById(req.user.id);
  const plan   = config.planes[user?.plan || 'free'] || config.planes.free;
  res.json({ ...check, planNombre: plan.nombre, periodo: plan.periodo, limite: plan.infografiasCount });
});

// ── Generar infografía ──
app.post('/api/infografias/generar', auth.authenticateToken, async (req, res) => {
  const { tema, formato = '9:16', tipo, estilo = 'clasico', customNombre: bodyCustomNombre, customLogo: bodyCustomLogo } = req.body;
  if (!tema) return res.status(400).json({ error: 'Tema requerido' });

  // Verificar límite
  const check = auth.checkInfografiaLimit(req.user.id);
  if (!check.allowed) return res.status(429).json({ error: check.reason, upgrade: true });

  // Datos del usuario para branding
  const userFull    = auth.getUserById(req.user.id);
  const userPlan    = userFull?.plan || 'free';
  const customNombre= userFull?.customNombre || null;
  const customLogo  = userFull?.customLogo   || null;

  try {
    const infografia = await generarInfografia({
      tema, formato, tipo, estilo,
      userId: req.user.id,
      userPlan,
      customNombre: bodyCustomNombre || customNombre,
      customLogo: bodyCustomLogo || customLogo, openai
    });
    auth.consumeInfografiaCredit(req.user.id);
    res.json({ ok: true, slug: infografia.slug, infografia });
  } catch(e) {
    console.error('[Generar Infografia]', e.message);
    res.status(500).json({ error: 'Error al generar: ' + e.message });
  }
});

// ── Listar infografías ──
app.get('/api/infografias', (req, res) => {
  const { categoria, page = 1, limit = 20, q } = req.query;
  const result = getInfografias({ categoria, page: parseInt(page), limit: parseInt(limit), q });
  res.json(result);
});

// ── Infografía por slug ──
app.get('/api/infografias/:slug', (req, res) => {
  const inf = getInfografiaBySlug(req.params.slug);
  if (!inf) return res.status(404).json({ error: 'Infografía no encontrada' });
  res.json(inf);
});

// ── Repositorio público ──
app.get('/infografias', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'infografias.html'));
});

// ── Página individual de infografía (SEO) ──
app.get('/infografias/:slug', async (req, res) => {
  const inf = getInfografiaBySlug(req.params.slug);
  if (!inf) return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));

  const primerImg = inf.imagenes?.[0]?.url || '';
  const titulo = inf.titulo || inf.tema;
  const desc = inf.metaDescription || `Infografía católica sobre ${titulo} — CatolicosGPT`;
  const keywords = inf.keywords || `${titulo}, infografía católica, CatolicosGPT`;

  const slidesHtml = inf.imagenes.map((img, i) => `
    <div class="slide-item">
      <img src="${img.url}" alt="${inf.altText || titulo} — Slide ${i+1}" 
           loading="${i === 0 ? 'eager' : 'lazy'}" width="600">
      ${inf.totalSlides > 1 ? `<p class="slide-num">Slide ${i+1} de ${inf.totalSlides}</p>` : ''}
    </div>`).join('');

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "name": titulo + " — Infografía Católica",
    "description": desc,
    "contentUrl": primerImg,
    "thumbnailUrl": primerImg,
    "url": `https://catolicosgpt.com/infografias/${inf.slug}`,
    "datePublished": inf.fechaISO,
    "author": { "@type": "Organization", "name": "CatolicosGPT", "url": "https://catolicosgpt.com" },
    "keywords": keywords,
    "inLanguage": "es",
    "license": "https://creativecommons.org/licenses/by-nc/4.0/",
    "acquireLicensePage": "https://catolicosgpt.com/planes"
  });

  const breadcrumb = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://catolicosgpt.com" },
      { "@type": "ListItem", "position": 2, "name": "Infografías", "item": "https://catolicosgpt.com/infografias" },
      { "@type": "ListItem", "position": 3, "name": titulo }
    ]
  });

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} — Infografía Católica | CatolicosGPT</title>
<meta name="description" content="${desc}">
<meta name="keywords" content="${keywords}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="https://catolicosgpt.com/infografias/${inf.slug}">
<meta property="og:title" content="${titulo} — CatolicosGPT">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${primerImg}">
<meta property="og:image:width" content="1024">
<meta property="og:image:height" content="1792">
<meta property="og:type" content="article">
<meta property="og:url" content="https://catolicosgpt.com/infografias/${inf.slug}">
<meta property="og:site_name" content="CatolicosGPT">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo} — CatolicosGPT">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${primerImg}">
<script type="application/ld+json">${schema}</script>
<script type="application/ld+json">${breadcrumb}</script>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lora:ital,wght@0,400;1,400&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ocre:#C9923A;--brown:#5C3D1E;--brown2:#3A2210;--bg:#FAF7F0;--bg2:#F0E6D3;--border:rgba(201,146,58,0.2)}
body{background:var(--bg);color:var(--brown);font-family:'DM Sans',sans-serif}
.header{background:var(--brown2);padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
.header a{color:#F5EDD8;text-decoration:none;font-size:20px;font-family:'Playfair Display',serif;font-weight:700}
.header a span{color:var(--ocre)}
.header nav a{color:rgba(245,237,216,0.7);font-size:13px;margin-left:20px;text-decoration:none}
.breadcrumb{padding:12px 24px;font-size:12px;color:#8B6040;max-width:800px;margin:0 auto}
.breadcrumb a{color:var(--ocre);text-decoration:none}
.content{max-width:800px;margin:0 auto;padding:24px}
.badge{display:inline-block;padding:4px 12px;background:rgba(201,146,58,0.12);color:var(--ocre);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;border-radius:100px;margin-bottom:12px}
h1{font-family:'Playfair Display',serif;font-size:clamp(24px,4vw,36px);font-weight:700;color:var(--brown);margin-bottom:8px;line-height:1.2}
.meta{font-size:12px;color:#8B6040;margin-bottom:32px;font-family:'Lora',serif}
.slides{display:flex;flex-direction:column;gap:24px;margin-bottom:40px}
.slide-item{text-align:center}
.slide-item img{max-width:100%;height:auto;border-radius:12px;box-shadow:0 8px 32px rgba(92,61,30,0.2)}
.slide-num{font-size:12px;color:#8B6040;margin-top:8px;font-family:'Lora',serif;font-style:italic}
.actions{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.share-row{display:flex;gap:8px;align-items:center;margin-bottom:32px;flex-wrap:wrap;padding:12px;background:rgba(201,146,58,0.05);border:1px solid var(--border);border-radius:10px}
.share-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ocre);margin-right:4px}
.share-pill{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:12px;font-weight:600;color:var(--brown);background:#fff;border:1px solid var(--border);border-radius:99px;cursor:pointer;text-decoration:none;transition:.18s}
.share-pill:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.08)}
.share-pill.share-wa:hover{background:#25D366;color:#fff;border-color:#25D366}
.share-pill.share-x:hover{background:#000;color:#fff;border-color:#000}
.share-pill.share-fb:hover{background:#1877F2;color:#fff;border-color:#1877F2}
.share-pill.share-ig:hover{background:linear-gradient(45deg,#F58529,#DD2A7B,#8134AF);color:#fff;border-color:#DD2A7B}
.btn-download{flex:1;min-width:160px;padding:13px 24px;background:linear-gradient(135deg,var(--ocre),#A07028);color:var(--brown2);font-weight:700;font-size:14px;border:none;border-radius:10px;cursor:pointer;text-decoration:none;text-align:center}
.btn-share{padding:13px 24px;background:transparent;color:var(--brown);font-weight:600;font-size:14px;border:1px solid var(--border);border-radius:10px;cursor:pointer}
.cta-box{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;text-align:center;margin-bottom:40px}
.cta-box h3{font-family:'Playfair Display',serif;font-size:20px;color:var(--brown);margin-bottom:8px}
.cta-box p{font-family:'Lora',serif;font-size:14px;color:#8B6040;margin-bottom:16px;line-height:1.6}
.btn-cta{display:inline-block;padding:12px 24px;background:linear-gradient(135deg,var(--ocre),#A07028);color:var(--brown2);font-weight:700;font-size:14px;border:none;border-radius:10px;cursor:pointer;text-decoration:none}
.related h2{font-family:'Playfair Display',serif;font-size:20px;color:var(--brown);margin-bottom:16px}
.related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.related-item{border-radius:10px;overflow:hidden;border:1px solid var(--border);text-decoration:none;display:block;transition:transform .2s}
.related-item:hover{transform:translateY(-2px)}
.related-item img{width:100%;aspect-ratio:2/3;object-fit:cover;display:block;background:var(--bg2)}
.related-item .ri-title{padding:8px 10px;font-size:12px;font-weight:600;color:var(--brown);font-family:'Lora',serif}
.footer{background:var(--brown2);padding:24px;text-align:center;margin-top:60px}
.footer p{font-size:13px;color:rgba(245,237,216,0.5)}
.footer a{color:var(--ocre);text-decoration:none}
@media(max-width:600px){.actions{flex-direction:column}}
</style>
</head>
<body>
<header class="header">
  <a href="/">✝ Católicos<span>GPT</span></a>
  <nav>
    <a href="/">Chat IA</a>
    <a href="/infografias">Infografías</a>
    <a href="/planes">Planes</a>
  </nav>
</header>

<div class="breadcrumb">
  <a href="/">Inicio</a> › <a href="/infografias">Infografías</a> › ${titulo}
</div>

<div class="content">
  <div class="badge">${inf.categoria || inf.tipo}</div>
  <h1>${titulo}</h1>
  <div class="meta">📅 ${new Date(inf.fechaCreacion).toLocaleDateString('es-ES', {day:'numeric',month:'long',year:'numeric'})} · ${inf.totalSlides > 1 ? inf.totalSlides + ' slides' : '1 infografía'} · CatolicosGPT</div>

  <div class="slides">
    ${slidesHtml}
  </div>

  <div class="actions">
    <a href="${primerImg}" download="${inf.slug}.png" class="btn-download" target="_blank">⬇️ Descargar PNG</a>
  </div>

  <div class="share-row">
    <span class="share-lbl">Compartir:</span>
    <a href="https://wa.me/?text=${encodeURIComponent(titulo + ' · CatolicosGPT')}%20https://catolicosgpt.com/infografias/${inf.slug}" target="_blank" rel="noopener" class="share-pill share-wa" title="WhatsApp">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24z"/></svg> WhatsApp
    </a>
    <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(titulo + ' · CatolicosGPT')}&url=https://catolicosgpt.com/infografias/${inf.slug}" target="_blank" rel="noopener" class="share-pill share-x" title="X (Twitter)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> X
    </a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fcatolicosgpt.com%2Finfografias%2F${inf.slug}" target="_blank" rel="noopener" class="share-pill share-fb" title="Facebook">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> Facebook
    </a>
    <button class="share-pill share-ig" onclick="copyForIG()" title="Instagram">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> Instagram
    </button>
    <button class="share-pill" onclick="copyLink()" title="Copiar enlace">🔗 Copiar link</button>
  </div>

  <div class="cta-box">
    <h3>🎨 Genera tu propia infografía con IA</h3>
    <p>Escribe cualquier tema católico — santo, devoción, doctrina — y CatolicosGPT crea la infografía automáticamente.</p>
    <a href="/infografias" class="btn-cta">Generar infografía gratis</a>
  </div>

  <div class="related" id="related"></div>
</div>

<footer class="footer">
  <p>© 2026 <a href="/">CatolicosGPT</a> · <a href="/infografias">Infografías</a> · <a href="/planes">Planes</a></p>
</footer>

<script>
function shareThis() {
  if (navigator.share) navigator.share({ title: '${titulo} — CatolicosGPT', url: window.location.href });
  else copyLink();
}
function copyLink() {
  navigator.clipboard.writeText(window.location.href);
  alert('🔗 Link copiado: ' + window.location.href);
}
function copyForIG() {
  navigator.clipboard.writeText(window.location.href);
  alert('📋 Link copiado.\n\nAbre Instagram, crea una story o post, y pega el link.');
  if(/Android|iPhone|iPad/i.test(navigator.userAgent)) setTimeout(()=>{window.location.href='instagram://library'},800);
}

// Load related
fetch('/api/infografias?limit=4')
  .then(r => r.json())
  .then(d => {
    const items = d.items?.filter(i => i.slug !== '${inf.slug}').slice(0,4) || [];
    if (!items.length) return;
    const rel = document.getElementById('related');
    rel.innerHTML = '<h2>Más infografías</h2><div class="related-grid">' +
      items.map(i => '<a class="related-item" href="/infografias/' + i.slug + '">' +
        (i.imagenes?.[0]?.url ? '<img src="' + i.imagenes[0].url + '" alt="' + (i.titulo||'').replace(/"/g,'') + '" loading="lazy">' : '<div style="background:var(--bg2);aspect-ratio:2/3"></div>') +
        '<div class="ri-title">' + (i.titulo||i.tema||'').slice(0,50) + '</div></a>').join('') + '</div>';
  });
</script>
</body>
</html>`);
});

// ════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS v4
// ════════════════════════════════════════════════════════════════

app.get('/api/admin/users', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  const data = auth.loadUsers();
  const users = data.users.map(u => { const {passwordHash:_, ...s} = u; return s; });
  res.json({ users, total: users.length });
});

app.put('/api/admin/users/:id/plan', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  try {
    const user = auth.upgradePlan(req.params.id, req.body.plan);
    const {passwordHash:_, ...s} = user;
    res.json({ ok: true, user: s });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/toggle', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  const user = auth.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  const updated = auth.updateUser(req.params.id, { activo: !user.activo });
  const {passwordHash:_, ...s} = updated;
  res.json({ ok: true, user: s });
});

app.post('/api/admin/coupons', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  try {
    const coupon = auth.createCoupon(req.body);
    res.json({ ok: true, coupon });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/admin/coupons', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  const { coupons } = require('./auth-module').validateCoupon ? { coupons: [] } : { coupons: [] };
  const fs = require('fs');
  try {
    const data = JSON.parse(fs.readFileSync('./data/coupons.json', 'utf-8'));
    res.json({ coupons: data.coupons || [] });
  } catch(e) { res.json({ coupons: [] }); }
});

app.post('/api/admin/infografias/generar', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  const { tema, formato = '9:16', customNombre, customLogo } = req.body;
  if (!tema) return res.status(400).json({ error: 'Tema requerido' });
  try {
    const inf = await generarInfografia({
      tema, formato, userId: 'admin',
      userPlan: 'admin', customNombre, customLogo, openai
    });
    res.json({ ok: true, infografia: inf });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Admin: configurar límites de planes ──
app.get('/api/admin/plan-config', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  res.json({ ok: true, config: auth.loadPlanConfig() });
});

app.put('/api/admin/plan-config', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  try {
    const config = auth.loadPlanConfig();
    const { plan, infografiasCount, periodo, precio } = req.body;
    if (!config.planes[plan]) return res.status(400).json({ error: 'Plan inválido' });
    if (infografiasCount !== undefined) config.planes[plan].infografiasCount = parseInt(infografiasCount);
    if (periodo !== undefined)          config.planes[plan].periodo = periodo;
    if (precio !== undefined)           config.planes[plan].precio = parseFloat(precio);
    config.planes[plan].descripcion = infografiasCount === -1 ? 'Ilimitadas'
      : `${infografiasCount} infografía(s) por ${periodo === 'daily' ? 'día' : periodo === 'weekly' ? 'semana' : 'mes'}`;
    auth.savePlanConfig(config);
    res.json({ ok: true, config });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: actualizar perfil de usuario (plan, branding) ──
app.put('/api/admin/users/:id/update', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  try {
    const allowed = ['plan','activo','customNombre','customLogo','nota'];
    const updates = {};
    for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
    if (updates.plan) auth.upgradePlan(req.params.id, updates.plan);
    else if (Object.keys(updates).length) auth.updateUser(req.params.id, updates);
    const user = auth.getUserById(req.params.id);
    const { passwordHash: _, ...safe } = user;
    res.json({ ok: true, user: safe });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Usuario: actualizar su propio perfil de branding (premium) ──
app.put('/api/auth/profile', auth.authenticateToken, (req, res) => {
  try {
    const user = auth.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Solo premium y admin pueden personalizar branding
    if (user.plan === 'free' && (req.body.customNombre || req.body.customLogo)) {
      return res.status(403).json({ error: 'El branding personalizado requiere el plan Premium', upgrade: true });
    }
    const updates = {};
    if (req.body.customNombre !== undefined) updates.customNombre = req.body.customNombre;
    if (req.body.customLogo !== undefined)   updates.customLogo   = req.body.customLogo;
    auth.updateUser(req.user.id, updates);
    const updated = auth.getUserById(req.user.id);
    const { passwordHash: _, ...safe } = updated;
    res.json({ ok: true, user: safe });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── /api/auth/me — incluir plan config ──
app.delete('/api/admin/infografias/:id', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  deleteInfografia(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/stats', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  const { users } = auth.loadUsers();
  const { infografias } = require('./infografias-module').loadCatalog();
  res.json({
    totalUsers: users.length,
    freeUsers: users.filter(u => u.plan === 'free').length,
    premiumUsers: users.filter(u => u.plan === 'premium').length,
    totalInfografias: infografias.length,
    hoy: infografias.filter(i => i.fechaISO === new Date().toISOString().slice(0,10)).length
  });
});

// ── Página Planes ──
app.get('/planes', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Planes y Precios · CatolicosGPT</title>
<meta name="description" content="El Chat IA con Magisterium es siempre gratis. Plan Premium $4.99/mes: infografías ilimitadas con branding propio. Para parroquias, ministerios y catequistas.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://catolicosgpt.com/planes">
<meta property="og:title" content="Planes · CatolicosGPT">
<meta property="og:description" content="Chat IA católico gratis. Premium $4.99/mes para infografías ilimitadas.">
<meta name="theme-color" content="#F6F0E3">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
<style>
.planes-shell { max-width: 1000px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 32px); }
.planes-hero { text-align: center; padding: 60px 20px 40px; }
.planes-hero h1 { font-family: var(--font-display); font-weight: 700; font-size: clamp(36px, 6vw, 56px); color: var(--espresso); line-height: 1.05; margin-bottom: 12px; }
.planes-hero h1 .it { font-style: italic; color: transparent; background: var(--grad-gold); -webkit-background-clip: text; background-clip: text; }
.planes-hero p { font-family: var(--font-display); font-size: clamp(15px, 2.2vw, 18px); color: var(--ink-2); max-width: 540px; margin: 0 auto; line-height: 1.5; }

.planes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px; max-width: 820px; margin: 0 auto; padding-bottom: 60px; }

.plan-card { background: var(--cream-2); border: 1.5px solid var(--hairline-2); border-radius: var(--r-xl); padding: 32px 26px; position: relative; transition: .2s var(--ease); }
.plan-card.featured { border-color: var(--gold); box-shadow: 0 10px 40px rgba(188,138,54,.18), 0 2px 10px rgba(94,27,34,.06); }
.plan-card.featured::before { content: '⭐ MÁS POPULAR'; position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: var(--grad-gold); color: #3a2a0c; font-family: var(--font-ui); font-weight: 700; font-size: 11px; letter-spacing: .14em; padding: 5px 16px; border-radius: 99px; box-shadow: var(--shadow-sm); white-space: nowrap; }

.plan-name { font-family: var(--font-display); font-size: 26px; font-weight: 700; color: var(--espresso); margin-bottom: 4px; }
.plan-price { display: flex; align-items: baseline; gap: 4px; margin: 14px 0 4px; }
.plan-price .price { font-family: var(--font-display); font-size: 44px; font-weight: 700; color: var(--gold-deep); line-height: 1; }
.plan-price .period { font-size: 14px; color: var(--ink-3); }
.plan-desc { font-family: var(--font-display); font-style: italic; font-size: 14.5px; color: var(--ink-2); margin-bottom: 22px; }

.plan-features { list-style: none; margin-bottom: 24px; }
.plan-features li { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--hairline); font-size: 14px; color: var(--ink); line-height: 1.45; }
.plan-features li:last-child { border: none; }
.plan-features li .ico { color: #2D8A5E; font-weight: 700; flex-shrink: 0; }
.plan-features li.disabled { color: var(--ink-3); }
.plan-features li.disabled .ico { color: var(--ink-3); }
.plan-features li.highlight { font-weight: 600; color: var(--espresso); }

.plan-cta-btn { width: 100%; padding: 14px; background: transparent; color: var(--espresso); border: 1.5px solid var(--hairline-2); border-radius: var(--r-md); font-family: var(--font-ui); font-weight: 600; font-size: 14.5px; cursor: pointer; transition: .18s; text-decoration: none; display: block; text-align: center; }
.plan-cta-btn:hover { border-color: var(--gold); background: var(--cream-3); }

.paypal-wrap { margin-top: 10px; min-height: 50px; }
.paypal-loading { text-align: center; font-size: 12px; color: var(--ink-3); padding: 14px; }

.note-bar { max-width: 720px; margin: 0 auto 40px; padding: 18px 22px; background: var(--cream-3); border: 1px solid var(--hairline); border-left: 3px solid var(--gold); border-radius: var(--r-md); font-family: var(--font-display); font-style: italic; font-size: 14.5px; color: var(--ink-2); text-align: center; line-height: 1.55; }

@media (max-width: 768px) {
  .nav { padding: 8px 12px; height: 56px; }
  .nav-left { gap: 8px; }
  .brand-mark { width: 28px; height: 28px; }
  .brand-word { font-size: 15px; white-space: nowrap; }
  .nav-link { padding: 5px 8px; font-size: 12px; }
  .nav-link:not(.active) { display: none; }
  .nav-user { padding: 3px 9px 3px 3px; font-size: 12px; }
  .nav-user .av { width: 20px; height: 20px; font-size: 10px; }
  .planes-hero { padding: 36px 16px 28px; }
  .plan-card { padding: 26px 22px; }
}
</style>
</head>
<body>

<!-- NAV -->
<header class="nav">
  <a href="/" class="brand" style="text-decoration:none">
    <div class="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold-deep)" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 5v13M8 9h8"/></svg></div>
    <span class="brand-word">Católicos<span class="gpt">GPT</span></span>
  </a>
  <nav class="nav-links">
    <a class="nav-link" href="/" style="text-decoration:none">Chat IA</a>
    <a class="nav-link" href="/infografias" style="text-decoration:none">Infografías</a>
    <a class="nav-link active" href="/planes" style="text-decoration:none">Planes</a>
    <a class="nav-user" href="/" style="text-decoration:none"><span class="av">D</span><span>Mi cuenta</span></a>
  </nav>
</header>

<div class="planes-shell">

  <section class="planes-hero">
    <h1>Simple y <span class="it">transparente</span></h1>
    <p>El Chat IA con Magisterium es siempre gratis. Las infografías tienen plan freemium para parroquias y catequistas.</p>
  </section>

  <div class="planes-grid">

    <!-- PLAN GRATIS -->
    <div class="plan-card">
      <div class="plan-name">Gratis</div>
      <div class="plan-price"><span class="price">$0</span><span class="period">/ siempre</span></div>
      <div class="plan-desc">Para empezar a explorar</div>
      <ul class="plan-features">
        <li><span class="ico">✓</span> Chat IA ilimitado</li>
        <li><span class="ico">✓</span> Consultas al Magisterio</li>
        <li><span class="ico">✓</span> Lecturas, santo y oración del día</li>
        <li><span class="ico">✓</span> 2 infografías por semana</li>
        <li><span class="ico">✓</span> Ver galería completa</li>
        <li><span class="ico">✓</span> Descargar infografías existentes</li>
        <li class="disabled"><span class="ico">○</span> Series de 4 slides (carruseles)</li>
        <li class="disabled"><span class="ico">○</span> Branding propio</li>
      </ul>
      <a class="plan-cta-btn" href="/">Usar gratis</a>
    </div>

    <!-- PLAN PREMIUM -->
    <div class="plan-card featured">
      <div class="plan-name">Premium</div>
      <div class="plan-price"><span class="price">$4.99</span><span class="period">/ mes</span></div>
      <div class="plan-desc">Para evangelizadores y catequistas</div>
      <ul class="plan-features">
        <li><span class="ico">✓</span> Chat IA ilimitado</li>
        <li><span class="ico">✓</span> Consultas al Magisterio</li>
        <li class="highlight"><span class="ico">✓</span> <strong>Infografías ilimitadas</strong></li>
        <li><span class="ico">✓</span> Series de 4 slides (carruseles)</li>
        <li><span class="ico">✓</span> Formatos 9:16, 1:1 y 16:9</li>
        <li><span class="ico">✓</span> 3 estilos de diseño</li>
        <li class="highlight"><span class="ico">✓</span> <strong>Branding propio</strong> (parroquia/ministerio)</li>
        <li><span class="ico">✓</span> Descarga en alta calidad</li>
        <li><span class="ico">✓</span> Soporte prioritario</li>
      </ul>
      <div id="paypal-button-container-P-66Y50051RX0957311NIOWYFY" class="paypal-wrap">
        <div class="paypal-loading">⏳ Cargando opciones de pago…</div>
      </div>
    </div>

  </div>

  <div class="note-bar">
    ✨ El Chat IA con Magisterium, apologética y modos doctrinales es <strong>siempre gratuito sin límites</strong>.
  </div>

</div>

<footer style="background:var(--cream-3);padding:30px 20px;text-align:center;border-top:1px solid var(--hairline);color:var(--ink-3);font-size:13px">
  © 2026 <a href="/" style="color:var(--gold-deep);text-decoration:none;font-weight:600">CatolicosGPT</a> · <a href="/infografias" style="color:var(--gold-deep);text-decoration:none">Infografías</a> · Fe · Conocimiento · Acción
</footer>

<!-- PayPal SDK -->
<script src="https://www.paypal.com/sdk/js?client-id=AQYVUOfQ6kUlu7y1IXRq2ffqWuS9HtMJx2WPhdnXJT2P3DUlfGF-VWAb77xuHU9DMu2nJZJE9z3pXMGC&vault=true&intent=subscription" data-sdk-integration-source="button-factory"></script>
<script>
  let _ppRetries = 0;
  function initPayPalButton() {
    if (typeof paypal === 'undefined') {
      if (++_ppRetries > 50) {
        const c = document.getElementById('paypal-button-container-P-66Y50051RX0957311NIOWYFY');
        if (c) c.innerHTML = '<div style="text-align:center;padding:14px;color:var(--maroon);font-size:13px">⚠️ No se pudo cargar PayPal. Desactiva tu adblocker e intenta de nuevo, o <a href="mailto:gptcatolicos@gmail.com" style="color:var(--gold-deep)">contáctanos</a>.</div>';
        return;
      }
      setTimeout(initPayPalButton, 200);
      return;
    }
    const container = document.getElementById('paypal-button-container-P-66Y50051RX0957311NIOWYFY');
    if (container) container.innerHTML = '';
    paypal.Buttons({
      style: { shape: 'rect', color: 'gold', layout: 'vertical', label: 'subscribe', height: 45 },
      createSubscription: function(data, actions) {
        return actions.subscription.create({ plan_id: 'P-66Y50051RX0957311NIOWYFY' });
      },
      onApprove: function(data, actions) {
        const token = localStorage.getItem('cgpt_token');
        if (token) {
          fetch('/api/paypal/subscription-approved', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ subscriptionID: data.subscriptionID })
          }).then(() => {
            alert('🎉 ¡Suscripción Premium activada!\\n\\nYa puedes generar infografías ilimitadas con branding propio.');
            window.location.href = '/infografias';
          });
        } else {
          alert('✅ Suscripción aprobada.\\nID: ' + data.subscriptionID + '\\n\\nInicia sesión para activar tu cuenta Premium.');
          window.location.href = '/?login=1';
        }
      },
      onError: function(err) {
        console.error('PayPal error', err);
        const c = document.getElementById('paypal-button-container-P-66Y50051RX0957311NIOWYFY');
        if (c) c.innerHTML = '<div style="text-align:center;padding:14px;color:var(--maroon);font-size:13px">⚠️ Error con PayPal. <a href="mailto:gptcatolicos@gmail.com" style="color:var(--gold-deep)">Contáctanos</a> para activar manualmente.</div>';
      }
    }).render('#paypal-button-container-P-66Y50051RX0957311NIOWYFY');
  }
  initPayPalButton();
</script>
</body>
</html>`);
});


// ── PayPal: activar plan premium post-suscripción ──
app.post('/api/paypal/subscription-approved', auth.authenticateToken, (req, res) => {
  try {
    const { subscriptionID } = req.body;
    if (!subscriptionID) return res.status(400).json({ error: 'subscriptionID requerido' });
    // Upgradear plan a premium
    auth.upgradePlan(req.user.id, 'premium');
    auth.updateUser(req.user.id, { paypalSubscriptionId: subscriptionID });
    console.log('[PayPal] Suscripción activada para usuario', req.user.id, 'subID:', subscriptionID);
    res.json({ ok: true, message: '¡Plan Premium activado!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ════════════════════════════════════════════════════════════════
// V5 — ADMIN ENDPOINTS
// ════════════════════════════════════════════════════════════════

// Ruta del panel admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── SEO con IA: generar descripción o keywords desde el título ──
app.post('/api/admin/seo-generate', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  const { titulo, field } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título requerido' });
  if (!['descripcion', 'keywords'].includes(field)) return res.status(400).json({ error: 'field debe ser descripcion o keywords' });

  const prompt = field === 'descripcion'
    ? `Genera UNA descripción meta para Google SEO en español, sobre "${titulo}" para una página de infografía católica. EXACTAMENTE 150-160 caracteres, atractiva, con keywords católicas. Responde SOLO la descripción, sin comillas ni explicación.`
    : `Genera 8-10 keywords SEO en español, separadas por comas, sobre "${titulo}" para una página de infografía católica. Incluye términos católicos relevantes y de búsqueda. Responde SOLO las keywords separadas por comas, sin punto final, sin explicación.`;

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      max_tokens: 200,
      messages: [
        { role: 'system', content: 'Eres un experto en SEO católico que escribe en español de forma clara y precisa.' },
        { role: 'user', content: prompt }
      ]
    });
    const result = r.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    res.json({ ok: true, result, field });
  } catch (e) {
    res.status(500).json({ error: 'Error de IA: ' + e.message });
  }
});

// ── Admin: subir infografía manual (imagen + meta + SEO) ──
app.post('/api/admin/infografias/upload', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  // Acepta `images` (array para carruseles) o `imageData` (single, legacy)
  const { images, imageData, titulo, slug, descripcion, keywords, categoria, tipo, esCarrusel } = req.body;
  const imgArray = Array.isArray(images) && images.length ? images : (imageData ? [imageData] : []);

  if (!imgArray.length || !titulo) return res.status(400).json({ error: 'Imágenes y título requeridos' });

  try {
    const safeSlug = (slug || titulo).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const cloudinary = require('cloudinary').v2;
    const fs = require('fs');
    const imgDir = path.join(__dirname, 'public', 'infografias');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    console.log(`[Admin Upload] Iniciando: ${imgArray.length} imagen(es) | slug=${safeSlug} | titulo="${titulo}"`);

    // Subir cada imagen (carrusel) — en serie para evitar rate limits y errores
    const imagenes = [];
    const errors = [];
    for (let i = 0; i < imgArray.length; i++) {
      const dataUrl = imgArray[i];
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
        const err = `Slide ${i+1}: data URL inválido`;
        console.error('[Admin Upload]', err);
        errors.push(err);
        continue;
      }
      const ext = (dataUrl.match(/^data:image\/(\w+);/) || [,'png'])[1];
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      let imageUrl = null;
      const sizeKB = Math.round(base64.length * 0.75 / 1024);
      console.log(`[Admin Upload] Procesando slide ${i+1}/${imgArray.length} (${ext}, ${sizeKB}KB)`);

      // Try Cloudinary first — con metadata enriquecida (context) para reconstrucción
      if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
          const upload = await cloudinary.uploader.upload(dataUrl, {
            public_id: `catolicosgpt/infografias/admin-${safeSlug}-${i}-${Date.now()}`,
            overwrite: false,
            quality: 'auto:best',
            fetch_format: 'auto',
            tags: ['catolicosgpt', 'infografia', 'admin-upload', esCarrusel ? 'carrusel' : 'single', categoria || 'devocional'],
            // Metadata para poder reconstruir el catálogo si se pierde
            context: {
              slug: safeSlug,
              titulo: (titulo || '').slice(0, 200),
              descripcion: (descripcion || '').slice(0, 500),
              keywords: (keywords || '').slice(0, 300),
              categoria: categoria || 'devocional',
              tipo: tipo || 'santo',
              slide: String(i + 1),
              total_slides: String(imgArray.length),
              es_carrusel: String(imgArray.length > 1),
              fecha: new Date().toISOString().slice(0, 10)
            }
          });
          imageUrl = upload.secure_url;
          console.log(`[Admin Upload] ✅ Cloudinary OK slide ${i+1}/${imgArray.length}: ${imageUrl}`);
        } catch (e) {
          const errMsg = `Cloudinary slide ${i+1}: ${e.message}`;
          console.error('[Admin Upload] ❌', errMsg);
          errors.push(errMsg);
        }
      }

      // Fallback local (sobrevive deploys solo si hay Render Disk montado en /public/infografias)
      if (!imageUrl) {
        try {
          const imgFile = `${safeSlug}-${i}.${ext === 'jpeg' ? 'jpg' : ext}`;
          fs.writeFileSync(path.join(imgDir, imgFile), Buffer.from(base64, 'base64'));
          imageUrl = `/infografias/${imgFile}`;
          console.log(`[Admin Upload] 💾 Saved locally slide ${i+1}: ${imageUrl}`);
        } catch(e) {
          const errMsg = `Local save slide ${i+1}: ${e.message}`;
          console.error('[Admin Upload] ❌', errMsg);
          errors.push(errMsg);
          continue;
        }
      }

      imagenes.push({
        url: imageUrl,
        slide: i + 1,
        model: 'admin-upload',
        formato: '1:1',
        sizeLabel: '1024x1024',
        ext
      });
    }

    if (!imagenes.length) {
      return res.status(500).json({ error: 'No se pudo subir ninguna imagen. ' + errors.join(' | ') });
    }
    if (errors.length) {
      console.warn(`[Admin Upload] ⚠️ ${errors.length} errores, ${imagenes.length} OK de ${imgArray.length} totales`);
    }

    // Guardar en catálogo
    const { loadCatalog, saveCatalog } = require('./infografias-module');
    const catalog = loadCatalog();
    const id = `inf-${Date.now()}`;
    const now = new Date();
    const infografia = {
      id,
      slug: safeSlug,
      tema: titulo,
      titulo,
      descripcion: descripcion || '',
      keywords: keywords || '',
      categoria: categoria || 'devocional',
      tipo: tipo || 'santo',
      altText: titulo,
      fechaCreacion: now.toISOString(),
      fechaISO: now.toISOString().slice(0, 10),
      publicado: true,
      totalSlides: imagenes.length,
      esCarrusel: imagenes.length > 1,
      uploadedBy: 'admin',
      imagenes
    };
    catalog.infografias = catalog.infografias || [];
    catalog.infografias.unshift(infografia);
    catalog.total = catalog.infografias.length;
    saveCatalog(catalog);

    res.json({ ok: true, infografia, slides: imagenes.length });
  } catch (e) {
    console.error('[Admin Upload]', e);
    res.status(500).json({ error: e.message });
  }
});


// ── Sitemap.xml dinámico — incluye todas las infografías y blog posts ──
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = 'https://catolicosgpt.com';
  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = [
    { loc: '/',            changefreq: 'daily',   priority: '1.0', lastmod: today },
    { loc: '/infografias', changefreq: 'daily',   priority: '0.95',lastmod: today },
    { loc: '/planes',      changefreq: 'monthly', priority: '0.7', lastmod: today },
    { loc: '/blog',        changefreq: 'weekly',  priority: '0.85',lastmod: today },
    { loc: '/lecturas',    changefreq: 'daily',   priority: '0.9', lastmod: today },
    { loc: '/breviario',   changefreq: 'daily',   priority: '0.9', lastmod: today },
    { loc: '/homilia',     changefreq: 'daily',   priority: '0.85',lastmod: today },
  ];

  // Cargar infografías del catálogo
  let infografiasUrls = [];
  try {
    const { loadCatalog } = require('./infografias-module');
    const cat = loadCatalog();
    const items = (cat.infografias || []).filter(i => i.publicado !== false);
    infografiasUrls = items.map(i => ({
      loc: '/infografias/' + i.slug,
      lastmod: (i.fechaISO || today),
      changefreq: 'monthly',
      priority: '0.8',
      image: i.imagenes?.[0]?.url || null,
      imageTitle: i.titulo || i.tema,
      imageCaption: i.metaDescription || ''
    }));
  } catch(e) { console.error('[Sitemap] Error cargando infografías:', e.message); }

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    staticUrls.map(u =>
      '  <url><loc>' + baseUrl + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod><changefreq>' + u.changefreq + '</changefreq><priority>' + u.priority + '</priority></url>'
    ).join('\n') +
    '\n' +
    infografiasUrls.map(u => {
      let xml = '  <url><loc>' + baseUrl + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod><changefreq>' + u.changefreq + '</changefreq><priority>' + u.priority + '</priority>';
      if (u.image) {
        xml += '<image:image><image:loc>' + u.image + '</image:loc><image:title>' + (u.imageTitle || '').replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</image:title>';
        if (u.imageCaption) xml += '<image:caption>' + u.imageCaption.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</image:caption>';
        xml += '</image:image>';
      }
      xml += '</url>';
      return xml;
    }).join('\n') +
    '\n</urlset>'
  );
});


// ── ADMIN: Reconstruir catálogo desde Cloudinary (recovery después de deploy) ──
app.post('/api/admin/rebuild-catalog', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(500).json({ error: 'Cloudinary no configurado. Sin backup posible.' });
  }
  try {
    const cloudinary = require('cloudinary').v2;
    console.log('[Rebuild] Iniciando rebuild desde Cloudinary...');

    // Listar TODOS los recursos con tag 'catolicosgpt' (paginado)
    let resources = [];
    let nextCursor = null;
    do {
      const result = await cloudinary.api.resources_by_tag('catolicosgpt', {
        max_results: 500,
        context: true,
        tags: true,
        ...(nextCursor ? { next_cursor: nextCursor } : {})
      });
      resources = resources.concat(result.resources || []);
      nextCursor = result.next_cursor;
    } while (nextCursor);

    console.log(`[Rebuild] ${resources.length} recursos encontrados en Cloudinary`);

    // Agrupar por slug (cada slug es una infografía, puede tener múltiples slides)
    const bySlug = {};
    for (const r of resources) {
      const ctx = r.context?.custom || r.context || {};
      const slug = ctx.slug;
      if (!slug) continue; // Sin metadata = no recuperable

      if (!bySlug[slug]) {
        bySlug[slug] = {
          slug,
          titulo: ctx.titulo || slug,
          tema: ctx.titulo || slug,
          descripcion: ctx.descripcion || '',
          keywords: ctx.keywords || '',
          categoria: ctx.categoria || 'devocional',
          tipo: ctx.tipo || 'santo',
          fecha: ctx.fecha || r.created_at?.slice(0, 10),
          esCarrusel: ctx.es_carrusel === 'true',
          totalSlides: parseInt(ctx.total_slides) || 1,
          imagenes: []
        };
      }
      bySlug[slug].imagenes.push({
        url: r.secure_url,
        slide: parseInt(ctx.slide) || 1,
        model: 'admin-upload',
        formato: '1:1',
        sizeLabel: r.width + 'x' + r.height
      });
    }

    // Ordenar imágenes por slide dentro de cada grupo
    Object.values(bySlug).forEach(inf => {
      inf.imagenes.sort((a, b) => a.slide - b.slide);
      inf.totalSlides = inf.imagenes.length;
      inf.esCarrusel = inf.imagenes.length > 1;
    });

    // Construir el catálogo
    const { loadCatalog, saveCatalog } = require('./infografias-module');
    const existing = loadCatalog();
    const existingSlugs = new Set((existing.infografias || []).map(i => i.slug));

    const recovered = Object.values(bySlug).map(inf => ({
      id: 'inf-' + Date.now() + '-' + inf.slug,
      slug: inf.slug,
      tema: inf.tema,
      titulo: inf.titulo,
      descripcion: inf.descripcion,
      keywords: inf.keywords,
      categoria: inf.categoria,
      tipo: inf.tipo,
      altText: inf.titulo,
      fechaCreacion: (inf.fecha || new Date().toISOString().slice(0, 10)) + 'T00:00:00.000Z',
      fechaISO: inf.fecha || new Date().toISOString().slice(0, 10),
      publicado: true,
      totalSlides: inf.totalSlides,
      esCarrusel: inf.esCarrusel,
      uploadedBy: 'admin',
      imagenes: inf.imagenes
    }));

    // Mergear con el catálogo existente (no perder lo que ya hay)
    const merged = [...(existing.infografias || [])];
    let added = 0;
    for (const inf of recovered) {
      if (!existingSlugs.has(inf.slug)) {
        merged.unshift(inf);
        added++;
      }
    }

    // Ordenar por fecha descendente
    merged.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

    const newCatalog = {
      version: '5.0',
      total: merged.length,
      categorias: [...new Set(merged.map(i => i.categoria).filter(Boolean))],
      infografias: merged
    };
    saveCatalog(newCatalog);

    console.log(`[Rebuild] ✅ ${added} infografías nuevas recuperadas. Total: ${merged.length}`);
    res.json({
      ok: true,
      recovered: added,
      existing: existing.infografias?.length || 0,
      total: merged.length,
      resources_scanned: resources.length
    });
  } catch(e) {
    console.error('[Rebuild]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── ADMIN: Stats del catálogo ──
app.get('/api/admin/catalog-status', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  const { loadCatalog } = require('./infografias-module');
  const cat = loadCatalog();
  const persistPath = process.env.DATA_DIR || './data';
  res.json({
    ok: true,
    total: cat.total || 0,
    infografias: cat.infografias?.length || 0,
    dataDir: persistPath,
    cloudinaryConfigured: !!(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
    renderDiskMounted: !!process.env.DATA_DIR
  });
});


// ════════════════════════════════════════════════════════════════
// VIDEOS API
// ════════════════════════════════════════════════════════════════
app.get('/api/videos', (req, res) => {
  const { categoria, q, page = 1, limit = 12 } = req.query;
  const result = videosModule.getVideos({ categoria, q, page: parseInt(page), limit: parseInt(limit) });
  res.json({ ok: true, ...result });
});

app.post('/api/admin/videos/upload', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  const { youtubeUrl, contextHint } = req.body;
  if (!youtubeUrl) return res.status(400).json({ error: 'URL de YouTube requerida' });

  const videoId = videosModule.extractYouTubeId(youtubeUrl);
  if (!videoId) return res.status(400).json({ error: 'No se pudo extraer el ID de YouTube. Verifica la URL.' });

  try {
    // 1. Obtener metadata original de YouTube via oEmbed
    const ytMeta = await videosModule.getYouTubeMetadata(videoId);
    console.log('[Admin Video] YT oEmbed:', ytMeta.title);

    // 2. IA enrich con GPT-4o-mini
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ai = await videosModule.enrichVideoWithAI(ytMeta.title, contextHint, openai);

    // 3. Verificar slug único
    const existing = videosModule.loadVideos();
    let finalSlug = ai.slug;
    let n = 1;
    while ((existing.videos || []).some(v => v.slug === finalSlug)) {
      finalSlug = ai.slug + '-' + (++n);
    }

    // 4. Guardar
    const now = new Date();
    const video = {
      id: 'vid-' + Date.now(),
      slug: finalSlug,
      youtubeId: videoId,
      embedUrl: 'https://www.youtube.com/embed/' + videoId,
      watchUrl: 'https://www.youtube.com/watch?v=' + videoId,
      thumbnail: ytMeta.thumbnail_url || ('https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg'),
      thumbnailHQ: 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg',
      titulo: ai.titulo,
      tituloOriginal: ytMeta.title,
      autor: ytMeta.author_name || '',
      descripcion: ai.descripcion,
      keywords: ai.keywords,
      categoria: ai.categoria,
      altText: ai.altText,
      fechaCreacion: now.toISOString(),
      fechaISO: now.toISOString().slice(0, 10),
      publicado: true,
      uploadedBy: 'admin'
    };
    existing.videos = existing.videos || [];
    existing.videos.unshift(video);
    existing.total = existing.videos.length;
    videosModule.saveVideos(existing);

    res.json({ ok: true, video });
  } catch(e) {
    console.error('[Admin Video]', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/videos/:slug', auth.authenticateToken, auth.requireAdmin, (req, res) => {
  const ok = videosModule.deleteVideo(req.params.slug);
  res.json({ ok });
});

// ════════════════════════════════════════════════════════════════
// MISAS API — Búsqueda combinada (scraping + IA)
// ════════════════════════════════════════════════════════════════
app.post('/api/misas/buscar', async (req, res) => {
  const { query, ciudad, lat, lon } = req.body;
  let detectedCity = ciudad;

  // Si tenemos coords, hacer reverse geocoding
  if (lat && lon && !detectedCity) {
    const geo = await misasModule.reverseGeocode(lat, lon);
    if (geo) detectedCity = geo.ciudad;
  }

  const searchTerm = query || detectedCity || '';
  if (!searchTerm) return res.status(400).json({ error: 'query o ciudad requeridos' });

  try {
    // 1. Intentar scraping de horariosdemisa.com
    const scraped = await misasModule.scrapeHorariosDeMisa(detectedCity || searchTerm, 'colombia');

    // 2. SIEMPRE generar respuesta IA con GPT-4o (combinada)
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let contextoScraping = '';
    if (scraped && scraped.html_raw) {
      // Extraer texto plano del HTML scrapeado
      const text = scraped.html_raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4000);
      contextoScraping = '\n\n[DATOS DE horariosdemisa.com]\n' + text + '\n[/DATOS]\n';
    }

    const enrichedQuery = searchTerm + (detectedCity ? ' (en ' + detectedCity + ')' : '');
    const aiResponse = await misasModule.searchMisasWithAI(enrichedQuery + contextoScraping, detectedCity, openai);

    res.json({
      ok: true,
      ciudad: detectedCity,
      respuesta: aiResponse,
      fuentes: scraped ? ['horariosdemisa.com', 'GPT-4o'] : ['GPT-4o']
    });
  } catch(e) {
    console.error('[Misas]', e);
    res.status(500).json({ error: e.message });
  }
});

// Geolocation reverse helper (frontend lo llama después de obtener coords)
app.post('/api/misas/reverse-geocode', async (req, res) => {
  const { lat, lon } = req.body;
  if (!lat || !lon) return res.status(400).json({ error: 'lat y lon requeridos' });
  const geo = await misasModule.reverseGeocode(lat, lon);
  res.json({ ok: !!geo, ...geo });
});

// ════════════════════════════════════════════════════════════════
// RECURSOS RELACIONADOS — endpoint para que el frontend pida
// recursos relacionados a una conversación
// ════════════════════════════════════════════════════════════════
app.post('/api/recursos-relacionados', (req, res) => {
  const { question, answer } = req.body;
  const result = findRelatedResources(question, answer, { maxResults: 4 });
  res.json({ ok: true, ...result });
});

// ── Cron: Generar infografías diarias ──
async function generarInfografiasDelDia() {
  console.log('[Cron] Iniciando generación diaria de infografías...');
  try {
    // 1. Santo del día
    const ahora = new Date();
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaHoy = `${ahora.getDate()} de ${MESES[ahora.getMonth()]}`;

    const santoDia = await openai.chat.completions.create({
      model: 'gpt-4o', max_tokens: 200, temperature: 0.3,
      messages: [{ role: 'user', content: `¿Qué santo o santa se celebra el ${fechaHoy} en el calendario litúrgico? Solo el nombre.` }]
    }).then(r => r.choices[0].message.content.trim()).catch(() => 'Santo del día');

    await generarInfografia({ tema: santoDia, tipo: 'santo', formato: '9:16', userId: 'cron-diario', userPlan: 'admin', openai });
    console.log('[Cron] ✅ Infografía santo:', santoDia);

    // 2. Tema apologético aleatorio
    const temas = [
      'La Inmaculada Concepción — dogma y fundamento bíblico',
      'El Purgatorio — doctrina y Escritura',
      'El Primado de Pedro — base del papado',
      'La Tradición y la Sagrada Escritura',
      'La presencia real de Cristo en la Eucaristía',
      'María Corredentora — su papel en la salvación',
      'Los sacramentos como canales de gracia',
      'La Comunión de los Santos',
      'La indisolubilidad del matrimonio cristiano',
      'La fe y las obras — doctrina católica completa'
    ];
    const temaHoy = temas[ahora.getDate() % temas.length];

    await generarInfografia({ tema: temaHoy, tipo: 'serie', formato: '9:16', userId: 'cron-diario', userPlan: 'admin', openai });
    console.log('[Cron] ✅ Infografía apologética:', temaHoy);

  } catch(e) {
    console.error('[Cron] Error generación diaria:', e.message);
  }
}

// Programar cron a las 6am
scheduleDailyAt(6, 0, generarInfografiasDelDia);

// ── Catch-all — sirve index.html ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
// Init liturgia cache al boot (refresh si stale)
liturgiaCache.init().catch(e => console.error('[Liturgia] init:', e.message));

// Cron diario: refresh liturgia a las 4am Bogotá (09:00 UTC)
const cronLiturgia = require('node-cron');
try {
  cronLiturgia.schedule('0 9 * * *', () => {
    console.log('[Cron] 4am Bogotá — refresh liturgia');
    liturgiaCache.refreshLiturgia().catch(e => console.error('[Cron Liturgia]', e.message));
  }, { timezone: 'America/Bogota' });
  console.log('[Cron] Liturgia diaria programada para 4am Bogotá');
} catch(e) {
  console.warn('[Cron] node-cron no disponible:', e.message);
}

app.listen(PORT, () => console.log(`CatolicosGPT v10 · Puerto ${PORT}`));
