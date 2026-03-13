// ── STATE ──
let sbOpen = false;
let isLoading = false;
let currentLang = 'es';
let chatHistory = [];
let conversations = JSON.parse(localStorage.getItem('cgpt_convs') || '[]');

const i18n = {
  es: {
    placeholder: 'Pregunta sobre fe, oración, santos, moral…',
    hint: 'CatolicosGPT · Respuestas basadas en el Magisterio y Vatican.va',
    welcome: '¿En qué puedo ayudarte, <em>hermano</em>?',
    you: 'TÚ',
    error: 'Error de conexión. Verifica tu internet e intenta de nuevo.',
    errorAI: 'Lo siento, hubo un error. Por favor intenta de nuevo.'
  },
  en: {
    placeholder: 'Ask about faith, prayer, saints, morality…',
    hint: 'CatolicosGPT · Answers based on the Magisterium and Vatican.va',
    welcome: 'How can I help you, <em>brother</em>?',
    you: 'YOU',
    error: 'Connection error. Check your internet and try again.',
    errorAI: 'Sorry, there was an error. Please try again.'
  }
};

// ── SIDEBAR ──
function toggleSb() { sbOpen ? closeSb() : openSb(); }

function openSb() {
  document.getElementById('sb').classList.add('open');
  document.getElementById('overlay').classList.add('show');
  sbOpen = true;
  renderHistory();
}

function closeSb() {
  document.getElementById('sb').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  sbOpen = false;
}

// ── HISTORY ──
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!conversations.length) {
    el.innerHTML = '<div style="padding:6px 14px;font-family:Lora,serif;font-size:12px;color:var(--ink4);font-style:italic">Sin conversaciones aún</div>';
    return;
  }
  el.innerHTML = conversations.slice(-10).reverse().map((c, i) =>
    `<div class="sb-item" onclick="loadConv(${conversations.length - 1 - i});closeSb()">
      <div class="sb-ico">💬</div>
      <span class="sb-lbl">${escapeHtml(c.title)}</span>
      <span class="sb-time">${c.time}</span>
    </div>`
  ).join('');
}

function saveConversation(title) {
  const now = new Date();
  const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  conversations.push({ title: title.slice(0, 40), time, messages: [...chatHistory] });
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

// ── LANG ──
function setLang(l, btn) {
  currentLang = l;
  document.querySelectorAll('.lang-sw button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('cin').placeholder = i18n[l].placeholder;
  document.getElementById('input-hint').textContent = i18n[l].hint;
  document.getElementById('w-title').innerHTML = i18n[l].welcome;
}

// ── MARKDOWN PARSER ──
function parseMarkdown(text) {
  return text
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^(\d+)\. (.*$)/gim, '<li><strong style="color:var(--ocre)">$1.</strong> $2</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── RENDER BUBBLE ──
function renderBubble(text, isUser, withExport = false) {
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'block';

  const wrap = document.getElementById('chat-inner');
  const d = document.createElement('div');
  d.className = 'msg' + (isUser ? ' u' : '');

  const av = document.createElement('div');
  av.className = 'av ' + (isUser ? 'usr' : 'bot');
  av.innerHTML = isUser
    ? i18n[currentLang].you
    : `<svg width="14" height="14" viewBox="0 0 80 80" fill="none">
        <line x1="40" y1="8" x2="40" y2="52" stroke="#E8A84C" stroke-width="5" stroke-linecap="round"/>
        <line x1="27" y1="20" x2="53" y2="20" stroke="#E8A84C" stroke-width="5" stroke-linecap="round"/>
       </svg>`;

  const b = document.createElement('div');
  b.className = 'bubble ' + (isUser ? 'usr' : 'bot');
  b.innerHTML = isUser ? escapeHtml(text) : parseMarkdown(text);

  if (!isUser) {
    b.innerHTML += '<div class="src-row"><span class="src">Magisterio</span><span class="src">Vatican.va</span></div>';
    if (withExport) {
      b.innerHTML += `<div class="export-row">
        <button class="exp-btn pdf" onclick="exportPDF(this)">📕 PDF</button>
        <button class="exp-btn word" onclick="exportWord(this)">📝 Word</button>
        <button class="exp-btn ppt" onclick="exportPPT(this)">📊 PPT</button>
      </div>`;
    }
  }

  d.appendChild(av);
  d.appendChild(b);
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;
}

// ── TYPING ──
function addTyping() {
  const wrap = document.getElementById('chat-inner');
  const d = document.createElement('div');
  d.className = 'msg'; d.id = 'typing-indicator';
  const av = document.createElement('div');
  av.className = 'av bot';
  av.innerHTML = `<svg width="14" height="14" viewBox="0 0 80 80" fill="none">
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

// ── SEND ──
async function send() {
  const cin = document.getElementById('cin');
  const val = cin.value.trim();
  if (!val || isLoading) return;

  isLoading = true;
  document.getElementById('send-btn').disabled = true;

  chatHistory.push({ role: 'user', content: val });
  renderBubble(val, true);
  cin.value = ''; cin.style.height = 'auto';
  addTyping();

  const needsExport = /cartilla|catequesis|novena|rosario|vía crucis|via crucis|homilía|homilia|oración|oracion/i.test(val);

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
    renderBubble(reply, false, needsExport);

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
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function newChat() {
  chatHistory = [];
  document.getElementById('welcome').style.display = 'flex';
  document.getElementById('chat-area').style.display = 'none';
  document.getElementById('chat-inner').innerHTML = '';
  closeSb();
}

// ── EXPORTS ──
function getBubbleText(btn) {
  const bubble = btn.closest('.bubble');
  const clone = bubble.cloneNode(true);
  clone.querySelectorAll('.src-row, .export-row').forEach(el => el.remove());
  return clone.innerText.trim();
}

function exportPDF(btn) {
  if (!window.jspdf) { alert('PDF no disponible. Recarga la página.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const text = getBubbleText(btn);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CatolicosGPT', 20, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, 170);
  doc.text(lines, 20, 35);
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text('catolicosgpt.com · Basado en el Magisterio y Vatican.va', 20, 285);
  doc.save('catolicosgpt.pdf');
}

function exportWord(btn) {
  const text = getBubbleText(btn);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="UTF-8"><title>CatolicosGPT</title></head>
    <body style="font-family:Georgia,serif;font-size:12pt;line-height:1.8">
      <h1 style="color:#5C3D1E;font-family:Georgia,serif">CatolicosGPT</h1>
      <p>${text.replace(/\n/g, '</p><p>')}</p>
      <p style="color:#A88858;font-size:9pt;margin-top:40px">catolicosgpt.com · Basado en el Magisterio y Vatican.va</p>
    </body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'catolicosgpt.doc';
  a.click();
}

function exportPPT(btn) {
  const text = getBubbleText(btn);
  const lines = text.split('\n').filter(l => l.trim()).slice(0, 6);
  alert('PowerPoint — Contenido listo para copiar:\n\n' + lines.join('\n') + '\n\n(Integración completa con PptxGenJS disponible próximamente)');
}

// ── DONAR ──
function openDonate() { document.getElementById('donate-modal').classList.add('show'); }
function closeDonate() { document.getElementById('donate-modal').classList.remove('show'); }

function selectAmount(btn, amount) {
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('paypal-link').href = `https://www.paypal.com/paypalme/schoolmarketing/${amount}`;
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('donate-modal').addEventListener('click', function(e) {
    if (e.target === this) closeDonate();
  });
});
