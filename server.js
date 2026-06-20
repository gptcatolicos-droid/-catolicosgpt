// ════════════════════════════════════════════════════════════════════════════
// CATÓLICOSGPT V77 — SERVIDOR CENTRAL MULTI-MÓDULO
// Integración con Magisterium API, Gemini @google/genai, e Infografías
// ════════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const express      = require('express');
const fs           = require('fs');
const path         = require('path');
const cors         = require('cors');
const jwt          = require('jsonwebtoken');

// Importar todos los subsistemas creados
const auth          = require('./auth-module');
const infografias  = require('./infografias-module');
const liturgia      = require('./liturgia-cache');
const misas         = require('./misas-module');
const blog          = require('./blog-module');
const podcast       = require('./podcast-module');
const videos        = require('./videos-module');
const recursos      = require('./recursos-module');
const seo           = require('./seo-module');
const seoTopics     = require('./seo-topics');
const biblia        = require('./biblia-module');
const { GoogleGenAI } = require('@google/genai');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Servidor de medios y estáticos locales
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}

// ── Iniciar e-liturgia de fondo ──
liturgia.init().then(() => {
  console.log('[Liturgia] Cache del día inicializado correctamente.');
}).catch(err => {
  console.error('[Liturgia] Error inicializando cache:', err.message);
});

// ── Cliente Gemini Central ──
let ai = null;
function getAi() {
  if (!ai && process.env.GEMINI_API_KEY) {
    try {
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      console.log('[Gemini] Cliente inicializado correctamente.');
    } catch(e) {
      console.error('[Gemini] Error instanciando cliente:', e.message);
    }
  }
  return ai;
}
getAi(); // Inicializar si existe en el arranque

// ── Helper: Cargar cookie de Auth en SSR ──
function getAuthedUser(req) {
  let token = null;
  if (req.query && req.query.cgpt_token) {
    token = req.query.cgpt_token;
  }
  if (!token && req.headers.cookie) {
    const cookies = Object.fromEntries(req.headers.cookie.split('; ').map(c => {
      const idx = c.indexOf('=');
      return idx >= 0 ? [c.slice(0, idx), c.slice(idx + 1)] : [c, ''];
    }));
    token = cookies.cgpt_token;
  }
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts[1]) token = parts[1];
  }
  // Fallback para sesiones de sandbox en previsualización de iframe
  if (!token && global.sandboxSession) {
    token = global.sandboxSession.token;
  }
  if (!token) return null;
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'cgpt-jwt-secret-2026-change-in-production';
    const decoded = jwt.verify(token, JWT_SECRET);
    return auth.getUserById(decoded.id);
  } catch(e) {
    return null;
  }
}

const mesesEnEspanol = {
  '01': 'Enero',
  '02': 'Febrero',
  '03': 'Marzo',
  '04': 'Abril',
  '05': 'Mayo',
  '06': 'Junio',
  '07': 'Julio',
  '08': 'Agosto',
  '09': 'Septiembre',
  '10': 'Octubre',
  '11': 'Noviembre',
  '12': 'Diciembre'
};

let santosCache = {};

async function getSantoDelDiaDetail(dia, mesIndex) {
  const aiInstance = getAi();
  const mesNombre = mesesEnEspanol[mesIndex] || 'Junio';
  const cacheKey = `${mesNombre}-${dia}`;
  if (santosCache[cacheKey]) {
    return santosCache[cacheKey];
  }

  // Cargar de base de datos santos.json local primero
  let localSanto = null;
  try {
    const santosData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'santos.json'), 'utf-8'));
    const arraySants = santosData.santos_por_mes?.[mesNombre.toLowerCase()] || [];
    localSanto = arraySants.find(s => s.dia === parseInt(dia)) || null;
  } catch (e) {
    console.error('[Santos] Error al leer archivo local de santos:', e.message);
  }

  let santoObj = {
    dia: dia,
    mes: mesNombre,
    nombre: localSanto ? localSanto.nombre : 'Santo Celebrado Hoy',
    tipo: localSanto ? localSanto.tipo : 'Memoria Litúrgica',
    lema: '"Mi alma glorifica al Señor."',
    biografia: localSanto ? localSanto.descripcion : 'Biografía doctrinal e histórica en preparación.',
    patronato: 'Fieles y devotos locales',
    virtudes: ['Fe', 'Esperanza', 'Caridad'],
    oracion: 'Señor Jesús, concédenos la gracia de imitar las virtudes de tus santos...',
    otrosSantos: ['San Pedro', 'San Juan', 'San Pablo']
  };

  if (aiInstance) {
    try {
      const prompt = `Actúa como un teólogo, hagiógrafo de la Iglesia Católica y redactor jefe de CatólicosGPT.
Queremos una biografía de alta fidelidad, profunda, hermosa y doctrinal sobre el santo/fiesta celebrado el día ${dia} de ${mesNombre} en el Calendario Litúrgico Católico o Martirologio Romano.
(Por ejemplo, si es 13 de junio, es San Antonio de Padua; si es 19 de junio es San Romualdo; si es 21 de junio es San Luis Gonzaga, etc.).

Devuelve exclusivamente un JSON válido y legible en español con la estructura exacta de abajo, sin bloques de código markdown ni \`\`\`json:
{
  "nombre": "Nombre del Santo Principal para el día, p. ej. 'San Luis Gonzaga, Religioso Jesuita'",
  "tipo": "Grado litúrgico, p. ej. 'Memoria Obligatoria' o 'Solemnidad' o 'Fiesta'",
  "lema": "Una jaculatoria tradicional, oración corta de intercesión o frase profunda que exprese su espíritu o dicho escrito",
  "biografia": "Una narración biográfica y devocional detallada, profunda y exquisitamente redactada, de un mínimo de 450 palabras, estructurada intelectualmente. Debe explicar su origen familiar, su conversión o vocación mística/religiosa, las pruebas históricas que superó, su amor por la Eucaristía/Prójimo, los milagros o escritos teológicos por los que es recordado, y una profunda analogía de cómo su ejemplo brilla y nos enseña en este año 2026. Emplea saltos de línea para estructurar la lectura en párrafos limpios.",
  "patronato": "De quién o de qué grupos/causas es patrono, p. ej. 'Santo Patrono de la juventud y de los estudiantes'",
  "virtudes": ["Lista de 3 a 4 virtudes espirituales más sobresalientes del santo", "Virtud 2", "Virtud 3"],
  "oracion": "Una oración tradicional hermosa y devota (en español) para pedir la intercesión de este santo y rogar a Dios el don de perseverar en la fe",
  "otrosSantos": ["Otro santo de hoy o de esta semana", "San Gervasio y San Protasio", "Santa Juliana de Falconieri"]
}`;

      const response = await aiInstance.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      let text = response.text || '';
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(text);
      if (parsed.nombre && parsed.biografia) {
        santoObj = { ...santoObj, ...parsed };
      }
    } catch (e) {
      console.error('[Gemini] Error al generar santo con IA:', e.message);
    }
  }

  santosCache[cacheKey] = santoObj;
  return santoObj;
}

// ════════════════════════════════════════════════════════════════════════════
// VISTAS HTML SSR (Branding "Magnifica Humanitas": Cream, Gold, Maroon, Espresso)
// ════════════════════════════════════════════════════════════════════════════

function renderPage(title, contentHtml, req, metaTags = {}) {
  const user = getAuthedUser(req);
  const activePlan = user ? user.plan : 'free';
  const customNombre = user ? (user.customNombre || user.nombre) : 'Católico';

  const defaultMetaTags = {
    description: "CatólicosGPT es la Inteligencia Artificial Católica #1 en español con fidelidad del 100% al Magisterio. Explora la Biblia de Navarra, el Catecismo, oraciones, y genera infografías pastorales interactivas.",
    keywords: "ia catolica, inteligencia artificial catolica, catolicosgpt, catolicos gpt, magisterio de la iglesia, biblia de navarra, catecismo, oraciones catolicas, papa leon xiv, apologetica catolica, oracion del dia, evangelio del dia",
    canonical: req.originalUrl || '/'
  };

  const M = { ...defaultMetaTags, ...metaTags };
  const APP_URL = process.env.APP_URL || 'https://www.catolicosgpt.com';

  return `<!DOCTYPE html>
<html lang="es" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} — CatólicosGPT | La IA Católica #1 en Español</title>
  
  <meta name="description" content="${M.description}">
  <meta name="keywords" content="${M.keywords}">
  <link rel="canonical" href="${APP_URL}${M.canonical}">
  
  <!-- Google Search Console Ownership Verification -->
  <meta name="google-site-verification" content="google5d1cd7dcadcb13f0" />
  <meta name="google-site-verification" content="f8iKbyO_Yw0m8F9_8oNOfT_xQorD5s6N8B0e_V3030" />
  
  <!-- Global site tag (gtag.js) - Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-H8CB7M80S3"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-H8CB7M80S3', {
      'page_path': window.location.pathname,
      'send_page_view': true
    });
  </script>
  
  <!-- Open Graph -->
  <meta property="og:title" content="${title} — CatólicosGPT | La IA Católica #1 en Español">
  <meta property="og:description" content="${M.description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${APP_URL}${M.canonical}">
  <meta property="og:image" content="${M.image || 'https://res.cloudinary.com/df9vdt2da/image/upload/v1714498302/catolicosgpt_hero.png'}">
  <meta property="og:site_name" content="CatólicosGPT">
  
  <!-- Google Fonts & Tailwind -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Domine:wght@400;500;600;700&family=Cinzel:wght@500;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Domine:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    
    :root {
      --cream: #F9F6F0;
      --cream-2: #F1ECE3;
      --gold: #BC8A36;
      --gold-deep: #9F7124;
      --gold-light: #F2E3C9;
      --maroon: #5E1B22;
      --maroon-dark: #320E12;
      --espresso: #251B15;
      --cafe-marron: #3E2723;
      --ink: #2D241E;
      --ink-2: #5A4E46;
      --border: #E6DFD4;
      --font-sans: "Domine", "Inter", system-ui, -apple-system, sans-serif;
      --font-display: "Domine", "Cinzel", Georgia, serif;
      --font-serif: "Domine", "Cormorant Garamond", Georgia, serif;
      --font-mono: "JetBrains Mono", monospace;
      
      --shadow-sm: 0 1px 3px rgba(37, 27, 21, 0.05);
      --shadow-md: 0 4px 12px rgba(37, 27, 21, 0.08);
      --shadow-lg: 0 12px 24px rgba(37, 27, 21, 0.12);
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body, select, input, button, textarea, a, p, h1, h2, h3, h4, h5, h6, span, label, div:not(.font-mono):not(code):not(pre), button *, a * {
      font-family: "Domine", serif !important;
    }

    /* Títulos y Subtítulos en Bold y Color Vinotinto (Maroon) */
    h1, h2, h3, h4, h5, h6, .font-display, .font-serif, h1 *, h2 *, h3 *, h4 *, h5 *, h6 * {
      font-weight: 700 !important;
      color: var(--maroon) !important;
    }

    /* Frases importantes (bolds, strongs, etc.) en color Vinotinto (Maroon) */
    strong, b, .font-bold {
      font-weight: 700 !important;
      color: var(--maroon) !important;
    }

    /* Exclusiones para botones, textos blancos o links que no deben forzarse a maroon */
    button strong, button b, button *, a.bg-maroon *, .bg-maroon *, .text-white, .text-white * {
      color: inherit !important;
    }
    
    /* Garantizar que sobre los botones y fondos vinotinto la fuente, negritas e iconos sean siempre blanco puro */
    .bg-maroon,
    .bg-maroon *,
    a.bg-maroon,
    a.bg-maroon *,
    button.bg-maroon,
    button.bg-maroon *,
    .text-white,
    .text-white *,
    .bg-maroon strong,
    .bg-maroon b,
    .bg-maroon .font-bold,
    .text-white strong,
    .text-white b,
    .text-white .font-bold {
      color: #ffffff !important;
    }

    .text-gold, .text-gold * { color: var(--gold) !important; }
    .text-gold-deep, .text-gold-deep * { color: var(--gold-deep) !important; }
    .text-maroon, .text-maroon * { color: var(--maroon) !important; }

    body {
      background-color: var(--cream);
      color: var(--ink);
      font-family: var(--font-sans);
      line-height: 1.5;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    
    a { color: var(--maroon); text-decoration: none; transition: color 0.2s; }
    a:hover { color: var(--gold-deep); }
    
    /* Double Borders */
    .sacred-border {
      border: 3px double var(--gold);
    }
    
    /* Sidebar / Menu */
    .nav-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 8px;
      font-weight: 500;
      color: var(--ink);
      font-size: 13px;
      transition: all 0.2s;
    }
    @media (min-width: 1024px) {
      .nav-link {
        font-size: 11px !important;
        padding: 6px 10px !important;
        gap: 8px !important;
      }
      .nav-link svg {
        width: 15px !important;
        height: 15px !important;
      }
    }
    .nav-link:hover, .nav-link.active {
      background-color: var(--gold-light);
      color: var(--maroon);
    }
    .nav-link svg {
      width: 17px;
      height: 17px;
      color: var(--ink-2);
    }
    .nav-link:hover svg, .nav-link.active svg {
      color: var(--maroon);
    }
    
    /* SEO-optimized responsive grid cards */
    .seo-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      box-shadow: var(--shadow-sm);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .seo-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    
    /* Floating Chat Frame styles */
    .chat-bubble {
      max-width: 85%;
      margin-bottom: 12px;
      padding: 14px 18px;
      border-radius: 14px;
      font-size: 15px;
      line-height: 1.6;
    }
    .chat-bubble.bot {
      background-color: white;
      color: var(--ink) !important;
      border: 1px solid var(--border);
      border-top-left-radius: 2px;
      align-self: flex-start;
    }
    .chat-bubble.bot table {
      display: block;
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 0.9em;
    }
    .chat-bubble.bot th, .chat-bubble.bot td {
      border: 1px solid var(--border);
      padding: 8px 12px;
      text-align: left;
    }
    .chat-bubble.bot th {
      background-color: var(--cream2);
      font-weight: 700;
      color: var(--maroon);
    }
    .chat-bubble.bot ul, .chat-bubble.bot ol {
      margin-left: 20px;
      margin-bottom: 12px;
    }
    .chat-bubble.bot ul { list-style-type: disc; }
    .chat-bubble.bot ol { list-style-type: decimal; }
    .chat-bubble.bot h3, .chat-bubble.bot h4 {
      font-family: var(--font-display);
      color: var(--maroon) !important;
      margin-top: 14px;
      margin-bottom: 6px;
      font-weight: 700 !important;
    }
    .chat-bubble.bot p {
      margin-bottom: 8px;
    }
    .chat-bubble.bot code {
      font-family: var(--font-mono);
      background-color: var(--cream2);
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 0.85em;
    }
    .chat-bubble.bot pre {
      background-color: var(--espresso);
      color: white;
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0;
    }
    .chat-bubble.bot pre code {
      background-color: transparent;
      color: inherit;
      padding: 0;
    }
    .chat-bubble.bot blockquote {
      border-left: 4px solid var(--gold);
      padding-left: 14px;
      color: var(--ink-2);
      font-style: italic;
      margin: 12px 10px;
    }
    .chat-bubble.user {
      background-color: var(--gold-light);
      color: var(--maroon) !important;
      border: 1px solid var(--gold);
      border-top-right-radius: 2px;
      align-self: flex-end;
    }
    
    /* Custom Scrollbars */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--cream); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--gold); }
    
    /* Responsive details */
    @media (max-width: 1024px) {
      .sidebar-desktop { display: none !important; }
    }
    @media (min-width: 1025px) {
      .navigation-mobile-bar { display: none !important; }
      .mobile-menu-drawer { display: none !important; }
    }
  </style>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            cream: '#F9F6F0',
            cream2: '#F1ECE3',
            gold: '#BC8A36',
            goldDeep: '#9F7124',
            maroon: '#5E1B22',
            maroonDark: '#320E12',
            espresso: '#251B15',
            ink: '#2D241E',
            ink2: '#5A4E46'
          }
        }
      }
    }
  </script>
</head>
<body class="bg-cream h-full flex flex-col">

  <!-- CAPA DE MÓVIL: BOTÓN Y LOGOTIPO DE CABECERA -->
  <header class="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-border sticky top-0 z-40 shadow-sm animate-fade-in">
    <div class="flex items-center gap-2">
      <button onclick="toggleMobileMenu()" class="p-1 text-ink rounded hover:bg-cream2 duration-200">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      </button>
      <a href="/" class="flex items-center gap-1.5 hover:opacity-90 transition">
        <!-- SVG Emblem compact -->
        <svg class="w-7 h-7 flex-shrink-0" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="38" stroke="#BC8A36" stroke-width="3" fill="none"/>
          <path d="M40 25 V75 M30 38 H55" stroke="#BC8A36" stroke-width="4.5" stroke-linecap="round"/>
          <path d="M52 38 Q65 38 65 50 T52 65" stroke="#BC8A36" stroke-width="2.2" fill="none"/>
          <circle cx="63" cy="42" r="3" fill="#BC8A36"/>
          <circle cx="53" cy="54" r="2.5" fill="#BC8A36"/>
          <!-- Double Arches (Bible base) -->
          <path d="M50 80 Q38 74 25 78 V83 Q38 79 50 85 Q62 79 75 83 V78 Q62 74 50 80 Z" fill="#BC8A36"/>
        </svg>
        <span class="font-display font-bold text-base text-maroon tracking-wide">Católicos<span class="text-gold italic font-serif">GPT</span></span>
      </a>
    </div>
    <div class="flex items-center gap-2">
      ${user ? `
        <span class="text-xs bg-gold-light text-maroon px-2 py-1 rounded font-medium border border-gold/20 uppercase tracking-widest">${activePlan}</span>
        <a href="/logout" class="p-1 rounded text-red-700 hover:bg-red-50" title="Cerrar sesión">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
        </a>
      ` : `
        <a href="/login" class="text-xs font-semibold bg-maroon text-white px-3 py-1.5 rounded-full hover:bg-gold-deep duration-200">Entrar</a>
      `}
    </div>
  </header>

  <!-- CONTENEDOR CENTRAL: SIDEBAR DESKTOP + MAIN PAGE -->
  <div class="flex flex-1 h-full overflow-hidden">
    
    <!-- SIDEBAR DESKTOP -->
    <aside class="sidebar-desktop w-64 border-r border-[#E6DFD4] bg-white flex flex-col justify-between flex-shrink-0 z-30 shadow-sm">
      <div class="p-4 flex flex-col gap-4 flex-1 overflow-hidden">
        <div class="flex flex-col gap-2 items-center px-2 border-b pb-4 mt-1">
          <a href="/" class="flex flex-col items-center gap-1 px-1 text-center group hover:opacity-95 duration-200">
            <div class="flex items-center gap-2">
              <!-- High-Fidelity SVG Emblem matching attached design -->
              <svg class="w-10 h-10 flex-shrink-0" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Golden Circle Outer -->
                <circle cx="50" cy="50" r="38" stroke="#BC8A36" stroke-width="2.5" fill="none"/>
                <!-- Latin Cross -->
                <path d="M40 25 V75 M30 38 H55" stroke="#BC8A36" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- Swooshes & elegant dots on the right (Abstract liturgical figures or host curves) -->
                <path d="M52 38 Q65 38 65 50 T52 65" stroke="#BC8A36" stroke-width="2" stroke-linecap="round" fill="none"/>
                <path d="M40 48 Q70 48 60 62" stroke="#BC8A36" stroke-width="2.2" stroke-linecap="round" fill="none"/>
                <!-- Liturgical points -->
                <circle cx="63" cy="42" r="2.5" fill="#BC8A36"/>
                <circle cx="53" cy="54" r="2.5" fill="#BC8A36"/>
                <circle cx="63" cy="51" r="1.5" fill="#BC8A36"/>
                <!-- Open book arch at base of cross -->
                <path d="M50 80 Q38 74 25 78 V83 Q38 79 50 85 Q62 79 75 83 V78 Q62 74 50 80 Z" fill="#BC8A36" stroke="#BC8A36" stroke-width="1.2"/>
                <line x1="50" y1="80" x2="50" y2="85" stroke="#FAF6F0" stroke-width="1"/>
              </svg>
              <!-- Brand Title -->
              <div class="flex flex-col text-left">
                <span class="font-display font-black text-lg tracking-wider text-espresso leading-none">Católicos<span class="text-gold italic font-serif">GPT</span></span>
                <span class="text-[8px] font-mono tracking-[0.2em] text-ink2 uppercase mt-0.5">V77 • Magisterio</span>
              </div>
            </div>
            
            <!-- Delicate golden liturgical divider (─── ✝ ───) -->
            <div class="flex items-center gap-2 w-full max-w-[170px] opacity-90 mt-1 select-none">
              <div class="h-[1px] flex-1 bg-gradient-to-r from-transparent to-gold/30"></div>
              <span class="text-gold text-[9px] pb-0.5">✝</span>
              <div class="h-[1px] flex-1 bg-gradient-to-l from-transparent to-gold/30"></div>
            </div>
          </a>
          <span class="text-[10px] text-ink2 font-serif italic text-center leading-relaxed">In illo uno unum</span>
        </div>
        
        <!-- PLANIFICACIÓN DEL MENÚ DE NAVEGACIÓN -->
        <div class="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
          <!-- CATEGORÍA: LITURGIA DE HOY -->
          <div class="flex flex-col gap-1">
            <span class="text-[10px] text-ink2 uppercase tracking-widest font-bold px-3 py-1 font-mono">Liturgia de hoy</span>
            <nav class="flex flex-col gap-1">
              <a href="/liturgia-de-las-horas" class="nav-link ${req.originalUrl==='/liturgia-de-las-horas'?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                Lecturas del día
              </a>
              <a href="/santo-del-dia" class="nav-link ${req.originalUrl==='/santo-del-dia'?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                Santo del día
              </a>
              <a href="/oracion-del-dia" class="nav-link ${req.originalUrl==='/oracion-del-dia'?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                Oración del día
              </a>
            </nav>
          </div>

          <!-- CATEGORÍA: LITURGIA DE LAS HORAS -->
          <div class="flex flex-col gap-1">
            <span class="text-[10px] text-ink2 uppercase tracking-widest font-bold px-3 py-1 font-mono">Liturgia de las horas</span>
            <nav class="flex flex-col gap-1">
              <a href="/?query=laudes" class="nav-link">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                Laudes (mañana)
              </a>
              <a href="/?query=visperas" class="nav-link">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sunset"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/><path d="M22 22H2"/><path d="M16 16H8a4 4 0 0 0-8 0"/></svg>
                Vísperas (tarde)
              </a>
              <a href="/?query=completas" class="nav-link">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon-star"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>
                Completas (noche)
              </a>
            </nav>
          </div>

          <!-- CATEGORÍA: HERRAMIENTAS -->
          <div class="flex flex-col gap-1">
            <span class="text-[10px] text-ink2 uppercase tracking-widest font-bold px-3 py-1 font-mono">Herramientas</span>
            <nav class="flex flex-col gap-1">
              <a href="/infografias" class="nav-link ${req.originalUrl.startsWith('/infografias')?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                Infografías
              </a>
              <a href="/videos" class="nav-link ${req.originalUrl.startsWith('/videos')?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 11.2"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
                Videos
              </a>
              <a href="/podcasts" class="nav-link ${req.originalUrl.startsWith('/podcasts')?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rss"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                Podcast
              </a>
              <a href="/blog" class="nav-link ${req.originalUrl.startsWith('/blog')?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scroll"><path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"/></svg>
                Blog
              </a>
              <a href="/misas" class="nav-link ${req.originalUrl.startsWith('/misas')?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tv"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                Horarios de Misa
              </a>
              <a href="/planes" class="nav-link ${req.originalUrl.startsWith('/planes')?'active':''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                Planes
              </a>
            </nav>
          </div>

          <!-- CATEGORÍA: CONVERSACIONES -->
          <div class="flex flex-col gap-1">
            <span class="text-[10px] text-ink2 uppercase tracking-widest font-bold px-3 py-1 font-mono">Conversaciones</span>
            <nav class="flex flex-col gap-1">
              <span class="text-xs text-ink2 italic px-3 py-1 flex items-center gap-2">
                Sin conversaciones aún
              </span>
            </nav>
          </div>
        </div>
      </div>
      
      <!-- FOOTER USUARIO / ADMIN EN SIDEBAR -->
      <div class="p-4 border-t border-border bg-cream2/30 flex flex-col gap-3">
        ${user ? `
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="font-semibold text-sm text-espresso truncate max-w-[130px]">${customNombre}</span>
              <span class="text-[10px] text-ink2 uppercase tracking-wider font-mono">${activePlan} plan</span>
            </div>
            <a href="/logout" class="p-1 rounded text-red-800 hover:bg-cream2 duration-200" title="Cerrar sesión">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            </a>
          </div>
          ${user.plan === 'admin' ? `
            <a href="/admin" class="w-full text-center text-xs bg-gold hover:bg-gold-deep text-white py-1.5 rounded font-bold transition flex items-center justify-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l-.43.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              Consola Admin
            </a>
          ` : ''}
        ` : `
          <div class="flex flex-col gap-2">
            <a href="/login" class="w-full text-center text-xs border border-maroon hover:bg-maroon hover:text-white text-maroon py-2 rounded font-semibold transition uppercase tracking-wider">Ingresar</a>
            <a href="/register" class="w-full text-center text-xs bg-maroon hover:bg-gold text-white py-2 rounded font-semibold transition uppercase tracking-wider">Crear Cuenta</a>
          </div>
        `}
      </div>
    </aside>

    <!-- MOBILE DRAWER MENU (RESPONSIVE DE CELLULAR) -->
    <div id="mobile-drawer" class="fixed inset-0 bg-black/50 z-50 transition-opacity duration-300 pointer-events-none opacity-0">
      <div id="mobile-drawer-content" class="w-72 max-w-xs bg-white h-full shadow-2xl flex flex-col justify-between transition-transform duration-300 transform -translate-x-full">
        <div class="p-4 flex flex-col gap-4 flex-1 overflow-hidden">
          <div class="flex items-center justify-between pb-2 border-b">
            <div class="flex items-center gap-1.5 select-none">
              <!-- SVG Emblem compact -->
              <svg class="w-7 h-7 flex-shrink-0" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="38" stroke="#BC8A36" stroke-width="3" fill="none"/>
                <path d="M40 25 V75 M30 38 H55" stroke="#BC8A36" stroke-width="4.5" stroke-linecap="round"/>
                <path d="M52 38 Q65 38 65 50 T52 65" stroke="#BC8A36" stroke-width="2.2" fill="none"/>
                <circle cx="63" cy="42" r="3" fill="#BC8A36"/>
                <circle cx="53" cy="54" r="2.5" fill="#BC8A36"/>
                <path d="M50 80 Q38 74 25 78 V83 Q38 79 50 85 Q62 79 75 83 V78 Q62 74 50 80 Z" fill="#BC8A36"/>
              </svg>
              <span class="font-display font-medium text-base text-maroon tracking-wider">Católicos<span class="text-gold italic font-serif">GPT</span></span>
            </div>
            <button onclick="toggleMobileMenu()" class="p-1 rounded hover:bg-cream2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
            </button>
          </div>
          
          <div class="flex-1 overflow-y-auto flex flex-col gap-4">
            <!-- CATEGORÍA: LITURGIA DE HOY -->
            <div class="flex flex-col gap-1">
              <span class="text-[10px] text-ink2 uppercase tracking-widest font-bold px-3 py-1 font-mono">Liturgia de hoy</span>
              <nav class="flex flex-col gap-1">
                <a href="/liturgia-de-las-horas" onclick="toggleMobileMenu()" class="nav-link">Lecturas del día</a>
                <a href="/santo-del-dia" onclick="toggleMobileMenu()" class="nav-link">Santo de hoy</a>
                <a href="/oracion-del-dia" onclick="toggleMobileMenu()" class="nav-link">Oración del día</a>
              </nav>
            </div>

            <!-- CATEGORÍA: LITURGIA DE LAS HORAS -->
            <div class="flex flex-col gap-1">
              <span class="text-[10px] text-ink2 uppercase tracking-widest font-bold px-3 py-1 font-mono">Liturgia de las horas</span>
              <nav class="flex flex-col gap-1">
                <a href="/?query=laudes" onclick="toggleMobileMenu()" class="nav-link">Laudes (mañana)</a>
                <a href="/?query=visperas" onclick="toggleMobileMenu()" class="nav-link">Vísperas (tarde)</a>
                <a href="/?query=completas" onclick="toggleMobileMenu()" class="nav-link">Completas (noche)</a>
              </nav>
            </div>

            <!-- CATEGORÍA: HERRAMIENTAS -->
            <div class="flex flex-col gap-1">
              <span class="text-[10px] text-ink2 uppercase tracking-widest font-bold px-3 py-1 font-mono">Herramientas</span>
              <nav class="flex flex-col gap-1">
                <a href="/infografias" onclick="toggleMobileMenu()" class="nav-link">Infografías</a>
                <a href="/videos" onclick="toggleMobileMenu()" class="nav-link">Videos</a>
                <a href="/podcasts" onclick="toggleMobileMenu()" class="nav-link">Podcast</a>
                <a href="/blog" onclick="toggleMobileMenu()" class="nav-link">Blog</a>
                <a href="/misas" onclick="toggleMobileMenu()" class="nav-link">Horarios de Misa</a>
                <a href="/planes" onclick="toggleMobileMenu()" class="nav-link">Planes</a>
              </nav>
            </div>
          </div>
        </div>
        <div class="p-4 border-t border-border bg-cream2/20 flex flex-col gap-2">
          ${user ? `
            <div class="flex items-center justify-between mb-2">
              <div class="flex flex-col">
                <span class="font-semibold text-sm text-espresso">${user.nombre}</span>
                <span class="text-[10px] text-ink2 uppercase tracking-widest font-mono">${user.plan}</span>
              </div>
              <a href="/logout" class="p-1 text-red-800" title="Cerrar sesión">Salir</a>
            </div>
          ` : `
            <a href="/login" class="w-full text-center text-xs border border-maroon text-maroon py-2 rounded font-semibold uppercase tracking-wider">Ingresar</a>
            <a href="/register" class="w-full text-center text-xs bg-maroon text-white py-2 rounded font-semibold uppercase tracking-wider">Crear Cuenta</a>
          `}
        </div>
      </div>
    </div>

    <!-- MAIN VIEWPORT -->
    <main class="flex-1 flex flex-col h-full overflow-y-auto">
      ${contentHtml}
    </main>

  </div>

  <script>
    let drawerOpen = false;
    const drawer = document.getElementById('mobile-drawer');
    const drawerContent = document.getElementById('mobile-drawer-content');
    
    function toggleMobileMenu() {
      drawerOpen = !drawerOpen;
      if (drawerOpen) {
        drawer.classList.remove('pointer-events-none', 'opacity-0');
        drawer.classList.add('opacity-100');
        drawerContent.classList.remove('-translate-x-full');
        drawerContent.classList.add('translate-x-0');
      } else {
        drawer.classList.add('pointer-events-none', 'opacity-0');
        drawer.classList.remove('opacity-100');
        drawerContent.classList.add('-translate-x-full');
        drawerContent.classList.remove('translate-x-0');
      }
    }
  </script>
</body>
</html>
`;
}

// ════════════════════════════════════════════════════════════════════════════
// RUTAS DE LA APP — VISTA PRINCIPAL (ASISTENTE CHAT)
// ════════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  const lit = liturgia.get('lecturas');
  const dSanto = liturgia.get('santo_hoy');

  // HTML principal del Chat Centrado (al estilo ChatGPT / Gemini)
  const html = `
    <div class="max-w-4xl mx-auto w-full px-4 py-4 sm:py-6 flex flex-col h-[calc(100vh-80px)] overflow-hidden">
      
      <!-- ELEMENTO DE CHAT PRINCIPAL -->
      <div class="flex-1 flex flex-col bg-white border border-[#E6DFD4] rounded-2xl shadow-sm overflow-hidden h-full">
        
        <!-- CHAT HEADER -->
        <div class="px-5 py-3 border-b border-border bg-cream2/20 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gold font-semibold flex items-center gap-1.5 uppercase font-mono tracking-wider">
              <span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              CatolicosGPT IA
            </span>
          </div>
          <button onclick="clearChat()" class="text-xs text-ink2 hover:text-maroon flex items-center gap-2 font-semibold transition" title="Limpiar conversación">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            <span class="hidden sm:inline">Vaciar Conversación</span>
            <span class="inline sm:hidden">Vaciar</span>
          </button>
        </div>
        
        <!-- CHAT BOX MESSAGES -->
        <div id="chat-box" class="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-[#FAF9F5]">
          <!-- PANTALLA DE BIENVENIDA -->
          <div id="welcome-screen" class="flex-1 flex flex-col items-center justify-center text-center py-6 max-w-2xl mx-auto gap-6 my-auto">
            <div class="h-16 w-16 border-2 border-gold/35 rounded-3xl p-4 bg-white text-gold text-2xl shadow-sm flex items-center justify-center font-bold">
              ✝
            </div>
            <div class="flex flex-col gap-1.5 px-4">
              <h1 class="font-display font-medium text-2xl sm:text-3xl text-espresso tracking-wide">
                ¿En qué puedo ayudarte hoy, <span class="italic text-gold font-serif font-normal">hermano</span>?
              </h1>
              <p class="font-serif text-ink2 text-sm sm:text-base italic">
                Consulta sobre apologética, teología, santos, liturgia o la encíclica "Magnifica Humanitas".
              </p>
            </div>
            
            <!-- ATAJOS RAPIDOS -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full mt-4 px-4 max-w-xl">
              <button onclick="enviarAtajo('¿Qué es CatólicosGPT y de dónde obtiene las respuestas?')" class="text-left p-3.5 bg-white border border-border rounded-xl hover:bg-cream hover:border-gold/30 text-xs text-ink transition shadow-sm font-sans flex flex-col gap-1">
                <span class="font-bold text-maroon">¿Qué es CatólicosGPT?</span>
                <span class="text-ink2 text-[10px]">Origen de datos y fidelidad doctrinal</span>
              </button>
              <button onclick="enviarAtajo('Explícanos la encíclica Magnifica Humanitas sobre la IA')" class="text-left p-3.5 bg-white border border-border rounded-xl hover:bg-cream hover:border-gold/30 text-xs text-ink transition shadow-sm font-sans flex flex-col gap-1">
                <span class="font-bold text-maroon">La encíclica del Papa León XIV</span>
                <span class="text-ink2 text-[10px]">Ética, bioética cristiana y transhumanismo</span>
              </button>
              <button onclick="enviarAtajo('¿Cuáles son los sacramentos de la Iglesia Católica?')" class="text-left p-3.5 bg-white border border-border rounded-xl hover:bg-cream hover:border-gold/30 text-xs text-ink transition shadow-sm font-sans flex flex-col gap-1">
                <span class="font-bold text-maroon">Doctrina Católica</span>
                <span class="text-ink2 text-[10px]">Los 7 sacramentos y dogmas</span>
              </button>
              <button onclick="enviarAtajo('Muéstrame la Oración del Padre Nuestro en Español y Latín')" class="text-left p-3.5 bg-white border border-border rounded-xl hover:bg-cream hover:border-gold/30 text-xs text-ink transition shadow-sm font-sans flex flex-col gap-1">
                <span class="font-bold text-maroon">Oraciones principales</span>
                <span class="text-ink2 text-[10px]">Padrenuestro, Avemaría, Salve y Credo</span>
              </button>
            </div>
          </div>
        </div>
        
        <!-- CHAT INPUT WRAP -->
        <div class="p-4 border-t border-border bg-white shadow-inner">
          <form id="chat-form" onsubmit="enviarMensaje(event)" class="max-w-3xl mx-auto flex gap-2 items-center">
            <input type="text" id="chat-input" placeholder="Pregunta sobre fe, liturgia, moral cristiana..." required class="flex-1 border border-border rounded-full px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent bg-[#FAF9F5]/40" autocomplete="off">
            <button type="submit" class="bg-maroon hover:bg-gold text-white p-3.5 rounded-full transition duration-300 shadow-md transform hover:scale-105 active:scale-95 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send-horizontal"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>
            </button>
          </form>
          <div class="text-center text-[10px] text-ink2 mt-2 select-none italic font-serif">
            CatólicosGPT • Conforme al Magisterio constante de la Iglesia • Puede contener imprecisiones
          </div>
        </div>
        
      </div>
    </div>
    
    <script>
      const chatBox = document.getElementById('chat-box');
      const chatInput = document.getElementById('chat-input');
      
      function enviarAtajo(texto) {
        chatInput.value = texto;
        document.getElementById('chat-form').dispatchEvent(new Event('submit'));
      }
      
      function appendMessage(sender, text, isHtml = false) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble ' + (sender === 'bot' ? 'bot bot-content' : 'user') + ' shadow-sm';
        
        if (sender === 'bot') {
          try {
            bubble.innerHTML = window.marked ? window.marked.parse(text) : text;
          } catch(e) {
            bubble.innerHTML = text;
          }
        } else if (isHtml) {
          bubble.innerHTML = text;
        } else {
          bubble.textContent = text;
        }
        
        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;
      }
      
      function clearChat() {
        chatBox.querySelectorAll('.chat-bubble').forEach(b => b.remove());
        const welcome = document.getElementById('welcome-screen');
        if (welcome) welcome.classList.remove('hidden');
      }
      
      async function enviarMensaje(e) {
        if(e) e.preventDefault();
        const text = chatInput.value.trim();
        if(!text) return;
        
        // Ocultar la pantalla de bienvenida si existe
        const welcome = document.getElementById('welcome-screen');
        if (welcome) welcome.classList.add('hidden');
        
        appendMessage('user', text);
        chatInput.value = '';
        
        // Agregar burbuja de cargando...
        const loading = document.createElement('div');
        loading.className = 'chat-bubble bot italic text-ink2 flex items-center gap-2';
        loading.id = 'loading-indicator';
        loading.innerHTML = 'Consultando las Sagradas Escrituras y el Magisterio <span class="animate-pulse">...</span>';
        chatBox.appendChild(loading);
        chatBox.scrollTop = chatBox.scrollHeight;
        
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: text })
          });
          
          document.getElementById('loading-indicator')?.remove();
          
          if (!res.ok) {
            appendMessage('bot', '⚠️ Error: No se pudo obtener respuesta del servidor pastoral.');
            return;
          }
          
          // Crear la burbuja del bot vacía
          const bubble = document.createElement('div');
          bubble.className = 'chat-bubble bot bot-content shadow-sm';
          chatBox.appendChild(bubble);
          
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullResponse = '';
          
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;
            try {
              bubble.innerHTML = window.marked ? window.marked.parse(fullResponse) : fullResponse;
            } catch(e) {
              bubble.innerHTML = fullResponse;
            }
            chatBox.scrollTop = chatBox.scrollHeight;
          }
        } catch(err) {
          document.getElementById('loading-indicator')?.remove();
          appendMessage('bot', '⚠️ No se pudo conectar con el servidor.');
        }
      }

      // Atajo automático para parámetros url
      window.addEventListener('DOMContentLoaded', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('query');
        if (query) {
          let text = '';
          if (query === 'oracion-del-dia') text = 'Por favor hazme la Oración del Día de hoy basada en el Santoral o las lecturas del día.';
          else if (query === 'laudes') text = 'Deseo rezar el oficio litúrgico de Laudes del día de hoy.';
          else if (query === 'visperas') text = 'Deseo rezar el oficio litúrgico de Vísperas del día de hoy.';
          else if (query === 'completas') text = 'Deseo rezar el oficio litúrgico de Completas de hoy.';
          
          if (text) {
            chatInput.value = text;
            enviarMensaje();
          }
        }
      });
    </script>
  `;

  res.send(renderPage('Asistente Magisterial Inteligente', html, req));
});

// ════════════════════════════════════════════════════════════════════════════
// HELPER DE DESCUBRIMIENTO Y RECOMENDACIÓN DE CONTENIDOS EN EL CHAT
// ════════════════════════════════════════════════════════════════════════════

function obtenerRecursosRelacionados(query) {
  if (!query) return { infografias: [], blogs: [], videos: [], podcasts: [] };
  const stopWords = new Set(['sobre', 'para', 'como', 'quien', 'donde', 'cuando', 'desde', 'hasta', 'hacer', 'puedo', 'quiero', 'deseo', 'saber', 'tengo', 'favor', 'ayuda', 'sobre', 'estos', 'estas', 'entre', 'todos', 'todas', 'nuestro', 'nuestra', 'sobre', 'sobre', 'eucaristia', 'eucaristía', 'misa', 'santo', 'oración', 'oracion']);
  const cleanWords = query.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));

  // Buscar con la query completa primero
  let matchedInfs = [];
  try { matchedInfs = infografias.getInfografias({ q: query, limit: 3 }).items || []; } catch(e) {}
  
  let matchedBlogs = [];
  try { matchedBlogs = blog.getPosts({ q: query, limit: 3 }).items || []; } catch(e) {}
  
  let matchedVids = [];
  try { matchedVids = videos.getVideos({ q: query }).slice(0, 3) || []; } catch(e) {}
  
  let matchedPods = [];
  try { matchedPods = podcast.getPodcasts({ q: query }).slice(0, 3) || []; } catch(e) {}

  // Si no hay resultados suficientes, buscar por palabras clave individuales
  if (matchedInfs.length === 0 && matchedBlogs.length === 0 && matchedVids.length === 0 && matchedPods.length === 0) {
    for (const word of cleanWords) {
      if (word.length >= 4) {
        try {
          const infs = infografias.getInfografias({ q: word, limit: 2 }).items || [];
          const bgs = blog.getPosts({ q: word, limit: 2 }).items || [];
          const vids = videos.getVideos({ q: word }).slice(0, 2) || [];
          const pods = podcast.getPodcasts({ q: word }).slice(0, 2) || [];

          infs.forEach(i => { if (!matchedInfs.some(x => x.id === i.id)) matchedInfs.push(i); });
          bgs.forEach(b => { if (!matchedBlogs.some(x => x.slug === b.slug)) matchedBlogs.push(b); });
          vids.forEach(v => { if (!matchedVids.some(x => x.id === v.id)) matchedVids.push(v); });
          pods.forEach(p => { if (!matchedPods.some(x => x.id === p.id)) matchedPods.push(p); });
        } catch(e) {}
      }
    }
  }

  // Si le pregunta por "eucaristia" o "comunión" o "misa", garantizar traer contenido pertinente
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('eucaristia') || lowerQuery.includes('eucaristía') || lowerQuery.includes('hostia') || lowerQuery.includes('comunion') || lowerQuery.includes('comunión')) {
    // Forzar traer infografías o videos de liturgia si no se encontraron
    if (matchedInfs.length === 0) {
      try { matchedInfs = infografias.getInfografias({ q: 'eucaristia', limit: 2 }).items || []; } catch(e) {}
      if (matchedInfs.length === 0) {
        try { matchedInfs = infografias.getInfografias({ q: 'liturgia', limit: 2 }).items || []; } catch(e) {}
      }
    }
    if (matchedVids.length === 0) {
      try { matchedVids = videos.getVideos({ q: 'liturgia' }).slice(0, 2) || []; } catch(e) {}
    }
  }

  return {
    infografias: matchedInfs.slice(0, 2),
    blogs: matchedBlogs.slice(0, 2),
    videos: matchedVids.slice(0, 2),
    podcasts: matchedPods.slice(0, 2)
  };
}

function renderRelacionadosHtml(recursosObj) {
  const { infografias: infs, blogs, videos: vids, podcasts: pods } = recursosObj;
  const total = infs.length + blogs.length + vids.length + pods.length;
  if (total === 0) return '';

  let cardsHtml = '';

  infs.forEach(inf => {
    const imgUrl = (inf.imagenes && inf.imagenes[0] && inf.imagenes[0].url) || '';
    cardsHtml += `
<a href="/infografias/${inf.slug}" target="_blank" class="no-underline block group">
<div class="bg-white border border-[#E6DFD4] hover:border-gold/50 rounded-xl overflow-hidden shadow-xs transition duration-300 flex flex-col h-full">
${imgUrl ? `<div class="aspect-video w-full overflow-hidden bg-cream-2 border-b"><img src="${imgUrl}" alt="${inf.altText || inf.tema}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300"></div>` : ''}
<div class="p-3.5 flex-1 flex flex-col justify-between">
<div class="inline-block">
<span class="inline-block text-[9px] font-bold text-maroon bg-cream/80 border border-maroon/10 px-2 py-0.5 rounded font-mono uppercase tracking-wider mb-1.5">&#x1F3A8; Infografía</span>
<h4 class="font-display font-semibold text-espresso text-xs leading-snug group-hover:text-gold transition-colors">${inf.titulo || inf.tema}</h4>
<p class="text-ink-2 text-[10px] line-clamp-2 mt-1 leading-normal italic">${inf.metaDescription || ''}</p>
</div>
<span class="text-[10px] text-gold font-semibold mt-2.5 block group-hover:underline">Visualizar mapa de fe &rarr;</span>
</div>
</div>
</a>
    `;
  });

  blogs.forEach(post => {
    cardsHtml += `
<a href="/blog/${post.slug}" target="_blank" class="no-underline block group">
<div class="bg-white border border-[#E6DFD4] hover:border-gold/50 rounded-xl overflow-hidden shadow-xs transition duration-300 flex flex-col h-full">
<div class="p-3.5 flex-1 flex flex-col justify-between">
<div class="inline-block">
<span class="inline-block text-[9px] font-bold text-gold-deep bg-cream/80 border border-gold/10 px-2 py-0.5 rounded font-mono uppercase tracking-wider mb-1.5">&#x270D; Post de Formación</span>
<h4 class="font-display font-semibold text-espresso text-xs leading-snug group-hover:text-maroon transition-colors">${post.titulo}</h4>
<p class="text-ink-2 text-[10px] line-clamp-2 mt-1 leading-normal italic">${post.extracto || post.descripcion || ''}</p>
</div>
<span class="text-[10px] text-maroon font-semibold mt-2.5 block group-hover:underline">Leer artículo completo &rarr;</span>
</div>
</div>
</a>
    `;
  });

  vids.forEach(v => {
    cardsHtml += `
<a href="/videos" target="_blank" class="no-underline block group">
<div class="bg-white border border-[#E6DFD4] hover:border-gold/50 rounded-xl overflow-hidden shadow-xs transition duration-300 flex flex-col h-full">
<div class="aspect-video w-full bg-black relative flex items-center justify-center overflow-hidden">
<img src="https://img.youtube.com/vi/${v.youtubeId}/0.jpg" alt="${v.titulo}" class="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition duration-300">
<div class="absolute w-10 h-10 bg-maroon/95 text-white rounded-full flex items-center justify-center shadow group-hover:scale-110 transition duration-300 border border-gold/30">
<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" class="lucide lucide-play ml-0.5"><polygon points="6 3 20 12 6 21 6 3"/></svg>
</div>
</div>
<div class="p-3.5 flex-1 flex flex-col justify-between">
<div class="inline-block">
<span class="inline-block text-[9px] font-bold text-red-700 bg-cream/80 border border-red-700/10 px-2 py-0.5 rounded font-mono uppercase tracking-wider mb-1.5">&#x1F4F9; Video Catequesis</span>
<h4 class="font-display font-semibold text-espresso text-xs leading-snug group-hover:text-gold transition-colors">${v.titulo}</h4>
<p class="text-ink-2 text-[10px] line-clamp-2 mt-1 leading-normal italic">${v.comentario || ''}</p>
</div>
<span class="text-[10px] text-gold font-semibold mt-2.5 block group-hover:underline">Ver video formacional &rarr;</span>
</div>
</div>
</a>
    `;
  });

  pods.forEach(p => {
    cardsHtml += `
<a href="/podcasts" target="_blank" class="no-underline block group">
<div class="bg-white border border-[#E6DFD4] hover:border-gold/50 rounded-xl overflow-hidden shadow-xs transition duration-300 flex flex-col h-full">
<div class="p-3.5 flex-1 flex flex-col justify-between">
<div class="inline-block">
<span class="inline-block text-[9px] font-bold text-green-700 bg-cream/80 border border-green-700/10 px-2 py-0.5 rounded font-mono uppercase tracking-wider mb-1.5">&#x1F399; Audios & Podcast</span>
<h4 class="font-display font-semibold text-espresso text-xs leading-snug group-hover:text-green-800 transition-colors">${p.titulo}</h4>
<p class="text-ink-2 text-[10px] line-clamp-2 mt-1 leading-normal italic">${p.descripcion || ''}</p>
</div>
<span class="text-[10px] text-green-700 font-semibold mt-2.5 block group-hover:underline">Escuchar episodio &rarr;</span>
</div>
</div>
</a>
    `;
  });

  const rawHtml = `
<div class="chat-recursos-sec mt-6 pt-5 border-t border-[#E6DFD4]">
<span class="text-[11px] text-gold font-semibold uppercase tracking-widest font-mono flex items-center gap-1.5 mb-3.5">
<span class="w-1.5 h-1.5 bg-gold rounded-full animate-pulse"></span>
CONTENIDOS RECOMENDADOS CatolicosGPT
</span>
<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
${cardsHtml}
</div>
</div>
  `;
  return rawHtml.split('\n').map(l => l.trim()).join('\n');
}

// Unified robust helper to fetch liturgy from cache or generate high-fidelity daily offices with Gemini
async function getOrGenerateLiturgia(horaLiturgica) {
  let data = liturgia.get(horaLiturgica);
  if (!data) {
    try {
      const cache = await liturgia.init();
      data = cache.items?.[horaLiturgica];
    } catch(e) {
      console.error('[Helper Liturgia] Error inicializando caché:', e.message);
    }
  }
  if (!data) {
    try {
      const refreshed = await liturgia.refreshLiturgia();
      data = refreshed.items?.[horaLiturgica];
    } catch(e) {
      console.error('[Helper Liturgia] Error forzando descarga:', e.message);
    }
  }

  if (!data || !data.texto || data.texto.trim().length < 100) {
    console.log(`[Helper Liturgia] Autogenerando Oficio de ${horaLiturgica} con Gemini...`);
    const aiInstance = getAi();
    if (aiInstance) {
      try {
        const diaDeHoy = liturgia.todayBogota();
        const prompt = `Actúa como un liturgista católico experto.
Eres responsable de preparar el Oficio Litúrgico de la Liturgia de las Horas de la Iglesia Católica para el día de hoy (${diaDeHoy}).
Genera el texto litúrgico oficial de hoy para la hora de: ${horaLiturgica.toUpperCase()}.
El Oficio debe incluir:
1. **Introducción**: Oración introductoria, versículo inicial, Gloria al Padre.
2. **Himno**: Un himno católico tradicional hermoso correspondiente a ${horaLiturgica} (con rima, lírico).
3. **Salmodia**:
   - Tres salmos tradicionales apropiados para ${horaLiturgica}, con sus correspondientes Antífonas iniciales y finales.
4. **Lectura Breve**: Lectura de las Sagradas Escrituras correspondiente al Tiempo Litúrgico actual o al santoral del día.
5. **Responsorio Breve**: Devocional y rezado.
6. **Cántico Evangélico**:
   - Si es Laudes: El Cántico de Zacarías (Benedictus).
   - Si es Vísperas: El Cántico de la Santísima Virgen María (Magnificat).
   - Si es Completas: El Cántico de Simeón (Nunc Dimittis).
   - Antífona correspondiente.
7. **Preces / Intercesiones**: Peticiones comunitarias y pastorales.
8. **Padrenuestro** (Pater Noster).
9. **Oración Conclusiva** y Bendición final.

Devuelve todo estructurado de forma sumamente hermosa, ordenada, sobria, mística y teológicamente fiel al rito católico, usando Markdown impecable.`;
        const response = await aiInstance.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt
        });
        const generatedText = response.text || '';
        return {
          texto: generatedText,
          fuente: 'Generación Litúrgica CatólicosGPT (Gemini Engine)'
        };
      } catch(gemError) {
        console.error('[Helper Liturgia] Error en generación por IA:', gemError.message);
      }
    }
    
    return {
      texto: `## Oficio de ${horaLiturgica.toUpperCase()} (Canal de Respaldo Local)
*Señor, abre mis labios, y mi boca proclamará tu alabanza.*\n\nUniendo nuestros corazones en devoción por la Iglesia Universal. Ruega por nosotros para que seamos dignos de alcanzar las promesas de Nuestro Señor Jesucristo. Amén.`,
      fuente: 'Sistema Litúrgico CatólicosGPT'
    };
  }

  return data;
}

// ════════════════════════════════════════════════════════════════════════════
// RUTA DE CHAT CENTRAL CON INTEGRACIÓN DE MAGISTERIUM E IA DUAL-ENGINE
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/chat', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      res.statusCode = 400;
      res.write("Falta la consulta");
      return res.end();
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // ── INTERCEPTOR PRE-CHECK DE TEMAS AJENOS / SECULARES (OFF-TOPIC) ──
    const lowerQuery = query.toLowerCase().trim();
    const cleanNoAccents = lowerQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const offTopicKeywords = [
      'arroz con pollo', 'receta', 'como cocinar', 'ingredientes para', 'messi', 'cristiano ronaldo', 
      'cr7', 'futbol', 'real madrid', 'fc barcelona', 'champions league', 'formula 1',
      'videojuegos', 'minecraft', 'playstation', 'xbox', 'gta'
    ];

    let isOffTopicQuery = false;
    for (const kw of offTopicKeywords) {
      if (cleanNoAccents.includes(kw)) {
        isOffTopicQuery = true;
        break;
      }
    }

    if (isOffTopicQuery) {
      res.write("CatólicosGPT es una Inteligencia Artificial católica dedicada exclusivamente a temas de fe, doctrina, liturgia, moral cristiana y espiritualidad de la Iglesia. Por ello, solo respondemos consultas relacionadas con la doctrina y la vida de fe de nuestra Santa Iglesia. Te invitamos a realizar preguntas teológicas o espirituales.");
      return res.end();
    }

    // ── INTERCEPTOR LITURGIA DE LAS HORAS (LAUDES, VÍSPERAS, COMPLETAS) ──
    let horaLiturgica = null;
    if (lowerQuery.includes('laude')) {
      horaLiturgica = 'laudes';
    } else if (lowerQuery.includes('vispera') || lowerQuery.includes('víspera')) {
      horaLiturgica = 'visperas';
    } else if (lowerQuery.includes('completa')) {
      horaLiturgica = 'completas';
    }

    if (horaLiturgica) {
      console.log(`[Liturgia Interceptor] Solicitud de hora litúrgica detectada: ${horaLiturgica}`);
      const data = await getOrGenerateLiturgia(horaLiturgica);
      if (data) {
        const titleLabel = {
          laudes: '🌅 Laudes — Oficio Diario de la Mañana',
          visperas: '🌇 Vísperas — Oficio Diario del Atardecer',
          completas: '🌌 Completas — Oficio Diario de la Noche'
        }[horaLiturgica];

        let formattedText = `### ${titleLabel}\n\n`;
        formattedText += `*Texto litúrgico oficial correspondiente al día de hoy, obtenido de ${data.fuente} (${liturgia.todayBogota()})*\n\n`;
        formattedText += `---\n\n`;
        formattedText += data.texto;

        // Añadir descubrimiento de recursos complementarios pastorales
        const recomendados = obtenerRecursosRelacionados(query);
        const htmlCards = renderRelacionadosHtml(recomendados);
        if (htmlCards) {
          formattedText += "\n\n" + htmlCards;
        }

        res.write(formattedText);
        return res.end();
      }
    }

    // 1. Detectar si es una cita bíblica directa
    const solicitada = biblia.detectarSolicitudBiblica(query);
    if (solicitada) {
      const render = biblia.renderizarCita(solicitada, true);
      if (!render.includes('No se encontró')) {
        let textResult = render + `\n\n*Cita extraída del corpus bíblico oficial (Biblia de Navarra).*`;
        // Recomendar recursos también para citas
        const recomendados = obtenerRecursosRelacionados(query);
        const htmlCards = renderRelacionadosHtml(recomendados);
        if (htmlCards) textResult += "\n\n" + htmlCards;
        res.write(textResult);
        return res.end();
      }
    }

    // 2. Realizar búsqueda en base doctrinal local para Grounding adicional
    const groundingsLocal = recursos.consultarRecursosLocales(query);
    let localContext = '';
    if (groundingsLocal && groundingsLocal.length > 0) {
      localContext = groundingsLocal.slice(0, 3).map(g => 
        `DOCUMENTO: ${g.titulo}\nCONTENIDO: ${g.contenido}\nMETADATA: ${JSON.stringify(g.metadata)}`
      ).join('\n\n');
    }

    // 3. Obtener respuesta de Magisterium con el motor dual de Búsqueda y Chat
    let magisteriumSourceResponse = '';
    let usedMagisteriumAPI = false;

    if (process.env.MAGISTERIUM_API_KEY) {
      const systemInstructionMagisterium = `Eres un teólogo católico erudito, fiel servidor del Magisterio de la Iglesia y del Papa León XIV. 
Tus respuestas deben estar profundamente ancladas en la verdad doctrinal y pastoral de las Sagradas Escrituras, el Catecismo y los santos pontífices.`;

      let searchContext = '';
      try {
        console.log('[Magisterium Search API] Buscando fuentes doctrinales relativas...');
        let resSearch = await fetch('https://api.magisterium.com/v1/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MAGISTERIUM_API_KEY}`
          },
          body: JSON.stringify({
            query: query,
            top_k: 5
          }),
          signal: AbortSignal.timeout(1200)
        });
        
        if (resSearch.ok) {
          const dataS = await resSearch.json();
          const items = dataS.results || dataS.citations || dataS.documents || [];
          if (items.length > 0) {
            searchContext = items.map(cit => 
              `CITA DE ORIGEN: ${cit.source || cit.title || 'Magisterio Oficial'}\nCONTENIDO: ${cit.text || cit.content || ''}`
            ).join('\n\n');
            console.log('[Magisterium Search API] Encontrados pasajes oficiales en la base de datos.');
          }
        }
      } catch (searchErr) {
        console.log('[Magisterium Search API] No se pudo conectar a la búsqueda de vectores (timeout o desconexión). Fallback a chat.');
      }

      const finalPromptMagisterium = `Consulta del Católico: "${query}"\n\n${searchContext ? `CITAS CIENTÍFICAS DEL CATECISMO/BÍBLICAS OBTENIDAS DE MAGISTERIUM SEARCH:\n${searchContext}\n\n` : ''}${localContext ? `CONTEXTO LOCAL COMPLEMENTARIO:\n${localContext}\n\n` : ''}`;

      try {
        console.log('[Magisterium Chat API] Buscando en la nube doctrinal (timeout 1.2s)...');
        let resM = await fetch('https://api.magisterium.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MAGISTERIUM_API_KEY}`
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemInstructionMagisterium },
              { role: 'user', content: finalPromptMagisterium }
            ],
            model: 'magisterium-v1'
          }),
          signal: AbortSignal.timeout(1200)
        });

        if (resM.ok) {
          const d = await resM.json();
          magisteriumSourceResponse = d.choices?.[0]?.message?.content || d.text || d.response || d.content;
          if (magisteriumSourceResponse) {
            usedMagisteriumAPI = true;
            console.log('[Magisterium API] Enlace doctrinal exitoso con motor de Chat.');
          }
        }
      } catch (err) {
        console.log('[Magisterium Chat API] Canal de contingencia local activado (timeout o desconexión).');
      }
    }

    // 4. Si la API de Magisterium no estuvo disponible o no hay clave, usamos el corpus local de grounding
    if (!magisteriumSourceResponse) {
      if (localContext) {
        magisteriumSourceResponse = `Información doctrinal extraída del Corpus Católico Local:\n${localContext}`;
      } else {
        magisteriumSourceResponse = `Utilizar los conocimientos doctrinales oficiales de la Iglesia Católica, las Sagradas Escrituras, el Catecismo (CIC), y las encíclicas pontificias incluyendo la "Magnifica Humanitas" y al Papa León XIV (Robert Francis Prevost).`;
      }
    }

    let finalResponseText = '';

    // 5. Motor de Presentación Inteligente de Gemini si la clave está provista y el cliente iniciado
    const aiInstance = getAi();
    if (aiInstance) {
      const systemInstructionPresentation = `Eres un sabio, tierno y cálido teólogo católico y consejero espiritual de CatólicosGPT, sirviendo con fidelidad doctrinal bajo el pontificado de León XIV.
Tu prioridad absoluta es adaptarte de manera sumamente humana y sensible al contexto emocional y espiritual de la consulta del fiel (INTENCIÓN DEL FIEL):

1. **Si el fiel expresa sufrimiento hondo, tristeza extrema, desesperanza o pensamientos tristes de deceso (ej. "me quiero morir", "suicidio", "estoy desesperado/a", "no tengo fuerzas")**:
   - Actúa de inmediato con la máxima compasión, ternura, calor humano y consuelo evangélico. NUNCA uses un tono distante o clínico. No hables fríamente de "el suicidio según el catecismo".
   - Queda ESTRICTAMENTE PROHIBIDO incluir encabezados académicos como "Sinopsis", análisis científicos, cuadros comparativos o raras tablas de vicios o virtudes. Eso aleja al alma sedienta.
   - Háblale directamente con el corazón de un pastor bondadoso que camina a su lado en el dolor. Consuélale con el amor infinito y eterno de Dios, asegurándole que ante el Padre Celestial su vida es un tesoro inestimable de valor infinito.
   - Invítale con dulzura a compartir qué le duele y dale citas de consuelo (ej. Mateo 11, 28; Salmo 34, 18) junto a consejos consoladores de santos (ej. el "Nada te turbe" de Santa Teresa, o el "Reza, ten fe y no te preocupes" de San Padre Pío).
   - Proporciona de forma CLARA y VISIBLE información de ayuda práctica y prevención: recomiéndale comunicarse las 24 horas con la línea de ayuda nacional de crisis o de prevención del suicidio de su país (ej. el 988 si aplica) e invítalo a ampararse en su comunidad parroquial o de salud para no llevar esta carga a solas.
   - Cierra con una oración íntima de sanación por él/ella en el texto.

2. **Si el fiel pide una GUÍA DEVOCIONAL o VISITA (ej. "visita al santisimo", "adoracion")**:
   - Descarta análisis doctrinarios secos o tablas de clasificación teológica de oraciones.
   - Ofrece directamente una hermosa, completa y cuidada guía espiritual paso a paso para la oración y adoración (que incluya acto de fe, lectura espiritual o preces, comunión espiritual tradicional y jaculatoria final), facilitando que el usuario ore en recogimiento íntimo en ese momento.

3. **Si el fiel pide ORACIONES (ej. "oración a San José", "rezos a la Virgen María", "oracion por los enfermos", etc.)**:
   - Proporciona de inmediato las oraciones tradicionales católicas completas (ej. las oraciones del Papa León XIII o de los santos), escritas con impecable elevación espiritual y formato limpio.
   - NO añadas apologías académicas ni desgloses comparativos innecesarios. Mantén el foco 100% en el fervor del fiel.

4. **Para consultas doctrinarias, debates, dudas teológicas o morales generales (ej. Dogmas, Sacramentos, ¿Qué es el Purgatorio?, la Gracia)**:
   - Organiza la respuesta de manera académica, estética y ordenada:
     - "### Sinopsis" (1-2 párrafos que sinteticen conceptualmente el corazón del tema)
     - Análisis o desgloses con subtítulos y viñetas elegantes
     - Tablas comparativas útiles que sinteticen conceptos, sacramentos o virtudes
     - Cierre breve con una jaculatoria o sentida súplica.

NORMAS TEOLÓGICAS DE ALINEACIÓN PASTORAL (ESTRICTAS Y ABSOLUTAS):
- NUNCA hables mal del Santo Padre el Papa, ni de la Iglesia, los cardenales, obispos, sacerdotes, ni de los hermanos protestantes. Conserva siempre la máxima mansedumbre y caridad ecuménica.
- NO ofrezcas opiniones políticas sobre partidos, candidatos ni ideologías seculares. Somos un portal espiritual que trasciende debates de poder terrenal.
- DEFIENDE SIEMPRE de forma inquebrantable la vida humana desde la concepción hasta la muerte natural, la institución sagrada del matrimonio y la familia. Oponte con celo pastoral, ternura y claridad magisterial al aborto, la eutanasia, las uniones civiles homosexuales y el uso de anticonceptivos artificiales.
- Queda prohibida cualquier mención sobre claves API o configuraciones.`;

      const presentationPrompt = `CONSULTA ORIGINAL DEL FIEL: "${query}"

FUENTE DOCTRINAL DE REFERENCIA (MAGISTERIUM):
"""
${magisteriumSourceResponse}
"""

Por favor, determina la intención del fiel y presenta la respuesta adaptando el formato al 100%. Si es apoyo en crisis o dolor humano extrema, habla como consejero pastoral muy cálido, amoroso, sin "Sinopsis" ni tablas académicas. Si pide visitas o rezo, proporciónalos íntegros y listos para orar. Si es duda de catecismo general, usa Sinopsis, cuadros comparativos y tablas. Devuelve Markdown devoto e impecable.`;

      try {
        console.log('[Gemini Presentation Engine] Iniciando stream de oratoria sagrada...');
        const gResStream = await aiInstance.models.generateContentStream({
          model: 'gemini-3.5-flash',
          contents: presentationPrompt,
          config: {
            systemInstruction: systemInstructionPresentation,
            temperature: 0.3
          }
        });

        for await (const chunk of gResStream) {
          if (chunk.text) {
            res.write(chunk.text);
          }
        }
        finalResponseText = 'stream-completed';
      } catch (gemIniErr) {
        console.error('[Gemini Presentation Engine Error]', gemIniErr.message);
      }
    }

    // 6. Último recurso offline: Generador Teológico de Alta Fidelidad Local (Ultra-Fast)
    if (!finalResponseText) {
      console.log('[Local Engine] Generando respuesta teológica con motor local de alta fidelidad.');
      finalResponseText = generateOfflineTheologicalResponse(query, magisteriumSourceResponse, groundingsLocal);
      res.write(finalResponseText);
    }

    // 7. Descubrir infografías, blogs, videos, podcasts relacionados de forma interactiva y agregarlos al pie
    const recomendados = obtenerRecursosRelacionados(query);
    const recomendadosHtml = renderRelacionadosHtml(recomendados);
    if (recomendadosHtml) {
      res.write("\n\n" + recomendadosHtml);
    }

    return res.end();

  } catch (globalError) {
    console.error('[Global Chat Endpoint Error]', globalError);
    res.write(`⚠️ **CatólicosGPT:** Ocurrió un inconveniente temporal al procesar tu consulta. Por favor, reintenta en breve. Toda la sabiduría de la Iglesia está a tu disposición.`);
    return res.end();
  }
});

// GENERADOR TEOLÓGICO LOCAL DE ALTA FIDELIDAD (OFFLINE / HÍBRIDO ULTRA-RAPIDO)
function generateOfflineTheologicalResponse(query, magisteriumSourceResponse, groundingsLocal) {
  const cleanQuery = query.trim();
  const qLower = cleanQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // 1. INTERCEPCIÓN DE TRISTEZA PROFUNDA / CONSUELO ANTE CRISIS O SUICIDIO ("me quiero morir", "suicidio")
  if (
    qLower.includes('quiero morir') || 
    qLower.includes('suicid') || 
    qLower.includes('morirme') || 
    qLower.includes('no quiero vivir') || 
    qLower.includes('matar') || 
    qLower.includes('quitarme la vida') || 
    qLower.includes('deprim') || 
    qLower.includes('depres') || 
    qLower.includes('desesper') || 
    qLower.includes('soledad') || 
    qLower.includes('angustia') || 
    qLower.includes('sin fuerzas') || 
    qLower.includes('triste')
  ) {
    return `¡Hermano o hermana mía en Cristo Jesús, por favor escúchame! 

Siento en mi corazón el peso de lo que estás viviendo y me conmueve profundamente saber que te encuentras así de agobiado/a, triste o cansado/a de luchar. En momentos de oscuridad tan densa, quiero que recuerdes una verdad eterna, grabada por el amor divino: **Tu vida es valiosísima y sagrada para Dios. No estás solo/a en este desierto.**

Él te creó con un propósito infinito de amor y de gracia, y aunque hoy sientas que las fuerzas te han abandonado por completo y no veas la salida, **Él camina a tu lado sosteniendo tus pasos silenciosamente.**

Refúgiate de todo corazón en la dulce consolación de los santos y de la Palabra de Dios:

*   **La Palabra del Señor:** *«Vengan a mí todos los que están cansados y agobiados, y yo los aliviaré.»* (Mateo 11, 28) y *«El Señor está muy cerca de los corazones quebrantados; Él salva a los de espíritu abatido.»* (Salmo 34, 18).
*   **La Sabiduría de Santa Teresa de Jesús:** 
    > *«Nada te turbe, nada te espante, todo se pasa, Dios no se muda; la paciencia todo lo alcanza; quien a Dios tiene nada le falta: solo Dios basta.»*
*   **El consejo del Santo Padre Pío de Pietrelcina:** *«Reza, ten fe y no te preocupes. La preocupación es inútil. Dios es misericordioso y escuchará tu oración.»*

#### ⚠️ **Por favor, busca ayuda de inmediato — No lleves esta carga a solas:**
Si sientes que el desespero te supera o estás teniendo pensamientos relacionados con tu deceso, por favor hable con alguien ahora mismo. Hay personas de gran corazón listas para escucharte y ayudarte las 24 horas del día:
*   **Línea de Crisis Nacional:** Marca el **988** (si estás en Colombia, Estados Unidos u otros países con este servicio unificado) o ponte en contacto inmediato con el teléfono de emergencia de prevención del suicidio de tu país o ciudad.
*   **Apoyo Pastoral:** Busca ayuda de inmediato con un sacerdote amigo, acude a tu parroquia local o dirígete al centro médico u hospital más cercano. Hay personas dispuestas a escucharte libre de juicio, con el infinito amor de Cristo Jesús.

**Déjame hacer una oración por ti en este instante:**
*«Señor Jesús, Luz del mundo y Consolador de los afligidos, te ruego que entres hoy en el corazón de mi querido/a hermano/a. Disipa toda sombra de desespero y soledad con tu amor filial. Envía tu Espíritu Santo para infundirle fuerza, paz y la dulce esperanza de la vida. Pon en su camino consejeros y amigos que le brinden amparo. Cubre a tu hijo/a con el rezo materno de María Santísima. Amén.»*

**Dime de corazón, ¿qué es lo que te aflige hoy? Cuéntame, quiero escucharte y acompañarte en la fe.**`;
  }

  // 2. INTERCEPCIÓN DE DEVOCIÓN: VISITA AL SANTÍSIMO
  if (
    qLower.includes('visita al santisimo') || 
    qLower.includes('visita al santisimo sacramento') || 
    qLower.includes('adoracion al santisimo') || 
    qLower.includes('adoracion eucaristica') || 
    qLower.includes('exposicion del santisimo')
  ) {
    return `### ⛪ Guía para la Visita al Santísimo Sacramento

¡Qué alegría y bendición! Jesús Sacramentado te espera en el Sagrario con las manos abiertas, deseando colmar de paz y gracia tu corazón: *«Miren que yo estoy con ustedes todos los días hasta el fin del mundo».*

A continuación tienes una guía práctica y devota, paso a paso, inspirada en la rica tradición espiritual de la Iglesia para realizar una Visita al Santísimo con profundo recogimiento:

---

#### 1. Acto de Fe y Adoración Inicial (Al postrarse de rodillas)
*Señor mío y Dios mío, creo firmemente que estás de verdad presente en esta Hostia consagrada y en este Sagrario. Te adoro con todo mi ser y reconozco tu soberanía divina. Me reconozco pecador, pero confío plenamente en tu infinita misericordia.*

---

#### 2. Las Estaciones al Santísimo (Recorriendo el misterio de amor)
Es costumbre rezar **cinco Padrenuestros, Avemarías y Glorias** en reverencia y agradecimiento a las Cinco Sagradas Llagas del Señor Crucificado, y uno más por las intenciones del Santo Padre el Papa.
*   **Padre Nuestro...**
*   **Dios te salve, María...**
*   **Gloria al Padre...**

---

#### 3. Oración de Adoración y Reparación (De San Alfonso María de Ligorio)
*«Señor mío Jesucristo, que por amor a los hombres estás de día y de noche en este Sacramento, lleno de piedad y amor, esperando, llamando y recibiendo a todos los que te visitan: creo que estás presente en el Sacramento del Altar; te adoro desde el abismo de mi nada y te doy gracias por todos los favores que me has hecho... Yo te amo, Jesús mío, con todo mi corazón, y deseo pasar mi vida consolando tu Corazón eucarístico.»*

---

#### 4. La Comunión Espiritual (Para invocar su presencia)
Si no puedes recibir la Sagrada Comunión sacramental en la Misa de hoy, puedes realizar este maravilloso acto de piedad para invitar a Jesús a habitar en tu espíritu:
*«Creo, Jesús mío, que estás realmente presente en el Santísimo Sacramento del Altar. Te amo sobre todas las cosas y deseo ardientemente recibirte dentro de mi alma; pero no pudiendo hacerlo ahora sacramentalmente, ven al menos espiritualmente a mi corazón. Y como si ya te hubiese recibido, te abrazo y me uno del todo a Ti. Señor, no permitas que jamás me separe de Ti. Amén.»*

---

#### 5. Cierre y Ofrenda del Día
*«¡Sagrado Corazón de Jesús, en Vos confío! Que el Santísimo Sacramento del Altar sea por siempre alabado, adorado y bendecido en la tierra y en el cielo. Madre mía del Carmen, ruega por nosotros. Amén.»*

---

**Dedica ahora unos minutos de silencio a contemplar el Sagrario. Cierra tus ojos, aquieta tus pensamientos y deja que sea el Señor Jesús quien hable a tu alma en la intimidad.**`;
  }

  // 3. INTERCEPCIÓN DE ORACIÓN A SAN JOSÉ
  if (qLower.includes('oracion a san jose') || qLower.includes('oraciones a san jose') || qLower.includes('suplicas a san jose')) {
    return `### 🌸 Devoción y Oración a San José, Patrono de la Iglesia Universal

San José, castísimo esposo de la Virgen María y padre adoptivo de Jesús, es el custodio más tierno de las familias, los trabajadores y las almas en momentos de necesidad. Como decía Santa Teresa de Ávila: *«No me acuerdo hasta ahora haberle suplicado cosa que la haya dejado de conceder».*

Aquí tienes dos oraciones de profundo fervor para encomendarte a su santo amparo:

---

#### 1. Súplica de San José (Oración tradicional del Papa León XIII)
*«A ti, bienaventurado San José, acudimos en nuestra tribulación, y después de implorar el auxilio de tu santísima Esposa, solicitamos también llenos de confianza tu patrocinio. Por aquella caridad que te unió con la Virgen Inmaculada, Madre de Dios, y por el amor paternal con que abrazaste al Niño Jesús, te suplicamos humildemente que vuelvas los ojos a la herencia que con su sangre adquirió Jesucristo, y con tu poder y auxilio socorras nuestras necesidades.*

*Amparad, ¡oh providentísimo Custodio de la Divina Familia!, a la descendencia escogida de Jesucristo; alejad de nosotros toda mancha de error y de corrupción... Y así como en otro tiempo libraste de la muerte la vida amenazada del Niño Jesús, concedednos el triunfo para mayor gloria de Dios. Amén.»*

---

#### 2. Consagración Diaria a San José (Protección espiritual y laboral)
*«¡Oh glorioso San José!, guardián de la Sagrada Familia, de quien Dios se confió para proteger la vida de su propio Hijo Santo, a ti acudo en este día para entregarte mis preocupaciones y mis labores. Protege mi hogar, consagra el trabajo de mis manos, líbrame de todo peligro del alma y del cuerpo, y enséñame a amar a Jesús y a María con la misma pureza y devoción con que tú lo hiciste en Nazaret. Sé mi guía en la tierra y mi intercesor en el cielo. Amén.»*

---

*✨ Jaculatoria: ¡San José, custodio de la Sagrada Familia, ruega por nosotros!*`;
  }

  // 4. INTERCEPCIÓN DE ORACIÓN A LA VIRGEN MARÍA
  if (
    qLower.includes('oracion a la virgen') || 
    qLower.includes('oraciones a la virgen') || 
    qLower.includes('oracion a maria') || 
    qLower.includes('bajo tu amparo') || 
    qLower.includes('la salve') || 
    qLower.includes('salve regina') ||
    qLower.includes('virgen del carmen') ||
    qLower.includes('virgen de fatima') ||
    qLower.includes('virgen de guadalupe')
  ) {
    return `### 🌹 Devoción y Oración a la Santísima Virgen María

Nuestra Madre Celestial, intercesora y reina de los corazones, es nuestro refugio seguro ante cualquier contrariedad terrenal. Aquí tienes tres de las más amadas y veneradas oraciones marianas de la milenaria tradición de la Iglesia:

---

#### 1. Bajo tu Amparo (Sub tuum praesidium - La oración mariana más antigua)
*«Bajo tu amparo nos acogemos, santa Madre de Dios; no desprecies las súplicas que te dirigimos en nuestras necesidades, antes bien, líbranos de todo peligro, ¡oh Virgen gloriosa y bendita! Amén.»*

---

#### 2. La Salve (Consuelo de las almas atribuladas)
*«Dios te salve, Reina y Madre de misericordia, vida, dulzura y esperanza nuestra; Dios te salve. A ti llamamos los desterrados hijos de Eva; a ti suspiramos, gimiendo y llorando en este valle de lágrimas.*

*Ea, pues, Señora, abogada nuestra, vuelve a nosotros esos tus ojos misericordiosos; y después de este destierro muéstranos a Jesús, fruto bendito de tu vientre. ¡Oh clementísima, oh piadosa, oh dulce siempre Virgen María! Ruega por nosotros, Santa Madre de Dios, para que seamos dignos de alcanzar y gozar las promesas de Nuestro Señor Jesucristo. Amén.»*

---

#### 3. Ofrenda y Consagración del Corazón
*«¡Oh Señora mía, oh Madre mía! Yo me ofrezco enteramente a ti, y en prueba de mi filial afecto, te consagro en este día: mis ojos, mis oídos, mi lengua, mi corazón; en una palabra, todo mi ser. Ya que soy todo tuyo, oh Madre de bondad, guárdame y defiéndeme como cosa y posesión tuya. Amén.»*

---

*✨ Jaculatoria: ¡Oh María, sin pecado concebida, ruega por nosotros que recurrimos a Ti!*`;
  }

  // 5. INTERCEPCIÓN DE ORACIÓN A SAN MIGUEL ARCÁNGEL
  if (
    qLower.includes('oracion a san miguel') || 
    qLower.includes('san miguel arcangel') || 
    qLower.includes('san miguel arcangel oracion') ||
    qLower.includes('defensa espiritual')
  ) {
    return `### ⚔️ Oración a San Miguel Arcángel (Guerra y Protección Espiritual)

San Miguel Arcángel, príncipe excelso de la milicia celestial, es nuestro escudo divino contra toda tentación y asechanza del mal en el mundo. El Papa León XIII compuso esta magnífica invocación para la defensa espiritual diaria:

---

*«San Miguel Arcángel, defiéndenos en la lucha. Sé nuestro amparo contra la perversidad y acechanzas del demonio. Que Dios manifieste sobre él su poder, es nuestra humilde súplica. Y tú, ¡oh Príncipe de la Milicia Celestial!, con el poder divino que de Dios has recibido, arroja al infierno a Satanás y a los demás espíritus malignos que vagan por el mundo para la perdición de las almas. Amén.»*

---

*✨ Jaculatoria: ¡San Miguel Arcángel, defiéndenos con tu espada de luz!*`;
  }

  // 6. INTERCEPCIÓN DE ORACIÓN POR LOS ENFERMOS
  if (
    qLower.includes('oracion por los enfermos') || 
    qLower.includes('oracion de sanacion') || 
    qLower.includes('por mi salud') || 
    qLower.includes('enfermedad') || 
    qLower.includes('enfermo') || 
    qLower.includes('sanar')
  ) {
    return `### 🩹 Oración e Intercesión por la Salud y los Enfermos

Jesús es el Médico de cuerpos y almas. En su paso por la tierra colmó de milagros y alivio a los sufrientes. Aquí tienes una oración llena de confianza filial para encomendar tu restablecimiento de salud o el de un ser querido enfermo:

---

*«Señor Jesús, Consolador de los afligidos y Salud de los enfermos: acudo ante Ti con humilde confianza a encomendarte la salud de mi querido/a hermano/a [o di su nombre]. Tú, que cargaste con nuestros dolores y por cuyas llagas fuimos sanados, derrama tu gracia santificante sobre su cuerpo y su alma.*

*Dale paciencia en la prueba, fortaleza física y espiritual en el dolor, y una confianza inquebrantable en tu divina providencia. Si conviene para su salvación y bien espiritual, concédele la gracia de restaurar sus fuerzas para que vuelva a alabarte con gozo y gratitud en tu Iglesia Santa. Amén.»*

---

*✨ Jaculatoria: ¡Virgen Salud de los Enfermos, intercede por nosotros!*`;
  }

  // 7. INTERCEPCIÓN DE ORACIÓN DE LA MAÑANA O LA NOCHE
  if (qLower.includes('oracion de la mañana') || qLower.includes('comenzar el dia') || qLower.includes('orar al despertar')) {
    return `### 🌅 Oración de la Mañana para Consagrar el Día

Empezar el día entregando nuestras primeras intenciones al Señor Jesús abre de par en par las compuertas de la Gracia santificante para todas nuestras tareas cotidianas:

---

*«Señor Dios omnipotente, que nos has hecho llegar al comienzo de este nuevo día, sálvanos hoy con tu poder; haz que nuestros pensamientos, palabras y obras no se desvíen de tus mandamientos, sino que tiendan siempre a cumplir tu santa voluntad. Inspira mis labores, aparta de mí la impaciencia y enséñame a ver tu rostro en cada prójimo que encuentre. Te lo pedimos por Jesucristo nuestro Señor. Amén.»*

*✨ Jaculatoria: ¡Señor, en tus manos gloriosas encomiendo todo mi día!*`;
  }

  if (qLower.includes('oracion de la noche') || qLower.includes('antes de dormir') || qLower.includes('al acostarse')) {
    return `### 🌌 Oración de la Noche para Encomendar el Descanso

Termina la jornada depositando tu fatiga y tus faltas en el Corazón Misericordioso de Cristo:

---

*«Visita, Señor, esta habitación, y aleja de ella todas las acechanzas del enemigo; que tus santos ángeles habiten en ella para guardarnos en paz, y que tu bendición permanezca siempre con nosotros. Dame un sueño reparador, purifica mi mente de angustias y concédeme despertar con entusiasmo espiritual para servirte y glorificarte en el nuevo día. Amén.»*

*✨ Jaculatoria: ¡En tus manos, Señor, encomiendo mi espíritu!*`;
  }

  // 8. SI PIDE ORACIONES EN GENERAL
  if (qLower.replace(/\s/g, "") === "oracion" || qLower.replace(/\s/g, "") === "oraciones" || qLower === "como rezar" || qLower === "rezar") {
    return `### ⛪ Las Oraciones Fundacionales de la Fe Católica

Unirse en oración con la Iglesia Universal nos une directamente con la Santísima Trinidad. Aquí tienes las oraciones básicas e invaluables de nuestra piedad:

---

#### 1. El Padre Nuestro (La oración enseñada por Cristo)
*«Padre nuestro, que estás en el cielo, santificado sea tu Nombre; venga a nosotros tu reino; hágase tu voluntad en la tierra como en el cielo. Danos hoy nuestro pan de cada día; perdona nuestras ofensas, como también nosotros perdonamos a los que nos ofenden; no nos dejes caer en la tentación, y líbranos del mal. Amén.»*

#### 2. El Ave María (El saludo celestial a la Virgen)
*«Dios te salve, María, llena eres de gracia, el Señor es contigo; bendita tú eres entre todas las mujeres, y bendito es el fruto de tu vientre, Jesús. Santa María, Madre de Dios, ruega por nosotros, pecadores, ahora y en la hora de nuestra muerte. Amén.»*

#### 3. El Gloria al Padre (Doxología trinitaria)
*«Gloria al Padre, y al Hijo, y al Espíritu Santo. Como era en el principio, ahora y siempre, por los siglos de los siglos. Amén.»*

---

**Dime querido/a hermano/a en la fe, ¿qué gracia o rezo especial deseas hacer hoy? Puedo facilitarte oraciones para San José, la Virgen María, San Miguel, devoción ante el Santísimo Sacramento o intercesión por enfermos.**`;
  }


  // 9. PROCEDER CON BÚSQUEDA TRADICIONAL PARA CONSULTAS DE OTROS TEMAS DOCTRINALES
  let sinopsis = '';
  if (groundingsLocal && groundingsLocal.length > 0) {
    sinopsis = `Bajo la luz del magisterio perenne de la Iglesia, contemplamos tu consulta sobre **"${cleanQuery}"**. La divina revelación y la sagrada tradición nos enseñan que toda verdad profunda nos acerca a Jesucristo, nuestro Instructor celestial, quien se revela en las escrituras y guía el caminar de todos sus fieles.`;
  } else {
    sinopsis = `Bajo la luz del magisterio perenne de la Iglesia, contemplamos tu consulta sobre **"${cleanQuery}"**. La doctrina católica y la tradición milenaria nos invitan a disponernos con fe viva para reflexionar en este misterio, que ilumina nuestras acciones cotidianas con la esperanza del Evangelio.`;
  }

  // Fundamento Doctrinal
  let doctrinal = '### 📜 Doctrinal y Tradición de la Iglesia\n\n';
  if (groundingsLocal && groundingsLocal.length > 0) {
    groundingsLocal.slice(0, 3).forEach(g => {
      let contentToShow = g.contenido;
      if (contentToShow.length > 350) {
        contentToShow = contentToShow.substring(0, 350) + '...';
      }
      doctrinal += `• **${g.titulo}**:\n  ${contentToShow}\n\n`;
    });
  } else {
    doctrinal += `La doctrina oficial, compendiada de forma eminente en el *Catecismo de la Iglesia Católica*, destaca que el actuar moral, los sacramentos y la vida sacramental forman una unidad indisoluble. Conducirse bajo la gracia santificante y mantener la fidelidad a los mandamientos divina y eclesiales nos reconcilia constantemente con el amor inefable del Padre Eterno.`;
  }

  // Tablas comparativas dinámicas
  let tablaHtml = '';
  if (qLower.includes('pecado') || qLower.includes('vicio') || qLower.includes('mal') || qLower.includes('tentacion') || qLower.includes('diablo')) {
    tablaHtml = `### 📊 Contraste Espiritual: Vicios vs. Virtudes Remedio

| Aspecto o Debilidad | Virtud Opuesta / Remedio | Acto de Piedad y Auxilio Sacramental |
| :--- | :--- | :--- |
| **Soberbia / Orgullo** | Humildad y Sumisión | Rezo del Santo Rosario y Confesión frecuente |
| **Ira / Violencia** | Paciencia y Mansedumbre | Oración contemplativa del corazón en silencio |
| **Avaricia / Egoísmo** | Generosidad y Desapego | Obras de caridad y limosna oculta de amor |
| **Lujuria / Impureza** | Castidad y Templanza | Comunión diaria y consagración a la Virgen María |`;
  } else if (qLower.includes('sacramento') || qLower.includes('bautismo') || qLower.includes('comunion') || qLower.includes('eucaristia') || qLower.includes('boda') || qLower.includes('matrimonio') || qLower.includes('santa cena') || qLower.includes('confesion')) {
    tablaHtml = `### 📊 Dimensiones de los Sacramentos de Salvación

| Sacramento de Fe | Corazón Doctrinal | Gracia Concedida por Cristo |
| :--- | :--- | :--- |
| **Bautismo** | Nuevo Nacimiento espiritual | Purifica el pecado original y nos integra a la Iglesia |
| **Reconciliación** | Misericordia y Perdón | Restaura la comunión filial rota por el descarrío |
| **Eucaristía** | Presencia Real Transustanciada | Alimento de inmortalidad, Cuerpo y Sangre divinos |
| **Confirmación** | Unción y Fortalecimiento | Sello definitivo del Espíritu Santo para la misión |`;
  } else if (qLower.includes('oracion') || qLower.includes('rezar') || qLower.includes('rosario') || qLower.includes('credo') || qLower.includes('padre nuestro')) {
    tablaHtml = `### 📊 Formas de Oración Cristocéntrica en la Iglesia

| Forma de Oración | Aspiración Teologal | Expresión Litúrgica de Unión |
| :--- | :--- | :--- |
| **Adoración** | Reconocer la soberanía divina | Exposición y Adoración del Santísimo Sacramento |
| **Contemplación** | Escucha amorosa del Maestro | Lectio Divina y silencio contemplativo mariano |
| **Súplica Humilde** | Confianza total en su providencia | Petición por salud, perdón y paz interior |
| **Acción de Gracias** | Reconocimiento de sus maravillas | El Te Deum e Himnos de alabanza celestial |`;
  } else {
    tablaHtml = `### 📊 Síntesis de las Virtudes Teologales Infusas

| Virtud Teologal | Enfoque Espiritual | Manifestación de Vida Práctica |
| :--- | :--- | :--- |
| **Fe (Fides)** | Creer firmemente en Dios | Estudio de las escrituras divinas y testimonio firme |
| **Esperanza (Spes)** | Confiar en el Reino celestial | Paciencia evangélica en tribulaciones de la vida |
| **Caridad (Caritas)** | Amor divino al prójimo | Práctica devota de las obras de misericordia |`;
  }

  // Mención de León XIV y modernidad / IA
  let leonXIVMention = '';
  if (qLower.includes('tecnologia') || qLower.includes('ia') || qLower.includes('inteligencia') || qLower.includes('ordenador') || qLower.includes('digital') || qLower.includes('moderno') || qLower.includes('mundo')) {
    leonXIVMention = `### 🌐 La Iglesia ante los Nuevos Horizontes\n\n` +
      `Como proclama sapientemente el Papa **León XIV (Robert Francis Prevost)** en su magnífica encíclica *“Magnifica Humanitas”* (promulgada el 15 de mayo de 2026), los avances en inteligencia artificial, telecomunicaciones y algoritmos deben estar siempre anclados a la primacía de la dignidad de todo ser humano, evitando soberbias tecnócratas que pretendan emular Babel.`;
  }

  // Oración Final de Acogida Pastoral
  const oracionFinal = `### ⛪ Camino de Oración y Acompañamiento\n\n` +
    `Te abrazamos pastoralmente e invitamos a meditar bajo la cercanía de la Sede Apostólica y el amparo milagroso del Corazón Inmaculado de María:\n\n` +
    `*“Jesús misericordioso, de quien procede toda gracia del alma, infunde sabiduría en mi obrar diario. Líbranos del pecado, enséñanos a amar profundamente a tu Santa Iglesia Madre, y concédenos perseverar con celo alegre en la caridad fraterna. Amén.”*\n\n` +
    `*✨ Jaculatoria: ¡Sagrado Corazón de Jesús, en Vos confío!*`;

  let result = `### Sinopsis\n\n${sinopsis}\n\n${doctrinal}\n\n${tablaHtml}\n\n`;
  if (leonXIVMention) result += `${leonXIVMention}\n\n`;
  result += oracionFinal;
  return result;
}

function formatResponseText(txt) {
  // Convertir retornos de carro
  let res = txt.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  // Convertir encabezados markdown
  res = res.replace(/### (.*?)(?=<br>|<\/p>|$)/g, '<h4 class="font-display font-bold text-maroon mt-3 inline-block">$1</h4>');
  res = res.replace(/## (.*?)(?=<br>|<\/p>|$)/g, '<h3 class="font-display font-bold text-maroon mt-4 inline-block text-base">$1</h3>');
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return '<p>' + res + '</p>';
}

// ════════════════════════════════════════════════════════════════════════════
// RUTAS DE LA APP — SECCIÓN DE INFOGRAFÍAS
// ════════════════════════════════════════════════════════════════════════════

app.get('/infografias', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const cat  = req.query.categoria || 'all';
  const q    = req.query.q || '';
  
  const { items, total, totalPages } = infografias.getInfografias({ categoria: cat, q, page, limit: 12 });

  const cats = ['doctrinal', 'santo', 'devocional', 'serie'];

  const filterHtml = `
    <div class="bg-white border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex flex-wrap gap-2 justify-center">
        <a href="/infografias?categoria=all" class="px-4 py-1.5 rounded-full text-xs font-semibold ${cat==='all'?'bg-maroon text-white':'bg-cream border text-ink hover:bg-cream2'} transition">Todo</a>
        ${cats.map(c => `
          <a href="/infografias?categoria=${c}" class="px-4 py-1.5 rounded-full text-xs font-semibold capitalize ${cat===c?'bg-maroon text-white':'bg-cream border text-ink hover:bg-cream2'} transition">${c}</a>
        `).join('')}
      </div>
      <form action="/infografias" method="GET" class="flex gap-2 w-full md:w-auto">
        <input type="text" name="q" value="${q}" placeholder="Buscar infografías..." class="border border-border rounded-full px-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gold flex-1">
        <button type="submit" class="bg-maroon text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-gold transition">Buscar</button>
      </form>
    </div>
  `;

  const listHtml = items.length > 0 ? `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${items.map(i => {
        const thumb = i.imagenes?.[0]?.url || 'https://res.cloudinary.com/df9vdt2da/image/upload/v1714498302/catolicosgpt_hero.png';
        return `
          <div class="seo-card flex flex-col justify-between overflow-hidden">
            <a href="/infografias/${i.slug}" class="block overflow-hidden rounded-lg mb-4 aspect-square bg-cream">
              <img src="${thumb}" alt="${i.altText || i.tema}" class="w-full h-full object-cover hover:scale-105 duration-200" referrerPolicy="no-referrer">
            </a>
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between text-[10px] font-semibold text-gold font-mono uppercase tracking-widest">
                <span>${i.tipo}</span>
                <span>${i.totalSlides} ${i.totalSlides>1?'diapositivas':'diapositiva'}</span>
              </div>
              <h2 class="font-display font-bold text-espresso text-base leading-snug"><a href="/infografias/${i.slug}">${i.titulo || i.tema}</a></h2>
              <p class="text-ink2 text-xs leading-relaxed line-clamp-2">${i.metaDescription || ''}</p>
              <div class="flex items-center justify-between mt-3 pt-3 border-t text-[10px] text-ink2">
                <span>Por: ${i.userPlan==='premium'?'Canal Parroquia':'CatólicosGPT'}</span>
                <span>${i.fechaISO || ''}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    
    <!-- PAGINACIÓN -->
    ${totalPages > 1 ? `
      <div class="flex items-center justify-center gap-2 mt-8">
        ${page > 1 ? `<a href="/infografias?page=${page-1}&categoria=${cat}&q=${q}" class="px-3 py-1.5 rounded bg-white border text-xs text-ink hover:bg-cream2">Anterior</a>` : ''}
        <span class="text-xs text-ink2">Página ${page} de ${totalPages}</span>
        ${page < totalPages ? `<a href="/infografias?page=${page+1}&categoria=${cat}&q=${q}" class="px-3 py-1.5 rounded bg-white border text-xs text-ink hover:bg-cream2">Siguiente</a>` : ''}
      </div>
    ` : ''}
  ` : `
    <div class="bg-white border rounded-2xl p-12 text-center shadow-sm flex flex-col items-center justify-center gap-4">
      <p class="text-ink2 text-sm">No se encontraron infografías en este catálogo.</p>
      <a href="/infografias" class="border border-maroon text-maroon px-4 py-2 rounded text-xs font-bold uppercase tracking-wider">Ver catálogo completo</a>
    </div>
  `;

  const sidebarPromoHtml = `
    <div class="bg-gradient-to-br from-cream2 to-cream border border-gold/40 rounded-2xl p-5 shadow-sm flex flex-col gap-4 sticky top-6">
      <h3 class="font-display font-semibold text-maroon text-xs tracking-wider uppercase border-b pb-2">Infografías Pastorales</h3>
      <p class="text-ink text-xs leading-relaxed">Formación espiritual y doctrina explicada de manera visual. Ideales para compartir en redes parroquiales o catequesis de perseverancia.</p>
      <div class="border-t pt-3 flex flex-col gap-1 text-[11px] text-ink2 italic">
        <span>✔️ Carruseles instructivos de imágenes</span>
        <span>✔️ Enriquecido con SEO por Inteligencia Artificial</span>
        <span>✔️ Almacenamiento seguro ultra-rápido en Cloudinary</span>
      </div>
      <a href="/admin#infografias" class="bg-maroon hover:bg-gold text-white text-center py-2 rounded text-xs font-bold uppercase transition mt-2">Consola de Control</a>
    </div>
  `;

  const html = `
    <div class="max-w-6xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h1 class="font-display font-bold text-2xl text-maroon tracking-wide">Galería de Infografías Católicas</h1>
        <p class="font-serif text-ink2 text-sm italic">Material catequético gráfico en alta definición para parroquias, retiros, catequesis o redes sociales.</p>
      </div>
      
      ${filterHtml}
      
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div class="lg:col-span-3 flex flex-col gap-6">
          ${listHtml}
        </div>
        <div class="lg:col-span-1">
          ${sidebarPromoHtml}
        </div>
      </div>
    </div>
  `;

  res.send(renderPage('Galería de Infografías Católicas', html, req, {
    description: "Colección de infografías católicas en alta definición y formatos para WhatsApp o Instagram sobre santos, apologética y doctrina.",
    keywords: "infografias catolicas, catequesis visual, santoral grafico, doctrina catolica instagram"
  }));
});

app.get('/infografias/:slug', (req, res) => {
  const inf = infografias.getInfografiaBySlug(req.params.slug);
  if (!inf) {
    return res.status(404).send(renderPage('No encontrado', `<div class="p-12 text-center text-ink">Catálogo o infografía no encontrada. <a href="/infografias" class="text-maroon underline">Volver a la galería</a></div>`, req));
  }

  const imagesHtml = inf.imagenes.map(img => `
    <div class="bg-cream border rounded-2xl overflow-hidden p-2 flex flex-col gap-3 shadow-md max-w-xl mx-auto">
      <img src="${img.url}" alt="${inf.altText || inf.tema} - Diapositiva ${img.slide}" class="w-full object-contain rounded-xl h-auto" loading="lazy" referrerPolicy="no-referrer">
      <div class="flex items-center justify-between text-xs px-2 py-1 text-ink2">
        <span>Diapositiva ${img.slide} de ${inf.totalSlides}</span>
        <span>Servidor: ${img.model === 'manual-upload' ? 'Cloudinary Editorial' : (img.model || 'Archivo Parroquial')}</span>
      </div>
    </div>
  `).join('\n');

  const metaKeywords = inf.keywords || `${inf.tema}, infografía católica, catequesis`;

  const html = `
    <div class="max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <a href="/infografias" class="text-xs font-semibold flex items-center gap-1.5 text-ink2 hover:text-maroon self-start">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left"><line x1="19" x2="5" y1="12" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Volver a la galería
      </a>
      
      <div class="flex flex-col gap-3 border-b pb-5">
        <div class="flex items-center gap-2 text-xs font-semibold text-gold font-mono uppercase tracking-widest">
          <span>${inf.tipo}</span>
          <span>•</span>
          <span>Formato: ${inf.formato}</span>
        </div>
        <h1 class="font-display font-bold text-2xl sm:text-3xl text-espresso tracking-wide">${inf.titulo || inf.tema}</h1>
        <p class="text-ink2 leading-relaxed text-sm">${inf.metaDescription || 'Material formativo católico.'}</p>
      </div>
      
      <div class="flex flex-col gap-8">
        ${imagesHtml}
      </div>
      
      <!-- CALL TO ACTION -->
      <div class="bg-white border rounded-2xl p-6 shadow-sm text-center flex flex-col items-center justify-center gap-4 mt-8 sacred-border">
        <h3 class="font-display font-bold text-maroon text-base">Utilizar este material</h3>
        <p class="text-ink text-xs max-w-lg leading-relaxed">Puedes descargar las imágenes haciendo clic derecho sobre ellas para compartirlas en grupos de parroquias, estados de WhatsApp o imprimir en tamaño poster.</p>
        <div class="flex gap-2">
          <button onclick="navigator.clipboard.writeText(window.location.href); alert('Enlace copiado');" class="bg-gold text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-gold-deep transition">Copiar enlace</button>
          <a href="/infografias" class="bg-cream border border-border px-4 py-2 rounded-full text-xs font-bold hover:bg-cream2 text-espresso transition">Explorar otras</a>
        </div>
      </div>
    </div>
  `;

  res.send(renderPage(inf.titulo || inf.tema, html, req, {
    description: inf.metaDescription || `Infografía católica de alta resolución sobre ${inf.tema}.`,
    keywords: metaKeywords,
    image: inf.imagenes?.[0]?.url
  }));
});

// ════════════════════════════════════════════════════════════════════════════
// RUTAS DE LA APP — BLOG CATÓLICO
// ════════════════════════════════════════════════════════════════════════════

app.get('/blog', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const cat  = req.query.categoria || '';
  const q    = req.query.q || '';
  
  const { items, total } = blog.getPosts({ categoria: cat || null, q: q || null, page, limit: 9 });
  const totalPages = Math.ceil(total / 9);

  const filterHtml = `
    <div class="bg-white border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex flex-wrap gap-2 justify-center">
        <a href="/blog?categoria=" class="px-4 py-1.5 rounded-full text-xs font-semibold ${!cat?'bg-maroon text-white':'bg-cream border text-ink hover:bg-cream2'} transition">Todo</a>
        ${['catequesis', 'doctrina', 'santos', 'liturgia', 'apologetica', 'oracion'].map(c => `
          <a href="/blog?categoria=${c}" class="px-4 py-1.5 rounded-full text-xs font-semibold capitalize ${cat===c?'bg-maroon text-white':'bg-cream border text-ink hover:bg-cream2'} transition">${c}</a>
        `).join('')}
      </div>
    </div>
  `;

  const listHtml = items.length > 0 ? `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${items.map(p => `
        <div class="seo-card flex flex-col justify-between">
          <div class="flex flex-col gap-2">
            <span class="text-[10px] font-semibold text-gold font-mono uppercase tracking-widest">${p.categoria || 'doctrina'}</span>
            <h2 class="font-display font-bold text-espresso text-base leading-snug"><a href="/blog/${p.slug}">${p.titulo}</a></h2>
            <p class="text-ink2 text-xs leading-relaxed line-clamp-3">${p.extracto || p.descripcion || ''}</p>
          </div>
          <div class="flex items-center justify-between mt-4 pt-3 border-t text-[10px] text-ink2">
            <span>Mesa de redacción</span>
            <span>${p.fechaCreacion ? p.fechaCreacion.slice(0, 10) : ''}</span>
          </div>
        </div>
      `).join('')}
    </div>
  ` : `
    <div class="p-12 bg-white rounded-xl border text-center text-ink2 text-sm">Próximamente más artículos de teología y apologética.</div>
  `;

  const html = `
    <div class="max-w-6xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h1 class="font-display font-bold text-2xl text-maroon tracking-wide">Blog de Formación Católico</h1>
        <p class="font-serif text-ink2 text-sm italic">Artículos profundos explicados de forma clara basados en las Sagradas Escrituras y el Catecismo.</p>
      </div>
      
      ${filterHtml}
      ${listHtml}
    </div>
  `;

  res.send(renderPage('Blog Católico de Formación', html, req));
});

app.get('/blog/:slug', (req, res) => {
  const post = blog.getPostBySlug(req.params.slug);
  if (!post) {
    return res.status(404).send(renderPage('No encontrado', `<div class="p-12 text-center text-ink">Artículo de blog no encontrado. <a href="/blog" class="text-maroon underline">Volver al blog</a></div>`, req));
  }

  // Parsear markdown para renderizar el contenido enriquecido
  const parsedBody = blog.parseMarkdown(post.contenidoMd);
  const renderedBody = blog.renderShortcodes(parsedBody, {
    getInfografia: infografias.getInfografiaBySlug,
    getVideo: videos.getVideoBySlug,
    getPodcast: podcast.getPodcastBySlug
  });

  const html = `
    <div class="max-w-3xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <a href="/blog" class="text-xs font-semibold flex items-center gap-1.5 text-ink2 hover:text-maroon self-start">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left"><line x1="19" x2="5" y1="12" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Volver al blog
      </a>
      
      <div class="flex flex-col gap-3 border-b pb-5">
        <div class="text-xs font-semibold text-gold font-mono uppercase tracking-widest">${post.categoria}</div>
        <h1 class="font-display font-bold text-2xl sm:text-3xl text-espresso leading-tight">${post.titulo}</h1>
        <div class="flex items-center gap-4 text-xs text-ink2">
          <span>Por: Editor Católico</span>
          <span>•</span>
          <span>Publicado: ${post.fechaCreacion ? post.fechaCreacion.slice(0, 10) : ''}</span>
        </div>
      </div>
      
      <!-- CUERPO DEL POST -->
      <article class="prose max-w-none text-ink leading-relaxed space-y-4 font-serif text-sm sm:text-base">
        ${renderedBody}
      </article>
      
      <!-- COMPARTIR -->
      <div class="border-t pt-5 mt-6 flex items-center justify-between text-xs text-ink2">
        <span>CatólicosGPT v77 — Fe constante.</span>
        <button onclick="navigator.clipboard.writeText(window.location.href); alert('Copió enlace')" class="text-maroon hover:underline font-semibold">Compartir Artículo</button>
      </div>
    </div>
  `;

  res.send(renderPage(post.titulo, html, req, {
    description: post.descripcion || post.extracto || "Formación de fe católico.",
    keywords: post.keywords || "catequesis, blog catolico"
  }));
});

// ════════════════════════════════════════════════════════════════════════════
// RUTAS DE LA APP — PODCASTS, VIDEOS, MISAS, SANTO DEL DÍA Y LITURGIA DE HORAS
// ════════════════════════════════════════════════════════════════════════════

app.get('/podcasts', (req, res) => {
  const list = podcast.getPodcasts();
  const html = `
    <div class="max-w-5xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h1 class="font-display font-bold text-2xl text-maroon tracking-wide">Podcasts Católicos Recomendados</h1>
        <p class="font-serif text-ink2 text-sm italic">Estudios bíblicos, catecismo y meditaciones diarias para reproducir en cualquier momento.</p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        ${list.map(p => `
          <div class="bg-white border rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-4">
            <div class="flex flex-col gap-2">
              <span class="text-[10px] font-semibold text-gold font-mono uppercase tracking-widest">${p.categoria}</span>
              <h3 class="font-display font-medium text-espresso text-base">${p.titulo}</h3>
              <p class="text-ink2 text-xs leading-relaxed line-clamp-3">${p.descripcion}</p>
            </div>
            
            <!-- SPOTIFY EMBED -->
            <div class="rounded-xl overflow-hidden shadow-sm">
              ${p.embedHtml}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  res.send(renderPage('Podcasts Católicos Curados', html, req));
});

app.get('/videos', (req, res) => {
  const list = videos.getVideos();
  const html = `
    <div class="max-w-5xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h1 class="font-display font-bold text-2xl text-maroon tracking-wide font-medium">Canales y Videos Curados</h1>
        <p class="font-serif text-ink2 text-sm italic">Respuestas de apologética, liturgia explicada y formación doctrinal en formato de video.</p>
      </div>
      
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
        ${list.map(v => `
          <div class="seo-card flex flex-col justify-between overflow-hidden">
            <div class="aspect-video rounded-lg overflow-hidden bg-black mb-4 flex">
              <iframe src="https://www.youtube.com/embed/${v.youtubeId}?rel=0" allowfullscreen style="width:100%;height:100%;border:0" loading="lazy"></iframe>
            </div>
            <div class="flex flex-col gap-1 inline-block">
              <span class="text-[9px] font-semibold text-gold font-mono uppercase tracking-widest block">${v.categoria}</span>
              <h3 class="font-display font-bold text-espresso text-sm leading-snug">${v.titulo}</h3>
              <p class="text-ink2 text-[11px] leading-relaxed line-clamp-2 mt-1">${v.comentario}</p>
              <span class="text-[10px] font-semibold text-ink2 mt-2 block italic">- Canal: ${v.canal}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  res.send(renderPage('Canales & Videos Católicos', html, req));
});

app.get('/liturgia-de-las-horas', async (req, res) => {
  const dateStr = liturgia.todayBogota();
  const lect = liturgia.get('lecturas');
  const laud = await getOrGenerateLiturgia('laudes');
  const visp = await getOrGenerateLiturgia('visperas');
  const compl = await getOrGenerateLiturgia('completas');

  const html = `
    <div class="max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6 text-sm">
      <div class="flex flex-col gap-2 border-b pb-5">
        <h1 class="font-display font-bold text-2xl text-maroon tracking-wide">Liturgia Diaria de la Iglesia</h1>
        <p class="font-serif text-ink2 text-xs italic">Lecturas completas del Evangelio, homilías diarias de fondo, y oficio litúrgico del día (${dateStr}).</p>
      </div>
      
      <div class="flex flex-col gap-6">
        
        <!-- EVANGELIO & LECTURAS -->
        <section class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <h2 class="font-display font-bold text-maroon text-base border-b pb-2">📖 Evangelio del día y Lecturas</h2>
          ${lect ? lect.lecturas.map((l, i) => `
            <div class="flex flex-col gap-2 mt-2">
              <h3 class="font-display font-semibold text-espresso text-sm">${l.titulo}</h3>
              <p class="text-ink text-xs sm:text-sm font-serif leading-relaxed italic border-l-2 border-gold pl-4 bg-cream/10 py-1">${l.texto.replace(/\n/g, '<br>')}</p>
            </div>
          `).join('<hr class="my-4">') : '<p class="text-ink2 text-xs">Cargando las lecturas litúrgicas del día...</p>'}
        </section>
        
        <!-- REFLEXIÓN / APRECIACIÓN O PREDIACIÓN -->
        ${lect && lect.predica ? `
          <section class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-3">
            <h2 class="font-display font-bold text-maroon text-base border-b pb-2">💡 Comentario / Predicación</h2>
            <p class="text-ink leading-relaxed font-serif text-xs sm:text-sm whitespace-pre-line">${lect.predica}</p>
          </section>
        ` : ''}
        
        <!-- LITURGIA DE LAS HORAS LAUDES -->
        <section class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <h2 class="font-display font-bold text-maroon text-base border-b pb-2">🌅 Laudes (Oración de la mañana)</h2>
          <div class="max-h-[350px] overflow-y-auto text-xs font-serif leading-relaxed text-ink pl-1 bg-[#FAF9F5]/40 border border-border/60 p-4 rounded-xl" style="white-space: pre-wrap;">${laud.texto}</div>
          <span class="text-[10px] text-ink2 font-mono italic">Fuente: ${laud.fuente}</span>
        </section>

        <!-- LITURGIA DE LAS HORAS VÍSPERAS -->
        <section class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <h2 class="font-display font-bold text-maroon text-base border-b pb-2">🌇 Vísperas (Oración del atardecer)</h2>
          <div class="max-h-[350px] overflow-y-auto text-xs font-serif leading-relaxed text-ink pl-1 bg-[#FAF9F5]/40 border border-border/60 p-4 rounded-xl" style="white-space: pre-wrap;">${visp.texto}</div>
          <span class="text-[10px] text-ink2 font-mono italic">Fuente: ${visp.fuente}</span>
        </section>

        <!-- LITURGIA DE LAS HORAS COMPLETAS -->
        <section class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <h2 class="font-display font-bold text-maroon text-base border-b pb-2">🌌 Completas (Oración de la noche)</h2>
          <div class="max-h-[350px] overflow-y-auto text-xs font-serif leading-relaxed text-ink pl-1 bg-[#FAF9F5]/40 border border-border/60 p-4 rounded-xl" style="white-space: pre-wrap;">${compl.texto}</div>
          <span class="text-[10px] text-ink2 font-mono italic">Fuente: ${compl.fuente}</span>
        </section>
        
      </div>
    </div>
  `;
  res.send(renderPage('Liturgia Diaria & Evangelio', html, req));
});

app.get('/santo-del-dia', async (req, res) => {
  try {
    const todayStr = liturgia.todayBogota(); // YYYY-MM-DD (e.g. "2026-06-19")
    const parts = todayStr.split('-');
    const diaVal = parseInt(parts[2]) || 19;
    const mesIdx = parts[1] || '06';

    const s = await getSantoDelDiaDetail(diaVal, mesIdx);

    // Formatear párrafos de la biografía
    const bioHtml = s.biografia
      .split('\n')
      .filter(p => p.trim().length > 0)
      .map(p => `<p class="text-ink text-sm sm:text-base leading-relaxed mb-4 text-justify font-serif">${p.trim()}</p>`)
      .join('');

    const virtuesHtml = (s.virtudes || [])
      .map(v => `<span class="bg-gold-light/40 text-maroon font-serif italic text-xs px-3 py-1.5 rounded-full border border-gold/25 font-bold">✨ ${v}</span>`)
      .join('');

    const otrosSantosList = (s.otrosSantos || [])
      .map(o => `<li class="flex items-center gap-2 text-xs text-ink-2 font-serif py-1 border-b border-border/40 hover:text-maroon duration-150">• ${o}</li>`)
      .join('');

    const html = `
      <div class="max-w-5xl mx-auto w-full px-4 py-8 flex flex-col gap-8 animate-fade-in">
        
        <!-- CABECERA PRINCIPAL -->
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-5">
          <div class="flex flex-col">
            <span class="text-xs font-mono font-bold text-gold uppercase tracking-widest bg-gold-light/20 px-3 py-1 rounded self-start border border-gold/15 mb-2">Santoral • ${s.dia} de ${s.mes}</span>
            <h1 class="font-display font-black text-3xl sm:text-4xl text-maroon tracking-tight leading-tight">${s.nombre}</h1>
            <p class="font-sans text-xs sm:text-sm text-ink2 mt-1 italic flex items-center gap-1.5">
              <span>⛪ Grado Litúrgico: <strong>${s.tipo}</strong></span>
              <span class="text-gold/60">•</span>
              <span>📅 Calendario de la Iglesia</span>
            </p>
          </div>
          
          <a href="/" class="text-xs bg-maroon/5 border border-maroon hover:bg-maroon hover:text-white text-maroon font-bold py-2 px-4 rounded-full transition flex items-center gap-1.5 self-start">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Consultar otro Santo en el Chat
          </a>
        </div>

        <!-- LEMA DEL SANTO DE HOY -->
        ${s.lema ? `
          <div class="sacred-border bg-white rounded-2xl p-6 text-center max-w-2xl mx-auto w-full relative overflow-hidden flex flex-col gap-2 shadow-sm">
            <div class="text-gold text-sm select-none">✝</div>
            <p class="font-serif italic text-base sm:text-lg text-maroon font-bold tracking-wide">${s.lema}</p>
            <div class="w-12 h-[1px] bg-gold/50 mx-auto mt-2"></div>
          </div>
        ` : ''}

        <!-- CONTENIDO PRINCIPAL: HISTORIA & DETALLES -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          <!-- BIOGRAFÍA AMPLIA (2 COLUMNAS) -->
          <div class="lg:col-span-2 bg-white border border-[#E6DFD4] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-4">
            <h2 class="font-display font-bold text-xl text-maroon border-b pb-2 tracking-wide flex items-center gap-2">
              📜 Vida y Testimonio Espiritual
            </h2>
            <div class="prose max-w-none mt-2">
              ${bioHtml}
            </div>
            
            <div class="border-t pt-4 mt-2">
              <span class="text-xs text-ink2 italic">Nota histórica: Biografía complementaria sincronizada dinámicamente con las bases doctrinal-históricas de CatólicosGPT y la Inteligencia Artificial del Magisterio Romano para el año 2026.</span>
            </div>
          </div>

          <!-- FICHA TÉCNICA, VIRTUDES Y ORACIÓN (1 COLUMNA) -->
          <div class="flex flex-col gap-6">
            
            <!-- FICHA PATRONATO Y VIRTUDES -->
            <div class="bg-white border rounded-2xl p-5 shadow-sm flex flex-col gap-4">
              <h3 class="font-display font-bold text-sm text-maroon uppercase tracking-wider border-b pb-2">Virtudes & Legado</h3>
              
              <div class="flex flex-col gap-1.5">
                <span class="text-xs font-mono font-bold text-ink2 uppercase tracking-wide">Patronazgo primordial</span>
                <p class="text-serif text-sm text-ink bg-cream p-3 rounded-lg border border-border/50">${s.patronato || 'Fieles del mundo'}</p>
              </div>

              <div class="flex flex-col gap-2 mt-1">
                <span class="text-xs font-mono font-bold text-ink2 uppercase tracking-wide">Virtudes heroicas</span>
                <div class="flex flex-wrap gap-2">
                  ${virtuesHtml}
                </div>
              </div>
            </div>

            <!-- ORACIÓN DEVOCIONAL -->
            <div class="bg-[#FBF9F4] border-2 border-gold/40 rounded-2xl p-6 shadow-sm flex flex-col gap-4 relative overflow-hidden">
              <!-- Watermark cross -->
              <div class="absolute -right-8 -bottom-8 text-gold/5 text-9xl font-light select-none pointer-events-none">✝</div>
              
              <div class="text-center flex flex-col gap-1">
                <span class="text-[10px] uppercase font-mono tracking-widest text-gold font-bold">Oración Devocional</span>
                <h3 class="font-display font-bold text-base text-maroon">Oración Tradicional de Intercesión</h3>
                <div class="h-[1.5px] w-8 bg-gold mx-auto my-1"></div>
              </div>

              <p class="text-ink text-xs sm:text-sm font-serif italic text-justify leading-relaxed whitespace-pre-line bg-white/70 p-4 rounded-xl border border-gold/15 relative">${s.oracion}</p>
              
              <div class="text-center text-xs font-serif text-ink-2 italic font-semibold">Amén.</div>
            </div>

            <!-- OTROS SANTOS DEL DÍA -->
            ${s.otrosSantos && s.otrosSantos.length > 0 ? `
              <div class="bg-white border rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                <h3 class="font-display font-semibold text-maroon text-xs border-b pb-2 uppercase tracking-wider">Otros Santos Celebrados</h3>
                <ul class="flex flex-col gap-1 mt-1">
                  ${otrosSantosList}
                </ul>
              </div>
            ` : ''}

          </div>

        </div>

      </div>
    `;
    res.send(renderPage('Santo de Hoy & Santoral', html, req));
  } catch (err) {
    console.error('[Santoral] Error renderizando página de santo:', err.message);
    res.status(500).send(renderPage('Error en Santo de Hoy', `<div class="p-12 text-center text-ink font-bold">⚠️ Error al cargar el santo del día de CatólicosGPT: ${err.message}. Por favor intente más tarde.</div>`, req));
  }
});

app.get('/preguntas-frecuentes', (req, res) => {
  const html = `
    <div class="max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <div class="flex flex-col gap-2 border-b pb-4">
        <h1 class="font-display font-bold text-2xl text-maroon tracking-wide">Preguntas Frecuentes Doctrinares Católicas</h1>
        <p class="font-serif text-ink2 text-sm italic">Respuestas claras, profundas y sin ambigüedades alineadas al Catecismo oficial.</p>
      </div>
      
      <div class="flex flex-col gap-4 mt-2">
        <div class="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <strong class="text-espresso font-display text-sm">💡 ¿Qué es el Catolicismo y por qué es la Iglesia fundada por Jesucristo?</strong>
          <p class="text-ink2 text-xs sm:text-sm leading-relaxed">La Iglesia es una, santa, católica y apostólica. Jesucristo le encargó formalmente las llaves a San Pedro (Mt 16,18) estableciendo el primado de la Sede Apostólica de Roma.</p>
        </div>
        
        <div class="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <strong class="text-espresso font-display text-sm">💡 ¿Por qué los católicos no adoramos a la Virgen María ni a los santos?</strong>
          <p class="text-ink2 text-xs sm:text-sm leading-relaxed">La Iglesia distingue categóricamente entre: Latría (Adoración que pertenece únicamente a Dios), Hiperdulía (Veneración particular a la Santísima Virgen María) y Dulía (Veneración a los santos).</p>
        </div>

        <div class="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <strong class="text-espresso font-display text-sm">💡 ¿Qué es la encíclica Magnifica Humanitas?</strong>
          <p class="text-ink2 text-xs sm:text-sm leading-relaxed">Es la encíclica social firmada el 15 de mayo de 2026 por el Papa León XIV que aborda de forma categórica la bioética y el transhumanismo frente al avance abrupto de las tecnologías de inteligencia artificial.</p>
        </div>
      </div>
    </div>
  `;
  res.send(renderPage('Catolicismo FAQ', html, req));
});

// ════════════════════════════════════════════════════════════════════════════
// RUTA: HORARIOS DE MISA Y TRANSMISIONES LITÚRGICAS
// ════════════════════════════════════════════════════════════════════════════

app.get('/misas', (req, res) => {
  const canalesObj = misas.getMisasCanales();
  
  // Render channels HTML
  let channelsHtml = '';
  canalesObj.forEach(p => {
    p.canales.forEach(c => {
      channelsHtml += `
        <div class="channel-card bg-white border border-[#E6DFD4] rounded-2xl p-5 shadow-sm hover:shadow duration-200 flex flex-col justify-between gap-4" data-pais="${p.pais.toLowerCase()}" data-nombre="${c.nombre.toLowerCase()}">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[9px] font-mono bg-maroon text-white font-bold px-2 py-0.5 rounded uppercase tracking-wider">${p.pais}</span>
              <span class="text-xs text-ink2 font-semibold flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                Sintonía Digital
              </span>
            </div>
            <h3 class="font-display font-bold text-espresso text-base tracking-wide">${c.nombre}</h3>
            <p class="text-ink2 text-xs leading-relaxed italic font-serif">${c.comentario}</p>
          </div>
          <div class="flex flex-col gap-2 pt-2 border-t border-cream">
            <a href="${c.liveUrl}" target="_blank" class="w-full text-center py-2 bg-maroon hover:bg-gold text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow flex items-center justify-center gap-1.5 duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-circle"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              Sintonizar Misa en Vivo
            </a>
            <a href="${c.link}" target="_blank" class="text-center text-[10px] text-ink hover:text-maroon font-bold font-mono transition">Visitar Canal Oficial →</a>
          </div>
        </div>
      `;
    });
  });

  const html = `
    <div class="max-w-5xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      
      <!-- HERO HEADER -->
      <div class="flex flex-col gap-2 border-b border-[#E6DFD4] pb-4">
        <h1 class="font-display font-bold text-2xl sm:text-3xl text-maroon tracking-wide">Transmisiones del Santo Sacrificio</h1>
        <p class="font-serif text-ink2 text-sm italic">Directorio verificado de Santa Misa en vivo y sacramentos por internet para personas impedidas, de viaje o enfermas.</p>
      </div>

      <!-- FILTER BOX -->
      <div class="flex flex-col sm:flex-row gap-3 items-center justify-between bg-cream2/30 border border-[#E6DFD4] rounded-2xl p-4 shadow-inner">
        <span class="text-xs font-semibold text-espresso flex items-center gap-1 font-serif italic">
          ✝ Filtrar transmisiones:
        </span>
        <div class="relative w-full sm:w-72">
          <input type="text" id="misa-search" oninput="filtrarCanales()" placeholder="Filtrar por canal o país..." class="w-full text-xs border border-border px-4 py-2.5 rounded-full outline-none focus:ring-2 focus:ring-gold bg-white">
          <span class="absolute right-3.5 top-3 text-ink2">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
        </div>
      </div>

      <!-- STREAMING GRID -->
      <div id="canales-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-2">
        ${channelsHtml}
      </div>

      <!-- NO RESULTS PLACEHOLDER -->
      <div id="no-canales" class="hidden text-center py-12 text-ink">
        <span class="text-2xl text-gold font-bold block mb-1">⛪</span>
        No se encontraron canales marianos ni diocesanos con esos términos.
      </div>

      <!-- PASTORAL OBSERVATION -->
      <div class="bg-white border-2 border-gold/20 rounded-2xl p-5 mt-6 shadow-sm shadow-gold-light/10">
        <h4 class="font-display font-bold text-maroon text-sm uppercase tracking-wider mb-2 flex items-center gap-1.5">
          ⛪ Instrucción Pastoral sobre la Misa Telemática
        </h4>
        <p class="font-serif text-ink text-xs sm:text-sm leading-relaxed italic">
          "Recordamos la enseñanza católica consagrada en la Carta Apostólica 'Dies Domini': la transmisión televisada o digital es una ayuda magnánima para quienes están legítimamente impedidos de asistir por edad, enfermedad o causa grave. Ninguna pantalla puede suplir la comunión sacramental, la presencia física del rebaño y la recepción real de la Santísima Eucaristía en el Altar de Dios."
        </p>
      </div>

    </div>

    <script>
      function filtrarCanales() {
        const query = document.getElementById('misa-search').value.toLowerCase().trim();
        const cards = document.querySelectorAll('.channel-card');
        let unmatchCount = 0;
        
        cards.forEach(card => {
          const pais = card.getAttribute('data-pais');
          const nombre = card.getAttribute('data-nombre');
          if (pais.includes(query) || nombre.includes(query)) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
            unmatchCount++;
          }
        });

        const noRes = document.getElementById('no-canales');
        if (unmatchCount === cards.length) {
          noRes.classList.remove('hidden');
        } else {
          noRes.classList.add('hidden');
        }
      }
    </script>
  `;
  res.send(renderPage('Santa Misa en Vivo', html, req));
});

// ════════════════════════════════════════════════════════════════════════════
// RUTA: SELLO DE ORO PREMIUM Y PLANES
// ════════════════════════════════════════════════════════════════════════════

app.get('/planes', (req, res) => {
  const user = getAuthedUser(req);
  const activePlan = user ? user.plan : 'free';

  const html = `
    <div class="max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      
      <!-- HERO HEADER -->
      <div class="flex flex-col gap-2 text-center max-w-2xl mx-auto pb-4">
        <h1 class="font-display font-medium text-3xl sm:text-4xl text-espresso tracking-tight leading-tight">
          Exclusividad & <span class="italic text-gold font-serif">Branding Cristiano</span>
        </h1>
        <p class="font-serif text-ink2 text-base italic leading-relaxed">
          Diseña y difunde de manera ilimitada con la V77. Configura el logo de tu parroquia y obtén descargas en alta resolución.
        </p>
      </div>

      <!-- PRICING CARDS -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto w-full mt-4">
        
        <!-- GRATUITO CARD -->
        <div class="bg-white border border-[#E6DFD4] rounded-3xl p-6 sm:p-8 flex flex-col justify-between gap-6 shadow-sm relative overflow-hidden">
          <div class="flex flex-col gap-3">
            <span class="text-[9px] font-mono bg-cream hover:bg-cream2 duration-200 text-espresso font-bold px-2 py-0.5 rounded self-start uppercase tracking-widest">Plan Comunitario</span>
            <h3 class="font-display font-bold text-espresso text-xl">Acceso Gratis</h3>
            <p class="text-ink2 text-xs leading-relaxed font-serif italic font-medium">Adecuado para catequesis y oración personal esporádica.</p>
            <div class="flex items-baseline mt-2">
              <span class="font-display font-medium text-4xl text-espresso">$0</span>
              <span class="text-ink2 text-xs ml-1 font-mono">/ siempre</span>
            </div>
            
            <ul class="flex flex-col gap-3 text-xs text-ink mt-4 border-t pt-4">
              <li class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-green-500 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Soporte total en el Chat Magisterial</span>
              </li>
              <li class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-green-500 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Generar 1 infografía diaria</span>
              </li>
              <li class="flex items-center gap-2 text-ink2">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-espresso flex-shrink-0 opacity-40" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                <span>Watermark de CatólicosGPT</span>
              </li>
            </ul>
          </div>
          
          <button class="w-full text-center py-2.5 bg-cream text-espresso font-bold text-xs uppercase tracking-wider rounded-xl transition" disabled>
            ${activePlan === 'free' ? 'Plan Actual Activado ✓' : 'Plan Tradicional'}
          </button>
        </div>

        <!-- PREMIUM CARD -->
        <div class="bg-white border-2 border-gold rounded-3xl p-6 sm:p-8 flex flex-col justify-between gap-6 shadow-md relative overflow-hidden">
          <div class="absolute -right-12 -top-12 bg-gold text-white text-[9px] font-bold font-mono py-1 px-4 transform rotate-45 w-40 text-center uppercase tracking-widest hidden sm:block shadow-sm">
            Destacado
          </div>
          
          <div class="flex flex-col gap-3">
            <span class="text-[9px] font-mono bg-gold-light text-maroon font-bold px-2.5 py-0.5 rounded self-start uppercase tracking-widest">Sello de Oro</span>
            <h3 class="font-display font-medium text-espresso text-xl">Socio Premium</h3>
            <p class="text-ink2 text-xs leading-relaxed font-serif italic font-medium">Ideal para templos, capillas, colegios doctrinales y agentes de evangelización digital.</p>
            <div class="flex items-baseline mt-2">
              <span class="font-display font-bold text-4xl text-maroon">$4.99</span>
              <span class="text-ink2 text-xs ml-1 font-mono">/ mes</span>
            </div>
            
            <ul class="flex flex-col gap-3 text-xs text-ink mt-4 border-t pt-4">
              <li class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-gold flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Generaciones <strong>ilimitadas</strong> de Infografías</span>
              </li>
              <li class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-gold flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span><strong>Sin watermark:</strong> Marca de agua removida</span>
              </li>
              <li class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-gold flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Formatos listos para Instagram, WhatsApp, Presentaciones</span>
              </li>
              <li class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-gold flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Configurar logo parroquial y monograma cristiano</span>
              </li>
            </ul>
          </div>
          
          ${user ? (
            activePlan === 'premium' || activePlan === 'admin' ? `
              <button class="w-full text-center py-2.5 bg-maroon text-white font-bold text-xs uppercase tracking-wider rounded-xl transition" disabled>
                Suscripción Premium Activa ✓
              </button>
            ` : `
              <button onclick="abrirCheckout()" class="w-full text-center py-3 bg-maroon hover:bg-gold text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow active:scale-95 duration-200">
                Obtener Licencia Premium
              </button>
            `
          ) : `
            <a href="/login?redirect=planes" class="w-full text-center py-3 bg-maroon hover:bg-gold text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow flex items-center justify-center gap-1.5 duration-200">
              Inicia Sesión para Comprar
            </a>
          `}
        </div>

      </div>

      <!-- CHECKOUT MODAL MOCKUP -->
      <div id="checkout-modal" class="fixed inset-0 bg-black/60 z-50 transition-opacity duration-300 flex items-center justify-center pointer-events-none opacity-0">
        <div id="checkout-container" class="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full mx-4 shadow-2xl transition-transform duration-300 transform scale-95 flex flex-col gap-4">
          <div class="flex items-center justify-between border-b pb-2">
            <span class="font-display font-bold text-maroon text-sm tracking-widest uppercase">Procesador de Ofrendas</span>
            <button onclick="cerrarCheckout()" class="p-1 rounded hover:bg-cream">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
            </button>
          </div>
          
          <div class="flex flex-col gap-1">
            <span class="text-ink2 text-[10px] font-mono uppercase tracking-widest">Suscripción</span>
            <div class="flex items-center justify-between font-serif">
              <span class="font-bold text-espresso text-sm">CatólicosGPT Premium V77</span>
              <span class="font-bold text-maroon text-sm">$4.99 USD</span>
            </div>
          </div>
          
          <form id="checkout-form" onsubmit="procesarUpgrade(event)" class="flex flex-col gap-3 mt-1">
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-semibold text-espresso">Número de Tarjeta (Prueba / Mock)</label>
              <input type="text" placeholder="4111 2222 3333 4444" required max="19" class="border border-border rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-gold bg-[#FAF9F5]/40 font-mono">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-semibold text-espresso">Vencimiento</label>
                <input type="text" placeholder="MM/AA" required class="border border-border rounded-xl px-4 py-2.5 text-xs text-center outline-none focus:ring-2 focus:ring-gold bg-[#FAF9F5]/40 font-mono">
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-semibold text-espresso">CVC</label>
                <input type="password" placeholder="***" required max="3" class="border border-border rounded-xl px-4 py-2.5 text-xs text-center outline-none focus:ring-2 focus:ring-gold bg-[#FAF9F5]/40 font-mono">
              </div>
            </div>
            
            <button type="submit" id="upgrade-submit-btn" class="w-full bg-maroon hover:bg-gold text-white font-bold py-3 rounded-xl transition uppercase tracking-wider shadow text-xs mt-3 flex items-center justify-center gap-1.5 duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-check"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Completar Suscripción Premium ($4.99)
            </button>
          </form>
          
          <div class="text-[9px] text-center text-ink2 italic font-serif leading-relaxed">
            ✝ Encriptación bancaria simulada SSL. El dinero de prueba no es real; tu base de datos se actualizará al instante.
          </div>
        </div>
      </div>

    </div>

    <script>
      const modal = document.getElementById('checkout-modal');
      const container = document.getElementById('checkout-container');
      
      function abrirCheckout() {
        modal.classList.remove('pointer-events-none', 'opacity-0');
        modal.classList.add('opacity-100');
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
      }
      
      function cerrarCheckout() {
        modal.classList.add('pointer-events-none', 'opacity-0');
        modal.classList.remove('opacity-100');
        container.classList.add('scale-95');
        container.classList.remove('scale-100');
      }
      
      async function procesarUpgrade(e) {
        e.preventDefault();
        const btn = document.getElementById('upgrade-submit-btn');
        btn.disabled = true;
        btn.innerHTML = 'Procesando ofrenda...';
        
        try {
          const res = await fetch('/api/upgrade-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (data.success) {
            alert('¡Ofrenda procesada con éxito! Bienvenido al Sello de Oro Premium.');
            window.location.reload();
          } else {
            alert('Error al actualizar plan: ' + (data.error || 'Intenta de nuevo'));
            btn.disabled = false;
            btn.innerHTML = 'Completar Suscripción Premium ($4.99)';
          }
        } catch(err) {
          alert('Error de conexión.');
          btn.disabled = false;
          btn.innerHTML = 'Completar Suscripción Premium ($4.99)';
        }
      }
    </script>
  `;
  res.send(renderPage('Sello de Oro Premium', html, req));
});

// Endpoint de upgrade instantáneo
app.post('/api/upgrade-plan', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Debes iniciar sesión para suscribirte' });
  
  try {
    auth.upgradePlan(user.id, 'premium');
    res.json({ success: true, message: '¡Felicidades! Ahora tienes acceso Premium completo.' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// RUTA SEO TEMÁTICA SEMENTERAS
// ════════════════════════════════════════════════════════════════════════════

app.get('/recursos/:slug', (req, res) => {
  const t = seoTopics.getTemaSEBySlug(req.params.slug);
  if (!t) {
    return res.status(404).send(renderPage('No encontrado', `<div class="p-12 text-center text-ink">Recurso de formación doctrinal no encontrado. <a href="/" class="text-maroon underline">Volver al inicio</a></div>`, req));
  }

  const html = `
    <div class="max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6 text-sm">
      <nav class="text-xs text-ink2 flex items-center gap-1.5 font-semibold">
        <a href="/" class="hover:text-maroon">Inicio</a>
        <span>/</span>
        <span class="text-gold font-bold">Doctrina</span>
      </nav>
      
      <div class="bg-white border border-border rounded-2xl p-6 sm:p-8 flex flex-col gap-4 shadow-sm sacred-border">
        <span class="text-[10px] font-mono font-bold text-gold uppercase tracking-widest">${t.categoria}</span>
        <h1 class="font-display font-bold text-2xl sm:text-3xl text-espresso tracking-wide leading-tight">${t.h1}</h1>
        <p class="text-ink2 font-serif text-sm italic leading-relaxed border-l-2 border-gold pl-4">${t.intro}</p>
        <hr class="my-3">
        <div class="text-ink font-serif text-xs sm:text-sm leading-relaxed space-y-4">
          <p>${t.contenido.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="bg-cream p-4 rounded-xl text-xs mt-4 flex flex-col gap-1 text-ink2 border border-border">
          <span><strong>Fuentes Magisteriales citadas:</strong> ${t.fuentes}</span>
        </div>
      </div>
      
      <div class="bg-white p-6 rounded-2xl border flex flex-col md:flex-row items-center gap-6 justify-between shadow-sm">
        <div class="flex flex-col gap-1">
          <h4 class="font-display font-bold text-maroon text-sm uppercase">Pregunta a la Inteligencia Artificial</h4>
          <p class="text-ink2 text-xs leading-relaxed max-w-lg">Profundiza en este tema doctrinal. El asistente de CatólicosGPT te dará respuestas groundeadas directamente en el Catecismo.</p>
        </div>
        <a href="/" class="bg-maroon hover:bg-gold text-white px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider shadow transition">Consultar Chat</a>
      </div>
    </div>
  `;

  res.send(renderPage(t.tema, html, req, {
    description: t.intro,
    keywords: t.keywords,
    canonical: `/recursos/${t.slug}`
  }));
});

// Registrar renderPage globalmente para uso en otros módulos como seo-pillars-router
global.renderPageWithSSR = renderPage;

// Montar el Router Programático de 10 Pilares SEO Católicos
const seoPillarsRouter = require('./seo-pillars-router');
app.use('/', seoPillarsRouter);

// ════════════════════════════════════════════════════════════════════════════
// RUTAS DE ARCHIVOS XML SITEMAPS Y RSS DE POTENCIA SEO
// ════════════════════════════════════════════════════════════════════════════

app.get('/sitemap.xml', (req, res) => {
  const infCatalog = infografias.loadCatalog();
  const blogCatalog = blog.loadBlog();
  const sementeras = seoTopics.getTemasSEO();

  const xml = seo.generateSitemapXML({
    infografias: infCatalog.infografias || [],
    posts: blogCatalog.posts || [],
    sementeras
  });

  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

app.get('/rss.xml', (req, res) => {
  const infCatalog = infografias.loadCatalog();
  const blogCatalog = blog.loadBlog();

  const rssFeed = seo.generateRSSFeed({
    posts: blogCatalog.posts || [],
    infografias: infCatalog.infografias || []
  });

  res.setHeader('Content-Type', 'application/xml');
  res.send(rssFeed);
});

// ════════════════════════════════════════════════════════════════════════════
// RUTAS DE AUTENTICACIÓN (LOGIN, REGRISTRO, SALIDA)
// ════════════════════════════════════════════════════════════════════════════

app.get('/login-admin-bypass', async (req, res) => {
  try {
    // Check if sellerplusco@gmail.com exists, create if not
    let existingUser = auth.getUserByEmail('sellerplusco@gmail.com');
    if (!existingUser) {
      const registerRes = await auth.register({
        nombre: 'Administrador sellerplusco',
        email: 'sellerplusco@gmail.com',
        password: 'Comics2026*'
      });
      existingUser = auth.getUserById(registerRes.user.id);
    }

    // Force plan as admin under all circumstances
    auth.updateUser(existingUser.id, { plan: 'admin' });

    // Perform complete, secure sign-in 
    const creds = await auth.login({ email: 'sellerplusco@gmail.com', password: 'Comics2026*' });
    res.setHeader('Set-Cookie', `cgpt_token=${creds.token}; Path=/; HttpOnly; Max-Age=2592000; SameSite=None; Secure`);
    global.sandboxSession = { token: creds.token, userId: existingUser.id };
    res.redirect('/admin');
  } catch (e) {
    console.error('[Admin Bypass] Error:', e);
    res.status(500).send(`Error promoviendo administrador: ${e.message}`);
  }
});

app.get('/login', (req, res) => {
  const html = `
    <div class="max-w-md mx-auto w-full px-4 py-12 flex flex-col gap-6">
      <div class="bg-white border rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-5 sacred-border">
        <div class="text-center">
          <h2 class="font-display font-bold text-maroon text-xl tracking-wider">Ingreso CatólicosGPT</h2>
          <p class="text-ink2 text-xs mt-1">Accede para generar tus infografías personalizadas.</p>
        </div>
        <form id="login-form" method="POST" action="/login" class="flex flex-col gap-4 text-xs sm:text-sm">
          <div class="flex flex-col gap-1.5">
            <label class="font-semibold text-espresso">Correo electrónico</label>
            <input type="email" name="email" required placeholder="correo@iglesia.com" class="border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-gold focus:border-transparent">
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="font-semibold text-espresso">Contraseña</label>
            <input type="password" name="password" required placeholder="••••••••" class="border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-gold focus:border-transparent">
          </div>
          <button type="submit" class="bg-maroon hover:bg-gold text-white font-bold py-3 rounded-lg transition uppercase tracking-wider duration-300 mt-2 shadow">Ingresar</button>
        </form>

        <div class="relative flex py-2 items-center">
          <div class="flex-grow border-t border-border"></div>
          <span class="flex-shrink mx-4 text-[10px] text-ink2 uppercase tracking-widest">Panel de Control</span>
          <div class="flex-grow border-t border-border"></div>
        </div>

        <a href="/login-admin-bypass" class="text-center text-xs border-2 border-dashed border-maroon hover:bg-maroon/5 text-maroon font-bold py-3 rounded-lg transition uppercase tracking-wider duration-300 block">
          🔑 Entrar directamente como Administrador (sellerplusco)
        </a>

        <div class="text-center text-xs text-ink2 border-t pt-4">
          ¿No tienes una cuenta aún? <a href="/register" class="text-maroon font-semibold hover:underline">Regístrate de forma gratuita</a>
        </div>
      </div>
    </div>
  `;
  res.send(renderPage('Ingresar', html, req));
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const creds = await auth.login({ email, password });
    res.setHeader('Set-Cookie', `cgpt_token=${creds.token}; Path=/; HttpOnly; Max-Age=2592000; SameSite=None; Secure`);
    global.sandboxSession = { token: creds.token, userId: creds.user.id };
    res.redirect('/');
  } catch(e) {
    const errorHtml = `
      <div class="max-w-md mx-auto w-full px-4 py-12">
        <div class="bg-white border rounded-2xl p-6 text-center flex flex-col gap-4">
          <p class="text-red-700 font-bold">⚠️ Error de Ingreso</p>
          <p class="text-ink2 text-xs">${e.message}</p>
          <a href="/login" class="bg-maroon text-white py-2 rounded text-xs font-bold uppercase transition">Volver a intentar</a>
        </div>
      </div>
    `;
    res.send(renderPage('Error de Login', errorHtml, req));
  }
});

app.get('/register', (req, res) => {
  const html = `
    <div class="max-w-md mx-auto w-full px-4 py-12 flex flex-col gap-6">
      <div class="bg-white border rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-5 sacred-border">
        <div class="text-center">
          <h2 class="font-display font-bold text-maroon text-xl tracking-wider">Crear Cuenta Gratuita</h2>
          <p class="text-ink2 text-xs mt-1">Únete a CatólicosGPT para guardar historiales y generar contenido.</p>
        </div>
        <form id="register-form" method="POST" action="/register" class="flex flex-col gap-4 text-xs sm:text-sm">
          <div class="flex flex-col gap-1.5">
            <label class="font-semibold text-espresso">Nombre de parroquiano o Iglesia</label>
            <input type="text" name="nombre" required placeholder="Pbro. Mateo o Parroquia San José" class="border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-gold focus:border-transparent">
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="font-semibold text-espresso">Correo electrónico</label>
            <input type="email" name="email" required placeholder="correo@iglesia.com" class="border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-gold focus:border-transparent">
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="font-semibold text-espresso">Contraseña</label>
            <input type="password" name="password" required placeholder="Mínimo 8 caracteres" class="border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-gold focus:border-transparent">
          </div>
          <button type="submit" class="bg-maroon hover:bg-gold text-white font-bold py-3 rounded-lg transition uppercase tracking-wider duration-300 mt-2 shadow">Registrar ahora</button>
        </form>
        <div class="text-center text-xs text-ink2 border-t pt-4">
          ¿Ya tienes cuenta? <a href="/login" class="text-maroon font-semibold hover:underline">Ingresa aquí</a>
        </div>
      </div>
    </div>
  `;
  res.send(renderPage('Registrarse', html, req));
});

app.post('/register', async (req, res) => {
  const { nombre, email, password } = req.body;
  try {
    const creds = await auth.register({ nombre, email, password });
    res.setHeader('Set-Cookie', `cgpt_token=${creds.token}; Path=/; HttpOnly; Max-Age=2592000; SameSite=None; Secure`);
    global.sandboxSession = { token: creds.token, userId: creds.user.id };
    res.redirect('/');
  } catch(e) {
    const errorHtml = `
      <div class="max-w-md mx-auto w-full px-4 py-12">
        <div class="bg-white border rounded-2xl p-6 text-center flex flex-col gap-4">
          <p class="text-red-700 font-bold">⚠️ Error de Registro</p>
          <p class="text-ink2 text-xs">${e.message}</p>
          <a href="/register" class="bg-maroon text-white py-2 rounded text-xs font-bold uppercase transition">Volver a intentar</a>
        </div>
      </div>
    `;
    res.send(renderPage('Error de Registro', errorHtml, req));
  }
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `cgpt_token=; Path=/; HttpOnly; Max-Age=0; SameSite=None; Secure`);
  global.sandboxSession = null;
  res.redirect('/');
});

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO RUTA ADMINISTRATOR: CONSOLA GENERADORA DE INFOGRAFÍAS
// Soportando subir a Cloudinary o URL, custom logo e Iglesia
// ════════════════════════════════════════════════════════════════════════════

app.get('/admin', (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') {
    return res.status(403).send(renderPage('No autorizado', `<div class="p-12 text-center text-ink flex flex-col justify-center items-center gap-4 max-w-md mx-auto my-12 bg-white border border border-[#E6DFD4] rounded-2xl shadow-sm">
      <div class="text-3xl text-maroon">⚠️</div>
      <p class="font-bold text-espresso text-base">Consola exclusiva para el Administrador.</p>
      <p class="text-xs text-ink2">Si las cookies normales del navegador se bloquean en el iframe de previsualización, usa este botón para iniciar sesión automáticamente y autorizar tu acceso al instante:</p>
      <div class="flex flex-col gap-2.5 w-full mt-4">
        <a href="/login-admin-bypass" class="bg-maroon hover:bg-gold text-white text-xs font-bold py-3 px-4 rounded-xl transition uppercase tracking-wider block shadow-sm">
          🔑 Entrar automáticamente como Administrador (sellerplusco)
        </a>
        <a href="/login" class="text-xs border border-border text-espresso hover:bg-cream2 py-2.5 px-4 rounded-xl transition font-bold block bg-cream">
          Loguearse con otra cuenta
        </a>
      </div>
    </div>`, req));
  }

  const catalog = infografias.loadCatalog();
  const blogCatalog = blog.loadBlog();
  const videosCatalog = videos.loadVideos();
  const podcastsCatalog = podcast.loadPodcasts();

  const html = `
    <div class="max-w-6xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between border-b pb-6 gap-4">
        <div class="flex flex-col">
          <h1 class="font-display font-bold text-3xl text-maroon tracking-wide">Consola de Administración Central</h1>
          <p class="text-ink-2 text-sm font-serif italic">Administra los recursos pastorales de CatólicosGPT: Infografías, Artículos de Blog con SEO IA, Videos y Podcasts de Spotify.</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs bg-gold text-white py-1 px-3.5 rounded font-mono font-bold uppercase tracking-widest">Admin central</span>
          <a href="/logout" class="text-xs border border-maroon text-maroon hover:bg-maroon hover:text-white py-1 px-3 rounded transition font-bold">Cerrar Sesión</a>
        </div>
      </div>

      <!-- SISTEMA DE TABS INTERACTIVO -->
      <div class="flex border-b border-[#E6DFD4] overflow-x-auto whitespace-nowrap gap-1">
        <button onclick="switchTab('infografias')" id="tab-btn-infografias" class="tab-btn px-5 py-3 font-semibold text-sm border-b-2 border-transparent text-ink-2 hover:text-maroon transition flex items-center gap-2">
          🎨 Infografías (${catalog.infografias.length})
        </button>
        <button onclick="switchTab('blog')" id="tab-btn-blog" class="tab-btn px-5 py-3 font-semibold text-sm border-b-2 border-transparent text-ink-2 hover:text-maroon transition flex items-center gap-2">
          ✍️ Blog de Formación (${blogCatalog.posts.length})
        </button>
        <button onclick="switchTab('videos')" id="tab-btn-videos" class="tab-btn px-5 py-3 font-semibold text-sm border-b-2 border-transparent text-ink-2 hover:text-maroon transition flex items-center gap-2">
          🎥 Videos Curados (${videosCatalog.videos.length})
        </button>
        <button onclick="switchTab('podcasts')" id="tab-btn-podcasts" class="tab-btn px-5 py-3 font-semibold text-sm border-b-2 border-transparent text-ink-2 hover:text-maroon transition flex items-center gap-2">
          🎙️ Podcasts Spotify (${podcastsCatalog.podcasts.length})
        </button>
      </div>

      <!-- TAB SECTIONS -->

      <!-- 1. INFOGRAFÍAS -->
      <div id="tab-content-infografias" class="tab-pane hidden flex flex-col gap-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="grid grid-cols-1 gap-6">
          <!-- Creador de Infografías Cloudinary (Soporte Carrusel & SEO IA) -->
          <div class="bg-white border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <h3 class="font-display font-semibold text-espresso text-lg border-b pb-2 flex items-center gap-2">
              📥 Registrar Infografía (URLs de Cloudinary / Carrusel)
            </h3>
            <p class="text-ink-2 text-xs leading-relaxed">Sube o ingresa múltiples imágenes de tu carrusel e incorpora meta-descripciones y palabras clave optimizadas por Inteligencia Artificial.</p>
            
            <form method="POST" action="/admin/crear-infografia-manual" id="infografiaManualForm" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm mt-2">
              <div class="flex flex-col gap-1.5">
                <label class="font-semibold text-espresso text-xs">Título de la Infografía</label>
                <input type="text" name="titulo" id="seo_titulo" required placeholder="Ej: Los 7 Sacramentos de la Iglesia" class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="font-semibold text-espresso text-xs">Tema / Santo o Enfoque</label>
                <input type="text" name="tema" id="seo_tema" required placeholder="Ej: Doctrina sacramental" class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
              </div>

              <div class="flex flex-col gap-1.5 md:col-span-2">
                <label class="font-semibold text-espresso text-xs">Categoría</label>
                <select name="categoria" id="seo_categoria" class="border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
                  <option value="doctrinal">Doctrina oficial</option>
                  <option value="santo">Vida de Santos</option>
                  <option value="devocional">Devoción y Plegarias</option>
                  <option value="serie">Serie de Formación</option>
                </select>
              </div>

              <div class="flex flex-col gap-1.5 md:col-span-2">
                <label class="font-semibold text-espresso text-xs">URLs de las Imágenes (Cloudinary / Directo, para carrusel introduce una por línea o comas)</label>
                <textarea name="imagenUrl" required placeholder="https://res.cloudinary.com/usuario/image/upload/v1/slide1.jpg&#10;https://res.cloudinary.com/usuario/image/upload/v1/slide2.jpg" rows="3" class="border border-[#D1C7BD] rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold font-mono text-xs leading-relaxed"></textarea>
              </div>

              <div class="flex flex-col gap-1.5 md:col-span-2 pt-2 border-t mt-1">
                <div class="flex items-center justify-between">
                  <label class="font-semibold text-espresso text-xs">Meta Descripción SEO</label>
                  <button type="button" onclick="generarSeoConIA()" id="btnGenerarSeo" class="bg-gold text-white text-[10px] px-3 py-1 rounded-md font-bold uppercase tracking-wider hover:bg-espresso transition flex items-center gap-1.5">
                    ✨ Generar SEO con IA
                  </button>
                </div>
                <textarea name="metaDescription" id="seo_desc" required placeholder="Presiona el botón superior para autogenerar o escribe un resumen para Google..." rows="2" class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs"></textarea>
              </div>
              
              <div class="flex flex-col gap-1.5 md:col-span-2">
                <label class="font-semibold text-espresso text-xs">Palabras clave (SEO, separadas por coma)</label>
                <input type="text" name="keywords" id="seo_keywords" placeholder="Presiona Generar SEO para autocompletar..." class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
              </div>

              <div class="md:col-span-2 pt-2 border-t">
                <button type="submit" class="w-full bg-[#1A412A] hover:bg-[#2E5E3D] text-white font-bold py-2.5 rounded-lg transition uppercase tracking-wider shadow duration-300 text-xs">
                  Guardar en Catálogo General &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>

        <script>
          async function generarSeoConIA() {
            const titulo = document.getElementById('seo_titulo').value.trim();
            const tema = document.getElementById('seo_tema').value.trim();
            const categoria = document.getElementById('seo_categoria').value;
            
            if (!titulo) {
              alert('Por favor ingresa primero el Título para poder generar el SEO.');
              return;
            }
            
            const btn = document.getElementById('btnGenerarSeo');
            const origHtml = btn.innerHTML;
            btn.innerHTML = '✨ Generando...';
            btn.disabled = true;
            
            try {
              const res = await fetch('/api/seo/generar-seo-infografia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titulo, tema, categoria })
              });
              const data = await res.json();
              if (data.error) {
                alert('Inconveniente al generar con IA: ' + data.error);
              } else {
                if (data.metaDescription) {
                  document.getElementById('seo_desc').value = data.metaDescription;
                }
                if (data.keywords) {
                  document.getElementById('seo_keywords').value = data.keywords;
                }
              }
            } catch(e) {
              alert('Error conectando con el servidor teológico.');
            } finally {
              btn.innerHTML = origHtml;
              btn.disabled = false;
            }
          }
        </script>
        </div>

        <!-- Lista -->
        <div class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <h3 class="font-display font-semibold text-espresso text-base flex items-center justify-between">
            <span>📋 Catálogo de Infografías Activas</span>
            <span class="text-xs text-ink-2 font-serif">${catalog.infografias.length} elementos</span>
          </h3>
          <div class="max-h-[300px] overflow-y-auto border border-border rounded-xl divide-y text-xs">
            ${catalog.infografias.length === 0 ? '<div class="p-4 text-center text-ink-2 italic">Sin infografías en memoria. Genera una o agrégala manualmente.</div>' : 
              catalog.infografias.map(i => `
                <div class="p-3 flex items-center justify-between hover:bg-cream/10">
                  <div class="flex items-center gap-3 truncate max-w-xl">
                    <img src="${(i.imagenes && i.imagenes[0] && i.imagenes[0].url) || ''}" class="w-10 h-10 object-cover rounded border bg-cream-2">
                    <div class="flex flex-col gap-0.5 truncate">
                      <span class="font-bold text-espresso">${i.titulo || i.tema}</span>
                      <span class="text-[10px] text-ink-2 truncate">Slug: <strong class="text-maroon">${i.slug}</strong> | Categoría: ${i.categoria || i.tipo}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <a href="/infografias/${i.slug}" target="_blank" class="text-maroon font-bold hover:underline">Ver</a>
                    <a href="/admin/eliminar-infografia?id=${i.id}" onclick="return confirm('¿Eliminar definitivamente?')" class="text-red-700 hover:underline">Eliminar</a>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>

      <!-- 2. BLOG DE FORMACIÓN -->
      <div id="tab-content-blog" class="tab-pane hidden flex flex-col gap-6">
        <div class="bg-white border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div class="border-b pb-2 flex flex-col md:flex-row items-baseline md:items-center justify-between">
            <h3 class="font-display font-semibold text-espresso text-lg flex items-center gap-2">
              ✍️ Crear / Editar Artículo de Formación Teológica
            </h3>
            <span class="text-xs text-gold font-bold">Generación de SEO con Inteligencia Artificial Integrada</span>
          </div>
          <p class="text-ink-2 text-xs leading-relaxed">Escribe un post de formación utilizando Markdown. Puedes enlazar recursos con los shortcodes: <code class="font-mono bg-cream-2 px-1 text-maroon">[infografia:slug]</code>, <code class="font-mono bg-cream-2 px-1 text-maroon">[video:slug]</code> o <code class="font-mono bg-cream-2 px-1 text-maroon">[podcast:slug]</code>.</p>
          
          <form method="POST" action="/admin/crear-blog" class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm mt-1">
            <div class="flex flex-col gap-1.5 md:col-span-2">
              <label class="font-semibold text-espresso text-xs">Título del Artículo</label>
              <input type="text" name="titulo" required placeholder="Ej: La Presencia Real de Cristo en la Eucaristía según San Agustín" class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-semibold text-espresso text-xs">Categoría Principal de Formación</label>
              <select name="categoria" class="border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
                <option value="catequesis">Catequesis y Doctrina</option>
                <option value="liturgia">Liturgia y Santa Misa</option>
                <option value="espiritualidad">Espiritualidad y Oración</option>
                <option value="santos">Vida de los Santos</option>
                <option value="biblia">Sagradas Escrituras (Biblia)</option>
                <option value="magisterio">Magisterio de la Iglesia</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5 md:col-span-3">
              <label class="font-semibold text-espresso text-xs">Contenido del Post (Formato Markdown completo)</label>
              <textarea name="contenidoMd" required rows="9" placeholder="# Título del Post\n\nContenido teológico y formativo...\n\n### Sacramentos de Iniciación\nDescribe el corpus del post utilizando formato estandar.\n\nPuedes incrustar una infografía escribiendo [infografia:slug-de-la-infografia] o videos con [video:slug-del-video]" class="border border-border rounded-lg px-4 py-2 font-mono outline-none focus:ring-2 focus:ring-gold text-xs"></textarea>
            </div>

            <div class="flex flex-col gap-1.5 md:col-span-3 bg-cream/40 p-4 border border-dashed rounded-xl gap-2">
              <div class="flex items-center gap-2">
                <input type="checkbox" name="useAiS_SEO" id="useAiS_SEO" value="1" checked class="w-4 h-4 text-maroon focus:ring-gold accent-maroon">
                <label for="useAiS_SEO" class="font-semibold text-espresso text-xs cursor-pointer select-none">Enriquecer SEO con IA de Gemini de fondo automáticamente al guardar</label>
              </div>
              <p class="text-[10px] text-ink-2 pl-6">Al dejar activada esta casilla, el motor de Gemini analizará tu título y contenido para redactar un título optimizado SEO, una meta-descripción amigable, palabras claves exactas católicas y extraer el lead del artículo de manera automatizada de inmediato.</p>
            </div>

            <div class="md:col-span-3 pt-2">
              <button type="submit" class="w-full bg-maroon hover:bg-gold text-white font-bold py-2.5 rounded-lg transition uppercase tracking-wider shadow duration-300 text-xs">
                Publicar Artículo Formativo &rarr;
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <h3 class="font-display font-semibold text-espresso text-base">📋 Artículos de Blog Publicados</h3>
          <div class="max-h-[300px] overflow-y-auto border border-border rounded-xl divide-y text-xs">
            ${blogCatalog.posts.length === 0 ? '<div class="p-4 text-center text-ink-2 italic">Sin posts de blog creados. Escribe el primero arriba.</div>' : 
              blogCatalog.posts.map(p => `
                <div class="p-3 flex items-center justify-between hover:bg-cream/10">
                  <div class="flex flex-col gap-0.5 truncate max-w-xl">
                    <span class="font-bold text-espresso">${p.titulo}</span>
                    <span class="text-[10px] text-ink-2 truncate">Slug: <strong class="text-gold-deep">${p.slug}</strong> | Cat: ${p.categoria} | Metadescripción SEO: ${p.descripcion || 'Sin optimización IA'}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <a href="/blog/${p.slug}" target="_blank" class="text-maroon font-bold hover:underline">Ver</a>
                    <a href="/admin/eliminar-blog?slug=${p.slug}" onclick="return confirm('¿Eliminar definitivamente el artículo?')" class="text-red-700 hover:underline">Eliminar</a>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>

      <!-- 3. CANALES Y VIDEOS (YOUTUBE) -->
      <div id="tab-content-videos" class="tab-pane hidden flex flex-col gap-6">
        <div class="bg-white border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <h3 class="font-display font-semibold text-espresso text-lg border-b pb-2">
            🎥 Agregar Video Formativo (YouTube Embed)
          </h3>
          <p class="text-ink-2 text-xs leading-relaxed">Inserta el enlace del video o el ID de YouTube. El sistema generará el embed correspondiente para enlazarlo en el chat o en la página de videos.</p>
          
          <form method="POST" action="/admin/crear-video" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm mt-1">
            <div class="flex flex-col gap-1.5 md:col-span-2">
              <label class="font-semibold text-espresso text-xs">Título del Video</label>
              <input type="text" name="titulo" required placeholder="Ej: Las partes de la Misa explicadas" class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-semibold text-espresso text-xs">ID de YouTube o Link Completo</label>
              <input type="text" name="youtubeId" required placeholder="Ej: wD1Vp83b4B0 o https://youtu.be/..." class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-semibold text-espresso text-xs">Nombre del Canal o Autor</label>
              <input type="text" name="canal" placeholder="Ej: Catholic Link" class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-semibold text-espresso text-xs">Categoría Teológica</label>
              <select name="categoria" class="border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
                <option value="liturgia">Liturgia y Santa Misa</option>
                <option value="apologetica">Apologética</option>
                <option value="catequesis">Catequesis General</option>
                <option value="musica">Música Sacra / Fe</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5 md:col-span-2">
              <label class="font-semibold text-espresso text-xs">Comentario Formativo (SEO y recomendación de chat)</label>
              <textarea name="comentario" required rows="2" placeholder="Describe brevemente de qué trata este video..." class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs"></textarea>
            </div>

            <div class="md:col-span-2 pt-2">
              <button type="submit" class="w-full bg-[#320E12] hover:bg-gold text-white font-bold py-2.5 rounded-lg transition uppercase tracking-wider shadow duration-300 text-xs">
                Guardar Video en Servidor &rarr;
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <h3 class="font-display font-semibold text-espresso text-base">📋 Catálogo de Videos Curados</h3>
          <div class="max-h-[300px] overflow-y-auto border border-border rounded-xl divide-y text-xs">
            ${videosCatalog.videos.length === 0 ? '<div class="p-4 text-center text-ink-2 italic">Sin videos curados. Añade uno arriba.</div>' : 
              videosCatalog.videos.map(v => `
                <div class="p-3 flex items-center justify-between hover:bg-cream/10">
                  <div class="flex items-center gap-3 truncate max-w-xl">
                    <img src="https://img.youtube.com/vi/${v.youtubeId}/default.jpg" class="w-12 h-9 object-cover rounded border">
                    <div class="flex flex-col gap-0.5 truncate">
                      <span class="font-bold text-espresso">${v.titulo}</span>
                      <span class="text-[10px] text-ink-2 truncate">YT ID: <strong class="text-maroon">${v.youtubeId}</strong> | Canal: ${v.canal} | Comentario: ${v.comentario}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <a href="/admin/eliminar-video?id=${v.id}" onclick="return confirm('¿Eliminar definitivamente este video?')" class="text-red-700 hover:underline">Eliminar</a>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>

      <!-- 4. PODCASTS (SPOTIFY) -->
      <div id="tab-content-podcasts" class="tab-pane hidden flex flex-col gap-6">
        <div class="bg-white border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <h3 class="font-display font-semibold text-espresso text-lg border-b pb-2">
            🎙️ Agregar Episodio o Show de Podcast (Spotify Embed)
          </h3>
          <p class="text-ink-2 text-xs leading-relaxed">Inserta el link de Spotify de un show o episodio completo. El sistema autocompondrá el reproductor flotante interactivo.</p>
          
          <form method="POST" action="/admin/crear-podcast" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm mt-1">
            <div class="flex flex-col gap-1.5 md:col-span-2">
              <label class="font-semibold text-espresso text-xs">Título del Podcast / Audio</label>
              <input type="text" name="titulo" required placeholder="Ej: La Biblia en un año — Episodio 1" class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
            </div>

            <div class="flex flex-col gap-1.5 md:col-span-2">
              <label class="font-semibold text-espresso text-xs">Enlace de Spotify (Show o Episode) o Código Iframe</label>
              <input type="text" name="spotifyUrl" required placeholder="Ej: https://open.spotify.com/show/4O7IitE99w5nO2n6B7tYfW o iframe completo..." class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-semibold text-espresso text-xs">Autor o Expositor</label>
              <input type="text" name="autor" placeholder="Ej: Fr. Mike Schmitz" class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-semibold text-espresso text-xs">Categoría</label>
              <select name="categoria" class="border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gold text-xs">
                <option value="biblia">Biblia y Sagradas Escrituras</option>
                <option value="catecismo">El Catecismo</option>
                <option value="oracion">Oración y Meditación</option>
                <option value="apologetica">Apologética</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5 md:col-span-2">
              <label class="font-semibold text-espresso text-xs">Descripción del Episodio (Sinopsis para el buscador)</label>
              <textarea name="descripcion" required rows="2" placeholder="Detalla de qué trata este audio..." class="border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-gold text-xs"></textarea>
            </div>

            <div class="md:col-span-2 pt-2">
              <button type="submit" class="w-full bg-[#1A412A] hover:bg-gold text-white font-bold py-2.5 rounded-lg transition uppercase tracking-wider shadow duration-300 text-xs">
                Incrustar Podcast &rarr;
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <h3 class="font-display font-semibold text-espresso text-base">📋 Podcasts en Canales</h3>
          <div class="max-h-[300px] overflow-y-auto border border-border rounded-xl divide-y text-xs">
            ${podcastsCatalog.podcasts.length === 0 ? '<div class="p-4 text-center text-ink-2 italic">Sin podcasts creados. ¡Añade tu canal arriba!</div>' : 
              podcastsCatalog.podcasts.map(p => `
                <div class="p-3 flex items-center justify-between hover:bg-cream/10">
                  <div class="flex flex-col gap-0.5 truncate max-w-xl">
                    <span class="font-bold text-espresso">${p.titulo}</span>
                    <span class="text-[10px] text-ink-2 truncate">Autor: ${p.autor} | Categoría: ${p.categoria} | URL: ${p.spotifyUrl || p.embedUrl}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <a href="/admin/eliminar-podcast?id=${p.id}" onclick="return confirm('¿Eliminar definitivamente este podcast?')" class="text-red-700 hover:underline">Eliminar</a>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>

    </div>

    <!-- SCRIPT CLIENT FLUID PARA ACTIVAR TABS Y GUARDAR PREFERENCIA EN HASH -->
    <script>
      function switchTab(name) {
        document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(btn => {
          btn.classList.remove('border-maroon', 'text-maroon', 'active');
          btn.classList.add('border-transparent', 'text-ink-2');
        });

        const activePane = document.getElementById('tab-content-' + name);
        const activeBtn = document.getElementById('tab-btn-' + name);
        if (activePane && activeBtn) {
          activePane.classList.remove('hidden');
          activeBtn.classList.remove('border-transparent', 'text-ink-2');
          activeBtn.classList.add('border-maroon', 'text-maroon', 'active');
        }
        window.location.hash = name;
      }

      // Cargar tab de la URL de ser aplicable
      window.addEventListener('DOMContentLoaded', () => {
        let hash = window.location.hash.replace('#', '') || 'infografias';
        if (!['infografias', 'blog', 'videos', 'podcasts'].includes(hash)) {
          hash = 'infografias';
        }
        switchTab(hash);
      });
    </script>
  `;
  res.send(renderPage('Admin Consola', html, req));
});

// Helper de extracción de IDs de Youtube
function extractYoutubeId(urlOrId) {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  if (trimmed.length === 11) return trimmed;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = trimmed.match(regExp);
  return (match && match[2].length === 11) ? match[2] : trimmed;
}

// Helper de estructuración de Podcast Spotify
function extractSpotifyInfo(url) {
  if (!url) return { embedUrl: '', spotifyUrl: '', embedHtml: '' };
  const trimmed = url.trim();
  if (trimmed.startsWith('<iframe')) {
    const srcMatch = trimmed.match(/src="([^"]+)"/);
    const src = srcMatch ? srcMatch[1] : '';
    return { embedUrl: src, spotifyUrl: src, embedHtml: trimmed };
  }
  let spotifyUrl = trimmed;
  let embedUrl = trimmed;
  if (trimmed.includes('spotify.com/show/')) {
    const parts = trimmed.split('/show/');
    const id = parts[1] ? parts[1].split('?')[0] : '';
    embedUrl = `https://open.spotify.com/embed/show/${id}`;
  } else if (trimmed.includes('spotify.com/episode/')) {
    const parts = trimmed.split('/episode/');
    const id = parts[1] ? parts[1].split('?')[0] : '';
    embedUrl = `https://open.spotify.com/embed/episode/${id}`;
  }
  const embedHtml = `<iframe style="border-radius:12px" src="${embedUrl}?utm_source=generator" width="100%" height="232" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
  return { spotifyUrl, embedUrl, embedHtml };
}

// API: GENERAR SEO PARA INFOGRAFÍA USANDO GEMINI (AJAX)
app.post('/api/seo/generar-seo-infografia', async (req, res) => {
  const { titulo, tema, categoria } = req.body;
  if (!titulo) return res.json({ error: 'Falta título' });

  try {
    const aiInstance = getAi();
    if (!aiInstance) return res.json({ metaDescription: `${titulo} — Formación espiritual católica profunda.`, keywords: 'catolico, fe, doctrina' });
    
    const seoPrompt = `Genera un metaDescription SEO y keywords para una infografía católica con la siguiente información:
Título: "${titulo}"
Tema/Santo: "${tema || 'Formación doctrinal'}"
Categoría: "${categoria || 'Doctrina'}"

Devuelve un JSON estrictamente con la estructura literal:
{
  "metaDescription": "Una descripción atractiva, enfocada en SEO de un máximo de 160 caracteres.",
  "keywords": "término1, término2, término3, ..."
}`;

    const response = await aiInstance.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: seoPrompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    
    const resText = response.text || '';
    const parsed = JSON.parse(resText);
    return res.json(parsed);
  } catch(e) {
    console.error('[SEO IA Infografía Error]', e.message);
    return res.json({ error: e.message });
  }
});

// ACCIÓN: CREAR INFOGRAFÍA MANUALMENTE CON CAMPOS DE SEO E IMÁGENES MÚLTIPLES (CARRUSEL)
app.post('/admin/crear-infografia-manual', async (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') return res.status(403).send('No autorizado');

  const { titulo, tema, categoria, imagenUrl, metaDescription, keywords } = req.body;
  if (!titulo || !tema || !imagenUrl) {
    return res.status(400).send('Falta información requerida.');
  }

  try {
    const slug = infografias.detectarTipo(titulo); // Generar slug
    const catalog = infografias.loadCatalog();
    catalog.infografias = catalog.infografias || [];
    
    const uniqueSlug = `${slug}-${Date.now().toString().slice(-4)}`;

    // Separar URLs por salto de línea o comas
    const urls = (imagenUrl || '').split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      return res.status(400).send('Debes proveer al menos una URL válida.');
    }

    const imagenesParaGuardar = urls.map((u, index) => ({
      url: u,
      slide: index + 1,
      model: 'manual-upload',
      formato: '1:1',
      sizeLabel: 'Cuadrado (1:1)'
    }));

    let finalDesc = metaDescription;
    let finalKeywords = keywords;

    // Si por alguna razón el SEO está vacío, realizamos auto-generación de contingencia
    if ((!finalDesc || !finalKeywords) && getAi()) {
      try {
        const aiInstance = getAi();
        const seoPrompt = `Genera un metaDescription SEO y keywords para una infografía católica con la siguiente información:
Título: "${titulo}"
Tema/Santo: "${tema}"
Categoría: "${categoria || 'Doctrina'}"

Devuelve un JSON estrictamente con la estructura literal:
{
  "metaDescription": "Una descripción atractiva, enfocada en SEO de un máximo de 160 caracteres.",
  "keywords": "término1, término2, término3, ..."
}`;
        const response = await aiInstance.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: seoPrompt,
          config: {
            responseMimeType: "application/json"
          }
        });
        
        const resText = response.text || '';
        const parsed = JSON.parse(resText);
        if (parsed.metaDescription) finalDesc = parsed.metaDescription;
        if (parsed.keywords) finalKeywords = parsed.keywords;
      } catch(e) {
        console.error('[SEO Auto Fallback Error]', e.message);
      }
    }

    if (!finalDesc) finalDesc = `${titulo} — CatolicosGPT`;
    if (!finalKeywords) finalKeywords = 'infografia, manual, fe, catolico';

    const newInf = {
      id: `inf-${Date.now()}`,
      slug: uniqueSlug,
      tema,
      tipo: categoria || 'doctrinal',
      categoria: categoria || 'doctrinal',
      titulo,
      metaDescription: finalDesc,
      altText: titulo,
      imagenes: imagenesParaGuardar,
      totalSlides: imagenesParaGuardar.length,
      formato: '1:1',
      userPlan: 'admin',
      userId: user.id,
      fechaCreacion: new Date().toISOString(),
      fechaISO: new Date().toISOString().slice(0, 10),
      publicado: true,
      keywords: finalKeywords
    };

    catalog.infografias.unshift(newInf);
    catalog.total = catalog.infografias.length;
    infografias.saveCatalog(catalog);

    res.redirect('/admin#infografias');
  } catch(e) {
    res.status(500).send('Error salvando infografia manual: ' + e.message);
  }
});

// ACCIÓN: CREAR POST DE BLOG CON OPCIÓN DE ENRIQUECIMIENTO IA (SEO AUTOMÁTICO)
app.post('/admin/crear-blog', async (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') return res.status(403).send('No autorizado');

  const { titulo, categoria, contenidoMd, useAiS_SEO } = req.body;
  if (!titulo || !contenidoMd) {
    return res.status(400).send('Faltan datos del artículo.');
  }

  try {
    let seoFields = {
      titulo: titulo,
      descripcion: `${titulo}. Formación espiritual católica profunda en CatólicosGPT.`,
      keywords: 'católico, teología, fe, blog, formación',
      altText: titulo,
      extracto: contenidoMd.slice(0, 150).replace(/[#*`]/g, '') + '...',
      categoria: categoria || 'catequesis'
    };

    const activeAi = getAi();
    if (useAiS_SEO === '1' && activeAi) {
      console.log('[Blog Admin SEO IA] Enriqueciendo artículo de blog con Gemini...');
      seoFields = await blog.enrichBlogWithAI(titulo, contenidoMd, activeAi);
    }

    const slug = blog.slugify(titulo);
    const finalPost = {
      slug,
      titulo: seoFields.titulo || titulo,
      categoria: seoFields.categoria || categoria || 'catequesis',
      contenidoMd,
      descripcion: seoFields.descripcion,
      keywords: seoFields.keywords,
      altText: seoFields.altText,
      extracto: seoFields.extracto,
      fechaCreacion: new Date().toISOString(),
      publicado: true
    };

    blog.upsertPost(finalPost);
    res.redirect('/admin#blog');
  } catch(e) {
    res.status(500).send('Error creando post de blog: ' + e.message);
  }
});

// ACCIÓN: ELIMINAR POST DE BLOG
app.get('/admin/eliminar-blog', (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') return res.status(403).send('No autorizado');
  
  const { slug } = req.query;
  if (slug) {
    blog.deletePost(slug);
  }
  res.redirect('/admin#blog');
});

// ACCIÓN: ANEXAR VIDEO DE YOUTUBE
app.post('/admin/crear-video', (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') return res.status(403).send('No autorizado');

  const { titulo, youtubeId, canal, categoria, comentario } = req.body;
  if (!titulo || !youtubeId) {
    return res.status(400).send('Título e ID/Link de YouTube requeridos.');
  }

  try {
    const rawCatalog = videos.loadVideos();
    rawCatalog.videos = rawCatalog.videos || [];
    
    const parsedYtId = extractYoutubeId(youtubeId);
    const cleanId = `vid-${Date.now()}`;
    const slug = blog.slugify(titulo);

    const newVideo = {
      id: cleanId,
      slug,
      titulo,
      canal: canal || 'Canal Católico',
      youtubeId: parsedYtId,
      comentario: comentario || 'Video sugerido para formación católica.',
      categoria: categoria || 'liturgia',
      publicado: true
    };

    rawCatalog.videos.push(newVideo);
    rawCatalog.total = rawCatalog.videos.length;
    videos.saveVideos(rawCatalog);

    res.redirect('/admin#videos');
  } catch(e) {
    res.status(500).send('Error guardando video: ' + e.message);
  }
});

// ACCIÓN: ELIMINAR VIDEO DE YOUTUBE
app.get('/admin/eliminar-video', (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') return res.status(403).send('No autorizado');

  const { id } = req.query;
  if (id) {
    const rawCatalog = videos.loadVideos();
    rawCatalog.videos = (rawCatalog.videos || []).filter(v => v.id !== id);
    rawCatalog.total = rawCatalog.videos.length;
    videos.saveVideos(rawCatalog);
  }
  res.redirect('/admin#videos');
});

// ACCIÓN: INCRUSTAR PODCAST DE SPOTIFY
app.post('/admin/crear-podcast', (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') return res.status(403).send('No autorizado');

  const { titulo, spotifyUrl, autor, categoria, descripcion } = req.body;
  if (!titulo || !spotifyUrl) {
    return res.status(400).send('Título y URL de Spotify requeridos.');
  }

  try {
    const rawCatalog = podcast.loadPodcasts();
    rawCatalog.podcasts = rawCatalog.podcasts || [];

    const { spotifyUrl: sUrl, embedUrl, embedHtml } = extractSpotifyInfo(spotifyUrl);
    const cleanId = `pod-${Date.now()}`;
    const slug = blog.slugify(titulo);

    const newPodcast = {
      id: cleanId,
      slug,
      titulo,
      autor: autor || 'Expositor de Fe',
      descripcion: descripcion || 'Audio formativo recomendado.',
      embedUrl,
      embedHtml,
      spotifyUrl: sUrl,
      categoria: categoria || 'oracion',
      publicado: true
    };

    rawCatalog.podcasts.push(newPodcast);
    rawCatalog.total = rawCatalog.podcasts.length;
    podcast.savePodcasts(rawCatalog);

    res.redirect('/admin#podcasts');
  } catch(e) {
    res.status(500).send('Error guardando podcast: ' + e.message);
  }
});

// ACCIÓN: ELIMINAR PODCAST DE SPOTIFY
app.get('/admin/eliminar-podcast', (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') return res.status(403).send('No autorizado');

  const { id } = req.query;
  if (id) {
    const rawCatalog = podcast.loadPodcasts();
    rawCatalog.podcasts = (rawCatalog.podcasts || []).filter(p => p.id !== id);
    rawCatalog.total = rawCatalog.podcasts.length;
    podcast.savePodcasts(rawCatalog);
  }
  res.redirect('/admin#podcasts');
});

app.get('/admin/eliminar-infografia', (req, res) => {
  const user = getAuthedUser(req);
  if (!user || user.plan !== 'admin') return res.status(403).send('No authorized');
  infografias.deleteInfografia(req.query.id);
  res.redirect('/admin#infografias');
});

// ════════════════════════════════════════════════════════════════════════════
// ACTIVACIÓN DEL ESCUCHADOR PUERTO 3000
// ════════════════════════════════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[CatólicosGPT v77] Servidor central corriendo en http://localhost:${PORT}`);
});
