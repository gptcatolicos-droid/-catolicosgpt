// ════════════════════════════════════════════════════════════════
// BLOG MODULE — Artículos con Markdown + embed de infografías/videos
// Shortcodes:
//   [infografia:slug-de-infografia]  → renderiza card de infografía
//   [video:slug-de-video]            → renderiza embed YouTube
//   [podcast:slug-de-podcast]        → renderiza embed Spotify
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {} }
const BLOG_PATH = path.join(DATA_DIR, 'blog-catalog.json');
const BLOG_BACKUP = path.join(__dirname, 'data', 'blog-catalog.json');

function loadBlog() {
  try {
    const d = JSON.parse(fs.readFileSync(BLOG_PATH, 'utf-8'));
    if (d && d.posts) return d;
  } catch(e) {}
  try {
    const d = JSON.parse(fs.readFileSync(BLOG_BACKUP, 'utf-8'));
    if (d && d.posts) return d;
  } catch(e) {}
  return { version: '1.0', total: 0, posts: [] };
}

function saveBlog(c) {
  const json = JSON.stringify(c, null, 2);
  try { fs.writeFileSync(BLOG_PATH, json); } catch(e) { console.error('[Blog save]', e.message); }
  try { fs.writeFileSync(BLOG_BACKUP, json); } catch(e) {}
}

// Generar slug amigable desde título
function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Enrichment con IA — genera título SEO, descripción, keywords desde contenido
async function enrichBlogWithAI(title, contentMd, openai) {
  try {
    if (!openai) throw new Error('Client IA no configurado');
    const preview = (contentMd || '').slice(0, 2500);
    const promptContent = `Genera metadata SEO para este artículo de blog católico.

TÍTULO ORIGINAL: "${title}"

PRIMERAS PALABRAS DEL ARTÍCULO:
${preview}

Responde SOLO JSON válido en español (sin markdown, sin backticks):
{
  "titulo": "Título SEO optimizado (50-65 chars, descriptivo, atractivo)",
  "descripcion": "Meta descripción 140-160 chars que invita a leer",
  "keywords": "6-8 keywords católicas relevantes separadas por comas",
  "altText": "Texto alt SEO para la imagen destacada",
  "extracto": "Extracto / lead del artículo en 30-50 palabras (para preview en lista de blog)",
  "categoria": "una sola de: catequesis, doctrina, espiritualidad, santos, liturgia, magisterio, familia, oracion, biblia, apologetica"
}`;

    let text = '';
    
    if (openai.models && typeof openai.models.generateContent === 'function') {
      // Gemini GoogleGenAI
      const r = await openai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: promptContent,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3
        }
      });
      text = r.text || '';
    } else {
      // Legacy OpenAI compat
      const r = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        temperature: 0.3,
        messages: [{
          role: 'system',
          content: 'Eres experto en SEO católico. Generas metadata optimizada para artículos de blog católicos en español, basándote en el Magisterio.'
        }, {
          role: 'user',
          content: promptContent
        }]
      });
      text = r.choices[0].message.content.trim();
    }
    text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    const parsed = JSON.parse(text);
    return {
      titulo: parsed.titulo || title,
      descripcion: parsed.descripcion || '',
      keywords: parsed.keywords || '',
      altText: parsed.altText || parsed.titulo || title,
      extracto: parsed.extracto || '',
      categoria: parsed.categoria || 'catequesis'
    };
  } catch(e) {
    console.error('[Blog AI] Error:', e.message);
    return {
      titulo: title,
      descripcion: '',
      keywords: 'católico, fe, blog',
      altText: title,
      extracto: '',
      categoria: 'catequesis'
    };
  }
}

// Parser Markdown → HTML (simple pero suficiente)
function parseMarkdown(md) {
  if (!md) return '';
  let html = md;

  // Code blocks (proteger primero)
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => {
    codeBlocks.push(`<pre><code class="lang-${lang}">${code.replace(/</g, '&lt;')}</code></pre>`);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  // Headings
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold/italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Links and images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" style="max-width:100%;border-radius:10px;margin:14px 0">');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/(<\/blockquote>)\n(<blockquote>)/g, '\n');

  // Lists
  html = html.replace(/^(\s*)[-*] (.+)$/gm, '$1<li>$2</li>');
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, '$1<li class="ol">$2</li>');
  // Wrap consecutive <li>
  html = html.replace(/(<li>.+<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
  html = html.replace(/(<li class="ol">.+<\/li>\n?)+/g, m => '<ol>' + m.replace(/class="ol"/g, '') + '</ol>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr>');

  // Paragraphs (líneas no vacías que no son tags)
  const blocks = html.split(/\n\n+/);
  html = blocks.map(b => {
    b = b.trim();
    if (!b) return '';
    if (/^<(h[1-6]|ul|ol|blockquote|hr|pre|img|div|p|figure)/.test(b)) return b;
    if (b.startsWith('\x00CODE')) return b;
    // No envolver shortcodes en <p> (sino se genera HTML inválido al reemplazar por <figure>)
    if (/^\[(infografia|video|podcast):[\w-]+\]$/.test(b)) return b;
    return '<p>' + b + '</p>';
  }).join('\n\n');

  // Restaurar code blocks
  html = html.replace(/\x00CODE(\d+)\x00/g, (m, i) => codeBlocks[parseInt(i)]);

  return html;
}

// Renderiza shortcodes [infografia:slug], [video:slug], [podcast:slug]
function renderShortcodes(html, opts = {}) {
  const { getInfografia, getVideo, getPodcast } = opts;

  // [infografia:slug]
  html = html.replace(/\[infografia:([\w-]+)\]/g, (m, slug) => {
    const inf = getInfografia && getInfografia(slug);
    if (!inf) return `<div class="shortcode-error" style="padding:14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;font-size:13px">⚠️ Infografía "${slug}" no encontrada</div>`;
    const img = inf.imagenes?.[0]?.url || '';
    return `<figure class="embed-infografia" style="margin:24px 0;padding:0;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:#fff">
      <a href="/infografias/${inf.slug}" style="text-decoration:none;color:inherit;display:block">
        ${img ? `<img src="${img}" alt="${inf.altText || inf.titulo || ''}" style="width:100%;display:block">` : ''}
        <figcaption style="padding:14px 18px;background:var(--cream-2)">
          <div style="font-family:var(--font-display);font-weight:600;font-size:16px;color:var(--espresso)">${inf.titulo || inf.tema}</div>
          ${inf.descripcion ? `<div style="font-size:13px;color:var(--ink-2);margin-top:4px">${inf.descripcion.slice(0, 140)}</div>` : ''}
          <div style="font-size:12px;color:var(--gold-deep);margin-top:6px;font-weight:600">Ver infografía completa →</div>
        </figcaption>
      </a>
    </figure>`;
  });

  // [video:slug]
  html = html.replace(/\[video:([\w-]+)\]/g, (m, slug) => {
    const v = getVideo && getVideo(slug);
    if (!v) return `<div class="shortcode-error" style="padding:14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;font-size:13px">⚠️ Video "${slug}" no encontrado</div>`;
    return `<figure class="embed-video" style="margin:24px 0">
      <div style="aspect-ratio:16/9;border-radius:14px;overflow:hidden;box-shadow:var(--shadow-md);background:#000">
        <iframe src="https://www.youtube.com/embed/${v.youtubeId}?rel=0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" style="width:100%;height:100%;border:0;display:block"></iframe>
      </div>
      <figcaption style="font-size:13px;color:var(--ink-2);margin-top:8px;text-align:center;font-style:italic">${v.titulo}</figcaption>
    </figure>`;
  });

  // [podcast:slug]
  html = html.replace(/\[podcast:([\w-]+)\]/g, (m, slug) => {
    const p = getPodcast && getPodcast(slug);
    if (!p) return `<div class="shortcode-error" style="padding:14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;font-size:13px">⚠️ Podcast "${slug}" no encontrado</div>`;
    return `<figure class="embed-podcast" style="margin:24px 0">
      <div style="border-radius:14px;overflow:hidden;box-shadow:var(--shadow-md)">
        ${p.embedHtml || `<iframe src="${p.embedUrl}" width="100%" height="232" frameborder="0" allowtransparency="true" allow="encrypted-media" style="border-radius:12px;border:0;display:block"></iframe>`}
      </div>
      <figcaption style="font-size:13px;color:var(--ink-2);margin-top:8px;text-align:center;font-style:italic">${p.titulo}</figcaption>
    </figure>`;
  });

  return html;
}

function getPosts({ categoria = null, q = null, page = 1, limit = 12 } = {}) {
  const catalog = loadBlog();
  let items = (catalog.posts || []).filter(p => p.publicado !== false);
  if (categoria) items = items.filter(p => p.categoria === categoria);
  if (q) {
    const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    items = items.filter(p => {
      const text = `${p.titulo||''} ${p.descripcion||''} ${p.keywords||''} ${p.categoria||''} ${p.contenidoMd||''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return text.includes(ql);
    });
  }
  // Ordenar por fecha desc
  items.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
  const total = items.length;
  const start = (page - 1) * limit;
  return { total, page, limit, items: items.slice(start, start + limit) };
}

function getPostBySlug(slug) {
  const catalog = loadBlog();
  return (catalog.posts || []).find(p => p.slug === slug);
}

function deletePost(slug) {
  const catalog = loadBlog();
  const before = (catalog.posts || []).length;
  catalog.posts = (catalog.posts || []).filter(p => p.slug !== slug);
  catalog.total = catalog.posts.length;
  saveBlog(catalog);
  return before !== catalog.posts.length;
}

function escapeHtml(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function upsertPost(post) {
  const catalog = loadBlog();
  catalog.posts = catalog.posts || [];
  const idx = catalog.posts.findIndex(p => p.slug === post.slug);
  if (idx >= 0) {
    catalog.posts[idx] = { ...catalog.posts[idx], ...post, fechaModificacion: new Date().toISOString() };
  } else {
    post.fechaCreacion = post.fechaCreacion || new Date().toISOString();
    catalog.posts.unshift(post);
  }
  catalog.total = catalog.posts.length;
  saveBlog(catalog);
  return idx >= 0 ? catalog.posts[idx] : catalog.posts[0];
}

module.exports = {
  loadBlog, saveBlog, slugify, enrichBlogWithAI,
  parseMarkdown, renderShortcodes, escapeHtml, upsertPost,
  getPosts, getPostBySlug, deletePost
};
