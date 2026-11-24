import { store } from './store.js';
import {
  esc,
  showToast,
  openModal,
  closeModal,
  confirmDelete,
  renderAdminSidebar,
  renderMobileMenuButton,
  bindAdminSidebarToggle,
  downloadTextFile,
  downloadDataUrl,
  downloadFromUrl,
} from './ui.js';

function getDepartmentOptions(selectedValue = '') {
  const depts = store.state.settings.departments || [];
  const names = depts.map((d) => d.shortName || d.name).filter(Boolean);
  if (selectedValue && !names.includes(selectedValue)) {
    names.push(selectedValue);
  }
  return names;
}

function getProgramOptions(selectedValue = '') {
  const progs = store.state.settings.programs || [];
  const names = progs.map((p) => (p.code ? `${p.code} — ${p.name}` : p.name)).filter(Boolean);
  if (selectedValue && !names.includes(selectedValue)) {
    names.push(selectedValue);
  }
  return names;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function inferMaterialType(fileName = '', mime = '') {
  const lower = fileName.toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/.test(lower)) return 'image';
  if (/\.(ppt|pptx)$/.test(lower)) return 'slides';
  if (/\.(zip|py|ipynb|js|ts|html|css|json)$/.test(lower)) return 'code';
  if (/\.(doc|docx|txt|md)$/.test(lower)) return 'doc';
  return 'pdf';
}

/* =========================================================================
   SHARED MODALS: NOTICES, EMERGENCY ALERT, STUDENTS, TEACHERS
   ========================================================================= */
function openNoticeModal(existing = null) {
  const isEdit = !!existing;
  const currentCat = existing?.category || 'OFFICIAL NOTICE';
  const currentColor = existing?.tagColor || 'purple';

  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 shadow-[0_0_50px_rgba(74,144,226,0.15)] overflow-hidden">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-gradient-to-r from-[#EBF4FF] to-[#E6F4FF]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]">campaign</span>
          </div>
          <div>
            <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Notice / Announcement' : 'Publish Official Notice'}</h3>
            <p class="text-xs text-[#64748B]/70">Delivered immediately to all Student Portal feeds</p>
          </div>
        </div>
        <button type="button" data-close-modal class="w-8 h-8 rounded-full bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#64748B] flex items-center justify-center">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <form id="noticeModalForm" class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Category / Issuing Office</label>
            <input id="notCat" type="text" required value="${esc(currentCat)}" placeholder="e.g. EXAM CELL, ADMINISTRATION" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Tag Accent</label>
            <select id="notColor" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]">
              <option value="purple" ${currentColor === 'purple' ? 'selected' : ''}>Neon Purple (General)</option>
              <option value="amber" ${currentColor === 'amber' ? 'selected' : ''}>Amber (Exam / Urgent)</option>
              <option value="emerald" ${currentColor === 'emerald' ? 'selected' : ''}>Emerald (Campus Update)</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-label text-[#64748B] mb-1">Notice Title</label>
          <input id="notTitle" type="text" required value="${esc(existing?.title || '')}" placeholder="Enter notice headline" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
        </div>
        <div>
          <label class="block text-xs font-label text-[#64748B] mb-1">Notice Content</label>
          <textarea id="notBody" rows="3" required placeholder="Write the full notice or announcement details..." class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]">${esc(existing?.body || '')}</textarea>
        </div>
        <label class="flex items-center gap-2 text-xs text-[#64748B]/80 cursor-pointer">
          <input id="notAttach" type="checkbox" ${existing?.hasAttachment ? 'checked' : ''} class="rounded bg-white/80 border-glass-border text-neon-purple focus:ring-[#4A90E2]/30" />
          Enable circular download button for students
        </label>
        <div class="pt-4 border-t border-glass-border flex justify-end gap-3">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_18px_rgba(74,144,226,0.2)]">
            ${isEdit ? 'Save Notice Changes' : 'Publish Notice'}
          </button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#noticeModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const payload = {
        category: host.querySelector('#notCat').value,
        tagColor: host.querySelector('#notColor').value,
        title: host.querySelector('#notTitle').value,
        body: host.querySelector('#notBody').value,
        hasAttachment: host.querySelector('#notAttach').checked,
      };
      try {
        if (isEdit) {
          await store.updateNotice(existing.id, payload);
          showToast('Notice updated and synced!', 'success');
        } else {
          await store.publishNotice(payload);
          showToast('Notice published and synced to Student App!', 'success');
        }
        closeModal();
      } catch (err) {
        showToast(err.message || 'Failed to save notice', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });
}

function openEmergencyBroadcastModal() {
  openModal(`
    <div class="rounded-2xl bg-white/92 border border-error/60 shadow-[0_0_50px_rgba(244,63,94,0.3)] overflow-hidden">
      <div class="px-6 py-4 border-b border-error/30 flex items-center justify-between bg-error/10">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-error/20 border border-error/50 text-error flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]">warning</span>
          </div>
          <div>
            <h3 class="font-headline text-headline-sm text-[#172B4D]">Broadcast Emergency Campus Alert</h3>
            <p class="text-xs text-rose-200/75">Triggers an instant top-of-screen alert banner across all connected screens</p>
          </div>
        </div>
        <button type="button" data-close-modal class="text-rose-200 hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="emergencyForm" class="p-6 space-y-4">
        <div>
          <label class="block text-xs font-label text-rose-200 mb-1">Alert Headline</label>
          <input id="alertTitle" type="text" required placeholder="Enter urgent alert headline" class="w-full px-3.5 py-2.5 rounded-md bg-white/85 border border-error/40 text-[#172B4D] text-sm outline-none focus:border-error" />
        </div>
        <div>
          <label class="block text-xs font-label text-rose-200 mb-1">Alert Message</label>
          <textarea id="alertMsg" rows="3" required placeholder="Enter instructions for students and faculty..." class="w-full px-3.5 py-2.5 rounded-md bg-white/85 border border-error/40 text-[#172B4D] text-sm outline-none focus:border-error"></textarea>
        </div>
        <div class="pt-4 border-t border-error/25 flex justify-end gap-3">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-md bg-error hover:bg-rose-500 text-white text-xs font-label shadow-[0_0_20px_rgba(244,63,94,0.45)] flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">campaign</span> Send Live Alert Now
          </button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#emergencyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await store.broadcastAlert(
        host.querySelector('#alertTitle').value,
        host.querySelector('#alertMsg').value
      );
      closeModal();
      showToast('Emergency campus alert broadcast!', 'warning');
    });
  });
}

function openAddEditStudentModal(existing = null) {
  const deptOpts = getDepartmentOptions(existing?.department || '');
  const progOpts = getProgramOptions(existing?.program || '');
  const domain = store.state.settings.domain || 'college.edu';
  const isEdit = !!existing;

  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 shadow-[0_0_50px_rgba(74,144,226,0.15)] overflow-hidden">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-gradient-to-r from-[#EBF4FF] to-[#E6F4FF]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-neon-purple/20 border border-[#4A90E2]/35 text-neon-purple flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]">${isEdit ? 'edit' : 'person_add'}</span>
          </div>
          <div>
            <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Student Record' : 'Add Student'}</h3>
            <p class="text-body-sm text-[#64748B]/70 text-xs">Student becomes Active once they sign in to the portal</p>
          </div>
        </div>
        <button type="button" data-close-modal class="w-8 h-8 rounded-full bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#64748B] flex items-center justify-center">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <form id="studentModalForm" class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-label-md text-[#64748B] mb-1.5">Full Student Name</label>
            <input id="stuName" type="text" required value="${esc(existing?.name || '')}" placeholder="Enter student full name" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none" />
          </div>
          <div>
            <label class="block text-label-md text-[#64748B] mb-1.5">Institutional Email</label>
            <input id="stuEmail" type="email" required value="${esc(existing?.email || '')}" placeholder="student@${esc(domain)}" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none" />
          </div>
          <div>
            <label class="block text-label-md text-[#64748B] mb-1.5">Phone Number</label>
            <input id="stuPhone" type="tel" value="${esc(existing?.phone || '')}" placeholder="e.g. +91 9876543210" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none" />
          </div>
          <div>
            <label class="block text-label-md text-[#64748B] mb-1.5">Register Number</label>
            <input id="stuRegNo" type="text" required value="${esc(existing?.regNo || '')}" placeholder="Enter register number" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code focus:border-[#4A90E2] outline-none" />
          </div>
          <div>
            <label class="block text-label-md text-[#64748B] mb-1.5">${isEdit ? 'Password (leave blank to keep)' : 'Initial Password'}</label>
            <input id="stuPwd" type="password" ${isEdit ? '' : 'required'} placeholder="${isEdit ? 'Unchanged' : 'Create login password'}" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code focus:border-[#4A90E2] outline-none" />
          </div>
          <div>
            <label class="block text-label-md text-[#64748B] mb-1.5">Department</label>
            ${deptOpts.length > 0 ? `
              <select id="stuDept" required class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none">
                <option value="">Select department</option>
                ${deptOpts.map((d) => `<option value="${esc(d)}" ${existing?.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
              </select>
            ` : `
              <input id="stuDept" type="text" value="${esc(existing?.department || '')}" placeholder="Add departments in College Settings first" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-amber-500/40 text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none" />
            `}
          </div>
          <div>
            <label class="block text-label-md text-[#64748B] mb-1.5">Academic Program</label>
            ${progOpts.length > 0 ? `
              <select id="stuProgram" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none">
                <option value="">Select academic program</option>
                ${progOpts.map((p) => `<option value="${esc(p)}" ${existing?.program === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
              </select>
            ` : `
              <input id="stuProgram" type="text" value="${esc(existing?.program || '')}" placeholder="Optional (add programs in College Settings)" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none" />
            `}
          </div>
          <div class="grid grid-cols-2 gap-3 md:col-span-2">
            <div>
              <label class="block text-label-md text-[#64748B] mb-1.5">Academic Year</label>
              <select id="stuYear" class="w-full px-3 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none">
                ${['Year 1', 'Year 2', 'Year 3', 'Year 4'].map((y) => `<option ${existing?.year === y ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-label-md text-[#64748B] mb-1.5">Section</label>
              <input id="stuSec" type="text" value="${esc(existing?.section || 'Sec A')}" placeholder="e.g. Sec A" class="w-full px-3 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none" />
            </div>
          </div>
        </div>

        <div class="pt-4 border-t border-glass-border flex items-center justify-end gap-3">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D] text-xs font-label">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_18px_rgba(74,144,226,0.2)] border border-[#4A90E2]/35 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">check</span>
            <span>${isEdit ? 'Save Changes' : 'Add Student'}</span>
          </button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#studentModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const payload = {
        name: host.querySelector('#stuName').value.trim(),
        email: host.querySelector('#stuEmail').value.trim(),
        phone: (host.querySelector('#stuPhone')?.value || '').trim(),
        regNo: host.querySelector('#stuRegNo').value.trim().toUpperCase(),
        department: host.querySelector('#stuDept').value.trim(),
        program: host.querySelector('#stuProgram').value.trim(),
        year: host.querySelector('#stuYear').value,
        section: host.querySelector('#stuSec').value.trim() || 'Sec A',
      };
      const pwd = host.querySelector('#stuPwd').value;
      if (pwd) payload.password = pwd;

      try {
        if (isEdit) {
          await store.updateStudent(existing.id, payload);
          showToast(`Updated ${payload.name}'s record`, 'success');
        } else {
          await store.registerOrAddStudent(payload, { markLoggedIn: false });
          showToast(`Added ${payload.name} (${payload.regNo}) — Active once they sign in.`, 'success');
        }
        closeModal();
      } catch (err) {
        showToast(err.message || 'Failed to save student record', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      }
    });
  });
}

function openTeacherModal(existing = null) {
  const isEdit = !!existing;
  const deptOpts = getDepartmentOptions(existing?.department || '');
  const domain = store.state.settings.domain || 'college.edu';

  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 shadow-[0_0_50px_rgba(74,144,226,0.15)] overflow-hidden">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-gradient-to-r from-[#EBF4FF] to-[#E6F4FF]">
        <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Professor / Teacher' : 'Add New Professor'}</h3>
        <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="teacherModalForm" class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Full Name &amp; Title</label>
            <input id="teaName" type="text" required value="${esc(existing?.name || '')}" placeholder="Enter professor full name" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Staff ID</label>
            <input id="teaStaffId" type="text" value="${esc(existing?.staffId || '')}" placeholder="Optional (auto-generated if blank)" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Official Email</label>
            <input id="teaEmail" type="email" required value="${esc(existing?.email || '')}" placeholder="professor@${esc(domain)}" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Department</label>
            ${deptOpts.length > 0 ? `
              <select id="teaDept" required class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]">
                <option value="">Select department</option>
                ${deptOpts.map((d) => `<option value="${esc(d)}" ${existing?.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
              </select>
            ` : `
              <input id="teaDept" type="text" required value="${esc(existing?.department || '')}" placeholder="Enter department (or add in College Settings)" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-amber-500/40 text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
            `}
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Assigned Course / Subject</label>
            <input id="teaCourse" type="text" required value="${esc(existing?.course || '')}" placeholder="Enter assigned course" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Room / Classroom</label>
            <input id="teaHall" type="text" value="${esc(existing?.hall || '')}" placeholder="Enter classroom or hall" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Status</label>
            <select id="teaStatus" class="w-full px-3 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]">
              ${['Offline', 'Office Hours', 'Streaming Live'].map((st) => `<option value="${st}" ${(existing?.status || 'Offline') === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Classes Scheduled Today</label>
            <input id="teaClassesToday" type="number" min="0" max="20" value="${existing?.classesToday ?? 0}" class="w-full px-3.5 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div class="pt-4 border-t border-glass-border flex items-center justify-end gap-3">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_16px_rgba(74,144,226,0.35)]">
            ${isEdit ? 'Save Teacher Changes' : 'Add Professor'}
          </button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#teacherModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const payload = {
        name: host.querySelector('#teaName').value.trim(),
        staffId: host.querySelector('#teaStaffId').value.trim(),
        email: host.querySelector('#teaEmail').value.trim(),
        department: host.querySelector('#teaDept').value.trim(),
        course: host.querySelector('#teaCourse').value.trim(),
        hall: host.querySelector('#teaHall').value.trim(),
        status: host.querySelector('#teaStatus').value,
        classesToday: Math.max(0, Number(host.querySelector('#teaClassesToday').value) || 0),
      };
      try {
        if (isEdit) {
          if (!payload.staffId) payload.staffId = existing.staffId;
          await store.updateTeacher(existing.id, payload);
          showToast(`Updated ${payload.name}'s profile`, 'success');
        } else {
          await store.addTeacher(payload);
          showToast(`Added ${payload.name} to faculty directory!`, 'success');
        }
        closeModal();
      } catch (err) {
        showToast(err.message || 'Failed to save faculty record', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });
}

function openChangeAdminPasswordModal() {
  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 shadow-[0_0_50px_rgba(74,144,226,0.15)] overflow-hidden">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-gradient-to-r from-[#EBF4FF] to-[#E6F4FF]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-neon-purple/20 border border-[#4A90E2]/35 text-neon-purple flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]">lock_reset</span>
          </div>
          <div>
            <h3 class="font-headline text-headline-sm text-[#172B4D]">Change Administrator Password</h3>
            <p class="text-xs text-[#64748B]/70">Stored securely using PBKDF2-SHA256 hashing on the backend</p>
          </div>
        </div>
        <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="changeAdminPwdForm" class="p-6 space-y-4">
        <div id="adminPwdErr" class="hidden p-3 rounded-lg bg-error/15 border border-error/45 text-rose-200 text-xs"></div>
        <div>
          <label class="block text-xs font-label text-[#64748B] mb-1">Current Password</label>
          <div class="relative flex items-center">
            <input id="admCurPwd" type="password" required placeholder="Enter current password" class="w-full pl-3.5 pr-11 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
            <button type="button" data-eye-target="admCurPwd" class="absolute right-2 w-8 h-8 flex items-center justify-center text-[#64748B]/70 hover:text-[#172B4D]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
          </div>
        </div>
        <div>
          <label class="block text-xs font-label text-[#64748B] mb-1">New Password (minimum 8 characters)</label>
          <div class="relative flex items-center">
            <input id="admNewPwd" type="password" required minlength="8" placeholder="Enter new strong password" class="w-full pl-3.5 pr-11 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
            <button type="button" data-eye-target="admNewPwd" class="absolute right-2 w-8 h-8 flex items-center justify-center text-[#64748B]/70 hover:text-[#172B4D]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
          </div>
        </div>
        <div>
          <label class="block text-xs font-label text-[#64748B] mb-1">Confirm New Password</label>
          <div class="relative flex items-center">
            <input id="admConfPwd" type="password" required minlength="8" placeholder="Re-enter new password" class="w-full pl-3.5 pr-11 py-2.5 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
            <button type="button" data-eye-target="admConfPwd" class="absolute right-2 w-8 h-8 flex items-center justify-center text-[#64748B]/70 hover:text-[#172B4D]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
          </div>
        </div>
        <div class="pt-4 border-t border-glass-border flex justify-end gap-3">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button id="saveAdminPwdBtn" type="submit" class="px-5 py-2 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label">Update Admin Password</button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelectorAll('[data-eye-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inp = host.querySelector(`#${btn.dataset.eyeTarget}`);
        if (!inp) return;
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.querySelector('.material-symbols-outlined').textContent = show ? 'visibility_off' : 'visibility';
      });
    });
    host.querySelector('#changeAdminPwdForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = host.querySelector('#adminPwdErr');
      errEl.classList.add('hidden');
      const cur = host.querySelector('#admCurPwd').value;
      const next = host.querySelector('#admNewPwd').value;
      const conf = host.querySelector('#admConfPwd').value;
      if (next.length < 8) {
        errEl.textContent = 'New password must be at least 8 characters.';
        errEl.classList.remove('hidden');
        return;
      }
      if (next !== conf) {
        errEl.textContent = 'New password and confirmation do not match.';
        errEl.classList.remove('hidden');
        return;
      }
      const btn = host.querySelector('#saveAdminPwdBtn');
      btn.disabled = true;
      btn.textContent = 'Updating...';
      const res = await store.changeAdminPassword(cur, next);
      btn.disabled = false;
      btn.textContent = 'Update Admin Password';
      if (!res.ok) {
        errEl.textContent = res.error || 'Failed to change password.';
        errEl.classList.remove('hidden');
        return;
      }
      closeModal();
      showToast('Administrator password updated securely!', 'success');
    });
  }, 'max-w-lg');
}

/* =========================================================================
   SCREEN 8: ADMIN DASHBOARD
   ========================================================================= */
export function renderAdminDashboard(container) {
  const { settings, students, teachers, materials, notices, timetable, events, timetableImage, activityLog } = store.state;
  const activeStudents = store.getActiveStudents();
  const liveTeachers = teachers.filter((t) => t.status === 'Streaming Live');
  const mustChangePwd = !!store.getAdminSession()?.mustChangePassword;

  container.innerHTML = `
    <div class="min-h-screen flex">
      ${renderAdminSidebar('admin/dashboard')}

      <div class="flex-1 flex flex-col min-w-0">
        <header class="sticky top-0 z-20 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-glass-border px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            ${renderMobileMenuButton()}
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="font-headline text-headline-sm text-[#172B4D]">Central Operations Console</h1>
                <span class="px-2.5 py-0.5 rounded-full bg-success/20 border border-success/40 text-success font-code text-xs">
                  System Online
                </span>
              </div>
              <p class="text-body-sm text-[#64748B]/70">${esc(settings.collegeName || 'Configure your institution name in College Settings')}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="relative w-56 hidden md:block">
              <span class="material-symbols-outlined absolute left-3 top-2.5 text-[#64748B]/60 text-[18px]">search</span>
              <input id="adminQuickSearch" type="text" placeholder="Search students..." class="w-full pl-9 pr-4 py-2 rounded-md bg-[#E6F4FF] border border-[#4A90E2]/20 text-[#172B4D] placeholder-[#64748B]/40 text-xs focus:border-[#4A90E2] outline-none" />
            </div>

            <button id="dashAddStudentBtn" type="button" class="px-4 py-2 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label flex items-center gap-1.5 shadow-[0_0_15px_rgba(74,144,226,0.35)] hover:shadow-[0_0_22px_rgba(74,144,226,0.5)] transition-all">
              <span class="material-symbols-outlined text-[16px]">person_add</span>
              <span>Add Student</span>
            </button>

            <button id="adminActivityBtn" type="button" title="Activity Log" class="w-9 h-9 rounded-md bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-center justify-center text-[#64748B] hover:text-[#172B4D] relative">
              <span class="material-symbols-outlined text-[20px]">notifications</span>
              ${activityLog.length > 0 ? `<span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-neon-purple"></span>` : ''}
            </button>
          </div>
        </header>

        <main class="p-4 sm:p-8 space-y-8 flex-1 animate-enter">
          ${mustChangePwd ? `
            <div class="p-4 rounded-xl bg-amber-500/15 border border-amber-500/45 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-amber-400 text-[24px]">security</span>
                <div class="text-xs">
                  <div class="font-label font-semibold text-[#172B4D]">Security Recommendation: Change Initial Administrator Password</div>
                  <div class="text-amber-700/80">You are currently signed in with the initial password. Update it now to secure your Admin Console.</div>
                </div>
              </div>
              <button id="dashChangePwdBtn" type="button" class="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-[#172B4D] text-xs font-label font-bold transition-colors">
                Change Password Now
              </button>
            </div>
          ` : ''}

          <!-- KPI Row (100% Real Dynamic Counts) -->
          <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <a href="#admin/students" class="p-5 rounded-lg bg-white/80 border border-glass-border hover:border-[#4A90E2]/30 shadow-[0_4px_24px_rgba(74,144,226,0.08)] transition-all relative overflow-hidden group">
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-body-sm text-[#64748B]/70 font-medium text-xs">Total Students</span>
                  <div class="font-code text-display-lg-mobile text-[#172B4D] font-bold mt-1 tracking-tight">${students.length.toLocaleString()}</div>
                </div>
                <div class="w-11 h-11 rounded-lg bg-neon-purple/20 border border-[#4A90E2]/25 text-neon-purple flex items-center justify-center shadow-[0_0_12px_rgba(74,144,226,0.15)]">
                  <span class="material-symbols-outlined text-[24px]">school</span>
                </div>
              </div>
              <div class="mt-4 flex items-center gap-2 text-xs font-code">
                <span class="${activeStudents.length > 0 ? 'text-success' : 'text-[#64748B]/60'} flex items-center gap-0.5">
                  <span class="material-symbols-outlined text-sm">verified_user</span> ${activeStudents.length} Active
                </span>
                <span class="text-[#64748B]/50">logged in</span>
              </div>
            </a>

            <a href="#admin/teachers" class="p-5 rounded-lg bg-white/80 border border-glass-border hover:border-[#4A90E2]/30 shadow-[0_4px_24px_rgba(74,144,226,0.08)] transition-all relative overflow-hidden group">
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-body-sm text-[#64748B]/70 font-medium text-xs">Faculty &amp; Professors</span>
                  <div class="font-code text-display-lg-mobile text-[#172B4D] font-bold mt-1 tracking-tight">${teachers.length.toLocaleString()}</div>
                </div>
                <div class="w-11 h-11 rounded-lg bg-electric-violet/20 border border-electric-violet/40 text-electric-violet flex items-center justify-center shadow-[0_0_12px_rgba(74,144,226,0.15)]">
                  <span class="material-symbols-outlined text-[24px]">co_present</span>
                </div>
              </div>
              <div class="mt-4 flex items-center gap-2 text-xs font-code">
                <span class="${liveTeachers.length > 0 ? 'text-success' : 'text-[#64748B]/60'} flex items-center gap-0.5">
                  <span class="material-symbols-outlined text-sm">check_circle</span> ${liveTeachers.length} Live
                </span>
                <span class="text-[#64748B]/50">${teachers.length === 0 ? 'none registered' : 'registered faculty'}</span>
              </div>
            </a>

            <a href="#admin/resources" class="p-5 rounded-lg bg-white/80 border border-glass-border hover:border-[#4A90E2]/30 shadow-[0_4px_24px_rgba(74,144,226,0.08)] transition-all relative overflow-hidden group">
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-body-sm text-[#64748B]/70 font-medium text-xs">Materials &amp; Notices</span>
                  <div class="font-code text-display-lg-mobile text-[#172B4D] font-bold mt-1 tracking-tight">${(materials.length + notices.length).toLocaleString()}</div>
                </div>
                <div class="w-11 h-11 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                  <span class="material-symbols-outlined text-[24px]">campaign</span>
                </div>
              </div>
              <div class="mt-4 flex items-center gap-2 text-xs font-code">
                <span class="text-neon-purple font-semibold">${materials.length} Materials</span>
                <span class="text-[#64748B]/50">• ${notices.length} Notices</span>
              </div>
            </a>

            <a href="#admin/timetable" class="p-5 rounded-lg bg-white/80 border border-glass-border hover:border-[#4A90E2]/30 shadow-[0_4px_24px_rgba(74,144,226,0.08)] transition-all relative overflow-hidden group">
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-body-sm text-[#64748B]/70 font-medium text-xs">Timetable &amp; Events</span>
                  <div class="font-code text-display-lg-mobile text-[#172B4D] font-bold mt-1 tracking-tight">${(timetable.length + events.length).toLocaleString()}</div>
                </div>
                <div class="w-11 h-11 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <span class="material-symbols-outlined text-[24px]">event_upcoming</span>
                </div>
              </div>
              <div class="mt-4 flex items-center gap-2 text-xs font-code">
                <span class="${timetableImage ? 'text-emerald-400' : 'text-[#64748B]/60'}">${timetableImage ? 'Timetable Image Ready' : `${events.length} Events`}</span>
                <span class="text-[#64748B]/50">• ${timetable.length} Slots</span>
              </div>
            </a>
          </section>

          <!-- Operational Row -->
          <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left 2 Cols: Live AI Classroom Hub -->
            <div class="lg:col-span-2 p-6 rounded-xl bg-white/80 border border-[#4A90E2]/15 shadow-[0_4px_30px_rgba(74,144,226,0.08)] space-y-5">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 class="font-headline text-headline-sm text-[#172B4D]">Live AI Classroom Hub</h2>
                  <p class="text-body-sm text-[#64748B]/70 text-xs mt-0.5">Real-time status of registered faculty classrooms</p>
                </div>
                <span class="px-3 py-1 rounded-full ${liveTeachers.length > 0 ? 'bg-neon-purple/20 border-[#4A90E2]/25 text-neon-purple' : 'bg-[#F0F8FF] border-glass-border text-[#64748B]/60'} border font-code text-xs flex items-center gap-1.5">
                  ${liveTeachers.length > 0 ? '<span class="w-2 h-2 rounded-full bg-neon-purple animate-ping"></span>' : '<span class="w-2 h-2 rounded-full bg-cyber-lavender/40"></span>'}
                  ${liveTeachers.length} ${liveTeachers.length === 1 ? 'Hall' : 'Halls'} Live
                </span>
              </div>

              ${teachers.length === 0 ? `
                <div class="p-6 rounded-xl bg-[#E6F4FF]/50/80 border border-dashed border-glass-border text-center space-y-3">
                  <div class="w-12 h-12 mx-auto rounded-xl bg-neon-purple/15 border border-[#4A90E2]/20 text-neon-purple flex items-center justify-center">
                    <span class="material-symbols-outlined text-[24px]">co_present</span>
                  </div>
                  <div>
                    <h3 class="font-headline text-title-md text-[#172B4D]">No Faculty Registered Yet</h3>
                    <p class="text-xs text-[#64748B]/65 mt-0.5">Add professors in Manage Teachers to manage classroom sessions here.</p>
                  </div>
                  <a href="#admin/teachers" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-neon-purple/20 hover:bg-neon-purple/35 border border-[#4A90E2]/25 text-xs font-label text-[#172B4D] transition-colors">
                    <span class="material-symbols-outlined text-[16px]">person_add</span>
                    <span>Go to Manage Teachers</span>
                  </a>
                </div>
              ` : `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  ${teachers.slice(0, 4).map((t) => `
                    <div class="p-4 rounded-lg bg-[#E6F4FF]/50 border ${t.status === 'Streaming Live' ? 'border-[#4A90E2]/25' : 'border-glass-border'} relative group">
                      <div class="flex items-center justify-between mb-2 gap-2">
                        <span class="font-code text-xs text-neon-purple font-semibold truncate">${esc((t.hall || 'Unassigned Hall').toUpperCase())}</span>
                        <span class="px-2 py-0.5 rounded-full ${t.status === 'Streaming Live' ? 'bg-success/20 text-success border-success/30' : 'bg-[#E6F4FF] text-[#64748B] border-white/20'} font-code text-[11px] border shrink-0">
                          ${esc(t.status || 'Offline')}
                        </span>
                      </div>
                      <h3 class="font-headline text-title-md text-[#172B4D] truncate">${esc(t.course || 'No Course Assigned')}</h3>
                      <p class="text-body-sm text-[#64748B]/65 text-xs truncate">Instructor: ${esc(t.name)}</p>
                      <div class="mt-3 pt-3 border-t border-glass-border flex items-center justify-between text-xs font-code text-[#64748B]/60">
                        <span>${esc(t.department || 'No Dept')}</span>
                        <button type="button" data-toggle-hub-live="${esc(t.id)}" class="text-neon-purple hover:underline">
                          ${t.status === 'Streaming Live' ? 'End Stream' : 'Start Live'}
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}

              <div class="pt-2 flex flex-wrap items-center gap-3">
                <button id="emergencyAlertBtn" type="button" class="px-3.5 py-2 rounded-md bg-error/15 hover:bg-error/25 border border-error/40 text-xs font-label text-rose-200 flex items-center gap-1.5 transition-colors">
                  <span class="material-symbols-outlined text-[16px] text-error">campaign</span>
                  Broadcast Emergency Alert
                </button>
                <a href="#admin/timetable" class="px-3.5 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] border border-glass-border text-xs font-label text-[#172B4D] flex items-center gap-1.5 transition-colors">
                  <span class="material-symbols-outlined text-[16px] text-electric-violet">calendar_month</span>
                  Manage Timetable
                </a>
                <a href="#student/home" target="_blank" class="px-3.5 py-2 rounded-md bg-neon-purple/15 hover:bg-neon-purple/25 border border-[#4A90E2]/25 text-xs font-label text-[#64748B] hover:text-[#172B4D] flex items-center gap-1.5 transition-colors">
                  <span class="material-symbols-outlined text-[16px] text-neon-purple">open_in_new</span>
                  Open Student Portal
                </a>
              </div>
            </div>

            <!-- Right 1 Col: Recent Notices -->
            <div class="p-6 rounded-xl bg-white/80 border border-[#4A90E2]/15 shadow-[0_4px_30px_rgba(74,144,226,0.08)] space-y-4">
              <div class="flex items-center justify-between">
                <h2 class="font-headline text-title-lg text-[#172B4D]">Recent Notices</h2>
                <button id="publishNoticeBtn" type="button" class="text-xs font-label text-neon-purple hover:underline">+ Publish New</button>
              </div>
              ${notices.length === 0 ? `
                <div class="p-6 rounded-lg bg-[#E6F4FF]/60 border border-dashed border-glass-border text-center space-y-2">
                  <span class="material-symbols-outlined text-[#64748B]/40 text-[28px]">campaign</span>
                  <p class="text-xs text-[#64748B]/65">No notices published yet.</p>
                </div>
              ` : `
                <div class="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  ${notices.slice(0, 5).map((n) => `
                    <div class="p-3 rounded-lg bg-[#F0F8FF] border border-[#4A90E2]/10 group">
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-code text-[11px] ${n.tagColor === 'amber' ? 'text-amber-400' : n.tagColor === 'emerald' ? 'text-emerald-400' : 'text-neon-purple'} font-medium truncate">${esc(n.category)}</span>
                        <div class="flex items-center gap-1 shrink-0">
                          <span class="text-[10px] font-code text-[#64748B]/50">${esc(n.timeLabel)}</span>
                          <button type="button" data-dash-del-not="${esc(n.id)}" title="Delete Notice" class="p-1 rounded hover:bg-error/20 text-[#64748B]/60 hover:text-error transition-colors">
                            <span class="material-symbols-outlined text-[15px]">delete</span>
                          </button>
                        </div>
                      </div>
                      <h4 class="text-sm font-label font-semibold text-[#172B4D]">${esc(n.title)}</h4>
                      <p class="text-body-sm text-[#64748B]/70 text-xs mt-1">${esc(n.body)}</p>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </section>

          <!-- Real-Time Activity Log (Real Events Only) -->
          <section class="p-5 rounded-xl bg-white/75 border border-[#4A90E2]/10">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-headline text-title-md text-[#172B4D] flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                Recent System Activity
              </h3>
              <span class="font-code text-[11px] text-[#64748B]/60">Revision #${store.state.revision}</span>
            </div>
            ${activityLog.length === 0 ? `
              <p class="text-xs font-code text-[#64748B]/50 py-2">No recorded admin or student activity yet.</p>
            ` : `
              <div class="space-y-1.5 font-code text-xs max-h-36 overflow-y-auto">
                ${activityLog.slice(0, 8).map((a) => `
                  <div class="flex items-center justify-between gap-4 py-1 border-b border-white/5 last:border-0">
                    <span class="text-[#64748B]/90">${esc(a.text)}</span>
                    <span class="text-[#64748B]/45 text-[10px] shrink-0">${new Date(a.time).toLocaleTimeString()}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </section>

          <!-- Online Students Widget (live presence) -->
          <section id="onlineStudentsWidget" class="p-5 rounded-xl bg-white/75 border border-[#4A90E2]/10">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
              <h3 class="font-headline text-title-md text-[#172B4D]">Currently Online</h3>
              <span id="onlineCountBadge" class="ml-auto font-code text-[11px] text-[#64748B]/60">Loading…</span>
            </div>
            <div id="onlineStudentsList" class="text-xs text-[#64748B]/60 font-code">Fetching presence data…</div>
          </section>
        </main>
      </div>
    </div>
  `;

  bindAdminSidebarToggle(container);
  container.querySelector('#settingsChangeAdminPwdBtn')?.addEventListener('click', () => openChangeAdminPasswordModal());
  container.querySelector('#dashChangePwdBtn')?.addEventListener('click', () => openChangeAdminPasswordModal());
  container.querySelector('#dashAddStudentBtn').addEventListener('click', () => openAddEditStudentModal());
  container.querySelector('#publishNoticeBtn').addEventListener('click', () => openNoticeModal());
  container.querySelector('#emergencyAlertBtn').addEventListener('click', () => openEmergencyBroadcastModal());

  container.querySelectorAll('[data-toggle-hub-live]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.toggleTeacherLive(btn.dataset.toggleHubLive);
      showToast('Classroom live status updated!', 'purple');
    });
  });

  container.querySelectorAll('[data-dash-del-not]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = notices.find((x) => x.id === btn.dataset.dashDelNot);
      if (!target) return;
      confirmDelete({
        title: 'Delete Notice',
        itemName: target.title,
        onConfirm: async () => {
          await store.deleteNotice(target.id);
          showToast('Notice deleted.', 'warning');
        },
      });
    });
  });

  container.querySelector('#adminQuickSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      studentSearch = e.target.value.trim();
      window.location.hash = '#admin/students';
    }
  });

  container.querySelector('#adminActivityBtn').addEventListener('click', () => {
    openModal(`
      <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden">
        <div class="px-5 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
          <h3 class="font-headline text-title-lg text-[#172B4D]">Real-Time Activity Log</h3>
          <button data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="p-5 space-y-2 max-h-[60vh] overflow-y-auto font-code text-xs">
          ${activityLog.length === 0 ? `<p class="text-[#64748B]/60">No activity recorded yet.</p>` : activityLog.map((a) => `
            <div class="p-2.5 rounded-lg bg-[#F0F8FF] border border-[#4A90E2]/10 flex justify-between gap-3">
              <span class="text-[#172B4D]">${esc(a.text)}</span>
              <span class="text-[#64748B]/50 shrink-0">${new Date(a.time).toLocaleTimeString()}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `);
  });

  // Fetch and render online student presence (non-blocking)
  store.getOnlineStudents().then((online) => {
    const widgetEl = container.querySelector('#onlineStudentsWidget');
    const countEl = container.querySelector('#onlineCountBadge');
    const listEl = container.querySelector('#onlineStudentsList');
    if (!widgetEl) return;
    if (countEl) countEl.textContent = `${online.length} online`;
    if (listEl) {
      if (online.length === 0) {
        listEl.innerHTML = '<span class="text-[#64748B]/50">No students currently online.</span>';
      } else {
        listEl.innerHTML = online.map((s) => `
          <span class="inline-flex items-center gap-1.5 mr-3 mb-1.5">
            <span class="w-2 h-2 rounded-full bg-success inline-block"></span>
            <span class="text-[#172B4D] font-medium">${esc(s.name || s.studentId)}</span>
          </span>
        `).join('');
      }
    }
  }).catch(() => {
    const listEl = container.querySelector('#onlineStudentsList');
    if (listEl) listEl.textContent = 'Presence data unavailable.';
  });
}

/* =========================================================================
   SCREEN 9: ADMIN MANAGE STUDENTS
   ========================================================================= */
let studentSearch = '';
let studentDeptFilter = 'ALL';
let studentYearFilter = 'ALL';
let studentStatusFilter = 'ALL';

export function renderAdminStudents(container) {
  const { students } = store.state;
  const activeStudents = store.getActiveStudents();
  const deptOpts = getDepartmentOptions();
  students.forEach((s) => {
    if (s.department && !deptOpts.includes(s.department)) deptOpts.push(s.department);
  });
  if (studentDeptFilter !== 'ALL' && !deptOpts.includes(studentDeptFilter)) {
    studentDeptFilter = 'ALL';
  }

  const filtered = students.filter((s) => {
    const q = studentSearch.toLowerCase();
    const matchQ =
      !q ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.regNo || '').toLowerCase().includes(q) ||
      (s.department || '').toLowerCase().includes(q);
    const matchD = studentDeptFilter === 'ALL' || s.department === studentDeptFilter;
    const matchY = studentYearFilter === 'ALL' || s.year === studentYearFilter;
    const matchSt =
      studentStatusFilter === 'ALL' ||
      (studentStatusFilter === 'ACTIVE' && s.hasLoggedIn === true && s.status !== 'Deactivated') ||
      (studentStatusFilter === 'NEVER_LOGGED_IN' && !s.hasLoggedIn && s.status !== 'Deactivated') ||
      (studentStatusFilter === 'DEACTIVATED' && s.status === 'Deactivated');
    return matchQ && matchD && matchY && matchSt;
  });

  container.innerHTML = `
    <div class="min-h-screen flex">
      ${renderAdminSidebar('admin/students')}

      <div class="flex-1 flex flex-col min-w-0">
        <header class="sticky top-0 z-20 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-glass-border px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            ${renderMobileMenuButton()}
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="font-headline text-headline-sm text-[#172B4D]">Student Directory &amp; Enrollment</h1>
                <span class="font-code text-xs px-2.5 py-0.5 rounded-full bg-neon-purple/20 text-[#64748B] border border-[#4A90E2]/20">
                  ${students.length} Total
                </span>
                <span class="font-code text-xs px-2.5 py-0.5 rounded-full ${activeStudents.length > 0 ? 'bg-success/20 text-success border-success/30' : 'bg-[#F0F8FF] text-[#64748B]/60 border-glass-border'} border">
                  ${activeStudents.length} Active (Logged In)
                </span>
              </div>
              <p class="text-body-sm text-[#64748B]/70">Add, edit, deactivate, or remove students. Active count tracks students who have signed in.</p>
            </div>
          </div>

          <button id="openEnrollModalBtn" type="button" class="px-4 py-2.5 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label flex items-center gap-2 shadow-[0_0_20px_rgba(74,144,226,0.2)] hover:shadow-[0_0_28px_rgba(74,144,226,0.6)] transition-all border border-[#4A90E2]/35 active:scale-95">
            <span class="material-symbols-outlined text-[18px]">person_add</span>
            <span>Add Student</span>
          </button>
        </header>

        <main class="p-4 sm:p-8 space-y-6 flex-1 animate-enter">
          <div class="p-4 rounded-xl bg-white/80 border border-[#4A90E2]/15 flex flex-wrap items-center justify-between gap-4">
            <div class="relative w-full sm:w-80">
              <span class="material-symbols-outlined absolute left-3 top-2.5 text-[#64748B]/60 text-[18px]">search</span>
              <input id="stuSearchInp" type="text" value="${esc(studentSearch)}" placeholder="Search by name, email, register number..." class="w-full pl-9 pr-4 py-2 rounded-md bg-white/85 border border-glass-border text-[#172B4D] placeholder-[#64748B]/40 text-xs focus:border-[#4A90E2] outline-none font-body" />
            </div>

            <div class="flex flex-wrap items-center gap-2.5">
              <select id="stuDeptSel" class="px-3 py-2 rounded-md bg-white/85 border border-glass-border text-[#64748B] text-xs focus:border-[#4A90E2] outline-none">
                <option value="ALL">All Departments</option>
                ${deptOpts.map((d) => `<option value="${esc(d)}" ${studentDeptFilter === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
              </select>

              <select id="stuYearSel" class="px-3 py-2 rounded-md bg-white/85 border border-glass-border text-[#64748B] text-xs focus:border-[#4A90E2] outline-none">
                <option value="ALL">All Years</option>
                ${['Year 1', 'Year 2', 'Year 3', 'Year 4'].map((y) => `<option value="${y}" ${studentYearFilter === y ? 'selected' : ''}>${y}</option>`).join('')}
              </select>

              <select id="stuStatusSel" class="px-3 py-2 rounded-md bg-white/85 border border-glass-border text-[#64748B] text-xs focus:border-[#4A90E2] outline-none">
                <option value="ALL">All Login Statuses</option>
                <option value="ACTIVE" ${studentStatusFilter === 'ACTIVE' ? 'selected' : ''}>Active (Logged In)</option>
                <option value="NEVER_LOGGED_IN" ${studentStatusFilter === 'NEVER_LOGGED_IN' ? 'selected' : ''}>Not Logged In</option>
                <option value="DEACTIVATED" ${studentStatusFilter === 'DEACTIVATED' ? 'selected' : ''}>Deactivated</option>
              </select>

              <button id="exportCsvBtn" type="button" ${students.length === 0 ? 'disabled' : ''} class="px-3 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#172B4D] text-xs border border-glass-border flex items-center gap-1 transition-colors disabled:opacity-40">
                <span class="material-symbols-outlined text-[16px]">file_download</span>
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          ${students.length === 0 ? `
            <div class="p-12 rounded-2xl bg-white/75 border border-dashed border-[#4A90E2]/20 text-center space-y-4 max-w-xl mx-auto my-8">
              <div class="w-16 h-16 mx-auto rounded-2xl bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] flex items-center justify-center">
                <span class="material-symbols-outlined text-[32px]">group</span>
              </div>
              <div class="space-y-1.5">
                <h2 class="font-headline text-headline-sm text-[#172B4D]">No Students Added Yet</h2>
                <p class="text-xs text-[#64748B]/70 max-w-md mx-auto leading-relaxed">
                  Add students one by one using the Add Student button. Students are counted as Active only after they log in successfully.
                </p>
              </div>
              <button id="emptyAddStudentBtn" type="button" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_20px_rgba(74,144,226,0.2)] border border-[#4A90E2]/35">
                <span class="material-symbols-outlined text-[18px]">person_add</span>
                <span>Add First Student</span>
              </button>
            </div>
          ` : filtered.length === 0 ? `
            <div class="p-10 rounded-xl bg-white/85/75 border border-glass-border text-center space-y-3">
              <p class="text-sm text-[#172B4D] font-label">No students match the selected filters.</p>
              <button id="clearStuFiltersBtn" type="button" class="px-4 py-1.5 rounded-md bg-[#F0F8FF] border border-[#4A90E2]/10 text-xs text-[#64748B] hover:text-[#172B4D]">Clear Filters</button>
            </div>
          ` : `
            <div class="rounded-xl bg-white/80 border border-[#4A90E2]/15 shadow-[0_4px_30px_rgba(74,144,226,0.08)] overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="border-b border-glass-border bg-[#E6F4FF]/50 text-[#64748B]/70 font-code text-[11px] uppercase tracking-wider">
                      <th class="p-4 pl-6">Student</th>
                      <th class="p-4">Register Number</th>
                      <th class="p-4">Department / Program</th>
                      <th class="p-4">Year &amp; Sec</th>
                      <th class="p-4">Login Status</th>
                      <th class="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-glass-border/50 text-sm">
                    ${filtered.map((stu) => {
                      const isDeact = stu.status === 'Deactivated';
                      const isActive = stu.hasLoggedIn === true && !isDeact;
                      return `
                        <tr class="hover:bg-white/[0.02] transition-colors group ${isDeact ? 'opacity-60' : ''}">
                          <td class="p-4 pl-6">
                            <div class="flex items-center gap-3">
                              <div class="w-9 h-9 rounded-full ${isDeact ? 'bg-[#E6F4FF]' : 'bg-gradient-to-tr from-neon-purple to-deep-violet'} p-[1px] shrink-0">
                                <div class="w-full h-full rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#64748B] overflow-hidden">
                                  ${stu.avatarDataUrl ? `<img src="${esc(stu.avatarDataUrl)}" class="w-full h-full object-cover" />` : esc(stu.initials)}
                                </div>
                              </div>
                              <div>
                                <div class="font-label font-semibold text-[#172B4D]">${esc(stu.name)}</div>
                                <div class="text-xs text-[#64748B]/60">${esc(stu.email)}${stu.phone ? ` • <span class="font-code text-[#64748B]/75">${esc(stu.phone)}</span>` : ''}</div>
                              </div>
                            </div>
                          </td>
                          <td class="p-4 font-code text-xs text-neon-purple font-medium">${esc(stu.regNo)}</td>
                          <td class="p-4 text-xs">
                            <div class="text-dark-on-surface">${esc(stu.department || '—')}</div>
                            ${stu.program ? `<div class="text-[11px] text-[#64748B]/55">${esc(stu.program)}</div>` : ''}
                          </td>
                          <td class="p-4 font-code text-xs text-[#64748B]">${esc(stu.year)} • ${esc(stu.section)}</td>
                          <td class="p-4">
                            ${isDeact ? `
                              <span class="px-2.5 py-0.5 rounded-full bg-[#E6F4FF] text-[#172B4D]/50 text-[11px] font-code border border-white/20 inline-flex items-center gap-1">
                                Deactivated
                              </span>
                            ` : isActive ? `
                              <span class="px-2.5 py-0.5 rounded-full bg-success/20 text-success text-[11px] font-code border border-success/40 inline-flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                                Active (Logged In)
                              </span>
                            ` : `
                              <span class="px-2.5 py-0.5 rounded-full bg-[#F0F8FF] text-[#64748B]/75 text-[11px] font-code border border-glass-border inline-flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-cyber-lavender/50"></span>
                                Not Logged In
                              </span>
                            `}
                          </td>
                          <td class="p-4 pr-6 text-right">
                            <div class="flex items-center justify-end gap-1.5">
                              <button type="button" data-edit-stu="${esc(stu.id)}" class="p-1.5 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]" title="Edit Student">
                                <span class="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                              <button type="button" data-toggle-stu="${esc(stu.id)}" class="p-1.5 rounded hover:bg-amber-500/20 text-[#64748B] hover:text-amber-400" title="${isDeact ? 'Reactivate Account' : 'Deactivate Account'}">
                                <span class="material-symbols-outlined text-[18px]">${isDeact ? 'refresh' : 'block'}</span>
                              </button>
                              <button type="button" data-del-stu="${esc(stu.id)}" class="p-1.5 rounded hover:bg-error/20 text-[#64748B] hover:text-error" title="Delete Student">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>

              <div class="p-4 border-t border-glass-border bg-[#E6F4FF]/50 flex items-center justify-between text-xs font-code text-[#64748B]/60">
                <span>Showing ${filtered.length} of ${students.length} students (${activeStudents.length} active)</span>
                <span class="text-neon-purple">Synced live</span>
              </div>
            </div>
          `}
        </main>
      </div>
    </div>
  `;

  bindAdminSidebarToggle(container);
  container.querySelector('#settingsChangeAdminPwdBtn')?.addEventListener('click', () => openChangeAdminPasswordModal());
  container.querySelector('#openEnrollModalBtn').addEventListener('click', () => openAddEditStudentModal());
  container.querySelector('#emptyAddStudentBtn')?.addEventListener('click', () => openAddEditStudentModal());

  container.querySelector('#stuSearchInp').addEventListener('input', (e) => {
    studentSearch = e.target.value;
    renderAdminStudents(container);
    const el = container.querySelector('#stuSearchInp');
    el.focus();
    el.setSelectionRange(studentSearch.length, studentSearch.length);
  });

  container.querySelector('#stuDeptSel').addEventListener('change', (e) => { studentDeptFilter = e.target.value; renderAdminStudents(container); });
  container.querySelector('#stuYearSel').addEventListener('change', (e) => { studentYearFilter = e.target.value; renderAdminStudents(container); });
  container.querySelector('#stuStatusSel').addEventListener('change', (e) => { studentStatusFilter = e.target.value; renderAdminStudents(container); });
  container.querySelector('#clearStuFiltersBtn')?.addEventListener('click', () => {
    studentSearch = '';
    studentDeptFilter = 'ALL';
    studentYearFilter = 'ALL';
    studentStatusFilter = 'ALL';
    renderAdminStudents(container);
  });

  container.querySelector('#exportCsvBtn').addEventListener('click', () => {
    const header = 'Name,Email,Phone,RegisterNo,Department,Program,Year,Section,HasLoggedIn,Status\n';
    const rows = filtered.map((s) => `"${s.name}","${s.email}","${s.phone || ''}","${s.regNo}","${s.department || ''}","${s.program || ''}","${s.year}","${s.section}","${s.hasLoggedIn ? 'Yes' : 'No'}","${s.status}"`).join('\n');
    downloadTextFile('LiveAIClassroom_Students.csv', header + rows);
    showToast(`Exported ${filtered.length} student records to CSV!`, 'success');
  });

  container.querySelectorAll('[data-edit-stu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stu = students.find((x) => x.id === btn.dataset.editStu);
      if (stu) openAddEditStudentModal(stu);
    });
  });

  container.querySelectorAll('[data-toggle-stu]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const stu = students.find((x) => x.id === btn.dataset.toggleStu);
      if (!stu) return;
      const next = stu.status === 'Deactivated' ? (stu.hasLoggedIn ? 'Active' : 'Registered') : 'Deactivated';
      await store.updateStudent(stu.id, { status: next });
      showToast(`${stu.name} status updated to ${next}`, next === 'Deactivated' ? 'warning' : 'success');
    });
  });

  container.querySelectorAll('[data-del-stu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stu = students.find((x) => x.id === btn.dataset.delStu);
      if (!stu) return;
      confirmDelete({
        title: 'Delete Student Record',
        itemName: `${stu.name} (${stu.regNo})`,
        onConfirm: async () => {
          await store.deleteStudent(stu.id);
          showToast(`Removed student ${stu.name}.`, 'warning');
        },
      });
    });
  });
}

/* =========================================================================
   SCREEN 10: ADMIN MANAGE TEACHERS
   ========================================================================= */
let teacherSearch = '';
let teacherDeptFilter = 'ALL';
let teacherStatusFilter = 'ALL';

export function renderAdminTeachers(container) {
  const teachers = store.state.teachers || [];
  const deptOpts = getDepartmentOptions();
  teachers.forEach((t) => {
    if (t.department && !deptOpts.includes(t.department)) deptOpts.push(t.department);
  });
  if (teacherDeptFilter !== 'ALL' && !deptOpts.includes(teacherDeptFilter)) {
    teacherDeptFilter = 'ALL';
  }
  const liveCount = teachers.filter((t) => t.status === 'Streaming Live').length;

  const filtered = teachers.filter((t) => {
    const q = teacherSearch.toLowerCase();
    const matchQ =
      !q ||
      (t.name || '').toLowerCase().includes(q) ||
      (t.course || '').toLowerCase().includes(q) ||
      (t.staffId || '').toLowerCase().includes(q) ||
      (t.department || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q);
    const matchD = teacherDeptFilter === 'ALL' || t.department === teacherDeptFilter;
    const matchS = teacherStatusFilter === 'ALL' || t.status === teacherStatusFilter;
    return matchQ && matchD && matchS;
  });

  container.innerHTML = `
    <div class="min-h-screen flex">
      ${renderAdminSidebar('admin/teachers')}

      <div class="flex-1 flex flex-col min-w-0">
        <header class="sticky top-0 z-20 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-glass-border px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            ${renderMobileMenuButton()}
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="font-headline text-headline-sm text-[#172B4D]">Faculty &amp; Teacher Management</h1>
                <span class="font-code text-xs px-2.5 py-0.5 rounded-full bg-neon-purple/20 text-[#64748B] border border-[#4A90E2]/20">
                  ${teachers.length} Registered
                </span>
                <span class="font-code text-xs px-2.5 py-0.5 rounded-full ${liveCount > 0 ? 'bg-success/20 text-success border-success/30' : 'bg-[#F0F8FF] text-[#64748B]/60 border-glass-border'} border">
                  ${liveCount} Live Now
                </span>
              </div>
              <p class="text-body-sm text-[#64748B]/70">Register professors, assign departments and courses, and manage classroom sessions</p>
            </div>
          </div>

          <button id="openAddTeacherBtn" type="button" class="px-4 py-2.5 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label flex items-center gap-2 shadow-[0_0_20px_rgba(74,144,226,0.2)] border border-[#4A90E2]/35 active:scale-95 transition-transform">
            <span class="material-symbols-outlined text-[18px]">person_add</span>
            <span>Add New Professor</span>
          </button>
        </header>

        <main class="p-4 sm:p-8 space-y-6 flex-1 animate-enter">
          <div class="p-4 rounded-xl bg-white/80 border border-[#4A90E2]/15 flex flex-wrap items-center justify-between gap-4">
            <div class="relative w-full sm:w-80">
              <span class="material-symbols-outlined absolute left-3 top-2.5 text-[#64748B]/60 text-[18px]">search</span>
              <input id="teaSearchInp" type="text" value="${esc(teacherSearch)}" placeholder="Search professor name, course, staff ID..." class="w-full pl-9 pr-4 py-2 rounded-md bg-white/85 border border-glass-border text-[#172B4D] placeholder-[#64748B]/40 text-xs focus:border-[#4A90E2] outline-none font-body" />
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <select id="teaDeptSel" class="px-3 py-2 rounded-md bg-white/85 border border-glass-border text-[#64748B] text-xs focus:border-[#4A90E2] outline-none">
                <option value="ALL">All Departments</option>
                ${deptOpts.map((dept) => `<option value="${esc(dept)}" ${teacherDeptFilter === dept ? 'selected' : ''}>${esc(dept)}</option>`).join('')}
              </select>
              <select id="teaStatusSel" class="px-3 py-2 rounded-md bg-white/85 border border-glass-border text-[#64748B] text-xs focus:border-[#4A90E2] outline-none">
                <option value="ALL">All Statuses</option>
                <option value="Streaming Live" ${teacherStatusFilter === 'Streaming Live' ? 'selected' : ''}>Streaming Live</option>
                <option value="Office Hours" ${teacherStatusFilter === 'Office Hours' ? 'selected' : ''}>Office Hours</option>
                <option value="Offline" ${teacherStatusFilter === 'Offline' ? 'selected' : ''}>Offline</option>
              </select>
            </div>
          </div>

          ${teachers.length === 0 ? `
            <div class="p-12 rounded-2xl bg-white/75 border border-dashed border-[#4A90E2]/20 text-center space-y-4 max-w-xl mx-auto my-8">
              <div class="w-16 h-16 mx-auto rounded-2xl bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] flex items-center justify-center">
                <span class="material-symbols-outlined text-[32px]">co_present</span>
              </div>
              <div class="space-y-1.5">
                <h2 class="font-headline text-headline-sm text-[#172B4D]">No Teachers Registered Yet</h2>
                <p class="text-xs text-[#64748B]/70 max-w-md mx-auto leading-relaxed">
                  Add professors manually using Add New Professor to assign courses, departments, and classrooms.
                </p>
              </div>
              <button id="emptyAddTeacherBtn" type="button" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_20px_rgba(74,144,226,0.2)] border border-[#4A90E2]/35">
                <span class="material-symbols-outlined text-[18px]">person_add</span>
                <span>Add New Professor</span>
              </button>
            </div>
          ` : filtered.length === 0 ? `
            <div class="p-10 rounded-xl bg-white/85/75 border border-glass-border text-center space-y-3">
              <p class="text-sm text-[#172B4D] font-label">No matching teachers found.</p>
              <button id="clearTeaFiltersBtn" type="button" class="px-4 py-1.5 rounded-md bg-[#F0F8FF] border border-[#4A90E2]/10 text-xs text-[#64748B] hover:text-[#172B4D]">Clear Filters</button>
            </div>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              ${filtered.map((t) => {
                const isLive = t.status === 'Streaming Live';
                const classesCount = Number(t.classesToday) || 0;
                return `
                  <article class="p-5 rounded-xl bg-white/80 border ${isLive ? 'border-[#4A90E2]/30 shadow-[0_4px_24px_rgba(74,144,226,0.18)]' : 'border-glass-border shadow-[0_4px_24px_rgba(0,0,0,0.5)]'} space-y-4 relative group">
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex items-center gap-3 min-w-0">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-neon-purple to-deep-violet p-[1.5px] shrink-0">
                          <div class="w-full h-full rounded-xl bg-white flex items-center justify-center font-headline text-[#172B4D] font-bold">
                            ${esc(t.initials)}
                          </div>
                        </div>
                        <div class="min-w-0">
                          <h3 class="font-headline text-title-md text-[#172B4D] truncate">${esc(t.name)}</h3>
                          <span class="font-code text-[11px] text-neon-purple block truncate">${esc(t.staffId)}</span>
                        </div>
                      </div>
                      <span class="px-2 py-0.5 rounded-full font-code text-[11px] border flex items-center gap-1 shrink-0 ${
                        isLive ? 'bg-success/20 text-success border-success/40' : 'bg-[#E6F4FF] text-[#64748B] border-white/20'
                      }">
                        ${isLive ? `<span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>` : ''}
                        ${esc(t.statusBadge || t.status || 'Offline')}
                      </span>
                    </div>

                    <div class="space-y-1.5 text-xs">
                      <div class="flex items-center justify-between gap-2 text-[#64748B]/70">
                        <span>Email:</span>
                        <span class="text-[#64748B] font-code text-[11px] truncate">${esc(t.email || '—')}</span>
                      </div>
                      <div class="flex items-center justify-between gap-2 text-[#64748B]/70">
                        <span>Department:</span>
                        <span class="text-[#172B4D] font-medium truncate">${esc(t.department || '—')}</span>
                      </div>
                      <div class="flex items-center justify-between gap-2 text-[#64748B]/70">
                        <span>Course:</span>
                        <span class="text-[#172B4D] font-medium truncate">${esc(t.course || '—')}</span>
                      </div>
                      <div class="flex items-center justify-between gap-2 text-[#64748B]/70">
                        <span>Room / Hall:</span>
                        <span class="text-[#172B4D] font-code text-[11px] truncate">${esc(t.hall || 'Unassigned')}</span>
                      </div>
                    </div>

                    <div class="pt-3 border-t border-glass-border flex items-center justify-between gap-2">
                      <span class="text-xs font-code text-[#64748B]/60">${classesCount} ${classesCount === 1 ? 'Class' : 'Classes'} Today</span>
                      <div class="flex items-center gap-1.5">
                        <button type="button" data-toggle-tea="${esc(t.id)}" class="px-2.5 py-1 rounded-md ${isLive ? 'bg-success/20 text-success border border-success/40' : 'bg-[#F0F8FF] hover:bg-[#4A90E2]/10 text-[#64748B] hover:text-[#172B4D] border border-glass-border'} text-xs font-label flex items-center gap-1 transition-colors">
                          <span class="material-symbols-outlined text-[15px]">videocam</span>
                          <span>${isLive ? 'End Live' : 'Start Live'}</span>
                        </button>
                        <button type="button" data-edit-tea="${esc(t.id)}" class="p-1.5 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]" title="Edit Teacher">
                          <span class="material-symbols-outlined text-[17px]">edit</span>
                        </button>
                        <button type="button" data-del-tea="${esc(t.id)}" class="p-1.5 rounded hover:bg-error/20 text-[#64748B] hover:text-error" title="Remove Teacher">
                          <span class="material-symbols-outlined text-[17px]">delete</span>
                        </button>
                      </div>
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
          `}
        </main>
      </div>
    </div>
  `;

  bindAdminSidebarToggle(container);
  container.querySelector('#settingsChangeAdminPwdBtn')?.addEventListener('click', () => openChangeAdminPasswordModal());
  container.querySelector('#teaSearchInp').addEventListener('input', (e) => {
    teacherSearch = e.target.value;
    renderAdminTeachers(container);
    const el = container.querySelector('#teaSearchInp');
    el.focus();
    el.setSelectionRange(teacherSearch.length, teacherSearch.length);
  });
  container.querySelector('#teaDeptSel').addEventListener('change', (e) => { teacherDeptFilter = e.target.value; renderAdminTeachers(container); });
  container.querySelector('#teaStatusSel').addEventListener('change', (e) => { teacherStatusFilter = e.target.value; renderAdminTeachers(container); });
  container.querySelector('#clearTeaFiltersBtn')?.addEventListener('click', () => {
    teacherSearch = '';
    teacherDeptFilter = 'ALL';
    teacherStatusFilter = 'ALL';
    renderAdminTeachers(container);
  });

  container.querySelectorAll('[data-toggle-tea]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.toggleTeacherLive(btn.dataset.toggleTea);
      showToast('Faculty live status updated!', 'purple');
    });
  });

  container.querySelectorAll('[data-edit-tea]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = teachers.find((x) => x.id === btn.dataset.editTea);
      if (target) openTeacherModal(target);
    });
  });

  container.querySelectorAll('[data-del-tea]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = teachers.find((x) => x.id === btn.dataset.delTea);
      if (!target) return;
      confirmDelete({
        title: 'Delete Teacher Record',
        itemName: `${target.name} (${target.staffId})`,
        onConfirm: async () => {
          await store.deleteTeacher(target.id);
          showToast(`Removed teacher ${target.name}.`, 'warning');
        },
      });
    });
  });

  container.querySelector('#openAddTeacherBtn').addEventListener('click', () => openTeacherModal());
  container.querySelector('#emptyAddTeacherBtn')?.addEventListener('click', () => openTeacherModal());
}

/* =========================================================================
   ADMIN ACADEMIC RESOURCES (Materials, Assignments & Notices — FULL CRUD)
   ========================================================================= */
function openMaterialModal(existing = null) {
  const isEdit = !!existing;
  const deptOpts = getDepartmentOptions();
  let pendingFile = existing
    ? {
        fileName: existing.fileName || '',
        mimeType: existing.mimeType || '',
        fileDataUrl: existing.fileDataUrl || '',
        size: existing.size || '',
        type: existing.type || 'pdf',
      }
    : null;

  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden shadow-[0_0_50px_rgba(74,144,226,0.15)]">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
        <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Study Material' : 'Upload Study Material / Notes'}</h3>
        <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="matModalForm" class="p-6 space-y-4">
        <div>
          <label class="block text-xs font-label text-[#64748B] mb-1">Upload File (PDF, DOC/DOCX, PPT, Image, TXT, ZIP)</label>
          <input id="matFileInp" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.zip" class="w-full text-xs text-[#64748B] file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-[#4A90E2]/20 file:text-[#172B4D] hover:file:bg-neon-purple/40" />
          <p id="matFileStatus" class="text-[11px] font-code text-[#64748B]/60 mt-1">${pendingFile?.fileName ? `Attached: ${esc(pendingFile.fileName)} (${esc(pendingFile.size)})` : 'Optional — attach a document, PDF, or image'}</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Subject / Course Code</label>
            <input id="matCourse" type="text" required value="${esc(existing?.course || '')}" placeholder="e.g. CS301 or Mathematics" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs font-label text-[#64748B] mb-1">Department / Tag</label>
            ${deptOpts.length > 0 ? `
              <select id="matModule" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]">
                <option value="Study Material">General</option>
                ${deptOpts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
              </select>
            ` : `
              <input id="matModule" type="text" value="${esc(existing?.module || '')}" placeholder="e.g. Unit 1 Notes" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
            `}
          </div>
        </div>
        <div>
          <label class="block text-xs font-label text-[#64748B] mb-1">Material Title</label>
          <input id="matTitle" type="text" required value="${esc(existing?.title || '')}" placeholder="Enter document or notes title" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
        </div>
        <div>
          <label class="block text-xs font-label text-[#64748B] mb-1">Notes / Summary</label>
          <textarea id="matSummary" rows="3" placeholder="Write description or study notes..." class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]">${esc(existing?.summary || '')}</textarea>
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-glass-border">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label">
            ${isEdit ? 'Save Material' : 'Upload to Vault'}
          </button>
        </div>
      </form>
    </div>
  `, (host) => {
    const fileInp = host.querySelector('#matFileInp');
    const statusEl = host.querySelector('#matFileStatus');
    const titleInp = host.querySelector('#matTitle');

    fileInp.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 12 * 1024 * 1024) {
        showToast('Please select a file under 12 MB.', 'warning');
        fileInp.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        pendingFile = {
          rawFile: file,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileDataUrl: reader.result,
          size: formatBytes(file.size),
          type: inferMaterialType(file.name, file.type || ''),
        };
        statusEl.textContent = `Ready: ${file.name} (${pendingFile.size})`;
        if (!titleInp.value.trim()) {
          titleInp.value = file.name.replace(/\.[^.]+$/, '');
        }
      };
      reader.readAsDataURL(file);
    });

    host.querySelector('#matModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const payload = {
        course: host.querySelector('#matCourse').value.trim(),
        module: host.querySelector('#matModule').value.trim(),
        title: host.querySelector('#matTitle').value.trim(),
        summary: host.querySelector('#matSummary').value.trim(),
        type: pendingFile?.type || 'pdf',
        fileName: pendingFile?.fileName || '',
        mimeType: pendingFile?.mimeType || '',
        fileDataUrl: pendingFile?.fileDataUrl || '',
        fileUrl: existing?.fileUrl || '',
        size: pendingFile?.size || '',
        meta: pendingFile?.fileName ? `${pendingFile.fileName} • ${pendingFile.size}` : 'Study Notes',
      };
      try {
        if (pendingFile?.rawFile) {
          submitBtn.textContent = 'Uploading File...';
          try {
            const adminToken = store.getAdminSession()?.token || '';
            const upUrlRes = await fetch('/api/upload-url', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(adminToken ? { 'X-Auth-Token': adminToken } : {}),
              },
              body: JSON.stringify({ fileName: pendingFile.fileName, folder: 'materials' }),
            });
            if (upUrlRes.ok) {
              const upUrlData = await upUrlRes.json();
              if (upUrlData.signedUrl) {
                const uploadRes = await fetch(upUrlData.signedUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': pendingFile.mimeType },
                  body: pendingFile.rawFile,
                });
                if (uploadRes.ok) {
                  payload.fileUrl = upUrlData.publicUrl;
                  payload.fileDataUrl = ''; // Clean cloud storage reference
                }
              }
            }
          } catch (upErr) {
            console.warn('[Upload] Cloud upload fallback to dataUrl:', upErr);
          }
        }
        submitBtn.textContent = 'Saving Record...';
        if (isEdit) {
          await store.updateMaterial(existing.id, payload);
          showToast('Study material updated and synced!', 'success');
        } else {
          await store.addMaterial(payload);
          showToast('Study material uploaded and synced to Student Vault!', 'success');
        }
        closeModal();
      } catch (err) {
        showToast(err.message || 'Failed to save study material', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });
}

function openAssignmentModal(existing = null) {
  const isEdit = !!existing;
  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden shadow-[0_0_50px_rgba(74,144,226,0.15)]">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
        <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Assignment' : 'Post New Assignment'}</h3>
        <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="asgModalForm" class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Course / Subject</label>
            <input id="asgCourse" type="text" required value="${esc(existing?.course || '')}" placeholder="Enter course name or code" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Due Date / Deadline</label>
            <input id="asgDue" type="text" required value="${esc(existing?.dueLabel || '')}" placeholder="e.g. Fri 5:00 PM" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div>
          <label class="block text-xs text-[#64748B] mb-1">Assignment Title</label>
          <input id="asgTitle" type="text" required value="${esc(existing?.title || '')}" placeholder="Enter assignment title" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
        </div>
        <div>
          <label class="block text-xs text-[#64748B] mb-1">Instructions</label>
          <textarea id="asgDesc" rows="2" required placeholder="Deliverables and instructions..." class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]">${esc(existing?.description || '')}</textarea>
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-glass-border">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-md bg-[#4A90E2] text-white text-xs font-label">${isEdit ? 'Save Assignment' : 'Publish Assignment'}</button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#asgModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const payload = {
        course: host.querySelector('#asgCourse').value.trim().toUpperCase(),
        dueLabel: host.querySelector('#asgDue').value.trim(),
        title: host.querySelector('#asgTitle').value.trim(),
        description: host.querySelector('#asgDesc').value.trim(),
      };
      try {
        if (isEdit) {
          await store.updateAssignment(existing.id, payload);
          showToast('Assignment updated and synced!', 'success');
        } else {
          await store.addAssignment(payload);
          showToast('Assignment published to Student Portal!', 'success');
        }
        closeModal();
      } catch (err) {
        showToast(err.message || 'Failed to save assignment', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });
}

export function renderAdminResources(container) {
  const { materials, assignments, notices } = store.state;

  container.innerHTML = `
    <div class="min-h-screen flex">
      ${renderAdminSidebar('admin/resources')}

      <div class="flex-1 flex flex-col min-w-0">
        <header class="sticky top-0 z-20 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-glass-border px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            ${renderMobileMenuButton()}
            <div>
              <h1 class="font-headline text-headline-sm text-[#172B4D]">Materials, Assignments &amp; Notices</h1>
              <p class="text-body-sm text-[#64748B]/70">Upload PDFs, documents, images, assignments, and announcements with full Edit &amp; Delete control</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2.5">
            <button id="resNoticeBtn" type="button" class="px-4 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#172B4D] text-xs border border-glass-border flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-amber-400">campaign</span> Publish Notice
            </button>
            <button id="resAsgBtn" type="button" class="px-4 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#172B4D] text-xs border border-glass-border flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-success">assignment_add</span> Post Assignment
            </button>
            <button id="resMatBtn" type="button" class="px-4 py-2 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label flex items-center gap-1.5 shadow-[0_0_16px_rgba(74,144,226,0.4)]">
              <span class="material-symbols-outlined text-[16px]">cloud_upload</span> Upload Material
            </button>
          </div>
        </header>

        <main class="p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 animate-enter">
          <!-- Study Materials Column -->
          <section class="p-5 rounded-xl bg-white/80 border border-[#4A90E2]/15 space-y-3 flex flex-col">
            <h2 class="font-headline text-title-md text-[#172B4D] flex items-center justify-between">
              <span>Study Materials (${materials.length})</span>
              <span class="font-code text-[11px] text-neon-purple">PDF / Docs / Images</span>
            </h2>
            ${materials.length === 0 ? `
              <div class="p-8 rounded-lg bg-[#E6F4FF]/60 border border-dashed border-glass-border text-center space-y-2 my-auto">
                <span class="material-symbols-outlined text-[#64748B]/40 text-[30px]">folder_open</span>
                <p class="text-xs text-[#64748B]/65">No study materials uploaded yet.</p>
                <button type="button" data-empty-mat class="px-3 py-1.5 rounded bg-neon-purple/20 border border-[#4A90E2]/25 text-xs text-[#172B4D]">+ Upload Material</button>
              </div>
            ` : `
              <div class="space-y-2.5">
                ${materials.map((m) => `
                  <div class="p-3.5 rounded-lg bg-[#E6F4FF]/60 border border-glass-border hover:border-[#4A90E2]/40 transition-colors space-y-2">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <span class="font-code text-[10px] text-neon-purple block truncate">${esc(m.courseTag)}</span>
                        <h4 class="text-xs font-semibold text-[#172B4D] mt-0.5 break-words">${esc(m.title)}</h4>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        ${m.fileUrl || m.fileDataUrl ? `
                          <button type="button" data-dl-mat="${esc(m.id)}" title="Download File" class="p-1 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]">
                            <span class="material-symbols-outlined text-[16px]">download</span>
                          </button>
                        ` : ''}
                        <button type="button" data-edit-mat="${esc(m.id)}" title="Edit Material" class="p-1 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]">
                          <span class="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button type="button" data-del-mat="${esc(m.id)}" title="Delete Material" class="p-1 rounded bg-error/10 hover:bg-error/25 text-error transition-colors">
                          <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                    ${m.type === 'image' && m.fileDataUrl ? `
                      <img src="${m.fileDataUrl}" alt="${esc(m.title)}" class="w-full max-h-32 object-cover rounded border border-glass-border" />
                    ` : ''}
                    <p class="text-[11px] text-[#64748B]/65">${esc(m.meta || m.author)}</p>
                  </div>
                `).join('')}
              </div>
            `}
          </section>

          <!-- Assignments Column -->
          <section class="p-5 rounded-xl bg-white/80 border border-[#4A90E2]/15 space-y-3 flex flex-col">
            <h2 class="font-headline text-title-md text-[#172B4D] flex items-center justify-between">
              <span>Assignments (${assignments.length})</span>
              <span class="font-code text-[11px] text-success">Active Tasks</span>
            </h2>
            ${assignments.length === 0 ? `
              <div class="p-8 rounded-lg bg-[#E6F4FF]/60 border border-dashed border-glass-border text-center space-y-2 my-auto">
                <span class="material-symbols-outlined text-[#64748B]/40 text-[30px]">assignment</span>
                <p class="text-xs text-[#64748B]/65">No assignments posted yet.</p>
                <button type="button" data-empty-asg class="px-3 py-1.5 rounded bg-[#F0F8FF] border border-[#4A90E2]/10 text-xs text-[#64748B] hover:text-[#172B4D]">+ Post Assignment</button>
              </div>
            ` : `
              <div class="space-y-2.5">
                ${assignments.map((a) => `
                  <div class="p-3.5 rounded-lg bg-[#E6F4FF]/60 border border-glass-border hover:border-[#4A90E2]/40 transition-colors">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <span class="font-code text-[10px] text-electric-violet block truncate">${esc(a.course)}</span>
                        <h4 class="text-xs font-semibold text-[#172B4D] mt-0.5">${esc(a.title)}</h4>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button type="button" data-edit-asg="${esc(a.id)}" title="Edit Assignment" class="p-1 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]">
                          <span class="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button type="button" data-del-asg="${esc(a.id)}" title="Delete Assignment" class="p-1 rounded bg-error/10 hover:bg-error/25 text-error transition-colors">
                          <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                    <p class="text-[11px] text-[#64748B]/65 mt-1">${esc(a.submissionFile ? `Submitted: ${a.submissionFile}` : a.description)}</p>
                    <div class="mt-2 flex items-center justify-between text-[10px] font-code">
                      <span class="px-1.5 py-0.5 rounded ${a.status === 'Graded' ? 'bg-success/20 text-success' : 'bg-amber-500/20 text-amber-400'}">
                        ${a.status === 'Graded' ? `Graded ${a.score}/${a.points}` : esc(a.dueLabel)}
                      </span>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </section>

          <!-- Notices Column -->
          <section class="p-5 rounded-xl bg-white/80 border border-[#4A90E2]/15 space-y-3 flex flex-col">
            <h2 class="font-headline text-title-md text-[#172B4D] flex items-center justify-between">
              <span>Notices (${notices.length})</span>
              <span class="font-code text-[11px] text-amber-400">Announcements</span>
            </h2>
            ${notices.length === 0 ? `
              <div class="p-8 rounded-lg bg-[#E6F4FF]/60 border border-dashed border-glass-border text-center space-y-2 my-auto">
                <span class="material-symbols-outlined text-[#64748B]/40 text-[30px]">campaign</span>
                <p class="text-xs text-[#64748B]/65">No notices or announcements yet.</p>
                <button type="button" data-empty-not class="px-3 py-1.5 rounded bg-[#F0F8FF] border border-[#4A90E2]/10 text-xs text-[#64748B] hover:text-[#172B4D]">+ Publish Notice</button>
              </div>
            ` : `
              <div class="space-y-2.5">
                ${notices.map((n) => `
                  <div class="p-3.5 rounded-lg bg-[#E6F4FF]/60 border border-glass-border hover:border-[#4A90E2]/40 transition-colors">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <span class="font-code text-[10px] text-amber-400 block truncate">${esc(n.category)}</span>
                        <h4 class="text-xs font-semibold text-[#172B4D] mt-0.5">${esc(n.title)}</h4>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button type="button" data-edit-not="${esc(n.id)}" title="Edit Notice" class="p-1 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]">
                          <span class="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button type="button" data-del-not="${esc(n.id)}" title="Delete Notice" class="p-1 rounded bg-error/10 hover:bg-error/25 text-error transition-colors">
                          <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                    <p class="text-[11px] text-[#64748B]/65 mt-1">${esc(n.body)}</p>
                  </div>
                `).join('')}
              </div>
            `}
          </section>
        </main>
      </div>
    </div>
  `;

  bindAdminSidebarToggle(container);
  container.querySelector('#settingsChangeAdminPwdBtn')?.addEventListener('click', () => openChangeAdminPasswordModal());
  container.querySelector('#resNoticeBtn').addEventListener('click', () => openNoticeModal());
  container.querySelector('#resMatBtn').addEventListener('click', () => openMaterialModal());
  container.querySelector('#resAsgBtn').addEventListener('click', () => openAssignmentModal());
  container.querySelector('[data-empty-mat]')?.addEventListener('click', () => openMaterialModal());
  container.querySelector('[data-empty-asg]')?.addEventListener('click', () => openAssignmentModal());
  container.querySelector('[data-empty-not]')?.addEventListener('click', () => openNoticeModal());

  container.querySelectorAll('[data-dl-mat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mat = materials.find((x) => x.id === btn.dataset.dlMat);
      if (!mat) return;
      showToast(`Downloading "${mat.fileName || mat.title}"...`, 'info');
      try {
        if (mat.fileUrl) {
          await downloadFromUrl(mat.fileUrl, mat.fileName || `${mat.title}.${mat.type || 'pdf'}`);
        } else if (mat.fileDataUrl) {
          downloadDataUrl(mat.fileName || `${mat.title}.${mat.type || 'pdf'}`, mat.fileDataUrl);
        } else {
          downloadTextFile(`${mat.title.replace(/[^a-z0-9]+/gi, '_')}.txt`, `${mat.title}\n\n${mat.summary || ''}\n`);
        }
        showToast(`Downloaded "${mat.fileName || mat.title}"`, 'success');
      } catch {
        showToast('Download failed. Please try again.', 'error');
      }
    });
  });

  container.querySelectorAll('[data-edit-mat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mat = materials.find((x) => x.id === btn.dataset.editMat);
      if (mat) openMaterialModal(mat);
    });
  });

  container.querySelectorAll('[data-del-mat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mat = materials.find((x) => x.id === btn.dataset.delMat);
      if (!mat) return;
      confirmDelete({
        title: 'Delete Study Material',
        itemName: mat.title,
        onConfirm: async () => {
          await store.deleteMaterial(mat.id);
          showToast('Material deleted.', 'warning');
        },
      });
    });
  });

  container.querySelectorAll('[data-edit-asg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const asg = assignments.find((x) => x.id === btn.dataset.editAsg);
      if (asg) openAssignmentModal(asg);
    });
  });

  container.querySelectorAll('[data-del-asg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const asg = assignments.find((x) => x.id === btn.dataset.delAsg);
      if (!asg) return;
      confirmDelete({
        title: 'Delete Assignment',
        itemName: asg.title,
        onConfirm: async () => {
          await store.deleteAssignment(asg.id);
          showToast('Assignment deleted.', 'warning');
        },
      });
    });
  });

  container.querySelectorAll('[data-edit-not]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const not = notices.find((x) => x.id === btn.dataset.editNot);
      if (not) openNoticeModal(not);
    });
  });

  container.querySelectorAll('[data-del-not]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const not = notices.find((x) => x.id === btn.dataset.delNot);
      if (!not) return;
      confirmDelete({
        title: 'Delete Notice',
        itemName: not.title,
        onConfirm: async () => {
          await store.deleteNotice(not.id);
          showToast('Notice deleted.', 'warning');
        },
      });
    });
  });
}

/* =========================================================================
   SCREEN 11: TIMETABLE & EVENTS MANAGEMENT (IMAGE UPLOAD + MANUAL CRUD)
   ========================================================================= */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function openSlotModal(existing = null) {
  const isEdit = !!existing;
  const deptOpts = getDepartmentOptions(existing?.department || '');

  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden shadow-[0_0_50px_rgba(74,144,226,0.15)]">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
        <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Timetable Period' : 'Add Timetable Period'}</h3>
        <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="slotModalForm" class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Day</label>
            <select id="slotDay" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm">
              ${DAYS.map((d) => `<option ${d === (existing?.day || 'Mon') ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Time / Period</label>
            <input id="slotTime" type="text" required value="${esc(existing?.slot || '')}" placeholder="e.g. 09:00 - 09:50 (Period 1)" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Subject Code</label>
            <input id="slotCode" type="text" required value="${esc(existing?.code || '')}" placeholder="e.g. CS301" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Department</label>
            ${deptOpts.length > 0 ? `
              <select id="slotDept" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm">
                <option value="">General</option>
                ${deptOpts.map((d) => `<option value="${esc(d)}" ${existing?.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
              </select>
            ` : `
              <input id="slotDept" type="text" value="${esc(existing?.department || '')}" placeholder="Optional department" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm" />
            `}
          </div>
        </div>
        <div>
          <label class="block text-xs text-[#64748B] mb-1">Subject / Session Title</label>
          <input id="slotTitle" type="text" required value="${esc(existing?.title || '')}" placeholder="Enter exact subject name" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Instructor</label>
            <input id="slotInstructor" type="text" value="${esc(existing?.instructor || '')}" placeholder="Faculty name" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Room / Hall</label>
            <input id="slotRoom" type="text" value="${esc(existing?.room || '')}" placeholder="Room number or lab" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <label class="flex items-center gap-2 text-xs text-[#64748B] cursor-pointer">
          <input id="slotLive" type="checkbox" ${existing?.live ? 'checked' : ''} class="rounded bg-white/80 border-neon-purple text-neon-purple focus:ring-[#4A90E2]/30" />
          Mark as LIVE NOW on Student Dashboard
        </label>
        <div class="flex justify-end gap-2 pt-3 border-t border-glass-border">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D] text-xs font-label">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_16px_rgba(74,144,226,0.35)]">
            ${isEdit ? 'Save Changes' : 'Save Period'}
          </button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#slotModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const instructor = host.querySelector('#slotInstructor').value.trim();
      const room = host.querySelector('#slotRoom').value.trim();
      const isLive = host.querySelector('#slotLive').checked;
      const payload = {
        day: host.querySelector('#slotDay').value,
        slot: host.querySelector('#slotTime').value.trim(),
        code: host.querySelector('#slotCode').value.trim(),
        title: host.querySelector('#slotTitle').value.trim(),
        instructor,
        room,
        meta: [room, instructor].filter(Boolean).join(' • '),
        department: host.querySelector('#slotDept').value.trim(),
        kind: isLive ? 'live' : 'class',
        live: isLive,
      };
      if (existing?.id) payload.id = existing.id;
      try {
        await store.upsertTimetableSlot(payload);
        closeModal();
        showToast(isEdit ? 'Timetable period updated and saved!' : 'Timetable period added and saved!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to save timetable slot', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });
}

function openEventModal(existing = null) {
  const isEdit = !!existing;
  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden shadow-[0_0_50px_rgba(74,144,226,0.15)]">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
        <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Campus Event' : 'Add Campus Event'}</h3>
        <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="evModalForm" class="p-6 space-y-4">
        <div>
          <label class="block text-xs text-[#64748B] mb-1">Event Title</label>
          <input id="evTitle" type="text" required value="${esc(existing?.title || '')}" placeholder="Enter event title" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Date</label>
            <input id="evDate" type="date" required value="${esc(existing?.date || '')}" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Time</label>
            <input id="evTime" type="text" value="${esc(existing?.time || '')}" placeholder="e.g. 10:00 AM" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Venue</label>
            <input id="evVenue" type="text" value="${esc(existing?.venue || '')}" placeholder="Auditorium / Hall" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div>
          <label class="block text-xs text-[#64748B] mb-1">Description</label>
          <textarea id="evDesc" rows="2" placeholder="Event details..." class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]">${esc(existing?.description || '')}</textarea>
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-glass-border">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-md bg-[#4A90E2] text-white text-xs font-label">${isEdit ? 'Save Event' : 'Add Event'}</button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#evModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const payload = {
        title: host.querySelector('#evTitle').value.trim(),
        date: host.querySelector('#evDate').value,
        time: host.querySelector('#evTime').value.trim(),
        venue: host.querySelector('#evVenue').value.trim(),
        description: host.querySelector('#evDesc').value.trim(),
      };
      try {
        if (isEdit) {
          await store.updateEvent(existing.id, payload);
          showToast('Campus event updated and synced!', 'success');
        } else {
          await store.addEvent(payload);
          showToast('Campus event added and synced!', 'success');
        }
        closeModal();
      } catch (err) {
        showToast(err.message || 'Failed to save campus event', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });
}

export function renderAdminTimetable(container) {
  const { timetable, timetableImage, events } = store.state;
  const uniqueSlots = [...new Set(timetable.map((t) => t.slot).filter(Boolean))];

  container.innerHTML = `
    <div class="min-h-screen flex">
      ${renderAdminSidebar('admin/timetable')}

      <div class="flex-1 flex flex-col min-w-0">
        <header class="sticky top-0 z-20 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-glass-border px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            ${renderMobileMenuButton()}
            <div>
              <h1 class="font-headline text-headline-sm text-[#172B4D]">Timetable &amp; Events Management</h1>
              <p class="text-body-sm text-[#64748B]/70">Upload your official college timetable image as-is, or build periods and campus events manually</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2.5">
            <button id="ttUploadImgBtn" type="button" class="px-4 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#172B4D] text-xs border border-[#4A90E2]/25 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-neon-purple">upload_file</span>
              <span>${timetableImage ? 'Replace Timetable Image' : 'Upload Timetable Image'}</span>
            </button>
            <button id="ttAddEventBtn" type="button" class="px-4 py-2 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#172B4D] text-xs border border-glass-border flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-emerald-400">event</span>
              <span>Add Event</span>
            </button>
            <button id="ttScheduleBtn" type="button" class="px-4 py-2 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_18px_rgba(74,144,226,0.2)] border border-[#4A90E2]/35 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">add_circle</span>
              <span>Add Manual Period</span>
            </button>
          </div>
        </header>

        <main class="p-4 sm:p-8 space-y-8 flex-1 animate-enter">
          <input id="ttImageFileInput" type="file" accept="image/*" class="hidden" />

          <!-- Section 1: Uploaded College Timetable Image (Exact Original Preservation) -->
          <section class="p-6 rounded-xl bg-white/80 border border-glass-border shadow-[0_4px_30px_rgba(0,0,0,0.45)] space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-glass-border pb-3">
              <div>
                <h2 class="font-headline text-title-lg text-[#172B4D] flex items-center gap-2">
                  <span class="material-symbols-outlined text-neon-purple text-[22px]">image</span>
                  Official College Timetable Image
                </h2>
                <p class="text-xs text-[#64748B]/65">Displayed exactly as uploaded — preserving all original subjects, days, periods, timings, and layout</p>
              </div>
              ${timetableImage ? `
                <div class="flex items-center gap-2">
                  <button id="zoomTimetableBtn" type="button" class="px-3 py-1.5 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] border border-glass-border text-xs text-[#64748B] hover:text-[#172B4D] flex items-center gap-1">
                    <span class="material-symbols-outlined text-[15px]">zoom_in</span> Full View
                  </button>
                  <button id="replaceTimetableBtn" type="button" class="px-3 py-1.5 rounded-md bg-neon-purple/20 hover:bg-neon-purple/35 border border-[#4A90E2]/25 text-xs text-[#172B4D] flex items-center gap-1">
                    <span class="material-symbols-outlined text-[15px]">swap_horiz</span> Replace
                  </button>
                  <button id="removeTimetableBtn" type="button" class="px-3 py-1.5 rounded-md bg-error/15 hover:bg-error/30 border border-error/40 text-xs text-error flex items-center gap-1">
                    <span class="material-symbols-outlined text-[15px]">delete</span> Remove
                  </button>
                </div>
              ` : ''}
            </div>

            ${timetableImage ? `
              <div class="space-y-2">
                <div class="rounded-xl bg-[#F0F8FF] border border-[#4A90E2]/20 p-3 overflow-auto flex justify-center">
                  <img src="${timetableImage.url || timetableImage.fallbackUrl || timetableImage.dataUrl || '/assets/college-timetable.png'}" alt="Official College Timetable" onerror="this.onerror=null; this.src='/assets/college-timetable.png';" class="max-w-full h-auto rounded-lg object-contain" />
                </div>
                <div class="flex items-center justify-between text-[11px] font-code text-[#64748B]/60">
                  <span>File: ${esc(timetableImage.fileName)}</span>
                  <span>Uploaded: ${new Date(timetableImage.uploadedAt).toLocaleString()}</span>
                </div>
              </div>
            ` : `
              <div id="ttDropZone" class="p-10 rounded-xl bg-[#E6F4FF]/60 border-2 border-dashed border-[#4A90E2]/20 hover:border-neon-purple/65 transition-colors text-center space-y-3 cursor-pointer">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] flex items-center justify-center">
                  <span class="material-symbols-outlined text-[28px]">add_photo_alternate</span>
                </div>
                <div>
                  <h3 class="font-headline text-title-md text-[#172B4D]">No College Timetable Image Uploaded</h3>
                  <p class="text-xs text-[#64748B]/65 mt-1 max-w-md mx-auto">
                    Upload your actual college timetable image (PNG, JPG, or WebP). It will be saved permanently and displayed untouched for both Admin and Students.
                  </p>
                </div>
                <button type="button" id="emptyUploadTtBtn" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label">
                  <span class="material-symbols-outlined text-[16px]">upload</span> Choose Timetable Image
                </button>
              </div>
            `}
          </section>

          <!-- Section 2: Manual Admin-Controlled Timetable Grid -->
          <section class="space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 class="font-headline text-title-lg text-[#172B4D]">Manual Period Schedule (${timetable.length})</h2>
                <p class="text-xs text-[#64748B]/65">Manually manage custom periods, timings, subjects, and rooms</p>
              </div>
              <button type="button" id="addManualSlotSecondaryBtn" class="px-3.5 py-1.5 rounded-md bg-[#F0F8FF] hover:bg-[#E6F4FF] border border-glass-border text-xs text-[#64748B] hover:text-[#172B4D] flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px] text-neon-purple">add</span> Add Period
              </button>
            </div>

            ${timetable.length === 0 ? `
              <div class="p-8 rounded-xl bg-white/60 border border-dashed border-[#4A90E2]/20 text-center space-y-2">
                <span class="material-symbols-outlined text-[#64748B]/40 text-[30px]">calendar_month</span>
                <p class="text-xs text-[#64748B]/65">No manual timetable periods created yet. Add periods above or upload your timetable image.</p>
              </div>
            ` : `
              <div class="rounded-xl bg-white/80 border border-[#4A90E2]/15 shadow-[0_4px_30px_rgba(74,144,226,0.08)] overflow-x-auto">
                <div class="min-w-[820px]">
                  <div class="grid grid-cols-7 border-b border-glass-border bg-[#E6F4FF] text-center font-code text-xs uppercase tracking-wider divide-x divide-glass-border">
                    <div class="p-3 text-[#64748B]/50">Time / Period</div>
                    ${DAYS.map((d) => `<div class="p-3 text-[#64748B] font-semibold">${d}</div>`).join('')}
                  </div>
                  <div class="divide-y divide-glass-border/40 text-xs">
                    ${uniqueSlots.map((slot) => `
                      <div class="grid grid-cols-7 divide-x divide-glass-border min-h-[96px]">
                        <div class="p-3 font-code text-[#64748B]/70 flex items-center justify-center bg-[#E6F4FF]/60 text-center">${esc(slot)}</div>
                        ${DAYS.map((day) => {
                          const cell = timetable.find((x) => x.day === day && x.slot === slot);
                          return `
                            <div class="p-2">
                              ${cell ? `
                                <div class="h-full p-2.5 rounded-lg border ${cell.live ? 'bg-gradient-to-r from-[#EBF4FF] to-[#E0EFFF] border-neon-purple' : 'bg-[#F0F8FF] border-glass-border'} flex flex-col justify-between gap-1.5">
                                  <div>
                                    <div class="flex items-center justify-between gap-1">
                                      <span class="font-code text-[10px] text-neon-purple font-bold truncate">${esc(cell.code)}</span>
                                      <div class="flex items-center gap-1 shrink-0">
                                        <button type="button" data-edit-slot="${esc(cell.id)}" title="Edit Period" class="p-1 rounded hover:bg-neon-purple/25 text-[#64748B] hover:text-[#172B4D] transition-colors"><span class="material-symbols-outlined text-[15px] pointer-events-none">edit</span></button>
                                        <button type="button" data-del-slot="${esc(cell.id)}" title="Delete Period" class="p-1 rounded hover:bg-error/25 text-[#64748B] hover:text-error transition-colors"><span class="material-symbols-outlined text-[15px] pointer-events-none">delete</span></button>
                                      </div>
                                    </div>
                                    <span class="font-label font-semibold text-[#172B4D] block mt-0.5">${esc(cell.title)}</span>
                                    <span class="text-[10px] text-[#64748B]/70 block mt-0.5">${esc(cell.meta || '')}</span>
                                  </div>
                                </div>
                              ` : `<div class="h-full rounded-lg border border-dashed border-glass-border/30 flex items-center justify-center text-[10px] text-[#64748B]/30">—</div>`}
                            </div>
                          `;
                        }).join('')}
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            `}
          </section>

          <!-- Section 3: Campus Events -->
          <section class="p-6 rounded-xl bg-white/75 border border-glass-border space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="font-headline text-title-lg text-[#172B4D]">Campus Events (${events.length})</h2>
              <button type="button" id="addEventSecondaryBtn" class="px-3 py-1.5 rounded bg-[#F0F8FF] hover:bg-[#E6F4FF] border border-glass-border text-xs text-[#64748B] hover:text-[#172B4D] flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px] text-emerald-400">add</span> Add Event
              </button>
            </div>

            ${events.length === 0 ? `
              <p class="text-xs text-[#64748B]/60 py-4 text-center border border-dashed border-glass-border rounded-lg">No campus events scheduled yet.</p>
            ` : `
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${events.map((ev) => `
                  <div class="p-4 rounded-lg bg-[#E6F4FF]/60 border border-glass-border space-y-2">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <span class="font-code text-[11px] text-emerald-400">${esc(ev.date)} ${ev.time ? `• ${esc(ev.time)}` : ''}</span>
                        <h4 class="font-headline text-sm text-[#172B4D] mt-0.5">${esc(ev.title)}</h4>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button type="button" data-edit-ev="${esc(ev.id)}" class="p-1 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]" title="Edit Event"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                        <button type="button" data-del-ev="${esc(ev.id)}" class="p-1 rounded bg-error/10 hover:bg-error/25 text-error" title="Delete Event"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                      </div>
                    </div>
                    ${ev.venue ? `<p class="text-[11px] font-code text-[#64748B]/70">Venue: ${esc(ev.venue)}</p>` : ''}
                    ${ev.description ? `<p class="text-xs text-[#64748B]/70">${esc(ev.description)}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            `}
          </section>
        </main>
      </div>
    </div>
  `;

  bindAdminSidebarToggle(container);
  container.querySelector('#settingsChangeAdminPwdBtn')?.addEventListener('click', () => openChangeAdminPasswordModal());
  const imgInput = container.querySelector('#ttImageFileInput');
  const triggerUpload = () => imgInput.click();

  container.querySelector('#ttUploadImgBtn').addEventListener('click', triggerUpload);
  container.querySelector('#replaceTimetableBtn')?.addEventListener('click', triggerUpload);
  container.querySelector('#emptyUploadTtBtn')?.addEventListener('click', (e) => { e.stopPropagation(); triggerUpload(); });
  container.querySelector('#ttDropZone')?.addEventListener('click', triggerUpload);

  imgInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast('Please select a timetable image under 15 MB.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      let publicUrl = '';
      try {
        const adminToken = store.getAdminSession()?.token || '';
        const upUrlRes = await fetch('/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(adminToken ? { 'X-Auth-Token': adminToken } : {}) },
          body: JSON.stringify({ fileName: file.name, folder: 'timetable' }),
        });
        if (upUrlRes.ok) {
          const upUrlData = await upUrlRes.json();
          if (upUrlData.signedUrl) {
            const uploadRes = await fetch(upUrlData.signedUrl, {
              method: 'PUT',
              headers: { 'Content-Type': file.type || 'image/png' },
              body: file,
            });
            if (uploadRes.ok) publicUrl = upUrlData.publicUrl;
          }
        }
      } catch (err) {
        console.warn('[Timetable] Cloud upload fallback to dataUrl:', err);
      }
      await store.setTimetableImage({
        url: publicUrl,
        dataUrl: publicUrl ? '' : reader.result,
        fileName: file.name,
        fallbackUrl: '/assets/college-timetable.png',
      });
      showToast('College timetable image uploaded and saved permanently!', 'success');
    };
    reader.readAsDataURL(file);
  });

  container.querySelector('#zoomTimetableBtn')?.addEventListener('click', () => {
    if (!timetableImage) return;
    openModal(`
      <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden">
        <div class="px-5 py-3 border-b border-glass-border flex items-center justify-between">
          <span class="font-headline text-sm text-[#172B4D]">${esc(timetableImage.fileName)}</span>
          <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="p-3 max-h-[82vh] overflow-auto flex justify-center bg-[#E6F4FF]">
          <img src="${timetableImage.url || timetableImage.fallbackUrl || timetableImage.dataUrl || '/assets/college-timetable.png'}" alt="Full Timetable" onerror="this.onerror=null; this.src='/assets/college-timetable.png';" class="max-w-none sm:max-w-full h-auto object-contain" />
        </div>
      </div>
    `, null, 'max-w-6xl');
  });

  container.querySelector('#removeTimetableBtn')?.addEventListener('click', () => {
    confirmDelete({
      title: 'Remove Timetable Image',
      itemName: timetableImage?.fileName || 'Uploaded Timetable',
      onConfirm: async () => {
        await store.removeTimetableImage();
        showToast('Uploaded timetable image removed.', 'warning');
      },
    });
  });

  container.querySelector('#ttScheduleBtn').addEventListener('click', () => openSlotModal());
  container.querySelector('#addManualSlotSecondaryBtn').addEventListener('click', () => openSlotModal());
  container.querySelector('#ttAddEventBtn').addEventListener('click', () => openEventModal());
  container.querySelector('#addEventSecondaryBtn').addEventListener('click', () => openEventModal());

  container.querySelectorAll('[data-edit-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = timetable.find((x) => x.id === btn.dataset.editSlot);
      if (target) openSlotModal(target);
    });
  });

  container.querySelectorAll('[data-del-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = timetable.find((x) => x.id === btn.dataset.delSlot);
      if (!target) return;
      confirmDelete({
        title: 'Delete Timetable Period',
        itemName: `${target.day} (${target.slot}) — ${target.title}`,
        onConfirm: async () => {
          await store.deleteTimetableSlot(target.id);
          showToast('Timetable period removed.', 'warning');
        },
      });
    });
  });

  container.querySelectorAll('[data-edit-ev]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = events.find((x) => x.id === btn.dataset.editEv);
      if (target) openEventModal(target);
    });
  });

  container.querySelectorAll('[data-del-ev]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = events.find((x) => x.id === btn.dataset.delEv);
      if (!target) return;
      confirmDelete({
        title: 'Delete Campus Event',
        itemName: target.title,
        onConfirm: async () => {
          await store.deleteEvent(target.id);
          showToast('Campus event deleted.', 'warning');
        },
      });
    });
  });
}

/* =========================================================================
   SCREEN 12: COLLEGE CUSTOMIZATION SETTINGS (DEPARTMENTS, PROGRAMS, ADMIN PROFILE)
   ========================================================================= */
function openDepartmentModal(existing = null) {
  const isEdit = !!existing;
  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden shadow-[0_0_50px_rgba(74,144,226,0.15)]">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
        <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Department' : 'Add Department'}</h3>
        <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="deptModalForm" class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Department Full Name</label>
            <input id="dName" type="text" required value="${esc(existing?.name || '')}" placeholder="e.g. Computer Science & Engineering" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Short Name / Label</label>
            <input id="dShort" type="text" required value="${esc(existing?.shortName || existing?.name || '')}" placeholder="e.g. CSE" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Department Code</label>
            <input id="dCode" type="text" required value="${esc(existing?.code || '')}" placeholder="e.g. CSE-01" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Head of Department (HOD)</label>
            <input id="dHod" type="text" value="${esc(existing?.hod || '')}" placeholder="Enter HOD name" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div>
          <label class="block text-xs text-[#64748B] mb-1">Courses / Subjects (comma-separated, optional)</label>
          <input id="dCourses" type="text" value="${esc((existing?.courses || []).join(', '))}" placeholder="e.g. Data Structures, Operating Systems, DBMS" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-glass-border">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-md bg-[#4A90E2] text-white text-xs font-label">${isEdit ? 'Save Department' : 'Add Department'}</button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#deptModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const payload = {
        name: host.querySelector('#dName').value.trim(),
        shortName: host.querySelector('#dShort').value.trim(),
        code: host.querySelector('#dCode').value.trim(),
        hod: host.querySelector('#dHod').value.trim(),
        courses: host.querySelector('#dCourses').value,
      };
      try {
        if (isEdit) {
          await store.updateDepartment(existing.id, payload);
          showToast('Department updated and synced!', 'success');
        } else {
          await store.addDepartment(payload);
          showToast('Department added and synced!', 'success');
        }
        closeModal();
      } catch (err) {
        showToast(err.message || 'Failed to save department', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });
}

function openProgramModal(existing = null) {
  const isEdit = !!existing;
  const deptOpts = getDepartmentOptions(existing?.department || '');

  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden shadow-[0_0_50px_rgba(74,144,226,0.15)]">
      <div class="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
        <h3 class="font-headline text-headline-sm text-[#172B4D]">${isEdit ? 'Edit Academic Program' : 'Add Academic Program'}</h3>
        <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
      </div>
      <form id="progModalForm" class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Program Name</label>
            <input id="pName" type="text" required value="${esc(existing?.name || '')}" placeholder="e.g. B.E. Computer Science & Engineering" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Program Code</label>
            <input id="pCode" type="text" required value="${esc(existing?.code || '')}" placeholder="e.g. BE-CSE" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm font-code outline-none focus:border-[#4A90E2]" />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Degree Level</label>
            <select id="pLevel" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none">
              ${['Undergraduate', 'Postgraduate', 'Diploma', 'Doctorate'].map((lv) => `<option ${existing?.level === lv ? 'selected' : ''}>${lv}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Duration</label>
            <input id="pDuration" type="text" value="${esc(existing?.duration || '4 Years')}" placeholder="e.g. 4 Years" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none focus:border-[#4A90E2]" />
          </div>
          <div>
            <label class="block text-xs text-[#64748B] mb-1">Department</label>
            ${deptOpts.length > 0 ? `
              <select id="pDept" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none">
                <option value="">All / General</option>
                ${deptOpts.map((d) => `<option value="${esc(d)}" ${existing?.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
              </select>
            ` : `
              <input id="pDept" type="text" value="${esc(existing?.department || '')}" placeholder="Department" class="w-full px-3 py-2 rounded-md bg-white/80 border border-glass-border text-[#172B4D] text-sm outline-none" />
            `}
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-glass-border">
          <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-md bg-[#4A90E2] text-white text-xs font-label">${isEdit ? 'Save Program' : 'Add Program'}</button>
        </div>
      </form>
    </div>
  `, (host) => {
    host.querySelector('#progModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = host.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      const payload = {
        name: host.querySelector('#pName').value.trim(),
        code: host.querySelector('#pCode').value.trim(),
        level: host.querySelector('#pLevel').value,
        duration: host.querySelector('#pDuration').value.trim(),
        department: host.querySelector('#pDept').value.trim(),
      };
      try {
        if (isEdit) {
          await store.updateProgram(existing.id, payload);
          showToast('Academic program updated and synced!', 'success');
        } else {
          await store.addProgram(payload);
          showToast('Academic program added and synced!', 'success');
        }
        closeModal();
      } catch (err) {
        showToast(err.message || 'Failed to save academic program', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });
}

export function renderAdminSettings(container) {
  const { settings } = store.state;
  const adminProfile = settings.adminProfile || { name: 'Administrator', designation: 'System Administrator', email: '' };
  const departments = settings.departments || [];
  const programs = settings.programs || [];

  container.innerHTML = `
    <div class="min-h-screen flex">
      ${renderAdminSidebar('admin/settings')}

      <div class="flex-1 flex flex-col min-w-0">
        <header class="sticky top-0 z-20 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-glass-border px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            ${renderMobileMenuButton()}
            <div>
              <h1 class="font-headline text-headline-sm text-[#172B4D]">College Branding &amp; Architecture Settings</h1>
              <p class="text-body-sm text-[#64748B]/70">Configure your institution identity, administrator profile, departments, and academic programs</p>
            </div>
          </div>

          <button id="saveSettingsBtn" type="button" class="px-5 py-2.5 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_20px_rgba(74,144,226,0.2)] border border-[#4A90E2]/35 flex items-center gap-1.5 active:scale-95 transition-transform">
            <span class="material-symbols-outlined text-[16px]">save</span>
            <span>Save All Settings</span>
          </button>
        </header>

        <main class="p-4 sm:p-8 space-y-8 flex-1 max-w-5xl animate-enter">
          <!-- Section 1: Institution Identity -->
          <section class="p-6 rounded-xl bg-white/75 border border-glass-border shadow-[0_4px_30px_rgba(74,144,226,0.08)] space-y-6">
            <div class="border-b border-glass-border pb-3 flex items-center justify-between">
              <div>
                <h2 class="font-headline text-title-lg text-[#172B4D]">Institution Profile &amp; Branding</h2>
                <p class="text-xs text-[#64748B]/65">Displayed across the Student Portal, Login screen, and Admin Console</p>
              </div>
              <span class="material-symbols-outlined text-neon-purple text-[22px]">domain</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div class="p-5 rounded-xl bg-[#E6F4FF]/60 border border-glass-border text-center space-y-3">
                <input id="logoUploadInp" type="file" accept="image/*" class="hidden" />
                <span class="text-xs font-label text-[#64748B] block">Official Crest / Logo</span>
                <div class="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-tr from-neon-purple to-deep-violet p-[2px] shadow-[0_0_20px_rgba(74,144,226,0.2)]">
                  <div class="w-full h-full rounded-2xl bg-white flex items-center justify-center text-neon-purple overflow-hidden">
                    ${settings.logoDataUrl
                      ? `<img src="${esc(settings.logoDataUrl)}" class="w-full h-full object-cover" alt="Logo" />`
                      : `<span class="material-symbols-outlined text-[44px]">school</span>`}
                  </div>
                </div>
                <div class="flex items-center justify-center gap-2">
                  <button id="replaceLogoBtn" type="button" class="px-3 py-1.5 rounded bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#172B4D] text-xs border border-glass-border">
                    Upload Logo
                  </button>
                  ${settings.logoDataUrl ? `
                    <button id="removeLogoBtn" type="button" class="px-2.5 py-1.5 rounded bg-error/15 hover:bg-error/25 text-error text-xs border border-error/40" title="Remove Logo">
                      <span class="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  ` : ''}
                </div>
              </div>

              <div class="md:col-span-2 space-y-4 text-xs">
                <div>
                  <label class="block text-[#64748B] mb-1 font-label">University / College Full Name</label>
                  <input id="setCollegeName" type="text" value="${esc(settings.collegeName || '')}" placeholder="Enter your college or university name" class="w-full px-3.5 py-2.5 rounded-md bg-[#E6F4FF]/60 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none font-headline" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-[#64748B] mb-1 font-label">Institutional Code</label>
                    <input id="setCollegeCode" type="text" value="${esc(settings.collegeCode || '')}" placeholder="e.g. 2609" class="w-full px-3.5 py-2.5 rounded-md bg-[#E6F4FF]/60 border border-glass-border text-[#172B4D] text-xs font-code focus:border-[#4A90E2] outline-none" />
                  </div>
                  <div>
                    <label class="block text-[#64748B] mb-1 font-label">Campus Domain</label>
                    <input id="setDomain" type="text" value="${esc(settings.domain || '')}" placeholder="e.g. college.edu" class="w-full px-3.5 py-2.5 rounded-md bg-[#E6F4FF]/60 border border-glass-border text-[#64748B] text-xs font-code focus:border-[#4A90E2] outline-none" />
                  </div>
                </div>
                <div>
                  <label class="block text-[#64748B] mb-1 font-label">Campus Physical Address</label>
                  <input id="setAddress" type="text" value="${esc(settings.address || '')}" placeholder="Enter campus address" class="w-full px-3.5 py-2.5 rounded-md bg-[#E6F4FF]/60 border border-glass-border text-[#172B4D] text-xs focus:border-[#4A90E2] outline-none" />
                </div>
              </div>
            </div>
          </section>

          <!-- Section 2: Administrator Profile (Shown in Bottom-Left Sidebar) -->
          <section class="p-6 rounded-xl bg-white/75 border border-glass-border shadow-[0_4px_30px_rgba(74,144,226,0.08)] space-y-4">
            <div class="border-b border-glass-border pb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="font-headline text-title-lg text-[#172B4D]">Administrator Profile &amp; Security</h2>
                <p class="text-xs text-[#64748B]/65">Controls the sidebar administrator profile and password security</p>
              </div>
              <button id="settingsChangeAdminPwdBtn" type="button" class="px-3.5 py-1.5 rounded-md bg-neon-purple/20 hover:bg-neon-purple/35 border border-[#4A90E2]/25 text-[#172B4D] text-xs font-label flex items-center gap-1.5 transition-colors">
                <span class="material-symbols-outlined text-[16px] text-neon-purple">lock_reset</span>
                <span>Change Admin Password</span>
              </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block text-[#64748B] mb-1 font-label">Admin Full Name</label>
                <input id="setAdminName" type="text" value="${esc(adminProfile.name || '')}" placeholder="Enter administrator name" class="w-full px-3.5 py-2.5 rounded-md bg-[#E6F4FF]/60 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none" />
              </div>
              <div>
                <label class="block text-[#64748B] mb-1 font-label">Designation / Role</label>
                <input id="setAdminRole" type="text" value="${esc(adminProfile.designation || '')}" placeholder="e.g. Principal, HOD, Admin" class="w-full px-3.5 py-2.5 rounded-md bg-[#E6F4FF]/60 border border-glass-border text-[#172B4D] text-sm focus:border-[#4A90E2] outline-none" />
              </div>
              <div>
                <label class="block text-[#64748B] mb-1 font-label">Admin Email (Optional)</label>
                <input id="setAdminEmail" type="email" value="${esc(adminProfile.email || '')}" placeholder="admin@${esc(settings.domain || 'college.edu')}" class="w-full px-3.5 py-2.5 rounded-md bg-[#E6F4FF]/60 border border-glass-border text-[#172B4D] text-sm font-code focus:border-[#4A90E2] outline-none" />
              </div>
            </div>
          </section>

          <!-- Section 3: Departments (100% Admin-Controlled) -->
          <section class="p-6 rounded-xl bg-white/75 border border-glass-border shadow-[0_4px_30px_rgba(74,144,226,0.08)] space-y-5">
            <div class="border-b border-glass-border pb-3 flex items-center justify-between gap-2">
              <div>
                <h2 class="font-headline text-title-lg text-[#172B4D]">Departments (${departments.length})</h2>
                <p class="text-xs text-[#64748B]/65">All department dropdowns across Students, Teachers, Timetable, and Materials sync from here</p>
              </div>
              <button id="addDeptBtn" type="button" class="px-3.5 py-1.5 rounded bg-neon-purple/20 hover:bg-neon-purple/35 text-[#172B4D] border border-[#4A90E2]/25 text-xs flex items-center gap-1 shrink-0">
                <span class="material-symbols-outlined text-[16px]">add</span>
                <span>Add Department</span>
              </button>
            </div>

            ${departments.length === 0 ? `
              <div class="p-8 rounded-lg bg-[#E6F4FF]/60 border border-dashed border-glass-border text-center space-y-2">
                <p class="text-xs text-[#64748B]/65">No departments configured yet. Add your college's departments here.</p>
              </div>
            ` : `
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${departments.map((d) => {
                  const deptStudents = store.state.students.filter((s) => s.department === (d.shortName || d.name)).length;
                  return `
                    <div class="p-4 rounded-lg bg-[#E6F4FF]/60 border border-glass-border hover:border-[#4A90E2]/40 transition-colors space-y-2">
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <span class="font-headline text-sm font-semibold text-[#172B4D] block">${esc(d.name)}</span>
                          <span class="font-code text-[11px] text-neon-purple">${esc(d.code)} ${d.shortName && d.shortName !== d.name ? `• ${esc(d.shortName)}` : ''}</span>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <button type="button" data-edit-dept="${esc(d.id)}" title="Edit Department" class="p-1 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]">
                            <span class="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          <button type="button" data-del-dept="${esc(d.id)}" title="Delete Department" class="p-1 rounded bg-error/10 hover:bg-error/25 text-error">
                            <span class="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                      <p class="text-xs text-[#64748B]/70">${d.hod ? `HOD: ${esc(d.hod)} • ` : ''}${deptStudents} ${deptStudents === 1 ? 'Student' : 'Students'}</p>
                      ${(d.courses || []).length > 0 ? `
                        <div class="pt-1 flex flex-wrap gap-1.5 text-[11px] font-code">
                          ${d.courses.map((c) => `<span class="px-2 py-0.5 rounded bg-[#F0F8FF] text-[#64748B]">${esc(c)}</span>`).join('')}
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </section>

          <!-- Section 4: Academic Programs (100% Admin-Controlled) -->
          <section class="p-6 rounded-xl bg-white/75 border border-glass-border shadow-[0_4px_30px_rgba(74,144,226,0.08)] space-y-5">
            <div class="border-b border-glass-border pb-3 flex items-center justify-between gap-2">
              <div>
                <h2 class="font-headline text-title-lg text-[#172B4D]">Academic Programs (${programs.length})</h2>
                <p class="text-xs text-[#64748B]/65">Define undergraduate, postgraduate, or diploma programs offered by your institution</p>
              </div>
              <button id="addProgBtn" type="button" class="px-3.5 py-1.5 rounded bg-neon-purple/20 hover:bg-neon-purple/35 text-[#172B4D] border border-[#4A90E2]/25 text-xs flex items-center gap-1 shrink-0">
                <span class="material-symbols-outlined text-[16px]">add</span>
                <span>Add Program</span>
              </button>
            </div>

            ${programs.length === 0 ? `
              <div class="p-8 rounded-lg bg-[#E6F4FF]/60 border border-dashed border-glass-border text-center space-y-2">
                <p class="text-xs text-[#64748B]/65">No academic programs added yet. Click Add Program to define your degree programs.</p>
              </div>
            ` : `
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${programs.map((p) => `
                  <div class="p-4 rounded-lg bg-[#E6F4FF]/60 border border-glass-border hover:border-[#4A90E2]/40 transition-colors space-y-1.5">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <span class="font-headline text-sm font-semibold text-[#172B4D] block">${esc(p.name)}</span>
                        <span class="font-code text-[11px] text-electric-violet">${esc(p.code)} • ${esc(p.level)} • ${esc(p.duration)}</span>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button type="button" data-edit-prog="${esc(p.id)}" title="Edit Program" class="p-1 rounded hover:bg-[#E6F4FF] text-[#64748B] hover:text-[#172B4D]">
                          <span class="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button type="button" data-del-prog="${esc(p.id)}" title="Delete Program" class="p-1 rounded bg-error/10 hover:bg-error/25 text-error">
                          <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                    ${p.department ? `<p class="text-xs text-[#64748B]/70">Department: ${esc(p.department)}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            `}
          </section>

          <!-- Section 5: AI Classroom Policies (System-Critical — Toggle Only) -->
          <section class="p-6 rounded-xl bg-white/75 border border-glass-border shadow-[0_4px_30px_rgba(74,144,226,0.08)] space-y-4">
            <div class="border-b border-glass-border pb-3 flex items-center justify-between">
              <h2 class="font-headline text-title-lg text-[#172B4D]">AI Engine Policies</h2>
              <span class="px-2.5 py-0.5 rounded-full bg-success/20 text-success text-xs font-code">Engine ${esc(settings.aiEngineVersion)} Active</span>
            </div>
            <div class="space-y-3">
              <label class="p-3.5 rounded-lg bg-[#E6F4FF]/60 border border-glass-border flex items-center justify-between cursor-pointer">
                <div>
                  <span class="font-label text-sm text-[#172B4D] block">Auto-Generate Lecture Transcripts &amp; Notes</span>
                  <span class="text-xs text-[#64748B]/70 block">Enables automatic summary capture during live classes</span>
                </div>
                <input id="toggleTranscripts" type="checkbox" ${settings.autoTranscripts ? 'checked' : ''} class="w-5 h-5 rounded bg-[#E6F4FF] border-neon-purple text-neon-purple focus:ring-[#4A90E2]/30" />
              </label>
              <label class="p-3.5 rounded-lg bg-[#E6F4FF]/60 border border-glass-border flex items-center justify-between cursor-pointer">
                <div>
                  <span class="font-label text-sm text-[#172B4D] block">Student Scan &amp; Solve Mathematical Proof Engine</span>
                  <span class="text-xs text-[#64748B]/70 block">Enables or pauses step-by-step camera scans (e.g. during exams)</span>
                </div>
                <input id="toggleScanSolve" type="checkbox" ${settings.scanAndSolveEnabled ? 'checked' : ''} class="w-5 h-5 rounded bg-[#E6F4FF] border-neon-purple text-neon-purple focus:ring-[#4A90E2]/30" />
              </label>
            </div>
          </section>
        </main>
      </div>
    </div>
  `;

  bindAdminSidebarToggle(container);
  container.querySelector('#settingsChangeAdminPwdBtn')?.addEventListener('click', () => openChangeAdminPasswordModal());

  const logoInp = container.querySelector('#logoUploadInp');
  container.querySelector('#replaceLogoBtn').addEventListener('click', () => logoInp.click());
  logoInp.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await store.updateSettings({ logoDataUrl: reader.result });
      showToast('Official institution logo updated!', 'success');
    };
    reader.readAsDataURL(file);
  });

  container.querySelector('#removeLogoBtn')?.addEventListener('click', () => {
    confirmDelete({
      title: 'Remove Institution Logo',
      itemName: 'Official Crest / Logo',
      onConfirm: async () => {
        await store.updateSettings({ logoDataUrl: '' });
        showToast('Institution logo removed.', 'warning');
      },
    });
  });

  container.querySelector('#saveSettingsBtn').addEventListener('click', async () => {
    const btn = container.querySelector('#saveSettingsBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving Settings...';
    try {
      await store.updateSettings({
        collegeName: container.querySelector('#setCollegeName').value.trim(),
        collegeCode: container.querySelector('#setCollegeCode').value.trim(),
        domain: container.querySelector('#setDomain').value.trim(),
        address: container.querySelector('#setAddress').value.trim(),
        autoTranscripts: container.querySelector('#toggleTranscripts').checked,
        scanAndSolveEnabled: container.querySelector('#toggleScanSolve').checked,
      });
      await store.updateAdminProfile({
        name: container.querySelector('#setAdminName').value.trim() || 'Administrator',
        designation: container.querySelector('#setAdminRole').value.trim() || 'System Administrator',
        email: container.querySelector('#setAdminEmail').value.trim(),
      });
      showToast('All college settings & administrator profile saved permanently!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  container.querySelector('#toggleScanSolve').addEventListener('change', async (e) => {
    await store.updateSettings({ scanAndSolveEnabled: e.target.checked });
    showToast(e.target.checked ? 'Scan & Solve ENABLED' : 'Scan & Solve PAUSED', 'purple');
  });

  container.querySelector('#toggleTranscripts').addEventListener('change', async (e) => {
    await store.updateSettings({ autoTranscripts: e.target.checked });
    showToast(e.target.checked ? 'Live AI Transcription ENABLED' : 'Live AI Transcription PAUSED', 'purple');
  });

  container.querySelector('#addDeptBtn').addEventListener('click', () => openDepartmentModal());
  container.querySelector('#addProgBtn').addEventListener('click', () => openProgramModal());

  container.querySelectorAll('[data-edit-dept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = departments.find((x) => x.id === btn.dataset.editDept);
      if (target) openDepartmentModal(target);
    });
  });

  container.querySelectorAll('[data-del-dept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = departments.find((x) => x.id === btn.dataset.delDept);
      if (!target) return;
      confirmDelete({
        title: 'Delete Department',
        itemName: `${target.name} (${target.code})`,
        detail: 'Existing student and teacher records will remain intact.',
        onConfirm: async () => {
          await store.deleteDepartment(target.id);
          showToast('Department deleted and dropdowns updated.', 'warning');
        },
      });
    });
  });

  container.querySelectorAll('[data-edit-prog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = programs.find((x) => x.id === btn.dataset.editProg);
      if (target) openProgramModal(target);
    });
  });

  container.querySelectorAll('[data-del-prog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = programs.find((x) => x.id === btn.dataset.delProg);
      if (!target) return;
      confirmDelete({
        title: 'Delete Academic Program',
        itemName: `${target.name} (${target.code})`,
        onConfirm: async () => {
          await store.deleteProgram(target.id);
          showToast('Academic program deleted.', 'warning');
        },
      });
    });
  });
}
