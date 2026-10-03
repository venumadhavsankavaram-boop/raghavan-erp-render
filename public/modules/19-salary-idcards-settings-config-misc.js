const ACCT_BANK_ACCOUNTS_KEY = "acct-bank-accounts";
  const ACCT_FIXED_ASSETS_KEY = "acct-fixed-assets";
  const ACCT_OTHER_LEDGERS_KEY = "acct-other-ledgers";
  const ACCT_JOURNAL_KEY = "acct-journal-vouchers";
  const ACCT_BUDGETS_KEY = "acct-budgets";
  const ACCT_RECONCILED_KEY = "acct-reconciled";
  [ACCT_BANK_ACCOUNTS_KEY, ACCT_FIXED_ASSETS_KEY, ACCT_OTHER_LEDGERS_KEY, ACCT_JOURNAL_KEY, ACCT_BUDGETS_KEY, ACCT_RECONCILED_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  let acctBankAccounts = [], acctFixedAssets = [], acctOtherLedgers = [], acctJournalVouchers = [], acctBudgets = [], acctReconciled = {};
  // The whole Accounting ledger module (bank accounts, fixed assets, other
  // ledgers, journal vouchers, budgets, reconciliation state) is large and
  // ever-growing / self-contained — loaded lazily on first actual use
  // instead of at login. See ensureDataLoaded().
  async function loadAccountingLedgerData(){
    acctBankAccounts = await storageGet(ACCT_BANK_ACCOUNTS_KEY, [
      { id:'bnk_cash', name:'Cash in Hand', bankName:'', accountNo:'', ifsc:'', type:'Cash', openingBalance:0, openingDate:'', active:true },
      { id:'bnk_main', name:'Bank Account — Primary', bankName:'', accountNo:'', ifsc:'', type:'Bank', openingBalance:0, openingDate:'', active:true },
    ]);
    acctFixedAssets = await storageGet(ACCT_FIXED_ASSETS_KEY, []);
    acctOtherLedgers = await storageGet(ACCT_OTHER_LEDGERS_KEY, []);
    acctJournalVouchers = await storageGet(ACCT_JOURNAL_KEY, []);
    acctBudgets = await storageGet(ACCT_BUDGETS_KEY, []);
    acctReconciled = await storageGet(ACCT_RECONCILED_KEY, {});
  }
  function acctToday(){ return new Date().toISOString().slice(0,10); }

  // The 5 fee-collection streams already flow through `payments[]` — each
  // becomes its own built-in Income ledger account so the books show
  // exactly where fee revenue came from, matching how top Indian school
  // ERPs split fee income by type.
  const FEE_INCOME_ACCOUNTS = {
    fee:    { key:'feeinc:fee',    name:'Tuition Fee Income' },
    bus:    { key:'feeinc:bus',    name:'Bus Fee Income' },
    stock:  { key:'feeinc:stock',  name:'Stock / Canteen Sale Income' },
    hostel: { key:'feeinc:hostel', name:'Hostel Fee Income' },
    extra:  { key:'feeinc:extra',  name:'Other Fee Income (Admission, Fines, etc.)' },
  };
  function feeIncomeAccountFor(p){ return FEE_INCOME_ACCOUNTS[p.category] || FEE_INCOME_ACCOUNTS.extra; }
  const ACCT_GROUP_LABEL = { Asset:'Assets', Liability:'Liabilities', Equity:'Equity', Income:'Income', Expense:'Expense' };
  const ACCT_DEBIT_NORMAL_TYPES = new Set(['Asset','Expense']);
  // The standard bookkeeping technique for digitizing an existing school's
  // books: every opening balance (a bank account's starting balance, a
  // fixed asset's purchase cost, a manually added liability/equity
  // account's opening balance) needs an offsetting entry somewhere, or the
  // ledger wouldn't actually balance. All of them post their other leg here
  // — a normal, standard "Opening Balance Equity" clearing account that
  // absorbs exactly the net effect of going live with pre-existing
  // balances, the same way Tally/QuickBooks/ERPNext handle it.
  const ACCT_OPENING_EQUITY_KEY = 'equity:__opening__';

  // The Chart of Accounts IS this list — assembled live from its several
  // real sources (Bank/Cash accounts, Fixed Assets, manually added Other
  // Accounts, built-in Fee Income accounts, Income categories, Expense
  // categories) rather than duplicated into a separate master list that
  // could drift out of sync.
  function getChartOfAccounts(){
    const out = [];
    acctBankAccounts.forEach(b => out.push({ key:'bank:'+b.id, name:b.name, group:'Assets', type:'Asset', sub:'Cash & Bank', active:b.active!==false }));
    acctFixedAssets.forEach(a => out.push({ key:'asset:'+a.id, name:a.name, group:'Assets', type:'Asset', sub:'Fixed Assets', active:a.active!==false }));
    acctOtherLedgers.forEach(l => out.push({ key:'ledger:'+l.id, name:l.name, group:ACCT_GROUP_LABEL[l.type]||l.type, type:l.type, sub:l.type, active:l.active!==false }));
    Object.values(FEE_INCOME_ACCOUNTS).forEach(f => out.push({ key:f.key, name:f.name, group:'Income', type:'Income', sub:'Fee Income', active:true }));
    acctIncomeCategories.forEach(c => out.push({ key:'income:'+c, name:c, group:'Income', type:'Income', sub:'Other Income', active:true }));
    acctExpenseCategories.forEach(c => out.push({ key:'expense:'+c, name:c, group:'Expense', type:'Expense', sub:'Expense', active:true }));
    if(acctFixedAssets.some(a=>a.active!==false)) out.push({ key:'expense:__depreciation__', name:'Depreciation', group:'Expense', type:'Expense', sub:'Expense', active:true });
    out.push({ key:ACCT_OPENING_EQUITY_KEY, name:'Opening Balance Equity', group:'Equity', type:'Equity', sub:'Opening Balance Equity', active:true });
    return out;
  }
  function coaAccountByKey(key){ return getChartOfAccounts().find(a => a.key === key); }

  function defaultBankAccountForMode(mode){
    const cashAcct = acctBankAccounts.find(b => b.type==='Cash' && b.active!==false) || acctBankAccounts.find(b => b.type==='Cash') || acctBankAccounts[0];
    const bankAcct = acctBankAccounts.find(b => b.type==='Bank' && b.active!==false) || acctBankAccounts.find(b => b.type==='Bank') || cashAcct;
    if((mode||'').toLowerCase() === 'cash') return cashAcct ? cashAcct.id : (bankAcct ? bankAcct.id : '');
    return bankAcct ? bankAcct.id : (cashAcct ? cashAcct.id : '');
  }
  function acctBankAccountIdFor(record){ return record.bankAccountId || defaultBankAccountForMode(record.mode); }

  // Straight-line depreciation, prorated by elapsed time and capped at the
  // asset's useful life so book value never drops below salvage value.
  function acctAssetDepreciationPerYear(a){
    const cost = Number(a.purchaseCost)||0, salvage = Number(a.salvageValue)||0, life = Number(a.usefulLifeYears)||1;
    return Math.max(0, (cost - salvage) / life);
  }
  function acctAccumulatedDepreciation(a, asOfDate){
    if(!a.purchaseDate) return 0;
    const purchaseDate = new Date(a.purchaseDate);
    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    let years = (asOf - purchaseDate) / (365.25*86400000);
    years = Math.max(0, Math.min(years, Number(a.usefulLifeYears)||1));
    return Math.round(acctAssetDepreciationPerYear(a) * years * 100) / 100;
  }
  function acctAssetBookValue(a, asOfDate){
    return Math.round(((Number(a.purchaseCost)||0) - acctAccumulatedDepreciation(a, asOfDate)) * 100) / 100;
  }

  // The core engine: every real transaction the school's books contain,
  // flattened into individual Debit/Credit postings against a Chart of
  // Accounts key. Recomputed on demand (never stored) so there is nothing to
  // migrate and nothing that can drift out of sync with the source records.
  function acctAllPostings(){
    const rows = [];
    const push = (date, key, debit, credit, narration, source, sourceId, extra) => { if(debit||credit) rows.push(Object.assign({ date:date||'2000-01-01', key, debit:debit||0, credit:credit||0, narration:narration||'', source, sourceId }, extra||{})); };
    acctBankAccounts.forEach(b => {
      const amt=Number(b.openingBalance)||0; if(!amt) return;
      const debit = amt>0?amt:0, credit = amt<0?-amt:0;
      push(b.openingDate, 'bank:'+b.id, debit, credit, 'Opening Balance', 'Opening', b.id);
      push(b.openingDate, ACCT_OPENING_EQUITY_KEY, credit, debit, 'Opening Balance — '+b.name, 'Opening', b.id);
    });
    acctFixedAssets.forEach(a => {
      const amt=Number(a.purchaseCost)||0; if(!amt) return;
      push(a.purchaseDate, 'asset:'+a.id, amt, 0, 'Asset acquired — '+a.name, 'Asset Purchase', a.id);
      push(a.purchaseDate, ACCT_OPENING_EQUITY_KEY, 0, amt, 'Asset acquired — '+a.name, 'Asset Purchase', a.id);
    });
    acctOtherLedgers.forEach(l => {
      const amt = Number(l.openingBalance)||0; if(!amt) return;
      const normalDebit = l.type === 'Asset';
      const debit = normalDebit?Math.max(amt,0):(amt<0?-amt:0);
      const credit = normalDebit?(amt<0?-amt:0):Math.max(amt,0);
      push(l.openingDate, 'ledger:'+l.id, debit, credit, 'Opening Balance', 'Opening', l.id);
      push(l.openingDate, ACCT_OPENING_EQUITY_KEY, credit, debit, 'Opening Balance — '+l.name, 'Opening', l.id);
    });
    payments.filter(pBookedInLedger).forEach(p => {
      const amt = Number(p.amount)||0; if(!amt) return;
      const bankKey = 'bank:'+acctBankAccountIdFor(p), incAcct = feeIncomeAccountFor(p);
      const narr = 'Fee collected — ' + (p.studentName||'Student') + (p.receiptNo?' (Receipt '+p.receiptNo+')':'');
      push(p.date, bankKey, amt, 0, narr, 'Fee Payment', p.id);
      push(p.date, incAcct.key, 0, amt, narr, 'Fee Payment', p.id);
    });
    acctIncome.filter(i=>!i.voided).forEach(i => {
      const amt = Number(i.amount)||0; if(!amt) return;
      const bankKey = 'bank:'+acctBankAccountIdFor(i);
      const narr = 'Receipt Voucher ' + i.voucherNo + ' — ' + i.category + (i.party?' ('+i.party+')':'');
      push(i.date, bankKey, amt, 0, narr, 'Income Voucher', i.id, { voucherNo:i.voucherNo });
      push(i.date, 'income:'+i.category, 0, amt, narr, 'Income Voucher', i.id, { voucherNo:i.voucherNo });
    });
    acctExpenses.filter(e=>!e.voided).forEach(e => {
      const amt = Number(e.amount)||0; if(!amt) return;
      const bankKey = 'bank:'+acctBankAccountIdFor(e);
      const narr = 'Payment Voucher ' + e.voucherNo + ' — ' + e.category + (e.party?' to '+e.party:'');
      push(e.date, 'expense:'+e.category, amt, 0, narr, 'Expense Voucher', e.id, { voucherNo:e.voucherNo });
      push(e.date, bankKey, 0, amt, narr, 'Expense Voucher', e.id, { voucherNo:e.voucherNo });
    });
    acctJournalVouchers.filter(j=>!j.voided).forEach(j => {
      (j.lines||[]).forEach(ln => push(j.date, ln.accountKey, Number(ln.debit)||0, Number(ln.credit)||0, j.narration||('Journal Voucher '+j.voucherNo), 'Journal Voucher', j.id, { voucherNo:j.voucherNo, jvType:j.type }));
    });
    acctFixedAssets.filter(a=>a.active!==false).forEach(a => {
      const dep = acctAccumulatedDepreciation(a, acctToday());
      if(dep > 0){
        push(acctToday(), 'expense:__depreciation__', dep, 0, 'Accumulated depreciation — '+a.name, 'Depreciation', a.id);
        push(acctToday(), 'asset:'+a.id, 0, dep, 'Accumulated depreciation — '+a.name, 'Depreciation', a.id);
      }
    });
    return rows;
  }
  function acctBuildLedger(){
    const byKey = {};
    acctAllPostings().forEach(r => { (byKey[r.key] = byKey[r.key] || []).push(r); });
    return byKey;
  }
  function acctBalanceFromRows(rows, type){
    const debit = rows.reduce((s,r)=>s+r.debit,0), credit = rows.reduce((s,r)=>s+r.credit,0);
    const normalDebit = ACCT_DEBIT_NORMAL_TYPES.has(type);
    return { debit, credit, balance: normalDebit ? (debit-credit) : (credit-debit), normalDebit };
  }
  function acctActualForAccountInRange(key, startDate, endDate){
    const rows = acctAllPostings().filter(r => r.key===key && (!startDate || r.date>=startDate) && (!endDate || r.date<=endDate));
    const acct = coaAccountByKey(key);
    return acctBalanceFromRows(rows, acct?acct.type:'Expense').balance;
  }
  function acctRowId(r){ return [r.source, r.sourceId, r.key].join('|'); }
  async function toggleAcctReconciled(rowId, statementDate){
    if(acctReconciled[rowId]) delete acctReconciled[rowId];
    else acctReconciled[rowId] = { reconciledDate: statementDate || acctToday(), by: currentUser.name };
    await storageSet(ACCT_RECONCILED_KEY, acctReconciled);
  }

  /* ===== COMMUNICATIONS MODULE ===== */
  