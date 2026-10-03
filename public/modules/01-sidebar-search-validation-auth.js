let sbPreSearchCollapse = null;
  function sbFilterModules(term){
    const q = (term || '').trim().toLowerCase();
    const clearBtn = document.getElementById('sbSearchClear');
    const emptyMsg = document.getElementById('sbSearchEmpty');
    if(clearBtn) clearBtn.style.display = q ? 'block' : 'none';
    if(!q){
      if(sbPreSearchCollapse){
        SB_SECTION_KEYS.forEach(key => {
          const group = document.getElementById('sbGroup-'+key);
          const toggle = document.getElementById('sbToggle-'+key);
          const chevron = document.getElementById('sbChevron-'+key);
          if(group) group.classList.remove('sb-search-hidden');
          if(toggle) toggle.classList.remove('sb-search-hidden');
          if(group) group.classList.toggle('collapsed', !!sbPreSearchCollapse[key]);
          if(chevron) chevron.classList.toggle('collapsed', !!sbPreSearchCollapse[key]);
        });
        sbPreSearchCollapse = null;
      }
      document.querySelectorAll('.sb-link.sb-search-match').forEach(el => el.classList.remove('sb-search-match'));
      document.querySelectorAll('.sb-link.sb-search-hidden').forEach(el => el.classList.remove('sb-search-hidden'));
      if(emptyMsg) emptyMsg.style.display = 'none';
      return;
    }
    if(!sbPreSearchCollapse){
      sbPreSearchCollapse = {};
      SB_SECTION_KEYS.forEach(key => {
        const group = document.getElementById('sbGroup-'+key);
        sbPreSearchCollapse[key] = group ? group.classList.contains('collapsed') : false;
      });
    }
    let anyMatch = false;
    SB_SECTION_KEYS.forEach(key => {
      const group = document.getElementById('sbGroup-'+key);
      const toggle = document.getElementById('sbToggle-'+key);
      const chevron = document.getElementById('sbChevron-'+key);
      if(!group) return;
      let sectionHasMatch = false;
      let sectionHasVisibleLink = false;
      group.querySelectorAll('.sb-link').forEach(link => {
        if(link.style.display === 'none'){ link.classList.add('sb-search-hidden'); return; }
        sectionHasVisibleLink = true;
        const label = (link.textContent || '').toLowerCase();
        const match = label.includes(q);
        link.classList.toggle('sb-search-hidden', !match);
        link.classList.toggle('sb-search-match', match);
        if(match) sectionHasMatch = true;
      });
      const showSection = sectionHasMatch && sectionHasVisibleLink;
      if(toggle) toggle.classList.toggle('sb-search-hidden', !showSection);
      group.classList.toggle('sb-search-hidden', !showSection);
      if(showSection){
        group.classList.remove('collapsed');
        if(chevron) chevron.classList.remove('collapsed');
        anyMatch = true;
      }
    });
    if(emptyMsg){
      emptyMsg.style.display = anyMatch ? 'none' : 'block';
      const termSpan = document.getElementById('sbSearchEmptyTerm');
      if(termSpan) termSpan.textContent = term;
    }
  }
  function sbClearSearch(){
    const input = document.getElementById('sbModuleSearch');
    if(input) input.value = '';
    sbFilterModules('');
    if(input) input.focus();
  }
  function sbSearchKeydown(e){
    if(e.key === 'Escape'){ sbClearSearch(); return; }
    if(e.key === 'Enter'){
      const firstMatch = document.querySelector('.sb-link.sb-search-match');
      if(firstMatch) firstMatch.click();
    }
  }

  function toggleSbSection(key){
    const group = document.getElementById('sbGroup-'+key);
    const chevron = document.getElementById('sbChevron-'+key);
    if(!group) return;
    const collapsed = group.classList.toggle('collapsed');
    if(chevron) chevron.classList.toggle('collapsed', collapsed);
    try{
      const state = JSON.parse(localStorage.getItem('sb-collapsed-sections') || '{}');
      state[key] = collapsed;
      localStorage.setItem('sb-collapsed-sections', JSON.stringify(state));
    }catch(e){}
  }
  function expandSbSectionFor(view){
    const key = SB_VIEW_TO_SECTION[view];
    if(!key) return;
    const group = document.getElementById('sbGroup-'+key);
    const chevron = document.getElementById('sbChevron-'+key);
    if(group) group.classList.remove('collapsed');
    if(chevron) chevron.classList.remove('collapsed');
  }
  function initSbSectionsCollapseState(){
    let state = {};
    let hasSaved = false;
    try{
      const raw = localStorage.getItem('sb-collapsed-sections');
      hasSaved = !!raw;
      state = JSON.parse(raw || '{}');
    }catch(e){}
    // First-ever visit: start with every section collapsed except Overview, so
    // the sidebar opens as a short, scannable list of categories rather than a
    // 35-button wall. switchView() below still auto-opens whichever section the
    // signed-in role actually lands on. Once someone has clicked a section
    // header themselves, their saved choices (per key, above) take over.
    // On mobile this default is different: there's no hover-to-preview (no
    // mouse), and the off-canvas drawer is already hidden until opened, so
    // there's none of the "always-visible sidebar getting too tall" problem
    // that collapsing solves on desktop. Without this, a role with several
    // permitted modules spread across categories (Manage Fee, Inventory,
    // Staff, ...) looked like it only had ONE module — whichever one lived
    // under Overview — because every other section's links were collapsed
    // behind a header that has to be tapped, easy to miss on a phone. So a
    // first-ever mobile visit starts with every section already expanded;
    // a saved per-section choice (from actually tapping a header) still wins.
    const isMobile = window.innerWidth <= 820;
    SB_SECTION_KEYS.forEach(key => {
      const collapsed = hasSaved ? !!state[key] : (!isMobile && key !== 'overview');
      const group = document.getElementById('sbGroup-'+key);
      const chevron = document.getElementById('sbChevron-'+key);
      if(group) group.classList.toggle('collapsed', collapsed);
      if(chevron) chevron.classList.toggle('collapsed', collapsed);
    });
  }

  /* Hover-to-preview: resting the cursor on a collapsed section's header temporarily
     reveals its links without actually un-collapsing it — moving away closes the preview
     again. A real click still toggles the permanent collapsed/expanded state as before. */
  const SB_SECTION_KEYS = ['overview','academics','communication','finance','staffsec','facilities','reportssec','configuration'];
  // A restricted role (e.g. one denied every link under "Finance") used to
  // still see the "Finance" section header sitting there with nothing
  // underneath — which tells a curious user exactly what modules exist in
  // this ERP even though none of them work for them. Called at the end of
  // applyRolePermissions() (after every individual .sb-link's visibility is
  // set), this hides a section's whole header+group the moment none of its
  // links are visible, and reveals it again the moment at least one is.
  function updateSbSectionVisibility(){
    SB_SECTION_KEYS.forEach(key => {
      const toggle = document.getElementById('sbToggle-'+key);
      const group = document.getElementById('sbGroup-'+key);
      if(!toggle || !group) return;
      const links = group.querySelectorAll('.sb-link');
      const anyVisible = Array.from(links).some(el => el.style.display !== 'none');
      toggle.style.display = anyVisible ? '' : 'none';
      group.style.display = anyVisible ? '' : 'none';
    });
  }
  function initSidebarHoverPreview(){
    SB_SECTION_KEYS.forEach(key => {
      const toggle = document.getElementById('sbToggle-'+key);
      const group = document.getElementById('sbGroup-'+key);
      if(!toggle || !group) return;
      let leaveTimer = null;
      const expand = () => {
        clearTimeout(leaveTimer);
        if(group.classList.contains('collapsed')) group.classList.add('hover-preview');
      };
      const scheduleCollapse = () => {
        leaveTimer = setTimeout(() => group.classList.remove('hover-preview'), 150);
      };
      toggle.addEventListener('mouseenter', expand);
      group.addEventListener('mouseenter', expand);
      toggle.addEventListener('mouseleave', scheduleCollapse);
      group.addEventListener('mouseleave', scheduleCollapse);
    });
  }
  initSidebarHoverPreview();

  let CLASS_LEVELS = ["Baby Class","LKG","UKG","1st Class","2nd Class","3rd Class","4th Class","5th Class","6th Class","7th Class","8th Class","9th Class","10th Class"];
  let SECTIONS = ["A","B"];
  /* Per-class section overrides — most classes can just use the school-wide SECTIONS list,
     but a class that doesn't need splitting can be set to Section A only, or any custom subset. */
  let classSectionOverrides = {};
  function sectionsForClass(className){
    if(classSectionOverrides[className] && classSectionOverrides[className].length) return classSectionOverrides[className];
    return SECTIONS;
  }

  // Shared "modern" class/section picker — used everywhere an admin drills
  // into a class then a section (Manage Students, Manage Fees, Attendance,
  // Marks, Admit Cards, Promotion & Transfer, ...). Every caller supplies
  // its own list of classes and its own countFn, so this only handles the
  // parts that should behave identically everywhere: strictly following the
  // school's actual configured class/section setup (sectionsForClass, not
  // the raw global SECTIONS list), hiding any section — or whole class —
  // that currently has zero matching students (rather than an empty tab),
  // and the compact, modern card + section-pill look.
  //   classes        — array of class names to show (already pre-filtered by the caller, e.g. by a class dropdown)
  //   countFn(cls,sec) — number of students in that class+section under the caller's own criteria (return 0 to hide/skip that section)
  //   headerClickFn(cls) — JS string for the card header's onclick (usually a toggleXClassExpand call)
  //   chipClickFn(cls,sec) — JS string for a section pill's onclick (usually an openXSection call)
  //   isExpandedFn(cls) — whether this class's card is currently expanded
  //   metaFn(cls,total,secData) — optional, overrides the default "N students" line under the class name
  function buildModernClassGrid(classes, countFn, headerClickFn, chipClickFn, isExpandedFn, metaFn){
    let gradIdx = 0;
    const cards = classes.map(cls => {
      const secData = sectionsForClass(cls).map(sec => ({ sec, count: countFn(cls, sec) })).filter(x => x.count > 0);
      if(!secData.length) return '';
      const total = secData.reduce((sum,x) => sum+x.count, 0);
      const isOpen = isExpandedFn(cls);
      const idx = gradIdx % 4; gradIdx++;
      const meta = metaFn ? metaFn(cls, total, secData) : `${total} student${total===1?'':'s'}`;
      const chips = secData.map(x => `
        <button type="button" class="modern-sec-chip" onclick="event.stopPropagation(); ${chipClickFn(cls, x.sec)}">
          <span>Sec ${x.sec}</span>
          <span class="modern-chip-count">${x.count}</span>
        </button>`).join('');
      return `
        <div class="modern-class-card ${isOpen?'expanded':''}" data-idx="${idx}">
          <div class="modern-class-header" onclick="${headerClickFn(cls)}">
            <div class="modern-class-icon">🎓</div>
            <div class="modern-class-titlewrap">
              <div class="modern-class-name">${cls}</div>
              <div class="modern-class-meta">${meta}</div>
            </div>
            <svg class="modern-class-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="modern-class-chips">${chips}</div>
        </div>`;
    }).filter(Boolean).join('');
    return cards ? `<div class="modern-class-grid">${cards}</div>` : `<div class="empty-state"><b>No classes to show</b></div>`;
  }
  const CASTE_CATS = ["OC","BC-A","BC-B","BC-C","BC-D","BC-E","SC","ST","EWS","Other"];
  let casteFilterClass = '';
  let casteFilterGender = '';
  const STORAGE_KEY = "admissions-students";
  // `window.storage` was only ever present in the early prototyping environment
  // this app was first built in — it has never existed in the real deployed
  // browser, so this is always false here, which is expected and fine: every
  // module now saves through storageGet/storageSet's real /api/* routes (see
  // API_BACKED_KEYS / OBJECT_BACKED_KEYS above), backed by the actual Postgres
  // database, not this browser's local storage. Kept only because a few legacy
  // fallback branches still check it if the server is briefly unreachable.
  const storageAvailable = (typeof window.storage !== 'undefined' && window.storage !== null);
  // Real, live connectivity flag — unlike storageAvailable above (which is
  // always false in production and never reflects anything real), this one
  // actually flips based on whether the most recent OBJECT_BACKED_KEYS /
  // API_BACKED_KEYS fetch to the server succeeded or fell back to this
  // device's localStorage copy. Drives the dashboard banner (see
  // renderDashboard) so it only warns when there's a genuine problem.
  let usingLocalFallback = false;


  let students = [];

  // Promise cache for datasets that load lazily (on first actual use) instead
  // of eagerly at login — see loadAllAppData() and the split-out loaders below
  // it. Calling ensureDataLoaded() a second time for the same key returns the
  // SAME promise (doesn't re-fetch), so any number of call sites can await it
  // safely without duplicate network requests.
  const _lazyDataPromises = {};
  function ensureDataLoaded(key, loaderFn){
    if(!_lazyDataPromises[key]) _lazyDataPromises[key] = loaderFn();
    return _lazyDataPromises[key];
  }
  // Forces a fresh re-fetch of a lazily-loaded dataset, replacing whatever
  // ensureDataLoaded() had cached for this key — for views (like the Staff
  // Activity dashboard) that must always show this session's latest data
  // rather than whatever happened to be loaded the first time any tab
  // touched this key. Every other call site keeps using ensureDataLoaded()
  // and transparently sees the refreshed data too, since the underlying
  // variable (examResults, attendanceRecords, ...) is reassigned in place.
  function reloadDataset(key, loaderFn){
    _lazyDataPromises[key] = loaderFn();
    return _lazyDataPromises[key];
  }

  // Your uploaded "Loading" Lottie file, inlined so the page stays a single
  // file — played wherever a data fetch needs a real loading indicator
  // instead of a plain "Loading…" label.
  const MO_LOADING_JSON = {"v":"4.8.0","meta":{"g":"LottieFiles AE 1.0.0","a":"","k":"","d":"","tc":"#FFFFFF"},"fr":29.9700012207031,"ip":0,"op":31.0000012626559,"w":500,"h":500,"nm":"Loading ","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Rectangle_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":135,"ix":10},"p":{"a":0,"k":[250,156.235,0],"ix":2},"a":{"a":0,"k":[-125,-107,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[57,-57],[57,57],[-57,57],[-57,-57]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":15,"s":[{"i":[[-31.437,0],[0,-31.437],[31.437,0],[0,31.437]],"o":[[31.437,0],[0,31.437],[-31.437,0],[0,-31.437]],"v":[[0.718,-187.388],[57.64,-130.466],[0.718,-73.544],[-56.204,-130.466]],"c":true}]},{"t":30.0000012219251,"s":[{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[188.6,-188.5],[188.6,-74.5],[74.6,-74.5],[74.6,-188.5]],"c":true}]}],"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"st","c":{"a":0,"k":[1,1,1,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":0,"ix":5},"lc":1,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"fl","c":{"a":0,"k":[0.16862745098,0,0.478431372549,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[-125,-107],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Rectangle 1","np":3,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":90.0000036657751,"st":0,"bm":0},{"ddd":0,"ind":2,"ty":4,"nm":"Rectangle_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":585,"ix":10},"p":{"a":0,"k":[343,250,0],"ix":2},"a":{"a":0,"k":[-125,-107,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[57,-57],[57,57],[-57,57],[-57,-57]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":15,"s":[{"i":[[-31.437,0],[0,-31.437],[31.437,0],[0,31.437]],"o":[[31.437,0],[0,31.437],[-31.437,0],[0,-31.437]],"v":[[0.718,-187.388],[57.64,-130.466],[0.718,-73.544],[-56.204,-130.466]],"c":true}]},{"t":30.0000012219251,"s":[{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[188.6,-188.5],[188.6,-74.5],[74.6,-74.5],[74.6,-188.5]],"c":true}]}],"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"st","c":{"a":0,"k":[1,1,1,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":0,"ix":5},"lc":1,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"fl","c":{"a":0,"k":[0.26274506812,0.418869527181,1,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[-125,-107],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Rectangle 1","np":3,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":90.0000036657751,"st":0,"bm":0},{"ddd":0,"ind":3,"ty":4,"nm":"Rectangle_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":315,"ix":10},"p":{"a":0,"k":[250,342.86,0],"ix":2},"a":{"a":0,"k":[-125,-107,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[57,-57],[57,57],[-57,57],[-57,-57]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":15,"s":[{"i":[[-31.437,0],[0,-31.437],[31.437,0],[0,31.437]],"o":[[31.437,0],[0,31.437],[-31.437,0],[0,-31.437]],"v":[[0.718,-187.388],[57.64,-130.466],[0.718,-73.544],[-56.204,-130.466]],"c":true}]},{"t":30.0000012219251,"s":[{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[188.6,-188.5],[188.6,-74.5],[74.6,-74.5],[74.6,-188.5]],"c":true}]}],"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"st","c":{"a":0,"k":[1,1,1,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":0,"ix":5},"lc":1,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"fl","c":{"a":0,"k":[0.16862745098,0,0.478431372549,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[-125,-107],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Rectangle 1","np":3,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":90.0000036657751,"st":0,"bm":0},{"ddd":0,"ind":4,"ty":4,"nm":"Rectangle_4","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":45,"ix":10},"p":{"a":0,"k":[157.156,250,0],"ix":2},"a":{"a":0,"k":[-125,-107,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[57,-57],[57,57],[-57,57],[-57,-57]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":15,"s":[{"i":[[-31.437,0],[0,-31.437],[31.437,0],[0,31.437]],"o":[[31.437,0],[0,31.437],[-31.437,0],[0,-31.437]],"v":[[0.718,-187.388],[57.64,-130.466],[0.718,-73.544],[-56.204,-130.466]],"c":true}]},{"t":30.0000012219251,"s":[{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[188.6,-188.5],[188.6,-74.5],[74.6,-74.5],[74.6,-188.5]],"c":true}]}],"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"st","c":{"a":0,"k":[1,1,1,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":0,"ix":5},"lc":1,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"fl","c":{"a":0,"k":[0.26274506812,0.418869527181,1,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[-125,-107],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Rectangle 1","np":3,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":90.0000036657751,"st":0,"bm":0}],"markers":[]};

  // Mounts the loading animation into any not-yet-initialized .mo-lottie-mini
  // element currently in the DOM. Safe to call after any innerHTML swap.
  async function moMountLotties(){
    const targets = document.querySelectorAll('.mo-lottie-mini:not([data-mo-init])');
    if(!targets.length) return;
    targets.forEach(el => el.setAttribute('data-mo-init', '1'));
    if(!window.lottie){ await window.__lottieReady; }
    if(!window.lottie) return;
    targets.forEach(el => {
      if(!document.body.contains(el)) return; // swapped out again before the script finished loading
      window.lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: true, animationData: MO_LOADING_JSON });
    });
  }
  function moLoadingRow(colspan){
    return `<tr><td colspan="${colspan}"><div class="empty-state"><div class="mo-lottie-mini"></div><b>Loading…</b></div></td></tr>`;
  }

  // Shared Enter-key-to-submit handler for modals that aren't wrapped in a
  // <form> (so the browser never fires a submit event on Enter on its own).
  // Wired via onkeydown on the modal's outer wrapper so it also covers rows
  // added later by JS (event bubbling), without needing a listener per input.
  function submitOnEnter(event, fn){
    if(event.key !== 'Enter' || event.isComposing) return;
    const tag = (event.target.tagName || '').toUpperCase();
    if(tag === 'TEXTAREA' || tag === 'BUTTON') return; // let those keep their own Enter behavior
    event.preventDefault();
    fn();
  }

  function showToast(msg, kind, countTarget){
    const t = document.getElementById('toast');
    if(kind === 'burst' || kind === 'ringdraw'){
      const iconSvg = kind === 'burst'
        ? `<svg viewBox="0 0 80 80" class="mo-burst run">
             <g class="mo-burst-rays">
               <line x1="40" y1="4" x2="40" y2="14"></line><line x1="40" y1="66" x2="40" y2="76"></line>
               <line x1="4" y1="40" x2="14" y2="40"></line><line x1="66" y1="40" x2="76" y2="40"></line>
               <line x1="14.6" y1="14.6" x2="21.9" y2="21.9"></line><line x1="58.1" y1="58.1" x2="65.4" y2="65.4"></line>
               <line x1="14.6" y1="65.4" x2="21.9" y2="58.1"></line><line x1="58.1" y1="21.9" x2="65.4" y2="14.6"></line>
             </g>
             <circle class="mo-burst-circle" cx="40" cy="40" r="24"></circle>
             <path class="mo-burst-check" d="M28 41 L36 49 L53 30"></path>
           </svg>`
        : `<svg viewBox="0 0 72 72" class="mo-burst run">
             <circle class="mo-ringdraw-track" cx="36" cy="36" r="31" transform="rotate(-90 36 36)"></circle>
             <circle class="mo-ringdraw-prog" cx="36" cy="36" r="31" transform="rotate(-90 36 36)"></circle>
             <path class="mo-ringdraw-check" d="M20 37 L30 47 L52 24"></path>
           </svg>`;
      t.innerHTML = `<span class="mo-burst-icon">${iconSvg}</span><span>${msg}</span>`;
    } else if(kind === 'radial'){
      // Processing + count-up — used for receipts (payments, ledger payments, certificates)
      // instead of the plain success ring, per the user's request.
      t.innerHTML = `<span class="mo-radial-icon run" id="moRadialIcon">
          <svg viewBox="0 0 36 36">
            <circle class="mo-radial-track" cx="18" cy="18" r="14"></circle>
            <circle class="mo-radial-bar" cx="18" cy="18" r="14"></circle>
          </svg>
          <div class="mo-radial-count" id="moRadialCount">0</div>
          <div class="mo-radial-check">✓</div>
        </span><span>${msg}</span>`;
      const target = Math.round(Number(countTarget)) || 100;
      const countEl = document.getElementById('moRadialCount');
      const start = performance.now();
      const dur = 1000;
      const tick = (now) => {
        const tt = Math.min((now-start)/dur, 1);
        const eased = 1 - Math.pow(1-tt, 3);
        if(countEl) countEl.textContent = Math.round(eased * target);
        if(tt < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      t.textContent = msg;
    }
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ===== Universal save/load ambient indicator =====
  // Drives the small corner badge (#moSyncBadge): "Loading (your file)" while a
  // storageSet/storageGet call is in flight, "Soft pulse ring" once a save is
  // confirmed stored. Wired at the storageSet/storageGet choke point (below) so
  // it covers every save/load in the app without patching each call site, and
  // never touches submitLogin (which uses its own separate fetch, not these).
  let moSyncActive = 0;
  let moSyncHideTimer = null;
  function moSyncSetMode(mode, label){
    const badge = document.getElementById('moSyncBadge');
    if(!badge) return;
    // Never show this on the login/sign-in screen (e.g. the post-login
    // loadAllAppData() calls, which run before hideLoginScreen()) — that
    // screen must stay exactly as it was, with no added motion.
    const loginOverlay = document.getElementById('loginOverlay');
    if(loginOverlay && loginOverlay.style.display !== 'none'){
      badge.classList.remove('show');
      return;
    }
    badge.className = 'mo-sync-badge show mode-' + mode;
    const lbl = document.getElementById('moSyncLabel');
    if(lbl) lbl.textContent = label;
    if(mode === 'loading' || mode === 'saving') moMountLotties();
  }
  function moSyncStart(kind){
    moSyncActive++;
    clearTimeout(moSyncHideTimer);
    moSyncSetMode(kind === 'save' ? 'saving' : 'loading', kind === 'save' ? 'Saving…' : 'Loading…');
  }
  function moSyncDone(kind, ok){
    moSyncActive = Math.max(0, moSyncActive - 1);
    if(kind === 'save') moSyncSetMode(ok ? 'saved' : 'error', ok ? 'Saved' : 'Not saved');
    const badge = document.getElementById('moSyncBadge');
    clearTimeout(moSyncHideTimer);
    moSyncHideTimer = setTimeout(() => {
      if(moSyncActive === 0 && badge) badge.classList.remove('show');
    }, kind === 'save' ? 1100 : 250);
  }

  /* ===== Field validation helpers (mobile numbers, Aadhaar, photo size) =====
     Matching HTML attributes (maxlength/inputmode/oninput digit-filtering) on
     the fields themselves stop most bad input as it's typed; these run again
     at save time in case a value was pasted in or left partially filled. */
  function digitsOnly(str){ return (str || '').replace(/\D/g, ''); }
  function isValidMobile(str){ const d = digitsOnly(str); return d.length === 10; }
  function isValidAadhar(str){ const d = digitsOnly(str); return d.length === 12; }
  function isValidPin(str){ const d = digitsOnly(str); return d.length === 6; }
  function isValidUdise(str){ const d = digitsOnly(str); return d.length === 11; }
  function isValidBankAccount(str){ const d = digitsOnly(str); return d.length >= 6 && d.length <= 18; }
  function isValidIfsc(str){ return /^[A-Z]{4}0[A-Z0-9]{6}$/.test((str||'').trim().toUpperCase()); }

  const PHOTO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024; // 2MB — generous for a photo/signature/logo, keeps records and backups from bloating
  function readImageFileWithSizeLimit(e, onLoaded){
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > PHOTO_UPLOAD_MAX_BYTES){
      showToast(`That image is ${(file.size/1024/1024).toFixed(1)}MB — please choose one under ${(PHOTO_UPLOAD_MAX_BYTES/1024/1024).toFixed(0)}MB.`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = evt => onLoaded(evt.target.result);
    reader.readAsDataURL(file);
  }

  // Same size-limit check as readImageFileWithSizeLimit, but additionally
  // downscales/re-compresses the image via canvas before handing back a data
  // URL — used for photos (like the Website Gallery) that get stored as a
  // base64 blob and displayed at screen resolution, where a phone-camera
  // original (several MB, 4000px+) is both slow to load on the public site
  // and needlessly bloats the database row. Caps the longer edge to maxDim
  // and re-encodes as JPEG at the given quality; looks the same on screen,
  // a fraction of the size on disk. Falls back to the untouched original if
  // canvas re-encoding fails for any reason (e.g. a corrupt image).
  function readAndCompressImage(e, onLoaded, opts){
    opts = opts || {};
    const maxDim = opts.maxDim || 1600;
    const quality = opts.quality || 0.82;
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > PHOTO_UPLOAD_MAX_BYTES){
      showToast(`That image is ${(file.size/1024/1024).toFixed(1)}MB — please choose one under ${(PHOTO_UPLOAD_MAX_BYTES/1024/1024).toFixed(0)}MB.`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = evt => {
      const original = evt.target.result;
      const img = new Image();
      img.onload = () => {
        try{
          let { width, height } = img;
          if(width > maxDim || height > maxDim){
            if(width >= height){ height = Math.round(height * (maxDim / width)); width = maxDim; }
            else { width = Math.round(width * (maxDim / height)); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          onLoaded(canvas.toDataURL('image/jpeg', quality));
        }catch(err){ onLoaded(original); }
      };
      img.onerror = () => onLoaded(original);
      img.src = original;
    };
    reader.readAsDataURL(file);
  }

  /* ===== Styled confirm / info dialogs (replace native window.confirm/alert) ===== */
  let _confirmDialogResolve = null;
  function showConfirmDialog(message, opts){
    opts = opts || {};
    return new Promise(resolve => {
      _confirmDialogResolve = resolve;
      document.getElementById('confirmDialogTitle').textContent = opts.title || 'Please confirm';
      document.getElementById('confirmDialogMessage').textContent = message;
      const okBtn = document.getElementById('confirmDialogOkBtn');
      okBtn.textContent = opts.okText || 'Confirm';
      document.getElementById('confirmDialogCancelBtn').textContent = opts.cancelText || 'Cancel';
      document.getElementById('confirmDialogOverlay').classList.add('open');
      setTimeout(() => okBtn.focus(), 0);
    });
  }
  function _finishConfirmDialog(result){
    document.getElementById('confirmDialogOverlay').classList.remove('open');
    const resolve = _confirmDialogResolve;
    _confirmDialogResolve = null;
    if(resolve) resolve(result);
  }
  document.getElementById('confirmDialogOkBtn').addEventListener('click', () => _finishConfirmDialog(true));
  document.getElementById('confirmDialogCancelBtn').addEventListener('click', () => _finishConfirmDialog(false));
  document.getElementById('confirmDialogOverlay').addEventListener('mousedown', e => { if(e.target.id === 'confirmDialogOverlay') _finishConfirmDialog(false); });

  // Styled replacement for native window.prompt(). Some browsers/environments
  // silently suppress window.prompt() (seen in production: clicking a Void
  // button did nothing at all, in two separate browsers, with no error and
  // no visible dialog) — an in-page modal has no such failure mode and also
  // matches the rest of the app's styled-dialog look. Resolves with the
  // trimmed string the user entered, or null if they cancelled/closed it —
  // same null-vs-string contract as window.prompt(), so existing call sites
  // (`if(reason === null) return;`) work unchanged.
  let _promptDialogResolve = null;
  function showPromptDialog(message, opts){
    opts = opts || {};
    return new Promise(resolve => {
      _promptDialogResolve = resolve;
      document.getElementById('promptDialogTitle').textContent = opts.title || 'Please confirm';
      document.getElementById('promptDialogMessage').textContent = message;
      const okBtn = document.getElementById('promptDialogOkBtn');
      okBtn.textContent = opts.okText || 'Confirm';
      document.getElementById('promptDialogCancelBtn').textContent = opts.cancelText || 'Cancel';
      const input = document.getElementById('promptDialogInput');
      input.value = opts.defaultValue || '';
      input.placeholder = opts.placeholder || '';
      document.getElementById('promptDialogOverlay').classList.add('open');
      setTimeout(() => input.focus(), 0);
    });
  }
  function _finishPromptDialog(result){
    document.getElementById('promptDialogOverlay').classList.remove('open');
    const resolve = _promptDialogResolve;
    _promptDialogResolve = null;
    if(resolve) resolve(result);
  }
  document.getElementById('promptDialogOkBtn').addEventListener('click', () => _finishPromptDialog(document.getElementById('promptDialogInput').value.trim()));
  document.getElementById('promptDialogCancelBtn').addEventListener('click', () => _finishPromptDialog(null));
  document.getElementById('promptDialogOverlay').addEventListener('mousedown', e => { if(e.target.id === 'promptDialogOverlay') _finishPromptDialog(null); });
  document.getElementById('promptDialogInput').addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); _finishPromptDialog(document.getElementById('promptDialogInput').value.trim()); }
  });

  let _infoDialogResolve = null;
  function showInfoDialog(message, opts){
    opts = opts || {};
    return new Promise(resolve => {
      _infoDialogResolve = resolve;
      document.getElementById('infoDialogTitle').textContent = opts.title || 'Info';
      document.getElementById('infoDialogMessage').textContent = message;
      document.getElementById('infoDialogOverlay').classList.add('open');
    });
  }
  function _finishInfoDialog(){
    document.getElementById('infoDialogOverlay').classList.remove('open');
    const resolve = _infoDialogResolve;
    _infoDialogResolve = null;
    if(resolve) resolve(true);
  }
  document.getElementById('infoDialogOkBtn').addEventListener('click', _finishInfoDialog);
  document.getElementById('infoDialogCloseBtn').addEventListener('click', _finishInfoDialog);
  document.getElementById('infoDialogOverlay').addEventListener('mousedown', e => { if(e.target.id === 'infoDialogOverlay') _finishInfoDialog(); });

  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    if(document.getElementById('confirmDialogOverlay').classList.contains('open')) _finishConfirmDialog(false);
    else if(document.getElementById('promptDialogOverlay').classList.contains('open')) _finishPromptDialog(null);
    else if(document.getElementById('infoDialogOverlay').classList.contains('open')) _finishInfoDialog();
  });

  function normalizeClassName(raw){
    const val = (raw||'').toString().trim();
    if(!val) return CLASS_LEVELS[0];
    const exact = CLASS_LEVELS.find(c => c === val);
    if(exact) return exact;
    const ci = CLASS_LEVELS.find(c => c.toLowerCase() === val.toLowerCase());
    if(ci) return ci;
    return val; // unrecognized value — kept as-is rather than silently discarded
  }

  async function loadStudents(){
    try{
      const res = await fetch('/api/students');
      if(!res.ok) throw new Error('bad response');
      students = await res.json();
      _studentsLastSynced = JSON.parse(JSON.stringify(students));
    }catch(e){
      // Server unreachable — fall back to whatever's in this browser so the app still works.
      try{
        const raw = localStorage.getItem(STORAGE_KEY);
        students = raw ? JSON.parse(raw) : [];
      }catch(e2){ students = []; }
    }
    let repaired = false;
    students.forEach(s => {
      const fixed = normalizeClassName(s.className);
      if(fixed !== s.className){ s.className = fixed; repaired = true; }
      if(s.section){
        const secFixed = s.section.toString().trim().toUpperCase();
        if(secFixed !== s.section){ s.section = secFixed; repaired = true; }
      }
    });
    if(repaired) await persist();
    renderDashboard();
    renderAdmissionsBody();
  }

  // Students are backed by the real shared database via /api/students — same
  // diffing approach as Users: the 10 existing call sites elsewhere in the app
  // that just call persist() are untouched; this figures out what changed.
  let _studentsLastSynced = null;
  async function persist(){
    const oldStudents = _studentsLastSynced || [];
    const newIds = new Set(students.map(s => s.id));
    try{
      for(const s of oldStudents){
        if(!newIds.has(s.id)){
          await throwIfNotOk(await fetch('/api/students?id=' + encodeURIComponent(s.id), { method:'DELETE', headers: actorHeaders() }));
        }
      }
      for(const s of students){
        const old = oldStudents.find(x => x.id === s.id);
        if(!old){
          await throwIfNotOk(await fetch('/api/students', { method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify(s) }));
        }else if(JSON.stringify(old) !== JSON.stringify(s)){
          await throwIfNotOk(await fetch('/api/students', { method:'PUT', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify(s) }));
        }
      }
      _studentsLastSynced = JSON.parse(JSON.stringify(students));
      // This local copy is only an offline fallback — the real save above
      // already succeeded at this point. A large roster with many photos
      // can exceed the browser's own localStorage quota (5-10MB, separate
      // from any server/database quota), which used to throw here AFTER a
      // successful server save and get reported as "Could not save to the
      // server" — a false alarm that scared people into thinking their edit
      // was lost when it had already reached the database fine. Now it's
      // just silently skipped: the server copy (just written above) is the
      // real one anyway.
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(students)); }catch(e){}
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast("Could not save to the server (" + e.message + ") — kept locally only on this device.");
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(students)); }catch(e2){}
    }
  }

  /* ===== USERS & AUTH ===== */
  const USERS_KEY = "erp-users";
  const ROLES = ["Admin","Principal","Accountant","Office Assistant","Teacher","Staff","Student","Parent"];
  const ROLE_VIEWS = {
    Admin: ['dashboard','admissions','managefee','attendance','exams','subjects','promotransfer','result','staff','accounting','announcements','inbox','noticeboard','websiteinquiries','websitegallery','contactvendor','reports','inventory','timetable','syllabus','transport','library','hostel','setup'],
    Principal: ['dashboard','admissions','managefee','attendance','exams','subjects','promotransfer','result','staff','accounting','announcements','inbox','noticeboard','websiteinquiries','websitegallery','contactvendor','reports','inventory','timetable','syllabus','transport','library','hostel','setup'],
    Accountant: ['dashboard','admissions','managefee','accounting','reports','inventory','transport'],
    'Office Assistant': ['admissions'],
    Teacher: ['admissions','attendance','exams','subjects','result','timetable','syllabus','library','announcements','inbox'],
    Staff: ['admissions','attendance','inbox'],
    Student: ['myprofile'],
    Parent: ['myprofile'],
  };

  /* ===== ROLES & PERMISSIONS (custom, admin-configurable) ===== */
  