const COMMS_MESSAGES_KEY = "comms-messages";
  const ADMISSION_INQUIRIES_KEY = "admission-inquiries";
  const WEBSITE_GALLERY_KEY = "website-gallery";
  const WEBSITE_SYNC_TEST_KEY = "erp-website-sync-test";
  OBJECT_BACKED_KEYS[WEBSITE_SYNC_TEST_KEY] = '/api/kv/' + WEBSITE_SYNC_TEST_KEY;
  let commsMessages = [];
  let admissionInquiries = [];
  let websiteGallery = [];
  const NOTICE_TYPES_KEY = "notice-types";
  OBJECT_BACKED_KEYS[NOTICE_TYPES_KEY] = '/api/kv/' + NOTICE_TYPES_KEY;
  let noticeTypes = [];
  async function loadComms(){
    commsMessages = await storageGet(COMMS_MESSAGES_KEY, []);
    admissionInquiries = await storageGet(ADMISSION_INQUIRIES_KEY, []);
    websiteGallery = await storageGet(WEBSITE_GALLERY_KEY, []);
    noticeTypes = await storageGet(NOTICE_TYPES_KEY, [
      { name:'Announcement', icon:'📣', body:'' },
      { name:'Circular', icon:'📋', body:'' },
      { name:'Holiday Notice', icon:'🎉', body:'Dear Parents/Students,\n\nThis is to inform you that the school will remain closed on [DATE] on account of [REASON].\n\nRegards,\nSchool Administration' },
      { name:'Exam Schedule', icon:'📝', body:'Dear Parents/Students,\n\nPlease find below the schedule for the upcoming exams. Kindly ensure your ward is well-prepared and arrives on time.\n\n[EXAM DETAILS]\n\nRegards,\nSchool Administration' },
      { name:'Fee Reminder', icon:'💰', body:'Dear Parent,\n\nThis is a reminder that a fee amount of {amount} is currently outstanding for {studentName} ({className} - {section}). Kindly clear the dues at the earliest.\n\nRegards,\nSchool Administration' },
    ]);
  }
  function noticeTypeByName(name){
    return noticeTypes.find(t => t.name === name);
  }
  let commsTab = 'compose';
  let commsAudienceScope = 'allstudents';
  let commsAudienceClass = '', commsAudienceSection = '';
  let commsIndividualId = '';
  let commsPreparedRecipients = [];
  const COMMS_TAB_PERM_KEYS = { compose:'comms_compose', log:'comms_log' };
  function initCommsView(){
    const accessibleTabs = Object.keys(COMMS_TAB_PERM_KEYS).filter(t => getCommsTabAccess(currentUser.role, COMMS_TAB_PERM_KEYS[t]));
    Object.keys(COMMS_TAB_PERM_KEYS).forEach(t => {
      const btn = document.getElementById('comtab-'+t);
      if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none';
    });
    if(!accessibleTabs.includes(commsTab)) commsTab = accessibleTabs[0] || 'compose';
    switchCommsTab(commsTab);
  }
  function switchCommsTab(tab){
    commsTab = tab;
    ['compose','log'].forEach(t => {
      const btn = document.getElementById('comtab-'+t);
      if(btn) btn.classList.toggle('active', t===tab);
    });
    renderCommsBody();
  }
  function renderCommsBody(){
    const body = document.getElementById('commsBody');
    if(!body) return;
    if(!getCommsTabAccess(currentUser.role, COMMS_TAB_PERM_KEYS[commsTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(commsTab === 'compose') return renderCommsCompose(body);
    if(commsTab === 'log') return renderCommsLog(body);
  }
  async function refreshAdmissionInquiries(){
    // Re-read from storage each time this view opens, since the website may have
    // saved new inquiries since the ERP last loaded.
    admissionInquiries = await storageGet(ADMISSION_INQUIRIES_KEY, []);
  }
  function initWebsiteInquiriesView(){
    refreshAdmissionInquiries().then(() => renderAdmissionInquiries(document.getElementById('websiteInquiriesBody')));
  }
  function initWebsiteGalleryView(){
    galleryUploadData = '';
    renderWebsiteGallery(document.getElementById('websiteGalleryBody'));
  }
  function initNoticeBoardView(){
    editingNoticeId = '';
    renderNoticeBoard(document.getElementById('noticeBoardBody'));
  }
  function resetContactVendorForm(){
    const subj = document.getElementById('cvSubject');
    const type = document.getElementById('cvType');
    const pri = document.getElementById('cvPriority');
    const msg = document.getElementById('cvMessage');
    if(subj) subj.value = '';
    if(type) type.value = 'support';
    if(pri) pri.value = 'normal';
    if(msg) msg.value = '';
  }
  async function submitContactVendor(){
    const subject = (document.getElementById('cvSubject').value || '').trim();
    const message = (document.getElementById('cvMessage').value || '').trim();
    const type = document.getElementById('cvType').value;
    const priority = document.getElementById('cvPriority').value;
    if(!subject){ showToast('Please enter a subject.'); return; }
    if(!message){ showToast('Please describe your issue or request.'); return; }
    const btn = event && event.target;
    if(btn) btn.disabled = true;
    try{
      await throwIfNotOk(await fetch('/api/contact-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...actorHeaders() },
        body: JSON.stringify({ subject, message, type, priority })
      }));
      showToast('Sent to your vendor — they will respond from their dashboard.', 'burst');
      resetContactVendorForm();
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not send your request. Please try again.');
    }finally{
      if(btn) btn.disabled = false;
    }
  }
  async function generateSyncTestCode(){
    const code = Math.random().toString(36).slice(2,8).toUpperCase();
    await storageSet(WEBSITE_SYNC_TEST_KEY, { code, generatedAt: new Date().toISOString() });
    const display = document.getElementById('syncTestCodeDisplay');
    if(display) display.textContent = `Code: ${code} — now open the website in this same browser and check the bottom-right corner`;
  }
  function renderNbAudienceFields(){
    const wrap = document.getElementById('nbAudienceFields');
    if(!wrap) return;
    if(nbAudienceScope === 'class' || nbAudienceScope === 'section'){
      wrap.innerHTML = `
        <div class="form-grid">
          <div class="f-field"><label>Class</label><select id="nbClassSel" onchange="nbAudienceClass=this.value;"><option value="">Select class</option>${CLASS_LEVELS.map(c => `<option ${c===nbAudienceClass?'selected':''}>${c}</option>`).join('')}</select></div>
          ${nbAudienceScope==='section' ? `<div class="f-field"><label>Section</label><select id="nbSectionSel" onchange="nbAudienceSection=this.value;"><option value="">Select section</option>${SECTIONS.map(s => `<option ${s===nbAudienceSection?'selected':''}>${s}</option>`).join('')}</select></div>` : ''}
        </div>
      `;
    }else{
      wrap.innerHTML = '';
    }
  }
  function onNbTypeChange(){
    const newField = document.getElementById('nbNewTypeField');
    if(newField) newField.style.display = document.getElementById('nbType').value === '__new__' ? 'block' : 'none';
  }
  async function addNoticeTypeDirect(){
    const input = document.getElementById('newNoticeTypeName');
    const name = input.value.trim();
    if(!name){ showToast('Enter a heading name.'); return; }
    if(noticeTypeByName(name)){ showToast('That heading already exists.'); return; }
    noticeTypes.push({ name, icon:'📣', body:'' });
    await storageSet(NOTICE_TYPES_KEY, noticeTypes);
    renderNoticeBoard(document.getElementById('noticeBoardBody'));
    showToast('Heading added.', 'burst');
  }
  async function removeNoticeType(idx){
    const t = noticeTypes[idx];
    if(!t) return;
    const inUse = commsMessages.some(m => m.type === t.name);
    if(inUse){ showToast(`Can't remove — "${t.name}" is used on existing notices.`); return; }
    if(!await showConfirmDialog(`Remove the "${t.name}" heading?`)) return;
    noticeTypes.splice(idx,1);
    await storageSet(NOTICE_TYPES_KEY, noticeTypes);
    renderNoticeBoard(document.getElementById('noticeBoardBody'));
  }
  // Optional "Read more" link shown on the public website. Only http(s) links
  // are kept; anything else is rejected so a notice can never carry a script URL.
  function cleanNoticeLink(raw){
    const v = String(raw || '').trim();
    if(!v) return { ok:true, value:'' };
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
    try{
      const u = new URL(withScheme);
      if(u.protocol !== 'https:' && u.protocol !== 'http:') return { ok:false };
      return { ok:true, value:u.href.slice(0, 500) };
    }catch(e){ return { ok:false }; }
  }

  /* --- Compose --- */
  function renderCommsCompose(body){
    commsPreparedRecipients = [];
    body.innerHTML = `
      <div class="profile-card" style="max-width:680px;">
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field full">
            <label>Message Type / Heading</label>
            <select id="commsType" onchange="onCommsTypeChange()">
              ${noticeTypes.map(t => `<option value="${t.name}">${t.icon} ${t.name}</option>`).join('')}
              <option value="__new__">+ New Heading...</option>
            </select>
          </div>
          <div class="f-field full" id="commsNewTypeField" style="display:none;"><label>New Heading Name</label><input type="text" id="commsNewTypeName" placeholder="e.g. Sports Day Update"></div>
          <div class="f-field full"><label>Title <span class="required-star">*</span></label><input type="text" id="commsTitle" placeholder="e.g. Diwali Holidays Announcement"></div>
          <div class="f-field full"><label>Message <span class="required-star">*</span></label><textarea id="commsBodyText" rows="6" placeholder="Type your message..."></textarea></div>
        </div>

        <h4 style="margin-bottom:10px;">Audience</h4>
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="f-field full">
            <select id="commsAudienceScope" onchange="commsAudienceScope=this.value; renderCommsAudienceFields();">
              <option value="allstudents" ${commsAudienceScope==='allstudents'?'selected':''}>All Students (Parents)</option>
              <option value="allstaff" ${commsAudienceScope==='allstaff'?'selected':''}>All Staff</option>
              <option value="class" ${commsAudienceScope==='class'?'selected':''}>Specific Class</option>
              <option value="section" ${commsAudienceScope==='section'?'selected':''}>Specific Class &amp; Section</option>
              <option value="defaulters" ${commsAudienceScope==='defaulters'?'selected':''}>Fee Defaulters (auto)</option>
              <option value="individual" ${commsAudienceScope==='individual'?'selected':''}>Individual Student</option>
            </select>
          </div>
        </div>
        <div id="commsAudienceFields"></div>

        <h4 style="margin:16px 0 10px;">Send Via</h4>
        <div style="display:flex; gap:20px; margin-bottom:16px;">
          <label class="admission-toggle"><input type="checkbox" id="commsChannelInApp" checked> 📌 In-App Notice Board</label>
          <label class="admission-toggle"><input type="checkbox" id="commsChannelWhatsApp"> 💬 WhatsApp</label>
        </div>

        <button class="btn btn-primary" onclick="prepareCommsRecipients()">Prepare &amp; Preview Recipients</button>
        <div id="commsRecipientsPreview" style="margin-top:16px;"></div>
      </div>
    `;
    renderCommsAudienceFields();
  }
  function onCommsTypeChange(){
    const typeVal = document.getElementById('commsType').value;
    const newField = document.getElementById('commsNewTypeField');
    if(typeVal === '__new__'){
      newField.style.display = 'block';
      document.getElementById('commsBodyText').value = '';
      return;
    }
    newField.style.display = 'none';
    const def = noticeTypeByName(typeVal);
    document.getElementById('commsBodyText').value = def ? def.body : '';
    if(typeVal === 'Fee Reminder'){
      commsAudienceScope = 'defaulters';
      document.getElementById('commsAudienceScope').value = 'defaulters';
      renderCommsAudienceFields();
    }
  }
  async function resolveCommsType(selectId, newNameId){
    const typeVal = document.getElementById(selectId).value;
    if(typeVal !== '__new__') return typeVal;
    const newName = document.getElementById(newNameId).value.trim();
    if(!newName) return null;
    if(!noticeTypeByName(newName)){
      noticeTypes.push({ name:newName, icon:'📣', body:'' });
      await storageSet(NOTICE_TYPES_KEY, noticeTypes);
    }
    return newName;
  }
  function renderCommsAudienceFields(){
    const wrap = document.getElementById('commsAudienceFields');
    if(!wrap) return;
    if(commsAudienceScope === 'class' || commsAudienceScope === 'section'){
      wrap.innerHTML = `
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="f-field"><label>Class</label><select id="commsClassSel" onchange="commsAudienceClass=this.value;"><option value="">Select class</option>${CLASS_LEVELS.map(c => `<option ${c===commsAudienceClass?'selected':''}>${c}</option>`).join('')}</select></div>
          ${commsAudienceScope==='section' ? `<div class="f-field"><label>Section</label><select id="commsSectionSel" onchange="commsAudienceSection=this.value;"><option value="">Select section</option>${SECTIONS.map(s => `<option ${s===commsAudienceSection?'selected':''}>${s}</option>`).join('')}</select></div>` : ''}
        </div>
      `;
    }else if(commsAudienceScope === 'individual'){
      wrap.innerHTML = `
        <div class="f-field full" style="margin-bottom:10px;">
          <div class="search-wrap">
            <input class="input" id="commsIndividualSearch" placeholder="Search student by name..." autocomplete="off" oninput="onCommsIndividualInput()" onblur="setTimeout(hideCommsIndividualSuggestions,150)" onfocus="onCommsIndividualInput()">
            <div class="search-suggestions" id="commsIndividualSuggestions"></div>
          </div>
          ${commsIndividualId ? `<span class="pill" style="margin-top:8px; display:inline-block;">${(students.find(s=>s.id===commsIndividualId)||{}).firstName||''} ${(students.find(s=>s.id===commsIndividualId)||{}).lastName||''} <button onclick="commsIndividualId=''; renderCommsAudienceFields();" style="background:none; border:none; color:var(--magenta); font-weight:700; cursor:pointer;">&times;</button></span>` : ''}
        </div>
      `;
    }else if(commsAudienceScope === 'defaulters'){
      wrap.innerHTML = `<p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">Automatically targets every student currently showing an outstanding fee balance, with their specific due amount inserted into the message.</p>`;
    }else{
      wrap.innerHTML = '';
    }
  }
  let commsIndividualSearchDebounce = null;
  function onCommsIndividualInput(){
    clearTimeout(commsIndividualSearchDebounce);
    commsIndividualSearchDebounce = setTimeout(() => renderCommsIndividualSuggestions(document.getElementById('commsIndividualSearch').value.trim()), 150);
  }
  function renderCommsIndividualSuggestions(q){
    const box = document.getElementById('commsIndividualSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => isActive(s) && ((s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql))).slice(0,8);
    box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="commsIndividualId='${s.id}'; hideCommsIndividualSuggestions(); renderCommsAudienceFields();">
      <div class="sg-avatar">${initials(s)}</div>
      <div><div class="sg-name">${s.firstName} ${s.lastName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('') : `<div class="sg-empty">No students match "${q}"</div>`;
    box.classList.add('open');
  }
  function hideCommsIndividualSuggestions(){
    const box = document.getElementById('commsIndividualSuggestions');
    if(box) box.classList.remove('open');
  }
  function commsAudienceTargets(){
    if(commsAudienceScope === 'allstudents') return students.filter(isActive).map(s => ({ kind:'student', student:s }));
    if(commsAudienceScope === 'allstaff') return staffList.filter(staffIsActive).map(st => ({ kind:'staff', staff:st }));
    if(commsAudienceScope === 'class'){
      if(!commsAudienceClass) return [];
      return students.filter(s => isActive(s) && s.className===commsAudienceClass).map(s => ({ kind:'student', student:s }));
    }
    if(commsAudienceScope === 'section'){
      if(!commsAudienceClass || !commsAudienceSection) return [];
      return students.filter(s => isActive(s) && s.className===commsAudienceClass && s.section===commsAudienceSection).map(s => ({ kind:'student', student:s }));
    }
    if(commsAudienceScope === 'individual'){
      if(!commsIndividualId) return [];
      const s = students.find(x => x.id===commsIndividualId);
      return s ? [{ kind:'student', student:s }] : [];
    }
    if(commsAudienceScope === 'defaulters'){
      return computeDefaulters().map(d => ({ kind:'student', student:d.student, dueAmount:d.total }));
    }
    return [];
  }
  function commsPersonalize(template, target){
    let msg = template;
    if(target.kind === 'student'){
      const s = target.student;
      msg = msg.replace(/\{studentName\}/g, s.firstName+' '+s.lastName)
                .replace(/\{className\}/g, s.className||'')
                .replace(/\{section\}/g, s.section||'')
                .replace(/\{amount\}/g, target.dueAmount!==undefined ? fmtMoney(target.dueAmount) : '');
    }
    return msg;
  }
  function commsTargetPhone(target){
    if(target.kind === 'student'){
      const s = target.student;
      return s.fatherPhone || s.motherPhone || s.guardianPhone || '';
    }
    return target.staff.phone || '';
  }
  function commsTargetName(target){
    return target.kind==='student' ? target.student.firstName+' '+target.student.lastName : target.staff.firstName+' '+target.staff.lastName;
  }
  async function prepareCommsRecipients(){
    // The "defaulters" audience scope needs `payments` (via
    // computeDefaulters) — only load it, no need to block every other scope.
    if(commsAudienceScope === 'defaulters') await ensureDataLoaded('payments', loadPaymentsData);
    const title = document.getElementById('commsTitle').value.trim();
    const bodyText = document.getElementById('commsBodyText').value.trim();
    const inApp = document.getElementById('commsChannelInApp').checked;
    const whatsapp = document.getElementById('commsChannelWhatsApp').checked;
    if(!title){ showToast('Enter a title.'); return; }
    if(!bodyText){ showToast('Enter a message.'); return; }
    if(!inApp && !whatsapp){ showToast('Select at least one channel.'); return; }
    const targets = commsAudienceTargets();
    if(targets.length === 0){ showToast('No recipients match this audience.'); return; }
    commsPreparedRecipients = targets;
    const withPhone = targets.filter(t => commsTargetPhone(t));
    const preview = document.getElementById('commsRecipientsPreview');
    preview.innerHTML = `
      <div class="profile-card" style="background:rgba(24,143,134,0.06); border-left:4px solid var(--teal);">
        <p style="font-size:0.85rem; margin-bottom:10px;"><b>${targets.length}</b> recipient${targets.length===1?'':'s'} matched${whatsapp?` · <b>${withPhone.length}</b> have a phone number on file for WhatsApp`:''}.</p>
        ${canSub('comms_compose','announcements','create') ? `<button class="btn btn-primary" onclick="sendCommsMessage()">Send Now</button>` : ''}
      </div>
    `;
  }
  async function sendCommsMessage(){
    const typeName = await resolveCommsType('commsType', 'commsNewTypeName');
    if(!typeName){ showToast('Enter a name for the new heading.'); return; }
    const title = document.getElementById('commsTitle').value.trim();
    const bodyText = document.getElementById('commsBodyText').value.trim();
    const inApp = document.getElementById('commsChannelInApp').checked;
    const whatsapp = document.getElementById('commsChannelWhatsApp').checked;
    const targets = commsPreparedRecipients;
    const channels = [inApp?'In-App':null, whatsapp?'WhatsApp':null].filter(Boolean);
    const audienceLabels = { allstudents:'All Students', allstaff:'All Staff', class:`${commsAudienceClass} (Whole Class)`, section:`${commsAudienceClass} — Section ${commsAudienceSection}`, defaulters:'Fee Defaulters', individual:'Individual Student' };
    const record = {
      id:'msg_'+Date.now(), type:typeName, title, body:bodyText, audienceLabel:audienceLabels[commsAudienceScope]||commsAudienceScope,
      audienceScope: commsAudienceScope, audienceClass: commsAudienceClass, audienceSection: commsAudienceSection, individualId: commsIndividualId,
      channels, toWebsite:false, recipientCount:targets.length, sentBy:currentUser.name, sentDate:new Date().toISOString().slice(0,10),
    };
    commsMessages.push(record);
    await storageSet(COMMS_MESSAGES_KEY, commsMessages);
    if(inApp){
      const studentIds = targets.filter(t => t.kind==='student').map(t => t.student.id);
      const staffIds = targets.filter(t => t.kind==='staff').map(t => t.staff.id);
      if(studentIds.length || staffIds.length){
        fetch('/api/notifications/broadcast', {
          method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()},
          body: JSON.stringify({ title, body:bodyText, type:'circular', url:'/?view=myprofile', studentIds, staffIds }),
        }).catch(err => console.error('notification broadcast failed:', err));
      }
    }
    if(whatsapp){
      renderCommsWhatsAppQueue(record, targets, bodyText);
    }else{
      showToast(`${channels.join(' + ')} message sent to ${targets.length} recipient(s).`);
      if(inApp){ switchView('noticeboard'); } else { switchCommsTab('log'); }
    }
  }
  function renderCommsWhatsAppQueue(record, targets, template){
    const withPhone = targets.filter(t => commsTargetPhone(t));
    const preview = document.getElementById('commsRecipientsPreview');
    preview.innerHTML = `
      <div class="profile-card">
        <h4>💬 Send via WhatsApp</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:8px 0 14px;">WhatsApp doesn't allow apps to auto-send messages without your confirmation — click each recipient below to open a pre-filled WhatsApp chat, then hit Send inside WhatsApp. ${withPhone.length} of ${targets.length} recipients have a phone number on file.</p>
        <div class="table-wrap">
          <table><thead><tr><th>Name</th><th>Phone</th><th></th></tr></thead>
          <tbody>
          ${withPhone.length ? withPhone.map((t,i) => {
            const phone = commsTargetPhone(t).replace(/\D/g,'');
            const msg = commsPersonalize(template, t);
            const waLink = `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
            return `<tr><td class="name-cell">${commsTargetName(t)}</td><td>${commsTargetPhone(t)}</td><td><a href="${waLink}" target="_blank" class="btn-edit-text">Open WhatsApp</a></td></tr>`;
          }).join('') : `<tr><td colspan="3"><div class="empty-state"><b>No phone numbers on file</b></div></td></tr>`}
          </tbody></table>
        </div>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin-top:12px;">This message has also been logged${record.channels.includes('In-App')?' and posted to the Notice Board':''}.</p>
      </div>
    `;
  }

  /* --- Notice Board: In-App notices --- */
  let editingNoticeId = '';
  let nbAudienceScope = 'allstudents', nbAudienceClass = '', nbAudienceSection = '';
  function editNotice(id){
    editingNoticeId = id;
    renderNoticeBoard(document.getElementById('noticeBoardBody'));
  }
  function cancelNoticeEdit(){
    editingNoticeId = '';
    renderNoticeBoard(document.getElementById('noticeBoardBody'));
  }
  async function deleteNotice(id){
    if(!await showConfirmDialog('Take this notice down from the website\'s notice board? It stays in the Message Log for your records.')) return;
    const n = commsMessages.find(m => m.id === id);
    if(!n) return;
    n.boardRemoved = true;
    await storageSet(COMMS_MESSAGES_KEY, commsMessages);
    renderNoticeBoard(document.getElementById('noticeBoardBody'));
    showToast('Notice taken down.', 'burst');
  }

  /* --- Message Log: everything sent, all channels --- */
  /* --- Website Inquiries: admission forms submitted by visitors on the public site --- */
  async function setInquiryStatus(id, status){
    const q = admissionInquiries.find(x => x.id === id);
    if(!q) return;
    q.status = status;
    await storageSet(ADMISSION_INQUIRIES_KEY, admissionInquiries);
    showToast('Status updated.', 'burst');
  }
  function convertInquiryToStudent(id){
    const q = admissionInquiries.find(x => x.id === id);
    if(!q) return;
    switchView('admissions');
    openWizard();
    const parts = (q.studentName||'').trim().split(/\s+/);
    document.getElementById('fFirstName').value = parts[0] || '';
    document.getElementById('fLastName').value = parts.slice(1).join(' ') || '';
    if(q.applyingGrade){
      const classSel = document.getElementById('fClass');
      if(Array.from(classSel.options).some(o => o.value === q.applyingGrade)) classSel.value = q.applyingGrade;
    }
    showToast('Pre-filled from the website inquiry — complete the remaining details.');
  }

  /* --- Website Gallery: photos shown on the public site's Gallery section --- */
  const GALLERY_CATEGORIES = { campus:'Campus', event:'Events & Celebrations', trip:'Educational Trips', achieve:'Achievements & Results' };
  let galleryUploadData = '';
  function onGalleryPhotoSelected(e){
    // Resized/compressed (not the raw upload) — see readAndCompressImage's
    // comment for why: this photo goes straight onto the public website.
    readAndCompressImage(e, dataUrl => {
      galleryUploadData = dataUrl;
      renderWebsiteGallery(document.getElementById('websiteGalleryBody'));
    });
  }
  async function saveGalleryPhoto(){
    if(!galleryUploadData){ showToast('Choose a photo first.'); return; }
    const category = document.getElementById('galleryCatSelect').value;
    const caption = document.getElementById('galleryCaption').value.trim();
    if(!caption){ showToast('Enter a caption.'); return; }
    websiteGallery.push({ id:'gal_'+Date.now(), dataUrl:galleryUploadData, category, caption, uploadedDate:new Date().toISOString().slice(0,10), uploadedBy:currentUser.name });
    await storageSet(WEBSITE_GALLERY_KEY, websiteGallery);
    galleryUploadData = '';
    renderWebsiteGallery(document.getElementById('websiteGalleryBody'));
    showToast('Photo added to website gallery.', 'burst');
  }
  async function deleteGalleryPhoto(id){
    if(!await showConfirmDialog('Remove this photo from the website gallery?')) return;
    websiteGallery = websiteGallery.filter(g => g.id !== id);
    await storageSet(WEBSITE_GALLERY_KEY, websiteGallery);
    renderWebsiteGallery(document.getElementById('websiteGalleryBody'));
  }

  const ACCT_TAB_PERM_KEYS = { overview:'accounting_overview', income:'accounting_income', expense:'accounting_expenses', segments:'accounting_segments', categories:'accounting_categories', chartofaccounts:'accounting_chartofaccounts', journal:'accounting_journal', bank:'accounting_bank', assets:'accounting_assets', budget:'accounting_budget' };
  const ACCT_TABS = ['overview','income','expense','segments','categories','chartofaccounts','journal','bank','assets','budget'];
  async function initAccountingView(){
    // The Accounting module's own transactions/ledger, PLUS `payments` (fee
    // income is read directly in the Overview tab, feePaymentCostCenter,
    // acctFeeIncomeTotal etc.) — a real cross-module dependency even though
    // Accounting is otherwise self-contained.
    await Promise.all([
      ensureDataLoaded('acctTransactions', loadAcctTransactionsData),
      ensureDataLoaded('acctLedger', loadAccountingLedgerData),
      ensureDataLoaded('payments', loadPaymentsData),
    ]);
    const accessibleTabs = ACCT_TABS.filter(t => getAccountingTabAccess(currentUser.role, ACCT_TAB_PERM_KEYS[t]));
    ACCT_TABS.forEach(t => {
      const btn = document.getElementById('acttab-'+t);
      if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none';
    });
    // Daily Collections is a hard Admin-only report (cash-handover tool) — it
    // deliberately bypasses the configurable per-role accounting permissions
    // above, since it's meant to be visible to Admin alone, full stop.
    const dcBtn = document.getElementById('acttab-dailycollections');
    const isAdminUser = currentUser.role === 'Admin';
    if(dcBtn) dcBtn.style.display = isAdminUser ? '' : 'none';
    if(accountingTab === 'dailycollections' && !isAdminUser){
      accountingTab = accessibleTabs[0] || 'overview';
    }
    if(!accessibleTabs.includes(accountingTab) && accountingTab !== 'dailycollections'){
      accountingTab = accessibleTabs[0] || 'overview';
    }
    switchAccountingTab(accountingTab);
  }
  function switchAccountingTab(tab){
    accountingTab = tab;
    ACCT_TABS.forEach(t => document.getElementById('acttab-'+t).classList.toggle('active', t===tab));
    const dcBtn = document.getElementById('acttab-dailycollections');
    if(dcBtn) dcBtn.classList.toggle('active', tab==='dailycollections');
    renderAccountingBody();
  }
  async function renderAccountingBody(){
    await Promise.all([
      ensureDataLoaded('acctTransactions', loadAcctTransactionsData),
      ensureDataLoaded('acctLedger', loadAccountingLedgerData),
      ensureDataLoaded('payments', loadPaymentsData),
    ]);
    const body = document.getElementById('accountingBody');
    if(!body) return;
    if(accountingTab === 'dailycollections'){
      if(currentUser.role !== 'Admin'){
        body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
        return;
      }
      await ensureDataLoaded('inventorySales', loadInventory);
      return renderAcctDailyCollectionsTab(body);
    }
    if(!getAccountingTabAccess(currentUser.role, ACCT_TAB_PERM_KEYS[accountingTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(accountingTab === 'overview') return renderAcctOverview(body);
    if(accountingTab === 'income') return renderAcctIncomeTab(body);
    if(accountingTab === 'expense') return renderAcctExpenseTab(body);
    if(accountingTab === 'segments') return renderAcctSegmentsTab(body);
    if(accountingTab === 'categories') return renderAcctCategoriesTab(body);
    if(accountingTab === 'chartofaccounts') return renderAcctChartTab(body);
    if(accountingTab === 'journal') return renderAcctJournalTab(body);
    if(accountingTab === 'bank') return renderAcctBankTab(body);
    if(accountingTab === 'assets') return renderAcctAssetsTab(body);
    if(accountingTab === 'budget') return renderAcctBudgetTab(body);
  }

  /* --- Overview: cash position + recent activity ---
     A voided voucher is excluded everywhere here (it didn't really happen
     financially) but stays visible, struck through, on its own Income/
     Expense tab — that's the audit trail; it just shouldn't move any total. */

  /* --- Daily Collections: Admin-only cash-handover reconciliation — "how much
     did we collect today, by every mode, across every source" — pulls from
     fee/extra-fee payments, other Income vouchers, AND inventory sales to
     non-Student buyers (Staff/Walk-in), since those never create a `payments`
     row of their own. Gated to currentUser.role==='Admin' in renderAccountingBody,
     deliberately bypassing the configurable per-role accounting permissions. */

  /* --- Income vouchers (non-fee income: donations, grants, etc.) --- */
  let acctIncomeSearch = '';
  function onAcctCategoryChange(selectId, newFieldInputId){
    const sel = document.getElementById(selectId);
    const wrap = document.getElementById(newFieldInputId+'Field');
    if(wrap) wrap.style.display = sel.value === '__new__' ? 'block' : 'none';
  }
  function onAcctModeChange(selectId, refFieldId){
    const sel = document.getElementById(selectId);
    const wrap = document.getElementById(refFieldId);
    if(wrap) wrap.style.display = (sel.value === 'Cheque' || sel.value === 'Bank Transfer' || sel.value === 'UPI' || sel.value === 'Online') ? 'block' : 'none';
  }
  async function saveIncomeVoucher(){
    const date = document.getElementById('acctIncDate').value;
    const amount = Number(document.getElementById('acctIncAmount').value) || 0;
    let category = document.getElementById('acctIncCategory').value;
    if(category === '__new__'){
      category = document.getElementById('acctIncNewCategory').value.trim();
      if(!category){ showToast('Enter the new category name.'); return; }
      if(!acctIncomeCategories.includes(category)){
        acctIncomeCategories.push(category);
        await storageSet(ACCT_INCOME_CATS_KEY, acctIncomeCategories);
      }
    }
    const costCenter = document.getElementById('acctIncCostCenter').value;
    const party = document.getElementById('acctIncParty').value.trim();
    const mode = document.getElementById('acctIncMode').value;
    const referenceNo = document.getElementById('acctIncRef') ? document.getElementById('acctIncRef').value.trim() : '';
    const bankAccountId = document.getElementById('acctIncBankAccount').value;
    const description = document.getElementById('acctIncDesc').value.trim();
    if(!date){ showToast('Set a date.'); return; }
    if(amount <= 0){ showToast('Enter an amount.'); return; }
    let voucherNo;
    try{
      voucherNo = await issueDocNumber('income_voucher');
    }catch(e){
      showToast("Could not get a voucher number from the server (" + e.message + ") — not saved. Try again once you're back online.");
      return;
    }
    acctIncome.push({ id:'inc_'+Date.now(), voucherNo, date, category, costCenter, amount, party, mode, referenceNo, bankAccountId, description, addedBy:currentUser.name, voided:false });
    await storageSet(ACCT_INCOME_KEY, acctIncome);
    renderDashboard();
    renderAcctIncomeTab(document.getElementById('accountingBody'));
    showToast('Income voucher ' + voucherNo + ' saved.');
  }

  /* --- Expense vouchers --- */
  let acctExpenseSearch = '';
  async function saveExpenseVoucher(){
    const date = document.getElementById('acctExpDate').value;
    const amount = Number(document.getElementById('acctExpAmount').value) || 0;
    let category = document.getElementById('acctExpCategory').value;
    if(category === '__new__'){
      category = document.getElementById('acctExpNewCategory').value.trim();
      if(!category){ showToast('Enter the new category name.'); return; }
      if(!acctExpenseCategories.includes(category)){
        acctExpenseCategories.push(category);
        await storageSet(ACCT_EXPENSE_CATS_KEY, acctExpenseCategories);
      }
    }
    const costCenter = document.getElementById('acctExpCostCenter').value;
    const party = document.getElementById('acctExpParty').value.trim();
    const mode = document.getElementById('acctExpMode').value;
    const referenceNo = document.getElementById('acctExpRef') ? document.getElementById('acctExpRef').value.trim() : '';
    const bankAccountId = document.getElementById('acctExpBankAccount').value;
    const description = document.getElementById('acctExpDesc').value.trim();
    if(!date){ showToast('Set a date.'); return; }
    if(amount <= 0){ showToast('Enter an amount.'); return; }
    let voucherNo;
    try{
      voucherNo = await issueDocNumber('payment_voucher');
    }catch(e){
      showToast("Could not get a voucher number from the server (" + e.message + ") — not saved. Try again once you're back online.");
      return;
    }
    acctExpenses.push({ id:'exp_'+Date.now(), voucherNo, date, category, costCenter, amount, party, mode, referenceNo, bankAccountId, description, addedBy:currentUser.name, voided:false });
    await storageSet(ACCT_EXPENSES_KEY, acctExpenses);
    renderDashboard();
    renderAcctExpenseTab(document.getElementById('accountingBody'));
    showToast('Expense voucher ' + voucherNo + ' saved.');
  }

  /* --- Categories management --- */
  async function addAcctCategory(type){
    const inputId = type==='expense' ? 'acctNewExpCat' : 'acctNewIncCat';
    const name = document.getElementById(inputId).value.trim();
    if(!name){ showToast('Enter a category name.'); return; }
    if(type==='expense'){
      if(acctExpenseCategories.includes(name)){ showToast('That category already exists.'); return; }
      acctExpenseCategories.push(name);
      await storageSet(ACCT_EXPENSE_CATS_KEY, acctExpenseCategories);
    }else{
      if(acctIncomeCategories.includes(name)){ showToast('That category already exists.'); return; }
      acctIncomeCategories.push(name);
      await storageSet(ACCT_INCOME_CATS_KEY, acctIncomeCategories);
    }
    renderAcctCategoriesTab(document.getElementById('accountingBody'));
  }
  async function removeAcctCategory(type, idx){
    if(type==='expense'){
      const cat = acctExpenseCategories[idx];
      const inUse = acctExpenses.some(e => e.category===cat);
      if(inUse){ showToast(`Can't remove — "${cat}" is used on existing expense vouchers.`); return; }
      acctExpenseCategories.splice(idx,1);
      await storageSet(ACCT_EXPENSE_CATS_KEY, acctExpenseCategories);
    }else{
      const cat = acctIncomeCategories[idx];
      const inUse = acctIncome.some(i => i.category===cat);
      if(inUse){ showToast(`Can't remove — "${cat}" is used on existing income vouchers.`); return; }
      acctIncomeCategories.splice(idx,1);
      await storageSet(ACCT_INCOME_CATS_KEY, acctIncomeCategories);
    }
    renderAcctCategoriesTab(document.getElementById('accountingBody'));
  }
  async function addAcctCostCenter(){
    const name = document.getElementById('acctNewCostCenter').value.trim();
    if(!name){ showToast('Enter an account name.'); return; }
    if(acctCostCenters.includes(name)){ showToast('That account already exists.'); return; }
    acctCostCenters.push(name);
    await storageSet(ACCT_COST_CENTERS_KEY, acctCostCenters);
    renderAcctCategoriesTab(document.getElementById('accountingBody'));
  }
  async function removeAcctCostCenter(idx){
    const cc = acctCostCenters[idx];
    const inUse = acctIncome.some(i => i.costCenter===cc) || acctExpenses.some(e => e.costCenter===cc);
    if(inUse){ showToast(`Can't remove — "${cc}" is used on existing vouchers.`); return; }
    acctCostCenters.splice(idx,1);
    await storageSet(ACCT_COST_CENTERS_KEY, acctCostCenters);
    renderAcctCategoriesTab(document.getElementById('accountingBody'));
  }

  /* --- P&L by Account --- */

  /* --- Print & Void --- */
  function printAccountingVoucher(type, id){
    const list = type === 'income' ? acctIncome : acctExpenses;
    const v = list.find(x => x.id === id);
    if(!v) return;
    const title = type === 'income' ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER';
    const partyLabel = type === 'income' ? 'Received From' : 'Paid To';
    const amountWords = 'Rupees ' + numberToWordsIndian(Math.round(Number(v.amount)||0)) + ' Only';
    // Same source every other print in this app uses for the school badge —
    // the sidebar's own logo <img>, not schoolInfo.logo. If this still shows
    // no name/address, it's not a print bug: Setup → School Profile hasn't
    // been saved on this install yet, and every print in the app (including
    // fee receipts) reads that exact same schoolInfo — filling it in there
    // fixes it everywhere at once, this voucher included.
    const logoSrc = document.querySelector('.sb-brand img').src;
    // Same compact block size/typography as the Fee Receipt print (that's
    // the "page setup" being matched — small enough that two would sit
    // side by side on one A4 sheet), just a single copy: unlike a fee
    // receipt this voucher isn't handed to anyone else, so there's no
    // second "Student/Parent Copy" to print — one copy is filed as-is.
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>${v.voucherNo}</title>
      <style>
        @page{ size:A4; margin:6mm; }
        body{ font-family:Arial,Helvetica,sans-serif; margin:0; color:#111; }
        /* Full page width, sized (padding/font/spacing) to sit in roughly
           the top half of an A4 sheet — half the page, not a quarter of it,
           and not a full page either, since this is one filing copy, not
           two side-by-side "who gets which copy" halves like the receipt. */
        .rcpt-copy{ width:100%; box-sizing:border-box; padding:10mm; display:flex; flex-direction:column; border:1px solid #333; }
        .rcpt-head{ display:flex; align-items:center; gap:10px; justify-content:center; margin-bottom:8px; }
        .rcpt-logo{ width:44px; height:44px; border-radius:50%; }
        .rcpt-head-text{ text-align:center; }
        .rcpt-school{ font-weight:700; font-size:17px; }
        .rcpt-addr{ font-size:11px; }
        .rcpt-title{ text-align:center; font-weight:700; font-size:13px; border-top:1px solid #333; border-bottom:1px solid #333; padding:5px 0; margin-bottom:10px; letter-spacing:0.5px; }
        .rcpt-row2col{ display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:5px; }
        .rcpt-line{ font-size:11.5px; margin-bottom:5px; }
        .rcpt-table{ width:100%; border-collapse:collapse; font-size:11.5px; margin-top:10px; }
        .rcpt-table td{ border:1px solid #999; padding:7px; }
        .rcpt-sign{ display:flex; justify-content:space-between; margin-top:60px; font-size:11.5px; font-weight:600; }
        .rcpt-sign-block{ width:42%; text-align:center; border-top:1px solid #333; padding-top:5px; }
        .rcpt-note{ font-size:9.5px; margin-top:16px; padding-top:8px; border-top:1px dashed #ccc; font-style:italic; text-align:center; }
        ${v.voided ? '.watermark{ position:absolute; top:35%; left:8%; font-size:2.6rem; color:rgba(200,0,0,0.25); transform:rotate(-25deg); font-weight:800; pointer-events:none; }' : ''}
      </style></head>
      <body onload="window.print()">
        <div class="rcpt-copy" style="position:relative;">
          ${v.voided ? '<div class="watermark">VOID</div>' : ''}
          <div class="rcpt-head">
            <img src="${logoSrc}" class="rcpt-logo">
            <div class="rcpt-head-text">
              <div class="rcpt-school">${schoolInfo.name || 'School Name'}</div>
              <div class="rcpt-addr">${schoolInfo.address || ''}</div>
              <div class="rcpt-addr">${schoolInfo.phone || ''}</div>
            </div>
          </div>
          <div class="rcpt-title">${title}</div>
          <div class="rcpt-row2col">
            <span>Voucher No:&nbsp; <b>${v.voucherNo}</b></span>
            <span>Date: <b>${v.date}</b></span>
          </div>
          <div class="rcpt-line">${partyLabel}&nbsp; :&nbsp; <b>${v.party || '—'}</b></div>
          <table class="rcpt-table">
            <tr><td style="width:65%;"><b>Particulars</b></td><td><b>Amount (₹)</b></td></tr>
            <tr><td>${v.category}${v.description ? ' — ' + v.description : ''}<br><span style="font-size:10px; color:#666;">Account: ${v.costCenter || '—'}</span></td><td>${fmtMoney(v.amount)}</td></tr>
          </table>
          <div class="rcpt-line" style="margin-top:6px;">Amount in Words:&nbsp; ${amountWords}</div>
          <div class="rcpt-line">Payment Mode:&nbsp; ${v.mode}${v.referenceNo ? ' (Ref: ' + v.referenceNo + ')' : ''}</div>
          ${v.voided ? `<div class="rcpt-line" style="color:#b00; margin-top:6px;"><b>VOIDED${v.voidedBy?' by '+v.voidedBy:''}${v.voidedAt?' on '+new Date(v.voidedAt).toLocaleDateString():''}:</b> ${v.voidReason || ''}</div>` : ''}
          <div class="rcpt-sign">
            <div class="rcpt-sign-block">Accounts Head</div>
            <div class="rcpt-sign-block">Receiver</div>
          </div>
          <div class="rcpt-note">System-generated voucher — for internal accounting records.</div>
        </div>
      </body></html>
    `);
    w.document.close();
  }
  async function voidAccountingEntry(type, id){
    const list = type === 'income' ? acctIncome : acctExpenses;
    const v = list.find(x => x.id === id);
    if(!v || v.voided) return;
    const reason = await showPromptDialog(`Void voucher ${v.voucherNo}?\n\nEnter a reason (this voucher stays visible, struck through, for audit — it will not be edited or deleted):`, { title:'Void voucher', okText:'Void', placeholder:'Reason for voiding' });
    if(reason === null) return;
    if(!reason.trim()){ showToast('A reason is required to void a voucher.'); return; }
    v.voided = true;
    v.voidReason = reason.trim();
    v.voidedBy = currentUser.name;
    v.voidedAt = new Date().toISOString();
    if(type === 'income'){
      await storageSet(ACCT_INCOME_KEY, acctIncome);
      renderAcctIncomeTab(document.getElementById('accountingBody'));
    }else{
      await storageSet(ACCT_EXPENSES_KEY, acctExpenses);
      renderAcctExpenseTab(document.getElementById('accountingBody'));
    }
    renderDashboard();
    showToast('Voucher ' + v.voucherNo + ' voided.');
  }

  /* ===== Chart of Accounts tab ===== */
  async function saveAcctOtherLedger(){
    const name = document.getElementById('acctOLName').value.trim();
    const type = document.getElementById('acctOLType').value;
    const openingBalance = Number(document.getElementById('acctOLOpening').value) || 0;
    const openingDate = document.getElementById('acctOLOpeningDate').value || acctToday();
    if(!name){ showToast('Enter an account name.'); return; }
    acctOtherLedgers.push({ id:'ledger_'+Date.now(), name, type, openingBalance, openingDate, active:true });
    await storageSet(ACCT_OTHER_LEDGERS_KEY, acctOtherLedgers);
    showToast('Account added.', 'burst');
    renderAcctChartTab(document.getElementById('accountingBody'));
  }
  async function toggleAcctOtherLedgerActive(id){
    const l = acctOtherLedgers.find(x => x.id === id); if(!l) return;
    l.active = l.active === false ? true : false;
    await storageSet(ACCT_OTHER_LEDGERS_KEY, acctOtherLedgers);
    renderAcctChartTab(document.getElementById('accountingBody'));
  }
  async function deleteAcctOtherLedger(id){
    const inUse = acctAllPostings().some(r => r.key === 'ledger:'+id && r.source !== 'Opening');
    if(inUse){ showToast("Can't delete — this account has journal entries against it. Deactivate it instead."); return; }
    if(!await showConfirmDialog('Delete this account? This cannot be undone.')) return;
    acctOtherLedgers = acctOtherLedgers.filter(x => x.id !== id);
    await storageSet(ACCT_OTHER_LEDGERS_KEY, acctOtherLedgers);
    showToast('Account deleted.', 'burst');
    renderAcctChartTab(document.getElementById('accountingBody'));
  }

  /* ===== Journal Vouchers tab ===== */
  let jvDraftLines = [];
  let acctJournalSearch = '';
  function jvBlankLine(){ return { accountKey:'', debit:0, credit:0 }; }
  function ensureJvDraft(){ if(jvDraftLines.length < 2) jvDraftLines = [jvBlankLine(), jvBlankLine()]; }
  function syncJvLinesFromInputs(){
    const rows = document.querySelectorAll('.jv-line-row');
    if(!rows.length) return;
    jvDraftLines = Array.from(rows).map(row => ({
      accountKey: row.querySelector('.jv-line-account').value,
      debit: Number(row.querySelector('.jv-line-debit').value) || 0,
      credit: Number(row.querySelector('.jv-line-credit').value) || 0,
    }));
  }
  function addJvLine(){ syncJvLinesFromInputs(); jvDraftLines.push(jvBlankLine()); renderAcctJournalTab(document.getElementById('accountingBody')); }
  function removeJvLine(i){ syncJvLinesFromInputs(); jvDraftLines.splice(i,1); renderAcctJournalTab(document.getElementById('accountingBody')); }
  async function saveJournalVoucher(){
    syncJvLinesFromInputs();
    const date = document.getElementById('jvDate').value;
    const type = document.getElementById('jvType').value;
    const narration = document.getElementById('jvNarration').value.trim();
    const lines = jvDraftLines.filter(l => l.accountKey && (l.debit||l.credit));
    if(!date){ showToast('Set a date.'); return; }
    if(lines.length < 2){ showToast('Add at least two lines with an account and an amount.'); return; }
    if(lines.some(l => l.debit>0 && l.credit>0)){ showToast('Each line can only be a Debit or a Credit, not both.'); return; }
    const totalDebit = lines.reduce((s,l)=>s+(Number(l.debit)||0),0);
    const totalCredit = lines.reduce((s,l)=>s+(Number(l.credit)||0),0);
    if(Math.round(totalDebit*100) !== Math.round(totalCredit*100) || totalDebit <= 0){ showToast(`Total Debit (${fmtMoney(totalDebit)}) must equal total Credit (${fmtMoney(totalCredit)}).`); return; }
    let voucherNo;
    try{ voucherNo = await issueDocNumber('journal_voucher'); }
    catch(e){ showToast("Could not get a voucher number from the server (" + e.message + ") — not saved. Try again once you're back online."); return; }
    acctJournalVouchers.push({ id:'jv_'+Date.now(), voucherNo, date, type, narration, lines, createdBy:currentUser.name, voided:false });
    await storageSet(ACCT_JOURNAL_KEY, acctJournalVouchers);
    jvDraftLines = [];
    renderDashboard();
    showToast('Journal Voucher ' + voucherNo + ' saved.');
    renderAcctJournalTab(document.getElementById('accountingBody'));
  }
  async function voidJournalVoucher(id){
    const j = acctJournalVouchers.find(x => x.id === id);
    if(!j || j.voided) return;
    const reason = await showPromptDialog(`Void voucher ${j.voucherNo}?\n\nEnter a reason (this voucher stays visible, struck through, for audit — it will not be edited or deleted):`, { title:'Void voucher', okText:'Void', placeholder:'Reason for voiding' });
    if(reason === null) return;
    if(!reason.trim()){ showToast('A reason is required to void a voucher.'); return; }
    j.voided = true; j.voidReason = reason.trim(); j.voidedBy = currentUser.name; j.voidedAt = new Date().toISOString();
    await storageSet(ACCT_JOURNAL_KEY, acctJournalVouchers);
    renderDashboard();
    showToast('Voucher ' + j.voucherNo + ' voided.');
    renderAcctJournalTab(document.getElementById('accountingBody'));
  }

  /* ===== Bank Accounts & Reconciliation tab ===== */
  let acctReconAccountId = '';
  async function saveAcctBankAccount(){
    const name = document.getElementById('acctBankName').value.trim();
    const type = document.getElementById('acctBankType').value;
    const bankName = document.getElementById('acctBankBankName').value.trim();
    const accountNo = document.getElementById('acctBankAccNo').value.trim();
    const ifsc = document.getElementById('acctBankIfsc').value.trim();
    const openingBalance = Number(document.getElementById('acctBankOpening').value) || 0;
    const openingDate = document.getElementById('acctBankOpeningDate').value || acctToday();
    if(!name){ showToast('Enter an account name.'); return; }
    acctBankAccounts.push({ id:'bnk_'+Date.now(), name, type, bankName, accountNo, ifsc, openingBalance, openingDate, active:true });
    await storageSet(ACCT_BANK_ACCOUNTS_KEY, acctBankAccounts);
    showToast('Account added.', 'burst');
    renderAcctBankTab(document.getElementById('accountingBody'));
  }
  async function toggleAcctBankActive(id){
    const b = acctBankAccounts.find(x => x.id === id); if(!b) return;
    b.active = b.active === false ? true : false;
    await storageSet(ACCT_BANK_ACCOUNTS_KEY, acctBankAccounts);
    renderAcctBankTab(document.getElementById('accountingBody'));
  }
  async function toggleAcctReconciledRow(rowId){
    await toggleAcctReconciled(rowId);
    renderAcctBankTab(document.getElementById('accountingBody'));
  }
  async function saveAcctStatementBalance(bankId){
    const b = acctBankAccounts.find(x => x.id === bankId); if(!b) return;
    const val = document.getElementById('acctStatementBal').value;
    b.lastStatementBalance = val === '' ? null : Number(val);
    b.lastStatementDate = acctToday();
    await storageSet(ACCT_BANK_ACCOUNTS_KEY, acctBankAccounts);
    showToast('Statement balance saved.', 'burst');
    renderAcctBankTab(document.getElementById('accountingBody'));
  }

  /* ===== Fixed Assets tab ===== */
  async function saveAcctFixedAsset(){
    const name = document.getElementById('assetName').value.trim();
    const category = document.getElementById('assetCategory').value.trim();
    const purchaseDate = document.getElementById('assetPurchaseDate').value;
    const purchaseCost = Number(document.getElementById('assetCost').value) || 0;
    const salvageValue = Number(document.getElementById('assetSalvage').value) || 0;
    const usefulLifeYears = Number(document.getElementById('assetLife').value) || 0;
    if(!name){ showToast('Enter an asset name.'); return; }
    if(purchaseCost <= 0){ showToast('Enter the purchase cost.'); return; }
    if(usefulLifeYears <= 0){ showToast('Enter the useful life in years.'); return; }
    acctFixedAssets.push({ id:'asset_'+Date.now(), name, category, purchaseDate, purchaseCost, salvageValue, usefulLifeYears, active:true, addedBy:currentUser.name });
    await storageSet(ACCT_FIXED_ASSETS_KEY, acctFixedAssets);
    showToast('Asset added.', 'burst');
    renderDashboard();
    renderAcctAssetsTab(document.getElementById('accountingBody'));
  }
  async function disposeAcctFixedAsset(id){
    const a = acctFixedAssets.find(x => x.id === id); if(!a) return;
    if(!await showConfirmDialog(`Mark "${a.name}" as disposed? It will stop accruing depreciation and drop off the active Balance Sheet, but stays here for the record.`)) return;
    a.active = false;
    a.disposedDate = acctToday();
    await storageSet(ACCT_FIXED_ASSETS_KEY, acctFixedAssets);
    renderDashboard();
    showToast('Asset marked disposed.', 'burst');
    renderAcctAssetsTab(document.getElementById('accountingBody'));
  }

  /* ===== Budget tab ===== */
  