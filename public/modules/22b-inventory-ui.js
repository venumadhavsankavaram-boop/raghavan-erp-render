/* ============================================================================
   Facilities → Inventory screens: product list, Sell step 1 (add items) and
   Sell step 2 (checkout).

   Presentation only. Stock deduction, student extra-fee rows, payments and
   inventory sales are still written by completeInventorySale() in module 22,
   which reads the same element ids as before: invCheckoutPaidAmount,
   invCheckoutNotes, invCheckoutBuyerName, invCheckoutDate and
   invCheckoutStudentSearch / invCheckoutStudentSuggestions.

   Shares the look of the Student Fees screens (module 07b): stat tiles
   (sfKpi), buttons (sfBtn), badges, avatars and the .sf-card surface.
   ========================================================================== */

/* ---------- helpers ---------- */

const IV_TINTS = ['var(--gold)', 'var(--magenta)', 'var(--teal)', 'var(--navy)'];

// A stable accent per product category, purely decorative (name stays in text).
function ivTint(key){
  let h = 0;
  for(const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return IV_TINTS[h % IV_TINTS.length];
}
function ivMono(name){
  const w = String(name || '?').trim().split(/\s+/);
  return ((w[0] || '?')[0] + ((w[1] || '')[0] || '')).toUpperCase();
}
function ivStockState(it){
  if(it.quantity <= 0) return 'out';
  return it.quantity <= it.threshold ? 'low' : 'ok';
}
const IV_STOCK_TEXT = { out: 'Out of stock', low: 'Low stock', ok: 'In stock' };
const IV_STOCK_BADGE = { out: 'overdue', low: 'due', ok: 'paid' };
const IV_STOCK_ICON = { out: '!', low: '◐', ok: '✓' };
function ivStockBadge(it){
  const s = ivStockState(it);
  return `<span class="sf-badge sf-badge--${IV_STOCK_BADGE[s]}"><span aria-hidden="true">${IV_STOCK_ICON[s]}</span>${IV_STOCK_TEXT[s]}</span>`;
}
function ivCartTotals(){
  const subtotal = invCart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const discount = invCart.reduce((sum, c) => sum + (c.discount || 0), 0);
  return { subtotal, discount, total: subtotal - discount, count: invCart.reduce((sum, c) => sum + c.qty, 0) };
}
function ivSteps(active){
  return `<ol class="iv-steps">
    <li class="${active === 1 ? 'is-active' : 'is-done'}"><b>${active === 1 ? '1' : '✓'}</b>Add items</li>
    <li class="${active === 2 ? 'is-active' : ''}"><b>2</b>Checkout</li>
  </ol>`;
}

/* ---------- 1. product list ---------- */

// Products screen shows tile cards by default; the table stays one click away.
let invListLayout = 'cards';
function setInvListLayout(v){
  invListLayout = v;
  document.querySelectorAll('#ivViewSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  paintInvItemsRows();
}

function renderInventoryItemsList(body){
  const isAdmin = currentUser.role === 'Admin';
  const typeItems = inventoryItems.filter(it => (it.type || 'Sellable') === invFilterType);
  const stockValue = typeItems.reduce((sum, it) => sum + Math.max(it.quantity, 0) * (Number(it.costPrice) || 0), 0);
  const low = typeItems.filter(it => ivStockState(it) === 'low').length;
  const out = typeItems.filter(it => ivStockState(it) === 'out').length;
  const canSell = canSub('inventory_sell', 'inventory', 'create');
  const canAdd = canSub('inventory_items', 'inventory', 'create');
  const menu = [
    ['inventory_approvals', 'approvals', `✅ Approvals${pendingInventoryApprovalsCount() > 0 ? ` (${pendingInventoryApprovalsCount()})` : ''}`],
    ['inventory_saleshistory', 'saleshistory', '🧾 Sales History'],
    ['inventory_stockoverview', 'stockoverview', '📊 Stock Overview'],
  ].filter(([perm]) => getInventoryTabAccess(currentUser.role, perm))
   .map(([, tab, label]) => `<button type="button" onclick="switchInventoryTab('${tab}')">${label}</button>`).join('');

  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Products', typeItems.length, 'plain', invFilterType.toLowerCase())}
      ${sfKpi('Stock value (at cost)', fmtMoney(stockValue), 'good')}
      ${sfKpi('Low stock', low, low > 0 ? 'warn' : 'good', 'at or below minimum')}
      ${sfKpi('Out of stock', out, out > 0 ? 'danger' : 'good')}
    </section>
    <div class="iv-toolbar">
      <div class="sf-segments" role="group" aria-label="Product type">
        <button type="button" class="${invFilterType === 'Sellable' ? 'active' : ''}" onclick="setInvFilterType('Sellable')">🏷️ Sellable</button>
        <button type="button" class="${invFilterType === 'Non-Sellable' ? 'active' : ''}" onclick="setInvFilterType('Non-Sellable')">📋 Non-Sellable</button>
      </div>
      <input class="input iv-search" type="search" placeholder="Search products…" value="${escapeHtml(invSearchQuery)}" oninput="onInvItemsSearch(this.value)">
      <div class="sf-segments" id="ivViewSeg" role="group" aria-label="Layout">
        <button type="button" data-v="cards" class="${invListLayout === 'cards' ? 'active' : ''}" onclick="setInvListLayout('cards')">Cards</button>
        <button type="button" data-v="table" class="${invListLayout === 'table' ? 'active' : ''}" onclick="setInvListLayout('table')">Table</button>
      </div>
      <div class="iv-toolbar-actions">
        ${menu ? `<div class="iv-menu-wrap">
          <button type="button" class="sf-btn sf-btn--soft" onclick="toggleInvQuickMenu(event)">☰ Quick actions ▾</button>
          ${invQuickOpen ? `<div class="iv-menu">${menu}</div>` : ''}
        </div>` : ''}
        ${canSell ? sfBtn('primary', 'pay', 'Sell', 'openInventorySellCart()') : ''}
        ${canAdd ? sfBtn('soft', 'plus', 'Add Product', 'openInventoryItemEditor()') : ''}
      </div>
    </div>
    <div class="ivp-grid" id="ivItemsGrid"></div>
    <div class="sf-card" id="ivItemsTableCard">
      <div class="table-wrap" style="overflow-x:auto;">
        <table class="iv-table">
          <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Sold</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="ivItemsRows"></tbody>
        </table>
      </div>
    </div>
    <div id="ivItemsEmpty"></div>
    <div id="vendorReturnModalWrap"></div>`;
  paintInvItemsRows();
}

function onInvItemsSearch(value){
  invSearchQuery = value;
  paintInvItemsRows();
}

// Repaints only the product area, so typing in the search box never loses focus.
function ivItemActions(it){
  const isAdmin = currentUser.role === 'Admin';
  const disabled = it.active === false;
  return [
    canSub('inventory_sell', 'inventory', 'create') && !disabled && it.quantity > 0 ? sfBtn('primary', 'pay', 'Sell', `quickSellItem('${it.id}')`) : '',
    canSub('inventory_items', 'inventory', 'edit') ? sfBtn('soft', '', 'Edit', `openInventoryItemEditor('${it.id}')`) : '',
    canSub('inventory_items', 'inventory', 'edit') && it.quantity > 0 ? sfBtn('link', '', 'Return to vendor', `openVendorReturnModal('${it.id}')`) : '',
    isAdmin ? sfBtn('link', '', disabled ? 'Enable' : 'Disable', `toggleInventoryItemActive('${it.id}')`) : '',
    isAdmin ? sfBtn('danger', '', 'Delete', `deleteInventoryItem('${it.id}')`) : '',
  ].join('');
}

function ivItemCard(it){
  const sold = inventorySales.filter(s => s.itemId === it.id).reduce((sum, s) => sum + s.qty, 0);
  const state = ivStockState(it);
  const meta = [it.category || 'General', it.subCategory].filter(Boolean).map(escapeHtml).join(' · ');
  return `<article class="ivp ivp--${state}${it.active === false ? ' is-disabled' : ''}">
    <div class="ivp-top">
      <span class="iv-mono" style="--tint:${ivTint(it.category || 'General')}">${ivMono(it.name)}</span>
      <span class="ivp-title"><b>${escapeHtml(it.name)}</b>${it.size ? ` <span class="pill">${escapeHtml(it.size)}</span>` : ''}<small>${meta}</small></span>
    </div>
    <div class="ivp-price">${fmtMoney(it.sellingPrice)}</div>
    <div class="ivp-stats">
      <span>Stock <b class="iv-qty--${state}">${it.quantity}</b>${state !== 'ok' ? `<small> min ${it.threshold}</small>` : ''}</span>
      <span>Sold <b>${sold}</b></span>
      ${it.active === false ? '<span class="pill">Disabled</span>' : ivStockBadge(it)}
    </div>
    <div class="sf-actions">${ivItemActions(it)}</div>
  </article>`;
}

function paintInvItemsRows(){
  const tbody = document.getElementById('ivItemsRows');
  const grid = document.getElementById('ivItemsGrid');
  if(!tbody || !grid) return;
  const q = invSearchQuery.toLowerCase();
  const rows = inventoryItems.filter(it => (it.type || 'Sellable') === invFilterType && (!q || it.name.toLowerCase().includes(q)));
  const cards = invListLayout === 'cards';
  grid.style.display = cards ? '' : 'none';
  document.getElementById('ivItemsTableCard').style.display = cards ? 'none' : '';
  grid.innerHTML = cards ? rows.map(ivItemCard).join('') : '';
  tbody.innerHTML = cards ? '' : rows.map(it => {
    const sold = inventorySales.filter(s => s.itemId === it.id).reduce((sum, s) => sum + s.qty, 0);
    const state = ivStockState(it);
    const disabled = it.active === false;
    return `<tr class="${disabled ? 'is-disabled' : ''}">
      <td><div class="iv-name">
        <span class="iv-mono" style="--tint:${ivTint(it.category || 'General')}">${ivMono(it.name)}</span>
        <span><b>${escapeHtml(it.name)}</b>${it.size ? ` <span class="pill">${escapeHtml(it.size)}</span>` : ''}
          <small>${it.createdBy ? 'Added by ' + escapeHtml(it.createdBy) : ''}</small></span>
      </div></td>
      <td>${escapeHtml(it.category || 'General')}${it.subCategory ? `<small>${escapeHtml(it.subCategory)}</small>` : ''}</td>
      <td class="iv-qty iv-qty--${state}">${it.quantity}${state !== 'ok' ? `<small>min ${it.threshold}</small>` : ''}</td>
      <td>${sold}</td>
      <td>${fmtMoney(it.sellingPrice)}</td>
      <td>${ivStockBadge(it)}</td>
      <td class="sf-actions">${ivItemActions(it)}</td>
    </tr>`;
  }).join('');
  document.getElementById('ivItemsEmpty').innerHTML = rows.length ? '' :
    `<div class="empty-state"><b>No ${invFilterType.toLowerCase()} items${invSearchQuery ? ' match your search' : ''}</b>${invSearchQuery ? '' : 'Click "Add Product" to list your first item.'}</div>`;
}

/* ---------- 2. sell, step 1: add items ---------- */

// Checkout form values that must survive a re-render (e.g. changing buyer type).
// Cleared whenever the cart screen is shown, since the order may have changed.
let ivPaid = null;      // null = "pay in full", follows the grand total
let ivNotes = '';
let ivBuyerName = '';

// Everything the product grid needs, derived once from the current filters.
function ivSellPool(){
  const q = invCartSearch.toLowerCase();
  const sellable = inventoryItems.filter(it => (it.type || 'Sellable') === 'Sellable' && it.active !== false);
  const cats = ['All', ...Array.from(new Set(sellable.map(it => it.category || 'General')))];
  const inCategory = invCartCategory === 'All' ? [] : sellable.filter(it => (it.category || 'General') === invCartCategory);
  const subcats = Array.from(new Set(inCategory.map(it => it.subCategory || 'Other')));
  // A single (or missing) sub-category isn't worth an extra filter row.
  const showSubcats = invCartCategory !== 'All' && subcats.length > 1;
  const pool = sellable.filter(it =>
    (invCartCategory === 'All' || (it.category || 'General') === invCartCategory) &&
    (!showSubcats || invCartSubCategory === 'All' || (it.subCategory || 'Other') === invCartSubCategory) &&
    (!q || it.name.toLowerCase().includes(q)));
  return { sellable, cats, inCategory, subcats, showSubcats, pool };
}

function ivProductCard(it){
  const state = ivStockState(it);
  const inCart = invCart.find(c => c.itemId === it.id);
  const meta = [it.size, it.subCategory].filter(Boolean).map(escapeHtml).join(' · ');
  return `<button type="button" class="iv-prod ${state === 'out' ? 'is-out' : ''} ${inCart ? 'is-in' : ''}" ${state === 'out' ? 'disabled' : `onclick="addToInvCart('${it.id}')"`}>
    <span class="iv-mono" style="--tint:${ivTint(it.category || 'General')}">${ivMono(it.name)}</span>
    <span class="iv-prod-name">${escapeHtml(it.name)}</span>
    <span class="iv-prod-meta">${meta || '&nbsp;'}</span>
    <span class="iv-prod-foot"><b>${fmtMoney(it.sellingPrice)}</b>
      <span class="iv-stock iv-stock--${state}">${state === 'out' ? 'Out of stock' : state === 'low' ? `Only ${it.quantity} left` : `${it.quantity} in stock`}</span></span>
    ${inCart ? `<span class="iv-incart">✓ ${inCart.qty} in cart</span>` : state === 'out' ? '' : '<span class="iv-add">+ Add</span>'}
  </button>`;
}

function paintIvGrid(){
  const grid = document.getElementById('ivGrid');
  if(!grid) return;
  const { pool } = ivSellPool();
  grid.innerHTML = pool.length ? pool.map(ivProductCard).join('') : `<div class="empty-state" style="grid-column:1/-1;"><b>No items found</b>Try another category or search.</div>`;
  const count = document.getElementById('ivResultCount');
  if(count) count.textContent = `${pool.length} product${pool.length === 1 ? '' : 's'}`;
}
function onIvCartSearch(value){
  invCartSearch = value;
  paintIvGrid();
}

function ivCartPanel(){
  const t = ivCartTotals();
  const lines = invCart.map((c, i) => `
    <li class="iv-line">
      <div class="iv-line-main"><b>${escapeHtml(c.name)}</b><small>${fmtMoney(c.price)} each</small></div>
      <div class="iv-step" role="group" aria-label="Quantity for ${escapeHtml(c.name)}">
        <button type="button" onclick="adjustInvCartQty(${i}, -1)" aria-label="Decrease">−</button>
        <span>${c.qty}</span>
        <button type="button" onclick="adjustInvCartQty(${i}, 1)" aria-label="Increase">+</button>
      </div>
      <b class="iv-line-total">${fmtMoney(c.price * c.qty - c.discount)}</b>
      <button type="button" class="iv-x" onclick="removeFromInvCart(${i})" aria-label="Remove ${escapeHtml(c.name)}">&times;</button>
    </li>`).join('');
  return `
    <aside class="iv-cart">
      <h3>Your cart <span class="pill">${t.count} item${t.count === 1 ? '' : 's'}</span></h3>
      ${invCart.length ? `
        <ul class="iv-lines">${lines}</ul>
        <dl class="iv-totals"><div><dt>Subtotal</dt><dd>${fmtMoney(t.subtotal)}</dd></div>
          ${t.discount > 0 ? `<div><dt>Discount</dt><dd>−${fmtMoney(t.discount)}</dd></div>` : ''}
          <div class="is-grand"><dt>Total</dt><dd>${fmtMoney(t.total)}</dd></div></dl>
        ${sfBtn('primary', 'open', 'Proceed to checkout', 'goToInvCheckout()', 'sf-btn--lg iv-block')}`
      : `<div class="iv-empty-cart"><span aria-hidden="true">🛒</span><b>Cart is empty</b><small>Tap a product to add it</small></div>`}
    </aside>`;
}

function renderInventorySellCart(body){
  ivPaid = null; ivNotes = ''; ivBuyerName = '';
  const { sellable, cats, inCategory, subcats, showSubcats } = ivSellPool();
  const t = ivCartTotals();
  body.innerHTML = `
    <div class="iv-head">
      ${sfBtn('soft', '', '← Back', 'closeInventorySell()')}
      ${ivSteps(1)}
    </div>
    <div class="iv-layout">
      <section class="iv-shop">
        <div class="iv-find">
          <input class="input iv-search" id="ivSearch" type="search" placeholder="Search products by name…" value="${escapeHtml(invCartSearch)}" oninput="onIvCartSearch(this.value)">
          <span class="iv-count" id="ivResultCount"></span>
        </div>
        <div class="iv-chips" role="group" aria-label="Category">
          ${cats.map(c => `<button type="button" class="${invCartCategory === c ? 'active' : ''}" onclick="setInvCartCategory('${c.replace(/'/g, "\\'")}')">${escapeHtml(c)}<em>${c === 'All' ? sellable.length : sellable.filter(it => (it.category || 'General') === c).length}</em></button>`).join('')}
        </div>
        ${showSubcats ? `<div class="iv-chips iv-chips--sub" role="group" aria-label="Sub-category">
          ${['All', ...subcats].map(sc => `<button type="button" class="${invCartSubCategory === sc ? 'active' : ''}" onclick="setInvCartSubCategory('${sc.replace(/'/g, "\\'")}')">${escapeHtml(sc)}${sc !== 'All' ? `<em>${inCategory.filter(it => (it.subCategory || 'Other') === sc).length}</em>` : ''}</button>`).join('')}
        </div>` : ''}
        <div class="iv-grid" id="ivGrid"></div>
      </section>
      ${ivCartPanel()}
    </div>
    ${invCart.length ? `<div class="iv-cartbar"><span><b>${t.count}</b> item${t.count === 1 ? '' : 's'} · <b>${fmtMoney(t.total)}</b></span>${sfBtn('primary', 'open', 'Checkout', 'goToInvCheckout()')}</div>` : ''}`;
  paintIvGrid();
}

/* ---------- 3. sell, step 2: checkout ---------- */

const IV_PAY_MODES = ['Cash', 'UPI', 'Card', 'Online', 'Bank Transfer'];

function ivSetMode(mode){
  invCheckoutPaymentMode = mode;
  document.querySelectorAll('.iv-modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}
function ivSetBuyerType(type){
  invCheckoutBuyerType = type;
  renderInventoryCheckout(document.getElementById('inventoryBody'));
}
function ivSetSearchMode(mode){
  invCheckoutSearchMode = mode;
  renderInventoryCheckout(document.getElementById('inventoryBody'));
}
function ivClearStudent(){
  invCheckoutStudentId = '';
  renderInventoryCheckout(document.getElementById('inventoryBody'));
}
function ivSetBrowse(kind, value){
  if(kind === 'class'){ invCheckoutBrowseClass = value; invCheckoutBrowseSection = ''; }
  else invCheckoutBrowseSection = value;
  renderInventoryCheckout(document.getElementById('inventoryBody'));
}

// Keeps the "balance" hint under the paid amount in step with the field.
function ivUpdateBalance(){
  const el = document.getElementById('ivBalance');
  if(!el) return;
  const { total } = ivCartTotals();
  const paid = ivPaid === null ? total : ivPaid;
  const rest = total - paid;
  const student = invCheckoutBuyerType === 'Student';
  el.className = 'iv-balance' + (rest > 0 ? ' is-due' : paid > total ? ' is-warn' : '');
  el.textContent = paid > total ? 'Paid amount is more than the total.'
    : rest > 0 ? `${fmtMoney(rest)} unpaid${student ? ' — stays on the student\'s fee ledger' : ''}`
    : '✓ Paid in full';
}
function ivPaidInput(value){
  ivPaid = value === '' ? null : Math.max(Number(value) || 0, 0);
  ivUpdateBalance();
}
function ivSetPaid(amount){
  ivPaid = amount;
  const input = document.getElementById('invCheckoutPaidAmount');
  if(input) input.value = amount;
  ivUpdateBalance();
}

function ivBuyerCard(){
  const student = invCheckoutStudentId ? students.find(s => s.id === invCheckoutStudentId) : null;
  const types = ['Student', 'Staff', 'Walk-in'].map(t => `<button type="button" class="${invCheckoutBuyerType === t ? 'active' : ''}" onclick="ivSetBuyerType('${t}')">${t}</button>`).join('');
  let who;
  if(invCheckoutBuyerType !== 'Student'){
    who = `<input class="input" id="invCheckoutBuyerName" placeholder="${invCheckoutBuyerType} name (optional)" value="${escapeHtml(ivBuyerName)}" oninput="ivBuyerName=this.value">`;
  }else if(student){
    who = `<div class="iv-chosen">${sfAvatar(student)}
      <span><b>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</b><small>${escapeHtml(student.admissionNo || '')} · ${student.className} — Section ${student.section}</small></span>
      <button type="button" class="iv-x" onclick="ivClearStudent()" aria-label="Choose another student">&times;</button></div>`;
  }else{
    const byName = invCheckoutSearchMode === 'name';
    const browse = students.filter(s => s.className === invCheckoutBrowseClass && s.section === invCheckoutBrowseSection && isActive(s))
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
    who = `<div class="sf-segments iv-fill" role="group" aria-label="Find student">
        <button type="button" class="${byName ? 'active' : ''}" onclick="ivSetSearchMode('name')">🔍 By name</button>
        <button type="button" class="${byName ? '' : 'active'}" onclick="ivSetSearchMode('class')">🏫 By class</button>
      </div>
      ${byName ? `<div class="search-wrap" style="margin-top:10px;">
          <input class="input" id="invCheckoutStudentSearch" placeholder="Name or admission no…" autocomplete="off" oninput="onInvCheckoutStudentInput()" onblur="setTimeout(hideInvCheckoutSuggestions,150)" onfocus="onInvCheckoutStudentInput()">
          <div class="search-suggestions" id="invCheckoutStudentSuggestions"></div>
        </div>`
      : `<div class="iv-row2">
          <select id="invCheckoutBrowseClass" onchange="ivSetBrowse('class', this.value)"><option value="">Class</option>${CLASS_LEVELS.map(c => `<option ${c === invCheckoutBrowseClass ? 'selected' : ''}>${c}</option>`).join('')}</select>
          <select id="invCheckoutBrowseSection" onchange="ivSetBrowse('section', this.value)"><option value="">Section</option>${SECTIONS.map(s => `<option ${s === invCheckoutBrowseSection ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        ${invCheckoutBrowseClass && invCheckoutBrowseSection
          ? `<div class="iv-pick">${browse.map(s => `<button type="button" onclick="selectInvCheckoutStudent('${s.id}')">${sfAvatar(s)}<span>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</span><small>${escapeHtml(s.admissionNo || '')}</small></button>`).join('') || '<div class="iv-hint">No students in this class &amp; section.</div>'}</div>`
          : '<div class="iv-hint">Pick a class and section to browse students.</div>'}`}`;
  }
  return `<section class="iv-card"><h3>Buyer</h3>
    <div class="sf-segments iv-fill" role="group" aria-label="Buyer type">${types}</div>
    <div style="margin-top:12px;">${who}</div></section>`;
}

function renderInventoryCheckout(body){
  if(!invCart.length){
    body.innerHTML = `<div class="iv-head">${sfBtn('soft', '', '← Products', 'backToInvCart()')}${ivSteps(2)}</div>
      <div class="empty-state"><b>Your cart is empty</b>Add at least one item to check out.</div>`;
    return;
  }
  const t = ivCartTotals();
  const today = new Date().toISOString().slice(0, 10);
  const lines = invCart.map((c, i) => `
    <tr>
      <td><b>${escapeHtml(c.name)}</b><small>${fmtMoney(c.price)} each</small></td>
      <td><div class="iv-step" role="group" aria-label="Quantity">
        <button type="button" onclick="adjustInvCartQty(${i}, -1)" aria-label="Decrease">−</button><span>${c.qty}</span><button type="button" onclick="adjustInvCartQty(${i}, 1)" aria-label="Increase">+</button></div></td>
      <td><input type="number" class="iv-disc" value="${c.discount}" min="0" aria-label="Discount in rupees" onchange="setInvCartDiscount(${i}, this.value)"></td>
      <td class="iv-num"><b>${fmtMoney(c.price * c.qty - c.discount)}</b></td>
      <td><button type="button" class="iv-x" onclick="removeFromInvCart(${i})" aria-label="Remove ${escapeHtml(c.name)}">&times;</button></td>
    </tr>`).join('');
  body.innerHTML = `
    <div class="iv-head">
      ${sfBtn('soft', '', '← Cart', 'backToInvCart()')}
      ${ivSteps(2)}
    </div>
    <div class="iv-layout iv-layout--checkout">
      <section class="iv-card">
        <h3>Order summary</h3>
        <div class="table-wrap" style="overflow-x:auto;">
          <table class="iv-table iv-table--lines">
            <thead><tr><th>Product</th><th>Qty</th><th>Discount ₹</th><th class="iv-num">Total</th><th></th></tr></thead>
            <tbody>${lines}</tbody>
          </table>
        </div>
        <dl class="iv-totals"><div><dt>Subtotal</dt><dd>${fmtMoney(t.subtotal)}</dd></div>
          <div><dt>Discount</dt><dd>−${fmtMoney(t.discount)}</dd></div>
          <div class="is-grand"><dt>Grand total</dt><dd>${fmtMoney(t.total)}</dd></div></dl>
      </section>
      <div class="iv-side">
        ${ivBuyerCard()}
        <section class="iv-card"><h3>Payment</h3>
          <label class="iv-label" for="invCheckoutDate">Sale date</label>
          <input class="input" type="date" id="invCheckoutDate" value="${invCheckoutDate}" max="${today}" onchange="invCheckoutDate=this.value;">
          <span class="iv-label">Payment mode</span>
          <div class="iv-modes" role="group" aria-label="Payment mode">${IV_PAY_MODES.map(m => `<button type="button" data-mode="${m}" class="${invCheckoutPaymentMode === m ? 'active' : ''}" onclick="ivSetMode('${m}')">${m}</button>`).join('')}</div>
          <label class="iv-label" for="invCheckoutPaidAmount">Amount paid now</label>
          <input class="input" type="number" min="0" id="invCheckoutPaidAmount" value="${ivPaid === null ? t.total : ivPaid}" oninput="ivPaidInput(this.value)">
          <div class="iv-quick">
            <button type="button" onclick="ivSetPaid(${t.total})">Full ${fmtMoney(t.total)}</button>
            <button type="button" onclick="ivSetPaid(0)">Pay later</button>
          </div>
          <div id="ivBalance" class="iv-balance"></div>
          <label class="iv-label" for="invCheckoutNotes">Notes (optional)</label>
          <textarea class="input" id="invCheckoutNotes" rows="2" placeholder="Any notes for this sale…" oninput="ivNotes=this.value">${escapeHtml(ivNotes)}</textarea>
        </section>
        ${sfBtn('primary', 'check', `Complete sale · ${fmtMoney(t.total)}`, 'completeInventorySale()', 'sf-btn--lg iv-block')}
      </div>
    </div>`;
  ivUpdateBalance();
}
