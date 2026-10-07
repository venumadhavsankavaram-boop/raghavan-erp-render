const SETTINGS_KEY = "finance-settings";
  const PAYMENTS_KEY = "finance-payments";
  const FEE_STRUCTURE_KEY = "class-fee-structure";
  const ACADEMIC_YEARS_KEY = "academic-years";
  const CURRENT_AY_KEY = "current-academic-year";
  // Display labels only. The keys ('fee', 'bus', ...) are what payments and the
  // fee structure store, so renaming a label never touches saved data.
  const CATS = { fee: "Tuition Fee", bus: "Bus Fee", stock: "Stock", hostel: "Hostel" };
  function feeLabelFor(p){
    if(p.category === 'extra') return p.extraFeeName || 'Extra Fee';
    return CATS[p.category] || p.category;
  }
  const CAT_COLORS = { fee: "var(--gold)", bus: "var(--magenta)", stock: "var(--teal)", hostel: "var(--navy)" };
  let financeSettings = { hostel: 0 };
  let payments = [];
  let classFeeStructure = {}; // { [className]: { fee, bus, stock } }
  let academicYears = [];
  let currentAcademicYearValue = '';

  // Generic API-backed sync — any storage key listed here gets transparently
  // routed to its real database endpoint instead of local storage, using the
  // same diff-and-sync approach, with a local-storage fallback if the server's
  // ever unreachable. Adding a future module (Fee Structure, Staff, etc.) is
  // just one more line here, rather than rewriting this logic each time.
  const API_BACKED_KEYS = {
    [USERS_KEY]: '/api/users',
    [PAYMENTS_KEY]: '/api/payments',
    [CUSTOM_ROLES_KEY]: '/api/roles',
    'admission-inquiries': '/api/admission-inquiries',
    'comms-messages': '/api/comms-messages',
    'website-gallery': '/api/website-gallery',
  };
  // A second category: whole-object settings (like Fee Structure) that get
  // replaced entirely on save, rather than a growing list of individual
  // records diffed by id. Simpler API on the other end for exactly this shape.
  const OBJECT_BACKED_KEYS = {
    [FEE_STRUCTURE_KEY]: '/api/fee-structure',
    'school-info': '/api/school-info',
  };
  // Third category: every other module's data used to fall straight through to
  // this browser's own localStorage with no server call at all — it worked fine
  // until someone opened the ERP on a second browser or device and found the
  // records missing. Each of these keys now rides the same generic key/value
  // endpoint (one shared Postgres table, keyed by the string on the left) so
  // every module is actually saved to the real database, not just this tab.
  [SETTINGS_KEY, ACADEMIC_YEARS_KEY, CURRENT_AY_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  let _apiLastSynced = {};
  // Throws with the server's own error message (when it sent JSON) on any
  // non-2xx response — fetch() only rejects on a network failure, so without
  // this an oversized upload or a server error (413, 500, ...) resolves
  // "successfully" with an error body, and calling code has no way to tell
  // the request didn't actually do anything.
  // A 401 here means the server-side session cookie is missing, expired, or
  // was never valid — never that this specific save failed for an ordinary
  // reason. Route that case through forceSessionExpired() (shows the login
  // screen with a clear reason) instead of falling into the generic
  // "could not save, kept locally only" message every other failure gets,
  // which would be actively misleading once the real problem is "you got
  // signed out."
  let _sessionExpiredHandled = false;
  function forceSessionExpired(){
    if(_sessionExpiredHandled) return;
    _sessionExpiredHandled = true;
    showToast('Your session has expired — please log in again.');
    logout();
  }
  async function throwIfNotOk(res){
    if(res.ok) return res;
    if(res.status === 401){
      forceSessionExpired();
      throw new Error('SESSION_EXPIRED');
    }
    let msg = 'Request failed (' + res.status + ')';
    try{ const body = await res.json(); if(body && body.error) msg = body.error; }catch(e){}
    throw new Error(msg);
  }
  async function syncArrayToApi(key, newArray){
    const apiPath = API_BACKED_KEYS[key];
    const oldArray = _apiLastSynced[key] || [];
    const newIds = new Set(newArray.map(x => x.id));
    try{
      // Diff with lookups (a Map) instead of scanning the old array for every
      // item: attendance has 20k+ rows, and the scan made each save freeze the
      // browser for seconds. Requests then go out a few at a time instead of
      // strictly one after another, so marking a whole class is not 40
      // sequential round trips. Deletes finish before creates/updates, as before.
      const oldById = new Map(oldArray.map(x => [x.id, x]));
      const deletes = [], writes = [];
      for(const item of oldArray){
        if(!newIds.has(item.id)) deletes.push(() => fetch(apiPath + '?id=' + encodeURIComponent(item.id), { method:'DELETE', headers: actorHeaders() }));
      }
      for(const item of newArray){
        const prev = oldById.get(item.id);
        if(!prev){
          writes.push(() => fetch(apiPath, { method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify(item) }));
        }else if(prev !== item && JSON.stringify(prev) !== JSON.stringify(item)){
          writes.push(() => fetch(apiPath, { method:'PUT', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify(item) }));
        }
      }
      const runPool = async (jobs, width) => {
        let next = 0, failed = null;
        const worker = async () => {
          while(failed === null && next < jobs.length){
            const job = jobs[next++];
            try{ await throwIfNotOk(await job()); }catch(e){ if(failed === null) failed = e; }
          }
        };
        await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
        if(failed !== null) throw failed;
      };
      await runPool(deletes, 6);
      await runPool(writes, 6);
      _apiLastSynced[key] = JSON.parse(JSON.stringify(newArray));
      // Local fallback copy only — the real save already succeeded above.
      // See the matching comment in persist() for why this is wrapped: a
      // full browser localStorage quota (separate from anything server- or
      // database-side) used to throw here right after a successful save and
      // get misreported as a failed one.
      try{ localStorage.setItem(key, JSON.stringify(newArray)); }catch(e){}
      usingLocalFallback = false;
      return true;
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast("Could not save to the server (" + e.message + ") — kept locally only on this device.");
      try{ localStorage.setItem(key, JSON.stringify(newArray)); }catch(e2){}
      if(e.message !== 'SESSION_EXPIRED') usingLocalFallback = true;
      // Callers that need to know the server save genuinely failed (not just
      // "fell back to local storage") check this return value — see saveUser()
      // for why that matters for anything tied to a login account.
      return false;
    }
  }
  // One request for all the settings keys the app reads at sign-in (instead of ~45).
  const KV_PREFETCH_KEYS = ['class-levels','section-levels','class-section-overrides','finance-settings','fee-types','fee-schedule','exam-holidays','report-templates','admit-card-templates','exam-coscholastic','pending-approvals','inventory-items','timetable-entries','syllabus-topics','transport-routes','library-books','hostel-rooms','acct-expense-categories','discount-types','timetable-days','acct-income-categories','library-issues','exam-types','inventory-sales','staff-departments','timetable-periods','acct-cost-centers','library-settings','academic-years','exam-groups','extra-fee-defs','staff-designations','current-academic-year','consol-schemes','inventory-returns','staff-job-types','year-end-print-config','notice-types','inventory-vendor-returns','consolidation-scale','late-fee-settings','grading-scale','receipt-settings','grading-schemes'];
  function kvPrefetch(){
    window.__kvPre = {};
    window.__kvPrePromise = fetch('/api/kv-batch?keys=' + encodeURIComponent(KV_PREFETCH_KEYS.join(',')))
      .then(r => r.ok ? r.json() : {})
      .then(d => { window.__kvPre = (d && typeof d === 'object') ? d : {}; })
      .catch(() => { window.__kvPre = {}; });
    return window.__kvPrePromise;
  }
  // Thin wrapper: drives the ambient "Loading (your file)" badge around every
  // storageGet call (and, by extension, every syncArrayToApi call reached via
  // storageSet below), without touching the actual fetch/fallback logic.
  async function storageGet(key, fallback){
    moSyncStart('load');
    try{
      const r = await _storageGetImpl(key, fallback);
      moSyncDone('load', true);
      return r;
    }catch(e){
      moSyncDone('load', false);
      throw e;
    }
  }
  async function _storageGetImpl(key, fallback){
    if(OBJECT_BACKED_KEYS[key]){
      // Sign-in speed: settings keys arrive together from /api/kv-batch (see kvPrefetch);
      // each is used once, then later reads go to the server as usual.
      try{
        if(window.__kvPrePromise && String(OBJECT_BACKED_KEYS[key]).startsWith('/api/kv/')){
          await window.__kvPrePromise;
          if(window.__kvPre && Object.prototype.hasOwnProperty.call(window.__kvPre, key)){
            const pre = window.__kvPre[key]; delete window.__kvPre[key];
            usingLocalFallback = false;
            return (pre && Object.keys(pre).length) ? pre : fallback;
          }
        }
      }catch(e){}
      try{
        const res = await fetch(OBJECT_BACKED_KEYS[key]);
        if(!res.ok) throw new Error('bad response');
        const data = await res.json();
        usingLocalFallback = false;
        return (data && Object.keys(data).length) ? data : fallback;
      }catch(e){
        usingLocalFallback = true;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }
    }
    if(API_BACKED_KEYS[key]){
      try{
        const res = await fetch(API_BACKED_KEYS[key]);
        if(!res.ok) throw new Error('bad response');
        const data = await res.json();
        _apiLastSynced[key] = JSON.parse(JSON.stringify(data));
        usingLocalFallback = false;
        return data.length ? data : fallback;
      }catch(e){
        usingLocalFallback = true;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }
    }
    try{
      if(storageAvailable){
        const res = await window.storage.get(key, false);
        return res && res.value ? JSON.parse(res.value) : fallback;
      }else{
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }
    }catch(e){ return fallback; }
  }
  // Thin wrapper: drives the ambient "Loading (your file)" → "Soft pulse ring"
  // badge around every storageSet call, without touching the actual save
  // logic (server PUT/POST/DELETE, localStorage fallback, error toasts).
  async function storageSet(key, value){
    moSyncStart('save');
    try{
      const r = await _storageSetImpl(key, value);
      moSyncDone('save', true);
      return r;
    }catch(e){
      moSyncDone('save', false);
      throw e;
    }
  }
  async function _storageSetImpl(key, value){
    if(OBJECT_BACKED_KEYS[key]){
      try{
        await throwIfNotOk(await fetch(OBJECT_BACKED_KEYS[key], { method:'PUT', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify(value) }));
        // Local fallback copy only — see the matching comment in persist().
        try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
        usingLocalFallback = false;
      }catch(e){
        if(e.message !== 'SESSION_EXPIRED') showToast("Could not save to the server (" + e.message + ") — kept locally only on this device.");
        try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e2){}
        if(e.message !== 'SESSION_EXPIRED') usingLocalFallback = true;
      }
      return;
    }
    if(API_BACKED_KEYS[key]){
      return syncArrayToApi(key, value);
    }
    try{
      if(storageAvailable){
        await window.storage.set(key, JSON.stringify(value), false);
      }else{
        localStorage.setItem(key, JSON.stringify(value));
      }
    }catch(e){ showToast("Could not save — please try again."); }
  }

  async function loadFinance(){
    financeSettings = await storageGet(SETTINGS_KEY, { hostel: 0 });
    classFeeStructure = await storageGet(FEE_STRUCTURE_KEY, {});
    academicYears = await storageGet(ACADEMIC_YEARS_KEY, [autoAcademicYear()]);
    currentAcademicYearValue = await storageGet(CURRENT_AY_KEY, autoAcademicYear());
    document.getElementById('ayBadge').textContent = 'AY ' + currentAcademicYearValue;
  }
  // payments (fee collection history) is large and ever-growing — loaded
  // lazily on first actual use instead of at login. See ensureDataLoaded().
  // Read very widely (Fees tab, Accounting, Dashboard, Admissions profile,
  // Reports) — every one of those entry points guards with
  // ensureDataLoaded('payments', loadPaymentsData) before reading it.
  async function loadPaymentsData(){
    payments = await storageGet(PAYMENTS_KEY, []);
  }

  function autoAcademicYear(){
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return m >= 5 ? `${y}-${String(y+1).slice(2)}` : `${y-1}-${String(y).slice(2)}`;
  }

  function classStruct(c){
    return classFeeStructure[c] || { fee:0, bus:0, stock:0, admission:0 };
  }
  function studentBusFare(s){
    if(s.transportRouteId && s.transportStopId){
      const route = transportRoutes.find(r => r.id === s.transportRouteId);
      const stop = route ? route.stops.find(st => st.id === s.transportStopId) : null;
      if(stop) return Number(stop.fare) || 0;
    }
    return Number(classStruct(s.className).bus) || 0;
  }
  function studentHostelFee(s){
    if(s.hostelRoomId){
      const room = hostelRooms.find(r => r.id === s.hostelRoomId);
      if(room) return Number(room.fee) || 0;
    }
    return Number(financeSettings.hostel) || 0;
  }

  function computeFinance(){
    const activeStudents = students.filter(s => isActive(s));
    const perCat = {};
    Object.keys(CATS).forEach(c => {
      const catPayments = payments.filter(p => p.category === c && !p.voided);
      const collected = catPayments.reduce((s,p) => s + (Number(p.amount)||0), 0);
      let discount = c === 'stock' ? 0 : catPayments.reduce((s,p) => s + (Number(p.discount)||0), 0);

      let expected = 0;
      if(c === 'hostel'){
        expected = activeStudents.filter(s => s.isBoarder==='Yes').reduce((sum,s) => sum + studentHostelFee(s), 0);
      }else if(c === 'bus'){
        expected = activeStudents.filter(s => s.needsTransport==='Yes').reduce((sum,s) => sum + studentBusFare(s), 0);
      }else{
        CLASS_LEVELS.forEach(cls => {
          const rate = Number(classStruct(cls)[c]) || 0;
          if(rate <= 0) return;
          expected += rate * activeStudents.filter(s => s.className===cls).length;
        });
      }
      // Approved "Discount Card" entries (studentDiscounts, granted in Manage
      // Fee -> Discounts) are a separate mechanism from the ad-hoc "Discount"
      // amount typed in at the moment a payment is collected. computeStudentFinance()
      // already folds approved studentDiscounts into each student's own totals,
      // but this school-wide version only ever summed payments' own .discount
      // field — so a discount granted via the Discount Card that hadn't also
      // been re-entered on a payment never showed up here, making the
      // Dashboard's "Total Discount Allowed" and By-Category discount figures
      // disagree with what a student's own ledger/profile shows. Mirrored here
      // so both stay consistent.
      if(c !== 'stock'){
        activeStudents.forEach(s => {
          const approved = studentDiscounts.filter(d => d.studentId===s.id && d.status==='Approved' && d.appliesTo===c);
          if(!approved.length) return;
          const catExpectedForStudent = c==='hostel' ? (s.isBoarder==='Yes' ? studentHostelFee(s) : 0)
            : c==='bus' ? (s.needsTransport==='Yes' ? studentBusFare(s) : 0)
            : Number(classStruct(s.className)[c]) || 0;
          approved.forEach(d => {
            discount += d.mode === 'percentage' ? Math.round(catExpectedForStudent * (Number(d.value)||0) / 100) : (Number(d.value)||0);
          });
        });
      }
      const netPayable = Math.max(expected - discount, 0);
      const receivable = Math.max(netPayable - collected, 0);
      perCat[c] = { expected, collected, discount, netPayable, receivable };
    });
    const totals = Object.values(perCat).reduce((acc,c) => ({
      expected: acc.expected + c.expected,
      collected: acc.collected + c.collected,
      discount: acc.discount + c.discount,
      receivable: acc.receivable + c.receivable,
    }), { expected:0, collected:0, discount:0, receivable:0 });
    totals.pct = totals.expected > 0 ? Math.round((totals.collected / totals.expected) * 100) : 0;
    return { perCat, totals };
  }

  function computeStudentFinance(s){
    const perCat = {};
    Object.keys(CATS).forEach(c => {
      // Payments carry a classAtPayment snapshot so a promoted student's old-class payments never get miscounted against their new class's fee.
      // A voided/refunded payment (see voidPayment/submitRefundPayment) is excluded here so a wrongly-assigned or refunded fee stops counting as collected.
      const catPayments = payments.filter(p => p.studentId === s.id && p.category === c && (p.classAtPayment === s.className || !p.classAtPayment) && !p.voided);
      const collected = catPayments.reduce((sum,p) => sum + (Number(p.amount)||0), 0);
      let discount = c === 'stock' ? 0 : catPayments.reduce((sum,p) => sum + (Number(p.discount)||0), 0);
      let expected = 0;
      if(c === 'hostel'){
        expected = s.isBoarder === 'Yes' ? studentHostelFee(s) : 0;
      }else if(c === 'bus'){
        expected = s.needsTransport === 'Yes' ? studentBusFare(s) : 0;
      }else{
        expected = Number(classStruct(s.className)[c]) || 0;
      }
      const approvedDiscounts = studentDiscounts.filter(d => d.studentId===s.id && d.status==='Approved' && d.appliesTo===c);
      approvedDiscounts.forEach(d => {
        discount += d.mode === 'percentage' ? Math.round(expected * (Number(d.value)||0) / 100) : (Number(d.value)||0);
      });
      const netPayable = Math.max(expected - discount, 0);
      const receivable = Math.max(netPayable - collected, 0);
      perCat[c] = { expected, collected, discount, netPayable, receivable };
    });
    const extras = studentExtraFees.filter(e => e.studentId === s.id);
    const extraTotal = extras.reduce((sum,e) => sum + (Number(e.amount)||0), 0);
    const extraUnpaid = extras.filter(e => !e.paid).reduce((sum,e) => sum + (Number(e.amount)||0), 0);
    const extraPaid = extraTotal - extraUnpaid;

    const totals = Object.values(perCat).reduce((acc,c) => ({
      expected: acc.expected + c.expected,
      collected: acc.collected + c.collected,
      discount: acc.discount + c.discount,
      receivable: acc.receivable + c.receivable,
    }), { expected:0, collected:0, discount:0, receivable:0 });
    totals.expected += extraTotal;
    totals.collected += extraPaid;
    totals.receivable += extraUnpaid;
    return { perCat, totals, extras };
  }

  function fmtMoney(n){
    return '₹' + Number(n||0).toLocaleString('en-IN');
  }
  // Turns this school's own name into a filename-safe slug, for exports
  // (backup JSON, Excel templates) — so every school's downloads are named
  // after itself instead of carrying another school's name, without this
  // shared template file ever needing a per-school edit.
  function slugifySchoolName(){
    const base = (schoolInfo && schoolInfo.name || 'school').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'school';
  }
  // Escapes text before it's dropped into a template-literal innerHTML
  // string, so a value containing "<", ">", "&", quotes, etc. renders as
  // plain text instead of being parsed as markup. Needed anywhere text
  // reaching this app from OUTSIDE the ERP's own staff-only UI gets
  // displayed — right now that's exactly one place: admission inquiries
  // submitted by anonymous visitors through the public school website's
  // form (see renderAdmissionInquiries). Safe to use anywhere else too.
  function escapeHtml(str){
    if(str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ===== DASHBOARD RENDER ===== */
  