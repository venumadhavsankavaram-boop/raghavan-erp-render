let tpDashExamId = '';
  let tpDashExpandedId = '';
  function onTeacherPerfDashExamChange(){
    tpDashExamId = document.getElementById('tpDashExamSelect').value;
    renderStaffReportsTab(document.getElementById('stfReportsBody'));
  }
  function toggleTeacherPerfDetail(teacherId){
    tpDashExpandedId = (tpDashExpandedId === teacherId) ? '' : teacherId;
    renderStaffReportsTab(document.getElementById('stfReportsBody'));
  }
  // Average % for each subject across every teacher of that subject in scope — the
  // fair yardstick for "is this teacher's average actually good", since a 68% average
  // in a historically hard subject can be a stronger result than a 78% in an easy one.
  function teacherPerformanceBaselines(examId, filters){
    const rows = teacherPerformanceScopedRows(examId, filters);
    const bySubject = {};
    rows.forEach(r => {
      const b = bySubject[r.subject] || (bySubject[r.subject] = { sum:0, n:0 });
      b.sum += r.avgPct * r.studentsEvaluated;
      b.n += r.studentsEvaluated;
    });
    const baselines = {};
    Object.keys(bySubject).forEach(k => { baselines[k] = bySubject[k].n ? bySubject[k].sum / bySubject[k].n : 0; });
    return baselines;
  }
  function teacherPerformanceDashboardRows(examId, filters){
    const rows = teacherPerformanceScopedRows(examId, filters);
    const baselines = teacherPerformanceBaselines(examId, filters);
    const byTeacher = {};
    rows.forEach(r => {
      const t = byTeacher[r.teacherId] || (byTeacher[r.teacherId] = {
        teacherId: r.teacherId, name: r.teacherName, designation: r.designation,
        subjects: new Set(), sections: new Set(), totalStudents: 0,
        weightedPctSum: 0, weightedPassSum: 0, weightedBaselineSum: 0,
        stdDevs: [], highest: -Infinity, lowest: Infinity,
      });
      t.subjects.add(r.subject);
      t.sections.add(r.className + ' - ' + r.section);
      t.totalStudents += r.studentsEvaluated;
      t.weightedPctSum += r.avgPct * r.studentsEvaluated;
      t.weightedPassSum += r.passRate * r.studentsEvaluated;
      t.weightedBaselineSum += (baselines[r.subject] || 0) * r.studentsEvaluated;
      t.stdDevs.push(r.stdDev);
      t.highest = Math.max(t.highest, r.highest);
      t.lowest = Math.min(t.lowest, r.lowest);
    });
    return Object.values(byTeacher).map(t => {
      const avg = t.totalStudents ? t.weightedPctSum / t.totalStudents : 0;
      const passRate = t.totalStudents ? t.weightedPassSum / t.totalStudents : 0;
      const baseline = t.totalStudents ? t.weightedBaselineSum / t.totalStudents : 0;
      const consistency = t.stdDevs.length ? t.stdDevs.reduce((a,b) => a+b, 0) / t.stdDevs.length : 0;
      const attStats = computeStaffAttendanceStats(t.teacherId);
      const attendancePct = attStats.total > 0 ? attStats.pct : null;
      const syl = teacherPerformanceSyllabusStats(t.teacherId, filters);
      const trend = teacherPerformanceTrend(t.teacherId, filters);
      const trendDelta = trend.length >= 2 ? Math.round((trend[trend.length-1].avgPct - trend[trend.length-2].avgPct)*10)/10 : null;
      const row = {
        teacherId: t.teacherId, name: t.name, designation: t.designation,
        subjects: Array.from(t.subjects), sections: Array.from(t.sections), totalStudents: t.totalStudents,
        avgPct: Math.round(avg*10)/10, passRate: Math.round(passRate*10)/10, consistency: Math.round(consistency*10)/10,
        highest: Math.round(t.highest*10)/10, lowest: Math.round(t.lowest*10)/10,
        baseline: Math.round(baseline*10)/10, delta: Math.round((avg-baseline)*10)/10,
        attendancePct, syllabusPct: syl.pct, syllabusOverdue: syl.overdue, trendDelta,
      };
      row.overallScore = teacherPerformanceOverallScore(row);
      const fn = teacherPerformanceFlagAndNotes(row);
      row.flag = fn.flag; row.talkingPoint = fn.talkingPoint;
      return row;
    }).sort((a,b) => b.overallScore - a.overallScore);
  }
  // Per-student grade spread for one teacher — mirrors teacherPerformanceRawRows'
  // own filtering (same exam/subject/class/section matching) but keeps every
  // individual result instead of collapsing straight to an average.
  function teacherPerformanceGradeDistribution(teacherId, examId, filters){
    const examsToUse = examId ? examDefs.filter(e => e.id === examId) : examDefs;
    const counts = {};
    gradingScale.forEach(g => { counts[g.grade] = 0; });
    let total = 0;
    subjectsList.forEach(subj => {
      if(filters.className && subj.className !== filters.className) return;
      (subj.sections || []).forEach(section => {
        if(filters.section && section !== filters.section) return;
        const teacherIds = subjectStaffForSection(subj, section);
        if(!teacherIds || !teacherIds.includes(teacherId)) return;
        examsToUse.forEach(exam => {
          const cfg = getExamSubjects(exam, subj.className, section).find(s => s.name === subj.name);
          if(!cfg || cfg.countable === false) return;
          const classStudents = students.filter(s => s.className === subj.className && s.section === section && isActive(s));
          classStudents.forEach(s => {
            const r = examResults.find(er => er.examId === exam.id && er.studentId === s.id && er.subject === subj.name);
            if(!r || r.absent) return;
            if(r.marks === null || r.marks === undefined || r.marks === '') return;
            const pct = (Number(r.marks) / (cfg.maxMarks || 100)) * 100;
            const grade = gradeForPct(pct);
            counts[grade] = (counts[grade] || 0) + 1;
            total++;
          });
        });
      });
    });
    return { counts, total };
  }
  // One average-% point per exam this teacher has marks in, oldest first — the
  // "is this teacher trending up or down" signal, independent of any single exam.
  function teacherPerformanceTrend(teacherId, filters){
    return examDefs.slice()
      .sort((a,b) => (a.startDate||'').localeCompare(b.startDate||''))
      .map(exam => {
        const rows = teacherPerformanceScopedRows(exam.id, filters).filter(r => r.teacherId === teacherId);
        if(rows.length === 0) return null;
        const totalStudents = rows.reduce((s,r) => s + r.studentsEvaluated, 0);
        const avg = totalStudents ? rows.reduce((s,r) => s + r.avgPct * r.studentsEvaluated, 0) / totalStudents : 0;
        return { examId: exam.id, examName: exam.name, avgPct: Math.round(avg*10)/10 };
      })
      .filter(Boolean);
  }
  // Average attendance % across every active student in the classes/sections this
  // teacher currently teaches (attendance isn't tied to a specific exam, so this
  // is scope-wide rather than per-exam) — context for reading the marks, since
  // poor attendance often explains poor marks better than teaching quality does.
  function teacherPerformanceAttendanceContext(teacherId, filters){
    const combos = new Set();
    subjectsList.forEach(subj => {
      if(filters.className && subj.className !== filters.className) return;
      (subj.sections || []).forEach(section => {
        if(filters.section && section !== filters.section) return;
        const ids = subjectStaffForSection(subj, section);
        if(ids && ids.includes(teacherId)) combos.add(subj.className + '||' + section);
      });
    });
    let sum = 0, n = 0;
    combos.forEach(key => {
      const [cls, sec] = key.split('||');
      students.filter(s => s.className === cls && s.section === sec && isActive(s)).forEach(s => {
        const stats = computeAttendanceStats(s.id);
        if(stats.total > 0){ sum += stats.pct; n++; }
      });
    });
    return n ? Math.round(sum / n) : null;
  }
  // Syllabus completion for the class/section/subject combos this teacher currently
  // teaches — pulled from the Syllabus Tracker, same "top ERP" signal as class results
  // and attendance. completedOnTime excludes topics finished after their own target date,
  // so a teacher can't look "complete" while running behind schedule.
  function teacherPerformanceSyllabusStats(teacherId, filters){
    const combos = new Set();
    subjectsList.forEach(subj => {
      if(filters.className && subj.className !== filters.className) return;
      (subj.sections || []).forEach(section => {
        if(filters.section && section !== filters.section) return;
        const ids = subjectStaffForSection(subj, section);
        if(ids && ids.includes(teacherId)) combos.add(subj.className + '||' + section + '||' + subj.name);
      });
    });
    if(combos.size === 0) return { total:0, completed:0, onTime:0, overdue:0, pct:null };
    const today = new Date().toISOString().slice(0,10);
    let total=0, completed=0, onTime=0, overdue=0;
    syllabusTopics.forEach(t => {
      const key1 = t.className + '||' + t.section + '||' + t.subject;
      const key2 = t.className + '||' + '' + '||' + t.subject; // topics logged for "All Sections"
      if(!combos.has(key1) && !combos.has(key2)) return;
      total++;
      if(t.status === 'Completed'){
        completed++;
        if(!t.targetDate || !t.completedDate || t.completedDate <= t.targetDate) onTime++;
      }else if(t.targetDate && t.targetDate < today){
        overdue++;
      }
    });
    return { total, completed, onTime, overdue, pct: total ? Math.round((completed/total)*100) : null };
  }
  // Rolls every available signal into one 0-100 Overall Score using TEACHER_PERF_WEIGHTS,
  // rescaling across whichever components actually have data for this teacher. Also returns
  // a meeting-ready flag (top performer / needs attention / steady) and the reasons behind it,
  // so the number is never presented without the "why" behind it.
  function teacherPerformanceOverallScore(t){
    const consistencyScore = Math.max(0, Math.min(100, 100 - t.consistency*2.5));
    const components = [
      { key:'academic', value:t.avgPct, weight:TEACHER_PERF_WEIGHTS.academic },
      { key:'passRate', value:t.passRate, weight:TEACHER_PERF_WEIGHTS.passRate },
      { key:'attendance', value:t.attendancePct, weight:TEACHER_PERF_WEIGHTS.attendance },
      { key:'syllabus', value:t.syllabusPct, weight:TEACHER_PERF_WEIGHTS.syllabus },
      { key:'consistency', value:consistencyScore, weight:TEACHER_PERF_WEIGHTS.consistency },
    ].filter(c => c.value !== null && c.value !== undefined && !isNaN(c.value));
    const totalWeight = components.reduce((s,c) => s+c.weight, 0);
    const score = totalWeight ? components.reduce((s,c) => s+c.value*c.weight, 0) / totalWeight : t.avgPct;
    return Math.round(score*10)/10;
  }
  function teacherPerformanceFlagAndNotes(t){
    const notes = [];
    if(t.attendancePct !== null){
      if(t.attendancePct < 75) notes.push(`personal attendance is low (${t.attendancePct}%)`);
      else if(t.attendancePct >= 95) notes.push(`excellent personal attendance (${t.attendancePct}%)`);
    }
    if(t.syllabusPct !== null){
      if(t.syllabusPct < 50) notes.push(`syllabus completion is behind schedule (${t.syllabusPct}%${t.syllabusOverdue?', '+t.syllabusOverdue+' topic(s) overdue':''})`);
      else if(t.syllabusPct >= 90) notes.push(`syllabus is on track (${t.syllabusPct}%)`);
    }
    if(t.trendDelta !== null){
      if(t.trendDelta <= -5) notes.push(`results dipped ${Math.abs(t.trendDelta)}% since the last exam`);
      else if(t.trendDelta >= 5) notes.push(`results improved ${t.trendDelta}% since the last exam`);
    }
    if(t.delta >= 5) notes.push(`${t.delta}% above the subject average — strong result`);
    else if(t.delta <= -8) notes.push(`${Math.abs(t.delta)}% below the subject average — worth discussing`);
    let flag = 'steady';
    if(t.overallScore >= 85 && (t.attendancePct === null || t.attendancePct >= 90)) flag = 'top';
    else if(t.overallScore < 60 || t.trendDelta <= -8 || (t.attendancePct !== null && t.attendancePct < 70) || (t.syllabusPct !== null && t.syllabusPct < 40)) flag = 'attention';
    const talkingPoint = notes.length ? notes.join('; ')+'.' : 'Performing steadily — no flags this period.';
    return { flag, talkingPoint };
  }
  function renderTeacherPerfDashboard(filters){
    const examId = tpDashExamId;
    const dashRows = teacherPerformanceDashboardRows(examId, filters);
    const exam = examId ? examDefs.find(e => e.id === examId) : null;
    const examOptions = `<option value="">All Exams (Cumulative)</option>` +
      examDefs.map(ex => `<option value="${ex.id}" ${examId===ex.id?'selected':''}>${ex.name}</option>`).join('');
    const w = TEACHER_PERF_WEIGHTS;
    const header = `
      <div class="profile-card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <h4 style="margin:0;">📊 Teacher Performance Dashboard</h4>
          <select id="tpDashExamSelect" onchange="onTeacherPerfDashExamChange()" style="font-size:0.8rem; padding:6px 10px; border-radius:8px; border:1.5px solid var(--border);">${examOptions}</select>
        </div>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:8px 0 6px;">Ranked by <b>Overall Score</b> — a weighted blend of student results (${Math.round(w.academic*100)}%), pass rate (${Math.round(w.passRate*100)}%), the teacher's own attendance/punctuality (${Math.round(w.attendance*100)}%), syllabus completion (${Math.round(w.syllabus*100)}%) and result consistency (${Math.round(w.consistency*100)}%) — the same mix of signals the major Indian school ERPs use, so no single bad exam or one absent day decides the picture. A component with no data yet for a teacher is left out and the rest are rescaled. "vs subject avg" compares a teacher only against others teaching the <i>same</i> subject(s). Click any row for the full breakdown, or use the Staff Meeting Pack below for a print-ready handout.</p>
        <div style="display:flex; gap:14px; flex-wrap:wrap; font-size:0.72rem; color:var(--ink-soft);">
          <span>🌟 <b>Top Performer</b> — score ≥ 85 with strong personal attendance</span>
          <span>⚠ <b>Needs Attention</b> — score &lt; 60, a sharp dip, low attendance, or syllabus well behind</span>
        </div>
      </div>
    `;
    if(dashRows.length === 0){
      return header + `<div class="empty-state" style="margin-bottom:24px;"><b>No marks recorded yet for this scope</b>Enter marks under Manage Exams, then come back here.</div>`;
    }
    const flagBadge = (flag) => flag==='top' ? `<span class="pill" style="background:rgba(24,143,134,0.14); color:var(--teal); font-weight:700;">🌟 Top</span>`
      : flag==='attention' ? `<span class="pill" style="background:rgba(209,16,115,0.12); color:var(--magenta); font-weight:700;">⚠ Attention</span>`
      : `<span class="pill" style="background:rgba(0,0,0,0.06); color:var(--ink-soft);">Steady</span>`;
    const bodyRows = dashRows.map((t, i) => {
      const deltaColor = t.delta > 0 ? 'var(--teal)' : (t.delta < 0 ? 'var(--magenta)' : 'var(--ink-soft)');
      const deltaLabel = (t.delta > 0 ? '+' : '') + t.delta + '% vs subject avg';
      const expanded = tpDashExpandedId === t.teacherId;
      const detailRow = expanded
        ? `<tr><td colspan="9" style="padding:0; background:var(--cream); border-bottom:2px solid var(--border);">${renderTeacherPerfDetail(t, examId, filters)}</td></tr>`
        : '';
      return `
        <tr style="cursor:pointer;" onclick="toggleTeacherPerfDetail('${t.teacherId}')">
          <td style="font-family:'Baloo 2',cursive; font-weight:700; color:var(--gold);">#${i+1}</td>
          <td class="name-cell">${t.name}<div style="font-size:0.7rem; color:var(--ink-soft); font-weight:400;">${t.designation}</div></td>
          <td style="font-size:0.78rem;">${t.subjects.join(', ')}</td>
          <td>${t.totalStudents}</td>
          <td><b>${t.avgPct}%</b><div style="font-size:0.72rem; color:${deltaColor};">${deltaLabel}</div></td>
          <td>${t.attendancePct!==null ? t.attendancePct+'%' : '—'}</td>
          <td>${t.syllabusPct!==null ? t.syllabusPct+'%' : '—'}</td>
          <td>${t.passRate}%</td>
          <td><b style="font-size:0.95rem;">${t.overallScore}</b><div style="margin-top:2px;">${flagBadge(t.flag)}</div></td>
        </tr>${detailRow}`;
    }).join('');
    return header + `
      <div class="table-wrap" style="overflow-x:auto; margin-bottom:28px;">
        <table><thead><tr>
          <th>Rank</th><th>Teacher</th><th>Subjects</th><th>Students</th><th>Academic Avg</th><th>Attendance</th><th>Syllabus</th><th>Pass Rate</th><th>Overall Score</th>
        </tr></thead><tbody>${bodyRows}</tbody></table>
      </div>
    `;
  }
  function renderTeacherPerfDetail(t, examId, filters){
    const dist = teacherPerformanceGradeDistribution(t.teacherId, examId, filters);
    const trend = teacherPerformanceTrend(t.teacherId, filters);
    const classAttendancePct = teacherPerformanceAttendanceContext(t.teacherId, filters);
    const syl = teacherPerformanceSyllabusStats(t.teacherId, filters);
    const maxDistCount = Math.max(1, ...Object.values(dist.counts));
    const maxTrend = Math.max(1, ...trend.map(x => x.avgPct), 1);

    const distBars = gradingScale.map(g => {
      const count = dist.counts[g.grade] || 0;
      const pct = dist.total ? Math.round((count/dist.total)*100) : 0;
      const width = Math.round((count/maxDistCount)*100);
      return `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
          <div style="width:34px; font-size:0.76rem; font-weight:700; color:var(--navy); flex-shrink:0;">${g.grade}</div>
          <div style="flex:1; background:var(--border); border-radius:6px; height:16px; overflow:hidden;">
            <div style="width:${width}%; background:var(--teal); height:100%; border-radius:6px;"></div>
          </div>
          <div style="width:76px; font-size:0.74rem; color:var(--ink-soft); flex-shrink:0; text-align:right;">${count} (${pct}%)</div>
        </div>`;
    }).join('');

    const trendBars = trend.length ? trend.map(x => {
      const width = Math.round((x.avgPct/maxTrend)*100);
      return `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
          <div style="width:120px; font-size:0.74rem; color:var(--ink-soft); flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${x.examName}">${x.examName}</div>
          <div style="flex:1; background:var(--border); border-radius:6px; height:16px; overflow:hidden;">
            <div style="width:${width}%; background:var(--gold); height:100%; border-radius:6px;"></div>
          </div>
          <div style="width:50px; font-size:0.74rem; color:var(--ink-soft); flex-shrink:0; text-align:right;">${x.avgPct}%</div>
        </div>`;
    }).join('') : `<p style="font-size:0.78rem; color:var(--ink-soft);">Not enough exam history yet to show a trend.</p>`;

    return `
      <div style="padding:18px 20px;">
        <div class="profile-card" style="margin-bottom:16px; border-left:4px solid ${t.flag==='top'?'var(--teal)':t.flag==='attention'?'var(--magenta)':'var(--border)'};">
          <div style="font-size:0.72rem; font-weight:700; color:var(--ink-soft); letter-spacing:.03em; margin-bottom:4px;">MEETING TALKING POINT</div>
          <p style="margin:0; font-size:0.86rem;">${t.talkingPoint}</p>
        </div>
        <div class="pay-summary-grid" style="margin-bottom:20px;">
          <div class="pay-summary-item highlight"><span>Overall Score</span><b>${t.overallScore}</b></div>
          <div class="pay-summary-item"><span>Academic Average</span><b>${t.avgPct}%</b></div>
          <div class="pay-summary-item"><span>Highest / Lowest</span><b>${t.highest}% / ${t.lowest}%</b></div>
          <div class="pay-summary-item"><span>Pass Rate</span><b>${t.passRate}%</b></div>
          <div class="pay-summary-item"><span>Consistency (Std. Dev., lower is steadier)</span><b>${t.consistency}</b></div>
          <div class="pay-summary-item after"><span>Personal Attendance</span><b>${t.attendancePct!==null?t.attendancePct+'%':'Not marked yet'}</b></div>
          <div class="pay-summary-item"><span>Syllabus Completion</span><b>${t.syllabusPct!==null?t.syllabusPct+'%':'No topics logged'}</b></div>
          ${syl.overdue>0 ? `<div class="pay-summary-item"><span>Syllabus Topics Overdue</span><b style="color:var(--magenta);">${syl.overdue}</b></div>` : ''}
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:28px;">
          <div>
            <h4 style="margin:0 0 10px; font-size:0.9rem;">Grade Distribution${dist.total ? ` — ${dist.total} results` : ''}</h4>
            ${dist.total ? distBars : `<p style="font-size:0.78rem; color:var(--ink-soft);">No marks in this scope yet.</p>`}
          </div>
          <div>
            <h4 style="margin:0 0 10px; font-size:0.9rem;">Trend Across Exams</h4>
            ${trendBars}
          </div>
        </div>
        <p style="font-size:0.72rem; color:var(--ink-soft); margin-top:16px;">
          Classes: ${t.sections.join(', ')}${classAttendancePct !== null ? ` · Average student attendance across these classes: ${classAttendancePct}% — low marks alongside low student attendance usually points to an attendance problem, not a teaching one.` : ''}
        </p>
      </div>
    `;
  }

  function generateTeacherPerfReport(kind, format, filtersOverride){
    const examSel = document.getElementById('libTeacherPerfExamSelect');
    const examId = examSel ? examSel.value : '';
    const exam = examId ? examDefs.find(e => e.id === examId) : null;
    const filters = filtersOverride || getReportScopeFilters();
    const rows = kind === 'summary' ? teacherPerformanceSummaryReport(examId, filters) : teacherPerformanceDetailReport(examId, filters);
    if(rows.length === 0){ showToast('No marks recorded yet for this scope.'); return; }
    const label = kind === 'summary' ? 'Teacher Performance Summary' : 'Teacher Performance — Detailed';
    const title = label + (exam ? ' — ' + exam.name : ' — All Exams');
    if(format === 'excel') exportRowsToExcel('teacher_performance_'+kind+'.xlsx', label, rows);
    else exportRowsToPDF(title, '', rows);
  }

  // --- Staff Meeting Pack: a purpose-built printable handout for staff performance review
  // meetings — not just the same numbers as the ranked table, but a document a Principal can
  // walk into a meeting with. Groups teachers by flag (Top Performers first, so the meeting
  // opens on a positive note), gives each one a one-line talking point already written out, and
  // leaves ruled space to jot the discussion/decision by hand. Same print pipeline as admit
  // cards / report cards: window.open + document.write + onload print, no PDF library involved.
  function buildStaffMeetingPackHtml(examId, filters){
    const dashRows = teacherPerformanceDashboardRows(examId, filters);
    const exam = examId ? examDefs.find(e => e.id === examId) : null;
    const logoSrc = document.querySelector('.sb-brand img') ? document.querySelector('.sb-brand img').src : '';
    const principalSig = schoolInfo.principalSignature || '';
    const w = TEACHER_PERF_WEIGHTS;

    const scopeBits = [];
    if(filters.className) scopeBits.push(filters.className + (filters.section ? ' - '+filters.section : ''));
    else if(filters.section) scopeBits.push('Section ' + filters.section);
    if(filters.department) scopeBits.push(filters.department + ' department');
    const scopeLabel = scopeBits.length ? scopeBits.join(', ') : 'All classes & departments';

    const top = dashRows.filter(t => t.flag === 'top');
    const attention = dashRows.filter(t => t.flag === 'attention');
    const steady = dashRows.filter(t => t.flag === 'steady');
    const avgScore = dashRows.length ? Math.round((dashRows.reduce((s,t) => s+t.overallScore, 0) / dashRows.length) * 10) / 10 : 0;

    const flagBadge = (flag) => flag==='top' ? `<span class="smp-badge smp-badge-top">🌟 Top</span>`
      : flag==='attention' ? `<span class="smp-badge smp-badge-attn">⚠ Attention</span>`
      : `<span class="smp-badge smp-badge-steady">Steady</span>`;

    const tableRows = dashRows.map((t,i) => `
      <tr>
        <td>${i+1}</td>
        <td>${t.name}<div class="smp-sub">${t.designation}</div></td>
        <td>${t.subjects.join(', ')}</td>
        <td><b>${t.overallScore}</b></td>
        <td>${t.avgPct}%</td>
        <td>${t.attendancePct!==null ? t.attendancePct+'%' : '—'}</td>
        <td>${t.syllabusPct!==null ? t.syllabusPct+'%' : '—'}</td>
        <td>${t.passRate}%</td>
        <td>${flagBadge(t.flag)}</td>
      </tr>`).join('');

    const groupSection = (label, list, cssClass) => {
      if(list.length === 0) return '';
      return `
        <div class="smp-group ${cssClass}">
          <h3>${label} <span class="smp-count">(${list.length})</span></h3>
          ${list.map(t => `
            <div class="smp-teacher">
              <div class="smp-teacher-head">
                <b>${t.name}</b> <span class="smp-sub">${t.designation} · ${t.subjects.join(', ')}</span>
                <span class="smp-score">Overall Score: ${t.overallScore}</span>
              </div>
              <p class="smp-talk">${t.talkingPoint}</p>
              <div class="smp-notesline"></div>
              <div class="smp-notesline"></div>
            </div>
          `).join('')}
        </div>`;
    };

    const html = `
      <div class="smp-header">
        ${logoSrc ? `<img class="smp-logo" src="${logoSrc}">` : ''}
        <div>
          <div class="smp-school">${schoolInfo.name || ''}</div>
          <div class="smp-addr">${schoolInfo.address || ''}</div>
        </div>
      </div>
      <h1 class="smp-title">Staff Performance Review — Meeting Pack</h1>
      <div class="smp-meta">
        <span><b>Scope:</b> ${exam ? exam.name : 'All Exams (Cumulative)'} · ${scopeLabel}</span>
        <span><b>Generated:</b> ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
      </div>

      <div class="smp-summary">
        <div class="smp-stat"><span>${dashRows.length}</span>Teachers Evaluated</div>
        <div class="smp-stat smp-stat-top"><span>${top.length}</span>🌟 Top Performers</div>
        <div class="smp-stat"><span>${steady.length}</span>Steady</div>
        <div class="smp-stat smp-stat-attn"><span>${attention.length}</span>⚠ Needs Attention</div>
        <div class="smp-stat"><span>${avgScore}</span>Average Score</div>
      </div>

      <table class="smp-table">
        <thead><tr>
          <th>#</th><th>Teacher</th><th>Subjects</th><th>Score</th><th>Academic</th><th>Attendance</th><th>Syllabus</th><th>Pass Rate</th><th>Status</th>
        </tr></thead>
        <tbody>${tableRows || `<tr><td colspan="9" style="text-align:center; color:#888;">No marks recorded yet for this scope.</td></tr>`}</tbody>
      </table>

      <div class="smp-pagebreak"></div>
      <h2 class="smp-section-title">Discussion Points — by Teacher</h2>
      <p class="smp-formula">Overall Score blends student results (${Math.round(w.academic*100)}%), pass rate (${Math.round(w.passRate*100)}%), the teacher's own attendance (${Math.round(w.attendance*100)}%), syllabus completion (${Math.round(w.syllabus*100)}%) and result consistency (${Math.round(w.consistency*100)}%). A component with no data yet is left out and the rest are rescaled, so an unused module never unfairly lowers a score.</p>
      ${groupSection('🌟 Top Performers — open the meeting here', top, 'smp-group-top')}
      ${groupSection('Steady', steady, 'smp-group-steady')}
      ${groupSection('⚠ Needs Attention — discuss support & next steps', attention, 'smp-group-attn')}

      <div class="smp-signoff">
        <div class="smp-sigbox">
          <div class="smp-sigline">${principalSig ? `<img class="smp-sigimg" src="${principalSig}">` : ''}</div>
          <div class="smp-siglabel">Principal's Signature &amp; Date</div>
        </div>
        <div class="smp-sigbox">
          <div class="smp-sigline"></div>
          <div class="smp-siglabel">Meeting Conducted By &amp; Date</div>
        </div>
      </div>
    `;
    const css = `
      .smp-header{ display:flex; align-items:center; gap:14px; margin-bottom:6px; }
      .smp-logo{ width:52px; height:52px; object-fit:contain; }
      .smp-school{ font-size:1.15rem; font-weight:800; }
      .smp-addr{ font-size:0.78rem; color:#555; }
      .smp-title{ font-size:1.3rem; margin:14px 0 4px; }
      .smp-meta{ display:flex; justify-content:space-between; font-size:0.8rem; color:#444; margin-bottom:14px; border-bottom:2px solid #222; padding-bottom:10px; }
      .smp-summary{ display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap; }
      .smp-stat{ flex:1; min-width:100px; border:1px solid #ccc; border-radius:8px; padding:8px 10px; text-align:center; font-size:0.72rem; color:#555; }
      .smp-stat span{ display:block; font-size:1.3rem; font-weight:800; color:#111; }
      .smp-stat-top{ border-color:#188f86; } .smp-stat-top span{ color:#188f86; }
      .smp-stat-attn{ border-color:#d11073; } .smp-stat-attn span{ color:#d11073; }
      .smp-table{ width:100%; border-collapse:collapse; font-size:0.76rem; margin-bottom:10px; }
      .smp-table th, .smp-table td{ border:1px solid #ccc; padding:5px 7px; text-align:left; }
      .smp-table th{ background:#f0f0f0; }
      .smp-sub{ font-size:0.68rem; color:#666; }
      .smp-badge{ display:inline-block; padding:2px 8px; border-radius:10px; font-size:0.68rem; font-weight:700; }
      .smp-badge-top{ background:#e0f4f2; color:#188f86; }
      .smp-badge-attn{ background:#fbe3ef; color:#d11073; }
      .smp-badge-steady{ background:#eee; color:#666; }
      .smp-pagebreak{ page-break-before:always; }
      .smp-section-title{ font-size:1.05rem; margin:16px 0 4px; }
      .smp-formula{ font-size:0.72rem; color:#666; margin-bottom:14px; }
      .smp-group{ margin-bottom:14px; }
      .smp-group h3{ font-size:0.92rem; margin:0 0 8px; padding-bottom:4px; border-bottom:2px solid #222; }
      .smp-count{ font-weight:400; color:#666; font-size:0.78rem; }
      .smp-teacher{ break-inside:avoid; border:1px solid #ddd; border-radius:8px; padding:8px 12px; margin-bottom:8px; }
      .smp-group-top .smp-teacher{ border-left:4px solid #188f86; }
      .smp-group-attn .smp-teacher{ border-left:4px solid #d11073; }
      .smp-group-steady .smp-teacher{ border-left:4px solid #bbb; }
      .smp-teacher-head{ font-size:0.85rem; margin-bottom:4px; }
      .smp-score{ float:right; font-size:0.72rem; color:#555; }
      .smp-talk{ margin:4px 0 8px; font-size:0.8rem; }
      .smp-notesline{ border-bottom:1px dashed #bbb; height:16px; }
      .smp-signoff{ display:flex; gap:40px; margin-top:30px; page-break-inside:avoid; }
      .smp-sigbox{ flex:1; }
      .smp-sigline{ border-bottom:1px solid #222; height:40px; display:flex; align-items:flex-end; }
      .smp-sigimg{ max-height:38px; }
      .smp-siglabel{ font-size:0.72rem; color:#555; margin-top:4px; }
    `;
    return { html, css };
  }

  function printStaffMeetingPack(){
    const examSel = document.getElementById('libTeacherPerfExamSelect');
    const examId = examSel ? examSel.value : '';
    const exam = examId ? examDefs.find(e => e.id === examId) : null;
    const filters = getStaffReportScopeFilters();
    const dashRows = teacherPerformanceDashboardRows(examId, filters);
    if(dashRows.length === 0){ showToast('No marks recorded yet for this scope.'); return; }
    const built = buildStaffMeetingPackHtml(examId, filters);
    const safe = str => (str||'').replace(/[^\w-]+/g,'_').replace(/^_+|_+$/g,'');
    const fileTitle = `StaffMeetingPack_${safe(exam ? exam.name : 'AllExams')}_${safe(new Date().toISOString().slice(0,10))}`;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>${fileTitle}</title>
      <style>
        *{ box-sizing:border-box; }
        @page{ size:A4; margin:14mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; margin:0; }
        ${built.css}
      </style></head>
      <body onload="window.print()">
        ${built.html}
      </body></html>
    `);
    w.document.close();
  }

  /* --- Staff → Reports tab: Employee Reports + Teacher Performance Reports, relocated here from
     the standalone Reports module so all staff-related information lives in one place. --- */
  function getStaffReportScopeFilters(){
    return {
      className: document.getElementById('stfRepClassFilter') ? document.getElementById('stfRepClassFilter').value : '',
      section: document.getElementById('stfRepSectionFilter') ? document.getElementById('stfRepSectionFilter').value : '',
      department: document.getElementById('stfRepDeptFilter') ? document.getElementById('stfRepDeptFilter').value : '',
      feeType: '', studentId: '',
    };
  }
  function onStaffReportScopeChange(){ renderStaffReportsTab(document.getElementById('stfReportsBody')); }
  function renderStaffReportsTab(body){
    if(!body) return;
    if(!getStaffReportsAccess(currentUser.role)){
      body.innerHTML = `<div class="empty-state"><b>You do not have access to Staff Reports.</b></div>`;
      return;
    }
    const ov = findRoleOverride(currentUser.role);
    let showEmployee, showTeacherPerf;
    if(ov && ov.permissions['staff_reports'] !== undefined){
      showEmployee = showTeacherPerf = !!ov.permissions['staff_reports'].view;
    }else{
      const fullAccess = getRolePermission(currentUser.role, 'staff', 'view');
      showEmployee = fullAccess || getReportCategoryAccess(currentUser.role, 'reports_employee');
      showTeacherPerf = fullAccess || getReportCategoryAccess(currentUser.role, 'reports_teacher_performance');
    }
    const empStyle = REPORT_CATEGORY_STYLE.Employee;
    const tpStyle = REPORT_CATEGORY_STYLE.TeacherPerformance;
    const filters = getStaffReportScopeFilters();
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:14px; max-width:680px;">Ready-made staff reports — generate as Excel or PDF anytime.</p>
      <div class="profile-card" style="margin-bottom:24px;">
        <h4>Scope</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">Narrow by department (Employee reports), or by class/section/department (Teacher Performance).</p>
        <div class="ms-toolbar-left" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
          <select id="stfRepDeptFilter" onchange="onStaffReportScopeChange()"><option value="">All Departments</option>${staffDepartments.map(d => `<option ${filters.department===d?'selected':''}>${d}</option>`).join('')}</select>
          <select id="stfRepClassFilter" onchange="onStaffReportScopeChange()"><option value="">All Classes</option>${CLASS_LEVELS.map(c => `<option ${filters.className===c?'selected':''}>${c}</option>`).join('')}</select>
          <select id="stfRepSectionFilter" onchange="onStaffReportScopeChange()"><option value="">All Sections</option>${SECTIONS.map(s => `<option value="${s}" ${filters.section===s?'selected':''}>Section ${s}</option>`).join('')}</select>
        </div>
      </div>
      ${showEmployee ? `
      <div style="background:${empStyle.bg}; border-left:5px solid ${empStyle.color}; border-radius:10px; padding:10px 16px; margin-bottom:14px;">
        <h3 style="margin:0; color:${empStyle.color}; font-family:'Baloo 2',cursive;">Employee Reports</h3>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(270px,1fr)); gap:16px; margin-bottom:28px;">
        ${REPORT_LIBRARY.filter(r => r.category==='Employee').map(r => `
          <div class="profile-card" style="border-top:4px solid ${empStyle.color};">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
              <div style="width:36px; height:36px; border-radius:50%; background:${empStyle.bg}; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">${r.icon}</div>
              <h4 style="margin:0;">${r.name}</h4>
            </div>
            <span class="pill" style="font-size:0.6rem; background:${empStyle.bg}; color:${empStyle.color};">Staff aware</span>
            <p style="font-size:0.8rem; color:var(--ink-soft); margin:8px 0 14px;">${r.desc}</p>
            <div style="display:flex; gap:10px;">
              <button class="btn btn-ghost btn-sm" onclick="generateLibraryReport('${r.id}','excel', getStaffReportScopeFilters())">📥 Excel</button>
              <button class="btn btn-ghost btn-sm" onclick="generateLibraryReport('${r.id}','pdf', getStaffReportScopeFilters())">📄 PDF</button>
            </div>
          </div>
        `).join('')}
      </div>
      ` : ``}
      ${showTeacherPerf ? `
      <div style="background:${tpStyle.bg}; border-left:5px solid ${tpStyle.color}; border-radius:10px; padding:10px 16px; margin-bottom:14px;">
        <h3 style="margin:0; color:${tpStyle.color}; font-family:'Baloo 2',cursive;">Teacher Performance Reports</h3>
      </div>
      ${renderTeacherPerfDashboard(filters)}
      <div class="profile-card" style="max-width:520px; margin-bottom:20px; border-top:4px solid ${tpStyle.color};">
        <h4>🧑‍🏫 Evaluate teachers by subject &amp; results</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:8px 0 12px;">Matches each teacher's actual subject-section assignments (from Manage Subjects) against the marks their students scored — average %, pass rate, highest/lowest, and consistency. Pick one exam, or leave "All Exams" for a cumulative view. The scope above still applies. Visibility of this section is controlled per role in Roles &amp; Permissions → Administration → Staff — Reports.</p>
        <select id="libTeacherPerfExamSelect" style="width:100%; margin-bottom:12px;">
          <option value="">All Exams (Overall / Cumulative)</option>
          ${examDefs.map(ex => `<option value="${ex.id}">${ex.name}</option>`).join('')}
        </select>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.85rem;">Teacher Summary — Ranked</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateTeacherPerfReport('summary','excel', getStaffReportScopeFilters())">Excel</button><button class="btn-edit-text" onclick="generateTeacherPerfReport('summary','pdf', getStaffReportScopeFilters())">PDF</button></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.85rem;">Detailed — By Subject &amp; Section</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateTeacherPerfReport('detail','excel', getStaffReportScopeFilters())">Excel</button><button class="btn-edit-text" onclick="generateTeacherPerfReport('detail','pdf', getStaffReportScopeFilters())">PDF</button></div>
          </div>
        </div>
      </div>
      <div class="profile-card" style="max-width:520px; margin-bottom:20px; border-top:4px solid ${tpStyle.color};">
        <h4>🗂️ Staff Meeting Pack</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:8px 0 12px;">A print-ready handout for the staff review meeting itself — not just a data table. Groups teachers 🌟 Top Performers first, then Steady, then ⚠ Needs Attention, with each one's talking point already written out and ruled space to note down what was discussed. Uses the exam and scope selected above.</p>
        <button class="btn btn-primary btn-sm" style="width:100%;" onclick="printStaffMeetingPack()">🗂️ Staff Meeting Pack — Print / Save PDF</button>
      </div>
      ` : ``}
      ${(!showEmployee && !showTeacherPerf) ? `<div class="empty-state"><b>No staff reports available for your role.</b></div>` : ``}
    `;
  }

  /* --- Fee Paid, Payable & Due Report: grouped by class, with subtotals + grand total --- */
  function feeDuePayableGroupedData(filters){
    const scoped = applyStudentScope(students.filter(isActive), filters);
    const byClass = {};
    CLASS_LEVELS.forEach(c => { byClass[c] = []; });
    scoped.forEach(s => {
      const fin = computeStudentFinance(s);
      const totalFee = fin.totals.expected;
      const concession = fin.totals.discount;
      const feePayable = totalFee - concession;
      const feePaid = fin.totals.collected;
      const feeDue = fin.totals.receivable;
      if(!byClass[s.className]) byClass[s.className] = [];
      byClass[s.className].push({
        admissionNo: s.admissionNo, rollNo: s.rollNo||'', name: s.firstName+' '+s.lastName,
        contact: s.fatherPhone || s.motherPhone || s.guardianPhone || '',
        totalFee, concession, feePayable, feePaid, feeDue,
      });
    });
    const groups = CLASS_LEVELS.filter(c => byClass[c] && byClass[c].length > 0).map(c => {
      const list = byClass[c];
      const subtotal = list.reduce((acc,r) => ({
        totalFee: acc.totalFee+r.totalFee, concession: acc.concession+r.concession,
        feePayable: acc.feePayable+r.feePayable, feePaid: acc.feePaid+r.feePaid, feeDue: acc.feeDue+r.feeDue,
      }), { totalFee:0, concession:0, feePayable:0, feePaid:0, feeDue:0 });
      return { className: c, students: list, subtotal };
    });
    const grand = groups.reduce((acc,g) => ({
      totalFee: acc.totalFee+g.subtotal.totalFee, concession: acc.concession+g.subtotal.concession,
      feePayable: acc.feePayable+g.subtotal.feePayable, feePaid: acc.feePaid+g.subtotal.feePaid, feeDue: acc.feeDue+g.subtotal.feeDue,
    }), { totalFee:0, concession:0, feePayable:0, feePaid:0, feeDue:0 });
    return { groups, grand };
  }
  function generateFeeDuePayableReport(id, filters, format){
    const { groups, grand } = feeDuePayableGroupedData(filters);
    if(groups.length === 0){ showToast('Nothing to export.'); return; }
    if(format === 'excel'){
      const rows = [];
      let sno = 1;
      groups.forEach(g => {
        rows.push({ 'S.No':'', 'Student ID':'', 'Roll No':'', 'Name':'Class: '+g.className, 'Contact No':'', 'Total Fee':'', 'Concession':'', 'Fee Payable':'', 'Fee Paid':'', 'Fee Due':'' });
        g.students.forEach(st => {
          rows.push({ 'S.No':sno++, 'Student ID':st.admissionNo, 'Roll No':st.rollNo, 'Name':st.name, 'Contact No':st.contact, 'Total Fee':st.totalFee, 'Concession':st.concession, 'Fee Payable':st.feePayable, 'Fee Paid':st.feePaid, 'Fee Due':st.feeDue });
        });
        rows.push({ 'S.No':'', 'Student ID':'', 'Roll No':'', 'Name':'Total', 'Contact No':'', 'Total Fee':g.subtotal.totalFee, 'Concession':g.subtotal.concession, 'Fee Payable':g.subtotal.feePayable, 'Fee Paid':g.subtotal.feePaid, 'Fee Due':g.subtotal.feeDue });
      });
      rows.push({ 'S.No':'', 'Student ID':'', 'Roll No':'', 'Name':'Grand Total', 'Contact No':'', 'Total Fee':grand.totalFee, 'Concession':grand.concession, 'Fee Payable':grand.feePayable, 'Fee Paid':grand.feePaid, 'Fee Due':grand.feeDue });
      exportRowsToExcel('fee_paid_payable_due_report.xlsx', 'Fee Due Report', rows);
      return;
    }
    const logoSrc = document.querySelector('.sb-brand img').src;
    let sno = 1;
    const groupsHtml = groups.map(g => `
      <div class="fd-class-title">Class : ${g.className}</div>
      <table>
        <thead><tr><th>S.No</th><th>Student ID</th><th>Roll No.</th><th>Name</th><th>Contact No</th><th>Total Fee</th><th>Concession</th><th>Fee Payable</th><th>Fee Paid</th><th>Fee Due</th></tr></thead>
        <tbody>
        ${g.students.map(st => `<tr><td>${sno++}</td><td>${st.admissionNo}</td><td>${st.rollNo}</td><td>${st.name}</td><td>${st.contact}</td><td>${st.totalFee}</td><td>${st.concession}</td><td>${st.feePayable}</td><td>${st.feePaid}</td><td>${st.feeDue}</td></tr>`).join('')}
        <tr class="fd-subtotal"><td colspan="5"><b>Total:</b></td><td><b>${g.subtotal.totalFee}</b></td><td><b>${g.subtotal.concession}</b></td><td><b>${g.subtotal.feePayable}</b></td><td><b>${g.subtotal.feePaid}</b></td><td><b>${g.subtotal.feeDue}</b></td></tr>
        </tbody>
      </table>
    `).join('');
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Fee Paid, Payable and Due Report</title>
      <style>
        @page{ size:A4 landscape; margin:12mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; font-size:11px; }
        .fd-head{ display:flex; align-items:center; gap:10px; justify-content:center; margin-bottom:4px; }
        .fd-head img{ width:34px; height:34px; border-radius:50%; }
        .fd-school{ font-weight:700; font-size:15px; text-align:center; }
        .fd-title{ text-align:center; font-weight:700; font-size:12px; margin:6px 0 16px; }
        .fd-class-title{ font-weight:700; font-size:12px; background:#e9e4f5; padding:5px 8px; margin:14px 0 4px; }
        table{ width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:6px; }
        th,td{ border:1px solid #999; padding:4px 6px; text-align:left; }
        th{ background:#211A4E; color:#fff; }
        .fd-subtotal td{ background:#f3f1fa; }
        .fd-grand{ font-weight:700; font-size:12px; background:#211A4E; color:#fff; padding:6px 8px; margin-top:14px; display:flex; justify-content:space-between; }
      </style></head>
      <body onload="window.print()">
        <div class="fd-head"><img src="${logoSrc}"></div>
        <div class="fd-school">${schoolInfo.name}</div>
        <div class="fd-title">Fee Paid, Payable and Due Report — Student-wise</div>
        ${groupsHtml}
        <div class="fd-grand"><span>Grand Total</span><span>Total Fee: ${grand.totalFee} &nbsp; Concession: ${grand.concession} &nbsp; Fee Payable: ${grand.feePayable} &nbsp; Fee Paid: ${grand.feePaid} &nbsp; Fee Due: ${grand.feeDue}</span></div>
      </body></html>
    `);
    w.document.close();
  }

  /* --- Custom Report Builder --- */
  const REPORT_SOURCES = {
    students: {
      label:'Students',
      columns:[
        {key:'admissionNo',label:'Admission No'},{key:'firstName',label:'First Name'},{key:'lastName',label:'Last Name'},
        {key:'className',label:'Class'},{key:'section',label:'Section'},{key:'gender',label:'Gender'},{key:'dob',label:'Date of Birth'},
        {key:'fatherName',label:'Father Name'},{key:'fatherPhone',label:'Father Phone'},{key:'email',label:'Email'},{key:'status',label:'Status'},{key:'admDate',label:'Date of Joining'},
      ],
      hasClassSection:true,
      getRows(filters){
        let list = students.slice();
        if(filters.className) list = list.filter(s => s.className===filters.className);
        if(filters.section) list = list.filter(s => s.section===filters.section);
        if(filters.status && filters.status!=='all') list = list.filter(s => filters.status==='Active' ? isActive(s) : !isActive(s));
        return list;
      }
    },
    payments: {
      label:'Fee Payments',
      columns:[
        {key:'date',label:'Date'},{key:'studentName',label:'Student'},{key:'category',label:'Category', compute:p=>feeLabelFor(p)},
        {key:'mode',label:'Mode'},{key:'amount',label:'Amount'},{key:'discount',label:'Discount'},{key:'receiptNo',label:'Receipt No'},
      ],
      hasDateRange:true,
      getRows(filters){
        let list = payments.slice();
        if(filters.fromDate) list = list.filter(p => (p.date||'')>=filters.fromDate);
        if(filters.toDate) list = list.filter(p => (p.date||'')<=filters.toDate);
        return list;
      }
    },
    attendance: {
      label:'Attendance (per-student summary)',
      columns:[
        {key:'name',label:'Student', compute:s=>s.firstName+' '+s.lastName},{key:'className',label:'Class'},{key:'section',label:'Section'},
        {key:'present',label:'Present', compute:s=>computeAttendanceStats(s.id).present},
        {key:'absent',label:'Absent', compute:s=>computeAttendanceStats(s.id).absent},
        {key:'late',label:'Late', compute:s=>computeAttendanceStats(s.id).late},
        {key:'pct',label:'%', compute:s=>computeAttendanceStats(s.id).pct},
      ],
      hasClassSection:true,
      getRows(filters){
        let list = students.filter(isActive);
        if(filters.className) list = list.filter(s => s.className===filters.className);
        if(filters.section) list = list.filter(s => s.section===filters.section);
        return list;
      }
    },
    staff: {
      label:'Staff',
      columns:[
        {key:'staffId',label:'Staff ID'},{key:'firstName',label:'First Name'},{key:'lastName',label:'Last Name'},
        {key:'department',label:'Department'},{key:'designation',label:'Designation'},{key:'phone',label:'Phone'},{key:'email',label:'Email'},{key:'status',label:'Status'},
      ],
      hasDept:true,
      getRows(filters){
        let list = staffList.slice();
        if(filters.department) list = list.filter(s => s.department===filters.department);
        if(filters.status && filters.status!=='all') list = list.filter(s => filters.status==='Active' ? staffIsActive(s) : !staffIsActive(s));
        return list;
      }
    },
  };
  let customReportSource = 'students';
  let customReportSelectedCols = null;
  function renderCustomReportBuilder(body){
    const src = REPORT_SOURCES[customReportSource];
    if(!customReportSelectedCols) customReportSelectedCols = src.columns.map(c => c.key);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">Pick a data source, choose exactly which columns you want, apply any filters, and export.</p>
      <div class="form-grid" style="max-width:400px; margin-bottom:16px;">
        <div class="f-field full">
          <label>Data Source</label>
          <select id="crSource" onchange="onCustomReportSourceChange(this.value)">
            ${Object.keys(REPORT_SOURCES).map(k => `<option value="${k}" ${k===customReportSource?'selected':''}>${REPORT_SOURCES[k].label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="crFilters" class="ms-toolbar-left" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px;"></div>
      <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin-bottom:8px; display:block;">Columns to include</label>
      <div class="disc-checklist" style="max-width:640px; margin-bottom:20px;">
        ${src.columns.map(c => `<label class="disc-check-item"><input type="checkbox" class="cr-col-check" value="${c.key}" ${customReportSelectedCols.includes(c.key)?'checked':''}> ${c.label}</label>`).join('')}
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" onclick="generateCustomReport('excel')">📥 Generate Excel</button>
        <button class="btn btn-primary" onclick="generateCustomReport('pdf')">📄 Generate PDF</button>
      </div>
    `;
    renderCustomReportFilters();
  }
  function onCustomReportSourceChange(val){
    customReportSource = val;
    customReportSelectedCols = null;
    renderReportsBody();
  }
  function renderCustomReportFilters(){
    const box = document.getElementById('crFilters');
    const src = REPORT_SOURCES[customReportSource];
    let html = '';
    if(src.hasClassSection){
      html += `<select id="crClass"><option value="">All Classes</option>${CLASS_LEVELS.map(c => `<option>${c}</option>`).join('')}</select>`;
      html += `<select id="crSection"><option value="">All Sections</option>${SECTIONS.map(s => `<option value="${s}">Section ${s}</option>`).join('')}</select>`;
    }
    if(src.hasDept){
      html += `<select id="crDept"><option value="">All Departments</option>${staffDepartments.map(d => `<option>${d}</option>`).join('')}</select>`;
    }
    if(src.hasClassSection || src.hasDept){
      html += `<select id="crStatus"><option value="Active" selected>Active</option><option value="Inactive">Inactive</option><option value="all">All</option></select>`;
    }
    if(src.hasDateRange){
      html += `<label style="font-size:0.82rem; display:flex; align-items:center; gap:6px;">From <input type="date" id="crFromDate"></label>`;
      html += `<label style="font-size:0.82rem; display:flex; align-items:center; gap:6px;">To <input type="date" id="crToDate"></label>`;
    }
    box.innerHTML = html || `<span style="font-size:0.82rem; color:var(--ink-soft);">No filters for this source — every record will be included.</span>`;
  }
  function getCustomReportFilters(){
    const src = REPORT_SOURCES[customReportSource];
    const f = {};
    if(src.hasClassSection){ f.className = document.getElementById('crClass').value; f.section = document.getElementById('crSection').value; }
    if(src.hasDept){ f.department = document.getElementById('crDept').value; }
    if(src.hasClassSection || src.hasDept){ f.status = document.getElementById('crStatus').value; }
    if(src.hasDateRange){ f.fromDate = document.getElementById('crFromDate').value; f.toDate = document.getElementById('crToDate').value; }
    return f;
  }
  async function generateCustomReport(format){
    // The "Fee Payments" and "Attendance" custom-report sources read the
    // lazily-loaded payments/attendanceRecords globals — make sure they're
    // in before pulling rows, regardless of which source is selected.
    await Promise.all([
      ensureDataLoaded('payments', loadPaymentsData),
      ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData),
    ]);
    const src = REPORT_SOURCES[customReportSource];
    const selectedCols = Array.from(document.querySelectorAll('.cr-col-check:checked')).map(c => c.value);
    if(selectedCols.length === 0){ showToast('Select at least one column.'); return; }
    const filters = getCustomReportFilters();
    const rawItems = src.getRows(filters);
    const cols = src.columns.filter(c => selectedCols.includes(c.key));
    const rows = rawItems.map(item => {
      const row = {};
      cols.forEach(c => { row[c.label] = c.compute ? c.compute(item) : (item[c.key] !== undefined ? item[c.key] : ''); });
      return row;
    });
    if(rows.length === 0){ showToast('No data matches these filters.'); return; }
    if(format === 'excel') exportRowsToExcel('custom_report_'+customReportSource+'.xlsx', src.label, rows);
    else exportRowsToPDF('Custom Report — '+src.label, '', rows);
  }

  /* ===== MANAGE SUBJECTS MODULE (master curriculum catalog) ===== */
  