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
  async function postQuickNotice(){
    const type = await resolveCommsType('nbType', 'nbNewTypeName');
    if(!type){ showToast('Enter a name for the new heading.'); return; }
    const title = document.getElementById('nbTitle').value.trim();
    const bodyText = document.getElementById('nbBody').value.trim();
    if(!title){ showToast('Enter a title.'); return; }
    if(!bodyText){ showToast('Enter a message.'); return; }
    let targets = [];
    if(nbAudienceScope === 'allstudents') targets = students.filter(isActive);
    else if(nbAudienceScope === 'allstaff') targets = staffList.filter(staffIsActive);
    else if(nbAudienceScope === 'class'){
      if(!nbAudienceClass){ showToast('Select a class.'); return; }
      targets = students.filter(s => isActive(s) && s.className===nbAudienceClass);
    }else if(nbAudienceScope === 'section'){
      if(!nbAudienceClass || !nbAudienceSection){ showToast('Select a class and section.'); return; }
      targets = students.filter(s => isActive(s) && s.className===nbAudienceClass && s.section===nbAudienceSection);
    }
    const linkEl = document.getElementById('nbLink');
    const link = cleanNoticeLink(linkEl ? linkEl.value : '');
    if(!link.ok){ showToast('That link doesn\'t look right — use a web address like https://example.com/page'); return; }
    const audienceLabels = { allstudents:'All Students', allstaff:'All Staff', class:`${nbAudienceClass} (Whole Class)`, section:`${nbAudienceClass} — Section ${nbAudienceSection}` };
    commsMessages.push({
      id:'msg_'+Date.now(), type, title, body:bodyText, link:link.value, audienceLabel:audienceLabels[nbAudienceScope],
      channels:['In-App'], recipientCount:targets.length, sentBy:currentUser.name, sentDate:new Date().toISOString().slice(0,10),
    });
    await storageSet(COMMS_MESSAGES_KEY, commsMessages);
    renderNoticeBoard(document.getElementById('noticeBoardBody'));
    showToast('Notice posted to the website.', 'burst');
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
      channels, recipientCount:targets.length, sentBy:currentUser.name, sentDate:new Date().toISOString().slice(0,10),
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
  async function saveNoticeEdit(id){
    const n = commsMessages.find(m => m.id === id);
    if(!n) return;
    const title = document.getElementById('editNoticeTitle').value.trim();
    const bodyText = document.getElementById('editNoticeBody').value.trim();
    if(!title || !bodyText){ showToast('Title and message can\'t be empty.'); return; }
    const linkEl = document.getElementById('editNoticeLink');
    const link = cleanNoticeLink(linkEl ? linkEl.value : n.link);
    if(!link.ok){ showToast('That link doesn\'t look right — use a web address like https://example.com/page'); return; }
    n.title = title;
    n.body = bodyText;
    n.link = link.value;
    await storageSet(COMMS_MESSAGES_KEY, commsMessages);
    editingNoticeId = '';
    renderNoticeBoard(document.getElementById('noticeBoardBody'));
    showToast('Notice updated.', 'burst');
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
  function renderAcctOverview(body){
    const liveIncome = acctIncome.filter(i => !i.voided);
    const liveExpenses = acctExpenses.filter(e => !e.voided);
    const feeIncome = acctFeeIncomeTotal();
    const otherIncome = acctOtherIncomeTotal();
    const totalIncome = feeIncome + otherIncome;
    const totalExpense = acctExpenseTotal();
    const netPosition = totalIncome - totalExpense;

    const expenseByCat = {};
    liveExpenses.forEach(e => { const k=e.category; if(!expenseByCat[k]) expenseByCat[k]={amt:0,count:0}; expenseByCat[k].amt += Number(e.amount)||0; expenseByCat[k].count++; });
    const topExpenseCats = Object.entries(expenseByCat).sort((a,b) => b[1].amt-a[1].amt);

    // Income by source — fee collections broken into their real sub-types (Fee/Bus/Stock/Hostel/Extra), not lumped
    const FEE_CAT_LABELS = { fee:'Tuition Fee', bus:'Bus Fee', stock:'Stock Fee', hostel:'Hostel Fee', extra:'Extra Fees (Admission, Inventory, Fines, etc.)' };
    const incomeByCat = {};
    payments.filter(pBookedInLedger).forEach(p => {
      const label = FEE_CAT_LABELS[p.category] || (CATS[p.category]||p.category);
      if(!incomeByCat[label]) incomeByCat[label] = {amt:0,count:0};
      incomeByCat[label].amt += Number(p.amount)||0;
      incomeByCat[label].count++;
    });
    liveIncome.forEach(i => { if(!incomeByCat[i.category]) incomeByCat[i.category]={amt:0,count:0}; incomeByCat[i.category].amt += Number(i.amount)||0; incomeByCat[i.category].count++; });
    const topIncomeCats = Object.entries(incomeByCat).sort((a,b) => b[1].amt-a[1].amt);

    // Cash position by payment mode — what's actually cash-in-hand vs bank vs UPI etc.
    const modeNet = {};
    payments.filter(pBookedInLedger).forEach(p => { const m=p.mode||'Unspecified'; modeNet[m]=(modeNet[m]||0)+(Number(p.amount)||0); });
    liveIncome.forEach(i => { const m=i.mode||'Unspecified'; modeNet[m]=(modeNet[m]||0)+(Number(i.amount)||0); });
    liveExpenses.forEach(e => { const m=e.mode||'Unspecified'; modeNet[m]=(modeNet[m]||0)-(Number(e.amount)||0); });
    const modeRows = Object.entries(modeNet).sort((a,b) => b[1]-a[1]);

    const recentTx = [
      ...payments.filter(pBookedInLedger).map(p => ({ date:p.date, type: p.voided?'Fee Income (Refunded)':'Fee Income', party:p.studentName||'Student', category:FEE_CAT_LABELS[p.category]||CATS[p.category]||p.category, amount:Number(p.amount)||0, sign:1 })),
      ...liveIncome.map(i => ({ date:i.date, type:'Other Income', party:i.party, category:i.category, amount:Number(i.amount)||0, sign:1 })),
      ...liveExpenses.map(e => ({ date:e.date, type:'Expense', party:e.party, category:e.category, amount:Number(e.amount)||0, sign:-1 })),
    ].sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,25);

    body.innerHTML = `
      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b>${fmtMoney(totalIncome)}</b><span>Total Income</span></div>
        <div class="fee-sum-card"><b style="color:var(--magenta);">${fmtMoney(totalExpense)}</b><span>Total Expenses</span></div>
        <div class="fee-sum-card"><b style="color:${netPosition>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(netPosition)}</b><span>Current Cash Position</span></div>
      </div>
      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b>${fmtMoney(feeIncome)}</b><span>Fee Collections</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(otherIncome)}</b><span>Other Income</span></div>
      </div>
      <div class="dash-section-title"><div><h3>Income by Source</h3></div></div>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Source</th><th>Transactions</th><th>Amount</th><th>% of Total</th></tr></thead>
        <tbody>
        ${topIncomeCats.length ? topIncomeCats.map(([cat,d]) => `<tr><td class="name-cell">${cat}</td><td>${d.count}</td><td style="color:#0f6a63; font-weight:600;">${fmtMoney(d.amt)}</td><td>${totalIncome>0?Math.round(d.amt/totalIncome*100):0}%</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No income recorded yet</b></div></td></tr>`}
        ${topIncomeCats.length ? `<tr style="font-weight:700; background:rgba(24,143,134,0.06);"><td>Total</td><td>${topIncomeCats.reduce((s,[,d])=>s+d.count,0)}</td><td style="color:#0f6a63;">${fmtMoney(totalIncome)}</td><td>100%</td></tr>` : ''}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>Expenses by Category</h3></div></div>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Category</th><th>Transactions</th><th>Amount</th><th>% of Total</th></tr></thead>
        <tbody>
        ${topExpenseCats.length ? topExpenseCats.map(([cat,d]) => `<tr><td class="name-cell">${cat}</td><td>${d.count}</td><td>${fmtMoney(d.amt)}</td><td>${totalExpense>0?Math.round(d.amt/totalExpense*100):0}%</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No expenses recorded yet</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>Cash Position by Payment Mode</h3></div></div>
      <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">Net of everything collected minus everything paid out, split by how it moved — useful for knowing exactly how much is cash-in-hand versus in the bank right now.</p>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Mode</th><th>Net Position</th></tr></thead>
        <tbody>
        ${modeRows.length ? modeRows.map(([mode,net]) => `<tr><td class="name-cell">${mode}</td><td style="color:${net>=0?'#0f6a63':'var(--magenta)'}; font-weight:600;">${fmtMoney(net)}</td></tr>`).join('') : `<tr><td colspan="2"><div class="empty-state"><b>No transactions yet</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>Recent Transactions</h3></div></div>
      <div class="table-wrap">
        <table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Party</th><th>Amount</th></tr></thead>
        <tbody>
        ${recentTx.length ? recentTx.map(t => `<tr><td>${t.date||'—'}</td><td>${t.type}</td><td>${t.category||'—'}</td><td>${t.party||'—'}</td><td style="color:${t.sign>0?'#0f6a63':'var(--magenta)'}; font-weight:600;">${t.sign>0?'+':'-'}${fmtMoney(t.amount)}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><b>No transactions yet</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  /* --- Daily Collections: Admin-only cash-handover reconciliation — "how much
     did we collect today, by every mode, across every source" — pulls from
     fee/extra-fee payments, other Income vouchers, AND inventory sales to
     non-Student buyers (Staff/Walk-in), since those never create a `payments`
     row of their own. Gated to currentUser.role==='Admin' in renderAccountingBody,
     deliberately bypassing the configurable per-role accounting permissions. */
  function renderAcctDailyCollectionsTab(body){
    const d = acctDailyCollectionsDate || acctToday();
    const todayStr = acctToday();
    const FEE_CAT_LABELS = { fee:'Tuition Fee', bus:'Bus Fee', stock:'Stock Fee', hostel:'Hostel Fee', extra:'Extra Fees / Inventory (Student)' };

    const feePays = payments.filter(p => pBookedInLedger(p) && p.date === d);
    const otherInc = acctIncome.filter(i => !i.voided && i.date === d);
    const invSales = (typeof inventorySales !== 'undefined' ? inventorySales : []).filter(s => s.buyerType !== 'Student' && s.date === d && Number(s.paidAmount||0) !== 0);

    const modeTotals = {};
    const addMode = (mode, amt) => { const m = mode || 'Unspecified'; modeTotals[m] = (modeTotals[m]||0) + amt; };
    feePays.forEach(p => addMode(p.mode, Number(p.amount)||0));
    otherInc.forEach(i => addMode(i.mode, Number(i.amount)||0));
    invSales.forEach(s => addMode(s.mode, Number(s.paidAmount)||0));
    const modeRows = Object.entries(modeTotals).sort((a,b) => b[1]-a[1]);
    const grandTotal = Object.values(modeTotals).reduce((s,v) => s+v, 0);

    const sourceTotals = {};
    const addSource = (label, amt) => { if(!sourceTotals[label]) sourceTotals[label] = {amt:0,count:0}; sourceTotals[label].amt += amt; sourceTotals[label].count++; };
    feePays.forEach(p => addSource(FEE_CAT_LABELS[p.category] || p.category || 'Fee Payment', Number(p.amount)||0));
    otherInc.forEach(i => addSource('Other Income — ' + i.category, Number(i.amount)||0));
    invSales.forEach(s => addSource('Inventory Sale (Staff / Walk-in)', Number(s.paidAmount)||0));
    const sourceRows = Object.entries(sourceTotals).sort((a,b) => b[1].amt-a[1].amt);

    const txRows = [
      ...feePays.map(p => ({ type: Number(p.amount)<0 ? 'Refund' : 'Fee Payment', party: p.studentName||'Student', detail: FEE_CAT_LABELS[p.category]||p.category, mode: p.mode||'—', ref: p.receiptNo||'—', amount: Number(p.amount)||0 })),
      ...otherInc.map(i => ({ type:'Other Income', party: i.party||'—', detail: i.category, mode: i.mode||'—', ref: i.voucherNo||'—', amount: Number(i.amount)||0 })),
      ...invSales.map(s => ({ type:'Inventory Sale', party: s.buyerName||s.buyerType, detail: s.itemName, mode: s.mode||'—', ref:'—', amount: Number(s.paidAmount)||0 })),
    ].sort((a,b) => b.amount-a.amount);

    body.innerHTML = `
      <div style="display:flex; align-items:flex-end; gap:12px; margin-bottom:18px; flex-wrap:wrap;">
        <div class="f-field" style="margin:0;">
          <label>Date</label>
          <input type="date" id="acctDcDate" value="${d}" max="${todayStr}" onchange="acctDailyCollectionsDate=this.value; renderAcctDailyCollectionsTab(document.getElementById('accountingBody'));">
        </div>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:0 0 8px;">Everything collected on this date, across every payment mode and every module — fee payments, inventory sales, and other income — so it can be checked against what's physically handed over.</p>
      </div>
      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b style="color:#0f6a63;">${fmtMoney(grandTotal)}</b><span>Total Collected on ${d}</span></div>
        <div class="fee-sum-card"><b>${txRows.length}</b><span>Transactions</span></div>
      </div>
      <div class="dash-section-title"><div><h3>By Payment Mode</h3></div></div>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Mode</th><th>Amount</th><th>% of Total</th></tr></thead>
        <tbody>
        ${modeRows.length ? modeRows.map(([mode,amt]) => `<tr><td class="name-cell">${mode}</td><td style="color:${amt>=0?'#0f6a63':'var(--magenta)'}; font-weight:600;">${fmtMoney(amt)}</td><td>${grandTotal!==0?Math.round(amt/grandTotal*100):0}%</td></tr>`).join('') : `<tr><td colspan="3"><div class="empty-state"><b>No collections recorded for this date</b></div></td></tr>`}
        ${modeRows.length ? `<tr style="font-weight:700; background:rgba(24,143,134,0.06);"><td>Total</td><td style="color:#0f6a63;">${fmtMoney(grandTotal)}</td><td>100%</td></tr>` : ''}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>By Source</h3></div></div>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Source</th><th>Transactions</th><th>Amount</th></tr></thead>
        <tbody>
        ${sourceRows.length ? sourceRows.map(([label,v]) => `<tr><td class="name-cell">${label}</td><td>${v.count}</td><td style="font-weight:600;">${fmtMoney(v.amt)}</td></tr>`).join('') : `<tr><td colspan="3"><div class="empty-state"><b>No collections recorded for this date</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>Transaction Detail</h3></div></div>
      <div class="table-wrap">
        <table><thead><tr><th>Type</th><th>Detail</th><th>Party</th><th>Mode</th><th>Receipt/Voucher</th><th>Amount</th></tr></thead>
        <tbody>
        ${txRows.length ? txRows.map(t => `<tr><td>${t.type}</td><td>${t.detail||'—'}</td><td>${t.party||'—'}</td><td>${t.mode}</td><td>${t.ref}</td><td style="color:${t.amount>=0?'#0f6a63':'var(--magenta)'}; font-weight:600;">${fmtMoney(t.amount)}</td></tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><b>No transactions on this date</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  /* --- Income vouchers (non-fee income: donations, grants, etc.) --- */
  let acctIncomeSearch = '';
  function renderAcctIncomeTab(body){
    const q = acctIncomeSearch.toLowerCase();
    const filtered = acctIncome.filter(i => !q || (i.party||'').toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || (i.referenceNo||'').toLowerCase().includes(q) || i.voucherNo.toLowerCase().includes(q)).sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_income', 'create');
    const canPrint = getAccountingTabAccess(currentUser.role, 'accounting_income', 'print');
    const canVoid = getAccountingTabAccess(currentUser.role, 'accounting_income', 'delete');
    body.innerHTML = `
      ${canCreate ? `
      <div class="profile-card" style="max-width:640px; margin-bottom:24px;">
        <h4>💰 Record Income</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">For anything other than student fees — donations, grants, rental income, interest, and so on. Pick the <b>Account</b> this income belongs to (Tuition Fee, Vehicle Fee, Inventory, Hostel Fee, or General) so the "P&amp;L by Account" tab can total it up correctly. A Receipt Voucher number is assigned automatically when you save.</p>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field"><label>Date</label><input type="date" id="acctIncDate" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="f-field"><label>Amount (₹)</label><input type="number" id="acctIncAmount" min="0" placeholder="0"></div>
          <div class="f-field">
            <label>Category</label>
            <select id="acctIncCategory" onchange="onAcctCategoryChange('acctIncCategory','acctIncNewCategory')">
              ${acctIncomeCategories.map(c => `<option>${c}</option>`).join('')}
              <option value="__new__">+ New Category...</option>
            </select>
          </div>
          <div class="f-field" id="acctIncNewCategoryField" style="display:none;"><label>New Category Name</label><input type="text" id="acctIncNewCategory" placeholder="e.g. Alumni Contribution"></div>
          <div class="f-field">
            <label>Account</label>
            <select id="acctIncCostCenter">${acctCostCenters.map(c => `<option>${c}</option>`).join('')}</select>
          </div>
          <div class="f-field"><label>Received From</label><input type="text" id="acctIncParty" placeholder="e.g. Rotary Club of Kadapa"></div>
          <div class="f-field">
            <label>Payment Mode</label>
            <select id="acctIncMode" onchange="onAcctModeChange('acctIncMode','acctIncRefField')"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Card</option><option>Online</option></select>
          </div>
          <div class="f-field" id="acctIncRefField" style="display:none;"><label>Reference / Cheque No.</label><input type="text" id="acctIncRef" placeholder="e.g. Cheque no. or UTR"></div>
          <div class="f-field"><label>Deposited Into</label><select id="acctIncBankAccount"><option value="">(Auto — by Payment Mode)</option>${acctBankAccounts.filter(b=>b.active!==false).map(b => `<option value="${b.id}">${b.name}</option>`).join('')}</select></div>
          <div class="f-field full"><label>Description / Narration</label><input type="text" id="acctIncDesc" placeholder="Optional notes about this income"></div>
        </div>
        <button class="btn btn-primary" onclick="saveIncomeVoucher()">Save Income Voucher</button>
      </div>
      ` : ''}

      <h4 style="margin-bottom:10px;">Income Vouchers (${acctIncome.length})</h4>
      <input class="input" style="max-width:280px; margin-bottom:12px;" placeholder="Search vouchers..." value="${acctIncomeSearch}" oninput="acctIncomeSearch=this.value; renderAcctIncomeTab(document.getElementById('accountingBody'));">
      <div class="table-wrap">
        <table><thead><tr><th>Voucher No.</th><th>Date</th><th>Category</th><th>Account</th><th>Received From</th><th>Mode</th><th>Amount</th><th></th></tr></thead>
        <tbody>
        ${filtered.length ? filtered.map(i => `<tr${i.voided?' style="opacity:0.55; text-decoration:line-through;"':''}><td>${i.voucherNo}</td><td>${i.date}</td><td>${i.category}</td><td>${i.costCenter||'—'}</td><td>${i.party||'—'}</td><td>${i.mode}${i.referenceNo?' ('+i.referenceNo+')':''}</td><td style="color:#0f6a63; font-weight:600;">${fmtMoney(i.amount)}</td><td style="text-decoration:none; white-space:nowrap;">${canPrint?`<button class="btn-edit-text" onclick="printAccountingVoucher('income','${i.id}')">Print</button>`:''}${canVoid && !i.voided?` <button class="btn-danger-text" onclick="voidAccountingEntry('income','${i.id}')">Void</button>`:''}${i.voided?` <span class="pill" style="font-size:0.62rem;" title="${escapeHtml(i.voidReason||'')}">Voided</span>`:''}</td></tr>`).join('') : `<tr><td colspan="8"><div class="empty-state"><b>No income vouchers yet${acctIncomeSearch?' match your search':''}</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
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
  function renderAcctExpenseTab(body){
    const q = acctExpenseSearch.toLowerCase();
    const filtered = acctExpenses.filter(e => !q || (e.party||'').toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || (e.referenceNo||'').toLowerCase().includes(q) || e.voucherNo.toLowerCase().includes(q)).sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_expenses', 'create');
    const canPrint = getAccountingTabAccess(currentUser.role, 'accounting_expenses', 'print');
    const canVoid = getAccountingTabAccess(currentUser.role, 'accounting_expenses', 'delete');
    body.innerHTML = `
      ${canCreate ? `
      <div class="profile-card" style="max-width:640px; margin-bottom:24px;">
        <h4>💸 Record Expense</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Salaries, utilities, maintenance, supplies — anything the school spends on. Pick the <b>Account</b> this expense should be weighed against (Tuition Fee, Vehicle Fee, Inventory, Hostel Fee, or General) so the "P&amp;L by Account" tab can show whether that part of the school is running at a profit or a loss — e.g. driver salary and fuel go under Vehicle Fee, canteen stock purchases go under Inventory. A Payment Voucher number is assigned automatically when you save.</p>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field"><label>Date</label><input type="date" id="acctExpDate" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="f-field"><label>Amount (₹)</label><input type="number" id="acctExpAmount" min="0" placeholder="0"></div>
          <div class="f-field">
            <label>Category</label>
            <select id="acctExpCategory" onchange="onAcctCategoryChange('acctExpCategory','acctExpNewCategory')">
              ${acctExpenseCategories.map(c => `<option>${c}</option>`).join('')}
              <option value="__new__">+ New Category...</option>
            </select>
          </div>
          <div class="f-field" id="acctExpNewCategoryField" style="display:none;"><label>New Category Name</label><input type="text" id="acctExpNewCategory" placeholder="e.g. Sports Equipment"></div>
          <div class="f-field">
            <label>Account</label>
            <select id="acctExpCostCenter">${acctCostCenters.map(c => `<option>${c}</option>`).join('')}</select>
          </div>
          <div class="f-field"><label>Paid To</label><input type="text" id="acctExpParty" placeholder="e.g. APSEB Electricity Board"></div>
          <div class="f-field">
            <label>Payment Mode</label>
            <select id="acctExpMode" onchange="onAcctModeChange('acctExpMode','acctExpRefField')"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Card</option><option>Online</option></select>
          </div>
          <div class="f-field" id="acctExpRefField" style="display:none;"><label>Reference / Cheque No.</label><input type="text" id="acctExpRef" placeholder="e.g. Cheque no. or UTR"></div>
          <div class="f-field"><label>Paid From</label><select id="acctExpBankAccount"><option value="">(Auto — by Payment Mode)</option>${acctBankAccounts.filter(b=>b.active!==false).map(b => `<option value="${b.id}">${b.name}</option>`).join('')}</select></div>
          <div class="f-field full"><label>Description / Narration</label><input type="text" id="acctExpDesc" placeholder="Optional notes about this expense"></div>
        </div>
        <button class="btn btn-primary" onclick="saveExpenseVoucher()">Save Expense Voucher</button>
      </div>
      ` : ''}

      <h4 style="margin-bottom:10px;">Expense Vouchers (${acctExpenses.length})</h4>
      <input class="input" style="max-width:280px; margin-bottom:12px;" placeholder="Search vouchers..." value="${acctExpenseSearch}" oninput="acctExpenseSearch=this.value; renderAcctExpenseTab(document.getElementById('accountingBody'));">
      <div class="table-wrap">
        <table><thead><tr><th>Voucher No.</th><th>Date</th><th>Category</th><th>Account</th><th>Paid To</th><th>Mode</th><th>Amount</th><th></th></tr></thead>
        <tbody>
        ${filtered.length ? filtered.map(e => `<tr${e.voided?' style="opacity:0.55; text-decoration:line-through;"':''}><td>${e.voucherNo}</td><td>${e.date}</td><td>${e.category}</td><td>${e.costCenter||'—'}</td><td>${e.party||'—'}</td><td>${e.mode}${e.referenceNo?' ('+e.referenceNo+')':''}</td><td style="color:var(--magenta); font-weight:600;">${fmtMoney(e.amount)}</td><td style="text-decoration:none; white-space:nowrap;">${canPrint?`<button class="btn-edit-text" onclick="printAccountingVoucher('expense','${e.id}')">Print</button>`:''}${canVoid && !e.voided?` <button class="btn-danger-text" onclick="voidAccountingEntry('expense','${e.id}')">Void</button>`:''}${e.voided?` <span class="pill" style="font-size:0.62rem;" title="${escapeHtml(e.voidReason||'')}">Voided</span>`:''}</td></tr>`).join('') : `<tr><td colspan="8"><div class="empty-state"><b>No expense vouchers yet${acctExpenseSearch?' match your search':''}</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
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
  function renderAcctCategoriesTab(body){
    const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_categories', 'create');
    const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_categories', 'delete');
    body.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; max-width:820px; margin-bottom:20px;">
        <div class="profile-card">
          <h4>💸 Expense Categories</h4>
          ${canCreate ? `<div style="display:flex; gap:8px; margin:12px 0;">
            <input class="input" id="acctNewExpCat" placeholder="e.g. Sports Equipment" style="flex:1;">
            <button class="btn btn-primary btn-sm" onclick="addAcctCategory('expense')">Add</button>
          </div>` : ''}
          <div class="table-wrap">
            <table><tbody>
            ${acctExpenseCategories.length ? acctExpenseCategories.map((c,i) => `<tr><td>${c}</td><td style="text-align:right;">${canDelete ? `<button class="btn-danger-text" onclick="removeAcctCategory('expense',${i})">Remove</button>` : ''}</td></tr>`).join('') : `<tr><td><div class="empty-state"><b>No categories yet</b></div></td></tr>`}
            </tbody></table>
          </div>
        </div>
        <div class="profile-card">
          <h4>💰 Income Categories</h4>
          ${canCreate ? `<div style="display:flex; gap:8px; margin:12px 0;">
            <input class="input" id="acctNewIncCat" placeholder="e.g. Alumni Contribution" style="flex:1;">
            <button class="btn btn-primary btn-sm" onclick="addAcctCategory('income')">Add</button>
          </div>` : ''}
          <div class="table-wrap">
            <table><tbody>
            ${acctIncomeCategories.length ? acctIncomeCategories.map((c,i) => `<tr><td>${c}</td><td style="text-align:right;">${canDelete ? `<button class="btn-danger-text" onclick="removeAcctCategory('income',${i})">Remove</button>` : ''}</td></tr>`).join('') : `<tr><td><div class="empty-state"><b>No categories yet</b></div></td></tr>`}
            </tbody></table>
          </div>
        </div>
      </div>
      <div class="profile-card" style="max-width:400px;">
        <h4>📈 Accounts (for Profit &amp; Loss)</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">Which part of the school an income or expense belongs to — Tuition Fee, Vehicle Fee, Inventory, Hostel Fee, General — so the "P&amp;L by Account" tab can show whether each one is running at a profit or a loss.</p>
        ${canCreate ? `<div style="display:flex; gap:8px; margin:12px 0;">
          <input class="input" id="acctNewCostCenter" placeholder="e.g. Sports Wing" style="flex:1;">
          <button class="btn btn-primary btn-sm" onclick="addAcctCostCenter()">Add</button>
        </div>` : ''}
        <div class="table-wrap">
          <table><tbody>
          ${acctCostCenters.length ? acctCostCenters.map((c,i) => `<tr><td>${c}</td><td style="text-align:right;">${canDelete ? `<button class="btn-danger-text" onclick="removeAcctCostCenter(${i})">Remove</button>` : ''}</td></tr>`).join('') : `<tr><td><div class="empty-state"><b>No accounts yet</b></div></td></tr>`}
          </tbody></table>
        </div>
      </div>
    `;
  }
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
  function renderAcctSegmentsTab(body){
    const segments = {};
    function seg(name){
      if(!segments[name]) segments[name] = { income:0, expense:0 };
      return segments[name];
    }
    // A student buying from the Inventory / canteen counter is recorded as a
    // Fee payment with category 'extra' (so it shows on their fee ledger) —
    // that's indistinguishable from any other one-off Extra Fee by category
    // alone, which is why it was landing in General / Other. Match it back
    // to the actual inventory sale it came from (via extraFeeId → sefId) and
    // count it as Inventory income instead.
    const inventorySefIds = new Set(inventorySales.filter(s => s.sefId).map(s => s.sefId));
    payments.filter(pBookedInLedger).forEach(p => {
      const key = (p.category === 'extra' && inventorySefIds.has(p.extraFeeId)) ? 'Inventory' : feePaymentCostCenter(p);
      seg(key).income += Number(p.amount)||0;
    });
    // A non-student buyer (staff, walk-in, etc.) at the inventory counter
    // never creates a Fee payment at all — it only exists in the Inventory
    // module's own sales log — so pull those in directly or that income
    // would be invisible here, not just miscategorised.
    inventorySales.filter(s => s.buyerType !== 'Student').forEach(s => { seg('Inventory').income += Number(s.paidAmount)||0; });
    // Grouped strictly by the Account picked on each voucher — never by its
    // free-typed Category, which can vary in spelling/capitalisation between
    // entries that are really the same account and would otherwise split
    // one account across several near-duplicate rows. Anything with no
    // Account set (older entries from before that field existed) goes into
    // one clean General / Other row.
    acctIncome.filter(i => !i.voided).forEach(i => { seg(i.costCenter || 'General / Other').income += Number(i.amount)||0; });
    acctExpenses.filter(e => !e.voided).forEach(e => { seg(e.costCenter || 'General / Other').expense += Number(e.amount)||0; });
    const names = Object.keys(segments).sort((a,b) => (segments[b].income - segments[b].expense) - (segments[a].income - segments[a].expense));
    const totalIncome = names.reduce((s,n) => s + segments[n].income, 0);
    const totalExpense = names.reduce((s,n) => s + segments[n].expense, 0);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">Profit &amp; loss by account — student fee collections are matched to an account automatically (tuition fee → Tuition Fee, bus fee → Vehicle Fee (Transport), hostel fee → Hostel Fee, everything else → General / Other), and every Inventory / canteen counter sale — to a student or anyone else — is pulled in as Inventory income. Income and Payment vouchers use whichever Account was picked when they were saved. This is what tells you, for example, whether running the school bus is actually profitable once fuel, driver salary and maintenance are counted against the bus fee it collects — or whether the canteen is making money once what it paid for stock is counted against what it sold.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Account</th><th>Income</th><th>Expenditure</th><th>Net</th></tr></thead>
        <tbody>
        ${names.length ? names.map(n => {
          const s = segments[n];
          const net = s.income - s.expense;
          return `<tr><td class="name-cell">${n}</td><td style="color:#0f6a63; font-weight:600;">${fmtMoney(s.income)}</td><td style="color:var(--magenta); font-weight:600;">${fmtMoney(s.expense)}</td><td style="font-weight:700; color:${net>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(net)}</td></tr>`;
        }).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No income or expenditure recorded yet</b></div></td></tr>`}
        </tbody>
        ${names.length ? `<tfoot><tr style="font-weight:700; border-top:2px solid var(--border);"><td>Total</td><td style="color:#0f6a63;">${fmtMoney(totalIncome)}</td><td style="color:var(--magenta);">${fmtMoney(totalExpense)}</td><td style="color:${(totalIncome-totalExpense)>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(totalIncome-totalExpense)}</td></tr></tfoot>` : ''}
        </table>
      </div>
    `;
  }

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
  function renderAcctChartTab(body){
    const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_chartofaccounts', 'create');
    const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_chartofaccounts', 'delete');
    const ledger = acctBuildLedger();
    const coa = getChartOfAccounts();
    const groups = ['Assets','Liabilities','Equity','Income','Expense'];
    const byGroup = {}; groups.forEach(g => byGroup[g] = []);
    coa.forEach(acct => {
      const rows = ledger[acct.key] || [];
      const bal = acctBalanceFromRows(rows, acct.type);
      byGroup[acct.group].push({ acct, bal, count: rows.length });
    });
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:760px;">Every account the school's books use, grouped the way a proper Chart of Accounts is — Assets, Liabilities, Equity, Income and Expense — with each account's live balance. Bank &amp; Cash accounts are managed under <b>Bank &amp; Reconciliation</b>, Fixed Assets under <b>Fixed Assets</b>, and Income/Expense categories under <b>Categories</b>. Add any other Asset, Liability or Equity account here — a bank loan, caution deposits held for students, a corpus/capital fund, and so on.</p>
      ${groups.map(g => `
        <div class="dash-section-title"><div><h3>${g}</h3></div></div>
        <div class="table-wrap" style="margin-bottom:24px;">
          <table><thead><tr><th>Account</th><th>Type</th><th>Entries</th><th style="text-align:right;">Balance</th></tr></thead>
          <tbody>
          ${byGroup[g].length ? byGroup[g].map(({acct,bal,count}) => `<tr${acct.active===false?' style="opacity:0.5;"':''}><td class="name-cell">${acct.name}${acct.active===false?' <span class="pill" style="font-size:0.6rem;">Inactive</span>':''}</td><td>${acct.sub}</td><td>${count}</td><td style="text-align:right; font-weight:600; color:${bal.balance>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(Math.abs(bal.balance))} ${bal.normalDebit ? (bal.balance<0?'Cr':'Dr') : (bal.balance<0?'Dr':'Cr')}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No ${g.toLowerCase()} accounts yet</b></div></td></tr>`}
          </tbody></table>
        </div>
      `).join('')}
      ${canCreate ? `
      <div class="profile-card" style="max-width:640px; margin-bottom:20px;">
        <h4>➕ Add Other Account (Asset / Liability / Equity)</h4>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field full"><label>Account Name</label><input type="text" id="acctOLName" placeholder="e.g. Bank Loan — SBI, Corpus Fund, Caution Deposits Payable"></div>
          <div class="f-field"><label>Type</label><select id="acctOLType"><option>Asset</option><option>Liability</option><option>Equity</option></select></div>
          <div class="f-field"><label>Opening Balance (₹)</label><input type="number" id="acctOLOpening" min="0" placeholder="0"></div>
          <div class="f-field"><label>Opening Date</label><input type="date" id="acctOLOpeningDate" value="${acctToday()}"></div>
        </div>
        <button class="btn btn-primary" onclick="saveAcctOtherLedger()">Add Account</button>
      </div>` : ''}
      <h4 style="margin-bottom:10px;">Other Accounts (${acctOtherLedgers.length})</h4>
      <div class="table-wrap">
        <table><thead><tr><th>Account</th><th>Type</th><th>Opening Balance</th><th></th></tr></thead>
        <tbody>
        ${acctOtherLedgers.length ? acctOtherLedgers.map(l => `<tr${l.active===false?' style="opacity:0.5;"':''}><td class="name-cell">${l.name}</td><td>${l.type}</td><td>${fmtMoney(l.openingBalance||0)}</td><td style="white-space:nowrap;">${canDelete ? `<button class="btn-edit-text" onclick="toggleAcctOtherLedgerActive('${l.id}')">${l.active===false?'Reactivate':'Deactivate'}</button> <button class="btn-danger-text" onclick="deleteAcctOtherLedger('${l.id}')">Delete</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No other accounts yet</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
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
  function renderAcctJournalTab(body){
    ensureJvDraft();
    const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_journal', 'create');
    const canVoid = getAccountingTabAccess(currentUser.role, 'accounting_journal', 'delete');
    const coa = getChartOfAccounts().filter(a => a.active !== false);
    const totalDebit = jvDraftLines.reduce((s,l)=>s+(Number(l.debit)||0),0);
    const totalCredit = jvDraftLines.reduce((s,l)=>s+(Number(l.credit)||0),0);
    const q = acctJournalSearch.toLowerCase();
    const filtered = acctJournalVouchers.filter(j => !q || (j.narration||'').toLowerCase().includes(q) || j.voucherNo.toLowerCase().includes(q)).sort((a,b) => (b.date||'').localeCompare(a.date||''));
    body.innerHTML = `
      ${canCreate ? `
      <div class="profile-card" style="margin-bottom:24px;">
        <h4>📒 New Journal Voucher</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">For adjustments, opening entries, transfers between bank accounts (use type Contra), or anything that doesn't fit a simple Income/Expense voucher. Every line needs either a Debit or a Credit, and the voucher can only be saved once total Debit equals total Credit. A voucher number is assigned automatically when you save.</p>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field"><label>Date</label><input type="date" id="jvDate" value="${acctToday()}"></div>
          <div class="f-field"><label>Type</label><select id="jvType"><option>Journal</option><option>Contra</option></select></div>
          <div class="f-field full"><label>Narration</label><input type="text" id="jvNarration" placeholder="e.g. Transfer from Cash to SBI Bank Account"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h4 style="margin:0;">Lines</h4>
          <button class="btn btn-primary btn-sm" onclick="addJvLine()">+ Add Line</button>
        </div>
        <div class="table-wrap" style="overflow-x:auto; margin-bottom:10px;">
          <table style="min-width:560px;"><thead><tr><th>Account</th><th style="width:130px;">Debit (₹)</th><th style="width:130px;">Credit (₹)</th><th></th></tr></thead>
          <tbody>
          ${jvDraftLines.map((l,i) => `<tr class="jv-line-row">
            <td><select class="input jv-line-account" style="width:100%;">
              <option value="">Select account...</option>
              ${coa.map(a => `<option value="${a.key}" ${l.accountKey===a.key?'selected':''}>${a.group} — ${a.name}</option>`).join('')}
            </select></td>
            <td><input type="number" class="input jv-line-debit" min="0" value="${l.debit||''}"></td>
            <td><input type="number" class="input jv-line-credit" min="0" value="${l.credit||''}"></td>
            <td>${jvDraftLines.length > 2 ? `<button class="btn-danger-text" onclick="removeJvLine(${i})">🗑️</button>` : ''}</td>
          </tr>`).join('')}
          </tbody>
          <tfoot><tr style="font-weight:700;"><td>Total</td><td>${fmtMoney(totalDebit)}</td><td>${fmtMoney(totalCredit)}</td><td></td></tr></tfoot>
          </table>
        </div>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:12px;">Totals above reflect the lines as of the last Add/Remove — the exact check happens when you save.</p>
        <button class="btn btn-primary" onclick="saveJournalVoucher()">Save Journal Voucher</button>
      </div>` : ''}

      <h4 style="margin-bottom:10px;">Journal Vouchers (${acctJournalVouchers.length})</h4>
      <input class="input" style="max-width:280px; margin-bottom:12px;" placeholder="Search vouchers..." value="${acctJournalSearch}" oninput="acctJournalSearch=this.value; renderAcctJournalTab(document.getElementById('accountingBody'));">
      <div class="table-wrap">
        <table><thead><tr><th>Voucher No.</th><th>Date</th><th>Type</th><th>Narration</th><th>Amount</th><th></th></tr></thead>
        <tbody>
        ${filtered.length ? filtered.map(j => {
          const amt = (j.lines||[]).reduce((s,l)=>s+(Number(l.debit)||0),0);
          return `<tr${j.voided?' style="opacity:0.55; text-decoration:line-through;"':''}><td>${j.voucherNo}</td><td>${j.date}</td><td>${j.type||'Journal'}</td><td>${j.narration||'—'}</td><td style="font-weight:600;">${fmtMoney(amt)}</td><td style="text-decoration:none; white-space:nowrap;">${canVoid && !j.voided?`<button class="btn-danger-text" onclick="voidJournalVoucher('${j.id}')">Void</button>`:''}${j.voided?` <span class="pill" style="font-size:0.62rem;" title="${escapeHtml(j.voidReason||'')}">Voided</span>`:''}</td></tr>`;
        }).join('') : `<tr><td colspan="6"><div class="empty-state"><b>No journal vouchers yet${acctJournalSearch?' match your search':''}</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
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
  function renderAcctBankTab(body){
    const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_bank', 'create');
    const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_bank', 'delete');
    if((!acctReconAccountId || !acctBankAccounts.some(b=>b.id===acctReconAccountId)) && acctBankAccounts.length) acctReconAccountId = acctBankAccounts[0].id;
    const ledger = acctBuildLedger();
    body.innerHTML = `
      ${canCreate ? `
      <div class="profile-card" style="max-width:640px; margin-bottom:24px;">
        <h4>➕ Add Bank / Cash Account</h4>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field full"><label>Account Name</label><input type="text" id="acctBankName" placeholder="e.g. Bank Account — SBI Current A/c"></div>
          <div class="f-field"><label>Type</label><select id="acctBankType"><option>Bank</option><option>Cash</option></select></div>
          <div class="f-field"><label>Bank Name</label><input type="text" id="acctBankBankName" placeholder="e.g. State Bank of India"></div>
          <div class="f-field"><label>Account Number</label><input type="text" id="acctBankAccNo" placeholder="Optional"></div>
          <div class="f-field"><label>IFSC</label><input type="text" id="acctBankIfsc" placeholder="Optional"></div>
          <div class="f-field"><label>Opening Balance (₹)</label><input type="number" id="acctBankOpening" min="0" placeholder="0"></div>
          <div class="f-field"><label>Opening Date</label><input type="date" id="acctBankOpeningDate" value="${acctToday()}"></div>
        </div>
        <button class="btn btn-primary" onclick="saveAcctBankAccount()">Add Account</button>
      </div>` : ''}

      <h4 style="margin-bottom:10px;">Bank &amp; Cash Accounts (${acctBankAccounts.length})</h4>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Account</th><th>Type</th><th>Bank</th><th>A/c No.</th><th style="text-align:right;">Balance</th><th></th></tr></thead>
        <tbody>
        ${acctBankAccounts.map(b => {
          const bal = acctBalanceFromRows(ledger['bank:'+b.id]||[], 'Asset');
          return `<tr${b.active===false?' style="opacity:0.5;"':''}><td class="name-cell">${b.name}</td><td>${b.type}</td><td>${b.bankName||'—'}</td><td>${b.accountNo||'—'}</td><td style="text-align:right; font-weight:600; color:${bal.balance>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(bal.balance)}</td><td style="white-space:nowrap;">${canDelete && acctBankAccounts.filter(x=>x.active!==false).length>1 ? `<button class="btn-edit-text" onclick="toggleAcctBankActive('${b.id}')">${b.active===false?'Reactivate':'Deactivate'}</button>` : ''}</td></tr>`;
        }).join('')}
        </tbody></table>
      </div>

      <div class="dash-section-title"><div><h3>Bank Reconciliation</h3></div></div>
      <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:12px; max-width:700px;">Tick off every transaction that has actually cleared on your bank statement. The Reconciled Balance should match your bank statement's closing balance once everything on it is ticked — anything left unticked is still in transit (a cheque issued but not yet presented, for example).</p>
      <div class="f-field" style="max-width:320px; margin-bottom:16px;">
        <label>Account</label>
        <select id="acctReconAccountSel" onchange="acctReconAccountId=this.value; renderAcctBankTab(document.getElementById('accountingBody'));">
          ${acctBankAccounts.map(b => `<option value="${b.id}" ${acctReconAccountId===b.id?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      ${renderAcctReconciliationBody(acctReconAccountId, ledger)}
    `;
  }
  function renderAcctReconciliationBody(bankId, ledger){
    const bank = acctBankAccounts.find(b => b.id === bankId);
    if(!bank) return `<div class="empty-state"><b>Add a bank/cash account above first.</b></div>`;
    const rows = (ledger['bank:'+bankId]||[]).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    let reconciledBal = 0, ledgerBal = 0;
    const trs = rows.map(r => {
      const rid = acctRowId(r);
      const reconciled = !!acctReconciled[rid];
      const net = r.debit - r.credit;
      ledgerBal += net;
      if(reconciled) reconciledBal += net;
      return `<tr><td><input type="checkbox" ${reconciled?'checked':''} onchange="toggleAcctReconciledRow('${rid.replace(/'/g,"\\'")}')"></td><td>${r.date}</td><td>${r.narration}</td><td>${r.source}</td><td style="text-align:right; color:${net>=0?'#0f6a63':'var(--magenta)'};">${net>=0?'+':''}${fmtMoney(net)}</td></tr>`;
    }).join('');
    const statementBal = bank.lastStatementBalance != null ? Number(bank.lastStatementBalance) : null;
    const diff = statementBal != null ? Math.round((statementBal - reconciledBal)*100)/100 : null;
    return `
      <div class="fee-summary-row" style="margin-bottom:16px;">
        <div class="fee-sum-card"><b>${fmtMoney(ledgerBal)}</b><span>Ledger Balance</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(reconciledBal)}</b><span>Reconciled Balance</span></div>
        <div class="fee-sum-card"><b style="color:${diff===0?'#0f6a63':(diff==null?'inherit':'var(--magenta)')};">${statementBal!=null?fmtMoney(diff):'—'}</b><span>Difference vs Statement</span></div>
      </div>
      <div style="display:flex; gap:8px; align-items:flex-end; margin-bottom:14px;">
        <div class="f-field"><label>Bank Statement Closing Balance (₹)</label><input type="number" id="acctStatementBal" value="${bank.lastStatementBalance||''}" placeholder="Enter to compare"></div>
        <button class="btn btn-ghost btn-sm" onclick="saveAcctStatementBalance('${bankId}')">Save</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th style="width:40px;">✓</th><th>Date</th><th>Narration</th><th>Source</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>${rows.length ? trs : `<tr><td colspan="5"><div class="empty-state"><b>No transactions on this account yet</b></div></td></tr>`}</tbody></table>
      </div>
    `;
  }
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
  function renderAcctAssetsTab(body){
    const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_assets', 'create');
    const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_assets', 'delete');
    const totalCost = acctFixedAssets.reduce((s,a)=>s+(Number(a.purchaseCost)||0),0);
    const totalDep = acctFixedAssets.reduce((s,a)=>s+acctAccumulatedDepreciation(a, acctToday()),0);
    const totalBook = totalCost - totalDep;
    body.innerHTML = `
      <div class="fee-summary-row" style="margin-bottom:20px;">
        <div class="fee-sum-card"><b>${fmtMoney(totalCost)}</b><span>Total Asset Cost</span></div>
        <div class="fee-sum-card"><b style="color:var(--magenta);">${fmtMoney(totalDep)}</b><span>Accumulated Depreciation</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(totalBook)}</b><span>Current Book Value</span></div>
      </div>
      ${canCreate ? `
      <div class="profile-card" style="max-width:680px; margin-bottom:24px;">
        <h4>🏢 Add Fixed Asset</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Buildings, furniture, computers, lab equipment, vehicles — anything the school owns that loses value over time. Depreciation is calculated automatically using the straight-line method (Cost − Salvage Value) ÷ Useful Life, prorated by how long you've owned it.</p>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="f-field full"><label>Asset Name</label><input type="text" id="assetName" placeholder="e.g. Computer Lab — 20 Desktops"></div>
          <div class="f-field"><label>Category</label><input type="text" id="assetCategory" placeholder="e.g. IT Equipment, Furniture, Vehicle, Building"></div>
          <div class="f-field"><label>Purchase Date</label><input type="date" id="assetPurchaseDate" value="${acctToday()}"></div>
          <div class="f-field"><label>Purchase Cost (₹)</label><input type="number" id="assetCost" min="0" placeholder="0"></div>
          <div class="f-field"><label>Salvage Value (₹)</label><input type="number" id="assetSalvage" min="0" placeholder="0"></div>
          <div class="f-field"><label>Useful Life (Years)</label><input type="number" id="assetLife" min="1" placeholder="e.g. 5"></div>
        </div>
        <button class="btn btn-primary" onclick="saveAcctFixedAsset()">Add Asset</button>
      </div>` : ''}
      <h4 style="margin-bottom:10px;">Fixed Assets Register (${acctFixedAssets.length})</h4>
      <div class="table-wrap">
        <table><thead><tr><th>Asset</th><th>Category</th><th>Purchase Date</th><th>Cost</th><th>Acc. Depreciation</th><th>Book Value</th><th></th></tr></thead>
        <tbody>
        ${acctFixedAssets.length ? acctFixedAssets.map(a => {
          const dep = acctAccumulatedDepreciation(a, acctToday());
          const book = acctAssetBookValue(a, acctToday());
          return `<tr${a.active===false?' style="opacity:0.5;"':''}><td class="name-cell">${a.name}${a.active===false?' <span class="pill" style="font-size:0.6rem;">Disposed</span>':''}</td><td>${a.category||'—'}</td><td>${a.purchaseDate||'—'}</td><td>${fmtMoney(a.purchaseCost)}</td><td style="color:var(--magenta);">${fmtMoney(dep)}</td><td style="font-weight:600;">${fmtMoney(book)}</td><td style="white-space:nowrap;">${canDelete && a.active!==false ? `<button class="btn-danger-text" onclick="disposeAcctFixedAsset('${a.id}')">Mark Disposed</button>` : ''}</td></tr>`;
        }).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No fixed assets recorded yet</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
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
  