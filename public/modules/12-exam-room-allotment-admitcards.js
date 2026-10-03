let reportsTab = 'library';
  function initReportsView(){
    const customTab = document.getElementById('reptab-custom');
    if(customTab) customTab.style.display = getReportCategoryAccess(currentUser.role, 'reports_custom') ? 'inline-block' : 'none';
    if(reportsTab === 'custom' && !getReportCategoryAccess(currentUser.role, 'reports_custom')) reportsTab = 'library';
    switchReportsTab(reportsTab);
  }
  function switchReportsTab(tab){
    reportsTab = tab;
    ['library','custom'].forEach(t => document.getElementById('reptab-'+t).classList.toggle('active', t===tab));
    renderReportsBody();
  }
  function renderReportsBody(){
    const body = document.getElementById('reportsBody');
    if(!body) return;
    if(reportsTab === 'library') return renderReportLibrary(body);
    if(reportsTab === 'custom') return renderCustomReportBuilder(body);
  }

  const REPORT_CATEGORY_STYLE = {
    Academic:   { color:'#CB9A2E', bg:'rgba(203,154,46,0.12)' },
    Attendance: { color:'#188F86', bg:'rgba(24,143,134,0.12)' },
    Marks:      { color:'#D11073', bg:'rgba(209,16,115,0.10)' },
    Accounts:   { color:'#211A4E', bg:'rgba(33,26,78,0.08)' },
    Employee:   { color:'#6b4fa0', bg:'rgba(107,79,160,0.10)' },
    TeacherPerformance: { color:'#B8621B', bg:'rgba(184,98,27,0.10)' },
    Inventory:  { color:'#B5533C', bg:'rgba(181,83,60,0.10)' },
    Transport:  { color:'#2E6F9E', bg:'rgba(46,111,158,0.10)' },
    Library:    { color:'#7A5C3E', bg:'rgba(122,92,62,0.10)' },
    Hostel:     { color:'#8E5572', bg:'rgba(142,85,114,0.10)' },
    Admissions: { color:'#2F9C6E', bg:'rgba(47,156,110,0.10)' },
  };
  function applyStudentScope(list, filters){
    let out = list;
    if(filters.studentId) return out.filter(s => s.id === filters.studentId);
    if(filters.className) out = out.filter(s => s.className === filters.className);
    if(filters.section) out = out.filter(s => s.section === filters.section);
    return out;
  }
  function applyStaffScope(list, filters){
    return filters.department ? list.filter(s => s.department === filters.department) : list;
  }
  function applyPaymentScope(list, filters){
    if(!filters.studentId && !filters.className && !filters.section) return list;
    return list.filter(p => {
      const s = students.find(x => x.id === p.studentId);
      if(!s) return false;
      if(filters.studentId) return s.id === filters.studentId;
      if(filters.className && s.className !== filters.className) return false;
      if(filters.section && s.section !== filters.section) return false;
      return true;
    });
  }
  const REPORT_LIBRARY = [
    // Academic
    { id:'student_directory', category:'Academic', name:'Student Directory', icon:'🎓', scopable:'student', desc:'Every active student with class, section, and contact details.',
      getRows(f){ return applyStudentScope(students.filter(isActive), f).map(s => ({ 'Admission No':s.admissionNo, 'Name':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Gender':s.gender||'', 'Father Name':s.fatherName||'', 'Phone':s.fatherPhone||s.motherPhone||'', 'Status':s.status||'Active' })); } },
    { id:'new_admissions', category:'Academic', name:'New Admissions', icon:'🆕', scopable:'student', desc:'Students marked as New Admission this year.',
      getRows(f){ return applyStudentScope(students.filter(s => s.isNewAdmission), f).map(s => ({ 'Admission No':s.admissionNo, 'Name':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Date of Joining':s.admDate||'', 'Status':s.status||'Active' })); } },
    { id:'student_roll', category:'Academic', name:'Student ID & Roll No Report', icon:'🪪', scopable:'student', desc:'Admission number and class/section for every student.',
      getRows(f){ return applyStudentScope(students.filter(isActive), f).sort((a,b)=>(a.className+a.section+a.firstName).localeCompare(b.className+b.section+b.firstName)).map(s => ({ 'Admission No':s.admissionNo, 'Name':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section })); } },
    { id:'father_phone', category:'Academic', name:'Father Name & Phone Numbers', icon:'📞', scopable:'student', desc:"Every student's father's name and contact number.",
      getRows(f){ return applyStudentScope(students.filter(isActive), f).map(s => ({ 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Father Name':s.fatherName||'', 'Father Phone':s.fatherPhone||'', 'Mother Phone':s.motherPhone||'' })); } },
    { id:'address_report', category:'Academic', name:'Address Report', icon:'📍', scopable:'student', desc:'Full postal address for every active student.',
      getRows(f){ return applyStudentScope(students.filter(isActive), f).map(s => ({ 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Address':s.fatherAddress||s.motherAddress||s.guardianAddress||'' })); } },
    { id:'contact_details_report', category:'Academic', name:'Student Contact & Parent Details', icon:'📇', scopable:'student', desc:'Student name, class, roll number, father name, phone, and address — all in one combined report.',
      getRows(f){ return applyStudentScope(students.filter(isActive), f).map(s => ({ 'Student Name':s.firstName+' '+s.lastName, 'Admission No':s.admissionNo, 'Class':s.className, 'Section':s.section, 'Roll No':s.rollNo||'', 'Father Name':s.fatherName||'', 'Mother Name':s.motherName||'', 'Phone Number':s.fatherPhone||s.motherPhone||s.guardianPhone||'', 'Address':s.fatherAddress||s.motherAddress||s.guardianAddress||'' })); } },
    { id:'strength_report', category:'Academic', name:'Strength Report', icon:'📊', scopable:false, desc:'Active student count for every class & section.',
      getRows(){ const rows=[]; CLASS_LEVELS.forEach(c=>SECTIONS.forEach(s=>{ const n=students.filter(x=>x.className===c&&x.section===s&&isActive(x)).length; if(n>0) rows.push({ 'Class':c, 'Section':s, 'Students':n }); })); return rows; } },
    { id:'caste_report', category:'Academic', name:'Caste Report', icon:'🗂️', scopable:'student', desc:'Student count by caste category.',
      getRows(f){ const counts={}; applyStudentScope(students.filter(isActive), f).forEach(s=>{ const c=s.caste||'Not specified'; counts[c]=(counts[c]||0)+1; }); return Object.keys(counts).map(c=>({ 'Caste Category':c, 'Students':counts[c] })); } },

    // Attendance
    { id:'attendance_summary', category:'Attendance', name:'Attendance Summary', icon:'📋', scopable:'student', desc:'Attendance percentage for every active student.',
      getRows(f){ return applyStudentScope(students.filter(isActive), f).map(s => { const st = computeAttendanceStats(s.id); return { 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Present':st.present, 'Absent':st.absent, 'Late':st.late, 'Leave':st.leave, '%':st.pct }; }); } },
    { id:'daily_absentees', category:'Attendance', name:'Daily Absentees Report (Today)', icon:'📅', scopable:'student', desc:"Every student marked absent today.",
      getRows(f){ const today=new Date().toISOString().slice(0,10); const absentIds = attendanceRecords.filter(r=>r.date===today && r.status==='Absent').map(r=>r.studentId); return applyStudentScope(students.filter(s=>absentIds.includes(s.id)), f).map(s => ({ 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Parent Phone':s.fatherPhone||s.motherPhone||'' })); } },
    { id:'low_attendance_report', category:'Attendance', name:'Attendance Between Given Percentages', icon:'📉', scopable:'student', desc:'Students below the configured attendance threshold.',
      getRows(f){ return applyStudentScope(computeLowAttendance().map(d=>d.student), f).map(s => { const st=computeAttendanceStats(s.id); return { 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Present':st.present, 'Absent':st.absent, '%':st.pct }; }); } },

    // Marks
    { id:'consolidated_all', category:'Marks', name:'Consolidated Report (All Students)', icon:'🏆', scopable:'student', desc:'Overall percentage & grade across all exams for every active student.',
      getRows(f){ return applyStudentScope(students.filter(isActive), f).map(s => { const d = buildConsolidatedData(s.id); if(!d) return null; return { 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Grand Total':d.grandObtained+'/'+d.grandMax, '%':d.overallPct, 'Grade':d.overallGrade }; }).filter(Boolean); } },

    // Accounts
    { id:'nil_paid', category:'Accounts', name:'Nil Paid Students', icon:'🚫', scopable:'student', desc:'Active students who have paid nothing towards fees yet.',
      getRows(f){ return applyStudentScope(students.filter(isActive).filter(s => computeStudentFinance(s).totals.collected === 0), f).map(s => ({ 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Total Expected':computeStudentFinance(s).totals.expected })); } },
    { id:'revenue_by_date', category:'Accounts', name:'Date-wise Total Amount', icon:'📆', scopable:false, desc:'Total fee collected per day, most recent first.',
      getRows(){ const byDate={}; payments.forEach(p=>{ const d=p.date||'—'; byDate[d]=(byDate[d]||0)+(Number(p.amount)||0); }); return Object.keys(byDate).sort().reverse().map(d=>({ 'Date':d, 'Total Amount':byDate[d] })); } },
    { id:'feetype_totals', category:'Accounts', name:'Fee Type-wise Total Amount', icon:'🏷️', scopable:false, desc:'Total collected, split by Fee / Bus / Stock / Hostel.',
      getRows(){ const { perCat } = computeFinance(); return Object.keys(CATS).map(c => ({ 'Fee Type':CATS[c], 'Expected':perCat[c].expected, 'Collected':perCat[c].collected, 'Outstanding':perCat[c].receivable })); } },
    { id:'concession_report', category:'Accounts', name:'Concession Details Report', icon:'🎟️', scopable:'student', desc:'Every approved discount, by student and category.',
      getRows(f){ const rows = studentDiscounts.filter(d=>d.status==='Approved').map(d=>{ const s=students.find(x=>x.id===d.studentId); return s ? { s, row:{ 'Student':s.firstName+' '+s.lastName, 'Class':s.className+' - '+s.section, 'Type':d.type, 'Applies To':CATS[d.appliesTo]||d.appliesTo, 'Amount':d.value } } : null; }).filter(Boolean); return applyStudentScope(rows.map(r=>r.s), f).map(s => rows.find(r=>r.s===s).row); } },
    { id:'fee_collection', category:'Accounts', name:'Fee Collection (Full Ledger)', icon:'💰', scopable:'student', desc:'Every fee payment recorded, across all categories.',
      getRows(f){ return applyPaymentScope(payments, f).map(p => ({ 'Date':p.date||'', 'Student':p.studentName||'', 'Category':feeLabelFor(p), 'Mode':p.mode||'', 'Amount':p.amount, 'Discount':p.discount||0, 'Receipt No':p.receiptNo||'' })); } },
    { id:'fee_outstanding', category:'Accounts', name:'Fee Outstanding / Defaulters', icon:'⚠️', scopable:'student', desc:'Students with pending fee balances — class-wise, section-wise, or student-wise via the Scope panel above.',
      getRows(f){ return applyStudentScope(computeDefaulters().map(d=>d.student), f).map(s => { const d=computeDefaulters().find(x=>x.student.id===s.id); return { 'Student':s.firstName+' '+s.lastName, 'Class':s.className+' - '+s.section, 'Parent Phone':d.parentPhone||'', 'Amount Due':d.total }; }); } },
    { id:'fee_defaulters_by_type', category:'Accounts', name:'Fee Defaulters — By Fee Type', icon:'🏷️', scopable:'student', desc:'Outstanding balance broken down by Fee / Bus / Stock / Hostel for every defaulter — use the Fee Type filter above to isolate just one type.',
      getRows(f){
        const scoped = applyStudentScope(students.filter(isActive), f);
        const rows = [];
        scoped.forEach(s => {
          const fin = computeStudentFinance(s);
          const catsToShow = f.feeType ? [f.feeType] : Object.keys(CATS);
          const owesAny = catsToShow.some(c => fin.perCat[c] && fin.perCat[c].receivable > 0);
          if(!owesAny) return;
          const row = { 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section };
          Object.keys(CATS).forEach(c => {
            if(!f.feeType || f.feeType===c) row[CATS[c]+' Due'] = fin.perCat[c] ? fin.perCat[c].receivable : 0;
          });
          row['Total Due'] = catsToShow.reduce((sum,c) => sum + (fin.perCat[c] ? fin.perCat[c].receivable : 0), 0);
          rows.push(row);
        });
        return rows;
      } },
    { id:'fee_due_payable_classwise', category:'Accounts', name:'Fee Paid, Payable & Due Report (Student-wise)', icon:'📄', scopable:'student', special:true,
      desc:'Every student grouped by class, with Total Fee, Concession, Fee Payable, Fee Paid, and Fee Due — plus a subtotal per class and a grand total, matching your standard fee register format.' },

    // Accounting — double-entry statements (Chart of Accounts, Journal
    // Vouchers, Bank Accounts, Fixed Assets and Budgets are all managed
    // under Finance → Accounting; these reports are the read side of that
    // same live, self-balancing ledger).
    { id:'acct_trial_balance', category:'Accounts', name:'Trial Balance', icon:'⚖️', scopable:false, desc:'Every ledger account with its live Debit or Credit balance — total Debit equals total Credit, proving the books balance.',
      getRows(){
        const ledger = acctBuildLedger();
        const rows = getChartOfAccounts().map(acct => {
          const bal = acctBalanceFromRows(ledger[acct.key]||[], acct.type);
          if(!bal.debit && !bal.credit) return null;
          const isDebitSide = bal.normalDebit ? bal.balance >= 0 : bal.balance < 0;
          const amt = Math.round(Math.abs(bal.balance)*100)/100;
          return { 'Account':acct.name, 'Group':acct.group, 'Debit':isDebitSide?amt:0, 'Credit':isDebitSide?0:amt };
        }).filter(Boolean);
        const totalDebit = Math.round(rows.reduce((s,r)=>s+r['Debit'],0)*100)/100;
        const totalCredit = Math.round(rows.reduce((s,r)=>s+r['Credit'],0)*100)/100;
        rows.push({ 'Account':'TOTAL', 'Group':'', 'Debit':totalDebit, 'Credit':totalCredit });
        return rows;
      } },
    { id:'acct_day_book', category:'Accounts', name:'Day Book (All Transactions)', icon:'📖', scopable:false, desc:'Every posting in the books, chronological — the classic Day Book, across every account.',
      getRows(){
        const rows = acctAllPostings().slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
        return rows.map(r => { const acct = coaAccountByKey(r.key); return { 'Date':r.date, 'Account':acct?acct.name:r.key, 'Narration':r.narration, 'Voucher No.':r.voucherNo||'—', 'Debit':r.debit||0, 'Credit':r.credit||0 }; });
      } },
    { id:'acct_cash_book', category:'Accounts', name:'Cash Book', icon:'💵', scopable:false, desc:'Every transaction through a Cash-in-Hand account, with a running balance.',
      getRows(){
        const ledger = acctBuildLedger();
        const cashIds = acctBankAccounts.filter(b => b.type==='Cash').map(b => 'bank:'+b.id);
        let rows = [];
        cashIds.forEach(key => { (ledger[key]||[]).forEach(r => rows.push(r)); });
        rows.sort((a,b) => (a.date||'').localeCompare(b.date||''));
        let running = 0;
        return rows.map(r => { running += r.debit - r.credit; return { 'Date':r.date, 'Narration':r.narration, 'Voucher No.':r.voucherNo||'—', 'Debit':r.debit||0, 'Credit':r.credit||0, 'Running Balance':Math.round(running*100)/100 }; });
      } },
    { id:'acct_bank_book', category:'Accounts', name:'Bank Book', icon:'🏦', scopable:false, desc:'Every transaction through every Bank account (excluding Cash-in-Hand), grouped by account with a running balance.',
      getRows(){
        const ledger = acctBuildLedger();
        const out = [];
        acctBankAccounts.filter(b => b.type==='Bank').forEach(b => {
          const rows = (ledger['bank:'+b.id]||[]).slice().sort((a,c) => (a.date||'').localeCompare(c.date||''));
          let running = 0;
          rows.forEach(r => { running += r.debit - r.credit; out.push({ 'Bank Account':b.name, 'Date':r.date, 'Narration':r.narration, 'Voucher No.':r.voucherNo||'—', 'Debit':r.debit||0, 'Credit':r.credit||0, 'Running Balance':Math.round(running*100)/100 }); });
        });
        return out;
      } },
    { id:'acct_income_expenditure', category:'Accounts', name:'Income & Expenditure Statement', icon:'📊', scopable:false, desc:'Every Income and Expense account with its live total, and the resulting Surplus or Deficit — the school\'s profit & loss statement.',
      getRows(){
        const ledger = acctBuildLedger();
        const coa = getChartOfAccounts();
        const rows = [];
        let totalIncome = 0, totalExpense = 0;
        coa.filter(a => a.type==='Income').forEach(a => { const bal = acctBalanceFromRows(ledger[a.key]||[], 'Income').balance; if(bal){ totalIncome += bal; rows.push({ 'Head':'Income', 'Account':a.name, 'Amount':Math.round(bal*100)/100 }); } });
        coa.filter(a => a.type==='Expense').forEach(a => { const bal = acctBalanceFromRows(ledger[a.key]||[], 'Expense').balance; if(bal){ totalExpense += bal; rows.push({ 'Head':'Expense', 'Account':a.name, 'Amount':Math.round(bal*100)/100 }); } });
        rows.push({ 'Head':'Total Income', 'Account':'', 'Amount':Math.round(totalIncome*100)/100 });
        rows.push({ 'Head':'Total Expense', 'Account':'', 'Amount':Math.round(totalExpense*100)/100 });
        rows.push({ 'Head': (totalIncome-totalExpense)>=0 ? 'Surplus' : 'Deficit', 'Account':'', 'Amount':Math.round(Math.abs(totalIncome-totalExpense)*100)/100 });
        return rows;
      } },
    { id:'acct_balance_sheet', category:'Accounts', name:'Balance Sheet', icon:'🧾', scopable:false, desc:'Assets, Liabilities and Equity as of today, including accumulated Surplus/Deficit — a real, self-balancing Balance Sheet built from every posting in the books.',
      getRows(){
        const ledger = acctBuildLedger();
        const coa = getChartOfAccounts();
        const rows = [];
        let totalAssets=0, totalLiabilities=0, totalEquity=0, totalIncome=0, totalExpense=0;
        coa.filter(a=>a.group==='Assets').forEach(a => { const bal = acctBalanceFromRows(ledger[a.key]||[], 'Asset').balance; if(bal){ totalAssets+=bal; rows.push({ 'Head':'Assets', 'Account':a.name, 'Amount':Math.round(bal*100)/100 }); } });
        coa.filter(a=>a.group==='Liabilities').forEach(a => { const bal = acctBalanceFromRows(ledger[a.key]||[], 'Liability').balance; if(bal){ totalLiabilities+=bal; rows.push({ 'Head':'Liabilities', 'Account':a.name, 'Amount':Math.round(bal*100)/100 }); } });
        coa.filter(a=>a.group==='Equity').forEach(a => { const bal = acctBalanceFromRows(ledger[a.key]||[], 'Equity').balance; if(bal){ totalEquity+=bal; rows.push({ 'Head':'Equity', 'Account':a.name, 'Amount':Math.round(bal*100)/100 }); } });
        coa.filter(a=>a.type==='Income').forEach(a => { totalIncome += acctBalanceFromRows(ledger[a.key]||[], 'Income').balance; });
        coa.filter(a=>a.type==='Expense').forEach(a => { totalExpense += acctBalanceFromRows(ledger[a.key]||[], 'Expense').balance; });
        const surplus = totalIncome - totalExpense;
        rows.push({ 'Head':'Equity', 'Account':'Accumulated Surplus / (Deficit)', 'Amount':Math.round(surplus*100)/100 });
        totalEquity += surplus;
        rows.push({ 'Head':'Total Assets', 'Account':'', 'Amount':Math.round(totalAssets*100)/100 });
        rows.push({ 'Head':'Total Liabilities + Equity', 'Account':'', 'Amount':Math.round((totalLiabilities+totalEquity)*100)/100 });
        return rows;
      } },
    { id:'acct_fixed_assets_register', category:'Accounts', name:'Fixed Assets Register', icon:'🏢', scopable:false, desc:'Every fixed asset with cost, accumulated depreciation, and current book value.',
      getRows(){ return acctFixedAssets.map(a => ({ 'Asset':a.name, 'Category':a.category||'', 'Purchase Date':a.purchaseDate||'', 'Cost':a.purchaseCost, 'Useful Life (Yrs)':a.usefulLifeYears, 'Salvage Value':a.salvageValue||0, 'Accumulated Depreciation':acctAccumulatedDepreciation(a, acctToday()), 'Book Value':acctAssetBookValue(a, acctToday()), 'Status':a.active===false?'Disposed':'Active' })); } },
    { id:'acct_depreciation_schedule', category:'Accounts', name:'Depreciation Schedule', icon:'📉', scopable:false, desc:'Annual straight-line depreciation charge for every active fixed asset, and the accumulated total to date.',
      getRows(){ return acctFixedAssets.filter(a=>a.active!==false).map(a => ({ 'Asset':a.name, 'Cost':a.purchaseCost, 'Salvage Value':a.salvageValue||0, 'Useful Life (Yrs)':a.usefulLifeYears, 'Annual Depreciation':Math.round(acctAssetDepreciationPerYear(a)*100)/100, 'Accumulated To Date':acctAccumulatedDepreciation(a, acctToday()), 'Book Value':acctAssetBookValue(a, acctToday()) })); } },
    { id:'acct_budget_variance', category:'Accounts', name:'Budget vs Actual', icon:'📅', scopable:false, desc:'Every budget line with its actual figure for the period and the variance against what was budgeted.',
      getRows(){ return acctBudgets.map(b => { const acct = coaAccountByKey(b.accountKey); const actual = acctActualForAccountInRange(b.accountKey, b.startDate, b.endDate); return { 'Label':b.label, 'Period':b.startDate+' to '+b.endDate, 'Account':acct?acct.name:b.accountKey, 'Budgeted':b.budgetedAmount, 'Actual':Math.round(actual*100)/100, 'Variance':Math.round((actual-b.budgetedAmount)*100)/100 }; }); } },
    { id:'acct_bank_reconciliation', category:'Accounts', name:'Bank Reconciliation Summary', icon:'🏦', scopable:false, desc:'Every Bank/Cash account with its ledger balance, reconciled balance, and difference against the last saved bank statement balance.',
      getRows(){
        const ledger = acctBuildLedger();
        return acctBankAccounts.map(b => {
          const rows = ledger['bank:'+b.id]||[];
          const ledgerBal = rows.reduce((s,r)=>s+r.debit-r.credit,0);
          const reconciledBal = rows.filter(r => acctReconciled[acctRowId(r)]).reduce((s,r)=>s+r.debit-r.credit,0);
          const stmt = b.lastStatementBalance!=null ? Number(b.lastStatementBalance) : null;
          return { 'Account':b.name, 'Ledger Balance':Math.round(ledgerBal*100)/100, 'Reconciled Balance':Math.round(reconciledBal*100)/100, 'Unreconciled Amount':Math.round((ledgerBal-reconciledBal)*100)/100, 'Statement Balance':stmt!=null?stmt:'—', 'Difference vs Statement':stmt!=null?Math.round((stmt-reconciledBal)*100)/100:'—' };
        });
      } },

    // Employee
    { id:'staff_directory', category:'Employee', name:'Staff Directory', icon:'🧑‍💼', scopable:'staff', desc:'Every active staff member with role, department, and contact.',
      getRows(f){ return applyStaffScope(staffList.filter(staffIsActive), f).map(st => ({ 'Staff ID':st.staffId, 'Name':st.firstName+' '+st.lastName, 'Designation':st.designation||'', 'Department':st.department||'', 'Caste Category':st.caste||'', 'Phone':st.phone||'', 'Email':st.email||'' })); } },
    { id:'staff_address', category:'Employee', name:'Staff Address & Contact Report', icon:'📇', scopable:'staff', desc:'Address and phone number for every active staff member.',
      getRows(f){ return applyStaffScope(staffList.filter(staffIsActive), f).map(st => ({ 'Name':st.firstName+' '+st.lastName, 'Designation':st.designation||'', 'Phone':st.phone||'', 'Address':st.address||'' })); } },
    { id:'staff_salary', category:'Employee', name:'Staff Salary Summary', icon:'💵', scopable:'staff', desc:'Monthly salary on file for every active staff member.',
      getRows(f){ return applyStaffScope(staffList.filter(staffIsActive).filter(st=>st.salary), f).map(st => ({ 'Name':st.firstName+' '+st.lastName, 'Designation':st.designation||'', 'Department':st.department||'', 'Monthly Salary':st.salary })); } },

    // Inventory / Stock
    { id:'inv_current_stock', category:'Inventory', name:'Current Stock Report', icon:'📦', scopable:false, desc:'Every product with category, unit, size, stock on hand, and stock value.',
      getRows(){ return inventoryItems.map(it => ({ 'Product':it.name, 'Type':it.type||'Sellable', 'Category':it.category||'', 'Sub-Category':it.subCategory||'', 'Size':it.size||'', 'Unit':it.unit||'Piece', 'Current Stock':it.quantity, 'Min Stock':it.threshold, 'Cost Price':it.costPrice, 'Selling Price':it.sellingPrice, 'Stock Value (Cost)':Math.round(it.quantity*it.costPrice*100)/100, 'Status':it.active===false?'Disabled':'Active' })); } },
    { id:'inv_low_stock', category:'Inventory', name:'Low Stock / Out of Stock Report', icon:'⚠️', scopable:false, desc:'Products at or below their minimum stock threshold, out-of-stock items flagged separately.',
      getRows(){ return inventoryItems.filter(it => it.quantity <= it.threshold).sort((a,b) => a.quantity-b.quantity).map(it => ({ 'Product':it.name, 'Category':it.category||'', 'Current Stock':it.quantity, 'Min Stock':it.threshold, 'Status':it.quantity<=0?'Out of Stock':'Low Stock' })); } },
    { id:'inv_valuation', category:'Inventory', name:'Stock Valuation Report (Category-wise)', icon:'💹', scopable:false, desc:'Total stock quantity, cost value, and potential sale value, grouped by category.',
      getRows(){
        const byCat = {};
        inventoryItems.forEach(it => {
          const c = it.category || 'General';
          if(!byCat[c]) byCat[c] = { qty:0, costValue:0, saleValue:0 };
          byCat[c].qty += it.quantity;
          byCat[c].costValue += it.quantity*it.costPrice;
          byCat[c].saleValue += it.quantity*it.sellingPrice;
        });
        return Object.keys(byCat).map(c => ({ 'Category':c, 'Total Qty':byCat[c].qty, 'Stock Value (Cost)':Math.round(byCat[c].costValue*100)/100, 'Potential Sale Value':Math.round(byCat[c].saleValue*100)/100, 'Potential Profit':Math.round((byCat[c].saleValue-byCat[c].costValue)*100)/100 }));
      } },
    { id:'inv_item_sales', category:'Inventory', name:'Item-wise Sales Report', icon:'📈', scopable:false, desc:'Total quantity sold, revenue, and profit for every product ever sold.',
      getRows(){
        const byItem = {};
        inventorySales.forEach(s => {
          if(!byItem[s.itemId]) byItem[s.itemId] = { name:s.itemName, qty:0, revenue:0, cost:0 };
          byItem[s.itemId].qty += s.qty;
          byItem[s.itemId].revenue += s.totalAmount||0;
          byItem[s.itemId].cost += s.totalCost||0;
        });
        return Object.values(byItem).sort((a,b) => b.revenue-a.revenue).map(r => ({ 'Product':r.name, 'Qty Sold':r.qty, 'Revenue':Math.round(r.revenue*100)/100, 'Cost':Math.round(r.cost*100)/100, 'Profit':Math.round((r.revenue-r.cost)*100)/100 }));
      } },
    { id:'inv_sales_ledger', category:'Inventory', name:'Sales Ledger (Full)', icon:'🧾', scopable:'student', desc:'Every inventory sale transaction recorded — filter to one student via the Scope panel above.',
      getRows(f){ let rows = inventorySales; if(f.studentId) rows = rows.filter(s => s.studentId===f.studentId); return rows.map(s => ({ 'Date':s.date, 'Product':s.itemName, 'Buyer':s.buyerName||'', 'Buyer Type':s.buyerType||'', 'Qty':s.qty, 'Unit Price':s.unitPrice, 'Discount':s.discount||0, 'Total':s.totalAmount, 'Paid':s.paidAmount, 'Mode':s.mode||'', 'Sold By':s.soldBy||'' })); } },
    { id:'inv_returns_student', category:'Inventory', name:'Student / Sale Returns Report', icon:'↩️', scopable:false, desc:'Every item returned by a buyer after sale, with refund amount and reason.',
      getRows(){ return inventoryReturns.map(r => ({ 'Date':r.date, 'Product':r.itemName, 'Buyer':r.buyerName||'', 'Qty':r.qty, 'Refund Amount':r.refundAmount, 'Refund Mode':r.refundMode||'', 'Reason':r.reason||'', 'Processed By':r.processedBy||'' })); } },
    { id:'inv_returns_vendor', category:'Inventory', name:'Vendor Returns Report', icon:'📤', scopable:false, desc:'Every item sent back to a vendor/supplier, with cost reversed and reason.',
      getRows(){ return inventoryVendorReturns.map(r => ({ 'Date':r.date, 'Product':r.itemName, 'Qty':r.qty, 'Cost Reversed':r.costReversed, 'Vendor':r.vendor||'', 'Reason':r.reason||'', 'Processed By':r.processedBy||'' })); } },
    { id:'inv_tax_summary', category:'Inventory', name:'GST / Tax Summary Report', icon:'🏷️', scopable:false, desc:'Products grouped by HSN code and GST rate — handy when preparing GST filings.',
      getRows(){
        const byKey = {};
        inventoryItems.forEach(it => {
          const key = (it.hsnCode||'—') + '|' + (it.taxRate||0);
          if(!byKey[key]) byKey[key] = { hsn:it.hsnCode||'—', rate:it.taxRate||0, count:0, stockValue:0 };
          byKey[key].count++;
          byKey[key].stockValue += it.quantity*it.sellingPrice;
        });
        return Object.values(byKey).map(k => ({ 'HSN Code':k.hsn, 'Tax Rate (GST %)':k.rate, 'Product Count':k.count, 'Stock Sale Value':Math.round(k.stockValue*100)/100 }));
      } },
    { id:'inv_non_sellable', category:'Inventory', name:'Non-Sellable / Asset Register', icon:'🗂️', scopable:false, desc:'Internal-use items (Non-Sellable) held in stock, with their recorded value.',
      getRows(){ return inventoryItems.filter(it => it.type==='Non-Sellable').map(it => ({ 'Item':it.name, 'Category':it.category||'', 'Applicable Class':it.applicableClass||'', 'Quantity':it.quantity, 'Cost Price':it.costPrice, 'Total Value':Math.round(it.quantity*it.costPrice*100)/100 })); } },

    // Transport / Vehicle
    { id:'tr_fleet_summary', category:'Transport', name:'Fleet / Vehicle Summary', icon:'🚌', scopable:false, desc:'Every bus route with its vehicle, driver, stop count, fare range, and students assigned.',
      getRows(){ return transportRoutes.map(r => { const fares = r.stops.map(s => Number(s.fare)||0); const fareRange = fares.length ? (Math.min(...fares)===Math.max(...fares) ? fmtMoney(Math.min(...fares)) : `${fmtMoney(Math.min(...fares))} – ${fmtMoney(Math.max(...fares))}`) : '—'; return { 'Route':r.name, 'Bus Number':r.busNumber||'', 'Driver Name':r.driverName||'', 'Driver Phone':r.driverPhone||'', 'Stops':r.stops.length, 'Fare Range':fareRange, 'Students Assigned':studentsOnRoute(r.id).length }; }); } },
    { id:'tr_driver_directory', category:'Transport', name:'Driver Contact Directory', icon:'📇', scopable:false, desc:'Every route\'s driver name and phone number, for quick lookup.',
      getRows(){ return transportRoutes.map(r => ({ 'Route':r.name, 'Bus Number':r.busNumber||'', 'Driver Name':r.driverName||'—', 'Driver Phone':r.driverPhone||'—' })); } },
    { id:'tr_route_roster', category:'Transport', name:'Route-wise Student Roster (All Routes)', icon:'📋', scopable:'student', desc:'Every student using transport, with their route, stop, and bus — filter by class/section above.',
      getRows(f){
        const riders = applyStudentScope(students.filter(s => isActive(s) && s.needsTransport==='Yes' && s.transportRouteId), f);
        return riders.map(s => {
          const route = transportRoutes.find(r => r.id===s.transportRouteId);
          const stop = route ? route.stops.find(st => st.id===s.transportStopId) : null;
          return { 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Route':route?route.name:'—', 'Bus Number':route?(route.busNumber||''):'', 'Stop':stop?stop.name:'—', 'Fare (₹/year)':stop?stop.fare:0 };
        });
      } },
    { id:'tr_fee_collection', category:'Transport', name:'Transport Fee Collection Report', icon:'💰', scopable:'student', desc:'Expected, collected, and outstanding bus fee for every student on transport.',
      getRows(f){
        const riders = applyStudentScope(students.filter(s => isActive(s) && s.needsTransport==='Yes'), f);
        return riders.map(s => { const fin = computeStudentFinance(s); const route = transportRoutes.find(r => r.id===s.transportRouteId); return { 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Route':route?route.name:'Unassigned', 'Expected':fin.perCat.bus.expected, 'Collected':fin.perCat.bus.collected, 'Due':fin.perCat.bus.receivable }; });
      } },
    { id:'tr_route_fee_summary', category:'Transport', name:'Route-wise Fee Summary', icon:'📊', scopable:false, desc:'Student count, expected, collected, and due bus fee, totalled per route.',
      getRows(){
        const byRoute = {};
        students.filter(s => isActive(s) && s.needsTransport==='Yes').forEach(s => {
          const key = s.transportRouteId || '__unassigned__';
          if(!byRoute[key]) byRoute[key] = { count:0, expected:0, collected:0, due:0 };
          const fin = computeStudentFinance(s);
          byRoute[key].count++;
          byRoute[key].expected += fin.perCat.bus.expected;
          byRoute[key].collected += fin.perCat.bus.collected;
          byRoute[key].due += fin.perCat.bus.receivable;
        });
        return Object.keys(byRoute).map(key => { const route = transportRoutes.find(r => r.id===key); const b = byRoute[key]; return { 'Route':route?route.name:'Unassigned', 'Students':b.count, 'Expected':Math.round(b.expected*100)/100, 'Collected':Math.round(b.collected*100)/100, 'Due':Math.round(b.due*100)/100 }; });
      } },
    { id:'tr_unassigned', category:'Transport', name:'Transport Requested but Unassigned', icon:'❓', scopable:'student', desc:'Students who need transport but have no route or stop assigned yet — a gap to fix before billing.',
      getRows(f){ return applyStudentScope(students.filter(s => isActive(s) && s.needsTransport==='Yes' && (!s.transportRouteId || !s.transportStopId)), f).map(s => ({ 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Parent Phone':s.fatherPhone||s.motherPhone||'', 'Missing':!s.transportRouteId?'Route':'Stop' })); } },

    // Library
    { id:'lib_catalog', category:'Library', name:'Book Catalog Report', icon:'📚', scopable:false, desc:'Every book in the library with author, category, shelf location, and copies available.',
      getRows(){ return libraryBooks.map(b => ({ 'Title':b.title, 'Author':b.author||'', 'Category':b.category||'', 'ISBN':b.isbn||'', 'Publisher':b.publisher||'', 'Shelf Location':b.shelfLocation||'', 'Total Copies':b.totalCopies, 'Available Copies':b.availableCopies })); } },
    { id:'lib_circulation', category:'Library', name:'Circulation Summary', icon:'🔄', scopable:false, desc:'Every book issued to date, with borrower, issue/due/return dates, and status.',
      getRows(){ return libraryIssues.slice().sort((a,b) => (b.issueDate||'').localeCompare(a.issueDate||'')).map(i => ({ 'Book':i.bookTitle, 'Borrower':i.borrowerName||'', 'Borrower Type':i.borrowerType||'', 'Issue Date':i.issueDate||'', 'Due Date':i.dueDate||'', 'Return Date':i.returnDate||'—', 'Status':i.status||'', 'Fine':i.fineAmount||0 })); } },
    { id:'lib_overdue', category:'Library', name:'Overdue Books Report', icon:'⏰', scopable:false, desc:'Books still with a borrower past their due date, with days overdue.',
      getRows(){ const today = new Date().toISOString().slice(0,10); return libraryIssues.filter(i => i.status==='Issued' && i.dueDate && i.dueDate < today).map(i => { const daysLate = Math.max(0, Math.round((new Date(today) - new Date(i.dueDate)) / 86400000)); return { 'Book':i.bookTitle, 'Borrower':i.borrowerName||'', 'Borrower Type':i.borrowerType||'', 'Issue Date':i.issueDate||'', 'Due Date':i.dueDate||'', 'Days Overdue':daysLate, 'Est. Fine':daysLate*(librarySettings.finePerDay||0) }; }); } },
    { id:'lib_fine_collection', category:'Library', name:'Fine Collection Report', icon:'💸', scopable:false, desc:'Every returned book that incurred a late fine.',
      getRows(){ return libraryIssues.filter(i => (i.fineAmount||0) > 0).map(i => ({ 'Book':i.bookTitle, 'Borrower':i.borrowerName||'', 'Borrower Type':i.borrowerType||'', 'Issue Date':i.issueDate||'', 'Return Date':i.returnDate||'', 'Fine Amount':i.fineAmount })); } },
    { id:'lib_top_borrowed', category:'Library', name:'Most Borrowed Books', icon:'⭐', scopable:false, desc:'Books ranked by how many times they have been issued.',
      getRows(){ const byBook = {}; libraryIssues.forEach(i => { if(!byBook[i.bookId]) byBook[i.bookId] = { title:i.bookTitle, count:0 }; byBook[i.bookId].count++; }); return Object.values(byBook).sort((a,b) => b.count-a.count).map(r => ({ 'Book':r.title, 'Times Issued':r.count })); } },
    { id:'lib_low_stock', category:'Library', name:'Books Needing Reorder', icon:'📉', scopable:false, desc:'Titles with zero or very low copies available against total copies held.',
      getRows(){ return libraryBooks.filter(b => (b.availableCopies||0) <= 0 || (b.totalCopies>0 && (b.availableCopies/b.totalCopies) <= 0.2)).map(b => ({ 'Title':b.title, 'Author':b.author||'', 'Total Copies':b.totalCopies, 'Available Copies':b.availableCopies, 'Status':b.availableCopies<=0?'Out of Copies':'Low Availability' })); } },

    // Hostel
    { id:'hostel_occupancy', category:'Hostel', name:'Room Occupancy Report', icon:'🏠', scopable:false, desc:'Every hostel room with capacity, current occupants, and vacancy.',
      getRows(){ return hostelRooms.map(r => { const occ = hostelOccupants(r.id).length; return { 'Block':r.blockName||'', 'Room No':r.roomNumber||'', 'Room Type':r.roomType||'', 'Capacity':r.capacity, 'Occupied':occ, 'Vacant':Math.max(0, r.capacity-occ), 'Warden':r.wardenName||'' }; }); } },
    { id:'hostel_vacancy', category:'Hostel', name:'Vacant Beds Report', icon:'🛏️', scopable:false, desc:'Rooms with at least one bed still free.',
      getRows(){ return hostelRooms.map(r => ({ r, occ: hostelOccupants(r.id).length })).filter(x => x.occ < x.r.capacity).map(x => ({ 'Block':x.r.blockName||'', 'Room No':x.r.roomNumber||'', 'Room Type':x.r.roomType||'', 'Capacity':x.r.capacity, 'Occupied':x.occ, 'Vacant Beds':x.r.capacity-x.occ })); } },
    { id:'hostel_roster', category:'Hostel', name:'Boarder Roster (All Rooms)', icon:'📋', scopable:'student', desc:'Every boarder with their assigned block, room, and room type — filter by class/section above.',
      getRows(f){ const boarders = applyStudentScope(students.filter(s => isActive(s) && s.isBoarder==='Yes'), f); return boarders.map(s => { const room = hostelRooms.find(r => r.id===s.hostelRoomId); return { 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Block':room?room.blockName:'—', 'Room No':room?room.roomNumber:'—', 'Room Type':room?room.roomType:'—' }; }); } },
    { id:'hostel_fee_collection', category:'Hostel', name:'Hostel Fee Collection Report', icon:'💰', scopable:'student', desc:'Expected, collected, and outstanding hostel fee for every boarder.',
      getRows(f){ const boarders = applyStudentScope(students.filter(s => isActive(s) && s.isBoarder==='Yes'), f); return boarders.map(s => { const fin = computeStudentFinance(s); const room = hostelRooms.find(r => r.id===s.hostelRoomId); return { 'Student':s.firstName+' '+s.lastName, 'Class':s.className, 'Section':s.section, 'Room':room?(room.blockName+' - '+room.roomNumber):'Unassigned', 'Expected':fin.perCat.hostel.expected, 'Collected':fin.perCat.hostel.collected, 'Due':fin.perCat.hostel.receivable }; }); } },
    { id:'hostel_warden_directory', category:'Hostel', name:'Block / Warden Directory', icon:'📇', scopable:false, desc:'Warden name and phone number for every hostel block/room.',
      getRows(){ return hostelRooms.map(r => ({ 'Block':r.blockName||'', 'Room No':r.roomNumber||'', 'Warden Name':r.wardenName||'—', 'Warden Phone':r.wardenPhone||'—' })); } },

    // Admissions / Inquiries
    { id:'adm_inquiry_log', category:'Admissions', name:'Admission Inquiry Log', icon:'📝', scopable:false, desc:'Every admission inquiry submitted via the school website, most recent first.',
      getRows(){ return admissionInquiries.slice().sort((a,b) => (b.submittedDate||'').localeCompare(a.submittedDate||'')).map(i => ({ 'Date':i.submittedDate||'', 'Student Name':i.studentName||'', 'Applying For Grade':i.applyingGrade||'', 'Parent Name':i.parentName||'', 'Parent Phone':i.parentPhone||'', 'Parent Email':i.parentEmail||'', 'Status':i.status||'New' })); } },
    { id:'adm_funnel_summary', category:'Admissions', name:'Admission Funnel Summary', icon:'📊', scopable:false, desc:'Inquiries grouped by status, with overall conversion rate.',
      getRows(){ const counts = {}; admissionInquiries.forEach(i => { const st = i.status||'New'; counts[st] = (counts[st]||0)+1; }); const total = admissionInquiries.length; const converted = counts['Converted']||0; const rows = Object.keys(counts).map(st => ({ 'Status':st, 'Count':counts[st] })); rows.push({ 'Status':'Total Inquiries', 'Count':total }); rows.push({ 'Status':'Conversion Rate', 'Count': total ? Math.round((converted/total)*10000)/100 + '%' : '0%' }); return rows; } },
    { id:'adm_grade_wise_demand', category:'Admissions', name:'Grade-wise Demand Report', icon:'🎓', scopable:false, desc:'Inquiry count grouped by the grade/class applied for.',
      getRows(){ const counts = {}; admissionInquiries.forEach(i => { const g = i.applyingGrade||'Not specified'; counts[g] = (counts[g]||0)+1; }); return Object.keys(counts).map(g => ({ 'Applying For Grade':g, 'Inquiries':counts[g] })); } },
  ];
  const REPORT_CATEGORY_TO_PERM = {
    Academic: 'reports_academic', Attendance: 'reports_attendance', Marks: 'reports_marks',
    Accounts: 'reports_accounts', Employee: 'reports_employee',
    Inventory: 'reports_inventory', Transport: 'reports_transport',
    Library: 'reports_library', Hostel: 'reports_hostel', Admissions: 'reports_admissions',
  };
  function reportLibraryCategories(){
    const cats = [];
    REPORT_LIBRARY.forEach(r => { if(!cats.includes(r.category)) cats.push(r.category); });
    // Employee reports now live under Staff → Reports, not here.
    return cats.filter(cat => cat !== 'Employee').filter(cat => {
      const permKey = REPORT_CATEGORY_TO_PERM[cat];
      return !permKey || getReportCategoryAccess(currentUser.role, permKey);
    });
  }
  let reportScopeStudentId = '';
  function renderReportLibrary(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:14px; max-width:680px;">Ready-made reports across your data — generate as Excel or PDF anytime. Reports marked <span class="pill" style="font-size:0.62rem;">Class/Section aware</span> or <span class="pill" style="font-size:0.62rem;">Staff aware</span> respect the scope below; the rest are always school-wide.</p>
      <div class="profile-card" style="margin-bottom:24px;">
        <h4>Scope</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">Narrow every scoped report at once — pick a class/section, or search one specific student.</p>
        <div class="ms-toolbar-left" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
          <select id="reportScopeClass" onchange="onReportScopeChange()"><option value="">All Classes</option>${CLASS_LEVELS.map(c => `<option>${c}</option>`).join('')}</select>
          <select id="reportScopeSection" onchange="onReportScopeChange()"><option value="">All Sections</option>${SECTIONS.map(s => `<option value="${s}">Section ${s}</option>`).join('')}</select>
          <select id="reportScopeDept" onchange="onReportScopeChange()"><option value="">All Departments (Staff)</option>${staffDepartments.map(d => `<option>${d}</option>`).join('')}</select>
          <select id="reportScopeFeeType" onchange="onReportScopeChange()"><option value="">All Fee Types</option>${Object.keys(CATS).map(c => `<option value="${c}">${CATS[c]}</option>`).join('')}</select>
          <div class="search-wrap" style="max-width:240px;">
            <input class="input" id="reportScopeStudentSearch" placeholder="Or search one student..." autocomplete="off" oninput="onReportScopeStudentInput()" onblur="setTimeout(hideReportScopeSuggestions,150)" onfocus="onReportScopeStudentInput()">
            <div class="search-suggestions" id="reportScopeStudentSuggestions"></div>
          </div>
          ${reportScopeStudentId ? `<span class="pill">${(students.find(s=>s.id===reportScopeStudentId)||{}).firstName||''} ${(students.find(s=>s.id===reportScopeStudentId)||{}).lastName||''} <button onclick="clearReportScopeStudent()" style="background:none; border:none; color:var(--magenta); font-weight:700; cursor:pointer;">&times;</button></span>` : ''}
        </div>
        <div id="reportScopeSummary" style="margin-top:12px; font-size:0.82rem; font-weight:600; color:var(--navy);"></div>
      </div>
      ${reportLibraryCategories().map(cat => {
        const style = REPORT_CATEGORY_STYLE[cat] || { color:'#555', bg:'#eee' };
        return `
        <div style="background:${style.bg}; border-left:5px solid ${style.color}; border-radius:10px; padding:10px 16px; margin-bottom:14px;">
          <h3 style="margin:0; color:${style.color}; font-family:'Baloo 2',cursive;">${cat} Reports</h3>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(270px,1fr)); gap:16px; margin-bottom:${cat==='Inventory'?'16px':'28px'};">
          ${REPORT_LIBRARY.filter(r => r.category===cat).map(r => `
            <div class="profile-card" style="border-top:4px solid ${style.color};">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                <div style="width:36px; height:36px; border-radius:50%; background:${style.bg}; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">${r.icon}</div>
                <h4 style="margin:0;">${r.name}</h4>
              </div>
              ${r.scopable ? `<span class="pill" style="font-size:0.6rem; background:${style.bg}; color:${style.color};">${r.scopable==='staff' ? 'Staff aware' : 'Class/Section aware'}</span>` : ''}
              <p style="font-size:0.8rem; color:var(--ink-soft); margin:8px 0 14px;">${r.desc}</p>
              <div style="display:flex; gap:10px;">
                <button class="btn btn-ghost btn-sm" onclick="generateLibraryReport('${r.id}','excel')">📥 Excel</button>
                <button class="btn btn-ghost btn-sm" onclick="generateLibraryReport('${r.id}','pdf')">📄 PDF</button>
              </div>
            </div>
          `).join('')}
        </div>
        ${cat==='Inventory' ? renderInvItemReportPanel(style) : ''}
      `; }).join('')}

      ${getReportCategoryAccess(currentUser.role, 'reports_marks') ? `
      <div style="background:${REPORT_CATEGORY_STYLE.Marks.bg}; border-left:5px solid ${REPORT_CATEGORY_STYLE.Marks.color}; border-radius:10px; padding:10px 16px; margin-bottom:14px;">
        <h3 style="margin:0; color:${REPORT_CATEGORY_STYLE.Marks.color}; font-family:'Baloo 2',cursive;">Marks Reports — By Exam</h3>
      </div>
      <div class="profile-card" style="max-width:480px; margin-bottom:20px; border-top:4px solid ${REPORT_CATEGORY_STYLE.Marks.color};">
        <h4>📝 Exam-specific Reports</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:8px 0 12px;">Pick an exam — the Class/Section/Student scope above still applies.</p>
        <select id="libExamSelect" style="width:100%; margin-bottom:12px;">${examDefs.map(ex => `<option value="${ex.id}">${ex.name}</option>`).join('') || '<option value="">No exams yet</option>'}</select>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.85rem;">Marks Report (all students)</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateExamReport('marks','excel')">Excel</button><button class="btn-edit-text" onclick="generateExamReport('marks','pdf')">PDF</button></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.85rem;">Rank-wise Report</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateExamReport('rank','excel')">Excel</button><button class="btn-edit-text" onclick="generateExamReport('rank','pdf')">PDF</button></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.85rem;">Failure Report</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateExamReport('failure','excel')">Excel</button><button class="btn-edit-text" onclick="generateExamReport('failure','pdf')">PDF</button></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.85rem;">Empty Marks Report (pending entries)</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateExamReport('empty','excel')">Excel</button><button class="btn-edit-text" onclick="generateExamReport('empty','pdf')">PDF</button></div>
          </div>
        </div>
      </div>
      ` : ``}
    `;
    updateReportScopeSummary();
  }
  function onReportScopeChange(){ updateReportScopeSummary(); updateInvReportSummary(); }
  function updateReportScopeSummary(){
    const box = document.getElementById('reportScopeSummary');
    if(!box) return;
    const f = getReportScopeFilters();
    const studentCount = applyStudentScope(students.filter(isActive), f).length;
    const staffCount = applyStaffScope(staffList.filter(staffIsActive), f).length;
    let parts = [];
    if(f.studentId){
      const s = students.find(x => x.id === f.studentId);
      parts.push(`Scoped to <b>${s ? s.firstName+' '+s.lastName : 'selected student'}</b> only`);
    }else{
      let label = 'All students';
      if(f.className) label = f.className + (f.section ? ' — Section '+f.section : ' — all sections');
      parts.push(`${label}: <b>${studentCount}</b> student${studentCount===1?'':'s'} match`);
    }
    if(f.department) parts.push(`Staff in <b>${f.department}</b>: <b>${staffCount}</b> match`);
    box.innerHTML = '✓ ' + parts.join(' &nbsp;·&nbsp; ');
  }
  function getReportScopeFilters(){
    return {
      className: document.getElementById('reportScopeClass') ? document.getElementById('reportScopeClass').value : '',
      section: document.getElementById('reportScopeSection') ? document.getElementById('reportScopeSection').value : '',
      department: document.getElementById('reportScopeDept') ? document.getElementById('reportScopeDept').value : '',
      feeType: document.getElementById('reportScopeFeeType') ? document.getElementById('reportScopeFeeType').value : '',
      studentId: reportScopeStudentId,
    };
  }
  let reportScopeSearchDebounce = null;
  function onReportScopeStudentInput(){
    clearTimeout(reportScopeSearchDebounce);
    reportScopeSearchDebounce = setTimeout(() => renderReportScopeSuggestions(document.getElementById('reportScopeStudentSearch').value.trim()), 150);
  }
  function renderReportScopeSuggestions(q){
    const box = document.getElementById('reportScopeStudentSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => (s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql)).slice(0,8);
    if(matches.length===0){ box.innerHTML = `<div class="sg-empty">No students match "${q}"</div>`; box.classList.add('open'); return; }
    box.innerHTML = matches.map(s => `<div class="sg-item" onmousedown="selectReportScopeStudent('${s.id}')">
      <div class="sg-avatar">${initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('');
    box.classList.add('open');
  }
  function selectReportScopeStudent(id){
    reportScopeStudentId = id;
    hideReportScopeSuggestions();
    renderReportsBody();
  }
  function clearReportScopeStudent(){
    reportScopeStudentId = '';
    renderReportsBody();
  }
  function hideReportScopeSuggestions(){
    const box = document.getElementById('reportScopeStudentSuggestions');
    if(box) box.classList.remove('open');
  }
  function examReportRows(kind){
    const examId = document.getElementById('libExamSelect').value;
    const exam = examDefs.find(e => e.id === examId);
    if(!exam) return [];
    const list = applyStudentScope(students.filter(isActive), getReportScopeFilters());
    const scored = list.map(s => {
      const subjRows = getExamSubjects(exam, s.className, s.section).filter(subj => subj.countable !== false).map(subj => {
        const r = examResults.find(r => r.examId===exam.id && r.studentId===s.id && r.subject===subj.name);
        return { marks: r ? r.marks : null, max: subj.maxMarks, absent: r ? !!r.absent : false };
      });
      const totalMax = subjRows.reduce((sum,r) => sum+r.max, 0);
      const totalObtained = subjRows.reduce((sum,r) => sum+(Number(r.marks)||0), 0);
      const hasAny = subjRows.some(r => r.marks !== null || r.absent);
      const hasEmpty = subjRows.some(r => r.marks === null && !r.absent);
      const pct = totalMax > 0 ? Math.round((totalObtained/totalMax)*1000)/10 : 0;
      return { s, totalObtained, totalMax, pct, hasAny, hasEmpty, grade: gradeForPct(pct) };
    });
    if(kind === 'marks') return scored.filter(r => r.hasAny).map(r => ({ 'Student':r.s.firstName+' '+r.s.lastName, 'Class':r.s.className+' - '+r.s.section, 'Marks':r.totalObtained+'/'+r.totalMax, '%':r.pct, 'Grade':r.grade }));
    if(kind === 'rank') return scored.filter(r => r.hasAny).sort((a,b) => b.pct-a.pct).map((r,i) => ({ 'Rank':i+1, 'Student':r.s.firstName+' '+r.s.lastName, 'Class':r.s.className+' - '+r.s.section, '%':r.pct, 'Grade':r.grade }));
    if(kind === 'failure') return scored.filter(r => r.hasAny && isFailGrade(r.grade)).map(r => ({ 'Student':r.s.firstName+' '+r.s.lastName, 'Class':r.s.className+' - '+r.s.section, 'Marks':r.totalObtained+'/'+r.totalMax, '%':r.pct, 'Grade':r.grade }));
    if(kind === 'empty') return scored.filter(r => r.hasEmpty).map(r => ({ 'Student':r.s.firstName+' '+r.s.lastName, 'Class':r.s.className+' - '+r.s.section }));
    return [];
  }
  function generateExamReport(kind, format){
    const examId = document.getElementById('libExamSelect').value;
    const exam = examDefs.find(e => e.id === examId);
    if(!exam){ showToast('Create an exam first.'); return; }
    const names = { marks:'Marks Report', rank:'Rank-wise Report', failure:'Failure Report', empty:'Empty Marks Report' };
    const rows = examReportRows(kind);
    if(rows.length === 0){ showToast('Nothing to report for this exam yet.'); return; }
    const title = names[kind] + ' — ' + exam.name;
    if(format === 'excel') exportRowsToExcel(kind+'_report.xlsx', names[kind], rows);
    else exportRowsToPDF(title, '', rows);
  }
  /* --- Inventory Reports — By Item: who has purchased a specific product, how many,
     and (the reverse) which scoped students haven't bought it yet. Answers "how many
     students have purchased X" directly via the live summary line, plus three exportable
     report variants with product / buyer-type / date-range conditions, on top of the
     Class/Section/Student scope shared with the rest of the Report Library. --- */
  function renderInvItemReportPanel(style){
    return `
      <div class="profile-card" style="max-width:600px; margin-bottom:28px; border-top:4px solid ${style.color};">
        <h4>📦 Item Purchase Reports — By Product</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:8px 0 12px;">Pick a product to see who has purchased it and how many — the Class/Section/Student scope above still applies to student buyers.</p>
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="f-field full">
            <label>Product</label>
            <select id="invReportItemSelect" onchange="updateInvReportSummary()">
              <option value="">— Select a product —</option>
              ${inventoryItems.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(it => `<option value="${it.id}">${it.name}${it.category?' ('+it.category+')':''}</option>`).join('')}
            </select>
          </div>
          <div class="f-field">
            <label>Buyer Type</label>
            <select id="invReportBuyerType" onchange="updateInvReportSummary()">
              <option value="">All Buyer Types</option>
              <option value="Student">Student</option>
              <option value="Staff">Staff</option>
              <option value="Walk-in">Walk-in</option>
            </select>
          </div>
          <div class="f-field"><label>From Date</label><input type="date" id="invReportFrom" onchange="updateInvReportSummary()"></div>
          <div class="f-field"><label>To Date</label><input type="date" id="invReportTo" onchange="updateInvReportSummary()"></div>
        </div>
        <div id="invReportSummary" style="font-size:0.82rem; font-weight:600; color:var(--navy); margin-bottom:14px;">Pick a product above to see purchase stats.</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span style="font-size:0.85rem;">Buyer List — every purchase transaction</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateInvItemReport('buyers','excel')">Excel</button><button class="btn-edit-text" onclick="generateInvItemReport('buyers','pdf')">PDF</button></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span style="font-size:0.85rem;">Buyer Summary — unique buyers, qty &amp; spend each</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateInvItemReport('summary','excel')">Excel</button><button class="btn-edit-text" onclick="generateInvItemReport('summary','pdf')">PDF</button></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span style="font-size:0.85rem;">Non-Buyers — active students who haven't purchased it yet</span>
            <div style="display:flex; gap:8px;"><button class="btn-edit-text" onclick="generateInvItemReport('nonbuyers','excel')">Excel</button><button class="btn-edit-text" onclick="generateInvItemReport('nonbuyers','pdf')">PDF</button></div>
          </div>
        </div>
      </div>
    `;
  }
  function invReportFilteredSales(){
    const itemSel = document.getElementById('invReportItemSelect');
    const itemId = itemSel ? itemSel.value : '';
    if(!itemId) return [];
    const buyerTypeSel = document.getElementById('invReportBuyerType');
    const buyerType = buyerTypeSel ? buyerTypeSel.value : '';
    const fromEl = document.getElementById('invReportFrom');
    const toEl = document.getElementById('invReportTo');
    const from = fromEl ? fromEl.value : '';
    const to = toEl ? toEl.value : '';
    const scope = getReportScopeFilters();
    const scopeActive = !!(scope.studentId || scope.className || scope.section);
    return inventorySales.filter(s => {
      if(s.itemId !== itemId) return false;
      if(buyerType && s.buyerType !== buyerType) return false;
      if(from && s.date < from) return false;
      if(to && s.date > to) return false;
      if(s.buyerType === 'Student'){
        if(scope.studentId && s.studentId !== scope.studentId) return false;
        if(scope.className || scope.section){
          const st = students.find(x => x.id === s.studentId);
          if(!st) return false;
          if(scope.className && st.className !== scope.className) return false;
          if(scope.section && st.section !== scope.section) return false;
        }
      } else if(scopeActive){
        // A student-only scope (class/section/one student) is active, and this sale
        // was to a Staff/Walk-in buyer who can't belong to any class — exclude it.
        return false;
      }
      return true;
    });
  }
  function invReportBuyerListRows(){
    return invReportFilteredSales().slice().sort((a,b) => (a.date||'').localeCompare(b.date||'')).map(s => {
      const st = s.buyerType==='Student' ? students.find(x=>x.id===s.studentId) : null;
      return {
        'Date': s.date, 'Buyer': st ? (st.firstName+' '+st.lastName) : (s.buyerName||s.buyerType),
        'Buyer Type': s.buyerType, 'Class': st ? (st.className+' — '+st.section) : '—', 'Admission No': st ? st.admissionNo : '—',
        'Qty': s.qty, 'Unit Price': s.unitPrice, 'Discount': s.discount||0, 'Total': s.totalAmount, 'Paid': s.paidAmount, 'Mode': s.mode||'', 'Sold By': s.soldBy||'',
      };
    });
  }
  function invReportBuyerSummaryRows(){
    const byBuyer = {};
    invReportFilteredSales().forEach(s => {
      const st = s.buyerType==='Student' ? students.find(x=>x.id===s.studentId) : null;
      const key = s.buyerType==='Student' ? ('student:'+s.studentId) : ('other:'+s.buyerType+':'+(s.buyerName||''));
      if(!byBuyer[key]) byBuyer[key] = { name: st ? (st.firstName+' '+st.lastName) : (s.buyerName||s.buyerType), buyerType:s.buyerType, cls: st ? (st.className+' — '+st.section) : '—', admissionNo: st ? st.admissionNo : '—', qty:0, total:0, paid:0, txns:0, lastDate:'' };
      const b = byBuyer[key];
      b.qty += s.qty; b.total += s.totalAmount||0; b.paid += s.paidAmount||0; b.txns += 1;
      if(!b.lastDate || (s.date||'') > b.lastDate) b.lastDate = s.date;
    });
    return Object.values(byBuyer).sort((a,b) => b.qty-a.qty).map(b => ({
      'Buyer': b.name, 'Buyer Type': b.buyerType, 'Class': b.cls, 'Admission No': b.admissionNo,
      'Total Qty Purchased': b.qty, 'Transactions': b.txns, 'Total Spent': Math.round(b.total*100)/100, 'Total Paid': Math.round(b.paid*100)/100, 'Last Purchase Date': b.lastDate,
    }));
  }
  function invReportNonBuyerRows(){
    const itemSel = document.getElementById('invReportItemSelect');
    const itemId = itemSel ? itemSel.value : '';
    if(!itemId) return [];
    const buyerIds = new Set(inventorySales.filter(s => s.itemId===itemId && s.buyerType==='Student').map(s => s.studentId));
    return applyStudentScope(students.filter(isActive), getReportScopeFilters()).filter(s => !buyerIds.has(s.id)).map(s => ({
      'Admission No': s.admissionNo, 'Name': s.firstName+' '+s.lastName, 'Class': s.className, 'Section': s.section, 'Phone': s.fatherPhone||s.motherPhone||'',
    }));
  }
  function updateInvReportSummary(){
    const box = document.getElementById('invReportSummary');
    if(!box) return;
    const itemSel = document.getElementById('invReportItemSelect');
    if(!itemSel || !itemSel.value){ box.innerHTML = 'Pick a product above to see purchase stats.'; return; }
    const sales = invReportFilteredSales();
    const uniqueStudents = new Set(sales.filter(s=>s.buyerType==='Student').map(s=>s.studentId)).size;
    const uniqueStaff = new Set(sales.filter(s=>s.buyerType==='Staff').map(s=>s.buyerName||s.soldBy)).size;
    const walkinCount = sales.filter(s=>s.buyerType==='Walk-in').length;
    const totalQty = sales.reduce((sum,s)=>sum+(s.qty||0),0);
    const totalRevenue = sales.reduce((sum,s)=>sum+(s.totalAmount||0),0);
    const it = inventoryItems.find(x=>x.id===itemSel.value);
    let parts = [`<b>${uniqueStudents}</b> student${uniqueStudents===1?'':'s'} purchased`];
    if(uniqueStaff) parts.push(`<b>${uniqueStaff}</b> staff`);
    if(walkinCount) parts.push(`<b>${walkinCount}</b> walk-in sale${walkinCount===1?'':'s'}`);
    parts.push(`<b>${totalQty}</b> unit${totalQty===1?'':'s'} sold`);
    parts.push(`<b>${fmtMoney(totalRevenue)}</b> revenue`);
    box.innerHTML = `✓ <b>${it?it.name:''}</b>: ` + parts.join(' &nbsp;·&nbsp; ');
  }
  function generateInvItemReport(kind, format){
    const itemSel = document.getElementById('invReportItemSelect');
    const it = itemSel ? inventoryItems.find(x=>x.id===itemSel.value) : null;
    if(!it){ showToast('Pick a product first.'); return; }
    const names = { buyers:'Item Purchase Report — Buyer List', summary:'Item Purchase Summary — Unique Buyers', nonbuyers:'Non-Buyers Report' };
    const rows = kind==='buyers' ? invReportBuyerListRows() : kind==='summary' ? invReportBuyerSummaryRows() : invReportNonBuyerRows();
    if(rows.length === 0){ showToast('Nothing to report for this product with the current conditions.'); return; }
    const title = names[kind] + ' — ' + it.name;
    const fileBase = (kind+'_'+it.name).replace(/[^\w-]+/g,'_');
    if(format === 'excel') exportRowsToExcel(fileBase+'.xlsx', names[kind], rows);
    else exportRowsToPDF(title, '', rows);
  }
  async function generateLibraryReport(id, format, filtersOverride){
    // Reports can pull from any of the lazily-loaded datasets (payments,
    // attendance, exam results, accounting) depending on which report was
    // picked — load them all up front rather than special-casing every
    // report definition.
    await Promise.all([
      ensureDataLoaded('payments', loadPaymentsData),
      ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData),
      ensureDataLoaded('staffAttendanceRecords', loadStaffAttendance),
      ensureDataLoaded('examResults', loadExamResultsData),
      ensureDataLoaded('acctTransactions', loadAcctTransactionsData),
      ensureDataLoaded('acctLedger', loadAccountingLedgerData),
    ]);
    const r = REPORT_LIBRARY.find(x => x.id === id);
    if(!r) return;
    const filters = filtersOverride || getReportScopeFilters();
    if(r.special === true){
      generateFeeDuePayableReport(id, filters, format);
      return;
    }
    const rows = r.getRows(filters);
    let subtitle = '';
    if(r.scopable){
      if(filters.studentId){ const s = students.find(x=>x.id===filters.studentId); subtitle = s ? s.firstName+' '+s.lastName : ''; }
      else if(r.scopable==='staff' && filters.department) subtitle = filters.department;
      else if(filters.className) subtitle = filters.className + (filters.section ? ' — Section '+filters.section : '');
    }
    if(format === 'excel') exportRowsToExcel(r.id+'.xlsx', r.name, rows);
    else exportRowsToPDF(r.name, subtitle, rows);
  }

  /* --- Teacher Performance Reports: evaluate each teacher against the subjects/sections they
     actually teach right now (per-section assignment in Manage Subjects) and the marks their
     students scored, either for one exam or cumulatively across all exams.

     Rebuilt to match how the major Indian school ERPs (Fedena, Entab, MasterSoft and similar)
     and CBSE's own appraisal guidance frame a "teacher performance" report: not a single
     marks-average, but a small, transparent set of weighted signals — student academic
     results, student pass rate, the teacher's OWN attendance/punctuality, syllabus completion
     against the planned schedule, and how consistent results are across the class — rolled up
     into one Overall Score with the weights shown openly (never a black-box number sprung on
     someone in a meeting). A component with no data yet (e.g. no syllabus topics logged for
     that teacher's classes) is left out and the remaining weights are rescaled, so a module
     the school hasn't started using yet doesn't unfairly drag a teacher's score down. --- */
  const TEACHER_PERF_WEIGHTS = { academic:0.40, passRate:0.15, attendance:0.20, syllabus:0.15, consistency:0.10 };
  function teacherPerformanceRawRows(examId){
    const examsToUse = examId ? examDefs.filter(e => e.id === examId) : examDefs;
    const rows = [];
    examsToUse.forEach(exam => {
      subjectsList.forEach(subj => {
        (subj.sections || []).forEach(section => {
          const teacherIds = subjectStaffForSection(subj, section);
          if(!teacherIds || teacherIds.length === 0) return;
          const cfg = getExamSubjects(exam, subj.className, section).find(s => s.name === subj.name);
          if(!cfg || cfg.countable === false) return;
          const classStudents = students.filter(s => s.className === subj.className && s.section === section && isActive(s));
          if(classStudents.length === 0) return;
          const pcts = [];
          let absentCount = 0;
          classStudents.forEach(s => {
            const r = examResults.find(er => er.examId === exam.id && er.studentId === s.id && er.subject === subj.name);
            if(!r) return;
            if(r.absent){ absentCount++; return; }
            if(r.marks === null || r.marks === undefined || r.marks === '') return;
            pcts.push((Number(r.marks) / (cfg.maxMarks || 100)) * 100);
          });
          if(pcts.length === 0) return;
          const avgPct = pcts.reduce((a,b) => a+b, 0) / pcts.length;
          const highest = Math.max(...pcts);
          const lowest = Math.min(...pcts);
          const passCount = pcts.filter(p => !isFailGrade(gradeForPct(p))).length;
          const passRate = (passCount / pcts.length) * 100;
          const variance = pcts.reduce((a,p) => a + Math.pow(p - avgPct, 2), 0) / pcts.length;
          const stdDev = Math.sqrt(variance);
          teacherIds.forEach(tid => {
            const st = staffList.find(x => x.id === tid);
            if(!st || !staffIsActive(st)) return;
            rows.push({
              teacherId: tid, teacherName: st.firstName+' '+st.lastName, designation: st.designation||'', department: st.department||'',
              subject: subj.name, className: subj.className, section, examId: exam.id, examName: exam.name,
              studentsEvaluated: pcts.length, absentCount,
              avgPct: Math.round(avgPct*10)/10, highest: Math.round(highest*10)/10, lowest: Math.round(lowest*10)/10,
              passRate: Math.round(passRate*10)/10, stdDev: Math.round(stdDev*10)/10,
            });
          });
        });
      });
    });
    return rows;
  }
  function teacherPerformanceScopedRows(examId, filters){
    let rows = teacherPerformanceRawRows(examId);
    if(filters.className) rows = rows.filter(r => r.className === filters.className);
    if(filters.section) rows = rows.filter(r => r.section === filters.section);
    if(filters.department) rows = rows.filter(r => r.department === filters.department);
    return rows;
  }
  function teacherPerformanceDetailReport(examId, filters){
    return teacherPerformanceScopedRows(examId, filters)
      .sort((a,b) => a.teacherName.localeCompare(b.teacherName) || a.subject.localeCompare(b.subject))
      .map(r => ({
        'Teacher': r.teacherName, 'Designation': r.designation, 'Subject': r.subject, 'Class': r.className, 'Section': r.section,
        'Exam': r.examName, 'Students Evaluated': r.studentsEvaluated, 'Absent': r.absentCount,
        'Average %': r.avgPct, 'Highest %': r.highest, 'Lowest %': r.lowest, 'Pass Rate %': r.passRate, 'Std. Deviation': r.stdDev,
      }));
  }
  const TP_FLAG_LABEL = { top:'🌟 Top Performer', attention:'⚠ Needs Attention', steady:'Steady' };
  function teacherPerformanceSummaryReport(examId, filters){
    // Reuses the same weighted dashboard rows the on-screen dashboard shows, so the
    // exported file and what the room sees on screen never disagree.
    return teacherPerformanceDashboardRows(examId, filters).map((t,i) => ({
      'Rank': i+1, 'Teacher': t.name, 'Designation': t.designation,
      'Subjects Handled': t.subjects.join(', '), 'Classes/Sections': t.sections.join(', '),
      'Students Evaluated': t.totalStudents, 'Academic Average %': t.avgPct, 'vs Subject Avg': (t.delta>0?'+':'')+t.delta+'%',
      'Pass Rate %': t.passRate, 'Personal Attendance %': t.attendancePct!==null?t.attendancePct:'—',
      'Syllabus Completion %': t.syllabusPct!==null?t.syllabusPct:'—', 'Consistency (Std. Dev.)': t.consistency,
      'Overall Score': t.overallScore, 'Status': TP_FLAG_LABEL[t.flag], 'Meeting Talking Point': t.talkingPoint,
    }));
  }

  /* ===== Teacher Performance — on-screen Dashboard =====
     The exports above (teacherPerformanceSummaryReport/DetailReport) already did the
     hard work of matching each teacher's actual subject-section assignments against
     the marks their students scored. This section reuses that same underlying data
     (teacherPerformanceScopedRows) but renders it as a ranked, drill-down dashboard
     right in the app instead of only as a downloadable file, and adds three things
     real schools look for beyond a raw average: a fair baseline (compared against
     other teachers of the SAME subject, since subjects vary in difficulty), a grade
     distribution (the full spread, not just one number), and a trend across exams
     (improving or declining), plus attendance as context alongside the marks. */
  