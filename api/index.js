/**
 * ENORA LIVE AI CLASSROOM PRO - Vercel Serverless Backend API
 *
 * Platform: Vercel Serverless Functions (Node.js runtime)
 * Architecture: (req, res) standard Node.js HTTP handler
 * Security: PBKDF2-HMAC-SHA256 (100,000 iterations, 16-byte salt, constant-time verification)
 * Storage: Multi-tier persistence (priority order):
 *   1. Supabase PostgreSQL (SUPABASE_URL + SUPABASE_SERVICE_KEY) — preferred cloud DB
 *   2. Upstash Redis / Vercel KV (UPSTASH_REDIS_REST_URL + TOKEN) — fallback KV store
 *   3. /tmp writable filesystem cache — local fallback
 *   4. Bundled seed files (data/db.json and data/auth.json) — read-only seed
 *   5. Warm memory cache — in-process cache
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Auto-load .env in local development if environment variables are not pre-injected
if (!process.env.SUPABASE_URL) {
  try {
    const envPaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(__dirname, '../.env'),
      path.resolve(__dirname, '.env'),
    ];
    for (const ep of envPaths) {
      if (fs.existsSync(ep)) {
        const raw = fs.readFileSync(ep, 'utf8');
        raw.split(/\r?\n/).forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim();
            if (!process.env[k]) process.env[k] = v;
          }
        });
        break;
      }
    }
  } catch {}
}

// =========================================================================
// SUPABASE CLIENT (backend-only, service role key — never sent to client)
// =========================================================================
let _supabase = null;
let _supabaseKeyType = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
  const anonKey = process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const hasServiceKey = !!serviceKey;
  const key = serviceKey || anonKey;
  if (!url || !key) {
    console.warn('[Supabase] SUPABASE_URL or key not set — Supabase disabled, falling back to /tmp storage.');
    return null;
  }
  _supabaseKeyType = hasServiceKey ? 'service_role' : 'anon_INSECURE';
  if (!hasServiceKey) {
    console.warn('[Supabase] WARNING: SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY not set. Using anon key — backend DB operations will be DENIED by RLS. Set SUPABASE_SECRET_KEY in Vercel Environment Variables.');
  } else {
    console.log('[Supabase] Initializing with service_role / secret key ✓');
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'live-ai-classroom-backend' } }
    });
    console.log(`[Supabase] Client initialized (key type: ${_supabaseKeyType})`);
    return _supabase;
  } catch (e) {
    console.warn('[Supabase] Failed to initialize client:', e?.message);
    return null;
  }
}

async function supabaseGet(table, id = 'singleton') {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from(table).select('data').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null; // row not found
      console.warn(`[Supabase] GET ${table} error:`, error.message);
      return null;
    }
    return data?.data || null;
  } catch (e) {
    console.warn(`[Supabase] GET ${table} exception:`, e?.message);
    return null;
  }
}

async function supabaseSet(table, payload, id = 'singleton') {
  const sb = getSupabase();
  if (!sb) return false;
  const upsertObj = { id, data: payload, updated_at: new Date().toISOString() };
  if (table === 'app_state' && payload && payload.revision) {
    upsertObj.revision = Number(payload.revision) || 1;
  }

  // Attempt 1
  try {
    const { error } = await sb.from(table).upsert(upsertObj, { onConflict: 'id' });
    if (!error) return true;
    console.warn(`[Supabase] SET ${table} initial attempt error:`, error.message);
  } catch (e) {
    console.warn(`[Supabase] SET ${table} initial exception:`, e?.message);
  }

  // Retry once with a brief backoff (handles transient HTTP/2 socket drops & keep-alive reuse)
  try {
    await new Promise((r) => setTimeout(r, 500));
    const { error } = await sb.from(table).upsert(upsertObj, { onConflict: 'id' });
    if (!error) {
      console.log(`[Supabase] SET ${table} retry succeeded ✓`);
      return true;
    }
    console.warn(`[Supabase] SET ${table} retry error:`, error.message);
    return false;
  } catch (e) {
    console.warn(`[Supabase] SET ${table} retry exception:`, e?.message);
    return false;
  }
}

// Session management via Supabase (optional — falls back to in-memory)
async function supabaseGetSession(token) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('app_sessions')
      .select('*')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (error || !data) return null;
    return {
      token: data.token,
      role: data.role,
      userId: data.user_id,
      name: data.user_name,
      createdAt: data.created_at,
      expiresAt: data.expires_at
    };
  } catch { return null; }
}

async function supabaseCreateSession(role, userId, name, token) {
  const sb = getSupabase();
  if (!token) token = generateToken(); // fallback if not provided
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (sb) {
    try {
      await sb.from('app_sessions').insert({
        token, role, user_id: userId, user_name: name, expires_at: expiresAt
      });
    } catch (e) {
      console.warn('[Supabase] createSession error:', e?.message);
    }
  }
  return { token, role, userId, name, createdAt: new Date().toISOString(), expiresAt };
}

async function supabaseRemoveSession(token) {
  const sb = getSupabase();
  if (!sb) return;
  try { await sb.from('app_sessions').delete().eq('token', token); } catch {}
}

async function supabaseCleanupSessions() {
  const sb = getSupabase();
  if (!sb) return;
  try { await sb.from('app_sessions').delete().lt('expires_at', new Date().toISOString()); } catch {}
}

// =========================================================================
// CRYPTOGRAPHY: PBKDF2-HMAC-SHA256 (100,000 iterations, 16-byte salt)
// 100% compatible with local server.ps1 backend and existing data/auth.json
// =========================================================================
function hashPassword(password, saltBase64 = null, iterations = 100000) {
  const salt = saltBase64 ? Buffer.from(saltBase64, 'base64') : crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return {
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    iterations,
    algo: 'PBKDF2-SHA256'
  };
}

function verifyPassword(password, stored) {
  if (!password || !stored || !stored.salt || !stored.hash) return false;
  try {
    const salt = Buffer.from(stored.salt, 'base64');
    const expected = Buffer.from(stored.hash, 'base64');
    const iterations = stored.iterations || 100000;
    const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'live-ai-classroom-session-key-v2-2026';

function signSessionToken(sessionData) {
  const payload = {
    r: sessionData.role,
    u: sessionData.userId,
    n: sessionData.name,
    exp: sessionData.expiresAt,
    iat: sessionData.createdAt || new Date().toISOString(),
    rnd: crypto.randomBytes(8).toString('hex')
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `sess_${body}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  if (!token.startsWith('sess_')) return null;
  const parts = token.slice(5).split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && new Date(payload.exp) <= new Date()) return null;
    return {
      token,
      role: payload.r,
      userId: payload.u,
      name: payload.n,
      createdAt: payload.iat,
      expiresAt: payload.exp
    };
  } catch {
    return null;
  }
}

function makeInitials(name = '') {
  const clean = String(name || '').replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').trim();
  if (!clean) return 'AD';
  const parts = clean.split(/\s+/);
  const a = parts[0] ? parts[0][0] : 'U';
  const b = parts[1] ? parts[1][0] : (parts[0] && parts[0][1] ? parts[0][1] : '');
  return (a + b).toUpperCase();
}

// =========================================================================
// =========================================================================
// DATA PERSISTENCE & IN-MEMORY CACHE
// =========================================================================
let cachedDb = null;
let cachedAuth = null;
let cachedSessions = {};
let sessionsLoaded = false;
// In-memory heartbeat store: { [studentId]: { name, sessionId, lastSeen: timestamp } }
// This resets on cold-start but is acceptable for a soft "online presence" indicator
let cachedHeartbeats = {};

function locateFile(filename) {
  const tmpDir = os.tmpdir ? os.tmpdir() : '/tmp';
  const candidates = [
    path.join(tmpDir, filename),
    path.join('/tmp', filename),
    path.resolve(process.cwd(), 'data', filename),
    path.resolve(__dirname, '../data', filename),
    path.resolve(__dirname, 'data', filename),
    path.join(__dirname, filename),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { }
  }
  return null;
}

function saveLocalFile(filename, data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const tmpDir = os.tmpdir ? os.tmpdir() : '/tmp';
  try {
    fs.writeFileSync(path.join(tmpDir, filename), content, 'utf8');
  } catch { }
  try {
    if (tmpDir !== '/tmp') fs.writeFileSync(path.join('/tmp', filename), content, 'utf8');
  } catch { }
  try {
    const localData = path.resolve(process.cwd(), 'data');
    if (fs.existsSync(localData)) {
      fs.writeFileSync(path.join(localData, filename), content, 'utf8');
    }
  } catch { }
}

function loadSessions() {
  if (sessionsLoaded) return;
  sessionsLoaded = true;
  const sessPath = locateFile('sessions.json');
  if (sessPath) {
    try {
      const data = JSON.parse(fs.readFileSync(sessPath, 'utf8'));
      if (data && typeof data === 'object') {
        const now = new Date();
        for (const [k, v] of Object.entries(data)) {
          if (v && v.expiresAt && new Date(v.expiresAt) > now) {
            cachedSessions[k] = v;
          }
        }
      }
    } catch { }
  }
}

function saveSessions() {
  saveLocalFile('sessions.json', cachedSessions);
}

function normalizeSearchText(str) {
  return String(str || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizePhone(str) {
  return String(str || '').replace(/[^0-9]/g, '');
}

function findStudentByIdentifier(students, identifier) {
  if (!identifier) return { match: null, multiple: false };
  const ident = String(identifier).trim();
  const lowerIdent = ident.toLowerCase();
  const cleanIdent = normalizeSearchText(ident);
  const digitsIdent = normalizePhone(ident);

  const list = Array.isArray(students) ? students.filter(Boolean) : [];

  // 1. Direct match on register number (case-insensitive, trimmed)
  const regMatch = list.find((s) => String(s.regNo || '').trim().toLowerCase() === lowerIdent);
  if (regMatch) return { match: regMatch, multiple: false };

  // 2. Direct match on email (case-insensitive, trimmed)
  const emailMatch = list.find((s) => String(s.email || '').trim().toLowerCase() === lowerIdent);
  if (emailMatch) return { match: emailMatch, multiple: false };

  // 3. Match on phone number if digits are provided (minimum 7 digits)
  if (digitsIdent.length >= 7) {
    const phoneMatches = list.filter((s) => {
      const sDigits = normalizePhone(s.phone);
      return sDigits && (sDigits === digitsIdent || sDigits.endsWith(digitsIdent) || digitsIdent.endsWith(sDigits));
    });
    if (phoneMatches.length === 1) return { match: phoneMatches[0], multiple: false };
    if (phoneMatches.length > 1) return { match: null, multiple: true, matches: phoneMatches };
  }

  // 4. Match on student full name (whitespace-normalized, case-insensitive)
  const nameMatches = list.filter((s) => normalizeSearchText(s.name) === cleanIdent);
  if (nameMatches.length === 1) return { match: nameMatches[0], multiple: false };
  if (nameMatches.length > 1) return { match: null, multiple: true, matches: nameMatches };

  return { match: null, multiple: false };
}

function findDuplicateStudent(students, { regNo, email, phone }) {
  const list = Array.isArray(students) ? students.filter(Boolean) : [];
  const targetReg = String(regNo || '').trim().toUpperCase();
  const targetEmail = String(email || '').trim().toLowerCase();
  const targetPhoneDigits = normalizePhone(phone);

  for (const s of list) {
    if (targetReg && String(s.regNo || '').trim().toUpperCase() === targetReg) {
      return { duplicate: true, field: 'register number', message: 'A student with that register number already exists' };
    }
    if (targetEmail && String(s.email || '').trim().toLowerCase() === targetEmail) {
      return { duplicate: true, field: 'email', message: 'A student with that email already exists' };
    }
    if (targetPhoneDigits && targetPhoneDigits.length >= 7 && normalizePhone(s.phone) === targetPhoneDigits) {
      return { duplicate: true, field: 'phone', message: 'A student with that phone number already exists' };
    }
  }
  return { duplicate: false };
}

function getInitialDb() {
  return {
    revision: 1,
    updatedAt: new Date().toISOString(),
    emergencyAlert: null,
    settings: {
      collegeName: 'MAHENDRA ENGINEERING COLLEGE',
      shortName: 'Live AI Classroom',
      collegeCode: '2609',
      domain: 'mahendra.info',
      address: 'Tiruchengode - Salem Main Rd, Mahendhirapuri, Mallasamudram West, Tamil Nadu 637503',
      logoDataUrl: '',
      adminProfile: {
        name: 'Naveen Kumar',
        designation: 'Administrator',
        email: '',
        initials: 'NK'
      },
      autoTranscripts: true,
      scanAndSolveEnabled: true,
      aiEngineVersion: 'v4.2',
      lastCloudSync: '',
      departments: [],
      programs: []
    },
    students: [],
    teachers: [],
    liveClasses: [],
    materials: [],
    assignments: [],
    notices: [],
    events: [],
    timetable: [],
    timetableImage: null,
    chatMessages: [],
    activityLog: []
  };
}

function getInitialAuth() {
  const initialAdminHash = hashPassword('Naveen@2008');
  return {
    admin: {
      name: 'Naveen Kumar',
      username: 'Naveen Kumar',
      designation: 'Administrator',
      salt: initialAdminHash.salt,
      hash: initialAdminHash.hash,
      iterations: initialAdminHash.iterations,
      algo: initialAdminHash.algo,
      mustChangePassword: true,
      updatedAt: new Date().toISOString()
    },
    studentCredentials: {}
  };
}

// Cloud Storage (Upstash Redis / Vercel KV REST API)
async function cloudGet(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token || typeof fetch !== 'function') return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.result) {
        return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      }
    }
  } catch { }
  return null;
}

async function cloudSet(key, value) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token || typeof fetch !== 'function') return false;
  try {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: payload
    });
    return true;
  } catch {
    return false;
  }
}

function prepareDbForCloud(db) {
  if (!db || typeof db !== 'object') return db;
  const clone = JSON.parse(JSON.stringify(db));
  // If timetableImage base64 is over 100KB, strip dataUrl for cloud sync so it never chokes HTTP2
  if (clone.timetableImage && clone.timetableImage.dataUrl && clone.timetableImage.dataUrl.length > 100000) {
    clone.timetableImage = { ...clone.timetableImage, dataUrl: '' };
  }
  // If materials base64 is over 100KB, strip fileDataUrl for cloud sync
  if (Array.isArray(clone.materials)) {
    clone.materials = clone.materials.map((m) => {
      if (m && m.fileDataUrl && m.fileDataUrl.length > 100000) {
        return { ...m, fileDataUrl: '' };
      }
      return m;
    });
  }
  return clone;
}

async function loadDb() {
  if (cachedDb) return cachedDb;

  // TIER 1: Supabase PostgreSQL (preferred — persistent across all Vercel regions)
  const fromSupabase = await supabaseGet('app_state');
  if (fromSupabase && typeof fromSupabase === 'object' && (fromSupabase.revision || fromSupabase.settings)) {
    cachedDb = fromSupabase;
    console.log('[Storage] Loaded db from Supabase (revision', fromSupabase.revision, ')');
    return cachedDb;
  }

  // TIER 2: Upstash Redis / Vercel KV
  const fromCloud = await cloudGet('live_classroom_db');
  if (fromCloud && typeof fromCloud === 'object' && fromCloud.revision) {
    cachedDb = fromCloud;
    console.log('[Storage] Loaded db from Upstash/KV');
    return cachedDb;
  }

  // TIER 3: Local files (/tmp or bundled data/db.json)
  const filePath = locateFile('db.json');
  if (filePath) {
    try {
      cachedDb = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log('[Storage] Loaded db from local file:', filePath);
      // Auto-migrate to Supabase
      saveDb(cachedDb).catch(() => {});
      return cachedDb;
    } catch { }
  }

  // TIER 4: Default seed
  console.log('[Storage] Using default initial db seed');
  cachedDb = getInitialDb();
  saveDb(cachedDb).catch(() => {});
  return cachedDb;
}

async function loadAuth() {
  if (cachedAuth) return cachedAuth;

  // TIER 1: Supabase PostgreSQL
  const fromSupabase = await supabaseGet('app_auth');
  if (fromSupabase && typeof fromSupabase === 'object' && (fromSupabase.admin || fromSupabase.studentCredentials)) {
    cachedAuth = fromSupabase;
    if (!cachedAuth.studentCredentials) cachedAuth.studentCredentials = {};
    console.log('[Storage] Loaded auth from Supabase');
    return cachedAuth;
  }

  // TIER 2: Upstash Redis / Vercel KV
  const fromCloud = await cloudGet('live_classroom_auth');
  if (fromCloud && typeof fromCloud === 'object') {
    cachedAuth = fromCloud;
    if (!cachedAuth.studentCredentials) cachedAuth.studentCredentials = {};
    console.log('[Storage] Loaded auth from Upstash/KV');
    return cachedAuth;
  }

  // TIER 3: Local files (/tmp or bundled data/auth.json)
  const filePath = locateFile('auth.json');
  if (filePath) {
    try {
      cachedAuth = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!cachedAuth.studentCredentials) cachedAuth.studentCredentials = {};
      console.log('[Storage] Loaded auth from local file:', filePath);
      saveAuth(cachedAuth).catch(() => {});
      return cachedAuth;
    } catch { }
  }

  // TIER 4: Default seed
  cachedAuth = getInitialAuth();
  saveAuth(cachedAuth).catch(() => {});
  return cachedAuth;
}

async function saveDb(db) {
  cachedDb = db;
  // Always write full state to local filesystem
  saveLocalFile('db.json', db);

  // TIER 1: Supabase PostgreSQL (clean payload so it never chokes HTTP2 limits)
  const cloudPayload = prepareDbForCloud(db);
  let supabaseSaved = false;
  let storageUsed = 'local-tmp';
  try {
    supabaseSaved = await supabaseSet('app_state', cloudPayload);
    if (supabaseSaved) {
      storageUsed = 'supabase-postgresql';
      console.log('[Storage] Saved db to Supabase (revision', db.revision, ') ✓');
    } else {
      console.warn('[Storage] Supabase save returned false for app_state — falling back to /tmp');
    }
  } catch (e) {
    console.warn('[Storage] Supabase saveDb exception:', e?.message);
  }

  // TIER 2: Upstash / KV backup
  cloudSet('live_classroom_db', cloudPayload).catch(() => {});

  return { saved: supabaseSaved, storageUsed };
}

async function saveAuth(auth) {
  cachedAuth = auth;
  // TIER 1: Supabase — AWAIT this
  try {
    const saved = await supabaseSet('app_auth', auth);
    if (saved) {
      console.log('[Storage] Saved auth to Supabase ✓');
    } else {
      console.warn('[Storage] Supabase save returned false for app_auth');
    }
  } catch (e) {
    console.warn('[Storage] Supabase saveAuth exception:', e?.message);
  }
  // Secondary backups
  cloudSet('live_classroom_auth', auth).catch(() => {});
  saveLocalFile('auth.json', auth);
}

// Session Management — hybrid: in-memory (fast) + cryptographic stateless signature (cold-start proof) + Supabase
async function getSession(token) {
  if (!token) return null;
  loadSessions();
  let sess = cachedSessions[token];
  if (sess) {
    if (new Date(sess.expiresAt) <= new Date()) {
      delete cachedSessions[token];
      saveSessions();
      return null;
    }
    return sess;
  }

  // Fast stateless verify (survives cold starts & multi-container serverless without database call)
  const signed = verifySessionToken(token);
  if (signed) {
    cachedSessions[token] = signed;
    return signed;
  }

  // Cross-instance persistent lookup via Supabase PostgreSQL
  try {
    const fromSupabase = await supabaseGetSession(token);
    if (fromSupabase) {
      cachedSessions[token] = fromSupabase;
      return fromSupabase;
    }
  } catch (e) {
    console.warn('[Session] Supabase session lookup error:', e?.message);
  }

  return null;
}

async function createSession(role, userId, name) {
  loadSessions();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  const sessionBase = {
    role,
    userId,
    name,
    createdAt: new Date().toISOString(),
    expiresAt
  };
  const token = signSessionToken(sessionBase);
  const session = { ...sessionBase, token };
  cachedSessions[token] = session;
  saveSessions();
  // Persist session to Supabase so all serverless instances immediately recognize it
  try {
    await supabaseCreateSession(role, userId, name, token);
  } catch (e) {
    console.warn('[Session] supabaseCreateSession error:', e?.message);
  }
  return session;
}

function removeSession(token) {
  if (token && cachedSessions[token]) {
    delete cachedSessions[token];
    saveSessions();
  }
  // Also remove from Supabase (fire-and-forget)
  supabaseRemoveSession(token).catch(() => {});
}

function sanitizeDbForClient(db) {
  const copy = JSON.parse(JSON.stringify(db));
  if (Array.isArray(copy.students)) {
    copy.students.forEach((s) => {
      if (s) {
        delete s.password;
        delete s._newPassword;
      }
    });
  }
  return copy;
}

function addActivityLog(db, text) {
  if (!text) return;
  const entry = {
    id: 'act-' + Date.now(),
    time: new Date().toISOString(),
    text
  };
  db.activityLog = [entry, ...(db.activityLog || []).slice(0, 29)];
}

// Helper to send standard JSON response
function sendJson(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (typeof res.status === 'function') {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }
  if (typeof res.json === 'function') {
    res.json(data);
  } else {
    res.end(JSON.stringify(data));
  }
}

// Helper to parse request body
function parseRequestBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    if (typeof req.body === 'string') {
      try {
        return resolve(JSON.parse(req.body));
      } catch {
        return resolve({});
      }
    }
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

// Robust path extractor supporting Vercel URL rewrites and query params
function extractReqPath(req) {
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-invoke-path'];
  if (matchedPath && matchedPath.startsWith('/api')) {
    return matchedPath.split('?')[0].replace(/\/+$/, '') || '/api';
  }

  const rawUrl = (req.url || '').split('?')[0];
  if (rawUrl && rawUrl !== '/api' && rawUrl !== '/api/' && rawUrl.startsWith('/api')) {
    return rawUrl.replace(/\/+$/, '');
  }

  if (req.query && req.query.path) {
    const sub = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
    return ('/api/' + sub).replace(/\/+$/, '');
  }

  try {
    const parsed = new URL(req.url, 'http://localhost');
    if (parsed.searchParams.has('path')) {
      return ('/api/' + parsed.searchParams.get('path')).replace(/\/+$/, '');
    }
  } catch { }

  return rawUrl || '/api';
}

// =========================================================================
// VERCEL SERVERLESS FUNCTION HANDLER (Node.js runtime: req, res)
// =========================================================================
module.exports = async function handler(req, res) {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (typeof res.status === 'function') {
      return res.status(204).end();
    } else {
      res.statusCode = 204;
      return res.end();
    }
  }

  try {
    const reqPath = extractReqPath(req);
    const method = (req.method || 'GET').toUpperCase();

    // Clear per-request so every request reads fresh data from Supabase.
    // This prevents Vercel warm-instance serving stale cachedDb to concurrent requests.
    // After saveDb() sets cachedDb, the NEXT request re-reads from Supabase to pick up
    // any changes from other Vercel instances or cold-start restores.
    if (method === 'GET' && (reqPath === '/api/state' || reqPath === '/api/version')) {
      cachedDb = null;  // force re-read from Supabase on state/version GETs
    }

    // Extract authentication token
    const tokenHeader = req.headers['x-auth-token'] || req.headers['authorization'] || '';
    const token = tokenHeader.replace(/^Bearer\s+/i, '').trim();
    const session = await getSession(token);

    // Parse body for write operations
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      body = await parseRequestBody(req);
    }

    const db = await loadDb();
    const auth = await loadAuth();

    // =====================================================================
    // ENDPOINTS
    // =====================================================================

    // 1. Health
    if (reqPath === '/api/health') {
      const hasSecret = !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY);
      const hasKey = hasSecret || !!(process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);
      const sbConfigured = !!(process.env.SUPABASE_URL && hasKey);
      return sendJson(res, 200, {
        ok: true,
        authEnabled: true,
        serverVersion: '3.1-supabase-realtime',
        revision: db.revision || 1,
        serverTime: new Date().toISOString(),
        storage: {
          supabase: sbConfigured ? 'configured' : 'not-configured',
          supabaseServiceKey: hasSecret,
          upstash: !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)
        }
      });
    }

    // 1b. Public Config — GET /api/config (safe public config for Supabase Realtime in browser)
    if (reqPath === '/api/config') {
      if (method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      const url = process.env.SUPABASE_URL || '';
      const anonKey = process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
      return sendJson(res, 200, {
        ok: true,
        supabaseUrl: url,
        supabaseAnonKey: anonKey,
        realtimeEnabled: Boolean(url && anonKey)
      });
    }

    // 1c. Supabase Status — GET /api/supabase/status (admin only)
    if (reqPath === '/api/supabase/status') {
      if (method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      if (!session || session.role !== 'admin') return sendJson(res, 403, { ok: false, error: 'Admin only' });
      const sb = getSupabase();
      let connected = false;
      let error = null;
      let storageMode = 'local-files';
      if (sb) {
        try {
          const { data, error: sbErr } = await sb.from('app_state').select('id, revision').eq('id', 'singleton').single();
          if (sbErr) { error = sbErr.message; }
          else { connected = true; storageMode = 'supabase-postgresql'; }
        } catch (e) { error = e?.message; }
      }
      return sendJson(res, 200, {
        ok: true,
        supabase: {
          connected,
          error,
          url: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/\/\/.*@/, '//<credentials>@') : null,
          serviceKeyConfigured: !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY),
          anonKeyConfigured: !!(process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY),
          activeKeyType: _supabaseKeyType || (sb ? 'unknown' : 'none')
        },
        storageMode,
        dbRevision: db.revision || 1
      });
    }

    // 1d. Cloud Storage Upload URL — POST /api/upload-url (admin only)
    if (reqPath === '/api/upload-url') {
      if (method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      if (!session || session.role !== 'admin') return sendJson(res, 403, { ok: false, error: 'Administrator authentication required' });
      const sb = getSupabase();
      if (!sb) return sendJson(res, 500, { ok: false, error: 'Supabase storage not configured' });
      const rawName = String(body.fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
      const folder = body.folder === 'timetable' ? 'timetable' : 'materials';
      const cleanPath = `${folder}/${Date.now()}_${rawName}`;
      try {
        const { data, error } = await sb.storage.from('classroom-assets').createSignedUploadUrl(cleanPath);
        if (error) return sendJson(res, 500, { ok: false, error: error.message });
        const { data: pubData } = sb.storage.from('classroom-assets').getPublicUrl(cleanPath);
        return sendJson(res, 200, {
          ok: true,
          signedUrl: data.signedUrl,
          publicUrl: pubData.publicUrl,
          path: cleanPath,
          fileName: rawName
        });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err?.message || 'Failed to create upload URL' });
      }
    }

    // 2. Version
    if (reqPath === '/api/version') {
      if (method !== 'GET') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      return sendJson(res, 200, {
        revision: db.revision || 1,
        updatedAt: db.updatedAt || new Date().toISOString(),
        authEnabled: true,
        serverVersion: '2.0-vercel'
      });
    }

    // 3. Auth: Me
    if (reqPath === '/api/auth/me') {
      if (method !== 'GET') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      if (!session) {
        return sendJson(res, 401, { authenticated: false, error: 'Unauthorized' });
      }
      const mustChange = session.role === 'admin' && Boolean(auth.admin.mustChangePassword);
      return sendJson(res, 200, {
        authenticated: true,
        role: session.role,
        userId: session.userId,
        name: session.name,
        mustChangePassword: mustChange
      });
    }

    // 4. Auth: Logout
    if (reqPath === '/api/auth/logout') {
      if (method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      if (token) removeSession(token);
      return sendJson(res, 200, { ok: true });
    }

    // 5. Auth: Admin Login
    if (reqPath === '/api/auth/admin/login') {
      if (method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      const inName = String(body.name || '').replace(/\s+/g, ' ').trim();
      const inPwd = String(body.password || '');
      if (!inName) {
        return sendJson(res, 400, { ok: false, error: 'Please enter the administrator name' });
      }
      if (!inPwd) {
        return sendJson(res, 400, { ok: false, error: 'Please enter your password' });
      }

      const admin = auth.admin || {};
      const adminEmail = db.settings?.adminProfile?.email ? String(db.settings.adminProfile.email).trim().toLowerCase() : '';
      const normAdminName = String(admin.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const normAdminUser = String(admin.username || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const inLower = inName.toLowerCase();

      const nameMatches = inLower === normAdminName || inLower === normAdminUser || (adminEmail && inLower === adminEmail);
      const pwdValid = verifyPassword(inPwd, admin);

      if (!nameMatches || !pwdValid) {
        return sendJson(res, 401, { ok: false, error: 'Invalid administrator name or password' });
      }

      const newSess = await createSession('admin', 'admin-primary', admin.name || inName);
      addActivityLog(db, `Administrator ${admin.name || inName} signed in`);
      db.revision = (db.revision || 1) + 1;
      db.updatedAt = new Date().toISOString();
      await saveDb(db);

      return sendJson(res, 200, {
        ok: true,
        token: newSess.token,
        role: 'admin',
        admin: {
          name: admin.name,
          designation: admin.designation,
          mustChangePassword: Boolean(admin.mustChangePassword)
        }
      });
    }

    // 6. Auth: Admin Change Password
    if (reqPath === '/api/auth/admin/change-password') {
      if (method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      if (!session || session.role !== 'admin') {
        return sendJson(res, 403, { ok: false, error: 'Administrator authentication required' });
      }
      const curPwd = String(body.currentPassword || '');
      const newPwd = String(body.newPassword || '');
      if (!curPwd || !newPwd) {
        return sendJson(res, 400, { ok: false, error: 'Current password and new password are required' });
      }
      if (newPwd.length < 8) {
        return sendJson(res, 400, { ok: false, error: 'New admin password must be at least 8 characters' });
      }
      if (!verifyPassword(curPwd, auth.admin)) {
        return sendJson(res, 401, { ok: false, error: 'Current password is incorrect' });
      }

      const newH = hashPassword(newPwd);
      auth.admin.salt = newH.salt;
      auth.admin.hash = newH.hash;
      auth.admin.iterations = newH.iterations;
      auth.admin.mustChangePassword = false;
      auth.admin.updatedAt = new Date().toISOString();
      await saveAuth(auth);

      addActivityLog(db, 'Administrator password changed securely');
      db.revision = (db.revision || 1) + 1;
      db.updatedAt = new Date().toISOString();
      await saveDb(db);

      return sendJson(res, 200, { ok: true, mustChangePassword: false });
    }

    // 7. Auth: Student Login
    if (reqPath === '/api/auth/student/login') {
      if (method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      const ident = String(body.identifier || '').replace(/\s+/g, ' ').trim();
      const pwd = String(body.password || '');
      if (!ident) {
        return sendJson(res, 400, { ok: false, error: 'Please enter your register number, email, or name' });
      }
      if (!pwd) {
        return sendJson(res, 400, { ok: false, error: 'Please enter your password' });
      }

      const students = Array.isArray(db.students) ? db.students : [];
      const searchResult = findStudentByIdentifier(students, ident);

      if (searchResult.multiple) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Multiple students match that search. Please sign in using your register number or email.'
        });
      }

      const match = searchResult.match;
      if (!match) {
        return sendJson(res, 401, { ok: false, error: 'Student account not found' });
      }
      if (match.status === 'Deactivated') {
        return sendJson(res, 403, { ok: false, error: 'This student account is deactivated. Contact administration.' });
      }

      const cred = auth.studentCredentials[match.id];
      if (!cred) {
        return sendJson(res, 401, {
          ok: false,
          error: 'No password is set for this account. Please ask your administrator to set a password.'
        });
      }

      if (!verifyPassword(pwd, cred)) {
        return sendJson(res, 401, { ok: false, error: 'Incorrect Password' });
      }

      match.hasLoggedIn = true;
      match.lastLoginAt = new Date().toISOString();
      match.status = 'Active';
      delete match.password;
      delete match._newPassword;

      addActivityLog(db, `Student ${match.name} signed in`);
      db.revision = (db.revision || 1) + 1;
      db.updatedAt = new Date().toISOString();
      await saveDb(db);

      const newSess = await createSession('student', match.id, match.name);
      return sendJson(res, 200, {
        ok: true,
        token: newSess.token,
        role: 'student',
        student: match
      });
    }

    // 8. Auth: Student Register
    if (reqPath === '/api/auth/student/register') {
      if (method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const phone = String(body.phone || '').trim();
      const regNo = String(body.regNo || '').trim().toUpperCase();
      const pwd = String(body.password || '');

      if (!name || !email || !regNo) {
        return sendJson(res, 400, { ok: false, error: 'Name, email, and register number are required' });
      }
      if (!pwd || pwd.length < 6) {
        return sendJson(res, 400, { ok: false, error: 'Password must be at least 6 characters' });
      }

      const students = Array.isArray(db.students) ? db.students : [];
      const dupCheck = findDuplicateStudent(students, { regNo, email, phone });
      if (dupCheck.duplicate) {
        return sendJson(res, 409, { ok: false, error: dupCheck.message });
      }

      const stuId = 'stu-' + Date.now();
      const nowIso = new Date().toISOString();
      const newStu = {
        id: stuId,
        name,
        initials: makeInitials(name),
        email,
        phone,
        regNo,
        department: String(body.department || '').trim(),
        program: String(body.program || '').trim(),
        year: body.year || 'Year 1',
        section: body.section ? String(body.section).trim() : 'Sec A',
        semester: 'Semester 1',
        cgpa: '-',
        attendance: 0,
        aiScore: '-',
        creditsCleared: '-',
        status: 'Active',
        hasLoggedIn: true,
        lastLoginAt: nowIso,
        aiProvisioned: true,
        avatarDataUrl: ''
      };

      auth.studentCredentials[stuId] = hashPassword(pwd);
      await saveAuth(auth);

      db.students = [newStu, ...students];
      addActivityLog(db, `Registered student ${name} (${regNo})`);
      db.revision = (db.revision || 1) + 1;
      db.updatedAt = nowIso;
      await saveDb(db);

      const newSess = await createSession('student', stuId, name);
      return sendJson(res, 200, {
        ok: true,
        token: newSess.token,
        role: 'student',
        student: newStu
      });
    }

    // 9. Auth: Student Change Password
    if (reqPath === '/api/auth/student/change-password') {
      if (method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      if (!session) {
        return sendJson(res, 401, { ok: false, error: 'Authentication required' });
      }
      const targetId = session.role === 'admin' && body.studentId ? String(body.studentId) : String(session.userId);
      const newPwd = String(body.newPassword || '');
      if (!newPwd || newPwd.length < 6) {
        return sendJson(res, 400, { ok: false, error: 'New password must be at least 6 characters' });
      }
      if (session.role !== 'admin') {
        const curPwd = String(body.currentPassword || '');
        if (!curPwd) {
          return sendJson(res, 400, { ok: false, error: 'Please enter your current password' });
        }
        const stored = auth.studentCredentials[targetId];
        if (!stored || !verifyPassword(curPwd, stored)) {
          return sendJson(res, 401, { ok: false, error: 'Current password is incorrect' });
        }
      }

      auth.studentCredentials[targetId] = hashPassword(newPwd);
      await saveAuth(auth);
      return sendJson(res, 200, { ok: true });
    }

    // 10. Data: State GET
    if (reqPath === '/api/state' && method === 'GET') {
      return sendJson(res, 200, sanitizeDbForClient(db));
    }

    // 11. Data: State PUT / POST
    if (reqPath === '/api/state' && (method === 'PUT' || method === 'POST')) {
      if (!session || session.role !== 'admin') {
        return sendJson(res, 403, { ok: false, error: 'Administrator authentication required' });
      }
      if (!body || typeof body !== 'object') {
        return sendJson(res, 400, { error: 'Empty payload' });
      }

      let authUpdated = false;
      if (Array.isArray(body.students)) {
        body.students.forEach((stu) => {
          if (!stu) return;
          if (stu._newPassword) {
            auth.studentCredentials[stu.id] = hashPassword(String(stu._newPassword));
            authUpdated = true;
            delete stu._newPassword;
          }
          delete stu.password;
        });
      }

      if (body.settings?.adminProfile?.name) {
        const newAdminName = String(body.settings.adminProfile.name).trim();
        if (auth.admin.name !== newAdminName) {
          auth.admin.name = newAdminName;
          auth.admin.designation = String(body.settings.adminProfile.designation || 'Administrator').trim();
          authUpdated = true;
        }
      }
      if (authUpdated) await saveAuth(auth);

      if (Array.isArray(body.timetable)) {
        body.timetable.forEach((slot, idx) => {
          if (slot && !slot.id) {
            slot.id = `tt-${idx + 1}-${Date.now()}`;
          }
        });
      }

      body.revision = (db.revision || 1) + 1;
      body.updatedAt = new Date().toISOString();
      const saveResult = await saveDb(body);

      // If Supabase is configured and save to Supabase failed, do NOT claim success!
      const hasSupabase = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY));
      if (hasSupabase && !saveResult?.saved) {
        return sendJson(res, 500, {
          ok: false,
          error: 'Database write to Supabase failed. Changes could not be permanently saved.',
          storageUsed: saveResult?.storageUsed || 'failed',
          supabaseSaved: false
        });
      }

      return sendJson(res, 200, {
        ok: true,
        revision: body.revision,
        updatedAt: body.updatedAt,
        storageUsed: saveResult?.storageUsed || 'unknown',
        supabaseSaved: saveResult?.saved === true,
      });
    }

    // 12. Heartbeat — POST /api/heartbeat (student sends every 30s to signal presence)
    if (reqPath === '/api/heartbeat') {
      if (method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      if (!session) {
        return sendJson(res, 401, { ok: false, error: 'Authentication required' });
      }
      const studentId = session.role === 'student' ? session.userId : null;
      if (!studentId) {
        return sendJson(res, 400, { ok: false, error: 'Heartbeat is for students only' });
      }
      const now = Date.now();
      // Purge stale heartbeats older than 90 seconds
      for (const sid of Object.keys(cachedHeartbeats)) {
        if (now - cachedHeartbeats[sid].lastSeen > 90000) delete cachedHeartbeats[sid];
      }
      cachedHeartbeats[studentId] = { name: session.name, lastSeen: now };
      return sendJson(res, 200, { ok: true, studentId, lastSeen: new Date(now).toISOString() });
    }

    // 12b. Online Students — GET /api/online-students (returns who is online in last 90s)
    if (reqPath === '/api/online-students') {
      if (method !== 'GET') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      const now = Date.now();
      const online = [];
      for (const sid of Object.keys(cachedHeartbeats)) {
        const hb = cachedHeartbeats[sid];
        if (now - hb.lastSeen <= 90000) {
          online.push({ studentId: sid, name: hb.name, lastSeen: new Date(hb.lastSeen).toISOString() });
        } else {
          delete cachedHeartbeats[sid];
        }
      }
      return sendJson(res, 200, { ok: true, online, count: online.length, serverTime: new Date().toISOString() });
    }

    // 13. Student Action
    if (reqPath === '/api/student/action') {
      if (method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      if (!session) {
        return sendJson(res, 401, { ok: false, error: 'Authentication required' });
      }
      const action = String(body.action || '');

      if (action === 'updateAvatar') {
        const targetId = session.role === 'admin' && body.studentId ? String(body.studentId) : String(session.userId);
        const target = (db.students || []).find((s) => s && s.id === targetId);
        if (target) {
          target.avatarDataUrl = String(body.avatarDataUrl || '');
          db.revision = (db.revision || 1) + 1;
          db.updatedAt = new Date().toISOString();
          await saveDb(db);
          return sendJson(res, 200, { ok: true, revision: db.revision });
        }
      }

      if (action === 'submitAssignment') {
        const asg = (db.assignments || []).find((a) => a && a.id === String(body.assignmentId));
        if (asg) {
          asg.status = 'Graded';
          asg.dueLabel = 'Submitted';
          asg.submissionFile = String(body.fileName || '');
          asg.score = Number(body.score) || 0;
          asg.feedback = String(body.feedback || '');
          addActivityLog(db, `${session.name} submitted ${asg.title}`);
          db.revision = (db.revision || 1) + 1;
          db.updatedAt = new Date().toISOString();
          await saveDb(db);
          return sendJson(res, 200, { ok: true, revision: db.revision });
        }
      }

      if (action === 'appendChatMessage') {
        db.chatMessages = [...(db.chatMessages || []), body.message];
        db.revision = (db.revision || 1) + 1;
        db.updatedAt = new Date().toISOString();
        await saveDb(db);
        return sendJson(res, 200, { ok: true, revision: db.revision });
      }

      if (action === 'clearChat') {
        db.chatMessages = [];
        db.revision = (db.revision || 1) + 1;
        db.updatedAt = new Date().toISOString();
        await saveDb(db);
        return sendJson(res, 200, { ok: true, revision: db.revision });
      }

      if (action === 'postLiveQA') {
        const cls = (db.liveClasses || []).find((c) => c && c.id === String(body.classId || ''));
        if (cls) {
          cls.qa = cls.qa || [];
          cls.qa.push({
            id: 'qa-' + Date.now(),
            author: session.name || 'Student',
            regNo: String(body.regNo || ''),
            text: String(body.text || '').trim(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
          addActivityLog(db, `${session.name} asked a question in live class`);
          db.revision = (db.revision || 1) + 1;
          db.updatedAt = new Date().toISOString();
          await saveDb(db);
          return sendJson(res, 200, { ok: true, revision: db.revision });
        }
        return sendJson(res, 404, { ok: false, error: 'Live class not found' });
      }

      return sendJson(res, 400, { ok: false, error: 'Unknown student action' });
    }

    // 13. Route Not Found
    return sendJson(res, 404, { ok: false, error: `API endpoint not found: ${method} ${reqPath}` });

  } catch (err) {
    console.error('Unhandled Vercel API Error:', err);
    return sendJson(res, 500, {
      ok: false,
      error: 'Internal server error: ' + (err?.message || 'Unexpected failure')
    });
  }
};
