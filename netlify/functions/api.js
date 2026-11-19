const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// =========================================================================
// CRYPTOGRAPHY: PBKDF2-HMAC-SHA256 (100,000 iterations, 16-byte salt)
// Exactly compatible with server.ps1 backend
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
    path.resolve(__dirname, '../../data', filename),
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

function loadDb() {
  if (cachedDb) return cachedDb;
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

function loadAuth() {
  if (cachedAuth) return cachedAuth;
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

function saveDb(db) {
  cachedDb = db;
  try {
    fs.writeFileSync(path.join('/tmp', 'db.json'), JSON.stringify(db, null, 2), 'utf8');
  } catch {}
}

function saveAuth(auth) {
  cachedAuth = auth;
  try {
    fs.writeFileSync(path.join('/tmp', 'auth.json'), JSON.stringify(auth, null, 2), 'utf8');
  } catch {}
}

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

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
    body: JSON.stringify(data)
  };
}

// =========================================================================
// NETLIFY FUNCTION HANDLER
// =========================================================================
exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      },
      body: ''
    };
  }

  // Normalize path
  let reqPath = (event.path || '').replace(/^\/\.netlify\/functions\/api/, '/api');
  if (!reqPath.startsWith('/api')) {
    reqPath = '/api' + (reqPath.startsWith('/') ? '' : '/') + reqPath;
  }
  reqPath = reqPath.split('?')[0].replace(/\/+$/, '') || '/api';

  const method = (event.httpMethod || 'GET').toUpperCase();
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    headers[k.toLowerCase()] = v;
  }

  const token = headers['x-auth-token'] || (headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const session = getSession(token);

  let body = {};
  if (event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
      body = {};
    }
  }

  const db = loadDb();
  const auth = loadAuth();

  // 1. Health & Version
  if (reqPath === '/api/health') {
    return jsonResponse(200, {
      ok: true,
      authEnabled: true,
      serverVersion: '2.0-netlify',
      revision: db.revision || 1,
      serverTime: new Date().toISOString()
    });
  }

  if (reqPath === '/api/version' && method === 'GET') {
    return jsonResponse(200, {
      revision: db.revision || 1,
      updatedAt: db.updatedAt || new Date().toISOString(),
      authEnabled: true,
      serverVersion: '2.0-netlify'
    });
  }

  // 2. Auth: Me
  if (reqPath === '/api/auth/me' && method === 'GET') {
    if (!session) {
      return jsonResponse(401, { authenticated: false, error: 'Unauthorized' });
    }
    const mustChange = session.role === 'admin' && Boolean(auth.admin.mustChangePassword);
    return jsonResponse(200, {
      authenticated: true,
      role: session.role,
      userId: session.userId,
      name: session.name,
      mustChangePassword: mustChange
    });
  }

  // 3. Auth: Logout
  if (reqPath === '/api/auth/logout' && method === 'POST') {
    if (token) removeSession(token);
    return jsonResponse(200, { ok: true });
  }

  // 4. Auth: Admin Login
  if (reqPath === '/api/auth/admin/login' && method === 'POST') {
    const inName = String(body.name || '').replace(/\s+/g, ' ').trim();
    const inPwd = String(body.password || '');
    if (!inName) {
      return jsonResponse(400, { ok: false, error: 'Please enter the administrator name' });
    }
    if (!inPwd) {
      return jsonResponse(400, { ok: false, error: 'Please enter your password' });
    }

    const admin = auth.admin || {};
    const adminEmail = db.settings?.adminProfile?.email ? String(db.settings.adminProfile.email).trim().toLowerCase() : '';
    const normAdminName = String(admin.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const normAdminUser = String(admin.username || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const inLower = inName.toLowerCase();

    const nameMatches = inLower === normAdminName || inLower === normAdminUser || (adminEmail && inLower === adminEmail);
    const pwdValid = verifyPassword(inPwd, admin);

    if (!nameMatches || !pwdValid) {
      return jsonResponse(401, { ok: false, error: 'Invalid administrator name or password' });
    }

    const newSess = createSession('admin', 'admin-primary', admin.name || inName);
    addActivityLog(db, `Administrator ${admin.name || inName} signed in`);
    db.revision = (db.revision || 1) + 1;
    db.updatedAt = new Date().toISOString();
    saveDb(db);

    return jsonResponse(200, {
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

  // 5. Auth: Admin Change Password
  if (reqPath === '/api/auth/admin/change-password' && method === 'POST') {
    if (!session || session.role !== 'admin') {
      return jsonResponse(403, { ok: false, error: 'Administrator authentication required' });
    }
    const curPwd = String(body.currentPassword || '');
    const newPwd = String(body.newPassword || '');
    if (!curPwd || !newPwd) {
      return jsonResponse(400, { ok: false, error: 'Current password and new password are required' });
    }
    if (newPwd.length < 8) {
      return jsonResponse(400, { ok: false, error: 'New admin password must be at least 8 characters' });
    }
    if (!verifyPassword(curPwd, auth.admin)) {
      return jsonResponse(401, { ok: false, error: 'Current password is incorrect' });
    }

    const newH = hashPassword(newPwd);
    auth.admin.salt = newH.salt;
    auth.admin.hash = newH.hash;
    auth.admin.iterations = newH.iterations;
    auth.admin.mustChangePassword = false;
    auth.admin.updatedAt = new Date().toISOString();
    saveAuth(auth);

    addActivityLog(db, 'Administrator password changed securely');
    db.revision = (db.revision || 1) + 1;
    db.updatedAt = new Date().toISOString();
    saveDb(db);

    return jsonResponse(200, { ok: true, mustChangePassword: false });
  }

  // 6. Auth: Student Login
  if (reqPath === '/api/auth/student/login' && method === 'POST') {
    const ident = String(body.identifier || '').replace(/\s+/g, ' ').trim();
    const pwd = String(body.password || '');
    if (!ident) {
      return jsonResponse(400, { ok: false, error: 'Please enter your register number, email, or name' });
    }
    if (!pwd) {
      return jsonResponse(400, { ok: false, error: 'Please enter your password' });
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
        return jsonResponse(400, {
          ok: false,
          error: 'Multiple students share that name. Please sign in using your register number or email.'
        });
      }
    }

    if (!match) {
      return jsonResponse(401, { ok: false, error: 'Student account not found' });
    }
    if (match.status === 'Deactivated') {
      return jsonResponse(403, { ok: false, error: 'This student account is deactivated. Contact administration.' });
    }

    const cred = auth.studentCredentials[match.id];
    if (!cred) {
      return jsonResponse(401, {
        ok: false,
        error: 'No password is set for this account. Please ask your administrator to set a password.'
      });
    }

    if (!verifyPassword(pwd, cred)) {
      return jsonResponse(401, { ok: false, error: 'Incorrect Password' });
    }

    match.hasLoggedIn = true;
    match.lastLoginAt = new Date().toISOString();
    match.status = 'Active';
    delete match.password;
    delete match._newPassword;

    addActivityLog(db, `Student ${match.name} signed in`);
    db.revision = (db.revision || 1) + 1;
    db.updatedAt = new Date().toISOString();
    saveDb(db);

    const newSess = createSession('student', match.id, match.name);
    return jsonResponse(200, {
      ok: true,
      token: newSess.token,
      role: 'student',
      student: match
    });
  }

  // 7. Auth: Student Register
  if (reqPath === '/api/auth/student/register' && method === 'POST') {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const regNo = String(body.regNo || '').trim().toUpperCase();
    const pwd = String(body.password || '');

    if (!name || !email || !regNo) {
      return jsonResponse(400, { ok: false, error: 'Name, email, and register number are required' });
    }
    if (!pwd || pwd.length < 6) {
      return jsonResponse(400, { ok: false, error: 'Password must be at least 6 characters' });
    }

    const students = Array.isArray(db.students) ? db.students : [];
    const dup = students.find((s) =>
      s && (
        String(s.regNo || '').trim().toUpperCase() === regNo ||
        String(s.email || '').trim().toLowerCase() === email
      )
    );
    if (dup) {
      return jsonResponse(409, { ok: false, error: 'A student with that register number or email already exists' });
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
    saveAuth(auth);

    db.students = [newStu, ...students];
    addActivityLog(db, `Registered student ${name} (${regNo})`);
    db.revision = (db.revision || 1) + 1;
    db.updatedAt = nowIso;
    saveDb(db);

    const newSess = createSession('student', stuId, name);
    return jsonResponse(200, {
      ok: true,
      token: newSess.token,
      role: 'student',
      student: newStu
    });
  }

  // 8. Auth: Student Change Password
  if (reqPath === '/api/auth/student/change-password' && method === 'POST') {
    if (!session) {
      return jsonResponse(401, { ok: false, error: 'Authentication required' });
    }
    const targetId = session.role === 'admin' && body.studentId ? String(body.studentId) : String(session.userId);
    const newPwd = String(body.newPassword || '');
    if (!newPwd || newPwd.length < 6) {
      return jsonResponse(400, { ok: false, error: 'New password must be at least 6 characters' });
    }
    if (session.role !== 'admin') {
      const curPwd = String(body.currentPassword || '');
      if (!curPwd) {
        return jsonResponse(400, { ok: false, error: 'Please enter your current password' });
      }
      const stored = auth.studentCredentials[targetId];
      if (!stored || !verifyPassword(curPwd, stored)) {
        return jsonResponse(401, { ok: false, error: 'Current password is incorrect' });
      }
    }

    auth.studentCredentials[targetId] = hashPassword(newPwd);
    saveAuth(auth);
    return jsonResponse(200, { ok: true });
  }

  // 9. Data: State GET
  if (reqPath === '/api/state' && method === 'GET') {
    return jsonResponse(200, sanitizeDbForClient(db));
  }

  // 10. Data: State PUT
  if (reqPath === '/api/state' && (method === 'PUT' || method === 'POST')) {
    if (!session || session.role !== 'admin') {
      return jsonResponse(403, { ok: false, error: 'Administrator authentication required' });
    }
    if (!body || typeof body !== 'object') {
      return jsonResponse(400, { error: 'Empty payload' });
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
    if (authUpdated) saveAuth(auth);

    if (Array.isArray(body.timetable)) {
      body.timetable.forEach((slot, idx) => {
        if (slot && !slot.id) {
          slot.id = `tt-${idx + 1}-${Date.now()}`;
        }
      });
    }

    body.revision = (db.revision || 1) + 1;
    body.updatedAt = new Date().toISOString();
    saveDb(body);

    return jsonResponse(200, { ok: true, revision: body.revision, updatedAt: body.updatedAt });
  }

  // 11. Student Action
  if (reqPath === '/api/student/action' && method === 'POST') {
    if (!session) {
      return jsonResponse(401, { ok: false, error: 'Authentication required' });
    }
    const action = String(body.action || '');

    if (action === 'updateAvatar') {
      const targetId = session.role === 'admin' && body.studentId ? String(body.studentId) : String(session.userId);
      const target = (db.students || []).find((s) => s && s.id === targetId);
      if (target) {
        target.avatarDataUrl = String(body.avatarDataUrl || '');
        db.revision = (db.revision || 1) + 1;
        db.updatedAt = new Date().toISOString();
        saveDb(db);
        return jsonResponse(200, { ok: true, revision: db.revision });
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
        saveDb(db);
        return jsonResponse(200, { ok: true, revision: db.revision });
      }
    }

    if (action === 'appendChatMessage') {
      db.chatMessages = [...(db.chatMessages || []), body.message];
      db.revision = (db.revision || 1) + 1;
      db.updatedAt = new Date().toISOString();
      saveDb(db);
      return jsonResponse(200, { ok: true, revision: db.revision });
    }

    if (action === 'clearChat') {
      db.chatMessages = [];
      db.revision = (db.revision || 1) + 1;
      db.updatedAt = new Date().toISOString();
      saveDb(db);
      return jsonResponse(200, { ok: true, revision: db.revision });
    }

    return jsonResponse(400, { ok: false, error: 'Unknown student action' });
  }

  // 12. Fallback
  return jsonResponse(404, { ok: false, error: `API endpoint not found: ${method} ${reqPath}` });
};
