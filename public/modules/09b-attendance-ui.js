/* ============================================================================
   Manage Attendance → Mark Attendance roster.
   Presentation only: the save path (saveAttendance), holiday rules, the
   Morning/Afternoon sessions and "apply to both sessions" are unchanged and
   still live in module 09. Marking a student now updates just that row and the
   live counters instead of re-rendering the whole screen.
   ========================================================================== */

const AT_STATUSES = [
  { key: 'Present', icon: '✓', short: 'P' },
  { key: 'Absent',  icon: '✕', short: 'A' },
  { key: 'Late',    icon: '◐', short: 'L' },
  { key: 'Leave',   icon: '☂', short: 'Lv' },
];

function atRosterList(){
  return students.filter(s => s.className === attCurrentClass && s.section === attCurrentSection && isActive(s)).sort(compareByRoll);
}

function atTally(list){
  const t = { Present: 0, Absent: 0, Late: 0, Leave: 0 };
  list.forEach(s => { const k = pendingMarks[s.id]; if(t[k] !== undefined) t[k]++; });
  return t;
}

function atStatusButtons(studentId){
  return AT_STATUSES.map(st => `<button type="button" class="at-st at-st--${st.key.toLowerCase()} ${pendingMarks[studentId] === st.key ? 'active' : ''}"
      data-status="${st.key}" aria-pressed="${pendingMarks[studentId] === st.key}" title="${st.key}" onclick="setAttStatus('${studentId}','${st.key}')">
      <span aria-hidden="true">${st.icon}</span><em>${st.key}</em></button>`).join('');
}

// Paints counters + the save-bar summary from pendingMarks.
function atPaintCounters(){
  const list = atRosterList();
  const t = atTally(list);
  AT_STATUSES.forEach(st => {
    const el = document.getElementById('atCount' + st.key);
    if(el) el.textContent = t[st.key];
  });
  const pct = list.length ? Math.round((t.Present + t.Late) / list.length * 100) : 0;
  const p = document.getElementById('atPct'); if(p) p.textContent = pct + '%';
  const bar = document.getElementById('atPctBar'); if(bar) bar.style.width = pct + '%';
  const sum = document.getElementById('atSaveSummary');
  if(sum) sum.innerHTML = `<b>${list.length}</b> students · <span class="at-dot at-dot--present"></span>${t.Present} <span class="at-dot at-dot--absent"></span>${t.Absent} <span class="at-dot at-dot--late"></span>${t.Late} <span class="at-dot at-dot--leave"></span>${t.Leave}`;
}

function renderAttRoster(body){
  const list = atRosterList();
  list.forEach(s => {
    if(pendingMarks[s.id] === undefined){
      const rec = attendanceRecords.find(r => r.studentId === s.id && r.date === attMarkDate && r.session === attMarkSession);
      // Falls back to a pre-two-session (sessionless) record so re-opening an
      // old date shows its original status, not "Present" for everyone.
      const legacy = !rec ? attendanceRecords.find(r => r.studentId === s.id && r.date === attMarkDate && !r.session) : null;
      pendingMarks[s.id] = rec ? rec.status : (legacy ? legacy.status : 'Present');
    }
  });
  const holiday = holidayFor(attMarkDate);
  const isHoliday = !!holiday;
  const both = canUseBothSessionsShortcut();
  const kpi = (key, label, cls) => `<div class="at-kpi at-kpi--${cls}"><span aria-hidden="true">${AT_STATUSES.find(x => x.key === key).icon}</span><div><b id="atCount${key}">0</b><small>${label}</small></div></div>`;
  body.innerHTML = `
    <div class="breadcrumb"><a onclick="backToAttGrid()">All Classes</a> &nbsp;/&nbsp; ${escapeHtml(attCurrentClass)} — Section ${escapeHtml(attCurrentSection)}</div>
    <section class="at-summary">
      ${kpi('Present', 'Present', 'present')}${kpi('Absent', 'Absent', 'absent')}${kpi('Late', 'Late', 'late')}${kpi('Leave', 'On leave', 'leave')}
      <div class="at-rate"><small>Attendance today</small><b id="atPct">0%</b><div class="at-rate-bar"><span id="atPctBar"></span></div></div>
    </section>
    <div class="iv-toolbar">
      <input type="date" class="input" id="attDateInput" value="${attMarkDate}" onchange="changeAttDate(this.value)" style="max-width:190px;">
      <div class="sf-segments" role="group" aria-label="Session" style="${attApplyBothSessions ? 'opacity:.45; pointer-events:none;' : ''}">
        ${ATT_SESSIONS.map(sess => `<button type="button" class="${attMarkSession === sess ? 'active' : ''}" onclick="changeAttSession('${sess}')">${sess === 'Morning' ? '🌅' : '🌇'} ${sess}</button>`).join('')}
      </div>
      <div class="iv-toolbar-actions">
        ${both ? `<label class="at-both" title="Saves the same status to both Morning and Afternoon in one go — handy for backfilling past dates.">
          <input type="checkbox" ${attApplyBothSessions ? 'checked' : ''} onchange="toggleAttBothSessions(this.checked); renderAttendanceBody();"> Apply to both sessions</label>` : ''}
        ${sfBtn('soft', '', '✓ All present', "markAllStatus('Present')")}
        ${sfBtn('soft', '', '✕ All absent', "markAllStatus('Absent')")}
      </div>
    </div>
    ${isHoliday ? `<div class="empty-state" style="margin-bottom:16px;"><b>${escapeHtml(holiday.name || 'Holiday')} — school is closed on ${attMarkDate}</b>Attendance isn't taken on a holiday. Pick a working day above, or ${holiday.auto ? 'adjust it under Attendance → Settings → Working Days' : 'remove the holiday first'} if this date shouldn't be one.</div>` : ''}
    <div class="sf-card" style="${isHoliday ? 'opacity:.5; pointer-events:none;' : ''}">
      <div class="at-list">
        ${list.map(s => `
          <div class="at-row" data-id="${s.id}">
            <span class="at-roll">${escapeHtml(s.rollNo || '—')}</span>
            ${sfAvatar(s)}
            <span class="at-name"><b>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</b><small>${escapeHtml(s.admissionNo || '')}</small></span>
            <div class="at-btns" role="group" aria-label="Status for ${escapeHtml(s.firstName)}">${atStatusButtons(s.id)}</div>
          </div>`).join('')}
        ${list.length === 0 ? `<div class="empty-state"><b>No students here</b></div>` : ''}
      </div>
    </div>
    <div class="at-savebar">
      <span id="atSaveSummary"></span>
      <button type="button" class="sf-btn sf-btn--primary sf-btn--lg" ${isHoliday ? 'disabled' : ''} onclick="saveAttendance()">Save attendance${attApplyBothSessions ? ' (Morning &amp; Afternoon)' : ' (' + attMarkSession + ')'}</button>
    </div>`;
  atPaintCounters();
}

// Marking one student only touches that row and the counters.
function setAttStatus(studentId, status){
  pendingMarks[studentId] = status;
  const row = document.querySelector(`.at-row[data-id="${studentId}"]`);
  if(row){
    row.querySelectorAll('.at-st').forEach(b => {
      const on = b.dataset.status === status;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    atPaintCounters();
  }else{
    renderAttendanceBody();
  }
}

function markAllStatus(status){
  atRosterList().forEach(s => { pendingMarks[s.id] = status; });
  document.querySelectorAll('.at-row').forEach(row => {
    row.querySelectorAll('.at-st').forEach(b => {
      const on = b.dataset.status === status;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
  atPaintCounters();
}
