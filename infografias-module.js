// ══════════════════════════════════════════════════════════════════
// CATOLICOSGPT v4.1 — MÓDULO DE INFOGRAFÍAS
// Branding diferenciado (free vs premium) + 3 formatos
// ══════════════════════════════════════════════════════════════════

const { v2: cloudinary } = require('cloudinary');
const fs   = require('fs');
const path = require('path');

// ── Cloudinary config ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Catálogo ──
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}
const CATALOG_PATH = path.join(DATA_DIR, 'infografias-catalog.json');
const CATALOG_BACKUP = path.join(__dirname, 'data', 'infografias-catalog.json');

function loadCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    if (data && data.infografias) return data;
  } catch(e) {}
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_BACKUP, 'utf-8'));
    if (data && data.infografias) return data;
  } catch(e) {}
  return { version:'5.0', total:0, categorias:[], infografias:[] };
}

function saveCatalog(c) {
  const nuevoTotal = (c && c.infografias) ? c.infografias.length : 0;
  if (nuevoTotal === 0) {
    try {
      const existente = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
      if (existente && existente.infografias && existente.infografias.length > 0) {
        console.error('[Catalog] ⛔ BLOQUEADO: intento de guardar catálogo VACÍO.');
        return false;
      }
    } catch(e) {}
  }
  if (c && c.infografias) {
    c.total = c.infografias.length;
    c.categorias = [...new Set(c.infografias.map(i => i.categoria || i.tipo).filter(Boolean))];
  }
  const json = JSON.stringify(c, null, 2);
  try { fs.writeFileSync(CATALOG_PATH, json, 'utf-8'); } catch(e) { console.error('[Catalog] Save error:', e.message); }
  if (nuevoTotal > 0) {
    try { fs.writeFileSync(CATALOG_BACKUP, json, 'utf-8'); } catch(e) {}
  }
  return true;
}

// ── Slug SEO ──
function generateSlug(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim().slice(0,60);
}

// ── Detectar tipo ──
function detectarTipo(tema, contenido = '') {
  const t = (tema+' '+contenido).toLowerCase();
  if (['encíclica','enciclica','capitulo','capítulo','doctrina social','serie','guía completa','todo sobre la','apologética completa','magnifica humanitas','catequesis sobre'].some(w => t.includes(w))) return 'serie';
  if (['santo','santa','san ','beato','beata','fiesta de','devocion de','devoción de','vida de','patrono'].some(w => t.includes(w))) return 'santo';
  if (['medalla','escapulario','rosario','novena','virgen de','sagrado corazón','divina misericordia'].some(w => t.includes(w))) return 'devocional';
  return 'doctrinal';
}

const SIZES = {
  '9:16': { gpti: '1024x1792', dalle3: '1024x1792', label: 'Instagram Stories / WhatsApp' },
  '1:1':  { gpti: '1024x1024', dalle3: '1024x1024', label: 'Square / Infografía rica' },
  '16:9': { gpti: '1792x1024', dalle3: '1792x1024', label: 'Presentación / Retiro' }
};

function getStyleInstructions(estilo) {
  const styles = {
    clasico: `
VISUAL STYLE: Clásico — Cream parchment elegant Catholic poster.
- PALETTE: Cream #F6F0E3 background, maroon #5E1B22 accents, ohcre gold #BC8A36, espresso #3B2415 text
- TYPOGRAPHY: Cormorant Garamond serif for titles (elegant italic), Cinzel for emblem, Montserrat for labels
- DECORATION: Double frame border in gold, small ornate cross emblem, hairline rules
- MOOD: Sacred, timeless, parchment-elegant, like an illuminated manuscript`,
    cinematic: `
VISUAL STYLE: Cinematic — Dark dramatic Catholic movie-poster aesthetic.
- PALETTE: Deep black #0d0a07 background, dramatic golden light #BC8A36-#E2BE6E, cream #F2E4C3 text
- TYPOGRAPHY: Cinzel serif for titles with text shadow, Cormorant Garamond italic for verses
- DECORATION: Radial gold light source from top, dramatic vignette, gold border frame
- MOOD: Cinematic chiaroscuro, dramatic light rays, deep shadows, golden bokeh, vintage film grain`,
    infantil: `
VISUAL STYLE: Infantil — Bright, playful, illustrated for children.
- PALETTE: Soft cream-pink-blue gradient background #FFF6E9 to #EAF4FF, vibrant accents (red #FF6B6B, yellow #FFD93C, green #7BC74D, blue #4DA6FF, purple #9B6BD6)
- TYPOGRAPHY: Montserrat bold rounded, colorful title words each in different color
- DECORATION: Cartoon sun with rays, fluffy clouds, dashed purple border card, rainbow color dots
- MOOD: Joyful, friendly, illustrated like a children's book, warm and approachable`,
  };
  return styles[estilo] || styles.clasico;
}

function getBrandingBlock(userPlan, customNombre, customLogo) {
  if (userPlan === 'premium' || userPlan === 'admin') {
    const nombre = customNombre || 'Mi Iglesia';
    return `
BRANDING (PREMIUM):
- TOP CENTER: "${nombre}" in elegant serif font, cream/gold color
- If a logo description is provided, include a simple symbolic icon matching: "${customLogo||'circular cross emblem'}"
- BOTTOM RIGHT CORNER: very small text "Generado con CatolicosGPT" in 8px gold italic — subtle watermark only
- NO CatolicosGPT logo in the main composition`;
  }
  return `
BRANDING (CATOLICOSGPT — MANDATORY, all elements must appear):
- TOP CENTER: Logo "CatólicosGPT" — circular emblem with cross/chalice/Bible symbol in metallic gold (#C9923A), then "CatólicosGPT" text where "Católicos" is cream/white serif and "GPT" is bright gold
- DECORATIVE DIVIDER: small ornate cross with thin horizontal lines below logo
- FOOTER: "www.catolicosgpt.com" centered small white text`;
}

function buildPromptSantoDevocional(params, userPlan, customNombre, customLogo, estilo = 'clasico') {
  const {
    titulo, subtitulo, intro, citaBiblica, virtudes = [], misiones = [],
    patronato = [], oracion, sabiasQue, citaFamosa, llamadaFinal, llamadaSec,
    visualPrincipal
  } = params;

  const safeVirtudes = virtudes.slice(0, 5);
  const safeMisiones = misiones.slice(0, 4);
  const safePatronato = patronato.slice(0, 4);

  const themes = {
    clasico: {
      palette: 'Cream parchment background #F5EDD8 with deep emerald green panels #1B3A2F, ochre gold #BC8A36 accents, dark espresso brown #3B2415 text. Floral lily decorations.',
      bg: 'Aged cream parchment paper with subtle texture',
      typography: 'Elegant classical serif (Cormorant Garamond / Cinzel) titles with golden capitals. Refined body text.',
      illustration: 'Classical oil painting style — warm Renaissance art with golden halos, soft chiaroscuro lighting, reverent atmosphere. Catholic religious painting tradition.',
      mood: 'Sacred, timeless, like an illuminated manuscript or vintage holy card. Liturgical elegance.'
    },
    cinematic: {
      palette: 'Deep matte black background #0d0a07 with dramatic golden light #BC8A36 to #E2BE6E gradients, cream #F2E4C3 text, dark vignettes.',
      bg: 'Dark cinematic black-brown with golden volumetric light beams from above',
      typography: 'Bold serif titles (Cinzel) with text shadows, gold metallic highlights. Cinematic movie-poster typography.',
      illustration: 'Photorealistic cinematic Catholic art with dramatic chiaroscuro — strong golden light from one direction, deep shadows, atmospheric vintage film grain. Like a religious epic film poster.',
      mood: 'Cinematic, reverent, dramatic. Golden light rays piercing darkness. Deep emotional power.'
    },
    infantil: {
      palette: 'Soft warm cream and sky-blue background, vibrant friendly colors — red #FF6B6B, yellow #FFC93C, green #7BC74D, blue #4DA6FF, purple #9B6BD6.',
      bg: 'Light cream-blue gradient with cartoon clouds, hearts, stars and soft decorative elements',
      typography: 'Rounded friendly bold sans-serif in colorful words. Kid-friendly large readable text.',
      illustration: 'Cute cartoon children-book style — round friendly faces, big expressive eyes, colorful illustrations. Like a modern catechism book for kids.',
      mood: 'Joyful, warm, encouraging. Cheerful and approachable.'
    }
  };
  const T = themes[estilo] || themes.clasico;

  const virtudesText = safeVirtudes.map(v =>
    `  - ${v.nombre} (icon: ${v.icono || 'cross'}): "${v.desc}"`
  ).join('\n');

  const misionesText = safeMisiones.map((m, i) =>
    `  ${i+1}. ${m.titulo}: small illustrated scene of "${m.escena}" with caption "${m.desc}"`
  ).join('\n');

  const patronatoText = safePatronato.map(p => `  - ${p}`).join('\n');

  return `Create a professional, RICH, MULTI-SECTION Catholic infographic poster in 1:1 square format. This is a DENSE EDUCATIONAL POSTER like a high-end Catholic catechism page — NOT a single image with title.

═══════════════════════════════════════════════════
GLOBAL DESIGN
═══════════════════════════════════════════════════
${T.palette}
Background: ${T.bg}
Typography: ${T.typography}
Illustration style: ${T.illustration}
Mood: ${T.mood}

═══════════════════════════════════════════════════
HEADER (top of poster, full width)
═══════════════════════════════════════════════════
TOP-LEFT: Logo "CatólicosGPT" — small ornate cross/Bible emblem in gold + text "CatólicosGPT" where "Católicos" is dark/cream and "GPT" is gold accent. Small but visible.

═══════════════════════════════════════════════════
SECTION 1 — TITLE BLOCK (top-left, large)
═══════════════════════════════════════════════════
Huge bold serif title: "${titulo}"
Smaller refined subtitle below: "${subtitulo || ''}"

═══════════════════════════════════════════════════
SECTION 2 — CENTRAL ILLUSTRATION (top-center, large)
═══════════════════════════════════════════════════
${visualPrincipal || 'Beautiful religious illustration of the subject.'}
This is the visual focus. Position prominently. Include a golden halo if it's a saint. Include symbolic flowers (white lilies for purity if relevant). Frame artistically.

═══════════════════════════════════════════════════
SECTION 3 — "¿QUIÉN FUE / QUÉ ES?" PANEL (top-right)
═══════════════════════════════════════════════════
Header in gold: "¿QUIÉN FUE ${titulo}?" (or "¿QUÉ ES?" if doctrine)
Body text (Spanish): "${intro}"

═══════════════════════════════════════════════════
SECTION 4 — "SUS VIRTUDES" GRID (middle-right)
═══════════════════════════════════════════════════
Header in gold ornamented: "SUS VIRTUDES"
Display 5 virtues as a HORIZONTAL ROW or 2-column grid, each with:
- Round icon in gold-filled circle
- Bold name in uppercase serif
- Short description below

VIRTUDES (render each clearly with its icon):
${virtudesText}

═══════════════════════════════════════════════════
SECTION 5 — "SU MISIÓN EN EL PLAN DE DIOS" (center band)
═══════════════════════════════════════════════════
Header in gold: "SU MISIÓN EN EL PLAN DE DIOS"
Row of 4 small framed illustration thumbnails, each with a caption underneath:
${misionesText}
Each thumbnail is a tiny scene illustrated in the same style as the main painting. Connect them as a narrative sequence.

═══════════════════════════════════════════════════
SECTION 6 — CITA BÍBLICA (decorative quote, lower-left)
═══════════════════════════════════════════════════
Beautiful quote-box with large opening quotation mark in gold:
"${citaBiblica?.texto || ''}"
Attribution: "— ${citaBiblica?.ref || ''}"

═══════════════════════════════════════════════════
SECTION 7 — "PATRONO DE / APLICACIONES" (lower-left)
═══════════════════════════════════════════════════
Header: "PATRONO DE"
Small icon list of patronages, each with a tiny relevant icon:
${patronatoText}

═══════════════════════════════════════════════════
SECTION 8 — "ORACIÓN A ${titulo}" (lower-center)
═══════════════════════════════════════════════════
Decorative scroll/panel with header: "ORACIÓN A ${titulo}"
Body italic prayer text:
"${oracion || ''}"

═══════════════════════════════════════════════════
SECTION 9 — "¿SABÍAS QUÉ?" (lower-right)
═══════════════════════════════════════════════════
Header in accent color: "¿SABÍAS QUÉ?"
Body: "${sabiasQue || ''}"

═══════════════════════════════════════════════════
SECTION 10 — FAMOUS QUOTE BAR (across bottom area)
═══════════════════════════════════════════════════
Large italic quote in elegant typography:
"${citaFamosa?.texto || ''}"
Below in smaller text: "${citaFamosa?.atribucion || ''}"

═══════════════════════════════════════════════════
SECTION 11 — FOOTER BAR (bottom full-width)
═══════════════════════════════════════════════════
Footer band with two calls to action side by side:
Left (with heart icon): "${llamadaFinal || ''}"
Right (with cross icon): "${llamadaSec || ''}"

═══════════════════════════════════════════════════
CRITICAL REQUIREMENTS
═══════════════════════════════════════════════════
- ALL TEXT IN PERFECT SPANISH — no typos, no English words
- All text must be CLEARLY READABLE with proper kerning
- Use a CLEAN GRID layout — sections should be visually distinct with subtle dividers
- The poster must feel DENSE and EDUCATIONAL, like a Catholic catechism page
- Sections should be balanced and harmonious, not cramped
- Use real symbolic Catholic iconography (lilies, halos, crosses, doves, scrolls)
- The composition is SQUARE FORMAT — design for that aspect ratio
- This is a PREMIUM EDITORIAL POSTER, not a simple greeting card

OUTPUT: A complete, dense, multi-section Catholic infographic poster ready for sharing in WhatsApp, Instagram or print, in the ${estilo} style.`;
}

function buildPromptSerie(slide, slideNum, totalSlides, userPlan, customNombre, customLogo, estilo = 'clasico') {
  const { titulo, subtitulo, descripcion, puntos, cita, tagline, visual, capitulo } = slide;
  const branding = getBrandingBlock(userPlan, customNombre, customLogo);
  const styleBlock = getStyleInstructions(estilo);
  const label = slideNum === 1 ? 'RESUMEN' : `CAPÍTULO ${capitulo || slideNum}`;
  return `Create slide ${slideNum} of ${totalSlides} for a Catholic educational series poster.
${branding}
${styleBlock}

SLIDE COUNTER: Top right corner "${slideNum}/${totalSlides}" in small gold text on dark pill

CHAPTER BADGE: Crimson rounded rectangle (#8B1A1A) with white uppercase text: "${label}"

MAIN TITLE (bold, large, uppercase): "${titulo}"
${subtitulo ? `Highlighted words in gold. Subtitle: "${subtitulo}"` : ''}

DESCRIPTION: Small italic text: "${descripcion}"

GOLDEN SEPARATOR: Thin horizontal line with ornate cross

KEY POINTS (3-5 with circular gold icon badges):
${puntos.map((p,i) => `[Icon ${i+1}] ${p}`).join('\n')}

QUOTE BLOCK (bordered box with large gold quotation marks ❝ ❞):
"${cita}"

BOTTOM TAGLINE BAR: Full-width dark crimson (#8B1A1A) bar with gold cross icon + uppercase: "${tagline}"

BACKGROUND: ${visual}

COLOR: Deep black-brown background, gold #C9923A, crimson #8B1A1A, white and cream text.
LAYOUT: Content on left 60%, atmospheric imagery right side + background.
STYLE: Cinematic Catholic movie poster. Professional viral social media format.`;
}

async function buildInfografiaParams(tema, tipo, openai) {
  if (!openai) throw new Error('Cliente de IA no configurado');
  
  const promptUser = `Genera el contenido COMPLETO para una infografía católica visual sobre: "${tema}"
Tipo: ${tipo}

Quiero contenido MUY RICO con múltiples secciones, como las infografías de catequesis profesionales. Responde SOLO JSON válido en español (sin markdown, sin backticks). Sigue EXACTAMENTE esta estructura:

{
  "slug": "url-slug-amigable",
  "titulo": "NOMBRE PRINCIPAL en mayúsculas (ej: SAN JOSÉ)",
  "subtitulo": "Epíteto descriptivo (ej: EL CUSTODIO DE JESÚS Y ESPOSO DE MARÍA)",
  "intro": "Párrafo de 3-4 líneas que presenta al santo/tema. Quién fue, por qué importa.",
  "citaBiblica": { "texto": "Cita bíblica relevante (1 oración)", "ref": "Mateo 1, 24" },
  "virtudes": [
    { "nombre": "JUSTO", "desc": "Frase de 8-12 palabras sobre esta virtud", "icono": "balanza" },
    { "nombre": "TRABAJADOR", "desc": "Frase de 8-12 palabras", "icono": "martillo" },
    { "nombre": "CASTO", "desc": "Frase de 8-12 palabras", "icono": "lirio" },
    { "nombre": "PROTECTOR", "desc": "Frase de 8-12 palabras", "icono": "escudo" },
    { "nombre": "OBEDIENTE", "desc": "Frase de 8-12 palabras", "icono": "corazon" }
  ],
  "misiones": [
    { "titulo": "ELEGIDO POR DIOS", "desc": "Descripción de 1-2 líneas", "escena": "Ángel se aparece a José en sueños" },
    { "titulo": "PROTECTOR DE LA SAGRADA FAMILIA", "desc": "Descripción de 1-2 líneas", "escena": "Huida a Egipto en burro" },
    { "titulo": "ENSEÑÓ A JESÚS", "desc": "Descripción de 1-2 líneas", "escena": "José y Jesús niño en el taller de carpintería" },
    { "titulo": "FORMÓ EL CORAZÓN DE JESÚS", "desc": "Descripción de 1-2 líneas", "escena": "José abrazando a Jesús niño" }
  ],
  "patronato": ["La Iglesia Universal", "Las familias", "Los trabajadores", "Una buena muerte"],
  "oracion": "Oración tradicional al santo/devoción (4-6 líneas completas)",
  "sabiasQue": "Dato curioso interesante de 2-3 líneas sobre el santo",
  "citaFamosa": { "texto": "Cita famosa o frase sobre el santo (1 línea poderosa)", "atribucion": "Atribución o contexto" },
  "llamadaFinal": "ACUDE A [SANTO] EN CADA NECESIDAD",
  "llamadaSec":  "ENCOMIENDA TU DÍA A [SANTO]",
  "visualPrincipal": "Descripción cinematográfica de 4-5 líneas de la imagen central: composición, iluminación, ambiente, símbolos visibles. Estilo de pintura católica clásica con halo dorado.",
  "altText": "Texto alt SEO para Google",
  "metaDescription": "Descripción SEO meta de 150 caracteres"
}

CRÍTICO:
- Si el tema es un santo, completa TODO con datos reales y verificados
- Si NO es santo (es doctrina/devoción), adapta las secciones coherentemente.
- TODO en español, contenido católico ortodoxo basado en el Magisterio`;

  let text = '';
  if (openai.models && typeof openai.models.generateContent === 'function') {
    // Gemini GoogleGenAI
    const r = await openai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: promptUser,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.4
      }
    });
    text = r.text || '';
  } else {
    // OpenAI client
    const r = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2500,
      temperature: 0.4,
      messages: [{
        role: 'system',
        content: 'Eres un experto en catequesis y diseño de infografías católicas. Generas contenido RICO y completo en español para infografías visuales tipo poster educativo.'
      }, {
        role: 'user',
        content: promptUser
      }]
    });
    text = r.choices[0].message.content.trim();
  }

  text = text.replace(/```json|```/g,'').trim();
  const firstBrace = text.indexOf('{');
  const lastBrace  = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text);
}

async function uploadToCloudinary(imageData, slug, index = 0, meta = {}) {
  // Safe default background or return if no credentials configured
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn('[Cloudinary] No configured credentials, returning source image direct.');
    return imageData;
  }
  try {
    const publicId = `catolicosgpt/infografias/${slug}-${index}-${Date.now()}`;
    let source;
    if (typeof imageData === 'string' && imageData.startsWith('http')) {
      source = imageData;
    } else if (typeof imageData === 'string' && imageData.length > 100) {
      source = `data:image/png;base64,${imageData}`;
    } else {
      throw new Error('imageData inválido');
    }
    const context = {
      slug,
      slide: String(index + 1),
      total_slides: String(meta.totalSlides || 1),
      es_carrusel: String(meta.esCarrusel || false),
      titulo: (meta.titulo || '').slice(0, 200),
      descripcion: (meta.descripcion || '').slice(0, 500),
      keywords: (meta.keywords || '').slice(0, 300),
      categoria: meta.categoria || 'devocional',
      tipo: meta.tipo || 'santo',
      fecha: meta.fecha || new Date().toISOString().slice(0, 10)
    };
    const result = await cloudinary.uploader.upload(source, {
      public_id: publicId, overwrite: false,
      quality: 'auto:best', fetch_format: 'auto',
      tags: ['catolicosgpt','infografia'],
      context
    });
    return result.secure_url;
  } catch(e) {
    console.error('[Cloudinary upload failed]', e.message);
    return imageData; // Fallback to raw data url
  }
}

async function generarImagen(prompt, openai, formato = '9:16') {
  const sizes = SIZES[formato] || SIZES['9:16'];
  
  if (openai.models && typeof openai.models.generateImages === 'function') {
    // Gemini Imagen model
    try {
      const modelToUse = 'imagen-4.0-generate-001';
      console.log(`[Imagen] Creating Catholic artwork using ${modelToUse}...`);
      const r = await openai.models.generateImages({
        model: modelToUse,
        prompt: prompt.slice(0, 4000),
        config: {
          numberOfImages: 1,
          aspectRatio: formato === '9:16' ? '9:16' : (formato === '16:9' ? '16:9' : '1:1'),
          outputMimeType: 'image/jpeg'
        }
      });
      const bytesStr = r.generatedImages[0].image.imageBytes;
      return { data: bytesStr, type: 'base64', model: modelToUse };
    } catch(err) {
      console.warn('[Gemini Imagen failed, trying generateContent as fallback]:', err.message);
      // Fallback with generateContent on gemini-3.1-flash-image
      try {
        const r = await openai.models.generateContent({
          model: 'gemini-3.1-flash-image',
          contents: { parts: [{ text: prompt }] },
          config: {
            imageConfig: {
              aspectRatio: formato
            }
          }
        });
        for (const part of r.candidates[0].content.parts) {
          if (part.inlineData) {
            return { data: part.inlineData.data, type: 'base64', model: 'gemini-3.1-flash-image' };
          }
        }
      } catch(errInner) {
        console.error('[Gemini image generation totally failed]', errInner.message);
        throw errInner;
      }
    }
  }

  // Legacy OpenAI DALL-E fallback
  try {
    const modelToUse = process.env.IMAGE_MODEL || 'dall-e-3';
    console.log(`[OpenAI DALL-E] Generating artwork using ${modelToUse}...`);
    const r = await openai.images.generate({
      model: modelToUse,
      prompt: prompt.slice(0, 4000),
      n: 1,
      size: sizes.dalle3,
      quality: 'standard'
    });
    const url = r.data[0].url;
    if (!url) throw new Error('Imagen vacía');
    return { data: url, type: 'url', model: modelToUse };
  } catch(e) {
    console.error(`[DALL-E] Generation failed: ${e.message}`);
    throw e;
  }
}

async function generarInfografia({ tema, tipo: tipoOverride, formato = '9:16', estilo = 'clasico', userId, userPlan = 'free', customNombre, customLogo, openai }) {
  const tipo = tipoOverride || detectarTipo(tema);
  const esSerie = tipo === 'serie';
  const validFormato = SIZES[formato] ? formato : '9:16';
  const validEstilo = ['clasico','cinematic','infantil'].includes(estilo) ? estilo : 'clasico';

  const params = await buildInfografiaParams(tema, tipo, openai);
  const slug = params.slug || generateSlug(tema);
  const totalSlides = esSerie ? (params.slides?.length || 4) : 1;

  const imagenes = [];
  for (let i = 0; i < totalSlides; i++) {
    const prompt = esSerie
      ? buildPromptSerie(params.slides?.[i] || params, i + 1, totalSlides, userPlan, customNombre, customLogo, validEstilo)
      : buildPromptSantoDevocional(params, userPlan, customNombre, customLogo, validEstilo);

    const img = await generarImagen(prompt, openai, validFormato);
    const cloudUrl = await uploadToCloudinary(img.data, slug, i, {
      totalSlides, esCarrusel: totalSlides > 1,
      titulo: params.titulo || tema,
      descripcion: params.metaDescription || '',
      keywords: params.keywords || '',
      categoria: params.categoria || tipo,
      tipo
    });

    imagenes.push({
      url: cloudUrl,
      slide: i + 1, model: img.model,
      formato: validFormato,
      sizeLabel: SIZES[validFormato].label
    });
  }

  const now = new Date();
  const infografia = {
    id: `inf-${Date.now()}`,
    slug, tema, tipo,
    categoria: params.categoria || tipo,
    titulo: esSerie ? tema : params.titulo,
    metaDescription: params.metaDescription || `Infografía católica sobre ${tema} — CatolicosGPT`,
    altText: params.altText || `Infografía ${tema} CatolicosGPT`,
    imagenes, totalSlides,
    formato: validFormato,
    userPlan,
    userId: userId || 'cron',
    fechaCreacion: now.toISOString(),
    fechaISO: now.toISOString().slice(0,10),
    publicado: true,
    keywords: [tema, tipo, 'católico', 'infografía', 'fe', 'CatolicosGPT'].join(', ')
  };

  const catalog = loadCatalog();
  catalog.infografias = catalog.infografias || [];
  catalog.infografias.unshift(infografia);
  catalog.total = catalog.infografias.length;
  saveCatalog(catalog);
  return infografia;
}

function getInfografias({ categoria, q, page=1, limit=20 } = {}) {
  const catalog = loadCatalog();
  let items = catalog.infografias.filter(i => i.publicado !== false);
  if (categoria && categoria !== 'all') items = items.filter(i => i.tipo===categoria || i.categoria===categoria);
  if (q) {
    const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    items = items.filter(i => {
      const text = ((i.titulo||'') + ' ' + (i.tema||'') + ' ' + (i.descripcion||'') + ' ' + (i.keywords||'') + ' ' + (i.categoria||'')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return text.includes(ql);
    });
  }
  const total = items.length;
  return { items: items.slice((page-1)*limit, page*limit), total, page, totalPages: Math.ceil(total/limit) };
}

function getInfografiaBySlug(slug) { return loadCatalog().infografias.find(i => i.slug===slug) || null; }
function deleteInfografia(id)      { const c=loadCatalog(); c.infografias=c.infografias.filter(i=>i.id!==id); c.total=c.infografias.length; saveCatalog(c); }

module.exports = { generarInfografia, detectarTipo, getInfografias, getInfografiaBySlug, deleteInfografia, loadCatalog, saveCatalog, SIZES };
