/* ===== Timetable UI (22f) =====
   Presentation-only redesign of the Timetable screens. Loads after module 21,
   so these declarations replace the old render functions of the same name.
   Untouched (still in module 21): initTimetableView, switchTimetableTab,
   renderTimetableBody, openTtCellModal / saveTtCell / clearTtCell (+ modal
   helpers), print handlers, toggleTtDay, syncTtPeriodsFromInputs,
   addTtPeriodRow, removeTtPeriodRow, saveTtPeriods.
   Uses sfKpi / sfBtn / sfIcon from 07b. New globals are all prefixed ttx. */

const TTX_TONES = 6;
function ttxTone(name){
  let h = 0; const s = String(name || '');
  h = 2166136261;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h = (h ^ (h >>> 15)) >>> 0;
  return h % TTX_TONES;
}
function ttxStaffName(id){
  const s = staffList.find(x => x.id === id);
  return s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : '';
}
function ttxShortDay(d){ return String(d).slice(0, 3); }
function ttxTeachingPeriods(){ return timetablePeriods.filter(p => !p.isBreak); }

/* How many entries share one teacher + day + period (>1 means a clash). */
function ttxClashMap(){
  const m = {};
  timetableEntries.forEach(e => {
    if(!e.staffId) return;
    const k = `${e.day}|${e.period}|${e.staffId}`;
    (m[k] = m[k] || []).push(e);
  });
  return m;
}
function ttxIsClash(map, e){
  const l = map[`${e.day}|${e.period}|${e.staffId}`];
  return !!(l && l.length > 1);
}
function ttxTimeLabel(p){
  return `<b>${escapeHtml(p.label)}</b><span>${escapeHtml(p.start)}–${escapeHtml(p.end)}</span>`;
}
function ttxMinutes(a, b){
  if(!a || !b) return 0;
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
  const d = (h2 * 60 + m2) - (h1 * 60 + m1);
  return d > 0 ? d : 0;
}
function ttxEmpty(title, text){
  return `<div class="ttx-empty"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/></svg><b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>`;
}
function ttxWarnIcon(){
  return `<svg class="ttx-warn-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>`;
}
function ttxPrintBtn(fn){
  return `<button type="button" class="sf-btn sf-btn--soft" onclick="${fn}"><svg class="sf-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>Print / PDF</button>`;
}
/* Time column + period name for a row. */
function ttxRowHead(p){
  return `<th scope="row" class="ttx-time">${ttxTimeLabel(p)}</th>`;
}
function ttxBreakRow(p, cols){
  return `<tr class="ttx-break"><th scope="row" class="ttx-time">${ttxTimeLabel(p)}</th><td colspan="${cols}"><span>${escapeHtml(p.label)}</span></td></tr>`;
}
function ttxHeadRow(days){
  return `<thead><tr><th class="ttx-corner">Period</th>${days.map(d => `<th><span class="ttx-day-full">${escapeHtml(d)}</span><span class="ttx-day-short">${ttxShortDay(d)}</span></th>`).join('')}</tr></thead>`;
}

/* ---------------- Class timetable ---------------- */
function renderClassTimetableTab(body){
  const classOpts = CLASS_LEVELS.map(c => `<option value="${escapeHtml(c)}" ${c === ttClass ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  const secOpts = SECTIONS.map(s => `<option value="${escapeHtml(s)}" ${s === ttSection ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
  const ready = ttClass && ttSection;
  body.innerHTML = `
    <div class="iv-toolbar ttx-toolbar">
      <label class="ttx-sel"><span>Class</span><select class="input" id="ttClassSelect" onchange="ttClass=this.value; renderTimetableBody();"><option value="">Select class</option>${classOpts}</select></label>
      <label class="ttx-sel"><span>Section</span><select class="input" id="ttSectionSelect" onchange="ttSection=this.value; renderTimetableBody();"><option value="">Select section</option>${secOpts}</select></label>
      ${ready ? `<div class="iv-toolbar-actions">${ttxPrintBtn('printClassTimetable()')}</div>` : ''}
    </div>
    ${ready ? renderTtClassGrid() : ttxClassOverview()}
  `;
}

/* Landing view before a class is picked: every class/section with how full its week is. */
function ttxClassOverview(){
  const days = activeTimetableDays();
  const slots = ttxTeachingPeriods().length * days.length;
  const periodIds = new Set(ttxTeachingPeriods().map(p => p.id));
  const count = (c, s) => timetableEntries.filter(e => e.className === c && e.section === s && days.includes(e.day) && periodIds.has(e.period)).length;
  const rows = CLASS_LEVELS.map(c => `
    <li><span class="ttx-ov-name">${escapeHtml(c)}</span>
      <div class="ttx-ov-secs">${SECTIONS.map(s => {
        const n = count(c, s), pct = slots ? Math.round(n / slots * 100) : 0;
        return `<button type="button" class="ttx-ov-chip${pct >= 100 ? ' is-full' : ''}${n === 0 ? ' is-none' : ''}" onclick="ttClass='${escapeHtml(c)}'; ttSection='${escapeHtml(s)}'; renderTimetableBody();"><b>${escapeHtml(s)}</b><span>${n}/${slots}</span><i style="width:${Math.min(100, pct)}%"></i></button>`;
      }).join('')}</div></li>`).join('');
  return `
    <section class="sf-card ttx-card">
      <h4>Pick a class and section</h4>
      <p class="ttx-note">Choose above, or open one below. Each chip shows how many of the week's ${slots} teaching slots are filled.</p>
      <ul class="ttx-ov">${rows}</ul>
    </section>`;
}

function renderTtClassGrid(){
  const canEditTt = canSub('timetable_class', 'timetable', 'edit');
  const days = activeTimetableDays();
  const teaching = ttxTeachingPeriods();
  const pIds = new Set(teaching.map(p => p.id));
  const mine = timetableEntries.filter(e => e.className === ttClass && e.section === ttSection && days.includes(e.day) && pIds.has(e.period));
  const slots = teaching.length * days.length;
  const clashMap = ttxClashMap();
  const clashes = mine.filter(e => ttxIsClash(clashMap, e));
  const subjects = {};
  mine.forEach(e => {
    const o = subjects[e.subject] = subjects[e.subject] || { n: 0, staff: new Set() };
    o.n++; if(e.staffId) o.staff.add(e.staffId);
  });
  const subjRows = Object.keys(subjects).sort((a, b) => subjects[b].n - subjects[a].n || a.localeCompare(b));

  const rows = timetablePeriods.map(p => {
    if(p.isBreak) return ttxBreakRow(p, days.length);
    return `<tr>${ttxRowHead(p)}${days.map(day => {
      const entry = timetableEntries.find(e => e.className === ttClass && e.section === ttSection && e.day === day && e.period === p.id);
      const act = canEditTt ? ` onclick="openTtCellModal('${day}','${p.id}')"` : '';
      const tag = canEditTt ? 'button type="button"' : 'div';
      const end = canEditTt ? 'button' : 'div';
      if(!entry){
        return `<td><${tag} class="ttx-cell ttx-cell--empty"${act} ${canEditTt ? `aria-label="Add a subject on ${escapeHtml(day)}, ${escapeHtml(p.label)}"` : ''}>${canEditTt ? `<span class="ttx-plus">+</span><span class="ttx-add">Add</span>` : '<span class="ttx-dash">—</span>'}</${end}></td>`;
      }
      const clash = ttxIsClash(clashMap, entry);
      const who = ttxStaffName(entry.staffId);
      return `<td><${tag} class="ttx-cell ttx-t${ttxTone(entry.subject)}${clash ? ' is-clash' : ''}"${act}>
        <b>${escapeHtml(entry.subject)}</b>
        <span>${who ? escapeHtml(who) : 'No teacher'}</span>
        ${clash ? `<em>${ttxWarnIcon()}Clash</em>` : ''}
      </${end}></td>`;
    }).join('')}</tr>`;
  }).join('');

  const clashList = clashes.map(e => {
    const other = (clashMap[`${e.day}|${e.period}|${e.staffId}`] || []).find(x => x !== e);
    const p = timetablePeriods.find(x => x.id === e.period);
    return `<li><b>${escapeHtml(ttxShortDay(e.day))} · ${escapeHtml(p ? p.label : '')}</b> ${escapeHtml(ttxStaffName(e.staffId) || 'Teacher')} is also teaching ${other ? `${escapeHtml(other.className)} ${escapeHtml(other.section)} (${escapeHtml(other.subject)})` : 'another class'} at this time.</li>`;
  }).join('');

  return `
    <section class="sf-kpis ttx-kpis">
      ${sfKpi('Periods filled', `${mine.length}<small class="ttx-of"> / ${slots}</small>`, mine.length && mine.length === slots ? 'good' : 'plain', slots ? Math.round(mine.length / slots * 100) + '% of the week' : '')}
      ${sfKpi('Free slots', Math.max(0, slots - mine.length), slots - mine.length > 0 ? 'warn' : 'good', slots - mine.length > 0 ? 'No subject assigned yet' : 'Week is complete')}
      ${sfKpi('Subjects', subjRows.length, 'plain', 'Scheduled this week')}
      ${sfKpi('Teacher clashes', clashes.length, clashes.length ? 'danger' : 'good', clashes.length ? 'Needs attention' : 'None')}
    </section>
    ${clashes.length ? `<div class="ttx-alert" role="alert">${ttxWarnIcon()}<div><b>${clashes.length} teacher clash${clashes.length === 1 ? '' : 'es'} in this timetable</b><ul>${clashList}</ul></div></div>` : ''}
    <section class="sf-card ttx-card ttx-gridcard">
      <div class="ttx-cardhead"><h4>${escapeHtml(ttClass)} <small>Section ${escapeHtml(ttSection)}</small></h4><span>${canEditTt ? 'Tap a slot to assign or change it' : 'View only'}</span></div>
      ${days.length && timetablePeriods.length ? `<div class="ttx-wrap"><table class="ttx-grid">${ttxHeadRow(days)}<tbody>${rows}</tbody></table></div>` : ttxEmpty('No periods or days set up', 'Add them under Periods Setup.')}
    </section>
    ${subjRows.length ? `<section class="sf-card ttx-card">
      <h4>Subjects this week</h4>
      <ul class="ttx-subj">${subjRows.map(sn => {
        const o = subjects[sn];
        const names = [...o.staff].map(ttxStaffName).filter(Boolean);
        return `<li class="ttx-t${ttxTone(sn)}"><b>${escapeHtml(sn)}</b><span>${o.n} period${o.n === 1 ? '' : 's'}</span><small>${names.length ? escapeHtml(names.join(', ')) : 'No teacher'}</small></li>`;
      }).join('')}</ul>
    </section>` : ''}
  `;
}

/* ---------------- Teacher timetable ---------------- */
function renderTeacherTimetableTab(body){
  const teachers = staffList.filter(s => staffIsActive(s));
  const t = teachers.find(s => s.id === ttTeacherId);
  body.innerHTML = `
    <div class="iv-toolbar ttx-toolbar">
      <label class="ttx-sel ttx-sel--wide"><span>Teacher</span><select class="input" id="ttTeacherSelect" onchange="ttTeacherId=this.value; renderTimetableBody();">
        <option value="">Select a teacher</option>
        ${teachers.map(s => `<option value="${escapeHtml(s.id)}" ${s.id === ttTeacherId ? 'selected' : ''}>${escapeHtml(((s.firstName || '') + ' ' + (s.lastName || '')).trim())}</option>`).join('')}
      </select></label>
      ${ttTeacherId ? `<div class="iv-toolbar-actions">${ttxPrintBtn('printTeacherTimetable()')}</div>` : ''}
    </div>
    ${!ttTeacherId ? ttxTeacherOverview(teachers) : renderTeacherGrid()}
  `;
}

function ttxTeacherOverview(teachers){
  const days = activeTimetableDays();
  const pIds = new Set(ttxTeachingPeriods().map(p => p.id));
  const rows = teachers.map(s => {
    const n = timetableEntries.filter(e => e.staffId === s.id && days.includes(e.day) && pIds.has(e.period)).length;
    return `<li><button type="button" class="ttx-tchip" onclick="ttTeacherId='${escapeHtml(s.id)}'; renderTimetableBody();"><span class="sf-avatar" aria-hidden="true">${escapeHtml(staffInitials(s))}</span><b>${escapeHtml(((s.firstName || '') + ' ' + (s.lastName || '')).trim())}</b><small>${n} period${n === 1 ? '' : 's'}/week</small></button></li>`;
  }).join('');
  return `
    <section class="sf-card ttx-card">
      <h4>Pick a teacher</h4>
      <p class="ttx-note">See exactly which classes and periods are allotted to a teacher across the whole week.</p>
      ${teachers.length ? `<ul class="ttx-tgrid">${rows}</ul>` : ttxEmpty('No active staff yet')}
    </section>`;
}

function renderTeacherGrid(){
  const days = activeTimetableDays();
  const teaching = ttxTeachingPeriods();
  const pIds = new Set(teaching.map(p => p.id));
  const teacher = staffList.find(s => s.id === ttTeacherId);
  const mine = timetableEntries.filter(e => e.staffId === ttTeacherId && days.includes(e.day) && pIds.has(e.period));
  const slots = teaching.length * days.length;
  const clashMap = ttxClashMap();
  const clashCount = mine.filter(e => ttxIsClash(clashMap, e)).length;
  const classCount = new Set(mine.map(e => e.className + '|' + e.section)).size;
  const perDay = days.map(d => mine.filter(e => e.day === d).length);
  const maxDay = Math.max(1, ...perDay);

  const rows = timetablePeriods.map(p => {
    if(p.isBreak) return ttxBreakRow(p, days.length);
    return `<tr>${ttxRowHead(p)}${days.map(day => {
      const list = timetableEntries.filter(e => e.staffId === ttTeacherId && e.day === day && e.period === p.id);
      if(!list.length) return `<td><div class="ttx-cell ttx-cell--free"><span class="ttx-dash">Free</span></div></td>`;
      const clash = list.length > 1;
      return `<td><div class="ttx-stack">${list.map(e => `<div class="ttx-cell ttx-t${ttxTone(e.className)}${clash ? ' is-clash' : ''}">
        <b>${escapeHtml(e.className)} · ${escapeHtml(e.section)}</b><span>${escapeHtml(e.subject)}</span>${clash ? `<em>${ttxWarnIcon()}Clash</em>` : ''}</div>`).join('')}</div></td>`;
    }).join('')}</tr>`;
  }).join('');

  const clashLines = [];
  days.forEach(d => timetablePeriods.forEach(p => {
    const l = timetableEntries.filter(e => e.staffId === ttTeacherId && e.day === d && e.period === p.id);
    if(l.length > 1) clashLines.push(`<li><b>${escapeHtml(ttxShortDay(d))} · ${escapeHtml(p.label)}</b> booked in ${l.map(e => `${escapeHtml(e.className)} ${escapeHtml(e.section)} (${escapeHtml(e.subject)})`).join(' and ')}.</li>`);
  }));

  return `
    <section class="sf-card ttx-hero">
      <span class="sf-avatar" aria-hidden="true">${escapeHtml(teacher ? staffInitials(teacher) : '?')}</span>
      <div><b>${escapeHtml(teacher ? ttxStaffName(teacher.id) : 'Teacher')}</b><span>${mine.length} period${mine.length === 1 ? '' : 's'} allotted this week</span></div>
    </section>
    <section class="sf-kpis ttx-kpis">
      ${sfKpi('Periods / week', mine.length, 'plain', slots ? Math.round(mine.length / slots * 100) + '% of ' + slots + ' slots' : '')}
      ${sfKpi('Free periods', Math.max(0, slots - mine.length), 'plain', 'Available to cover')}
      ${sfKpi('Classes', classCount, 'plain', 'Class sections taught')}
      ${sfKpi('Clashes', clashCount, clashCount ? 'danger' : 'good', clashCount ? 'Double-booked' : 'None')}
    </section>
    ${clashLines.length ? `<div class="ttx-alert" role="alert">${ttxWarnIcon()}<div><b>Double-booked periods</b><ul>${clashLines.join('')}</ul></div></div>` : ''}
    <section class="sf-card ttx-card ttx-gridcard">
      <div class="ttx-cardhead"><h4>Weekly schedule</h4><span>Read only · edit from each class timetable</span></div>
      ${days.length && timetablePeriods.length ? `<div class="ttx-wrap"><table class="ttx-grid ttx-grid--teacher">${ttxHeadRow(days)}<tbody>${rows}</tbody>
        <tfoot><tr><th scope="row" class="ttx-time"><b>Load</b><span>periods / day</span></th>${perDay.map(n => `<td><div class="ttx-load"><b>${n}</b><i style="width:${Math.round(n / maxDay * 100)}%"></i></div></td>`).join('')}</tr></tfoot></table></div>` : ttxEmpty('No periods or days set up', 'Add them under Periods Setup.')}
    </section>
  `;
}

/* ---------------- Periods setup ---------------- */
function ttxPeriodTick(el){
  const row = el.closest('.ttx-prow');
  if(!row) return;
  const mins = ttxMinutes(row.querySelector('.tt-period-start').value, row.querySelector('.tt-period-end').value);
  const d = row.querySelector('.ttx-pdur');
  if(d) d.textContent = mins ? mins + ' min' : '—';
  row.classList.toggle('is-break', row.querySelector('.tt-period-break').checked);
}

function renderTimetablePeriodsTab(body){
  const canEditTt = canSub('timetable_periods', 'timetable', 'edit');
  if(!canEditTt){
    body.innerHTML = ttxEmpty('You don\'t have access to this section.');
    return;
  }
  const activeDays = activeTimetableDays();
  const teaching = timetablePeriods.filter(p => !p.isBreak);
  const breaks = timetablePeriods.filter(p => p.isBreak);
  const teachMin = teaching.reduce((n, p) => n + ttxMinutes(p.start, p.end), 0);
  const starts = timetablePeriods.map(p => p.start).filter(Boolean).sort();
  const ends = timetablePeriods.map(p => p.end).filter(Boolean).sort();
  const span = starts.length && ends.length ? `${starts[0]}–${ends[ends.length - 1]}` : '—';
  const hrs = Math.floor(teachMin / 60), mm = teachMin % 60;

  body.innerHTML = `
    <section class="sf-kpis ttx-kpis">
      ${sfKpi('Teaching periods', teaching.length, 'plain', 'Per day')}
      ${sfKpi('Breaks', breaks.length, 'plain', 'Recess, lunch…')}
      ${sfKpi('Days per week', activeDays.length, activeDays.length ? 'plain' : 'danger', activeDays.map(ttxShortDay).join(' · ') || 'Select at least one')}
      ${sfKpi('School day', span, 'plain', `${hrs}h ${mm}m teaching`)}
    </section>
    <p class="ttx-note">These periods, breaks and days appear on every class timetable and on the teacher view.</p>

    <section class="sf-card ttx-card">
      <h4>Days of the week</h4>
      <p class="ttx-note">Choose which days this timetable covers.</p>
      <div class="ttx-days" role="group" aria-label="Days of the week">
        ${ALL_WEEK_DAYS.map(d => {
          const on = activeDays.includes(d);
          return `<button type="button" class="ttx-day${on ? ' on' : ''}" aria-pressed="${on}" onclick="toggleTtDay('${d}')">${on ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>' : ''}${ttxShortDay(d)}</button>`;
        }).join('')}
      </div>
    </section>

    <section class="sf-card ttx-card">
      <div class="ttx-cardhead"><h4>Periods &amp; time slots</h4>${sfBtn('soft', 'plus', 'Add period', 'addTtPeriodRow()')}</div>
      <p class="ttx-note">Set a label and times for each period. Tick "Break" for recess or lunch.</p>
      <div class="ttx-plist">
        <div class="ttx-prow ttx-prow--head" aria-hidden="true"><span>#</span><span>Label</span><span>Start</span><span>End</span><span>Length</span><span>Break</span><span></span></div>
        ${timetablePeriods.map((p, i) => `<div class="ttx-prow${p.isBreak ? ' is-break' : ''}">
          <span class="ttx-pn">${i + 1}</span>
          <label class="ttx-pf ttx-pf--label"><span class="ttx-pcap">Label</span><input type="text" class="input tt-period-label" value="${escapeHtml(p.label)}"></label>
          <label class="ttx-pf"><span class="ttx-pcap">Start</span><input type="time" class="input tt-period-start" value="${escapeHtml(p.start)}" oninput="ttxPeriodTick(this)"></label>
          <label class="ttx-pf"><span class="ttx-pcap">End</span><input type="time" class="input tt-period-end" value="${escapeHtml(p.end)}" oninput="ttxPeriodTick(this)"></label>
          <span class="ttx-pf ttx-pf--dur"><span class="ttx-pcap">Length</span><span class="ttx-pdur">${ttxMinutes(p.start, p.end) ? ttxMinutes(p.start, p.end) + ' min' : '—'}</span></span>
          <label class="ttx-pf ttx-pf--break"><input type="checkbox" class="tt-period-break" title="Mark as a break" ${p.isBreak ? 'checked' : ''} onchange="ttxPeriodTick(this)"><span>Break</span></label>
          <span class="ttx-pf ttx-pf--del">${sfBtn('danger', '', 'Delete', `removeTtPeriodRow(${i})`)}</span>
        </div>`).join('')}
        ${timetablePeriods.length ? '' : ttxEmpty('No periods yet', 'Add your first period to get started.')}
      </div>
      <div class="ttx-actions">
        ${sfBtn('soft', 'plus', 'Add another period', 'addTtPeriodRow()')}
        ${sfBtn('primary', 'check', 'Save periods &amp; days', 'saveTtPeriods()')}
      </div>
    </section>
  `;
}
