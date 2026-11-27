import { store } from './store.js';
import { runAiPrecheckGrader } from './ai-engine.js';
import {
  esc,
  showToast,
  openModal,
  closeModal,
  renderStudentBottomNav,
  renderSyncPill,
  downloadTextFile,
  downloadDataUrl,
  downloadFromUrl,
} from './ui.js';

let activeCameraStream = null;
let timetableLiveTimer = null;
let selectedTimetableDay = null; // null defaults to current IST day

export function cleanupStudentViews() {
  if (timetableLiveTimer) {
    clearInterval(timetableLiveTimer);
    timetableLiveTimer = null;
  }
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((t) => t.stop());
    activeCameraStream = null;
  }
}

export function getISTDateInfo() {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const parts = istFormatter.formatToParts(now);
  const getPart = (type) => parts.find((p) => p.type === type)?.value || '';

  const weekdayShort = getPart('weekday'); // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const hour = parseInt(getPart('hour'), 10) || 0;
  const minute = parseInt(getPart('minute'), 10) || 0;
  const currentMinutes = hour * 60 + minute;
  const dateStr = `${getPart('weekday')}, ${getPart('month')} ${getPart('day')}, ${getPart('year')}`;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
  const timeStr = `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;

  return {
    day: weekdayShort,
    hour,
    minute,
    currentMinutes,
    dateStr,
    timeStr,
  };
}

export function parseSlotMinutes(slotStr) {
  if (!slotStr) return null;
  const normalized = slotStr.replace(/(\d+)\.(\d+)/g, '$1:$2').trim();
  const parts = normalized.split(/\s*-\s*/);
  if (parts.length < 2) return null;

  const parseSingle = (timePart) => {
    let t = timePart.trim().toUpperCase();
    let isPM = t.includes('PM');
    let isAM = t.includes('AM');
    t = t.replace(/[AP]M/gi, '').trim();
    const [hStr, mStr] = t.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr || '0', 10);
    if (isNaN(h)) return 0;
    if (!isPM && !isAM) {
      if (h >= 1 && h <= 6) isPM = true;
    }
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  };

  const start = parseSingle(parts[0]);
  const end = parseSingle(parts[1]);
  return { start, end };
}

function getStudentOrPrompt(container) {
  const student = store.getCurrentStudent();
  if (student) return student;
  const { settings } = store.state;
  container.innerHTML = `
    <div class="student-shell student-shell-frame min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-5">
      <div class="w-16 h-16 rounded-2xl bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] flex items-center justify-center shadow-[0_0_25px_rgba(74,144,226,0.1)]">
        <span class="material-symbols-outlined text-[32px]">lock</span>
      </div>
      <div class="space-y-1.5">
        <h1 class="font-headline text-headline-sm text-[#172B4D]">Student Sign-In Required</h1>
        <p class="text-xs text-[#64748B]/70 max-w-xs mx-auto">
          Sign in with your student credentials registered by ${esc(settings.collegeName || 'your administrator')} to access the Student Portal.
        </p>
      </div>
      <div class="flex flex-col gap-2.5 w-full max-w-xs">
        <a href="#auth" class="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label shadow-[0_0_20px_rgba(74,144,226,0.2)]">
          Go to Student Login
        </a>
        <a href="#admin/login" class="w-full py-2.5 rounded-lg bg-[#F0F8FF] border border-[#4A90E2]/10 text-[#64748B] hover:text-[#172B4D] text-xs font-label">
          Administrator Login
        </a>
      </div>
    </div>
  `;
  return null;
}

/* =========================================================================
   LIVE CLASSROOM MODAL
   ========================================================================= */
function openLiveClassroomModal(classId) {
  const student = store.getCurrentStudent();
  if (!student) return;
  const cls = store.state.liveClasses.find((c) => c.id === classId);
  if (!cls) return;

  openModal(`
    <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 shadow-[0_0_50px_rgba(74,144,226,0.15)] overflow-hidden">
      <div class="px-5 py-4 border-b border-glass-border bg-gradient-to-r from-[#EBF4FF] to-[#E6F4FF] flex items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full bg-success/20 border border-success/40 text-success font-code text-[10px] inline-flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span> LIVE SESSION
            </span>
            <span class="font-code text-xs text-neon-purple">${esc(cls.code)} ${cls.room ? `• ${esc(cls.room)}` : ''}</span>
          </div>
          <h3 class="font-headline text-title-lg text-[#172B4D] mt-1">${esc(cls.title)}</h3>
          <p class="text-xs text-[#64748B]/70">${esc(cls.instructor || 'Faculty')} • ${esc(cls.timeRange || '')}</p>
        </div>
        <button type="button" data-close-modal class="w-8 h-8 rounded-full bg-[#F0F8FF] hover:bg-[#E6F4FF] text-[#64748B] flex items-center justify-center">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
        <div class="space-y-2">
          <h4 class="font-headline text-sm text-[#172B4D] flex items-center gap-1.5">
            <span class="material-symbols-outlined text-electric-violet text-[18px]">forum</span>
            Live Classroom Q&amp;A
          </h4>
          <div class="space-y-2 max-h-44 overflow-y-auto pr-1">
            ${(cls.qa || []).length === 0 ? `
              <p class="text-xs text-[#64748B]/60 p-3 rounded-lg bg-white/85 border border-glass-border">No questions posted yet. Ask a question below.</p>
            ` : (cls.qa || []).map((q) => `
              <div class="p-2.5 rounded-lg bg-[#F0F8FF] border border-[#4A90E2]/10 text-xs">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-semibold text-[#172B4D]">${esc(q.author)} <span class="font-code text-[10px] text-neon-purple">${esc(q.regNo)}</span></span>
                  <span class="font-code text-[10px] text-[#64748B]/50">${esc(q.time)}</span>
                </div>
                <p class="text-[#64748B]/85">${esc(q.text)}</p>
              </div>
            `).join('')}
          </div>
          <form id="liveQaForm" class="flex items-center gap-2 pt-1">
            <input id="liveQaInput" type="text" required placeholder="Ask a live classroom question..." class="flex-1 px-3 py-2 rounded-lg bg-white/85 border border-glass-border text-[#172B4D] text-xs placeholder-[#64748B]/40 focus:border-[#4A90E2] outline-none" />
            <button type="submit" class="px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label flex items-center gap-1 border border-[#4A90E2]/35">
              <span class="material-symbols-outlined text-[15px]">send</span> Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  `, (host) => {
    host.querySelector('#liveQaForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const txt = host.querySelector('#liveQaInput').value.trim();
      if (!txt) return;
      await store.postLiveQA(classId, student.name, student.regNo, txt);
      showToast('Question posted!', 'purple');
      openLiveClassroomModal(classId);
    });
  });
}

/* =========================================================================
   SCREEN 2: STUDENT HOME DASHBOARD
   ========================================================================= */
export function renderStudentHome(container) {
  const student = getStudentOrPrompt(container);
  if (!student) return;

  const { settings, assignments, notices, materials, liveClasses, timetable, timetableImage, events } = store.state;
  const pendingCount = assignments.filter((a) => a.status === 'Pending').length;

  container.innerHTML = `
    <div class="theme-student min-h-screen">
      <div class="student-shell student-shell-frame pb-28 min-h-screen">
        <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-indigo-100 px-5 py-3.5 flex items-center justify-between">
          <a href="#student/profile" class="flex items-center gap-3 group min-w-0">
            <div class="relative shrink-0">
              <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-[#2563EB] via-[#4F46E5] to-[#7C3AED] p-[2px] shadow-sm">
                <div class="w-full h-full rounded-full bg-white flex items-center justify-center text-[#1E1B4B] font-headline text-sm font-bold overflow-hidden">
                  ${student.avatarDataUrl
                    ? `<img src="${esc(student.avatarDataUrl)}" class="w-full h-full object-cover" alt="${esc(student.name)}" />`
                    : esc(student.initials)}
                </div>
              </div>
              <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"></span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-code text-[11px] text-[#4F46E5] font-semibold">${esc(student.regNo)}</span>
                ${student.department ? `<span class="w-1 h-1 rounded-full bg-slate-300"></span><span class="text-[11px] text-slate-500 truncate max-w-[120px]">${esc(student.department)}</span>` : ''}
              </div>
              <h1 class="font-headline text-base font-bold text-[#1E1B4B] tracking-tight leading-none mt-0.5 truncate group-hover:text-[#4F46E5] transition-colors">Hi, ${esc(student.name)}</h1>
            </div>
          </a>

          <div class="flex items-center gap-2 shrink-0">
            <button id="notifBellBtn" type="button" aria-label="Notifications" class="btn-3d w-9 h-9 rounded-full bg-indigo-50/70 border border-indigo-100 flex items-center justify-center text-[#4F46E5] hover:bg-indigo-100 relative">
              <span class="material-symbols-outlined text-[20px]">notifications</span>
              ${notices.length > 0 ? `<span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#7C3AED]"></span>` : ''}
            </button>
          </div>
        </header>

        <main class="px-5 pt-5 space-y-6 animate-enter">
          <div class="flex items-center justify-between text-[11px] gap-2">
            <span class="font-code text-slate-500 truncate">${esc(settings.collegeName || 'Live AI Classroom')}</span>
            ${renderSyncPill()}
          </div>

          <!-- Real-Time Timetable Hero Banner (Theme 5 Gradient) -->
          <section class="student-gradient-hero card-3d relative rounded-2xl p-5 sm:p-6 overflow-hidden">
            <div class="flex items-center justify-between relative z-10 mb-3">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white font-code text-xs font-medium backdrop-blur-sm">
                <span class="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
                IST Real-Time Schedule
              </span>
              <span id="heroClockText" class="font-code text-xs text-indigo-100 font-medium"></span>
            </div>
            <div class="relative z-10">
              <h2 id="heroDayDateText" class="font-headline text-xl sm:text-2xl text-white font-bold tracking-tight"></h2>
              <p id="heroPeriodSummaryText" class="text-xs sm:text-sm text-indigo-100 mt-1"></p>
            </div>
          </section>

          <!-- Academic & Attendance Snapshot -->
          <section class="grid grid-cols-3 gap-3">
            <div class="student-card card-3d p-3.5 text-center">
              <span class="text-[11px] font-label text-slate-500 block">Attendance</span>
              <span class="font-code text-lg sm:text-xl font-bold text-[#4F46E5] mt-0.5 block">${Number(student.attendance ?? 0)}%</span>
            </div>
            <div class="student-card card-3d p-3.5 text-center">
              <span class="text-[11px] font-label text-slate-500 block">Pending Tasks</span>
              <span class="font-code text-lg sm:text-xl font-bold text-[#1E1B4B] mt-0.5 block">${pendingCount}</span>
            </div>
            <div class="student-card card-3d p-3.5 text-center">
              <span class="text-[11px] font-label text-slate-500 block">Study Files</span>
              <span class="font-code text-lg sm:text-xl font-bold text-[#7C3AED] mt-0.5 block">${materials.length}</span>
            </div>
          </section>

          <!-- Quick Actions -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h2 class="font-headline text-base font-bold text-[#1E1B4B]">Quick Actions</h2>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <a href="#student/vault" class="student-card card-3d p-3.5 flex flex-col justify-between group">
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#4F46E5]/15 border border-indigo-200/70 text-[#4F46E5] flex items-center justify-center mb-2">
                  <span class="material-symbols-outlined text-[20px]">menu_book</span>
                </div>
                <div>
                  <h3 class="font-headline text-xs font-semibold text-[#1E1B4B]">Study Vault</h3>
                  <p class="text-[10px] text-slate-500 mt-0.5">${materials.length} files</p>
                </div>
              </a>

              <a href="#student/assignments" class="student-card card-3d p-3.5 flex flex-col justify-between group">
                <div class="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mb-2">
                  <span class="material-symbols-outlined text-[20px]">assignment</span>
                </div>
                <div>
                  <h3 class="font-headline text-xs font-semibold text-[#1E1B4B]">Assignments</h3>
                  <p class="text-[10px] text-slate-500 mt-0.5">${pendingCount} due</p>
                </div>
              </a>

              <a href="#student/assignments?tab=notices" class="student-card card-3d p-3.5 flex flex-col justify-between group">
                <div class="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-2">
                  <span class="material-symbols-outlined text-[20px]">campaign</span>
                </div>
                <div>
                  <h3 class="font-headline text-xs font-semibold text-[#1E1B4B]">Notices</h3>
                  <p class="text-[10px] text-slate-500 mt-0.5">${notices.length} alerts</p>
                </div>
              </a>
            </div>
          </section>

          <!-- Official Uploaded College Timetable -->
          ${timetableImage ? `
            <section class="student-card p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h2 class="font-headline text-sm font-bold text-[#1E1B4B] flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[#4F46E5] text-[20px]">calendar_month</span>
                  Official College Timetable
                </h2>
                <button id="studentZoomTtBtn" type="button" class="text-xs font-code text-[#4F46E5] font-semibold hover:underline">Full View</button>
              </div>
              <img id="studentTtThumb" src="${timetableImage.url || timetableImage.fallbackUrl || timetableImage.dataUrl || '/assets/college-timetable.png'}" alt="College Timetable" onerror="this.onerror=null; this.src='/assets/college-timetable.png';" class="w-full h-auto rounded-xl border border-indigo-100 cursor-pointer object-contain bg-slate-50" />
            </section>
          ` : ''}

          <!-- Dynamic Timetable & Scheduled Classes Section -->
          <section id="timetableDynamicSection" class="space-y-3.5">
            <!-- Timetable cards dynamically injected by renderTimetableEngine -->
          </section>

          <!-- Upcoming Events -->
          ${events.length > 0 ? `
            <section class="space-y-2.5">
              <h2 class="font-headline text-base font-bold text-[#1E1B4B]">Campus Events</h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${events.slice(0, 3).map((ev) => `
                  <div class="student-card card-3d p-3.5">
                    <span class="font-code text-[11px] text-[#4F46E5] font-semibold">${esc(ev.date)} ${ev.time ? `• ${esc(ev.time)}` : ''}</span>
                    <h3 class="font-headline text-sm font-semibold text-[#1E1B4B] mt-0.5">${esc(ev.title)}</h3>
                    ${ev.venue ? `<p class="text-xs text-slate-500 mt-0.5">${esc(ev.venue)}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            </section>
          ` : ''}
        </main>

        ${renderStudentBottomNav('student/home')}
      </div>
    </div>
  `;

  // Attach live classroom join buttons
  container.querySelectorAll('[data-join-live]').forEach((btn) => {
    btn.addEventListener('click', () => openLiveClassroomModal(btn.dataset.joinLive));
  });

  // Attach full view timetable modal
  const openTtFull = () => {
    if (!timetableImage) return;
    const ttSrc = timetableImage.url || timetableImage.fallbackUrl || timetableImage.dataUrl || '/assets/college-timetable.png';
    openModal(`
      <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden">
        <div class="px-5 py-3 border-b border-glass-border flex items-center justify-between">
          <span class="font-headline text-sm text-[#172B4D]">Official College Timetable</span>
          <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="p-3 max-h-[82vh] overflow-auto flex justify-center bg-[#E6F4FF]">
          <img src="${ttSrc}" alt="Full Timetable" onerror="this.onerror=null; this.src='/assets/college-timetable.png';" class="max-w-none sm:max-w-full h-auto object-contain" />
        </div>
      </div>
    `, null, 'max-w-6xl');
  };
  container.querySelector('#studentZoomTtBtn')?.addEventListener('click', openTtFull);
  container.querySelector('#studentTtThumb')?.addEventListener('click', openTtFull);

  // Attach notification bell modal
  container.querySelector('#notifBellBtn')?.addEventListener('click', () => {
    openModal(`
      <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden">
        <div class="px-5 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
          <h3 class="font-headline text-title-lg text-[#172B4D]">Campus Notices</h3>
          <button data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
          ${notices.length === 0 ? `<p class="text-xs text-[#64748B]/65 text-center py-4">No notices published yet.</p>` : notices.map((n) => `
            <div class="p-3.5 rounded-xl bg-[#F0F8FF] border border-[#4A90E2]/10 space-y-1">
              <div class="flex items-center justify-between">
                <span class="font-code text-[10px] text-neon-purple">${esc(n.category)}</span>
                <span class="font-code text-[10px] text-[#64748B]/50">${esc(n.timeLabel)}</span>
              </div>
              <h4 class="text-sm font-label font-semibold text-[#172B4D]">${esc(n.title)}</h4>
              <p class="text-xs text-[#64748B]/75">${esc(n.body)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `);
  });

  // Dynamic Timetable Engine
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  function renderTimetableEngine() {
    const ist = getISTDateInfo();
    const isWeekend = ist.day === 'Sat' || ist.day === 'Sun';
    const activeDay = selectedTimetableDay || (isWeekend ? 'Mon' : ist.day);
    const isTodayActive = !isWeekend && activeDay.toLowerCase() === ist.day.toLowerCase();

    // Filter periods strictly for active day
    const daySlots = (timetable || []).filter((s) => (s.day || '').toLowerCase() === activeDay.toLowerCase());
    daySlots.sort((a, b) => {
      const pA = parseSlotMinutes(a.slot) || { start: (a.period || 0) * 60 };
      const pB = parseSlotMinutes(b.slot) || { start: (b.period || 0) * 60 };
      return pA.start - pB.start;
    });

    // Update Hero Banner
    const heroClock = container.querySelector('#heroClockText');
    const heroDayDate = container.querySelector('#heroDayDateText');
    const heroSummary = container.querySelector('#heroPeriodSummaryText');
    if (heroClock) heroClock.textContent = `${ist.timeStr} IST`;
    if (heroDayDate) heroDayDate.textContent = ist.dateStr;

    if (heroSummary) {
      if (isWeekend) {
        heroSummary.textContent = `🏖️ Weekend / Campus Holiday • Showing Monday's timetable`;
      } else if (ist.currentMinutes < 560) {
        heroSummary.textContent = `🌅 Classes begin at 9:20 AM IST • Period 1 up next in ${560 - ist.currentMinutes}m`;
      } else if (ist.currentMinutes >= 720 && ist.currentMinutes < 770) {
        heroSummary.textContent = `🍽️ College Lunch Break (12:00 – 12:50 PM) • Regular class begins at 12:50 PM (${770 - ist.currentMinutes}m remaining)`;
      } else if (ist.currentMinutes >= 990) {
        heroSummary.textContent = '✨ All 7 periods completed for today! (9:20 AM – 4:30 PM)';
      } else {
        const liveSlot = daySlots.find((s) => {
          const t = parseSlotMinutes(s.slot);
          return t && ist.currentMinutes >= t.start && ist.currentMinutes < t.end;
        });
        if (liveSlot) {
          const t = parseSlotMinutes(liveSlot.slot);
          const left = t ? t.end - ist.currentMinutes : 0;
          heroSummary.textContent = `🟢 LIVE NOW: ${liveSlot.title} • ${left}m remaining`;
        } else {
          heroSummary.textContent = `Today's Schedule: ${daySlots.length} Periods Scheduled`;
        }
      }
    }

    const host = container.querySelector('#timetableDynamicSection');
    if (!host) return;

    // Day Selector Tabs
    const dayPillsHtml = `
      <div class="flex items-center justify-between gap-1 overflow-x-auto pb-1 no-scrollbar">
        <button type="button" data-select-day="today" class="px-3 py-1.5 rounded-full text-xs font-label transition-all shrink-0 ${selectedTimetableDay === null || selectedTimetableDay.toLowerCase() === ist.day.toLowerCase()
        ? 'bg-[#4A90E2] text-white shadow-sm font-semibold'
        : 'bg-white/80 border border-glass-border text-[#64748B] hover:text-[#172B4D]'
      }">
          Today (${ist.day})
        </button>
        ${daysOfWeek.map((d) => {
        const isSelected = activeDay.toLowerCase() === d.toLowerCase();
        const isCurrentDay = d.toLowerCase() === ist.day.toLowerCase();
        return `
            <button type="button" data-select-day="${d}" class="px-3 py-1.5 rounded-full text-xs font-label transition-all shrink-0 ${isSelected && (selectedTimetableDay !== null || isWeekend)
            ? 'bg-[#4A90E2] text-white shadow-sm font-semibold'
            : 'bg-white/80 border border-glass-border text-[#64748B] hover:text-[#172B4D]'
          }">
              ${d} ${isCurrentDay ? '•' : ''}
            </button>
          `;
      }).join('')}
      </div>
    `;

    // Special state alerts
    let stateBannerHtml = '';
    if (isTodayActive) {
      if (ist.currentMinutes < 560) {
        stateBannerHtml = `
          <div class="p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center gap-2.5 text-xs text-blue-700">
            <span class="material-symbols-outlined text-[20px] text-blue-500 shrink-0">wb_twilight</span>
            <span>Classes begin at <strong>9:20 AM IST</strong>. Today's first period is UP NEXT.</span>
          </div>
        `;
      } else if (ist.currentMinutes >= 720 && ist.currentMinutes < 770) {
        stateBannerHtml = `
          <div class="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/35 flex items-center justify-between text-xs text-amber-900">
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-[22px] text-amber-600">restaurant</span>
              <div>
                <p class="font-semibold">🍽️ Lunch Break in Progress (12:00 PM – 12:50 PM)</p>
                <p class="text-[11px] text-amber-700">Regular class starts at 12:50 PM IST (${770 - ist.currentMinutes}m remaining)</p>
              </div>
            </div>
          </div>
        `;
      } else if (ist.currentMinutes >= 990) {
        stateBannerHtml = `
          <div class="p-3 rounded-xl bg-slate-500/10 border border-slate-300 flex items-center gap-2.5 text-xs text-slate-700">
            <span class="material-symbols-outlined text-[20px] text-slate-500 shrink-0">task_alt</span>
            <span>All 7 college periods for today have finished. See you tomorrow!</span>
          </div>
        `;
      }
    } else if (isWeekend && (selectedTimetableDay === null || selectedTimetableDay === ist.day)) {
      stateBannerHtml = `
        <div class="p-4 rounded-xl bg-white/80 border border-dashed border-[#4A90E2]/30 text-center space-y-1">
          <p class="font-headline text-sm font-semibold text-[#172B4D]">🏖️ Weekend / Campus Holiday</p>
          <p class="text-xs text-[#64748B]">No classes scheduled for ${ist.day}. Showing Monday's timetable above.</p>
        </div>
      `;
    }

    // Render Period Cards
    let foundNextUpcoming = false;
    let periodsHtml = '';

    if (daySlots.length === 0) {
      periodsHtml = `
        <div class="p-5 rounded-xl bg-white/60 border border-dashed border-[#4A90E2]/25 text-center text-xs text-[#64748B]">
          No periods scheduled for ${activeDay}.
        </div>
      `;
    } else {
      periodsHtml = daySlots.map((slot, index) => {
        const timing = parseSlotMinutes(slot.slot);
        let badgeHtml = '';
        let cardStyle = 'bg-white/85 border border-[#4A90E2]/15 shadow-sm';
        let countdownInfo = '';

        if (isTodayActive && timing) {
          if (ist.currentMinutes >= timing.start && ist.currentMinutes < timing.end) {
            // LIVE NOW
            const left = timing.end - ist.currentMinutes;
            badgeHtml = `
              <span class="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 font-label text-[11px] font-semibold inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE NOW
              </span>
            `;
            countdownInfo = `<span class="font-code text-xs text-emerald-600 font-semibold">${left}m left</span>`;
            cardStyle = 'bg-gradient-to-r from-emerald-50/95 via-white to-emerald-50/50 border-2 border-emerald-500 shadow-[0_4px_20px_rgba(16,185,129,0.2)] ring-2 ring-emerald-500/20';
          } else if (ist.currentMinutes >= timing.end) {
            // COMPLETED
            badgeHtml = `
              <span class="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-400 font-code text-[10px] inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px]">check_circle</span>
                COMPLETED
              </span>
            `;
            cardStyle = 'bg-white/60 border border-slate-200/80 opacity-70';
          } else if (ist.currentMinutes < timing.start) {
            if (!foundNextUpcoming) {
              foundNextUpcoming = true;
              // UP NEXT
              const startsIn = timing.start - ist.currentMinutes;
              badgeHtml = `
                <span class="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/35 text-blue-600 font-label text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm">
                  <span class="material-symbols-outlined text-xs">schedule</span>
                  UP NEXT
                </span>
              `;
              countdownInfo = `<span class="font-code text-xs text-blue-600 font-medium">Starts in ${startsIn}m</span>`;
              cardStyle = 'bg-gradient-to-r from-blue-50/90 via-white to-blue-50/40 border border-blue-500/40 shadow-sm';
            } else {
              // UPCOMING
              badgeHtml = `
                <span class="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 font-code text-[10px]">
                  UPCOMING
                </span>
              `;
              cardStyle = 'bg-white/85 border border-[#4A90E2]/15';
            }
          }
        } else {
          badgeHtml = `
            <span class="px-2 py-0.5 rounded-full bg-[#E6F4FF] border border-[#4A90E2]/20 text-neon-purple font-code text-[10px]">
              PERIOD ${slot.period || (index + 1)}
            </span>
          `;
        }

        // Insert Lunch Break Timeline Item (12:00 PM – 12:50 PM) in chronological order right before Period 4
        let lunchTimelineItem = '';
        if (slot.period === 4 || index === 3) {
          let lunchCardStyle = 'bg-white/85 border border-[#4A90E2]/15 shadow-sm';
          let lunchBadgeHtml = '';
          let lunchCountdown = '';

          if (isTodayActive) {
            if (ist.currentMinutes >= 720 && ist.currentMinutes < 770) {
              const left = 770 - ist.currentMinutes;
              lunchBadgeHtml = `
                <span class="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-700 font-label text-[11px] font-semibold inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                  <span class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  LUNCH IN PROGRESS
                </span>
              `;
              lunchCountdown = `<span class="font-code text-xs text-amber-700 font-semibold">${left}m left</span>`;
              lunchCardStyle = 'bg-gradient-to-r from-amber-50/95 via-white to-amber-50/50 border-2 border-amber-500 shadow-[0_4px_20px_rgba(245,158,11,0.2)] ring-2 ring-amber-500/20';
            } else if (ist.currentMinutes >= 770) {
              lunchBadgeHtml = `
                <span class="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-400 font-code text-[10px] inline-flex items-center gap-1">
                  <span class="material-symbols-outlined text-[13px]">check_circle</span>
                  COMPLETED
                </span>
              `;
              lunchCardStyle = 'bg-white/60 border border-slate-200/80 opacity-70';
            } else if (ist.currentMinutes < 720) {
              if (!foundNextUpcoming && ist.currentMinutes >= 670) {
                foundNextUpcoming = true;
                const startsIn = 720 - ist.currentMinutes;
                lunchBadgeHtml = `
                  <span class="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/35 text-blue-600 font-label text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm">
                    <span class="material-symbols-outlined text-xs">schedule</span>
                    UP NEXT
                  </span>
                `;
                lunchCountdown = `<span class="font-code text-xs text-blue-600 font-medium">Starts in ${startsIn}m</span>`;
                lunchCardStyle = 'bg-gradient-to-r from-blue-50/90 via-white to-blue-50/40 border border-blue-500/40 shadow-sm';
              } else {
                lunchBadgeHtml = `
                  <span class="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 font-code text-[10px]">
                    UPCOMING
                  </span>
                `;
                lunchCardStyle = 'bg-white/85 border border-[#4A90E2]/15';
              }
            }
          } else {
            lunchBadgeHtml = `
              <span class="px-2 py-0.5 rounded-full bg-[#E6F4FF] border border-[#4A90E2]/20 text-neon-purple font-code text-[10px]">
                SCHEDULED BREAK
              </span>
            `;
          }

          lunchTimelineItem = `
            <article class="p-4 rounded-xl ${lunchCardStyle} transition-all space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap mb-1">
                    ${lunchBadgeHtml}
                    <span class="font-code text-[11px] text-amber-600 font-medium uppercase">BREAK • CAMPUS DINING</span>
                    ${lunchCountdown}
                  </div>
                  <h3 class="font-headline text-sm font-semibold text-[#172B4D] leading-tight flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[18px] text-amber-500">restaurant</span>
                    Lunch Break
                  </h3>
                  <p class="text-xs text-[#64748B] mt-1">College Cafeteria &amp; Dining Hall • Regular class resumes at 12:50 PM</p>
                </div>
                <span class="font-code text-xs text-[#172B4D] bg-[#F0F8FF] px-2.5 py-1 rounded-md border border-glass-border shrink-0 font-medium">
                  12:00 PM – 12:50 PM
                </span>
              </div>
            </article>
          `;
        }

        const displaySlot = (slot.slot === '12:50 - 13:45') ? '12:50 PM – 1:45 PM' : esc(slot.slot);

        return `
          ${lunchTimelineItem}
          <article class="p-4 rounded-xl ${cardStyle} transition-all space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  ${badgeHtml}
                  <span class="font-code text-[11px] text-neon-purple font-medium uppercase">${esc(slot.day)} • ${esc(slot.code || '')}</span>
                  ${countdownInfo}
                </div>
                <h3 class="font-headline text-sm font-semibold text-[#172B4D] leading-tight">${esc(slot.title)}</h3>
                <p class="text-xs text-[#64748B] mt-1">${esc(slot.instructor || '')} ${slot.room ? `• <span class="font-medium text-[#172B4D]/75">${esc(slot.room)}</span>` : ''}</p>
              </div>
              <span class="font-code text-xs text-[#172B4D] bg-[#F0F8FF] px-2.5 py-1 rounded-md border border-glass-border shrink-0 font-medium">
                ${displaySlot}
              </span>
            </div>
          </article>
        `;
      }).join('');
    }

    host.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h2 class="font-headline text-title-lg text-[#172B4D]">Live &amp; Scheduled Classes</h2>
          <p class="text-xs text-[#64748B]">${activeDay}'s Schedule • ${daySlots.length} Periods</p>
        </div>
        <span class="font-code text-xs px-2.5 py-1 rounded-full bg-[#E6F4FF] text-neon-purple border border-[#4A90E2]/20 font-medium">
          ${isTodayActive ? 'Today' : activeDay}
        </span>
      </div>

      ${dayPillsHtml}
      ${stateBannerHtml}
      <div class="space-y-3">
        ${periodsHtml}
      </div>
    `;

    // Attach Day selector listeners
    host.querySelectorAll('[data-select-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.selectDay;
        selectedTimetableDay = d === 'today' ? null : d;
        renderTimetableEngine();
      });
    });
  }

  // Initial render of timetable engine
  renderTimetableEngine();

  // Periodic real-time update every 15 seconds without full page reload
  if (timetableLiveTimer) clearInterval(timetableLiveTimer);
  timetableLiveTimer = setInterval(() => {
    renderTimetableEngine();
  }, 15000);
}

// AI Tutor feature removed per specification

// Scan & Solve feature removed per specification

/* =========================================================================
   SCREEN 5: STUDY MATERIALS VAULT (100% REAL ADMIN UPLOADS ONLY)
   ========================================================================= */
let vaultFilter = 'ALL';
let vaultSearch = '';

export function renderStudyVault(container) {
  const { materials } = store.state;
  const courses = [...new Set(materials.map((m) => m.course).filter(Boolean))];
  if (vaultFilter !== 'ALL' && !courses.includes(vaultFilter)) vaultFilter = 'ALL';

  const filtered = materials.filter((m) => {
    const matchCourse = vaultFilter === 'ALL' || m.course === vaultFilter;
    const q = vaultSearch.toLowerCase();
    const matchQ = !q || (m.title || '').toLowerCase().includes(q) || (m.courseTag || '').toLowerCase().includes(q) || (m.author || '').toLowerCase().includes(q);
    return matchCourse && matchQ;
  });

  const iconFor = (type) => {
    if (type === 'image') return { icon: 'image', cls: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400', tag: 'text-emerald-400' };
    if (type === 'slides') return { icon: 'slideshow', cls: 'bg-electric-violet/20 border-electric-violet/40 text-electric-violet', tag: 'text-electric-violet' };
    if (type === 'code') return { icon: 'code', cls: 'bg-amber-500/20 border-amber-500/40 text-amber-400', tag: 'text-amber-400' };
    if (type === 'doc') return { icon: 'description', cls: 'bg-sky-500/20 border-sky-500/40 text-sky-400', tag: 'text-sky-400' };
    return { icon: 'picture_as_pdf', cls: 'bg-neon-purple/20 border-[#4A90E2]/25 text-neon-purple', tag: 'text-neon-purple' };
  };

  container.innerHTML = `
    <div class="theme-student min-h-screen">
      <div class="student-shell student-shell-frame pb-28 min-h-screen">
        <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-indigo-100 px-5 py-3.5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <a href="#student/home" class="btn-3d w-9 h-9 rounded-full bg-indigo-50/70 border border-indigo-100 flex items-center justify-center text-[#4F46E5] hover:bg-indigo-100">
              <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </a>
            <div>
              <h1 class="font-headline text-lg font-bold text-[#1E1B4B]">Study Materials Vault</h1>
              <p class="text-[11px] font-code text-[#4F46E5]">Uploaded Faculty Notes &amp; Documents</p>
            </div>
          </div>
          <span class="font-code text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[#4F46E5] font-semibold">${materials.length}</span>
        </header>

        <main class="px-5 pt-5 space-y-5 animate-enter">
          <div class="space-y-3">
            <div class="relative flex items-center">
              <span class="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">search</span>
              <input id="vaultSearchInput" type="text" value="${esc(vaultSearch)}" placeholder="Search uploaded notes, PDFs, images..." class="glass-input w-full pl-10 pr-4 py-2.5 text-xs placeholder-slate-400" />
            </div>

            ${courses.length > 0 ? `
              <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button type="button" data-vault-filter="ALL" class="btn-3d px-3.5 py-1.5 rounded-full text-xs font-label whitespace-nowrap ${vaultFilter === 'ALL' ? 'bg-gradient-to-r from-[#2563EB] to-[#4F46E5] text-white shadow-xs' : 'bg-white text-slate-600 border border-indigo-100'}">
                  All (${materials.length})
                </button>
                ${courses.map((c) => `
                  <button type="button" data-vault-filter="${esc(c)}" class="btn-3d px-3.5 py-1.5 rounded-full text-xs font-label whitespace-nowrap ${vaultFilter === c ? 'bg-gradient-to-r from-[#2563EB] to-[#4F46E5] text-white shadow-xs' : 'bg-white text-slate-600 border border-indigo-100'}">
                    ${esc(c)}
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <section class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            ${materials.length === 0 ? `
              <div class="md:col-span-2 student-card p-10 border-dashed text-center space-y-2">
                <span class="material-symbols-outlined text-slate-300 text-[34px]">folder_open</span>
                <h3 class="font-headline text-sm font-semibold text-[#1E1B4B]">No Study Materials Yet</h3>
                <p class="text-xs text-slate-500">Materials uploaded by your administrator will appear here automatically.</p>
              </div>
            ` : filtered.length === 0 ? `
              <div class="md:col-span-2 student-card p-8 text-center text-xs text-slate-500">
                No study materials match your search.
              </div>
            ` : filtered.map((m) => {
              const st = iconFor(m.type);
              return `
                <article data-open-mat="${esc(m.id)}" class="student-card card-3d p-4 flex items-start justify-between gap-3 group cursor-pointer">
                  <div class="flex items-start gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-xl ${st.cls} border flex items-center justify-center flex-shrink-0">
                      <span class="material-symbols-outlined text-[22px]">${st.icon}</span>
                    </div>
                    <div class="min-w-0">
                      <span class="font-code text-[11px] ${st.tag} uppercase block truncate">${esc(m.courseTag)}</span>
                      <h4 class="font-headline text-sm font-semibold text-[#1E1B4B] mt-0.5 break-words">${esc(m.title)}</h4>
                      <p class="text-[11px] text-slate-500 mt-0.5">${esc(m.meta || m.author)}</p>
                    </div>
                  </div>
                  <button type="button" data-download-mat="${esc(m.id)}" class="btn-3d p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] flex-shrink-0" title="Download">
                    <span class="material-symbols-outlined text-[20px]">download</span>
                  </button>
                </article>
              `;
            }).join('')}
          </section>
        </main>

        ${renderStudentBottomNav('student/vault')}
      </div>
    </div>
  `;

  container.querySelector('#vaultSearchInput').addEventListener('input', (e) => {
    vaultSearch = e.target.value;
    renderStudyVault(container);
    const inp = container.querySelector('#vaultSearchInput');
    inp.focus();
    inp.setSelectionRange(vaultSearch.length, vaultSearch.length);
  });

  container.querySelectorAll('[data-vault-filter]').forEach((btn) => {
    btn.addEventListener('click', () => { vaultFilter = btn.dataset.vaultFilter; renderStudyVault(container); });
  });

  container.querySelectorAll('[data-download-mat]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const mat = materials.find((x) => x.id === btn.dataset.downloadMat);
      if (!mat) return;
      showToast(`Downloading "${mat.fileName || mat.title}"...`, 'info');
      try {
        if (mat.fileUrl) {
          await downloadFromUrl(mat.fileUrl, mat.fileName || `${mat.title}.${mat.type || 'pdf'}`);
        } else if (mat.fileDataUrl) {
          downloadDataUrl(mat.fileName || `${mat.title}.${mat.type || 'pdf'}`, mat.fileDataUrl);
        } else {
          downloadTextFile(`${mat.title.replace(/[^a-z0-9]+/gi, '_')}.txt`, `${mat.title}\n${mat.courseTag}\n\n${mat.summary || ''}\n`);
        }
        showToast(`Downloaded "${mat.fileName || mat.title}"`, 'success');
      } catch (err) {
        showToast('Download failed. Please try again.', 'error');
      }
    });
  });

  container.querySelectorAll('[data-open-mat]').forEach((card) => {
    card.addEventListener('click', () => {
      const mat = materials.find((x) => x.id === card.dataset.openMat);
      if (!mat) return;
      openModal(`
        <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden">
          <div class="px-5 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
            <div>
              <span class="font-code text-[11px] text-neon-purple uppercase">${esc(mat.courseTag)}</span>
              <h3 class="font-headline text-title-lg text-[#172B4D] mt-0.5">${esc(mat.title)}</h3>
            </div>
            <button data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
          </div>
          <div class="p-5 space-y-4">
            ${mat.type === 'image' && mat.fileDataUrl ? `<img src="${mat.fileDataUrl}" alt="${esc(mat.title)}" class="w-full max-h-80 object-contain rounded-lg bg-[#E6F4FF] border border-glass-border" />` : ''}
            ${mat.summary ? `<div class="p-4 rounded-xl bg-white/85 border border-glass-border text-xs text-[#172B4D] whitespace-pre-wrap">${esc(mat.summary)}</div>` : ''}
            <div class="flex items-center gap-2">
              <button id="modalDlMatBtn" type="button" class="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">download</span> Download File
              </button>
            </div>
          </div>
        </div>
      `, (host) => {
        host.querySelector('#modalDlMatBtn')?.addEventListener('click', async () => {
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
    });
  });
}

/* =========================================================================
   SCREEN 6: ASSIGNMENTS & NOTICES
   ========================================================================= */
export function renderAssignmentsNotices(container, queryParams = {}) {
  const { assignments, notices } = store.state;
  const activeTab = queryParams.tab === 'notices' ? 'notices' : 'assignments';
  const pending = assignments.filter((a) => a.status === 'Pending');

  container.innerHTML = `
    <div class="theme-student min-h-screen">
      <div class="student-shell student-shell-frame pb-28 min-h-screen">
        <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-indigo-100 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2.5">
            <a href="#student/home" class="btn-3d w-9 h-9 rounded-full bg-indigo-50/70 border border-indigo-100 flex items-center justify-center text-[#4F46E5] hover:bg-indigo-100 shrink-0">
              <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </a>
            <h1 class="font-headline text-base font-bold text-[#1E1B4B]">Assignments &amp; Notices</h1>
          </div>
          <div class="flex items-center gap-1 p-1 rounded-full bg-indigo-50 border border-indigo-100 shrink-0">
            <button id="assignTabBtn" type="button" class="btn-3d px-3 py-1 rounded-full text-xs font-label ${activeTab === 'assignments' ? 'bg-gradient-to-r from-[#2563EB] to-[#4F46E5] text-white font-semibold shadow-xs' : 'text-slate-600'}">Assignments (${assignments.length})</button>
            <button id="noticeTabBtn" type="button" class="btn-3d px-3 py-1 rounded-full text-xs font-label ${activeTab === 'notices' ? 'bg-gradient-to-r from-[#2563EB] to-[#4F46E5] text-white font-semibold shadow-xs' : 'text-slate-600'}">Notices (${notices.length})</button>
          </div>
        </header>

        <main class="px-5 pt-5 space-y-5 animate-enter">
          <div id="assignmentsSection" class="${activeTab === 'assignments' ? '' : 'hidden'} space-y-4">
            ${assignments.length === 0 ? `
              <div class="student-card p-10 border-dashed text-center space-y-2">
                <span class="material-symbols-outlined text-slate-300 text-[34px]">assignment</span>
                <h3 class="font-headline text-sm font-semibold text-[#1E1B4B]">No Assignments Posted</h3>
                <p class="text-xs text-slate-500">Assignments posted by your administrator will appear here.</p>
              </div>
            ` : `
              ${pending.length > 0 ? `
                <div class="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-200 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center border border-amber-200">
                      <span class="material-symbols-outlined text-[22px]">timer</span>
                    </div>
                    <div>
                      <h3 class="font-headline text-sm font-semibold text-[#1E1B4B]">${pending.length} Pending Submission${pending.length > 1 ? 's' : ''}</h3>
                      <p class="text-[11px] text-slate-600">${esc(pending[0].title)}</p>
                    </div>
                  </div>
                </div>
              ` : ''}

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${assignments.map((a) => a.status === 'Pending' ? `
                  <article class="student-card card-3d p-4 space-y-3">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <span class="font-code text-[11px] text-[#4F46E5] font-semibold">${esc(a.course)}</span>
                        <h4 class="font-headline text-base font-bold text-[#1E1B4B] mt-0.5">${esc(a.title)}</h4>
                        <p class="text-xs text-slate-500 mt-0.5">${esc(a.description)}</p>
                      </div>
                      <span class="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-code text-[11px] border border-rose-200 shrink-0">${esc(a.dueLabel)}</span>
                    </div>
                    <div class="flex items-center gap-2 pt-1">
                      <button type="button" data-upload-asg="${esc(a.id)}" class="btn-3d flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#4F46E5] text-white text-xs font-label font-semibold flex items-center justify-center gap-1.5 shadow-sm">
                        <span class="material-symbols-outlined text-[16px]">upload_file</span>
                        <span>Upload Solution</span>
                      </button>
                    </div>
                  </article>
                ` : `
                  <article class="student-card card-3d p-4 space-y-2">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <span class="font-code text-[11px] text-[#7C3AED] font-semibold">${esc(a.course)}</span>
                        <h4 class="font-headline text-base font-bold text-[#1E1B4B] mt-0.5">${esc(a.title)}</h4>
                      </div>
                      <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-code text-[11px] border border-emerald-200 shrink-0">Graded: ${a.score}/${a.points}</span>
                    </div>
                    ${a.feedback ? `<div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600"><strong class="text-[#1E1B4B]">Feedback:</strong> ${esc(a.feedback)}</div>` : ''}
                  </article>
                `).join('')}
              </div>
            `}
          </div>

          <div id="noticesSection" class="${activeTab === 'notices' ? '' : 'hidden'} space-y-4">
            ${notices.length === 0 ? `
              <div class="student-card p-10 border-dashed text-center space-y-2">
                <span class="material-symbols-outlined text-slate-300 text-[34px]">campaign</span>
                <h3 class="font-headline text-sm font-semibold text-[#1E1B4B]">No Notices Yet</h3>
                <p class="text-xs text-slate-500">Official college announcements will appear here.</p>
              </div>
            ` : `
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${notices.map((n) => `
                  <article class="student-card card-3d p-4 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-code text-[11px] px-2.5 py-0.5 rounded-full border text-[#4F46E5] bg-indigo-50 border-indigo-200 font-semibold">${esc(n.category)}</span>
                      <span class="font-code text-[11px] text-slate-400">${esc(n.timeLabel)}</span>
                    </div>
                    <h4 class="font-headline text-base font-bold text-[#1E1B4B]">${esc(n.title)}</h4>
                    <p class="text-xs text-slate-600 leading-relaxed">${esc(n.body)}</p>
                    ${n.hasAttachment ? `
                      <button type="button" data-dl-notice="${esc(n.id)}" class="btn-3d px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-[#4F46E5] font-medium flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">download</span> Download Circular
                      </button>
                    ` : ''}
                  </article>
                `).join('')}
              </div>
            `}
          </div>
        </main>

        ${renderStudentBottomNav('student/assignments')}
      </div>
    </div>
  `;

  container.querySelector('#assignTabBtn').addEventListener('click', () => { window.location.hash = '#student/assignments'; });
  container.querySelector('#noticeTabBtn').addEventListener('click', () => { window.location.hash = '#student/assignments?tab=notices'; });

  container.querySelectorAll('[data-dl-notice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = notices.find((x) => x.id === btn.dataset.dlNotice);
      if (n) downloadTextFile(`${n.title.replace(/[^a-z0-9]+/gi, '_')}.txt`, `${n.category}\n${n.title}\n\n${n.body}\n`);
    });
  });

  container.querySelectorAll('[data-upload-asg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const asg = assignments.find((x) => x.id === btn.dataset.uploadAsg);
      if (!asg) return;
      openModal(`
        <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden">
          <div class="px-5 py-4 border-b border-glass-border flex items-center justify-between bg-[#E6F4FF]/60">
            <h3 class="font-headline text-title-lg text-[#172B4D]">${esc(asg.title)}</h3>
            <button data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
          </div>
          <form id="submitAsgForm" class="p-5 space-y-4">
            <div>
              <label class="block text-xs font-label text-[#64748B] mb-1">Select File</label>
              <input id="asgFileInp" type="file" class="w-full text-xs text-[#64748B] file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-[#4A90E2]/20 file:text-[#172B4D]" />
            </div>
            <div>
              <label class="block text-xs font-label text-[#64748B] mb-1">Submission Notes</label>
              <textarea id="asgNotesInp" rows="3" required placeholder="Briefly describe your solution..." class="w-full px-3 py-2 rounded-lg bg-white/85 border border-glass-border text-[#172B4D] text-xs"></textarea>
            </div>
            <div class="flex justify-end gap-2 pt-2 border-t border-glass-border">
              <button type="button" data-close-modal class="px-4 py-2 rounded-md bg-white/80 text-[#64748B] text-xs">Cancel</button>
              <button type="submit" class="px-5 py-2 rounded-md bg-[#4A90E2] text-white text-xs font-label">Submit Solution</button>
            </div>
          </form>
        </div>
      `, (host) => {
        host.querySelector('#submitAsgForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const file = host.querySelector('#asgFileInp').files?.[0];
          const stu = store.getCurrentStudent();
          const fileName = file ? file.name : `${(stu?.name || 'Student').replace(/\s+/g, '')}_Submission.pdf`;
          const notes = host.querySelector('#asgNotesInp').value;
          const result = runAiPrecheckGrader(asg.title, fileName, notes);
          await store.submitAssignment(asg.id, { fileName, ...result });
          closeModal();
          showToast(`Submitted & Graded: ${result.score}/${asg.points}!`, 'success');
        });
      });
    });
  });
}

/* =========================================================================
   SCREEN 7: STUDENT PROFILE & SECURITY
   ========================================================================= */
export function renderStudentProfile(container) {
  const student = getStudentOrPrompt(container);
  if (!student) return;

  container.innerHTML = `
    <div class="theme-student min-h-screen">
      <div class="student-shell student-shell-frame pb-28 min-h-screen">
        <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-indigo-100 px-5 py-3.5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <a href="#student/home" class="btn-3d w-9 h-9 rounded-full bg-indigo-50/70 border border-indigo-100 flex items-center justify-center text-[#4F46E5] hover:bg-indigo-100">
              <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </a>
            <h1 class="font-headline text-lg font-bold text-[#1E1B4B]">Student Profile &amp; Settings</h1>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-code font-medium">Active</span>
        </header>

        <main class="px-5 pt-6 space-y-6 max-w-xl mx-auto animate-enter">
          <section class="student-card card-3d p-6 text-center">
            <input id="avatarUploadInp" type="file" accept="image/*" class="hidden" />
            <div class="relative w-24 h-24 mx-auto mb-4">
              <div class="w-full h-full rounded-full bg-gradient-to-tr from-[#2563EB] via-[#4F46E5] to-[#7C3AED] p-[2.5px]">
                <div class="w-full h-full rounded-full bg-white flex items-center justify-center text-[#1E1B4B] font-headline text-2xl font-bold overflow-hidden">
                  ${student.avatarDataUrl ? `<img src="${esc(student.avatarDataUrl)}" class="w-full h-full object-cover" />` : esc(student.initials)}
                </div>
              </div>
              <button id="changeAvatarBtn" type="button" class="btn-3d absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#4F46E5] border-2 border-white text-white flex items-center justify-center shadow-sm">
                <span class="material-symbols-outlined text-[16px]">photo_camera</span>
              </button>
            </div>
            <h2 class="font-headline text-xl font-bold text-[#1E1B4B]">${esc(student.name)}</h2>
            <p class="font-code text-xs text-[#4F46E5] font-semibold mt-0.5">${esc(student.regNo)}</p>
            <p class="text-xs text-slate-500 mt-1">${esc(student.email)}${student.phone ? ` • <span class="font-code text-[#4F46E5]">${esc(student.phone)}</span>` : ''}</p>

            <div class="mt-5 pt-4 border-t border-indigo-100 flex items-center justify-around text-xs font-code">
              <div>
                <span class="text-slate-400 block">Department</span>
                <span class="text-[#1E1B4B] font-semibold block mt-0.5">${esc(student.department || '—')}</span>
              </div>
              <div class="w-[1px] h-7 bg-indigo-100"></div>
              <div>
                <span class="text-slate-400 block">Year &amp; Sec</span>
                <span class="text-[#1E1B4B] font-semibold block mt-0.5">${esc(student.year)} • ${esc(student.section)}</span>
              </div>
              <div class="w-[1px] h-7 bg-indigo-100"></div>
              <div>
                <span class="text-slate-400 block">Attendance</span>
                <span class="text-[#4F46E5] font-bold block mt-0.5">${Number(student.attendance ?? 0)}%</span>
              </div>
            </div>
          </section>

          <section class="student-card p-5 space-y-4">
            <h3 class="font-headline text-base font-bold text-[#1E1B4B] border-b border-indigo-100 pb-2.5">Update Password</h3>
            <form id="updatePwdForm" class="space-y-3">
              <div class="relative flex items-center">
                <input id="curPwd" type="password" required placeholder="Current password" class="glass-input w-full pl-3.5 pr-10 py-2.5 text-xs font-code" />
                <button type="button" data-eye-for="curPwd" class="btn-3d absolute right-2 text-slate-400 hover:text-[#1E1B4B]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
              </div>
              <div class="relative flex items-center">
                <input id="newPwd" type="password" required minlength="6" placeholder="New password (min 6 chars)" class="glass-input w-full pl-3.5 pr-10 py-2.5 text-xs font-code" />
                <button type="button" data-eye-for="newPwd" class="btn-3d absolute right-2 text-slate-400 hover:text-[#1E1B4B]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
              </div>
              <div class="relative flex items-center">
                <input id="confPwd" type="password" required minlength="6" placeholder="Confirm new password" class="glass-input w-full pl-3.5 pr-10 py-2.5 text-xs font-code" />
                <button type="button" data-eye-for="confPwd" class="btn-3d absolute right-2 text-slate-400 hover:text-[#1E1B4B]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
              </div>
              <button type="submit" class="btn-3d w-full py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#4F46E5] text-white font-label font-semibold text-xs shadow-sm">Update Password</button>
            </form>
          </section>

          <div class="space-y-2.5">
            <button id="studentSignOutBtn" type="button" class="btn-3d w-full py-2.5 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-600 hover:text-white text-rose-600 font-label font-semibold text-xs flex items-center justify-center gap-2 transition-colors">
              <span class="material-symbols-outlined text-[18px]">logout</span>
              <span>Sign Out</span>
            </button>
          </div>
        </main>

        ${renderStudentBottomNav('student/profile')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-eye-for]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inp = container.querySelector(`#${btn.dataset.eyeFor}`);
      if (!inp) return;
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.querySelector('.material-symbols-outlined').textContent = show ? 'visibility_off' : 'visibility';
    });
  });

  const avatarInp = container.querySelector('#avatarUploadInp');
  container.querySelector('#changeAvatarBtn').addEventListener('click', () => avatarInp.click());
  avatarInp.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await store.updateOwnAvatar(student.id, reader.result);
      showToast('Profile photo updated!', 'success');
    };
    reader.readAsDataURL(file);
  });

  container.querySelector('#updatePwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = container.querySelector('#curPwd').value;
    const n1 = container.querySelector('#newPwd').value;
    const n2 = container.querySelector('#confPwd').value;
    if (n1 !== n2) { showToast('New passwords do not match.', 'error'); return; }
    const res = await store.changeStudentPassword(cur, n1);
    if (!res.ok) { showToast(res.error || 'Failed to update password.', 'error'); return; }
    e.target.reset();
    showToast('Password updated securely!', 'success');
  });

  container.querySelector('#studentSignOutBtn').addEventListener('click', async () => {
    await store.logoutStudent();
    showToast('Signed out.', 'purple');
    window.location.hash = '#auth';
  });
}
