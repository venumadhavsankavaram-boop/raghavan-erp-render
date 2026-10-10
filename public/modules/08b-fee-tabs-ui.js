/* ============================================================================
   Manage Fee → Fee Types, Discounts, Extra Fees, Late Fees and Fee Defaulters.

   Presentation only. Every handler those screens call is unchanged and lives
   in module 08: addFeeType / removeFeeType, openDiscCreateForm /
   approveDiscountGroup / rejectDiscountGroup / deleteDiscountGroup /
   addDiscountType / removeDiscountType, addExtraFeeDef / removeExtraFeeDef,
   saveLateFeeSettings / saveReceiptSettings, openNotifyModal and the
   download* exporters. Element ids those handlers read are kept:
   newFeeTypeName, newDiscName, newDiscAmount, newExtraName, newExtraAmount,
   lfDueDate, lfGrace, lfAmount, rsStart, dfClass, dfSection, dfName, dfPhone.

   Search boxes no longer redraw the whole panel on every key press: the shell
   is drawn once and only the rows / counters are repainted, so typing keeps
   its focus. Shares the stat tiles (sfKpi), buttons (sfBtn), badges and .sf-card
   surface with the Student Fees and Inventory screens.
   ========================================================================== */

/* ---------- helpers ---------- */

function ftEsc(v){ return escapeHtml(String(v == null ? '' : v)); }

// Approval status is never colour-only: icon + word, same badge family as Student Fees.
const FT_DISC_STATUS = {
  Approved: { cls: 'paid',    icon: '✓', text: 'Approved' },
  Rejected: { cls: 'overdue', icon: '!', text: 'Rejected' },
  Pending:  { cls: 'due',     icon: '◐', text: 'Pending' },
};
function ftDiscBadge(status){
  const s = FT_DISC_STATUS[status] || FT_DISC_STATUS.Pending;
  return `<span class="sf-badge sf-badge--${s.cls}"><span aria-hidden="true">${s.icon}</span>${s.text}</span>`;
}

// Section header used by every card on these screens.
function ftCardHead(title, hint){
  return `<div class="ft-head"><h4>${title}</h4>${hint ? `<p>${hint}</p>` : ''}</div>`;
}

/* ---------- 1. Fee Types ---------- */

function renderFeeTypesTab(body){
  const canCreate = canSub('managefee_types', 'managefee', 'create');
  const canDelete = canSub('managefee_types', 'managefee', 'delete');
  body.innerHTML = `
    <div class="ft-grid">
      <section class="sf-card ft-card">
        ${ftCardHead('Fee types', 'Extra labels you can pick when creating Extra Fees (for example Exam Fee or Lab Fee).')}
        ${canCreate ? `<div class="ft-add">
          <input class="input" id="newFeeTypeName" placeholder="e.g. Exam Fee" maxlength="60" onkeydown="if(event.key==='Enter'){addFeeType();}">
          ${sfBtn('primary', 'plus', 'Add fee type', 'addFeeType()')}
        </div>` : ''}
        <div class="ft-chips">
          ${feeTypes.map((t, i) => `<span class="ft-chip"><b>${ftEsc(t)}</b>${canDelete ? `<button type="button" class="ft-chip-x" title="Remove ${ftEsc(t)}" aria-label="Remove ${ftEsc(t)}" onclick="removeFeeType(${i})">×</button>` : ''}</span>`).join('')
            || `<div class="ft-empty"><b>No fee types yet</b>Add the first one above.</div>`}
        </div>
      </section>
      <aside class="sf-card ft-card ft-note">
        ${ftCardHead('Core categories', 'These four recurring categories are structural, so they are managed under <b>Fee Structure</b>, not here.')}
        <div class="ft-chips">
          ${Object.keys(CATS).map(c => `<span class="ft-chip ft-chip--locked"><b>${ftEsc(CATS[c])}</b></span>`).join('')}
        </div>
      </aside>
    </div>`;
}

/* ---------- 2. Discounts (list) ---------- */

function ftDiscFiltered(){
  const rows = groupedDiscountRows();
  let list = rows;
  if(discListFilter === 'pending') list = list.filter(r => r.status === 'Pending');
  if(discSearchQuery){
    const q = discSearchQuery.toLowerCase();
    list = list.filter(r => {
      const s = students.find(x => x.id === r.studentId);
      return s && (s.firstName + ' ' + s.lastName).toLowerCase().includes(q);
    });
  }
  return { rows, list };
}

function ftDiscTotal(r){ return r.records.reduce((sum, x) => sum + (Number(x.value) || 0), 0); }

function ftDiscRowHtml(r){
  const s = students.find(x => x.id === r.studentId);
  const parts = Object.keys(CATS).map(c => {
    const rec = r.records.find(x => x.appliesTo === c);
    return rec ? `<span class="ft-part">${ftEsc(CATS[c])} <b>${fmtMoney(rec.value)}</b></span>` : '';
  }).join('');
  const canDelete = canSub('managefee_discounts', 'managefee', 'delete');
  const isAdminPending = currentUser.role === 'Admin' && r.status === 'Pending';
  return `<tr>
    <td>
      <div class="ft-who">${s ? sfAvatar(s) : '<span class="sf-avatar" aria-hidden="true">?</span>'}
        <span><b>${s ? ftEsc(s.firstName + ' ' + s.lastName) : 'Unknown student'}</b><small>${s ? ftEsc(s.className) + ' - ' + ftEsc(s.section) + ' · ' : ''}S/o ${s && s.fatherName ? ftEsc(s.fatherName) : '—'}</small></span>
      </div>
    </td>
    <td>${ftEsc(r.type)}${r.note ? `<small>${ftEsc(r.note)}</small>` : ''}</td>
    <td><div class="ft-parts">${parts || '—'}</div></td>
    <td><b>${fmtMoney(ftDiscTotal(r))}</b></td>
    <td>${ftDiscBadge(r.status)}<small>By ${ftEsc(r.requestedBy || '—')}${r.approvedBy ? ' · approved by ' + ftEsc(r.approvedBy) : ''}</small></td>
    <td class="sf-actions">
      ${isAdminPending ? sfBtn('link', 'check', 'Approve', `approveDiscountGroup('${r.batchId}','${r.studentId}')`) + sfBtn('danger', '', 'Reject', `rejectDiscountGroup('${r.batchId}','${r.studentId}')`) : ''}
      ${canDelete ? sfBtn('danger', '', 'Delete', `deleteDiscountGroup('${r.batchId}','${r.studentId}')`) : ''}
    </td>
  </tr>`;
}

// Repaint only the rows, counters and segment state — the search box keeps focus.
function paintFtDisc(){
  const rowsEl = document.getElementById('ftDiscRows');
  if(!rowsEl) return;
  const { rows, list } = ftDiscFiltered();
  rowsEl.innerHTML = list.length ? list.map(ftDiscRowHtml).join('')
    : `<tr><td colspan="6"><div class="ft-empty"><b>No discounts found</b>${discSearchQuery || discListFilter === 'pending' ? 'Try clearing the search or filter.' : 'Created discounts will appear here.'}</div></td></tr>`;
  const count = document.getElementById('ftDiscCount');
  if(count) count.textContent = list.length + ' of ' + rows.length + ' shown';
  document.querySelectorAll('#ftDiscSeg button').forEach(b => b.classList.toggle('active', b.dataset.f === discListFilter));
}

function renderDiscListView(body){
  const rows = groupedDiscountRows();
  const pending = rows.filter(r => r.status === 'Pending').length;
  const approvedTotal = rows.filter(r => r.status === 'Approved').reduce((sum, r) => sum + ftDiscTotal(r), 0);
  const canCreate = canSub('managefee_discounts', 'managefee', 'create');
  const canDelete = canSub('managefee_discounts', 'managefee', 'delete');
  body.innerHTML = `
    <div class="sf-kpis">
      ${sfKpi('Discount records', rows.length, 'plain')}
      ${sfKpi('Awaiting approval', pending, pending ? 'warn' : 'good', pending ? 'Needs an Admin decision' : 'All caught up')}
      ${sfKpi('Approved concession', fmtMoney(approvedTotal), 'good')}
    </div>
    <div class="iv-toolbar">
      <input class="input iv-search" id="discListSearch" type="search" placeholder="Search student discounts…" value="${ftEsc(discSearchQuery)}" oninput="onDiscListSearch(this.value)" autocomplete="off">
      <div class="sf-segments" id="ftDiscSeg">
        <button type="button" data-f="all" onclick="setDiscListFilter('all')">All</button>
        <button type="button" data-f="pending" onclick="setDiscListFilter('pending')">Approvals${pending ? ' (' + pending + ')' : ''}</button>
      </div>
      <span class="iv-count" id="ftDiscCount"></span>
      <div class="iv-toolbar-actions">
        ${canCreate ? sfBtn('primary', 'plus', 'Create student discount', 'openDiscCreateForm()') : ''}
      </div>
    </div>
    <div class="sf-card">
      <div class="table-wrap">
        <table class="iv-table ft-table">
          <thead><tr><th>Student</th><th>Concession</th><th>Breakdown</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody id="ftDiscRows"></tbody>
        </table>
      </div>
    </div>

    <section class="sf-card ft-card" style="margin-top:20px;">
      ${ftCardHead('Discount catalog', 'A quick-reference list staff can glance at when recording a one-off payment discount by hand. Not tied to approval.')}
      ${canCreate ? `<div class="ft-add">
        <input class="input" id="newDiscName" placeholder="e.g. Merit Scholarship" maxlength="60">
        <input class="input" id="newDiscAmount" type="number" min="0" placeholder="Amount (₹)">
        ${sfBtn('soft', 'plus', 'Add', 'addDiscountType()')}
      </div>` : ''}
      <div class="ft-chips">
        ${discountTypes.map((d, i) => `<span class="ft-chip"><b>${ftEsc(d.name)}</b><em>${fmtMoney(d.amount)}</em>${canDelete ? `<button type="button" class="ft-chip-x" title="Remove ${ftEsc(d.name)}" aria-label="Remove ${ftEsc(d.name)}" onclick="removeDiscountType(${i})">×</button>` : ''}</span>`).join('')
          || `<div class="ft-empty"><b>No entries yet</b></div>`}
      </div>
    </section>`;
  paintFtDisc();
}
function onDiscListSearch(val){ discSearchQuery = val; paintFtDisc(); }
function setDiscListFilter(f){ discListFilter = f; paintFtDisc(); }
function toggleDiscApprovalsFilter(){ setDiscListFilter(discListFilter === 'pending' ? 'all' : 'pending'); }

/* ---------- 3. Extra Fees ---------- */

function renderExtraFeesTab(body){
  const canCreate = canSub('managefee_extra', 'managefee', 'create');
  const canDelete = canSub('managefee_extra', 'managefee', 'delete');
  body.innerHTML = `
    <section class="sf-card ft-card">
      ${ftCardHead('Extra fees', 'One-off charges such as Annual Day or a Field Trip. Assign them to individual students from that student’s page under <b>Student Fees</b>.')}
      ${canCreate ? `<div class="ft-add">
        <input class="input" id="newExtraName" list="feeTypesDatalist" placeholder="e.g. Annual Day Fee" maxlength="80">
        <datalist id="feeTypesDatalist">${feeTypes.map(t => `<option value="${ftEsc(t)}">`).join('')}</datalist>
        <input class="input" id="newExtraAmount" type="number" min="0" placeholder="Amount (₹)">
        ${sfBtn('primary', 'plus', 'Add extra fee', 'addExtraFeeDef()')}
      </div>` : ''}
    </section>
    <div class="ft-cards">
      ${extraFeeDefs.map((e, i) => `
        <article class="sf-card ft-fee">
          <span class="ft-fee-name">${ftEsc(e.name)}</span>
          <b class="ft-fee-amt">${fmtMoney(e.amount)}</b>
          ${canDelete ? `<div class="sf-actions">${sfBtn('danger', '', 'Remove', `removeExtraFeeDef(${i})`)}</div>` : ''}
        </article>`).join('')
        || `<div class="sf-card ft-empty" style="grid-column:1/-1;"><b>No extra fees defined yet</b>Add one above and it will appear here.</div>`}
    </div>`;
}

/* ---------- 4. Late Fees ---------- */

function ftLatePreview(){
  const el = document.getElementById('lfPreview');
  if(!el) return;
  const due = (document.getElementById('lfDueDate') || {}).value;
  const grace = Number((document.getElementById('lfGrace') || {}).value) || 0;
  const amt = Number((document.getElementById('lfAmount') || {}).value) || 0;
  if(!due || !(amt > 0)){ el.textContent = 'Set a due date and an amount to see how the rule reads.'; return; }
  el.textContent = `Fees still unpaid more than ${grace} day${grace === 1 ? '' : 's'} after ${due} carry a late fee of ${fmtMoney(amt)}.`;
}

function renderLateFeesTab(body){
  const canEdit = canSub('managefee_late', 'managefee', 'edit');
  body.innerHTML = `
    <div class="ft-grid">
      <section class="sf-card ft-card">
        ${ftCardHead('Late fee rule', 'Applies uniformly across the school. A per-class or per-student rule would be a future refinement.')}
        <div class="ft-form">
          <label class="ft-field"><span>Fee due date</span><input type="date" class="input" id="lfDueDate" value="${ftEsc(lateFeeSettings.dueDate || '')}" oninput="ftLatePreview()"></label>
          <label class="ft-field"><span>Grace period (days)</span><input type="number" min="0" class="input" id="lfGrace" value="${Number(lateFeeSettings.graceDays) || 0}" oninput="ftLatePreview()"></label>
          <label class="ft-field"><span>Late fee amount (₹)</span><input type="number" min="0" class="input" id="lfAmount" value="${Number(lateFeeSettings.amount) || 0}" oninput="ftLatePreview()"></label>
        </div>
        <p class="ft-preview" id="lfPreview" aria-live="polite"></p>
        ${canEdit ? sfBtn('primary', 'check', 'Save late fee rule', 'saveLateFeeSettings()') : ''}
      </section>
      <section class="sf-card ft-card">
        ${ftCardHead('Receipt numbering', 'Switching over from another system? Set where receipt numbers should continue (if your last printed receipt was 001666, enter 1667).')}
        <div class="ft-form">
          <label class="ft-field"><span>School code on receipts (e.g. SPS → SPS-26-000001)</span><input type="text" maxlength="8" class="input" id="rsPrefix" value="${String(receiptSettings.prefix || 'REHS').replace(/[^A-Za-z0-9]/g,'')}"></label>
          <label class="ft-field"><span>Next receipt starts at</span><input type="number" min="1" class="input" id="rsStart" value="${Number(receiptSettings.startNumber) || 1}"></label>
        </div>
        ${canEdit ? sfBtn('primary', 'check', 'Save receipt numbering', 'saveReceiptSettings()') : ''}
      </section>
    </div>`;
  ftLatePreview();
}

/* ---------- 5. Fee Defaulters ---------- */

function ftDefaultersFiltered(){
  let list = computeDefaulters();
  const f = defaulterFilters;
  if(f.className) list = list.filter(d => d.student.className === f.className);
  if(f.section) list = list.filter(d => d.student.section === f.section);
  if(f.name) list = list.filter(d => (d.student.firstName + ' ' + d.student.lastName).toLowerCase().includes(f.name.toLowerCase()));
  if(f.phone) list = list.filter(d => (d.parentPhone || '').includes(f.phone));
  return list;
}

function ftDefaulterRowHtml(d, canNotify){
  const parts = '<span class="ft-parts">' + [['Tuition', d.tuitionBal], ['Bus', d.busBal], ['Stock', d.stockBal], ['Hostel', d.hostelBal]]
    .filter(p => p[1] > 0).map(p => `<span class="ft-part">${p[0]} ${fmtMoney(p[1])}</span>`).join('') + '</span>';
  const state = d.dueTillToday > 0 ? 'overdue' : 'pending';
  return `<tr>
    <td><div class="ft-who">${sfAvatar(d.student)}<span><b>${ftEsc(d.student.firstName + ' ' + d.student.lastName)}</b><small>${ftEsc(d.student.className)} - ${ftEsc(d.student.section)} · ${ftEsc(d.student.admissionNo || '')}</small></span></div></td>
    <td>${d.parentPhone ? ftEsc(d.parentPhone) : '—'}</td>
    <td>${ftEsc(d.nextDue || lateFeeSettings.dueDate || '—')}</td>
    <td>${d.dueTillToday > 0 ? `<b>${fmtMoney(d.dueTillToday)}</b>` : '—'}</td>
    <td><b class="ft-owe">${fmtMoney(d.total)}</b>${parts}</td>
    <td>${sfBadge(state)}</td>
    <td class="sf-actions">${canNotify ? sfBtn('link', '', 'Notify', `openNotifyModal('single','${d.student.id}')`) : ''}</td>
  </tr>`;
}

function paintFtDefaulters(){
  const rowsEl = document.getElementById('ftDfRows');
  if(!rowsEl) return;
  const canNotify = canSub('managefee_defaulters', 'managefee', 'create');
  const list = ftDefaultersFiltered();
  const totalPages = Math.max(1, Math.ceil(list.length / defaulterPageSize));
  if(defaulterPage > totalPages) defaulterPage = totalPages;
  const start = (defaulterPage - 1) * defaulterPageSize;
  const pageItems = list.slice(start, start + defaulterPageSize);
  const outstanding = list.reduce((s, d) => s + d.total, 0);
  const dueNow = list.reduce((s, d) => s + (d.dueTillToday || 0), 0);

  document.getElementById('ftDfKpis').innerHTML =
    sfKpi('Defaulters', list.length, list.length ? 'danger' : 'good', list.length ? 'Students with a balance' : 'Nobody owes anything')
    + sfKpi('Total outstanding', fmtMoney(outstanding), outstanding ? 'danger' : 'good')
    + sfKpi('Due till today', fmtMoney(dueNow), dueNow ? 'warn' : 'good', 'Already past its due date');

  rowsEl.innerHTML = pageItems.length ? pageItems.map(d => ftDefaulterRowHtml(d, canNotify)).join('')
    : `<tr><td colspan="7"><div class="ft-empty"><b>${list.length === 0 && !defaulterFilters.className && !defaulterFilters.section && !defaulterFilters.name && !defaulterFilters.phone ? 'No defaulters' : 'No defaulters match'}</b>${list.length === 0 ? 'Every active student is paid up, or nothing matches the filters.' : ''}</div></td></tr>`;

  document.getElementById('ftDfCount').textContent =
    (pageItems.length ? start + 1 : 0) + '–' + Math.min(start + defaulterPageSize, list.length) + ' of ' + list.length;
  document.getElementById('ftDfPage').textContent = 'Page ' + defaulterPage + ' of ' + totalPages;
  document.getElementById('ftDfPrev').disabled = defaulterPage <= 1;
  document.getElementById('ftDfNext').disabled = defaulterPage >= totalPages;
  const scoped = document.getElementById('ftDfNotifyScoped');
  if(scoped){
    scoped.style.display = (canNotify && defaulterFilters.className) ? '' : 'none';
    scoped.lastChild.textContent = 'Notify ' + defaulterFilters.className + (defaulterFilters.section ? ' - ' + defaulterFilters.section : '');
  }
}

function onDefaulterFilterChange(){
  defaulterFilters = {
    className: document.getElementById('dfClass').value,
    section: document.getElementById('dfSection').value,
    name: document.getElementById('dfName').value,
    phone: document.getElementById('dfPhone').value,
  };
  defaulterPage = 1;
  paintFtDefaulters();
}
function changeDefaulterPageSize(val){ defaulterPageSize = Number(val); defaulterPage = 1; paintFtDefaulters(); }
function changeDefaulterPage(dir){ defaulterPage += dir; paintFtDefaulters(); }

function renderDefaultersTab(body){
  const canNotify = canSub('managefee_defaulters', 'managefee', 'create');
  const canPrint = canSub('managefee_defaulters', 'managefee', 'print');
  const f = defaulterFilters;
  body.innerHTML = `
    <div class="sf-kpis" id="ftDfKpis"></div>
    <div class="iv-toolbar">
      <select class="input" id="dfClass" onchange="onDefaulterFilterChange()" aria-label="Class"><option value="">All classes</option>${CLASS_LEVELS.map(c => `<option ${f.className === c ? 'selected' : ''}>${ftEsc(c)}</option>`).join('')}</select>
      <select class="input" id="dfSection" onchange="onDefaulterFilterChange()" aria-label="Section"><option value="">All sections</option>${SECTIONS.map(s => `<option value="${ftEsc(s)}" ${f.section === s ? 'selected' : ''}>Section ${ftEsc(s)}</option>`).join('')}</select>
      <input class="input iv-search" id="dfName" type="search" placeholder="Search name…" value="${ftEsc(f.name)}" oninput="onDefaulterFilterChange()" autocomplete="off">
      <input class="input iv-search" id="dfPhone" type="search" placeholder="Parent phone…" value="${ftEsc(f.phone)}" oninput="onDefaulterFilterChange()" autocomplete="off">
      <div class="iv-toolbar-actions">
        ${canNotify ? sfBtn('soft', '', 'Notify all defaulters', "openNotifyModal('all')") : ''}
        ${canNotify ? `<span id="ftDfNotifyScoped" style="display:none;">${sfBtn('soft', '', 'Notify', "openNotifyModal('filtered')")}</span>` : ''}
        ${canPrint ? sfBtn('soft', 'down', 'Excel', 'downloadDefaultersExcel()') : ''}
        ${canPrint ? sfBtn('soft', 'down', 'PDF', 'downloadDefaultersPDF()') : ''}
      </div>
    </div>
    <div class="sf-card">
      <div class="table-wrap">
        <table class="iv-table ft-table">
          <thead><tr><th>Student</th><th>Parent phone</th><th>Next due</th><th>Due till today</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
          <tbody id="ftDfRows"></tbody>
        </table>
      </div>
    </div>
    <div class="ft-pager">
      <span class="iv-count">Showing <span id="ftDfCount"></span>
        <select class="input" onchange="changeDefaulterPageSize(this.value)" aria-label="Rows per page">
          ${[10, 25, 50, 100].map(n => `<option value="${n}" ${defaulterPageSize === n ? 'selected' : ''}>${n} / page</option>`).join('')}
        </select>
      </span>
      <span class="ft-pager-btns">
        <button type="button" class="sf-btn sf-btn--soft" id="ftDfPrev" onclick="changeDefaulterPage(-1)">Prev</button>
        <span class="iv-count" id="ftDfPage"></span>
        <button type="button" class="sf-btn sf-btn--soft" id="ftDfNext" onclick="changeDefaulterPage(1)">Next</button>
      </span>
    </div>`;
  paintFtDefaulters();
}
