function switchView(view){
    // Safety net: if a teacher was mid-way through Marks Entry and clicks
    // straight to another sidebar item (skipping "Save Marks" and the
    // in-sheet "All Classes" back-link), flush any pending auto-save first
    // so the last few keystrokes aren't lost. Fire-and-forget is fine — the
    // save completes in the background even as the view switches.
    if(typeof examMarksView !== 'undefined' && examMarksView === 'sheet' && typeof flushMarksAutoSaveIfPending === 'function'){
      flushMarksAutoSaveIfPending();
    }
    // Legacy alias: the old single "Manage Staff" page is now 6 separate sidebar pages.
    // Anything still asking for the bare 'staff' view lands on the best one it can access.
    if(view === 'staff'){
      view = getRolePermission(currentUser.role, 'staff', 'view') ? 'staffdirectory'
        : getStaffAttendanceAccess(currentUser.role) ? 'staffattendance'
        : getStaffReportsAccess(currentUser.role) ? 'staffreports'
        : 'staffdirectory';
    }
    const allowed = getRoleViews(currentUser.role);
    const setupPages = ['schoolprofile','classessetup','academicyear','feestructuresetup','promotions'];
    const adminOnlyPages = ['usersroles','studentparentlogins','rolespermissions','admintools2'];
    const universalPages = ['myaccount'];
    let permitted;
    if(universalPages.includes(view)) permitted = true;
    else if(setupPages.includes(view)) permitted = allowed.includes('setup');
    else if(adminOnlyPages.includes(view)) permitted = currentUser.role === 'Admin';
    else if(STAFF_SUBVIEWS[view]){
      const stab = STAFF_SUBVIEWS[view];
      if(stab === 'attendance') permitted = getStaffAttendanceAccess(currentUser.role);
      else if(stab === 'reports') permitted = getStaffReportsAccess(currentUser.role);
      else if(stab === 'activity') permitted = getStaffActivityAccess(currentUser.role);
      else permitted = getRolePermission(currentUser.role, 'staff', 'view');
    }
    else permitted = allowed.includes(view);
    if(!permitted){
      showToast('You do not have access to that section.');
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    closeMobileSidebar();
    expandSbSectionFor(view);
    document.getElementById('view-dashboard').style.display = view === 'dashboard' ? 'block' : 'none';
    document.getElementById('view-admissions').style.display = view === 'admissions' ? 'block' : 'none';
    document.getElementById('view-managefee').style.display = view === 'managefee' ? 'block' : 'none';
    document.getElementById('view-attendance').style.display = view === 'attendance' ? 'block' : 'none';
    document.getElementById('view-exams').style.display = view === 'exams' ? 'block' : 'none';
    document.getElementById('view-subjects').style.display = view === 'subjects' ? 'block' : 'none';
    document.getElementById('view-result').style.display = view === 'result' ? 'block' : 'none';
    document.getElementById('view-promotransfer').style.display = view === 'promotransfer' ? 'block' : 'none';
    document.getElementById('view-reports').style.display = view === 'reports' ? 'block' : 'none';
    document.getElementById('view-staff').style.display = STAFF_SUBVIEWS[view] ? 'block' : 'none';
    document.getElementById('view-schoolprofile').style.display = view === 'schoolprofile' ? 'block' : 'none';
    document.getElementById('view-classessetup').style.display = view === 'classessetup' ? 'block' : 'none';
    document.getElementById('view-academicyear').style.display = view === 'academicyear' ? 'block' : 'none';
    document.getElementById('view-feestructuresetup').style.display = view === 'feestructuresetup' ? 'block' : 'none';
    document.getElementById('view-promotions').style.display = view === 'promotions' ? 'block' : 'none';
    document.getElementById('view-usersroles').style.display = view === 'usersroles' ? 'block' : 'none';
    document.getElementById('view-studentparentlogins').style.display = view === 'studentparentlogins' ? 'block' : 'none';
    document.getElementById('view-rolespermissions').style.display = view === 'rolespermissions' ? 'block' : 'none';
    document.getElementById('view-admintools2').style.display = view === 'admintools2' ? 'block' : 'none';
    document.getElementById('view-inventory').style.display = view === 'inventory' ? 'block' : 'none';
    document.getElementById('view-timetable').style.display = view === 'timetable' ? 'block' : 'none';
    document.getElementById('view-syllabus').style.display = view === 'syllabus' ? 'block' : 'none';
    document.getElementById('view-transport').style.display = view === 'transport' ? 'block' : 'none';
    document.getElementById('view-library').style.display = view === 'library' ? 'block' : 'none';
    document.getElementById('view-hostel').style.display = view === 'hostel' ? 'block' : 'none';
    document.getElementById('view-accounting').style.display = view === 'accounting' ? 'block' : 'none';
    document.getElementById('view-announcements').style.display = view === 'announcements' ? 'block' : 'none';
    document.getElementById('view-inbox').style.display = view === 'inbox' ? 'block' : 'none';
    document.getElementById('view-noticeboard').style.display = view === 'noticeboard' ? 'block' : 'none';
    document.getElementById('view-websiteinquiries').style.display = view === 'websiteinquiries' ? 'block' : 'none';
    document.getElementById('view-websitegallery').style.display = view === 'websitegallery' ? 'block' : 'none';
    document.getElementById('view-contactvendor').style.display = view === 'contactvendor' ? 'block' : 'none';
    document.getElementById('view-myaccount').style.display = view === 'myaccount' ? 'block' : 'none';
    document.getElementById('view-myprofile').style.display = view === 'myprofile' ? 'block' : 'none';
    document.getElementById('navDashboard').classList.toggle('active', view === 'dashboard');
    document.getElementById('navAdmissions').classList.toggle('active', view === 'admissions');
    document.getElementById('navManageFee').classList.toggle('active', view === 'managefee');
    document.getElementById('navAttendance').classList.toggle('active', view === 'attendance');
    document.getElementById('navExams').classList.toggle('active', view === 'exams');
    document.getElementById('navSubjects').classList.toggle('active', view === 'subjects');
    document.getElementById('navResult').classList.toggle('active', view === 'result');
    document.getElementById('navPromoTransfer').classList.toggle('active', view === 'promotransfer');
    document.getElementById('navReports').classList.toggle('active', view === 'reports');
    document.getElementById('navStaffDirectory').classList.toggle('active', view === 'staffdirectory');
    document.getElementById('navStaffDepts').classList.toggle('active', view === 'staffdepts');
    document.getElementById('navStaffIdcards').classList.toggle('active', view === 'staffidcards');
    document.getElementById('navStaffPayroll').classList.toggle('active', view === 'staffpayroll');
    document.getElementById('navStaffAttendance').classList.toggle('active', view === 'staffattendance');
    document.getElementById('navStaffReports').classList.toggle('active', view === 'staffreports');
    document.getElementById('navStaffActivity').classList.toggle('active', view === 'staffactivity');
    document.getElementById('navSchoolProfile').classList.toggle('active', view === 'schoolprofile');
    document.getElementById('navClassesSetup').classList.toggle('active', view === 'classessetup');
    document.getElementById('navAcademicYear').classList.toggle('active', view === 'academicyear');
    document.getElementById('navFeeStructureSetup').classList.toggle('active', view === 'feestructuresetup');
    document.getElementById('navPromotions').classList.toggle('active', view === 'promotions');
    document.getElementById('navUsersRoles').classList.toggle('active', view === 'usersroles');
    document.getElementById('navStudentParentLogins').classList.toggle('active', view === 'studentparentlogins');
    document.getElementById('navRolesPermissions').classList.toggle('active', view === 'rolespermissions');
    document.getElementById('navAdminTools2').classList.toggle('active', view === 'admintools2');
    document.getElementById('navInventory').classList.toggle('active', view === 'inventory');
    document.getElementById('navTimetable').classList.toggle('active', view === 'timetable');
    document.getElementById('navSyllabus').classList.toggle('active', view === 'syllabus');
    document.getElementById('navTransport').classList.toggle('active', view === 'transport');
    document.getElementById('navLibrary').classList.toggle('active', view === 'library');
    document.getElementById('navHostel').classList.toggle('active', view === 'hostel');
    document.getElementById('navAccounting').classList.toggle('active', view === 'accounting');
    document.getElementById('navAnnouncements').classList.toggle('active', view === 'announcements');
    document.getElementById('navInbox').classList.toggle('active', view === 'inbox');
    document.getElementById('navNoticeBoard').classList.toggle('active', view === 'noticeboard');
    document.getElementById('navWebsiteInquiries').classList.toggle('active', view === 'websiteinquiries');
    document.getElementById('navWebsiteGallery').classList.toggle('active', view === 'websitegallery');
    document.getElementById('navContactVendor').classList.toggle('active', view === 'contactvendor');
    document.getElementById('navMyProfile').classList.toggle('active', view === 'myprofile');
    if(view === 'dashboard') renderDashboard();
    if(view === 'admissions'){ admissionsView = 'grid'; renderAdmissionsBody(); }
    if(view === 'managefee'){ initManageFeeView(); }
    if(view === 'attendance'){ initAttendanceView(); }
    if(view === 'exams'){ initExamsView(); }
    if(view === 'subjects'){ initSubjectsView(); }
    if(view === 'result'){ initResultView(); }
    if(view === 'promotransfer'){ initPromoTransferView(); }
    if(view === 'reports'){ initReportsView(); }
    if(STAFF_SUBVIEWS[view]){ initStaffView(STAFF_SUBVIEWS[view]); }
    if(view === 'schoolprofile'){ initSchoolProfilePage(); }
    if(view === 'classessetup'){ initClassesSetupPage(); }
    if(view === 'academicyear'){ initAcademicYearPage(); }
    if(view === 'feestructuresetup'){ initFeeStructureSetupPage(); }
    if(view === 'promotions'){ initPromotionsPage(); }
    if(view === 'usersroles'){ initUsersRolesPage(); }
    if(view === 'studentparentlogins'){ initStudentParentLoginsPage(); }
    if(view === 'rolespermissions'){ initRolesPermissionsPage(); }
    if(view === 'admintools2'){ initAdminTools2Page(); }
    if(view === 'inventory'){ initInventoryView(); }
    if(view === 'timetable'){ initTimetableView(); }
    if(view === 'syllabus'){ initSyllabusView(); }
    if(view === 'transport'){ initTransportView(); }
    if(view === 'library'){ initLibraryView(); }
    if(view === 'hostel'){ initHostelView(); }
    if(view === 'accounting'){ initAccountingView(); }
    if(view === 'announcements'){ initCommsView(); }
    if(view === 'inbox'){ initInboxView(); }
    if(view === 'noticeboard'){ initNoticeBoardView(); }
    if(view === 'websiteinquiries'){ initWebsiteInquiriesView(); }
    if(view === 'websitegallery'){ initWebsiteGalleryView(); }
    if(view === 'contactvendor'){ resetContactVendorForm(); }
    if(view === 'myaccount'){ initMyAccountView(); }
    if(view === 'myprofile'){ switchMyProfileTab(myProfileTab); }
  }

  /* ===== FINANCE DATA LAYER ===== */
  