const SYLLABUS_TAB_PERM_KEYS = { tracker:'syllabus_tracker', homework:'syllabus_homework' };
  let syllabusTab = 'tracker';
  let syClass = '', sySection = '', sySubject = '';
  function initSyllabusView(){
    const accessibleTabs = Object.keys(SYLLABUS_TAB_PERM_KEYS).filter(t => getSyllabusTabAccess(currentUser.role, SYLLABUS_TAB_PERM_KEYS[t]));
    Object.keys(SYLLABUS_TAB_PERM_KEYS).forEach(t => { const btn = document.getElementById('sytab-'+t); if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none'; });
    if(!accessibleTabs.includes(syllabusTab)) syllabusTab = accessibleTabs[0] || 'tracker';
    switchSyllabusTab(syllabusTab);
  }
  function switchSyllabusTab(tab){
    syllabusTab = tab;
    ['tracker','homework'].forEach(t => { const btn = document.getElementById('sytab-'+t); if(btn) btn.classList.toggle('active', t===tab); });
    renderSyllabusBody();
  }
  function renderSyllabusBody(){
    const body = document.getElementById('syllabusBody');
    if(!body) return;
    if(!getSyllabusTabAccess(currentUser.role, SYLLABUS_TAB_PERM_KEYS[syllabusTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(syllabusTab === 'tracker') return renderSyllabusTrackerTab(body);
    if(syllabusTab === 'homework') return renderHomeworkTab(body);
  }
  function syFilterBarHtml(){
    return `
      <div class="form-grid" style="max-width:640px; margin-bottom:16px;">
        <div class="f-field"><label>Class</label><select onchange="syClass=this.value; sySection=''; sySubject=''; renderSyllabusBody();"><option value="">All Classes</option>${CLASS_LEVELS.map(c => `<option ${c===syClass?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="f-field"><label>Section</label><select onchange="sySection=this.value; renderSyllabusBody();" ${!syClass?'disabled':''}><option value="">All Sections</option>${(syClass?sectionsForClass(syClass):[]).map(s => `<option ${s===sySection?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="f-field"><label>Subject</label><select onchange="sySubject=this.value; renderSyllabusBody();" ${!syClass?'disabled':''}><option value="">All Subjects</option>${[...new Set(subjectsList.filter(s=>s.className===syClass).map(s=>s.name))].map(n => `<option ${n===sySubject?'selected':''}>${n}</option>`).join('')}</select></div>
      </div>
    `;
  }
  function syllabusStatusPill(status){
    const color = status==='Completed' ? 'var(--success-ink)' : status==='In Progress' ? 'var(--warning-ink)' : 'var(--ink-soft)';
    const bg = status==='Completed' ? 'var(--success-bg)' : status==='In Progress' ? 'var(--warning-bg)' : 'rgba(0,0,0,0.06)';
    return `<span class="pill" style="background:${bg}; color:${color};">${status||'Not Started'}</span>`;
  }
  function renderSyllabusTrackerTab(body){
    const canEdit = canSub('syllabus_tracker','syllabus','edit');
    const rows = syllabusTopics.filter(t => (!syClass || t.className===syClass) && (!sySection || !t.section || t.section===sySection) && (!sySubject || t.subject===sySubject))
      .sort((a,b) => (a.className+a.subject).localeCompare(b.className+b.subject) || (a.targetDate||'').localeCompare(b.targetDate||''));
    body.innerHTML = `
      ${syFilterBarHtml()}
      ${canEdit ? `<button class="btn btn-primary btn-sm" style="margin-bottom:16px;" ${!syClass?'disabled title="Pick a class first"':''} onclick="openSyllabusTopicModal()">+ Add Topic</button>` : ''}
      ${rows.length ? `
      <div class="table-wrap">
        <table><thead><tr><th>Class/Section</th><th>Subject</th><th>Topic</th><th>Status</th><th>Target Date</th>${canEdit?'<th></th>':''}</tr></thead><tbody>
        ${rows.map(t => `
          <tr>
            <td>${t.className}${t.section?' — '+t.section:' — All Sections'}</td>
            <td>${t.subject}</td>
            <td>${t.topic}</td>
            <td>${syllabusStatusPill(t.status)}</td>
            <td>${t.targetDate||'—'}</td>
            ${canEdit ? `<td style="white-space:nowrap;"><button class="btn-edit-text" onclick="openSyllabusTopicModal('${t.id}')">Edit</button> · <button class="btn-danger-text" onclick="deleteSyllabusTopic('${t.id}')">Delete</button></td>` : ''}
          </tr>`).join('')}
        </tbody></table>
      </div>` : `<div class="empty-state"><b>No syllabus topics yet</b>${syClass ? 'Add the first topic for '+syClass+'.' : 'Pick a class above, then add topics — or leave it on All Classes to see everything at once.'}</div>`}
    `;
  }
  let syEditId = '';
  function openSyllabusTopicModal(id){
    if(!syClass){ showToast('Pick a class first.'); return; }
    syEditId = id || '';
    const t = id ? syllabusTopics.find(x => x.id===id) : null;
    document.getElementById('syTopicModalTitle').textContent = id ? 'Edit Topic' : 'Add Syllabus Topic';
    document.getElementById('syTopicClassLabel').textContent = syClass;
    const sectionSel = document.getElementById('syTopicSection');
    sectionSel.innerHTML = `<option value="">All Sections</option>` + sectionsForClass(syClass).map(s => `<option ${t&&t.section===s?'selected':''}>${s}</option>`).join('');
    const subjSel = document.getElementById('syTopicSubject');
    const classSubjects = subjectsList.filter(s => s.className===syClass);
    subjSel.innerHTML = `<option value="">Select subject</option>` + classSubjects.map(s => `<option ${t&&t.subject===s.name?'selected':''}>${s.name}</option>`).join('');
    document.getElementById('syTopicName').value = t ? t.topic : '';
    document.getElementById('syTopicStatus').value = t ? (t.status||'Not Started') : 'Not Started';
    document.getElementById('syTopicTargetDate').value = t ? (t.targetDate||'') : '';
    document.getElementById('syTopicNotes').value = t ? (t.notes||'') : '';
    document.getElementById('syTopicModalOverlay').classList.add('open');
  }
  function closeSyllabusTopicModal(){ document.getElementById('syTopicModalOverlay').classList.remove('open'); }
  async function saveSyllabusTopic(e){
    e.preventDefault();
    const subject = document.getElementById('syTopicSubject').value;
    const topic = document.getElementById('syTopicName').value.trim();
    if(!subject || !topic){ showToast('Subject and topic are required.'); return false; }
    const existing = syEditId ? syllabusTopics.find(x => x.id===syEditId) : null;
    const status = document.getElementById('syTopicStatus').value;
    const data = {
      className: syClass,
      section: document.getElementById('syTopicSection').value,
      subject, topic, status,
      targetDate: document.getElementById('syTopicTargetDate').value,
      completedDate: status === 'Completed' ? ((existing && existing.status === 'Completed' && existing.completedDate) ? existing.completedDate : new Date().toISOString().slice(0,10)) : '',
      notes: document.getElementById('syTopicNotes').value.trim(),
      updatedAt: new Date().toISOString(),
    };
    if(existing){
      const idx = syllabusTopics.findIndex(x => x.id===syEditId);
      syllabusTopics[idx] = { ...existing, ...data };
    }else{
      syllabusTopics.push({ id:'syt_'+Date.now(), ...data });
    }
    await storageSet(SYLLABUS_KEY, syllabusTopics);
    closeSyllabusTopicModal();
    renderSyllabusBody();
    showToast('Saved.', 'burst');
    return false;
  }
  async function deleteSyllabusTopic(id){
    if(!await showConfirmDialog('Remove this syllabus topic?')) return;
    syllabusTopics = syllabusTopics.filter(x => x.id!==id);
    await storageSet(SYLLABUS_KEY, syllabusTopics);
    renderSyllabusBody();
  }
  function renderHomeworkTab(body){
    const canEdit = canSub('syllabus_homework','syllabus','edit');
    const today = new Date().toISOString().slice(0,10);
    const rows = homeworkItems.filter(h => (!syClass || h.className===syClass) && (!sySection || !h.section || h.section===sySection) && (!sySubject || h.subject===sySubject))
      .sort((a,b) => (b.dueDate||'').localeCompare(a.dueDate||''));
    body.innerHTML = `
      ${syFilterBarHtml()}
      ${canEdit ? `<button class="btn btn-primary btn-sm" style="margin-bottom:16px;" ${!syClass?'disabled title="Pick a class first"':''} onclick="openHomeworkModal()">+ Assign Homework</button>` : ''}
      ${rows.length ? `
      <div class="table-wrap">
        <table><thead><tr><th>Class/Section</th><th>Subject</th><th>Title</th><th>Assigned</th><th>Due</th><th></th>${canEdit?'<th></th>':''}</tr></thead><tbody>
        ${rows.map(h => {
          const overdue = h.dueDate && h.dueDate < today;
          return `<tr>
            <td>${h.className}${h.section?' — '+h.section:' — All Sections'}</td>
            <td>${h.subject}</td>
            <td>${h.title}${(h.attachments||[]).map(a => `<br><a href="${a.dataUrl}" target="_blank" rel="noopener" class="pill" style="text-decoration:none; font-size:0.68rem;">📎 ${a.name}</a>`).join('')}</td>
            <td>${h.assignedDate||'—'}</td>
            <td>${h.dueDate ? `<span style="${overdue?'color:var(--magenta); font-weight:600;':''}">${h.dueDate}${overdue?' (overdue)':''}</span>` : '—'}</td>
            <td><button class="btn-edit-text" onclick="openHomeworkRoster('${h.id}')">Roster</button></td>
            ${canEdit ? `<td style="white-space:nowrap;"><button class="btn-edit-text" onclick="openHomeworkModal('${h.id}')">Edit</button> · <button class="btn-danger-text" onclick="deleteHomework('${h.id}')">Delete</button></td>` : ''}
          </tr>`;
        }).join('')}
        </tbody></table>
      </div>` : `<div class="empty-state"><b>No homework assigned yet</b>${syClass ? 'Assign the first item for '+syClass+'.' : 'Pick a class above, then assign homework — or leave it on All Classes to see everything at once.'}</div>`}
    `;
  }
  let hwEditId = '';
  function openHomeworkModal(id){
    if(!syClass){ showToast('Pick a class first.'); return; }
    hwEditId = id || '';
    const h = id ? homeworkItems.find(x => x.id===id) : null;
    document.getElementById('homeworkModalTitle').textContent = id ? 'Edit Homework' : 'Assign Homework';
    document.getElementById('hwClassLabel').textContent = syClass;
    const sectionSel = document.getElementById('hwSection');
    sectionSel.innerHTML = `<option value="">All Sections</option>` + sectionsForClass(syClass).map(s => `<option ${h&&h.section===s?'selected':''}>${s}</option>`).join('');
    const subjSel = document.getElementById('hwSubject');
    const classSubjects = subjectsList.filter(s => s.className===syClass);
    subjSel.innerHTML = `<option value="">Select subject</option>` + classSubjects.map(s => `<option ${h&&h.subject===s.name?'selected':''}>${s.name}</option>`).join('');
    const staffSel = document.getElementById('hwStaff');
    const myStaffRecord = staffList.find(st => st.linkedUserId === currentUser.id);
    const defaultStaffId = h ? h.staffId : (myStaffRecord ? myStaffRecord.id : '');
    staffSel.innerHTML = `<option value="">Select teacher</option>` + staffList.filter(staffIsActive).map(st => `<option value="${st.id}" ${st.id===defaultStaffId?'selected':''}>${st.firstName} ${st.lastName}</option>`).join('');
    document.getElementById('hwTitle').value = h ? h.title : '';
    document.getElementById('hwDescription').value = h ? (h.description||'') : '';
    document.getElementById('hwAssignedDate').value = h ? (h.assignedDate||'') : new Date().toISOString().slice(0,10);
    document.getElementById('hwDueDate').value = h ? (h.dueDate||'') : '';
    hwAttachments = h && Array.isArray(h.attachments) ? h.attachments.map(a => ({ name:a.name, dataUrl:a.dataUrl, size:0 })) : [];
    renderHwAttachmentPreview();
    document.getElementById('homeworkModalOverlay').classList.add('open');
  }
  function closeHomeworkModal(){ document.getElementById('homeworkModalOverlay').classList.remove('open'); }
  // Same {name, dataUrl, size} shape and 5-file/12MB-combined caps as the
  // student submission attachments above — one teacher-facing upload of the
  // same kind, just attached to the homework item itself instead of a
  // student's response to it.
  let hwAttachments = [];
  function previewHwAttachment(e){
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if(!files.length) return;
    const currentTotal = hwAttachments.reduce((sum,a) => sum + (a.size||0), 0);
    let runningTotal = currentTotal;
    const toRead = [];
    for(const file of files){
      if(hwAttachments.length + toRead.length >= MAX_SUBMISSION_FILES){
        showToast('You can attach up to ' + MAX_SUBMISSION_FILES + ' files.');
        break;
      }
      if(file.size > MAX_SUBMISSION_FILE_BYTES){
        showToast(file.name + ' is over 5MB — please choose a smaller file.');
        continue;
      }
      if(runningTotal + file.size > MAX_SUBMISSION_TOTAL_BYTES){
        showToast('That would put your combined attachments over 12MB — please choose smaller or fewer files.');
        break;
      }
      runningTotal += file.size;
      toRead.push(file);
    }
    if(!toRead.length) return;
    let pending = toRead.length;
    toRead.forEach(file => {
      const reader = new FileReader();
      reader.onload = evt => {
        hwAttachments.push({ name: file.name, dataUrl: evt.target.result, size: file.size });
        pending--;
        if(pending === 0) renderHwAttachmentPreview();
      };
      reader.readAsDataURL(file);
    });
  }
  function renderHwAttachmentPreview(){
    const preview = document.getElementById('hwAttachmentPreview');
    if(!preview) return;
    preview.innerHTML = hwAttachments.map((a,i) => `
      <span class="pill" style="margin:0 6px 6px 0; display:inline-flex; align-items:center; gap:6px;">
        📎 ${a.name}
        <a href="javascript:void(0)" onclick="removeHwAttachment(${i})" style="color:var(--magenta); text-decoration:none; font-weight:700;">✕</a>
      </span>
    `).join('');
  }
  function removeHwAttachment(i){
    hwAttachments.splice(i, 1);
    renderHwAttachmentPreview();
  }
  async function saveHomework(e){
    e.preventDefault();
    const subject = document.getElementById('hwSubject').value;
    const title = document.getElementById('hwTitle').value.trim();
    if(!subject || !title){ showToast('Subject and title are required.'); return false; }
    const data = {
      className: syClass,
      section: document.getElementById('hwSection').value,
      subject, title,
      description: document.getElementById('hwDescription').value.trim(),
      assignedDate: document.getElementById('hwAssignedDate').value,
      dueDate: document.getElementById('hwDueDate').value,
      staffId: document.getElementById('hwStaff').value,
      attachments: hwAttachments.map(a => ({ name:a.name, dataUrl:a.dataUrl })),
      updatedAt: new Date().toISOString(),
    };
    if(hwEditId){
      const idx = homeworkItems.findIndex(x => x.id===hwEditId);
      if(idx>-1) homeworkItems[idx] = { ...homeworkItems[idx], ...data };
    }else{
      homeworkItems.push({ id:'hw_'+Date.now(), createdAt: new Date().toISOString(), ...data });
    }
    await storageSet(HOMEWORK_KEY, homeworkItems);
    closeHomeworkModal();
    renderSyllabusBody();
    showToast('Saved.', 'burst');
    return false;
  }
  async function deleteHomework(id){
    if(!await showConfirmDialog('Remove this homework item?')) return;
    homeworkItems = homeworkItems.filter(x => x.id!==id);
    await storageSet(HOMEWORK_KEY, homeworkItems);
    renderSyllabusBody();
  }
  // Who's turned this homework in — every active student in its class(+section)
  // cross-referenced against student_submissions for this homework_id, resolved
  // server-side (see GET /api/homework-items/:id/roster) since that join isn't
  // data this page already has lying around.
  async function openHomeworkRoster(id){
    document.getElementById('hwRosterSubtitle').textContent = '';
    document.getElementById('hwRosterBody').innerHTML = `<p style="font-size:0.85rem; color:var(--ink-soft);">Loading…</p>`;
    document.getElementById('hwRosterModalOverlay').classList.add('open');
    try{
      const res = await throwIfNotOk(await fetch('/api/homework-items/'+encodeURIComponent(id)+'/roster', { headers: actorHeaders() }));
      const { homework, roster } = await res.json();
      document.getElementById('hwRosterSubtitle').textContent = `${homework.subject} — ${homework.title} (${homework.className}${homework.section?' — '+homework.section:''})`;
      const statusLabel = st => st==='not_submitted' ? 'Not submitted' : st==='resubmit' ? 'Needs Resubmission' : st==='reviewed' ? 'Reviewed' : 'Submitted';
      const statusColor = st => st==='not_submitted' ? 'color:var(--ink-soft);' : st==='resubmit' ? 'background:rgba(209,16,115,0.15); color:var(--magenta);' : st==='reviewed' ? 'background:rgba(19,145,127,0.15); color:var(--teal);' : '';
      const sorted = [...roster].sort((a,b) => (a.studentName||'').localeCompare(b.studentName||''));
      const submittedCount = roster.filter(r => r.status !== 'not_submitted').length;
      document.getElementById('hwRosterBody').innerHTML = `
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:0 0 12px;">${submittedCount} of ${roster.length} student(s) have submitted.</p>
        <div class="table-wrap">
          <table><thead><tr><th>Student</th><th>Section</th><th>Status</th><th>Marks</th></tr></thead><tbody>
          ${sorted.map(r => `<tr>
            <td>${r.studentName}</td><td>${r.section||'—'}</td>
            <td><span class="pill" style="${statusColor(r.status)}">${statusLabel(r.status)}</span></td>
            <td>${r.marks||'—'}</td>
          </tr>`).join('')}
          </tbody></table>
        </div>
      `;
    }catch(e){
      document.getElementById('hwRosterBody').innerHTML = `<div class="empty-state"><b>Could not load the roster</b>${e.message||''}</div>`;
    }
  }
  function closeHomeworkRoster(){ document.getElementById('hwRosterModalOverlay').classList.remove('open'); }

  function initMyAccountView(){
    myAccountPhotoData = currentUser ? (currentUser.photo || '') : '';
    renderMyAccountBody();
  }
  function renderMyAccountBody(){
    const body = document.getElementById('myAccountBody');
    if(!body) return;
    if(!currentUser){ body.innerHTML = `<div class="empty-state"><b>Account not found</b></div>`; return; }
    const u = currentUser;
    // Falls back to the Staff-record photo until the person uploads their own.
    const shown = myAccountPhotoData || myAvatarPhoto();
    const fromStaff = !myAccountPhotoData && !!shown;
    body.innerHTML = `
      <section class="acct-hero">
        <div class="acct-avatar">
          ${shown ? `<img src="${shown}" alt="Your photo">` : `<span>${myInitials()}</span>`}
          <label class="acct-cam" title="Change photo" aria-label="Change photo">📷
            <input type="file" accept="image/*" hidden onchange="previewMyAccountPhoto(event)"></label>
        </div>
        <div class="acct-id">
          <h2>${escapeHtml(u.name || '')}</h2>
          <div><span class="pill">${escapeHtml(u.role)}</span> <span class="acct-user">@${escapeHtml(u.username)}</span></div>
          <small>${fromStaff ? 'Showing the photo from your staff record. Upload one here to use your own.' : 'Tap the camera to change your photo. Save to keep it.'}</small>
        </div>
        ${myAccountPhotoData ? `<button type="button" class="sf-btn sf-btn--danger" onclick="removeMyAccountPhoto()">Remove photo</button>` : ''}
      </section>
      <div class="acct-grid">
        <section class="acct-card">
          <h3>Profile</h3>
          <div class="f-field"><label for="myAccountName">Full name</label><input type="text" class="input" id="myAccountName" value="${escapeHtml(u.name || '')}"></div>
          <div class="acct-row2">
            <div class="f-field"><label>Username</label><input type="text" class="input" value="${escapeHtml(u.username)}" disabled></div>
            <div class="f-field"><label>Role</label><input type="text" class="input" value="${escapeHtml(u.role)}" disabled></div>
          </div>
          <button type="button" class="sf-btn sf-btn--primary sf-btn--lg" onclick="saveMyAccountProfile()">Save profile</button>
        </section>
        <section class="acct-card">
          <h3>🔑 Change password</h3>
          <p class="acct-hint">Choose something only you know. At least 4 characters.</p>
          <div class="f-field"><label for="myCpCurrent">Current password</label><input type="password" class="input" id="myCpCurrent" autocomplete="current-password"></div>
          <div class="f-field"><label for="myCpNew">New password</label><input type="password" class="input" id="myCpNew" autocomplete="new-password"></div>
          <div class="f-field"><label for="myCpConfirm">Confirm new password</label><input type="password" class="input" id="myCpConfirm" autocomplete="new-password"></div>
          <label class="acct-show"><input type="checkbox" onchange="['myCpCurrent','myCpNew','myCpConfirm'].forEach(i=>document.getElementById(i).type=this.checked?'text':'password')"> Show passwords</label>
          <button type="button" class="sf-btn sf-btn--soft sf-btn--lg" onclick="changePasswordFromMyAccount()">Update password</button>
        </section>
      </div>`;
  }
  function previewMyAccountPhoto(e){
    readImageFileWithSizeLimit(e, dataUrl => {
      myAccountPhotoData = dataUrl;
      renderMyAccountBody();
    });
  }
  function removeMyAccountPhoto(){
    myAccountPhotoData = '';
    renderMyAccountBody();
  }
  // Own-account changes go through /api/account/*, which every signed-in role
  // may use for their OWN record (the generic users API is Admin-only).
  async function saveMyAccountProfile(){
    const name = document.getElementById('myAccountName').value.trim();
    if(!name){ showToast('Enter your name.'); return; }
    try{
      const res = await fetch('/api/account/profile', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, photo: myAccountPhotoData }) });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){ showToast(data.error || 'Could not save your profile.'); return; }
    }catch(e){ showToast('Could not reach the server. Try again.'); return; }
    currentUser.name = name;
    currentUser.photo = myAccountPhotoData;
    const rec = users.find(x => x.id === currentUser.id);
    if(rec){ rec.name = name; rec.photo = myAccountPhotoData; }
    document.getElementById('sbUserName').textContent = name;
    updateSidebarAvatar();
    renderMyAccountBody();
    showToast('Profile updated.', 'burst');
  }
  async function changePasswordFromMyAccount(){
    const current = document.getElementById('myCpCurrent').value;
    const next = document.getElementById('myCpNew').value;
    const confirm2 = document.getElementById('myCpConfirm').value;
    if(!current){ showToast('Enter your current password.'); return; }
    if(!next || next.length < 4){ showToast('New password must be at least 4 characters.'); return; }
    if(next !== confirm2){ showToast('New password and confirmation do not match.'); return; }
    try{
      const res = await fetch('/api/account/password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ current, next }) });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){ showToast(data.error || 'Could not update the password.'); return; }
    }catch(e){ showToast('Could not reach the server. Try again.'); return; }
    ['myCpCurrent','myCpNew','myCpConfirm'].forEach(id => { document.getElementById(id).value = ''; });
    showToast('Password updated.', 'burst');
  }

  function initInventoryView(){
    inventoryTab = getInventoryTabAccess(currentUser.role, 'inventory_items') ? 'items'
      : getInventoryTabAccess(currentUser.role, 'inventory_approvals') ? 'approvals'
      : getInventoryTabAccess(currentUser.role, 'inventory_saleshistory') ? 'saleshistory'
      : getInventoryTabAccess(currentUser.role, 'inventory_stockoverview') ? 'stockoverview'
      : 'items';
    invItemsView = 'list'; invQuickOpen = false;
    renderInventoryBody();
  }
  function switchInventoryTab(tab){
    inventoryTab = tab;
    invQuickOpen = false;
    renderInventoryBody();
  }
  function toggleInvQuickMenu(e){
    if(e) e.stopPropagation();
    invQuickOpen = !invQuickOpen;
    renderInventoryItemsList(document.getElementById('inventoryBody'));
  }
  function pendingInventoryApprovalsCount(){
    return pendingApprovals.filter(a => a.type==='inventory_item' && a.status==='Pending').length;
  }
  const INV_TAB_PERM_KEYS = { items:'inventory_items', sellcart:'inventory_sell', sellcheckout:'inventory_sell', approvals:'inventory_approvals', saleshistory:'inventory_saleshistory', stockoverview:'inventory_stockoverview' };
  function renderInventoryBody(){
    const body = document.getElementById('inventoryBody');
    if(!body) return;
    if(!getInventoryTabAccess(currentUser.role, INV_TAB_PERM_KEYS[inventoryTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(inventoryTab === 'items') return invItemsView==='edit' ? renderInventoryItemEditor(body) : renderInventoryItemsList(body);
    if(inventoryTab === 'sellcart') return renderInventorySellCart(body);
    if(inventoryTab === 'sellcheckout') return renderInventoryCheckout(body);
    if(inventoryTab === 'approvals') return renderInventoryApprovalsTab(body);
    if(inventoryTab === 'saleshistory') return renderInventorySalesHistoryTab(body);
    if(inventoryTab === 'stockoverview') return renderInventoryStockOverviewTab(body);
  }

  function setInvFilterType(t){ invFilterType = t; renderInventoryItemsList(document.getElementById('inventoryBody')); }
  /* --- Return unsold stock to the vendor/supplier: reduces quantity & stock
     value only — never touches Revenue, Collected or Profit, since no sale or
     payment is involved. Kept as its own log, separate from buyer returns. --- */
  function openVendorReturnModal(itemId){
    const it = inventoryItems.find(x => x.id === itemId);
    if(!it) return;
    const wrap = document.getElementById('vendorReturnModalWrap');
    if(!wrap) return;
    wrap.innerHTML = `
      <div style="position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:999; padding:20px;">
        <div class="profile-card" style="width:100%; max-width:400px;">
          <h4>Return to Vendor — ${it.name}</h4>
          <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 14px;">${it.quantity} currently in stock.</p>
          <input type="hidden" id="vretItemId" value="${it.id}">
          <div class="f-field" style="margin-bottom:10px;"><label>Return Date</label><input type="date" id="vretDate" value="${new Date().toISOString().slice(0,10)}" max="${new Date().toISOString().slice(0,10)}"></div>
          <div class="f-field" style="margin-bottom:10px;"><label>Quantity to Return (max ${it.quantity})</label><input type="number" id="vretQty" min="1" max="${it.quantity}" value="1"></div>
          <div class="f-field" style="margin-bottom:10px;"><label>Vendor / Supplier</label><input type="text" id="vretVendor" placeholder="e.g. name of the supplier"></div>
          <div class="f-field" style="margin-bottom:14px;"><label>Reason</label><input type="text" id="vretReason" placeholder="e.g. unsold, damaged, wrong order"></div>
          <div style="background:rgba(24,143,134,0.10); border-left:4px solid var(--teal); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:0.76rem;">Only reduces stock on hand and stock value at cost — does not affect Revenue, Amount Collected, or Profit.</div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="submitVendorReturn()">Confirm Return</button>
            <button class="btn btn-ghost btn-sm" onclick="closeVendorReturnModal()">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }
  function closeVendorReturnModal(){
    const wrap = document.getElementById('vendorReturnModalWrap');
    if(wrap) wrap.innerHTML = '';
  }
  async function submitVendorReturn(){
    const itemId = document.getElementById('vretItemId').value;
    const it = inventoryItems.find(x => x.id === itemId);
    if(!it) return;
    const qty = Math.max(1, Math.min(Number(document.getElementById('vretQty').value) || 0, it.quantity));
    if(qty <= 0){ showToast('Enter a valid quantity.'); return; }
    const vendor = document.getElementById('vretVendor').value.trim();
    const reason = document.getElementById('vretReason').value.trim();
    const todayStr = new Date().toISOString().slice(0,10);
    const vretDateInput = document.getElementById('vretDate');
    const today = vretDateInput ? vretDateInput.value : todayStr;
    if(!today){ showToast('Set a return date.'); return; }
    if(today > todayStr){ showToast("Return date can't be in the future."); return; }
    const costReversed = Math.round(qty * (it.costPrice||0) * 100) / 100;

    it.quantity -= qty;
    inventoryVendorReturns.push({
      id:'ivret_'+Date.now()+'_'+it.id, itemId:it.id, itemName:it.name, qty, costReversed,
      vendor, reason, date:today, processedBy:currentUser.name,
    });

    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    await storageSet(INVENTORY_VENDOR_RETURNS_KEY, inventoryVendorReturns);
    closeVendorReturnModal();
    renderInventoryBody();
    showToast(`${qty} unit${qty===1?'':'s'} of ${it.name} returned to vendor — stock updated.`);
  }

  /* --- Add / Edit product, with Admin approval required for non-Admin stock changes --- */
  function openInventoryItemEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingInventoryItemId = id || '';
    invItemsView = 'edit';
    renderInventoryBody();
  }
  function backToInventoryItemsList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    invItemsView = 'list';
    renderInventoryBody();
  }
  function renderInventoryItemEditor(body){
    const it = editingInventoryItemId ? inventoryItems.find(x => x.id === editingInventoryItemId) : null;
    const isAdmin = currentUser.role === 'Admin';
    const selectedCat = it && it.category ? it.category : INVENTORY_CATEGORIES[0];
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToInventoryItemsList()">Items</a> &nbsp;/&nbsp; ${it ? it.name : 'New Product'}</div>
      ${!isAdmin ? `<div class="profile-card" style="max-width:760px; background:rgba(203,154,46,0.12); border-left:4px solid var(--gold); margin-bottom:16px; font-size:0.82rem;"><b>⚠ Stock changes need Admin approval.</b> Saving this will be sent for review before it takes effect.</div>` : ''}

      <div class="profile-card" style="max-width:760px; margin-bottom:20px;">
        <h4>📦 Basic Information</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field full"><label>Product Name <span class="required-star">*</span></label><input type="text" id="invItemName" value="${it?it.name:''}" placeholder="Enter product name"></div>
          <div class="f-field"><label>Type <span class="required-star">*</span></label><select id="invItemType"><option value="Sellable" ${(!it||it.type==='Sellable')?'selected':''}>Sellable</option><option value="Non-Sellable" ${it&&it.type==='Non-Sellable'?'selected':''}>Non-Sellable</option></select></div>
          <div class="f-field"><label>Category <span class="required-star">*</span></label><select id="invItemCategory" onchange="onInvCategoryChange()">${INVENTORY_CATEGORIES.map(c => `<option ${selectedCat===c?'selected':''}>${c}</option>`).join('')}</select></div>
          <div class="f-field"><label>Sub-Category</label><select id="invItemSubCategory">${invSubCategoryOptions(selectedCat, it?it.subCategory:'')}</select></div>
        </div>
      </div>

      <div class="profile-card" style="max-width:760px; margin-bottom:20px;">
        <h4>💰 Pricing &amp; Stock</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field"><label>Cost Price (₹) / per unit <span class="required-star">*</span></label><input type="number" id="invItemCost" value="${it?it.costPrice:''}" min="0" step="0.01" placeholder="0.00"></div>
          <div class="f-field"><label>Selling Price (₹) / per unit <span class="required-star">*</span></label><input type="number" id="invItemSelling" value="${it?it.sellingPrice:''}" min="0" step="0.01" placeholder="0.00"></div>
          <div class="f-field"><label>Current Stock <span class="required-star">*</span></label><input type="number" id="invItemQty" value="${it?it.quantity:''}" min="0" placeholder="0"></div>
          <div class="f-field"><label>Minimum Stock (low-stock threshold)</label><input type="number" id="invItemThreshold" value="${it?it.threshold:5}" min="0"></div>
          <div class="f-field"><label>Unit <span class="required-star">*</span></label><select id="invItemUnit">${INVENTORY_UNITS.map(u => `<option ${it&&it.unit===u?'selected':(!it&&u==='Piece')?'selected':''}>${u}</option>`).join('')}</select></div>
          <div class="f-field">
            <label>Size</label>
            <input type="text" id="invItemSize" value="${it&&it.size?it.size:''}" placeholder="e.g. S, M, L, XL (optional)">
            <p style="font-size:0.72rem; color:var(--ink-soft); margin:4px 0 0;">Optional — for uniforms etc.</p>
          </div>
        </div>
      </div>

      <div class="profile-card" style="max-width:760px; margin-bottom:20px;">
        <h4>🏷️ Tax &amp; Other Details</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field"><label>Applicable Class</label><input type="text" id="invItemClass" value="${it&&it.applicableClass?it.applicableClass:''}" placeholder="e.g. Class 5"></div>
          <div class="f-field"><label>Tax Rate (GST %)</label><input type="number" id="invItemTaxRate" value="${it&&it.taxRate!==undefined?it.taxRate:0}" min="0" max="100" step="0.01"></div>
          <div class="f-field full"><label>HSN Code</label><input type="text" id="invItemHsn" value="${it&&it.hsnCode?it.hsnCode:''}" placeholder="HSN code for GST (optional)"></div>
          <div class="f-field full"><label>Description</label><textarea id="invItemDescription" rows="3" placeholder="Enter product description (optional)">${it&&it.description?it.description:''}</textarea></div>
        </div>
      </div>

      ${!isAdmin ? `<div class="profile-card" style="max-width:760px; margin-bottom:20px;"><div class="f-field full"><label>Explanation for Admin <span class="required-star">*</span></label><textarea id="invItemExplanation" rows="2" placeholder="Why is this stock change needed?"></textarea></div></div>` : ''}

      <div style="display:flex; gap:10px; max-width:760px; justify-content:flex-end;">
        <button class="btn btn-ghost" onclick="backToInventoryItemsList()">Cancel</button>
        <button class="btn btn-primary" onclick="saveInventoryItem()">${isAdmin ? (it ? 'Save Product' : '📦 Add Product') : 'Submit for Approval'}</button>
      </div>
    `;
  }
  function invSubCategoryOptions(category, selected){
    const opts = INVENTORY_SUBCATEGORIES[category] || INVENTORY_SUBCATEGORIES['Other'];
    return `<option value="">Select sub-category</option>` + opts.map(s => `<option ${selected===s?'selected':''}>${s}</option>`).join('');
  }
  function onInvCategoryChange(){
    const cat = document.getElementById('invItemCategory').value;
    document.getElementById('invItemSubCategory').innerHTML = invSubCategoryOptions(cat, '');
  }
  async function saveInventoryItem(){
    const name = document.getElementById('invItemName').value.trim();
    const type = document.getElementById('invItemType').value;
    const category = document.getElementById('invItemCategory').value;
    const subCategory = document.getElementById('invItemSubCategory').value;
    const quantity = Number(document.getElementById('invItemQty').value) || 0;
    const threshold = Number(document.getElementById('invItemThreshold').value) || 0;
    const costPrice = Number(document.getElementById('invItemCost').value) || 0;
    const sellingPrice = Number(document.getElementById('invItemSelling').value) || 0;
    const unit = document.getElementById('invItemUnit').value;
    const size = document.getElementById('invItemSize').value.trim();
    const applicableClass = document.getElementById('invItemClass').value.trim();
    const taxRate = Number(document.getElementById('invItemTaxRate').value) || 0;
    const hsnCode = document.getElementById('invItemHsn').value.trim();
    const description = document.getElementById('invItemDescription').value.trim();
    if(!name){ showToast('Enter a product name.'); return; }
    if(costPrice <= 0 || sellingPrice <= 0){ showToast('Enter both a cost price and a selling price.'); return; }
    const payload = {
      editingId: editingInventoryItemId, name, type, category, subCategory, quantity, threshold, costPrice, sellingPrice,
      unit, size, applicableClass, taxRate, hsnCode, description,
    };
    const isAdmin = currentUser.role === 'Admin';
    if(!isAdmin){
      const explanation = document.getElementById('invItemExplanation').value.trim();
      if(!explanation){ showToast('Enter an explanation before submitting for approval.'); return; }
      if(!await showConfirmDialog('Submit this stock change to Admin for approval?')) return;
      pendingApprovals.push({
        id:'appr_'+Date.now(), type:'inventory_item', requestedBy:currentUser.name, requestedByRole:currentUser.role, requestedByUserId: currentUser.id,
        requestDate:new Date().toISOString().slice(0,10), explanation, payload, status:'Pending',
      });
      await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
      showToast('Submitted for Admin approval.', 'burst');
      backToInventoryItemsList();
      return;
    }
    await applyInventoryItemSave(payload);
    showToast('Product saved.', 'burst');
    backToInventoryItemsList();
  }
  async function applyInventoryItemSave(p){
    const fields = {
      name:p.name, type:p.type, category:p.category, subCategory:p.subCategory||'', quantity:p.quantity, threshold:p.threshold,
      costPrice:p.costPrice, sellingPrice:p.sellingPrice, unit:p.unit||'Piece', size:p.size||'',
      applicableClass:p.applicableClass||'', taxRate:p.taxRate||0, hsnCode:p.hsnCode||'', description:p.description||'',
    };
    if(p.editingId){
      const idx = inventoryItems.findIndex(x => x.id === p.editingId);
      if(idx > -1) inventoryItems[idx] = { ...inventoryItems[idx], ...fields };
    }else{
      inventoryItems.push({ id:'item_'+Date.now(), ...fields, active:true, createdBy:currentUser.name });
    }
    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    renderInventoryBody();
  }
  async function toggleInventoryItemActive(id){
    const it = inventoryItems.find(x => x.id === id);
    if(!it) return;
    it.active = it.active===false ? true : false;
    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    renderInventoryItemsList(document.getElementById('inventoryBody'));
  }
  async function deleteInventoryItem(id){
    if(currentUser.role !== 'Admin'){ showToast('Only Admin can delete a product.'); return; }
    if(!await showConfirmDialog('Delete this product? Past sales history will be kept.')) return;
    inventoryItems = inventoryItems.filter(x => x.id !== id);
    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    renderInventoryItemsList(document.getElementById('inventoryBody'));
  }

  /* --- Sell: cart-based 2-step flow --- */
  let invCart = [];
  let invCartCategory = 'All';
  // Second-level filter, within the chosen category — lets staff narrow
  // "Books" down to just "Govt Text Books" or "IIT Books" etc. instead of
  // scrolling through every book to find the right one. Uses each item's
  // own subCategory (see invSubCategoryOptions/INVENTORY_SUBCATEGORIES),
  // not a fixed list, so it always reflects what's actually stocked.
  let invCartSubCategory = 'All';
  let invCartSearch = '';
  let invCheckoutBuyerType = 'Student', invCheckoutStudentId = '', invCheckoutPaymentMode = 'Cash';
  let invCheckoutSearchMode = 'name', invCheckoutBrowseClass = '', invCheckoutBrowseSection = '';
  let invCheckoutDate = new Date().toISOString().slice(0,10);
  function openInventorySellCart(){
    invCart = [];
    invCartCategory = 'All'; invCartSubCategory = 'All'; invCartSearch = '';
    invCheckoutBuyerType = 'Student'; invCheckoutStudentId = ''; invCheckoutSearchMode = 'name';
    invCheckoutBrowseClass = ''; invCheckoutBrowseSection = '';
    invCheckoutDate = new Date().toISOString().slice(0,10);
    inventoryTab = 'sellcart';
    invQuickOpen = false;
    renderInventoryBody();
  }
  function setInvCartCategory(c){
    invCartCategory = c;
    invCartSubCategory = 'All'; // picking a new top-level category always clears the sub-filter
    renderInventorySellCart(document.getElementById('inventoryBody'));
  }
  function setInvCartSubCategory(sc){
    invCartSubCategory = sc;
    renderInventorySellCart(document.getElementById('inventoryBody'));
  }
  function quickSellItem(itemId){
    openInventorySellCart();
    addToInvCart(itemId);
  }
  function closeInventorySell(){
    invCart = [];
    inventoryTab = 'items';
    renderInventoryBody();
  }
  let invCartLastAddTime = {};
  function addToInvCart(itemId){
    const now = Date.now();
    if(invCartLastAddTime[itemId] && (now - invCartLastAddTime[itemId]) < 400) return; // guard: a single click/tap should never register twice
    invCartLastAddTime[itemId] = now;
    const it = inventoryItems.find(x => x.id === itemId);
    if(!it || it.quantity <= 0) return;
    const existing = invCart.find(c => c.itemId === itemId);
    if(existing){
      if(existing.qty >= it.quantity){ showToast('Not enough stock.'); return; }
      existing.qty++;
    }else{
      invCart.push({ itemId, name:it.name, price:it.sellingPrice, cost:it.costPrice, qty:1, discount:0, stock:it.quantity });
    }
    renderInventoryBody();
  }
  function removeFromInvCart(i){
    invCart.splice(i,1);
    renderInventoryBody();
  }
  function goToInvCheckout(){
    if(invCart.length === 0){ showToast('Add at least one item.'); return; }
    inventoryTab = 'sellcheckout';
    renderInventoryBody();
  }
  function backToInvCart(){
    inventoryTab = 'sellcart';
    renderInventoryBody();
  }
  function adjustInvCartQty(i, delta){
    const c = invCart[i];
    const newQty = c.qty + delta;
    if(newQty < 1) return;
    if(newQty > c.stock){ showToast('Not enough stock.'); return; }
    c.qty = newQty;
    renderInventoryBody();
  }
  function setInvCartDiscount(i, val){
    invCart[i].discount = Number(val) || 0;
    renderInventoryBody();
  }
  let invCheckoutSearchDebounce = null;
  function onInvCheckoutStudentInput(){
    clearTimeout(invCheckoutSearchDebounce);
    invCheckoutSearchDebounce = setTimeout(() => renderInvCheckoutSuggestions(document.getElementById('invCheckoutStudentSearch').value.trim()), 150);
  }
  function renderInvCheckoutSuggestions(q){
    const box = document.getElementById('invCheckoutStudentSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => isActive(s) && ((s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql) || (s.admissionNo||'').toLowerCase().includes(ql))).slice(0,8);
    box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="selectInvCheckoutStudent('${s.id}')">
      <div class="sg-avatar">${initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('') : `<div class="sg-empty">No students match "${q}"</div>`;
    box.classList.add('open');
  }
  function selectInvCheckoutStudent(id){
    invCheckoutStudentId = id;
    hideInvCheckoutSuggestions();
    renderInventoryCheckout(document.getElementById('inventoryBody'));
  }
  function hideInvCheckoutSuggestions(){
    const box = document.getElementById('invCheckoutStudentSuggestions');
    if(box) box.classList.remove('open');
  }
  async function completeInventorySale(){
    // A stock-purchase sale to a student becomes its own `payments` row
    // (category:'extra') — must not push onto an unloaded array.
    await ensureDataLoaded('payments', loadPaymentsData);
    if(invCheckoutBuyerType==='Student' && !invCheckoutStudentId){ showToast('Select a student.'); return; }
    for(const c of invCart){
      const it = inventoryItems.find(x => x.id === c.itemId);
      if(!it || it.quantity < c.qty){ showToast(`Not enough stock for ${c.name}.`); return; }
    }
    const paidAmountInput = Number(document.getElementById('invCheckoutPaidAmount').value) || 0;
    const notes = document.getElementById('invCheckoutNotes').value.trim();
    const buyerName = invCheckoutBuyerType!=='Student' ? (document.getElementById('invCheckoutBuyerName').value.trim() || invCheckoutBuyerType) : '';
    const todayStr = new Date().toISOString().slice(0,10);
    const dateInput = document.getElementById('invCheckoutDate');
    const today = dateInput ? dateInput.value : todayStr;
    if(!today){ showToast('Set a sale date.'); return; }
    if(today > todayStr){ showToast("Sale date can't be in the future."); return; }
    const grandTotal = invCart.reduce((sum,c) => sum+c.price*c.qty-c.discount, 0);
    const buyerStudent = invCheckoutBuyerType==='Student' ? students.find(s => s.id===invCheckoutStudentId) : null;
    let remainingPaid = paidAmountInput;
    invCart.forEach(c => {
      const it = inventoryItems.find(x => x.id === c.itemId);
      const lineTotal = c.price*c.qty - c.discount;
      const lineCost = c.cost*c.qty;
      it.quantity -= c.qty;
      const linePaid = Math.max(0, Math.min(remainingPaid, lineTotal));
      remainingPaid -= linePaid;
      let sefId = '';
      if(invCheckoutBuyerType==='Student' && buyerStudent){
        sefId = 'sef_'+Date.now()+'_'+c.itemId;
        studentExtraFees.push({ id:sefId, studentId:invCheckoutStudentId, name:`${c.name} x${c.qty}`, amount:lineTotal, paidAmount:linePaid, paid: linePaid>=lineTotal, date:today });
        if(linePaid > 0){
          payments.push({ id:'pay_'+Date.now()+'_'+c.itemId, receiptNo:nextReceiptNo(), studentId:invCheckoutStudentId, studentName:buyerStudent.firstName+' '+buyerStudent.lastName, category:'extra', extraFeeName:c.name, extraFeeId:sefId, mode:invCheckoutPaymentMode, amount:linePaid, discount:c.discount, instalment:'', date:today, note:notes, classAtPayment:buyerStudent.className });
        }
      }
      inventorySales.push({ id:'isale_'+Date.now()+'_'+c.itemId, itemId:c.itemId, itemName:c.name, buyerType:invCheckoutBuyerType, studentId:invCheckoutBuyerType==='Student'?invCheckoutStudentId:'', buyerName, qty:c.qty, unitPrice:c.price, unitCost:c.cost, discount:c.discount, totalAmount:lineTotal, totalCost:lineCost, paidAmount:linePaid, mode:invCheckoutPaymentMode, notes, date:today, soldBy:currentUser.name, sefId });
    });
    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    await storageSet(INVENTORY_SALES_KEY, inventorySales);
    if(invCheckoutBuyerType==='Student'){
      await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
      await storageSet(PAYMENTS_KEY, payments);
    }
    renderDashboard();
    invCart = [];
    invCheckoutStudentId = '';
    inventoryTab = 'items';
    renderInventoryBody();
    showToast(`Sale completed — ${fmtMoney(grandTotal)}.`);
  }

  /* --- Approvals (stock changes submitted by non-Admin roles) --- */
  function renderInventoryApprovalsTab(body){
    const isAdmin = currentUser.role === 'Admin';
    const list = pendingApprovals.filter(a => a.type==='inventory_item').slice().sort((a,b) => b.id.localeCompare(a.id));
    body.innerHTML = `
      <div style="margin-bottom:16px;"><button class="btn btn-ghost btn-sm" onclick="switchInventoryTab('items')">← Back to Items</button></div>
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px;">Stock changes submitted by non-Admin roles wait here until Admin reviews them.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Product</th><th>Requested By</th><th>Date</th><th>Explanation</th><th>Change</th><th>Status</th>${isAdmin?'<th></th>':''}</tr></thead>
        <tbody>
        ${list.length ? list.map(a => `<tr>
          <td class="name-cell">${a.payload.name}</td>
          <td>${a.requestedBy} <span class="pill" style="font-size:0.62rem;">${a.requestedByRole}</span></td>
          <td>${a.requestDate}</td>
          <td style="max-width:200px;">${a.explanation}</td>
          <td>${a.payload.editingId?'Edit':'New'} — Qty: ${a.payload.quantity}, ${fmtMoney(a.payload.sellingPrice)}</td>
          <td>${a.status==='Pending'?'<span class="balance-tag due">Pending</span>':a.status==='Approved'?'<span class="pill">Approved</span>':'<span class="balance-tag due">Rejected</span>'}</td>
          ${isAdmin ? `<td>${a.status==='Pending'?`<button class="btn-edit-text" onclick="approveInventoryRequest('${a.id}')">Approve</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="rejectInventoryRequest('${a.id}')">Reject</button>`:''}</td>` : ''}
        </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No requests yet</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  async function approveInventoryRequest(id){
    const a = pendingApprovals.find(x => x.id === id);
    if(!a) return;
    if(!await showConfirmDialog('Approve this stock change? It will be applied immediately.')) return;
    await applyInventoryItemSave(a.payload);
    a.status = 'Approved';
    await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
    renderInventoryBody();
    showToast('Approved and applied.', 'burst');
    notifyRequesterOfDecision(a.requestedByUserId, 'Inventory change approved', `${currentUser.name} approved your inventory change request (${a.payload && a.payload.name || 'item'}) and it's been applied.`, 'approval-decision');
  }
  async function rejectInventoryRequest(id){
    const a = pendingApprovals.find(x => x.id === id);
    if(!a) return;
    if(!await showConfirmDialog('Reject this request? It will not be applied.')) return;
    a.status = 'Rejected';
    await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
    renderInventoryBody();
    showToast('Request rejected.', 'burst');
    notifyRequesterOfDecision(a.requestedByUserId, 'Inventory change rejected', `${currentUser.name} rejected your inventory change request (${a.payload && a.payload.name || 'item'}).`, 'approval-decision');
  }

  /* --- Sales History --- */
  // Every dashboard figure below nets returns against sales rather than the
  // raw sale totals — a return is never allowed to touch the original sale
  // record (that stays a permanent, untouched fact of what was sold and
  // when), so returns are always subtracted back out at display time instead.
  function inventoryNetTotals(){
    const totalRevenue = inventorySales.reduce((sum,s) => sum+s.totalAmount, 0) - inventoryReturns.reduce((sum,r) => sum+r.refundAmount, 0);
    const totalCost = inventorySales.reduce((sum,s) => sum+s.totalCost, 0) - inventoryReturns.reduce((sum,r) => sum+r.costReversed, 0);
    const totalCollected = inventorySales.reduce((sum,s) => sum+(s.paidAmount||0), 0) - inventoryReturns.reduce((sum,r) => sum+(r.cashRefunded||0), 0);
    return { totalRevenue, totalCost, totalProfit: totalRevenue-totalCost, totalCollected, totalDue: Math.max(0, totalRevenue-totalCollected) };
  }
  function renderInventorySalesHistoryTab(body){
    const canReturn = getInventoryTabAccess(currentUser.role, 'inventory_saleshistory', 'edit');
    const { totalRevenue, totalCost, totalProfit } = inventoryNetTotals();
    const totalRefunded = inventoryReturns.reduce((sum,r) => sum+r.refundAmount, 0);
    const byItem = {};
    inventorySales.forEach(s => {
      if(!byItem[s.itemId]) byItem[s.itemId] = { name:s.itemName, qty:0, revenue:0, cost:0 };
      byItem[s.itemId].qty += s.qty;
      byItem[s.itemId].revenue += s.totalAmount;
      byItem[s.itemId].cost += s.totalCost;
    });
    inventoryReturns.forEach(r => {
      if(!byItem[r.itemId]) byItem[r.itemId] = { name:r.itemName, qty:0, revenue:0, cost:0 };
      byItem[r.itemId].qty -= r.qty;
      byItem[r.itemId].revenue -= r.refundAmount;
      byItem[r.itemId].cost -= r.costReversed;
    });
    const recent = inventorySales.slice().sort((a,b) => b.id.localeCompare(a.id)).slice(0,30);
    const recentReturns = inventoryReturns.slice().sort((a,b) => b.id.localeCompare(a.id)).slice(0,30);
    body.innerHTML = `
      <div style="margin-bottom:16px;"><button class="btn btn-ghost btn-sm" onclick="switchInventoryTab('items')">← Back to Items</button></div>
      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b>${fmtMoney(totalRevenue)}</b><span>Net Revenue</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(totalCost)}</b><span>Net Cost</span></div>
        <div class="fee-sum-card"><b style="color:${totalProfit>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(totalProfit)}</b><span>Net Profit</span></div>
        <div class="fee-sum-card"><b style="color:var(--magenta);">${fmtMoney(totalRefunded)}</b><span>Returned (Revenue Reversed)</span></div>
      </div>
      <div class="dash-section-title"><div><h3>Profit by Item (net of returns)</h3></div></div>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Item</th><th>Net Units Sold</th><th>Net Revenue</th><th>Net Cost</th><th>Net Profit</th></tr></thead>
        <tbody>
        ${Object.keys(byItem).length ? Object.values(byItem).map(it => `<tr><td class="name-cell">${it.name}</td><td>${it.qty}</td><td>${fmtMoney(it.revenue)}</td><td>${fmtMoney(it.cost)}</td><td style="color:${(it.revenue-it.cost)>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(it.revenue-it.cost)}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><b>No sales yet</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>Recent Sales</h3></div></div>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Date</th><th>Item</th><th>Buyer</th><th>Qty</th><th>Amount</th><th>Paid</th><th>Mode</th><th>Sold By</th><th></th></tr></thead>
        <tbody>
        ${recent.length ? recent.map(s => {
          const st = s.studentId ? students.find(x=>x.id===s.studentId) : null;
          const buyer = st ? st.firstName+' '+st.lastName : (s.buyerName||s.buyerType);
          const alreadyReturned = returnedQtyForSale(s.id);
          const returnable = s.qty - alreadyReturned;
          return `<tr><td>${s.date}</td><td>${s.itemName}${alreadyReturned>0?` <span class="pill" style="font-size:0.62rem; background:rgba(203,154,46,0.18); color:#8a6a1f;">${alreadyReturned} returned</span>`:''}</td><td>${buyer}</td><td>${s.qty}</td><td>${fmtMoney(s.totalAmount)}</td><td>${fmtMoney(s.paidAmount||0)}</td><td>${s.mode||'—'}</td><td>${s.soldBy||'—'}</td><td>${canReturn && returnable>0 ? `<button class="btn-edit-text" onclick="openInventoryReturnModal('${s.id}')">Return</button>` : (returnable<=0 ? '<span style="color:var(--ink-soft); font-size:0.76rem;">Fully returned</span>' : '')}</td></tr>`;
        }).join('') : `<tr><td colspan="9"><div class="empty-state"><b>No sales yet</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>Returns Log</h3></div></div>
      <div class="table-wrap">
        <table><thead><tr><th>Date</th><th>Item</th><th>Buyer</th><th>Qty</th><th>Revenue Reversed</th><th>Cash Refunded</th><th>Mode</th><th>Reason</th><th>Processed By</th></tr></thead>
        <tbody>
        ${recentReturns.length ? recentReturns.map(r => { const st = r.studentId ? students.find(x=>x.id===r.studentId) : null; const buyer = st ? st.firstName+' '+st.lastName : (r.buyerName||r.buyerType||'—'); return `<tr><td>${r.date}</td><td>${r.itemName}</td><td>${buyer}</td><td>${r.qty}</td><td>${fmtMoney(r.refundAmount)}</td><td>${fmtMoney(r.cashRefunded||0)}</td><td>${r.refundMode||'—'}</td><td>${r.reason||'—'}</td><td>${r.processedBy||'—'}</td></tr>`; }).join('') : `<tr><td colspan="9"><div class="empty-state"><b>No returns recorded</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div id="invReturnModalWrap"></div>
    `;
  }
  /* --- Process a student/buyer return of a completed sale --- */
  function openInventoryReturnModal(saleId){
    const s = inventorySales.find(x => x.id === saleId);
    if(!s) return;
    const alreadyReturned = returnedQtyForSale(saleId);
    const returnable = s.qty - alreadyReturned;
    if(returnable <= 0){ showToast('Nothing left to return on this sale.'); return; }
    const st = s.studentId ? students.find(x=>x.id===s.studentId) : null;
    const buyer = st ? st.firstName+' '+st.lastName : (s.buyerName||s.buyerType);
    const perUnitPrice = s.totalAmount / s.qty;
    const perUnitPaid = (s.paidAmount||0) / s.qty;
    const wrap = document.getElementById('invReturnModalWrap');
    wrap.innerHTML = `
      <div style="position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:999; padding:20px;">
        <div class="profile-card" style="width:100%; max-width:380px;">
          <h4>Return — ${s.itemName}</h4>
          <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 14px;">Sold to ${buyer} on ${s.date} · ${s.qty} unit${s.qty===1?'':'s'}${alreadyReturned>0?` (${alreadyReturned} already returned)`:''}.</p>
          <input type="hidden" id="invRetSaleId" value="${saleId}">
          <div class="f-field" style="margin-bottom:10px;">
            <label>Return Date</label>
            <input type="date" id="invRetDate" value="${new Date().toISOString().slice(0,10)}" max="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="f-field" style="margin-bottom:10px;">
            <label>Quantity to Return (max ${returnable})</label>
            <input type="number" id="invRetQty" min="1" max="${returnable}" value="${returnable}" oninput="onInvReturnQtyChange()">
          </div>
          <div class="f-field" style="margin-bottom:10px;">
            <label>Reason</label>
            <input type="text" id="invRetReason" placeholder="e.g. wrong size, changed subject">
          </div>
          <div id="invRetRefundFields"></div>
          <div style="display:flex; gap:8px; margin-top:14px;">
            <button class="btn btn-primary btn-sm" onclick="submitInventoryReturn()">Confirm Return</button>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('invReturnModalWrap').innerHTML=''">Cancel</button>
          </div>
        </div>
      </div>
    `;
    onInvReturnQtyChange();
  }
  function onInvReturnQtyChange(){
    const saleId = document.getElementById('invRetSaleId').value;
    const s = inventorySales.find(x => x.id === saleId);
    if(!s) return;
    const returnable = s.qty - returnedQtyForSale(saleId);
    let qty = Number(document.getElementById('invRetQty').value) || 0;
    qty = Math.max(1, Math.min(qty, returnable));
    document.getElementById('invRetQty').value = qty;
    const perUnitPaid = (s.paidAmount||0) / s.qty;
    const paidForReturn = Math.round(perUnitPaid * qty * 100) / 100;
    const refundBox = document.getElementById('invRetRefundFields');
    if(paidForReturn > 0){
      refundBox.innerHTML = `
        <div class="f-field" style="margin-bottom:10px;">
          <label>Amount To Refund Now (already paid: ${fmtMoney(paidForReturn)})</label>
          <input type="number" id="invRetCashRefund" min="0" max="${paidForReturn}" step="0.01" value="${paidForReturn}">
        </div>
        <div class="f-field">
          <label>Refund Mode</label>
          <select id="invRetMode"><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Adjusted as Credit (not paid out now)</option></select>
        </div>
      `;
    } else {
      refundBox.innerHTML = `<p style="font-size:0.78rem; color:var(--ink-soft);">Nothing was collected for this quantity yet, so nothing needs to be refunded — the amount due will simply be reduced.</p>`;
    }
  }
  async function submitInventoryReturn(){
    // A cash refund on a return can push a new `payments` row too.
    await ensureDataLoaded('payments', loadPaymentsData);
    const saleId = document.getElementById('invRetSaleId').value;
    const s = inventorySales.find(x => x.id === saleId);
    if(!s) return;
    const returnable = s.qty - returnedQtyForSale(saleId);
    const qty = Math.max(1, Math.min(Number(document.getElementById('invRetQty').value) || 0, returnable));
    if(qty <= 0){ showToast('Enter a valid quantity.'); return; }
    const reason = document.getElementById('invRetReason').value.trim();
    const perUnitAmount = s.totalAmount / s.qty;
    const perUnitCost = s.totalCost / s.qty;
    const perUnitPaid = (s.paidAmount||0) / s.qty;
    const refundAmount = Math.round(perUnitAmount * qty * 100) / 100;
    const costReversed = Math.round(perUnitCost * qty * 100) / 100;
    const paidForReturn = Math.round(perUnitPaid * qty * 100) / 100;
    const cashInput = document.getElementById('invRetCashRefund');
    const cashRefunded = cashInput ? Math.max(0, Math.min(Number(cashInput.value)||0, paidForReturn)) : 0;
    const refundMode = document.getElementById('invRetMode') ? document.getElementById('invRetMode').value : '';
    const todayStr = new Date().toISOString().slice(0,10);
    const retDateInput = document.getElementById('invRetDate');
    const today = retDateInput ? retDateInput.value : todayStr;
    if(!today){ showToast('Set a return date.'); return; }
    if(today > todayStr){ showToast("Return date can't be in the future."); return; }

    // 1. Restock — the returned units are assumed resellable.
    const item = inventoryItems.find(x => x.id === s.itemId);
    if(item) item.quantity += qty;

    // 2. If this sale was billed to a student, shrink what they owe (and, if
    // they'd paid more than the new reduced amount, cap what's on record as
    // paid so the fee ledger never shows a due for something they returned).
    if(s.buyerType === 'Student' && s.sefId){
      const sef = studentExtraFees.find(x => x.id === s.sefId);
      if(sef){
        sef.amount = Math.max(0, Math.round((sef.amount - refundAmount) * 100) / 100);
        sef.paidAmount = Math.max(0, Math.round((sef.paidAmount - cashRefunded) * 100) / 100);
        sef.paid = sef.paidAmount >= sef.amount && sef.amount > 0 ? true : (sef.amount === 0);
      }
      if(cashRefunded > 0){
        const st = students.find(x => x.id === s.studentId);
        payments.push({
          id:'pay_refund_'+Date.now()+'_'+s.itemId, receiptNo:nextReceiptNo(), studentId:s.studentId,
          studentName: st ? st.firstName+' '+st.lastName : '', category:'extra', extraFeeName:s.itemName,
          extraFeeId:s.sefId, mode:refundMode||'Cash', amount:-cashRefunded, discount:0, instalment:'',
          date:today, note:`Refund — return of ${qty} × ${s.itemName}${reason?' ('+reason+')':''}`,
          classAtPayment: st ? st.className : '',
        });
      }
    }

    inventoryReturns.push({
      id:'iret_'+Date.now()+'_'+s.itemId, saleId:s.id, itemId:s.itemId, itemName:s.itemName, qty,
      refundAmount, costReversed, cashRefunded, refundMode, studentId:s.studentId||'', buyerType:s.buyerType,
      buyerName:s.buyerName||'', reason, date:today, processedBy:currentUser.name,
    });

    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    await storageSet(INVENTORY_RETURNS_KEY, inventoryReturns);
    if(s.buyerType === 'Student'){
      await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
      if(cashRefunded > 0) await storageSet(PAYMENTS_KEY, payments);
    }
    document.getElementById('invReturnModalWrap').innerHTML = '';
    renderDashboard();
    renderInventoryBody();
    showToast(`Return recorded — ${qty} unit${qty===1?'':'s'} back in stock.`);
  }

  /* --- Stock Overview --- */
  function renderInventoryStockOverviewTab(body){
    const total = inventoryItems.length;
    const outOfStock = inventoryItems.filter(it => it.quantity <= 0);
    const lowStock = inventoryItems.filter(it => it.quantity > 0 && it.quantity <= it.threshold);
    const totalStockValue = inventoryItems.reduce((sum,it) => sum+it.quantity*it.costPrice, 0);
    const totalVendorReturnValue = inventoryVendorReturns.reduce((sum,r) => sum+r.costReversed, 0);

    const { totalRevenue, totalCost, totalProfit, totalCollected, totalDue } = inventoryNetTotals();
    const totalRefunded = inventoryReturns.reduce((sum,r) => sum+r.refundAmount, 0);
    const collectionPct = totalRevenue > 0 ? Math.round((totalCollected/totalRevenue)*100) : 0;
    const totalUnitsSold = inventorySales.reduce((sum,s) => sum+s.qty, 0) - inventoryReturns.reduce((sum,r) => sum+r.qty, 0);
    const totalTransactions = inventorySales.length;
    const avgSaleValue = totalTransactions > 0 ? totalRevenue/totalTransactions : 0;

    const byItem = {};
    inventorySales.forEach(s => {
      if(!byItem[s.itemId]) byItem[s.itemId] = { name:s.itemName, qty:0, revenue:0, cost:0 };
      byItem[s.itemId].qty += s.qty;
      byItem[s.itemId].revenue += s.totalAmount;
      byItem[s.itemId].cost += s.totalCost;
    });
    inventoryReturns.forEach(r => {
      if(!byItem[r.itemId]) byItem[r.itemId] = { name:r.itemName, qty:0, revenue:0, cost:0 };
      byItem[r.itemId].qty -= r.qty;
      byItem[r.itemId].revenue -= r.refundAmount;
      byItem[r.itemId].cost -= r.costReversed;
    });
    const topItems = Object.values(byItem).sort((a,b) => b.revenue-a.revenue).slice(0,5);

    const byMode = {};
    inventorySales.forEach(s => {
      const m = s.mode || 'Not specified';
      byMode[m] = (byMode[m]||0) + (s.paidAmount||0);
    });
    inventoryReturns.forEach(r => {
      const m = r.refundMode || 'Not specified';
      byMode[m] = (byMode[m]||0) - (r.cashRefunded||0);
    });
    const modeEntries = Object.entries(byMode).sort((a,b) => b[1]-a[1]);

    body.innerHTML = `
      <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <button class="btn btn-ghost btn-sm" onclick="switchInventoryTab('items')">← Back to Items</button>
        ${getInventoryTabAccess(currentUser.role,'inventory_saleshistory') ? `<button class="btn btn-ghost btn-sm" onclick="switchInventoryTab('saleshistory')">View Full Sales History →</button>` : ''}
      </div>

      <div class="dash-section-title"><div><span class="eyebrow-sm">Sales Performance</span><h3>Revenue, Collections &amp; Profit (net of returns)</h3></div></div>
      <div class="fee-summary-row" style="margin-bottom:20px;">
        <div class="fee-sum-card"><b>${fmtMoney(totalRevenue)}</b><span>Sale Done (Net Revenue)</span></div>
        <div class="fee-sum-card"><b style="color:#0f6a63;">${fmtMoney(totalCollected)}</b><span>Amount Collected</span></div>
        <div class="fee-sum-card"><b style="color:var(--magenta);">${fmtMoney(totalDue)}</b><span>Amount To Be Collected</span></div>
        <div class="fee-sum-card"><b style="color:${totalProfit>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(totalProfit)}</b><span>Total Profit</span></div>
        <div class="fee-sum-card"><b style="color:#8a6a1f;">${fmtMoney(totalRefunded)}</b><span>Returned to Buyers</span></div>
      </div>

      <div class="overview-panel" style="margin-bottom:24px;">
        <div class="overview-ring">
          ${ringSVG(collectionPct, 'var(--teal)', 132, 13)}
          <div class="overview-ring-label"><b>${collectionPct}%</b><span>Collected</span></div>
        </div>
        <div class="overview-legend">
          <div class="ov-row"><span class="ov-swatch" style="background:var(--teal);"></span>Collected<b>${fmtMoney(totalCollected)}</b></div>
          <div class="ov-row"><span class="ov-swatch" style="background:var(--magenta);"></span>To Be Collected<b>${fmtMoney(totalDue)}</b></div>
          <div class="ov-row total"><span class="ov-swatch" style="background:var(--gold);"></span>Total Sale<b>${fmtMoney(totalRevenue)}</b></div>
        </div>
      </div>

      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b>${totalTransactions}</b><span>Sales Done (Transactions)</span></div>
        <div class="fee-sum-card"><b>${totalUnitsSold}</b><span>Units Sold</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(avgSaleValue)}</b><span>Average Sale Value</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(totalCost)}</b><span>Cost of Goods Sold</span></div>
      </div>

      <div class="dash-section-title"><div><span class="eyebrow-sm">Stock Levels</span><h3>Inventory On Hand</h3></div></div>
      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b>${total}</b><span>Total Products</span></div>
        <div class="fee-sum-card"><b style="color:var(--magenta);">${outOfStock.length}</b><span>Out of Stock</span></div>
        <div class="fee-sum-card"><b style="color:#8a6a1f;">${lowStock.length}</b><span>Low Stock</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(totalStockValue)}</b><span>Stock Value (at cost)</span></div>
        <div class="fee-sum-card"><b style="color:#8a6a1f;">${fmtMoney(totalVendorReturnValue)}</b><span>Returned to Vendor (Stock Write-down)</span></div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px,1fr)); gap:16px; margin-bottom:24px;">
        <div class="profile-card">
          <h4>Top Selling Items</h4>
          <div class="table-wrap" style="margin-top:10px;">
            <table><thead><tr><th>Item</th><th>Units Sold</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>${topItems.length ? topItems.map(it => `<tr><td class="name-cell">${it.name}</td><td>${it.qty}</td><td>${fmtMoney(it.revenue)}</td><td style="color:${(it.revenue-it.cost)>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(it.revenue-it.cost)}</td></tr>`).join('') : '<tr><td colspan="4" style="color:var(--ink-soft);">No sales yet</td></tr>'}</tbody></table>
          </div>
        </div>
        <div class="profile-card">
          <h4>Collections by Payment Mode</h4>
          <div class="table-wrap" style="margin-top:10px;">
            <table><thead><tr><th>Mode</th><th>Amount Collected</th></tr></thead>
            <tbody>${modeEntries.length ? modeEntries.map(([mode,amt]) => `<tr><td>${mode}</td><td>${fmtMoney(amt)}</td></tr>`).join('') : '<tr><td colspan="2" style="color:var(--ink-soft);">No collections yet</td></tr>'}</tbody></table>
          </div>
        </div>
      </div>

      <div class="dash-section-title"><div><h3>Vendor Returns Log</h3></div></div>
      <div class="table-wrap" style="margin-bottom:24px;">
        <table><thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Stock Value Reversed</th><th>Vendor</th><th>Reason</th><th>Processed By</th></tr></thead>
        <tbody>
        ${inventoryVendorReturns.length ? inventoryVendorReturns.slice().sort((a,b) => b.id.localeCompare(a.id)).slice(0,30).map(r => `<tr><td>${r.date}</td><td class="name-cell">${r.itemName}</td><td>${r.qty}</td><td>${fmtMoney(r.costReversed)}</td><td>${r.vendor||'—'}</td><td>${r.reason||'—'}</td><td>${r.processedBy||'—'}</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No vendor returns recorded</b></div></td></tr>`}
        </tbody></table>
      </div>

      <div class="dash-section-title"><div><h3>Needs Attention</h3></div></div>
      <div class="table-wrap">
        <table><thead><tr><th>Item</th><th>Quantity</th><th>Threshold</th><th>Status</th></tr></thead>
        <tbody>
        ${[...outOfStock,...lowStock].length ? [...outOfStock,...lowStock].map(it => `<tr><td class="name-cell">${it.name}</td><td>${it.quantity}</td><td>${it.threshold}</td><td>${it.quantity<=0?`<span class="balance-tag due">Out of Stock</span>`:`<span class="pill" style="background:rgba(203,154,46,0.18); color:#8a6a1f;">Low Stock</span>`}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>All stocked up</b>No items are low or out of stock.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  /* --- Admin Tools (strictly Admin-only) --- */
  const DOWNLOADS_KEY = "admin-downloads";
  OBJECT_BACKED_KEYS[DOWNLOADS_KEY] = '/api/kv/' + DOWNLOADS_KEY;
  let adminDownloads = [];
  async function loadAdminDownloads(){
    adminDownloads = await storageGet(DOWNLOADS_KEY, []);
  }
  function renderAdminToolsTab(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:20px; max-width:640px;">Tools visible to the Admin role only — not Principal, not any other role, regardless of what's granted in Roles &amp; Permissions.</p>

      <div class="profile-card" style="max-width:420px; margin-bottom:24px;">
        <h4>🔑 Change Password</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Update your own Admin login password.</p>
        <div class="f-field" style="margin-bottom:10px;"><label>Current Password</label><input type="password" id="cpCurrent"></div>
        <div class="f-field" style="margin-bottom:10px;"><label>New Password</label><input type="password" id="cpNew"></div>
        <div class="f-field" style="margin-bottom:14px;"><label>Confirm New Password</label><input type="password" id="cpConfirm"></div>
        <button class="btn btn-primary btn-sm" onclick="changeOwnPassword()">Update Password</button>
      </div>

      <div class="profile-card" style="max-width:480px; margin-bottom:24px;">
        <h4>💾 Full Data Backup</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Download every record in the database — students, staff, payments, attendance, everything — as one JSON file. Keep it somewhere safe; it's a full copy of the school's data.</p>
        <button class="btn btn-primary btn-sm" id="backupDownloadBtn" onclick="downloadFullBackup()">Download Backup</button><span class="mo-blob-mini" id="backupBlob"><span class="mo-blob-shape"></span></span>
      </div>

      <div class="profile-card" style="max-width:560px; margin-bottom:24px; border-top:4px solid #C0264B;">
        <h4>🗑️ Reset Inventory / Accounting Data</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">For clearing out demo/test records before switching to real day-to-day data entry. This permanently deletes the selected records from the database for everyone — there is no undo. <b>Download a backup above first</b> if there's any chance you'll want this data later.</p>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px; font-size:0.82rem;">
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="ridInvItems" checked> Inventory stock items <span style="color:var(--ink-soft);">(${inventoryItems.length})</span></label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="ridInvSales" checked> Inventory sales history <span style="color:var(--ink-soft);">(${inventorySales.length})</span></label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="ridInvReturns" checked> Inventory returns &amp; vendor returns <span style="color:var(--ink-soft);">(${inventoryReturns.length + inventoryVendorReturns.length})</span></label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="ridAcct" checked> Accounting income &amp; expense entries <span style="color:var(--ink-soft);">(${acctExpenses.length + acctIncome.length})</span></label>
        </div>
        <p style="font-size:0.72rem; color:var(--ink-soft); margin:0 0 10px;">Income/Expense categories and cost centers (the pick-lists) are kept, so you can start entering real transactions right away.</p>
        <div class="f-field" style="margin-bottom:12px; max-width:260px;">
          <label>Type RESET to confirm</label>
          <input type="text" id="ridConfirmText" placeholder="RESET" oninput="document.getElementById('ridResetBtn').disabled = this.value.trim().toUpperCase() !== 'RESET';">
        </div>
        <button class="btn btn-danger btn-sm" id="ridResetBtn" disabled onclick="resetInventoryAccountingData()">Reset Selected Data</button>
      </div>

      <div class="profile-card" style="max-width:640px;">
        <h4>📥 Downloads</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Upload circulars, forms, or resources for staff to download from their own accounts.</p>
        <div class="form-grid" style="margin-bottom:12px;">
          <div class="f-field full"><label>Title</label><input type="text" id="dlTitle" placeholder="e.g. Holiday Circular — August"></div>
          <div class="f-field full">
            <label>File</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Choose File<input type="file" id="dlFileInput" style="display:none;" onchange="previewDownloadFile(event)"></label>
              <span id="dlFileName" style="font-size:0.8rem; color:var(--ink-soft);">No file chosen</span>
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-bottom:18px;" onclick="addAdminDownload()">+ Add Download</button>
        <div class="table-wrap">
          <table><thead><tr><th>Title</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
          ${adminDownloads.length ? adminDownloads.map((d,i) => `<tr><td class="name-cell">${d.title}</td><td>${d.date}</td><td><a href="${d.data}" download="${d.filename||d.title}" class="btn-edit-text">Download</a>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteAdminDownload(${i})">Delete</button></td></tr>`).join('') : `<tr><td colspan="3"><div class="empty-state"><b>No downloads uploaded yet</b></div></td></tr>`}
          </tbody></table>
        </div>
      </div>

      <div class="profile-card" style="max-width:900px; margin-top:24px;">
        <h4>🕵️ Audit Log</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">The most recent 500 changes made anywhere in the ERP — who, what, and when. Actor identity is self-reported by the app on each save, not a cryptographic guarantee.</p>
        <button class="btn btn-ghost btn-sm" style="margin-bottom:12px;" onclick="loadAuditLogTab()">Refresh</button>
        <div class="table-wrap" style="max-height:420px; overflow-y:auto;">
          <table><thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Resource</th><th>Record</th></tr></thead>
          <tbody id="auditLogTableBody">${moLoadingRow(6)}</tbody></table>
        </div>
      </div>
    `;
    moMountLotties();
    loadAuditLogTab();
  }
  async function loadAuditLogTab(){
    const tbody = document.getElementById('auditLogTableBody');
    if(!tbody) return;
    tbody.innerHTML = moLoadingRow(6);
    moMountLotties();
    try{
      const res = await fetch('/api/audit-log');
      await throwIfNotOk(res);
      const rows = await res.json();
      if(!rows.length){ tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><b>No changes logged yet</b></div></td></tr>`; return; }
      tbody.innerHTML = rows.map(r => `<tr>
        <td>${escapeHtml(new Date(r.created_at).toLocaleString())}</td>
        <td>${escapeHtml(r.actor_name) || '—'}</td>
        <td>${escapeHtml(r.actor_role) || '—'}</td>
        <td>${escapeHtml(r.method)}</td>
        <td>${escapeHtml(r.resource)}</td>
        <td>${escapeHtml(r.record_id) || '—'}</td>
      </tr>`).join('');
    }catch(e){
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><b>Could not load the audit log</b>${escapeHtml(e.message)}</div></td></tr>`;
    }
  }
  async function downloadFullBackup(){
    const btn = document.getElementById('backupDownloadBtn');
    const blob2 = document.getElementById('backupBlob');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing backup…';
    if(blob2) blob2.classList.add('run');
    try{
      const res = await fetch('/api/backup');
      await throwIfNotOk(res);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugifySchoolName()}-erp-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Backup downloaded.', 'burst');
    }catch(e){
      showToast('Could not generate the backup (' + e.message + ').');
    }finally{
      btn.disabled = false;
      btn.textContent = originalLabel;
      if(blob2) blob2.classList.remove('run');
    }
  }
  // Clears demo/test records from Inventory and Accounting so a school can switch
  // over to real day-to-day data entry without stale sample rows mixed in. Reuses
  // the exact same storageSet() calls every other module already uses to save an
  // emptied array/list — for the accounting keys (real DB rows, API_BACKED_KEYS)
  // that diffs old vs. new and deletes every row no longer present; for the
  // inventory keys (OBJECT_BACKED_KEYS) it's a straight overwrite with []. No
  // bespoke delete-all endpoint was needed. Categories/cost-centers are left
  // alone on purpose — they're pick-lists, not transactional data.
  async function resetInventoryAccountingData(){
    await ensureDataLoaded('acctTransactions', loadAcctTransactionsData);
    const opts = {
      items: document.getElementById('ridInvItems').checked,
      sales: document.getElementById('ridInvSales').checked,
      returns: document.getElementById('ridInvReturns').checked,
      accounting: document.getElementById('ridAcct').checked,
    };
    if(!opts.items && !opts.sales && !opts.returns && !opts.accounting){ showToast('Select at least one category to reset.'); return; }
    const confirmText = (document.getElementById('ridConfirmText').value || '').trim().toUpperCase();
    if(confirmText !== 'RESET'){ showToast('Type RESET in the box to confirm.'); return; }

    const parts = [];
    if(opts.items) parts.push(`${inventoryItems.length} stock item(s)`);
    if(opts.sales) parts.push(`${inventorySales.length} sale(s)`);
    if(opts.returns) parts.push(`${inventoryReturns.length} return(s) and ${inventoryVendorReturns.length} vendor return(s)`);
    if(opts.accounting) parts.push(`${acctExpenses.length} expense entrie(s) and ${acctIncome.length} income entrie(s)`);
    const ok = await showConfirmDialog(
      `This will permanently delete: ${parts.join('; ')}. This cannot be undone — make sure you've downloaded a backup if you might need this data later. Continue?`,
      { title:'⚠ Permanent Data Reset', okText:'Yes, delete permanently', cancelText:'Cancel' }
    );
    if(!ok) return;

    const btn = document.getElementById('ridResetBtn');
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Resetting…';
    try{
      if(opts.items){ inventoryItems = []; await storageSet(INVENTORY_ITEMS_KEY, inventoryItems); }
      if(opts.sales){ inventorySales = []; await storageSet(INVENTORY_SALES_KEY, inventorySales); }
      if(opts.returns){
        inventoryReturns = []; await storageSet(INVENTORY_RETURNS_KEY, inventoryReturns);
        inventoryVendorReturns = []; await storageSet(INVENTORY_VENDOR_RETURNS_KEY, inventoryVendorReturns);
      }
      if(opts.accounting){
        acctExpenses = []; await storageSet(ACCT_EXPENSES_KEY, acctExpenses);
        acctIncome = []; await storageSet(ACCT_INCOME_KEY, acctIncome);
      }
      showToast('Selected records have been permanently deleted.', 'burst');
      renderAdminToolsTab(document.getElementById('adminTools2Body'));
    }catch(e){
      showToast('Reset failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
  async function changeOwnPassword(){
    const current = document.getElementById('cpCurrent').value;
    const next = document.getElementById('cpNew').value;
    const confirm2 = document.getElementById('cpConfirm').value;
    const u = users.find(x => x.username === currentUser.username);
    if(!u || !(await verifyLogin(u.username, current))){ showToast('Current password is incorrect.'); return; }
    if(!next || next.length < 4){ showToast('New password must be at least 4 characters.'); return; }
    if(next !== confirm2){ showToast('New password and confirmation do not match.'); return; }
    u.password = next;
    await storageSet(USERS_KEY, users);
    document.getElementById('cpCurrent').value = '';
    document.getElementById('cpNew').value = '';
    document.getElementById('cpConfirm').value = '';
    showToast('Password updated.', 'burst');
  }
  function previewDownloadFile(e){
    const file = e.target.files[0];
    if(file) document.getElementById('dlFileName').textContent = file.name;
  }
  async function addAdminDownload(){
    const title = document.getElementById('dlTitle').value.trim();
    const fileInput = document.getElementById('dlFileInput');
    const file = fileInput.files[0];
    if(!title || !file){ showToast('Enter a title and choose a file.'); return; }
    const reader = new FileReader();
    reader.onload = async evt => {
      adminDownloads.push({ title, filename: file.name, data: evt.target.result, date: new Date().toISOString().slice(0,10) });
      await storageSet(DOWNLOADS_KEY, adminDownloads);
      renderAdminToolsTab(document.getElementById('adminTools2Body'));
      showToast('Download added.', 'burst');
    };
    reader.readAsDataURL(file);
  }
  async function deleteAdminDownload(idx){
    if(!await showConfirmDialog('Delete this download?')) return;
    adminDownloads.splice(idx,1);
    await storageSet(DOWNLOADS_KEY, adminDownloads);
    renderAdminToolsTab(document.getElementById('adminTools2Body'));
  }

  /* --- Roles & Permissions --- */
  let permView = 'list';
  let permEditingRoleName = '';

  function renderPermissionsTab(body){
    if(permView === 'edit') return renderPermissionEditor(body);
    // Student and Parent are deliberately left out here — they don't use the
    // module-permission system at all. Their login always shows only "My
    // Portal", scoped to their own linked child; there's no "view" checkbox
    // that could safely mean "see every student's fees/marks" for them, so
    // Roles & Permissions doesn't offer to edit them.
    const builtIns = ROLES.filter(name => name !== 'Student' && name !== 'Parent').map(name => ({ name, builtIn: true, override: findRoleOverride(name) }));
    const customOnly = customRoles.filter(r => !ROLES.includes(r.name)).map(r => ({ name: r.name, builtIn: false, override: r }));
    const allRoles = [...builtIns, ...customOnly];
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">
        Every role — built-in or custom — can have its permissions adjusted here, module by module. Built-in roles start with their normal defaults; editing and saving overrides that default for everyone with that role. Modules marked <span class="pill" style="font-size:0.62rem;">Coming Soon</span> aren't built yet — set their permissions now and they'll be ready the moment those modules launch.
      </p>
      <p style="font-size:0.8rem; color:var(--ink-soft); margin:-8px 0 16px; max-width:680px;">
        <b>Student</b> and <b>Parent</b> logins aren't listed here — they always see only "My Portal" (their own child's fees, marks, receipts and notices), which isn't part of this module system.
      </p>
      <div class="inline-add-form" style="margin-bottom:16px;">
        <input class="input" id="newRoleName" placeholder="e.g. Librarian, Transport Coordinator" style="max-width:260px;">
        <button class="btn btn-primary btn-sm" onclick="addCustomRole()">+ Create New Role</button>
      </div>
      ${allRoles.map(r => {
        const modCount = r.override
          ? PERMISSION_MODULES.filter(m => !m.hidden && r.override.permissions[m.key] && r.override.permissions[m.key].view).length
          : (ROLE_VIEWS[r.name] || []).length;
        return `<div class="list-manage-row">
          <div><div class="lm-name">${r.name} ${r.builtIn ? '<span class="pill" style="font-size:0.68rem;">Built-in</span>' : ''}${r.override ? '<span class="pill" style="font-size:0.68rem; background:rgba(24,143,134,0.15); color:#0f6a63;">Customized</span>' : ''}</div><div class="lm-meta">${modCount} module${modCount===1?'':'s'} accessible${modCount===0?' · <span style="color:#b8621b; font-weight:600;">⚠ No assign permission</span>':''}</div></div>
          <div style="display:flex; gap:10px;">
            ${modCount===0 ? `<button class="btn-edit-text" onclick="approveRoleQuick('${r.name.replace(/'/g,"\\'")}')">Approve</button>` : ''}
            <button class="btn-edit-text" onclick="editRolePermissions('${r.name.replace(/'/g,"\\'")}')">Edit Permissions</button>
            ${r.builtIn
              ? (r.override ? `<button class="btn-danger-text" onclick="resetRoleToDefault('${r.name.replace(/'/g,"\\'")}')">Reset to Default</button>` : '')
              : `<button class="btn-danger-text" onclick="deleteCustomRole('${r.name.replace(/'/g,"\\'")}')">Delete</button>`}
          </div>
        </div>`;
      }).join('')}
    `;
  }
  async function approveRoleQuick(roleName){
    if(!await showConfirmDialog(`Approve "${roleName}" for use? This grants it full access to every module — you can fine-tune exact permissions afterward with "Edit Permissions".`)) return;
    const newPermissions = {};
    PERMISSION_MODULES.forEach(m => {
      newPermissions[m.key] = {};
      PERMISSION_ACTIONS.forEach(a => { newPermissions[m.key][a] = true; });
    });
    let ov = findRoleOverride(roleName);
    if(ov){ ov.permissions = newPermissions; }
    else { customRoles.push({ id:'role_'+Date.now(), name: roleName, permissions: newPermissions }); }
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
    showToast(`"${roleName}" approved — full access granted.`);
  }
  async function addCustomRole(){
    const name = document.getElementById('newRoleName').value.trim();
    if(!name) return;
    if(allRoleNames().includes(name)){ showToast('That role name already exists.'); return; }
    const role = { id:'role_'+Date.now(), name, permissions: emptyPermSet() };
    customRoles.push(role);
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    showToast('Role created — now set its permissions.', 'burst');
    editRolePermissions(name);
  }
  function editRolePermissions(roleName){
    permEditingRoleName = roleName;
    permView = 'edit';
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
  }
  async function deleteCustomRole(roleName){
    if(!await showConfirmDialog('Delete this role? Any users currently assigned this role will lose access until reassigned.')) return;
    customRoles = customRoles.filter(r => r.name !== roleName);
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
  }
  async function resetRoleToDefault(roleName){
    if(!await showConfirmDialog(`Reset "${roleName}" back to its original default permissions?`)) return;
    customRoles = customRoles.filter(r => r.name !== roleName);
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
    showToast('Reset to default.', 'burst');
  }
  function backToPermissionsList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    permView = 'list';
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
  }

  // Named per-row shortcuts — each sets the row's 6 action checkboxes in one
  // click instead of hunting through 6 columns. "Entry" is deliberately the
  // one that matches "can do the day-to-day job, can't modify/delete/approve
  // anything" — the shape almost every non-Admin support role actually needs
  // (fee collection, attendance, marks entry, POS sales, etc.).
  const PERM_PRESETS = {
    none:  { view:false, create:false, edit:false, delete:false, print:false, approve:false },
    view:  { view:true,  create:false, edit:false, delete:false, print:false, approve:false },
    entry: { view:true,  create:true,  edit:false, delete:false, print:true,  approve:false },
    full:  { view:true,  create:true,  edit:true,  delete:true,  print:true,  approve:true  },
  };
  function renderPermissionEditor(body){
    const roleName = permEditingRoleName;
    const existing = findRoleOverride(roleName);
    const permissions = existing ? existing.permissions : seedPermissionsFromDefault(roleName);
    const visibleModules = PERMISSION_MODULES.filter(m => !m.hidden);
    const categories = [...new Set(visibleModules.map(m => m.category))];
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToPermissionsList()">Roles &amp; Permissions</a> &nbsp;/&nbsp; ${roleName}</div>
      <div class="perm-legend">
        <div class="perm-legend-item">👁 <b>View</b> — open this page/tab</div>
        <div class="perm-legend-item">➕ <b>Create</b> — add new records</div>
        <div class="perm-legend-item">✏️ <b>Edit</b> — modify existing records</div>
        <div class="perm-legend-item">🗑️ <b>Delete</b> — remove records</div>
        <div class="perm-legend-item">🖨️ <b>Print</b> — print / export</div>
        <div class="perm-legend-item">✅ <b>Approve</b> — approve a workflow (payroll, admissions, etc.)</div>
      </div>
      <p style="font-size:0.78rem; color:var(--ink-soft); margin:-6px 0 14px; max-width:760px;">
        A parent row (like "Manage Fee" or "Manage Exams") shows up in the sidebar the moment <b>any</b> item nested under it has any permission at all — you no longer need to separately tick "View" on the parent row too. The same is true for every row on its own: ticking just <b>Create</b>, <b>Print</b>, or <b>Approve</b> (say) is enough by itself to make that module appear in the sidebar, even with "View" left unticked — only the specific buttons/screens for what's actually ticked will show once inside. Use the <b>None / View / Entry / Full</b> buttons under each row's name for the most common combinations, or tick individual boxes for anything more specific.
      </p>
      <div class="perm-toolbar">
        <input type="text" class="perm-search" id="permSearchBox" placeholder="🔍 Search modules (e.g. fee, attendance, inventory)…" oninput="filterPermRows(this.value)">
        <button type="button" class="perm-toolbar-btn" onclick="applyPermPresetToAll('none')">🚫 Clear All</button>
      </div>
      ${categories.map(cat => `
        <div class="perm-category" data-category="${cat}">
          <div class="perm-category-head" style="background:${PERMISSION_CATEGORY_COLORS[cat]||'#555'};" onclick="togglePermCategory(this)">
            <span class="perm-chevron">▾</span> ${cat} <span class="perm-cat-count">(${visibleModules.filter(m=>m.category===cat).length} features)</span>
          </div>
          <div class="perm-category-body">
            <table class="perm-table">
              <thead><tr><th>Module</th><th>Full Access</th>${PERMISSION_ACTIONS.map(a => `<th>${a[0].toUpperCase()+a.slice(1)}</th>`).join('')}</tr></thead>
              <tbody>
              ${visibleModules.filter(m => m.category===cat).map(m => {
                const p = permissions[m.key] || Object.fromEntries(PERMISSION_ACTIONS.map(a => [a, false]));
                const full = PERMISSION_ACTIONS.every(a => p[a]);
                const hasChildren = (CHILDREN_OF_PARENT[m.key]||[]).length > 0;
                return `<tr class="${m.parent ? 'perm-row-sub' : ''}" data-search="${(m.label+' '+cat).toLowerCase().replace(/"/g,'')}">
                  <td>
                    <div>${m.icon} ${m.label}${m.comingSoon ? ' <span class="pill" style="font-size:0.62rem; vertical-align:middle;">Coming Soon</span>' : ''}${m.isNew ? ' <span class="perm-new-pill">New</span>' : ''}${hasChildren ? ' <span class="perm-auto-hint">Auto-visible from items below</span>' : ''}</div>
                    <div class="perm-preset-row">
                      <button type="button" class="perm-preset-btn" onclick="applyPermPreset('${m.key}','none')">None</button>
                      <button type="button" class="perm-preset-btn" onclick="applyPermPreset('${m.key}','view')">View</button>
                      <button type="button" class="perm-preset-btn" onclick="applyPermPreset('${m.key}','entry')">Entry</button>
                      <button type="button" class="perm-preset-btn" onclick="applyPermPreset('${m.key}','full')">Full</button>
                    </div>
                  </td>
                  <td><input type="checkbox" class="perm-full" data-module="${m.key}" ${full?'checked':''} onchange="onPermFullToggle(this)"></td>
                  ${PERMISSION_ACTIONS.map(a => `<td><input type="checkbox" class="perm-action" data-module="${m.key}" data-action="${a}" ${p[a]?'checked':''} onchange="onPermActionToggle(this)"></td>`).join('')}
                </tr>`;
              }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}
      <div class="perm-locked-section">
        <h4>🔒 System Administration — always Admin-only</h4>
        <p>These pages manage who can log in and what every role is allowed to do, so they're never delegable through this matrix — no role, however customized, can grant itself or anyone else more access than it already has. Only the built-in Admin role can see them.</p>
        ${LOCKED_ADMIN_ONLY_PAGES.map(pg => `<div class="perm-locked-row"><span>${pg.icon}</span> ${pg.label} <span class="perm-locked-always">Admin only</span></div>`).join('')}
      </div>
      <div style="margin-top:20px; display:flex; gap:10px;">
        <button class="btn btn-ghost" onclick="backToPermissionsList()">Cancel</button>
        <button class="btn btn-primary" onclick="saveRolePermissions()">Save Permissions</button>
      </div>
    `;
  }
  // Sets one module row's 6 checkboxes to a named preset shape, then keeps
  // the "Full Access" master checkbox and search filter both in sync.
  function applyPermPreset(moduleKey, presetName){
    const preset = PERM_PRESETS[presetName];
    if(!preset) return;
    PERMISSION_ACTIONS.forEach(a => {
      const box = document.querySelector(`.perm-action[data-module="${moduleKey}"][data-action="${a}"]`);
      if(box) box.checked = preset[a];
    });
    const fullBox = document.querySelector(`.perm-full[data-module="${moduleKey}"]`);
    if(fullBox) fullBox.checked = PERMISSION_ACTIONS.every(a => preset[a]);
  }
  // Bulk action across every row currently rendered (search filter doesn't
  // limit this — it always applies to the whole role, so it stays predictable
  // regardless of what's currently typed into the search box).
  function applyPermPresetToAll(presetName){
    document.querySelectorAll('#rolesPermissionsBody .perm-table tbody tr').forEach(tr => {
      const box = tr.querySelector('.perm-action');
      if(box) applyPermPreset(box.dataset.module, presetName);
    });
  }
  // Client-side search across module name + category — hides non-matching
  // rows and collapses any category left with nothing visible, so finding
  // one module among ~70 doesn't mean scrolling through every category.
  function filterPermRows(query){
    const q = (query||'').trim().toLowerCase();
    document.querySelectorAll('#rolesPermissionsBody .perm-category').forEach(catEl => {
      let anyVisible = false;
      catEl.querySelectorAll('tbody tr').forEach(tr => {
        const match = !q || (tr.dataset.search||'').includes(q);
        tr.classList.toggle('perm-row-hidden', !match);
        if(match) anyVisible = true;
      });
      catEl.classList.toggle('perm-cat-hidden', !anyVisible);
      // Searching should surface the answer immediately rather than making
      // the person also remember to expand a collapsed category.
      const bodyEl = catEl.querySelector('.perm-category-body');
      const chevEl = catEl.querySelector('.perm-chevron');
      if(bodyEl && q && anyVisible){ bodyEl.style.display = 'block'; if(chevEl) chevEl.textContent = '▾'; }
    });
  }
  function togglePermCategory(headEl){
    const bodyEl = headEl.nextElementSibling;
    const isHidden = bodyEl.style.display === 'none';
    bodyEl.style.display = isHidden ? 'block' : 'none';
    headEl.querySelector('.perm-chevron').textContent = isHidden ? '▾' : '▸';
  }
  function onPermFullToggle(el){
    const mod = el.dataset.module;
    const checked = el.checked;
    document.querySelectorAll(`.perm-action[data-module="${mod}"]`).forEach(c => c.checked = checked);
  }
  function onPermActionToggle(el){
    const mod = el.dataset.module;
    const allChecked = Array.from(document.querySelectorAll(`.perm-action[data-module="${mod}"]`)).every(c => c.checked);
    const fullBox = document.querySelector(`.perm-full[data-module="${mod}"]`);
    if(fullBox) fullBox.checked = allChecked;
  }
  async function saveRolePermissions(){
    const roleName = permEditingRoleName;
    const existingRole = findRoleOverride(roleName);
    const newPermissions = {};
    PERMISSION_MODULES.forEach(m => {
      if(m.hidden){
        // Legacy fallback-only key (e.g. 'setup') no longer has its own
        // checkboxes in the editor — carry its existing value forward
        // untouched instead of silently resetting it to "no access" just
        // because the visible sub-modules got saved.
        const seeded = seedPermissionsFromDefault(roleName);
        newPermissions[m.key] = (existingRole && existingRole.permissions[m.key]) || seeded[m.key] || Object.fromEntries(PERMISSION_ACTIONS.map(a => [a, false]));
        return;
      }
      newPermissions[m.key] = {};
      PERMISSION_ACTIONS.forEach(a => {
        const box = document.querySelector(`.perm-action[data-module="${m.key}"][data-action="${a}"]`);
        newPermissions[m.key][a] = box ? box.checked : false;
      });
    });
    let role = existingRole;
    if(role){
      role.permissions = newPermissions;
    }else{
      role = { id:'role_'+Date.now(), name: roleName, permissions: newPermissions };
      customRoles.push(role);
    }
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    showToast('Permissions saved for ' + roleName + '.');
    backToPermissionsList();
  }

  /* --- School Profile (branding, contact, location) --- */
  const SCHOOL_INFO_KEY = "school-info";
  let schoolInfo = {};
  let schoolLogoData = '';
  let schoolPrincipalSignatureData = '';
  // Editable Leadership section — feeds the public website's Leadership cards
  // (via /api/school-info, which it already fetches) so an Admin can correct a
  // name, title or email — or add/remove a leader — without a code change and
  // redeploy. Starts empty like every other School Profile field (this file is
  // the shared template every school runs, so it holds no one school's real
  // names) — use "+ Add Leader" to enter real people, then Save.
  let schoolLeadershipDraft = [];
  function leadershipInitials(name){
    return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  }

  async function loadSchoolInfo(){
    // These are placeholder DEFAULTS ONLY — they hold until an Admin fills in
    // School Profile (Setup → School Profile) for real, and appear nowhere
    // once that's done. A fresh deployment for a new school should never
    // show another school's actual name, phone, or address, so nothing
    // here is a real contact detail — it's exactly what a not-yet-configured
    // install should look like.
    schoolInfo = await storageGet(SCHOOL_INFO_KEY, {
      name: 'Your School Name', tagline: '',
      udise: '', schoolCode: '', regNumber: '',
      email: '', phone: '', website: '',
      state: '', district: '', pin: '',
      address: '',
      workingDays: 220, logo: '',
      principalName: '', principalSignature: '',
      leadership: [],
    });
    if(schoolInfo.logo) document.getElementById('sbLogoImg').src = schoolInfo.logo;
    const nameSpan = document.getElementById('sbBrandName');
    if(nameSpan) nameSpan.innerHTML = (schoolInfo.name||'Your School').split(' ').slice(0,2).join(' ') + '<span>ERP Portal</span>';
    document.title = (schoolInfo.name || 'Your School') + ' — ERP';
    const loginNameEl = document.getElementById('loginSchoolName');
    if(loginNameEl && schoolInfo.name) loginNameEl.textContent = schoolInfo.name;
    const loginLogoEl = document.getElementById('loginLogoImg');
    if(loginLogoEl && schoolInfo.logo) loginLogoEl.src = schoolInfo.logo;
  }
  function schoolLogoSrc(){
    return schoolLogoData || schoolInfo.logo || document.getElementById('sbLogoImg').src;
  }

  function renderSchoolProfileTab(body){
    schoolLeadershipDraft = JSON.parse(JSON.stringify(schoolInfo.leadership || []));
    body.innerHTML = `
      <div class="profile-card" style="margin-bottom:20px; max-width:340px;">
        <h4>Branding</h4>
        <div style="display:flex; flex-direction:column; align-items:center; gap:10px; margin:14px 0;">
          <img id="schoolLogoPreview" src="${schoolInfo.logo || document.getElementById('sbLogoImg').src}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:1.5px solid var(--border);">
          <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Change Logo<input type="file" accept="image/*" id="schoolLogoInput" style="display:none;" onchange="previewSchoolLogo(event)"></label>
          <span style="font-size:0.72rem; color:var(--ink-soft);">JPEG, PNG or WebP · Max 2MB</span>
        </div>
        <div class="f-field">
          <label>Tagline / Motto</label>
          <textarea id="siTagline" rows="2">${schoolInfo.tagline||''}</textarea>
        </div>
      </div>

      <div class="profile-card" style="margin-bottom:20px;">
        <h4>Basic Information</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field full"><label>School Name <span class="required-star">*</span></label><input type="text" id="siName" value="${schoolInfo.name||''}"></div>
          <div class="f-field"><label>UDISE Code</label><input type="text" id="siUdise" value="${schoolInfo.udise||''}" inputmode="numeric" maxlength="11" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,11)"></div>
          <div class="f-field"><label>School Code</label><input type="text" id="siSchoolCode" value="${schoolInfo.schoolCode||''}"></div>
          <div class="f-field full"><label>Reg. / Affiliation Number</label><input type="text" id="siRegNumber" value="${schoolInfo.regNumber||''}"></div>
        </div>
      </div>

      <div class="profile-card" style="margin-bottom:20px;">
        <h4>Contact Details</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field"><label>Email</label><input type="email" id="siEmail" value="${schoolInfo.email||''}"></div>
          <div class="f-field"><label>Phone / Landline</label><input type="text" id="siPhone" value="${schoolInfo.phone||''}" inputmode="numeric" maxlength="11" oninput="this.value=this.value.replace(/\D/g,'').slice(0,11)" placeholder="10-digit mobile or 11-digit landline with STD code"></div>
          <div class="f-field"><label>WhatsApp Number <small>(shown on the public website)</small></label><input type="text" id="siWhatsapp" value="${schoolInfo.whatsapp||''}" inputmode="numeric" maxlength="10" oninput="this.value=this.value.replace(/\D/g,'').slice(0,10)" placeholder="10-digit mobile number"></div>
          <div class="f-field full"><label>Website</label><input type="text" id="siWebsite" value="${schoolInfo.website||''}"></div>
        </div>
      </div>

      <div class="profile-card" style="margin-bottom:20px;">
        <h4>Location</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field"><label>State</label><input type="text" id="siState" value="${schoolInfo.state||''}"></div>
          <div class="f-field"><label>District</label><input type="text" id="siDistrict" value="${schoolInfo.district||''}"></div>
          <div class="f-field"><label>PIN Code</label><input type="text" id="siPin" value="${schoolInfo.pin||''}" inputmode="numeric" maxlength="6" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)"></div>
          <div class="f-field full"><label>Address</label><textarea id="siAddress" rows="2">${schoolInfo.address||''}</textarea></div>
        </div>
      </div>

      <div class="profile-card" style="max-width:340px; margin-bottom:20px;">
        <h4>Academic Year Settings</h4>
        <div class="f-field" style="margin-top:12px;">
          <label>Working Days</label>
          <input type="number" min="1" max="365" id="siWorkingDays" value="${schoolInfo.workingDays||220}">
          <span style="font-size:0.72rem; color:var(--ink-soft);">Total school working days for the selected academic year.</span>
        </div>
      </div>

      <div class="profile-card" style="margin-bottom:20px; max-width:420px;">
        <h4>Document Signatures</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:4px 0 12px;">This signature is auto-applied to Admit Cards and Progress Reports wherever a Principal / Correspondent signature is required, so documents don't need to be signed individually. Class Teacher signatures are uploaded on each teacher's own Staff Profile.</p>
        <div class="f-field">
          <label>Principal / Correspondent Name</label>
          <input type="text" id="siPrincipalName" value="${schoolInfo.principalName||''}">
        </div>
        <div style="display:flex; align-items:center; gap:16px; margin-top:10px;">
          <div style="width:150px; height:60px; border:1.5px dashed var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center; background:#fafafa; overflow:hidden;" id="schoolSigPreviewWrap">
            <img id="schoolSigPreview" src="${schoolInfo.principalSignature||''}" style="max-width:100%; max-height:100%; ${schoolInfo.principalSignature?'':'display:none;'}">
            <span id="schoolSigPlaceholder" style="font-size:0.72rem; color:var(--ink-soft); ${schoolInfo.principalSignature?'display:none;':''}">No signature</span>
          </div>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload Signature<input type="file" accept="image/*" id="schoolSigInput" style="display:none;" onchange="previewPrincipalSignature(event)"></label>
        </div>
        <span style="font-size:0.72rem; color:var(--ink-soft); display:block; margin-top:6px;">Use a scanned signature on a plain/white background, PNG preferred · Max 2MB</span>
      </div>

      <div class="profile-card" style="margin-bottom:20px;">
        <h4>Leadership</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:4px 0 12px;">Shown on the public website's Leadership section (Secretary, Correspondent, Principal, Academic Director, etc.). Add, edit or remove anyone here — the website picks up the change automatically, no code edit needed.</p>
        <div id="leadershipEditorRows">${renderLeadershipEditorRows()}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:4px;" onclick="addLeadershipEntry()">+ Add Leader</button>
      </div>

      <button class="btn btn-primary" onclick="saveSchoolProfile()">Save Changes</button>
    `;
  }
  function renderLeadershipEditorRows(){
    if(!schoolLeadershipDraft.length){
      return `<p style="font-size:0.82rem; color:var(--ink-soft); margin-bottom:10px;">No one added yet — use "+ Add Leader" below.</p>`;
    }
    return schoolLeadershipDraft.map((l, i) => `
      <div style="display:flex; gap:14px; align-items:flex-start; padding:14px 0; ${i>0?'border-top:1px solid var(--border);':''}">
        <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex-shrink:0;">
          ${l.photo
            ? `<img id="leadPhotoPreview${i}" src="${l.photo}" style="width:56px; height:56px; border-radius:50%; object-fit:cover; border:1.5px solid var(--border);">`
            : `<div id="leadPhotoPreview${i}" style="width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg, var(--gold), var(--magenta)); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:0.9rem;">${leadershipInitials(l.name||'')}</div>`}
          <label class="btn btn-ghost btn-sm" style="cursor:pointer; font-size:0.68rem; padding:3px 8px;">Photo<input type="file" accept="image/*" style="display:none;" onchange="previewLeadershipPhoto(event, ${i})"></label>
        </div>
        <div class="form-grid" style="flex:1;">
          <div class="f-field"><label>Name</label><input type="text" value="${escapeHtml(l.name||'')}" oninput="schoolLeadershipDraft[${i}].name=this.value"></div>
          <div class="f-field"><label>Title / Role</label><input type="text" value="${escapeHtml(l.title||'')}" oninput="schoolLeadershipDraft[${i}].title=this.value" placeholder="e.g. Principal, Secretary & Correspondent"></div>
          <div class="f-field"><label>Qualification</label><input type="text" value="${escapeHtml(l.qualification||'')}" oninput="schoolLeadershipDraft[${i}].qualification=this.value"></div>
          <div class="f-field"><label>Email</label><input type="email" value="${escapeHtml(l.email||'')}" oninput="schoolLeadershipDraft[${i}].email=this.value"></div>
        </div>
        <button class="btn-edit-text" style="color:var(--magenta); font-size:1rem; padding:4px 8px;" onclick="removeLeadershipEntry(${i})" title="Remove">&times;</button>
      </div>
    `).join('');
  }
  function refreshLeadershipEditor(){
    const wrap = document.getElementById('leadershipEditorRows');
    if(wrap) wrap.innerHTML = renderLeadershipEditorRows();
  }
  function addLeadershipEntry(){
    schoolLeadershipDraft.push({ name: '', title: '', qualification: '', email: '', photo: '' });
    refreshLeadershipEditor();
  }
  function removeLeadershipEntry(idx){
    schoolLeadershipDraft.splice(idx, 1);
    refreshLeadershipEditor();
  }
  function previewLeadershipPhoto(e, idx){
    readImageFileWithSizeLimit(e, dataUrl => {
      schoolLeadershipDraft[idx].photo = dataUrl;
      refreshLeadershipEditor();
    });
  }
  function previewPrincipalSignature(e){
    readImageFileWithSizeLimit(e, dataUrl => {
      schoolPrincipalSignatureData = dataUrl;
      document.getElementById('schoolSigPreview').src = schoolPrincipalSignatureData;
      document.getElementById('schoolSigPreview').style.display = 'block';
      document.getElementById('schoolSigPlaceholder').style.display = 'none';
    });
  }
  function previewSchoolLogo(e){
    readImageFileWithSizeLimit(e, dataUrl => {
      schoolLogoData = dataUrl;
      document.getElementById('schoolLogoPreview').src = schoolLogoData;
    });
  }
  async function saveSchoolProfile(){
    const siPhoneVal = document.getElementById('siPhone').value.trim();
    if(siPhoneVal && !(isValidMobile(siPhoneVal) || (/^0\d{10}$/.test(siPhoneVal)))){
      showToast('Phone must be a 10-digit mobile or an 11-digit landline starting with 0 (STD code).');
      document.getElementById('siPhone').focus();
      return;
    }
    const siWhatsappVal = document.getElementById('siWhatsapp').value.trim();
    if(siWhatsappVal && !isValidMobile(siWhatsappVal)){
      showToast('WhatsApp number must be exactly 10 digits.');
      document.getElementById('siWhatsapp').focus();
      return;
    }
    const siUdiseVal = document.getElementById('siUdise').value.trim();
    if(siUdiseVal && !isValidUdise(siUdiseVal)){
      showToast('UDISE Code must be exactly 11 digits.');
      document.getElementById('siUdise').focus();
      return;
    }
    const siPinVal = document.getElementById('siPin').value.trim();
    if(siPinVal && !isValidPin(siPinVal)){
      showToast('PIN Code must be exactly 6 digits.');
      document.getElementById('siPin').focus();
      return;
    }
    schoolInfo = {
      name: document.getElementById('siName').value.trim(),
      tagline: document.getElementById('siTagline').value.trim(),
      udise: document.getElementById('siUdise').value.trim(),
      schoolCode: document.getElementById('siSchoolCode').value.trim(),
      regNumber: document.getElementById('siRegNumber').value.trim(),
      email: document.getElementById('siEmail').value.trim(),
      phone: document.getElementById('siPhone').value.trim(),
      whatsapp: siWhatsappVal,
      website: document.getElementById('siWebsite').value.trim(),
      state: document.getElementById('siState').value.trim(),
      district: document.getElementById('siDistrict').value.trim(),
      pin: document.getElementById('siPin').value.trim(),
      address: document.getElementById('siAddress').value.trim(),
      workingDays: Number(document.getElementById('siWorkingDays').value) || 220,
      logo: schoolLogoData || schoolInfo.logo || '',
      principalName: document.getElementById('siPrincipalName').value.trim(),
      principalSignature: schoolPrincipalSignatureData || schoolInfo.principalSignature || '',
      leadership: schoolLeadershipDraft
        .map(l => ({ name: (l.name||'').trim(), title: (l.title||'').trim(), qualification: (l.qualification||'').trim(), email: (l.email||'').trim(), photo: l.photo || '' }))
        .filter(l => l.name),
    };
    await storageSet(SCHOOL_INFO_KEY, schoolInfo);
    if(schoolInfo.logo) document.getElementById('sbLogoImg').src = schoolInfo.logo;
    const nameSpan = document.getElementById('sbBrandName');
    if(nameSpan) nameSpan.innerHTML = schoolInfo.name.split(' ').slice(0,2).join(' ') + '<span>ERP Portal</span>';
    if(schoolInfo.name) document.title = schoolInfo.name + ' — ERP';
    showToast('School profile saved.', 'burst');
  }

  /* --- Classes management --- */
  const CLASS_LEVELS_KEY = "class-levels";
  const SECTIONS_KEY = "section-levels";
  const CLASS_SECTIONS_KEY = "class-section-overrides";
  [CLASS_LEVELS_KEY, SECTIONS_KEY, CLASS_SECTIONS_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  async function loadClassSectionOverrides(){
    classSectionOverrides = await storageGet(CLASS_SECTIONS_KEY, {});
  }
  async function loadClassLevels(){
    CLASS_LEVELS = await storageGet(CLASS_LEVELS_KEY, CLASS_LEVELS);
  }
  async function loadSectionLevels(){
    SECTIONS = await storageGet(SECTIONS_KEY, SECTIONS);
  }
  function renderClassesTab(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:600px;">
        Add or remove the classes your school teaches. These appear everywhere — Manage Student, Fee Structure, Attendance, Exams, and Subjects — so removing one here removes it from all of those too.
      </p>
      <div class="inline-add-form" style="margin-bottom:16px;">
        <input class="input" id="newClassName" placeholder="e.g. Nursery, 11th Class" style="max-width:220px;">
        <button class="btn btn-primary btn-sm" onclick="addClassLevel()">+ Add Class</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:28px;">
        ${CLASS_LEVELS.map((c,i) => `<span class="pill" style="display:flex; align-items:center; gap:8px; font-size:0.85rem; padding:8px 12px;">${c} <button onclick="removeClassLevel(${i})" style="background:none; border:none; color:var(--magenta); font-weight:700; cursor:pointer; font-size:0.9rem;">&times;</button></span>`).join('')}
      </div>

      <div class="dash-section-title"><div><h3>Sections</h3></div></div>
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:600px;">
        Every class is split into these sections (e.g. Section A, Section B). Add more if your school runs more than two per class — this also applies everywhere classes do.
      </p>
      <div class="inline-add-form" style="margin-bottom:16px;">
        <input class="input" id="newSectionName" placeholder="e.g. C" style="max-width:120px; text-transform:uppercase;" maxlength="3">
        <button class="btn btn-primary btn-sm" onclick="addSectionLevel()">+ Add Section</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        ${SECTIONS.map((s,i) => `<span class="pill" style="display:flex; align-items:center; gap:8px; font-size:0.85rem; padding:8px 12px;">Section ${s} <button onclick="removeSectionLevel(${i})" style="background:none; border:none; color:var(--magenta); font-weight:700; cursor:pointer; font-size:0.9rem;">&times;</button></span>`).join('')}
      </div>

      <div class="dash-section-title"><div><h3>Sections per Class</h3></div></div>
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">
        Not every class needs to be split up — a small class can stay as just Section A while a bigger one uses all the sections above. Uncheck a class down to none and it resets to Section A only.
      </p>
      <div class="table-wrap">
        <table><thead><tr><th>Class</th><th>Sections Used</th></tr></thead>
        <tbody>
        ${CLASS_LEVELS.map(cls => {
          const current = sectionsForClass(cls);
          return `<tr>
            <td class="name-cell">${cls}</td>
            <td>${SECTIONS.map(sec => `<label style="margin-right:16px; font-size:0.82rem;"><input type="checkbox" class="cls-sec-check" data-class="${cls}" value="${sec}" ${current.includes(sec)?'checked':''} onchange="onClassSectionToggle('${cls}')"> Section ${sec}</label>`).join('')}</td>
          </tr>`;
        }).join('')}
        </tbody></table>
      </div>
    `;
  }
  async function onClassSectionToggle(cls){
    const checked = Array.from(document.querySelectorAll(`.cls-sec-check[data-class="${cls}"]:checked`)).map(c => c.value);
    if(checked.length === 0){
      classSectionOverrides[cls] = [SECTIONS[0]];
      showToast(`At least one section is required — defaulted to Section ${SECTIONS[0]}.`);
    }else{
      classSectionOverrides[cls] = checked;
    }
    await storageSet(CLASS_SECTIONS_KEY, classSectionOverrides);
    renderClassesTab(document.getElementById('classesSetupBody'));
  }
  async function addSectionLevel(){
    const val = document.getElementById('newSectionName').value.trim().toUpperCase();
    if(!val) return;
    if(SECTIONS.includes(val)){ showToast('That section already exists.'); return; }
    SECTIONS.push(val);
    await storageSet(SECTIONS_KEY, SECTIONS);
    renderClassesTab(document.getElementById('classesSetupBody'));
    showToast('Section added.', 'burst');
  }
  async function removeSectionLevel(idx){
    if(SECTIONS.length <= 1){ showToast('At least one section is required.'); return; }
    const removed = SECTIONS[idx];
    if(!await showConfirmDialog(`Remove "Section ${removed}"? This won't delete existing student records, but the section will no longer appear in dropdowns and grids.`)) return;
    SECTIONS.splice(idx,1);
    await storageSet(SECTIONS_KEY, SECTIONS);
    // Clean up any per-class override that referenced the removed section.
    let overridesChanged = false;
    Object.keys(classSectionOverrides).forEach(cls => {
      if(classSectionOverrides[cls].includes(removed)){
        classSectionOverrides[cls] = classSectionOverrides[cls].filter(s => s !== removed);
        if(classSectionOverrides[cls].length === 0) classSectionOverrides[cls] = [SECTIONS[0]];
        overridesChanged = true;
      }
    });
    if(overridesChanged) await storageSet(CLASS_SECTIONS_KEY, classSectionOverrides);
    renderClassesTab(document.getElementById('classesSetupBody'));
  }
  async function addClassLevel(){
    const val = document.getElementById('newClassName').value.trim();
    if(!val) return;
    if(CLASS_LEVELS.includes(val)){ showToast('That class already exists.'); return; }
    CLASS_LEVELS.push(val);
    await storageSet(CLASS_LEVELS_KEY, CLASS_LEVELS);
    renderClassesTab(document.getElementById('classesSetupBody'));
    showToast('Class added.', 'burst');
  }
  async function removeClassLevel(idx){
    if(!await showConfirmDialog(`Remove "${CLASS_LEVELS[idx]}"? This won't delete existing student records, but the class will no longer appear in dropdowns and grids.`)) return;
    CLASS_LEVELS.splice(idx,1);
    await storageSet(CLASS_LEVELS_KEY, CLASS_LEVELS);
    renderClassesTab(document.getElementById('classesSetupBody'));
  }

  /* --- Users & Roles ---
     Staff/Admin-side logins only (Admin, Principal, Accountant, Office
     Assistant, Teacher, Staff, and any custom roles). Student and Parent
     logins live entirely on their own dedicated page (Student/Parent
     Logins) so the two lists don't get mixed together — this page can
     grow to hundreds of student/parent rows otherwise and burying staff
     accounts in the middle of that makes them hard to find. --- */
  function renderUsersTab(body){
    if(currentUser.role !== 'Admin'){
      body.innerHTML = `<div class="empty-state"><b>Admin only</b>Only the Admin role can manage user accounts.</div>`;
      return;
    }
    const staffUsers = users.filter(u => u.role !== 'Student' && u.role !== 'Parent');
    const studentParentCount = users.length - staffUsers.length;
    const rows = staffUsers.map(u => {
      return `
        <tr>
          <td class="name-cell">${u.name}</td>
          <td class="id-cell">${u.username}</td>
          <td><span class="role-pill">${u.role}</span></td>
          <td>
            <button class="btn-edit-text" onclick="editUser('${u.id}')">Edit</button>
            ${u.id !== 'u_admin' ? `&nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteUser('${u.id}')">Delete</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">
        Create a login for each staff member. Roles control which sections of the ERP they can see:
        <b>Admin</b> &amp; <b>Principal</b> see everything; <b>Accountant</b> sees Dashboard + Manage Student;
        <b>Office Assistant</b>, <b>Teacher</b>, and <b>Staff</b> see Manage Student only.
        Looking for a student or parent login? Head to <a onclick="switchView('studentparentlogins')" style="cursor:pointer; color:var(--magenta); font-weight:600;">Student/Parent Logins</a>${studentParentCount ? ` — ${studentParentCount} of them there right now` : ''}.
      </p>
      <button class="btn btn-primary" style="margin-bottom:16px;" onclick="openUserModal(undefined, undefined, undefined, 'staff')">+ Add User</button>
      <button class="btn btn-ghost" style="margin-bottom:16px; margin-left:8px;" onclick="openTrashModal('users')">🗑 Recently Deleted</button>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th></th></tr></thead>
          <tbody>${rows.length ? rows : `<tr><td colspan="4"><div class="empty-state"><b>No staff logins yet</b></div></td></tr>`}</tbody>
        </table>
      </div>
    `;
  }

  function populateUserRoleSelect(mode){
    let names = allRoleNames();
    if(mode === 'staff') names = names.filter(r => r !== 'Student' && r !== 'Parent');
    else if(mode === 'studentparent') names = names.filter(r => r === 'Student' || r === 'Parent');
    document.getElementById('uRole').innerHTML = names.map(r => `<option>${r}</option>`).join('');
  }
  // Auto-generate helpers: a fresh "Add User" form starts with a ready-made
  // username (derived from the name as it's typed) and password so the admin
  // can just hit Save, but either field can still be hand-edited or re-rolled.
  let userModalUsernameTouched = false;
  function generateLoginPassword(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pw = '';
    for(let i=0;i<8;i++) pw += chars[Math.floor(Math.random()*chars.length)];
    return pw;
  }
  function slugifyForUsername(name){
    return (name||'').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,20);
  }
  function generateUniqueUsername(name){
    const base = slugifyForUsername(name) || 'user';
    let candidate = base;
    let n = 1;
    while(users.some(u => u.username.toLowerCase() === candidate.toLowerCase())){
      n++;
      candidate = base + n;
    }
    return candidate;
  }
  function onUserNameInput(){
    if(document.getElementById('editUserId').value) return; // don't touch username when editing an existing user
    if(userModalUsernameTouched) return;
    const name = document.getElementById('uName').value.trim();
    document.getElementById('uUsername').value = name ? generateUniqueUsername(name) : '';
  }
  function onUserUsernameInput(){
    userModalUsernameTouched = true;
  }
  function autoGenerateUsername(){
    document.getElementById('uUsername').value = generateUniqueUsername(document.getElementById('uName').value);
    userModalUsernameTouched = true;
  }
  function autoGeneratePassword(){
    document.getElementById('uPassword').value = generateLoginPassword();
  }
  function openUserModal(presetName, presetRole, presetStudentId, mode){
    if(mode !== 'staff') pendingStaffLoginLinkId = null; // only the staff-login shortcut above should link back
    document.getElementById('userModalTitle').textContent = mode === 'studentparent' ? 'Add Student/Parent Login' : (mode === 'staff' ? 'Add Staff User' : 'Add User');
    document.getElementById('userForm').reset();
    document.getElementById('editUserId').value = '';
    document.getElementById('uRecoveryCode').value = generateRecoveryCode();
    userModalUsernameTouched = false;
    document.getElementById('uPassword').placeholder = 'Set a login password';
    document.getElementById('uPassword').value = generateLoginPassword();
    if(presetName) document.getElementById('uName').value = presetName;
    populateUserRoleSelect(mode);
    if(presetRole) document.getElementById('uRole').value = presetRole;
    else if(mode === 'studentparent') document.getElementById('uRole').value = 'Student';
    populateUserStudentPicker();
    if(presetStudentId) document.getElementById('uLinkedStudent').value = presetStudentId;
    toggleUserStudentField();
    onUserNameInput();
    document.getElementById('userModalOverlay').classList.add('open');
  }
  function closeUserModal(){
    pendingStaffLoginLinkId = null;
    document.getElementById('userModalOverlay').classList.remove('open');
  }
  function toggleUserStudentField(){
    const role = document.getElementById('uRole').value;
    document.getElementById('uStudentField').style.display = (role==='Student'||role==='Parent') ? 'block' : 'none';
  }
  function regenerateRecoveryCode(){
    document.getElementById('uRecoveryCode').value = generateRecoveryCode();
  }
  function populateUserStudentPicker(){
    const sel = document.getElementById('uLinkedStudent');
    sel.innerHTML = '<option value="">Not linked</option>' +
      students.map(s => `<option value="${s.id}">${s.firstName} ${s.lastName} — ${s.admissionNo}</option>`).join('');
  }
  function editUser(id){
    const u = users.find(x => x.id === id);
    if(!u) return;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('editUserId').value = u.id;
    document.getElementById('uName').value = u.name;
    document.getElementById('uUsername').value = u.username;
    // The server never sends a stored password back (see the security
    // review), so there's nothing to pre-fill here — leave it blank and
    // explain that blank means "no change," rather than showing "undefined".
    document.getElementById('uPassword').value = '';
    document.getElementById('uPassword').placeholder = 'Leave blank to keep the current password';
    populateUserRoleSelect();
    document.getElementById('uRole').value = u.role;
    document.getElementById('uRecoveryCode').value = u.recoveryCode || generateRecoveryCode();
    populateUserStudentPicker();
    document.getElementById('uLinkedStudent').value = u.linkedStudentId || '';
    toggleUserStudentField();
    document.getElementById('userModalOverlay').classList.add('open');
  }
  async function deleteUser(id){
    if(!await showConfirmDialog('Remove this user account?')) return;
    users = users.filter(u => u.id !== id);
    await storageSet(USERS_KEY, users);
    refreshUserListViews();
    showToast('User removed.', 'burst');
  }
  // Users can be edited/created/removed from either the full Users & Roles page or
  // the filtered Student/Parent Logins page — refresh whichever one is on screen
  // (usually just one, but harmless to check both) so neither goes stale.
  function refreshUserListViews(){
    const rolesBody = document.getElementById('usersRolesBody');
    if(rolesBody) renderUsersTab(rolesBody);
    const loginsBody = document.getElementById('studentParentLoginsBody');
    if(loginsBody) renderStudentParentLoginsView(loginsBody);
  }
  async function saveUser(e){
    e.preventDefault();
    const editId = document.getElementById('editUserId').value;
    const uname = document.getElementById('uUsername').value.trim();
    if(users.some(u => u.username.toLowerCase()===uname.toLowerCase() && u.id!==editId)){
      showToast('That username is already taken.');
      return false;
    }
    if(!editId && !document.getElementById('uPassword').value){
      showToast('Set a password for this new user.');
      return false;
    }
    const data = {
      name: document.getElementById('uName').value.trim(),
      username: uname,
      password: document.getElementById('uPassword').value,
      role: document.getElementById('uRole').value,
      linkedStudentId: document.getElementById('uLinkedStudent').value,
      recoveryCode: document.getElementById('uRecoveryCode').value,
    };
    let linkedStaff = null;
    let prevLinkedUserId;
    let prevUserSnapshot = null;
    let pushedNewUser = false;
    if(editId){
      const idx = users.findIndex(u => u.id === editId);
      prevUserSnapshot = { ...users[idx] };
      users[idx] = { ...users[idx], ...data };
    }else{
      data.id = 'u_' + Date.now();
      users.push(data);
      pushedNewUser = true;
      // If this login was created via the Staff Directory's 🔑 "Grant login
      // access" shortcut, link it straight back onto that staff record —
      // otherwise this user would exist in Users & Roles but myTeacherScope()
      // could never trace it back to the staff member's class/subject
      // assignments (see openLoginForStaff above).
      if(pendingStaffLoginLinkId){
        linkedStaff = staffList.find(st => st.id === pendingStaffLoginLinkId);
        if(linkedStaff){
          prevLinkedUserId = linkedStaff.linkedUserId;
          linkedStaff.linkedUserId = data.id;
        }
      }
    }
    // storageSet/syncArrayToApi never throws — on a server/permission/network
    // failure it silently falls back to localStorage and only pops a
    // dismissible toast, so without this check saveUser would carry on as if
    // the login had really been created: the modal would close, "User
    // created" would show, and the admin would have no reason to look again
    // until it mysteriously wasn't in Users & Roles after a reload. Checking
    // the real result here and refusing to pretend it worked is the fix.
    const saved = await storageSet(USERS_KEY, users);
    if(!saved){
      if(pushedNewUser){
        users.pop();
        if(linkedStaff) linkedStaff.linkedUserId = prevLinkedUserId;
      }else{
        const idx = users.findIndex(u => u.id === editId);
        users[idx] = prevUserSnapshot;
      }
      alert("This login could NOT be saved to the server — nothing was created or changed. This usually means the save was rejected (e.g. you're not signed in as Admin) or the connection dropped. Please check and try again; the form stays open so you don't lose what you typed.");
      return false;
    }
    if(linkedStaff){
      const staffLinkSaved = await storageSet(STAFF_KEY, staffList);
      if(!staffLinkSaved){
        showToast("Login created, but couldn't link it to the staff record — attendance and marks-entry access won't work for them yet. Try the 🔑 button again from Staff Directory.");
      }
    }
    showToast(editId ? 'User updated.' : 'User created.');
    pendingStaffLoginLinkId = null;
    closeUserModal();
    refreshUserListViews();
    return false;
  }

  /* --- Academic Year --- */
  function renderAcademicYearTab(body){
    body.innerHTML = `
      <div class="profile-card" style="max-width:520px;">
        <h4>Current Academic Year</h4>
        <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:14px;">This year is shown across the ERP (e.g. the AY badge on Manage Student).</p>
        <div style="display:flex; gap:10px; margin-bottom:22px;">
          <select id="ayCurrentSelect" style="flex:1;">
            ${academicYears.map(y => `<option value="${y}" ${y===currentAcademicYearValue?'selected':''}>${y}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="setCurrentAcademicYear()">Set as Current</button>
        </div>
        <h4>Add New Academic Year</h4>
        <div style="display:flex; gap:10px;">
          <input class="input" id="ayNewInput" placeholder="e.g. 2027-28" style="max-width:200px;">
          <button class="btn btn-ghost btn-sm" onclick="addAcademicYear()">+ Add Year</button>
        </div>
        <div style="margin-top:18px; font-size:0.82rem; color:var(--ink-soft);">
          All years on file: ${academicYears.join(', ')}
        </div>
      </div>
    `;
  }

  async function addAcademicYear(){
    const val = document.getElementById('ayNewInput').value.trim();
    if(!val) return;
    if(!academicYears.includes(val)) academicYears.push(val);
    await storageSet(ACADEMIC_YEARS_KEY, academicYears);
    showToast('Academic year added.', 'burst');
    renderAcademicYearTab(document.getElementById('academicYearBody'));
  }

  async function setCurrentAcademicYear(){
    currentAcademicYearValue = document.getElementById('ayCurrentSelect').value;
    await storageSet(CURRENT_AY_KEY, currentAcademicYearValue);
    document.getElementById('ayBadge').textContent = 'AY ' + currentAcademicYearValue;
    showToast('Current academic year updated.', 'burst');
  }

  /* --- Fee Structure --- */
  function renderFeeStructureTab(body){
    const canEditStruct = canSub('managefee_structure','managefee','edit');
    const dis = canEditStruct ? '' : 'disabled';
    const rows = CLASS_LEVELS.map(c => {
      const s = classStruct(c);
      return `
        <tr>
          <td class="name-cell">${c}</td>
          <td><input type="number" min="0" class="input fs-input" data-class="${c}" data-field="admission" value="${s.admission||0}" style="max-width:120px;" ${dis}></td>
          <td><input type="number" min="0" class="input fs-input" data-class="${c}" data-field="fee" value="${s.fee||0}" style="max-width:120px;" ${dis}></td>
          <td><input type="number" min="0" class="input fs-input" data-class="${c}" data-field="bus" value="${s.bus||0}" style="max-width:120px;" ${dis}></td>
          <td><input type="number" min="0" class="input fs-input" data-class="${c}" data-field="stock" value="${s.stock||0}" style="max-width:120px;" ${dis}></td>
        </tr>
      `;
    }).join('');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">
        Set the per-student yearly amount for Admission Fee, Tuition Fee, Bus Fee, and Stock for each class. The Dashboard's Expected totals are computed automatically: Admission Fee applies only to students marked "New Admission"; Tuition Fee &amp; Stock apply to every active student in a class; Bus Fee applies only to students marked as needing transport.
      </p>
      <div class="table-wrap" style="margin-bottom:20px;">
        <table>
          <thead><tr><th>Class</th><th>Admission Fee (₹)</th><th>Tuition Fee (₹)</th><th>Bus Fee (₹)</th><th>Stock (₹)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="profile-card" style="max-width:320px; margin-bottom:20px;">
        <h4>Hostel — Annual Expected Total (₹)</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:10px;">Hostel isn't tracked per-student yet, so this stays a single flat total until the Hostel module exists.</p>
        <input type="number" min="0" class="input" id="fsHostel" value="${financeSettings.hostel||0}" style="width:100%;" ${dis}>
      </div>
      ${canEditStruct ? `<button class="btn btn-primary" onclick="saveFeeStructure()">🏗️ Save Fee Structure</button>` : ''}
      <div id="feeSchedulePanel" style="margin-top:36px;"></div>
    `;
    renderFeeSchedulePanel();
  }

  async function saveFeeStructure(){
    document.querySelectorAll('.fs-input').forEach(inp => {
      const cls = inp.dataset.class, field = inp.dataset.field;
      classFeeStructure[cls] = classFeeStructure[cls] || {};
      classFeeStructure[cls][field] = Number(inp.value) || 0;
    });
    financeSettings.hostel = Number(document.getElementById('fsHostel').value) || 0;
    await storageSet(FEE_STRUCTURE_KEY, classFeeStructure);
    await storageSet(SETTINGS_KEY, financeSettings);
    showToast('Fee structure saved.', 'burst');
    renderDashboard();
  }

  /* --- Promotions --- */
  /* ===== PROMOTION & TRANSFER (individual student-level, incl. double promotion) ===== */
  