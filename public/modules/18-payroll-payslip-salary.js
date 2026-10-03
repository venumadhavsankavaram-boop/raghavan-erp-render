function salaryDisbursementData(monthStr){
    const list = staffList.filter(staffIsActive).sort((a,b) => (a.firstName+a.lastName).localeCompare(b.firstName+b.lastName));
    const ready = [], missingBank = [], notApproved = [];
    list.forEach(st => {
      const rec = findPayrollRecord(st.id, monthStr);
      if(!rec || rec.status !== 'Approved'){ notApproved.push(st); return; }
      const row = {
        staffId: st.id, name: st.firstName+' '+st.lastName, designation: st.designation||'', department: st.department||'',
        bankName: st.bankName||'', accountName: st.bankAccountName || (st.firstName+' '+st.lastName),
        accountNumber: st.bankAccountNumber||'', ifsc: st.bankIfsc||'', netSalary: rec.netSalary,
      };
      if(st.bankAccountNumber && st.bankIfsc) ready.push(row); else missingBank.push(row);
    });
    const total = [...ready, ...missingBank].reduce((sum,r) => sum + r.netSalary, 0);
    return { ready, missingBank, notApproved, total };
  }
  function renderSalaryDisbursementCard(){
    const monthStr = staffPayrollMonth;
    const { ready, missingBank, notApproved, total } = salaryDisbursementData(monthStr);
    const monthLabel = new Date(monthStr+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'});
    const rowHtml = r => `
      <tr>
        <td class="name-cell" style="cursor:pointer;" onclick="openStaffProfile('${r.staffId}')">${r.name}<div style="font-size:0.7rem; color:var(--ink-soft); font-weight:400;">${r.designation}${r.department?' · '+r.department:''}</div></td>
        <td>${r.bankName||'—'}</td>
        <td>${r.accountName||'—'}</td>
        <td style="font-family:'IBM Plex Mono',monospace;">${r.accountNumber||'—'}</td>
        <td style="font-family:'IBM Plex Mono',monospace;">${r.ifsc||'—'}</td>
        <td><b>${fmtMoney(r.netSalary)}</b></td>
      </tr>`;
    const hasAnyApproved = ready.length || missingBank.length;
    return `
      <div class="profile-card" style="margin-top:24px; border-top:4px solid var(--teal);">
        <h4 style="margin:0 0 6px;">💸 Salary Disbursement Report — ${monthLabel}</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:0 0 16px;">Net salary payable, after every deduction (EPF, ESI, Loss of Pay, other deductions), for every staff member whose payroll is <b>Approved</b> this month — a Draft is never included here, so nothing half-calculated gets paid out. Add bank details under Staff → Edit → Payroll Setup to have them prefilled below.</p>
        ${hasAnyApproved ? `
        <div class="table-wrap" style="overflow-x:auto; margin-bottom:14px;">
          <table><thead><tr><th>Staff</th><th>Bank</th><th>Account Holder</th><th>Account Number</th><th>IFSC</th><th>Net Salary</th></tr></thead>
          <tbody>${ready.map(rowHtml).join('')}</tbody></table>
        </div>
        <div class="pay-summary-box" style="margin-bottom:16px;">
          <div class="pay-summary-grid">
            <div class="pay-summary-item"><span>Approved This Month</span><b>${ready.length + missingBank.length}</b></div>
            <div class="pay-summary-item highlight"><span>Total to Disburse</span><b>${fmtMoney(total)}</b></div>
          </div>
        </div>
        ` : ''}
        ${missingBank.length ? `
        <div class="profile-card" style="margin-bottom:16px; background:rgba(203,154,46,0.1); border-left:4px solid var(--gold);">
          <h4 style="margin:0 0 8px;">⚠ ${missingBank.length} approved but missing bank details</h4>
          <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:10px;">Their salary is calculated and approved — included in the total above — but with no bank account/IFSC on file they're left out of the table, so a bank transfer can't be prepared for them yet.</p>
          <div class="table-wrap"><table><thead><tr><th>Staff</th><th>Net Salary</th></tr></thead><tbody>
            ${missingBank.map(r => `<tr><td class="name-cell" style="cursor:pointer;" onclick="openStaffProfile('${r.staffId}')">${r.name}</td><td>${fmtMoney(r.netSalary)}</td></tr>`).join('')}
          </tbody></table></div>
        </div>` : ''}
        ${notApproved.length ? `<p style="font-size:0.78rem; color:var(--ink-soft);">${notApproved.length} active staff member${notApproved.length===1?'':'s'} not yet approved for ${monthLabel}, so not included here yet: ${notApproved.map(s=>s.firstName+' '+s.lastName).join(', ')}.</p>` : ''}
        ${hasAnyApproved
          ? `<div style="display:flex; gap:10px; margin-top:12px;"><button class="btn btn-ghost btn-sm" onclick="downloadSalaryDisbursementExcel()">📥 Excel</button><button class="btn btn-ghost btn-sm" onclick="downloadSalaryDisbursementPDF()">📄 PDF</button></div>`
          : `<div class="empty-state"><b>Nothing to disburse yet</b>Approve at least one staff member's payroll for ${monthLabel} above, first.</div>`}
      </div>
    `;
  }
  function salaryDisbursementReportRows(){
    const { ready, missingBank } = salaryDisbursementData(staffPayrollMonth);
    return [...ready, ...missingBank].map(r => ({
      'Staff': r.name, 'Designation': r.designation, 'Department': r.department,
      'Bank Name': r.bankName, 'Account Holder': r.accountName, 'Account Number': r.accountNumber, 'IFSC': r.ifsc,
      'Net Salary Payable': r.netSalary,
    }));
  }
  function downloadSalaryDisbursementExcel(){
    exportRowsToExcel('salary_disbursement_'+staffPayrollMonth+'.xlsx', 'Salary Disbursement', salaryDisbursementReportRows());
  }
  function downloadSalaryDisbursementPDF(){
    const monthLabel = new Date(staffPayrollMonth+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'});
    exportRowsToPDF('Salary Disbursement — '+monthLabel, '', salaryDisbursementReportRows());
  }
  function resetPayrollField(staffId, monthStr, which){
    const rec = findPayrollRecord(staffId, monthStr);
    if(!rec || rec.status === 'Approved') return;
    if(which === 'epf'){ rec.epfManual = false; }
    if(which === 'esi'){ rec.esiManual = false; }
    const overrides = {
      bonus: rec.bonus, otherDeductions: rec.otherDeductions,
      epfEmployee: rec.epfManual ? rec.epfEmployee : undefined,
      esiEmployee: rec.esiManual ? rec.esiEmployee : undefined,
    };
    Object.assign(rec, computeStaffPayroll(staffId, monthStr, overrides));
    storageSet(STAFF_PAYROLL_KEY, staffPayrollRecords).then(() => renderStaffBody());
  }
  function staffPayrollReportRows(){
    const rows = staffList.filter(staffIsActive).map(st => {
      const { preview } = staffPayrollRowData(st.id, staffPayrollMonth);
      return {
        'Staff': st.firstName+' '+st.lastName, 'Department': st.department||'', 'Designation': st.designation||'',
        'Basic': preview.basic, 'Leaves Taken': preview.leaveDays, 'Quota': preview.quota, 'LOP Days': preview.lopDays,
        'LOP Deduction': preview.lopDeduction, 'EPF (Employee)': preview.epfEmployee, 'ESI (Employee)': preview.esiEmployee,
        'Other Deductions': preview.otherDeductions, 'Bonus': preview.bonus, 'Gross Salary': preview.grossSalary, 'Net Salary': preview.netSalary,
        'Status': (findPayrollRecord(st.id, staffPayrollMonth) || {}).status || 'Not generated',
      };
    });
    if(rows.length){
      const sum = key => rows.reduce((a,r) => a + (Number(r[key])||0), 0);
      rows.push({
        'Staff': 'TOTAL — '+rows.length+' staff', 'Department': '', 'Designation': '',
        'Basic': sum('Basic'), 'Leaves Taken': '', 'Quota': '', 'LOP Days': '',
        'LOP Deduction': sum('LOP Deduction'), 'EPF (Employee)': sum('EPF (Employee)'), 'ESI (Employee)': sum('ESI (Employee)'),
        'Other Deductions': sum('Other Deductions'), 'Bonus': sum('Bonus'), 'Gross Salary': sum('Gross Salary'), 'Net Salary': sum('Net Salary'),
        'Status': '',
      });
    }
    return rows;
  }
  function downloadStaffPayrollExcel(){ exportRowsToExcel('staff_payroll_'+staffPayrollMonth+'.xlsx', 'Staff Payroll', staffPayrollReportRows()); }
  function downloadStaffPayrollPDF(){ exportRowsToPDF('Staff Payroll — '+staffPayrollMonth, '', staffPayrollReportRows()); }

  /* --- ID Cards --- */
  function renderIdCardsDeptGrid(body){
    const rows = staffDepartments.map((dept, idx) => {
      const count = staffList.filter(st => st.department===dept && staffIsActive(st)).length;
      return `<div class="class-compact-tile" data-idx="${idx%4}" onclick="openIdCardsDept('${dept.replace(/'/g,"\\'")}')">
        <div class="class-compact-header"><div><div class="class-compact-name">${dept}</div><div class="class-compact-count">${count} <span class="class-compact-count-label">staff</span></div></div></div>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="class-compact-grid">${rows}</div>`;
  }
  function openIdCardsDept(dept){
    idCardsDept = dept;
    renderStaffBody();
  }
  function backToIdCardsGrid(){ idCardsDept = ''; renderStaffBody(); }
  function renderIdCardsList(body){
    const list = staffList.filter(st => st.department === idCardsDept && staffIsActive(st));
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToIdCardsGrid()">All Departments</a> &nbsp;/&nbsp; ${idCardsDept}</div>
      <button class="btn btn-primary" style="margin-bottom:16px;" onclick="printStaffIdCards('${idCardsDept.replace(/'/g,"\\'")}', null)" ${list.length===0?'disabled':''}>Print All ID Cards</button>
      <div class="table-wrap">
        <table><thead><tr><th>Staff</th><th>Staff ID</th><th>Designation</th><th></th></tr></thead>
        <tbody>${list.map(st => `<tr>
          <td class="name-cell">${st.firstName} ${st.lastName}</td>
          <td class="id-cell">${st.staffId}</td>
          <td>${st.designation||'—'}</td>
          <td><button class="btn-edit-text" onclick="printStaffIdCards('${idCardsDept.replace(/'/g,"\\'")}', '${st.id}')">Print ID Card</button></td>
        </tr>`).join('')}</tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No active staff in this department</b></div>` : ``}
      </div>
    `;
  }
  function printStaffIdCards(dept, singleId){
    let list = staffList.filter(st => st.department === dept && staffIsActive(st));
    if(singleId) list = list.filter(st => st.id === singleId);
    if(list.length === 0) return;
    const logoSrc = document.querySelector('.sb-brand img').src;
    const cardHtml = (st) => `
      <div class="sic-card">
        <div class="sic-head"><img src="${logoSrc}"><div class="sic-school">${schoolInfo.name}</div></div>
        <div class="sic-photo">${st.photo ? `<img src="${st.photo}">` : `<div class="sic-initials">${staffInitials(st)}</div>`}</div>
        <div class="sic-name">${st.firstName} ${st.lastName}</div>
        <div class="sic-desig">${st.designation||'Staff'}</div>
        <table class="sic-info">
          <tr><td>Staff ID</td><td>${st.staffId}</td></tr>
          <tr><td>Department</td><td>${st.department}</td></tr>
          <tr><td>Phone</td><td>${st.phone||'—'}</td></tr>
          <tr><td>Blood Group</td><td>${st.blood||'—'}</td></tr>
        </table>
        <div class="sic-foot">${schoolInfo.address}</div>
      </div>
    `;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Staff ID Cards</title>
      <style>
        @page{ size:A4; margin:8mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; }
        .sic-wrap{ display:flex; flex-wrap:wrap; gap:6mm; }
        .sic-card{ width:54mm; border:1px solid #333; border-radius:6px; padding:4mm; box-sizing:border-box; text-align:center; page-break-inside:avoid; }
        .sic-head{ display:flex; align-items:center; gap:5px; justify-content:center; margin-bottom:6px; }
        .sic-head img{ width:20px; height:20px; border-radius:50%; }
        .sic-school{ font-weight:700; font-size:8px; text-align:left; line-height:1.1; }
        .sic-photo{ width:60px; height:60px; border-radius:50%; overflow:hidden; margin:0 auto 6px; background:#eee; display:flex; align-items:center; justify-content:center; }
        .sic-photo img{ width:100%; height:100%; object-fit:cover; }
        .sic-initials{ font-size:20px; font-weight:700; color:#666; }
        .sic-name{ font-weight:700; font-size:11px; margin-bottom:2px; }
        .sic-desig{ font-size:9px; color:#555; margin-bottom:8px; }
        .sic-info{ width:100%; font-size:8px; border-collapse:collapse; text-align:left; margin-bottom:8px; }
        .sic-info td{ padding:2px 0; }
        .sic-info td:first-child{ color:#666; width:45%; }
        .sic-foot{ font-size:6.5px; color:#777; border-top:1px solid #ddd; padding-top:4px; }
      </style></head>
      <body onload="window.print()">
        <div class="sic-wrap">${list.map(cardHtml).join('')}</div>
      </body></html>
    `);
    w.document.close();
  }

  /* ===== SETTINGS MODAL ===== */
  /* ===== CONFIGURATION PAGES (each a standalone sidebar page) ===== */
  function initSchoolProfilePage(){ renderSchoolProfileTab(document.getElementById('schoolProfileBody')); }
  function initClassesSetupPage(){ renderClassesTab(document.getElementById('classesSetupBody')); }
  function initAcademicYearPage(){ renderAcademicYearTab(document.getElementById('academicYearBody')); }
  function initFeeStructureSetupPage(){ renderFeeStructureTab(document.getElementById('feeStructureSetupBody')); }
  function initPromotionsPage(){ renderPromotionsTab(document.getElementById('promotionsBody')); }
  function initUsersRolesPage(){
    const body = document.getElementById('usersRolesBody');
    if(currentUser.role !== 'Admin'){ body.innerHTML = `<div class="empty-state"><b>Admin access only</b>This section is restricted to the Admin role.</div>`; return; }
    renderUsersTab(body);
  }
  function initStudentParentLoginsPage(){
    const body = document.getElementById('studentParentLoginsBody');
    if(currentUser.role !== 'Admin'){ body.innerHTML = `<div class="empty-state"><b>Admin access only</b>This section is restricted to the Admin role.</div>`; return; }
    renderStudentParentLoginsView(body);
  }
  function studentParentLoginQuery(){
    const el = document.getElementById('splSearch');
    return el ? el.value.trim().toLowerCase() : '';
  }
  function onStudentParentLoginSearch(){
    renderStudentParentLoginsView(document.getElementById('studentParentLoginsBody'));
  }
  /* --- Student/Parent Logins: a focused view over Users & Roles for the most
     common front-office task — finding a student or parent's login to fix a
     forgotten password, or setting one up for the first time — without wading
     through staff and admin accounts mixed in. Reuses the same user
     modal/save/delete logic as Users & Roles so both stay in sync. --- */
  function renderStudentParentLoginsView(body){
    const q = studentParentLoginQuery();
    const logins = users.filter(u => u.role === 'Student' || u.role === 'Parent');
    const linkedIds = new Set(logins.map(u => u.linkedStudentId).filter(Boolean));
    let missing = students.filter(s => isActive(s) && !linkedIds.has(s.id));
    let visibleLogins = logins;
    if(q){
      const studentLabel = u => {
        const s = u.linkedStudentId ? students.find(x => x.id === u.linkedStudentId) : null;
        return s ? (s.firstName+' '+s.lastName) : '';
      };
      visibleLogins = logins.filter(u => (u.name||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q) || studentLabel(u).toLowerCase().includes(q));
      missing = missing.filter(s => (s.firstName+' '+s.lastName).toLowerCase().includes(q) || (s.admissionNo||'').toLowerCase().includes(q));
    }
    const loginRows = visibleLogins.map(u => {
      const linked = u.linkedStudentId ? students.find(s => s.id === u.linkedStudentId) : null;
      return `
        <tr>
          <td class="name-cell">${u.name}</td>
          <td class="id-cell">${u.username}</td>
          <td><span class="role-pill">${u.role}</span></td>
          <td>${linked ? `${linked.firstName} ${linked.lastName} — ${linked.className}${linked.section?'-'+linked.section:''}` : '—'}</td>
          <td style="font-family:'IBM Plex Mono',monospace; font-size:0.8rem;">${u.recoveryCode||'—'}</td>
          <td>
            <button class="btn-edit-text" onclick="editUser('${u.id}')">Fix Login</button>
            &nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteUser('${u.id}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
    const missingRows = missing.map(s => `
      <tr>
        <td class="name-cell">${s.firstName} ${s.lastName}</td>
        <td>${s.className}${s.section?'-'+s.section:''}</td>
        <td>${s.admissionNo||'—'}</td>
        <td><button class="btn-edit-text" onclick="openUserModal('${(s.firstName+' '+s.lastName).replace(/'/g,"\\'")}', 'Student', '${s.id}', 'studentparent')">+ Create Login</button></td>
      </tr>
    `).join('');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">
        Search by student name, admission number, or username. Click <b>Fix Login</b> on any row to see or change
        that login's password, or to hand out its recovery code so they can reset it themselves from the login screen.
      </p>
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:20px; flex-wrap:wrap;">
        <input class="input" id="splSearch" placeholder="Search by student name, admission no., or username..." style="max-width:340px;" value="${q}" oninput="onStudentParentLoginSearch()">
        <button class="btn btn-primary" onclick="openUserModal(undefined, undefined, undefined, 'studentparent')">+ Add Login</button>
      </div>
      ${missing.length ? `
        <div class="profile-card" style="margin-bottom:20px; background:rgba(203,154,46,0.08); border-left:4px solid var(--gold);">
          <h4>⚠ ${missing.length} active student${missing.length===1?'':'s'} with no login yet</h4>
          <p style="font-size:0.8rem; color:var(--ink-soft); margin:8px 0 12px;">Nothing is broken for these — they simply don't have a Student or Parent login created. Click Create Login to set one up.</p>
          <div class="table-wrap">
            <table><thead><tr><th>Student</th><th>Class</th><th>Admission No.</th><th></th></tr></thead>
            <tbody>${missingRows}</tbody></table>
          </div>
        </div>
      ` : ''}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Linked Student</th><th>Recovery Code</th><th></th></tr></thead>
          <tbody>${loginRows.length ? loginRows : `<tr><td colspan="6"><div class="empty-state"><b>No matching logins</b></div></td></tr>`}</tbody>
        </table>
      </div>
    `;
  }
  function initRolesPermissionsPage(){
    const body = document.getElementById('rolesPermissionsBody');
    if(currentUser.role !== 'Admin'){ body.innerHTML = `<div class="empty-state"><b>Admin access only</b>This section is restricted to the Admin role.</div>`; return; }
    renderPermissionsTab(body);
  }
  async function initAdminTools2Page(){
    const body = document.getElementById('adminTools2Body');
    if(currentUser.role !== 'Admin'){ body.innerHTML = `<div class="empty-state"><b>Admin access only</b>This section is restricted to the Admin role.</div>`; return; }
    // The "Reset Inventory / Accounting Data" panel shows and deletes
    // acctExpenses/acctIncome counts — must be the real numbers, not an
    // unloaded empty array, before the admin sees the checkbox counts.
    await ensureDataLoaded('acctTransactions', loadAcctTransactionsData);
    renderAdminToolsTab(body);
  }

  /* ===== INVENTORY MODULE ===== */
  const INVENTORY_ITEMS_KEY = "inventory-items";
  const INVENTORY_SALES_KEY = "inventory-sales";
  const INVENTORY_RETURNS_KEY = "inventory-returns";
  const INVENTORY_VENDOR_RETURNS_KEY = "inventory-vendor-returns";
  [INVENTORY_ITEMS_KEY, INVENTORY_SALES_KEY, INVENTORY_RETURNS_KEY, INVENTORY_VENDOR_RETURNS_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  let inventoryItems = [], inventorySales = [], inventoryReturns = [], inventoryVendorReturns = [];
  async function loadInventory(){
    inventoryItems = await storageGet(INVENTORY_ITEMS_KEY, []);
    inventorySales = await storageGet(INVENTORY_SALES_KEY, []);
    inventoryReturns = await storageGet(INVENTORY_RETURNS_KEY, []);
    inventoryVendorReturns = await storageGet(INVENTORY_VENDOR_RETURNS_KEY, []);
  }
  // How much of a sale line has already been returned — always derived from the
  // returns log itself, never stored back onto the original sale, so the sale
  // record stays an untouched, permanent record of what actually happened at
  // checkout (needed for correct historical reporting).
  function returnedQtyForSale(saleId){
    return inventoryReturns.filter(r => r.saleId === saleId).reduce((s,r) => s + r.qty, 0);
  }
  const INVENTORY_CATEGORIES = ['Student Supplies','Uniforms','Books','Stationery','Sports','Other'];
  const INVENTORY_SUBCATEGORIES = {
    'Student Supplies': ['Bag','Water Bottle','Lunch Box','ID Card Holder','Other'],
    'Uniforms': ['Shirt','Trousers','Skirt','Pinafore','Tie','Belt','Sweater','Shoes','Other'],
    'Books': ['Textbook','Notebook','Workbook','Guide','Govt Text Books','Materials','IIT Books','Diary','Other'],
    'Stationery': ['Pen','Pencil','Eraser','Geometry Box','Crayons','Other'],
    'Sports': ['Ball','Kit','Equipment','Other'],
    'Other': ['Other'],
  };
  const INVENTORY_UNITS = ['Piece','Set','Pair','Box','Packet','Kg','Litre','Dozen'];
  let inventoryTab = 'items';
  let invFilterType = 'Sellable';
  let invSearchQuery = '';
  let invItemsView = 'list';
  let editingInventoryItemId = '';
  let invQuickOpen = false;
  /* ===== MY ACCOUNT (available to every logged-in role) ===== */
  let myAccountPhotoData = '';
  /* ===== TIMETABLE MODULE ===== */
  const TIMETABLE_KEY = "timetable-entries";
  const TIMETABLE_PERIODS_KEY = "timetable-periods";
  const TIMETABLE_DAYS_KEY = "timetable-days";
  [TIMETABLE_KEY, TIMETABLE_PERIODS_KEY, TIMETABLE_DAYS_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  let timetableEntries = [], timetablePeriods = [], timetableActiveDays = [];
  const ALL_WEEK_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  function activeTimetableDays(){ return timetableActiveDays.length ? timetableActiveDays : ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; }
  async function loadTimetable(){
    timetableEntries = await storageGet(TIMETABLE_KEY, []);
    timetableActiveDays = await storageGet(TIMETABLE_DAYS_KEY, ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']);
    timetablePeriods = await storageGet(TIMETABLE_PERIODS_KEY, [
      {id:'p1', label:'Period 1', start:'09:00', end:'09:45', isBreak:false},
      {id:'p2', label:'Period 2', start:'09:45', end:'10:30', isBreak:false},
      {id:'p3', label:'Period 3', start:'10:30', end:'11:15', isBreak:false},
      {id:'b1', label:'Short Break', start:'11:15', end:'11:30', isBreak:true},
      {id:'p4', label:'Period 4', start:'11:30', end:'12:15', isBreak:false},
      {id:'p5', label:'Period 5', start:'12:15', end:'13:00', isBreak:false},
      {id:'lunch', label:'Lunch', start:'13:00', end:'13:40', isBreak:true},
      {id:'p6', label:'Period 6', start:'13:40', end:'14:25', isBreak:false},
      {id:'p7', label:'Period 7', start:'14:25', end:'15:10', isBreak:false},
      {id:'p8', label:'Period 8', start:'15:10', end:'15:55', isBreak:false},
    ]);
  }
  let timetableTab = 'class';
  let ttClass = '', ttSection = '', ttTeacherId = '';

  /* ===== SYLLABUS & HOMEWORK ===== */
  // Two flat, kv-store-backed lists — one row per syllabus topic, one per
  // homework item — each scoped by className + (optional) section + subject,
  // the same scoping shape Timetable and Subjects already use. An entry with
  // no section applies to every section of that class. Both lists are read
  // directly by the Student/Parent portal's own tab (renderMySyllabusHomeworkTab)
  // with zero extra fetching — same array, same data, just filtered to that
  // one student's class & section.
  const SYLLABUS_KEY = "syllabus-topics";
  const HOMEWORK_KEY = "homework-items";
  OBJECT_BACKED_KEYS[SYLLABUS_KEY] = '/api/kv/' + SYLLABUS_KEY;
  // Homework moved off the kv_store blob to its own dedicated table/endpoint
  // (see server.js's homework_items table) — same reasoning as the earlier
  // Accounting and student_submissions migrations: a real table lets each
  // item carry attachments and drive a notify-on-assign push, and the
  // generic API_BACKED_KEYS sync (diff + POST/PUT/DELETE per row) is a
  // drop-in replacement for the whole-blob PUT this used to do.
  API_BACKED_KEYS[HOMEWORK_KEY] = '/api/homework-items';
  let syllabusTopics = [], homeworkItems = [];
  async function loadSyllabusHomework(){
    syllabusTopics = await storageGet(SYLLABUS_KEY, []);
    homeworkItems = await storageGet(HOMEWORK_KEY, []);
  }

  /* ===== TRANSPORT MODULE ===== */
  const TRANSPORT_ROUTES_KEY = "transport-routes";
  OBJECT_BACKED_KEYS[TRANSPORT_ROUTES_KEY] = '/api/kv/' + TRANSPORT_ROUTES_KEY;
  let transportRoutes = [];
  async function loadTransport(){
    transportRoutes = await storageGet(TRANSPORT_ROUTES_KEY, []);
  }
  let transportTab = 'routes';
  let trRouteView = 'list';
  let editingRouteId = '';
  let trEditStops = [];
  // Bus Pass printing — template, route/class filters, and the set of
  // selected student ids carry over while the admin flips between filters,
  // so ticking a box doesn't get lost when they narrow the list further.
  let busPassTemplate = 'classic';
  let busPassRouteFilter = '';
  let busPassClassFilter = '';
  let busPassSelected = new Set();
  /* ===== LIBRARY MODULE ===== */
  const LIBRARY_BOOKS_KEY = "library-books";
  const LIBRARY_ISSUES_KEY = "library-issues";
  const LIBRARY_SETTINGS_KEY = "library-settings";
  [LIBRARY_BOOKS_KEY, LIBRARY_ISSUES_KEY, LIBRARY_SETTINGS_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  let libraryBooks = [], libraryIssues = [], librarySettings = {};
  async function loadLibrary(){
    libraryBooks = await storageGet(LIBRARY_BOOKS_KEY, []);
    libraryIssues = await storageGet(LIBRARY_ISSUES_KEY, []);
    librarySettings = await storageGet(LIBRARY_SETTINGS_KEY, { loanPeriodDays:14, finePerDay:2 });
  }
  function addDaysToDate(dateStr, days){
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0,10);
  }
  let libraryTab = 'catalog';
  let libCatalogView = 'list';
  let editingBookId = '';
  let libCatalogSearch = '';
  /* ===== HOSTEL MODULE ===== */
  const HOSTEL_ROOMS_KEY = "hostel-rooms";
  OBJECT_BACKED_KEYS[HOSTEL_ROOMS_KEY] = '/api/kv/' + HOSTEL_ROOMS_KEY;
  let hostelRooms = [];
  async function loadHostel(){
    hostelRooms = await storageGet(HOSTEL_ROOMS_KEY, []);
  }
  let hostelTab = 'rooms';
  let hsRoomView = 'list';
  let editingRoomId = '';
  /* ===== ACCOUNTING MODULE ===== */
  const ACCT_EXPENSES_KEY = "acct-expenses";
  const ACCT_INCOME_KEY = "acct-income";
  const ACCT_EXPENSE_CATS_KEY = "acct-expense-categories";
  const ACCT_INCOME_CATS_KEY = "acct-income-categories";
  const ACCT_COST_CENTERS_KEY = "acct-cost-centers";
  // Income/Expense vouchers are real database rows now (see server.js —
  // acct_income / acct_expenses tables), not a single JSON blob, so two
  // people saving a voucher around the same moment each get their own row
  // instead of one silently overwriting the other's. Categories and cost
  // centers are still small kv-stored string lists — low risk either way,
  // and keeping them simple avoids a schema change for something that's
  // just a pick-list.
  [ACCT_EXPENSES_KEY, ACCT_INCOME_KEY].forEach(k => { API_BACKED_KEYS[k] = '/api/' + k; });
  [ACCT_EXPENSE_CATS_KEY, ACCT_INCOME_CATS_KEY, ACCT_COST_CENTERS_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  let acctExpenses = [], acctIncome = [], acctExpenseCategories = [], acctIncomeCategories = [], acctCostCenters = [];
  async function loadAccounting(){
    acctExpenseCategories = await storageGet(ACCT_EXPENSE_CATS_KEY, ['Salaries','Utilities (Electricity/Water)','Maintenance & Repairs','Stationery & Supplies','Transport Fuel','Furniture & Equipment','Miscellaneous']);
    acctIncomeCategories = await storageGet(ACCT_INCOME_CATS_KEY, ['Donation','Government Grant','Rental Income','Interest Income','Miscellaneous']);
    acctCostCenters = await storageGet(ACCT_COST_CENTERS_KEY, ['Tuition Fee','Vehicle Fee (Transport)','Inventory','Hostel Fee','General / Other']);
  }
  // acctExpenses / acctIncome (the accounting ledger's transaction history)
  // are large and ever-growing — loaded lazily on first actual use instead
  // of at login. See ensureDataLoaded(). This whole Accounting module is
  // fairly self-contained (mostly only its own tabs read these).
  async function loadAcctTransactionsData(){
    acctExpenses = await storageGet(ACCT_EXPENSES_KEY, []);
    acctIncome = await storageGet(ACCT_INCOME_KEY, []);
  }
  // Asks the server for the next number in a series — never guessed
  // client-side. See server.js's /api/next-doc-number: it's a single atomic
  // UPDATE...RETURNING, so two staff saving at the same instant still get
  // two different numbers, guaranteed by Postgres row locking rather than by
  // hoping no one clicks Save at the same second.
  async function issueDocNumber(series){
    const res = await fetch('/api/next-doc-number', { method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify({series}) });
    await throwIfNotOk(res);
    const data = await res.json();
    return data.docNumber;
  }
  // Fee payments (the `payments` table) already carry a category — fee /
  // bus / stock / hostel / extra — that maps naturally onto a cost center
  // for segment P&L purposes, without touching how fee collection itself
  // works. Anything not recognized (plain tuition, admission, fines, etc.)
  // falls back to the general school bucket.
  function feePaymentCostCenter(p){
    if(p.category === 'bus') return 'Vehicle Fee (Transport)';
    if(p.category === 'stock') return 'Inventory';
    if(p.category === 'hostel') return 'Hostel Fee';
    if(p.category === 'fee') return 'Tuition Fee';
    // Every individual Extra Fee (admission fee, one-off fines, etc.) is its
    // own free-form name, and a school can have many of them — breaking each
    // one out as its own P&L row got noisy fast, splitting what really
    // amounts to one kind of income across a dozen near-identical-looking
    // rows. Kept as a single, clean bucket instead.
    return 'General / Other';
  }
  // A voided payment is excluded from the books only when it's a plain
  // 'correction' (mis-entered — no real money ever moved, so it should
  // never have counted). A 'refund' void is different: that cash genuinely
  // arrived at the time, and really matches the bank statement — erasing it
  // here would understate historical Fee Income and permanently break Bank
  // Reconciliation against that real deposit. The refund itself is booked
  // as its own Expense Voucher (see submitRefundPayment), so the original
  // inflow + the refund outflow together net to the correct real effect
  // (zero for a full refund, the retained amount for a partial one) instead
  // of the payment vanishing and only the outflow being recorded.
  function pBookedInLedger(p){ return !p.voided || p.voidType === 'refund'; }
  function acctFeeIncomeTotal(){
    return payments.filter(pBookedInLedger).reduce((sum,p) => sum + (Number(p.amount)||0), 0);
  }
  function acctOtherIncomeTotal(){
    return acctIncome.filter(i => !i.voided).reduce((sum,i) => sum + (Number(i.amount)||0), 0);
  }
  function acctExpenseTotal(){
    return acctExpenses.filter(e => !e.voided).reduce((sum,e) => sum + (Number(e.amount)||0), 0);
  }

  let accountingTab = 'overview';
  let acctDailyCollectionsDate = new Date().toISOString().slice(0,10);

  /* ===== DOUBLE-ENTRY ACCOUNTING ENGINE =====
     Everything below sits ON TOP of the Income/Expense vouchers and Fee
     payments above — none of that data or its schema changes. Every
     historical fee payment / income voucher / expense voucher is treated as
     an already-balanced Receipt or Payment posting (Dr/Cr against a
     Bank/Cash account, inferred from its payment mode unless it explicitly
     names one) so the Chart of Accounts, Journal Vouchers, Ledgers, Trial
     Balance, Income & Expenditure Statement and Balance Sheet all work
     correctly from day one — zero data migration, zero risk to live
     records. New Journal Vouchers (manual adjustments, transfers, opening
     entries) are genuinely double-entry: every line has a Debit or Credit,
     and a voucher cannot be saved unless total Debit = total Credit. */
  