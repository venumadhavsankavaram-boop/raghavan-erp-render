const SUBJECTS_KEY = "master-subjects";
  API_BACKED_KEYS[SUBJECTS_KEY] = '/api/subjects';
  let subjectsList = [];
  /* Per-section staff assignment: a subject can span multiple sections (e.g. 6th Class A & B)
     but different sections can now have different teachers. subj.staffIds stays as a derived
     union of every section's assigned staff, so any existing code reading it (Timetable
     candidates, reports) keeps working unchanged. */
  function subjectStaffForSection(subj, section){
    if(subj.sectionStaff && subj.sectionStaff[section]) return subj.sectionStaff[section];
    // Fallback for subjects saved before section-wise assignment existed.
    return subj.staffIds || [];
  }
  function recomputeSubjectStaffIds(subj){
    const all = new Set();
    (subj.sections||[]).forEach(sec => { subjectStaffForSection(subj, sec).forEach(id => all.add(id)); });
    subj.staffIds = Array.from(all);
  }
  /* One teacher per subject-section — no double-booking. Returns the other teacher's name
     if this section is already taken by someone else, or null if it's free (or already this person). */
  function sectionTeacherConflictName(subj, section, newStaffId){
    const others = subjectStaffForSection(subj, section).filter(id => id !== newStaffId);
    if(others.length === 0) return null;
    const names = others.map(id => { const st = staffList.find(x => x.id === id); return st ? st.firstName+' '+st.lastName : ''; }).filter(Boolean);
    return names.join(', ') || null;
  }
  /* Assigns exactly one teacher to a subject-section, replacing whoever was there before.
     Prompts for confirmation if that means bumping a different teacher. Pass '' to unassign.
     Returns true if applied, false if the admin declined the replacement. */
  async function setSectionTeacher(subj, section, newStaffId, skipConfirm){
    const conflict = newStaffId ? sectionTeacherConflictName(subj, section, newStaffId) : null;
    if(conflict && !skipConfirm){
      const newName = (() => { const st = staffList.find(x=>x.id===newStaffId); return st? st.firstName+' '+st.lastName : 'this teacher'; })();
      const proceed = await showConfirmDialog(`Section ${section} of ${subj.name} (${subj.className}) is already assigned to ${conflict}. Reassign it to ${newName} instead?`);
      if(!proceed) return false;
    }
    subj.sectionStaff = subj.sectionStaff || {};
    subj.sectionStaff[section] = newStaffId ? [newStaffId] : [];
    recomputeSubjectStaffIds(subj);
    return true;
  }
  let subjectsView = 'grid';
  let subjectsCurrentClass = '';

  async function loadSubjects(){
    subjectsList = await storageGet(SUBJECTS_KEY, []);
  }

  let subjectsMainTab = 'manage';
  function initSubjectsView(){
    subjectsView = 'grid';
    switchSubjectsMainTab(subjectsMainTab);
  }
  function switchSubjectsMainTab(tab){
    subjectsMainTab = tab;
    ['manage','byteacher','byclass'].forEach(t => document.getElementById('subjtab-'+t).classList.toggle('active', t===tab));
    renderSubjectsMainBody();
  }
  function renderSubjectsMainBody(){
    const body = document.getElementById('subjectsMainBody');
    if(!body) return;
    if(subjectsMainTab === 'manage') return renderSubjectsBody(body);
    if(subjectsMainTab === 'byteacher') return renderSaByTeacher(body);
    if(subjectsMainTab === 'byclass') return renderSaByClass(body);
  }
  function renderSubjectsBody(body){
    if(!body) body = document.getElementById('subjectsMainBody');
    if(!body) return;
    if(subjectsView === 'grid') return renderSubjectsClassGrid(body);
    if(subjectsView === 'list') return renderSubjectsList(body);
  }

  function renderSubjectsClassGrid(body){
    const rows = CLASS_LEVELS.map((cls, idx) => {
      const count = subjectsList.filter(s => s.className === cls).length;
      return `<div class="class-compact-tile" data-idx="${idx%4}" onclick="openSubjectsClass('${cls}')">
        <div class="class-compact-header"><div>
          <div class="class-compact-name">${cls}</div>
          <div class="class-compact-count">${count} <span class="class-compact-count-label">subject${count===1?'':'s'}</span></div>
        </div></div>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="class-compact-grid">${rows}</div>`;
  }
  function openSubjectsClass(cls){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    subjectsCurrentClass = cls;
    subjectsView = 'list';
    renderSubjectsBody();
  }
  function backToSubjectsGrid(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    subjectsView = 'grid';
    renderSubjectsBody();
  }
  function renderSubjectsList(body){
    const list = subjectsList.filter(s => s.className === subjectsCurrentClass);
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToSubjectsGrid()">All Classes</a> &nbsp;/&nbsp; ${subjectsCurrentClass}</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
        ${canDo('subjects','create') ? `<button class="btn btn-primary" onclick="openMasterSubjectModal()">+ Add Subject</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="exportSubjectsList('excel')">📥 Excel</button>
        <button class="btn btn-ghost btn-sm" onclick="exportSubjectsList('pdf')">📄 PDF</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Subject</th><th>Code</th><th>Sections</th><th>Staff</th><th>Countable</th><th>Elective</th><th></th></tr></thead>
        <tbody>
        ${list.length ? list.map(s => `
          <tr>
            <td class="name-cell">${s.name}</td>
            <td>${s.code||'—'}</td>
            <td>${(s.sections||[]).map(sec => `<span class="pill">${sec}</span>`).join(' ')}</td>
            <td>${(s.sections||[]).map(sec => `<div style="margin-bottom:3px;"><span class="pill" style="font-size:0.68rem;">${sec}</span> ${subjectStaffForSection(s,sec).map(id => { const st = staffList.find(x => x.id===id); return st ? st.firstName+' '+st.lastName : ''; }).filter(Boolean).join(', ') || '<span style="color:var(--ink-soft);">Unassigned</span>'}</div>`).join('')}</td>
            <td>${s.countable!==false ? '✓' : '—'}</td>
            <td>${s.elective ? '✓' : '—'}</td>
            <td>${canDo('subjects','edit') ? `<button class="btn-edit-text" onclick="openMasterSubjectModal('${s.id}')">Edit</button>` : ''}${(canDo('subjects','edit') && canDo('subjects','delete')) ? '&nbsp;·&nbsp;' : ''}${canDo('subjects','delete') ? `<button class="btn-danger-text" onclick="deleteMasterSubject('${s.id}')">Delete</button>` : ''}</td>
          </tr>
        `).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No subjects yet for ${subjectsCurrentClass}</b>Click "+ Add Subject" to add the first one.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  function exportSubjectsList(format){
    const list = subjectsList.filter(s => s.className === subjectsCurrentClass);
    const rows = [];
    list.forEach(s => {
      (s.sections||[]).forEach(sec => {
        const teachers = subjectStaffForSection(s,sec).map(id => { const st = staffList.find(x => x.id===id); return st ? st.firstName+' '+st.lastName : ''; }).filter(Boolean).join(', ') || 'Unassigned';
        rows.push({ 'Subject': s.name, 'Code': s.code||'', 'Section': sec, 'Teacher': teachers, 'Countable': s.countable!==false?'Yes':'No', 'Elective': s.elective?'Yes':'No' });
      });
    });
    if(format==='excel') exportRowsToExcel(`${slugifySchoolName()}_${subjectsCurrentClass}_subjects.xlsx`, 'Subjects', rows);
    else exportRowsToPDF('Subject List', subjectsCurrentClass, rows);
  }

  function openMasterSubjectModal(id){
    document.getElementById('masterSubjectForm').reset();
    document.getElementById('editMasterSubjectId').value = id || '';
    document.getElementById('masterSubjectModalTitle').textContent = id ? 'Edit Subject' : 'Add Subject';
    document.getElementById('masterSubjectSaveBtn').textContent = id ? 'Update Subject' : 'Add Subject';
    const classSel = document.getElementById('msClass');
    classSel.innerHTML = CLASS_LEVELS.map(c => `<option ${c===subjectsCurrentClass?'selected':''}>${c}</option>`).join('');
    classSel.onchange = () => { checkMsNameDuplicate(); renderMsSectionsBox(); renderMsStaffBox(); };

    let existing = null;
    if(id) existing = subjectsList.find(s => s.id === id);

    document.getElementById('msName').value = existing ? existing.name : '';
    document.getElementById('msCode').value = existing ? (existing.code||'') : '';
    document.getElementById('msCountable').checked = existing ? (existing.countable !== false) : true;
    document.getElementById('msElective').checked = existing ? !!existing.elective : false;

    window._msEditingSubjectSections = existing ? (existing.sections||[]) : [];
    renderMsSectionsBox();

    window._msEditingSubject = existing;
    renderMsStaffBox();
    document.getElementById('msNameDupeWarning').style.display = 'none';
    document.getElementById('masterSubjectSaveBtn').disabled = false;

    document.getElementById('masterSubjectModalOverlay').classList.add('open');
  }
  function renderMsSectionsBox(){
    const cls = document.getElementById('msClass').value;
    const opts = sectionsForClass(cls);
    const existingSections = window._msEditingSubjectSections || [];
    document.getElementById('msSectionsBox').innerHTML = opts.map(sec => `
      <label class="admission-toggle"><input type="checkbox" class="ms-sec-check" value="${sec}" ${existingSections.includes(sec)?'checked':''} onchange="renderMsStaffBox()"> Section ${sec}</label>
    `).join('');
  }
  function renderMsStaffBox(){
    const box = document.getElementById('msStaffBox');
    const existing = window._msEditingSubject;
    const checkedSections = Array.from(document.querySelectorAll('.ms-sec-check:checked')).map(c => c.value);
    if(checkedSections.length === 0){
      box.innerHTML = `<div style="font-size:0.82rem; color:var(--ink-soft);">Select at least one section above to assign staff.</div>`;
      return;
    }
    if(staffList.length === 0){
      box.innerHTML = `<div style="font-size:0.82rem; color:var(--ink-soft);">No staff added yet — add some under Manage Staff.</div>`;
      return;
    }
    box.innerHTML = checkedSections.map(sec => {
      const assignedForSec = existing ? subjectStaffForSection(existing, sec) : [];
      return `
      <div style="margin-bottom:10px;">
        <div style="font-size:0.72rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Section ${sec}</div>
        ${staffList.map(st => `<label class="disc-check-item"><input type="checkbox" class="ms-staff-check" data-section="${sec}" value="${st.id}" ${assignedForSec.includes(st.id)?'checked':''}> ${st.firstName} ${st.lastName} <span style="color:var(--ink-soft); font-size:0.76rem;">(${st.designation||'Staff'})</span></label>`).join('')}
      </div>
    `;
    }).join('');
  }
  function closeMasterSubjectModal(){
    document.getElementById('masterSubjectModalOverlay').classList.remove('open');
  }
  function checkMsNameDuplicate(){
    const name = document.getElementById('msName').value.trim();
    const className = document.getElementById('msClass').value;
    const editId = document.getElementById('editMasterSubjectId').value;
    const warning = document.getElementById('msNameDupeWarning');
    const saveBtn = document.getElementById('masterSubjectSaveBtn');
    if(!name){ warning.style.display = 'none'; saveBtn.disabled = false; return; }
    const dupe = subjectsList.find(s => s.id !== editId && s.className === className && s.name.trim().toLowerCase() === name.toLowerCase());
    if(dupe){
      warning.textContent = `⚠ "${name}" already exists for ${className} — edit that entry instead.`;
      warning.style.display = 'block';
      saveBtn.disabled = true;
    }else{
      warning.style.display = 'none';
      saveBtn.disabled = false;
    }
  }
  async function saveMasterSubject(e){
    e.preventDefault();
    const editId = document.getElementById('editMasterSubjectId').value;
    const name = document.getElementById('msName').value.trim();
    const className = document.getElementById('msClass').value;
    if(!name){ showToast('Enter a subject name.'); return false; }
    const dupe = subjectsList.find(s => s.id !== editId && s.className === className && s.name.trim().toLowerCase() === name.toLowerCase());
    if(dupe){ showToast(`"${name}" already exists for ${className} — edit that entry instead of creating a duplicate.`); return false; }
    const sections = Array.from(document.querySelectorAll('.ms-sec-check:checked')).map(c => c.value);
    if(sections.length === 0){ showToast('Select at least one section.'); return false; }
    const sectionStaff = {};
    sections.forEach(sec => {
      sectionStaff[sec] = Array.from(document.querySelectorAll(`.ms-staff-check[data-section="${sec}"]:checked`)).map(c => c.value);
    });
    const data = {
      name,
      code: document.getElementById('msCode').value.trim(),
      className,
      sections,
      sectionStaff,
      staffIds: Array.from(document.querySelectorAll('.ms-staff-check:checked')).map(c => c.value),
      countable: document.getElementById('msCountable').checked,
      elective: document.getElementById('msElective').checked,
    };
    if(editId){
      const idx = subjectsList.findIndex(s => s.id === editId);
      subjectsList[idx] = { ...subjectsList[idx], ...data };
      showToast('Subject updated.');
    }else{
      data.id = 'msub_' + Date.now();
      subjectsList.push(data);
      showToast('Subject added.');
    }
    await storageSet(SUBJECTS_KEY, subjectsList);
    closeMasterSubjectModal();
    subjectsCurrentClass = data.className;
    renderSubjectsBody();
    return false;
  }
  async function deleteMasterSubject(id){
    if(!await showConfirmDialog('Delete this subject from the master list?')) return;
    subjectsList = subjectsList.filter(s => s.id !== id);
    await storageSet(SUBJECTS_KEY, subjectsList);
    renderSubjectsBody();
    showToast('Subject deleted.', 'burst');
  }

  /* ===== STAFF MODULE ===== */
  