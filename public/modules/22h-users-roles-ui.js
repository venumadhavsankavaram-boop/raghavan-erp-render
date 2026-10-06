/* ============================================================================
   Users & Roles / Roles & Permissions screens - presentation only.

   Loads after module 22 and overrides its render functions:
     renderUsersTab, renderPermissionsTab, renderPermissionEditor

   Everything that decides WHO may do WHAT is untouched and still lives in
   modules 02 / 22 / 18:
     - Admin-only gate (currentUser.role !== 'Admin') on Users
     - the Delete button is never offered for 'u_admin'
     - Student / Parent are never listed as roles to edit
     - saveUser / deleteUser / openUserModal / editUser  (user modal in index.html)
     - addCustomRole / editRolePermissions / deleteCustomRole / resetRoleToDefault /
       approveRoleQuick / saveRolePermissions / backToPermissionsList
     - applyPermPreset / applyPermPresetToAll / filterPermRows / togglePermCategory /
       onPermFullToggle / onPermActionToggle
   The editor keeps the exact classes and data-attributes those handlers query
   (.perm-action[data-module][data-action], .perm-full[data-module], .perm-table,
   .perm-category(-head/-body), .perm-chevron, .perm-row-hidden, .perm-cat-hidden,
   #permSearchBox, #newRoleName, #rolesPermissionsBody, #usersRolesBody).

   All new globals are prefixed `urx`.
   ========================================================================== */

const urxU = { q:'', role:'' };

// string for use inside a single-quoted JS literal inside a double-quoted HTML attribute
function urxJs(s){ return escapeHtml(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function urxEmpty(title, text){ return `<div class="urx-empty"><b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>`; }
function urxInitials(name){
  const w = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return w.length ? w.map(x => x[0].toUpperCase()).join('') : '?';
}
function urxPlural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function urxLockIcon(){
  return '<svg class="urx-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
}

/* ======================= Users ======================= */
function urxStaffUsers(){ return users.filter(u => u.role !== 'Student' && u.role !== 'Parent'); }
function urxStaffRecord(u){
  return (typeof staffList !== 'undefined' ? staffList : []).find(st => st.linkedUserId === u.id) || null;
}
function urxUsersFiltered(){
  const q = urxU.q.trim().toLowerCase();
  return urxStaffUsers().filter(u => {
    if(urxU.role && u.role !== urxU.role) return false;
    if(!q) return true;
    const st = urxStaffRecord(u);
    return `${u.name || ''} ${u.username || ''} ${u.role || ''} ${st ? (st.firstName || '') + ' ' + (st.lastName || '') : ''}`.toLowerCase().includes(q);
  });
}
function urxUserRows(){
  const list = urxUsersFiltered();
  if(!list.length){
    const any = urxStaffUsers().length;
    return `<tr><td colspan="4">${urxEmpty(any ? 'No logins match' : 'No staff logins yet', any ? 'Try a different search or role.' : 'Use Add user to create the first one.')}</td></tr>`;
  }
  return list.map(u => {
    const st = urxStaffRecord(u);
    const me = typeof currentUser !== 'undefined' && currentUser && currentUser.id === u.id;
    return `<tr>
      <td data-l="User"><div class="urx-who"><span class="sf-avatar" aria-hidden="true">${escapeHtml(urxInitials(u.name))}</span>
        <span class="urx-who-t"><b>${escapeHtml(u.name)}${me ? ' <span class="sf-badge sf-badge--upcoming">You</span>' : ''}</b><small>@${escapeHtml(u.username)}</small></span></div></td>
      <td data-l="Role"><span class="urx-role${u.role === 'Admin' ? ' urx-role--admin' : ''}">${escapeHtml(u.role)}</span></td>
      <td data-l="Staff profile">${st
        ? `<span class="urx-link"><b>${escapeHtml(((st.firstName || '') + ' ' + (st.lastName || '')).trim() || 'Staff')}</b>${st.designation ? `<small>${escapeHtml(st.designation)}</small>` : ''}</span>`
        : '<span class="urx-mute">Not linked</span>'}</td>
      <td class="urx-act sf-actions">
        <button type="button" class="sf-btn sf-btn--link" onclick="editUser('${urxJs(u.id)}')">Edit</button>${u.id !== 'u_admin' ? `<button type="button" class="sf-btn sf-btn--danger" onclick="deleteUser('${urxJs(u.id)}')">Delete</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}
function urxUsersRepaint(){
  const tb = document.getElementById('urxURows');
  if(tb) tb.innerHTML = urxUserRows();
  const c = document.getElementById('urxUCount');
  if(c) c.textContent = urxPlural(urxUsersFiltered().length, 'login') + ' shown';
}
function urxUOnFilter(){
  const s = document.getElementById('urxUSearch'), r = document.getElementById('urxURole');
  urxU.q = s ? s.value : '';
  urxU.role = r ? r.value : '';
  urxUsersRepaint();
}

function renderUsersTab(body){
  if(currentUser.role !== 'Admin'){
    body.innerHTML = `<div class="empty-state"><b>Admin only</b>Only the Admin role can manage user accounts.</div>`;
    return;
  }
  const staffUsers = urxStaffUsers();
  const studentParentCount = users.length - staffUsers.length;
  const admins = staffUsers.filter(u => u.role === 'Admin').length;
  const rolesInUse = [...new Set(staffUsers.map(u => u.role))];
  const linked = staffUsers.filter(u => urxStaffRecord(u)).length;
  if(urxU.role && !rolesInUse.includes(urxU.role)) urxU.role = '';
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Staff logins', staffUsers.length, 'plain', 'Admin, Principal, Teacher, Staff and custom roles')}
      ${sfKpi('Admins', admins, admins ? 'good' : 'danger', admins ? 'full access' : 'no Admin login found')}
      ${sfKpi('Roles in use', rolesInUse.length, 'plain', 'across staff logins')}
      ${sfKpi('Linked to staff profile', `${linked} / ${staffUsers.length}`, linked === staffUsers.length ? 'good' : 'warn', 'needed for class and subject scope')}
    </section>
    <p class="urx-note">Create a login for each staff member. The role decides which sections of the ERP they can open; change what a role can do under <b>Roles &amp; Permissions</b>. Looking for a student or parent login? Use <a class="urx-a" onclick="switchView('studentparentlogins')">Student/Parent Logins</a>${studentParentCount ? ` (${urxPlural(studentParentCount, 'login')} there right now)` : ''}.</p>
    <div class="iv-toolbar urx-toolbar">
      <input class="input iv-search urx-search" id="urxUSearch" type="search" placeholder="Search name, username or role" aria-label="Search users" value="${escapeHtml(urxU.q)}" oninput="urxUOnFilter()">
      <select class="input urx-sel" id="urxURole" aria-label="Filter by role" onchange="urxUOnFilter()">
        <option value="">All roles</option>${rolesInUse.map(r => `<option value="${escapeHtml(r)}" ${r === urxU.role ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}
      </select>
      <div class="iv-toolbar-actions">
        ${sfBtn('soft', '', 'Recently deleted', "openTrashModal('users')")}
        ${sfBtn('primary', 'plus', 'Add user', "openUserModal(undefined, undefined, undefined, 'staff')")}
      </div>
    </div>
    <section class="sf-card urx-card">
      <div class="urx-tablehead"><b>Staff logins</b><span id="urxUCount"></span></div>
      <div class="table-wrap">
        <table class="iv-table urx-table">
          <thead><tr><th>User</th><th>Role</th><th>Staff profile</th><th class="urx-r">Actions</th></tr></thead>
          <tbody id="urxURows">${urxUserRows()}</tbody>
        </table>
      </div>
    </section>`;
  urxUsersRepaint();
}

/* ======================= Roles list ======================= */
function urxVisibleModules(){ return PERMISSION_MODULES.filter(m => !m.hidden); }

function renderPermissionsTab(body){
  if(permView === 'edit') return renderPermissionEditor(body);
  // Student and Parent are deliberately left out (see module 22): they don't use
  // the module-permission system.
  const builtIns = ROLES.filter(name => name !== 'Student' && name !== 'Parent').map(name => ({ name, builtIn: true, override: findRoleOverride(name) }));
  const customOnly = customRoles.filter(r => !ROLES.includes(r.name)).map(r => ({ name: r.name, builtIn: false, override: r }));
  const allRoles = [...builtIns, ...customOnly];
  const total = urxVisibleModules().length;
  const cards = allRoles.map(r => {
    const modCount = r.override
      ? PERMISSION_MODULES.filter(m => !m.hidden && r.override.permissions[m.key] && r.override.permissions[m.key].view).length
      : (ROLE_VIEWS[r.name] || []).length;
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(modCount / total * 100))) : 0;
    const nUsers = users.filter(u => u.role === r.name).length;
    const j = urxJs(r.name);
    return `<article class="sf-card urx-role-card">
      <header>
        <h4>${escapeHtml(r.name)}</h4>
        <span class="urx-badges">
          ${r.builtIn ? '<span class="sf-badge">Built-in</span>' : '<span class="sf-badge sf-badge--upcoming">Custom</span>'}
          ${r.override && r.builtIn ? '<span class="sf-badge sf-badge--paid"><span aria-hidden="true">✓</span>Customized</span>' : ''}
          ${modCount === 0 ? '<span class="sf-badge sf-badge--due"><span aria-hidden="true">!</span>No access yet</span>' : ''}
        </span>
      </header>
      <div class="urx-meter"><div class="urx-meter-top"><span><b>${modCount}</b> of ${total} modules accessible</span><em>${pct}%</em></div>
        <div class="sf-bar" role="img" aria-label="${modCount} of ${total} modules"><i style="width:${pct}%"></i></div></div>
      <p class="urx-mute">${urxPlural(nUsers, 'login')} with this role</p>
      <footer class="sf-actions">
        ${sfBtn('primary', '', 'Edit permissions', `editRolePermissions('${j}')`)}
        ${modCount === 0 ? sfBtn('soft', 'check', 'Approve', `approveRoleQuick('${j}')`) : ''}
        ${r.builtIn
          ? (r.override ? sfBtn('danger', '', 'Reset to default', `resetRoleToDefault('${j}')`) : '')
          : sfBtn('danger', '', 'Delete', `deleteCustomRole('${j}')`)}
      </footer>
    </article>`;
  }).join('');
  body.innerHTML = `
    <p class="urx-note">Every role, built-in or custom, can have its permissions adjusted here, module by module. Built-in roles start with their normal defaults; saving an edit overrides that default for everyone with the role. Modules marked <span class="pill urx-pill">Coming Soon</span> are not built yet, so you can set their permissions now.</p>
    <p class="urx-note urx-note--sm"><b>Student</b> and <b>Parent</b> logins are not listed: they always see only "My Portal" (their own child's fees, marks, receipts and notices), which is not part of this module system.</p>
    <section class="sf-card urx-newrole">
      <div class="urx-newrole-in">
        <div><h4>Create a new role</h4><p class="urx-mute">Give it a name, then choose what it can open.</p></div>
        <div class="inline-add-form urx-add">
          <input class="input" id="newRoleName" placeholder="e.g. Librarian, Transport Coordinator" aria-label="New role name">
          ${sfBtn('primary', 'plus', 'Create role', 'addCustomRole()')}
        </div>
      </div>
    </section>
    <div class="urx-roles">${cards}</div>`;
}

/* ======================= Permission editor ======================= */
function urxPermSum(){
  const root = document.getElementById('rolesPermissionsBody');
  if(!root) return;
  let access = 0, view = 0, total = 0;
  root.querySelectorAll('.perm-category').forEach(cat => {
    let ca = 0, ct = 0;
    cat.querySelectorAll('tbody tr').forEach(tr => {
      const boxes = tr.querySelectorAll('.perm-action');
      if(!boxes.length) return;
      ct++;
      if(Array.from(boxes).some(b => b.checked)) ca++;
      const v = tr.querySelector('.perm-action[data-action="view"]');
      if(v && v.checked) view++;
    });
    access += ca; total += ct;
    const el = cat.querySelector('.urx-catn');
    if(el) el.textContent = `${ca} / ${ct} with access`;
    cat.classList.toggle('urx-cat-on', ca > 0);
  });
  const s = document.getElementById('urxPermSum');
  if(s) s.innerHTML = `<b>${access}</b> of ${total} modules with access<small>${view} with View ticked</small>`;
  const bar = document.getElementById('urxPermBar');
  if(bar) bar.style.width = (total ? Math.round(access / total * 100) : 0) + '%';
  const sb = document.getElementById('urxSaveSum');
  if(sb) sb.textContent = `${access} of ${total} modules with access`;
}
function urxPermBind(body){
  if(body._urxBound) return;
  body._urxBound = true;
  const after = e => {
    if(e.target && e.target.closest && e.target.closest('.perm-table, .perm-toolbar')) setTimeout(urxPermSum, 0);
  };
  body.addEventListener('change', after);
  body.addEventListener('click', after);
}
function urxCatHead(cat, n){
  return `<div class="perm-category-head" style="--urx-cat:${escapeHtml(PERMISSION_CATEGORY_COLORS[cat] || '#555')};" role="button" tabindex="0" onclick="togglePermCategory(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();togglePermCategory(this)}">
    <span class="perm-chevron">▾</span><span class="urx-cat-name">${escapeHtml(cat)}</span>
    <span class="perm-cat-count">${urxPlural(n, 'feature')}</span><span class="urx-catn"></span>
  </div>`;
}

function renderPermissionEditor(body){
  const roleName = permEditingRoleName;
  const existing = findRoleOverride(roleName);
  const permissions = existing ? existing.permissions : seedPermissionsFromDefault(roleName);
  const visibleModules = urxVisibleModules();
  const categories = [...new Set(visibleModules.map(m => m.category))];
  const builtIn = ROLES.includes(roleName);
  const actionLabels = { view:'View', create:'Create', edit:'Edit', delete:'Delete', print:'Print', approve:'Approve' };
  const cols = ['Full'].concat(PERMISSION_ACTIONS.map(a => actionLabels[a] || (a[0].toUpperCase() + a.slice(1))));
  body.innerHTML = `
    <div class="breadcrumb urx-crumb"><a onclick="backToPermissionsList()">Roles &amp; Permissions</a> &nbsp;/&nbsp; ${escapeHtml(roleName)}</div>
    <section class="sf-card urx-head">
      <div class="urx-head-main">
        <h3>${escapeHtml(roleName)}</h3>
        <span class="urx-badges">
          ${builtIn ? '<span class="sf-badge">Built-in</span>' : '<span class="sf-badge sf-badge--upcoming">Custom</span>'}
          ${existing && builtIn ? '<span class="sf-badge sf-badge--paid"><span aria-hidden="true">✓</span>Customized</span>' : ''}
        </span>
      </div>
      <div class="urx-head-sum"><div id="urxPermSum" class="urx-sum"></div><div class="sf-bar"><i id="urxPermBar" style="width:0"></i></div></div>
    </section>
    <section class="sf-card urx-legend">
      <ul>
        <li><b>View</b> open this page or tab</li>
        <li><b>Create</b> add new records</li>
        <li><b>Edit</b> change existing records</li>
        <li><b>Delete</b> remove records</li>
        <li><b>Print</b> print or export</li>
        <li><b>Approve</b> approve a workflow (payroll, admissions...)</li>
      </ul>
      <p>A parent row (like "Manage Fee" or "Manage Exams") shows in the sidebar as soon as <b>any</b> item under it has any permission. The same holds for each row: ticking just <b>Create</b>, <b>Print</b> or <b>Approve</b> is enough to make that module appear, even with View unticked; inside it, only what is ticked will show. Use <b>None / View / Entry / Full</b> under a row's name for the common combinations, or tick individual boxes.</p>
    </section>
    <div class="iv-toolbar perm-toolbar urx-toolbar">
      <input type="search" class="input iv-search perm-search urx-search" id="permSearchBox" placeholder="Search modules (e.g. fee, attendance, inventory)" aria-label="Search modules" oninput="filterPermRows(this.value)">
      <div class="iv-toolbar-actions"><button type="button" class="sf-btn sf-btn--soft perm-toolbar-btn" onclick="applyPermPresetToAll('none')">Clear all</button></div>
    </div>
    ${categories.map(cat => {
      const mods = visibleModules.filter(m => m.category === cat);
      return `
      <div class="perm-category urx-cat" data-category="${escapeHtml(cat)}">
        ${urxCatHead(cat, mods.length)}
        <div class="perm-category-body urx-cat-body">
          <table class="perm-table urx-pt">
            <thead><tr><th>Module</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>
            ${mods.map(m => {
              const p = permissions[m.key] || Object.fromEntries(PERMISSION_ACTIONS.map(a => [a, false]));
              const full = PERMISSION_ACTIONS.every(a => p[a]);
              const hasChildren = (CHILDREN_OF_PARENT[m.key] || []).length > 0;
              return `<tr class="${m.parent ? 'perm-row-sub urx-sub' : ''}" data-search="${escapeHtml((m.label + ' ' + cat).toLowerCase())}">
                <td class="urx-mod">
                  <div class="urx-mod-name">${escapeHtml(m.label)}${m.comingSoon ? ' <span class="pill urx-pill">Coming Soon</span>' : ''}${m.isNew ? ' <span class="perm-new-pill">New</span>' : ''}${hasChildren ? ' <span class="perm-auto-hint">Auto-visible from items below</span>' : ''}</div>
                  <div class="perm-preset-row urx-presets">
                    <button type="button" class="perm-preset-btn" onclick="applyPermPreset('${urxJs(m.key)}','none')">None</button>
                    <button type="button" class="perm-preset-btn" onclick="applyPermPreset('${urxJs(m.key)}','view')">View</button>
                    <button type="button" class="perm-preset-btn" onclick="applyPermPreset('${urxJs(m.key)}','entry')">Entry</button>
                    <button type="button" class="perm-preset-btn" onclick="applyPermPreset('${urxJs(m.key)}','full')">Full</button>
                  </div>
                </td>
                <td data-l="Full"><input type="checkbox" class="perm-full" data-module="${escapeHtml(m.key)}" aria-label="Full access: ${escapeHtml(m.label)}" ${full ? 'checked' : ''} onchange="onPermFullToggle(this)"></td>
                ${PERMISSION_ACTIONS.map(a => `<td data-l="${actionLabels[a] || a}"><input type="checkbox" class="perm-action" data-module="${escapeHtml(m.key)}" data-action="${a}" aria-label="${actionLabels[a] || a}: ${escapeHtml(m.label)}" ${p[a] ? 'checked' : ''} onchange="onPermActionToggle(this)"></td>`).join('')}
              </tr>`;
            }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }).join('')}
    <section class="perm-locked-section urx-locked">
      <h4>${urxLockIcon()} System Administration: always Admin-only</h4>
      <p>These pages manage who can log in and what every role may do, so they are never delegable through this matrix. No role, however customized, can grant itself or anyone else more access than it already has. Only the built-in Admin role can see them.</p>
      ${LOCKED_ADMIN_ONLY_PAGES.map(pg => `<div class="perm-locked-row"><span>${escapeHtml(pg.label)}</span><span class="perm-locked-always">Admin only</span></div>`).join('')}
    </section>
    <div class="urx-savebar">
      <span id="urxSaveSum" class="urx-mute"></span>
      <div class="urx-savebar-btns">
        <button type="button" class="sf-btn sf-btn--soft" onclick="backToPermissionsList()">Cancel</button>
        <button type="button" class="sf-btn sf-btn--primary" onclick="saveRolePermissions()">${typeof sfIcon === 'function' ? sfIcon('check') : ''}Save permissions</button>
      </div>
    </div>`;
  urxPermBind(body);
  urxPermSum();
}
