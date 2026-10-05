let admissionsView = 'grid'; // grid | section | profile | search
  let currentClass = '', currentSection = '', currentStudentId = '';
  let wizardSiblings = [];
  // Siblings linked the OTHER way round — the other student's own record
  // lists this one as their sibling, not the other way. Shown read-only in
  // the wizard (see renderSiblingList) so staff can see the link is already
  // there without re-adding it; editable only from that other student's own
  // record, since that's where it's actually stored.
  let wizardInheritedSiblingIds = [];
  let wizardPhotoData = '';

  function isActive(s){
    return (s.status||'Active').toString().trim().toLowerCase() === 'active';
  }
  // Roll-call order for a class/section roster: by Roll Number (numeric, so
  // "2" sorts before "10" — a plain string sort would not), students with no
  // roll number set pushed to the end (alphabetically among themselves)
  // rather than mixed in ahead of numbered students. Used anywhere a teacher
  // or admin needs the physical register order — Attendance Entry, Marks
  // Entry, Admit Cards, and the Manage Student class/section list — instead
  // of the alphabetical-by-first-name order those previously defaulted to.
  function compareByRoll(a, b){
    const ra = parseInt(a.rollNo, 10);
    const rb = parseInt(b.rollNo, 10);
    const aHas = !isNaN(ra), bHas = !isNaN(rb);
    if(aHas && bHas) return ra - rb;
    if(aHas) return -1;
    if(bHas) return 1;
    return (a.firstName||'').localeCompare(b.firstName||'');
  }

  // Walks the WHOLE connected sibling group, not just one hop. A sibling
  // link is stored on just one side (see the wizard's sibling picker), so
  // for a 3+-way family — e.g. Govardhan's own record lists Sirisha AND
  // Chandana as siblings, but neither Sirisha's nor Chandana's own record
  // lists anything — a single hop from Chandana only finds Govardhan (the
  // record that names her) and misses Sirisha, who's only reachable by then
  // following Govardhan's own list onward. This does a breadth-first walk
  // over the sibling graph (treating siblingIds as edges, followed in BOTH
  // directions) so the full group comes back regardless of which one
  // record(s) the links happen to be stored on, or how many students are in
  // it. Used for the Fee "Family Total" view, the profile page's Siblings
  // row, and the edit wizard's inherited-siblings note — one fix covers all
  // three, and also corrects the Fee family view for any family of 3+ that
  // was previously silently under-counting.
  function getFamilyIds(s){
    const visited = new Set([s.id]);
    const queue = [s.id];
    while(queue.length){
      const currentId = queue.shift();
      const current = students.find(x => x.id === currentId);
      if(current){
        (current.siblingIds||[]).forEach(id => {
          if(!visited.has(id)){ visited.add(id); queue.push(id); }
        });
      }
      students.forEach(other => {
        if((other.siblingIds||[]).includes(currentId) && !visited.has(other.id)){
          visited.add(other.id);
          queue.push(other.id);
        }
      });
    }
    return Array.from(visited);
  }

  function statusMatches(s){
    const f = document.getElementById('statusFilter').value;
    if(f === 'all') return true;
    const norm = v => (v||'Active').toString().trim().toLowerCase();
    return norm(s.status) === norm(f);
  }

  function initials(s){
    return ((s.firstName||' ')[0] + (s.lastName||' ')[0]).toUpperCase();
  }

  function renderAdmissionsBody(){
    const body = document.getElementById('admissionsBody');
    if(!body) return;
    if(admissionsView === 'grid') return renderClassGrid(body);
    if(admissionsView === 'section') return renderSectionList(body);
    if(admissionsView === 'profile') return renderProfile(body);
    if(admissionsView === 'search') return renderSearchResults(body);
  }

  let expandedClass = '';


  function toggleClassExpand(cls){
    expandedClass = (expandedClass === cls) ? '' : cls;
    renderClassGrid(document.getElementById('admissionsBody'));
  }

  function openSection(cls, sec){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    currentClass = cls; currentSection = sec;
    admissionsView = 'section';
    renderAdmissionsBody();
  }

  function backToGrid(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    admissionsView = 'grid';
    renderAdmissionsBody();
  }


  function rowClickToProfile(e, id){
    openProfile(id);
  }

  function openProfile(id){
    currentStudentId = id;
    admissionsView = 'profile';
    renderAdmissionsBody();
  }

  function backFromProfile(){
    admissionsView = currentClass ? 'section' : 'grid';
    renderAdmissionsBody();
  }

  function buildProfileCardsHTML(s){
    // Bidirectional: shows a sibling whether the link was entered on THIS
    // student's own record or on the sibling's record (see getFamilyIds),
    // so staff never have to add the same sibling pair from both sides.
    const siblingNames = getFamilyIds(s).filter(id => id !== s.id).map(sid => {
      const sib = students.find(x => x.id === sid);
      return sib ? (sib.firstName + ' ' + sib.lastName) : null;
    }).filter(Boolean);
    return `
      <div class="profile-grid">
        <div class="profile-card">
          <h4>Student Details</h4>
          <div class="profile-row"><span>Gender</span><span>${s.gender||'—'}</span></div>
          <div class="profile-row"><span>Date of Birth</span><span>${s.dob||'—'}</span></div>
          <div class="profile-row"><span>Email</span><span>${s.email||'—'}</span></div>
          <div class="profile-row"><span>Date of Joining</span><span>${s.admDate||'—'}</span></div>
          <div class="profile-row"><span>Blood Group</span><span>${s.blood||'—'}</span></div>
          <div class="profile-row"><span>Mother Tongue</span><span>${s.motherTongue||'—'}</span></div>
          <div class="profile-row"><span>Birth Place</span><span>${s.birthPlace||'—'}</span></div>
          <div class="profile-row"><span>PEN Number</span><span>${s.pen||'—'}</span></div>
          <div class="profile-row"><span>Aadhar Number</span><span>${s.aadhar||'—'}</span></div>
          <div class="profile-row"><span>Caste Category</span><span>${s.caste||'—'}</span></div>
          <div class="profile-row"><span>Caste</span><span>${s.casteName||'—'}</span></div>
          <div class="profile-row"><span>Religion</span><span>${s.religion||'—'}</span></div>
          <div class="profile-row"><span>Admission Category</span><span>${s.category||'—'}</span></div>
          <div class="profile-row"><span>Nationality</span><span>${s.nationality||'—'}</span></div>
        </div>
        <div class="profile-card">
          <h4>Father Details</h4>
          <div class="profile-row"><span>Name</span><span>${s.fatherName||'—'}</span></div>
          <div class="profile-row"><span>Phone</span><span>${s.fatherPhone||'—'}</span></div>
          <div class="profile-row"><span>Aadhaar</span><span>${s.fatherAadhar||'—'}</span></div>
          <div class="profile-row"><span>Occupation</span><span>${s.fatherOccupation||'—'}</span></div>
          <div class="profile-row"><span>Annual Income</span><span>${s.fatherIncome ? fmtMoney(s.fatherIncome) : '—'}</span></div>
          <div class="profile-row"><span>Address</span><span>${s.fatherAddress||'—'}</span></div>
        </div>
        <div class="profile-card">
          <h4>Mother Details</h4>
          <div class="profile-row"><span>Name</span><span>${s.motherName||'—'}</span></div>
          <div class="profile-row"><span>Phone</span><span>${s.motherPhone||'—'}</span></div>
          <div class="profile-row"><span>Aadhaar</span><span>${s.motherAadhar||'—'}</span></div>
          <div class="profile-row"><span>Occupation</span><span>${s.motherOccupation||'—'}</span></div>
          <div class="profile-row"><span>Annual Income</span><span>${s.motherIncome ? fmtMoney(s.motherIncome) : '—'}</span></div>
          <div class="profile-row"><span>Address</span><span>${s.motherAddress||'—'}</span></div>
        </div>
        ${s.guardianApplicable ? `
        <div class="profile-card">
          <h4>Guardian Details</h4>
          <div class="profile-row"><span>Name</span><span>${s.guardianName||'—'}</span></div>
          <div class="profile-row"><span>Relation</span><span>${s.guardianRelation||'—'}</span></div>
          <div class="profile-row"><span>Phone</span><span>${s.guardianPhone||'—'}</span></div>
          <div class="profile-row"><span>Address</span><span>${s.guardianAddress||'—'}</span></div>
        </div>` : ``}
        <div class="profile-card">
          <h4>Previous School</h4>
          <div class="profile-row"><span>Attended before?</span><span>${s.attendedPrevious||'No'}</span></div>
          ${s.attendedPrevious==='Yes' ? `
          <div class="profile-row"><span>School Name</span><span>${s.prevSchoolName||'—'}</span></div>
          <div class="profile-row"><span>Address</span><span>${s.prevSchoolAddress||'—'}</span></div>
          <div class="profile-row"><span>Class Studied</span><span>${s.prevClass||'—'}</span></div>
          <div class="profile-row"><span>Year</span><span>${s.prevYear||'—'}</span></div>` : ``}
          <div class="profile-row"><span>Siblings</span><span>${siblingNames.length ? siblingNames.join(', ') : '—'}</span></div>
        </div>
        <div class="profile-card">
          <h4>Transport</h4>
          <div class="profile-row"><span>Needs Transport?</span><span>${s.needsTransport||'No'}</span></div>
          ${s.needsTransport==='Yes' ? `
          <div class="profile-row"><span>Route</span><span>${s.route||'—'}</span></div>
          <div class="profile-row"><span>Bus</span><span>${s.bus||'—'}</span></div>
          <div class="profile-row"><span>Stop</span><span>${s.stop||'—'}</span></div>` : ``}
        </div>
      </div>
    `;
  }


  /* ===== Student/Parent self-service portal: My Profile / Fees / Marks / Notices =====
     One login (Student or Parent role) is linked to exactly one student record
     (currentUser.linkedStudentId). Every tab below reads that same student's
     already-loaded data (students/payments/examResults/commsMessages arrays —
     no separate fetch needed, this is all same-origin, same app) and renders a
     read-only view of it, plus a "Pay Online" action on the Fees tab. */
  