/* ===== Fee Structure + Promotions: presentation layer (22i) =====
 *
 * Loads after modules 22 and 23, so these declarations replace the older
 * renderFeeStructureTab() and renderPromotionsTab(). Presentation only:
 *   - Fee Structure keeps every .fs-input (data-class / data-field), #fsHostel,
 *     #feeSchedulePanel and the onclick="saveFeeStructure()" handler untouched.
 *   - Promotions keeps onclick="promoteClass('<class>')" as the only action that
 *     changes data; everything else on the page is read-only preview.
 * All new globals use the fpx prefix.
 */

/* ---------- shared helpers ---------- */
function fpxJs(s){ return escapeHtml(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function fpxPlural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function fpxEmpty(title, text){ return `<div class="fpx-empty"><b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>`; }

/* ============================================================
   FEE STRUCTURE
   ============================================================ */
let fpxFsSel = '';        // selected class, or '__all__'
let fpxFsHost = null;     // element the screen is rendered into (two callers pass different bodies)
let fpxFsEditable = false;

const FPX_FS_HEADS = [
  { key:'admission', label:'Admission fee', hint:'New admissions only',        tone:'gold'    },
  { key:'fee',       label:'Tuition fee',   hint:'Every active student',       tone:'navy'    },
  { key:'bus',       label:'Bus fee',       hint:'Students who use transport', tone:'teal'    },
  { key:'stock',     label:'Stock',         hint:'Every active student',       tone:'magenta' },
];

function fpxFsCards(){ return fpxFsHost ? Array.from(fpxFsHost.querySelectorAll('.fpx-fs-card')) : []; }
function fpxFsVals(card){
  const v = {};
  FPX_FS_HEADS.forEach(h => {
    const inp = card.querySelector(`.fs-input[data-field="${h.key}"]`);
    v[h.key] = inp ? (Number(inp.value) || 0) : 0;
  });
  v.total = FPX_FS_HEADS.reduce((a, h) => a + v[h.key], 0);
  return v;
}
function fpxFsCardDirty(card){
  const cls = card.dataset.fpxClass;
  const saved = classStruct(cls);
  return FPX_FS_HEADS.filter(h => {
    const inp = card.querySelector(`.fs-input[data-field="${h.key}"]`);
    return inp && (Number(inp.value) || 0) !== (Number(saved[h.key]) || 0);
  }).length;
}

function fpxFsKpiHtml(){
  const cards = fpxFsCards();
  const hostelEl = document.getElementById('fsHostel');
  const hostel = hostelEl ? (Number(hostelEl.value) || 0) : (Number(financeSettings.hostel) || 0);
  if(fpxFsSel && fpxFsSel !== '__all__'){
    const card = cards.find(c => c.dataset.fpxClass === fpxFsSel);
    if(card){
      const v = fpxFsVals(card);
      return sfKpi('Total per student', fmtMoney(v.total), v.total > 0 ? 'good' : 'warn', v.total > 0 ? 'if every head applies' : 'no amounts set yet')
        + FPX_FS_HEADS.map(h => sfKpi(h.label, fmtMoney(v[h.key]), 'plain', h.hint)).join('');
    }
  }
  const totals = cards.map(c => fpxFsVals(c).total);
  const priced = totals.filter(t => t > 0);
  return sfKpi('Classes priced', `${priced.length} of ${cards.length}`, priced.length === cards.length ? 'good' : 'warn', priced.length === cards.length ? 'every class has fees' : (cards.length - priced.length) + ' still empty')
    + sfKpi('Lowest total', priced.length ? fmtMoney(Math.min(...priced)) : '—', 'plain', 'per student, all heads')
    + sfKpi('Highest total', priced.length ? fmtMoney(Math.max(...priced)) : '—', 'plain', 'per student, all heads')
    + sfKpi('Hostel (flat)', fmtMoney(hostel), 'plain', 'annual expected total');
}

// Updates totals, bars, badges, KPIs and the save bar from the live inputs. Never touches the inputs.
function fpxFsRefresh(){
  if(!fpxFsHost) return;
  let dirtyFields = 0, dirtyClasses = 0;
  fpxFsCards().forEach(card => {
    const v = fpxFsVals(card);
    const n = fpxFsCardDirty(card);
    dirtyFields += n; if(n) dirtyClasses++;
    card.classList.toggle('is-dirty', n > 0);
    const tot = card.querySelector('[data-fpx-total]'); if(tot) tot.textContent = fmtMoney(v.total);
    const badge = card.querySelector('[data-fpx-badge]');
    if(badge){
      badge.className = 'sf-badge fpx-fs-badge ' + (n ? 'sf-badge--upcoming' : (v.total > 0 ? 'sf-badge--paid' : 'sf-badge--due'));
      badge.textContent = n ? 'Unsaved' : (v.total > 0 ? 'Saved' : 'Not set');
    }
    FPX_FS_HEADS.forEach(h => {
      const seg = card.querySelector(`[data-fpx-seg="${h.key}"]`);
      if(seg) seg.style.width = (v.total > 0 ? (v[h.key] / v.total * 100) : 0) + '%';
    });
    const chip = fpxFsHost.querySelector(`.fpx-chip[data-fpx-class="${CSS.escape(card.dataset.fpxClass)}"]`);
    if(chip){ chip.classList.toggle('is-dirty', n > 0); chip.classList.toggle('is-empty', v.total <= 0); }
  });
  const hostelEl = document.getElementById('fsHostel');
  const hostelDirty = hostelEl && (Number(hostelEl.value) || 0) !== (Number(financeSettings.hostel) || 0);
  if(hostelDirty) dirtyFields++;
  const hc = document.getElementById('fpxFsHostelCard'); if(hc) hc.classList.toggle('is-dirty', !!hostelDirty);
  const kp = document.getElementById('fpxFsKpis'); if(kp) kp.innerHTML = fpxFsKpiHtml();
  const bar = document.getElementById('fpxFsBar');
  if(bar){
    bar.classList.toggle('is-dirty', dirtyFields > 0);
    const st = document.getElementById('fpxFsState');
    if(st) st.innerHTML = dirtyFields
      ? `<b>${fpxPlural(dirtyFields, 'unsaved change')}</b><small>${dirtyClasses ? 'in ' + fpxPlural(dirtyClasses, 'class', 'classes') : ''}${dirtyClasses && hostelDirty ? ' and ' : ''}${hostelDirty ? 'hostel total' : ''}</small>`
      : `<b>All changes saved</b><small>Edit any amount to begin</small>`;
    const dc = document.getElementById('fpxFsDiscard'); if(dc) dc.disabled = !dirtyFields;
  }
}

function fpxFsInput(){ fpxFsRefresh(); }

function fpxFsSelect(cls){
  fpxFsSel = cls;
  if(!fpxFsHost) return;
  fpxFsHost.querySelectorAll('.fpx-chip').forEach(c => {
    const on = c.dataset.fpxClass === cls;
    c.classList.toggle('active', on); c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const grid = fpxFsHost.querySelector('.fpx-fs-cards');
  if(grid) grid.classList.toggle('is-all', cls === '__all__');
  fpxFsCards().forEach(card => { card.hidden = !(cls === '__all__' || card.dataset.fpxClass === cls); });
  fpxFsRefresh();
}

function fpxFsDiscard(){ if(fpxFsHost) renderFeeStructureTab(fpxFsHost); }

function fpxFsCardHtml(c, dis){
  const s = classStruct(c);
  const fields = FPX_FS_HEADS.map(h => `
    <label class="fpx-fs-field">
      <span class="fpx-fs-lbl"><i class="fpx-dot fpx-dot--${h.tone}" aria-hidden="true"></i>${h.label}</span>
      <span class="fpx-money"><em aria-hidden="true">₹</em><input type="number" min="0" inputmode="numeric" class="input fs-input fpx-in" data-class="${escapeHtml(c)}" data-field="${h.key}" value="${s[h.key] || 0}" oninput="fpxFsInput()" aria-label="${escapeHtml(c)} ${h.label}" ${dis}></span>
      <small>${h.hint}</small>
    </label>`).join('');
  const total = FPX_FS_HEADS.reduce((a, h) => a + (Number(s[h.key]) || 0), 0);
  return `
    <section class="sf-card fpx-fs-card" data-fpx-class="${escapeHtml(c)}" ${fpxFsSel === '__all__' || fpxFsSel === c ? '' : 'hidden'}>
      <header class="fpx-fs-head"><h4>${escapeHtml(c)}</h4><span data-fpx-badge class="sf-badge fpx-fs-badge"></span></header>
      <div class="fpx-fs-fields">${fields}</div>
      <div class="fpx-fs-split" role="img" aria-label="Share of each fee head in the total">${FPX_FS_HEADS.map(h => `<i class="fpx-seg fpx-seg--${h.tone}" data-fpx-seg="${h.key}" style="width:${total > 0 ? ((Number(s[h.key]) || 0) / total * 100) : 0}%"></i>`).join('')}</div>
      <div class="fpx-fs-total"><span>Total per student, per year</span><b data-fpx-total>${fmtMoney(total)}</b></div>
    </section>`;
}

function renderFeeStructureTab(body){
  const canEditStruct = canSub('managefee_structure','managefee','edit');
  const dis = canEditStruct ? '' : 'disabled';
  // The setup page and Manage Fee both render this screen. A stale copy left in the other host
  // would duplicate .fs-input / #fsHostel / #feeSchedulePanel and make save read the wrong values.
  ['feeStructureSetupBody', 'feeBody'].forEach(id => {
    const other = document.getElementById(id);
    if(other && other !== body && other.querySelector('.fpx-fs-card, .fs-input')) other.innerHTML = '';
  });
  fpxFsHost = body;
  fpxFsEditable = !!canEditStruct;
  if(fpxFsSel !== '__all__' && !CLASS_LEVELS.includes(fpxFsSel)){
    fpxFsSel = CLASS_LEVELS.find(c => { const s = classStruct(c); return (Number(s.fee) || 0) > 0; }) || CLASS_LEVELS[0] || '__all__';
  }
  const chips = [`<button type="button" class="fpx-chip fpx-chip--all" data-fpx-class="__all__" onclick="fpxFsSelect('__all__')">All classes</button>`]
    .concat(CLASS_LEVELS.map(c => `<button type="button" class="fpx-chip" data-fpx-class="${escapeHtml(c)}" onclick="fpxFsSelect('${fpxJs(c)}')">${escapeHtml(c)}</button>`)).join('');
  body.innerHTML = `
    <div class="fpx">
      <p class="fpx-note">Set the per-student yearly amount for Admission Fee, Tuition Fee, Bus Fee and Stock for each class. The Dashboard's Expected totals are computed automatically: Admission Fee applies only to students marked "New Admission"; Tuition Fee &amp; Stock apply to every active student in a class; Bus Fee applies only to students marked as needing transport.${canEditStruct ? '' : ' <span class="sf-badge sf-badge--due fpx-view-only">View only</span>'}</p>
      <section class="sf-kpis fpx-kpis" id="fpxFsKpis"></section>
      <div class="fpx-chips" role="group" aria-label="Choose a class">${chips}</div>
      <div class="fpx-fs-cards">${CLASS_LEVELS.map(c => fpxFsCardHtml(c, dis)).join('')}</div>
      <section class="sf-card fpx-hostel" id="fpxFsHostelCard">
        <div>
          <h4>Hostel: annual expected total</h4>
          <p>Hostel isn't tracked per-student yet, so this stays a single flat total until the Hostel module exists. It applies to the whole school, not to one class.</p>
        </div>
        <span class="fpx-money fpx-money--lg"><em aria-hidden="true">₹</em><input type="number" min="0" inputmode="numeric" class="input fpx-in" id="fsHostel" value="${financeSettings.hostel || 0}" oninput="fpxFsInput()" aria-label="Hostel annual expected total" ${dis}></span>
      </section>
      ${canEditStruct ? `
      <div class="fpx-savebar" id="fpxFsBar">
        <div class="fpx-savebar-state" id="fpxFsState" aria-live="polite"></div>
        <div class="fpx-savebar-actions">
          <button type="button" class="sf-btn sf-btn--soft" id="fpxFsDiscard" onclick="fpxFsDiscard()">Discard changes</button>
          <button type="button" class="sf-btn sf-btn--primary sf-btn--lg" onclick="saveFeeStructure().then(fpxFsRefresh)">Save fee structure</button>
        </div>
      </div>` : ''}
      <div id="feeSchedulePanel" class="fpx-sched"></div>
    </div>`;
  fpxFsSelect(fpxFsSel);
  renderFeeSchedulePanel();
}

/* ============================================================
   PROMOTIONS
   ============================================================ */
let fpxPoSel = '';   // class chosen in step 1
let fpxPoQ = '';     // roster search text
let fpxPoHost = null;

function fpxPoActive(cls){
  const list = students.filter(s => s.className === cls && isActive(s));
  return typeof compareByRoll === 'function' ? list.sort(compareByRoll) : list;
}
function fpxPoTarget(cls){
  const i = CLASS_LEVELS.indexOf(cls);
  return CLASS_LEVELS[i + 1] || '';   // '' means graduation
}

function fpxPoRowsHtml(list, next){
  const q = fpxPoQ.trim().toLowerCase();
  const rows = list.filter(s => !q || ((s.firstName || '') + ' ' + (s.lastName || '') + ' ' + (s.rollNo || '') + ' ' + (s.admissionNo || '')).toLowerCase().includes(q));
  if(!rows.length) return { n: 0, html: `<tr><td colspan="4">${fpxEmpty('No student matches', 'Try a different name or roll number.')}</td></tr>` };
  return { n: rows.length, html: rows.map(s => `
    <tr>
      <td class="fpx-roll">${escapeHtml(s.rollNo || '—')}</td>
      <td><span class="fpx-who">${sfAvatar(s)}<span class="fpx-nm"><b>${escapeHtml((s.firstName || '') + ' ' + (s.lastName || ''))}</b><small class="fpx-sec-m">Section ${escapeHtml(s.section || '—')}</small></span></span></td>
      <td class="fpx-sec-col">${escapeHtml(s.section || '—')}</td>
      <td>${next ? `<span class="fpx-move"><span class="fpx-move-from">${escapeHtml(s.className)}<span aria-hidden="true"> → </span></span><b>${escapeHtml(next)}</b></span>` : `<span class="sf-badge sf-badge--upcoming">Graduates</span>`}</td>
    </tr>`).join('') };
}

function fpxPoSearch(v){
  fpxPoQ = v || '';
  const list = fpxPoActive(fpxPoSel);
  const r = fpxPoRowsHtml(list, fpxPoTarget(fpxPoSel));
  const tb = document.getElementById('fpxPoRows'); if(tb) tb.innerHTML = r.html;
  const ct = document.getElementById('fpxPoCount'); if(ct) ct.textContent = `Showing ${r.n} of ${list.length}`;
}

function fpxPoPick(cls){
  fpxPoSel = cls; fpxPoQ = '';
  if(fpxPoHost) renderPromotionsTab(fpxPoHost);
}

function fpxPoFeeRows(cls, next){
  const a = classStruct(cls), b = classStruct(next);
  const heads = [['fee', 'Tuition fee'], ['bus', 'Bus fee'], ['stock', 'Stock']];
  return heads.map(([k, label]) => {
    const x = Number(a[k]) || 0, y = Number(b[k]) || 0;
    return `<tr><td>${label}</td><td class="fpx-r">${fmtMoney(x)}</td><td class="fpx-r"><b>${fmtMoney(y)}</b></td><td class="fpx-r">${x === y ? '<span class="fpx-mute">no change</span>' : `<span class="${y > x ? 'fpx-up' : 'fpx-down'}">${y > x ? '+' : '−'}${fmtMoney(Math.abs(y - x))}</span>`}</td></tr>`;
  }).join('');
}

function fpxPoMainHtml(){
  const cls = fpxPoSel;
  const list = fpxPoActive(cls);
  const next = fpxPoTarget(cls);
  const n = list.length;
  if(!cls || n === 0) return `<section class="sf-card fpx-card">${fpxEmpty(cls ? 'No active students in ' + escapeHtml(cls) : 'Pick a class to begin', cls ? 'Everyone here has already moved on or is inactive.' : 'Choose a class on the left to review who will move.')}</section>`;
  const secs = {};
  list.forEach(s => { const k = s.section || '—'; secs[k] = (secs[k] || 0) + 1; });
  const secChips = Object.keys(secs).sort().map(k => `<span class="fpx-chipstat">Section ${escapeHtml(k)}<b>${secs[k]}</b></span>`).join('');
  const r = fpxPoRowsHtml(list, next);
  const label = next ? `Promote ${fpxPlural(n, 'student')} to ${escapeHtml(next)}` : `Mark ${fpxPlural(n, 'student')} as Graduated`;
  const flow = [
    ['Class', escapeHtml(cls), true],
    ['Students', fpxPlural(n, 'student'), true],
    ['Outcome', next ? 'Promote to ' + escapeHtml(next) : 'Graduate', true],
    ['Confirm', 'Review below', false],
  ].map((s, i) => `<li class="${s[2] ? 'is-done' : 'is-now'}"><span class="fpx-num">${s[2] ? '✓' : i + 1}</span><span><small>${s[0]}</small><b>${s[1]}</b></span></li>`).join('');
  return `
    <ol class="fpx-flow" aria-label="Promotion steps">${flow}</ol>

    <section class="sf-card fpx-card">
      <div class="fpx-card-head"><span class="fpx-num">2</span><div><h4>Review students</h4><p>Every active student in ${escapeHtml(cls)} moves together. Inactive students are left alone.</p></div></div>
      <div class="fpx-secs">${secChips}</div>
      <div class="iv-toolbar fpx-toolbar">
        <input type="search" class="input iv-search fpx-search" placeholder="Search name or roll no" value="${escapeHtml(fpxPoQ)}" oninput="fpxPoSearch(this.value)" aria-label="Search students in ${escapeHtml(cls)}">
        <span class="fpx-mute" id="fpxPoCount">Showing ${r.n} of ${n}</span>
      </div>
      <div class="table-wrap fpx-roster"><table class="iv-table"><thead><tr><th>Roll</th><th>Student</th><th class="fpx-sec-col">Section</th><th>Moves to</th></tr></thead><tbody id="fpxPoRows">${r.html}</tbody></table></div>
    </section>

    <section class="sf-card fpx-card">
      <div class="fpx-card-head"><span class="fpx-num">3</span><div><h4>Outcome</h4><p>This page applies one outcome to the whole class.</p></div></div>
      <div class="fpx-outcome is-on"><span class="fpx-radio" aria-hidden="true"></span><div><b>${next ? 'Promote to ' + escapeHtml(next) : 'Graduate (last class)'}</b><small>${next ? 'Section stays the same. Roll numbers are not changed.' : 'Status is set to Inactive instead of moving to another class.'}</small></div><span class="sf-badge sf-badge--paid">Selected</span></div>
      <p class="fpx-alt">Keeping some students back, moving them to another section, or recording a transfer is done student by student in <a href="#" onclick="switchView('promotransfer');return false;">Promotion &amp; Transfer</a>. Do that first if anyone should not move.</p>
    </section>

    <section class="sf-card fpx-card fpx-confirm">
      <div class="fpx-card-head"><span class="fpx-num">4</span><div><h4>Confirm</h4><p>Check the summary, then apply. You will be asked to confirm once more.</p></div></div>
      <div class="fpx-summary">
        <div class="fpx-sum-line"><b>${fpxPlural(n, 'student')}</b> in <b>${escapeHtml(cls)}</b> ${next ? `will move to <b>${escapeHtml(next)}</b>` : 'will be marked <b>Graduated</b> and set to Inactive'}.</div>
        <ul>
          ${next ? '<li>Section stays the same for everyone.</li>' : '<li>They no longer count as active students.</li>'}
          <li>Payments already recorded stay locked to ${escapeHtml(cls)}, so past receipts are not re-counted.</li>
          ${next ? `<li>From now on their fees follow ${escapeHtml(next)}'s fee structure.</li>` : ''}
        </ul>
        ${next ? `<div class="table-wrap"><table class="iv-table fpx-feetab"><thead><tr><th>Fee head</th><th class="fpx-r">${escapeHtml(cls)}</th><th class="fpx-r">${escapeHtml(next)}</th><th class="fpx-r">Change</th></tr></thead><tbody>${fpxPoFeeRows(cls, next)}</tbody></table></div>` : ''}
      </div>
      <div class="fpx-apply">${sfBtn('primary', 'check', label, `promoteClass('${fpxJs(cls)}')`, 'sf-btn--lg')}<span class="fpx-mute">This cannot be undone from here.</span></div>
    </section>`;
}

function renderPromotionsTab(body){
  fpxPoHost = body;
  const rows = CLASS_LEVELS.map((c, idx) => ({ c, idx, n: fpxPoActive(c).length, next: CLASS_LEVELS[idx + 1] || '' }));
  if(!CLASS_LEVELS.includes(fpxPoSel) || !rows.find(r => r.c === fpxPoSel).n){
    const first = rows.find(r => r.n > 0);
    fpxPoSel = first ? first.c : '';
  }
  const totalActive = rows.reduce((a, r) => a + r.n, 0);
  const moving = rows.filter(r => r.next).reduce((a, r) => a + r.n, 0);
  const grad = rows.filter(r => !r.next).reduce((a, r) => a + r.n, 0);
  const lastName = CLASS_LEVELS[CLASS_LEVELS.length - 1] || 'last class';
  const list = rows.map(r => `
    <li><button type="button" class="fpx-cls${r.c === fpxPoSel ? ' active' : ''}" data-fpx-class="${escapeHtml(r.c)}" ${r.n === 0 ? 'disabled' : ''} aria-pressed="${r.c === fpxPoSel ? 'true' : 'false'}" onclick="fpxPoPick('${fpxJs(r.c)}')">
      <span class="fpx-cls-name"><b>${escapeHtml(r.c)}</b><small>${r.next ? '→ ' + escapeHtml(r.next) : 'Graduates'}</small></span>
      <span class="fpx-cls-n">${r.n}</span>
    </button></li>`).join('');
  body.innerHTML = `
    <div class="fpx">
      <p class="fpx-note">At year-end, promote every active student in a class to the next class (both sections move together, Section stays the same). ${escapeHtml(lastName)} students are marked <b>Graduated</b> (status set to Inactive) instead of being moved further.</p>
      <section class="sf-kpis fpx-kpis">
        ${sfKpi('Active students', totalActive, 'plain', 'across all classes')}
        ${sfKpi('Ready to move up', moving, 'good', 'excluding the last class')}
        ${sfKpi('Graduating', grad, grad ? 'warn' : 'plain', escapeHtml(lastName))}
        ${sfKpi('Selected class', fpxPoSel ? fpxPoActive(fpxPoSel).length : '—', 'plain', fpxPoSel ? escapeHtml(fpxPoSel) : 'none chosen')}
      </section>
      <div class="fpx-po">
        <aside class="sf-card fpx-card fpx-po-side">
          <div class="fpx-card-head"><span class="fpx-num">1</span><div><h4>Choose class</h4><p>Classes with no active students are greyed out.</p></div></div>
          <ul class="fpx-cls-list">${list}</ul>
        </aside>
        <div class="fpx-po-main" id="fpxPoMain">${fpxPoMainHtml()}</div>
      </div>
    </div>`;
}
