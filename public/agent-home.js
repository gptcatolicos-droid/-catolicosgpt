(() => {
  'use strict';

  const STORAGE_KEY = 'catolicosgpt-agent-history-v1';
  const MAX_HISTORY = 10;
  const MAX_QUERY_CHARS = 4000;
  const dom = {
    stream: document.getElementById('agent-stream'),
    welcome: document.getElementById('agent-welcome'),
    messages: document.getElementById('agent-messages'),
    input: document.getElementById('agent-input'),
    form: document.getElementById('agent-form'),
    send: document.getElementById('agent-send'),
    stop: document.getElementById('agent-stop'),
    clear: document.getElementById('agent-clear'),
    status: document.getElementById('agent-provider-status'),
    statusText: document.getElementById('agent-provider-text'),
    modes: Array.from(document.querySelectorAll('[data-agent-mode]')),
    prompts: Array.from(document.querySelectorAll('[data-agent-prompt]'))
  };

  const state = {
    mode: 'auto',
    busy: false,
    controller: null,
    history: loadHistory()
  };

  function loadHistory() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-MAX_HISTORY)
        .map(item => ({ role: item.role, content: item.content.slice(0, 9000) }));
    } catch (_) {
      return [];
    }
  }

  function saveHistory() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.slice(-MAX_HISTORY))); } catch (_) { /* privacidad del navegador */ }
  }

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function inlineMarkdown(value) {
    let text = escapeHTML(value);
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return text;
  }

  function markdownToSafeHTML(value) {
    const lines = String(value || '').replace(/\r/g, '').split('\n');
    const html = [];
    let paragraph = [];
    let list = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (!list) return;
      html.push(`<${list.type}>${list.items.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</${list.type}>`);
      list = null;
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      const unordered = trimmed.match(/^[-*•]\s+(.+)$/);
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      const quote = trimmed.match(/^>\s?(.+)$/);
      if (!trimmed) { flushParagraph(); closeList(); return; }
      if (heading) {
        flushParagraph(); closeList();
        const level = Math.min(4, heading[1].length + 1);
        html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
        return;
      }
      if (quote) {
        flushParagraph(); closeList();
        html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
        return;
      }
      if (unordered || ordered) {
        flushParagraph();
        const type = unordered ? 'ul' : 'ol';
        if (list && list.type !== type) closeList();
        if (!list) list = { type, items: [] };
        list.items.push((unordered || ordered)[1]);
        return;
      }
      closeList();
      paragraph.push(trimmed);
    });
    flushParagraph();
    closeList();
    return html.join('') || '<p></p>';
  }

  function scrollToLatest() {
    requestAnimationFrame(() => { dom.stream.scrollTop = dom.stream.scrollHeight; });
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function setBusy(isBusy) {
    state.busy = Boolean(isBusy);
    dom.input.disabled = state.busy;
    dom.send.disabled = state.busy;
    dom.send.classList.toggle('is-hidden', state.busy);
    dom.stop.classList.toggle('is-visible', state.busy);
    dom.clear.disabled = state.busy;
    dom.modes.forEach(button => { button.disabled = state.busy; });
    if (!state.busy) dom.input.focus({ preventScroll: true });
  }

  function setProviderStatus(kind, text) {
    dom.status.dataset.status = kind || 'checking';
    dom.statusText.textContent = text || 'Comprobando fuentes…';
  }

  function createButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function appendCitations(container, citations) {
    if (!Array.isArray(citations) || !citations.length) return;
    const details = document.createElement('details');
    details.className = 'agent-citations';
    const summary = document.createElement('summary');
    summary.textContent = `${citations.length} fuente${citations.length === 1 ? '' : 's'} verificable${citations.length === 1 ? '' : 's'}`;
    details.appendChild(summary);
    const list = document.createElement('div');
    list.className = 'agent-citation-list';

    citations.slice(0, 12).forEach((citation, index) => {
      const item = document.createElement('article');
      item.className = 'agent-citation';
      const title = document.createElement('div');
      title.className = 'agent-citation-title';
      title.textContent = citation.title || citation.reference || `Fuente ${index + 1}`;
      item.appendChild(title);
      const meta = [citation.author, citation.year, citation.reference].filter(Boolean).join(' · ');
      if (meta) {
        const metaNode = document.createElement('div');
        metaNode.className = 'agent-citation-meta';
        metaNode.textContent = meta;
        item.appendChild(metaNode);
      }
      if (citation.quote || citation.excerpt) {
        const quote = document.createElement('div');
        quote.className = 'agent-citation-quote';
        quote.textContent = citation.quote || citation.excerpt;
        item.appendChild(quote);
      }
      const sourceUrl = safeExternalUrl(citation.source_url || citation.url);
      if (sourceUrl) {
        const link = document.createElement('a');
        link.href = sourceUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Abrir fuente ↗';
        item.appendChild(link);
      }
      list.appendChild(item);
    });
    details.appendChild(list);
    container.appendChild(details);
  }

  function appendRelated(container, questions) {
    if (!Array.isArray(questions) || !questions.length) return;
    const related = document.createElement('div');
    related.className = 'agent-related';
    const label = document.createElement('span');
    label.className = 'agent-related-label';
    label.textContent = 'También puedes preguntar';
    related.appendChild(label);
    questions.slice(0, 4).forEach(question => {
      const text = String(question || '').trim();
      if (text) related.appendChild(createButton(text, '', () => sendQuestion(text)));
    });
    if (related.childElementCount > 1) container.appendChild(related);
  }

  function addAssistantActions(container, plainText) {
    const actions = document.createElement('div');
    actions.className = 'agent-message-actions';
    actions.appendChild(createButton('Copiar respuesta', 'agent-action', async event => {
      const button = event.currentTarget;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(plainText);
        else {
          const area = document.createElement('textarea');
          area.value = plainText;
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          area.remove();
        }
        button.textContent = 'Copiada';
        setTimeout(() => { button.textContent = 'Copiar respuesta'; }, 1500);
      } catch (_) {
        button.textContent = 'No se pudo copiar';
        setTimeout(() => { button.textContent = 'Copiar respuesta'; }, 1800);
      }
    }));
    container.appendChild(actions);
  }

  function createMessage(role, content, metadata = {}) {
    const message = document.createElement('article');
    message.className = `agent-message ${role === 'user' ? 'user' : 'assistant'}`;
    if (role !== 'user') {
      const avatar = document.createElement('div');
      avatar.className = 'agent-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = '✦';
      message.appendChild(avatar);
    }
    const bubble = document.createElement('div');
    bubble.className = 'agent-bubble';
    if (role === 'user') {
      bubble.textContent = content;
    } else if (content) {
      bubble.innerHTML = markdownToSafeHTML(content);
      if (metadata.complete !== false) {
        addAssistantActions(bubble, content);
        appendCitations(bubble, metadata.citations);
        appendRelated(bubble, metadata.relatedQuestions);
      }
    } else {
      const thinking = document.createElement('span');
      thinking.className = 'agent-thinking';
      thinking.textContent = metadata.thinking || 'Consultando fuentes católicas…';
      bubble.appendChild(thinking);
    }
    message.appendChild(bubble);
    dom.messages.appendChild(message);
    dom.welcome.hidden = true;
    scrollToLatest();
    return { message, bubble };
  }

  function renderAssistant(target, content, metadata = {}) {
    target.bubble.innerHTML = markdownToSafeHTML(content || 'No se recibió contenido para mostrar.');
    addAssistantActions(target.bubble, content || '');
    appendCitations(target.bubble, metadata.citations);
    appendRelated(target.bubble, metadata.relatedQuestions);
    scrollToLatest();
  }

  function renderSourceResults(query, results, provider) {
    const section = document.createElement('section');
    section.className = 'agent-source-results';
    const top = document.createElement('div');
    top.className = 'agent-source-top';
    const heading = document.createElement('h2');
    heading.textContent = 'Fuentes para tu consulta';
    top.appendChild(heading);
    const count = document.createElement('span');
    count.textContent = `${results.length} resultado${results.length === 1 ? '' : 's'}${provider === 'local' ? ' · respaldo local' : ''}`;
    top.appendChild(count);
    section.appendChild(top);

    if (!results.length) {
      const empty = document.createElement('p');
      empty.className = 'agent-source-item';
      empty.textContent = 'No se encontraron fuentes con esa consulta. Prueba con una pregunta más concreta.';
      section.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'agent-source-list';
      results.forEach((result, index) => {
        const item = document.createElement('article');
        item.className = 'agent-source-item';
        const title = document.createElement('h3');
        title.textContent = result.title || result.reference || `Fuente ${index + 1}`;
        item.appendChild(title);
        const meta = [result.author, result.year, result.reference, result.category].filter(Boolean).join(' · ');
        if (meta) {
          const metaNode = document.createElement('p');
          metaNode.textContent = meta;
          item.appendChild(metaNode);
        }
        if (result.excerpt || result.quote) {
          const excerpt = document.createElement('p');
          excerpt.textContent = result.excerpt || result.quote;
          item.appendChild(excerpt);
        }
        const url = safeExternalUrl(result.source_url || result.url);
        if (url) {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Abrir fuente ↗';
          item.appendChild(link);
        }
        list.appendChild(item);
      });
      section.appendChild(list);
    }
    dom.messages.appendChild(section);
    dom.welcome.hidden = true;
    scrollToLatest();
  }

  function parseEventBlock(block) {
    const data = String(block || '').split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .join('\n');
    if (!data || data === '[DONE]') return null;
    try { return JSON.parse(data); } catch (_) { return null; }
  }

  async function readError(response) {
    try {
      const data = await response.json();
      return data?.error?.message || data?.message || 'No se pudo completar la consulta.';
    } catch (_) {
      return 'No se pudo completar la consulta.';
    }
  }

  async function streamChat(payload, target) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: state.controller.signal
    });
    if (!response.ok) throw new Error(await readError(response));
    if (!response.body) throw new Error('El navegador no pudo abrir el flujo de respuesta.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let metadata = { citations: [], relatedQuestions: [] };

    const consume = event => {
      if (!event) return;
      if (event.type === 'delta' && typeof event.delta === 'string') {
        answer += event.delta;
        target.bubble.innerHTML = markdownToSafeHTML(answer);
        scrollToLatest();
      }
      if (event.type === 'meta') {
        metadata = {
          citations: Array.isArray(event.citations) ? event.citations : metadata.citations,
          relatedQuestions: Array.isArray(event.related_questions) ? event.related_questions : metadata.relatedQuestions,
          provider: event.provider || metadata.provider,
          presentation: event.presentation || metadata.presentation
        };
      }
      if (event.type === 'error') throw new Error(event.error?.message || 'La consulta no pudo completarse.');
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() || '';
      chunks.forEach(chunk => consume(parseEventBlock(chunk)));
    }
    if (buffer.trim()) consume(parseEventBlock(buffer));
    if (!answer.trim()) throw new Error('No se recibió una respuesta escrita.');
    return { answer: answer.trim(), metadata };
  }

  async function searchSources(query) {
    const target = createMessage('assistant', '', { thinking: 'Buscando fuentes estructuradas…' });
    try {
      const response = await fetch('/api/magisterium/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, category: state.mode === 'study' ? 'magisterial' : 'auto', numResults: 6 }),
        signal: state.controller.signal
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      target.message.remove();
      renderSourceResults(query, Array.isArray(data.results) ? data.results : [], data.provider);
      if (data.provider === 'local') setProviderStatus('local', 'Respaldo local con fuentes identificadas');
    } catch (error) {
      if (error.name === 'AbortError') target.message.remove();
      else renderAssistant(target, `No pude completar la búsqueda de fuentes. ${error.message || ''}`.trim(), { citations: [] });
    }
  }

  async function sendQuestion(rawQuestion) {
    const question = String(rawQuestion || '').trim().slice(0, MAX_QUERY_CHARS);
    if (!question || state.busy) return;
    dom.input.value = '';
    resizeInput();
    setBusy(true);
    state.controller = new AbortController();

    if (state.mode === 'sources') {
      try { await searchSources(question); }
      finally { state.controller = null; setBusy(false); }
      return;
    }

    createMessage('user', question);
    const target = createMessage('assistant', '', { thinking: 'Consultando Magisterium y preparando una respuesta con fuentes…' });
    const requestMessages = [...state.history, { role: 'user', content: question }].slice(-MAX_HISTORY);

    try {
      const result = await streamChat({ messages: requestMessages, mode: state.mode }, target);
      renderAssistant(target, result.answer, result.metadata);
      state.history = [...requestMessages, { role: 'assistant', content: result.answer }].slice(-MAX_HISTORY);
      saveHistory();
      if (result.metadata.provider === 'local') setProviderStatus('local', 'Respaldo local · fuentes identificadas');
      else setProviderStatus('ready', result.metadata.presentation === 'openai' ? 'Magisterium + edición conversacional' : 'Fuentes Magisterium verificables');
    } catch (error) {
      if (error.name === 'AbortError') {
        target.message.remove();
      } else {
        renderAssistant(target, `No pude completar esta respuesta. ${error.message || 'Inténtalo de nuevo en unos instantes.'}`.trim(), { citations: [] });
      }
    } finally {
      state.controller = null;
      setBusy(false);
    }
  }

  function resizeInput() {
    dom.input.style.height = 'auto';
    dom.input.style.height = `${Math.min(dom.input.scrollHeight, 130)}px`;
  }

  function selectMode(mode) {
    state.mode = ['auto', 'study', 'children', 'sources'].includes(mode) ? mode : 'auto';
    dom.modes.forEach(button => {
      const selected = button.dataset.agentMode === state.mode;
      button.setAttribute('aria-pressed', String(selected));
    });
    const placeholders = {
      auto: 'Pregunta sobre fe, Biblia, liturgia o vida cristiana…',
      study: 'Formula una pregunta para estudiar con precisión…',
      children: '¿Qué quieres explicar a niños o en catequesis?',
      sources: 'Escribe un tema para buscar en las fuentes…'
    };
    dom.input.placeholder = placeholders[state.mode];
    dom.input.setAttribute('aria-label', state.mode === 'sources' ? 'Tema para buscar fuentes' : 'Tu pregunta para CatólicosGPT');
  }

  async function refreshStatus() {
    try {
      const response = await fetch('/api/agent/status', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('status');
      const data = await response.json();
      if (data.magisterium?.configured) {
        setProviderStatus('ready', data.openai?.configured ? 'Magisterium configurado + edición conversacional' : 'Magisterium configurado');
      } else if (data.localFallback?.available) {
        setProviderStatus('local', 'Modo de respaldo con fuentes identificadas');
      } else {
        setProviderStatus('checking', 'Fuentes configurándose');
      }
    } catch (_) {
      setProviderStatus('checking', 'Comprobando disponibilidad');
    }
  }

  dom.form.addEventListener('submit', event => {
    event.preventDefault();
    sendQuestion(dom.input.value);
  });
  dom.input.addEventListener('input', resizeInput);
  dom.input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!event.isComposing) dom.form.requestSubmit();
    }
  });
  dom.stop.addEventListener('click', () => state.controller?.abort());
  dom.clear.addEventListener('click', () => {
    if (state.busy) return;
    state.history = [];
    saveHistory();
    dom.messages.replaceChildren();
    dom.welcome.hidden = false;
    dom.input.focus({ preventScroll: true });
    scrollToLatest();
  });
  dom.modes.forEach(button => button.addEventListener('click', () => selectMode(button.dataset.agentMode)));
  dom.prompts.forEach(button => button.addEventListener('click', () => sendQuestion(button.dataset.agentPrompt)));

  if (state.history.length) {
    dom.welcome.hidden = true;
    state.history.forEach(item => createMessage(item.role, item.content, { complete: item.role === 'assistant' }));
  }
  selectMode('auto');
  resizeInput();
  refreshStatus();

  // Conserva los accesos históricos del menú (/?query=laudes, vísperas,
  // completas) y permite enlazar una consulta concreta desde una guía.
  const urlQuery = new URLSearchParams(window.location.search).get('query');
  if (urlQuery) {
    const shortcuts = {
      'oracion-del-dia': 'Por favor, ayúdame a rezar con una oración para hoy y muestra las fuentes disponibles.',
      laudes: 'Deseo rezar Laudes. Indícame fuentes litúrgicas disponibles para el día de hoy.',
      visperas: 'Deseo rezar Vísperas. Indícame fuentes litúrgicas disponibles para el día de hoy.',
      completas: 'Deseo rezar Completas. Indícame fuentes litúrgicas disponibles para el día de hoy.'
    };
    const question = shortcuts[urlQuery] || urlQuery;
    if (question.trim() && question.length <= MAX_QUERY_CHARS) {
      window.setTimeout(() => sendQuestion(question), 0);
    }
  }
})();
