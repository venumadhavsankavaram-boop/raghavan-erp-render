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
  async function savePayment(e){
    e.preventDefault();
    await ensureDataLoaded('payments', loadPaymentsData);
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

  function nextReceiptNo(){
    const yy = String(new Date().getFullYear()).slice(2);
    const seq = (Number(receiptSettings.startNumber) || 1) + payments.length;
    return 'REHS-' + yy + '-' + String(seq).padStart(6,'0');
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
  