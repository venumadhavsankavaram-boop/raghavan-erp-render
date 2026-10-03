function certLetterheadTop(){
    const logo = (typeof schoolLogoSrc === 'function') ? schoolLogoSrc() : (schoolInfo.logo || '');
    return `
      ${logo ? `<div style="text-align:center;"><img src="${logo}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; margin-bottom:4px;"></div>` : ''}
      <h2 style="text-align:center; margin-bottom:2px;">${schoolInfo.name}</h2>
      <p style="text-align:center; margin:0;">${schoolInfo.address}</p>
      ${schoolInfo.udise || schoolInfo.regNumber ? `<p style="text-align:center; margin:2px 0; font-size:0.85em;">${schoolInfo.udise?('UDISE: '+schoolInfo.udise):''}${schoolInfo.udise && schoolInfo.regNumber?' · ':''}${schoolInfo.regNumber?('Reg No: '+schoolInfo.regNumber):''}</p>` : ''}
      <hr>
    `;
  }
  function certSignatureBlock(label){
    return `
      <div style="text-align:right;">
        ${schoolInfo.principalSignature ? `<img src="${schoolInfo.principalSignature}" style="height:50px; display:block; margin-left:auto;"><br>` : '<br><br>'}
        <span>${label}</span>${schoolInfo.principalName ? `<br><span style="font-size:0.85em;">${schoolInfo.principalName}</span>` : ''}
      </div>
    `;
  }
  function certGuardianLabel(s){
    return s.fatherName ? `S/o Sri ${s.fatherName}` : (s.motherName ? `D/o Smt ${s.motherName}` : '');
  }

  let certModalType = null;
  let certModalStudent = null;

  function openCertPicker(type){
    document.getElementById('moreActionsMenu').classList.remove('open');
    if(students.length === 0){ showToast('No students available.'); return; }
    const label = type === 'Transfer' ? 'Transfer Certificate' : type === 'Character' ? 'Character Certificate' : 'Migration Certificate';
    const name = prompt(`Enter the admission number of the student for the ${label}:`);
    if(!name) return;
    const s = students.find(x => x.admissionNo.toLowerCase() === name.trim().toLowerCase());
    if(!s){ showToast('No student found with that admission number.'); return; }
    openCertModal(type, s);
  }

  function certProfileCardHtml(s){
    return `
      <div class="profile-card" style="margin-bottom:14px;">
        <div class="profile-row"><span>Name</span><span>${s.firstName} ${s.lastName}</span></div>
        <div class="profile-row"><span>Admission No</span><span>${s.admissionNo}</span></div>
        <div class="profile-row"><span>Class — Section</span><span>${s.className} — ${s.section}</span></div>
        <div class="profile-row"><span>Father / Mother Name</span><span>${s.fatherName||'—'} / ${s.motherName||'—'}</span></div>
        <div class="profile-row"><span>Date of Birth</span><span>${s.dob||'—'}</span></div>
        <div class="profile-row"><span>Date of Admission</span><span>${s.admDate||'—'}</span></div>
        <div class="profile-row"><span>Current Status</span><span>${s.status||'Active'}</span></div>
      </div>
    `;
  }

  const CERT_CONDUCT_OPTIONS = `
    <option value="Excellent">Excellent</option>
    <option value="Very Good" selected>Very Good</option>
    <option value="Good">Good</option>
    <option value="Satisfactory">Satisfactory</option>
  `;

  function openCertModal(type, s){
    certModalType = type;
    certModalStudent = s;
    const titleEl = document.getElementById('certModalTitle');
    const subEl = document.getElementById('certModalSub');
    const body = document.getElementById('certModalBody');
    if(type === 'Transfer'){
      titleEl.textContent = 'Transfer Certificate';
      subEl.textContent = "These extra fields are required on an official Transfer Certificate and aren't tracked elsewhere on the student record — fill them in at the time of issue, the same way a physical TC register would.";
      body.innerHTML = certProfileCardHtml(s) + `
        <div class="form-grid" style="display:grid; gap:12px;">
          <label>Class at Admission <span style="font-weight:400; color:var(--ink-soft);">(if different from current class)</span><input type="text" id="tcClassAtAdmission" placeholder="e.g. ${s.className}"></label>
          <label>Date of Leaving<input type="date" id="tcDateOfLeaving" value="${new Date().toISOString().slice(0,10)}"></label>
          <label>Reason for Leaving
            <select id="tcReasonForLeaving" onchange="document.getElementById('tcReasonOtherWrap').style.display=this.value==='Other'?'block':'none';">
              <option value="Parent's Request">Parent's Request</option>
              <option value="Transfer of Parent's Job">Transfer of Parent's Job</option>
              <option value="Completion of Studies">Completion of Studies</option>
              <option value="Discontinuation of Studies">Discontinuation of Studies</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <div id="tcReasonOtherWrap" style="display:none;">
            <label>Reason (specify)<input type="text" id="tcReasonOther" placeholder="Specify reason"></label>
          </div>
          <label>Qualified for Promotion to Higher Class
            <select id="tcQualifiedPromotion">
              <option value="Yes" selected>Yes</option>
              <option value="No">No</option>
              <option value="Not Applicable">Not Applicable</option>
            </select>
          </label>
          <label>General Conduct<select id="tcConduct">${CERT_CONDUCT_OPTIONS}</select></label>
          <label>Total Working Days (optional)<input type="number" id="tcWorkingDays" min="0" placeholder="e.g. 220"></label>
          <label>Days Present (optional)<input type="number" id="tcDaysPresent" min="0" placeholder="e.g. 210"></label>
          <label>Fees Paid Up To<input type="text" id="tcFeesPaidUpTo" placeholder="e.g. March 2026"></label>
          <label>Any Dues
            <select id="tcDuesStatus" onchange="document.getElementById('tcDuesAmountWrap').style.display=this.value==='Dues Pending'?'block':'none';">
              <option value="No Dues" selected>No Dues</option>
              <option value="Dues Pending">Dues Pending</option>
            </select>
          </label>
          <div id="tcDuesAmountWrap" style="display:none;">
            <label>Dues Amount (₹)<input type="number" id="tcDuesAmount" min="0"></label>
          </div>
          <label class="f-field full">Remarks (optional)<input type="text" id="tcRemarks" placeholder="Any additional remarks"></label>
        </div>
      `;
    }else if(type === 'Character'){
      titleEl.textContent = 'Character Certificate';
      subEl.textContent = "Confirms the student's conduct during their period of study — commonly requested for admission elsewhere or a job application.";
      body.innerHTML = certProfileCardHtml(s) + `
        <div class="form-grid" style="display:grid; gap:12px;">
          <label>Period of Study — From<input type="date" id="ccFrom" value="${s.admDate || ''}"></label>
          <label>Period of Study — To<input type="date" id="ccTo" value="${new Date().toISOString().slice(0,10)}"></label>
          <label>Character / Conduct<select id="ccConduct">${CERT_CONDUCT_OPTIONS}</select></label>
          <label>Purpose (optional)<input type="text" id="ccPurpose" placeholder="e.g. for general purposes"></label>
        </div>
      `;
    }else if(type === 'Migration'){
      titleEl.textContent = 'Migration Certificate';
      subEl.textContent = 'Certifies that the student is eligible to migrate to another Board/Institution — typically needed when moving to a different education board or state.';
      body.innerHTML = certProfileCardHtml(s) + `
        <div class="form-grid" style="display:grid; gap:12px;">
          <label>Class / Examination Passed<input type="text" id="mcClassPassed" value="${s.className}"></label>
          <label>Year of Passing<input type="text" id="mcYearOfPassing" value="${new Date().getFullYear()}"></label>
          <label>Eligible for Admission To<input type="text" id="mcEligibleFor" placeholder="e.g. 11th Class"></label>
          <label class="f-field full">Remarks (optional)<input type="text" id="mcRemarks" placeholder="Any additional remarks"></label>
        </div>
      `;
    }
    document.getElementById('certModalOverlay').classList.add('open');
  }

  function closeCertModal(){
    document.getElementById('certModalOverlay').classList.remove('open');
    certModalType = null;
    certModalStudent = null;
  }

  async function submitCertModal(){
    const type = certModalType, s = certModalStudent;
    if(!type || !s) return;
    const payload = { type, resource:'students', recordId:s.id };
    let printFn;
    if(type === 'Transfer'){
      const reason = document.getElementById('tcReasonForLeaving').value;
      const reasonOtherEl = document.getElementById('tcReasonOther');
      const reasonOther = reasonOtherEl ? reasonOtherEl.value.trim() : '';
      payload.conduct = document.getElementById('tcConduct').value;
      payload.details = {
        classAtAdmission: document.getElementById('tcClassAtAdmission').value.trim() || s.className,
        dateOfLeaving: document.getElementById('tcDateOfLeaving').value,
        reasonForLeaving: (reason === 'Other' && reasonOther) ? reasonOther : reason,
        qualifiedForPromotion: document.getElementById('tcQualifiedPromotion').value,
        workingDays: document.getElementById('tcWorkingDays').value.trim(),
        daysPresent: document.getElementById('tcDaysPresent').value.trim(),
        feesPaidUpTo: document.getElementById('tcFeesPaidUpTo').value.trim(),
        duesStatus: document.getElementById('tcDuesStatus').value,
        duesAmount: (document.getElementById('tcDuesAmount') || {}).value || '',
        remarks: document.getElementById('tcRemarks').value.trim(),
      };
      printFn = printTransferCertificate;
    }else if(type === 'Character'){
      payload.conduct = document.getElementById('ccConduct').value;
      payload.purpose = document.getElementById('ccPurpose').value.trim() || 'general purposes';
      payload.details = {
        periodFrom: document.getElementById('ccFrom').value,
        periodTo: document.getElementById('ccTo').value,
      };
      printFn = printCharacterCertificate;
    }else if(type === 'Migration'){
      payload.details = {
        classPassed: document.getElementById('mcClassPassed').value.trim() || s.className,
        yearOfPassing: document.getElementById('mcYearOfPassing').value.trim(),
        eligibleFor: document.getElementById('mcEligibleFor').value.trim(),
        remarks: document.getElementById('mcRemarks').value.trim(),
      };
      printFn = printMigrationCertificate;
    }else{
      return;
    }
    try{
      const res = await throwIfNotOk(await fetch('/api/certificates', {
        method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()},
        body: JSON.stringify(payload)
      }));
      const data = await res.json();
      closeCertModal();
      printFn(s, { serialNo:data.serialNo, conduct:payload.conduct, purpose:payload.purpose, details:data.details || payload.details });
      showToast(type + ' Certificate ' + data.serialNo + ' generated and logged.', 'radial', 100);
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast('Could not generate the certificate (' + e.message + ').');
    }
  }

  function printTransferCertificate(s, cert){
    const d = cert.details || {};
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Transfer Certificate</title></head>
      <body onload="window.print()" style="font-family:serif; padding:50px; max-width:750px; margin:0 auto; line-height:1.7;">
        ${certLetterheadTop()}
        <div style="display:flex; justify-content:space-between; font-size:0.9em; margin:10px 0;">
          <span>TC No: <b>${cert.serialNo}</b></span>
          <span>Date of Issue: <b>${new Date().toISOString().slice(0,10)}</b></span>
        </div>
        <h3 style="text-align:center; margin:20px 0; letter-spacing:1px;">TRANSFER CERTIFICATE</h3>
        <table style="width:100%; border-collapse:collapse; font-size:0.95em;">
          <tr><td style="padding:4px 0; width:60%;">1. Admission Number</td><td><b>${s.admissionNo}</b></td></tr>
          <tr><td style="padding:4px 0;">2. Name of Student${certGuardianLabel(s)?(' ('+certGuardianLabel(s)+')'):''}</td><td><b>${s.firstName} ${s.lastName}</b></td></tr>
          <tr><td style="padding:4px 0;">3. Father's Name</td><td><b>${s.fatherName||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">4. Mother's Name</td><td><b>${s.motherName||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">5. Nationality</td><td><b>${s.nationality||'Indian'}</b></td></tr>
          <tr><td style="padding:4px 0;">6. Category / Religion</td><td><b>${s.category||s.caste||'—'}${s.religion?(' / '+s.religion):''}</b></td></tr>
          <tr><td style="padding:4px 0;">7. Date of Birth (as per school records)</td><td><b>${s.dob||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">8. Date of Admission</td><td><b>${s.admDate||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">9. Class at Admission</td><td><b>${d.classAtAdmission||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">10. Class Last Studied — Section</td><td><b>${s.className} — ${s.section}</b></td></tr>
          <tr><td style="padding:4px 0;">11. Qualified for Promotion to Higher Class</td><td><b>${d.qualifiedForPromotion||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">12. General Conduct</td><td><b>${cert.conduct||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">13. Total Working Days / Days Present</td><td><b>${d.workingDays||'—'} / ${d.daysPresent||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">14. Fees Paid Up To</td><td><b>${d.feesPaidUpTo||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">15. Any Dues</td><td><b>${d.duesStatus==='Dues Pending' ? ('Dues Pending — ₹'+(d.duesAmount||'—')) : 'No Dues'}</b></td></tr>
          <tr><td style="padding:4px 0;">16. Date of Leaving</td><td><b>${d.dateOfLeaving||'—'}</b></td></tr>
          <tr><td style="padding:4px 0;">17. Reason for Leaving</td><td><b>${d.reasonForLeaving||'—'}</b></td></tr>
          ${d.remarks ? `<tr><td style="padding:4px 0;">18. Remarks</td><td><b>${d.remarks}</b></td></tr>` : ''}
        </table>
        <br><br>
        ${certSignatureBlock('Signature of Principal / Correspondent')}
      </body></html>
    `);
    w.document.close();
  }

  function printCharacterCertificate(s, cert){
    const d = cert.details || {};
    const guardianLabel = certGuardianLabel(s);
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Character Certificate</title></head>
      <body onload="window.print()" style="font-family:serif; padding:50px; max-width:700px; margin:0 auto; line-height:1.7;">
        ${certLetterheadTop()}
        <div style="display:flex; justify-content:space-between; font-size:0.9em; margin:10px 0;">
          <span>Certificate No: <b>${cert.serialNo}</b></span>
          <span>Date of Issue: <b>${new Date().toISOString().slice(0,10)}</b></span>
        </div>
        <h3 style="text-align:center; margin:20px 0; letter-spacing:1px;">CHARACTER CERTIFICATE</h3>
        <p>This is to certify that ${pronounFor(s.gender,'title')} <b>${s.firstName} ${s.lastName}</b>${guardianLabel?(', '+guardianLabel):''}, bearing Admission Number <b>${s.admissionNo}</b>, was a student of this institution in Class <b>${s.className} — Section ${s.section}</b> from <b>${d.periodFrom||s.admDate||'—'}</b> to <b>${d.periodTo||'—'}</b>.</p>
        <p>${pronounFor(s.gender,'possessive')} conduct and character during the period of study at this institution were found to be <b>${cert.conduct}</b>. To the best of our knowledge, ${pronounFor(s.gender,'subject')} has not been involved in any activity detrimental to the discipline of the institution.</p>
        <p>This certificate is issued at the request of the student/guardian for ${cert.purpose}.</p>
        <br><br>
        ${certSignatureBlock('Signature of Principal / Head of Institution')}
      </body></html>
    `);
    w.document.close();
  }

  function printMigrationCertificate(s, cert){
    const d = cert.details || {};
    const guardianLabel = certGuardianLabel(s);
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Migration Certificate</title></head>
      <body onload="window.print()" style="font-family:serif; padding:50px; max-width:700px; margin:0 auto; line-height:1.7;">
        ${certLetterheadTop()}
        <div style="display:flex; justify-content:space-between; font-size:0.9em; margin:10px 0;">
          <span>Certificate No: <b>${cert.serialNo}</b></span>
          <span>Date of Issue: <b>${new Date().toISOString().slice(0,10)}</b></span>
        </div>
        <h3 style="text-align:center; margin:20px 0; letter-spacing:1px;">MIGRATION CERTIFICATE</h3>
        <p>This is to certify that <b>${s.firstName} ${s.lastName}</b>${guardianLabel?(', '+guardianLabel):''}, bearing Admission Number <b>${s.admissionNo}</b>, Date of Birth <b>${s.dob||'—'}</b>, studied/passed Class <b>${d.classPassed||s.className}</b> at this institution in the year <b>${d.yearOfPassing||'—'}</b>.</p>
        <p>${s.firstName} is eligible for admission to <b>${d.eligibleFor||'the next higher class'}</b> at another recognized institution/board.</p>
        ${d.remarks ? `<p>Remarks: ${d.remarks}</p>` : ''}
        <br><br>
        ${certSignatureBlock('Signature of Principal / Head of Institution')}
      </body></html>
    `);
    w.document.close();
  }

  /* ===== STUDY CERTIFICATE ===== */
  let studyCertStudent = null;
  function defaultAcademicYear(){
    const now = new Date();
    const y = now.getFullYear();
    // Indian school convention: academic year runs June-May, so before June
    // the "current" academic year started the previous calendar year.
    return now.getMonth() >= 5 ? `${y}-${String(y+1).slice(-2)}` : `${y-1}-${String(y).slice(-2)}`;
  }
  function pronounFor(gender, kind){
    if(gender === 'Female') return kind === 'title' ? 'Ms./Kum.' : kind === 'possessive' ? 'Her' : 'She';
    if(gender === 'Male') return kind === 'title' ? 'Mr.' : kind === 'possessive' ? 'His' : 'He';
    return kind === 'title' ? '' : kind === 'possessive' ? 'Their' : 'The student';
  }
  function openStudyCertPicker(){
    document.getElementById('moreActionsMenu').classList.remove('open');
    if(students.length === 0){ showToast('No students available.'); return; }
    const name = prompt('Enter the admission number of the student for the Study Certificate:');
    if(!name) return;
    const s = students.find(x => x.admissionNo.toLowerCase() === name.trim().toLowerCase());
    if(!s){ showToast('No student found with that admission number.'); return; }
    openStudyCertModal(s);
  }
  function openStudyCertModal(s){
    studyCertStudent = s;
    const body = document.getElementById('studyCertModalBody');
    body.innerHTML = `
      <div class="profile-card" style="margin-bottom:14px;">
        <div class="profile-row"><span>Name</span><span>${s.firstName} ${s.lastName}</span></div>
        <div class="profile-row"><span>Admission No</span><span>${s.admissionNo}</span></div>
        <div class="profile-row"><span>Class — Section</span><span>${s.className} — ${s.section}</span></div>
        <div class="profile-row"><span>Father / Mother Name</span><span>${s.fatherName||'—'} / ${s.motherName||'—'}</span></div>
        <div class="profile-row"><span>Date of Birth</span><span>${s.dob||'—'}</span></div>
        <div class="profile-row"><span>Date of Admission</span><span>${s.admDate||'—'}</span></div>
        <div class="profile-row"><span>Current Status</span><span>${s.status||'Active'}</span></div>
      </div>
      <div class="form-grid" style="display:grid; gap:12px;">
        <label>Academic Year<input type="text" id="studyCertAcademicYear" value="${defaultAcademicYear()}"></label>
        <label>Conduct
          <select id="studyCertConduct">
            <option value="Excellent">Excellent</option>
            <option value="Very Good" selected>Very Good</option>
            <option value="Good">Good</option>
            <option value="Satisfactory">Satisfactory</option>
          </select>
        </label>
        <label>Purpose (optional)<input type="text" id="studyCertPurpose" placeholder="e.g. for general purposes" value=""></label>
      </div>
    `;
    document.getElementById('studyCertModalOverlay').classList.add('open');
  }
  function closeStudyCertModal(){
    document.getElementById('studyCertModalOverlay').classList.remove('open');
    studyCertStudent = null;
  }
  async function submitStudyCertificate(){
    const s = studyCertStudent;
    if(!s) return;
    const academicYear = document.getElementById('studyCertAcademicYear').value.trim() || defaultAcademicYear();
    const conduct = document.getElementById('studyCertConduct').value;
    const purpose = document.getElementById('studyCertPurpose').value.trim() || 'general purposes';
    try{
      const res = await throwIfNotOk(await fetch('/api/certificates', {
        method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()},
        body: JSON.stringify({ type:'Study', resource:'students', recordId:s.id, conduct, purpose, academicYear })
      }));
      const data = await res.json();
      closeStudyCertModal();
      printStudyCertificate(s, { serialNo:data.serialNo, conduct, purpose, academicYear });
      showToast('Study Certificate ' + data.serialNo + ' generated and logged.', 'radial', 100);
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast('Could not generate the certificate (' + e.message + ').');
    }
  }
  function printStudyCertificate(s, cert){
    const isCurrentlyStudying = (s.status || 'Active') !== 'Inactive';
    const guardianLabel = s.fatherName ? `S/o Sri ${s.fatherName}` : (s.motherName ? `D/o Smt ${s.motherName}` : '');
    const studyLine = isCurrentlyStudying
      ? `is currently studying in Class <b>${s.className} — Section ${s.section}</b> during the academic year <b>${cert.academicYear}</b>.`
      : `studied in this institution up to Class <b>${s.className} — Section ${s.section}</b> during the academic year <b>${cert.academicYear}</b>, and is no longer on the rolls of this institution.`;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Study Certificate</title></head>
      <body onload="window.print()" style="font-family:serif; padding:50px; max-width:700px; margin:0 auto; line-height:1.7;">
        ${certLetterheadTop()}
        <div style="display:flex; justify-content:space-between; font-size:0.9em; margin:10px 0;">
          <span>Certificate No: <b>${cert.serialNo}</b></span>
          <span>Date of Issue: <b>${new Date().toISOString().slice(0,10)}</b></span>
        </div>
        <h3 style="text-align:center; margin:20px 0; letter-spacing:1px;">STUDY CERTIFICATE</h3>
        <p>This is to certify that ${pronounFor(s.gender,'title')} <b>${s.firstName} ${s.lastName}</b>${guardianLabel?(', '+guardianLabel):''}, bearing Admission Number <b>${s.admissionNo}</b>, ${studyLine}</p>
        <p>Date of Birth (as per school records): <b>${s.dob||'—'}</b></p>
        <p>Date of Admission: <b>${s.admDate||'—'}</b></p>
        <p>${pronounFor(s.gender,'possessive')} conduct and character during the period of study at this institution were found to be <b>${cert.conduct}</b>.</p>
        <p>This certificate is issued at the request of the student/guardian for ${cert.purpose}.</p>
        <br><br>
        ${certSignatureBlock('Signature of Principal / Head of Institution')}
      </body></html>
    `);
    w.document.close();
  }

  /* ===== WIZARD MODAL ===== */
  