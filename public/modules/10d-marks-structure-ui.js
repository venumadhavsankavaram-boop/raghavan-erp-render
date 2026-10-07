  /* ===== MARKS STRUCTURE — Total / Written / Internal =================================
     A subject's `maxMarks` is always the TOTAL (e.g. 50). When "internal marks" is on, the
     total is split into Written + Internal (e.g. 35 + 15): teachers enter both on the marks
     sheet, and the result's `marks` is the total scored — so reports, ranks, grading and
     every other module keep working on the total without any change.

     This file holds:
       • the Written / Internal fields in the Add/Edit Subject and "Add Subject to Multiple
         Classes" forms (subjSplitSync / subjSplitLoad / subjSplitRead), and
       • the Marks Structure Wizard (openMarksWizard): pick exams → classes → subjects, choose
         the total / written / internal marks (or "no internal marks"), review, apply.
     The marks sheet itself lives in module 10 (marksSplitOf, marksApplySheet, ...). =========== */

  /* ---------- fields inside the two subject forms ---------- */
  function subjSplitEls(p){
    return {
      on: document.getElementById(p + 'InternalOn'), box: document.getElementById(p + 'SplitFields'),
      total: document.getElementById(p + 'MaxMarks'), w: document.getElementById(p + 'WrittenMax'),
      i: document.getElementById(p + 'InternalMax'), note: document.getElementById(p + 'SplitNote'),
    };
  }
  function subjSplitSync(p, edited){
    const e = subjSplitEls(p);
    if(!e.on || !e.total) return;
    e.box.style.display = e.on.checked ? 'grid' : 'none';
    if(!e.on.checked){
      e.note.style.color = 'var(--ink-soft)';
      e.note.textContent = 'Off: one mark per student for this subject. On: teachers enter Written and Internal separately and the report shows the total.';
      return;
    }
    let total = Number(e.total.value) || 0, w = Number(e.w.value) || 0, i = Number(e.i.value) || 0;
    if(edited === 'on' && !i){
      i = total === 50 ? 15 : Math.max(1, Math.round(total * 0.2));
      if(i >= total) i = Math.max(1, total - 1);
    }
    if(edited === 'w'){ total = w + i; e.total.value = total || ''; }
    else { w = total - i; }
    e.i.value = i || '';
    e.w.value = w > 0 ? w : '';
    const ok = i >= 1 && w >= 1 && total === w + i;
    e.note.style.color = ok ? 'var(--teal)' : 'var(--danger)';
    e.note.textContent = ok ? `${w} written + ${i} internal = ${total} total` : 'Internal marks must be at least 1 and less than the total marks.';
  }
  function subjSplitLoad(p, existing){
    const e = subjSplitEls(p);
    if(!e.on) return;
    const im = existing ? subjInternalMax(existing) : 0;
    e.on.checked = !!im;
    e.i.value = im || '';
    e.w.value = im ? subjWrittenMax(existing) : '';
    subjSplitSync(p);
  }
  function subjSplitRead(p){
    const e = subjSplitEls(p);
    if(!e.on || !e.on.checked) return { internalMax: 0 };
    const total = Number(e.total.value) || 0, i = Number(e.i.value) || 0;
    if(!(i >= 1 && i < total)) return { internalMax: 0, error: 'Internal marks must be at least 1 and less than the total marks.' };
    return { internalMax: i };
  }

  /* ---------- the wizard ---------- */
  const MW_PRESETS = [
    { key:'fa50',  title:'50 = 35 + 15', note:'Formative Assessment: written + internal', total:50,  internal:15 },
    { key:'t100',  title:'100 = 80 + 20', note:'Written paper + internal assessment',       total:100, internal:20 },
    { key:'t25',   title:'25 = 20 + 5',   note:'Small test with internal marks',            total:25,  internal:5 },
    { key:'plain', title:'No internal marks', note:'One mark per student (set the total below)', total:0, internal:0 },
  ];
  let mw = null;

  function mwEnsureDom(){
    if(document.getElementById('mwOverlay')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay" id="mwOverlay"><div class="modal" style="max-width:860px;"><div class="modal-inner"><button class="modal-close" onclick="closeMarksWizard()">&times;</button><div id="mwBody"></div></div></div></div>`);
    const st = document.createElement('style');
    st.id = 'mwStyle';
    st.textContent = `
      .mw-sec{margin:0 0 18px}.mw-sec h4{margin:0 0 4px;font-size:.92rem;color:var(--navy)}
      .mw-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:2px 12px;max-height:170px;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:8px 12px}
      .mw-list label{display:flex;gap:8px;align-items:center;font-size:.84rem;padding:3px 0;cursor:pointer}
      .mw-list small{color:var(--ink-soft)}
      .mw-quick{display:flex;gap:12px;margin:0 0 6px;font-size:.78rem}.mw-quick a{cursor:pointer;color:var(--magenta);font-weight:600}
      .mw-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:12px 0 6px}
      .mw-fields.two{grid-template-columns:1fr}.mw-fields>div{min-width:0}.mw-fields input{width:100%;box-sizing:border-box}
      .mw-big{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;border-radius:12px;background:rgba(24,143,134,.1);margin:10px 0 0}
      .mw-big b{font-size:1.15rem;color:var(--navy)}.mw-big span{font-size:.82rem;color:var(--ink-soft)}
      .mw-bad{background:rgba(203,154,46,.16)}
      .mw-warn{font-size:.8rem;padding:10px 12px;border-radius:8px;background:rgba(203,154,46,.15);margin:10px 0}
      .mw-foot{display:flex;justify-content:space-between;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}
      .mw-arrow{color:var(--ink-soft)}
      .mw-tblwrap{max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:10px}
    `;
    document.head.appendChild(st);
  }

  async function openMarksWizard(presetClass){
    if(!canSub('exams_definitions','exams','edit')){ showToast("You don't have permission to change the marks structure."); return; }
    await ensureDataLoaded('examResults', loadExamResultsData);
    mwEnsureDom();
    const cur = examDefs.find(e => e.id === examCurrentExamId);
    mw = {
      step: 1, examIds: cur ? [cur.id] : [], classes: presetClass ? [presetClass] : null,
      allSubjects: true, subjectNames: [], preset: 'fa50', total: 50, internalOn: true, internal: 15, written: 35,
    };
    if(!mw.classes) mw.classes = mwAllowedClasses(mw.examIds).slice();
    document.getElementById('mwOverlay').classList.add('open');
    mwRender();
  }
  function closeMarksWizard(){
    const o = document.getElementById('mwOverlay');
    if(o) o.classList.remove('open');
    mw = null;
  }
  function mwAllowedClasses(examIds){
    const set = new Set();
    examIds.forEach(id => {
      const ex = examDefs.find(e => e.id === id);
      if(ex) classLevelsForExamType(ex.examType).forEach(c => set.add(c));
    });
    return CLASS_LEVELS.filter(c => set.has(c));
  }
  // Every (exam, class, section, subject) the wizard would touch.
  function mwTargets(){
    const out = [];
    const names = mw.allSubjects ? null : new Set(mw.subjectNames);
    mw.examIds.forEach(id => {
      const ex = examDefs.find(e => e.id === id);
      if(!ex) return;
      const allowed = classLevelsForExamType(ex.examType);
      mw.classes.filter(c => allowed.includes(c)).forEach(cls => {
        sectionsForClass(cls).forEach(sec => {
          getExamSubjects(ex, cls, sec).forEach(sub => {
            if(names && !names.has(sub.name)) return;
            out.push({ exam: ex, cls, sec, sub });
          });
        });
      });
    });
    return out;
  }
  function mwSubjectChoices(){
    const set = new Set();
    const keepNames = mw.allSubjects;
    mw.examIds.forEach(id => {
      const ex = examDefs.find(e => e.id === id);
      if(!ex) return;
      const allowed = classLevelsForExamType(ex.examType);
      mw.classes.filter(c => allowed.includes(c)).forEach(cls => sectionsForClass(cls).forEach(sec => getExamSubjects(ex, cls, sec).forEach(s => set.add(s.name))));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function mwStepper(){
    const names = ['What to change', 'New marks', 'Review & apply'];
    return `<div class="gsw-steps">${names.map((n, i) => `<div class="gsw-step ${mw.step === i+1 ? 'on' : (mw.step > i+1 ? 'done' : '')}"><i>${mw.step > i+1 ? '✓' : i+1}</i>${n}</div>`).join('')}</div>`;
  }
  function mwRender(){
    const body = document.getElementById('mwBody');
    if(!body || !mw) return;
    const head = `<h2 style="margin:0 0 4px;">Marks Structure Wizard</h2><p class="modal-sub" style="margin:0 0 6px;">Set the total marks for a subject, and optionally split it into <b>Written</b> + <b>Internal</b> marks (for example 50 = 35 + 15). Marks already entered are never deleted.</p>${mwStepper()}`;
    if(mw.step === 1) body.innerHTML = head + mwStep1();
    else if(mw.step === 2) body.innerHTML = head + mwStep2();
    else body.innerHTML = head + mwStep3();
  }

  function mwStep1(){
    const exams = examDefs.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const allowed = mwAllowedClasses(mw.examIds);
    const choices = mwSubjectChoices();
    return `
      <div class="mw-sec"><h4>1. Which exams?</h4>
        <p class="gsw-hint">Tick every exam that should use the same marks structure (for example FA-1, FA-2, FA-3 and FA-4).</p>
        <div class="mw-list">${exams.map(ex => `<label><input type="checkbox" ${mw.examIds.includes(ex.id) ? 'checked' : ''} onchange="mwToggleExam('${ex.id}', this.checked)"> <span>${escapeHtml(ex.name)} <small>${escapeHtml(ex.examType || '')}</small></span></label>`).join('') || '<small>No exams yet — create one first.</small>'}</div></div>
      <div class="mw-sec"><h4>2. Which classes?</h4>
        <div class="mw-quick"><a onclick="mwAllClasses(true)">Select all</a><a onclick="mwAllClasses(false)">Clear</a></div>
        <div class="mw-list">${allowed.map(c => `<label><input type="checkbox" ${mw.classes.includes(c) ? 'checked' : ''} onchange="mwToggleClass('${c}', this.checked)"> ${escapeHtml(c)}</label>`).join('') || '<small>Tick an exam first.</small>'}</div></div>
      <div class="mw-sec"><h4>3. Which subjects?</h4>
        <label class="gsw-radio"><input type="radio" name="mwSubj" ${mw.allSubjects ? 'checked' : ''} onchange="mwSetAllSubjects(true)"> All subjects in the selected classes</label>
        <label class="gsw-radio"><input type="radio" name="mwSubj" ${!mw.allSubjects ? 'checked' : ''} onchange="mwSetAllSubjects(false)"> Only some subjects</label>
        ${!mw.allSubjects ? `<div class="mw-list" style="margin-top:6px;">${choices.map(n => `<label><input type="checkbox" ${mw.subjectNames.includes(n) ? 'checked' : ''} onchange="mwToggleSubject(this.value, this.checked)" value="${escapeHtml(n)}"> ${escapeHtml(n)}</label>`).join('') || '<small>No subjects set up for this selection yet.</small>'}</div>` : ''}
      </div>
      <div class="mw-foot"><button class="btn btn-ghost" onclick="closeMarksWizard()">Cancel</button><button class="btn btn-primary" onclick="mwNext()">Next →</button></div>`;
  }
  function mwToggleExam(id, on){
    mw.examIds = on ? Array.from(new Set(mw.examIds.concat(id))) : mw.examIds.filter(x => x !== id);
    const allowed = mwAllowedClasses(mw.examIds);
    mw.classes = mw.classes.filter(c => allowed.includes(c));
    mwRender();
  }
  function mwToggleClass(c, on){ mw.classes = on ? Array.from(new Set(mw.classes.concat(c))) : mw.classes.filter(x => x !== c); if(!mw.allSubjects) mwRender(); }
  function mwAllClasses(on){ mw.classes = on ? mwAllowedClasses(mw.examIds).slice() : []; mwRender(); }
  function mwSetAllSubjects(v){ mw.allSubjects = v; mwRender(); }
  function mwToggleSubject(n, on){ mw.subjectNames = on ? Array.from(new Set(mw.subjectNames.concat(n))) : mw.subjectNames.filter(x => x !== n); }

  function mwStep2(){
    const p = MW_PRESETS;
    return `
      <div class="mw-sec"><h4>Pick a starting point</h4>
        <div class="gsw-presets">${p.map(x => `<button type="button" class="gsw-preset ${mw.preset === x.key ? 'on' : ''}" onclick="mwPreset('${x.key}')"><b>${x.title}</b><span>${x.note}</span></button>`).join('')}</div></div>
      <div class="mw-sec"><h4>Marks</h4>
        <label class="gsw-check"><input type="checkbox" ${mw.internalOn ? 'checked' : ''} onchange="mwSetInternalOn(this.checked)"> Include internal marks <span style="color:var(--ink-soft);">— split the total into Written + Internal</span></label>
        <div class="mw-fields ${mw.internalOn ? '' : 'two'}">
          <div class="f-field"><label>Total marks</label><input type="number" min="1" id="mwTotal" value="${mw.total || ''}" oninput="mwField('t', this.value)"></div>
          ${mw.internalOn ? `<div class="f-field"><label>Written marks</label><input type="number" min="1" id="mwWritten" value="${mw.written || ''}" oninput="mwField('w', this.value)"></div>
          <div class="f-field"><label>Internal marks</label><input type="number" min="1" id="mwInternal" value="${mw.internal || ''}" oninput="mwField('i', this.value)"></div>` : ''}
        </div>
        <p class="gsw-hint">${mw.internalOn ? 'Change the total or the internal marks and the written marks follow; change the written marks and the total follows.' : 'Teachers will enter a single mark out of the total.'}</p>
        <div id="mwSummary"></div></div>
      <div class="mw-foot"><button class="btn btn-ghost" onclick="mwBack()">← Back</button><button class="btn btn-primary" onclick="mwNext()">Next →</button></div>`;
  }
  function mwPaintSummary(){
    const el = document.getElementById('mwSummary');
    if(!el || !mw) return;
    const v = mwValidate();
    el.innerHTML = v.ok
      ? `<div class="mw-big"><b>${mw.total} marks total</b>${mw.internalOn ? `<span>${mw.written} written + ${mw.internal} internal</span>` : '<span>one mark per student, no internal marks</span>'}</div>`
      : `<div class="mw-big mw-bad"><b>Check the numbers</b><span>${escapeHtml(v.msg)}</span></div>`;
  }
  function mwValidate(){
    const t = Number(mw.total) || 0;
    if(!(t >= 1)) return { ok:false, msg:'Enter the total marks.' };
    if(!mw.internalOn) return { ok:true };
    const w = Number(mw.written) || 0, i = Number(mw.internal) || 0;
    if(!(i >= 1)) return { ok:false, msg:'Enter the internal marks (at least 1).' };
    if(!(w >= 1)) return { ok:false, msg:'Written marks must be at least 1 — internal marks must be less than the total.' };
    if(w + i !== t) return { ok:false, msg:`Written ${w} + Internal ${i} = ${w + i}, which is not the total ${t}.` };
    return { ok:true };
  }
  function mwPreset(key){
    const x = MW_PRESETS.find(p => p.key === key);
    if(!x) return;
    mw.preset = key;
    if(key === 'plain'){ mw.internalOn = false; mw.internal = 0; if(!mw.total) mw.total = 100; mw.written = mw.total; }
    else { mw.internalOn = true; mw.total = x.total; mw.internal = x.internal; mw.written = x.total - x.internal; }
    mwRender(); mwPaintSummary();
  }
  function mwSetInternalOn(on){
    mw.internalOn = on; mw.preset = '';
    if(on){
      if(!(Number(mw.internal) >= 1)){ mw.internal = Number(mw.total) === 50 ? 15 : Math.max(1, Math.round((Number(mw.total) || 100) * 0.2)); }
      mw.written = (Number(mw.total) || 0) - Number(mw.internal);
    } else { mw.internal = 0; mw.written = mw.total; }
    mwRender(); mwPaintSummary();
  }
  function mwField(which, val){
    const n = val === '' ? 0 : Number(val);
    mw.preset = '';
    if(which === 't'){ mw.total = n; if(mw.internalOn) mw.written = n - (Number(mw.internal) || 0); else mw.written = n; }
    else if(which === 'i'){ mw.internal = n; mw.written = (Number(mw.total) || 0) - n; }
    else { mw.written = n; mw.total = n + (Number(mw.internal) || 0); }
    const set = (id, v) => { const el = document.getElementById(id); if(el && document.activeElement !== el) el.value = v > 0 ? v : ''; };
    set('mwTotal', mw.total); set('mwWritten', mw.written); set('mwInternal', mw.internal);
    document.querySelectorAll('.gsw-preset').forEach(b => b.classList.remove('on'));
    mwPaintSummary();
  }

  async function mwReviewData(){
    const targets = mwTargets();
    const total = Number(mw.total), im = mw.internalOn ? Number(mw.internal) : 0, wr = total - im;
    // collapse sections: one row per exam + class + subject
    const rows = new Map();
    targets.forEach(t => {
      const k = t.exam.id + '|' + t.cls + '|' + t.sub.name;
      if(!rows.has(k)) rows.set(k, { exam: t.exam.name, cls: t.cls, name: t.sub.name, beforeTotal: Number(t.sub.maxMarks) || 0, beforeInt: subjInternalMax(t.sub), changed: false });
      const r = rows.get(k);
      if((Number(t.sub.maxMarks) || 0) !== total || subjInternalMax(t.sub) !== im) r.changed = true;
    });
    const list = Array.from(rows.values());
    // what happens to marks that are already saved
    let over = 0, legacy = 0, saved = 0;
    const scope = new Map();
    targets.forEach(t => scope.set(t.exam.id + '|' + t.cls + '|' + t.sec + '|' + t.sub.name, true));
    examResults.forEach(r => {
      if(!mw.examIds.includes(r.examId)) return;
      const st = students.find(s => s.id === r.studentId);
      if(!st || !scope.has(r.examId + '|' + st.className + '|' + st.section + '|' + r.subject)) return;
      if(r.marks == null) return;
      saved++;
      const hasSplit = r.written != null || r.internal != null;
      if(im){
        if(!hasSplit){ legacy++; if(Number(r.marks) > wr) over++; }
        else if((Number(r.written) || 0) > wr || (Number(r.internal) || 0) > im) over++;
      } else if(Number(r.marks) > total) over++;
    });
    return { list, changedCount: list.filter(r => r.changed).length, saved, over, legacy, total, im, wr };
  }
  async function mwStep3Async(){
    const d = await mwReviewData();
    mw.review = d;
    const body = document.getElementById('mwBody');
    if(!body || !mw || mw.step !== 3) return;
    const exams = new Set(d.list.map(r => r.exam)).size, classes = new Set(d.list.map(r => r.cls)).size;
    const show = d.list.slice(0, 60);
    body.innerHTML = `<h2 style="margin:0 0 4px;">Marks Structure Wizard</h2><p class="modal-sub" style="margin:0 0 6px;">Review before applying.</p>${mwStepper()}
      <div class="mw-big"><b>${d.list.length} subject${d.list.length === 1 ? '' : 's'}</b><span>across ${exams} exam${exams === 1 ? '' : 's'} and ${classes} class${classes === 1 ? '' : 'es'} → <b style="font-size:.95rem;">${d.total} marks</b>${d.im ? ` (${d.wr} written + ${d.im} internal)` : ' (no internal marks)'}</span></div>
      ${d.over ? `<div class="mw-warn">⚠️ <b>${d.over}</b> saved mark${d.over === 1 ? ' is' : 's are'} higher than the new maximum. Nothing is deleted or changed — those cells are highlighted in red on the marks sheet until the teacher corrects them.</div>` : ''}
      ${d.legacy ? `<div class="mw-warn">ℹ️ <b>${d.legacy}</b> mark${d.legacy === 1 ? ' was' : 's were'} entered before the split existed. They will show under <b>Written</b>; the teacher adds the Internal marks.</div>` : ''}
      ${!d.over && !d.legacy && d.saved ? `<p class="gsw-hint">${d.saved} saved mark${d.saved === 1 ? '' : 's'} in these subjects fit the new structure and stay as they are.</p>` : ''}
      <div class="mw-tblwrap"><table><thead><tr><th>Exam</th><th>Class</th><th>Subject</th><th>Now</th><th></th><th>After</th></tr></thead><tbody>
        ${show.map(r => `<tr><td>${escapeHtml(r.exam)}</td><td>${escapeHtml(r.cls)}</td><td>${escapeHtml(r.name)}</td>
          <td>${r.beforeTotal}${r.beforeInt ? ` <small>(${r.beforeTotal - r.beforeInt}+${r.beforeInt})</small>` : ''}</td><td class="mw-arrow">${r.changed ? '→' : '='}</td>
          <td><b>${d.total}</b>${d.im ? ` <small>(${d.wr}+${d.im})</small>` : ''}${r.changed ? '' : ' <small style="color:var(--ink-soft);">already set</small>'}</td></tr>`).join('')}
        ${d.list.length > show.length ? `<tr><td colspan="6"><small>…and ${d.list.length - show.length} more</small></td></tr>` : ''}
      </tbody></table></div>
      <p class="gsw-hint" style="margin-top:10px;">The report card and results will show each subject as <b>marks out of ${d.total}</b>${d.im ? ', using the written + internal total' : ''}.</p>
      <div class="mw-foot"><button class="btn btn-ghost" onclick="mwBack()">← Back</button><button class="btn btn-primary" id="mwApplyBtn" onclick="mwApply()" ${d.list.length ? '' : 'disabled'}>Apply to ${d.list.length} subject${d.list.length === 1 ? '' : 's'}</button></div>`;
  }
  function mwStep3(){
    mwStep3Async();
    return `<p class="gsw-hint">Preparing the review…</p>`;
  }

  function mwBack(){ if(mw.step > 1){ mw.step--; mwRender(); } }
  function mwNext(){
    if(mw.step === 1){
      if(!mw.examIds.length){ showToast('Tick at least one exam.'); return; }
      if(!mw.classes.length){ showToast('Tick at least one class.'); return; }
      if(!mw.allSubjects && !mw.subjectNames.length){ showToast('Tick at least one subject, or choose "All subjects".'); return; }
      if(!mwTargets().length){ showToast('No subjects are set up for that selection yet — add subjects to the exam first.'); return; }
      mw.step = 2; mwRender(); mwPaintSummary();
    } else if(mw.step === 2){
      const v = mwValidate();
      if(!v.ok){ showToast(v.msg); return; }
      mw.step = 3; mwRender();
    }
  }
  async function mwApply(){
    const total = Number(mw.total), im = mw.internalOn ? Number(mw.internal) : 0;
    const names = mw.allSubjects ? null : new Set(mw.subjectNames);
    const btn = document.getElementById('mwApplyBtn');
    if(btn){ btn.disabled = true; btn.textContent = 'Applying…'; }
    let touched = 0;
    mw.examIds.forEach(id => {
      const ex = examDefs.find(e => e.id === id);
      if(!ex) return;
      ex.classSubjects = ex.classSubjects || {};
      const allowed = classLevelsForExamType(ex.examType);
      mw.classes.filter(c => allowed.includes(c)).forEach(cls => {
        sectionsForClass(cls).forEach(sec => {
          const key = classSecKey(cls, sec);
          // copy the list so a class never shares subject objects with another class or the exam default
          const list = getExamSubjects(ex, cls, sec).map(s => ({ ...s }));
          let any = false;
          list.forEach(s => {
            if(names && !names.has(s.name)) return;
            s.maxMarks = total; s.internalMax = im; any = true; touched++;
          });
          if(any) ex.classSubjects[key] = list;
        });
      });
    });
    const ok = await storageSet(EXAM_DEFS_KEY, examDefs);
    if(ok === false){
      showToast('Could not save the new marks structure to the server. Please check your connection and try again.');
      if(btn){ btn.disabled = false; btn.textContent = 'Try again'; }
      return;
    }
    closeMarksWizard();
    showToast(`Marks structure updated: ${total} marks${im ? ' (' + (total - im) + ' written + ' + im + ' internal)' : ''}.`, 'burst');
    renderExamBody();
  }
