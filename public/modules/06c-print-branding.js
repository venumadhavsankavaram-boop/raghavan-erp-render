/* ============================================================================
   Print branding - the three things every official printout carries:
     1. the recognition line  ("Recognised by Govt. of AP"; editable in
        Setup -> School Profile -> Recognition line),
     2. the academic year,
     3. a faint school-logo watermark.
   Used by the fee receipt, progress report, admit cards, marks cards and certificates.
   ========================================================================== */
function brandEsc(v){ return (typeof escapeHtml === 'function') ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v); }
function brandRecognition(){
  const r = (typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.recognition || '').trim();
  return r || 'Recognised by Govt. of AP';
}
function brandAY(){
  try{ return (typeof currentAcademicYearValue !== 'undefined' && currentAcademicYearValue) ? String(currentAcademicYearValue) : ''; }catch(e){ return ''; }
}
function brandLogoSrc(){
  try{
    let src = '';
    if(typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.logo) src = schoolInfo.logo;
    else { const img = document.querySelector('.sb-brand img'); src = img ? img.src : ''; }
    if(src && !/^data:/i.test(src)){ try{ src = new URL(src, location.href).href; }catch(e){} }
    return src;
  }catch(e){ return ''; }
}
// "Recognised by Govt. of AP · Academic Year 2026-27" as one centred line.
// opts.color / opts.size override the look (e.g. light text on a dark header).
function brandLineHtml(opts){
  opts = opts || {};
  const ay = brandAY();
  const txt = brandEsc(brandRecognition()) + (ay ? ' &nbsp;·&nbsp; Academic Year ' + brandEsc(ay) : '');
  return `<div class="brand-recog" style="text-align:${opts.align || 'center'};font-size:${opts.size || '9px'};font-weight:700;letter-spacing:.3px;color:${opts.color || '#7a5c00'};margin:${opts.margin || '1px 0 3px'};line-height:1.25;">${txt}</div>`;
}
// Faint logo behind the content of every element matching `selector`.
function brandWmCss(selector, opts){
  opts = opts || {};
  const logo = brandLogoSrc();
  if(!logo || !selector) return '';
  const sels = selector.split(',').map(x => x.trim()).filter(Boolean);
  return `${sels.map(s => s + '{position:relative;}').join('')}
    ${sels.map(s => s + '::before').join(',')}{content:'';position:absolute;inset:0;background:url("${logo}") center ${opts.pos || 'center'}/${opts.size || '52%'} no-repeat;opacity:${opts.opacity || 0.07};pointer-events:none;z-index:0;}
    ${sels.map(s => s + '>*').join(',')}{position:relative;z-index:1;}`;
}
// Page-level watermark (fixed, so it repeats on every printed page) for documents that
// have no opaque card backgrounds. Returns a <style> block.
function brandFixedWmHtml(opts){
  opts = opts || {};
  const logo = brandLogoSrc();
  if(!logo) return '';
  return `<style>body::before{content:'';position:fixed;inset:0;background:url("${logo}") center/${opts.size || '46%'} no-repeat;opacity:${opts.opacity || 0.06};pointer-events:none;z-index:0;}</style>`;
}
// Grading scale in MARKS (not percentages), one line per distinct "out of" value on the
// report: "Out of 50:  46–50 = A1 · 41–45 = A2 · …". Band edges are the percentage bands
// converted to marks for that maximum (rounded up, as a mark must reach the band's %).
function brandScaleLine(scheme, max, label){
  const bands = scheme.bands.slice().sort((a, b) => b.minPct - a.minPct);
  const lows = bands.map(b => Math.max(0, Math.ceil(b.minPct * max / 100 - 1e-9)));
  const parts = bands.map((b, i) => {
    const hi = i === 0 ? max : lows[i - 1] - 1;
    const lo = lows[i];
    if(hi < lo) return '';                       // band too narrow to hold a whole mark at this maximum
    return `<span style="white-space:nowrap;"><b>${lo === hi ? lo : lo + '–' + hi}</b> = ${brandEsc(b.grade)}</span>`;
  }).filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `<div><b>${label || 'Subject marks out of'} ${max}:</b> ${parts}</div>`;
}
function brandGradeScaleHtml(scheme, small, maxes, totalMax){
  if(!scheme || !scheme.bands || !scheme.bands.length || scheme.display === 'marks') return '';
  const list = Array.from(new Set((maxes || []).map(Number).filter(m => m > 0))).sort((a, b) => a - b).slice(0, 3);
  const tm = Number(totalMax) || 0;
  if(!list.length && !tm) return '';
  return `<div class="brand-scale" style="font-size:${small ? '7px' : '8.4px'};line-height:1.5;color:#333;border:1px solid #bbb;border-radius:3px;padding:2px 5px;margin:4px 0;text-align:center;"><b>Grading scale</b> (marks → grade)${list.map(m => brandScaleLine(scheme, m)).join('')}${tm && !(list.length === 1 && list[0] === tm) ? brandScaleLine(scheme, tm, 'Total marks out of') : ''}</div>`;
}
