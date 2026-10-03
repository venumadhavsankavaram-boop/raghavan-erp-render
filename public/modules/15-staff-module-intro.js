const STAFF_KEY = "staff-records";
  API_BACKED_KEYS[STAFF_KEY] = '/api/staff';
  const STAFF_DEPTS_KEY = "staff-departments";
  const STAFF_DESIGNATIONS_KEY = "staff-designations";
  const STAFF_JOB_TYPES_KEY = "staff-job-types";
  [STAFF_DEPTS_KEY, STAFF_DESIGNATIONS_KEY, STAFF_JOB_TYPES_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  const STAFF_PAYROLL_KEY = "staff-payroll";
  API_BACKED_KEYS[STAFF_PAYROLL_KEY] = '/api/staff-payroll';

  let staffList = [];
  let staffDepartments = [];
  let staffDesignations = [];
  let staffJobTypes = [];
  let staffPhotoData = '';
  let staffSignatureData = '';
  let staffPayrollRecords = [];

  async function loadStaffPayroll(){
    staffPayrollRecords = await storageGet(STAFF_PAYROLL_KEY, []);
  }
  async function loadStaff(){
    staffList = await storageGet(STAFF_KEY, []);
    staffDepartments = await storageGet(STAFF_DEPTS_KEY, ['Teaching','Administration','Accounts','Support Staff']);
    staffDesignations = await storageGet(STAFF_DESIGNATIONS_KEY, ['Principal','Vice Principal','Teacher','Accountant','Office Assistant','Librarian','Lab Assistant','Peon','Driver','Security Guard']);
    staffJobTypes = await storageGet(STAFF_JOB_TYPES_KEY, ['Subject Teacher','Class Teacher','Sports Coach','Exam Duty','Warden','Lab Incharge','Transport Incharge']);
  }

  function nextStaffId(){
    const year = new Date().getFullYear();
    const count = staffList.length + 1;
    return 'STF' + year + '-' + String(count).padStart(3,'0');
  }
  function staffIsActive(st){
    return (st.status||'Active').toString().trim().toLowerCase() === 'active';
  }
  function staffInitials(st){
    return ((st.firstName||'?')[0] + (st.lastName||'?')[0]).toUpperCase();
  }

  let staffTab = 'directory';
  let staffView = 'table';
  let staffCurrentDept = '';
  let staffCurrentId = '';
  let idCardsDept = '';

  // Staff Directory, Departments & Designations, ID Cards, Payroll, Attendance and Reports are
  // each their own sidebar page/view now (see STAFF_SUBVIEWS + switchView) — they all share the
  // one view-staff container and its content pieces internally via this tab.
  const STAFF_PAGE_META = {
    directory: { title:'Staff Directory', desc:'Every staff member, with their designation, department, and contact details.' },
    depts:     { title:'Departments & Designations', desc:'Manage the departments and designations used across the Staff module.' },
    idcards:   { title:'ID Cards', desc:'Generate and print staff ID cards by department.' },
    payroll:   { title:'Payroll', desc:'Basic, EPF, ESI, deductions and leaves — gross &amp; net salary calculated monthly, with approvals.' },
    attendance:{ title:'Staff Attendance', desc:'Mark daily staff attendance and track attendance percentages.' },
    reports:   { title:'Staff Reports', desc:'Employee reports and teacher performance reports.' },
    activity:  { title:'Staff Activity', desc:'A single dashboard to monitor whether staff are keeping up — homework assigned, submissions reviewed, parent concerns responded to, attendance marked for their class, and staff present/absent today.' },
  };
  function updateStaffPageHeader(tab){
    const meta = STAFF_PAGE_META[tab] || { title:'Manage Staff', desc:'' };
    const t = document.getElementById('staffPageTitle'); if(t) t.textContent = meta.title;
    const d = document.getElementById('staffPageDesc'); if(d) d.innerHTML = meta.desc;
  }

  function initStaffView(tab){
    staffTab = tab;
    const deptFilter = document.getElementById('staffDeptFilter');
    if(deptFilter.options.length <= 1){
      staffDepartments.forEach(d => { const o=document.createElement('option'); o.value=d; o.textContent=d; deptFilter.appendChild(o); });
    }
    initStaffAttendanceView();
    switchStaffTab(staffTab);
  }

  function switchStaffTab(tab){
    staffTab = tab;
    updateStaffPageHeader(tab);
    const coreTab = ['directory','depts','idcards','payroll'].includes(tab);
    document.getElementById('staffSearchRow').style.display = tab==='directory' ? 'flex' : 'none';
    document.getElementById('staffBody').style.display = coreTab ? 'block' : 'none';
    document.getElementById('stfAttWrap').style.display = tab==='attendance' ? 'block' : 'none';
    document.getElementById('stfReportsWrap').style.display = tab==='reports' ? 'block' : 'none';
    document.getElementById('stfActivityWrap').style.display = tab==='activity' ? 'block' : 'none';
    if(tab === 'directory') staffView = 'table';
    if(tab === 'idcards') idCardsDept = '';
    if(coreTab) return renderStaffBody();
    if(tab === 'attendance') return switchStaffAttTab(staffAttTab);
    if(tab === 'reports') return renderStaffReportsTab(document.getElementById('stfReportsBody'));
    if(tab === 'activity') return renderStaffActivityTab(document.getElementById('stfActivityBody'));
  }

  async function renderStaffBody(){
    const body = document.getElementById('staffBody');
    if(!body) return;
    if(staffTab === 'directory'){
      if(staffView === 'table') return renderStaffTable(body);
      if(staffView === 'profile') return renderStaffProfile(body);
    }
    if(staffTab === 'depts') return renderStaffDeptsTab(body);
    if(staffTab === 'idcards'){
      if(!idCardsDept) return renderIdCardsDeptGrid(body);
      return renderIdCardsList(body);
    }
    if(staffTab === 'payroll'){
      // Loss-of-Pay calculation reads staffAttendanceRecords — must be the
      // real data, not an empty array, before computing anyone's payroll.
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      await ensureDataLoaded('staffAttendanceRecords', loadStaffAttendance);
      if(staffTab === 'payroll') return renderStaffPayrollTab(body);
      return;
    }
  }

  /* --- Staff Activity (Admin/Principal monitoring dashboard) ---
     A single school-wide screen answering "is everyone keeping up":
     homework assigned, submissions still waiting on review, parent
     concerns still waiting on a reply, exam marks entry progress, homeroom
     attendance marked for the day, and who's present/absent/not marked
     themselves today. Concerns/submissions reuse the same
     /api/concerns/inbox and /api/submissions/inbox endpoints the
     school-wide Inbox already calls for Admin/Principal (every item, not
     just their own) — no new server endpoint needed. Everything else
     (homework, attendance, staff attendance, exam results, subject
     assignments) is already loaded client-side for any Admin/Principal
     session, so this is a pure client-side aggregation. */
  let staffActivityRange = 7;      // days, for "assigned/responded recently" windows
  let staffActivitySearch = '';
  let staffActivityExamId = '';
  function renderStaffActivityTab(body){
    if(!body) return;
    body.innerHTML = `<div class="empty-state"><div class="mo-lottie-mini"></div><b>Loading staff activity…</b></div>`;
    moMountLotties();
    // Marks-entry progress (examResults), homeroom attendance and each
    // staff member's own attendance today (attendanceRecords /
    // staffAttendanceRecords) are what a teacher/staff member may have just
    // changed elsewhere (entered marks, marked attendance) in a DIFFERENT
    // session — so this dashboard always force-refetches them with
    // reloadDataset() instead of ensureDataLoaded(), which would silently
    // keep serving whatever was cached the first time any tab touched that
    // key in THIS session. loadInboxConcerns/loadInboxSubmissions already
    // hit the server fresh on every call, so they don't need that treatment.
    Promise.all([
      loadInboxConcerns(), loadInboxSubmissions(),
      reloadDataset('examResults', loadExamResultsData),
      reloadDataset('attendanceRecords', loadAttendanceRecordsData),
      reloadDataset('staffAttendanceRecords', loadStaffAttendance),
    ]).then(() => renderStaffActivityBody(body));
  }
  // Also used as the dashboard's visible manual "Refresh" button — since
  // renderStaffActivityTab() now always force-refetches (see above), this
  // reliably pulls in anything entered/marked elsewhere since this tab was
  // last opened, not just whatever was first cached this session.
  function refreshStaffActivityTab(){ renderStaffActivityTab(document.getElementById('stfActivityBody')); }
  function onStaffActivitySearch(v){ staffActivitySearch = v; renderStaffActivityBody(document.getElementById('stfActivityBody')); }
  function onStaffActivityRangeChange(v){ staffActivityRange = Number(v)||7; renderStaffActivityBody(document.getElementById('stfActivityBody')); }
  function onStaffActivityExamChange(v){ staffActivityExamId = v; renderStaffActivityBody(document.getElementById('stfActivityBody')); }
  // Every subject+section a staff member is the assigned Subject Teacher for —
  // same lookup myTeacherScope() uses for the currently logged-in Teacher,
  // generalized to any staffId so Admin can check it for everyone else too.
  function subjectSectionsForStaff(staffId){
    const out = [];
    subjectsList.forEach(subj => {
      (subj.sections||[]).forEach(sec => {
        if(subjectStaffForSection(subj, sec).includes(staffId)){
          out.push({ subject: subj.name, className: subj.className, section: sec });
        }
      });
    });
    return out;
  }
  // How many of a staff member's own subject+section combos have every
  // active student's marks fully entered for the selected exam. Null when
  // they're not a Subject Teacher for anything (so the dashboard can show
  // "—" instead of a misleading 0/0).
  function computeMarksEntryForStaff(st, examId){
    if(!examId) return null;
    const subjectSections = subjectSectionsForStaff(st.id);
    if(!subjectSections.length) return null;
    let done = 0;
    subjectSections.forEach(ss => {
      const list = students.filter(s => s.className===ss.className && s.section===ss.section && isActive(s));
      const allEntered = !list.length || list.every(s => examResults.find(r => r.examId===examId && r.studentId===s.id && r.subject===ss.subject));
      if(allEntered) done++;
    });
    return { total: subjectSections.length, done };
  }
  function computeStaffActivityRow(st, today, sinceDate, examId){
    const homeworkAll = homeworkItems.filter(h => h.staffId === st.id);
    const homeworkRecent = homeworkAll.filter(h => ((h.assignedDate || (h.createdAt||'').slice(0,10) || '')) >= sinceDate);

    const mySubmissions = inboxSubmissions.filter(s => s.recipientStaffId === st.id);
    const pendingSubmissions = mySubmissions.filter(s => s.status === 'submitted');
    const reviewedRecent = mySubmissions.filter(s => s.status !== 'submitted' && s.reviewedAt && s.reviewedAt.slice(0,10) >= sinceDate);
    const oldestPendingSubmissionDays = pendingSubmissions.length ? Math.max(...pendingSubmissions.map(s => daysAgo(s.createdAt))) : 0;
    const avgReviewHours = reviewedRecent.length
      ? Math.round(reviewedRecent.reduce((sum,s) => sum + Math.max(0, (new Date(s.reviewedAt) - new Date(s.createdAt)) / 36e5), 0) / reviewedRecent.length)
      : null;

    const myConcerns = inboxConcerns.filter(c => c.recipientStaffId === st.id);
    const openConcerns = myConcerns.filter(c => c.status === 'open');
    const repliedRecent = myConcerns.filter(c => c.status !== 'open' && c.repliedAt && c.repliedAt.slice(0,10) >= sinceDate);
    const oldestOpenConcernDays = openConcerns.length ? Math.max(...openConcerns.map(c => daysAgo(c.createdAt))) : 0;
    const avgReplyHours = repliedRecent.length
      ? Math.round(repliedRecent.reduce((sum,c) => sum + Math.max(0, (new Date(c.repliedAt) - new Date(c.createdAt)) / 36e5), 0) / repliedRecent.length)
      : null;

    const marksEntry = computeMarksEntryForStaff(st, examId);

    let homeroomStatus = null;
    if(st.classTeacherClass && st.classTeacherSection){
      const isHoliday = holidays.some(h => h.date === today);
      const classStudents = students.filter(s => s.className===st.classTeacherClass && s.section===st.classTeacherSection && isActive(s));
      const markedCount = classStudents.filter(s => attendanceRecords.some(a => a.studentId===s.id && a.date===today)).length;
      homeroomStatus = {
        className: st.classTeacherClass, section: st.classTeacherSection,
        totalStudents: classStudents.length, markedCount, isHoliday,
        done: isHoliday || (classStudents.length > 0 && markedCount === classStudents.length),
      };
    }

    const ownAttRecs = staffAttendanceRecords.filter(r => r.staffId === st.id && r.date === today);
    let ownAttStatus = 'Not Marked';
    if(ownAttRecs.length){
      const worst = ownAttRecs.find(r => r.status==='Absent') || ownAttRecs.find(r => r.status==='Leave') || ownAttRecs.find(r => r.status==='Late') || ownAttRecs[0];
      ownAttStatus = worst.status;
    }

    const needsAttention = pendingSubmissions.length > 0 || openConcerns.length > 0
      || (homeroomStatus && !homeroomStatus.done) || ownAttStatus === 'Absent'
      || (marksEntry && marksEntry.done < marksEntry.total);

    return {
      staff: st, homeworkRecentCount: homeworkRecent.length,
      pendingSubmissions: pendingSubmissions.length, oldestPendingSubmissionDays, avgReviewHours,
      openConcerns: openConcerns.length, oldestOpenConcernDays, avgReplyHours,
      marksEntry, homeroomStatus, ownAttStatus, needsAttention,
    };
  }
  function fmtHoursShort(h){
    if(h < 24) return h + 'h';
    return (Math.round(h/24*10)/10) + 'd';
  }
  // Day-by-day count of homework items assigned over the last `days` days —
  // same {label, total} point shape countTrendChartSVG expects.
  function dailyHomeworkTrend(days){
    const out = [];
    for(let i = days-1; i >= 0; i--){
      const d = new Date(); d.setDate(d.getDate()-i);
      const key = d.toISOString().slice(0,10);
      out.push({ key, label: d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}), total: 0 });
    }
    const byKey = {}; out.forEach(o => byKey[o.key]=o);
    homeworkItems.forEach(h => {
      const key = (h.assignedDate || (h.createdAt||'').slice(0,10) || '').slice(0,10);
      if(byKey[key]) byKey[key].total++;
    });
    return out;
  }
  // Same hand-drawn-SVG line/area style as the Fee dashboard's trendChartSVG,
  // just with plain integer counts on the labels instead of money — reused
  // here for "homework assigned per day" rather than duplicating that whole
  // function just to swap the formatter.
  // A tiny shared floating tooltip used by every chart on this dashboard
  // (the trend chart's hover columns, the leaderboard's bars) — one element,
  // reused and repositioned at the cursor, instead of a native title tooltip
  // that only shows after a long hover delay.
  function showChartTip(evt, text){
    let tip = document.getElementById('chartHoverTip');
    if(!tip){
      tip = document.createElement('div');
      tip.id = 'chartHoverTip';
      tip.style.cssText = 'position:fixed; z-index:9999; pointer-events:none; background:var(--navy); color:#fff; font-size:0.72rem; font-weight:600; padding:6px 10px; border-radius:7px; box-shadow:var(--shadow); white-space:nowrap; transform:translate(-50%,-135%);';
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.left = evt.clientX + 'px';
    tip.style.top = evt.clientY + 'px';
    tip.style.display = 'block';
  }
  function hideChartTip(){
    const tip = document.getElementById('chartHoverTip');
    if(tip) tip.style.display = 'none';
  }
  // Day-by-day line/area chart with a per-point hover column (a wide
  // invisible hit target, bigger than the dot itself) that lights up a
  // dashed guide line and shows the exact value in the shared floating
  // tooltip — same hand-drawn-SVG style as the Fee dashboard's
  // trendChartSVG, generalized to plain counts instead of money.
  function countTrendChartSVG(points, color, ariaLabel){
    const W = 680, H = 160, padL = 30, padR = 30, padT = 26, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const max = Math.max(1, ...points.map(p => p.total));
    const n = points.length;
    const stepX = n > 1 ? plotW / (n - 1) : 0;
    const coords = points.map((p, i) => ({ x: padL + stepX * i, y: padT + plotH - (p.total / max) * plotH, ...p }));
    const allZero = points.every(p => p.total === 0);
    const linePath = coords.map((c,i) => (i===0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
    const areaPath = linePath
      + ` L${coords[coords.length-1].x.toFixed(1)},${(padT+plotH).toFixed(1)}`
      + ` L${coords[0].x.toFixed(1)},${(padT+plotH).toFixed(1)} Z`;
    const gradId = 'cnt' + Math.round(Math.random()*1e6);
    const colWidth = n > 1 ? plotW / n : plotW;
    return `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="${ariaLabel||'Trend'}">
        <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient></defs>
        ${allZero ? '' : `<path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>`}
        ${allZero ? '' : `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`}
        ${coords.map((c,i) => `
          <line id="cntGuide${i}" x1="${c.x.toFixed(1)}" y1="${padT}" x2="${c.x.toFixed(1)}" y2="${padT+plotH}" stroke="${color}" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
          <circle cx="${c.x.toFixed(1)}" cy="${allZero ? (padT+plotH) : c.y.toFixed(1)}" r="4" fill="${color}" stroke="var(--white)" stroke-width="2"/>
          <text class="trend-value-label" x="${c.x.toFixed(1)}" y="${(allZero ? (padT+plotH) : c.y) - 12}" text-anchor="middle">${c.total > 0 ? c.total : ''}</text>
          <text class="trend-month-label" x="${c.x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${c.label}</text>
          <rect x="${(c.x - colWidth/2).toFixed(1)}" y="0" width="${colWidth.toFixed(1)}" height="${H}" fill="transparent" style="cursor:pointer;"
            onmouseenter="document.getElementById('cntGuide${i}').setAttribute('opacity','1'); showChartTip(event,'${escapeHtml(String(c.label))}: ${c.total}')"
            onmousemove="showChartTip(event,'${escapeHtml(String(c.label))}: ${c.total}')"
            onmouseleave="document.getElementById('cntGuide${i}').setAttribute('opacity','0'); hideChartTip()"/>
        `).join('')}
      </svg>
    `;
  }
  // Green/gold/red by how healthy the number is — the same status colors
  // (--success/--warning/--danger) used everywhere else in the ERP, so a
  // ring's color always means "how are we doing" rather than being an
  // arbitrary per-card hue.
  function healthColor(pct){
    if(pct >= 90) return 'var(--success)';
    if(pct >= 60) return 'var(--warning)';
    return 'var(--danger)';
  }
  // One ring gauge + label, in the same hand-drawn style as the Dashboard's
  // overview rings — reuses the existing ringSVG() helper, colored by
  // healthColor() rather than a fixed hue per metric.
  function ringStatHtml(pct, label, sub){
    const color = healthColor(pct);
    return `
      <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
        <div style="position:relative; width:108px; height:108px;">
          ${ringSVG(pct, color, 108, 11)}
          <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:'Baloo 2',cursive; font-size:1.35rem; color:var(--navy);">${pct}%</div>
        </div>
        <div style="text-align:center;">
          <div style="font-weight:600; font-size:0.85rem; color:var(--navy);">${label}</div>
          <div style="font-size:0.7rem; color:var(--ink-soft);">${sub}</div>
        </div>
      </div>`;
  }
  // Horizontal bar leaderboard of the staff with the most combined pending
  // submissions + open concerns right now — thin rounded bars with a
  // per-bar hover tooltip via the same shared floating-tooltip layer as the
  // trend chart, complementing the row-by-row table below it.
  function staffActivityLeaderboardHtml(rows){
    const ranked = rows.map(r => ({ r, score: r.pendingSubmissions + r.openConcerns })).filter(x => x.score > 0).sort((a,b) => b.score-a.score).slice(0,6);
    if(!ranked.length) return `<div class="empty-state" style="padding:16px 0;"><b>Nothing pending</b>No staff currently have unreviewed submissions or open concerns.</div>`;
    const max = Math.max(...ranked.map(x => x.score));
    return ranked.map(x => {
      const pct = Math.round((x.score/max)*100);
      const name = escapeHtml(x.r.staff.firstName+' '+x.r.staff.lastName);
      const tipText = name+': '+x.r.pendingSubmissions+' submissions, '+x.r.openConcerns+' concerns';
      return `
      <div style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;">
          <span style="font-weight:600; color:var(--navy);">${name}</span>
          <span style="color:var(--ink-soft);">${x.r.pendingSubmissions} submissions · ${x.r.openConcerns} concerns</span>
        </div>
        <div style="background:var(--cream); border-radius:6px; height:10px; overflow:hidden; cursor:pointer;" onmousemove="showChartTip(event,'${tipText}')" onmouseleave="hideChartTip()">
          <div style="width:${pct}%; height:100%; background:var(--danger); border-radius:6px; transition:width .3s ease;"></div>
        </div>
      </div>`;
    }).join('');
  }
  function renderStaffActivityBody(body){
    if(!body) return;
    // localDateStr(), not .toISOString() — see its definition for why: for
    // anyone east of UTC (e.g. India), .toISOString() can land on the wrong
    // calendar day, which would make "today" miss attendance/marks that
    // were in fact entered today.
    const today = localDateStr(new Date());
    const since = new Date(); since.setDate(since.getDate() - staffActivityRange);
    const sinceDate = localDateStr(since);
    if(!staffActivityExamId && examDefs.length) staffActivityExamId = examDefs[examDefs.length-1].id;
    const activeStaff = staffList.filter(staffIsActive);
    const q = staffActivitySearch.trim().toLowerCase();
    const allRows = activeStaff.map(st => computeStaffActivityRow(st, today, sinceDate, staffActivityExamId));
    const rows = allRows.filter(r => !q || (r.staff.firstName+' '+r.staff.lastName).toLowerCase().includes(q));

    const totalHomeworkRecent = allRows.reduce((s,r)=>s+r.homeworkRecentCount,0);
    const totalPendingSubs = allRows.reduce((s,r)=>s+r.pendingSubmissions,0);
    const totalOpenConcerns = allRows.reduce((s,r)=>s+r.openConcerns,0);
    const classTeacherRows = allRows.filter(r => r.homeroomStatus);
    const homeroomsDone = classTeacherRows.filter(r => r.homeroomStatus.done).length;
    const marksRows = allRows.filter(r => r.marksEntry);
    const marksComplete = marksRows.filter(r => r.marksEntry.done === r.marksEntry.total).length;
    const presentToday = allRows.filter(r => r.ownAttStatus === 'Present').length;
    const absentToday = allRows.filter(r => r.ownAttStatus === 'Absent').length;
    const notMarkedToday = allRows.filter(r => r.ownAttStatus === 'Not Marked').length;
    const flaggedCount = allRows.filter(r => r.needsAttention).length;

    const totalSubmissionsAll = inboxSubmissions.length;
    const submissionsReviewedPct = totalSubmissionsAll ? Math.round((totalSubmissionsAll - inboxSubmissions.filter(s=>s.status==='submitted').length) / totalSubmissionsAll * 100) : 100;
    const totalConcernsAll = inboxConcerns.length;
    const concernsResolvedPct = totalConcernsAll ? Math.round((totalConcernsAll - inboxConcerns.filter(c=>c.status==='open').length) / totalConcernsAll * 100) : 100;
    const homeroomPct = classTeacherRows.length ? Math.round(homeroomsDone/classTeacherRows.length*100) : 100;
    const presentPct = allRows.length ? Math.round(presentToday/allRows.length*100) : 0;

    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${staffActivityExamId===ex.id?'selected':''}>${escapeHtml(ex.name)}</option>`).join('');

    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); max-width:780px; margin-bottom:18px;">
        One place to see whether staff are keeping up — homework assigned, submissions reviewed, parent concerns
        answered, exam marks entered, attendance marked for their class, and who's in today. Rows needing your
        attention are flagged and sorted first in the table below.
      </p>

      <div class="profile-card" style="margin-bottom:18px;">
        <div style="display:flex; flex-wrap:wrap; gap:28px; justify-content:space-around;">
          ${ringStatHtml(homeroomPct, 'Homeroom Attendance', homeroomsDone+' / '+classTeacherRows.length+' classes today')}
          ${ringStatHtml(submissionsReviewedPct, 'Submissions Reviewed', (totalSubmissionsAll - inboxSubmissions.filter(s=>s.status==='submitted').length)+' / '+totalSubmissionsAll+' all-time')}
          ${ringStatHtml(concernsResolvedPct, 'Concerns Resolved', (totalConcernsAll - inboxConcerns.filter(c=>c.status==='open').length)+' / '+totalConcernsAll+' all-time')}
          ${ringStatHtml(presentPct, 'Staff Present Today', presentToday+' / '+allRows.length+' active staff')}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:18px;">
        <div class="stat-card"><span>📋 Homework Assigned (${staffActivityRange}d)</span><b>${totalHomeworkRecent}</b></div>
        <div class="stat-card"><span>📥 Submissions Pending</span><b style="${totalPendingSubs>0?'color:var(--danger);':''}">${totalPendingSubs}</b></div>
        <div class="stat-card"><span>💬 Concerns Open</span><b style="${totalOpenConcerns>0?'color:var(--danger);':''}">${totalOpenConcerns}</b></div>
        <div class="stat-card"><span>📝 Marks Entry Complete</span><b>${marksComplete}/${marksRows.length}</b></div>
        <div class="stat-card"><span>🚫 Staff Absent Today</span><b style="${absentToday>0?'color:var(--danger);':''}">${absentToday}</b></div>
        <div class="stat-card"><span>❔ Staff Not Marked Today</span><b>${notMarkedToday}</b></div>
        <div class="stat-card"><span>🔔 Needing Attention</span><b style="${flaggedCount>0?'color:var(--danger);':''}">${flaggedCount}</b></div>
      </div>

      <div style="display:grid; grid-template-columns:1.4fr 1fr; gap:16px; margin-bottom:20px; align-items:stretch;">
        <div class="profile-card">
          <h4 style="margin:0 0 4px;">Homework Assigned — Last ${staffActivityRange} Days</h4>
          <p style="font-size:0.75rem; color:var(--ink-soft); margin:0 0 8px;">Across every teacher, by day.</p>
          ${countTrendChartSVG(dailyHomeworkTrend(staffActivityRange), 'var(--navy)', 'Homework assigned per day')}
        </div>
        <div class="profile-card">
          <h4 style="margin:0 0 10px;">Needs a Nudge</h4>
          ${staffActivityLeaderboardHtml(allRows)}
        </div>
      </div>

      <div class="ms-toolbar" style="margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <input class="input" style="max-width:240px;" placeholder="Search staff by name..." value="${escapeHtml(staffActivitySearch)}" oninput="onStaffActivitySearch(this.value)">
        <select onchange="onStaffActivityRangeChange(this.value)" style="max-width:160px;">
          <option value="7" ${staffActivityRange===7?'selected':''}>Last 7 days</option>
          <option value="30" ${staffActivityRange===30?'selected':''}>Last 30 days</option>
        </select>
        ${examDefs.length ? `<select onchange="onStaffActivityExamChange(this.value)" style="max-width:220px;" title="Exam to check marks-entry status for">${examOptions}</select>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="refreshStaffActivityTab()">Refresh</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Staff</th><th>Homework (${staffActivityRange}d)</th><th>Submissions Pending</th><th>Avg. Review Time</th>
          <th>Concerns Open</th><th>Avg. Reply Time</th><th>Marks Entry</th><th>Homeroom Attendance Today</th><th>Present Today</th>
        </tr></thead><tbody>
        ${rows.length ? rows
          .sort((a,b) => (b.needsAttention?1:0) - (a.needsAttention?1:0) || a.staff.firstName.localeCompare(b.staff.firstName))
          .map(r => renderStaffActivityRow(r)).join('')
          : `<tr><td colspan="9"><div class="empty-state"><b>No staff found</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  function renderStaffActivityRow(r){
    const st = r.staff;
    const name = `${st.firstName} ${st.lastName}`;
    const rowStyle = r.needsAttention ? 'border-left:4px solid var(--danger);' : '';
    const pendingSubHtml = r.pendingSubmissions > 0
      ? `<span class="balance-tag due">${r.pendingSubmissions}</span>${r.oldestPendingSubmissionDays>=2?` <span class="pill" style="font-size:0.6rem; background:var(--danger-bg); color:var(--danger-ink);">⚠️ ${r.oldestPendingSubmissionDays}d</span>`:''}`
      : `<span class="balance-tag zero">0</span>`;
    const openConcernHtml = r.openConcerns > 0
      ? `<span class="balance-tag due">${r.openConcerns}</span>${r.oldestOpenConcernDays>=2?` <span class="pill" style="font-size:0.6rem; background:var(--danger-bg); color:var(--danger-ink);">⚠️ ${r.oldestOpenConcernDays}d</span>`:''}`
      : `<span class="balance-tag zero">0</span>`;
    let marksHtml = '<span style="color:var(--ink-soft);">—</span>';
    if(r.marksEntry){
      marksHtml = r.marksEntry.done === r.marksEntry.total
        ? `<span class="pill" style="background:var(--success-bg); color:var(--success-ink);">✅ ${r.marksEntry.done}/${r.marksEntry.total}</span>`
        : `<span class="balance-tag due">${r.marksEntry.done}/${r.marksEntry.total}</span>`;
    }
    let homeroomHtml = '<span style="color:var(--ink-soft);">— Not a Class Teacher</span>';
    if(r.homeroomStatus){
      const h = r.homeroomStatus;
      homeroomHtml = h.isHoliday
        ? `<span class="pill">Holiday</span>`
        : h.done
          ? `<span class="pill" style="background:var(--success-bg); color:var(--success-ink);">✅ Marked (${h.markedCount}/${h.totalStudents})</span>`
          : `<span class="balance-tag due">⚠️ Not marked (${h.markedCount}/${h.totalStudents})</span>`;
    }
    const attColor = r.ownAttStatus==='Present' ? 'var(--success)' : (r.ownAttStatus==='Absent' ? 'var(--danger)' : 'var(--ink-soft)');
    return `
      <tr style="${rowStyle}">
        <td class="name-cell">${escapeHtml(name)}${r.needsAttention?' 🔴':''}<div style="font-size:0.72rem; color:var(--ink-soft); font-weight:400;">${escapeHtml(st.designation||'')}${st.classTeacherClass?' · Class Teacher: '+escapeHtml(st.classTeacherClass)+' — '+escapeHtml(st.classTeacherSection):''}</div></td>
        <td>${r.homeworkRecentCount}</td>
        <td>${pendingSubHtml}</td>
        <td>${r.avgReviewHours!==null ? fmtHoursShort(r.avgReviewHours) : '—'}</td>
        <td>${openConcernHtml}</td>
        <td>${r.avgReplyHours!==null ? fmtHoursShort(r.avgReplyHours) : '—'}</td>
        <td>${marksHtml}</td>
        <td>${homeroomHtml}</td>
        <td><span style="color:${attColor}; font-weight:600;">${r.ownAttStatus}</span></td>
      </tr>`;
  }

  /* --- Staff Directory (flat sortable table) --- */
  let staffSortField = 'firstName';
  let staffSortDir = 'asc';
  function sortStaffBy(field){
    if(staffSortField === field){ staffSortDir = staffSortDir==='asc' ? 'desc' : 'asc'; }
    else { staffSortField = field; staffSortDir = 'asc'; }
    renderStaffTable(document.getElementById('staffBody'));
  }
  function renderStaffTable(body){
    const deptF = document.getElementById('staffDeptFilter').value;
    const statusF = document.getElementById('staffStatusFilter').value;
    let list = staffList.slice();
    if(deptF) list = list.filter(st => st.department === deptF);
    if(statusF !== 'all') list = list.filter(st => statusF==='Active' ? staffIsActive(st) : !staffIsActive(st));
    list.sort((a,b) => {
      const va = (a[staffSortField]||'').toString().toLowerCase();
      const vb = (b[staffSortField]||'').toString().toLowerCase();
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return staffSortDir === 'asc' ? cmp : -cmp;
    });
    document.getElementById('staffTotalCount').textContent = `Total: ${staffList.length} staff member${staffList.length===1?'':'s'}`;
    const arrow = f => staffSortField===f ? (staffSortDir==='asc'?' ▲':' ▼') : '';
    body.innerHTML = `
      <div class="table-wrap">
        <table><thead><tr>
          <th style="cursor:pointer;" onclick="sortStaffBy('firstName')">Name${arrow('firstName')}</th>
          <th>Designation</th>
          <th>Department</th>
          <th style="cursor:pointer;" onclick="sortStaffBy('status')">Status${arrow('status')}</th>
          <th>Email</th>
          <th>Phone</th>
          <th style="cursor:pointer;" onclick="sortStaffBy('doj')">Date Joined${arrow('doj')}</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>
        ${list.map(st => `<tr>
          <td class="name-cell" style="cursor:pointer;" onclick="openStaffProfile('${st.id}')">${st.firstName} ${st.lastName}</td>
          <td><span class="pill">${st.designation||'—'}</span></td>
          <td>${st.department||'—'}</td>
          <td><span class="pill" style="${staffIsActive(st)?'':'background:rgba(209,16,115,0.13); color:var(--magenta);'}">${st.status||'Active'}</span></td>
          <td>${st.email||'—'}</td>
          <td>${st.phone||'—'}</td>
          <td>${st.doj||'—'}</td>
          <td>
            <div style="display:flex; gap:10px;">
              ${currentUser.role === 'Admin' ? `<button title="Grant login access" onclick="openLoginForStaff('${st.id}')" style="background:none; border:none; cursor:pointer; color:var(--magenta); font-size:1rem;">🔑</button>` : ''}
              <button title="View profile" onclick="openStaffProfile('${st.id}')" style="background:none; border:none; cursor:pointer; color:var(--magenta); font-size:1rem;">👁</button>
              ${canDo('staff','edit') ? `<button title="Edit" onclick="openStaffWizard('${st.id}')" style="background:none; border:none; cursor:pointer; color:var(--teal); font-size:1rem;">✎</button>` : ''}
              ${canDo('staff','delete') ? `<button title="Delete" onclick="deleteStaff('${st.id}')" style="background:none; border:none; cursor:pointer; color:var(--magenta); font-size:1rem;">🗑</button>` : ''}
            </div>
          </td>
        </tr>`).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No staff match this filter</b></div>` : ``}
      </div>
    `;
  }
  function backToStaffGrid(){ staffView = 'table'; renderStaffBody(); }
  // Set right before the "Add Staff User" modal opens, and consumed by
  // saveUser() once that new login is actually saved — this is what makes
  // the 🔑 "Grant login access" shortcut (unlike the Staff-edit Contact tab's
  // own checkbox, which sets staffRecord.linkedUserId itself) link the new
  // Users & Roles account back onto this exact staff record. Without this,
  // the login exists in Users & Roles but myTeacherScope() can never find it
  // from a Teacher's own session, so their Class/Subject assignments never
  // translate into Attendance/Marks Entry access.
  let pendingStaffLoginLinkId = null;
  function openLoginForStaff(staffId){
    // Belt-and-suspenders: the 🔑 button itself is Admin-only now, but
    // creating/editing a login is hard-locked to Admin server-side
    // regardless (see server.js), so guard here too rather than letting a
    // non-Admin get as far as a modal whose save will just be rejected.
    if(currentUser.role !== 'Admin'){ showToast("Only an Admin can grant a staff login."); return; }
    const st = staffList.find(x => x.id === staffId);
    if(!st) return;
    pendingStaffLoginLinkId = staffId;
    switchView('usersroles');
    setTimeout(() => openUserModal(st.firstName + ' ' + st.lastName, undefined, undefined, 'staff'), 60);
  }

  function openStaffProfile(id){
    staffCurrentId = id;
    staffView = 'profile';
    renderStaffBody();
  }
  function renderStaffProfile(body){
    const st = staffList.find(x => x.id === staffCurrentId);
    if(!st){ staffView = 'grid'; return renderStaffBody(); }
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToStaffGrid()">Staff Directory</a> &nbsp;/&nbsp; ${st.firstName} ${st.lastName}</div>
      <div class="profile-head">
        ${st.photo ? `<img class="profile-photo" src="${st.photo}">` : `<div class="profile-photo">${staffInitials(st)}</div>`}
        <div>
          <h2>${st.firstName} ${st.lastName}</h2>
          <div class="p-meta">${st.staffId} · ${st.designation||'—'} · ${st.department} · <span class="pill">${st.status||'Active'}</span>${st.classTeacherClass ? ` · <span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Class Teacher: ${st.classTeacherClass} — ${st.classTeacherSection}</span>` : ''}</div>
        </div>
        <div class="profile-actions">
          ${canDo('staff','edit') ? `<button class="btn btn-ghost" onclick="openStaffWizard('${st.id}')">Edit</button>` : ''}
          ${canDo('staff','delete') ? `<button class="btn btn-danger-text" style="border:1.5px solid var(--border); border-radius:10px; padding:11px 20px;" onclick="deleteStaff('${st.id}')">Delete</button>` : ''}
        </div>
      </div>
      <div class="profile-grid">
        <div class="profile-card">
          <h4>Personal Details</h4>
          <div class="profile-row"><span>Gender</span><span>${st.gender||'—'}</span></div>
          <div class="profile-row"><span>Date of Birth</span><span>${st.dob||'—'}</span></div>
          <div class="profile-row"><span>Blood Group</span><span>${st.blood||'—'}</span></div>
          <div class="profile-row"><span>Aadhar Number</span><span>${st.aadhar||'—'}</span></div>
          <div class="profile-row"><span>Caste Category</span><span>${st.caste||'—'}</span></div>
        </div>
        <div class="profile-card">
          <h4>Professional Details</h4>
          <div class="profile-row"><span>Department</span><span>${st.department}</span></div>
          <div class="profile-row"><span>Designation</span><span>${st.designation||'—'}</span></div>
          <div class="profile-row"><span>Date of Joining</span><span>${st.doj||'—'}</span></div>
          <div class="profile-row"><span>Qualification</span><span>${st.qualification||'—'}</span></div>
          <div class="profile-row"><span>Experience</span><span>${st.experience ? st.experience+' yrs' : '—'}</span></div>
          <div class="profile-row"><span>Basic Salary</span><span>${st.salary ? fmtMoney(st.salary) : '—'}</span></div>
          <div class="profile-row"><span>Job Type(s)</span><span>${st.jobTypes && st.jobTypes.length ? st.jobTypes.join(', ') : '—'}</span></div>
          <div class="profile-row"><span>Class Teacher Of</span><span>${st.classTeacherClass ? st.classTeacherClass+' — Section '+st.classTeacherSection : '—'}</span></div>
        </div>
        <div class="profile-card">
          <h4>Subjects Taught</h4>
          <p style="font-size:0.78rem; color:var(--ink-soft); margin:4px 0 12px;">Check every subject &amp; class this teacher takes — updates their timetable and subject-teacher assignments immediately.</p>
          <div id="staffSubjectsChecklist" style="max-height:280px; overflow-y:auto;">
            ${renderStaffSubjectsChecklistHtml(st.id)}
          </div>
        </div>
        <div class="profile-card">
          <h4>Contact Details</h4>
          <div class="profile-row"><span>Phone</span><span>${st.phone||'—'}</span></div>
          <div class="profile-row"><span>Email</span><span>${st.email||'—'}</span></div>
          <div class="profile-row"><span>Address</span><span>${st.address||'—'}</span></div>
          <div class="profile-row"><span>Emergency Contact</span><span>${st.emergencyName ? st.emergencyName+(st.emergencyPhone?' — '+st.emergencyPhone:'') : '—'}</span></div>
          <div class="profile-row"><span>Login Access</span><span>${st.linkedUserId && users.some(u => u.id === st.linkedUserId) ? '<span class="pill">Enabled</span>' : (st.linkedUserId ? '<span style="color:var(--magenta);">Broken link — recreate it</span>' : '<span style="color:var(--ink-soft);">Not set up</span>')}</span></div>
        </div>
        ${renderStaffPayrollPerformanceCard(st)}
      </div>
    `;
  }
  /* One glance at pay + performance, right on the profile — so you don't have to hunt across
     Payroll and Reports separately to check on a staff member. */
  function renderStaffPayrollPerformanceCard(st){
    const month = staffPayrollMonth || currentMonthStr();
    const { rec, preview } = staffPayrollRowData(st.id, month);
    const perf = staffPerformanceSnapshot(st.id);
    return `
        <div class="profile-card">
          <h4>Payroll — ${new Date(month+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'})}</h4>
          <div class="profile-row"><span>Status</span><span>${rec ? `<span class="pill" style="${rec.status==='Approved'?'background:rgba(31,122,77,0.13); color:#1f7a4d;':'background:rgba(184,98,27,0.13); color:#b8621b;'}">${rec.status}</span>` : `<span class="pill">Not generated</span>`}</span></div>
          <div class="profile-row"><span>Leaves Taken / Quota</span><span>${preview.leaveDays} / ${preview.quota}</span></div>
          <div class="profile-row"><span>EPF / ESI</span><span>${st.epfEnabled?'EPF ✓':'EPF ✗'} &nbsp; ${st.esiEnabled?'ESI ✓':'ESI ✗'}</span></div>
          <div class="profile-row"><span>Gross Salary</span><span>${fmtMoney(preview.grossSalary)}</span></div>
          <div class="profile-row"><span><b>Net Salary</b></span><span><b>${fmtMoney(preview.netSalary)}</b></span></div>
          <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="switchView('staffpayroll')">Open Payroll →</button>
        </div>
        <div class="profile-card">
          <h4>Performance Snapshot <span style="font-weight:400; color:var(--ink-soft); font-size:0.72rem;">(all exams)</span></h4>
          ${perf ? `
          <div class="profile-row"><span>Subjects Evaluated</span><span>${perf.subjects.join(', ')}</span></div>
          <div class="profile-row"><span>Students Evaluated</span><span>${perf.studentsEvaluated}</span></div>
          <div class="profile-row"><span>Average %</span><span>${perf.avgPct}%</span></div>
          <div class="profile-row"><span>Pass Rate</span><span>${perf.passRate}%</span></div>
          ` : `<p style="font-size:0.8rem; color:var(--ink-soft);">No marks recorded yet against subjects this staff member teaches.</p>`}
          <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="switchView('staffreports')">Open Teacher Performance Reports →</button>
        </div>`;
  }
  function staffPerformanceSnapshot(staffId){
    const rows = teacherPerformanceRawRows('').filter(r => r.teacherId === staffId);
    if(rows.length === 0) return null;
    const totalStudents = rows.reduce((a,r) => a + r.studentsEvaluated, 0);
    const weightedPct = rows.reduce((a,r) => a + r.avgPct * r.studentsEvaluated, 0);
    const weightedPass = rows.reduce((a,r) => a + r.passRate * r.studentsEvaluated, 0);
    return {
      subjects: [...new Set(rows.map(r => r.subject))],
      studentsEvaluated: totalStudents,
      avgPct: totalStudents ? Math.round((weightedPct/totalStudents)*10)/10 : 0,
      passRate: totalStudents ? Math.round((weightedPass/totalStudents)*10)/10 : 0,
    };
  }
  /* ===== SUBJECT ASSIGNMENTS MODULE — a faster, purpose-built way to assign
     subjects+sections to teachers than the buried checklists in the Staff wizard. ===== */
  