/* ============================================================================
   Finance → Accounting screens (all 11 tabs).

   Presentation only. Every save / void / print / delete handler is still the
   one in module 20 / 21 (saveIncomeVoucher, saveExpenseVoucher, voidAccountingEntry,
   printAccountingVoucher, addAcctCategory, saveJournalVoucher, saveAcctBankAccount,
   saveAcctFixedAsset, saveAcctBudget …) and they read the same element ids as
   before (acctIncDate, acctExpAmount, jvDate, assetName, budgetLabel …).

   Shares the look of Student Fees / Staff / Inventory: stat tiles (sfKpi),
   buttons (sfBtn), badges, .sf-card surfaces and the .iv-toolbar row.
   ========================================================================== */

/* ---------- small helpers ---------- */
const acxEl = () => document.getElementById('accountingBody');
const acxOpen = {};                         // which "+ Record" panels are open
const acxVStatus = { income:'all', expense:'all' };
const acxVCat = { income:'', expense:'' };
const acxModes = ['Cash','Bank Transfer','UPI','Cheque','Card','Online'];

function acxToggle(id){
  acxOpen[id] = !acxOpen[id];
  const p = document.getElementById('acxPanel-'+id);
  if(p) p.classList.toggle('is-open', !!acxOpen[id]);
  const b = document.getElementById('acxToggle-'+id);
  if(b) b.setAttribute('aria-expanded', acxOpen[id] ? 'true' : 'false');
  if(acxOpen[id] && p){
    const first = p.querySelector('input,select');
    if(first && first.type !== 'hidden') setTimeout(() => { try{ first.focus(); }catch(e){} }, 30);
  }
}
// A collapsible entry form. `inner` keeps the original element ids.
function acxPanel(id, title, hint, inner){
  return `<section class="sf-card acx-panel${acxOpen[id] ? ' is-open' : ''}" id="acxPanel-${id}">
    <div class="acx-panel-in">
      <div class="acx-panel-head"><h4>${title}</h4>${hint ? `<p>${hint}</p>` : ''}</div>
      ${inner}
    </div>
  </section>`;
}
function acxToggleBtn(id, label){
  return `<button type="button" class="sf-btn sf-btn--primary" id="acxToggle-${id}" aria-expanded="${acxOpen[id] ? 'true' : 'false'}" onclick="acxToggle('${id}')">${label}</button>`;
}
function acxEmpty(title, text){
  return `<div class="acx-empty"><b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>`;
}
function acxMoneyTone(n){ return n >= 0 ? 'acx-in' : 'acx-out'; }
function acxPct(part, whole){ return whole > 0 ? Math.max(0, Math.min(100, Math.round(part / whole * 100))) : 0; }
// A share-of-total list: label · amount · % with a thin bar underneath.
function acxShareList(rows, total, tone, emptyText){
  if(!rows.length) return acxEmpty(emptyText);
  return `<ul class="acx-share">${rows.map(([label, d]) => {
    const pct = acxPct(d.amt, total);
    return `<li>
      <div class="acx-share-top"><span>${escapeHtml(label)}${d.count != null ? `<small>${d.count} txn${d.count === 1 ? '' : 's'}</small>` : ''}</span><b class="acx-${tone}">${fmtMoney(d.amt)}</b><em>${pct}%</em></div>
      <div class="acx-bar"><i class="acx-bar-${tone}" style="width:${pct}%"></i></div>
    </li>`;
  }).join('')}</ul>`;
}
function acxFeeLabels(){
  return { fee:'Tuition Fee', bus:'Bus Fee', stock:'Stock Fee', hostel:'Hostel Fee', extra:'Extra Fees (Admission, Inventory, Fines, etc.)' };
}

/* ---------- 1. Overview ---------- */
function renderAcctOverview(body){
  const liveIncome = acctIncome.filter(i => !i.voided);
  const liveExpenses = acctExpenses.filter(e => !e.voided);
  const feeIncome = acctFeeIncomeTotal();
  const otherIncome = acctOtherIncomeTotal();
  const totalIncome = feeIncome + otherIncome;
  const totalExpense = acctExpenseTotal();
  const net = totalIncome - totalExpense;
  const FEE = acxFeeLabels();

  const expenseByCat = {};
  liveExpenses.forEach(e => { const k = e.category; if(!expenseByCat[k]) expenseByCat[k] = {amt:0,count:0}; expenseByCat[k].amt += Number(e.amount)||0; expenseByCat[k].count++; });
  const expRows = Object.entries(expenseByCat).sort((a,b) => b[1].amt - a[1].amt);

  const incomeByCat = {};
  payments.filter(pBookedInLedger).forEach(p => {
    const label = FEE[p.category] || (CATS[p.category] || p.category);
    if(!incomeByCat[label]) incomeByCat[label] = {amt:0,count:0};
    incomeByCat[label].amt += Number(p.amount)||0; incomeByCat[label].count++;
  });
  liveIncome.forEach(i => { if(!incomeByCat[i.category]) incomeByCat[i.category] = {amt:0,count:0}; incomeByCat[i.category].amt += Number(i.amount)||0; incomeByCat[i.category].count++; });
  const incRows = Object.entries(incomeByCat).sort((a,b) => b[1].amt - a[1].amt);

  const modeNet = {};
  payments.filter(pBookedInLedger).forEach(p => { const m = p.mode || 'Unspecified'; modeNet[m] = (modeNet[m]||0) + (Number(p.amount)||0); });
  liveIncome.forEach(i => { const m = i.mode || 'Unspecified'; modeNet[m] = (modeNet[m]||0) + (Number(i.amount)||0); });
  liveExpenses.forEach(e => { const m = e.mode || 'Unspecified'; modeNet[m] = (modeNet[m]||0) - (Number(e.amount)||0); });
  const modeRows = Object.entries(modeNet).sort((a,b) => b[1] - a[1]);

  const recent = [
    ...payments.filter(pBookedInLedger).map(p => ({ date:p.date, type:'Fee income', party:p.studentName||'Student', category:FEE[p.category]||CATS[p.category]||p.category, amount:Number(p.amount)||0, sign:1 })),
    ...liveIncome.map(i => ({ date:i.date, type:'Other income', party:i.party, category:i.category, amount:Number(i.amount)||0, sign:1 })),
    ...liveExpenses.map(e => ({ date:e.date, type:'Expense', party:e.party, category:e.category, amount:Number(e.amount)||0, sign:-1 })),
  ].sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0, 15);

  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Total income', fmtMoney(totalIncome), 'good', 'fees + other income')}
      ${sfKpi('Total expenses', fmtMoney(totalExpense), 'danger')}
      ${sfKpi('Cash position', fmtMoney(net), net >= 0 ? 'good' : 'danger', 'income − expenses')}
      ${sfKpi('Fee collections', fmtMoney(feeIncome), 'plain')}
      ${sfKpi('Other income', fmtMoney(otherIncome), 'plain')}
    </section>
    <div class="acx-two">
      <section class="sf-card acx-card"><h4>Income by source</h4>${acxShareList(incRows, totalIncome, 'in', 'No income recorded yet')}</section>
      <section class="sf-card acx-card"><h4>Expenses by category</h4>${acxShareList(expRows, totalExpense, 'out', 'No expenses recorded yet')}</section>
    </div>
    <div class="acx-two">
      <section class="sf-card acx-card">
        <h4>Cash position by payment mode</h4>
        <p class="acx-note">Collected minus paid out, split by how it moved — how much is cash in hand versus in the bank or on UPI.</p>
        ${modeRows.length ? `<ul class="acx-modes">${modeRows.map(([m, v]) => `<li><span>${escapeHtml(m)}</span><b class="${acxMoneyTone(v)}">${fmtMoney(v)}</b></li>`).join('')}</ul>` : acxEmpty('No transactions yet')}
      </section>
      <section class="sf-card acx-card">
        <h4>Recent transactions</h4>
        ${recent.length ? `<div class="table-wrap"><table class="iv-table"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Party</th><th class="acx-r">Amount</th></tr></thead><tbody>
          ${recent.map(t => `<tr><td>${escapeHtml(t.date||'—')}</td><td>${t.type}</td><td>${escapeHtml(t.category||'—')}</td><td>${escapeHtml(t.party||'—')}</td><td class="acx-r"><b class="${t.sign>0?'acx-in':'acx-out'}">${t.sign>0?'+':'−'}${fmtMoney(t.amount)}</b></td></tr>`).join('')}
        </tbody></table></div>` : acxEmpty('No transactions yet')}
      </section>
    </div>`;
}

/* ---------- 2. Daily Collections (Admin only) ---------- */
function renderAcctDailyCollectionsTab(body){
  const d = acctDailyCollectionsDate || acctToday();
  const todayStr = acctToday();
  const FEE = { fee:'Tuition Fee', bus:'Bus Fee', stock:'Stock Fee', hostel:'Hostel Fee', extra:'Extra Fees / Inventory (Student)' };
  const feePays = payments.filter(p => pBookedInLedger(p) && p.date === d);
  const otherInc = acctIncome.filter(i => !i.voided && i.date === d);
  const invSales = (typeof inventorySales !== 'undefined' ? inventorySales : []).filter(s => s.buyerType !== 'Student' && s.date === d && Number(s.paidAmount||0) !== 0);

  const modeTotals = {};
  const addMode = (mode, amt) => { const m = mode || 'Unspecified'; modeTotals[m] = (modeTotals[m]||0) + amt; };
  feePays.forEach(p => addMode(p.mode, Number(p.amount)||0));
  otherInc.forEach(i => addMode(i.mode, Number(i.amount)||0));
  invSales.forEach(s => addMode(s.mode, Number(s.paidAmount)||0));
  const modeRows = Object.entries(modeTotals).sort((a,b) => b[1] - a[1]).map(([m, v]) => [m, {amt:v}]);
  const grand = Object.values(modeTotals).reduce((s,v) => s + v, 0);

  const srcTotals = {};
  const addSrc = (label, amt) => { if(!srcTotals[label]) srcTotals[label] = {amt:0,count:0}; srcTotals[label].amt += amt; srcTotals[label].count++; };
  feePays.forEach(p => addSrc(FEE[p.category] || p.category || 'Fee Payment', Number(p.amount)||0));
  otherInc.forEach(i => addSrc('Other Income — ' + i.category, Number(i.amount)||0));
  invSales.forEach(s => addSrc('Inventory Sale (Staff / Walk-in)', Number(s.paidAmount)||0));
  const srcRows = Object.entries(srcTotals).sort((a,b) => b[1].amt - a[1].amt);

  const tx = [
    ...feePays.map(p => ({ type:Number(p.amount) < 0 ? 'Refund' : 'Fee payment', party:p.studentName||'Student', detail:FEE[p.category]||p.category, mode:p.mode||'—', ref:p.receiptNo||'—', amount:Number(p.amount)||0 })),
    ...otherInc.map(i => ({ type:'Other income', party:i.party||'—', detail:i.category, mode:i.mode||'—', ref:i.voucherNo||'—', amount:Number(i.amount)||0 })),
    ...invSales.map(s => ({ type:'Inventory sale', party:s.buyerName||s.buyerType, detail:s.itemName, mode:s.mode||'—', ref:'—', amount:Number(s.paidAmount)||0 })),
  ].sort((a,b) => b.amount - a.amount);

  body.innerHTML = `
    <div class="iv-toolbar">
      <label class="acx-date"><span>Date</span><input class="input" type="date" id="acctDcDate" value="${d}" max="${todayStr}" onchange="acctDailyCollectionsDate=this.value; renderAcctDailyCollectionsTab(document.getElementById('accountingBody'));"></label>
      <p class="acx-note acx-grow">Everything collected on this date across every payment mode and module — fee payments, inventory sales and other income — to check against what is physically handed over.</p>
    </div>
    <section class="sf-kpis">
      ${sfKpi('Collected on ' + d, fmtMoney(grand), grand > 0 ? 'good' : 'plain')}
      ${sfKpi('Transactions', tx.length, 'plain')}
      ${sfKpi('Payment modes', modeRows.length, 'plain')}
    </section>
    <div class="acx-two">
      <section class="sf-card acx-card"><h4>By payment mode</h4>${acxShareList(modeRows, grand, 'in', 'No collections recorded for this date')}</section>
      <section class="sf-card acx-card"><h4>By source</h4>${acxShareList(srcRows, grand, 'in', 'No collections recorded for this date')}</section>
    </div>
    <section class="sf-card acx-card">
      <h4>Transaction detail</h4>
      ${tx.length ? `<div class="table-wrap"><table class="iv-table"><thead><tr><th>Type</th><th>Detail</th><th>Party</th><th>Mode</th><th>Receipt / Voucher</th><th class="acx-r">Amount</th></tr></thead><tbody>
        ${tx.map(t => `<tr><td>${t.type}</td><td>${escapeHtml(t.detail||'—')}</td><td>${escapeHtml(t.party||'—')}</td><td>${escapeHtml(t.mode)}</td><td>${escapeHtml(t.ref)}</td><td class="acx-r"><b class="${acxMoneyTone(t.amount)}">${fmtMoney(t.amount)}</b></td></tr>`).join('')}
      </tbody></table></div>` : acxEmpty('No transactions on this date')}
    </section>`;
}

/* ---------- 3 & 4. Income / Expense vouchers (one builder) ---------- */
function acxVouchers(kind){ return kind === 'income' ? acctIncome : acctExpenses; }
function acxVMatches(kind){
  const q = (kind === 'income' ? acctIncomeSearch : acctExpenseSearch).toLowerCase();
  const st = acxVStatus[kind], cat = acxVCat[kind];
  return acxVouchers(kind).filter(v => {
    if(st === 'active' && v.voided) return false;
    if(st === 'voided' && !v.voided) return false;
    if(cat && v.category !== cat) return false;
    return !q || (v.party||'').toLowerCase().includes(q) || (v.category||'').toLowerCase().includes(q) || (v.referenceNo||'').toLowerCase().includes(q) || (v.voucherNo||'').toLowerCase().includes(q);
  }).sort((a,b) => (b.date||'').localeCompare(a.date||''));
}
function acxVoucherRowsHtml(kind){
  const inc = kind === 'income';
  const perm = inc ? 'accounting_income' : 'accounting_expenses';
  const canPrint = getAccountingTabAccess(currentUser.role, perm, 'print');
  const canVoid = getAccountingTabAccess(currentUser.role, perm, 'delete');
  const rows = acxVMatches(kind);
  if(!rows.length) return `<tr><td colspan="8">${acxEmpty('No ' + kind + ' vouchers found', (inc ? acctIncomeSearch : acctExpenseSearch) || acxVStatus[kind] !== 'all' || acxVCat[kind] ? 'Try clearing the search or filters.' : 'Use the button above to record the first one.')}</td></tr>`;
  return rows.map(v => `<tr class="${v.voided ? 'acx-void' : ''}">
    <td><b>${escapeHtml(v.voucherNo)}</b></td>
    <td>${escapeHtml(v.date)}</td>
    <td>${escapeHtml(v.category)}</td>
    <td>${escapeHtml(v.costCenter || '—')}</td>
    <td>${escapeHtml(v.party || '—')}</td>
    <td>${escapeHtml(v.mode || '')}${v.referenceNo ? `<small class="acx-ref">${escapeHtml(v.referenceNo)}</small>` : ''}</td>
    <td class="acx-r"><b class="${inc ? 'acx-in' : 'acx-out'}">${fmtMoney(v.amount)}</b></td>
    <td class="acx-act"><div class="sf-actions">
      ${v.voided ? `<span class="sf-badge sf-badge--upcoming" title="${escapeHtml(v.voidReason || '')}">Voided</span>` : ''}
      ${canPrint ? sfBtn('link', '', 'Print', `printAccountingVoucher('${kind}','${v.id}')`) : ''}
      ${canVoid && !v.voided ? sfBtn('danger', '', 'Void', `voidAccountingEntry('${kind}','${v.id}')`) : ''}
    </div></td>
  </tr>`).join('');
}
function acxRepaintVouchers(kind){
  const t = document.getElementById('acxVRows'); if(t) t.innerHTML = acxVoucherRowsHtml(kind);
  const c = document.getElementById('acxVCount'); if(c) c.textContent = acxVMatches(kind).length + ' of ' + acxVouchers(kind).length;
}
function acxVSearch(kind, val){
  if(kind === 'income') acctIncomeSearch = val; else acctExpenseSearch = val;
  acxRepaintVouchers(kind);
}
function acxVFilter(kind, field, val){
  if(field === 'status'){
    acxVStatus[kind] = val;
    document.querySelectorAll('#acxVSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === val));
  }else acxVCat[kind] = val;
  acxRepaintVouchers(kind);
}
function acxVoucherTab(kind, body){
  const inc = kind === 'income';
  const p = inc ? 'acctInc' : 'acctExp';
  const perm = inc ? 'accounting_income' : 'accounting_expenses';
  const canCreate = getAccountingTabAccess(currentUser.role, perm, 'create');
  const list = acxVouchers(kind);
  const live = list.filter(v => !v.voided);
  const total = live.reduce((s, v) => s + (Number(v.amount)||0), 0);
  const month = acctToday().slice(0, 7);
  const monthTotal = live.filter(v => (v.date||'').startsWith(month)).reduce((s, v) => s + (Number(v.amount)||0), 0);
  const voided = list.length - live.length;
  const cats = inc ? acctIncomeCategories : acctExpenseCategories;
  const search = inc ? acctIncomeSearch : acctExpenseSearch;
  const banks = acctBankAccounts.filter(b => b.active !== false);
  const word = inc ? 'income' : 'expense';

  const form = canCreate ? acxPanel(kind === 'income' ? 'inc' : 'exp',
    inc ? 'Record income' : 'Record expense',
    inc ? 'For anything other than student fees — donations, grants, rent, interest. Pick the <b>Account</b> it belongs to so “P&amp;L by Account” totals it correctly. A Receipt Voucher number is assigned when you save.'
        : 'Salaries, utilities, maintenance, supplies. Pick the <b>Account</b> it should be weighed against (e.g. driver salary and fuel → Vehicle Fee). A Payment Voucher number is assigned when you save.',
    `<div class="form-grid">
      <div class="f-field"><label>Date</label><input type="date" id="${p}Date" value="${acctToday()}"></div>
      <div class="f-field"><label>Amount (₹)</label><input type="number" id="${p}Amount" min="0" placeholder="0"></div>
      <div class="f-field"><label>Category</label>
        <select id="${p}Category" onchange="onAcctCategoryChange('${p}Category','${p}NewCategory')">${cats.map(c => `<option>${escapeHtml(c)}</option>`).join('')}<option value="__new__">+ New category…</option></select></div>
      <div class="f-field" id="${p}NewCategoryField" style="display:none;"><label>New category name</label><input type="text" id="${p}NewCategory" placeholder="${inc ? 'e.g. Alumni Contribution' : 'e.g. Sports Equipment'}"></div>
      <div class="f-field"><label>Account</label><select id="${p}CostCenter">${acctCostCenters.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select></div>
      <div class="f-field"><label>${inc ? 'Received from' : 'Paid to'}</label><input type="text" id="${p}Party" placeholder="${inc ? 'e.g. Rotary Club of Kadapa' : 'e.g. APSEB Electricity Board'}"></div>
      <div class="f-field"><label>Payment mode</label>
        <select id="${p}Mode" onchange="onAcctModeChange('${p}Mode','${p}RefField')">${acxModes.map(m => `<option>${m}</option>`).join('')}</select></div>
      <div class="f-field" id="${p}RefField" style="display:none;"><label>Reference / Cheque no.</label><input type="text" id="${p}Ref" placeholder="Cheque no. or UTR"></div>
      <div class="f-field"><label>${inc ? 'Deposited into' : 'Paid from'}</label><select id="${p}BankAccount"><option value="">(Auto — by payment mode)</option>${banks.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}</select></div>
      <div class="f-field full"><label>Description / narration</label><input type="text" id="${p}Desc" placeholder="Optional notes"></div>
    </div>
    <div class="acx-form-actions">
      ${sfBtn('primary', 'check', inc ? 'Save income voucher' : 'Save expense voucher', inc ? 'saveIncomeVoucher()' : 'saveExpenseVoucher()')}
      <button type="button" class="sf-btn sf-btn--soft" onclick="acxToggle('${kind === 'income' ? 'inc' : 'exp'}')">Close</button>
    </div>`) : '';

  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi(inc ? 'Total income' : 'Total expenses', fmtMoney(total), inc ? 'good' : 'danger', 'excluding voided')}
      ${sfKpi('This month', fmtMoney(monthTotal), 'plain')}
      ${sfKpi('Vouchers', live.length, 'plain', word + ' entries')}
      ${sfKpi('Voided', voided, 'plain', 'kept for audit')}
    </section>
    <div class="iv-toolbar">
      <input class="input iv-search" type="search" placeholder="Search voucher, party, reference…" value="${escapeHtml(search)}" oninput="acxVSearch('${kind}', this.value)">
      <div class="sf-segments" id="acxVSeg" role="group" aria-label="Status">
        ${[['all','All'],['active','Active'],['voided','Voided']].map(([v, l]) => `<button type="button" data-v="${v}" class="${acxVStatus[kind] === v ? 'active' : ''}" onclick="acxVFilter('${kind}','status','${v}')">${l}</button>`).join('')}
      </div>
      <select class="input" onchange="acxVFilter('${kind}','cat',this.value)" aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option ${acxVCat[kind] === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
      <div class="iv-toolbar-actions">${canCreate ? acxToggleBtn(kind === 'income' ? 'inc' : 'exp', inc ? '＋ Record income' : '＋ Record expense') : ''}</div>
    </div>
    ${form}
    <section class="sf-card">
      <div class="acx-tablehead"><b>${inc ? 'Income' : 'Expense'} vouchers</b><span id="acxVCount"></span></div>
      <div class="table-wrap"><table class="iv-table">
        <thead><tr><th>Voucher</th><th>Date</th><th>Category</th><th>Account</th><th>${inc ? 'Received from' : 'Paid to'}</th><th>Mode</th><th class="acx-r">Amount</th><th></th></tr></thead>
        <tbody id="acxVRows"></tbody>
      </table></div>
    </section>`;
  acxRepaintVouchers(kind);
}
function renderAcctIncomeTab(body){ acxVoucherTab('income', body); }
function renderAcctExpenseTab(body){ acxVoucherTab('expense', body); }

/* ---------- 5. P&L by Account ---------- */
function renderAcctSegmentsTab(body){
  const segments = {};
  const seg = name => (segments[name] = segments[name] || { income:0, expense:0 });
  const inventorySefIds = new Set(inventorySales.filter(s => s.sefId).map(s => s.sefId));
  payments.filter(pBookedInLedger).forEach(p => {
    const key = (p.category === 'extra' && inventorySefIds.has(p.extraFeeId)) ? 'Inventory' : feePaymentCostCenter(p);
    seg(key).income += Number(p.amount)||0;
  });
  inventorySales.filter(s => s.buyerType !== 'Student').forEach(s => { seg('Inventory').income += Number(s.paidAmount)||0; });
  acctIncome.filter(i => !i.voided).forEach(i => { seg(i.costCenter || 'General / Other').income += Number(i.amount)||0; });
  acctExpenses.filter(e => !e.voided).forEach(e => { seg(e.costCenter || 'General / Other').expense += Number(e.amount)||0; });
  const names = Object.keys(segments).sort((a,b) => (segments[b].income - segments[b].expense) - (segments[a].income - segments[a].expense));
  const tin = names.reduce((s,n) => s + segments[n].income, 0);
  const tex = names.reduce((s,n) => s + segments[n].expense, 0);
  const profitable = names.filter(n => segments[n].income - segments[n].expense >= 0).length;
  const maxAbs = Math.max(1, ...names.map(n => Math.abs(segments[n].income - segments[n].expense)));

  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Total income', fmtMoney(tin), 'good')}
      ${sfKpi('Total expenditure', fmtMoney(tex), 'danger')}
      ${sfKpi('Net', fmtMoney(tin - tex), tin - tex >= 0 ? 'good' : 'danger')}
      ${sfKpi('Accounts in profit', profitable + ' of ' + names.length, 'plain')}
    </section>
    <p class="acx-note acx-wide">Profit &amp; loss by account. Fee collections are matched to an account automatically (tuition → Tuition Fee, bus → Vehicle Fee, hostel → Hostel Fee, other → General / Other) and every Inventory counter sale is counted as Inventory income. Vouchers use the Account chosen when saved — so you can see whether the bus or the canteen really pays for itself.</p>
    <section class="sf-card">
      <div class="table-wrap"><table class="iv-table">
        <thead><tr><th>Account</th><th class="acx-r">Income</th><th class="acx-r">Expenditure</th><th class="acx-r">Net</th><th class="acx-netcol">Result</th></tr></thead>
        <tbody>
        ${names.length ? names.map(n => {
          const s = segments[n], net = s.income - s.expense, w = Math.round(Math.abs(net) / maxAbs * 100);
          return `<tr><td><b>${escapeHtml(n)}</b></td><td class="acx-r"><span class="acx-in">${fmtMoney(s.income)}</span></td><td class="acx-r"><span class="acx-out">${fmtMoney(s.expense)}</span></td><td class="acx-r"><b class="${acxMoneyTone(net)}">${fmtMoney(net)}</b></td>
            <td class="acx-netcol"><span class="sf-badge sf-badge--${net >= 0 ? 'paid' : 'overdue'}">${net >= 0 ? '✓ Profit' : '! Loss'}</span><div class="acx-bar acx-bar-sm"><i class="acx-bar-${net >= 0 ? 'in' : 'out'}" style="width:${w}%"></i></div></td></tr>`;
        }).join('') : `<tr><td colspan="5">${acxEmpty('No income or expenditure recorded yet')}</td></tr>`}
        </tbody>
        ${names.length ? `<tfoot><tr><td>Total</td><td class="acx-r acx-in">${fmtMoney(tin)}</td><td class="acx-r acx-out">${fmtMoney(tex)}</td><td class="acx-r ${acxMoneyTone(tin - tex)}">${fmtMoney(tin - tex)}</td><td></td></tr></tfoot>` : ''}
      </table></div>
    </section>`;
}

/* ---------- 6. Categories ---------- */
function acxChipCard(title, hint, inputId, placeholder, addCall, items, removeFn, canCreate, canDelete){
  return `<section class="sf-card acx-card">
    <h4>${title} <small>${items.length}</small></h4>
    ${hint ? `<p class="acx-note">${hint}</p>` : ''}
    ${canCreate ? `<div class="acx-add"><input class="input" id="${inputId}" placeholder="${placeholder}" onkeydown="if(event.key==='Enter'){${addCall}}">${sfBtn('primary', 'plus', 'Add', addCall)}</div>` : ''}
    ${items.length ? `<div class="acx-chips">${items.map((c, i) => `<span class="acx-chip">${escapeHtml(c)}${canDelete ? `<button type="button" aria-label="Remove ${escapeHtml(c)}" onclick="${removeFn(i)}">×</button>` : ''}</span>`).join('')}</div>` : acxEmpty('Nothing here yet')}
  </section>`;
}
function renderAcctCategoriesTab(body){
  const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_categories', 'create');
  const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_categories', 'delete');
  body.innerHTML = `
    <p class="acx-note acx-wide">Categories sort vouchers into what they were for. Accounts decide which part of the school an income or expense is weighed against in <b>P&amp;L by Account</b>. A category or account that is already used on a voucher cannot be removed.</p>
    <div class="acx-three">
      ${acxChipCard('Expense categories', '', 'acctNewExpCat', 'e.g. Sports Equipment', "addAcctCategory('expense')", acctExpenseCategories, i => `removeAcctCategory('expense',${i})`, canCreate, canDelete)}
      ${acxChipCard('Income categories', '', 'acctNewIncCat', 'e.g. Alumni Contribution', "addAcctCategory('income')", acctIncomeCategories, i => `removeAcctCategory('income',${i})`, canCreate, canDelete)}
      ${acxChipCard('Accounts (for P&amp;L)', 'Tuition Fee, Vehicle Fee, Inventory, Hostel Fee, General …', 'acctNewCostCenter', 'e.g. Sports Wing', 'addAcctCostCenter()', acctCostCenters, i => `removeAcctCostCenter(${i})`, canCreate, canDelete)}
    </div>`;
}

/* ---------- 7. Chart of Accounts ---------- */
function renderAcctChartTab(body){
  const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_chartofaccounts', 'create');
  const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_chartofaccounts', 'delete');
  const ledger = acctBuildLedger();
  const coa = getChartOfAccounts();
  const groups = ['Assets','Liabilities','Equity','Income','Expense'];
  const byGroup = {}; groups.forEach(g => byGroup[g] = []);
  coa.forEach(acct => {
    const rows = ledger[acct.key] || [];
    byGroup[acct.group].push({ acct, bal: acctBalanceFromRows(rows, acct.type), count: rows.length });
  });
  const groupTotal = g => byGroup[g].reduce((s, r) => s + (r.bal.normalDebit ? r.bal.balance : r.bal.balance), 0);
  body.innerHTML = `
    <section class="sf-kpis">
      ${groups.map(g => sfKpi(g, fmtMoney(groupTotal(g)), 'plain', byGroup[g].length + ' account' + (byGroup[g].length === 1 ? '' : 's'))).join('')}
    </section>
    <div class="iv-toolbar">
      <p class="acx-note acx-grow">Every account the books use, with its live balance. Bank &amp; Cash accounts are managed under <b>Bank &amp; Reconciliation</b>, Fixed Assets under <b>Fixed Assets</b>, categories under <b>Categories</b>. Add any other Asset, Liability or Equity account here — a bank loan, caution deposits, a corpus fund.</p>
      <div class="iv-toolbar-actions">${canCreate ? acxToggleBtn('ol', '＋ Add account') : ''}</div>
    </div>
    ${canCreate ? acxPanel('ol', 'Add other account (Asset / Liability / Equity)', '',
      `<div class="form-grid">
        <div class="f-field full"><label>Account name</label><input type="text" id="acctOLName" placeholder="e.g. Bank Loan — SBI, Corpus Fund, Caution Deposits Payable"></div>
        <div class="f-field"><label>Type</label><select id="acctOLType"><option>Asset</option><option>Liability</option><option>Equity</option></select></div>
        <div class="f-field"><label>Opening balance (₹)</label><input type="number" id="acctOLOpening" min="0" placeholder="0"></div>
        <div class="f-field"><label>Opening date</label><input type="date" id="acctOLOpeningDate" value="${acctToday()}"></div>
      </div>
      <div class="acx-form-actions">${sfBtn('primary', 'check', 'Add account', 'saveAcctOtherLedger()')}<button type="button" class="sf-btn sf-btn--soft" onclick="acxToggle('ol')">Close</button></div>`) : ''}
    <div class="acx-two">
    ${groups.map(g => `<section class="sf-card acx-card"><h4>${g} <small>${byGroup[g].length}</small></h4>
      ${byGroup[g].length ? `<div class="table-wrap"><table class="iv-table"><thead><tr><th>Account</th><th>Type</th><th class="acx-r">Entries</th><th class="acx-r">Balance</th></tr></thead><tbody>
        ${byGroup[g].map(({acct, bal, count}) => `<tr class="${acct.active === false ? 'acx-void' : ''}"><td><b>${escapeHtml(acct.name)}</b>${acct.active === false ? ' <span class="pill">Inactive</span>' : ''}</td><td>${escapeHtml(acct.sub || '')}</td><td class="acx-r">${count}</td><td class="acx-r"><b class="${acxMoneyTone(bal.balance)}">${fmtMoney(Math.abs(bal.balance))} ${bal.normalDebit ? (bal.balance < 0 ? 'Cr' : 'Dr') : (bal.balance < 0 ? 'Dr' : 'Cr')}</b></td></tr>`).join('')}
      </tbody></table></div>` : acxEmpty('No ' + g.toLowerCase() + ' accounts yet')}</section>`).join('')}
    </div>
    <section class="sf-card acx-card">
      <h4>Other accounts <small>${acctOtherLedgers.length}</small></h4>
      ${acctOtherLedgers.length ? `<div class="table-wrap"><table class="iv-table"><thead><tr><th>Account</th><th>Type</th><th class="acx-r">Opening balance</th><th></th></tr></thead><tbody>
        ${acctOtherLedgers.map(l => `<tr class="${l.active === false ? 'acx-void' : ''}"><td><b>${escapeHtml(l.name)}</b></td><td>${escapeHtml(l.type)}</td><td class="acx-r">${fmtMoney(l.openingBalance || 0)}</td>
          <td class="acx-act">${canDelete ? `<div class="sf-actions">${sfBtn('link', '', l.active === false ? 'Reactivate' : 'Deactivate', `toggleAcctOtherLedgerActive('${l.id}')`)}${sfBtn('danger', '', 'Delete', `deleteAcctOtherLedger('${l.id}')`)}</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : acxEmpty('No other accounts yet')}
    </section>`;
}

/* ---------- 8. Journal Vouchers ---------- */
// Live debit/credit totals while typing (the old screen only updated on Add/Remove).
function acxJvLive(){
  const rows = document.querySelectorAll('.jv-line-row');
  let d = 0, c = 0;
  rows.forEach(r => { d += Number(r.querySelector('.jv-line-debit').value) || 0; c += Number(r.querySelector('.jv-line-credit').value) || 0; });
  const set = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  set('acxJvD', fmtMoney(d)); set('acxJvC', fmtMoney(c));
  const ok = d > 0 && Math.round(d * 100) === Math.round(c * 100);
  const st = document.getElementById('acxJvState');
  if(st){
    st.className = 'sf-badge sf-badge--' + (ok ? 'paid' : 'due');
    st.textContent = ok ? '✓ Balanced' : (d === 0 && c === 0 ? 'Enter amounts' : 'Out by ' + fmtMoney(Math.abs(d - c)));
  }
}
function acxJvRowsHtml(){
  const q = acctJournalSearch.toLowerCase();
  const canVoid = getAccountingTabAccess(currentUser.role, 'accounting_journal', 'delete');
  const rows = acctJournalVouchers.filter(j => !q || (j.narration||'').toLowerCase().includes(q) || (j.voucherNo||'').toLowerCase().includes(q)).sort((a,b) => (b.date||'').localeCompare(a.date||''));
  if(!rows.length) return `<tr><td colspan="6">${acxEmpty('No journal vouchers found', q ? 'Try a different search.' : 'Use the button above to post the first one.')}</td></tr>`;
  return rows.map(j => {
    const amt = (j.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
    return `<tr class="${j.voided ? 'acx-void' : ''}"><td><b>${escapeHtml(j.voucherNo)}</b></td><td>${escapeHtml(j.date)}</td><td>${escapeHtml(j.type || 'Journal')}</td><td>${escapeHtml(j.narration || '—')}</td><td class="acx-r"><b>${fmtMoney(amt)}</b></td>
      <td class="acx-act"><div class="sf-actions">${j.voided ? `<span class="sf-badge sf-badge--upcoming" title="${escapeHtml(j.voidReason || '')}">Voided</span>` : ''}${canVoid && !j.voided ? sfBtn('danger', '', 'Void', `voidJournalVoucher('${j.id}')`) : ''}</div></td></tr>`;
  }).join('');
}
function acxJvSearch(v){
  acctJournalSearch = v;
  const t = document.getElementById('acxJvRows'); if(t) t.innerHTML = acxJvRowsHtml();
}
function renderAcctJournalTab(body){
  ensureJvDraft();
  const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_journal', 'create');
  const coa = getChartOfAccounts().filter(a => a.active !== false);
  const live = acctJournalVouchers.filter(j => !j.voided);
  const totalAmt = live.reduce((s, j) => s + (j.lines || []).reduce((x, l) => x + (Number(l.debit) || 0), 0), 0);
  const contra = live.filter(j => j.type === 'Contra').length;
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Journal vouchers', live.length, 'plain', 'excluding voided')}
      ${sfKpi('Total posted', fmtMoney(totalAmt), 'plain', 'sum of debits')}
      ${sfKpi('Contra entries', contra, 'plain', 'bank / cash transfers')}
      ${sfKpi('Voided', acctJournalVouchers.length - live.length, 'plain', 'kept for audit')}
    </section>
    <div class="iv-toolbar">
      <input class="input iv-search" type="search" placeholder="Search voucher or narration…" value="${escapeHtml(acctJournalSearch)}" oninput="acxJvSearch(this.value)">
      <div class="iv-toolbar-actions">${canCreate ? acxToggleBtn('jv', '＋ New journal voucher') : ''}</div>
    </div>
    ${canCreate ? acxPanel('jv', 'New journal voucher',
      'For adjustments, opening entries, transfers between bank accounts (type <b>Contra</b>), or anything that doesn’t fit a simple Income/Expense voucher. Total Debit must equal total Credit before it can be saved.',
      `<div class="form-grid">
        <div class="f-field"><label>Date</label><input type="date" id="jvDate" value="${acctToday()}"></div>
        <div class="f-field"><label>Type</label><select id="jvType"><option>Journal</option><option>Contra</option></select></div>
        <div class="f-field full"><label>Narration</label><input type="text" id="jvNarration" placeholder="e.g. Transfer from Cash to SBI Bank Account"></div>
      </div>
      <div class="acx-linehead"><b>Lines</b>${sfBtn('soft', 'plus', 'Add line', 'addJvLine()')}</div>
      <div class="table-wrap"><table class="iv-table acx-jv"><thead><tr><th>Account</th><th class="acx-num">Debit (₹)</th><th class="acx-num">Credit (₹)</th><th></th></tr></thead>
        <tbody>
        ${jvDraftLines.map((l, i) => `<tr class="jv-line-row">
          <td><select class="input jv-line-account"><option value="">Select account…</option>${coa.map(a => `<option value="${a.key}" ${l.accountKey === a.key ? 'selected' : ''}>${a.group} — ${escapeHtml(a.name)}</option>`).join('')}</select></td>
          <td><input type="number" class="input jv-line-debit" min="0" value="${l.debit || ''}" oninput="acxJvLive()"></td>
          <td><input type="number" class="input jv-line-credit" min="0" value="${l.credit || ''}" oninput="acxJvLive()"></td>
          <td>${jvDraftLines.length > 2 ? `<button type="button" class="btn-danger-text" aria-label="Remove line" onclick="removeJvLine(${i})">🗑️</button>` : ''}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total <span id="acxJvState" class="sf-badge sf-badge--due">Enter amounts</span></td><td class="acx-num" id="acxJvD">${fmtMoney(0)}</td><td class="acx-num" id="acxJvC">${fmtMoney(0)}</td><td></td></tr></tfoot>
      </table></div>
      <div class="acx-form-actions">${sfBtn('primary', 'check', 'Save journal voucher', 'saveJournalVoucher()')}<button type="button" class="sf-btn sf-btn--soft" onclick="acxToggle('jv')">Close</button></div>`) : ''}
    <section class="sf-card">
      <div class="acx-tablehead"><b>Journal vouchers</b><span>${acctJournalVouchers.length}</span></div>
      <div class="table-wrap"><table class="iv-table"><thead><tr><th>Voucher</th><th>Date</th><th>Type</th><th>Narration</th><th class="acx-r">Amount</th><th></th></tr></thead>
      <tbody id="acxJvRows">${acxJvRowsHtml()}</tbody></table></div>
    </section>`;
  if(canCreate) acxJvLive();
}

/* ---------- 9. Bank & Reconciliation ---------- */
function renderAcctBankTab(body){
  const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_bank', 'create');
  const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_bank', 'delete');
  if((!acctReconAccountId || !acctBankAccounts.some(b => b.id === acctReconAccountId)) && acctBankAccounts.length) acctReconAccountId = acctBankAccounts[0].id;
  const ledger = acctBuildLedger();
  const bal = b => acctBalanceFromRows(ledger['bank:' + b.id] || [], 'Asset').balance;
  const act = acctBankAccounts.filter(b => b.active !== false);
  const cash = act.filter(b => b.type === 'Cash').reduce((s, b) => s + bal(b), 0);
  const bank = act.filter(b => b.type !== 'Cash').reduce((s, b) => s + bal(b), 0);
  const multi = act.length > 1;
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Total balance', fmtMoney(cash + bank), (cash + bank) >= 0 ? 'good' : 'danger', 'cash + bank')}
      ${sfKpi('In bank', fmtMoney(bank), 'plain')}
      ${sfKpi('Cash in hand', fmtMoney(cash), 'plain')}
      ${sfKpi('Active accounts', act.length, 'plain')}
    </section>
    <div class="iv-toolbar"><div class="iv-toolbar-actions">${canCreate ? acxToggleBtn('bk', '＋ Add bank / cash account') : ''}</div></div>
    ${canCreate ? acxPanel('bk', 'Add bank / cash account', '',
      `<div class="form-grid">
        <div class="f-field full"><label>Account name</label><input type="text" id="acctBankName" placeholder="e.g. Bank Account — SBI Current A/c"></div>
        <div class="f-field"><label>Type</label><select id="acctBankType"><option>Bank</option><option>Cash</option></select></div>
        <div class="f-field"><label>Bank name</label><input type="text" id="acctBankBankName" placeholder="e.g. State Bank of India"></div>
        <div class="f-field"><label>Account number</label><input type="text" id="acctBankAccNo" placeholder="Optional"></div>
        <div class="f-field"><label>IFSC</label><input type="text" id="acctBankIfsc" placeholder="Optional"></div>
        <div class="f-field"><label>Opening balance (₹)</label><input type="number" id="acctBankOpening" min="0" placeholder="0"></div>
        <div class="f-field"><label>Opening date</label><input type="date" id="acctBankOpeningDate" value="${acctToday()}"></div>
      </div>
      <div class="acx-form-actions">${sfBtn('primary', 'check', 'Add account', 'saveAcctBankAccount()')}<button type="button" class="sf-btn sf-btn--soft" onclick="acxToggle('bk')">Close</button></div>`) : ''}
    <section class="sf-card acx-card">
      <h4>Bank &amp; cash accounts <small>${acctBankAccounts.length}</small></h4>
      ${acctBankAccounts.length ? `<div class="table-wrap"><table class="iv-table"><thead><tr><th>Account</th><th>Type</th><th>Bank</th><th>A/c no.</th><th class="acx-r">Balance</th><th></th></tr></thead><tbody>
        ${acctBankAccounts.map(b => { const v = bal(b); return `<tr class="${b.active === false ? 'acx-void' : ''}"><td><b>${escapeHtml(b.name)}</b></td><td>${escapeHtml(b.type)}</td><td>${escapeHtml(b.bankName || '—')}</td><td>${escapeHtml(b.accountNo || '—')}</td><td class="acx-r"><b class="${acxMoneyTone(v)}">${fmtMoney(v)}</b></td>
          <td class="acx-act">${canDelete && multi ? `<div class="sf-actions">${sfBtn('link', '', b.active === false ? 'Reactivate' : 'Deactivate', `toggleAcctBankActive('${b.id}')`)}</div>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : acxEmpty('No accounts yet', 'Add a bank or cash account to start.')}
    </section>
    <section class="sf-card acx-card">
      <h4>Bank reconciliation</h4>
      <p class="acx-note">Tick every transaction that has cleared on your bank statement. The Reconciled Balance should match the statement’s closing balance once everything on it is ticked; anything unticked is still in transit (e.g. a cheque not yet presented).</p>
      <label class="acx-date"><span>Account</span><select class="input" id="acctReconAccountSel" onchange="acctReconAccountId=this.value; renderAcctBankTab(document.getElementById('accountingBody'));">
        ${acctBankAccounts.map(b => `<option value="${b.id}" ${acctReconAccountId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}</select></label>
      ${renderAcctReconciliationBody(acctReconAccountId, ledger)}
    </section>`;
}
function renderAcctReconciliationBody(bankId, ledger){
  const bank = acctBankAccounts.find(b => b.id === bankId);
  if(!bank) return acxEmpty('Add a bank or cash account first.');
  const rows = (ledger['bank:' + bankId] || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let recBal = 0, ledBal = 0, pending = 0;
  const trs = rows.map(r => {
    const rid = acctRowId(r), done = !!acctReconciled[rid], net = r.debit - r.credit;
    ledBal += net; if(done) recBal += net; else pending++;
    return `<tr class="${done ? '' : 'acx-pending'}"><td><input type="checkbox" aria-label="Reconciled" ${done ? 'checked' : ''} onchange="toggleAcctReconciledRow('${rid.replace(/'/g, "\\'")}')"></td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.narration)}</td><td>${escapeHtml(r.source)}</td><td class="acx-r"><b class="${acxMoneyTone(net)}">${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}</b></td></tr>`;
  }).join('');
  const st = bank.lastStatementBalance != null ? Number(bank.lastStatementBalance) : null;
  const diff = st != null ? Math.round((st - recBal) * 100) / 100 : null;
  return `
    <section class="sf-kpis acx-kpis-in">
      ${sfKpi('Ledger balance', fmtMoney(ledBal), 'plain')}
      ${sfKpi('Reconciled balance', fmtMoney(recBal), 'plain')}
      ${sfKpi('Difference vs statement', st != null ? fmtMoney(diff) : '—', st == null ? 'plain' : (diff === 0 ? 'good' : 'danger'), st != null ? (diff === 0 ? 'matches statement' : 'does not match yet') : 'enter closing balance')}
      ${sfKpi('Not yet cleared', pending, pending ? 'warn' : 'good', 'transactions')}
    </section>
    <div class="acx-stmt">
      <label class="acx-date"><span>Statement closing balance (₹)</span><input class="input" type="number" id="acctStatementBal" value="${bank.lastStatementBalance != null ? bank.lastStatementBalance : ''}" placeholder="Enter to compare"></label>
      ${sfBtn('soft', 'check', 'Save', `saveAcctStatementBalance('${bankId}')`)}
    </div>
    <div class="table-wrap"><table class="iv-table"><thead><tr><th style="width:44px;">✓</th><th>Date</th><th>Narration</th><th>Source</th><th class="acx-r">Amount</th></tr></thead>
    <tbody>${rows.length ? trs : `<tr><td colspan="5">${acxEmpty('No transactions on this account yet')}</td></tr>`}</tbody></table></div>`;
}

/* ---------- 10. Fixed Assets ---------- */
function renderAcctAssetsTab(body){
  const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_assets', 'create');
  const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_assets', 'delete');
  const today = acctToday();
  const totalCost = acctFixedAssets.reduce((s, a) => s + (Number(a.purchaseCost) || 0), 0);
  const totalDep = acctFixedAssets.reduce((s, a) => s + acctAccumulatedDepreciation(a, today), 0);
  const disposed = acctFixedAssets.filter(a => a.active === false).length;
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Total asset cost', fmtMoney(totalCost), 'plain')}
      ${sfKpi('Accumulated depreciation', fmtMoney(totalDep), 'danger')}
      ${sfKpi('Current book value', fmtMoney(totalCost - totalDep), 'good')}
      ${sfKpi('Assets', acctFixedAssets.length - disposed, 'plain', disposed ? disposed + ' disposed' : 'in use')}
    </section>
    <div class="iv-toolbar"><div class="iv-toolbar-actions">${canCreate ? acxToggleBtn('fa', '＋ Add fixed asset') : ''}</div></div>
    ${canCreate ? acxPanel('fa', 'Add fixed asset',
      'Buildings, furniture, computers, lab equipment, vehicles — anything the school owns that loses value over time. Depreciation is straight-line: (Cost − Salvage) ÷ Useful life, prorated by how long you’ve owned it.',
      `<div class="form-grid">
        <div class="f-field full"><label>Asset name</label><input type="text" id="assetName" placeholder="e.g. Computer Lab — 20 Desktops"></div>
        <div class="f-field"><label>Category</label><input type="text" id="assetCategory" placeholder="e.g. IT Equipment, Furniture, Vehicle"></div>
        <div class="f-field"><label>Purchase date</label><input type="date" id="assetPurchaseDate" value="${today}"></div>
        <div class="f-field"><label>Purchase cost (₹)</label><input type="number" id="assetCost" min="0" placeholder="0"></div>
        <div class="f-field"><label>Salvage value (₹)</label><input type="number" id="assetSalvage" min="0" placeholder="0"></div>
        <div class="f-field"><label>Useful life (years)</label><input type="number" id="assetLife" min="1" placeholder="e.g. 5"></div>
      </div>
      <div class="acx-form-actions">${sfBtn('primary', 'check', 'Add asset', 'saveAcctFixedAsset()')}<button type="button" class="sf-btn sf-btn--soft" onclick="acxToggle('fa')">Close</button></div>`) : ''}
    <section class="sf-card">
      <div class="acx-tablehead"><b>Fixed assets register</b><span>${acctFixedAssets.length}</span></div>
      <div class="table-wrap"><table class="iv-table"><thead><tr><th>Asset</th><th>Category</th><th>Purchased</th><th class="acx-r">Cost</th><th class="acx-r">Depreciation</th><th class="acx-r">Book value</th><th></th></tr></thead><tbody>
      ${acctFixedAssets.length ? acctFixedAssets.map(a => {
        const dep = acctAccumulatedDepreciation(a, today), book = acctAssetBookValue(a, today);
        return `<tr class="${a.active === false ? 'acx-void' : ''}"><td><b>${escapeHtml(a.name)}</b>${a.active === false ? ' <span class="sf-badge sf-badge--upcoming">Disposed</span>' : ''}</td><td>${escapeHtml(a.category || '—')}</td><td>${escapeHtml(a.purchaseDate || '—')}</td><td class="acx-r">${fmtMoney(a.purchaseCost)}</td><td class="acx-r"><span class="acx-out">${fmtMoney(dep)}</span></td><td class="acx-r"><b>${fmtMoney(book)}</b></td>
          <td class="acx-act">${canDelete && a.active !== false ? `<div class="sf-actions">${sfBtn('danger', '', 'Mark disposed', `disposeAcctFixedAsset('${a.id}')`)}</div>` : ''}</td></tr>`;
      }).join('') : `<tr><td colspan="7">${acxEmpty('No fixed assets recorded yet', 'Use the button above to add the first one.')}</td></tr>`}
      </tbody></table></div>
    </section>`;
}

/* ---------- 11. Budgets ---------- */
function renderAcctBudgetTab(body){
  const canCreate = getAccountingTabAccess(currentUser.role, 'accounting_budget', 'create');
  const canDelete = getAccountingTabAccess(currentUser.role, 'accounting_budget', 'delete');
  const coa = getChartOfAccounts().filter(a => (a.type === 'Income' || a.type === 'Expense') && a.active !== false);
  const y = Number(acctToday().slice(0, 4));
  let budTot = 0, actTot = 0, over = 0;
  const rows = acctBudgets.map(b => {
    const acct = coaAccountByKey(b.accountKey);
    const actual = acctActualForAccountInRange(b.accountKey, b.startDate, b.endDate);
    const budget = Number(b.budgetedAmount) || 0;
    const variance = actual - budget;
    const isExp = acct && acct.type === 'Expense';
    const bad = isExp ? variance > 0 : variance < 0;
    if(bad) over++;
    budTot += budget; actTot += actual;
    return { b, acct, actual, budget, variance, bad, used: budget > 0 ? Math.round(actual / budget * 100) : 0 };
  });
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Budget lines', acctBudgets.length, 'plain')}
      ${sfKpi('Budgeted', fmtMoney(budTot), 'plain')}
      ${sfKpi('Actual', fmtMoney(actTot), 'plain')}
      ${sfKpi('Off budget', over, over ? 'danger' : 'good', 'expense over or income short')}
    </section>
    <div class="iv-toolbar"><p class="acx-note acx-grow">Set a budgeted amount for an Income or Expense account over a period (a term, a financial year) and compare it with what actually happened.</p>
      <div class="iv-toolbar-actions">${canCreate ? acxToggleBtn('bd', '＋ Add budget line') : ''}</div></div>
    ${canCreate ? acxPanel('bd', 'Add budget line', '',
      `<div class="form-grid">
        <div class="f-field full"><label>Label</label><input type="text" id="budgetLabel" placeholder="e.g. FY ${y}-${String(y + 1).slice(2)}"></div>
        <div class="f-field"><label>Start date</label><input type="date" id="budgetStart" value="${y}-04-01"></div>
        <div class="f-field"><label>End date</label><input type="date" id="budgetEnd" value="${y + 1}-03-31"></div>
        <div class="f-field"><label>Account</label><select id="budgetAccount">${coa.map(a => `<option value="${a.key}">${a.group} — ${escapeHtml(a.name)}</option>`).join('')}</select></div>
        <div class="f-field"><label>Budgeted amount (₹)</label><input type="number" id="budgetAmount" min="0" placeholder="0"></div>
      </div>
      <div class="acx-form-actions">${sfBtn('primary', 'check', 'Add budget line', 'saveAcctBudget()')}<button type="button" class="sf-btn sf-btn--soft" onclick="acxToggle('bd')">Close</button></div>`) : ''}
    <section class="sf-card">
      <div class="acx-tablehead"><b>Budget vs actual</b><span>${acctBudgets.length}</span></div>
      <div class="table-wrap"><table class="iv-table"><thead><tr><th>Label</th><th>Period</th><th>Account</th><th class="acx-r">Budgeted</th><th class="acx-r">Actual</th><th class="acx-r">Variance</th><th class="acx-netcol">Used</th><th></th></tr></thead><tbody>
      ${rows.length ? rows.map(r => `<tr><td><b>${escapeHtml(r.b.label)}</b></td><td>${escapeHtml(r.b.startDate)} → ${escapeHtml(r.b.endDate)}</td><td>${escapeHtml(r.acct ? r.acct.name : r.b.accountKey)}</td><td class="acx-r">${fmtMoney(r.budget)}</td><td class="acx-r">${fmtMoney(r.actual)}</td>
        <td class="acx-r"><b class="${r.bad ? 'acx-out' : 'acx-in'}">${r.variance >= 0 ? '+' : '−'}${fmtMoney(Math.abs(r.variance))}</b></td>
        <td class="acx-netcol"><span class="sf-badge sf-badge--${r.bad ? 'overdue' : 'paid'}">${r.bad ? '! ' : '✓ '}${r.used}%</span><div class="acx-bar acx-bar-sm"><i class="acx-bar-${r.bad ? 'out' : 'in'}" style="width:${Math.min(100, r.used)}%"></i></div></td>
        <td class="acx-act">${canDelete ? `<div class="sf-actions">${sfBtn('danger', '', 'Delete', `deleteAcctBudget('${r.b.id}')`)}</div>` : ''}</td></tr>`).join('') : `<tr><td colspan="8">${acxEmpty('No budget lines yet', 'Use the button above to add the first one.')}</td></tr>`}
      </tbody></table></div>
    </section>`;
}
