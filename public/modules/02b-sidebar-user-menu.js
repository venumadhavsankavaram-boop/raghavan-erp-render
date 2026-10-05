/* ============================================================================
   Sidebar profile chip menu.
   The footer shows only the person's photo + name; Approvals, Apply Leave,
   My Account, theme and Sign Out live in a small menu that opens on click and
   closes itself on an outside click, Escape, or after any choice. The element
   ids (approvalsBellBtn, applyLeaveBtn, themeToggleBtn, ...) are unchanged, so
   the existing approvals watcher and theme code keep working untouched.
   ========================================================================== */

function closeSbUserMenu(){
  const menu = document.getElementById('sbUserMenu');
  const chip = document.getElementById('sbChip');
  if(menu) menu.hidden = true;
  if(chip) chip.setAttribute('aria-expanded', 'false');
}
function toggleSbUserMenu(ev){
  if(ev) ev.stopPropagation();
  const menu = document.getElementById('sbUserMenu');
  const chip = document.getElementById('sbChip');
  if(!menu || !chip) return;
  const open = menu.hidden;
  menu.hidden = !open;
  chip.setAttribute('aria-expanded', String(open));
  if(open){
    const first = menu.querySelector('button:not([style*="display: none"]):not([style*="display:none"])');
    if(first) first.focus({ preventScroll: true });
  }
}

document.addEventListener('click', e => {
  const menu = document.getElementById('sbUserMenu');
  if(menu && !menu.hidden && !menu.contains(e.target)) closeSbUserMenu();
});
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  const menu = document.getElementById('sbUserMenu');
  if(menu && !menu.hidden){ closeSbUserMenu(); const chip = document.getElementById('sbChip'); if(chip) chip.focus(); }
});

// A small dot on the chip stands in for the (now hidden) Approvals badge, so a
// pending approval is still noticed without opening the menu.
(function watchApprovalsBadge(){
  function sync(){
    const badge = document.getElementById('approvalsBellBadge');
    const dot = document.getElementById('sbChipDot');
    if(!badge || !dot) return;
    dot.hidden = getComputedStyle(badge).display === 'none';
  }
  function start(){
    const badge = document.getElementById('approvalsBellBadge');
    if(!badge) return;
    new MutationObserver(sync).observe(badge, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
    sync();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
