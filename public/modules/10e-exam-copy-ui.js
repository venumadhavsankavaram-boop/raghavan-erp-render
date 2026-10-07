  /* ===== COPY SUBJECTS FROM ANOTHER EXAM =============================================
     Setting up subjects class-by-class for every exam is slow. This wizard copies the whole
     subject set-up (subjects, max marks + internal split, teachers, countable / elective
     flags and optionally the dates) from one exam into one or more other exams, for all the
     classes you tick, in one go.

       Step 1  Copy from … to …        (defaults to the most recent earlier exam)
       Step 2  Classes + options        (dates, conflict handling)
       Step 3  Review & apply

     Entry points: openExamCopyWizard(targetExamId?) — buttons on the Exams list and on the
     Configure Subjects screen. Marks already entered are never touched. ================ */

  let ec = null;

  function ecIsoToDays(s){ const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : Math.round(d.getTime() / 86400000); }
  function ecDaysToIso(n){ const d = new Date(n * 86400000); const p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function ecSubjectCount(ex, cls){
    let n = 0;
    sectionsForClass(cls).forEach(sec => { n = Math.max(n, getExamSubjects(ex, cls, sec).length); });
    return n;
  }
  function ecExamHasSubjects(ex){
    return CLASS_LEVELS.some(c => ecSubjectCount(ex, c) > 0);
  }
  // Most recent exam, other than `targetId`, that already has subjects — preferring
  // ones that start before the target.
  function ecSuggestSource(targetId){
    const target = examDefs.find(e => e.id === targetId);
    const cands = examDefs.filter(e => e.id !== targetId && ecExamHasSubjects(e));
    if(!cands.length) return null;
    const key = e => e.startDate || '';
    const sorted = cands.slice().sort((a, b) => key(b).localeCompare(key(a)));
    if(target && target.startDate){
      const before = sorted.filter(e => e.startDate && e.startDate <= target.startDate);
      if(before.length) return before[0].id;
    }
    // no usable dates: take the one created last in the list
    return key(sorted[0]) ? sorted[0].id : cands[cands.length - 1].id;
  }

  function ecEnsureDom(){
    if(document.getElementById('ecOverlay')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay" id="ecOverlay"><div class="modal" style="max-width:880px;"><div class="modal-inner"><button class="modal-close" onclick="closeExamCopyWizard()">&times;</button><div id="ecBody"></div></div></div></div>`);
    if(document.getElementById('ecStyle')) return;
    const st = document.createElement('style');
    st.id = 'ecStyle';
    st.textContent = `
      .ec-sec{margin:0 0 18px}.ec-sec h4{margin:0 0 4px;font-size:.92rem;color:var(--navy)}
      .ec-sec select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font:inherit}
      .ec-two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
      @media(max-width:700px){.ec-two{grid-template-columns:1fr}}
      .ec-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:2px 12px;max-height:200px;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:8px 12px}
      .ec-list label{display:flex;gap:8px;align-items:center;font-size:.84rem;padding:3px 0;cursor:pointer}
      .ec-list small{color:var(--ink-soft)}
      .ec-quick{display:flex;gap:12px;margin:0 0 6px;font-size:.78rem}.ec-quick a{cursor:pointer;color:var(--magenta);font-weight:600}
      .ec-opts{display:grid;gap:8px}
      .ec-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:.84rem}
      .ec-opt.on{border-color:var(--teal);background:rgba(24,143,134,.07)}
      .ec-opt b{display:block;color:var(--navy)}.ec-opt span{color:var(--ink-soft);font-size:.78rem}
      .ec-chip{display:inline-block;margin:6px 0 0;padding:6px 12px;border-radius:999px;background:rgba(24,143,134,.12);color:#0f6a63;font-size:.8rem;font-weight:600;cursor:pointer;border:0}
      .ec-warn{font-size:.8rem;padding:10px 12px;border-radius:8px;background:rgba(203,154,46,.15);margin:10px 0}
      .ec-big{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;border-radius:12px;background:rgba(24,143,134,.1);margin:10px 0}
      .ec-big b{font-size:1.1rem;color:var(--navy)}.ec-big span{font-size:.82rem;color:var(--ink-soft)}
      .ec-foot{display:flex;justify-content:space-between;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}
      .ec-tblwrap{max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:10px}
      .ec-tblwrap table{width:100%;font-size:.82rem}
      .ec-pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.72rem;font-weight:600}
      .ec-add{background:rgba(24,143,134,.15);color:#0f6a63}.ec-skip{background:rgba(0,0,0,.07);color:var(--ink-soft)}.ec-rep{background:rgba(203,154,46,.2);color:#8a6a1f}
    `;
    document.head.appendChild(st);
  }

  function openExamCopyWizard(targetId){
    if(!canSub('exams_definitions','exams','edit')){ showToast("You don't have permission to change exam subjects."); return; }
    if(examDefs.length < 2){ showToast('You need at least two exams — one to copy from and one to copy into.'); return; }
    ecEnsureDom();
    const tid = targetId || examCurrentExamId || null;
    const src = ecSuggestSource(tid);
    ec = {
      step: 1, sourceId: src, targetIds: tid && tid !== src ? [tid] : [], classes: [],
      dates: 'shift', skipHolidays: true, mode: 'merge',
    };
    ec.classes = ecClassChoices().map(c => c.cls);
    document.getElementById('ecOverlay').classList.add('open');
    ecRender();
  }
  function closeExamCopyWizard(){
    const o = document.getElementById('ecOverlay');
    if(o) o.classList.remove('open');
    ec = null;
  }

  // Classes that make sense: the source has subjects, and at least one target offers the class.
  function ecClassChoices(){
    const src = examDefs.find(e => e.id === ec.sourceId);
    if(!src) return [];
    const targets = ec.targetIds.map(id => examDefs.find(e => e.id === id)).filter(Boolean);
    const srcAllowed = classLevelsForExamType(src.examType);
    return CLASS_LEVELS.filter(c => srcAllowed.includes(c) && ecSubjectCount(src, c) > 0 && (!targets.length || targets.some(t => classLevelsForExamType(t.examType).includes(c))))
      .map(c => ({ cls: c, count: ecSubjectCount(src, c) }));
  }

  function ecStepper(){
    const names = ['Copy from → to', 'Classes & options', 'Review & apply'];
    return `<div class="gsw-steps">${names.map((n, i) => `<div class="gsw-step ${ec.step === i+1 ? 'on' : (ec.step > i+1 ? 'done' : '')}"><i>${ec.step > i+1 ? '✓' : i+1}</i>${n}</div>`).join('')}</div>`;
  }
  function ecRender(){
    const body = document.getElementById('ecBody');
    if(!body || !ec) return;
    const head = `<h2 style="margin:0 0 4px;">Copy Subjects from Another Exam</h2><p class="modal-sub" style="margin:0 0 6px;">Reuse an earlier exam's subjects, marks, internal split and teachers instead of adding them again, class by class. Marks already entered are never touched.</p>${ecStepper()}`;
    body.innerHTML = head + (ec.step === 1 ? ecStep1() : ec.step === 2 ? ecStep2() : ecStep3());
  }

  function ecStep1(){
    const src = examDefs.find(e => e.id === ec.sourceId);
    const sorted = examDefs.slice().sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')) || String(a.name).localeCompare(String(b.name)));
    const last = ecSuggestSource(ec.targetIds[0] || null);
    const lastEx = examDefs.find(e => e.id === last);
    return `
      <div class="ec-two">
        <div class="ec-sec"><h4>1. Copy from (source exam)</h4>
          <select onchange="ecSetSource(this.value)">
            <option value="">— choose an exam —</option>
            ${sorted.map(ex => `<option value="${ex.id}" ${ec.sourceId === ex.id ? 'selected' : ''} ${ecExamHasSubjects(ex) ? '' : 'disabled'}>${escapeHtml(ex.name)}${ecExamHasSubjects(ex) ? '' : ' (no subjects yet)'}</option>`).join('')}
          </select>
          ${lastEx && lastEx.id !== ec.sourceId ? `<button class="ec-chip" onclick="ecSetSource('${lastEx.id}')">↺ Use last exam: ${escapeHtml(lastEx.name)}</button>` : ''}
          ${src ? `<p class="gsw-hint" style="margin-top:8px;">${escapeHtml(src.examType || '')} · ${CLASS_LEVELS.filter(c => ecSubjectCount(src, c) > 0).length} class(es) configured${src.startDate ? ' · starts ' + src.startDate : ''}</p>` : ''}
        </div>
        <div class="ec-sec"><h4>2. Copy into (target exams)</h4>
          <p class="gsw-hint">Tick one or more — e.g. FA-2, FA-3 and FA-4 from FA-1.</p>
          <div class="ec-list" style="grid-template-columns:1fr;">${sorted.filter(e => e.id !== ec.sourceId).map(ex => `<label><input type="checkbox" ${ec.targetIds.includes(ex.id) ? 'checked' : ''} onchange="ecToggleTarget('${ex.id}', this.checked)"> <span>${escapeHtml(ex.name)} <small>${escapeHtml(ex.examType || '')}${ex.startDate ? ' · ' + ex.startDate : ''}</small></span></label>`).join('') || '<small>No other exams.</small>'}</div>
        </div>
      </div>
      <div class="ec-foot"><button class="btn btn-ghost" onclick="closeExamCopyWizard()">Cancel</button><button class="btn btn-primary" onclick="ecNext()">Next →</button></div>`;
  }
  function ecSetSource(id){
    ec.sourceId = id || null;
    ec.targetIds = ec.targetIds.filter(t => t !== id);
    ec.classes = ecClassChoices().map(c => c.cls);
    ecRender();
  }
  function ecToggleTarget(id, on){
    ec.targetIds = on ? Array.from(new Set(ec.targetIds.concat(id))) : ec.targetIds.filter(x => x !== id);
    ec.classes = ecClassChoices().map(c => c.cls);
  }

  function ecStep2(){
    const choices = ecClassChoices();
    const optBox = (group, val, title, note) => `<label class="ec-opt ${ec[group] === val ? 'on' : ''}"><input type="radio" name="ec_${group}" ${ec[group] === val ? 'checked' : ''} onchange="ecSetOpt('${group}','${val}')"><div><b>${title}</b><span>${note}</span></div></label>`;
    return `
      <div class="ec-sec"><h4>Which classes?</h4>
        <div class="ec-quick"><a onclick="ecAllClasses(true)">Select all</a><a onclick="ecAllClasses(false)">Clear</a></div>
        <div class="ec-list">${choices.map(c => `<label><input type="checkbox" ${ec.classes.includes(c.cls) ? 'checked' : ''} onchange="ecToggleClass('${c.cls}', this.checked)"> <span>${escapeHtml(c.cls)} <small>${c.count} subject${c.count === 1 ? '' : 's'}</small></span></label>`).join('') || '<small>The source exam has no classes with subjects that the target exams offer.</small>'}</div></div>
      <div class="ec-two">
        <div class="ec-sec"><h4>Exam dates</h4><div class="ec-opts">
          ${optBox('dates', 'shift', 'Shift to the new exam', 'Keeps the same gaps between papers, starting from the target exam\'s start date.')}
          ${optBox('dates', 'same', 'Keep the same dates', 'Copies the exact dates (use for a repeat of the same timetable).')}
          ${optBox('dates', 'blank', 'Leave dates empty', 'You will set each subject\'s date later (needed before hall tickets).')}
        </div>
        ${ec.dates === 'shift' ? `<label class="gsw-check" style="margin-top:8px;"><input type="checkbox" ${ec.skipHolidays ? 'checked' : ''} onchange="ec.skipHolidays=this.checked; ecRender()"> Move papers that land on a holiday / Sunday to the next working day</label>` : ''}
        </div>
        <div class="ec-sec"><h4>If a class already has subjects in the target</h4><div class="ec-opts">
          ${optBox('mode', 'merge', 'Add missing subjects only', 'Existing subjects stay exactly as they are. Recommended.')}
          ${optBox('mode', 'skip', 'Skip those classes', 'Only fill classes that are still empty.')}
          ${optBox('mode', 'replace', 'Replace with the source', 'Overwrites the target\'s subject list for those classes.')}
        </div></div>
      </div>
      <div class="ec-foot"><button class="btn btn-ghost" onclick="ec.step=1;ecRender()">← Back</button><button class="btn btn-primary" onclick="ecNext()">Review →</button></div>`;
  }
  function ecSetOpt(g, v){ ec[g] = v; ecRender(); }
  function ecToggleClass(c, on){ ec.classes = on ? Array.from(new Set(ec.classes.concat(c))) : ec.classes.filter(x => x !== c); }
  function ecAllClasses(on){ ec.classes = on ? ecClassChoices().map(c => c.cls) : []; ecRender(); }

  function ecNext(){
    if(ec.step === 1){
      if(!ec.sourceId){ showToast('Choose the exam to copy from.'); return; }
      if(!ec.targetIds.length){ showToast('Tick at least one exam to copy into.'); return; }
      ec.classes = ecClassChoices().map(c => c.cls).filter(c => ec.classes.includes(c) || true);
      ec.step = 2; ecRender();
    } else if(ec.step === 2){
      if(!ec.classes.length){ showToast('Tick at least one class.'); return; }
      ec.step = 3; ecRender();
    }
  }

  // Next working day on/after an ISO date (skips holidays and automatic non-working weekdays).
  function ecNextWorking(iso){
    let n = ecIsoToDays(iso), guard = 0;
    while(guard++ < 60 && holidayFor(ecDaysToIso(n))) n++;
    return ecDaysToIso(n);
  }
  function ecMapDate(date, src, tgt){
    if(!date || ec.dates === 'blank') return '';
    if(ec.dates === 'same') return date;
    const a = src.startDate && ecIsoToDays(src.startDate), b = tgt.startDate && ecIsoToDays(tgt.startDate), d = ecIsoToDays(date);
    if(a == null || b == null || d == null) return date;
    const out = ecDaysToIso(d + (b - a));
    return ec.skipHolidays ? ecNextWorking(out) : out;
  }

  // Build the full plan without touching data.
  function ecPlan(){
    const src = examDefs.find(e => e.id === ec.sourceId);
    const rows = [];
    ec.targetIds.forEach(tid => {
      const tgt = examDefs.find(e => e.id === tid);
      if(!tgt || !src) return;
      const allowed = classLevelsForExamType(tgt.examType);
      ec.classes.filter(c => allowed.includes(c)).forEach(cls => {
        sectionsForClass(cls).forEach(sec => {
          const from = getExamSubjects(src, cls, sec);
          if(!from.length) return;
          const cur = getExamSubjects(tgt, cls, sec);
          const curNames = new Set(cur.map(s => s.name));
          let result, added = 0, action;
          if(!cur.length){ action = 'add'; }
          else if(ec.mode === 'skip'){ action = 'skip'; }
          else if(ec.mode === 'replace'){ action = 'replace'; }
          else { action = 'merge'; }
          const copies = from.map(s => Object.assign({}, s, { staffIds: (s.staffIds || []).slice(), date: ecMapDate(s.date, src, tgt) }));
          if(action === 'skip') result = cur.slice();
          else if(action === 'replace' || action === 'add'){ result = copies; added = copies.length; }
          else { const extra = copies.filter(s => !curNames.has(s.name)); result = cur.concat(extra); added = extra.length; if(!extra.length) action = 'skip'; }
          rows.push({ tgt, cls, sec, action, added, before: cur.length, after: result.length, result, dropped: action === 'replace' ? cur.filter(s => !from.some(f => f.name === s.name)).map(s => s.name) : [] });
        });
      });
    });
    return rows;
  }
  function ecHolidayClashes(rows){
    const hits = [];
    rows.filter(r => r.action !== 'skip').forEach(r => r.result.forEach(s => {
      if(s.date && holidayFor(s.date)) hits.push(`${r.tgt.name} · ${r.cls}-${r.sec} · ${s.name} (${s.date})`);
    }));
    return hits;
  }

  function ecStep3(){
    const rows = ecPlan();
    const changing = rows.filter(r => r.action !== 'skip');
    const totalAdded = changing.reduce((n, r) => n + r.added, 0);
    const replaced = rows.filter(r => r.action === 'replace');
    const clashes = ecHolidayClashes(rows);
    // group by target exam + class
    const groups = {};
    rows.forEach(r => { const k = r.tgt.id + '|' + r.cls; (groups[k] = groups[k] || []).push(r); });
    const line = Object.keys(groups).map(k => {
      const g = groups[k], r0 = g[0];
      const act = g.some(x => x.action === 'replace') ? 'rep' : g.every(x => x.action === 'skip') ? 'skip' : 'add';
      const lbl = act === 'rep' ? 'Replace' : act === 'skip' ? 'Skip' : 'Add';
      const added = g.reduce((n, x) => n + x.added, 0);
      return `<tr><td>${escapeHtml(r0.tgt.name)}</td><td>${escapeHtml(r0.cls)} <small style="color:var(--ink-soft)">(${g.map(x => x.sec).join(', ')})</small></td><td>${g[0].before}</td><td><span class="ec-pill ec-${act}">${lbl}</span></td><td>${act === 'skip' ? '—' : '+' + added}</td></tr>`;
    }).join('');
    const dropped = Array.from(new Set(replaced.flatMap(r => r.dropped)));
    return `
      <div class="ec-big"><b>${totalAdded} subject entr${totalAdded === 1 ? 'y' : 'ies'} will be added</b><span>${changing.length} class-section${changing.length === 1 ? '' : 's'} across ${ec.targetIds.length} exam${ec.targetIds.length === 1 ? '' : 's'}${rows.length - changing.length ? ' · ' + (rows.length - changing.length) + ' left unchanged' : ''}</span></div>
      ${dropped.length ? `<div class="ec-warn">⚠ "Replace" will remove: ${dropped.map(escapeHtml).join(', ')} from the target exam(s). Marks already entered for them stay in the database but won't show on the marks sheet.</div>` : ''}
      ${clashes.length ? `<div class="ec-warn">⚠ ${clashes.length} paper${clashes.length === 1 ? '' : 's'} fall on a holiday: ${clashes.slice(0, 4).map(escapeHtml).join('; ')}${clashes.length > 4 ? '…' : ''}. You can still apply and adjust those dates afterwards.</div>` : ''}
      ${ec.dates === 'blank' ? `<div class="ec-warn">Dates are left empty — set each subject's date before generating hall tickets.</div>` : ''}
      <div class="ec-tblwrap"><table><thead><tr><th>Exam</th><th>Class</th><th>Now has</th><th>Action</th><th>Change</th></tr></thead><tbody>${line || '<tr><td colspan="5">Nothing to do.</td></tr>'}</tbody></table></div>
      <div class="ec-foot"><button class="btn btn-ghost" onclick="ec.step=2;ecRender()">← Back</button><button class="btn btn-primary" id="ecApplyBtn" onclick="ecApply()" ${changing.length ? '' : 'disabled'}>Copy subjects</button></div>`;
  }

  async function ecApply(){
    const rows = ecPlan().filter(r => r.action !== 'skip');
    if(!rows.length){ showToast('Nothing to copy.'); return; }
    if(rows.some(r => r.action === 'replace') && !await showConfirmDialog('Some classes will have their subject list replaced. Continue?')) return;
    const snapshot = JSON.stringify(examDefs);
    rows.forEach(r => {
      r.tgt.classSubjects = r.tgt.classSubjects || {};
      r.tgt.classSubjects[classSecKey(r.cls, r.sec)] = r.result;
    });
    const btn = document.getElementById('ecApplyBtn');
    if(btn){ btn.disabled = true; btn.textContent = 'Copying…'; }
    const ok = await storageSet(EXAM_DEFS_KEY, examDefs);
    if(ok === false){
      examDefs.splice(0, examDefs.length, ...JSON.parse(snapshot));
      showToast("Couldn't save — nothing was changed. Please try again.");
      if(btn){ btn.disabled = false; btn.textContent = 'Copy subjects'; }
      return;
    }
    const n = rows.reduce((s, r) => s + r.added, 0);
    const exams = ec.targetIds.length;
    closeExamCopyWizard();
    try{ renderExamBody(); }catch(e){}
    showToast(`Copied ${n} subject entr${n === 1 ? 'y' : 'ies'} into ${exams} exam${exams === 1 ? '' : 's'}.`, 'burst');
  }
