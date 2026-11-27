import { store } from './store.js';
import { esc, showToast, renderSyncPill } from './ui.js';

function bindPasswordToggle(btn, input) {
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = isHidden ? 'visibility_off' : 'visibility';
    btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    btn.setAttribute('aria-pressed', String(isHidden));
  });
}

/* =========================================================================
   STUDENT LOGIN & REGISTRATION (#auth)
   ========================================================================= */
export function renderAuthView(container) {
  const { settings } = store.state;
  const departments = settings.departments || [];
  const programs = settings.programs || [];
  const domain = settings.domain || 'college.edu';

  container.innerHTML = `
    <div class="theme-student min-h-screen">
      <div class="student-shell-narrow flex flex-col justify-between p-5 min-h-screen">
        <!-- Top Brand Header -->
        <header class="pt-6 pb-2 text-center space-y-3">
          <div class="flex justify-center mb-1">${renderSyncPill()}</div>
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2563EB] via-[#4F46E5] to-[#7C3AED] p-[2px] shadow-md mx-auto">
            <div class="w-full h-full rounded-[14px] bg-white flex items-center justify-center overflow-hidden">
              ${settings.logoDataUrl
                ? `<img src="${esc(settings.logoDataUrl)}" class="w-full h-full object-cover" alt="Crest" />`
                : `<span class="material-symbols-outlined text-[30px] text-[#4F46E5]">school</span>`}
            </div>
          </div>

          <div>
            <h1 class="font-headline text-2xl font-bold text-[#1E1B4B] tracking-tight">${esc(settings.shortName || 'Live AI Classroom')}</h1>
            <p class="text-slate-500 text-xs mt-1">${esc(settings.collegeName || 'Academic Learning Portal')}</p>
          </div>

          <!-- Segmented Tab -->
          <div class="p-1 rounded-xl bg-white border border-indigo-100 shadow-xs flex max-w-xs mx-auto mt-4">
            <button id="loginTabBtn" type="button" class="btn-3d flex-1 py-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#4F46E5] text-white text-xs font-label font-semibold shadow-sm transition-all">
              Student Sign In
            </button>
            <button id="registerTabBtn" type="button" class="btn-3d flex-1 py-2 rounded-lg text-slate-500 hover:text-[#1E1B4B] text-xs font-label transition-all">
              New Registration
            </button>
          </div>
        </header>

        <!-- Main Form Container -->
        <main class="my-auto py-4">
          <!-- STUDENT LOGIN PANEL -->
          <div id="loginPanel" class="student-card card-3d p-6 space-y-4">
            <div class="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 class="font-headline text-lg font-bold text-[#1E1B4B]">Student Access</h2>
                <p class="text-slate-500 text-xs">Sign in with your registered credentials</p>
              </div>
              <span class="w-9 h-9 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center">
                <span class="material-symbols-outlined text-[20px]">lock</span>
              </span>
            </div>

            <div id="studentLoginError" role="alert" class="hidden p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-label flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-rose-600 shrink-0">error</span>
              <span id="studentLoginErrorText"></span>
            </div>

            <form id="studentLoginForm" novalidate class="space-y-4">
              <div>
                <label for="loginIdentifier" class="block text-xs font-semibold text-slate-600 mb-1.5">Register No., Email, or Full Name</label>
                <div class="relative flex items-center">
                  <span class="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px] pointer-events-none">badge</span>
                  <input id="loginIdentifier" type="text" autocomplete="username" placeholder="Enter register no., email, or name" class="glass-input w-full pl-10 pr-4 py-2.5 text-sm font-code placeholder-slate-400" />
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label for="loginPassword" class="block text-xs font-semibold text-slate-600">Password</label>
                  <button id="forgotPwdBtn" type="button" class="text-xs font-code text-[#4F46E5] hover:underline">Forgot?</button>
                </div>
                <div class="relative flex items-center">
                  <span class="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px] pointer-events-none">key</span>
                  <input id="loginPassword" type="password" autocomplete="current-password" placeholder="Enter password" class="glass-input w-full pl-10 pr-12 py-2.5 text-sm font-code placeholder-slate-400" />
                  <button id="togglePwdBtn" type="button" aria-label="Show password" aria-pressed="false" class="btn-3d absolute right-1.5 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#1E1B4B] hover:bg-slate-100 touch-manipulation">
                    <span class="material-symbols-outlined text-[20px]">visibility</span>
                  </button>
                </div>
              </div>

              <button id="studentLoginSubmitBtn" type="submit" class="btn-3d w-full py-3 rounded-xl bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#7C3AED] text-white font-label font-semibold text-sm shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                <span id="studentLoginBtnIcon" class="material-symbols-outlined text-[18px]">login</span>
                <span id="studentLoginBtnText">Sign In to Student Portal</span>
              </button>
            </form>

            <div class="pt-3 border-t border-slate-100 text-center">
              <a href="#admin/login" class="inline-flex items-center gap-1.5 text-xs font-label text-slate-500 hover:text-[#2563EB] transition-colors">
                <span class="material-symbols-outlined text-[15px] text-[#2563EB]">admin_panel_settings</span>
                <span>Administrator Login →</span>
              </a>
            </div>
          </div>

          <!-- STUDENT REGISTER PANEL -->
          <div id="registerPanel" class="hidden student-card card-3d p-6 space-y-4">
            <div class="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 class="font-headline text-lg font-bold text-[#1E1B4B]">Student Registration</h2>
                <p class="text-slate-500 text-xs">Create your student account</p>
              </div>
              <span class="w-9 h-9 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center">
                <span class="material-symbols-outlined text-[20px]">how_to_reg</span>
              </span>
            </div>

            <div id="studentRegError" role="alert" class="hidden p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-label flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-rose-600 shrink-0">error</span>
              <span id="studentRegErrorText"></span>
            </div>

            <form id="studentRegisterForm" class="space-y-3.5">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                <input id="regName" type="text" required placeholder="Enter full name" class="glass-input w-full px-3.5 py-2 text-xs placeholder-slate-400" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Institutional Email</label>
                <input id="regEmail" type="email" required placeholder="student@${esc(domain)}" class="glass-input w-full px-3.5 py-2 text-xs placeholder-slate-400" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
                <input id="regPhone" type="tel" autocomplete="tel" placeholder="e.g. +91 9876543210" pattern="[0-9+\-\s()]{7,15}" class="glass-input w-full px-3.5 py-2 text-xs placeholder-slate-400" />
              </div>

              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">Register Number</label>
                  <input id="regNo" type="text" required placeholder="Enter register no." class="glass-input w-full px-3 py-2 text-xs font-code placeholder-slate-400" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">Section</label>
                  <input id="regSection" type="text" value="Sec A" placeholder="e.g. Sec A" class="glass-input w-full px-3 py-2 text-xs" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">Department</label>
                  ${departments.length > 0 ? `
                    <select id="regDept" required class="glass-input w-full px-2.5 py-2 text-xs">
                      <option value="">Select department</option>
                      ${departments.map((d) => `<option value="${esc(d.shortName || d.name)}">${esc(d.shortName || d.name)}</option>`).join('')}
                    </select>
                  ` : `
                    <input id="regDept" type="text" required placeholder="Enter department" class="glass-input w-full px-3 py-2 text-xs" />
                  `}
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">Year</label>
                  <select id="regYear" class="glass-input w-full px-2.5 py-2 text-xs">
                    <option>Year 1</option>
                    <option>Year 2</option>
                    <option>Year 3</option>
                    <option>Year 4</option>
                  </select>
                </div>
              </div>

              ${programs.length > 0 ? `
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">Academic Program</label>
                  <select id="regProgram" class="glass-input w-full px-2.5 py-2 text-xs">
                    <option value="">Select program</option>
                    ${programs.map((p) => `<option value="${esc(p.code ? `${p.code} — ${p.name}` : p.name)}">${esc(p.code ? `${p.code} — ${p.name}` : p.name)}</option>`).join('')}
                  </select>
                </div>
              ` : ''}

              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Create Password</label>
                <div class="relative flex items-center">
                  <input id="regPassword" type="password" required minlength="6" placeholder="Minimum 6 characters" class="glass-input w-full pl-3.5 pr-11 py-2 text-xs font-code placeholder-slate-400" />
                  <button id="toggleRegPwdBtn" type="button" aria-label="Show password" class="btn-3d absolute right-1.5 w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-[#1E1B4B]">
                    <span class="material-symbols-outlined text-[18px]">visibility</span>
                  </button>
                </div>
              </div>

              <button id="studentRegSubmitBtn" type="submit" class="btn-3d w-full py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#7C3AED] text-white font-label font-semibold text-xs shadow-md flex items-center justify-center gap-1.5 mt-2 disabled:opacity-60">
                <span class="material-symbols-outlined text-[16px]">verified_user</span>
                <span id="studentRegBtnText">Register &amp; Sign In</span>
              </button>
            </form>
          </div>
        </main>

        <footer class="text-center pt-2 pb-4 space-y-1">
          <p class="font-code text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-[14px] text-[#4F46E5]">shield</span>
            PBKDF2-SHA256 Secured University Authentication
          </p>
          <p class="text-[10px] text-slate-400">${esc(settings.collegeName || 'Live AI Classroom')} • ${esc(settings.aiEngineVersion)}</p>
        </footer>
      </div>
    </div>
  `;

  const loginPanel = container.querySelector('#loginPanel');
  const registerPanel = container.querySelector('#registerPanel');
  const loginTabBtn = container.querySelector('#loginTabBtn');
  const registerTabBtn = container.querySelector('#registerTabBtn');

  function showTab(tab) {
    const activeCls = ['bg-gradient-to-r', 'from-[#2563EB]', 'to-[#4F46E5]', 'text-white', 'font-semibold', 'shadow-sm'];
    const inactiveCls = ['text-slate-500', 'hover:text-[#1E1B4B]'];
    if (tab === 'login') {
      loginPanel.classList.remove('hidden');
      registerPanel.classList.add('hidden');
      loginTabBtn.classList.add(...activeCls);
      loginTabBtn.classList.remove(...inactiveCls);
      registerTabBtn.classList.remove(...activeCls);
      registerTabBtn.classList.add(...inactiveCls);
    } else {
      loginPanel.classList.add('hidden');
      registerPanel.classList.remove('hidden');
      registerTabBtn.classList.add(...activeCls);
      registerTabBtn.classList.remove(...inactiveCls);
      loginTabBtn.classList.remove(...activeCls);
      loginTabBtn.classList.add(...inactiveCls);
    }
  }

  loginTabBtn.addEventListener('click', () => showTab('login'));
  registerTabBtn.addEventListener('click', () => showTab('register'));

  bindPasswordToggle(container.querySelector('#togglePwdBtn'), container.querySelector('#loginPassword'));
  bindPasswordToggle(container.querySelector('#toggleRegPwdBtn'), container.querySelector('#regPassword'));

  container.querySelector('#forgotPwdBtn').addEventListener('click', () => {
    showToast('Please contact your administrator to reset your student password.', 'purple');
  });

  // Student Login with full validation, loading state & duplicate-submit guard
  let loginInFlight = false;
  const loginErrBox = container.querySelector('#studentLoginError');
  const loginErrText = container.querySelector('#studentLoginErrorText');
  const loginBtn = container.querySelector('#studentLoginSubmitBtn');
  const loginBtnIcon = container.querySelector('#studentLoginBtnIcon');
  const loginBtnText = container.querySelector('#studentLoginBtnText');

  const showLoginErr = (msg) => {
    loginErrText.textContent = msg;
    loginErrBox.classList.remove('hidden');
  };
  const clearLoginErr = () => loginErrBox.classList.add('hidden');

  container.querySelector('#loginIdentifier').addEventListener('input', clearLoginErr);
  container.querySelector('#loginPassword').addEventListener('input', clearLoginErr);

  container.querySelector('#studentLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginInFlight) return;
    clearLoginErr();

    const ident = container.querySelector('#loginIdentifier').value.replace(/\s+/g, ' ').trim();
    const pwd = container.querySelector('#loginPassword').value;

    if (!ident) {
      showLoginErr('Please enter your register number, email, or name');
      return;
    }
    if (!pwd) {
      showLoginErr('Please enter your password');
      return;
    }

    loginInFlight = true;
    loginBtn.disabled = true;
    loginBtnIcon.textContent = 'progress_activity';
    loginBtnIcon.classList.add('animate-spin');
    loginBtnText.textContent = 'Signing In...';

    try {
      const result = await store.loginStudent(ident, pwd);
      if (!result.ok) {
        showLoginErr(result.error || 'Incorrect Password');
        return;
      }
      showToast(`Welcome, ${result.student.name}!`, 'success');
      window.location.hash = '#student/home';
    } catch {
      showLoginErr('Unable to reach authentication server.');
    } finally {
      loginInFlight = false;
      loginBtn.disabled = false;
      loginBtnIcon.textContent = 'login';
      loginBtnIcon.classList.remove('animate-spin');
      loginBtnText.textContent = 'Sign In to Student Portal';
    }
  });

  // Student Registration via backend
  let regInFlight = false;
  const regErrBox = container.querySelector('#studentRegError');
  const regErrText = container.querySelector('#studentRegErrorText');
  const regBtn = container.querySelector('#studentRegSubmitBtn');
  const regBtnText = container.querySelector('#studentRegBtnText');

  container.querySelector('#studentRegisterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (regInFlight) return;
    regErrBox.classList.add('hidden');

    const payload = {
      name: container.querySelector('#regName').value.trim(),
      email: container.querySelector('#regEmail').value.trim(),
      phone: (container.querySelector('#regPhone')?.value || '').trim(),
      regNo: container.querySelector('#regNo').value.trim().toUpperCase(),
      section: container.querySelector('#regSection').value.trim() || 'Sec A',
      department: container.querySelector('#regDept').value.trim(),
      program: container.querySelector('#regProgram')?.value || '',
      year: container.querySelector('#regYear').value,
      password: container.querySelector('#regPassword').value,
    };

    // Client-side validation
    if (!payload.name) { regErrText.textContent = 'Full name is required'; regErrBox.classList.remove('hidden'); return; }
    if (!payload.email || !payload.email.includes('@')) { regErrText.textContent = 'A valid institutional email is required'; regErrBox.classList.remove('hidden'); return; }
    if (!payload.regNo) { regErrText.textContent = 'Register number is required'; regErrBox.classList.remove('hidden'); return; }
    if (payload.phone) {
      const digits = payload.phone.replace(/[^0-9]/g, '');
      if (digits.length < 7 || digits.length > 15) { regErrText.textContent = 'Phone number must be 7-15 digits'; regErrBox.classList.remove('hidden'); return; }
    }
    if (!payload.password || payload.password.length < 6) { regErrText.textContent = 'Password must be at least 6 characters'; regErrBox.classList.remove('hidden'); return; }

    regInFlight = true;
    regBtn.disabled = true;
    regBtnText.textContent = 'Creating Account...';

    try {
      const result = await store.registerStudentAccount(payload);
      if (!result.ok) {
        regErrText.textContent = result.error || 'Registration failed';
        regErrBox.classList.remove('hidden');
        return;
      }
      showToast(`Registered & signed in as ${result.student.name}!`, 'success');
      window.location.hash = '#student/home';
    } catch {
      regErrText.textContent = 'Unable to reach authentication server.';
      regErrBox.classList.remove('hidden');
    } finally {
      regInFlight = false;
      regBtn.disabled = false;
      regBtnText.textContent = 'Register & Sign In';
    }
  });
}

/* =========================================================================
   SEPARATE ADMINISTRATOR LOGIN PAGE (#admin/login)
   ========================================================================= */
export function renderAdminLoginView(container) {
  const { settings } = store.state;

  // If already authenticated as admin, go straight to Admin Dashboard
  if (store.isAdminAuthenticated()) {
    window.location.hash = '#admin/dashboard';
    return;
  }

  container.innerHTML = `
    <div class="theme-admin min-h-screen">
      <div class="student-shell-narrow flex flex-col justify-between p-5 min-h-screen">
        <header class="pt-8 pb-2 text-center space-y-3">
          <div class="flex justify-center mb-1">${renderSyncPill()}</div>
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0F172A] text-white shadow-md mx-auto">
            <span class="material-symbols-outlined text-[28px]">admin_panel_settings</span>
          </div>
          <div>
            <h1 class="font-headline text-2xl font-bold text-[#0F172A] tracking-tight">Administrator Console</h1>
            <p class="text-slate-500 text-xs mt-1">${esc(settings.collegeName || 'Live AI Classroom PRO')}</p>
          </div>
        </header>

        <main class="my-auto py-4">
          <div class="admin-card card-3d p-6 space-y-4">
            <div class="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 class="font-headline text-lg font-bold text-[#0F172A]">Secure Admin Sign In</h2>
                <p class="text-xs text-slate-500">Restricted to authorized administrators only</p>
              </div>
              <span class="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
                <span class="material-symbols-outlined text-[20px]">verified_user</span>
              </span>
            </div>

            <div id="adminLoginError" role="alert" class="hidden p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-label flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-rose-600 shrink-0">error</span>
              <span id="adminLoginErrorText"></span>
            </div>

            <form id="adminLoginForm" novalidate class="space-y-4">
              <div>
                <label for="adminNameInput" class="block text-xs font-semibold text-slate-600 mb-1.5">Administrator Name</label>
                <div class="relative flex items-center">
                  <span class="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px] pointer-events-none">person</span>
                  <input id="adminNameInput" type="text" autocomplete="username" placeholder="Enter administrator name" class="glass-input w-full pl-10 pr-4 py-2.5 text-sm placeholder-slate-400" />
                </div>
              </div>

              <div>
                <label for="adminPwdInput" class="block text-xs font-semibold text-slate-600 mb-1.5">Administrator Password</label>
                <div class="relative flex items-center">
                  <span class="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px] pointer-events-none">key</span>
                  <input id="adminPwdInput" type="password" autocomplete="current-password" placeholder="Enter administrator password" class="glass-input w-full pl-10 pr-12 py-2.5 text-sm font-code placeholder-slate-400" />
                  <button id="toggleAdminPwdBtn" type="button" aria-label="Show password" aria-pressed="false" class="btn-3d absolute right-1.5 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 touch-manipulation">
                    <span class="material-symbols-outlined text-[20px]">visibility</span>
                  </button>
                </div>
              </div>

              <button id="adminLoginSubmitBtn" type="submit" class="btn-3d w-full py-3 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-label font-semibold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                <span id="adminLoginBtnIcon" class="material-symbols-outlined text-[18px]">shield_person</span>
                <span id="adminLoginBtnText">Sign In as Administrator</span>
              </button>
            </form>

            <div class="pt-3 border-t border-slate-100 text-center">
              <a href="#auth" class="inline-flex items-center gap-1.5 text-xs font-label text-slate-500 hover:text-[#2563EB] transition-colors">
                <span class="material-symbols-outlined text-[15px] text-[#2563EB]">arrow_back</span>
                <span>Back to Student Portal Login</span>
              </a>
            </div>
          </div>
        </main>

        <footer class="text-center pt-2 pb-4 space-y-1">
          <p class="font-code text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-[14px] text-[#2563EB]">shield</span>
            Backend PBKDF2-SHA256 Verified Admin Access
          </p>
        </footer>
      </div>
    </div>
  `;

  bindPasswordToggle(container.querySelector('#toggleAdminPwdBtn'), container.querySelector('#adminPwdInput'));

  let inFlight = false;
  const errBox = container.querySelector('#adminLoginError');
  const errText = container.querySelector('#adminLoginErrorText');
  const submitBtn = container.querySelector('#adminLoginSubmitBtn');
  const btnIcon = container.querySelector('#adminLoginBtnIcon');
  const btnText = container.querySelector('#adminLoginBtnText');

  const showErr = (msg) => { errText.textContent = msg; errBox.classList.remove('hidden'); };
  const clearErr = () => errBox.classList.add('hidden');

  container.querySelector('#adminNameInput').addEventListener('input', clearErr);
  container.querySelector('#adminPwdInput').addEventListener('input', clearErr);

  container.querySelector('#adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (inFlight) return;
    clearErr();

    const name = container.querySelector('#adminNameInput').value.trim();
    const pwd = container.querySelector('#adminPwdInput').value;

    if (!name) { showErr('Please enter the administrator name'); return; }
    if (!pwd) { showErr('Please enter your password'); return; }

    inFlight = true;
    submitBtn.disabled = true;
    btnIcon.textContent = 'progress_activity';
    btnIcon.classList.add('animate-spin');
    btnText.textContent = 'Verifying Credentials...';

    try {
      const result = await store.loginAdmin(name, pwd);
      if (!result.ok) {
        showErr(result.error || 'Invalid administrator name or password');
        return;
      }
      showToast(`Signed in as Administrator (${result.admin?.name || name})`, 'success');
      window.location.hash = '#admin/dashboard';
    } catch {
      showErr('Unable to reach authentication server.');
    } finally {
      inFlight = false;
      submitBtn.disabled = false;
      btnIcon.textContent = 'shield_person';
      btnIcon.classList.remove('animate-spin');
      btnText.textContent = 'Sign In as Administrator';
    }
  });
}
