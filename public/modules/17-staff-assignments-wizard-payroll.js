function daysInPayrollMonth(monthStr){
    const [y,m] = (monthStr||'').split('-').map(Number);
    if(!y || !m) return 30;
    return new Date(y, m, 0).getDate();
  }
  function currentMonthStr(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  // Returns a DAY-equivalent count, not a raw row count — payroll deducts in
  // days, not sessions. A sessionless (legacy) row already weighs 2 (one
  // full day), and a Morning+Afternoon pair also sums to 2, so dividing the
  // total weight by 2 gives whole days for a fully-absent day and 0.5 for a
  // single missed session (e.g. left after lunch) either way.
  function staffAttendanceCountInMonth(staffId, monthStr, statuses){
    const weight = staffAttendanceRecords
      .filter(r => r.staffId===staffId && (r.date||'').slice(0,7)===monthStr && statuses.includes(r.status))
      .reduce((n,r) => n + attSessionWeight(r), 0);
    return weight / 2;
  }
  function findPayrollRecord(staffId, monthStr){
    return staffPayrollRecords.find(p => p.staffId === staffId && p.month === monthStr);
  }
  /* Pure calculation — does not read/write any saved record. overrides lets the Payroll tab
     preview changes to bonus/otherDeductions before saving a Draft. */
  function computeStaffPayroll(staffId, monthStr, overrides){
    const st = staffList.find(x => x.id === staffId);
    if(!st) return null;
    overrides = overrides || {};
    const basic = Number(st.salary) || 0;
    const quota = st.paidLeavesPerMonth !== undefined && st.paidLeavesPerMonth !== '' ? Number(st.paidLeavesPerMonth) : 1;
    const leaveDays = staffAttendanceCountInMonth(staffId, monthStr, ['Leave','Absent']);
    const dim = daysInPayrollMonth(monthStr);
    const lopDays = Math.max(0, leaveDays - quota);
    const perDay = dim ? basic / dim : 0;
    const lopDeduction = Math.round(perDay * lopDays * 100) / 100;
    // Auto defaults: a fixed ₹/month amount set once on the staff profile (Add/Edit Staff →
    // Payroll tab), only if the staff member is enrolled — not every teacher is, and EPF/ESI is
    // deliberately NOT a % of the entire basic salary here, since that rarely matches what's
    // actually deducted (e.g. a statutory wage ceiling). Set once, it applies every month with
    // nothing to redo; EPF/ESI (Employee) can still be typed over in the Payroll tab for a
    // one-off exception in a specific month, without changing the standing amount.
    const autoEpfEmployee = st.epfEnabled ? (Number(st.epfEmployeeAmount) || 0) : 0;
    const epfEmployer = st.epfEnabled ? (Number(st.epfEmployerAmount) || 0) : 0;
    const autoEsiEmployee = st.esiEnabled ? (Number(st.esiEmployeeAmount) || 0) : 0;
    const esiEmployer = st.esiEnabled ? (Number(st.esiEmployerAmount) || 0) : 0;
    const epfManual = overrides.epfEmployee !== undefined;
    const esiManual = overrides.esiEmployee !== undefined;
    const epfEmployee = epfManual ? (Number(overrides.epfEmployee) || 0) : autoEpfEmployee;
    const esiEmployee = esiManual ? (Number(overrides.esiEmployee) || 0) : autoEsiEmployee;
    const otherDeductions = overrides.otherDeductions !== undefined ? (Number(overrides.otherDeductions) || 0) : (Number(st.otherMonthlyDeduction) || 0);
    const bonus = overrides.bonus !== undefined ? (Number(overrides.bonus) || 0) : 0;
    const grossSalary = Math.round((basic + bonus) * 100) / 100;
    const totalDeductions = Math.round((epfEmployee + esiEmployee + lopDeduction + otherDeductions) * 100) / 100;
    const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;
    return {
      staffId, month: monthStr, basic, quota, leaveDays, lopDays, lopDeduction,
      epfEmployee, epfEmployer, esiEmployee, esiEmployer, epfManual, esiManual, otherDeductions, bonus,
      grossSalary, totalDeductions, netSalary,
    };
  }
  /* Draft (and not-yet-generated) rows always reflect live staff-master data — salary, EPF/ESI
     enrollment & %, paid-leave quota, and this month's attendance — so editing a staff member's
     payroll settings shows up immediately without needing to click Recalculate. Only Bonus, Other
     Deduction, and a manually-typed EPF/ESI amount (if the admin overrode one) carry over from the
     saved record. Approved rows stay exactly as locked in. */
  function staffPayrollRowData(staffId, monthStr){
    const rec = findPayrollRecord(staffId, monthStr);
    const locked = !!(rec && rec.status === 'Approved');
    if(locked) return { rec, preview: rec, locked };
    const overrides = rec ? {
      bonus: rec.bonus, otherDeductions: rec.otherDeductions,
      epfEmployee: rec.epfManual ? rec.epfEmployee : undefined,
      esiEmployee: rec.esiManual ? rec.esiEmployee : undefined,
    } : {};
    return { rec, preview: computeStaffPayroll(staffId, monthStr, overrides), locked };
  }
  async function saveDraftPayroll(staffId, monthStr){
    await ensureDataLoaded('staffAttendanceRecords', loadStaffAttendance);
    const existing = findPayrollRecord(staffId, monthStr);
    if(existing && existing.status === 'Approved'){ showToast('This month is already Approved — reopen it first to make changes.'); return; }
    const bonusInput = document.getElementById('payBonus_'+staffId+'_'+monthStr);
    const otherInput = document.getElementById('payOther_'+staffId+'_'+monthStr);
    const epfInput = document.getElementById('payEpf_'+staffId+'_'+monthStr);
    const esiInput = document.getElementById('payEsi_'+staffId+'_'+monthStr);
    const overrides = {
      bonus: bonusInput ? bonusInput.value : (existing ? existing.bonus : 0),
      otherDeductions: otherInput ? otherInput.value : undefined,
    };
    // EPF/ESI (Employee) stay live-calculated from the staff profile unless the entered amount
    // no longer matches what auto-calc would produce right now — then it's treated as a manual
    // override and saved as-is, even if that's 0 (a teacher not enrolled, or exempt this month).
    if(epfInput || esiInput){
      const autoCalc = computeStaffPayroll(staffId, monthStr, {});
      if(epfInput && epfInput.value !== '' && Number(epfInput.value) !== autoCalc.epfEmployee) overrides.epfEmployee = epfInput.value;
      if(esiInput && esiInput.value !== '' && Number(esiInput.value) !== autoCalc.esiEmployee) overrides.esiEmployee = esiInput.value;
    }
    const calc = computeStaffPayroll(staffId, monthStr, overrides);
    if(!calc) return;
    if(existing){
      Object.assign(existing, calc, { status:'Draft', generatedDate: new Date().toISOString().slice(0,10) });
    }else{
      staffPayrollRecords.push({ id:'pay_'+staffId+'_'+monthStr, ...calc, status:'Draft', generatedDate: new Date().toISOString().slice(0,10) });
    }
    await storageSet(STAFF_PAYROLL_KEY, staffPayrollRecords);
    showToast('Payroll draft saved.', 'burst');
    renderStaffBody();
  }
  async function approvePayroll(staffId, monthStr){
    if(!getRolePermission(currentUser.role, 'staff', 'approve')){ showToast("You don't have permission to approve payroll."); return; }
    const rec = findPayrollRecord(staffId, monthStr);
    if(!rec){ showToast('Generate a draft first.'); return; }
    if(!await showConfirmDialog(`Approve payroll for ${monthStr}? This locks in Net Salary of ${fmtMoney(rec.netSalary)} — it will not change even if salary or attendance is edited later.`)) return;
    rec.status = 'Approved';
    rec.approvedBy = currentUser.name;
    rec.approvedDate = new Date().toISOString().slice(0,10);
    await storageSet(STAFF_PAYROLL_KEY, staffPayrollRecords);
    showToast('Payroll approved and locked in.', 'burst');
    renderStaffBody();
  }
  async function reopenPayroll(staffId, monthStr){
    if(!getRolePermission(currentUser.role, 'staff', 'approve')){ showToast("You don't have permission to reopen an approved payroll."); return; }
    const rec = findPayrollRecord(staffId, monthStr);
    if(!rec) return;
    if(!await showConfirmDialog('Reopen this approved payroll for editing? It goes back to Draft until re-approved.')) return;
    rec.status = 'Draft';
    await storageSet(STAFF_PAYROLL_KEY, staffPayrollRecords);
    renderStaffBody();
  }
  let staffPayrollMonth = currentMonthStr();
  function onStaffPayrollMonthChange(){
    staffPayrollMonth = document.getElementById('staffPayrollMonthSelect').value || currentMonthStr();
    renderStaffBody();
  }
  function payrollMonthOptions(){
    const opts = [];
    const now = new Date();
    for(let i=0;i<12;i++){
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const v = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      opts.push(`<option value="${v}" ${v===staffPayrollMonth?'selected':''}>${d.toLocaleString('en-IN',{month:'long',year:'numeric'})}</option>`);
    }
    return opts.join('');
  }
  function renderStaffPayrollTab(body){
    const canApprove = getStaffSubpageAccess(currentUser.role, 'staff_payroll', 'approve');
    const canEditPayroll = getStaffSubpageAccess(currentUser.role, 'staff_payroll', 'edit');
    const canPrintPayroll = getStaffSubpageAccess(currentUser.role, 'staff_payroll', 'print');
    const deptF = document.getElementById('staffDeptFilter') ? document.getElementById('staffDeptFilter').value : '';
    const list = staffList.filter(staffIsActive).filter(st => !deptF || st.department === deptF)
      .sort((a,b) => (a.firstName+a.lastName).localeCompare(b.firstName+b.lastName));
    // Computed once per staff member so both the table rows and the totals below use
    // the exact same numbers — every active staff member counts here (Draft or
    // Approved), unlike the Salary Disbursement Report further down which
    // deliberately only counts Approved ones. This is the "what is this month's
    // whole payroll going to cost" view; that one is the "who do I actually pay
    // right now" view.
    const computed = list.map(st => ({ st, ...staffPayrollRowData(st.id, staffPayrollMonth) }));
    const totals = computed.reduce((acc, c) => ({
      basic: acc.basic + (Number(c.preview.basic)||0),
      lopDeduction: acc.lopDeduction + (Number(c.preview.lopDeduction)||0),
      epfEmployee: acc.epfEmployee + (Number(c.preview.epfEmployee)||0),
      esiEmployee: acc.esiEmployee + (Number(c.preview.esiEmployee)||0),
      otherDeductions: acc.otherDeductions + (Number(c.preview.otherDeductions)||0),
      bonus: acc.bonus + (Number(c.preview.bonus)||0),
      grossSalary: acc.grossSalary + (Number(c.preview.grossSalary)||0),
      netSalary: acc.netSalary + (Number(c.preview.netSalary)||0),
    }), { basic:0, lopDeduction:0, epfEmployee:0, esiEmployee:0, otherDeductions:0, bonus:0, grossSalary:0, netSalary:0 });
    const totalDeductions = totals.lopDeduction + totals.epfEmployee + totals.esiEmployee + totals.otherDeductions;
    const monthLabel = new Date(staffPayrollMonth+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'});
    body.innerHTML = `
      <div class="profile-card" style="margin-bottom:20px; max-width:520px;">
        <h4>Payroll Month</h4>
        <select id="staffPayrollMonthSelect" onchange="onStaffPayrollMonthChange()" style="width:100%; margin-top:8px;">${payrollMonthOptions()}</select>
        <p style="font-size:0.76rem; color:var(--ink-soft); margin:10px 0 0;">EPF and ESI (Employee) are pulled automatically from the fixed ₹/month amount set once per staff member (Add/Edit Staff → Payroll tab) — nothing to re-enter here every month. Edit either amount directly only for a one-off exception in a specific month; it's saved as typed and won't be overwritten later. Use ↺ to go back to the standing amount.</p>
      </div>
      <div class="pay-summary-box" style="margin-bottom:16px;">
        <h4 style="margin:0 0 10px;">Payroll Summary — ${monthLabel}${deptF ? ' · '+deptF : ''}</h4>
        <div class="pay-summary-grid">
          <div class="pay-summary-item"><span>Staff Included</span><b>${computed.length}</b></div>
          <div class="pay-summary-item"><span>Gross Payroll</span><b>${fmtMoney(totals.grossSalary)}</b></div>
          <div class="pay-summary-item"><span>Total Deductions</span><b>${fmtMoney(totalDeductions)}</b></div>
          <div class="pay-summary-item highlight"><span>Total Payroll This Month (Net)</span><b>${fmtMoney(totals.netSalary)}</b></div>
        </div>
        <p style="font-size:0.74rem; color:var(--ink-soft); margin:10px 0 0;">Every active staff member above, whatever their approval status — this is the full month's payroll cost, not just what's ready to pay out today.</p>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Staff</th><th>Department</th><th>Basic</th><th>Leaves (Taken/Quota)</th><th>LOP Deduction</th>
          <th>EPF (Emp)</th><th>ESI (Emp)</th><th>Other Ded.</th><th>Bonus</th><th>Gross</th><th>Net</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
        ${computed.map(({ st, rec, preview, locked }) => {
          return `<tr>
            <td class="name-cell" style="cursor:pointer;" onclick="openStaffProfile('${st.id}')">${st.firstName} ${st.lastName}</td>
            <td>${st.department||'—'}</td>
            <td>${fmtMoney(preview.basic)}</td>
            <td>${preview.leaveDays} / ${preview.quota}${preview.lopDays>0 ? ` <span class="pill" style="background:rgba(209,16,115,0.13); color:var(--magenta); font-size:0.62rem;">${preview.lopDays} LOP</span>` : ''}</td>
            <td>${fmtMoney(preview.lopDeduction)}</td>
            <td>${locked ? fmtMoney(preview.epfEmployee) : `<input type="number" min="0" step="0.01" id="payEpf_${st.id}_${staffPayrollMonth}" value="${preview.epfEmployee}" style="width:80px;" onchange="saveDraftPayroll('${st.id}','${staffPayrollMonth}')" title="${st.epfEnabled ? 'Auto: ₹'+(Number(st.epfEmployeeAmount)||0)+'/month set on this staff member — edit to override just this month' : 'Not enrolled in EPF — enter an amount only if one applies this month'}">${preview.epfManual ? ` <a onclick="resetPayrollField('${st.id}','${staffPayrollMonth}','epf')" style="font-size:0.7rem; cursor:pointer;" title="Reset to the standing amount">↺</a>` : ``}`}</td>
            <td>${locked ? fmtMoney(preview.esiEmployee) : `<input type="number" min="0" step="0.01" id="payEsi_${st.id}_${staffPayrollMonth}" value="${preview.esiEmployee}" style="width:80px;" onchange="saveDraftPayroll('${st.id}','${staffPayrollMonth}')" title="${st.esiEnabled ? 'Auto: ₹'+(Number(st.esiEmployeeAmount)||0)+'/month set on this staff member — edit to override just this month' : 'Not enrolled in ESI — enter an amount only if one applies this month'}">${preview.esiManual ? ` <a onclick="resetPayrollField('${st.id}','${staffPayrollMonth}','esi')" style="font-size:0.7rem; cursor:pointer;" title="Reset to the standing amount">↺</a>` : ``}`}</td>
            <td>${locked ? fmtMoney(preview.otherDeductions) : `<input type="number" min="0" id="payOther_${st.id}_${staffPayrollMonth}" value="${preview.otherDeductions}" style="width:80px;" onchange="saveDraftPayroll('${st.id}','${staffPayrollMonth}')">`}</td>
            <td>${locked ? fmtMoney(preview.bonus) : `<input type="number" min="0" id="payBonus_${st.id}_${staffPayrollMonth}" value="${preview.bonus||0}" style="width:80px;" onchange="saveDraftPayroll('${st.id}','${staffPayrollMonth}')">`}</td>
            <td><b>${fmtMoney(preview.grossSalary)}</b></td>
            <td><b>${fmtMoney(preview.netSalary)}</b></td>
            <td>${rec ? `<span class="pill" style="${locked?'background:rgba(31,122,77,0.13); color:#1f7a4d;':'background:rgba(184,98,27,0.13); color:#b8621b;'}">${rec.status}</span>` : `<span class="pill">Not generated</span>`}</td>
            <td>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${!rec && canEditPayroll ? `<button class="btn-edit-text" onclick="saveDraftPayroll('${st.id}','${staffPayrollMonth}')">Generate Draft</button>` : ``}
                ${rec && rec.status==='Draft' && canEditPayroll ? `<button class="btn-edit-text" onclick="saveDraftPayroll('${st.id}','${staffPayrollMonth}')">Recalculate</button>` : ``}
                ${rec && rec.status==='Draft' && canApprove ? `<button class="btn-edit-text" style="color:#1f7a4d;" onclick="approvePayroll('${st.id}','${staffPayrollMonth}')">Approve</button>` : ``}
                ${locked && canApprove ? `<button class="btn-edit-text" style="color:var(--magenta);" onclick="reopenPayroll('${st.id}','${staffPayrollMonth}')">Reopen</button>` : ``}
                ${rec && canPrintPayroll ? `<button class="btn-edit-text" onclick="printPayslip('${st.id}','${staffPayrollMonth}')">🧾 Payslip</button>` : ``}
              </div>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
        ${computed.length ? `<tfoot><tr style="font-weight:700; background:var(--cream);">
          <td colspan="2">TOTAL — ${monthLabel}</td>
          <td>${fmtMoney(totals.basic)}</td>
          <td></td>
          <td>${fmtMoney(totals.lopDeduction)}</td>
          <td>${fmtMoney(totals.epfEmployee)}</td>
          <td>${fmtMoney(totals.esiEmployee)}</td>
          <td>${fmtMoney(totals.otherDeductions)}</td>
          <td>${fmtMoney(totals.bonus)}</td>
          <td>${fmtMoney(totals.grossSalary)}</td>
          <td>${fmtMoney(totals.netSalary)}</td>
          <td colspan="2"></td>
        </tr></tfoot>` : ``}
        </table>
        ${list.length===0 ? `<div class="empty-state"><b>No active staff to show</b></div>` : ``}
      </div>
      ${canPrintPayroll ? `<div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn btn-ghost btn-sm" onclick="downloadStaffPayrollExcel()">📥 Excel</button>
        <button class="btn btn-ghost btn-sm" onclick="downloadStaffPayrollPDF()">📄 PDF</button>
      </div>` : ''}
      ${renderSalaryRegisterCard(canPrintPayroll)}
      ${renderSalaryDisbursementCard()}
    `;
  }
  /* ===== Individual Payslip =====
     A single-employee printable payslip built from the same computeStaffPayroll() numbers
     already shown in the Payroll table/Salary Register/Disbursement Report above — this is
     just the one-employee, hand-to-them format schools also need every month. */
  function printPayslip(staffId, monthStr){
    const st = staffList.find(x => x.id === staffId);
    if(!st) return;
    const { preview } = staffPayrollRowData(staffId, monthStr);
    if(!preview) return;
    const monthLabel = new Date(monthStr+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'});
    const netWords = 'Rs ' + numberToWordsIndian(preview.netSalary) + ' Only';
    const logoImg = document.querySelector('.sb-brand img');
    const logoSrc = logoImg ? logoImg.src : '';

    const earnings = [
      { label:'Basic Salary', amount: preview.basic },
      { label:'Bonus', amount: preview.bonus },
    ].filter(r => r.amount > 0);
    const deductions = [
      { label:`Loss of Pay (${preview.lopDays} day${preview.lopDays===1?'':'s'})`, amount: preview.lopDeduction },
      { label:'EPF (Employee)', amount: preview.epfEmployee },
      { label:'ESI (Employee)', amount: preview.esiEmployee },
      { label:'Other Deductions', amount: preview.otherDeductions },
    ].filter(r => r.amount > 0);
    const totalEarnings = earnings.reduce((s,r)=>s+r.amount,0);

    const rowsHtml = (rows) => rows.map(r => `<tr><td>${r.label}</td><td style="text-align:right;">${fmtMoney(r.amount)}</td></tr>`).join('')
      || `<tr><td colspan="2" style="color:#888;">—</td></tr>`;

    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Payslip - ${st.firstName} ${st.lastName} - ${monthLabel}</title>
      <style>
        @page{ size:A4; margin:12mm; }
        body{ font-family:Arial,Helvetica,sans-serif; margin:0; color:#111; }
        .ps-wrap{ max-width:700px; margin:0 auto; border:1px solid #333; padding:16px; }
        .ps-head{ display:flex; align-items:center; gap:10px; justify-content:center; text-align:center; margin-bottom:6px; }
        .ps-logo{ width:38px; height:38px; border-radius:50%; }
        .ps-school{ font-weight:700; font-size:16px; }
        .ps-addr{ font-size:10px; color:#333; }
        .ps-title{ text-align:center; font-weight:700; font-size:12px; border-top:1px solid #333; border-bottom:1px solid #333; padding:5px 0; margin:10px 0; letter-spacing:0.04em; text-transform:uppercase; }
        .ps-meta{ display:grid; grid-template-columns:1fr 1fr; gap:4px 18px; font-size:11px; margin-bottom:14px; }
        .ps-meta div span{ color:#555; }
        .ps-cols{ display:flex; gap:14px; }
        .ps-col{ flex:1; }
        .ps-col h5{ margin:0 0 6px; font-size:11px; text-transform:uppercase; border-bottom:1.5px solid #333; padding-bottom:4px; }
        table.ps-table{ width:100%; border-collapse:collapse; font-size:11px; }
        table.ps-table td{ padding:4px 2px; }
        .ps-total-row td{ border-top:1px solid #333; font-weight:700; padding-top:6px; }
        .ps-net{ margin-top:16px; padding-top:10px; border-top:2px solid #333; display:flex; justify-content:space-between; align-items:baseline; font-weight:700; font-size:14px; }
        .ps-words{ font-size:10.5px; margin-top:4px; font-style:italic; color:#333; }
        .ps-sign{ margin-top:34px; display:flex; justify-content:space-between; font-size:10.5px; font-weight:600; }
        .ps-footnote{ font-size:8.5px; margin-top:14px; padding-top:8px; border-top:1px dashed #ccc; color:#666; }
      </style></head>
      <body onload="window.print()">
        <div class="ps-wrap">
          <div class="ps-head">
            ${logoSrc ? `<img src="${logoSrc}" class="ps-logo">` : ''}
            <div>
              <div class="ps-school">${schoolInfo.name || ''}</div>
              <div class="ps-addr">${schoolInfo.address || ''}</div>
              <div class="ps-addr">${schoolInfo.phone || ''}</div>
            </div>
          </div>
          <div class="ps-title">Payslip — ${monthLabel}</div>
          <div class="ps-meta">
            <div><span>Employee Name:</span> <b>${st.firstName} ${st.lastName}</b></div>
            <div><span>Employee ID:</span> <b>${st.staffId || '—'}</b></div>
            <div><span>Designation:</span> ${st.designation || '—'}</div>
            <div><span>Department:</span> ${st.department || '—'}</div>
            <div><span>Bank Account:</span> ${st.bankAccountNumber || '—'}</div>
            <div><span>IFSC:</span> ${st.bankIfsc || '—'}</div>
          </div>
          <div class="ps-cols">
            <div class="ps-col">
              <h5>Earnings</h5>
              <table class="ps-table">${rowsHtml(earnings)}
                <tr class="ps-total-row"><td>Gross Earnings</td><td style="text-align:right;">${fmtMoney(totalEarnings)}</td></tr>
              </table>
            </div>
            <div class="ps-col">
              <h5>Deductions</h5>
              <table class="ps-table">${rowsHtml(deductions)}
                <tr class="ps-total-row"><td>Total Deductions</td><td style="text-align:right;">${fmtMoney(preview.totalDeductions)}</td></tr>
              </table>
            </div>
          </div>
          <div class="ps-net">
            <span>Net Salary Payable</span>
            <span>${fmtMoney(preview.netSalary)}</span>
          </div>
          <div class="ps-words">In Words: ${netWords}</div>
          <div class="ps-sign">
            <div>Employee Signature</div>
            <div>Authorised Signatory</div>
          </div>
          <div class="ps-footnote">This is a system-generated payslip and does not require a physical signature.${preview.lopDays>0 ? ` Leave taken this month: ${preview.leaveDays} day(s), of which ${preview.quota} day(s) were paid leave.` : ''}</div>
        </div>
      </body></html>
    `);
    w.document.close();
  }
  /* ===== Salary Register =====
     A simplified, single-page salary sheet — S.No, Name, No. of CL, Net Sal, Cut, EPF, Total —
     matching the plain monthly salary register format schools traditionally hand to the office/
     bank/management (as opposed to the detailed Payroll register above, which also breaks out
     ESI, bonus, and other deductions separately). NO. OF CL here is whole leave/absent days taken
     this month (from Staff Attendance); CUT is the Loss-of-Pay deduction for leave beyond the
     paid-leave quota — same numbers as the Payroll table above, just presented in the familiar
     compact format. Every active staff member, whatever their approval status this month. */
  function staffSalaryRegisterRows(monthStr){
    const list = staffList.filter(staffIsActive).sort((a,b) => (a.firstName+a.lastName).localeCompare(b.firstName+b.lastName));
    return list.map((st, i) => {
      const { preview } = staffPayrollRowData(st.id, monthStr);
      const cl = Math.round((preview.leaveDays||0)*10)/10;
      const cut = Math.round((preview.lopDeduction||0)*100)/100;
      const epf = Math.round((preview.epfEmployee||0)*100)/100;
      const netSal = Math.round((preview.basic||0)*100)/100;
      const total = Math.round((netSal - cut - epf)*100)/100;
      return {
        'S.NO': i+1, 'NAME OF THE TEACHER': (st.firstName+' '+st.lastName).toUpperCase(),
        'NO. OF CL': cl > 0 ? cl : 'NIL', 'NET SAL': netSal, 'CUT': cut > 0 ? cut : '', 'EPF': epf > 0 ? epf : '',
        'TOTAL': total,
      };
    });
  }
  function renderSalaryRegisterCard(canPrintPayroll){
    const monthStr = staffPayrollMonth;
    const monthLabel = new Date(monthStr+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'});
    const rows = staffSalaryRegisterRows(monthStr);
    const total = rows.reduce((sum,r) => sum + (Number(r['TOTAL'])||0), 0);
    return `
      <div class="profile-card" style="margin-top:24px; border-top:4px solid var(--gold);">
        <h4 style="margin:0 0 6px;">📋 Salary Register — ${monthLabel}</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:0 0 16px;">A simplified single-sheet register — S.No, Name, No. of CL, Net Sal, Cut, EPF, Total — for every active staff member, in the compact format schools usually hand to the office or management.</p>
        ${rows.length ? `
        <div class="table-wrap" style="overflow-x:auto; margin-bottom:14px;">
          <table><thead><tr><th>S.No</th><th>Name of the Teacher</th><th>No. of CL</th><th>Net Sal</th><th>Cut</th><th>EPF</th><th>Total</th></tr></thead>
          <tbody>${rows.map(r => `<tr>
            <td>${r['S.NO']}</td><td class="name-cell">${r['NAME OF THE TEACHER']}</td><td>${r['NO. OF CL']}</td>
            <td>${fmtMoney(r['NET SAL'])}</td><td>${r['CUT']!=='' ? fmtMoney(r['CUT']) : '—'}</td><td>${r['EPF']!=='' ? fmtMoney(r['EPF']) : '—'}</td><td><b>${fmtMoney(r['TOTAL'])}</b></td>
          </tr>`).join('')}</tbody>
          <tfoot><tr style="font-weight:700; background:var(--cream);"><td colspan="6" style="text-align:right;">TOTAL</td><td>${fmtMoney(total)}</td></tr></tfoot>
          </table>
        </div>
        ${canPrintPayroll ? `<div style="display:flex; gap:10px;">
          <button class="btn btn-ghost btn-sm" onclick="downloadSalaryRegisterExcel()">📥 Excel</button>
          <button class="btn btn-ghost btn-sm" onclick="downloadSalaryRegisterPDF()">📄 PDF</button>
        </div>` : ''}
        ` : `<div class="empty-state"><b>No active staff to show</b></div>`}
      </div>
    `;
  }
  async function downloadSalaryRegisterExcel(){
    const monthStr = staffPayrollMonth;
    const rows = staffSalaryRegisterRows(monthStr);
    if(rows.length === 0){ showToast('No active staff to include.'); return; }
    if(!(await ensureXLSX())) return;
    const monthLabel = new Date(monthStr+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'}).toUpperCase();
    const headers = ['S.NO','NAME OF THE TEACHER','NO. OF CL','NET SAL','CUT','EPF','TOTAL'];
    const total = rows.reduce((sum,r) => sum + (Number(r['TOTAL'])||0), 0);
    const aoa = [
      [`SALARY FOR THE MONTH OF ${monthLabel}`],
      [],
      headers,
      ...rows.map(r => headers.map(h => r[h])),
      [],
      ['','','','','','', total],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:6} }];
    ws['!cols'] = [{wch:6},{wch:26},{wch:10},{wch:12},{wch:10},{wch:10},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary Register');
    XLSX.writeFile(wb, 'salary_register_'+monthStr+'.xlsx');
  }
  function downloadSalaryRegisterPDF(){
    const monthStr = staffPayrollMonth;
    const rows = staffSalaryRegisterRows(monthStr);
    if(rows.length === 0){ showToast('No active staff to include.'); return; }
    const monthLabel = new Date(monthStr+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'});
    const total = rows.reduce((sum,r) => sum + (Number(r['TOTAL'])||0), 0);
    rows.push({ 'S.NO':'', 'NAME OF THE TEACHER':'TOTAL', 'NO. OF CL':'', 'NET SAL':'', 'CUT':'', 'EPF':'', 'TOTAL': total });
    exportRowsToPDF('Salary Register — '+monthLabel, '', rows);
  }
  /* ===== Salary Disbursement Report =====
     Deliberately separate from the payroll register above: this is the sheet you'd
     actually hand to a bank or accountant to pay people, so it only ever includes
     staff whose payroll is Approved (never a Draft, which can still change) for the
     selected month, shows just what disbursing needs — net pay and bank details —
     and calls out anyone approved but missing bank details so nobody gets missed. */
  