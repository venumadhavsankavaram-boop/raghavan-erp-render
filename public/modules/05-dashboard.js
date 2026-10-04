function ringSVG(pct, color, size, stroke, trackColor){
    size = size || 108; stroke = stroke || 11;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, pct));
    const dash = (clamped/100) * c;
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${trackColor || 'var(--cream)'}" stroke-width="${stroke}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-dasharray="${dash} ${c}" stroke-linecap="round"/>
      </svg>
    `;
  }
  // Animates a number climbing from 0 to `target` inside `el` — used for the
  // Total Strength hero's headline count. Skips straight to the final value
  // for anyone who's asked their OS for reduced motion.
  function animateCountUp(el, target, duration){
    if(!el) return;
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      el.textContent = target.toLocaleString('en-IN');
      return;
    }
    duration = duration || 900;
    const startTime = performance.now();
    function tick(now){
      const p = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-IN');
      if(p < 1) requestAnimationFrame(tick);
      else el.textContent = target.toLocaleString('en-IN');
    }
    requestAnimationFrame(tick);
  }

  // Groups `payments` by calendar month (using each payment's ISO `date`)
  // and returns the last `count` months (oldest first) as
  // { key:'2026-03', label:'Mar', total:Number }. Always returns exactly
  // `count` entries, even for months with zero collections, so the trend
  // line never silently skips a quiet month.
  function monthlyFeeTrend(count){
    count = count || 6;
    const months = [];
    const now = new Date();
    for(let i = count - 1; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      months.push({ key, label: d.toLocaleString('en-IN', { month:'short' }), total: 0 });
    }
    const byKey = {};
    months.forEach(m => byKey[m.key] = m);
    payments.filter(pBookedInLedger).forEach(p => {
      if(!p.date) return;
      const key = String(p.date).slice(0,7);
      if(byKey[key]) byKey[key].total += Number(p.amount) || 0;
    });
    return months;
  }

  // A small dependency-free line/area chart in the same hand-drawn-SVG style
  // as ringSVG() above — no charting library needed for a handful of
  // monthly points. `points` is [{label, total}, ...]; renders a filled
  // trend line with a value label over each point, hover tooltips via
  // native <title>, and an empty-state message if every value is zero.
  function trendChartSVG(points, color){
    // padL/padR leave room for the centered value-label text at the first
    // and last points (text-anchor="middle" means half the label's width
    // sits to either side of its x — too little padding here clips it
    // against the SVG's own edge).
    const W = 680, H = 180, padL = 42, padR = 42, padT = 26, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const max = Math.max(1, ...points.map(p => p.total));
    const n = points.length;
    const stepX = n > 1 ? plotW / (n - 1) : 0;
    const coords = points.map((p, i) => ({
      x: padL + stepX * i,
      y: padT + plotH - (p.total / max) * plotH,
      ...p,
    }));
    const allZero = points.every(p => p.total === 0);
    const linePath = coords.map((c,i) => (i===0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
    const areaPath = linePath
      + ` L${coords[coords.length-1].x.toFixed(1)},${(padT+plotH).toFixed(1)}`
      + ` L${coords[0].x.toFixed(1)},${(padT+plotH).toFixed(1)} Z`;
    const gradId = 'trendGrad' + Math.round(Math.random()*1e6);
    return `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Monthly fee collection trend">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        ${allZero ? '' : `<path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>`}
        ${allZero ? '' : `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`}
        ${coords.map(c => `
          <circle class="trend-dot" cx="${c.x.toFixed(1)}" cy="${allZero ? (padT+plotH) : c.y.toFixed(1)}" r="4" fill="${color}" stroke="var(--white)" stroke-width="2">
            <title>${c.label}: ${fmtMoney(c.total)}</title>
          </circle>
          <text class="trend-value-label" x="${c.x.toFixed(1)}" y="${(allZero ? (padT+plotH) : c.y) - 12}" text-anchor="middle">${c.total > 0 ? fmtMoney(c.total) : ''}</text>
          <text class="trend-month-label" x="${c.x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${c.label}</text>
        `).join('')}
      </svg>
    `;
  }

  // Tiny inline trend indicator for a stat tile — same data shape as
  // monthlyFeeTrend()'s output, drawn as a thin filled sparkline with no
  // axes/labels (the card's own number is the label). Purely decorative
  // context ("this went up over the term"), so it has no hover layer of
  // its own — the full trend panel below already provides one.
  function sparklineSVG(points, color){
    const W = 240, H = 34, pad = 3;
    const vals = points.map(p => p.total);
    const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
    const range = (max - min) || 1;
    const n = points.length;
    const stepX = n > 1 ? (W - pad*2) / (n - 1) : 0;
    const coords = points.map((p,i) => ({
      x: pad + stepX * i,
      y: pad + (H - pad*2) * (1 - (p.total - min) / range),
    }));
    const line = coords.map((c,i) => (i===0?'M':'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
    const area = line + ` L${coords[coords.length-1].x.toFixed(1)},${H} L${coords[0].x.toFixed(1)},${H} Z`;
    const gradId = 'sparkGrad' + Math.round(Math.random()*1e6);
    return `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${area}" fill="url(#${gradId})" stroke="none"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  // Payment ids are 'pay_<millis>_<key>' — the exact moment the entry was
  // recorded, used wherever payments need ordering by true entry time
  // rather than just their (user-editable, date-only) `date` field.
  function paymentEntryMillis(p){
    const m = String(p.id||'').match(/^pay_(\d+)_/);
    return m ? Number(m[1]) : 0;
  }

  // Donut/pie chart in the same hand-drawn-SVG house style as ringSVG() —
  // `segments` is [{label, value, color}], drawn in the order given (never
  // re-sorted/re-colored by value, so a category's slice always keeps its
  // own fixed color — see CAT_COLORS). A thin surface-colored gap separates
  // adjacent slices, and each slice carries a native <title> tooltip.
  function donutChartSVG(segments, size, stroke){
    size = size || 176; stroke = stroke || 30;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const total = segments.reduce((s,seg) => s + Math.max(0, seg.value), 0);
    const gapPx = 3;
    if(total <= 0){
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--cream)" stroke-width="${stroke}"/>
      </svg>`;
    }
    let running = 0;
    const arcs = segments.filter(seg => seg.value > 0).map(seg => {
      const segLen = (seg.value / total) * c;
      const dash = Math.max(0, segLen - gapPx);
      const dashOffset = -(running + gapPx/2);
      running += segLen;
      return `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"
        stroke-dasharray="${dash.toFixed(2)} ${(c-dash).toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" stroke-linecap="butt">
        <title>${seg.label}: ${fmtMoney(seg.value)} (${Math.round((seg.value/total)*100)}%)</title>
      </circle>`;
    }).join('');
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);" role="img" aria-label="Collected amount by category">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--cream)" stroke-width="${stroke}"/>
        ${arcs}
      </svg>
    `;
  }

  // Rounds an axis max up to a clean human step (1/2/2.5/5/10 ×10^n) so
  // gridline labels read as 0/25/50/75/100 rather than an arbitrary
  // fraction of the raw data max. Mirrors the same fix already validated
  // in the design-preview build's computeTicks().
  function niceAxisMax(rawMax, targetSteps){
    targetSteps = targetSteps || 4;
    if(rawMax <= 0) return { max: targetSteps, step: 1 };
    const rough = rawMax / targetSteps;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    return { max: step * targetSteps, step };
  }

  // Average daily attendance % per month for students and staff, over the
  // last `count` months — same zero-filled-months shape as
  // monthlyFeeTrend(), but two series instead of one. "Present %" per
  // month = (Present days marked) / (Present + Absent days marked) × 100;
  // days with no record at all (holiday, not yet marked) are excluded
  // rather than counted as absent, since attendanceRecords only stores
  // rows that were actually marked.
  function monthlyAttendanceTrend(count){
    count = count || 6;
    const months = [];
    const now = new Date();
    for(let i = count - 1; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      months.push({ key, label: d.toLocaleString('en-IN', { month:'short' }), studentPresent:0, studentTotal:0, staffPresent:0, staffTotal:0 });
    }
    const byKey = {};
    months.forEach(m => byKey[m.key] = m);
    attendanceRecords.forEach(r => {
      if(!r.date || (r.status !== 'Present' && r.status !== 'Absent')) return;
      const m = byKey[String(r.date).slice(0,7)];
      if(!m) return;
      const w = attSessionWeight(r);
      m.studentTotal += w;
      if(r.status === 'Present') m.studentPresent += w;
    });
    staffAttendanceRecords.forEach(r => {
      if(!r.date || (r.status !== 'Present' && r.status !== 'Absent')) return;
      const m = byKey[String(r.date).slice(0,7)];
      if(!m) return;
      const w = attSessionWeight(r);
      m.staffTotal += w;
      if(r.status === 'Present') m.staffPresent += w;
    });
    return months.map(m => ({
      key: m.key, label: m.label,
      students: m.studentTotal ? Math.round((m.studentPresent / m.studentTotal) * 1000) / 10 : null,
      staff: m.staffTotal ? Math.round((m.staffPresent / m.staffTotal) * 1000) / 10 : null,
    }));
  }

  // Two-series line chart (Students vs Staff attendance %), in the same
  // hand-drawn-SVG house style as trendChartSVG() above. Y axis is fixed
  // 0-100% with clean 25%-step gridlines (niceAxisMax); a `null` value
  // (no attendance marked that month) breaks the line rather than
  // plotting a false zero. Colors are pre-validated (see dataviz palette
  // check run earlier this session) for contrast on both card surfaces.
  function attendanceTrendSVG(points, colorStudents, colorStaff){
    const W = 680, H = 200, padL = 38, padR = 20, padT = 16, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const { max, step } = niceAxisMax(100, 4); // fixed 0–100% axis, clean 25% steps
    const n = points.length;
    const stepX = n > 1 ? plotW / (n - 1) : 0;
    const yFor = v => padT + plotH - (v / max) * plotH;
    const hasAny = points.some(p => p.students != null || p.staff != null);
    function seriesPath(key){
      let d = '', open = false;
      points.forEach((p, i) => {
        const x = padL + stepX * i, v = p[key];
        if(v == null){ open = false; return; }
        d += (open ? 'L' : 'M') + x.toFixed(1) + ',' + yFor(v).toFixed(1) + ' ';
        open = true;
      });
      return d.trim();
    }
    const gridLines = [];
    for(let g = 0; g <= max; g += step){
      const y = yFor(g);
      gridLines.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`);
      gridLines.push(`<text class="trend-month-label" x="${padL-8}" y="${(y+3).toFixed(1)}" text-anchor="end">${g}%</text>`);
    }
    function dots(key, color){
      return points.map((p,i) => {
        const v = p[key];
        if(v == null) return '';
        const x = padL + stepX * i;
        return `<circle class="trend-dot" cx="${x.toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="4" fill="${color}" stroke="var(--white)" stroke-width="2"><title>${p.label} — ${key === 'students' ? 'Students' : 'Staff'}: ${v}%</title></circle>`;
      }).join('');
    }
    return `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Monthly attendance trend, students and staff">
        ${gridLines.join('')}
        ${hasAny ? `<path d="${seriesPath('students')}" fill="none" stroke="${colorStudents}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${hasAny ? `<path d="${seriesPath('staff')}" fill="none" stroke="${colorStaff}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1,5"/>` : ''}
        ${dots('students', colorStudents)}
        ${dots('staff', colorStaff)}
        ${points.map((p,i) => `<text class="trend-month-label" x="${(padL + stepX*i).toFixed(1)}" y="${H-6}" text-anchor="middle">${p.label}</text>`).join('')}
      </svg>
    `;
  }

  async function renderDashboard(){
    // Dashboard summary cards + trend charts read payments, attendanceRecords
    // and staffAttendanceRecords. These must always reflect the latest data
    // (a payment just recorded in Manage Fee, attendance just marked, etc.),
    // so we force a fresh re-fetch every time the Dashboard renders instead
    // of reusing whatever was cached the first time any tab touched these
    // keys — same fix as the earlier Staff Activity stale-data bug.
    await Promise.all([
      reloadDataset('payments', loadPaymentsData),
      reloadDataset('attendanceRecords', loadAttendanceRecordsData),
      reloadDataset('staffAttendanceRecords', loadStaffAttendance),
      // studentExtraFees/studentDiscounts (loaded together by loadFeeExtras)
      // only ever got fetched once at login — fine for most tabs, but the
      // Old Balance card and the discount totals below need this session's
      // latest figures every time the Dashboard renders, same reasoning as
      // the three reloads above.
      reloadDataset('feeExtras', loadFeeExtras),
      // The "Stock" category here is a per-class structural fee (like Tuition)
      // that this school has never actually configured a rate for in Fee
      // Structure Setup — so it is genuinely ₹0 with zero payments, which is
      // what made the Stock card look broken/empty. The real stock movement
      // (uniforms, books, etc.) happens through the separate Inventory module
      // and is recorded as inventorySales, not as a 'stock'-category payment.
      // Loaded fresh here so the Stock card/drill-down can surface that real
      // activity instead of just showing zero.
      reloadDataset('inventory', loadInventory),
    ]);
    const el = document.getElementById('view-dashboard');
    const { perCat, totals } = computeFinance();

    // All three breakdowns below are "current strength" snapshots, same as
    // the totalActive tile further down — so, like it, they only count
    // Active students. An Inactive/departed student still exists in the
    // students array (their history is kept for certificates, past fee
    // records, etc.) but shouldn't inflate a class/section's current
    // headcount or gender split until they're reactivated.
    const genderCounts = { Male:0, Female:0, Unspecified:0 };
    students.forEach(s => {
      if(!isActive(s)) return;
      if(s.gender === 'Male') genderCounts.Male++;
      else if(s.gender === 'Female') genderCounts.Female++;
      else genderCounts.Unspecified++;
    });
    const secCounts = {};
    SECTIONS.forEach(s => secCounts[s] = 0);
    students.forEach(s => { if(isActive(s) && secCounts[s.section] !== undefined) secCounts[s.section]++; });
    const classCounts = {};
    CLASS_LEVELS.forEach(c => classCounts[c] = 0);
    students.forEach(s => { if(isActive(s) && classCounts[s.className] !== undefined) classCounts[s.className]++; });
    const maxClassCount = Math.max(1, ...Object.values(classCounts));

    // Payment ids are 'pay_<millis>_<key>' — the exact moment the entry was
    // recorded. Sorting by the `date` field alone (the old behavior) can't
    // tell today's 3rd payment from today's 1st apart, and a backdated entry
    // (date set to an earlier day, entered just now) would sort below
    // same/later-dated rows even though it's the most recently recorded
    // transaction — this is what "latest transactions not shown" was about.
    // Date stays the primary sort (so the list still reads chronologically);
    // the embedded timestamp breaks ties within the same date. Voided
    // payments are excluded — a reversed payment isn't a "latest transaction".
    const recentPayments = [...payments]
      .filter(p => !p.voided)
      .sort((a,b) => {
        const byDate = (b.date||'').localeCompare(a.date||'');
        return byDate !== 0 ? byDate : paymentEntryMillis(b) - paymentEntryMillis(a);
      })
      .slice(0,8);
    const nowStr = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

    const feeTrend = monthlyFeeTrend(6);
    const feeTrendTotal = feeTrend.reduce((s,m) => s + m.total, 0);
    const feeTrendPrev = feeTrend[feeTrend.length - 2] ? feeTrend[feeTrend.length - 2].total : 0;
    const feeTrendLast = feeTrend[feeTrend.length - 1] ? feeTrend[feeTrend.length - 1].total : 0;
    const feeTrendDeltaPct = feeTrendPrev > 0 ? Math.round(((feeTrendLast - feeTrendPrev) / feeTrendPrev) * 100) : null;

    const attTrend = monthlyAttendanceTrend(6);
    const attHasData = attTrend.some(m => m.students != null || m.staff != null);
    const lastAtt = [...attTrend].reverse().find(m => m.students != null);
    const lastStaffAtt = [...attTrend].reverse().find(m => m.staff != null);

    const QUICK_ACCESS = [
      { label:'Manage Student', view:'admissions', rgb:'209,16,115', icon:'<path d="M12 5 L21 9 L12 13 L3 9 Z"/><path d="M7 11 V16 C7 17.5 9.2 19 12 19 C14.8 19 17 17.5 17 16 V11"/>' },
      { label:'Manage Fee', view:'managefee', rgb:'24,143,134', icon:'<rect x="3" y="5.5" width="18" height="13" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="6.5" y1="14.5" x2="10.5" y2="14.5"/>' },
      { label:'Attendance', view:'attendance', rgb:'203,154,46', icon:'<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8.5 15 L11 17.5 L16 12.5"/>' },
      { label:'Staff Directory', view:'staffdirectory', rgb:'33,26,78', icon:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19 C3.5 15.2 6 13.3 9 13.3 C12 13.3 14.5 15.2 14.5 19"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 13.5 C18 13.7 20.5 15.3 20.5 19"/>' },
      { label:'Timetable', view:'timetable', rgb:'209,16,115', icon:'<circle cx="12" cy="12" r="8.5"/><line x1="12" y1="12" x2="12" y2="7.5"/><line x1="12" y1="12" x2="15.5" y2="13.5"/>' },
      { label:'Reports', view:'reports', rgb:'24,143,134', icon:'<line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="7"/><line x1="19" y1="20" x2="19" y2="15"/><line x1="3" y1="20" x2="21" y2="20"/>' },
      { label:'Inventory', view:'inventory', rgb:'33,26,78', icon:'<path d="M3 7.5 L12 3 L21 7.5 L12 12 Z"/><path d="M3 7.5 V16.5 L12 21 L21 16.5 V7.5"/><line x1="12" y1="12" x2="12" y2="21"/>' },
    ];

    const ICONS = {
      expected: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10H21" stroke="currentColor" stroke-width="2"/><path d="M7 3H17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
      collected: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8 12.5L10.5 15L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      receivable: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7V12L15.5 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      discount: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3H19V10L10 19L3 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="14.5" cy="8.5" r="1.4" fill="currentColor"/></svg>`,
      extra: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3V21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 7.5C7 6 8.8 5 12 5C15.2 5 17 6 17 7.5C17 10.5 7 10 7 13.5C7 15 8.8 16 12 16C15.2 16 17 15 17 13.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
      oldbalance: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="2"/><path d="M12 9V13L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 3L5 6M16 3L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    };

    // "Old Balance" = dues carried forward from a previous class/year. The
    // Promote & Transfer carry-forward option stores these as studentExtraFees
    // records named from CARRYFORWARD_LABELS (e.g. "Previous Year Dues"), but
    // this school has also been recording the same concept by hand as a
    // free-text Extra Fee literally named "Old Balance" (and similar wording)
    // well before that automated flow existed — real collected money that a
    // strict match against CARRYFORWARD_LABELS alone would miss entirely.
    // Matching the pattern below alongside the exact labels catches both.
    const carryForwardNames = new Set(Object.values(CARRYFORWARD_LABELS));
    const oldBalanceNamePattern = /old\s*balance|previous\s*year|carried\s*forward/i;
    const oldBalanceEntries = studentExtraFees.filter(e => carryForwardNames.has(e.name) || oldBalanceNamePattern.test(e.name||''));
    const oldBalanceExpected = oldBalanceEntries.reduce((sum,e) => sum + (Number(e.amount)||0), 0);
    const oldBalanceCollected = oldBalanceEntries.reduce((sum,e) => {
      const amt = Number(e.amount) || 0;
      const paid = e.paidAmount != null ? Number(e.paidAmount)||0 : (e.paid ? amt : 0);
      return sum + Math.min(paid, amt);
    }, 0);
    const oldBalanceReceivable = Math.max(0, oldBalanceExpected - oldBalanceCollected);

    // Dashboard's main totals (expected/collected/receivable/discount) only
    // ever tracked the four per-class fee categories (Fee/Bus/Stock/Hostel) —
    // a one-off "Extra Fee" like Admission Fee, Inventory sales, or a fine
    // is a different kind of record with no fixed per-class rate, and never
    // got counted here, even though it's real money collected and already
    // shows correctly in Accounting and on each student's own fee page. This
    // card surfaces that money on the Dashboard too, instead of only being
    // visible via Accounting → Overview or Fees → Recent Payment History.
    const extraFeesCollected = payments
      .filter(p => p.category === 'extra' && !p.voided)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // The real stock/inventory movement (uniforms, books, stationery sold to
    // students) lives in the Inventory module's own sales log, not as
    // 'stock'-category payments — see the reloadDataset comment above. Used
    // to give the By-Category "Stock" card something real to show when, as
    // here, no per-class Stock fee rate has ever been configured.
    const stockInventoryRevenue = inventorySales.reduce((sum,s) => sum + (Number(s.totalAmount)||0), 0)
      - inventoryReturns.reduce((sum,r) => sum + (Number(r.refundAmount)||0), 0);
    const stockInventoryCollected = inventorySales.reduce((sum,s) => sum + (Number(s.paidAmount)||0), 0)
      - inventoryReturns.reduce((sum,r) => sum + (Number(r.cashRefunded)||0), 0);
    const stockInventorySaleCount = inventorySales.length;
    // For the "By Category" donut/legend only: Stock's real contribution is its
    // Inventory Sales collections (the Stock fee category itself is unconfigured
    // and always 0). This keeps perCat/totals — used everywhere else for the
    // fee-structure math — untouched, while making Stock actually show up here.
    const catChartCollected = (c) => perCat[c].collected + (c === 'stock' ? stockInventoryCollected : 0);
    const chartTotalCollected = totals.collected + stockInventoryCollected;

    const totalActive = students.filter(s => (s.status||'Active').toString().trim().toLowerCase() === 'active').length;
    const strengthActivePct = students.length ? Math.round((totalActive / students.length) * 100) : 100;

    el.innerHTML = `
      <div class="topbar">
        <div>
          <h1>Dashboard</h1>
          <p>Overall analytics and insights, updated live from your ERP data.</p>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
          <span class="ay-badge" title="Current academic year — change it from Initial Setup → Academic Year">AY ${currentAcademicYearValue}</span>
          <div class="live-badge"><span class="live-dot"></span> Last updated ${nowStr}</div>
        </div>
      </div>

      <div class="strength-hero-wrap">
        <button type="button" class="strength-hero" onclick="switchView('admissions')" title="Go to Manage Student">
          <span class="sh-glow sh-glow-a"></span>
          <span class="sh-glow sh-glow-b"></span>
          <span class="sh-watermark"><svg width="120" height="120" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 8l10 5 8-4.2V16h2V8L12 3Z" fill="#fff"/><path d="M6 11v4.2C6 17.9 8.7 20 12 20s6-2.1 6-4.8V11" stroke="#fff" stroke-width="1.6" fill="none"/></svg></span>
          <div class="sh-ring-wrap">
            ${ringSVG(strengthActivePct, '#fff', 108, 9, 'rgba(255,255,255,0.16)')}
            <div class="sh-ring-center">
              <span class="sh-num" data-strength-num="1">0</span>
              <span class="sh-ring-tag">${strengthActivePct}% Active</span>
            </div>
          </div>
          <div class="sh-info">
            <span class="sh-eyebrow">Live Headcount</span>
            <span class="sh-label">Total Strength</span>
            <div class="sh-chips">
              <span class="sh-chip"><i style="background:var(--gold-soft)"></i>Boys <b>${genderCounts.Male}</b></span>
              <span class="sh-chip"><i style="background:var(--magenta)"></i>Girls <b>${genderCounts.Female}</b></span>
              <span class="sh-chip"><i style="background:var(--teal)"></i>${students.length} Enrolled Total</span>
            </div>
          </div>
          <span class="sh-cta">
            Manage Students
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </button>
      </div>

      <div id="dashBanner"></div>

      <div class="dash-section-title" style="margin-top:0;">
        <div><span class="eyebrow-sm">Shortcuts</span><h3>Quick Access</h3></div>
      </div>
      <div class="qa-grid">
        ${QUICK_ACCESS.map(q => `
          <button class="qa-tile" style="--qa-rgb:${q.rgb};" onclick="switchView('${q.view}')">
            <div class="qa-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${q.icon}</svg></div>
            <div class="qa-label">${q.label}</div>
          </button>
        `).join('')}
      </div>

      <div class="dash-hero-stats">
        <div class="dh-card expected">
          <div class="dh-icon">${ICONS.expected}</div>
          <div class="dh-label">Total Expected Amount</div>
          <div class="dh-amount">${fmtMoney(totals.expected)}</div>
          <div class="dh-sub">Fee + Bus Fee + Stock + Hostel</div>
        </div>
        <div class="dh-card collected">
          <div class="dh-icon">${ICONS.collected}</div>
          <div class="dh-label">Total Fee Collected</div>
          <div class="dh-amount">${fmtMoney(totals.collected)}<span class="dh-pct">${totals.pct}%</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${Math.min(totals.pct,100)}%"></div></div>
          ${feeTrendTotal > 0 ? `<div class="dh-spark">${sparklineSVG(feeTrend, 'var(--teal)')}</div>` : ''}
        </div>
        <div class="dh-card receivable">
          <div class="dh-icon">${ICONS.receivable}</div>
          <div class="dh-label">Total Receivables</div>
          <div class="dh-amount">${fmtMoney(totals.receivable)}</div>
          <div class="dh-sub">Still due across all categories</div>
        </div>
        <div class="dh-card discount">
          <div class="dh-icon">${ICONS.discount}</div>
          <div class="dh-label">Total Discount Allowed</div>
          <div class="dh-amount">${fmtMoney(totals.discount)}</div>
          <div class="dh-sub">Fee + Bus Fee + Hostel</div>
        </div>
        <div class="dh-card extra">
          <div class="dh-icon">${ICONS.extra}</div>
          <div class="dh-label">Extra Fees Collected</div>
          <div class="dh-amount">${fmtMoney(extraFeesCollected)}</div>
          <div class="dh-sub">Admission Fee, Inventory, Fines, etc.</div>
        </div>
        <div class="dh-card oldbalance">
          <div class="dh-icon">${ICONS.oldbalance}</div>
          <div class="dh-label">Old Balance (Previous Year Dues)</div>
          <div class="dh-amount">${fmtMoney(oldBalanceReceivable)}</div>
          <div class="dh-sub">${fmtMoney(oldBalanceCollected)} collected of ${fmtMoney(oldBalanceExpected)} carried forward</div>
        </div>
      </div>

      <div class="dash-section-title">
        <div><span class="eyebrow-sm">Collection Overview</span><h3>Where the Money Stands</h3></div>
      </div>
      <div class="overview-panel">
        <div class="overview-ring">
          ${ringSVG(totals.pct, 'var(--teal)', 132, 13)}
          <div class="overview-ring-label"><b>${totals.pct}%</b><span>Collected</span></div>
        </div>
        <div class="overview-legend">
          <div class="ov-row"><span class="ov-swatch" style="background:var(--teal);"></span>Collected<b>${fmtMoney(totals.collected)}</b></div>
          <div class="ov-row"><span class="ov-swatch" style="background:var(--magenta);"></span>Receivable<b>${fmtMoney(totals.receivable)}</b></div>
          <div class="ov-row"><span class="ov-swatch" style="background:var(--brand-navy);"></span>Discount Allowed<b>${fmtMoney(totals.discount)}</b></div>
          <div class="ov-row total"><span class="ov-swatch" style="background:var(--gold);"></span>Total Expected<b>${fmtMoney(totals.expected)}</b></div>
        </div>
      </div>

      <div class="dash-section-title">
        <div><span class="eyebrow-sm">By Category</span><h3>Fee, Bus, Stock &amp; Hostel Breakdown</h3></div>
      </div>
      <div class="cat-donut-panel">
        <div class="cat-donut-wrap">${donutChartSVG(Object.keys(CATS).map(c => ({ label: CATS[c], value: catChartCollected(c), color: CAT_COLORS[c] })))}</div>
        <div class="cat-donut-legend">
          <div class="cat-donut-legend-title">Collected, by Category</div>
          ${Object.keys(CATS).map(c => {
            const sharePct = chartTotalCollected > 0 ? Math.round((catChartCollected(c) / chartTotalCollected) * 100) : 0;
            return `<div class="ov-row"><span class="ov-swatch" style="background:${CAT_COLORS[c]};"></span>${CATS[c]}<b>${fmtMoney(catChartCollected(c))}<span style="color:var(--ink-soft); font-weight:500; margin-left:6px;">${sharePct}%</span></b></div>`;
          }).join('')}
          <div style="font-size:0.72rem; color:var(--ink-soft); margin-top:8px;">Stock includes Inventory Sales collections</div>
        </div>
      </div>
      <div class="cat-grid">
        ${Object.keys(CATS).map(c => {
          const pctC = perCat[c].expected > 0 ? Math.round((perCat[c].collected / perCat[c].expected) * 100) : 0;
          const feeTxnCount = payments.filter(p => p.category===c && !p.voided).length;
          const txnCount = c === 'stock' ? feeTxnCount + stockInventorySaleCount : feeTxnCount;
          return `
          <button type="button" class="cat-card" onclick="openCategoryTransactions('${c}')" title="View ${CATS[c]} transactions">
            <h4><span class="cat-swatch" style="background:${CAT_COLORS[c]}"></span>${CATS[c]}</h4>
            <div class="cat-row"><span>Expected</span><b>${fmtMoney(perCat[c].expected)}</b></div>
            ${c !== 'stock' ? `<div class="cat-row"><span>Discount</span><b>${fmtMoney(perCat[c].discount)}</b></div>` : ``}
            <div class="cat-row"><span>Collected</span><b>${fmtMoney(perCat[c].collected)}</b></div>
            <div class="cat-row"><span>Receivable</span><b>${fmtMoney(perCat[c].receivable)}</b></div>
            ${c === 'stock' ? `<div class="cat-row"><span>Inventory Sales</span><b>${fmtMoney(stockInventoryRevenue)}</b></div>` : ``}
            <div class="progress-track" style="margin-top:10px;"><div class="progress-fill" style="width:${Math.min(pctC,100)}%; background:${CAT_COLORS[c]};"></div></div>
            <div class="cat-pct">${pctC}% collected</div>
            <div class="cat-card-cta">View ${txnCount} transaction${txnCount===1?'':'s'} →</div>
          </button>
        `;
        }).join('')}
      </div>
      <div id="dashCatTxnModalWrap"></div>

      <div class="dash-section-title">
        <div><span class="eyebrow-sm">Students</span><h3>Student Demographics</h3></div>
      </div>
      <div class="demo-grid">
        <div class="demo-card">
          <h4>Enrollment by Class</h4>
          ${CLASS_LEVELS.map(c => `
            <div class="class-bar-row">
              <div class="class-bar-label">${c}</div>
              <div class="class-bar-track"><div class="class-bar-fill" style="width:${(classCounts[c]/maxClassCount)*100}%"></div></div>
              <div class="class-bar-count">${classCounts[c]}</div>
            </div>
          `).join('')}
        </div>
        <div class="demo-card">
          <h4>Gender &amp; Section Split</h4>
          <div class="split-row">
            <div class="split-box"><b>${genderCounts.Male}</b><span>Boys</span></div>
            <div class="split-box"><b>${genderCounts.Female}</b><span>Girls</span></div>
          </div>
          <div class="split-row">
            ${SECTIONS.map(s => `<div class="split-box"><b>${secCounts[s]||0}</b><span>Section ${s}</span></div>`).join('')}
          </div>
          <div class="split-row">
            <div class="split-box" style="flex:1;"><b>${students.length}</b><span>Total Enrolled</span></div>
          </div>
        </div>
        <div class="demo-card">
          <h4 style="margin-bottom:10px;">Caste Category Split</h4>
          <div style="display:flex; gap:8px; margin-bottom:14px;">
            <select id="casteClassSel" onchange="onCasteFilterChange()" style="flex:1; font-size:0.78rem; padding:7px 8px; border-radius:8px; border:1.5px solid var(--border);">
              <option value="">All Classes</option>
              ${CLASS_LEVELS.map(c => `<option value="${c}" ${casteFilterClass===c?'selected':''}>${c}</option>`).join('')}
            </select>
            <select id="casteGenderSel" onchange="onCasteFilterChange()" style="flex:1; font-size:0.78rem; padding:7px 8px; border-radius:8px; border:1.5px solid var(--border);">
              <option value="">All Genders</option>
              <option value="Male" ${casteFilterGender==='Male'?'selected':''}>Boys</option>
              <option value="Female" ${casteFilterGender==='Female'?'selected':''}>Girls</option>
            </select>
          </div>
          <div id="casteCardBody"></div>
        </div>
      </div>

      <div class="trend-panel">
        <div class="trend-panel-head">
          <div>
            <span class="eyebrow-sm">Trend</span>
            <h4>Fee Collection — Last 6 Months</h4>
            <div class="trend-panel-sub">Total collected across all categories, grouped by month.</div>
          </div>
          <div class="trend-total-wrap">
            <span class="trend-total">${fmtMoney(feeTrendTotal)}${feeTrendDeltaPct === null ? '' : `<span class="trend-delta ${feeTrendDeltaPct >= 0 ? 'up' : 'down'}">${feeTrendDeltaPct >= 0 ? '▲' : '▼'} ${Math.abs(feeTrendDeltaPct)}%</span>`}</span>
            <span class="trend-total-label">6-month total ${feeTrendDeltaPct === null ? '' : 'vs. prior month'}</span>
          </div>
        </div>
        ${feeTrendTotal > 0
          ? `<div class="trend-svg-wrap">${trendChartSVG(feeTrend, 'var(--teal)')}</div>`
          : `<div class="trend-empty">No payments recorded yet — collections will start appearing here once fees are collected.</div>`
        }
      </div>

      <div class="trend-panel">
        <div class="trend-panel-head">
          <div>
            <span class="eyebrow-sm">Trend</span>
            <h4>Attendance — Last 6 Months</h4>
            <div class="trend-panel-sub">Average daily attendance, students vs. staff, from marked records.</div>
          </div>
          <div class="trend-total-wrap">
            <span class="trend-total">${lastAtt ? lastAtt.students + '%' : '—'}</span>
            <span class="trend-total-label">Students, ${lastAtt ? lastAtt.label : 'latest'}</span>
          </div>
        </div>
        ${attHasData
          ? `<div class="trend-svg-wrap">${attendanceTrendSVG(attTrend, 'var(--teal)', 'var(--gold)')}</div>
             <div class="trend-legend">
               <span class="trend-legend-item"><span class="trend-legend-swatch" style="background:var(--teal);"></span>Students${lastAtt ? ` (${lastAtt.students}% in ${lastAtt.label})` : ''}</span>
               <span class="trend-legend-item"><span class="trend-legend-swatch" style="background-image:repeating-linear-gradient(90deg, var(--gold) 0 3px, transparent 3px 6px);"></span>Staff${lastStaffAtt ? ` (${lastStaffAtt.staff}% in ${lastStaffAtt.label})` : ''}</span>
             </div>
             <details style="margin-top:14px;">
               <summary class="settings-link" style="display:inline-block; cursor:pointer;">View data</summary>
               <div class="table-wrap" style="margin-top:10px; box-shadow:none; border:1px solid var(--border);">
                 <table>
                   <thead><tr><th>Month</th><th>Students</th><th>Staff</th></tr></thead>
                   <tbody>
                     ${attTrend.map(m => `<tr><td>${m.label}</td><td>${m.students == null ? '—' : m.students + '%'}</td><td>${m.staff == null ? '—' : m.staff + '%'}</td></tr>`).join('')}
                   </tbody>
                 </table>
               </div>
             </details>`
          : `<div class="trend-empty">No attendance marked yet — this chart fills in once daily attendance is recorded for students or staff.</div>`
        }
      </div>

      <div class="dash-section-title">
        <div><span class="eyebrow-sm">Payments</span><h3>Recent Payment History</h3></div>
        <span style="font-size:0.8rem; color:var(--ink-soft);">${payments.length} total record${payments.length===1?'':'s'}</span>
      </div>
      <div class="pay-table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Student</th><th>Category</th><th>Mode</th><th>Amount</th><th>Discount</th><th></th></tr>
          </thead>
          <tbody>
            ${recentPayments.length ? recentPayments.map(p => `
              <tr>
                <td>${p.date || '—'}</td>
                <td class="name-cell">${p.studentName}</td>
                <td><span class="pill">${feeLabelFor(p)}</span></td>
                <td>${p.mode || '—'}</td>
                <td>${fmtMoney(p.amount)}</td>
                <td>${fmtMoney(p.discount)}</td>
                <td>${canSub('managefee_collection','managefee','print') ? `<button class="btn-edit-text" onclick="printReceipt('${p.id}')">Print</button>` : ''}</td>
              </tr>
            `).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No payments recorded yet</b></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    if(usingLocalFallback){
      document.getElementById('dashBanner').innerHTML =
        '<div style="background:#FFF3E0; border:1.5px solid #E8C874; color:#8a6a1f; padding:12px 18px; border-radius:12px; font-size:0.83rem; margin-bottom:22px;">⚠ Could not reach the server on the last request — some figures below may be a locally cached copy from this device, not the live database. Refresh the page; if this keeps happening, check your internet connection or contact support.</div>';
    }
    animateCountUp(document.querySelector('.sh-num'), totalActive);
    renderCasteBody();
  }

  // Drill-down for a "By Category" card — the cards used to be static
  // numbers only, with no way to see which actual payments made up a
  // category's Collected figure. Reuses the same house-style modal pattern
  // as Inventory's "Return to Vendor" dialog.
  function openCategoryTransactions(cat){
    const wrap = document.getElementById('dashCatTxnModalWrap');
    if(!wrap) return;
    const rows = payments
      .filter(p => p.category === cat && !p.voided)
      .sort((a,b) => paymentEntryMillis(b) - paymentEntryMillis(a));

    // "Stock" has two unrelated meanings in this app: the per-class Stock FEE
    // (a payments category, like Tuition) and actual Inventory/stock-item
    // sales (uniforms, books, etc.), logged separately as inventorySales.
    // This school has never configured a Stock fee rate, so the fee side is
    // always empty here — showing the real inventory sales alongside it is
    // what makes this view actually useful for "Stock".
    const invRows = cat === 'stock'
      ? inventorySales.slice().sort((a,b) => String(b.id).localeCompare(String(a.id)))
      : [];

    const feeSection = `
      <div class="table-wrap" style="box-shadow:none; border:1px solid var(--border);">
        <table>
          <thead><tr><th>Date</th><th>Student</th><th>Mode</th><th>Amount</th>${cat!=='stock'?'<th>Discount</th>':''}<th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(p => `
              <tr>
                <td>${p.date || '—'}</td>
                <td class="name-cell">${p.studentName}</td>
                <td>${p.mode || '—'}</td>
                <td>${fmtMoney(p.amount)}</td>
                ${cat!=='stock'?`<td>${fmtMoney(p.discount)}</td>`:''}
                <td>${canSub('managefee_collection','managefee','print') ? `<button class="btn-edit-text" onclick="printReceipt('${p.id}')">Print</button>` : ''}</td>
              </tr>
            `).join('') : `<tr><td colspan="6"><div class="empty-state"><b>No ${CATS[cat]} fee payments recorded yet${cat==='stock'?' (no per-class Stock fee rate is configured)':''}</b></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    const invSection = cat !== 'stock' ? '' : `
      <div class="dash-section-title" style="margin:22px 0 12px;"><div><h3 style="font-size:0.95rem;">Inventory / Stock Sales</h3></div></div>
      <div class="table-wrap" style="box-shadow:none; border:1px solid var(--border);">
        <table>
          <thead><tr><th>Date</th><th>Item</th><th>Buyer</th><th>Qty</th><th>Amount</th><th>Collected</th></tr></thead>
          <tbody>
            ${invRows.length ? invRows.map(s => `
              <tr>
                <td>${s.date || '—'}</td>
                <td class="name-cell">${s.itemName}</td>
                <td>${s.buyerName || '—'}</td>
                <td>${s.qty}</td>
                <td>${fmtMoney(s.totalAmount)}</td>
                <td>${fmtMoney(s.paidAmount)}</td>
              </tr>
            `).join('') : `<tr><td colspan="6"><div class="empty-state"><b>No inventory sales recorded yet</b></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    const totalCount = rows.length + invRows.length;
    wrap.innerHTML = `
      <div style="position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:999; padding:20px;" onclick="if(event.target===this) closeCategoryTransactions();">
        <div class="profile-card" style="width:100%; max-width:860px; max-height:82vh; overflow:auto;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:4px;">
            <h4><span class="cat-swatch" style="background:${CAT_COLORS[cat]}"></span>${CATS[cat]} — Transactions</h4>
            <button class="btn btn-ghost btn-sm" onclick="closeCategoryTransactions()">Close ✕</button>
          </div>
          <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 14px;">${totalCount} transaction${totalCount===1?'':'s'}${cat==='stock'?' (fee payments + inventory sales)' : ` recorded against ${CATS[cat]}`}, most recent first.</p>
          ${feeSection}
          ${invSection}
        </div>
      </div>
    `;
  }
  function closeCategoryTransactions(){
    const wrap = document.getElementById('dashCatTxnModalWrap');
    if(wrap) wrap.innerHTML = '';
  }

  function onCasteFilterChange(){
    casteFilterClass = document.getElementById('casteClassSel').value;
    casteFilterGender = document.getElementById('casteGenderSel').value;
    renderCasteBody();
  }

  function renderCasteBody(){
    const body = document.getElementById('casteCardBody');
    if(!body) return;
    const filtered = students.filter(s =>
      (!casteFilterClass || s.className === casteFilterClass) &&
      (!casteFilterGender || s.gender === casteFilterGender)
    );
    const counts = {};
    CASTE_CATS.forEach(c => counts[c] = 0);
    let unspecified = 0;
    filtered.forEach(s => {
      if(s.caste && counts[s.caste] !== undefined) counts[s.caste]++;
      else unspecified++;
    });
    const max = Math.max(1, ...Object.values(counts), unspecified);

    body.innerHTML = `
      <div style="font-size:0.74rem; color:var(--ink-soft); margin-bottom:10px;">${filtered.length} student${filtered.length===1?'':'s'} in this view</div>
      ${CASTE_CATS.map(c => `
        <div class="class-bar-row">
          <div class="class-bar-label">${c}</div>
          <div class="class-bar-track"><div class="class-bar-fill" style="width:${(counts[c]/max)*100}%"></div></div>
          <div class="class-bar-count">${counts[c]}</div>
        </div>
      `).join('')}
      <div class="class-bar-row">
        <div class="class-bar-label">Not specified</div>
        <div class="class-bar-track"><div class="class-bar-fill" style="width:${(unspecified/max)*100}%; background:var(--ink-soft);"></div></div>
        <div class="class-bar-count">${unspecified}</div>
      </div>
    `;
  }

  /* ===== PAYMENT MODAL ===== */
  