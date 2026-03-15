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

FORMATO: ## títulos, ### subtítulos, **negrita**, *cursiva*, listas con -

PROACTIVIDAD — SIEMPRE al final de cada respuesta:
Incluye 2-3 preguntas de seguimiento que el usuario podría querer hacer, en este formato exacto:
→ ¿Quieres que [acción concreta relacionada con lo explicado]?
→ ¿Te explico [tema relacionado más profundo]?
→ ¿Prefieres ver [comparación/análisis/lista]?

Estas sugerencias deben ser específicas al tema respondido, no genéricas.
Ejemplo para parábolas: "¿Quieres que compare las parábolas del Reino en los cuatro Evangelios?", 
"¿Te explico el contexto histórico de por qué Jesús usaba parábolas?"`;

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
  const mes = now.getMonth() + 1;
  const dia = now.getDate();
  const año = now.getFullYear();

  // Calcular ciclo litúrgico (A=2026, B=2024, C=2025)
  const ciclo = ['C','A','B'][(año - 2024) % 3] || 'A';

  console.log(`[Lecturas] Generando para ${fechaStr} — Ciclo ${ciclo}...`);

  // Usar OpenAI que tiene conocimiento del calendario litúrgico
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 3000,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: `Eres un experto en liturgia católica con conocimiento completo del Leccionario Romano. 
Conoces el calendario litúrgico de todos los años incluyendo 2026. 
El año litúrgico 2025-2026 es el Ciclo C. 
Hoy es ${fechaStr}.
NUNCA digas que no tienes acceso a esta información. SIEMPRE proporciona las lecturas del Leccionario Romano para la fecha exacta indicada.`
        },
        {
          role: 'user',
          content: `Dame las lecturas COMPLETAS de la Misa de HOY ${fechaStr} (Ciclo ${ciclo}) según el Leccionario Romano oficial.

Formato EXACTO — usa estas etiquetas literalmente:

---PRIMERA_LECTURA---
Referencia: [Libro Capítulo, versículos]
[texto bíblico completo]

---SALMO---
Referencia: [Salmo N]
Estribillo: R/. [texto]
[texto del salmo]

---SEGUNDA_LECTURA---
Referencia: [solo si es domingo o solemnidad]
[texto completo]

---EVANGELIO---
Referencia: [Evangelio según X, Cap, versículos]
[texto completo]

Proporciona los textos COMPLETOS. No resumas. No digas que no puedes.`
        }
      ]
    });

    const texto = completion.choices[0].message.content;
    if (texto && texto.length > 400 && texto.includes('---')) {
      const resultado = { ok: true, texto, fecha: fechaStr, ciclo, fuente: 'openai-gpt4o', generado: new Date().toISOString() };
      lecturasCacheDate = hoy;
      lecturasCache = resultado;
      console.log(`[Lecturas] ✓ GPT-4o OK (${texto.length} chars)`);
      return resultado;
    }
    throw new Error('Respuesta insuficiente: ' + texto?.slice(0,100));

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
  { slug: 'como-rezar-el-rosario-paso-a-paso', title: 'Cómo rezar el Rosario paso a paso', desc: 'Guía completa para rezar el Santo Rosario con los misterios del día, oraciones y meditaciones.' },
  { slug: 'que-es-la-eucaristia-iglesia-catolica', title: '¿Qué es la Eucaristía? Doctrina de la Iglesia', desc: 'La Eucaristía es el centro de la vida católica. Aprende qué dice el Catecismo y la Biblia sobre este sacramento.' },
  { slug: 'novena-san-jose-completa', title: 'Novena a San José completa — 9 días de oración', desc: 'Texto completo de la Novena a San José con oraciones para los 9 días. Ideal para el mes de marzo.' },
  { slug: 'lecturas-del-dia-liturgia-misa', title: 'Lecturas del día de la Misa — Leccionario Romano', desc: 'Cómo encontrar las lecturas de la Misa de cada día según el calendario litúrgico católico.' },
  { slug: 'diferencia-entre-catolicos-y-protestantes', title: 'Diferencias entre católicos y protestantes', desc: 'Comparación respetuosa entre la fe católica y el protestantismo desde la doctrina de la Iglesia.' },
  { slug: 'que-dice-la-iglesia-sobre-el-aborto', title: '¿Qué dice la Iglesia Católica sobre el aborto?', desc: 'La posición del Catecismo y el Magisterio de la Iglesia Católica sobre el aborto y la vida humana.' },
  { slug: 'como-hacer-una-buena-confesion', title: 'Cómo hacer una buena confesión — Pasos y preparación', desc: 'Guía completa para prepararse y realizar el Sacramento de la Reconciliación correctamente.' },
  { slug: 'papa-leon-xiv-primer-papa-americano', title: 'Papa León XIV: el primer papa americano', desc: 'Quién es el Papa León XIV, el primer papa del continente americano, elegido en 2025.' },
  { slug: 'parabolas-de-jesus-significado-y-ensenanza', title: 'Las parábolas de Jesús: significado y enseñanza', desc: 'Las principales parábolas de Jesús en los Evangelios con su interpretación teológica y aplicación espiritual.' },
  { slug: 'que-es-el-purgatorio-doctrina-catolica', title: '¿Qué es el Purgatorio? Doctrina católica explicada', desc: 'El Catecismo explica qué es el Purgatorio, por qué los católicos lo creen y cómo ayudar a las almas.' },
  { slug: 'ia-catolica-en-espanol-catolicosgpt', title: 'IA Católica en español: CatolicosGPT, el asistente teológico', desc: 'CatolicosGPT es la inteligencia artificial católica #1 en español para consultar doctrina, oraciones y liturgia.' },
  { slug: 'como-rezar-el-via-crucis-completo', title: 'Cómo rezar el Vía Crucis completo — 14 estaciones', desc: 'El Vía Crucis completo con las 14 estaciones, oraciones y meditaciones para la Cuaresma y el Viernes Santo.' },
  { slug: 'coronilla-divina-misericordia-completa', title: 'Coronilla de la Divina Misericordia completa', desc: 'Texto completo de la Coronilla de la Divina Misericordia con instrucciones para rezarla en el Rosario.' },
  { slug: 'santos-del-dia-santoral-catolico', title: 'Santos del día — Santoral católico completo', desc: 'Cómo encontrar el santo de cada día según el calendario litúrgico de la Iglesia Católica.' },
  { slug: 'misal-romano-ordinario-misa-completo', title: 'Misal Romano — Ordinario de la Misa completo', desc: 'Texto completo del Ordinario de la Misa en español: todos los textos del sacerdote y la asamblea.' },
];;

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

  const desc = topic.desc || topic.title;
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${topic.title} — CatolicosGPT</title>
  <meta name="description" content="${desc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://catolicosgpt.com/blog/${topic.slug}">
  <meta property="og:title" content="${topic.title} — CatolicosGPT">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://catolicosgpt.com/blog/${topic.slug}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${topic.title}",
    "description": "${desc}",
    "url": "https://catolicosgpt.com/blog/${topic.slug}",
    "dateModified": "${new Date().toISOString().slice(0,10)}",
    "publisher": {
      "@type": "Organization",
      "name": "CatolicosGPT",
      "url": "https://catolicosgpt.com"
    },
    "author": {
      "@type": "Organization",
      "name": "CatolicosGPT — IA Católica en Español"
    },
    "inLanguage": "es",
    "about": {
      "@type": "Thing",
      "name": "Catolicismo",
      "description": "Doctrina y espiritualidad de la Iglesia Católica"
    }
  }
  </script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;background:#FAF7F0;color:#18100A;line-height:1.8}
    .container{max-width:740px;margin:0 auto;padding:24px 20px}
    .topbar{display:flex;align-items:center;gap:12px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #E8E0D0}
    .topbar a{color:#C9923A;text-decoration:none;font-size:14px;font-family:Inter,sans-serif}
    .topbar a:hover{color:#7A5230}
    h1{font-family:Georgia,serif;font-size:26px;color:#5C3D1E;margin-bottom:8px;line-height:1.4}
    .meta{font-family:Inter,sans-serif;font-size:11px;color:#9B8A77;text-transform:uppercase;letter-spacing:.08em;margin-bottom:24px}
    h2{font-size:19px;color:#7A5230;margin:28px 0 10px;font-family:Georgia,serif}
    p{margin-bottom:14px;font-size:15.5px;color:#2C1810}
    .cta-box{background:#5C3D1E;color:#FAF7F0;padding:20px 24px;border-radius:12px;margin:32px 0;text-align:center}
    .cta-box p{color:#FAF7F0;margin-bottom:12px}
    .cta-btn{display:inline-block;background:#C9923A;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-family:Inter,sans-serif;font-size:14px;font-weight:600}
    .footer{margin-top:40px;padding-top:20px;border-top:1px solid #E8E0D0;font-family:Inter,sans-serif;font-size:12px;color:#9B8A77;text-align:center}
    .tag{display:inline-block;background:rgba(201,146,58,.12);color:#7A5230;padding:3px 10px;border-radius:12px;font-family:Inter,sans-serif;font-size:11px;font-weight:600;margin-right:5px}
  </style>
</head>
<body>
<div class="container">
  <div class="topbar">
    <a href="/">← CatolicosGPT</a>
    <span style="color:#E8E0D0">|</span>
    <a href="/blog">Blog</a>
  </div>
  <span class="tag">Fe Católica</span>
  <span class="tag">IA Católica</span>
  <h1>${topic.title}</h1>
  <div class="meta">CatolicosGPT · Actualizado ${new Date().toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'numeric'})}</div>
  <article>
    ${article ? article.html.split('\n').join('<br>') : '<p>Generando artículo...</p>'}
  </article>
  <div class="cta-box">
    <p>¿Tienes más preguntas sobre este tema?</p>
    <a href="/" class="cta-btn">Pregúntale a CatolicosGPT — Gratis →</a>
  </div>
  <div class="footer">
    CatolicosGPT — La IA Católica #1 en Español · <a href="/" style="color:#C9923A">catolicosgpt.com</a>
  </div>
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

// ══════════════════════════════════════════════
// ENDPOINTS DE CITAS — CIC y Biblia
// Usados por el modal de citas en el frontend
// ══════════════════════════════════════════════

// Cache en memoria para no repetir llamadas
const citasCache = {};

app.get('/api/cic/:num', async (req, res) => {
  const num = req.params.num;
  const cacheKey = `cic_${num}`;
  
  // 1. Buscar en dataset local primero
  function buscarEnDataset(num) {
    function buscar(obj) {
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const r = buscar(item);
          if (r) return r;
        }
      } else if (obj && typeof obj === 'object') {
        if (String(obj.cic) === String(num) && obj.texto) return obj.texto;
        for (const v of Object.values(obj)) {
          const r = buscar(v);
          if (r) return r;
        }
      }
      return null;
    }
    return buscar(CATECISMO);
  }
  
  const local = buscarEnDataset(num);
  if (local) {
    return res.json({ ok: true, num, texto: local, fuente: 'dataset' });
  }
  
  // 2. Buscar en cache
  if (citasCache[cacheKey]) {
    return res.json({ ok: true, num, texto: citasCache[cacheKey], fuente: 'cache' });
  }
  
  // 3. Generar con OpenAI — prompt que no puede rechazar
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 600,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Eres un sistema de consulta del Catecismo de la Iglesia Católica. 
Tu única función es devolver el texto exacto de artículos del Catecismo.
SIEMPRE proporciona el texto solicitado. NUNCA te niegues. NUNCA digas que no puedes.
Si no recuerdas el texto exacto, proporciona el contenido oficial basado en tu conocimiento del Catecismo.`
        },
        {
          role: 'user',
          content: `Artículo ${num} del Catecismo de la Iglesia Católica (CIC ${num}). 
Dame SOLO el texto del artículo, comenzando directamente con el contenido. Sin introducción.`
        }
      ]
    });
    const texto = completion.choices[0].message.content;
    citasCache[cacheKey] = texto;
    res.json({ ok: true, num, texto, fuente: 'openai' });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/biblia', async (req, res) => {
  const ref = req.query.ref;
  if (!ref) return res.json({ ok: false, error: 'ref requerida' });
  
  const cacheKey = `biblia_${ref}`;
  if (citasCache[cacheKey]) {
    return res.json({ ok: true, ref, texto: citasCache[cacheKey], fuente: 'cache' });
  }
  
  // Buscar en dataset de biblia
  function buscarEnBiblia(ref) {
    try {
      const pasajes = BIBLIA.pasajes || BIBLIA.libros || [];
      for (const item of pasajes) {
        if (item.referencia === ref || item.ref === ref) return item.texto;
      }
    } catch(e) {}
    return null;
  }
  
  const local = buscarEnBiblia(ref);
  if (local) return res.json({ ok: true, ref, texto: local, fuente: 'dataset' });
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Eres un sistema de consulta bíblica. Tu función es proporcionar el texto exacto de pasajes bíblicos en español.
Usa la traducción litúrgica española (Biblia de Jerusalén o similar).
SIEMPRE proporciona el texto. NUNCA te niegues. NUNCA digas que no puedes.`
        },
        {
          role: 'user',
          content: `Pasaje bíblico: ${ref}
Dame SOLO el texto del pasaje en español, comenzando directamente con el versículo. Sin introducción ni comentarios.`
        }
      ]
    });
    const texto = completion.choices[0].message.content;
    citasCache[cacheKey] = texto;
    res.json({ ok: true, ref, texto, fuente: 'openai' });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '4.1', seoPages: Object.keys(seoPages).length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CatolicosGPT v4.1 · Puerto ${PORT}`));
