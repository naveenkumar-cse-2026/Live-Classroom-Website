import { store } from './store.js';
import { esc, showToast } from './ui.js';
import { renderAuthView, renderAdminLoginView } from './views-auth.js';
import {
  renderStudentHome,
  renderAIChat,
  renderScanSolve,
  renderStudyVault,
  renderAssignmentsNotices,
  renderStudentProfile,
  cleanupStudentViews,
} from './views-student.js';
import {
  renderAdminDashboard,
  renderAdminStudents,
  renderAdminTeachers,
  renderAdminResources,
  renderAdminTimetable,
  renderAdminSettings,
} from './views-admin.js';

const ROUTES = {
  'auth': renderAuthView,
  'admin/login': renderAdminLoginView,
  'student/home': renderStudentHome,
  'student/chat': renderAIChat,
  'student/scan': renderScanSolve,
  'student/vault': renderStudyVault,
  'student/assignments': renderAssignmentsNotices,
  'student/profile': renderStudentProfile,
  'admin/dashboard': renderAdminDashboard,
  'admin/students': renderAdminStudents,
  'admin/teachers': renderAdminTeachers,
  'admin/resources': renderAdminResources,
  'admin/timetable': renderAdminTimetable,
  'admin/settings': renderAdminSettings,
};

function parseHash() {
  const raw = (window.location.hash || '#student/home').replace(/^#/, '');
  const [routePart, queryPart] = raw.split('?');
  const route = ROUTES[routePart] ? routePart : 'student/home';
  const query = {};
  if (queryPart) {
    for (const [k, v] of new URLSearchParams(queryPart).entries()) {
      query[k] = v;
    }
  }
  return { route, query };
}

function renderGlobalAlert() {
  const host = document.getElementById('global-alert-host');
  if (!host) return;
  const alert = store.state.emergencyAlert;
  if (!alert) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `
    <div class="pointer-events-auto bg-gradient-to-r from-rose-50/95 via-rose-100/95 to-rose-50/95 border-b border-error/40 backdrop-blur-xl px-4 py-2.5 shadow-[0_6px_30px_rgba(239,68,68,0.15)] animate-enter">
      <div class="max-w-5xl mx-auto flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 text-xs">
          <span class="w-2.5 h-2.5 rounded-full bg-error animate-ping shrink-0"></span>
          <div>
            <span class="font-code font-bold text-error uppercase tracking-wider mr-1.5">CAMPUS ALERT (${esc(alert.sentAt)}):</span>
            <span class="font-semibold text-[#172B4D]">${esc(alert.title)}</span>
            <span class="text-rose-700/80 ml-1">— ${esc(alert.message)}</span>
          </div>
        </div>
        <button id="dismissGlobalAlertBtn" type="button" class="px-2.5 py-1 rounded bg-[#E6F4FF] hover:bg-white/20 text-[#172B4D] text-[11px] font-code shrink-0">
          Dismiss
        </button>
      </div>
    </div>
  `;
  host.querySelector('#dismissGlobalAlertBtn')?.addEventListener('click', () => {
    store.dismissAlert();
  });
}

let lastRoute = null;

function renderCurrentRoute() {
  const { route, query } = parseHash();
  const appEl = document.getElementById('app');
  if (!appEl) return;

  // Strict Admin Route Protection — block unauthorized users & students from Admin Console
  if (route.startsWith('admin/') && route !== 'admin/login') {
    if (!store.isAdminAuthenticated()) {
      showToast('Administrator authentication required.', 'warning');
      window.location.hash = '#admin/login';
      return;
    }
  }

  if (lastRoute && lastRoute !== route) {
    cleanupStudentViews();
    window.scrollTo({ top: 0 });
  }
  lastRoute = route;

  const handler = ROUTES[route] || renderAuthView;
  handler(appEl, query);
  renderGlobalAlert();
}

window.addEventListener('hashchange', renderCurrentRoute);

store.subscribe((_state, remoteNote) => {
  // Avoid disrupting typing inside an open input modal; re-render main view safely
  const activeTag = document.activeElement?.tagName;
  const activeId = document.activeElement?.id;
  const modalOpen = document.getElementById('modal-host')?.innerHTML.trim().length > 0;

  renderGlobalAlert();
  if (remoteNote && String(remoteNote).trim()) {
    showToast(`Live Update: ${remoteNote}`, 'blue');
  }

  if (!modalOpen && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'SELECT') {
    renderCurrentRoute();
  } else if (activeId === 'chatInput') {
    const draft = document.activeElement.value;
    renderCurrentRoute();
    const nextInp = document.getElementById('chatInput');
    if (nextInp) {
      nextInp.value = draft;
      nextInp.focus();
    }
  }
});

(async function bootstrap() {
  if (!window.location.hash) {
    window.history.replaceState(null, '', '#auth');
  }
  await store.init();
  renderCurrentRoute();
})();
