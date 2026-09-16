'use strict';

/**
 * Adaptador oficial de Magisterium AI para CatólicosGPT.
 *
 * La API de Magisterium es compatible con Chat Completions de OpenAI, pero añade
 * `citations` y `related_questions`. Este módulo concentra el contrato externo
 * para que la aplicación nunca dependa de endpoints no documentados.
 *
 * Documentación verificada el 2026-09-16:
 * - https://www.magisterium.com/es/developers/docs/chat/making-first-request
 * - https://www.magisterium.com/es/developers/docs/chat/citations
 * - https://www.magisterium.com/es/developers/docs/search/making-first-request
 */

const DEFAULT_BASE_URL = 'https://www.magisterium.com/api/v1';
const DEFAULT_MODEL = 'magisterium-1';
const ALLOWED_ROLES = new Set(['user', 'assistant']);

class MagisteriumError extends Error {
  constructor(message, { status = 0, code = 'MAGISTERIUM_ERROR', retriable = false } = {}) {
    super(message);
    this.name = 'MagisteriumError';
    this.status = status;
    this.code = code;
    this.retriable = retriable;
  }
}

function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function getSettings() {
  const apiKey = String(process.env.MAGISTERIUM_API_KEY || '').trim();
  // Se admiten los nombres documentados en .env.example y los heredados para
  // que una instalación existente no deje de funcionar al actualizar.
  const baseUrl = String(process.env.MAGISTERIUM_API_BASE_URL || process.env.MAGISTERIUM_API_BASE || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return {
    apiKey,
    baseUrl: baseUrl || DEFAULT_BASE_URL,
    model: String(process.env.MAGISTERIUM_CHAT_MODEL || process.env.MAGISTERIUM_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    timeoutMs: positiveInt(process.env.MAGISTERIUM_TIMEOUT_MS, 45000, 120000),
    maxMessages: positiveInt(process.env.MAGISTERIUM_MAX_HISTORY_MESSAGES, 12, 30),
    maxInputChars: positiveInt(process.env.MAGISTERIUM_MAX_INPUT_CHARS, 18000, 60000)
  };
}

function isConfigured() {
  return Boolean(getSettings().apiKey);
}

function configuredModelLabel() {
  return getSettings().model;
}

function clampText(value, maxChars) {
  const text = String(value || '').replace(/\u0000/g, '').trim();
  if (!maxChars || text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

function modeInstruction(mode) {
  const common = `Eres el motor de conocimiento católico de CatólicosGPT. Responde en español claro, respetuoso y pastoral. Fundamenta toda afirmación doctrinal en las fuentes católicas disponibles y favorece las citas verificables que devuelve la API. No inventes documentos, citas, numerales, fechas, versículos ni atribuciones. Distingue con claridad entre doctrina de la Iglesia, interpretación teológica y sugerencias pastorales. Si la evidencia disponible no permite afirmar algo, dilo con honestidad.`;

  if (mode === 'study') {
    return `${common}\n\nEl usuario desea estudio profundo. Cuando sea pertinente, estructura la respuesta con: contexto del pasaje o cuestión, sentido literal, lectura en la Tradición y aplicación pastoral. Evita convertir conjeturas en doctrina.`;
  }
  if (mode === 'children') {
    return `${common}\n\nEl usuario desea una explicación para niños, familias o catequistas. Usa frases sencillas, ejemplos seguros y adecuados para la edad, y una breve actividad conversable. Conserva la precisión doctrinal y no infantilices asuntos delicados.`;
  }
  if (mode === 'magisterial') {
    return `${common}\n\nPrioriza explícitamente el Catecismo, la Escritura, concilios, documentos pontificios y derecho canónico cuando sean pertinentes. Da una respuesta sobria y orientada a fuentes.`;
  }
  return common;
}

/**
 * No aceptamos instrucciones `system` entregadas desde el navegador. De ese modo
 * la política doctrinal y de seguridad es controlada exclusivamente por el servidor.
 */
function sanitizeMessages(messages) {
  const settings = getSettings();
  const input = Array.isArray(messages) ? messages : [];
  // Rechaza system incluso si llega fuera de la ventana de historial: no se
  // debe convertir en un bypass silencioso del límite de mensajes.
  if (input.some(item => item && item.role === 'system')) {
    throw new MagisteriumError('Los mensajes system no pueden llegar desde el cliente.', { code: 'INVALID_MESSAGES' });
  }
  const accepted = [];

  for (const item of input.slice(-settings.maxMessages)) {
    if (!item || !ALLOWED_ROLES.has(item.role)) continue;
    const content = clampText(item.content, settings.maxInputChars);
    if (!content) continue;
    accepted.push({ role: item.role, content });
  }

  let remaining = settings.maxInputChars;
  const bounded = [];
  for (let i = accepted.length - 1; i >= 0; i -= 1) {
    const message = accepted[i];
    if (remaining <= 0) break;
    const content = clampText(message.content, remaining);
    if (content) {
      bounded.unshift({ role: message.role, content });
      remaining -= content.length;
    }
  }

  if (!bounded.some(message => message.role === 'user') || bounded[bounded.length - 1]?.role !== 'user') {
    throw new MagisteriumError('Hace falta una pregunta válida del usuario al final del historial.', { code: 'INVALID_MESSAGES' });
  }
  return bounded;
}

function normalizeMessages(messages, mode = 'auto') {
  return [
    // Esta instrucción procede exclusivamente del servidor, nunca del navegador.
    { role: 'system', content: modeInstruction(mode) },
    ...sanitizeMessages(messages)
  ];
}

function buildAbortSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function classifyHttpError(status, details = '') {
  if (status === 401) return new MagisteriumError('La clave de Magisterium no fue aceptada.', { status, code: 'MAGISTERIUM_UNAUTHORIZED' });
  if (status === 402) return new MagisteriumError('La cuenta de Magisterium alcanzó su límite de uso.', { status, code: 'MAGISTERIUM_BILLING' });
  if (status === 429) return new MagisteriumError('Magisterium está recibiendo demasiadas solicitudes. Intenta de nuevo en un momento.', { status, code: 'MAGISTERIUM_RATE_LIMIT', retriable: true });
  if (status >= 500) return new MagisteriumError('Magisterium no está disponible temporalmente.', { status, code: 'MAGISTERIUM_UNAVAILABLE', retriable: true });
  return new MagisteriumError(details || 'La solicitud a Magisterium no pudo completarse.', { status, code: 'MAGISTERIUM_REQUEST_FAILED', retriable: status >= 500 });
}

async function requestJson(endpoint, body, settings = getSettings()) {
  if (!settings.apiKey) {
    throw new MagisteriumError('MAGISTERIUM_API_KEY no está configurada.', { code: 'MAGISTERIUM_NOT_CONFIGURED' });
  }

  let response;
  try {
    response = await fetch(`${settings.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: buildAbortSignal(settings.timeoutMs)
    });
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new MagisteriumError(
      timedOut ? 'La consulta a Magisterium tardó demasiado.' : 'No se pudo conectar con Magisterium.',
      { code: timedOut ? 'MAGISTERIUM_TIMEOUT' : 'MAGISTERIUM_NETWORK', retriable: true }
    );
  }

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || '';
    throw classifyHttpError(response.status, message);
  }
  return data;
}

function normalizeCitation(citation, index) {
  const raw = citation || {};
  const citedText = String(raw.cited_text ?? raw.citedText ?? raw.text ?? '').trim();
  const citedTextHeading = raw.cited_text_heading ?? raw.citedTextHeading ?? raw.heading ?? null;
  const documentTitle = String(raw.document_title ?? raw.documentTitle ?? raw.title ?? 'Fuente católica').trim();
  const documentAuthor = raw.document_author ?? raw.documentAuthor ?? raw.author ?? null;
  const documentYear = raw.document_year ?? raw.documentYear ?? raw.year ?? null;
  const documentReference = raw.document_reference ?? raw.documentReference ?? raw.reference ?? null;
  const sourceUrl = raw.source_url ?? raw.sourceUrl ?? raw.url ?? null;
  return {
    id: String(raw.document_index ?? raw.documentIndex ?? index),
    // Nombres neutrales consumidos por la interfaz y los clientes API.
    title: documentTitle,
    author: documentAuthor,
    year: documentYear,
    reference: documentReference,
    quote: citedText,
    source_url: sourceUrl,
    // Nombres originales preservados para quien necesite la semántica de la API.
    citedText,
    citedTextHeading,
    documentTitle,
    documentAuthor,
    documentYear,
    documentReference,
    sourceUrl
  };
}

function normalizeCitations(citations) {
  if (!Array.isArray(citations)) return [];
  const seen = new Set();
  return citations
    .map(normalizeCitation)
    .filter(citation => {
      const fingerprint = `${citation.documentTitle}|${citation.documentReference || ''}|${citation.citedText.slice(0, 90)}`;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return Boolean(citation.documentTitle || citation.citedText);
    })
    .slice(0, 8);
}

function normalizeRelatedQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const seen = new Set();
  return questions
    .map(question => clampText(question, 240))
    .filter(question => {
      const normalized = question.toLocaleLowerCase('es');
      if (!question || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 4);
}

function extractAnswer(data) {
  return String(
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.response ??
    data?.content ??
    ''
  ).trim();
}

function chatRequestBody(messages, mode, stream) {
  return {
    model: getSettings().model,
    messages: normalizeMessages(messages, mode),
    stream: Boolean(stream),
    return_related_questions: true,
    safety_settings: {
      CATEGORY_NON_CATHOLIC: {
        threshold: 'BLOCK_ALL',
        response: true
      }
    }
  };
}

async function completeChat({ messages, mode = 'auto' } = {}) {
  const data = await requestJson('/chat/completions', chatRequestBody(messages, mode, false));
  const answer = extractAnswer(data);
  if (!answer) {
    throw new MagisteriumError('Magisterium no devolvió texto para esta consulta.', { code: 'MAGISTERIUM_EMPTY_RESPONSE', retriable: true });
  }
  return {
    answer,
    citations: normalizeCitations(data.citations),
    relatedQuestions: normalizeRelatedQuestions(data.related_questions ?? data.relatedQuestions),
    finishReason: data?.choices?.[0]?.finish_reason || null,
    model: data.model || getSettings().model
  };
}

function eventDataFromBlock(block) {
  return String(block || '')
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .join('\n')
    .trim();
}

function deltaFromChunk(chunk) {
  const delta = chunk?.choices?.[0]?.delta;
  if (typeof delta?.content === 'string') return delta.content;
  if (typeof chunk?.choices?.[0]?.text === 'string') return chunk.choices[0].text;
  return '';
}

/**
 * Traduce el SSE nativo de Magisterium a callbacks neutrales para nuestra ruta.
 * Las citas y preguntas relacionadas sólo llegan en el fragmento final según sus docs.
 */
async function streamChat({ messages, mode = 'auto', onDelta } = {}) {
  const settings = getSettings();
  if (!settings.apiKey) {
    throw new MagisteriumError('MAGISTERIUM_API_KEY no está configurada.', { code: 'MAGISTERIUM_NOT_CONFIGURED' });
  }

  let response;
  try {
    response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(chatRequestBody(messages, mode, true)),
      signal: buildAbortSignal(settings.timeoutMs)
    });
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new MagisteriumError(
      timedOut ? 'La consulta a Magisterium tardó demasiado.' : 'No se pudo conectar con Magisterium.',
      { code: timedOut ? 'MAGISTERIUM_TIMEOUT' : 'MAGISTERIUM_NETWORK', retriable: true }
    );
  }

  if (!response.ok) {
    let details = '';
    try {
      const body = await response.json();
      details = body?.error?.message || body?.message || '';
    } catch (_) {}
    throw classifyHttpError(response.status, details);
  }
  if (!response.body) {
    throw new MagisteriumError('Magisterium no habilitó el flujo de respuesta.', { code: 'MAGISTERIUM_NO_STREAM', retriable: true });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let citations = [];
  let relatedQuestions = [];
  let finishReason = null;

  const processBlock = block => {
    const raw = eventDataFromBlock(block);
    if (!raw || raw === '[DONE]') return;
    let chunk;
    try { chunk = JSON.parse(raw); } catch (_) { return; }
    const delta = deltaFromChunk(chunk);
    if (delta) {
      answer += delta;
      if (typeof onDelta === 'function') onDelta(delta);
    }
    if (Array.isArray(chunk.citations)) citations = normalizeCitations(chunk.citations);
    if (Array.isArray(chunk.related_questions) || Array.isArray(chunk.relatedQuestions)) {
      relatedQuestions = normalizeRelatedQuestions(chunk.related_questions ?? chunk.relatedQuestions);
    }
    if (chunk?.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    blocks.forEach(processBlock);
  }
  if (buffer.trim()) processBlock(buffer);

  if (!answer.trim()) {
    throw new MagisteriumError('Magisterium no devolvió texto para esta consulta.', { code: 'MAGISTERIUM_EMPTY_RESPONSE', retriable: true });
  }
  return { answer: answer.trim(), citations, relatedQuestions, finishReason, model: settings.model };
}

function normalizeSearchResult(item, index) {
  const raw = item || {};
  const text = raw.text ?? raw.content ?? raw.excerpt ?? raw.cited_text ?? '';
  const sourceUrl = raw.source_url ?? raw.sourceUrl ?? raw.url ?? null;
  return {
    id: String(raw.id ?? raw.document_id ?? raw.documentId ?? index),
    title: String(raw.title ?? raw.document_title ?? raw.documentTitle ?? 'Documento católico').trim(),
    author: raw.author ?? raw.document_author ?? raw.documentAuthor ?? null,
    year: raw.year ?? raw.document_year ?? raw.documentYear ?? null,
    reference: raw.reference ?? raw.document_reference ?? raw.documentReference ?? null,
    excerpt: clampText(text, 700),
    source_url: sourceUrl,
    // Alias camelCase para consumidores ya existentes del adaptador.
    sourceUrl
  };
}

async function search({ query, numResults = 8, category = 'auto' } = {}) {
  const cleanQuery = clampText(query, 1024);
  if (!cleanQuery) throw new MagisteriumError('Indica una consulta para buscar fuentes.', { code: 'MAGISTERIUM_EMPTY_QUERY' });
  const validCategory = ['auto', 'magisterial', 'scholarly'].includes(category) ? category : 'auto';
  const data = await requestJson('/search', {
    query: cleanQuery,
    numResults: positiveInt(numResults, 8, 20),
    category: validCategory
  });
  const payload = data?.data ?? data;
  const candidates = Array.isArray(payload)
    ? payload
    : (payload?.results ?? payload?.documents ?? payload?.items ?? []);
  return {
    query: cleanQuery,
    results: (Array.isArray(candidates) ? candidates : []).map(normalizeSearchResult).filter(item => item.title || item.excerpt),
    category: validCategory
  };
}

function publicError(error) {
  if (!(error instanceof MagisteriumError)) {
    return { code: 'AGENT_UNEXPECTED_ERROR', message: 'No se pudo completar la consulta en este momento.', retriable: true };
  }
  const messages = {
    MAGISTERIUM_NOT_CONFIGURED: 'La consulta con fuentes Magisterium todavía no está configurada en este entorno.',
    MAGISTERIUM_UNAUTHORIZED: 'No fue posible autenticar la conexión con las fuentes Magisterium.',
    MAGISTERIUM_BILLING: 'La conexión de fuentes alcanzó su límite de uso. Intenta más tarde.',
    MAGISTERIUM_RATE_LIMIT: 'Hay muchas consultas simultáneas. Intenta de nuevo en unos segundos.',
    MAGISTERIUM_TIMEOUT: 'La consulta de fuentes tardó demasiado. Intenta de nuevo.',
    MAGISTERIUM_NETWORK: 'No fue posible conectar con las fuentes en este momento.',
    MAGISTERIUM_UNAVAILABLE: 'Las fuentes Magisterium no están disponibles temporalmente.',
    MAGISTERIUM_EMPTY_QUERY: 'Escribe una consulta para continuar.',
    INVALID_MESSAGES: 'Escribe una pregunta válida para continuar.'
  };
  return {
    code: error.code,
    message: messages[error.code] || 'No se pudo completar la consulta de fuentes.',
    retriable: Boolean(error.retriable)
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  MagisteriumError,
  getSettings,
  isConfigured,
  configuredModelLabel,
  sanitizeMessages,
  normalizeMessages,
  normalizeCitations,
  normalizeRelatedQuestions,
  completeChat,
  streamChat,
  search,
  publicError
};
