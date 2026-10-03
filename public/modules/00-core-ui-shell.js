
  /* ===== THEME (dark/light mode) ===== */
  function applyTheme(theme){
    if(theme === 'dark') document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
    const btn = document.getElementById('themeToggleBtn');
    if(btn) btn.innerHTML = theme==='dark' ? '☀️ <span class="sb-btn-label">Light Mode</span>' : '🌙 <span class="sb-btn-label">Dark Mode</span>';
    try{ localStorage.setItem('erp-theme', theme); }catch(e){}
  }
  function toggleTheme(){
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }
  (function(){
    let saved = 'light';
    try{ saved = localStorage.getItem('erp-theme') || 'light'; }catch(e){}
    if(saved === 'dark') document.documentElement.setAttribute('data-theme','dark');
  })();

  /* ===== MOBILE NAV DRAWER =====
     On phones (see the @media (max-width:820px) block) the sidebar is
     off-canvas by default and slides in over the page as a full drawer,
     with a tap-to-close backdrop, instead of the old horizontal
     icon-only strip. This function is a no-op on desktop (the
     "mobile-open"/"show" classes have no effect above the breakpoint),
     so it's always safe to call regardless of screen size. */
  function toggleMobileSidebar(force){
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sbBackdrop');
    if(!sidebar) return;
    const open = typeof force === 'boolean' ? force : !sidebar.classList.contains('mobile-open');
    sidebar.classList.toggle('mobile-open', open);
    if(backdrop) backdrop.classList.toggle('show', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  function closeMobileSidebar(){
    if(window.innerWidth <= 820) toggleMobileSidebar(false);
  }

  /* ===== SIDEBAR: collapsible sections ===== */
  const SB_VIEW_TO_SECTION = {
    dashboard:'overview',
    admissions:'academics', attendance:'academics', subjects:'academics', exams:'academics', result:'academics', timetable:'academics', syllabus:'academics', promotransfer:'academics', myprofile:'academics',
    managefee:'finance', accounting:'finance',
    announcements:'communication', inbox:'communication', noticeboard:'communication', websiteinquiries:'communication', websitegallery:'communication', contactvendor:'communication',
    staffdirectory:'staffsec', staffdepts:'staffsec', staffidcards:'staffsec', staffpayroll:'staffsec', staffattendance:'staffsec', staffreports:'staffsec', staffactivity:'staffsec',
    inventory:'facilities', transport:'facilities', library:'facilities', hostel:'facilities',
    reports:'reportssec',
    schoolprofile:'configuration', classessetup:'configuration', academicyear:'configuration', feestructuresetup:'configuration', promotions:'configuration', usersroles:'configuration', rolespermissions:'configuration', admintools2:'configuration',
  };
  // Each Staff sidebar page is its own view key, but they all share the one view-staff
  // container/content pieces internally — this maps the view key to the internal staff tab.
  const STAFF_SUBVIEWS = { staffdirectory:'directory', staffdepts:'depts', staffidcards:'idcards', staffpayroll:'payroll', staffattendance:'attendance', staffreports:'reports', staffactivity:'activity' };
  /* ===== SIDEBAR: quick-jump module search =====
     Filters every .sb-link by its visible label text as you type, expanding
     any section that has a match and collapsing (not deleting) everything
     else so results are never ambiguous. Clearing the box restores whatever
     collapse state was active before the search started. */
  