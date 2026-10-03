const ATTENDANCE_KEY = "attendance-records";
  const HOLIDAYS_KEY = "attendance-holidays";
  const ATT_SETTINGS_KEY = "attendance-settings";
  API_BACKED_KEYS[ATTENDANCE_KEY] = '/api/attendance';
  API_BACKED_KEYS[HOLIDAYS_KEY] = '/api/holidays';
  OBJECT_BACKED_KEYS[ATT_SETTINGS_KEY] = '/api/attendance-settings';

  let attendanceRecords = [];
  let holidays = [];
  let attSettings = { threshold: 75, workingDays: [1,2,3,4,5,6] };

  /* Twice-daily (Morning/Afternoon) attendance. A record marked before this
     feature shipped has no `session` field at all — per school decision,
     every % and day-count calculation treats a sessionless record as a full
     day (both sessions), so it's given weight 2 to match the 2 rows
     (Morning + Afternoon) a day marked under the new system produces.
     Used identically for both student (attendanceRecords) and staff
     (staffAttendanceRecords) — same shape, same rule. */
  function attSessionWeight(r){ return r.session ? 1 : 2; }
  const ATT_SESSIONS = ['Morning', 'Afternoon'];

  async function loadAttendance(){
    holidays = await storageGet(HOLIDAYS_KEY, []);
    attSettings = await storageGet(ATT_SETTINGS_KEY, { threshold: 75, workingDays: [1,2,3,4,5,6] });
  }
  const WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  // attSettings.workingDays already existed as a Settings checkbox (Sunday
  // unchecked by default) but was never actually wired into anything — this
  // is what makes it real. Any weekday NOT in workingDays (Sunday, by
  // default) is treated as an automatic holiday everywhere a holiday is
  // checked, without having to add it to the `holidays` list by hand or
  // storing a row for every single Sunday of the year.
  function isAutoHolidayWeekday(dateStr){
    if(!dateStr) return false;
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return !(attSettings.workingDays||[1,2,3,4,5,6]).includes(day);
  }
  // The one place to ask "is this date a holiday" — a manually-added holiday
  // (which can now span a date range, see addHoliday) takes priority and
  // keeps its own name; otherwise an automatic non-working weekday (Sunday
  // by default) is synthesized on the fly so it never needs to be stored.
  function holidayFor(dateStr){
    const h = holidays.find(x => x.date === dateStr);
    if(h) return h;
    if(isAutoHolidayWeekday(dateStr)){
      return { id: dateStr, date: dateStr, name: WEEKDAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()], auto: true };
    }
    return null;
  }
  // attendanceRecords is large and ever-growing (one row per student per
  // day) — loaded lazily on first actual use instead of at login. See
  // ensureDataLoaded().
  async function loadAttendanceRecordsData(){
    attendanceRecords = await storageGet(ATTENDANCE_KEY, []);
  }

  let attTab = 'mark';
  let attView = 'grid';
  let attCurrentClass = '', attCurrentSection = '';
  let atReportsFrom = '', atReportsTo = '';
  let attMarkDate = new Date().toISOString().slice(0,10);
  let attMarkSession = 'Morning';
  let pendingMarks = {};
  // Lets Admin/Office Assistant mark one status per student that gets saved
  // to BOTH sessions in a single click — built for backfilling attendance
  // mid-year, where re-doing the same roster twice (once per session) just
  // to record "present all day" is pure friction. Teachers marking their own
  // homeroom day-to-day don't get this toggle: the two sessions usually do
  // need to be recorded separately (half-day arrivals/departures etc).
  let attApplyBothSessions = false;
  function canUseBothSessionsShortcut(){
    return currentUser.role === 'Admin' || currentUser.role === 'Office Assistant';
  }
  function toggleAttBothSessions(checked){
    attApplyBothSessions = checked;
  }

  async function initAttendanceView(){
    await ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData);
    document.getElementById('atAyBadge').textContent = 'AY ' + currentAcademicYearValue;
    const classSel = document.getElementById('atClassFilter');
    const secSel = document.getElementById('atSectionFilter');
    const scope = myTeacherScope();
    if(scope){
      // A Teacher only ever sees attendance for the one class they're the
      // Class Teacher of — never a school-wide class/section picker. See
      // myTeacherScope() and the matching server-side enforcement.
      classSel.innerHTML = '<option value="">All Classes</option>';
      secSel.innerHTML = '<option value="">All Sections</option>';
      if(scope.classTeacherOf){
        classSel.innerHTML = `<option value="${scope.classTeacherOf.className}" selected>${scope.classTeacherOf.className}</option>`;
        secSel.innerHTML = `<option value="${scope.classTeacherOf.section}" selected>Section ${scope.classTeacherOf.section}</option>`;
      }
      classSel.disabled = true; secSel.disabled = true;
    } else {
      classSel.disabled = false; secSel.disabled = false;
      if(classSel.options.length <= 1){
        CLASS_LEVELS.forEach(c => { const o=document.createElement('option'); o.value=c; o.textContent=c; classSel.appendChild(o); });
      }
      if(secSel.options.length <= 1){
        SECTIONS.forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent='Section '+s; secSel.appendChild(o); });
      }
    }
    switchAttTab(attTab);
  }

  function switchAttTab(tab){
    attTab = tab;
    ['mark','reports','holidays','settings','low'].forEach(t => {
      document.getElementById('attab-'+t).classList.toggle('active', t===tab);
    });
    document.getElementById('atSearchRow').style.display = (tab==='reports' || tab==='low') ? 'flex' : 'none';
    if(tab === 'mark') attView = 'grid';
    renderAttendanceBody();
  }

  async function renderAttendanceBody(){
    await ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData);
    const body = document.getElementById('attendanceBody');
    if(!body) return;
    if(attTab === 'mark'){
      if(attView === 'grid') return renderAttClassGrid(body);
      if(attView === 'roster') return renderAttRoster(body);
    }
    if(attTab === 'reports') return renderAttReports(body);
    if(attTab === 'holidays') return renderHolidaysTab(body);
    if(attTab === 'settings') return renderAttSettingsTab(body);
    if(attTab === 'low') return renderLowAttendanceTab(body);
  }

  /* --- Staff Attendance --- */
  const STAFF_ATTENDANCE_KEY = "staff-attendance";
  API_BACKED_KEYS[STAFF_ATTENDANCE_KEY] = '/api/staff-attendance';
  let staffAttendanceRecords = [];
  let staffAttTab = 'mark';
  let staffAttMarkDate = new Date().toISOString().slice(0,10);
  let staffAttMarkSession = 'Morning';
  let staffPendingMarks = {};
  /* --- Biometric attendance (optional, per-school integration) ---
     Whether THIS school has a biometric device bridge set up at all — a
     deploy-time choice (see BIOMETRIC_API_KEY / /api/biometric/status in
     server.js), same pattern as onlinePaymentAvailable for Razorpay. Loaded
     once at boot (loadAllAppData) so both the Staff form's Biometric ID
     field and the Staff Attendance "Biometric Sync" tab can rely on it
     being ready, rather than each re-checking lazily. Defaults to false
     (hidden) — a school that hasn't set this up sees nothing about it
     anywhere in the app. */
  let biometricAttendanceAvailable = false;
  let biometricPunchLog = [];
  async function loadBiometricStatus(){
    try{
      const res = await fetch('/api/biometric/status');
      const data = await res.json();
      biometricAttendanceAvailable = !!(res.ok && data.enabled);
    }catch(e){
      biometricAttendanceAvailable = false;
    }
  }
  async function loadBiometricPunchLog(){
    try{
      const res = await fetch('/api/biometric/punches?limit=200');
      biometricPunchLog = res.ok ? await res.json() : [];
    }catch(e){
      biometricPunchLog = [];
    }
  }
  // staffAttendanceRecords is large and ever-growing (one row per staff
  // member per day) — loaded lazily on first actual use instead of at login.
  // See ensureDataLoaded().
  async function loadStaffAttendance(){
    staffAttendanceRecords = await storageGet(STAFF_ATTENDANCE_KEY, []);
  }
  function initStaffAttendanceView(){
    document.getElementById('stattab-biometric').style.display = biometricAttendanceAvailable ? '' : 'none';
    const deptSel = document.getElementById('stAtDeptFilter');
    if(deptSel.options.length <= 1){
      staffDepartments.forEach(d => { const o=document.createElement('option'); o.value=d; o.textContent=d; deptSel.appendChild(o); });
    }
  }
  function switchStaffAttTab(tab){
    staffAttTab = tab;
    ['mark','reports','biometric'].forEach(t => document.getElementById('stattab-'+t).classList.toggle('active', t===tab));
    document.getElementById('stAtSearchRow').style.display = tab==='reports' ? 'flex' : 'none';
    renderStaffAttendanceContent();
  }
  async function renderStaffAttendanceContent(){
    const body = document.getElementById('staffAttContentBody');
    if(!body) return;
    if(staffAttTab === 'mark' || staffAttTab === 'reports'){
      const requestedTab = staffAttTab;
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      await ensureDataLoaded('staffAttendanceRecords', loadStaffAttendance);
      if(staffAttTab !== requestedTab) return; // tab changed while loading
    }
    if(staffAttTab === 'mark') return renderStaffAttMark(body);
    if(staffAttTab === 'reports') return renderStaffAttReports(body);
    if(staffAttTab === 'biometric'){
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      loadBiometricPunchLog().then(() => { if(staffAttTab === 'biometric') renderStaffAttBiometric(body); });
      return;
    }
  }
  /* --- Biometric Sync tab: only reachable when this school has a device
     bridge configured (see biometricAttendanceAvailable above). Shows how
     it works, which staff still need their Biometric ID mapped, and the
     most recent punches received so the office can confirm it's syncing
     and spot any device user IDs that haven't been mapped to a staff
     record yet. --- */
  function renderStaffAttBiometric(body){
    const unmapped = biometricPunchLog.filter(p => !p.matched);
    const mappedCount = staffList.filter(st => staffIsActive(st) && st.biometricId).length;
    const totalActive = staffList.filter(staffIsActive).length;
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">
        Punches from your school's biometric device(s) arrive here automatically once the on-site sync
        bridge is running (ask your vendor for setup help). Each punch is matched to a staff member by
        their <b>Biometric ID</b> — set this once per staff member under Staff → Edit → Professional tab.
        A staff member with at least one matching punch on a given day is automatically marked Present for
        that day, unless the office has already marked that day manually — a manual entry is never
        overwritten.
      </p>
      <div class="pay-summary-box" style="margin-bottom:20px;">
        <div class="pay-summary-grid">
          <div class="pay-summary-item"><span>Staff with Biometric ID mapped</span><b>${mappedCount} / ${totalActive}</b></div>
          <div class="pay-summary-item ${unmapped.length ? 'highlight' : ''}"><span>Unmapped punches (last 200)</span><b>${unmapped.length}</b></div>
        </div>
      </div>
      <div class="dash-section-title"><div><h3>Recent Punches</h3></div></div>
      <div class="table-wrap">
        <table><thead><tr><th>Device Time</th><th>Device User ID</th><th>Staff</th><th>Device Serial</th></tr></thead><tbody>
        ${biometricPunchLog.length ? biometricPunchLog.map(p => `
          <tr>
            <td>${p.punchedAt ? new Date(p.punchedAt).toLocaleString() : '—'}</td>
            <td>${p.deviceUserId||'—'}</td>
            <td>${p.matched ? (p.staffName||'—') : `<span class="pill" style="background:rgba(203,154,46,0.18); color:#8a6a1f;">Unmapped</span>`}</td>
            <td>${p.deviceSerial||'—'}</td>
          </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No punches received yet</b>Once the on-site bridge starts sending logs, they'll show up here.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  function filteredStaffForAttendance(){
    const deptF = document.getElementById('stAtDeptFilter').value;
    const q = (document.getElementById('stAtSearch').value||'').trim().toLowerCase();
    let list = staffList.filter(st => staffIsActive(st));
    if(deptF) list = list.filter(st => st.department === deptF);
    if(q) list = list.filter(st => (st.firstName+' '+st.lastName).toLowerCase().includes(q));
    return list.sort((a,b) => (a.firstName||'').localeCompare(b.firstName||''));
  }
  function renderStaffAttMark(body){
    const list = filteredStaffForAttendance();
    list.forEach(st => {
      if(staffPendingMarks[st.id] === undefined){
        const rec = staffAttendanceRecords.find(r => r.staffId===st.id && r.date===staffAttMarkDate && r.session===staffAttMarkSession);
        const legacyRec = !rec ? staffAttendanceRecords.find(r => r.staffId===st.id && r.date===staffAttMarkDate && !r.session) : null;
        staffPendingMarks[st.id] = rec ? rec.status : (legacyRec ? legacyRec.status : 'Present');
      }
    });
    body.innerHTML = `
      <div class="ms-toolbar">
        <div class="ms-toolbar-left">
          <input type="date" class="input" id="staffAttDateInput" value="${staffAttMarkDate}" onchange="changeStaffAttDate(this.value)" style="max-width:200px;">
          <div class="att-status-row" style="display:inline-flex;">
            ${ATT_SESSIONS.map(sess => `<button type="button" class="att-status-btn ${staffAttMarkSession===sess?'active':''}" onclick="changeStaffAttSession('${sess}')">${sess==='Morning'?'🌅':'🌇'} ${sess}</button>`).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="markAllStaffStatus('Present')">Mark All Present</button>
          <button class="btn btn-ghost btn-sm" onclick="markAllStaffStatus('Absent')">Mark All Absent</button>
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Staff</th><th>Designation</th><th>Department</th><th>Status</th></tr></thead>
        <tbody>
        ${list.map(st => `
          <tr>
            <td class="name-cell">${st.firstName} ${st.lastName}</td>
            <td>${st.designation||'—'}</td>
            <td>${st.department||'—'}</td>
            <td>
              <div class="att-status-row">
                ${['Present','Absent','Late','Leave'].map(s => `<button type="button" class="att-status-btn ${staffPendingMarks[st.id]===s?'active':''}" data-status="${s}" onclick="setStaffAttStatus('${st.id}','${s}')">${s}</button>`).join('')}
              </div>
            </td>
          </tr>`).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No staff match this filter</b></div>` : ``}
      </div>
      <div style="margin-top:16px;"><button class="btn btn-primary" onclick="saveStaffAttendance()">Save Attendance</button></div>
    `;
  }
  function changeStaffAttDate(val){ staffAttMarkDate = val; staffPendingMarks = {}; renderStaffAttendanceContent(); }
  function changeStaffAttSession(val){ staffAttMarkSession = val; staffPendingMarks = {}; renderStaffAttendanceContent(); }
  function setStaffAttStatus(staffId, status){ staffPendingMarks[staffId] = status; renderStaffAttendanceContent(); }
  function markAllStaffStatus(status){
    filteredStaffForAttendance().forEach(st => { staffPendingMarks[st.id] = status; });
    renderStaffAttendanceContent();
  }
  async function saveStaffAttendance(){
    await ensureDataLoaded('staffAttendanceRecords', loadStaffAttendance);
    Object.keys(staffPendingMarks).forEach(staffId => {
      const status = staffPendingMarks[staffId];
      let rec = staffAttendanceRecords.find(r => r.staffId===staffId && r.date===staffAttMarkDate && r.session===staffAttMarkSession);
      if(rec){ rec.status = status; }
      else { staffAttendanceRecords.push({ id:'statt_'+staffId+'_'+staffAttMarkDate+'_'+staffAttMarkSession, staffId, date:staffAttMarkDate, session:staffAttMarkSession, status }); }
    });
    await storageSet(STAFF_ATTENDANCE_KEY, staffAttendanceRecords);
    showToast('Staff attendance saved for ' + staffAttMarkDate + ' (' + staffAttMarkSession + ').');
  }
  // See computeAttendanceStats' comment — same session-weighting rule.
  function computeStaffAttendanceStats(staffId, fromDate, toDate){
    let recs = staffAttendanceRecords.filter(r => r.staffId === staffId);
    if(fromDate) recs = recs.filter(r => r.date >= fromDate);
    if(toDate) recs = recs.filter(r => r.date <= toDate);
    const sumBy = status => recs.filter(r => r.status===status).reduce((n,r) => n + attSessionWeight(r), 0);
    const present = sumBy('Present');
    const late = sumBy('Late');
    const absent = sumBy('Absent');
    const leave = sumBy('Leave');
    const total = recs.reduce((n,r) => n + attSessionWeight(r), 0);
    const attended = present + late;
    const pct = total > 0 ? Math.round((attended/total)*100) : 0;
    return { present, absent, late, leave, total, pct };
  }
  function renderStaffAttReports(body){
    const list = filteredStaffForAttendance();
    const rows = list.map(st => {
      const stats = computeStaffAttendanceStats(st.id);
      const pctClass = stats.pct >= 90 ? 'good' : stats.pct >= 75 ? 'warn' : 'bad';
      return { st, stats, pctClass };
    }).sort((a,b) => a.stats.pct - b.stats.pct);
    body.innerHTML = `
      <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
        <button class="btn btn-ghost btn-sm" onclick="downloadStaffAttendanceExcel()">📥 Excel</button> <button class="btn btn-ghost btn-sm" onclick="downloadStaffAttendancePDF()">📄 PDF</button>
      </div>
      <div class="att-legend">
        <span><span class="dot2" style="background:var(--teal);"></span>Present</span>
        <span><span class="dot2" style="background:var(--gold);"></span>Late (counts as present)</span>
        <span><span class="dot2" style="background:var(--magenta);"></span>Absent</span>
        <span><span class="dot2" style="background:var(--brand-navy);"></span>Leave (counts as absent)</span>
      </div>
      <p style="font-size:0.74rem; color:var(--ink-soft); margin:-4px 0 10px;">Counts are per <b>session</b> (Morning + Afternoon), not per day — a fully-present day now shows as 2, not 1. Payroll's Loss-of-Pay calculation already converts this back to days. Attendance marked before the two-session change counts as 2 (a full day) either way, so % stays consistent across the change.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Staff</th><th>Designation</th><th>Department</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>Total Marked</th><th>%</th></tr></thead>
        <tbody>
        ${rows.map(r => `<tr>
          <td class="name-cell">${r.st.firstName} ${r.st.lastName}</td>
          <td>${r.st.designation||'—'}</td>
          <td>${r.st.department||'—'}</td>
          <td>${r.stats.present}</td><td>${r.stats.absent}</td><td>${r.stats.late}</td><td>${r.stats.leave}</td>
          <td>${r.stats.total}</td>
          <td class="att-pct ${r.pctClass}">${r.stats.pct}%</td>
        </tr>`).join('')}
        </tbody></table>
        ${rows.length===0 ? `<div class="empty-state"><b>No attendance data yet</b></div>` : ``}
      </div>
    `;
  }
  function staffAttendanceReportRows(){
    return filteredStaffForAttendance().map(st => {
      const stats = computeStaffAttendanceStats(st.id);
      return { 'Staff': st.firstName+' '+st.lastName, 'Designation': st.designation||'', 'Department': st.department||'',
        'Present': stats.present, 'Absent': stats.absent, 'Late': stats.late, 'Leave': stats.leave, 'Total Marked': stats.total, '%': stats.pct };
    });
  }
  function downloadStaffAttendanceExcel(){ exportRowsToExcel('staff_attendance_report.xlsx', 'Staff Attendance', staffAttendanceReportRows()); }
  function downloadStaffAttendancePDF(){ exportRowsToPDF('Staff Attendance Report', staffAttMarkDate, staffAttendanceReportRows()); }

  function studentAttendanceReportRows(){
    const classF = document.getElementById('atClassFilter').value;
    const secF = document.getElementById('atSectionFilter').value;
    let list = students.filter(s => isActive(s));
    if(classF) list = list.filter(s => s.className===classF);
    if(secF) list = list.filter(s => s.section===secF);
    return list.map(s => {
      const stats = computeAttendanceStats(s.id, atReportsFrom || undefined, atReportsTo || undefined);
      return { 'Student': s.firstName+' '+s.lastName, 'Admission No': s.admissionNo, 'Class': s.className, 'Section': s.section,
        'Present': stats.present, 'Absent': stats.absent, 'Late': stats.late, 'Leave': stats.leave, 'Total Marked': stats.total, '%': stats.pct };
    });
  }
  function setAttReportsRange(which, val){
    if(which==='from') atReportsFrom = val; else atReportsTo = val;
    renderAttReports(document.getElementById('attendanceBody'));
  }
  function clearAttReportsRange(){
    atReportsFrom = ''; atReportsTo = '';
    renderAttReports(document.getElementById('attendanceBody'));
  }
  function downloadStudentAttendanceExcel(){ exportRowsToExcel('student_attendance_report.xlsx', 'Student Attendance', studentAttendanceReportRows()); }
  function downloadStudentAttendancePDF(){ exportRowsToPDF('Student Attendance Report', '', studentAttendanceReportRows()); }

  /* --- Mark Attendance --- */
  let expandedAttClass = '';
  function toggleAttClassExpand(cls){
    expandedAttClass = (expandedAttClass === cls) ? '' : cls;
    renderAttClassGrid(document.getElementById('attendanceBody'));
  }
  function renderAttClassGrid(body){
    const classF = document.getElementById('atClassFilter').value;
    const scope = myTeacherScope();
    if(scope && scope.unlinked){
      body.innerHTML = `<div class="empty-state"><b>Your login isn't linked to a staff record</b>Ask an Admin to re-link your login under Staff Directory (🔑 Grant login access), or re-save it from Configuration → Users &amp; Roles — otherwise Class Teacher and Subject Teacher assignments can never reach your account.</div>`;
      return;
    }
    if(scope && !scope.classTeacherOf){
      body.innerHTML = `<div class="empty-state"><b>You're not set as a Class Teacher for any class yet</b>Attendance can only be marked by that class's Class Teacher — ask an admin to assign you one under Staff.</div>`;
      return;
    }
    const isSectionAllowed = (cls, sec) => !scope || (scope.classTeacherOf.className===cls && scope.classTeacherOf.section===sec);
    body.innerHTML = buildModernClassGrid(
      CLASS_LEVELS.filter(c => !classF || c===classF),
      (cls, sec) => isSectionAllowed(cls, sec) ? students.filter(s => s.className===cls && s.section===sec && isActive(s)).length : 0,
      cls => `toggleAttClassExpand('${cls}')`,
      (cls, sec) => `openAttRoster('${cls}','${sec}')`,
      cls => expandedAttClass === cls
    );
  }

  function openAttRoster(cls, sec){
    const scope = myTeacherScope();
    if(scope && !(scope.classTeacherOf && scope.classTeacherOf.className===cls && scope.classTeacherOf.section===sec)){
      showToast("You can only mark attendance for your own homeroom class.");
      return;
    }
    window.scrollTo({top:0,left:0,behavior:'instant'});
    attCurrentClass = cls; attCurrentSection = sec;
    attView = 'roster';
    pendingMarks = {};
    renderAttendanceBody();
  }
  function backToAttGrid(){ window.scrollTo({top:0,left:0,behavior:'instant'}); attView = 'grid'; renderAttendanceBody(); }

  function renderAttRoster(body){
    const list = students.filter(s => s.className===attCurrentClass && s.section===attCurrentSection && isActive(s))
      .sort(compareByRoll);
    list.forEach(s => {
      if(pendingMarks[s.id] === undefined){
        const rec = attendanceRecords.find(r => r.studentId===s.id && r.date===attMarkDate && r.session===attMarkSession);
        // Falls back to a pre-two-session (sessionless) record for this date
        // so re-opening an old date shows its original status as a starting
        // point, rather than defaulting everyone back to Present.
        const legacyRec = !rec ? attendanceRecords.find(r => r.studentId===s.id && r.date===attMarkDate && !r.session) : null;
        pendingMarks[s.id] = rec ? rec.status : (legacyRec ? legacyRec.status : 'Present');
      }
    });
    const isHoliday = !!holidayFor(attMarkDate);
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToAttGrid()">All Classes</a> &nbsp;/&nbsp; ${attCurrentClass} — Section ${attCurrentSection}</div>
      <div class="ms-toolbar">
        <div class="ms-toolbar-left">
          <input type="date" class="input" id="attDateInput" value="${attMarkDate}" onchange="changeAttDate(this.value)" style="max-width:200px;">
          <div class="att-status-row" style="display:inline-flex; ${attApplyBothSessions ? 'opacity:0.45; pointer-events:none;' : ''}">
            ${ATT_SESSIONS.map(sess => `<button type="button" class="att-status-btn ${attMarkSession===sess?'active':''}" onclick="changeAttSession('${sess}')">${sess==='Morning'?'🌅':'🌇'} ${sess}</button>`).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="markAllStatus('Present')">Mark All Present</button>
          <button class="btn btn-ghost btn-sm" onclick="markAllStatus('Absent')">Mark All Absent</button>
          ${canUseBothSessionsShortcut() ? `
            <label style="font-size:0.78rem; color:var(--ink-soft); display:flex; align-items:center; gap:6px; margin-left:8px;" title="Saves the same status to both Morning and Afternoon in one go — handy for backfilling past dates.">
              <input type="checkbox" ${attApplyBothSessions?'checked':''} onchange="toggleAttBothSessions(this.checked); renderAttendanceBody();"> Apply to both sessions
            </label>
          ` : ''}
        </div>
      </div>
      ${isHoliday ? (() => { const h = holidayFor(attMarkDate); return `<div class="empty-state" style="margin-bottom:16px;"><b>${h.name || 'Holiday'} — school is closed on ${attMarkDate}</b>Attendance isn't taken on a holiday. Pick a working day above, or ${h.auto ? 'adjust it under Attendance → Settings → Working Days' : 'remove the holiday first'} if this date shouldn't be one.</div>`; })() : ``}
      <div class="table-wrap" style="${isHoliday ? 'opacity:0.5; pointer-events:none;' : ''}">
        <table><thead><tr><th>Roll No</th><th>Student</th><th>Admission No</th><th>Status</th></tr></thead>
        <tbody>
        ${list.map(s => `
          <tr>
            <td class="id-cell">${s.rollNo||'—'}</td>
            <td class="name-cell">${s.firstName} ${s.lastName}</td>
            <td class="id-cell">${s.admissionNo}</td>
            <td>
              <div class="att-status-row">
                ${['Present','Absent','Late','Leave'].map(st => `<button type="button" class="att-status-btn ${pendingMarks[s.id]===st?'active':''}" data-status="${st}" onclick="setAttStatus('${s.id}','${st}')">${st}</button>`).join('')}
              </div>
            </td>
          </tr>`).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No students here</b></div>` : ``}
      </div>
      <div style="margin-top:16px;"><button class="btn btn-primary" ${isHoliday?'disabled':''} onclick="saveAttendance()">Save Attendance${attApplyBothSessions ? ' (Morning &amp; Afternoon)' : ' (' + attMarkSession + ')'}</button></div>
    `;
  }

  function changeAttDate(val){
    attMarkDate = val;
    pendingMarks = {};
    renderAttendanceBody();
  }
  function changeAttSession(val){
    attMarkSession = val;
    pendingMarks = {};
    renderAttendanceBody();
  }
  function setAttStatus(studentId, status){
    pendingMarks[studentId] = status;
    renderAttendanceBody();
  }
  function markAllStatus(status){
    students.filter(s => s.className===attCurrentClass && s.section===attCurrentSection && isActive(s)).forEach(s => {
      pendingMarks[s.id] = status;
    });
    renderAttendanceBody();
  }
  async function saveAttendance(){
    await ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData);
    if(holidayFor(attMarkDate)){ showToast("Attendance isn't taken on a holiday."); return; }
    // "Apply to both sessions" (Admin/Office Assistant only — see
    // canUseBothSessionsShortcut) writes the same status into both Morning
    // and Afternoon records in one save, instead of requiring the whole
    // roster to be re-marked twice just to record "present all day."
    const sessionsToSave = (attApplyBothSessions && canUseBothSessionsShortcut()) ? ATT_SESSIONS : [attMarkSession];
    Object.keys(pendingMarks).forEach(studentId => {
      const status = pendingMarks[studentId];
      sessionsToSave.forEach(session => {
        let rec = attendanceRecords.find(r => r.studentId===studentId && r.date===attMarkDate && r.session===session);
        if(rec){ rec.status = status; }
        else { attendanceRecords.push({ id:'att_'+studentId+'_'+attMarkDate+'_'+session, studentId, date:attMarkDate, session, status }); }
      });
    });
    await storageSet(ATTENDANCE_KEY, attendanceRecords);
    showToast('Attendance saved for ' + attMarkDate + ' (' + sessionsToSave.join(' & ') + ').');
  }

  /* --- Stats --- */
  // Student attendance is reported in DAY-equivalents, not raw session
  // counts. attSessionWeight() weighs a sessionless (pre-two-session)
  // record as 2 "half-day units" and a Morning/Afternoon-tagged record as
  // 1 each — dividing the summed weight by 2 turns that into actual days:
  // a fully-present day (both sessions, or one legacy whole-day record)
  // comes out to 1, and a day where only one of the two sessions was
  // marked Present comes out to 0.5 — the "1/2 day" a student who only
  // attended the morning session should show, instead of the raw session
  // count (which used to read as a confusing whole "1").
  // (Staff attendance/payroll deliberately keeps its own separate raw
  // session-unit counting — see computeStaffAttendanceStats — so this
  // conversion is student-only and doesn't touch that.)
  function computeAttendanceStats(studentId, fromDate, toDate){
    let recs = attendanceRecords.filter(r => r.studentId === studentId);
    if(fromDate) recs = recs.filter(r => r.date >= fromDate);
    if(toDate) recs = recs.filter(r => r.date <= toDate);
    const sumBy = status => recs.filter(r => r.status===status).reduce((n,r) => n + attSessionWeight(r), 0) / 2;
    const present = sumBy('Present');
    const late = sumBy('Late');
    const absent = sumBy('Absent');
    const leave = sumBy('Leave');
    const total = recs.reduce((n,r) => n + attSessionWeight(r), 0) / 2;
    const attended = present + late;
    const pct = total > 0 ? Math.round((attended/total)*100) : 0;
    return { present, absent, late, leave, total, pct };
  }
  // Formats a day-equivalent attendance count for display: a whole number
  // of days shows plain ("12"), a half-day remainder shows as ".5" ("12.5")
  // rather than an ugly float — this is the literal "1/2" the count now
  // reflects when only one session of a day was marked.
  function fmtAttDays(n){
    n = Math.round((Number(n)||0) * 2) / 2; // snap away any float noise
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  /* --- Reports --- */
  function renderAttReports(body){
    const classF = document.getElementById('atClassFilter').value;
    const secF = document.getElementById('atSectionFilter').value;
    let list = students.filter(s => isActive(s));
    if(classF) list = list.filter(s => s.className===classF);
    if(secF) list = list.filter(s => s.section===secF);

    const rows = list.map(s => {
      const stats = computeAttendanceStats(s.id, atReportsFrom || undefined, atReportsTo || undefined);
      const pctClass = stats.pct >= 85 ? 'good' : stats.pct >= (attSettings.threshold||75) ? 'warn' : 'bad';
      return { s, stats, pctClass };
    }).sort((a,b) => a.stats.pct - b.stats.pct);

    body.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <label style="font-size:0.78rem; color:var(--ink-soft);">From <input type="date" class="input" style="max-width:150px;" value="${atReportsFrom}" onchange="setAttReportsRange('from', this.value)"></label>
          <label style="font-size:0.78rem; color:var(--ink-soft);">To <input type="date" class="input" style="max-width:150px;" value="${atReportsTo}" onchange="setAttReportsRange('to', this.value)"></label>
          ${(atReportsFrom || atReportsTo) ? `<button class="btn btn-ghost btn-sm" onclick="clearAttReportsRange()">Clear range</button>` : ``}
        </div>
        <div>
          <button class="btn btn-ghost btn-sm" onclick="downloadStudentAttendanceExcel()">📥 Excel</button> <button class="btn btn-ghost btn-sm" onclick="downloadStudentAttendancePDF()">📄 PDF</button>
        </div>
      </div>
      <div class="att-legend">
        <span><span class="dot2" style="background:var(--teal);"></span>Present</span>
        <span><span class="dot2" style="background:var(--gold);"></span>Late (counts as present)</span>
        <span><span class="dot2" style="background:var(--magenta);"></span>Absent</span>
        <span><span class="dot2" style="background:var(--brand-navy);"></span>Leave (counts as absent)</span>
      </div>
      <p style="font-size:0.74rem; color:var(--ink-soft); margin:-4px 0 10px;">Counts are in <b>days</b> — if only one of the two sessions (Morning/Afternoon) was marked on a given date, that date counts as half a day (shown as ".5") instead of a full day.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Student</th><th>Class</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>Total Marked</th><th>%</th></tr></thead>
        <tbody>
        ${rows.map(r => `<tr>
          <td class="name-cell">${r.s.firstName} ${r.s.lastName}</td>
          <td><span class="pill">${r.s.className} - ${r.s.section}</span></td>
          <td>${fmtAttDays(r.stats.present)}</td><td>${fmtAttDays(r.stats.absent)}</td><td>${fmtAttDays(r.stats.late)}</td><td>${fmtAttDays(r.stats.leave)}</td>
          <td>${fmtAttDays(r.stats.total)}</td>
          <td class="att-pct ${r.pctClass}">${r.stats.pct}%</td>
        </tr>`).join('')}
        </tbody></table>
        ${rows.length===0 ? `<div class="empty-state"><b>No attendance data yet</b></div>` : ``}
      </div>
    `;
  }

  /* --- Holidays --- */
  // Formats a Date object back to 'YYYY-MM-DD' using its LOCAL year/month/day
  // (not .toISOString(), which is always UTC). Holiday dates are built from
  // 'YYYY-MM-DDT00:00:00' strings with no timezone suffix, so the browser
  // parses them as local midnight — reading them back with UTC getters (what
  // .toISOString() does) silently rolls the date back a day for anyone east
  // of UTC (e.g. India, UTC+5:30). Always pair a local-parsed date with this,
  // never with .toISOString(), or the two will drift apart by a day.
  function localDateStr(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  // Groups consecutive same-named holiday rows (e.g. a 10-day Summer
  // Vacation added as a range) back into one "Jun 1 – Jun 10" display row,
  // so a multi-day break doesn't read as ten separate unrelated entries —
  // even though each day is still stored as its own row (see addHoliday),
  // which keeps every other holidayFor()/holidays.find() lookup in the app
  // working unchanged.
  function groupedHolidayRanges(){
    const sorted = holidays.slice().sort((a,b) => a.date.localeCompare(b.date));
    const groups = [];
    sorted.forEach(h => {
      const prev = groups[groups.length-1];
      const prevNextDay = prev ? new Date(prev.to + 'T00:00:00') : null;
      if(prevNextDay) prevNextDay.setDate(prevNextDay.getDate()+1);
      if(prev && prev.name === h.name && prevNextDay && localDateStr(prevNextDay) === h.date){
        prev.to = h.date;
      }else{
        groups.push({ name: h.name, from: h.date, to: h.date });
      }
    });
    return groups;
  }
  function renderHolidaysTab(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:6px; max-width:600px;">Mark non-working days so they can be excluded from attendance context. Attendance can still be recorded on these dates if needed. For a multi-day break (Dasara, Pongal, Summer Vacation), set a From and To date — every day in between is added under the same name.</p>
      <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:16px; max-width:600px;">Sundays (and any other weekday turned off under <a onclick="switchAttTab('settings')" style="cursor:pointer; color:var(--magenta); font-weight:600;">Settings → Working Days</a>) are already treated as holidays automatically — no need to add them here.</p>
      <div class="inline-add-form" style="flex-wrap:wrap;">
        <label style="font-size:0.78rem; color:var(--ink-soft); display:flex; align-items:center; gap:6px;">From <input type="date" class="input" id="newHolidayFrom" style="max-width:170px;"></label>
        <label style="font-size:0.78rem; color:var(--ink-soft); display:flex; align-items:center; gap:6px;">To <input type="date" class="input" id="newHolidayTo" style="max-width:170px;"></label>
        <input class="input" id="newHolidayName" placeholder="e.g. Dasara Break" style="max-width:220px;">
        <button class="btn btn-primary" onclick="addHoliday()">+ Add Holiday</button>
      </div>
      ${groupedHolidayRanges().map(g => `
        <div class="list-manage-row"><div><div class="lm-name">${g.name}</div><div class="lm-meta">${g.from === g.to ? g.from : g.from + ' to ' + g.to}</div></div>
        <button class="btn-danger-text" onclick="removeHolidayRange('${g.from}','${g.to}')">Remove</button></div>
      `).join('') || `<div class="empty-state"><b>No holidays added yet</b></div>`}
    `;
  }
  async function addHoliday(){
    const fromInput = document.getElementById('newHolidayFrom');
    const toInput = document.getElementById('newHolidayTo');
    const from = fromInput.value;
    const to = toInput.value || from;
    const name = document.getElementById('newHolidayName').value.trim();
    if(!from || !name) return;
    if(to < from){ showToast("The 'To' date can't be before the 'From' date."); return; }
    // A long range (e.g. an accidental year instead of a day) would silently
    // create thousands of rows — 120 days is generous enough for any real
    // school break (Summer Vacation included) while catching that mistake.
    const spanDays = Math.round((new Date(to+'T00:00:00') - new Date(from+'T00:00:00')) / 86400000) + 1;
    if(spanDays > 120){ showToast('That range is ' + spanDays + ' days — double-check the From/To dates.'); return; }
    const dates = [];
    // Bug fix: `d` here is parsed in the browser's LOCAL timezone (no 'Z'
    // suffix on the time), but d.toISOString() always serializes in UTC —
    // for anyone east of UTC (e.g. India, UTC+5:30) that silently rolled
    // every date back by one day (Sun 4th stored as Sat/Sun-shifted 3rd). A
    // multi-day range still looked "about right" since the whole span
    // shifted together, but a single day landed on the wrong date outright.
    // localDateStr reads the same Date object back with LOCAL getters
    // instead, so it round-trips to exactly the date that was picked.
    for(let d = new Date(from+'T00:00:00'); d <= new Date(to+'T00:00:00'); d.setDate(d.getDate()+1)){
      dates.push(localDateStr(d));
    }
    dates.forEach(date => {
      holidays = holidays.filter(h => h.date !== date);
      holidays.push({ id: date, date, name });
    });
    await storageSet(HOLIDAYS_KEY, holidays);
    renderHolidaysTab(document.getElementById('attendanceBody'));
    showToast(dates.length > 1 ? `Holiday added for ${dates.length} days.` : 'Holiday added.', 'burst');
  }
  async function removeHolidayRange(from, to){
    holidays = holidays.filter(h => h.date < from || h.date > to);
    await storageSet(HOLIDAYS_KEY, holidays);
    renderHolidaysTab(document.getElementById('attendanceBody'));
  }
  /* --- Settings --- */
  function renderAttSettingsTab(body){
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    body.innerHTML = `
      <div class="profile-card" style="max-width:420px;">
        <h4>Attendance Settings</h4>
        <div class="f-field" style="margin-bottom:14px;"><label>Low Attendance Threshold (%)</label><input type="number" min="0" max="100" class="input" id="atThreshold" value="${attSettings.threshold||75}" style="width:100%;"></div>
        <div class="f-field" style="margin-bottom:16px;">
          <label>Working Days</label>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
            ${days.map((d,i) => `<label style="display:flex; align-items:center; gap:4px; font-size:0.82rem;"><input type="checkbox" class="atWorkDay" value="${i}" ${attSettings.workingDays.includes(i)?'checked':''}> ${d}</label>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveAttSettings()">Save Settings</button>
      </div>
    `;
  }
  async function saveAttSettings(){
    const threshold = Number(document.getElementById('atThreshold').value) || 75;
    const workingDays = Array.from(document.querySelectorAll('.atWorkDay:checked')).map(el => Number(el.value));
    attSettings = { threshold, workingDays };
    await storageSet(ATT_SETTINGS_KEY, attSettings);
    showToast('Attendance settings saved.', 'burst');
  }

  /* --- Low Attendance + Notify (reuses Fee Defaulters' Notify modal) --- */
  function computeLowAttendance(){
    const threshold = Number(attSettings.threshold) || 75;
    const list = [];
    students.filter(s => isActive(s)).forEach(s => {
      const stats = computeAttendanceStats(s.id);
      if(stats.total > 0 && stats.pct < threshold){
        list.push({ student: s, stats, parentPhone: s.fatherPhone || s.motherPhone || s.guardianPhone || '' });
      }
    });
    return list;
  }
  let lowAttFilters = { className:'', section:'', name:'', phone:'' };

  function renderLowAttendanceTab(body){
    // Same Class-Teacher-only scoping as the rest of the Attendance module
    // — see myTeacherScope() — so a Teacher can't browse low-attendance
    // students outside their own homeroom class via this tab's own filter.
    const scope = myTeacherScope();
    if(scope && scope.classTeacherOf){ lowAttFilters.className = scope.classTeacherOf.className; lowAttFilters.section = scope.classTeacherOf.section; }
    let list = scope && !scope.classTeacherOf ? [] : computeLowAttendance();
    if(lowAttFilters.className) list = list.filter(d => d.student.className===lowAttFilters.className);
    if(lowAttFilters.section) list = list.filter(d => d.student.section===lowAttFilters.section);
    if(lowAttFilters.name) list = list.filter(d => (d.student.firstName+' '+d.student.lastName).toLowerCase().includes(lowAttFilters.name.toLowerCase()));
    if(lowAttFilters.phone) list = list.filter(d => (d.parentPhone||'').includes(lowAttFilters.phone));
    list.sort((a,b) => a.stats.pct - b.stats.pct);

    body.innerHTML = `
      <div class="fee-summary-row">
        <div class="fee-sum-card"><b>${list.length}</b><span>Below ${attSettings.threshold||75}% Attendance</span></div>
      </div>
      <div class="ms-toolbar">
        <div class="ms-toolbar-left">
          <select id="laClass" onchange="onLowAttFilterChange()" ${scope?'disabled':''}>${scope ? '' : '<option value="">All Classes</option>'}${CLASS_LEVELS.filter(c => !scope || c===lowAttFilters.className).map(c=>`<option ${lowAttFilters.className===c?'selected':''}>${c}</option>`).join('')}</select>
          <select id="laSection" onchange="onLowAttFilterChange()" ${scope?'disabled':''}>${scope ? '' : '<option value="">All Sections</option>'}${SECTIONS.filter(s => !scope || s===lowAttFilters.section).map(s => `<option value="${s}" ${lowAttFilters.section===s?'selected':''}>Section ${s}</option>`).join('')}</select>
          <input class="input" id="laName" placeholder="Search name..." value="${lowAttFilters.name}" oninput="onLowAttFilterChange()">
          <input class="input" id="laPhone" placeholder="Parent phone..." value="${lowAttFilters.phone}" oninput="onLowAttFilterChange()">
        </div>
      </div>
      <div class="notify-scope-bar">
        <button class="btn btn-ghost btn-sm" onclick="openAttNotifyModal('all')">Notify All Below Threshold</button>
        <button class="btn btn-ghost btn-sm" onclick="downloadLowAttendanceExcel()">📥 Excel</button>
        <button class="btn btn-ghost btn-sm" onclick="downloadLowAttendancePDF()">📄 PDF</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Student</th><th>Class</th><th>Parent Phone</th><th>Present</th><th>Absent</th><th>%</th><th></th></tr></thead>
        <tbody>
        ${list.map(d => `<tr>
          <td class="name-cell">${d.student.firstName} ${d.student.lastName}</td>
          <td><span class="pill">${d.student.className} - ${d.student.section}</span></td>
          <td>${d.parentPhone||'—'}</td>
          <td>${fmtAttDays(d.stats.present)}</td><td>${fmtAttDays(d.stats.absent)}</td>
          <td class="att-pct bad">${d.stats.pct}%</td>
          <td><button class="btn-edit-text" onclick="openAttNotifyModal('single','${d.student.id}')">Notify</button></td>
        </tr>`).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No students below the threshold</b></div>` : ``}
      </div>
    `;
  }
  function lowAttendanceReportRows(){
    let list = computeLowAttendance();
    if(lowAttFilters.className) list = list.filter(d => d.student.className===lowAttFilters.className);
    if(lowAttFilters.section) list = list.filter(d => d.student.section===lowAttFilters.section);
    if(lowAttFilters.name) list = list.filter(d => (d.student.firstName+' '+d.student.lastName).toLowerCase().includes(lowAttFilters.name.toLowerCase()));
    if(lowAttFilters.phone) list = list.filter(d => (d.parentPhone||'').includes(lowAttFilters.phone));
    list.sort((a,b) => a.stats.pct - b.stats.pct);
    return list.map(d => ({
      'Student': d.student.firstName+' '+d.student.lastName, 'Class': d.student.className+' - '+d.student.section,
      'Parent Phone': d.parentPhone||'', 'Present': d.stats.present, 'Absent': d.stats.absent, '%': d.stats.pct,
    }));
  }
  function downloadLowAttendanceExcel(){ exportRowsToExcel('low_attendance.xlsx', 'Low Attendance', lowAttendanceReportRows()); }
  function downloadLowAttendancePDF(){ exportRowsToPDF('Low Attendance Report', 'Below '+(attSettings.threshold||75)+'%', lowAttendanceReportRows()); }
  function onLowAttFilterChange(){
    lowAttFilters = {
      className: document.getElementById('laClass').value,
      section: document.getElementById('laSection').value,
      name: document.getElementById('laName').value,
      phone: document.getElementById('laPhone').value,
    };
    renderLowAttendanceTab(document.getElementById('attendanceBody'));
  }
  function openAttNotifyModal(scope, singleId){
    let list = computeLowAttendance();
    if(scope === 'single') list = list.filter(d => d.student.id === singleId);
    const body = document.getElementById('notifyModalBody');
    body.innerHTML = list.map(d => {
      const msg = encodeURIComponent(`Dear Parent, this is to inform you that ${d.student.firstName} ${d.student.lastName} (${d.student.className} - Section ${d.student.section}) currently has ${d.stats.pct}% attendance, which is below the school's required ${attSettings.threshold||75}%. Kindly ensure regular attendance. Thank you — ${schoolInfo.name||'the school'}.`);
      const phone = (d.parentPhone||'').replace(/\D/g,'');
      const link = phone ? `https://wa.me/91${phone}?text=${msg}` : '';
      return `<div class="list-manage-row">
        <div><div class="lm-name">${d.student.firstName} ${d.student.lastName}</div><div class="lm-meta">${d.parentPhone||'No phone on file'} · ${d.stats.pct}% attendance</div></div>
        ${link ? `<a href="${link}" target="_blank" class="btn btn-primary btn-sm">Send WhatsApp</a>` : `<span style="font-size:0.78rem; color:var(--ink-soft);">No phone</span>`}
      </div>`;
    }).join('') || `<div class="empty-state"><b>No matching students</b></div>`;
    document.getElementById('notifyModalOverlay').classList.add('open');
  }

  /* --- Attendance search-as-you-type --- */
  let attSearchDebounce = null;
  function onAttSearchInput(){
    clearTimeout(attSearchDebounce);
    attSearchDebounce = setTimeout(() => {
      renderAttSuggestions(document.getElementById('atSearch').value.trim());
    }, 150);
  }
  function renderAttSuggestions(q){
    const box = document.getElementById('attSearchSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => (s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql) || (s.admissionNo||'').toLowerCase().includes(ql)).slice(0,8);
    if(matches.length===0){ box.innerHTML = `<div class="sg-empty">No students match "${q}"</div>`; box.classList.add('open'); return; }
    box.innerHTML = matches.map(s => `<div class="sg-item" onmousedown="selectAttSuggestion('${s.id}')">
      <div class="sg-avatar">${s.photo?`<img src="${s.photo}">`:initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('');
    box.classList.add('open');
  }
  function selectAttSuggestion(id){
    hideAttSuggestions();
    const s = students.find(x => x.id === id);
    document.getElementById('atSearch').value = '';
    if(s){
      document.getElementById('atClassFilter').value = s.className;
      document.getElementById('atSectionFilter').value = s.section;
    }
    switchAttTab('reports');
  }
  function hideAttSuggestions(){
    const box = document.getElementById('attSearchSuggestions');
    if(box) box.classList.remove('open');
  }

  /* ===== EXAMS MODULE ===== */
  const EXAM_DEFS_KEY = "exam-defs";
  const EXAM_RESULTS_KEY = "exam-results";
  API_BACKED_KEYS[EXAM_DEFS_KEY] = '/api/exam-defs';
  API_BACKED_KEYS[EXAM_RESULTS_KEY] = '/api/exam-results';
  const GRADING_SCALE_KEY = "grading-scale";
  const EXAM_TYPES_KEY = "exam-types";
  const EXAM_GROUPS_KEY = "exam-groups";
  const CONSOLIDATION_SCALE_KEY = "consolidation-scale";
  // Consolidation Schemes replace the old flat "each Exam Type carries its own
  // weight%" model. A Scheme is a fully wizard-built, versioned formula (see
  // the Year-End → Consolidation Schemes UI) — Exam Types themselves no longer
  // carry weight/includeInAnnual; a Scheme's buckets reference Exam Types by id
  // and decide the weight and combination method. yearEndRecords holds the
  // frozen, never-recomputed snapshot for each student once their Year-End
  // result is explicitly "Finalized & Issued" — a later edit to a scheme can
  // never silently alter an already-issued marksheet.
  const CONSOL_SCHEMES_KEY = "consol-schemes";
  const YEAR_END_RECORDS_KEY = "year-end-records";
  const YEAR_END_PRINT_CFG_KEY = "year-end-print-config";
  [GRADING_SCALE_KEY, EXAM_TYPES_KEY, EXAM_GROUPS_KEY, CONSOLIDATION_SCALE_KEY, CONSOL_SCHEMES_KEY, YEAR_END_RECORDS_KEY, YEAR_END_PRINT_CFG_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });

  let examDefs = [], examResults = [], gradingScale = [], examTypes = [], examGroups = [], consolidationScale = [];
  let consolSchemes = [], yearEndRecords = [];
  let yearEndPrintConfig = { orientation:'portrait', pageSize:'A4', compact:false };

  async function loadExams(){
    examDefs = await storageGet(EXAM_DEFS_KEY, []);
    examTypes = await storageGet(EXAM_TYPES_KEY, ['Unit Test 1','Unit Test 2','Quarterly Exam','Half Yearly Exam','Annual Exam']);
    // Exam types used to be plain strings, then briefly carried their own
    // weight%/includeInAnnual (now superseded by Consolidation Schemes — see
    // above). Both old shapes are migrated in place, once, into a plain
    // definition object (kind + which classes it's offered to) so nothing that
    // depends on `exam.examType` matching a type *name* breaks — the name is
    // preserved exactly, only the wrapper around it changes. The legacy
    // weight/includeInAnnual fields are simply dropped; they're no longer read
    // anywhere.
    let typesMigrated = false;
    examTypes = examTypes.map(t => {
      if(typeof t === 'string'){
        typesMigrated = true;
        return { id: 'etype_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name: t, group:'other', scopeClasses:[] };
      }
      if(t && (Object.prototype.hasOwnProperty.call(t,'weightPercent') || Object.prototype.hasOwnProperty.call(t,'includeInAnnual'))){
        typesMigrated = true;
        const { weightPercent, includeInAnnual, ...rest } = t;
        return rest;
      }
      return t;
    });
    if(typesMigrated) await storageSet(EXAM_TYPES_KEY, examTypes);
    examGroups = await storageGet(EXAM_GROUPS_KEY, []);
    consolSchemes = await storageGet(CONSOL_SCHEMES_KEY, []);
    yearEndPrintConfig = await storageGet(YEAR_END_PRINT_CFG_KEY, { orientation:'portrait', pageSize:'A4', compact:false });
    consolidationScale = await storageGet(CONSOLIDATION_SCALE_KEY, [
      {grade:'A1', minPct:91, maxPct:100},
      {grade:'A2', minPct:81, maxPct:90},
      {grade:'B1', minPct:71, maxPct:80},
      {grade:'B2', minPct:61, maxPct:70},
      {grade:'C1', minPct:51, maxPct:60},
      {grade:'C2', minPct:41, maxPct:50},
      {grade:'D',  minPct:33, maxPct:40},
      {grade:'E',  minPct:0,  maxPct:32},
    ]);
    gradingScale = await storageGet(GRADING_SCALE_KEY, [
      {grade:'A1', minPct:91, maxPct:100},
      {grade:'A2', minPct:81, maxPct:90},
      {grade:'B1', minPct:71, maxPct:80},
      {grade:'B2', minPct:61, maxPct:70},
      {grade:'C1', minPct:51, maxPct:60},
      {grade:'C2', minPct:41, maxPct:50},
      {grade:'D',  minPct:33, maxPct:40},
      {grade:'E',  minPct:0,  maxPct:32},
    ]);
  }
  // examResults is large and ever-growing (one row per student per subject
  // per exam) — loaded lazily on first actual use instead of at login. See
  // ensureDataLoaded(). Read from the Exams/Results tab, report card and
  // admit card generation, and the Staff Activity dashboard's marks-entry
  // tracker — each guards independently.
  async function loadExamResultsData(){
    examResults = await storageGet(EXAM_RESULTS_KEY, []);
  }
  async function loadYearEndRecordsData(){
    yearEndRecords = await storageGet(YEAR_END_RECORDS_KEY, []);
  }

  /* ===== ROOM ALLOTMENT MODULE (exam room master list + hall ticket numbers) ===== */
  