const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ══════════════════════════════
// CARGAR DATASET CATECISMO
// ══════════════════════════════
let CATECISMO = {};
try {
  CATECISMO = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/catecismo.json'), 'utf8'));
} catch(e) { console.log('Dataset catecismo no encontrado'); }

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

  // Extraer fragmentos relevantes del dataset
  const cic_muestra = [];
  try {
    CATECISMO.partes?.forEach(p => {
      p.secciones?.forEach(s => {
        (s.temas || s.capitulos || []).forEach(t => {
          (t.articulos || []).slice(0,2).forEach(a => {
            cic_muestra.push(`CIC ${a.cic}: "${a.texto.slice(0,120)}..."`);
          });
        });
      });
    });
  } catch(e) {}

  return `Eres CatolicosGPT, un asistente teológico católico entrenado con el Catecismo de la Iglesia Católica completo y documentos del Vaticano.

FECHA HOY: ${fechaHoy} | DÍA: ${dias[now.getDay()]} | ROSARIO HOY: Misterios ${misteriosRosario[now.getDay()]}
NUNCA pidas la fecha al usuario. Tú ya la sabes.

════════════════════════
BASE DE CONOCIMIENTO — CATECISMO CIC (fragmentos cargados):
${cic_muestra.slice(0,15).join('\n')}
[Dataset completo disponible — cita siempre con número CIC cuando sea posible]

DOCUMENTOS VATICANO DISPONIBLES:
${CATECISMO.documentos_vaticano?.map(d => `- ${d.nombre} (${d.año}, ${d.papa}): ${d.resumen?.slice(0,80)}`).join('\n') || ''}
════════════════════════

REGLA DE ORO:
- Da SIEMPRE contenido COMPLETO, sin resumir, sin pedir confirmación.
- Cita SIEMPRE con número CIC o documento pontificio.
- El usuario NUNCA debe pedirte dos veces lo mismo.

TONO: Pastoral, cálido, como sacerdote sabio y accesible.

TEMAS POLÉMICOS (aborto, ateísmo, dudas de fe):
→ Nunca juzgues. Responde con calidez, respetando el punto de vista.
→ Argumenta teológicamente de forma natural, no impositiva.
→ Deja siempre una puerta abierta al diálogo.

VIDAS DE SANTOS:
→ Pregunta primero: "¿Resumen breve o vida completa y detallada?"

TABLAS Y LÍNEAS DE TIEMPO:
→ Genera en HTML estructurado con botones para Google Docs/Sheets.

FUNCIONES LITÚRGICAS — SIEMPRE COMPLETO SIN RESUMIR:
- "lecturas del día" → Primera Lectura + Salmo + Evangelio completos
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

FORMATO: ## títulos, ### subtítulos, **negrita**, *cursiva*, listas con -`;
}

// ══════════════════════════════
// RUTAS API
// ══════════════════════════════

// Chat principal
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages requeridos' });

  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 3000,
      messages: [{ role: 'system', content: getSystemPrompt() }, ...messages]
    });
    const reply = completion.choices[0].message.content;

    // Generar página SEO si aplica
    if (shouldGenerateSeoPage(lastUserMsg)) {
      const slug = slugify(lastUserMsg);
      if (slug && !seoPages[slug]) {
        seoPages[slug] = {
          slug, question: lastUserMsg, answer: reply,
          date: new Date().toISOString(), views: 0
        };
        saveSeoPages();
      }
    }

    res.json({ reply, seoSlug: shouldGenerateSeoPage(lastUserMsg) ? slugify(lastUserMsg) : null });

  } catch (err) {
    console.error('OpenAI error:', err.message);
    // Fallback Anthropic
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 3000, system: getSystemPrompt(), messages })
      });
      const data = await response.json();
      res.json({ reply: data.content[0].text });
    } catch (e2) {
      res.status(500).json({ error: 'Error al conectar con la IA.' });
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

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '4.1', seoPages: Object.keys(seoPages).length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CatolicosGPT v4.1 · Puerto ${PORT}`));
