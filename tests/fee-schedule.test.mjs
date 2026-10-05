// Unit tests for public/modules/04a-fee-schedule.js. No dependencies.
// Run from the repo root:  node tests/fee-schedule.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'public', 'modules', '04a-fee-schedule.js'), 'utf8');

// The module is a classic browser script that shares one global scope with the
// rest of the app, so it is loaded into a sandbox with just the globals it touches.
const ctx = vm.createContext({
  OBJECT_BACKED_KEYS: {},
  storageGet: async (_key, fallback) => fallback,
  currentAcademicYearValue: '2026-27',
  lateFeeSettings: { amount: 0, graceDays: 0, dueDate: '' },
  CATS: { fee: 'Tuition Fee', bus: 'Bus Fee', stock: 'Stock', hostel: 'Hostel' },
});
vm.runInContext(source, ctx);
const E = ctx; // function declarations become properties of the sandbox global

// Values built inside the sandbox have a different Array prototype, which strict
// deepEqual rejects even when identical, so they are compared after a JSON round-trip.
const plain = v => JSON.parse(JSON.stringify(v));
const same = (actual, expected) => assert.deepEqual(plain(actual), expected);

let passed = 0;
function test(name, fn){
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch(err){ console.error('  FAIL ' + name + '\n       ' + err.message); process.exitCode = 1; }
}

// Seeded generator so a failure is reproducible.
let seed = 20261005;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// The app's original late-fee rule, copied from computeLateFeeFor() in
// 07-manage-fee-module.js, kept here as the reference for the Yearly parity test.
function legacyLateFee(outstanding, rule, now){
  if(!rule.dueDate || !rule.amount || outstanding <= 0) return 0;
  const cutoff = new Date(rule.dueDate);
  cutoff.setDate(cutoff.getDate() + (Number(rule.graceDays) || 0));
  return now > cutoff ? Number(rule.amount) : 0;
}

console.log('Dates');
test('fmtISODate formats real dates and dashes the rest', () => {
  assert.equal(E.fmtISODate('2026-06-30'), '30 Jun 2026');
  assert.equal(E.fmtISODate('2026-02-31'), '—');
  assert.equal(E.fmtISODate(''), '—');
  assert.equal(E.fmtISODate(undefined), '—');
});

console.log('splitAmount');
test('parts sum to the total and the last part absorbs rounding', () => {
  const parts = E.splitAmount(10000, [100/3, 100/3, 100/3]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 10000);
  same(parts, [3333, 3333, 3334]);
});
test('whole-rupee totals give whole-rupee parts', () => {
  E.splitAmount(12345, [40, 30, 30]).forEach(p => assert.ok(Number.isInteger(p)));
});
test('fractional totals keep two decimals and still sum exactly', () => {
  const parts = E.splitAmount(100.5, [50, 50]);
  assert.equal(E.round2(parts[0] + parts[1]), 100.5);
});
test('zero or missing shares fall back to an equal split', () => {
  same(E.splitAmount(900, [0, 0, 0]), [300, 300, 300]);
});

console.log('Yearly (must match the app as it works today)');
test('no schedule saved: one installment equal to net payable', () => {
  const insts = E.buildInstallments({ mode: 'yearly' }, 30000, '');
  assert.equal(insts.length, 1);
  assert.equal(insts[0].amount, 30000);
});
test('Yearly uses its own due date, else the Late Fees date', () => {
  assert.equal(E.buildInstallments({ mode: 'yearly', due: '2026-07-15' }, 100, '2026-06-30')[0].due, '2026-07-15');
  assert.equal(E.buildInstallments({ mode: 'yearly' }, 100, '2026-06-30')[0].due, '2026-06-30');
});
test('outstanding equals max(net - collected, 0) for 500 random students', () => {
  for(let i = 0; i < 500; i++){
    const net = Math.round(rand() * 80000), collected = Math.round(rand() * 90000);
    const insts = E.allocatePaid(E.buildInstallments({ mode: 'yearly', due: '2026-06-30' }, net, ''), collected, '2026-10-05');
    assert.equal(E.summarizeInstallments(insts).outstanding, Math.max(net - collected, 0));
  }
});
test('late fee matches the original rule for 500 random cases', () => {
  const dates = ['2026-06-30', '2026-09-30', '2026-12-31', ''];
  for(let i = 0; i < 500; i++){
    const rule = { dueDate: dates[Math.floor(rand() * dates.length)], graceDays: Math.floor(rand() * 20), amount: Math.floor(rand() * 3) * 100 };
    const net = Math.round(rand() * 50000), collected = Math.round(rand() * 55000);
    const now = new Date(2026, Math.floor(rand() * 12), 1 + Math.floor(rand() * 28));
    const insts = E.allocatePaid(E.buildInstallments({ mode: 'yearly' }, net, rule.dueDate), collected, E.localISODate(now));
    assert.equal(E.scheduleLateFee(insts, rule, now), legacyLateFee(Math.max(net - collected, 0), rule, now));
  }
});

console.log('Terms');
const plan = E.defaultTermsConfig('2026-27');
plan.terms[0].share = 40; plan.terms[1].share = 30; plan.terms[2].share = 30;
test('the plan example: 30,000 in 40/30/30', () => {
  const insts = E.allocatePaid(E.buildInstallments(plan, 30000, ''), 15000, '2026-10-05');
  same(insts.map(i => i.amount), [12000, 9000, 9000]);
  same(insts.map(i => i.paid), [12000, 3000, 0]);
  same(insts.map(i => i.status), ['paid', 'overdue', 'upcoming']);
  const s = E.summarizeInstallments(insts);
  assert.equal(s.outstanding, 15000);
  assert.equal(s.dueTillToday, 6000);
  assert.equal(s.overdueCount, 1);
  assert.equal(s.next.due, '2026-12-31');
  assert.equal(s.next.amount, 9000);
  assert.equal(s.firstUnpaid.label, 'Term 2');
});
test('default terms are valid and equal shares sum to 100', () => {
  const d = E.defaultTermsConfig('2026-27');
  same(E.validateCategorySchedule(d, '2026-27'), []);
  assert.equal(E.round2(d.terms.reduce((a, t) => a + t.share, 0)), 100);
});
test('a due date equal to today is due, not overdue', () => {
  const insts = E.allocatePaid(E.buildInstallments(plan, 30000, ''), 0, '2026-09-30');
  same(insts.map(i => i.status), ['overdue', 'due', 'upcoming']);
});
test('overpaying leaves nothing outstanding and ignores the surplus', () => {
  const s = E.summarizeInstallments(E.allocatePaid(E.buildInstallments(plan, 30000, ''), 50000, '2026-10-05'));
  assert.equal(s.outstanding, 0);
  assert.equal(s.dueTillToday, 0);
});
test('a broken Terms config falls back to Yearly instead of breaking', () => {
  const insts = E.buildInstallments({ mode: 'terms', terms: [] }, 5000, '2026-06-30');
  assert.equal(insts.length, 1);
  assert.equal(insts[0].amount, 5000);
});
test('a fully discounted fee head produces zero amounts, all paid', () => {
  const insts = E.allocatePaid(E.buildInstallments(plan, 0, ''), 0, '2026-10-05');
  assert.ok(insts.every(i => i.status === 'paid'));
});
test('installments sum to net and outstanding to max(net - collected, 0) for 500 random cases', () => {
  for(let i = 0; i < 500; i++){
    const cfg = rand() < 0.5 ? plan : { mode: 'monthly', startMonth: '2026-06', months: 1 + Math.floor(rand() * 12), dueDay: 10 };
    const net = Math.round(rand() * 90000), collected = Math.round(rand() * 95000);
    const insts = E.allocatePaid(E.buildInstallments(cfg, net, ''), collected, '2026-10-05');
    const s = E.summarizeInstallments(insts);
    assert.equal(s.total, net);
    assert.equal(s.outstanding, Math.max(net - collected, 0));
  }
});

console.log('Monthly');
test('12 monthly installments from June, due on the 10th', () => {
  const insts = E.buildInstallments({ mode: 'monthly', startMonth: '2026-06', months: 12, dueDay: 10 }, 30000, '');
  assert.equal(insts.length, 12);
  assert.equal(insts[0].label, 'Jun 2026');
  assert.equal(insts[0].due, '2026-06-10');
  assert.equal(insts[11].label, 'May 2027');
  assert.equal(insts[11].due, '2027-05-10');
  assert.ok(insts.every(i => i.amount === 2500));
});
test('an amount that does not divide evenly still sums exactly', () => {
  const insts = E.buildInstallments({ mode: 'monthly', startMonth: '2026-06', months: 10, dueDay: 5 }, 10001, '');
  assert.equal(insts.reduce((a, i) => a + i.amount, 0), 10001);
});

console.log('Late fee with installments');
const lateRule = { amount: 100, graceDays: 5 };
test('flat fee once while any unpaid installment is past its cutoff', () => {
  const insts = E.allocatePaid(E.buildInstallments(plan, 30000, ''), 0, '2026-12-31');
  assert.equal(E.scheduleLateFee(insts, lateRule, new Date(2027, 0, 20)), 100);
});
test('no late fee when everything past due has been paid', () => {
  const insts = E.allocatePaid(E.buildInstallments(plan, 30000, ''), 21000, '2026-10-05');
  assert.equal(E.scheduleLateFee(insts, lateRule, new Date(2026, 9, 5)), 0);
});
test('no late fee inside the grace period', () => {
  const insts = E.allocatePaid(E.buildInstallments(plan, 30000, ''), 0, '2026-07-02');
  assert.equal(E.scheduleLateFee(insts, lateRule, new Date(2026, 6, 2)), 0);
});

console.log('Receipt label');
test('names the installments a payment covers', () => {
  const insts = E.allocatePaid(E.buildInstallments(plan, 30000, ''), 12000, '2026-10-05');
  assert.equal(E.installmentLabelForPayment(insts, 9000), 'Term 2');
  assert.equal(E.installmentLabelForPayment(insts, 4000), 'Term 2 (part)');
  assert.equal(E.installmentLabelForPayment(insts, 12000), 'Term 2, Term 3 (part)');
  assert.equal(E.installmentLabelForPayment(insts, 18000), 'Term 2, Term 3');
});
test('a fully paid fee head has no label', () => {
  const insts = E.allocatePaid(E.buildInstallments(plan, 30000, ''), 30000, '2026-10-05');
  assert.equal(E.installmentLabelForPayment(insts, 100), '');
});

console.log('Validation');
const problems = cfg => E.validateCategorySchedule(cfg, '2026-27');
const withTerms = edit => { const c = E.defaultTermsConfig('2026-27'); edit(c); return c; };
test('shares that do not add to 100 are rejected', () => {
  assert.ok(problems(withTerms(c => { c.terms[0].share = 50; })).some(m => m.includes('100%')));
});
test('a term due before the one above it is rejected', () => {
  assert.ok(problems(withTerms(c => { c.terms[2].due = '2026-08-01'; })).some(m => m.includes('before the term above')));
});
test('a date outside the academic year is rejected', () => {
  assert.ok(problems(withTerms(c => { c.terms[0].due = '2025-06-30'; })).some(m => m.includes('outside the academic year')));
});
test('an impossible date is rejected', () => {
  assert.ok(problems(withTerms(c => { c.terms[0].due = '2026-02-31'; })).some(m => m.includes('not a valid date')));
});
test('a term that ends before it starts is rejected', () => {
  assert.ok(problems(withTerms(c => { c.terms[0].from = '2026-09-01'; c.terms[0].to = '2026-06-01'; })).some(m => m.includes('ends before')));
});
test('a nameless term is rejected', () => {
  assert.ok(problems(withTerms(c => { c.terms[1].name = ' '; })).some(m => m.includes('needs a name')));
});
test('Monthly checks start month, count and due day', () => {
  assert.equal(problems({ mode: 'monthly', startMonth: '2026-06', months: 12, dueDay: 10 }).length, 0);
  assert.ok(problems({ mode: 'monthly', startMonth: '', months: 12, dueDay: 10 }).length > 0);
  assert.ok(problems({ mode: 'monthly', startMonth: '2026-06', months: 13, dueDay: 10 }).length > 0);
  assert.ok(problems({ mode: 'monthly', startMonth: '2026-06', months: 12, dueDay: 31 }).length > 0);
});
test('Yearly may leave the due date empty', () => {
  same(problems({ mode: 'yearly' }), []);
});

console.log('Copy forward');
test('dates move forward a year and Feb 29 clamps', () => {
  const shifted = E.shiftScheduleYear({ mode: 'terms', terms: [{ id: 't1', name: 'T', from: '2028-02-29', to: '2028-05-31', due: '2028-03-01', share: 100 }] }, 1);
  assert.equal(shifted.terms[0].from, '2029-02-28');
  assert.equal(shifted.terms[0].to, '2029-05-31');
  assert.equal(shifted.terms[0].due, '2029-03-01');
});
test('Monthly start month and Yearly due date shift too', () => {
  assert.equal(E.shiftScheduleYear({ mode: 'monthly', startMonth: '2026-06', months: 12, dueDay: 10 }, 1).startMonth, '2027-06');
  assert.equal(E.shiftScheduleYear({ mode: 'yearly', due: '2026-06-30' }, 1).due, '2027-06-30');
});

console.log('Adapter');
test('uses the saved schedule for the current academic year only', () => {
  vm.runInContext('feeSchedule = { "2026-27": { fee: ' + JSON.stringify(plan) + ' } }', ctx);
  assert.equal(E.categoryScheduleFor('fee').mode, 'terms');
  assert.equal(E.categoryScheduleFor('bus').mode, 'yearly');
  vm.runInContext('currentAcademicYearValue = "2027-28"', ctx);
  assert.equal(E.categoryScheduleFor('fee').mode, 'yearly');
  vm.runInContext('currentAcademicYearValue = "2026-27"', ctx);
});
test('studentCategorySchedule outstanding equals the receivable it was given', () => {
  const pc = { expected: 32000, collected: 15000, discount: 2000, netPayable: 30000, receivable: 15000 };
  const r = E.studentCategorySchedule('fee', pc, '2026-10-05');
  assert.equal(r.mode, 'terms');
  assert.equal(r.summary.outstanding, pc.receivable);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
