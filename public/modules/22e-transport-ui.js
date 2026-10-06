/* ============================================================================
   Facilities -> Transport screens: Routes (list + editor), Assign Students,
   Route Roster and Bus Passes.

   Presentation only. Every save / delete / assign / print handler is still the
   one in module 21 (saveRoute, deleteRoute, openRouteEditor, backToRoutesList,
   addTrStopRow, removeTrStopRow, syncTrStopsFromInputs, applyTransportAssignment,
   onTrAssignStudentInput, toggleBusPassStudent, toggleBusPassSelectAll,
   printBusPasses, busPassCardInner ...). They read the same element ids as
   before: trRouteName, trBusNumber, trDriverName, trDriverPhone, .tr-stop-name,
   .tr-stop-fare, trAssignRoute, trAssignStop, trAssignScope, trAssignClass,
   trAssignSection, trAssignStudentSearch, trAssignStudentSuggestions,
   trAssignPreview, trRosterRoute, trRosterBody, bpTemplate, bpCols, bpRoute,
   bpClass, bpListWrap.

   Shares the look of Accounting / Inventory / Student Fees: sfKpi, sfBtn,
   sf-badge, .sf-card and the .iv-toolbar row. New globals are prefixed `trx`.
   ========================================================================== */

let trxRouteQ = '';
let trxRouteFilter = 'all';     // all | riders | empty
let trxRosterRoute = '';
let trxRosterQ = '';
let trxBpQ = '';

/* ---------- helpers ---------- */
function trxEmpty(title, text, actionHtml){
  return `<div class="trx-empty"><b>${title}</b>${text ? `<span>${text}</span>` : ''}${actionHtml || ''}</div>`;
}
function trxPhone(p){
  if(!p) return '';
  const digits = String(p).replace(/[^\d+]/g, '');
  return `<a class="trx-tel" href="tel:${escapeHtml(digits)}">${escapeHtml(p)}</a>`;
}
function trxFareRange(r){
  const fares = (r.stops || []).map(s => Number(s.fare) || 0);
  if(!fares.length) return '—';
  const lo = Math.min(...fares), hi = Math.max(...fares);
  return lo === hi ? fmtMoney(lo) : `${fmtMoney(lo)} – ${fmtMoney(hi)}`;
}
function trxRiderFees(list){ return list.reduce((sum, s) => sum + studentBusFare(s), 0); }
function trxName(s){ return escapeHtml(`${s.firstName || ''} ${s.lastName || ''}`.trim()); }
function trxBusPill(r){
  return r.busNumber
    ? `<span class="trx-bus">${escapeHtml(r.busNumber)}</span>`
    : `<span class="sf-badge sf-badge--due"><span aria-hidden="true">◐</span>No bus set</span>`;
}
function trxPersonCell(s){
  return `<div class="trx-person">${sfAvatar(s)}<div><b>${trxName(s)}</b><small>${escapeHtml(s.admissionNo || '')}</small></div></div>`;
}
function trxGo(tab){ switchTransportTab(tab); }

/* ---------- 1. Routes list ---------- */
function trxRouteMatches(r, q){
  if(!q) return true;
  const hay = [r.name, r.busNumber, r.driverName, r.driverPhone, ...(r.stops || []).map(s => s.name)].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}
function trxRouteCard(r, totalRiders, canEdit, canDelete, canRoster){
  const riders = studentsOnRoute(r.id);
  const pct = totalRiders > 0 ? Math.round(riders.length / totalRiders * 100) : 0;
  const stops = r.stops || [];
  const shown = stops.slice(0, 3);
  const rid = escapeHtml(r.id);
  return `<article class="sf-card trx-route">
    <header class="trx-route-head">
      <h4>${escapeHtml(r.name)}</h4>
      ${trxBusPill(r)}
    </header>
    <p class="trx-driver">${r.driverName ? `<span>Driver</span><b>${escapeHtml(r.driverName)}</b>${r.driverPhone ? ' · ' + trxPhone(r.driverPhone) : ''}` : `<span>No driver set</span>`}</p>
    <div class="trx-stops-mini">
      <div class="trx-mini-head"><span>${stops.length} stop${stops.length === 1 ? '' : 's'}</span><span>Fare ${trxFareRange(r)}</span></div>
      ${shown.length ? `<ul>${shown.map(s => `<li><span>${escapeHtml(s.name)}</span><b>${fmtMoney(s.fare)}</b></li>`).join('')}${stops.length > shown.length ? `<li class="trx-more">+ ${stops.length - shown.length} more</li>` : ''}</ul>` : `<p class="trx-hint">No stops yet. Edit the route to add some.</p>`}
    </div>
    <div class="trx-fill">
      <div class="trx-fill-top"><b>${riders.length} student${riders.length === 1 ? '' : 's'}</b><span>${pct}% of all riders</span></div>
      <div class="trx-bar" role="img" aria-label="${pct}% of all riders"><i style="width:${pct}%"></i></div>
    </div>
    <footer class="sf-actions trx-route-actions">
      ${canRoster ? sfBtn('soft', 'family', 'Roster', `trxOpenRoster('${rid}')`) : ''}
      ${canEdit ? sfBtn('link', '', 'Edit', `openRouteEditor('${rid}')`) : ''}
      ${canDelete ? sfBtn('danger', '', 'Delete', `deleteRoute('${rid}')`) : ''}
    </footer>
  </article>`;
}
function trxRepaintRoutes(){
  const box = document.getElementById('trxRouteRows');
  if(!box) return;
  const canEdit = canSub('transport_routes','transport','edit');
  const canDelete = canSub('transport_routes','transport','delete');
  const canCreate = canSub('transport_routes','transport','create');
  const canRoster = getTransportTabAccess(currentUser.role, TRANSPORT_TAB_PERM_KEYS.roster);
  const totalRiders = transportRoutes.reduce((n, r) => n + studentsOnRoute(r.id).length, 0);
  const list = transportRoutes.filter(r => trxRouteMatches(r, trxRouteQ.trim()))
    .filter(r => trxRouteFilter === 'all' || (trxRouteFilter === 'riders' ? studentsOnRoute(r.id).length > 0 : studentsOnRoute(r.id).length === 0));
  const cnt = document.getElementById('trxRouteCount');
  if(cnt) cnt.textContent = `${list.length} of ${transportRoutes.length} route${transportRoutes.length === 1 ? '' : 's'}`;
  if(!transportRoutes.length){
    box.innerHTML = trxEmpty('No routes yet', 'Set up a bus route with its driver and stops. Each stop carries its own yearly fare.', canCreate ? sfBtn('primary', 'plus', 'Add your first route', 'openRouteEditor()') : '');
  }else if(!list.length){
    box.innerHTML = trxEmpty('No routes match', 'Try a different search or switch the filter back to All.');
  }else{
    box.innerHTML = `<div class="trx-cards">${list.map(r => trxRouteCard(r, totalRiders, canEdit, canDelete, canRoster)).join('')}</div>`;
  }
}
function trxRouteSearch(v){ trxRouteQ = v; trxRepaintRoutes(); }
function trxRouteSetFilter(v){
  trxRouteFilter = v;
  document.querySelectorAll('#trxRouteSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  trxRepaintRoutes();
}
function trxOpenRoster(id){
  trxRosterRoute = id;
  trxGo('roster');
}
function renderRoutesList(body){
  const canCreate = canSub('transport_routes','transport','create');
  const riding = transportRoutes.reduce((n, r) => n + studentsOnRoute(r.id).length, 0);
  const active = students.filter(s => isActive(s)).length;
  const buses = new Set(transportRoutes.map(r => (r.busNumber || '').trim().toUpperCase()).filter(Boolean)).size;
  const stopCount = transportRoutes.reduce((n, r) => n + (r.stops || []).length, 0);
  const fees = transportRoutes.reduce((sum, r) => sum + trxRiderFees(studentsOnRoute(r.id)), 0);
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Routes', transportRoutes.length, 'plain', `${stopCount} stop${stopCount === 1 ? '' : 's'} in total`)}
      ${sfKpi('Buses', buses, 'plain', transportRoutes.length - buses > 0 ? `${transportRoutes.length - buses} route(s) without a bus number` : 'Every route has a bus')}
      ${sfKpi('Students riding', riding, 'good', active ? `${Math.round(riding / active * 100)}% of ${active} active students` : '')}
      ${sfKpi('Yearly bus fees', fmtMoney(fees), 'plain', 'At assigned stop fares')}
    </section>
    <p class="trx-note">Each route has its own bus, driver and stops. Every stop can carry a different fare based on distance, and assigning a student sets their bus fee straight away.</p>
    <div class="iv-toolbar">
      <input class="input iv-search" type="search" placeholder="Search route, bus, driver or stop…" aria-label="Search routes" value="${escapeHtml(trxRouteQ)}" oninput="trxRouteSearch(this.value)">
      <div class="sf-segments" id="trxRouteSeg" role="group" aria-label="Filter routes">
        ${[['all','All'],['riders','With students'],['empty','Empty']].map(([v, l]) => `<button type="button" data-v="${v}" class="${trxRouteFilter === v ? 'active' : ''}" onclick="trxRouteSetFilter('${v}')">${l}</button>`).join('')}
      </div>
      <span class="trx-count" id="trxRouteCount"></span>
      <div class="iv-toolbar-actions">${canCreate ? sfBtn('primary', 'plus', 'Add route', 'openRouteEditor()') : ''}</div>
    </div>
    <div id="trxRouteRows"></div>`;
  trxRepaintRoutes();
}

/* ---------- 2. Route editor ---------- */
function renderRouteEditor(body){
  const r = editingRouteId ? transportRoutes.find(x => x.id === editingRouteId) : null;
  const ridersByStop = {};
  if(r) studentsOnRoute(r.id).forEach(s => { ridersByStop[s.transportStopId] = (ridersByStop[s.transportStopId] || 0) + 1; });
  body.innerHTML = `
    <div class="breadcrumb"><a onclick="backToRoutesList()">Routes</a> &nbsp;/&nbsp; ${r ? escapeHtml(r.name) : 'New route'}</div>
    <section class="sf-card trx-editor">
      <div class="trx-panel">
        <div class="trx-panel-head"><h4>Route details</h4><p>The bus and driver are shown on the roster and the route cards.</p></div>
        <div class="form-grid">
          <div class="f-field full"><label for="trRouteName">Route name <span class="required-star">*</span></label><input type="text" id="trRouteName" value="${escapeHtml(trEditName)}" placeholder="e.g. Route 1 — Main Market Stop"></div>
          <div class="f-field"><label for="trBusNumber">Bus number</label><input type="text" id="trBusNumber" value="${escapeHtml(trEditBusNumber)}" placeholder="e.g. AP 03 TZ 4521"></div>
          <div class="f-field"><label for="trDriverName">Driver name</label><input type="text" id="trDriverName" value="${escapeHtml(trEditDriverName)}" placeholder="e.g. Ramesh Kumar"></div>
          <div class="f-field"><label for="trDriverPhone">Driver phone</label><input type="text" id="trDriverPhone" value="${escapeHtml(trEditDriverPhone)}" placeholder="10-digit mobile" inputmode="numeric" maxlength="10" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)"></div>
        </div>
      </div>
      <div class="trx-panel trx-panel--stops">
        <div class="trx-panel-head trx-panel-head--row">
          <div><h4>Stops &amp; fares <small>${trEditStops.length}</small></h4><p>Students pay the fare of the stop they are assigned to. List stops in the order the bus visits them.</p></div>
          ${sfBtn('soft', 'plus', 'Add stop', 'addTrStopRow()')}
        </div>
        ${trEditStops.length ? `<div class="trx-stoplist">${trEditStops.map((s, i) => `
          <div class="trx-stop">
            <span class="trx-stop-no" aria-hidden="true">${i + 1}</span>
            <label class="trx-stop-f"><span>Stop name</span><input type="text" class="input tr-stop-name" value="${escapeHtml(s.name)}" placeholder="e.g. Main Bus Stand"></label>
            <label class="trx-stop-f trx-stop-fare"><span>Fare (₹ / year)</span><input type="number" class="input tr-stop-fare" value="${escapeHtml(s.fare)}" min="0"></label>
            <div class="trx-stop-end">
              ${ridersByStop[s.id] ? `<span class="sf-badge sf-badge--upcoming"><span aria-hidden="true">●</span>${ridersByStop[s.id]} rider${ridersByStop[s.id] === 1 ? '' : 's'}</span>` : ''}
              ${sfBtn('danger', '', 'Remove', `removeTrStopRow(${i})`)}
            </div>
          </div>`).join('')}</div>` : trxEmpty('No stops yet', 'Add the first stop and its yearly fare. A route needs at least one stop before students can be assigned.')}
      </div>
      <div class="trx-form-actions">
        ${sfBtn('primary', 'check', 'Save route', 'saveRoute()')}
        ${sfBtn('soft', '', 'Cancel', 'backToRoutesList()')}
      </div>
    </section>`;
}

/* ---------- 3. Assign students ---------- */
function renderTransportAssignTab(body){
  if(transportRoutes.length === 0){
    body.innerHTML = `<section class="sf-card">${trxEmpty('No routes yet', 'Create a route with at least one stop first, then come back to assign students to it.', getTransportTabAccess(currentUser.role, TRANSPORT_TAB_PERM_KEYS.routes) ? sfBtn('primary', 'open', 'Go to Routes', `trxGo('routes')`) : '')}</section>`;
    return;
  }
  if(!trAssignRouteId || !transportRoutes.find(r => r.id === trAssignRouteId)) trAssignRouteId = transportRoutes[0].id;
  const route = transportRoutes.find(r => r.id === trAssignRouteId);
  if(!route.stops.find(s => s.id === trAssignStopId)) trAssignStopId = route.stops[0] ? route.stops[0].id : '';
  const canAssign = canSub('transport_assign','transport','edit');
  body.innerHTML = `
    <p class="trx-note">Assign a route and stop to one student, a whole class, or a class and section. Their bus fee becomes that stop's fare immediately.</p>
    <div class="trx-assign">
      <section class="sf-card trx-panel">
        <div class="trx-panel-head"><h4>1. Where to</h4></div>
        <div class="form-grid">
          <div class="f-field full">
            <label for="trAssignRoute">Route</label>
            <select id="trAssignRoute" onchange="trAssignRouteId=this.value; trAssignStopId=''; renderTransportBody();">
              ${transportRoutes.map(r => `<option value="${escapeHtml(r.id)}" ${r.id === trAssignRouteId ? 'selected' : ''}>${escapeHtml(r.name)}${r.busNumber ? ' — ' + escapeHtml(r.busNumber) : ''}</option>`).join('')}
            </select>
          </div>
          <div class="f-field full">
            <label for="trAssignStop">Stop</label>
            <select id="trAssignStop" onchange="trAssignStopId=this.value; updateTrAssignPreview();">
              ${route.stops.length ? route.stops.map(s => `<option value="${escapeHtml(s.id)}" ${s.id === trAssignStopId ? 'selected' : ''}>${escapeHtml(s.name)} — ${fmtMoney(s.fare)}</option>`).join('') : `<option value="">No stops on this route</option>`}
            </select>
          </div>
        </div>
        <div class="trx-panel-head trx-gap"><h4>2. Who</h4></div>
        <div class="form-grid">
          <div class="f-field full">
            <label for="trAssignScope">Assign to</label>
            <select id="trAssignScope" onchange="trAssignScopeValue=this.value; renderTransportBody();">
              <option value="student" ${trAssignScopeValue === 'student' ? 'selected' : ''}>Individual student</option>
              <option value="class" ${trAssignScopeValue === 'class' ? 'selected' : ''}>Whole class</option>
              <option value="section" ${trAssignScopeValue === 'section' ? 'selected' : ''}>Whole class &amp; section</option>
            </select>
          </div>
        </div>
        ${renderTrScopeFields()}
      </section>
      <aside class="sf-card trx-panel trx-summary" aria-live="polite">
        <div class="trx-panel-head"><h4>3. Review</h4></div>
        <div id="trAssignPreview"></div>
        ${canAssign ? `<div class="trx-form-actions">${sfBtn('primary', 'check', 'Assign transport', 'applyTransportAssignment()', 'trx-assign-btn')}</div>` : `<p class="trx-hint">You can view this page but not assign students.</p>`}
      </aside>
    </div>`;
  updateTrAssignPreview();
}
function renderTrScopeFields(){
  if(trAssignScopeValue === 'student'){
    const sel = trAssignStudentId ? students.find(s => s.id === trAssignStudentId) : null;
    return `
      <div class="f-field full trx-scope">
        <label for="trAssignStudentSearch">Student</label>
        <div class="search-wrap">
          <input class="input" id="trAssignStudentSearch" placeholder="Type at least 2 letters of the name…" autocomplete="off" oninput="onTrAssignStudentInput()" onblur="setTimeout(hideTrAssignSuggestions,150)" onfocus="onTrAssignStudentInput()">
          <div class="search-suggestions" id="trAssignStudentSuggestions"></div>
        </div>
        ${sel ? `<span class="trx-chosen">${sfAvatar(sel)}<span><b>${trxName(sel)}</b><small>${escapeHtml(sel.className || '')} — ${escapeHtml(sel.section || '')}</small></span><button type="button" aria-label="Clear student" onclick="trAssignStudentId=''; renderTransportBody();">&times;</button></span>` : ''}
      </div>`;
  }
  return `
    <div class="form-grid trx-scope">
      <div class="f-field"><label for="trAssignClass">Class</label><select id="trAssignClass" onchange="trAssignClassValue=this.value; updateTrAssignPreview();"><option value="">Select class</option>${CLASS_LEVELS.map(c => `<option ${c === trAssignClassValue ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>
      ${trAssignScopeValue === 'section' ? `<div class="f-field"><label for="trAssignSection">Section</label><select id="trAssignSection" onchange="trAssignSectionValue=this.value; updateTrAssignPreview();"><option value="">Select section</option>${SECTIONS.map(s => `<option ${s === trAssignSectionValue ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select></div>` : ''}
    </div>`;
}
function renderTrAssignSuggestions(q){
  const box = document.getElementById('trAssignStudentSuggestions');
  if(!box) return;
  if(q.length < 2){ box.classList.remove('open'); box.innerHTML = ''; return; }
  const ql = q.toLowerCase();
  const matches = students.filter(s => isActive(s) && ((s.firstName || '').toLowerCase().includes(ql) || (s.lastName || '').toLowerCase().includes(ql))).slice(0, 8);
  box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="trAssignStudentId='${s.id}'; hideTrAssignSuggestions(); renderTransportBody();">
    <div class="sg-avatar">${initials(s)}</div>
    <div><div class="sg-name">${trxName(s)}</div><div class="sg-meta">${escapeHtml(s.admissionNo || '')} · ${escapeHtml(s.className || '')} — Section ${escapeHtml(s.section || '')}${s.needsTransport === 'Yes' ? ' · already on transport' : ''}</div></div>
  </div>`).join('') : `<div class="sg-empty">No students match "${escapeHtml(q)}"</div>`;
  box.classList.add('open');
}
function updateTrAssignPreview(){
  const box = document.getElementById('trAssignPreview');
  if(!box) return;
  const btn = document.querySelector('.trx-assign-btn');
  const route = transportRoutes.find(r => r.id === trAssignRouteId);
  const stop = route ? route.stops.find(s => s.id === trAssignStopId) : null;
  const targets = trAssignTargets();
  const ready = !!stop && targets.length > 0;
  if(btn) btn.disabled = !ready;
  if(!stop){
    box.innerHTML = trxEmpty('This route has no stops', 'Add a stop with a fare under Routes, then assign students to it.');
    return;
  }
  if(!targets.length){
    const need = trAssignScopeValue === 'student' ? 'Search and pick a student' : (trAssignScopeValue === 'class' ? 'Pick a class' : (trAssignClassValue ? 'Pick a section' : 'Pick a class and section'));
    box.innerHTML = trxEmpty('Nobody selected yet', `${need} to see who will be assigned and what it costs.`);
    return;
  }
  const moving = targets.filter(s => s.needsTransport === 'Yes' && (s.transportRouteId !== route.id || s.transportStopId !== stop.id));
  const same = targets.filter(s => s.needsTransport === 'Yes' && s.transportRouteId === route.id && s.transportStopId === stop.id);
  const shown = targets.slice(0, 6);
  box.innerHTML = `
    <div class="trx-sum-count"><b>${targets.length}</b><span>student${targets.length === 1 ? '' : 's'} will be assigned</span></div>
    <dl class="trx-sum-list">
      <div><dt>Route</dt><dd>${escapeHtml(route.name)}</dd></div>
      <div><dt>Stop</dt><dd>${escapeHtml(stop.name)}</dd></div>
      <div><dt>Fare each</dt><dd>${fmtMoney(stop.fare)} / year</dd></div>
      <div><dt>Total</dt><dd>${fmtMoney(stop.fare * targets.length)} / year</dd></div>
      <div><dt>On this route now</dt><dd>${studentsOnRoute(route.id).length}</dd></div>
    </dl>
    ${moving.length ? `<p class="trx-warn"><span class="sf-badge sf-badge--due"><span aria-hidden="true">!</span>Will move</span> ${moving.length} already on transport. Their current route and stop will be replaced.</p>` : ''}
    ${same.length ? `<p class="trx-hint">${same.length} already at this stop, no change for them.</p>` : ''}
    <ul class="trx-chips">${shown.map(s => `<li>${trxName(s)}<small>${escapeHtml(s.className || '')}${s.section ? '-' + escapeHtml(s.section) : ''}</small></li>`).join('')}${targets.length > shown.length ? `<li class="trx-chip-more">+ ${targets.length - shown.length} more</li>` : ''}</ul>`;
}

/* ---------- 4. Route roster ---------- */
function renderRouteRosterTab(body){
  if(transportRoutes.length === 0){
    body.innerHTML = `<section class="sf-card">${trxEmpty('No routes yet', 'Create a route first. The roster lists who rides each bus, grouped by stop.', getTransportTabAccess(currentUser.role, TRANSPORT_TAB_PERM_KEYS.routes) ? sfBtn('primary', 'open', 'Go to Routes', `trxGo('routes')`) : '')}</section>`;
    return;
  }
  if(!transportRoutes.find(r => r.id === trxRosterRoute)) trxRosterRoute = transportRoutes[0].id;
  body.innerHTML = `
    <div class="iv-toolbar">
      <div class="trx-select">
        <label for="trRosterRoute">Route</label>
        <select id="trRosterRoute" onchange="trxRosterRoute=this.value; renderRouteRosterBody()">
          ${transportRoutes.map(r => `<option value="${escapeHtml(r.id)}" ${r.id === trxRosterRoute ? 'selected' : ''}>${escapeHtml(r.name)}${r.busNumber ? ' — ' + escapeHtml(r.busNumber) : ''}</option>`).join('')}
        </select>
      </div>
      <input class="input iv-search" type="search" placeholder="Search student or admission no…" aria-label="Search roster" value="${escapeHtml(trxRosterQ)}" oninput="trxRosterSearch(this.value)">
    </div>
    <div id="trRosterBody"></div>`;
  renderRouteRosterBody();
}
function trxRosterSearch(v){ trxRosterQ = v; renderRouteRosterBody(); }
function renderRouteRosterBody(){
  const sel = document.getElementById('trRosterRoute');
  const body = document.getElementById('trRosterBody');
  if(!sel || !body) return;
  trxRosterRoute = sel.value;
  const route = transportRoutes.find(r => r.id === trxRosterRoute);
  if(!route) return;
  const q = trxRosterQ.trim().toLowerCase();
  const riders = studentsOnRoute(route.id);
  const match = s => !q || `${s.firstName || ''} ${s.lastName || ''} ${s.admissionNo || ''}`.toLowerCase().includes(q);
  const stopIds = new Set(route.stops.map(s => s.id));
  const groups = route.stops.map(stop => ({ stop, list: riders.filter(s => s.transportStopId === stop.id) }));
  const orphans = riders.filter(s => !stopIds.has(s.transportStopId));
  const table = list => `<div class="table-wrap"><table class="iv-table">
      <thead><tr><th>Student</th><th>Admission no.</th><th>Class</th><th>Section</th></tr></thead>
      <tbody>${list.map(s => `<tr><td>${trxPersonCell(s)}</td><td>${escapeHtml(s.admissionNo || '')}</td><td>${escapeHtml(s.className || '')}</td><td>${escapeHtml(s.section || '')}</td></tr>`).join('')}</tbody></table></div>`;
  let shownAny = false;
  const sections = groups.map(({ stop, list }) => {
    const f = list.filter(match);
    if(q && !f.length) return '';
    shownAny = true;
    return `<section class="sf-card trx-stopcard">
      <div class="trx-stopcard-head"><div><h4>${escapeHtml(stop.name)}</h4><span>${fmtMoney(stop.fare)} / year each</span></div>
        <span class="sf-badge sf-badge--${list.length ? 'upcoming' : 'pending'}"><span aria-hidden="true">${list.length ? '●' : '○'}</span>${list.length} student${list.length === 1 ? '' : 's'}</span></div>
      ${f.length ? table(f) : trxEmpty('No students at this stop yet', 'Use Assign Students to put riders here.')}
    </section>`;
  }).join('');
  const orphanF = orphans.filter(match);
  const orphanHtml = orphanF.length ? (shownAny = true, `<section class="sf-card trx-stopcard">
      <div class="trx-stopcard-head"><div><h4>No stop set</h4><span>On this route but without a valid stop. Re-assign them to fix their fare.</span></div>
        <span class="sf-badge sf-badge--due"><span aria-hidden="true">!</span>${orphanF.length} student${orphanF.length === 1 ? '' : 's'}</span></div>
      ${table(orphanF)}</section>`) : '';
  body.innerHTML = `
    <section class="sf-card trx-routehead">
      <div class="trx-routehead-main"><h4>${escapeHtml(route.name)}</h4>
        <p>${trxBusPill(route)} <span>${route.driverName ? `Driver <b>${escapeHtml(route.driverName)}</b>${route.driverPhone ? ' · ' + trxPhone(route.driverPhone) : ''}` : 'No driver set'}</span></p></div>
      <div class="trx-routehead-stats">
        <div><b>${riders.length}</b><span>Students</span></div>
        <div><b>${route.stops.length}</b><span>Stops</span></div>
        <div><b>${fmtMoney(trxRiderFees(riders))}</b><span>Yearly fees</span></div>
      </div>
    </section>
    ${sections}${orphanHtml}
    ${!shownAny ? `<section class="sf-card">${trxEmpty(q ? 'No students match' : 'This route has no stops yet', q ? 'Try a different name or admission number.' : 'Add stops under Routes first.')}</section>` : ''}`;
}

/* ---------- 5. Bus passes ---------- */
function trxBusPaid(s){
  return payments.filter(p => p.studentId === s.id && p.category === 'bus' && !p.voided).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}
function trxBpList(){
  let list = busPassRiderPool();
  if(busPassRouteFilter) list = list.filter(s => s.transportRouteId === busPassRouteFilter);
  if(busPassClassFilter) list = list.filter(s => s.className === busPassClassFilter);
  const q = trxBpQ.trim().toLowerCase();
  if(q) list = list.filter(s => `${s.firstName || ''} ${s.lastName || ''} ${s.admissionNo || ''}`.toLowerCase().includes(q));
  return list;
}
function trxBpSearch(v){ trxBpQ = v; renderBusPassBody(); }
function renderBusPassTab(body){
  const pool = busPassRiderPool();
  if(pool.length === 0){
    body.innerHTML = `<section class="sf-card">${trxEmpty('No students on transport yet', 'A bus pass needs a route to print. Assign students to a route first.', getTransportTabAccess(currentUser.role, TRANSPORT_TAB_PERM_KEYS.assign) ? sfBtn('primary', 'open', 'Go to Assign Students', `trxGo('assign')`) : '')}</section>`;
    return;
  }
  const routesInUse = transportRoutes.filter(r => pool.some(s => s.transportRouteId === r.id));
  const classesInUse = [...new Set(pool.map(s => s.className))];
  body.innerHTML = `
    <section class="sf-card trx-panel trx-bpcontrols">
      <div class="form-grid trx-grid4">
        <div class="f-field">
          <label for="bpTemplate">Template</label>
          <select id="bpTemplate" onchange="busPassTemplate=this.value; document.getElementById('bpCols').value=String(BUS_PASS_TEMPLATES[busPassTemplate].cols); renderBusPassBody();">
            ${Object.keys(BUS_PASS_TEMPLATES).map(k => `<option value="${k}" ${k === busPassTemplate ? 'selected' : ''}>${BUS_PASS_TEMPLATES[k].label}</option>`).join('')}
          </select>
        </div>
        <div class="f-field">
          <label for="bpCols">Passes per row (A4)</label>
          <select id="bpCols" onchange="renderBusPassBody();">
            <option value="2">2 per row</option>
            <option value="3">3 per row</option>
          </select>
        </div>
        <div class="f-field">
          <label for="bpRoute">Route</label>
          <select id="bpRoute" onchange="busPassRouteFilter=this.value; renderBusPassBody();">
            <option value="">All routes</option>
            ${routesInUse.map(r => `<option value="${escapeHtml(r.id)}" ${r.id === busPassRouteFilter ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
          </select>
        </div>
        <div class="f-field">
          <label for="bpClass">Class</label>
          <select id="bpClass" onchange="busPassClassFilter=this.value; renderBusPassBody();">
            <option value="">All classes</option>
            ${classesInUse.map(c => `<option value="${escapeHtml(c)}" ${c === busPassClassFilter ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
      </div>
    </section>
    <div class="iv-toolbar">
      <input class="input iv-search" type="search" placeholder="Search student or admission no…" aria-label="Search students" value="${escapeHtml(trxBpQ)}" oninput="trxBpSearch(this.value)">
    </div>
    <div id="bpListWrap"></div>`;
  document.getElementById('bpCols').value = String(BUS_PASS_TEMPLATES[busPassTemplate].cols);
  renderBusPassBody();
}
function trxBpPreview(list){
  const conf = BUS_PASS_TEMPLATES[busPassTemplate];
  const cols = conf.cols || 2;
  const gapMm = 6, usableMm = 190;
  const wMm = Math.round(((usableMm - (cols - 1) * gapMm) / cols) * 10) / 10;
  const hMm = Math.round((wMm * (conf.hMm / conf.wMm)) * 10) / 10;
  const picked = list.find(s => busPassSelected.has(s.id)) || list[0];
  if(!picked) return `<aside class="sf-card trx-panel trx-preview"><div class="trx-panel-head"><h4>Preview</h4></div>${trxEmpty('Nothing to preview', 'No student matches the current filters.')}</aside>`;
  const info = busPassStudentInfo(picked);
  const card = busPassCardInner(busPassTemplate, info, schoolLogoSrc());
  return `<aside class="sf-card trx-panel trx-preview">
    <div class="trx-panel-head"><h4>Preview</h4><p>${conf.label} · ${cols} per A4 row · showing ${escapeHtml(info.name)}</p></div>
    <div class="trx-prev-wrap"><div class="trx-prev"><div class="bp-card bp-tpl-${busPassTemplate}" style="width:${wMm}mm;height:${hMm}mm">${card}</div></div></div>
    <p class="trx-hint">Printing opens a print dialog in a new tab. Allow pop-ups for this site if nothing appears.</p>
  </aside>`;
}
function renderBusPassBody(){
  const colsEl = document.getElementById('bpCols');
  if(colsEl) BUS_PASS_TEMPLATES[busPassTemplate].cols = Number(colsEl.value) || 2;
  const wrap = document.getElementById('bpListWrap');
  if(!wrap) return;
  const list = trxBpList();
  const allChecked = list.length > 0 && list.every(s => busPassSelected.has(s.id));
  const owing = list.filter(s => studentBusFare(s) - trxBusPaid(s) > 0).length;
  const n = busPassSelected.size;
  wrap.innerHTML = `
    <section class="sf-kpis trx-kpis3">
      ${sfKpi('Students listed', list.length, 'plain', 'Riders matching the filters')}
      ${sfKpi('Selected to print', n, n ? 'good' : 'plain', n ? 'Across all filters' : 'Tick students below')}
      ${sfKpi('With balance due', owing, owing ? 'warn' : 'good', owing ? 'Bus fee not fully paid' : 'All paid up')}
    </section>
    <div class="trx-bp">
      ${trxBpPreview(list)}
      <section class="sf-card trx-bplist">
        <div class="trx-bpbar">
          <label class="trx-check"><input type="checkbox" ${allChecked ? 'checked' : ''} ${list.length ? '' : 'disabled'} onchange="toggleBusPassSelectAll(this.checked)"> Select all (${list.length})</label>
          <button type="button" class="sf-btn sf-btn--primary" onclick="printBusPasses()" ${n === 0 ? 'disabled' : ''}>Print ${n || ''} bus pass${n === 1 ? '' : 'es'}</button>
        </div>
        <div class="table-wrap"><table class="iv-table">
          <thead><tr><th class="trx-cb"><span class="trx-sr">Select</span></th><th>Student</th><th class="trx-hide-sm">Class</th><th class="trx-hide-sm">Route</th><th>Bus fee</th></tr></thead>
          <tbody>
          ${list.length ? list.map(s => {
            const info = busPassStudentInfo(s);
            const bal = Math.max(studentBusFare(s) - trxBusPaid(s), 0);
            return `<tr>
              <td class="trx-cb"><input type="checkbox" aria-label="Select ${trxName(s)}" ${busPassSelected.has(s.id) ? 'checked' : ''} onchange="toggleBusPassStudent('${s.id}', this.checked)"></td>
              <td>${trxPersonCell(s)}<small class="trx-showsm">${escapeHtml(info.className)} - ${escapeHtml(info.section)}</small></td>
              <td class="trx-hide-sm">${escapeHtml(info.className)} - ${escapeHtml(info.section)}</td>
              <td class="trx-hide-sm">${escapeHtml(info.route)}</td>
              <td>${bal > 0 ? `<span class="sf-badge sf-badge--due"><span aria-hidden="true">◐</span>${fmtMoney(bal)} due</span>` : `<span class="sf-badge sf-badge--paid"><span aria-hidden="true">✓</span>Paid up</span>`}<small class="trx-paid">Paid ${info.paid}</small></td>
            </tr>`;
          }).join('') : `<tr><td colspan="5">${trxEmpty('No students match', 'Clear the search or widen the route and class filters.')}</td></tr>`}
          </tbody>
        </table></div>
      </section>
    </div>`;
}
// Select-all now acts on exactly the rows on screen (route + class filters + search).
function toggleBusPassSelectAll(checked){
  trxBpList().forEach(s => { if(checked) busPassSelected.add(s.id); else busPassSelected.delete(s.id); });
  renderBusPassBody();
}
