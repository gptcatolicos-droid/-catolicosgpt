// ══════════════════════════════
// STATE
// ══════════════════════════════
let sbOpen = false;
let isLoading = false;
let currentLang = 'es';
let chatHistory = [];
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
  // Normalizar saltos de línea
  text = text.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');

  // ── TABLAS: procesar línea por línea ──
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|', 1)) {
      // Recolectar todas las líneas de la tabla
      const tLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tLines.push(lines[i].trim());
        i++;
      }
      // Renderizar tabla
      let tHtml = '<div style="overflow-x:auto;margin:14px 0;border-radius:8px;border:1px solid var(--border);box-shadow:0 1px 4px var(--shadow)"><table style="width:100%;border-collapse:collapse">';
      let firstRow = true;
      tLines.forEach(tl => {
        // Saltar línea separadora |---|
        if (/^\|[\s\-:]+[\|\-][\s\-:]+\|/.test(tl)) return;
        const cells = tl.split('|').map(c => c.trim()).filter(c => c !== '');
        if (!cells.length) return;
        const tag = firstRow ? 'th' : 'td';
        tHtml += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
        firstRow = false;
      });
      tHtml += '</table></div>';
      out.push(tHtml);
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  text = out.join('\n');

  // ── RESTO DEL MARKDOWN ──
  let html = text
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1 ↗</a>')
    .replace(/^---$/gim, '<hr>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^(\d+)\. (.*$)/gim, '<li><strong style="color:var(--ocre)">$1.</strong> $2</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');

  html = html.replace(/(<li>.*?<\/li>(<br>)?)+/gs, m => `<ul>${m.replace(/<br>/g,'')}</ul>`);
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
    b.innerHTML += '<div class="src-row"><span class="src">Magisterio</span><span class="src">Vatican.va</span></div>';

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

  isLoading = true;
  document.getElementById('send-btn').disabled = true;

  const userMsg = val;
  chatHistory.push({ role: 'user', content: val });
  renderBubble(val, true);
  cin.value = ''; cin.style.height = 'auto';
  addTyping();

  // Determinar si mostrar botones de exportar
  const needsActions = /cartilla|catequesis|novena|rosario|vía crucis|via crucis|homilía|homilia|oración|oracion|lecturas|laudes|vísperas|visperas|completas|tabla|línea de tiempo|cronología|actividad|clase/i.test(val);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    removeTyping();

    const reply = data.reply || i18n[currentLang].errorAI;
    chatHistory.push({ role: 'assistant', content: reply });
    renderBubble(reply, false, needsActions, userMsg);

    if (chatHistory.length === 2) saveConversation(val);

  } catch (e) {
    removeTyping();
    renderBubble(i18n[currentLang].error, false);
  }

  isLoading = false;
  document.getElementById('send-btn').disabled = false;
}

function sendChip(t) {
  closeSb();
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
  // Guardar chat en recientes antes de cambiar vista
  if (chatHistory.length > 0 && chatHistory.length === 2) {
    saveConversation(chatHistory[0].content);
  }
  // Ocultar todo
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'none';
  document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
  // Mostrar vista
  const view = document.getElementById('view-' + id);
  if (view) {
    view.style.display = 'flex';
    // Ocultar input del chat
    document.querySelector('.input-area').style.display = 'none';
  }
  if (id === 'breviario') initBreviario();
  if (id === 'calendario') initCalendario();
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
  closeView();
  // Mostrar typing mientras carga
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'block';
  document.querySelector('.input-area').style.display = '';
  addTyping();
  
  try {
    const res = await fetch('/api/lecturas-dia');
    const json = await res.json();
    removeTyping();
    
    if (json.ok && json.data) {
      const d = json.data;
      let html = '';
      const now = new Date();
      const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      
      html += `## Lecturas del día — ${dias[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}

`;
      
      // Procesar lecturas de la API AELF
      const messes = d.messes || d.lectures_lecture || [];
      if (messes.length > 0) {
        messes.forEach(lectura => {
          if (lectura.type === 'lecture_1' || lectura.key === 'lecture_1') {
            html += `### Primera Lectura
*${lectura.ref || ''}*
${lectura.intro_text || ''}

${lectura.text || ''}

`;
          } else if (lectura.type === 'psaume' || lectura.key === 'psaume') {
            html += `### Salmo Responsorial
*${lectura.ref || ''}*
${lectura.text || ''}

`;
          } else if (lectura.type === 'lecture_2' || lectura.key === 'lecture_2') {
            html += `### Segunda Lectura
*${lectura.ref || ''}*
${lectura.text || ''}

`;
          } else if (lectura.type === 'evangile' || lectura.key === 'evangile') {
            html += `### Evangelio
*${lectura.ref || ''}*
${lectura.intro_text || ''}

${lectura.text || ''}

*Palabra del Señor.*

`;
          }
        });
      } else {
        // Estructura alternativa de AELF
        const partes = d.lectures || [];
        partes.forEach(p => {
          html += `### ${p.type || p.key || 'Lectura'}
*${p.ref || ''}*
${p.text || ''}

`;
        });
      }
      
      if (!html || html.length < 100) {
        throw new Error('Respuesta vacía de la API');
      }
      
      const msg = { role: 'assistant', content: html };
      chatHistory.push({ role: 'user', content: 'Lecturas del día' });
      chatHistory.push(msg);
      renderBubble('Lecturas del día', true);
      renderBubble(html, false, false, 'lecturas');
      saveConversation('Lecturas del día');
      
    } else {
      throw new Error(json.error || 'API no disponible');
    }
  } catch(e) {
    removeTyping();
    // Fallback: pedir a la IA
    renderBubble('Lecturas del día', true);
    chatHistory.push({ role: 'user', content: 'Lecturas del día de hoy — muéstrame las lecturas reales del calendario litúrgico romano completas con los textos bíblicos exactos' });
    addTyping();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory })
      });
      const data = await res.json();
      removeTyping();
      const reply = data.reply || 'Error al cargar las lecturas.';
      chatHistory.push({ role: 'assistant', content: reply });
      renderBubble(reply, false, false, 'lecturas');
      saveConversation('Lecturas del día');
    } catch(e2) {
      removeTyping();
      renderBubble('No se pudieron cargar las lecturas. Inténtalo de nuevo.', false);
    }
  }
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
