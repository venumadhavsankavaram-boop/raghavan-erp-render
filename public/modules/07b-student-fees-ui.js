/* ============================================================================
   Manage Fee → Student Fees screens: class overview, section list, student ledger.

   Presentation only. Every figure comes from the existing finance helpers
   (computeStudentFinance, computePendingFeeRows, getFamilySummary), and every
   action still goes through the handlers in 07/08 (submitLedgerPayments,
   openFamilyFeeModal, printReceipt, voidPayment, openRefundPaymentModal, ...).
   Element ids and data attributes those handlers read are unchanged:
   quickPayAmt, ledgerPayMode, ledgerPayDate, ledgerTotalToPay, fullyPaidDetail,
   fpChevron and the .ledger-pay-input fields (data-type / data-key / data-outstanding).
   ========================================================================== */

/* ---------- shared helpers ---------- */

const SF_STATE = {
  paid:     { icon: '✓', text: 'Paid' },
  overdue:  { icon: '!', text: 'Overdue' },
  due:      { icon: '●', text: 'Due today' },
  upcoming: { icon: '○', text: 'Upcoming' },
  pending:  { icon: '◐', text: 'Pending' },
};

// Status is never colour-only: every badge carries an icon and a word.
function sfBadge(state){
  const s = SF_STATE[state] || SF_STATE.pending;
  return `<span class="sf-badge sf-badge--${state}"><span aria-hidden="true">${s.icon}</span>${s.text}</span>`;
}

// Small line icons (currentColor) so buttons read at a glance.
const SF_ICON = {
  pay:     '<path d="M3 7h18v12H3z"/><path d="M3 11h18"/><path d="M7 15h3"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  open:    '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  check:   '<path d="M5 13l4 4L19 7"/>',
  family:  '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M17 11a3 3 0 100-6M21 20c0-2.5-1.5-4.6-3.6-5.5"/>',
  down:    '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
};
function sfIcon(name){
  return `<svg class="sf-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SF_ICON[name] || ''}</svg>`;
}
// kind: primary | soft | link | danger.  onclick is passed as a ready-made attribute value.
function sfBtn(kind, icon, label, onclick, extra){
  return `<button type="button" class="sf-btn sf-btn--${kind}${extra ? ' ' + extra : ''}" onclick="${onclick}">${icon ? sfIcon(icon) : ''}${label}</button>`;
}

function sfPct(paid, outstanding){
  const total = (Number(paid) || 0) + (Number(outstanding) || 0);
  return total > 0 ? Math.round((paid / total) * 100) : 100;
}

function sfBar(pct){
  return `<div class="sf-bar" role="img" aria-label="${pct}% collected"><i style="width:${pct}%"></i></div>`;
}

function sfKpi(label, value, tone, note){
  return `<div class="sf-kpi sf-kpi--${tone || 'plain'}"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
}

function sfAvatar(s){
  return s.photo
    ? `<img class="sf-avatar" src="${s.photo}" alt="">`
    : `<span class="sf-avatar" aria-hidden="true">${initials(s)}</span>`;
}

// One student's fee position, in the terms every screen below needs.
// State follows the receivable (as the section list always has): paid, overdue
// (some installment past its due date) or pending.
function sfStudentSummary(s){
  const { totals } = computeStudentFinance(s);
  const rows = computePendingFeeRows(s);
  const dueNow = rows.allRows.reduce((sum, r) => sum + (r.dueTillToday || 0), 0);
  const overdue = rows.allRows.some(r => r.overdueAmount > 0);
  const nextRow = rows.pendingRows.filter(r => r.type === 'category' && r.dueDate !== '—')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return {
    totals, rows, dueNow,
    nextDue: nextRow ? nextRow.dueDate : '',
    state: totals.receivable <= 0 ? 'paid' : (overdue ? 'overdue' : 'pending'),
    pct: sfPct(totals.collected, totals.receivable),
  };
}

function sfSum(list, pick){ return list.reduce((sum, x) => sum + pick(x), 0); }

/* ---------- 1. class overview ---------- */

function renderFeeClassGrid(body){
  const classF = document.getElementById('mfClassFilter').value;
  const classes = CLASS_LEVELS.filter(c => !classF || c === classF).map(cls => {
    const sections = sectionsForClass(cls).map(sec => {
      const list = students.filter(s => s.className === cls && s.section === sec && isActive(s)).map(sfStudentSummary);
      return {
        sec, count: list.length,
        pending: list.filter(x => x.state !== 'paid').length,
        overdue: list.filter(x => x.state === 'overdue').length,
        collected: sfSum(list, x => x.totals.collected),
        receivable: sfSum(list, x => x.totals.receivable),
        dueNow: sfSum(list, x => x.dueNow),
      };
    }).filter(x => x.count > 0); // strictly follows school setup: no students, no card
    return { cls, sections };
  }).filter(c => c.sections.length);

  if(!classes.length){
    body.innerHTML = `<div class="empty-state"><b>No students found for the selected class.</b></div>`;
    return;
  }

  const all = classes.flatMap(c => c.sections);
  const collected = sfSum(all, x => x.collected);
  const receivable = sfSum(all, x => x.receivable);
  const overdueStudents = sfSum(all, x => x.overdue);

  const cards = classes.map(({ cls, sections }) => {
    const count = sfSum(sections, x => x.count);
    const pending = sfSum(sections, x => x.pending);
    const col = sfSum(sections, x => x.collected);
    const rec = sfSum(sections, x => x.receivable);
    const pct = sfPct(col, rec);
    const chips = sections.map(x => `
      <button type="button" class="sf-chip" onclick="openFeeSection('${cls}','${x.sec}')">
        <b>Sec ${x.sec}</b><span>${x.count} students</span>
        ${x.pending > 0
          ? `<em class="${x.overdue > 0 ? 'is-overdue' : 'is-pending'}">${x.overdue > 0 ? x.overdue + ' overdue' : x.pending + ' pending'}</em>`
          : `<em class="is-clear">✓ clear</em>`}
      </button>`).join('');
    return `
      <article class="sf-class">
        <header>
          <div><h3>${cls}</h3><small>${count} student${count === 1 ? '' : 's'}${pending > 0 ? ` · ${pending} with dues` : ' · all clear'}</small></div>
          <span class="sf-class-pct">${pct}%<small>collected</small></span>
        </header>
        ${sfBar(pct)}
        <dl class="sf-class-money">
          <div><dt>Collected</dt><dd>${fmtMoney(col)}</dd></div>
          <div><dt>Outstanding</dt><dd class="${rec > 0 ? 'is-due' : ''}">${fmtMoney(rec)}</dd></div>
        </dl>
        <div class="sf-chips">${chips}</div>
      </article>`;
  }).join('');

  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Collected', fmtMoney(collected), 'good', `${sfPct(collected, receivable)}% of billed`)}
      ${sfKpi('Outstanding', fmtMoney(receivable), receivable > 0 ? 'danger' : 'good')}
      ${sfKpi('Billed (net of discounts)', fmtMoney(collected + receivable), 'plain')}
      ${sfKpi('Students overdue', overdueStudents, overdueStudents > 0 ? 'danger' : 'good', 'past an installment due date')}
    </section>
    <div class="sf-classes">${cards}</div>`;
}

/* ---------- 2. section list ---------- */

let sfSectionKey = '';
let sfSectionRows = [];
let sfFilter = 'all';
let sfQuery = '';

const SF_FILTERS = [['all', 'All'], ['pending', 'Pending'], ['overdue', 'Overdue'], ['paid', 'Paid']];

function renderFeeSectionList(body){
  const key = feeCurrentClass + '|' + feeCurrentSection;
  if(key !== sfSectionKey){ sfSectionKey = key; sfFilter = 'all'; sfQuery = ''; }

  sfSectionRows = students.filter(s => s.className === feeCurrentClass && s.section === feeCurrentSection && isActive(s))
    .map(s => ({ s, sum: sfStudentSummary(s), family: getFamilySummary(s) }));

  const collected = sfSum(sfSectionRows, r => r.sum.totals.collected);
  const receivable = sfSum(sfSectionRows, r => r.sum.totals.receivable);
  const pending = sfSectionRows.filter(r => r.sum.state !== 'paid').length;

  body.innerHTML = `
    <nav class="breadcrumb"><a onclick="backToFeeGrid()">All Classes</a> &nbsp;/&nbsp; ${feeCurrentClass} — Section ${feeCurrentSection}</nav>
    <section class="sf-kpis">
      ${sfKpi('Students', sfSectionRows.length, 'plain')}
      ${sfKpi('Collected', fmtMoney(collected), 'good', `${sfPct(collected, receivable)}% of billed`)}
      ${sfKpi('Outstanding', fmtMoney(receivable), receivable > 0 ? 'danger' : 'good')}
      ${sfKpi('With dues', pending, pending > 0 ? 'warn' : 'good')}
    </section>
    <div class="sf-toolbar">
      <input class="input sf-search" id="sfSearch" type="search" placeholder="Search name or admission no…" value="${escapeHtml(sfQuery)}" oninput="onSfSectionFilter()">
      <div class="sf-segments" role="group" aria-label="Filter by status">
        ${SF_FILTERS.map(([k, label]) => `<button type="button" class="${sfFilter === k ? 'active' : ''}" onclick="setSfFilter('${k}')">${label}</button>`).join('')}
      </div>
      <span class="sf-count" id="sfCount"></span>
    </div>
    <div class="sf-card">
      <div class="table-wrap" style="overflow-x:auto;">
        <table class="sf-table">
          <thead><tr><th>Student</th><th>Total / Discount</th><th>Paid</th><th>Outstanding</th><th>Next due</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="sfSectionRows"></tbody>
        </table>
        <div id="sfEmpty"></div>
      </div>
    </div>`;
  paintSfSectionRows();
}

function onSfSectionFilter(){
  sfQuery = document.getElementById('sfSearch').value;
  paintSfSectionRows();
}
function setSfFilter(k){
  sfFilter = k;
  document.querySelectorAll('.sf-segments button').forEach((b, i) => b.classList.toggle('active', SF_FILTERS[i][0] === k));
  paintSfSectionRows();
}

// Repaints only the rows, so typing in the search box never loses focus.
function paintSfSectionRows(){
  const tbody = document.getElementById('sfSectionRows');
  if(!tbody) return;
  const q = sfQuery.trim().toLowerCase();
  const canPay = canSub('managefee_collection', 'managefee', 'create');
  const canPrint = canSub('managefee_collection', 'managefee', 'print');
  const rows = sfSectionRows.filter(({ s, sum }) => {
    if(sfFilter === 'paid' && sum.state !== 'paid') return false;
    if(sfFilter === 'pending' && sum.state === 'paid') return false;
    if(sfFilter === 'overdue' && sum.state !== 'overdue') return false;
    return !q || (s.firstName + ' ' + s.lastName + ' ' + (s.admissionNo || '')).toLowerCase().includes(q);
  });

  tbody.innerHTML = rows.map(({ s, sum, family }) => {
    const { totals } = sum;
    const famLine = (val, label) => family.hasSiblings ? `<small class="sf-fam">👪 Family ${label}${fmtMoney(val)}</small>` : '';
    return `<tr>
      <td>
        <a class="sf-student" onclick="openStudentLedger('${s.id}')">
          ${sfAvatar(s)}
          <span><b>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</b>
            <small>${escapeHtml(s.admissionNo || '')}${s.fatherName ? ` · S/o ${escapeHtml(s.fatherName)}` : ''}</small>
            ${family.hasSiblings ? `<span class="pill">Siblings: ${family.familyIds.length - 1}</span>` : ''}
          </span>
        </a>
      </td>
      <td>${fmtMoney(totals.expected)}${totals.discount > 0 ? `<small class="sf-disc">− ${fmtMoney(totals.discount)} discount</small>` : ''}</td>
      <td class="sf-paid">${fmtMoney(totals.collected)}${sfBar(sum.pct)}${famLine(family.totals.collected, 'paid ')}</td>
      <td class="balance-tag ${totals.receivable > 0 ? 'due' : 'zero'}">${fmtMoney(totals.receivable)}${famLine(family.totals.receivable, 'due ')}</td>
      <td>${sum.state === 'paid' ? '—' : (sum.nextDue ? fmtISODate(sum.nextDue) : '—')}${sum.dueNow > 0 ? `<small class="sf-disc is-due">${fmtMoney(sum.dueNow)} payable now</small>` : ''}</td>
      <td>${sfBadge(sum.state)}</td>
      <td class="sf-actions">
        ${sum.state !== 'paid' && canPay ? sfBtn('primary', 'pay', 'Pay', `openFamilyFeeModal('${s.id}')`) : ''}
        ${canPrint ? sfBtn('soft', 'receipt', 'Receipts', `openStudentReceipts('${s.id}')`) : ''}
        ${sfBtn('soft', 'open', 'Details', `openStudentLedger('${s.id}')`)}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('sfCount').textContent = `${rows.length} of ${sfSectionRows.length} students`;
  document.getElementById('sfEmpty').innerHTML = rows.length ? '' : `<div class="empty-state"><b>No students match</b>Try a different search or filter.</div>`;
}

/* ---------- 3. student ledger ---------- */

// Term / month timeline for one fee head. A Yearly head has a single line,
// so it is shown as a due-date note instead of a table.
function sfInstallmentsHTML(r, canPay){
  const insts = r.installments || [];
  if(r.mode === 'yearly' || insts.length <= 1){
    const inst = insts[0];
    const state = r.overdueAmount > 0 ? 'overdue' : (r.dueTillToday > 0 ? 'due' : 'upcoming');
    return `<div class="sf-due-note">${sfBadge(state)}<span>${inst && inst.due ? `Whole amount due ${fmtISODate(inst.due)}` : 'Due now'}</span></div>`;
  }
  let running = 0;
  const rowsHtml = insts.map(i => {
    running += i.outstanding;
    const payUpTo = running;
    return `<tr class="${i.status === 'paid' ? 'is-paid' : ''}">
      <td><b>${escapeHtml(i.label)}</b>${i.from ? `<small>${fmtISODate(i.from)} – ${fmtISODate(i.to)}</small>` : ''}</td>
      <td>${i.due ? fmtISODate(i.due) : '—'}</td>
      <td>${fmtMoney(i.amount)}</td>
      <td>${i.paid > 0 ? fmtMoney(i.paid) : '—'}</td>
      <td class="${i.outstanding > 0 ? 'is-due' : ''}">${fmtMoney(i.outstanding)}</td>
      <td>${sfBadge(i.status)}${i.partial ? '<small>part-paid</small>' : ''}</td>
      <td>${canPay && i.outstanding > 0 ? `${sfBtn('link', 'down', 'Pay up to here', `sfPayUpTo('${r.key}', ${payUpTo})`)}` : ''}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap" style="overflow-x:auto;"><table class="sf-inst">
    <thead><tr><th>Instalment</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
    <tbody>${rowsHtml}</tbody></table></div>`;
}

// "Pay up to here" fills this fee head's amount with everything owed through
// that instalment, then lets the normal total/validation logic run.
function sfPayUpTo(key, amount){
  const input = document.querySelector(`.ledger-pay-input[data-type="category"][data-key="${key}"]`);
  if(!input) return;
  input.value = amount;
  onLedgerPayInput();
  input.focus();
}

function sfHeadCardHTML(r, studentId, canPay){
  const dot = r.type === 'category' ? CAT_COLORS[r.key] : 'var(--ink-soft)';
  const pct = sfPct(r.paid, r.outstanding);
  const state = r.overdueAmount > 0 ? 'overdue' : (r.dueTillToday > 0 ? 'due' : 'upcoming');
  const body = r.type === 'category'
    ? sfInstallmentsHTML(r, canPay)
    : `<div class="sf-due-note">${sfBadge('pending')}<span>${r.dueDate !== '—' ? `Assigned ${r.dueDate}` : 'One-time fee'}</span></div>`;
  return `
    <article class="sf-head">
      <header>
        <h4><span class="cat-swatch" style="background:${dot}"></span>${escapeHtml(r.label)}</h4>
        <span class="sf-freq">${r.frequency}</span>
        ${r.type === 'category' ? sfBadge(state) : ''}
        ${r.lateFee > 0 ? `<span class="sf-late">Late fee ${fmtMoney(r.lateFee)}</span>` : ''}
      </header>
      <div class="sf-head-grid">
        <div class="sf-head-money">
          <div><span>Total</span><b>${fmtMoney(r.total)}</b></div>
          <div><span>Discount</span><b>${r.discount > 0 ? fmtMoney(r.discount) : '—'}</b></div>
          <div><span>Paid</span><b>${fmtMoney(r.paid)}</b></div>
          <div class="is-due"><span>Outstanding</span><b>${fmtMoney(r.outstanding)}</b></div>
          ${sfBar(pct)}
        </div>
        <label class="sf-pay">
          <span>Amount to pay</span>
          <input type="number" min="0" max="${r.outstanding}" class="ledger-pay-input" data-type="${r.type}" data-key="${r.key}" data-outstanding="${r.outstanding}" value="0"
            oninput="onLedgerPayInput()" onkeydown="submitOnEnter(event, () => submitLedgerPayments('${studentId}'))">
          <small>up to ${fmtMoney(r.outstanding)}</small>
        </label>
      </div>
      ${body}
    </article>`;
}

function renderStudentLedger(body){
  const s = students.find(x => x.id === feeCurrentStudentId);
  if(!s){ feeView = 'grid'; return renderFeeBody(); }
  const { extras } = computeStudentFinance(s);
  const studentPayments = payments.filter(p => p.studentId === s.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const canPay = canSub('managefee_collection', 'managefee', 'create');
  const sum = sfStudentSummary(s);
  const { totals } = sum;
  const { pendingRows, paidRows, totalPendingOutstanding } = sum.rows;

  const { familyIds, hasSiblings, totals: familyTotals } = getFamilySummary(s);
  if(!hasSiblings) ledgerFamilyView = 'single';

  const crumbs = `<nav class="breadcrumb"><a onclick="backToFeeGrid()">All Classes</a> &nbsp;/&nbsp; <a onclick="backToFeeSection()">${s.className} — ${s.section}</a> &nbsp;/&nbsp; ${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</nav>`;
  const sibPill = hasSiblings ? `<span class="pill">Siblings: ${familyIds.length - 1}</span>` : '';
  const hero = (actions) => `
    <section class="sf-hero">
      ${sfAvatar(s)}
      <div class="sf-hero-id">
        <h2>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</h2>
        <p>${escapeHtml(s.admissionNo || '')} · ${s.className} — Section ${s.section} ${sibPill}</p>
      </div>
      <div class="sf-hero-state">${sfBadge(sum.state)}<b>${fmtMoney(totals.receivable)}</b><small>outstanding</small></div>
      <div class="profile-actions">${actions}</div>
    </section>`;

  // The Single Student / Family toggle plus the household summary and its
  // Collect Family Fees button — only shown once this student has a sibling.
  const familyHtml = hasSiblings ? `
    <div class="sf-segments sf-segments--solo" role="group" aria-label="Ledger view">
      <button type="button" class="${ledgerFamilyView === 'single' ? 'active' : ''}" onclick="setLedgerFamilyView('single')">Single Student</button>
      <button type="button" class="${ledgerFamilyView === 'family' ? 'active' : ''}" onclick="setLedgerFamilyView('family')">Family</button>
    </div>
    <div class="dash-section-title"><div><h3>👪 Family Summary</h3><span class="eyebrow-sm">${familyIds.length} member${familyIds.length === 1 ? '' : 's'}</span></div>
      ${canPay ? sfBtn('primary', 'family', 'Collect Family Fees', `openFamilyFeeModal('${s.id}')`) : ''}
    </div>
    <section class="sf-kpis">
      ${sfKpi('Total amount', fmtMoney(familyTotals.expected), 'plain')}
      ${sfKpi('Total paid', fmtMoney(familyTotals.collected), 'good')}
      ${sfKpi('Total outstanding', fmtMoney(familyTotals.receivable), familyTotals.receivable > 0 ? 'danger' : 'good')}
      ${sfKpi('Total discount', familyTotals.discount > 0 ? fmtMoney(familyTotals.discount) : '—', 'plain')}
    </section>` : '';

  // Family view is a read-only per-member breakdown; money for several
  // students is only ever collected through the Collect Family Fees modal.
  if(hasSiblings && ledgerFamilyView === 'family'){
    body.innerHTML = `${crumbs}${hero('')}${familyHtml}${renderFamilyMembersReadOnly(familyIds, s.id)}`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const lateTotal = sfSum(pendingRows, r => r.lateFee);

  const paidHtml = paidRows.length ? `
    <div class="fully-paid-banner" onclick="toggleFullyPaidBanner()">
      <svg id="fpChevron" width="16" height="16" viewBox="0 0 24 24" fill="none" style="transition:transform .2s ease;"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>✓ Fully Paid (${paidRows.length} item${paidRows.length === 1 ? '' : 's'})</span>
      <span class="fp-total">Total Paid: ${fmtMoney(sfSum(paidRows, r => r.paid))}</span>
    </div>
    <div id="fullyPaidDetail" style="display:none;">
      <div class="table-wrap" style="margin-bottom:20px;">
        <table><thead><tr><th>Type</th><th>Total Amount</th><th>Paid</th><th>Discount</th></tr></thead><tbody>
        ${paidRows.map(r => `<tr><td><span class="pill">${escapeHtml(r.label)}</span></td><td>${fmtMoney(r.total)}</td><td>${fmtMoney(r.paid)}</td><td>${r.discount > 0 ? fmtMoney(r.discount) : '-'}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>` : '';

  const pendingHtml = pendingRows.length ? `
    <div class="dash-section-title"><div><h3>Pending Fees (${pendingRows.length} item${pendingRows.length === 1 ? '' : 's'})</h3></div></div>
    <div class="sf-heads">${pendingRows.map(r => sfHeadCardHTML(r, s.id, canPay)).join('')}</div>
    <div class="sf-paybar">
      <label class="sf-field"><span>Quick pay</span>
        <input type="number" min="0" id="quickPayAmt" placeholder="Amount" oninput="onQuickPayInput()" onkeydown="submitOnEnter(event, () => submitLedgerPayments('${s.id}'))"></label>
      <label class="sf-field"><span>Mode</span>
        <select id="ledgerPayMode"><option>Cash</option><option>Online</option><option>Cheque</option></select></label>
      <label class="sf-field"><span>Date</span>
        <input type="date" id="ledgerPayDate" value="${today}" max="${today}"></label>
      <div class="sf-paybar-total"><span>Total to pay</span><b id="ledgerTotalToPay">₹0</b><small>of ${fmtMoney(totalPendingOutstanding)}${lateTotal > 0 ? ` · late fees ${fmtMoney(lateTotal)}` : ''}</small></div>
      ${canPay ? sfBtn('primary', 'check', 'Record Payment(s)', `submitLedgerPayments('${s.id}')`, 'sf-btn--lg') : ''}
    </div>`
    : `<div class="empty-state" style="margin-bottom:24px;"><b>No pending fees</b>Everything's fully paid for this student.</div>`;

  const extrasHtml = extras.length ? `
    <div class="dash-section-title"><div><h3>Extra Fees Assigned</h3></div></div>
    <div class="table-wrap" style="margin-bottom:24px;"><table><thead><tr><th>Name</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${extras.map(e => {
        const paidAmt = Number(e.paidAmount) || 0;
        const statusHtml = paidAmt >= e.amount ? '<span class="pill">Paid</span>' : paidAmt > 0 ? `<span class="balance-tag due">Partially Paid (${fmtMoney(paidAmt)} of ${fmtMoney(e.amount)})</span>` : '<span class="balance-tag due">Unpaid</span>';
        return `<tr><td>${e.name}</td><td>${fmtMoney(e.amount)}</td><td>${statusHtml}</td>
        <td>${paidAmt > 0 ? `<button class="btn-edit-text" onclick="printReceiptForExtraFee('${e.id}')">Print Receipt</button>&nbsp;·&nbsp;` : ``}${canSub('managefee_collection', 'managefee', 'delete') ? `<button class="btn-danger-text" onclick="removeExtraFee('${e.id}')">Remove</button>` : ``}</td></tr>`;
      }).join('')}
    </tbody></table></div>` : '';

  const historyHtml = `
    <div class="dash-section-title"><div><h3>Payment History</h3></div></div>
    <div class="table-wrap" style="overflow-x:auto;"><table><thead><tr><th>Date</th><th>Category</th><th>Instalment</th><th>Mode</th><th>Amount</th><th>Discount</th><th>Status</th><th></th></tr></thead><tbody>
      ${studentPayments.length ? studentPayments.map(p => {
        const statusHtml = p.voided
          ? `<span class="balance-tag due" title="${(p.voidReason || '').replace(/"/g, '&quot;')}">${p.voidType === 'refund' ? 'REFUNDED' : 'VOIDED'}</span>`
          : `<span class="pill">Recorded</span>`;
        const actions = [];
        if(!p.voided && canSub('managefee_collection', 'managefee', 'print')) actions.push(sfBtn('link', 'receipt', 'Print Receipt', `printReceipt('${p.id}')`));
        if(!p.voided && canSub('managefee_collection', 'managefee', 'delete')) actions.push(sfBtn('danger', '', 'Void', `voidPayment('${p.id}')`));
        if(!p.voided && canSub('managefee_collection', 'managefee', 'delete')) actions.push(sfBtn('danger', '', 'Refund', `openRefundPaymentModal('${p.id}')`));
        return `<tr${p.voided ? ' style="opacity:.6;"' : ''}><td>${p.date || '—'}</td><td><span class="pill">${feeLabelFor(p)}</span></td><td>${escapeHtml(p.instalment || '—')}</td><td>${p.mode || '—'}</td><td>${p.voided ? `<s>${fmtMoney(p.amount)}</s>` : fmtMoney(p.amount)}</td><td>${fmtMoney(p.discount)}</td><td>${statusHtml}</td><td class="sf-actions">${actions.join('')}</td></tr>`;
      }).join('') : `<tr><td colspan="8"><div class="empty-state"><b>No payments yet</b></div></td></tr>`}
    </tbody></table></div>`;

  const heroActions = canPay ? `
    ${sfBtn('soft', 'plus', 'Add Admission Fee', `addAdmissionFeeForStudent('${s.id}')`)}
    ${sfBtn('soft', 'plus', 'Assign Extra Fee', `openExtraFeeAssignModal('${s.id}')`)}` : '';

  body.innerHTML = `
    ${crumbs}
    ${hero(heroActions)}
    <section class="sf-kpis">
      ${sfKpi('Total amount', fmtMoney(totals.expected), 'plain')}
      ${sfKpi('Discount', totals.discount > 0 ? fmtMoney(totals.discount) : '—', 'plain')}
      ${sfKpi('Paid', fmtMoney(totals.collected), 'good', `${sum.pct}% collected`)}
      ${sfKpi('Outstanding', fmtMoney(totals.receivable), totals.receivable > 0 ? 'danger' : 'good')}
      ${sfKpi('Payable now', fmtMoney(sum.dueNow), sum.dueNow > 0 ? 'warn' : 'good', 'due on or before today')}
    </section>
    ${familyHtml}
    ${paidHtml}
    ${pendingHtml}
    ${extrasHtml}
    ${historyHtml}`;
}
