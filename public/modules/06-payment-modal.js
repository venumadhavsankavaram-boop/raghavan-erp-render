function openPaymentModal(presetStudentId){
    const sel = document.getElementById('pStudent');
    sel.innerHTML = '<option value="" disabled selected>Select student</option>' +
      students.map(s => `<option value="${s.id}">${s.name} — ${s.admissionNo} (${s.className} ${s.section})</option>`).join('');
    document.getElementById('paymentForm').reset();
    if(presetStudentId){ sel.value = presetStudentId; }
    const discSel = document.getElementById('pDiscountType');
    discSel.innerHTML = '<option value="">Custom / None</option>' +
      discountTypes.map(d => `<option value="${d.id}">${d.name} — ${fmtMoney(d.amount)}</option>`).join('');
    document.getElementById('paymentModalOverlay').classList.add('open');
    updatePaymentSummary();
  }
  function onDiscountTypeChange(){
    const id = document.getElementById('pDiscountType').value;
    const d = discountTypes.find(x => x.id === id);
    if(d){ document.getElementById('pDiscount').value = d.amount; }
    updatePaymentSummary();
  }
  function updatePaymentSummary(){
    const box = document.getElementById('paymentSummaryBox');
    if(!box) return;
    const studentId = document.getElementById('pStudent').value;
    const s = students.find(x => x.id === studentId);
    if(!s){ box.innerHTML = ''; return; }
    const category = document.getElementById('pCategory').value;
    const amountInput = Number(document.getElementById('pAmount').value) || 0;
    const discountInput = Number(document.getElementById('pDiscount').value) || 0;
    const { perCat } = computeStudentFinance(s);
    const cat = perCat[category] || { expected:0, collected:0, discount:0, receivable:0 };
    const balanceNow = cat.receivable;
    const balanceAfter = Math.max(balanceNow - amountInput - discountInput, 0);
    const overpaying = (amountInput + discountInput) > balanceNow && balanceNow > 0;

    box.innerHTML = `
      <div class="pay-summary-box">
        <div class="pay-summary-title">${CATS[category]} — Current Standing for ${s.firstName} ${s.lastName}</div>
        <div class="pay-summary-grid">
          <div class="pay-summary-item"><span>Total Fee (Expected)</span><b>${fmtMoney(cat.expected)}</b></div>
          <div class="pay-summary-item"><span>Discount Applied So Far</span><b>${fmtMoney(cat.discount)}</b></div>
          <div class="pay-summary-item"><span>Already Collected</span><b>${fmtMoney(cat.collected)}</b></div>
          <div class="pay-summary-item highlight"><span>Balance Due Now</span><b>${fmtMoney(balanceNow)}</b></div>
          <div class="pay-summary-item after"><span>Balance After This Payment</span><b>${fmtMoney(balanceAfter)}</b></div>
        </div>
        ${overpaying ? `<div class="pay-summary-warn">⚠ This amount + discount exceeds the current balance due for ${CATS[category]}.</div>` : ``}
      </div>
    `;
  }
  function closePaymentModal(){
    document.getElementById('paymentModalOverlay').classList.remove('open');
  }
  // One money-recording action at a time: a double-click, a held Enter key or a slow save used to
  // run the same save again and again, creating the same receipt several times with new numbers.
  let rcBusy = false;
  async function rcGuard(fn){
    if(rcBusy) return;
    rcBusy = true;
    try{ return await fn(); }
    finally{ setTimeout(() => { rcBusy = false; }, 500); }
  }
  function savePayment(e){
    if(e && e.preventDefault) e.preventDefault();
    return rcGuard(() => savePaymentImpl(e));
  }
  async function savePaymentImpl(e){
    e.preventDefault();
    await ensureDataLoaded('payments', loadPaymentsData);
    await rcEnsure(1);
    const studentId = document.getElementById('pStudent').value;
    const student = students.find(s => s.id === studentId);
    if(!student){ showToast('Please select a student.'); return false; }
    const record = {
      id: 'pay_' + Date.now(),
      receiptNo: nextReceiptNo(),
      studentId, studentName: student.name,
      category: document.getElementById('pCategory').value,
      mode: document.getElementById('pMode').value,
      amount: Number(document.getElementById('pAmount').value) || 0,
      discount: Number(document.getElementById('pDiscount').value) || 0,
      instalment: document.getElementById('pInstalment').value.trim(),
      date: document.getElementById('pDate').value || new Date().toISOString().slice(0,10),
      note: document.getElementById('pNote').value.trim(),
      classAtPayment: student.className,
    };
    payments.push(record);
    await storageSet(PAYMENTS_KEY, payments);
    closePaymentModal();
    renderDashboard();
    if(document.getElementById('view-managefee').style.display !== 'none') renderFeeBody();
    // The server refuses an identical payment saved moments ago; the extra copy is removed from the list.
    if(!payments.includes(record)) return;
    showToast('Payment recorded.', 'radial', record.amount);
    if(await showConfirmDialog('Payment recorded. Print receipt now?')){
      printReceipt(record.id);
    }
    return false;
  }

  function numberToWordsIndian(numIn){
    let num = Math.round(Number(numIn)||0);
    if(num === 0) return 'Zero';
    const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    function twoDigits(n){ return n<20 ? a[n] : b[Math.floor(n/10)] + (n%10 ? ' '+a[n%10] : ''); }
    function threeDigits(n){ return n>99 ? a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + twoDigits(n%100) : '') : twoDigits(n); }
    let str = '';
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thousand = Math.floor(num / 1000); num %= 1000;
    const hundred = num;
    if(crore) str += threeDigits(crore) + ' Crore ';
    if(lakh) str += threeDigits(lakh) + ' Lakh ';
    if(thousand) str += threeDigits(thousand) + ' Thousand ';
    if(hundred) str += threeDigits(hundred);
    return str.trim();
  }

  // ---- Receipt numbers are issued by the server, so two people can never get the same one ----
  // Callers do `await rcEnsure(n)` first (it asks the server for n numbers and keeps them in
  // rcPool), then nextReceiptNo() hands one out synchronously, exactly as before. If the
  // server cannot be reached, nextReceiptNo() falls back to the old count-based formula but
  // skips any number already on record.
  let rcPool = [];
  function receiptPrefix(){
    // Receipt code comes from School Profile > Identity. Installs that never set one keep
    // 'REHS' so their existing numbering carries on unchanged.
    let code = String((typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.receiptCode) || 'REHS').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    if(code.length < 2) code = 'REHS';
    return code + '-' + String(new Date().getFullYear()).slice(2) + '-';
  }
  // Display-only number for a receipt that is not being saved (never reserves a real one).
  function previewReceiptNo(){
    const seq = (Number(receiptSettings.startNumber) || 1) + payments.length;
    return receiptPrefix() + String(seq).padStart(6,'0');
  }
  async function rcEnsure(n){
    n = Math.max(1, Math.min(Number(n) || 1, 20));
    const prefix = receiptPrefix();
    rcPool = rcPool.filter(x => x.indexOf(prefix) === 0);
    if(rcPool.length >= n) return true;
    try{
      const res = await fetch('/api/receipt-numbers', {
        method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()},
        body: JSON.stringify({ prefix, start: Number(receiptSettings.startNumber) || 1, count: n - rcPool.length })
      });
      if(!res.ok) throw new Error('bad response');
      const data = await res.json();
      if(Array.isArray(data.numbers)) rcPool = rcPool.concat(data.numbers);
      return true;
    }catch(e){ return false; }
  }
  function nextReceiptNo(){
    const prefix = receiptPrefix();
    rcPool = rcPool.filter(x => x.indexOf(prefix) === 0);
    if(rcPool.length) return rcPool.shift();
    const used = new Set(payments.map(p => p.receiptNo));
    let seq = (Number(receiptSettings.startNumber) || 1) + payments.length;
    let no = prefix + String(seq).padStart(6,'0');
    while(used.has(no)){ seq++; no = prefix + String(seq).padStart(6,'0'); }
    return no;
  }

  // Prints one payment record exactly as before — unchanged for every
  // existing single-category payment, which is still the vast majority.
  async function printReceipt(paymentIdOrRecord){
    await ensureDataLoaded('payments', loadPaymentsData);
    const p = (typeof paymentIdOrRecord === 'object' && paymentIdOrRecord !== null)
      ? paymentIdOrRecord
      : payments.find(x => x.id === paymentIdOrRecord);
    if(!p) return;
    // A family-fee collection gives every fee head paid for ONE student in
    // the same batch the same receipt number (see recordFamilyPayment), so
    // grouping by receiptNo here prints them as one itemized receipt instead
    // of one receipt per head — while a normal single-category payment's
    // receiptNo is unique to itself, so this group is always just [p].
    const group = p.receiptNo ? payments.filter(x => x.receiptNo === p.receiptNo && x.studentId === p.studentId) : [p];
    printReceiptRecords(group.length ? group : [p]);
  }
  // Prints every payment record sharing one receipt number (e.g. from
  // recordFamilyPayment) as a single itemized receipt.
  async function printReceiptByNo(receiptNo){
    await ensureDataLoaded('payments', loadPaymentsData);
    const recs = payments.filter(p => p.receiptNo === receiptNo);
    if(!recs.length) return;
    printReceiptRecords(recs);
  }
  /* ===== MANAGE FEE MODULE ===== */
  