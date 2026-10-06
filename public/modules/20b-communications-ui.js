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
