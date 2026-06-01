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
const CATALOG_PATH = path.join(__dirname, 'data', 'infografias-catalog.json');
function loadCatalog() { try { return JSON.parse(fs.readFileSync(CATALOG_PATH,'utf-8')); } catch(e) { return { version:'4.1', total:0, categorias:[], infografias:[] }; } }
function saveCatalog(c) { fs.writeFileSync(CATALOG_PATH, JSON.stringify(c,null,2),'utf-8'); }

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

// ── Tamaños de imagen por formato ──
const SIZES = {
  '9:16': { gpti: '1024x1536', dalle3: '1024x1792', label: 'Instagram Stories / WhatsApp' },
  '1:1':  { gpti: '1024x1024', dalle3: '1024x1024', label: 'Square / Feed' },
  '16:9': { gpti: '1536x1024', dalle3: '1792x1024', label: 'Presentación / Retiro' }
};

// ══════════════════════════════════════════════════════════════════
// BRANDING — Free usa CatolicosGPT, Premium usa logo propio
// ══════════════════════════════════════════════════════════════════


// ── Helper: instrucción visual según estilo visual elegido (3 BrandGrids) ──
function getStyleInstructions(estilo) {
  const styles = {
    clasico: `
VISUAL STYLE: Clásico — Cream parchment elegant Catholic poster.
- PALETTE: Cream #F6F0E3 background, maroon #5E1B22 accents, ochre gold #BC8A36, espresso #3B2415 text
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
  // Free — full CatolicosGPT brand
  return `
BRANDING (CATOLICOSGPT — MANDATORY, all elements must appear):
- TOP CENTER: Logo "CatólicosGPT" — circular emblem with cross/chalice/Bible symbol in metallic gold (#C9923A), then "CatólicosGPT" text where "Católicos" is cream/white serif and "GPT" is bright gold
- DECORATIVE DIVIDER: small ornate cross with thin horizontal lines below logo
- FOOTER: "www.catolicosgpt.com" centered small white text`;
}

// ── PROMPT: Santo / Devocional (post único) ──
function buildPromptSantoDevocional(params, userPlan, customNombre, customLogo, estilo = 'clasico') {
  const { categoria, titulo, subtitulo, visual, puntos } = params;
  const branding = getBrandingBlock(userPlan, customNombre, customLogo);
  const styleBlock = getStyleInstructions(estilo);
  return `Create a professional Catholic devotional poster in portrait 2:3 format for a Catholic AI platform.
${branding}
${styleBlock}

GOLD RIBBON BANNER (below logo/header): Horizontal metallic gold gradient scroll with dark brown serif text: "${categoria}"

TITLE BLOCK:
Large elegant serif font: "${titulo}"
${subtitulo ? `Gold italic subtitle: "${subtitulo}"` : ''}

CENTRAL IMAGE (40-50% of poster):
${visual}
Style: Photorealistic classical Catholic painting OR cinematic photograph. Warm dramatic golden-amber lighting. Chiaroscuro. Professional art quality.

BULLET POINTS (lower section):
${puntos.map(p => `✓ ${p}`).join('\n')}

COLOR PALETTE: Dark warm brown-black background, gold #C9923A accents, cream #F5EDD8 text, dark vignette.
TYPOGRAPHY: Bold Trajan/Cinzel-style serif titles. Gold highlighted words. Clean readable sans-serif for bullets.
STYLE: Cinematic Catholic movie poster. Dramatic light rays. Deep shadows. Golden bokeh. Vintage film grain. Professional quality.
CRITICAL: All text must be clearly readable with high contrast.`;
}

// ── PROMPT: Serie educativa (4 slides) ──
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

// ── Construir parámetros desde GPT-4o ──
async function buildInfografiaParams(tema, tipo, openai) {
  const typeInstructions = {
    santo:      'saint name, feast date, 3 key points about life/example, visual description (classical painting with halo), ribbon label',
    devocional: 'devotion name, category label (e.g. "Todo sobre"), 3 points about history/promises/prayers, visual description',
    serie:      '4 chapters with titles, 3-5 points each, one key quote per chapter, tagline for bottom bar, visual per slide',
    doctrinal:  'doctrine topic, category label, 3 key points, visual description'
  };

  const r = await openai.chat.completions.create({
    model: 'gpt-4o', max_tokens: 1800, temperature: 0.3,
    messages: [{ role: 'user', content: `Build a Catholic infographic for CatolicosGPT about: "${tema}"
Type: ${tipo}
Extract: ${typeInstructions[tipo]||typeInstructions.doctrinal}
Respond ONLY valid JSON in Spanish. No markdown, no backticks.

For santo/devocional/doctrinal:
{"categoria":"ribbon label","titulo":"main title 2-3 lines","subtitulo":"date or subtitle (optional)","visual":"3-4 sentence visual description for AI image generation","puntos":["point 1","point 2","point 3"],"slug":"url-slug","altText":"SEO alt text","metaDescription":"150 char description"}

For serie:
{"slug":"url-slug","altText":"SEO alt","metaDescription":"150 char","slides":[{"capitulo":1,"titulo":"UPPERCASE TITLE","subtitulo":"subtitle","descripcion":"1-2 lines","puntos":["p1","p2","p3"],"cita":"key quote","tagline":"BOTTOM TAGLINE UPPERCASE","visual":"visual description"}]}` }]
  });

  let text = r.choices[0].message.content.trim().replace(/```json|```/g,'');
  // Robust JSON extraction: find first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace  = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(text);
  } catch(parseErr) {
    console.error('[buildInfografiaParams] JSON parse error:', parseErr.message);
    console.error('[buildInfografiaParams] Raw text (first 300):', text.slice(0, 300));
    // Fallback: build minimal params manually from tema
    return {
      categoria: tipo === 'santo' ? 'SANTO DEL DÍA' : tipo === 'devocional' ? 'DEVOCIÓN' : 'REFLEXIÓN',
      titulo: tema.length < 50 ? tema : tema.slice(0, 50),
      subtitulo: '',
      visual: `Beautiful Catholic religious art depicting ${tema}. Classical painting style with warm dramatic lighting, gold accents, reverent atmosphere.`,
      puntos: [
        'Una reflexión profunda sobre la fe',
        'Inspirado en el Magisterio de la Iglesia',
        'Para compartir y orar en familia'
      ],
      slug: generateSlug(tema),
      altText: `Infografía católica sobre ${tema}`,
      metaDescription: `Infografía católica sobre ${tema}. Descarga gratis para compartir tu fe en WhatsApp e Instagram.`.slice(0, 155)
    };
  }
}

// ── Upload a Cloudinary ──
async function saveImageLocally(imageData, slug, index) {
  // Fallback: guardar imagen en disco y servirla via endpoint
  const imgDir  = path.join(__dirname, 'public', 'infografias');
  const imgFile = `${slug}-${index}.png`;
  const imgPath = path.join(imgDir, imgFile);
  try {
    if (!require('fs').existsSync(imgDir)) require('fs').mkdirSync(imgDir, { recursive: true });
    if (imageData && imageData.length > 100) {
      require('fs').writeFileSync(imgPath, Buffer.from(imageData, 'base64'));
      return `/infografias/${imgFile}`;
    }
  } catch(e) { console.error('[LocalSave]', e.message); }
  return null;
}

async function uploadToCloudinary(imageData, slug, index = 0) {
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn('[Cloudinary] Sin credenciales — usando almacenamiento local');
    return saveImageLocally(imageData, slug, index);
  }
  try {
    const publicId = `catolicosgpt/infografias/${slug}-${index}-${Date.now()}`;
    let source;
    if (typeof imageData === 'string' && imageData.startsWith('http')) {
      source = imageData; // URL directa (DALL-E 3)
    } else if (typeof imageData === 'string' && imageData.length > 100) {
      source = `data:image/png;base64,${imageData}`; // base64 (gpt-image-1)
    } else {
      throw new Error('imageData inválido: ' + (typeof imageData) + ' len=' + (imageData ? imageData.length : 0));
    }
    console.log('[Cloudinary] Subiendo imagen slug=' + slug + ' index=' + index + ' sourceType=' + (imageData.startsWith('http') ? 'URL' : 'base64'));
    const result = await cloudinary.uploader.upload(source, {
      public_id: publicId, overwrite: false,
      quality: 'auto:best', fetch_format: 'auto',
      tags: ['catolicosgpt','infografia']
    });
    console.log('[Cloudinary] ✅ OK:', result.secure_url);
    return result.secure_url;
  } catch(e) {
    console.error('[Cloudinary Upload] ❌', e.message);
    // Fallback a almacenamiento local si el imageData es base64
    if (typeof imageData === 'string' && !imageData.startsWith('http')) {
      return saveImageLocally(imageData, slug, index);
    }
    return null;
  }
}

// ── Generar imagen SOLO con gpt-image-1 (modelo más reciente de OpenAI) ──
async function generarImagen(prompt, openai, formato = '9:16') {
  const sizes = SIZES[formato] || SIZES['9:16'];
  // Intentar 2 veces gpt-image-1 (sin fallback a DALL-E 3 — solo el modelo más reciente)
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[Image] gpt-image-1 intento ${attempt}/2 — ${sizes.gpti} — ${prompt.slice(0,60)}...`);
      const r = await openai.images.generate({
        model: 'gpt-image-1',
        prompt: prompt.slice(0, 4000),
        n: 1,
        size: sizes.gpti,
        quality: 'high'
      });
      const b64 = r.data[0].b64_json;
      if (!b64) throw new Error('gpt-image-1: respuesta vacía');
      console.log(`[Image] ✅ gpt-image-1 OK (intento ${attempt})`);
      return { data: b64, type: 'base64', model: 'gpt-image-1' };
    } catch(e) {
      lastError = e;
      console.error(`[Image] ❌ gpt-image-1 intento ${attempt}: ${e.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
    }
  }
  // Si después de 2 intentos sigue fallando, lanzar error claro (NO usar DALL-E 3)
  throw new Error('No se pudo generar la imagen con gpt-image-1: ' + (lastError?.message || 'error desconocido'));
}

// ══════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ══════════════════════════════════════════════════════════════════
async function generarInfografia({ tema, tipo: tipoOverride, formato = '9:16', estilo = 'clasico', userId, userPlan = 'free', customNombre, customLogo, openai }) {
  const tipo    = tipoOverride || detectarTipo(tema);
  const esSerie = tipo === 'serie';
  const validFormato = SIZES[formato] ? formato : '9:16';

  const validEstilo = ['clasico','cinematic','infantil'].includes(estilo) ? estilo : 'clasico';
  console.log(`[Infografia] "${tema}" | tipo:${tipo} | formato:${validFormato} | estilo:${validEstilo} | plan:${userPlan}`);

  // 1. Parámetros
  const params = await buildInfografiaParams(tema, tipo, openai);
  const slug   = params.slug || generateSlug(tema);
  const totalSlides = esSerie ? (params.slides?.length || 4) : 1;

  // 2. Generar imágenes
  const imagenes = [];
  for (let i = 0; i < totalSlides; i++) {
    const prompt = esSerie
      ? buildPromptSerie(params.slides[i], i+1, totalSlides, userPlan, customNombre, customLogo, validEstilo)
      : buildPromptSantoDevocional(params, userPlan, customNombre, customLogo, validEstilo);

    const img      = await generarImagen(prompt, openai, validFormato);
    const cloudUrl = await uploadToCloudinary(img.data, slug, i);

    imagenes.push({
      url: cloudUrl || `https://placeholder.catolicosgpt.com/${slug}-${i}`,
      slide: i+1, model: img.model,
      formato: validFormato,
      sizeLabel: SIZES[validFormato].label
    });
    console.log(`[Infografia] Slide ${i+1}/${totalSlides} OK`);
  }

  // 3. Guardar en catálogo
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
  catalog.infografias.unshift(infografia);
  catalog.total = catalog.infografias.length;
  saveCatalog(catalog);
  return infografia;
}

// ── Consultas del catálogo ──
function getInfografias({ categoria, page=1, limit=20 } = {}) {
  const catalog = loadCatalog();
  let items = catalog.infografias.filter(i => i.publicado !== false);
  if (categoria && categoria !== 'all') items = items.filter(i => i.tipo===categoria || i.categoria===categoria);
  const total = items.length;
  return { items: items.slice((page-1)*limit, page*limit), total, page, totalPages: Math.ceil(total/limit) };
}
function getInfografiaBySlug(slug) { return loadCatalog().infografias.find(i => i.slug===slug) || null; }
function deleteInfografia(id)      { const c=loadCatalog(); c.infografias=c.infografias.filter(i=>i.id!==id); c.total=c.infografias.length; saveCatalog(c); }

module.exports = { generarInfografia, detectarTipo, getInfografias, getInfografiaBySlug, deleteInfografia, loadCatalog, saveCatalog, SIZES };
