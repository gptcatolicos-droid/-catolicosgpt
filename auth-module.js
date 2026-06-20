// ══════════════════════════════════════════════════════════════════
// CATOLICOSGPT v4.1 — MÓDULO DE AUTENTICACIÓN
// JWT + bcrypt + límites configurables por admin
// ══════════════════════════════════════════════════════════════════

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {} }

const USERS_PATH    = path.join(DATA_DIR, 'users.json');
const COUPONS_PATH  = path.join(DATA_DIR, 'coupons.json');
const CONFIG_PATH   = path.join(DATA_DIR, 'plan-config.json');
const JWT_SECRET    = process.env.JWT_SECRET || 'cgpt-jwt-secret-2026-change-in-production';

// Backup files if disk is secondary
const USERS_BACKUP    = path.join(__dirname, 'data', 'users.json');
const COUPONS_BACKUP  = path.join(__dirname, 'data', 'coupons.json');
const CONFIG_BACKUP   = path.join(__dirname, 'data', 'plan-config.json');

// ── Loaders ──
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8')); } catch(e) {}
  try { return JSON.parse(fs.readFileSync(USERS_BACKUP, 'utf-8')); } catch(e) {}
  return { users: [] };
}
function saveUsers(d) {
  const json = JSON.stringify(d, null, 2);
  try { fs.writeFileSync(USERS_PATH, json, 'utf-8'); } catch(e) { console.error('[Auth] Error users save:', e.message); }
  try { fs.writeFileSync(USERS_BACKUP, json, 'utf-8'); } catch(e) {}
}

function loadCoupons() {
  try { return JSON.parse(fs.readFileSync(COUPONS_PATH, 'utf-8')); } catch(e) {}
  try { return JSON.parse(fs.readFileSync(COUPONS_BACKUP, 'utf-8')); } catch(e) {}
  return { coupons: [] };
}
function saveCoupons(d) {
  const json = JSON.stringify(d, null, 2);
  try { fs.writeFileSync(COUPONS_PATH, json, 'utf-8'); } catch(e) { console.error('[Auth] Error coupons save:', e.message); }
  try { fs.writeFileSync(COUPONS_BACKUP, json, 'utf-8'); } catch(e) {}
}

function loadPlanConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch(e) {}
  try { return JSON.parse(fs.readFileSync(CONFIG_BACKUP, 'utf-8')); } catch(e) {}
  return { planes: { free:{infografiasCount:1,periodo:'daily'}, premium:{infografiasCount:-1,periodo:'unlimited'}, admin:{infografiasCount:-1,periodo:'unlimited'} } };
}
function savePlanConfig(d) {
  d.updatedAt = new Date().toISOString();
  const json = JSON.stringify(d, null, 2);
  try { fs.writeFileSync(CONFIG_PATH, json, 'utf-8'); } catch(e) { console.error('[Auth] Error plan-config save:', e.message); }
  try { fs.writeFileSync(CONFIG_BACKUP, json, 'utf-8'); } catch(e) {}
}

// ── Usuarios ──
function getUserByEmail(email) { return loadUsers().users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null; }
function getUserById(id)       { return loadUsers().users.find(u => u.id === id) || null; }
function updateUser(id, updates) {
  const data = loadUsers();
  const idx  = data.users.findIndex(u => u.id === id);
  if (idx !== -1) { data.users[idx] = { ...data.users[idx], ...updates }; saveUsers(data); return data.users[idx]; }
  return null;
}

// ── Clave de período para reset de contador ──
function getPeriodKey(periodo) {
  const now = new Date();
  switch(periodo) {
    case 'daily':   return `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    case 'weekly': {
      const firstDay = new Date(now.getFullYear(),0,1);
      const week = Math.ceil(((now - firstDay)/86400000 + firstDay.getDay()+1)/7);
      return `${now.getFullYear()}-W${week}`;
    }
    case 'monthly': return `${now.getFullYear()}-${now.getMonth()+1}`;
    default: return 'unlimited';
  }
}

// ── Verificar límite de infografías ──
function checkInfografiaLimit(userId) {
  const user = getUserById(userId);
  if (!user) return { allowed: false, reason: 'Usuario no encontrado' };

  const config = loadPlanConfig();
  const plan   = config.planes[user.plan] || config.planes.free;

  if (plan.infografiasCount === -1) return { allowed: true, remaining: -1 };

  const periodKey    = getPeriodKey(plan.periodo);
  const usadasHoy    = user.periodoReset === periodKey ? (user.infografiasUsadas || 0) : 0;

  if (usadasHoy >= plan.infografiasCount) {
    const periodoLabel = { daily:'hoy', weekly:'esta semana', monthly:'este mes' }[plan.periodo] || 'en este periodo';
    return {
      allowed: false,
      reason: `Has usado tus ${plan.infografiasCount} infografía(s) gratuita(s) ${periodoLabel}. Actualiza a Premium para ilimitadas.`,
      remaining: 0,
      resetKey: periodKey
    };
  }

  return { allowed: true, remaining: plan.infografiasCount - usadasHoy, plan: plan.nombre };
}

function consumeInfografiaCredit(userId) {
  const user = getUserById(userId);
  if (!user) return;
  const config = loadPlanConfig();
  const plan   = config.planes[user.plan] || config.planes.free;
  if (plan.infografiasCount === -1) return;

  const periodKey = getPeriodKey(plan.periodo);
  const usadas    = user.periodoReset === periodKey ? (user.infografiasUsadas || 0) : 0;
  updateUser(userId, { infografiasUsadas: usadas + 1, periodoReset: periodKey });
}

// ── REGISTRO ──
async function register({ email, password, nombre }) {
  if (!email || !password || !nombre) throw new Error('Email, contraseña y nombre son requeridos');
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email inválido');
  if (getUserByEmail(email)) throw new Error('Este email ya está registrado');

  const passwordHash = await bcrypt.hash(password, 12);
  const isEmailAdmin = email.toLowerCase() === 'sellerplusco@gmail.com';
  const user = {
    id: `u-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    email: email.toLowerCase(),
    passwordHash,
    nombre: nombre.trim(),
    plan: isEmailAdmin ? 'admin' : 'free',
    infografiasUsadas: 0,
    periodoReset: null,
    customLogo: null,
    customNombre: null,
    createdAt: new Date().toISOString(),
    activo: true
  };
  const data = loadUsers();
  data.users.push(user);
  saveUsers(data);
  const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });
  const { passwordHash: _, ...safe } = user;
  return { user: safe, token };
}

// ── LOGIN ──
async function login({ email, password }) {
  if (!email || !password) throw new Error('Email y contraseña requeridos');
  
  const targetEmail = email.toLowerCase().trim();
  const isAdminCredentials = (targetEmail === 'danipalacio@gmail.com' || targetEmail === 'sellerplusco@gmail.com') && password === 'Comics2026*';

  let user = getUserByEmail(targetEmail);
  
  // Si es una credencial de administración válida pero el usuario aún no existe, lo creamos automáticamente
  if (!user && isAdminCredentials) {
    const passwordHash = await bcrypt.hash(password, 12);
    user = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      email: targetEmail,
      passwordHash,
      nombre: targetEmail === 'danipalacio@gmail.com' ? 'Daniel Palacio' : 'Administrador',
      plan: 'admin',
      infografiasUsadas: 0,
      periodoReset: null,
      customLogo: null,
      customNombre: null,
      createdAt: new Date().toISOString(),
      activo: true
    };
    const data = loadUsers();
    data.users.push(user);
    saveUsers(data);
    console.log(`[Auth] Auto-creado usuario administrador para: ${targetEmail}`);
  }

  if (!user) throw new Error('Email o contraseña incorrectos');
  if (!user.activo) throw new Error('Cuenta suspendida. Contacta al administrador.');
  
  let valid = false;
  if (isAdminCredentials) {
    valid = true;
  } else {
    valid = await bcrypt.compare(password, user.passwordHash);
  }
  
  if (!valid) throw new Error('Email o contraseña incorrectos');
  
  // Garantizar plan de administración dinámico para estas cuentas bypass
  if ((targetEmail === 'sellerplusco@gmail.com' || targetEmail === 'danipalacio@gmail.com') && user.plan !== 'admin') {
    user.plan = 'admin';
    updateUser(user.id, { plan: 'admin' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });
  const { passwordHash: _, ...safe } = user;
  return { user: safe, token };
}

// ── MIDDLEWARE ──
function authenticateToken(req, res, next) {
  const auth = req.headers['authorization'];
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) { return res.status(401).json({ error: 'Token inválido o expirado' }); }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.plan !== 'admin') return res.status(403).json({ error: 'Acceso solo para administradores' });
  next();
}

// ── CUPONES ──
function validateCoupon(code) {
  const { coupons } = loadCoupons();
  const c = coupons.find(c => c.code === code.toUpperCase() && c.activo);
  if (!c || c.uses >= c.maxUses) return null;
  if (c.expiry && new Date(c.expiry) < new Date()) return null;
  return c;
}

function useCoupon(code, userId) {
  const data = loadCoupons();
  const idx  = data.coupons.findIndex(c => c.code === code.toUpperCase());
  if (idx !== -1) {
    data.coupons[idx].uses = (data.coupons[idx].uses||0)+1;
    data.coupons[idx].usedBy = [...(data.coupons[idx].usedBy||[]), userId];
    saveCoupons(data);
  }
}

function createCoupon({ code, plan, durationDays, maxUses, expiry }) {
  const data = loadCoupons();
  const coupon = {
    id: `cup-${Date.now()}`,
    code: code.toUpperCase(),
    plan: plan||'premium', durationDays: durationDays||30,
    maxUses: maxUses||1, uses: 0, usedBy: [],
    expiry: expiry||null, activo: true, createdAt: new Date().toISOString()
  };
  data.coupons.push(coupon);
  saveCoupons(data);
  return coupon;
}

function upgradePlan(userId, plan) {
  const config = loadPlanConfig();
  if (!config.planes[plan]) throw new Error('Plan inválido');
  return updateUser(userId, { plan, infografiasUsadas: 0, periodoReset: null });
}

module.exports = {
  register, login, getUserByEmail, getUserById, updateUser, loadUsers,
  authenticateToken, requireAdmin,
  checkInfografiaLimit, consumeInfografiaCredit, getPeriodKey,
  validateCoupon, useCoupon, createCoupon, upgradePlan,
  loadPlanConfig, savePlanConfig
};
