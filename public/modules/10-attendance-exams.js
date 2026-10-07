const ROOMS_KEY = "exam-rooms";
  const EXAM_HALL_TICKETS_KEY = "exam-hall-tickets";
  const EXAM_ROOM_CONFIG_KEY = "exam-room-config";
  API_BACKED_KEYS[ROOMS_KEY] = '/api/rooms';
  API_BACKED_KEYS[EXAM_HALL_TICKETS_KEY] = '/api/exam-hall-tickets';
  API_BACKED_KEYS[EXAM_ROOM_CONFIG_KEY] = '/api/exam-room-config';
  let rooms = [];
  let examHallTickets = [];
  let examRoomConfigs = []; // one record per exam: { id: examId, selectedClasses, orientation, pageSize }
  async function loadRooms(){
    rooms = await storageGet(ROOMS_KEY, []);
  }
  async function loadExamHallTickets(){
    examHallTickets = await storageGet(EXAM_HALL_TICKETS_KEY, []);
  }
  async function loadExamRoomConfigs(){
    examRoomConfigs = await storageGet(EXAM_ROOM_CONFIG_KEY, []);
  }

  function classSecKey(className, section){
    return className + '||' + section;
  }
  function getExamSubjects(exam, className, section){
    if(!exam) return [];
    exam.classSubjects = exam.classSubjects || {};
    return exam.classSubjects[classSecKey(className, section)] || exam.subjects || [];
  }
  function examTypeByName(name){
    return examTypes.find(t => t.name === name);
  }
  // Empty scopeClasses means "every class" (the default for ordinary exam
  // types) — only an explicit, non-empty list narrows it, which is how
  // something like Prefinals gets locked to 10th Class only.
  function classAllowedForExamType(typeName, className){
    const type = examTypeByName(typeName);
    if(!type || !type.scopeClasses || type.scopeClasses.length === 0) return true;
    return type.scopeClasses.includes(className);
  }
  function classLevelsForExamType(typeName){
    const type = examTypeByName(typeName);
    if(!type || !type.scopeClasses || type.scopeClasses.length === 0) return CLASS_LEVELS;
    return CLASS_LEVELS.filter(c => type.scopeClasses.includes(c));
  }
  // --- Narrowing the Staff picker in the exam Subject modal to the teachers who
  // actually deal with a given class, using the master Subjects catalog
  // (Manage Subjects) as the source of truth, so admins aren't scrolling the
  // whole staff list to find the right teacher for every single subject.
  function classDealingStaffIds(className){
    const ids = new Set();
    subjectsList.filter(s => s.className === className).forEach(s => (s.staffIds||[]).forEach(id => ids.add(id)));
    return ids;
  }
  // If `name` matches a master-subject name for this class, its own assigned
  // staff is the most precise match; otherwise null (not "unmatched but empty").
  function masterSubjectStaffIds(className, name){
    const match = subjectsList.find(s => s.className === className && s.name.trim().toLowerCase() === String(name||'').trim().toLowerCase());
    return match ? (match.staffIds || []) : null;
  }
  // Picks the narrowest useful staff pool for this class/subject: that exact
  // subject's own teachers if the name matches a master-subject record, else
  // anyone who teaches this class at all, else (no master-subject data yet)
  // everyone — label is null in that last case, meaning "nothing to narrow by".
  function examSubjStaffCandidates(className, name){
    const bySubject = masterSubjectStaffIds(className, name);
    if(bySubject && bySubject.length) return { ids: bySubject, label: `teachers assigned to "${name}" in ${className}` };
    const byClass = classDealingStaffIds(className);
    if(byClass.size) return { ids: Array.from(byClass), label: `teachers who teach ${className}` };
    return { ids: staffList.map(s => s.id), label: null };
  }
  // A class's own start/end for THIS exam, derived from whatever subject
  // dates have actually been set for it (across its sections) — not a
  // separate stored field, so it can never drift out of sync with the real
  // per-subject schedule. This is what lets two classes sit on the same
  // "Formative Assessment 1" exam but start on different calendar days.
  function classExamDateRange(exam, className){
    const dates = [];
    SECTIONS.forEach(sec => getExamSubjects(exam, className, sec).forEach(s => { if(s.date) dates.push(s.date); }));
    if(dates.length === 0) return null;
    dates.sort();
    return { start: dates[0], end: dates[dates.length-1] };
  }

  // A report template can carry its own explicit signature image (uploaded once,
  // used for every student it prints) — but when it doesn't, fall back to the
  // real Class Teacher's own uploaded signature (via classTeacherClass/Section on
  // their Staff Profile) and the school's Principal/Correspondent signature, so
  // reports don't need to be signed by hand at all.
  function classTeacherSignatureFor(className, section){
    const teacher = staffList.find(st => st.classTeacherClass===className && st.classTeacherSection===section && isActive(st));
    return teacher ? (teacher.signature||'') : '';
  }
  function resolveReportSignature1(t, s){
    return (t && t.sigImage1) ? t.sigImage1 : classTeacherSignatureFor(s.className, s.section);
  }
  function resolveReportSignature2(t){
    return (t && t.sigImage2) ? t.sigImage2 : (schoolInfo.principalSignature || '');
  }

  let examTab = 'exams';
  let examMarksView = 'grid';
  let examCurrentClass = '', examCurrentSection = '', examCurrentExamId = '';
  let examSubjView = 'list';
  let resultsFilters = { examId:'', className:'', section:'' };

  const EXAMS_TAB_PERM_KEYS = { exams:'exams_definitions', marks:'exams_marks', entrystatus:'exams_entrystatus', results:'exams_results', holidays:'exams_holidays' };
  function initExamsView(){
    document.getElementById('exAyBadge').textContent = 'AY ' + currentAcademicYearValue;
    const accessibleTabs = Object.keys(EXAMS_TAB_PERM_KEYS).filter(t => getExamsTabAccess(currentUser.role, EXAMS_TAB_PERM_KEYS[t]));
    Object.keys(EXAMS_TAB_PERM_KEYS).forEach(t => { const btn = document.getElementById('extab-'+t); if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none'; });
    if(!accessibleTabs.includes(examTab)) examTab = accessibleTabs[0] || 'exams';
    switchExamTab(examTab);
  }

  function switchExamTab(tab){
    examTab = tab;
    ['exams','marks','entrystatus','results','holidays'].forEach(t => {
      const el = document.getElementById('extab-'+t);
      if(el) el.classList.toggle('active', t===tab);
    });
    if(tab === 'marks') examMarksView = 'grid';
    if(tab === 'exams') examSubjView = 'list';
    renderExamBody();
  }

  async function renderExamBody(){
    // Marks entry, entry-status and results tabs all read examResults.
    await ensureDataLoaded('examResults', loadExamResultsData);
    const body = document.getElementById('examBody');
    if(!body) return;
    if(!getExamsTabAccess(currentUser.role, EXAMS_TAB_PERM_KEYS[examTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(examTab === 'exams'){
      if(examSubjView === 'list') return renderExamsListTab(body);
      if(examSubjView === 'grid') return renderSubjConfigGrid(body);
      if(examSubjView === 'editor') return renderSubjConfigEditor(body);
    }
    if(examTab === 'marks'){
      if(examMarksView === 'grid') return renderMarksClassGrid(body);
      if(examMarksView === 'sheet') return renderMarksSheet(body);
    }
    if(examTab === 'entrystatus') return renderMarksEntryStatusTab(body);
    if(examTab === 'results') return renderResultsSummaryTab(body);
    if(examTab === 'holidays') return renderExamHolidaysTab(body);
  }

  /* --- Marks Entry Status: which classes/sections/students have marks entered --- */
  let meStatusExamId = '';
  function renderMarksEntryStatusTab(body){
    if(examDefs.length === 0){ body.innerHTML = `<div class="empty-state"><b>No exams yet</b></div>`; return; }
    if(!meStatusExamId || !examDefs.find(e => e.id === meStatusExamId)) meStatusExamId = examDefs[0].id;
    const exam = examDefs.find(e => e.id === meStatusExamId);
    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${meStatusExamId===ex.id?'selected':''}>${ex.name}</option>`).join('');
    const scope = myTeacherScope();
    const rows = [];
    classLevelsForExamType(exam && exam.examType).forEach(cls => {
      SECTIONS.forEach(sec => {
        if(scope && !scope.subjectSections.some(ss => ss.className===cls && ss.section===sec)) return;
        let subjects = getExamSubjects(exam, cls, sec);
        if(scope){
          const mySubjectNames = new Set(scope.subjectSections.filter(ss => ss.className===cls && ss.section===sec).map(ss => ss.subject));
          subjects = subjects.filter(s => mySubjectNames.has(s.name));
        }
        if(subjects.length === 0) return;
        const list = students.filter(s => s.className===cls && s.section===sec && isActive(s));
        if(list.length === 0) return;
        const entered = list.filter(s => subjects.every(subj => examResults.find(r => r.examId===exam.id && r.studentId===s.id && r.subject===subj.name))).length;
        rows.push({ cls, sec, total: list.length, entered, subjects: subjects.length, students: list });
      });
    });
    body.innerHTML = `
      <div class="f-field" style="max-width:320px; margin-bottom:20px;">
        <label>Exam</label>
        <select id="meStatusExamSelect" onchange="meStatusExamId=this.value; renderExamBody();">${examOptions}</select>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Class</th><th>Section</th><th>Subjects</th><th>Students</th><th>Marks Entered</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${rows.map((r,i) => `
          <tr>
            <td>${r.cls}</td><td><span class="pill">Section ${r.sec}</span></td><td>${r.subjects}</td><td>${r.total}</td>
            <td>${r.entered} / ${r.total}</td>
            <td>${r.entered===r.total ? '<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Complete</span>' : r.entered===0 ? '<span class="balance-tag due">Not started</span>' : '<span class="pill" style="background:rgba(203,154,46,0.18); color:#8a6a1f;">In progress</span>'}</td>
            <td><button class="btn-edit-text" onclick="toggleEntryStatusDetail(${i})">View Students</button>&nbsp;·&nbsp;<button class="btn-edit-text" onclick="jumpToMarksEntry('${r.cls}','${r.sec}')">Enter Marks</button></td>
          </tr>
          <tr id="meDetail-${i}" style="display:none;"><td colspan="7">
            <div class="table-wrap" style="margin:6px 0 12px;">
              <table><thead><tr><th>Student</th><th>Status</th></tr></thead><tbody>
              ${r.students.map(s => {
                const subjects = getExamSubjects(exam, r.cls, r.sec);
                const done = subjects.every(subj => examResults.find(x => x.examId===exam.id && x.studentId===s.id && x.subject===subj.name));
                return `<tr><td>${s.firstName} ${s.lastName}</td><td>${done ? '<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Entered</span>' : '<span class="balance-tag due">Pending</span>'}</td></tr>`;
              }).join('')}
              </tbody></table>
            </div>
          </td></tr>
        `).join('')}
        </tbody></table>
        ${rows.length===0 ? `<div class="empty-state"><b>No subjects configured for this exam yet</b>Set up subjects for a class under the "Exams" tab first.</div>` : ``}
      </div>
    `;
  }
  function toggleEntryStatusDetail(i){
    const row = document.getElementById('meDetail-'+i);
    if(row) row.style.display = row.style.display==='none' ? 'table-row' : 'none';
  }
  function jumpToMarksEntry(cls, sec){
    examCurrentExamId = meStatusExamId;
    examCurrentClass = cls; examCurrentSection = sec;
    switchExamTab('marks');
    examMarksView = 'sheet';
    renderExamBody();
  }

  /* --- Result module (Admit Cards, Progress Reports, Consolidated, Grading Scale, Templates) --- */
  let resultTab = 'admitcards';
  const RESULT_TAB_PERM_KEYS = { admitcards:'result_admitcards', roomallotment:'result_roomallotment', progress:'result_progress', consolidated:'result_consolidated', yearend:'result_yearend', examtemplates:'result_examtemplates', grading:'result_grading', templates:'result_templates' };
  const RESULT_TABS = ['admitcards','roomallotment','progress','consolidated','yearend','examtemplates','grading','templates'];
  function initResultView(){
    document.getElementById('resAyBadge').textContent = 'AY ' + currentAcademicYearValue;
    const accessibleTabs = RESULT_TABS.filter(t => getResultTabAccess(currentUser.role, RESULT_TAB_PERM_KEYS[t]));
    RESULT_TABS.forEach(t => {
      const btn = document.getElementById('restab-'+t);
      if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none';
    });
    if(!accessibleTabs.includes(resultTab)) resultTab = accessibleTabs[0] || 'admitcards';
    switchResultTab(resultTab);
  }
  function switchResultTab(tab){
    resultTab = tab;
    RESULT_TABS.forEach(t => {
      const btn = document.getElementById('restab-'+t);
      if(btn) btn.classList.toggle('active', t===tab);
    });
    if(tab === 'admitcards') admitCardsView = 'grid';
    renderResultBody();
  }
  async function renderResultBody(){
    // Report Card / Consolidated tabs read examResults (marks) and
    // attendanceRecords (the attendance summary on a report card); Year-End
    // additionally reads yearEndRecords (frozen Finalized & Issued snapshots).
    await Promise.all([
      ensureDataLoaded('examResults', loadExamResultsData),
      ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData),
      ensureDataLoaded('yearEndRecords', loadYearEndRecordsData),
    ]);
    const body = document.getElementById('resultBody');
    if(!body) return;
    if(!getResultTabAccess(currentUser.role, RESULT_TAB_PERM_KEYS[resultTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(resultTab === 'admitcards'){
      if(admitCardsView === 'grid') return renderAdmitCardsGrid(body);
      if(admitCardsView === 'roster') return renderAdmitCardsRoster(body);
    }
    if(resultTab === 'roomallotment') return renderRoomAllotmentTab(body);
    if(resultTab === 'progress') return renderReportCardsTab(body);
    if(resultTab === 'consolidated') return renderConsolidatedTab(body);
    if(resultTab === 'yearend') return renderYearEndTab(body);
    if(resultTab === 'examtemplates') return renderExamTemplatesTab(body);
    if(resultTab === 'grading') return renderGradingScaleTab(body);
    if(resultTab === 'templates') return renderReportTemplatesTab(body);
  }

  /* --- Exam Holidays --- */
  const EXAM_HOLIDAYS_KEY = "exam-holidays";
  OBJECT_BACKED_KEYS[EXAM_HOLIDAYS_KEY] = '/api/kv/' + EXAM_HOLIDAYS_KEY;
  const HOLIDAY_TYPES = {
    'Public Holiday': { bg:'rgba(24,143,134,0.15)', fg:'#0f6a63' },
    'National Holiday': { bg:'rgba(209,16,115,0.13)', fg:'var(--magenta)' },
    'Festival': { bg:'rgba(107,79,160,0.15)', fg:'#6b4fa0' },
    'Religious': { bg:'rgba(203,154,46,0.18)', fg:'#8a6a1f' },
    'Custom': { bg:'rgba(0,0,0,0.06)', fg:'var(--ink-soft)' },
  };
  let examHolidays = [];
  async function loadExamHolidays(){
    examHolidays = await storageGet(EXAM_HOLIDAYS_KEY, []);
  }
  function holidayBadge(type){
    const c = HOLIDAY_TYPES[type] || HOLIDAY_TYPES['Custom'];
    return `<span class="pill" style="background:${c.bg}; color:${c.fg};">${type}</span>`;
  }
  function renderExamHolidaysTab(body){
    const sorted = examHolidays.slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const counts = {};
    Object.keys(HOLIDAY_TYPES).forEach(t => counts[t] = 0);
    examHolidays.forEach(h => { const t = h.type||'Custom'; counts[t] = (counts[t]||0)+1; });
    const canCreateHol = canSub('exams_holidays','exams','create');
    const canDeleteHol = canSub('exams_holidays','exams','delete');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:600px;">
        Mark holidays that fall during exam season — helpful when scheduling subject dates so you don't accidentally book a paper on a day off.
      </p>
      ${canCreateHol ? `<div class="form-grid" style="max-width:640px; margin-bottom:12px;">
        <div class="f-field"><label>Date</label><input type="date" id="newHolidayDate"></div>
        <div class="f-field"><label>Name</label><input type="text" id="newHolidayName" placeholder="e.g. Independence Day"></div>
        <div class="f-field"><label>Type</label>
          <select id="newHolidayType">${Object.keys(HOLIDAY_TYPES).map(t => `<option>${t}</option>`).join('')}</select>
        </div>
        <div class="f-field full"><label>Note</label><input type="text" id="newHolidayNote" placeholder="Optional"></div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-bottom:20px;" onclick="addExamHoliday()">+ Add Holiday</button>` : ''}
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px; font-size:0.85rem;">
        <b>Total: ${examHolidays.length} holiday${examHolidays.length===1?'':'s'}</b>
        ${Object.keys(HOLIDAY_TYPES).map(t => `${holidayBadge(t)} <span style="color:var(--ink-soft); margin-right:8px;">${counts[t]}</span>`).join('')}
      </div>
      <div class="table-wrap" style="max-width:760px;">
        <table><thead><tr><th>Holiday</th><th>Date</th><th>Type</th><th>Note</th><th></th></tr></thead>
        <tbody>
        ${sorted.length ? sorted.map(h => `<tr><td class="name-cell">${h.name}</td><td>${h.date}</td><td>${holidayBadge(h.type||'Custom')}</td><td>${h.note||'—'}</td><td>${canDeleteHol ? `<button class="btn-danger-text" onclick="removeExamHoliday('${h.date}','${h.name.replace(/'/g,"\\'")}')">Remove</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><b>No holidays added yet</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  async function addExamHoliday(){
    const date = document.getElementById('newHolidayDate').value;
    const name = document.getElementById('newHolidayName').value.trim();
    const type = document.getElementById('newHolidayType').value;
    const note = document.getElementById('newHolidayNote').value.trim();
    if(!date || !name){ showToast('Enter both a date and a name.'); return; }
    examHolidays.push({ date, name, type, note });
    await storageSet(EXAM_HOLIDAYS_KEY, examHolidays);
    renderExamHolidaysTab(document.getElementById('examBody'));
    showToast('Holiday added.', 'burst');
  }
  async function removeExamHoliday(date, name){
    examHolidays = examHolidays.filter(h => !(h.date===date && h.name===name));
    await storageSet(EXAM_HOLIDAYS_KEY, examHolidays);
    renderExamHolidaysTab(document.getElementById('examBody'));
  }


  /* --- Tab: Exams list + Exam Types + Subject configuration --- */
  function renderExamsListTab(body){
    const canCreate = canSub('exams_definitions','exams','create');
    const canEdit = canSub('exams_definitions','exams','edit');
    const canDelete = canSub('exams_definitions','exams','delete');
    const groupBadge = (g) => {
      const map = { formative:['Formative','rgba(46,111,158,0.14)','#2E6F9E'], summative:['Summative','rgba(24,143,134,0.15)','#0f6a63'], internal:['Internal only','rgba(203,154,46,0.18)','#8a6a1f'], other:['Other','rgba(0,0,0,0.06)','var(--ink-soft)'] };
      const [label,bg,fg] = map[g] || map.other;
      return `<span class="pill" style="background:${bg}; color:${fg};">${label}</span>`;
    };
    body.innerHTML = `
      <div class="profile-card" style="margin-bottom:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:4px;">
          <h4 style="margin:0;">Exam Types &amp; Year-End Weightage</h4>
          ${canCreate ? `<div style="display:flex; gap:8px;">
            ${examTypes.length===0 ? `<button class="btn btn-ghost btn-sm" onclick="quickSetupExamTypes()">⚡ Quick setup (FA×4 / SA1 / SA2 / Prefinals)</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="openExamTypeModal()">+ Add Exam Type</button>
          </div>` : ''}
        </div>
        <p style="font-size:0.82rem; color:var(--ink-soft); margin:4px 0 14px; max-width:680px;">Each type says what kind of assessment it is, and — like Prefinals — which classes it's even offered to. Individual exams (FA1, FA2, SA1…) are created below and tagged with one of these types. How much each type counts toward the Year-End result is configured separately, under <a onclick="switchView('result'); setTimeout(()=>switchResultTab('yearend'),0);" style="color:var(--magenta); cursor:pointer; font-weight:600;">Manage Result → Year-End → Consolidation Schemes</a>.</p>
        <div class="table-wrap">
          <table><thead><tr><th>Type</th><th>Kind</th><th>Offered To</th><th></th></tr></thead>
          <tbody>
          ${examTypes.length ? examTypes.map(t => `
            <tr>
              <td class="name-cell">${t.name}</td>
              <td>${groupBadge(t.group)}</td>
              <td>${t.scopeClasses && t.scopeClasses.length ? t.scopeClasses.map(c => `<span class="pill">${c}</span>`).join(' ') : 'All classes'}</td>
              <td>${canEdit ? `<button class="btn-edit-text" onclick="openExamTypeModal('${t.id}')">Edit</button>` : ''}${(canEdit && canDelete) ? ' · ' : ''}${canDelete ? `<button class="btn-danger-text" onclick="removeExamType('${t.id}')">Delete</button>` : ''}</td>
            </tr>
          `).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No exam types yet</b>Use "Quick setup" for the standard Formative/Summative/Prefinals pattern, or add your own.</div></td></tr>`}
          </tbody></table>
        </div>
      </div>

      ${canCreate ? `<button class="btn btn-primary" style="margin-bottom:16px;" onclick="openExamModal()">+ Add Exam</button>` : ''}
      ${examDefs.length ? examDefs.map(ex => {
        const type = examTypeByName(ex.examType);
        return `
        <div class="list-manage-row">
          <div><div class="lm-name">${ex.name}</div><div class="lm-meta">${ex.examType||'—'}${type && type.scopeClasses && type.scopeClasses.length ? ' · ' + type.scopeClasses.join(', ') + ' only' : ''} · ${ex.startDate ? (ex.startDate + (ex.endDate && ex.endDate!==ex.startDate ? ' – ' + ex.endDate : '')) : 'No dates set'}</div></div>
          <div style="display:flex; gap:10px;">
            ${canEdit ? `<button class="btn-edit-text" onclick="openSubjConfigGrid('${ex.id}')">Configure Subjects</button>` : ''}
            ${canEdit ? `<button class="btn-edit-text" onclick="openExamModal('${ex.id}')">Edit</button>` : ''}
            ${canDelete ? `<button class="btn-danger-text" onclick="deleteExam('${ex.id}')">Delete</button>` : ''}
          </div>
        </div>
      `;}).join('') : `<div class="empty-state"><b>No exams yet</b>Click "+ Add Exam" to create your first one.</div>`}
    `;
  }
  async function quickSetupExamTypes(){
    if(examTypes.length > 0 && !await showConfirmDialog('This adds the standard Formative/Summative/Prefinals types alongside whatever you already have. Continue?')) return;
    const tenth = CLASS_LEVELS[CLASS_LEVELS.length-1]; // last class level = the board-exam class, "10th Class" by default
    const mk = (name, group, scopeClasses) => ({ id:'etype_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, group, scopeClasses });
    examTypes.push(
      mk('Formative Assessment', 'formative', []),
      mk('Summative Assessment 1', 'summative', []),
      mk('Summative Assessment 2 (Annual)', 'summative', []),
      mk('Prefinals', 'internal', [tenth]),
    );
    await storageSet(EXAM_TYPES_KEY, examTypes);
    renderExamsListTab(document.getElementById('examBody'));
    showToast('Standard exam types added — create FA1–FA4, SA1 and SA2 as exams under them, then set their weights under Year-End → Consolidation Schemes.', 'burst');
  }
  function openExamTypeModal(id){
    document.getElementById('examTypeForm').reset();
    document.getElementById('editExamTypeId').value = id || '';
    document.getElementById('examTypeModalTitle').textContent = id ? 'Edit Exam Type' : 'Add Exam Type';
    const t = id ? examTypes.find(x => x.id===id) : null;
    document.getElementById('etName').value = t ? t.name : '';
    document.getElementById('etGroup').value = t ? t.group : 'formative';
    document.getElementById('etScopeBox').innerHTML = CLASS_LEVELS.map(c => `
      <label class="admission-toggle"><input type="checkbox" class="et-scope-check" value="${c}" ${t && t.scopeClasses && t.scopeClasses.includes(c) ? 'checked' : ''}> ${c}</label>
    `).join('');
    document.getElementById('examTypeModalOverlay').classList.add('open');
  }
  function closeExamTypeModal(){
    document.getElementById('examTypeModalOverlay').classList.remove('open');
  }
  async function saveExamTypeModal(e){
    e.preventDefault();
    const id = document.getElementById('editExamTypeId').value;
    const name = document.getElementById('etName').value.trim();
    if(!name){ showToast('Enter a name for the exam type.'); return false; }
    const dup = examTypes.find(t => t.name.toLowerCase()===name.toLowerCase() && t.id!==id);
    if(dup){ showToast('An exam type with this name already exists.'); return false; }
    const scopeClasses = Array.from(document.querySelectorAll('.et-scope-check:checked')).map(c => c.value);
    const data = {
      name,
      group: document.getElementById('etGroup').value,
      scopeClasses,
    };
    if(id){
      const t = examTypes.find(x => x.id===id);
      const oldName = t.name;
      Object.assign(t, data);
      // Exams reference their type by name (not id), so a rename has to
      // cascade — otherwise every exam quietly falls back to an "unknown type".
      if(oldName !== name) examDefs.forEach(ex => { if(ex.examType === oldName) ex.examType = name; });
    } else {
      examTypes.push({ id:'etype_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), ...data });
    }
    await storageSet(EXAM_TYPES_KEY, examTypes);
    if(id) await storageSet(EXAM_DEFS_KEY, examDefs);
    closeExamTypeModal();
    renderExamsListTab(document.getElementById('examBody'));
    showToast('Exam type saved.', 'burst');
    return false;
  }
  async function removeExamType(id){
    const t = examTypes.find(x => x.id===id);
    if(!t) return;
    const inUse = examDefs.some(ex => ex.examType === t.name);
    const inScheme = consolSchemes.some(sc => sc.buckets.some(b => b.memberTypeIds.includes(id)));
    if((inUse || inScheme) && !await showConfirmDialog(`"${t.name}" is ${inUse?'used by one or more exams':''}${inUse && inScheme ? ' and ':''}${inScheme?'referenced by one or more Consolidation Schemes':''} — deleting it won't remove those exams or marks, but any scheme bucket referencing it will stop contributing this type. Delete anyway?`)) return;
    examTypes = examTypes.filter(x => x.id !== id);
    await storageSet(EXAM_TYPES_KEY, examTypes);
    renderExamsListTab(document.getElementById('examBody'));
  }

  function openSubjConfigGrid(examId){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examCurrentExamId = examId;
    examSubjView = 'grid';
    renderExamBody();
  }
  function backToExamsList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examSubjView = 'list';
    renderExamBody();
  }
  function renderSubjConfigGrid(body){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    if(!exam){ examSubjView = 'list'; return renderExamBody(); }
    const allowedClasses = classLevelsForExamType(exam.examType);
    const rows = allowedClasses.map((cls, idx) => {
      const count = getClassSubjectSummary(exam, cls).length;
      const range = classExamDateRange(exam, cls);
      return `<div class="class-compact-tile" data-idx="${idx%4}" onclick="openSubjConfigEditor('${cls}')">
        <div class="class-compact-header"><div>
          <div class="class-compact-name">${cls}</div>
          <div class="class-compact-count">${count} <span class="class-compact-count-label">subject${count===1?'':'s'}</span></div>
          ${range ? `<div style="font-size:0.72rem; color:var(--ink-soft); margin-top:2px;">${range.start}${range.end!==range.start ? ' – '+range.end : ''}</div>` : ''}
        </div></div>
      </div>`;
    }).join('');
    const type = examTypeByName(exam.examType);
    const canCreate = canSub('exams_definitions','exams','create');
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToExamsList()">All Exams</a> &nbsp;/&nbsp; ${exam.name} — choose a class to manage its subjects</div>
      ${type && type.scopeClasses && type.scopeClasses.length ? `<p style="font-size:0.82rem; color:var(--ink-soft); margin:-8px 0 16px;">"${exam.examType}" is only offered to ${type.scopeClasses.join(', ')} — other classes are hidden here.</p>` : ''}
      ${canCreate ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;"><button class="btn btn-ghost btn-sm" onclick="openBulkSubjectModal()">+ Add Subject to Multiple Classes</button><button class="btn btn-primary btn-sm" onclick="openMarksWizard()">⚙ Marks Structure Wizard</button></div>` : ''}
      <div class="class-compact-grid">${rows}</div>
    `;
  }
  function openSubjConfigEditor(cls){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examCurrentClass = cls;
    examSubjView = 'editor';
    renderExamBody();
  }
  function backToSubjConfigGrid(){
    examSubjView = 'grid';
    renderExamBody();
  }
  function getClassSubjectSummary(exam, cls){
    const map = {};
    SECTIONS.forEach(sec => {
      getExamSubjects(exam, cls, sec).forEach(s => {
        if(!map[s.name]) map[s.name] = { ...s, sections: [] };
        map[s.name].sections.push(sec);
      });
    });
    return Object.values(map);
  }
  function renderSubjConfigEditor(body){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    if(!exam){ examSubjView = 'list'; return renderExamBody(); }
    const summary = getClassSubjectSummary(exam, examCurrentClass);
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToExamsList()">All Exams</a> &nbsp;/&nbsp; <a onclick="backToSubjConfigGrid()">${exam.name}</a> &nbsp;/&nbsp; ${examCurrentClass}</div>
      ${canSub('exams_definitions','exams','edit') ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;"><button class="btn btn-primary" onclick="openSubjectModal()">+ Add Subject</button><button class="btn btn-ghost" onclick="openMarksWizard('${examCurrentClass}')">⚙ Marks Structure Wizard</button></div>` : ''}
      <div class="table-wrap">
        <table><thead><tr><th>Subject</th><th>Code</th><th>Sections</th><th>Staff</th><th>Total Marks</th><th>Date</th><th>Countable</th><th>Elective</th><th></th></tr></thead>
        <tbody>
        ${summary.length ? summary.map(s => `
          <tr>
            <td class="name-cell">${s.name}</td>
            <td>${s.code||'—'}</td>
            <td>${s.sections.map(sec => `<span class="pill">${sec}</span>`).join(' ')}</td>
            <td>${(s.staffIds||[]).map(id => { const st = staffList.find(x => x.id===id); return st ? st.firstName+' '+st.lastName : ''; }).filter(Boolean).join(', ') || '—'}</td>
            <td>${marksStructureLabel(s)}</td>
            <td>${s.date||'—'}</td>
            <td>${s.countable!==false ? '✓' : '—'}</td>
            <td>${s.elective ? '✓' : '—'}</td>
            <td>${canSub('exams_definitions','exams','edit') ? `<button class="btn-edit-text" onclick="openSubjectModal('${s.name.replace(/'/g,"\\'")}')">Edit</button>` : ''}${(canSub('exams_definitions','exams','edit') && canSub('exams_definitions','exams','delete')) ? '&nbsp;·&nbsp;' : ''}${canSub('exams_definitions','exams','delete') ? `<button class="btn-danger-text" onclick="deleteSubjectFromClass('${s.name.replace(/'/g,"\\'")}')">Remove</button>` : ''}</td>
          </tr>
        `).join('') : `<tr><td colspan="9"><div class="empty-state"><b>No subjects yet</b>Click "+ Add Subject" to add one.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  function openSubjectModal(originalName){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    document.getElementById('subjectForm').reset();
    document.getElementById('editSubjectOriginalName').value = originalName || '';
    document.getElementById('subjectModalTitle').textContent = originalName ? 'Edit Subject' : 'Add Subject';
    document.getElementById('subjectSaveBtn').textContent = originalName ? 'Update Subject' : 'Add Subject';
    document.getElementById('subjCourse').value = examCurrentClass;
    document.getElementById('masterSubjectsDatalist').innerHTML = subjectsList
      .filter(s => s.className === examCurrentClass)
      .map(s => `<option value="${s.name}">`).join('');

    let existing = null;
    let existingSections = [];
    if(originalName){
      SECTIONS.forEach(sec => {
        const found = getExamSubjects(exam, examCurrentClass, sec).find(s => s.name === originalName);
        if(found){ existing = found; existingSections.push(sec); }
      });
    }
    document.getElementById('subjName').value = existing ? existing.name : '';
    document.getElementById('subjMaxMarks').value = existing ? existing.maxMarks : 100;
    if(typeof subjSplitLoad === 'function') subjSplitLoad('subj', existing);
    document.getElementById('subjDate').value = existing ? (existing.date||'') : (exam.startDate||'');
    document.getElementById('subjCountable').checked = existing ? (existing.countable !== false) : true;
    document.getElementById('subjElective').checked = existing ? !!existing.elective : false;

    document.getElementById('subjSectionsBox').innerHTML = SECTIONS.map(sec => `
      <label class="admission-toggle"><input type="checkbox" class="subj-sec-check" value="${sec}" ${existingSections.includes(sec)?'checked':''}> Section ${sec}</label>
    `).join('');

    // Staff picker starts narrowed to this class's own teachers (or this exact
    // subject's teachers, once the name matches a master-subject record) —
    // see examSubjStaffCandidates(). An already-assigned teacher is always
    // kept visible even if a later name edit narrows the pool past them.
    examSubjStaffShowAll = false;
    window._subjModalInitialStaffIds = existing && existing.staffIds ? existing.staffIds : [];
    renderExamSubjStaffBox();

    document.getElementById('subjectModalOverlay').classList.add('open');
  }
  let examSubjStaffShowAll = false;
  function renderExamSubjStaffBox(){
    const box = document.getElementById('subjStaffBox');
    if(!box) return;
    const cls = examCurrentClass;
    const name = document.getElementById('subjName').value;
    const checkedNow = Array.from(document.querySelectorAll('.subj-staff-check:checked')).map(c => c.value);
    const keepVisible = new Set(checkedNow.length ? checkedNow : (window._subjModalInitialStaffIds || []));

    const narrowed = examSubjStaffCandidates(cls, name);
    const useNarrowed = !examSubjStaffShowAll && !!narrowed.label;
    const ids = useNarrowed ? narrowed.ids.slice() : staffList.map(s => s.id);
    keepVisible.forEach(id => { if(!ids.includes(id)) ids.push(id); }); // never hide an already-picked teacher
    const list = ids.map(id => staffList.find(s => s.id === id)).filter(Boolean);

    const toggleLink = narrowed.label
      ? (useNarrowed
          ? `<a onclick="examSubjStaffShowAll=true; renderExamSubjStaffBox();" style="cursor:pointer; color:var(--magenta); font-weight:600;">Show all staff instead</a>`
          : `<a onclick="examSubjStaffShowAll=false; renderExamSubjStaffBox();" style="cursor:pointer; color:var(--magenta); font-weight:600;">Show only ${narrowed.label}</a>`)
      : '';
    box.innerHTML = `
      ${narrowed.label ? `<p style="font-size:0.74rem; color:var(--ink-soft); margin:0 0 6px;">${useNarrowed ? `Showing ${narrowed.label}.` : 'Showing all staff.'} ${toggleLink}</p>` : ''}
      ${staffList.length ? (list.length ? list.map(st => `
        <label class="disc-check-item"><input type="checkbox" class="subj-staff-check" value="${st.id}" ${keepVisible.has(st.id)?'checked':''}> ${st.firstName} ${st.lastName} <span style="color:var(--ink-soft); font-size:0.76rem;">(${st.designation||'Staff'})</span></label>
      `).join('') : `<div style="font-size:0.82rem; color:var(--ink-soft);">No teachers found for this class yet — add subject-teacher assignments under Manage Subjects, or <a onclick="examSubjStaffShowAll=true; renderExamSubjStaffBox();" style="cursor:pointer; color:var(--magenta); font-weight:600;">show all staff</a>.</div>`)
        : `<div style="font-size:0.82rem; color:var(--ink-soft);">No staff added yet — add some under Manage Staff.</div>`}
    `;
  }
  function closeSubjectModal(){
    document.getElementById('subjectModalOverlay').classList.remove('open');
  }
  async function saveSubjectModal(e){
    e.preventDefault();
    const exam = examDefs.find(x => x.id === examCurrentExamId);
    const originalName = document.getElementById('editSubjectOriginalName').value;
    const name = document.getElementById('subjName').value.trim();
    const sections = Array.from(document.querySelectorAll('.subj-sec-check:checked')).map(c => c.value);
    if(sections.length === 0){ showToast('Select at least one section.'); return false; }
    const split = (typeof subjSplitRead === 'function') ? subjSplitRead('subj') : { internalMax: 0 };
    if(split.error){ showToast(split.error); return false; }
    const dateVal = document.getElementById('subjDate').value;
    if(!dateVal){ showToast('Set an exam date for this subject — it\'s required before hall tickets can be generated.'); return false; }
    const clashingHoliday = holidayFor(dateVal);
    if(clashingHoliday && !await showConfirmDialog(`${dateVal} is marked as a holiday (${clashingHoliday.name}). Schedule the exam on this date anyway?`)) return false;
    const staffIds = Array.from(document.querySelectorAll('.subj-staff-check:checked')).map(c => c.value);
    const masterMatch = subjectsList.find(s => s.className === examCurrentClass && s.name.trim().toLowerCase() === name.toLowerCase());
    const subjectData = {
      name, code: masterMatch ? (masterMatch.code||'') : '', maxMarks: Number(document.getElementById('subjMaxMarks').value) || 100,
      internalMax: split.internalMax,
      date: dateVal,
      staffIds, countable: document.getElementById('subjCountable').checked,
      elective: document.getElementById('subjElective').checked,
    };
    exam.classSubjects = exam.classSubjects || {};
    SECTIONS.forEach(sec => {
      const key = classSecKey(examCurrentClass, sec);
      let list = exam.classSubjects[key] ? exam.classSubjects[key].slice() : (exam.subjects ? exam.subjects.slice() : []);
      list = list.filter(s => s.name !== originalName && s.name !== name);
      if(sections.includes(sec)) list.push(subjectData);
      exam.classSubjects[key] = list;
    });
    await storageSet(EXAM_DEFS_KEY, examDefs);
    closeSubjectModal();
    showToast((originalName ? 'Subject updated' : 'Subject added') + ' for ' + examCurrentClass + '.');
    renderExamBody();
    return false;
  }
  async function deleteSubjectFromClass(name){
    if(!await showConfirmDialog(`Remove "${name}" from all sections of this class for this exam?`)) return;
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    exam.classSubjects = exam.classSubjects || {};
    SECTIONS.forEach(sec => {
      const key = classSecKey(examCurrentClass, sec);
      if(exam.classSubjects[key]) exam.classSubjects[key] = exam.classSubjects[key].filter(s => s.name !== name);
    });
    await storageSet(EXAM_DEFS_KEY, examDefs);
    renderExamBody();
    showToast('Subject removed.', 'burst');
  }

  /* --- Bulk Add Subject: the same subject, added to several classes (and a
     chosen set of sections within each) in one pass, instead of repeating
     "Configure Subjects" once per class. Every class still gets its own
     section list and its own teacher picker — narrowed to that class's
     teachers via examSubjStaffCandidates(), same as the single-class flow —
     because different classes are almost always taught by different staff
     even for the "same" subject name. */
  let bulkSubjSelectedClasses = [];   // ordered list of classNames currently ticked
  let bulkSubjClassSections = {};     // className -> Set(section)
  let bulkSubjClassStaff = {};        // className -> Set(staffId)
  let bulkSubjClassShowAllStaff = {}; // className -> bool ("show all staff" override for that class's panel)

  function openBulkSubjectModal(){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    if(!exam) return;
    document.getElementById('bulkSubjectForm').reset();
    document.getElementById('bsDate').value = exam.startDate || '';
    if(typeof subjSplitLoad === 'function') subjSplitLoad('bs', null);
    document.getElementById('bulkMasterSubjectsDatalist').innerHTML = Array.from(new Set(subjectsList.map(s => s.name)))
      .map(n => `<option value="${n}">`).join('');

    bulkSubjSelectedClasses = [];
    bulkSubjClassSections = {};
    bulkSubjClassStaff = {};
    bulkSubjClassShowAllStaff = {};

    const allowedClasses = classLevelsForExamType(exam.examType);
    document.getElementById('bsClassesBox').innerHTML = allowedClasses.map(cls => `
      <label class="admission-toggle"><input type="checkbox" class="bs-class-check" value="${cls}" onchange="toggleBulkSubjClass('${cls}', this.checked)"> ${cls}</label>
    `).join('');
    renderBulkSubjectPanels();
    document.getElementById('bulkSubjectModalOverlay').classList.add('open');
  }
  function closeBulkSubjectModal(){
    document.getElementById('bulkSubjectModalOverlay').classList.remove('open');
  }
  function toggleBulkSubjClass(cls, checked){
    if(checked){
      if(!bulkSubjSelectedClasses.includes(cls)) bulkSubjSelectedClasses.push(cls);
      if(!bulkSubjClassSections[cls]) bulkSubjClassSections[cls] = new Set(sectionsForClass(cls));
      if(!bulkSubjClassStaff[cls]) bulkSubjClassStaff[cls] = new Set();
    }else{
      bulkSubjSelectedClasses = bulkSubjSelectedClasses.filter(c => c !== cls);
    }
    renderBulkSubjectPanels();
  }
  function toggleBulkSubjSection(cls, sec, checked){
    const set = bulkSubjClassSections[cls] || (bulkSubjClassSections[cls] = new Set());
    if(checked) set.add(sec); else set.delete(sec);
  }
  function toggleBulkSubjStaff(cls, staffId, checked){
    const set = bulkSubjClassStaff[cls] || (bulkSubjClassStaff[cls] = new Set());
    if(checked) set.add(staffId); else set.delete(staffId);
  }
  function toggleBulkSubjShowAllStaff(cls){
    bulkSubjClassShowAllStaff[cls] = !bulkSubjClassShowAllStaff[cls];
    renderBulkSubjectPanels();
  }
  // Applies class[0]'s current teacher selection to every other ticked class
  // that shares at least one of those teachers on staff — a shortcut for the
  // common case of one teacher covering the same subject across classes.
  function copyBulkSubjStaffToAll(fromCls){
    const source = Array.from(bulkSubjClassStaff[fromCls] || []);
    if(source.length === 0){ showToast('Pick a teacher for this class first, then copy it to the others.'); return; }
    // Copies the exact selection across regardless of each class's own
    // narrowed candidate list — clicking "copy" is itself the admin's
    // confirmation that this teacher does cover that class too, same as how
    // an already-picked teacher stays visible even outside the narrowed set.
    bulkSubjSelectedClasses.forEach(cls => {
      if(cls === fromCls) return;
      bulkSubjClassStaff[cls] = new Set(source);
    });
    renderBulkSubjectPanels();
    showToast('Teacher selection copied to all selected classes.', 'burst');
  }
  function renderBulkSubjectPanels(){
    const box = document.getElementById('bsClassPanels');
    if(!box) return;
    const name = document.getElementById('bsName').value;
    box.innerHTML = bulkSubjSelectedClasses.map(cls => {
      const sections = sectionsForClass(cls);
      const selectedSections = bulkSubjClassSections[cls] || new Set(sections);
      const selectedStaff = bulkSubjClassStaff[cls] || new Set();
      const narrowed = examSubjStaffCandidates(cls, name);
      const useNarrowed = !bulkSubjClassShowAllStaff[cls] && !!narrowed.label;
      const ids = useNarrowed ? narrowed.ids.slice() : staffList.map(s => s.id);
      selectedStaff.forEach(id => { if(!ids.includes(id)) ids.push(id); });
      const staffOptions = ids.map(id => staffList.find(s => s.id === id)).filter(Boolean);
      const toggleLink = narrowed.label
        ? (useNarrowed
            ? `<a onclick="toggleBulkSubjShowAllStaff('${cls}')" style="cursor:pointer; color:var(--magenta); font-weight:600;">Show all staff instead</a>`
            : `<a onclick="toggleBulkSubjShowAllStaff('${cls}')" style="cursor:pointer; color:var(--magenta); font-weight:600;">Show only ${narrowed.label}</a>`)
        : '';
      return `
      <div class="profile-card" style="margin-bottom:12px; padding:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <b>${cls}</b>
          ${bulkSubjSelectedClasses.length > 1 ? `<button type="button" class="btn-edit-text" onclick="copyBulkSubjStaffToAll('${cls}')">Copy this class's teacher(s) to all</button>` : ''}
        </div>
        <div style="font-size:0.74rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Sections</div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px;">
          ${sections.map(sec => `<label class="admission-toggle"><input type="checkbox" ${selectedSections.has(sec)?'checked':''} onchange="toggleBulkSubjSection('${cls}','${sec}', this.checked)"> Section ${sec}</label>`).join('')}
        </div>
        <div style="font-size:0.74rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Teacher(s)</div>
        ${narrowed.label ? `<p style="font-size:0.72rem; color:var(--ink-soft); margin:0 0 6px;">${useNarrowed ? `Showing ${narrowed.label}.` : 'Showing all staff.'} ${toggleLink}</p>` : ''}
        <div class="disc-checklist" style="max-height:110px;">
          ${staffList.length ? (staffOptions.length ? staffOptions.map(st => `
            <label class="disc-check-item"><input type="checkbox" ${selectedStaff.has(st.id)?'checked':''} onchange="toggleBulkSubjStaff('${cls}','${st.id}', this.checked)"> ${st.firstName} ${st.lastName} <span style="color:var(--ink-soft); font-size:0.76rem;">(${st.designation||'Staff'})</span></label>
          `).join('') : `<div style="font-size:0.8rem; color:var(--ink-soft);">No teachers found for ${cls} yet.</div>`) : `<div style="font-size:0.8rem; color:var(--ink-soft);">No staff added yet.</div>`}
        </div>
      </div>`;
    }).join('') || `<div class="empty-state" style="margin-top:0;"><b>Tick a class above to configure it</b></div>`;
  }
  async function saveBulkSubjectModal(e){
    e.preventDefault();
    const exam = examDefs.find(x => x.id === examCurrentExamId);
    const name = document.getElementById('bsName').value.trim();
    if(!name){ showToast('Enter a subject name.'); return false; }
    if(bulkSubjSelectedClasses.length === 0){ showToast('Tick at least one class.'); return false; }
    const dateVal = document.getElementById('bsDate').value;
    if(!dateVal){ showToast('Set an exam date — it\'s required before hall tickets can be generated.'); return false; }
    const classesWithSections = bulkSubjSelectedClasses.filter(cls => (bulkSubjClassSections[cls]||new Set()).size > 0);
    if(classesWithSections.length === 0){ showToast('Tick at least one section for at least one class.'); return false; }
    const clashingHoliday = holidayFor(dateVal);
    if(clashingHoliday && !await showConfirmDialog(`${dateVal} is marked as a holiday (${clashingHoliday.name}). Schedule the exam on this date anyway?`)) return false;

    const split = (typeof subjSplitRead === 'function') ? subjSplitRead('bs') : { internalMax: 0 };
    if(split.error){ showToast(split.error); return false; }
    const maxMarks = Number(document.getElementById('bsMaxMarks').value) || 100;
    const countable = document.getElementById('bsCountable').checked;
    const elective = document.getElementById('bsElective').checked;
    exam.classSubjects = exam.classSubjects || {};
    let sectionCount = 0;
    classesWithSections.forEach(cls => {
      const masterMatch = subjectsList.find(s => s.className === cls && s.name.trim().toLowerCase() === name.toLowerCase());
      const staffIds = Array.from(bulkSubjClassStaff[cls] || []);
      const subjectData = { name, code: masterMatch ? (masterMatch.code||'') : '', maxMarks, internalMax: split.internalMax, date: dateVal, staffIds, countable, elective };
      const sections = bulkSubjClassSections[cls];
      sectionsForClass(cls).forEach(sec => {
        const key = classSecKey(cls, sec);
        let list = exam.classSubjects[key] ? exam.classSubjects[key].slice() : (exam.subjects ? exam.subjects.slice() : []);
        list = list.filter(s => s.name !== name);
        if(sections.has(sec)){ list.push(subjectData); sectionCount++; }
        exam.classSubjects[key] = list;
      });
    });
    await storageSet(EXAM_DEFS_KEY, examDefs);
    closeBulkSubjectModal();
    showToast(`"${name}" added to ${classesWithSections.length} class${classesWithSections.length===1?'':'es'} (${sectionCount} section${sectionCount===1?'':'s'}).`, 'burst');
    renderExamBody();
    return false;
  }

  function openExamModal(id){
    document.getElementById('examForm').reset();
    document.getElementById('editExamId').value = id || '';
    document.getElementById('examModalTitle').textContent = id ? 'Edit Exam' : 'Add Exam';
    const typeSel = document.getElementById('exType');
    typeSel.innerHTML = '<option value="" disabled selected>Select exam type</option>' + examTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    if(id){
      const ex = examDefs.find(e => e.id === id);
      document.getElementById('exName').value = ex.name;
      typeSel.value = ex.examType || '';
      document.getElementById('exStartDate').value = ex.startDate || '';
      document.getElementById('exEndDate').value = ex.endDate || '';
    }
    document.getElementById('examModalOverlay').classList.add('open');
  }
  function closeExamModal(){
    document.getElementById('examModalOverlay').classList.remove('open');
  }
  async function saveExam(e){
    e.preventDefault();
    const id = document.getElementById('editExamId').value;
    const data = {
      name: document.getElementById('exName').value.trim(),
      examType: document.getElementById('exType').value,
      startDate: document.getElementById('exStartDate').value,
      endDate: document.getElementById('exEndDate').value,
    };
    if(id){
      const idx = examDefs.findIndex(e => e.id === id);
      examDefs[idx] = { ...examDefs[idx], ...data };
      showToast('Exam updated.');
    }else{
      data.id = 'exam_' + Date.now();
      data.classSubjects = {};
      examDefs.push(data);
      showToast('Exam created. Now configure subjects per class & section.');
    }
    await storageSet(EXAM_DEFS_KEY, examDefs);
    closeExamModal();
    renderExamBody();
    return false;
  }
  async function deleteExam(id){
    if(!await showConfirmDialog('Delete this exam? Any marks entered for it will also be removed.')) return;
    await ensureDataLoaded('examResults', loadExamResultsData);
    examDefs = examDefs.filter(e => e.id !== id);
    examResults = examResults.filter(r => r.examId !== id);
    await storageSet(EXAM_DEFS_KEY, examDefs);
    await storageSet(EXAM_RESULTS_KEY, examResults);
    renderExamBody();
    showToast('Exam deleted.', 'burst');
  }

  /* --- Tab: Enter Marks --- */
  let expandedMarksClass = '';
  function toggleMarksClassExpand(cls){
    expandedMarksClass = (expandedMarksClass === cls) ? '' : cls;
    renderMarksClassGrid(document.getElementById('examBody'));
  }
  function renderMarksClassGrid(body){
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b>Create an exam under the "Exams" tab first.</div>`;
      return;
    }
    if(!examCurrentExamId || !examDefs.find(e => e.id === examCurrentExamId)) examCurrentExamId = examDefs[0].id;
    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${examCurrentExamId===ex.id?'selected':''}>${ex.name}</option>`).join('');
    const currentExam = examDefs.find(e => e.id === examCurrentExamId);
    const scope = myTeacherScope();
    if(scope && scope.unlinked){
      body.innerHTML = `<div class="empty-state"><b>Your login isn't linked to a staff record</b>Ask an Admin to re-link your login under Staff Directory (🔑 Grant login access), or re-save it from Configuration → Users &amp; Roles — otherwise Subject Teacher assignments can never reach your account.</div>`;
      return;
    }
    if(scope && !scope.subjectSections.length){
      body.innerHTML = `<div class="empty-state"><b>You're not assigned as a Subject Teacher for any class yet</b>Marks can only be entered by that subject's assigned teacher — ask an admin to assign you one under Subjects.</div>`;
      return;
    }
    const isSectionAllowed = (cls, sec) => !scope || scope.subjectSections.some(ss => ss.className===cls && ss.section===sec);
    const gridHtml = buildModernClassGrid(
      classLevelsForExamType(currentExam && currentExam.examType),
      (cls, sec) => isSectionAllowed(cls, sec) ? students.filter(s => s.className===cls && s.section===sec && isActive(s)).length : 0,
      cls => `toggleMarksClassExpand('${cls}')`,
      (cls, sec) => `openMarksSection('${cls}','${sec}')`,
      cls => expandedMarksClass === cls
    );
    body.innerHTML = `
      <div class="f-field" style="max-width:320px; margin-bottom:20px;">
        <label>Exam</label>
        <select id="marksExamSelect" onchange="onMarksExamSelectChange(this.value)">${examOptions}</select>
      </div>
      ${gridHtml}
    `;
  }

  // Switching the exam must re-render the class grid immediately, because
  // which classes/sections show up depends on the NEW exam's type
  // (classLevelsForExamType) — just updating examCurrentExamId and leaving
  // the old grid on screen is why teachers saw "no classes" after picking
  // an exam, until they left the tab and came back (which forces a fresh
  // render that picks up the already-updated variable).
  function onMarksExamSelectChange(examId){
    examCurrentExamId = examId;
    renderMarksClassGrid(document.getElementById('examBody'));
  }
  function openMarksSection(cls, sec){
    const scope = myTeacherScope();
    if(scope && !scope.subjectSections.some(ss => ss.className===cls && ss.section===sec)){
      showToast("You can only enter marks for a class/subject you are assigned to teach.");
      return;
    }
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examCurrentClass = cls; examCurrentSection = sec;
    examMarksView = 'sheet';
    renderExamBody();
  }
  async function backToMarksGrid(){
    await flushMarksAutoSaveIfPending();
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examMarksView = 'grid';
    renderExamBody();
  }

  function renderMarksSheet(body){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    if(!exam){ examMarksView = 'grid'; return renderExamBody(); }
    let subjects = getExamSubjects(exam, examCurrentClass, examCurrentSection);
    // A Teacher only ever sees/enters marks for the subject(s) they're the
    // assigned Subject Teacher for in this class/section — never a
    // colleague's subject, even within a class they otherwise have some
    // access to. See myTeacherScope() and the matching server-side check.
    const scope = myTeacherScope();
    if(scope){
      const mySubjectNames = new Set(scope.subjectSections.filter(ss => ss.className===examCurrentClass && ss.section===examCurrentSection).map(ss => ss.subject));
      subjects = subjects.filter(s => mySubjectNames.has(s.name));
    }
    if(subjects.length === 0){
      const noneAssigned = scope && getExamSubjects(exam, examCurrentClass, examCurrentSection).length > 0;
      body.innerHTML = `
        <div class="breadcrumb"><a onclick="backToMarksGrid()">All Classes</a> &nbsp;/&nbsp; ${examCurrentClass} — Section ${examCurrentSection} &nbsp;/&nbsp; ${exam.name}</div>
        ${noneAssigned
          ? `<div class="empty-state"><b>None of these subjects are assigned to you</b>You're not the Subject Teacher for any subject in ${examCurrentClass} — Section ${examCurrentSection}.</div>`
          : `<div class="empty-state"><b>No subjects configured yet</b>Go to the "Exams" tab → "Configure Subjects" for ${examCurrentClass} — Section ${examCurrentSection} before entering marks.</div>`}
      `;
      return;
    }
    const list = students.filter(s => s.className===examCurrentClass && s.section===examCurrentSection && isActive(s))
      .sort(compareByRoll);
    const getResult = (studentId, subject) => examResults.find(r => r.examId===exam.id && r.studentId===studentId && r.subject===subject);
    const canEnterMarks = canSub('exams_marks','exams','edit');
    body.innerHTML = `
      <div class="breadcrumb" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span><a onclick="backToMarksGrid()">All Classes</a> &nbsp;/&nbsp; ${examCurrentClass} — Section ${examCurrentSection} &nbsp;/&nbsp; ${exam.name}</span>
        ${canEnterMarks ? `<span id="marksAutoSaveStatus" style="font-size:0.78rem; color:var(--ink-soft);"></span>` : ''}
      </div>
      ${canEnterMarks ? `<p style="font-size:0.76rem; color:var(--ink-soft); margin:2px 0 10px;">Marks are saved automatically as you type — "Save Marks" is just there to double-check everything looks right.</p>
      <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;">📤 Upload via Excel<input type="file" accept=".xlsx,.xls" id="marksExcelInput" style="display:none;" onchange="importMarksExcel(event)"></label>
      </div>` : ''}
      <div class="table-wrap" style="overflow-x:auto;">
        <table><thead><tr>
          <th>Roll No</th>
          <th>Student</th>
          ${subjects.map(s => `<th>${s.name} <span style="font-weight:400; color:var(--ink-soft);">(/${s.maxMarks}${s.date ? ' · '+s.date : ''})</span>${subjInternalMax(s) ? `<div style="font-weight:500; font-size:0.68rem; color:var(--ink-soft);">Written ${subjWrittenMax(s)} + Internal ${subjInternalMax(s)}</div>` : ''}</th>`).join('')}
        </tr></thead>
        <tbody>
        ${list.map(s => `
          <tr>
            <td class="id-cell">${s.rollNo||'—'}</td>
            <td class="name-cell">${s.firstName} ${s.lastName}</td>
            ${subjects.map(subj => {
              const r = getResult(s.id, subj.name);
              const isAbsent = r ? !!r.absent : false;
              const sub = subj.name.replace(/"/g,'&quot;');
              const dis = (isAbsent||!canEnterMarks) ? 'disabled' : '';
              const absLbl = `<label style="font-size:0.68rem; color:var(--ink-soft); display:flex; align-items:center; gap:2px; cursor:pointer;" title="Mark absent for this subject">
                    <input type="checkbox" class="marks-absent-check" data-student="${s.id}" data-subject="${sub}" ${isAbsent?'checked':''} ${!canEnterMarks?'disabled':''} onchange="onMarksAbsentToggle(this)"> Abs
                  </label>`;
              const im = subjInternalMax(subj);
              if(im){
                const wm = subjWrittenMax(subj);
                const sp = marksSplitOf(r, subj);
                const tot = (r && !isAbsent && r.marks != null) ? r.marks : '';
                return `<td>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <input type="number" class="marks-input" data-part="written" min="0" max="${wm}" step="any" placeholder="/${wm}" title="Written marks (out of ${wm})" data-student="${s.id}" data-subject="${sub}" value="${sp.written}" ${dis} style="width:62px;" oninput="marksInputChanged(this)">
                    <input type="number" class="marks-input" data-part="internal" min="0" max="${im}" step="any" placeholder="/${im}" title="Internal marks (out of ${im})" data-student="${s.id}" data-subject="${sub}" value="${sp.internal}" ${dis} style="width:62px;" oninput="marksInputChanged(this)">
                  </div>
                  <div style="display:flex; flex-direction:column; gap:3px; align-items:flex-start;">
                    <span class="mk-total" style="font-size:0.74rem; font-weight:700; color:var(--navy);">${tot === '' ? '—' : tot + ' / ' + subj.maxMarks}</span>
                    ${absLbl}
                  </div>
                </div>
              </td>`;
              }
              const markVal = r && !isAbsent ? r.marks : '';
              return `<td>
                <div style="display:flex; align-items:center; gap:5px;">
                  <input type="number" class="marks-input" min="0" max="${subj.maxMarks}" data-student="${s.id}" data-subject="${sub}" value="${markVal}" ${dis} style="width:64px;" oninput="scheduleMarksAutoSave()">
                  ${absLbl}
                </div>
              </td>`;
            }).join('')}
          </tr>
        `).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No students here</b></div>` : ``}
      </div>
      ${canEnterMarks ? `<div style="margin-top:16px;"><button class="btn btn-primary" onclick="saveMarksSheet()">Save Marks</button></div>` : ''}
    `;
    // Show any saved mark that is above the (possibly just-changed) maximum straight away.
    setTimeout(() => { try{ marksApplySheet(exam, true); }catch(e){} }, 0);
  }
  function onMarksAbsentToggle(el){
    const row = el.closest('td');
    row.querySelectorAll('.marks-input').forEach(input => {
      if(el.checked){ input.value = ''; input.disabled = true; }
      else { input.disabled = false; }
    });
    const first = row.querySelector('.marks-input');
    if(first) marksUpdateTotal(first);
    scheduleMarksAutoSave();
  }

  /* --- Marks structure: a subject may be split into Written + Internal. The
     subject's maxMarks is always the TOTAL (e.g. 50 = 35 written + 15 internal),
     and each result's `marks` is always the total scored, so reports, ranks,
     grading and every other module keep working unchanged. `written` and
     `internal` are stored alongside as the breakdown. --- */
  function subjInternalMax(subj){
    const i = Number(subj && subj.internalMax) || 0, t = Number(subj && subj.maxMarks) || 0;
    return (i > 0 && i < t) ? i : 0;
  }
  function subjWrittenMax(subj){ return (Number(subj && subj.maxMarks) || 0) - subjInternalMax(subj); }
  // What to show in the Written / Internal boxes for an existing result. Marks that
  // were entered before the split existed have no breakdown, so they show as Written.
  function marksSplitOf(r, subj){
    if(!r || r.absent) return { written:'', internal:'' };
    if(subjInternalMax(subj) && (r.written != null || r.internal != null))
      return { written: r.written == null ? '' : r.written, internal: r.internal == null ? '' : r.internal };
    return { written: r.marks == null ? '' : r.marks, internal:'' };
  }
  function marksStructureLabel(s){
    const im = subjInternalMax(s);
    return im ? `${s.maxMarks} <span class="pill" title="Written ${subjWrittenMax(s)} + Internal ${im}">W${subjWrittenMax(s)} + I${im}</span>` : `${s.maxMarks}`;
  }
  function marksUpdateTotal(inp){
    const td = inp.closest('td');
    if(!td) return;
    const out = td.querySelector('.mk-total');
    if(!out) return;
    const parts = Array.from(td.querySelectorAll('.marks-input'));
    const vals = parts.filter(i => i.value !== '' && !isNaN(Number(i.value))).map(i => Number(i.value));
    const max = parts.reduce((sum, i) => sum + (Number(i.max) || 0), 0);
    out.textContent = vals.length ? (Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100) + ' / ' + max : '—';
  }
  function marksInputChanged(inp){ marksUpdateTotal(inp); scheduleMarksAutoSave(); }
  // Reads every cell on the sheet into examResults. Invalid cells are highlighted and
  // skipped (never block the rest). With dry=true nothing is changed — it only reports.
  function marksApplySheet(exam, dry){
    const cells = new Map();
    document.querySelectorAll('.marks-input').forEach(inp => {
      if(!inp.dataset.student || !inp.dataset.subject) return;
      const k = inp.dataset.student + '\u0001' + inp.dataset.subject;
      if(!cells.has(k)) cells.set(k, []);
      cells.get(k).push(inp);
    });
    let firstInvalid = null;
    cells.forEach(arr => {
      const studentId = arr[0].dataset.student, subject = arr[0].dataset.subject;
      let bad = false;
      const vals = {};
      arr.forEach(inp => {
        const part = inp.dataset.part || 'total';
        const max = inp.max === '' ? null : Number(inp.max);
        const raw = inp.value;
        const val = raw === '' ? null : Number(raw);
        const invalid = !inp.disabled && raw !== '' && (isNaN(val) || val < 0 || (max !== null && val > max));
        inp.style.borderColor = invalid ? 'var(--magenta)' : '';
        if(invalid){ bad = true; if(!firstInvalid) firstInvalid = inp; }
        vals[part] = (inp.disabled || invalid) ? null : val;
      });
      if(bad || dry) return;
      const absentBox = document.querySelector(`.marks-absent-check[data-student="${studentId}"][data-subject="${CSS.escape(subject)}"]`);
      const isAbsent = absentBox ? absentBox.checked : false;
      const split = arr.some(i => i.dataset.part === 'internal');
      const entered = Object.values(vals).filter(v => v !== null);
      const total = entered.length ? Math.round(entered.reduce((a, b) => a + b, 0) * 100) / 100 : null;
      let r = examResults.find(x => x.examId===exam.id && x.studentId===studentId && x.subject===subject);
      if(total === null && !isAbsent){
        if(r) examResults = examResults.filter(x => x !== r);
        return;
      }
      if(!r){
        r = { id:'res_'+studentId+'_'+exam.id+'_'+subject.replace(/\s/g,''), examId:exam.id, studentId, subject };
        examResults.push(r);
      }
      r.marks = isAbsent ? null : total;
      r.absent = isAbsent;
      if(split){ r.written = isAbsent ? null : (vals.written == null ? null : vals.written); r.internal = isAbsent ? null : (vals.internal == null ? null : vals.internal); }
      else { delete r.written; delete r.internal; }
    });
    return { hasInvalid: !!firstInvalid, firstInvalid };
  }

  /* --- Auto-save for Marks Entry: teachers can enter marks for dozens of
     students, and relying on a single "Save Marks" button at the end risked
     losing everything if they navigated away or closed the tab first. Every
     keystroke/absent-toggle schedules a debounced save; an invalid cell is
     highlighted and simply skipped (never blocks the rest from saving), and
     any pending save is flushed immediately before leaving the sheet. --- */
  let marksAutoSaveTimer = null;
  window.addEventListener('online', function(){ if(marksAutoSaveTimer){ clearTimeout(marksAutoSaveTimer); marksAutoSaveTimer = setTimeout(autoSaveMarksSheet, 300); } });
  function marksBeforeUnloadGuard(e){ e.preventDefault(); e.returnValue = ''; return ''; }
  function scheduleMarksAutoSave(){
    const status = document.getElementById('marksAutoSaveStatus');
    if(status) status.textContent = '⏳ Saving…';
    if(marksAutoSaveTimer) clearTimeout(marksAutoSaveTimer);
    else window.addEventListener('beforeunload', marksBeforeUnloadGuard);
    marksAutoSaveTimer = setTimeout(autoSaveMarksSheet, 900);
  }
  async function flushMarksAutoSaveIfPending(){
    if(marksAutoSaveTimer){
      clearTimeout(marksAutoSaveTimer);
      marksAutoSaveTimer = null;
      await autoSaveMarksSheet();
    }
  }
  async function autoSaveMarksSheet(){
    marksAutoSaveTimer = null;
    try{
      const exam = examDefs.find(e => e.id === examCurrentExamId);
      const status = document.getElementById('marksAutoSaveStatus');
      if(!exam) return;
      if(!document.querySelector('.marks-input')) return;
      await ensureDataLoaded('examResults', loadExamResultsData);
      const { hasInvalid } = marksApplySheet(exam, false);
      const ok = await storageSet(EXAM_RESULTS_KEY, examResults);
      if(ok === false){
        // Server did not accept the save (network down, server restarting, session
        // ended). Keep the warning on screen, keep the leave-page guard, and retry
        // by itself so nothing typed is silently lost.
        if(status) status.textContent = '⚠️ NOT saved to the server yet — check your connection. Keep this page open; retrying…';
        window.addEventListener('beforeunload', marksBeforeUnloadGuard);
        if(!marksAutoSaveTimer) marksAutoSaveTimer = setTimeout(autoSaveMarksSheet, 5000);
        return;
      }
      if(status) status.textContent = hasInvalid ? '⚠️ Saved — fix the highlighted mark(s)' : '✅ All changes saved';
    } finally {
      if(!marksAutoSaveTimer) window.removeEventListener('beforeunload', marksBeforeUnloadGuard);
    }
  }

  async function saveMarksSheet(){
    if(marksAutoSaveTimer){ clearTimeout(marksAutoSaveTimer); marksAutoSaveTimer = null; }
    window.removeEventListener('beforeunload', marksBeforeUnloadGuard);
    await ensureDataLoaded('examResults', loadExamResultsData);
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    const check = marksApplySheet(exam, true);
    if(check.hasInvalid){
      const inp = check.firstInvalid;
      const part = inp.dataset.part ? ' ' + inp.dataset.part : '';
      showToast(`Marks for "${inp.dataset.subject}"${part} must be between 0 and ${inp.max} — please fix the highlighted entry.`);
      inp.focus();
      return;
    }
    marksApplySheet(exam, false);
    const ok = await storageSet(EXAM_RESULTS_KEY, examResults);
    const status = document.getElementById('marksAutoSaveStatus');
    if(ok === false){
      if(status) status.textContent = '⚠️ NOT saved to the server yet — check your connection. Keep this page open; retrying…';
      window.addEventListener('beforeunload', marksBeforeUnloadGuard);
      if(!marksAutoSaveTimer) marksAutoSaveTimer = setTimeout(autoSaveMarksSheet, 5000);
      showToast('Marks NOT saved to the server yet — keep this page open, it will retry automatically.');
      return;
    }
    if(status) status.textContent = '✅ All changes saved';
    showToast('Marks saved.', 'burst');
  }

  async function importMarksExcel(e){
    await ensureDataLoaded('examResults', loadExamResultsData);
    if(!(await ensureXLSX())) { e.target.value=''; return; }
    const file = e.target.files[0];
    if(!file) return;
    const exam = examDefs.find(ex => ex.id === examCurrentExamId);
    const subjects = getExamSubjects(exam, examCurrentClass, examCurrentSection);
    const reader = new FileReader();
    reader.onload = async function(evt){
      try{
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type:'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval:'' });
        let updated = 0, notFound = 0, badCells = 0;
        rows.forEach(rec => {
          const norm = {}; Object.keys(rec).forEach(k => norm[k.trim().toLowerCase()] = rec[k]);
          const admNo = (norm['admission no'] || norm['admissionno'] || '').toString().trim();
          const student = students.find(s => (s.admissionNo||'').toLowerCase() === admNo.toLowerCase());
          if(!student){ notFound++; return; }
          subjects.forEach(subj => {
            const key = subj.name.trim().toLowerCase();
            const im = subjInternalMax(subj);
            const num = raw => { const t = (raw == null ? '' : raw).toString().trim(); return t === '' ? null : Number(t); };
            const isAb = raw => ['AB','ABSENT'].includes((raw == null ? '' : raw).toString().trim().toUpperCase());
            let r = examResults.find(r => r.examId===exam.id && r.studentId===student.id && r.subject===subj.name);
            const put = (marks, absent, written, internal) => {
              if(!r){ r = { id:'res_'+student.id+'_'+exam.id+'_'+subj.name.replace(/\s/g,''), examId:exam.id, studentId:student.id, subject:subj.name }; examResults.push(r); }
              r.marks = marks; r.absent = absent;
              if(im){ r.written = written; r.internal = internal; } else { delete r.written; delete r.internal; }
              updated++;
            };
            // Split subject: "<Subject> Written" + "<Subject> Internal" columns (brackets optional).
            const wKey = [key+' written', key+' (written)'].find(k => k in norm);
            const iKey = [key+' internal', key+' (internal)'].find(k => k in norm);
            if(im && (wKey || iKey)){
              const rawW = wKey ? norm[wKey] : '', rawI = iKey ? norm[iKey] : '';
              if(isAb(rawW) || isAb(rawI)){ put(null, true, null, null); return; }
              const w = num(rawW), i = num(rawI);
              if(w === null && i === null) return;
              if((w !== null && (isNaN(w) || w < 0 || w > subjWrittenMax(subj))) || (i !== null && (isNaN(i) || i < 0 || i > im))){ badCells++; return; }
              put(Math.round(((w||0) + (i||0)) * 100) / 100, false, w, i);
              return;
            }
            if(!(key in norm)) return;
            const raw = norm[key].toString().trim();
            const isAbsent = isAb(raw);
            const marks = isAbsent ? null : (raw==='' ? null : Number(raw));
            if(marks === null && !isAbsent) return;
            if(marks !== null && (isNaN(marks) || marks < 0 || marks > (Number(subj.maxMarks)||Infinity))){ badCells++; return; }
            // A plain column on a split subject is the TOTAL; it has no written/internal breakdown.
            put(marks, isAbsent, null, null);
            if(im){ delete r.written; delete r.internal; }
          });
        });
        await storageSet(EXAM_RESULTS_KEY, examResults);
        renderMarksSheet(document.getElementById('examBody'));
        showToast(`${updated} mark(s) updated from Excel.${notFound ? ' '+notFound+' row(s) had no matching Admission No.' : ''}${badCells ? ' '+badCells+' value(s) were skipped because they are above the maximum or not a number.' : ''}`, 'ringdraw');
      }catch(err){
        showToast('Could not read that file: ' + (err && err.message ? err.message : err));
      }
      e.target.value = '';
    };
    reader.onerror = function(){ showToast('Could not read the selected file.'); e.target.value=''; };
    reader.readAsArrayBuffer(file);
  }

  /* --- Tab: Report Cards (individual + bulk downloads) --- */

  let rcSearchDebounce = null, rcCurrentStudentId = '';
  function coScholasticEditorHtml(s, exam, t){
    if(!t || t.layout !== 'modern') return '';
    const rec = examCoScholastic[coScholasticKeyFor(exam.id, s.id)] || { areas:{}, discipline:'' };
    const areas = t.coScholasticAreas && t.coScholasticAreas.length ? t.coScholasticAreas : DEFAULT_COSCHOLASTIC_AREAS;
    const grades = ['','A','B','C','D','E'];
    const gradeSelect = (id, current) => `<select id="${id}">${grades.map(g => `<option value="${g}" ${current===g?'selected':''}>${g||'— Not graded —'}</option>`).join('')}</select>`;
    return `
      <div class="profile-card" style="margin-top:16px; max-width:520px;">
        <h4 style="margin-bottom:10px;">Co-Scholastic Areas — ${t.name}</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:12px;">This template uses the CBSE-style layout, which prints a co-scholastic grade section. Set grades once per student per exam — they carry over to every future print until changed.</p>
        <div class="form-grid">
        ${areas.map(a => `<div class="f-field"><label>${a}</label>${gradeSelect('csg_'+a.replace(/[^a-zA-Z0-9]/g,''), (rec.areas&&rec.areas[a])||'')}</div>`).join('')}
        ${t.showDiscipline!==false ? `<div class="f-field"><label>Discipline</label>${gradeSelect('csg_discipline', rec.discipline||'')}</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="saveCoScholasticGrades('${exam.id}','${s.id}')">Save Grades</button>
      </div>
    `;
  }


  function buildInfoFieldLines(s, exam, t){
    const fields = t.infoFields || DEFAULT_INFO_FIELDS;
    const labels = { admissionNo:'Admission No', rollNo:'Roll Number', className:'Class', section:'Section', fatherName:'Father Name', motherName:'Mother Name', dob:'Date of Birth', gender:'Gender', bloodGroup:'Blood Group', address:'Address', phone:'Phone', email:'Email' };
    let lines = `<div>Student Name: <b>${s.firstName} ${s.lastName}</b></div>`;
    if(fields.className && fields.section){
      lines += `<div>Class &amp; Section: <b>${s.className} — ${s.section}</b></div>`;
    }else{
      if(fields.className) lines += `<div>Class: <b>${s.className||'—'}</b></div>`;
      if(fields.section) lines += `<div>Section: <b>${s.section||'—'}</b></div>`;
    }
    Object.keys(labels).forEach(key => {
      if(key==='className' || key==='section') return;
      if(fields[key]) lines += `<div>${labels[key]}: <b>${studentInfoFieldValue(s, key)}</b></div>`;
    });
    if(fields.examPeriod !== false){
      lines += `<div>Exam Period: <b>${exam.startDate ? exam.startDate + (exam.endDate && exam.endDate!==exam.startDate ? ' – '+exam.endDate : '') : 'To be announced'}</b></div>`;
    }
    if(fields.attendance !== false){
      const attEndDate = exam.endDate || exam.startDate;
      if(attEndDate){
        const attStats = computeAttendanceStats(s.id, undefined, attEndDate);
        lines += attStats.total > 0
          ? `<div>Attendance (till ${attEndDate}): <b>${attStats.present+attStats.late} / ${attStats.total} days (${attStats.pct}%)</b></div>`
          : `<div>Attendance (till ${attEndDate}): <b>No attendance recorded yet</b></div>`;
      }else{
        lines += `<div>Attendance: <b>Set an exam date to show attendance</b></div>`;
      }
    }
    return lines;
  }
  function classTopperMarksFor(exam, className, section, subjectName){
    const cohort = students.filter(x => x.className===className && x.section===section && isActive(x));
    let top = null;
    cohort.forEach(x => {
      const r = examResults.find(r => r.examId===exam.id && r.studentId===x.id && r.subject===subjectName);
      if(r && r.marks !== null && !r.absent){
        if(top === null || r.marks > top) top = r.marks;
      }
    });
    return top;
  }
  // Class-and-section rank for one exam: every active student in the same
  // class AND section is scored the same way the report card scores its own
  // student (countable subjects only, same total-obtained/total-max math —
  // see the fix for the report card percentage bug), then ranked highest
  // percentage first. Ties share a rank and the next distinct score skips
  // ahead to reflect how many students are ahead of it (1, 2, 2, 4 — the
  // usual "competition ranking" convention on Indian school report cards),
  // rather than every tied student getting a different number. A student
  // with no countable subjects for this exam (nothing to score) is left out
  // of the ranking entirely rather than counted as a last-place 0%.
  function classSectionRankFor(exam, className, section, studentId){
    const cohort = students.filter(x => x.className===className && x.section===section && isActive(x));
    const scored = [];
    cohort.forEach(x => {
      const subjRows = getExamSubjects(exam, x.className, x.section).filter(subj => subj.countable !== false).map(subj => {
        const r = examResults.find(r => r.examId===exam.id && r.studentId===x.id && r.subject===subj.name);
        return { marks: r ? r.marks : null, max: subj.maxMarks };
      });
      const totalMax = subjRows.reduce((sum,r) => sum+r.max, 0);
      const totalObtained = subjRows.reduce((sum,r) => sum+(Number(r.marks)||0), 0);
      if(totalMax > 0) scored.push({ id: x.id, pct: (totalObtained/totalMax)*100 });
    });
    if(scored.length === 0) return null;
    scored.sort((a,b) => b.pct - a.pct);
    let rank = 1;
    scored.forEach((row,i) => {
      if(i > 0 && row.pct < scored[i-1].pct) rank = i+1;
      row.rank = rank;
    });
    const mine = scored.find(x => x.id === studentId);
    return mine ? { rank: mine.rank, outOf: scored.length } : null;
  }
  function ordinalSuffix(n){
    const rem100 = n % 100;
    if(rem100 >= 11 && rem100 <= 13) return n + 'th';
    switch(n % 10){
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }
  function coScholasticSectionHtml(s, exam, t){
    if(!t || t.layout !== 'modern') return '';
    const rec = examCoScholastic[coScholasticKeyFor(exam.id, s.id)] || { areas:{}, discipline:'' };
    const areas = t.coScholasticAreas && t.coScholasticAreas.length ? t.coScholasticAreas : DEFAULT_COSCHOLASTIC_AREAS;
    const areaLines = areas.map(a => `<div><span>${a}</span><b>${(rec.areas && rec.areas[a]) || '—'}</b></div>`).join('');
    const disciplineLine = t.showDiscipline!==false ? `<div><span>Discipline</span><b>${rec.discipline || '—'}</b></div>` : '';
    return `
      <div class="rc-cosch-title">CO-SCHOLASTIC AREAS (Grade A–E)</div>
      <div class="rc-cosch-grid">${areaLines}${disciplineLine}</div>
    `;
  }

  /* --- Tab: Results Summary --- */
  function renderResultsSummaryTab(body){
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b></div>`;
      return;
    }
    if(!resultsFilters.examId || !examDefs.find(e => e.id === resultsFilters.examId)) resultsFilters.examId = examDefs[0].id;
    const exam = examDefs.find(e => e.id === resultsFilters.examId);
    let list = students.filter(isActive);
    if(resultsFilters.className) list = list.filter(s => s.className === resultsFilters.className);
    if(resultsFilters.section) list = list.filter(s => s.section === resultsFilters.section);

    const rows = list.map(s => {
      const subjRows = getExamSubjects(exam, s.className, s.section).filter(subj => subj.countable !== false).map(subj => {
        const r = examResults.find(r => r.examId===exam.id && r.studentId===s.id && r.subject===subj.name);
        return { marks: r ? r.marks : null, max: subj.maxMarks };
      });
      const totalMax = subjRows.reduce((sum,r) => sum+r.max, 0);
      const totalObtained = subjRows.reduce((sum,r) => sum+(Number(r.marks)||0), 0);
      const hasAny = subjRows.some(r => r.marks !== null);
      const pct = totalMax > 0 ? Math.round((totalObtained/totalMax)*1000)/10 : 0;
      return { s, totalObtained, totalMax, pct, hasAny, grade: gradeForPct(pct) };
    }).filter(r => r.hasAny).sort((a,b) => b.pct - a.pct);

    const avgPct = rows.length ? Math.round((rows.reduce((sum,r) => sum+r.pct, 0)/rows.length)*10)/10 : 0;
    const highest = rows.length ? rows[0].pct : 0;
    const passCount = rows.filter(r => !isFailGrade(r.grade)).length;

    body.innerHTML = `
      <div class="ms-toolbar">
        <div class="ms-toolbar-left">
          <select id="rsExam" onchange="onResultsFilterChange()">${examDefs.map(ex => `<option value="${ex.id}" ${resultsFilters.examId===ex.id?'selected':''}>${ex.name}</option>`).join('')}</select>
          <select id="rsClass" onchange="onResultsFilterChange()"><option value="">All Classes</option>${CLASS_LEVELS.map(c => `<option ${resultsFilters.className===c?'selected':''}>${c}</option>`).join('')}</select>
          <select id="rsSection" onchange="onResultsFilterChange()"><option value="">All Sections</option>${SECTIONS.map(s => `<option value="${s}" ${resultsFilters.section===s?'selected':''}>Section ${s}</option>`).join('')}</select>
        </div>
        <div>
          <button class="btn btn-ghost btn-sm" onclick="downloadResultsSummaryExcel()">📥 Excel</button> <button class="btn btn-ghost btn-sm" onclick="downloadResultsSummaryPDF()">📄 PDF</button>
        </div>
      </div>
      <div class="fee-summary-row">
        <div class="fee-sum-card"><b>${rows.length}</b><span>Students with marks</span></div>
        <div class="fee-sum-card"><b>${avgPct}%</b><span>Class Average</span></div>
        <div class="fee-sum-card"><b>${highest}%</b><span>Highest</span></div>
        <div class="fee-sum-card"><b>${passCount}/${rows.length}</b><span>Passed</span></div>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Rank</th><th>Student</th><th>Class</th><th>Marks</th><th>%</th><th>Grade</th></tr></thead>
        <tbody>
        ${rows.map((r,i) => `<tr>
          <td>${i+1}</td>
          <td class="name-cell">${r.s.firstName} ${r.s.lastName}</td>
          <td><span class="pill">${r.s.className} - ${r.s.section}</span></td>
          <td>${r.totalObtained} / ${r.totalMax}</td>
          <td class="att-pct ${isFailGrade(r.grade)?'bad':'good'}">${r.pct}%</td>
          <td><span class="grade-pill ${isFailGrade(r.grade)?'fail':''}">${r.grade}</span></td>
        </tr>`).join('')}
        </tbody></table>
        ${rows.length===0 ? `<div class="empty-state"><b>No marks entered yet for this selection</b></div>` : ``}
      </div>
    `;
  }
  function resultsSummaryReportRows(){
    const exam = examDefs.find(e => e.id === resultsFilters.examId);
    let list = students.filter(isActive);
    if(resultsFilters.className) list = list.filter(s => s.className === resultsFilters.className);
    if(resultsFilters.section) list = list.filter(s => s.section === resultsFilters.section);
    const rows = list.map(s => {
      const subjRows = getExamSubjects(exam, s.className, s.section).filter(subj => subj.countable !== false).map(subj => {
        const r = examResults.find(r => r.examId===exam.id && r.studentId===s.id && r.subject===subj.name);
        return { marks: r ? r.marks : null, max: subj.maxMarks };
      });
      const totalMax = subjRows.reduce((sum,r) => sum+r.max, 0);
      const totalObtained = subjRows.reduce((sum,r) => sum+(Number(r.marks)||0), 0);
      const hasAny = subjRows.some(r => r.marks !== null);
      const pct = totalMax > 0 ? Math.round((totalObtained/totalMax)*1000)/10 : 0;
      return { s, totalObtained, totalMax, pct, hasAny, grade: gradeForPct(pct) };
    }).filter(r => r.hasAny).sort((a,b) => b.pct - a.pct);
    return rows.map((r,i) => ({
      'Rank': i+1, 'Student': r.s.firstName+' '+r.s.lastName, 'Class': r.s.className+' - '+r.s.section,
      'Marks Obtained': r.totalObtained, 'Total Marks': r.totalMax, '%': r.pct, 'Grade': r.grade,
    }));
  }
  function downloadResultsSummaryExcel(){
    const exam = examDefs.find(e => e.id === resultsFilters.examId);
    exportRowsToExcel('results_summary_'+(exam?exam.name.replace(/\s/g,'_'):'report')+'.xlsx', 'Results Summary', resultsSummaryReportRows());
  }
  function downloadResultsSummaryPDF(){
    const exam = examDefs.find(e => e.id === resultsFilters.examId);
    exportRowsToPDF('Results Summary', exam ? exam.name : '', resultsSummaryReportRows());
  }
  function onResultsFilterChange(){
    resultsFilters = {
      examId: document.getElementById('rsExam').value,
      className: document.getElementById('rsClass').value,
      section: document.getElementById('rsSection').value,
    };
    renderResultsSummaryTab(document.getElementById('examBody'));
  }

  /* --- Tab: Grading Scale --- */
  /* --- Report Templates (multiple, editable) --- */
  const REPORT_TEMPLATES_KEY = "report-templates";
  OBJECT_BACKED_KEYS[REPORT_TEMPLATES_KEY] = '/api/kv/' + REPORT_TEMPLATES_KEY;
  let reportTemplates = [];
  let templatesView = 'list';
  let editingTemplateId = '';
  // Default co-scholastic areas for the 'modern' (CBSE-style) report card layout —
  // schools can rename/add/remove these per template via the Customize Wizard.
  const DEFAULT_COSCHOLASTIC_AREAS = ['Work Education', 'Art Education', 'Health & Physical Education'];
  async function loadReportTemplates(){
    reportTemplates = await storageGet(REPORT_TEMPLATES_KEY, [
      { id:'tmpl_classic', name:'Classic', layout:'classic', titleOverride:'', signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent', footerNote:'', showElective:true, showNotCounted:true, showAttendance:true, isDefault:true },
      { id:'tmpl_compact', name:'Compact', layout:'classic', titleOverride:'PROGRESS REPORT', signatureLabel1:'Class Teacher', signatureLabel2:'Head Master', footerNote:'', showElective:false, showNotCounted:false, showAttendance:true, isDefault:false },
      { id:'tmpl_annual', name:'Annual Result', layout:'classic', titleOverride:'ANNUAL PROGRESS REPORT', signatureLabel1:'Class Teacher', signatureLabel2:'Principal', footerNote:'This report card is valid only with the school seal.', showElective:true, showNotCounted:true, showAttendance:true, isDefault:false },
      { id:'tmpl_cbse', name:'CBSE Style (Co-Scholastic)', layout:'modern', titleOverride:'PROGRESS REPORT', signatureLabel1:'Class Teacher', signatureLabel2:'Principal', footerNote:'', showElective:true, showNotCounted:true, showAttendance:true, coScholasticAreas:DEFAULT_COSCHOLASTIC_AREAS.slice(), showDiscipline:true, isDefault:false },
    ]);
    // Non-breaking migration: any template saved before the 'layout' field
    // existed (or before co-scholastic support) gets safe defaults so old
    // saved templates keep behaving exactly as they did.
    reportTemplates.forEach(t => {
      if(!t.layout) t.layout = 'classic';
      if(!t.coScholasticAreas) t.coScholasticAreas = DEFAULT_COSCHOLASTIC_AREAS.slice();
      if(t.showDiscipline === undefined) t.showDiscipline = true;
    });
  }

  /* --- Admit Card Templates (multiple layouts, editable) --- */
  const ADMIT_CARD_TEMPLATES_KEY = "admit-card-templates";
  OBJECT_BACKED_KEYS[ADMIT_CARD_TEMPLATES_KEY] = '/api/kv/' + ADMIT_CARD_TEMPLATES_KEY;
  let admitCardTemplates = [];
  const DEFAULT_AC_INSTRUCTIONS = [
    'Bring this admit card to every examination — no entry without it.',
    'Report to the exam hall at least 15 minutes before the scheduled time.',
    'Mobile phones and other electronic devices are not allowed inside the exam hall.',
    'This card must be signed by the invigilator after every paper.',
  ].join('\n');
  async function loadAdmitCardTemplates(){
    admitCardTemplates = await storageGet(ADMIT_CARD_TEMPLATES_KEY, [
      { id:'ac_classic', name:'Classic Strip', layout:'strip', cardsPerPage:4, titleOverride:'', instructionsText:'', footerNote:'', isDefault:true },
      { id:'ac_modern', name:'Modern Card', layout:'grid4', cardsPerPage:4, titleOverride:'', instructionsText:DEFAULT_AC_INSTRUCTIONS, footerNote:'', isDefault:false },
      { id:'ac_full', name:'Full Board-Style', layout:'full', cardsPerPage:1, titleOverride:'', instructionsText:DEFAULT_AC_INSTRUCTIONS, footerNote:'', isDefault:false },
    ]);
  }

  /* --- Co-Scholastic Grades (CBSE-style 'modern' report card layout only) ---
     Keyed examId::studentId -> { areas:{areaName:grade}, discipline:grade }.
     Entirely optional — a report card prints fine with nothing set (shows
     "—"), so this never blocks generating cards for classes that don't use
     the modern layout. */
  const EXAM_COSCHOLASTIC_KEY = "exam-coscholastic";
  OBJECT_BACKED_KEYS[EXAM_COSCHOLASTIC_KEY] = '/api/kv/' + EXAM_COSCHOLASTIC_KEY;
  let examCoScholastic = {};
  async function loadExamCoScholastic(){
    examCoScholastic = await storageGet(EXAM_COSCHOLASTIC_KEY, {});
  }
  function coScholasticKeyFor(examId, studentId){ return examId + '::' + studentId; }
  async function saveCoScholasticGrades(examId, studentId){
    const t = currentReportTemplate();
    const areas = (t && t.coScholasticAreas) || DEFAULT_COSCHOLASTIC_AREAS;
    const rec = { areas:{}, discipline:'' };
    areas.forEach(a => {
      const el = document.getElementById('csg_'+a.replace(/[^a-zA-Z0-9]/g,''));
      if(el) rec.areas[a] = el.value;
    });
    const discEl = document.getElementById('csg_discipline');
    if(discEl) rec.discipline = discEl.value;
    examCoScholastic[coScholasticKeyFor(examId, studentId)] = rec;
    await storageSet(EXAM_COSCHOLASTIC_KEY, examCoScholastic);
    showToast('Co-scholastic grades saved.', 'burst');
    loadReportCardPreview();
  }
  function renderReportTemplatesTab(body){
    if(templatesView === 'edit') return renderTemplateEditor(body);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">
        Create multiple progress report layouts — Classic or the CBSE-style Modern layout with co-scholastic grading, different titles, signature wording, uploaded signatures, or footer notes — then pick which one to use each time you print, from the Progress Reports tab.
      </p>
      <button class="btn btn-primary btn-sm" style="margin-bottom:16px;" onclick="openTemplateManager('reportcard')">+ Add Template — Customize Wizard</button>
      <div class="table-wrap" style="max-width:960px;">
        <table><thead><tr><th>Template</th><th>Layout</th><th>Title</th><th>Signatures</th><th>Attendance</th><th>Default</th><th></th></tr></thead>
        <tbody>
        ${reportTemplates.map(t => `<tr>
          <td class="name-cell">${t.name}</td>
          <td>${t.layout==='modern' ? 'Modern (CBSE-style)' : 'Classic'}</td>
          <td>${t.titleOverride || '(uses exam name)'}</td>
          <td>${t.signatureLabel1}${t.sigImage1?' 🖼':''} / ${t.signatureLabel2}${t.sigImage2?' 🖼':''}</td>
          <td>${t.showAttendance!==false ? '✓' : '—'}</td>
          <td>${t.isDefault ? '<span class="pill">Default</span>' : `<button class="btn-edit-text" onclick="setDefaultTemplate('${t.id}')">Set Default</button>`}</td>
          <td><button class="btn-edit-text" onclick="openTemplateManagerEdit('reportcard','${t.id}')">Edit</button>&nbsp;·&nbsp;<button class="btn-edit-text" onclick="duplicateTemplate('${t.id}')">Duplicate</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteTemplate('${t.id}')">Delete</button></td>
        </tr>`).join('')}
        </tbody></table>
      </div>
    `;
  }
  let sig1Data = '', sig2Data = '';
  function openTemplateEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingTemplateId = id || '';
    const t = editingTemplateId ? reportTemplates.find(x => x.id === editingTemplateId) : null;
    sig1Data = t ? (t.sigImage1||'') : '';
    sig2Data = t ? (t.sigImage2||'') : '';
    templatesView = 'edit';
    renderResultBody();
  }
  function backToTemplatesList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    templatesView = 'list';
    renderResultBody();
  }
  async function duplicateTemplate(id){
    const src = reportTemplates.find(t => t.id === id);
    if(!src) return;
    const copy = { ...src, id: 'tmpl_'+Date.now(), name: src.name+' (Copy)', isDefault: false };
    reportTemplates.push(copy);
    await storageSet(REPORT_TEMPLATES_KEY, reportTemplates);
    renderReportTemplatesTab(document.getElementById('resultBody'));
    showToast('Template duplicated — edit it to make it your own.', 'burst');
  }
  const INFO_FIELD_DEFS = [
    { key:'studentName', label:'Student Name' },
    { key:'admissionNo', label:'Admission Number' },
    { key:'rollNo', label:'Roll Number' },
    { key:'className', label:'Class' },
    { key:'section', label:'Section' },
    { key:'fatherName', label:'Father Name' },
    { key:'motherName', label:'Mother Name' },
    { key:'dob', label:'Date of Birth' },
    { key:'gender', label:'Gender' },
    { key:'bloodGroup', label:'Blood Group' },
    { key:'address', label:'Address' },
    { key:'phone', label:'Phone Number' },
    { key:'email', label:'Email' },
    { key:'examPeriod', label:'Exam Period' },
    { key:'attendance', label:'Attendance' },
  ];
  const DEFAULT_INFO_FIELDS = { studentName:true, admissionNo:true, rollNo:false, className:true, section:true, fatherName:true, motherName:false, dob:false, gender:false, bloodGroup:false, address:false, phone:false, email:false, examPeriod:true, attendance:true };
  function studentInfoFieldValue(s, key){
    switch(key){
      case 'studentName': return s.firstName+' '+s.lastName;
      case 'admissionNo': return s.admissionNo || '—';
      case 'rollNo': return s.rollNo || '—';
      case 'className': return s.className || '—';
      case 'section': return s.section || '—';
      case 'fatherName': return s.fatherName || '—';
      case 'motherName': return s.motherName || '—';
      case 'dob': return s.dob || '—';
      case 'gender': return s.gender || '—';
      case 'bloodGroup': return s.blood || '—';
      case 'address': return s.fatherAddress || s.motherAddress || s.guardianAddress || '—';
      case 'phone': return s.fatherPhone || s.motherPhone || s.guardianPhone || '—';
      case 'email': return s.email || '—';
      default: return '—';
    }
  }
  function renderTemplateEditor(body){
    const t = editingTemplateId ? reportTemplates.find(x => x.id === editingTemplateId) : null;
    const infoFields = t && t.infoFields ? t.infoFields : DEFAULT_INFO_FIELDS;
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToTemplatesList()">Report Templates</a> &nbsp;/&nbsp; ${t ? t.name : 'New Template'}</div>
      <div class="profile-card" style="max-width:620px;">
        <div class="form-grid">
          <div class="f-field full"><label>Report Period Name <span class="required-star">*</span></label><input type="text" id="tmplName" value="${t?t.name:''}" placeholder="e.g. Half Yearly Format"></div>
          <div class="f-field full"><label>Title Override <span style="font-weight:400; color:var(--ink-soft);">— leave blank to use "REPORT CARD — [Exam Name]"</span></label><input type="text" id="tmplTitle" value="${t?(t.titleOverride||''):''}" placeholder="e.g. HALF YEARLY PROGRESS REPORT"></div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Student Info Fields to Show</label>
        <div class="disc-checklist" style="max-height:220px; margin-bottom:6px; display:grid; grid-template-columns:1fr 1fr; gap:2px 10px;">
          ${INFO_FIELD_DEFS.map(f => `<label class="disc-check-item"><input type="checkbox" class="tmpl-infofield-check" value="${f.key}" ${infoFields[f.key]?'checked':''} ${f.key==='studentName'?'disabled checked':''}> ${f.label}</label>`).join('')}
        </div>
        <p style="font-size:0.74rem; color:var(--ink-soft); margin:0 0 14px;">Student Name always shows. Pick whichever else your school wants on this layout — fields with no data on file simply show "—".</p>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Signature 1</label>
        <div class="form-grid">
          <div class="f-field"><label>Label</label><input type="text" id="tmplSig1" value="${t?t.signatureLabel1:'Class Teacher'}"></div>
          <div class="f-field">
            <label>Signature Image</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <img id="sig1Preview" src="${sig1Data}" style="height:36px; ${sig1Data?'':'display:none;'} border-bottom:1px solid var(--border);">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload<input type="file" accept="image/*" style="display:none;" onchange="previewSignature(event,1)"></label>
              ${sig1Data ? `<button type="button" class="btn-danger-text" onclick="clearSignature(1)">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Signature 2</label>
        <div class="form-grid">
          <div class="f-field"><label>Label</label><input type="text" id="tmplSig2" value="${t?t.signatureLabel2:'Principal / Correspondent'}"></div>
          <div class="f-field">
            <label>Signature Image</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <img id="sig2Preview" src="${sig2Data}" style="height:36px; ${sig2Data?'':'display:none;'} border-bottom:1px solid var(--border);">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload<input type="file" accept="image/*" style="display:none;" onchange="previewSignature(event,2)"></label>
              ${sig2Data ? `<button type="button" class="btn-danger-text" onclick="clearSignature(2)">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <div class="form-grid" style="margin-top:14px;">
          <div class="f-field full"><label>Footer Note</label><input type="text" id="tmplFooter" value="${t?(t.footerNote||''):''}" placeholder="Optional remark shown at the bottom of the card"></div>
        </div>
        <div style="display:flex; gap:30px; margin:14px 0; flex-wrap:wrap;">
          <label class="admission-toggle"><input type="checkbox" id="tmplShowElective" ${(!t || t.showElective!==false)?'checked':''}> Show "Elective" tag</label>
          <label class="admission-toggle"><input type="checkbox" id="tmplShowNotCounted" ${(!t || t.showNotCounted!==false)?'checked':''}> Show "Not counted" tag</label>
          <label class="admission-toggle"><input type="checkbox" id="tmplShowClassTopper" ${(!t || t.showClassTopper!==false)?'checked':''}> Show Highest Marks in Class per subject</label>
          <label class="admission-toggle"><input type="checkbox" id="tmplShowRank" ${(!t || t.showRank!==false)?'checked':''}> Show Class Rank (section-wise)</label>
        </div>
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" onclick="backToTemplatesList()">Cancel</button>
          <button class="btn btn-primary" onclick="saveTemplate()">Save Report Period</button>
        </div>
      </div>
    `;
  }
  function previewSignature(e, which){
    readImageFileWithSizeLimit(e, dataUrl => {
      if(which===1){ sig1Data = dataUrl; document.getElementById('sig1Preview').src = sig1Data; document.getElementById('sig1Preview').style.display='inline-block'; }
      else { sig2Data = dataUrl; document.getElementById('sig2Preview').src = sig2Data; document.getElementById('sig2Preview').style.display='inline-block'; }
      renderTemplateEditor(document.getElementById('resultBody')); // refresh to show Remove button
    });
  }
  function clearSignature(which){
    if(which===1) sig1Data=''; else sig2Data='';
    renderTemplateEditor(document.getElementById('resultBody'));
  }
  async function saveTemplate(){
    const name = document.getElementById('tmplName').value.trim();
    if(!name){ showToast('Enter a name for the report period.'); return; }
    const infoFields = {};
    INFO_FIELD_DEFS.forEach(f => {
      infoFields[f.key] = f.key === 'studentName' ? true : document.querySelector(`.tmpl-infofield-check[value="${f.key}"]`).checked;
    });
    const data = {
      name,
      titleOverride: document.getElementById('tmplTitle').value.trim(),
      infoFields,
      signatureLabel1: document.getElementById('tmplSig1').value.trim() || 'Class Teacher',
      signatureLabel2: document.getElementById('tmplSig2').value.trim() || 'Principal / Correspondent',
      sigImage1: sig1Data, sigImage2: sig2Data,
      footerNote: document.getElementById('tmplFooter').value.trim(),
      showElective: document.getElementById('tmplShowElective').checked,
      showNotCounted: document.getElementById('tmplShowNotCounted').checked,
      showClassTopper: document.getElementById('tmplShowClassTopper').checked,
      showRank: document.getElementById('tmplShowRank').checked,
      showAttendance: infoFields.attendance,
    };
    if(editingTemplateId){
      const idx = reportTemplates.findIndex(x => x.id === editingTemplateId);
      reportTemplates[idx] = { ...reportTemplates[idx], ...data };
    }else{
      data.id = 'tmpl_' + Date.now();
      data.isDefault = reportTemplates.length === 0;
      reportTemplates.push(data);
    }
    await storageSet(REPORT_TEMPLATES_KEY, reportTemplates);
    showToast('Template saved.', 'burst');
    backToTemplatesList();
  }
  async function setDefaultTemplate(id){
    reportTemplates.forEach(t => { t.isDefault = (t.id === id); });
    await storageSet(REPORT_TEMPLATES_KEY, reportTemplates);
    renderReportTemplatesTab(document.getElementById('resultBody'));
  }
  async function deleteTemplate(id){
    if(reportTemplates.length <= 1){ showToast('Keep at least one template.'); return; }
    if(!await showConfirmDialog('Delete this template?')) return;
    const wasDefault = reportTemplates.find(t => t.id === id) && reportTemplates.find(t => t.id === id).isDefault;
    reportTemplates = reportTemplates.filter(t => t.id !== id);
    if(wasDefault && reportTemplates.length) reportTemplates[0].isDefault = true;
    await storageSet(REPORT_TEMPLATES_KEY, reportTemplates);
    renderReportTemplatesTab(document.getElementById('resultBody'));
  }

  /* --- Reusable Customize Wizard: manages both Admit Card templates and Report
     Card templates from one step-based modal (Layout → Details → Review). --- */
  let twKind = 'reportcard';   // 'reportcard' | 'admitcard'
  let twListView = true;       // true = template list inside the modal, false = wizard steps
  let twStep = 1;
  let twEditingId = '';
  let twDraft = {};
  let twSig1Data = '', twSig2Data = '';

  const AC_LAYOUT_DEFS = [
    { key:'strip', name:'Classic Strip', blurb:'3–4 full-width hall-ticket strips stacked per A4 sheet, each with its own subject-wise date sheet and a signature cell per day. The most common format for internal school exams.' },
    { key:'grid4', name:'Modern Card', blurb:'4 compact ID-style cards per A4 sheet in a 2×2 grid — photo, key details and hall ticket number, without a per-subject table. Fast to print for a whole class.' },
    { key:'full', name:'Full Board-Style', blurb:'One full A4 page per candidate, board-exam style — larger photo, a full candidate-instructions block and the complete subject-wise date sheet. Best for board or competitive exams.' },
  ];
  const RC_LAYOUT_DEFS = [
    { key:'classic', name:'Classic', blurb:'Subject-wise marks table with grade, remarks and signatures — the standard scholastic-only report card.' },
    { key:'modern', name:'Modern (CBSE-style)', blurb:'Adds a co-scholastic grading section (Work Education, Art, Health & Physical Education, each graded A–E) plus a separate Discipline grade, alongside the scholastic marks table.' },
  ];

  function openTemplateManager(kind){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    twKind = kind;
    twListView = true;
    twStep = 1;
    twEditingId = '';
    twDraft = {};
    document.getElementById('templateWizardOverlay').classList.add('open');
    renderTemplateWizard();
  }
  function closeTemplateWizard(){
    document.getElementById('templateWizardOverlay').classList.remove('open');
  }
  function openTemplateManagerEdit(kind, id){
    openTemplateManager(kind);
    twStartEdit(id);
  }
  function twTemplates(){ return twKind === 'admitcard' ? admitCardTemplates : reportTemplates; }
  function twStorageKey(){ return twKind === 'admitcard' ? ADMIT_CARD_TEMPLATES_KEY : REPORT_TEMPLATES_KEY; }
  function twLayoutDefs(){ return twKind === 'admitcard' ? AC_LAYOUT_DEFS : RC_LAYOUT_DEFS; }
  function twKindLabel(){ return twKind === 'admitcard' ? 'Admit Card' : 'Progress Report'; }
  function twStepTitles(){ return twKind === 'admitcard' ? ['Choose Layout','Details & Content','Review & Save'] : ['Choose Layout','Details & Signatures','Review & Save']; }

  function renderTemplateWizard(){
    const box = document.getElementById('templateWizardBody');
    if(!box) return;
    box.innerHTML = twListView ? twRenderList() : twRenderWizardStep();
  }
  function twRenderList(){
    const list = twTemplates();
    return `
      <h2 style="font-size:1.08rem; margin-bottom:4px;">${twKindLabel()} Templates</h2>
      <p class="modal-sub">Create multiple ${twKindLabel().toLowerCase()} layouts, then pick which one to use each time you print.</p>
      <button class="btn btn-primary btn-sm" style="margin-bottom:14px;" onclick="twStartNew()">+ New Template — Customize Wizard</button>
      <div class="table-wrap">
        <table><thead><tr><th>Template</th><th>Layout</th><th>Default</th><th></th></tr></thead>
        <tbody>
        ${list.map(t => `<tr>
          <td class="name-cell">${t.name}</td>
          <td>${(twLayoutDefs().find(l=>l.key===t.layout)||{}).name || t.layout}</td>
          <td>${t.isDefault ? '<span class="pill">Default</span>' : `<button class="btn-edit-text" onclick="twSetDefault('${t.id}')">Set Default</button>`}</td>
          <td><button class="btn-edit-text" onclick="twStartEdit('${t.id}')">Edit</button>&nbsp;·&nbsp;<button class="btn-edit-text" onclick="twDuplicate('${t.id}')">Duplicate</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="twDelete('${t.id}')">Delete</button></td>
        </tr>`).join('')}
        </tbody></table>
      </div>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="closeTemplateWizard()">Close</button>
      </div>
    `;
  }
  function twDefaultDraft(){
    if(twKind === 'admitcard'){
      return { id:'', name:'', layout:'strip', cardsPerPage:4, titleOverride:'', instructionsText:DEFAULT_AC_INSTRUCTIONS, footerNote:'', isDefault:false };
    }
    return { id:'', name:'', layout:'classic', titleOverride:'', infoFields:{...DEFAULT_INFO_FIELDS}, signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent', sigImage1:'', sigImage2:'', footerNote:'', showElective:true, showNotCounted:true, showClassTopper:true, showRank:true, showAttendance:true, coScholasticAreas:DEFAULT_COSCHOLASTIC_AREAS.slice(), showDiscipline:true, isDefault:false };
  }
  function twStartNew(){
    twEditingId = '';
    twDraft = twDefaultDraft();
    twSig1Data = ''; twSig2Data = '';
    twStep = 1;
    twListView = false;
    renderTemplateWizard();
  }
  function twStartEdit(id){
    const t = twTemplates().find(x => x.id === id);
    if(!t) return;
    twEditingId = id;
    twDraft = JSON.parse(JSON.stringify(t));
    if(twKind === 'reportcard'){
      twDraft.infoFields = twDraft.infoFields || {...DEFAULT_INFO_FIELDS};
      twDraft.coScholasticAreas = twDraft.coScholasticAreas || DEFAULT_COSCHOLASTIC_AREAS.slice();
      twSig1Data = twDraft.sigImage1 || ''; twSig2Data = twDraft.sigImage2 || '';
    }
    twStep = 1;
    twListView = false;
    renderTemplateWizard();
  }
  async function twDuplicate(id){
    const src = twTemplates().find(t => t.id === id);
    if(!src) return;
    const copy = { ...src, id: (twKind==='admitcard'?'ac_':'tmpl_')+Date.now(), name: src.name+' (Copy)', isDefault:false };
    twTemplates().push(copy);
    await storageSet(twStorageKey(), twTemplates());
    showToast('Template duplicated.', 'burst');
    renderTemplateWizard();
  }
  async function twSetDefault(id){
    twTemplates().forEach(t => { t.isDefault = (t.id === id); });
    await storageSet(twStorageKey(), twTemplates());
    renderTemplateWizard();
  }
  async function twDelete(id){
    if(twTemplates().length <= 1){ showToast('Keep at least one template.'); return; }
    if(!await showConfirmDialog('Delete this template?')) return;
    const found = twTemplates().find(t => t.id === id);
    const wasDefault = found && found.isDefault;
    const filtered = twTemplates().filter(t => t.id !== id);
    if(wasDefault && filtered.length) filtered[0].isDefault = true;
    if(twKind === 'admitcard') admitCardTemplates = filtered; else reportTemplates = filtered;
    await storageSet(twStorageKey(), filtered);
    renderTemplateWizard();
  }

  function twRenderWizardStep(){
    const titles = twStepTitles();
    const stepsNav = titles.map((t,i) => `<span class="tw-step ${twStep===i+1?'tw-step-active':''} ${twStep>i+1?'tw-step-done':''}">${i+1}. ${t}</span>`).join('<span class="tw-step-arrow">→</span>');
    let body = '';
    if(twStep === 1) body = twStepLayout();
    else if(twStep === 2) body = twKind === 'admitcard' ? twStepAdmitDetails() : twStepReportDetails();
    else body = twStepReview();
    return `
      <div class="breadcrumb"><a onclick="twBackToList()">${twKindLabel()} Templates</a> &nbsp;/&nbsp; Customize Wizard</div>
      <div class="tw-steps">${stepsNav}</div>
      ${body}
    `;
  }
  function twBackToList(){ twListView = true; renderTemplateWizard(); }
  function twGoStep(n){ twStep = n; renderTemplateWizard(); }

  function twStepLayout(){
    const defs = twLayoutDefs();
    return `
      <div class="tw-layout-grid">
        ${defs.map(l => `
          <div class="tw-layout-card ${twDraft.layout===l.key?'tw-layout-card-sel':''}" onclick="twSelectLayout('${l.key}')">
            <div class="tw-layout-name">${l.name}${twDraft.layout===l.key?' ✓':''}</div>
            <div class="tw-layout-blurb">${l.blurb}</div>
          </div>
        `).join('')}
      </div>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="twBackToList()">Cancel</button>
        <button class="btn btn-primary" onclick="twGoStep(2)">Next</button>
      </div>
    `;
  }
  function twSelectLayout(key){
    twDraft.layout = key;
    if(twKind === 'admitcard') twDraft.cardsPerPage = key==='full' ? 1 : key==='grid4' ? 4 : (twDraft.cardsPerPage===3?3:4);
    renderTemplateWizard();
  }

  function twStepAdmitDetails(){
    const d = twDraft;
    return `
      <div class="profile-card" style="max-width:640px;">
        <div class="form-grid">
          <div class="f-field full"><label>Report Period Name <span class="required-star">*</span></label><input type="text" id="twName" value="${d.name}" placeholder="e.g. Board Exam Style"></div>
          <div class="f-field full"><label>Title Override <span style="font-weight:400; color:var(--ink-soft);">— leave blank for "Admit Card"</span></label><input type="text" id="twTitle" value="${d.titleOverride||''}" placeholder="e.g. HALL TICKET"></div>
        </div>
        ${d.layout==='strip' ? `
        <div class="f-field" style="max-width:280px;">
          <label>Cards per A4 Sheet</label>
          <select id="twCardsPerPage">
            <option value="4" ${d.cardsPerPage!==3?'selected':''}>4 per sheet — compact</option>
            <option value="3" ${d.cardsPerPage===3?'selected':''}>3 per sheet — more room to sign</option>
          </select>
        </div>` : `<p style="font-size:0.8rem; color:var(--ink-soft);">${d.layout==='full' ? '1 candidate per A4 sheet (fixed by this layout).' : '4 cards per A4 sheet, 2×2 grid (fixed by this layout).'}</p>`}
        ${d.layout!=='strip' ? `
        <div class="f-field full">
          <label>Candidate Instructions <span style="font-weight:400; color:var(--ink-soft);">— one per line${d.layout==='grid4'?' (kept short — this layout has limited space)':''}</span></label>
          <textarea id="twInstructions" rows="4" placeholder="e.g. Bring this admit card to every exam.">${d.instructionsText||''}</textarea>
        </div>` : ''}
        <div class="f-field full"><label>Footer Note</label><input type="text" id="twFooter" value="${d.footerNote||''}" placeholder="Optional remark shown at the bottom"></div>
      </div>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="twGoStep(1)">Back</button>
        <button class="btn btn-primary" onclick="twCollectAdmitDetails()">Next</button>
      </div>
    `;
  }
  function twCollectAdmitDetails(){
    const name = document.getElementById('twName').value.trim();
    if(!name){ showToast('Enter a name for the report period.'); return; }
    twDraft.name = name;
    twDraft.titleOverride = document.getElementById('twTitle').value.trim();
    const cppEl = document.getElementById('twCardsPerPage');
    if(cppEl) twDraft.cardsPerPage = parseInt(cppEl.value);
    const instrEl = document.getElementById('twInstructions');
    if(instrEl) twDraft.instructionsText = instrEl.value;
    twDraft.footerNote = document.getElementById('twFooter').value.trim();
    twGoStep(3);
  }

  function twStepReportDetails(){
    const d = twDraft;
    const infoFields = d.infoFields || DEFAULT_INFO_FIELDS;
    return `
      <div class="profile-card" style="max-width:640px;">
        <div class="form-grid">
          <div class="f-field full"><label>Report Period Name <span class="required-star">*</span></label><input type="text" id="twName" value="${d.name}" placeholder="e.g. Half Yearly Format"></div>
          <div class="f-field full"><label>Title Override <span style="font-weight:400; color:var(--ink-soft);">— leave blank to use "REPORT CARD — [Exam Name]"</span></label><input type="text" id="twTitle" value="${d.titleOverride||''}" placeholder="e.g. HALF YEARLY PROGRESS REPORT"></div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Student Info Fields to Show</label>
        <div class="disc-checklist" style="max-height:200px; margin-bottom:6px; display:grid; grid-template-columns:1fr 1fr; gap:2px 10px;">
          ${INFO_FIELD_DEFS.map(f => `<label class="disc-check-item"><input type="checkbox" class="tw-infofield-check" value="${f.key}" ${infoFields[f.key]?'checked':''} ${f.key==='studentName'?'disabled checked':''}> ${f.label}</label>`).join('')}
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Signature 1</label>
        <div class="form-grid">
          <div class="f-field"><label>Label</label><input type="text" id="twSig1" value="${d.signatureLabel1||'Class Teacher'}"></div>
          <div class="f-field">
            <label>Signature Image</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <img id="twSig1Preview" src="${twSig1Data}" style="height:36px; ${twSig1Data?'':'display:none;'} border-bottom:1px solid var(--border);">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload<input type="file" accept="image/*" style="display:none;" onchange="twPreviewSignature(event,1)"></label>
              ${twSig1Data ? `<button type="button" class="btn-danger-text" onclick="twClearSignature(1)">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Signature 2</label>
        <div class="form-grid">
          <div class="f-field"><label>Label</label><input type="text" id="twSig2" value="${d.signatureLabel2||'Principal / Correspondent'}"></div>
          <div class="f-field">
            <label>Signature Image</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <img id="twSig2Preview" src="${twSig2Data}" style="height:36px; ${twSig2Data?'':'display:none;'} border-bottom:1px solid var(--border);">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload<input type="file" accept="image/*" style="display:none;" onchange="twPreviewSignature(event,2)"></label>
              ${twSig2Data ? `<button type="button" class="btn-danger-text" onclick="twClearSignature(2)">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <div class="form-grid" style="margin-top:14px;">
          <div class="f-field full"><label>Footer Note</label><input type="text" id="twFooter" value="${d.footerNote||''}" placeholder="Optional remark shown at the bottom of the card"></div>
        </div>
        <div style="display:flex; gap:30px; margin:14px 0; flex-wrap:wrap;">
          <label class="admission-toggle"><input type="checkbox" id="twShowElective" ${d.showElective!==false?'checked':''}> Show "Elective" tag</label>
          <label class="admission-toggle"><input type="checkbox" id="twShowNotCounted" ${d.showNotCounted!==false?'checked':''}> Show "Not counted" tag</label>
          <label class="admission-toggle"><input type="checkbox" id="twShowClassTopper" ${d.showClassTopper!==false?'checked':''}> Show Highest Marks in Class per subject</label>
          <label class="admission-toggle"><input type="checkbox" id="twShowRank" ${d.showRank!==false?'checked':''}> Show Class Rank (section-wise)</label>
        </div>
        ${d.layout==='modern' ? `
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Co-Scholastic Areas <span style="font-weight:400; color:var(--ink-soft);">— each graded A–E</span></label>
        <div id="twCoschAreas">${(d.coScholasticAreas||DEFAULT_COSCHOLASTIC_AREAS).map((a,i) => `
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
            <input type="text" class="tw-cosch-area input" value="${a}" style="flex:1;">
            <button type="button" class="btn-danger-text" onclick="twRemoveCoschArea(${i})">Remove</button>
          </div>`).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="twAddCoschArea()">+ Add Area</button>
        <label class="admission-toggle" style="display:block; margin-top:14px;"><input type="checkbox" id="twShowDiscipline" ${d.showDiscipline!==false?'checked':''}> Show separate Discipline grade</label>
        ` : ''}
      </div>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="twGoStep(1)">Back</button>
        <button class="btn btn-primary" onclick="twCollectReportDetails()">Next</button>
      </div>
    `;
  }
  function twAddCoschArea(){
    twSyncCoschAreasFromDom();
    twDraft.coScholasticAreas.push('New Area');
    renderTemplateWizard();
  }
  function twRemoveCoschArea(i){
    twSyncCoschAreasFromDom();
    twDraft.coScholasticAreas.splice(i,1);
    renderTemplateWizard();
  }
  function twSyncCoschAreasFromDom(){
    const inputs = document.querySelectorAll('.tw-cosch-area');
    if(inputs.length) twDraft.coScholasticAreas = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
    if(!twDraft.coScholasticAreas || !twDraft.coScholasticAreas.length) twDraft.coScholasticAreas = DEFAULT_COSCHOLASTIC_AREAS.slice();
  }
  function twPreviewSignature(e, which){
    readImageFileWithSizeLimit(e, dataUrl => {
      if(which===1){ twSig1Data = dataUrl; } else { twSig2Data = dataUrl; }
      renderTemplateWizard();
    });
  }
  function twClearSignature(which){
    if(which===1) twSig1Data=''; else twSig2Data='';
    renderTemplateWizard();
  }
  function twCollectReportDetails(){
    const name = document.getElementById('twName').value.trim();
    if(!name){ showToast('Enter a name for the report period.'); return; }
    twDraft.name = name;
    twDraft.titleOverride = document.getElementById('twTitle').value.trim();
    const infoFields = {};
    INFO_FIELD_DEFS.forEach(f => {
      infoFields[f.key] = f.key === 'studentName' ? true : document.querySelector(`.tw-infofield-check[value="${f.key}"]`).checked;
    });
    twDraft.infoFields = infoFields;
    twDraft.showAttendance = infoFields.attendance;
    twDraft.signatureLabel1 = document.getElementById('twSig1').value.trim() || 'Class Teacher';
    twDraft.signatureLabel2 = document.getElementById('twSig2').value.trim() || 'Principal / Correspondent';
    twDraft.sigImage1 = twSig1Data; twDraft.sigImage2 = twSig2Data;
    twDraft.footerNote = document.getElementById('twFooter').value.trim();
    twDraft.showElective = document.getElementById('twShowElective').checked;
    twDraft.showNotCounted = document.getElementById('twShowNotCounted').checked;
    twDraft.showClassTopper = document.getElementById('twShowClassTopper').checked;
    twDraft.showRank = document.getElementById('twShowRank').checked;
    if(twDraft.layout === 'modern'){
      twSyncCoschAreasFromDom();
      twDraft.showDiscipline = document.getElementById('twShowDiscipline').checked;
    }
    twGoStep(3);
  }

  function twStepReview(){
    const d = twDraft;
    const layoutName = (twLayoutDefs().find(l=>l.key===d.layout)||{}).name || d.layout;
    return `
      <div class="profile-card" style="max-width:600px;">
        <div class="profile-row"><span>Name</span><span>${d.name}</span></div>
        <div class="profile-row"><span>Layout</span><span>${layoutName}</span></div>
        <div class="profile-row"><span>Title</span><span>${d.titleOverride || '(default)'}</span></div>
        ${twKind==='admitcard' ? `<div class="profile-row"><span>Cards per Sheet</span><span>${d.cardsPerPage}</span></div>` : ''}
        ${twKind==='reportcard' && d.layout==='modern' ? `<div class="profile-row"><span>Co-Scholastic Areas</span><span>${(d.coScholasticAreas||[]).join(', ')}</span></div>` : ''}
        <div class="profile-row"><span>Footer Note</span><span>${d.footerNote || '—'}</span></div>
      </div>
      <p style="font-size:0.8rem; color:var(--ink-soft); margin-top:14px;">Review the details above, then save. You can edit this template again any time from the list.</p>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="twGoStep(2)">Back</button>
        <button class="btn btn-primary" onclick="twSaveTemplate()">${twEditingId ? 'Save Changes' : 'Create Template'}</button>
      </div>
    `;
  }
  async function twSaveTemplate(){
    const arr = twTemplates();
    if(twEditingId){
      const idx = arr.findIndex(x => x.id === twEditingId);
      if(idx > -1) arr[idx] = { ...arr[idx], ...twDraft, id: twEditingId };
    }else{
      twDraft.id = (twKind==='admitcard'?'ac_':'tmpl_') + Date.now();
      twDraft.isDefault = arr.length === 0;
      arr.push(twDraft);
    }
    await storageSet(twStorageKey(), arr);
    showToast('Template saved.', 'burst');
    twListView = true;
    renderTemplateWizard();
    if(document.getElementById('resultBody')) renderResultBody();
  }

  /* --- Exam Templates (which exams combine into a consolidated group) --- */
  let examTemplatesView = 'list';
  let editingExamGroupId = '';
  function renderExamTemplatesTab(body){
    if(examTemplatesView === 'edit') return renderExamGroupEditor(body);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">
        Define named groups of exams — e.g. "2 Unit Tests" combining two unit tests, "Summative 1" for a single exam, or "Annual" combining all 6 exams for the year-end consolidated report. Each group gets its own combined percentage and grade using the Consolidation Scale.
      </p>
      <button class="btn btn-primary btn-sm" style="margin-bottom:16px;" onclick="openExamGroupEditor()">+ New Report Period</button>
      <div class="table-wrap" style="max-width:760px;">
        <table><thead><tr><th>Report Period</th><th>Exams Included</th><th></th></tr></thead>
        <tbody>
        ${examGroups.length ? examGroups.map(g => `<tr>
          <td class="name-cell">${g.name}</td>
          <td>${g.examIds.map(id => { const ex=examDefs.find(x=>x.id===id); return ex ? `<span class="pill">${ex.name}</span>` : ''; }).join(' ')}</td>
          <td><button class="btn-edit-text" onclick="openExamGroupEditor('${g.id}')">Edit</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteExamGroup('${g.id}')">Delete</button></td>
        </tr>`).join('') : `<tr><td colspan="3"><div class="empty-state"><b>No report periods yet</b>Click "+ New Report Period" to combine specific exams into a named group.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  function openExamGroupEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingExamGroupId = id || '';
    examTemplatesView = 'edit';
    renderResultBody();
  }
  function backToExamTemplatesList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examTemplatesView = 'list';
    renderResultBody();
  }
  function renderExamGroupEditor(body){
    const g = editingExamGroupId ? examGroups.find(x => x.id === editingExamGroupId) : null;
    const selectedIds = g ? g.examIds : [];
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToExamTemplatesList()">Report Periods</a> &nbsp;/&nbsp; ${g ? g.name : 'New Report Period'}</div>
      <div class="profile-card" style="max-width:520px;">
        <div class="f-field full" style="margin-bottom:14px;"><label>Report Period Name <span class="required-star">*</span></label><input type="text" id="egName" value="${g?g.name:''}" placeholder="e.g. 2 Unit Tests, Summative 1, Annual (All 6 Exams)"></div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin-bottom:8px; display:block;">Exams Included <span class="required-star">*</span></label>
        <div class="disc-checklist" style="max-height:220px; margin-bottom:16px;">
          ${examDefs.length ? examDefs.map(ex => `<label class="disc-check-item"><input type="checkbox" class="eg-exam-check" value="${ex.id}" ${selectedIds.includes(ex.id)?'checked':''}> ${ex.name}</label>`).join('') : `<div style="font-size:0.82rem; color:var(--ink-soft);">No exams created yet — add some under the "Exams" tab first.</div>`}
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-ghost" onclick="backToExamTemplatesList()">Cancel</button>
          <button class="btn btn-primary" onclick="saveExamGroup()">Save Report Period</button>
        </div>
      </div>
    `;
  }
  async function saveExamGroup(){
    const name = document.getElementById('egName').value.trim();
    const examIds = Array.from(document.querySelectorAll('.eg-exam-check:checked')).map(c => c.value);
    if(!name){ showToast('Enter a name for the report period.'); return; }
    if(examIds.length === 0){ showToast('Select at least one exam.'); return; }
    if(editingExamGroupId){
      const idx = examGroups.findIndex(x => x.id === editingExamGroupId);
      examGroups[idx] = { ...examGroups[idx], name, examIds };
    }else{
      examGroups.push({ id:'eg_'+Date.now(), name, examIds });
    }
    await storageSet(EXAM_GROUPS_KEY, examGroups);
    showToast('Report period saved.', 'burst');
    backToExamTemplatesList();
  }
  async function deleteExamGroup(id){
    if(!await showConfirmDialog('Delete this report period?')) return;
    examGroups = examGroups.filter(g => g.id !== id);
    await storageSet(EXAM_GROUPS_KEY, examGroups);
    renderExamTemplatesTab(document.getElementById('resultBody'));
  }

  /* --- Consolidation Scale (separate, editable grade bands for combined/grouped results) --- */
  function renderConsolidationScaleTab(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">Grade boundaries used specifically for consolidated / combined exam-group results — kept separate from the per-exam Grading Scale so year-end consolidation can use different cutoffs if needed.</p>
      <div class="table-wrap" style="margin-bottom:16px; max-width:500px;">
        <table><thead><tr><th>Grade</th><th>Min %</th><th>Max %</th><th></th></tr></thead>
        <tbody>
        ${consolidationScale.map((g,i) => `<tr>
          <td><input type="text" class="input cs-grade" value="${g.grade}" style="max-width:80px;"></td>
          <td><input type="number" class="input cs-min" value="${g.minPct}" min="0" max="100" style="max-width:80px;"></td>
          <td><input type="number" class="input cs-max" value="${g.maxPct}" min="0" max="100" style="max-width:80px;"></td>
          <td><button class="btn-danger-text" onclick="removeConsolGradeRow(${i})">Remove</button></td>
        </tr>`).join('')}
        </tbody></table>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="addConsolGradeRow()">+ Add Grade</button>
      <button class="btn btn-primary" onclick="saveConsolidationScale()" style="margin-left:10px;">Save Consolidation Scale</button>
    `;
  }
  function addConsolGradeRow(){
    consolidationScale.push({ grade:'', minPct:0, maxPct:0 });
    renderConsolidationScaleTab(document.getElementById('resultBody'));
  }
  function removeConsolGradeRow(i){
    consolidationScale.splice(i,1);
    renderConsolidationScaleTab(document.getElementById('resultBody'));
  }
  async function saveConsolidationScale(){
    const grades = document.querySelectorAll('.cs-grade');
    const mins = document.querySelectorAll('.cs-min');
    const maxs = document.querySelectorAll('.cs-max');
    for(let i=0;i<grades.length;i++){
      if(!grades[i].value.trim()) continue;
      const minV = Number(mins[i].value)||0, maxV = Number(maxs[i].value)||0;
      if(minV<0 || minV>100 || maxV<0 || maxV>100){
        showToast(`"${grades[i].value.trim()}" grade's Min/Max % must each be between 0 and 100.`);
        return;
      }
      if(minV>maxV){
        showToast(`"${grades[i].value.trim()}" grade's Min % can't be greater than its Max %.`);
        return;
      }
    }
    consolidationScale = Array.from(grades).map((el,i) => ({
      grade: el.value.trim(), minPct: Number(mins[i].value)||0, maxPct: Number(maxs[i].value)||0,
    })).filter(g => g.grade);
    await storageSet(CONSOLIDATION_SCALE_KEY, consolidationScale);
    showToast('Consolidation scale saved.', 'burst');
  }


  /* ===== ROOM ALLOTMENT MODULE (Hall Ticket Numbers, Class Selection, Rooms & Matrix, Final Printout, Notice Board) ===== */
  