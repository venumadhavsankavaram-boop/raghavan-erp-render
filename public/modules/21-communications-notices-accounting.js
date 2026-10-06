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
  let hsAllotSearchDebounce = null;
  function onHsAllotStudentInput(){
    clearTimeout(hsAllotSearchDebounce);
    hsAllotSearchDebounce = setTimeout(() => renderHsAllotSuggestions(document.getElementById('hsAllotStudentSearch').value.trim()), 150);
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
  let libBorrowerSearchDebounce = null;
  function onLibBorrowerInput(){
    clearTimeout(libBorrowerSearchDebounce);
    libBorrowerSearchDebounce = setTimeout(() => renderLibBorrowerSuggestions(document.getElementById('libBorrowerSearch').value.trim()), 150);
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

  /* --- Settings --- */
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
  let trAssignSearchDebounce = null;
  function onTrAssignStudentInput(){
    clearTimeout(trAssignSearchDebounce);
    trAssignSearchDebounce = setTimeout(() => renderTrAssignSuggestions(document.getElementById('trAssignStudentSearch').value.trim()), 150);
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
  function toggleBusPassStudent(id, checked){
    if(checked) busPassSelected.add(id); else busPassSelected.delete(id);
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
  