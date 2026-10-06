/* ============================================================================
   Fee receipt - one itemized receipt for everything paid together.
   Replaces printReceiptRecords (was in 06-payment-modal.js).

   - Every fee head that shares a receipt number (school fee + bus fee, extra
     fees, ...) prints on ONE receipt, with an Instalment column and a total.
   - The header shows only the SCHOOL's phone; the parent's number appears in
     the student details, labelled Father / Mother / Guardian.
   - Both copies (Student + Office) sit SIDE BY SIDE on the top half of an A4 sheet
     (210 x 148 mm, each copy 105 x 148 mm, cut along the dashed line). A button prints
     the same block on half-A4 (A5 landscape) paper. Many fee heads tighten the spacing so nothing is cut off.
   ========================================================================== */
function frcEsc(v){ return escapeHtml(v == null ? '' : String(v)); }
function frcMoney(n){ return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Which parent's number is on file, and whose it is.
function frcContact(s){
  if(s.fatherPhone) return { rel: 'Father', phone: s.fatherPhone };
  if(s.motherPhone) return { rel: 'Mother', phone: s.motherPhone };
  if(s.guardianPhone) return { rel: 'Guardian', phone: s.guardianPhone };
  return { rel: '', phone: '' };
}
function frcInstalmentText(r){
  if(r.instalment) return r.instalment;
  return r.category === 'extra' ? 'One-time' : 'Annual';
}
function frcLogoSrc(){
  const img = document.querySelector('.sb-brand img');
  if(!img || !img.src) return '';
  try { return new URL(img.src, location.href).href; } catch(e){ return img.src; }
}

function frcCopyHtml(label, d){
  const rows = d.recs.map((r, i) => `<tr>
      <td class="n">${i + 1}</td>
      <td><b>${frcEsc(feeLabelFor(r))}</b>${r.note ? ` <small>${frcEsc(r.note)}</small>` : ''}</td>
      <td><span class="chip">${frcEsc(frcInstalmentText(r))}</span></td>
      <td class="a">${frcMoney(r.amount)}</td></tr>`).join('');
  const rel = d.s.fatherName ? 'Father' : (d.s.motherName ? 'Mother' : 'Guardian');
  return `<section class="copy">
    <header class="hd">
      <div class="hd-l">
        ${d.logo ? `<img class="logo" src="${frcEsc(d.logo)}" alt="">` : ''}
        <div><div class="school">${frcEsc(schoolInfo.name || 'School')}</div>
          <div class="addr">${frcEsc(schoolInfo.address || '')}</div>
          <div class="addr">${[schoolInfo.phone && 'Ph: ' + frcEsc(schoolInfo.phone), schoolInfo.email && frcEsc(schoolInfo.email)].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div></div>
      </div>
      <div class="hd-r"><div class="ttl">FEE RECEIPT</div><div class="copylbl">${label}</div></div>
    </header>
    <div class="meta">
      <div><small>Receipt No</small><b>${frcEsc(d.receiptNo)}</b></div>
      <div><small>Date</small><b>${frcEsc(d.date)}</b></div>
      <div><small>Payment mode</small><b>${frcEsc(d.mode)}</b></div>
      <div class="paid"><span>✓ PAID</span></div>
    </div>
    <div class="who">
      <div><small>Student</small><b>${frcEsc((d.s.firstName + ' ' + d.s.lastName).toUpperCase())}</b></div>
      <div><small>Admission No</small><b>${frcEsc(d.s.admissionNo)}</b></div>
      <div><small>Class &amp; Section</small><b>${frcEsc(d.s.className)} — ${frcEsc(d.s.section)}</b></div>
      <div><small>${rel}</small><b>${frcEsc(d.parentName)}</b></div>
      <div><small>Mobile${d.contact.rel ? ' (' + d.contact.rel + ')' : ''}</small><b>${frcEsc(d.contact.phone || '—')}</b></div>
      <div class="wide"><small>Address</small><b class="addrv">${frcEsc(d.address)}</b></div>
    </div>
    <div class="mid"><table class="items">
      <thead><tr><th class="n">#</th><th>Fee head</th><th>Instalment</th><th class="a">Amount (₹)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        ${d.disc > 0 ? `<tr><td colspan="3" class="r">Discount allowed</td><td class="a">${frcMoney(d.disc)}</td></tr>` : ''}
        <tr class="tot"><td colspan="3" class="r">Total paid</td><td class="a">${frcMoney(d.netPaid)}</td></tr>
      </tfoot>
    </table></div>
    <div class="foot">
      <div class="fl"><div class="words"><small>In words</small>${frcEsc(d.words)}</div>
        <div class="due"><small>Remaining due (all fees)</small><b>₹ ${frcMoney(d.due)}</b></div></div>
      <div class="sign"><span></span>${frcEsc(d.signer)}<br><small>Authorised signatory</small></div>
    </div>
    <div class="note">Fee once paid is neither refundable nor transferable. Computer-generated receipt.</div>
  </section>`;
}

function frcDocHtml(d){
  const n = d.recs.length;
  const dens = n > 8 ? 'tight' : n > 5 ? 'compact' : 'normal';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${frcEsc(d.receiptNo)}</title>
  <style id="frcPage">@page{size:A4;margin:0}</style>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0}
    body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1b1b2f;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#dfe1ea}
    .bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;padding:8px 10px;background:#211A4E;color:#fff;font-size:13px}
    .bar button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:7px 14px;cursor:pointer;background:rgba(255,255,255,.14);color:#fff}
    .bar button.on{background:#E9B949;color:#211A4E}.bar .go{background:#168a5f}
    .sheet{width:210mm;height:148mm;margin:10px auto;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18);overflow:hidden;display:flex}
    .half{width:105mm;height:148mm;padding:4mm 4mm;overflow:hidden;flex:none}
    .half+.half{border-left:1.5px dashed #aaa}
    .copy{height:100%;border:1.2px solid #211A4E;border-radius:7px;overflow:hidden;display:flex;flex-direction:column}
    .hd{display:flex;flex-wrap:wrap;gap:3px 8px;padding:6px 8px 5px;background:#211A4E;color:#fff;flex:none}
    .hd-l{display:flex;align-items:center;gap:7px;min-width:0;width:100%}
    .logo{width:30px;height:30px;border-radius:50%;background:#fff;object-fit:cover;flex:none;border:1.5px solid #E9B949}
    .school{font-size:11px;font-weight:800;line-height:1.15}
    .addr{font-size:7px;opacity:.88;line-height:1.25}
    .hd-r{width:100%;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.22);padding-top:3px}
    .ttl{font-size:10.5px;font-weight:800;color:#E9B949;letter-spacing:1.2px}
    .copylbl{font-size:6.5px;font-weight:700;letter-spacing:.6px;padding:1px 8px;border-radius:99px;background:rgba(255,255,255,.16)}
    small{display:block;font-size:6px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:#6b6b82;line-height:1.2}
    .meta{display:grid;grid-template-columns:1.5fr 1fr .9fr auto;gap:5px;align-items:center;padding:4px 8px;background:#F5F1E6;border-bottom:1px solid #e6dfca;flex:none}
    .meta b{font-size:8.5px}
    .paid span{display:inline-block;border:1.3px solid #168a5f;color:#168a5f;font-weight:800;font-size:7.5px;letter-spacing:.8px;padding:1px 6px;border-radius:5px;transform:rotate(-4deg)}
    .who{display:grid;grid-template-columns:1.3fr 1fr;gap:3px 8px;padding:5px 8px;flex:none}
    .who b{font-size:9.5px;display:block;overflow-wrap:anywhere;line-height:1.2}
    .who .wide{grid-column:1/-1}.who .addrv{font-weight:600;font-size:7.5px}
    .mid{flex:1;min-height:0;overflow:hidden}
    .items{width:calc(100% - 16px);margin:0 8px;border-collapse:collapse;font-size:10px}
    .items th{background:#eceaf4;text-align:left;font-size:6.2px;text-transform:uppercase;letter-spacing:.3px;padding:3px 4px;border-bottom:1.2px solid #211A4E}
    .items td{padding:5px 4px;border-bottom:1px solid #e4e2ee;vertical-align:middle}
    .items td small{display:inline;text-transform:none;letter-spacing:0;font-weight:500;font-size:6.5px}
    .items .n{width:12px;color:#8a8aa0}.items .a{text-align:right;white-space:nowrap}.items .r{text-align:right;color:#555}
    .chip{display:inline-block;background:#E8F4F2;color:#0f6a63;font-weight:700;font-size:7.5px;padding:1px 5px;border-radius:8px;line-height:1.25}
    .items tfoot td{border-bottom:0}.items .tot td{background:#211A4E;color:#fff;font-weight:800;font-size:11px}
    .items .tot td:first-child{border-radius:4px 0 0 4px}.items .tot td:last-child{border-radius:0 4px 4px 0;color:#E9B949}
    .foot{display:flex;justify-content:space-between;align-items:flex-end;gap:6px;padding:4px 8px 3px;flex:none}
    .fl{min-width:0;flex:1}.words{font-size:8.5px;font-weight:600;line-height:1.25}.words small{display:block}
    .due{margin-top:3px}.due small{display:block}.due b{font-size:10px;color:#c0392b}
    .sign{text-align:center;font-size:7px;font-weight:700;width:30mm;flex:none}.sign span{display:block;border-bottom:1px solid #333;height:16px;margin-bottom:2px}.sign small{display:block}
    .note{padding:2px 8px 4px;font-size:6px;color:#777;font-style:italic;border-top:1px dashed #d8d8e4;margin:0 8px;flex:none}
    body.compact .items{font-size:9px}body.compact .items td{padding:3.2px 4px}body.compact .who{padding:4px 8px;gap:2px 8px}
    body.tight .items{font-size:8.2px}body.tight .items td{padding:1.7px 4px}body.tight .items th{padding:2px 4px}body.tight .who{padding:3px 8px;gap:1px 8px}
    body.tight .hd{padding:4px 8px 3px}body.tight .logo{width:24px;height:24px}body.tight .meta{padding:2px 8px}body.tight .note{display:none}body.tight .sign span{height:10px}
    @media print{
      body{background:#fff}.bar{display:none}
      .sheet{margin:0;box-shadow:none}
    }
  </style></head>
  <body class="${dens}" data-mode="a4">
    <div class="bar">
      <button id="mA4" class="on" onclick="frcMode('a4')">A4 paper · both copies on the top half</button>
      <button id="mA5" onclick="frcMode('a5')">Half-A4 paper (A5 landscape)</button>
      <button class="go" onclick="window.print()">🖨 Print</button>
    </div>
    <div class="sheet">
      <div class="half">${frcCopyHtml('STUDENT COPY', d)}</div>
      <div class="half">${frcCopyHtml('OFFICE COPY', d)}</div>
    </div>
    <script>
      function frcMode(m){
        document.body.setAttribute('data-mode', m);
        document.getElementById('mA4').className = m === 'a4' ? 'on' : '';
        document.getElementById('mA5').className = m === 'a5' ? 'on' : '';
        document.getElementById('frcPage').textContent = m === 'a5' ? '@page{size:210mm 148mm;margin:0}' : '@page{size:A4;margin:0}';
      }
      window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };
    </script>
  </body></html>`;
}

// Builds everything the receipt needs; also used by tests.
function frcBuildData(recs){
  const p = recs[0];
  const s = students.find(x => x.id === p.studentId);
  if(!s) return null;
  const { totals } = computeStudentFinance(s);
  const netPaid = recs.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const modes = Array.from(new Set(recs.map(r => r.mode).filter(Boolean)));
  return {
    recs, s, receiptNo: p.receiptNo || nextReceiptNo(), date: p.date || '—', mode: modes.join(' + ') || '—',
    contact: frcContact(s), parentName: s.fatherName || s.motherName || s.guardianName || '—',
    address: s.fatherAddress || s.motherAddress || s.guardianAddress || '—',
    netPaid, disc: recs.reduce((sum, r) => sum + (Number(r.discount) || 0), 0),
    due: totals.receivable, words: 'Rupees ' + numberToWordsIndian(netPaid) + ' Only',
    signer: (currentUser && currentUser.role) || 'Admin', logo: frcLogoSrc()
  };
}
async function printReceiptRecords(recs){
  await ensureDataLoaded('payments', loadPaymentsData);
  if(!recs || !recs[0]) return;
  const d = frcBuildData(recs);
  if(!d) return;
  const w = window.open('', '_blank');
  if(!w){ showToast('Allow pop-ups for this site to print the receipt.'); return; }
  w.document.write(frcDocHtml(d));
  w.document.close();
}
