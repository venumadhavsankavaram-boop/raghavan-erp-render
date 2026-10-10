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
  function openFeeSection(cls, sec){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    feeCurrentClass = cls; feeCurrentSection = sec;
    feeView = 'section';
    renderFeeBody();
  }
  function backToFeeGrid(){ window.scrollTo({top:0,left:0,behavior:'instant'}); feeView = 'grid'; renderFeeBody(); }
  function backToFeeSection(){ window.scrollTo({top:0,left:0,behavior:'instant'}); feeView = 'section'; renderFeeBody(); }

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
  function submitLedgerPayments(studentId){ return rcGuard(() => submitLedgerPaymentsImpl(studentId)); }
  async function submitLedgerPaymentsImpl(studentId){
    await ensureDataLoaded('payments', loadPaymentsData);
    await rcEnsure(1);
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
    // Every head paid in this one collection shares ONE receipt number, so the
    // school fee + bus fee (etc.) print together as a single itemized receipt.
    const sharedReceiptNo = nextReceiptNo();
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
          receiptNo: sharedReceiptNo,
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
        receiptNo: sharedReceiptNo,
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
    if(lastId && !payments.some(p => p.id === lastId)) return; // duplicate refused by the server
    showToast(entries.length > 1 ? `Receipt ${sharedReceiptNo} generated for ${entries.length} fee heads.` : 'Payment recorded.', 'radial', entries.reduce((s,e)=>s+e.amt,0));
    if(lastId && await showConfirmDialog('Payment(s) recorded. Print receipt now?')){
      printReceiptByNo(sharedReceiptNo);
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
  