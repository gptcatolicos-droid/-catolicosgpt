// ══════════════════════════════
// STATE
// ══════════════════════════════
let sbOpen = false;
let isLoading = false;
let currentLang = 'es';
let chatHistory = [];
let currentStream = null; // AbortController para cancelar streaming
let isStreaming = false;
let conversations = JSON.parse(localStorage.getItem('cgpt_convs') || '[]');
let lastBotText = '';

const i18n = {
  es: {
    placeholder: 'Pregunta sobre fe, oración, santos, moral…',
    hint: 'CatolicosGPT · Basado en el Magisterio y Vatican.va',
    welcome: '¿En qué puedo ayudarte, <em>hermano</em>?',
    you: 'TÚ', error: 'Error de conexión. Intenta de nuevo.', errorAI: 'Hubo un error. Intenta de nuevo.'
  },
  en: {
    placeholder: 'Ask about faith, prayer, saints, morality…',
    hint: 'CatolicosGPT · Based on the Magisterium and Vatican.va',
    welcome: 'How can I help you, <em>brother</em>?',
    you: 'YOU', error: 'Connection error. Try again.', errorAI: 'An error occurred. Try again.'
  }
};

// ══════════════════════════════
// SIDEBAR
// ══════════════════════════════
function toggleSb() { sbOpen ? closeSb() : openSb(); }
function openSb() {
  document.getElementById('sb').classList.add('open');
  document.getElementById('overlay').classList.add('show');
  sbOpen = true; renderHistory();
}
function closeSb() {
  document.getElementById('sb').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  sbOpen = false;
}

// ══════════════════════════════
// HISTORY
// ══════════════════════════════
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!conversations.length) {
    el.innerHTML = '<div style="padding:6px 14px;font-family:Lora,serif;font-size:12px;color:var(--ink4);font-style:italic">Sin conversaciones aún</div>';
    return;
  }
  el.innerHTML = conversations.slice(-10).reverse().map((c, i) =>
    `<div class="sb-item" onclick="loadConv(${conversations.length-1-i});closeSb()">
      <div class="sb-ico">💬</div>
      <span class="sb-lbl">${esc(c.title)}</span>
      <span class="sb-time">${c.time}</span>
    </div>`
  ).join('');
}

function saveConversation(title) {
  const now = new Date();
  const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');
  conversations.push({ title: title.slice(0,42), time, messages: [...chatHistory] });
  if (conversations.length > 20) conversations.shift();
  localStorage.setItem('cgpt_convs', JSON.stringify(conversations));
}

function loadConv(i) {
  const c = conversations[i];
  chatHistory = [...c.messages];
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'block';
  document.getElementById('chat-inner').innerHTML = '';
  c.messages.forEach(m => renderBubble(m.content, m.role === 'user', false));
}

// ══════════════════════════════
// LANG
// ══════════════════════════════
function setLang(l, btn) {
  currentLang = l;
  document.querySelectorAll('.lang-sw button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('cin').placeholder = i18n[l].placeholder;
  document.getElementById('input-hint').textContent = i18n[l].hint;
  document.getElementById('w-title').innerHTML = i18n[l].welcome;
}

// ══════════════════════════════
// MARKDOWN PARSER
// ══════════════════════════════
function parseMarkdown(text) {
  text = text.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');

  // ── TABLAS ──
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length > 2) {
      const tLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tLines.push(lines[i].trim());
        i++;
      }
      // Construir tabla estilo Magisterium
      let tHtml = '<div class="mag-table-wrap"><table class="mag-table">';
      let firstRow = true;
      tLines.forEach(tl => {
        if (/^\|[\s\-:]+[\|\-]/.test(tl)) return; // separador
        const cells = tl.split('|').map(c => c.trim()).filter(c => c !== '');
        if (!cells.length) return;
        const tag = firstRow ? 'th' : 'td';
        tHtml += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
        firstRow = false;
      });
      tHtml += '</table>';
      tHtml += '<div class="mag-table-footer"><button class="mag-copy-table" onclick="copyTableAbove(this)"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M4 4V2.5A1.5 1.5 0 0 1 5.5 1h6A1.5 1.5 0 0 1 13 2.5v6A1.5 1.5 0 0 1 11.5 10H10" stroke="currentColor" stroke-width="1.2"/></svg> Copy Table</button></div>';
      tHtml += '</div>';
      out.push(tHtml);
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  text = out.join('\n');

  // ── CITAS BÍBLICAS — regex amplio con coma y punto ──
  // Cubre: [Jn 3,16] [Mt 5,3-12] [Lc 10,25-37] [1Cor 13,4] [Sal 22,1]
  const booksPattern = '(?:1|2|3)?\\s*(?:Gn|Ex|Lv|Nm|Dt|Jos|Jue|Rut|Sam|Re|Cr|Esd|Neh|Tob|Jdt|Est|Mac|Job|Sal|Prov|Ecl|Cant|Sab|Sir|Is|Jer|Lam|Bar|Ez|Dn|Os|Jl|Am|Abd|Jon|Miq|Nah|Hab|Sof|Ag|Zac|Mal|Mt|Mc|Lc|Jn|Hch|Rom|Cor|Gal|Ef|Flp|Col|Tes|Tim|Tit|Flm|Heb|Sant|Pe|Jds|Ap)';
  const bibleRegex = new RegExp('\\[(' + booksPattern + '\\s+[\\d][\\d,\\.\\-–;\\s]*)\\]', 'g');
  text = text.replace(bibleRegex, (match, ref) => {
    const cleanRef = ref.trim();
    return `<a href="#" class="cita-pill cita-biblia" onclick="openCitaModal('biblia','${cleanRef.replace(/'/g,"\\'")}');return false;">${cleanRef}</a>`;
  });

  // ── CITAS CIC ──
  text = text.replace(/\[CIC\s+(\d+)\]/g, (match, num) => {
    return `<a href="#" class="cita-pill cita-cic" onclick="openCitaModal('cic','${num}');return false;">CIC ${num}</a>`;
  });

  // ── LINKS EXTERNOS ──
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="ext-link">$1 ↗</a>');

  // ── RESTO MARKDOWN ──
  let html = text
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^---$/gim, '<hr>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^(\d+)\. (.*$)/gim, '<li><strong style="color:var(--ocre)">$1.</strong> $2</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');

  html = html.replace(/(<li>.*?<\/li>(<br>)?)+/gs, m => `<ul>${m.replace(/<br>/g,'')}</ul>`);
  return html;
}

function copyTableAbove(btn) {
  const table = btn.closest('.mag-table-wrap').querySelector('.mag-table');
  if (!table) return;
  // Copiar como texto tabulado
  let text = '';
  table.querySelectorAll('tr').forEach(row => {
    const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.textContent.trim());
    text += cells.join('\t') + '\n';
  });
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = '✓ Copiado';
    btn.style.color = 'var(--green)';
    setTimeout(() => {
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M4 4V2.5A1.5 1.5 0 0 1 5.5 1h6A1.5 1.5 0 0 1 13 2.5v6A1.5 1.5 0 0 1 11.5 10H10" stroke="currentColor" stroke-width="1.2"/></svg> Copy Table';
      btn.style.color = '';
    }, 2000);
  });
}

function linkifyCitas(html) {
  // CIC XXXX → link Catecismo Vatican.va
  html = html.replace(/\bCIC\s+(\d{3,4})\b/g, (match, num) => {
    return '<a href="https://www.vatican.va/archive/catechism_sp/index_sp.html" target="_blank" rel="noopener" ' +
      'title="Catecismo §' + num + '" class="cite-cic">CIC ' + num + ' <span class=\"cite-ico\">↗</span></a>';
  });

  // Referencias bíblicas → Bible Gateway español
  const LIBROS = 'Ap|Jud|3Jn|2Jn|1Jn|2Pe|1Pe|Sant|Heb|Flm|Tit|2Tim|1Tim|2Tes|1Tes|Col|Flp|Ef|Gal|2Cor|1Cor|Rom|Hch|Jn|Lc|Mc|Mt|Mal|Za|Ag|Sof|Hab|Na|Mi|Jon|Abd|Am|Jl|Os|Dn|Ez|Bar|Lam|Jr|Is|Eclo|Sab|Cant|Ecl|Prov|Sal|Job|2Mac|1Mac|Est|Jdt|Tob|Neh|Esd|2Cr|1Cr|2Re|1Re|2Sam|1Sam|Rut|Jue|Jos|Dt|Nm|Lv|Ex|Gn';
  const bibliaRe = new RegExp('\\b(' + LIBROS + ')\\s+(\\d+)[,\\s]*(\\d+)?(?:[-–](\\d+))?\\b', 'g');

  html = html.replace(bibliaRe, (match, libro, cap, ver) => {
    const query = encodeURIComponent(libro + ' ' + cap + (ver ? ':' + ver : ''));
    const url = 'https://www.biblegateway.com/passage/?search=' + query + '&version=BLPH';
    return '<a href="' + url + '" target="_blank" rel="noopener" ' +
      'title="Ver ' + match + ' en la Biblia" class="cite-biblia">' + match + ' <span class=\"cite-ico\">↗</span></a>';
  });

  // Documentos pontificios → Vatican.va
  const DOCS = [
    ['Humanae Vitae', 'https://www.vatican.va/content/paul-vi/es/encyclicals/documents/hf_p-vi_enc_25071968_humanae-vitae.html'],
    ['Evangelium Vitae', 'https://www.vatican.va/content/john-paul-ii/es/encyclicals/documents/hf_jp-ii_enc_25031995_evangelium-vitae.html'],
    ['Laudato Si', 'https://www.vatican.va/content/francesco/es/encyclicals/documents/papa-francesco_20150524_enciclica-laudato-si.html'],
    ['Amoris Laetitia', 'https://www.vatican.va/content/francesco/es/apost_exhortations/documents/papa-francesco_esortazione-ap_20160319_amoris-laetitia.html'],
    ['Evangelii Gaudium', 'https://www.vatican.va/content/francesco/es/apost_exhortations/documents/papa-francesco_esortazione-ap_20131124_evangelii-gaudium.html'],
    ['Lumen Gentium', 'https://www.vatican.va/archive/hist_councils/ii_vatican_council/documents/vat-ii_const_19641121_lumen-gentium_sp.html'],
    ['Gaudium et Spes', 'https://www.vatican.va/archive/hist_councils/ii_vatican_council/documents/vat-ii_const_19651207_gaudium-et-spes_sp.html'],
    ['Dei Verbum', 'https://www.vatican.va/archive/hist_councils/ii_vatican_council/documents/vat-ii_const_19651118_dei-verbum_sp.html'],
    ['Deus Caritas Est', 'https://www.vatican.va/content/benedict-xvi/es/encyclicals/documents/hf_ben-xvi_enc_20051225_deus-caritas-est.html'],
    ['Fides et Ratio', 'https://www.vatican.va/content/john-paul-ii/es/encyclicals/documents/hf_jp-ii_enc_14091998_fides-et-ratio.html'],
    ['Veritatis Splendor', 'https://www.vatican.va/content/john-paul-ii/es/encyclicals/documents/hf_jp-ii_enc_06081993_veritatis-splendor.html'],
    ['Rerum Novarum', 'https://www.vatican.va/content/leo-xiii/es/encyclicals/documents/hf_l-xiii_enc_15051891_rerum-novarum.html']
  ];
  DOCS.forEach(function(pair) {
    var nombre = pair[0], url = pair[1];
    // No linkear si ya está dentro de un <a>
    var re = new RegExp('(?<!["\'\\w])' + nombre.replace(/ /g,'\\s+') + '(?![\\w])', 'g');
    html = html.replace(re, '<a href="' + url + '" target="_blank" rel="noopener" class="cite-doc" title="' + nombre + ' — Vatican.va">' + nombre + ' <span class=\"cite-ico\">↗</span></a>');
  });

  return html;
}

function esc(text) {
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ══════════════════════════════
// DETECTAR TIPO DE CONTENIDO
// ══════════════════════════════
function detectContentType(text, userMsg) {
  const msg = userMsg.toLowerCase();
  const hasTable = text.includes('<table') || text.includes('|---|');
  const isLiturgical = /cartilla|catequesis|novena|rosario|vía crucis|via crucis|homilía|homilia|oración|oracion|laudes|vísperas|visperas|completas|lecturas/i.test(msg);
  return { hasTable, isLiturgical };
}

// ══════════════════════════════
// EXTRAER SUGERENCIAS DEL TEXTO
// ══════════════════════════════
function extractSuggestions(text) {
  const sugs = [];
  // Busca patrones de preguntas sugeridas entre comillas
  const re = /"([^"]{10,80})"/g;
  let match;
  while ((match = re.exec(text)) !== null && sugs.length < 3) {
    sugs.push(match[1]);
  }
  return sugs;
}

// ══════════════════════════════
// RENDER BUBBLE
// ══════════════════════════════
function renderBubble(text, isUser, addActions = false, userMsg = '') {
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'block';

  const wrap = document.getElementById('chat-inner');
  const d = document.createElement('div');
  d.className = 'msg' + (isUser ? ' u' : '');

  // Avatar
  const av = document.createElement('div');
  av.className = 'av ' + (isUser ? 'usr' : 'bot');
  av.innerHTML = isUser
    ? i18n[currentLang].you
    : `<svg width="13" height="13" viewBox="0 0 80 80" fill="none">
        <line x1="40" y1="8" x2="40" y2="52" stroke="#E8A84C" stroke-width="5" stroke-linecap="round"/>
        <line x1="27" y1="20" x2="53" y2="20" stroke="#E8A84C" stroke-width="5" stroke-linecap="round"/>
       </svg>`;

  // Bubble
  const b = document.createElement('div');
  b.className = 'bubble ' + (isUser ? 'usr' : 'bot');

  if (isUser) {
    b.textContent = text;
  } else {
    b.innerHTML = parseMarkdown(text);

    // Fuentes
    // src-row removido en V6

    // ── BOTONES SIEMPRE VISIBLES en todas las respuestas ──
    const hasTable = b.innerHTML.includes('<table');
    let actHtml = '<div class="action-row">';
    actHtml += `<button class="act-btn pdf" onclick="exportPDF(this)" title="Exportar PDF">📕 PDF</button>`;
    actHtml += `<button class="act-btn word" onclick="exportWord(this)" title="Exportar Word">📝 Word</button>`;
    actHtml += `<button class="act-btn ppt" onclick="exportPPT(this)" title="PowerPoint">📊 PPT</button>`;
    actHtml += `<button class="act-btn copy" onclick="copyText(this)" title="Copiar">📋 Copiar</button>`;
    if (hasTable) {
      actHtml += `<button class="act-btn gdoc" onclick="openGoogleDocs(this)">📄 G.Docs</button>`;
      actHtml += `<button class="act-btn gsheet" onclick="openGoogleSheets(this)">📊 G.Sheets</button>`;
    }
    actHtml += '</div>';
    b.innerHTML += actHtml;

    // ── SUGERENCIAS ──
    const sugs = extractSuggestions(text);
    if (sugs.length > 0) {
      let sugHtml = '<div class="suggestions">';
      sugs.forEach(s => {
        sugHtml += `<span class="sug-chip" onclick="sendChip('${s.replace(/'/g,"\'")}')">💭 ${esc(s)}</span>`;
      });
      sugHtml += '</div>';
      b.innerHTML += sugHtml;
    }
  }


  d.appendChild(av);
  d.appendChild(b);
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;

  if (!isUser) lastBotText = text;
}

// ══════════════════════════════
// TYPING INDICATOR
// ══════════════════════════════
function addTyping() {
  const wrap = document.getElementById('chat-inner');
  const d = document.createElement('div');
  d.className = 'msg'; d.id = 'typing-indicator';
  const av = document.createElement('div');
  av.className = 'av bot';
  av.innerHTML = `<svg width="13" height="13" viewBox="0 0 80 80" fill="none">
    <line x1="40" y1="8" x2="40" y2="52" stroke="#E8A84C" stroke-width="5" stroke-linecap="round"/>
    <line x1="27" y1="20" x2="53" y2="20" stroke="#E8A84C" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
  const b = document.createElement('div');
  b.className = 'bubble bot typing';
  b.innerHTML = '<span></span><span></span><span></span>';
  d.appendChild(av); d.appendChild(b);
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

// ══════════════════════════════
// SEND
// ══════════════════════════════
async function send() {
  const cin = document.getElementById('cin');
  const val = cin.value.trim();
  if (!val || isLoading) return;

  const lower = val.toLowerCase();

  // ── INTERCEPTAR vistas especiales ──
  if (/lecturas del d[ií]a|lecturas de hoy|ver lecturas|lecturas de la misa/.test(lower)) {
    cin.value = ''; cin.style.height = 'auto';
    loadLecturasReales(); return;
  }
  if (/^breviario/.test(lower)) {
    cin.value = ''; cin.style.height = 'auto';
    openView('breviario'); return;
  }
  if (/^calendario lit/.test(lower)) {
    cin.value = ''; cin.style.height = 'auto';
    openView('calendario'); return;
  }

  isLoading = true;
  isStreaming = true;
  document.getElementById('send-btn').disabled = true;
  showStopBtn(true);

  const userMsg = val;
  chatHistory.push({ role: 'user', content: val });
  renderBubble(val, true);
  cin.value = ''; cin.style.height = 'auto';

  // Crear bubble de respuesta vacía para streaming
  const d = document.getElementById('chat-inner');
  const wrap = document.createElement('div');
  wrap.className = 'msg-row bot-row';
  const av = document.createElement('div');
  av.className = 'av av-bot';
  av.innerHTML = '<svg viewBox="0 0 80 80" fill="none" style="width:100%;height:100%"><circle cx="40" cy="30" r="21" stroke="#7A5230" stroke-width="2.2"/><line x1="40" y1="9" x2="40" y2="51" stroke="#C9923A" stroke-width="2.8" stroke-linecap="round"/><line x1="27" y1="20" x2="53" y2="20" stroke="#C9923A" stroke-width="2.8" stroke-linecap="round"/></svg>';
  const b = document.createElement('div');
  b.className = 'bubble bubble-bot';
  b.innerHTML = '<span class="typing-cursor">▋</span>';
  wrap.appendChild(av);
  wrap.appendChild(b);
  d.appendChild(wrap);
  d.scrollTop = d.scrollHeight;

  // Mostrar chat
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'block';
  document.querySelector('.input-area').style.display = '';

  const needsActions = /cartilla|catequesis|novena|rosario|v[ií]a crucis|hom[ií]l[ií]a|oraci[oó]n|tabla|l[ií]nea de tiempo|cronolog[ií]a|actividad|clase/i.test(val);

  currentStream = new AbortController();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory, stream: true }),
      signal: currentStream.signal
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // guardar línea incompleta

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.magisterium) {
            // Fuentes de Magisterium llegan primero — mostrar badge
            renderMagisteriumSources(parsed.magisterium, b);
          }
          if (parsed.delta) {
            fullText += parsed.delta;
            // Mantener el badge de Magisterium si existe
            const magBadge = b.querySelector('.mag-sources');
            b.innerHTML = (magBadge ? magBadge.outerHTML : '') +
              parseMarkdown(fullText) + '<span class="typing-cursor">▋</span>';
            d.scrollTop = d.scrollHeight;
          }
          if (parsed.done) {
            const magBadge = b.querySelector('.mag-sources');
            b.innerHTML = (magBadge ? magBadge.outerHTML : '') + parseMarkdown(fullText);
            chatHistory.push({ role: 'assistant', content: fullText });
            addBubbleActions(b, fullText, userMsg, needsActions);
            if (chatHistory.length === 2) saveConversation(userMsg);
          }
          if (parsed.error) throw new Error(parsed.error);
        } catch(pe) { /* línea malformada */ }
      }
    }

    // Por si acaso no llegó el evento done
    if (fullText && !b.querySelector('.action-row')) {
      b.innerHTML = parseMarkdown(fullText);
      chatHistory.push({ role: 'assistant', content: fullText });
      addBubbleActions(b, fullText, userMsg, needsActions);
      if (chatHistory.length === 2) saveConversation(userMsg);
    }

  } catch(e) {
    if (e.name === 'AbortError') {
      if (b.querySelector('.typing-cursor')) {
        b.innerHTML = b.innerHTML.replace('<span class="typing-cursor">▋</span>', ' <em style="color:var(--ink4);font-size:12px">[detenido]</em>');
      }
    } else {
      b.innerHTML = '<em style="color:var(--red)">Error al conectar. Intenta de nuevo.</em>';
    }
  }

  isLoading = false;
  isStreaming = false;
  currentStream = null;
  document.getElementById('send-btn').disabled = false;
  showStopBtn(false);
}

function stopStream() {
  if (currentStream) {
    currentStream.abort();
    currentStream = null;
  }
  isLoading = false;
  isStreaming = false;
  document.getElementById('send-btn').disabled = false;
  showStopBtn(false);
}

function showStopBtn(show) {
  let btn = document.getElementById('stop-btn');
  const sendBtn = document.getElementById('send-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'stop-btn';
    btn.className = 'stop-btn';
    btn.setAttribute('aria-label', 'Detener respuesta');
    btn.innerHTML = '⏹';
    btn.onclick = stopStream;
    sendBtn.parentNode.insertBefore(btn, sendBtn);
  }
  btn.style.display = show ? 'flex' : 'none';
  sendBtn.style.display = show ? 'none' : 'flex';
}

function addBubbleActions(b, text, userMsg, needsActions) {
  // Solo botón PDF + Copiar (sin Word, PPT, sin badges Magisterio)
  const hasTable = b.innerHTML.includes('<table');
  let actHtml = '<div class="action-row">';
  actHtml += `<button class="act-btn pdf" onclick="exportPDF(this)" title="Exportar PDF">📕 PDF</button>`;
  actHtml += `<button class="act-btn copy" onclick="copyText(this)" title="Copiar texto">📋 Copiar</button>`;
  if (hasTable) {
    actHtml += `<button class="act-btn gdoc" onclick="openGoogleDocs(this)">📄 Google Docs</button>`;
  }
  actHtml += '</div>';
  b.innerHTML += actHtml;

  // Sugerencias
  const sugs = extractSuggestions(text);
  if (sugs.length > 0) {
    let sugHtml = '<div class="suggestions">';
    sugs.forEach(s => {
      sugHtml += `<span class="sug-chip" onclick="sendChip('${s.replace(/'/g,"\'")}')">💭 ${esc(s)}</span>`;
    });
    sugHtml += '</div>';
    b.innerHTML += sugHtml;
  }
}

function sendChip(t) {
  closeSb();
  const lower = t.toLowerCase();
  if (/lecturas del d[ií]a|lecturas de hoy|ver lecturas/.test(lower)) {
    setTimeout(() => loadLecturasReales(), 300);
    return;
  }
  if (/^breviario/.test(lower)) {
    setTimeout(() => openView('breviario'), 300);
    return;
  }
  if (/^calendario lit/.test(lower)) {
    setTimeout(() => openView('calendario'), 300);
    return;
  }
  setTimeout(() => {
    document.getElementById('cin').value = t;
    send();
  }, 300);
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function newChat() {
  chatHistory = [];
  document.getElementById('welcome').style.display = 'flex';
  document.getElementById('chat-area').style.display = 'none';
  document.getElementById('chat-inner').innerHTML = '';
  closeSb();
}

// ══════════════════════════════
// OBTENER TEXTO LIMPIO DEL BUBBLE
// ══════════════════════════════
function getBubbleText(btn) {
  const bubble = btn.closest('.bubble');
  const clone = bubble.cloneNode(true);
  clone.querySelectorAll('.src-row,.action-row,.suggestions').forEach(el => el.remove());
  return clone.innerText.trim();
}

function getBubbleHTML(btn) {
  const bubble = btn.closest('.bubble');
  const clone = bubble.cloneNode(true);
  clone.querySelectorAll('.src-row,.action-row,.suggestions').forEach(el => el.remove());
  return clone.innerHTML.trim();
}

// ══════════════════════════════
// EXPORTS
// ══════════════════════════════
async function exportPDF(btn) {
  if (!window.jspdf) { alert('Cargando... intenta en un momento.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  // ── LOGO SVG dibujado ──
  const margin = 20;
  let y = 15;

  // Cruz dorada (logo)
  doc.setDrawColor(201, 146, 58);
  doc.setLineWidth(1.2);
  doc.line(105, y, 105, y + 18);       // vertical
  doc.line(99, y + 6, 111, y + 6);     // horizontal
  doc.setDrawColor(122, 82, 48);
  doc.setLineWidth(0.8);
  doc.circle(105, y + 9, 8);           // círculo
  y += 24;

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(92, 61, 30);
  doc.text('CatolicosGPT', 105, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(168, 136, 88);
  doc.text('catolicosgpt.com · Basado en el Magisterio de la Iglesia Católica', 105, y, { align: 'center' });
  y += 5;

  // Línea separadora dorada
  doc.setDrawColor(201, 146, 58);
  doc.setLineWidth(0.5);
  doc.line(margin, y, 210 - margin, y);
  y += 8;

  // ── CONTENIDO: parsear el HTML del bubble ──
  const bubble = btn.closest('.bubble');
  const clone = bubble.cloneNode(true);
  clone.querySelectorAll('.src-row,.action-row,.suggestions').forEach(el => el.remove());

  // Procesar nodo por nodo para mantener formato
  function processNode(node, indentLevel) {
    if (node.nodeType === 3) { // texto
      return node.textContent;
    }
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    let text = Array.from(node.childNodes).map(n => processNode(n, indentLevel)).join('');
    if (tag === 'h2') return '\n\n[H2]' + text + '[/H2]\n';
    if (tag === 'h3') return '\n\n[H3]' + text + '[/H3]\n';
    if (tag === 'h4') return '\n[H4]' + text + '[/H4]\n';
    if (tag === 'strong') return '[B]' + text + '[/B]';
    if (tag === 'em') return '[I]' + text + '[/I]';
    if (tag === 'li') return '\n  • ' + text;
    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n─────────────────────\n';
    if (tag === 'p') return '\n' + text + '\n';
    if (tag === 'tr') {
      const cells = Array.from(node.querySelectorAll('th,td')).map(c => c.textContent.trim());
      return cells.join(' | ') + '\n';
    }
    if (tag === 'table') {
      return '\n[TABLA]\n' + text + '[/TABLA]\n';
    }
    return text;
  }

  const rawText = processNode(clone, 0);
  const segments = rawText.split('\n');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(24, 16, 10);

  const pageH = 280;
  const lineH = 6;
  const maxW = 170;

  segments.forEach(seg => {
    if (y > pageH) { doc.addPage(); y = 20; }

    if (seg.includes('[H2]')) {
      const t = seg.replace('[H2]','').replace('[/H2]','').trim();
      if (!t) return;
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(92, 61, 30);
      doc.text(t, margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(24, 16, 10);
    } else if (seg.includes('[H3]')) {
      const t = seg.replace('[H3]','').replace('[/H3]','').trim();
      if (!t) return;
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(122, 82, 48);
      doc.text(t, margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(24, 16, 10);
    } else if (seg.includes('[TABLA]') || seg.includes('[/TABLA]')) {
      // ignorar marcadores
    } else if (seg.includes(' | ')) {
      // Fila de tabla
      const cells = seg.split(' | ');
      const colW = maxW / cells.length;
      doc.setFontSize(10);
      doc.setDrawColor(212, 192, 152);
      doc.rect(margin, y - 4, maxW, lineH + 1);
      cells.forEach((cell, ci) => {
        doc.text(cell.trim().slice(0, 25), margin + (ci * colW) + 2, y);
      });
      y += lineH + 1;
      doc.setFontSize(11);
    } else if (seg.trim().startsWith('•')) {
      const t = seg.trim();
      if (!t || t === '•') return;
      doc.setTextColor(201, 146, 58);
      doc.text('•', margin + 2, y);
      doc.setTextColor(24, 16, 10);
      const lines = doc.splitTextToSize(t.replace('•','').trim(), maxW - 8);
      doc.text(lines, margin + 8, y);
      y += lines.length * lineH;
    } else if (seg.includes('─────')) {
      doc.setDrawColor(212, 192, 152);
      doc.line(margin, y, 210 - margin, y);
      y += 4;
    } else {
      const clean = seg.replace(/\[B\]|\[\/B\]|\[I\]|\[\/I\]|\[H4\]|\[\/H4\]/g, '').trim();
      if (!clean) { y += 2; return; }
      const lines = doc.splitTextToSize(clean, maxW);
      if (y + lines.length * lineH > pageH) { doc.addPage(); y = 20; }
      doc.text(lines, margin, y);
      y += lines.length * lineH + 1;
    }
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(168, 136, 88);
  const fecha = new Date().toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
  doc.text(`Generado el ${fecha} · catolicosgpt.com`, 105, 288, { align: 'center' });

  doc.save('catolicosgpt.pdf');
}

function exportWord(btn) {
  const text = getBubbleText(btn);
  const htmlContent = getBubbleHTML(btn);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="UTF-8">
<style>
  body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.8; color: #18100A; }
  h1,h2,h3 { font-family: Georgia, serif; color: #5C3D1E; }
  h2 { font-size: 16pt; } h3 { font-size: 14pt; } h4 { font-size: 12pt; }
  strong { color: #7A5230; }
  em { color: #A88858; font-style: italic; }
  .footer { color: #A88858; font-size: 9pt; margin-top: 40px; border-top: 1px solid #D4C098; padding-top: 10px; }
</style></head>
<body>
<h1 style="text-align:center;color:#5C3D1E">CatolicosGPT</h1>
<p style="text-align:center;color:#A88858;font-size:9pt">catolicosgpt.com · Basado en el Magisterio de la Iglesia Católica</p>
<hr style="border-color:#D4C098">
${htmlContent}
<div class="footer">Generado el ${new Date().toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' })} · catolicosgpt.com</div>
</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'catolicosgpt.doc'; a.click();
}

function exportPPT(btn) {
  const text = getBubbleText(btn);
  const lines = text.split('\n').filter(l => l.trim()).slice(0, 8);
  const content = encodeURIComponent(lines.join('\n\n'));
  alert('💡 Para crear el PowerPoint:\n\n1. Descarga el Word con el botón "Word"\n2. Abre en PowerPoint y selecciona "Abrir"\n\nO copia el texto y pégalo en Google Slides.');
}

function copyText(btn) {
  const text = getBubbleText(btn);
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅ Copiado';
    setTimeout(() => { btn.innerHTML = '📋 Copiar'; }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    btn.textContent = '✅ Copiado';
    setTimeout(() => { btn.innerHTML = '📋 Copiar'; }, 2000);
  });
}

function openGoogleDocs(btn) {
  const text = getBubbleText(btn);
  const encoded = encodeURIComponent(text);
  window.open(`https://docs.google.com/document/create?title=CatolicosGPT&body=${encoded}`, '_blank');
}

function openGoogleSheets(btn) {
  window.open('https://sheets.google.com/create', '_blank');
  const text = getBubbleText(btn);
  navigator.clipboard.writeText(text).then(() => {
    alert('Tabla copiada. Pégala en la hoja de cálculo que se abrió (Ctrl+V o Cmd+V).');
  });
}

// ══════════════════════════════
// DONAR
// ══════════════════════════════
function openDonate() { document.getElementById('donate-modal').classList.add('show'); }
function closeDonate() { document.getElementById('donate-modal').classList.remove('show'); }
function selectAmount(btn, amount) {
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('paypal-link').href = `https://www.paypal.com/paypalme/schoolmarketing/${amount}`;
}

// ══════════════════════════════
// INIT
// ══════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('donate-modal').addEventListener('click', function(e) {
    if (e.target === this) closeDonate();
  });

  // Fix iOS viewport height
  function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', () => setTimeout(setVH, 200));

  // Focus input en desktop
  if (window.innerWidth > 768) {
    document.getElementById('cin').focus();
  }
});

// ══════════════════════════════════════════════
// VISTAS PRINCIPALES — Breviario y Calendario
// Se abren en el frame central, no como panel lateral
// ══════════════════════════════════════════════

function openPanel(id) { openView(id); } // alias para compatibilidad

function openView(id) {
  // Guardar chat en recientes si hay conversación activa
  if (chatHistory.length >= 2) {
    saveConversation(chatHistory[0].content);
  }
  // Ocultar todo
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'none';
  document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
  // Mostrar vista solicitada
  const view = document.getElementById('view-' + id);
  if (view) {
    view.style.display = 'flex';
    document.querySelector('.input-area').style.display = 'none';
  }
  if (id === 'breviario') initBreviario();
  if (id === 'calendario') initCalendario();
  if (id === 'lecturas') initLecturas();
}

function closeView() {
  // Restaurar vista normal del chat
  document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
  document.querySelector('.input-area').style.display = '';
  if (chatHistory.length > 0) {
    document.getElementById('chat-area').style.display = 'block';
    document.getElementById('welcome').style.display = 'none';
  } else {
    document.getElementById('welcome').style.display = 'flex';
  }
}

function closePanel(id) { closeView(); } // alias para compatibilidad

// ── BREVIARIO ──────────────────────────────────

const HORAS_DATA = {
  laudes: {
    nombre: 'Laudes',
    prompt: 'Rezar las Laudes completas de hoy paso a paso, guíame versículo por versículo',
    content: `
      <div class="brev-rubrica">V. Señor, ábreme los labios.</div>
      <div class="brev-verso"><span class="r">R/.</span> Y mi boca proclamará tu alabanza.</div>
      <div class="brev-section-title">Himno</div>
      <div class="brev-verso" style="font-size:14px">
        Ya viene el alba, brillan los cielos,<br>
        la noche oscura va a terminar.<br>
        Cristo nos llama, rompe cadenas,<br>
        los corazones llena de paz.
      </div>
      <div class="brev-salmo-ref">Salmo 50 (51) — Miserere</div>
      <div class="brev-rubrica">Antífona: El Señor me ha enviado a dar la buena noticia a los pobres.</div>
      <div class="brev-verso">
        Misericordia, Señor, que soy un pecador;<br>
        por tu bondad, borra mi culpa;<br>
        por tu inmensa compasión, borra mis delitos.<br><br>
        Lava del todo mi maldad,<br>limpia mi pecado.<br><br>
        <span style="color:var(--ink4);font-size:13px;font-style:italic">Gloria al Padre, y al Hijo,<br>y al Espíritu Santo. Amén.</span>
      </div>
      <div class="brev-salmo-ref">Lectura breve — Rm 8, 35.37</div>
      <div class="brev-verso" style="font-style:italic;font-size:14px;color:var(--ink3)">
        «¿Quién nos separará del amor de Cristo?<br>
        En todo esto salimos victoriosos<br>
        gracias a aquel que nos amó.»
      </div>
      <div class="brev-rubrica">Preces</div>
      <div class="brev-verso" style="font-size:14px">
        Santificados por el sueño de la noche,<br>te ofrecemos las primicias del nuevo día.<br>
        <span class="r">— Señor, te pedimos.</span>
      </div>
      <div class="brev-rubrica">Oración conclusiva</div>
      <div class="brev-verso" style="font-size:14px">
        Señor Dios, que con el amanecer del nuevo día<br>
        renuevas nuestra esperanza en ti:<br>
        acompáñanos durante esta jornada<br>
        para que todo lo que hagamos sea para tu gloria.<br>
        Por Jesucristo, nuestro Señor. <span class="r">Amén.</span>
      </div>`
  },
  intermedia: {
    nombre: 'Hora Intermedia',
    prompt: 'Rezar la Hora Intermedia de hoy completa — Sexta del mediodía',
    content: `
      <div class="brev-rubrica">V. Dios mío, ven en mi auxilio.</div>
      <div class="brev-verso"><span class="r">R/.</span> Señor, date prisa en socorrerme.</div>
      <div class="brev-section-title">Himno — Sexta</div>
      <div class="brev-verso" style="font-size:14px">
        Ven, Santo Espíritu, de los cielos,<br>
        manda tu luz desde el cielo.<br>
        Padre de los pobres, ven,<br>
        dador de dones, ven.
      </div>
      <div class="brev-salmo-ref">Salmo 118 (119) — La Ley del Señor</div>
      <div class="brev-rubrica">Antífona: Enséñame tus mandatos, Señor.</div>
      <div class="brev-verso">
        Dichosos los que caminan sin tacha,<br>
        los que marchan según la ley del Señor.<br>
        Dichosos los que guardan sus preceptos<br>
        y le buscan de todo corazón.<br><br>
        <span style="color:var(--ink4);font-size:13px;font-style:italic">Gloria al Padre... Amén.</span>
      </div>
      <div class="brev-salmo-ref">Lectura breve — Gal 2, 19b-20</div>
      <div class="brev-verso" style="font-style:italic;font-size:14px;color:var(--ink3)">
        «Estoy crucificado con Cristo;<br>
        vivo yo, pero no soy yo,<br>es Cristo quien vive en mí.»
      </div>`
  },
  visperas: {
    nombre: 'Vísperas',
    prompt: 'Rezar las Vísperas completas de hoy paso a paso',
    content: `
      <div class="brev-rubrica">V. Dios mío, ven en mi auxilio.</div>
      <div class="brev-verso"><span class="r">R/.</span> Señor, date prisa en socorrerme.</div>
      <div class="brev-section-title">Himno vespertino</div>
      <div class="brev-verso" style="font-size:14px">
        El sol que declina muere en el poniente;<br>
        tú eres, oh Cristo, la luz que no muere,<br>
        ilumina nuestra noche oscura,<br>
        llena de paz nuestra alma insegura.
      </div>
      <div class="brev-salmo-ref">Cántico — Flp 2, 6-11</div>
      <div class="brev-rubrica">Antífona: Cristo fue obediente hasta la muerte, y muerte de Cruz.</div>
      <div class="brev-verso">
        Cristo, siendo de condición divina,<br>
        no retuvo ávidamente el ser igual a Dios;<br>
        al contrario, se despojó de su grandeza,<br>
        tomó la condición de esclavo<br>
        y se hizo semejante a los hombres.<br><br>
        Por eso Dios le exaltó sobre todo<br>
        y le otorgó el Nombre sobre todo nombre.<br><br>
        <span style="color:var(--ink4);font-size:13px;font-style:italic">Gloria al Padre... Amén.</span>
      </div>
      <div class="brev-salmo-ref">Magnificat — Lc 1, 46-55</div>
      <div class="brev-rubrica">Antífona: Santa María, ruega por nosotros.</div>
      <div class="brev-verso" style="font-style:italic;font-size:14px;color:var(--ink3)">
        «Proclama mi alma la grandeza del Señor,<br>
        se alegra mi espíritu en Dios mi Salvador;<br>
        porque ha mirado la humillación de su sierva.»
      </div>`
  },
  completas: {
    nombre: 'Completas',
    prompt: 'Rezar las Completas de hoy para antes de dormir, guíame paso a paso',
    content: `
      <div class="brev-rubrica">Examen de conciencia breve</div>
      <div class="brev-verso" style="font-size:13.5px;color:var(--ink3);font-style:italic;line-height:1.8">
        Dedica un momento a repasar tu día:<br>
        ¿Cómo respondiste al amor de Dios?<br>
        ¿Actuaste con caridad hacia los demás?
      </div>
      <div class="brev-rubrica">V. Dios mío, ven en mi auxilio.</div>
      <div class="brev-verso"><span class="r">R/.</span> Señor, date prisa en socorrerme.</div>
      <div class="brev-salmo-ref">Salmo 90 (91) — Bajo la protección de Dios</div>
      <div class="brev-rubrica">Antífona: Guárdanos, Señor, mientras velamos.</div>
      <div class="brev-verso">
        El que habita bajo la protección del Altísimo,<br>
        se aloja a la sombra del Omnipotente.<br>
        Yo digo al Señor: «Tú eres mi refugio y fortaleza,<br>
        mi Dios, en quien confío.»<br><br>
        <span style="color:var(--ink4);font-size:13px;font-style:italic">Gloria al Padre... Amén.</span>
      </div>
      <div class="brev-salmo-ref">Antífona final de la Virgen — Salve Regina</div>
      <div class="brev-verso" style="font-style:italic;font-size:14px;color:var(--ink3)">
        Salve, Regina, Mater misericordiae;<br>
        vita, dulcedo et spes nostra, salve.<br>
        Ad te clamamus, exsules filii Hevae...<br><br>
        <span style="color:var(--ink);font-style:normal">Salve, oh Reina, Madre de misericordia,<br>
        vida, dulzura y esperanza nuestra, salve.</span>
      </div>`
  }
};

let horaActual = 'laudes';

function initBreviario() {
  const now = new Date();
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('brev-date-label').textContent =
    `${dias[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
  renderHora(horaActual);
}

function selectHora(hora, el) {
  horaActual = hora;
  document.querySelectorAll('.hora-pill').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  renderHora(hora);
}

function renderHora(hora) {
  const h = HORAS_DATA[hora];
  document.getElementById('brev-content').innerHTML = h.content;
  document.getElementById('brev-guided-btn').onclick = () => {
    closePanel('breviario');
    setTimeout(() => sendChip(h.prompt), 350);
  };
}

function exportBrevPDF() {
  closeView();
  setTimeout(() => sendChip('Exportar las ' + HORAS_DATA[horaActual].nombre + ' de hoy en PDF con formato litúrgico'), 350);
}

// ── LECTURAS REALES DESDE API ──────────────────
async function loadLecturasReales() {
  closeSb();
  // Mostrar vista de lecturas directamente en el frame principal
  openView('lecturas');
}

async function initLecturas() {
  const container = document.getElementById('lecturas-content');
  const dateEl = document.getElementById('lecturas-date');
  if (!container) return;

  const now = new Date();
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
  if (dateEl) dateEl.textContent = fechaStr.toUpperCase();

  container.innerHTML = `<div style="text-align:center;padding:40px 20px">
    <div style="font-family:'Playfair Display',serif;font-size:15px;color:var(--brown);margin-bottom:8px">Cargando lecturas del ${fechaStr}</div>
    <div style="font-family:'Lora',serif;font-size:13px;color:var(--ink4);font-style:italic">Conectando con el servidor litúrgico...</div>
  </div>`;

  try {
    const resp = await fetch('/api/lecturas-dia');
    const json = await resp.json();

    if (json.ok && json.texto) {
      // Servidor devolvió texto estructurado con ---ETIQUETA---
      container.innerHTML = buildLecturasFromText(json.texto, json.fecha || fechaStr);
    } else if (json.ok && json.lecturas) {
      // Formato con .lecturas
      const l = json.lecturas;
      if (l.texto) {
        container.innerHTML = buildLecturasFromText(l.texto, l.fecha || fechaStr);
      } else if (l.data) {
        container.innerHTML = buildLecturasHTML(l.data, fechaStr);
      } else {
        throw new Error('Formato inesperado');
      }
    } else {
      throw new Error(json.error || 'Sin datos');
    }
  } catch(e) {
    console.error('Error lecturas:', e);
    container.innerHTML = `
      <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:24px;text-align:center">
        <div style="font-family:'Playfair Display',serif;font-size:16px;color:var(--brown);margin-bottom:8px">
          Lecturas no disponibles en este momento
        </div>
        <div style="font-family:'Lora',serif;font-size:13px;color:var(--ink4);font-style:italic;margin-bottom:16px">
          Puedes pedirlas directamente al asistente
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button onclick="closeView();setTimeout(()=>sendChip('Dame las lecturas bíblicas completas de la misa de hoy ${fechaStr} — Primera Lectura, Salmo y Evangelio con los textos completos'),350)"
            style="background:var(--brown);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-family:'Lora',serif;font-size:13px;cursor:pointer">
            📖 Pedir al asistente
          </button>
          <a href="https://www.vaticannews.va/es/palabra-de-dios.html" target="_blank"
            style="background:transparent;color:var(--brown);border:1px solid var(--border2);border-radius:8px;padding:10px 18px;font-family:'Lora',serif;font-size:13px;text-decoration:none;display:inline-flex;align-items:center">
            🌐 Vatican News
          </a>
        </div>
      </div>`;
  }
}

function buildLecturasFromText(text, fechaStr) {
  let html = '';
  // Parsear por secciones ---ETIQUETA---
  const sections = text.split(/---([A-Z_]+)---/);

  for (let i = 1; i < sections.length; i += 2) {
    const tag = sections[i];
    const body = (sections[i+1] || '').trim();
    if (!body) continue;

    const lines = body.split('\n');
    const refLine = lines.find(l => l.startsWith('Referencia:'));
    const ref = refLine ? refLine.replace('Referencia:', '').trim() : '';
    const estrLine = lines.find(l => l.startsWith('Estribillo:'));
    const estr = estrLine ? estrLine.replace('Estribillo:', '').trim() : '';
    const texto = lines.filter(l =>
      !l.startsWith('Referencia:') && !l.startsWith('Estribillo:')
    ).join('\n').trim();

    if (tag === 'PRIMERA_LECTURA') {
      html += lecturBlock('Primera Lectura', ref, '', texto, '#8B1A1A');
    } else if (tag === 'SALMO') {
      html += salmoBlock(ref, estr, texto);
    } else if (tag === 'SEGUNDA_LECTURA') {
      html += lecturBlock('Segunda Lectura', ref, '', texto, '#8B1A1A');
    } else if (tag === 'EVANGELIO') {
      html += lecturBlock('Evangelio', ref, '', texto, '#1E6B3A');
    }
  }

  // Si no parseó bien, mostrar el texto formateado directamente
  if (!html) {
    html = `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:20px;font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink);font-style:italic">
      ${parseMarkdown(text)}
    </div>`;
  }

  return html;
}

function buildLecturasHTML(data, fechaStr) {
  let html = '';
  // Manejar diferentes estructuras de la API AELF
  const lectures = data.messes || data.lectures || data.messes_du_jour || [];
  
  if (Array.isArray(lectures) && lectures.length > 0) {
    lectures.forEach(item => {
      const type = (item.type || item.key || '').toLowerCase();
      const ref = item.ref || item.reference || '';
      const text = item.text || item.long_text || item.short_text || '';
      const intro = item.intro_text || '';
      
      if (type.includes('lecture_1') || type.includes('reading_1') || type === 'lecture 1') {
        html += lecturBlock('Primera Lectura', ref, intro, text, '#8B1A1A');
      } else if (type.includes('psaume') || type.includes('psalm')) {
        html += salmoBlock(ref, item.refrain_text || '', text);
      } else if (type.includes('lecture_2') || type.includes('reading_2')) {
        html += lecturBlock('Segunda Lectura', ref, intro, text, '#8B1A1A');
      } else if (type.includes('evangile') || type.includes('gospel') || type.includes('evangelio')) {
        html += lecturBlock('Evangelio', ref, intro, text, '#1E6B3A');
      }
    });
  }
  
  if (!html) html = buildLecturasFromAI('', fechaStr);
  return html;
}

function buildLecturasFromAI(aiText, fechaStr) {
  if (!aiText) return '<div style="padding:20px;color:var(--ink4);font-family:Lora,serif;text-align:center;font-style:italic">Sin datos disponibles</div>';
  
  let html = '';
  // Parsear formato especial ##SECCION##
  const parts = aiText.split(/##([A-Z_]+)##/);
  let current = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    
    if (part === 'PRIMERA_LECTURA') { current = 'primera'; continue; }
    if (part === 'SALMO') { current = 'salmo'; continue; }
    if (part === 'SEGUNDA_LECTURA') { current = 'segunda'; continue; }
    if (part === 'EVANGELIO') { current = 'evangelio'; continue; }
    
    // Extraer referencia y texto
    const refMatch = part.match(/Referencia:\s*(.+)/);
    const textoMatch = part.match(/Texto:\s*([\s\S]+?)(?=Estribillo:|$)/);
    const estrMatch = part.match(/Estribillo:\s*(.+)/);
    const ref = refMatch ? refMatch[1].trim() : '';
    const texto = textoMatch ? textoMatch[1].trim() : part;
    
    if (current === 'primera') html += lecturBlock('Primera Lectura', ref, '', texto, '#8B1A1A');
    else if (current === 'salmo') html += salmoBlock(ref, estrMatch ? estrMatch[1] : '', texto);
    else if (current === 'segunda') html += lecturBlock('Segunda Lectura', ref, '', texto, '#8B1A1A');
    else if (current === 'evangelio') html += lecturBlock('Evangelio', ref, '', texto, '#1E6B3A');
  }
  
  if (!html) {
    // Fallback: mostrar el texto de la IA formateado
    html = `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;font-family:Lora,serif;font-size:14.5px;line-height:1.9;color:var(--ink)">
      ${parseMarkdown(aiText)}
    </div>`;
  }
  
  return html;
}

function lecturBlock(titulo, ref, intro, texto, color) {
  return `<div style="margin-bottom:20px">
    <div style="font-family:Inter,sans-serif;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:${color};margin-bottom:6px">${titulo}</div>
    ${ref ? `<div style="font-family:Lora,serif;font-size:13px;font-style:italic;color:var(--ocre);font-weight:500;margin-bottom:8px">${ref}</div>` : ''}
    ${intro ? `<div style="font-family:Lora,serif;font-size:13px;color:var(--ink4);font-style:italic;margin-bottom:8px">${intro}</div>` : ''}
    <div style="font-family:Playfair Display,Georgia,serif;font-size:16px;line-height:2;color:var(--ink);font-style:italic">${texto.replace(/\n/g,'<br>')}</div>
    <div style="margin-top:10px;font-family:Inter,sans-serif;font-size:10px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:.08em">Palabra de Dios</div>
    <div style="border-top:1px solid var(--border);margin-top:12px"></div>
  </div>`;
}

function salmoBlock(ref, estribillo, texto) {
  return `<div style="margin-bottom:20px">
    <div style="font-family:Inter,sans-serif;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#4A2080;margin-bottom:6px">Salmo Responsorial</div>
    ${ref ? `<div style="font-family:Lora,serif;font-size:13px;font-style:italic;color:var(--ocre);margin-bottom:8px">${ref}</div>` : ''}
    ${estribillo ? `<div style="font-family:Playfair Display,Georgia,serif;font-size:15px;color:#8B1A1A;font-style:italic;margin-bottom:8px;padding:8px 12px;background:rgba(139,26,26,.05);border-left:3px solid #8B1A1A;border-radius:0 6px 6px 0">R/. ${estribillo}</div>` : ''}
    <div style="font-family:Playfair Display,Georgia,serif;font-size:15px;line-height:2;color:var(--ink);font-style:italic">${texto.replace(/\n/g,'<br>')}</div>
    <div style="border-top:1px solid var(--border);margin-top:12px"></div>
  </div>`;
}

// ── CALENDARIO ────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

const FEASTS = {
  '3-13': {n:'San Rodrigo de Córdoba',t:'feria',d:'Mártir de Córdoba (857). Murió decapitado junto a San Salomón.'},
  '3-17': {n:'San Patricio',t:'memoria',d:'Apóstol de Irlanda. Patrón nacional de Irlanda.'},
  '3-19': {n:'San José, Esposo de María',t:'solemnidad',d:'Patrono de la Iglesia Universal. Solemnidad de primer rango.'},
  '3-25': {n:'Anunciación del Señor',t:'solemnidad',d:'El ángel Gabriel anuncia a María. El Verbo se hace carne.'},
  '4-2':  {n:'San Francisco de Paula',t:'memoria',d:'Fundador de los Mínimos. Ermitaño calabrés.'},
  '4-5':  {n:'Domingo de Ramos',t:'semana-santa',d:'Entrada triunfal de Jesús en Jerusalén. Inicio de la Semana Santa.'},
  '4-9':  {n:'Jueves Santo',t:'semana-santa',d:'Institución de la Eucaristía y el Sacerdocio ministerial. Triduo Pascual.'},
  '4-10': {n:'Viernes Santo',t:'semana-santa',d:'Pasión y Muerte del Señor. Ayuno y abstinencia obligatorios.'},
  '4-11': {n:'Sábado Santo',t:'semana-santa',d:'Vigilia Pascual. La noche más sagrada del año.'},
  '4-12': {n:'Domingo de Resurrección — Pascua',t:'pascua',d:'¡Alleluia! Cristo ha resucitado. Solemnidad de Solemnidades.'},
  '4-23': {n:'San Jorge',t:'memoria',d:'Mártir. Patrón de Inglaterra, Cataluña, Portugal.'},
  '4-29': {n:'Santa Catalina de Siena',t:'fiesta',d:'Doctora de la Iglesia. Copatrona de Europa.'},
  '5-1':  {n:'San José Obrero',t:'memoria',d:'Dignidad del trabajo humano. Creado por Pío XII en 1955.'},
  '5-13': {n:'Nuestra Señora de Fátima',t:'memoria',d:'Primera aparición en 1917. El 13 de mayo de 1981, atentado a JPII.'},
  '5-26': {n:'San Felipe Neri',t:'memoria',d:'El Santo Apóstol de Roma. Fundó el Oratorio.'},
  '6-13': {n:'San Antonio de Padua',t:'memoria',d:'Doctor de la Iglesia. Patrono para encontrar objetos perdidos.'},
  '6-24': {n:'Natividad de San Juan Bautista',t:'solemnidad',d:'El Precursor. Único nacimiento celebrado como solemnidad además de Jesús.'},
  '6-29': {n:'Santos Pedro y Pablo',t:'solemnidad',d:'Los dos pilares de la Iglesia. Mártires en Roma bajo Nerón.'},
  '7-22': {n:'Santa María Magdalena',t:'fiesta',d:'Apóstola de los Apóstoles. Primera testigo de la Resurrección.'},
  '7-25': {n:'Santiago Apóstol',t:'fiesta',d:'Patrón de España. Su tumba en Santiago de Compostela.'},
  '8-6':  {n:'Transfiguración del Señor',t:'fiesta',d:'Jesús se transfigura ante Pedro, Santiago y Juan.'},
  '8-15': {n:'Asunción de María',t:'solemnidad',d:'Dogma definido por Pío XII en 1950. María asunta en cuerpo y alma.'},
  '8-28': {n:'San Agustín de Hipona',t:'memoria',d:'Doctor de la Iglesia. «Nos hiciste para Ti, Señor.»'},
  '9-8':  {n:'Natividad de María',t:'fiesta',d:'Nacimiento de la Virgen María.'},
  '10-1': {n:'Santa Teresita del Niño Jesús',t:'memoria',d:'Doctora de la Iglesia. La pequeña vía espiritual.'},
  '10-4': {n:'San Francisco de Asís',t:'memoria',d:'El poverello. Fundador de los Franciscanos. Estigmatizado.'},
  '10-7': {n:'Nuestra Señora del Rosario',t:'memoria',d:'En memoria de la batalla de Lepanto (1571).'},
  '10-15':{n:'Santa Teresa de Ávila',t:'fiesta',d:'Doctora de la Iglesia. Reformó el Carmelo. Mística extraordinaria.'},
  '11-1': {n:'Todos los Santos',t:'solemnidad',d:'Celebración de todos los santos canonizados y no canonizados.'},
  '11-2': {n:'Conmemoración de los Fieles Difuntos',t:'conmemoracion',d:'Día de los muertos. Oración por las almas del Purgatorio.'},
  '12-8': {n:'Inmaculada Concepción de María',t:'solemnidad',d:'Dogma de 1854. María concebida sin pecado original.'},
  '12-12':{n:'Nuestra Señora de Guadalupe',t:'fiesta',d:'Patrona de América. Aparición a Juan Diego (1531).'},
  '12-25':{n:'Natividad del Señor',t:'solemnidad',d:'Navidad. «El Verbo se hizo carne y habitó entre nosotros.»'},
};

const TIPO_STYLES = {
  solemnidad: {bg:'rgba(139,26,26,.08)',c:'#8B1A1A',b:'rgba(139,26,26,.2)',label:'Solemnidad',dot:'#8B1A1A'},
  fiesta:      {bg:'var(--ocre-bg)',c:'var(--brown)',b:'var(--border2)',label:'Fiesta',dot:'#C9923A'},
  memoria:     {bg:'rgba(74,32,128,.08)',c:'#4A2080',b:'rgba(74,32,128,.2)',label:'Memoria',dot:'#4A2080'},
  'semana-santa':{bg:'rgba(139,26,26,.08)',c:'#8B1A1A',b:'rgba(139,26,26,.2)',label:'Semana Santa',dot:'#8B1A1A'},
  pascua:      {bg:'rgba(30,107,58,.08)',c:'#1E6B3A',b:'rgba(30,107,58,.2)',label:'Pascua',dot:'#1E6B3A'},
  conmemoracion:{bg:'var(--bg3)',c:'var(--ink3)',b:'var(--border)',label:'Conmemoración',dot:'#888'},
  feria:       {bg:'var(--bg3)',c:'var(--ink3)',b:'var(--border)',label:'Feria',dot:'#D4C098'},
};

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function initCalendario() {
  renderCalendario();
  // Mostrar hoy por defecto
  const today = new Date();
  const key = `${today.getMonth()+1}-${today.getDate()}`;
  showCalDetail(today.getDate(), today.getMonth()+1, today.getFullYear(), FEASTS[key]);
}

function renderCalendario() {
  document.getElementById('cal-month-title').textContent = `${MESES[calMonth]} ${calYear}`;
  // Tiempo litúrgico aproximado
  const tiempos = getTiempoLiturgico(calYear, calMonth);
  document.getElementById('tiempo-pill').textContent = tiempos;

  const first = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Celdas vacías iniciales
  for (let i = 0; i < first; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (first + d - 1) % 7;
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const key = `${calMonth+1}-${d}`;
    const feast = FEASTS[key];
    const dotColor = feast ? (TIPO_STYLES[feast.t]?.dot || '#D4C098') : '#D4C098';

    const el = document.createElement('div');
    el.className = 'cal-day' + (dow === 0 ? ' sunday' : '') + (isToday ? ' today' : '');
    const shortName = feast ? feast.n.split(' ').slice(-1)[0].slice(0,5) : '';
    el.innerHTML = `<span class="cal-day-num">${d}</span>
      <div class="cal-day-dot" style="background:${dotColor}"></div>
      ${feast ? `<span class="cal-day-name">${shortName}</span>` : ''}`;
    el.onclick = () => showCalDetail(d, calMonth + 1, calYear, feast);
    grid.appendChild(el);
  }
}

function showCalDetail(d, m, y, feast) {
  const dow = new Date(y, m-1, d).getDay();
  const el = document.getElementById('cal-detail');
  const ts = feast ? (TIPO_STYLES[feast.t] || TIPO_STYLES.feria) : TIPO_STYLES.feria;
  const title = feast ? feast.n : 'Feria — Tiempo Ordinario';
  const desc = feast ? feast.d : 'Día ordinario del calendario litúrgico.';

  el.innerHTML = `
    <div class="cal-detail-date">${DIAS_SEMANA[dow].toUpperCase()} ${d} DE ${MESES[m-1].toUpperCase()} ${y}</div>
    <div class="cal-detail-title">${title}</div>
    <div class="cal-detail-desc">${desc}</div>
    <div class="cal-detail-tags">
      <span class="cal-tag" style="background:${ts.bg};color:${ts.c};border:1px solid ${ts.b}">${ts.label}</span>
    </div>`;
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendario();
}

function getTiempoLiturgico(year, month) {
  const m = month + 1;
  if (m === 12 && new Date(year, month, 1).getDate() >= 1) return 'Adviento / Navidad';
  if (m === 1) return 'Tiempo de Navidad / Ordinario';
  if (m === 2 || m === 3) return 'Tiempo de Cuaresma';
  if (m === 4 && new Date(year, month, 12).getDay() === 0) return 'Tiempo Pascual';
  if (m >= 5 && m <= 11) return 'Tiempo Ordinario';
  return 'Tiempo Ordinario';
}

// ══════════════════════════════════════════════
// MODAL DE CITAS — CIC y Biblia dentro de la app
// ══════════════════════════════════════════════

const CIC_URLS = {
  // Mapa de números CIC a secciones del Catecismo en Vatican.va
  // Primera parte
  range_1_25: 'p1s1c1_sp.html', range_26_49: 'p1s1c2_sp.html',
  range_50_141: 'p1s1c3_sp.html', range_142_197: 'p1s2c1_sp.html',
  range_198_267: 'p1s2c2_sp.html', range_268_354: 'p1s2c3_sp.html',
  range_355_421: 'p1s2c4_sp.html', range_422_682: 'p1s2c5_sp.html',
  range_683_747: 'p1s2c6_sp.html', range_748_975: 'p1s2c7_sp.html',
  // Segunda parte
  range_1076_1209: 'p2s1_sp.html', range_1210_1690: 'p2s2_sp.html',
  // Tercera parte
  range_1691_1876: 'p3s1_sp.html', range_1877_2051: 'p3s2c1_sp.html',
  range_2052_2557: 'p3s2c2_sp.html',
  // Cuarta parte
  range_2558_2865: 'p4_sp.html'
};

function getCICUrl(num) {
  const n = parseInt(num);
  const base = 'https://www.vatican.va/archive/catechism_sp/';
  if (n <= 25) return base + 'p1s1c1_sp.html';
  if (n <= 49) return base + 'p1s1c2_sp.html';
  if (n <= 141) return base + 'p1s1c3_sp.html';
  if (n <= 197) return base + 'p1s2c1_sp.html';
  if (n <= 267) return base + 'p1s2c2_sp.html';
  if (n <= 354) return base + 'p1s2c3_sp.html';
  if (n <= 421) return base + 'p1s2c4_sp.html';
  if (n <= 682) return base + 'p1s2c5_sp.html';
  if (n <= 747) return base + 'p1s2c6_sp.html';
  if (n <= 975) return base + 'p1s2c7_sp.html';
  if (n <= 1209) return base + 'p2s1_sp.html';
  if (n <= 1690) return base + 'p2s2_sp.html';
  if (n <= 1876) return base + 'p3s1_sp.html';
  if (n <= 2051) return base + 'p3s2c1_sp.html';
  if (n <= 2557) return base + 'p3s2c2_sp.html';
  return base + 'p4_sp.html';
}

function getBibleUrl(ref) {
  // Bible Gateway en español (RVR1960 / NVI)
  const encoded = encodeURIComponent(ref);
  return `https://www.biblegateway.com/passage/?search=${encoded}&version=LBLA`;
}

async function openCitaModal(tipo, ref) {
  const modal = document.getElementById('cita-modal');
  const titleEl = document.getElementById('cita-modal-title');
  const bodyEl = document.getElementById('cita-modal-body');
  const extEl = document.getElementById('cita-modal-ext');
  if (!modal) return;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (tipo === 'biblia') {
    const encoded = encodeURIComponent(ref);
    titleEl.innerHTML = `<span class="cita-ref-pill cita-ref-biblia">${ref}</span>`;
    extEl.href = `https://www.biblegateway.com/passage/?search=${encoded}&version=LBLA`;
    extEl.textContent = 'Ver en BibleGateway ↗';
    bodyEl.innerHTML = `<div class="cita-loading">Buscando pasaje...</div>`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: false,
          messages: [{ role: 'user', content: `Dame el texto COMPLETO y EXACTO de ${ref} de la Biblia, traducción litúrgica en español (Biblia de Jerusalén). Solo el texto bíblico, sin comentarios ni encabezados.` }]
        })
      });
      const data = await res.json();
      bodyEl.innerHTML = `<div class="cita-text-block">${parseMarkdown(data.reply || 'No disponible')}</div>`;
    } catch(e) {
      bodyEl.innerHTML = `<p style="color:var(--ink4);font-style:italic;font-family:Lora,serif">No se pudo cargar. Consulta en BibleGateway.com</p>`;
    }

  } else if (tipo === 'cic') {
    titleEl.innerHTML = `<span class="cita-ref-pill cita-ref-cic">CIC ${ref}</span>`;
    const cicBase = 'https://www.vatican.va/archive/catechism_sp/';
    const n = parseInt(ref);
    let page = 'index_sp.html';
    if (n <= 141) page = 'p1s1_sp.html';
    else if (n <= 421) page = 'p1s2_sp.html';
    else if (n <= 682) page = 'p1s2c5_sp.html';
    else if (n <= 975) page = 'p1s2c7_sp.html';
    else if (n <= 1209) page = 'p2s1_sp.html';
    else if (n <= 1690) page = 'p2s2_sp.html';
    else if (n <= 1876) page = 'p3s1_sp.html';
    else if (n <= 2051) page = 'p3s2c1_sp.html';
    else if (n <= 2557) page = 'p3s2c2_sp.html';
    else page = 'p4_sp.html';
    extEl.href = cicBase + page;
    extEl.textContent = 'Ver en Vatican.va ↗';
    bodyEl.innerHTML = `<div class="cita-loading">Consultando el Catecismo...</div>`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: false,
          messages: [{ role: 'user', content: `Dame el texto COMPLETO y EXACTO del artículo ${ref} del Catecismo de la Iglesia Católica. Solo el número y el texto del artículo, sin comentarios.` }]
        })
      });
      const data = await res.json();
      bodyEl.innerHTML = `<div class="cita-text-block">${parseMarkdown(data.reply || 'No disponible')}</div>`;
    } catch(e) {
      bodyEl.innerHTML = `<p style="color:var(--ink4);font-style:italic;font-family:Lora,serif">No se pudo cargar. Consulta en Vatican.va</p>`;
    }
  }
}

function closeCitaModal() {
  const modal = document.getElementById('cita-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function closeCitaModal() {
  const modal = document.getElementById('cita-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ══════════════════════════════════════════════
// WIDGETS SAGRADOS
// ══════════════════════════════════════════════
function openWidgets() {
  const modal = document.getElementById('widgets-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeWidgets() {
  const modal = document.getElementById('widgets-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// ══════════════════════════════════════════════
// MAGISTERIUM — mostrar fuentes verificadas
// ══════════════════════════════════════════════
function renderMagisteriumSources(text, bubble) {
  if (!text || text.length < 30) return;
  const div = document.createElement('div');
  div.className = 'mag-sources';
  div.innerHTML = `
    <div class="mag-sources-title">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/>
        <path d="M6 4v3M6 8.5v.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      Fuentes verificadas del Magisterio
    </div>
    <div class="mag-sources-text">${parseMarkdown(text)}</div>`;
  bubble.insertBefore(div, bubble.firstChild);
}
