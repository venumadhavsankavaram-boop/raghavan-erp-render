  /* ===== GRADING SCHEMES — one place, one wizard =====================================
     Replaces the old "Grading Scale" + "Consolidation Scale" tabs. A scheme is a named set
     of grade bands (From % is the only number you type; the "To %" is derived, so bands can
     never overlap or leave gaps), a pass mark, how results are shown (marks / grades /
     both), optional grade points + remarks, and which classes it applies to.

     Compatibility: the DEFAULT scheme is mirrored into the legacy `gradingScale` (and,
     optionally, `consolidationScale`) keys, so Results Summary, Consolidated, Year-End and
     the Reports module keep working untouched. gradeForPct / isFailGrade /
     gradeForConsolPct are redefined here (removed from module 10 / 11). ===================== */
  const GRADING_SCHEMES_KEY = 'grading-schemes';
  OBJECT_BACKED_KEYS[GRADING_SCHEMES_KEY] = '/api/kv/' + GRADING_SCHEMES_KEY;
  let gradingSchemes = [];

  const GSW_PRESETS = [
    { key:'cbse9', name:'CBSE 9-point (A1–E2)', note:'Classes IX–X style, with grade points', passPct:33, display:'both', showGP:true, showRemarks:true,
      bands:[['A1',91,10,'Outstanding'],['A2',81,9,'Excellent'],['B1',71,8,'Very Good'],['B2',61,7,'Good'],['C1',51,6,'Above Average'],['C2',41,5,'Average'],['D',33,4,'Needs Practice'],['E1',21,0,'Needs Improvement'],['E2',0,0,'Needs Improvement']] },
    { key:'ap8', name:'AP / Telangana SSC 8-point', note:'A1–E with grade points, pass mark 35%', passPct:35, display:'both', showGP:true, showRemarks:false,
      bands:[['A1',92,10,''],['A2',84,9,''],['B1',75,8,''],['B2',67,7,''],['C1',59,6,''],['C2',51,5,''],['D',35,4,''],['E',0,0,'']] },
    { key:'school', name:'A1–E (current school scale)', note:'The 8-band scale this school already uses', passPct:33, display:'both', showGP:false, showRemarks:false,
      bands:[['A1',91,0,''],['A2',81,0,''],['B1',71,0,''],['B2',61,0,''],['C1',51,0,''],['C2',41,0,''],['D',33,0,''],['E',0,0,'']] },
    { key:'simple', name:'Simple A–E', note:'Five clear bands, easy for parents', passPct:33, display:'both', showGP:false, showRemarks:true,
      bands:[['A',80,0,'Excellent'],['B',60,0,'Good'],['C',40,0,'Satisfactory'],['D',33,0,'Needs Improvement'],['E',0,0,'Needs Improvement']] },
    { key:'plus', name:'A+ to D', note:'Letter grades with plus bands, pass 35%', passPct:35, display:'both', showGP:false, showRemarks:true,
      bands:[['A+',90,0,'Outstanding'],['A',75,0,'Excellent'],['B+',60,0,'Very Good'],['B',50,0,'Good'],['C',35,0,'Fair'],['D',0,0,'Needs Improvement']] },
    { key:'primary', name:'Grades only (primary)', note:'No marks shown, only grades and remarks', passPct:35, display:'grades', showGP:false, showRemarks:true,
      bands:[['A',85,0,'Outstanding'],['B',70,0,'Very Good'],['C',50,0,'Good'],['D',35,0,'Needs Practice'],['E',0,0,'Needs Support']] },
    { key:'blank', name:'Start from scratch', note:'Build your own bands', passPct:35, display:'both', showGP:false, showRemarks:false,
      bands:[['A',75,0,''],['B',50,0,''],['C',35,0,''],['D',0,0,'']] },
  ];

  function gswBandsFromPreset(arr){ return arr.map(b => ({ grade:b[0], minPct:b[1], gp:b[2], remark:b[3] })); }
  // sort high→low, derive maxPct, flag fail bands from passPct. Always returns fresh objects.
  function gswNormalizeBands(bands, passPct){
    const sorted = (bands || []).map(b => ({ grade:String(b.grade==null?'':b.grade).trim(), minPct:Number(b.minPct)||0, gp:(b.gp===''||b.gp==null||isNaN(Number(b.gp)))?0:Number(b.gp), remark:b.remark||'' }))
      .sort((a,b) => b.minPct - a.minPct);
    sorted.forEach((b,i) => {
      if(i === 0) b.maxPct = 100;
      else { const above = sorted[i-1].minPct; b.maxPct = Math.round((Number.isInteger(above) ? above-1 : above-0.1)*10)/10; }
      b.fail = b.minPct < Number(passPct);
    });
    return sorted;
  }
  function gswNormalizeScheme(sc){
    const out = {
      id: sc.id || ('gs_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),
      name: sc.name || 'Grading scheme',
      passPct: Number(sc.passPct)||0,
      display: ['both','marks','grades'].includes(sc.display) ? sc.display : 'both',
      showGP: !!sc.showGP, showRemarks: !!sc.showRemarks,
      classes: Array.isArray(sc.classes) ? sc.classes.slice() : [],
      isDefault: !!sc.isDefault, useForConsol: sc.useForConsol !== false,
    };
    out.bands = gswNormalizeBands(sc.bands, out.passPct);
    return out;
  }
  // The default scheme when none has been saved yet: derived live from the legacy scale, so
  // nothing changes for a school that never opens the wizard.
  function gswSeedFromLegacy(){
    const legacy = (typeof gradingScale !== 'undefined' && gradingScale.length) ? gradingScale : [];
    const bands = legacy.length ? legacy.map(g => ({ grade:g.grade, minPct:g.minPct, gp:0, remark:'' })) : gswBandsFromPreset(GSW_PRESETS[2].bands);
    const mins = bands.map(b => b.minPct).sort((a,b) => a-b);
    const pass = mins.length > 1 ? mins[1] : 33;
    return gswNormalizeScheme({ id:'gs_default', name:'School grading scale', bands, passPct:pass, isDefault:true });
  }
  function gswAllSchemes(){ return gradingSchemes.length ? gradingSchemes : [gswSeedFromLegacy()]; }
  function gswDefaultScheme(){ const all = gswAllSchemes(); return all.find(s => s.isDefault) || all[0]; }
  function gradingSchemeForClass(className){
    const all = gswAllSchemes();
    if(className){
      const own = all.find(s => !s.isDefault && s.classes.includes(className));
      if(own) return own;
    }
    return gswDefaultScheme();
  }
  function gradeInfoForPct(pct, className){
    const sc = gradingSchemeForClass(className);
    const p = Number(pct);
    if(!sc || !sc.bands.length || isNaN(p)) return { grade:'—', gp:0, remark:'', fail:false, scheme:sc };
    const band = sc.bands.find(b => p >= b.minPct) || sc.bands[sc.bands.length-1];
    return { grade:band.grade, gp:band.gp, remark:band.remark, fail:!!band.fail, scheme:sc };
  }
  function gradeForPct(pct, className){ return gradeInfoForPct(pct, className).grade; }
  function isFailGrade(grade){
    const all = gswAllSchemes();
    const order = [gswDefaultScheme()].concat(all.filter(s => !s.isDefault));
    for(const sc of order){
      const b = sc.bands.find(x => x.grade === grade);
      if(b) return !!b.fail;
    }
    return false;
  }
  // Combined / year-end results: same threshold lookup (no gaps), using the mirrored consolidationScale.
  function gradeForConsolPct(pct){
    const list = (consolidationScale || []).slice().sort((a,b) => b.minPct - a.minPct);
    if(!list.length) return gradeForPct(pct);
    const band = list.find(g => Number(pct) >= g.minPct);
    return band ? band.grade : list[list.length-1].grade;
  }

  async function gswLoadSchemes(){
    const raw = await storageGet(GRADING_SCHEMES_KEY, []);
    gradingSchemes = Array.isArray(raw) ? raw.map(gswNormalizeScheme) : [];
    if(gradingSchemes.length && !gradingSchemes.some(s => s.isDefault)) gradingSchemes[0].isDefault = true;
  }
  const gswOrigLoadExams = loadExams;
  loadExams = async function(){ await gswOrigLoadExams(); try{ await gswLoadSchemes(); }catch(e){ gradingSchemes = []; } };

  async function gswPersist(){
    await storageSet(GRADING_SCHEMES_KEY, gradingSchemes);
    const def = gswDefaultScheme();
    gradingScale = def.bands.map(b => ({ grade:b.grade, minPct:b.minPct, maxPct:b.maxPct }));
    await storageSet(GRADING_SCALE_KEY, gradingScale);
    if(def.useForConsol){
      consolidationScale = gradingScale.map(b => ({ ...b }));
      await storageSet(CONSOLIDATION_SCALE_KEY, consolidationScale);
    }
  }

  /* ---------- UI ---------- */
  let gswView = 'list', gswStep = 1, gswDraft = null, gswEditingId = '';
  const GSW_STEPS = ['Start from', 'Grades & pass mark', 'How results show'];

  function gswChipStyle(i, n){
    const h = n <= 1 ? 140 : Math.round(140 * (1 - i/(n-1)));
    return `background:hsl(${h} 60% 45% / .16); border-left:3px solid hsl(${h} 60% 42%);`;
  }
  function gswBandChips(sc){
    return sc.bands.map((b,i) => `<span class="gsw-chip" style="${gswChipStyle(i, sc.bands.length)}" title="${escapeHtml(b.grade)}: ${b.minPct}–${b.maxPct}%${b.fail?' (fail)':''}"><b>${escapeHtml(b.grade)}</b> ${b.minPct}%+${b.fail?' <em>fail</em>':''}</span>`).join('');
  }
  function gswDisplayLabel(d){ return d === 'grades' ? 'Grades only' : d === 'marks' ? 'Marks only' : 'Marks + grade'; }

  function renderGradingScaleTab(body){
    if(gswView === 'wizard') return gswRenderWizard(body);
    const all = gswAllSchemes();
    const seeded = !gradingSchemes.length;
    body.innerHTML = `
      <div class="gsw-head">
        <div>
          <h3>Grading</h3>
          <p>One grading setup for every report, result and year-end card. Subject-wise grades on Progress Reports come from here.</p>
        </div>
        ${sfBtn('primary','plus','New grading scheme','gswStartNew()')}
      </div>
      <div class="gsw-grid">
        ${all.map(sc => `
          <div class="sf-card gsw-card ${sc.isDefault?'is-default':''}">
            <div class="gsw-card-top">
              <b>${escapeHtml(sc.name)}</b>
              ${sc.isDefault ? '<span class="sf-badge sf-badge--paid">Default</span>' : `<span class="pill">${sc.classes.length ? escapeHtml(sc.classes.join(', ')) : 'No classes'}</span>`}
            </div>
            <div class="gsw-chips">${gswBandChips(sc)}</div>
            <div class="gsw-meta">Pass mark <b>${sc.passPct}%</b> · ${gswDisplayLabel(sc.display)}${sc.showGP?' · Grade points':''}${sc.showRemarks?' · Remarks':''}</div>
            <div class="gsw-actions">
              ${sfBtn('soft','','Edit',`gswEdit('${sc.id}')`, seeded?'':'')}
              ${!sc.isDefault && !seeded ? sfBtn('link','','Make default',`gswMakeDefault('${sc.id}')`) : ''}
              ${!seeded ? sfBtn('link','','Duplicate',`gswDuplicate('${sc.id}')`) : ''}
              ${!sc.isDefault && !seeded ? sfBtn('danger','','Delete',`gswDelete('${sc.id}')`) : ''}
            </div>
          </div>`).join('')}
      </div>
      ${seeded ? `<p class="gsw-note">This is your current scale. Press <b>Edit</b> to customise it with the wizard (presets for CBSE, AP/Telangana SSC and more).</p>` : ''}
      <div class="sf-card gsw-test">
        <b>Try it</b>
        <span>Type a percentage to see what each scheme gives:</span>
        <input type="number" class="input" id="gswTestPct" min="0" max="100" placeholder="e.g. 72" oninput="gswTestPaint()" style="max-width:110px;">
        <div id="gswTestOut" class="gsw-test-out"></div>
      </div>
    `;
    gswTestPaint();
  }
  function gswTestPaint(){
    const el = document.getElementById('gswTestPct'), out = document.getElementById('gswTestOut');
    if(!el || !out) return;
    if(el.value === ''){ out.innerHTML = ''; return; }
    const p = Number(el.value);
    out.innerHTML = gswAllSchemes().map(sc => {
      const band = sc.bands.find(b => p >= b.minPct) || sc.bands[sc.bands.length-1];
      return `<span class="gsw-chip"><b>${escapeHtml(sc.name)}</b> → ${escapeHtml(band.grade)}${sc.showGP?` (GP ${band.gp})`:''}${band.fail?' · <em>fail</em>':''}</span>`;
    }).join('');
  }

  function gswStartNew(){
    gswEditingId = '';
    gswDraft = { name:'', presetKey:'', bands:[], passPct:35, display:'both', showGP:false, showRemarks:false, classes:[], isDefault:false, useForConsol:true };
    gswStep = 1; gswView = 'wizard';
    renderResultBody();
  }
  function gswEdit(id){
    const sc = gswAllSchemes().find(s => s.id === id);
    if(!sc) return;
    gswEditingId = sc.id;
    gswDraft = { ...JSON.parse(JSON.stringify(sc)), presetKey:'custom' };
    gswStep = 2; gswView = 'wizard';
    renderResultBody();
  }
  async function gswMakeDefault(id){
    gradingSchemes.forEach(s => { s.isDefault = s.id === id; });
    await gswPersist();
    showToast('Default grading scheme updated.', 'burst');
    renderGradingScaleTab(document.getElementById('resultBody'));
  }
  async function gswDuplicate(id){
    const src = gswAllSchemes().find(s => s.id === id);
    if(!src) return;
    if(!gradingSchemes.length) gradingSchemes = [src];
    const copy = gswNormalizeScheme({ ...JSON.parse(JSON.stringify(src)), id:'', name:src.name+' (copy)', isDefault:false, classes:[] });
    gradingSchemes.push(copy);
    await gswPersist();
    showToast('Scheme duplicated — assign its classes with Edit.', 'burst');
    renderGradingScaleTab(document.getElementById('resultBody'));
  }
  async function gswDelete(id){
    if(!await showConfirmDialog('Delete this grading scheme? Its classes will use the default scheme.')) return;
    gradingSchemes = gradingSchemes.filter(s => s.id !== id);
    await gswPersist();
    renderGradingScaleTab(document.getElementById('resultBody'));
  }
  function gswCancel(){
    gswView = 'list'; gswDraft = null;
    window.scrollTo({top:0,left:0,behavior:'instant'});
    renderResultBody();
  }
  function gswPickPreset(key){
    const p = GSW_PRESETS.find(x => x.key === key);
    if(!p) return;
    gswDraft.presetKey = key;
    gswDraft.bands = gswBandsFromPreset(p.bands);
    gswDraft.passPct = p.passPct; gswDraft.display = p.display; gswDraft.showGP = p.showGP; gswDraft.showRemarks = p.showRemarks;
    if(!gswDraft.name.trim() || gswDraft.nameFromPreset) { gswDraft.name = p.name; gswDraft.nameFromPreset = true; }
    gswRenderWizard(document.getElementById('resultBody'));
  }
  function gswStepper(){
    return `<div class="gsw-steps">${GSW_STEPS.map((t,i) => `<div class="gsw-step ${gswStep===i+1?'on':''} ${gswStep>i+1?'done':''}"><i>${gswStep>i+1?'✓':i+1}</i><span>${t}</span></div>`).join('')}</div>`;
  }
  function gswRenderWizard(body){
    const d = gswDraft;
    let inner = '';
    if(gswStep === 1){
      inner = `
        <div class="f-field" style="max-width:420px; margin-bottom:16px;"><label>Scheme name <span class="required-star">*</span></label>
          <input type="text" class="input" id="gswName" value="${escapeHtml(d.name)}" placeholder="e.g. Classes 9–10, Primary, Senior" oninput="gswDraft.name=this.value; gswDraft.nameFromPreset=false;"></div>
        <label class="gsw-label">Pick a starting point — you can change everything on the next step</label>
        <div class="gsw-presets">
          ${GSW_PRESETS.map(p => `<button type="button" class="gsw-preset ${d.presetKey===p.key?'on':''}" onclick="gswPickPreset('${p.key}')">
            <b>${p.name}</b><span>${p.note}</span>
            <div class="gsw-chips">${gswBandChips(gswNormalizeScheme({ bands:gswBandsFromPreset(p.bands), passPct:p.passPct }))}</div>
          </button>`).join('')}
        </div>`;
    }
    if(gswStep === 2){
      inner = `
        <div class="gsw-pass">
          <div class="f-field"><label>Pass mark (%)</label>
            <input type="number" class="input" id="gswPass" min="1" max="100" value="${d.passPct}" onchange="gswSetPass(this.value)" style="max-width:110px;"></div>
          <p>A student fails a subject when the percentage is below the pass mark. Bands that start below it are marked <b>Fail</b> automatically.</p>
        </div>
        <div id="gswBandsBox"></div>
        <div style="margin-top:10px;">${sfBtn('soft','plus','Add grade','gswAddBand()')}</div>`;
    }
    if(gswStep === 3){
      const classOpts = (typeof CLASS_LEVELS !== 'undefined' ? CLASS_LEVELS : []);
      inner = `
        <div class="gsw-cols">
          <div>
            <label class="gsw-label">Show on reports</label>
            <label class="gsw-radio"><input type="radio" name="gswDisp" value="both" ${d.display==='both'?'checked':''} onchange="gswDraft.display='both'; gswPaintPreview()"> Marks and grade <small>Typical for classes 6–10</small></label>
            <label class="gsw-radio"><input type="radio" name="gswDisp" value="marks" ${d.display==='marks'?'checked':''} onchange="gswDraft.display='marks'; gswPaintPreview()"> Marks only <small>No grade column</small></label>
            <label class="gsw-radio"><input type="radio" name="gswDisp" value="grades" ${d.display==='grades'?'checked':''} onchange="gswDraft.display='grades'; gswPaintPreview()"> Grades only <small>Hides marks, good for primary</small></label>
            <label class="gsw-check"><input type="checkbox" ${d.showGP?'checked':''} onchange="gswDraft.showGP=this.checked; gswPaintPreview()"> Show grade points and overall GPA</label>
            <label class="gsw-check"><input type="checkbox" ${d.showRemarks?'checked':''} onchange="gswDraft.showRemarks=this.checked; gswPaintPreview()"> Show grade remark (e.g. “Outstanding”)</label>
            <label class="gsw-label" style="margin-top:16px;">Applies to</label>
            ${d.isDefault ? `<p class="gsw-hint">This is the <b>default</b> scheme: it covers every class that has no scheme of its own.</p>` : `
              <div class="gsw-classes">${classOpts.map(c => `<label class="gsw-check"><input type="checkbox" value="${escapeHtml(c)}" ${d.classes.includes(c)?'checked':''} onchange="gswToggleClass(this.value, this.checked)"> ${escapeHtml(c)}</label>`).join('')}</div>
              <p class="gsw-hint">Classes ticked here use this scheme instead of the default.</p>`}
            ${!d.isDefault ? `<label class="gsw-check"><input type="checkbox" onchange="gswDraft.isDefault=this.checked; gswRenderWizard(document.getElementById('resultBody'))"> Make this the default scheme</label>` : ''}
            ${d.isDefault ? `<label class="gsw-check"><input type="checkbox" ${d.useForConsol?'checked':''} onchange="gswDraft.useForConsol=this.checked"> Also use for combined / year-end results</label>` : ''}
          </div>
          <div>
            <label class="gsw-label">Preview</label>
            <div id="gswPreview" class="sf-card"></div>
          </div>
        </div>`;
    }
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="gswCancel()">Grading</a> &nbsp;/&nbsp; ${gswEditingId ? 'Edit scheme' : 'New scheme'}</div>
      ${gswStepper()}
      <div class="sf-card gsw-wiz">${inner}</div>
      <div class="gsw-foot">
        ${sfBtn('link','','Cancel','gswCancel()')}
        <span style="flex:1"></span>
        ${gswStep>1 && !(gswEditingId && gswStep===2) ? sfBtn('soft','','Back','gswBack()') : ''}
        ${gswStep<3 ? sfBtn('primary','open','Next','gswNext()') : sfBtn('primary','check','Save grading scheme','gswSave()')}
      </div>`;
    if(gswStep === 2) gswPaintBands();
    if(gswStep === 3) gswPaintPreview();
  }
  function gswToggleClass(c, on){
    gswDraft.classes = gswDraft.classes.filter(x => x !== c);
    if(on) gswDraft.classes.push(c);
  }
  function gswSetPass(v){ gswDraft.passPct = Number(v)||0; gswPaintBands(); }
  function gswBandIssues(){
    const d = gswDraft, issues = [];
    const named = d.bands.filter(b => String(b.grade).trim());
    if(d.bands.length < 2) issues.push('Add at least two grades.');
    if(d.bands.some(b => !String(b.grade).trim())) issues.push('Every band needs a grade name.');
    const names = named.map(b => String(b.grade).trim().toLowerCase());
    if(new Set(names).size !== names.length) issues.push('Grade names must be unique.');
    const mins = d.bands.map(b => Number(b.minPct));
    if(mins.some(m => isNaN(m) || m < 0 || m > 100)) issues.push('“From %” must be between 0 and 100.');
    if(new Set(mins).size !== mins.length) issues.push('Two grades start at the same percentage.');
    if(d.bands.length && !mins.includes(0)) issues.push('The lowest grade must start at 0%.');
    if(!(Number(d.passPct) > 0 && Number(d.passPct) <= 100)) issues.push('Enter a pass mark between 1 and 100.');
    else if(d.bands.length && !mins.includes(Number(d.passPct))) issues.push(`Pass mark ${d.passPct}% should be where a grade begins (e.g. ${mins.filter(m => m>0).sort((a,b)=>a-b).slice(0,3).join('%, ')}%).`);
    return issues;
  }
  function gswPaintBands(){
    const box = document.getElementById('gswBandsBox');
    if(!box) return;
    const d = gswDraft;
    const norm = gswNormalizeBands(d.bands, d.passPct);
    // keep draft in the same order the table shows
    const rows = norm.map((b,i) => `<tr>
      <td><input type="text" class="input" value="${escapeHtml(b.grade)}" maxlength="6" onchange="gswBandEdit(${i},'grade',this.value)" style="max-width:80px;"></td>
      <td><input type="number" class="input" value="${b.minPct}" min="0" max="100" step="0.5" onchange="gswBandEdit(${i},'minPct',this.value)" style="max-width:90px;"></td>
      <td class="gsw-to">${b.maxPct}%</td>
      <td><input type="number" class="input" value="${b.gp}" min="0" max="10" step="0.5" onchange="gswBandEdit(${i},'gp',this.value)" style="max-width:76px;"></td>
      <td><input type="text" class="input" value="${escapeHtml(b.remark)}" placeholder="optional" onchange="gswBandEdit(${i},'remark',this.value)"></td>
      <td>${b.fail ? '<span class="sf-badge sf-badge--overdue">Fail</span>' : '<span class="sf-badge sf-badge--paid">Pass</span>'}</td>
      <td><button class="btn-danger-text" onclick="gswRemoveBand(${i})" title="Remove">✕</button></td>
    </tr>`).join('');
    d.bands = norm.map(b => ({ grade:b.grade, minPct:b.minPct, gp:b.gp, remark:b.remark }));
    const issues = gswBandIssues();
    box.innerHTML = `
      <div class="table-wrap"><table class="gsw-table">
        <thead><tr><th>Grade</th><th>From %</th><th>To %</th><th>Grade point</th><th>Remark</th><th>Result</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="gsw-issues ${issues.length?'bad':'ok'}">${issues.length ? issues.map(x => `<div>⚠ ${x}</div>`).join('') : '✓ Bands cover 0–100% with no gaps or overlaps.'}</div>`;
  }
  function gswBandEdit(i, field, val){
    const b = gswDraft.bands[i];
    if(!b) return;
    if(field === 'minPct' || field === 'gp') b[field] = val === '' ? 0 : Number(val);
    else b[field] = val;
    gswPaintBands();
  }
  function gswAddBand(){
    const mins = gswDraft.bands.map(b => b.minPct);
    let m = 0; for(let c = 5; c < 100; c += 5){ if(!mins.includes(c)){ m = c; break; } }
    gswDraft.bands.push({ grade:'', minPct:m, gp:0, remark:'' });
    gswPaintBands();
  }
  function gswRemoveBand(i){
    gswDraft.bands.splice(i,1);
    gswPaintBands();
  }
  function gswPaintPreview(){
    const el = document.getElementById('gswPreview');
    if(!el) return;
    const d = gswNormalizeScheme({ ...gswDraft, id:'x' });
    const subs = [['English',96],['Mathematics',84],['Science',67],['Social Studies',45],['Hindi',28]];
    const rows = subs.map(([n,m]) => {
      const b = d.bands.find(x => m >= x.minPct) || d.bands[d.bands.length-1];
      return { n, m, b };
    });
    const gpa = rows.reduce((s,r) => s + r.b.gp, 0) / rows.length;
    const showMarks = d.display !== 'grades', showGrade = d.display !== 'marks';
    el.innerHTML = `
      <table class="gsw-prev"><thead><tr><th>Subject</th>${showMarks?'<th>Marks</th>':''}${showGrade?'<th>Grade</th>':''}${d.showGP?'<th>GP</th>':''}${d.showRemarks?'<th>Remark</th>':''}</tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.b.fail?'fail':''}"><td>${r.n}</td>${showMarks?`<td>${r.m}/100</td>`:''}${showGrade?`<td><b>${escapeHtml(r.b.grade)}</b></td>`:''}${d.showGP?`<td>${r.b.gp}</td>`:''}${d.showRemarks?`<td>${escapeHtml(r.b.remark)||'—'}</td>`:''}</tr>`).join('')}</tbody></table>
      <div class="gsw-prev-sum">${d.showGP ? `GPA <b>${gpa.toFixed(1)}</b> · ` : ''}Result: <b>${rows.some(r => r.b.fail) ? 'FAIL (1 subject)' : 'PASS'}</b></div>
      <small>Sample data, only to show the layout.</small>`;
  }
  function gswBack(){ gswStep = Math.max(1, gswStep-1); renderResultBody(); }
  function gswNext(){
    if(gswStep === 1){
      if(!String(gswDraft.name||'').trim()){ showToast('Give the scheme a name.'); return; }
      if(!gswDraft.bands.length){ showToast('Pick a starting point.'); return; }
    }
    if(gswStep === 2){
      const issues = gswBandIssues();
      if(issues.length){ showToast(issues[0]); return; }
    }
    gswStep = Math.min(3, gswStep+1);
    renderResultBody();
  }
  async function gswSave(){
    const issues = gswBandIssues();
    if(issues.length){ showToast(issues[0]); gswStep = 2; renderResultBody(); return; }
    if(!String(gswDraft.name||'').trim()){ showToast('Give the scheme a name.'); gswStep = 1; renderResultBody(); return; }
    const sc = gswNormalizeScheme({ ...gswDraft, id: gswEditingId || '' });
    if(!sc.isDefault && sc.classes.length === 0 && !await showConfirmDialog('No classes are ticked, so this scheme will not be used anywhere yet. Save anyway?')) return;
    // a class can belong to one non-default scheme only
    gradingSchemes.forEach(o => { if(o.id !== sc.id && !o.isDefault) o.classes = o.classes.filter(c => !sc.classes.includes(c)); });
    if(!gradingSchemes.length && gswEditingId !== 'gs_default') gradingSchemes = [gswSeedFromLegacy()];
    const idx = gradingSchemes.findIndex(s => s.id === sc.id);
    if(idx >= 0) gradingSchemes[idx] = sc; else gradingSchemes.push(sc);
    if(sc.isDefault) gradingSchemes.forEach(o => { o.isDefault = o.id === sc.id; });
    if(!gradingSchemes.some(s => s.isDefault)) gradingSchemes[0].isDefault = true;
    await gswPersist();
    showToast('Grading scheme saved.', 'burst');
    gswView = 'list'; gswDraft = null;
    window.scrollTo({top:0,left:0,behavior:'instant'});
    renderResultBody();
  }
