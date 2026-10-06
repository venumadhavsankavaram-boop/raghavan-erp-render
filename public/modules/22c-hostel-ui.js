/* ============================================================================
   Hostel screens (Rooms / Allot / Roster) - presentation only.
   Loads after module 21 and overrides its render functions. Every save /
   delete / allot / remove handler is still the one in module 21 and reads the
   same element ids (hsBlockName, hsRoomNumber, hsRoomType, hsCapacity, hsFee,
   hsWardenName, hsWardenPhone, hsAllotStudentSearch, hsAllotStudentSuggestions,
   hsAllotPreview ...).  New state/helpers are prefixed `hsx`.
   ========================================================================== */
const hsxState = { q:'', block:'', status:'all', rq:'', rblock:'', rvac:false };

function hsxEmpty(title, text){
  return `<div class="hsx-empty"><b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>`;
}
function hsxPct(a, b){ return b > 0 ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0; }
function hsxRoomState(occ, cap){
  if(occ >= cap) return 'full';
  if(occ === 0) return 'empty';
  return 'part';
}
function hsxBadge(st, free){
  if(st === 'full') return `<span class="sf-badge sf-badge--overdue"><span aria-hidden="true">●</span>Full</span>`;
  if(st === 'empty') return `<span class="sf-badge sf-badge--upcoming"><span aria-hidden="true">○</span>Vacant</span>`;
  return `<span class="sf-badge sf-badge--paid"><span aria-hidden="true">◐</span>${free} free</span>`;
}
function hsxBar(occ, cap){
  const p = hsxPct(occ, cap);
  const tone = occ >= cap ? 'full' : (p >= 75 ? 'high' : 'ok');
  return `<div class="hsx-bar hsx-bar--${tone}" role="img" aria-label="${occ} of ${cap} beds filled"><i style="width:${p}%"></i></div>`;
}
function hsxBlocks(){
  return [...new Set(hostelRooms.map(r => r.blockName).filter(Boolean))].sort();
}
function hsxBlockSelect(id, val, onchange){
  return `<select class="input hsx-sel" id="${id}" aria-label="Block" onchange="${onchange}"><option value="">All blocks</option>${hsxBlocks().map(b => `<option value="${escapeHtml(b)}" ${b===val?'selected':''}>${escapeHtml(b)}</option>`).join('')}</select>`;
}
function hsxWarden(r){
  if(!r.wardenName && !r.wardenPhone) return '<span class="hsx-mute">Not assigned</span>';
  return `${escapeHtml(r.wardenName||'')}${r.wardenPhone ? `<small>${escapeHtml(r.wardenPhone)}</small>` : ''}`;
}
function hsxTotals(){
  let occ = 0, cap = 0, full = 0;
  hostelRooms.forEach(r => { const o = hostelOccupants(r.id).length; occ += o; cap += r.capacity; if(o >= r.capacity) full++; });
  return { occ, cap, free: Math.max(cap - occ, 0), full };
}
function hsxKpis(){
  const t = hsxTotals();
  return `<section class="sf-kpis hsx-kpis">
    ${sfKpi('Rooms', hostelRooms.length, 'plain', hsxBlocks().length + ' block' + (hsxBlocks().length===1?'':'s'))}
    ${sfKpi('Beds filled', `${t.occ} / ${t.cap}`, 'plain', hsxPct(t.occ, t.cap) + '% occupancy')}
    ${sfKpi('Free beds', t.free, t.free > 0 ? 'good' : 'warn', t.free > 0 ? 'ready to allot' : 'hostel is full')}
    ${sfKpi('Full rooms', t.full, t.full > 0 ? 'warn' : 'plain', 'no bed left')}
  </section>`;
}

/* ---------------- Rooms ---------------- */
function hsxRoomFiltered(){
  const q = hsxState.q.trim().toLowerCase();
  return hostelRooms.filter(r => {
    const occ = hostelOccupants(r.id).length;
    const st = hsxRoomState(occ, r.capacity);
    if(hsxState.block && r.blockName !== hsxState.block) return false;
    if(hsxState.status === 'free' && st === 'full') return false;
    if(hsxState.status === 'full' && st !== 'full') return false;
    if(q && !`${r.blockName} ${r.roomNumber} ${r.roomType} ${r.wardenName||''} ${r.wardenPhone||''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function hsxRoomRowsHtml(){
  const canEdit = canSub('hostel_rooms','hostel','edit');
  const canDelete = canSub('hostel_rooms','hostel','delete');
  const rows = hsxRoomFiltered();
  if(!rows.length) return `<tr><td colspan="7">${hsxEmpty('No rooms match', 'Try a different search, block or availability filter.')}</td></tr>`;
  return rows.map(r => {
    const occ = hostelOccupants(r.id).length;
    const st = hsxRoomState(occ, r.capacity);
    const id = escapeHtml(r.id);
    return `<tr class="hsx-row--${st}">
      <td data-l="Room"><b>${escapeHtml(r.blockName)}</b><small>Room ${escapeHtml(r.roomNumber)}</small></td>
      <td data-l="Type">${escapeHtml(r.roomType||'—')}</td>
      <td data-l="Beds" class="hsx-beds"><span class="hsx-beds-n"><span class="hsx-lbl">Beds</span><span><b>${occ}</b> / ${r.capacity}</span></span>${hsxBar(occ, r.capacity)}</td>
      <td data-l="Status">${hsxBadge(st, Math.max(r.capacity - occ, 0))}</td>
      <td data-l="Fee / year" class="hsx-r">${fmtMoney(r.fee)}</td>
      <td data-l="Warden">${hsxWarden(r)}</td>
      <td class="sf-actions hsx-act">${canEdit ? `<button type="button" class="sf-btn sf-btn--link" onclick="openRoomEditor('${id}')">Edit</button>` : ''}${canDelete ? `<button type="button" class="sf-btn sf-btn--danger" onclick="deleteRoom('${id}')">Delete</button>` : ''}</td>
    </tr>`;
  }).join('');
}
function hsxRoomRepaint(){
  const t = document.getElementById('hsxRoomRows'); if(t) t.innerHTML = hsxRoomRowsHtml();
  const c = document.getElementById('hsxRoomCount'); if(c) c.textContent = `${hsxRoomFiltered().length} of ${hostelRooms.length} rooms`;
  document.querySelectorAll('#hsxRoomSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === hsxState.status));
}
function hsxSetRoomFilter(k, v){ hsxState[k] = v; hsxRoomRepaint(); }
function renderRoomsList(body){
  const canCreate = canSub('hostel_rooms','hostel','create');
  const addBtn = canCreate ? sfBtn('primary','plus','Add room','openRoomEditor()') : '';
  if(!hostelRooms.length){
    body.innerHTML = `<section class="sf-card hsx-card">${hsxEmpty('No rooms yet', 'Set up your first hostel room with its type, bed count and yearly fee. Students you allot later are charged that room\'s rate.')}
      ${canCreate ? `<div class="hsx-center">${addBtn}</div>` : ''}</section>`;
    return;
  }
  const segs = [['all','All'],['free','Has free beds'],['full','Full']];
  body.innerHTML = `
    ${hsxKpis()}
    <p class="hsx-note">Each room has its own type, bed capacity and fee. Allot a student and their hostel fee is set to that room's rate immediately.</p>
    <div class="iv-toolbar">
      <input class="input iv-search hsx-search" type="search" id="hsxRoomSearch" placeholder="Search block, room, warden..." value="${escapeHtml(hsxState.q)}" aria-label="Search rooms" oninput="hsxSetRoomFilter('q', this.value)">
      ${hsxBlockSelect('hsxRoomBlock', hsxState.block, "hsxSetRoomFilter('block', this.value)")}
      <div class="sf-segments" id="hsxRoomSeg" role="group" aria-label="Availability">${segs.map(([v,l]) => `<button type="button" data-v="${v}" class="${hsxState.status===v?'active':''}" onclick="hsxSetRoomFilter('status','${v}')">${l}</button>`).join('')}</div>
      <div class="iv-toolbar-actions">${addBtn}</div>
    </div>
    <section class="sf-card">
      <div class="hsx-tablehead"><b>Rooms</b><span id="hsxRoomCount"></span></div>
      <div class="table-wrap"><table class="iv-table hsx-table"><thead><tr><th>Room</th><th>Type</th><th>Beds</th><th>Status</th><th class="hsx-r">Fee / year</th><th>Warden</th><th></th></tr></thead>
      <tbody id="hsxRoomRows"></tbody></table></div>
    </section>`;
  hsxRoomRepaint();
}

/* ---------------- Room editor ---------------- */
function hsxEditorHint(){
  const cap = Number((document.getElementById('hsCapacity')||{}).value) || 0;
  const fee = Number((document.getElementById('hsFee')||{}).value) || 0;
  const box = document.getElementById('hsxEditSummary'); if(!box) return;
  const occ = editingRoomId ? hostelOccupants(editingRoomId).length : 0;
  let t = '';
  if(cap > 0) t += `${cap} bed${cap===1?'':'s'}`;
  if(fee > 0) t += `${t?' · ':''}${fmtMoney(fee)} per student per year`;
  if(editingRoomId) t += `${t?' · ':''}${occ} currently allotted`;
  box.textContent = t || 'Fill in the room details.';
  box.classList.toggle('hsx-warn', !!(editingRoomId && cap && cap < occ));
  if(editingRoomId && cap && cap < occ) box.textContent += ` — capacity cannot go below ${occ}`;
}
function renderRoomEditor(body){
  const r = editingRoomId ? hostelRooms.find(x => x.id === editingRoomId) : null;
  const v = x => escapeHtml(x == null ? '' : String(x));
  body.innerHTML = `
    <div class="breadcrumb"><a onclick="backToRoomsList()">Rooms</a> &nbsp;/&nbsp; ${r ? escapeHtml(r.blockName)+' — '+escapeHtml(r.roomNumber) : 'New room'}</div>
    <section class="sf-card hsx-card hsx-edit">
      <div class="hsx-card-head"><h4>${r ? 'Edit room' : 'Add a room'}</h4><p>Block and room number identify the room. The fee is what each boarder is charged per year.</p></div>
      <div class="hsx-group">Room</div>
      <div class="form-grid">
        <div class="f-field"><label>Block Name <span class="required-star">*</span></label><input type="text" class="input" id="hsBlockName" value="${v(r?r.blockName:'')}" placeholder="e.g. Boys Block A"></div>
        <div class="f-field"><label>Room Number <span class="required-star">*</span></label><input type="text" class="input" id="hsRoomNumber" value="${v(r?r.roomNumber:'')}" placeholder="e.g. 101"></div>
        <div class="f-field"><label>Room Type</label>
          <select class="input" id="hsRoomType">${['2-Seater','4-Seater','6-Seater','Dormitory'].map(t => `<option ${r&&r.roomType===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="f-field"><label>Bed Capacity <span class="required-star">*</span></label><input type="number" class="input" id="hsCapacity" value="${r?r.capacity:2}" min="1" oninput="hsxEditorHint()"></div>
        <div class="f-field"><label>Fee (₹/year) <span class="required-star">*</span></label><input type="number" class="input" id="hsFee" value="${v(r?r.fee:'')}" min="0" oninput="hsxEditorHint()"></div>
      </div>
      <div class="hsx-group">Warden <small>optional</small></div>
      <div class="form-grid">
        <div class="f-field"><label>Warden Name</label><input type="text" class="input" id="hsWardenName" value="${v(r?r.wardenName||'':'')}" placeholder="e.g. Suresh Naidu"></div>
        <div class="f-field"><label>Warden Phone</label><input type="text" class="input" id="hsWardenPhone" value="${v(r?r.wardenPhone||'':'')}" placeholder="10-digit mobile" inputmode="numeric" maxlength="10" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)"></div>
      </div>
      <div class="hsx-summary" id="hsxEditSummary" aria-live="polite"></div>
      <div class="hsx-form-actions">
        ${sfBtn('primary','check','Save room','saveRoom()')}
        <button type="button" class="sf-btn sf-btn--soft" onclick="backToRoomsList()">Cancel</button>
      </div>
    </section>`;
  hsxEditorHint();
}

/* ---------------- Allot ---------------- */
function hsxBedDots(occ, cap, pendingN){
  const max = Math.min(cap, 24);
  let h = '';
  for(let i = 0; i < max; i++){
    const cls = i < occ ? 'is-taken' : (i < occ + pendingN ? 'is-new' : '');
    h += `<i class="${cls}"></i>`;
  }
  return `<div class="hsx-dots" aria-hidden="true">${h}${cap > max ? `<em>+${cap-max}</em>` : ''}</div>`;
}
function hsxAllotSide(){
  const room = hostelRooms.find(r => r.id === hsAllotRoomId);
  if(!room) return '';
  const occ = hostelOccupants(room.id).length;
  const st = hsxRoomState(occ, room.capacity);
  const targets = hsAllotTargets().filter(s => s.hostelRoomId !== room.id);
  const mates = hostelOccupants(room.id);
  return `<aside class="sf-card hsx-card hsx-side">
    <div class="hsx-side-top"><div><h4>${escapeHtml(room.blockName)} · Room ${escapeHtml(room.roomNumber)}</h4><span class="hsx-mute">${escapeHtml(room.roomType||'')}</span></div>${hsxBadge(st, Math.max(room.capacity - occ, 0))}</div>
    ${hsxBedDots(occ, room.capacity, Math.min(targets.length, Math.max(room.capacity - occ, 0)))}
    <dl class="hsx-facts">
      <div><dt>Beds</dt><dd>${occ} of ${room.capacity} filled</dd></div>
      <div><dt>Fee</dt><dd>${fmtMoney(room.fee)} / year</dd></div>
      <div><dt>Warden</dt><dd>${room.wardenName ? escapeHtml(room.wardenName) : '<span class="hsx-mute">Not assigned</span>'}</dd></div>
    </dl>
    <div class="hsx-group">Current boarders</div>
    ${mates.length ? `<ul class="hsx-mates">${mates.map(s => `<li>${sfAvatar(s)}<span>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}<small>${escapeHtml(s.className)} · ${escapeHtml(s.section)}</small></span></li>`).join('')}</ul>` : `<div class="hsx-mute hsx-pad">No one in this room yet.</div>`}
  </aside>`;
}
function renderHostelAllotTab(body){
  if(hostelRooms.length === 0){
    body.innerHTML = `<section class="sf-card hsx-card">${hsxEmpty('No rooms yet', 'Add a room under the Rooms tab first, then come back to allot students.')}</section>`;
    return;
  }
  if(!hsAllotRoomId || !hostelRooms.find(r => r.id===hsAllotRoomId)) hsAllotRoomId = hostelRooms[0].id;
  const scopes = [['student','One student'],['class','Whole class'],['section','Class & section']];
  const groups = {};
  hostelRooms.forEach(r => { (groups[r.blockName] = groups[r.blockName] || []).push(r); });
  const roomOpts = Object.keys(groups).map(b => `<optgroup label="${escapeHtml(b)}">${groups[b].map(r => { const f = roomAvailableBeds(r); return `<option value="${escapeHtml(r.id)}" ${r.id===hsAllotRoomId?'selected':''}>Room ${escapeHtml(r.roomNumber)} · ${escapeHtml(r.roomType||'')} · ${f} bed${f===1?'':'s'} free</option>`; }).join('')}</optgroup>`).join('');
  body.innerHTML = `
    ${hsxKpis()}
    <div class="hsx-split">
      <section class="sf-card hsx-card hsx-edit">
        <div class="hsx-card-head"><h4>Allot a room</h4><p>Choose who goes in. Their hostel fee switches to this room's rate as soon as you confirm.</p></div>
        <div class="hsx-step"><span>1</span>Pick the room</div>
        <div class="f-field full"><select class="input" id="hsAllotRoom" aria-label="Room" onchange="hsAllotRoomId=this.value; renderHostelBody();">${roomOpts}</select></div>
        <div class="hsx-step"><span>2</span>Who to allot</div>
        <div class="sf-segments hsx-scope" role="group" aria-label="Scope">${scopes.map(([v,l]) => `<button type="button" class="${hsAllotScopeValue===v?'active':''}" onclick="hsAllotScopeValue='${v}'; renderHostelBody();">${l}</button>`).join('')}</div>
        ${renderHsScopeFields()}
        <div class="hsx-preview" id="hsAllotPreview" aria-live="polite"></div>
        ${canSub('hostel_allot','hostel','edit') ? `<div class="hsx-form-actions">${sfBtn('primary','check','Allot room','applyHostelAllotment()')}</div>` : ''}
      </section>
      ${hsxAllotSide()}
    </div>`;
  updateHsAllotPreview();
}
function renderHsScopeFields(){
  if(hsAllotScopeValue === 'student'){
    const s = hsAllotStudentId ? students.find(x => x.id === hsAllotStudentId) : null;
    return `
      <div class="f-field full hsx-gap">
        <label for="hsAllotStudentSearch">Student</label>
        <div class="search-wrap hsx-searchwrap">
          <input class="input" id="hsAllotStudentSearch" placeholder="Type at least 2 letters of the name..." autocomplete="off" oninput="onHsAllotStudentInput()" onblur="setTimeout(hideHsAllotSuggestions,150)" onfocus="onHsAllotStudentInput()">
          <div class="search-suggestions" id="hsAllotStudentSuggestions"></div>
        </div>
        ${s ? `<div class="hsx-chosen">${sfAvatar(s)}<span>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}<small>${escapeHtml(s.admissionNo)} · ${escapeHtml(s.className)} — ${escapeHtml(s.section)}${s.isBoarder==='Yes' && s.hostelRoomId ? ' · already in a room (will be moved)' : ''}</small></span><button type="button" class="hsx-x" aria-label="Clear student" onclick="hsAllotStudentId=''; renderHostelBody();">&times;</button></div>` : ''}
      </div>`;
  }
  return `
    <div class="form-grid hsx-gap">
      <div class="f-field"><label>Class</label><select class="input" id="hsAllotClass" onchange="hsAllotClassValue=this.value; updateHsAllotPreview();"><option value="">Select class</option>${CLASS_LEVELS.map(c => `<option ${c===hsAllotClassValue?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></div>
      ${hsAllotScopeValue==='section' ? `<div class="f-field"><label>Section</label><select class="input" id="hsAllotSection" onchange="hsAllotSectionValue=this.value; updateHsAllotPreview();"><option value="">Select section</option>${SECTIONS.map(s => `<option ${s===hsAllotSectionValue?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select></div>` : ''}
    </div>`;
}
function renderHsAllotSuggestions(q){
  const box = document.getElementById('hsAllotStudentSuggestions');
  if(!box) return;
  if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
  const ql = q.toLowerCase();
  const matches = students.filter(s => isActive(s) && ((s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql))).slice(0,8);
  box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="hsAllotStudentId='${escapeHtml(s.id)}'; hideHsAllotSuggestions(); renderHostelBody();">
    <div class="sg-avatar">${initials(s)}</div>
    <div><div class="sg-name">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</div><div class="sg-meta">${escapeHtml(s.admissionNo)} · ${escapeHtml(s.className)} — Section ${escapeHtml(s.section)}${s.isBoarder==='Yes' && s.hostelRoomId ? ' · boarder' : ''}</div></div>
  </div>`).join('') : `<div class="sg-empty">No students match "${escapeHtml(q)}"</div>`;
  box.classList.add('open');
}
function updateHsAllotPreview(){
  const box = document.getElementById('hsAllotPreview');
  if(!box) return;
  const room = hostelRooms.find(r => r.id === hsAllotRoomId);
  if(!room){ box.innerHTML = ''; return; }
  const all = hsAllotTargets();
  const targets = all.filter(s => s.hostelRoomId !== room.id); // already-in-this-room students don't need a bed
  if(targets.length === 0){
    box.className = 'hsx-preview';
    box.innerHTML = `<div class="hsx-mute">${all.length ? 'Everyone selected is already in this room.' : (hsAllotScopeValue==='student' ? 'Select a student to see the allotment summary.' : 'Pick a class' + (hsAllotScopeValue==='section' ? ' and section' : '') + ' to see how many students will move in.')}</div>`;
    return;
  }
  const available = roomAvailableBeds(room);
  const enough = targets.length <= available;
  const moving = targets.filter(s => s.isBoarder==='Yes' && s.hostelRoomId).length;
  box.className = 'hsx-preview ' + (enough ? 'is-ok' : 'is-bad');
  box.innerHTML = `<div><b>${targets.length} student${targets.length===1?'':'s'}</b> → ${escapeHtml(room.blockName)}, Room ${escapeHtml(room.roomNumber)} at <b>${fmtMoney(room.fee)}</b> each${moving ? ` <span class="hsx-mute">(${moving} moving from another room)</span>` : ''}</div>
    <div>${enough ? `<span class="sf-badge sf-badge--paid"><span aria-hidden="true">✓</span>${available} bed${available===1?'':'s'} free</span>` : `<span class="sf-badge sf-badge--overdue"><span aria-hidden="true">!</span>Only ${available} bed${available===1?'':'s'} free, ${targets.length} needed</span>`}</div>`;
}

/* ---------------- Roster ---------------- */
function hsxRosterHtml(){
  const q = hsxState.rq.trim().toLowerCase();
  const isAdmin = currentUser.role === 'Admin';
  let shown = 0;
  const cards = hostelRooms.filter(r => !hsxState.rblock || r.blockName === hsxState.rblock).map(r => {
    const all = hostelOccupants(r.id);
    const occ = q ? all.filter(s => `${s.firstName} ${s.lastName} ${s.admissionNo} ${s.className} ${s.section}`.toLowerCase().includes(q)) : all;
    const free = Math.max(r.capacity - all.length, 0);
    if(hsxState.rvac && free === 0) return '';
    if(q && !occ.length) return '';
    shown++;
    const st = hsxRoomState(all.length, r.capacity);
    return `<section class="sf-card hsx-room">
      <div class="hsx-room-head">
        <div><h4>${escapeHtml(r.blockName)} · Room ${escapeHtml(r.roomNumber)}</h4><span class="hsx-mute">${escapeHtml(r.roomType||'')} · ${fmtMoney(r.fee)} / year${r.wardenName ? ' · Warden: ' + escapeHtml(r.wardenName) : ''}</span></div>
        ${hsxBadge(st, free)}
      </div>
      <div class="hsx-room-beds"><span><b>${all.length}</b> / ${r.capacity} beds</span>${hsxBar(all.length, r.capacity)}</div>
      ${occ.length ? `<ul class="hsx-people">${occ.map(s => `<li>${sfAvatar(s)}<span class="hsx-pn">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}<small>${escapeHtml(s.admissionNo)} · ${escapeHtml(s.className)} · Sec ${escapeHtml(s.section)}</small></span>${isAdmin ? `<button type="button" class="sf-btn sf-btn--danger" onclick="removeStudentFromHostel('${escapeHtml(s.id)}')">Remove</button>` : ''}</li>`).join('')}</ul>`
        : hsxEmpty('No students in this room yet', free ? `${free} bed${free===1?'':'s'} available to allot.` : '')}
    </section>`;
  }).join('');
  return shown ? `<div class="hsx-rooms-grid">${cards}</div>` : `<section class="sf-card">${hsxEmpty('Nothing to show', 'No room or student matches these filters.')}</section>`;
}
function hsxRosterRepaint(){
  const t = document.getElementById('hsxRosterList'); if(t) t.innerHTML = hsxRosterHtml();
}
function hsxSetRosterFilter(k, v){ hsxState[k] = v; hsxRosterRepaint(); }
function renderRoomRosterTab(body){
  if(hostelRooms.length === 0){
    body.innerHTML = `<section class="sf-card hsx-card">${hsxEmpty('No rooms yet', 'Add a room under the Rooms tab first.')}</section>`;
    return;
  }
  body.innerHTML = `
    ${hsxKpis()}
    <div class="iv-toolbar">
      <input class="input iv-search hsx-search" type="search" id="hsxRosterSearch" placeholder="Search student, admission no, class..." value="${escapeHtml(hsxState.rq)}" aria-label="Search boarders" oninput="hsxSetRosterFilter('rq', this.value)">
      ${hsxBlockSelect('hsxRosterBlock', hsxState.rblock, "hsxSetRosterFilter('rblock', this.value)")}
      <label class="hsx-check"><input type="checkbox" ${hsxState.rvac?'checked':''} onchange="hsxSetRosterFilter('rvac', this.checked)"> Only rooms with free beds</label>
    </div>
    <div id="hsxRosterList"></div>`;
  hsxRosterRepaint();
}
