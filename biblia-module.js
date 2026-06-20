// ════════════════════════════════════════════════════════════════════════════
// BIBLIA MODULE — Búsqueda y renderizado de citas bíblicas
// Integración con chat y rutas web
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Cargar datos bíblicos (debe existir data/biblia.json con estructura)
function loadBiblia() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'biblia.json'), 'utf8'));
  } catch(e) {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'biblia.json'), 'utf8'));
    } catch(e2) {
      console.warn('[Biblia] No se pudo cargar data/biblia.json:', e2.message);
      return {};
    }
  }
}

const BIBLIA = loadBiblia();

// Normalizar nombre de libro: "San Mateo" → "Mateo", "Romanos" → "Romanos"
function normalizarLibro(nombre) {
  return (nombre || '')
    .toLowerCase()
    .replace(/^(san\s+|santo\s+|primera\s+|segunda\s+|tercera\s+|1\s+|2\s+|3\s+)/i, '')
    .replace(/[\W_]/g, '')
    .trim();
}

// Buscar libro en BIBLIA
function buscarLibro(nombre) {
  const n = normalizarLibro(nombre);
  
  // Búsqueda exacta
  const keys = Object.keys(BIBLIA);
  for (const libro of keys) {
    if (normalizarLibro(libro) === n) return libro;
  }
  
  // Búsqueda parcial (contiene)
  for (const libro of keys) {
    if (normalizarLibro(libro).includes(n) || n.includes(normalizarLibro(libro))) {
      return libro;
    }
  }
  
  return null;
}

// Parsear cita: "Mateo 5:1-5", "Jn 3:16", "Romanos 12", etc
function parsearCita(cita) {
  // Regex: "Libro Capítulo:Versículos" o "Libro Capítulo"
  const regex = /^([a-záéíóúñ\s]+?)\s+(\d+)(?::(\d+(?:-\d+)?|$))?/i;
  const match = cita.trim().match(regex);
  
  if (!match) return null;
  
  const [, nombreLibro, capitulo, versiculos] = match;
  const libro = buscarLibro(nombreLibro);
  
  if (!libro) return null;
  
  let verVer = null;
  let verHasta = null;
  
  if (versiculos) {
    const parts = versiculos.split('-');
    verVer = parseInt(parts[0], 10);
    verHasta = parseInt(parts[1] || parts[0], 10);
  }
  
  return { libro, capitulo: parseInt(capitulo, 10), verVer, verHasta, citaOriginal: cita };
}

// Obtener contenido de una cita
function obtenerCita(cita) {
  const parsed = parsearCita(cita);
  if (!parsed) return null;
  
  const { libro, capitulo, verVer, verHasta } = parsed;
  
  const bib = loadBiblia();
  if (!bib[libro]) return null;
  
  const cap = bib[libro][capitulo.toString()];
  if (!cap) return null;
  
  // Si no especifica versículos, devolver todo el capítulo
  if (!verVer) {
    return {
      libro,
      capitulo,
      tipo: 'capitulo_completo',
      versiculos: cap.versiculos || cap
    };
  }
  
  // Filtrar versículos
  const versiculosSeleccionados = {};
  for (let v = verVer; v <= verHasta; v++) {
    if (cap[v] || (cap.versiculos && cap.versiculos[v])) {
      versiculosSeleccionados[v] = cap[v] || cap.versiculos[v];
    }
  }
  
  return {
    libro,
    capitulo,
    tipo: 'versiculos',
    verVer,
    verHasta,
    versiculos: versiculosSeleccionados
  };
}

// Generar HTML de cita para chat/web
function renderizarCita(cita, esChat = false) {
  const contenido = obtenerCita(cita);
  if (!contenido) return `<p style="color:red">No se encontró: ${cita}</p>`;
  
  const { libro, capitulo, tipo, versiculos } = contenido;
  const titulo = `${libro} ${capitulo}`;
  
  if (esChat) {
    // Para chat: formato compacto
    let html = `<div style="background:rgba(188,138,54,.08);border-left:3px solid var(--gold);padding:12px;margin:12px 0;border-radius:4px">
      <strong style="color:var(--gold-deep)">${titulo}</strong><br>`;
    
    if (tipo === 'capitulo_completo') {
      // Mostrar primeros 5 versículos y botón "Ver más"
      const vers = Object.entries(versiculos).slice(0, 5);
      vers.forEach(([num, de]) => {
        html += `<p style="margin:4px 0"><sup>${num}</sup> <em>${de}</em></p>`;
      });
      
      if (Object.keys(versiculos).length > 5) {
        html += `<button onclick="document.querySelector('.chat-toggle')?.click()" style="background:var(--gold-deep);color:white;border:0;padding:6px 12px;border-radius:4px;font-size:12px;cursor:pointer;margin-top:8px">
          Ver todo el capítulo
        </button>`;
      }
    } else {
      // Versículos específicos
      Object.entries(versiculos).forEach(([num, de]) => {
        html += `<p style="margin:4px 0"><sup>${num}</sup> <em>${de}</em></p>`;
      });
    }
    
    html += `</div>`;
    return html;
  } else {
    // Para web: formato completo
    let html = `<div class="seo-card">
      <h2>${titulo}</h2>
      <div style="color:var(--ink-2);line-height:1.8">`;
    
    Object.entries(versiculos).forEach(([num, de]) => {
      html += `<p><sup style="font-weight:600;color:var(--gold-deep)">${num}</sup> ${de}</p>`;
    });
    
    html += `</div></div>`;
    return html;
  }
}

// Sistema de prompts para chat: detectar solicitud de cita
function detectarSolicitudBiblica(texto) {
  const regex = /(?:cita|vers[íi]culo|cap[íi]tulo|leer|muestra|busca|encuentra|b[íi]blia)\s+(?:de\s+)?([1-3]?\s*[a-záéíóúñ\s]+?\s+\d+(?:[:,]?\d+(?:-\d+)?)?)/i;
  const match = texto.match(regex);
  if (match) return match[1].trim();
  return null;
}

// Prompt para el sistema del chat: instruir al IA a detectar citas
function crearSistemaBiblia() {
  return `
Cuando el usuario pida una cita bíblica (ej: "Muestra Mateo 5", "Versículo Jn 3:16", "Capítulo 5 de Romanos"):
1. Busca el pasaje en la Biblia disponible
2. Si es un capítulo completo, muestra los primeros 5 versículos y ofrece botón para ver todo
3. Si son versículos específicos, muéstralos todos
4. Siempre proporciona contexto teológico y pastoral sobre el pasaje
5. Pregunta si quiere análisis más profundo o reflexión meditativa

Formato: [CITA_BIBLICA]Mateo 5:1-7[/CITA_BIBLICA]
`;
}

module.exports = {
  loadBiblia,
  parsearCita,
  obtenerCita,
  renderizarCita,
  detectarSolicitudBiblica,
  crearSistemaBiblia,
  buscarLibro
};
