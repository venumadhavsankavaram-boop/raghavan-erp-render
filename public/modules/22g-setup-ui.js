/* ===== Setup screens UI (22g): School Profile, Classes, Academic Year =====
   Presentation-only overrides of the render functions in module 22. Every id and
   inline handler the original save/upload/delete code reads is kept, and none of
   those handlers is changed. Loads after module 22 so these declarations win.
   All new globals use the `scx` prefix. */

/* ---------- shared bits ---------- */
function scxCard(title, hint, inner, extra){
  return `<section class="sf-card scx-card${extra ? ' ' + extra : ''}">
    <div class="scx-card-head"><h4>${title}</h4>${hint ? `<p>${hint}</p>` : ''}</div>
    ${inner}
  </section>`;
}
function scxEmpty(title, text){
  return `<div class="scx-empty"><b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>`;
}
function scxIn(id, label, value, attrs, full, hint){
  return `<div class="f-field${full ? ' full' : ''}"><label for="${id}">${label}</label><input type="text" id="${id}" value="${escapeHtml(value || '')}" ${attrs || ''}>${hint ? `<small class="scx-hint">${hint}</small>` : ''}</div>`;
}
function scxActiveStudents(){
  const list = (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];
  return list.filter(s => typeof isActive === 'function' ? isActive(s) : true);
}

/* ---------- School Profile ---------- */
let scxProfileDirty = false;
function scxProfileItems(){
  const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const name = v('siName');
  return [
    ['School name', !!name && name !== 'Your School Name'],
    ['Tagline', !!v('siTagline')],
    ['UDISE code', !!v('siUdise')],
    ['School code', !!v('siSchoolCode')],
    ['Affiliation no.', !!v('siRegNumber')],
    ['Email', !!v('siEmail')],
    ['Phone', !!v('siPhone')],
    ['Address', !!v('siAddress')],
    ['State', !!v('siState')],
    ['District', !!v('siDistrict')],
    ['PIN code', !!v('siPin')],
    ['Logo', !!(schoolLogoData || schoolInfo.logo)],
    ['Principal name', !!v('siPrincipalName')],
    ['Signature', !!(schoolPrincipalSignatureData || schoolInfo.principalSignature)],
    ['Leadership', schoolLeadershipDraft.some(l => (l.name || '').trim())],
  ];
}
function scxMeter(){
  const t = document.getElementById('scxMeterText'); if(!t) return;
  const items = scxProfileItems();
  const done = items.filter(i => i[1]).length, pct = Math.round(done / items.length * 100);
  t.innerHTML = `<b>${done}</b> of ${items.length} filled`;
  const bar = document.getElementById('scxMeterBar'); if(bar) bar.style.width = pct + '%';
  const pc = document.getElementById('scxMeterPct'); if(pc) pc.textContent = pct + '%';
  const miss = items.filter(i => !i[1]);
  const m = document.getElementById('scxMissing');
  if(m) m.innerHTML = miss.length
    ? `<span class="scx-miss-lbl">Still missing</span>${miss.map(i => `<span class="scx-miss">${i[0]}</span>`).join('')}`
    : `<span class="sf-badge sf-badge--paid"><span aria-hidden="true">&#10003;</span>Profile complete</span>`;
}
function scxProfileEdited(){
  scxProfileDirty = true;
  const s = document.getElementById('scxSaveState');
  if(s){ s.textContent = 'Unsaved changes'; s.classList.add('is-dirty'); }
  scxMeter();
}
async function scxSaveProfile(){
  const before = schoolInfo;
  await saveSchoolProfile();
  if(schoolInfo !== before){            // the original handler replaced schoolInfo only on success
    scxProfileDirty = false;
    const s = document.getElementById('scxSaveState');
    if(s){ s.textContent = 'All changes saved'; s.classList.remove('is-dirty'); }
    scxMeter();
  }
}

function renderSchoolProfileTab(body){
  schoolLeadershipDraft = JSON.parse(JSON.stringify(schoolInfo.leadership || []));
  scxProfileDirty = false;
  const logoSrc = schoolInfo.logo || document.getElementById('sbLogoImg').src;
  const sig = schoolInfo.principalSignature || '';
  const digits = (n) => `oninput="this.value=this.value.replace(/\\D/g,'').slice(0,${n})"`;
  body.innerHTML = `
    <section class="sf-card scx-meter">
      <div class="scx-meter-top">
        <div><span class="scx-eyebrow">Profile completeness</span><div id="scxMeterText" class="scx-meter-text"></div></div>
        <b id="scxMeterPct" class="scx-meter-pct"></b>
      </div>
      <div class="sf-bar"><i id="scxMeterBar" style="width:0"></i></div>
      <p class="scx-meter-note">These details print on fee receipts, report cards, admit cards and certificates, and feed the public website.</p>
      <div id="scxMissing" class="scx-missing"></div>
    </section>

    <div class="scx-cols">
      <div class="scx-main">
        ${scxCard('Identity', 'How the school is named and registered.', `
          <div class="form-grid">
            <div class="f-field full"><label for="siName">School Name <span class="required-star">*</span></label><input type="text" id="siName" value="${escapeHtml(schoolInfo.name || '')}"></div>
            <div class="f-field full"><label for="siTagline">Tagline / Motto</label><textarea id="siTagline" rows="2">${escapeHtml(schoolInfo.tagline || '')}</textarea></div>
            ${scxIn('siUdise', 'UDISE Code', schoolInfo.udise, `inputmode="numeric" maxlength="11" ${digits(11)}`, false, '11 digits')}
            ${scxIn('siSchoolCode', 'School Code', schoolInfo.schoolCode)}
            ${scxIn('siReceiptCode', 'Receipt Code', schoolInfo.receiptCode || 'REHS', 'maxlength="8" style="text-transform:uppercase;"', false, '2–8 letters/numbers. Starts every fee receipt number, e.g. SPS → SPS-26-000001. Change only when setting up a new school.')}
            ${scxIn('siRegNumber', 'Reg. / Affiliation Number', schoolInfo.regNumber, '', true)}
            ${scxIn('siRecognition', 'Recognition line', schoolInfo.recognition, 'placeholder="Recognised by Govt. of AP"', false, 'Printed under the school name on receipts, progress reports, admit cards and certificates')}
          </div>`)}
        ${scxCard('Contact', 'Shown on documents and the public website.', `
          <div class="form-grid">
            ${scxIn('siEmail', 'Email', schoolInfo.email, 'type="email"')}
            ${scxIn('siPhone', 'Phone / Landline', schoolInfo.phone, `inputmode="numeric" maxlength="11" ${digits(11)} placeholder="10-digit mobile or 11-digit landline"`, false, 'Mobile (10 digits) or landline with STD code (11 digits)')}
            ${scxIn('siWhatsapp', 'WhatsApp Number', schoolInfo.whatsapp, `inputmode="numeric" maxlength="10" ${digits(10)} placeholder="10-digit mobile number"`, false, 'Shown on the public website')}
            ${scxIn('siWebsite', 'Website', schoolInfo.website)}
          </div>`)}
        ${scxCard('Location', '', `
          <div class="form-grid">
            ${scxIn('siState', 'State', schoolInfo.state)}
            ${scxIn('siDistrict', 'District', schoolInfo.district)}
            ${scxIn('siPin', 'PIN Code', schoolInfo.pin, `inputmode="numeric" maxlength="6" ${digits(6)}`, false, '6 digits')}
            <div class="f-field"><label for="siWorkingDays">Working Days</label><input type="number" min="1" max="365" id="siWorkingDays" value="${escapeHtml(schoolInfo.workingDays || 220)}"><small class="scx-hint">School days in the academic year</small></div>
            <div class="f-field full"><label for="siAddress">Address</label><textarea id="siAddress" rows="2">${escapeHtml(schoolInfo.address || '')}</textarea></div>
          </div>`)}
      </div>

      <div class="scx-side">
        ${scxCard('Logo', '', `
          <div class="scx-logo">
            <img id="schoolLogoPreview" class="scx-logo-img" alt="School logo" src="${escapeHtml(logoSrc)}" onload="scxMeter()">
            <label class="sf-btn sf-btn--soft scx-file">Change logo<input type="file" accept="image/*" id="schoolLogoInput" onchange="previewSchoolLogo(event)"></label>
            <span class="scx-hint">JPEG, PNG or WebP, up to 2MB</span>
          </div>`)}
        ${scxCard('Principal signature', 'Auto-applied to admit cards and progress reports, so they need no individual signing. Class teacher signatures live on each Staff Profile.', `
          <div class="f-field"><label for="siPrincipalName">Principal / Correspondent Name</label><input type="text" id="siPrincipalName" value="${escapeHtml(schoolInfo.principalName || '')}"></div>
          <div class="scx-sig">
            <div class="scx-sig-box" id="schoolSigPreviewWrap">
              <img id="schoolSigPreview" alt="Signature" src="${escapeHtml(sig)}" onload="scxMeter()" style="${sig ? '' : 'display:none;'}">
              <span id="schoolSigPlaceholder" style="${sig ? 'display:none;' : ''}">No signature</span>
            </div>
            <label class="sf-btn sf-btn--soft scx-file">Upload signature<input type="file" accept="image/*" id="schoolSigInput" onchange="previewPrincipalSignature(event)"></label>
          </div>
          <span class="scx-hint">Scan on a plain white background, PNG preferred, up to 2MB</span>`)}
      </div>
    </div>

    ${scxCard('Leadership', 'Shown in the public website\'s Leadership section (Secretary, Correspondent, Principal, Academic Director and so on). Changes appear on the website after saving, with no code edit.', `
      <div id="leadershipEditorRows">${renderLeadershipEditorRows()}</div>
      ${sfBtn('soft', 'plus', 'Add leader', 'addLeadershipEntry()', 'scx-add-lead')}`, 'scx-lead-card')}

    <div class="scx-savebar">
      <span id="scxSaveState" class="scx-save-state">All changes saved</span>
      ${sfBtn('primary', 'check', 'Save changes', 'scxSaveProfile()', 'sf-btn--lg')}
    </div>`;
  body.oninput = body.onchange = scxProfileEdited;
  scxMeter();
}

function renderLeadershipEditorRows(){
  if(!schoolLeadershipDraft.length){
    return scxEmpty('No leaders added yet', 'Use "Add leader" below to list the people parents should know.');
  }
  return schoolLeadershipDraft.map((l, i) => `
    <div class="scx-lead">
      <div class="scx-lead-photo">
        ${l.photo
          ? `<img id="leadPhotoPreview${i}" class="scx-lead-img" alt="" src="${escapeHtml(l.photo)}">`
          : `<div id="leadPhotoPreview${i}" class="scx-lead-img scx-lead-init">${escapeHtml(leadershipInitials(l.name || ''))}</div>`}
        <label class="sf-btn sf-btn--soft scx-file scx-file-sm">Photo<input type="file" accept="image/*" onchange="previewLeadershipPhoto(event, ${i})"></label>
      </div>
      <div class="form-grid scx-lead-fields">
        <div class="f-field"><label>Name</label><input type="text" value="${escapeHtml(l.name || '')}" oninput="schoolLeadershipDraft[${i}].name=this.value"></div>
        <div class="f-field"><label>Title / Role</label><input type="text" value="${escapeHtml(l.title || '')}" oninput="schoolLeadershipDraft[${i}].title=this.value" placeholder="e.g. Principal, Secretary &amp; Correspondent"></div>
        <div class="f-field"><label>Qualification</label><input type="text" value="${escapeHtml(l.qualification || '')}" oninput="schoolLeadershipDraft[${i}].qualification=this.value"></div>
        <div class="f-field"><label>Email</label><input type="email" value="${escapeHtml(l.email || '')}" oninput="schoolLeadershipDraft[${i}].email=this.value"></div>
      </div>
      <button type="button" class="scx-x" onclick="removeLeadershipEntry(${i}); scxProfileEdited()" title="Remove" aria-label="Remove leader">&times;</button>
    </div>`).join('');
}

/* ---------- Classes ---------- */
function scxEnter(fn){ return `onkeydown="if(event.key==='Enter'){event.preventDefault();${fn}}"`; }

function renderClassesTab(body){
  const active = scxActiveStudents();
  const all = (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];
  const cards = CLASS_LEVELS.map((cls, i) => {
    const secs = sectionsForClass(cls);
    const inClass = active.filter(s => s.className === cls);
    const orphan = inClass.filter(s => !secs.includes(s.section)).length;
    return `<article class="sf-card scx-class">
      <div class="scx-class-head">
        <div><h4>${escapeHtml(cls)}</h4><span class="scx-class-sub">${inClass.length} student${inClass.length === 1 ? '' : 's'} &middot; ${secs.length} section${secs.length === 1 ? '' : 's'}</span></div>
        <button type="button" class="scx-x" onclick="removeClassLevel(${i})" title="Remove class" aria-label="Remove ${escapeHtml(cls)}">&times;</button>
      </div>
      <div class="scx-seclbl">Sections in use</div>
      <div class="scx-secs">
        ${SECTIONS.map(sec => {
          const on = secs.includes(sec);
          const n = inClass.filter(s => s.section === sec).length;
          return `<label class="scx-sec${on ? ' is-on' : ''}"><input type="checkbox" class="cls-sec-check" data-class="${escapeHtml(cls)}" value="${escapeHtml(sec)}" ${on ? 'checked' : ''} onchange="onClassSectionToggle(this.dataset.class)"><span class="scx-sec-n">${escapeHtml(sec)}</span><span class="scx-sec-c">${n}</span></label>`;
        }).join('')}
      </div>
      ${orphan ? `<div class="scx-warn">${orphan} student${orphan === 1 ? ' sits' : 's sit'} in a section that is switched off.</div>` : ''}
    </article>`;
  }).join('');
  body.innerHTML = `
    <div class="sf-kpis">
      ${sfKpi('Classes', CLASS_LEVELS.length, 'plain')}
      ${sfKpi('Sections', SECTIONS.length, 'plain', SECTIONS.map(escapeHtml).join(', '))}
      ${sfKpi('Active students', active.length, 'good', all.length !== active.length ? `${all.length - active.length} inactive` : '')}
    </div>
    <p class="scx-note">Classes and sections appear everywhere in the ERP &mdash; Manage Student, Fee Structure, Attendance, Exams and Subjects &mdash; so removing one removes it from all of them. Existing student records are not deleted.</p>
    <div class="scx-two">
      ${scxCard('Add a class', 'e.g. Nursery, 11th Class', `
        <div class="scx-add"><input class="input" id="newClassName" placeholder="Class name" ${scxEnter('addClassLevel()')}>${sfBtn('primary', 'plus', 'Add class', 'addClassLevel()')}</div>`)}
      ${scxCard('Sections', 'Every class can use these. Add more if you run more than two per class.', `
        <div class="scx-add"><input class="input" id="newSectionName" placeholder="e.g. C" maxlength="3" style="text-transform:uppercase" ${scxEnter('addSectionLevel()')}>${sfBtn('primary', 'plus', 'Add section', 'addSectionLevel()')}</div>
        <div class="scx-chips">${SECTIONS.map((s, i) => `<span class="scx-chip">Section ${escapeHtml(s)}<button type="button" onclick="removeSectionLevel(${i})" aria-label="Remove section ${escapeHtml(s)}">&times;</button></span>`).join('')}</div>`)}
    </div>
    <div class="scx-listhead"><h3>Classes</h3><span>Tick the sections each class uses. A small class can stay on Section A only; a class with none ticked resets to Section ${escapeHtml(SECTIONS[0] || 'A')}. The number beside each section is its active students.</span></div>
    ${CLASS_LEVELS.length ? `<div class="scx-classes">${cards}</div>` : `<section class="sf-card">${scxEmpty('No classes yet', 'Add your first class above.')}</section>`}`;
}

/* ---------- Academic Year ---------- */
function scxYearStart(y){ const m = /^(\d{4})/.exec(String(y)); return m ? Number(m[1]) : null; }
function scxNextYear(){
  const starts = academicYears.map(scxYearStart).filter(n => n != null);
  if(!starts.length) return '';
  const n = Math.max.apply(null, starts) + 1;
  const next = `${n}-${String((n + 1) % 100).padStart(2, '0')}`;
  return academicYears.includes(next) ? '' : next;
}
function scxYearBadge(y){
  if(y === currentAcademicYearValue) return `<span class="sf-badge sf-badge--paid"><span aria-hidden="true">&#10003;</span>Current</span>`;
  const a = scxYearStart(y), c = scxYearStart(currentAcademicYearValue);
  if(a != null && c != null && a > c) return `<span class="sf-badge sf-badge--upcoming">Upcoming</span>`;
  return `<span class="sf-badge">Past</span>`;
}
async function scxSetCurrent(){
  const sel = document.getElementById('ayCurrentSelect'); if(!sel) return;
  if(sel.value === currentAcademicYearValue){ showToast('That year is already the current one.'); return; }
  if(!await showConfirmDialog(`Make ${sel.value} the current academic year? It becomes the year shown across the ERP, such as the AY badge on Manage Student.`, { title: 'Change current year', okText: 'Make current' })) return;
  await setCurrentAcademicYear();
  renderAcademicYearTab(document.getElementById('academicYearBody'));
}
function scxMakeCurrent(y){
  const sel = document.getElementById('ayCurrentSelect'); if(!sel) return;
  sel.value = y; scxSetCurrent();
}
function scxFillYear(y){ const i = document.getElementById('ayNewInput'); if(i){ i.value = y; i.focus(); } }

function renderAcademicYearTab(body){
  const sorted = academicYears.slice().sort((a, b) => (scxYearStart(b) || 0) - (scxYearStart(a) || 0));
  const next = scxNextYear();
  const cur = currentAcademicYearValue;
  body.innerHTML = `
    <div class="scx-cols scx-cols-ay">
      <div class="scx-main">
        <section class="sf-card scx-ay-hero">
          <span class="scx-eyebrow">Current academic year</span>
          <div class="scx-ay-now"><b>${escapeHtml(cur || 'Not set')}</b>${cur ? scxYearBadge(cur) : ''}</div>
          <p class="scx-note">Shown across the ERP, for example the AY badge on Manage Student. Changing it affects every screen that follows the current year.</p>
          <div class="scx-add">
            <select id="ayCurrentSelect" class="input" aria-label="Academic year">
              ${academicYears.map(y => `<option value="${escapeHtml(y)}" ${y === cur ? 'selected' : ''}>${escapeHtml(y)}</option>`).join('')}
            </select>
            ${sfBtn('primary', 'check', 'Set as current', 'scxSetCurrent()')}
          </div>
        </section>
        <section class="sf-card scx-years">
          <div class="scx-tablehead"><b>Years on file</b><span>${academicYears.length}</span></div>
          ${sorted.length ? `<ul class="scx-year-list">${sorted.map(y => `
            <li class="${y === cur ? 'is-cur' : ''}"><b>${escapeHtml(y)}</b>${scxYearBadge(y)}${y === cur ? '' : sfBtn('link', '', 'Make current', `scxMakeCurrent(${JSON.stringify(y).replace(/"/g, '&quot;')})`)}</li>`).join('')}</ul>`
            : scxEmpty('No academic years yet', 'Add one on the right.')}
        </section>
      </div>
      <div class="scx-side">
        ${scxCard('Add a new year', 'Format: 2027-28.', `
          <div class="scx-add scx-add-col"><input class="input" id="ayNewInput" placeholder="e.g. 2027-28" ${scxEnter('addAcademicYear()')}>${sfBtn('soft', 'plus', 'Add year', 'addAcademicYear()')}</div>
          ${next ? `<div class="scx-suggest"><span>Next in sequence</span><button type="button" class="scx-chip scx-chip-btn" onclick="scxFillYear('${next}')">${next}</button></div>` : ''}`)}
      </div>
    </div>`;
}
