// ════════════════════════════════════════════════════════════════
// MISAS MODULE — Horarios de Misa por ubicación
// Estrategia combinada: horariosdemisa.com scraping + GPT-4o fallback
// ════════════════════════════════════════════════════════════════

// Helper: normalizar texto para búsqueda
function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Geocoding via Nominatim (OpenStreetMap, gratis, sin API key)
async function geocode(query) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=es`, {
      headers: { 'User-Agent': 'CatolicosGPT/1.0 (catolicosgpt.com)' },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data || !data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name
    };
  } catch(e) {
    console.warn('[Misas] geocode:', e.message);
    return null;
  }
}

// Reverse geocoding (lat,lon → ciudad)
async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`, {
      headers: { 'User-Agent': 'CatolicosGPT/1.0 (catolicosgpt.com)' },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const addr = data.address || {};
    return {
      ciudad: addr.city || addr.town || addr.village || addr.suburb || addr.county || '',
      barrio: addr.suburb || addr.neighbourhood || '',
      pais: addr.country || '',
      display_name: data.display_name || ''
    };
  } catch(e) {
    console.warn('[Misas] reverseGeocode:', e.message);
    return null;
  }
}

// Scraper: horariosdemisa.com
// Su estructura es /pais/ciudad-codigo
async function scrapeHorariosDeMisa(ciudad, pais = 'colombia') {
  try {
    const ciudadSlug = norm(ciudad).replace(/\s+/g, '-');
    const paisSlug = norm(pais).replace(/\s+/g, '-');
    const url = `https://horariosdemisa.com/${paisSlug}/${ciudadSlug}/`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 CatolicosGPT' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) {
      // Intentar búsqueda genérica
      const searchUrl = `https://horariosdemisa.com/?s=${encodeURIComponent(ciudad)}`;
      const r2 = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 CatolicosGPT' },
        signal: AbortSignal.timeout(8000)
      });
      if (!r2.ok) throw new Error('HTTP ' + r.status);
      const html2 = await r2.text();
      return { fuente: 'horariosdemisa.com', url: searchUrl, html_raw: html2.slice(0, 8000) };
    }
    const html = await r.text();
    return { fuente: 'horariosdemisa.com', url, html_raw: html.slice(0, 12000) };
  } catch(e) {
    console.warn('[Misas] scrapeHorariosDeMisa:', e.message);
    return null;
  }
}

// Búsqueda con GPT-4o (fallback inteligente cuando scraping falla)
async function searchMisasWithAI(query, ciudad, openai) {
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{
        role: 'system',
        content: 'Eres un asistente que ayuda a encontrar horarios de Misa en parroquias católicas de América Latina. Conoces las principales parroquias y sus horarios típicos.'
      }, {
        role: 'user',
        content: `El usuario busca horarios de Misa: "${query}"
${ciudad ? 'Ciudad detectada: ' + ciudad : ''}

Responde con horarios de Misa de parroquias católicas reconocidas en esa zona. Formato Markdown:

## Parroquias en [Ciudad]

### Nombre de la Parroquia
**Dirección:** ...
**Horarios:**
- Domingo: 7:00 AM, 9:00 AM, 11:00 AM, 6:00 PM
- Lunes a viernes: 7:00 AM, 6:00 PM
- Sábado: 8:00 AM, 6:00 PM (anticipada)
**Teléfono/Web:** (si lo conoces)

Si no estás seguro de los horarios exactos, **dilo explícitamente** y recomienda llamar a la parroquia. Es CRÍTICO no inventar horarios incorrectos. Cita 3-5 parroquias representativas.

Al final agrega:
> 💡 Para horarios actualizados, visita [horariosdemisa.com](https://horariosdemisa.com) o contacta directamente a la parroquia.`
      }]
    });
    return r.choices[0].message.content;
  } catch(e) {
    console.error('[Misas AI]', e.message);
    return null;
  }
}

module.exports = { geocode, reverseGeocode, scrapeHorariosDeMisa, searchMisasWithAI };
