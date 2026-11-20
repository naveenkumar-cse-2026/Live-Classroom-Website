/**
 * LIVE AI CLASSROOM PRO - Vercel Serverless Backend API
 *
 * Platform: Vercel Serverless Functions (Node.js runtime)
 * Architecture: (req, res) standard Node.js HTTP handler
 * Security: PBKDF2-HMAC-SHA256 (100,000 iterations, 16-byte salt, constant-time verification)
 * Storage: Multi-tier persistence:
 *   1. Cloud Key-Value / Database (Upstash Redis / Vercel KV / Supabase REST via env vars)
 *   2. /tmp writable filesystem cache
 *   3. Bundled seed files (data/db.json and data/auth.json)
 *   4. Warm memory cache
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function makeInitials(name = '') {
  const clean = String(name || '').replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').trim();
  if (!clean) return 'AD';
  const parts = clean.split(/\s+/);
  const a = parts[0] ? parts[0][0] : 'U';
  const b = parts[1] ? parts[1][0] : (parts[0] && parts[0][1] ? parts[0][1] : '');
  return (a + b).toUpperCase();
}

// =========================================================================
// DATA PERSISTENCE & IN-MEMORY CACHE
// =========================================================================
let cachedDb = null;
let cachedAuth = null;
let cachedSessions = {};

function locateFile(filename) {
  const candidates = [
    path.join('/tmp', filename),
    path.resolve(process.cwd(), 'data', filename),
    path.resolve(__dirname, '../data', filename),
    path.resolve(__dirname, 'data', filename),
    path.join(__dirname, filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
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
  } catch {}
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

async function loadDb() {
  if (cachedDb) return cachedDb;

  // Try cloud storage first
  const fromCloud = await cloudGet('live_classroom_db');
  if (fromCloud && typeof fromCloud === 'object') {
    cachedDb = fromCloud;
    return cachedDb;
  }

  // Try local files (/tmp or bundled data/db.json)
  const filePath = locateFile('db.json');
  if (filePath) {
    try {
      cachedDb = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return cachedDb;
    } catch {}
  }

  cachedDb = getInitialDb();
  return cachedDb;
}

async function loadAuth() {
  if (cachedAuth) return cachedAuth;

  // Try cloud storage first
  const fromCloud = await cloudGet('live_classroom_auth');
  if (fromCloud && typeof fromCloud === 'object') {
    cachedAuth = fromCloud;
    if (!cachedAuth.studentCredentials) cachedAuth.studentCredentials = {};
    return cachedAuth;
  }

  // Try local files (/tmp or bundled data/auth.json)
  const filePath = locateFile('auth.json');
  if (filePath) {
    try {
      cachedAuth = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!cachedAuth.studentCredentials) cachedAuth.studentCredentials = {};
      return cachedAuth;
    } catch {}
  }

  cachedAuth = getInitialAuth();
  return cachedAuth;
}

async function saveDb(db) {
  cachedDb = db;
  // Cloud sync
  cloudSet('live_classroom_db', db).catch(() => {});
  // /tmp fallback
  try {
    fs.writeFileSync(path.join('/tmp', 'db.json'), JSON.stringify(db, null, 2), 'utf8');
  } catch {}
}

async function saveAuth(auth) {
  cachedAuth = auth;
  // Cloud sync
  cloudSet('live_classroom_auth', auth).catch(() => {});
  // /tmp fallback
  try {
    fs.writeFileSync(path.join('/tmp', 'auth.json'), JSON.stringify(auth, null, 2), 'utf8');
  } catch {}
}

// Session Management
function getSession(token) {
  if (!token) return null;
  const sess = cachedSessions[token];
  if (!sess) return null;
  if (new Date(sess.expiresAt) <= new Date()) {
    delete cachedSessions[token];
    return null;
  }
  return sess;
}

function createSession(role, userId, name) {
  const token = generateToken();
  const session = {
    token,
    role,
    userId,
    name,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
  cachedSessions[token] = session;
  return session;
}

function removeSession(token) {
  if (token && cachedSessions[token]) {
    delete cachedSessions[token];
  }
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
  } catch {}

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

    // Extract authentication token
    const tokenHeader = req.headers['x-auth-token'] || req.headers['authorization'] || '';
    const token = tokenHeader.replace(/^Bearer\s+/i, '').trim();
    const session = getSession(token);

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
      return sendJson(res, 200, {
        ok: true,
        authEnabled: true,
        serverVersion: '2.0-vercel',
        revision: db.revision || 1,
        serverTime: new Date().toISOString()
      });
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

      const newSess = createSession('admin', 'admin-primary', admin.name || inName);
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
      let match = students.find((s) =>
        s && (
          String(s.regNo || '').trim().toLowerCase() === ident.toLowerCase() ||
          String(s.email || '').trim().toLowerCase() === ident.toLowerCase()
        )
      );

      if (!match) {
        const nameMatches = students.filter((s) =>
          s && String(s.name || '').replace(/\s+/g, ' ').trim().toLowerCase() === ident.toLowerCase()
        );
        if (nameMatches.length === 1) {
          match = nameMatches[0];
        } else if (nameMatches.length > 1) {
          return sendJson(res, 400, {
            ok: false,
            error: 'Multiple students share that name. Please sign in using your register number or email.'
          });
        }
      }

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

      const newSess = createSession('student', match.id, match.name);
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
      const regNo = String(body.regNo || '').trim().toUpperCase();
      const pwd = String(body.password || '');

      if (!name || !email || !regNo) {
        return sendJson(res, 400, { ok: false, error: 'Name, email, and register number are required' });
      }
      if (!pwd || pwd.length < 6) {
        return sendJson(res, 400, { ok: false, error: 'Password must be at least 6 characters' });
      }

      const students = Array.isArray(db.students) ? db.students : [];
      const dup = students.find((s) =>
        s && (
          String(s.regNo || '').trim().toUpperCase() === regNo ||
          String(s.email || '').trim().toLowerCase() === email
        )
      );
      if (dup) {
        return sendJson(res, 409, { ok: false, error: 'A student with that register number or email already exists' });
      }

      const stuId = 'stu-' + Date.now();
      const nowIso = new Date().toISOString();
      const newStu = {
        id: stuId,
        name,
        initials: makeInitials(name),
        email,
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

      const newSess = createSession('student', stuId, name);
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
      await saveDb(body);

      return sendJson(res, 200, { ok: true, revision: body.revision, updatedAt: body.updatedAt });
    }

    // 12. Student Action
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
