/* ============================================================================
   Communication screens: Notice Board, Sent Messages log, Website Inquiries
   and Website Gallery. Presentation only. Posting, editing, taking down,
   status changes, "Add as Student" and the gallery upload/delete still call the
   functions in module 20 (postQuickNotice, saveNoticeEdit, setInquiryStatus,
   convertInquiryToStudent, saveGalleryPhoto, ...) and every element id they
   read is kept. Shares the Student Fees look (sfKpi, sfBtn, .sf-card, .sf-badge).
   ========================================================================== */

let cmInqFilter = 'all';
let cmInqSearch = '';
let cmGalFilter = 'all';
let cmLogSearch = '';
let cmHeadingsOpen = false;

function cmEsc(v){ return escapeHtml(v == null ? '' : String(v)); }

/* ---------- Notice Board ---------- */

function renderNoticeBoard(body){
  const notices = commsMessages.filter(m => m.channels.includes('In-App') && !m.boardRemoved).slice().sort((a, b) => b.id.localeCompare(a.id));
  const canCreate = canSub('noticeboard_post', 'noticeboard', 'create');
  const canEditNb = canSub('noticeboard_post', 'noticeboard', 'edit');
  const canDeleteNb = canSub('noticeboard_post', 'noticeboard', 'delete');
  const canCreateHeading = canSub('noticeboard_headings', 'noticeboard', 'create');
  const canDeleteHeading = canSub('noticeboard_headings', 'noticeboard', 'delete');
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = notices.filter(n => (n.sentDate || '').startsWith(month)).length;
  body.innerHTML = `
    <section class="cm-web" aria-label="Website connection">
      <span class="cm-web-dot" aria-hidden="true"></span>
      <div><b>Live on your public website</b>
        <small>Everything below appears under “Latest School Announcements &amp; News” on the school website within moments. ${notices.length ? '' : 'Until you post one, visitors see the website’s built-in sample notices.'}</small></div>
    </section>
    <section class="sf-kpis">
      ${sfKpi('Live notices', notices.length, 'plain', 'on the board and website')}
      ${sfKpi('This month', thisMonth, 'plain')}
      ${sfKpi('Headings', noticeTypes.length, 'plain')}
    </section>
    ${canCreate ? `<section class="sf-card cm-post">
      <h3 class="cm-h">✍️ Post a new notice</h3>
      <p class="cm-sub">Goes straight to this board and the public website — no need to go through Compose.</p>
      <div class="form-grid">
        <div class="f-field"><label>Type / Heading</label><select id="nbType" onchange="onNbTypeChange()">${noticeTypes.map(t => `<option value="${cmEsc(t.name)}">${t.icon} ${cmEsc(t.name)}</option>`).join('')}<option value="__new__">+ New Heading...</option></select></div>
        <div class="f-field"><label>Audience</label>
          <select id="nbScope" onchange="nbAudienceScope=this.value; renderNbAudienceFields();">
            <option value="allstudents" ${nbAudienceScope === 'allstudents' ? 'selected' : ''}>All Students (Parents)</option>
            <option value="allstaff" ${nbAudienceScope === 'allstaff' ? 'selected' : ''}>All Staff</option>
            <option value="class" ${nbAudienceScope === 'class' ? 'selected' : ''}>Specific Class</option>
            <option value="section" ${nbAudienceScope === 'section' ? 'selected' : ''}>Specific Class &amp; Section</option>
          </select>
        </div>
        <div class="f-field full" id="nbNewTypeField" style="display:none;"><label>New Heading Name</label><input type="text" id="nbNewTypeName" placeholder="e.g. Sports Day Update"></div>
        <div class="f-field full"><label>Title <span class="required-star">*</span></label><input type="text" id="nbTitle" placeholder="e.g. Diwali Holidays Announcement"></div>
        <div class="f-field full"><label>Message <span class="required-star">*</span></label><textarea id="nbBody" rows="4" placeholder="Type the notice..."></textarea></div>
        <div class="f-field full"><label>Read-more link <small>(optional)</small></label><input type="text" id="nbLink" inputmode="url" placeholder="https://… — adds a “Read more →” link on the website"></div>
      </div>
      <div id="nbAudienceFields" style="margin:10px 0;"></div>
      ${sfBtn('primary', '', 'Post to Notice Board', 'postQuickNotice()', 'sf-btn--lg')}
    </section>` : ''}
    <section class="sf-card cm-headings">
      <button type="button" class="cm-toggle" onclick="cmToggleHeadings()" aria-expanded="${cmHeadingsOpen}">
        <span>🏷️ Notice headings <small>${noticeTypes.length}</small></span><span aria-hidden="true">${cmHeadingsOpen ? '▴' : '▾'}</span>
      </button>
      <div class="cm-headings-body" ${cmHeadingsOpen ? '' : 'hidden'}>
        <div class="cm-chips">${noticeTypes.map((t, i) => `<span class="cm-chip">${t.icon} ${cmEsc(t.name)}${canDeleteHeading ? `<button type="button" title="Remove heading" onclick="removeNoticeType(${i})">✕</button>` : ''}</span>`).join('')}</div>
        ${canCreateHeading ? `<div class="cm-addrow"><input class="input" id="newNoticeTypeName" placeholder="New heading, e.g. Sports Day Update">${sfBtn('soft', '', 'Add heading', 'addNoticeTypeDirect()')}</div>` : ''}
      </div>
    </section>
    <h3 class="cm-h cm-feedtitle">On the board</h3>
    <div class="cm-feed">
    ${notices.length ? notices.map(n => {
      if(n.id === editingNoticeId){
        return `<article class="sf-card cm-note">
          <div class="f-field full" style="margin-bottom:10px;"><label>Title</label><input type="text" id="editNoticeTitle" value="${cmEsc(n.title)}"></div>
          <div class="f-field full" style="margin-bottom:10px;"><label>Message</label><textarea id="editNoticeBody" rows="5">${cmEsc(n.body)}</textarea></div>
          <div class="f-field full" style="margin-bottom:10px;"><label>Read-more link <small>(optional)</small></label><input type="text" id="editNoticeLink" value="${cmEsc(n.link || '')}" placeholder="https://…"></div>
          <div class="cm-actions">${sfBtn('link', '', 'Cancel', 'cancelNoticeEdit()')}${sfBtn('primary', '', 'Save changes', `saveNoticeEdit('${n.id}')`)}</div>
        </article>`;
      }
      const t = noticeTypeByName(n.type);
      return `<article class="sf-card cm-note">
        <div class="cm-note-head">
          <span class="cm-type">${t ? t.icon : '📣'} ${cmEsc(n.type)}</span>
          <span class="cm-date">${cmEsc(n.sentDate)}</span>
        </div>
        <h4>${cmEsc(n.title)}</h4>
        <p class="cm-body">${cmEsc(n.body)}</p>
        ${n.link ? `<a class="cm-link" href="${cmEsc(n.link)}" target="_blank" rel="noopener noreferrer">🔗 ${cmEsc(n.link.replace(/^https?:\/\//, '').slice(0, 48))}</a>` : ''}
        <div class="cm-note-foot">
          <span class="sf-badge sf-badge--upcoming"><span aria-hidden="true">👥</span>${cmEsc(n.audienceLabel)} · ${cmEsc(n.recipientCount)}</span>
          <span class="cm-by">by ${cmEsc(n.sentBy)}</span>
          <span class="cm-actions">
            ${canEditNb ? sfBtn('soft', '', 'Edit', `editNotice('${n.id}')`) : ''}
            ${canDeleteNb ? sfBtn('danger', '', 'Take down', `deleteNotice('${n.id}')`) : ''}
          </span>
        </div>
      </article>`;
    }).join('') : `<div class="empty-state"><b>No notices posted yet</b>Post one above, or tick "In-App Notice Board" when composing a message.</div>`}
    </div>
    <p class="cm-foot">🔌 Notices with "In-App Notice Board" on go straight to this ERP's database, so the public website picks them up on its own.</p>`;
  if(typeof renderNbAudienceFields === 'function' && canCreate) renderNbAudienceFields();
}
function cmToggleHeadings(){
  cmHeadingsOpen = !cmHeadingsOpen;
  const box = document.querySelector('.cm-headings-body'), btn = document.querySelector('.cm-toggle');
  if(box) box.hidden = !cmHeadingsOpen;
  if(btn){ btn.setAttribute('aria-expanded', cmHeadingsOpen); btn.lastElementChild.textContent = cmHeadingsOpen ? '▴' : '▾'; }
}

/* ---------- Sent messages log ---------- */

function cmLogRows(){
  const q = cmLogSearch.trim().toLowerCase();
  return commsMessages.slice().sort((a, b) => b.id.localeCompare(a.id))
    .filter(m => !q || `${m.title} ${m.type} ${m.audienceLabel} ${m.sentBy}`.toLowerCase().includes(q));
}
function onCmLogSearch(v){ cmLogSearch = v; paintCmLog(); }
function paintCmLog(){
  const tb = document.getElementById('cmLogRows'); if(!tb) return;
  const rows = cmLogRows();
  tb.innerHTML = rows.map(m => `<tr>
    <td>${cmEsc(m.sentDate)}</td><td><span class="cm-type">${cmEsc(m.type)}</span></td>
    <td><b>${cmEsc(m.title)}</b></td><td>${cmEsc(m.audienceLabel)}</td><td>${cmEsc(m.recipientCount)}</td>
    <td>${(m.channels || []).map(c => `<span class="sf-badge sf-badge--upcoming">${cmEsc(c)}</span>`).join(' ')}</td><td>${cmEsc(m.sentBy)}</td></tr>`).join('');
  document.getElementById('cmLogEmpty').innerHTML = rows.length ? '' : '<div class="empty-state"><b>No messages found</b>Sent messages will be listed here.</div>';
  const n = document.getElementById('cmLogShown'); if(n) n.textContent = `${rows.length} shown`;
}
function renderCommsLog(body){
  cmLogSearch = '';
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = commsMessages.filter(m => (m.sentDate || '').startsWith(month));
  const reach = commsMessages.reduce((t, m) => t + (Number(m.recipientCount) || 0), 0);
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Messages sent', commsMessages.length, 'plain')}
      ${sfKpi('This month', thisMonth.length, 'plain')}
      ${sfKpi('Total recipients', reach, 'plain', 'across all messages')}
    </section>
    <div class="iv-toolbar">
      <input class="input iv-search" type="search" placeholder="Search title, type, audience or sender…" oninput="onCmLogSearch(this.value)">
      <span class="iv-count" id="cmLogShown"></span>
    </div>
    <div class="sf-card"><div class="table-wrap" style="overflow-x:auto;">
      <table class="iv-table"><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Audience</th><th>Recipients</th><th>Channels</th><th>Sent by</th></tr></thead><tbody id="cmLogRows"></tbody></table>
      <div id="cmLogEmpty"></div>
    </div></div>`;
  paintCmLog();
}

/* ---------- Website inquiries ---------- */

const CM_INQ_STATUSES = ['New', 'Contacted', 'Converted', 'Declined'];
const CM_INQ_TONE = { New: 'overdue', Contacted: 'upcoming', Converted: 'paid', Declined: 'due' };
const CM_INQ_ICON = { New: '●', Contacted: '☎', Converted: '✓', Declined: '✕' };

function cmInqList(){
  const q = cmInqSearch.trim().toLowerCase();
  return admissionInquiries.slice().sort((a, b) => (b.submittedDate || '').localeCompare(a.submittedDate || ''))
    .filter(x => cmInqFilter === 'all' || (x.status || 'New') === cmInqFilter)
    .filter(x => !q || `${x.studentName} ${x.parentName} ${x.parentPhone} ${x.parentEmail} ${x.applyingGrade}`.toLowerCase().includes(q));
}
function cmInqSetFilter(f){
  cmInqFilter = f;
  document.querySelectorAll('#cmInqSeg button').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  paintCmInq();
}
function onCmInqSearch(v){ cmInqSearch = v; paintCmInq(); }
function paintCmInq(){
  const tb = document.getElementById('cmInqRows'); if(!tb) return;
  const canEditInq = canDo('websiteinquiries', 'edit');
  const rows = cmInqList();
  tb.innerHTML = rows.map(q => {
    const st = q.status || 'New';
    return `<tr>
      <td>${cmEsc(q.submittedDate) || '—'}</td>
      <td><b>${cmEsc(q.studentName) || '—'}</b><small>${cmEsc(q.applyingGrade) || ''}</small></td>
      <td>${cmEsc(q.parentName) || '—'}<small>${cmEsc(q.parentPhone) || ''}${q.parentEmail ? ' · ' + cmEsc(q.parentEmail) : ''}</small></td>
      <td class="cm-notes">${cmEsc(q.notes) || '—'}</td>
      <td><span class="sf-badge sf-badge--${CM_INQ_TONE[st] || 'upcoming'}"><span aria-hidden="true">${CM_INQ_ICON[st] || '●'}</span>${cmEsc(st)}</span>
        ${canEditInq ? `<select class="cm-status" aria-label="Change status" onchange="setInquiryStatus('${q.id}', this.value); cmInqStatusChanged()">${CM_INQ_STATUSES.map(s => `<option ${st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>` : ''}</td>
      <td class="sf-actions">${canEditInq ? sfBtn('soft', '', 'Add as student', `convertInquiryToStudent('${q.id}')`) : ''}</td>
    </tr>`;
  }).join('');
  document.getElementById('cmInqEmpty').innerHTML = rows.length ? '' : '<div class="empty-state"><b>No inquiries here</b>Submissions from the website\'s Admissions Inquiry Form will show up here.</div>';
  const n = document.getElementById('cmInqShown'); if(n) n.textContent = `${rows.length} shown`;
}
function cmInqStatusChanged(){ setTimeout(() => { const b = document.getElementById('websiteInquiriesBody'); if(b) renderAdmissionInquiries(b); }, 150); }
function renderAdmissionInquiries(body){
  const count = s => admissionInquiries.filter(x => (x.status || 'New') === s).length;
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('New', count('New'), count('New') ? 'danger' : 'plain', 'waiting for a call')}
      ${sfKpi('Contacted', count('Contacted'), 'plain')}
      ${sfKpi('Converted', count('Converted'), 'good', 'became students')}
      ${sfKpi('Declined', count('Declined'), 'plain')}
    </section>
    <div class="iv-toolbar">
      <div class="sf-segments" id="cmInqSeg" role="group" aria-label="Filter by status">
        <button type="button" data-f="all" class="${cmInqFilter === 'all' ? 'active' : ''}" onclick="cmInqSetFilter('all')">All</button>
        ${CM_INQ_STATUSES.map(s => `<button type="button" data-f="${s}" class="${cmInqFilter === s ? 'active' : ''}" onclick="cmInqSetFilter('${s}')">${s}</button>`).join('')}
      </div>
      <input class="input iv-search" type="search" value="${cmEsc(cmInqSearch)}" placeholder="Search student, parent, phone or email…" oninput="onCmInqSearch(this.value)">
      <span class="iv-count" id="cmInqShown"></span>
    </div>
    <div class="sf-card"><div class="table-wrap" style="overflow-x:auto;">
      <table class="iv-table std-table"><thead><tr><th>Date</th><th>Student</th><th>Parent</th><th>Notes</th><th>Status</th><th></th></tr></thead><tbody id="cmInqRows"></tbody></table>
      <div id="cmInqEmpty"></div>
    </div></div>
    <p class="cm-foot">Inquiries from the school website's Admissions Inquiry Form arrive here automatically, whichever device the visitor used.</p>`;
  paintCmInq();
}

/* ---------- Website gallery ---------- */

function cmGalSetFilter(f){ cmGalFilter = f; renderWebsiteGallery(document.getElementById('websiteGalleryBody')); }
function renderWebsiteGallery(body){
  const canCreate = canDo('websitegallery', 'create');
  const canDelete = canDo('websitegallery', 'delete');
  const photos = websiteGallery.slice().reverse().filter(g => cmGalFilter === 'all' || g.category === cmGalFilter);
  const per = k => websiteGallery.filter(g => g.category === k).length;
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Photos', websiteGallery.length, 'plain', 'on the website')}
      ${Object.entries(GALLERY_CATEGORIES).slice(0, 3).map(([k, v]) => sfKpi(v, per(k), 'plain')).join('')}
    </section>
    ${canCreate ? `<section class="sf-card cm-post">
      <h3 class="cm-h">🖼️ Add a photo to the gallery</h3>
      <p class="cm-sub">Appears on the public website's Gallery section immediately, grouped by category.</p>
      <div class="cm-upload">
        <div class="cm-thumb">${galleryUploadData ? `<img src="${galleryUploadData}" alt="">` : '<span>No image</span>'}</div>
        <label class="sf-btn sf-btn--soft" style="cursor:pointer;">Choose photo<input type="file" accept="image/*" style="display:none;" onchange="onGalleryPhotoSelected(event)"></label>
      </div>
      <div class="form-grid" style="margin:14px 0;">
        <div class="f-field"><label>Category</label><select id="galleryCatSelect">${Object.entries(GALLERY_CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="f-field full"><label>Caption</label><input type="text" id="galleryCaption" placeholder="e.g. Annual Sports Day 2026"></div>
      </div>
      ${sfBtn('primary', '', 'Add to gallery', 'saveGalleryPhoto()', 'sf-btn--lg')}
    </section>` : ''}
    <div class="iv-toolbar">
      <div class="sf-segments" role="group" aria-label="Filter by category">
        <button type="button" class="${cmGalFilter === 'all' ? 'active' : ''}" onclick="cmGalSetFilter('all')">All</button>
        ${Object.entries(GALLERY_CATEGORIES).map(([k, v]) => `<button type="button" class="${cmGalFilter === k ? 'active' : ''}" onclick="cmGalSetFilter('${k}')">${v}</button>`).join('')}
      </div>
      <span class="iv-count">${photos.length} shown</span>
    </div>
    <div class="cm-gallery">
      ${photos.length ? photos.map(g => `<figure class="cm-photo">
        <img src="${g.dataUrl}" alt="${cmEsc(g.caption)}" loading="lazy">
        <figcaption><span class="cm-type">${cmEsc(GALLERY_CATEGORIES[g.category] || g.category)}</span><b>${cmEsc(g.caption)}</b>
          ${canDelete ? `<button type="button" class="cm-del" onclick="deleteGalleryPhoto('${g.id}')" title="Delete photo">🗑 Delete</button>` : ''}</figcaption>
      </figure>`).join('') : `<div class="empty-state" style="grid-column:1/-1;"><b>No photos here yet</b>Add one above to have it appear on the website.</div>`}
    </div>`;
}
