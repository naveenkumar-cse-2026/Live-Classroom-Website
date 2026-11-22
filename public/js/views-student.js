import { store } from './store.js';
import { generateTutorReply, runScanAndSolve, runAiPrecheckGrader } from './ai-engine.js';
import {
  esc,
  showToast,
  openModal,
  closeModal,
  renderStudentBottomNav,
  renderSyncPill,
  downloadTextFile,
  downloadDataUrl,
} from './ui.js';

let activeCameraStream = null;

export function cleanupStudentViews() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((t) => t.stop());
    activeCameraStream = null;
  }
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
    <div class="student-shell student-shell-frame pb-28 min-h-screen">
      <header class="sticky top-0 z-40 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-[#4A90E2]/10 px-5 py-3.5 flex items-center justify-between">
        <a href="#student/profile" class="flex items-center gap-3 group min-w-0">
          <div class="relative shrink-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-[#4A90E2] to-[#2563EB] p-[1.5px] shadow-[0_0_12px_rgba(74,144,226,0.3)]">
              <div class="w-full h-full rounded-full bg-white flex items-center justify-center text-[#64748B] font-headline text-label-lg font-bold overflow-hidden">
                ${student.avatarDataUrl
                  ? `<img src="${esc(student.avatarDataUrl)}" class="w-full h-full object-cover" alt="${esc(student.name)}" />`
                  : esc(student.initials)}
              </div>
            </div>
            <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-white"></span>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-code text-label-sm text-neon-purple font-medium">${esc(student.regNo)}</span>
              ${student.department ? `<span class="w-1 h-1 rounded-full bg-cyber-lavender/40"></span><span class="text-label-sm text-[#64748B]/70 truncate max-w-[115px]">${esc(student.department)}</span>` : ''}
            </div>
            <h1 class="font-headline text-headline-sm text-[#172B4D] tracking-tight leading-none mt-0.5 truncate group-hover:text-[#64748B] transition-colors">Hi, ${esc(student.name)}</h1>
          </div>
        </a>

        <div class="flex items-center gap-2 shrink-0">
          <button id="notifBellBtn" type="button" aria-label="Notifications" class="w-9 h-9 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-center justify-center text-[#64748B] hover:text-[#172B4D] hover:border-[#4A90E2]/30 transition-all relative">
            <span class="material-symbols-outlined text-[20px]">notifications</span>
            ${notices.length > 0 ? `<span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-neon-purple shadow-[0_0_6px_rgba(74,144,226,0.4)]"></span>` : ''}
          </button>
          <a href="#student/chat" title="Live AI Tutor" class="w-9 h-9 rounded-full bg-deep-violet/30 border border-[#4A90E2]/25 flex items-center justify-center text-neon-purple hover:bg-neon-purple/30 hover:text-[#172B4D] transition-all">
            <span class="material-symbols-outlined text-[20px]">auto_awesome</span>
          </a>
        </div>
      </header>

      <main class="px-5 pt-4 space-y-6 animate-enter">
        <div class="flex items-center justify-between text-[11px] gap-2">
          <span class="font-code text-[#64748B]/60 truncate">${esc(settings.collegeName || 'Live AI Classroom')}</span>
          ${renderSyncPill()}
        </div>

        <!-- AI Assistant Hero Banner -->
        <section class="relative rounded-xl p-5 bg-gradient-to-br from-[#EBF4FF] via-[#F0F8FF] to-white border border-[#4A90E2]/20 shadow-[0_8px_32px_rgba(74,144,226,0.1)] overflow-hidden group">
          <div class="absolute -top-12 -right-12 w-32 h-32 bg-[#4A90E2]/15 rounded-full blur-2xl"></div>
          <div class="flex items-start justify-between relative z-10 mb-3">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#64748B] text-label-sm font-label">
              <span class="material-symbols-outlined text-sm text-neon-purple animate-pulse">psychology</span>
              <span>Live Academic Copilot</span>
            </div>
            <span class="font-code text-label-sm text-[#64748B]/60">${esc(settings.aiEngineVersion)}</span>
          </div>
          <div class="relative z-10 mb-4">
            <h2 class="font-headline text-headline-sm text-[#172B4D] mb-1">Ask Your AI Study Assistant</h2>
            <p class="text-body-sm text-[#64748B]/80">
              Ask course questions or scan equations and lecture notes for step-by-step solutions.
            </p>
          </div>
          <div class="relative z-10 flex items-center gap-3">
            <a href="#student/chat" class="flex-1 py-2.5 px-4 rounded-md bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white font-label text-label-lg shadow-[0_0_20px_rgba(74,144,226,0.2)] flex items-center justify-center gap-2 border border-[#4A90E2]/35 active:scale-95 transition-all">
              <span class="material-symbols-outlined text-[18px]">chat</span>
              <span>Ask Assistant</span>
            </a>
            <a href="#student/scan" class="py-2.5 px-3.5 rounded-md bg-[#F0F8FF] border border-[#4A90E2]/10 hover:border-[#4A90E2]/40 text-[#64748B] hover:text-[#172B4D] flex items-center gap-1.5 text-label-md transition-colors">
              <span class="material-symbols-outlined text-[18px] text-neon-purple">photo_camera</span>
              <span>Scan</span>
            </a>
          </div>
        </section>

        <!-- Quick Actions -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-headline text-title-lg text-[#172B4D]">Quick Actions</h2>
          </div>
          <div class="grid grid-cols-2 gap-3.5">
            <a href="#student/scan" class="p-4 rounded-lg bg-white/80 border border-[#4A90E2]/15 hover:border-[#4A90E2]/40 transition-all flex flex-col justify-between group">
              <div class="w-10 h-10 rounded-md bg-neon-purple/20 border border-[#4A90E2]/25 text-neon-purple flex items-center justify-center mb-3">
                <span class="material-symbols-outlined text-[22px]">document_scanner</span>
              </div>
              <div>
                <h3 class="font-headline text-title-md text-[#172B4D]">Scan &amp; Solve</h3>
                <p class="text-body-sm text-[#64748B]/70 text-xs mt-0.5">Equation &amp; OCR solver</p>
              </div>
            </a>

            <a href="#student/vault" class="p-4 rounded-lg bg-white/80 border border-[#4A90E2]/15 hover:border-[#4A90E2]/40 transition-all flex flex-col justify-between group">
              <div class="flex items-center justify-between mb-3">
                <div class="w-10 h-10 rounded-md bg-deep-violet/30 border border-deep-violet/50 text-[#64748B] flex items-center justify-center">
                  <span class="material-symbols-outlined text-[22px]">menu_book</span>
                </div>
                <span class="px-2 py-0.5 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 text-[#64748B] font-code text-[11px]">${materials.length}</span>
              </div>
              <div>
                <h3 class="font-headline text-title-md text-[#172B4D]">Study Vault</h3>
                <p class="text-body-sm text-[#64748B]/70 text-xs mt-0.5">${materials.length} uploaded ${materials.length === 1 ? 'file' : 'files'}</p>
              </div>
            </a>

            <a href="#student/assignments" class="p-4 rounded-lg bg-white/80 border border-[#4A90E2]/15 hover:border-[#4A90E2]/40 transition-all flex flex-col justify-between group">
              <div class="flex items-center justify-between mb-3">
                <div class="w-10 h-10 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <span class="material-symbols-outlined text-[22px]">assignment</span>
                </div>
                <span class="px-2 py-0.5 rounded-full bg-neon-purple/20 border border-[#4A90E2]/25 text-neon-purple font-code text-[11px]">${pendingCount} Due</span>
              </div>
              <div>
                <h3 class="font-headline text-title-md text-[#172B4D]">Assignments</h3>
                <p class="text-body-sm text-[#64748B]/70 text-xs mt-0.5">Submit &amp; track work</p>
              </div>
            </a>

            <a href="#student/assignments?tab=notices" class="p-4 rounded-lg bg-white/80 border border-[#4A90E2]/15 hover:border-[#4A90E2]/40 transition-all flex flex-col justify-between group">
              <div class="flex items-center justify-between mb-3">
                <div class="w-10 h-10 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                  <span class="material-symbols-outlined text-[22px]">campaign</span>
                </div>
                <span class="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 font-code text-[11px]">${notices.length}</span>
              </div>
              <div>
                <h3 class="font-headline text-title-md text-[#172B4D]">Notices</h3>
                <p class="text-body-sm text-[#64748B]/70 text-xs mt-0.5">Campus announcements</p>
              </div>
            </a>
          </div>
        </section>

        <!-- Official Uploaded College Timetable -->
        ${timetableImage ? `
          <section class="p-4 rounded-xl bg-white/80 border border-[#4A90E2]/20 space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="font-headline text-title-md text-[#172B4D] flex items-center gap-1.5">
                <span class="material-symbols-outlined text-neon-purple text-[20px]">calendar_month</span>
                Official College Timetable
              </h2>
              <button id="studentZoomTtBtn" type="button" class="text-xs font-code text-neon-purple hover:underline">Full View</button>
            </div>
            <img id="studentTtThumb" src="${timetableImage.dataUrl}" alt="College Timetable" class="w-full h-auto rounded-lg border border-glass-border cursor-pointer object-contain bg-[#E6F4FF]" />
          </section>
        ` : ''}

        <!-- Classes & Schedule -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-headline text-title-lg text-[#172B4D]">Live &amp; Scheduled Classes</h2>
            <span class="font-code text-label-sm text-neon-purple">${liveClasses.length + timetable.length} Active</span>
          </div>

          ${liveClasses.length === 0 && timetable.length === 0 ? `
            <div class="p-5 rounded-lg bg-white/60 border border-dashed border-[#4A90E2]/20 text-center text-xs text-[#64748B]/65">
              No live or manual classes scheduled yet. Check back once your administrator publishes the timetable.
            </div>
          ` : `
            <div class="space-y-3">
              ${liveClasses.map((cls) => `
                <article class="p-4 rounded-lg bg-gradient-to-r from-[#EBF4FF] to-[#E0EFFF] border border-[#4A90E2]/30 space-y-2">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <span class="px-2 py-0.5 rounded-full bg-success/20 border border-success/40 text-success text-[11px] font-label inline-flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span> LIVE NOW
                      </span>
                      <h3 class="font-headline text-title-md text-[#172B4D] mt-1">${esc(cls.title)}</h3>
                      <p class="text-xs text-[#64748B]/70">${esc(cls.instructor || '')} ${cls.room ? `• ${esc(cls.room)}` : ''}</p>
                    </div>
                    <span class="font-code text-xs text-[#64748B] bg-[#4A90E2]/5 px-2 py-1 rounded border border-[#4A90E2]/10 shrink-0">${esc(cls.timeRange || '')}</span>
                  </div>
                  <div class="pt-2 border-t border-glass-border flex justify-end">
                    <button data-join-live="${esc(cls.id)}" type="button" class="px-3 py-1.5 rounded-md bg-neon-purple hover:bg-electric-violet text-[#172B4D] text-xs font-label flex items-center gap-1">
                      <span>Join Live</span>
                      <span class="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>
                </article>
              `).join('')}

              ${timetable.slice(0, 4).map((slot) => `
                <article class="p-3.5 rounded-lg bg-white/70 border border-[#4A90E2]/10 flex items-start justify-between gap-2">
                  <div>
                    <span class="font-code text-[11px] text-neon-purple uppercase">${esc(slot.day)} • ${esc(slot.code)}</span>
                    <h3 class="font-headline text-sm text-[#172B4D] mt-0.5">${esc(slot.title)}</h3>
                    ${slot.meta ? `<p class="text-xs text-[#64748B]/65 mt-0.5">${esc(slot.meta)}</p>` : ''}
                  </div>
                  <span class="font-code text-[11px] text-[#64748B]/80 bg-[#F0F8FF] px-2 py-1 rounded border border-white/10 shrink-0">${esc(slot.slot)}</span>
                </article>
              `).join('')}
            </div>
          `}
        </section>

        <!-- Upcoming Events -->
        ${events.length > 0 ? `
          <section class="space-y-2.5">
            <h2 class="font-headline text-title-lg text-[#172B4D]">Campus Events</h2>
            ${events.slice(0, 3).map((ev) => `
              <div class="p-3.5 rounded-lg bg-white/70 border border-emerald-500/20">
                <span class="font-code text-[11px] text-emerald-400">${esc(ev.date)} ${ev.time ? `• ${esc(ev.time)}` : ''}</span>
                <h3 class="font-headline text-sm text-[#172B4D] mt-0.5">${esc(ev.title)}</h3>
                ${ev.venue ? `<p class="text-xs text-[#64748B]/65">${esc(ev.venue)}</p>` : ''}
              </div>
            `).join('')}
          </section>
        ` : ''}
      </main>

      ${renderStudentBottomNav('student/home')}
    </div>
  `;

  container.querySelectorAll('[data-join-live]').forEach((btn) => {
    btn.addEventListener('click', () => openLiveClassroomModal(btn.dataset.joinLive));
  });

  const openTtFull = () => {
    if (!timetableImage) return;
    openModal(`
      <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden">
        <div class="px-5 py-3 border-b border-glass-border flex items-center justify-between">
          <span class="font-headline text-sm text-[#172B4D]">Official College Timetable</span>
          <button type="button" data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="p-3 max-h-[82vh] overflow-auto flex justify-center bg-[#E6F4FF]">
          <img src="${timetableImage.dataUrl}" alt="Full Timetable" class="max-w-none sm:max-w-full h-auto object-contain" />
        </div>
      </div>
    `, null, 'max-w-6xl');
  };
  container.querySelector('#studentZoomTtBtn')?.addEventListener('click', openTtFull);
  container.querySelector('#studentTtThumb')?.addEventListener('click', openTtFull);

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
}

/* =========================================================================
   SCREEN 3: AI CHAT ASSISTANT
   ========================================================================= */
let activeChatCourse = 'General';

export function renderAIChat(container, queryParams = {}) {
  const { chatMessages, settings, timetable } = store.state;
  const hasGemini = !!store.getGeminiKey();
  const configuredCourses = ['General'];
  (settings.departments || []).forEach((d) => {
    (d.courses || []).forEach((c) => {
      if (c && !configuredCourses.includes(c)) configuredCourses.push(c);
    });
  });
  (timetable || []).forEach((t) => {
    const label = t.title && !/lunch/i.test(t.title) ? t.title.trim() : '';
    if (label && !configuredCourses.includes(label)) configuredCourses.push(label);
  });
  if (!configuredCourses.includes(activeChatCourse)) activeChatCourse = 'General';

  container.innerHTML = `
    <div class="student-shell student-shell-frame min-h-screen flex flex-col justify-between relative">
      <header class="sticky top-0 z-40 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-[#4A90E2]/10 px-4 py-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <a href="#student/home" class="w-9 h-9 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-center justify-center text-[#64748B] hover:text-[#172B4D] transition-all" aria-label="Back">
            <span class="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-[#4A90E2] to-[#2563EB] flex items-center justify-center text-white shadow-[0_0_12px_rgba(74,144,226,0.3)]">
              <span class="material-symbols-outlined text-[20px]">smart_toy</span>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <h1 class="font-headline text-title-md text-[#172B4D]">Live AI Tutor</h1>
                <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              </div>
              <p class="font-code text-[11px] text-neon-purple font-medium">${hasGemini ? 'Gemini 2.5 Live' : `Academic Core • ${esc(settings.aiEngineVersion)}`}</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <select id="chatCourseSelect" class="max-w-[115px] px-2.5 py-1 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 text-[#64748B] font-code text-[11px] focus:border-[#4A90E2] outline-none">
            ${configuredCourses.map((c) => `<option value="${esc(c)}" ${c === activeChatCourse ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
          <button id="clearChatBtn" type="button" title="Clear Session" class="w-8 h-8 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 text-[#64748B]/70 hover:text-[#172B4D] flex items-center justify-center">
            <span class="material-symbols-outlined text-[16px]">refresh</span>
          </button>
        </div>
      </header>

      <main id="chatStream" class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        ${chatMessages.length === 0 ? `
          <div class="p-6 rounded-2xl bg-white/80 border border-[#4A90E2]/15 text-center space-y-3 my-6">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] flex items-center justify-center">
              <span class="material-symbols-outlined text-[26px]">auto_awesome</span>
            </div>
            <h2 class="font-headline text-title-md text-[#172B4D]">How can I help you study today?</h2>
            <p class="text-xs text-[#64748B]/70">Select a syllabus subject above (such as LTPSC), ask any academic question, or click Quiz Me.</p>
            <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button type="button" id="quizMeQuickBtn" class="px-3.5 py-1.5 rounded-full bg-neon-purple/20 hover:bg-neon-purple/35 border border-[#4A90E2]/35 text-[#172B4D] text-xs font-label inline-flex items-center gap-1.5 transition-colors">
                <span class="material-symbols-outlined text-[15px] text-neon-purple">quiz</span>
                <span>Quiz Me (${esc(activeChatCourse)})</span>
              </button>
            </div>
          </div>
        ` : chatMessages.map((msg) => renderChatBubble(msg)).join('')}

        <div id="typingIndicator" class="hidden flex items-start gap-2.5">
          <div class="w-7 h-7 rounded-full bg-[#4A90E2]/10 border border-[#4A90E2]/30 flex-shrink-0 flex items-center justify-center text-neon-purple mt-1">
            <span class="material-symbols-outlined text-[16px] animate-spin">auto_awesome</span>
          </div>
          <div class="rounded-2xl rounded-tl-sm px-4 py-3 bg-[#E6F4FF]/90 border border-[#4A90E2]/20 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-neon-purple typing-dot"></span>
            <span class="w-2 h-2 rounded-full bg-electric-violet typing-dot"></span>
            <span class="w-2 h-2 rounded-full bg-cyber-lavender typing-dot"></span>
            <span class="font-code text-[11px] text-[#64748B]/70 ml-1">Thinking…</span>
          </div>
        </div>
      </main>

      <footer class="sticky bottom-0 z-40 bg-white/90 backdrop-blur-xl border-t border-[#4A90E2]/10 p-3">
        <form id="chatForm" class="flex items-center gap-2">
          <a href="#student/scan" aria-label="Scan" class="w-11 h-11 rounded-md bg-[#F0F8FF] border border-[#4A90E2]/10 hover:border-[#4A90E2]/30 text-[#64748B] flex items-center justify-center transition-colors shrink-0">
            <span class="material-symbols-outlined text-[20px]">add_a_photo</span>
          </a>
          <div class="flex-1 relative flex items-center">
            <input id="chatInput" type="text" placeholder="Ask any study question or equation..." class="w-full pl-3.5 pr-10 py-2.5 rounded-md bg-white/85 border border-[#4A90E2]/25 text-[#172B4D] placeholder-[#64748B]/40 text-body-md focus:border-[#4A90E2] focus:ring-2 focus:ring-[#4A90E2]/30/30 outline-none transition-all font-body" />
            <button id="voiceInputBtn" type="button" aria-label="Voice input" class="absolute right-3 text-[#64748B]/60 hover:text-neon-purple">
              <span class="material-symbols-outlined text-[20px]">mic</span>
            </button>
          </div>
          <button type="submit" aria-label="Send" class="w-11 h-11 rounded-md bg-gradient-to-tr from-[#4A90E2] to-[#2563EB] text-white flex items-center justify-center shadow-[0_0_18px_rgba(74,144,226,0.5)] active:scale-95 transition-all border border-[#4A90E2]/40 shrink-0">
            <span class="material-symbols-outlined text-[20px]">send</span>
          </button>
        </form>
      </footer>
    </div>
  `;

  const stream = container.querySelector('#chatStream');
  stream.scrollTop = stream.scrollHeight;

  async function sendPrompt(text) {
    const clean = text.trim();
    if (!clean) return;
    await store.appendChatMessage({ role: 'user', course: activeChatCourse, text: clean });
    document.getElementById('typingIndicator')?.classList.remove('hidden');
    await new Promise((r) => setTimeout(r, 450));
    const reply = await generateTutorReply(clean, activeChatCourse);
    await store.appendChatMessage({ role: 'ai', course: activeChatCourse, ...reply });
  }

  container.querySelector('#chatCourseSelect').addEventListener('change', (e) => {
    activeChatCourse = e.target.value;
    renderAIChat(container);
  });

  container.querySelector('#clearChatBtn').addEventListener('click', async () => {
    await store.clearChat();
    showToast('Started new AI Tutor session', 'purple');
  });

  container.querySelector('#chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = container.querySelector('#chatInput');
    const val = inp.value;
    inp.value = '';
    await sendPrompt(val);
  });

  container.querySelector('#quizMeQuickBtn')?.addEventListener('click', () => {
    sendPrompt(`Generate 3 practice MCQs for ${activeChatCourse}`);
  });

  container.querySelectorAll('[data-copy-formula]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copyFormula);
        showToast('Copied to clipboard!', 'success');
      } catch {}
    });
  });

  container.querySelector('#voiceInputBtn').addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showToast('Voice dictation is not supported in this browser.', 'warning');
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    showToast('Listening…', 'purple');
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || '';
      const inp = container.querySelector('#chatInput');
      if (inp && transcript) inp.value = transcript;
    };
    rec.start();
  });

  if (queryParams.ask && !window.__consumedAskParam) {
    window.__consumedAskParam = queryParams.ask;
    setTimeout(() => {
      sendPrompt(queryParams.ask);
      setTimeout(() => { window.__consumedAskParam = null; }, 2000);
    }, 150);
  }
}

function renderChatBubble(msg) {
  if (msg.role === 'user') {
    return `
      <div class="flex justify-end animate-enter">
        <div class="max-w-[85%] rounded-2xl rounded-tr-sm p-4 bg-gradient-to-r from-[#4A90E2]/90 to-[#2563EB] text-white shadow-[0_4px_20px_rgba(74,144,226,0.25)] border border-[#4A90E2]/25">
          <p class="text-body-md whitespace-pre-wrap">${esc(msg.text)}</p>
          <span class="block text-right font-code text-[10px] text-[#172B4D]/70 mt-1">${esc(msg.time)}</span>
        </div>
      </div>
    `;
  }
  return `
    <div class="flex items-start gap-2.5 animate-enter">
      <div class="w-7 h-7 rounded-full bg-[#4A90E2]/10 border border-[#4A90E2]/30 flex-shrink-0 flex items-center justify-center text-neon-purple mt-1">
        <span class="material-symbols-outlined text-[16px]">auto_awesome</span>
      </div>
      <div class="max-w-[88%] rounded-2xl rounded-tl-sm p-4 bg-white/80 border border-[#4A90E2]/20 backdrop-blur-xl space-y-3">
        <p class="text-body-md text-[#172B4D] whitespace-pre-wrap">${esc(msg.text)}</p>
        ${msg.formula ? `
          <div class="p-3 rounded-lg bg-[#F0F8FF] border border-[#4A90E2]/15 font-code text-xs text-[#64748B] space-y-1 overflow-x-auto">
            <pre class="text-neon-purple font-semibold whitespace-pre-wrap font-code">${esc(msg.formula)}</pre>
            ${msg.formulaSub ? `<div class="text-[#172B4D]/60 text-[11px]">${esc(msg.formulaSub)}</div>` : ''}
          </div>
        ` : ''}
        ${msg.detailBody ? `<p class="text-body-sm text-[#172B4D]/80 whitespace-pre-wrap">${esc(msg.detailBody)}</p>` : ''}
        <div class="pt-2 border-t border-glass-border flex items-center justify-between">
          ${msg.formula ? `
            <button type="button" data-copy-formula="${esc(msg.formula)}" class="px-2.5 py-1 rounded bg-[#F0F8FF] hover:bg-[#4A90E2]/10 text-[#64748B] hover:text-[#172B4D] border border-glass-border text-xs flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">content_copy</span> Copy
            </button>
          ` : '<span></span>'}
          <span class="font-code text-[10px] text-[#64748B]/50">${esc(msg.time)}</span>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================================
   SCREEN 4: SCAN & SOLVE
   ========================================================================= */
let scanMode = 'Equation';
let uploadedPreviewUrl = null;
let uploadedBase64 = null;
let uploadedMime = 'image/jpeg';

export function renderScanSolve(container) {
  const enabled = store.state.settings.scanAndSolveEnabled;

  container.innerHTML = `
    <div class="student-shell student-shell-frame bg-[#F0F8FF] min-h-screen flex flex-col justify-between relative overflow-hidden">
      <header class="z-40 bg-[#F0F8FF]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-[#4A90E2]/10">
        <a href="#student/home" class="w-9 h-9 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-center justify-center text-[#64748B] hover:text-[#172B4D] transition-all">
          <span class="material-symbols-outlined text-[20px]">arrow_back</span>
        </a>
        <div class="flex items-center gap-1 p-1 rounded-full bg-[#E6F4FF] border border-[#4A90E2]/20">
          ${['Equation', 'Diagram', 'Text OCR'].map((m) => `
            <button type="button" data-scan-mode="${m}" class="px-3 py-1 rounded-full text-xs font-label transition-all ${
              scanMode === m ? 'bg-[#4A90E2] text-[#172B4D] shadow-[0_0_10px_rgba(74,144,226,0.3)]' : 'text-[#64748B]/70 hover:text-[#172B4D]'
            }">${m}</button>
          `).join('')}
        </div>
        <button id="toggleCameraBtn" type="button" title="Toggle Webcam" class="w-9 h-9 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-center justify-center text-[#64748B] hover:text-neon-purple">
          <span class="material-symbols-outlined text-[20px]">videocam</span>
        </button>
      </header>

      <main class="flex-1 relative flex flex-col items-center justify-center p-5 gap-3">
        ${!enabled ? `
          <div class="p-5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-center space-y-2 max-w-sm">
            <span class="material-symbols-outlined text-amber-400 text-[32px]">lock</span>
            <h2 class="font-headline text-title-md text-[#172B4D]">Scan &amp; Solve Paused by Admin</h2>
            <p class="text-xs text-[#64748B]/75">This feature is currently disabled in College Settings.</p>
          </div>
        ` : `
          <div class="relative w-full max-w-sm aspect-[4/5] rounded-xl border border-[#4A90E2]/25 bg-white/80 overflow-hidden shadow-[0_0_40px_rgba(74,144,226,0.1)] flex flex-col justify-between p-4">
            <video id="liveCameraVideo" autoplay playsinline muted class="hidden absolute inset-0 w-full h-full object-cover opacity-75"></video>
            ${uploadedPreviewUrl ? `<img src="${uploadedPreviewUrl}" class="absolute inset-0 w-full h-full object-contain bg-[#172B4D]/80" alt="Uploaded scan" />` : ''}

            <div class="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
            <div class="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-neon-purple rounded-tl-sm pointer-events-none"></div>
            <div class="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-neon-purple rounded-tr-sm pointer-events-none"></div>
            <div class="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-neon-purple rounded-bl-sm pointer-events-none"></div>
            <div class="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-neon-purple rounded-br-sm pointer-events-none"></div>
            <div class="scanner-laser absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-neon-purple to-transparent shadow-[0_0_8px_rgba(74,144,226,0.4)] pointer-events-none"></div>

            <div class="relative z-10 flex items-center justify-between">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/85 border border-[#4A90E2]/20 font-code text-[11px] text-[#64748B]">
                <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                ${uploadedPreviewUrl ? 'Image Loaded' : `Mode: ${esc(scanMode)}`}
              </span>
            </div>

            <div class="relative z-10 my-auto p-4 rounded-lg bg-white/85 border border-[#4A90E2] shadow-[0_0_25px_rgba(74,144,226,0.2)] backdrop-blur-md space-y-2">
              <span class="text-label-sm font-code text-neon-purple uppercase tracking-wider flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">auto_awesome</span>
                Enter Equation or Upload Image
              </span>
              <input id="scanEquationInput" type="text" placeholder="e.g. x^2 - 5x + 6 = 0 or d/dx(3x^4)" class="w-full font-code text-sm text-[#172B4D] text-center py-2 px-2 bg-[#E6F4FF]/50 rounded border border-white/15 focus:border-[#4A90E2] outline-none" />
            </div>

            <div class="relative z-10 text-center">
              <span class="inline-block px-3 py-1 rounded-full bg-white/85 border border-[#4A90E2]/15 text-[#64748B] text-xs">
                Upload from gallery, enable webcam, or type an equation
              </span>
            </div>
          </div>
        `}
      </main>

      <footer class="z-40 bg-white/90 backdrop-blur-xl border-t border-[#4A90E2]/10 px-6 py-5">
        <input id="galleryFileInput" type="file" accept="image/*" class="hidden" />
        <div class="flex items-center justify-around max-w-sm mx-auto">
          <button id="galleryBtn" type="button" class="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#172B4D] group">
            <div class="w-12 h-12 rounded-lg bg-[#E6F4FF] border border-[#4A90E2]/15 group-hover:border-[#4A90E2]/40 flex items-center justify-center">
              <span class="material-symbols-outlined text-[24px]">photo_library</span>
            </div>
            <span class="text-[11px] font-label">Gallery</span>
          </button>

          <button id="shutterSolveBtn" type="button" ${!enabled ? 'disabled' : ''} aria-label="Solve" class="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-[#4A90E2] via-[#64B5F6] to-[#2563EB] shadow-[0_0_30px_rgba(74,144,226,0.5)] active:scale-95 transition-all disabled:opacity-40">
            <div class="w-full h-full rounded-full border-2 border-white/80 bg-[#F0F8FF] flex items-center justify-center">
              <span class="material-symbols-outlined text-[#172B4D] text-[32px]">document_scanner</span>
            </div>
          </button>

          <a href="#student/chat" class="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#172B4D] group">
            <div class="w-12 h-12 rounded-lg bg-[#E6F4FF] border border-[#4A90E2]/15 group-hover:border-[#4A90E2]/40 flex items-center justify-center">
              <span class="material-symbols-outlined text-[24px]">smart_toy</span>
            </div>
            <span class="text-[11px] font-label">AI Tutor</span>
          </a>
        </div>
      </footer>
    </div>
  `;

  container.querySelectorAll('[data-scan-mode]').forEach((btn) => {
    btn.addEventListener('click', () => { scanMode = btn.dataset.scanMode; renderScanSolve(container); });
  });

  container.querySelector('#toggleCameraBtn')?.addEventListener('click', async () => {
    const video = container.querySelector('#liveCameraVideo');
    if (!video) return;
    if (activeCameraStream) {
      cleanupStudentViews();
      video.classList.add('hidden');
      return;
    }
    try {
      activeCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = activeCameraStream;
      video.classList.remove('hidden');
      showToast('Live camera connected!', 'success');
    } catch {
      showToast('Camera unavailable — upload an image or enter an equation.', 'warning');
    }
  });

  const galleryInput = container.querySelector('#galleryFileInput');
  container.querySelector('#galleryBtn')?.addEventListener('click', () => galleryInput?.click());
  galleryInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      uploadedPreviewUrl = reader.result;
      uploadedMime = file.type || 'image/jpeg';
      uploadedBase64 = String(reader.result).split(',')[1] || null;
      showToast(`Loaded "${file.name}"`, 'success');
      renderScanSolve(container);
    };
    reader.readAsDataURL(file);
  });

  container.querySelector('#shutterSolveBtn')?.addEventListener('click', async () => {
    const eqVal = container.querySelector('#scanEquationInput')?.value.trim() || '';
    if (!eqVal && !uploadedBase64) {
      showToast('Enter an equation or upload an image first.', 'warning');
      return;
    }
    showToast('Solving…', 'purple');
    const result = await runScanAndSolve({
      mode: scanMode,
      equationText: eqVal,
      imageBase64: uploadedBase64,
      mimeType: uploadedMime,
    });
    openModal(`
      <div class="rounded-2xl bg-white/92 border border-[#4A90E2]/30 overflow-hidden">
        <div class="px-5 py-4 border-b border-glass-border bg-[#E6F4FF]/60 flex items-center justify-between">
          <h3 class="font-headline text-title-lg text-[#172B4D]">${esc(result.detectedType)}</h3>
          <button data-close-modal class="text-[#64748B] hover:text-[#172B4D]"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="p-5 space-y-4">
          <div class="p-3 rounded-xl bg-[#F0F8FF] border border-[#4A90E2]/25 font-code text-center text-sm text-[#172B4D]">${esc(result.equation)}</div>
          <div class="space-y-2">
            ${result.steps.map((st, idx) => `
              <div class="p-3 rounded-lg bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-start gap-2.5 text-xs">
                <span class="w-5 h-5 rounded-full bg-neon-purple/25 text-neon-purple font-code text-[10px] flex items-center justify-center shrink-0">${idx + 1}</span>
                <span>${esc(st)}</span>
              </div>
            `).join('')}
          </div>
          <div class="p-3.5 rounded-xl bg-success/10 border border-success/40 flex items-center justify-between">
            <span class="text-xs text-emerald-200">Result</span>
            <span class="font-code text-sm font-bold text-success">${esc(result.finalAnswer)}</span>
          </div>
        </div>
      </div>
    `);
  });
}

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
    <div class="student-shell student-shell-frame pb-28 min-h-screen">
      <header class="sticky top-0 z-40 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-[#4A90E2]/10 px-5 py-3.5 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <a href="#student/home" class="w-9 h-9 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-center justify-center text-[#64748B] hover:text-[#172B4D] transition-all">
            <span class="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <div>
            <h1 class="font-headline text-title-lg text-[#172B4D]">Study Materials Vault</h1>
            <p class="text-[11px] font-code text-neon-purple">Uploaded Faculty Notes &amp; Documents</p>
          </div>
        </div>
        <span class="font-code text-xs px-2.5 py-0.5 rounded-full bg-neon-purple/20 border border-[#4A90E2]/25 text-[#64748B]">${materials.length}</span>
      </header>

      <main class="px-5 pt-5 space-y-5 animate-enter">
        <div class="space-y-3">
          <div class="relative flex items-center">
            <span class="material-symbols-outlined absolute left-3.5 text-[#64748B]/50 text-[18px]">search</span>
            <input id="vaultSearchInput" type="text" value="${esc(vaultSearch)}" placeholder="Search uploaded notes, PDFs, images..." class="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/85 border border-glass-border text-[#172B4D] text-xs placeholder-[#64748B]/40 focus:border-[#4A90E2] outline-none" />
          </div>

          ${courses.length > 0 ? `
            <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button type="button" data-vault-filter="ALL" class="px-3 py-1 rounded-full text-xs font-label whitespace-nowrap ${vaultFilter === 'ALL' ? 'bg-[#4A90E2] text-white' : 'bg-[#F0F8FF] text-[#64748B] border border-[#4A90E2]/10'}">
                All (${materials.length})
              </button>
              ${courses.map((c) => `
                <button type="button" data-vault-filter="${esc(c)}" class="px-3 py-1 rounded-full text-xs font-label whitespace-nowrap ${vaultFilter === c ? 'bg-[#4A90E2] text-white' : 'bg-[#F0F8FF] text-[#64748B] border border-[#4A90E2]/10'}">
                  ${esc(c)}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <section class="space-y-3.5">
          ${materials.length === 0 ? `
            <div class="p-10 rounded-xl bg-[#F0F8FF]/60 border border-dashed border-glass-border text-center space-y-2">
              <span class="material-symbols-outlined text-[#64748B]/40 text-[34px]">folder_open</span>
              <h3 class="font-headline text-sm text-[#172B4D]">No Study Materials Yet</h3>
              <p class="text-xs text-[#64748B]/65">Materials uploaded by your administrator will appear here automatically.</p>
            </div>
          ` : filtered.length === 0 ? `
            <div class="p-8 rounded-xl bg-[#F0F8FF]/60 border border-glass-border text-center text-xs text-[#64748B]/60">
              No study materials match your search.
            </div>
          ` : filtered.map((m) => {
            const st = iconFor(m.type);
            return `
              <article data-open-mat="${esc(m.id)}" class="p-4 rounded-xl bg-white/80 border border-glass-border hover:border-[#4A90E2]/30 transition-all flex items-start justify-between gap-3 group cursor-pointer">
                <div class="flex items-start gap-3 min-w-0">
                  <div class="w-10 h-10 rounded-lg ${st.cls} border flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-[22px]">${st.icon}</span>
                  </div>
                  <div class="min-w-0">
                    <span class="font-code text-[11px] ${st.tag} uppercase block truncate">${esc(m.courseTag)}</span>
                    <h4 class="font-headline text-sm font-semibold text-[#172B4D] mt-0.5 break-words">${esc(m.title)}</h4>
                    <p class="text-[11px] text-[#64748B]/60 mt-0.5">${esc(m.meta || m.author)}</p>
                  </div>
                </div>
                <button type="button" data-download-mat="${esc(m.id)}" class="p-2 rounded-lg bg-[#F0F8FF] hover:bg-[#4A90E2]/10 text-[#64748B] hover:text-[#172B4D] transition-colors flex-shrink-0" title="Download">
                  <span class="material-symbols-outlined text-[20px]">download</span>
                </button>
              </article>
            `;
          }).join('')}
        </section>
      </main>

      ${renderStudentBottomNav('student/vault')}
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
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mat = materials.find((x) => x.id === btn.dataset.downloadMat);
      if (!mat) return;
      if (mat.fileDataUrl) {
        downloadDataUrl(mat.fileName || mat.title, mat.fileDataUrl);
      } else {
        downloadTextFile(`${mat.title.replace(/[^a-z0-9]+/gi, '_')}.txt`, `${mat.title}\n${mat.courseTag}\n\n${mat.summary || ''}\n`);
      }
      showToast(`Downloaded "${mat.title}"`, 'success');
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
        host.querySelector('#modalDlMatBtn')?.addEventListener('click', () => {
          if (mat.fileDataUrl) downloadDataUrl(mat.fileName || mat.title, mat.fileDataUrl);
          else downloadTextFile(`${mat.title.replace(/[^a-z0-9]+/gi, '_')}.txt`, `${mat.title}\n\n${mat.summary || ''}\n`);
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
    <div class="student-shell student-shell-frame pb-28 min-h-screen">
      <header class="sticky top-0 z-40 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-[#4A90E2]/10 px-5 py-3.5 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2.5">
          <a href="#student/home" class="w-9 h-9 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-center justify-center text-[#64748B] hover:text-[#172B4D] shrink-0">
            <span class="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <h1 class="font-headline text-title-md text-[#172B4D]">Assignments &amp; Notices</h1>
        </div>
        <div class="flex items-center gap-1 p-1 rounded-full bg-[#E6F4FF] border border-[#4A90E2]/20 shrink-0">
          <button id="assignTabBtn" type="button" class="px-3 py-1 rounded-full text-xs font-label ${activeTab === 'assignments' ? 'bg-[#4A90E2] text-white' : 'text-[#64748B]'}">Assignments (${assignments.length})</button>
          <button id="noticeTabBtn" type="button" class="px-3 py-1 rounded-full text-xs font-label ${activeTab === 'notices' ? 'bg-[#4A90E2] text-white' : 'text-[#64748B]'}">Notices (${notices.length})</button>
        </div>
      </header>

      <main class="px-5 pt-5 space-y-5 animate-enter">
        <div id="assignmentsSection" class="${activeTab === 'assignments' ? '' : 'hidden'} space-y-4">
          ${assignments.length === 0 ? `
            <div class="p-10 rounded-xl bg-[#F0F8FF]/60 border border-dashed border-glass-border text-center space-y-2">
              <span class="material-symbols-outlined text-[#64748B]/40 text-[34px]">assignment</span>
              <h3 class="font-headline text-sm text-[#172B4D]">No Assignments Posted</h3>
              <p class="text-xs text-[#64748B]/65">Assignments posted by your administrator will appear here.</p>
            </div>
          ` : `
            ${pending.length > 0 ? `
              <div class="p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-50 to-white border border-amber-500/40 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
                    <span class="material-symbols-outlined text-[22px]">timer</span>
                  </div>
                  <div>
                    <h3 class="font-headline text-sm font-semibold text-[#172B4D]">${pending.length} Pending Submission${pending.length > 1 ? 's' : ''}</h3>
                    <p class="text-[11px] text-[#64748B]/70">${esc(pending[0].title)}</p>
                  </div>
                </div>
              </div>
            ` : ''}

            ${assignments.map((a) => a.status === 'Pending' ? `
              <article class="p-4 rounded-xl bg-white/80 border border-[#4A90E2]/35 space-y-3">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <span class="font-code text-[11px] text-neon-purple font-medium">${esc(a.course)}</span>
                    <h4 class="font-headline text-title-md text-[#172B4D] mt-0.5">${esc(a.title)}</h4>
                    <p class="text-xs text-[#64748B]/70 mt-0.5">${esc(a.description)}</p>
                  </div>
                  <span class="px-2 py-0.5 rounded-full bg-error/20 text-error font-code text-[11px] border border-error/40 shrink-0">${esc(a.dueLabel)}</span>
                </div>
                <div class="flex items-center gap-2 pt-1">
                  <button type="button" data-upload-asg="${esc(a.id)}" class="flex-1 py-2 rounded-lg bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white text-xs font-label flex items-center justify-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px]">upload_file</span>
                    <span>Upload Solution</span>
                  </button>
                </div>
              </article>
            ` : `
              <article class="p-4 rounded-xl bg-white/80 border border-glass-border space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <span class="font-code text-[11px] text-electric-violet font-medium">${esc(a.course)}</span>
                    <h4 class="font-headline text-title-md text-[#172B4D] mt-0.5">${esc(a.title)}</h4>
                  </div>
                  <span class="px-2 py-0.5 rounded-full bg-success/20 text-success font-code text-[11px] border border-success/40 shrink-0">Graded: ${a.score}/${a.points}</span>
                </div>
                ${a.feedback ? `<div class="p-2.5 rounded-lg bg-white/85 border border-glass-border text-xs text-[#64748B]/80"><strong class="text-[#172B4D]">Feedback:</strong> ${esc(a.feedback)}</div>` : ''}
              </article>
            `).join('')}
          `}
        </div>

        <div id="noticesSection" class="${activeTab === 'notices' ? '' : 'hidden'} space-y-4">
          ${notices.length === 0 ? `
            <div class="p-10 rounded-xl bg-[#F0F8FF]/60 border border-dashed border-glass-border text-center space-y-2">
              <span class="material-symbols-outlined text-[#64748B]/40 text-[34px]">campaign</span>
              <h3 class="font-headline text-sm text-[#172B4D]">No Notices Yet</h3>
              <p class="text-xs text-[#64748B]/65">Official college announcements will appear here.</p>
            </div>
          ` : notices.map((n) => `
            <article class="p-4 rounded-xl bg-white/80 border border-[#4A90E2]/20 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span class="font-code text-[11px] px-2 py-0.5 rounded border text-neon-purple bg-neon-purple/10 border-[#4A90E2]/20">${esc(n.category)}</span>
                <span class="font-code text-[11px] text-[#64748B]/50">${esc(n.timeLabel)}</span>
              </div>
              <h4 class="font-headline text-title-md text-[#172B4D]">${esc(n.title)}</h4>
              <p class="text-xs text-[#64748B]/80 leading-relaxed">${esc(n.body)}</p>
              ${n.hasAttachment ? `
                <button type="button" data-dl-notice="${esc(n.id)}" class="px-3 py-1.5 rounded-md bg-[#F0F8FF] border border-[#4A90E2]/10 text-xs text-neon-purple flex items-center gap-1">
                  <span class="material-symbols-outlined text-sm">download</span> Download Circular
                </button>
              ` : ''}
            </article>
          `).join('')}
        </div>
      </main>

      ${renderStudentBottomNav('student/assignments')}
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
  const savedKey = store.getGeminiKey();

  container.innerHTML = `
    <div class="student-shell student-shell-frame pb-28 min-h-screen">
      <header class="sticky top-0 z-40 bg-[#F0F8FF]/90 backdrop-blur-xl border-b border-[#4A90E2]/10 px-5 py-3.5 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <a href="#student/home" class="w-9 h-9 rounded-full bg-[#F0F8FF] border border-[#4A90E2]/10 flex items-center justify-center text-[#64748B] hover:text-[#172B4D]">
            <span class="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <h1 class="font-headline text-title-lg text-[#172B4D]">Student Profile &amp; Settings</h1>
        </div>
        <span class="px-2.5 py-0.5 rounded-full bg-success/20 text-success border border-success/40 text-[11px] font-code">Active</span>
      </header>

      <main class="px-5 pt-6 space-y-6 animate-enter">
        <section class="p-6 rounded-2xl bg-gradient-to-b from-[#EBF4FF] to-white border border-[#4A90E2]/25 text-center">
          <input id="avatarUploadInp" type="file" accept="image/*" class="hidden" />
          <div class="relative w-24 h-24 mx-auto mb-4">
            <div class="w-full h-full rounded-full bg-gradient-to-tr from-[#4A90E2] via-[#64B5F6] to-[#2563EB] p-[2px]">
              <div class="w-full h-full rounded-full bg-white flex items-center justify-center text-[#172B4D] font-headline text-display-lg-mobile font-bold overflow-hidden">
                ${student.avatarDataUrl ? `<img src="${esc(student.avatarDataUrl)}" class="w-full h-full object-cover" />` : esc(student.initials)}
              </div>
            </div>
            <button id="changeAvatarBtn" type="button" class="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#4A90E2] border-2 border-white text-white flex items-center justify-center">
              <span class="material-symbols-outlined text-[16px]">photo_camera</span>
            </button>
          </div>
          <h2 class="font-headline text-headline-sm text-[#172B4D]">${esc(student.name)}</h2>
          <p class="font-code text-xs text-neon-purple font-medium mt-0.5">${esc(student.regNo)}</p>
          <p class="text-xs text-[#64748B]/70 mt-1">${esc(student.email)}${student.phone ? ` • <span class="font-code text-neon-purple">${esc(student.phone)}</span>` : ''}</p>

          <div class="mt-4 pt-4 border-t border-glass-border flex items-center justify-around text-xs font-code">
            <div>
              <span class="text-[#64748B]/50 block">Department</span>
              <span class="text-[#172B4D] font-semibold block mt-0.5">${esc(student.department || '—')}</span>
            </div>
            <div class="w-[1px] h-6 bg-glass-border"></div>
            <div>
              <span class="text-[#64748B]/50 block">Year &amp; Sec</span>
              <span class="text-[#172B4D] font-semibold block mt-0.5">${esc(student.year)} • ${esc(student.section)}</span>
            </div>
          </div>
        </section>

        <section class="p-5 rounded-xl bg-white/75 border border-[#4A90E2]/20 space-y-3">
          <div class="flex items-center justify-between border-b border-glass-border pb-2.5">
            <div>
              <h3 class="font-headline text-title-md text-[#172B4D]">Live Gemini AI Connector</h3>
              <p class="text-[11px] text-[#64748B]/65">Optional: connect your Gemini API key for live cloud AI</p>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-code ${savedKey ? 'bg-success/20 text-success' : 'bg-[#E6F4FF] text-[#64748B]/70'}">
              ${savedKey ? 'LIVE KEY SET' : 'LOCAL ENGINE'}
            </span>
          </div>
          <form id="geminiKeyForm" class="flex items-center gap-2">
            <input id="geminiKeyInput" type="password" value="${esc(savedKey)}" placeholder="AIzaSy... (stored locally)" class="flex-1 px-3 py-2 rounded-lg bg-white/85 border border-glass-border text-[#172B4D] text-xs font-code outline-none" />
            <button type="submit" class="px-3.5 py-2 rounded-lg bg-[#4A90E2] text-white text-xs font-label">Save</button>
          </form>
        </section>

        <section class="p-5 rounded-xl bg-white/75 border border-glass-border space-y-4">
          <h3 class="font-headline text-title-md text-[#172B4D] border-b border-glass-border pb-2.5">Update Password</h3>
          <form id="updatePwdForm" class="space-y-3">
            <div class="relative flex items-center">
              <input id="curPwd" type="password" required placeholder="Current password" class="w-full pl-3 pr-10 py-2 rounded-lg bg-white/85 border border-glass-border text-[#172B4D] text-xs font-code outline-none focus:border-[#4A90E2]" />
              <button type="button" data-eye-for="curPwd" class="absolute right-2 text-[#64748B]/60 hover:text-[#172B4D]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
            </div>
            <div class="relative flex items-center">
              <input id="newPwd" type="password" required minlength="6" placeholder="New password (min 6 chars)" class="w-full pl-3 pr-10 py-2 rounded-lg bg-white/85 border border-glass-border text-[#172B4D] text-xs font-code outline-none focus:border-[#4A90E2]" />
              <button type="button" data-eye-for="newPwd" class="absolute right-2 text-[#64748B]/60 hover:text-[#172B4D]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
            </div>
            <div class="relative flex items-center">
              <input id="confPwd" type="password" required minlength="6" placeholder="Confirm new password" class="w-full pl-3 pr-10 py-2 rounded-lg bg-white/85 border border-glass-border text-[#172B4D] text-xs font-code outline-none focus:border-[#4A90E2]" />
              <button type="button" data-eye-for="confPwd" class="absolute right-2 text-[#64748B]/60 hover:text-[#172B4D]"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
            </div>
            <button type="submit" class="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#4A90E2] to-[#2563EB] text-white font-label text-xs">Update Password</button>
          </form>
        </section>

        <div class="space-y-2.5">
          <button id="studentSignOutBtn" type="button" class="w-full py-2.5 rounded-lg bg-error/15 border border-error/40 hover:bg-error/25 text-error font-label text-xs flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[18px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </main>

      ${renderStudentBottomNav('student/profile')}
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

  container.querySelector('#geminiKeyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = container.querySelector('#geminiKeyInput').value.trim();
    store.setGeminiKey(key);
    showToast(key ? 'Live Gemini API key connected!' : 'Using local Academic AI engine.', 'success');
    renderStudentProfile(container);
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
