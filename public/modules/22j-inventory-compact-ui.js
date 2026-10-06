/* ============================================================================
   Inventory – compact product cards, ⋯ action menu and slim Sell tiles.
   Presentation only: overrides ivItemCard / ivItemActions / ivProductCard from
   22b-inventory-ui.js. Every action still calls the same handlers.
   ========================================================================== */
const IVQ_ICON = {
  sell: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2L21 7H6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  ret: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  off: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
  on: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></svg>',
  del: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/></svg>'
};

function ivqCloseMenu(){
  const m = document.getElementById('ivqPop');
  if(m) m.remove();
  document.removeEventListener('click', ivqOutside, true);
  document.removeEventListener('keydown', ivqEsc, true);
  window.removeEventListener('scroll', ivqCloseMenu, true);
  window.removeEventListener('resize', ivqCloseMenu);
}
function ivqOutside(e){ if(!e.target.closest('#ivqPop') && !e.target.closest('.ivq-more')) ivqCloseMenu(); }
function ivqEsc(e){ if(e.key === 'Escape') ivqCloseMenu(); }

function ivqMenu(id, ev){
  if(ev) ev.stopPropagation();
  const open = document.getElementById('ivqPop');
  const same = open && open.dataset.id === id;
  ivqCloseMenu();
  if(same) return;
  const it = inventoryItems.find(x => x.id === id);
  if(!it) return;
  const isAdmin = currentUser.role === 'Admin';
  const disabled = it.active === false;
  const rows = [
    canSub('inventory_items', 'inventory', 'edit') && it.quantity > 0 ? ['ret', 'Return to vendor', `openVendorReturnModal('${id}')`, ''] : null,
    isAdmin ? [disabled ? 'on' : 'off', disabled ? 'Enable product' : 'Disable product', `toggleInventoryItemActive('${id}')`, ''] : null,
    isAdmin ? ['del', 'Delete', `deleteInventoryItem('${id}')`, 'is-danger'] : null
  ].filter(Boolean);
  if(!rows.length) return;
  const pop = document.createElement('div');
  pop.id = 'ivqPop'; pop.className = 'ivq-pop'; pop.dataset.id = id; pop.setAttribute('role', 'menu');
  pop.innerHTML = rows.map(r => `<button type="button" role="menuitem" class="${r[3]}" onclick="ivqCloseMenu();${r[2]}">${IVQ_ICON[r[0]]}<span>${r[1]}</span></button>`).join('');
  document.body.appendChild(pop);
  const b = ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : { right: 200, bottom: 200, top: 200 };
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = Math.min(Math.max(8, b.right - w), window.innerWidth - w - 8);
  let top = b.bottom + 6;
  if(top + h > window.innerHeight - 8) top = Math.max(8, b.top - h - 6);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  setTimeout(() => {
    document.addEventListener('click', ivqOutside, true);
    document.addEventListener('keydown', ivqEsc, true);
    window.addEventListener('scroll', ivqCloseMenu, true);
    window.addEventListener('resize', ivqCloseMenu);
  }, 0);
}

// Sell · Edit · ⋯  — three small controls instead of five wide buttons.
function ivItemActions(it){
  const disabled = it.active === false;
  const canEdit = canSub('inventory_items', 'inventory', 'edit');
  const isAdmin = currentUser.role === 'Admin';
  const hasMore = (canEdit && it.quantity > 0) || isAdmin;
  return [
    canSub('inventory_sell', 'inventory', 'create') && !disabled && it.quantity > 0
      ? `<button type="button" class="ivq-btn ivq-btn--sell" onclick="quickSellItem('${it.id}')">${IVQ_ICON.sell}<span>Sell</span></button>` : '',
    canEdit ? `<button type="button" class="ivq-btn ivq-btn--ghost" title="Edit product" aria-label="Edit ${escapeHtml(it.name)}" onclick="openInventoryItemEditor('${it.id}')">${IVQ_ICON.edit}<span>Edit</span></button>` : '',
    hasMore ? `<button type="button" class="ivq-btn ivq-btn--icon ivq-more" title="More actions" aria-label="More actions for ${escapeHtml(it.name)}" aria-haspopup="menu" onclick="ivqMenu('${it.id}', event)">${IVQ_ICON.more}</button>` : ''
  ].join('');
}

function ivqStockBar(it, state){
  const cap = Math.max(Number(it.threshold) || 0, 1) * 4;
  const pct = it.quantity <= 0 ? 0 : Math.max(6, Math.min(100, Math.round(it.quantity / Math.max(cap, it.quantity) * 100)));
  return `<span class="ivq-bar ivq-bar--${state}" role="img" aria-label="Stock level"><i style="width:${pct}%"></i></span>`;
}

function ivItemCard(it){
  const sold = inventorySales.filter(s => s.itemId === it.id).reduce((sum, s) => sum + s.qty, 0);
  const state = ivStockState(it);
  const meta = [it.category || 'General', it.subCategory].filter(Boolean).map(escapeHtml).join(' · ');
  return `<article class="ivq-card ivq-card--${state}${it.active === false ? ' is-disabled' : ''}">
    <div class="ivq-head">
      <span class="iv-mono" style="--tint:${ivTint(it.category || 'General')}">${ivMono(it.name)}</span>
      <span class="ivq-title"><b>${escapeHtml(it.name)}</b>${it.size ? ` <span class="pill">${escapeHtml(it.size)}</span>` : ''}<small>${meta}</small></span>
      <span class="ivq-price">${fmtMoney(it.sellingPrice)}</span>
    </div>
    <div class="ivq-stock">
      <div class="ivq-stock-row"><span><b class="iv-qty--${state}">${it.quantity}</b> in stock${state === 'low' && it.threshold != null ? ` <small>(min ${it.threshold})</small>` : ''} · <b>${sold}</b> sold</span>
        ${it.active === false ? '<span class="pill">Disabled</span>' : ivStockBadge(it)}</div>
      ${ivqStockBar(it, state)}
    </div>
    <div class="ivq-actions">${ivItemActions(it)}</div>
  </article>`;
}

function ivProductCard(it){
  const state = ivStockState(it);
  const inCart = invCart.find(c => c.itemId === it.id);
  const meta = [it.size, it.subCategory].filter(Boolean).map(escapeHtml).join(' · ');
  return `<button type="button" class="ivq-tile ${state === 'out' ? 'is-out' : ''} ${inCart ? 'is-in' : ''}" ${state === 'out' ? 'disabled' : `onclick="addToInvCart('${it.id}')"`}>
    <span class="ivq-tile-top"><span class="iv-mono" style="--tint:${ivTint(it.category || 'General')}">${ivMono(it.name)}</span>
      ${inCart ? `<span class="ivq-qty">×${inCart.qty}</span>` : state === 'out' ? '' : `<span class="ivq-plus" aria-hidden="true">${IVQ_ICON.plus}</span>`}</span>
    <span class="ivq-tile-name">${escapeHtml(it.name)}</span>
    <span class="ivq-tile-meta">${meta || '&nbsp;'}</span>
    <span class="ivq-tile-foot"><b>${fmtMoney(it.sellingPrice)}</b>
      <span class="iv-stock iv-stock--${state}">${state === 'out' ? 'Out' : state === 'low' ? `${it.quantity} left` : `${it.quantity} in stock`}</span></span>
  </button>`;
}
