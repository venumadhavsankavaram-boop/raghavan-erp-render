  async function saveAcctBudget(){
    const label = document.getElementById('budgetLabel').value.trim();
    const startDate = document.getElementById('budgetStart').value;
    const endDate = document.getElementById('budgetEnd').value;
    const accountKey = document.getElementById('budgetAccount').value;
    const budgetedAmount = Number(document.getElementById('budgetAmount').value) || 0;
    if(!label){ showToast('Enter a label.'); return; }
    if(!startDate || !endDate){ showToast('Set both start and end dates.'); return; }
    if(!accountKey){ showToast('Select an account.'); return; }
    if(budgetedAmount <= 0){ showToast('Enter a budgeted amount.'); return; }
    acctBudgets.push({ id:'budget_'+Date.now(), label, startDate, endDate, accountKey, budgetedAmount });
    await storageSet(ACCT_BUDGETS_KEY, acctBudgets);
    showToast('Budget line added.', 'burst');
    renderAcctBudgetTab(document.getElementById('accountingBody'));
  }
  async function deleteAcctBudget(id){
    if(!await showConfirmDialog('Delete this budget line?')) return;
    acctBudgets = acctBudgets.filter(x => x.id !== id);
    await storageSet(ACCT_BUDGETS_KEY, acctBudgets);
    showToast('Budget line deleted.', 'burst');
    renderAcctBudgetTab(document.getElementById('accountingBody'));
  }

  const HOSTEL_TAB_PERM_KEYS = { rooms:'hostel_rooms', allot:'hostel_allot', roster:'hostel_roster' };
  function initHostelView(){
    const accessibleTabs = Object.keys(HOSTEL_TAB_PERM_KEYS).filter(t => getHostelTabAccess(currentUser.role, HOSTEL_TAB_PERM_KEYS[t]));
    Object.keys(HOSTEL_TAB_PERM_KEYS).forEach(t => {
      const btn = document.getElementById('hstab-'+t);
      if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none';
    });
    if(!accessibleTabs.includes(hostelTab)) hostelTab = accessibleTabs[0] || 'rooms';
    switchHostelTab(hostelTab);
  }
  function switchHostelTab(tab){
    hostelTab = tab;
    ['rooms','allot','roster'].forEach(t => {
      const btn = document.getElementById('hstab-'+t);
      if(btn) btn.classList.toggle('active', t===tab);
    });
    hsRoomView = 'list';
    renderHostelBody();
  }
  function renderHostelBody(){
    const body = document.getElementById('hostelBody');
    if(!body) return;
    if(!getHostelTabAccess(currentUser.role, HOSTEL_TAB_PERM_KEYS[hostelTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(hostelTab === 'rooms') return hsRoomView==='edit' ? renderRoomEditor(body) : renderRoomsList(body);
    if(hostelTab === 'allot') return renderHostelAllotTab(body);
    if(hostelTab === 'roster') return renderRoomRosterTab(body);
  }
  function hostelOccupants(roomId){
    return students.filter(s => isActive(s) && s.isBoarder==='Yes' && s.hostelRoomId===roomId);
  }
  function roomAvailableBeds(room){
    return Math.max(room.capacity - hostelOccupants(room.id).length, 0);
  }

  /* --- Rooms --- */
  function renderRoomsList(body){
    const canCreate = canSub('hostel_rooms','hostel','create');
    const canEdit = canSub('hostel_rooms','hostel','edit');
    const canDelete = canSub('hostel_rooms','hostel','delete');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">Each room has its own type, bed capacity, and fee — allot a student and their hostel fee is set to that room's rate immediately.</p>
      ${canCreate ? `<button class="btn btn-primary btn-sm" style="margin-bottom:16px;" onclick="openRoomEditor()">+ Add Room</button>` : ''}
      <div class="table-wrap">
        <table><thead><tr><th>Block</th><th>Room No.</th><th>Type</th><th>Capacity</th><th>Occupied</th><th>Fee (₹/yr)</th><th>Warden</th><th></th></tr></thead>
        <tbody>
        ${hostelRooms.length ? hostelRooms.map(r => {
          const occ = hostelOccupants(r.id).length;
          const full = occ >= r.capacity;
          return `<tr>
            <td class="name-cell">${r.blockName}</td>
            <td>${r.roomNumber}</td>
            <td>${r.roomType||'—'}</td>
            <td>${r.capacity}</td>
            <td style="color:${full?'var(--magenta)':'#0f6a63'}; font-weight:700;">${occ} / ${r.capacity}</td>
            <td>${fmtMoney(r.fee)}</td>
            <td>${r.wardenName||'—'}${r.wardenPhone?` <span style="color:var(--ink-soft); font-size:0.78rem;">(${r.wardenPhone})</span>`:''}</td>
            <td>${canEdit ? `<button class="btn-edit-text" onclick="openRoomEditor('${r.id}')">Edit</button>` : ''}${(canEdit && canDelete) ? '&nbsp;·&nbsp;' : ''}${canDelete ? `<button class="btn-danger-text" onclick="deleteRoom('${r.id}')">Delete</button>` : ''}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="8"><div class="empty-state"><b>No rooms yet</b>Click "+ Add Room" to set up your first hostel room.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  function openRoomEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingRoomId = id || '';
    hsRoomView = 'edit';
    renderHostelBody();
  }
  function backToRoomsList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    hsRoomView = 'list';
    renderHostelBody();
  }
  function renderRoomEditor(body){
    const r = editingRoomId ? hostelRooms.find(x => x.id === editingRoomId) : null;
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToRoomsList()">Rooms</a> &nbsp;/&nbsp; ${r ? r.blockName+' — '+r.roomNumber : 'New Room'}</div>
      <div class="profile-card" style="max-width:520px;">
        <div class="form-grid">
          <div class="f-field"><label>Block Name <span class="required-star">*</span></label><input type="text" id="hsBlockName" value="${r?r.blockName:''}" placeholder="e.g. Boys Block A"></div>
          <div class="f-field"><label>Room Number <span class="required-star">*</span></label><input type="text" id="hsRoomNumber" value="${r?r.roomNumber:''}" placeholder="e.g. 101"></div>
          <div class="f-field">
            <label>Room Type</label>
            <select id="hsRoomType">
              ${['2-Seater','4-Seater','6-Seater','Dormitory'].map(t => `<option ${r&&r.roomType===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="f-field"><label>Bed Capacity <span class="required-star">*</span></label><input type="number" id="hsCapacity" value="${r?r.capacity:2}" min="1"></div>
          <div class="f-field"><label>Fee (₹/year) <span class="required-star">*</span></label><input type="number" id="hsFee" value="${r?r.fee:''}" min="0"></div>
          <div class="f-field"><label>Warden Name</label><input type="text" id="hsWardenName" value="${r?r.wardenName||'':''}" placeholder="e.g. Suresh Naidu"></div>
          <div class="f-field"><label>Warden Phone</label><input type="text" id="hsWardenPhone" value="${r?r.wardenPhone||'':''}" placeholder="10-digit mobile" inputmode="numeric" maxlength="10" oninput="this.value=this.value.replace(/\D/g,'').slice(0,10)"></div>
        </div>
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" onclick="backToRoomsList()">Cancel</button>
          <button class="btn btn-primary" onclick="saveRoom()">Save Room</button>
        </div>
      </div>
    `;
  }
  async function saveRoom(){
    const blockName = document.getElementById('hsBlockName').value.trim();
    const roomNumber = document.getElementById('hsRoomNumber').value.trim();
    const roomType = document.getElementById('hsRoomType').value;
    const capacity = Number(document.getElementById('hsCapacity').value) || 1;
    const fee = Number(document.getElementById('hsFee').value) || 0;
    const wardenName = document.getElementById('hsWardenName').value.trim();
    const wardenPhone = document.getElementById('hsWardenPhone').value.trim();
    if(!blockName || !roomNumber){ showToast('Enter a block name and room number.'); return; }
    if(fee <= 0){ showToast('Enter a fee for this room.'); return; }
    if(wardenPhone && !isValidMobile(wardenPhone)){ showToast('Warden Phone must be exactly 10 digits.'); return; }
    if(editingRoomId){
      const occ = hostelOccupants(editingRoomId).length;
      if(capacity < occ){ showToast(`Can't reduce capacity below ${occ} — that many students are already in this room.`); return; }
      const idx = hostelRooms.findIndex(x => x.id === editingRoomId);
      hostelRooms[idx] = { ...hostelRooms[idx], blockName, roomNumber, roomType, capacity, fee, wardenName, wardenPhone };
    }else{
      hostelRooms.push({ id:'room_'+Date.now(), blockName, roomNumber, roomType, capacity, fee, wardenName, wardenPhone });
    }
    await storageSet(HOSTEL_ROOMS_KEY, hostelRooms);
    renderDashboard();
    showToast('Room saved.', 'burst');
    backToRoomsList();
  }
  async function deleteRoom(id){
    const occ = hostelOccupants(id).length;
    if(occ > 0){ showToast(`Can't delete — ${occ} student(s) are still allotted to this room.`); return; }
    if(!await showConfirmDialog('Delete this room?')) return;
    hostelRooms = hostelRooms.filter(x => x.id !== id);
    await storageSet(HOSTEL_ROOMS_KEY, hostelRooms);
    renderRoomsList(document.getElementById('hostelBody'));
  }

  /* --- Allot Students to a room (individual / class / section) --- */
  let hsAllotRoomId = '', hsAllotScopeValue = 'student', hsAllotClassValue = '', hsAllotSectionValue = '';
  let hsAllotStudentId = '';
  function renderHostelAllotTab(body){
    if(hostelRooms.length === 0){ body.innerHTML = `<div class="empty-state"><b>No rooms yet</b>Add a room under the "Rooms" tab first.</div>`; return; }
    if(!hsAllotRoomId || !hostelRooms.find(r => r.id===hsAllotRoomId)) hsAllotRoomId = hostelRooms[0].id;
    const room = hostelRooms.find(r => r.id === hsAllotRoomId);
    const available = roomAvailableBeds(room);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">Allot a room to a student, a whole class, or a whole class-section. This sets their hostel fee to that room's rate immediately.</p>
      <div class="profile-card" style="max-width:520px;">
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field full">
            <label>Room</label>
            <select id="hsAllotRoom" onchange="hsAllotRoomId=this.value; renderHostelBody();">
              ${hostelRooms.map(r => `<option value="${r.id}" ${r.id===hsAllotRoomId?'selected':''}>${r.blockName} — Room ${r.roomNumber} (${roomAvailableBeds(r)} bed${roomAvailableBeds(r)===1?'':'s'} free)</option>`).join('')}
            </select>
          </div>
          <div class="f-field">
            <label>Scope</label>
            <select id="hsAllotScope" onchange="hsAllotScopeValue=this.value; renderHostelBody();">
              <option value="student" ${hsAllotScopeValue==='student'?'selected':''}>Individual Student</option>
              <option value="class" ${hsAllotScopeValue==='class'?'selected':''}>Whole Class</option>
              <option value="section" ${hsAllotScopeValue==='section'?'selected':''}>Whole Class &amp; Section</option>
            </select>
          </div>
        </div>
        ${renderHsScopeFields()}
        <div id="hsAllotPreview" style="margin:14px 0; font-size:0.85rem; font-weight:600; color:var(--navy);"></div>
        ${canSub('hostel_allot','hostel','edit') ? `<button class="btn btn-primary" onclick="applyHostelAllotment()">Allot Room</button>` : ''}
      </div>
    `;
    updateHsAllotPreview();
  }
  function renderHsScopeFields(){
    if(hsAllotScopeValue === 'student'){
      return `
        <div class="f-field full" style="margin-bottom:10px;">
          <label>Student</label>
          <div class="search-wrap">
            <input class="input" id="hsAllotStudentSearch" placeholder="Search student by name..." autocomplete="off" oninput="onHsAllotStudentInput()" onblur="setTimeout(hideHsAllotSuggestions,150)" onfocus="onHsAllotStudentInput()">
            <div class="search-suggestions" id="hsAllotStudentSuggestions"></div>
          </div>
          ${hsAllotStudentId ? `<span class="pill" style="margin-top:8px; display:inline-block;">${(students.find(s=>s.id===hsAllotStudentId)||{}).firstName||''} ${(students.find(s=>s.id===hsAllotStudentId)||{}).lastName||''} <button onclick="hsAllotStudentId=''; renderHostelBody();" style="background:none; border:none; color:var(--magenta); font-weight:700; cursor:pointer;">&times;</button></span>` : ''}
        </div>
      `;
    }
    return `
      <div class="form-grid" style="margin-bottom:10px;">
        <div class="f-field"><label>Class</label><select id="hsAllotClass" onchange="hsAllotClassValue=this.value; updateHsAllotPreview();"><option value="">Select class</option>${CLASS_LEVELS.map(c => `<option ${c===hsAllotClassValue?'selected':''}>${c}</option>`).join('')}</select></div>
        ${hsAllotScopeValue==='section' ? `<div class="f-field"><label>Section</label><select id="hsAllotSection" onchange="hsAllotSectionValue=this.value; updateHsAllotPreview();"><option value="">Select section</option>${SECTIONS.map(s => `<option ${s===hsAllotSectionValue?'selected':''}>${s}</option>`).join('')}</select></div>` : ''}
      </div>
    `;
  }
  let hsAllotSearchDebounce = null;
  function onHsAllotStudentInput(){
    clearTimeout(hsAllotSearchDebounce);
    hsAllotSearchDebounce = setTimeout(() => renderHsAllotSuggestions(document.getElementById('hsAllotStudentSearch').value.trim()), 150);
  }
  function renderHsAllotSuggestions(q){
    const box = document.getElementById('hsAllotStudentSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => isActive(s) && ((s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql))).slice(0,8);
    box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="hsAllotStudentId='${s.id}'; hideHsAllotSuggestions(); renderHostelBody();">
      <div class="sg-avatar">${initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('') : `<div class="sg-empty">No students match "${q}"</div>`;
    box.classList.add('open');
  }
  function hideHsAllotSuggestions(){
    const box = document.getElementById('hsAllotStudentSuggestions');
    if(box) box.classList.remove('open');
  }
  function hsAllotTargets(){
    if(hsAllotScopeValue === 'student') return hsAllotStudentId ? students.filter(s => s.id===hsAllotStudentId) : [];
    if(!hsAllotClassValue) return [];
    if(hsAllotScopeValue === 'class') return students.filter(s => s.className===hsAllotClassValue && isActive(s));
    if(!hsAllotSectionValue) return [];
    return students.filter(s => s.className===hsAllotClassValue && s.section===hsAllotSectionValue && isActive(s));
  }
  function updateHsAllotPreview(){
    const box = document.getElementById('hsAllotPreview');
    if(!box) return;
    const room = hostelRooms.find(r => r.id === hsAllotRoomId);
    const targets = hsAllotTargets().filter(s => s.hostelRoomId !== room.id); // already-in-this-room students don't need a bed
    if(!room || targets.length === 0){ box.innerHTML = ''; return; }
    const available = roomAvailableBeds(room);
    const enough = targets.length <= available;
    box.innerHTML = `${targets.length} student${targets.length===1?'':'s'} → <b>${room.blockName}, Room ${room.roomNumber}</b> at <b>${fmtMoney(room.fee)}</b> each &nbsp;·&nbsp; ${enough ? `<span style="color:#0f6a63;">✓ ${available} bed${available===1?'':'s'} free</span>` : `<span style="color:var(--magenta);">⚠ Only ${available} bed${available===1?'':'s'} free — not enough</span>`}`;
  }
  async function applyHostelAllotment(){
    const room = hostelRooms.find(r => r.id === hsAllotRoomId);
    const targets = hsAllotTargets();
    if(!room){ showToast('Select a room.'); return; }
    if(targets.length === 0){ showToast('Choose who to allot this to.'); return; }
    const available = roomAvailableBeds(room);
    if(targets.length > available){ showToast(`Not enough beds — only ${available} free, ${targets.length} needed.`); return; }
    if(!await showConfirmDialog(`Allot ${targets.length} student(s) to ${room.blockName} — Room ${room.roomNumber} (${fmtMoney(room.fee)} each)?`)) return;
    targets.forEach(s => {
      s.isBoarder = 'Yes';
      s.hostelRoomId = room.id;
    });
    await persist();
    renderDashboard();
    hsAllotStudentId = '';
    renderHostelBody();
    showToast(`${targets.length} student(s) allotted to hostel.`);
  }

  /* --- Room Roster --- */
  function renderRoomRosterTab(body){
    if(hostelRooms.length === 0){ body.innerHTML = `<div class="empty-state"><b>No rooms yet</b>Add a room under the "Rooms" tab first.</div>`; return; }
    const totalOccupants = hostelRooms.reduce((sum,r) => sum + hostelOccupants(r.id).length, 0);
    const totalCapacity = hostelRooms.reduce((sum,r) => sum + r.capacity, 0);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px;"><b>${totalOccupants}</b> of <b>${totalCapacity}</b> beds filled across ${hostelRooms.length} room${hostelRooms.length===1?'':'s'}.</p>
      ${hostelRooms.map(r => {
        const occupants = hostelOccupants(r.id);
        return `
        <div class="dash-section-title"><div><h3>${r.blockName} — Room ${r.roomNumber} <span style="font-weight:400; color:var(--ink-soft); font-size:0.8rem;">— ${r.roomType||''} · ${occupants.length}/${r.capacity} beds · ${fmtMoney(r.fee)}${r.wardenName?' · Warden: '+r.wardenName:''}</span></h3></div></div>
        <div class="table-wrap" style="margin-bottom:24px;">
          <table><thead><tr><th>Student</th><th>Admission No</th><th>Class</th><th>Section</th><th></th></tr></thead>
          <tbody>
          ${occupants.length ? occupants.map(s => `<tr><td class="name-cell">${s.firstName} ${s.lastName}</td><td>${s.admissionNo}</td><td>${s.className}</td><td>${s.section}</td><td>${currentUser.role==='Admin' ? `<button class="btn-danger-text" onclick="removeStudentFromHostel('${s.id}')">Remove from Room</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><b>No students in this room yet</b></div></td></tr>`}
          </tbody></table>
        </div>
      `;
      }).join('')}
    `;
  }
  // Admin-only un-assignment for a wrongly-allotted hostel student. Bed
  // occupancy is always computed live from s.isBoarder/s.hostelRoomId (see
  // hostelOccupants above), so there's no separate counter to decrement —
  // clearing these two fields and persisting is the whole fix, freeing the
  // bed immediately for re-allotment. Hostel Fee already charged simply
  // stops accruing further (computeStudentFinance only counts it while
  // isBoarder==='Yes'); any amount already collected is untouched here —
  // use Void/Refund on that specific payment (Payment History) if it needs
  // to be reversed too.
  async function removeStudentFromHostel(studentId){
    if(currentUser.role !== 'Admin'){ showToast('Only Admin can remove a student from a room.'); return; }
    // Must see the real payment history before deciding it's safe to
    // remove — an unloaded `payments` array would wrongly allow removal
    // even when a Hostel Fee payment already exists.
    await ensureDataLoaded('payments', loadPaymentsData);
    const s = students.find(x => x.id === studentId);
    if(!s) return;
    // Same guard as Bus Fee/Extra Fee: don't let a Hostel Fee payment already
    // collected silently fall out of the ledger just because the room
    // assignment (the thing that makes it "expected") gets cleared.
    const paidHostel = payments.filter(p => p.studentId === studentId && p.category === 'hostel' && !p.voided).reduce((sum,p) => sum + (Number(p.amount)||0), 0);
    if(paidHostel > 0){
      showToast(`Can't remove — ${fmtMoney(paidHostel)} has already been collected as Hostel Fee for this student. Void or Refund that payment first (Fee ledger → Payment History), then remove them from the room.`);
      return;
    }
    if(!await showConfirmDialog(`Remove ${s.firstName} ${s.lastName} from their hostel room?`)) return;
    s.isBoarder = 'No';
    s.hostelRoomId = '';
    await persist();
    renderDashboard();
    renderHostelBody();
    showToast('Removed from room.', 'burst');
  }

  const LIB_TAB_PERM_KEYS = { catalog:'library_catalog', issue:'library_issuereturn', overdue:'library_overdue', settings:'library_settings' };
  function initLibraryView(){
    const accessibleTabs = Object.keys(LIB_TAB_PERM_KEYS).filter(t => getLibraryTabAccess(currentUser.role, LIB_TAB_PERM_KEYS[t]));
    Object.keys(LIB_TAB_PERM_KEYS).forEach(t => {
      const btn = document.getElementById('libtab-'+t);
      if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none';
    });
    if(!accessibleTabs.includes(libraryTab)) libraryTab = accessibleTabs[0] || 'catalog';
    switchLibraryTab(libraryTab);
  }
  function switchLibraryTab(tab){
    libraryTab = tab;
    ['catalog','issue','overdue','settings'].forEach(t => {
      const btn = document.getElementById('libtab-'+t);
      if(btn) btn.classList.toggle('active', t===tab);
    });
    libCatalogView = 'list';
    renderLibraryBody();
  }
  function renderLibraryBody(){
    const body = document.getElementById('libraryBody');
    if(!body) return;
    if(!getLibraryTabAccess(currentUser.role, LIB_TAB_PERM_KEYS[libraryTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(libraryTab === 'catalog') return libCatalogView==='edit' ? renderBookEditor(body) : renderCatalogList(body);
    if(libraryTab === 'issue') return renderIssueReturnTab(body);
    if(libraryTab === 'overdue') return renderOverdueTab(body);
    if(libraryTab === 'settings') return renderLibrarySettingsTab(body);
  }

  /* --- Catalog --- */
  function renderCatalogList(body){
    const q = libCatalogSearch.toLowerCase();
    const filtered = libraryBooks.filter(b => !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || (b.isbn||'').toLowerCase().includes(q));
    body.innerHTML = `
      <div style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">
        <input class="input" style="max-width:280px;" placeholder="Search title, author, ISBN..." value="${libCatalogSearch}" oninput="libCatalogSearch=this.value; renderCatalogList(document.getElementById('libraryBody'));">
        ${canSub('library_catalog','library','create') ? `<button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="openBookEditor()">+ Add Book</button>` : ''}
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Title</th><th>Author</th><th>Category</th><th>ISBN</th><th>Total</th><th>Available</th><th>Shelf</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${filtered.length ? filtered.map(b => {
          const out = b.availableCopies <= 0;
          return `<tr>
            <td class="name-cell">${b.title}</td>
            <td>${b.author}</td>
            <td>${b.category||'—'}</td>
            <td>${b.isbn||'—'}</td>
            <td>${b.totalCopies}</td>
            <td style="color:${out?'var(--magenta)':'#0f6a63'}; font-weight:700;">${b.availableCopies}</td>
            <td>${b.shelfLocation||'—'}</td>
            <td>${out?`<span class="balance-tag due">All Issued</span>`:`<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Available</span>`}</td>
            <td>${canSub('library_catalog','library','edit') ? `<button class="btn-edit-text" onclick="openBookEditor('${b.id}')">Edit</button>` : ''}${(canSub('library_catalog','library','edit') && canSub('library_catalog','library','delete')) ? '&nbsp;·&nbsp;' : ''}${canSub('library_catalog','library','delete') ? `<button class="btn-danger-text" onclick="deleteBook('${b.id}')">Delete</button>` : ''}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="9"><div class="empty-state"><b>No books yet${libCatalogSearch?' match your search':''}</b>${libCatalogSearch?'':'Click "+ Add Book" to add your first title.'}</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  function openBookEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingBookId = id || '';
    libCatalogView = 'edit';
    renderLibraryBody();
  }
  function backToCatalogList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    libCatalogView = 'list';
    renderLibraryBody();
  }
  function renderBookEditor(body){
    const b = editingBookId ? libraryBooks.find(x => x.id===editingBookId) : null;
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToCatalogList()">Catalog</a> &nbsp;/&nbsp; ${b?b.title:'New Book'}</div>
      <div class="profile-card" style="max-width:520px;">
        <div class="form-grid">
          <div class="f-field full"><label>Title <span class="required-star">*</span></label><input type="text" id="libBookTitle" value="${b?b.title:''}" placeholder="e.g. A Brief History of Time"></div>
          <div class="f-field"><label>Author <span class="required-star">*</span></label><input type="text" id="libBookAuthor" value="${b?b.author:''}" placeholder="e.g. Stephen Hawking"></div>
          <div class="f-field"><label>Category</label><input type="text" id="libBookCategory" value="${b?b.category||'':''}" placeholder="e.g. Science"></div>
          <div class="f-field"><label>ISBN</label><input type="text" id="libBookIsbn" value="${b?b.isbn||'':''}" placeholder="e.g. 978-0553380163"></div>
          <div class="f-field"><label>Publisher</label><input type="text" id="libBookPublisher" value="${b?b.publisher||'':''}" placeholder="e.g. Bantam Books"></div>
          <div class="f-field"><label>Shelf / Location</label><input type="text" id="libBookShelf" value="${b?b.shelfLocation||'':''}" placeholder="e.g. Rack B, Row 3"></div>
          <div class="f-field"><label>Total Copies <span class="required-star">*</span></label><input type="number" id="libBookTotal" value="${b?b.totalCopies:1}" min="1"></div>
        </div>
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" onclick="backToCatalogList()">Cancel</button>
          <button class="btn btn-primary" onclick="saveBook()">Save Book</button>
        </div>
      </div>
    `;
  }
  async function saveBook(){
    const title = document.getElementById('libBookTitle').value.trim();
    const author = document.getElementById('libBookAuthor').value.trim();
    const category = document.getElementById('libBookCategory').value.trim();
    const isbn = document.getElementById('libBookIsbn').value.trim();
    const publisher = document.getElementById('libBookPublisher').value.trim();
    const shelfLocation = document.getElementById('libBookShelf').value.trim();
    const totalCopies = Number(document.getElementById('libBookTotal').value) || 1;
    if(!title || !author){ showToast('Enter a title and author.'); return; }
    if(editingBookId){
      const idx = libraryBooks.findIndex(x => x.id===editingBookId);
      const issuedCount = libraryIssues.filter(i => i.bookId===editingBookId && i.status==='Issued').length;
      const availableCopies = Math.max(totalCopies - issuedCount, 0);
      libraryBooks[idx] = { ...libraryBooks[idx], title, author, category, isbn, publisher, shelfLocation, totalCopies, availableCopies };
    }else{
      libraryBooks.push({ id:'book_'+Date.now(), title, author, category, isbn, publisher, shelfLocation, totalCopies, availableCopies:totalCopies, addedDate:new Date().toISOString().slice(0,10) });
    }
    await storageSet(LIBRARY_BOOKS_KEY, libraryBooks);
    showToast('Book saved.', 'burst');
    backToCatalogList();
  }
  async function deleteBook(id){
    const issuedCount = libraryIssues.filter(i => i.bookId===id && i.status==='Issued').length;
    if(issuedCount > 0){ showToast(`Can't delete — ${issuedCount} copy/copies still issued.`); return; }
    if(!await showConfirmDialog('Delete this book?')) return;
    libraryBooks = libraryBooks.filter(x => x.id !== id);
    await storageSet(LIBRARY_BOOKS_KEY, libraryBooks);
    renderCatalogList(document.getElementById('libraryBody'));
  }

  /* --- Issue & Return --- */
  let libIssueBookId = '', libIssueBorrowerType = 'Student', libIssueBorrowerId = '', libIssueSearch = '';
  function libBorrowerDisplayName(){
    if(libIssueBorrowerType === 'Student'){
      const s = students.find(x => x.id===libIssueBorrowerId);
      return s ? `${s.firstName} ${s.lastName} — ${s.className} ${s.section}` : '';
    }
    const st = staffList.find(x => x.id===libIssueBorrowerId);
    return st ? `${st.firstName} ${st.lastName}` : '';
  }
  function renderIssueReturnTab(body){
    const canIssue = canSub('library_issuereturn','library','create');
    const canReturn = canSub('library_issuereturn','library','edit');
    const availableBooks = libraryBooks.filter(b => b.availableCopies > 0);
    const issuedList = libraryIssues.filter(i => i.status==='Issued');
    const q = libIssueSearch.toLowerCase();
    const filteredIssued = issuedList.filter(i => !q || i.bookTitle.toLowerCase().includes(q) || i.borrowerName.toLowerCase().includes(q));
    const today = new Date().toISOString().slice(0,10);
    body.innerHTML = `
      ${canIssue ? `<div class="profile-card" style="max-width:600px; margin-bottom:24px;">
        <h4>📖 Issue a Book</h4>
        <div class="form-grid" style="margin:14px 0;">
          <div class="f-field full">
            <label>Book</label>
            <select id="libIssueBook" onchange="libIssueBookId=this.value;">
              <option value="">Select a book</option>
              ${availableBooks.map(b => `<option value="${b.id}" ${b.id===libIssueBookId?'selected':''}>${b.title} — ${b.author} (${b.availableCopies} available)</option>`).join('')}
            </select>
          </div>
          <div class="f-field">
            <label>Borrower Type</label>
            <select id="libBorrowerType" onchange="libIssueBorrowerType=this.value; libIssueBorrowerId=''; renderLibraryBody();">
              <option value="Student" ${libIssueBorrowerType==='Student'?'selected':''}>Student</option>
              <option value="Staff" ${libIssueBorrowerType==='Staff'?'selected':''}>Staff</option>
            </select>
          </div>
          <div class="f-field">
            <label>Due Date</label>
            <input type="date" id="libDueDate" value="${addDaysToDate(today, librarySettings.loanPeriodDays||14)}">
          </div>
          <div class="f-field full">
            <label>${libIssueBorrowerType}</label>
            <div class="search-wrap">
              <input class="input" id="libBorrowerSearch" placeholder="Search ${libIssueBorrowerType.toLowerCase()} by name..." autocomplete="off" oninput="onLibBorrowerInput()" onblur="setTimeout(hideLibBorrowerSuggestions,150)" onfocus="onLibBorrowerInput()">
              <div class="search-suggestions" id="libBorrowerSuggestions"></div>
            </div>
            ${libIssueBorrowerId ? `<span class="pill" style="margin-top:8px; display:inline-block;">${libBorrowerDisplayName()} <button onclick="libIssueBorrowerId=''; renderLibraryBody();" style="background:none; border:none; color:var(--magenta); font-weight:700; cursor:pointer;">&times;</button></span>` : ''}
          </div>
        </div>
        <button class="btn btn-primary" onclick="issueBook()">Issue Book</button>
      </div>` : ''}

      <h4 style="margin-bottom:10px;">📗 Currently Issued (${issuedList.length})</h4>
      <input class="input" style="max-width:280px; margin-bottom:12px;" placeholder="Search issued books or borrower..." value="${libIssueSearch}" oninput="libIssueSearch=this.value; renderIssueReturnTab(document.getElementById('libraryBody'));">
      <div class="table-wrap">
        <table><thead><tr><th>Book</th><th>Borrower</th><th>Issue Date</th><th>Due Date</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${filteredIssued.length ? filteredIssued.map(i => {
          const overdue = i.dueDate < today;
          return `<tr>
            <td class="name-cell">${i.bookTitle}</td>
            <td>${i.borrowerName} <span class="pill" style="font-size:0.62rem;">${i.borrowerType}</span></td>
            <td>${i.issueDate}</td>
            <td>${i.dueDate}</td>
            <td>${overdue ? `<span class="balance-tag due">Overdue</span>` : `<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">On Time</span>`}</td>
            <td>${canReturn ? `<button class="btn-edit-text" onclick="openReturnBook('${i.id}')">Return</button>` : ''}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="6"><div class="empty-state"><b>Nothing currently issued${libIssueSearch?' match your search':''}</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  let libBorrowerSearchDebounce = null;
  function onLibBorrowerInput(){
    clearTimeout(libBorrowerSearchDebounce);
    libBorrowerSearchDebounce = setTimeout(() => renderLibBorrowerSuggestions(document.getElementById('libBorrowerSearch').value.trim()), 150);
  }
  function renderLibBorrowerSuggestions(q){
    const box = document.getElementById('libBorrowerSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    let matches = [];
    if(libIssueBorrowerType === 'Student'){
      matches = students.filter(s => isActive(s) && ((s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql))).slice(0,8);
      box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="libIssueBorrowerId='${s.id}'; hideLibBorrowerSuggestions(); renderLibraryBody();">
        <div class="sg-avatar">${initials(s)}</div>
        <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
      </div>`).join('') : `<div class="sg-empty">No students match "${q}"</div>`;
    }else{
      matches = staffList.filter(s => staffIsActive(s) && ((s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql))).slice(0,8);
      box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="libIssueBorrowerId='${s.id}'; hideLibBorrowerSuggestions(); renderLibraryBody();">
        <div class="sg-avatar">${initials(s)}</div>
        <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.designation||s.department||'Staff'}</div></div>
      </div>`).join('') : `<div class="sg-empty">No staff match "${q}"</div>`;
    }
    box.classList.add('open');
  }
  function hideLibBorrowerSuggestions(){
    const box = document.getElementById('libBorrowerSuggestions');
    if(box) box.classList.remove('open');
  }
  async function issueBook(){
    const book = libraryBooks.find(b => b.id===libIssueBookId);
    if(!book){ showToast('Select a book.'); return; }
    if(!libIssueBorrowerId){ showToast('Select a borrower.'); return; }
    const dueDate = document.getElementById('libDueDate').value;
    if(!dueDate){ showToast('Set a due date.'); return; }
    if(book.availableCopies <= 0){ showToast('No copies available.'); return; }
    const borrowerName = libBorrowerDisplayName().split(' — ')[0];
    libraryIssues.push({
      id:'issue_'+Date.now(), bookId:book.id, bookTitle:book.title,
      borrowerType:libIssueBorrowerType, borrowerId:libIssueBorrowerId, borrowerName,
      issueDate:new Date().toISOString().slice(0,10), dueDate, returnDate:'', status:'Issued', fineAmount:0,
    });
    book.availableCopies -= 1;
    await storageSet(LIBRARY_BOOKS_KEY, libraryBooks);
    await storageSet(LIBRARY_ISSUES_KEY, libraryIssues);
    libIssueBookId = ''; libIssueBorrowerId = '';
    renderLibraryBody();
    showToast(`"${book.title}" issued to ${borrowerName}.`);
  }
  async function openReturnBook(issueId){
    const issue = libraryIssues.find(i => i.id===issueId);
    if(!issue) return;
    const today = new Date().toISOString().slice(0,10);
    const daysLate = Math.max(0, Math.round((new Date(today) - new Date(issue.dueDate)) / 86400000));
    const fine = daysLate * (librarySettings.finePerDay||0);
    let msg = `Return "${issue.bookTitle}" from ${issue.borrowerName}?`;
    if(fine > 0) msg += ` This is ${daysLate} day(s) late — a fine of ${fmtMoney(fine)} will be added${issue.borrowerType==='Student'?" to their fee ledger":''}.`;
    if(!await showConfirmDialog(msg)) return;
    returnBook(issueId, fine, daysLate);
  }
  async function returnBook(issueId, fine, daysLate){
    const issue = libraryIssues.find(i => i.id===issueId);
    if(!issue) return;
    issue.status = 'Returned';
    issue.returnDate = new Date().toISOString().slice(0,10);
    issue.fineAmount = fine;
    const book = libraryBooks.find(b => b.id===issue.bookId);
    if(book) book.availableCopies = Math.min(book.availableCopies+1, book.totalCopies);
    if(fine > 0 && issue.borrowerType==='Student'){
      studentExtraFees.push({ id:'sef_'+Date.now(), studentId:issue.borrowerId, name:`Library Fine — ${issue.bookTitle} (${daysLate}d late)`, amount:fine, paid:false, date:new Date().toISOString().slice(0,10) });
      await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    }
    await storageSet(LIBRARY_BOOKS_KEY, libraryBooks);
    await storageSet(LIBRARY_ISSUES_KEY, libraryIssues);
    renderDashboard();
    renderLibraryBody();
    showToast(fine>0 ? `Returned — ${fmtMoney(fine)} fine added.` : 'Returned — no fine.');
  }

  /* --- Overdue & Fines --- */
  function renderOverdueTab(body){
    const today = new Date().toISOString().slice(0,10);
    const canReturn = canSub('library_overdue','library','edit');
    const overdue = libraryIssues.filter(i => i.status==='Issued' && i.dueDate < today);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px;"><b>${overdue.length}</b> item${overdue.length===1?'':'s'} currently overdue.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Book</th><th>Borrower</th><th>Due Date</th><th>Days Overdue</th><th>Fine</th><th></th></tr></thead>
        <tbody>
        ${overdue.length ? overdue.map(i => {
          const daysLate = Math.max(0, Math.round((new Date(today) - new Date(i.dueDate)) / 86400000));
          const fine = daysLate * (librarySettings.finePerDay||0);
          return `<tr>
            <td class="name-cell">${i.bookTitle}</td>
            <td>${i.borrowerName} <span class="pill" style="font-size:0.62rem;">${i.borrowerType}</span></td>
            <td>${i.dueDate}</td>
            <td style="color:var(--magenta); font-weight:700;">${daysLate}</td>
            <td>${fmtMoney(fine)}</td>
            <td>${canReturn ? `<button class="btn-edit-text" onclick="openReturnBook('${i.id}')">Return</button>` : ''}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="6"><div class="empty-state"><b>Nothing overdue</b>All issued books are within their due date.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  /* --- Settings --- */
  function renderLibrarySettingsTab(body){
    const canEditSettings = canSub('library_settings','library','edit');
    const dis = canEditSettings ? '' : 'disabled';
    body.innerHTML = `
      <div class="profile-card" style="max-width:420px;">
        <h4>⚙️ Library Settings</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">These apply to every new book issued from now on.</p>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field"><label>Loan Period (days)</label><input type="number" id="libLoanPeriod" value="${librarySettings.loanPeriodDays||14}" min="1" ${dis}></div>
          <div class="f-field"><label>Fine per Day (₹)</label><input type="number" id="libFinePerDay" value="${librarySettings.finePerDay||0}" min="0" ${dis}></div>
        </div>
        ${canEditSettings ? `<button class="btn btn-primary" onclick="saveLibrarySettings()">Save Settings</button>` : ''}
      </div>
    `;
  }
  async function saveLibrarySettings(){
    librarySettings = { loanPeriodDays: Number(document.getElementById('libLoanPeriod').value)||14, finePerDay: Number(document.getElementById('libFinePerDay').value)||0 };
    await storageSet(LIBRARY_SETTINGS_KEY, librarySettings);
    showToast('Settings saved.', 'burst');
  }

  const TRANSPORT_TAB_PERM_KEYS = { routes:'transport_routes', assign:'transport_assign', roster:'transport_roster', buspass:'transport_buspass' };
  function initTransportView(){
    const accessibleTabs = Object.keys(TRANSPORT_TAB_PERM_KEYS).filter(t => getTransportTabAccess(currentUser.role, TRANSPORT_TAB_PERM_KEYS[t]));
    Object.keys(TRANSPORT_TAB_PERM_KEYS).forEach(t => {
      const btn = document.getElementById('trtab-'+t);
      if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none';
    });
    if(!accessibleTabs.includes(transportTab)) transportTab = accessibleTabs[0] || 'routes';
    switchTransportTab(transportTab);
  }
  function switchTransportTab(tab){
    transportTab = tab;
    ['routes','assign','roster','buspass'].forEach(t => {
      const btn = document.getElementById('trtab-'+t);
      if(btn) btn.classList.toggle('active', t===tab);
    });
    trRouteView = 'list';
    renderTransportBody();
  }
  function renderTransportBody(){
    const body = document.getElementById('transportBody');
    if(!body) return;
    if(!getTransportTabAccess(currentUser.role, TRANSPORT_TAB_PERM_KEYS[transportTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(transportTab === 'routes') return trRouteView==='edit' ? renderRouteEditor(body) : renderRoutesList(body);
    if(transportTab === 'assign') return renderTransportAssignTab(body);
    if(transportTab === 'roster') return renderRouteRosterTab(body);
    if(transportTab === 'buspass') return renderBusPassTab(body);
  }

  function studentsOnRoute(routeId){
    return students.filter(s => isActive(s) && s.needsTransport==='Yes' && s.transportRouteId===routeId);
  }
  function renderRoutesList(body){
    const canCreate = canSub('transport_routes','transport','create');
    const canEdit = canSub('transport_routes','transport','edit');
    const canDelete = canSub('transport_routes','transport','delete');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">Each route has its own bus, driver, and list of stops — every stop can carry a different fare based on distance.</p>
      ${canCreate ? `<button class="btn btn-primary btn-sm" style="margin-bottom:16px;" onclick="openRouteEditor()">+ Add Route</button>` : ''}
      <div class="table-wrap">
        <table><thead><tr><th>Route</th><th>Bus No.</th><th>Driver</th><th>Stops</th><th>Fare Range</th><th>Students</th><th></th></tr></thead>
        <tbody>
        ${transportRoutes.length ? transportRoutes.map(r => {
          const fares = r.stops.map(s => Number(s.fare)||0);
          const fareRange = fares.length ? (Math.min(...fares)===Math.max(...fares) ? fmtMoney(Math.min(...fares)) : `${fmtMoney(Math.min(...fares))} – ${fmtMoney(Math.max(...fares))}`) : '—';
          const count = studentsOnRoute(r.id).length;
          return `<tr>
            <td class="name-cell">${r.name}</td>
            <td>${r.busNumber||'—'}</td>
            <td>${r.driverName||'—'}${r.driverPhone?` <span style="color:var(--ink-soft); font-size:0.78rem;">(${r.driverPhone})</span>`:''}</td>
            <td>${r.stops.length}</td>
            <td>${fareRange}</td>
            <td>${count}</td>
            <td>${canEdit ? `<button class="btn-edit-text" onclick="openRouteEditor('${r.id}')">Edit</button>` : ''}${(canEdit && canDelete) ? '&nbsp;·&nbsp;' : ''}${canDelete ? `<button class="btn-danger-text" onclick="deleteRoute('${r.id}')">Delete</button>` : ''}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No routes yet</b>Click "+ Add Route" to set up your first bus route.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  let trEditName = '', trEditBusNumber = '', trEditDriverName = '', trEditDriverPhone = '';
  function openRouteEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingRouteId = id || '';
    const r = id ? transportRoutes.find(x => x.id === id) : null;
    trEditStops = r ? JSON.parse(JSON.stringify(r.stops)) : [];
    trEditName = r ? r.name : '';
    trEditBusNumber = r ? (r.busNumber||'') : '';
    trEditDriverName = r ? (r.driverName||'') : '';
    trEditDriverPhone = r ? (r.driverPhone||'') : '';
    trRouteView = 'edit';
    renderTransportBody();
  }
  function backToRoutesList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    trRouteView = 'list';
    renderTransportBody();
  }
  function syncTrStopsFromInputs(){
    const nameEl = document.getElementById('trRouteName');
    if(nameEl){
      trEditName = nameEl.value;
      trEditBusNumber = document.getElementById('trBusNumber').value;
      trEditDriverName = document.getElementById('trDriverName').value;
      trEditDriverPhone = document.getElementById('trDriverPhone').value;
    }
    const names = document.querySelectorAll('.tr-stop-name');
    if(names.length !== trEditStops.length) return;
    const fares = document.querySelectorAll('.tr-stop-fare');
    trEditStops = trEditStops.map((s,i) => ({ ...s, name:names[i].value.trim()||s.name, fare:Number(fares[i].value)||0 }));
  }
  function renderRouteEditor(body){
    const r = editingRouteId ? transportRoutes.find(x => x.id === editingRouteId) : null;
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToRoutesList()">Routes</a> &nbsp;/&nbsp; ${r ? r.name : 'New Route'}</div>
      <div class="profile-card" style="max-width:640px;">
        <div class="form-grid" style="margin-bottom:16px;">
          <div class="f-field full"><label>Route Name <span class="required-star">*</span></label><input type="text" id="trRouteName" value="${trEditName}" placeholder="e.g. Route 1 — Main Market Stop"></div>
          <div class="f-field"><label>Bus Number</label><input type="text" id="trBusNumber" value="${trEditBusNumber}" placeholder="e.g. AP 03 TZ 4521"></div>
          <div class="f-field"><label>Driver Name</label><input type="text" id="trDriverName" value="${trEditDriverName}" placeholder="e.g. Ramesh Kumar"></div>
          <div class="f-field"><label>Driver Phone</label><input type="text" id="trDriverPhone" value="${trEditDriverPhone}" placeholder="10-digit mobile" inputmode="numeric" maxlength="10" oninput="this.value=this.value.replace(/\D/g,'').slice(0,10)"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h4 style="margin:0;">🚏 Stops &amp; Fares</h4>
          <button class="btn btn-primary btn-sm" onclick="addTrStopRow()">+ Add Stop</button>
        </div>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Each stop can have its own fare — students pay based on which stop they're assigned to.</p>
        <div class="table-wrap" style="overflow-x:auto; margin-bottom:16px;">
          <table style="min-width:420px;"><thead><tr><th style="width:34px;">#</th><th>Stop Name</th><th>Fare (₹/year)</th><th></th></tr></thead>
          <tbody>
          ${trEditStops.map((s,i) => `<tr>
            <td>${i+1}</td>
            <td><input type="text" class="input tr-stop-name" value="${s.name}" style="width:220px;" placeholder="e.g. Main Bus Stand"></td>
            <td><input type="number" class="input tr-stop-fare" value="${s.fare}" min="0" style="width:110px;"></td>
            <td><button class="btn-danger-text" onclick="removeTrStopRow(${i})">🗑️ Delete</button></td>
          </tr>`).join('') || `<tr><td colspan="4"><div class="empty-state"><b>No stops yet</b>Click "+ Add Stop" to add the first one.</div></td></tr>`}
          </tbody></table>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-ghost" onclick="backToRoutesList()">Cancel</button>
          <button class="btn btn-primary" onclick="saveRoute()">Save Route</button>
        </div>
      </div>
    `;
  }
  function addTrStopRow(){
    syncTrStopsFromInputs();
    trEditStops.push({ id:'stop_'+Date.now(), name:'', fare:0 });
    renderRouteEditor(document.getElementById('transportBody'));
  }
  function removeTrStopRow(i){
    syncTrStopsFromInputs();
    trEditStops.splice(i,1);
    renderRouteEditor(document.getElementById('transportBody'));
  }
  async function saveRoute(){
    syncTrStopsFromInputs();
    const name = document.getElementById('trRouteName').value.trim();
    const busNumber = document.getElementById('trBusNumber').value.trim();
    const driverName = document.getElementById('trDriverName').value.trim();
    const driverPhone = document.getElementById('trDriverPhone').value.trim();
    if(!name){ showToast('Enter a route name.'); return; }
    if(trEditStops.some(s => !s.name.trim())){ showToast('Every stop needs a name.'); return; }
    if(driverPhone && !isValidMobile(driverPhone)){ showToast('Driver Phone must be exactly 10 digits.'); return; }
    const data = { name, busNumber, driverName, driverPhone, stops: trEditStops };
    if(editingRouteId){
      const idx = transportRoutes.findIndex(x => x.id === editingRouteId);
      transportRoutes[idx] = { ...transportRoutes[idx], ...data };
    }else{
      transportRoutes.push({ id:'route_'+Date.now(), ...data });
    }
    await storageSet(TRANSPORT_ROUTES_KEY, transportRoutes);
    renderDashboard();
    showToast('Route saved.', 'burst');
    backToRoutesList();
  }
  async function deleteRoute(id){
    const count = studentsOnRoute(id).length;
    if(count > 0){ showToast(`Can't delete — ${count} student(s) are still assigned to this route.`); return; }
    if(!await showConfirmDialog('Delete this route?')) return;
    transportRoutes = transportRoutes.filter(x => x.id !== id);
    await storageSet(TRANSPORT_ROUTES_KEY, transportRoutes);
    renderRoutesList(document.getElementById('transportBody'));
  }

  /* --- Assign Students to a route + stop (individual / class / section) --- */
  let trAssignRouteId = '', trAssignStopId = '', trAssignScopeValue = 'student', trAssignClassValue = '', trAssignSectionValue = '';
  let trAssignStudentId = '';
  function renderTransportAssignTab(body){
    if(transportRoutes.length === 0){ body.innerHTML = `<div class="empty-state"><b>No routes yet</b>Add a route under the "Routes" tab first.</div>`; return; }
    if(!trAssignRouteId || !transportRoutes.find(r => r.id===trAssignRouteId)) trAssignRouteId = transportRoutes[0].id;
    const route = transportRoutes.find(r => r.id === trAssignRouteId);
    if(!route.stops.find(s => s.id===trAssignStopId)) trAssignStopId = route.stops[0] ? route.stops[0].id : '';
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">Assign a route and stop to a student, a whole class, or a whole class-section. This sets their transport fee to that stop's fare immediately.</p>
      <div class="profile-card" style="max-width:520px;">
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field full">
            <label>Route</label>
            <select id="trAssignRoute" onchange="trAssignRouteId=this.value; trAssignStopId=''; renderTransportBody();">
              ${transportRoutes.map(r => `<option value="${r.id}" ${r.id===trAssignRouteId?'selected':''}>${r.name}${r.busNumber?' — '+r.busNumber:''}</option>`).join('')}
            </select>
          </div>
          <div class="f-field full">
            <label>Stop</label>
            <select id="trAssignStop" onchange="trAssignStopId=this.value; updateTrAssignPreview();">
              ${route.stops.length ? route.stops.map(s => `<option value="${s.id}" ${s.id===trAssignStopId?'selected':''}>${s.name} — ${fmtMoney(s.fare)}</option>`).join('') : `<option value="">No stops on this route</option>`}
            </select>
          </div>
          <div class="f-field">
            <label>Scope</label>
            <select id="trAssignScope" onchange="trAssignScopeValue=this.value; renderTransportBody();">
              <option value="student" ${trAssignScopeValue==='student'?'selected':''}>Individual Student</option>
              <option value="class" ${trAssignScopeValue==='class'?'selected':''}>Whole Class</option>
              <option value="section" ${trAssignScopeValue==='section'?'selected':''}>Whole Class &amp; Section</option>
            </select>
          </div>
        </div>
        ${renderTrScopeFields()}
        <div id="trAssignPreview" style="margin:14px 0; font-size:0.85rem; font-weight:600; color:var(--navy);"></div>
        ${canSub('transport_assign','transport','edit') ? `<button class="btn btn-primary" onclick="applyTransportAssignment()">Assign Transport</button>` : ''}
      </div>
    `;
    updateTrAssignPreview();
  }
  function renderTrScopeFields(){
    if(trAssignScopeValue === 'student'){
      return `
        <div class="f-field full" style="margin-bottom:10px;">
          <label>Student</label>
          <div class="search-wrap">
            <input class="input" id="trAssignStudentSearch" placeholder="Search student by name..." autocomplete="off" oninput="onTrAssignStudentInput()" onblur="setTimeout(hideTrAssignSuggestions,150)" onfocus="onTrAssignStudentInput()">
            <div class="search-suggestions" id="trAssignStudentSuggestions"></div>
          </div>
          ${trAssignStudentId ? `<span class="pill" style="margin-top:8px; display:inline-block;">${(students.find(s=>s.id===trAssignStudentId)||{}).firstName||''} ${(students.find(s=>s.id===trAssignStudentId)||{}).lastName||''} <button onclick="trAssignStudentId=''; renderTransportBody();" style="background:none; border:none; color:var(--magenta); font-weight:700; cursor:pointer;">&times;</button></span>` : ''}
        </div>
      `;
    }
    return `
      <div class="form-grid" style="margin-bottom:10px;">
        <div class="f-field"><label>Class</label><select id="trAssignClass" onchange="trAssignClassValue=this.value; updateTrAssignPreview();"><option value="">Select class</option>${CLASS_LEVELS.map(c => `<option ${c===trAssignClassValue?'selected':''}>${c}</option>`).join('')}</select></div>
        ${trAssignScopeValue==='section' ? `<div class="f-field"><label>Section</label><select id="trAssignSection" onchange="trAssignSectionValue=this.value; updateTrAssignPreview();"><option value="">Select section</option>${SECTIONS.map(s => `<option ${s===trAssignSectionValue?'selected':''}>${s}</option>`).join('')}</select></div>` : ''}
      </div>
    `;
  }
  let trAssignSearchDebounce = null;
  function onTrAssignStudentInput(){
    clearTimeout(trAssignSearchDebounce);
    trAssignSearchDebounce = setTimeout(() => renderTrAssignSuggestions(document.getElementById('trAssignStudentSearch').value.trim()), 150);
  }
  function renderTrAssignSuggestions(q){
    const box = document.getElementById('trAssignStudentSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => isActive(s) && ((s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql))).slice(0,8);
    box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="trAssignStudentId='${s.id}'; hideTrAssignSuggestions(); renderTransportBody();">
      <div class="sg-avatar">${initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('') : `<div class="sg-empty">No students match "${q}"</div>`;
    box.classList.add('open');
  }
  function hideTrAssignSuggestions(){
    const box = document.getElementById('trAssignStudentSuggestions');
    if(box) box.classList.remove('open');
  }
  function trAssignTargets(){
    if(trAssignScopeValue === 'student') return trAssignStudentId ? students.filter(s => s.id===trAssignStudentId) : [];
    if(!trAssignClassValue) return [];
    if(trAssignScopeValue === 'class') return students.filter(s => s.className===trAssignClassValue && isActive(s));
    if(!trAssignSectionValue) return [];
    return students.filter(s => s.className===trAssignClassValue && s.section===trAssignSectionValue && isActive(s));
  }
  function updateTrAssignPreview(){
    const box = document.getElementById('trAssignPreview');
    if(!box) return;
    const route = transportRoutes.find(r => r.id === trAssignRouteId);
    const stop = route ? route.stops.find(s => s.id === trAssignStopId) : null;
    const targets = trAssignTargets();
    if(!stop || targets.length === 0){ box.innerHTML = ''; return; }
    box.innerHTML = `${targets.length} student${targets.length===1?'':'s'} → <b>${route.name}, ${stop.name}</b> at <b>${fmtMoney(stop.fare)}</b> each`;
  }
  async function applyTransportAssignment(){
    const route = transportRoutes.find(r => r.id === trAssignRouteId);
    const stop = route ? route.stops.find(s => s.id === trAssignStopId) : null;
    const targets = trAssignTargets();
    if(!stop){ showToast('Select a route and stop.'); return; }
    if(targets.length === 0){ showToast('Choose who to assign this to.'); return; }
    if(!await showConfirmDialog(`Assign ${targets.length} student(s) to ${route.name} — ${stop.name} (${fmtMoney(stop.fare)} each)?`)) return;
    targets.forEach(s => {
      s.needsTransport = 'Yes';
      s.transportRouteId = route.id;
      s.transportStopId = stop.id;
    });
    await persist();
    renderDashboard();
    trAssignStudentId = '';
    renderTransportBody();
    showToast(`${targets.length} student(s) assigned to transport.`);
  }

  /* --- Route Roster: who's on which bus, grouped by stop --- */
  function renderRouteRosterTab(body){
    if(transportRoutes.length === 0){ body.innerHTML = `<div class="empty-state"><b>No routes yet</b>Add a route under the "Routes" tab first.</div>`; return; }
    body.innerHTML = `
      <div class="f-field" style="max-width:360px; margin-bottom:20px;">
        <label>Route</label>
        <select id="trRosterRoute" onchange="renderRouteRosterBody()">
          ${transportRoutes.map(r => `<option value="${r.id}">${r.name}${r.busNumber?' — '+r.busNumber:''}</option>`).join('')}
        </select>
      </div>
      <div id="trRosterBody"></div>
    `;
    renderRouteRosterBody();
  }
  function renderRouteRosterBody(){
    const routeId = document.getElementById('trRosterRoute').value;
    const route = transportRoutes.find(r => r.id === routeId);
    const body = document.getElementById('trRosterBody');
    if(!route || !body) return;
    const riders = studentsOnRoute(routeId);
    const byStop = route.stops.map(stop => ({ stop, riders: riders.filter(s => s.transportStopId === stop.id) }));
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px;"><b>${riders.length}</b> student${riders.length===1?'':'s'} on this route${route.driverName ? ` · Driver: ${route.driverName}${route.driverPhone?' ('+route.driverPhone+')':''}` : ''}${route.busNumber ? ` · Bus: ${route.busNumber}` : ''}</p>
      ${byStop.map(({stop, riders}) => `
        <div class="dash-section-title"><div><h3>${stop.name} <span style="font-weight:400; color:var(--ink-soft); font-size:0.8rem;">— ${fmtMoney(stop.fare)} · ${riders.length} student${riders.length===1?'':'s'}</span></h3></div></div>
        <div class="table-wrap" style="margin-bottom:24px;">
          <table><thead><tr><th>Student</th><th>Admission No</th><th>Class</th><th>Section</th></tr></thead>
          <tbody>
          ${riders.length ? riders.map(s => `<tr><td class="name-cell">${s.firstName} ${s.lastName}</td><td>${s.admissionNo}</td><td>${s.className}</td><td>${s.section}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No students at this stop yet</b></div></td></tr>`}
          </tbody></table>
        </div>
      `).join('')}
    `;
  }

  /* --- Bus Passes: pick a template, pick students, print several onto one A4 sheet --- */
  const BUS_PASS_TEMPLATES = {
    classic:  { label: 'Classic Replica',  wMm: 90, hMm: 58, cols: 2 },
    modern:   { label: 'Modern Card',      wMm: 93, hMm: 62, cols: 2 },
    compact:  { label: 'Compact Badge',    wMm: 86, hMm: 55, cols: 2 },
    ticket:   { label: 'Ticket Stub',      wMm: 104, hMm: 46, cols: 2 },
    inksaver: { label: 'Ink Saver (B/W)',  wMm: 90, hMm: 58, cols: 2 },
  };
  function busPassRiderPool(){
    // Only students actually on transport have a route/fare to print — same
    // population the Route Roster and fee-collection reports use.
    return students.filter(s => isActive(s) && s.needsTransport === 'Yes');
  }
  function busPassStudentInfo(s){
    const route = transportRoutes.find(r => r.id === s.transportRouteId);
    const stop = route ? route.stops.find(st => st.id === s.transportStopId) : null;
    const expected = studentBusFare(s);
    const paid = payments.filter(p => p.studentId === s.id && p.category === 'bus' && !p.voided).reduce((sum,p) => sum + (Number(p.amount)||0), 0);
    return {
      name: `${s.firstName} ${s.lastName}`,
      fatherName: s.fatherName || '—',
      className: s.className,
      section: s.section,
      route: route ? (stop ? `${route.name} — ${stop.name}` : route.name) : '—',
      admissionNo: s.admissionNo,
      photo: s.photo || '',
      paid: fmtMoney(paid),
      balance: fmtMoney(Math.max(expected - paid, 0)),
    };
  }
  function renderBusPassTab(body){
    const pool = busPassRiderPool();
    if(pool.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No students on transport yet</b>Assign students to a route under "Assign Students" first — a bus pass needs a route to print.</div>`;
      return;
    }
    const routesInUse = transportRoutes.filter(r => pool.some(s => s.transportRouteId === r.id));
    const classesInUse = [...new Set(pool.map(s => s.className))];
    body.innerHTML = `
      <div class="form-grid" style="max-width:720px; margin-bottom:6px;">
        <div class="f-field">
          <label>Template</label>
          <select id="bpTemplate" onchange="busPassTemplate=this.value; renderBusPassBody();">
            ${Object.keys(BUS_PASS_TEMPLATES).map(k => `<option value="${k}" ${k===busPassTemplate?'selected':''}>${BUS_PASS_TEMPLATES[k].label}</option>`).join('')}
          </select>
        </div>
        <div class="f-field">
          <label>Passes per row (A4)</label>
          <select id="bpCols" onchange="renderBusPassBody();">
            <option value="2">2 per row</option>
            <option value="3">3 per row</option>
          </select>
        </div>
        <div class="f-field">
          <label>Route</label>
          <select id="bpRoute" onchange="busPassRouteFilter=this.value; renderBusPassBody();">
            <option value="">All Routes</option>
            ${routesInUse.map(r => `<option value="${r.id}" ${r.id===busPassRouteFilter?'selected':''}>${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="f-field">
          <label>Class</label>
          <select id="bpClass" onchange="busPassClassFilter=this.value; renderBusPassBody();">
            <option value="">All Classes</option>
            ${classesInUse.map(c => `<option value="${c}" ${c===busPassClassFilter?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="bpListWrap"></div>
    `;
    document.getElementById('bpCols').value = String(BUS_PASS_TEMPLATES[busPassTemplate].cols);
    renderBusPassBody();
  }
  function renderBusPassBody(){
    const colsEl = document.getElementById('bpCols');
    if(colsEl) BUS_PASS_TEMPLATES[busPassTemplate].cols = Number(colsEl.value) || 2;
    let list = busPassRiderPool();
    if(busPassRouteFilter) list = list.filter(s => s.transportRouteId === busPassRouteFilter);
    if(busPassClassFilter) list = list.filter(s => s.className === busPassClassFilter);
    const wrap = document.getElementById('bpListWrap');
    if(!wrap) return;
    const allChecked = list.length > 0 && list.every(s => busPassSelected.has(s.id));
    wrap.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin:14px 0;">
        <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;">
          <input type="checkbox" ${allChecked?'checked':''} onchange="toggleBusPassSelectAll(this.checked)"> Select all (${list.length})
        </label>
        <button class="btn btn-primary" onclick="printBusPasses()" ${busPassSelected.size===0?'disabled':''}>🖨️ Print ${busPassSelected.size||''} Bus Pass${busPassSelected.size===1?'':'es'}</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th></th><th>Student</th><th>Class</th><th>Route</th><th>Paid</th><th>Balance</th></tr></thead>
          <tbody>
            ${list.map(s => {
              const info = busPassStudentInfo(s);
              return `<tr>
                <td><input type="checkbox" ${busPassSelected.has(s.id)?'checked':''} onchange="toggleBusPassStudent('${s.id}', this.checked)"></td>
                <td class="name-cell">${info.name}</td>
                <td>${info.className} - ${info.section}</td>
                <td>${info.route}</td>
                <td>${info.paid}</td>
                <td>${info.balance}</td>
              </tr>`;
            }).join('')}
            ${list.length===0 ? `<tr><td colspan="6"><div class="empty-state"><b>No students match this filter</b></div></td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  }
  function toggleBusPassStudent(id, checked){
    if(checked) busPassSelected.add(id); else busPassSelected.delete(id);
    renderBusPassBody();
  }
  function toggleBusPassSelectAll(checked){
    let list = busPassRiderPool();
    if(busPassRouteFilter) list = list.filter(s => s.transportRouteId === busPassRouteFilter);
    if(busPassClassFilter) list = list.filter(s => s.className === busPassClassFilter);
    list.forEach(s => { if(checked) busPassSelected.add(s.id); else busPassSelected.delete(s.id); });
    renderBusPassBody();
  }
  function busPassCardInner(tpl, info, logoSrc){
    const photoBlock = info.photo
      ? `<img src="${info.photo}" class="bp-photo-img">`
      : `<div class="bp-photo-ph">PHOTO</div>`;
    if(tpl === 'modern'){
      return `
        <div class="bp-modern-head"><img src="${logoSrc}" class="bp-modern-logo"><div><div class="bp-modern-school">${schoolInfo.name||''}</div><div class="bp-modern-sub">STUDENT BUS PASS</div></div></div>
        <div class="bp-modern-photo">${photoBlock}</div>
        <div class="bp-modern-body">
          <div class="bp-modern-name">${info.name}</div>
          <div class="bp-row"><span>Father</span><b>${info.fatherName}</b></div>
          <div class="bp-row"><span>Class</span><b>${info.className} - ${info.section}</b></div>
          <div class="bp-row"><span>Paid</span><b>${info.paid}</b><span style="margin-left:8px;">Balance</span><b>${info.balance}</b></div>
          <div class="bp-modern-route">Route: ${info.route}</div>
        </div>
        <div class="bp-modern-foot"><span>S.No. ${info.admissionNo}</span><span>Principal Sign.</span></div>
      `;
    }
    if(tpl === 'compact'){
      return `
        <div class="bp-compact-head"><img src="${logoSrc}" class="bp-compact-logo"><div class="bp-compact-school">${schoolInfo.name||''} · BUS PASS</div><span class="bp-compact-no">#${info.admissionNo}</span></div>
        <div class="bp-compact-body">
          ${photoBlock}
          <div class="bp-compact-fields">
            <div><span>Name</span> <b>${info.name}</b></div>
            <div><span>Father</span> ${info.fatherName}</div>
            <div><span>Class</span> ${info.className} - ${info.section}</div>
            <div><span>Paid</span> ${info.paid} <span style="margin-left:6px;">Bal.</span> ${info.balance}</div>
          </div>
        </div>
        <div class="bp-compact-route">ROUTE ${info.route}</div>
      `;
    }
    if(tpl === 'ticket'){
      return `
        <div class="bp-ticket-main">
          <div class="bp-ticket-head"><img src="${logoSrc}" class="bp-ticket-logo"><div><div class="bp-ticket-school">${schoolInfo.name||''}</div><div class="bp-ticket-addr">${schoolInfo.address||''}</div></div></div>
          <div class="bp-row"><span>Student</span><b>${info.name}</b></div>
          <div class="bp-row"><span>Father</span>${info.fatherName}</div>
          <div class="bp-row"><span>Class</span>${info.className}-${info.section}<span style="margin-left:8px;">Route</span>${info.route}</div>
          <div class="bp-row"><span>Paid</span>${info.paid}<span style="margin-left:8px;">Balance</span>${info.balance}</div>
        </div>
        <div class="bp-ticket-stub">
          <div class="bp-ticket-stub-label">BUS<br>PASS</div>
          ${photoBlock}
          <div class="bp-ticket-sno"><div>S.No.</div><b>${info.admissionNo}</b></div>
        </div>
      `;
    }
    // classic and inksaver share the same layout; inksaver is just monochrome via CSS class
    return `
      <div class="bp-classic-head"><img src="${logoSrc}" class="bp-classic-logo"><div class="bp-classic-names"><div class="bp-classic-school">${schoolInfo.name||''}</div><div class="bp-classic-addr">${schoolInfo.address||''}</div></div><div class="bp-classic-badge">STUDENT<br>BUS PASS</div></div>
      <div class="bp-classic-body">
        <div class="bp-classic-fields">
          <div class="bp-row"><span>Student name</span><b>${info.name}</b></div>
          <div class="bp-row"><span>Father name</span><b>${info.fatherName}</b></div>
          <div class="bp-row"><span>Class</span><b>${info.className}</b><span style="margin-left:8px;">Route</span><b>${info.route}</b></div>
          <div class="bp-row"><span>Amount Paid</span><b>${info.paid}</b><span style="margin-left:8px;">Balance</span><b>${info.balance}</b></div>
        </div>
        ${photoBlock}
      </div>
      <div class="bp-classic-foot"><span>S.No. <b>${info.admissionNo}</b></span><span class="bp-classic-issued">Issued Date: __/__/____</span><span>Principal Signature</span></div>
    `;
  }
  function printBusPasses(){
    const ids = [...busPassSelected];
    if(ids.length === 0){ showToast('Select at least one student first.'); return; }
    const tpl = busPassTemplate;
    const conf = BUS_PASS_TEMPLATES[tpl];
    const cols = conf.cols || 2;
    const gapMm = 6;
    const usableMm = 190; // A4 width (210mm) minus 10mm margins each side
    const cardWMm = Math.round(((usableMm - (cols-1)*gapMm) / cols) * 10) / 10;
    const cardHMm = Math.round((cardWMm * (conf.hMm / conf.wMm)) * 10) / 10;
    const logoSrc = schoolLogoSrc();
    const list = students.filter(s => ids.includes(s.id));
    const cardsHtml = list.map(s => `<div class="bp-card bp-tpl-${tpl}">${busPassCardInner(tpl, busPassStudentInfo(s), logoSrc)}</div>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Bus Passes — ${conf.label}</title>
      <style>
        @page{ size:A4; margin:10mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; margin:0; }
        .bp-wrap{ display:flex; flex-wrap:wrap; gap:${gapMm}mm; }
        .bp-card{ width:${cardWMm}mm; height:${cardHMm}mm; box-sizing:border-box; page-break-inside:avoid; overflow:hidden; position:relative; }
        .bp-photo-img{ width:16mm; height:20mm; object-fit:cover; border-radius:1mm; flex-shrink:0; }
        .bp-photo-ph{ width:16mm; height:20mm; border:1px solid #9ca3af; border-radius:1mm; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:6px; color:#9ca3af; }
        .bp-row{ display:flex; gap:4px; font-size:7.5px; align-items:baseline; }
        .bp-row span{ color:#6b7280; }

        /* Classic Replica + Ink Saver */
        .bp-tpl-classic, .bp-tpl-inksaver{ border:2px solid #1c2b52; border-radius:2mm; padding:3mm; display:flex; flex-direction:column; gap:2mm; }
        .bp-classic-head{ display:flex; align-items:center; gap:2mm; }
        .bp-classic-logo{ width:9mm; height:9mm; border-radius:50%; flex-shrink:0; }
        .bp-classic-names{ flex-grow:1; min-width:0; }
        .bp-classic-school{ font-size:11px; font-weight:700; color:#1c2b52; line-height:1.15; }
        .bp-classic-addr{ font-size:6.5px; color:#6b7280; }
        .bp-classic-badge{ flex-shrink:0; background:#1c2b52; color:#fff; font-size:6.5px; font-weight:800; text-align:center; padding:1.2mm 1.6mm; border-radius:1mm; line-height:1.25; }
        .bp-classic-body{ display:flex; gap:2mm; flex-grow:1; }
        .bp-classic-fields{ flex-grow:1; display:flex; flex-direction:column; gap:1.3mm; justify-content:center; }
        .bp-classic-foot{ display:flex; justify-content:space-between; font-size:6.5px; color:#6b7280; border-top:1px solid #e2e2e2; padding-top:1mm; }
        .bp-tpl-inksaver{ border-color:#111827; }
        .bp-tpl-inksaver .bp-classic-school, .bp-tpl-inksaver .bp-classic-addr, .bp-tpl-inksaver .bp-classic-foot, .bp-tpl-inksaver .bp-row span, .bp-tpl-inksaver .bp-row b{ color:#111827; }
        .bp-tpl-inksaver .bp-classic-badge{ background:#fff; color:#111827; border:1px solid #111827; }
        .bp-tpl-inksaver img{ filter:grayscale(1) contrast(1.3); }

        /* Modern Card */
        .bp-tpl-modern{ border-radius:3mm; box-shadow:0 0 0 1px #e5e7eb inset; padding:0; display:flex; flex-direction:column; }
        .bp-modern-head{ background:#1c2b52; color:#fff; padding:2.5mm 3mm; display:flex; align-items:center; gap:2mm; border-bottom:1mm solid #c9a227; }
        .bp-modern-logo{ width:8mm; height:8mm; border-radius:50%; }
        .bp-modern-school{ font-size:10px; font-weight:700; }
        .bp-modern-sub{ font-size:6.5px; color:#c9a227; letter-spacing:0.04em; }
        .bp-modern-photo{ margin:-4mm 3mm 0 auto; width:14mm; }
        .bp-modern-photo .bp-photo-img, .bp-modern-photo .bp-photo-ph{ width:14mm; height:14mm; border-radius:50%; border:1mm solid #fff; box-shadow:0 0 0 1px #ddd; margin-left:auto; }
        .bp-modern-body{ padding:2mm 3mm; display:flex; flex-direction:column; gap:1.3mm; flex-grow:1; }
        .bp-modern-name{ font-size:10px; font-weight:700; color:#1c2b52; }
        .bp-modern-route{ font-size:7px; font-weight:700; color:#1c2b52; background:#eef2ff; display:inline-block; padding:0.8mm 2mm; border-radius:3mm; margin-top:1mm; }
        .bp-modern-foot{ display:flex; justify-content:space-between; font-size:6.5px; color:#6b7280; background:#f8f9fb; padding:1.5mm 3mm; border-top:1px solid #eef0f4; }

        /* Compact Badge */
        .bp-tpl-compact{ border:1px solid #e5e7eb; border-radius:2mm; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 0 0 1px #f3f4f6 inset; }
        .bp-compact-head{ display:flex; align-items:center; gap:1.5mm; padding:2mm 2.5mm 1mm; }
        .bp-compact-logo{ width:6mm; height:6mm; border-radius:50%; flex-shrink:0; }
        .bp-compact-school{ font-size:8px; font-weight:700; color:#1c2b52; flex-grow:1; }
        .bp-compact-no{ font-size:6.5px; color:#c0392b; font-weight:800; }
        .bp-compact-body{ display:flex; gap:2mm; padding:1mm 2.5mm; flex-grow:1; }
        .bp-compact-fields{ display:flex; flex-direction:column; gap:1mm; font-size:7px; justify-content:center; }
        .bp-compact-fields span{ color:#9ca3af; }
        .bp-compact-route{ background:#1c2b52; color:#fff; font-size:7px; font-weight:700; padding:1.3mm 2.5mm; }

        /* Ticket Stub */
        .bp-tpl-ticket{ border:1.5px solid #1c2b52; border-radius:2mm; display:flex; }
        .bp-ticket-main{ flex-grow:1; padding:2.5mm 3mm; display:flex; flex-direction:column; gap:1mm; border-right:1px dashed #9ca3af; }
        .bp-ticket-head{ display:flex; align-items:center; gap:1.5mm; margin-bottom:1mm; }
        .bp-ticket-logo{ width:7mm; height:7mm; border-radius:50%; }
        .bp-ticket-school{ font-size:9px; font-weight:700; color:#1c2b52; }
        .bp-ticket-addr{ font-size:6px; color:#6b7280; }
        .bp-ticket-stub{ flex-shrink:0; width:22mm; background:#f8f9fb; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:2mm; }
        .bp-ticket-stub-label{ font-size:6px; font-weight:800; color:#1c2b52; text-align:center; letter-spacing:0.06em; }
        .bp-ticket-sno{ text-align:center; font-size:6px; color:#9ca3af; }
        .bp-ticket-sno b{ display:block; font-size:11px; color:#c0392b; }
      </style></head>
      <body onload="window.print()">
        <div class="bp-wrap">${cardsHtml}</div>
      </body></html>
    `);
    w.document.close();
  }

  const TIMETABLE_TAB_PERM_KEYS = { class:'timetable_class', teacher:'timetable_teacher', periods:'timetable_periods' };
  function initTimetableView(){
    const accessibleTabs = Object.keys(TIMETABLE_TAB_PERM_KEYS).filter(t => getTimetableTabAccess(currentUser.role, TIMETABLE_TAB_PERM_KEYS[t]));
    Object.keys(TIMETABLE_TAB_PERM_KEYS).forEach(t => { const btn = document.getElementById('tttab-'+t); if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none'; });
    if(!accessibleTabs.includes(timetableTab)) timetableTab = accessibleTabs[0] || 'class';
    switchTimetableTab(timetableTab);
  }
  function switchTimetableTab(tab){
    timetableTab = tab;
    ['class','teacher','periods'].forEach(t => { const btn = document.getElementById('tttab-'+t); if(btn) btn.classList.toggle('active', t===tab); });
    renderTimetableBody();
  }
  function renderTimetableBody(){
    const body = document.getElementById('timetableBody');
    if(!body) return;
    if(!getTimetableTabAccess(currentUser.role, TIMETABLE_TAB_PERM_KEYS[timetableTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(timetableTab === 'class') return renderClassTimetableTab(body);
    if(timetableTab === 'teacher') return renderTeacherTimetableTab(body);
    if(timetableTab === 'periods') return renderTimetablePeriodsTab(body);
  }

  function renderClassTimetableTab(body){
    body.innerHTML = `
      <div class="form-grid" style="max-width:420px; margin-bottom:20px;">
        <div class="f-field"><label>Class</label><select id="ttClassSelect" onchange="ttClass=this.value; renderTimetableBody();"><option value="">Select class</option>${CLASS_LEVELS.map(c => `<option ${c===ttClass?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="f-field"><label>Section</label><select id="ttSectionSelect" onchange="ttSection=this.value; renderTimetableBody();"><option value="">Select section</option>${SECTIONS.map(s => `<option ${s===ttSection?'selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      ${(!ttClass || !ttSection) ? `<div class="empty-state"><b>Pick a class and section</b>Choose above to view or edit its weekly timetable.</div>` : `
        <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
          <button class="btn btn-ghost btn-sm" onclick="printClassTimetable()">🖨️ Print / PDF</button>
        </div>
        ${renderTtClassGrid()}
      `}
    `;
  }
  function renderTtClassGrid(){
    const canEditTt = canSub('timetable_class','timetable','edit');
    const rows = timetablePeriods.map(p => {
      if(p.isBreak){
        return `<tr><td style="font-weight:600; background:rgba(203,154,46,0.1);">${p.label}<br><span style="font-size:0.7rem; color:var(--ink-soft); font-weight:400;">${p.start}–${p.end}</span></td><td colspan="${activeTimetableDays().length}" style="text-align:center; background:rgba(203,154,46,0.1); color:var(--ink-soft); font-style:italic;">${p.label}</td></tr>`;
      }
      return `<tr><td style="font-weight:600;">${p.label}<br><span style="font-size:0.7rem; color:var(--ink-soft); font-weight:400;">${p.start}–${p.end}</span></td>
        ${activeTimetableDays().map(day => {
          const entry = timetableEntries.find(e => e.className===ttClass && e.section===ttSection && e.day===day && e.period===p.id);
          const staff = entry ? staffList.find(s => s.id===entry.staffId) : null;
          return `<td style="${canEditTt?'cursor:pointer;':''} text-align:center; min-width:110px;" ${canEditTt ? `onclick="openTtCellModal('${day}','${p.id}')"` : ''}>
            ${entry ? `<div style="font-weight:600; color:var(--magenta); font-size:0.82rem;">${entry.subject}</div><div style="font-size:0.72rem; color:var(--ink-soft);">${staff ? staff.firstName+' '+staff.lastName : ''}</div>` : (canEditTt ? `<span style="color:var(--ink-soft); font-size:0.78rem;">+ Add</span>` : `<span style="color:var(--ink-soft); font-size:0.78rem;">—</span>`)}
          </td>`;
        }).join('')}
      </tr>`;
    }).join('');
    return `
      <div class="table-wrap">
        <table><thead><tr><th>Period</th>${activeTimetableDays().map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table>
      </div>
    `;
  }
  let ttEditDay = '', ttEditPeriod = '';
  function openTtCellModal(day, periodId){
    if(!ttClass || !ttSection) return;
    ttEditDay = day; ttEditPeriod = periodId;
    const period = timetablePeriods.find(p => p.id===periodId);
    const entry = timetableEntries.find(e => e.className===ttClass && e.section===ttSection && e.day===day && e.period===periodId);
    document.getElementById('ttCellModalTitle').textContent = `${ttClass} — Section ${ttSection}`;
    document.getElementById('ttCellModalSub').textContent = `${day}, ${period.label} (${period.start}–${period.end})`;
    const subjSelect = document.getElementById('ttCellSubject');
    const classSubjects = subjectsList.filter(s => s.className===ttClass && (s.sections||[]).includes(ttSection));
    subjSelect.innerHTML = `<option value="">— Free Period —</option>` + classSubjects.map(s => `<option value="${s.name}" ${entry&&entry.subject===s.name?'selected':''}>${s.name}</option>`).join('');
    document.getElementById('ttConflictWarning').style.display = 'none';
    populateTtStaffOptions(entry ? entry.subject : '', entry ? entry.staffId : '');
    document.getElementById('ttCellModalOverlay').classList.add('open');
  }
  function onTtCellSubjectChange(){
    populateTtStaffOptions(document.getElementById('ttCellSubject').value, '');
  }
  function populateTtStaffOptions(subjectName, selectedStaffId){
    const staffSelect = document.getElementById('ttCellStaff');
    const subj = subjectsList.find(s => s.className===ttClass && s.name===subjectName);
    const assignedIds = subj ? (subj.staffIds||[]) : [];
    const assignedStaff = staffList.filter(s => assignedIds.includes(s.id) && staffIsActive(s));
    const otherStaff = staffList.filter(s => !assignedIds.includes(s.id) && staffIsActive(s));
    staffSelect.innerHTML = `<option value="">Select teacher</option>` +
      (assignedStaff.length ? `<optgroup label="Teaches this subject">${assignedStaff.map(s => `<option value="${s.id}" ${s.id===selectedStaffId?'selected':''}>${s.firstName} ${s.lastName}</option>`).join('')}</optgroup>` : '') +
      (otherStaff.length ? `<optgroup label="Other staff">${otherStaff.map(s => `<option value="${s.id}" ${s.id===selectedStaffId?'selected':''}>${s.firstName} ${s.lastName}</option>`).join('')}</optgroup>` : '');
  }
  function closeTtCellModal(){
    document.getElementById('ttCellModalOverlay').classList.remove('open');
  }
  function findTtConflict(day, periodId, staffId, excludeClass, excludeSection){
    return timetableEntries.find(e => e.day===day && e.period===periodId && e.staffId===staffId && !(e.className===excludeClass && e.section===excludeSection));
  }
  async function saveTtCell(){
    const subject = document.getElementById('ttCellSubject').value;
    const staffId = document.getElementById('ttCellStaff').value;
    if(subject && !staffId){ showToast('Select a teacher for this subject.'); return; }
    if(staffId){
      const conflict = findTtConflict(ttEditDay, ttEditPeriod, staffId, ttClass, ttSection);
      if(conflict){
        const st = staffList.find(s => s.id===staffId);
        const warnBox = document.getElementById('ttConflictWarning');
        warnBox.style.display = 'block';
        warnBox.textContent = `⚠ ${st?st.firstName+' '+st.lastName:'This teacher'} is already teaching ${conflict.className} — Section ${conflict.section} (${conflict.subject}) at this exact time. Choose a different teacher or period.`;
        return;
      }
    }
    const idx = timetableEntries.findIndex(e => e.className===ttClass && e.section===ttSection && e.day===ttEditDay && e.period===ttEditPeriod);
    if(!subject){
      if(idx > -1) timetableEntries.splice(idx,1);
    }else{
      const data = { className:ttClass, section:ttSection, day:ttEditDay, period:ttEditPeriod, subject, staffId };
      if(idx > -1) timetableEntries[idx] = { ...timetableEntries[idx], ...data };
      else timetableEntries.push({ id:'tt_'+Date.now(), ...data });
    }
    await storageSet(TIMETABLE_KEY, timetableEntries);
    closeTtCellModal();
    renderTimetableBody();
    showToast('Timetable updated.', 'burst');
  }
  async function clearTtCell(){
    const idx = timetableEntries.findIndex(e => e.className===ttClass && e.section===ttSection && e.day===ttEditDay && e.period===ttEditPeriod);
    if(idx > -1){
      timetableEntries.splice(idx,1);
      await storageSet(TIMETABLE_KEY, timetableEntries);
      renderTimetableBody();
      showToast('Slot cleared.', 'burst');
    }
    closeTtCellModal();
  }

  /* --- Teacher View: everything allotted to one teacher, across all classes --- */
  function renderTeacherTimetableTab(body){
    const teachers = staffList.filter(s => staffIsActive(s));
    body.innerHTML = `
      <div class="f-field" style="max-width:320px; margin-bottom:20px;">
        <label>Teacher</label>
        <select id="ttTeacherSelect" onchange="ttTeacherId=this.value; renderTimetableBody();">
          <option value="">Select a teacher</option>
          ${teachers.map(s => `<option value="${s.id}" ${s.id===ttTeacherId?'selected':''}>${s.firstName} ${s.lastName}</option>`).join('')}
        </select>
      </div>
      ${!ttTeacherId ? `<div class="empty-state"><b>Pick a teacher</b>See exactly which classes and periods are allotted to them across the whole week.</div>` : `
        <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
          <button class="btn btn-ghost btn-sm" onclick="printTeacherTimetable()">🖨️ Print / PDF</button>
        </div>
        ${renderTeacherGrid()}
      `}
    `;
  }
  function renderTeacherGrid(){
    const rows = timetablePeriods.map(p => {
      if(p.isBreak) return `<tr><td style="font-weight:600; background:rgba(203,154,46,0.1);">${p.label}</td><td colspan="${activeTimetableDays().length}" style="text-align:center; background:rgba(203,154,46,0.1); color:var(--ink-soft); font-style:italic;">${p.label}</td></tr>`;
      return `<tr><td style="font-weight:600;">${p.label}<br><span style="font-size:0.7rem; color:var(--ink-soft); font-weight:400;">${p.start}–${p.end}</span></td>
        ${activeTimetableDays().map(day => {
          const entry = timetableEntries.find(e => e.staffId===ttTeacherId && e.day===day && e.period===p.id);
          return `<td style="text-align:center;">${entry ? `<div style="font-weight:600; color:var(--magenta); font-size:0.82rem;">${entry.className} — ${entry.section}</div><div style="font-size:0.72rem; color:var(--ink-soft);">${entry.subject}</div>` : `<span style="color:var(--border);">—</span>`}</td>`;
        }).join('')}
      </tr>`;
    }).join('');
    const totalPeriods = timetableEntries.filter(e => e.staffId===ttTeacherId).length;
    return `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:14px;"><b>${totalPeriods}</b> period${totalPeriods===1?'':'s'} allotted this week.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Period</th>${activeTimetableDays().map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table>
      </div>
    `;
  }

  /* --- Print / PDF export (reuses the same window.open + window.print() pattern as receipts and payslips) --- */
  const TT_PRINT_STYLE = `
    @page{ size:A4 landscape; margin:12mm; }
    body{ font-family:Arial,Helvetica,sans-serif; color:#111; }
    h2{ text-align:center; margin-bottom:2px; }
    p.sub{ text-align:center; color:#555; font-size:11px; margin-top:0; margin-bottom:16px; }
    table{ width:100%; border-collapse:collapse; font-size:11px; }
    th,td{ border:1px solid #999; padding:6px 8px; text-align:center; }
    th{ background:#211A4E; color:#fff; }
    td.ttp-label{ text-align:left; font-weight:600; white-space:nowrap; }
    .ttp-time{ font-size:9px; color:#666; font-weight:400; }
    .ttp-subj{ font-weight:600; color:#D11073; }
    .ttp-staff{ font-size:9.5px; color:#555; }
    .ttp-break{ background:#f6efe0; font-style:italic; color:#777; }
  `;
  function printClassTimetable(){
    if(!ttClass || !ttSection){ showToast('Pick a class and section first.'); return; }
    const days = activeTimetableDays();
    const rows = timetablePeriods.map(p => {
      if(p.isBreak){
        return `<tr><td class="ttp-label">${p.label}<br><span class="ttp-time">${p.start}–${p.end}</span></td><td colspan="${days.length}" class="ttp-break">${p.label}</td></tr>`;
      }
      return `<tr><td class="ttp-label">${p.label}<br><span class="ttp-time">${p.start}–${p.end}</span></td>
        ${days.map(day => {
          const entry = timetableEntries.find(e => e.className===ttClass && e.section===ttSection && e.day===day && e.period===p.id);
          const staff = entry ? staffList.find(s => s.id===entry.staffId) : null;
          return `<td>${entry ? `<div class="ttp-subj">${entry.subject}</div><div class="ttp-staff">${staff ? staff.firstName+' '+staff.lastName : ''}</div>` : '—'}</td>`;
        }).join('')}
      </tr>`;
    }).join('');
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Timetable — ${ttClass} ${ttSection}</title>
      <style>${TT_PRINT_STYLE}</style></head>
      <body onload="window.print()">
        <h2>${schoolInfo.name} — Class Timetable</h2>
        <p class="sub">${ttClass} — Section ${ttSection} · Generated ${new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}</p>
        <table><thead><tr><th>Period</th>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      </body></html>
    `);
    w.document.close();
  }
  function printTeacherTimetable(){
    if(!ttTeacherId){ showToast('Pick a teacher first.'); return; }
    const teacher = staffList.find(s => s.id===ttTeacherId);
    const days = activeTimetableDays();
    const rows = timetablePeriods.map(p => {
      if(p.isBreak) return `<tr><td class="ttp-label">${p.label}</td><td colspan="${days.length}" class="ttp-break">${p.label}</td></tr>`;
      return `<tr><td class="ttp-label">${p.label}<br><span class="ttp-time">${p.start}–${p.end}</span></td>
        ${days.map(day => {
          const entry = timetableEntries.find(e => e.staffId===ttTeacherId && e.day===day && e.period===p.id);
          return `<td>${entry ? `<div class="ttp-subj">${entry.className} — ${entry.section}</div><div class="ttp-staff">${entry.subject}</div>` : '—'}</td>`;
        }).join('')}
      </tr>`;
    }).join('');
    const totalPeriods = timetableEntries.filter(e => e.staffId===ttTeacherId).length;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Timetable — ${teacher ? teacher.firstName+' '+teacher.lastName : ''}</title>
      <style>${TT_PRINT_STYLE}</style></head>
      <body onload="window.print()">
        <h2>${schoolInfo.name} — Teacher Timetable</h2>
        <p class="sub">${teacher ? teacher.firstName+' '+teacher.lastName : ''} · ${totalPeriods} period${totalPeriods===1?'':'s'}/week · Generated ${new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}</p>
        <table><thead><tr><th>Period</th>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      </body></html>
    `);
    w.document.close();
  }

  /* --- Periods Setup --- */
  function renderTimetablePeriodsTab(body){
    const canEditTt = canSub('timetable_periods','timetable','edit');
    if(!canEditTt){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    const activeDays = activeTimetableDays();
    const teachingCount = timetablePeriods.filter(p => !p.isBreak).length;
    const breakCount = timetablePeriods.filter(p => p.isBreak).length;
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">These periods, breaks, and days appear on every class timetable and the teacher view.</p>

      <div class="profile-card" style="max-width:640px; margin-bottom:20px;">
        <h4>📆 Select Days</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">Choose which days of the week this timetable covers.</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${ALL_WEEK_DAYS.map(d => {
            const on = activeDays.includes(d);
            return `<button type="button" onclick="toggleTtDay('${d}')" style="border:none; border-radius:8px; padding:8px 16px; font-size:0.82rem; font-weight:600; cursor:pointer; ${on?'background:var(--brand-navy); color:#fff;':'background:rgba(203,154,46,0.12); color:var(--ink-soft);'}">${on?'✓ ':''}${d.slice(0,3)}</button>`;
          }).join('')}
        </div>
        <p style="font-size:0.78rem; color:#0f6a63; font-weight:600; margin-top:10px;">${activeDays.length} day${activeDays.length===1?'':'s'} selected</p>
      </div>

      <div class="profile-card" style="max-width:820px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:10px;">
          <h4 style="margin:0;">⏰ Define Periods &amp; Time Slots</h4>
          <button class="btn btn-primary btn-sm" onclick="addTtPeriodRow()">+ Add Period</button>
        </div>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Set up your periods with labels and times. Mark breaks like recess or lunch.</p>
        <div class="table-wrap" style="margin-bottom:10px; overflow-x:auto;">
          <table style="min-width:620px;"><thead><tr><th style="width:34px;">#</th><th>Label</th><th>Start</th><th>End</th><th style="width:70px;">Break?</th><th style="width:90px;">Action</th></tr></thead>
          <tbody>
          ${timetablePeriods.map((p,i) => `<tr style="${p.isBreak?'background:rgba(203,154,46,0.08);':''}">
            <td>${i+1}</td>
            <td><input type="text" class="input tt-period-label" value="${p.label}" style="width:110px;"></td>
            <td><input type="time" class="input tt-period-start" value="${p.start}" style="width:95px;"></td>
            <td><input type="time" class="input tt-period-end" value="${p.end}" style="width:95px;"></td>
            <td style="text-align:center;"><input type="checkbox" class="tt-period-break" title="Mark as a break" ${p.isBreak?'checked':''} style="width:18px; height:18px; cursor:pointer;"></td>
            <td><button class="btn-danger-text" style="white-space:nowrap; font-size:0.85rem;" onclick="removeTtPeriodRow(${i})">🗑️ Delete</button></td>
          </tr>`).join('')}
          </tbody></table>
        </div>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:14px;">${teachingCount} period${teachingCount===1?'':'s'} + ${breakCount} break${breakCount===1?'':'s'}</p>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-ghost" onclick="addTtPeriodRow()">+ Add Another Period</button>
          <button class="btn btn-primary" onclick="saveTtPeriods()">Save Periods &amp; Days</button>
        </div>
      </div>
    `;
  }
  function toggleTtDay(day){
    syncTtPeriodsFromInputs();
    if(timetableActiveDays.includes(day)) timetableActiveDays = timetableActiveDays.filter(d => d !== day);
    else timetableActiveDays = [...timetableActiveDays, day].sort((a,b) => ALL_WEEK_DAYS.indexOf(a)-ALL_WEEK_DAYS.indexOf(b));
    renderTimetablePeriodsTab(document.getElementById('timetableBody'));
  }
  function syncTtPeriodsFromInputs(){
    const labels = document.querySelectorAll('.tt-period-label');
    if(labels.length !== timetablePeriods.length) return; // table not currently rendered with matching rows — nothing to sync
    const starts = document.querySelectorAll('.tt-period-start');
    const ends = document.querySelectorAll('.tt-period-end');
    const breaks = document.querySelectorAll('.tt-period-break');
    timetablePeriods = timetablePeriods.map((p,i) => ({ ...p, label:labels[i].value.trim()||p.label, start:starts[i].value, end:ends[i].value, isBreak:breaks[i].checked }));
  }
  function addTtPeriodRow(){
    syncTtPeriodsFromInputs();
    timetablePeriods.push({ id:'p_'+Date.now(), label:'New Period', start:'09:00', end:'09:45', isBreak:false });
    renderTimetablePeriodsTab(document.getElementById('timetableBody'));
  }
  function removeTtPeriodRow(i){
    syncTtPeriodsFromInputs();
    timetablePeriods.splice(i,1);
    renderTimetablePeriodsTab(document.getElementById('timetableBody'));
  }
  async function saveTtPeriods(){
    syncTtPeriodsFromInputs();
    if(timetableActiveDays.length === 0){ showToast('Select at least one day.'); return; }
    await storageSet(TIMETABLE_PERIODS_KEY, timetablePeriods);
    await storageSet(TIMETABLE_DAYS_KEY, timetableActiveDays);
    showToast('Periods and days updated.', 'burst');
    renderTimetableBody();
  }

  /* ===== SYLLABUS & HOMEWORK — admin UI =====
     Two tabs sharing one Class/Section/Subject filter bar: a syllabus topic
     tracker (with a status per topic) and a homework list (with a due date).
     Both are read straight into the Student/Parent portal's own tab below —
     nothing extra needed once a topic or homework item is saved here. */
  