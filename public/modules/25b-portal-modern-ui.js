/* ===== Modern Parent / Student portal + Staff Inbox (stage 1) =====
   Loaded after the original portal modules, so the functions below replace
   the older render functions of the same name. All data loading, saving and
   API calls are unchanged — only the presentation is new. Element ids that
   the original handlers rely on (concernRecipientSel, concernReply-<id>,
   submissionMarks-<id> …) are kept. */
let pmNotifFilter = 'all';
let pmContactMode = 'message';   // message | work
let pmThreadFilter = 'all';      // all | open | done
let pmPreHw = '';
let pmDraft = { msg: '', title: '', notes: '', recip: '' };
let pmInboxFilter = 'action';    // action | done | all
let pmInboxQ = '';

function pmEsc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pmJs(s){ return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function pmIcon(n, size){
  const p = {
    bell: '<path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17z"/><path d="M10 21h4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M8 7h7"/>',
    chat: '<path d="M4 5h16v11H9l-5 4V5z"/>', pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7z"/>', clip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>', upload: '<path d="M12 16V5"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16.5 14.5h.01"/>', home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  };
  const s = size || 16;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p[n] || ''}</svg>`;
}
function pmHue(str){ return (String(str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360; }
function pmAvatar(name, photo, size){
  const sz = size || 36;
  if(photo) return `<img class="pm-av" style="width:${sz}px;height:${sz}px" src="${pmEsc(photo)}" alt="">`;
  const parts = String(name || '?').trim().split(/\s+/);
  const ini = ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  return `<span class="pm-av" aria-hidden="true" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz * .38)}px;background:hsl(${pmHue(name)} 52% 40%)">${pmEsc(ini)}</span>`;
}
function pmStaffById(id){ return id ? staffList.find(x => x.id === id) : null; }
function pmStaffName(st){ return st ? ((st.firstName || '') + ' ' + (st.lastName || '')).trim() : ''; }
function pmRel(d){
  if(!d) return '';
  const t = new Date(d).getTime(); if(isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if(mins < 1) return 'just now'; if(mins < 60) return mins + ' min ago';
  const h = Math.round(mins / 60); if(h < 24) return h + ' h ago';
  const dd = Math.round(h / 24); if(dd < 30) return dd + (dd === 1 ? ' day ago' : ' days ago');
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function pmFull(d){ return d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
function pmPill(kind, text, icon){ return `<span class="pm-pill pm-p-${kind}">${icon ? pmIcon(icon, 12) : ''}${pmEsc(text)}</span>`; }
function pmFiles(list){
  return (list || []).map(a => {
    const img = /^data:image\//.test(a.dataUrl || '');
    return img ? `<a class="pm-thumb" href="${pmEsc(a.dataUrl)}" target="_blank" rel="noopener" aria-label="Open image ${pmEsc(a.name)}"><img src="${pmEsc(a.dataUrl)}" alt="${pmEsc(a.name)}"></a>`
      : `<a class="pm-file" href="${pmEsc(a.dataUrl)}" target="_blank" rel="noopener">${pmIcon('clip', 13)}${pmEsc(a.name)}</a>`;
  }).join('');
}
function pmIsParent(){ return !!currentUser && (currentUser.role === 'Student' || currentUser.role === 'Parent'); }

/* ---------- Portal hero (above the tabs) ---------- */
(function(){
  const orig = renderMyProfileBody;
  renderMyProfileBody = async function(){ const r = await orig.apply(this, arguments); try{ pmHero(); }catch(e){ console.warn('pmHero', e); } return r; };
})();
async function pmHero(){
  if(!pmIsParent()) return;
  const view = document.getElementById('view-myprofile'); if(!view) return;
  pmInjectStyle();
  const tabs = view.querySelector('.mf-tabs'); if(!tabs) return;
  let el = document.getElementById('pmHero');
  if(!el){ el = document.createElement('div'); el.id = 'pmHero'; tabs.parentNode.insertBefore(el, tabs); }
  const s = myProfileStudent();
  if(!s){ el.innerHTML = ''; return; }
  try{ await ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData); }catch(_){}
  const cut = new Date(); cut.setDate(cut.getDate() - 30); const cutStr = localDateStr(cut);
  const recs = attendanceRecords.filter(r => r.studentId === s.id && r.date >= cutStr);
  const present = recs.filter(r => r.status === 'Present' || r.status === 'Late').length;
  const att = recs.length ? Math.round(present / recs.length * 100) : null;
  const today = localDateStr(new Date()); const week = new Date(); week.setDate(week.getDate() + 7); const weekStr = localDateStr(week);
  const hw = homeworkItems.filter(h => h.className === s.className && (!h.section || h.section === s.section));
  const due = hw.filter(h => h.dueDate && h.dueDate >= today && h.dueDate <= weekStr).length;
  const over = hw.filter(h => h.dueDate && h.dueDate < today).length;
  const fresh = computeMyNotifications(s).filter(it => it.date > (currentUser.lastNotificationSeenAt || '')).length;
  const ct = staffList.find(st => st.classTeacherClass === s.className && st.classTeacherSection === s.section && staffIsActive(st));
  const stat = (ic, v, l, tone, tab) => `<button type="button" class="pm-stat pm-t-${tone}" onclick="switchMyProfileTab('${tab}')" aria-label="${pmEsc(l)}: ${pmEsc(v)}">${pmIcon(ic, 18)}<b>${pmEsc(v)}</b><span>${pmEsc(l)}</span></button>`;
  el.innerHTML = `<section class="pm-hero" aria-label="Student summary">
    <div class="pm-hero-id">${pmAvatar(s.firstName + ' ' + (s.lastName || ''), s.photo, 64)}
      <div><small>${currentUser.role === 'Parent' ? "Your child" : "Welcome"}</small><h2>${pmEsc(s.firstName)} ${pmEsc(s.lastName || '')}</h2>
      <p>${pmEsc(s.className)} · Section ${pmEsc(s.section)}${s.admissionNo ? ' · Adm. ' + pmEsc(s.admissionNo) : ''}${ct ? ' · Class teacher ' + pmEsc(pmStaffName(ct)) : ''}</p></div></div>
    <div class="pm-stats">
      ${stat('check', att == null ? '—' : att + '%', 'Attendance, 30 days', att == null ? 'mute' : att >= 90 ? 'ok' : att >= 75 ? 'warn' : 'bad', 'notifications')}
      ${stat('book', String(due), 'Homework due this week', due ? 'warn' : 'ok', 'syllabushw')}
      ${stat('alert', String(over), 'Homework overdue', over ? 'bad' : 'ok', 'syllabushw')}
      ${stat('bell', String(fresh), 'New updates', fresh ? 'info' : 'mute', 'notifications')}
    </div></section>`;
}

/* ---------- Notifications: grouped timeline ---------- */
const PM_TAGS = { 'Fee Payment': 'fees', 'Attendance': 'attendance', 'Exam Schedule': 'exams', 'Results': 'exams', 'Notice': 'notices', 'Holiday': 'notices' };
function pmDayLabel(d){
  if(!d) return 'Earlier';
  const t = localDateStr(new Date()); const y = new Date(); y.setDate(y.getDate() - 1);
  if(d === t) return 'Today'; if(d === localDateStr(y)) return 'Yesterday';
  const dt = new Date(d + 'T00:00:00'); return isNaN(dt) ? d : dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}
function pmSetNotifFilter(f){ pmNotifFilter = f; const s = myProfileStudent(); if(s) renderMyNotificationsTab(document.getElementById('myProfileBody'), s, true); }
function renderMyNotificationsTab(body, s, keepSeen){
  pmInjectStyle();
  const all = computeMyNotifications(s);
  const lastSeen = currentUser.lastNotificationSeenAt || '';
  const cnt = k => k === 'all' ? all.length : all.filter(i => PM_TAGS[i.tag] === k).length;
  const items = all.filter(i => pmNotifFilter === 'all' || PM_TAGS[i.tag] === pmNotifFilter);
  const chips = [['all', 'Everything'], ['fees', 'Fees'], ['attendance', 'Attendance'], ['exams', 'Exams & results'], ['notices', 'Notices & holidays']]
    .map(([k, n]) => `<button type="button" class="pm-chip ${pmNotifFilter === k ? 'on' : ''}" aria-pressed="${pmNotifFilter === k}" onclick="pmSetNotifFilter('${k}')">${n}<em>${cnt(k)}</em></button>`).join('');
  const groups = []; const idx = {};
  items.forEach(it => { const k = (it.date || '').slice(0, 10); if(!(k in idx)){ idx[k] = groups.length; groups.push({ k, list: [] }); } groups[idx[k]].list.push(it); });
  const tone = { fees: 'ok', attendance: 'info', exams: 'warn', notices: 'mute' };
  body.innerHTML = `<div class="pm"><div class="pm-chips" role="group" aria-label="Filter updates">${chips}</div>` +
    (groups.length ? groups.map(g => `<section class="pm-day"><h3>${pmEsc(pmDayLabel(g.k))}</h3>${g.list.map(it => {
      const t = tone[PM_TAGS[it.tag]] || 'mute'; const isNew = it.date > lastSeen;
      return `<article class="pm-item ${it.highlight ? 'is-alert' : ''}"><span class="pm-bub pm-t-${it.highlight ? 'bad' : t}">${pmEsc(it.icon)}</span>
        <div class="pm-item-b"><div class="pm-item-h"><span class="pm-tag">${pmEsc(it.tag)}</span>${isNew ? '<span class="pm-new">New</span>' : ''}</div>
        <h4>${pmEsc(it.title)}</h4>${it.detail ? `<p>${pmEsc(it.detail)}</p>` : ''}</div></article>`; }).join('')}</section>`).join('')
      : `<div class="pm-empty">${pmIcon('bell', 28)}<b>You're all caught up</b>Fee payments, attendance, exam schedules, results, holidays and notices will appear here as they happen.</div>`) + `</div>`;
  if(!keepSeen){ currentUser.lastNotificationSeenAt = new Date().toISOString(); storageSet(USERS_KEY, users); updateMyProfileBadge(); setTimeout(pmHero, 50); }
}

/* ---------- Syllabus & Homework ---------- */
function pmSubmitFor(hwId){ pmPreHw = hwId; pmContactMode = 'work'; switchMyProfileTab('contact'); }
function renderMySyllabusHomeworkTab(body, s){
  pmInjectStyle();
  body.innerHTML = '<div class="pm"><div class="pm-empty">Loading…</div></div>';
  loadMyContactData().then(() => { if(myProfileTab === 'syllabushw') pmRenderHomework(body, s); });
}
function pmRenderHomework(body, s){
  const relevantTo = item => item.className === s.className && (!item.section || item.section === s.section);
  const today = localDateStr(new Date()); const soon = new Date(); soon.setDate(soon.getDate() + 3); const soonStr = localDateStr(soon);
  const hw = homeworkItems.filter(relevantTo).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const subFor = id => mySubmissions.find(x => x.homeworkId === id);
  const groups = [
    ['Overdue', 'bad', hw.filter(h => h.dueDate && h.dueDate < today)],
    ['Due in the next 3 days', 'warn', hw.filter(h => h.dueDate && h.dueDate >= today && h.dueDate <= soonStr)],
    ['Upcoming', 'info', hw.filter(h => h.dueDate && h.dueDate > soonStr)],
    ['No due date', 'mute', hw.filter(h => !h.dueDate)],
  ].filter(g => g[2].length);
  const card = (h, tone) => {
    const st = pmStaffById(h.staffId); const sub = subFor(h.id);
    const days = h.dueDate ? Math.round((new Date(h.dueDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5) : null;
    const dueTxt = days == null ? '' : days < 0 ? Math.abs(days) + (Math.abs(days) === 1 ? ' day overdue' : ' days overdue') : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : 'Due in ' + days + ' days';
    return `<article class="pm-hw pm-b-${tone}">
      <div class="pm-hw-h"><span class="pm-subj" style="--h:${pmHue(h.subject)}">${pmEsc(h.subject)}</span>${dueTxt ? pmPill(tone, dueTxt, tone === 'bad' ? 'alert' : 'clock') : ''}${sub ? (sub.status === 'reviewed' ? pmPill('ok', 'Reviewed', 'check') : sub.status === 'resubmit' ? pmPill('bad', 'Resubmit', 'alert') : pmPill('ok', 'Submitted', 'check')) : ''}</div>
      <h4>${pmEsc(h.title)}</h4>
      ${h.description ? `<p class="pm-hw-d">${pmEsc(h.description)}</p>` : ''}
      ${(h.attachments || []).length ? `<div class="pm-files">${pmFiles(h.attachments)}</div>` : ''}
      <div class="pm-hw-f"><span class="pm-by">${st ? pmAvatar(pmStaffName(st), st.photo, 24) + 'Assigned by ' + pmEsc(pmStaffName(st)) : ''}${h.assignedDate ? ' · ' + pmEsc(h.assignedDate) : ''}</span>
        ${sub && sub.status !== 'resubmit' ? '' : `<button type="button" class="pm-btn pm-btn-pri" onclick="pmSubmitFor('${pmJs(h.id)}')">${pmIcon('upload', 14)}${sub ? 'Resubmit' : 'Submit this'}</button>`}</div>
    </article>`;
  };
  const hwHtml = groups.length ? `<div class="pm-hw-grid">${groups.map(([n, t, list]) => `<h3 class="pm-gh">${n} <em>${list.length}</em></h3>${list.map(h => card(h, t)).join('')}`).join('')}</div>`
    : `<div class="pm-empty">${pmIcon('book', 28)}<b>No homework right now</b>New homework will show up here automatically.</div>`;
  const mySyl = syllabusTopics.filter(relevantTo); const by = {};
  mySyl.forEach(t => { (by[t.subject] = by[t.subject] || []).push(t); });
  const subjects = Object.keys(by).sort();
  const sylHtml = subjects.length ? `<div class="pm-syl">${subjects.map(sj => {
    const tp = by[sj]; const done = tp.filter(t => t.status === 'Completed').length; const pct = tp.length ? Math.round(done / tp.length * 100) : 0;
    return `<details class="pm-syl-c"><summary><span class="pm-ring" style="--p:${pct};--h:${pmHue(sj)}"><b>${pct}%</b></span><span class="pm-syl-t"><b>${pmEsc(sj)}</b><small>${done} of ${tp.length} topics done</small></span></summary>
      <ul>${tp.map(t => `<li><span>${pmEsc(t.topic)}</span>${syllabusStatusPill(t.status)}</li>`).join('')}</ul></details>`; }).join('')}</div>`
    : `<div class="pm-empty">${pmIcon('book', 28)}<b>Syllabus not published yet</b>Check back once the school adds it.</div>`;
  body.innerHTML = `<div class="pm"><div class="pm-sec-h"><h2>Homework</h2></div>${hwHtml}<div class="pm-sec-h" style="margin-top:28px"><h2>Syllabus progress</h2></div>${sylHtml}</div>`;
}

/* ---------- Contact & Submit ---------- */
function pmRecipients(s){
  const out = [];
  const ct = staffList.find(st => st.classTeacherClass === s.className && st.classTeacherSection === s.section && staffIsActive(st));
  out.push({ v: 'class_teacher::' + (ct ? ct.id : '') + '::', name: ct ? pmStaffName(ct) : 'Not assigned yet', role: 'Class teacher', photo: ct && ct.photo, off: !ct });
  subjectsList.filter(sub => sub.className === s.className).forEach(sub => subjectStaffForSection(sub, s.section).forEach(id => {
    const st = staffList.find(x => x.id === id && staffIsActive(x)); if(st) out.push({ v: 'subject_teacher::' + st.id + '::' + sub.name, name: pmStaffName(st), role: sub.name + ' teacher', photo: st.photo });
  }));
  out.push({ v: 'management::::', name: 'Management', role: 'Admin / Principal' });
  return out;
}
function pmPickRecipient(v){
  const sel = document.getElementById(pmContactMode === 'message' ? 'concernRecipientSel' : 'submissionRecipientSel'); if(sel) sel.value = v;
  document.querySelectorAll('.pm-rcp').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if(pmContactMode === 'work') pmFixSubmitBtn();
}
function pmFixSubmitBtn(){ /* placeholder for future validation hooks */ }
function pmSetMode(m){
  pmSaveDraft(); pmContactMode = m; const s = myProfileStudent(); if(s) renderMyContactTab(document.getElementById('myProfileBody'), s);
}
function pmSaveDraft(){
  const g = id => { const e = document.getElementById(id); return e ? e.value : null; };
  const a = g('concernMessageInput'); if(a != null) pmDraft.msg = a;
  const t = g('submissionTitleInput'); if(t != null) pmDraft.title = t;
  const n = g('submissionDescInput'); if(n != null) pmDraft.notes = n;
}
function pmSetThreadFilter(f){ pmSaveDraft(); pmThreadFilter = f; const s = myProfileStudent(); if(s) renderMyContactTab(document.getElementById('myProfileBody'), s); }
function pmStepper(steps, at, bad){
  return `<ol class="pm-steps" aria-label="Progress">${steps.map((n, i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''} ${bad && i === at ? 'bad' : ''}"><i>${pmIcon('check', 12)}</i>${pmEsc(n)}</li>`).join('')}</ol>`;
}
function pmThreadConcern(c){
  const st = pmStaffById(c.recipientStaffId); const who = st ? pmStaffName(st) : (c.recipientName || 'Management');
  const solved = c.status !== 'open'; const replied = !!c.replyMessage;
  return `<article class="pm-thread"><header>${pmAvatar(who, st && st.photo, 34)}<div><b>${pmEsc(who)}</b><small>${pmEsc(recipientLabelFor(c))}</small></div>
    ${solved ? pmPill('ok', 'Solved', 'check') : replied ? pmPill('info', 'Replied', 'chat') : pmPill('warn', 'Awaiting reply', 'clock')}</header>
    <div class="pm-bubble pm-me"><p>${pmEsc(c.message)}</p><time>${pmEsc(pmFull(c.createdAt))}</time></div>
    ${replied ? `<div class="pm-bubble pm-them">${pmAvatar(c.repliedBy || who, st && st.photo, 26)}<div><b>${pmEsc(c.repliedBy || who)}</b><p>${pmEsc(c.replyMessage)}</p><time>${pmEsc(pmFull(c.repliedAt))}</time></div></div>` : ''}
    ${pmStepper(['Sent', 'Replied', 'Solved'], solved ? 3 : replied ? 2 : 1)}</article>`;
}
function pmThreadSubmission(x){
  const st = pmStaffById(x.recipientStaffId); const who = st ? pmStaffName(st) : (x.recipientName || 'Management');
  const done = x.status !== 'submitted';
  return `<article class="pm-thread"><header>${pmAvatar(who, st && st.photo, 34)}<div><b>${pmEsc(x.title)}</b><small>To ${pmEsc(who)} · ${pmEsc(recipientLabelFor(x))}</small></div>
    ${x.status === 'reviewed' ? pmPill('ok', 'Reviewed', 'check') : x.status === 'resubmit' ? pmPill('bad', 'Needs resubmission', 'alert') : pmPill('warn', 'Awaiting review', 'clock')}</header>
    ${x.description ? `<div class="pm-bubble pm-me"><p>${pmEsc(x.description)}</p><time>${pmEsc(pmFull(x.createdAt))}</time></div>` : `<time class="pm-time">${pmEsc(pmFull(x.createdAt))}</time>`}
    ${(x.attachments || []).length ? `<div class="pm-files">${pmFiles(x.attachments)}</div>` : ''}
    ${(x.feedback || x.marks) ? `<div class="pm-bubble pm-them">${pmAvatar(x.reviewedBy || who, st && st.photo, 26)}<div><b>${pmEsc(x.reviewedBy || 'Feedback')}${x.marks ? ` <span class="pm-marks">${pmEsc(x.marks)}</span>` : ''}</b>${x.feedback ? `<p>${pmEsc(x.feedback)}</p>` : ''}<time>${pmEsc(pmFull(x.reviewedAt))}</time></div></div>` : ''}
    ${pmStepper(['Submitted', x.status === 'resubmit' ? 'Resubmit' : 'Reviewed'], done ? 2 : 1, x.status === 'resubmit')}</article>`;
}
function renderMyContactTab(body, s){
  pmInjectStyle();
  const rcps = pmRecipients(s);
  const first = rcps.find(r => !r.off) || rcps[0];
  const sel = pmDraft.recip && rcps.some(r => r.v === pmDraft.recip && !r.off) ? pmDraft.recip : first.v;
  const optionsHtml = `<option value="">Select recipient</option>` + rcps.filter(r => !r.off).map(r => `<option value="${pmEsc(r.v)}">${pmEsc(r.name)}</option>`).join('');
  const hws = homeworkItems.filter(h => h.className === s.className && (!h.section || h.section === s.section));
  const chips = rcps.map(r => `<button type="button" class="pm-rcp ${r.v === sel ? 'on' : ''}" data-v="${pmEsc(r.v)}" ${r.off ? 'disabled' : ''} aria-pressed="${r.v === sel}" onclick="pmPickRecipient('${pmJs(r.v)}')">${pmAvatar(r.name, r.photo, 30)}<span><b>${pmEsc(r.name)}</b><small>${pmEsc(r.role)}</small></span></button>`).join('');
  const isMsg = pmContactMode === 'message';
  const compose = isMsg ? `
    <label class="pm-l" for="concernMessageInput">Your message</label>
    <textarea id="concernMessageInput" class="pm-ta" rows="5" maxlength="4000" placeholder="Write your message…">${pmEsc(pmDraft.msg)}</textarea>
    <select id="concernRecipientSel" class="pm-hid" tabindex="-1" aria-hidden="true">${optionsHtml}</select>
    <div class="pm-compose-f"><small>Goes straight to the teacher's inbox.</small><button type="button" class="pm-btn pm-btn-pri" onclick="pmSaveDraft();submitConcern()">${pmIcon('send', 15)}Send message</button></div>` : `
    ${hws.length ? `<label class="pm-l" for="submissionHomeworkSel">Which homework? <i>(optional)</i></label><select id="submissionHomeworkSel" class="pm-in" onchange="autoRouteSubmissionRecipient();pmPickRecipient(document.getElementById('submissionRecipientSel').value)"><option value="">Not listed / holiday work</option>${hws.map(h => `<option value="${pmEsc(h.id)}" data-subject="${pmEsc(h.subject)}" ${h.id === pmPreHw ? 'selected' : ''}>${pmEsc(h.subject)} — ${pmEsc(h.title)}${h.dueDate ? ' (due ' + pmEsc(h.dueDate) + ')' : ''}</option>`).join('')}</select>` : ''}
    <label class="pm-l" for="submissionTitleInput">Title</label><input id="submissionTitleInput" class="pm-in" type="text" maxlength="300" placeholder="e.g. Maths worksheet, Holiday project" value="${pmEsc(pmDraft.title)}">
    <label class="pm-l" for="submissionDescInput">Notes <i>(optional)</i></label><textarea id="submissionDescInput" class="pm-ta" rows="3" placeholder="Anything you'd like to add…">${pmEsc(pmDraft.notes)}</textarea>
    <select id="submissionRecipientSel" class="pm-hid" tabindex="-1" aria-hidden="true">${optionsHtml}</select>
    <label class="pm-drop" for="submissionAttachmentInput">${pmIcon('upload', 22)}<b>Add photos or files</b><small>Images, PDF, Word, Excel · up to 5 files, 12 MB total</small></label>
    <input type="file" id="submissionAttachmentInput" class="pm-hid" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple onchange="previewSubmissionAttachment(event)">
    <div id="submissionAttachmentPreview" class="pm-files"></div>
    <div class="pm-compose-f"><small>Your teacher will review it and add feedback.</small><button type="button" class="pm-btn pm-btn-pri" onclick="pmSaveDraft();submitWork()">${pmIcon('upload', 15)}Submit work</button></div>`;
  const openC = myConcerns.filter(c => c.status === 'open').length, openS = mySubmissions.filter(x => x.status === 'submitted').length;
  const isOpen = it => it.status === 'open' || it.status === 'submitted';
  const feed = (isMsg ? myConcerns : mySubmissions).filter(it => pmThreadFilter === 'all' || (pmThreadFilter === 'open' ? isOpen(it) : !isOpen(it)))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const fchips = [['all', 'All'], ['open', 'Waiting'], ['done', isMsg ? 'Answered' : 'Reviewed']].map(([k, n]) => `<button type="button" class="pm-chip ${pmThreadFilter === k ? 'on' : ''}" aria-pressed="${pmThreadFilter === k}" onclick="pmSetThreadFilter('${k}')">${n}</button>`).join('');
  body.innerHTML = `<div class="pm"><div class="pm-seg" role="tablist" aria-label="What would you like to do">
      <button type="button" role="tab" aria-selected="${isMsg}" class="${isMsg ? 'on' : ''}" onclick="pmSetMode('message')">${pmIcon('chat', 16)}Message a teacher${openC ? `<em>${openC}</em>` : ''}</button>
      <button type="button" role="tab" aria-selected="${!isMsg}" class="${!isMsg ? 'on' : ''}" onclick="pmSetMode('work')">${pmIcon('upload', 16)}Submit homework${openS ? `<em>${openS}</em>` : ''}</button></div>
    <div class="pm-two">
      <section class="pm-compose" aria-label="${isMsg ? 'New message' : 'Submit homework'}"><h3>${isMsg ? 'New message' : 'Submit homework or holiday work'}</h3>
        <div class="pm-l">Send to</div><div class="pm-rcps" role="group" aria-label="Recipient">${chips}</div>${compose}</section>
      <section class="pm-feed" aria-label="History"><div class="pm-sec-h"><h3>${isMsg ? 'Your messages' : 'Your submissions'}</h3><div class="pm-chips">${fchips}</div></div>
        ${feed.length ? feed.map(isMsg ? pmThreadConcern : pmThreadSubmission).join('') : `<div class="pm-empty">${pmIcon(isMsg ? 'chat' : 'upload', 26)}<b>${isMsg ? 'No messages yet' : 'Nothing submitted yet'}</b>${isMsg ? 'Replies from teachers show up here.' : 'Reviewed work and teacher feedback show up here.'}</div>`}</section>
    </div></div>`;
  pmPickRecipient(sel);
  renderSubmissionAttachmentPreview();
  if(!isMsg && pmPreHw){ const hs = document.getElementById('submissionHomeworkSel'); if(hs && hs.value){ autoRouteSubmissionRecipient(); const rs = document.getElementById('submissionRecipientSel'); if(rs && rs.value) pmPickRecipient(rs.value); } pmPreHw = ''; }
}
(function(){
  // After a successful send the original code re-renders; clear the draft text then.
  const oc = submitConcern, ow = submitWork;
  submitConcern = async function(){ const r = await oc.apply(this, arguments); pmDraft.msg = ''; return r; };
  submitWork = async function(){ const r = await ow.apply(this, arguments); pmDraft.title = ''; pmDraft.notes = ''; return r; };
})();

/* ---------- Staff Inbox ---------- */
function pmInboxSet(f){ pmInboxFilter = f; renderInboxBody(); }
function pmInboxSearch(v){ pmInboxQ = v; renderInboxBody(); const e = document.getElementById('pmInboxQ'); if(e){ e.focus(); try{ e.setSelectionRange(v.length, v.length); }catch(_){} } }
function pmQuick(id, kind, text){
  const ta = document.getElementById((kind === 'c' ? 'concernReply-' : 'submissionFeedback-') + id); if(!ta) return;
  ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + ' ' : '') + text; ta.focus();
}
function pmInboxHead(tiles, chips){
  return `<div class="pm"><div class="pm-kpis">${tiles.map(t => `<div class="pm-kpi pm-t-${t[3] || 'mute'}"><span>${pmEsc(t[0])}</span><b>${pmEsc(t[1])}</b><small>${pmEsc(t[2])}</small></div>`).join('')}</div>
    <div class="pm-bar"><div class="pm-chips" role="group" aria-label="Filter">${chips}</div><label class="pm-search">${pmIcon('search', 15)}<span class="pm-sr">Search</span><input id="pmInboxQ" type="search" placeholder="Search student, class, message…" value="${pmEsc(pmInboxQ)}" oninput="pmInboxSearch(this.value)"></label></div>`;
}
const PM_QUICK_C = ['Thank you for letting us know. I will look into it.', 'Please meet me at school tomorrow to discuss this.', 'This has been taken care of. Please let me know if it continues.'];
const PM_QUICK_S = ['Well done!', 'Good effort — please be neater next time.', 'Please redo and resubmit with the corrections.'];
function renderInboxConcerns(body){
  pmInjectStyle();
  const list = inboxConcerns; const q = pmInboxQ.trim().toLowerCase();
  const open = list.filter(c => c.status === 'open'), solved = list.filter(c => c.status !== 'open');
  const oldest = open.length ? Math.max(...open.map(c => daysAgo(c.createdAt))) : 0;
  const rt = list.filter(c => c.repliedAt).map(c => (new Date(c.repliedAt) - new Date(c.createdAt)) / 36e5);
  const avg = rt.length ? rt.reduce((a, b) => a + b, 0) / rt.length : null;
  const fmt = h => h == null ? '—' : h < 1 ? '<1h' : h < 48 ? Math.round(h) + 'h' : (Math.round(h / 24 * 10) / 10) + 'd';
  const chips = [['action', 'Needs reply', open.length], ['done', 'Solved', solved.length], ['all', 'All', list.length]].map(([k, n, c]) => `<button type="button" class="pm-chip ${pmInboxFilter === k ? 'on' : ''}" aria-pressed="${pmInboxFilter === k}" onclick="pmInboxSet('${k}')">${n}<em>${c}</em></button>`).join('');
  let rows = list.filter(c => pmInboxFilter === 'all' || (pmInboxFilter === 'action' ? c.status === 'open' : c.status !== 'open'))
    .filter(c => !q || (c.studentName + ' ' + c.className + ' ' + c.message + ' ' + (c.recipientName || '')).toLowerCase().includes(q));
  rows.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (a.status === 'open' ? (a.createdAt || '').localeCompare(b.createdAt || '') : (b.createdAt || '').localeCompare(a.createdAt || '')));
  const note = isManagementUser() ? `<p class="pm-note">Showing every concern school-wide, including ones addressed to a class or subject teacher, so you can step in if one has gone unanswered.</p>` : '';
  const cards = rows.map(c => {
    const age = c.status === 'open' ? daysAgo(c.createdAt) : 0;
    const st = pmStaffById(c.recipientStaffId);
    return `<article class="pm-card ${c.status === 'open' ? (age >= 2 ? 'is-late' : 'is-open') : 'is-done'}">
      <header>${pmAvatar(c.studentName, '', 40)}<div class="pm-card-t"><b>${pmEsc(c.studentName)}</b><small>${pmEsc(c.className)} · Section ${pmEsc(c.section)} · to ${pmEsc(st ? pmStaffName(st) : (c.recipientName || 'Management'))} (${pmEsc(recipientLabelFor(c))})</small></div>
        ${c.status === 'open' ? (age >= 2 ? pmPill('bad', age + ' days, no action', 'alert') : pmPill('warn', 'Awaiting reply', 'clock')) : pmPill('ok', 'Solved', 'check')}</header>
      <div class="pm-bubble pm-me"><p>${pmEsc(c.message)}</p><time>${pmEsc(pmFull(c.createdAt))} · ${pmEsc(pmRel(c.createdAt))}</time></div>
      ${c.replyMessage ? `<div class="pm-bubble pm-them">${pmAvatar(c.repliedBy || 'R', '', 26)}<div><b>${pmEsc(c.repliedBy || 'Reply')}</b><p>${pmEsc(c.replyMessage)}</p><time>${pmEsc(pmFull(c.repliedAt))}</time></div></div>` :
      `<div class="pm-reply"><label class="pm-sr" for="concernReply-${pmEsc(c.id)}">Reply</label><textarea id="concernReply-${pmEsc(c.id)}" class="pm-ta" rows="2" placeholder="Type your reply…"></textarea>
        <div class="pm-quick">${PM_QUICK_C.map(t => `<button type="button" onclick="pmQuick('${pmJs(c.id)}','c','${pmJs(t)}')">${pmEsc(t.length > 30 ? t.slice(0, 28) + '…' : t)}</button>`).join('')}</div>
        <button type="button" class="pm-btn pm-btn-pri" onclick="sendConcernReply('${pmJs(c.id)}')">${pmIcon('send', 14)}Send reply</button></div>`}
      <footer>${c.status === 'resolved' ? `<span>${pmIcon('check', 13)} Solved${c.resolvedBy ? ' by ' + pmEsc(c.resolvedBy) : ''}${c.resolvedAt ? ' · ' + pmEsc(new Date(c.resolvedAt).toLocaleDateString('en-IN')) : ''}</span><button type="button" class="pm-btn" onclick="setConcernResolved('${pmJs(c.id)}',false)">Reopen</button>` : `<button type="button" class="pm-btn" onclick="setConcernResolved('${pmJs(c.id)}',true)">${pmIcon('check', 14)}Mark as solved</button>`}</footer></article>`;
  }).join('');
  body.innerHTML = note + pmInboxHead([['Needs reply', String(open.length), 'parents waiting', open.length ? 'bad' : 'ok'], ['Oldest waiting', open.length ? oldest + 'd' : '—', 'without a reply', oldest >= 2 ? 'bad' : 'mute'], ['Solved', String(solved.length), 'all time', 'ok'], ['Avg reply time', fmt(avg), 'across replied concerns', avg != null && avg > 48 ? 'bad' : 'info']], chips) +
    (rows.length ? `<div class="pm-cards">${cards}</div>` : `<div class="pm-empty">${pmIcon('chat', 28)}<b>${pmInboxFilter === 'action' ? 'No concerns waiting' : 'Nothing here'}</b>Concerns addressed to you will show up here.</div>`) + `</div>`;
  const tb = document.getElementById('inboxtab-concerns'); if(tb) tb.innerHTML = `💬 Concerns${open.length ? ' (' + open.length + ')' : ''}`;
}
function renderInboxSubmissions(body){
  pmInjectStyle();
  const list = inboxSubmissions; const q = pmInboxQ.trim().toLowerCase();
  const wait = list.filter(x => x.status === 'submitted'), done = list.filter(x => x.status !== 'submitted');
  const oldest = wait.length ? Math.max(...wait.map(x => daysAgo(x.createdAt))) : 0;
  const chips = [['action', 'To review', wait.length], ['done', 'Reviewed', done.length], ['all', 'All', list.length]].map(([k, n, c]) => `<button type="button" class="pm-chip ${pmInboxFilter === k ? 'on' : ''}" aria-pressed="${pmInboxFilter === k}" onclick="pmInboxSet('${k}')">${n}<em>${c}</em></button>`).join('');
  let rows = list.filter(x => pmInboxFilter === 'all' || (pmInboxFilter === 'action' ? x.status === 'submitted' : x.status !== 'submitted'))
    .filter(x => !q || (x.studentName + ' ' + x.className + ' ' + x.title + ' ' + (x.description || '')).toLowerCase().includes(q));
  rows.sort((a, b) => (a.status === 'submitted' ? 0 : 1) - (b.status === 'submitted' ? 0 : 1) || (a.status === 'submitted' ? (a.createdAt || '').localeCompare(b.createdAt || '') : (b.createdAt || '').localeCompare(a.createdAt || '')));
  const note = isManagementUser() ? `<p class="pm-note">Showing every submission school-wide, including ones addressed to a class or subject teacher, so you can step in if one has gone unreviewed.</p>` : '';
  const cards = rows.map(x => {
    const age = x.status === 'submitted' ? daysAgo(x.createdAt) : 0;
    const st = pmStaffById(x.recipientStaffId);
    return `<article class="pm-card ${x.status === 'submitted' ? (age >= 3 ? 'is-late' : 'is-open') : 'is-done'}">
      <header>${pmAvatar(x.studentName, '', 40)}<div class="pm-card-t"><b>${pmEsc(x.title)}</b><small>${pmEsc(x.studentName)} · ${pmEsc(x.className)} ${pmEsc(x.section)} · to ${pmEsc(st ? pmStaffName(st) : (x.recipientName || 'Management'))} (${pmEsc(recipientLabelFor(x))})</small></div>
        ${x.status === 'submitted' ? (age >= 3 ? pmPill('bad', age + ' days waiting', 'alert') : pmPill('warn', 'New', 'clock')) : x.status === 'resubmit' ? pmPill('bad', 'Needs resubmission', 'alert') : pmPill('ok', 'Reviewed', 'check')}</header>
      ${x.description ? `<div class="pm-bubble pm-me"><p>${pmEsc(x.description)}</p><time>${pmEsc(pmFull(x.createdAt))} · ${pmEsc(pmRel(x.createdAt))}</time></div>` : `<time class="pm-time">${pmEsc(pmFull(x.createdAt))} · ${pmEsc(pmRel(x.createdAt))}</time>`}
      ${(x.attachments || []).length ? `<div class="pm-files">${pmFiles(x.attachments)}</div>` : ''}
      ${x.status !== 'submitted' ? `<div class="pm-bubble pm-them">${pmAvatar(x.reviewedBy || 'R', '', 26)}<div><b>${pmEsc(x.reviewedBy || 'Reviewed')}${x.marks ? ` <span class="pm-marks">${pmEsc(x.marks)}</span>` : ''}</b>${x.feedback ? `<p>${pmEsc(x.feedback)}</p>` : ''}<time>${pmEsc(pmFull(x.reviewedAt))}</time></div></div>` :
      `<div class="pm-reply"><div class="pm-row"><label class="pm-sr" for="submissionMarks-${pmEsc(x.id)}">Marks or grade</label><input id="submissionMarks-${pmEsc(x.id)}" class="pm-in" style="max-width:170px" type="text" placeholder="Marks / grade (optional)"></div>
        <label class="pm-sr" for="submissionFeedback-${pmEsc(x.id)}">Feedback</label><textarea id="submissionFeedback-${pmEsc(x.id)}" class="pm-ta" rows="2" placeholder="Feedback for the student (optional)…"></textarea>
        <div class="pm-quick">${PM_QUICK_S.map(t => `<button type="button" onclick="pmQuick('${pmJs(x.id)}','s','${pmJs(t)}')">${pmEsc(t.length > 30 ? t.slice(0, 28) + '…' : t)}</button>`).join('')}</div>
        <div class="pm-row"><button type="button" class="pm-btn pm-btn-pri" onclick="markSubmissionReviewed('${pmJs(x.id)}','reviewed')">${pmIcon('check', 14)}Mark reviewed</button><button type="button" class="pm-btn" onclick="markSubmissionReviewed('${pmJs(x.id)}','resubmit')">Needs resubmission</button></div></div>`}</article>`;
  }).join('');
  body.innerHTML = note + pmInboxHead([['To review', String(wait.length), 'submissions waiting', wait.length ? 'warn' : 'ok'], ['Oldest waiting', wait.length ? oldest + 'd' : '—', 'without review', oldest >= 3 ? 'bad' : 'mute'], ['Reviewed', String(done.length), 'all time', 'ok']], chips) +
    (rows.length ? `<div class="pm-cards">${cards}</div>` : `<div class="pm-empty">${pmIcon('upload', 28)}<b>${pmInboxFilter === 'action' ? 'Nothing to review' : 'Nothing here'}</b>Homework and holiday-work submissions addressed to you will show up here.</div>`) + `</div>`;
  const tb = document.getElementById('inboxtab-submissions'); if(tb) tb.innerHTML = `📥 Submissions${wait.length ? ' (' + wait.length + ')' : ''}`;
}
(function(){ const o = switchInboxTab; switchInboxTab = function(t){ pmInboxFilter = 'action'; pmInboxQ = ''; return o.apply(this, arguments); }; })();

/* ---------- Styles ---------- */
function pmInjectStyle(){
  if(document.getElementById('pmStyle')) return;
  const s = document.createElement('style'); s.id = 'pmStyle';
  s.textContent = `
.pm,.pm-hero{--pm-ok:#16a37f;--pm-warn:#d99a1c;--pm-bad:#e0245e;--pm-info:#2F80ED;--pm-mute:#8b86a3;--pm-line:var(--border);color:var(--ink);font-size:.9rem}
.pm *,.pm-hero *{box-sizing:border-box}
.pm button,.pm-hero button{font-family:inherit;cursor:pointer}
.pm button:focus-visible,.pm a:focus-visible,.pm input:focus-visible,.pm select:focus-visible,.pm textarea:focus-visible,.pm summary:focus-visible,.pm-hero button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.pm-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pm-hid{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
#view-myprofile>.topbar{display:none}
#view-myprofile .mf-tabs{position:sticky;top:0;z-index:20;flex-wrap:wrap;background:var(--cream);padding:8px 0;margin-bottom:16px}@media(max-width:700px){#view-myprofile .mf-tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}}
#view-myprofile .mf-tabs::-webkit-scrollbar{display:none}
#view-myprofile .mf-tab{white-space:nowrap;flex:none;font-weight:600;padding:9px 14px!important;font-size:.82rem}
#view-myprofile .mf-tab.active{background:var(--navy)!important;color:#fff!important;box-shadow:0 8px 18px -10px rgba(22,16,51,.6)}
.pm-hero{display:flex;gap:18px;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:20px 24px;border-radius:20px;color:#fff;margin-bottom:14px;background:radial-gradient(700px 260px at 95% -30%,rgba(209,16,115,.55),transparent 60%),radial-gradient(500px 240px at 0% 130%,rgba(203,154,46,.35),transparent 60%),linear-gradient(135deg,var(--navy-deep),var(--navy));box-shadow:var(--shadow)}
.pm-hero h2{margin:2px 0 2px;font-size:1.45rem;color:#fff;letter-spacing:-.01em}.pm-hero small{opacity:.8;font-size:.72rem;text-transform:uppercase;letter-spacing:.1em}.pm-hero p{margin:0;opacity:.85;font-size:.8rem}
.pm-hero-id{display:flex;gap:14px;align-items:center}
.pm-stats{display:grid;grid-template-columns:repeat(4,minmax(96px,1fr));gap:10px;flex:1;min-width:300px;max-width:560px}
.pm-stat{display:flex;flex-direction:column;gap:2px;text-align:left;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:#fff;border-radius:14px;padding:10px 12px;backdrop-filter:blur(6px)}
.pm-stat:hover{background:rgba(255,255,255,.18)}.pm-stat b{font-size:1.35rem;line-height:1.1}.pm-stat span{font-size:.68rem;opacity:.85}.pm-stat svg{opacity:.9}
.pm-stat.pm-t-bad svg{color:#ff8fb3}.pm-stat.pm-t-ok svg{color:#6ef0c4}.pm-stat.pm-t-warn svg{color:#ffd37a}
@media(max-width:640px){.pm-hero{padding:16px}.pm-stats{grid-template-columns:repeat(2,1fr);min-width:0;max-width:none;width:100%}}
.pm-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:700;object-fit:cover;flex:none;border:2px solid rgba(255,255,255,.35)}
.pm .pm-av{border-color:transparent}
.pm-pill{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:3px 10px;font-size:.7rem;font-weight:700;white-space:nowrap}
.pm-p-ok{background:var(--success-bg);color:var(--success-ink)}.pm-p-warn{background:var(--warning-bg);color:var(--warning-ink)}.pm-p-bad{background:var(--danger-bg);color:var(--danger-ink)}.pm-p-info{background:var(--info-bg);color:var(--info-ink)}.pm-p-mute{background:rgba(120,116,150,.16);color:var(--ink-soft)}
.pm-chips{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}
.pm-chip{border:1px solid var(--pm-line);background:var(--white);color:var(--ink-soft);padding:6px 13px;border-radius:99px;font-size:.78rem;font-weight:600;display:inline-flex;gap:7px;align-items:center;min-height:34px}
.pm-chip em,.pm-seg em{font-style:normal;font-size:.68rem;font-weight:700;background:rgba(33,26,78,.1);border-radius:99px;padding:1px 7px}
.pm-chip.on{background:var(--navy);color:#fff;border-color:var(--navy)}.pm-chip.on em{background:rgba(255,255,255,.25)}
.pm-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--pm-line);background:var(--white);color:var(--navy);padding:8px 14px;border-radius:10px;font-weight:600;font-size:.8rem;min-height:38px;transition:transform .12s,box-shadow .12s}
.pm-btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px -8px rgba(22,16,51,.4)}.pm-btn-pri{background:var(--magenta);border-color:var(--magenta);color:#fff}.pm-btn-pri:hover{background:var(--magenta-deep)}.pm-btn:disabled{opacity:.6;cursor:not-allowed}
.pm-empty{text-align:center;padding:34px 16px;color:var(--ink-soft);display:flex;flex-direction:column;gap:4px;align-items:center;border:1px dashed var(--pm-line);border-radius:16px;background:var(--white)}.pm-empty b{color:var(--navy);font-size:1rem}
.pm-note{font-size:.78rem;color:var(--ink-soft);margin:0 0 12px}
.pm-sec-h{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}.pm-sec-h h2,.pm-sec-h h3{margin:0;color:var(--navy)}.pm-sec-h .pm-chips{margin:0}
/* timeline */
.pm-day{margin-bottom:18px}.pm-day h3{font-size:.76rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft);margin:0 0 8px}
.pm-item{display:flex;gap:12px;background:var(--white);border:1px solid var(--pm-line);border-radius:14px;padding:12px 14px;margin-bottom:8px}.pm-item.is-alert{border-left:4px solid var(--pm-bad)}
.pm-bub{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex:none}
.pm-bub.pm-t-ok{background:var(--success-bg)}.pm-bub.pm-t-info{background:var(--info-bg)}.pm-bub.pm-t-warn{background:var(--warning-bg)}.pm-bub.pm-t-mute{background:rgba(120,116,150,.14)}.pm-bub.pm-t-bad{background:var(--danger-bg)}
.pm-item-b{min-width:0}.pm-item-h{display:flex;gap:8px;align-items:center}.pm-tag{font-size:.66rem;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);font-weight:700}
.pm-new{background:var(--magenta);color:#fff;border-radius:99px;font-size:.62rem;font-weight:800;padding:1px 8px}
.pm-item h4{margin:3px 0 2px;font-size:.92rem;color:var(--navy)}.pm-item p{margin:2px 0 0;color:var(--ink-soft);font-size:.8rem;white-space:pre-wrap;word-break:break-word}
/* homework */
.pm-sec{margin-bottom:20px}.pm-sec h3{margin:0 0 10px;font-size:.95rem;color:var(--navy)}.pm-sec h3 em{font-style:normal;font-size:.7rem;background:rgba(33,26,78,.1);border-radius:99px;padding:1px 8px;margin-left:6px}
.pm-gh{grid-column:1/-1;margin:6px 0 0;font-size:.95rem;color:var(--navy)}.pm-gh em{font-style:normal;font-size:.7rem;background:rgba(33,26,78,.1);border-radius:99px;padding:1px 8px;margin-left:6px}
.pm-hw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.pm-hw{background:var(--white);border:1px solid var(--pm-line);border-top:4px solid var(--c,var(--pm-mute));border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px}
.pm-b-bad{--c:var(--pm-bad)}.pm-b-warn{--c:var(--pm-warn)}.pm-b-info{--c:var(--pm-info)}.pm-b-mute{--c:var(--pm-mute)}
.pm-hw-h{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.pm-hw h4{margin:0;color:var(--navy);font-size:.98rem}.pm-hw-d{margin:0;color:var(--ink-soft);font-size:.8rem;white-space:pre-wrap;word-break:break-word}
.pm-subj{background:hsl(var(--h) 70% 93%);color:hsl(var(--h) 55% 28%);border-radius:8px;padding:3px 10px;font-size:.72rem;font-weight:700}
[data-theme="dark"] .pm-subj{background:hsl(var(--h) 40% 24%);color:hsl(var(--h) 80% 85%)}
.pm-hw-f{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:auto;flex-wrap:wrap}.pm-by{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;color:var(--ink-soft)}
.pm-files{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}.pm-file{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--pm-line);border-radius:8px;padding:4px 9px;font-size:.74rem;color:var(--navy);text-decoration:none;background:var(--cream)}
.pm-thumb{width:64px;height:64px;border-radius:10px;overflow:hidden;border:1px solid var(--pm-line)}.pm-thumb img{width:100%;height:100%;object-fit:cover}
.pm-syl{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;align-items:start}
.pm-syl-c{background:var(--white);border:1px solid var(--pm-line);border-radius:16px;padding:6px 14px}.pm-syl-c summary{display:flex;gap:12px;align-items:center;cursor:pointer;padding:8px 0;list-style:none}.pm-syl-c summary::-webkit-details-marker{display:none}
.pm-syl-t{display:flex;flex-direction:column}.pm-syl-t small{color:var(--ink-soft)}
.pm-ring{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:conic-gradient(hsl(var(--h) 60% 42%) calc(var(--p)*1%),rgba(33,26,78,.1) 0)}.pm-ring b{width:36px;height:36px;border-radius:50%;background:var(--white);display:flex;align-items:center;justify-content:center;font-size:.68rem}
.pm-syl-c ul{list-style:none;margin:0;padding:4px 0 8px}.pm-syl-c li{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--pm-line);font-size:.82rem}
/* contact */
.pm-seg{display:inline-flex;background:var(--white);border:1px solid var(--pm-line);border-radius:14px;padding:4px;margin-bottom:16px;max-width:100%;overflow-x:auto}
.pm-seg button{border:0;background:transparent;padding:9px 16px;border-radius:10px;font-weight:700;font-size:.84rem;color:var(--ink-soft);display:inline-flex;gap:8px;align-items:center;white-space:nowrap}
.pm-seg button.on{background:var(--navy);color:#fff}.pm-seg button.on em{background:rgba(255,255,255,.25)}
.pm-two{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:18px;align-items:start}@media(max-width:900px){.pm-two{grid-template-columns:1fr}}
.pm-compose{background:var(--white);border:1px solid var(--pm-line);border-radius:18px;padding:18px;position:sticky;top:64px}@media(max-width:900px){.pm-compose{position:static}}
.pm-compose h3{margin:0 0 12px;color:var(--navy);font-size:1rem}
.pm-l{display:block;font-size:.74rem;font-weight:700;color:var(--ink-soft);margin:12px 0 6px;text-transform:uppercase;letter-spacing:.05em}.pm-l i{font-weight:400;text-transform:none}
.pm-rcps{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto;padding:2px}
.pm-rcp{display:flex;gap:10px;align-items:center;text-align:left;border:1.5px solid var(--pm-line);background:var(--cream);border-radius:12px;padding:7px 10px;color:var(--ink)}
.pm-rcp span{display:flex;flex-direction:column;min-width:0}.pm-rcp small{color:var(--ink-soft);font-size:.7rem}.pm-rcp.on{border-color:var(--magenta);background:var(--danger-bg)}.pm-rcp:disabled{opacity:.5;cursor:not-allowed}
.pm-ta,.pm-in{width:100%;border:1.5px solid var(--pm-line);border-radius:12px;padding:10px 12px;font:inherit;background:var(--white);color:var(--ink);resize:vertical}
.pm-ta:focus,.pm-in:focus{border-color:var(--navy);outline:none;box-shadow:0 0 0 3px rgba(33,26,78,.12)}
.pm-drop{display:flex;flex-direction:column;align-items:center;gap:2px;border:2px dashed var(--pm-line);border-radius:14px;padding:16px;margin-top:12px;color:var(--ink-soft);cursor:pointer;text-align:center}.pm-drop:hover{border-color:var(--navy);background:var(--cream)}.pm-drop b{color:var(--navy)}.pm-drop small{font-size:.72rem}
.pm-compose-f{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}.pm-compose-f small{color:var(--ink-soft);font-size:.74rem}
.pm-feed .pm-thread,.pm-card{background:var(--white);border:1px solid var(--pm-line);border-radius:16px;padding:14px;margin-bottom:12px}
.pm-thread header,.pm-card header{display:flex;gap:10px;align-items:center;margin-bottom:10px}.pm-thread header>div,.pm-card-t{display:flex;flex-direction:column;flex:1;min-width:0}.pm-thread header b,.pm-card-t b{color:var(--navy);overflow:hidden;text-overflow:ellipsis}.pm-thread small,.pm-card-t small{color:var(--ink-soft);font-size:.72rem}
.pm-bubble{max-width:92%;border-radius:14px;padding:9px 12px;margin:6px 0;font-size:.86rem}.pm-bubble p{margin:2px 0;white-space:pre-wrap;word-break:break-word}.pm-bubble time,.pm-time{display:block;font-size:.68rem;color:var(--ink-soft);margin-top:3px}
.pm-me{background:var(--info-bg);margin-left:auto;border-bottom-right-radius:4px}.pm-them{display:flex;gap:8px;background:var(--success-bg);border-bottom-left-radius:4px}.pm-them b{font-size:.74rem;color:var(--success-ink)}
.pm-marks{background:var(--success-ink);color:#fff;border-radius:6px;padding:1px 7px;font-size:.7rem;margin-left:4px}
.pm-steps{list-style:none;display:flex;gap:6px;margin:14px 0 0;padding:0}
.pm-steps li{flex:1;border-top:4px solid var(--pm-line);padding-top:6px;font-size:.7rem;color:var(--ink-soft);display:flex;align-items:center;gap:5px;border-radius:2px}
.pm-steps li i{display:none}.pm-steps li.done{border-top-color:var(--pm-ok);color:var(--ink);font-weight:600}.pm-steps li.now{border-top-color:var(--pm-warn);color:var(--ink);font-weight:700}.pm-steps li.now.bad{border-top-color:var(--pm-bad)}
.pm-steps li.done i{display:inline-flex;color:var(--pm-ok)}
/* inbox */
.pm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.pm-kpi{background:var(--white);border:1px solid var(--pm-line);border-left:5px solid var(--c,var(--pm-mute));border-radius:14px;padding:12px 14px;display:flex;flex-direction:column}
.pm-kpi span{font-size:.72rem;font-weight:700;color:var(--ink-soft)}.pm-kpi b{font-size:1.7rem;line-height:1.15;color:var(--ink)}.pm-kpi small{font-size:.7rem;color:var(--ink-soft)}
.pm-kpi.pm-t-ok{--c:var(--pm-ok)}.pm-kpi.pm-t-warn{--c:var(--pm-warn)}.pm-kpi.pm-t-bad{--c:var(--pm-bad)}.pm-kpi.pm-t-info{--c:var(--pm-info)}
.pm-bar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:6px}.pm-bar .pm-chips{margin:0}
.pm-search{display:flex;align-items:center;gap:8px;background:var(--white);border:1px solid var(--pm-line);border-radius:12px;padding:0 12px;color:var(--ink-soft);min-width:240px}.pm-search input{border:0;outline:0;background:transparent;padding:9px 0;width:100%;font:inherit;color:var(--ink)}
.pm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px;align-items:start;margin-top:10px}@media(max-width:520px){.pm-cards{grid-template-columns:1fr}}
.pm-card{border-left:4px solid var(--pm-mute);margin-bottom:0}.pm-card.is-open{border-left-color:var(--pm-warn)}.pm-card.is-late{border-left-color:var(--pm-bad)}.pm-card.is-done{border-left-color:var(--pm-ok)}
.pm-card footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--pm-line);font-size:.76rem;color:var(--ink-soft);flex-wrap:wrap}
.pm-reply{margin-top:8px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}.pm-reply .pm-ta,.pm-reply .pm-in{width:100%}.pm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pm-quick{display:flex;gap:6px;flex-wrap:wrap}.pm-quick button{border:1px solid var(--pm-line);background:var(--cream);color:var(--ink-soft);border-radius:99px;padding:4px 10px;font-size:.7rem}.pm-quick button:hover{border-color:var(--navy);color:var(--navy)}
@media(prefers-reduced-motion:reduce){.pm *,.pm-hero *{animation:none!important;transition:none!important}}
`;
  document.head.appendChild(s);
}
