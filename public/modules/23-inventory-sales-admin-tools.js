const PENDING_APPROVALS_KEY = "pending-approvals";
  OBJECT_BACKED_KEYS[PENDING_APPROVALS_KEY] = '/api/kv/' + PENDING_APPROVALS_KEY;
  let pendingApprovals = [];
  async function loadPendingApprovals(){
    pendingApprovals = await storageGet(PENDING_APPROVALS_KEY, []);
  }
  let promoTransferTab = 'promote';
  let ptClass = '', ptView = 'grid';
  const PT_TAB_PERM_KEYS = { promote:'promo_promote', section:'promo_section', transfer:'promo_transfer', approvals:'promo_approvals' };
  function initPromoTransferView(){
    const accessibleTabs = Object.keys(PT_TAB_PERM_KEYS).filter(t => getPromoTransferTabAccess(currentUser.role, PT_TAB_PERM_KEYS[t]));
    Object.keys(PT_TAB_PERM_KEYS).forEach(t => { const btn = document.getElementById('pttab-'+t); if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none'; });
    if(!accessibleTabs.includes(promoTransferTab)) promoTransferTab = accessibleTabs[0] || 'promote';
    switchPromoTransferTab(promoTransferTab);
  }
  function switchPromoTransferTab(tab){
    promoTransferTab = tab;
    ['promote','section','transfer','approvals'].forEach(t => { const btn = document.getElementById('pttab-'+t); if(btn) btn.classList.toggle('active', t===tab); });
    ptView = 'grid';
    renderPromoTransferBody();
  }
  async function renderPromoTransferBody(){
    // The roster view shows each student's fee-due amount (computeStudentFinance -> payments).
    await ensureDataLoaded('payments', loadPaymentsData);
    const body = document.getElementById('promoTransferBody');
    if(!body) return;
    if(!getPromoTransferTabAccess(currentUser.role, PT_TAB_PERM_KEYS[promoTransferTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(promoTransferTab === 'approvals') return renderApprovalsTab(body);
    if(ptView === 'grid') return renderPTClassGrid(body);
    if(ptView === 'roster') return renderPTRoster(body);
  }
  function renderPTClassGrid(body){
    const tiles = CLASS_LEVELS.map((cls, idx) => {
      const total = students.filter(s => s.className===cls && isActive(s)).length;
      return `<div class="class-compact-tile" data-idx="${idx%4}" onclick="openPTRoster('${cls}')">
        <div class="class-compact-header"><div>
          <div class="class-compact-name">${cls}</div>
          <div class="class-compact-count">${total} <span class="class-compact-count-label">student${total===1?'':'s'}</span></div>
        </div></div>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="class-compact-grid">${tiles}</div>`;
  }
  function openPTRoster(cls){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    ptClass = cls;
    ptView = 'roster';
    renderPromoTransferBody();
  }
  function backToPTGrid(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    ptView = 'grid';
    renderPromoTransferBody();
  }
  function ptSelectAll(val){
    document.querySelectorAll('.pt-student-check').forEach(c => { c.checked = val; });
  }
  function renderPTRoster(body){
    const list = students.filter(s => s.className===ptClass && isActive(s)).sort((a,b) => (a.section+a.firstName).localeCompare(b.section+b.firstName));
    const classIdx = CLASS_LEVELS.indexOf(ptClass);
    const isAdmin = currentUser.role === 'Admin';
    const explanationBlock = !isAdmin ? `
      <div class="profile-card" style="max-width:640px; margin-bottom:16px; border-left:4px solid var(--gold);">
        <h4>⚠ Admin Approval Required</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:6px 0 10px;">Your role can't apply this directly — it will be sent to Admin for approval. Explain why this change is needed.</p>
        <div class="f-field full"><label>Explanation <span class="required-star">*</span></label><textarea id="ptExplanation" rows="2" placeholder="e.g. Exceptional performance in all subjects, recommended by class teacher"></textarea></div>
      </div>
    ` : '';
    if(promoTransferTab === 'promote'){
      body.innerHTML = `
        <div class="breadcrumb"><a onclick="backToPTGrid()">All Classes</a> &nbsp;/&nbsp; ${ptClass}</div>
        <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:14px; max-width:680px;">Select students and set their target class — leave on the default (next class) for a normal promotion, or pick a class further ahead for a <b>double promotion</b> (skipping a grade). Students with outstanding dues can have that balance carried forward into their new class ledger, filed under whichever fee type you choose.</p>
        ${explanationBlock}
        <div style="margin-bottom:12px;"><button class="btn btn-ghost btn-sm" onclick="ptSelectAll(true)">Select All</button> <button class="btn btn-ghost btn-sm" onclick="ptSelectAll(false)">Clear</button></div>
        <div class="table-wrap">
          <table><thead><tr><th></th><th>Student</th><th>Section</th><th>Outstanding Due</th><th>Carry Forward As</th><th>Target Class</th></tr></thead>
          <tbody>
          ${list.map(s => {
            const due = computeStudentFinance(s).totals.receivable;
            return `<tr>
              <td><input type="checkbox" class="pt-student-check" value="${s.id}"></td>
              <td class="name-cell">${s.firstName} ${s.lastName}</td>
              <td><span class="pill">${s.section}</span></td>
              <td>${due>0 ? `<b style="color:var(--magenta);">${fmtMoney(due)}</b>` : '—'}</td>
              <td>${due>0 ? `<select class="pt-carryforward-type" data-student="${s.id}" data-due="${due}">
                <option value="">Don't carry forward</option>
                <option value="fee">Fee</option>
                <option value="bus">Bus Fee</option>
                <option value="stock">Stock</option>
                <option value="hostel">Hostel</option>
                <option value="previous" selected>Previous Year Dues</option>
              </select>` : '—'}</td>
              <td><select class="pt-target-class" data-student="${s.id}">
                ${CLASS_LEVELS.map((c,i) => `<option value="${c}" ${i===classIdx+1?'selected':''}>${c}${i>=classIdx+2?' (Double Promotion)':''}</option>`).join('')}
                <option value="__graduate__">Graduate</option>
              </select></td>
            </tr>`;
          }).join('')}
          </tbody></table>
          ${list.length===0 ? `<div class="empty-state"><b>No active students in this class</b></div>` : ``}
        </div>
        ${canSub('promo_promote','promotransfer','edit') ? `<button class="btn btn-primary" style="margin-top:16px;" onclick="applyPromotions()">${isAdmin ? 'Promote Selected Students' : 'Submit for Admin Approval'}</button>` : ''}
      `;
    }else if(promoTransferTab === 'section'){
      // Moving a student to a different section WITHIN the same class — e.g.
      // 1st Class Section A -> 1st Class Section B. This only ever changes
      // `section`; it never touches status, so a student moved here stays
      // exactly as visible/active as before. Deliberately separate from the
      // "Transfer Students" tab below, which is for a student leaving the
      // school entirely (sets status to Transferred) — the two were easy to
      // confuse when this was the only "transfer"-labeled option available.
      body.innerHTML = `
        <div class="breadcrumb"><a onclick="backToPTGrid()">All Classes</a> &nbsp;/&nbsp; ${ptClass}</div>
        <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:14px; max-width:680px;">Select students and pick their new section. This only moves them within ${ptClass} — it does not affect their status, fees, or any other record. To record a student leaving the school entirely, use "Transfer Students (Leaving School)" instead.</p>
        ${explanationBlock}
        <div style="margin-bottom:12px;"><button class="btn btn-ghost btn-sm" onclick="ptSelectAll(true)">Select All</button> <button class="btn btn-ghost btn-sm" onclick="ptSelectAll(false)">Clear</button></div>
        <div class="table-wrap">
          <table><thead><tr><th></th><th>Student</th><th>Current Section</th><th>New Section</th></tr></thead>
          <tbody>
          ${list.map(s => `<tr>
            <td><input type="checkbox" class="pt-student-check" value="${s.id}"></td>
            <td class="name-cell">${s.firstName} ${s.lastName}</td>
            <td><span class="pill">${s.section}</span></td>
            <td><select class="pt-target-section" data-student="${s.id}">
              ${SECTIONS.map(sec => `<option value="${sec}" ${sec===s.section?'selected':''}>${sec}</option>`).join('')}
            </select></td>
          </tr>`).join('')}
          </tbody></table>
          ${list.length===0 ? `<div class="empty-state"><b>No active students in this class</b></div>` : ``}
        </div>
        ${canSub('promo_section','promotransfer','edit') ? `<button class="btn btn-primary" style="margin-top:16px;" onclick="applyChangeSection()">${isAdmin ? 'Change Section for Selected Students' : 'Submit for Admin Approval'}</button>` : ''}
      `;
    }else{
      body.innerHTML = `
        <div class="breadcrumb"><a onclick="backToPTGrid()">All Classes</a> &nbsp;/&nbsp; ${ptClass}</div>
        <div class="form-grid" style="max-width:480px; margin-bottom:14px;">
          <div class="f-field"><label>Transfer Date</label><input type="date" id="ptTransferDate" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="f-field full"><label>Reason (optional)</label><input type="text" id="ptTransferReason" placeholder="e.g. Relocation to another city"></div>
        </div>
        ${explanationBlock}
        <div style="margin-bottom:12px;"><button class="btn btn-ghost btn-sm" onclick="ptSelectAll(true)">Select All</button> <button class="btn btn-ghost btn-sm" onclick="ptSelectAll(false)">Clear</button></div>
        <div class="table-wrap">
          <table><thead><tr><th></th><th>Student</th><th>Section</th></tr></thead>
          <tbody>
          ${list.map(s => `<tr><td><input type="checkbox" class="pt-student-check" value="${s.id}"></td><td class="name-cell">${s.firstName} ${s.lastName}</td><td><span class="pill">${s.section}</span></td></tr>`).join('')}
          </tbody></table>
          ${list.length===0 ? `<div class="empty-state"><b>No active students in this class</b></div>` : ``}
        </div>
        ${canSub('promo_transfer','promotransfer','edit') ? `<button class="btn btn-primary" style="margin-top:16px;" onclick="applyTransfers()">${isAdmin ? 'Transfer Selected Students' : 'Submit for Admin Approval'}</button>` : ''}
      `;
    }
  }
  const CARRYFORWARD_LABELS = { fee:'Fee (Carried Forward)', bus:'Bus Fee (Carried Forward)', stock:'Stock (Carried Forward)', hostel:'Hostel (Carried Forward)', previous:'Previous Year Dues' };
  async function applyPromotions(){
    const selected = Array.from(document.querySelectorAll('.pt-student-check:checked')).map(c => c.value);
    if(selected.length === 0){ showToast('Select at least one student.'); return; }
    const payloadStudents = selected.map(id => {
      const sel = document.querySelector(`.pt-target-class[data-student="${id}"]`);
      const cfSel = document.querySelector(`.pt-carryforward-type[data-student="${id}"]`);
      return { studentId:id, target: sel ? sel.value : '', carryForwardType: cfSel ? cfSel.value : '', carryForwardDue: cfSel ? Number(cfSel.dataset.due)||0 : 0 };
    }).filter(p => p.target);
    if(payloadStudents.length === 0){ showToast('Select a target class for at least one student.'); return; }
    const carryForwardTotal = payloadStudents.reduce((sum,p) => sum + (p.carryForwardType ? p.carryForwardDue : 0), 0);

    if(currentUser.role !== 'Admin'){
      const explanation = document.getElementById('ptExplanation').value.trim();
      if(!explanation){ showToast('Enter an explanation before submitting for approval.'); return; }
      if(!await showConfirmDialog(`Submit this promotion request for ${payloadStudents.length} student(s) to Admin for approval?`)) return;
      pendingApprovals.push({
        id: 'appr_'+Date.now(), type:'promote', requestedBy: currentUser.name, requestedByRole: currentUser.role, requestedByUserId: currentUser.id,
        requestDate: new Date().toISOString().slice(0,10), explanation, payload: payloadStudents, status:'Pending',
      });
      await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
      renderPromoTransferBody();
      showToast('Submitted for Admin approval.', 'burst');
      return;
    }

    const confirmMsg = carryForwardTotal > 0
      ? `Apply promotion for ${payloadStudents.length} selected student(s)? ${fmtMoney(carryForwardTotal)} in outstanding dues will be carried forward into the new class ledger.`
      : `Apply promotion for ${payloadStudents.length} selected student(s)?`;
    if(!await showConfirmDialog(confirmMsg)) return;
    const result = await executePromotions(payloadStudents);
    showToast(`${result.promotedCount} student(s) promoted${result.graduatedCount ? ', '+result.graduatedCount+' graduated' : ''}${result.carriedCount ? ', '+result.carriedCount+' due(s) carried forward' : ''}.`);
  }
  async function executePromotions(payloadStudents){
    // Locks each promoted student's existing payments to their old class —
    // needs the real `payments` array loaded, not an empty placeholder,
    // regardless of which of this function's 3 call sites got here.
    await ensureDataLoaded('payments', loadPaymentsData);
    let graduatedCount = 0, promotedCount = 0, carriedCount = 0;
    let extraFeesChanged = false, paymentsChanged = false;
    payloadStudents.forEach(p => {
      const s = students.find(x => x.id === p.studentId);
      if(!s) return;
      if(p.carryForwardType && p.carryForwardDue > 0){
        studentExtraFees.push({ id:'sef_'+Date.now()+'_'+p.studentId, studentId:p.studentId, name: CARRYFORWARD_LABELS[p.carryForwardType], amount: p.carryForwardDue, paid:false, date:new Date().toISOString().slice(0,10) });
        extraFeesChanged = true;
        carriedCount++;
      }
      // Lock this student's existing payments to their pre-promotion class, so they're never miscounted against the new class's fee.
      payments.forEach(pay => {
        if(pay.studentId === p.studentId && !pay.classAtPayment){ pay.classAtPayment = s.className; paymentsChanged = true; }
      });
      if(p.target === '__graduate__'){ s.status = 'Inactive'; graduatedCount++; }
      else { s.className = p.target; promotedCount++; }
    });
    await persist();
    if(extraFeesChanged) await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    if(paymentsChanged) await storageSet(PAYMENTS_KEY, payments);
    renderDashboard();
    renderPromoTransferBody();
    return { graduatedCount, promotedCount, carriedCount };
  }
  async function applyTransfers(){
    const selected = Array.from(document.querySelectorAll('.pt-student-check:checked')).map(c => c.value);
    if(selected.length === 0){ showToast('Select at least one student.'); return; }
    const date = document.getElementById('ptTransferDate').value;
    const reason = document.getElementById('ptTransferReason').value.trim();

    if(currentUser.role !== 'Admin'){
      const explanation = document.getElementById('ptExplanation').value.trim();
      if(!explanation){ showToast('Enter an explanation before submitting for approval.'); return; }
      if(!await showConfirmDialog(`Submit this transfer request for ${selected.length} student(s) to Admin for approval?`)) return;
      pendingApprovals.push({
        id: 'appr_'+Date.now(), type:'transfer', requestedBy: currentUser.name, requestedByRole: currentUser.role, requestedByUserId: currentUser.id,
        requestDate: new Date().toISOString().slice(0,10), explanation, payload: { studentIds: selected, date, reason }, status:'Pending',
      });
      await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
      renderPromoTransferBody();
      showToast('Submitted for Admin approval.', 'burst');
      return;
    }

    if(!await showConfirmDialog(`Mark ${selected.length} selected student(s) as Transferred?`)) return;
    await executeTransfers(selected, date, reason);
    showToast(`${selected.length} student(s) marked as Transferred.`);
  }
  async function executeTransfers(studentIds, date, reason){
    studentIds.forEach(id => {
      const s = students.find(x => x.id === id);
      if(!s) return;
      s.status = 'Transferred';
      s.transferDate = date;
      s.transferReason = reason;
    });
    await persist();
    renderDashboard();
    renderPromoTransferBody();
  }

  // Moving a student between sections within the same class — see the
  // "Change Section" tab's own comment above for why this exists
  // separately from Promote (changes class) and Transfer (marks a student
  // as having left the school). Only ever changes `section`; status,
  // admission number, fees and every other field are untouched.
  async function applyChangeSection(){
    const selected = Array.from(document.querySelectorAll('.pt-student-check:checked')).map(c => c.value);
    if(selected.length === 0){ showToast('Select at least one student.'); return; }
    const changes = selected.map(id => {
      const sel = document.querySelector(`.pt-target-section[data-student="${id}"]`);
      return { studentId:id, target: sel ? sel.value : '' };
    }).filter(c => {
      const s = students.find(x => x.id === c.studentId);
      return s && c.target && c.target !== s.section;
    });
    if(changes.length === 0){ showToast('Pick a different section for at least one selected student.'); return; }

    if(currentUser.role !== 'Admin'){
      const explanation = document.getElementById('ptExplanation').value.trim();
      if(!explanation){ showToast('Enter an explanation before submitting for approval.'); return; }
      if(!await showConfirmDialog(`Submit this section change for ${changes.length} student(s) to Admin for approval?`)) return;
      pendingApprovals.push({
        id: 'appr_'+Date.now(), type:'section', requestedBy: currentUser.name, requestedByRole: currentUser.role, requestedByUserId: currentUser.id,
        requestDate: new Date().toISOString().slice(0,10), explanation, payload: { changes }, status:'Pending',
      });
      await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
      renderPromoTransferBody();
      showToast('Submitted for Admin approval.', 'burst');
      return;
    }

    if(!await showConfirmDialog(`Move ${changes.length} student(s) to their selected section? This only changes their section — nothing else about their record is affected.`)) return;
    await executeChangeSection(changes);
    showToast(`${changes.length} student(s) moved to their new section.`);
  }
  async function executeChangeSection(changes){
    changes.forEach(({ studentId, target }) => {
      const s = students.find(x => x.id === studentId);
      if(!s) return;
      s.section = target;
    });
    await persist();
    renderDashboard();
    renderPromoTransferBody();
  }

  /* --- Approvals: promotions/transfers submitted by non-Admin roles await Admin sign-off --- */
  function renderApprovalsTab(body){
    const isAdmin = currentUser.role === 'Admin';
    const list = pendingApprovals.slice().sort((a,b) => b.id.localeCompare(a.id));
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">Promotions, section changes, and transfers submitted by non-Admin roles land here first — nothing is applied until Admin approves it.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Type</th><th>Requested By</th><th>Date</th><th>Explanation</th><th>Details</th><th>Status</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
        <tbody>
        ${list.map(a => `<tr>
          <td>${a.type==='promote' ? 'Promotion' : a.type==='section' ? 'Change Section' : 'Transfer'}</td>
          <td>${a.requestedBy} <span class="pill" style="font-size:0.62rem;">${a.requestedByRole}</span></td>
          <td>${a.requestDate}</td>
          <td style="max-width:220px;">${a.explanation}</td>
          <td style="max-width:260px;">${approvalDetailSummary(a)}</td>
          <td>${a.status==='Pending' ? '<span class="balance-tag due">Pending</span>' : a.status==='Approved' ? '<span class="pill">Approved</span>' : '<span class="balance-tag due">Rejected</span>'}</td>
          ${isAdmin ? `<td>${a.status==='Pending' ? `<button class="btn-edit-text" onclick="approveRequest('${a.id}')">Approve</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="rejectRequest('${a.id}')">Reject</button>` : ''}</td>` : ''}
        </tr>`).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No requests yet</b></div>` : ``}
      </div>
    `;
  }
  function approvalDetailSummary(a){
    if(a.type === 'promote'){
      return a.payload.map(p => { const s = students.find(x=>x.id===p.studentId); return s ? `${s.firstName} ${s.lastName} → ${p.target==='__graduate__'?'Graduate':p.target}` : ''; }).filter(Boolean).join(', ');
    }
    if(a.type === 'section'){
      return a.payload.changes.map(c => { const s = students.find(x=>x.id===c.studentId); return s ? `${s.firstName} ${s.lastName} → Section ${c.target}` : ''; }).filter(Boolean).join(', ');
    }
    const names = a.payload.studentIds.map(id => { const s = students.find(x=>x.id===id); return s ? s.firstName+' '+s.lastName : ''; }).filter(Boolean).join(', ');
    return names + (a.payload.reason ? ' — '+a.payload.reason : '');
  }
  // Every approval flow that lives purely as a client-side KV record
  // (promotion/transfer/section requests, inventory change requests, fee
  // discount requests — see PENDING_APPROVALS_KEY/STUDENT_DISCOUNTS_KEY) has
  // no server-side hook of its own to fire a push from, unlike Staff Leave
  // (handled natively in handleStaffLeaveRequests) or Deletion Requests
  // (handled natively in handleDeletionRequests). This is the one shared
  // call site for all of them: fire-and-forget, exactly like every other
  // notify* call in this app — a slow or failing push must never block the
  // Admin's own decision from completing, so this never awaits the caller
  // and swallows its own errors after logging them.
  function notifyRequesterOfDecision(userId, title, body, tag){
    if(!userId) return; // older records saved before this feature has no id to notify — nothing to do
    fetch('/api/notify-user', {
      method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()},
      body: JSON.stringify({ userId, title, body, tag, url:'/' }),
    }).catch(err => console.error('notify-user failed:', err));
  }
  async function approveRequest(id){
    const a = pendingApprovals.find(x => x.id === id);
    if(!a) return;
    if(!await showConfirmDialog('Approve this request? It will be applied immediately.')) return;
    if(a.type === 'promote') await executePromotions(a.payload);
    else if(a.type === 'section') await executeChangeSection(a.payload.changes);
    else await executeTransfers(a.payload.studentIds, a.payload.date, a.payload.reason);
    a.status = 'Approved';
    await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
    renderPromoTransferBody();
    showToast('Approved and applied.', 'burst');
    const typeLabel = a.type === 'promote' ? 'Promotion' : a.type === 'section' ? 'Section change' : 'Transfer';
    notifyRequesterOfDecision(a.requestedByUserId, `${typeLabel} request approved`, `${currentUser.name} approved your ${typeLabel.toLowerCase()} request and it's been applied.`, 'approval-decision');
  }
  async function rejectRequest(id){
    const a = pendingApprovals.find(x => x.id === id);
    if(!a) return;
    if(!await showConfirmDialog('Reject this request? It will not be applied.')) return;
    a.status = 'Rejected';
    await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
    renderPromoTransferBody();
    showToast('Request rejected.', 'burst');
    const typeLabel = a.type === 'promote' ? 'Promotion' : a.type === 'section' ? 'Section change' : 'Transfer';
    notifyRequesterOfDecision(a.requestedByUserId, `${typeLabel} request rejected`, `${currentUser.name} rejected your ${typeLabel.toLowerCase()} request.`, 'approval-decision');
  }

  function renderPromotionsTab(body){
    const rows = CLASS_LEVELS.map((c,idx) => {
      const count = students.filter(s => s.className===c && isActive(s)).length;
      const next = CLASS_LEVELS[idx+1];
      const label = next ? `Promote to ${next}` : `Mark as Graduated`;
      return `
        <tr>
          <td class="name-cell">${c}</td>
          <td>${count} active student${count===1?'':'s'}</td>
          <td><button class="btn btn-ghost btn-sm" ${count===0?'disabled':''} onclick="promoteClass('${c}')">${label}</button></td>
        </tr>
      `;
    }).join('');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">
        At year-end, promote every active student in a class to the next class (both sections move together, Section stays the same). 10th Class students are marked <b>Graduated</b> (status set to Inactive) instead of being moved further.
      </p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Class</th><th>Students</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  async function promoteClass(cls){
    const idx = CLASS_LEVELS.indexOf(cls);
    const next = CLASS_LEVELS[idx+1];
    const affected = students.filter(s => s.className===cls && isActive(s));
    if(affected.length===0) return;
    const msg = next
      ? `Promote ${affected.length} student(s) from ${cls} to ${next}?`
      : `Mark ${affected.length} student(s) in ${cls} as Graduated?`;
    if(!await showConfirmDialog(msg)) return;

    // Routed through the same executePromotions() engine as Promotion & Transfer,
    // so this whole-class shortcut also locks each student's existing payments to
    // their pre-promotion class (classAtPayment) instead of silently letting them
    // get miscounted against the new class's fee structure.
    const payload = affected.map(s => ({ studentId: s.id, target: next ? next : '__graduate__' }));
    await executePromotions(payload);
    renderAdmissionsBody();
    renderPromotionsTab(document.getElementById('promotionsBody'));
    showToast(next ? `Promoted to ${next}.` : 'Marked as Graduated.');
  }

  function nextAdmissionNo(){
    const year = new Date().getFullYear();
    const count = students.length + 1;
    return "RGV" + year + "-" + String(count).padStart(3,'0');
  }





  /* ===== ADMISSIONS VIEW STATE ===== */
  