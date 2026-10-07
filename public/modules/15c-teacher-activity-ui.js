/* ===== Teacher Activity Command Center =====
   Replaces the old single-exam "Staff Activity" page. Everything is computed
   across ALL exams and ALL levels (KG / Primary / High School) at once:
   one "task" = one subject's marks sheet for one class-section in one exam.
   A task is complete when every active student in that class-section has a
   mark (or is marked absent). Teachers come from the master Subjects catalog,
   falling back to the exam's own subject staff. Loaded after 15b-staff-ui.js,
   so these functions override the older ones of the same name. */
let tacLevel = 'ALL';          // ALL | KG | PRI | HIGH
let tacExamIds = [];           // [] = every exam
let tacSearch = '';
let tacTab = 'marks';          // marks | teachers | homeroom | inbox
let tacStatus = 'pending';     // pending | notstarted | partial | overdue | unassigned | complete | all
let tacTFilter = 'all';        // teachers tab: all | behind | clear | absent | homeroom | inbox
let tacRange = 7;
let tacClassSec = '';          // "cls||sec" drill-down from the heatmap
let tacShown = 40;             // rows visible in the sheets table
let tacAuto = true;
let tacLastLoad = 0;
let tacBusy = false;
let tacModel = null;
let tacTimer = null;
let tacDrawerStaff = '';
let tacDrawerOpener = null;
const TAC_LEVELS = [['ALL','All levels'],['KG','KG'],['PRI','Primary'],['HIGH','High School']];
const TAC_LEVEL_NAME = { KG:'KG', PRI:'Primary', HIGH:'High School', OTHER:'Other' };
const TAC_REFRESH_SECS = 60;

function tacEsc(s){ return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function tacJs(s){ return String(s == null ? '' : s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
function tacIcon(n, size){
  const p = {
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    alert:'<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2.2.7 3.5 2.5 3.5 5.8"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    download:'<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
    bell:'<path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17z"/><path d="M10 21h4"/>',
    book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M8 7h7"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    x:'<path d="M6 6l12 12M18 6 6 18"/>',
    open:'<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    pen:'<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
    chat:'<path d="M4 5h16v11H9l-5 4V5z"/>',
    home:'<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    wa:'<path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8L4 20z"/>',
  };
  const s = size || 16;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p[n] || ''}</svg>`;
}

/* ---------- Model ---------- */
function tacLevelOf(cls){
  const c = String(cls || '').toLowerCase();
  if(/baby|nursery|pre|lkg|ukg|kg|play/.test(c)) return 'KG';
  const m = c.match(/\d+/);
  if(m){ const n = Number(m[0]); if(n >= 1 && n <= 5) return 'PRI'; if(n >= 6) return 'HIGH'; }
  return 'OTHER';
}
function tacStaffName(st){ return st ? ((st.firstName || '') + ' ' + (st.lastName || '')).trim() || 'Staff' : 'Unassigned'; }
function tacInitials(st){ return ((st.firstName || '?')[0] + ((st.lastName || '')[0] || '')).toUpperCase(); }
function tacDayDiff(a, b){ // whole days b - a for yyyy-mm-dd strings
  if(!a || !b) return 0;
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
}
function tacHasMark(r){ return !!r && (r.absent == 1 || r.absent === true || (r.marks !== null && r.marks !== undefined && r.marks !== '')); }
function tacTeachersForTask(cls, sec, subjName, examSubj){
  const key = String(subjName || '').trim().toLowerCase();
  const master = subjectsList.find(s => s.className === cls && String(s.name || '').trim().toLowerCase() === key && (s.sections || []).includes(sec))
              || subjectsList.find(s => s.className === cls && String(s.name || '').trim().toLowerCase() === key);
  let ids = [];
  if(master) ids = subjectStaffForSection(master, sec) || [];
  if(!ids.length && examSubj){
    ids = Array.isArray(examSubj.staffIds) ? examSubj.staffIds : (examSubj.staffId ? [examSubj.staffId] : []);
  }
  return ids.filter(Boolean);
}
function tacBuildModel(){
  const today = localDateStr(new Date());
  const activeStaff = staffList.filter(st => typeof staffIsActive === 'function' ? staffIsActive(st) : true);
  const staffById = new Map(staffList.map(s => [s.id, s]));
  const secStudents = new Map();
  students.forEach(s => { if(isActive(s)){ const k = classSecKey(s.className, s.section); (secStudents.get(k) || secStudents.set(k, []).get(k)).push(s.id); } });
  const resIdx = new Map();
  examResults.forEach(r => { resIdx.set(r.examId + '|' + r.studentId + '|' + r.subject, r); });

  const tasks = [];
  examDefs.forEach(exam => {
    classLevelsForExamType(exam.examType).forEach(cls => {
      sectionsForClass(cls).forEach(sec => {
        const ids = secStudents.get(classSecKey(cls, sec));
        if(!ids || !ids.length) return;
        getExamSubjects(exam, cls, sec).forEach(subj => {
          let entered = 0, absent = 0, intPending = 0;
          const split = typeof subjInternalMax === 'function' ? subjInternalMax(subj) > 0 : false;
          ids.forEach(id => {
            const r = resIdx.get(exam.id + '|' + id + '|' + subj.name);
            if(tacHasMark(r)){
              if(r.absent == 1 || r.absent === true){ entered++; absent++; }
              else if(split && r.written != null && r.internal == null) intPending++; // internal part still missing
              else entered++;
            }
          });
          const expected = ids.length;
          const due = subj.date || exam.endDate || exam.startDate || '';
          const complete = entered >= expected;
          const upcoming = !complete && entered === 0 && !!due && due > today;
          const status = complete ? 'complete' : upcoming ? 'upcoming' : entered === 0 ? 'notstarted' : 'partial';
          const overdue = (!complete && due && due < today) ? tacDayDiff(due, today) : 0;
          const teacherIds = tacTeachersForTask(cls, sec, subj.name, subj);
          tasks.push({
            key: exam.id + '|' + cls + '|' + sec + '|' + subj.name,
            examId: exam.id, examName: exam.name, cls, sec, level: tacLevelOf(cls),
            subject: subj.name, max: subj.maxMarks, expected, entered, absent, intPending,
            due, status, overdue, dueToday: !complete && due === today,
            teacherIds, unassigned: teacherIds.length === 0,
            pending: !complete && !upcoming,
          });
        });
      });
    });
  });

  // Per-teacher metrics
  const since = new Date(); since.setDate(since.getDate() - tacRange);
  const sinceDate = localDateStr(since);
  const hw = new Map(), subs = new Map(), cons = new Map();
  homeworkItems.forEach(h => { if(h.staffId){ const d = (h.assignedDate || (h.createdAt || '').slice(0, 10) || ''); (hw.get(h.staffId) || hw.set(h.staffId, []).get(h.staffId)).push(d); } });
  inboxSubmissions.forEach(s => { if(s.recipientStaffId) (subs.get(s.recipientStaffId) || subs.set(s.recipientStaffId, []).get(s.recipientStaffId)).push(s); });
  inboxConcerns.forEach(c => { if(c.recipientStaffId) (cons.get(c.recipientStaffId) || cons.set(c.recipientStaffId, []).get(c.recipientStaffId)).push(c); });
  const attToday = new Set();
  attendanceRecords.forEach(a => { if(a.date === today) attToday.add(a.studentId); });
  const staffAttToday = new Map();
  staffAttendanceRecords.forEach(r => { if(r.date === today){ (staffAttToday.get(r.staffId) || staffAttToday.set(r.staffId, []).get(r.staffId)).push(r.status); } });
  const isHoliday = holidays.some(h => h.date === today);

  const byTeacher = new Map();
  tasks.forEach(t => t.teacherIds.forEach(id => (byTeacher.get(id) || byTeacher.set(id, []).get(id)).push(t)));

  const teachers = activeStaff.map(st => {
    const mine = byTeacher.get(st.id) || [];
    const pend = mine.filter(t => t.pending);
    const exp = mine.reduce((a, t) => a + t.expected, 0), ent = mine.reduce((a, t) => a + t.entered, 0);
    const mySubs = subs.get(st.id) || [], myCons = cons.get(st.id) || [];
    const pendSubs = mySubs.filter(s => s.status === 'submitted');
    const openCons = myCons.filter(c => c.status === 'open');
    let homeroom = null;
    if(st.classTeacherClass && st.classTeacherSection){
      const ids = secStudents.get(classSecKey(st.classTeacherClass, st.classTeacherSection)) || [];
      const marked = ids.filter(id => attToday.has(id)).length;
      homeroom = { cls: st.classTeacherClass, sec: st.classTeacherSection, total: ids.length, marked, holiday: isHoliday,
        state: isHoliday ? 'holiday' : !ids.length ? 'empty' : marked >= ids.length ? 'done' : marked === 0 ? 'none' : 'partial', level: tacLevelOf(st.classTeacherClass) };
    }
    const sts = staffAttToday.get(st.id) || [];
    const own = !sts.length ? 'Not Marked' : (sts.includes('Absent') ? 'Absent' : sts.includes('Leave') ? 'Leave' : sts.includes('Late') ? 'Late' : sts[0]);
    const oldestSub = pendSubs.length ? Math.max(...pendSubs.map(s => daysAgo(s.createdAt))) : 0;
    const oldestCon = openCons.length ? Math.max(...openCons.map(c => daysAgo(c.createdAt))) : 0;
    const levels = new Set(mine.map(t => t.level)); if(homeroom) levels.add(homeroom.level);
    return {
      staff: st, id: st.id, name: tacStaffName(st), tasks: mine, pending: pend,
      notStarted: pend.filter(t => t.status === 'notstarted').length,
      overdue: pend.filter(t => t.overdue > 0).length,
      expected: exp, entered: ent, pct: exp ? Math.round(ent / exp * 100) : null,
      hwCount: (hw.get(st.id) || []).filter(d => d >= sinceDate).length,
      pendSubs: pendSubs.length, oldestSub, openCons: openCons.length, oldestCon,
      homeroom, own, levels,
      behind: pend.length > 0,
      worstOverdue: pend.reduce((m, t) => Math.max(m, t.overdue), 0),
    };
  });

  // Homeroom board = every class-section that has students
  const homerooms = [];
  CLASS_LEVELS.forEach(cls => sectionsForClass(cls).forEach(sec => {
    const ids = secStudents.get(classSecKey(cls, sec));
    if(!ids || !ids.length) return;
    const ct = activeStaff.find(s => s.classTeacherClass === cls && s.classTeacherSection === sec);
    const marked = ids.filter(id => attToday.has(id)).length;
    homerooms.push({ cls, sec, level: tacLevelOf(cls), teacher: ct || null, total: ids.length, marked,
      state: isHoliday ? 'holiday' : marked >= ids.length ? 'done' : marked === 0 ? 'none' : 'partial' });
  }));

  return { today, tasks, teachers, homerooms, staffById, isHoliday, built: Date.now() };
}

/* ---------- Filtering helpers ---------- */
function tacTaskVisible(t){
  if(tacLevel !== 'ALL' && t.level !== tacLevel) return false;
  if(tacExamIds.length && !tacExamIds.includes(t.examId)) return false;
  if(tacClassSec && classSecKey(t.cls, t.sec) !== tacClassSec) return false;
  return true;
}
function tacStatusMatch(t, s){
  if(s === 'all') return true;
  if(s === 'pending') return t.pending;
  if(s === 'notstarted') return t.status === 'notstarted';
  if(s === 'partial') return t.status === 'partial';
  if(s === 'overdue') return t.pending && t.overdue > 0;
  if(s === 'unassigned') return t.unassigned && t.status !== 'complete' && t.status !== 'upcoming';
  if(s === 'complete') return t.status === 'complete';
  return true;
}
function tacTeacherNames(t){
  if(!tacModel || !t.teacherIds.length) return 'Unassigned';
  return t.teacherIds.map(id => tacStaffName(tacModel.staffById.get(id))).join(', ');
}
function tacSearchHit(text){ const q = tacSearch.trim().toLowerCase(); return !q || String(text).toLowerCase().includes(q); }

/* ---------- Loading / refreshing ---------- */
function tacRoot(){ return document.getElementById('stfActivityBody'); }
function tacLoadData(){
  return Promise.all([
    loadInboxConcerns(), loadInboxSubmissions(),
    reloadDataset('examResults', loadExamResultsData),
    reloadDataset('attendanceRecords', loadAttendanceRecordsData),
    reloadDataset('staffAttendanceRecords', loadStaffAttendance),
  ]);
}
async function tacRefresh(manual){
  const root = tacRoot();
  if(!root || tacBusy) return;
  tacBusy = true;
  const btn = document.getElementById('tacRefreshBtn'); if(btn) btn.classList.add('spin');
  try{
    await tacLoadData();
    tacModel = tacBuildModel();
    tacLastLoad = Date.now();
    tacRender();
    if(manual) tacAnnounce('Dashboard refreshed.');
  }catch(e){
    console.error('teacher activity refresh failed', e);
    const st = document.getElementById('tacStatusLine'); if(st) st.textContent = 'Refresh failed — will retry';
  }finally{
    tacBusy = false;
    const b = document.getElementById('tacRefreshBtn'); if(b) b.classList.remove('spin');
  }
}
function tacAnnounce(msg){ const el = document.getElementById('tacLive'); if(el){ el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); } }
function tacTick(){
  const root = tacRoot();
  const wrap = document.getElementById('stfActivityWrap');
  if(!root || !document.body.contains(root) || !wrap || wrap.style.display === 'none'){ clearInterval(tacTimer); tacTimer = null; return; }
  if(document.hidden) return;
  const secs = Math.floor((Date.now() - tacLastLoad) / 1000);
  const ago = document.getElementById('tacAgo');
  if(ago) ago.textContent = tacAuto ? ('Refreshing in ' + Math.max(0, TAC_REFRESH_SECS - secs) + 's') : ('Updated ' + secs + 's ago · auto-refresh off');
  if(tacAuto && secs >= TAC_REFRESH_SECS) tacRefresh(false);
}
function renderStaffActivityTab(body){
  if(!body) return;
  tacInjectStyle();
  body.innerHTML = `<div class="tac"><div class="tac-skel"><div></div><div></div><div></div><div></div></div></div>`;
  tacBusy = false;
  tacRefresh(false);
  if(tacTimer) clearInterval(tacTimer);
  tacTimer = setInterval(tacTick, 1000);
}
function refreshStaffActivityTab(){ tacRefresh(true); }
function renderStaffActivityBody(){ if(tacModel) tacRender(); }
function tacToggleAuto(){ tacAuto = !tacAuto; tacRender(); tacAnnounce('Auto refresh ' + (tacAuto ? 'on' : 'off')); }

/* ---------- Controls ---------- */
function tacSetLevel(l){ tacLevel = l; tacClassSec = ''; tacShown = 40; tacRender(); }
function tacToggleExam(id){
  if(id === '') tacExamIds = [];
  else tacExamIds = tacExamIds.includes(id) ? tacExamIds.filter(x => x !== id) : tacExamIds.concat(id);
  tacShown = 40; tacRender();
}
function tacSetTab(t){ tacTab = t; tacRender(); }
function tacSetStatus(s){ tacStatus = s; tacShown = 40; tacRender(); }
function tacSetTFilter(f){ tacTFilter = f; tacRender(); }
function tacSetRange(v){ tacRange = Number(v) || 7; tacModel = tacBuildModel(); tacRender(); }
function tacSearchInput(v){
  tacSearch = v; tacShown = 40;
  const pos = v.length; tacRender();
  const el = document.getElementById('tacSearch'); if(el){ el.focus(); try{ el.setSelectionRange(pos, pos); }catch(_){} }
}
function tacPickClassSec(cls, sec){
  const k = classSecKey(cls, sec);
  tacClassSec = tacClassSec === k ? '' : k; tacTab = 'marks'; tacStatus = 'all'; tacShown = 40; tacRender();
  if(tacClassSec){ const el = document.getElementById('tacSheets'); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
function tacClearClassSec(){ tacClassSec = ''; tacRender(); }
function tacMore(){ tacShown += 60; tacRender(); }
function tacKpi(kind){
  if(kind === 'completion'){ tacTab = 'marks'; tacStatus = 'all'; }
  else if(kind === 'pending'){ tacTab = 'marks'; tacStatus = 'pending'; }
  else if(kind === 'notstarted'){ tacTab = 'marks'; tacStatus = 'notstarted'; }
  else if(kind === 'behind'){ tacTab = 'teachers'; tacTFilter = 'behind'; }
  else if(kind === 'unassigned'){ tacTab = 'marks'; tacStatus = 'unassigned'; }
  else if(kind === 'homeroom'){ tacTab = 'homeroom'; }
  else if(kind === 'absent'){ tacTab = 'teachers'; tacTFilter = 'absent'; }
  else if(kind === 'inbox'){ tacTab = 'inbox'; }
  tacShown = 40; tacRender();
  const el = document.getElementById('tacMain'); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Actions ---------- */
function tacOpenSheet(examId, cls, sec){
  if(typeof flushMarksAutoSaveIfPending === 'function') try{ flushMarksAutoSaveIfPending(); }catch(_){}
  tacCloseDrawer();
  switchView('exams');
  examCurrentExamId = examId; examCurrentClass = cls; examCurrentSection = sec;
  switchExamTab('marks');
  examMarksView = 'sheet';
  renderExamBody();
}
function tacReminderText(tm){
  const items = tm.pending.slice().sort((a, b) => b.overdue - a.overdue).map(t => `${t.cls} ${t.sec} – ${t.subject} (${t.examName}, ${t.entered}/${t.expected})`);
  let body = `Marks entry pending for ${items.length} sheet${items.length === 1 ? '' : 's'}: ` + items.join('; ');
  if(body.length > 380) body = body.slice(0, 377) + '…';
  return body + '. Please complete it today.';
}
async function tacSendBroadcast(staffId, title, body){
  const r = await fetch('/api/notifications/broadcast', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, actorHeaders()),
    body: JSON.stringify({ title, body, type: 'reminder', url: '/?view=exams', staffIds: [staffId], push: true }),
  });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function tacRemind(staffId){
  const tm = tacModel && tacModel.teachers.find(t => t.id === staffId);
  if(!tm || !tm.pending.length) return;
  if(!tm.staff.linkedUserId){ showToast(tm.name + ' has no app login linked — use the WhatsApp button instead.'); return; }
  const ok = await showConfirmDialog(`Send an in-app + push reminder to ${tm.name} about ${tm.pending.length} pending marks sheet(s)?`, { title: 'Send reminder', okText: 'Send reminder' });
  if(!ok) return;
  try{
    const res = await tacSendBroadcast(staffId, 'Marks entry pending', tacReminderText(tm));
    showToast(res && res.notified ? `Reminder sent to ${tm.name}.` : `${tm.name} could not be notified (no active login).`);
  }catch(e){ showToast('Could not send the reminder. Check your connection and try again.'); }
}
async function tacRemindAll(){
  if(!tacModel) return;
  const list = tacVisibleTeachers().filter(t => t.pending.length);
  if(!list.length){ showToast('No teachers with pending marks in this view.'); return; }
  const withLogin = list.filter(t => t.staff.linkedUserId);
  const ok = await showConfirmDialog(`Send a reminder to ${withLogin.length} teacher(s) with pending marks sheets?` + (list.length > withLogin.length ? ` (${list.length - withLogin.length} have no app login and will be skipped.)` : ''), { title: 'Remind all', okText: 'Send reminders' });
  if(!ok) return;
  let sent = 0, failed = 0;
  for(const t of withLogin){
    try{ const res = await tacSendBroadcast(t.id, 'Marks entry pending', tacReminderText(t)); if(res && res.notified) sent++; else failed++; }catch(_){ failed++; }
  }
  showToast(`Reminders sent to ${sent} teacher(s)` + (failed ? `, ${failed} could not be delivered.` : '.'));
}
function tacWhatsApp(staffId){
  const tm = tacModel && tacModel.teachers.find(t => t.id === staffId);
  if(!tm) return;
  let ph = String(tm.staff.phone || '').replace(/\D/g, '');
  if(!ph){ showToast(tm.name + ' has no phone number on file.'); return; }
  if(ph.length === 10) ph = '91' + ph;
  const msg = `Hello ${tm.staff.firstName || ''}, ` + tacReminderText(tm);
  window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
}
function tacExportCsv(){
  if(!tacModel) return;
  const rows = tacModel.tasks.filter(t => tacTaskVisible(t) && tacStatusMatch(t, tacStatus));
  const q = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
  const head = ['Level','Class','Section','Subject','Exam','Teacher','Entered','Expected','Absent','Status','Due date','Days overdue'];
  const lines = [head.map(q).join(',')].concat(rows.map(t => [TAC_LEVEL_NAME[t.level], t.cls, t.sec, t.subject, t.examName, tacTeacherNames(t), t.entered, t.expected, t.absent, t.status, t.due, t.overdue].map(q).join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'marks-entry-' + tacModel.today + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  showToast(`Exported ${rows.length} sheet(s).`);
}

/* ---------- Drawer ---------- */
function tacOpenDrawer(staffId, ev){
  tacDrawerStaff = staffId; tacDrawerOpener = ev && ev.currentTarget ? ev.currentTarget : document.activeElement;
  tacRender();
  setTimeout(() => { const c = document.getElementById('tacDrawerClose'); if(c) c.focus(); }, 30);
}
function tacCloseDrawer(){
  if(!tacDrawerStaff) return;
  tacDrawerStaff = ''; tacRender();
  if(tacDrawerOpener && document.body.contains(tacDrawerOpener)) tacDrawerOpener.focus();
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && tacDrawerStaff) tacCloseDrawer(); });

/* ---------- Rendering ---------- */
function tacVisibleTeachers(){
  const m = tacModel; if(!m) return [];
  return m.teachers.filter(t => {
    if(tacLevel !== 'ALL' && !t.levels.has(tacLevel)) return false;
    if(!tacSearchHit(t.name + ' ' + (t.staff.designation || '') + ' ' + (t.staff.department || ''))) return false;
    // "pending" for a teacher respects exam + level filters
    return true;
  }).map(t => {
    const mine = t.tasks.filter(tacTaskVisible);
    const pend = mine.filter(x => x.pending);
    const exp = mine.reduce((a, x) => a + x.expected, 0), ent = mine.reduce((a, x) => a + x.entered, 0);
    return Object.assign({}, t, { tasks: mine, pending: pend, pct: exp ? Math.round(ent / exp * 100) : null, expected: exp, entered: ent,
      notStarted: pend.filter(x => x.status === 'notstarted').length, overdue: pend.filter(x => x.overdue > 0).length,
      worstOverdue: pend.reduce((a, x) => Math.max(a, x.overdue), 0), behind: pend.length > 0 });
  });
}
function tacTone(pct){ return pct == null ? 'mute' : pct >= 100 ? 'ok' : pct >= 60 ? 'warn' : 'bad'; }
function tacBar(pct, tone){
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<span class="tac-bar tac-${tone || tacTone(pct)}" role="img" aria-label="${p}% complete"><i style="width:${p}%"></i></span>`;
}
function tacPill(kind, text, icon){ return `<span class="tac-pill tac-p-${kind}">${icon ? tacIcon(icon, 12) : ''}${tacEsc(text)}</span>`; }
function tacStatusPill(t){
  if(t.status === 'complete') return tacPill('ok', 'Complete', 'check');
  if(t.status === 'upcoming') return tacPill('mute', 'Upcoming', 'cal');
  if(t.overdue > 0) return tacPill('bad', (t.status === 'notstarted' ? 'Not started' : 'Partial') + ' · ' + t.overdue + 'd overdue', 'alert');
  if(t.dueToday) return tacPill('warn', (t.status === 'notstarted' ? 'Not started' : 'Partial') + ' · due today', 'clock');
  return tacPill(t.status === 'notstarted' ? 'bad' : 'warn', t.status === 'notstarted' ? 'Not started' : 'Partial', t.status === 'notstarted' ? 'alert' : 'clock');
}
function tacAvatar(st, size){
  const s = size || 38;
  if(st.photo) return `<img class="tac-av" style="width:${s}px;height:${s}px" src="${tacEsc(st.photo)}" alt="">`;
  const hue = (String(st.id || st.firstName || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360;
  return `<span class="tac-av" aria-hidden="true" style="width:${s}px;height:${s}px;background:hsl(${hue} 55% 40%);font-size:${Math.round(s * .38)}px">${tacEsc(tacInitials(st))}</span>`;
}
function tacKpiTile(kind, icon, label, value, sub, tone){
  return `<button type="button" class="tac-kpi tac-t-${tone}" onclick="tacKpi('${kind}')" aria-label="${tacEsc(label)}: ${tacEsc(value)}. ${tacEsc(sub)}. Open details">
    <span class="tac-kpi-ic">${tacIcon(icon, 20)}</span>
    <span class="tac-kpi-v">${tacEsc(value)}</span>
    <span class="tac-kpi-l">${tacEsc(label)}</span>
    <span class="tac-kpi-s">${tacEsc(sub)}</span>
  </button>`;
}
function tacRender(){
  const root = tacRoot(); if(!root || !tacModel) return;
  const m = tacModel;
  const keepScroll = window.scrollY;
  const tasks = m.tasks.filter(tacTaskVisible);
  const levelTasks = m.tasks.filter(t => (tacLevel === 'ALL' || t.level === tacLevel) && (!tacExamIds.length || tacExamIds.includes(t.examId)));
  const pend = levelTasks.filter(t => t.pending);
  const expected = levelTasks.reduce((a, t) => a + (t.status === 'upcoming' ? 0 : t.expected), 0);
  const entered = levelTasks.reduce((a, t) => a + (t.status === 'upcoming' ? 0 : t.entered), 0);
  const pct = expected ? Math.round(entered / expected * 100) : 100;
  const teachers = tacVisibleTeachers();
  const behind = teachers.filter(t => t.behind);
  const unassigned = levelTasks.filter(t => t.unassigned && t.status !== 'complete' && t.status !== 'upcoming');
  const hrs = m.homerooms.filter(h => tacLevel === 'ALL' || h.level === tacLevel);
  const hrBad = hrs.filter(h => h.state === 'none' || h.state === 'partial');
  const absentStaff = m.teachers.filter(t => (t.own === 'Absent' || t.own === 'Not Marked') && !m.isHoliday && (tacLevel === 'ALL' || t.levels.has(tacLevel)));
  const absentCnt = m.teachers.filter(t => t.own === 'Absent' && (tacLevel === 'ALL' || t.levels.has(tacLevel))).length;
  const inboxCnt = m.teachers.reduce((a, t) => a + t.pendSubs + t.openCons, 0);
  const now = new Date();
  const dateLine = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const examChips = `<button type="button" class="tac-chip ${tacExamIds.length ? '' : 'on'}" aria-pressed="${!tacExamIds.length}" onclick="tacToggleExam('')">All exams</button>` +
    examDefs.map(e => `<button type="button" class="tac-chip ${tacExamIds.includes(e.id) ? 'on' : ''}" aria-pressed="${tacExamIds.includes(e.id)}" onclick="tacToggleExam('${tacJs(e.id)}')">${tacEsc(e.name)}</button>`).join('');
  const levelCount = l => m.tasks.filter(t => t.pending && (l === 'ALL' || t.level === l) && (!tacExamIds.length || tacExamIds.includes(t.examId))).length;
  const levelSeg = TAC_LEVELS.map(([k, n]) => `<button type="button" role="radio" aria-checked="${tacLevel === k}" class="tac-seg-b ${tacLevel === k ? 'on' : ''}" onclick="tacSetLevel('${k}')">${n}<em>${levelCount(k)}</em></button>`).join('');

  const tabs = [['marks', 'Marks entry', 'pen', pend.length], ['teachers', 'Teachers', 'users', behind.length], ['homeroom', 'Homeroom attendance', 'home', hrBad.length], ['inbox', 'Homework & inbox', 'chat', inboxCnt]]
    .map(([k, n, ic, c]) => `<button type="button" role="tab" id="tacTab-${k}" aria-selected="${tacTab === k}" aria-controls="tacMain" class="tac-tab ${tacTab === k ? 'on' : ''}" onclick="tacSetTab('${k}')">${tacIcon(ic, 16)}<span>${n}</span>${c ? `<em>${c}</em>` : ''}</button>`).join('');

  let main = '';
  if(tacTab === 'marks') main = tacMarksHtml(levelTasks, tasks, teachers, unassigned);
  else if(tacTab === 'teachers') main = tacTeachersHtml(teachers);
  else if(tacTab === 'homeroom') main = tacHomeroomHtml(hrs);
  else main = tacInboxHtml(teachers);

  const noExams = !examDefs.length;
  root.innerHTML = `<div class="tac">
    <div id="tacLive" class="tac-sr" aria-live="polite"></div>
    <section class="tac-hero" aria-label="Teacher activity overview">
      <div class="tac-hero-l">
        <div class="tac-live"><span class="tac-dot"></span>LIVE</div>
        <h2>Teacher Activity Command Center</h2>
        <p>${tacEsc(dateLine)} · every exam, every class — who has entered marks and who hasn't.</p>
        <div class="tac-hero-meta"><span id="tacStatusLine">${tacEsc('Updated ' + new Date(tacLastLoad).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</span><span class="tac-sep">•</span><span id="tacAgo">${tacAuto ? 'Refreshing in ' + TAC_REFRESH_SECS + 's' : 'Auto-refresh off'}</span></div>
      </div>
      <div class="tac-hero-r">
        <div class="tac-hero-ring" role="img" aria-label="Overall marks entry ${pct} percent complete">${tacRing(pct)}<span>Marks entry<br>complete</span></div>
        <div class="tac-hero-btns">
          <button type="button" id="tacRefreshBtn" class="tac-btn tac-btn-light" onclick="tacRefresh(true)">${tacIcon('refresh', 16)}Refresh now</button>
          <button type="button" class="tac-btn tac-btn-ghost" aria-pressed="${tacAuto}" onclick="tacToggleAuto()">${tacIcon('clock', 16)}Auto ${tacAuto ? 'on' : 'off'}</button>
          <button type="button" class="tac-btn tac-btn-ghost" onclick="tacExportCsv()">${tacIcon('download', 16)}Export CSV</button>
        </div>
      </div>
    </section>

    <section class="tac-filters" aria-label="Filters">
      <div class="tac-seg" role="radiogroup" aria-label="School level">${levelSeg}</div>
      <label class="tac-search">${tacIcon('search', 16)}<span class="tac-sr">Search teachers</span><input id="tacSearch" type="search" placeholder="Search teacher, subject, class…" value="${tacEsc(tacSearch)}" oninput="tacSearchInput(this.value)"></label>
      <div class="tac-chips" role="group" aria-label="Exams">${examChips}</div>
    </section>

    ${noExams ? `<div class="tac-empty">${tacIcon('book', 28)}<b>No exams created yet</b>Create an exam under Exams → Exams and its marks sheets will appear here.</div>` : `
    <section class="tac-kpis" aria-label="Key numbers">
      ${tacKpiTile('completion', 'target', 'Marks entered', pct + '%', `${entered.toLocaleString('en-IN')} of ${expected.toLocaleString('en-IN')} marks`, tacTone(pct))}
      ${tacKpiTile('pending', 'pen', 'Sheets pending', String(pend.length), `${levelTasks.filter(t => t.status === 'complete').length} complete · ${levelTasks.filter(t => t.status === 'upcoming').length} upcoming`, pend.length ? 'warn' : 'ok')}
      ${tacKpiTile('notstarted', 'alert', 'Not started', String(pend.filter(t => t.status === 'notstarted').length), `${pend.filter(t => t.overdue > 0).length} past due date`, pend.some(t => t.status === 'notstarted') ? 'bad' : 'ok')}
      ${tacKpiTile('behind', 'users', 'Teachers behind', String(behind.length), `of ${teachers.filter(t => t.tasks.length).length} with sheets`, behind.length ? 'bad' : 'ok')}
      ${tacKpiTile('unassigned', 'user', 'No teacher assigned', String(unassigned.length), 'subjects need an owner', unassigned.length ? 'warn' : 'ok')}
      ${tacKpiTile('homeroom', 'home', 'Homerooms unmarked', m.isHoliday ? 'Holiday' : String(hrBad.length), m.isHoliday ? 'no attendance today' : `of ${hrs.length} classes today`, m.isHoliday ? 'mute' : hrBad.length ? 'warn' : 'ok')}
      ${tacKpiTile('absent', 'cal', 'Staff absent / unmarked', m.isHoliday ? '—' : String(absentStaff.length), `${absentCnt} marked absent today`, absentCnt ? 'bad' : 'mute')}
      ${tacKpiTile('inbox', 'chat', 'Inbox waiting', String(inboxCnt), 'submissions + concerns', inboxCnt ? 'warn' : 'ok')}
    </section>

    <nav class="tac-tabs" role="tablist" aria-label="Dashboard sections">${tabs}</nav>
    <div id="tacMain" role="tabpanel" aria-labelledby="tacTab-${tacTab}" tabindex="-1">${main}</div>`}
    ${tacDrawerStaff ? tacDrawerHtml() : ''}
  </div>`;
  window.scrollTo(0, keepScroll);
}
function tacRing(pct){
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<svg width="86" height="86" viewBox="0 0 86 86" aria-hidden="true"><circle cx="43" cy="43" r="${r}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="8"/><circle cx="43" cy="43" r="${r}" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 43 43)"/><text x="43" y="48" text-anchor="middle" font-size="18" font-weight="800" fill="#fff">${pct}%</text></svg>`;
}

/* ----- Marks entry tab ----- */
function tacMarksHtml(levelTasks, tasks, teachers, unassigned){
  const m = tacModel;
  // Who hasn't entered
  const behind = teachers.filter(t => t.behind).sort((a, b) => (b.worstOverdue - a.worstOverdue) || (b.notStarted - a.notStarted) || (b.pending.length - a.pending.length));
  const teacherCards = behind.length ? behind.slice(0, 12).map(t => `
    <div class="tac-card">
      <div class="tac-card-h">${tacAvatar(t.staff, 40)}<div class="tac-card-t"><b>${tacEsc(t.name)}</b><small>${tacEsc(t.staff.designation || t.staff.department || 'Teacher')}</small></div>
        <span class="tac-count tac-${t.overdue ? 'bad' : 'warn'}" title="Sheets pending">${t.pending.length}</span></div>
      <div class="tac-card-p">${tacBar(t.pct)}<span>${t.pct == null ? '—' : t.pct + '%'} entered</span></div>
      <div class="tac-tags">${t.pending.slice().sort((a, b) => b.overdue - a.overdue).slice(0, 4).map(x => `<button type="button" class="tac-tag tac-tag-${x.overdue ? 'bad' : x.status === 'notstarted' ? 'bad' : 'warn'}" onclick="tacOpenSheet('${tacJs(x.examId)}','${tacJs(x.cls)}','${tacJs(x.sec)}')" aria-label="Open ${tacEsc(x.subject)} ${tacEsc(x.cls)} ${tacEsc(x.sec)} marks sheet">${tacEsc(x.subject)} · ${tacEsc(x.cls.replace(' Class', ''))}${tacEsc(x.sec)}</button>`).join('')}${t.pending.length > 4 ? `<button type="button" class="tac-tag" onclick="tacOpenDrawer('${tacJs(t.id)}',event)">+${t.pending.length - 4} more</button>` : ''}</div>
      <div class="tac-card-a"><button type="button" class="tac-btn tac-btn-sm" onclick="tacOpenDrawer('${tacJs(t.id)}',event)">${tacIcon('open', 14)}Details</button><button type="button" class="tac-btn tac-btn-sm tac-btn-pri" onclick="tacRemind('${tacJs(t.id)}')">${tacIcon('bell', 14)}Remind</button></div>
    </div>`).join('') : `<div class="tac-empty tac-good">${tacIcon('check', 28)}<b>Everyone is up to date</b>No pending marks sheets for the current filters.</div>`;

  // Level + exam progress
  const lv = ['KG', 'PRI', 'HIGH'].map(l => {
    const ts = m.tasks.filter(t => t.level === l && t.status !== 'upcoming' && (!tacExamIds.length || tacExamIds.includes(t.examId)));
    if(!ts.length) return '';
    const e = ts.reduce((a, t) => a + t.entered, 0), x = ts.reduce((a, t) => a + t.expected, 0), p = x ? Math.round(e / x * 100) : 0;
    return `<button type="button" class="tac-prog" onclick="tacSetLevel('${l}')" aria-label="${TAC_LEVEL_NAME[l]} ${p}% complete, ${ts.filter(t => t.pending).length} sheets pending. Filter to ${TAC_LEVEL_NAME[l]}"><span><b>${TAC_LEVEL_NAME[l]}</b><small>${ts.filter(t => t.pending).length} pending</small></span>${tacBar(p)}<strong>${p}%</strong></button>`;
  }).join('');
  const ex = examDefs.map(e => {
    const ts = m.tasks.filter(t => t.examId === e.id && t.status !== 'upcoming' && (tacLevel === 'ALL' || t.level === tacLevel));
    if(!ts.length) return '';
    const en = ts.reduce((a, t) => a + t.entered, 0), x = ts.reduce((a, t) => a + t.expected, 0), p = x ? Math.round(en / x * 100) : 0;
    return `<button type="button" class="tac-prog" onclick="tacToggleExam('${tacJs(e.id)}')" aria-label="${tacEsc(e.name)} ${p}% complete. Filter to this exam"><span><b>${tacEsc(e.name)}</b><small>${ts.filter(t => t.pending).length} pending</small></span>${tacBar(p)}<strong>${p}%</strong></button>`;
  }).join('') || `<div class="tac-note">No exam has started yet.</div>`;

  // Heatmap
  const classes = CLASS_LEVELS.filter(c => (tacLevel === 'ALL' || tacLevelOf(c) === tacLevel) && levelTasks.some(t => t.cls === c));
  const secs = [...new Set(levelTasks.map(t => t.sec))].sort();
  const cell = (cls, sec) => {
    const ts = levelTasks.filter(t => t.cls === cls && t.sec === sec && t.status !== 'upcoming');
    if(!ts.length) return `<td><span class="tac-hm tac-hm-none" aria-label="${tacEsc(cls)} ${tacEsc(sec)}: no sheets due">–</span></td>`;
    const e = ts.reduce((a, t) => a + t.entered, 0), x = ts.reduce((a, t) => a + t.expected, 0), p = x ? Math.round(e / x * 100) : 0;
    const pc = ts.filter(t => t.pending).length;
    const on = tacClassSec === classSecKey(cls, sec);
    return `<td><button type="button" class="tac-hm tac-hm-${tacTone(p)} ${on ? 'on' : ''}" aria-pressed="${on}" aria-label="${tacEsc(cls)} ${tacEsc(sec)}: ${p}% entered, ${pc} sheets pending. Show these sheets" onclick="tacPickClassSec('${tacJs(cls)}','${tacJs(sec)}')">${p}%<small>${pc ? pc + ' due' : '✓'}</small></button></td>`;
  };
  const heat = `<div class="tac-scroll"><table class="tac-heat"><thead><tr><th scope="col">Class</th>${secs.map(s => `<th scope="col">${tacEsc(s)}</th>`).join('')}</tr></thead><tbody>${classes.map(c => `<tr><th scope="row">${tacEsc(c)}</th>${secs.map(s => sectionsForClass(c).includes(s) ? cell(c, s) : '<td></td>').join('')}</tr>`).join('')}</tbody></table></div>
    <div class="tac-legend"><span><i class="tac-ok"></i>100%</span><span><i class="tac-warn"></i>60–99%</span><span><i class="tac-bad"></i>under 60%</span><span><i class="tac-mute"></i>nothing due</span></div>`;

  // Table
  const sv = (s) => levelTasks.filter(t => (!tacClassSec || classSecKey(t.cls, t.sec) === tacClassSec) && tacStatusMatch(t, s)).length;
  const segs = [['pending', 'All pending'], ['notstarted', 'Not started'], ['partial', 'Partial'], ['overdue', 'Overdue'], ['unassigned', 'No teacher'], ['complete', 'Complete'], ['all', 'Everything']]
    .map(([k, n]) => `<button type="button" class="tac-chip ${tacStatus === k ? 'on' : ''}" aria-pressed="${tacStatus === k}" onclick="tacSetStatus('${k}')">${n}<em>${sv(k)}</em></button>`).join('');
  let rows = tasks.filter(t => tacStatusMatch(t, tacStatus) && tacSearchHit(t.subject + ' ' + t.cls + ' ' + t.sec + ' ' + tacTeacherNames(t) + ' ' + t.examName));
  const order = { notstarted: 0, partial: 1, upcoming: 2, complete: 3 };
  rows.sort((a, b) => (b.overdue - a.overdue) || (order[a.status] - order[b.status]) || a.cls.localeCompare(b.cls, undefined, { numeric: true }) || a.sec.localeCompare(b.sec) || a.subject.localeCompare(b.subject));
  const shown = rows.slice(0, tacShown);
  const tbl = rows.length ? `<div class="tac-scroll"><table class="tac-table"><thead><tr><th scope="col">Class</th><th scope="col">Subject</th><th scope="col">Exam</th><th scope="col">Teacher</th><th scope="col">Progress</th><th scope="col">Status</th><th scope="col"><span class="tac-sr">Actions</span></th></tr></thead><tbody>
    ${shown.map(t => `<tr>
      <td data-l="Class"><b>${tacEsc(t.cls)}</b> ${tacEsc(t.sec)}<small>${TAC_LEVEL_NAME[t.level]}</small></td>
      <td data-l="Subject">${tacEsc(t.subject)}${t.intPending ? `<small class="tac-warn-t">${t.intPending} internal pending</small>` : `<small>out of ${tacEsc(t.max)}</small>`}</td>
      <td data-l="Exam">${tacEsc(t.examName)}<small>${t.due ? 'due ' + tacEsc(t.due) : ''}</small></td>
      <td data-l="Teacher">${t.unassigned ? tacPill('warn', 'No teacher assigned', 'user') : t.teacherIds.map(id => { const st = m.staffById.get(id); return st ? `<button type="button" class="tac-link" onclick="tacOpenDrawer('${tacJs(id)}',event)">${tacEsc(tacStaffName(st))}</button>` : ''; }).join(', ')}</td>
      <td data-l="Progress"><div class="tac-prow">${tacBar(t.expected ? Math.round(t.entered / t.expected * 100) : 0, t.status === 'complete' ? 'ok' : t.status === 'notstarted' ? 'bad' : 'warn')}<span>${t.entered}/${t.expected}${t.absent ? ` <small>(${t.absent} abs)</small>` : ''}</span></div></td>
      <td data-l="Status">${tacStatusPill(t)}</td>
      <td class="tac-act"><button type="button" class="tac-btn tac-btn-sm" onclick="tacOpenSheet('${tacJs(t.examId)}','${tacJs(t.cls)}','${tacJs(t.sec)}')" aria-label="Open ${tacEsc(t.subject)} sheet for ${tacEsc(t.cls)} ${tacEsc(t.sec)}">${tacIcon('open', 14)}Open sheet</button>${t.pending && t.teacherIds.length ? t.teacherIds.slice(0, 1).map(id => `<button type="button" class="tac-btn tac-btn-sm tac-btn-pri" onclick="tacRemind('${tacJs(id)}')" aria-label="Remind ${tacEsc(tacTeacherNames(t))}">${tacIcon('bell', 14)}Remind</button>`).join('') : ''}</td>
    </tr>`).join('')}</tbody></table></div>
    ${rows.length > shown.length ? `<div class="tac-more"><button type="button" class="tac-btn" onclick="tacMore()">Show ${Math.min(60, rows.length - shown.length)} more <small>(${rows.length - shown.length} hidden)</small></button></div>` : ''}`
    : `<div class="tac-empty tac-good">${tacIcon('check', 28)}<b>Nothing here</b>No sheets match these filters.</div>`;

  const clsFilter = tacClassSec ? `<div class="tac-active-f">Showing <b>${tacEsc(tacClassSec.replace('||', ' '))}</b> only <button type="button" class="tac-btn tac-btn-sm" onclick="tacClearClassSec()">${tacIcon('x', 12)}Clear</button></div>` : '';
  const alertUn = unassigned.length ? `<div class="tac-alert" role="status">${tacIcon('alert', 18)}<div><b>${unassigned.length} subject sheet${unassigned.length === 1 ? ' has' : 's have'} no teacher assigned</b><span>Nobody is being asked to enter these marks. Assign a teacher under Subjects.</span></div><button type="button" class="tac-btn tac-btn-sm" onclick="tacSetStatus('unassigned')">Show them</button></div>` : '';

  return `${alertUn}
  <div class="tac-grid2">
    <div class="tac-panel"><div class="tac-panel-h"><h3>Who hasn't entered marks</h3>${behind.length ? `<button type="button" class="tac-btn tac-btn-sm tac-btn-pri" onclick="tacRemindAll()">${tacIcon('bell', 14)}Remind all (${behind.length})</button>` : ''}</div>
      <div class="tac-cards">${teacherCards}</div>
      ${behind.length > 12 ? `<div class="tac-more"><button type="button" class="tac-btn" onclick="tacSetTab('teachers');tacSetTFilter('behind')">See all ${behind.length} teachers</button></div>` : ''}</div>
    <div class="tac-side">
      <div class="tac-panel"><div class="tac-panel-h"><h3>By level</h3></div><div class="tac-progs">${lv || '<div class="tac-note">No data yet.</div>'}</div></div>
      <div class="tac-panel"><div class="tac-panel-h"><h3>By exam</h3></div><div class="tac-progs">${ex}</div></div>
    </div>
  </div>
  <div class="tac-panel"><div class="tac-panel-h"><h3>Class &amp; section heatmap</h3><small>Tap a cell to see just that class</small></div>${heat}</div>
  <div class="tac-panel" id="tacSheets"><div class="tac-panel-h"><h3>Marks sheets <small>${rows.length} shown</small></h3></div>
    <div class="tac-chips" role="group" aria-label="Sheet status">${segs}</div>${clsFilter}${tbl}</div>`;
}

/* ----- Teachers tab ----- */
function tacTeachersHtml(teachers){
  const flt = {
    all: t => true, behind: t => t.behind, clear: t => t.tasks.length && !t.behind,
    absent: t => t.own === 'Absent' || t.own === 'Leave' || (t.own === 'Not Marked' && !tacModel.isHoliday),
    homeroom: t => t.homeroom && (t.homeroom.state === 'none' || t.homeroom.state === 'partial'),
    inbox: t => t.pendSubs + t.openCons > 0,
  };
  const cnt = k => teachers.filter(flt[k]).length;
  const chips = [['all', 'All teachers'], ['behind', 'Marks behind'], ['clear', 'Up to date'], ['absent', 'Absent / unmarked today'], ['homeroom', 'Homeroom unmarked'], ['inbox', 'Inbox waiting']]
    .map(([k, n]) => `<button type="button" class="tac-chip ${tacTFilter === k ? 'on' : ''}" aria-pressed="${tacTFilter === k}" onclick="tacSetTFilter('${k}')">${n}<em>${cnt(k)}</em></button>`).join('');
  const list = teachers.filter(flt[tacTFilter]).sort((a, b) => (b.pending.length - a.pending.length) || (b.worstOverdue - a.worstOverdue) || a.name.localeCompare(b.name));
  const attTone = { Present: 'ok', Late: 'warn', Leave: 'warn', Absent: 'bad', 'Not Marked': 'mute' };
  const cards = list.map(t => `
    <article class="tac-tcard ${t.behind ? 'is-behind' : ''}">
      <div class="tac-card-h">${tacAvatar(t.staff, 44)}<div class="tac-card-t"><b>${tacEsc(t.name)}</b><small>${tacEsc(t.staff.designation || t.staff.department || 'Staff')}</small></div>${tacPill(attTone[t.own] || 'mute', t.own === 'Not Marked' ? 'Att. not marked' : t.own)}</div>
      <div class="tac-tmeta">
        <div><span>Marks</span>${t.tasks.length ? `<b>${t.pending.length ? t.pending.length + ' pending' : 'All done'}</b>${tacBar(t.pct)}` : '<b class="tac-mute-t">No sheets</b>'}</div>
        <div><span>Homeroom</span>${t.homeroom ? `<b>${tacEsc(t.homeroom.cls.replace(' Class', ''))}${tacEsc(t.homeroom.sec)}</b><small>${{ done: 'Attendance done', none: 'Not marked', partial: t.homeroom.marked + '/' + t.homeroom.total + ' marked', holiday: 'Holiday', empty: 'No students' }[t.homeroom.state]}</small>` : '<b class="tac-mute-t">—</b>'}</div>
        <div><span>Homework ${tacRange}d</span><b>${t.hwCount}</b></div>
        <div><span>Inbox</span><b>${t.pendSubs + t.openCons}</b><small>${t.pendSubs} subm · ${t.openCons} concerns</small></div>
      </div>
      <div class="tac-card-a"><button type="button" class="tac-btn tac-btn-sm" onclick="tacOpenDrawer('${tacJs(t.id)}',event)">${tacIcon('open', 14)}Full detail</button>${t.pending.length ? `<button type="button" class="tac-btn tac-btn-sm tac-btn-pri" onclick="tacRemind('${tacJs(t.id)}')">${tacIcon('bell', 14)}Remind</button>` : ''}</div>
    </article>`).join('');
  return `<div class="tac-chips" role="group" aria-label="Teacher filter">${chips}</div>
    ${list.length ? `<div class="tac-tgrid">${cards}</div>` : `<div class="tac-empty">${tacIcon('users', 28)}<b>No teachers match</b>Try another filter or clear the search.</div>`}`;
}

/* ----- Homeroom tab ----- */
function tacHomeroomHtml(hrs){
  const m = tacModel;
  const done = hrs.filter(h => h.state === 'done').length;
  const list = hrs.slice().sort((a, b) => ({ none: 0, partial: 1, done: 2, holiday: 3 }[a.state] - { none: 0, partial: 1, done: 2, holiday: 3 }[b.state]));
  const rows = list.filter(h => tacSearchHit(h.cls + ' ' + h.sec + ' ' + (h.teacher ? tacStaffName(h.teacher) : ''))).map(h => `<tr>
    <td data-l="Class"><b>${tacEsc(h.cls)}</b> ${tacEsc(h.sec)}<small>${TAC_LEVEL_NAME[h.level]}</small></td>
    <td data-l="Class teacher">${h.teacher ? `<button type="button" class="tac-link" onclick="tacOpenDrawer('${tacJs(h.teacher.id)}',event)">${tacEsc(tacStaffName(h.teacher))}</button>` : tacPill('warn', 'No class teacher', 'user')}</td>
    <td data-l="Marked"><div class="tac-prow">${tacBar(h.total ? Math.round(h.marked / h.total * 100) : 0, h.state === 'done' ? 'ok' : h.state === 'none' ? 'bad' : 'warn')}<span>${h.marked}/${h.total}</span></div></td>
    <td data-l="Status">${h.state === 'done' ? tacPill('ok', 'Done', 'check') : h.state === 'holiday' ? tacPill('mute', 'Holiday', 'cal') : h.state === 'partial' ? tacPill('warn', 'Partly marked', 'clock') : tacPill('bad', 'Not marked', 'alert')}</td>
    <td class="tac-act">${h.teacher && (h.state === 'none' || h.state === 'partial') && h.teacher.linkedUserId ? `<button type="button" class="tac-btn tac-btn-sm tac-btn-pri" onclick="tacRemindAtt('${tacJs(h.teacher.id)}','${tacJs(h.cls)}','${tacJs(h.sec)}')">${tacIcon('bell', 14)}Remind</button>` : ''}</td></tr>`).join('');
  return `<div class="tac-panel"><div class="tac-panel-h"><h3>Today's class attendance <small>${m.isHoliday ? 'Holiday today' : done + ' of ' + hrs.length + ' classes marked'}</small></h3></div>
    ${rows ? `<div class="tac-scroll"><table class="tac-table"><thead><tr><th scope="col">Class</th><th scope="col">Class teacher</th><th scope="col">Marked</th><th scope="col">Status</th><th scope="col"><span class="tac-sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="tac-empty"><b>No classes</b></div>`}</div>`;
}
async function tacRemindAtt(staffId, cls, sec){
  const st = tacModel.staffById.get(staffId); if(!st) return;
  const ok = await showConfirmDialog(`Remind ${tacStaffName(st)} to mark today's attendance for ${cls} ${sec}?`, { title: 'Send reminder', okText: 'Send reminder' });
  if(!ok) return;
  try{
    const res = await fetch('/api/notifications/broadcast', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, actorHeaders()),
      body: JSON.stringify({ title: 'Attendance not marked', body: `Today's attendance for ${cls} ${sec} has not been marked yet. Please mark it now.`, type: 'reminder', url: '/?view=attendance', staffIds: [staffId], push: true }) });
    const j = await res.json();
    showToast(j && j.notified ? 'Reminder sent.' : 'Could not notify (no active login).');
  }catch(e){ showToast('Could not send the reminder.'); }
}

/* ----- Homework & inbox tab ----- */
function tacInboxHtml(teachers){
  const rows = teachers.map(t => ({ staff: t.staff, pendingSubmissions: t.pendSubs, openConcerns: t.openCons }));
  const list = teachers.filter(t => t.hwCount || t.pendSubs || t.openCons || t.tasks.length).sort((a, b) => (b.pendSubs + b.openCons) - (a.pendSubs + a.openCons) || b.hwCount - a.hwCount);
  const totalHw = teachers.reduce((a, t) => a + t.hwCount, 0);
  const noHw = teachers.filter(t => t.tasks.length && !t.hwCount).length;
  return `<div class="tac-grid2">
    <div class="tac-panel"><div class="tac-panel-h"><h3>Homework assigned — last ${tacRange} days <small>${totalHw} total</small></h3>
      <label class="tac-sel"><span class="tac-sr">Range</span><select onchange="tacSetRange(this.value)"><option value="7" ${tacRange === 7 ? 'selected' : ''}>Last 7 days</option><option value="14" ${tacRange === 14 ? 'selected' : ''}>Last 14 days</option><option value="30" ${tacRange === 30 ? 'selected' : ''}>Last 30 days</option></select></label></div>
      ${countTrendChartSVG(dailyHomeworkTrend(tacRange), 'var(--navy)', 'Homework assigned per day')}
      <div class="tac-note">${noHw} teacher${noHw === 1 ? '' : 's'} with classes assigned no homework in this period.</div></div>
    <div class="tac-panel"><div class="tac-panel-h"><h3>Waiting for a reply</h3></div>${staffActivityLeaderboardHtml(rows)}</div>
  </div>
  <div class="tac-panel"><div class="tac-panel-h"><h3>Per-teacher workload</h3></div><div class="tac-scroll"><table class="tac-table"><thead><tr><th scope="col">Teacher</th><th scope="col">Homework (${tacRange}d)</th><th scope="col">Submissions to review</th><th scope="col">Open concerns</th><th scope="col"><span class="tac-sr">Actions</span></th></tr></thead><tbody>
  ${list.map(t => `<tr><td data-l="Teacher"><button type="button" class="tac-link" onclick="tacOpenDrawer('${tacJs(t.id)}',event)">${tacEsc(t.name)}</button></td>
    <td data-l="Homework">${t.hwCount ? t.hwCount : tacPill(t.tasks.length ? 'warn' : 'mute', 'None')}</td>
    <td data-l="Submissions">${t.pendSubs ? tacPill(t.oldestSub >= 3 ? 'bad' : 'warn', t.pendSubs + (t.oldestSub ? ' · oldest ' + t.oldestSub + 'd' : '')) : '<span class="tac-mute-t">0</span>'}</td>
    <td data-l="Concerns">${t.openCons ? tacPill(t.oldestCon >= 3 ? 'bad' : 'warn', t.openCons + (t.oldestCon ? ' · oldest ' + t.oldestCon + 'd' : '')) : '<span class="tac-mute-t">0</span>'}</td>
    <td class="tac-act"><button type="button" class="tac-btn tac-btn-sm" onclick="tacOpenDrawer('${tacJs(t.id)}',event)">Details</button></td></tr>`).join('')}</tbody></table></div></div>`;
}

/* ----- Drawer ----- */
function tacDrawerHtml(){
  const m = tacModel;
  const base = m.teachers.find(t => t.id === tacDrawerStaff);
  if(!base) return '';
  const t = base;
  const pend = t.tasks.filter(x => x.pending).sort((a, b) => b.overdue - a.overdue);
  const done = t.tasks.filter(x => x.status === 'complete');
  const up = t.tasks.filter(x => x.status === 'upcoming');
  const row = x => `<li><div><b>${tacEsc(x.subject)}</b> · ${tacEsc(x.cls)} ${tacEsc(x.sec)}<small>${tacEsc(x.examName)} · ${x.entered}/${x.expected} entered${x.due ? ' · due ' + tacEsc(x.due) : ''}</small></div>${tacStatusPill(x)}<button type="button" class="tac-btn tac-btn-sm" onclick="tacOpenSheet('${tacJs(x.examId)}','${tacJs(x.cls)}','${tacJs(x.sec)}')" aria-label="Open ${tacEsc(x.subject)} ${tacEsc(x.cls)} ${tacEsc(x.sec)} sheet">${tacIcon('open', 14)}Open</button></li>`;
  return `<div class="tac-scrim" onclick="tacCloseDrawer()"></div>
  <aside class="tac-drawer" role="dialog" aria-modal="true" aria-labelledby="tacDrawerTitle">
    <header><div class="tac-card-h">${tacAvatar(t.staff, 52)}<div class="tac-card-t"><b id="tacDrawerTitle">${tacEsc(t.name)}</b><small>${tacEsc([t.staff.designation, t.staff.department].filter(Boolean).join(' · ') || 'Staff')}</small></div></div>
      <button type="button" id="tacDrawerClose" class="tac-icon-btn" onclick="tacCloseDrawer()" aria-label="Close details">${tacIcon('x', 18)}</button></header>
    <div class="tac-dbody">
      <div class="tac-dstats"><div><b>${pend.length}</b><span>Pending</span></div><div><b>${done.length}</b><span>Complete</span></div><div><b>${t.pct == null ? '—' : t.pct + '%'}</b><span>Entered</span></div><div><b>${t.pendSubs + t.openCons}</b><span>Inbox</span></div></div>
      <div class="tac-card-a" style="margin:0 0 14px">${pend.length ? `<button type="button" class="tac-btn tac-btn-pri" onclick="tacRemind('${tacJs(t.id)}')">${tacIcon('bell', 15)}Send reminder</button><button type="button" class="tac-btn" onclick="tacWhatsApp('${tacJs(t.id)}')">${tacIcon('wa', 15)}WhatsApp</button>` : ''}${t.staff.phone ? `<a class="tac-btn" href="tel:${tacEsc(t.staff.phone)}">Call</a>` : ''}</div>
      <h4>Today</h4>
      <p class="tac-line">${tacIcon('user', 14)} Own attendance: <b>${tacEsc(t.own)}</b></p>
      ${t.homeroom ? `<p class="tac-line">${tacIcon('home', 14)} Homeroom ${tacEsc(t.homeroom.cls)} ${tacEsc(t.homeroom.sec)}: <b>${{ done: 'attendance done', none: 'attendance NOT marked', partial: t.homeroom.marked + ' of ' + t.homeroom.total + ' marked', holiday: 'holiday', empty: 'no students' }[t.homeroom.state]}</b></p>` : ''}
      <p class="tac-line">${tacIcon('book', 14)} Homework in ${tacRange} days: <b>${t.hwCount}</b></p>
      <p class="tac-line">${tacIcon('chat', 14)} Waiting: <b>${t.pendSubs}</b> submissions, <b>${t.openCons}</b> concerns</p>
      <h4>Pending marks sheets (${pend.length})</h4>
      ${pend.length ? `<ul class="tac-dlist">${pend.map(row).join('')}</ul>` : `<div class="tac-note">${t.tasks.length ? 'Nothing pending — all caught up.' : 'No marks sheets assigned to this teacher.'}</div>`}
      ${up.length ? `<h4>Upcoming (${up.length})</h4><ul class="tac-dlist">${up.map(row).join('')}</ul>` : ''}
      ${done.length ? `<h4>Completed (${done.length})</h4><ul class="tac-dlist">${done.map(row).join('')}</ul>` : ''}
    </div>
  </aside>`;
}

/* ---------- Styles ---------- */
function tacInjectStyle(){
  if(document.getElementById('tacStyle')) return;
  const s = document.createElement('style'); s.id = 'tacStyle';
  s.textContent = `
.tac{--tac-ok:#16a37f;--tac-warn:#d99a1c;--tac-bad:#e0245e;--tac-mute:#8b86a3;--tac-surface:var(--white);--tac-line:var(--border);color:var(--ink);font-size:.88rem}
.tac *{box-sizing:border-box}
.tac button{font-family:inherit;cursor:pointer}
.tac button:focus-visible,.tac a:focus-visible,.tac input:focus-visible,.tac select:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.tac-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.tac-hero{display:flex;gap:20px;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:24px 28px;border-radius:20px;color:#fff;background:radial-gradient(900px 300px at 90% -20%,rgba(209,16,115,.55),transparent 60%),radial-gradient(600px 280px at 0% 120%,rgba(203,154,46,.35),transparent 60%),linear-gradient(135deg,var(--navy-deep),var(--navy));box-shadow:var(--shadow);margin-bottom:16px}
.tac-hero h2{margin:6px 0 4px;font-size:1.55rem;letter-spacing:-.01em;color:#fff}
.tac-hero p{margin:0;opacity:.85;font-size:.86rem}
.tac-hero-meta{margin-top:10px;font-size:.76rem;opacity:.8;display:flex;gap:8px;flex-wrap:wrap}
.tac-live{display:inline-flex;align-items:center;gap:7px;font-size:.68rem;font-weight:800;letter-spacing:.14em;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25)}
.tac-dot{width:8px;height:8px;border-radius:50%;background:#3ee6a8;box-shadow:0 0 0 0 rgba(62,230,168,.7);animation:tacPulse 1.8s infinite}
@keyframes tacPulse{70%{box-shadow:0 0 0 9px rgba(62,230,168,0)}100%{box-shadow:0 0 0 0 rgba(62,230,168,0)}}
.tac-hero-r{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.tac-hero-ring{display:flex;align-items:center;gap:10px;font-size:.74rem;opacity:.95;line-height:1.3}
.tac-hero-btns{display:flex;gap:8px;flex-wrap:wrap}
.tac-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--tac-line);background:var(--white);color:var(--navy);padding:8px 14px;border-radius:10px;font-weight:600;font-size:.8rem;text-decoration:none;transition:transform .12s,box-shadow .12s,background .12s;min-height:36px}
.tac-btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px -8px rgba(22,16,51,.4)}
.tac-btn-sm{padding:5px 10px;font-size:.74rem;min-height:30px;border-radius:8px}
.tac-btn-pri{background:var(--magenta);border-color:var(--magenta);color:#fff}
.tac-btn-pri:hover{background:var(--magenta-deep)}
.tac-btn-light{background:#fff;color:var(--navy);border-color:#fff}
.tac-btn-ghost{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.35)}
.tac-btn-ghost[aria-pressed=false]{opacity:.7}
.spin svg{animation:tacSpin .8s linear infinite}@keyframes tacSpin{to{transform:rotate(360deg)}}
.tac-filters{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.tac-seg{display:inline-flex;background:var(--white);border:1px solid var(--tac-line);border-radius:12px;padding:3px}
.tac-seg-b{border:0;background:transparent;padding:7px 13px;border-radius:9px;font-weight:600;font-size:.8rem;color:var(--ink-soft);display:inline-flex;gap:7px;align-items:center}
.tac-seg-b em,.tac-chip em,.tac-tab em{font-style:normal;font-size:.68rem;font-weight:700;background:rgba(33,26,78,.1);border-radius:99px;padding:1px 7px}
.tac-seg-b.on{background:var(--navy);color:#fff}.tac-seg-b.on em{background:rgba(255,255,255,.25)}
.tac-search{display:flex;align-items:center;gap:8px;background:var(--white);border:1px solid var(--tac-line);border-radius:12px;padding:0 12px;min-width:240px;color:var(--ink-soft)}
.tac-search input{border:0;outline:0;background:transparent;padding:10px 0;width:100%;font:inherit;color:var(--ink)}
.tac-search:focus-within{border-color:var(--navy);box-shadow:0 0 0 3px rgba(33,26,78,.12)}
.tac-chips{display:flex;gap:7px;flex-wrap:wrap}
.tac-chip{border:1px solid var(--tac-line);background:var(--white);color:var(--ink-soft);padding:6px 12px;border-radius:99px;font-size:.76rem;font-weight:600;display:inline-flex;gap:7px;align-items:center}
.tac-chip.on{background:var(--navy);color:#fff;border-color:var(--navy)}.tac-chip.on em{background:rgba(255,255,255,.25)}
.tac-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(172px,1fr));gap:12px;margin-bottom:18px}
.tac-kpi{position:relative;text-align:left;border:1px solid var(--tac-line);background:var(--white);border-radius:16px;padding:14px 16px 14px;display:flex;flex-direction:column;gap:2px;overflow:hidden;transition:transform .15s,box-shadow .15s}
.tac-kpi:hover{transform:translateY(-3px);box-shadow:var(--shadow-hover)}
.tac-kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--c)}
.tac-kpi-ic{position:absolute;right:12px;top:12px;color:var(--c);opacity:.9;background:color-mix(in srgb,var(--c) 14%,transparent);border-radius:10px;padding:6px;display:flex}
.tac-kpi-v{font-size:1.9rem;font-weight:800;color:var(--ink);letter-spacing:-.02em;line-height:1.1;margin-top:4px}
.tac-kpi-l{font-weight:700;font-size:.78rem;color:var(--ink)}
.tac-kpi-s{font-size:.72rem;color:var(--ink-soft)}
.tac-t-ok{--c:var(--tac-ok)}.tac-t-warn{--c:var(--tac-warn)}.tac-t-bad{--c:var(--tac-bad)}.tac-t-mute{--c:var(--tac-mute)}
.tac-tabs{display:flex;gap:4px;border-bottom:1px solid var(--tac-line);margin-bottom:16px;overflow-x:auto}
.tac-tab{border:0;background:transparent;padding:11px 16px;display:inline-flex;gap:8px;align-items:center;font-weight:700;font-size:.84rem;color:var(--ink-soft);border-bottom:3px solid transparent;white-space:nowrap}
.tac-tab.on{color:var(--navy);border-bottom-color:var(--magenta)}.tac-tab em{background:var(--danger-bg);color:var(--danger-ink)}
.tac-panel{background:var(--white);border:1px solid var(--tac-line);border-radius:16px;padding:16px 18px;margin-bottom:16px}
.tac-panel-h{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.tac-panel-h h3{margin:0;font-size:1rem;color:var(--navy)}.tac-panel-h small{font-weight:500;color:var(--ink-soft);font-size:.74rem;margin-left:6px}
.tac-grid2{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start}
.tac-side{display:flex;flex-direction:column}
@media(max-width:980px){.tac-grid2{grid-template-columns:1fr}}
.tac-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.tac-card,.tac-tcard{border:1px solid var(--tac-line);border-radius:14px;padding:13px;background:var(--cream);display:flex;flex-direction:column;gap:10px}
.tac-tcard{background:var(--white)}.tac-tcard.is-behind{border-left:4px solid var(--tac-bad)}
.tac-tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px;margin-top:14px}
.tac-card-h{display:flex;gap:10px;align-items:center}
.tac-card-t{display:flex;flex-direction:column;min-width:0;flex:1}.tac-card-t b{color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tac-card-t small{color:var(--ink-soft);font-size:.72rem}
.tac-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:700;object-fit:cover;flex:none}
.tac-count{min-width:30px;height:30px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;color:#fff}
.tac-count.tac-bad{background:var(--tac-bad)}.tac-count.tac-warn{background:var(--tac-warn)}
.tac-card-p{display:flex;align-items:center;gap:8px;font-size:.74rem;color:var(--ink-soft)}.tac-card-p .tac-bar{flex:1}
.tac-bar{display:inline-block;height:8px;background:rgba(33,26,78,.1);border-radius:99px;overflow:hidden;width:100%;min-width:60px}
.tac-bar i{display:block;height:100%;border-radius:99px;background:var(--b);transition:width .5s}
.tac-ok{--b:var(--tac-ok)}.tac-warn{--b:var(--tac-warn)}.tac-bad{--b:var(--tac-bad)}.tac-mute{--b:var(--tac-mute)}
.tac-tags{display:flex;gap:6px;flex-wrap:wrap}
.tac-tag{border:1px solid var(--tac-line);background:var(--white);border-radius:8px;padding:3px 8px;font-size:.7rem;font-weight:600;color:var(--ink)}
.tac-tag-bad{border-color:color-mix(in srgb,var(--tac-bad) 50%,transparent);background:var(--danger-bg)}.tac-tag-warn{border-color:color-mix(in srgb,var(--tac-warn) 55%,transparent);background:var(--warning-bg)}
.tac-card-a{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.tac-pill{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:3px 10px;font-size:.7rem;font-weight:700;white-space:nowrap}
.tac-p-ok{background:var(--success-bg);color:var(--success-ink)}.tac-p-warn{background:var(--warning-bg);color:var(--warning-ink)}.tac-p-bad{background:var(--danger-bg);color:var(--danger-ink)}.tac-p-mute{background:rgba(120,116,150,.16);color:var(--ink-soft)}
.tac-prog{width:100%;display:grid;grid-template-columns:1fr 80px 42px;gap:10px;align-items:center;border:0;background:transparent;padding:8px 4px;border-radius:10px;text-align:left;color:var(--ink)}
.tac-prog:hover{background:var(--cream)}.tac-prog span{display:flex;flex-direction:column}.tac-prog small{color:var(--ink-soft);font-size:.7rem}.tac-prog strong{text-align:right}
.tac-note{color:var(--ink-soft);font-size:.78rem;padding:6px 2px}
.tac-scroll{overflow-x:auto}
.tac-table{width:100%;border-collapse:collapse}
.tac-table th{text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft);padding:8px 10px;border-bottom:1px solid var(--tac-line);white-space:nowrap}
.tac-table td{padding:10px;border-bottom:1px solid var(--tac-line);vertical-align:middle}
.tac-table tr:hover td{background:var(--cream)}
.tac-table td small,.tac-table td b+small{display:block;color:var(--ink-soft);font-size:.7rem}
.tac-act{white-space:nowrap;display:flex;gap:6px;justify-content:flex-end}
.tac-prow{display:flex;align-items:center;gap:8px;min-width:140px}.tac-prow .tac-bar{flex:1}.tac-prow span{font-size:.76rem;font-weight:600;white-space:nowrap}
.tac-link{border:0;background:none;color:var(--navy);font-weight:600;text-decoration:underline;text-underline-offset:3px;padding:0;font-size:inherit}
.tac-warn-t{color:var(--warning-ink)!important;font-weight:600}.tac-mute-t{color:var(--ink-soft);font-weight:500}
.tac-heat{border-collapse:separate;border-spacing:5px}.tac-heat th{font-size:.72rem;color:var(--ink-soft);text-align:center;padding:2px 4px}.tac-heat tbody th{text-align:left;white-space:nowrap;color:var(--ink)}
.tac-hm{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-width:84px;height:48px;border-radius:10px;border:2px solid transparent;font-weight:800;color:#fff;font-size:.82rem;line-height:1.1}
.tac-hm small{font-weight:600;font-size:.62rem;opacity:.95}
.tac-hm-ok{background:var(--tac-ok)}.tac-hm-warn{background:#b9801a}.tac-hm-bad{background:var(--tac-bad)}.tac-hm-mute{background:var(--tac-mute)}
.tac-hm-none{background:transparent;color:var(--ink-soft);border:1px dashed var(--tac-line);font-weight:500}
button.tac-hm:hover{transform:scale(1.05)}.tac-hm.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--white),0 0 0 4px var(--ink)}
.tac-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.72rem;color:var(--ink-soft);margin-top:8px}.tac-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;background:var(--b)}
.tac-alert{display:flex;gap:12px;align-items:center;background:var(--warning-bg);border:1px solid color-mix(in srgb,var(--tac-warn) 45%,transparent);color:var(--warning-ink);padding:12px 16px;border-radius:14px;margin-bottom:16px}
.tac-alert div{display:flex;flex-direction:column;flex:1}.tac-alert span{font-size:.78rem;opacity:.9}
.tac-active-f{display:flex;gap:10px;align-items:center;margin:10px 0;font-size:.8rem}
.tac-more{text-align:center;margin-top:12px}
.tac-empty{text-align:center;padding:34px 16px;color:var(--ink-soft);display:flex;flex-direction:column;gap:4px;align-items:center;border:1px dashed var(--tac-line);border-radius:14px;background:var(--white)}
.tac-empty b{color:var(--navy);font-size:1rem}.tac-good{color:var(--tac-ok)}.tac-good b{color:var(--ink)}
.tac-tmeta{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tac-tmeta>div{display:flex;flex-direction:column;gap:2px;background:var(--cream);border-radius:10px;padding:8px 10px}.tac-tmeta span{font-size:.66rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft)}.tac-tmeta small{font-size:.7rem;color:var(--ink-soft)}
.tac-sel select{border:1px solid var(--tac-line);border-radius:8px;padding:6px 10px;background:var(--white);color:var(--ink);font:inherit}
.tac-scrim{position:fixed;inset:0;background:rgba(10,7,30,.5);z-index:900;animation:tacFade .2s}
.tac-drawer{position:fixed;top:0;right:0;bottom:0;width:min(520px,100%);background:var(--white);z-index:901;box-shadow:-20px 0 50px -20px rgba(0,0,0,.45);display:flex;flex-direction:column;animation:tacSlide .25s ease}
@keyframes tacSlide{from{transform:translateX(40px);opacity:0}}@keyframes tacFade{from{opacity:0}}
.tac-drawer header{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid var(--tac-line)}
.tac-dbody{padding:18px 20px;overflow:auto;flex:1}
.tac-dbody h4{margin:18px 0 8px;color:var(--navy);font-size:.88rem}
.tac-dstats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.tac-dstats div{background:var(--cream);border-radius:12px;padding:10px;text-align:center}.tac-dstats b{display:block;font-size:1.3rem;color:var(--navy)}.tac-dstats span{font-size:.68rem;color:var(--ink-soft)}
.tac-line{display:flex;gap:8px;align-items:center;margin:6px 0;color:var(--ink-soft)}.tac-line b{color:var(--ink)}
.tac-dlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.tac-dlist li{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;border:1px solid var(--tac-line);border-radius:10px;padding:8px 10px}.tac-dlist small{display:block;color:var(--ink-soft);font-size:.7rem}
@media(max-width:560px){.tac-dlist li{grid-template-columns:1fr}}
.tac-icon-btn{border:1px solid var(--tac-line);background:var(--white);color:var(--ink);width:38px;height:38px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center}
.tac-skel{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.tac-skel div{height:110px;border-radius:16px;background:linear-gradient(90deg,var(--cream),rgba(33,26,78,.06),var(--cream));background-size:200% 100%;animation:tacSh 1.2s infinite}@keyframes tacSh{to{background-position:-200% 0}}
@media(max-width:700px){
  .tac-hero{padding:18px}.tac-search{min-width:100%}
  .tac-table thead{position:absolute;left:-9999px}.tac-table tr{display:block;border:1px solid var(--tac-line);border-radius:12px;margin-bottom:10px;padding:6px 4px}.tac-table td{display:flex;justify-content:space-between;gap:12px;border:0;padding:6px 10px}.tac-table td::before{content:attr(data-l);font-size:.68rem;text-transform:uppercase;color:var(--ink-soft);font-weight:700}.tac-act{justify-content:flex-start}.tac-act::before{content:none!important}
}
@media(prefers-reduced-motion:reduce){.tac *{animation:none!important;transition:none!important}}
[data-theme="dark"] .tac{--tac-surface:#1a1530}
`;
  document.head.appendChild(s);
}
