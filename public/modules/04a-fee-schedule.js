/* ===== FEE SCHEDULE: Yearly / Terms / Monthly =====
 *
 * Each fee head (Tuition, Bus, Stock, Hostel) can be remitted Yearly, in Terms
 * or Monthly. This file turns a saved schedule plus a student's numbers into
 * installments, each with its own due date, amount, paid amount and status.
 *
 * Design rules (see the plan doc):
 *  - Installments are DERIVED every time, never stored. No payment is ever
 *    edited or migrated, and voids/refunds re-allocate by themselves.
 *  - Installments always add up to the same net payable the app already
 *    computes (annual amount minus discounts), so Total Due is unchanged.
 *  - With no schedule saved, every fee head behaves as Yearly, exactly as before.
 *
 * Section 1 is pure (no DOM, no globals) and is unit-tested in Node.
 * Section 2 is a thin adapter over the app's globals.
 */

const FEE_SCHEDULE_KEY = 'fee-schedule';
const SCHEDULE_MODES = { yearly: 'Yearly', terms: 'Terms', monthly: 'Monthly' };
OBJECT_BACKED_KEYS[FEE_SCHEDULE_KEY] = '/api/kv/' + FEE_SCHEDULE_KEY;

// { [academicYear]: { [feeHeadKey]: categoryConfig } }, where categoryConfig is
//   { mode:'yearly',  due:'YYYY-MM-DD' }
//   { mode:'terms',   terms:[{ id, name, from, to, due, share }] }   share = percent
//   { mode:'monthly', startMonth:'YYYY-MM', months:1-12, dueDay:1-28 }
let feeSchedule = {};
async function loadFeeSchedule(){
  feeSchedule = await storageGet(FEE_SCHEDULE_KEY, {});
}

/* ---------- 1. Pure logic ---------- */

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad2(n){ return String(n).padStart(2, '0'); }
function isoDate(y, m, d){ return y + '-' + pad2(m) + '-' + pad2(d); }          // m is 1-12
function daysInMonth(y, m){ return new Date(y, m, 0).getDate(); }               // m is 1-12
function localISODate(d){ d = d || new Date(); return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function round2(n){ return Math.round((Number(n) || 0) * 100) / 100; }
function clampInt(v, min, max, fallback){
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}
function isValidISODate(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if(!m) return false;
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return dt.getFullYear() === +m[1] && dt.getMonth() === +m[2] - 1 && dt.getDate() === +m[3];
}

// '2026-06-30' -> '30 Jun 2026'; anything that is not a real date -> an em dash.
function fmtISODate(iso){
  if(!isValidISODate(iso)) return '—';
  return +iso.slice(8, 10) + ' ' + MONTH_SHORT[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
}

// Splits `total` by `shares` (any positive weights). Whole-rupee totals give
// whole-rupee parts; the last part absorbs rounding so parts sum to `total`.
function splitAmount(total, shares){
  const n = shares.length;
  if(!n) return [];
  const weightSum = shares.reduce((a, b) => a + b, 0);
  const weights = weightSum > 0 ? shares.map(s => s / weightSum) : shares.map(() => 1 / n);
  const whole = Number.isInteger(total);
  const parts = [];
  let used = 0;
  weights.forEach((w, i) => {
    if(i === n - 1){ parts.push(round2(total - used)); return; }
    const part = whole ? Math.round(total * w) : round2(total * w);
    parts.push(part);
    used = round2(used + part);
  });
  return parts;
}

function evenShares(n){
  if(n <= 0) return [];
  const each = Math.floor(10000 / n) / 100;
  const shares = Array(n).fill(each);
  shares[n - 1] = round2(100 - each * (n - 1));
  return shares;
}

function yearlySlots(cfg, fallbackDue){
  return [{ id: 'y1', label: 'Full year', from: '', to: '', due: (cfg && cfg.due) || fallbackDue || '', share: 100 }];
}
function termSlots(cfg){
  return (cfg.terms || []).map((t, i) => ({
    id: t.id || 't' + (i + 1), label: t.name || 'Term ' + (i + 1),
    from: t.from || '', to: t.to || '', due: t.due || '', share: Number(t.share) || 0,
  }));
}
function monthlySlots(cfg){
  const start = /^(\d{4})-(\d{2})$/.exec(cfg.startMonth || '');
  if(!start) return [];
  const count = clampInt(cfg.months, 1, 12, 12);
  const dueDay = clampInt(cfg.dueDay, 1, 28, 10);
  let y = +start[1], mo = +start[2];
  const slots = [];
  for(let i = 0; i < count; i++){
    slots.push({
      id: 'm' + (i + 1), label: MONTH_SHORT[mo - 1] + ' ' + y,
      from: isoDate(y, mo, 1), to: isoDate(y, mo, daysInMonth(y, mo)), due: isoDate(y, mo, dueDay),
      share: 100 / count,
    });
    mo++; if(mo > 12){ mo = 1; y++; }
  }
  return slots;
}

// A missing or unusable config always falls back to Yearly, never to nothing.
function scheduleSlots(cfg, fallbackDue){
  if(cfg && cfg.mode === 'terms'){ const s = termSlots(cfg); if(s.length) return s; }
  if(cfg && cfg.mode === 'monthly'){ const s = monthlySlots(cfg); if(s.length) return s; }
  return yearlySlots(cfg, fallbackDue);
}

function buildInstallments(cfg, netPayable, fallbackDue){
  const slots = scheduleSlots(cfg, fallbackDue);
  const amounts = splitAmount(Math.max(Number(netPayable) || 0, 0), slots.map(s => s.share));
  return slots.map((s, i) => ({ id: s.id, label: s.label, from: s.from, to: s.to, due: s.due, amount: amounts[i] }));
}

// 'due' also covers an installment with no due date: with no date set the
// full amount is simply payable now.
function installmentStatus(due, outstanding, today){
  if(outstanding <= 0) return 'paid';
  if(!due || due === today) return 'due';
  return due < today ? 'overdue' : 'upcoming';
}

// Everything collected for the fee head is allocated to installments, oldest first.
function allocatePaid(installments, collected, today){
  let left = Math.max(Number(collected) || 0, 0);
  return installments.map(inst => {
    const paid = round2(Math.min(left, inst.amount));
    left = round2(left - paid);
    const outstanding = round2(inst.amount - paid);
    return Object.assign({}, inst, {
      paid, outstanding, partial: paid > 0 && outstanding > 0,
      status: installmentStatus(inst.due, outstanding, today),
    });
  });
}

function summarizeInstallments(insts){
  const sum = (list, key) => round2(list.reduce((a, i) => a + i[key], 0));
  const unpaid = insts.filter(i => i.outstanding > 0);
  const payableNow = unpaid.filter(i => i.status === 'overdue' || i.status === 'due');
  const overdue = unpaid.filter(i => i.status === 'overdue');
  return {
    total: sum(insts, 'amount'), paid: sum(insts, 'paid'), outstanding: sum(insts, 'outstanding'),
    dueTillToday: sum(payableNow, 'outstanding'),
    overdueAmount: sum(overdue, 'outstanding'), overdueCount: overdue.length,
    firstUnpaid: unpaid[0] || null,
    next: unpaid.find(i => i.status === 'upcoming') || null,
  };
}

// Same arithmetic the app's late-fee rule has always used (due date plus grace
// days, compared with the current time), so Yearly behaves identically.
function isPastCutoff(due, graceDays, now){
  if(!due) return false;
  const cutoff = new Date(due);
  cutoff.setDate(cutoff.getDate() + (Number(graceDays) || 0));
  return (now || new Date()) > cutoff;
}
// One flat late fee per fee head while any unpaid installment is past its cutoff.
function scheduleLateFee(installments, lateRule, now){
  if(!lateRule || !Number(lateRule.amount)) return 0;
  const late = installments.some(i => i.outstanding > 0 && isPastCutoff(i.due, lateRule.graceDays, now));
  return late ? Number(lateRule.amount) : 0;
}

// Receipt text for a payment of `amount`, e.g. "Term 2" or "Term 2, Term 3 (part)".
// Call with installments as they stand BEFORE the payment is recorded.
function installmentLabelForPayment(installments, amount){
  let left = round2(amount);
  const names = [];
  let partial = false;
  for(const i of installments){
    if(left <= 0) break;
    if(i.outstanding <= 0) continue;
    const take = Math.min(left, i.outstanding);
    names.push(i.label);
    left = round2(left - take);
    partial = take < i.outstanding;
  }
  return names.length ? names.join(', ') + (partial ? ' (part)' : '') : '';
}

// Returns a list of plain-language problems; an empty list means it can be saved.
// Dates only have to fall in the two calendar years of the academic year label
// ("2026-27" means 2026 or 2027), which catches typos like 2025 without
// assuming which month the school year starts.
function validateCategorySchedule(cfg, academicYear){
  const errors = [];
  const ay = /^(\d{4})-(\d{2})$/.exec(academicYear || '');
  const inYear = d => !ay || +d.slice(0, 4) === +ay[1] || +d.slice(0, 4) === +ay[1] + 1;
  const checkDate = (d, what) => {
    if(!isValidISODate(d)){ errors.push(what + ' is not a valid date.'); return false; }
    if(!inYear(d)){ errors.push(what + ' is outside the academic year ' + academicYear + '.'); return false; }
    return true;
  };
  if(!cfg || cfg.mode === 'yearly'){
    if(cfg && cfg.due) checkDate(cfg.due, 'The due date');
    return errors;
  }
  if(cfg.mode === 'monthly'){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(cfg.startMonth || '')) errors.push('Choose the first month.');
    else if(ay && !inYear(cfg.startMonth + '-01')) errors.push('The first month is outside the academic year ' + academicYear + '.');
    const months = parseInt(cfg.months, 10);
    if(!(months >= 1 && months <= 12)) errors.push('Number of months must be between 1 and 12.');
    const day = parseInt(cfg.dueDay, 10);
    if(!(day >= 1 && day <= 28)) errors.push('Due day must be between 1 and 28.');
    return errors;
  }
  if(cfg.mode === 'terms'){
    const terms = cfg.terms || [];
    if(terms.length < 1){ errors.push('Add at least one term.'); return errors; }
    let shareTotal = 0, prevDue = '';
    terms.forEach((t, i) => {
      const n = (t.name || '').trim() || 'Term ' + (i + 1);
      if(!(t.name || '').trim()) errors.push('Term ' + (i + 1) + ' needs a name.');
      const dueOk = checkDate(t.due, n + ' due date');
      if(t.from && !checkDate(t.from, n + ' start')) { /* reported */ }
      if(t.to && !checkDate(t.to, n + ' end')) { /* reported */ }
      if(t.from && t.to && t.from > t.to) errors.push(n + ' ends before it starts.');
      if(dueOk){
        if(prevDue && t.due < prevDue) errors.push(n + ' is due before the term above it.');
        prevDue = t.due;
      }
      const share = Number(t.share);
      if(!(share > 0)) errors.push(n + ' needs a share above 0%.');
      shareTotal += share || 0;
    });
    if(Math.abs(shareTotal - 100) > 0.01) errors.push('Shares add up to ' + round2(shareTotal) + '%, they must add up to 100%.');
  }
  return errors;
}

// Suggested starting point for a new Terms schedule: three equal terms.
function defaultTermsConfig(academicYear){
  const ay = /^(\d{4})-(\d{2})$/.exec(academicYear || '');
  const y1 = ay ? +ay[1] : new Date().getFullYear();
  const shares = evenShares(3);
  return {
    mode: 'terms',
    terms: [
      { id: 't1', name: 'Term 1', from: isoDate(y1, 6, 1),  to: isoDate(y1, 8, 31),                          due: isoDate(y1, 6, 30),  share: shares[0] },
      { id: 't2', name: 'Term 2', from: isoDate(y1, 9, 1),  to: isoDate(y1, 11, 30),                         due: isoDate(y1, 9, 30),  share: shares[1] },
      { id: 't3', name: 'Term 3', from: isoDate(y1, 12, 1), to: isoDate(y1 + 1, 2, daysInMonth(y1 + 1, 2)), due: isoDate(y1, 12, 31), share: shares[2] },
    ],
  };
}

// Copies a category config forward by `years` (used to prefill a new academic
// year from the previous one; the admin still has to confirm and save).
function shiftScheduleYear(cfg, years){
  const shiftDate = d => {
    if(!isValidISODate(d)) return d;
    const y = +d.slice(0, 4) + years, m = +d.slice(5, 7), day = +d.slice(8, 10);
    return isoDate(y, m, Math.min(day, daysInMonth(y, m)));
  };
  const copy = JSON.parse(JSON.stringify(cfg || { mode: 'yearly' }));
  if(copy.due) copy.due = shiftDate(copy.due);
  if(copy.startMonth) copy.startMonth = (+copy.startMonth.slice(0, 4) + years) + copy.startMonth.slice(4);
  (copy.terms || []).forEach(t => { t.from = shiftDate(t.from); t.to = shiftDate(t.to); t.due = shiftDate(t.due); });
  return copy;
}

/* ---------- 2. Adapter over the app's globals ---------- */

function categoryScheduleFor(cat){
  const forYear = feeSchedule[currentAcademicYearValue] || {};
  return forYear[cat] || { mode: 'yearly' };
}
function scheduleFallbackDue(){
  return (typeof lateFeeSettings !== 'undefined' && lateFeeSettings.dueDate) || '';
}
// `pc` is one entry of computeStudentFinance(s).perCat. The result's
// summary.outstanding always equals pc.receivable.
function studentCategorySchedule(cat, pc, today){
  const cfg = categoryScheduleFor(cat);
  const installments = allocatePaid(buildInstallments(cfg, pc.netPayable, scheduleFallbackDue()), pc.collected, today || localISODate());
  return { cfg, mode: cfg.mode || 'yearly', installments, summary: summarizeInstallments(installments) };
}

// Receipt "Instalment" text for a payment on a fee head. Empty for Yearly heads
// (and unknown heads) so those receipts stay exactly as before.
function instalmentLabelFor(cat, pc, amount){
  if(!pc) return '';
  const sch = studentCategorySchedule(cat, pc);
  return sch.mode === 'yearly' ? '' : installmentLabelForPayment(sch.installments, amount);
}
