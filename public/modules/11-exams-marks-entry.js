const PAGE_SIZES_MM = { A4: [210, 297], Legal: [215.9, 355.6] };
  let roomAllotSubTab = 'hallTickets';
  let roomAllotExamId = '';
  let roomAllotHTClass = '';
  let roomAllotHTPrefix = 'HT';
  let roomAllotHTStart = 1;
  let roomAllotNoticeSort = 'ht';
  let roomAllotNoticeClassFilter = '';
  let roomAllotNoticeCols = 3;

  function roomAllotConfigFor(examId){
    if(!examId) return { selectedClasses: [], orientation: 'landscape', pageSize: 'A4' };
    let cfg = examRoomConfigs.find(c => c.id === examId);
    if(!cfg){
      cfg = { id: examId, selectedClasses: [], orientation: 'landscape', pageSize: 'A4' };
      examRoomConfigs.push(cfg);
    }
    cfg.selectedClasses = cfg.selectedClasses || [];
    cfg.orientation = cfg.orientation || 'landscape';
    cfg.pageSize = cfg.pageSize || 'A4';
    return cfg;
  }
  function roomAllotConfig(){ return roomAllotConfigFor(roomAllotExamId); }
  function roomAllotCurrentExam(){ return examDefs.find(e => e.id === roomAllotExamId) || null; }
  async function saveRoomAllotConfig(){ await storageSet(EXAM_ROOM_CONFIG_KEY, examRoomConfigs); }

  function renderRoomAllotmentTab(body){
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b>Create an exam under the "Exams" tab first.</div>`;
      return;
    }
    if(!roomAllotExamId || !examDefs.find(e => e.id === roomAllotExamId)) roomAllotExamId = examDefs[0].id;
    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${roomAllotExamId===ex.id?'selected':''}>${ex.name}</option>`).join('');
    body.innerHTML = `
      <div class="f-field" style="max-width:320px; margin-bottom:16px;">
        <label>Exam</label>
        <select id="raExamSelect" onchange="roomAllotExamId=this.value; roomAllotHTClass=''; renderResultBody();">${examOptions}</select>
      </div>
      <div class="mf-tabs" style="margin-bottom:16px;">
        <button type="button" class="mf-tab ${roomAllotSubTab==='hallTickets'?'active':''}" onclick="switchRoomAllotSubTab('hallTickets')">Hall Ticket Numbers</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='classes'?'active':''}" onclick="switchRoomAllotSubTab('classes')">Select Classes</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='rooms'?'active':''}" onclick="switchRoomAllotSubTab('rooms')">Rooms &amp; Matrix</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='printout'?'active':''}" onclick="switchRoomAllotSubTab('printout')">Final Printout</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='notice'?'active':''}" onclick="switchRoomAllotSubTab('notice')">Notice Board</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='signatures'?'active':''}" onclick="switchRoomAllotSubTab('signatures')">Document Signatures</button>
      </div>
      <div id="raSubBody"></div>
    `;
    renderRoomAllotSubBody();
  }
  function switchRoomAllotSubTab(tab){
    roomAllotSubTab = tab;
    renderRoomAllotmentTab(document.getElementById('resultBody'));
  }
  function renderRoomAllotSubBody(){
    const el = document.getElementById('raSubBody');
    if(!el) return;
    if(roomAllotSubTab==='hallTickets') return renderHallTicketsSubTab(el);
    if(roomAllotSubTab==='classes') return renderClassSelectionSubTab(el);
    if(roomAllotSubTab==='rooms') return renderRoomsMatrixSubTab(el);
    if(roomAllotSubTab==='printout') return renderFinalPrintoutSubTab(el);
    if(roomAllotSubTab==='notice') return renderNoticeBoardSubTab(el);
    if(roomAllotSubTab==='signatures') return renderDocumentSignaturesSubTab(el);
  }

  /* --- Hall Ticket Numbers --- */
  function roomAllotStudentsForClass(className){
    return students.filter(s => s.className === className && isActive(s)).slice().sort((a,b) => {
      const ga = a.gender==='Female' ? 0 : 1, gb = b.gender==='Female' ? 0 : 1;
      if(ga !== gb) return ga - gb;
      return (a.firstName||'').localeCompare(b.firstName||'');
    });
  }
  function getHallTicket(examId, studentId){
    return examHallTickets.find(h => h.examId===examId && h.studentId===studentId);
  }
  function renderHallTicketsSubTab(el){
    const cfg = roomAllotConfig();
    const canEditHT = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const classList = (cfg.selectedClasses && cfg.selectedClasses.length) ? cfg.selectedClasses : CLASS_LEVELS;
    el.innerHTML = `
      <div class="profile-card" style="margin-bottom:16px;">
        <h4>Generate Hall Ticket Numbers</h4>
        <div class="form-grid" style="margin-top:10px;">
          <div class="f-field"><label>Class</label>
            <select id="raHTClass" onchange="roomAllotHTClass=this.value; renderRoomAllotSubBody();">
              <option value="">Select Class...</option>
              ${classList.map(c=>`<option value="${c}" ${c===roomAllotHTClass?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="f-field"><label>Prefix</label><input type="text" id="raHTPrefix" value="${roomAllotHTPrefix}"></div>
          <div class="f-field"><label>Start Number</label><input type="number" id="raHTStart" min="1" value="${roomAllotHTStart}"></div>
          ${canEditHT ? `<div class="f-field" style="align-self:flex-end;"><button class="btn btn-primary btn-sm" ${roomAllotHTClass?'':'disabled'} onclick="regenHallTicketsForClass()">Auto-Generate</button></div>` : ''}
        </div>
        <span style="font-size:0.72rem; color:var(--ink-soft);">Students are numbered girls-first, then boys, in the order shown below. Auto-Generate fills every student in this class — you can still edit individual numbers afterward.</span>
      </div>
      ${!roomAllotHTClass ? '' : renderHallTicketsTable(canEditHT)}
    `;
  }
  function renderHallTicketsTable(canEditHT){
    const studs = roomAllotStudentsForClass(roomAllotHTClass);
    if(!studs.length) return `<div class="empty-state"><b>No active students in this class</b></div>`;
    const rows = studs.map(s => {
      const ht = getHallTicket(roomAllotExamId, s.id);
      return `<tr>
        <td class="name-cell">${s.firstName||''} ${s.lastName||''}</td>
        <td class="id-cell">${s.admissionNo||''}</td>
        <td>${s.section||''}</td>
        <td>${s.gender||''}</td>
        <td>${canEditHT ? `<input type="text" style="width:150px;" value="${ht?ht.htNumber:''}" onchange="saveHallTicketNumber('${s.id}', this.value)">` : (ht?ht.htNumber:'—')}</td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Admission No</th><th>Section</th><th>Gender</th><th>Hall Ticket No.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  async function regenHallTicketsForClass(){
    const prefix = document.getElementById('raHTPrefix').value.trim();
    const start = Number(document.getElementById('raHTStart').value) || 1;
    roomAllotHTPrefix = prefix; roomAllotHTStart = start;
    const studs = roomAllotStudentsForClass(roomAllotHTClass);
    let n = start;
    studs.forEach(s => {
      const num = prefix + String(n).padStart(4,'0');
      n++;
      const existing = getHallTicket(roomAllotExamId, s.id);
      if(existing) existing.htNumber = num;
      else examHallTickets.push({ id: 'ht_'+roomAllotExamId+'_'+s.id, examId: roomAllotExamId, studentId: s.id, htNumber: num });
    });
    await storageSet(EXAM_HALL_TICKETS_KEY, examHallTickets);
    showToast('Hall ticket numbers generated for ' + studs.length + ' students.');
    renderRoomAllotSubBody();
  }
  async function saveHallTicketNumber(studentId, value){
    const val = value.trim();
    const existing = getHallTicket(roomAllotExamId, studentId);
    if(existing) existing.htNumber = val;
    else examHallTickets.push({ id: 'ht_'+roomAllotExamId+'_'+studentId, examId: roomAllotExamId, studentId, htNumber: val });
    await storageSet(EXAM_HALL_TICKETS_KEY, examHallTickets);
  }

  /* --- Select Classes --- */
  function renderClassSelectionSubTab(el){
    const cfg = roomAllotConfig();
    cfg.selectedClasses = cfg.selectedClasses || [];
    const rows = CLASS_LEVELS.map(cls => {
      const checked = cfg.selectedClasses.includes(cls) ? 'checked' : '';
      const count = students.filter(s => s.className===cls && isActive(s)).length;
      return `<label style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
        <input type="checkbox" ${checked} onchange="toggleRoomAllotClass('${cls}', this.checked)">
        <span style="font-weight:600;">${cls}</span>
        <span style="margin-left:auto; font-size:0.75rem; color:var(--ink-soft);">${count} students</span>
      </label>`;
    }).join('');
    el.innerHTML = `
      <div class="profile-card">
        <h4>Select Classes for This Exam</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:4px 0 12px;">Chosen classes scope Hall Ticket generation, the Room Allotment Matrix, the Final Printout, and which class tiles appear on the Admit Cards page for this exam. Leave nothing selected to include every class.</p>
        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <button class="btn btn-ghost btn-sm" onclick="setAllRoomAllotClasses(true)">Select All</button>
          <button class="btn btn-ghost btn-sm" onclick="setAllRoomAllotClasses(false)">Clear All</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:10px;">
          ${rows}
        </div>
      </div>
    `;
  }
  async function toggleRoomAllotClass(cls, checked){
    const cfg = roomAllotConfig();
    cfg.selectedClasses = cfg.selectedClasses || [];
    if(checked){ if(!cfg.selectedClasses.includes(cls)) cfg.selectedClasses.push(cls); }
    else cfg.selectedClasses = cfg.selectedClasses.filter(c => c!==cls);
    await saveRoomAllotConfig();
  }
  async function setAllRoomAllotClasses(all){
    const cfg = roomAllotConfig();
    cfg.selectedClasses = all ? CLASS_LEVELS.slice() : [];
    await saveRoomAllotConfig();
    renderRoomAllotSubBody();
  }

  /* --- Rooms & Matrix --- */
  function renderRoomsMatrixSubTab(el){
    const cfg = roomAllotConfig();
    const canEditRooms = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const canCreateRooms = getResultTabAccess(currentUser.role, 'result_roomallotment', 'create');
    const canDeleteRooms = getResultTabAccess(currentUser.role, 'result_roomallotment', 'delete');
    const classList = (cfg.selectedClasses && cfg.selectedClasses.length) ? cfg.selectedClasses : CLASS_LEVELS;
    const roomRows = rooms.map(r => `<tr>
      <td>${r.name}</td><td>${r.capacity}</td>
      <td>${canEditRooms ? `<button class="btn-edit-text" onclick="editExamRoom('${r.id}')">Edit</button>` : ''} &nbsp; ${canDeleteRooms ? `<button class="btn-edit-text" onclick="deleteExamRoom('${r.id}')">Delete</button>` : ''}</td>
    </tr>`).join('');
    const totalCap = rooms.reduce((s,r) => s+(Number(r.capacity)||0), 0);
    const exam = roomAllotCurrentExam();
    const cells = [];
    let grandBoys=0, grandGirls=0, grandTotal=0;
    classList.forEach(cls => {
      sectionsForClass(cls).forEach(sec => {
        const studs = students.filter(s => s.className===cls && s.section===sec && isActive(s));
        const boys = studs.filter(s => s.gender==='Male').length;
        const girls = studs.filter(s => s.gender==='Female').length;
        const total = boys+girls;
        grandBoys += boys; grandGirls += girls; grandTotal += total;
        if(total===0) return;
        const subjects = exam ? getExamSubjects(exam, cls, sec) : [];
        const warn = exam && subjects.length>0 && subjects.some(s => !s.date);
        cells.push({ cls, sec, boys, girls, total, warn });
      });
    });
    const maxTotal = cells.reduce((m,c) => Math.max(m,c.total), 0) || 1;
    const heatBg = t => {
      const from=[234,246,243], to=[31,138,122];
      const mix=(a,b,x)=>Math.round(a+(b-a)*x);
      const rgb = from.map((c,i)=>mix(c,to[i], t));
      return { bg:`rgb(${rgb.join(',')})`, dark: t>0.55 };
    };
    let matrixRows = cells.map(c => {
      const heat = heatBg(c.total/maxTotal);
      const ink = heat.dark ? '#fff' : 'inherit';
      const boysColor = heat.dark ? '#bcdcff' : '#1d4ed8';
      const girlsColor = heat.dark ? '#ffc7e6' : '#be185d';
      return `<tr style="background:${heat.bg}; color:${ink};">
        <td>${c.cls}${c.warn ? ` <span title="At least one subject for this class & section is still missing an exam date" style="color:#d97706;">⚠</span>` : ''}</td>
        <td>${c.sec}</td><td style="color:${boysColor};">${c.boys}</td><td style="color:${girlsColor};">${c.girls}</td><td style="font-weight:700;">${c.total}</td>
      </tr>`;
    }).join('');
    el.innerHTML = `
      <div class="profile-card" style="margin-bottom:16px;">
        <h4>Rooms</h4>
        <div class="table-wrap" style="margin:10px 0;"><table><thead><tr><th>Room Name</th><th>Capacity</th><th></th></tr></thead><tbody>${roomRows || '<tr><td colspan="3" style="color:var(--ink-soft);">No rooms added yet.</td></tr>'}</tbody></table></div>
        <div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">Total capacity: ${totalCap} seats</div>
        ${canCreateRooms ? `<button class="btn btn-primary btn-sm" onclick="openExamRoomModal()">+ Add Room</button>` : ''}
      </div>
      <div class="profile-card">
        <h4>Class × Section Matrix — Selected Classes</h4>
        <p style="font-size:0.76rem; color:var(--ink-soft); margin:4px 0 10px;">Darker cells hold more candidates. <span style="color:#d97706;">⚠</span> marks a class & section with a subject still missing its exam date for ${exam?exam.name:'the selected exam'} — set it under "Exams" before generating hall tickets.</p>
        <div class="table-wrap" style="margin-top:10px;"><table><thead><tr><th>Class</th><th>Section</th><th>Boys</th><th>Girls</th><th>Total</th></tr></thead><tbody>
          ${matrixRows || '<tr><td colspan="5" style="color:var(--ink-soft);">No students found for the selected classes.</td></tr>'}
          <tr style="font-weight:700;"><td colspan="2">Grand Total</td><td style="color:#1d4ed8;">${grandBoys}</td><td style="color:#be185d;">${grandGirls}</td><td>${grandTotal}</td></tr>
        </tbody></table></div>
      </div>
      <div id="roomModalWrap"></div>
    `;
  }
  function openExamRoomModal(id){
    const r = id ? rooms.find(x => x.id===id) : null;
    const el = document.getElementById('roomModalWrap');
    el.innerHTML = `<div style="position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:999; padding:20px;">
      <div class="profile-card" style="width:100%; max-width:320px;">
        <h4>${id?'Edit Room':'Add Room'}</h4>
        <input type="hidden" id="raRoomId" value="${id||''}">
        <div class="f-field" style="margin-top:10px;"><label>Room Name</label><input type="text" id="raRoomName" value="${r?r.name:''}"></div>
        <div class="f-field"><label>Capacity</label><input type="number" min="1" id="raRoomCapacity" value="${r?r.capacity:''}"></div>
        <div style="display:flex; gap:8px; margin-top:14px;">
          <button class="btn btn-primary btn-sm" onclick="saveExamRoom()">Save</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('roomModalWrap').innerHTML=''">Cancel</button>
        </div>
      </div>
    </div>`;
  }
  function editExamRoom(id){ openExamRoomModal(id); }
  async function saveExamRoom(){
    const id = document.getElementById('raRoomId').value;
    const name = document.getElementById('raRoomName').value.trim();
    const capacity = Number(document.getElementById('raRoomCapacity').value) || 0;
    if(!name || capacity<=0){ showToast('Enter a room name and capacity.'); return; }
    if(id){
      const r = rooms.find(x => x.id===id);
      if(r){ r.name = name; r.capacity = capacity; }
    } else {
      rooms.push({ id: 'examroom_'+Date.now(), name, capacity });
    }
    await storageSet(ROOMS_KEY, rooms);
    document.getElementById('roomModalWrap').innerHTML = '';
    renderRoomAllotSubBody();
  }
  async function deleteExamRoom(id){
    if(!await showConfirmDialog('Delete this room?')) return;
    rooms = rooms.filter(r => r.id!==id);
    await storageSet(ROOMS_KEY, rooms);
    renderRoomAllotSubBody();
  }

  /* --- Auto-allot algorithm (largest-remainder proportional split, remaining-capacity-weighted) --- */
  function proportionalSplit(count, weights){
    if(count<=0) return weights.map(()=>0);
    const totalWeight = weights.reduce((a,b)=>a+b,0);
    if(totalWeight<=0) return weights.map(()=>0);
    const raw = weights.map(w => count * w / totalWeight);
    const floors = raw.map(Math.floor);
    let remainder = count - floors.reduce((a,b)=>a+b,0);
    const fracIdx = raw.map((v,i) => ({ i, frac: v-Math.floor(v) })).sort((a,b) => b.frac-a.frac);
    const result = floors.slice();
    for(let k=0; k<remainder && fracIdx.length>0; k++){ result[fracIdx[k % fracIdx.length].i]++; }
    return result;
  }
  function distributeTotalsWithCorridor(classTotals, roomCaps){
    const roomsOut = roomCaps.map(r => ({ id:r.id, name:r.name, capacity:r.capacity, remaining:r.capacity, classes:{} }));
    const corridor = { name:'CORRIDOR', classes:{}, total:0 };
    classTotals.forEach(cls => {
      let need = cls.total;
      if(need<=0) return;
      const totalRemaining = roomsOut.reduce((s,r)=>s+r.remaining,0);
      const toRooms = Math.min(need, totalRemaining);
      if(toRooms>0){
        const weights = roomsOut.map(r => r.remaining);
        const split = proportionalSplit(toRooms, weights);
        split.forEach((n,i) => {
          if(n<=0) return;
          roomsOut[i].classes[cls.className] = (roomsOut[i].classes[cls.className]||0)+n;
          roomsOut[i].remaining -= n;
        });
      }
      const overflow = need - toRooms;
      if(overflow>0){
        corridor.classes[cls.className] = (corridor.classes[cls.className]||0) + overflow;
        corridor.total += overflow;
      }
    });
    return { rooms: roomsOut, corridor };
  }
  function roomAllotClassHtNumbersSorted(examId, className){
    const studs = students.filter(s => s.className===className && isActive(s));
    const nums = studs.map(s => { const ht = getHallTicket(examId, s.id); return ht ? ht.htNumber : ''; }).filter(Boolean);
    nums.sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
    return nums;
  }
  function buildFinalPrintoutDataFor(examId){
    const cfg = roomAllotConfigFor(examId);
    const classList = (cfg.selectedClasses && cfg.selectedClasses.length) ? cfg.selectedClasses : CLASS_LEVELS;
    const classTotals = classList.map(cls => ({ className: cls, total: students.filter(s => s.className===cls && isActive(s)).length })).filter(c => c.total>0);
    const roomCaps = rooms.map(r => ({ id:r.id, name:r.name, capacity: Number(r.capacity)||0 }));
    const { rooms: allocRooms, corridor } = distributeTotalsWithCorridor(classTotals, roomCaps);
    const cursor = {};
    const htLists = {};
    classList.forEach(c => { cursor[c] = 0; htLists[c] = roomAllotClassHtNumbersSorted(examId, c); });
    function takeRange(className, count){
      const list = htLists[className] || [];
      const start = cursor[className] || 0;
      const slice = list.slice(start, start+count);
      cursor[className] = start + count;
      return slice;
    }
    const roomBlocks = allocRooms.filter(r => Object.keys(r.classes).length>0).map(r => {
      const classEntries = Object.keys(r.classes).sort().map(cls => {
        const count = r.classes[cls];
        const htRange = takeRange(cls, count);
        return { className: cls, count, from: htRange[0]||'', to: htRange[htRange.length-1]||'', htNumbers: htRange };
      });
      const total = classEntries.reduce((s,c) => s+c.count, 0);
      return { name: r.name, capacity: r.capacity, classEntries, total };
    });
    let corridorBlock = null;
    if(corridor.total>0){
      const classEntries = Object.keys(corridor.classes).sort().map(cls => {
        const count = corridor.classes[cls];
        const htRange = takeRange(cls, count);
        return { className: cls, count, from: htRange[0]||'', to: htRange[htRange.length-1]||'', htNumbers: htRange };
      });
      corridorBlock = { name: 'CORRIDOR', classEntries, total: corridor.total };
    }
    return { roomBlocks, corridorBlock };
  }
  function buildFinalPrintoutData(){ return buildFinalPrintoutDataFor(roomAllotExamId); }
  function buildNoticeBoardDataFor(examId){
    const { roomBlocks, corridorBlock } = buildFinalPrintoutDataFor(examId);
    const studentByHt = {};
    students.forEach(s => { const ht = getHallTicket(examId, s.id); if(ht && ht.htNumber) studentByHt[ht.htNumber] = s; });
    const allBlocks = corridorBlock ? [...roomBlocks, corridorBlock] : roomBlocks;
    const list = [];
    allBlocks.forEach(block => {
      block.classEntries.forEach(ce => {
        (ce.htNumbers||[]).forEach(htNum => {
          const s = studentByHt[htNum];
          if(s) list.push({ studentId: s.id, ht: htNum, name: (s.firstName||'')+' '+(s.lastName||''), className: s.className, section: s.section, room: block.name });
        });
      });
    });
    return list;
  }
  function buildNoticeBoardData(){ return buildNoticeBoardDataFor(roomAllotExamId); }
  function computeExamHallTicketRoomMap(examId){
    const map = {};
    buildNoticeBoardDataFor(examId).forEach(d => { map[d.studentId] = { ht: d.ht, room: d.room }; });
    return map;
  }

  /* --- Final Printout --- */
  function renderFinalPrintoutTable(roomBlocks, corridorBlock){
    const allBlocks = corridorBlock ? [...roomBlocks, corridorBlock] : roomBlocks;
    if(!allBlocks.length) return `<tr><td colspan="10" style="color:var(--ink-soft);">No rooms or classes configured yet — add rooms under "Rooms &amp; Matrix" and select classes under "Select Classes".</td></tr>`;
    let rowsHtml = '';
    allBlocks.forEach(block => {
      const n = block.classEntries.length || 1;
      if(block.classEntries.length===0){
        rowsHtml += `<tr><td>${block.name}</td><td></td><td colspan="4" style="color:var(--ink-soft);">No candidates</td><td>0</td><td></td><td></td><td></td></tr>`;
        return;
      }
      block.classEntries.forEach((ce, idx) => {
        rowsHtml += '<tr>';
        if(idx===0) rowsHtml += `<td rowspan="${n}">${block.name}</td><td rowspan="${n}"></td>`;
        rowsHtml += `<td>${ce.className}</td><td>${ce.from}</td><td>${ce.to}</td><td>${ce.count}</td>`;
        if(idx===0) rowsHtml += `<td rowspan="${n}">${block.total}</td><td rowspan="${n}"></td><td rowspan="${n}"></td><td rowspan="${n}"></td>`;
        rowsHtml += '</tr>';
      });
    });
    return rowsHtml;
  }
  function renderFinalPrintoutSubTab(el){
    const cfg = roomAllotConfig();
    const exam = roomAllotCurrentExam();
    const { roomBlocks, corridorBlock } = buildFinalPrintoutData();
    const totalAllotted = roomBlocks.reduce((s,b) => s+b.total, 0) + (corridorBlock ? corridorBlock.total : 0);
    el.innerHTML = `
      <div class="profile-card" style="margin-bottom:16px; max-width:420px;">
        <h4>Page Setup</h4>
        <div class="form-grid" style="margin-top:10px;">
          <div class="f-field"><label>Orientation</label>
            <select id="raOrientation" onchange="updateRoomAllotPageSetup()">
              <option value="landscape" ${cfg.orientation==='landscape'?'selected':''}>Landscape</option>
              <option value="portrait" ${cfg.orientation==='portrait'?'selected':''}>Portrait</option>
            </select>
          </div>
          <div class="f-field"><label>Page Size</label>
            <select id="raPageSize" onchange="updateRoomAllotPageSetup()">
              <option value="A4" ${cfg.pageSize==='A4'?'selected':''}>A4</option>
              <option value="Legal" ${cfg.pageSize==='Legal'?'selected':''}>Legal</option>
            </select>
          </div>
        </div>
      </div>
      <div class="profile-card">
        <h4>Final Room Allotment — ${exam?exam.name:''}</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft);">${totalAllotted} candidate${totalAllotted===1?'':'s'} allotted across ${roomBlocks.length} room${roomBlocks.length===1?'':'s'}${corridorBlock?' + CORRIDOR (overflow, room capacity exceeded)':''}.</p>
        <div class="table-wrap" style="margin:12px 0;">
          <table><thead><tr><th>Room No.</th><th>Invigilator</th><th>Class</th><th>From</th><th>To</th><th>Total</th><th>Total in Room</th><th>Absentees</th><th>Present</th><th>Signature</th></tr></thead>
          <tbody>${renderFinalPrintoutTable(roomBlocks, corridorBlock)}</tbody></table>
        </div>
        ${getResultTabAccess(currentUser.role, 'result_roomallotment', 'print') ? `<button class="btn btn-primary" onclick="printFinalRoomAllotment()">Print Final Room Allotment</button>` : ''}
      </div>
    `;
  }
  async function updateRoomAllotPageSetup(){
    const cfg = roomAllotConfig();
    cfg.orientation = document.getElementById('raOrientation').value;
    cfg.pageSize = document.getElementById('raPageSize').value;
    await saveRoomAllotConfig();
  }
  function printFinalRoomAllotment(){
    const cfg = roomAllotConfig();
    const exam = roomAllotCurrentExam();
    const { roomBlocks, corridorBlock } = buildFinalPrintoutData();
    const [wmm, hmm] = PAGE_SIZES_MM[cfg.pageSize] || PAGE_SIZES_MM.A4;
    const pageSizeCss = cfg.orientation === 'landscape' ? `${hmm}mm ${wmm}mm` : `${wmm}mm ${hmm}mm`;
    const rowsHtml = renderFinalPrintoutTable(roomBlocks, corridorBlock);
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Final Room Allotment - ${exam?exam.name:''}</title>
      <style>
        @page{ size:${pageSizeCss}; margin:10mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; font-size:11px; }
        .frp-head{ text-align:center; margin-bottom:6px; }
        .frp-school{ font-weight:700; font-size:18px; }
        .frp-addr{ font-size:11px; color:#333; }
        .frp-exam{ font-weight:700; font-size:13px; margin-top:4px; }
        .frp-fields{ display:flex; gap:30px; margin:14px 0; font-size:12px; }
        .frp-fields span{ border-bottom:1px solid #333; padding-bottom:2px; min-width:140px; display:inline-block; }
        table{ width:100%; border-collapse:collapse; font-size:10.5px; }
        th,td{ border:1px solid #333; padding:5px 6px; text-align:center; }
        th{ background:#211A4E; color:#fff; }
      </style></head>
      <body onload="window.print()">
        <div class="frp-head">
          <div class="frp-school">${schoolInfo.name}</div>
          <div class="frp-addr">${schoolInfo.address}</div>
          <div class="frp-exam">${exam?exam.name.toUpperCase():''} — FINAL ROOM ALLOTMENT</div>
        </div>
        <div class="frp-fields">
          <div>DATE: <span>&nbsp;</span></div>
          <div>SUBJECT: <span>&nbsp;</span></div>
          <div>GENERAL DUTY: <span>&nbsp;</span></div>
        </div>
        <table>
          <thead><tr><th>Room No.</th><th>Name of the Invigilator</th><th>Class</th><th>From</th><th>To</th><th>Total</th><th>Total Candidates in the Room</th><th>Absentees</th><th>Present</th><th>Signature</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body></html>
    `);
    w.document.close();
  }

  /* --- Notice Board --- */
  function renderNoticeBoardSubTab(el){
    const data = buildNoticeBoardData();
    const classesPresent = Array.from(new Set(data.map(d => d.className))).sort();
    let filtered = roomAllotNoticeClassFilter ? data.filter(d => d.className===roomAllotNoticeClassFilter) : data.slice();
    filtered.sort((a,b) => roomAllotNoticeSort==='name' ? a.name.localeCompare(b.name) : a.ht.localeCompare(b.ht, undefined, {numeric:true}));
    el.innerHTML = `
      <div class="profile-card">
        <h4>Notice Board Display</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">A printable list so students can check the notice board to find their Hall Ticket Number and allotted Room.</p>
        <div class="form-grid" style="margin-bottom:12px;">
          <div class="f-field"><label>Sort By</label>
            <select id="raNoticeSort" onchange="roomAllotNoticeSort=this.value; renderRoomAllotSubBody();">
              <option value="ht" ${roomAllotNoticeSort==='ht'?'selected':''}>Hall Ticket No.</option>
              <option value="name" ${roomAllotNoticeSort==='name'?'selected':''}>Name</option>
            </select>
          </div>
          <div class="f-field"><label>Class Filter</label>
            <select id="raNoticeClass" onchange="roomAllotNoticeClassFilter=this.value; renderRoomAllotSubBody();">
              <option value="">All Classes</option>
              ${classesPresent.map(c => `<option value="${c}" ${roomAllotNoticeClassFilter===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="f-field"><label>Print Columns</label>
            <select id="raNoticeCols" onchange="roomAllotNoticeCols=Number(this.value); renderRoomAllotSubBody();">
              <option value="2" ${roomAllotNoticeCols===2?'selected':''}>2</option>
              <option value="3" ${roomAllotNoticeCols===3?'selected':''}>3</option>
              <option value="4" ${roomAllotNoticeCols===4?'selected':''}>4</option>
            </select>
          </div>
        </div>
        <div class="table-wrap" style="margin-bottom:12px; max-height:420px; overflow:auto;">
          <table><thead><tr><th>Hall Ticket No.</th><th>Name</th><th>Class</th><th>Room</th></tr></thead>
          <tbody>${filtered.map(d => `<tr><td>${d.ht}</td><td>${d.name}</td><td>${d.className} - ${d.section}</td><td>${d.room}</td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--ink-soft);">No hall ticket numbers generated yet.</td></tr>'}</tbody></table>
        </div>
        ${getResultTabAccess(currentUser.role, 'result_roomallotment', 'print') ? `<button class="btn btn-primary" onclick="printNoticeBoard()">Print Notice Board Sheet</button>` : ''}
      </div>
    `;
  }
  function printNoticeBoard(){
    const data = buildNoticeBoardData();
    let filtered = roomAllotNoticeClassFilter ? data.filter(d => d.className===roomAllotNoticeClassFilter) : data.slice();
    filtered.sort((a,b) => roomAllotNoticeSort==='name' ? a.name.localeCompare(b.name) : a.ht.localeCompare(b.ht, undefined, {numeric:true}));
    const exam = roomAllotCurrentExam();
    const itemsHtml = filtered.map(d => `<div class="nb-item"><b>${d.ht}</b> — ${d.name} (${d.className}-${d.section}) — Room: ${d.room}</div>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Notice Board - ${exam?exam.name:''}</title>
      <style>
        @page{ size:A4; margin:12mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; font-size:11px; }
        h2{ text-align:center; margin-bottom:4px; }
        .nb-sub{ text-align:center; color:#555; margin-bottom:14px; font-size:12px; }
        .nb-cols{ column-count:${roomAllotNoticeCols}; column-gap:18px; }
        .nb-item{ break-inside:avoid; padding:4px 0; border-bottom:1px dotted #ccc; font-size:11px; }
      </style></head>
      <body onload="window.print()">
        <h2>${schoolInfo.name}</h2>
        <div class="nb-sub">${exam?exam.name.toUpperCase():''} — HALL TICKET NUMBER &amp; ROOM ALLOTMENT</div>
        <div class="nb-cols">${itemsHtml}</div>
      </body></html>
    `);
    w.document.close();
  }

  /* --- Document Signatures --- */
  function renderDocumentSignaturesSubTab(el){
    const canEdit = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const principalSig = schoolInfo.principalSignature || '';
    const classTeachers = staffList.filter(st => st.classTeacherClass && isActive(st))
      .sort((a,b) => (a.classTeacherClass+a.classTeacherSection).localeCompare(b.classTeacherClass+b.classTeacherSection));
    const sampleTeacher = classTeachers.find(t => t.signature) || null;
    el.innerHTML = `
      <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">Upload each signing authority's signature once, and it's applied automatically wherever that signature is needed — Admit Cards, Progress Reports, and Certificates — instead of every document needing to be signed by hand afterward. A student's own signature is the one exception; that always stays blank on the admit card for them to sign in person.</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px,1fr)); gap:16px; margin-bottom:16px;">
        <div class="profile-card">
          <h4>Principal / Correspondent Signature</h4>
          <p style="font-size:0.76rem; color:var(--ink-soft); margin:4px 0 12px;">One signature, set once here (also visible under School Profile). Applied school-wide to every Admit Card and Progress Report.</p>
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
            <div style="width:150px; height:60px; border:1.5px dashed var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center; background:#fafafa; overflow:hidden; flex-shrink:0;" id="examSigPrincipalPreviewWrap">
              <img id="examSigPrincipalPreview" src="${principalSig}" style="max-width:100%; max-height:100%; ${principalSig?'':'display:none;'}">
              <span id="examSigPrincipalPlaceholder" style="font-size:0.72rem; color:var(--ink-soft); ${principalSig?'display:none;':''}">No signature</span>
            </div>
            ${canEdit ? `
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">⟳ ${principalSig?'Replace':'Upload'} Signature<input type="file" accept="image/*" id="examSigPrincipalInput" style="display:none;" onchange="previewExamPrincipalSignature(event)"></label>
              ${principalSig ? `<button type="button" class="btn-danger-text" onclick="removeExamPrincipalSignature()">Remove</button>` : ''}
            </div>` : ''}
          </div>
          <span style="font-size:0.7rem; color:var(--ink-soft); display:block; margin-top:8px;">Scanned signature on a plain/white background, PNG preferred · Max 2MB</span>
        </div>
        <div class="profile-card">
          <h4>Class Teacher Signatures</h4>
          <p style="font-size:0.76rem; color:var(--ink-soft); margin:4px 0 12px;">Uploaded once per teacher on their own Staff Profile — right next to their photo — then applied wherever that teacher is the Class Teacher on a report.</p>
          <div class="table-wrap" style="max-height:220px; overflow:auto;">
            <table><thead><tr><th>Class Teacher</th><th>Class</th><th>Signature</th><th></th></tr></thead>
            <tbody>${classTeachers.length ? classTeachers.map(t => `
              <tr>
                <td>${t.firstName} ${t.lastName}</td>
                <td>${t.classTeacherClass} — ${t.classTeacherSection}</td>
                <td>${t.signature ? `<img src="${t.signature}" style="height:22px;">` : '<span style="color:var(--ink-soft); font-size:0.76rem;">Not uploaded</span>'}</td>
                <td><button type="button" class="btn-edit-text" onclick="openStaffWizard('${t.id}')">Manage →</button></td>
              </tr>`).join('') : '<tr><td colspan="4" style="color:var(--ink-soft);">No staff assigned as Class Teacher yet — set this under Staff → Edit Staff → Professional tab.</td></tr>'}
            </tbody></table>
          </div>
        </div>
      </div>
      <div class="profile-card">
        <h4>How it looks on documents</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:4px 0 14px;">Both signatures are applied the moment a document is generated — nobody has to remember to sign anything afterward.</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px,1fr)); gap:14px;">
          <div style="border:1px solid var(--border); border-radius:8px; padding:12px;">
            <div style="font-size:0.74rem; font-weight:700; color:var(--ink-soft); margin-bottom:10px;">ADMIT CARD — SIGNATURE STRIP</div>
            <div style="display:flex; justify-content:space-between; gap:10px;">
              <div style="text-align:center; flex:1;"><div style="height:26px;"></div><div style="border-top:1px solid var(--border); padding-top:4px; font-size:0.72rem;">Student's Signature<br><i style="color:var(--ink-soft);">(signs in person)</i></div></div>
              <div style="text-align:center; flex:1;">${principalSig?`<img src="${principalSig}" style="height:26px; max-width:100%;">`:`<div style="height:26px;"></div>`}<div style="border-top:1px solid var(--border); padding-top:4px; font-size:0.72rem;">Principal / Correspondent<br><i style="color:var(--ink-soft);">(auto-applied)</i></div></div>
            </div>
          </div>
          <div style="border:1px solid var(--border); border-radius:8px; padding:12px;">
            <div style="font-size:0.74rem; font-weight:700; color:var(--ink-soft); margin-bottom:10px;">PROGRESS REPORT — SIGNATURE STRIP</div>
            <div style="display:flex; justify-content:space-between; gap:10px;">
              <div style="text-align:center; flex:1;">${sampleTeacher?`<img src="${sampleTeacher.signature}" style="height:26px; max-width:100%;">`:`<div style="height:26px;"></div>`}<div style="border-top:1px solid var(--border); padding-top:4px; font-size:0.72rem;">Class Teacher<br><i style="color:var(--ink-soft);">(auto-applied)</i></div></div>
              <div style="text-align:center; flex:1;">${principalSig?`<img src="${principalSig}" style="height:26px; max-width:100%;">`:`<div style="height:26px;"></div>`}<div style="border-top:1px solid var(--border); padding-top:4px; font-size:0.72rem;">Principal / Correspondent<br><i style="color:var(--ink-soft);">(auto-applied)</i></div></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  function previewExamPrincipalSignature(e){
    readImageFileWithSizeLimit(e, async dataUrl => {
      schoolInfo.principalSignature = dataUrl;
      await storageSet(SCHOOL_INFO_KEY, schoolInfo);
      showToast('Principal / Correspondent signature saved.', 'burst');
      renderRoomAllotSubBody();
    });
  }
  async function removeExamPrincipalSignature(){
    if(!await showConfirmDialog('Remove the Principal / Correspondent signature? It will need to be re-uploaded before it appears on Admit Cards or Progress Reports again.')) return;
    schoolInfo.principalSignature = '';
    await storageSet(SCHOOL_INFO_KEY, schoolInfo);
    showToast('Signature removed.', 'burst');
    renderRoomAllotSubBody();
  }

  /* --- Tab: Admit Cards --- */
  let admitCardsView = 'grid';
  let admitCardsExamId = '', admitCardsClass = '', admitCardsSection = '';
  let admitCardsPerPage = 4; // 3 or 4 — how many hall-ticket strips are stacked on each printed A4 sheet (Classic Strip layout only)
  let admitCardsTemplateId = ''; // '' = use the default admit card template
  function currentAdmitCardTemplate(){
    return admitCardTemplates.find(t => t.id === admitCardsTemplateId) || admitCardTemplates.find(t => t.isDefault) || admitCardTemplates[0];
  }

  let expandedAdmitClass = '';
  function toggleAdmitClassExpand(cls){
    expandedAdmitClass = (expandedAdmitClass === cls) ? '' : cls;
    renderAdmitCardsGrid(document.getElementById('resultBody'));
  }
  function renderAdmitCardsGrid(body){
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b>Create an exam under the "Exams" tab first.</div>`;
      return;
    }
    if(!admitCardsExamId || !examDefs.find(e => e.id === admitCardsExamId)) admitCardsExamId = examDefs[0].id;
    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${admitCardsExamId===ex.id?'selected':''}>${ex.name}</option>`).join('');
    const raCfg = roomAllotConfigFor(admitCardsExamId);
    const visibleClasses = (raCfg.selectedClasses && raCfg.selectedClasses.length) ? raCfg.selectedClasses : CLASS_LEVELS;
    const gridHtml = buildModernClassGrid(
      visibleClasses,
      (cls, sec) => students.filter(s => s.className===cls && s.section===sec && isActive(s)).length,
      cls => `toggleAdmitClassExpand('${cls}')`,
      (cls, sec) => `openAdmitCardsRoster('${cls}','${sec}')`,
      cls => expandedAdmitClass === cls
    );
    body.innerHTML = `
      <div class="f-field" style="max-width:320px; margin-bottom:20px;">
        <label>Exam</label>
        <select id="admitExamSelect" onchange="admitCardsExamId=this.value; renderResultBody();">${examOptions}</select>
      </div>
      ${(raCfg.selectedClasses && raCfg.selectedClasses.length) ? `<p style="font-size:0.78rem; color:var(--ink-soft); margin:-10px 0 16px;">Showing only the classes selected for this exam under <a onclick="switchResultTab('roomallotment')" style="color:var(--magenta); cursor:pointer; font-weight:600;">Room Allotment → Select Classes</a>.</p>` : ''}
      ${gridHtml}
    `;
  }
  function openAdmitCardsRoster(cls, sec){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    admitCardsClass = cls; admitCardsSection = sec;
    admitCardsView = 'roster';
    renderResultBody();
  }
  function backToAdmitCardsGrid(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    admitCardsView = 'grid';
    renderResultBody();
  }
  function renderAdmitCardsRoster(body){
    const exam = examDefs.find(e => e.id === admitCardsExamId);
    if(!exam){ admitCardsView = 'grid'; return renderExamBody(); }
    const subjects = getExamSubjects(exam, admitCardsClass, admitCardsSection);
    const missingDates = subjects.filter(s => !s.date);
    const list = students.filter(s => s.className===admitCardsClass && s.section===admitCardsSection && isActive(s))
      .sort(compareByRoll);
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToAdmitCardsGrid()">All Classes</a> &nbsp;/&nbsp; ${admitCardsClass} — Section ${admitCardsSection} &nbsp;/&nbsp; ${exam.name}</div>
      ${subjects.length===0 ? `<div class="empty-state" style="margin-bottom:16px;"><b>No subjects configured yet</b>Hall tickets need at least one dated subject — configure subjects for this class &amp; section under the "Exams" tab first.</div>` : ``}
      ${subjects.length>0 && missingDates.length>0 ? `<div class="empty-state" style="margin-bottom:16px; border-color:var(--gold);"><b>⚠ ${missingDates.length} subject${missingDates.length===1?'':'s'} still need${missingDates.length===1?'s':''} an exam date</b>${missingDates.map(s=>s.name).join(', ')} — set a date for each under "Exams" → Configure Subjects before printing hall tickets.</div>` : ``}
      ${(() => {
        const canPrint = getResultTabAccess(currentUser.role, 'result_admitcards', 'print');
        const tmpl = currentAdmitCardTemplate();
        const templateOptions = admitCardTemplates.map(t => `<option value="${t.id}" ${(admitCardsTemplateId?admitCardsTemplateId===t.id:t.isDefault)?'selected':''}>${t.name}</option>`).join('');
        const perPageNote = tmpl && tmpl.layout==='strip'
          ? `<select id="admitCardsPerPageSelect" onchange="admitCardsPerPage=parseInt(this.value);">
              <option value="4" ${admitCardsPerPage===4?'selected':''}>4 per sheet — compact</option>
              <option value="3" ${admitCardsPerPage===3?'selected':''}>3 per sheet — more room to sign</option>
            </select>`
          : `<div style="font-size:0.85rem; color:var(--ink-soft); padding:10px 0;">${tmpl && tmpl.layout==='full' ? '1 per A4 sheet (fixed by this layout)' : '4 per A4 sheet, 2×2 grid (fixed by this layout)'}</div>`;
        return `
      <div style="display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; margin-bottom:16px;">
        ${canPrint ? `<button class="btn btn-primary" onclick="printAdmitCards('${admitCardsClass}','${admitCardsSection}', null)" ${(list.length===0 || subjects.length===0 || missingDates.length>0)?'disabled':''}>Print All Admit Cards</button>` : ''}
        <div class="f-field" style="max-width:230px; margin-bottom:0;">
          <label>Template</label>
          <select id="admitCardsTemplateSelect" onchange="admitCardsTemplateId=this.value; renderResultBody();">${templateOptions}</select>
        </div>
        <div class="f-field" style="max-width:230px; margin-bottom:0;">
          <label>Cards per A4 Sheet</label>
          ${perPageNote}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openTemplateManager('admitcard')">Customize Templates</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Student</th><th>Admission No</th><th></th></tr></thead>
        <tbody>
        ${list.map(s => `<tr>
          <td class="name-cell">${s.firstName} ${s.lastName}</td>
          <td class="id-cell">${s.admissionNo}</td>
          <td>${canPrint ? `<button class="btn-edit-text" ${(subjects.length===0 || missingDates.length>0)?'disabled':''} onclick="printAdmitCards('${admitCardsClass}','${admitCardsSection}', '${s.id}')">Print Admit Card</button>` : ''}</td>
        </tr>`).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No students here</b></div>` : ``}
      </div>
        `; })()}
    `;
  }

  function printAdmitCards(cls, sec, singleStudentId){
    const exam = examDefs.find(e => e.id === admitCardsExamId);
    if(!exam) return;
    const subjects = getExamSubjects(exam, cls, sec).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    if(subjects.length === 0){ showToast('No subjects configured for this class & section yet.'); return; }
    const missingDates = subjects.filter(s => !s.date);
    if(missingDates.length > 0){ showToast(`Set an exam date for: ${missingDates.map(s=>s.name).join(', ')} — every subject needs a date before hall tickets can be generated.`); return; }
    let list = students.filter(s => s.className===cls && s.section===sec && isActive(s));
    if(singleStudentId) list = list.filter(s => s.id === singleStudentId);
    if(list.length === 0) return;
    const logoSrc = document.querySelector('.sb-brand img').src;
    const examPeriod = exam.startDate ? exam.startDate + (exam.endDate && exam.endDate!==exam.startDate ? ' – '+exam.endDate : '') : 'To be announced';
    const tmpl = currentAdmitCardTemplate();
    const roomMap = computeExamHallTicketRoomMap(admitCardsExamId);
    const principalSig = schoolInfo.principalSignature || '';
    const cardTitle = (tmpl.titleOverride||'').trim() || 'Admit Card';
    const instructions = (tmpl.instructionsText||'').split('\n').map(l=>l.trim()).filter(Boolean);
    const ctx = { exam, subjects, list, logoSrc, examPeriod, tmpl, roomMap, principalSig, cardTitle, instructions };

    // Layout is template-driven: 'strip' (Classic Strip, unchanged), 'grid4'
    // (Modern Card, 4-up 2x2 on A4) or 'full' (Full Board-Style, one candidate
    // per A4 sheet with a full instructions block) — see admitCardTemplates.
    const built = tmpl.layout === 'full' ? buildAdmitCardsFull(ctx)
                : tmpl.layout === 'grid4' ? buildAdmitCardsGrid4(ctx)
                : buildAdmitCardsStrip(ctx);

    // Smart print filename: this becomes the print popup's document title, which
    // browsers use to suggest a filename in the native "Save as PDF" dialog —
    // so a descriptive, unique name lands there instead of a generic one.
    const safe = str => (str||'').replace(/[^\w-]+/g,'_').replace(/^_+|_+$/g,'');
    const fileTitle = singleStudentId
      ? `AdmitCard_${safe(list[0].admissionNo)}_${safe((list[0].firstName||'')+(list[0].lastName||''))}_${safe(exam.name)}`
      : `AdmitCards_${safe(cls)}_${safe(sec)}_${safe(exam.name)}`;

    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>${fileTitle}</title>
      <style>
        *{ box-sizing:border-box; }
        @page{ size:A4; margin:8mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; margin:0; }
        ${built.css}
        ${brandWmCss('.ac-strip, .acg-card, .acf-sheet', { size:'50%', opacity:0.06 })}
      </style></head>
      <body onload="window.print()">
        ${built.html}
      </body></html>
    `);
    w.document.close();
  }

  // --- Layout: Classic Strip — 3 or 4 full-width horizontal strips stacked per A4 sheet ---
  function buildAdmitCardsStrip(ctx){
    const { exam, subjects, list, logoSrc, examPeriod, roomMap, principalSig } = ctx;
    const perPage = (admitCardsPerPage===3) ? 3 : 4;
    // Each admit card is a full-width horizontal strip; 3 or 4 are stacked down a
    // portrait A4 sheet (chosen via the "Cards per A4 Sheet" selector). Every
    // subject row carries its own blank cell so a different invigilator can sign
    // in person on that exam's day, instead of one signature covering the whole
    // exam period.
    const stripHtml = (s, isLastInPage) => {
      const ht = getHallTicket(admitCardsExamId, s.id);
      const roomInfo = roomMap[s.id];
      return `
      <div class="ac-strip">
        <div class="ac-col-brand">
          <img class="ac-logo" src="${logoSrc}">
          <div class="ac-school">${schoolInfo.name}</div>
          <div class="ac-addr">${schoolInfo.address||''}</div>
          ${brandLineHtml({ size:'6px', margin:'0 0 1px' })}
          <div class="ac-examname">Admit Card<br>${exam.name}<br>${examPeriod}</div>
        </div>
        <div class="ac-col-student">
          <div class="ac-photo-slot">${s.photo ? `<img src="${s.photo}">` : initials(s)}</div>
          <div class="ac-title">STUDENT DETAILS</div>
          <table class="ac-info">
            <tr><td>Name</td><td>${s.firstName} ${s.lastName}</td></tr>
            <tr><td>Admission No.</td><td>${s.admissionNo}</td></tr>
            <tr><td>Class &amp; Section</td><td>${s.className} — ${s.section}</td></tr>
            <tr><td>Roll No.</td><td>${s.rollNo||'—'}</td></tr>
          </table>
          ${(ht && ht.htNumber) || roomInfo ? `<div class="ac-ht-room-box">Hall Ticket No.: <b>${ht&&ht.htNumber?ht.htNumber:'—'}</b> &nbsp;|&nbsp; Room: <b>${roomInfo?roomInfo.room:'—'}</b></div>` : ''}
        </div>
        <div class="ac-col-subjects">
          <div class="ac-subj-title">SUBJECT-WISE SCHEDULE — sign daily before the exam begins</div>
          <table class="ac-subj-table">
            <thead><tr><th>Subject</th><th class="date-col">Date</th><th class="sign-col">Invigilator's Signature</th></tr></thead>
            <tbody>
            ${subjects.map(sub => `<tr><td>${sub.name}</td><td class="date-cell">${sub.date||'TBA'}</td><td class="sign-cell">&nbsp;</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="ac-col-sign">
          <div class="ac-sign-line">Student's<br>Signature</div>
          <div style="height:3mm;"></div>
          <div class="ac-sign-line ac-sign-auto">${principalSig ? `<img src="${principalSig}">` : ''}Principal /<br>Correspondent</div>
        </div>
        ${!isLastInPage ? `<span class="scissor">✂</span>` : ''}
      </div>
    `;
    };

    const pages = [];
    for(let i=0;i<list.length;i+=perPage) pages.push(list.slice(i, i+perPage));
    const html = pages.map((pageStudents, pIdx) => `
      <div class="ac-page${pIdx < pages.length-1 ? ' ac-pagebreak' : ''}">
        <div class="ac-stack">
          ${pageStudents.map((s,i) => stripHtml(s, i===pageStudents.length-1)).join('')}
        </div>
      </div>
    `).join('');

    const css = `
        .ac-page{ width:100%; }
        .ac-pagebreak{ page-break-after:always; }
        .ac-stack{ display:flex; flex-direction:column; height:281mm; gap:4mm; }
        .ac-strip{ flex:1; border:1.4px solid #333; border-radius:3px; display:flex; overflow:hidden; position:relative; page-break-inside:avoid; }
        .ac-strip:not(:last-child)::after{ content:''; position:absolute; left:-8mm; right:-8mm; bottom:-2.7mm; border-bottom:1px dashed #aaa; }
        .ac-strip .scissor{ position:absolute; left:-6mm; bottom:-4.6mm; font-size:9px; color:#999; background:#fff; padding:0 2px; }

        .ac-col-brand{ width:30mm; background:#faf6ec; border-right:1px solid #333; padding:2mm; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; flex-shrink:0; }
        .ac-logo{ width:11mm; height:11mm; border-radius:50%; object-fit:cover; margin-bottom:1.5mm; }
        .ac-school{ font-weight:700; font-size:7.6px; line-height:1.15; color:#1b2a52; }
        .ac-addr{ font-size:5.6px; color:#666; line-height:1.25; margin-top:1mm; }
        .ac-examname{ margin-top:1.5mm; font-size:6px; font-weight:700; color:#d11073; line-height:1.3; }

        .ac-col-student{ width:47mm; border-right:1px solid #333; padding:2mm 2.5mm; flex-shrink:0; display:flex; flex-direction:column; justify-content:center; position:relative; }
        .ac-title{ font-size:7.2px; font-weight:700; letter-spacing:.03em; color:#666; margin-bottom:1.4mm; }
        .ac-info{ width:76%; font-size:7.4px; border-collapse:collapse; }
        .ac-info td{ padding:0.9px 0; }
        .ac-info td:first-child{ color:#666; width:44%; }
        .ac-info td:last-child{ font-weight:700; }
        .ac-photo-slot{ position:absolute; top:2mm; right:2mm; width:11mm; height:13mm; border:1px solid #999; font-size:8px; font-weight:700; color:#999; display:flex; align-items:center; justify-content:center; text-align:center; background:#f7f7f7; overflow:hidden; }
        .ac-photo-slot img{ width:100%; height:100%; object-fit:cover; }
        .ac-ht-room-box{ margin-top:1.5mm; font-size:6.2px; font-weight:700; color:#0a5c36; background:#e9f9ef; border:1px solid #8fd6ab; border-radius:2px; padding:1mm 1.4mm; text-align:center; }

        .ac-col-subjects{ flex:1; padding:2mm 2.5mm; display:flex; flex-direction:column; justify-content:center; min-width:0; }
        .ac-subj-title{ font-size:6.6px; font-weight:700; color:#666; margin-bottom:1mm; }
        .ac-subj-table{ width:100%; border-collapse:collapse; font-size:6.8px; table-layout:fixed; }
        .ac-subj-table th{ text-align:left; background:#eef0f4; padding:1.2px 3px; font-size:6.4px; border:1px solid #ddd; }
        .ac-subj-table td{ padding:2mm 3px; border:1px solid #ddd; line-height:1; }
        .ac-subj-table th.sign-col, .ac-subj-table td.sign-cell{ width:26mm; }
        .ac-subj-table th.date-col, .ac-subj-table td.date-cell{ width:18mm; }

        .ac-col-sign{ width:20mm; border-left:1px solid #333; padding:2mm 1.6mm; flex-shrink:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; }
        .ac-sign-line{ width:100%; border-top:1px solid #555; text-align:center; font-size:5.6px; color:#666; padding-top:1mm; }
        .ac-sign-auto img{ display:block; max-width:100%; max-height:6mm; margin:0 auto 0.5mm; }
    `;
    return { html, css };
  }

  // --- Layout: Modern Card — 4 compact cards per A4 sheet, 2×2 grid ---
  function buildAdmitCardsGrid4(ctx){
    const { exam, subjects, list, logoSrc, examPeriod, roomMap, principalSig, cardTitle, tmpl } = ctx;
    const cardHtml = (s) => {
      const ht = getHallTicket(admitCardsExamId, s.id);
      const roomInfo = roomMap[s.id];
      return `
      <div class="acg-card">
        <div class="acg-head">
          <img class="acg-logo" src="${logoSrc}">
          <div class="acg-head-text">
            <div class="acg-school">${schoolInfo.name}</div>
            ${brandLineHtml({ size:'7px', align:'left', margin:'0' })}
            <div class="acg-cardtitle">${cardTitle}</div>
          </div>
          <div class="acg-photo">${s.photo ? `<img src="${s.photo}">` : initials(s)}</div>
        </div>
        <div class="acg-examline">${exam.name} &nbsp;·&nbsp; ${examPeriod}</div>
        <table class="acg-info">
          <tr><td>Name</td><td>${s.firstName} ${s.lastName}</td></tr>
          <tr><td>Admission No.</td><td>${s.admissionNo}</td></tr>
          <tr><td>Class</td><td>${s.className} — ${s.section}</td></tr>
          <tr><td>Roll No.</td><td>${s.rollNo||'—'}</td></tr>
          <tr><td>Hall Ticket No.</td><td>${ht&&ht.htNumber?ht.htNumber:'—'}</td></tr>
          <tr><td>Room</td><td>${roomInfo?roomInfo.room:'—'}</td></tr>
        </table>
        <div class="acg-subjcount">${subjects.length} subject${subjects.length===1?'':'s'} — see notice board / class teacher for the full subject-wise date sheet.</div>
        ${tmpl.footerNote ? `<div class="acg-footnote">${tmpl.footerNote}</div>` : ''}
        <div class="acg-signrow">
          <div class="acg-sign">Student's Signature</div>
          <div class="acg-sign acg-sign-auto">${principalSig ? `<img src="${principalSig}">` : ''}Principal</div>
        </div>
      </div>
      `;
    };
    const pages = [];
    for(let i=0;i<list.length;i+=4) pages.push(list.slice(i, i+4));
    const html = pages.map((pageStudents, pIdx) => `
      <div class="acg-page${pIdx < pages.length-1 ? ' acg-pagebreak' : ''}">
        <div class="acg-grid">
          ${pageStudents.map(s => cardHtml(s)).join('')}
        </div>
      </div>
    `).join('');
    const css = `
        .acg-page{ width:100%; }
        .acg-pagebreak{ page-break-after:always; }
        .acg-grid{ display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:6mm; height:281mm; }
        .acg-card{ border:1.6px solid #1b2a52; border-radius:6px; padding:3mm 3.5mm; display:flex; flex-direction:column; page-break-inside:avoid; background:linear-gradient(180deg,#fbfbff 0%,#fff 26%); }
        .acg-head{ display:flex; align-items:center; gap:2.5mm; border-bottom:1.4px solid #1b2a52; padding-bottom:2mm; margin-bottom:2mm; }
        .acg-logo{ width:9mm; height:9mm; border-radius:50%; object-fit:cover; flex-shrink:0; }
        .acg-head-text{ flex:1; min-width:0; }
        .acg-school{ font-weight:800; font-size:9px; color:#1b2a52; line-height:1.15; }
        .acg-cardtitle{ font-size:6.6px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#d11073; margin-top:0.6mm; }
        .acg-photo{ width:12mm; height:14mm; border:1px solid #999; font-size:8px; font-weight:700; color:#999; display:flex; align-items:center; justify-content:center; text-align:center; background:#f7f7f7; overflow:hidden; flex-shrink:0; }
        .acg-photo img{ width:100%; height:100%; object-fit:cover; }
        .acg-examline{ font-size:7px; font-weight:700; color:#333; background:#eef0f4; border-radius:3px; padding:1mm 2mm; margin-bottom:2mm; }
        .acg-info{ width:100%; font-size:7.6px; border-collapse:collapse; margin-bottom:2mm; }
        .acg-info td{ padding:0.8px 0; }
        .acg-info td:first-child{ color:#666; width:42%; }
        .acg-info td:last-child{ font-weight:700; }
        .acg-subjcount{ font-size:6.2px; color:#666; line-height:1.3; margin-bottom:auto; }
        .acg-footnote{ font-size:6px; color:#d11073; font-weight:700; margin-top:1.5mm; }
        .acg-signrow{ display:flex; justify-content:space-between; gap:4mm; margin-top:3mm; }
        .acg-sign{ flex:1; border-top:1px solid #555; text-align:center; font-size:6px; color:#666; padding-top:1mm; }
        .acg-sign-auto img{ display:block; max-width:100%; max-height:6mm; margin:0 auto 0.5mm; }
    `;
    return { html, css };
  }

  // --- Layout: Full Board-Style — one full A4 page per candidate ---
  function buildAdmitCardsFull(ctx){
    const { exam, subjects, list, logoSrc, examPeriod, roomMap, principalSig, cardTitle, instructions, tmpl } = ctx;
    const pageHtml = (s, isLast) => {
      const ht = getHallTicket(admitCardsExamId, s.id);
      const roomInfo = roomMap[s.id];
      return `
      <div class="acf-page${!isLast ? ' acf-pagebreak' : ''}">
        <div class="acf-sheet">
          <div class="acf-header">
            <img class="acf-logo" src="${logoSrc}">
            <div class="acf-head-text">
              <div class="acf-school">${schoolInfo.name}</div>
              <div class="acf-addr">${schoolInfo.address||''}</div>
              ${brandLineHtml({ size:'11px', align:'left', margin:'2px 0 0' })}
            </div>
          </div>
          <div class="acf-title">${cardTitle}</div>
          <div class="acf-examname">${exam.name} &nbsp;·&nbsp; ${examPeriod}</div>
          <div class="acf-body">
            <table class="acf-info">
              <tr><td>Candidate Name</td><td>${s.firstName} ${s.lastName}</td></tr>
              <tr><td>Admission No.</td><td>${s.admissionNo}</td></tr>
              <tr><td>Class &amp; Section</td><td>${s.className} — ${s.section}</td></tr>
              <tr><td>Roll No.</td><td>${s.rollNo||'—'}</td></tr>
              <tr><td>Hall Ticket No.</td><td>${ht&&ht.htNumber?ht.htNumber:'—'}</td></tr>
              <tr><td>Room / Seat</td><td>${roomInfo?(roomInfo.room+(roomInfo.seat?(' / Seat '+roomInfo.seat):'')):'—'}</td></tr>
            </table>
            <div class="acf-photo-slot">${s.photo ? `<img src="${s.photo}">` : initials(s)}</div>
          </div>
          <div class="acf-subj-title">SUBJECT-WISE SCHEDULE</div>
          <table class="acf-subj-table">
            <thead><tr><th>Subject</th><th>Date</th><th>Max Marks</th><th>Invigilator's Signature</th></tr></thead>
            <tbody>
            ${subjects.map(sub => `<tr><td>${sub.name}</td><td>${sub.date||'TBA'}</td><td>${sub.maxMarks||''}</td><td>&nbsp;</td></tr>`).join('')}
            </tbody>
          </table>
          ${instructions.length ? `
          <div class="acf-instr-title">CANDIDATE INSTRUCTIONS</div>
          <ol class="acf-instr">${instructions.map(l => `<li>${l}</li>`).join('')}</ol>
          ` : ''}
          <div class="acf-signrow">
            <div class="acf-sign">Student's Signature</div>
            <div class="acf-sign acf-sign-auto">${principalSig ? `<img src="${principalSig}">` : ''}Principal / Correspondent</div>
          </div>
          ${tmpl.footerNote ? `<div class="acf-footnote">${tmpl.footerNote}</div>` : ''}
        </div>
      </div>
      `;
    };
    const html = list.map((s,i) => pageHtml(s, i===list.length-1)).join('');
    const css = `
        .acf-page{ width:100%; }
        .acf-pagebreak{ page-break-after:always; }
        .acf-sheet{ border:1.6px solid #1b2a52; border-radius:4px; padding:8mm 10mm; min-height:281mm; }
        .acf-header{ display:flex; align-items:center; gap:4mm; border-bottom:2px solid #1b2a52; padding-bottom:3mm; margin-bottom:3mm; }
        .acf-logo{ width:16mm; height:16mm; border-radius:50%; object-fit:cover; flex-shrink:0; }
        .acf-school{ font-weight:800; font-size:16px; color:#1b2a52; }
        .acf-addr{ font-size:9px; color:#666; margin-top:1mm; }
        .acf-title{ text-align:center; font-size:14px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:#d11073; margin-top:2mm; }
        .acf-examname{ text-align:center; font-size:10px; font-weight:700; color:#333; margin-top:1mm; margin-bottom:5mm; }
        .acf-body{ display:flex; gap:8mm; align-items:flex-start; margin-bottom:6mm; }
        .acf-info{ flex:1; font-size:10.5px; border-collapse:collapse; }
        .acf-info td{ padding:2mm 0; border-bottom:1px dotted #ddd; }
        .acf-info td:first-child{ color:#666; width:40%; }
        .acf-info td:last-child{ font-weight:700; }
        .acf-photo-slot{ width:30mm; height:36mm; border:1.4px solid #999; font-size:11px; font-weight:700; color:#999; display:flex; align-items:center; justify-content:center; text-align:center; background:#f7f7f7; overflow:hidden; flex-shrink:0; }
        .acf-photo-slot img{ width:100%; height:100%; object-fit:cover; }
        .acf-subj-title, .acf-instr-title{ font-size:10px; font-weight:700; color:#1b2a52; letter-spacing:.04em; margin-bottom:2mm; border-left:3px solid #d11073; padding-left:2mm; }
        .acf-subj-table{ width:100%; border-collapse:collapse; font-size:9.5px; margin-bottom:6mm; }
        .acf-subj-table th{ text-align:left; background:#eef0f4; padding:2mm 3mm; border:1px solid #ccc; }
        .acf-subj-table td{ padding:2.6mm 3mm; border:1px solid #ccc; }
        .acf-instr{ font-size:9px; color:#333; line-height:1.6; margin:0 0 6mm 4mm; padding:0; }
        .acf-signrow{ display:flex; justify-content:space-between; gap:12mm; margin-top:14mm; }
        .acf-sign{ flex:1; border-top:1px solid #555; text-align:center; font-size:9px; color:#666; padding-top:2mm; }
        .acf-sign-auto img{ display:block; max-width:100%; max-height:10mm; margin:0 auto 1mm; }
        .acf-footnote{ text-align:center; font-size:8px; color:#d11073; font-weight:700; margin-top:4mm; }
    `;
    return { html, css };
  }

  /* --- Tab: Consolidated Report (whole-year, all exams) --- */
  let csCurrentStudentId = '', csSearchDebounce = null;

  let csSelectedGroupId = '';
  function renderConsolidatedTab(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">
        Pulls together exams side by side, with a final consolidated percentage and grade using the <a onclick="switchResultTab('grading')" style="color:var(--magenta); cursor:pointer; font-weight:600;">Grading scheme</a>. Choose a <a onclick="switchResultTab('examtemplates')" style="color:var(--magenta); cursor:pointer; font-weight:600;">Report Period</a> to combine just a subset — like two Unit Tests — or leave it on "All Exams" for the full year-end view.
      </p>
      <div class="ms-toolbar">
        <div class="ms-toolbar-left">
          <div class="search-wrap">
            <input class="input" id="csSearch" placeholder="Search student by name..." autocomplete="off" oninput="onCsSearchInput()" onblur="setTimeout(hideCsSuggestions,150)" onfocus="onCsSearchInput()">
            <div class="search-suggestions" id="csSearchSuggestions"></div>
          </div>
          <select id="csGroupSelect" onchange="onCsGroupChange()">
            <option value="">All Exams (Full Year)</option>
            ${examGroups.map(g => `<option value="${g.id}" ${csSelectedGroupId===g.id?'selected':''}>${g.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="csResult"><div class="empty-state"><b>Search for a student</b>Pick a student above to see their consolidated results.</div></div>
    `;
  }
  function onCsGroupChange(){
    csSelectedGroupId = document.getElementById('csGroupSelect').value;
    if(csCurrentStudentId) loadConsolidatedReport();
  }

  function onCsSearchInput(){
    clearTimeout(csSearchDebounce);
    csSearchDebounce = setTimeout(() => renderCsSuggestions(document.getElementById('csSearch').value.trim()), 150);
  }
  function renderCsSuggestions(q){
    const box = document.getElementById('csSearchSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => (s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql) || (s.admissionNo||'').toLowerCase().includes(ql)).slice(0,8);
    if(matches.length===0){ box.innerHTML = `<div class="sg-empty">No students match "${q}"</div>`; box.classList.add('open'); return; }
    box.innerHTML = matches.map(s => `<div class="sg-item" onmousedown="selectCsSuggestion('${s.id}')">
      <div class="sg-avatar">${s.photo?`<img src="${s.photo}">`:initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('');
    box.classList.add('open');
  }
  function selectCsSuggestion(id){
    hideCsSuggestions();
    document.getElementById('csSearch').value = '';
    csCurrentStudentId = id;
    loadConsolidatedReport();
  }
  function hideCsSuggestions(){
    const box = document.getElementById('csSearchSuggestions');
    if(box) box.classList.remove('open');
  }

  function buildConsolidatedData(studentId, groupId){
    const s = students.find(x => x.id === studentId);
    if(!s) return null;
    const group = groupId ? examGroups.find(g => g.id === groupId) : null;
    let relevantExams = examDefs
      .filter(ex => getExamSubjects(ex, s.className, s.section).length > 0)
      .sort((a,b) => (a.startDate||'').localeCompare(b.startDate||''));
    if(group) relevantExams = relevantExams.filter(ex => group.examIds.includes(ex.id));
    const subjectSet = [];
    relevantExams.forEach(ex => {
      getExamSubjects(ex, s.className, s.section).forEach(sub => {
        if(!subjectSet.includes(sub.name)) subjectSet.push(sub.name);
      });
    });
    subjectSet.sort();

    const matrix = subjectSet.map(subjName => {
      const cells = relevantExams.map(ex => {
        const subjDef = getExamSubjects(ex, s.className, s.section).find(sub => sub.name === subjName);
        if(!subjDef) return null;
        const r = examResults.find(r => r.examId===ex.id && r.studentId===s.id && r.subject===subjName);
        return { marks: r ? r.marks : null, max: subjDef.maxMarks, countable: subjDef.countable !== false };
      });
      return { subject: subjName, cells };
    });

    const examTotals = relevantExams.map((ex, i) => {
      let obtained = 0, max = 0;
      matrix.forEach(row => { const c = row.cells[i]; if(c && c.countable){ max += c.max; obtained += (Number(c.marks)||0); } });
      return { obtained, max };
    });
    const grandObtained = examTotals.reduce((sum,t) => sum+t.obtained, 0);
    const grandMax = examTotals.reduce((sum,t) => sum+t.max, 0);
    const overallPct = grandMax > 0 ? Math.round((grandObtained/grandMax)*1000)/10 : 0;
    const overallGrade = gradeForConsolPct(overallPct);

    return { s, relevantExams, matrix, examTotals, grandObtained, grandMax, overallPct, overallGrade };
  }

  function loadConsolidatedReport(){
    const data = buildConsolidatedData(csCurrentStudentId, csSelectedGroupId);
    if(!data){ document.getElementById('csResult').innerHTML = `<div class="empty-state"><b>No data</b></div>`; return; }
    const { s, relevantExams, matrix, examTotals, grandObtained, grandMax, overallPct, overallGrade } = data;

    if(relevantExams.length === 0){
      document.getElementById('csResult').innerHTML = `
        <div class="profile-head">
          ${s.photo ? `<img class="profile-photo" src="${s.photo}">` : `<div class="profile-photo">${initials(s)}</div>`}
          <div><h2>${s.firstName} ${s.lastName}</h2><div class="p-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
        </div>
        <div class="empty-state"><b>No exams with configured subjects yet</b>Configure subjects for ${s.className} — Section ${s.section} under the "Exams" tab first.</div>
      `;
      return;
    }

    document.getElementById('csResult').innerHTML = `
      <div class="profile-head">
        ${s.photo ? `<img class="profile-photo" src="${s.photo}">` : `<div class="profile-photo">${initials(s)}</div>`}
        <div><h2>${s.firstName} ${s.lastName}</h2><div class="p-meta">${s.admissionNo} · ${s.className} — Section ${s.section} · ${relevantExams.length} exam(s)</div></div>
        <div class="profile-actions"><button class="btn btn-primary" onclick="printConsolidatedReport('${s.id}')">Print Consolidated Report</button></div>
      </div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table><thead><tr>
          <th>Subject</th>
          ${relevantExams.map(ex => `<th>${ex.name}</th>`).join('')}
        </tr></thead>
        <tbody>
        ${matrix.map(row => `<tr>
          <td class="name-cell">${row.subject}</td>
          ${row.cells.map(c => `<td>${c ? (c.marks!==null ? c.marks+' / '+c.max : '— / '+c.max) : '—'}</td>`).join('')}
        </tr>`).join('')}
        <tr class="rcpt-total-row">
          <td><b>Total</b></td>
          ${examTotals.map(t => `<td><b>${t.obtained} / ${t.max}</b></td>`).join('')}
        </tr>
        </tbody></table>
      </div>
      <div class="fee-summary-row" style="margin-top:16px;">
        <div class="fee-sum-card"><b>${grandObtained} / ${grandMax}</b><span>Grand Total</span></div>
        <div class="fee-sum-card"><b>${overallPct}%</b><span>Overall Percentage</span></div>
        <div class="fee-sum-card"><span class="grade-pill ${isFailGrade(overallGrade)?'fail':''}" style="font-size:1.1rem;">${overallGrade}</span><span>Overall Grade</span></div>
      </div>
    `;
  }

  function printConsolidatedReport(studentId){
    const data = buildConsolidatedData(studentId, csSelectedGroupId);
    if(!data) return;
    const { s, relevantExams, matrix, examTotals, grandObtained, grandMax, overallPct, overallGrade } = data;
    const logoSrc = document.querySelector('.sb-brand img').src;
    const t = reportTemplates.find(x => x.isDefault) || reportTemplates[0] || { signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent' };
    const grp = csSelectedGroupId ? examGroups.find(g => g.id === csSelectedGroupId) : null;
    const consolTitle = grp ? `CONSOLIDATED REPORT — ${grp.name.toUpperCase()}` : 'CONSOLIDATED ANNUAL REPORT';

    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Consolidated Report - ${s.firstName} ${s.lastName}</title>
      <style>
        @page{ size:A4; margin:14mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; }
        .rc-head{ display:flex; align-items:center; gap:12px; justify-content:center; margin-bottom:6px; }
        .rc-head img{ width:44px; height:44px; border-radius:50%; }
        .rc-school{ font-weight:700; font-size:18px; text-align:center; }
        .rc-addr{ font-size:11px; text-align:center; color:#555; margin-bottom:14px; }
        .rc-title{ text-align:center; font-weight:700; font-size:13px; border-top:1px solid #333; border-bottom:1px solid #333; padding:5px 0; margin-bottom:14px; }
        .rc-info{ display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-bottom:16px; }
        table{ width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px; }
        th,td{ border:1px solid #999; padding:5px 6px; text-align:left; }
        th{ background:#211A4E; color:#fff; }
        .rc-summary{ display:flex; gap:24px; font-size:13px; margin-bottom:30px; }
        .rc-sign{ display:flex; justify-content:space-between; font-size:12px; margin-top:50px; }
        .rc-sign img{ height:34px; display:block; margin-bottom:3px; }
      </style></head>
      <body onload="window.print()">
        <div class="rc-head"><img src="${logoSrc}"></div>
        <div class="rc-school">${schoolInfo.name}</div>
        <div class="rc-addr">${schoolInfo.address}</div>
        ${brandLineHtml({ size:'11px' })}${brandFixedWmHtml()}
        <div class="rc-title">${consolTitle}</div>
        <div class="rc-info">
          <div>Student Name: <b>${s.firstName} ${s.lastName}</b></div>
          <div>Admission No: <b>${s.admissionNo}</b></div>
          <div>Class &amp; Section: <b>${s.className} — ${s.section}</b></div>
          <div>Father Name: <b>${s.fatherName||'—'}</b></div>
        </div>
        <table>
          <thead><tr><th>Subject</th>${relevantExams.map(ex => `<th>${ex.name}</th>`).join('')}</tr></thead>
          <tbody>
          ${matrix.map(row => `<tr><td>${row.subject}</td>${row.cells.map(c => `<td>${c ? (c.marks!==null ? c.marks+'/'+c.max : '—/'+c.max) : '—'}</td>`).join('')}</tr>`).join('')}
          <tr><td><b>Total</b></td>${examTotals.map(t => `<td><b>${t.obtained}/${t.max}</b></td>`).join('')}</tr>
          </tbody>
        </table>
        <div class="rc-summary">
          <div>Grand Total: <b>${grandObtained} / ${grandMax}</b></div>
          <div>Overall Percentage: <b>${overallPct}%</b></div>
          <div>Overall Grade: <b>${overallGrade}</b></div>
        </div>
        <div class="rc-sign">
          <div>${resolveReportSignature1(t,s) ? `<img src="${resolveReportSignature1(t,s)}">` : ''}${t.signatureLabel1 || 'Class Teacher'}</div>
          <div>${resolveReportSignature2(t) ? `<img src="${resolveReportSignature2(t)}" style="margin-left:auto;">` : ''}${t.signatureLabel2 || 'Principal / Correspondent'}</div>
        </div>
      </body></html>
    `);
    w.document.close();
  }

  /* --- Year-End Marks Card: a "Consolidation Scheme" (built and versioned via
     its own wizard below) is the full formula for one class/subject group's
     annual result — which exam types feed each weighted "bucket", how they
     combine (sum & scale raw marks, average %, latest exam, best/drop-lowest
     N), and each bucket's weight. Only one scheme may be Active for a given
     class+subject at a time (a subject-specific scheme always wins over an
     all-subjects one for the subjects it names, so both can be Active
     together). Anything not referenced by any Active scheme's buckets —
     Prefinals by default — never enters this calculation at all. Once a
     student's result is explicitly "Finalized & Issued" it's frozen forever
     as its own snapshot in yearEndRecords; editing or retiring the scheme
     afterward can never silently change an already-issued marksheet. --- */
  let yeClass = '', yeSection = '', yeView = 'cards', yeEditingSchemeId = null, yeDraft = null;

  function activeSchemesForClass(className){
    return consolSchemes.filter(sc => sc.status==='active' && (!sc.classScope || !sc.classScope.length || sc.classScope.includes(className)));
  }
  // A subject-specific scheme (e.g. the Science 8th-9th scheme) always wins
  // over an all-subjects scheme for the subjects it names — that's what lets
  // both be Active for the same classes simultaneously without ambiguity.
  function activeSchemeForClassSubject(className, subjectName){
    const candidates = activeSchemesForClass(className);
    if(!candidates.length) return null;
    const subjectSpecific = candidates.filter(sc => sc.subjectScope && sc.subjectScope.length && sc.subjectScope.includes(subjectName));
    if(subjectSpecific.length) return subjectSpecific[0];
    return candidates.find(sc => !sc.subjectScope || !sc.subjectScope.length) || null;
  }
  function classesWithActiveScheme(){
    return CLASS_LEVELS.filter(c => activeSchemesForClass(c).length > 0);
  }
  // Two schemes only truly conflict when they'd be equally-specific candidates
  // for the same class+subject — two general (all-subjects) schemes covering
  // the same class, or two subject-scoped schemes sharing a named subject. A
  // general scheme + a subject-specific one covering the same class is fine:
  // the specific one simply wins for its own subjects (see resolver above).
  function schemesOverlap(a, b){
    const aClasses = a.classScope||[], bClasses = b.classScope||[];
    const classesOverlap = (!aClasses.length || !bClasses.length) || aClasses.some(c => bClasses.includes(c));
    if(!classesOverlap) return false;
    const aGeneral = !(a.subjectScope && a.subjectScope.length), bGeneral = !(b.subjectScope && b.subjectScope.length);
    if(aGeneral && bGeneral) return true;
    if(!aGeneral && !bGeneral) return a.subjectScope.some(sub => b.subjectScope.includes(sub));
    return false;
  }
  function memberTypeNamesForBucket(bucket){
    return (bucket.memberTypeIds||[]).map(id => { const t = examTypes.find(x => x.id===id); return t ? t.name : null; }).filter(Boolean);
  }
  function examsForBucket(bucket){
    const names = memberTypeNamesForBucket(bucket);
    return examDefs.filter(ex => names.includes(ex.examType));
  }
  // Combines whatever member exams already have marks for this subject,
  // according to the bucket's chosen method. Every method is marks-aware —
  // "Sum & Scale" is marks-weighted (an 80-mark exam naturally counts for
  // more than a 50-mark one, matching how the official AP formula actually
  // works), not just an equal-weight average of each exam's own percentage.
  function computeBucketForSubject(bucket, studentId, className, section, subjectName){
    const exams = examsForBucket(bucket);
    const withData = exams.map(ex => {
      const subjDef = getExamSubjects(ex, className, section).find(s => s.name === subjectName);
      if(!subjDef) return null;
      const max = Number(subjDef.maxMarks) || 0;
      if(max <= 0) return null;
      const res = examResults.find(r => r.examId===ex.id && r.studentId===studentId && r.subject===subjectName);
      if(!res) return null;
      const marks = res.absent ? 0 : (Number(res.marks)||0);
      return { ex, marks, max, pct: (marks/max)*100 };
    }).filter(Boolean);
    if(!withData.length) return null;
    let combinedPct, detail;
    switch(bucket.method){
      case 'sum-scaled': {
        const sumMarks = withData.reduce((a,x) => a+x.marks, 0);
        const sumMax = withData.reduce((a,x) => a+x.max, 0);
        combinedPct = sumMax > 0 ? (sumMarks/sumMax)*100 : 0;
        detail = `${withData.length}/${exams.length} exam(s) · ${sumMarks}/${sumMax}`;
        break;
      }
      case 'best-n': {
        const n = Math.max(1, Number(bucket.n)||1);
        const sorted = withData.slice().sort((a,b) => b.pct-a.pct).slice(0, n);
        combinedPct = sorted.reduce((a,x) => a+x.pct, 0) / sorted.length;
        detail = `best ${sorted.length} of ${withData.length}`;
        break;
      }
      case 'drop-lowest-n': {
        const n = Math.max(0, Number(bucket.n)||0);
        const sorted = withData.slice().sort((a,b) => b.pct-a.pct);
        const kept = (n > 0 && sorted.length > n) ? sorted.slice(0, sorted.length-n) : sorted;
        combinedPct = kept.reduce((a,x) => a+x.pct, 0) / kept.length;
        detail = `dropped lowest ${Math.min(n, sorted.length-1)} of ${sorted.length}`;
        break;
      }
      case 'latest': {
        const byDate = withData.slice().sort((a,b) => (a.ex.startDate||'').localeCompare(b.ex.startDate||''));
        const latest = byDate[byDate.length-1];
        combinedPct = latest.pct;
        detail = latest.ex.name;
        break;
      }
      case 'avg-pct':
      default: {
        combinedPct = withData.reduce((a,x) => a+x.pct, 0) / withData.length;
        detail = `${withData.length}/${exams.length} exam(s), averaged`;
      }
    }
    return { pct: combinedPct, detail };
  }
  function computeYearEndSubjectWithScheme(scheme, studentId, className, section, subjectName){
    if(!scheme) return null;
    let weightedSum = 0, weightAvailable = 0;
    const breakdown = [];
    scheme.buckets.forEach(b => {
      const r = computeBucketForSubject(b, studentId, className, section, subjectName);
      if(r){
        weightedSum += (r.pct/100) * Number(b.weight||0);
        weightAvailable += Number(b.weight||0);
        breakdown.push({ label: b.label, detail: r.detail, pct: r.pct, weight: Number(b.weight||0) });
      }
    });
    if(weightAvailable === 0) return null;
    const totalWeight = scheme.buckets.reduce((a,b) => a+Number(b.weight||0), 0) || Number(scheme.totalMarks) || 100;
    const pct = (weightedSum / weightAvailable) * 100; // scaled up if not everything's been conducted yet
    return { pct: Math.round(pct*10)/10, weightAvailable, totalWeight, breakdown, schemeId: scheme.id, schemeName: scheme.name };
  }
  function computeYearEndSubject(studentId, className, section, subjectName){
    return computeYearEndSubjectWithScheme(activeSchemeForClassSubject(className, subjectName), studentId, className, section, subjectName);
  }
  // The subject roster for the card: the union of every countable subject
  // across every exam this class is offered (FA, SA, Prefinals — whatever
  // exists), so a subject never silently drops off the card just because one
  // exam type happened to omit it. Whether it actually earns a mark on the
  // card is decided separately, by whether any Active scheme's buckets cover it.
  function yearEndSubjectRoster(className, section){
    const names = new Set();
    examDefs.forEach(ex => {
      if(!classAllowedForExamType(ex.examType, className)) return;
      getExamSubjects(ex, className, section).forEach(s => { if(s.countable !== false) names.add(s.name); });
    });
    return Array.from(names);
  }
  function computeYearEndForStudentWithSchemeResolver(studentId, className, section, resolverFn){
    const roster = yearEndSubjectRoster(className, section);
    const subjects = roster.map(name => {
      const r = computeYearEndSubjectWithScheme(resolverFn(name), studentId, className, section, name);
      return { name, pct: r?r.pct:null, grade: r?gradeForConsolPct(r.pct):'—', breakdown: r?r.breakdown:[], complete: r?(r.weightAvailable>=r.totalWeight):false, schemeName: r?r.schemeName:null, schemeId: r?r.schemeId:null };
    });
    const withData = subjects.filter(s => s.pct !== null);
    const overallPct = withData.length ? Math.round((withData.reduce((a,s) => a+s.pct, 0)/withData.length)*10)/10 : null;
    const overallGrade = overallPct !== null ? gradeForConsolPct(overallPct) : '—';
    return { subjects, overallPct, overallGrade, allComplete: subjects.length>0 && subjects.every(s => s.complete) };
  }
  function computeYearEndForStudent(studentId, className, section){
    return computeYearEndForStudentWithSchemeResolver(studentId, className, section, (subjectName) => activeSchemeForClassSubject(className, subjectName));
  }

  /* --- Finalize & Issue: freezes today's computed result as a permanent,
     never-recomputed snapshot per student per academic year. A student
     without a frozen record still shows live/provisional figures that move
     as marks are entered — printing before finalizing is fine, it's just
     watermarked PROVISIONAL. --- */
  function yearEndRecordFor(studentId){
    return yearEndRecords.find(r => r.studentId===studentId && r.academicYear===currentAcademicYearValue);
  }
  function buildYearEndRecord(s, existing){
    const r = computeYearEndForStudent(s.id, s.className, s.section);
    if(!r.subjects.length || r.overallPct===null) return null;
    return {
      id: existing ? existing.id : 'yer_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      studentId: s.id, className: s.className, section: s.section, academicYear: currentAcademicYearValue,
      subjects: r.subjects, overallPct: r.overallPct, overallGrade: r.overallGrade,
      generatedAt: new Date().toISOString(), generatedBy: currentUser ? currentUser.username : '',
    };
  }
  async function finalizeYearEnd(studentId){
    const s = students.find(x => x.id===studentId);
    if(!s) return;
    const existing = yearEndRecordFor(studentId);
    if(existing && !await showConfirmDialog('This student already has a finalized Year-End record for this year. Re-finalizing overwrites it with today\'s figures. Continue?')) return;
    const record = buildYearEndRecord(s, existing);
    if(!record){ showToast('No marks entered yet — nothing to finalize.'); return; }
    if(existing){ const idx = yearEndRecords.findIndex(x => x.id===existing.id); yearEndRecords[idx] = record; } else yearEndRecords.push(record);
    await storageSet(YEAR_END_RECORDS_KEY, yearEndRecords);
    showToast('Year-End result finalized & issued.', 'burst');
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function unfinalizeYearEnd(studentId){
    if(!await showConfirmDialog('Remove the finalized Year-End record so it goes back to a live/provisional calculation? Marks already entered are untouched — only the frozen snapshot is removed.')) return;
    yearEndRecords = yearEndRecords.filter(r => !(r.studentId===studentId && r.academicYear===currentAcademicYearValue));
    await storageSet(YEAR_END_RECORDS_KEY, yearEndRecords);
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function finalizeBulkYearEnd(){
    const list = students.filter(s => s.className===yeClass && s.section===yeSection && isActive(s));
    if(!list.length) return;
    if(!await showConfirmDialog(`Finalize & issue Year-End results for all ${list.length} students in ${yeClass} — Section ${yeSection}? This freezes today's figures for each; anyone with no marks yet is skipped.`)) return;
    let count = 0;
    for(const s of list){
      const existing = yearEndRecordFor(s.id);
      const record = buildYearEndRecord(s, existing);
      if(!record) continue;
      if(existing){ const idx = yearEndRecords.findIndex(x => x.id===existing.id); yearEndRecords[idx] = record; } else yearEndRecords.push(record);
      count++;
    }
    await storageSet(YEAR_END_RECORDS_KEY, yearEndRecords);
    showToast(`Finalized & issued for ${count} student(s).`, 'burst');
    renderYearEndTab(document.getElementById('resultBody'));
  }

  /* --- Cards view / Schemes wizard dispatcher --- */
  function renderYearEndTab(body){
    if(yeView === 'schemes') return renderConsolSchemesTab(body);
    return renderYearEndCardsView(body);
  }
  function renderYearEndCardsView(body){
    const classesWithTypes = classesWithActiveScheme();
    const headerBar = `<div style="display:flex; align-items:center; justify-content:flex-end; margin-bottom:10px;"><a onclick="yeView='schemes'; renderYearEndTab(document.getElementById('resultBody'));" style="color:var(--magenta); cursor:pointer; font-weight:600;">⚙ Manage Consolidation Schemes</a></div>`;
    if(classesWithTypes.length === 0){
      body.innerHTML = headerBar + `<div class="empty-state"><b>No Active Consolidation Scheme yet</b>Open "Manage Consolidation Schemes" above and use "Add AP defaults" for a ready-made, fully-editable starting point — or build your own — then Activate it.</div>`;
      return;
    }
    if(!yeClass || !classesWithTypes.includes(yeClass)) yeClass = classesWithTypes[0];
    if(!yeSection) yeSection = SECTIONS[0];
    const roster = yearEndSubjectRoster(yeClass, yeSection);
    const list = students.filter(s => s.className===yeClass && s.section===yeSection && isActive(s));
    const schemesInUse = activeSchemesForClass(yeClass);
    const cfg = yearEndPrintConfig;
    body.innerHTML = headerBar + `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:14px; max-width:680px;">
        The official annual result — computed from whichever Consolidation Scheme is Active for a subject. Anything not part of an Active scheme (like Prefinals) stays out of this entirely.
      </p>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
        ${schemesInUse.map(sc => `<span class="pill" style="background:rgba(33,26,78,0.06);">${sc.name} — ${sc.buckets.map(b=>`${b.label} ${b.weight}`).join(' + ')} = ${sc.totalMarks}${sc.subjectScope&&sc.subjectScope.length?' ('+sc.subjectScope.join(', ')+')':''}</span>`).join('')}
      </div>
      <div class="form-grid" style="max-width:420px; margin-bottom:16px;">
        <div class="f-field"><label>Class</label><select onchange="yeClass=this.value; renderYearEndTab(document.getElementById('resultBody'));">${classesWithTypes.map(c => `<option ${c===yeClass?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="f-field"><label>Section</label><select onchange="yeSection=this.value; renderYearEndTab(document.getElementById('resultBody'));">${SECTIONS.map(sec => `<option ${sec===yeSection?'selected':''}>${sec}</option>`).join('')}</select></div>
      </div>
      <div class="profile-card" style="margin-bottom:16px; max-width:420px;">
        <h4 style="margin:0 0 10px;">Page Setup</h4>
        <div class="form-grid">
          <div class="f-field"><label>Orientation</label>
            <select id="yeOrientation" onchange="updateYearEndPrintConfig()">
              <option value="portrait" ${cfg.orientation==='portrait'?'selected':''}>Portrait</option>
              <option value="landscape" ${cfg.orientation==='landscape'?'selected':''}>Landscape</option>
            </select>
          </div>
          <div class="f-field"><label>Page Size</label>
            <select id="yePageSize" onchange="updateYearEndPrintConfig()">
              <option value="A4" ${cfg.pageSize==='A4'?'selected':''}>A4</option>
              <option value="Legal" ${cfg.pageSize==='Legal'?'selected':''}>Legal</option>
            </select>
          </div>
          <div class="f-field full"><label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="yeCompact" style="width:auto;" ${cfg.compact?'checked':''} onchange="updateYearEndPrintConfig()"> Compact layout (fits more subjects/buckets on one A4 page)</label></div>
        </div>
      </div>
      ${roster.length===0 ? `<div class="empty-state"><b>No countable subjects found yet for ${yeClass}</b>Configure subjects under Manage Exams for at least one exam first.</div>` : `
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" onclick="finalizeBulkYearEnd()" ${list.length===0?'disabled':''}>✅ Finalize &amp; Issue — Whole Class</button>
        <button class="btn btn-primary btn-sm" onclick="printBulkYearEndCards()" ${list.length===0?'disabled':''}>🖨️ Print Year-End Cards — ${yeClass} Section ${yeSection}</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Student</th><th>Admission No</th>${roster.map(n => `<th>${n}</th>`).join('')}<th>Overall %</th><th>Grade</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${list.length ? list.map(s => {
          const finalized = yearEndRecordFor(s.id);
          const r = finalized ? { subjects: finalized.subjects, overallPct: finalized.overallPct, overallGrade: finalized.overallGrade } : computeYearEndForStudent(s.id, yeClass, yeSection);
          const bySubject = {}; r.subjects.forEach(su => bySubject[su.name]=su);
          return `<tr>
            <td class="name-cell">${s.firstName} ${s.lastName}</td>
            <td>${s.admissionNo}</td>
            ${roster.map(n => { const su=bySubject[n]; return `<td>${su && su.pct!==null ? su.pct+'%' : '—'}${su && !finalized && !su.complete ? ' <span style="color:var(--ink-soft); font-size:0.72rem;">(partial)</span>' : ''}</td>`; }).join('')}
            <td><b>${r.overallPct!==null ? r.overallPct+'%' : '—'}</b></td>
            <td><span class="grade-pill ${isFailGrade(r.overallGrade)?'fail':''}">${r.overallGrade}</span></td>
            <td>${finalized ? `<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Finalized</span>` : `<span class="pill" style="background:rgba(203,154,46,0.18); color:#8a6a1f;">Provisional</span>`}</td>
            <td><button class="btn-edit-text" onclick="printYearEndCard('${s.id}')">Print</button>&nbsp;·&nbsp;${finalized ? `<button class="btn-danger-text" onclick="unfinalizeYearEnd('${s.id}')">Un-finalize</button>` : `<button class="btn-edit-text" onclick="finalizeYearEnd('${s.id}')">Finalize</button>`}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="${roster.length+6}"><div class="empty-state"><b>No students in ${yeClass} — Section ${yeSection}</b></div></td></tr>`}
        </tbody></table>
      </div>
      `}
    `;
  }
  async function updateYearEndPrintConfig(){
    yearEndPrintConfig.orientation = document.getElementById('yeOrientation').value;
    yearEndPrintConfig.pageSize = document.getElementById('yePageSize').value;
    yearEndPrintConfig.compact = document.getElementById('yeCompact').checked;
    await storageSet(YEAR_END_PRINT_CFG_KEY, yearEndPrintConfig);
  }

  /* --- Consolidation Schemes: list + wizard editor --- */
  function newSchemeSkeleton(){
    const ts = Date.now();
    return {
      id: 'scheme_'+ts+'_'+Math.random().toString(36).slice(2,7),
      name: '', academicYear: currentAcademicYearValue || '', status: 'draft',
      classScope: [], subjectScope: [], totalMarks: 100,
      buckets: [
        { id:'b_'+ts+'_a', label:'Internal Assessment', memberTypeIds:[], method:'sum-scaled', weight:20, n:1 },
        { id:'b_'+ts+'_b', label:'Annual Exam', memberTypeIds:[], method:'latest', weight:80, n:1 },
      ],
    };
  }
  function renderConsolSchemesTab(body){
    if(yeEditingSchemeId) return renderSchemeEditorView(body);
    const byYear = {};
    consolSchemes.forEach(sc => { const y = sc.academicYear || '—'; (byYear[y] = byYear[y]||[]).push(sc); });
    const years = Object.keys(byYear).sort().reverse();
    const statusBadge = (st) => {
      const map = { draft:['Draft','rgba(203,154,46,0.18)','#8a6a1f'], active:['Active','rgba(24,143,134,0.15)','#0f6a63'], archived:['Archived','rgba(0,0,0,0.06)','var(--ink-soft)'] };
      const [label,bg,fg] = map[st] || map.draft;
      return `<span class="pill" style="background:${bg}; color:${fg};">${label}</span>`;
    };
    body.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <a onclick="yeView='cards'; renderYearEndTab(document.getElementById('resultBody'));" style="color:var(--magenta); cursor:pointer; font-weight:600;">← Back to Year-End Cards</a>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="quickSetupConsolSchemes()">⚡ Add AP ${currentAcademicYearValue||''} defaults</button>
          <button class="btn btn-primary btn-sm" onclick="openSchemeEditor()">+ New Scheme</button>
        </div>
      </div>
      <p style="font-size:0.82rem; color:var(--ink-soft); margin:0 0 16px; max-width:700px;">A Scheme is the full formula for one class/subject group's Year-End result — which exams feed it, how they combine, and their weight. Build or edit freely as a Draft (with a live preview against real entered marks), then Activate when ready. Only one Active scheme may cover a given class+subject at a time — activating one automatically retires any overlapping Active scheme, and next year you can Duplicate instead of starting over.</p>
      ${years.length===0 ? `<div class="empty-state"><b>No consolidation schemes yet</b>Use "Add AP defaults" for a ready-made starting point (fully editable), or "+ New Scheme" to build your own from scratch.</div>` : years.map(y => `
        <div class="profile-card" style="margin-bottom:16px;">
          <h4 style="margin:0 0 10px;">Academic Year ${y}</h4>
          ${byYear[y].map(sc => `
            <div class="list-manage-row">
              <div>
                <div class="lm-name">${sc.name || '(untitled scheme)'} ${statusBadge(sc.status)}</div>
                <div class="lm-meta">${sc.buckets.map(b=>`${b.label} ${b.weight}`).join(' + ')} = ${sc.totalMarks} &nbsp;·&nbsp; ${sc.classScope && sc.classScope.length ? sc.classScope.join(', ') : 'All classes'}${sc.subjectScope && sc.subjectScope.length ? ' · ' + sc.subjectScope.join(', ') : ''}</div>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn-edit-text" onclick="openSchemeEditor('${sc.id}')">Edit</button>
                ${sc.status!=='active' ? `<button class="btn-edit-text" onclick="activateScheme('${sc.id}')">Activate</button>` : `<button class="btn-danger-text" onclick="archiveScheme('${sc.id}')">Retire</button>`}
                <button class="btn-edit-text" onclick="duplicateSchemeForNewYear('${sc.id}')">Duplicate for new year</button>
                <button class="btn-danger-text" onclick="deleteScheme('${sc.id}')">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    `;
  }
  function renderSchemeEditorView(body){
    const d = yeDraft;
    const methodOptions = (selected) => `
      <option value="sum-scaled" ${selected==='sum-scaled'?'selected':''}>Sum &amp; Scale (marks-weighted)</option>
      <option value="avg-pct" ${selected==='avg-pct'?'selected':''}>Average of % (equal weight per exam)</option>
      <option value="latest" ${selected==='latest'?'selected':''}>Latest / only exam</option>
      <option value="best-n" ${selected==='best-n'?'selected':''}>Best N of these exams</option>
      <option value="drop-lowest-n" ${selected==='drop-lowest-n'?'selected':''}>Drop lowest N, average the rest</option>
    `;
    const totalWeight = d.buckets.reduce((a,b) => a+Number(b.weight||0), 0);
    const isExisting = consolSchemes.some(x => x.id===d.id);
    body.innerHTML = `
      <a onclick="closeSchemeEditor()" style="color:var(--magenta); cursor:pointer; font-weight:600;">← Back to Schemes</a>
      <h4 style="margin:14px 0 4px;">${isExisting ? 'Edit' : 'New'} Consolidation Scheme</h4>
      <p style="font-size:0.82rem; color:var(--ink-soft); margin:0 0 16px; max-width:680px;">Pre-filled with sensible defaults below — change anything: the name, which classes/subjects it applies to, how many buckets, which exams feed each one, how they combine, and their weight.</p>
      <div class="profile-card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="f-field"><label>Scheme Name</label><input type="text" id="scName" value="${d.name||''}" placeholder="e.g. AP Pattern 2026-27 — Standard"></div>
          <div class="f-field"><label>Academic Year</label><input type="text" id="scYear" value="${d.academicYear||''}" placeholder="e.g. 2026-27"></div>
          <div class="f-field"><label>Total Marks <span style="font-weight:400; color:var(--ink-soft);">(usually 100)</span></label><input type="number" id="scTotal" value="${d.totalMarks||100}" min="1" oninput="updateSchemeWeightTotalDisplay()"></div>
        </div>
        <div class="f-field full" style="margin-top:10px;">
          <label>Applies To — Classes <span style="font-weight:400; color:var(--ink-soft);">(leave all unchecked for every class)</span></label>
          <div style="display:flex; flex-wrap:wrap; gap:8px; max-height:140px; overflow-y:auto; margin-top:6px;">
            ${CLASS_LEVELS.map(c => `<label class="admission-toggle"><input type="checkbox" class="sc-class-check" value="${c}" ${d.classScope && d.classScope.includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}
          </div>
        </div>
        <div class="f-field full" style="margin-top:10px;">
          <label>Applies To — Subjects <span style="font-weight:400; color:var(--ink-soft);">(leave blank for every subject)</span></label>
          <input type="text" id="scSubjects" value="${(d.subjectScope||[]).join(', ')}" placeholder="Leave blank for all subjects, or list specific ones e.g. Physical Science, Biological Science">
          <p style="font-size:0.76rem; color:var(--ink-soft); margin-top:4px;">A subject-specific scheme always takes priority over an all-subjects one for the subjects it names — both can be Active for the same classes at once.</p>
        </div>
      </div>
      <div class="profile-card" style="margin-bottom:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
          <h4 style="margin:0;">Buckets</h4>
          <div>Weight total: <b id="scWeightTotal" style="color:${totalWeight===Number(d.totalMarks||100)?'#0f6a63':'#b45309'};">${totalWeight} / ${d.totalMarks||100}</b></div>
        </div>
        ${d.buckets.map((b,i) => `
          <div class="scb-row" data-idx="${i}" style="border:1px solid var(--border-color,#e5e7eb); border-radius:10px; padding:14px; margin-bottom:12px;">
            <div class="form-grid">
              <div class="f-field full"><label>Bucket Label</label><input type="text" class="scb-label" value="${b.label||''}" placeholder="e.g. Internal Assessment"></div>
              <div class="f-field"><label>Combine By</label><select class="scb-method" onchange="this.closest('.scb-row').querySelector('.scb-n-wrap').style.display = (this.value==='best-n'||this.value==='drop-lowest-n') ? '' : 'none';">${methodOptions(b.method)}</select></div>
              <div class="f-field"><label>Weight</label><input type="number" class="scb-weight" value="${b.weight||0}" min="0" oninput="updateSchemeWeightTotalDisplay()"></div>
              <div class="f-field scb-n-wrap" style="display:${(b.method==='best-n'||b.method==='drop-lowest-n')?'':'none'};"><label>N</label><input type="number" class="scb-n" value="${b.n||1}" min="1"></div>
            </div>
            <div class="f-field full" style="margin-top:6px;">
              <label>Member Exam Types <span style="font-weight:400; color:var(--ink-soft);">(which exams feed this bucket)</span></label>
              <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
                ${examTypes.length ? examTypes.map(t => `<label class="admission-toggle"><input type="checkbox" class="scb-member" value="${t.id}" ${b.memberTypeIds && b.memberTypeIds.includes(t.id) ? 'checked' : ''}> ${t.name}</label>`).join('') : `<span style="color:var(--ink-soft); font-size:0.82rem;">No exam types yet — add some under the Exams tab first.</span>`}
              </div>
            </div>
            <div style="text-align:right; margin-top:8px;"><button type="button" class="btn-danger-text" onclick="removeSchemeBucket(${i})">Remove bucket</button></div>
          </div>
        `).join('')}
        <button type="button" class="btn btn-ghost btn-sm" onclick="addSchemeBucket()">+ Add Bucket</button>
      </div>
      <div class="profile-card" style="margin-bottom:16px;">
        <h4 style="margin:0 0 10px;">Preview against real marks</h4>
        <div class="form-grid" style="max-width:420px;">
          <div class="f-field"><label>Class</label><select id="scPreviewClass">${(d.classScope && d.classScope.length ? d.classScope : CLASS_LEVELS).map(c => `<option>${c}</option>`).join('')}</select></div>
          <div class="f-field"><label>Section</label><select id="scPreviewSection">${SECTIONS.map(sec => `<option>${sec}</option>`).join('')}</select></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="previewSchemeDraft()" style="margin-top:6px;">🔍 Preview with real entered marks</button>
        <div id="scPreviewBox" style="margin-top:12px;"></div>
      </div>
      <div class="modal-actions" style="justify-content:flex-start; gap:10px;">
        <button type="button" class="btn btn-ghost" onclick="saveSchemeDraftFromEditor(false)">Save as Draft</button>
        <button type="button" class="btn btn-primary" onclick="saveSchemeDraftFromEditor(true)">Save &amp; Activate</button>
      </div>
    `;
  }
  function updateSchemeWeightTotalDisplay(){
    const total = Array.from(document.querySelectorAll('.scb-weight')).reduce((a,i) => a+(Number(i.value)||0), 0);
    const totalMarksEl = document.getElementById('scTotal');
    const totalMarks = totalMarksEl ? (Number(totalMarksEl.value)||100) : 100;
    const el = document.getElementById('scWeightTotal');
    if(el){ el.textContent = `${total} / ${totalMarks}`; el.style.color = total===totalMarks ? '#0f6a63' : '#b45309'; }
  }
  // Reads every live form field back into yeDraft. Called before any
  // structural change (add/remove bucket) or save/activate/preview action —
  // simple fields (name, weights, member checkboxes) are read on demand
  // rather than kept in sync on every keystroke, so typing never triggers a
  // re-render and never loses cursor position.
  function readSchemeDraftFromForm(){
    if(!yeDraft) return;
    const nameEl = document.getElementById('scName');
    if(nameEl) yeDraft.name = nameEl.value.trim();
    const yearEl = document.getElementById('scYear');
    if(yearEl) yeDraft.academicYear = yearEl.value.trim();
    const totalEl = document.getElementById('scTotal');
    if(totalEl) yeDraft.totalMarks = Number(totalEl.value) || 100;
    const classChecks = document.querySelectorAll('.sc-class-check');
    if(classChecks.length) yeDraft.classScope = Array.from(classChecks).filter(c => c.checked).map(c => c.value);
    const subjEl = document.getElementById('scSubjects');
    if(subjEl) yeDraft.subjectScope = subjEl.value.split(',').map(x => x.trim()).filter(Boolean);
    document.querySelectorAll('.scb-row').forEach(row => {
      const idx = Number(row.getAttribute('data-idx'));
      const b = yeDraft.buckets[idx];
      if(!b) return;
      b.label = row.querySelector('.scb-label').value.trim();
      b.method = row.querySelector('.scb-method').value;
      b.weight = Number(row.querySelector('.scb-weight').value) || 0;
      const nInput = row.querySelector('.scb-n');
      if(nInput) b.n = Number(nInput.value) || 1;
      b.memberTypeIds = Array.from(row.querySelectorAll('.scb-member:checked')).map(c => c.value);
    });
  }
  function addSchemeBucket(){
    readSchemeDraftFromForm();
    yeDraft.buckets.push({ id:'b_'+Date.now()+'_'+Math.random().toString(36).slice(2,5), label:'New Bucket', memberTypeIds:[], method:'sum-scaled', weight:0, n:1 });
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function removeSchemeBucket(idx){
    readSchemeDraftFromForm();
    yeDraft.buckets.splice(idx, 1);
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function previewSchemeDraft(){
    readSchemeDraftFromForm();
    const previewClassEl = document.getElementById('scPreviewClass');
    const previewSectionEl = document.getElementById('scPreviewSection');
    const previewClass = previewClassEl ? previewClassEl.value : (yeDraft.classScope[0] || CLASS_LEVELS[0]);
    const previewSection = previewSectionEl ? previewSectionEl.value : SECTIONS[0];
    const list = students.filter(s => s.className===previewClass && s.section===previewSection && isActive(s)).slice(0, 15);
    const box = document.getElementById('scPreviewBox');
    if(!box) return;
    if(!list.length){ box.innerHTML = `<div class="empty-state"><b>No students in ${previewClass} — Section ${previewSection}</b></div>`; return; }
    const rows = list.map(s => {
      const r = computeYearEndForStudentWithSchemeResolver(s.id, previewClass, previewSection, () => yeDraft);
      return `<tr><td>${s.firstName} ${s.lastName}</td><td>${r.overallPct!==null ? r.overallPct+'%' : '—'}</td><td>${r.overallGrade}</td></tr>`;
    }).join('');
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Overall %</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table></div><p style="font-size:0.74rem; color:var(--ink-soft); margin-top:6px;">Preview only — nothing is saved yet.</p>`;
  }
  async function saveSchemeDraftFromEditor(activate){
    readSchemeDraftFromForm();
    if(!yeDraft.name){ showToast('Give the scheme a name.'); return; }
    if(!yeDraft.buckets.length){ showToast('Add at least one bucket.'); return; }
    const totalWeight = yeDraft.buckets.reduce((a,b) => a+Number(b.weight||0), 0);
    if(Math.round(totalWeight) !== Math.round(Number(yeDraft.totalMarks)||100) && !await showConfirmDialog(`Bucket weights add up to ${totalWeight}, not the scheme's total (${yeDraft.totalMarks}). Save anyway?`)) return;
    const toSave = JSON.parse(JSON.stringify(yeDraft));
    const idx = consolSchemes.findIndex(s => s.id===toSave.id);
    if(idx>=0) consolSchemes[idx] = toSave; else consolSchemes.push(toSave);
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    if(activate){ await activateScheme(toSave.id); return; }
    showToast('Scheme saved as draft.', 'burst');
    yeEditingSchemeId = null; yeDraft = null;
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function openSchemeEditor(id){
    yeDraft = id ? JSON.parse(JSON.stringify(consolSchemes.find(x => x.id===id))) : newSchemeSkeleton();
    yeEditingSchemeId = yeDraft.id;
    yeView = 'schemes';
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function closeSchemeEditor(){
    yeEditingSchemeId = null; yeDraft = null;
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function activateScheme(id){
    const scheme = (yeDraft && yeDraft.id===id) ? yeDraft : consolSchemes.find(s => s.id===id);
    if(!scheme) return;
    const overlapping = consolSchemes.filter(s => s.id!==id && s.status==='active' && schemesOverlap(s, scheme));
    if(overlapping.length){
      const names = overlapping.map(s => s.name).join(', ');
      if(!await showConfirmDialog(`Activating "${scheme.name}" will retire the currently Active scheme(s) that overlap its scope: ${names}. Continue?`)) return;
      overlapping.forEach(s => s.status = 'archived');
    }
    scheme.status = 'active';
    const idx = consolSchemes.findIndex(s => s.id===id);
    if(idx>=0) consolSchemes[idx] = scheme; else consolSchemes.push(scheme);
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    showToast('Scheme activated.', 'burst');
    yeEditingSchemeId = null; yeDraft = null;
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function archiveScheme(id){
    const s = consolSchemes.find(x => x.id===id);
    if(!s) return;
    if(!await showConfirmDialog(`Retire "${s.name}"? Classes/subjects it covered will show no Active scheme until another one is activated.`)) return;
    s.status = 'archived';
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function duplicateSchemeForNewYear(id){
    const scheme = consolSchemes.find(s => s.id===id);
    if(!scheme) return;
    const copy = JSON.parse(JSON.stringify(scheme));
    copy.id = 'scheme_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    copy.name = scheme.name + ' (copy)';
    copy.status = 'draft';
    yeDraft = copy;
    yeEditingSchemeId = copy.id;
    yeView = 'schemes';
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function deleteScheme(id){
    const s = consolSchemes.find(x => x.id===id);
    if(!s) return;
    const inUse = yearEndRecords.some(r => r.subjects.some(su => su.schemeId===id));
    if(!await showConfirmDialog(inUse ? `This scheme was used for one or more finalized Year-End records — those keep their own frozen snapshot and won't change. Delete the scheme itself anyway?` : `Delete "${s.name}"?`)) return;
    consolSchemes = consolSchemes.filter(x => x.id!==id);
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function quickSetupConsolSchemes(){
    if(consolSchemes.length && !await showConfirmDialog(`Add the default AP ${currentAcademicYearValue||''} schemes (Standard + Science) as new Drafts alongside what you already have?`)) return;
    const byName = n => { const t = examTypes.find(x => x.name===n); return t ? t.id : null; };
    const faId = byName('Formative Assessment'), sa1Id = byName('Summative Assessment 1'), sa2Id = byName('Summative Assessment 2 (Annual)');
    const memberIds = [faId, sa1Id].filter(Boolean);
    const annualIds = [sa2Id].filter(Boolean);
    const tenth = CLASS_LEVELS[CLASS_LEVELS.length-1];
    const nonTenth = CLASS_LEVELS.filter(c => c!==tenth);
    const yr = currentAcademicYearValue || '';
    const standard = { id:'scheme_'+Date.now()+'_std', name:`AP Pattern ${yr} — Standard`.trim(), academicYear:yr, status:'draft', classScope: nonTenth, subjectScope: [], totalMarks:100, buckets:[
      { id:'b_std_int', label:'Internal Assessment', memberTypeIds: memberIds.slice(), method:'sum-scaled', weight:20, n:1 },
      { id:'b_std_ann', label:'Annual Exam', memberTypeIds: annualIds.slice(), method:'latest', weight:80, n:1 },
    ]};
    const scienceClasses = ['8th Class','9th Class'].filter(c => CLASS_LEVELS.includes(c));
    const science = { id:'scheme_'+Date.now()+'_sci', name:`AP Pattern ${yr} — Science (8th-9th)`.trim(), academicYear:yr, status:'draft', classScope: scienceClasses, subjectScope:['Physical Science','Biological Science'], totalMarks:50, buckets:[
      { id:'b_sci_int', label:'Internal Assessment', memberTypeIds: memberIds.slice(), method:'sum-scaled', weight:10, n:1 },
      { id:'b_sci_ann', label:'Annual Exam', memberTypeIds: annualIds.slice(), method:'latest', weight:40, n:1 },
    ]};
    consolSchemes.push(standard, science);
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    const missing = [!faId && 'Formative Assessment', !sa1Id && 'Summative Assessment 1', !sa2Id && 'Summative Assessment 2 (Annual)'].filter(Boolean);
    showToast(missing.length ? `Default schemes added as drafts — but ${missing.join(', ')} exam type(s) don't exist yet, so edit each bucket to pick the right types once they're created.` : 'Default schemes added as drafts — edit and Activate when ready.', 'burst');
    renderYearEndTab(document.getElementById('resultBody'));
  }

  function yearEndCardPageHtml(s){
    const finalized = yearEndRecordFor(s.id);
    const r = finalized ? { subjects: finalized.subjects, overallPct: finalized.overallPct, overallGrade: finalized.overallGrade } : computeYearEndForStudent(s.id, s.className, s.section);
    const labelOrder = [];
    r.subjects.forEach(su => (su.breakdown||[]).forEach(b => { if(!labelOrder.includes(b.label)) labelOrder.push(b.label); }));
    const schemesUsed = {};
    r.subjects.forEach(su => { if(su.schemeName){ (schemesUsed[su.schemeName] = schemesUsed[su.schemeName]||[]).push(su.name); } });
    const schemeNamesUsed = Object.keys(schemesUsed);
    const multiScheme = schemeNamesUsed.length > 1;
    const majorityScheme = multiScheme ? schemeNamesUsed.reduce((a,b) => schemesUsed[a].length >= schemesUsed[b].length ? a : b) : null;
    const t = reportTemplates.find(x => x.isDefault) || reportTemplates[0] || { signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent' };
    const logoSrc = schoolLogoSrc ? schoolLogoSrc() : document.querySelector('.sb-brand img').src;
    const attendance = computeAttendanceStats(s.id);
    return `
      <div class="yec-card">
        <div class="yec-head"><img src="${logoSrc}"></div>
        <div class="yec-school">${schoolInfo.name||''}</div>
        <div class="yec-addr">${schoolInfo.address||''}</div>
        ${brandLineHtml({ size:'10px' })}${brandFixedWmHtml()}
        <div class="${finalized ? 'yec-final' : 'yec-provisional'}">${finalized ? `FINAL — ISSUED ${finalized.generatedAt ? new Date(finalized.generatedAt).toLocaleDateString() : ''}` : 'PROVISIONAL — SUBJECT TO CHANGE UNTIL FINALIZED'}</div>
        <div class="yec-title">YEAR-END MARKS CARD — ${currentAcademicYearValue || ''}</div>
        <div class="yec-info">
          <div>Student Name: <b>${s.firstName} ${s.lastName}</b></div>
          <div>Admission No: <b>${s.admissionNo}</b></div>
          <div>Class &amp; Section: <b>${s.className} — ${s.section}</b></div>
          <div>Father Name: <b>${s.fatherName||'—'}</b></div>
          ${attendance ? `<div>Attendance: <b>${attendance.present}/${attendance.total} (${attendance.pct}%)</b></div>` : ''}
        </div>
        <table>
          <thead><tr><th>Subject</th>${labelOrder.map(l => `<th>${l}</th>`).join('')}<th>Total</th><th>Grade</th></tr></thead>
          <tbody>
          ${r.subjects.map(su => {
            const byLabel = {}; (su.breakdown||[]).forEach(b => byLabel[b.label]=b);
            const marker = multiScheme && su.schemeName && su.schemeName !== majorityScheme ? ' †' : '';
            return `<tr>
              <td>${su.name}${marker}</td>
              ${labelOrder.map(l => { const b=byLabel[l]; return `<td>${b ? Math.round(b.pct*10)/10+'%' : '—'}</td>`; }).join('')}
              <td><b>${su.pct!==null ? su.pct+'%' : '—'}</b></td>
              <td><b>${su.grade}</b></td>
            </tr>`;
          }).join('')}
          <tr><td><b>Overall</b></td><td colspan="${labelOrder.length}"></td><td><b>${r.overallPct!==null ? r.overallPct+'%' : '—'}</b></td><td><b>${r.overallGrade}</b></td></tr>
          </tbody>
        </table>
        ${multiScheme ? `<div class="yec-footnote">† ${schemeNamesUsed.filter(n => n!==majorityScheme).map(n => `${schemesUsed[n].join(', ')} use a different weighting (${n}).`).join(' ')}</div>` : ''}
        <div class="yec-sign">
          <div>${resolveReportSignature1(t,s) ? `<img src="${resolveReportSignature1(t,s)}">` : ''}${t.signatureLabel1 || 'Class Teacher'}</div>
          <div>${resolveReportSignature2(t) ? `<img src="${resolveReportSignature2(t)}" style="margin-left:auto;">` : ''}${t.signatureLabel2 || 'Principal / Correspondent'}</div>
        </div>
      </div>
    `;
  }
  function yearEndPrintCss(){
    const cfg = yearEndPrintConfig || { orientation:'portrait', pageSize:'A4', compact:false };
    const [wmm, hmm] = PAGE_SIZES_MM[cfg.pageSize] || PAGE_SIZES_MM.A4;
    const pageSizeCss = cfg.orientation === 'landscape' ? `${hmm}mm ${wmm}mm` : `${wmm}mm ${hmm}mm`;
    const fs = cfg.compact ? '10px' : '11px';
    const tfs = cfg.compact ? '9.5px' : '11px';
    return `
      @page{ size:${pageSizeCss}; margin:${cfg.compact ? '10mm' : '14mm'}; }
      body{ font-family:Arial,Helvetica,sans-serif; color:#111; margin:0; font-size:${fs}; }
      .yec-card{ page-break-after:always; padding-bottom:10mm; }
      .yec-card:last-child{ page-break-after:auto; }
      .yec-head{ display:flex; align-items:center; gap:12px; justify-content:center; margin-bottom:6px; }
      .yec-head img{ width:${cfg.compact?'36px':'44px'}; height:${cfg.compact?'36px':'44px'}; border-radius:50%; }
      .yec-school{ font-weight:700; font-size:${cfg.compact?'16px':'18px'}; text-align:center; }
      .yec-addr{ font-size:${cfg.compact?'10px':'11px'}; text-align:center; color:#555; margin-bottom:6px; }
      .yec-provisional{ text-align:center; font-size:9.5px; color:#b45309; font-weight:700; letter-spacing:0.04em; margin-bottom:${cfg.compact?'6px':'10px'}; }
      .yec-final{ text-align:center; font-size:9.5px; color:#0f6a63; font-weight:700; letter-spacing:0.04em; margin-bottom:${cfg.compact?'6px':'10px'}; }
      .yec-title{ text-align:center; font-weight:700; font-size:13px; border-top:1px solid #333; border-bottom:1px solid #333; padding:5px 0; margin-bottom:${cfg.compact?'10px':'14px'}; }
      .yec-info{ display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-bottom:${cfg.compact?'10px':'16px'}; }
      .yec-card table{ width:100%; border-collapse:collapse; font-size:${tfs}; margin-bottom:8px; table-layout:fixed; }
      .yec-card th, .yec-card td{ border:1px solid #999; padding:${cfg.compact?'3px 5px':'5px 6px'}; text-align:left; word-wrap:break-word; }
      .yec-card th{ background:#211A4E; color:#fff; }
      .yec-footnote{ font-size:9px; color:#555; margin-bottom:${cfg.compact?'10px':'16px'}; }
      .yec-sign{ display:flex; justify-content:space-between; font-size:12px; margin-top:${cfg.compact?'30px':'50px'}; }
      .yec-sign img{ height:34px; display:block; margin-bottom:3px; }
    `;
  }
  function printYearEndCard(studentId){
    const s = students.find(x => x.id===studentId);
    if(!s) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Year-End Marks Card - ${s.firstName} ${s.lastName}</title><style>${yearEndPrintCss()}</style></head><body onload="window.print()">${yearEndCardPageHtml(s)}</body></html>`);
    w.document.close();
  }
  async function printBulkYearEndCards(){
    const list = students.filter(s => s.className===yeClass && s.section===yeSection && isActive(s));
    if(list.length === 0) return;
    if(list.length > 60 && !await showConfirmDialog(`Print ${list.length} Year-End Marks Cards at once? This can take a moment to render.`)) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Year-End Marks Cards - ${yeClass} Section ${yeSection}</title><style>${yearEndPrintCss()}</style></head><body onload="window.print()">${list.map(s => yearEndCardPageHtml(s)).join('')}</body></html>`);
    w.document.close();
  }

  /* ===== REPORTS MODULE ===== */
  