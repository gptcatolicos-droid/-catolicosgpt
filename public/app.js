// ══════════════════════════════════════════
// CatolicosGPT V10 — app.js
// ══════════════════════════════════════════

let chatHistory = [];
let conversations = [];
let isLoading = false;
let sbOpen = false;
let currentStream = null;

// ── Utilidades ──
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function parseMarkdown(text) {
  if (!text) return '';
  text = String(text);

  // Tablas
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('|') && t.endsWith('|') && t.split('|').length > 2) {
      const tLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tLines.push(lines[i].trim()); i++; }
      let html = '<div style="overflow-x:auto;margin:14px 0"><table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:8px;overflow:hidden">';
      let first = true;
      tLines.forEach(tl => {
        if (/^\|[\s\-:]+[\|\-]/.test(tl)) return;
        const cells = tl.split('|').map(c => c.trim()).filter(c => c !== '');
        if (!cells.length) return;
        const tag = first ? 'th' : 'td';
        const style = first ? 'background:var(--bg3);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em;' : '';
        html += '<tr>' + cells.map(c => `<${tag} style="padding:9px 12px;border:1px solid var(--border);${style}">${c}</${tag}>`).join('') + '</tr>';
        first = false;
      });
      html += '</table></div>';
      out.push(html);
    } else { out.push(lines[i]); i++; }
  }
  text = out.join('\n');

  // Links CIC [CIC XXXX]
  text = text.replace(/\[CIC\s*(\d+)\]/g, (_, num) =>
    `<a href="#" class="cita-cic" onclick="openCitaModal('cic','${num}');return false;">CIC ${num}</a>`
  );

  // Links bíblicos [Jn 3,16]
  const books = '(?:1|2|3)?\\s*(?:Gn|Ex|Lv|Nm|Dt|Jos|Jue|Rut|Sam|Re|Cr|Esd|Neh|Tob|Jdt|Est|Mac|Job|Sal|Prov|Ecl|Cant|Sab|Sir|Is|Jer|Lam|Bar|Ez|Dn|Os|Jl|Am|Abd|Jon|Miq|Nah|Hab|Sof|Ag|Zac|Mal|Mt|Mc|Lc|Jn|Hch|Rom|Cor|Gal|Ef|Flp|Col|Tes|Tim|Tit|Flm|Heb|Sant|Pe|Jds|Ap)';
  const bibleRx = new RegExp('\\[(' + books + '\\s+[\\d][\\d,\\.\\-\\u2013;\\s]*)\\]', 'g');
  text = text.replace(bibleRx, (_, ref) => {
    const r = ref.trim();
    return `<a href="#" class="cita-biblia" onclick="openCitaModal('biblia','${r.replace(/'/g,"\\'")}');return false;">${r}</a>`;
  });

  // Links externos
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" style="color:var(--ocre)">$1 ↗</a>');

  // Markdown
  return text
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^(\d+)\. (.*$)/gim, '<li><strong style="color:var(--ocre)">$1.</strong> $2</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

// ── Sidebar ──
function toggleSb() { sbOpen ? closeSb() : openSb(); }

function openSb() {
  const sb = document.getElementById('sb');
  const ov = document.getElementById('sb-overlay');
  if (sb) sb.classList.add('open');
  if (ov) ov.classList.add('active');
  document.body.style.overflow = 'hidden';
  sbOpen = true;
}

function closeSb() {
  const sb = document.getElementById('sb');
  const ov = document.getElementById('sb-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('active');
  document.body.style.overflow = '';
  sbOpen = false;
}

// ── Chat ──
async function send() {
  const cin = document.getElementById('cin');
  const val = cin.value.trim();
  if (!val || isLoading) return;

  isLoading = true;
  cin.value = ''; cin.style.height = 'auto';

  // Ocultar welcome, mostrar chat
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'flex';
  document.getElementById('chat-area').style.flexDirection = 'column';
  document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
  document.getElementById('input-area').style.display = '';

  chatHistory.push({ role: 'user', content: val });

  // Burbuja usuario
  const inner = document.getElementById('chat-inner');
  const userRow = document.createElement('div');
  userRow.className = 'msg-row user-row';
  userRow.innerHTML = `
    <div class="av av-user">TÚ</div>
    <div class="bubble bubble-user">${esc(val)}</div>`;
  inner.appendChild(userRow);
  inner.scrollTop = inner.scrollHeight;

  // Burbuja bot
  const botRow = document.createElement('div');
  botRow.className = 'msg-row bot-row';
  botRow.innerHTML = `
    <div class="av">
      <svg width="18" height="18" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="30" r="21" stroke="#7A5230" stroke-width="2.2"/>
        <line x1="40" y1="9" x2="40" y2="51" stroke="#C9923A" stroke-width="2.8" stroke-linecap="round"/>
        <line x1="27" y1="20" x2="53" y2="20" stroke="#C9923A" stroke-width="2.8" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="bubble bubble-bot" id="bot-bubble-${Date.now()}"><span class="typing-cursor">▋</span></div>`;
  inner.appendChild(botRow);
  inner.scrollTop = inner.scrollHeight;
  const bubble = botRow.querySelector('.bubble-bot');

  document.getElementById('send-btn').style.display = 'none';

  currentStream = new AbortController();

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory, stream: true }),
      signal: currentStream.signal
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let magText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop();
      for (const line of parts) {
        if (!line.startsWith('data: ')) continue;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.delta) {
            fullText += d.delta;
            bubble.innerHTML = parseMarkdown(fullText) + '<span class="typing-cursor">▋</span>';
            inner.scrollTop = inner.scrollHeight;
          }
          if (d.magisterium) magText = d.magisterium;
          if (d.done) {
            bubble.innerHTML = '';
            // Mostrar Magisterium si hay
            if (magText) {
              bubble.innerHTML += `<div class="mag-badge">
                <div class="mag-badge-title">Fuentes del Magisterio</div>
                <div class="mag-badge-text">${parseMarkdown(magText)}</div>
              </div>`;
            }
            bubble.innerHTML += parseMarkdown(fullText);
            chatHistory.push({ role: 'assistant', content: fullText });
            addActions(bubble, fullText);
            if (chatHistory.length === 2) saveConversation(val);
          }
          if (d.error) throw new Error(d.error);
        } catch(e) {}
      }
    }

    if (fullText && !bubble.querySelector('.action-row')) {
      bubble.innerHTML = parseMarkdown(fullText);
      chatHistory.push({ role: 'assistant', content: fullText });
      addActions(bubble, fullText);
      if (chatHistory.length === 2) saveConversation(val);
    }

  } catch(e) {
    if (e.name !== 'AbortError') {
      bubble.innerHTML = '<em style="color:var(--red)">Error al conectar. Intenta de nuevo.</em>';
    }
  }

  isLoading = false;
  currentStream = null;
  document.getElementById('send-btn').style.display = 'flex';
}

function addActions(bubble, text) {
  // Extrae sugerencias de seguimiento del texto (→ ¿...)
  const sugsMatch = text.match(/→\s*¿[^?]+\?/g) || [];
  const sugs = sugsMatch.map(s => s.replace(/^→\s*/, '').trim()).slice(0, 3);

  let html = '<div class="action-row">';
  html += `<button class="act-btn" onclick="exportPDF(this)">📕 PDF</button>`;
  html += `<button class="act-btn" onclick="copyText(this)">📋 Copiar</button>`;
  html += '</div>';

  if (sugs.length > 0) {
    html += '<div class="suggestions">';
    sugs.forEach(s => {
      html += `<span class="sug-chip" onclick="sendChip('${s.replace(/'/g,"\\'")}')">💭 ${esc(s)}</span>`;
    });
    html += '</div>';
  }

  bubble.innerHTML += html;
}

function sendChip(t) {
  document.getElementById('cin').value = t;
  send();
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
  document.getElementById('chat-inner').innerHTML = '';
  document.getElementById('chat-area').style.display = 'none';
  document.getElementById('welcome').style.display = 'flex';
  document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
  document.getElementById('input-area').style.display = '';
}

function saveConversation(title) {
  const now = new Date();
  const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');
  conversations.unshift({ title: title.slice(0, 45), time, messages: [...chatHistory] });
  if (conversations.length > 20) conversations.pop();
  renderHistory();
}

function renderHistory() {
  const el = document.getElementById('history-list');
  if (!el) return;
  if (!conversations.length) {
    el.innerHTML = '<div style="padding:4px 10px 8px;font-family:Inter,sans-serif;font-size:12px;color:var(--ink4)">Sin conversaciones aún</div>';
    return;
  }
  el.innerHTML = conversations.map((c, i) => `
    <div class="history-item" onclick="loadConversation(${i})">
      <span class="hi-title">${esc(c.title)}</span>
      <span class="hi-time">${c.time}</span>
    </div>`).join('');
}

function loadConversation(i) {
  const c = conversations[i];
  if (!c) return;
  chatHistory = [...c.messages];
  document.getElementById('chat-inner').innerHTML = '';
  chatHistory.forEach(m => {
    const inner = document.getElementById('chat-inner');
    if (m.role === 'user') {
      const row = document.createElement('div');
      row.className = 'msg-row user-row';
      row.innerHTML = `<div class="av av-user">TÚ</div><div class="bubble bubble-user">${esc(m.content)}</div>`;
      inner.appendChild(row);
    } else {
      const row = document.createElement('div');
      row.className = 'msg-row bot-row';
      row.innerHTML = `<div class="av"><svg width="18" height="18" viewBox="0 0 80 80" fill="none"><circle cx="40" cy="30" r="21" stroke="#7A5230" stroke-width="2.2"/><line x1="40" y1="9" x2="40" y2="51" stroke="#C9923A" stroke-width="2.8" stroke-linecap="round"/><line x1="27" y1="20" x2="53" y2="20" stroke="#C9923A" stroke-width="2.8" stroke-linecap="round"/></svg></div><div class="bubble bubble-bot">${parseMarkdown(m.content)}</div>`;
      inner.appendChild(row);
    }
  });
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'flex';
  document.getElementById('chat-area').style.flexDirection = 'column';
  closeSb();
}

// ── Vistas ──
function openView(id) {
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'none';
  document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
  document.getElementById('input-area').style.display = 'none';

  const view = document.getElementById('view-' + id);
  if (view) view.style.display = 'flex';

  if (id === 'lecturas') initLecturas();
  if (id === 'breviario') initBreviario();
  if (id === 'misal') initMisal();
}

function closeView() {
  document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
  document.getElementById('input-area').style.display = '';
  if (chatHistory.length > 0) {
    document.getElementById('chat-area').style.display = 'flex';
    document.getElementById('welcome').style.display = 'none';
  } else {
    document.getElementById('welcome').style.display = 'flex';
    document.getElementById('chat-area').style.display = 'none';
  }
}

// ── Lecturas del día ──
async function initLecturas() {
  const container = document.getElementById('lecturas-content');
  const dateEl = document.getElementById('lecturas-date');
  if (!container) return;

  const now = new Date();
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
  if (dateEl) dateEl.textContent = fechaStr.toUpperCase();

  container.innerHTML = `<div style="text-align:center;padding:40px 20px;font-family:'Lora',serif;color:var(--ink4);font-style:italic">
    Cargando lecturas del ${fechaStr}...
  </div>`;

  try {
    const resp = await fetch('/api/lecturas-dia');
    const json = await resp.json();
    if (!json.ok || !json.texto) throw new Error(json.error || 'Sin datos');

    const secciones = [
      { key: 'PRIMERA_LECTURA', titulo: 'Primera Lectura', color: '#8B1A1A' },
      { key: 'SALMO', titulo: 'Salmo Responsorial', color: '#4A2080' },
      { key: 'SEGUNDA_LECTURA', titulo: 'Segunda Lectura', color: '#8B1A1A' },
      { key: 'EVANGELIO', titulo: 'Evangelio', color: '#1E6B3A' },
    ];

    let html = `<div style="background:rgba(201,146,58,.08);border-radius:10px;padding:12px 16px;margin-bottom:20px;border-left:3px solid var(--ocre)">
      <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ocre)">Lecturas de la Misa del Día</div>
      <div style="font-family:'Playfair Display',serif;font-size:14px;color:var(--brown);margin-top:3px">${fechaStr}</div>
    </div>`;

    let found = false;
    for (let k = 0; k < secciones.length; k++) {
      const { key, titulo, color } = secciones[k];
      const marker = '---' + key + '---';
      let si = json.texto.indexOf(marker);
      if (si === -1) continue;
      found = true;
      si += marker.length;

      let ei = json.texto.length;
      for (let j = k + 1; j < secciones.length; j++) {
        const ni = json.texto.indexOf('---' + secciones[j].key + '---', si);
        if (ni !== -1) { ei = ni; break; }
      }

      const secTexto = json.texto.slice(si, ei).trim();
      if (!secTexto) continue;

      html += `<div style="margin-bottom:24px">
        <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;
             letter-spacing:.1em;color:${color};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">
          ${titulo}
        </div>
        <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink);white-space:pre-wrap">${esc(secTexto)}</div>
      </div>`;
    }

    if (!found) {
      html += `<div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink);white-space:pre-wrap">${esc(json.texto)}</div>`;
    }

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div style="padding:20px;text-align:center">
      <p style="font-family:'Lora',serif;font-size:14px;color:var(--ink4);font-style:italic;margin-bottom:16px">
        No se pudieron cargar las lecturas. Intenta de nuevo.
      </p>
      <button onclick="initLecturas()" style="background:var(--brown);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:'Lora',serif;cursor:pointer">
        Reintentar
      </button>
    </div>`;
  }
}

// ── Breviario Laudes ──
async function initBreviario() {
  const container = document.getElementById('brev-content');
  const dateEl = document.getElementById('brev-date-label');
  if (!container) return;

  const now = new Date();
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
  if (dateEl) dateEl.textContent = fechaStr.toUpperCase();

  container.innerHTML = `<div style="text-align:center;padding:40px 20px;font-family:'Lora',serif;color:var(--ink4);font-style:italic">
    Cargando Laudes del ${fechaStr}...
  </div>`;

  try {
    const resp = await fetch('/api/breviario');
    const json = await resp.json();
    if (!json.ok || !json.texto) throw new Error(json.error || 'Sin datos');

    const secciones = [
      { key: 'HIMNO', titulo: 'Himno', color: '#4A2080' },
      { key: 'SALMO_1', titulo: 'Salmo', color: '#1E6B3A' },
      { key: 'SALMO_2', titulo: 'Salmo', color: '#1E6B3A' },
      { key: 'CANTICO', titulo: 'Cántico', color: '#7A5230' },
      { key: 'LECTURA_BREVE', titulo: 'Lectura breve', color: '#8B1A1A' },
      { key: 'RESPONSORIO', titulo: 'Responsorio', color: '#4A2080' },
      { key: 'BENEDICTUS', titulo: 'Cántico de Zacarías (Benedictus)', color: '#C9923A' },
      { key: 'PRECES', titulo: 'Preces', color: '#5C3D1E' },
      { key: 'ORACION', titulo: 'Oración conclusiva', color: '#8B1A1A' },
    ];

    let html = `<div style="background:rgba(201,146,58,.08);border-radius:10px;padding:12px 16px;margin-bottom:20px;border-left:3px solid var(--ocre)">
      <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ocre)">Laudes · Liturgia de las Horas</div>
      <div style="font-family:'Playfair Display',serif;font-size:14px;color:var(--brown);margin-top:3px">${fechaStr}</div>
    </div>`;

    const texto = json.texto;
    const keys = secciones.map(s => s.key);

    for (let k = 0; k < secciones.length; k++) {
      const { key, titulo, color } = secciones[k];
      const marker = '---' + key + '---';
      let si = texto.indexOf(marker);
      if (si === -1) continue;
      si += marker.length;

      let ei = texto.length;
      for (let j = k + 1; j < secciones.length; j++) {
        const ni = texto.indexOf('---' + keys[j] + '---', si);
        if (ni !== -1) { ei = ni; break; }
      }

      const secTexto = texto.slice(si, ei).trim();
      if (!secTexto) continue;

      html += `<div style="margin-bottom:20px">
        <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;
             letter-spacing:.1em;color:${color};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)">
          ${titulo}
        </div>
        <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink);white-space:pre-wrap">${esc(secTexto)}</div>
      </div>`;
    }

    if (!texto.includes('---')) {
      html += `<div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink);white-space:pre-wrap">${esc(texto)}</div>`;
    }

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div style="padding:20px;text-align:center">
      <p style="font-family:'Lora',serif;font-size:14px;color:var(--ink4);font-style:italic;margin-bottom:16px">
        No se pudieron cargar los Laudes. Intenta de nuevo.
      </p>
      <button onclick="initBreviario()" style="background:var(--brown);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:'Lora',serif;cursor:pointer">
        Reintentar
      </button>
    </div>`;
  }
}

// ── Misal del día ──
function initMisal() {
  const container = document.getElementById('misal-content');
  if (!container) return;

  container.innerHTML = `
    <div style="background:rgba(201,146,58,.08);border-radius:10px;padding:12px 16px;margin-bottom:20px;border-left:3px solid var(--ocre)">
      <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ocre)">Ordinario de la Misa</div>
    </div>
    ${misalOrdinario()}`;
}

function misalOrdinario() {
  return `
<div style="margin-bottom:24px">
  <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8B1A1A;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Ritos iniciales</div>
  <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">
    <strong>Sacerdote:</strong> En el nombre del Padre, y del Hijo, y del Espíritu Santo.<br>
    <strong>Pueblo: Amén.</strong><br><br>
    <strong>Sacerdote:</strong> La gracia de nuestro Señor Jesucristo, el amor del Padre y la comunión del Espíritu Santo estén con todos vosotros.<br>
    <strong>Pueblo: Y con tu espíritu.</strong>
  </div>
</div>

<div style="margin-bottom:24px">
  <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8B1A1A;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Acto penitencial</div>
  <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">
    <strong>Todos:</strong> Yo confieso ante Dios todopoderoso y ante vosotros, hermanos, que he pecado mucho de pensamiento, palabra, obra y omisión. Por mi culpa, por mi culpa, por mi grande culpa. Por eso ruego a Santa María, siempre Virgen, a los ángeles, a los santos y a vosotros, hermanos, que intercedáis por mí ante Dios, nuestro Señor.
  </div>
</div>

<div style="margin-bottom:24px">
  <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#4A2080;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Gloria</div>
  <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">
    Gloria a Dios en el cielo, y en la tierra paz a los hombres que ama el Señor. Por tu inmensa gloria te alabamos, te bendecimos, te adoramos, te glorificamos, te damos gracias, Señor Dios, Rey celestial, Dios Padre todopoderoso.<br><br>
    Señor, Hijo único, Jesucristo, Señor Dios, Cordero de Dios, Hijo del Padre; tú que quitas el pecado del mundo, ten piedad de nosotros; tú que quitas el pecado del mundo, atiende nuestra súplica; tú que estás sentado a la derecha del Padre, ten piedad de nosotros.<br><br>
    Porque solo tú eres Santo, solo tú Señor, solo tú Altísimo, Jesucristo, con el Espíritu Santo en la gloria de Dios Padre. <strong>Amén.</strong>
  </div>
</div>

<div style="margin-bottom:24px">
  <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#1E6B3A;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Liturgia de la Palabra</div>
  <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">
    <em>Primera Lectura — Lector:</em> Palabra de Dios. <strong>Pueblo: Te alabamos, Señor.</strong><br>
    <em>Salmo responsorial.</em><br>
    <em>Evangelio —</em> <strong>Pueblo: Gloria a ti, Señor Jesucristo.</strong><br>
    <em>Al final:</em> Palabra del Señor. <strong>Pueblo: Gloria a ti, Señor Jesucristo.</strong>
  </div>
</div>

<div style="margin-bottom:24px">
  <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#5C3D1E;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Credo</div>
  <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">
    Creo en un solo Dios, Padre todopoderoso, Creador del cielo y de la tierra, de todo lo visible y lo invisible. Creo en un solo Señor, Jesucristo, Hijo único de Dios, nacido del Padre antes de todos los siglos: Dios de Dios, Luz de Luz, Dios verdadero de Dios verdadero, engendrado, no creado, de la misma naturaleza del Padre, por quien todo fue hecho; que por nosotros, los hombres, y por nuestra salvación bajó del cielo, y por obra del Espíritu Santo se encarnó de María, la Virgen, y se hizo hombre; y por nuestra causa fue crucificado en tiempos de Poncio Pilato, padeció y fue sepultado, y resucitó al tercer día, según las Escrituras, y subió al cielo, y está sentado a la derecha del Padre; y de nuevo vendrá con gloria para juzgar a vivos y muertos, y su reino no tendrá fin. Creo en el Espíritu Santo, Señor y dador de vida, que procede del Padre y del Hijo, que con el Padre y el Hijo recibe una misma adoración y gloria, y que habló por los profetas. Creo en la Iglesia, que es una, santa, católica y apostólica. Confieso que hay un solo Bautismo para el perdón de los pecados. Espero la resurrección de los muertos y la vida del mundo futuro. <strong>Amén.</strong>
  </div>
</div>

<div style="margin-bottom:24px">
  <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#C9923A;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Consagración</div>
  <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">
    <strong>ESTO ES MI CUERPO, QUE SERÁ ENTREGADO POR VOSOTROS.</strong><br><br>
    <strong>ESTE ES EL CÁLIZ DE MI SANGRE, SANGRE DE LA ALIANZA NUEVA Y ETERNA, QUE SERÁ DERRAMADA POR VOSOTROS Y POR TODOS LOS HOMBRES PARA EL PERDÓN DE LOS PECADOS. HACED ESTO EN CONMEMORACIÓN MÍA.</strong><br><br>
    <strong>Pueblo: Anunciamos tu muerte, proclamamos tu resurrección. ¡Ven, Señor Jesús!</strong>
  </div>
</div>

<div style="margin-bottom:24px">
  <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#5C3D1E;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Padrenuestro y Comunión</div>
  <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">
    Padre nuestro, que estás en el cielo, santificado sea tu Nombre; venga a nosotros tu reino; hágase tu voluntad en la tierra como en el cielo. Danos hoy nuestro pan de cada día; perdona nuestras ofensas, como también nosotros perdonamos a los que nos ofenden; no nos dejes caer en la tentación, y líbranos del mal.<br><br>
    <strong>Cordero de Dios</strong>, que quitas el pecado del mundo, ten piedad de nosotros. (×2) ...danos la paz.<br><br>
    <strong>Pueblo:</strong> Señor, no soy digno de que entres en mi casa, pero una palabra tuya bastará para sanarme.
  </div>
</div>

<div style="margin-bottom:24px">
  <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8B1A1A;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Bendición y despedida</div>
  <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">
    <strong>Sacerdote:</strong> La bendición de Dios todopoderoso, Padre, Hijo ✞ y Espíritu Santo, descienda sobre vosotros.<br>
    <strong>Pueblo: Amén.</strong><br><br>
    <strong>Sacerdote:</strong> Podéis ir en paz.<br>
    <strong>Pueblo: Demos gracias a Dios.</strong>
  </div>
</div>`;
}

// ── Modal de citas ──
async function openCitaModal(tipo, ref) {
  let modal = document.getElementById('cita-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cita-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:flex-end;justify-content:center';
    modal.innerHTML = `
      <div id="cita-box" style="background:var(--bg);width:100%;max-width:600px;max-height:80vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -4px 30px rgba(0,0,0,.15)">
        <div style="width:36px;height:4px;background:var(--border2);border-radius:2px;margin:10px auto 0;flex-shrink:0"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px;border-bottom:1px solid var(--border);flex-shrink:0">
          <div id="cita-title" style="font-family:'Playfair Display',serif;font-size:15px;font-weight:600;color:var(--brown)"></div>
          <button onclick="closeCitaModal()" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:transparent;cursor:pointer;font-size:13px;color:var(--ink4)">✕</button>
        </div>
        <div id="cita-body" style="flex:1;overflow-y:auto;padding:16px 18px;-webkit-overflow-scrolling:touch"></div>
        <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0">
          <a id="cita-ext" href="#" target="_blank" style="flex:1;padding:9px;background:var(--bg3);color:var(--brown);border:1px solid var(--border2);border-radius:8px;font-family:'Lora',serif;font-size:13px;text-decoration:none;text-align:center">Ver fuente ↗</a>
          <button onclick="closeCitaModal()" style="padding:9px 18px;background:var(--brown);color:#fff;border:none;border-radius:8px;font-family:'Lora',serif;font-size:13px;cursor:pointer">Cerrar</button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeCitaModal(); });
    document.body.appendChild(modal);
  }

  const titleEl = document.getElementById('cita-title');
  const bodyEl = document.getElementById('cita-body');
  const extEl = document.getElementById('cita-ext');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  if (window.innerWidth >= 640) {
    document.getElementById('cita-box').style.cssText += ';border-radius:14px;max-width:560px';
    modal.style.alignItems = 'center';
  }

  if (tipo === 'cic') {
    titleEl.textContent = `Catecismo — CIC ${ref}`;
    const n = parseInt(ref);
    let page = 'index_sp.html';
    if (n <= 141) page = 'p1s1c2_sp.html';
    else if (n <= 421) page = 'p1s2_sp.html';
    else if (n <= 682) page = 'p1s2c5_sp.html';
    else if (n <= 975) page = 'p1s2c7_sp.html';
    else if (n <= 1690) page = 'p2s2_sp.html';
    else if (n <= 1876) page = 'p3s1_sp.html';
    else if (n <= 2557) page = 'p3s2c1_sp.html';
    else page = 'p4_sp.html';
    extEl.href = `https://www.vatican.va/archive/catechism_sp/${page}`;
    extEl.textContent = 'Ver en Vatican.va ↗';
    bodyEl.innerHTML = `<div style="text-align:center;padding:20px;font-family:'Lora',serif;color:var(--ink4);font-style:italic">Buscando artículo...</div>`;
    try {
      const r = await fetch(`/api/cic/${ref}`);
      const d = await r.json();
      if (d.ok && d.texto) {
        bodyEl.innerHTML = `<div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ink4);margin-bottom:10px">CIC ${ref}${d.fuente==='dataset'?' · <span style="color:var(--green)">✓ Dataset</span>':''}</div>
          <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink)">${d.texto.split('\n').join('<br>')}</div>`;
      } else throw new Error();
    } catch(e) {
      bodyEl.innerHTML = `<p style="font-family:'Lora',serif;font-size:14px;color:var(--ink4);font-style:italic;text-align:center;padding:20px">Consulta el artículo ${ref} en Vatican.va</p>`;
    }

  } else if (tipo === 'biblia') {
    titleEl.textContent = ref;
    extEl.href = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(ref)}&version=LBLA`;
    extEl.textContent = 'Ver en BibleGateway ↗';
    bodyEl.innerHTML = `<div style="text-align:center;padding:20px;font-family:'Lora',serif;color:var(--ink4);font-style:italic">Buscando pasaje...</div>`;
    try {
      const r = await fetch(`/api/biblia?ref=${encodeURIComponent(ref)}`);
      const d = await r.json();
      if (d.ok && d.texto) {
        bodyEl.innerHTML = `<div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ink4);margin-bottom:10px">${ref}${d.fuente==='dataset'?' · <span style="color:var(--green)">✓ Dataset</span>':''}</div>
          <div style="font-family:'Playfair Display',serif;font-size:15px;line-height:2;color:var(--ink);font-style:italic">${d.texto.split('\n').join('<br>')}</div>`;
      } else throw new Error();
    } catch(e) {
      bodyEl.innerHTML = `<p style="font-family:'Lora',serif;font-size:14px;color:var(--ink4);font-style:italic;text-align:center;padding:20px">Consulta ${ref} en BibleGateway.com</p>`;
    }
  }
}

function closeCitaModal() {
  const modal = document.getElementById('cita-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

// ── Donar ──
function openDonate() {
  document.getElementById('donate-modal').style.display = 'flex';
}
function closeDonate() {
  document.getElementById('donate-modal').style.display = 'none';
}
function selectAmount(btn, amount) {
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('paypal-link').href = `https://www.paypal.com/paypalme/schoolmarketing/${amount}`;
}

// ── Exportar PDF ──
function exportPDF(btn) {
  const bubble = btn.closest('.bubble-bot');
  if (!bubble) return;
  const text = bubble.innerText;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CatolicosGPT</title>
    <style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#18100A;line-height:1.8}
    h1{color:#5C3D1E}h2,h3{color:#7A5230}</style></head>
    <body><h1>CatolicosGPT</h1><pre style="white-space:pre-wrap;font-family:Georgia,serif">${esc(text)}</pre>
    <script>window.print();window.close();</script></body></html>`);
  win.document.close();
}

function copyText(btn) {
  const bubble = btn.closest('.bubble-bot');
  if (!bubble) return;
  navigator.clipboard.writeText(bubble.innerText).then(() => {
    btn.textContent = '✓ Copiado';
    setTimeout(() => { btn.innerHTML = '📋 Copiar'; }, 2000);
  });
}

// Init
renderHistory();
