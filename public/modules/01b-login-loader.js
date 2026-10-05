/* ============================================================================
   Sign-in loader. While the app verifies the password (/api/login) and loads
   the school's data, the login card shows an animated school-and-book drawing
   with a status line that follows the real steps, instead of sitting idle.
   Presentation only: submitLogin()/initAuth() in module 02 call these helpers.
   ========================================================================== */

function loginLoaderStart(text, pct){
  const card = document.querySelector('.login-card');
  const box = document.getElementById('loginLoader');
  if(!card || !box) return;
  // Each stroke needs its own length for the draw-in effect.
  box.querySelectorAll('.ll-d').forEach(el => {
    try{ el.style.setProperty('--len', Math.ceil(el.getTotalLength ? el.getTotalLength() : 260) + 4); }catch(e){}
  });
  box.classList.remove('is-done');
  card.classList.add('is-loading');
  box.hidden = false;
  loginLoaderStage(text, pct);
}

// Moves the status text and bar. creep:true lets the bar keep inching toward
// ~88% while a long step (the data load) runs, so it never looks frozen.
function loginLoaderStage(text, pct, creep){
  const t = document.getElementById('loginLoaderText');
  const bar = document.getElementById('loginLoaderBar');
  if(t && text) t.textContent = text;
  if(!bar) return;
  bar.classList.toggle('is-creep', !!creep);
  bar.style.width = (creep ? 88 : (pct || 0)) + '%';
}

// Plays the tick, resolves after it has been seen (or immediately if the
// person prefers reduced motion).
function loginLoaderDone(){
  const box = document.getElementById('loginLoader');
  if(!box || box.hidden) return Promise.resolve();
  loginLoaderStage('Welcome!', 100);
  box.classList.add('is-done');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise(r => setTimeout(r, reduce ? 150 : 650));
}

function loginLoaderStop(){
  const card = document.querySelector('.login-card');
  const box = document.getElementById('loginLoader');
  if(box){ box.hidden = true; box.classList.remove('is-done'); }
  if(card) card.classList.remove('is-loading');
  const bar = document.getElementById('loginLoaderBar');
  if(bar){ bar.classList.remove('is-creep'); bar.style.width = '0'; }
}
