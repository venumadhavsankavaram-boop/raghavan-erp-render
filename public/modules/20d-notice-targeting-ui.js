/* ============================================================================
   Notice Board with targeting. Each notice chooses:
     WHERE it goes  - Public website, In-App (portal / inbox), Push, WhatsApp
     WHO sees it    - All students & parents, All staff, Teachers, Everyone,
                      a Class, a Class + Section, or one Student
   The public website only ever receives notices with "Website" ticked (the
   server enforces this); a parent only sees notices addressed to their child.
   Overrides renderNoticeBoard (20b), postQuickNotice / saveNoticeEdit (20).
   ========================================================================== */
let nbxWeb = false, nbxInApp = true, nbxPush = false, nbxWa = false;
let nbxScope = 'allstudents', nbxClass = '', nbxSection = '', nbxIndId = '';
let nbxFilter = 'all';
let nbxWaQueue = null;

const NBX_SCOPES = [
  ['allstudents', 'All students & parents'],
  ['allstaff', 'All staff'],
  ['teachers', 'Teachers only'],
  ['everyone', 'Everyone (students + staff)'],
  ['class', 'A particular class'],
  ['section', 'A class & section'],
  ['individual', 'One student']
];

function nbxIsTeacher(st){ return /teach/i.test(st.designation || '') || !!st.classTeacherClass; }
function nbxStudentTargets(list){ return list.filter(isActive).map(s => ({ kind: 'student', student: s })); }
function nbxStaffTargets(list){ return list.filter(staffIsActive).map(st => ({ kind: 'staff', staff: st })); }
function nbxErpOn(){ return nbxInApp || nbxPush || nbxWa; }
function nbxTargets(){
  if(!nbxErpOn()) return [];
  switch(nbxScope){
    case 'allstudents': return nbxStudentTargets(students);
    case 'allstaff': return nbxStaffTargets(staffList);
    case 'teachers': return nbxStaffTargets(staffList.filter(nbxIsTeacher));
    case 'everyone': return nbxStudentTargets(students).concat(nbxStaffTargets(staffList));
    case 'class': return nbxClass ? nbxStudentTargets(students.filter(s => s.className === nbxClass)) : [];
    case 'section': return nbxClass && nbxSection ? nbxStudentTargets(students.filter(s => s.className === nbxClass && s.section === nbxSection)) : [];
    case 'individual': { const s = students.find(x => x.id === nbxIndId); return s ? [{ kind: 'student', student: s }] : []; }
  }
  return [];
}
function nbxAudienceLabel(){
  if(!nbxErpOn()) return 'Public website';
  switch(nbxScope){
    case 'allstudents': return 'All Students & Parents';
    case 'allstaff': return 'All Staff';
    case 'teachers': return 'Teachers';
    case 'everyone': return 'Everyone (students + staff)';
    case 'class': return `${nbxClass} (Whole Class)`;
    case 'section': return `${nbxClass} — Section ${nbxSection}`;
    case 'individual': { const s = students.find(x => x.id === nbxIndId); return s ? `${s.firstName} ${s.lastName} (${s.className} ${s.section})` : 'One student'; }
  }
  return '';
}

/* Does this notice show to a given student? Used by the parent portal. */
function nbxVisibleToStudent(n, s){
  if(!n || n.boardRemoved || !s) return false;
  if(!(n.channels || []).includes('In-App')) return false;
  const sc = n.audienceScope;
  if(!sc){
    const l = String(n.audienceLabel || '');
    if(/^all staff/i.test(l)) return false;
    if(l.includes(' — Section ')){ const p = l.split(' — Section '); return p[0] === s.className && p[1] === s.section; }
    if(/\(Whole Class\)$/.test(l)) return l.replace(/\s*\(Whole Class\)$/, '') === s.className;
    return true;
  }
  if(sc === 'allstudents' || sc === 'everyone') return true;
  if(sc === 'class') return n.audienceClass === s.className;
  if(sc === 'section') return n.audienceClass === s.className && n.audienceSection === s.section;
  if(sc === 'individual') return n.individualId === s.id;
  return false;
}
function nbxIsWebsite(n){
  if(n.boardRemoved) return false;
  if(n.toWebsite !== undefined) return !!n.toWebsite;
  return (n.channels || []).includes('In-App') && !n.audienceScope;
}
function nbxOnBoard(n){ return !n.boardRemoved && ((n.channels || []).includes('In-App') || (n.channels || []).includes('Website') || n.toWebsite === true); }
function nbxIsErp(n){ return (n.channels || []).includes('In-App') || (n.audienceScope && n.audienceScope !== 'web'); }

/* ---------- composer ---------- */
function nbxToggle(which){
  if(which === 'web') nbxWeb = !nbxWeb;
  if(which === 'inapp') nbxInApp = !nbxInApp;
  if(which === 'push') nbxPush = !nbxPush;
  if(which === 'wa') nbxWa = !nbxWa;
  nbxPaintComposer();
}
function nbxSetScope(v){ nbxScope = v; nbxPaintComposer(); }
function nbxChip(on, icon, title, sub, key){
  return `<button type="button" class="nbx-chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="nbxToggle('${key}')">
    <span class="nbx-chip-ic" aria-hidden="true">${icon}</span><span><b>${title}</b><small>${sub}</small></span><i class="nbx-tick" aria-hidden="true">${on ? '✓' : ''}</i></button>`;
}
function nbxPaintComposer(){
  const box = document.getElementById('nbxComposer');
  if(!box) return;
  const erp = nbxErpOn();
  box.innerHTML = `
    <div class="nbx-sec">
      <div class="nbx-lbl">1 · Where should it appear?</div>
      <div class="nbx-chips">
        ${nbxChip(nbxWeb, '🌐', 'Public website', 'Anyone visiting the school site', 'web')}
        ${nbxChip(nbxInApp, '📱', 'In-App', 'Parent portal &amp; staff inbox', 'inapp')}
        ${nbxChip(nbxPush, '🔔', 'Push alert', 'Phone notification', 'push')}
        ${nbxChip(nbxWa, '💬', 'WhatsApp', 'Pre-filled chats you send', 'wa')}
      </div>
    </div>
    <div class="nbx-sec" ${erp ? '' : 'hidden'}>
      <div class="nbx-lbl">2 · Who should get it?</div>
      <div class="nbx-seg" role="group" aria-label="Audience">${NBX_SCOPES.map(([k, t]) => `<button type="button" class="${nbxScope === k ? 'on' : ''}" onclick="nbxSetScope('${k}')">${t}</button>`).join('')}</div>
      <div class="form-grid nbx-aud">
        ${nbxScope === 'class' || nbxScope === 'section' ? `<div class="f-field"><label>Class</label><select onchange="nbxClass=this.value;nbxPaintSummary()"><option value="">Select class</option>${CLASS_LEVELS.map(c => `<option ${c === nbxClass ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` : ''}
        ${nbxScope === 'section' ? `<div class="f-field"><label>Section</label><select onchange="nbxSection=this.value;nbxPaintSummary()"><option value="">Select section</option>${SECTIONS.map(s => `<option ${s === nbxSection ? 'selected' : ''}>${s}</option>`).join('')}</select></div>` : ''}
        ${nbxScope === 'individual' ? `<div class="f-field full nbx-find"><label>Student</label><input type="text" id="nbxFind" autocomplete="off" placeholder="Type a name…" oninput="nbxFindStudent(this.value)" value="${nbxIndId ? escapeHtml(nbxAudienceLabel()) : ''}"><div id="nbxFound" class="nbx-found"></div></div>` : ''}
      </div>
    </div>
    <div class="nbx-summary" id="nbxSummary" role="status"></div>`;
  nbxPaintSummary();
}
function nbxFindStudent(q){
  const out = document.getElementById('nbxFound'); if(!out) return;
  q = q.trim().toLowerCase();
  if(q.length < 2){ out.innerHTML = ''; return; }
  const m = students.filter(s => isActive(s) && `${s.firstName} ${s.lastName} ${s.admissionNo}`.toLowerCase().includes(q)).slice(0, 8);
  out.innerHTML = m.length ? m.map(s => `<button type="button" onclick="nbxPickStudent('${s.id}')"><b>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</b><small>${escapeHtml(s.admissionNo || '')} · ${escapeHtml(s.className)} ${escapeHtml(s.section || '')}</small></button>`).join('') : '<div class="nbx-none">No student matches.</div>';
}
function nbxPickStudent(id){ nbxIndId = id; const i = document.getElementById('nbxFind'); if(i) i.value = nbxAudienceLabel(); const o = document.getElementById('nbxFound'); if(o) o.innerHTML = ''; nbxPaintSummary(); }
function nbxPaintSummary(){
  const el = document.getElementById('nbxSummary'); if(!el) return;
  const where = [nbxWeb && 'Public website', nbxInApp && 'In-App', nbxPush && 'Push alert', nbxWa && 'WhatsApp'].filter(Boolean);
  if(!where.length){ el.className = 'nbx-summary is-warn'; el.textContent = 'Choose at least one place for this notice to appear.'; return; }
  const t = nbxTargets();
  let who = '';
  if(nbxErpOn()){
    const st = t.filter(x => x.kind === 'student').length, sf = t.filter(x => x.kind === 'staff').length;
    const parts = [st && `${st} student${st === 1 ? '' : 's'} / parents`, sf && `${sf} staff`].filter(Boolean);
    who = t.length ? ` → ${nbxAudienceLabel()}: ${parts.join(' + ')}` : ' → pick the audience above';
  }
  el.className = 'nbx-summary' + (nbxErpOn() && !t.length ? ' is-warn' : '');
  el.innerHTML = `<b>Will go to:</b> ${where.join(' · ')}${escapeHtml(who)}${nbxWeb ? '<br><small>Visible to everyone on the internet. Keep it suitable for the public.</small>' : ''}`;
}

async function postQuickNotice(){
  const type = await resolveCommsType('nbType', 'nbNewTypeName');
  if(!type){ showToast('Enter a name for the new heading.'); return; }
  const title = document.getElementById('nbTitle').value.trim();
  const bodyText = document.getElementById('nbBody').value.trim();
  if(!title){ showToast('Enter a title.'); return; }
  if(!bodyText){ showToast('Enter a message.'); return; }
  if(!nbxWeb && !nbxErpOn()){ showToast('Choose where this notice should appear.'); return; }
  const targets = nbxTargets();
  if(nbxErpOn() && !targets.length){ showToast('No recipients match this audience — pick who should get it.'); return; }
  const linkEl = document.getElementById('nbLink');
  const link = cleanNoticeLink(linkEl ? linkEl.value : '');
  if(!link.ok){ showToast('That link doesn\'t look right — use a web address like https://example.com/page'); return; }
  const channels = [nbxWeb && 'Website', nbxInApp && 'In-App', nbxPush && 'Push', nbxWa && 'WhatsApp'].filter(Boolean);
  const erp = nbxErpOn();
  const record = {
    id: 'msg_' + Date.now(), type, title, body: bodyText, link: link.value,
    audienceScope: erp ? nbxScope : 'web', audienceClass: nbxClass, audienceSection: nbxSection, individualId: nbxIndId,
    audienceLabel: nbxAudienceLabel(), channels, toWebsite: nbxWeb, recipientCount: targets.length,
    sentBy: currentUser.name, sentDate: new Date().toISOString().slice(0, 10)
  };
  commsMessages.push(record);
  await storageSet(COMMS_MESSAGES_KEY, commsMessages);
  if(nbxInApp || nbxPush){
    const studentIds = targets.filter(t => t.kind === 'student').map(t => t.student.id);
    const staffIds = targets.filter(t => t.kind === 'staff').map(t => t.staff.id);
    if(studentIds.length || staffIds.length){
      fetch('/api/notifications/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...actorHeaders() },
        body: JSON.stringify({ title, body: bodyText, type: 'circular', url: '/?view=myprofile', studentIds, staffIds, push: nbxPush })
      }).catch(err => console.error('notification broadcast failed:', err));
    }
  }
  nbxWaQueue = nbxWa ? { title, body: bodyText, targets } : null;
  renderNoticeBoard(document.getElementById('noticeBoardBody'));
  const bits = [nbxWeb && 'the website', nbxInApp && 'In-App', nbxPush && 'push', nbxWa && 'the WhatsApp list'].filter(Boolean);
  showToast(`Notice posted to ${bits.join(', ')}.`, 'burst');
  nbxWeb = false;
}

function nbxWaPanel(){
  if(!nbxWaQueue) return '';
  const q = nbxWaQueue;
  const withPhone = q.targets.filter(t => commsTargetPhone(t));
  return `<section class="sf-card nbx-wa">
    <div class="nbx-wa-head"><h3 class="cm-h">💬 Send on WhatsApp</h3><button type="button" class="nbx-x" onclick="nbxWaQueue=null;renderNoticeBoard(document.getElementById('noticeBoardBody'))" aria-label="Close">×</button></div>
    <p class="cm-sub">WhatsApp needs your confirmation for every message. Tap <b>Open WhatsApp</b> for each person, then press Send there. ${withPhone.length} of ${q.targets.length} have a phone number on file.</p>
    <div class="table-wrap"><table class="iv-table"><thead><tr><th>Name</th><th>Phone</th><th></th></tr></thead><tbody>
      ${withPhone.length ? withPhone.map(t => {
        const phone = commsTargetPhone(t).replace(/\D/g, '');
        const text = `*${q.title}*\n${commsPersonalize(q.body, t)}`;
        return `<tr><td><b>${escapeHtml(commsTargetName(t))}</b></td><td>${escapeHtml(commsTargetPhone(t))}</td><td><a class="sf-btn sf-btn--soft" target="_blank" rel="noopener" href="https://wa.me/91${phone}?text=${encodeURIComponent(text)}">Open WhatsApp</a></td></tr>`;
      }).join('') : '<tr><td colspan="3"><div class="empty-state"><b>No phone numbers on file</b></div></td></tr>'}
    </tbody></table></div></section>`;
}

/* ---------- board ---------- */
function nbxSetFilter(f){ nbxFilter = f; renderNoticeBoard(document.getElementById('noticeBoardBody')); }
function nbxNoteBadges(n){
  const out = [];
  if(nbxIsWebsite(n)) out.push('<span class="sf-badge sf-badge--paid"><span aria-hidden="true">🌐</span>On website</span>');
  if(nbxIsErp(n)) out.push(`<span class="sf-badge sf-badge--upcoming"><span aria-hidden="true">👥</span>${cmEsc(n.audienceLabel)}${Number(n.recipientCount) ? ' · ' + cmEsc(n.recipientCount) : ''}</span>`);
  (n.channels || []).filter(c => c === 'Push' || c === 'WhatsApp').forEach(c => out.push(`<span class="sf-badge sf-badge--upcoming">${c === 'Push' ? '🔔 Push' : '💬 WhatsApp'}</span>`));
  return out.join('');
}
function renderNoticeBoard(body){
  if(!body) return;
  const all = commsMessages.filter(nbxOnBoard).slice().sort((a, b) => b.id.localeCompare(a.id));
  const web = all.filter(nbxIsWebsite), erp = all.filter(nbxIsErp);
  const list = nbxFilter === 'web' ? web : nbxFilter === 'erp' ? all.filter(n => nbxIsErp(n) && !nbxIsWebsite(n)) : all;
  const canCreate = canSub('noticeboard_post', 'noticeboard', 'create');
  const canEditNb = canSub('noticeboard_post', 'noticeboard', 'edit');
  const canDeleteNb = canSub('noticeboard_post', 'noticeboard', 'delete');
  const canCreateHeading = canSub('noticeboard_headings', 'noticeboard', 'create');
  const canDeleteHeading = canSub('noticeboard_headings', 'noticeboard', 'delete');
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = all.filter(n => (n.sentDate || '').startsWith(month)).length;
  body.innerHTML = `
    <section class="cm-web" aria-label="How targeting works">
      <span class="cm-web-dot" aria-hidden="true"></span>
      <div><b>You choose where each notice goes</b>
        <small>Only notices with <span class="nbx-em">Public website</span> ticked appear on the school website. Everything else stays inside the ERP and reaches just the people you pick.</small></div>
    </section>
    <section class="sf-kpis">
      ${sfKpi('On the website', web.length, 'plain', 'public notices')}
      ${sfKpi('Inside the ERP', erp.length, 'plain', 'portal / staff inbox')}
      ${sfKpi('This month', thisMonth, 'plain')}
    </section>
    ${canCreate ? `<section class="sf-card cm-post">
      <h3 class="cm-h">✍️ Post a new notice</h3>
      <p class="cm-sub">Write it once, then pick where it goes and who gets it.</p>
      <div class="form-grid">
        <div class="f-field"><label>Type / Heading</label><select id="nbType" onchange="onNbTypeChange()">${noticeTypes.map(t => `<option value="${cmEsc(t.name)}">${t.icon} ${cmEsc(t.name)}</option>`).join('')}<option value="__new__">+ New Heading...</option></select></div>
        <div class="f-field full" id="nbNewTypeField" style="display:none;"><label>New Heading Name</label><input type="text" id="nbNewTypeName" placeholder="e.g. Sports Day Update"></div>
        <div class="f-field full"><label>Title <span class="required-star">*</span></label><input type="text" id="nbTitle" placeholder="e.g. Diwali Holidays Announcement"></div>
        <div class="f-field full"><label>Message <span class="required-star">*</span></label><textarea id="nbBody" rows="4" placeholder="Type the notice..."></textarea></div>
        <div class="f-field full"><label>Read-more link <small>(optional)</small></label><input type="text" id="nbLink" inputmode="url" placeholder="https://… — adds a “Read more →” link"></div>
      </div>
      <div id="nbxComposer"></div>
      ${sfBtn('primary', '', 'Post notice', 'postQuickNotice()', 'sf-btn--lg')}
    </section>` : ''}
    ${nbxWaPanel()}
    <section class="sf-card cm-headings">
      <button type="button" class="cm-toggle" onclick="cmToggleHeadings()" aria-expanded="${cmHeadingsOpen}">
        <span>🏷️ Notice headings <small>${noticeTypes.length}</small></span><span aria-hidden="true">${cmHeadingsOpen ? '▴' : '▾'}</span>
      </button>
      <div class="cm-headings-body" ${cmHeadingsOpen ? '' : 'hidden'}>
        <div class="cm-chips">${noticeTypes.map((t, i) => `<span class="cm-chip">${t.icon} ${cmEsc(t.name)}${canDeleteHeading ? `<button type="button" title="Remove heading" onclick="removeNoticeType(${i})">✕</button>` : ''}</span>`).join('')}</div>
        ${canCreateHeading ? `<div class="cm-addrow"><input class="input" id="newNoticeTypeName" placeholder="New heading, e.g. Sports Day Update">${sfBtn('soft', '', 'Add heading', 'addNoticeTypeDirect()')}</div>` : ''}
      </div>
    </section>
    <div class="nbx-feedbar">
      <h3 class="cm-h cm-feedtitle">On the board</h3>
      <div class="sf-segments" role="group" aria-label="Filter notices">
        <button type="button" class="${nbxFilter === 'all' ? 'active' : ''}" onclick="nbxSetFilter('all')">All ${all.length}</button>
        <button type="button" class="${nbxFilter === 'web' ? 'active' : ''}" onclick="nbxSetFilter('web')">🌐 Website ${web.length}</button>
        <button type="button" class="${nbxFilter === 'erp' ? 'active' : ''}" onclick="nbxSetFilter('erp')">ERP only</button>
      </div>
    </div>
    <div class="cm-feed">
    ${list.length ? list.map(n => {
      if(n.id === editingNoticeId){
        return `<article class="sf-card cm-note">
          <div class="f-field full" style="margin-bottom:10px;"><label>Title</label><input type="text" id="editNoticeTitle" value="${cmEsc(n.title)}"></div>
          <div class="f-field full" style="margin-bottom:10px;"><label>Message</label><textarea id="editNoticeBody" rows="5">${cmEsc(n.body)}</textarea></div>
          <div class="f-field full" style="margin-bottom:10px;"><label>Read-more link <small>(optional)</small></label><input type="text" id="editNoticeLink" value="${cmEsc(n.link || '')}" placeholder="https://…"></div>
          <label class="nbx-inline"><input type="checkbox" id="editNoticeWeb" ${nbxIsWebsite(n) ? 'checked' : ''}> Show on the public website</label>
          <div class="cm-actions">${sfBtn('link', '', 'Cancel', 'cancelNoticeEdit()')}${sfBtn('primary', '', 'Save changes', `saveNoticeEdit('${n.id}')`)}</div>
        </article>`;
      }
      const t = noticeTypeByName(n.type);
      return `<article class="sf-card cm-note">
        <div class="cm-note-head"><span class="cm-type">${t ? t.icon : '📣'} ${cmEsc(n.type)}</span><span class="cm-date">${cmEsc(n.sentDate)}</span></div>
        <h4>${cmEsc(n.title)}</h4>
        <p class="cm-body">${cmEsc(n.body)}</p>
        ${n.link ? `<a class="cm-link" href="${cmEsc(n.link)}" target="_blank" rel="noopener noreferrer">🔗 ${cmEsc(n.link.replace(/^https?:\/\//, '').slice(0, 48))}</a>` : ''}
        <div class="cm-note-foot">
          ${nbxNoteBadges(n)}
          <span class="cm-by">by ${cmEsc(n.sentBy)}</span>
          <span class="cm-actions">
            ${canEditNb ? sfBtn('soft', '', 'Edit', `editNotice('${n.id}')`) : ''}
            ${canDeleteNb ? sfBtn('danger', '', 'Take down', `deleteNotice('${n.id}')`) : ''}
          </span>
        </div>
      </article>`;
    }).join('') : `<div class="empty-state"><b>${all.length ? 'Nothing in this filter' : 'No notices posted yet'}</b>${all.length ? 'Try another filter above.' : 'Post one above to get started.'}</div>`}
    </div>`;
  if(canCreate) nbxPaintComposer();
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
  const web = !!document.getElementById('editNoticeWeb').checked;
  const ch = (n.channels || []).filter(c => c !== 'Website');
  if(!web && !ch.includes('In-App')){ showToast('This notice is only on the website — use "Take down" to remove it.'); return; }
  n.title = title; n.body = bodyText; n.link = link.value;
  n.toWebsite = web;
  n.channels = web ? ['Website'].concat(ch) : ch;
  await storageSet(COMMS_MESSAGES_KEY, commsMessages);
  editingNoticeId = '';
  renderNoticeBoard(document.getElementById('noticeBoardBody'));
  showToast('Notice updated.', 'burst');
}
