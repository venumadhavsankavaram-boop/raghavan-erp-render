/* ===== FEE STRUCTURE: Remittance Schedule panel =====
 *
 * Lets an admin choose, for each fee head, whether it is paid Yearly, in Terms
 * or Monthly, with period and due dates. Rendered under the class amounts table
 * on the Fee Structure screen (Manage Fee and Configuration share that screen).
 * All calculation lives in 04a-fee-schedule.js; this file is only the screen.
 *
 * Typing never re-renders the inputs (that would drop focus mid-edit): changes
 * update the draft and then refresh only the status, error and preview regions.
 */

let schedDraft = {};          // { [feeHeadKey]: categoryConfig } for the current academic year
let schedStash = {};          // { [feeHeadKey]: { [mode]: config } } so switching modes never loses edits
let schedDraftYear = '';
let schedPreviewClass = '';

function schedEditable(){ return canSub('managefee_structure', 'managefee', 'edit'); }
function schedClone(v){ return JSON.parse(JSON.stringify(v)); }
function schedSaved(){ return feeSchedule[currentAcademicYearValue] || {}; }

function schedInitDraft(){
  const saved = schedSaved();
  schedDraft = {};
  schedStash = {};
  Object.keys(CATS).forEach(cat => { schedDraft[cat] = saved[cat] ? schedClone(saved[cat]) : { mode: 'yearly', due: '' }; });
  schedDraftYear = currentAcademicYearValue;
}

function schedErrors(cat){ return validateCategorySchedule(schedDraft[cat], currentAcademicYearValue); }
function schedAllErrors(){ return Object.keys(CATS).flatMap(cat => schedErrors(cat).map(m => CATS[cat] + ': ' + m)); }
function schedIsDirty(){
  const saved = schedSaved();
  return Object.keys(CATS).some(cat => JSON.stringify(schedDraft[cat]) !== JSON.stringify(saved[cat] || { mode: 'yearly', due: '' }));
}

// Most recent earlier academic year that has a saved schedule, for "copy forward".
function schedPreviousYearWithSchedule(){
  return Object.keys(feeSchedule).filter(y => y < currentAcademicYearValue && Object.keys(feeSchedule[y] || {}).length).sort().pop() || '';
}

function schedAnnualFor(cat, cls){
  if(cat === 'hostel') return Number(financeSettings.hostel) || 0;
  return Number(classStruct(cls)[cat]) || 0;
}

/* ---------- Rendering ---------- */

function schedModeBody(cat, cfg, dis){
  if(cfg.mode === 'terms'){
    const rows = (cfg.terms || []).map((t, i) => `
      <div class="fsch-term">
        <label data-l="Term name"><input class="fsch-in" type="text" value="${escapeHtml(t.name || '')}" onchange="schedSetTermField('${cat}',${i},'name',this.value)" ${dis}></label>
        <label data-l="From"><input class="fsch-in" type="date" value="${t.from || ''}" onchange="schedSetTermField('${cat}',${i},'from',this.value)" ${dis}></label>
        <label data-l="To"><input class="fsch-in" type="date" value="${t.to || ''}" onchange="schedSetTermField('${cat}',${i},'to',this.value)" ${dis}></label>
        <label data-l="Due date"><input class="fsch-in" type="date" value="${t.due || ''}" onchange="schedSetTermField('${cat}',${i},'due',this.value)" ${dis}></label>
        <label data-l="Share %"><input class="fsch-in" type="number" min="0" max="100" step="0.01" value="${t.share}" onchange="schedSetTermField('${cat}',${i},'share',this.value)" ${dis}></label>
        ${dis ? '' : `<button type="button" class="btn-danger-text fsch-remove" title="Remove this term" onclick="schedRemoveTerm('${cat}',${i})" ${(cfg.terms || []).length <= 1 ? 'disabled' : ''}>Remove</button>`}
      </div>`).join('');
    return `
      <div class="fsch-term fsch-term-head" aria-hidden="true"><span>Term name</span><span>From</span><span>To</span><span>Due date</span><span>Share %</span><span></span></div>
      ${rows}
      ${dis ? '' : `<div class="fsch-term-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick="schedAddTerm('${cat}')">+ Add term</button>
        <button type="button" class="btn-edit-text" onclick="schedEvenShares('${cat}')">Split equally</button>
        <span id="fschShare-${cat}"></span>
      </div>`}`;
  }
  if(cfg.mode === 'monthly'){
    return `
      <div class="fsch-monthly">
        <label data-l="First month"><input class="fsch-in" type="month" placeholder="YYYY-MM" value="${cfg.startMonth || ''}" onchange="schedSetMonthly('${cat}','startMonth',this.value)" ${dis}></label>
        <label data-l="Number of months"><input class="fsch-in" type="number" min="1" max="12" value="${cfg.months}" onchange="schedSetMonthly('${cat}','months',this.value)" ${dis}></label>
        <label data-l="Due on day of month"><input class="fsch-in" type="number" min="1" max="28" value="${cfg.dueDay}" onchange="schedSetMonthly('${cat}','dueDay',this.value)" ${dis}></label>
      </div>
      <p class="fsch-hint">One equal installment per month, due on that day (1 to 28).</p>`;
  }
  return `
    <div class="fsch-monthly">
      <label data-l="Due date"><input class="fsch-in" type="date" value="${cfg.due || ''}" onchange="schedSetYearlyDue('${cat}',this.value)" ${dis}></label>
    </div>
    <p class="fsch-hint">The whole amount is due on this date. Left empty, the date from Late Fees is used.</p>`;
}

function schedCardHTML(cat, dis){
  const cfg = schedDraft[cat];
  const seg = Object.keys(SCHEDULE_MODES).map(mode => `
    <button type="button" class="${cfg.mode === mode ? 'on' : ''}" aria-pressed="${cfg.mode === mode}" onclick="schedSetMode('${cat}','${mode}')" ${dis}>${SCHEDULE_MODES[mode]}</button>`).join('');
  return `
    <div class="fsch-card">
      <div class="fsch-card-head">
        <h4><span class="cat-swatch" style="background:${CAT_COLORS[cat]}"></span>${CATS[cat]}</h4>
        <div class="fsch-seg" role="group" aria-label="${CATS[cat]} remittance">${seg}</div>
      </div>
      <div class="fsch-card-body">${schedModeBody(cat, cfg, dis)}</div>
      <ul class="fsch-errors" id="fschErr-${cat}"></ul>
    </div>`;
}

function schedShareHTML(cat){
  const cfg = schedDraft[cat];
  if(cfg.mode !== 'terms') return '';
  const total = round2((cfg.terms || []).reduce((a, t) => a + (Number(t.share) || 0), 0));
  const ok = Math.abs(total - 100) <= 0.01;
  return `<span class="fsch-sharetotal ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '⚠'} Shares total ${total}%</span>`;
}

function schedErrorsHTML(cat){
  return schedErrors(cat).map(m => `<li>${escapeHtml(m)}</li>`).join('');
}

function schedPreviewHTML(){
  const cls = schedPreviewClass;
  const blocks = Object.keys(CATS).map(cat => {
    const annual = schedAnnualFor(cat, cls);
    if(schedErrors(cat).length) return '';
    const cfg = schedDraft[cat];
    const insts = buildInstallments(cfg, annual, scheduleFallbackDue());
    const slots = scheduleSlots(cfg, scheduleFallbackDue());
    const rows = insts.map((i, k) => `
      <tr>
        <td>${escapeHtml(i.label)}</td>
        <td>${i.from && i.to ? fmtISODate(i.from) + ' – ' + fmtISODate(i.to) : '—'}</td>
        <td>${fmtISODate(i.due)}</td>
        <td>${round2(slots[k].share)}%</td>
        <td class="fsch-num">${annual > 0 ? fmtMoney(i.amount) : '—'}</td>
      </tr>`).join('');
    return `
      <div class="fsch-prev-block">
        <h5><span class="cat-swatch" style="background:${CAT_COLORS[cat]}"></span>${CATS[cat]} · ${SCHEDULE_MODES[cfg.mode] || 'Yearly'}${annual > 0 ? ' · ' + fmtMoney(annual) + ' a year' : ' · no amount set for this class'}</h5>
        <div class="table-wrap"><table>
          <thead><tr><th>Installment</th><th>Period</th><th>Due date</th><th>Share</th><th class="fsch-num">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }).join('');
  return blocks || `<p class="fsch-hint">Fix the problems above to see the preview.</p>`;
}

function schedStatusHTML(){
  const errors = schedAllErrors();
  const dirty = schedIsDirty();
  const canSave = dirty && errors.length === 0;
  const note = errors.length ? `<span class="fsch-note bad">${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before saving</span>`
    : dirty ? `<span class="fsch-note warn">Unsaved changes</span>`
    : `<span class="fsch-note ok">✓ Saved</span>`;
  return `<button type="button" class="btn btn-primary" onclick="saveFeeSchedule()" ${canSave ? '' : 'disabled'}>🗓️ Save Remittance Schedule</button> ${note}`;
}

// Updates only the regions that depend on the draft, leaving every input alone.
function schedRefresh(){
  Object.keys(CATS).forEach(cat => {
    const err = document.getElementById('fschErr-' + cat);
    if(err) err.innerHTML = schedErrorsHTML(cat);
    const share = document.getElementById('fschShare-' + cat);
    if(share) share.innerHTML = schedShareHTML(cat);
  });
  const preview = document.getElementById('fschPreview');
  if(preview) preview.innerHTML = schedPreviewHTML();
  const status = document.getElementById('fschStatus');
  if(status) status.innerHTML = schedStatusHTML();
}

function renderFeeSchedulePanel(){
  const host = document.getElementById('feeSchedulePanel');
  if(!host) return;
  if(schedDraftYear !== currentAcademicYearValue) schedInitDraft();
  const dis = schedEditable() ? '' : 'disabled';
  if(!schedPreviewClass || !CLASS_LEVELS.includes(schedPreviewClass)){
    schedPreviewClass = CLASS_LEVELS.find(c => (Number(classStruct(c).fee) || 0) > 0) || CLASS_LEVELS[0] || '';
  }
  const prevYear = !Object.keys(schedSaved()).length ? schedPreviousYearWithSchedule() : '';
  host.innerHTML = `
    <div class="fsch">
      <div class="fsch-head">
        <div>
          <h3>Remittance Schedule</h3>
          <p>Choose how each fee head is paid: all at once, in terms, or every month. Student Fees then shows the total due and what is due for each installment.</p>
        </div>
        <span class="ay-badge">AY ${escapeHtml(currentAcademicYearValue)}</span>
      </div>
      ${prevYear && !dis ? `<div class="fsch-banner">No schedule is saved for ${escapeHtml(currentAcademicYearValue)} yet. <button type="button" class="btn-edit-text" onclick="schedCopyFrom('${prevYear}')">Copy ${escapeHtml(prevYear)} forward</button> (dates move one year ahead; review them, then save).</div>` : ''}
      <div class="fsch-grid">${Object.keys(CATS).map(cat => schedCardHTML(cat, dis)).join('')}</div>
      <div class="fsch-preview-head">
        <h4>Preview</h4>
        <label>for class
          <select class="fsch-in" onchange="schedSetPreviewClass(this.value)">${CLASS_LEVELS.map(c => `<option ${c === schedPreviewClass ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
        </label>
      </div>
      <div id="fschPreview"></div>
      ${dis ? '' : `<div class="fsch-actions" id="fschStatus"></div>`}
    </div>`;
  schedRefresh();
}

/* ---------- Editing the draft ---------- */

function schedSetMode(cat, mode){
  const cur = schedDraft[cat];
  if(cur.mode === mode) return;
  schedStash[cat] = schedStash[cat] || {};
  schedStash[cat][cur.mode] = cur;
  let next = schedStash[cat][mode];
  if(!next){
    const ay = /^(\d{4})/.exec(currentAcademicYearValue);
    const year = ay ? ay[1] : String(new Date().getFullYear());
    next = mode === 'terms' ? defaultTermsConfig(currentAcademicYearValue)
      : mode === 'monthly' ? { mode: 'monthly', startMonth: year + '-06', months: 12, dueDay: 10 }
      : { mode: 'yearly', due: '' };
  }
  schedDraft[cat] = next;
  renderFeeSchedulePanel();
}
function schedSetYearlyDue(cat, v){ schedDraft[cat].due = v; schedRefresh(); }
function schedSetMonthly(cat, field, v){
  schedDraft[cat][field] = field === 'startMonth' ? v : (v === '' ? '' : Number(v));
  schedRefresh();
}
function schedSetTermField(cat, i, field, v){
  schedDraft[cat].terms[i][field] = field === 'share' ? (v === '' ? '' : Number(v)) : v;
  schedRefresh();
}
function schedAddTerm(cat){
  const terms = schedDraft[cat].terms;
  const n = terms.length + 1;
  const last = terms[terms.length - 1] || {};
  terms.push({ id: 't' + Date.now(), name: 'Term ' + n, from: '', to: '', due: last.due || '', share: 0 });
  renderFeeSchedulePanel();
}
function schedRemoveTerm(cat, i){
  const terms = schedDraft[cat].terms;
  if(terms.length <= 1) return;
  terms.splice(i, 1);
  renderFeeSchedulePanel();
}
function schedEvenShares(cat){
  const terms = schedDraft[cat].terms;
  evenShares(terms.length).forEach((s, i) => { terms[i].share = s; });
  renderFeeSchedulePanel();
}
function schedSetPreviewClass(cls){ schedPreviewClass = cls; schedRefresh(); }
function schedCopyFrom(prevYear){
  const years = (parseInt(currentAcademicYearValue, 10) || 0) - (parseInt(prevYear, 10) || 0);
  const source = feeSchedule[prevYear] || {};
  Object.keys(CATS).forEach(cat => { if(source[cat]) schedDraft[cat] = shiftScheduleYear(source[cat], years); });
  schedStash = {};
  renderFeeSchedulePanel();
}

async function saveFeeSchedule(){
  if(!schedEditable()){ showToast("You don't have permission to change the fee structure."); return; }
  const errors = schedAllErrors();
  if(errors.length){ showToast(errors[0]); return; }
  feeSchedule[currentAcademicYearValue] = schedClone(schedDraft);
  await storageSet(FEE_SCHEDULE_KEY, feeSchedule);
  showToast('Remittance schedule saved.', 'burst');
  renderFeeSchedulePanel();
}
