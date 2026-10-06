/* ============================================================================
   Facilities -> Library screens: catalogue (cards / table), book editor,
   Issue & Return (2-step flow), Overdue & Fines, Settings.

   Presentation only. Saving, issuing, returning and deleting are still done by
   the handlers in module 21 (saveBook, deleteBook, issueBook, openReturnBook,
   returnBook, saveLibrarySettings, openBookEditor, backToCatalogList) which
   read the same element ids as before: libBookTitle, libBookAuthor,
   libBookCategory, libBookIsbn, libBookPublisher, libBookShelf, libBookTotal,
   libIssueBook, libBorrowerType, libDueDate, libBorrowerSearch,
   libBorrowerSuggestions, libLoanPeriod, libFinePerDay.

   Loads after module 21, so the functions below replace the old renderers.
   Shares the look of Accounting / Inventory: sfKpi, sfBtn, .sf-card, .iv-toolbar.
   ========================================================================== */

/* ---------- helpers ---------- */
let lbxLayout = 'cards';        // catalogue: cards | table
let lbxAvail = 'all';           // catalogue: all | avail | out
let lbxCat = '';                // catalogue: category filter
let lbxIssFilter = 'all';       // issued list: all | overdue

const LBX_TINTS = ['var(--gold)', 'var(--magenta)', 'var(--teal)', 'var(--navy)'];
function lbxTint(key){
  let h = 0;
  for(const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LBX_TINTS[h % LBX_TINTS.length];
}
function lbxMono(t){
  const w = String(t || '?').replace(/^(the|a|an)\s+/i, '').trim().split(/\s+/);
  return ((w[0] || '?')[0] + ((w[1] || '')[0] || '')).toUpperCase();
}
function lbxToday(){ return new Date().toISOString().slice(0, 10); }
function lbxDaysLate(due){
  return Math.max(0, Math.round((new Date(lbxToday()) - new Date(due)) / 86400000));
}
function lbxDaysLeft(due){
  return Math.round((new Date(due) - new Date(lbxToday())) / 86400000);
}
function lbxEmpty(title, text){
  return `<div class="lbx-empty"><b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>`;
}
function lbxBorrower(i){
  return `<span class="lbx-who"><span class="lbx-av" style="--tint:${lbxTint(i.borrowerName)}" aria-hidden="true">${escapeHtml(lbxMono(i.borrowerName))}</span><span><b>${escapeHtml(i.borrowerName || '—')}</b><small>${escapeHtml(i.borrowerType || '')}</small></span></span>`;
}
function lbxDueBadge(i){
  const late = lbxDaysLate(i.dueDate);
  if(i.dueDate < lbxToday()) return `<span class="sf-badge sf-badge--overdue"><span aria-hidden="true">!</span>Overdue ${late} day${late === 1 ? '' : 's'}</span>`;
  const left = lbxDaysLeft(i.dueDate);
  if(left === 0) return `<span class="sf-badge sf-badge--due"><span aria-hidden="true">&#9680;</span>Due today</span>`;
  if(left <= 3) return `<span class="sf-badge sf-badge--due"><span aria-hidden="true">&#9680;</span>Due in ${left} day${left === 1 ? '' : 's'}</span>`;
  return `<span class="sf-badge sf-badge--paid"><span aria-hidden="true">&#10003;</span>On time</span>`;
}
function lbxStockBadge(b){
  return b.availableCopies <= 0
    ? `<span class="sf-badge sf-badge--overdue"><span aria-hidden="true">!</span>All issued</span>`
    : `<span class="sf-badge sf-badge--paid"><span aria-hidden="true">&#10003;</span>Available</span>`;
}

/* ---------- 1. catalogue ---------- */
function renderCatalogList(body){
  const issued = libraryIssues.filter(i => i.status === 'Issued');
  const today = lbxToday();
  const overdue = issued.filter(i => i.dueDate < today).length;
  const copies = libraryBooks.reduce((s, b) => s + (Number(b.totalCopies) || 0), 0);
  const avail = libraryBooks.reduce((s, b) => s + (Number(b.availableCopies) || 0), 0);
  const cats = Array.from(new Set(libraryBooks.map(b => b.category).filter(Boolean))).sort();
  if(lbxCat && !cats.includes(lbxCat)) lbxCat = '';
  const canAdd = canSub('library_catalog', 'library', 'create');
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Titles', libraryBooks.length, 'plain', 'in the catalogue')}
      ${sfKpi('Copies on shelf', avail, 'good', `of ${copies} total`)}
      ${sfKpi('Currently issued', issued.length, 'plain')}
      ${sfKpi('Overdue', overdue, overdue > 0 ? 'danger' : 'good', overdue > 0 ? 'need to come back' : 'all on time')}
    </section>
    <div class="iv-toolbar lbx-toolbar">
      <input class="input iv-search" type="search" placeholder="Search title, author, ISBN&hellip;" aria-label="Search books" value="${escapeHtml(libCatalogSearch)}" oninput="libCatalogSearch=this.value; lbxPaintCatalog();">
      <div class="sf-segments" id="lbxAvailSeg" role="group" aria-label="Availability">
        <button type="button" data-v="all" class="${lbxAvail === 'all' ? 'active' : ''}" onclick="lbxSetAvail('all')">All</button>
        <button type="button" data-v="avail" class="${lbxAvail === 'avail' ? 'active' : ''}" onclick="lbxSetAvail('avail')">Available</button>
        <button type="button" data-v="out" class="${lbxAvail === 'out' ? 'active' : ''}" onclick="lbxSetAvail('out')">All issued</button>
      </div>
      ${cats.length ? `<select class="input lbx-cat" id="lbxCatSel" aria-label="Category" onchange="lbxCat=this.value; lbxPaintCatalog();">
        <option value="">All categories</option>${cats.map(c => `<option value="${escapeHtml(c)}" ${c === lbxCat ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>` : ''}
      <div class="sf-segments" id="lbxViewSeg" role="group" aria-label="Layout">
        <button type="button" data-v="cards" class="${lbxLayout === 'cards' ? 'active' : ''}" onclick="lbxSetLayout('cards')">Cards</button>
        <button type="button" data-v="table" class="${lbxLayout === 'table' ? 'active' : ''}" onclick="lbxSetLayout('table')">Table</button>
      </div>
      <div class="iv-toolbar-actions">${canAdd ? sfBtn('primary', 'plus', 'Add Book', 'openBookEditor()') : ''}</div>
    </div>
    <div class="lbx-count" id="lbxCount" aria-live="polite"></div>
    <div class="lbx-grid" id="lbxGrid"></div>
    <div class="sf-card" id="lbxTableCard"><div class="table-wrap">
      <table class="iv-table lbx-table">
        <thead><tr><th>Book</th><th>Category</th><th>ISBN</th><th>Shelf</th><th class="lbx-r">Copies</th><th>Status</th><th></th></tr></thead>
        <tbody id="lbxRows"></tbody>
      </table></div></div>
    <div id="lbxEmpty"></div>`;
  lbxPaintCatalog();
}
function lbxSetAvail(v){
  lbxAvail = v;
  document.querySelectorAll('#lbxAvailSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  lbxPaintCatalog();
}
function lbxSetLayout(v){
  lbxLayout = v;
  document.querySelectorAll('#lbxViewSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  lbxPaintCatalog();
}
function lbxBookActions(b){
  const ed = canSub('library_catalog', 'library', 'edit'), del = canSub('library_catalog', 'library', 'delete');
  return (ed ? sfBtn('soft', '', 'Edit', `openBookEditor('${escapeHtml(b.id)}')`) : '') + (del ? sfBtn('danger', '', 'Delete', `deleteBook('${escapeHtml(b.id)}')`) : '');
}
function lbxBookCard(b){
  const total = Number(b.totalCopies) || 0, av = Number(b.availableCopies) || 0;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(av / total * 100))) : 0;
  const state = av <= 0 ? 'out' : 'ok';
  const meta = [b.isbn ? 'ISBN ' + b.isbn : '', b.shelfLocation ? 'Shelf ' + b.shelfLocation : ''].filter(Boolean).map(escapeHtml);
  return `<article class="lbx-book lbx-book--${state}">
    <div class="lbx-book-top">
      <span class="lbx-mono" style="--tint:${lbxTint(b.category || b.title)}" aria-hidden="true">${escapeHtml(lbxMono(b.title))}</span>
      <span class="lbx-book-title"><b>${escapeHtml(b.title)}</b><small>${escapeHtml(b.author || '')}</small></span>
    </div>
    <div class="lbx-tags">${b.category ? `<span class="pill">${escapeHtml(b.category)}</span>` : ''}${lbxStockBadge(b)}</div>
    <div class="lbx-copies"><span><b class="lbx-qty--${state}">${av}</b> of ${total} available</span>
      <div class="lbx-bar" role="img" aria-label="${av} of ${total} copies available"><i class="lbx-bar--${state}" style="width:${pct}%"></i></div></div>
    ${meta.length ? `<div class="lbx-meta">${meta.join('<span aria-hidden="true"> &middot; </span>')}</div>` : ''}
    <div class="sf-actions">${lbxBookActions(b)}</div>
  </article>`;
}
// Repaints only the results, so typing in the search box never loses focus.
function lbxPaintCatalog(){
  const grid = document.getElementById('lbxGrid'), rows = document.getElementById('lbxRows');
  if(!grid || !rows) return;
  const q = (libCatalogSearch || '').toLowerCase();
  const list = libraryBooks.filter(b =>
    (!q || String(b.title || '').toLowerCase().includes(q) || String(b.author || '').toLowerCase().includes(q) || String(b.isbn || '').toLowerCase().includes(q)) &&
    (!lbxCat || b.category === lbxCat) &&
    (lbxAvail === 'all' || (lbxAvail === 'avail' ? b.availableCopies > 0 : b.availableCopies <= 0)));
  const cards = lbxLayout === 'cards';
  grid.style.display = cards ? '' : 'none';
  document.getElementById('lbxTableCard').style.display = cards ? 'none' : '';
  grid.innerHTML = cards ? list.map(lbxBookCard).join('') : '';
  rows.innerHTML = cards ? '' : list.map(b => `<tr>
    <td><span class="lbx-who"><span class="lbx-mono lbx-mono--sm" style="--tint:${lbxTint(b.category || b.title)}" aria-hidden="true">${escapeHtml(lbxMono(b.title))}</span><span><b>${escapeHtml(b.title)}</b><small>${escapeHtml(b.author || '')}</small></span></span></td>
    <td>${b.category ? escapeHtml(b.category) : '&mdash;'}</td>
    <td>${b.isbn ? escapeHtml(b.isbn) : '&mdash;'}</td>
    <td>${b.shelfLocation ? escapeHtml(b.shelfLocation) : '&mdash;'}</td>
    <td class="lbx-r"><b class="lbx-qty--${b.availableCopies <= 0 ? 'out' : 'ok'}">${b.availableCopies}</b> / ${b.totalCopies}</td>
    <td>${lbxStockBadge(b)}</td>
    <td class="sf-actions lbx-act">${lbxBookActions(b)}</td></tr>`).join('');
  const cnt = document.getElementById('lbxCount');
  if(cnt) cnt.textContent = libraryBooks.length ? `Showing ${list.length} of ${libraryBooks.length} title${libraryBooks.length === 1 ? '' : 's'}` : '';
  const filtered = q || lbxCat || lbxAvail !== 'all';
  document.getElementById('lbxEmpty').innerHTML = list.length ? '' :
    `<div class="sf-card">${lbxEmpty(filtered ? 'No books match your filters' : 'No books yet', filtered ? 'Try a different search, category or availability.' : 'Click &ldquo;Add Book&rdquo; to add your first title.')}</div>`;
}

/* ---------- 1b. book editor ---------- */
function renderBookEditor(body){
  const b = editingBookId ? libraryBooks.find(x => x.id === editingBookId) : null;
  const v = k => escapeHtml(b ? (b[k] || '') : '');
  const issuedNow = b ? libraryIssues.filter(i => i.bookId === b.id && i.status === 'Issued').length : 0;
  body.innerHTML = `
    <div class="breadcrumb"><a onclick="backToCatalogList()">Catalog</a> &nbsp;/&nbsp; ${b ? escapeHtml(b.title) : 'New Book'}</div>
    <section class="sf-card lbx-form">
      <div class="lbx-form-in">
        <div class="lbx-form-head"><h4>${b ? 'Edit book' : 'Add a book'}</h4>
          <p>${b ? `${issuedNow} cop${issuedNow === 1 ? 'y is' : 'ies are'} currently issued. Available copies are recalculated from the total when you save.` : 'Title, author and number of copies are required. Everything else helps people find the book on the shelf.'}</p></div>
        <div class="form-grid">
          <div class="f-field full"><label for="libBookTitle">Title <span class="required-star">*</span></label><input type="text" id="libBookTitle" value="${v('title')}" placeholder="e.g. A Brief History of Time"></div>
          <div class="f-field"><label for="libBookAuthor">Author <span class="required-star">*</span></label><input type="text" id="libBookAuthor" value="${v('author')}" placeholder="e.g. Stephen Hawking"></div>
          <div class="f-field"><label for="libBookCategory">Category</label><input type="text" id="libBookCategory" value="${v('category')}" placeholder="e.g. Science"></div>
          <div class="f-field"><label for="libBookIsbn">ISBN</label><input type="text" id="libBookIsbn" value="${v('isbn')}" placeholder="e.g. 978-0553380163"></div>
          <div class="f-field"><label for="libBookPublisher">Publisher</label><input type="text" id="libBookPublisher" value="${v('publisher')}" placeholder="e.g. Bantam Books"></div>
          <div class="f-field"><label for="libBookShelf">Shelf / Location</label><input type="text" id="libBookShelf" value="${v('shelfLocation')}" placeholder="e.g. Rack B, Row 3"></div>
          <div class="f-field"><label for="libBookTotal">Total Copies <span class="required-star">*</span></label><input type="number" id="libBookTotal" value="${b ? escapeHtml(String(b.totalCopies)) : 1}" min="1"></div>
        </div>
        <div class="lbx-form-actions">
          ${sfBtn('soft', '', 'Cancel', 'backToCatalogList()')}
          ${sfBtn('primary', 'check', 'Save Book', 'saveBook()')}
        </div>
      </div>
    </section>`;
}

/* ---------- 2. issue & return ---------- */
function renderIssueReturnTab(body){
  const canIssue = canSub('library_issuereturn', 'library', 'create');
  const availableBooks = libraryBooks.filter(b => b.availableCopies > 0);
  const issuedList = libraryIssues.filter(i => i.status === 'Issued');
  const today = lbxToday();
  const overdueN = issuedList.filter(i => i.dueDate < today).length;
  const loan = librarySettings.loanPeriodDays || 14;
  body.innerHTML = `
    ${canIssue ? `<section class="sf-card lbx-issue">
      <div class="lbx-issue-head"><h4>Issue a book</h4>
        <ol class="iv-steps" id="lbxSteps"></ol></div>
      <div class="lbx-steps">
        <div class="lbx-step">
          <div class="lbx-step-title"><b>1</b>Choose the book and borrower</div>
          <div class="form-grid">
            <div class="f-field full">
              <label for="libIssueBook">Book</label>
              <select id="libIssueBook" onchange="libIssueBookId=this.value; lbxIssueRefresh();">
                <option value="">${availableBooks.length ? 'Select a book' : 'No copies available right now'}</option>
                ${availableBooks.map(b => `<option value="${escapeHtml(b.id)}" ${b.id === libIssueBookId ? 'selected' : ''}>${escapeHtml(b.title)} &mdash; ${escapeHtml(b.author || '')} (${b.availableCopies} available)</option>`).join('')}
              </select>
            </div>
            <div class="f-field">
              <label for="libBorrowerType">Borrower type</label>
              <select id="libBorrowerType" onchange="libIssueBorrowerType=this.value; libIssueBorrowerId=''; renderLibraryBody();">
                <option value="Student" ${libIssueBorrowerType === 'Student' ? 'selected' : ''}>Student</option>
                <option value="Staff" ${libIssueBorrowerType === 'Staff' ? 'selected' : ''}>Staff</option>
              </select>
            </div>
            <div class="f-field lbx-bsearch">
              <label for="libBorrowerSearch">${libIssueBorrowerType}</label>
              <div class="search-wrap">
                <input class="input" id="libBorrowerSearch" placeholder="Type 2+ letters of the name&hellip;" autocomplete="off" oninput="onLibBorrowerInput()" onblur="setTimeout(hideLibBorrowerSuggestions,150)" onfocus="onLibBorrowerInput()">
                <div class="search-suggestions" id="libBorrowerSuggestions"></div>
              </div>
            </div>
            ${libIssueBorrowerId ? `<div class="f-field full"><span class="lbx-chip"><span>${escapeHtml(libBorrowerDisplayName())}</span><button type="button" aria-label="Remove borrower" onclick="libIssueBorrowerId=''; renderLibraryBody();">&times;</button></span></div>` : ''}
          </div>
        </div>
        <div class="lbx-step">
          <div class="lbx-step-title"><b>2</b>Set the due date and issue</div>
          <div class="form-grid">
            <div class="f-field full">
              <label for="libDueDate">Due date</label>
              <input type="date" id="libDueDate" value="${addDaysToDate(today, loan)}">
              <span class="lbx-hint">Default is ${loan} day${loan === 1 ? '' : 's'} from today${librarySettings.finePerDay ? `; late returns cost ${fmtMoney(librarySettings.finePerDay)} per day` : ''}.</span>
            </div>
          </div>
          <div class="lbx-summary" id="lbxSummary" aria-live="polite"></div>
          ${sfBtn('primary', 'check', 'Issue Book', 'issueBook()')}
        </div>
      </div>
    </section>` : ''}

    <div class="lbx-listhead"><h4>Currently issued <small>${issuedList.length}</small></h4>
      ${overdueN ? `<span class="sf-badge sf-badge--overdue"><span aria-hidden="true">!</span>${overdueN} overdue</span>` : ''}</div>
    <div class="iv-toolbar lbx-toolbar">
      <input class="input iv-search" type="search" placeholder="Search issued books or borrower&hellip;" aria-label="Search issued books" value="${escapeHtml(libIssueSearch)}" oninput="libIssueSearch=this.value; lbxPaintIssued();">
      <div class="sf-segments" id="lbxIssSeg" role="group" aria-label="Filter">
        <button type="button" data-v="all" class="${lbxIssFilter === 'all' ? 'active' : ''}" onclick="lbxSetIssFilter('all')">All</button>
        <button type="button" data-v="overdue" class="${lbxIssFilter === 'overdue' ? 'active' : ''}" onclick="lbxSetIssFilter('overdue')">Overdue</button>
      </div>
    </div>
    <div class="sf-card"><div class="table-wrap">
      <table class="iv-table lbx-table">
        <thead><tr><th>Book</th><th>Borrower</th><th>Issued</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody id="lbxIssRows"></tbody>
      </table></div><div id="lbxIssEmpty"></div></div>`;
  lbxIssueRefresh();
  lbxPaintIssued();
}
function lbxSetIssFilter(v){
  lbxIssFilter = v;
  document.querySelectorAll('#lbxIssSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  lbxPaintIssued();
}
// Updates the step pills and the "about to issue" summary without re-rendering the form.
function lbxIssueRefresh(){
  const steps = document.getElementById('lbxSteps'), sum = document.getElementById('lbxSummary');
  if(!steps || !sum) return;
  const book = libraryBooks.find(b => b.id === libIssueBookId);
  const who = libIssueBorrowerId ? libBorrowerDisplayName() : '';
  const ready = !!(book && who);
  steps.innerHTML = `<li class="${ready ? 'is-done' : 'is-active'}"><b>${ready ? '&#10003;' : '1'}</b>Book &amp; borrower</li><li class="${ready ? 'is-active' : ''}"><b>2</b>Due date &amp; issue</li>`;
  sum.innerHTML = ready
    ? `<span>Ready to issue</span><b>${escapeHtml(book.title)}</b><span>to <b>${escapeHtml(who)}</b></span>`
    : `<span>${!book && !who ? 'Pick a book and a borrower in step 1.' : (!book ? 'Pick a book in step 1.' : 'Pick a borrower in step 1.')}</span>`;
  sum.classList.toggle('is-ready', ready);
}
function lbxPaintIssued(){
  const tb = document.getElementById('lbxIssRows');
  if(!tb) return;
  const canReturn = canSub('library_issuereturn', 'library', 'edit');
  const today = lbxToday();
  const q = (libIssueSearch || '').toLowerCase();
  const list = libraryIssues.filter(i => i.status === 'Issued' &&
    (!q || String(i.bookTitle || '').toLowerCase().includes(q) || String(i.borrowerName || '').toLowerCase().includes(q)) &&
    (lbxIssFilter === 'all' || i.dueDate < today))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  tb.innerHTML = list.map(i => `<tr class="${i.dueDate < today ? 'lbx-late' : ''}">
    <td><b>${escapeHtml(i.bookTitle || '—')}</b></td>
    <td>${lbxBorrower(i)}</td>
    <td>${escapeHtml(i.issueDate || '—')}</td>
    <td>${escapeHtml(i.dueDate || '—')}</td>
    <td>${lbxDueBadge(i)}</td>
    <td class="sf-actions lbx-act">${canReturn ? sfBtn('soft', 'down', 'Return', `openReturnBook('${escapeHtml(i.id)}')`) : ''}</td></tr>`).join('');
  const any = libraryIssues.some(i => i.status === 'Issued');
  document.getElementById('lbxIssEmpty').innerHTML = list.length ? '' :
    lbxEmpty(any ? 'Nothing matches' : 'Nothing issued right now', any ? 'Try clearing the search or filter.' : 'Books you issue above will be listed here until they are returned.');
}
function renderLibBorrowerSuggestions(q){
  const box = document.getElementById('libBorrowerSuggestions');
  if(!box) return;
  if(q.length < 2){ box.classList.remove('open'); box.innerHTML = ''; return; }
  const ql = q.toLowerCase();
  const pick = id => `libIssueBorrowerId='${escapeHtml(id)}'; hideLibBorrowerSuggestions(); renderLibraryBody();`;
  if(libIssueBorrowerType === 'Student'){
    const m = students.filter(s => isActive(s) && ((s.firstName || '').toLowerCase().includes(ql) || (s.lastName || '').toLowerCase().includes(ql))).slice(0, 8);
    box.innerHTML = m.length ? m.map(s => `<div class="sg-item" onmousedown="${pick(s.id)}">
      <div class="sg-avatar">${escapeHtml(initials(s))}</div>
      <div><div class="sg-name">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</div><div class="sg-meta">${escapeHtml(s.admissionNo || '')} &middot; ${escapeHtml(s.className || '')} &mdash; Section ${escapeHtml(s.section || '')}</div></div>
    </div>`).join('') : `<div class="sg-empty">No students match &ldquo;${escapeHtml(q)}&rdquo;</div>`;
  }else{
    const m = staffList.filter(s => staffIsActive(s) && ((s.firstName || '').toLowerCase().includes(ql) || (s.lastName || '').toLowerCase().includes(ql))).slice(0, 8);
    box.innerHTML = m.length ? m.map(s => `<div class="sg-item" onmousedown="${pick(s.id)}">
      <div class="sg-avatar">${escapeHtml(initials(s))}</div>
      <div><div class="sg-name">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</div><div class="sg-meta">${escapeHtml(s.designation || s.department || 'Staff')}</div></div>
    </div>`).join('') : `<div class="sg-empty">No staff match &ldquo;${escapeHtml(q)}&rdquo;</div>`;
  }
  box.classList.add('open');
}

/* ---------- 3. overdue & fines ---------- */
function renderOverdueTab(body){
  const today = lbxToday();
  const canReturn = canSub('library_overdue', 'library', 'edit');
  const perDay = Number(librarySettings.finePerDay) || 0;
  const list = libraryIssues.filter(i => i.status === 'Issued' && i.dueDate < today)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const fines = list.reduce((s, i) => s + lbxDaysLate(i.dueDate) * perDay, 0);
  const longest = list.reduce((m, i) => Math.max(m, lbxDaysLate(i.dueDate)), 0);
  const people = new Set(list.map(i => i.borrowerType + ':' + i.borrowerId)).size;
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Overdue items', list.length, list.length ? 'danger' : 'good', list.length ? 'past their due date' : 'nothing late')}
      ${sfKpi('Fines accruing', fmtMoney(fines), fines > 0 ? 'warn' : 'plain', perDay ? `${fmtMoney(perDay)} per day late` : 'no daily fine set')}
      ${sfKpi('Longest overdue', longest ? longest + (longest === 1 ? ' day' : ' days') : '—', longest > 14 ? 'danger' : 'plain')}
      ${sfKpi('Borrowers', people, 'plain', 'with late books')}
    </section>
    ${perDay ? '' : `<p class="lbx-note">No fine per day is set, so late returns are free. Set one under the Settings tab.</p>`}
    <div class="sf-card"><div class="table-wrap">
      <table class="iv-table lbx-table">
        <thead><tr><th>Book</th><th>Borrower</th><th>Due</th><th>Late by</th><th class="lbx-r">Fine so far</th><th></th></tr></thead>
        <tbody>${list.map(i => {
          const late = lbxDaysLate(i.dueDate);
          return `<tr class="lbx-late">
            <td><b>${escapeHtml(i.bookTitle || '—')}</b></td>
            <td>${lbxBorrower(i)}</td>
            <td>${escapeHtml(i.dueDate)}</td>
            <td><span class="sf-badge sf-badge--overdue"><span aria-hidden="true">!</span>${late} day${late === 1 ? '' : 's'}</span></td>
            <td class="lbx-r"><b>${fmtMoney(late * perDay)}</b></td>
            <td class="sf-actions lbx-act">${canReturn ? sfBtn('soft', 'down', 'Return', `openReturnBook('${escapeHtml(i.id)}')`) : ''}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      ${list.length ? '' : lbxEmpty('Nothing overdue', 'All issued books are within their due date.')}
    </div>`;
}

/* ---------- 4. settings ---------- */
function renderLibrarySettingsTab(body){
  const canEditSettings = canSub('library_settings', 'library', 'edit');
  const dis = canEditSettings ? '' : 'disabled';
  body.innerHTML = `
    <section class="sf-card lbx-form lbx-form--narrow">
      <div class="lbx-form-in">
        <div class="lbx-form-head"><h4>Library settings</h4>
          <p>These apply to every book issued from now on. Books already out keep the due date they were given.</p></div>
        <div class="form-grid">
          <div class="f-field"><label for="libLoanPeriod">Loan period (days)</label><input type="number" id="libLoanPeriod" value="${librarySettings.loanPeriodDays || 14}" min="1" ${dis} oninput="lbxSettingsPreview()"></div>
          <div class="f-field"><label for="libFinePerDay">Fine per day (&#8377;)</label><input type="number" id="libFinePerDay" value="${librarySettings.finePerDay || 0}" min="0" ${dis} oninput="lbxSettingsPreview()"></div>
        </div>
        <div class="lbx-summary is-ready" id="lbxSetPreview" aria-live="polite"></div>
        ${canEditSettings ? `<div class="lbx-form-actions">${sfBtn('primary', 'check', 'Save Settings', 'saveLibrarySettings()')}</div>` : `<p class="lbx-note">You can view these settings but not change them.</p>`}
      </div>
    </section>`;
  lbxSettingsPreview();
}
function lbxSettingsPreview(){
  const box = document.getElementById('lbxSetPreview');
  if(!box) return;
  const days = Math.max(1, Number((document.getElementById('libLoanPeriod') || {}).value) || 14);
  const fine = Math.max(0, Number((document.getElementById('libFinePerDay') || {}).value) || 0);
  box.innerHTML = `<span>Example</span><b>A book issued today is due on ${escapeHtml(addDaysToDate(lbxToday(), days))}.</b><span>${fine ? `Returned 5 days late, the fine is <b>${fmtMoney(fine * 5)}</b>.` : 'There is no late fine.'}</span>`;
}
