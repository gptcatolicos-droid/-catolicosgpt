const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

// Cron simple sin dependencias externas
function scheduleDailyAt(hour, minute, fn) {
  function msUntilNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }
  function loop() {
    setTimeout(() => { fn(); setInterval(fn, 24*60*60*1000); }, msUntilNext());
  }
  loop();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Magisterium API — OpenAI compatible
const magisterium = new OpenAI({
  apiKey: process.env.MAGISTERIUM_API_KEY,
  baseURL: 'https://api.magisterium.com/v1'
});

// ══════════════════════════════
// CARGAR TODOS LOS DATASETS
// ══════════════════════════════
function loadDataset(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, `data/${name}.json`), 'utf8'));
  } catch(e) { console.log(`Dataset ${name} no encontrado`); return {}; }
}
const CATECISMO = loadDataset('catecismo');
const BIBLIA = loadDataset('biblia');
const HISTORIA = loadDataset('historia_iglesia');
const SANTOS = loadDataset('santos');
const DOCUMENTOS = loadDataset('documentos_vaticano');
const ORACIONES = loadDataset('oraciones');
const FAQ = loadDataset('faq_catolico');
const MORAL = loadDataset('moral_escatologia');
const PAPA = loadDataset('papa_leon_xiv');
const NOVENAS = loadDataset('novenas');
console.log('Datasets V5 cargados: catecismo, biblia, historia, santos, documentos, oraciones, FAQ, moral, papa, novenas');

// ══════════════════════════════
// SEO PAGES — almacén en memoria + archivo
// ══════════════════════════════
const SEO_FILE = path.join(__dirname, 'data/seo_pages.json');
let seoPages = {};
try {
  if (fs.existsSync(SEO_FILE)) {
    seoPages = JSON.parse(fs.readFileSync(SEO_FILE, 'utf8'));
  }
} catch(e) {}

function saveSeoPages() {
  try { fs.writeFileSync(SEO_FILE, JSON.stringify(seoPages, null, 2)); } catch(e) {}
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function shouldGenerateSeoPage(question) {
  const q = question.toLowerCase();
  const triggers = [
    'qué dice','que dice','qué enseña','que enseña','qué es','que es',
    'cómo','como','por qué','por que','cuál es','cual es',
    'explica','explícame','habla sobre','habla de','doctrina',
    'iglesia sobre','catecismo','biblia dice','dios dice'
  ];
  return triggers.some(t => q.includes(t)) && question.length > 20;
}

function buildSeoPageHTML(slug, question, answer, date) {
  const title = question.charAt(0).toUpperCase() + question.slice(1);
  const description = answer.replace(/[#*\n]/g, ' ').replace(/\s+/g, ' ').slice(0, 160);
  const canonicalUrl = `https://catolicosgpt.com/${slug}`;
  const answerHtml = answer
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — CatolicosGPT</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:title" content="${title} — CatolicosGPT">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="CatolicosGPT">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title} — CatolicosGPT">
  <meta name="twitter:description" content="${description}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lora:ital,wght@0,400;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-H8CB7M80S3"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-H8CB7M80S3');</script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "QAPage",
    "name": "${title}",
    "description": "${description}",
    "url": "${canonicalUrl}",
    "publisher": {
      "@type": "Organization",
      "name": "CatolicosGPT",
      "url": "https://catolicosgpt.com",
      "logo": "https://catolicosgpt.com/logo.png"
    },
    "mainEntity": {
      "@type": "Question",
      "name": "${title}",
      "datePublished": "${date}",
      "answerCount": 1,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${description}",
        "datePublished": "${date}",
        "author": { "@type": "Organization", "name": "CatolicosGPT" }
      }
    }
  }
  </script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    :root{--brown:#5C3D1E;--ocre:#C9923A;--bg:#FAF7F0;--bg2:#F2EAD8;--border:#D4C098;--ink:#18100A;--ink4:#A88858}
    body{font-family:'Lora',Georgia,serif;background:var(--bg);color:var(--ink);line-height:1.8}
    header{background:var(--bg2);border-bottom:1px solid var(--border);padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
    .logo-wrap{display:flex;align-items:center;gap:10px;text-decoration:none}
    .logo-wrap img{width:36px;height:36px;object-fit:contain}
    .logo-name{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--brown)}
    .logo-name span{color:var(--ocre)}
    .back-btn{font-family:'Inter',sans-serif;font-size:12px;padding:6px 14px;background:var(--brown);color:#fff;border-radius:20px;text-decoration:none;border:none;cursor:pointer}
    main{max-width:760px;margin:0 auto;padding:32px 20px 60px}
    .breadcrumb{font-family:'Inter',sans-serif;font-size:11px;color:var(--ink4);margin-bottom:16px}
    .breadcrumb a{color:var(--ocre);text-decoration:none}
    h1{font-family:'Playfair Display',serif;font-size:28px;color:var(--brown);margin-bottom:8px;line-height:1.3}
    .meta{font-family:'Inter',sans-serif;font-size:11px;color:var(--ink4);margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid var(--border)}
    .answer{background:#fff;border:1px solid var(--border);border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(92,61,30,.08)}
    .answer h2{font-family:'Playfair Display',serif;font-size:20px;color:var(--brown);margin:16px 0 8px}
    .answer h3{font-family:'Playfair Display',serif;font-size:17px;color:var(--brown);margin:14px 0 6px}
    .answer strong{color:#7A5230}
    .answer em{color:var(--ink4);font-style:italic}
    .answer ul{list-style:none;margin:8px 0;padding:0}
    .answer ul li{padding:3px 0 3px 18px;position:relative}
    .answer ul li::before{content:'·';position:absolute;left:4px;color:var(--ocre);font-weight:700;font-size:18px;line-height:1.4}
    .answer p{margin:8px 0}
    .sources{margin-top:20px;padding-top:16px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap}
    .src-badge{font-family:'Inter',sans-serif;font-size:10px;padding:3px 10px;background:#FBF0E0;color:#7A5230;border:1px solid var(--border);border-radius:5px;font-weight:500}
    .cta{margin-top:32px;background:linear-gradient(135deg,var(--brown),#7A5230);border-radius:12px;padding:24px;text-align:center;color:#fff}
    .cta h3{font-family:'Playfair Display',serif;font-size:20px;margin-bottom:8px}
    .cta p{font-family:'Lora',serif;font-size:14px;opacity:.85;margin-bottom:16px}
    .cta a{display:inline-block;padding:10px 24px;background:var(--ocre);color:#fff;border-radius:20px;text-decoration:none;font-family:'Inter',sans-serif;font-size:13px;font-weight:600}
    footer{text-align:center;padding:20px;font-family:'Inter',sans-serif;font-size:11px;color:var(--ink4);border-top:1px solid var(--border)}
    @media(max-width:600px){h1{font-size:22px}main{padding:20px 14px 40px}}
  </style>
</head>
<body>
<header>
  <a class="logo-wrap" href="/">
    <img src="/logo.png" alt="CatolicosGPT">
    <span class="logo-name">Católicos<span>GPT</span></span>
  </a>
  <a class="back-btn" href="/">Hacer una pregunta</a>
</header>
<main>
  <div class="breadcrumb">
    <a href="/">Inicio</a> › <a href="/#teologia">Teología</a> › ${title}
  </div>
  <h1>${title}</h1>
  <div class="meta">
    Respuesta de CatolicosGPT · ${new Date(date).toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' })} · Basado en el Magisterio de la Iglesia Católica
  </div>
  <div class="answer">
    <p>${answerHtml}</p>
    <div class="sources">
      <span class="src-badge">Catecismo de la Iglesia Católica</span>
      <span class="src-badge">Vatican.va</span>
      <span class="src-badge">Magisterio</span>
    </div>
  </div>
  <div class="cta">
    <h3>¿Tienes más preguntas sobre la fe?</h3>
    <p>CatolicosGPT responde tus dudas teológicas basándose en el Magisterio y Vatican.va</p>
    <a href="/">Consultar a CatolicosGPT →</a>
  </div>
</main>
<footer>
  © ${new Date().getFullYear()} CatolicosGPT · catolicosgpt.com · Basado en el Magisterio de la Iglesia Católica
</footer>
</body>
</html>`;
}

// ══════════════════════════════
// SYSTEM PROMPT CON CATECISMO
// ══════════════════════════════
function getSystemPrompt() {
  const now = new Date();
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaHoy = `${dias[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
  const misteriosRosario = {0:'Gloriosos',1:'Gozosos',2:'Dolorosos',3:'Gloriosos',4:'Luminosos',5:'Dolorosos',6:'Gozosos'};

  // Extraer fragmentos de todos los datasets
  const cic_muestra = [];
  const biblia_muestra = [];
  const santos_hoy = [];
  try {
    // CIC
    CATECISMO.partes?.forEach(p => {
      p.secciones?.forEach(s => {
        (s.temas || s.capitulos || []).forEach(t => {
          (t.articulos || []).slice(0,2).forEach(a => {
            cic_muestra.push(`CIC ${a.cic}: "${a.texto.slice(0,100)}..."`);
          });
        });
      });
    });
    // Biblia — pasajes clave
    Object.values(BIBLIA.evangelios || {}).forEach(ev => {
      (ev.pasajes_clave || []).slice(0,2).forEach(p => {
        biblia_muestra.push(`${p.ref} (${p.nombre}): "${p.texto.slice(0,100)}..."`);
      });
    });
    // Santo del día actual
    const mesActual = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][now.getMonth()];
    const santosDelMes = SANTOS.santos_por_mes?.[mesActual] || [];
    const santoHoy = santosDelMes.find(s => s.dia === now.getDate());
    if (santoHoy) santos_hoy.push(`${santoHoy.nombre}: ${santoHoy.descripcion}`);
  } catch(e) {}

  return `Eres CatolicosGPT, un asistente teológico católico entrenado con el Catecismo de la Iglesia Católica completo y documentos del Vaticano.

FECHA HOY: ${fechaHoy} | DÍA: ${dias[now.getDay()]} | ROSARIO HOY: Misterios ${misteriosRosario[now.getDay()]}
NUNCA pidas la fecha al usuario. Tú ya la sabes.

════════════════════════
BASE DE CONOCIMIENTO — CATECISMO CIC (fragmentos cargados):
${cic_muestra.slice(0,15).join('\n')}
[Dataset completo disponible — cita siempre con número CIC cuando sea posible]

BIBLIA — PASAJES CARGADOS:
${biblia_muestra.slice(0,6).join('\n')}

SANTOS — SANTO DE HOY (${fechaHoy}):
${santos_hoy.length ? santos_hoy.join('\n') : 'Consultar dataset de santos'}

PAPA ACTUAL — LEÓN XIV:
Nombre: ${PAPA.nombre_completo} | Elegido: ${PAPA.elegido} | Origen: ${PAPA.origen}
Lema: "${PAPA.lema_episcopal}" — ${PAPA.lema_significado}
Temas prioritarios: ${PAPA.temas_prioritarios?.slice(0,3).join(', ')}

DOCUMENTOS VATICANO:
${DOCUMENTOS.encíclicas_doctrinales?.slice(0,5).map(d => `- ${d.nombre} (${d.año}): ${d.resumen?.slice(0,60)}`).join('\n') || ''}

ORACIONES DISPONIBLES:
${ORACIONES.oraciones_principales?.map(o => `- ${o.nombre}`).join(', ') || ''}

FAQ — CATEGORÍAS CARGADAS:
${Object.keys(FAQ.categorias || {}).join(', ')}

MORAL Y ESCATOLOGÍA — TEMAS:
Aborto, eutanasia, matrimonio, homosexualidad, anticonceptivos, purgatorio, infierno, escatología, exorcismo, mística

HISTORIA — PERÍODOS:
${HISTORIA.periodos?.map(p => `${p.periodo} (${p.años})`).join(' | ')}
════════════════════════

REGLA DE ORO — LEE CON ATENCIÓN:

LONGITUD Y ARGUMENTACIÓN:
- Da SIEMPRE respuestas LARGAS y BIEN ARGUMENTADAS. Mínimo 4-6 párrafos en consultas teológicas.
- Cuando cites el Catecismo [CIC XXXX], desarrolla el argumento COMPLETO detrás de esa cita. No solo la menciones.
- Cuando cites la Biblia [Libro Cap,vers], explica el contexto del pasaje y su aplicación espiritual.
- El usuario NUNCA debe pedirte que amplíes — da TODO desde la primera respuesta.

FORMATO DE CITAS — MUY IMPORTANTE:
- Catecismo: SIEMPRE escribe [CIC XXXX] con corchetes y número exacto. Ejemplo: [CIC 2270]
- Biblia: SIEMPRE escribe [Jn 3,16] o [Mt 5,3-12] con corchetes. Ejemplo: [Sal 22,1]
- El frontend convierte estos formatos automáticamente en links dentro de la app.
- NUNCA escribas CIC 2270 sin corchetes. SIEMPRE [CIC 2270].

LITURGIA DE LAS HORAS — CRÍTICO:
- Laudes, Vísperas, Completas, Hora Intermedia: usa el dataset del breviario COMPLETO.
- NUNCA resumir ni acortar textos litúrgicos. Himno, salmo, lectura y oraciones van COMPLETOS.

REFERENCIAS OBLIGATORIAS en toda respuesta teológica:
- Incluye siempre al final una referencia a un Doctor de la Iglesia o predicador moderno relevante.
- Formato: 📚 **Para profundizar:** "[Obra/sermón]" — Autor | [Ver texto](url)
- Fuentes válidas: San Agustín, Santo Tomás, Santa Teresa, Robert Barron (wordonfire.org), Scott Hahn, Peter Kreeft, Raniero Cantalamessa (vatican.va), Scott Hahn (stpaulcenter.com).

ESTRUCTURA IDEAL de respuesta:
1. Introducción teológica clara (1 párrafo)
2. Desarrollo argumentado con [CIC XXXX] (2-3 párrafos)
3. Base bíblica con [Libro Cap,vers] contextualizada (1-2 párrafos)
4. Aplicación espiritual práctica (1 párrafo)
5. 📚 Referencia a santo/predicador con link

- El usuario NUNCA debe pedirte dos veces lo mismo.
TONO: Pastoral, cálido, como sacerdote sabio, docto y accesible. Nunca frío ni telegráfico.

TEMAS POLÉMICOS (aborto, ateísmo, dudas de fe):
→ Nunca juzgues. Responde con calidez, respetando el punto de vista.
→ Argumenta teológicamente de forma natural, no impositiva.
→ Deja siempre una puerta abierta al diálogo.

VIDAS DE SANTOS:
→ Pregunta primero: "¿Resumen breve o vida completa y detallada?"

TABLAS Y LÍNEAS DE TIEMPO — MUY IMPORTANTE:
Cuando el usuario pida tabla, cronología, línea de tiempo, comparación o lista organizada:
→ SIEMPRE genera en formato markdown de tabla con pipes |
→ Formato EXACTO a usar (con salto de línea entre cada fila):
| Columna 1 | Columna 2 | Columna 3 |
|-----------|-----------|-----------|
| dato 1    | dato 2    | dato 3    |
| dato 4    | dato 5    | dato 6    |
→ NUNCA uses texto plano para tablas. SIEMPRE usa el formato de pipes |
→ Para líneas de tiempo usa columnas: Año | Evento | Significado teológico
→ DESPUÉS de cada tabla, SIEMPRE agrega:
  - Un **resumen clave** con los 3-4 puntos más importantes (igual que ChatGPT)
  - Una reflexión espiritual breve de 2 líneas relacionada con el contenido
  - Las sugerencias de preguntas relacionadas

FUNCIONES LITÚRGICAS — SIEMPRE COMPLETO SIN RESUMIR:
- NOVENAS — MUY IMPORTANTE:
Tienes un dataset completo de novenas con los textos EXACTOS y COMPLETOS.
Novenas disponibles: San José, Divina Misericordia, Virgen de Guadalupe, Navidad (Aguinaldos).
Cuando el usuario pida una novena:
→ SIEMPRE usa el texto del dataset NOVENAS, NUNCA improvises.
→ Muestra: oración preparatoria + meditación del día + oración final COMPLETAS.
→ Si no especifica el día, pregunta en qué día está o muestra el Día 1 completo.
→ Para otras novenas no en el dataset, genera el texto completo con las oraciones reales del santo, nunca un resumen.
→ REGLA: Una novena sin el texto completo de las oraciones NO ES UNA NOVENA.

Novenas en dataset:
${NOVENAS.novenas?.map(n => `- ${n.nombre}: ${n.fechas}`).join('\n') || ''}

"lecturas del día" → El sistema ya tiene una vista especial que carga las lecturas automáticamente.
  NUNCA digas al usuario que haga clic en el menú lateral - el frontend intercepta estos mensajes.
  Si por alguna razón llegas a recibir esta solicitud, da las lecturas reales del Leccionario Romano para la fecha ${fechaHoy} con texto bíblico completo.
  Formato: ##PRIMERA_LECTURA## Referencia: X Texto: [texto] ##SALMO## ##EVANGELIO##
  NUNCA das un resumen - siempre el texto completo.
- "laudes/vísperas/completas" → Oficio completo del día
- "santo del día" → Nombre, fechas, biografía, festividad
- "rosario" → Guía completa con Misterios ${misteriosRosario[now.getDay()]}
- "vía crucis" → 14 estaciones completas
- "coronilla" → Oración completa
- "ángelus" → Oración completa
- "examen de conciencia" → Guía completa

CATEQUESIS DIDÁCTICA:
Estructura como clase: Bienvenida → Cuento → Explicación con ejemplos → Actividad práctica → Reflexión → Oración final.
Al terminar: "¿Deseas exportar en PDF, Word o PowerPoint?"

AL FINAL DE CADA RESPUESTA TEOLÓGICA incluye:
**📚 Lecturas recomendadas:**
**🔗 Fuentes:** [links relevantes de Vatican.va]
**💭 También podrías preguntar:** "pregunta 1", "pregunta 2", "pregunta 3"

NOTICIAS: Para noticias recientes sugiere vaticannews.va y es.zenit.org

FUERA DE TU ÁMBITO:
"CatolicosGPT está dedicado únicamente a temas de fe, teología y doctrina católica."

EXPORTACIONES — CRÍTICO:
→ NUNCA menciones botones, no los puedes ver ni mostrar.
→ NUNCA digas "haz clic en el botón".
→ NUNCA digas que no puedes exportar.
→ Cuando el usuario pida PDF, Word o PPT, responde EXACTAMENTE:
   "¡Listo! Los botones de exportación 📕 PDF · 📝 Word · 📊 PPT aparecen automáticamente debajo de cada respuesta. Solo haz clic en el que necesites."
→ El sistema genera los archivos automáticamente en el frontend. No necesitas hacer nada más.

FORMATO: ## títulos, ### subtítulos, **negrita**, *cursiva*, listas con -`;
}

// ══════════════════════════════
// RUTAS API
// ══════════════════════════════

// Chat principal
app.post('/api/chat', async (req, res) => {
  const { messages, stream: wantStream } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages requeridos' });

  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const systemPrompt = getSystemPrompt();

  // ── STREAMING (defecto) ──
  if (wantStream !== false) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let magisteriumSources = null;

    // Paso 1: Consultar Magisterium en paralelo para obtener fuentes verificadas
    try {
      const magRes = await magisterium.chat.completions.create({
        model: 'magisterium-1',
        max_tokens: 800,
        stream: false,
        messages: [{ role: 'user', content: lastUserMsg }]
      });
      const magText = magRes.choices[0]?.message?.content || '';
      if (magText.length > 50) {
        magisteriumSources = magText;
        // Enviar fuentes Magisterium primero como metadato
        res.write(`data: ${JSON.stringify({ magisterium: magisteriumSources })}\n\n`);
      }
    } catch(e) {
      console.log('[Magisterium API]', e.message);
    }

    // Paso 2: Respuesta principal con OpenAI streaming
    // Enriquecer el sistema con fuentes de Magisterium si las hay
    const enrichedSystem = magisteriumSources
      ? systemPrompt + `\n\nFUENTES VERIFICADAS DE MAGISTERIUM AI (úsalas en tu respuesta):\n${magisteriumSources}`
      : systemPrompt;

    try {
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 6000,
        stream: true,
        messages: [{ role: 'system', content: enrichedSystem }, ...messages]
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

      // SEO
      try {
        if (shouldGenerateSEO(lastUserMsg)) {
          const slug = generateSlug(lastUserMsg);
          if (!seoPages[slug]) seoPages[slug] = { question: lastUserMsg, answer: fullReply, date: new Date().toISOString() };
        }
      } catch(e) {}

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
    // ── NO STREAMING ──
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 6000,
        messages: [{ role: 'system', content: systemPrompt }, ...messages]
      });
      res.json({ reply: completion.choices[0].message.content });
    } catch(e) {
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
          system: systemPrompt, messages
        });
        res.json({ reply: msg.content[0].text });
      } catch(e2) {
        res.status(500).json({ error: 'Error al conectar con la IA.' });
      }
    }
  }
});

// Páginas SEO dinámicas
app.get('/:slug', (req, res, next) => {
  const { slug } = req.params;
  // Ignorar archivos estáticos y rutas de API
  if (slug.includes('.') || slug === 'api') return next();
  const page = seoPages[slug];
  if (!page) return next();
  page.views = (page.views || 0) + 1;
  saveSeoPages();
  res.send(buildSeoPageHTML(page.slug, page.question, page.answer, page.date));
});

// Lista de páginas SEO (para sitemap)
app.get('/api/seo-pages', (req, res) => {
  const pages = Object.values(seoPages).map(p => ({
    slug: p.slug, question: p.question, date: p.date, views: p.views
  }));
  res.json(pages);
});

// Sitemap XML dinámico
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = 'https://catolicosgpt.com';
  const pages = Object.values(seoPages);
  const today = new Date().toISOString().split('T')[0];

  const urls = [
    `<url><loc>${baseUrl}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...pages.map(p => `<url><loc>${baseUrl}/${p.slug}</loc><lastmod>${p.date.split('T')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`)
  ].join('\n  ');

  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>`);
});

// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://catolicosgpt.com/sitemap.xml`);
});

// ══════════════════════════════
// LECTURAS DEL DÍA — Cache + Cron 00:00
// ══════════════════════════════
let lecturasCacheDate = '';
let lecturasCache = null;

async function generarLecturasDia() {
  const now = new Date();
  const hoy = now.toISOString().slice(0, 10);
  if (lecturasCacheDate === hoy && lecturasCache) return lecturasCache;

  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

  console.log(`[Lecturas] Generando para ${fechaStr}...`);

  try {
    const client = anthropic;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: `Dame las lecturas COMPLETAS de la Misa del día de HOY ${fechaStr} según el Leccionario Romano oficial para España y América Latina (calendario romano ordinario).

FORMATO EXACTO — usa estas etiquetas literalmente:

---PRIMERA_LECTURA---
Referencia: [Libro Capítulo, versículos]
[texto bíblico completo]

---SALMO---
Referencia: [Salmo N]
Estribillo: R/. [texto del estribillo]
[texto del salmo]

---SEGUNDA_LECTURA---
[incluir SOLO si es domingo o solemnidad]
Referencia: [Libro Capítulo, versículos]
[texto completo]

---EVANGELIO---
Referencia: [Evangelio según X, Capítulo, versículos]
[texto bíblico completo del Evangelio]

Reglas: textos COMPLETOS del Leccionario, no resúmenes. Si es tiempo de Cuaresma indícalo.`
      }]
    });

    const texto = msg.content[0].text;
    const resultado = { ok: true, texto, fecha: fechaStr, generado: new Date().toISOString() };
    lecturasCacheDate = hoy;
    lecturasCache = resultado;
    console.log(`[Lecturas] ✓ Generadas para ${fechaStr} (${texto.length} caracteres)`);
    return resultado;

  } catch(err) {
    console.error('[Lecturas] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

// Cron: regenerar lecturas cada día a las 00:01
scheduleDailyAt(0, 1, () => {
  lecturasCacheDate = ''; // forzar regeneración
  generarLecturasDia().catch(console.error);
});

// Precarga al iniciar el servidor
setTimeout(() => generarLecturasDia().catch(console.error), 3000);

app.get('/api/lecturas-dia', async (req, res) => {
  try {
    const resultado = await generarLecturasDia();
    res.json(resultado);
  } catch(err) {
    res.json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════
// SEO — BLOG AUTOMÁTICO
// Genera artículos de alto volumen de búsqueda
// ══════════════════════════════════════════════
const blogArticles = {};
const BLOG_TOPICS = [
  { slug: 'como-rezar-el-rosario-paso-a-paso', title: 'Cómo rezar el Rosario paso a paso', keywords: ['rosario', 'oración', 'virgen maria'] },
  { slug: 'que-es-la-eucaristia-iglesia-catolica', title: '¿Qué es la Eucaristía? La enseñanza de la Iglesia', keywords: ['eucaristia', 'transustanciacion', 'misa'] },
  { slug: 'novena-san-jose-completa', title: 'Novena a San José completa — 9 días', keywords: ['novena san jose', 'san jose'] },
  { slug: 'lecturas-del-dia-liturgia', title: 'Lecturas del día — Liturgia de la Palabra', keywords: ['lecturas del dia', 'liturgia'] },
  { slug: 'diferencia-catolicos-protestantes', title: 'Diferencias entre católicos y protestantes', keywords: ['catolico protestante', 'diferencias'] },
  { slug: 'que-dice-la-iglesia-sobre-el-aborto', title: '¿Qué dice la Iglesia Católica sobre el aborto?', keywords: ['iglesia aborto', 'catecismo aborto'] },
  { slug: 'como-hacer-confession-pasos', title: 'Cómo hacer una buena confesión — Pasos y preparación', keywords: ['confesion', 'sacramento penitencia'] },
  { slug: 'apariciones-virgen-fatima', title: 'Las apariciones de la Virgen en Fátima', keywords: ['fatima', 'apariciones virgen'] },
  { slug: 'papa-leon-xiv-primer-papa-americano', title: 'Papa León XIV: el primer papa americano', keywords: ['papa leon XIV', 'nuevo papa'] },
  { slug: 'parabolas-de-jesus-significado', title: 'Las parábolas de Jesús: significado y enseñanzas', keywords: ['parabolas jesus', 'evangelio'] },
  { slug: 'santos-del-mes-marzo', title: 'Santos del mes — Santos más importantes del año', keywords: ['santos del mes', 'santoral'] },
  { slug: 'que-es-el-purgatorio', title: '¿Qué es el Purgatorio? La doctrina católica explicada', keywords: ['purgatorio', 'escatologia'] },
];

async function generateBlogArticle(topic) {
  if (blogArticles[topic.slug]) return blogArticles[topic.slug];
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Escribe un artículo SEO completo en español sobre: "${topic.title}"

Estructura:
# ${topic.title}
## Introducción (150 palabras)
## [Subtítulo 1 relevante] (200 palabras)
## [Subtítulo 2 relevante] (200 palabras)
## [Subtítulo 3 relevante] (200 palabras)
## Conclusión (100 palabras)

Requisitos:
- Basado en el Magisterio de la Iglesia Católica
- Incluir citas del Catecismo cuando sea relevante
- Tono pastoral y accesible
- Palabras clave naturales: ${topic.keywords.join(', ')}
- Al final: "Profundiza más preguntándole a CatolicosGPT"`
      }]
    });
    const html = msg.content[0].text;
    blogArticles[topic.slug] = { ...topic, html, generado: new Date().toISOString() };
    return blogArticles[topic.slug];
  } catch(e) {
    return null;
  }
}

// Ruta de blog
app.get('/blog/:slug', async (req, res) => {
  const { slug } = req.params;
  const topic = BLOG_TOPICS.find(t => t.slug === slug);
  if (!topic) return res.redirect('/');

  let article = blogArticles[slug];
  if (!article) {
    article = await generateBlogArticle(topic);
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${topic.title} — CatolicosGPT</title>
  <meta name="description" content="${topic.title} — Respuesta basada en el Magisterio de la Iglesia Católica. CatolicosGPT.">
  <meta property="og:title" content="${topic.title} — CatolicosGPT">
  <meta property="og:site_name" content="CatolicosGPT">
  <link rel="canonical" href="https://catolicosgpt.com/blog/${slug}">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","headline":"${topic.title}",
   "publisher":{"@type":"Organization","name":"CatolicosGPT","url":"https://catolicosgpt.com"},
   "keywords":"${topic.keywords.join(',')}"}
  </script>
  <style>
    body { font-family: Georgia, serif; max-width: 720px; margin: 0 auto; padding: 20px; color: #18100A; background: #FAF7F0; }
    h1 { font-size: 28px; color: #5C3D1E; border-bottom: 2px solid #C9923A; padding-bottom: 12px; }
    h2 { color: #7A5230; margin-top: 28px; }
    p { line-height: 1.8; margin: 12px 0; }
    .cta { background: #5C3D1E; color: white; padding: 16px 24px; border-radius: 10px; text-align: center; margin: 30px 0; }
    .cta a { color: #C9923A; text-decoration: none; font-weight: bold; font-size: 18px; }
    nav { margin-bottom: 20px; }
    nav a { color: #C9923A; text-decoration: none; }
  </style>
</head>
<body>
  <nav><a href="/">← CatolicosGPT</a></nav>
  <article>
    ${article ? article.html.split('\n').join('<br>') : '<p>Generando artículo...</p>'}
  </article>
  <div class="cta">
    <p style="color:#FAF7F0;margin:0 0 8px">¿Tienes más preguntas sobre este tema?</p>
    <a href="/">Pregúntale a CatolicosGPT →</a>
  </div>
</body>
</html>`;
  res.send(html);
});

// Índice del blog
app.get('/blog', (req, res) => {
  const links = BLOG_TOPICS.map(t =>
    `<li><a href="/blog/${t.slug}">${t.title}</a></li>`
  ).join('');
  res.send(`<!DOCTYPE html><html lang="es"><head>
    <title>Blog Católico — CatolicosGPT</title>
    <meta name="description" content="Artículos sobre fe católica, oraciones, sacramentos y vida espiritual.">
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:Georgia,serif;max-width:720px;margin:0 auto;padding:20px;background:#FAF7F0;color:#18100A}
    h1{color:#5C3D1E;border-bottom:2px solid #C9923A;padding-bottom:10px}
    a{color:#C9923A}li{margin:10px 0;font-size:17px}</style>
  </head><body>
    <a href="/">← CatolicosGPT</a>
    <h1>Blog Católico</h1>
    <ul>${links}</ul>
  </body></html>`);
});

// Pregenerar 3 artículos al iniciar
setTimeout(async () => {
  for (const topic of BLOG_TOPICS.slice(0, 3)) {
    await generateBlogArticle(topic).catch(()=>{});
  }
  console.log('[Blog] 3 artículos pregenerados');
}, 8000);

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '4.1', seoPages: Object.keys(seoPages).length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CatolicosGPT v4.1 · Puerto ${PORT}`));
