let refundPaymentId = null;
  const FEE_REFUND_CATEGORY = 'Fee Refund';
  async function openRefundPaymentModal(paymentId){
    if(!canSub('managefee_collection','managefee','delete')){ showToast("You don't have permission to issue refunds."); return; }
    // Needs both: the payment itself, and the Accounting ledger's bank/cash
    // accounts for the "Refund From" dropdown — a genuine cross-module read
    // from outside the Accounting tab.
    await Promise.all([
      ensureDataLoaded('payments', loadPaymentsData),
      ensureDataLoaded('acctLedger', loadAccountingLedgerData),
    ]);
    const p = payments.find(x => x.id === paymentId);
    if(!p || p.voided){ showToast('This payment can\'t be refunded.'); return; }
    refundPaymentId = paymentId;
    const student = students.find(x => x.id === p.studentId);
    document.getElementById('refundModalSub').textContent = `${student ? student.firstName + ' ' + student.lastName : (p.studentName||'')} — originally paid ${fmtMoney(p.amount)} (${feeLabelFor(p)}) on ${p.date||'—'}.`;
    document.getElementById('refundModalBody').innerHTML = `
      <div class="f-field" style="margin-bottom:12px;"><label>Refund Amount (₹)</label><input type="number" min="0" max="${p.amount}" class="input" id="refundAmount" value="${p.amount}" style="width:100%;"></div>
      <div class="f-field" style="margin-bottom:12px;"><label>Refund Mode</label><select class="input" id="refundMode" style="width:100%;"><option>Cash</option><option>Online</option><option>Cheque</option></select></div>
      <div class="f-field" style="margin-bottom:12px;"><label>Refund From (Bank/Cash Account)</label><select class="input" id="refundBankAccount" style="width:100%;">${acctBankAccounts.filter(b=>b.active!==false).map(b => `<option value="${b.id}" ${b.id===defaultBankAccountForMode('Cash')?'selected':''}>${b.name}</option>`).join('')}</select></div>
      <div class="f-field" style="margin-bottom:6px;"><label>Reason (e.g. student withdrawn/TC issued)</label><textarea class="input" id="refundReason" rows="2" style="width:100%;"></textarea></div>
    `;
    document.getElementById('refundPaymentModalOverlay').classList.add('open');
  }
  function closeRefundPaymentModal(){
    refundPaymentId = null;
    document.getElementById('refundPaymentModalOverlay').classList.remove('open');
  }
  async function submitRefundPayment(){
    // Voids the original fee payment AND posts a new Accounting expense
    // voucher (acctExpenses) — both lazily-loaded datasets, needed even when
    // this is reached from the Fees tab without ever opening Accounting.
    await Promise.all([
      ensureDataLoaded('payments', loadPaymentsData),
      ensureDataLoaded('acctTransactions', loadAcctTransactionsData),
    ]);
    const p = payments.find(x => x.id === refundPaymentId);
    if(!p){ closeRefundPaymentModal(); return; }
    const amount = Number(document.getElementById('refundAmount').value) || 0;
    const mode = document.getElementById('refundMode').value;
    const bankAccountId = document.getElementById('refundBankAccount').value;
    const reason = document.getElementById('refundReason').value.trim();
    if(amount <= 0){ showToast('Enter a refund amount.'); return; }
    if(amount > p.amount){ showToast("Refund amount can't exceed the original payment."); return; }
    if(!reason){ showToast('A reason is required to issue a refund.'); return; }
    const student = students.find(x => x.id === p.studentId);
    let voucherNo;
    try{
      voucherNo = await issueDocNumber('payment_voucher');
    }catch(e){
      showToast("Could not get a voucher number from the server (" + e.message + ") — refund not saved. Try again once you're back online.");
      return;
    }
    // 1. Void the original payment so it stops counting as collected.
    p.voided = true;
    p.voidType = 'refund';
    p.voidReason = reason;
    p.voidedBy = currentUser.name;
    p.voidedAt = new Date().toISOString();
    p.refundAmount = amount;
    p.refundVoucherNo = voucherNo;
    if(p.category === 'extra' && p.extraFeeId){
      const fee = studentExtraFees.find(f => f.id === p.extraFeeId);
      if(fee){
        fee.paidAmount = Math.max(0, (Number(fee.paidAmount)||0) - (Number(p.amount)||0));
        fee.paid = fee.paidAmount >= fee.amount && fee.amount > 0;
        await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
      }
    }
    await storageSet(PAYMENTS_KEY, payments);
    // 2. Post a real Expense Voucher so Accounting shows the cash/bank
    // outflow — auto-creating the "Fee Refund" category the first time.
    if(!acctExpenseCategories.includes(FEE_REFUND_CATEGORY)){
      acctExpenseCategories.push(FEE_REFUND_CATEGORY);
      await storageSet(ACCT_EXPENSE_CATS_KEY, acctExpenseCategories);
    }
    acctExpenses.push({
      id: 'exp_' + Date.now(), voucherNo, date: new Date().toISOString().slice(0,10),
      category: FEE_REFUND_CATEGORY, costCenter: feePaymentCostCenter(p),
      amount, party: student ? (student.firstName + ' ' + student.lastName) : (p.studentName||''),
      mode, referenceNo: '', bankAccountId,
      description: `Fee refund — ${feeLabelFor(p)} originally paid ${p.date||''} (receipt ${p.receiptNo||'—'}). ${reason}`,
      addedBy: currentUser.name, voided: false,
    });
    await storageSet(ACCT_EXPENSES_KEY, acctExpenses);
    closeRefundPaymentModal();
    renderDashboard();
    renderFeeBody();
    showToast('Refund voucher ' + voucherNo + ' issued for ' + fmtMoney(amount) + '.', 'burst');
  }

  // Records one family member's share of a Collect Family Fees payment.
  // `heads` is the exact set of fee heads (Tuition, Transport, an Extra Fee,
  // etc.) the collector chose to pay for this student, each with its own
  // amount — no oldest-first auto-allocation, since the modal now shows and
  // lets the collector edit every head individually. Each head becomes its
  // own payment record — so accounting still sees every fee head posted to
  // its own income account — but every record created here shares ONE
  // receipt number, so printReceipt shows them as a single itemized receipt
  // for that student. A different family member always gets a different
  // receipt number, since they're billed as separate students. Pushes into
  // the in-memory `payments` / `studentExtraFees` arrays but does not
  // persist — the caller saves once after every selected family member has
  // been recorded.
  function recordFamilyPayment(studentId, heads, mode, date, note){
    const student = students.find(x => x.id === studentId);
    if(!student || !Array.isArray(heads) || !heads.length) return null;
    const receiptNo = nextReceiptNo();
    const created = [];
    heads.forEach(h => {
      const take = Number(h.amount) || 0;
      if(take <= 0) return;
      if(h.type === 'extra'){
        const fee = studentExtraFees.find(x => x.id === h.key);
        if(fee){
          fee.paidAmount = (Number(fee.paidAmount)||0) + take;
          if(fee.paidAmount >= fee.amount) fee.paid = true;
        }
        const record = {
          id: 'pay_' + Date.now() + '_' + studentId + '_' + h.key,
          receiptNo, studentId, studentName: student.name,
          category: 'extra', extraFeeName: fee ? fee.name : h.label, extraFeeId: h.key,
          mode, amount: take, discount: 0, instalment: '', date, note: note || '',
          classAtPayment: student.className,
        };
        payments.push(record);
        created.push(record);
      } else {
        const record = {
          id: 'pay_' + Date.now() + '_' + studentId + '_' + h.key,
          receiptNo, studentId, studentName: student.name,
          category: h.key, mode, amount: take, discount: 0, instalment: '', date, note: note || '',
          classAtPayment: student.className,
        };
        payments.push(record);
        created.push(record);
      }
    });
    return created.length ? { studentId, receiptNo, records: created } : null;
  }

  /* --- Collect Family Fees modal --- */
  // Shows every family member with their fee heads (Tuition, Bus Fee, Stock,
  // Hostel, any Extra Fee, etc.) broken out as its own line — each with its
  // own checkbox and editable amount — instead of one combined figure per
  // student, so the collector can see and control exactly what's being paid
  // toward what, per student, in one batch.
  let ffHeadCounter = 0;
  async function openFamilyFeeModal(anchorStudentId){
    await ensureDataLoaded('payments', loadPaymentsData);
    const s = students.find(x => x.id === anchorStudentId);
    if(!s) return;
    const familyIds = getFamilyIds(s);
    document.getElementById('ffMode').value = 'Cash';
    document.getElementById('ffDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('ffNote').value = '';
    document.getElementById('ffFamilyTotal').value = '';
    document.getElementById('ffUnallocatedWrap').style.display = 'none';
    ffHeadCounter = 0;
    const rowsEl = document.getElementById('familyFeeRows');
    rowsEl.innerHTML = familyIds.map(id => {
      const m = students.find(x => x.id === id);
      if(!m) return '';
      const { pendingRows, totalPendingOutstanding } = computePendingFeeRows(m);
      const payable = totalPendingOutstanding > 0;
      const headerRow = `
        <tr class="ff-student-header-row" data-student-id="${m.id}">
          <td><input type="checkbox" id="ffStudentChk_${m.id}" ${payable?'checked':''} ${payable?'':'disabled'} onchange="onFamilyStudentToggle('${m.id}')"></td>
          <td class="name-cell"><b>${m.firstName} ${m.lastName}</b><div style="font-size:0.72rem; color:var(--ink-soft); font-weight:400;">${m.className} - Section ${m.section}${m.id===s.id?' · Self':''}</div></td>
          <td></td>
          <td class="balance-tag ${payable?'due':'zero'}"><b>${fmtMoney(totalPendingOutstanding)}</b></td>
          <td></td>
        </tr>`;
      const headRows = pendingRows.length ? pendingRows.map(r => {
        ffHeadCounter++;
        const hid = 'h' + ffHeadCounter;
        return `
          <tr class="ff-head-row" data-student-id="${m.id}" data-type="${r.type}" data-key="${escapeHtml(String(r.key))}" data-label="${escapeHtml(r.label)}" data-outstanding="${r.outstanding}" data-hid="${hid}">
            <td><input type="checkbox" id="ffChk_${hid}" checked onchange="onFamilyRowToggle()"></td>
            <td class="name-cell" style="padding-left:28px; color:var(--ink-soft); font-size:0.86rem;">↳ ${escapeHtml(r.label)}</td>
            <td>${r.dueDate}</td>
            <td class="balance-tag due">${fmtMoney(r.outstanding)}</td>
            <td><input type="number" min="0" max="${r.outstanding}" id="ffAmt_${hid}" value="${r.outstanding}" oninput="onFamilyAmountInput()" style="width:110px; padding:6px 8px; border-radius:7px; border:1.5px solid var(--border);"></td>
          </tr>`;
      }).join('') : `
        <tr><td></td><td colspan="4" style="color:var(--ink-soft); font-size:0.82rem; padding-left:28px;">All fee heads paid</td></tr>`;
      return headerRow + headRows;
    }).join('');
    document.getElementById('familyFeeModalOverlay').classList.add('open');
    updateFamilyTotalToPay();
  }
  function closeFamilyFeeModal(){
    document.getElementById('familyFeeModalOverlay').classList.remove('open');
  }
  // Select-all/none for one student's fee heads, triggered by that
  // student's own header checkbox.
  function onFamilyStudentToggle(studentId){
    const headerChk = document.getElementById('ffStudentChk_'+studentId);
    if(!headerChk) return;
    const checked = headerChk.checked;
    document.querySelectorAll('.ff-head-row[data-student-id="'+studentId+'"]').forEach(row => {
      const hid = row.dataset.hid;
      const chk = document.getElementById('ffChk_'+hid);
      const amt = document.getElementById('ffAmt_'+hid);
      if(!chk || !amt) return;
      chk.checked = checked;
      if(!checked){ amt.value = 0; amt.disabled = true; }
      else { amt.disabled = false; amt.value = row.dataset.outstanding; }
    });
    headerChk.indeterminate = false;
    updateFamilyTotalToPay();
  }
  // Fired by an individual fee-head checkbox; also keeps that student's
  // header checkbox in sync (checked/unchecked/indeterminate) with however
  // many of their own heads are currently selected.
  function onFamilyRowToggle(){
    document.querySelectorAll('.ff-head-row').forEach(row => {
      const hid = row.dataset.hid;
      const chk = document.getElementById('ffChk_'+hid);
      const amt = document.getElementById('ffAmt_'+hid);
      if(!chk || !amt) return;
      if(!chk.checked){ amt.value = 0; amt.disabled = true; }
      else { amt.disabled = false; if(!(Number(amt.value) > 0)) amt.value = row.dataset.outstanding; }
    });
    const studentIds = new Set(Array.from(document.querySelectorAll('.ff-head-row')).map(r => r.dataset.studentId));
    studentIds.forEach(sid => {
      const rows = Array.from(document.querySelectorAll('.ff-head-row[data-student-id="'+sid+'"]'));
      const headerChk = document.getElementById('ffStudentChk_'+sid);
      if(!headerChk || !rows.length) return;
      const checks = rows.map(r => document.getElementById('ffChk_'+r.dataset.hid)).filter(Boolean);
      const allChecked = checks.every(c => c.checked);
      const noneChecked = checks.every(c => !c.checked);
      headerChk.checked = allChecked;
      headerChk.indeterminate = !allChecked && !noneChecked;
    });
    updateFamilyTotalToPay();
  }
  function onFamilyAmountInput(){
    updateFamilyTotalToPay();
  }
  function updateFamilyTotalToPay(){
    let total = 0;
    document.querySelectorAll('.ff-head-row').forEach(row => {
      const hid = row.dataset.hid;
      const chk = document.getElementById('ffChk_'+hid);
      const amtInput = document.getElementById('ffAmt_'+hid);
      if(chk && chk.checked && amtInput) total += Number(amtInput.value) || 0;
    });
    const el = document.getElementById('ffTotalToPay');
    if(el) el.textContent = fmtMoney(total);
  }
  // Splits the entered Family Total equally across every checked fee head
  // (across every checked student), capping each at what that head still
  // owes and carrying any leftover from a capped head on to the ones who
  // still have room — so no single fee head is ever auto-allocated more
  // than its own outstanding balance. Whatever still can't be placed once
  // every head is fully covered is shown as "Not allocated" rather than
  // silently applied or dropped.
  function autoDivideFamilyTotal(){
    const totalInput = Number(document.getElementById('ffFamilyTotal').value) || 0;
    const rows = Array.from(document.querySelectorAll('.ff-head-row')).filter(row => {
      const chk = document.getElementById('ffChk_'+row.dataset.hid);
      return chk && chk.checked && Number(row.dataset.outstanding) > 0;
    });
    const unallocWrap = document.getElementById('ffUnallocatedWrap');
    const unallocEl = document.getElementById('ffUnallocated');
    if(!rows.length){
      if(unallocWrap) unallocWrap.style.display = totalInput > 0 ? '' : 'none';
      if(unallocEl) unallocEl.textContent = fmtMoney(totalInput);
      updateFamilyTotalToPay();
      return;
    }
    const pool = rows.map(row => ({ hid: row.dataset.hid, due: Number(row.dataset.outstanding)||0, alloc:0, capped:false }));
    let remaining = totalInput;
    let guard = 0;
    while(remaining > 0.01 && pool.some(p => !p.capped) && guard < 100){
      guard++;
      const active = pool.filter(p => !p.capped);
      const share = remaining / active.length;
      let leftover = 0;
      active.forEach(p => {
        const room = p.due - p.alloc;
        if(share >= room){ leftover += share - room; p.alloc = p.due; p.capped = true; }
        else { p.alloc += share; }
      });
      remaining = leftover;
    }
    pool.forEach(p => {
      const amtInput = document.getElementById('ffAmt_'+p.hid);
      if(amtInput) amtInput.value = Math.round(p.alloc);
    });
    const unallocated = Math.max(0, Math.round(remaining));
    if(unallocWrap) unallocWrap.style.display = unallocated > 0 ? '' : 'none';
    if(unallocEl) unallocEl.textContent = fmtMoney(unallocated);
    updateFamilyTotalToPay();
  }
  async function submitFamilyPayments(){
    await ensureDataLoaded('payments', loadPaymentsData);
    const mode = document.getElementById('ffMode').value;
    const date = document.getElementById('ffDate').value || new Date().toISOString().slice(0,10);
    const note = document.getElementById('ffNote').value.trim();
    const byStudent = {};
    document.querySelectorAll('.ff-head-row').forEach(row => {
      const hid = row.dataset.hid;
      const chk = document.getElementById('ffChk_'+hid);
      const amtInput = document.getElementById('ffAmt_'+hid);
      if(!chk || !chk.checked) return;
      const amount = Number(amtInput ? amtInput.value : 0) || 0;
      if(amount <= 0) return;
      const sid = row.dataset.studentId;
      (byStudent[sid] = byStudent[sid] || []).push({
        type: row.dataset.type, key: row.dataset.key, label: row.dataset.label, amount,
      });
    });
    const studentIds = Object.keys(byStudent);
    if(!studentIds.length){ showToast('Select at least one fee head and enter an amount to pay.'); return; }
    const results = [];
    studentIds.forEach(sid => {
      const res = recordFamilyPayment(sid, byStudent[sid], mode, date, note);
      if(res) results.push(res);
    });
    if(!results.length){ showToast('Nothing was recorded — check the amounts entered.'); return; }
    await storageSet(PAYMENTS_KEY, payments);
    await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    closeFamilyFeeModal();
    renderDashboard();
    renderFeeBody();
    const totalPaid = studentIds.reduce((sum,sid) => sum + byStudent[sid].reduce((s,h)=>s+h.amount,0), 0);
    showToast(results.length + ' receipt(s) generated for ' + results.length + ' student(s).', 'radial', totalPaid);
    if(await showConfirmDialog('Payment(s) recorded. Print receipt(s) now?')){
      results.forEach(r => printReceiptByNo(r.receiptNo));
    }
  }

  /* --- Fee Types --- */
  function renderFeeTypesTab(body){
    const canCreate = canSub('managefee_types','managefee','create');
    const canDelete = canSub('managefee_types','managefee','delete');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:600px;">
        These names are available when creating Extra Fees. The four core recurring categories (Fee, Bus Fee, Stock, Hostel) are structural and managed under Fee Structure — this list is for additional labels you use elsewhere.
      </p>
      ${canCreate ? `<div class="inline-add-form">
        <input class="input" id="newFeeTypeName" placeholder="e.g. Exam Fee" style="max-width:260px;">
        <button class="btn btn-primary" onclick="addFeeType()">🏷️ Add Fee Type</button>
      </div>` : ''}
      ${feeTypes.map((t,i) => `
        <div class="list-manage-row">
          <div class="lm-name">${t}</div>
          ${canDelete ? `<button class="btn-danger-text" onclick="removeFeeType(${i})">Remove</button>` : ''}
        </div>`).join('') || `<div class="empty-state"><b>No fee types yet</b></div>`}
    `;
  }
  async function addFeeType(){
    const val = document.getElementById('newFeeTypeName').value.trim();
    if(!val) return;
    feeTypes.push(val);
    await storageSet(FEE_TYPES_KEY, feeTypes);
    renderFeeTypesTab(document.getElementById('feeBody'));
    showToast('Fee type added.', 'burst');
  }
  async function removeFeeType(idx){
    feeTypes.splice(idx,1);
    await storageSet(FEE_TYPES_KEY, feeTypes);
    renderFeeTypesTab(document.getElementById('feeBody'));
  }

  /* --- Discounts --- */
  let discView = 'list';
  let discListFilter = 'all';
  let discSearchQuery = '';
  let discSelectedStudents = [];
  let discExpandedStudents = new Set();
  let discCreateClass = '', discCreateSection = '';
  let discSearchDebounce = null;

  function statusPill(st){
    return st==='Approved' ? `<span class="pill" style="background:var(--success-bg); color:var(--success-ink);">Approved</span>`
      : st==='Rejected' ? `<span class="pill" style="background:var(--danger-bg); color:var(--danger-ink);">Rejected</span>`
      : `<span class="pill" style="background:var(--warning-bg); color:var(--warning-ink);">Pending</span>`;
  }
  // Generic semantic-status pill for new call sites — reuses the same
  // success/warning/danger/info tokens as statusPill()/syllabusStatusPill()
  // above (dark-mode aware, distinct from per-school brand colours).
  // tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  function pillTone(tone, label){
    const bg = tone==='success' ? 'var(--success-bg)' : tone==='warning' ? 'var(--warning-bg)'
      : tone==='danger' ? 'var(--danger-bg)' : tone==='info' ? 'var(--info-bg)' : 'rgba(0,0,0,0.06)';
    const ink = tone==='success' ? 'var(--success-ink)' : tone==='warning' ? 'var(--warning-ink)'
      : tone==='danger' ? 'var(--danger-ink)' : tone==='info' ? 'var(--info-ink)' : 'var(--ink-soft)';
    return `<span class="pill" style="background:${bg}; color:${ink};">${label}</span>`;
  }

  function groupedDiscountRows(){
    const groups = {};
    studentDiscounts.forEach(d => {
      const key = (d.batchId || d.id) + '|' + d.studentId;
      if(!groups[key]){
        groups[key] = { batchId: d.batchId||d.id, studentId: d.studentId, type: d.type, note: d.note,
          status: d.status, requestedBy: d.requestedBy, approvedBy: d.approvedBy, records: [] };
      }
      groups[key].records.push(d);
    });
    return Object.values(groups).sort((a,b) => (b.records[0].requestedDate||'').localeCompare(a.records[0].requestedDate||''));
  }

  function renderDiscountsTab(body){
    if(discView === 'create') return renderDiscCreateForm(body);
    renderDiscListView(body);
  }

  function renderDiscListView(body){
    const rows = groupedDiscountRows();
    const pendingCount = rows.filter(r => r.status==='Pending').length;
    let filtered = rows;
    if(discListFilter === 'pending') filtered = filtered.filter(r => r.status === 'Pending');
    if(discSearchQuery){
      const q = discSearchQuery.toLowerCase();
      filtered = filtered.filter(r => {
        const s = students.find(x => x.id === r.studentId);
        return s && (s.firstName+' '+s.lastName).toLowerCase().includes(q);
      });
    }

    body.innerHTML = `
      <div class="ms-toolbar" style="margin-bottom:16px;">
        <div class="ms-toolbar-left">
          <input class="input" id="discListSearch" placeholder="Search student discounts..." value="${discSearchQuery}" oninput="onDiscListSearch(this.value)">
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-ghost" onclick="toggleDiscApprovalsFilter()">${discListFilter==='pending' ? '✓ Showing Approvals' : 'Approvals'}${pendingCount ? ' ('+pendingCount+')' : ''}</button>
          ${canSub('managefee_discounts','managefee','create') ? `<button class="btn btn-primary" onclick="openDiscCreateForm()">+ Create Student Discount</button>` : ''}
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Student</th><th>Class &amp; Section</th><th>Concession Type</th>
          ${Object.keys(CATS).map(c => `<th>${CATS[c]}</th>`).join('')}
          <th>Total Concession</th><th>Remark</th><th>Created By</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
        ${filtered.length ? filtered.map(r => {
          const s = students.find(x => x.id === r.studentId);
          const catAmounts = {};
          Object.keys(CATS).forEach(c => { const rec = r.records.find(x => x.appliesTo===c); catAmounts[c] = rec ? rec.value : null; });
          const total = r.records.reduce((sum,x) => sum + (Number(x.value)||0), 0);
          return `<tr>
            <td><div class="lm-name">${s ? s.firstName+' '+s.lastName : 'Unknown student'}</div><div class="lm-meta">S/o: ${s && s.fatherName ? s.fatherName : '—'}</div></td>
            <td>${s ? `<span class="pill">${s.className} - ${s.section}</span>` : '—'}</td>
            <td>${r.type}</td>
            ${Object.keys(CATS).map(c => `<td>${catAmounts[c]!==null ? fmtMoney(catAmounts[c]) : '—'}</td>`).join('')}
            <td><b>${fmtMoney(total)}</b></td>
            <td>${r.note || '—'}</td>
            <td>${r.requestedBy||'—'}${r.approvedBy ? `<div style="font-size:0.72rem; color:var(--ink-soft);">Approved by: ${r.approvedBy}</div>` : ''}</td>
            <td>${statusPill(r.status)}</td>
            <td>
              ${currentUser.role==='Admin' && r.status==='Pending' ? `<button class="btn-edit-text" onclick="approveDiscountGroup('${r.batchId}','${r.studentId}')">Approve</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="rejectDiscountGroup('${r.batchId}','${r.studentId}')">Reject</button>&nbsp;·&nbsp;` : ``}
              ${canSub('managefee_discounts','managefee','delete') ? `<button class="btn-danger-text" onclick="deleteDiscountGroup('${r.batchId}','${r.studentId}')">Delete</button>` : ''}
            </td>
          </tr>`;
        }).join('') : `<tr><td colspan="${5+Object.keys(CATS).length}"><div class="empty-state"><b>No discounts found</b></div></td></tr>`}
        </tbody></table>
      </div>

      <div class="profile-card" style="margin-top:24px; max-width:640px;">
        <h4>Discount Catalog (quick reference)</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:12px;">A separate, informal list staff can glance at when recording a one-off payment discount manually — not tied to approval.</p>
        ${canSub('managefee_discounts','managefee','create') ? `<div class="inline-add-form">
          <input class="input" id="newDiscName" placeholder="e.g. Merit Scholarship" style="max-width:220px;">
          <input class="input" id="newDiscAmount" type="number" min="0" placeholder="Amount (₹)" style="max-width:160px;">
          <button class="btn btn-ghost btn-sm" onclick="addDiscountType()">+ Add</button>
        </div>` : ''}
        ${discountTypes.map((d,i) => `
          <div class="list-manage-row">
            <div><div class="lm-name">${d.name}</div><div class="lm-meta">${fmtMoney(d.amount)}</div></div>
            ${canSub('managefee_discounts','managefee','delete') ? `<button class="btn-danger-text" onclick="removeDiscountType(${i})">Remove</button>` : ''}
          </div>`).join('') || `<div style="font-size:0.8rem; color:var(--ink-soft);">No entries yet</div>`}
      </div>
    `;
  }
  function onDiscListSearch(val){
    discSearchQuery = val;
    renderDiscListView(document.getElementById('feeBody'));
  }
  function toggleDiscApprovalsFilter(){
    discListFilter = discListFilter === 'pending' ? 'all' : 'pending';
    renderDiscListView(document.getElementById('feeBody'));
  }

  function openDiscCreateForm(){
    discView = 'create';
    discSelectedStudents = [];
    discExpandedStudents = new Set();
    discCreateClass = ''; discCreateSection = '';
    renderDiscountsTab(document.getElementById('feeBody'));
  }
  function backToDiscList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    discView = 'list';
    renderDiscountsTab(document.getElementById('feeBody'));
  }

  function renderDiscCreateForm(body){
    body.innerHTML = `
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:20px;">
        <button class="btn btn-ghost btn-sm" onclick="backToDiscList()">← Back</button>
        <h3 style="margin:0; font-family:'Baloo 2',cursive; color:var(--navy);">Add Student Discount</h3>
      </div>
      <div class="form-grid">
        <div class="f-field full">
          <label>Search Student</label>
          <div class="search-wrap" style="max-width:none;">
            <input class="input" id="discCreateSearch" placeholder="Search all students by name..." style="width:100%;" autocomplete="off" oninput="onDiscCreateSearchInput()" onblur="setTimeout(hideDiscCreateSuggestions,150)" onfocus="onDiscCreateSearchInput()">
            <div class="search-suggestions" id="discCreateSuggestions"></div>
          </div>
        </div>
        <div class="f-field">
          <label>Class</label>
          <select id="discCreateClassSel" onchange="onDiscCreateClassChange(this.value)">
            <option value="">Select Class</option>
            ${CLASS_LEVELS.map(c => `<option value="${c}" ${discCreateClass===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="f-field">
          <label>Section</label>
          <select id="discCreateSectionSel" onchange="onDiscCreateSectionChange(this.value)">
            <option value="">Select Section</option>
            ${SECTIONS.map(s => `<option value="${s}" ${discCreateSection===s?'selected':''}>Section ${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:16px 0 8px; display:block;">Selected Student(s) <span class="required-star">*</span></label>
      <div id="discSelectedStudentsBox"></div>

      <div class="form-grid" style="margin-top:20px;">
        <div class="f-field">
          <label>Discount Type <span class="required-star">*</span></label>
          <select id="discCreateType" onchange="onDiscTypeChange()">${DISCOUNT_TYPE_OPTIONS.map(t => `<option>${t}</option>`).join('')}</select>
        </div>
        <div class="f-field full">
          <label>Remark <span id="discRemarkStar" style="color:var(--magenta); display:none;">*</span></label>
          <input type="text" id="discCreateNote" placeholder="Enter any remarks...">
          <div id="discRemarkHint" style="display:none; color:var(--gold); font-size:0.76rem; margin-top:4px;">* Remark is mandatory for General Discount</div>
        </div>
      </div>

      <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:18px 0 8px; display:block;">Student Fees — Apply Discount <span class="required-star">*</span></label>
      <div id="discStudentFeePanels"></div>

      ${currentUser.role==='Admin' ? `
      <p style="font-size:0.78rem; color:var(--ink-soft); margin:14px 0;">
        You're recording this as Admin, so it's approved immediately — no separate sign-off needed.
      </p>` : `
      <div class="form-grid" style="margin-top:16px;">
        <div class="f-field full">
          <label>Select Approver <span class="required-star">*</span></label>
          <select id="discCreateApprover" required>
            <option value="" disabled selected>Select an approver</option>
            ${users.filter(u => (u.role==='Admin' || u.role==='Principal') && u.id!==currentUser.id).map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('')}
          </select>
        </div>
      </div>

      <p style="font-size:0.78rem; color:var(--ink-soft); margin:14px 0;">
        This request will need the selected approver's sign-off before it reduces the fee.
      </p>`}

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
        <button class="btn btn-ghost" onclick="backToDiscList()">Cancel</button>
        <button class="btn btn-primary" onclick="submitDiscCreate()">Create Discount</button>
      </div>
    `;
    renderDiscSelectedStudentsBox();
    renderDiscStudentFeePanels();
  }

  function onDiscTypeChange(){
    const type = document.getElementById('discCreateType').value;
    const isGeneral = type === 'General Discount';
    document.getElementById('discRemarkHint').style.display = isGeneral ? 'block' : 'none';
    document.getElementById('discRemarkStar').style.display = isGeneral ? 'inline' : 'none';
  }

  function renderDiscSelectedStudentsBox(){
    const box = document.getElementById('discSelectedStudentsBox');
    if(!box) return;
    let html = '';
    if(discSelectedStudents.length){
      html += `<div class="disc-chip-row">` + discSelectedStudents.map(id => {
        const s = students.find(x => x.id === id);
        if(!s) return '';
        return `<span class="disc-chip">${s.firstName} ${s.lastName}<button type="button" onclick="removeDiscSelectedStudent('${id}')">&times;</button></span>`;
      }).join('') + `</div>`;
    }
    if(discCreateClass && discCreateSection){
      const list = students.filter(s => s.className===discCreateClass && s.section===discCreateSection && isActive(s));
      html += `<div class="disc-checklist">` + (list.length ? list.map(s => `
        <label class="disc-check-item"><input type="checkbox" ${discSelectedStudents.includes(s.id)?'checked':''} onchange="toggleDiscSelectedStudent('${s.id}', this.checked)"> ${s.firstName} ${s.lastName} <span style="color:var(--ink-soft); font-size:0.76rem;">(${s.admissionNo})</span></label>
      `).join('') : `<div style="font-size:0.82rem; color:var(--ink-soft); padding:8px 0;">No active students in this section</div>`) + `</div>`;
    } else if(!discSelectedStudents.length){
      html += `<div class="empty-state"><b>Select a class &amp; section, or search above</b>to choose students.</div>`;
    }
    box.innerHTML = html;
  }
  function onDiscCreateClassChange(val){ discCreateClass = val; renderDiscSelectedStudentsBox(); }
  function onDiscCreateSectionChange(val){ discCreateSection = val; renderDiscSelectedStudentsBox(); }
  function toggleDiscSelectedStudent(id, checked){
    if(checked && !discSelectedStudents.includes(id)){ discSelectedStudents.push(id); discExpandedStudents.add(id); }
    if(!checked) discSelectedStudents = discSelectedStudents.filter(x => x !== id);
    renderDiscSelectedStudentsBox();
    renderDiscStudentFeePanels();
  }
  function removeDiscSelectedStudent(id){
    discSelectedStudents = discSelectedStudents.filter(x => x !== id);
    renderDiscSelectedStudentsBox();
    renderDiscStudentFeePanels();
  }

  function onDiscCreateSearchInput(){
    clearTimeout(discSearchDebounce);
    discSearchDebounce = setTimeout(() => renderDiscCreateSuggestions(document.getElementById('discCreateSearch').value.trim()), 150);
  }
  function renderDiscCreateSuggestions(q){
    const box = document.getElementById('discCreateSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => (s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql) || (s.admissionNo||'').toLowerCase().includes(ql)).slice(0,8);
    if(matches.length===0){ box.innerHTML = `<div class="sg-empty">No students match "${q}"</div>`; box.classList.add('open'); return; }
    box.innerHTML = matches.map(s => `<div class="sg-item" onmousedown="addDiscSearchedStudent('${s.id}')">
      <div class="sg-avatar">${s.photo?`<img src="${s.photo}">`:initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('');
    box.classList.add('open');
  }
  function addDiscSearchedStudent(id){
    hideDiscCreateSuggestions();
    document.getElementById('discCreateSearch').value = '';
    if(!discSelectedStudents.includes(id)){ discSelectedStudents.push(id); discExpandedStudents.add(id); }
    renderDiscSelectedStudentsBox();
    renderDiscStudentFeePanels();
  }
  function hideDiscCreateSuggestions(){
    const box = document.getElementById('discCreateSuggestions');
    if(box) box.classList.remove('open');
  }

  function renderDiscStudentFeePanels(){
    const box = document.getElementById('discStudentFeePanels');
    if(!box) return;
    if(discSelectedStudents.length === 0){
      box.innerHTML = `<div class="empty-state"><b>No students selected yet</b>Their actual fee amounts will appear here once selected, so you can set an exact discount.</div>`;
      return;
    }
    box.innerHTML = discSelectedStudents.map(id => {
      const s = students.find(x => x.id === id);
      if(!s) return '';
      const { perCat } = computeStudentFinance(s);
      const cats = Object.keys(CATS).filter(c => perCat[c].expected > 0);
      const isOpen = discExpandedStudents.has(id);
      return `
        <div class="disc-student-panel">
          <div class="disc-student-panel-head" onclick="toggleDiscStudentPanel('${id}')">
            <svg class="disc-panel-chevron ${isOpen?'open':''}" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <div class="disc-panel-avatar">${initials(s)}</div>
            <div><b>${s.firstName} ${s.lastName}</b><span class="disc-panel-meta">S/o: ${s.fatherName || '—'}</span></div>
          </div>
          <div class="disc-student-panel-body" style="display:${isOpen ? 'block' : 'none'};">
            ${cats.length ? `
            <table class="disc-fee-table">
              <thead><tr><th>Type</th><th>Total Amount</th><th>Discount Amt</th><th>Discount %</th></tr></thead>
              <tbody>
              ${cats.map(c => `
                <tr>
                  <td><span class="pill">${CATS[c]}</span></td>
                  <td>${fmtMoney(perCat[c].expected)}</td>
                  <td><input type="number" min="0" max="${perCat[c].expected}" class="disc-amt-input" data-student="${id}" data-cat="${c}" data-total="${perCat[c].expected}" value="0" oninput="onDiscAmtInput(this)"></td>
                  <td><input type="number" min="0" max="100" class="disc-pct-input" data-student="${id}" data-cat="${c}" data-total="${perCat[c].expected}" value="0" oninput="onDiscPctInput(this)"></td>
                </tr>
              `).join('')}
              </tbody>
            </table>
            ` : `<div style="font-size:0.82rem; color:var(--ink-soft); padding:6px 0 2px;">No fee items set up yet for ${s.className} — Section ${s.section}.</div>`}
          </div>
        </div>
      `;
    }).join('');
  }
  function toggleDiscStudentPanel(id){
    if(discExpandedStudents.has(id)) discExpandedStudents.delete(id); else discExpandedStudents.add(id);
    renderDiscStudentFeePanels();
  }
  function onDiscAmtInput(el){
    let val = Number(el.value) || 0;
    const total = Number(el.dataset.total) || 0;
    if(val > total) val = total;
    if(val < 0) val = 0;
    el.value = val;
    const pctInput = document.querySelector(`.disc-pct-input[data-student="${el.dataset.student}"][data-cat="${el.dataset.cat}"]`);
    if(pctInput) pctInput.value = total > 0 ? (Math.round((val/total)*10000)/100) : 0;
  }
  function onDiscPctInput(el){
    let pct = Number(el.value) || 0;
    if(pct > 100) pct = 100;
    if(pct < 0) pct = 0;
    el.value = pct;
    const total = Number(el.dataset.total) || 0;
    const amtInput = document.querySelector(`.disc-amt-input[data-student="${el.dataset.student}"][data-cat="${el.dataset.cat}"]`);
    if(amtInput) amtInput.value = Math.round(total * pct / 100);
  }

  async function submitDiscCreate(){
    if(discSelectedStudents.length === 0){ showToast('Select at least one student.'); return; }
    const isAdminSelfApprove = currentUser.role === 'Admin';
    let approver = null;
    if(!isAdminSelfApprove){
      const approverSel = document.getElementById('discCreateApprover');
      if(!approverSel.value){ showToast('Select an approver.'); return; }
      approver = users.find(u => u.id === approverSel.value);
    }
    const type = document.getElementById('discCreateType').value;
    const note = document.getElementById('discCreateNote').value.trim();
    if(type === 'General Discount' && !note){ showToast('Remark is mandatory for General Discount.'); return; }

    const perStudentAmounts = Array.from(document.querySelectorAll('.disc-amt-input'))
      .map(inp => ({ studentId: inp.dataset.student, cat: inp.dataset.cat, value: Number(inp.value) || 0 }))
      .filter(x => x.value > 0);
    if(perStudentAmounts.length === 0){ showToast('Enter a discount amount for at least one fee type.'); return; }

    // Admin-recorded discounts are approved immediately — Admin is trusted to
    // self-approve rather than needing a Principal's sign-off. Anyone else
    // still needs the selected approver (Admin or Principal) to sign off.
    const status = isAdminSelfApprove ? 'Approved' : 'Pending';
    const batchId = 'batch_' + Date.now();

    perStudentAmounts.forEach(entry => {
      studentDiscounts.push({
        id: 'sdisc_' + Date.now() + '_' + entry.studentId + '_' + entry.cat,
        batchId, studentId: entry.studentId, type, appliesTo: entry.cat, mode: 'amount', value: entry.value,
        note, status,
        requestedBy: currentUser.name, requestedRole: currentUser.role, requestedByUserId: currentUser.id,
        requestedDate: new Date().toISOString().slice(0,10),
        approverId: isAdminSelfApprove ? currentUser.id : approver.id,
        approverName: isAdminSelfApprove ? currentUser.name : approver.name,
        ...(status==='Approved' ? { approvedBy: currentUser.name, approvedDate: new Date().toISOString().slice(0,10) } : {}),
      });
    });
    const studentsAffected = new Set(perStudentAmounts.map(x => x.studentId)).size;
    await storageSet(STUDENT_DISCOUNTS_KEY, studentDiscounts);
    renderDashboard();
    showToast(status === 'Approved'
      ? `Discount approved and applied to ${studentsAffected} student(s).`
      : `Discount request submitted for approval (${studentsAffected} student(s)).`);
    backToDiscList();
  }

  async function approveDiscountGroup(batchId, studentId){
    const rows = studentDiscounts.filter(d => (d.batchId||d.id)===batchId && d.studentId===studentId);
    rows.forEach(d => {
      d.status = 'Approved'; d.approvedBy = currentUser.name; d.approvedDate = new Date().toISOString().slice(0,10);
    });
    await storageSet(STUDENT_DISCOUNTS_KEY, studentDiscounts);
    renderDiscListView(document.getElementById('feeBody'));
    renderDashboard();
    showToast('Discount approved.', 'burst');
    const s = students.find(x => x.id === studentId);
    const name = s ? `${s.firstName} ${s.lastName}` : studentId;
    notifyRequesterOfDecision(rows[0] && rows[0].requestedByUserId, 'Fee discount approved', `${currentUser.name} approved the fee discount you requested for ${name}.`, 'approval-decision');
  }
  async function rejectDiscountGroup(batchId, studentId){
    const rows = studentDiscounts.filter(d => (d.batchId||d.id)===batchId && d.studentId===studentId);
    rows.forEach(d => {
      d.status = 'Rejected'; d.approvedBy = currentUser.name; d.approvedDate = new Date().toISOString().slice(0,10);
    });
    await storageSet(STUDENT_DISCOUNTS_KEY, studentDiscounts);
    renderDiscListView(document.getElementById('feeBody'));
    renderDashboard();
    showToast('Discount rejected.', 'burst');
    const s = students.find(x => x.id === studentId);
    const name = s ? `${s.firstName} ${s.lastName}` : studentId;
    notifyRequesterOfDecision(rows[0] && rows[0].requestedByUserId, 'Fee discount rejected', `${currentUser.name} rejected the fee discount you requested for ${name}.`, 'approval-decision');
  }
  async function deleteDiscountGroup(batchId, studentId){
    if(!await showConfirmDialog('Remove this discount record?')) return;
    studentDiscounts = studentDiscounts.filter(d => !((d.batchId||d.id)===batchId && d.studentId===studentId));
    await storageSet(STUDENT_DISCOUNTS_KEY, studentDiscounts);
    renderDiscListView(document.getElementById('feeBody'));
    renderDashboard();
  }

  async function addDiscountType(){
    const name = document.getElementById('newDiscName').value.trim();
    const amount = Number(document.getElementById('newDiscAmount').value) || 0;
    if(!name) return;
    discountTypes.push({ id:'disc_'+Date.now(), name, amount });
    await storageSet(DISCOUNT_TYPES_KEY, discountTypes);
    renderDiscountsTab(document.getElementById('feeBody'));
    showToast('Discount type added.', 'burst');
  }
  async function removeDiscountType(idx){
    discountTypes.splice(idx,1);
    await storageSet(DISCOUNT_TYPES_KEY, discountTypes);
    renderDiscountsTab(document.getElementById('feeBody'));
  }

  /* --- Extra Fees (catalog + per-student assignment) --- */
  function renderExtraFeesTab(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:600px;">
        Define one-off extra fees here (e.g. Annual Day, Field Trip). Assign them to individual students from that student's fee page in <b>Student Fees</b>.
      </p>
      ${canSub('managefee_extra','managefee','create') ? `<div class="inline-add-form">
        <input class="input" id="newExtraName" list="feeTypesDatalist" placeholder="e.g. Annual Day Fee" style="max-width:220px;">
        <datalist id="feeTypesDatalist">${feeTypes.map(t => `<option value="${t}">`).join('')}</datalist>
        <input class="input" id="newExtraAmount" type="number" min="0" placeholder="Amount (₹)" style="max-width:160px;">
        <button class="btn btn-primary" onclick="addExtraFeeDef()">+ Add Extra Fee</button>
      </div>` : ''}
      ${extraFeeDefs.map((e,i) => `
        <div class="list-manage-row">
          <div><div class="lm-name">${e.name}</div><div class="lm-meta">${fmtMoney(e.amount)}</div></div>
          ${canSub('managefee_extra','managefee','delete') ? `<button class="btn-danger-text" onclick="removeExtraFeeDef(${i})">Remove</button>` : ''}
        </div>`).join('') || `<div class="empty-state"><b>No extra fees defined yet</b></div>`}
    `;
  }
  async function addExtraFeeDef(){
    const name = document.getElementById('newExtraName').value.trim();
    const amount = Number(document.getElementById('newExtraAmount').value) || 0;
    if(!name) return;
    extraFeeDefs.push({ id:'ef_'+Date.now(), name, amount });
    await storageSet(EXTRA_FEE_DEFS_KEY, extraFeeDefs);
    renderExtraFeesTab(document.getElementById('feeBody'));
    showToast('Extra fee defined.', 'burst');
  }
  async function removeExtraFeeDef(idx){
    extraFeeDefs.splice(idx,1);
    await storageSet(EXTRA_FEE_DEFS_KEY, extraFeeDefs);
    renderExtraFeesTab(document.getElementById('feeBody'));
  }

  function openExtraFeeAssignModal(studentId){
    document.getElementById('efStudentId').value = studentId;
    document.getElementById('efName').value = '';
    document.getElementById('efAmount').value = '';
    const sel = document.getElementById('efDefSelect');
    sel.innerHTML = '<option value="">Custom...</option>' + extraFeeDefs.map(e => `<option value="${e.id}">${e.name} — ${fmtMoney(e.amount)}</option>`).join('');
    document.getElementById('extraFeeModalOverlay').classList.add('open');
  }
  function closeExtraFeeAssignModal(){
    document.getElementById('extraFeeModalOverlay').classList.remove('open');
  }
  function onExtraFeeDefChange(){
    const id = document.getElementById('efDefSelect').value;
    const def = extraFeeDefs.find(e => e.id === id);
    if(def){
      document.getElementById('efName').value = def.name;
      document.getElementById('efAmount').value = def.amount;
    }
  }
  async function saveExtraFeeAssignment(e){
    e.preventDefault();
    const studentId = document.getElementById('efStudentId').value;
    const name = document.getElementById('efName').value.trim();
    const amount = Number(document.getElementById('efAmount').value) || 0;
    if(!name || !studentId) return false;
    studentExtraFees.push({ id:'sef_'+Date.now(), studentId, name, amount, paid:false, date:new Date().toISOString().slice(0,10) });
    await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    closeExtraFeeAssignModal();
    renderFeeBody();
    showToast('Extra fee assigned.', 'burst');
    return false;
  }
  async function addAdmissionFeeForStudent(studentId){
    const s = students.find(x => x.id === studentId);
    if(!s) return;
    const amount = Number(classStruct(s.className).admission) || 0;
    if(amount <= 0){
      showToast(`No Admission Fee is configured for ${s.className} yet — set one in Fee Structure first.`);
      return;
    }
    const existing = studentExtraFees.find(e => e.studentId === studentId && e.name === 'Admission Fee');
    if(existing){
      const proceed = await showConfirmDialog(`${s.firstName} ${s.lastName} already has an Admission Fee of ${fmtMoney(existing.amount)} (${existing.paid?'Paid':'Unpaid'}) on file. Add another one anyway?`);
      if(!proceed) return;
    }
    studentExtraFees.push({
      id: 'sef_' + Date.now(), studentId, name: 'Admission Fee',
      amount, paid: false, date: new Date().toISOString().slice(0,10),
    });
    await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    renderDashboard();
    renderFeeBody();
    showToast(`Admission Fee of ${fmtMoney(amount)} added for ${s.firstName} ${s.lastName}.`);
  }

  async function markExtraFeePaid(id){
    const item = studentExtraFees.find(e => e.id === id);
    if(item) item.paid = true;
    await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    renderFeeBody();
    showToast('Marked as paid.', 'burst');
  }
  async function printReceiptForExtraFee(feeId){
    await ensureDataLoaded('payments', loadPaymentsData);
    const fee = studentExtraFees.find(x => x.id === feeId);
    if(!fee) return;
    const realPayment = payments.find(p => p.category === 'extra' && p.extraFeeId === feeId);
    if(realPayment){ printReceipt(realPayment.id); return; }
    // Fallback for fees paid before receipt-linking existed — build a receipt directly, without touching stored data.
    const student = students.find(s => s.id === fee.studentId);
    if(!student) return;
    printReceipt({
      id: 'synthetic_' + fee.id,
      receiptNo: nextReceiptNo(),
      studentId: fee.studentId, studentName: student.name,
      category: 'extra', extraFeeName: fee.name,
      mode: 'Cash', amount: Number(fee.paidAmount) || Number(fee.amount) || 0, discount: 0,
      instalment: '', date: fee.date || new Date().toISOString().slice(0,10), note: '',
    });
  }
  async function removeExtraFee(id){
    if(!canSub('managefee_collection','managefee','delete')){ showToast("You don't have permission to remove an assigned fee."); return; }
    const fee = studentExtraFees.find(e => e.id === id);
    if(!fee) return;
    // Removing the assignment outright would silently orphan any payment(s)
    // already recorded against it (payments[] rows with extraFeeId===id
    // would keep counting as collected with nothing left to attach a receipt
    // to). Block it here instead of deleting data underneath a payment.
    if((Number(fee.paidAmount)||0) > 0){
      showToast(`Can't remove — ${fmtMoney(fee.paidAmount)} is already paid against "${fee.name}". Void or Refund that payment first (Payment History below), then remove the assignment.`);
      return;
    }
    if(!await showConfirmDialog('Remove this extra fee?')) return;
    studentExtraFees = studentExtraFees.filter(e => e.id !== id);
    await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    renderFeeBody();
  }

  /* --- Late Fees --- */
  function renderLateFeesTab(body){
    body.innerHTML = `
      <div class="profile-card" style="max-width:420px; margin-bottom:20px;">
        <h4>Late Fee Rule</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:16px;">Applies uniformly across the school for now — a per-class or per-student rule would be a future refinement.</p>
        <div class="f-field" style="margin-bottom:12px;"><label>Fee Due Date</label><input type="date" class="input" id="lfDueDate" value="${lateFeeSettings.dueDate||''}" style="width:100%;"></div>
        <div class="f-field" style="margin-bottom:12px;"><label>Grace Period (days)</label><input type="number" min="0" class="input" id="lfGrace" value="${lateFeeSettings.graceDays||0}" style="width:100%;"></div>
        <div class="f-field" style="margin-bottom:16px;"><label>Late Fee Amount (₹)</label><input type="number" min="0" class="input" id="lfAmount" value="${lateFeeSettings.amount||0}" style="width:100%;"></div>
        ${canSub('managefee_late','managefee','edit') ? `<button class="btn btn-primary" onclick="saveLateFeeSettings()">⏰ Save Late Fee Rule</button>` : ''}
      </div>
      <div class="profile-card" style="max-width:420px;">
        <h4>Receipt Numbering</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:16px;">Set this if you're switching over from a previous system and want receipt numbers to continue from where you left off (e.g. if your last printed receipt was 001666, set this to 1667).</p>
        <div class="f-field" style="margin-bottom:16px;"><label>Next Receipt Starts At</label><input type="number" min="1" class="input" id="rsStart" value="${receiptSettings.startNumber||1}" style="width:100%;"></div>
        ${canSub('managefee_late','managefee','edit') ? `<button class="btn btn-primary" onclick="saveReceiptSettings()">Save Receipt Numbering</button>` : ''}
      </div>
    `;
  }
  async function saveLateFeeSettings(){
    lateFeeSettings = {
      dueDate: document.getElementById('lfDueDate').value,
      graceDays: Number(document.getElementById('lfGrace').value) || 0,
      amount: Number(document.getElementById('lfAmount').value) || 0,
    };
    await storageSet(LATE_FEE_SETTINGS_KEY, lateFeeSettings);
    showToast('Late fee rule saved.', 'burst');
  }
  async function saveReceiptSettings(){
    receiptSettings = { startNumber: Number(document.getElementById('rsStart').value) || 1 };
    await storageSet(RECEIPT_SETTINGS_KEY, receiptSettings);
    showToast('Receipt numbering updated.', 'burst');
  }

  /* --- Fee Defaulters --- */
  function computeDefaulters(){
    // Covers all 4 fee categories (Tuition, Bus, Stock, Hostel) so a student who only
    // owes Stock or Hostel dues isn't silently left off the defaulters list.
    const list = [];
    students.filter(s => isActive(s)).forEach(s => {
      const { perCat } = computeStudentFinance(s);
      const tuitionBal = perCat.fee.receivable;
      const busBal = perCat.bus.receivable;
      const stockBal = perCat.stock.receivable;
      const hostelBal = perCat.hostel.receivable;
      const total = tuitionBal + busBal + stockBal + hostelBal;
      if(total > 0){
        list.push({
          student: s, tuitionBal, busBal, stockBal, hostelBal, total,
          parentPhone: s.fatherPhone || s.motherPhone || s.guardianPhone || '',
        });
      }
    });
    return list;
  }

  function onDefaulterFilterChange(){
    defaulterFilters = {
      className: document.getElementById('dfClass').value,
      section: document.getElementById('dfSection').value,
      name: document.getElementById('dfName').value,
      phone: document.getElementById('dfPhone').value,
    };
    defaulterPage = 1;
    renderDefaultersTab(document.getElementById('feeBody'));
  }
  function changeDefaulterPageSize(val){
    defaulterPageSize = Number(val);
    defaulterPage = 1;
    renderDefaultersTab(document.getElementById('feeBody'));
  }
  function changeDefaulterPage(dir){
    defaulterPage += dir;
    renderDefaultersTab(document.getElementById('feeBody'));
  }
  function defaultersReportRows(){
    let list = computeDefaulters();
    if(defaulterFilters.className) list = list.filter(d => d.student.className===defaulterFilters.className);
    if(defaulterFilters.section) list = list.filter(d => d.student.section===defaulterFilters.section);
    if(defaulterFilters.name) list = list.filter(d => (d.student.firstName+' '+d.student.lastName).toLowerCase().includes(defaulterFilters.name.toLowerCase()));
    if(defaulterFilters.phone) list = list.filter(d => (d.parentPhone||'').includes(defaulterFilters.phone));
    return list.map(d => ({
      'Student': d.student.firstName+' '+d.student.lastName, 'Class': d.student.className+' - '+d.student.section,
      'Parent Phone': d.parentPhone || '', 'Due Date': lateFeeSettings.dueDate || '',
      'Tuition Due': d.tuitionBal, 'Bus Due': d.busBal, 'Stock Due': d.stockBal, 'Hostel Due': d.hostelBal, 'Amount Due': d.total,
    }));
  }
  function downloadDefaultersExcel(){ exportRowsToExcel('fee_defaulters.xlsx', 'Fee Defaulters', defaultersReportRows()); }
  function downloadDefaultersPDF(){ exportRowsToPDF('Fee Defaulters', '', defaultersReportRows()); }

  function renderDefaultersTab(body){
    const canNotify = canSub('managefee_defaulters','managefee','create');
    const canPrintDefaulters = canSub('managefee_defaulters','managefee','print');
    let list = computeDefaulters();
    if(defaulterFilters.className) list = list.filter(d => d.student.className===defaulterFilters.className);
    if(defaulterFilters.section) list = list.filter(d => d.student.section===defaulterFilters.section);
    if(defaulterFilters.name) list = list.filter(d => (d.student.firstName+' '+d.student.lastName).toLowerCase().includes(defaulterFilters.name.toLowerCase()));
    if(defaulterFilters.phone) list = list.filter(d => (d.parentPhone||'').includes(defaulterFilters.phone));

    const totalOutstanding = list.reduce((s,d) => s+d.total, 0);
    const totalPages = Math.max(1, Math.ceil(list.length / defaulterPageSize));
    if(defaulterPage > totalPages) defaulterPage = totalPages;
    const pageItems = list.slice((defaulterPage-1)*defaulterPageSize, defaulterPage*defaulterPageSize);

    body.innerHTML = `
      <div class="fee-summary-row">
        <div class="fee-sum-card"><b>${list.length}</b><span>Total Defaulters</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(totalOutstanding)}</b><span>Total Outstanding</span></div>
      </div>
      <div class="ms-toolbar">
        <div class="ms-toolbar-left">
          <select id="dfClass" onchange="onDefaulterFilterChange()"><option value="">All Classes</option>${CLASS_LEVELS.map(c=>`<option ${defaulterFilters.className===c?'selected':''}>${c}</option>`).join('')}</select>
          <select id="dfSection" onchange="onDefaulterFilterChange()"><option value="">All Sections</option>${SECTIONS.map(s => `<option value="${s}" ${defaulterFilters.section===s?'selected':''}>Section ${s}</option>`).join('')}</select>
          <input class="input" id="dfName" placeholder="Search name..." value="${defaulterFilters.name}" oninput="onDefaulterFilterChange()">
          <input class="input" id="dfPhone" placeholder="Parent phone..." value="${defaulterFilters.phone}" oninput="onDefaulterFilterChange()">
        </div>
      </div>
      <div class="notify-scope-bar">
        ${canNotify ? `<button class="btn btn-ghost btn-sm" onclick="openNotifyModal('all')">Notify All Defaulters</button>` : ''}
        ${(canNotify && defaulterFilters.className) ? `<button class="btn btn-ghost btn-sm" onclick="openNotifyModal('filtered')">Notify ${defaulterFilters.className}${defaulterFilters.section?' - '+defaulterFilters.section:''}</button>` : ``}
        ${canPrintDefaulters ? `<button class="btn btn-ghost btn-sm" onclick="downloadDefaultersExcel()">📥 Excel</button>` : ''}
        ${canPrintDefaulters ? `<button class="btn btn-ghost btn-sm" onclick="downloadDefaultersPDF()">📄 PDF</button>` : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Student</th><th>Class</th><th>Parent Phone</th><th>Due Date</th><th>Amount</th><th></th></tr></thead>
          <tbody>
          ${pageItems.map(d => `
            <tr>
              <td class="name-cell">${d.student.firstName} ${d.student.lastName}</td>
              <td><span class="pill">${d.student.className} - ${d.student.section}</span></td>
              <td>${d.parentPhone || '—'}</td>
              <td>${lateFeeSettings.dueDate || '—'}</td>
              <td class="balance-tag due" title="Tuition: ${fmtMoney(d.tuitionBal)} · Bus: ${fmtMoney(d.busBal)} · Stock: ${fmtMoney(d.stockBal)} · Hostel: ${fmtMoney(d.hostelBal)}">${fmtMoney(d.total)}</td>
              <td>${canNotify ? `<button class="btn-edit-text" onclick="openNotifyModal('single','${d.student.id}')">Notify</button>` : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${pageItems.length===0 ? `<div class="empty-state"><b>No defaulters match</b></div>` : ``}
      </div>
      <div class="pagination-row">
        <div style="font-size:0.8rem; color:var(--ink-soft);">
          Showing ${pageItems.length ? ((defaulterPage-1)*defaulterPageSize+1) : 0}–${Math.min(defaulterPage*defaulterPageSize,list.length)} of ${list.length}
          <select onchange="changeDefaulterPageSize(this.value)" style="margin-left:8px; padding:4px 8px; border-radius:6px; border:1.5px solid var(--border);">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${defaulterPageSize===n?'selected':''}>${n} / page</option>`).join('')}
          </select>
        </div>
        <div class="pagination-btns">
          <button class="page-btn" onclick="changeDefaulterPage(-1)" ${defaulterPage<=1?'disabled':''}>Prev</button>
          <span style="font-size:0.82rem;">Page ${defaulterPage} of ${totalPages}</span>
          <button class="page-btn" onclick="changeDefaulterPage(1)" ${defaulterPage>=totalPages?'disabled':''}>Next</button>
        </div>
      </div>
    `;
  }

  /* --- Notify Parents (WhatsApp click-to-chat, real & functional, no backend needed) --- */
  function openNotifyModal(scope, singleId){
    let list = computeDefaulters();
    if(scope === 'filtered'){
      if(defaulterFilters.className) list = list.filter(d => d.student.className===defaulterFilters.className);
      if(defaulterFilters.section) list = list.filter(d => d.student.section===defaulterFilters.section);
    }else if(scope === 'single'){
      list = list.filter(d => d.student.id === singleId);
    }
    const body = document.getElementById('notifyModalBody');
    body.innerHTML = list.map(d => {
      const msg = encodeURIComponent(`Dear Parent, this is a reminder from ${schoolInfo.name||'the school'} that a fee balance of ${fmtMoney(d.total)} is due for ${d.student.firstName} ${d.student.lastName} (${d.student.className} - Section ${d.student.section}). Kindly clear the dues at your earliest convenience. Thank you.`);
      const phone = (d.parentPhone||'').replace(/\D/g,'');
      const link = phone ? `https://wa.me/91${phone}?text=${msg}` : '';
      return `<div class="list-manage-row">
        <div><div class="lm-name">${d.student.firstName} ${d.student.lastName}</div><div class="lm-meta">${d.parentPhone||'No phone on file'} · Balance ${fmtMoney(d.total)}</div></div>
        ${link ? `<a href="${link}" target="_blank" class="btn btn-primary btn-sm">Send WhatsApp</a>` : `<span style="font-size:0.78rem; color:var(--ink-soft);">No phone</span>`}
      </div>`;
    }).join('') || `<div class="empty-state"><b>No matching defaulters</b></div>`;
    document.getElementById('notifyModalOverlay').classList.add('open');
  }
  function closeNotifyModal(){
    document.getElementById('notifyModalOverlay').classList.remove('open');
  }

  /* --- Manage Fee search-as-you-type --- */
  let feeSearchDebounce = null;
  function onFeeSearchInput(){
    clearTimeout(feeSearchDebounce);
    feeSearchDebounce = setTimeout(() => {
      renderFeeSuggestions(document.getElementById('mfSearch').value.trim());
    }, 150);
  }
  function renderFeeSuggestions(q){
    const box = document.getElementById('feeSearchSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => (s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql) || (s.admissionNo||'').toLowerCase().includes(ql)).slice(0,8);
    if(matches.length===0){ box.innerHTML = `<div class="sg-empty">No students match "${q}"</div>`; box.classList.add('open'); return; }
    box.innerHTML = matches.map(s => `<div class="sg-item" onmousedown="selectFeeSuggestion('${s.id}')">
      <div class="sg-avatar">${s.photo?`<img src="${s.photo}">`:initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('');
    box.classList.add('open');
  }
  function selectFeeSuggestion(id){
    hideFeeSuggestions();
    document.getElementById('mfSearch').value = '';
    feeTab = 'fees';
    switchFeeTab('fees');
    openStudentLedger(id);
  }
  function hideFeeSuggestions(){
    const box = document.getElementById('feeSearchSuggestions');
    if(box) box.classList.remove('open');
  }

  /* ===== ATTENDANCE MODULE ===== */
  