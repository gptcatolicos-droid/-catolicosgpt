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
function buildPromptSantoDevocional(params, userPlan, customNombre, customLogo) {
  const { categoria, titulo, subtitulo, visual, puntos } = params;
  const branding = getBrandingBlock(userPlan, customNombre, customLogo);
  return `Create a professional Catholic devotional poster in portrait 2:3 format for a Catholic AI platform.
${branding}

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
function buildPromptSerie(slide, slideNum, totalSlides, userPlan, customNombre, customLogo) {
  const { titulo, subtitulo, descripcion, puntos, cita, tagline, visual, capitulo } = slide;
  const branding = getBrandingBlock(userPlan, customNombre, customLogo);
  const label = slideNum === 1 ? 'RESUMEN' : `CAPÍTULO ${capitulo || slideNum}`;
  return `Create slide ${slideNum} of ${totalSlides} for a Catholic educational series poster.
${branding}

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

  const text = r.choices[0].message.content.trim().replace(/```json|```/g,'');
  return JSON.parse(text);
}

// ── Upload a Cloudinary ──
async function uploadToCloudinary(imageData, slug, index = 0) {
  if (!process.env.CLOUDINARY_API_KEY) {
    console.warn('[Cloudinary] Sin credenciales — guardando URL temporal');
    return null;
  }
  try {
    const publicId = `catolicosgpt/infografias/${slug}-${index}-${Date.now()}`;
    const source = imageData.startsWith('http')
      ? imageData
      : `data:image/png;base64,${imageData}`;
    const result = await cloudinary.uploader.upload(source, {
      public_id: publicId, overwrite: false,
      quality: 'auto:best', fetch_format: 'auto',
      tags: ['catolicosgpt','infografia']
    });
    return result.secure_url;
  } catch(e) {
    console.error('[Cloudinary Upload]', e.message);
    return null;
  }
}

// ── Generar imagen con gpt-image-1 o DALL-E 3 ──
async function generarImagen(prompt, openai, formato = '9:16') {
  const sizes = SIZES[formato] || SIZES['9:16'];

  // gpt-image-1 primero
  try {
    const r = await openai.images.generate({
      model: 'gpt-image-1', prompt, n: 1,
      size: sizes.gpti, quality: 'medium'
    });
    return { data: r.data[0].b64_json, type: 'base64', model: 'gpt-image-1' };
  } catch(e) {
    console.log('[Image] gpt-image-1 →', e.message.slice(0,60), '| usando DALL-E 3');
  }

  // DALL-E 3 fallback
  const r = await openai.images.generate({
    model: 'dall-e-3', prompt: prompt.slice(0,4000), n: 1,
    size: sizes.dalle3, quality: 'standard', style: 'vivid'
  });
  return { data: r.data[0].url, type: 'url', model: 'dall-e-3' };
}

// ══════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ══════════════════════════════════════════════════════════════════
async function generarInfografia({ tema, tipo: tipoOverride, formato = '9:16', userId, userPlan = 'free', customNombre, customLogo, openai }) {
  const tipo    = tipoOverride || detectarTipo(tema);
  const esSerie = tipo === 'serie';
  const validFormato = SIZES[formato] ? formato : '9:16';

  console.log(`[Infografia] "${tema}" | tipo:${tipo} | formato:${validFormato} | plan:${userPlan}`);

  // 1. Parámetros
  const params = await buildInfografiaParams(tema, tipo, openai);
  const slug   = params.slug || generateSlug(tema);
  const totalSlides = esSerie ? (params.slides?.length || 4) : 1;

  // 2. Generar imágenes
  const imagenes = [];
  for (let i = 0; i < totalSlides; i++) {
    const prompt = esSerie
      ? buildPromptSerie(params.slides[i], i+1, totalSlides, userPlan, customNombre, customLogo)
      : buildPromptSantoDevocional(params, userPlan, customNombre, customLogo);

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
