  /* ===== PROGRESS REPORT CENTER =======================================================
     Replaces the old "pick one exam, search one student" Progress Reports tab.

     1. MARKS SOURCE   - a single exam OR a Report Period (a named group of exams, built under
                         the "Report Periods" tab). A period shows every exam side by side plus a
                         total. The report itself states which marks were counted.
     2. TITLE          - automatic ("PROGRESS REPORT - Half Yearly Exam - 2026-27") or typed by
                         the user at print time.
     3. PARENT SIGN    - row / acknowledgement box / tear-off slip / none, chosen on screen with
                         a live preview of the real printed page.

     Subject-wise grade, grade points and pass/fail come from the Grading schemes (10c). The old
     report-card functions were removed from module 10; reportCardPageHtml/reportCardPrintCss are
     redefined here because the parent portal prints through them. ====================== */
  let prcMode = 'exam', prcSourceId = '', prcTemplateId = '', prcTitle = '';
  let prcClass = '', prcSection = '', prcPerPage = 1, prcStudentId = '', prcSearchText = '', prcOnlyComplete = false;
  let prcIdxMap = null, prcIdxRef = null, prcIdxLen = -1, prcDirty = true;
  let prcMemo = { score:{}, rank:{}, top:{} };
  let prcFallbackTpl = null, prcSearchTimer = null, prcTitleTimer = null;

  const PRC_SIGN_OPTIONS = [
    { key:'row',  name:'Signature row',        desc:'Class Teacher, Parent and Principal side by side at the bottom.' },
    { key:'box',  name:'Acknowledgement box',  desc:'A boxed “seen by parent” statement with signature and date.' },
    { key:'slip', name:'Tear-off slip',        desc:'Parent signs a slip at the bottom and returns it to school.' },
    { key:'none', name:'No parent signature',  desc:'Teacher and Principal only.' },
  ];
  const PRC_DEFAULT_ACK = 'I have seen my ward’s progress report and noted the remarks.';

  /* ---------- data helpers ---------- */
  function prcInvalidate(){ prcDirty = true; prcMemo = { score:{}, rank:{}, top:{} }; }
  function prcIndex(){
    if(prcDirty || !prcIdxMap || prcIdxRef !== examResults || prcIdxLen !== examResults.length){
      prcIdxMap = new Map();
      examResults.forEach(r => prcIdxMap.set(r.examId+'|'+r.studentId+'|'+r.subject, r));
      prcIdxRef = examResults; prcIdxLen = examResults.length; prcDirty = false;
      prcMemo = { score:{}, rank:{}, top:{} };
    }
    return prcIdxMap;
  }
  function prcMakeSrc(key, name, exams, mode){
    const starts = exams.map(e => e.startDate).filter(Boolean).sort();
    const ends = exams.map(e => e.endDate || e.startDate).filter(Boolean).sort();
    return { key, mode, name, exams, coExam: exams[exams.length-1],
      pseudo: { id: exams[exams.length-1].id, name, startDate: starts[0]||'', endDate: ends.length ? ends[ends.length-1] : '' } };
  }
  function prcResolveSource(mode, id){
    if(mode === 'period'){
      const g = examGroups.find(x => x.id === id);
      if(!g) return null;
      const exams = (g.examIds||[]).map(i => examDefs.find(e => e.id === i)).filter(Boolean);
      return exams.length ? prcMakeSrc('p:'+g.id, g.name, exams, 'period') : null;
    }
    const e = examDefs.find(x => x.id === id);
    return e ? prcMakeSrc('e:'+e.id, e.name, [e], 'exam') : null;
  }
  function prcCurrentSrc(){ return prcResolveSource(prcMode, prcSourceId); }
  function prcTemplate(){
    const t = reportTemplates.find(x => x.id === prcTemplateId) || reportTemplates.find(x => x.isDefault) || reportTemplates[0];
    if(t) return t;
    if(!prcFallbackTpl) prcFallbackTpl = { id:'', name:'Default', layout:'classic', signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent', showElective:true, showNotCounted:true, showAttendance:true, showClassTopper:true, showRank:true };
    return prcFallbackTpl;
  }
  // kept under its old name — module 10's co-scholastic save button calls it
  function currentReportTemplate(){ return prcTemplate(); }
  function prcAutoTitle(src, t){
    const base = (t && t.titleOverride && t.titleOverride.trim()) ? t.titleOverride.trim() : 'PROGRESS REPORT';
    const ay = (typeof currentAcademicYearValue !== 'undefined' && currentAcademicYearValue) ? ' · ' + currentAcademicYearValue : '';
    return `${base} — ${src.name}${ay}`;
  }
  function prcFinalTitle(src, t, custom){
    return (custom && custom.trim()) ? custom.trim() : prcAutoTitle(src, t);
  }
  function prcR1(x){ return Math.round(x*10)/10; }

  function prcScore(s, src){
    prcIndex();
    const mk = src.key + '|' + s.id;
    if(prcMemo.score[mk]) return prcMemo.score[mk];
    const idx = prcIdxMap;
    const names = [], meta = {};
    src.exams.forEach(ex => getExamSubjects(ex, s.className, s.section).forEach(sub => {
      if(!meta[sub.name]){ meta[sub.name] = { name:sub.name, code:sub.code||'', date:sub.date||'', countable:sub.countable!==false, elective:!!sub.elective }; names.push(sub.name); }
    }));
    let missing = 0;
    let rows = names.map(n => {
      const m = meta[n];
      const cells = src.exams.map(ex => {
        const sub = getExamSubjects(ex, s.className, s.section).find(x => x.name === n);
        if(!sub) return null;
        const r = idx.get(ex.id+'|'+s.id+'|'+n);
        const absent = !!(r && r.absent);
        const has = !!(r && (absent || (r.marks !== null && r.marks !== undefined && r.marks !== '')));
        if(!has && m.countable) missing++;
        return { max:Number(sub.maxMarks)||0, marks:(r && !absent && has) ? Number(r.marks) : null, absent, has };
      });
      const real = cells.filter(Boolean);
      const obtained = real.reduce((a,c) => a + (c.marks||0), 0);
      const max = real.reduce((a,c) => a + c.max, 0);
      const anyHas = real.some(c => c.has);
      const allAbsent = real.length > 0 && real.every(c => c.absent);
      const pct = max > 0 ? prcR1(obtained/max*100) : null;
      const info = (anyHas && pct !== null && !allAbsent) ? gradeInfoForPct(pct, s.className) : null;
      return { ...m, cells, obtained, max, pct, anyHas, allAbsent, info, grade: allAbsent ? 'AB' : (info ? info.grade : '—') };
    });
    if(src.mode === 'exam') rows = rows.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const counted = rows.filter(r => r.countable);
    const totalMax = counted.reduce((a,r) => a + r.max, 0);
    const totalObtained = counted.reduce((a,r) => a + r.obtained, 0);
    const pct = totalMax > 0 ? prcR1(totalObtained/totalMax*100) : 0;
    const anyHas = counted.some(r => r.anyHas);
    const info = totalMax > 0 ? gradeInfoForPct(pct, s.className) : null;
    const gpRows = counted.filter(r => r.info);
    const gpa = gpRows.length ? gpRows.reduce((a,r) => a + r.info.gp, 0) / gpRows.length : null;
    const failRows = counted.filter(r => r.allAbsent || (r.info && r.info.fail));
    const result = !anyHas || totalMax === 0 ? '—' : ((failRows.length || (info && info.fail)) ? 'FAIL' : 'PASS');
    return (prcMemo.score[mk] = { rows, totalObtained, totalMax, pct, info, gpa, failCount:failRows.length, missing, anyHas, result, scheme:gradingSchemeForClass(s.className) });
  }
  function prcCohort(cls, sec){
    return students.filter(x => isActive(x) && x.className === cls && x.section === sec);
  }
  function prcRankFor(src, s){
    const k = src.key+'|'+s.className+'|'+s.section;
    if(!prcMemo.rank[k]){
      const scored = [];
      prcCohort(s.className, s.section).forEach(x => { const sc = prcScore(x, src); if(sc.totalMax > 0 && sc.anyHas) scored.push({ id:x.id, pct:sc.pct }); });
      scored.sort((a,b) => b.pct - a.pct);
      let rank = 1;
      scored.forEach((row,i) => { if(i > 0 && row.pct < scored[i-1].pct) rank = i+1; row.rank = rank; });
      const map = {}; scored.forEach(r => { map[r.id] = { rank:r.rank, outOf:scored.length }; });
      prcMemo.rank[k] = map;
    }
    return prcMemo.rank[k][s.id] || null;
  }
  function prcTopperMap(src, s){
    const k = src.key+'|'+s.className+'|'+s.section;
    if(!prcMemo.top[k]){
      const top = {};
      prcCohort(s.className, s.section).forEach(x => prcScore(x, src).rows.forEach(r => {
        if(r.anyHas && !r.allAbsent && (top[r.name] === undefined || r.obtained > top[r.name])) top[r.name] = r.obtained;
      }));
      prcMemo.top[k] = top;
    }
    return prcMemo.top[k];
  }

  /* ---------- the printed report ---------- */
  function prcPrintCss(){
    return `
      @page{ size:A4; margin:9mm; }
      *{ box-sizing:border-box; }
      body{ font-family:Arial,Helvetica,sans-serif; color:#111; margin:0; }
      .rc-card{ padding:7mm 9mm; border:1.2px solid #333; border-radius:2mm; page-break-inside:avoid; background:#fff; }
      .rc-card.rc-two{ min-height:136mm; }
      .rc-card.rc-two + .rc-card.rc-two{ margin-top:6mm; }
      .rc-card.rc-one{ display:flex; flex-direction:column; }
      .rc-card.rc-full{ min-height:274mm; }
      .rc-grow{ flex:1; min-height:8mm; }
      .rc-head{ display:flex; align-items:center; gap:8px; justify-content:center; margin-bottom:3px; }
      .rc-head img{ width:34px; height:34px; border-radius:50%; }
      .rc-school{ font-weight:700; font-size:15px; text-align:center; }
      .rc-addr{ font-size:9px; text-align:center; color:#555; margin-bottom:6px; }
      .rc-title{ text-align:center; font-weight:700; font-size:12px; letter-spacing:.3px; text-transform:uppercase; border-top:1.5px solid #211A4E; border-bottom:1.5px solid #211A4E; padding:4px 0; margin-bottom:3px; color:#211A4E; }
      .rc-basis{ text-align:center; font-size:8.8px; color:#555; margin-bottom:7px; }
      .rc-info{ display:grid; grid-template-columns:1fr 1fr; gap:3px 10px; font-size:9.8px; margin-bottom:8px; }
      .rc-card table{ width:100%; border-collapse:collapse; font-size:9.8px; margin-bottom:8px; }
      .rc-card th,.rc-card td{ border:1px solid #999; padding:3.5px 6px; text-align:left; }
      .rc-card th{ background:#211A4E; color:#fff; font-weight:600; }
      .rc-card td.c,.rc-card th.c{ text-align:center; }
      .rc-card tbody tr:nth-child(even) td{ background:#f5f5fa; }
      .rc-card td.fail{ color:#b00020; font-weight:700; }
      .rc-card tr.rc-total td{ font-weight:700; border-top:2px solid #211A4E; background:#ecebf5 !important; }
      .rc-card th small{ display:block; font-weight:400; opacity:.85; font-size:8px; }
      .rc-sum{ display:flex; gap:6px; margin-bottom:8px; }
      .rc-sumbox{ flex:1; border:1px solid #999; padding:4px 6px; text-align:center; font-size:8.6px; color:#555; }
      .rc-sumbox b{ display:block; font-size:13px; color:#111; margin-bottom:1px; }
      .rc-sumbox.bad b{ color:#b00020; }
      .rc-foot{ font-size:9px; color:#555; margin:0 0 6px; }
      .rc-remarks{ font-size:9.8px; margin:6px 0 10px; }
      .ln{ display:inline-block; border-bottom:1px solid #333; min-width:46mm; height:11px; vertical-align:bottom; }
      .ln.wide{ min-width:118mm; } .ln.short{ min-width:26mm; }
      .rc-sign{ display:flex; justify-content:space-between; font-size:9.8px; margin-top:14px; }
      .rc-sg2{ min-width:48mm; text-align:center; }
      .rc-sg2 .imgbox{ height:24px; border-bottom:1px solid #333; display:flex; justify-content:center; align-items:flex-end; margin-bottom:3px; }
      .rc-sg2 img{ height:24px; }
      .rc-sign3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10mm; font-size:9.8px; margin-top:12px; text-align:center; }
      .rc-sg .rc-sgline{ height:22px; border-bottom:1px solid #333; margin-bottom:3px; display:flex; align-items:flex-end; justify-content:center; }
      .rc-sg .rc-sgline img{ height:22px; }
      .rc-sg small{ display:block; color:#555; margin-top:4px; text-align:left; font-size:8.8px; }
      .rc-ack{ border:1.2px solid #211A4E; border-radius:2mm; padding:3mm 4mm; font-size:9.8px; margin-top:10px; }
      .rc-ack b{ display:block; color:#211A4E; margin-bottom:2px; }
      .rc-ack p{ margin:0 0 6px; color:#333; }
      .rc-ack-row{ margin-bottom:8px; }
      .rc-ack-sig{ display:flex; gap:8mm; justify-content:space-between; align-items:flex-end; }
      .rc-cut{ text-align:center; font-size:8.6px; color:#666; margin:12px 0 6px; border-top:1.5px dashed #777; padding-top:2px; letter-spacing:1px; }
      .rc-slip{ border:1px dashed #555; padding:3mm 4mm; font-size:9.6px; }
      .rc-slip b{ color:#211A4E; }
      .rc-cosch-title{ font-size:9px; font-weight:700; color:#211A4E; margin:6px 0 3px; border-top:1px dashed #999; padding-top:5px; }
      .rc-cosch-grid{ display:grid; grid-template-columns:1fr 1fr; gap:1px 10px; font-size:9px; margin-bottom:5px; }
      .rc-cosch-grid div{ display:flex; justify-content:space-between; border-bottom:1px dotted #ccc; padding:1px 0; }
    `;
  }
  function reportCardPrintCss(){ return prcPrintCss(); }

  function prcSignHtml(s, t, title){
    const mode = t.parentSign || 'box';
    const sig1 = resolveReportSignature1(t, s), sig2 = resolveReportSignature2(t);
    const l1 = escapeHtml(t.signatureLabel1 || 'Class Teacher'), l2 = escapeHtml(t.signatureLabel2 || 'Principal / Correspondent');
    const parentLbl = escapeHtml(t.parentLabel || 'Parent / Guardian');
    const ack = escapeHtml(t.parentAckText || PRC_DEFAULT_ACK);
    const teacherRow = `<div class="rc-sign">
        <div class="rc-sg2"><div class="imgbox">${sig1 ? `<img src="${sig1}">` : ''}</div>${l1}</div>
        <div class="rc-sg2"><div class="imgbox">${sig2 ? `<img src="${sig2}">` : ''}</div>${l2}</div></div>`;
    const remarks = t.teacherRemarks ? `<div class="rc-remarks">Class teacher’s remarks: <span class="ln wide"></span></div>` : '';
    if(mode === 'row'){
      return remarks + `<div class="rc-sign3">
        <div class="rc-sg"><div class="rc-sgline">${sig1 ? `<img src="${sig1}">` : ''}</div>${l1}</div>
        <div class="rc-sg"><div class="rc-sgline"></div>${parentLbl}<small>Date: <span class="ln short"></span></small></div>
        <div class="rc-sg"><div class="rc-sgline">${sig2 ? `<img src="${sig2}">` : ''}</div>${l2}</div></div>`;
    }
    if(mode === 'box'){
      return remarks + `<div class="rc-ack"><b>${parentLbl} acknowledgement</b><p>${ack}</p>
        ${t.parentRemarks !== false ? `<div class="rc-ack-row">${parentLbl} remarks: <span class="ln wide"></span></div>` : ''}
        <div class="rc-ack-sig"><div>Signature: <span class="ln"></span></div><div>Date: <span class="ln short"></span></div></div></div>` + teacherRow;
    }
    if(mode === 'slip'){
      return remarks + teacherRow + `<div class="rc-cut">✂ &nbsp;&nbsp; CUT HERE AND RETURN TO THE CLASS TEACHER &nbsp;&nbsp; ✂</div>
        <div class="rc-slip"><b>Acknowledgement slip</b> · ${escapeHtml(s.firstName+' '+s.lastName)} · ${escapeHtml(s.className)} — ${escapeHtml(s.section)} · ${escapeHtml(title)}
        <p style="margin:4px 0 8px;">${ack}</p>
        <div class="rc-ack-sig"><div>${parentLbl} signature: <span class="ln"></span></div><div>Date: <span class="ln short"></span></div></div></div>`;
    }
    return remarks + teacherRow;
  }

  function prcTableHtml(s, sc, src, t){
    const scheme = sc.scheme;
    const disp = scheme ? scheme.display : 'both';
    const showMarks = disp !== 'grades', showGrade = disp !== 'marks';
    const showGP = !!(scheme && scheme.showGP && showGrade), showRem = !!(scheme && scheme.showRemarks && showGrade);
    const showTopper = t.showClassTopper !== false && showMarks && students.filter(x => isActive(x) && x.className===s.className && x.section===s.section).length > 1;
    const top = showTopper ? prcTopperMap(src, s) : {};
    const multi = src.mode === 'period';
    const hasCode = sc.rows.some(r => r.code), hasDate = !multi && sc.rows.some(r => r.date);
    // an exam column shows "marks" when every subject has the same max, else "marks/max"
    const examMax = src.exams.map((ex, i) => { const m = sc.rows.map(r => r.cells[i]).filter(Boolean).map(c => c.max); return m.length && m.every(v => v === m[0]) ? m[0] : null; });
    const cell = (c, i) => { if(!c) return '—'; const v = c.absent ? 'AB' : (c.marks !== null ? c.marks : '—'); return (examMax[i] === null && !c.absent && c.marks !== null) ? `${v}/${c.max}` : v; };
    let head = `<tr>${hasCode?'<th>Code</th>':''}<th>Subject</th>${hasDate?'<th>Date</th>':''}`;
    if(showMarks){
      if(multi) head += src.exams.map((ex,i) => `<th class="c">${escapeHtml(ex.name)}${examMax[i]!==null?`<small>max ${examMax[i]}</small>`:''}</th>`).join('') + '<th class="c">Total</th>';
      else head += '<th class="c">Max</th><th class="c">Marks</th>';
    }
    if(showTopper) head += '<th class="c">Highest in class</th>';
    if(showGrade) head += '<th class="c">Grade</th>';
    if(showGP) head += '<th class="c">GP</th>';
    if(showRem) head += '<th>Remark</th>';
    head += '</tr>';
    const colSpanLead = (hasCode?1:0) + 1 + (hasDate?1:0);
    const body = sc.rows.map(r => {
      const fail = r.allAbsent || (r.info && r.info.fail);
      let tr = `<tr>${hasCode?`<td>${escapeHtml(r.code)||'—'}</td>`:''}<td>${escapeHtml(r.name)}${(r.elective && t.showElective!==false)?' (Elective)':''}${(!r.countable && t.showNotCounted!==false)?' (Not counted)':''}</td>${hasDate?`<td>${escapeHtml(r.date)||'—'}</td>`:''}`;
      if(showMarks){
        if(multi) tr += r.cells.map((c,i) => `<td class="c">${cell(c,i)}</td>`).join('') + `<td class="c"><b>${r.anyHas ? r.obtained : '—'}</b>/${r.max}</td>`;
        else tr += `<td class="c">${r.max}</td><td class="c ${fail?'fail':''}">${r.cells[0] && r.cells[0].absent ? 'AB' : (r.anyHas ? r.obtained : '—')}</td>`;
      }
      if(showTopper) tr += `<td class="c">${top[r.name] !== undefined ? top[r.name] : '—'}</td>`;
      if(showGrade) tr += `<td class="c ${fail?'fail':''}"><b>${escapeHtml(r.grade)}</b></td>`;
      if(showGP) tr += `<td class="c">${r.info ? r.info.gp : '—'}</td>`;
      if(showRem) tr += `<td>${r.info ? escapeHtml(r.info.remark) : ''}</td>`;
      return tr + '</tr>';
    }).join('');
    let foot = '';
    if(showMarks){
      const lead = `<td colspan="${colSpanLead}">Total</td>`;
      const mid = multi ? src.exams.map(() => '<td></td>').join('') + `<td class="c">${sc.totalObtained}/${sc.totalMax}</td>` : `<td class="c">${sc.totalMax}</td><td class="c">${sc.totalObtained}</td>`;
      foot = `<tr class="rc-total">${lead}${mid}${showTopper?'<td></td>':''}${showGrade?`<td class="c">${sc.info ? escapeHtml(sc.info.grade) : '—'}</td>`:''}${showGP?'<td></td>':''}${showRem?'<td></td>':''}</tr>`;
    }
    return `<table><thead>${head}</thead><tbody>${body}${foot}</tbody></table>`;
  }

  function prcReportHtml(s, src, t, opts){
    opts = opts || {};
    const sc = prcScore(s, src);
    const scheme = sc.scheme;
    const disp = scheme ? scheme.display : 'both';
    const showGrade = disp !== 'marks', showMarks = disp !== 'grades';
    const title = prcFinalTitle(src, t, opts.title);
    const rank = (t.showRank !== false) ? prcRankFor(src, s) : null;
    const basis = src.mode === 'period'
      ? `Marks counted: ${src.exams.map(e => escapeHtml(e.name)).join(' + ')} — total of all ${src.exams.length} exam${src.exams.length===1?'':'s'}`
      : `Exam: ${escapeHtml(src.name)}${src.pseudo.startDate ? ' · ' + escapeHtml(src.pseudo.startDate) + (src.pseudo.endDate && src.pseudo.endDate !== src.pseudo.startDate ? ' – ' + escapeHtml(src.pseudo.endDate) : '') : ''}`;
    const boxes = [];
    if(showMarks) boxes.push(`<div class="rc-sumbox"><b>${sc.totalObtained} / ${sc.totalMax}</b>Total marks</div>`, `<div class="rc-sumbox"><b>${sc.pct}%</b>Percentage</div>`);
    if(showGrade) boxes.push(`<div class="rc-sumbox ${sc.info && sc.info.fail ? 'bad':''}"><b>${sc.info ? escapeHtml(sc.info.grade) : '—'}</b>Overall grade${scheme && scheme.showRemarks && sc.info && sc.info.remark ? ' · ' + escapeHtml(sc.info.remark) : ''}</div>`);
    if(scheme && scheme.showGP && sc.gpa !== null) boxes.push(`<div class="rc-sumbox"><b>${sc.gpa.toFixed(1)}</b>GPA</div>`);
    if(rank && rank.outOf > 1) boxes.push(`<div class="rc-sumbox"><b>${ordinalSuffix(rank.rank)}</b>Rank (of ${rank.outOf})</div>`);
    if(t.showResult !== false && sc.result !== '—') boxes.push(`<div class="rc-sumbox ${sc.result==='FAIL'?'bad':''}"><b>${sc.result}</b>Result${sc.failCount ? ` · ${sc.failCount} subject${sc.failCount===1?'':'s'}` : ''}</div>`);
    const cls = (opts.perPage === 2) ? 'rc-two' : ('rc-one' + ((t.parentSign || 'box') === 'slip' ? ' rc-full' : ''));
    return `
      <div class="rc-card ${cls}">
        <div class="rc-head">${opts.logoSrc ? `<img src="${opts.logoSrc}">` : ''}</div>
        <div class="rc-school">${escapeHtml(schoolInfo.name||'')}</div>
        <div class="rc-addr">${escapeHtml(schoolInfo.address||'')}</div>
        <div class="rc-title">${escapeHtml(title)}</div>
        <div class="rc-basis">${basis}</div>
        <div class="rc-info">${buildInfoFieldLines(s, src.pseudo, t)}</div>
        ${sc.rows.length ? prcTableHtml(s, sc, src, t) : '<p style="font-size:10px;color:#777;">No subjects are set up for this class in the selected exam.</p>'}
        <div class="rc-sum">${boxes.join('')}</div>
        ${coScholasticSectionHtml(s, src.coExam, t)}
        ${t.footerNote ? `<p class="rc-foot">${escapeHtml(t.footerNote)}</p>` : ''}
        <div class="rc-grow"></div>
        ${prcSignHtml(s, t, title)}
      </div>`;
  }
  // The parent portal (and anything older) still calls this with (student, exam, logo, template).
  function reportCardPageHtml(s, exam, logoSrc, template){
    const src = prcMakeSrc('e:'+exam.id, exam.name, [exam], 'exam');
    const t = template || prcTemplate();
    return prcReportHtml(s, src, t, { logoSrc, perPage:1, title:'' });
  }

  /* ---------- printing ---------- */
  function prcLogo(){ const el = document.querySelector('.sb-brand img'); return el ? el.src : ''; }
  async function prcOpenPrint(list, src, t, fileTitle){
    await Promise.all([ ensureDataLoaded('examResults', loadExamResultsData), ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData) ]);
    prcInvalidate();
    const logoSrc = prcLogo();
    const per = prcPerPage === 2 ? 2 : 1;
    let pages = '';
    list.forEach((s, i) => {
      pages += prcReportHtml(s, src, t, { logoSrc, perPage:per, title:prcTitle });
      const last = i === list.length - 1;
      if(!last && (per === 1 || (i % 2) === 1)) pages += '<div style="page-break-after:always;"></div>';
    });
    const w = window.open('', '_blank');
    if(!w){ showToast('Your browser blocked the print window — allow pop-ups for this site and try again.'); return; }
    w.document.write(`<html><head><title>${escapeHtml(fileTitle)}</title><style>${prcPrintCss()}</style></head><body onload="window.print()">${pages}</body></html>`);
    w.document.close();
  }
  async function prcPrintOne(studentId){
    const s = students.find(x => x.id === studentId), src = prcCurrentSrc();
    if(!s || !src) return;
    await prcOpenPrint([s], src, prcTemplate(), `ProgressReport_${s.admissionNo||s.id}_${(s.firstName+s.lastName).replace(/\s/g,'')}_${src.name.replace(/\s/g,'')}`);
  }
  async function prcPrintAll(){
    const src = prcCurrentSrc();
    if(!src) return;
    let list = prcRosterStudents();
    if(prcOnlyComplete) list = list.filter(s => prcScore(s, src).missing === 0 && prcScore(s, src).anyHas);
    if(!list.length){ showToast('No students to print for this selection.'); return; }
    const incomplete = list.filter(s => prcScore(s, src).missing > 0).length;
    if(incomplete && !await showConfirmDialog(`${incomplete} of ${list.length} students have marks not entered yet. Print all anyway? (Tick “Only complete” to skip them.)`)) return;
    if(list.length > 60 && !await showConfirmDialog(`This will generate ${list.length} reports in one print job — continue?`)) return;
    await prcOpenPrint(list, src, prcTemplate(), `ProgressReports_${src.name.replace(/\s/g,'')}_${(prcClass||'All').replace(/\s/g,'')}${prcSection||''}`);
  }
  // old entry points, kept for anything that still calls them
  async function printReportCard(studentId, examId){
    prcMode = 'exam'; prcSourceId = examId;
    return prcPrintOne(studentId);
  }
  async function printBulkReportCards(){ return prcPrintAll(); }

  /* ---------- the tab ---------- */
  function prcRosterStudents(){
    const q = prcSearchText.trim().toLowerCase();
    return students.filter(s => isActive(s) && (!prcClass || s.className === prcClass) && (!prcSection || s.section === prcSection)
      && (!q || ((s.firstName||'')+' '+(s.lastName||'')).toLowerCase().includes(q) || String(s.admissionNo||'').toLowerCase().includes(q)))
      .sort((a,b) => (a.section||'').localeCompare(b.section||'') || (a.firstName||'').localeCompare(b.firstName||''));
  }
  function prcPickDefaults(){
    if(!prcSourceId || !prcResolveSource(prcMode, prcSourceId)){
      if(prcMode === 'period' && examGroups.length) prcSourceId = examGroups[examGroups.length-1].id;
      else { prcMode = 'exam'; prcSourceId = examDefs.length ? examDefs[examDefs.length-1].id : ''; }
    }
    if(!prcClass){
      const withStudents = CLASS_LEVELS.find(c => students.some(s => isActive(s) && s.className === c));
      prcClass = withStudents || CLASS_LEVELS[0] || '';
    }
    if(prcTemplateId && !reportTemplates.some(t => t.id === prcTemplateId)) prcTemplateId = '';
    if(!prcTemplateId){ const d = reportTemplates.find(t => t.isDefault) || reportTemplates[0]; prcTemplateId = d ? d.id : ''; }
  }
  function renderReportCardsTab(body){
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b>Create an exam first, then come back to print progress reports.</div>`;
      return;
    }
    prcInvalidate();
    prcPickDefaults();
    body.innerHTML = `
      <div class="prc-intro">
        <h3>Progress Reports</h3>
        <p>Choose which marks to print, check the title, pick how parents sign, then print for a whole class or one student.</p>
      </div>
      <div class="prc-setup">
        <div class="sf-card prc-step">
          <div class="prc-stephead"><i>1</i><b>Marks to use</b></div>
          <div class="sf-segments" id="prcModeSeg">
            <button type="button" data-m="exam" onclick="prcSetMode('exam')">Single exam</button>
            <button type="button" data-m="period" onclick="prcSetMode('period')">Report period</button>
          </div>
          <select id="prcSource" class="input" onchange="prcSetSource(this.value)"></select>
          <div class="prc-hint" id="prcModeHint"></div>
          <div class="prc-chips" id="prcChips"></div>
        </div>
        <div class="sf-card prc-step">
          <div class="prc-stephead"><i>2</i><b>Title &amp; layout</b></div>
          <label class="prc-lbl">Title printed on the report</label>
          <input type="text" class="input" id="prcTitleInput" placeholder="" oninput="prcOnTitleInput(this.value)">
          <div class="prc-hint">Leave empty for the automatic title. Type your own to override it for this print.</div>
          <label class="prc-lbl" style="margin-top:10px;">Report template</label>
          <div class="prc-row">
            <select id="prcTemplateSel" class="input" onchange="prcSetTemplate(this.value)">${reportTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select>
            <button type="button" class="btn btn-ghost btn-sm" onclick="switchResultTab('templates')">Edit templates</button>
          </div>
          <div class="prc-opts" id="prcOpts"></div>
        </div>
        <div class="sf-card prc-step prc-step--wide">
          <div class="prc-stephead"><i>3</i><b>Parent signature</b><span class="prc-sub">Click a style to preview it on the report below</span></div>
          <div class="prc-signs" id="prcSigns"></div>
          <div class="prc-signopts" id="prcSignOpts"></div>
        </div>
      </div>
      <div class="prc-who">
        <div class="prc-who-head"><h3>Students</h3><span class="prc-sub" id="prcWhoSub"></span></div>
        <div class="sf-kpis" id="prcKpis"></div>
        <div class="iv-toolbar">
          <select id="prcClassSel" class="input" onchange="prcSetClass(this.value)">${CLASS_LEVELS.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select>
          <select id="prcSecSel" class="input" onchange="prcSetSection(this.value)"><option value="">All sections</option>${SECTIONS.map(x => `<option value="${x}">Section ${x}</option>`).join('')}</select>
          <input class="input iv-search" id="prcSearchInput" placeholder="Search name or admission no." autocomplete="off" oninput="prcOnSearch(this.value)">
          <label class="prc-inline"><input type="checkbox" id="prcOnlyComp" onchange="prcOnlyComplete=this.checked"> Only complete</label>
          <select id="prcPerPageSel" class="input" onchange="prcPerPage=Number(this.value)" title="Reports per A4 page"><option value="1">1 per page</option><option value="2">2 per page</option></select>
          <div class="iv-toolbar-actions">${sfBtn('primary','receipt','Print for this selection','prcPrintAll()')}</div>
        </div>
        <div class="table-wrap iv-table-card"><table class="iv-table prc-roster"><thead><tr><th>Student</th><th>Adm. no.</th><th class="c">Marks</th><th class="c">%</th><th class="c">Grade</th><th class="c">Rank</th><th>Status</th><th></th></tr></thead><tbody id="prcRows"></tbody></table></div>
      </div>
      <div class="prc-prev-head"><h3>Report preview</h3><span class="prc-sub" id="prcPrevSub"></span></div>
      <div id="prcPreview"></div>
    `;
    document.getElementById('prcClassSel').value = prcClass;
    document.getElementById('prcSecSel').value = prcSection;
    document.getElementById('prcPerPageSel').value = String(prcPerPage);
    document.getElementById('prcOnlyComp').checked = prcOnlyComplete;
    document.getElementById('prcTitleInput').value = prcTitle;
    document.getElementById('prcTemplateSel').value = prcTemplateId;
    prcPaintSource(); prcPaintTitle(); prcPaintOpts(); prcPaintSigns(); prcPaintRoster(); prcPaintPreview();
  }

  function prcPaintSource(){
    const seg = document.getElementById('prcModeSeg'), sel = document.getElementById('prcSource');
    if(!seg || !sel) return;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.m === prcMode));
    if(prcMode === 'period'){
      sel.innerHTML = examGroups.length ? examGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('') : '<option value="">No report periods yet</option>';
      document.getElementById('prcModeHint').innerHTML = examGroups.length
        ? 'A report period combines several exams (e.g. Unit Test 1 + Unit Test 2). Each exam appears as a column with a total.'
        : `You have not created a report period yet. <a onclick="switchResultTab('examtemplates'); openExamGroupEditor()">Create one</a> to combine exams on one report.`;
    }else{
      sel.innerHTML = examDefs.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
      document.getElementById('prcModeHint').textContent = 'Marks of one exam only, with the subject-wise grade.';
    }
    sel.value = prcSourceId;
    const src = prcCurrentSrc();
    document.getElementById('prcChips').innerHTML = src
      ? `<span class="prc-chips-l">Marks counted from:</span>` + src.exams.map(e => `<span class="pill">${escapeHtml(e.name)}</span>`).join('<span class="prc-plus">+</span>')
      : '';
  }
  function prcPaintTitle(){
    const src = prcCurrentSrc(), t = prcTemplate(), inp = document.getElementById('prcTitleInput');
    if(inp && src) inp.placeholder = prcAutoTitle(src, t);
  }
  function prcPaintOpts(){
    const t = prcTemplate(), box = document.getElementById('prcOpts');
    if(!box) return;
    const chk = (key, label, def) => `<label class="prc-inline"><input type="checkbox" ${(t[key] === undefined ? def : t[key]) ? 'checked' : ''} onchange="prcSetTplOpt('${key}', this.checked)"> ${label}</label>`;
    box.innerHTML = chk('showAttendance','Attendance',true) + chk('showRank','Class rank',true) + chk('showClassTopper','Highest in class',true) + chk('showResult','Pass / Fail result',true) + chk('teacherRemarks','Teacher remarks line',false);
  }
  function prcSignMini(key){
    const ln = '<i></i>';
    if(key === 'row') return `<div class="prc-mini"><div class="prc-mini-row"><span>${ln}Teacher</span><span>${ln}Parent</span><span>${ln}Principal</span></div></div>`;
    if(key === 'box') return `<div class="prc-mini"><div class="prc-mini-box"><u></u><u class="s"></u><div><span>${ln}</span><span class="d">${ln}</span></div></div><div class="prc-mini-row"><span>${ln}Teacher</span><span>${ln}Principal</span></div></div>`;
    if(key === 'slip') return `<div class="prc-mini"><div class="prc-mini-row"><span>${ln}Teacher</span><span>${ln}Principal</span></div><div class="prc-mini-cut">✂ - - - - - - -</div><div class="prc-mini-box slip"><u></u><div><span>${ln}</span><span class="d">${ln}</span></div></div></div>`;
    return `<div class="prc-mini"><div class="prc-mini-row"><span>${ln}Teacher</span><span>${ln}Principal</span></div></div>`;
  }
  function prcPaintSigns(){
    const t = prcTemplate(), cur = t.parentSign || 'box';
    const box = document.getElementById('prcSigns');
    if(!box) return;
    box.innerHTML = PRC_SIGN_OPTIONS.map(o => `<button type="button" class="prc-sign ${cur===o.key?'on':''}" onclick="prcSetSign('${o.key}')">
      ${prcSignMini(o.key)}<b>${o.name}</b><span>${o.desc}</span></button>`).join('');
    const opts = document.getElementById('prcSignOpts');
    if(opts){
      opts.innerHTML = (cur === 'box' || cur === 'slip') ? `
        <label class="prc-lbl">Wording above the signature</label>
        <input type="text" class="input" value="${escapeHtml(t.parentAckText || PRC_DEFAULT_ACK)}" onchange="prcSetTplOpt('parentAckText', this.value)">
        ${cur === 'box' ? `<label class="prc-inline" style="margin-top:8px;"><input type="checkbox" ${t.parentRemarks !== false ? 'checked' : ''} onchange="prcSetTplOpt('parentRemarks', this.checked)"> Include a “Parent remarks” line</label>` : ''}` : '';
    }
  }
  async function prcSaveTemplates(){
    if(!prcTemplate().id) return;
    try{ await storageSet(REPORT_TEMPLATES_KEY, reportTemplates); }catch(e){}
  }
  async function prcSetSign(key){
    prcTemplate().parentSign = key;
    prcPaintSigns(); prcPaintPreview();
    await prcSaveTemplates();
  }
  async function prcSetTplOpt(key, val){
    prcTemplate()[key] = val;
    prcInvalidate();
    prcPaintSigns(); prcPaintRoster(); prcPaintPreview();
    await prcSaveTemplates();
  }
  function prcSetMode(m){
    if(prcMode === m) return;
    prcMode = m;
    prcSourceId = m === 'period' ? (examGroups.length ? examGroups[examGroups.length-1].id : '') : (examDefs.length ? examDefs[examDefs.length-1].id : '');
    prcInvalidate(); prcPaintSource(); prcPaintTitle(); prcPaintRoster(); prcPaintPreview();
  }
  function prcSetSource(id){ prcSourceId = id; prcInvalidate(); prcPaintSource(); prcPaintTitle(); prcPaintRoster(); prcPaintPreview(); }
  function prcSetTemplate(id){ prcTemplateId = id; prcInvalidate(); prcPaintTitle(); prcPaintOpts(); prcPaintSigns(); prcPaintRoster(); prcPaintPreview(); }
  function prcSetClass(c){ prcClass = c; prcStudentId = ''; prcPaintRoster(); prcPaintPreview(); }
  function prcSetSection(x){ prcSection = x; prcStudentId = ''; prcPaintRoster(); prcPaintPreview(); }
  function prcOnSearch(v){ prcSearchText = v; clearTimeout(prcSearchTimer); prcSearchTimer = setTimeout(prcPaintRoster, 150); }
  function prcOnTitleInput(v){ prcTitle = v; clearTimeout(prcTitleTimer); prcTitleTimer = setTimeout(prcPaintPreview, 250); }
  function prcSelectStudent(id){ prcStudentId = id; prcPaintRoster(); prcPaintPreview(); const el = document.getElementById('prcPreview'); if(el) el.scrollIntoView({ behavior:'smooth', block:'start' }); }

  function prcPaintRoster(){
    const tb = document.getElementById('prcRows');
    if(!tb) return;
    const src = prcCurrentSrc();
    if(!src){ tb.innerHTML = `<tr><td colspan="8"><div class="empty-state"><b>Choose the marks to use</b>Pick an exam or a report period in step 1.</div></td></tr>`; return; }
    const t = prcTemplate();
    const list = prcRosterStudents();
    const all = students.filter(s => isActive(s) && (!prcClass || s.className === prcClass) && (!prcSection || s.section === prcSection));
    let complete = 0, incomplete = 0, passN = 0, scoredN = 0;
    all.forEach(s => { const sc = prcScore(s, src); if(sc.anyHas){ scoredN++; if(sc.result === 'PASS') passN++; } if(sc.anyHas && sc.missing === 0) complete++; else incomplete++; });
    const kp = document.getElementById('prcKpis');
    if(kp) kp.innerHTML = sfKpi('Students', all.length, 'plain', prcClass + (prcSection ? ' — ' + prcSection : '')) + sfKpi('Marks complete', complete, 'good', 'ready to print') + sfKpi('Marks missing', incomplete, incomplete ? 'warn' : 'plain', 'some or all entries pending') + sfKpi('Pass', scoredN ? Math.round(passN/scoredN*100) + '%' : '—', 'plain', scoredN ? `${passN} of ${scoredN} with marks` : 'no marks yet');
    const sub = document.getElementById('prcWhoSub');
    if(sub) sub.textContent = `${list.length} shown · click a student to preview`;
    if(!list.length){ tb.innerHTML = `<tr><td colspan="8"><div class="empty-state"><b>No students match</b>Change the class, section or search.</div></td></tr>`; return; }
    tb.innerHTML = list.map(s => {
      const sc = prcScore(s, src);
      const rank = (t.showRank !== false) ? prcRankFor(src, s) : null;
      const disp = sc.scheme ? sc.scheme.display : 'both';
      const status = !sc.anyHas ? '<span class="sf-badge sf-badge--upcoming">No marks</span>' : sc.missing ? `<span class="sf-badge sf-badge--due">${sc.missing} missing</span>` : '<span class="sf-badge sf-badge--paid">Complete</span>';
      return `<tr class="${prcStudentId===s.id?'prc-sel':''}" onclick="prcSelectStudent('${s.id}')">
        <td><div class="prc-stu"><span class="prc-av">${s.photo ? `<img src="${s.photo}">` : escapeHtml(initials(s))}</span><span><b>${escapeHtml(s.firstName+' '+s.lastName)}</b><small>${escapeHtml(s.className)} — ${escapeHtml(s.section)}</small></span></div></td>
        <td>${escapeHtml(s.admissionNo||'')}</td>
        <td class="c">${sc.anyHas ? `${sc.totalObtained}/${sc.totalMax}` : '—'}</td>
        <td class="c">${sc.anyHas && disp !== 'grades' ? sc.pct + '%' : '—'}</td>
        <td class="c">${sc.anyHas && sc.info ? `<span class="grade-pill ${sc.info.fail?'fail':''}">${escapeHtml(sc.info.grade)}</span>` : '—'}</td>
        <td class="c">${rank && rank.outOf > 1 ? ordinalSuffix(rank.rank) : '—'}</td>
        <td>${status}</td>
        <td class="prc-act"><button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); prcPrintOne('${s.id}')">🖨 Print</button></td>
      </tr>`;
    }).join('');
  }

  function prcPaintPreview(){
    const host = document.getElementById('prcPreview');
    if(!host) return;
    const src = prcCurrentSrc(), t = prcTemplate();
    const sub = document.getElementById('prcPrevSub');
    if(!src){ host.innerHTML = ''; return; }
    let s = students.find(x => x.id === prcStudentId);
    const list = prcRosterStudents();
    if(!s || !list.some(x => x.id === s.id)) s = list[0] || null;
    if(!s){ host.innerHTML = `<div class="empty-state"><b>No student to preview</b>Pick a class that has students.</div>`; if(sub) sub.textContent=''; return; }
    if(sub) sub.textContent = `${s.firstName} ${s.lastName} · ${s.className} — ${s.section}`;
    const html = prcReportHtml(s, src, t, { logoSrc:prcLogo(), perPage:1, title:prcTitle });
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${prcPrintCss()} body{ background:#fff; padding:0; margin:0; } .rc-card{ margin:0; }</style></head><body>${html}</body></html>`;
    const editor = (t.layout === 'modern') ? coScholasticEditorHtml(s, src.coExam, t) : '';
    host.innerHTML = `
      <div class="prc-paper"><iframe id="prcFrame" title="Report preview" scrolling="no"></iframe></div>
      <div class="prc-prev-actions">${sfBtn('primary','receipt','Print this report',`prcPrintOne('${s.id}')`)}</div>
      ${editor}`;
    const fr = document.getElementById('prcFrame');
    fr.onload = () => { try{ fr.style.height = Math.max(400, fr.contentDocument.documentElement.scrollHeight + 4) + 'px'; }catch(e){} };
    fr.srcdoc = doc;
  }
  // module 10's co-scholastic "Save Grades" button re-renders through this name
  function loadReportCardPreview(){ prcPaintPreview(); }
