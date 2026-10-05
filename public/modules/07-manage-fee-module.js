const FEE_TYPES_KEY = "fee-types";
  const DISCOUNT_TYPES_KEY = "discount-types";
  const STUDENT_DISCOUNTS_KEY = "student-discounts";
  const EXTRA_FEE_DEFS_KEY = "extra-fee-defs";
  const STUDENT_EXTRA_FEES_KEY = "student-extra-fees";
  const LATE_FEE_SETTINGS_KEY = "late-fee-settings";
  const RECEIPT_SETTINGS_KEY = "receipt-settings";
  const DISCOUNT_TYPE_OPTIONS = ['General Discount','Special Discount','RTE Discount','Sibling Discount','Personal Discount'];
  // These two keys are declared here rather than up with the others, since
  // API_BACKED_KEYS is created before this point in the file — adding them
  // as separate assignments avoids a "used before declaration" crash.
  API_BACKED_KEYS[STUDENT_DISCOUNTS_KEY] = '/api/discounts';
  API_BACKED_KEYS[STUDENT_EXTRA_FEES_KEY] = '/api/extra-fees';
  [FEE_TYPES_KEY, DISCOUNT_TYPES_KEY, EXTRA_FEE_DEFS_KEY, LATE_FEE_SETTINGS_KEY, RECEIPT_SETTINGS_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });

  let feeTypes = [];
  let discountTypes = [];
  let studentDiscounts = [];
  let extraFeeDefs = [];
  let studentExtraFees = [];
  let lateFeeSettings = { amount:0, graceDays:0, dueDate:'' };
  let receiptSettings = { startNumber: 1 };

  async function loadFeeExtras(){
    feeTypes = await storageGet(FEE_TYPES_KEY, ['Tuition Fee','Bus Fee','Stock','Hostel Fee']);
    discountTypes = await storageGet(DISCOUNT_TYPES_KEY, []);
    studentDiscounts = await storageGet(STUDENT_DISCOUNTS_KEY, []);
    extraFeeDefs = await storageGet(EXTRA_FEE_DEFS_KEY, []);
    studentExtraFees = await storageGet(STUDENT_EXTRA_FEES_KEY, []);
    lateFeeSettings = await storageGet(LATE_FEE_SETTINGS_KEY, { amount:0, graceDays:0, dueDate:'' });
    receiptSettings = await storageGet(RECEIPT_SETTINGS_KEY, { startNumber: 1 });
  }

  let feeTab = 'fees';
  let feeView = 'grid';
  let feeCurrentClass = '', feeCurrentSection = '', feeCurrentStudentId = '';
  let defaulterPage = 1, defaulterPageSize = 10;
  let defaulterFilters = { className:'', section:'', name:'', phone:'' };

  const MF_TAB_PERM_KEYS = { fees:'managefee_collection', structure:'managefee_structure', types:'managefee_types', discounts:'managefee_discounts', extra:'managefee_extra', late:'managefee_late', defaulters:'managefee_defaulters' };
  async function initManageFeeView(){
    await ensureDataLoaded('payments', loadPaymentsData);
    populateMfAyBadgeAndSelect();
    const classSel = document.getElementById('mfClassFilter');
    if(classSel.options.length <= 1){
      CLASS_LEVELS.forEach(c => { const o=document.createElement('option'); o.value=c; o.textContent=c; classSel.appendChild(o); });
    }
    const secSel = document.getElementById('mfSectionFilter');
    if(secSel.options.length <= 1){
      SECTIONS.forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent='Section '+s; secSel.appendChild(o); });
    }
    const accessibleTabs = Object.keys(MF_TAB_PERM_KEYS).filter(t => getManageFeeTabAccess(currentUser.role, MF_TAB_PERM_KEYS[t]));
    Object.keys(MF_TAB_PERM_KEYS).forEach(t => {
      const btn = document.getElementById('mftab-'+t);
      if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none';
    });
    if(!accessibleTabs.includes(feeTab)) feeTab = accessibleTabs[0] || 'fees';
    switchFeeTab(feeTab);
  }

  function populateMfAyBadgeAndSelect(){
    document.getElementById('mfAyBadge').textContent = 'AY ' + currentAcademicYearValue;
    const sel = document.getElementById('mfAySelect');
    sel.innerHTML = academicYears.map(y => `<option value="${y}" ${y===currentAcademicYearValue?'selected':''}>${y}</option>`).join('');
  }

  async function changeAcademicYearFromFee(){
    currentAcademicYearValue = document.getElementById('mfAySelect').value;
    await storageSet(CURRENT_AY_KEY, currentAcademicYearValue);
    document.getElementById('ayBadge').textContent = 'AY ' + currentAcademicYearValue;
    showToast('Academic year updated.', 'burst');
  }

  function switchFeeTab(tab){
    feeTab = tab;
    ['fees','structure','types','discounts','extra','late','defaulters'].forEach(t => {
      const btn = document.getElementById('mftab-'+t);
      if(btn) btn.classList.toggle('active', t===tab);
    });
    document.getElementById('mfSearchRow').style.display = tab==='fees' ? 'flex' : 'none';
    if(tab === 'fees') feeView = 'grid';
    if(tab === 'discounts') discView = 'list';
    renderFeeBody();
  }

  async function renderFeeBody(){
    await ensureDataLoaded('payments', loadPaymentsData);
    const body = document.getElementById('feeBody');
    if(!body) return;
    if(!getManageFeeTabAccess(currentUser.role, MF_TAB_PERM_KEYS[feeTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(feeTab === 'fees'){
      if(feeView === 'grid') return renderFeeClassGrid(body);
      if(feeView === 'section') return renderFeeSectionList(body);
      if(feeView === 'ledger') return renderStudentLedger(body);
    }
    if(feeTab === 'structure') return renderFeeStructureTab(body);
    if(feeTab === 'types') return renderFeeTypesTab(body);
    if(feeTab === 'discounts') return renderDiscountsTab(body);
    if(feeTab === 'extra') return renderExtraFeesTab(body);
    if(feeTab === 'late') return renderLateFeesTab(body);
    if(feeTab === 'defaulters') return renderDefaultersTab(body);
  }

  /* --- Student Fees: class grid / section / ledger --- */
  let expandedFeeClass = '';
  function toggleFeeClassExpand(cls){
    expandedFeeClass = (expandedFeeClass === cls) ? '' : cls;
    renderFeeClassGrid(document.getElementById('feeBody'));
  }
  function renderFeeClassGrid(body){
    const classF = document.getElementById('mfClassFilter').value;
    let gradIdx = 0;
    const cards = CLASS_LEVELS.filter(c => !classF || c===classF).map(cls => {
      const secData = sectionsForClass(cls).map(sec => {
        const list = students.filter(s => s.className===cls && s.section===sec && isActive(s));
        let outstanding = 0;
        list.forEach(s => { const { totals } = computeStudentFinance(s); if(totals.receivable > 0) outstanding++; });
        return { sec, count: list.length, outstanding };
      }).filter(x => x.count > 0);
      if(!secData.length) return ''; // strictly follow school setup: no students → don't show this class at all
      const total = secData.reduce((sum,x) => sum+x.count, 0);
      const totalOutstanding = secData.reduce((sum,x) => sum+x.outstanding, 0);
      const isOpen = expandedFeeClass === cls;
      const idx = gradIdx % 4; gradIdx++;
      const chips = secData.map(x => `
        <button type="button" class="fee-sec-chip ${x.outstanding>0?'fee-chip-pending':'fee-chip-clear'}" onclick="event.stopPropagation(); openFeeSection('${cls}','${x.sec}')">
          <span class="fee-chip-sec">Sec ${x.sec}</span>
          <span class="fee-chip-count">${x.count}</span>
          ${x.outstanding>0 ? `<span class="fee-chip-dot" title="${x.outstanding} pending"></span>` : ''}
        </button>`).join('');
      return `
        <div class="fee-modern-card ${isOpen?'expanded':''}" data-idx="${idx}">
          <div class="fee-modern-header" onclick="toggleFeeClassExpand('${cls}')">
            <div class="fee-modern-icon">🎓</div>
            <div class="fee-modern-titlewrap">
              <div class="fee-modern-name">${cls}</div>
              <div class="fee-modern-meta">${total} student${total===1?'':'s'} · ${totalOutstanding>0 ? `<span class="fee-modern-pending">${totalOutstanding} pending</span>` : `<span class="fee-modern-clear">all clear</span>`}</div>
            </div>
            <svg class="fee-modern-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="fee-modern-chips">${chips}</div>
        </div>`;
    }).filter(Boolean).join('');
    body.innerHTML = cards ? `<div class="fee-modern-grid">${cards}</div>` : `<div class="empty-state"><b>No students found for the selected class.</b></div>`;
  }

  function openFeeSection(cls, sec){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    feeCurrentClass = cls; feeCurrentSection = sec;
    feeView = 'section';
    renderFeeBody();
  }
  function backToFeeGrid(){ window.scrollTo({top:0,left:0,behavior:'instant'}); feeView = 'grid'; renderFeeBody(); }
  function backToFeeSection(){ window.scrollTo({top:0,left:0,behavior:'instant'}); feeView = 'section'; renderFeeBody(); }

  function renderFeeSectionList(body){
    const rows = students.filter(s => s.className===feeCurrentClass && s.section===feeCurrentSection && isActive(s));
    const canPay = canSub('managefee_collection','managefee','create');
    const canPrint = canSub('managefee_collection','managefee','print');
    const tableRows = rows.map(s => {
      const { totals } = computeStudentFinance(s);
      const { hasSiblings, familyIds, totals: familyTotals } = getFamilySummary(s);
      const allPaid = totals.receivable <= 0;
      const famNote = (val) => hasSiblings ? `<div style="font-size:0.68rem; color:var(--ink-soft); margin-top:2px; font-weight:400;">👪 Family: ${fmtMoney(val)}</div>` : '';
      return `<tr>
        <td class="name-cell" style="cursor:pointer;" onclick="openStudentLedger('${s.id}')">
          ${s.firstName} ${s.lastName}
          <div style="font-size:0.72rem; color:var(--ink-soft); font-weight:400;">${s.admissionNo}${s.fatherName ? ` · S/o ${s.fatherName}` : ''}</div>
          ${hasSiblings ? `<span class="pill" style="margin-top:4px; display:inline-block;">Siblings: ${familyIds.length-1}</span>` : ''}
        </td>
        <td>${fmtMoney(totals.collected)}${famNote(familyTotals.collected)}</td>
        <td class="balance-tag ${totals.receivable>0?'due':'zero'}">${fmtMoney(totals.receivable)}${famNote(familyTotals.receivable)}</td>
        <td>${totals.discount>0?fmtMoney(totals.discount):'-'}${famNote(familyTotals.discount)}</td>
        <td>${fmtMoney(totals.expected)}${famNote(familyTotals.expected)}</td>
        <td>${allPaid
          ? `<span class="pill" style="background:var(--success-bg,#e5f6ee); color:var(--success-ink,#1E8E5A);">✓ All Paid</span>`
          : `<span class="pill" style="background:var(--warning-bg,#fdf1dd); color:var(--warning-ink,#9a6400);">⏱ Pending</span>`}</td>
        <td>
          ${!allPaid && canPay ? `<button class="btn btn-primary btn-sm" onclick="openFamilyFeeModal('${s.id}')">Pay</button>` : ''}
          ${canPrint ? `<button class="btn btn-ghost btn-sm" onclick="openStudentReceipts('${s.id}')">Receipts</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openStudentLedger('${s.id}')">View Details</button>
        </td>
      </tr>`;
    }).join('');
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToFeeGrid()">All Classes</a> &nbsp;/&nbsp; ${feeCurrentClass} — Section ${feeCurrentSection}</div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table><thead><tr><th>Student</th><th>Total Paid</th><th>Outstanding</th><th>Discount</th><th>Total Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${tableRows}</tbody></table>
        ${rows.length===0 ? `<div class="empty-state"><b>No students here</b></div>` : ``}
      </div>`;
  }

  // "Receipts" quick action from the class-section list: jumps straight to
  // this student's ledger and scrolls to their Payment History, instead of
  // opening a whole separate view just to find past receipts.
  function openStudentReceipts(id){
    openStudentLedger(id);
    setTimeout(() => {
      const heading = Array.from(document.querySelectorAll('#feeBody h3')).find(h => h.textContent.includes('Payment History'));
      if(heading) heading.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 60);
  }

  function openStudentLedger(id){
    feeCurrentStudentId = id;
    feeView = 'ledger';
    ledgerFamilyView = 'single';
    renderFeeBody();
  }

  function computeLateFeeFor(outstanding){
    if(!lateFeeSettings.dueDate || !lateFeeSettings.amount || outstanding <= 0) return 0;
    const due = new Date(lateFeeSettings.dueDate);
    const grace = Number(lateFeeSettings.graceDays) || 0;
    const cutoff = new Date(due);
    cutoff.setDate(cutoff.getDate() + grace);
    return new Date() > cutoff ? Number(lateFeeSettings.amount) : 0;
  }

  // Every category + extra-fee item for a student, split into what's still
  // pending vs. already fully paid. Shared by the single-student ledger view,
  // the class-section list's Family Total figures, and the Collect Family
  // Fees modal, so all three always agree on what's actually owed.
  function computePendingFeeRows(s){
    const { perCat, extras } = computeStudentFinance(s);
    const today = localISODate();
    const FREQ = { yearly: 'Annually', terms: 'Terms', monthly: 'Monthly' };
    const catRows = Object.keys(CATS).filter(c => perCat[c].expected > 0).map(c => {
      // Installments are derived from the remittance schedule (Fee Structure);
      // with no schedule saved they collapse to one full-year installment, so
      // totals, outstanding and late fee match the pre-schedule behaviour.
      const sch = studentCategorySchedule(c, perCat[c], today);
      const next = sch.summary.firstUnpaid;
      return {
        type: 'category', key: c, label: CATS[c],
        total: perCat[c].expected, paid: perCat[c].collected, discount: perCat[c].discount,
        outstanding: perCat[c].receivable,
        lateFee: scheduleLateFee(sch.installments, lateFeeSettings, new Date()),
        dueDate: (next && next.due) || lateFeeSettings.dueDate || '—',
        frequency: FREQ[sch.mode] || 'Annually',
        mode: sch.mode, installments: sch.installments,
        dueTillToday: sch.summary.dueTillToday, overdueAmount: sch.summary.overdueAmount,
      };
    });
    const extraRows = extras.map(e => {
      const paidAmt = Number(e.paidAmount) || 0;
      const outstanding = Math.max((Number(e.amount)||0) - paidAmt, 0);
      return {
        type: 'extra', key: e.id, label: e.name,
        total: Number(e.amount)||0, paid: paidAmt, discount: 0,
        outstanding, lateFee: 0, dueDate: e.date || '—', frequency: 'One-time',
      };
    });
    const allRows = [...catRows, ...extraRows];
    const pendingRows = allRows.filter(r => r.outstanding > 0);
    const paidRows = allRows.filter(r => r.outstanding <= 0);
    const totalPendingOutstanding = pendingRows.reduce((sum,r) => sum+r.outstanding, 0);
    return { allRows, pendingRows, paidRows, totalPendingOutstanding };
  }

  // Aggregates computeStudentFinance() totals across a student's whole
  // family (self + linked siblings, in either direction). Used to show
  // "Family Total" figures next to a student's own figures wherever it's
  // useful to see the whole household's fee position at a glance.
  function getFamilySummary(s){
    const familyIds = getFamilyIds(s);
    const hasSiblings = familyIds.length > 1;
    const totals = familyIds.reduce((acc, id) => {
      const member = students.find(x => x.id === id);
      if(!member) return acc;
      const t = computeStudentFinance(member).totals;
      return {
        expected: acc.expected + t.expected, collected: acc.collected + t.collected,
        discount: acc.discount + t.discount, receivable: acc.receivable + t.receivable,
      };
    }, { expected:0, collected:0, discount:0, receivable:0 });
    return { familyIds, hasSiblings, totals };
  }

  // 'single' shows just the opened student's own fee rows (unchanged
  // behaviour); 'family' shows the whole household side by side. Reset
  // whenever a different student's ledger is opened, so it never leaks
  // across students.
  let ledgerFamilyView = 'single';
  function setLedgerFamilyView(mode){
    ledgerFamilyView = mode;
    renderFeeBody();
  }

  // Read-only per-member breakdown for the ledger's Family view — every fee
  // head each sibling owes or has paid, side by side. Actual money collection
  // for more than one student always goes through the Collect Family Fees
  // modal, never through inputs on this page, so there's only one code path
  // that ever creates a multi-student batch of payments.
  function renderFamilyMembersReadOnly(familyIds, focusId){
    return familyIds.map(id => {
      const m = students.find(x => x.id === id);
      if(!m) return '';
      const { allRows } = computePendingFeeRows(m);
      const { totals } = computeStudentFinance(m);
      const rowsHtml = allRows.length ? allRows.map(r => `
        <tr>
          <td><span class="pill">${r.label}</span></td>
          <td>${r.dueDate}</td>
          <td>${fmtMoney(r.total)}</td>
          <td>${fmtMoney(r.paid)}</td>
          <td>${r.discount>0?fmtMoney(r.discount):'-'}</td>
          <td>${r.lateFee>0?fmtMoney(r.lateFee):'-'}</td>
          <td class="balance-tag ${r.outstanding>0?'due':'zero'}">${fmtMoney(r.outstanding)}</td>
        </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No fee items</b></div></td></tr>`;
      const open = id === focusId;
      return `
        <div style="margin-bottom:14px;">
          <div onclick="toggleFamilyMemberCard('${id}')" style="cursor:pointer; display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:14px 18px; background:var(--surface-2,#f5f2e9); border-radius:14px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="transition:transform .2s ease; transform:rotate(${open?90:0}deg); flex:none;" id="famChevron-${id}"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <b>${m.firstName} ${m.lastName}</b>
            ${id===focusId ? `<span class="pill">Self</span>` : ``}
            <span class="pill">${m.className} - Section ${m.section}</span>
            <span style="margin-left:auto; font-weight:700; color:${totals.receivable>0?'var(--magenta)':'var(--teal,#1E8E5A)'};">${totals.receivable>0?fmtMoney(totals.receivable)+' due':'All Paid'}</span>
          </div>
          <div id="famCard-${id}" style="${open?'':'display:none;'} margin-top:8px;">
            <div class="table-wrap"><table><thead><tr><th>Type</th><th>Due Date</th><th>Total Amount</th><th>Paid</th><th>Discount</th><th>Late Fees</th><th>Outstanding</th></tr></thead>
            <tbody>${rowsHtml}</tbody></table></div>
          </div>
        </div>`;
    }).join('');
  }
  function toggleFamilyMemberCard(id){
    const el = document.getElementById('famCard-'+id);
    const chev = document.getElementById('famChevron-'+id);
    if(!el) return;
    const opening = el.style.display === 'none';
    el.style.display = opening ? '' : 'none';
    if(chev) chev.style.transform = opening ? 'rotate(90deg)' : 'rotate(0deg)';
  }

  function renderStudentLedger(body){
    const s = students.find(x => x.id === feeCurrentStudentId);
    if(!s){ feeView = 'grid'; return renderFeeBody(); }
    const { extras } = computeStudentFinance(s);
    const studentPayments = payments.filter(p => p.studentId === s.id).sort((a,b) => (b.date||'').localeCompare(a.date||''));

    const { familyIds, hasSiblings, totals: familyTotals } = getFamilySummary(s);
    if(!hasSiblings) ledgerFamilyView = 'single';
    const { pendingRows, paidRows, totalPendingOutstanding } = computePendingFeeRows(s);

    // The Single Student / Family toggle plus the household-wide summary
    // card and its Collect Family Fees button — only ever shown once this
    // student has a linked sibling.
    const familySectionHtml = hasSiblings ? `
      <div class="ms-toolbar" style="margin-bottom:14px;">
        <div class="ms-toolbar-left"></div>
        <div class="ms-toolbar-right">
          <button type="button" class="mf-tab ${ledgerFamilyView==='single'?'active':''}" onclick="setLedgerFamilyView('single')">Single Student</button>
          <button type="button" class="mf-tab ${ledgerFamilyView==='family'?'active':''}" onclick="setLedgerFamilyView('family')">Family</button>
        </div>
      </div>
      <div class="dash-section-title"><div><h3>👪 Family Summary</h3><span class="eyebrow-sm">${familyIds.length} member${familyIds.length===1?'':'s'}</span></div>
        ${canSub('managefee_collection','managefee','create') ? `<button class="btn btn-primary btn-sm" onclick="openFamilyFeeModal('${s.id}')">💰 Collect Family Fees</button>` : ''}
      </div>
      <div class="fee-summary-row" style="margin-bottom:20px;">
        <div class="fee-sum-card"><b>${fmtMoney(familyTotals.expected)}</b><span>Total Amount</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(familyTotals.collected)}</b><span>Total Paid</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(familyTotals.receivable)}</b><span>Total Outstanding</span></div>
        <div class="fee-sum-card"><b>${familyTotals.discount>0?fmtMoney(familyTotals.discount):'-'}</b><span>Total Discount</span></div>
      </div>
    ` : ``;

    // In Family view, the rest of the page (below) is replaced entirely by
    // a per-member read-only breakdown — actual collection always happens
    // through the Collect Family Fees modal above, never inline here, so
    // there's exactly one place that creates payment records for more than
    // one student at a time.
    if(hasSiblings && ledgerFamilyView === 'family'){
      body.innerHTML = `
        <div class="breadcrumb"><a onclick="backToFeeGrid()">All Classes</a> &nbsp;/&nbsp; <a onclick="backToFeeSection()">${s.className} — ${s.section}</a> &nbsp;/&nbsp; ${s.firstName} ${s.lastName}</div>
        <div class="profile-head">
          ${s.photo ? `<img class="profile-photo" src="${s.photo}">` : `<div class="profile-photo">${initials(s)}</div>`}
          <div><h2>${s.firstName} ${s.lastName}</h2><div class="p-meta">${s.admissionNo} · ${s.className} — Section ${s.section} · <span class="pill">Siblings: ${familyIds.length-1}</span></div></div>
        </div>
        ${familySectionHtml}
        ${renderFamilyMembersReadOnly(familyIds, s.id)}
      `;
      return;
    }

    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToFeeGrid()">All Classes</a> &nbsp;/&nbsp; <a onclick="backToFeeSection()">${s.className} — ${s.section}</a> &nbsp;/&nbsp; ${s.firstName} ${s.lastName}</div>
      <div class="profile-head">
        ${s.photo ? `<img class="profile-photo" src="${s.photo}">` : `<div class="profile-photo">${initials(s)}</div>`}
        <div><h2>${s.firstName} ${s.lastName}</h2><div class="p-meta">${s.admissionNo} · ${s.className} — Section ${s.section}${hasSiblings ? ` · <span class="pill">Siblings: ${familyIds.length-1}</span>` : ''}</div></div>
        <div class="profile-actions">
          ${canSub('managefee_collection','managefee','create') ? `<button class="btn btn-ghost" onclick="addAdmissionFeeForStudent('${s.id}')">➕ Add Admission Fee</button>` : ''}
          ${canSub('managefee_collection','managefee','create') ? `<button class="btn btn-ghost" onclick="openExtraFeeAssignModal('${s.id}')">➕ Assign Extra Fee</button>` : ''}
        </div>
      </div>

      ${familySectionHtml}

      ${paidRows.length ? `
      <div class="fully-paid-banner" onclick="toggleFullyPaidBanner()">
        <svg id="fpChevron" width="16" height="16" viewBox="0 0 24 24" fill="none" style="transition:transform .2s ease;"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>✓ Fully Paid (${paidRows.length} item${paidRows.length===1?'':'s'})</span>
        <span class="fp-total">Total Paid: ${fmtMoney(paidRows.reduce((sum,r) => sum+r.paid, 0))}</span>
      </div>
      <div id="fullyPaidDetail" style="display:none;">
        <div class="table-wrap" style="margin-bottom:20px;">
          <table><thead><tr><th>Type</th><th>Total Amount</th><th>Paid</th><th>Discount</th></tr></thead><tbody>
          ${paidRows.map(r => `<tr><td><span class="pill">${r.label}</span></td><td>${fmtMoney(r.total)}</td><td>${fmtMoney(r.paid)}</td><td>${r.discount>0?fmtMoney(r.discount):'-'}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>` : ``}

      ${pendingRows.length ? `
      <div class="dash-section-title"><div><h3>Pending Fees (${pendingRows.length} item${pendingRows.length===1?'':'s'})</h3></div></div>
      <div class="ms-toolbar" style="margin-bottom:14px;">
        <div class="ms-toolbar-left" style="align-items:center;">
          <span style="font-size:0.85rem; font-weight:600; color:var(--navy);">Quick Pay:</span>
          <input type="number" min="0" id="quickPayAmt" placeholder="Enter amount" style="max-width:150px;" oninput="onQuickPayInput()" onkeydown="submitOnEnter(event, () => submitLedgerPayments('${s.id}'))">
          <span style="font-size:0.76rem; color:var(--ink-soft);">Max ${fmtMoney(totalPendingOutstanding)}</span>
          <select id="ledgerPayMode" style="margin-left:16px;"><option>Cash</option><option>Online</option><option>Cheque</option></select>
          <label style="margin-left:16px; font-size:0.78rem; color:var(--ink-soft); display:flex; align-items:center; gap:6px;">Date
            <input type="date" id="ledgerPayDate" value="${new Date().toISOString().slice(0,10)}" max="${new Date().toISOString().slice(0,10)}" style="padding:5px 8px; border-radius:7px; border:1.5px solid var(--border);">
          </label>
        </div>
      </div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table><thead><tr>
          <th>Type</th><th>Due Date</th><th>Frequency</th><th>Total Amount</th><th>Paid</th><th>Discount</th><th>Late Fees</th><th>Outstanding</th><th>Amount to Pay</th>
        </tr></thead><tbody>
        ${pendingRows.map(r => `
          <tr>
            <td><span class="pill">${r.label}</span></td>
            <td>${r.dueDate}</td>
            <td>${r.frequency}</td>
            <td>${fmtMoney(r.total)}</td>
            <td>${fmtMoney(r.paid)}</td>
            <td>${r.discount>0?fmtMoney(r.discount):'-'}</td>
            <td>${r.lateFee>0?`<span style="color:var(--magenta); font-weight:600;">${fmtMoney(r.lateFee)}</span>`:'-'}</td>
            <td class="balance-tag due">${fmtMoney(r.outstanding)}</td>
            <td><input type="number" min="0" max="${r.outstanding}" class="ledger-pay-input" data-type="${r.type}" data-key="${r.key}" data-outstanding="${r.outstanding}" value="0" oninput="onLedgerPayInput()" onkeydown="submitOnEnter(event, () => submitLedgerPayments('${s.id}'))" style="width:100px; padding:6px 8px; border-radius:7px; border:1.5px solid var(--border);"></td>
          </tr>
        `).join('')}
        </tbody></table>
      </div>
      <div class="pay-summary-box">
        <div class="pay-summary-grid">
          <div class="pay-summary-item"><span>Total Amount</span><b>${fmtMoney(pendingRows.reduce((sum,r) => sum+r.total, 0))}</b></div>
          <div class="pay-summary-item"><span>Total Paid</span><b>${fmtMoney(pendingRows.reduce((sum,r) => sum+r.paid, 0))}</b></div>
          <div class="pay-summary-item highlight"><span>Total Outstanding</span><b>${fmtMoney(totalPendingOutstanding)}</b></div>
          <div class="pay-summary-item"><span>Total Late Fees</span><b>${fmtMoney(pendingRows.reduce((sum,r) => sum+r.lateFee, 0))}</b></div>
          <div class="pay-summary-item after"><span>Total to Pay</span><b id="ledgerTotalToPay">₹0</b></div>
        </div>
      </div>
      ${canSub('managefee_collection','managefee','create') ? `<div style="margin:16px 0 28px;"><button class="btn btn-primary" onclick="submitLedgerPayments('${s.id}')">💰 Record Payment(s)</button></div>` : ''}
      ` : `<div class="empty-state" style="margin-bottom:24px;"><b>No pending fees</b>Everything's fully paid for this student.</div>`}

      ${extras.length ? `
      <div class="dash-section-title"><div><h3>Extra Fees Assigned</h3></div></div>
      <div class="table-wrap" style="margin-bottom:24px;"><table><thead><tr><th>Name</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${extras.map(e => {
          const paidAmt = Number(e.paidAmount)||0;
          const statusHtml = paidAmt >= e.amount ? '<span class="pill">Paid</span>' : paidAmt > 0 ? `<span class="balance-tag due">Partially Paid (${fmtMoney(paidAmt)} of ${fmtMoney(e.amount)})</span>` : '<span class="balance-tag due">Unpaid</span>';
          return `<tr><td>${e.name}</td><td>${fmtMoney(e.amount)}</td><td>${statusHtml}</td>
          <td>${paidAmt>0?`<button class="btn-edit-text" onclick="printReceiptForExtraFee('${e.id}')">Print Receipt</button>&nbsp;·&nbsp;`:``}${canSub('managefee_collection','managefee','delete')?`<button class="btn-danger-text" onclick="removeExtraFee('${e.id}')">Remove</button>`:``}</td></tr>`;
        }).join('')}
      </tbody></table></div>` : ``}
      <div class="dash-section-title"><div><h3>Payment History</h3></div></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Mode</th><th>Amount</th><th>Discount</th><th>Status</th><th></th></tr></thead><tbody>
        ${studentPayments.length ? studentPayments.map(p => {
          const statusHtml = p.voided
            ? `<span class="balance-tag due" title="${(p.voidReason||'').replace(/"/g,'&quot;')}">${p.voidType==='refund'?'REFUNDED':'VOIDED'}</span>`
            : `<span class="pill">Recorded</span>`;
          const actions = [];
          if(!p.voided && canSub('managefee_collection','managefee','print')) actions.push(`<button class="btn-edit-text" onclick="printReceipt('${p.id}')">Print Receipt</button>`);
          if(!p.voided && canSub('managefee_collection','managefee','delete')) actions.push(`<button class="btn-danger-text" onclick="voidPayment('${p.id}')">Void</button>`);
          if(!p.voided && canSub('managefee_collection','managefee','delete')) actions.push(`<button class="btn-danger-text" onclick="openRefundPaymentModal('${p.id}')">Refund</button>`);
          return `<tr${p.voided?' style="opacity:.6;"':''}><td>${p.date||'—'}</td><td><span class="pill">${feeLabelFor(p)}</span></td><td>${p.mode||'—'}</td><td>${p.voided?`<s>${fmtMoney(p.amount)}</s>`:fmtMoney(p.amount)}</td><td>${fmtMoney(p.discount)}</td><td>${statusHtml}</td><td>${actions.join('&nbsp;·&nbsp;')}</td></tr>`;
        }).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No payments yet</b></div></td></tr>`}
      </tbody></table></div>
    `;
  }

  function toggleFullyPaidBanner(){
    const el = document.getElementById('fullyPaidDetail');
    const chev = document.getElementById('fpChevron');
    if(!el) return;
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    if(chev) chev.style.transform = open ? '' : 'rotate(90deg)';
  }

  function onQuickPayInput(){
    let amt = Number(document.getElementById('quickPayAmt').value) || 0;
    const inputs = Array.from(document.querySelectorAll('.ledger-pay-input'));
    inputs.forEach(inp => {
      const outstanding = Number(inp.dataset.outstanding) || 0;
      const take = Math.max(0, Math.min(amt, outstanding));
      inp.value = take;
      amt -= take;
    });
    updateLedgerTotalToPay();
  }
  function onLedgerPayInput(){
    document.querySelectorAll('.ledger-pay-input').forEach(inp => {
      let val = Number(inp.value) || 0;
      const max = Number(inp.dataset.outstanding) || 0;
      if(val > max) val = max;
      if(val < 0) val = 0;
      inp.value = val;
    });
    updateLedgerTotalToPay();
  }
  function updateLedgerTotalToPay(){
    const total = Array.from(document.querySelectorAll('.ledger-pay-input')).reduce((sum,inp) => sum + (Number(inp.value)||0), 0);
    const el = document.getElementById('ledgerTotalToPay');
    if(el) el.textContent = fmtMoney(total);
  }
  async function submitLedgerPayments(studentId){
    await ensureDataLoaded('payments', loadPaymentsData);
    const modeSel = document.getElementById('ledgerPayMode');
    const mode = modeSel ? modeSel.value : 'Cash';
    const entries = Array.from(document.querySelectorAll('.ledger-pay-input'))
      .map(inp => ({ type: inp.dataset.type, key: inp.dataset.key, amt: Number(inp.value) || 0 }))
      .filter(e => e.amt > 0);
    if(entries.length === 0){ showToast('Enter an amount to pay for at least one fee item.'); return; }
    const student = students.find(x => x.id === studentId);
    const today = new Date().toISOString().slice(0,10);
    // Defaults to today, but editable — needed when catching up fee entry for
    // payments that were actually collected earlier in the academic year.
    const dateInput = document.getElementById('ledgerPayDate');
    const payDate = (dateInput && dateInput.value) ? dateInput.value : today;
    if(payDate > today){ showToast('Payment date can\'t be in the future.'); return; }
    let lastId = null;
    const payCat = computeStudentFinance(student).perCat;
    entries.forEach(e => {
      if(e.type === 'extra'){
        const fee = studentExtraFees.find(x => x.id === e.key);
        if(fee){
          fee.paidAmount = (Number(fee.paidAmount)||0) + e.amt;
          if(fee.paidAmount >= fee.amount) fee.paid = true;
        }
        const record = {
          id: 'pay_' + Date.now() + '_' + e.key,
          receiptNo: nextReceiptNo(),
          studentId, studentName: student.name,
          category: 'extra', extraFeeName: fee ? fee.name : 'Extra Fee', extraFeeId: e.key,
          mode, amount: e.amt, discount: 0, instalment: '', date: payDate, note: '',
          classAtPayment: student.className,
        };
        payments.push(record);
        lastId = record.id;
        return;
      }
      const record = {
        id: 'pay_' + Date.now() + '_' + e.key,
        receiptNo: nextReceiptNo(),
        studentId, studentName: student.name,
        category: e.key, mode, amount: e.amt, discount: 0, instalment: instalmentLabelFor(e.key, payCat[e.key], e.amt), date: payDate, note: '',
        classAtPayment: student.className,
      };
      payments.push(record);
      lastId = record.id;
    });
    await storageSet(PAYMENTS_KEY, payments);
    await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    renderDashboard();
    renderFeeBody();
    showToast(entries.length + ' payment(s) recorded.', 'radial', entries.reduce((s,e)=>s+e.amt,0));
    if(lastId && await showConfirmDialog('Payment(s) recorded. Print receipt now?')){
      printReceipt(lastId);
    }
  }

  // Admin-only correction for a wrongly-recorded payment — e.g. collected
  // against the wrong fee head or the wrong student. Never deletes the row
  // (that would shift every later receipt's number, since nextReceiptNo()
  // counts payments.length) — instead flags it 'voided', the same
  // never-delete convention already used for Income/Expense/Journal
  // vouchers (see voidAccountingEntry). Every total that must exclude it
  // (computeFinance, computeStudentFinance, acctFeeIncomeTotal,
  // acctAllPostings) already filters on !p.voided.
  // For a genuine refund to a leaving/withdrawing student, use
  // openRefundPaymentModal() instead — that also posts a real Expense
  // Voucher so the money leaving is visible in Accounting; this plain void
  // is only for correcting a mis-entered payment, so no accounting outflow
  // is posted here.
  async function voidPayment(id){
    if(!canSub('managefee_collection','managefee','delete')){ showToast("You don't have permission to void payments."); return; }
    await ensureDataLoaded('payments', loadPaymentsData);
    const p = payments.find(x => x.id === id);
    if(!p || p.voided) return;
    const reason = await showPromptDialog(`Void this payment of ${fmtMoney(p.amount)}?\n\nEnter a reason (it stays visible, marked VOIDED, for audit — the receipt number is never reused):`, { title:'Void payment', okText:'Void', placeholder:'Reason for voiding' });
    if(reason === null) return;
    if(!reason.trim()){ showToast('A reason is required to void a payment.'); return; }
    p.voided = true;
    p.voidType = 'correction';
    p.voidReason = reason.trim();
    p.voidedBy = currentUser.name;
    p.voidedAt = new Date().toISOString();
    // Extra Fee amounts track paidAmount directly (not just via payments[]),
    // so a voided extra-fee payment must also roll that back or the Extra
    // Fees table would still show it as paid.
    if(p.category === 'extra' && p.extraFeeId){
      const fee = studentExtraFees.find(f => f.id === p.extraFeeId);
      if(fee){
        fee.paidAmount = Math.max(0, (Number(fee.paidAmount)||0) - (Number(p.amount)||0));
        fee.paid = fee.paidAmount >= fee.amount && fee.amount > 0;
        await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
      }
    }
    await storageSet(PAYMENTS_KEY, payments);
    renderDashboard();
    renderFeeBody();
    showToast('Payment voided.', 'burst');
  }

  /* ===== Refund a payment (Admin only) =====
     For a student who is withdrawing and needs money actually paid back —
     not just a bookkeeping correction. Does two things atomically:
       1. Marks the original payment record 'voided' (voidType:'refund') so
          it stops counting as collected everywhere (ledger, dashboards,
          Trial Balance/Income&Expenditure via acctAllPostings).
       2. Posts a real Expense Voucher (Dr Expense:"Fee Refund" / Cr the
          chosen Bank-or-Cash account) using the exact same mechanism as
          Accounting → Payment Voucher (saveExpenseVoucher), so the cash/bank
          outflow is genuinely visible in the Chart of Accounts, Ledgers,
          Trial Balance and Income & Expenditure Statement — never a silent
          delete. */
  