const WIZARD_TABS = ['new','parent','previous','transport'];

  function switchWizardTab(tab){
    WIZARD_TABS.forEach(t => {
      document.getElementById('panel-'+t).style.display = t===tab ? 'block' : 'none';
      document.getElementById('wtab-'+t).classList.toggle('active', t===tab);
    });
    const idx = WIZARD_TABS.indexOf(tab);
    document.getElementById('wizardBackBtn').style.display = idx > 0 ? 'inline-flex' : 'none';
    const isLast = idx === WIZARD_TABS.length - 1;
    document.getElementById('wizardNextBtn').style.display = isLast ? 'none' : 'inline-flex';
    document.getElementById('wizardSaveBtn').style.display = isLast ? 'inline-flex' : 'none';
  }

  function currentWizardTab(){
    return WIZARD_TABS.find(t => document.getElementById('wtab-'+t).classList.contains('active')) || 'new';
  }

  function wizardStep(dir){
    const idx = WIZARD_TABS.indexOf(currentWizardTab());
    const next = idx + dir;
    if(next < 0 || next >= WIZARD_TABS.length) return;
    switchWizardTab(WIZARD_TABS[next]);
  }

  function previewPhoto(e){
    readImageFileWithSizeLimit(e, dataUrl => {
      wizardPhotoData = dataUrl;
      document.getElementById('photoPreview').src = wizardPhotoData;
      document.getElementById('photoPreview').style.display = 'block';
      document.getElementById('photoPlaceholder').style.display = 'none';
    });
  }

  // The sibling picker used to be one giant <select> listing every enrolled
  // student ("Select a student already enrolled") — fine at first, unusable
  // once the school had hundreds of students on file. Replaced with a live
  // search: type a couple of letters, matches rank surname hits first (a
  // sibling search is almost always "same surname"), then first-name hits,
  // then any other match, with an optional class/section narrow-down for
  // when you already know where the sibling studies.
  let wizardSiblingExcludeId = '';
  function populateSiblingSelect(excludeId){
    wizardSiblingExcludeId = excludeId || '';
    const classSel = document.getElementById('fSiblingClassFilter');
    const secSel = document.getElementById('fSiblingSectionFilter');
    if(classSel) classSel.innerHTML = '<option value="">Any class</option>' + CLASS_LEVELS.map(c => `<option>${c}</option>`).join('');
    if(secSel) secSel.innerHTML = '<option value="">Any section</option>' + SECTIONS.map(s => `<option>${s}</option>`).join('');
    const searchEl = document.getElementById('fSiblingSearch');
    if(searchEl) searchEl.value = '';
    renderSiblingSearchResults();
  }

  function siblingSearchRank(s, q){
    const first = (s.firstName||'').trim().toLowerCase();
    const last = (s.lastName||'').trim().toLowerCase();
    if(last.startsWith(q)) return 0;   // surname match — ranked first, as asked
    if(first.startsWith(q)) return 1;  // first-name match
    if(last.includes(q) || first.includes(q)) return 2; // matches mid-word
    return -1; // no match at all
  }
  function highlightMatch(name, q){
    if(!q) return escapeHtml(name);
    const idx = name.toLowerCase().indexOf(q);
    if(idx === -1) return escapeHtml(name);
    return escapeHtml(name.slice(0,idx)) + '<mark>' + escapeHtml(name.slice(idx, idx+q.length)) + '</mark>' + escapeHtml(name.slice(idx+q.length));
  }
  function renderSiblingSearchResults(){
    const box = document.getElementById('siblingSearchResults');
    if(!box) return;
    const q = (document.getElementById('fSiblingSearch').value || '').trim().toLowerCase();
    const classFilter = document.getElementById('fSiblingClassFilter').value;
    const sectionFilter = document.getElementById('fSiblingSectionFilter').value;
    if(q.length < 2){
      box.innerHTML = q.length ? `<div class="sibling-result-empty">Keep typing — at least 2 letters.</div>` : '';
      return;
    }
    const matches = students
      .filter(s => s.id !== wizardSiblingExcludeId && !wizardSiblings.includes(s.id) && !wizardInheritedSiblingIds.includes(s.id))
      .filter(s => !classFilter || s.className === classFilter)
      .filter(s => !sectionFilter || s.section === sectionFilter)
      .map(s => ({ s, rank: siblingSearchRank(s, q) }))
      .filter(x => x.rank !== -1)
      .sort((a,b) => a.rank - b.rank || (a.s.firstName||'').localeCompare(b.s.firstName||''))
      .slice(0, 25);
    if(!matches.length){
      box.innerHTML = `<div class="sibling-result-empty">No enrolled student matches "${escapeHtml(q)}"${classFilter||sectionFilter ? ' in that class/section' : ''}.</div>`;
      return;
    }
    const rankLabel = ['Surname match','Name match','Match'];
    box.innerHTML = matches.map(({s, rank}) => `
      <div class="sibling-result-row" onclick="addSiblingFromSearch('${s.id}')">
        <div>
          <div class="sibling-result-name">${highlightMatch(s.firstName||'', q)} <b>${highlightMatch(s.lastName||'', q)}</b></div>
          <div class="sibling-result-meta">${s.className||'—'} — Section ${s.section||'—'} · Admission No: ${s.admissionNo||'—'}</div>
        </div>
        <span class="sibling-result-match">${rankLabel[rank]}</span>
      </div>
    `).join('');
  }

  function renderSiblingList(){
    const el = document.getElementById('siblingList');
    el.innerHTML = wizardSiblings.map(id => {
      const s = students.find(x => x.id === id);
      if(!s) return '';
      return `<span class="sibling-chip">${s.firstName} ${s.lastName}<button type="button" onclick="removeSibling('${id}')">&times;</button></span>`;
    }).join('');

    const inheritedWrap = document.getElementById('siblingInheritedWrap');
    const inheritedEl = document.getElementById('siblingInheritedList');
    if(inheritedWrap && inheritedEl){
      const names = wizardInheritedSiblingIds.map(id => {
        const s = students.find(x => x.id === id);
        return s ? `${s.firstName} ${s.lastName} (${s.className||'—'}${s.section?' — '+s.section:''})` : null;
      }).filter(Boolean);
      inheritedWrap.style.display = names.length ? 'block' : 'none';
      inheritedEl.innerHTML = names.map(n => `<span class="sibling-chip" style="opacity:0.75; cursor:default;">${n}</span>`).join('');
    }
  }

  function addSiblingFromSearch(id){
    if(!id || wizardSiblings.includes(id)) return;
    wizardSiblings.push(id);
    renderSiblingList();
    document.getElementById('fSiblingSearch').value = '';
    renderSiblingSearchResults();
  }

  function removeSibling(id){
    wizardSiblings = wizardSiblings.filter(x => x !== id);
    renderSiblingList();
    renderSiblingSearchResults();
  }

  function populateWizardRouteOptions(){
    const sel = document.getElementById('fRoute');
    if(!sel) return;
    sel.innerHTML = '<option value="">Select route</option>' + transportRoutes.map(r => `<option value="${r.id}">${r.name}${r.busNumber?' — '+r.busNumber:''}</option>`).join('');
  }
  function onWizardRouteChange(){
    const routeId = document.getElementById('fRoute').value;
    const route = transportRoutes.find(r => r.id === routeId);
    const stopSel = document.getElementById('fStop');
    const fareInfo = document.getElementById('fRouteFareInfo');
    if(!route){
      stopSel.innerHTML = '<option value="">Select route first</option>';
      if(fareInfo) fareInfo.textContent = '';
      return;
    }
    stopSel.innerHTML = '<option value="">Select stop</option>' + route.stops.map(s => `<option value="${s.id}">${s.name} — ${fmtMoney(s.fare)}</option>`).join('');
    if(fareInfo) fareInfo.textContent = route.driverName ? `Driver: ${route.driverName}${route.driverPhone?' ('+route.driverPhone+')':''}` : '';
  }
  function resetWizardForm(){
    document.getElementById('wizardForm').reset();
    document.getElementById('fClass').innerHTML = '<option value="" disabled selected>Select class</option>' + CLASS_LEVELS.map(c => `<option>${c}</option>`).join('');
    document.getElementById('fSection').innerHTML = '<option value="" disabled selected>Select section</option>' + SECTIONS.map(s => `<option>${s}</option>`).join('');
    document.getElementById('editId').value = '';
    wizardSiblings = [];
    wizardInheritedSiblingIds = [];
    wizardPhotoData = '';
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoPlaceholder').style.display = 'block';
    document.getElementById('guardianFields').style.display = 'none';
    document.getElementById('prevSchoolFields').style.display = 'none';
    document.getElementById('transportFields').style.display = 'none';
    populateWizardRouteOptions();
    document.getElementById('fNationalityOther').style.display = 'none';
    document.getElementById('admissionFeeNote').style.display = 'none';
    renderSiblingList();
    switchWizardTab('new');
  }

  function openWizard(){
    resetWizardForm();
    document.getElementById('wizardTitle').textContent = 'Add Student';
    document.getElementById('wizardSaveBtn').textContent = 'Save Student';
    populateSiblingSelect('');
    if(currentClass) document.getElementById('fClass').value = currentClass;
    refreshFSectionOptions();
    if(currentSection) document.getElementById('fSection').value = currentSection;
    document.getElementById('wizardOverlay').classList.add('open');
  }

  function closeWizard(){
    document.getElementById('wizardOverlay').classList.remove('open');
  }

  function editStudent(id){
    const s = students.find(x => x.id === id);
    if(!s) return;
    resetWizardForm();
    populateSiblingSelect(s.id);
    document.getElementById('wizardTitle').textContent = 'Edit Student';
    document.getElementById('wizardSaveBtn').textContent = 'Save Changes';
    document.getElementById('editId').value = s.id;

    document.getElementById('fFirstName').value = s.firstName || '';
    document.getElementById('fLastName').value = s.lastName || '';
    document.getElementById('fClass').value = s.className || '';
    refreshFSectionOptions();
    document.getElementById('fSection').value = s.section || '';
    document.getElementById('fRollNo').value = s.rollNo || '';
    document.getElementById('fNewAdmission').checked = !!s.isNewAdmission;
    document.getElementById('fRteStudent').checked = !!s.isRTE;
    document.getElementById('fGender').value = s.gender || '';
    document.getElementById('fDob').value = s.dob || '';
    document.getElementById('fEmail').value = s.email || '';
    document.getElementById('fPassword').value = s.password || '';
    document.getElementById('fAdmDate').value = s.admDate || '';
    document.getElementById('fBlood').value = s.blood || '';
    document.getElementById('fMotherTongue').value = s.motherTongue || '';
    document.getElementById('fBirthPlace').value = s.birthPlace || '';
    document.getElementById('fPen').value = s.pen || '';
    document.getElementById('fAadhar').value = s.aadhar || '';
    document.getElementById('fCaste').value = s.caste || '';
    document.getElementById('fCasteName').value = s.casteName || '';
    document.getElementById('fReligion').value = s.religion || '';
    document.getElementById('fCategory').value = s.category || '';
    document.getElementById('fNationality').value = s.nationality === 'Indian' || !s.nationality ? 'Indian' : 'Other';
    if(document.getElementById('fNationality').value === 'Other'){
      document.getElementById('fNationalityOther').style.display = 'block';
      document.getElementById('fNationalityText').value = s.nationality || '';
    }
    document.getElementById('fStatus').value = s.status || 'Active';
    if(s.photo){
      wizardPhotoData = s.photo;
      document.getElementById('photoPreview').src = s.photo;
      document.getElementById('photoPreview').style.display = 'block';
      document.getElementById('photoPlaceholder').style.display = 'none';
    }

    document.getElementById('fFatherName').value = s.fatherName || '';
    document.getElementById('fFatherPhone').value = s.fatherPhone || '';
    document.getElementById('fFatherAadhar').value = s.fatherAadhar || '';
    document.getElementById('fFatherOccupation').value = s.fatherOccupation || '';
    document.getElementById('fFatherIncome').value = s.fatherIncome || '';
    document.getElementById('fFatherAddress').value = s.fatherAddress || '';
    document.getElementById('fMotherName').value = s.motherName || '';
    document.getElementById('fMotherPhone').value = s.motherPhone || '';
    document.getElementById('fMotherAadhar').value = s.motherAadhar || '';
    document.getElementById('fMotherOccupation').value = s.motherOccupation || '';
    document.getElementById('fMotherIncome').value = s.motherIncome || '';
    document.getElementById('fMotherAddress').value = s.motherAddress || '';
    document.getElementById('fGuardianApplicable').checked = !!s.guardianApplicable;
    document.getElementById('guardianFields').style.display = s.guardianApplicable ? 'grid' : 'none';
    document.getElementById('fGuardianName').value = s.guardianName || '';
    document.getElementById('fGuardianRelation').value = s.guardianRelation || '';
    document.getElementById('fGuardianPhone').value = s.guardianPhone || '';
    document.getElementById('fGuardianAddress').value = s.guardianAddress || '';

    document.getElementById('fAttendedPrevious').value = s.attendedPrevious || 'No';
    document.getElementById('prevSchoolFields').style.display = s.attendedPrevious === 'Yes' ? 'grid' : 'none';
    document.getElementById('fPrevSchoolName').value = s.prevSchoolName || '';
    document.getElementById('fPrevSchoolAddress').value = s.prevSchoolAddress || '';
    document.getElementById('fPrevClass').value = s.prevClass || '';
    document.getElementById('fPrevYear').value = s.prevYear || '';
    wizardSiblings = (s.siblingIds || []).slice();
    // Every other member of this student's whole connected sibling group
    // (see getFamilyIds) that isn't already directly listed on this
    // record — covers not just a direct reverse link, but also a sibling
    // who's only reachable by following the group onward through a THIRD
    // student's record (a 3+-way family stored star-fashion on just one
    // member). Shown read-only below the editable list so staff can see
    // every link already exists without re-adding any of them from this
    // side too.
    wizardInheritedSiblingIds = getFamilyIds(s).filter(id => id !== s.id && !wizardSiblings.includes(id));
    renderSiblingList();

    document.getElementById('fNeedsTransport').value = s.needsTransport || 'No';
    document.getElementById('transportFields').style.display = s.needsTransport === 'Yes' ? 'grid' : 'none';
    populateWizardRouteOptions();
    document.getElementById('fRoute').value = s.transportRouteId || '';
    onWizardRouteChange();
    document.getElementById('fStop').value = s.transportStopId || '';

    document.getElementById('wizardOverlay').classList.add('open');
  }

  // A child leaving or pausing is a status change, never a deletion — this
  // is the one-click toggle for that. It never touches deleted_at, never
  // goes through the deletion-request flow, and is fully reversible on its
  // own: the record, its fee history, and its Transfer Certificate data all
  // stay exactly where they are, active or not.
  async function toggleStudentActive(id){
    const s = students.find(x => x.id === id);
    if(!s) return;
    const goingInactive = isActive(s);
    const msg = goingInactive
      ? `Mark ${s.firstName} ${s.lastName} as Inactive? They'll drop out of the current class/section strength and stop accruing new fee dues until reactivated — their record, fee history, and certificate details are all kept exactly as they are.`
      : `Mark ${s.firstName} ${s.lastName} as Active again? They'll count toward the current strength and fee dues will resume from today.`;
    if(!await showConfirmDialog(msg)) return;
    s.status = goingInactive ? 'Inactive' : 'Active';
    await persist();
    renderDashboard();
    renderAdmissionsBody();
    showToast(goingInactive ? 'Marked Inactive.' : 'Marked Active.');
  }

  // Deletion is for genuine mistakes (duplicates, bad entries) — never how
  // a departing student is meant to be handled (use toggleStudentActive
  // above for that). This never deletes anything itself: it's step 1 of the
  // 3-step deletion flow (request -> confirm -> final typed confirm) — see
  // handleDeletionRequests in server.js. All 3 steps can be done by the
  // same Admin/Principal, or split across a second one if the school has
  // one; only the final, typed-confirmation step actually soft-deletes.
  async function requestDeleteStudent(id){
    const s = students.find(x => x.id === id);
    if(!s) return;
    const reason = prompt(`Why should ${s.firstName} ${s.lastName}'s record be deleted?\n\nIf this child has simply left the school, use "Mark Inactive" instead — that keeps their data for Transfer Certificates. Deletion is only for genuine mistakes, like a duplicate entry.`);
    if(reason === null) return;
    if(!reason.trim()){ showToast('A reason is required.'); return; }
    if(!await showConfirmDialog(`Start a 3-step deletion request for this record? This is step 1 of 3 — nothing is deleted yet.`)) return;
    try{
      await throwIfNotOk(await fetch('/api/deletion-requests', { method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify({ resource:'students', recordId:id, reason:reason.trim() }) }));
      showToast('Step 1 of 3 recorded — open Pending Deletion Requests to continue.', 'burst');
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast('Could not send the deletion request (' + e.message + ').');
    }
  }

  function refreshFSectionOptions(){
    const cls = document.getElementById('fClass').value;
    const opts = cls ? sectionsForClass(cls) : SECTIONS;
    const sectionSel = document.getElementById('fSection');
    const prevVal = sectionSel.value;
    sectionSel.innerHTML = '<option value="" disabled ' + (prevVal?'':'selected') + '>Select section</option>' + opts.map(s => `<option ${s===prevVal?'selected':''}>${s}</option>`).join('');
  }
  function onNewAdmissionToggle(){
    const checked = document.getElementById('fNewAdmission').checked;
    const note = document.getElementById('admissionFeeNote');
    if(!checked){ note.style.display = 'none'; return; }
    const cls = document.getElementById('fClass').value;
    const amount = cls ? (Number(classStruct(cls).admission)||0) : 0;
    if(cls && amount > 0){
      note.textContent = `An Admission Fee of ${fmtMoney(amount)} (set for ${cls}) will be assigned to this student automatically once saved.`;
    }else if(cls){
      note.textContent = `No Admission Fee is configured for ${cls} yet — set one in Manage Fee → Fee Structure if this class should charge one.`;
    }else{
      note.textContent = `Select a class above to see its Admission Fee.`;
    }
    note.style.display = 'block';
  }

  function findPossibleDuplicate(firstName, lastName, className, section, excludeId){
    const fn = (firstName||'').trim().toLowerCase();
    const ln = (lastName||'').trim().toLowerCase();
    if(!fn || !ln) return null;
    return students.find(s =>
      s.id !== excludeId &&
      (s.firstName||'').trim().toLowerCase() === fn &&
      (s.lastName||'').trim().toLowerCase() === ln &&
      s.className === className && s.section === section
    ) || null;
  }

  async function saveWizard(e){
    e.preventDefault();
    // Needed before the Bus Fee orphan-guard below (reads `payments`) runs —
    // must see the real payment history, not an unloaded empty array.
    await ensureDataLoaded('payments', loadPaymentsData);
    const editId = document.getElementById('editId').value;
    const g = id => document.getElementById(id).value;

    const wizardMobileChecks = [
      ['fFatherPhone', "Father's Phone Number"],
      ['fMotherPhone', "Mother's Phone Number"],
      ['fGuardianPhone', 'Guardian Phone'],
    ];
    for(const [fid, label] of wizardMobileChecks){
      const val = g(fid).trim();
      if(val && !isValidMobile(val)){
        showToast(`${label} must be exactly 10 digits.`);
        document.getElementById(fid).focus();
        return false;
      }
    }
    const wizardAadharChecks = [
      ['fAadhar', 'Aadhar Number'],
      ['fFatherAadhar', "Father's Aadhaar"],
      ['fMotherAadhar', "Mother's Aadhaar"],
    ];
    for(const [fid, label] of wizardAadharChecks){
      const val = g(fid).trim();
      if(val && !isValidAadhar(val)){
        showToast(`${label} must be exactly 12 digits.`);
        document.getElementById(fid).focus();
        return false;
      }
    }

    const data = {
      firstName: g('fFirstName').trim(), lastName: g('fLastName').trim(),
      className: g('fClass'), section: g('fSection'), rollNo: g('fRollNo').trim(), gender: g('fGender'),
      dob: g('fDob'), email: g('fEmail').trim(), password: g('fPassword'),
      admDate: g('fAdmDate'), blood: g('fBlood').trim(), motherTongue: g('fMotherTongue').trim(),
      birthPlace: g('fBirthPlace').trim(), pen: g('fPen').trim(), aadhar: g('fAadhar').trim(),
      caste: g('fCaste'), casteName: g('fCasteName'), religion: g('fReligion'), category: g('fCategory'),
      nationality: g('fNationality') === 'Other' ? g('fNationalityText').trim() : 'Indian',
      status: g('fStatus'), photo: wizardPhotoData,

      fatherName: g('fFatherName').trim(), fatherPhone: g('fFatherPhone').trim(),
      fatherAadhar: g('fFatherAadhar').trim(), fatherOccupation: g('fFatherOccupation').trim(),
      fatherIncome: g('fFatherIncome'), fatherAddress: g('fFatherAddress').trim(),
      motherName: g('fMotherName').trim(), motherPhone: g('fMotherPhone').trim(),
      motherAadhar: g('fMotherAadhar').trim(), motherOccupation: g('fMotherOccupation').trim(),
      motherIncome: g('fMotherIncome'), motherAddress: g('fMotherAddress').trim(),
      guardianApplicable: document.getElementById('fGuardianApplicable').checked,
      guardianName: g('fGuardianName').trim(), guardianRelation: g('fGuardianRelation').trim(),
      guardianPhone: g('fGuardianPhone').trim(), guardianAddress: g('fGuardianAddress').trim(),

      attendedPrevious: g('fAttendedPrevious'), prevSchoolName: g('fPrevSchoolName').trim(),
      prevSchoolAddress: g('fPrevSchoolAddress').trim(), prevClass: g('fPrevClass').trim(),
      prevYear: g('fPrevYear').trim(), siblingIds: wizardSiblings.slice(),

      needsTransport: g('fNeedsTransport'), transportRouteId: g('fRoute'), transportStopId: g('fStop'),

      isNewAdmission: document.getElementById('fNewAdmission').checked,
      isRTE: document.getElementById('fRteStudent').checked,

      // backward-compatible fields used by Dashboard/payments
      name: g('fFirstName').trim() + ' ' + g('fLastName').trim(),
      parent: g('fFatherName').trim() || g('fMotherName').trim(),
      contact: g('fFatherPhone').trim() || g('fMotherPhone').trim(),
    };

    // Guard against silently orphaning an already-collected Bus Fee payment.
    // Needs Transport isn't a separate assignment record like Extra Fee — it's
    // this one profile field — so turning it off is the only way a wrongly
    // enabled Bus Fee gets un-assigned. If money's already been collected
    // under it, block here instead of letting the fee head quietly disappear
    // from the ledger with a payment left behind uncategorized.
    if(editId){
      const existing = students.find(s => s.id === editId);
      if(existing && existing.needsTransport === 'Yes' && data.needsTransport !== 'Yes'){
        const paidBus = payments.filter(p => p.studentId === editId && p.category === 'bus' && !p.voided).reduce((sum,p) => sum + (Number(p.amount)||0), 0);
        if(paidBus > 0){
          showToast(`Can't turn off Needs Transport — ${fmtMoney(paidBus)} has already been collected as Bus Fee for this student. Void or Refund that payment first (Fee ledger → Payment History), then update Transport here.`);
          return false;
        }
      }
    }

    if(editId){
      const idx = students.findIndex(s => s.id === editId);
      students[idx] = { ...students[idx], ...data };
      showToast('Student record updated.');
    }else{
      // Duplicate check: Aadhaar match (if entered) is a strong signal regardless of
      // class/section — a real person's Aadhaar can't legitimately belong to two
      // student records. Falls back to the original same-name/class/section check.
      // Hard-blocks by default; only Admin gets an explicit "force add" override,
      // for genuine edge cases (e.g. twins) — see saveWizard's duplicate-check note.
      const aadharDup = data.aadhar ? students.find(s => (s.aadhar||'').trim() && (s.aadhar||'').trim() === data.aadhar.trim()) : null;
      const nameDup = findPossibleDuplicate(data.firstName, data.lastName, data.className, data.section, null);
      const dup = aadharDup || nameDup;
      if(dup){
        const reason = aadharDup
          ? `Aadhaar ${data.aadhar} is already on file for ${dup.firstName} ${dup.lastName} (Admission No: ${dup.admissionNo}, ${dup.className} — Section ${dup.section}).`
          : `A student named "${data.firstName} ${data.lastName}" already exists in ${data.className} — Section ${data.section} (Admission No: ${dup.admissionNo}${dup.fatherName ? ', Father: '+dup.fatherName : ''}).`;
        if(currentUser.role === 'Admin'){
          const proceed = await showConfirmDialog(
            reason + '\n\nThis looks like a duplicate. Only continue if you have verified this is genuinely a different student (e.g. twins).',
            { title:'Possible duplicate student', okText:'Force add anyway', cancelText:'Cancel — let me check' }
          );
          if(!proceed) return false;
        }else{
          await showInfoDialog(
            reason + '\n\nTo prevent duplicate records, this student was not added. If you\'re sure this is a different student, ask an Admin to add it.',
            { title:'Duplicate student — not added' }
          );
          return false;
        }
      }
      data.id = 'stu_' + Date.now();
      data.admissionNo = nextAdmissionNo();
      students.push(data);
      if(data.isNewAdmission){
        const admissionAmt = Number(classStruct(data.className).admission) || 0;
        if(admissionAmt > 0){
          studentExtraFees.push({
            id: 'sef_' + Date.now(), studentId: data.id, name: 'Admission Fee',
            amount: admissionAmt, paid: false, date: new Date().toISOString().slice(0,10),
          });
          await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
        }
      }
      showToast('New student admitted.', 'burst');
    }
    await persist();
    renderDashboard();
    renderAdmissionsBody();
    closeWizard();
    return false;
  }

  // Every module's data load, as one function — called once unconditionally
  // below (a first, necessarily unauthenticated pass on a fresh page visit,
  // since there's no session cookie yet), and called again by initAuth()
  // and submitLogin() once a real session is confirmed, so every module
  // ends up with actual server data rather than whatever the first,
  // pre-login pass fell back to.
  function loadAllAppData(){
    // These 29 loaders were chained one-after-another with .then() — fine
    // back when each just read its own key out of this browser's
    // localStorage instantly, but once the key/value store change made
    // every one of them a real network round trip to Postgres
    // (/api/kv/:key, plus a couple of dedicated endpoints), a strictly
    // sequential chain meant total load time was the SUM of all 29 round
    // trips, on every login (and once more, wastefully, on the very first
    // unauthenticated page-open pass below). That's the "loading all the
    // pages at a time" slowdown.
    // Verified each loader only reads/writes its own module's globals and
    // never depends on another loader having already run, so there's no
    // ordering requirement between any two of them — safe to run together.
    // Total wait time now tracks the single slowest request instead of the
    // sum of all 29.
    return Promise.all([
      loadClassLevels(), loadSectionLevels(), loadClassSectionOverrides(),
      loadSchoolInfo(), loadFinance(), loadFeeExtras(), loadAttendance(),
      loadExams(), loadRooms(), loadExamHallTickets(),
      loadExamRoomConfigs(), loadExamHolidays(), loadReportTemplates(),
      loadAdmitCardTemplates(), loadExamCoScholastic(),
      loadAdminDownloads(), loadPendingApprovals(), loadInventory(),
      loadTimetable(), loadSyllabusHomework(), loadTransport(), loadLibrary(),
      loadHostel(), loadAccounting(), loadComms(), loadStaff(),
      loadStaffPayroll(), loadSubjects(), loadCustomRoles(), loadStudents(),
      loadUsers(), loadBiometricStatus(),
    ]);
  }
  loadAllAppData().then(() => initAuth()).then(() => applyTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light'));
