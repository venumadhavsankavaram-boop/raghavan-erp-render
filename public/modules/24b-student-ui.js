/* ============================================================================
   Manage Student screens: class overview, section list and the profile header.
   Presentation only. Editing, activating/deactivating, deletion requests,
   permissions and the status filter all still call the functions in module 24
   (editStudent, toggleStudentActive, requestDeleteStudent, openProfile, ...).
   Shares the Student Fees look (sfKpi, sfBtn, sfAvatar, .sf-badge, .sf-card).
   ========================================================================== */

let stdSearch = '';
let stdGender = 'all';

function stdCounts(list){
  const g = x => (x.gender || '').toString().toLowerCase();
  return { total: list.length, boys: list.filter(s => g(s) === 'male').length, girls: list.filter(s => g(s) === 'female').length };
}

/* ---------- class overview ---------- */

function renderClassGrid(body){
  const visible = students.filter(statusMatches);
  const c = stdCounts(visible);
  const classes = CLASS_LEVELS.filter(cls => visible.some(s => s.className === cls)).length;
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Students', c.total, 'plain', document.getElementById('statusFilter').selectedOptions[0].textContent.toLowerCase())}
      ${sfKpi('Boys', c.boys, 'plain')}
      ${sfKpi('Girls', c.girls, 'plain')}
      ${sfKpi('Classes', classes, 'good')}
    </section>
    ${buildModernClassGrid(
      CLASS_LEVELS,
      (cls, sec) => students.filter(s => s.className === cls && s.section === sec && statusMatches(s)).length,
      cls => `toggleClassExpand('${cls}')`,
      (cls, sec) => `openSection('${cls}','${sec}')`,
      cls => expandedClass === cls
    )}`;
}

/* ---------- section list ---------- */

function stdSectionRows(){
  const q = stdSearch.trim().toLowerCase();
  return students
    .filter(s => s.className === currentClass && s.section === currentSection && statusMatches(s))
    .sort(compareByRoll)
    .filter(s => stdGender === 'all' || (s.gender || '').toString().toLowerCase() === stdGender)
    .filter(s => !q || `${s.firstName} ${s.lastName} ${s.admissionNo} ${s.rollNo || ''}`.toLowerCase().includes(q));
}

function stdStatusBadge(s){
  const active = isActive(s);
  return `<span class="sf-badge sf-badge--${active ? 'paid' : 'due'}"><span aria-hidden="true">${active ? '✓' : '◐'}</span>${escapeHtml(s.status || 'Active')}</span>`;
}

function stdFilterGender(g){
  stdGender = g;
  document.querySelectorAll('#stdGender button').forEach(b => b.classList.toggle('active', b.dataset.g === g));
  paintStdRows();
}
function onStdSearch(value){ stdSearch = value; paintStdRows(); }

// Repaints only the rows so typing in the search box never loses focus.
function paintStdRows(){
  const tbody = document.getElementById('stdRows');
  if(!tbody) return;
  const rows = stdSectionRows();
  const canEdit = canDo('admissions', 'edit'), canDel = canDo('admissions', 'delete');
  tbody.innerHTML = rows.map(s => `
    <tr class="std-row" onclick="rowClickToProfile(event,'${s.id}')">
      <td class="std-roll">${escapeHtml(s.rollNo || '—')}</td>
      <td><div class="std-who">${sfAvatar(s)}<span><b>${escapeHtml(s.firstName || '')} ${escapeHtml(s.lastName || '')}</b><small>${escapeHtml(s.admissionNo || '')}${s.email ? ' · ' + escapeHtml(s.email) : ''}</small></span></div></td>
      <td>${escapeHtml(s.fatherPhone || s.motherPhone || '—')}<small>${escapeHtml(s.fatherName || s.motherName || '')}</small></td>
            <td>${escapeHtml(s.admDate || '—')}</td>
      <td>${stdStatusBadge(s)}</td>
      <td class="sf-actions">
        ${canEdit ? sfBtn('soft', '', 'Edit', `event.stopPropagation(); editStudent('${s.id}')`) : ''}
        ${canEdit ? sfBtn('link', '', isActive(s) ? 'Mark inactive' : 'Mark active', `event.stopPropagation(); toggleStudentActive('${s.id}')`) : ''}
        ${canDel ? sfBtn('danger', '', 'Request deletion', `event.stopPropagation(); requestDeleteStudent('${s.id}')`) : ''}
      </td>
    </tr>`).join('');
  const empty = document.getElementById('stdEmpty');
  const everyone = students.filter(s => s.className === currentClass && s.section === currentSection && statusMatches(s)).length;
  empty.innerHTML = rows.length ? '' : (everyone === 0
    ? `<div class="empty-state"><b>No students here yet</b>Click "+ Add Student" to admit the first student into ${escapeHtml(currentClass)} — ${escapeHtml(currentSection)}.</div>`
    : `<div class="empty-state"><b>No matching students</b>Try a different name or filter.</div>`);
  const n = document.getElementById('stdShown'); if(n) n.textContent = `${rows.length} shown`;
}

function renderSectionList(body){
  stdSearch = ''; stdGender = 'all';
  const all = students.filter(s => s.className === currentClass && s.section === currentSection && statusMatches(s));
  const c = stdCounts(all);
  body.innerHTML = `
    <div class="breadcrumb"><a onclick="backToGrid()">All Classes</a> &nbsp;/&nbsp; ${escapeHtml(currentClass)} — Section ${escapeHtml(currentSection)}</div>
    <section class="sf-kpis">
      ${sfKpi('Students', c.total, 'plain', `${escapeHtml(currentClass)} · ${escapeHtml(currentSection)}`)}
      ${sfKpi('Boys', c.boys, 'plain')}
      ${sfKpi('Girls', c.girls, 'plain')}
    </section>
    <div class="iv-toolbar">
      <div class="sf-segments" id="stdGender" role="group" aria-label="Filter by gender">
        <button type="button" data-g="all" class="active" onclick="stdFilterGender('all')">All</button>
        <button type="button" data-g="male" onclick="stdFilterGender('male')">Boys</button>
        <button type="button" data-g="female" onclick="stdFilterGender('female')">Girls</button>
      </div>
      <input class="input iv-search" type="search" placeholder="Search by name, admission no or roll no…" oninput="onStdSearch(this.value)">
      <span class="iv-count" id="stdShown"></span>
    </div>
    <div class="sf-card">
      <div class="table-wrap" style="overflow-x:auto;">
        <table class="iv-table std-table">
          <thead><tr><th>Roll</th><th>Student</th><th>Parent contact</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody id="stdRows"></tbody>
        </table>
        <div id="stdEmpty"></div>
      </div>
    </div>`;
  paintStdRows();
}

/* ---------- profile header ---------- */

function renderProfile(body){
  const s = students.find(x => x.id === currentStudentId);
  if(!s){ admissionsView = 'grid'; return renderAdmissionsBody(); }
  const chips = [
    s.gender && ['Gender', s.gender], s.dob && ['Born', s.dob], s.blood && ['Blood', s.blood],
    (s.fatherPhone || s.motherPhone) && ['Parent', s.fatherPhone || s.motherPhone],
  ].filter(Boolean).map(([k, v]) => `<span class="std-chip"><em>${k}</em>${escapeHtml(v)}</span>`).join('');
  body.innerHTML = `
    <div class="breadcrumb"><a onclick="backToGrid()">All Classes</a> &nbsp;/&nbsp; <a onclick="openSection('${s.className}','${s.section}')">${escapeHtml(s.className)} — ${escapeHtml(s.section)}</a> &nbsp;/&nbsp; ${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</div>
    <section class="std-hero">
      ${s.photo ? `<img class="profile-photo" src="${s.photo}" alt="">` : `<div class="profile-photo">${initials(s)}</div>`}
      <div class="std-hero-main">
        <h2>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</h2>
        <div class="p-meta">${escapeHtml(s.admissionNo || '')} · ${escapeHtml(s.className)} — Section ${escapeHtml(s.section)} · ${stdStatusBadge(s)}</div>
        <div class="std-chips">${chips}</div>
      </div>
      <div class="profile-actions">
        ${canDo('admissions', 'edit') ? sfBtn('soft', '', 'Edit', `editStudent('${s.id}')`) : ''}
        ${canDo('admissions', 'edit') ? sfBtn('link', '', isActive(s) ? 'Mark inactive' : 'Mark active', `toggleStudentActive('${s.id}')`) : ''}
        ${canDo('admissions', 'delete') ? sfBtn('danger', '', 'Request deletion', `requestDeleteStudent('${s.id}')`) : ''}
      </div>
    </section>
    ${buildProfileCardsHTML(s)}`;
}
