/* ============================================
   CTFT — Sürekli Zaman Fourier Dönüşümü
   Continuous-Time Fourier Transform
   X(jΩ) = ∫ x(t) e^{-jΩt} dt
   ============================================
   - Numerical CTFT (Riemann sum of the analysis integral)
   - Optional closed-form (analytic) overlay for the library signals
   - Demonstrates: rect↔sinc duality, time-shift → linear phase,
     modulation → frequency shift, scaling → inverse width.
   User-facing text strings go through _t({tr, en}); pure mathematical
   notation (Ω, |X|, ∠X, rad, …) is identical in both languages.
*/

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
const PI = Math.PI;
const TWO_PI = 2 * PI;

// ── Canvas ──
const cvXt  = document.getElementById('cvXt');
const cvMag = document.getElementById('cvMag');
const cvPha = document.getElementById('cvPha');

// ── UI ──
const ui = {
  signalType: document.getElementById('signalType'),
  ampSlider: document.getElementById('ampSlider'),
  ampVal: document.getElementById('ampVal'),
  widthGroup: document.getElementById('widthGroup'),
  widthSlider: document.getElementById('widthSlider'),
  widthVal: document.getElementById('widthVal'),
  widthLabel: document.getElementById('widthLabel'),
  aGroup: document.getElementById('aGroup'),
  aSlider: document.getElementById('aSlider'),
  aVal: document.getElementById('aVal'),
  omega0Group: document.getElementById('omega0Group'),
  omega0Slider: document.getElementById('omega0Slider'),
  omega0Val: document.getElementById('omega0Val'),
  omega0Label: document.getElementById('omega0Label'),
  shiftSlider: document.getElementById('shiftSlider'),
  shiftVal: document.getElementById('shiftVal'),
  tHalfSlider: document.getElementById('tHalfSlider'),
  tHalfVal: document.getElementById('tHalfVal'),
  omRangeSlider: document.getElementById('omRangeSlider'),
  omRangeVal: document.getElementById('omRangeVal'),
  magMode: document.getElementById('magMode'),
  showPhase: document.getElementById('showPhase'),
  showAnalytic: document.getElementById('showAnalytic'),
  markerSlider: document.getElementById('markerSlider'),
  markerVal: document.getElementById('markerVal'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  freehandControls: document.getElementById('freehandControls'),
  drawClear: document.getElementById('drawClear'),
  drawSmooth: document.getElementById('drawSmooth'),
  drawNormalize: document.getElementById('drawNormalize'),
  xtHint: document.getElementById('xtHint'),
  magRO: document.getElementById('magRO'),
  phaRO: document.getElementById('phaRO'),
  markerRO: document.getElementById('markerRO'),
  phaseCard: document.getElementById('phaseCard'),
};

// ── State ──
let signalType = 'rect';
let amp = 1;
let widthW = 2;        // characteristic width / σ / cutoff (signal dependent)
let decayA = 1;        // exponential decay rate a
let omega0 = 8;        // carrier / bandwidth (rad/s)
let shift = 0;         // time shift t0
let tHalf = 8;         // time window [-tHalf, tHalf]
let omRange = 24;      // Ω axis ±omRange (rad/s)
let nT = 1400;         // time samples (numerical integral)
let nOm = 720;         // Ω samples
let magMode = 'linear';
let showPhase = true;
let showAnalytic = true;
let markerOm = 0;
let gridAlpha = 0.16;

let drawn = new Float64Array(nT);   // freehand x(t) on the time grid

// ── Theme-aware colors ──
function cssVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}
let COL = {};
function refreshColors() {
  COL = {
    x:   cssVar('--color-x', '#39ff85'),
    mag: cssVar('--color-h', '#ff8c42'),
    pha: cssVar('--color-y', '#7b8cff'),
    mark: cssVar('--color-marker', '#ff4f9a'),
    ref: '#ffd166',
  };
}

// ============================================
// SIGNAL GENERATOR  (sampled on the time grid)
// ============================================
function makeSignal() {
  const x = new Float64Array(nT);
  const dt = (2 * tHalf) / (nT - 1);
  if (signalType === 'freehand') {
    if (drawn.length !== nT) {
      const resized = new Float64Array(nT);
      const ratio = drawn.length / nT;
      for (let i = 0; i < nT; i++) resized[i] = drawn[Math.min(drawn.length - 1, Math.floor(i * ratio))] || 0;
      drawn = resized;
    }
    return { x: drawn.slice(), dt };
  }
  const A = amp, W = widthW, a = Math.max(0.05, decayA), w0 = omega0, t0 = shift;
  for (let i = 0; i < nT; i++) {
    const t = -tHalf + i * dt - t0;   // evaluate base signal at (t - t0)
    let v = 0;
    switch (signalType) {
      case 'rect':     v = Math.abs(t) <= W / 2 ? A : 0; break;
      case 'tri':      v = Math.abs(t) <  W / 2 ? A * (1 - Math.abs(t) / (W / 2)) : 0; break;
      case 'gauss':    v = A * Math.exp(-(t * t) / (2 * W * W)); break;
      case 'expCausal':v = t >= 0 ? A * Math.exp(-a * t) : 0; break;
      case 'expTwo':   v = A * Math.exp(-a * Math.abs(t)); break;
      case 'sinc': {
        // bandlimited pulse: x(t) = A·sin(Ωc t)/(π t), Ωc = w0  →  X = A·rect_{|Ω|<Ωc}
        v = (t === 0) ? A * w0 / PI : A * Math.sin(w0 * t) / (PI * t);
        break;
      }
      case 'cosPulse': v = Math.abs(t) <= W / 2 ? A * Math.cos(w0 * t) : 0; break;
      case 'gabor':    v = A * Math.exp(-(t * t) / (2 * W * W)) * Math.cos(w0 * t); break;
    }
    x[i] = v;
  }
  return { x, dt };
}

// ============================================
// ANALYTIC (closed-form) CTFT — returns {re, im} at Ω
// (base signal, then the time-shift phase factor e^{-jΩ t0})
// ============================================
function sinc(z) { return Math.abs(z) < 1e-9 ? 1 : Math.sin(z) / z; }

function analyticAt(om) {
  const A = amp, W = widthW, a = Math.max(0.05, decayA), w0 = omega0, t0 = shift;
  let re = 0, im = 0;
  switch (signalType) {
    case 'rect':     re = A * W * sinc(om * W / 2); break;
    case 'tri':      re = A * (W / 2) * Math.pow(sinc(om * W / 4), 2); break;
    case 'gauss':    re = A * W * Math.sqrt(TWO_PI) * Math.exp(-(W * W * om * om) / 2); break;
    case 'expCausal': {
      // A/(a + jΩ)
      const den = a * a + om * om;
      re = A * a / den; im = -A * om / den; break;
    }
    case 'expTwo':   re = A * 2 * a / (a * a + om * om); break;
    case 'sinc':     re = (Math.abs(om) <= w0) ? A : 0; break;
    case 'cosPulse': re = (A * W / 2) * (sinc((om - w0) * W / 2) + sinc((om + w0) * W / 2)); break;
    case 'gabor': {
      const k = A * W * Math.sqrt(TWO_PI) / 2;
      re = k * (Math.exp(-(W * W * (om - w0) * (om - w0)) / 2) + Math.exp(-(W * W * (om + w0) * (om + w0)) / 2));
      break;
    }
    default: return null;   // freehand → no closed form
  }
  // apply time shift: multiply by e^{-jΩ t0}
  if (t0 !== 0) {
    const c = Math.cos(om * t0), s = Math.sin(om * t0);
    const r2 = re * c + im * s;   // (re+j im)(cos - j sin)
    const i2 = im * c - re * s;
    return { re: r2, im: i2 };
  }
  return { re, im };
}
function hasAnalytic() { return signalType !== 'freehand'; }

// ============================================
// NUMERICAL CTFT   X(jΩ) ≈ Σ x(t_n) e^{-jΩ t_n} Δt
// ============================================
function computeCTFT(sig) {
  const { x, dt } = sig;
  const om = new Float64Array(nOm);
  const re = new Float64Array(nOm);
  const im = new Float64Array(nOm);
  const mag = new Float64Array(nOm);
  const pha = new Float64Array(nOm);
  for (let k = 0; k < nOm; k++) {
    const w = -omRange + (2 * omRange) * (k / (nOm - 1));
    om[k] = w;
    let r = 0, i = 0;
    for (let n = 0; n < x.length; n++) {
      const t = -tHalf + n * dt;
      const ph = -w * t;
      r += x[n] * Math.cos(ph);
      i += x[n] * Math.sin(ph);
    }
    r *= dt; i *= dt;
    re[k] = r; im[k] = i;
    mag[k] = Math.hypot(r, i);
    pha[k] = Math.atan2(i, r);
  }
  return { om, re, im, mag, pha };
}

function evalCTFTat(sig, om) {
  const { x, dt } = sig;
  let r = 0, i = 0;
  for (let n = 0; n < x.length; n++) {
    const t = -tHalf + n * dt;
    const ph = -om * t;
    r += x[n] * Math.cos(ph);
    i += x[n] * Math.sin(ph);
  }
  r *= dt; i *= dt;
  return { re: r, im: i, mag: Math.hypot(r, i), pha: Math.atan2(i, r) };
}

// ============================================
// DRAW HELPERS
// ============================================
function prep(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr;
  cv.height = r.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height, ctx };
}

function drawGrid(ctx, w, h, xMin, xMax, yMin, yMax) {
  ctx.strokeStyle = `rgba(100,160,255,${gridAlpha})`;
  ctx.lineWidth = 0.7;
  const xR = xMax - xMin || 1;
  let step = xR / 14;
  const m = Math.pow(10, Math.floor(Math.log10(step)));
  step = Math.ceil(step / m) * m;
  for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) {
    const x = ((v - xMin) / xR) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  const yR = yMax - yMin || 1;
  let yStep = yR / 6;
  const ym = Math.pow(10, Math.floor(Math.log10(yStep)));
  yStep = Math.ceil(yStep / ym) * ym;
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const y = h - ((v - yMin) / yR) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawAxes(ctx, w, h, xMin, xMax, yMin, yMax, labelFn, unitLabel) {
  ctx.strokeStyle = 'rgba(100,140,255,0.32)';
  ctx.lineWidth = 1.2;
  let y0px = h - 10;
  if (yMin <= 0 && yMax >= 0) {
    y0px = h - ((0 - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(0, y0px); ctx.lineTo(w, y0px); ctx.stroke();
  }
  if (xMin <= 0 && xMax >= 0) {
    const x0 = ((0 - xMin) / (xMax - xMin)) * w;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(180,190,220,0.62)';
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'center';
  if (labelFn) labelFn(ctx, w, h, xMin, xMax, y0px);
  if (unitLabel) {
    ctx.textAlign = 'right';
    ctx.fillText(unitLabel, w - 4, 11);
  }
}

function xLabelsLinear(ctx, w, h, xMin, xMax, y0px) {
  const xR = xMax - xMin;
  let step = xR / 10;
  const m = Math.pow(10, Math.floor(Math.log10(step)));
  step = Math.ceil(step / m) * m;
  for (let v = Math.ceil(xMin / step) * step; v <= xMax + 1e-9; v += step) {
    const x = ((v - xMin) / xR) * w;
    const lab = Math.abs(v) < 1e-9 ? '0' : (Math.abs(step) < 1 ? v.toFixed(1) : v.toFixed(0));
    ctx.fillText(lab, x, Math.min(y0px + 13, h - 2));
  }
}

function drawCurve(ctx, w, h, xMin, xMax, yMin, yMax, xArr, yArr, color, lw, dash, gateArr) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 1.9;
  if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < xArr.length; i++) {
    if (gateArr && !gateArr[i]) { started = false; continue; }
    const x = ((xArr[i] - xMin) / (xMax - xMin)) * w;
    const y = h - ((yArr[i] - yMin) / (yMax - yMin)) * h;
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMarker(ctx, w, h, xMin, xMax, om, color) {
  if (om < xMin || om > xMax) return;
  const x = ((om - xMin) / (xMax - xMin)) * w;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  ctx.setLineDash([]);
}

function yBounds(arr) {
  let mn = 0, mx = 0;
  for (let i = 0; i < arr.length; i++) { if (arr[i] < mn) mn = arr[i]; if (arr[i] > mx) mx = arr[i]; }
  if (mn === mx) { mn = -1; mx = 1; }
  const r = mx - mn;
  return { mn: mn - r * 0.12, mx: mx + r * 0.12 };
}

// ============================================
// RENDER
// ============================================
let sigCached = null, cached = null;

function recomputeAll() {
  sigCached = makeSignal();
  cached = computeCTFT(sigCached);
}

function renderXt() {
  const s = prep(cvXt);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const x = sigCached.x;
  const dt = sigCached.dt;
  const tArr = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) tArr[i] = -tHalf + i * dt;
  const b = yBounds(x);
  drawGrid(s.ctx, s.w, s.h, -tHalf, tHalf, b.mn, b.mx);
  drawAxes(s.ctx, s.w, s.h, -tHalf, tHalf, b.mn, b.mx, xLabelsLinear, 't');
  drawCurve(s.ctx, s.w, s.h, -tHalf, tHalf, b.mn, b.mx, tArr, x, COL.x, 2.0);

  // time-shift indicator
  if (shift !== 0 && shift >= -tHalf && shift <= tHalf) {
    const xp = ((shift - (-tHalf)) / (2 * tHalf)) * s.w;
    s.ctx.strokeStyle = 'rgba(255,79,154,0.55)'; s.ctx.lineWidth = 1.2;
    s.ctx.setLineDash([4, 3]);
    s.ctx.beginPath(); s.ctx.moveTo(xp, 0); s.ctx.lineTo(xp, s.h); s.ctx.stroke();
    s.ctx.setLineDash([]);
    s.ctx.fillStyle = COL.mark; s.ctx.font = '10px Consolas, monospace'; s.ctx.textAlign = 'center';
    s.ctx.fillText('t₀=' + shift.toFixed(2), xp, 11);
  }
}

function magArray() {
  // numeric magnitude (linear or dB), with a stable dB floor
  const m = cached.mag;
  if (magMode === 'db') {
    let mx = 1e-12;
    for (let i = 0; i < m.length; i++) if (m[i] > mx) mx = m[i];
    const out = new Float64Array(m.length);
    for (let i = 0; i < m.length; i++) out[i] = m[i] > 1e-7 ? 20 * Math.log10(m[i] / mx) : -80;
    return { y: out, yMin: -60, yMax: 5, ref: mx };
  }
  let mx = 1e-12;
  for (let i = 0; i < m.length; i++) if (m[i] > mx) mx = m[i];
  return { y: m, yMin: -mx * 0.08, yMax: mx * 1.18, ref: mx };
}

function renderMag() {
  const s = prep(cvMag);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const xMin = -omRange, xMax = omRange;
  const M = magArray();
  drawGrid(s.ctx, s.w, s.h, xMin, xMax, M.yMin, M.yMax);
  drawAxes(s.ctx, s.w, s.h, xMin, xMax, M.yMin, M.yMax, xLabelsLinear, 'Ω');

  // analytic overlay (dashed)
  if (showAnalytic && hasAnalytic()) {
    const ya = new Float64Array(cached.om.length);
    if (magMode === 'db') {
      for (let i = 0; i < ya.length; i++) {
        const a = analyticAt(cached.om[i]);
        const mg = Math.hypot(a.re, a.im);
        ya[i] = mg > 1e-7 ? 20 * Math.log10(mg / M.ref) : -80;
      }
    } else {
      for (let i = 0; i < ya.length; i++) {
        const a = analyticAt(cached.om[i]);
        ya[i] = Math.hypot(a.re, a.im);
      }
    }
    drawCurve(s.ctx, s.w, s.h, xMin, xMax, M.yMin, M.yMax, cached.om, ya, COL.ref, 1.4, [6, 4]);
  }

  drawCurve(s.ctx, s.w, s.h, xMin, xMax, M.yMin, M.yMax, cached.om, M.y, COL.mag, 2.0);
  drawMarker(s.ctx, s.w, s.h, xMin, xMax, markerOm, COL.mark);

  const ev0 = evalCTFTat(sigCached, 0);
  ui.magRO.textContent = '|X(0)| = ' + ev0.mag.toFixed(3);
}

function renderPha() {
  if (!showPhase) return;
  const s = prep(cvPha);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const xMin = -omRange, xMax = omRange, yMin = -PI - 0.3, yMax = PI + 0.3;
  drawGrid(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax);
  drawAxes(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, xLabelsLinear, 'Ω');

  // ±π guide lines
  s.ctx.strokeStyle = 'rgba(123,140,255,0.25)'; s.ctx.lineWidth = 0.8; s.ctx.setLineDash([3, 3]);
  for (const yv of [-PI, PI]) {
    const yy = s.h - ((yv - yMin) / (yMax - yMin)) * s.h;
    s.ctx.beginPath(); s.ctx.moveTo(0, yy); s.ctx.lineTo(s.w, yy); s.ctx.stroke();
  }
  s.ctx.setLineDash([]);

  // gate out phase where magnitude is negligible (noise)
  let mmax = 1e-12;
  for (let i = 0; i < cached.mag.length; i++) if (cached.mag[i] > mmax) mmax = cached.mag[i];
  const gate = new Uint8Array(cached.mag.length);
  for (let i = 0; i < gate.length; i++) gate[i] = cached.mag[i] > mmax * 0.012 ? 1 : 0;

  if (showAnalytic && hasAnalytic()) {
    const pa = new Float64Array(cached.om.length);
    const ga = new Uint8Array(cached.om.length);
    for (let i = 0; i < pa.length; i++) {
      const a = analyticAt(cached.om[i]);
      pa[i] = Math.atan2(a.im, a.re);
      ga[i] = Math.hypot(a.re, a.im) > mmax * 0.012 ? 1 : 0;
    }
    drawCurve(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, cached.om, pa, COL.ref, 1.4, [6, 4], ga);
  }

  drawCurve(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, cached.om, cached.pha, COL.pha, 1.9, null, gate);
  drawMarker(s.ctx, s.w, s.h, xMin, xMax, markerOm, COL.mark);
}

function updateMarkerReadout() {
  const ev = evalCTFTat(sigCached, markerOm);
  ui.markerRO.textContent = 'Ω = ' + markerOm.toFixed(2) +
    ' · |X| = ' + ev.mag.toFixed(3) + ' · ∠X = ' + ev.pha.toFixed(2) + ' rad';
  if (ui.phaRO) ui.phaRO.textContent = '∠X(Ω) = ' + ev.pha.toFixed(3) + ' rad';
}

function renderAll() {
  refreshColors();
  recomputeAll();
  renderXt();
  renderMag();
  renderPha();
  updateMarkerReadout();
}

// ============================================
// MARKER INTERACTION (drag on magnitude / phase)
// ============================================
let dragTarget = null;
function omFromX(cv, e) {
  const rect = cv.getBoundingClientRect();
  const px = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  return -omRange + (px / rect.width) * (2 * omRange);
}
function setMarker(om) {
  markerOm = Math.max(-omRange, Math.min(omRange, om));
  ui.markerSlider.value = markerOm;
  ui.markerVal.textContent = markerOm.toFixed(2);
  renderMag(); renderPha(); updateMarkerReadout();
}
[cvMag, cvPha].forEach(cv => {
  cv.addEventListener('mousedown', e => { dragTarget = cv; setMarker(omFromX(cv, e)); });
  cv.addEventListener('touchstart', e => { dragTarget = cv; setMarker(omFromX(cv, e)); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', e => { if (dragTarget === cv) { setMarker(omFromX(cv, e)); e.preventDefault(); } }, { passive: false });
  cv.addEventListener('touchend', () => { dragTarget = null; });
});
window.addEventListener('mousemove', e => { if (dragTarget) setMarker(omFromX(dragTarget, e)); });
window.addEventListener('mouseup', () => { dragTarget = null; });

// ============================================
// FREEHAND DRAW on x(t)
// ============================================
let drawingFh = false, prevIdx = -1, prevAmp = 0;
function getXtPos(e) {
  const rect = cvXt.getBoundingClientRect();
  const cx = e.clientX ?? e.touches?.[0]?.clientX;
  const cy = e.clientY ?? e.touches?.[0]?.clientY;
  const xPx = cx - rect.left, yPx = cy - rect.top;
  const idx = Math.round((xPx / rect.width) * (nT - 1));
  const yNorm = 1 - (yPx / rect.height);
  return { idx, amp: (yNorm - 0.5) * 3 };
}
function fhPlot(idx, ampV) {
  if (drawn.length !== nT) drawn = new Float64Array(nT);
  if (prevIdx < 0 || prevIdx === idx) {
    if (idx >= 0 && idx < nT) drawn[idx] = ampV;
  } else {
    const s = Math.min(prevIdx, idx), e = Math.max(prevIdx, idx);
    const a0 = prevIdx < idx ? prevAmp : ampV, a1 = prevIdx < idx ? ampV : prevAmp;
    const span = e - s;
    for (let i = s; i <= e; i++) {
      if (i < 0 || i >= nT) continue;
      drawn[i] = a0 + (a1 - a0) * (span === 0 ? 0 : (i - s) / span);
    }
  }
  prevIdx = idx; prevAmp = ampV;
}
cvXt.addEventListener('mousedown', e => {
  if (signalType !== 'freehand') return;
  drawingFh = true; prevIdx = -1;
  const p = getXtPos(e); fhPlot(p.idx, p.amp); renderAll(); e.preventDefault();
});
cvXt.addEventListener('mousemove', e => {
  if (!drawingFh || signalType !== 'freehand') return;
  const p = getXtPos(e); fhPlot(p.idx, p.amp); renderAll();
});
window.addEventListener('mouseup', () => { drawingFh = false; prevIdx = -1; });
cvXt.addEventListener('touchstart', e => {
  if (signalType !== 'freehand') return;
  drawingFh = true; prevIdx = -1;
  const p = getXtPos(e); fhPlot(p.idx, p.amp); renderAll(); e.preventDefault();
}, { passive: false });
cvXt.addEventListener('touchmove', e => {
  if (!drawingFh || signalType !== 'freehand') return;
  const p = getXtPos(e); fhPlot(p.idx, p.amp); renderAll(); e.preventDefault();
}, { passive: false });
cvXt.addEventListener('touchend', () => { drawingFh = false; prevIdx = -1; });

ui.drawClear.addEventListener('click', () => { drawn = new Float64Array(nT); renderAll(); });
ui.drawSmooth.addEventListener('click', () => {
  const s = new Float64Array(nT);
  for (let i = 1; i < nT - 1; i++) s[i] = (drawn[i - 1] + drawn[i] + drawn[i + 1]) / 3;
  s[0] = drawn[0]; s[nT - 1] = drawn[nT - 1];
  drawn = s; renderAll();
});
ui.drawNormalize.addEventListener('click', () => {
  let mx = 0; for (let i = 0; i < drawn.length; i++) mx = Math.max(mx, Math.abs(drawn[i]));
  if (mx > 0) for (let i = 0; i < drawn.length; i++) drawn[i] /= mx;
  renderAll();
});

// ============================================
// CONTROL WIRING
// ============================================
const WIDTH_SIGNALS = ['rect', 'tri', 'gauss', 'cosPulse', 'gabor'];
const A_SIGNALS = ['expCausal', 'expTwo'];
const W0_SIGNALS = ['sinc', 'cosPulse', 'gabor'];

function widthLabelText() {
  if (signalType === 'gauss' || signalType === 'gabor')
    return _t({ tr: 'σ genişliği: ', en: 'σ width: ' });
  return _t({ tr: 'Genişlik W: ', en: 'Width W: ' });
}
function omega0LabelText() {
  if (signalType === 'sinc') return _t({ tr: 'Bant Ωc (rad/s): ', en: 'Bandwidth Ωc (rad/s): ' });
  return _t({ tr: 'Taşıyıcı Ω₀ (rad/s): ', en: 'Carrier Ω₀ (rad/s): ' });
}

function updateVisibility() {
  const isFree = signalType === 'freehand';
  ui.freehandControls.style.display = isFree ? 'flex' : 'none';
  cvXt.classList.toggle('draw-active', isFree);
  cvXt.classList.toggle('freehand-active', isFree);
  ui.widthGroup.style.display = WIDTH_SIGNALS.includes(signalType) ? 'block' : 'none';
  ui.aGroup.style.display = A_SIGNALS.includes(signalType) ? 'block' : 'none';
  ui.omega0Group.style.display = W0_SIGNALS.includes(signalType) ? 'block' : 'none';
  if (ui.widthLabel && ui.widthLabel.firstChild) ui.widthLabel.firstChild.nodeValue = widthLabelText();
  if (ui.omega0Label && ui.omega0Label.firstChild) ui.omega0Label.firstChild.nodeValue = omega0LabelText();
}

function updateReadouts() {
  ui.ampVal.textContent = amp.toFixed(2);
  ui.widthVal.textContent = widthW.toFixed(2);
  ui.aVal.textContent = decayA.toFixed(2);
  ui.omega0Val.textContent = omega0.toFixed(1);
  ui.shiftVal.textContent = shift.toFixed(2);
  ui.tHalfVal.textContent = tHalf.toFixed(0);
  ui.omRangeVal.textContent = '±' + omRange.toFixed(0);
  ui.markerVal.textContent = markerOm.toFixed(2);
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);
  ui.xtHint.textContent = signalType === 'freehand'
    ? _t({ tr: '✏️ x(t)\'yi fare ile çizin', en: '✏️ draw x(t) with the mouse' })
    : _t({ tr: 'kütüphaneden işaret seçili', en: 'library signal selected' });
}

function onSignalChange() {
  signalType = ui.signalType.value;
  amp = parseFloat(ui.ampSlider.value);
  widthW = parseFloat(ui.widthSlider.value);
  decayA = parseFloat(ui.aSlider.value);
  omega0 = parseFloat(ui.omega0Slider.value);
  shift = parseFloat(ui.shiftSlider.value);
  updateVisibility();
  updateReadouts();
  renderAll();
}
function onAxisChange() {
  tHalf = parseFloat(ui.tHalfSlider.value);
  omRange = parseFloat(ui.omRangeSlider.value);
  ui.markerSlider.min = (-omRange).toFixed(2);
  ui.markerSlider.max = omRange.toFixed(2);
  markerOm = Math.max(-omRange, Math.min(omRange, markerOm));
  // note: nT is constant, so the freehand buffer stays valid when the time
  // window changes — it is intentionally NOT cleared here.
  updateReadouts();
  renderAll();
}
function onDisplayChange() {
  magMode = ui.magMode.value;
  showPhase = ui.showPhase.checked;
  showAnalytic = ui.showAnalytic.checked;
  gridAlpha = parseFloat(ui.gridAlpha.value);
  if (ui.phaseCard) ui.phaseCard.style.display = showPhase ? '' : 'none';
  updateReadouts();
  renderAll();
}

ui.signalType.addEventListener('change', onSignalChange);
[ui.ampSlider, ui.widthSlider, ui.aSlider, ui.omega0Slider, ui.shiftSlider].forEach(el => el.addEventListener('input', onSignalChange));
[ui.tHalfSlider, ui.omRangeSlider].forEach(el => el.addEventListener('input', onAxisChange));
[ui.magMode, ui.showPhase, ui.showAnalytic, ui.gridAlpha].forEach(el => {
  el.addEventListener('input', onDisplayChange);
  el.addEventListener('change', onDisplayChange);
});
ui.markerSlider.addEventListener('input', () => {
  markerOm = parseFloat(ui.markerSlider.value);
  ui.markerVal.textContent = markerOm.toFixed(2);
  renderMag(); renderPha(); updateMarkerReadout();
});

window.addEventListener('resize', renderAll);
window.onThemeChange = () => renderAll();

// ============================================
// BACKGROUND
// ============================================
function initBg() {
  const c = document.getElementById('bgCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  function rs() { c.width = innerWidth; c.height = innerHeight; }
  rs(); window.addEventListener('resize', rs);
  const pts = [];
  for (let i = 0; i < 60; i++) pts.push({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.3, dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.08,
    a: Math.random() * 0.16 + 0.04
  });
  (function lp() {
    ctx.clearRect(0, 0, c.width, c.height);
    const t = Date.now() * 0.0003;
    ctx.strokeStyle = 'rgba(80,120,255,0.025)'; ctx.lineWidth = 1;
    for (let w = 0; w < 3; w++) {
      ctx.beginPath();
      for (let x = 0; x < c.width; x += 5) {
        const y = c.height * 0.5 + Math.sin(x * 0.004 + t + w * 2) * 50;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (const p of pts) {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
      if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
      ctx.fillStyle = `rgba(100,160,255,${p.a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TWO_PI); ctx.fill();
    }
    requestAnimationFrame(lp);
  })();
}

// ============================================
// INIT
// ============================================
initBg();
updateVisibility();
updateReadouts();
renderAll();
