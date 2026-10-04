const CUSTOM_ROLES_KEY = "custom-roles";
  // Categories mirror the sidebar's own section headers (Overview/Academics/
  // Communication/Finance/Staff/Facilities/Reports/Configuration) so the
  // matrix reads as a direct map of "what shows up in the sidebar", not a
  // separate taxonomy an admin has to learn. Modules with a `parent` are
  // rendered nested under that parent row in the matrix; when a role has no
  // explicit choice saved for a sub-module, access falls back to its parent's
  // permission (see getResultTabAccess / getAccountingTabAccess / etc. below)
  // so nothing that used to work silently breaks the moment a sub-module is
  // introduced. `hidden:true` marks a legacy key kept only as that fallback
  // target — it no longer gets its own row in the matrix.
  const PERMISSION_MODULES = [
    { key:'dashboard',   label:'Dashboard',          icon:'📊', category:'Overview' },

    { key:'admissions',  label:'Manage Student',     icon:'🎓', category:'Academics' },
    { key:'attendance',  label:'Manage Attendance',  icon:'📋', category:'Academics' },
    { key:'subjects',    label:'Manage Subjects',    icon:'📘', category:'Academics' },
    { key:'exams',       label:'Manage Exams',       icon:'📝', category:'Academics' },
    { key:'exams_definitions', label:'Exam Types & Definitions', icon:'🗂️', category:'Academics', parent:'exams', isNew:true },
    { key:'exams_marks',        label:'Marks Entry',          icon:'✍️', category:'Academics', parent:'exams', isNew:true },
    { key:'exams_entrystatus',  label:'Marks Entry Status',   icon:'📶', category:'Academics', parent:'exams', isNew:true },
    { key:'exams_results',      label:'Results Summary',      icon:'📊', category:'Academics', parent:'exams', isNew:true },
    { key:'exams_holidays',     label:'Exam Holidays',        icon:'📅', category:'Academics', parent:'exams', isNew:true },
    { key:'result',      label:'Result',             icon:'🏆', category:'Academics' },
    { key:'result_admitcards',   label:'Admit Cards',           icon:'🪪', category:'Academics', parent:'result', isNew:true },
    { key:'result_roomallotment', label:'Room Allotment',       icon:'🚪', category:'Academics', parent:'result', isNew:true },
    { key:'result_progress',     label:'Progress Reports',      icon:'📄', category:'Academics', parent:'result', isNew:true },
    { key:'result_consolidated', label:'Consolidated Report',   icon:'📊', category:'Academics', parent:'result', isNew:true },
    { key:'result_yearend',      label:'Year-End Marks Cards',  icon:'🎓', category:'Academics', parent:'result', isNew:true },
    { key:'result_examtemplates', label:'Exam Templates',       icon:'🧩', category:'Academics', parent:'result', isNew:true },
    { key:'result_consolscale',  label:'Consolidation Scale',   icon:'📐', category:'Academics', parent:'result', isNew:true },
    { key:'result_grading',      label:'Grading Scale',         icon:'🎯', category:'Academics', parent:'result', isNew:true },
    { key:'result_templates',    label:'Report Templates',      icon:'🗂️', category:'Academics', parent:'result', isNew:true },
    { key:'timetable',   label:'Timetable',          icon:'🗓️', category:'Academics' },
    { key:'timetable_class',    label:'Class Timetable (edit)', icon:'📅', category:'Academics', parent:'timetable', isNew:true },
    { key:'timetable_teacher',  label:'Teacher View',           icon:'🧑‍🏫', category:'Academics', parent:'timetable', isNew:true },
    { key:'timetable_periods',  label:'Periods Setup',          icon:'⏰', category:'Academics', parent:'timetable', isNew:true },
    { key:'syllabus',    label:'Syllabus & Homework', icon:'📔', category:'Academics' },
    { key:'syllabus_tracker',  label:'Syllabus Tracker', icon:'📖', category:'Academics', parent:'syllabus', isNew:true },
    { key:'syllabus_homework', label:'Homework',         icon:'📝', category:'Academics', parent:'syllabus', isNew:true },
    { key:'promotransfer', label:'Promotion & Transfer', icon:'🔀', category:'Academics' },
    { key:'promo_promote',  label:'Promote Students',  icon:'⬆️', category:'Academics', parent:'promotransfer', isNew:true },
    { key:'promo_section', label:'Change Section', icon:'🔀', category:'Academics', parent:'promotransfer', isNew:true },
    { key:'promo_transfer', label:'Transfer Students', icon:'🔁', category:'Academics', parent:'promotransfer', isNew:true },
    { key:'promo_approvals', label:'Approve Requests', icon:'✅', category:'Academics', parent:'promotransfer', isNew:true },

    { key:'announcements', label:'Communications',    icon:'📣', category:'Communication' },
    { key:'comms_compose',  label:'Compose & Send',    icon:'✍️', category:'Communication', parent:'announcements', isNew:true },
    { key:'comms_log',      label:'Message Log',       icon:'🗂️', category:'Communication', parent:'announcements', isNew:true },
    { key:'inbox',       label:'Inbox',              icon:'📥', category:'Communication', isNew:true },
    { key:'noticeboard', label:'Notice Board',         icon:'📌', category:'Communication' },
    { key:'noticeboard_post',     label:'Post / Edit Notices', icon:'✍️', category:'Communication', parent:'noticeboard', isNew:true },
    { key:'noticeboard_headings', label:'Manage Headings',     icon:'🏷️', category:'Communication', parent:'noticeboard', isNew:true },
    { key:'websiteinquiries', label:'Website Inquiries', icon:'🌐', category:'Communication' },
    { key:'websitegallery', label:'Website Gallery',   icon:'🖼️', category:'Communication' },
    { key:'contactvendor', label:'Contact Vendor',   icon:'✉️', category:'Communication' },

    { key:'managefee',   label:'Manage Fee',         icon:'💰', category:'Finance' },
    { key:'managefee_collection', label:'Fee Collection & Receipts', icon:'💳', category:'Finance', parent:'managefee', isNew:true },
    { key:'managefee_structure',  label:'Fee Structure',             icon:'🏗️', category:'Finance', parent:'managefee', isNew:true },
    { key:'managefee_types',      label:'Fee Types',                 icon:'🏷️', category:'Finance', parent:'managefee', isNew:true },
    { key:'managefee_discounts',  label:'Discounts',                 icon:'🎟️', category:'Finance', parent:'managefee', isNew:true },
    { key:'managefee_extra',      label:'Extra Fees',                icon:'➕', category:'Finance', parent:'managefee', isNew:true },
    { key:'managefee_late',       label:'Late Fees & Receipt Numbering', icon:'⏰', category:'Finance', parent:'managefee', isNew:true },
    { key:'managefee_defaulters', label:'Fee Defaulters',            icon:'⚠️', category:'Finance', parent:'managefee', isNew:true },
    { key:'accounting',  label:'Accounting',         icon:'💼', category:'Finance' },
    { key:'accounting_overview', label:'Overview',   icon:'📊', category:'Finance', parent:'accounting' },
    { key:'accounting_income', label:'Income',       icon:'💰', category:'Finance', parent:'accounting' },
    { key:'accounting_expenses', label:'Expenses',   icon:'💸', category:'Finance', parent:'accounting' },
    { key:'accounting_segments', label:'P&L by Account', icon:'📈', category:'Finance', parent:'accounting', isNew:true },
    { key:'accounting_categories', label:'Categories', icon:'🏷️', category:'Finance', parent:'accounting' },
    { key:'accounting_chartofaccounts', label:'Chart of Accounts', icon:'🗂️', category:'Finance', parent:'accounting', isNew:true },
    { key:'accounting_journal', label:'Journal Vouchers', icon:'📒', category:'Finance', parent:'accounting', isNew:true },
    { key:'accounting_bank', label:'Bank & Reconciliation', icon:'🏦', category:'Finance', parent:'accounting', isNew:true },
    { key:'accounting_assets', label:'Fixed Assets', icon:'🏢', category:'Finance', parent:'accounting', isNew:true },
    { key:'accounting_budget', label:'Budgets', icon:'📅', category:'Finance', parent:'accounting', isNew:true },

    { key:'staff',       label:'Staff Directory',    icon:'🧑‍💼', category:'Staff' },
    { key:'staff_depts', label:'Departments & Designations', icon:'🏢', category:'Staff', isNew:true },
    { key:'staff_idcards', label:'ID Cards',         icon:'🪪', category:'Staff', isNew:true },
    { key:'staff_payroll', label:'Payroll',          icon:'💵', category:'Staff', isNew:true },
    { key:'staff_attendance', label:'Staff Attendance', icon:'🕒', category:'Staff' },
    { key:'staff_reports',    label:'Staff Reports',    icon:'📈', category:'Staff' },

    { key:'inventory',   label:'Inventory',          icon:'📦', category:'Facilities' },
    { key:'inventory_items',    label:'Products / Items',   icon:'🏷️', category:'Facilities', parent:'inventory', isNew:true },
    { key:'inventory_sell',     label:'Sell (POS)',         icon:'🛒', category:'Facilities', parent:'inventory', isNew:true },
    { key:'inventory_approvals', label:'Approvals',         icon:'✅', category:'Facilities', parent:'inventory', isNew:true },
    { key:'inventory_saleshistory', label:'Sales History',  icon:'🧾', category:'Facilities', parent:'inventory', isNew:true },
    { key:'inventory_stockoverview', label:'Stock Overview', icon:'📊', category:'Facilities', parent:'inventory', isNew:true },
    { key:'transport',   label:'Transport',          icon:'🚌', category:'Facilities' },
    { key:'transport_routes', label:'Routes',            icon:'🚌', category:'Facilities', parent:'transport', isNew:true },
    { key:'transport_assign', label:'Assign Students',   icon:'🧾', category:'Facilities', parent:'transport', isNew:true },
    { key:'transport_roster', label:'Route Roster',      icon:'📋', category:'Facilities', parent:'transport', isNew:true },
    { key:'transport_buspass', label:'Bus Passes',       icon:'🪪', category:'Facilities', parent:'transport', isNew:true },
    { key:'library',     label:'Library',            icon:'📚', category:'Facilities' },
    { key:'library_catalog',     label:'Catalog',           icon:'📚', category:'Facilities', parent:'library', isNew:true },
    { key:'library_issuereturn', label:'Issue & Return',    icon:'🔄', category:'Facilities', parent:'library', isNew:true },
    { key:'library_overdue',     label:'Overdue & Fines',   icon:'⚠️', category:'Facilities', parent:'library', isNew:true },
    { key:'library_settings',    label:'Settings',          icon:'⚙️', category:'Facilities', parent:'library', isNew:true },
    { key:'hostel',      label:'Hostel',             icon:'🏠', category:'Facilities' },
    { key:'hostel_rooms', label:'Rooms',              icon:'🛏️', category:'Facilities', parent:'hostel', isNew:true },
    { key:'hostel_allot', label:'Allot Students',     icon:'🧾', category:'Facilities', parent:'hostel', isNew:true },
    { key:'hostel_roster', label:'Room Roster',       icon:'📋', category:'Facilities', parent:'hostel', isNew:true },

    { key:'reports',     label:'Reports (menu access)', icon:'📈', category:'Reports' },
    { key:'reports_academic',   label:'Academic Reports',   icon:'🎓', category:'Reports' },
    { key:'reports_attendance', label:'Attendance Reports', icon:'📋', category:'Reports' },
    { key:'reports_marks',      label:'Marks Reports',      icon:'📝', category:'Reports' },
    { key:'reports_accounts',   label:'Accounts Reports',   icon:'💰', category:'Reports' },
    { key:'reports_employee',   label:'Employee Reports',   icon:'🧑‍💼', category:'Reports' },
    { key:'reports_teacher_performance', label:'Teacher Performance Reports', icon:'🧑‍🏫', category:'Reports' },
    { key:'reports_inventory',  label:'Inventory / Stock Reports', icon:'📦', category:'Reports', isNew:true },
    { key:'reports_transport',  label:'Transport / Vehicle Reports', icon:'🚌', category:'Reports', isNew:true },
    { key:'reports_library',    label:'Library Reports', icon:'📚', category:'Reports', isNew:true },
    { key:'reports_hostel',     label:'Hostel Reports', icon:'🏠', category:'Reports', isNew:true },
    { key:'reports_admissions', label:'Admissions / Inquiry Reports', icon:'📝', category:'Reports', isNew:true },
    { key:'reports_custom',     label:'Custom Report Builder', icon:'🛠️', category:'Reports' },

    { key:'setup',       label:'Initial Setup (legacy)', icon:'⚙️', category:'Configuration', hidden:true },
    { key:'setup_schoolprofile', label:'School Profile',  icon:'🏫', category:'Configuration', isNew:true },
    { key:'setup_classes',       label:'Classes',         icon:'📚', category:'Configuration', isNew:true },
    { key:'setup_academicyear',  label:'Academic Year',   icon:'📅', category:'Configuration', isNew:true },
    { key:'setup_feestructure',  label:'Fee Structure',   icon:'💳', category:'Configuration', isNew:true },
    { key:'setup_promotions',    label:'Promotions Setup', icon:'⬆️', category:'Configuration', isNew:true },
  ];

  const PERMISSION_ACTIONS = ['view','create','edit','delete','print','approve'];
  const PERMISSION_CATEGORY_COLORS = { Overview:'#544C6B', Academics:'#2a4d8f', Communication:'#a02463', Finance:'#1f7a4d', Staff:'#b8621b', Facilities:'#6b4fa0', Reports:'#188F86', Configuration:'#CB9A2E' };
  // Built once from each module's own `parent` field, so every place that
  // needs "what are this module's children" (the bug fix below, and the
  // editor UI) reads off one source of truth instead of the many separate
  // hand-maintained *_SUBMODULE_KEYS lists further down (those still exist
  // for their own named helpers, but this is the generic version).
  const CHILDREN_OF_PARENT = {};
  PERMISSION_MODULES.forEach(m => { if(m.parent) (CHILDREN_OF_PARENT[m.parent] = CHILDREN_OF_PARENT[m.parent] || []).push(m.key); });
  // A parent module's own "View" checkbox used to be the ONLY thing that
  // decided whether its sidebar entry appeared at all — so granting a
  // custom role "Fee Collection & Receipts" (a child of Manage Fee) did
  // nothing until an admin ALSO remembered to separately tick "View" on the
  // unrelated-looking "Manage Fee" parent row. That's the bug reported:
  // "unless I allow full permission for the module it's not being viewed."
  // Fix: a parent is implicitly viewable the moment ANY of its children has
  // ANY permission at all — granting the child is now sufficient by itself.
  function moduleHasAnyChildPermission(ov, parentKey){
    const children = CHILDREN_OF_PARENT[parentKey];
    if(!children || !children.length) return false;
    return children.some(ck => {
      const cp = ov.permissions[ck];
      return cp && PERMISSION_ACTIONS.some(a => cp[a]);
    });
  }
  // Same bug, one level up: a FLAT module with no children (Manage Student,
  // Manage Fee's own row, Inventory's own row, Manage Staff, ...) used to
  // stay completely invisible unless its own "View" box specifically was
  // ticked — so an admin who granted Office Assistant only "Create" (or only
  // "Approve") on a module, meaning to let them do that one thing, found the
  // whole module missing from the sidebar with no obvious reason why.
  // Fix: a module is implicitly viewable the moment ANY of its own action
  // checkboxes is ticked, not just "View" specifically — the module then
  // shows up in the sidebar, and each individual button/screen inside it
  // still only shows for the specific action that's actually granted (every
  // button already gates itself with its own canDo(module, action) check;
  // this only ever widens whether the module's page is reachable at all,
  // never which buttons appear once you're on it).
  function moduleHasAnyOwnPermission(ov, moduleKey){
    const p = ov.permissions[moduleKey];
    return !!(p && PERMISSION_ACTIONS.some(a => p[a]));
  }
  // Pages that manage who can log in and what every role can do are never
  // delegable through this matrix, no matter how a role is customized —
  // otherwise a role could grant itself (or anyone) more access than it
  // already has. They're shown in the matrix UI as a locked, informational
  // list rather than as checkboxes; actual visibility stays hardcoded to
  // role === 'Admin' in applyRolePermissions(), same as before this feature.
  const LOCKED_ADMIN_ONLY_PAGES = [
    { label:'Users & Roles', icon:'👤' },
    { label:'Roles & Permissions', icon:'🔐' },
    { label:'Student / Parent Logins', icon:'🔑' },
    { label:'Admin Tools', icon:'🛠️' },
  ];

  let customRoles = [];
  function emptyPermSet(){
    const p = {};
    PERMISSION_MODULES.forEach(m => { p[m.key] = {}; PERMISSION_ACTIONS.forEach(a => { p[m.key][a] = false; }); });
    return p;
  }
  async function loadCustomRoles(){
    customRoles = await storageGet(CUSTOM_ROLES_KEY, []);
  }
  function findRoleOverride(role){
    // Student and Parent logins are deliberately locked to their own child's
    // data (the My Portal page), which the generic module-permission system
    // has no concept of — "view" on Manage Fee or Exams there means "see the
    // whole school's", not "see my own child's". So these two roles never
    // participate in custom permission overrides, no matter what a saved
    // override in the database says (this is what closes the gap where a
    // custom "Parent"/"Student" role — created via Roles & Permissions'
    // built-in "Edit Permissions" — used to leak every student's fee/marks
    // data to every parent).
    if(role === 'Student' || role === 'Parent') return undefined;
    return customRoles.find(r => r.name === role);
  }
  function getRoleViews(role){
    const ov = findRoleOverride(role);
    if(ov){
      return PERMISSION_MODULES.filter(m => {
        if(ov.permissions[m.key] !== undefined) return moduleHasAnyOwnPermission(ov, m.key) || moduleHasAnyChildPermission(ov, m.key);
        // This module didn't exist yet when the override was saved — fall back to the role's built-in default instead of silently hiding it.
        return ROLE_VIEWS[role] ? ROLE_VIEWS[role].includes(m.key) : false;
      }).map(m => m.key);
    }
    return ROLE_VIEWS[role] || [];
  }
  function getRolePermission(role, moduleKey, action){
    const ov = findRoleOverride(role);
    if(ov){
      if(ov.permissions[moduleKey] !== undefined){
        if(action === 'view') return moduleHasAnyOwnPermission(ov, moduleKey) || moduleHasAnyChildPermission(ov, moduleKey);
        return !!ov.permissions[moduleKey][action];
      }
      return ROLE_VIEWS[role] ? ROLE_VIEWS[role].includes(moduleKey) : false;
    }
    return ROLE_VIEWS[role] ? ROLE_VIEWS[role].includes(moduleKey) : false; // built-in default: full access to any view they can see
  }
  // Shorthand for gating a button/action for the CURRENTLY logged-in user
  // against a simple (non-sub-scoped) module — e.g. canDo('admissions','create').
  // Sub-scoped modules keep using their own dedicated helper (getAccountingTabAccess,
  // getResultTabAccess, getStaffSubpageAccess, getSetupTabAccess, getReportCategoryAccess)
  // since each of those has its own fallback-to-parent behavior.
  function canDo(moduleKey, action){
    if(!currentUser) return false;
    return getRolePermission(currentUser.role, moduleKey, action);
  }
  // A Teacher login's real duties — enforced server-side too (see
  // getTeacherScope in server.js) — are their homeroom class
  // (classTeacherClass/classTeacherSection on their own staff record) and
  // the subject+section combinations they're the assigned Subject Teacher
  // for (subjectStaffForSection, the same lookup the Subjects screen
  // itself uses). Mirrored here so Attendance and Marks Entry only ever
  // show a Teacher their own classes/subjects to begin with, instead of
  // showing every class and then failing silently to save.
  function myTeacherScope(){
    if(!currentUser || currentUser.role !== 'Teacher') return null;
    const myStaff = staffList.find(st => st.linkedUserId === currentUser.id);
    // `unlinked: true` means this login has no staff record pointing back at
    // it at all (staff.linkedUserId never got set/persisted) — distinct from
    // a real staff record that simply has no class/subject assigned yet, so
    // Attendance/Marks Entry can tell a teacher the actual problem instead of
    // implying their timetable assignment is missing when it's really just
    // their login that needs linking (see openLoginForStaff/saveUser and the
    // Staff-edit Contact tab's "create a login" flow).
    if(!myStaff) return { staffId: null, classTeacherOf: null, subjectSections: [], unlinked: true };
    const classTeacherOf = (myStaff.classTeacherClass && myStaff.classTeacherSection)
      ? { className: myStaff.classTeacherClass, section: myStaff.classTeacherSection } : null;
    const subjectSections = [];
    subjectsList.forEach(subj => {
      (subj.sections||[]).forEach(sec => {
        if(subjectStaffForSection(subj, sec).includes(myStaff.id)){
          subjectSections.push({ subject: subj.name, className: subj.className, section: sec });
        }
      });
    });
    return { staffId: myStaff.id, classTeacherOf, subjectSections };
  }
  function getReportCategoryAccess(role, moduleKey){
    const ov = findRoleOverride(role);
    if(ov && ov.permissions[moduleKey] !== undefined) return !!ov.permissions[moduleKey].view;
    // No explicit choice made yet for this report category — default to visible if the role has Reports access at all.
    return getRoleViews(role).includes('reports');
  }
  // Staff Attendance and Staff Reports moved from the Manage Attendance and Reports modules into
  // the Staff module. An admin can now grant/restrict each independently via Roles & Permissions.
  // Until they do, access defaults to whatever the role already had for the equivalent legacy
  // permission (or full Staff access), so no one silently loses what they could already do.
  function getStaffAttendanceAccess(role, action){
    action = action || 'view';
    const ov = findRoleOverride(role);
    if(ov && ov.permissions['staff_attendance'] !== undefined) return !!ov.permissions['staff_attendance'][action];
    return getRolePermission(role, 'staff', action) || getRolePermission(role, 'attendance', action);
  }
  function getStaffReportsAccess(role, action){
    action = action || 'view';
    const ov = findRoleOverride(role);
    if(ov && ov.permissions['staff_reports'] !== undefined) return !!ov.permissions['staff_reports'][action];
    return getRolePermission(role, 'staff', action) || getReportCategoryAccess(role, 'reports_employee') || getReportCategoryAccess(role, 'reports_teacher_performance');
  }
  // Staff Activity is a school-wide monitoring dashboard (homework assigned,
  // submissions reviewed, parent concerns responded to, attendance marked,
  // staff present/absent today) — it shows every staff member's own numbers
  // to whoever opens it, so unlike the other Staff sub-pages it defaults to
  // Admin/Principal only rather than inheriting plain Staff-module access.
  // An admin can still open it up to another role explicitly via Roles &
  // Permissions, same override mechanism as every other sub-module here.
  function getStaffActivityAccess(role){
    const ov = findRoleOverride(role);
    if(ov && ov.permissions['staff_activity'] !== undefined) return !!ov.permissions['staff_activity'].view;
    return role === 'Admin' || role === 'Principal';
  }
  // Generic fallback-aware sub-module access check: every "module has several
  // distinct tabs/buttons, each independently permissionable" case in the app
  // goes through this one function. No explicit choice saved yet for the
  // sub-module itself → fall back to the parent module's own permission, so
  // nothing that used to work silently breaks the moment a sub-module is
  // introduced — an admin only sees a behavior change once they deliberately
  // narrow a specific sub-module down in Roles & Permissions.
  function getSubModuleAccess(role, subKey, parentKey, action){
    action = action || 'view';
    const ov = findRoleOverride(role);
    if(ov && ov.permissions[subKey] !== undefined) return !!ov.permissions[subKey][action];
    return getRolePermission(role, parentKey, action);
  }
  // Thin, named wrappers kept for every existing call site + readability —
  // all delegate to getSubModuleAccess above.
  function getAccountingTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'accounting', action); }
  const RESULT_SUBMODULE_KEYS = ['result_admitcards','result_roomallotment','result_progress','result_consolidated','result_yearend','result_examtemplates','result_consolscale','result_grading','result_templates'];
  function getResultTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'result', action); }
  const STAFF_SUBPAGE_KEYS = ['staff_depts','staff_idcards','staff_payroll'];
  function getStaffSubpageAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'staff', action); }
  const SETUP_SUBMODULE_KEYS = ['setup_schoolprofile','setup_classes','setup_academicyear','setup_feestructure','setup_promotions'];
  function getSetupTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'setup', action); }
  // Newly added sub-module groups (each mirrors that module's own tabs/buttons
  // one-for-one) — same fallback-to-parent behavior throughout.
  const EXAMS_SUBMODULE_KEYS = ['exams_definitions','exams_marks','exams_entrystatus','exams_results','exams_holidays'];
  function getExamsTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'exams', action); }
  const TIMETABLE_SUBMODULE_KEYS = ['timetable_class','timetable_teacher','timetable_periods'];
  function getTimetableTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'timetable', action); }
  const SYLLABUS_SUBMODULE_KEYS = ['syllabus_tracker','syllabus_homework'];
  function getSyllabusTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'syllabus', action); }
  const PROMOTRANSFER_SUBMODULE_KEYS = ['promo_promote','promo_section','promo_transfer','promo_approvals'];
  function getPromoTransferTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'promotransfer', action); }
  const COMMS_SUBMODULE_KEYS = ['comms_compose','comms_log'];
  function getCommsTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'announcements', action); }
  const NOTICEBOARD_SUBMODULE_KEYS = ['noticeboard_post','noticeboard_headings'];
  function getNoticeBoardTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'noticeboard', action); }
  const MANAGEFEE_SUBMODULE_KEYS = ['managefee_collection','managefee_structure','managefee_types','managefee_discounts','managefee_extra','managefee_late','managefee_defaulters'];
  function getManageFeeTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'managefee', action); }
  const INVENTORY_SUBMODULE_KEYS = ['inventory_items','inventory_sell','inventory_approvals','inventory_saleshistory','inventory_stockoverview'];
  function getInventoryTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'inventory', action); }
  const TRANSPORT_SUBMODULE_KEYS = ['transport_routes','transport_assign','transport_roster','transport_buspass'];
  function getTransportTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'transport', action); }
  const LIBRARY_SUBMODULE_KEYS = ['library_catalog','library_issuereturn','library_overdue','library_settings'];
  function getLibraryTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'library', action); }
  const HOSTEL_SUBMODULE_KEYS = ['hostel_rooms','hostel_allot','hostel_roster'];
  function getHostelTabAccess(role, moduleKey, action){ return getSubModuleAccess(role, moduleKey, 'hostel', action); }
  // Current-user shorthand for the generic checker, for terser call sites.
  function canSub(subKey, parentKey, action){
    if(!currentUser) return false;
    return getSubModuleAccess(currentUser.role, subKey, parentKey, action);
  }
  function allRoleNames(){
    return [...ROLES, ...customRoles.map(r => r.name).filter(n => !ROLES.includes(n))];
  }
  function seedPermissionsFromDefault(roleName){
    const p = emptyPermSet();
    const defaultViews = ROLE_VIEWS[roleName] || [];
    defaultViews.forEach(key => {
      if(p[key]) PERMISSION_ACTIONS.forEach(a => { p[key][a] = true; });
    });
    // A handful of modules' sub-pages aren't separate sidebar views, so
    // they're not in ROLE_VIEWS — but any role that already gets the parent
    // module by default should still see all its sub-pages by default too,
    // exactly as before those sub-permissions existed. An admin can then
    // selectively narrow individual sub-pages down afterward.
    const SUBMODULE_GROUPS_BY_PARENT = {
      accounting: ['accounting_overview','accounting_income','accounting_expenses','accounting_segments','accounting_categories','accounting_chartofaccounts','accounting_journal','accounting_bank','accounting_assets','accounting_budget'],
      result: RESULT_SUBMODULE_KEYS,
      setup: SETUP_SUBMODULE_KEYS,
      staff: STAFF_SUBPAGE_KEYS,
      exams: EXAMS_SUBMODULE_KEYS,
      timetable: TIMETABLE_SUBMODULE_KEYS,
      syllabus: SYLLABUS_SUBMODULE_KEYS,
      promotransfer: PROMOTRANSFER_SUBMODULE_KEYS,
      announcements: COMMS_SUBMODULE_KEYS,
      noticeboard: NOTICEBOARD_SUBMODULE_KEYS,
      managefee: MANAGEFEE_SUBMODULE_KEYS,
      inventory: INVENTORY_SUBMODULE_KEYS,
      transport: TRANSPORT_SUBMODULE_KEYS,
      library: LIBRARY_SUBMODULE_KEYS,
      hostel: HOSTEL_SUBMODULE_KEYS,
    };
    Object.keys(SUBMODULE_GROUPS_BY_PARENT).forEach(parentKey => {
      if(defaultViews.includes(parentKey)){
        SUBMODULE_GROUPS_BY_PARENT[parentKey].forEach(key => {
          if(p[key]) PERMISSION_ACTIONS.forEach(a => { p[key][a] = true; });
        });
      }
    });
    return p;
  }

  let users = [];
  let currentUser = null;
  // Set from the login/`/api/me` response's `moduleAccess` field (see
  // server.js) — mirrors the shape vendor-reporting.js's getModuleAccess()
  // returns. Billing-driven, separate from the role-based ROLE_VIEWS system:
  // `restricted: false` (the default) means every module is available,
  // exactly as before this existed.
  let moduleAccess = { restricted: false, enabledKeys: [] };
  function isModuleEnabledByPlan(key){
    return !moduleAccess.restricted || moduleAccess.enabledKeys.includes(key);
  }

  // Headers the server's audit log reads to know who made a change — see
  // server.js's central logging hook on the /api/:resource dispatcher.
  // encodeURIComponent guards against names with non-ASCII characters
  // (accented letters, non-Latin scripts), since raw UTF-8 in a header
  // value can throw inside the browser's Headers implementation; the
  // server decodes it back with decodeHeaderValue(). No entry is added
  // when nobody is signed in (e.g. the one anonymous write this app
  // accepts, the public admission-inquiry form) — the server just logs the
  // actor as unknown in that case, which is the accurate answer.
  function actorHeaders(){
    if(!currentUser) return {};
    return {
      'X-Actor-Name': encodeURIComponent(currentUser.name || currentUser.username || ''),
      'X-Actor-Role': encodeURIComponent(currentUser.role || ''),
    };
  }

  function generateRecoveryCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for(let i=0;i<8;i++) code += chars[Math.floor(Math.random()*chars.length)];
    return code;
  }

  async function loadUsers(){
    // The default admin account is seeded server-side on first run (server.js),
    // with a random password printed once to the server console — this used to
    // create a hardcoded admin/admin123 account from here instead, which meant
    // that exact password sat in plain text in the shipped JavaScript regardless
    // of whether anyone had actually changed it since. Nothing here fabricates
    // a login anymore; this only loads whatever accounts already exist.
    let stored = await storageGet(USERS_KEY, null) || [];
    let changed = false;
    stored.forEach(u => { if(!u.recoveryCode){ u.recoveryCode = generateRecoveryCode(); changed = true; } });
    if(changed) await storageSet(USERS_KEY, stored);
    users = stored;
  }

  // Purely a UX aid, not a security boundary by itself — the actual gate is
  // the server checking this against the account's real role (see
  // submitLogin below and the matching check in /api/login). Lets someone
  // who fat-fingers the wrong tab find out immediately ("this is a Staff
  // account") instead of just being told the password's wrong.
  let loginAudience = 'staff';
  function setLoginAudience(audience){
    loginAudience = audience;
    document.getElementById('loginAudienceStaffBtn').classList.toggle('active', audience === 'staff');
    document.getElementById('loginAudienceStaffBtn').setAttribute('aria-selected', audience === 'staff');
    document.getElementById('loginAudienceParentBtn').classList.toggle('active', audience === 'parent');
    document.getElementById('loginAudienceParentBtn').setAttribute('aria-selected', audience === 'parent');
    document.getElementById('loginError').style.display = 'none';
  }

  function toggleForgotPassword(show){
    document.getElementById('loginForm').style.display = show ? 'none' : 'block';
    document.getElementById('forgotForm').style.display = show ? 'block' : 'none';
    document.getElementById('forgotError').style.display = 'none';
    document.getElementById('forgotSuccess').style.display = 'none';
  }

  async function resetPasswordWithCode(e){
    e.preventDefault();
    const uname = document.getElementById('fpUsername').value.trim();
    const code = document.getElementById('fpCode').value.trim().toUpperCase();
    const pw1 = document.getElementById('fpNewPassword').value;
    const pw2 = document.getElementById('fpConfirmPassword').value;
    const errEl = document.getElementById('forgotError');
    const okEl = document.getElementById('forgotSuccess');
    errEl.style.display = 'none';
    okEl.style.display = 'none';

    const u = users.find(x => x.username.toLowerCase() === uname.toLowerCase() && (x.recoveryCode||'').toUpperCase() === code);
    if(!u){
      errEl.textContent = 'Username and recovery code do not match any account.';
      errEl.style.display = 'block';
      return false;
    }
    if(!pw1 || pw1.length < 4){
      errEl.textContent = 'New password must be at least 4 characters.';
      errEl.style.display = 'block';
      return false;
    }
    if(pw1 !== pw2){
      errEl.textContent = 'Passwords do not match.';
      errEl.style.display = 'block';
      return false;
    }
    u.password = pw1;
    await storageSet(USERS_KEY, users);
    okEl.textContent = 'Password updated. You can sign in now.';
    okEl.style.display = 'block';
    document.getElementById('loginUsername').value = u.username;
    document.getElementById('fpNewPassword').value = '';
    document.getElementById('fpConfirmPassword').value = '';
    document.getElementById('fpCode').value = '';
    setTimeout(() => toggleForgotPassword(false), 1400);
    return false;
  }

  // Whether someone is signed in is now decided by the server, not by
  // whatever sessionStorage happens to say — anyone could set
  // rgv_current_user in devtools before, and the app would just believe it.
  // /api/me answers based on the httpOnly session cookie the server issued
  // at login, which client-side code never sees or controls. This call
  // happens once, right after the app's very first (necessarily
  // unauthenticated, since there's no cookie yet on a first visit) pass
  // through loadAllAppData() below — so on a fresh visit this correctly
  // finds no session and shows the login screen, and on a page refresh
  // while already signed in, it finds the real session and re-runs
  // loadAllAppData() a second time so every module has the actual data
  // (the first pass, before we knew the session was valid, mostly got 401s
  // and fell back to whatever was cached locally).
  // ---------- Web Push subscription (Parent/Student + Admin/Principal logins) ----------
  // Fee payment, fee due, marks-published and Absent/Late/Leave attendance
  // pushes all come from server.js's notify* functions (see "Notifications:
  // Web Push + WhatsApp") — this just gets the browser subscribed so
  // there's somewhere to send them. Called after every successful sign-in
  // (see initAuth/submitLogin), fire-and-forget — it quietly no-ops
  // wherever it can't work (older browser, permission denied, or this
  // school's deploy hasn't set VAPID keys yet) rather than ever blocking
  // login itself.
  // Admin/Principal were added alongside the Approvals Center (see
  // "Approvals Center" further below) — a deletion request or fee-discount
  // request now pushes to them the same way a fee payment pushes to a
  // parent, so "someone needs my approval" reaches them even with the app
  // closed, not just while they happen to have it open for the in-app bell
  // to poll.
  function urlBase64ToUint8Array(base64String){
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
  async function maybeSubscribeToPush(){
    if(!currentUser || !['Student','Parent','Admin','Principal'].includes(currentUser.role)) return;
    if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try{
      const keyRes = await fetch('/api/push/vapid-key');
      if(!keyRes.ok) return; // this school hasn't set up push yet
      const { publicKey } = await keyRes.json();
      if(!publicKey) return;
      if(Notification.permission === 'denied') return;
      const permission = await Notification.requestPermission();
      if(permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if(!sub){
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      }
      await fetch('/api/push/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sub.toJSON()) });
    }catch(e){ /* never let a push-subscription hiccup interrupt login */ }
  }

  async function initAuth(){
    let u = null;
    try{
      const res = await fetch('/api/me');
      if(res.ok) u = await res.json();
    }catch(e){}
    if(u){
      const idx = users.findIndex(x => x.id === u.id);
      if(idx > -1) users[idx] = { ...users[idx], ...u }; else users.push(u);
      currentUser = u;
      moduleAccess = u.moduleAccess || { restricted: false, enabledKeys: [] };
      sessionStorage.setItem('rgv_current_user', u.id);
      await loadAllAppData();
      hideLoginScreen();
      applyRolePermissions();
      initSbSectionsCollapseState();
      updateMyProfileBadge();
      const allowed = getRoleViews(currentUser.role).length ? getRoleViews(currentUser.role) : ['dashboard'];
      switchView(allowed[0]);
      startIdleWatcher();
      maybeSubscribeToPush();
      startApprovalsWatcher();
    }else{
      currentUser = null;
      sessionStorage.removeItem('rgv_current_user');
      showLoginScreen();
    }
  }

  function showLoginScreen(){
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';
  }
  function hideLoginScreen(){
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
  }

  // Verifies a username/password against the server (the only place that can
  // check them now — passwords are hashed and the browser never has a real
  // one to compare against locally). Returns the matching user record
  // (never including a password) on success, or null on any failure —
  // wrong credentials, unreachable server, whatever the reason.
  // Returns the verified user record on success, or null. On failure, also
  // stashes a human-readable reason on verifyLogin.lastError when the server
  // gave one (e.g. a rate-limit message) — callers that want the generic
  // "incorrect username or password" copy can just ignore it.
  async function verifyLogin(username, password, audience){
    verifyLogin.lastError = '';
    verifyLogin.wrongAudience = false;
    verifyLogin.accessSuspended = false;
    try{
      const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username, password, audience }) });
      if(!res.ok){
        try{
          const body = await res.json();
          if(body && body.error) verifyLogin.lastError = body.error;
          if(body && body.wrongAudience) verifyLogin.wrongAudience = true;
          if(body && body.accessSuspended) verifyLogin.accessSuspended = true;
        }catch(e){}
        return null;
      }
      return await res.json();
    }catch(e){ return null; }
  }
  async function submitLogin(e){
    e.preventDefault();
    const uname = document.getElementById('loginUsername').value.trim();
    const pw = document.getElementById('loginPassword').value;
    const u = await verifyLogin(uname, pw, loginAudience);
    if(!u){
      const errEl = document.getElementById('loginError');
      // A suspended-access or wrong-audience message is real, specific
      // guidance the person needs to see verbatim — only the plain "wrong
      // password" case gets the generic copy, so a mistyped password never
      // leaks whether suspension/audience even applies to that account.
      errEl.textContent = (verifyLogin.accessSuspended || verifyLogin.wrongAudience || /too many/i.test(verifyLogin.lastError || ''))
        ? verifyLogin.lastError
        : 'Incorrect username or password.';
      errEl.style.display = 'block';
      return false;
    }
    document.getElementById('loginError').style.display = 'none';
    // Keep this app's in-memory copy of the record in sync with what the
    // server just verified, so anything elsewhere that reads from `users`
    // (e.g. the sessionStorage-based re-login on a page refresh) sees it too.
    const idx = users.findIndex(x => x.id === u.id);
    if(idx > -1) users[idx] = { ...users[idx], ...u }; else users.push(u);
    currentUser = u;
    moduleAccess = u.moduleAccess || { restricted: false, enabledKeys: [] };
    sessionStorage.setItem('rgv_current_user', u.id);
    _sessionExpiredHandled = false;
    // The app's very first data load (at page open, before this login)
    // happened with no session cookie yet, so every module fell back to
    // whatever was cached locally instead of the real server data. Now that
    // /api/login has set a real session cookie, load everything again —
    // this time every request is authenticated and gets the actual data.
    await loadAllAppData();
    hideLoginScreen();
    applyRolePermissions();
    initSbSectionsCollapseState();
    updateMyProfileBadge();
    const allowed = getRoleViews(currentUser.role).length ? getRoleViews(currentUser.role) : ['dashboard'];
    switchView(allowed[0]);
    startIdleWatcher();
    maybeSubscribeToPush();
    startApprovalsWatcher();
    return false;
  }

  function logout(){
    stopIdleWatcher();
    stopApprovalsWatcher();
    currentUser = null;
    sessionStorage.removeItem('rgv_current_user');
    // Best-effort — invalidates the session server-side so the cookie can't
    // be reused even if it were somehow still sitting in the browser. Not
    // awaited: there's nothing useful to do differently if this fails, and
    // the local sign-out above already happened.
    fetch('/api/logout', { method:'POST' }).catch(()=>{});
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    showLoginScreen();
  }

  // ---------- Idle auto-logout ----------
  // Nobody at this school locks their workstation between periods, and this
  // ERP shows fee, payment and student-record data — leaving a signed-in
  // session open on a shared front-office computer is a real exposure, not
  // a hypothetical one. This watches for activity while someone is signed
  // in and signs them out automatically after a stretch of inactivity,
  // with a visible warning (and a countdown) before it actually happens so
  // a person who's just reading the screen isn't cut off without notice.
  // On phones/tablets (see isMobileViewport() below) this is skipped
  // entirely — those are personal devices, so only an explicit Logout
  // signs a mobile session out.
  const IDLE_LIMIT_MS = 5 * 60 * 1000;    // sign out after 5 minutes idle (desktop only)
  const IDLE_WARNING_MS = 60 * 1000;      // warn 60 seconds before that
  let idleLastActivity = Date.now();
  let idleIntervalId = null;
  let idleWarningVisible = false;

  function idleMarkActivity(){
    idleLastActivity = Date.now();
    if(idleWarningVisible) idleHideWarning();
  }

  function isMobileViewport(){
    return window.innerWidth <= 820; // same breakpoint the sidebar/off-canvas nav uses
  }

  function idleTick(){
    if(!currentUser) return; // shouldn't be running, but a safe no-op if it is
    if(isMobileViewport()){
      // Phones/tablets are personal devices, not shared front-office computers —
      // stay signed in until the person taps Logout themselves, rather than
      // getting bounced out mid-scroll on a train or between classes.
      if(idleWarningVisible) idleHideWarning();
      return;
    }
    const idleFor = Date.now() - idleLastActivity;
    if(idleFor >= IDLE_LIMIT_MS){
      idleHideWarning();
      logout();
      showToast('Signed out after a period of inactivity.');
      return;
    }
    if(idleFor >= IDLE_LIMIT_MS - IDLE_WARNING_MS){
      const secondsLeft = Math.max(0, Math.ceil((IDLE_LIMIT_MS - idleFor) / 1000));
      idleShowWarning(secondsLeft);
    }
  }

  function idleShowWarning(secondsLeft){
    idleWarningVisible = true;
    let el = document.getElementById('idleWarningOverlay');
    if(!el){
      el = document.createElement('div');
      el.id = 'idleWarningOverlay';
      el.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999; background:var(--card-bg,#fff); color:var(--text,#1a1a1a); border:1px solid var(--border,#ddd); border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,0.22); padding:16px 18px; max-width:300px; font-size:0.88rem;';
      el.innerHTML = '<div style="font-weight:600; margin-bottom:6px;">Still there?</div>'
        + '<div id="idleWarningText" style="margin-bottom:12px; opacity:0.85;"></div>'
        + '<div style="display:flex; gap:8px;">'
        + '<button type="button" class="btn btn-primary" style="flex:1; justify-content:center;" onclick="idleMarkActivity()">Stay signed in</button>'
        + '<button type="button" class="btn btn-ghost" style="flex:1; justify-content:center;" onclick="logout()">Sign out</button>'
        + '</div>';
      document.body.appendChild(el);
    }
    el.style.display = 'block';
    document.getElementById('idleWarningText').textContent =
      'You will be signed out in ' + secondsLeft + ' second' + (secondsLeft === 1 ? '' : 's') + ' due to inactivity.';
  }

  function idleHideWarning(){
    idleWarningVisible = false;
    const el = document.getElementById('idleWarningOverlay');
    if(el) el.style.display = 'none';
  }

  function startIdleWatcher(){
    if(idleIntervalId) return; // already running
    idleLastActivity = Date.now();
    ['mousemove','mousedown','keydown','scroll','touchstart','click'].forEach(evt =>
      document.addEventListener(evt, idleMarkActivity, { passive: true })
    );
    idleIntervalId = setInterval(idleTick, 1000);
  }

  function stopIdleWatcher(){
    if(!idleIntervalId) return;
    clearInterval(idleIntervalId);
    idleIntervalId = null;
    idleHideWarning();
    ['mousemove','mousedown','keydown','scroll','touchstart','click'].forEach(evt =>
      document.removeEventListener(evt, idleMarkActivity)
    );
  }

  function applyRolePermissions(){
    const allowed = getRoleViews(currentUser.role);
    document.getElementById('navDashboard').style.display = allowed.includes('dashboard') ? 'flex' : 'none';
    document.getElementById('navAdmissions').style.display = allowed.includes('admissions') ? 'flex' : 'none';
    document.getElementById('navManageFee').style.display = (allowed.includes('managefee') && isModuleEnabledByPlan('managefee')) ? 'flex' : 'none';
    document.getElementById('navAttendance').style.display = (allowed.includes('attendance') && isModuleEnabledByPlan('attendance')) ? 'flex' : 'none';
    document.getElementById('navExams').style.display = (allowed.includes('exams') && isModuleEnabledByPlan('exams')) ? 'flex' : 'none';
    document.getElementById('navSubjects').style.display = allowed.includes('subjects') ? 'flex' : 'none';
    document.getElementById('navResult').style.display = (allowed.includes('result') && isModuleEnabledByPlan('result')) ? 'flex' : 'none';
    document.getElementById('navPromoTransfer').style.display = allowed.includes('promotransfer') ? 'flex' : 'none';
    document.getElementById('navReports').style.display = allowed.includes('reports') ? 'flex' : 'none';
    const staffFullAccess = getRolePermission(currentUser.role, 'staff', 'view');
    document.getElementById('navStaffDirectory').style.display = staffFullAccess ? 'flex' : 'none';
    document.getElementById('navStaffDepts').style.display = getStaffSubpageAccess(currentUser.role, 'staff_depts') ? 'flex' : 'none';
    document.getElementById('navStaffIdcards').style.display = getStaffSubpageAccess(currentUser.role, 'staff_idcards') ? 'flex' : 'none';
    document.getElementById('navStaffPayroll').style.display = getStaffSubpageAccess(currentUser.role, 'staff_payroll') ? 'flex' : 'none';
    document.getElementById('navStaffAttendance').style.display = getStaffAttendanceAccess(currentUser.role) ? 'flex' : 'none';
    document.getElementById('navStaffReports').style.display = getStaffReportsAccess(currentUser.role) ? 'flex' : 'none';
    document.getElementById('navStaffActivity').style.display = getStaffActivityAccess(currentUser.role) ? 'flex' : 'none';
    document.getElementById('navSchoolProfile').style.display = getSetupTabAccess(currentUser.role, 'setup_schoolprofile') ? 'flex' : 'none';
    document.getElementById('navClassesSetup').style.display = getSetupTabAccess(currentUser.role, 'setup_classes') ? 'flex' : 'none';
    document.getElementById('navAcademicYear').style.display = getSetupTabAccess(currentUser.role, 'setup_academicyear') ? 'flex' : 'none';
    document.getElementById('navFeeStructureSetup').style.display = getSetupTabAccess(currentUser.role, 'setup_feestructure') ? 'flex' : 'none';
    document.getElementById('navPromotions').style.display = getSetupTabAccess(currentUser.role, 'setup_promotions') ? 'flex' : 'none';
    document.getElementById('navUsersRoles').style.display = currentUser.role === 'Admin' ? 'flex' : 'none';
    document.getElementById('navStudentParentLogins').style.display = currentUser.role === 'Admin' ? 'flex' : 'none';
    document.getElementById('navRolesPermissions').style.display = currentUser.role === 'Admin' ? 'flex' : 'none';
    document.getElementById('navAdminTools2').style.display = currentUser.role === 'Admin' ? 'flex' : 'none';
    { const b = document.getElementById('applyLeaveBtn'); if(b) b.style.display = !['Student','Parent'].includes(currentUser.role) ? 'flex' : 'none'; }
    document.getElementById('navInventory').style.display = allowed.includes('inventory') ? 'flex' : 'none';
    document.getElementById('navTimetable').style.display = allowed.includes('timetable') ? 'flex' : 'none';
    document.getElementById('navSyllabus').style.display = allowed.includes('syllabus') ? 'flex' : 'none';
    document.getElementById('navTransport').style.display = (allowed.includes('transport') && isModuleEnabledByPlan('transport')) ? 'flex' : 'none';
    document.getElementById('navLibrary').style.display = (allowed.includes('library') && isModuleEnabledByPlan('library')) ? 'flex' : 'none';
    document.getElementById('navHostel').style.display = allowed.includes('hostel') ? 'flex' : 'none';
    document.getElementById('navAccounting').style.display = allowed.includes('accounting') ? 'flex' : 'none';
    document.getElementById('navAnnouncements').style.display = allowed.includes('announcements') ? 'flex' : 'none';
    document.getElementById('navInbox').style.display = allowed.includes('inbox') ? 'flex' : 'none';
    document.getElementById('navNoticeBoard').style.display = allowed.includes('noticeboard') ? 'flex' : 'none';
    document.getElementById('navWebsiteInquiries').style.display = allowed.includes('websiteinquiries') ? 'flex' : 'none';
    document.getElementById('navWebsiteGallery').style.display = allowed.includes('websitegallery') ? 'flex' : 'none';
    document.getElementById('navContactVendor').style.display = allowed.includes('contactvendor') ? 'flex' : 'none';
    document.getElementById('navMyProfile').style.display = allowed.includes('myprofile') ? 'flex' : 'none';
    document.getElementById('sbUserName').textContent = currentUser.name;
    document.getElementById('sbUserRole').textContent = currentUser.role;
    updateSidebarAvatar();
    applyButtonLevelPermissions();
    updateSbSectionVisibility();
  }
  // Gates the handful of "+ Add / Import / Export" buttons that live in a
  // view's static header (so they're not re-rendered per navigation the way
  // a table's per-row Edit/Delete buttons are) — those get hidden here once,
  // right alongside the sidebar links, using the exact same permission
  // checks. Per-row buttons inside dynamically-rendered tables are instead
  // gated inline, at the point each row's HTML is built.
  function applyButtonLevelPermissions(){
    const setBtn = (id, allowed) => { const el = document.getElementById(id); if(el) el.style.display = allowed ? '' : 'none'; };
    setBtn('btnAddStudent', canDo('admissions','create'));
    setBtn('btnImportStudents', canDo('admissions','create'));
    setBtn('btnExportStudentsExcel', canDo('admissions','print'));
    setBtn('btnExportStudentsPDF', canDo('admissions','print'));
    setBtn('btnAddStaff', canDo('staff','create'));
    setBtn('btnImportStaff', canDo('staff','create'));
  }
  function updateSidebarAvatar(){
    const el = document.getElementById('sbUserAvatar');
    if(!el) return;
    const u = users.find(x => x.username === currentUser.username);
    const photo = u ? u.photo : '';
    if(photo){
      el.innerHTML = `<img src="${photo}" style="width:100%; height:100%; object-fit:cover;">`;
    }else{
      const initialsText = (currentUser.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
      el.textContent = initialsText || '?';
    }
  }

  /* ===== VIEW SWITCHING ===== */
  