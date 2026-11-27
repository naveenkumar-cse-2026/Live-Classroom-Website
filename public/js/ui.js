import { store } from './store.js';

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(message, type = 'purple') {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const styles = {
    purple: 'border-[#4A90E2]/40 bg-white/90 text-[#172B4D] shadow-[0_0_24px_rgba(74,144,226,0.2)]',
    blue: 'border-[#4A90E2]/40 bg-white/90 text-[#172B4D] shadow-[0_0_24px_rgba(74,144,226,0.2)]',
    success: 'border-success/60 bg-emerald-50/90 text-emerald-700 shadow-[0_0_24px_rgba(34,197,94,0.2)]',
    warning: 'border-amber-500/60 bg-amber-50/90 text-amber-700 shadow-[0_0_24px_rgba(245,158,11,0.2)]',
    error: 'border-error/60 bg-rose-50/90 text-rose-700 shadow-[0_0_24px_rgba(239,68,68,0.2)]',
  };
  const icons = {
    purple: 'auto_awesome',
    success: 'check_circle',
    warning: 'warning',
    error: 'error',
  };
  const el = document.createElement('div');
  el.className = `pointer-events-auto animate-enter flex items-center gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-xl text-xs font-label ${styles[type] || styles.purple}`;
  el.innerHTML = `
    <span class="material-symbols-outlined text-[18px] ${type === 'success' ? 'text-success' : type === 'warning' ? 'text-amber-400' : type === 'error' ? 'text-error' : 'text-neon-purple'}">${icons[type] || 'auto_awesome'}</span>
    <span class="leading-snug">${esc(message)}</span>
  `;
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.style.transition = 'all 180ms ease-out';
    setTimeout(() => el.remove(), 200);
  }, 3400);
}
if (typeof window !== 'undefined') {
  window.showToast = showToast;
}

export function init3DTilt(root = document) {
  if (typeof window === 'undefined' || !root) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches;
  if (reduced || !finePointer) return;

  root.querySelectorAll('.card-3d').forEach((card) => {
    if (card.dataset.tiltBound === '1') return;
    card.dataset.tiltBound = '1';
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const maxDeg = 4;
      card.style.setProperty('--rx', `${(-y * maxDeg).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${(x * maxDeg).toFixed(2)}deg`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
}

export function openModal(html, onBind, maxWidthClass = 'max-w-2xl') {
  const host = document.getElementById('modal-host');
  if (!host) return;
  host.innerHTML = `
    <div id="activeModalBackdrop" class="modal-backdrop-enter fixed inset-0 z-[60] bg-[#0F172A]/45 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div id="activeModalPanel" class="modal-panel-enter w-full ${maxWidthClass} my-auto">${html}</div>
    </div>
  `;
  const backdrop = document.getElementById('activeModalBackdrop');
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  host.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal());
  });
  if (typeof onBind === 'function') onBind(host);
}

export function closeModal() {
  const host = document.getElementById('modal-host');
  if (!host) return;
  const backdrop = document.getElementById('activeModalBackdrop');
  const panel = document.getElementById('activeModalPanel');
  if (!backdrop || !panel) {
    host.innerHTML = '';
    return;
  }
  backdrop.classList.remove('modal-backdrop-enter');
  backdrop.classList.add('modal-backdrop-exit');
  panel.classList.remove('modal-panel-enter');
  panel.classList.add('modal-panel-exit');
  setTimeout(() => {
    if (document.getElementById('activeModalBackdrop') === backdrop) {
      host.innerHTML = '';
    }
  }, 145);
}

/**
 * Global Delete Confirmation Dialog
 * Never deletes a record without explicit Cancel / Confirm Delete confirmation.
 */
export function confirmDelete({ title = 'Confirm Deletion', itemName = '', detail = '', onConfirm }) {
  openModal(`
    <div class="rounded-2xl bg-white/92 border border-error/50 shadow-[0_0_50px_rgba(244,63,94,0.28)] overflow-hidden">
      <div class="px-6 py-4 border-b border-error/25 bg-error/10 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-error/20 border border-error/40 text-error flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]">delete_forever</span>
          </div>
          <h3 class="font-headline text-title-lg text-[#172B4D]">${esc(title)}</h3>
        </div>
        <button type="button" data-close-modal class="text-rose-500 hover:text-[#172B4D]">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
      <div class="p-6 space-y-3">
        <p class="text-sm font-label text-[#172B4D]">Are you sure you want to delete this item?</p>
        ${itemName ? `
          <div class="p-3 rounded-lg bg-white/85 border border-glass-border text-xs font-code text-[#64748B] break-all">
            ${esc(itemName)}
          </div>
        ` : ''}
        ${detail ? `<p class="text-xs text-[#64748B]/70">${esc(detail)}</p>` : ''}
        <p class="text-[11px] text-rose-500">This action will permanently remove the selected record and update all connected views.</p>
      </div>
      <div class="px-6 py-4 border-t border-glass-border bg-[#F0F8FF] flex items-center justify-end gap-3">
        <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] border border-glass-border text-[#64748B] hover:text-[#172B4D] text-xs font-label transition-colors">
          Cancel
        </button>
        <button id="confirmDeleteActionBtn" type="button" class="px-5 py-2 rounded-md bg-error hover:bg-rose-500 text-white text-xs font-label shadow-[0_0_18px_rgba(244,63,94,0.4)] flex items-center gap-1.5 transition-all active:scale-95">
          <span class="material-symbols-outlined text-[16px]">delete</span>
          <span>Confirm Delete</span>
        </button>
      </div>
    </div>
  `, (host) => {
    host.querySelector('#confirmDeleteActionBtn')?.addEventListener('click', async () => {
      closeModal();
      if (typeof onConfirm === 'function') {
        await onConfirm();
      }
    });
  }, 'max-w-md');
}

export function renderSyncPill() {
  const rev = store.state.revision || 1;
  const isRealtime = store.syncMode === 'supabase-realtime';
  const connected = store.serverConnected;
  const label = isRealtime ? 'SUPABASE REALTIME' : (connected ? 'LIVE SERVER' : 'LIVE SYNC');
  const title = isRealtime
    ? 'Connected to Supabase PostgreSQL Real-Time Cloud'
    : (connected ? 'Connected to Live Server' : 'Real-Time Cross-Tab Local Sync Active');
  return `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200/90 font-code text-[10px] text-slate-600" title="${title}">
      <span class="w-1.5 h-1.5 rounded-full ${isRealtime ? 'bg-emerald-500 animate-pulse' : (connected ? 'bg-emerald-500 animate-pulse' : 'bg-[#2563EB] animate-pulse')}"></span>
      ${label} • r${rev}
    </span>
  `;
}

export function renderStudentBottomNav(activeRoute) {
  const item = (route, icon, label) => {
    const isActive = activeRoute === route;
    if (isActive) {
      return `
        <a href="#${route}" class="btn-3d flex flex-col items-center gap-0.5 py-1 rounded-xl bg-gradient-to-r from-[#2563EB]/10 to-[#7C3AED]/10 text-[#4F46E5]">
          <span class="material-symbols-outlined text-[22px]">${icon}</span>
          <span class="text-[11px] font-label font-semibold">${label}</span>
        </a>
      `;
    }
    return `
      <a href="#${route}" class="btn-3d flex flex-col items-center gap-0.5 py-1 rounded-xl text-slate-500 hover:text-[#1E1B4B] hover:bg-indigo-50/60 transition-colors">
        <span class="material-symbols-outlined text-[22px]">${icon}</span>
        <span class="text-[11px] font-label">${label}</span>
      </a>
    `;
  };

  return `
    <nav class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[960px] z-50 px-3 pb-2 pointer-events-none">
      <div class="pointer-events-auto max-w-md mx-auto bg-white/95 backdrop-blur-xl border border-indigo-100 rounded-2xl px-3 py-2 shadow-[0_10px_30px_-8px_rgba(79,70,229,0.2)]">
        <div class="grid grid-cols-4 gap-1 items-center text-center">
          ${item('student/home', 'home', 'Home')}
          ${item('student/vault', 'menu_book', 'Vault')}
          ${item('student/assignments', 'campaign', 'Notices')}
          ${item('student/profile', 'person', 'Profile')}
        </div>
      </div>
    </nav>
  `;
}

export function renderAdminSidebar(activeRoute) {
  const s = store.state;
  const studentCount = s.students.length;
  const teacherCount = s.teachers.length;
  const resourceCount = s.materials.length + s.notices.length + s.assignments.length;
  const timetableCount = s.timetable.length + s.events.length + (s.timetableImage ? 1 : 0);
  const adminProfile = s.settings.adminProfile || { name: 'Administrator', designation: 'System Administrator', initials: 'AD' };

  const navLink = (route, icon, label, badge = null) => {
    const active = activeRoute === route;
    return `
      <a href="#${route}" data-admin-nav class="btn-3d relative flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-sm font-label ${
        active
          ? 'bg-[#EFF6FF] text-[#1E3A8A] font-semibold border border-[#BFDBFE] shadow-sm'
          : 'hover:bg-slate-100/80 text-slate-600 hover:text-[#0F172A] border border-transparent'
      }">
        ${active ? '<span class="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#2563EB]"></span>' : ''}
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined ${active ? 'text-[#2563EB]' : 'text-slate-400'} text-[20px]">${icon}</span>
          <span>${label}</span>
        </div>
        ${badge !== null ? `<span class="font-code text-[11px] px-2 py-0.5 rounded-full ${active ? 'bg-[#2563EB] text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}">${badge}</span>` : ''}
      </a>
    `;
  };

  return `
    <!-- Mobile Drawer Backdrop -->
    <div id="adminSidebarBackdrop" class="hidden fixed inset-0 z-40 bg-[#0F172A]/35 backdrop-blur-sm lg:hidden"></div>

    <aside id="adminSidebarEl" class="admin-sidebar fixed lg:sticky top-0 left-0 z-50 lg:z-30 w-64 shrink-0 h-screen flex flex-col justify-between p-4 overflow-y-auto transform -translate-x-full lg:translate-x-0 transition-transform duration-200">
      <div class="space-y-6">
        <div class="flex items-center justify-between px-1.5 py-1">
          <a href="#admin/dashboard" class="flex items-center gap-3 group">
            <div class="w-10 h-10 rounded-xl bg-[#0F172A] flex items-center justify-center text-white shadow-sm overflow-hidden shrink-0">
              ${s.settings.logoDataUrl
                ? `<img src="${esc(s.settings.logoDataUrl)}" class="w-full h-full object-cover" alt="Logo" />`
                : `<span class="material-symbols-outlined text-[22px]">school</span>`}
            </div>
            <div>
              <span class="font-headline text-base font-bold text-[#0F172A] tracking-tight block leading-tight">Live AI</span>
              <span class="font-code text-[10px] text-[#2563EB] font-semibold uppercase tracking-wider block">Classroom Pro</span>
            </div>
          </a>
          <button id="closeMobileSidebarBtn" type="button" class="lg:hidden text-slate-400 hover:text-[#0F172A] p-1 rounded-md">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <nav class="space-y-1">
          <div class="px-2 pb-1 text-[10px] font-code font-semibold uppercase text-slate-400 tracking-wider">Main Management</div>
          ${navLink('admin/dashboard', 'dashboard', 'Overview')}
          ${navLink('admin/students', 'group', 'Manage Students', studentCount.toLocaleString())}
          ${navLink('admin/teachers', 'co_present', 'Manage Teachers', teacherCount.toLocaleString())}
          ${navLink('admin/timetable', 'calendar_month', 'Timetable & Events', timetableCount.toLocaleString())}

          <div class="pt-4 px-2 pb-1 text-[10px] font-code font-semibold uppercase text-slate-400 tracking-wider">Academic Resources</div>
          ${navLink('admin/resources', 'cloud_upload', 'Materials & Notices', resourceCount.toLocaleString())}

          <div class="pt-4 px-2 pb-1 text-[10px] font-code font-semibold uppercase text-slate-400 tracking-wider">System Settings</div>
          ${navLink('admin/settings', 'tune', 'College Settings')}
        </nav>
      </div>

      <div class="pt-4 border-t border-slate-200 space-y-2.5">
        <div class="flex items-center justify-center">${renderSyncPill()}</div>
        <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 gap-2">
          <a href="#admin/settings" class="flex items-center gap-2.5 min-w-0 flex-1 group" title="Configure Admin Profile in College Settings">
            <div class="w-9 h-9 rounded-full bg-[#0F172A] flex items-center justify-center text-white text-xs font-bold font-headline shrink-0">
              ${esc(adminProfile.initials || 'AD')}
            </div>
            <div class="min-w-0">
              <span class="font-label text-sm text-[#0F172A] font-medium block leading-tight truncate group-hover:text-[#2563EB] transition-colors">${esc(adminProfile.name || 'Administrator')}</span>
              <span class="font-code text-[11px] text-slate-500 block truncate">${esc(adminProfile.designation || 'System Administrator')}</span>
            </div>
          </a>
          <a href="#student/home" title="Switch to Student App View" class="btn-3d text-slate-500 hover:text-[#2563EB] p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-colors shrink-0">
            <span class="material-symbols-outlined text-[18px]">smartphone</span>
          </a>
        </div>
        <button id="adminLogoutBtn" type="button" class="btn-3d w-full py-2 px-2 rounded-lg text-[11px] font-code text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 flex items-center justify-center gap-1.5 transition-colors">
          <span class="material-symbols-outlined text-[14px]">logout</span> Sign Out Admin
        </button>
      </div>
    </aside>
  `;
}

export function renderMobileMenuButton() {
  return `
    <button id="openMobileSidebarBtn" type="button" aria-label="Open navigation menu" class="btn-3d lg:hidden w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-[#0F172A] shadow-xs shrink-0">
      <span class="material-symbols-outlined text-[20px]">menu</span>
    </button>
  `;
}

export function bindAdminSidebarToggle(container) {
  const sidebar = container.querySelector('#adminSidebarEl');
  const backdrop = container.querySelector('#adminSidebarBackdrop');
  const openBtn = container.querySelector('#openMobileSidebarBtn');
  const closeBtn = container.querySelector('#closeMobileSidebarBtn');
  const logoutBtn = container.querySelector('#adminLogoutBtn');

  logoutBtn?.addEventListener('click', async () => {
    await store.logoutAdmin();
    showToast('Signed out of Administrator Console.', 'purple');
    window.location.hash = '#admin/login';
  });

  if (!sidebar || !backdrop) return;

  const open = () => {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
  };
  const close = () => {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
  };

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  sidebar.querySelectorAll('[data-admin-nav]').forEach((a) => a.addEventListener('click', close));
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadFromUrl(url, filename) {
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Fetch failed');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    return true;
  } catch {
    // If cross-origin fetch fails (CORS), proxy through backend download endpoint for native attachment
    if (!url.startsWith('/api/download')) {
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename || 'download')}`;
      const a = document.createElement('a');
      a.href = proxyUrl;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }
}
