/* ============================================================================
   Staff Directory: KPI tiles, searchable table and the profile hero.
   Presentation only. Editing, login access, deletion, permissions and the
   department/status filters still call the functions in modules 15-17
   (openStaffWizard, openLoginForStaff, deleteStaff, openStaffProfile, ...).
   Shares the Student Fees look (sfKpi, sfBtn, .sf-badge, .sf-card, .sf-avatar).
   ========================================================================== */

let staffNameQuery = '';

function stfAvatar(st){
  return st.photo
    ? `<img class="sf-avatar" src="${st.photo}" alt="">`
    : `<span class="sf-avatar" aria-hidden="true">${staffInitials(st)}</span>`;
}

function stfStatusBadge(st){
  const active = staffIsActive(st);
  return `<span class="sf-badge sf-badge--${active ? 'paid' : 'due'}"><span aria-hidden="true">${active ? '✓' : '◐'}</span>${escapeHtml(st.status || 'Active')}</span>`;
}

function stfLoginBadge(st){
  const ok = st.linkedUserId && users.some(u => u.id === st.linkedUserId);
  return ok ? '<span class="sf-badge sf-badge--paid"><span aria-hidden="true">✓</span>Login on</span>'
            : '<span class="sf-badge sf-badge--upcoming"><span aria-hidden="true">–</span>No login</span>';
}

function stfFiltered(){
  const deptF = document.getElementById('staffDeptFilter').value;
  const statusF = document.getElementById('staffStatusFilter').value;
  const q = staffNameQuery.trim().toLowerCase();
  let list = staffList.slice();
  if(deptF) list = list.filter(st => st.department === deptF);
  if(statusF !== 'all') list = list.filter(st => statusF === 'Active' ? staffIsActive(st) : !staffIsActive(st));
  if(q) list = list.filter(st => `${st.firstName} ${st.lastName} ${st.staffId || ''} ${st.designation || ''} ${st.department || ''} ${st.phone || ''}`.toLowerCase().includes(q));
  list.sort((a, b) => {
    const va = (a[staffSortField] || '').toString().toLowerCase();
    const vb = (b[staffSortField] || '').toString().toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return staffSortDir === 'asc' ? cmp : -cmp;
  });
  return list;
}

function onStaffNameQuery(v){ staffNameQuery = v; paintStaffRows(); }

// Repaints only the rows so typing in the search box never loses focus.
function paintStaffRows(){
  const tbody = document.getElementById('stfRows');
  if(!tbody) return;
  const list = stfFiltered();
  const isAdmin = currentUser.role === 'Admin';
  const canEdit = canDo('staff', 'edit'), canDel = canDo('staff', 'delete');
  tbody.innerHTML = list.map(st => `
    <tr class="std-row" onclick="openStaffProfile('${st.id}')">
      <td><div class="std-who">${stfAvatar(st)}<span><b>${escapeHtml(st.firstName || '')} ${escapeHtml(st.lastName || '')}</b><small>${escapeHtml(st.staffId || '')}</small></span></div></td>
      <td>${escapeHtml(st.designation || '—')}<small>${escapeHtml(st.department || '')}</small></td>
      <td>${escapeHtml(st.phone || '—')}</td>
      <td>${escapeHtml(st.doj || '—')}</td>
      <td><div class="stf-badges">${stfStatusBadge(st)}${stfLoginBadge(st)}</div></td>
      <td class="sf-actions">
        ${isAdmin ? sfBtn('link', '', '🔑 Login', `event.stopPropagation(); openLoginForStaff('${st.id}')`) : ''}
        ${canEdit ? sfBtn('soft', '', 'Edit', `event.stopPropagation(); openStaffWizard('${st.id}')`) : ''}
        ${canDel ? sfBtn('danger', '', 'Delete', `event.stopPropagation(); deleteStaff('${st.id}')`) : ''}
      </td>
    </tr>`).join('');
  const empty = document.getElementById('stfEmpty');
  if(empty) empty.innerHTML = list.length ? '' : '<div class="empty-state"><b>No staff match this filter</b>Try a different name, department or status.</div>';
  const n = document.getElementById('stfShown'); if(n) n.textContent = `${list.length} shown`;
}

function renderStaffTable(body){
  const active = staffList.filter(staffIsActive);
  const teaching = active.filter(st => /teach/i.test(`${st.designation || ''} ${(st.jobTypes || []).join(' ')}`)).length;
  const withLogin = active.filter(st => st.linkedUserId && users.some(u => u.id === st.linkedUserId)).length;
  const depts = new Set(active.map(st => st.department).filter(Boolean)).size;
  document.getElementById('staffTotalCount').textContent = '';
  const arrow = f => staffSortField === f ? (staffSortDir === 'asc' ? ' ▲' : ' ▼') : '';
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Active staff', active.length, 'plain', `${staffList.length} on record`)}
      ${sfKpi('Teaching', teaching, 'plain')}
      ${sfKpi('Departments', depts, 'plain')}
      ${sfKpi('With login', withLogin, withLogin === active.length ? 'good' : 'plain', `${active.length - withLogin} without`)}
    </section>
    <div class="iv-toolbar">
      <input class="input iv-search" type="search" value="${escapeHtml(staffNameQuery)}" placeholder="Filter this list…" oninput="onStaffNameQuery(this.value)">
      <span class="iv-count" id="stfShown"></span>
    </div>
    <div class="sf-card">
      <div class="table-wrap" style="overflow-x:auto;">
        <table class="iv-table std-table">
          <thead><tr>
            <th class="stf-sort" onclick="sortStaffBy('firstName')">Staff${arrow('firstName')}</th>
            <th>Role</th><th>Phone</th>
            <th class="stf-sort" onclick="sortStaffBy('doj')">Joined${arrow('doj')}</th>
            <th class="stf-sort" onclick="sortStaffBy('status')">Status${arrow('status')}</th>
            <th></th>
          </tr></thead>
          <tbody id="stfRows"></tbody>
        </table>
        <div id="stfEmpty"></div>
      </div>
    </div>`;
  paintStaffRows();
}

function staffHeroHtml(st){
  const chips = [
    st.gender && ['Gender', st.gender], st.dob && ['Born', st.dob], st.blood && ['Blood', st.blood],
    st.phone && ['Phone', st.phone], st.experience && ['Experience', st.experience + ' yrs'],
  ].filter(Boolean).map(([k, v]) => `<span class="std-chip"><em>${k}</em>${escapeHtml(v)}</span>`).join('');
  const ct = st.classTeacherClass ? `<span class="std-chip"><em>Class teacher</em>${escapeHtml(st.classTeacherClass)} — ${escapeHtml(st.classTeacherSection || '')}</span>` : '';
  return `
    <section class="std-hero">
      ${st.photo ? `<img class="profile-photo" src="${st.photo}" alt="">` : `<div class="profile-photo">${staffInitials(st)}</div>`}
      <div class="std-hero-main">
        <h2>${escapeHtml(st.firstName || '')} ${escapeHtml(st.lastName || '')}</h2>
        <div class="p-meta">${escapeHtml(st.staffId || '')} · ${escapeHtml(st.designation || '—')} · ${escapeHtml(st.department || '')} · ${stfStatusBadge(st)} ${stfLoginBadge(st)}</div>
        <div class="std-chips">${chips}${ct}</div>
      </div>
      <div class="profile-actions">
        ${currentUser.role === 'Admin' ? sfBtn('link', '', '🔑 Login access', `openLoginForStaff('${st.id}')`) : ''}
        ${canDo('staff', 'edit') ? sfBtn('soft', '', 'Edit', `openStaffWizard('${st.id}')`) : ''}
        ${canDo('staff', 'delete') ? sfBtn('danger', '', 'Delete', `deleteStaff('${st.id}')`) : ''}
      </div>
    </section>`;
}
