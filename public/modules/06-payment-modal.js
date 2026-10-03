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
  async function printReceiptRecords(recs){
    await ensureDataLoaded('payments', loadPaymentsData);
    const p = recs[0];
    if(!p) return;
    const s = students.find(x => x.id === p.studentId);
    if(!s) return;
    const receiptNo = p.receiptNo || nextReceiptNo();
    const netPaid = recs.reduce((sum,r) => sum + (Number(r.amount)||0), 0);
    const disc = recs.reduce((sum,r) => sum + (Number(r.discount)||0), 0);
    const { totals } = computeStudentFinance(s);
    const phone = s.fatherPhone || s.motherPhone || s.guardianPhone || '—';
    const address = s.fatherAddress || s.motherAddress || s.guardianAddress || '—';
    const fatherName = s.fatherName || '—';
    const amountWords = 'Rs ' + numberToWordsIndian(netPaid) + ' Only';
    const feeRowsHtml = recs.map(r => `<tr><td>${feeLabelFor(r)}</td><td>${r.instalment || '—'}</td><td style="text-align:right;">${(Number(r.amount)||0).toLocaleString('en-IN')}.00</td></tr>`).join('');

    const copyBlock = (label) => `
      <div class="rcpt-copy">
        <div class="rcpt-head">
          <img src="data:image/png;base64,${document.querySelector('.sb-brand img').src.split(',')[1]}" class="rcpt-logo">
          <div class="rcpt-head-text">
            <div class="rcpt-school">${schoolInfo.name}</div>
            <div class="rcpt-addr">${schoolInfo.address}</div>
            <div class="rcpt-addr">${schoolInfo.phone}${phone !== '—' ? ', '+phone : ''}</div>
          </div>
        </div>
        <div class="rcpt-title">FEE RECEIPT (${label})</div>
        <div class="rcpt-row2col">
          <span>Receipt NO&nbsp; :&nbsp; <b>${receiptNo}</b></span>
          <span>Date: <b>${p.date || '—'}</b></span>
        </div>
        <div class="rcpt-line">Student ID&nbsp; :&nbsp; ${s.admissionNo}</div>
        <div class="rcpt-line">Student Name&nbsp; :&nbsp; <b>${(s.firstName+' '+s.lastName).toUpperCase()}</b></div>
        <div class="rcpt-line">Class &amp; Type&nbsp; &nbsp;${s.className}, Section ${s.section} - Day Scholar</div>
        <div class="rcpt-line">Father Name&nbsp; :&nbsp; ${fatherName}</div>
        <table class="rcpt-table">
          <thead><tr><td><b>FEE NAME</b></td><td><b>INSTALMENT</b></td><td style="text-align:right;"><b>AMOUNT</b></td></tr></thead>
          <tbody>
            ${feeRowsHtml}
            <tr class="rcpt-total-row"><td colspan="2">Total Paid Amount</td><td style="text-align:right;">${netPaid.toLocaleString('en-IN')}.00</td></tr>
          </tbody>
        </table>
        <div class="rcpt-line" style="margin-top:6px;">Remaining Due Amount:&nbsp; <b>${totals.receivable.toLocaleString('en-IN')}.00</b></div>
        <div class="rcpt-line">In Words: ${amountWords}</div>
        <div class="rcpt-line">Father Mobile NO&nbsp; ${phone}</div>
        <div class="rcpt-line">Address:&nbsp; ${address}</div>
        <div class="rcpt-sign">
          <div>(${(currentUser && currentUser.role) || 'Admin'})</div>
          <div>Authorised Signatory</div>
        </div>
        <div class="rcpt-note">Note: Once Fee Paid it's Not refundable &amp; Transferable</div>
      </div>
    `;

    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Receipt ${receiptNo}</title>
      <style>
        @page{ size:A4; margin:6mm; }
        body{ font-family:Arial,Helvetica,sans-serif; margin:0; color:#111; }
        .rcpt-row{ display:flex; align-items:flex-start; width:100%; box-sizing:border-box; }
        .rcpt-copy{ width:50%; box-sizing:border-box; padding:5mm; display:flex; flex-direction:column; border:1px solid #333; }
        .rcpt-gap{ align-self:stretch; width:6mm; flex-shrink:0; border-left:2px dashed #999; border-right:2px dashed #999; margin:0 -1px; }
        .rcpt-head{ display:flex; align-items:center; gap:6px; justify-content:center; margin-bottom:6px; }
        .rcpt-logo{ width:30px; height:30px; border-radius:50%; }
        .rcpt-head-text{ text-align:center; }
        .rcpt-school{ font-weight:700; font-size:13px; }
        .rcpt-addr{ font-size:9px; }
        .rcpt-title{ text-align:center; font-weight:700; font-size:10px; border-top:1px solid #333; border-bottom:1px solid #333; padding:3px 0; margin-bottom:6px; }
        .rcpt-row2col{ display:flex; justify-content:space-between; font-size:9.5px; margin-bottom:3px; }
        .rcpt-line{ font-size:9.5px; margin-bottom:3px; }
        .rcpt-table{ width:100%; border-collapse:collapse; font-size:9.5px; margin-top:6px; }
        .rcpt-table thead td{ border-top:1px solid #333; border-bottom:1px solid #333; padding:3px 2px; }
        .rcpt-table tbody td{ padding:3px 2px; }
        .rcpt-total-row td{ border-top:1px solid #333; font-weight:700; padding-top:4px; }
        .rcpt-sign{ margin-top:14px; font-size:9.5px; text-align:right; font-weight:600; }
        .rcpt-note{ font-size:8px; margin-top:10px; padding-top:6px; border-top:1px dashed #ccc; font-style:italic; }
      </style></head>
      <body onload="window.print()">
        <div class="rcpt-row">
          ${copyBlock('OFFICE COPY')}
          <div class="rcpt-gap"></div>
          ${copyBlock('STUDENT COPY')}
        </div>
      </body></html>
    `);
    w.document.close();
  }


  /* ===== MANAGE FEE MODULE ===== */
  