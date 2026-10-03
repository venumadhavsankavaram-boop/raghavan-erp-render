let saSelectedTeacherId = '';
  let saAddClass = '', saAddSubjectId = '';
  let saClassView = 'grid';
  let saCurrentClass = '';
  let saEditingCell = null;

  /* --- By Teacher --- */
  function renderSaByTeacher(body){
    const activeStaffCount = staffList.filter(staffIsActive).length;
    body.innerHTML = `
      ${activeStaffCount === 0 ? `
        <div class="profile-card" style="max-width:640px; background:rgba(203,154,46,0.08); border-left:4px solid var(--gold); margin-bottom:16px;">
          <p style="font-size:0.85rem; margin:0;"><b>No staff found.</b> Add teachers under <a onclick="switchView('staffdirectory')" style="color:var(--navy); font-weight:700; text-decoration:underline; cursor:pointer;">Staff Directory</a> first — then come back here to search for them and assign subjects.</p>
        </div>
      ` : ''}
      <div class="profile-card" style="max-width:640px;">
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin-bottom:8px; display:block;">Select Teacher</label>
        <div class="search-wrap">
          <input class="input" id="saTeacherSearch" placeholder="Search staff by name..." autocomplete="off" oninput="onSaTeacherInput()" onblur="setTimeout(hideSaTeacherSuggestions,150)" onfocus="onSaTeacherInput()">
          <div class="search-suggestions" id="saTeacherSuggestions"></div>
        </div>
      </div>
      <div id="saTeacherDetail" style="margin-top:20px;"></div>
    `;
    if(saSelectedTeacherId) renderSaTeacherDetail();
  }
  let saTeacherSearchDebounce = null;
  function onSaTeacherInput(){
    clearTimeout(saTeacherSearchDebounce);
    saTeacherSearchDebounce = setTimeout(() => renderSaTeacherSuggestions(document.getElementById('saTeacherSearch').value.trim()), 150);
  }
  function renderSaTeacherSuggestions(q){
    const box = document.getElementById('saTeacherSuggestions');
    if(!box) return;
    const ql = q.toLowerCase();
    const matches = staffList.filter(st => staffIsActive(st) && (!ql || (st.firstName||'').toLowerCase().includes(ql) || (st.lastName||'').toLowerCase().includes(ql))).slice(0,8);
    if(matches.length === 0){
      box.innerHTML = staffList.filter(staffIsActive).length === 0
        ? `<div class="sg-empty">No staff added yet — add teachers under Manage Staff first.</div>`
        : `<div class="sg-empty">No staff match "${q}"</div>`;
      box.classList.add('open');
      return;
    }
    box.innerHTML = matches.map(st => `<div class="sg-item" onmousedown="selectSaTeacher('${st.id}')">
      <div class="sg-avatar">${st.photo?`<img src="${st.photo}">`:staffInitials(st)}</div>
      <div><div class="sg-name">${st.firstName} ${st.lastName}</div><div class="sg-meta">${st.designation||'—'} · ${st.department}</div></div>
    </div>`).join('');
    box.classList.add('open');
  }
  function hideSaTeacherSuggestions(){
    const box = document.getElementById('saTeacherSuggestions');
    if(box) box.classList.remove('open');
  }
  function selectSaTeacher(id){
    saSelectedTeacherId = id;
    hideSaTeacherSuggestions();
    const search = document.getElementById('saTeacherSearch');
    if(search) search.value = '';
    saAddClass = ''; saAddSubjectId = '';
    renderSaTeacherDetail();
  }
  function renderSaTeacherDetail(){
    const wrap = document.getElementById('saTeacherDetail');
    if(!wrap) return;
    const st = staffList.find(x => x.id === saSelectedTeacherId);
    if(!st){ wrap.innerHTML=''; return; }
    const assignments = [];
    subjectsList.forEach(s => {
      (s.sections||[]).forEach(sec => {
        if(subjectStaffForSection(s, sec).includes(st.id)) assignments.push({ subject: s, section: sec });
      });
    });
    assignments.sort((a,b) => a.subject.className.localeCompare(b.subject.className) || a.subject.name.localeCompare(b.subject.name));
    wrap.innerHTML = `
      <div class="profile-card" style="max-width:640px;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
          ${st.photo ? `<img src="${st.photo}" style="width:44px; height:44px; border-radius:50%; object-fit:cover;">` : `<div class="profile-photo" style="width:44px; height:44px; font-size:1rem;">${staffInitials(st)}</div>`}
          <div><h4 style="margin:0;">${st.firstName} ${st.lastName}</h4><p style="font-size:0.78rem; color:var(--ink-soft); margin:2px 0 0;">${st.designation||'—'} · ${st.department}</p></div>
        </div>
        <h4 style="margin-bottom:8px;">Current Assignments (${assignments.length})</h4>
        <div class="table-wrap" style="margin-bottom:20px;">
          <table><thead><tr><th>Subject</th><th>Class</th><th>Section</th><th></th></tr></thead>
          <tbody>
          ${assignments.length ? assignments.map(a => `<tr><td class="name-cell">${a.subject.name}</td><td>${a.subject.className}</td><td>${a.section}</td><td><button class="btn-danger-text" onclick="removeSaAssignment('${a.subject.id}','${a.section}')">Remove</button></td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No subjects assigned yet</b></div></td></tr>`}
          </tbody></table>
        </div>
        <h4 style="margin-bottom:10px;">+ Add Assignment</h4>
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="f-field">
            <label>Class</label>
            <select id="saAddClass" onchange="saAddClass=this.value; saAddSubjectId=''; renderSaSubjectStep();">
              <option value="">Select class</option>
              ${CLASS_LEVELS.map(c => `<option ${c===saAddClass?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="f-field" id="saSubjectStepWrap" style="display:${saAddClass?'block':'none'};">
            <label>Subject</label>
            <select id="saAddSubject" onchange="saAddSubjectId=this.value; renderSaSectionStep();">
              <option value="">Select subject</option>
            </select>
          </div>
        </div>
        <div id="saSectionStepWrap"></div>
        <button class="btn btn-primary" style="margin-top:10px;" onclick="assignSaSubject()">Assign Subject</button>
      </div>
    `;
    if(saAddClass) renderSaSubjectStep();
  }
  function renderSaSubjectStep(){
    const sel = document.getElementById('saAddSubject');
    if(!sel) return;
    const subjectsForClass = subjectsList.filter(s => s.className === saAddClass);
    sel.innerHTML = `<option value="">Select subject</option>` + subjectsForClass.map(s => `<option value="${s.id}" ${s.id===saAddSubjectId?'selected':''}>${s.name}</option>`).join('');
    document.getElementById('saSubjectStepWrap').style.display = 'block';
    renderSaSectionStep();
  }
  function renderSaSectionStep(){
    const wrap = document.getElementById('saSectionStepWrap');
    if(!wrap) return;
    const subj = subjectsList.find(s => s.id === saAddSubjectId);
    if(!subj){ wrap.innerHTML=''; return; }
    wrap.innerHTML = `
      <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:10px 0 6px; display:block;">Section(s)</label>
      <div style="display:flex; gap:16px; flex-wrap:wrap;">
        ${(subj.sections||[]).map(sec => {
          const conflict = sectionTeacherConflictName(subj, sec, saSelectedTeacherId);
          const already = subjectStaffForSection(subj,sec).includes(saSelectedTeacherId);
          let note = '';
          if(already) note = '<span style="color:var(--ink-soft); font-size:0.72rem;">(already assigned to this teacher)</span>';
          else if(conflict) note = `<span style="color:var(--magenta); font-size:0.72rem;">(currently: ${conflict})</span>`;
          return `<label class="admission-toggle"><input type="checkbox" class="sa-add-section-check" value="${sec}"> Section ${sec} ${note}</label>`;
        }).join('')}
      </div>
    `;
  }
  async function assignSaSubject(){
    const subj = subjectsList.find(s => s.id === saAddSubjectId);
    if(!subj){ showToast('Select a class and subject.'); return; }
    const sections = Array.from(document.querySelectorAll('.sa-add-section-check:checked')).map(c => c.value);
    if(sections.length === 0){ showToast('Select at least one section.'); return; }
    let appliedAny = false;
    for(const sec of sections){
      if(await setSectionTeacher(subj, sec, saSelectedTeacherId)) appliedAny = true;
    }
    if(!appliedAny){ return; }
    await storageSet(SUBJECTS_KEY, subjectsList);
    showToast('Assigned.', 'burst');
    saAddClass = ''; saAddSubjectId = '';
    renderSaTeacherDetail();
  }
  async function removeSaAssignment(subjectId, section){
    const subj = subjectsList.find(s => s.id === subjectId);
    if(!subj) return;
    const current = subjectStaffForSection(subj, section).slice();
    const i = current.indexOf(saSelectedTeacherId);
    if(i > -1) current.splice(i,1);
    subj.sectionStaff = subj.sectionStaff || {};
    subj.sectionStaff[section] = current;
    recomputeSubjectStaffIds(subj);
    await storageSet(SUBJECTS_KEY, subjectsList);
    renderSaTeacherDetail();
  }

  /* --- By Class --- */
  function renderSaByClass(body){
    if(saClassView === 'grid'){
      const rows = CLASS_LEVELS.map((cls, idx) => {
        const count = subjectsList.filter(s => s.className === cls).length;
        return `<div class="class-compact-tile" data-idx="${idx%4}" onclick="openSaClass('${cls}')">
          <div class="class-compact-header"><div>
            <div class="class-compact-name">${cls}</div>
            <div class="class-compact-count">${count} <span class="class-compact-count-label">subject${count===1?'':'s'}</span></div>
          </div></div>
        </div>`;
      }).join('');
      body.innerHTML = `<div class="class-compact-grid">${rows}</div>`;
    }else{
      renderSaClassTable(body);
    }
  }
  function openSaClass(cls){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    saCurrentClass = cls;
    saClassView = 'table';
    saEditingCell = null;
    renderSubjectsMainBody();
  }
  function backToSaClassGrid(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    saClassView = 'grid';
    renderSubjectsMainBody();
  }
  function renderSaClassTable(body){
    const subjects = subjectsList.filter(s => s.className === saCurrentClass);
    const rows = [];
    subjects.forEach(s => { (s.sections||[]).forEach(sec => rows.push({ subject: s, section: sec })); });
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToSaClassGrid()">All Classes</a> &nbsp;/&nbsp; ${saCurrentClass}</div>
      <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">Each subject-section can have only one teacher — picking a new one here replaces whoever was assigned before.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Subject</th><th>Section</th><th>Teacher</th><th></th></tr></thead>
        <tbody>
        ${rows.length ? rows.map(r => {
          const isEditing = saEditingCell && saEditingCell.subjectId===r.subject.id && saEditingCell.section===r.section;
          const assigned = subjectStaffForSection(r.subject, r.section);
          const currentId = assigned[0] || '';
          const names = assigned.map(id => { const st=staffList.find(x=>x.id===id); return st? st.firstName+' '+st.lastName : ''; }).filter(Boolean).join(', ') || '—';
          if(isEditing){
            return `<tr>
              <td class="name-cell">${r.subject.name}</td>
              <td>${r.section}</td>
              <td colspan="2">
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <select id="saCellTeacherSelect" style="font-size:0.82rem; padding:6px 8px;">
                    <option value="">— Unassigned —</option>
                    ${staffList.filter(staffIsActive).map(st => `<option value="${st.id}" ${st.id===currentId?'selected':''}>${st.firstName} ${st.lastName}</option>`).join('')}
                  </select>
                  <button class="btn btn-primary btn-sm" onclick="saveSaCell('${r.subject.id}','${r.section}')">Save</button>
                  <button class="btn btn-ghost btn-sm" onclick="saEditingCell=null; renderSubjectsMainBody();">Cancel</button>
                </div>
              </td>
            </tr>`;
          }
          return `<tr>
            <td class="name-cell">${r.subject.name}</td>
            <td>${r.section}</td>
            <td>${names}</td>
            <td><button class="btn-edit-text" onclick='saEditingCell={subjectId:"${r.subject.id}",section:"${r.section}"}; renderSubjectsMainBody();'>Change</button></td>
          </tr>`;
        }).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No subjects for ${saCurrentClass} yet</b>Add some under Manage Subjects first.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  async function saveSaCell(subjectId, section){
    const subj = subjectsList.find(s => s.id === subjectId);
    if(!subj) return;
    const selectedId = document.getElementById('saCellTeacherSelect').value;
    await setSectionTeacher(subj, section, selectedId, true); // dropdown is an explicit choice — no confirm needed, it already replaces
    await storageSet(SUBJECTS_KEY, subjectsList);
    saEditingCell = null;
    renderSubjectsMainBody();
    showToast('Updated.', 'burst');
  }

  function renderStaffSubjectsChecklistHtml(staffId){
    if(subjectsList.length === 0) return `<p style="font-size:0.82rem; color:var(--ink-soft);">No subjects have been set up yet — add them under Manage Subjects first.</p>`;
    const byClass = {};
    CLASS_LEVELS.forEach(c => { byClass[c] = subjectsList.filter(s => s.className === c); });
    return Object.entries(byClass).filter(([,list]) => list.length).map(([cls, list]) => `
      <div style="margin-bottom:10px;">
        <div style="font-size:0.72rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">${cls}</div>
        ${list.map(s => (s.sections||[]).map(sec => {
          const isMine = subjectStaffForSection(s,sec).includes(staffId);
          const conflict = sectionTeacherConflictName(s, sec, staffId);
          const note = conflict ? `<span style="color:var(--magenta); font-size:0.72rem;"> (currently: ${conflict})</span>` : '';
          return `<label class="disc-check-item"><input type="checkbox" ${isMine?'checked':''} onchange="toggleStaffSubject('${s.id}', '${sec}', this.checked)"> ${s.name} <span style="color:var(--ink-soft); font-size:0.76rem;">— Section ${sec}</span>${note}</label>`;
        }).join('')).join('')}
      </div>
    `).join('');
  }
  async function toggleStaffSubject(subjectId, section, checked){
    const subj = subjectsList.find(s => s.id === subjectId);
    if(!subj) return;
    if(checked){
      if(!await setSectionTeacher(subj, section, staffCurrentId)){
        renderStaffBody(); // declined — re-render so the checkbox reverts to unchecked
        return;
      }
    }else{
      await setSectionTeacher(subj, section, '', true);
    }
    await storageSet(SUBJECTS_KEY, subjectsList);
    showToast(checked ? 'Subject added.' : 'Subject removed.');
  }

  /* --- Search --- */
  let staffSearchDebounce = null;
  function onStaffSearchInput(){
    clearTimeout(staffSearchDebounce);
    staffSearchDebounce = setTimeout(() => renderStaffSuggestions(document.getElementById('staffSearch').value.trim()), 150);
  }
  function renderStaffSuggestions(q){
    const box = document.getElementById('staffSearchSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = staffList.filter(st => (st.firstName||'').toLowerCase().includes(ql) || (st.lastName||'').toLowerCase().includes(ql) || (st.staffId||'').toLowerCase().includes(ql)).slice(0,8);
    if(matches.length===0){ box.innerHTML = `<div class="sg-empty">No staff match "${q}"</div>`; box.classList.add('open'); return; }
    box.innerHTML = matches.map(st => `<div class="sg-item" onmousedown="selectStaffSuggestion('${st.id}')">
      <div class="sg-avatar">${st.photo?`<img src="${st.photo}">`:staffInitials(st)}</div>
      <div><div class="sg-name">${st.firstName} ${st.lastName}</div><div class="sg-meta">${st.staffId} · ${st.designation||'—'} · ${st.department}</div></div>
    </div>`).join('');
    box.classList.add('open');
  }
  function selectStaffSuggestion(id){
    hideStaffSuggestions();
    document.getElementById('staffSearch').value = '';
    openStaffProfile(id);
  }
  function hideStaffSuggestions(){
    const box = document.getElementById('staffSearchSuggestions');
    if(box) box.classList.remove('open');
  }

  /* --- Departments & Designations --- */
  function renderStaffDeptsTab(body){
    const canCreate = getStaffSubpageAccess(currentUser.role, 'staff_depts', 'create');
    const canDelete = getStaffSubpageAccess(currentUser.role, 'staff_depts', 'delete');
    body.innerHTML = `
      <div class="profile-card" style="margin-bottom:20px; max-width:500px;">
        <h4>Departments</h4>
        ${canCreate ? `<div class="inline-add-form" style="margin-bottom:10px;">
          <input class="input" id="newDeptName" placeholder="e.g. Sports" style="max-width:220px;">
          <button class="btn btn-ghost btn-sm" onclick="addStaffDept()">+ Add</button>
        </div>` : ''}
        ${staffDepartments.map((d,i) => `<div class="list-manage-row"><div class="lm-name">${d}</div>${canDelete ? `<button class="btn-danger-text" onclick="removeStaffDept(${i})">Remove</button>` : ''}</div>`).join('') || `<div style="font-size:0.82rem; color:var(--ink-soft);">No departments yet</div>`}
      </div>
      <div class="profile-card" style="margin-bottom:20px; max-width:500px;">
        <h4>Roles / Designations</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:10px;">A staff member's single primary title (e.g. Teacher, Driver).</p>
        ${canCreate ? `<div class="inline-add-form" style="margin-bottom:10px;">
          <input class="input" id="newDesigName" placeholder="e.g. Sports Coach" style="max-width:220px;">
          <button class="btn btn-ghost btn-sm" onclick="addStaffDesignation()">+ Add</button>
        </div>` : ''}
        ${staffDesignations.map((d,i) => `<div class="list-manage-row"><div class="lm-name">${d}</div>${canDelete ? `<button class="btn-danger-text" onclick="removeStaffDesignation(${i})">Remove</button>` : ''}</div>`).join('') || `<div style="font-size:0.82rem; color:var(--ink-soft);">No designations yet</div>`}
      </div>
      <div class="profile-card" style="max-width:500px;">
        <h4>Job Types</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:10px;">Extra responsibilities a staff member can hold — a person can have several at once (e.g. Class Teacher + Exam Duty).</p>
        ${canCreate ? `<div class="inline-add-form" style="margin-bottom:10px;">
          <input class="input" id="newJobTypeName" placeholder="e.g. Warden" style="max-width:220px;">
          <button class="btn btn-ghost btn-sm" onclick="addStaffJobType()">+ Add</button>
        </div>` : ''}
        ${staffJobTypes.map((d,i) => `<div class="list-manage-row"><div class="lm-name">${d}</div>${canDelete ? `<button class="btn-danger-text" onclick="removeStaffJobType(${i})">Remove</button>` : ''}</div>`).join('') || `<div style="font-size:0.82rem; color:var(--ink-soft);">No job types yet</div>`}
      </div>
    `;
  }
  async function addStaffDept(){
    const val = document.getElementById('newDeptName').value.trim();
    if(!val) return;
    staffDepartments.push(val);
    await storageSet(STAFF_DEPTS_KEY, staffDepartments);
    renderStaffDeptsTab(document.getElementById('staffBody'));
    showToast('Department added.', 'burst');
  }
  async function removeStaffDept(idx){
    staffDepartments.splice(idx,1);
    await storageSet(STAFF_DEPTS_KEY, staffDepartments);
    renderStaffDeptsTab(document.getElementById('staffBody'));
  }
  async function addStaffDesignation(){
    const val = document.getElementById('newDesigName').value.trim();
    if(!val) return;
    staffDesignations.push(val);
    await storageSet(STAFF_DESIGNATIONS_KEY, staffDesignations);
    renderStaffDeptsTab(document.getElementById('staffBody'));
    showToast('Designation added.', 'burst');
  }
  async function removeStaffDesignation(idx){
    staffDesignations.splice(idx,1);
    await storageSet(STAFF_DESIGNATIONS_KEY, staffDesignations);
    renderStaffDeptsTab(document.getElementById('staffBody'));
  }
  async function addStaffJobType(){
    const val = document.getElementById('newJobTypeName').value.trim();
    if(!val) return;
    staffJobTypes.push(val);
    await storageSet(STAFF_JOB_TYPES_KEY, staffJobTypes);
    renderStaffDeptsTab(document.getElementById('staffBody'));
    showToast('Job type added.', 'burst');
  }
  async function removeStaffJobType(idx){
    staffJobTypes.splice(idx,1);
    await storageSet(STAFF_JOB_TYPES_KEY, staffJobTypes);
    renderStaffDeptsTab(document.getElementById('staffBody'));
  }

  /* --- Add/Edit Staff Wizard --- */
  const STAFF_WIZARD_TABS = ['personal','professional','payroll','contact'];
  function switchStaffWizardTab(tab){
    STAFF_WIZARD_TABS.forEach(t => {
      document.getElementById('stfpanel-'+t).style.display = t===tab ? 'block' : 'none';
      document.getElementById('stfwtab-'+t).classList.toggle('active', t===tab);
    });
    const idx = STAFF_WIZARD_TABS.indexOf(tab);
    document.getElementById('staffBackBtn').style.display = idx > 0 ? 'inline-flex' : 'none';
    const isLast = idx === STAFF_WIZARD_TABS.length - 1;
    document.getElementById('staffNextBtn').style.display = isLast ? 'none' : 'inline-flex';
    document.getElementById('staffSaveBtn').style.display = isLast ? 'inline-flex' : 'none';
  }
  function currentStaffWizardTab(){
    return STAFF_WIZARD_TABS.find(t => document.getElementById('stfwtab-'+t).classList.contains('active')) || 'personal';
  }
  function staffWizardStep(dir){
    const idx = STAFF_WIZARD_TABS.indexOf(currentStaffWizardTab());
    const next = idx + dir;
    if(next < 0 || next >= STAFF_WIZARD_TABS.length) return;
    switchStaffWizardTab(STAFF_WIZARD_TABS[next]);
  }

  function previewStaffPhoto(e){
    readImageFileWithSizeLimit(e, dataUrl => {
      staffPhotoData = dataUrl;
      document.getElementById('staffPhotoPreview').src = staffPhotoData;
      document.getElementById('staffPhotoPreview').style.display = 'block';
      document.getElementById('staffPhotoPlaceholder').style.display = 'none';
    });
  }

  function previewStaffSignature(e){
    readImageFileWithSizeLimit(e, dataUrl => {
      staffSignatureData = dataUrl;
      document.getElementById('staffSigPreview').src = staffSignatureData;
      document.getElementById('staffSigPreview').style.display = 'block';
      document.getElementById('staffSigPlaceholder').style.display = 'none';
    });
  }

  function populateStaffDropdowns(){
    const deptSel = document.getElementById('stfDept');
    const desigSel = document.getElementById('stfDesignation');
    deptSel.innerHTML = '<option value="" disabled selected>Select department</option>' + staffDepartments.map(d => `<option>${d}</option>`).join('');
    desigSel.innerHTML = '<option value="" disabled selected>Select designation</option>' + staffDesignations.map(d => `<option>${d}</option>`).join('');
    const ctSel = document.getElementById('stfClassTeacherOf');
    ctSel.innerHTML = '<option value="">Not a Class Teacher</option>' +
      CLASS_LEVELS.flatMap(c => SECTIONS.map(sec => `<option value="${c}|${sec}">${c} — Section ${sec}</option>`)).join('');
    const roleSel = document.getElementById('stfSystemRole');
    roleSel.innerHTML = allRoleNames().map(r => `<option>${r}</option>`).join('');
    onStfSystemRoleChange();
  }
  function onStfSystemRoleChange(){
    const role = document.getElementById('stfSystemRole').value;
    const hasPerm = getRoleViews(role).length > 0;
    document.getElementById('stfRoleWarning').style.display = hasPerm ? 'none' : 'inline';
    const approveBtn = document.getElementById('stfApproveRoleBtn');
    if(approveBtn) approveBtn.style.display = currentUser.role === 'Admin' ? 'inline' : 'none';
  }
  async function approveStaffRole(){
    const role = document.getElementById('stfSystemRole').value;
    if(!role) return;
    if(!await showConfirmDialog(`Approve "${role}" for use? This grants it full access to every module — you can fine-tune exact permissions afterward in Initial Setup → Roles & Permissions.`)) return;
    const newPermissions = {};
    PERMISSION_MODULES.forEach(m => {
      newPermissions[m.key] = {};
      PERMISSION_ACTIONS.forEach(a => { newPermissions[m.key][a] = true; });
    });
    let ov = findRoleOverride(role);
    if(ov){ ov.permissions = newPermissions; }
    else { customRoles.push({ id:'role_'+Date.now(), name: role, permissions: newPermissions }); }
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    onStfSystemRoleChange();
    showToast(`"${role}" approved — full access granted.`);
  }
  function renderStaffJobTypeCheckboxes(selected){
    const box = document.getElementById('stfJobTypeBox');
    const sel = selected || [];
    box.innerHTML = staffJobTypes.length ? staffJobTypes.map(jt => `
      <label class="disc-check-item"><input type="checkbox" class="stf-jobtype-check" value="${jt}" ${sel.includes(jt)?'checked':''}> ${jt}</label>
    `).join('') : `<div style="font-size:0.82rem; color:var(--ink-soft);">No job types defined yet — add some under "Departments &amp; Designations".</div>`;
  }
  function toggleStaffLoginFields(){
    document.getElementById('staffLoginFieldsWrap').style.display = document.getElementById('stfCreateLogin').checked ? 'block' : 'none';
  }

  function toggleStfSubjectTeacherBox(){
    const checked = document.getElementById('stfIsSubjectTeacher').checked;
    const box = document.getElementById('stfSubjectTeacherBox');
    box.style.display = checked ? 'block' : 'none';
    if(checked) renderStfSubjectTeacherBox();
  }
  function renderStfSubjectTeacherBox(editId){
    const box = document.getElementById('stfSubjectTeacherBox');
    if(!box) return;
    if(subjectsList.length === 0){
      box.innerHTML = `<p style="font-size:0.8rem; color:var(--ink-soft); margin:0;">No subjects have been set up yet — add them under Manage Subjects first, then come back here to assign them.</p>`;
      return;
    }
    const byClass = {};
    CLASS_LEVELS.forEach(c => { byClass[c] = subjectsList.filter(s => s.className === c); });
    box.innerHTML = Object.entries(byClass).filter(([,list]) => list.length).map(([cls, list]) => `
      <div style="margin-bottom:10px;">
        <div style="font-size:0.72rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">${cls}</div>
        ${list.map(s => (s.sections||[]).map(sec => {
          const isMine = editId && subjectStaffForSection(s,sec).includes(editId);
          const conflict = sectionTeacherConflictName(s, sec, editId || '__new__');
          const note = conflict ? `<span style="color:var(--magenta); font-size:0.72rem;"> (currently: ${conflict})</span>` : '';
          return `<label class="disc-check-item"><input type="checkbox" class="stf-subject-check" value="${s.id}|${sec}" ${isMine?'checked':''}> ${s.name} <span style="color:var(--ink-soft); font-size:0.76rem;">— Section ${sec}</span>${note}</label>`;
        }).join('')).join('')}
      </div>
    `).join('');
  }
  async function applyStfSubjectAssignments(staffId){
    const isSubjectTeacher = document.getElementById('stfIsSubjectTeacher').checked;
    const checkedPairs = isSubjectTeacher ? Array.from(document.querySelectorAll('.stf-subject-check:checked')).map(c => c.value.split('|')) : [];
    for(const s of subjectsList){
      for(const sec of (s.sections||[])){
        const shouldHave = checkedPairs.some(([subjId, section]) => subjId === s.id && section === sec);
        const has = subjectStaffForSection(s, sec).includes(staffId);
        if(shouldHave && !has) await setSectionTeacher(s, sec, staffId); // will confirm if someone else already holds it
        if(!shouldHave && has) await setSectionTeacher(s, sec, '', true);
      }
    }
    await storageSet(SUBJECTS_KEY, subjectsList);
  }
  function openStaffWizard(id){
    document.getElementById('staffForm').reset();
    document.getElementById('editStaffId').value = id || '';
    document.getElementById('staffModalTitle').textContent = id ? 'Edit Staff' : 'Add Staff';
    // Writes to Users & Roles are Admin-only server-side (server.js rejects
    // any other role with a 403, which storageSet() swallows into a toast and
    // a local-only fallback) — so a non-Admin who checks this box would see
    // "login created" here but it would never actually reach Users & Roles,
    // and myTeacherScope() would then have nothing to find for that teacher.
    // Hiding the control for non-Admins keeps the UI honest about what it can
    // actually do; Admins see it exactly as before.
    const isAdmin = currentUser.role === 'Admin';
    document.getElementById('stfCreateLoginLabel').style.display = isAdmin ? '' : 'none';
    document.getElementById('stfCreateLoginAdminNote').style.display = isAdmin ? 'none' : 'block';
    staffPhotoData = '';
    document.getElementById('staffPhotoPreview').style.display = 'none';
    document.getElementById('staffPhotoPlaceholder').style.display = 'block';
    staffSignatureData = '';
    document.getElementById('staffSigPreview').style.display = 'none';
    document.getElementById('staffSigPlaceholder').style.display = 'block';
    document.getElementById('staffLoginFieldsWrap').style.display = 'none';
    document.getElementById('stfBiometricIdField').style.display = biometricAttendanceAvailable ? '' : 'none';
    document.getElementById('stfBiometricId').value = '';
    populateStaffDropdowns();
    let existingJobTypes = [];
    if(id){
      const st = staffList.find(x => x.id === id);
      if(st){
        document.getElementById('stfFirstName').value = st.firstName || '';
        document.getElementById('stfLastName').value = st.lastName || '';
        document.getElementById('stfGender').value = st.gender || '';
        document.getElementById('stfDob').value = st.dob || '';
        document.getElementById('stfBlood').value = st.blood || '';
        document.getElementById('stfAadhar').value = st.aadhar || '';
        document.getElementById('stfCaste').value = st.caste || '';
        document.getElementById('stfDept').value = st.department || '';
        document.getElementById('stfDesignation').value = st.designation || '';
        document.getElementById('stfDoj').value = st.doj || '';
        document.getElementById('stfStatus').value = st.status || 'Active';
        document.getElementById('stfQualification').value = st.qualification || '';
        document.getElementById('stfExperience').value = st.experience || '';
        document.getElementById('stfBiometricId').value = st.biometricId || '';
        document.getElementById('stfSalary').value = st.salary || '';
        document.getElementById('stfEpfEnabled').checked = !!st.epfEnabled;
        document.getElementById('stfEpfEmployeeAmt').value = st.epfEmployeeAmount !== undefined && st.epfEmployeeAmount !== '' ? st.epfEmployeeAmount : '';
        document.getElementById('stfEpfEmployerAmt').value = st.epfEmployerAmount !== undefined && st.epfEmployerAmount !== '' ? st.epfEmployerAmount : '';
        document.getElementById('stfEsiEnabled').checked = !!st.esiEnabled;
        document.getElementById('stfEsiEmployeeAmt').value = st.esiEmployeeAmount !== undefined && st.esiEmployeeAmount !== '' ? st.esiEmployeeAmount : '';
        document.getElementById('stfEsiEmployerAmt').value = st.esiEmployerAmount !== undefined && st.esiEmployerAmount !== '' ? st.esiEmployerAmount : '';
        document.getElementById('stfPaidLeaves').value = st.paidLeavesPerMonth !== undefined && st.paidLeavesPerMonth !== '' ? st.paidLeavesPerMonth : 1;
        document.getElementById('stfOtherDeduction').value = st.otherMonthlyDeduction || '';
        document.getElementById('stfBankName').value = st.bankName || '';
        document.getElementById('stfBankAccountName').value = st.bankAccountName || '';
        document.getElementById('stfBankAccountNumber').value = st.bankAccountNumber || '';
        document.getElementById('stfBankIfsc').value = st.bankIfsc || '';
        document.getElementById('stfClassTeacherOf').value = st.classTeacherClass ? (st.classTeacherClass+'|'+st.classTeacherSection) : '';
        document.getElementById('stfPhone').value = st.phone || '';
        document.getElementById('stfEmail').value = st.email || '';
        document.getElementById('stfAddress').value = st.address || '';
        document.getElementById('stfEmergencyName').value = st.emergencyName || '';
        document.getElementById('stfEmergencyPhone').value = st.emergencyPhone || '';
        existingJobTypes = st.jobTypes || [];
        if(st.photo){
          staffPhotoData = st.photo;
          document.getElementById('staffPhotoPreview').src = st.photo;
          document.getElementById('staffPhotoPreview').style.display = 'block';
          document.getElementById('staffPhotoPlaceholder').style.display = 'none';
        }
        if(st.signature){
          staffSignatureData = st.signature;
          document.getElementById('staffSigPreview').src = st.signature;
          document.getElementById('staffSigPreview').style.display = 'block';
          document.getElementById('staffSigPlaceholder').style.display = 'none';
        }
        if(st.linkedUserId){
          const u = users.find(x => x.id === st.linkedUserId);
          if(u){
            document.getElementById('stfCreateLogin').checked = true;
            document.getElementById('staffLoginFieldsWrap').style.display = 'block';
            document.getElementById('stfUsername').value = u.username;
            document.getElementById('stfSystemRole').value = u.role;
          }
        }
        const teachesAny = subjectsList.some(s => (s.staffIds||[]).includes(id));
        document.getElementById('stfIsSubjectTeacher').checked = teachesAny;
        document.getElementById('stfSubjectTeacherBox').style.display = teachesAny ? 'block' : 'none';
        if(teachesAny) renderStfSubjectTeacherBox(id);
      }
    }else{
      document.getElementById('stfIsSubjectTeacher').checked = false;
      document.getElementById('stfSubjectTeacherBox').style.display = 'none';
      document.getElementById('stfEpfEnabled').checked = false;
      document.getElementById('stfEpfEmployeeAmt').value = '';
      document.getElementById('stfEpfEmployerAmt').value = '';
      document.getElementById('stfEsiEnabled').checked = false;
      document.getElementById('stfEsiEmployeeAmt').value = '';
      document.getElementById('stfEsiEmployerAmt').value = '';
      document.getElementById('stfPaidLeaves').value = 1;
      document.getElementById('stfOtherDeduction').value = '';
      document.getElementById('stfBankName').value = '';
      document.getElementById('stfBankAccountName').value = '';
      document.getElementById('stfBankAccountNumber').value = '';
      document.getElementById('stfBankIfsc').value = '';
    }
    renderStaffJobTypeCheckboxes(existingJobTypes);
    switchStaffWizardTab('personal');
    document.getElementById('staffModalOverlay').classList.add('open');
  }
  function closeStaffWizard(){
    document.getElementById('staffModalOverlay').classList.remove('open');
  }

  async function saveStaff(e){
    e.preventDefault();
    const editId = document.getElementById('editStaffId').value;
    const g = id => document.getElementById(id).value;

    const stfPhoneVal = g('stfPhone').trim();
    if(!stfPhoneVal || !isValidMobile(stfPhoneVal)){
      showToast('Phone must be a valid 10-digit mobile number.');
      document.getElementById('stfPhone').focus();
      return false;
    }
    const stfEmergencyPhoneVal = g('stfEmergencyPhone').trim();
    if(stfEmergencyPhoneVal && !isValidMobile(stfEmergencyPhoneVal)){
      showToast('Emergency Contact Phone must be exactly 10 digits.');
      document.getElementById('stfEmergencyPhone').focus();
      return false;
    }
    const stfAadharVal = g('stfAadhar').trim();
    if(stfAadharVal && !isValidAadhar(stfAadharVal)){
      showToast('Aadhar Number must be exactly 12 digits.');
      document.getElementById('stfAadhar').focus();
      return false;
    }
    const stfBankAccountVal = g('stfBankAccountNumber').trim();
    if(stfBankAccountVal && !isValidBankAccount(stfBankAccountVal)){
      showToast('Account Number must be 6–18 digits.');
      document.getElementById('stfBankAccountNumber').focus();
      return false;
    }
    const stfBankIfscVal = g('stfBankIfsc').trim().toUpperCase();
    if(stfBankIfscVal && !isValidIfsc(stfBankIfscVal)){
      showToast('IFSC Code must be in the format AAAA0999999 — 4 letters, a zero, then 6 letters/digits.');
      document.getElementById('stfBankIfsc').focus();
      return false;
    }

    const jobTypes = Array.from(document.querySelectorAll('.stf-jobtype-check:checked')).map(c => c.value);
    const ctVal = g('stfClassTeacherOf');
    const [ctClass, ctSection] = ctVal ? ctVal.split('|') : ['', ''];
    if(ctVal){
      const clash = staffList.find(x => x.id !== editId && x.classTeacherClass === ctClass && x.classTeacherSection === ctSection);
      if(clash){
        const proceed = await showConfirmDialog(`${clash.firstName} ${clash.lastName} is already the Class Teacher of ${ctClass} — Section ${ctSection}. Assign this staff member as Class Teacher too anyway?`);
        if(!proceed) return false;
      }
    }
    const data = {
      firstName: g('stfFirstName').trim(), lastName: g('stfLastName').trim(),
      gender: g('stfGender'), dob: g('stfDob'), blood: g('stfBlood'), aadhar: g('stfAadhar').trim(),
      caste: g('stfCaste'),
      department: g('stfDept'), designation: g('stfDesignation'), doj: g('stfDoj'), status: g('stfStatus'),
      qualification: g('stfQualification').trim(), experience: g('stfExperience'), salary: g('stfSalary'),
      biometricId: g('stfBiometricId').trim(),
      epfEnabled: document.getElementById('stfEpfEnabled').checked,
      epfEmployeeAmount: g('stfEpfEmployeeAmt') || 0, epfEmployerAmount: g('stfEpfEmployerAmt') || 0,
      esiEnabled: document.getElementById('stfEsiEnabled').checked,
      esiEmployeeAmount: g('stfEsiEmployeeAmt') || 0, esiEmployerAmount: g('stfEsiEmployerAmt') || 0,
      paidLeavesPerMonth: g('stfPaidLeaves') === '' ? 1 : g('stfPaidLeaves'),
      otherMonthlyDeduction: g('stfOtherDeduction') || 0,
      bankName: g('stfBankName').trim(), bankAccountName: g('stfBankAccountName').trim(),
      bankAccountNumber: g('stfBankAccountNumber').trim(), bankIfsc: g('stfBankIfsc').trim().toUpperCase(),
      classTeacherClass: ctClass, classTeacherSection: ctSection,
      phone: g('stfPhone').trim(), email: g('stfEmail').trim(), address: g('stfAddress').trim(),
      emergencyName: g('stfEmergencyName').trim(), emergencyPhone: g('stfEmergencyPhone').trim(),
      photo: staffPhotoData, signature: staffSignatureData, jobTypes,
    };
    if(!editId){
      // Duplicate check on add only (never blocks editing an existing record).
      // Aadhaar match is a strong signal on its own; otherwise fall back to
      // same name (+ same DOB, when both records have one). Hard-blocks by
      // default; only Admin gets an explicit "force add" override.
      const aadharDup = data.aadhar ? staffList.find(s => (s.aadhar||'').trim() && (s.aadhar||'').trim() === data.aadhar.trim()) : null;
      const nameDup = staffList.find(s =>
        (s.firstName||'').trim().toLowerCase() === data.firstName.toLowerCase() &&
        (s.lastName||'').trim().toLowerCase() === data.lastName.toLowerCase() &&
        (!data.dob || !s.dob || s.dob === data.dob)
      );
      const dup = aadharDup || nameDup;
      if(dup){
        const reason = aadharDup
          ? `Aadhaar ${data.aadhar} is already on file for staff member ${dup.firstName} ${dup.lastName} (Staff ID: ${dup.staffId}).`
          : `A staff member named "${data.firstName} ${data.lastName}"${data.dob?' with the same date of birth':''} already exists (Staff ID: ${dup.staffId}${dup.department?', '+dup.department:''}).`;
        if(currentUser.role === 'Admin'){
          const proceed = await showConfirmDialog(
            reason + '\n\nThis looks like a duplicate. Only continue if you have verified this is genuinely a different person.',
            { title:'Possible duplicate staff member', okText:'Force add anyway', cancelText:'Cancel — let me check' }
          );
          if(!proceed) return false;
        }else{
          await showInfoDialog(
            reason + '\n\nTo prevent duplicate records, this staff member was not added. If you\'re sure this is a different person, ask an Admin to add it.',
            { title:'Duplicate staff — not added' }
          );
          return false;
        }
      }
    }
    let staffRecord;
    if(editId){
      const idx = staffList.findIndex(x => x.id === editId);
      staffList[idx] = { ...staffList[idx], ...data };
      staffRecord = staffList[idx];
      showToast('Staff record updated.');
    }else{
      data.id = 'stf_' + Date.now();
      data.staffId = nextStaffId();
      staffList.push(data);
      staffRecord = data;
      showToast('New staff member added.');
    }

    if(currentUser.role === 'Admin' && document.getElementById('stfCreateLogin').checked){
      const uname = g('stfUsername').trim();
      const pwd = g('stfPassword');
      if(uname){
        const dupe = users.find(u => u.username.toLowerCase()===uname.toLowerCase() && u.id !== staffRecord.linkedUserId);
        // staffRecord.linkedUserId existing is NOT proof a login still exists —
        // if a prior attempt updated the staff record but the matching users
        // save then silently failed (see the storageSet comment below), the
        // staff record is left pointing at a user id that was never actually
        // created. Treating that as "a login exists, just update it" meant
        // finding nothing and doing nothing at all — no new login, no error,
        // completely silent. Looking the id up in the real `users` array (not
        // just checking the field is non-empty) and falling through to the
        // create-a-new-login branch when it's stale is the actual fix.
        const existingLinkedUser = staffRecord.linkedUserId ? users.find(x => x.id === staffRecord.linkedUserId) : null;
        if(dupe){
          showToast('That username is already taken — staff record saved, but login was not created.');
        }else if(existingLinkedUser){
          const u = existingLinkedUser;
          const prevUserSnapshot = { ...u };
          u.username = uname; u.name = data.firstName+' '+data.lastName; u.role = g('stfSystemRole'); if(pwd) u.password = pwd;
          // storageSet never throws on a server rejection — it just falls back to
          // localStorage and pops a toast — so without checking the actual result
          // here, a rejected save (wrong permission, dropped connection) would look
          // identical to a successful one and the login change would quietly never
          // reach the database. See the matching fix in saveUser() for the full story.
          const saved = await storageSet(USERS_KEY, users);
          if(!saved){
            Object.assign(u, prevUserSnapshot);
            alert("The staff record was saved, but this login's changes could NOT be saved to the server — nothing changed for their account. Please try again from here or from Configuration → Users & Roles.");
          }
        }else{
          const newUser = {
            id: 'u_' + Date.now(), name: data.firstName+' '+data.lastName, username: uname,
            password: pwd || Math.random().toString(36).slice(-8), role: g('stfSystemRole'),
            linkedStudentId: '', recoveryCode: generateRecoveryCode(),
          };
          users.push(newUser);
          const prevLinkedUserId = staffRecord.linkedUserId;
          staffRecord.linkedUserId = newUser.id;
          const saved = await storageSet(USERS_KEY, users);
          if(!saved){
            users.pop();
            staffRecord.linkedUserId = prevLinkedUserId;
            alert("The staff record was saved, but this login could NOT be created on the server — it will NOT appear in Configuration → Users & Roles. Please try again, either from here or using the 🔑 button in Staff Directory.");
          }
        }
      }
    }

    await storageSet(STAFF_KEY, staffList);
    await applyStfSubjectAssignments(staffRecord.id);
    closeStaffWizard();
    renderStaffBody();
    return false;
  }
  async function deleteStaff(id){
    if(!await showConfirmDialog('Remove this staff record? This cannot be undone.')) return;
    staffList = staffList.filter(x => x.id !== id);
    await storageSet(STAFF_KEY, staffList);
    staffView = 'table';
    renderStaffBody();
    showToast('Staff record deleted.', 'burst');
  }

  /* ===== PAYROLL =====
     Basic comes from the staff record (Payroll Setup tab), EPF/ESI/leave-quota are set once per
     staff and reused every month. Leave/Absent days beyond the monthly quota (from Staff
     Attendance) become Loss-of-Pay. Records are generated as Draft (recalculable), then Approved
     — once Approved a record is locked in and won't silently change if salary/attendance is
     edited afterwards. Mirrors the Draft/Pending → Approved pattern used for fee discounts. */
  