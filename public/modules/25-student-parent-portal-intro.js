let myProfileTab = 'notifications';
  // Whether THIS school has online fee payment turned on — a deploy-time
  // choice (see /api/payments/status and razorpayConfigured() in server.js),
  // not something every school gets by default. null = not checked yet,
  // true/false once the one-time check below resolves; cached for the rest
  // of this login so the Fees tab doesn't re-check on every render.
  let onlinePaymentAvailable = null;
  async function loadOnlinePaymentStatus(){
    if(onlinePaymentAvailable !== null) return;
    try{
      const res = await fetch('/api/payments/status');
      const data = await res.json();
      onlinePaymentAvailable = !!(res.ok && data.enabled);
    }catch(e){
      onlinePaymentAvailable = false;
    }
  }
  function switchMyProfileTab(tab){
    myProfileTab = tab;
    ['notifications','profile','fees','marks','classinfo','syllabushw','contact','notices'].forEach(t => {
      const el = document.getElementById('mptab-'+t);
      if(el) el.classList.toggle('active', t===tab);
    });
    renderMyProfileBody();
  }
  function myProfileStudent(){
    return currentUser.linkedStudentId ? students.find(x => x.id === currentUser.linkedStudentId) : null;
  }
  async function renderMyProfileBody(){
    const body = document.getElementById('myProfileBody');
    document.getElementById('myProfileTitle').textContent = currentUser.role === 'Parent' ? "Child's Portal" : "My Portal";
    const s = myProfileStudent();
    if(!s){
      body.innerHTML = `<div class="empty-state"><b>No student linked to this login yet</b>Ask the Admin to link this account to a student under Initial Setup → Users &amp; Roles.</div>`;
      return;
    }
    if(myProfileTab === 'notifications'){
      // Builds a merged feed from payments, attendanceRecords and
      // examResults — all three lazily-loaded.
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      await Promise.all([
        ensureDataLoaded('payments', loadPaymentsData),
        ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData),
        ensureDataLoaded('examResults', loadExamResultsData),
      ]);
      if(myProfileTab === 'notifications') return renderMyNotificationsTab(body, s);
      return;
    }
    if(myProfileTab === 'profile') return renderMyProfileProfileTab(body, s);
    if(myProfileTab === 'fees'){
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      await ensureDataLoaded('payments', loadPaymentsData);
      if(onlinePaymentAvailable === null){
        body.innerHTML = '<div class="empty-state">Loading…</div>';
        loadOnlinePaymentStatus().then(() => { if(myProfileTab === 'fees') renderMyFeesTab(body, s); });
        return;
      }
      if(myProfileTab === 'fees') return renderMyFeesTab(body, s);
      return;
    }
    if(myProfileTab === 'marks'){
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      await ensureDataLoaded('examResults', loadExamResultsData);
      if(myProfileTab === 'marks') return renderMyMarksTab(body, s);
      return;
    }
    if(myProfileTab === 'classinfo') return renderMyClassInfoTab(body, s);
    if(myProfileTab === 'syllabushw') return renderMySyllabusHomeworkTab(body, s);
    if(myProfileTab === 'contact'){
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      loadMyContactData().then(() => { if(myProfileTab === 'contact') renderMyContactTab(body, s); });
      return;
    }
    if(myProfileTab === 'notices') return renderMyNoticesTab(body);
  }

  /* --- Notifications tab: a merged, read-only activity feed built from data
     that already exists elsewhere (fee payments, attendance, exam schedules
     & results, holidays, notices) — nothing new is stored per-notification.
     "New" is tracked with a single lastNotificationSeenAt timestamp on the
     user record, updated whenever this tab is opened. --- */
  // Older notice records saved before audience targeting was tracked have no
  // audienceScope — keep those visible to everyone (their old behavior)
  // rather than silently hiding history. Anything sent after this fix carries
  // its real scope, so it only reaches the students it was actually sent to.
  function commsMessageMatchesStudent(m, s){
    if(!m.audienceScope) return true;
    switch(m.audienceScope){
      case 'allstudents': return true;
      case 'allstaff': return false;
      case 'class': return m.audienceClass === s.className;
      case 'section': return m.audienceClass === s.className && m.audienceSection === s.section;
      case 'individual': return m.individualId === s.id;
      case 'defaulters': return computeDefaulters().some(d => d.student.id === s.id);
      default: return true;
    }
  }
  function computeMyNotifications(s){
    const items = [];
    payments.filter(p => p.studentId === s.id).forEach(p => {
      items.push({
        icon:'💳', tag:'Fee Payment', date: p.date || '',
        title: `Payment received — ${fmtMoney(p.amount)}`,
        detail: `${feeLabelFor(p)} · ${p.mode || 'Office'}${p.receiptNo ? ' · Receipt '+p.receiptNo : ''}`,
      });
    });
    const attCutoff = new Date(); attCutoff.setDate(attCutoff.getDate() - 30);
    const attCutoffStr = attCutoff.toISOString().slice(0,10);
    attendanceRecords.filter(r => r.studentId === s.id && r.date >= attCutoffStr).forEach(r => {
      const isAbsent = r.status === 'Absent';
      items.push({
        icon: isAbsent ? '🚫' : r.status==='Late' ? '⏰' : r.status==='Leave' ? '🌿' : '✅',
        tag:'Attendance', date: r.date,
        title: `Marked ${r.status} on ${r.date}${r.session ? ' ('+r.session+')' : ''}`,
        detail: isAbsent ? 'Contact the school office if this is unexpected.' : '',
        highlight: isAbsent,
      });
    });
    examDefs.forEach(ex => {
      const subjects = getExamSubjects(ex, s.className, s.section).filter(sub => sub.date);
      if(subjects.length){
        const dates = subjects.map(d => d.date).sort();
        items.push({
          icon:'📅', tag:'Exam Schedule', date: dates[0],
          title: `Exam schedule: ${ex.name}`,
          detail: dates.length>1 ? `${dates[0]} – ${dates[dates.length-1]}` : dates[0],
        });
      }
      if(examResults.some(r => r.examId===ex.id && r.studentId===s.id)){
        items.push({
          icon:'📝', tag:'Results', date: ex.endDate || ex.startDate || (subjects[0]&&subjects[0].date) || '',
          title: `Results published: ${ex.name}`,
          detail: 'View in the Marks tab.',
        });
      }
    });
    const holFrom = new Date(); holFrom.setDate(holFrom.getDate() - 14);
    const holFromStr = holFrom.toISOString().slice(0,10);
    holidays.filter(h => h.date >= holFromStr).forEach(h => {
      items.push({ icon:'🏖️', tag:'Holiday', date: h.date, title: `Holiday: ${h.name}`, detail: h.date });
    });
    commsMessages.filter(m => m.channels.includes('In-App') && !m.boardRemoved && commsMessageMatchesStudent(m, s)).forEach(n => {
      items.push({
        icon: noticeTypeByName(n.type) ? noticeTypeByName(n.type).icon : '📣',
        tag:'Notice', date: n.sentDate || '', title: n.title, detail: n.body,
      });
    });
    items.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    return items;
  }
  function renderMyNotificationsTab(body, s){
    const items = computeMyNotifications(s);
    const lastSeen = currentUser.lastNotificationSeenAt || '';
    body.innerHTML = items.length ? items.map(it => `
      <div class="profile-card" style="margin-bottom:12px; ${it.highlight?'border-left:4px solid var(--magenta);':''}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <span style="font-size:1.2rem; line-height:1;">${it.icon}</span>
            <div>
              <span class="pill" style="font-size:0.62rem;">${it.tag}</span>
              <h4 style="margin:6px 0 2px;">${it.title}</h4>
              ${it.detail ? `<p style="font-size:0.8rem; color:var(--ink-soft); margin:2px 0 0; white-space:pre-wrap;">${it.detail}</p>` : ''}
            </div>
          </div>
          ${it.date > lastSeen ? `<span class="perm-new-pill">New</span>` : ''}
        </div>
      </div>
    `).join('') : `<div class="empty-state"><b>Nothing here yet</b>Fee payments, exam schedules, attendance, holidays, and notices will show up here as they happen.</div>`;
    currentUser.lastNotificationSeenAt = new Date().toISOString();
    storageSet(USERS_KEY, users);
    updateMyProfileBadge();
  }
  function updateMyProfileBadge(){
    const navBadge = document.getElementById('navMyProfileBadge');
    const tabBadge = document.getElementById('mpNotifTabBadge');
    if(!currentUser || (currentUser.role !== 'Student' && currentUser.role !== 'Parent')){
      if(navBadge) navBadge.style.display = 'none';
      if(tabBadge) tabBadge.style.display = 'none';
      return;
    }
    const s = myProfileStudent();
    const count = s ? computeMyNotifications(s).filter(it => it.date > (currentUser.lastNotificationSeenAt || '')).length : 0;
    const label = count > 9 ? '9+' : String(count);
    [navBadge, tabBadge].forEach(el => {
      if(!el) return;
      if(count > 0){ el.textContent = label; el.style.display = 'inline-flex'; }
      else el.style.display = 'none';
    });
  }
  function renderMyProfileProfileTab(body, s){
    body.innerHTML = `
      <div class="profile-head">
        ${s.photo ? `<img class="profile-photo" src="${s.photo}">` : `<div class="profile-photo">${initials(s)}</div>`}
        <div>
          <h2>${s.firstName} ${s.lastName}</h2>
          <div class="p-meta">${s.admissionNo} · ${s.className} — Section ${s.section} · <span class="pill">${s.status||'Active'}</span></div>
        </div>
      </div>
      <p style="font-size:0.8rem; color:var(--ink-soft); margin:-10px 0 16px;">Read-only view — contact the school office for any corrections.</p>
      ${buildProfileCardsHTML(s)}
    `;
  }

  /* --- Class & Timetable tab: who the class teacher is (with contact
     details) and the student's own weekly timetable — both read straight
     from the same staffList/timetableEntries data the office already
     maintains elsewhere (Staff Directory, Timetable → Class Timetable);
     nothing new is stored per-student. --- */
  function renderMyClassInfoTab(body, s){
    const teacher = staffList.find(st => st.classTeacherClass===s.className && st.classTeacherSection===s.section && staffIsActive(st));
    const teacherCard = teacher ? `
      <div class="profile-card" style="margin-bottom:20px;">
        <h4>Class Teacher</h4>
        <div class="profile-head" style="margin:10px 0 14px;">
          ${teacher.photo ? `<img class="profile-photo" src="${teacher.photo}">` : `<div class="profile-photo">${staffInitials(teacher)}</div>`}
          <div>
            <h2 style="font-size:1.05rem;">${teacher.firstName} ${teacher.lastName}</h2>
            <div class="p-meta">${teacher.designation||'Class Teacher'}${teacher.department ? ' · '+teacher.department : ''}</div>
          </div>
        </div>
        <div class="profile-row"><span>Phone</span><span>${teacher.phone ? `<a href="tel:${teacher.phone.replace(/\D/g,'')}">${teacher.phone}</a>` : '—'}</span></div>
        <div class="profile-row"><span>Email</span><span>${teacher.email ? `<a href="mailto:${teacher.email}">${teacher.email}</a>` : '—'}</span></div>
      </div>
    ` : `<div class="empty-state" style="margin-bottom:20px;"><b>No class teacher assigned yet</b>Ask the school office once one is assigned to ${s.className} — Section ${s.section}.</div>`;

    const hasEntries = timetableEntries.some(e => e.className===s.className && e.section===s.section);
    const timetableBlock = !timetablePeriods.length ? `<div class="empty-state"><b>Timetable not set up yet</b>Check back once the office publishes it.</div>` : `
      <div class="table-wrap">
        <table><thead><tr><th>Period</th>${activeTimetableDays().map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody>${timetablePeriods.map(p => {
          if(p.isBreak){
            return `<tr><td style="font-weight:600; background:rgba(203,154,46,0.1);">${p.label}<br><span style="font-size:0.7rem; color:var(--ink-soft); font-weight:400;">${p.start}–${p.end}</span></td><td colspan="${activeTimetableDays().length}" style="text-align:center; background:rgba(203,154,46,0.1); color:var(--ink-soft); font-style:italic;">${p.label}</td></tr>`;
          }
          return `<tr><td style="font-weight:600;">${p.label}<br><span style="font-size:0.7rem; color:var(--ink-soft); font-weight:400;">${p.start}–${p.end}</span></td>
            ${activeTimetableDays().map(day => {
              const entry = timetableEntries.find(e => e.className===s.className && e.section===s.section && e.day===day && e.period===p.id);
              const staff = entry ? staffList.find(st => st.id===entry.staffId) : null;
              return `<td style="text-align:center; min-width:110px;">
                ${entry ? `<div style="font-weight:600; color:var(--magenta); font-size:0.82rem;">${entry.subject}</div><div style="font-size:0.72rem; color:var(--ink-soft);">${staff ? staff.firstName+' '+staff.lastName : ''}</div>` : `<span style="color:var(--ink-soft); font-size:0.78rem;">—</span>`}
              </td>`;
            }).join('')}
          </tr>`;
        }).join('')}</tbody></table>
      </div>
      ${!hasEntries ? `<p style="font-size:0.8rem; color:var(--ink-soft); margin-top:10px;">Nothing's been filled in for ${s.className} — Section ${s.section} yet — check back once the office publishes it.</p>` : ''}
    `;

    body.innerHTML = `
      ${teacherCard}
      <div class="dash-section-title"><div><h3>Weekly Timetable — ${s.className}, Section ${s.section}</h3></div></div>
      ${timetableBlock}
    `;
  }

  /* --- Syllabus & Homework tab: homework assigned to this student's class
     (soonest due date first, overdue ones highlighted) and syllabus progress
     per subject, both read straight from the same syllabusTopics/homeworkItems
     arrays the office/teachers maintain under Syllabus & Homework — nothing
     new stored per-student, and it updates the moment staff save a change
     there. An entry with no section set applies to every section of that
     class, so those show up here too. --- */
  function renderMySyllabusHomeworkTab(body, s){
    const relevantTo = item => item.className===s.className && (!item.section || item.section===s.section);
    const today = new Date().toISOString().slice(0,10);
    const myHomework = homeworkItems.filter(relevantTo).sort((a,b) => (a.dueDate||'9999-99-99').localeCompare(b.dueDate||'9999-99-99'));
    const homeworkHtml = myHomework.length ? myHomework.map(h => {
      const overdue = h.dueDate && h.dueDate < today;
      const staff = h.staffId ? staffList.find(st => st.id===h.staffId) : null;
      return `
        <div class="profile-card" style="margin-bottom:12px; ${overdue?'border-left:4px solid var(--magenta);':''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
            <div>
              <span class="pill" style="font-size:0.62rem;">${h.subject}</span>
              <h4 style="margin:6px 0 2px;">${h.title}</h4>
              ${h.description ? `<p style="font-size:0.8rem; color:var(--ink-soft); margin:2px 0 6px; white-space:pre-wrap;">${h.description}</p>` : ''}
              ${(h.attachments||[]).map(a => `<a href="${a.dataUrl}" target="_blank" rel="noopener" class="pill" style="text-decoration:none; margin:0 4px 4px 0; display:inline-block;">📎 ${a.name}</a>`).join('')}
              <p style="font-size:0.74rem; color:var(--ink-soft); margin:0;">${staff ? 'Assigned by '+staff.firstName+' '+staff.lastName+(h.assignedDate?' · ':'') : ''}${h.assignedDate ? 'Given '+h.assignedDate : ''}</p>
            </div>
            ${h.dueDate ? `<span class="pill" style="${overdue?'background:rgba(209,16,115,0.15); color:var(--magenta);':''} white-space:nowrap;">Due ${h.dueDate}${overdue?' — overdue':''}</span>` : ''}
          </div>
        </div>`;
    }).join('') : `<div class="empty-state"><b>No homework assigned right now</b>New homework will show up here automatically.</div>`;

    const mySyllabus = syllabusTopics.filter(relevantTo);
    const bySubject = {};
    mySyllabus.forEach(t => { (bySubject[t.subject] = bySubject[t.subject] || []).push(t); });
    const subjectNames = Object.keys(bySubject).sort();
    const syllabusHtml = subjectNames.length ? subjectNames.map(subject => {
      const topics = bySubject[subject];
      const done = topics.filter(t => t.status==='Completed').length;
      const pct = topics.length ? Math.round((done/topics.length)*100) : 0;
      return `
        <div class="profile-card" style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:10px; flex-wrap:wrap;">
            <h4 style="margin:0;">${subject}</h4>
            <span style="font-size:0.76rem; color:var(--ink-soft);">${done} / ${topics.length} topics · ${pct}%</span>
          </div>
          <div style="height:6px; background:var(--cream); border-radius:4px; overflow:hidden; margin-bottom:12px;">
            <div style="height:100%; width:${pct}%; background:var(--teal); border-radius:4px;"></div>
          </div>
          ${topics.map(t => `<div class="profile-row"><span>${t.topic}</span><span>${syllabusStatusPill(t.status)}</span></div>`).join('')}
        </div>`;
    }).join('') : `<div class="empty-state"><b>Syllabus not published yet</b>Check back once the school adds it.</div>`;

    body.innerHTML = `
      <div class="dash-section-title"><div><h3>Homework</h3></div></div>
      ${homeworkHtml}
      <div class="dash-section-title" style="margin-top:24px;"><div><h3>Syllabus Progress</h3></div></div>
      ${syllabusHtml}
    `;
  }

  /* --- Contact & Submit tab: a Student/Parent reaching out to their Class
     Teacher, a Subject Teacher, or Management with a concern, and/or
     submitting completed homework or holiday work the same way. Recipients
     are resolved from the same staffList/subjectsList data already used
     elsewhere (classTeacherClass/classTeacherSection, subjectStaffForSection)
     so this never needs its own separate assignment step. History for both
     is loaded fresh from the server each time this tab is opened. --- */
  let myConcerns = [];
  let mySubmissions = [];
  let submissionAttachments = []; // [{ name, dataUrl, size }]
  const MAX_SUBMISSION_FILES = 5;
  const MAX_SUBMISSION_FILE_BYTES = 5 * 1024 * 1024; // 5MB per file
  const MAX_SUBMISSION_TOTAL_BYTES = 12 * 1024 * 1024; // combined, well under the app's 25mb request limit once base64-encoded
  async function loadMyContactData(){
    try{
      const res = await throwIfNotOk(await fetch('/api/concerns/mine', { headers: actorHeaders() }));
      myConcerns = await res.json();
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not load your concerns.');
      myConcerns = [];
    }
    try{
      const res = await throwIfNotOk(await fetch('/api/submissions/mine', { headers: actorHeaders() }));
      mySubmissions = await res.json();
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not load your submissions.');
      mySubmissions = [];
    }
  }
  function recipientLabelFor(item){
    if(item.recipientType === 'management') return 'Management';
    if(item.recipientType === 'subject_teacher') return 'Subject Teacher' + (item.subjectName ? ' — '+item.subjectName : '');
    return 'Class Teacher';
  }
  // Value shape: "<recipientType>::<staffId>::<subjectName>" — everything a
  // single <select> option needs to carry, parsed back apart on submit.
  function parseRecipientValue(v){
    if(!v) return null;
    const i1 = v.indexOf('::');
    if(i1 === -1) return null;
    const recipientType = v.slice(0, i1);
    const rest = v.slice(i1 + 2);
    const i2 = rest.indexOf('::');
    const recipientStaffId = i2 === -1 ? rest : rest.slice(0, i2);
    const subjectName = i2 === -1 ? '' : rest.slice(i2 + 2);
    return { recipientType, recipientStaffId, subjectName };
  }
  function myContactRecipientOptionsHtml(s){
    const classTeacher = staffList.find(st => st.classTeacherClass===s.className && st.classTeacherSection===s.section && staffIsActive(st));
    const subjectOpts = [];
    subjectsList.filter(sub => sub.className === s.className).forEach(sub => {
      subjectStaffForSection(sub, s.section).forEach(staffId => {
        const st = staffList.find(x => x.id === staffId && staffIsActive(x));
        if(st) subjectOpts.push({ subjectName: sub.name, staffId: st.id, staffName: st.firstName+' '+st.lastName });
      });
    });
    return `
      <option value="">Select recipient</option>
      <option value="class_teacher::${classTeacher ? classTeacher.id : ''}::" ${!classTeacher ? 'disabled' : ''}>Class Teacher${classTeacher ? ' — '+classTeacher.firstName+' '+classTeacher.lastName : ' (not assigned yet)'}</option>
      ${subjectOpts.length ? `<optgroup label="Subject Teacher">${subjectOpts.map(o => `<option value="subject_teacher::${o.staffId}::${o.subjectName}">${o.subjectName} — ${o.staffName}</option>`).join('')}</optgroup>` : ''}
      <option value="management::::">Management (Admin / Principal)</option>
    `;
  }
  function renderMyContactTab(body, s){
    const recipientOptionsHtml = myContactRecipientOptionsHtml(s);
    const relevantHomework = homeworkItems.filter(h => h.className===s.className && (!h.section || h.section===s.section));
    // data-subject carries the homework's subject so picking one can
    // auto-select the matching Subject Teacher below (autoRouteSubmissionRecipient) —
    // otherwise it's easy to submit worksheet-for-Maths to the wrong teacher
    // by leaving "Send to" on whatever it defaulted to.
    const homeworkOptionsHtml = relevantHomework.map(h => `<option value="${h.id}" data-subject="${h.subject}">${h.subject} — ${h.title}${h.dueDate ? ' (due '+h.dueDate+')' : ''}</option>`).join('');

    const concernsSorted = [...myConcerns].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    const concernsHistoryHtml = concernsSorted.length ? concernsSorted.map(c => `
      <div class="profile-card" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div>
            <span class="pill" style="font-size:0.6rem;">${recipientLabelFor(c)}</span>
            <p style="font-size:0.85rem; white-space:pre-wrap; margin:6px 0 2px;">${c.message}</p>
            <p style="font-size:0.7rem; color:var(--ink-soft); margin:0;">${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</p>
          </div>
          <span class="pill" style="${c.status==='open' ? '' : 'background:rgba(19,145,127,0.15); color:var(--teal);'}">${c.status==='open' ? 'Awaiting reply' : 'Solved'+(c.resolvedAt ? ' on '+new Date(c.resolvedAt).toLocaleDateString() : '')}</span>
        </div>
        ${c.replyMessage ? `<div style="margin-top:8px; padding:8px 10px; background:var(--cream); border-radius:8px; font-size:0.82rem; white-space:pre-wrap;"><b>${c.repliedBy||'Reply'}:</b> ${c.replyMessage}</div>` : ''}
      </div>
    `).join('') : `<div class="empty-state"><b>No concerns sent yet</b></div>`;

    const submissionsSorted = [...mySubmissions].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    const submissionsHistoryHtml = submissionsSorted.length ? submissionsSorted.map(sub => `
      <div class="profile-card" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div>
            <span class="pill" style="font-size:0.6rem;">${recipientLabelFor(sub)}</span>
            <h4 style="margin:6px 0 2px;">${sub.title}</h4>
            ${sub.description ? `<p style="font-size:0.82rem; white-space:pre-wrap; margin:2px 0;">${sub.description}</p>` : ''}
            ${(sub.attachments||[]).map(a => `<a href="${a.dataUrl}" target="_blank" rel="noopener" class="pill" style="text-decoration:none; margin-right:4px;">📎 ${a.name}</a>`).join('')}
            <p style="font-size:0.7rem; color:var(--ink-soft); margin:6px 0 0;">${sub.createdAt ? new Date(sub.createdAt).toLocaleString() : ''}</p>
          </div>
          <span class="pill" style="${sub.status==='submitted' ? '' : sub.status==='resubmit' ? 'background:rgba(209,16,115,0.15); color:var(--magenta);' : 'background:rgba(19,145,127,0.15); color:var(--teal);'}">${sub.status==='submitted' ? 'Submitted' : sub.status==='resubmit' ? 'Needs Resubmission' : 'Reviewed'}</span>
        </div>
        ${(sub.feedback || sub.marks) ? `<div style="margin-top:8px; padding:8px 10px; background:var(--cream); border-radius:8px; font-size:0.82rem; white-space:pre-wrap;">${sub.marks ? `<b>Marks:</b> ${sub.marks}<br>` : ''}${sub.feedback ? `<b>${sub.reviewedBy||'Feedback'}:</b> ${sub.feedback}` : ''}</div>` : ''}
      </div>
    `).join('') : `<div class="empty-state"><b>No work submitted yet</b></div>`;

    submissionAttachments = [];
    body.innerHTML = `
      <div class="dash-section-title"><div><h3>Contact a Teacher or Management</h3></div></div>
      <div class="profile-card" style="margin-bottom:20px;">
        <div class="form-grid">
          <div class="f-field full"><label>Send to</label><select id="concernRecipientSel">${recipientOptionsHtml}</select></div>
          <div class="f-field full"><label>Your message <span class="required-star">*</span></label><textarea id="concernMessageInput" rows="4" placeholder="Describe your concern..."></textarea></div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="submitConcern()">Send</button>
      </div>
      ${concernsHistoryHtml}

      <div class="dash-section-title" style="margin-top:28px;"><div><h3>Submit Homework / Holiday Work</h3></div></div>
      <div class="profile-card" style="margin-bottom:20px;">
        <div class="form-grid">
          <div class="f-field full"><label>Send to</label><select id="submissionRecipientSel">${recipientOptionsHtml}</select></div>
          ${homeworkOptionsHtml ? `<div class="f-field full"><label>Which homework is this for? (optional)</label><select id="submissionHomeworkSel" onchange="autoRouteSubmissionRecipient()"><option value="">Not listed / holiday work</option>${homeworkOptionsHtml}</select></div>` : ''}
          <div class="f-field full"><label>Title <span class="required-star">*</span></label><input type="text" id="submissionTitleInput" placeholder="e.g. Maths worksheet, Holiday project"></div>
          <div class="f-field full"><label>Notes</label><textarea id="submissionDescInput" rows="3" placeholder="Anything you'd like to add..."></textarea></div>
          <div class="f-field full">
            <label>Attach photos, PDFs, Word or Excel files (optional — up to 5 files, 12MB combined)</label>
            <input type="file" id="submissionAttachmentInput" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple onchange="previewSubmissionAttachment(event)">
            <div id="submissionAttachmentPreview" style="margin-top:6px;"></div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="submitWork()">Submit</button>
      </div>
      ${submissionsHistoryHtml}
    `;
    renderSubmissionAttachmentPreview();
  }
  function previewSubmissionAttachment(e){
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // let the same file be re-picked later without needing to be deselected first
    if(!files.length) return;
    const currentTotal = submissionAttachments.reduce((sum,a) => sum + (a.size||0), 0);
    let runningTotal = currentTotal;
    const toRead = [];
    for(const file of files){
      if(submissionAttachments.length + toRead.length >= MAX_SUBMISSION_FILES){
        showToast('You can attach up to ' + MAX_SUBMISSION_FILES + ' files.');
        break;
      }
      if(file.size > MAX_SUBMISSION_FILE_BYTES){
        showToast(file.name + ' is over 5MB — please choose a smaller file.');
        continue;
      }
      if(runningTotal + file.size > MAX_SUBMISSION_TOTAL_BYTES){
        showToast('That would put your combined attachments over 12MB — please choose smaller or fewer files.');
        break;
      }
      runningTotal += file.size;
      toRead.push(file);
    }
    if(!toRead.length) return;
    let pending = toRead.length;
    toRead.forEach(file => {
      const reader = new FileReader();
      reader.onload = evt => {
        submissionAttachments.push({ name: file.name, dataUrl: evt.target.result, size: file.size });
        pending--;
        if(pending === 0) renderSubmissionAttachmentPreview();
      };
      reader.readAsDataURL(file);
    });
  }
  function renderSubmissionAttachmentPreview(){
    const preview = document.getElementById('submissionAttachmentPreview');
    if(!preview) return;
    preview.innerHTML = submissionAttachments.map((a,i) => `
      <span class="pill" style="margin:0 6px 6px 0; display:inline-flex; align-items:center; gap:6px;">
        📎 ${a.name}
        <a href="javascript:void(0)" onclick="removeSubmissionAttachment(${i})" style="color:var(--magenta); text-decoration:none; font-weight:700;">✕</a>
      </span>
    `).join('');
  }
  function removeSubmissionAttachment(i){
    submissionAttachments.splice(i, 1);
    renderSubmissionAttachmentPreview();
  }
  // Picking a homework item auto-selects its Subject Teacher in "Send to" —
  // the recipient dropdown is built the same way for both (subjectOpts in
  // myContactRecipientOptionsHtml), so the value there always exists when a
  // teacher is assigned to that subject/section. Left alone (not reset) if
  // no matching option is found, since the person may have already picked a
  // recipient on purpose (e.g. sending a Maths worksheet to the Class
  // Teacher instead).
  function autoRouteSubmissionRecipient(){
    const hwSel = document.getElementById('submissionHomeworkSel');
    const recipientSel = document.getElementById('submissionRecipientSel');
    if(!hwSel || !recipientSel || !hwSel.value) return;
    const subject = hwSel.options[hwSel.selectedIndex].dataset.subject;
    if(!subject) return;
    const match = Array.from(recipientSel.options).find(o => o.value.startsWith('subject_teacher::') && o.value.endsWith('::'+subject));
    if(match) recipientSel.value = match.value;
  }
  async function submitConcern(){
    const sel = document.getElementById('concernRecipientSel');
    const parsed = parseRecipientValue(sel ? sel.value : '');
    if(!parsed){ showToast('Please choose who to send this to.'); return; }
    const message = (document.getElementById('concernMessageInput').value || '').trim();
    if(!message){ showToast('Please enter your message.'); return; }
    const staff = parsed.recipientStaffId ? staffList.find(x => x.id === parsed.recipientStaffId) : null;
    const recipientName = parsed.recipientType === 'management' ? 'Management' : (staff ? staff.firstName+' '+staff.lastName : '');
    const btn = event && event.target;
    if(btn) btn.disabled = true;
    try{
      await throwIfNotOk(await fetch('/api/concerns', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...actorHeaders() },
        body: JSON.stringify({ recipientType: parsed.recipientType, recipientStaffId: parsed.recipientStaffId || null, recipientName, subjectName: parsed.subjectName, message }),
      }));
      showToast('Sent.', 'burst');
      await loadMyContactData();
      const s = myProfileStudent();
      if(s && myProfileTab === 'contact') renderMyContactTab(document.getElementById('myProfileBody'), s);
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not send your message.');
    }finally{
      if(btn) btn.disabled = false;
    }
  }
  async function submitWork(){
    const sel = document.getElementById('submissionRecipientSel');
    const parsed = parseRecipientValue(sel ? sel.value : '');
    if(!parsed){ showToast('Please choose who to send this to.'); return; }
    const title = (document.getElementById('submissionTitleInput').value || '').trim();
    if(!title){ showToast('Please enter a title.'); return; }
    const description = (document.getElementById('submissionDescInput').value || '').trim();
    const homeworkSel = document.getElementById('submissionHomeworkSel');
    const homeworkId = homeworkSel ? homeworkSel.value : '';
    const staff = parsed.recipientStaffId ? staffList.find(x => x.id === parsed.recipientStaffId) : null;
    const recipientName = parsed.recipientType === 'management' ? 'Management' : (staff ? staff.firstName+' '+staff.lastName : '');
    const btn = event && event.target;
    if(btn) btn.disabled = true;
    try{
      await throwIfNotOk(await fetch('/api/submissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...actorHeaders() },
        body: JSON.stringify({
          recipientType: parsed.recipientType, recipientStaffId: parsed.recipientStaffId || null, recipientName,
          subjectName: parsed.subjectName, homeworkId: homeworkId || null, title, description,
          attachments: submissionAttachments.map(a => ({ name: a.name, dataUrl: a.dataUrl })),
        }),
      }));
      showToast('Submitted.');
      submissionAttachments = [];
      await loadMyContactData();
      const s = myProfileStudent();
      if(s && myProfileTab === 'contact') renderMyContactTab(document.getElementById('myProfileBody'), s);
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not submit your work.');
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  /* --- Staff-side Inbox: whatever's addressed to my own staff record (Class
     Teacher / Subject Teacher matches), plus anything addressed to
     Management if I'm Admin/Principal — resolved server-side, see
     /api/concerns/inbox and /api/submissions/inbox. --- */
  let inboxTab = 'concerns';
  let inboxConcerns = [];
  let inboxSubmissions = [];
  function initInboxView(){
    loadInboxConcerns();
    loadInboxSubmissions();
    switchInboxTab(inboxTab);
  }
  function switchInboxTab(tab){
    inboxTab = tab;
    ['concerns','submissions'].forEach(t => {
      const btn = document.getElementById('inboxtab-'+t);
      if(btn) btn.classList.toggle('active', t===tab);
    });
    renderInboxBody();
  }
  async function loadInboxConcerns(){
    try{
      const res = await throwIfNotOk(await fetch('/api/concerns/inbox', { headers: actorHeaders() }));
      inboxConcerns = await res.json();
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not load concerns.');
      inboxConcerns = [];
    }
    if(inboxTab === 'concerns') renderInboxBody();
  }
  async function loadInboxSubmissions(){
    try{
      const res = await throwIfNotOk(await fetch('/api/submissions/inbox', { headers: actorHeaders() }));
      inboxSubmissions = await res.json();
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not load submissions.');
      inboxSubmissions = [];
    }
    if(inboxTab === 'submissions') renderInboxBody();
  }
  function renderInboxBody(){
    const body = document.getElementById('inboxBody');
    if(!body) return;
    if(inboxTab === 'concerns') return renderInboxConcerns(body);
    if(inboxTab === 'submissions') return renderInboxSubmissions(body);
  }
  // Rough "how many whole days ago" for flagging stale open items — not
  // meant to be precise to the hour, just enough to catch something that's
  // been sitting unanswered.
  function daysAgo(dateStr){
    if(!dateStr) return 0;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000*60*60*24));
  }
  function isManagementUser(){
    return !!currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Principal');
  }
  function renderInboxConcerns(body){
    // Oldest-open-first, so anything that's been sitting unanswered the
    // longest surfaces at the top rather than getting buried under newer
    // ones — this matters most for Admin/Principal, who (see
    // /api/concerns/inbox) see every concern school-wide, not just their own.
    const sorted = [...inboxConcerns].sort((a,b) => (a.status==='open'?0:1) - (b.status==='open'?0:1) || (a.createdAt||'').localeCompare(b.createdAt||''));
    const noteHtml = isManagementUser() ? `<p style="font-size:0.78rem; color:var(--ink-soft); margin:0 0 14px;">Showing every concern raised school-wide — including ones addressed to a Class or Subject Teacher — so you can step in if one's gone unanswered.</p>` : '';
    body.innerHTML = noteHtml + (sorted.length ? sorted.map(c => {
      const stale = c.status==='open' && daysAgo(c.createdAt) >= 2;
      return `
      <div class="profile-card" style="margin-bottom:12px; ${c.status==='open' ? 'border-left:4px solid var(--magenta);' : 'border-left:4px solid var(--teal);'}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div>
            <span class="pill" style="font-size:0.62rem;">${recipientLabelFor(c)}</span>
            <h4 style="margin:6px 0 2px;">${c.studentName} — ${c.className}, Section ${c.section}</h4>
            <p style="font-size:0.85rem; white-space:pre-wrap; margin:4px 0;">${c.message}</p>
            <p style="font-size:0.72rem; color:var(--ink-soft); margin:0;">${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</p>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
            <span class="pill" style="${c.status==='open' ? 'background:rgba(209,16,115,0.15); color:var(--magenta);' : 'background:rgba(19,145,127,0.15); color:var(--teal);'}">${c.status==='open' ? 'Open' : 'Solved'}</span>
            ${stale ? `<span class="pill" style="background:rgba(209,16,115,0.15); color:var(--magenta); font-size:0.6rem;">⚠️ ${daysAgo(c.createdAt)} days, no action</span>` : ''}
          </div>
        </div>
        ${c.replyMessage ? `
          <div style="margin-top:10px; padding:10px; background:var(--cream); border-radius:8px;">
            <div style="font-size:0.72rem; color:var(--ink-soft); margin-bottom:4px;">Reply — ${c.repliedBy||''} ${c.repliedAt ? 'on '+new Date(c.repliedAt).toLocaleString() : ''}</div>
            <div style="font-size:0.85rem; white-space:pre-wrap;">${c.replyMessage}</div>
          </div>
        ` : `
          <div style="margin-top:10px;">
            <textarea id="concernReply-${c.id}" rows="2" placeholder="Type your reply..." style="width:100%;"></textarea>
            <button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="sendConcernReply('${c.id}')">Send Reply</button>
          </div>
        `}
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border); display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          ${c.status==='resolved'
            ? `<span style="font-size:0.76rem; color:var(--ink-soft);">✅ Marked solved${c.resolvedBy ? ' by '+c.resolvedBy : ''}${c.resolvedAt ? ' on '+new Date(c.resolvedAt).toLocaleDateString() : ''}</span>
               <button class="btn btn-ghost btn-sm" onclick="setConcernResolved('${c.id}', false)">Reopen</button>`
            : `<button class="btn btn-primary btn-sm" onclick="setConcernResolved('${c.id}', true)">Mark as Solved</button>`
          }
        </div>
      </div>
    `;
    }).join('') : `<div class="empty-state"><b>Nothing here yet</b>Concerns addressed to you will show up here.</div>`);
  }
  async function sendConcernReply(id){
    const ta = document.getElementById('concernReply-'+id);
    const replyMessage = ((ta && ta.value) || '').trim();
    if(!replyMessage){ showToast('Please type a reply.'); return; }
    try{
      await throwIfNotOk(await fetch('/api/concerns/'+encodeURIComponent(id)+'/reply', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...actorHeaders() },
        body: JSON.stringify({ replyMessage }),
      }));
      showToast('Reply sent.', 'burst');
      await loadInboxConcerns();
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not send reply.');
    }
  }
  async function setConcernResolved(id, resolved){
    try{
      await throwIfNotOk(await fetch('/api/concerns/'+encodeURIComponent(id)+'/status', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...actorHeaders() },
        body: JSON.stringify({ resolved }),
      }));
      showToast(resolved ? 'Marked solved.' : 'Reopened.');
      await loadInboxConcerns();
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not update.');
    }
  }
  function renderInboxSubmissions(body){
    const sorted = [...inboxSubmissions].sort((a,b) => (a.status==='submitted'?0:1) - (b.status==='submitted'?0:1) || (a.createdAt||'').localeCompare(b.createdAt||''));
    const noteHtml = isManagementUser() ? `<p style="font-size:0.78rem; color:var(--ink-soft); margin:0 0 14px;">Showing every submission school-wide — including ones addressed to a Class or Subject Teacher — so you can step in if one's gone unreviewed.</p>` : '';
    body.innerHTML = noteHtml + (sorted.length ? sorted.map(s => `
      <div class="profile-card" style="margin-bottom:12px; ${s.status==='submitted' ? 'border-left:4px solid var(--teal);' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div>
            <span class="pill" style="font-size:0.62rem;">${recipientLabelFor(s)}</span>
            <h4 style="margin:6px 0 2px;">${s.title}</h4>
            <p style="font-size:0.78rem; color:var(--ink-soft); margin:0 0 4px;">${s.studentName} — ${s.className}, Section ${s.section}</p>
            ${s.description ? `<p style="font-size:0.85rem; white-space:pre-wrap; margin:4px 0;">${s.description}</p>` : ''}
            ${(s.attachments||[]).map(a => `<a href="${a.dataUrl}" target="_blank" rel="noopener" class="pill" style="text-decoration:none; margin-right:4px;">📎 ${a.name}</a>`).join('')}
            <p style="font-size:0.72rem; color:var(--ink-soft); margin:6px 0 0;">${s.createdAt ? new Date(s.createdAt).toLocaleString() : ''}</p>
          </div>
          <span class="pill" style="${s.status==='submitted' ? 'background:rgba(19,145,127,0.15); color:var(--teal);' : s.status==='resubmit' ? 'background:rgba(209,16,115,0.15); color:var(--magenta);' : ''}">${s.status==='submitted' ? 'New' : s.status==='resubmit' ? 'Needs Resubmission' : 'Reviewed'}</span>
        </div>
        ${s.status !== 'submitted' ? `
          <div style="margin-top:10px; padding:10px; background:var(--cream); border-radius:8px;">
            <div style="font-size:0.72rem; color:var(--ink-soft); margin-bottom:4px;">${s.marks ? 'Marks: '+s.marks+' · ' : ''}${s.reviewedBy||''} ${s.reviewedAt ? 'on '+new Date(s.reviewedAt).toLocaleString() : ''}</div>
            ${s.feedback ? `<div style="font-size:0.85rem; white-space:pre-wrap;">${s.feedback}</div>` : ''}
          </div>
        ` : `
          <div style="margin-top:10px;">
            <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
              <input type="text" id="submissionMarks-${s.id}" placeholder="Marks/grade (optional)" style="max-width:160px;">
            </div>
            <textarea id="submissionFeedback-${s.id}" rows="2" placeholder="Optional feedback..." style="width:100%;"></textarea>
            <div style="display:flex; gap:8px; margin-top:6px;">
              <button class="btn btn-primary btn-sm" onclick="markSubmissionReviewed('${s.id}','reviewed')">Mark Reviewed</button>
              <button class="btn btn-ghost btn-sm" onclick="markSubmissionReviewed('${s.id}','resubmit')">Needs Resubmission</button>
            </div>
          </div>
        `}
      </div>
    `).join('') : `<div class="empty-state"><b>Nothing here yet</b>Homework and holiday-work submissions addressed to you will show up here.</div>`);
  }
  async function markSubmissionReviewed(id, status){
    const ta = document.getElementById('submissionFeedback-'+id);
    const marksInput = document.getElementById('submissionMarks-'+id);
    const feedback = ((ta && ta.value) || '').trim();
    const marks = ((marksInput && marksInput.value) || '').trim();
    try{
      await throwIfNotOk(await fetch('/api/submissions/'+encodeURIComponent(id)+'/review', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...actorHeaders() },
        body: JSON.stringify({ feedback, marks, status: status || 'reviewed' }),
      }));
      showToast(status==='resubmit' ? 'Marked as needing resubmission.' : 'Marked reviewed.', 'burst');
      await loadInboxSubmissions();
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast(e.message || 'Could not update.');
    }
  }

  /* --- Fees & Payments tab: read-only fee ledger (same numbers as the office
     sees) plus a Pay Online button per pending item, and a payment/receipt
     history with Print Receipt for anything already paid. --- */
  function renderMyFeesTab(body, s){
    const { perCat, extras } = computeStudentFinance(s);
    const studentPayments = payments.filter(p => p.studentId === s.id).sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const catRows = Object.keys(CATS).filter(c => perCat[c].expected > 0).map(c => ({
      type:'category', key:c, label:CATS[c],
      total: perCat[c].expected, paid: perCat[c].collected, discount: perCat[c].discount,
      outstanding: perCat[c].receivable, lateFee: computeLateFeeFor(perCat[c].receivable),
    }));
    const extraRows = extras.map(e => {
      const paidAmt = Number(e.paidAmount) || 0;
      const outstanding = Math.max((Number(e.amount)||0) - paidAmt, 0);
      return { type:'extra', key: e.id, label: e.name, total: Number(e.amount)||0, paid: paidAmt, discount:0, outstanding, lateFee:0 };
    });
    const allRows = [...catRows, ...extraRows];
    const pendingRows = allRows.filter(r => r.outstanding > 0);
    const paidRows = allRows.filter(r => r.outstanding <= 0);
    const totalOutstanding = pendingRows.reduce((sum,r) => sum + r.outstanding + r.lateFee, 0);

    body.innerHTML = `
      ${pendingRows.length ? `
      <div class="dash-section-title"><div><h3>Pending Fees</h3></div></div>
      ${!onlinePaymentAvailable ? `<p style="font-size:0.85rem; color:var(--ink-soft); margin:-8px 0 16px;">Online payment isn't set up for this school yet — please pay at the school office.</p>` : ''}
      <div class="table-wrap" style="overflow-x:auto; margin-bottom:16px;">
        <table><thead><tr><th>Type</th><th>Total</th><th>Paid</th><th>Late Fee</th><th>Outstanding</th>${onlinePaymentAvailable ? '<th></th>' : ''}</tr></thead><tbody>
        ${pendingRows.map(r => `
          <tr>
            <td><span class="pill">${r.label}</span></td>
            <td>${fmtMoney(r.total)}</td>
            <td>${fmtMoney(r.paid)}</td>
            <td>${r.lateFee>0?`<span style="color:var(--magenta); font-weight:600;">${fmtMoney(r.lateFee)}</span>`:'-'}</td>
            <td class="balance-tag due">${fmtMoney(r.outstanding + r.lateFee)}</td>
            ${onlinePaymentAvailable ? `<td><button class="btn btn-primary btn-sm" onclick="payFeeOnline('${r.type}','${r.key}', ${r.outstanding + r.lateFee}, '${r.label.replace(/'/g,"\\'")}')">💳 Pay Online</button></td>` : ''}
          </tr>`).join('')}
        </tbody></table>
      </div>
      <div class="pay-summary-box" style="margin-bottom:24px;">
        <div class="pay-summary-grid"><div class="pay-summary-item highlight"><span>Total Outstanding</span><b>${fmtMoney(totalOutstanding)}</b></div></div>
      </div>
      ` : `<div class="empty-state" style="margin-bottom:24px;"><b>No pending fees</b>Everything's fully paid. 🎉</div>`}

      ${paidRows.length ? `
      <div class="dash-section-title"><div><h3>Fully Paid</h3></div></div>
      <div class="table-wrap" style="margin-bottom:24px;"><table><thead><tr><th>Type</th><th>Total</th><th>Paid</th><th>Discount</th></tr></thead><tbody>
        ${paidRows.map(r => `<tr><td><span class="pill">${r.label}</span></td><td>${fmtMoney(r.total)}</td><td>${fmtMoney(r.paid)}</td><td>${r.discount>0?fmtMoney(r.discount):'-'}</td></tr>`).join('')}
      </tbody></table></div>` : ``}

      <div class="dash-section-title"><div><h3>Payment History &amp; Receipts</h3></div></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Mode</th><th>Amount</th><th></th></tr></thead><tbody>
        ${studentPayments.length ? studentPayments.map(p => `<tr><td>${p.date||'—'}</td><td><span class="pill">${feeLabelFor(p)}</span></td><td>${p.mode||'—'}</td><td>${fmtMoney(p.amount)}</td><td>${canSub('managefee_collection','managefee','print') ? `<button class="btn-edit-text" onclick="printReceipt('${p.id}')">Print Receipt</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><b>No payments yet</b></div></td></tr>`}
      </tbody></table></div>
    `;
  }

  /* Pays one pending row (a fee category or an extra fee) via Razorpay Checkout.
     amount is the exact outstanding + late fee already shown on screen, so the
     parent can't accidentally under/over-pay a line item. */
  async function payFeeOnline(type, key, amount, label){
    await ensureDataLoaded('payments', loadPaymentsData);
    const s = myProfileStudent();
    if(!s){ showToast('No student linked to this login.'); return; }
    if(typeof Razorpay === 'undefined'){ showToast('Payment window failed to load — check your internet connection and try again.'); return; }
    let order;
    try{
      const res = await fetch('/api/payments/create-order', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ amount }),
      });
      order = await res.json();
      if(!res.ok) throw new Error(order.error || 'Could not start the payment.');
    }catch(err){
      showToast(err.message || "Online payments aren't set up yet — please pay at the school office.");
      return;
    }
    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: schoolInfo.name || 'School Fees',
      description: `${label} — ${s.firstName} ${s.lastName}`,
      prefill: { name: currentUser.name || '' },
      theme: { color: '#1f3a63' },
      handler: async function(response){
        try{
          const verifyRes = await fetch('/api/payments/verify', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              studentId: s.id, studentName: `${s.firstName} ${s.lastName}`,
              amount, category: type==='extra' ? 'extra' : key, classAtPayment: s.className,
              extraFeeName: type==='extra' ? label : undefined,
              extraFeeId: type==='extra' ? key : undefined,
            }),
          });
          const result = await verifyRes.json();
          if(!verifyRes.ok) throw new Error(result.error || 'Could not confirm the payment.');
          if(type === 'extra'){
            const fee = studentExtraFees.find(x => x.id === key);
            if(fee){
              fee.paidAmount = (Number(fee.paidAmount)||0) + amount;
              if(fee.paidAmount >= fee.amount) fee.paid = true;
              await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
            }
          }
          payments.push({
            id: result.paymentId, receiptNo: result.receiptNo, studentId: s.id, studentName: `${s.firstName} ${s.lastName}`,
            category: type==='extra' ? 'extra' : key, mode:'Online', amount, discount:0, instalment:'',
            date: new Date().toISOString().slice(0,10), note:'Paid online via Razorpay', classAtPayment: s.className,
            extraFeeName: type==='extra' ? label : undefined, extraFeeId: type==='extra' ? key : undefined,
          });
          showToast('Payment successful — receipt ' + result.receiptNo);
          renderMyProfileBody();
        }catch(err){
          showToast(err.message || `Payment succeeded but couldn't be confirmed — contact the office with payment ID ${response.razorpay_payment_id}.`);
        }
      },
      modal: { ondismiss: function(){ showToast('Payment cancelled.'); } },
    });
    rzp.open();
  }

  /* --- Marks tab: one card per exam that has at least one entered result for
     this student, with a button that opens the same printable marks card the
     office prints (reportCardPageHtml), just without the bulk/search tools. --- */
  function renderMyMarksTab(body, s){
    const examsWithResults = examDefs.filter(ex => examResults.some(r => r.examId === ex.id && r.studentId === s.id));
    if(examsWithResults.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No marks published yet</b>Marks will appear here once a teacher enters them for an exam.</div>`;
      return;
    }
    body.innerHTML = examsWithResults.map(ex => `
      <div class="profile-card" style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h4 style="margin:0 0 4px;">${ex.name}</h4>
          <p style="font-size:0.78rem; color:var(--ink-soft); margin:0;">${ex.examType||''}${ex.startDate?` · ${ex.startDate}${ex.endDate?' – '+ex.endDate:''}`:''}</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="printMyReportCard('${ex.id}')">🖨️ View / Print Marks Card</button>
      </div>
    `).join('');
  }
  function printMyReportCard(examId){
    const s = myProfileStudent();
    const exam = examDefs.find(e => e.id === examId);
    if(!s || !exam) return;
    const template = reportTemplates.find(t => t.isDefault) || reportTemplates[0];
    if(!template){ showToast('No report template is set up yet — ask the office to create one under Result → Report Templates.'); return; }
    const logoEl = document.querySelector('.sb-brand img');
    const logoSrc = logoEl ? logoEl.src : '';
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Marks Card - ${s.firstName} ${s.lastName}</title>
      <style>${reportCardPrintCss()}</style></head>
      <body onload="window.print()">${reportCardPageHtml(s, exam, logoSrc, template)}</body></html>
    `);
    w.document.close();
  }

  /* --- Notices tab: same feed the public website shows, read-only (no
     compose/edit/delete controls — those stay on the staff Notice Board). --- */
  function renderMyNoticesTab(body){
    const notices = commsMessages.filter(m => m.channels.includes('In-App') && !m.boardRemoved).slice().sort((a,b) => b.id.localeCompare(a.id));
    if(notices.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No notices posted yet</b></div>`;
      return;
    }
    body.innerHTML = notices.map(n => `
      <div class="profile-card" style="margin-bottom:14px;">
        <span class="pill" style="font-size:0.68rem;">${noticeTypeByName(n.type)?noticeTypeByName(n.type).icon:'📣'} ${n.type}</span>
        <h4 style="margin:8px 0 4px;">${n.title}</h4>
        <p style="font-size:0.85rem; color:var(--ink); white-space:pre-wrap; margin:6px 0;">${n.body}</p>
        <p style="font-size:0.74rem; color:var(--ink-soft); margin-top:8px;">${n.sentDate}</p>
      </div>
    `).join('');
  }

  let searchDebounceTimer = null;
  function onSearchInput(){
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      const q = document.getElementById('msSearch').value.trim();
      renderSuggestions(q);
    }, 150);
  }

  function renderSuggestions(q){
    const box = document.getElementById('searchSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => statusMatches(s) && (
      (s.firstName||'').toLowerCase().includes(ql) ||
      (s.lastName||'').toLowerCase().includes(ql) ||
      (s.admissionNo||'').toLowerCase().includes(ql)
    )).slice(0, 8);

    if(matches.length === 0){
      box.innerHTML = `<div class="sg-empty">No students match "${q}"</div>`;
      box.classList.add('open');
      return;
    }
    box.innerHTML = matches.map(s => `
      <div class="sg-item" onmousedown="selectSuggestion('${s.id}')">
        <div class="sg-avatar">${s.photo ? `<img src="${s.photo}">` : initials(s)}</div>
        <div>
          <div class="sg-name">${s.firstName} ${s.lastName}</div>
          <div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div>
        </div>
      </div>
    `).join('');
    box.classList.add('open');
  }

  function selectSuggestion(id){
    hideSuggestions();
    document.getElementById('msSearch').value = '';
    openProfile(id);
  }

  function hideSuggestions(){
    const box = document.getElementById('searchSuggestions');
    if(box){ box.classList.remove('open'); }
  }

  function doSearch(){
    const q = document.getElementById('msSearch').value.trim();
    hideSuggestions();
    if(!q){ admissionsView = 'grid'; renderAdmissionsBody(); return; }
    admissionsView = 'search';
    renderAdmissionsBody();
  }

  function renderSearchResults(body){
    const q = document.getElementById('msSearch').value.trim().toLowerCase();
    const rows = students.filter(s => statusMatches(s) && (
      (s.firstName||'').toLowerCase().includes(q) ||
      (s.lastName||'').toLowerCase().includes(q) ||
      (s.admissionNo||'').toLowerCase().includes(q)
    ));
    const tableRows = rows.map(s => `
      <tr onclick="openProfile('${s.id}')" style="cursor:pointer;">
        <td class="id-cell">${s.admissionNo}</td>
        <td class="name-cell">${s.firstName} ${s.lastName}</td>
        <td><span class="pill">${s.className}</span></td>
        <td>${s.section}</td>
        <td>${s.email||'—'}</td>
        <td>${s.admDate||'—'}</td>
        <td>
          ${canDo('admissions','edit') ? `<button class="btn-edit-text" onclick="event.stopPropagation(); editStudent('${s.id}')">Edit</button>` : ''}
          ${canDo('admissions','edit') ? `&nbsp;·&nbsp;<button class="btn-edit-text" onclick="event.stopPropagation(); toggleStudentActive('${s.id}')">${isActive(s) ? 'Mark Inactive' : 'Mark Active'}</button>` : ''}
          ${(canDo('admissions','edit') && canDo('admissions','delete')) ? '&nbsp;·&nbsp;' : ''}
          ${canDo('admissions','delete') ? `<button class="btn-danger-text" onclick="event.stopPropagation(); requestDeleteStudent('${s.id}')">Request Deletion</button>` : ''}
        </td>
      </tr>
    `).join('');
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToGrid()">All Classes</a> &nbsp;/&nbsp; Search results for "${q}"</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Admission No</th><th>Name</th><th>Class</th><th>Sec</th><th>Email</th><th>Date of Joining</th><th></th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        ${rows.length===0 ? `<div class="empty-state"><b>No matches</b>Try a different name or admission number.</div>` : ''}
      </div>
    `;
  }

  function onStatusFilterChange(){
    renderAdmissionsBody();
  }

  /* ===== MORE ACTIONS DROPDOWN ===== */
  