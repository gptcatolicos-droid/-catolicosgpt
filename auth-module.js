// ══════════════════════════════════════════════════════════════════
// CATOLICOSGPT v4.1 — MÓDULO DE AUTENTICACIÓN
// JWT + bcrypt + límites configurables por admin
// ══════════════════════════════════════════════════════════════════

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const USERS_PATH    = path.join(__dirname, 'data', 'users.json');
const COUPONS_PATH  = path.join(__dirname, 'data', 'coupons.json');
const CONFIG_PATH   = path.join(__dirname, 'data', 'plan-config.json');
const JWT_SECRET    = process.env.JWT_SECRET || 'cgpt-jwt-secret-2026-change-in-production';

// ── Loaders ──
function loadUsers()   { try { return JSON.parse(fs.readFileSync(USERS_PATH,'utf-8'));  } catch(e) { return { users: [] }; } }
function saveUsers(d)  { fs.writeFileSync(USERS_PATH,  JSON.stringify(d,null,2),'utf-8'); }
function loadCoupons() { try { return JSON.parse(fs.readFileSync(COUPONS_PATH,'utf-8')); } catch(e) { return { coupons: [] }; } }
function saveCoupons(d){ fs.writeFileSync(COUPONS_PATH, JSON.stringify(d,null,2),'utf-8'); }

function loadPlanConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH,'utf-8')); }
  catch(e) { return { planes: { free:{infografiasCount:1,periodo:'daily'}, premium:{infografiasCount:-1,periodo:'unlimited'}, admin:{infografiasCount:-1,periodo:'unlimited'} } }; }
}
function savePlanConfig(d) {
  d.updatedAt = new Date().toISOString();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(d,null,2),'utf-8');
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
  const user   = getUserById(userId);
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
  const user   = getUserById(userId);
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
  const user = {
    id: `u-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    email: email.toLowerCase(),
    passwordHash,
    nombre: nombre.trim(),
    plan: 'free',
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
  const user = getUserByEmail(email);
  if (!user) throw new Error('Email o contraseña incorrectos');
  if (!user.activo) throw new Error('Cuenta suspendida. Contacta al administrador.');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Email o contraseña incorrectos');
  const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });
  const { passwordHash: _, ...safe } = user;
  return { user: safe, token };
}

// ── MIDDLEWARE ──
function authenticateToken(req, res, next) {
  const auth  = req.headers['authorization'];
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
