require('dotenv').config();
const fs = require('fs');
const path = require('path');

function mergePendingInfografias() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const livePath = path.join(dataDir, 'infografias-catalog.json');
  const repoCatalogPath = path.join(__dirname, 'data', 'infografias-catalog.json');
  const pendingPath = path.join(__dirname, 'data', 'infografias-pending.json');

  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    let catalog = { version: '5.0', total: 0, categorias: [], infografias: [] };
    if (fs.existsSync(livePath)) {
      try {
        const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));
        if (live && Array.isArray(live.infografias)) catalog = live;
      } catch (e) {
        console.error('[Bootstrap] No se pudo leer catálogo persistente:', e.message);
      }
    } else if (fs.existsSync(repoCatalogPath)) {
      try {
        const backup = JSON.parse(fs.readFileSync(repoCatalogPath, 'utf8'));
        if (backup && Array.isArray(backup.infografias)) catalog = backup;
      } catch (e) {
        console.error('[Bootstrap] No se pudo leer catálogo del repositorio:', e.message);
      }
    }

    if (!fs.existsSync(pendingPath)) return;
    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    const incoming = Array.isArray(pending.infografias) ? pending.infografias : [];
    if (!incoming.length) return;

    catalog.infografias = Array.isArray(catalog.infografias) ? catalog.infografias : [];
    const existingIds = new Set(catalog.infografias.map(i => i.id).filter(Boolean));
    const existingSlugs = new Set(catalog.infografias.map(i => i.slug).filter(Boolean));
    const missing = incoming.filter(i => !existingIds.has(i.id) && !existingSlugs.has(i.slug));

    if (!missing.length) {
      console.log('[Bootstrap] Infografías pendientes ya publicadas.');
      return;
    }

    catalog.infografias = [...missing, ...catalog.infografias];
    catalog.total = catalog.infografias.length;
    catalog.categorias = [...new Set(catalog.infografias.map(i => i.categoria || i.tipo).filter(Boolean))];
    catalog.version = String(catalog.version || '5.0');

    fs.writeFileSync(livePath, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`[Bootstrap] Publicadas ${missing.length} infografía(s) pendiente(s). Total: ${catalog.total}`);
  } catch (e) {
    console.error('[Bootstrap] Error integrando infografías pendientes:', e.message);
  }
}

mergePendingInfografias();
require('./server');
