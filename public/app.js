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
  // ── PASO 1: Detectar y convertir tablas markdown ──
  // Separar el texto en líneas para procesar tablas
  const lines = text.split('\n');
  const processedLines = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Detectar inicio de tabla: línea con pipes |
    if (/^\|.+\|/.test(line.trim())) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        tableLines.push(lines[i]);
        i++;
      }
      // Convertir a HTML
      let tableHtml = '<div style="overflow-x:auto;margin:12px 0;width:100%"><table>';
      let isFirst = true;
      tableLines.forEach(tl => {
        if (/^\|[-:|\s]+\|$/.test(tl.trim())) return; // separador
        const cells = tl.split('|').map(c => c.trim()).filter(c => c !== '');
        if (cells.length === 0) return;
        const tag = isFirst ? 'th' : 'td';
        tableHtml += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
        isFirst = false;
      });
      tableHtml += '</table></div>';
      processedLines.push(tableHtml);
    } else {
      processedLines.push(line);
      i++;
    }
  }
  text = processedLines.join('\n');

  // ── PASO 2: Resto del markdown ──
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

  // Envolver listas
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
  const text = getBubbleText(btn);

  // Logo
  try {
    const logoImg = document.getElementById('logo-hidden');
    if (logoImg && logoImg.complete) {
      const canvas = document.createElement('canvas');
      canvas.width = logoImg.naturalWidth;
      canvas.height = logoImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(logoImg, 0, 0);
      const logoData = canvas.toDataURL('image/png');
      doc.addImage(logoData, 'PNG', 75, 10, 60, 30);
    }
  } catch(e) {}

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(92, 61, 30);
  doc.text('CatolicosGPT', 105, 48, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(168, 136, 88);
  doc.text('catolicosgpt.com · Basado en el Magisterio de la Iglesia Católica', 105, 54, { align: 'center' });

  // Línea separadora
  doc.setDrawColor(212, 192, 152);
  doc.line(20, 57, 190, 57);

  // Contenido
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(24, 16, 10);
  const lines = doc.splitTextToSize(text, 170);
  doc.text(lines, 20, 65);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(168, 136, 88);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' })}`, 105, 285, { align: 'center' });

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
