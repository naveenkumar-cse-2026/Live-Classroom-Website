const STORAGE_KEY = 'live_ai_classroom_db_v1';
const SESSION_KEY = 'live_ai_classroom_student_session_v2';
const ADMIN_SESSION_KEY = 'live_ai_classroom_admin_session_v2';
const API_KEY_STORAGE = 'live_ai_classroom_gemini_key';
const CHANNEL_NAME = 'live-ai-classroom-sync';

const DEMO_IDS = {
  students: new Set(['stu-1', 'stu-2', 'stu-3', 'stu-4']),
  teachers: new Set(['tea-1', 'tea-2', 'tea-3']),
  staffIds: new Set(['STAFF-AI-014', 'STAFF-MATH-008', 'STAFF-CS-022']),
  departments: new Set(['dept-1', 'dept-2', 'dept-3', 'dept-4']),
  materials: new Set(['mat-1', 'mat-2', 'mat-3']),
  assignments: new Set(['asg-1', 'asg-2', 'asg-3']),
  notices: new Set(['not-1', 'not-2', 'not-3']),
  timetable: new Set([
    'tt-1', 'tt-2', 'tt-3', 'tt-4', 'tt-5',
    'tt-6', 'tt-7', 'tt-8', 'tt-9', 'tt-10',
    'tt-11', 'tt-12', 'tt-13', 'tt-14', 'tt-15',
  ]),
  liveClasses: new Set(['cls-1', 'cls-2']),
  chatMessages: new Set(['msg-1', 'msg-2']),
  activityLog: new Set(['act-1']),
};

export function getInitialSeed() {
  return {
    revision: 1,
    updatedAt: new Date().toISOString(),
    emergencyAlert: null,
    settings: {
      collegeName: '',
      shortName: 'Live AI Classroom',
      collegeCode: '',
      domain: '',
      address: '',
      logoDataUrl: '',
      adminProfile: {
        name: 'Administrator',
        designation: 'System Administrator',
        email: '',
        initials: 'AD',
      },
      autoTranscripts: true,
      scanAndSolveEnabled: true,
      aiEngineVersion: 'v4.2',
      lastCloudSync: '',
      departments: [],
      programs: [],
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
    activityLog: [],
  };
}

export function makeInitials(name = '') {
  const cleaned = String(name || '').replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').trim();
  if (!cleaned) return 'AD';
  const parts = cleaned.split(/\s+/);
  return ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}

export function formatTimeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function asArray(val) {
  if (Array.isArray(val)) return val;
  if (val === null || val === undefined) return [];
  return [val];
}

class RealTimeStore {
  constructor() {
    this.state = this._loadLocal() || getInitialSeed();
    this.listeners = new Set();
    this.syncMode = 'local';
    this.serverConnected = false;
    this.pollTimer = null;
    this.isSaving = false;
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

    if (this.channel) {
      this.channel.onmessage = (event) => {
        const msg = event.data;
        if (msg?.type === 'STATE_SYNC' && msg.state) {
          if ((msg.state.revision || 0) >= (this.state.revision || 0)) {
            this.state = this._sanitizeState(msg.state);
            this._saveLocal(this.state);
            this._notify(msg.eventNote || null);
          }
        }
      };
    }

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = this._sanitizeState(JSON.parse(e.newValue));
          if ((parsed.revision || 0) > (this.state.revision || 0)) {
            this.state = parsed;
            this._notify('Synced update from another window');
          }
        } catch {}
      }
    });
  }

  _sanitizeState(raw) {
    const seed = getInitialSeed();
    if (!raw || typeof raw !== 'object') return seed;
    const state = { ...seed, ...raw };
    state.settings = { ...seed.settings, ...(raw.settings || {}) };

    // Remove legacy fake Apex defaults if unmodified
    if (state.settings.collegeName === 'Apex Institute of Artificial Intelligence & Computation') {
      state.settings.collegeName = '';
    }
    if (state.settings.collegeCode === 'APEX-TECH-2026') {
      state.settings.collegeCode = '';
    }
    if (state.settings.domain === 'liveclassroom.edu') {
      state.settings.domain = '';
    }
    if (state.settings.address === '742 Innovation Way, Cyber-Academic District, Tech City 94016') {
      state.settings.address = '';
    }

    // Ensure adminProfile has no fake Dr. Alistair Ross data
    const ap = state.settings.adminProfile && typeof state.settings.adminProfile === 'object'
      ? { ...seed.settings.adminProfile, ...state.settings.adminProfile }
      : { ...seed.settings.adminProfile };
    if (/alistair|alister/i.test(ap.name || '')) ap.name = 'Administrator';
    if (/dean of academic/i.test(ap.designation || '')) ap.designation = 'System Administrator';
    ap.initials = makeInitials(ap.name);
    state.settings.adminProfile = ap;

    // Normalize & purge demo departments
    state.settings.departments = asArray(state.settings.departments)
      .filter((d) => d && !DEMO_IDS.departments.has(d.id))
      .map((d) => ({
        ...d,
        courses: asArray(d.courses).filter(Boolean),
      }));

    // Normalize programs
    state.settings.programs = asArray(state.settings.programs).filter(Boolean);

    // Normalize & purge demo students; ensure hasLoggedIn boolean exists and strip any plaintext passwords
    state.students = asArray(state.students)
      .filter((s) => s && !DEMO_IDS.students.has(s.id))
      .map((s) => {
        const copy = {
          ...s,
          hasLoggedIn: s.hasLoggedIn === true,
          lastLoginAt: s.lastLoginAt || null,
        };
        delete copy.password;
        delete copy._newPassword;
        return copy;
      });

    // Normalize & purge demo teachers
    state.teachers = asArray(state.teachers).filter(
      (t) => t && !DEMO_IDS.teachers.has(t.id) && !DEMO_IDS.staffIds.has(t.staffId)
    );

    // Normalize & purge demo materials, assignments, notices, events, timetable, liveClasses, chat, activity
    state.materials = asArray(state.materials).filter((m) => m && !DEMO_IDS.materials.has(m.id));
    state.assignments = asArray(state.assignments).filter((a) => a && !DEMO_IDS.assignments.has(a.id));
    state.notices = asArray(state.notices).filter((n) => n && !DEMO_IDS.notices.has(n.id));
    state.events = asArray(state.events).filter(Boolean);
    state.timetable = asArray(state.timetable)
      .filter((t) => t && !DEMO_IDS.timetable.has(t.id))
      .map((t, idx) => ({
        ...t,
        id: t.id && String(t.id).trim() ? String(t.id).trim() : `tt-slot-${idx + 1}`,
      }));
    state.liveClasses = asArray(state.liveClasses).filter((c) => c && !DEMO_IDS.liveClasses.has(c.id));
    state.chatMessages = asArray(state.chatMessages).filter((m) => m && !DEMO_IDS.chatMessages.has(m.id));
    state.activityLog = asArray(state.activityLog).filter((a) => a && !DEMO_IDS.activityLog.has(a.id));
    state.timetableImage = raw.timetableImage || null;

    return state;
  }

  _loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? this._sanitizeState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  _saveLocal(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // If a huge base64 upload exceeds localStorage quota (~5MB), store metadata-light copy locally while server holds full db.json
      try {
        const lite = {
          ...state,
          materials: (state.materials || []).map((m) => ({ ...m, fileDataUrl: '' })),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lite));
      } catch {}
    }
  }

  async init() {
    this.authApiReady = false;
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (res.ok && ct.includes('application/json')) {
          const rawServer = await res.json();
          const cleaned = this._sanitizeState(rawServer);
          this.state = cleaned;
          this.serverConnected = true;
          this.syncMode = 'live-server';
          try {
            const hRes = await fetch('/api/health', { cache: 'no-store' });
            const hCt = (hRes.headers.get('content-type') || '').toLowerCase();
            if (hRes.ok && hCt.includes('application/json')) {
              const health = await hRes.json();
              this.authApiReady = Boolean(health.authEnabled);
            }
          } catch {}
          this._saveLocal(this.state);
          await this._verifyStoredSessions();
          this._notify();
          this._startPolling();
          return;
        }
      } catch {
        this.serverConnected = false;
        this.syncMode = 'local';
      }
    }
    this._saveLocal(this.state);
    this._notify();
  }

  async _verifyStoredSessions() {
    // Verify Admin Token with backend
    const adminSess = this.getAdminSession();
    if (adminSess?.token) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'X-Auth-Token': adminSess.token },
          cache: 'no-store',
        });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (res.ok && ct.includes('application/json')) {
          const info = await res.json();
          if (info.authenticated && info.role === 'admin') {
            this.setAdminSession({
              ...adminSess,
              name: info.name,
              mustChangePassword: !!info.mustChangePassword,
            });
          } else {
            this.clearAdminSession();
          }
        } else {
          this.clearAdminSession();
        }
      } catch {
        this.clearAdminSession();
      }
    }

    // Verify Student Token with backend
    const stuSess = this.getSession();
    if (stuSess?.token) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'X-Auth-Token': stuSess.token },
          cache: 'no-store',
        });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok || !ct.includes('application/json')) {
          this.clearSession();
        } else {
          const info = await res.json();
          if (!info.authenticated || info.role !== 'student') {
            this.clearSession();
          }
        }
      } catch {
        this.clearSession();
      }
    } else if (stuSess?.studentId) {
      // Legacy tokenless session from before backend auth -> force fresh secure login
      this.clearSession();
    }
  }

  _startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (this.isSaving) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const info = await res.json();
        if (info.revision > (this.state.revision || 0)) {
          const stateRes = await fetch('/api/state', { cache: 'no-store' });
          if (stateRes.ok) {
            const fresh = this._sanitizeState(await stateRes.json());
            const latestAct = fresh.activityLog?.[0]?.text || null;
            this.state = fresh;
            this._saveLocal(this.state);
            this._notify(latestAct);
          }
        }
        this.serverConnected = true;
      } catch {
        this.serverConnected = false;
      }
    }, 1500);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify(remoteNote = null) {
    for (const fn of this.listeners) {
      try { fn(this.state, remoteNote); } catch (err) { console.error(err); }
    }
  }

  async mutate(mutatorFn, activityNote = '') {
    mutatorFn(this.state);
    this.state.revision = (this.state.revision || 0) + 1;
    this.state.updatedAt = new Date().toISOString();
    if (activityNote) {
      this.state.activityLog = [
        { id: 'act-' + Date.now(), time: this.state.updatedAt, text: activityNote },
        ...(this.state.activityLog || []).slice(0, 29),
      ];
    }

    // Prepare payload for backend (may contain transient _newPassword for newly added/updated student)
    const payloadToSend = JSON.stringify(this.state);

    // Strip any transient _newPassword from local state & localStorage immediately
    if (Array.isArray(this.state.students)) {
      this.state.students.forEach((s) => {
        if (s) {
          delete s._newPassword;
          delete s.password;
        }
      });
    }

    this._saveLocal(this.state);
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'STATE_SYNC', state: this.state, eventNote: activityNote });
      } catch {}
    }
    this._notify();

    if (this.serverConnected) {
      const adminToken = this.getAdminSession()?.token || '';
      this.isSaving = true;
      try {
        const res = await fetch('/api/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(adminToken ? { 'X-Auth-Token': adminToken } : {}),
          },
          body: payloadToSend,
        });
        if (res.ok) {
          const meta = await res.json();
          this.state.revision = meta.revision;
          this.state.updatedAt = meta.updatedAt;
          this._saveLocal(this.state);
        } else if (res.status === 403 || res.status === 401) {
          throw new Error('Administrator authentication required.');
        }
      } finally {
        this.isSaving = false;
      }
    }
  }

  async _refreshFromServer({ silent = false } = {}) {
    if (!this.serverConnected) return;
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (res.ok && ct.includes('application/json')) {
        this.state = this._sanitizeState(await res.json());
        this._saveLocal(this.state);
        if (!silent) this._notify();
      }
    } catch {}
  }

  async _parseApiResponse(res, fallbackError) {
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const rawText = await res.text().catch(() => '');
    const trimmed = rawText.trim();
    if (contentType.includes('text/html') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return {
        ok: false,
        error: isLocal
          ? 'Backend server needs restart (an outdated or static server responded instead of the auth API). Close any old server window and run Start-LiveClassroom.bat.'
          : 'Backend authentication service is initializing or temporarily unreachable. Please verify Netlify Functions deployment.',
      };
    }
    if (!trimmed) {
      return { ok: false, error: `${fallbackError} (HTTP ${res.status})` };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
    return { ok: false, error: `${fallbackError} (HTTP ${res.status})` };
  }

  _ensureHttpProtocol() {
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
      return {
        ok: false,
        error: 'Please open the app through http:// or https:// (not directly from a local file:// path).',
      };
    }
    return null;
  }

  _markBackendReachable() {
    this.serverConnected = true;
    this.authApiReady = true;
    this.syncMode = 'live-server';
    if (!this.pollTimer) this._startPolling();
  }

  // Student Session helpers
  getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { role: 'student', studentId: null, token: null };
  }

  setSession(session) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
  }

  clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  isStudentAuthenticated() {
    const sess = this.getSession();
    return Boolean(sess?.token && sess?.studentId && this.state.students.some((s) => s.id === sess.studentId));
  }

  // Admin Session helpers (strictly separated from Student Session)
  getAdminSession() {
    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  setAdminSession(session) {
    try {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    } catch {}
  }

  clearAdminSession() {
    try {
      localStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {}
  }

  isAdminAuthenticated() {
    const sess = this.getAdminSession();
    return Boolean(sess?.token && sess?.role === 'admin');
  }

  /* ================= BACKEND AUTHENTICATION API ================= */
  async loginAdmin(name, password) {
    const protoErr = this._ensureHttpProtocol();
    if (protoErr) return protoErr;
    let res;
    try {
      res = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
    } catch {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      return { ok: false, error: isLocal ? 'Cannot reach backend server on localhost. Please run Start-LiveClassroom.bat.' : 'Cannot reach backend server. Please check your network connection.' };
    }
    const data = await this._parseApiResponse(res, 'Admin sign-in error');
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Invalid administrator name or password' };
    }
    this._markBackendReachable();
    this.setAdminSession({
      role: 'admin',
      token: data.token,
      name: data.admin?.name || name,
      designation: data.admin?.designation || 'Administrator',
      mustChangePassword: !!data.admin?.mustChangePassword,
    });
    await this._refreshFromServer({ silent: true });
    return { ok: true, admin: data.admin };
  }

  async changeAdminPassword(currentPassword, newPassword) {
    const protoErr = this._ensureHttpProtocol();
    if (protoErr) return protoErr;
    const token = this.getAdminSession()?.token;
    if (!token) return { ok: false, error: 'Administrator authentication required' };
    let res;
    try {
      res = await fetch('/api/auth/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch {
      return { ok: false, error: 'Cannot reach backend server. Please ensure Start-LiveClassroom.bat is running.' };
    }
    const data = await this._parseApiResponse(res, 'Password update failed');
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Failed to update password' };
    }
    const cur = this.getAdminSession();
    if (cur) this.setAdminSession({ ...cur, mustChangePassword: false });
    await this._refreshFromServer();
    return { ok: true };
  }

  async logoutAdmin() {
    const token = this.getAdminSession()?.token;
    if (token && this.serverConnected) {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Auth-Token': token } });
      } catch {}
    }
    this.clearAdminSession();
  }

  async loginStudent(identifier, password) {
    if (!identifier) return { ok: false, error: 'Please enter your register number, email, or name' };
    if (!password) return { ok: false, error: 'Please enter your password' };
    const protoErr = this._ensureHttpProtocol();
    if (protoErr) return protoErr;
    let res;
    try {
      res = await fetch('/api/auth/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
    } catch {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      return { ok: false, error: isLocal ? 'Cannot reach backend server on localhost. Please run Start-LiveClassroom.bat.' : 'Cannot reach backend server. Please check your network connection.' };
    }
    const data = await this._parseApiResponse(res, 'Student sign-in error');
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Incorrect Password' };
    }
    this._markBackendReachable();
    this.setSession({ role: 'student', studentId: data.student.id, token: data.token });
    await this._refreshFromServer({ silent: true });
    return { ok: true, student: data.student };
  }

  async registerStudentAccount(payload) {
    const protoErr = this._ensureHttpProtocol();
    if (protoErr) return protoErr;
    let res;
    try {
      res = await fetch('/api/auth/student/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      return { ok: false, error: isLocal ? 'Cannot reach backend server on localhost. Please run Start-LiveClassroom.bat.' : 'Cannot reach backend server. Please check your network connection.' };
    }
    const data = await this._parseApiResponse(res, 'Registration failed');
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Registration failed' };
    }
    this._markBackendReachable();
    this.setSession({ role: 'student', studentId: data.student.id, token: data.token });
    await this._refreshFromServer({ silent: true });
    return { ok: true, student: data.student };
  }

  async changeStudentPassword(currentPassword, newPassword) {
    const protoErr = this._ensureHttpProtocol();
    if (protoErr) return protoErr;
    const token = this.getSession()?.token;
    if (!token) return { ok: false, error: 'Please sign in again' };
    let res;
    try {
      res = await fetch('/api/auth/student/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch {
      return { ok: false, error: 'Cannot reach backend server. Please ensure Start-LiveClassroom.bat is running.' };
    }
    const data = await this._parseApiResponse(res, 'Failed to update password');
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Failed to update password' };
    }
    return { ok: true };
  }

  async logoutStudent() {
    const token = this.getSession()?.token;
    if (token && this.serverConnected) {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Auth-Token': token } });
      } catch {}
    }
    this.clearSession();
  }

  async _studentAction(body) {
    const token = this.getSession()?.token || this.getAdminSession()?.token || '';
    if (!this.serverConnected || !token) return false;
    const res = await fetch('/api/student/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      await this._refreshFromServer();
      return true;
    }
    return false;
  }

  getCurrentStudent() {
    const sess = this.getSession();
    if (sess?.token && sess?.studentId) {
      const match = this.state.students.find((s) => s.id === sess.studentId);
      if (match && match.status !== 'Deactivated') return match;
    }
    return null;
  }

  getActiveStudents() {
    return (this.state.students || []).filter(
      (s) => s.hasLoggedIn === true && s.status !== 'Deactivated'
    );
  }

  getGeminiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  }

  setGeminiKey(key) {
    localStorage.setItem(API_KEY_STORAGE, (key || '').trim());
  }

  /* ================= STUDENT CRUD ================= */
  async registerOrAddStudent(payload, { markLoggedIn = false } = {}) {
    const id = 'stu-' + Date.now();
    const nowIso = new Date().toISOString();
    const student = {
      id,
      name: (payload.name || '').trim(),
      initials: makeInitials(payload.name),
      email: (payload.email || '').trim(),
      regNo: (payload.regNo || '').trim().toUpperCase(),
      department: (payload.department || '').trim(),
      program: (payload.program || '').trim(),
      year: payload.year || 'Year 1',
      section: payload.section || 'Sec A',
      semester: payload.semester || 'Semester 1',
      cgpa: payload.cgpa || '—',
      attendance: payload.attendance ?? 0,
      aiScore: payload.aiScore || '—',
      creditsCleared: payload.creditsCleared || '—',
      status: payload.status || (markLoggedIn ? 'Active' : 'Registered'),
      hasLoggedIn: !!markLoggedIn,
      lastLoginAt: markLoggedIn ? nowIso : null,
      aiProvisioned: payload.aiProvisioned !== false,
      _newPassword: payload.password || '',
      avatarDataUrl: payload.avatarDataUrl || '',
    };
    await this.mutate((s) => {
      s.students.unshift(student);
    }, `Added student ${student.name} (${student.regNo})`);
    return student;
  }

  async updateOwnAvatar(studentId, avatarDataUrl) {
    if (this.serverConnected) {
      const ok = await this._studentAction({ action: 'updateAvatar', studentId, avatarDataUrl });
      if (ok) return;
    }
    const target = this.state.students.find((x) => x.id === studentId);
    if (target) {
      target.avatarDataUrl = avatarDataUrl;
      this._saveLocal(this.state);
      this._notify();
    }
  }

  async updateStudent(id, patch) {
    const cleanPatch = { ...patch };
    if (cleanPatch.password) {
      cleanPatch._newPassword = cleanPatch.password;
      delete cleanPatch.password;
    }
    await this.mutate((s) => {
      const target = s.students.find((x) => x.id === id);
      if (!target) return;
      Object.assign(target, cleanPatch);
      if (cleanPatch.name) target.initials = makeInitials(cleanPatch.name);
    }, `Updated student record`);
  }

  async deleteStudent(id) {
    let removedName = '';
    await this.mutate((s) => {
      const idx = s.students.findIndex((x) => x.id === id);
      if (idx >= 0) {
        removedName = s.students[idx].name;
        s.students.splice(idx, 1);
      }
    }, removedName ? `Removed student ${removedName}` : '');
    const sess = this.getSession();
    if (sess.studentId === id) this.clearSession();
  }

  /* ================= TEACHER CRUD ================= */
  async addTeacher(payload) {
    const status = payload.status || 'Offline';
    const hall = (payload.hall || '').trim();
    const teacher = {
      id: 'tea-' + Date.now(),
      name: (payload.name || '').trim(),
      initials: makeInitials(payload.name),
      staffId: (payload.staffId || '').trim() || `STAFF-${String(Date.now()).slice(-4)}`,
      email: (payload.email || '').trim(),
      department: (payload.department || '').trim(),
      course: (payload.course || '').trim(),
      hall,
      status,
      statusBadge: status === 'Streaming Live' ? (hall ? `Live in ${hall}` : 'Live') : status,
      classesToday: Math.max(0, Number(payload.classesToday) || 0),
      onlineStudents: 0,
      accent: 'purple',
    };
    await this.mutate((s) => {
      s.teachers.unshift(teacher);
    }, `Added teacher ${teacher.name}`);
    return teacher;
  }

  async updateTeacher(id, patch) {
    await this.mutate((s) => {
      const t = s.teachers.find((x) => x.id === id);
      if (!t) return;
      Object.assign(t, patch);
      if (patch.name) t.initials = makeInitials(patch.name);
      if (patch.status !== undefined || patch.hall !== undefined) {
        t.statusBadge = t.status === 'Streaming Live' ? (t.hall ? `Live in ${t.hall}` : 'Live') : t.status;
      }
    }, `Updated teacher record`);
  }

  async deleteTeacher(id) {
    let removedName = '';
    await this.mutate((s) => {
      const idx = s.teachers.findIndex((x) => x.id === id);
      if (idx >= 0) {
        removedName = s.teachers[idx].name;
        s.teachers.splice(idx, 1);
      }
    }, removedName ? `Removed teacher ${removedName}` : '');
  }

  async toggleTeacherLive(id) {
    let note = '';
    await this.mutate((s) => {
      const t = s.teachers.find((x) => x.id === id);
      if (!t) return;
      if (t.status === 'Streaming Live') {
        t.status = 'Offline';
        t.statusBadge = 'Offline';
        t.onlineStudents = 0;
        note = `${t.name} ended live stream${t.hall ? ` in ${t.hall}` : ''}`;
      } else {
        t.status = 'Streaming Live';
        t.statusBadge = t.hall ? `Live in ${t.hall}` : 'Live';
        t.onlineStudents = 0;
        note = `${t.name} started live broadcast${t.hall ? ` in ${t.hall}` : ''}`;
      }
    }, note);
  }

  /* ================= DEPARTMENTS & PROGRAMS CRUD ================= */
  async addDepartment(dept) {
    const item = {
      id: 'dept-' + Date.now(),
      code: (dept.code || '').trim().toUpperCase() || `DEPT-${String(Date.now()).slice(-3)}`,
      name: (dept.name || '').trim(),
      shortName: (dept.shortName || dept.name || '').trim(),
      hod: (dept.hod || '').trim(),
      years: Number(dept.years) || 4,
      courses: typeof dept.courses === 'string'
        ? dept.courses.split(',').map((c) => c.trim()).filter(Boolean)
        : asArray(dept.courses),
    };
    await this.mutate((s) => {
      s.settings.departments.push(item);
    }, `Added department ${item.name}`);
    return item;
  }

  async updateDepartment(id, patch) {
    let oldShort = '';
    let newShort = '';
    await this.mutate((s) => {
      const d = s.settings.departments.find((x) => x.id === id);
      if (!d) return;
      oldShort = d.shortName || d.name;
      Object.assign(d, {
        ...patch,
        code: (patch.code ?? d.code).trim().toUpperCase(),
        name: (patch.name ?? d.name).trim(),
        shortName: (patch.shortName ?? patch.name ?? d.shortName).trim(),
        hod: (patch.hod ?? d.hod).trim(),
        courses: typeof patch.courses === 'string'
          ? patch.courses.split(',').map((c) => c.trim()).filter(Boolean)
          : patch.courses ? asArray(patch.courses) : d.courses,
      });
      newShort = d.shortName || d.name;
      // Safely update references if department was renamed
      if (oldShort && newShort && oldShort !== newShort) {
        s.students.forEach((stu) => { if (stu.department === oldShort) stu.department = newShort; });
        s.teachers.forEach((tea) => { if (tea.department === oldShort) tea.department = newShort; });
        s.settings.programs.forEach((p) => { if (p.department === oldShort) p.department = newShort; });
      }
    }, `Updated department ${newShort || ''}`);
  }

  async deleteDepartment(id) {
    let removedName = '';
    await this.mutate((s) => {
      const idx = s.settings.departments.findIndex((x) => x.id === id);
      if (idx >= 0) {
        removedName = s.settings.departments[idx].name;
        s.settings.departments.splice(idx, 1);
      }
    }, removedName ? `Deleted department ${removedName}` : '');
  }

  async addProgram(prog) {
    const item = {
      id: 'prog-' + Date.now(),
      code: (prog.code || '').trim().toUpperCase(),
      name: (prog.name || '').trim(),
      level: (prog.level || 'Undergraduate').trim(),
      duration: (prog.duration || '4 Years').trim(),
      department: (prog.department || '').trim(),
    };
    await this.mutate((s) => {
      s.settings.programs.push(item);
    }, `Added academic program ${item.name}`);
    return item;
  }

  async updateProgram(id, patch) {
    await this.mutate((s) => {
      const p = s.settings.programs.find((x) => x.id === id);
      if (!p) return;
      Object.assign(p, {
        ...patch,
        code: (patch.code ?? p.code).trim().toUpperCase(),
        name: (patch.name ?? p.name).trim(),
        level: (patch.level ?? p.level).trim(),
        duration: (patch.duration ?? p.duration).trim(),
        department: (patch.department ?? p.department).trim(),
      });
    }, `Updated academic program`);
  }

  async deleteProgram(id) {
    let removedName = '';
    await this.mutate((s) => {
      const idx = s.settings.programs.findIndex((x) => x.id === id);
      if (idx >= 0) {
        removedName = s.settings.programs[idx].name;
        s.settings.programs.splice(idx, 1);
      }
    }, removedName ? `Deleted academic program ${removedName}` : '');
  }

  /* ================= MATERIALS, NOTICES & ASSIGNMENTS CRUD ================= */
  async addMaterial(payload) {
    const mat = {
      id: 'mat-' + Date.now(),
      course: (payload.course || '').trim(),
      courseTag: [payload.course, payload.module].filter(Boolean).join(' • ') || 'Study Material',
      title: (payload.title || '').trim(),
      author: (payload.author || this.state.settings.adminProfile?.name || 'Administrator').trim(),
      meta: payload.meta || payload.fileName || 'Document',
      type: payload.type || 'pdf',
      verified: true,
      size: payload.size || '',
      summary: (payload.summary || '').trim(),
      fileName: payload.fileName || '',
      mimeType: payload.mimeType || '',
      fileDataUrl: payload.fileDataUrl || '',
      uploadedAt: formatTimeNow(),
    };
    await this.mutate((s) => {
      s.materials.unshift(mat);
    }, `Uploaded study material: ${mat.title}`);
    return mat;
  }

  async updateMaterial(id, patch) {
    await this.mutate((s) => {
      const m = s.materials.find((x) => x.id === id);
      if (!m) return;
      Object.assign(m, patch);
      if (patch.course !== undefined || patch.module !== undefined) {
        m.courseTag = [m.course, patch.module || 'Study Material'].filter(Boolean).join(' • ');
      }
    }, `Updated study material`);
  }

  async deleteMaterial(id) {
    let title = '';
    await this.mutate((s) => {
      const idx = s.materials.findIndex((x) => x.id === id);
      if (idx >= 0) {
        title = s.materials[idx].title;
        s.materials.splice(idx, 1);
      }
    }, title ? `Deleted study material: ${title}` : '');
  }

  async publishNotice(payload) {
    const notice = {
      id: 'not-' + Date.now(),
      category: (payload.category || 'OFFICIAL NOTICE').trim().toUpperCase(),
      tagColor: payload.tagColor || 'purple',
      title: (payload.title || '').trim(),
      body: (payload.body || '').trim(),
      timeLabel: formatTimeNow(),
      createdAt: new Date().toISOString(),
      hasAttachment: !!payload.hasAttachment,
    };
    await this.mutate((s) => {
      s.notices.unshift(notice);
    }, `Published notice: ${notice.title}`);
    return notice;
  }

  async updateNotice(id, patch) {
    await this.mutate((s) => {
      const n = s.notices.find((x) => x.id === id);
      if (!n) return;
      Object.assign(n, patch);
      if (patch.category) n.category = patch.category.trim().toUpperCase();
    }, `Updated notice`);
  }

  async deleteNotice(id) {
    let title = '';
    await this.mutate((s) => {
      const idx = s.notices.findIndex((x) => x.id === id);
      if (idx >= 0) {
        title = s.notices[idx].title;
        s.notices.splice(idx, 1);
      }
    }, title ? `Deleted notice: ${title}` : '');
  }

  async addAssignment(payload) {
    const asg = {
      id: 'asg-' + Date.now(),
      course: (payload.course || 'GENERAL').trim().toUpperCase(),
      title: (payload.title || '').trim(),
      description: (payload.description || '').trim(),
      dueLabel: (payload.dueLabel || 'Open').trim(),
      points: Number(payload.points) || 100,
      status: 'Pending',
      aiPrecheck: true,
      score: null,
      feedback: '',
      submissionFile: '',
    };
    await this.mutate((s) => {
      s.assignments.unshift(asg);
    }, `Posted assignment: ${asg.title}`);
    return asg;
  }

  async updateAssignment(id, patch) {
    await this.mutate((s) => {
      const a = s.assignments.find((x) => x.id === id);
      if (!a) return;
      Object.assign(a, patch);
    }, `Updated assignment`);
  }

  async deleteAssignment(id) {
    let title = '';
    await this.mutate((s) => {
      const idx = s.assignments.findIndex((x) => x.id === id);
      if (idx >= 0) {
        title = s.assignments[idx].title;
        s.assignments.splice(idx, 1);
      }
    }, title ? `Deleted assignment: ${title}` : '');
  }

  async submitAssignment(id, { fileName, score, feedback }) {
    if (this.serverConnected) {
      const ok = await this._studentAction({ action: 'submitAssignment', assignmentId: id, fileName, score, feedback });
      if (ok) return;
    }
    let title = '';
    await this.mutate((s) => {
      const asg = s.assignments.find((x) => x.id === id);
      if (!asg) return;
      title = asg.title;
      asg.status = 'Graded';
      asg.dueLabel = 'Submitted';
      asg.submissionFile = fileName;
      asg.score = score;
      asg.feedback = feedback;
    }, `AI Graded submission for ${title} (${score}/100)`);
  }

  /* ================= TIMETABLE & EVENTS CRUD ================= */
  async upsertTimetableSlot(payload) {
    const cleanPayload = { ...payload };
    const providedId = cleanPayload.id && String(cleanPayload.id).trim() ? String(cleanPayload.id).trim() : null;
    delete cleanPayload.id;

    await this.mutate((s) => {
      if (providedId) {
        const existing = s.timetable.find((x) => x.id === providedId);
        if (existing) {
          Object.assign(existing, cleanPayload, { id: providedId });
        } else {
          s.timetable.push({ ...cleanPayload, id: providedId });
        }
      } else {
        const existing = s.timetable.find(
          (x) => x.day === cleanPayload.day && x.slot === cleanPayload.slot && (x.department || '') === (cleanPayload.department || '')
        );
        if (existing) {
          const keepId = existing.id && String(existing.id).trim()
            ? existing.id
            : `tt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          Object.assign(existing, cleanPayload, { id: keepId });
        } else {
          const newId = `tt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          s.timetable.push({ ...cleanPayload, id: newId });
        }
      }
      if (cleanPayload.live) {
        const exists = s.liveClasses.find((c) => c.code === cleanPayload.code && c.title === cleanPayload.title);
        if (!exists) {
          s.liveClasses.unshift({
            id: 'cls-' + Date.now(),
            code: cleanPayload.code || 'LIVE',
            title: cleanPayload.title,
            instructor: cleanPayload.instructor || cleanPayload.meta || '',
            room: cleanPayload.room || '',
            timeRange: cleanPayload.slot,
            status: 'LIVE',
            aiStatus: 'Live Session',
            feature: 'Live AI Transcription Ready',
            studentsOnline: 0,
            transcript: [],
            qa: [],
          });
        }
      }
    }, `Saved timetable entry: ${cleanPayload.title} (${cleanPayload.day} ${cleanPayload.slot})`);
  }

  async deleteTimetableSlot(id) {
    let title = '';
    await this.mutate((s) => {
      const idx = s.timetable.findIndex((x) => x.id === id);
      if (idx >= 0) {
        title = s.timetable[idx].title;
        s.timetable.splice(idx, 1);
      }
    }, title ? `Removed timetable entry: ${title}` : '');
  }

  async setTimetableImage({ dataUrl, fileName, caption = '' }) {
    await this.mutate((s) => {
      s.timetableImage = {
        dataUrl,
        fileName: fileName || 'college-timetable.png',
        caption: caption.trim(),
        uploadedAt: new Date().toISOString(),
      };
    }, `Uploaded official college timetable image (${fileName || 'timetable'})`);
  }

  async removeTimetableImage() {
    await this.mutate((s) => {
      s.timetableImage = null;
    }, 'Removed uploaded college timetable image');
  }

  async addEvent(ev) {
    const item = {
      id: 'ev-' + Date.now(),
      title: (ev.title || '').trim(),
      date: (ev.date || '').trim(),
      time: (ev.time || '').trim(),
      venue: (ev.venue || '').trim(),
      description: (ev.description || '').trim(),
    };
    await this.mutate((s) => {
      s.events.unshift(item);
    }, `Added campus event: ${item.title}`);
    return item;
  }

  async updateEvent(id, patch) {
    await this.mutate((s) => {
      const e = s.events.find((x) => x.id === id);
      if (!e) return;
      Object.assign(e, patch);
    }, `Updated campus event`);
  }

  async deleteEvent(id) {
    let title = '';
    await this.mutate((s) => {
      const idx = s.events.findIndex((x) => x.id === id);
      if (idx >= 0) {
        title = s.events[idx].title;
        s.events.splice(idx, 1);
      }
    }, title ? `Deleted campus event: ${title}` : '');
  }

  /* ================= SETTINGS, ALERTS, LIVE ROOM & CHAT ================= */
  async updateSettings(patch) {
    await this.mutate((s) => {
      Object.assign(s.settings, patch);
    }, 'Updated college architecture & AI settings');
  }

  async updateAdminProfile(profilePatch) {
    await this.mutate((s) => {
      const next = {
        ...(s.settings.adminProfile || {}),
        name: (profilePatch.name || 'Administrator').trim(),
        designation: (profilePatch.designation || 'System Administrator').trim(),
        email: (profilePatch.email || '').trim(),
      };
      next.initials = makeInitials(next.name);
      s.settings.adminProfile = next;
    }, `Updated administrator profile (${profilePatch.name || 'Administrator'})`);
  }

  async broadcastAlert(title, message, severity = 'urgent') {
    await this.mutate((s) => {
      s.emergencyAlert = {
        id: 'alert-' + Date.now(),
        title: title.trim(),
        message: message.trim(),
        severity,
        sentAt: formatTimeNow(),
      };
    }, `EMERGENCY BROADCAST: ${title}`);
  }

  async dismissAlert() {
    await this.mutate((s) => {
      s.emergencyAlert = null;
    }, 'Cleared emergency campus alert');
  }

  async postLiveQA(classId, author, regNo, text) {
    if (this.serverConnected) {
      const ok = await this._studentAction({ action: 'postLiveQA', classId, regNo, text });
      if (ok) return;
    }
    const cls = this.state.liveClasses.find((c) => c.id === classId);
    if (!cls) return;
    cls.qa = cls.qa || [];
    cls.qa.push({ id: 'qa-' + Date.now(), author, regNo, text: text.trim(), time: formatTimeNow() });
    this._saveLocal(this.state);
    this._notify();
  }

  async appendLiveTranscript(classId, speaker, text) {
    await this.mutate((s) => {
      const cls = s.liveClasses.find((c) => c.id === classId);
      if (!cls) return;
      cls.transcript = cls.transcript || [];
      cls.transcript.push({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        speaker,
        text,
      });
    });
  }

  async appendChatMessage(msg) {
    const entry = {
      id: 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      time: formatTimeNow(),
      ...msg,
    };
    if (this.serverConnected && (this.getSession()?.token || this.getAdminSession()?.token)) {
      const ok = await this._studentAction({ action: 'appendChatMessage', message: entry });
      if (ok) return;
    }
    this.state.chatMessages = [...(this.state.chatMessages || []), entry];
    this._saveLocal(this.state);
    this._notify();
  }

  async clearChat() {
    if (this.serverConnected && (this.getSession()?.token || this.getAdminSession()?.token)) {
      const ok = await this._studentAction({ action: 'clearChat' });
      if (ok) return;
    }
    this.state.chatMessages = [];
    this._saveLocal(this.state);
    this._notify();
  }

  async syncCloudModels() {
    await this.mutate((s) => {
      s.settings.lastCloudSync = new Date().toISOString();
    }, 'Synchronized AI models with University Cloud (v4.2)');
  }
}

export const store = new RealTimeStore();
