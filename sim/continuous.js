/* ============================================
   SÜREKLİ ZAMAN KONVOLÜSYONU
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
// ── Aralık & örnekleme ──
let T_MIN = -6;
let T_MAX = 6;
let NUM_SAMPLES = 256;
let tArr = null;
let dt = 0;

function buildT() {
  dt = (T_MAX - T_MIN) / (NUM_SAMPLES - 1);
  const a = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) a[i] = T_MIN + i * dt;
  return a;
}
tArr = buildT();

// ── Canvas ──
const cvX = document.getElementById('canvasX');
const cvH = document.getElementById('canvasH');
const cvO = document.getElementById('canvasOverlap');
const cvY = document.getElementById('canvasY');

// ── UI ──
const ui = {
  xType: document.getElementById('xSignalType'),
  hType: document.getElementById('hSignalType'),
  xAmp: document.getElementById('xAmplitude'),
  xWidth: document.getElementById('xWidth'),
  xShift: document.getElementById('xShift'),
  xPeriodic: document.getElementById('xPeriodic'),
  xFreq: document.getElementById('xFreq'),
  hAmp: document.getElementById('hAmplitude'),
  hWidth: document.getElementById('hWidth'),
  hShift: document.getElementById('hShift'),
  hPeriodic: document.getElementById('hPeriodic'),
  hFreq: document.getElementById('hFreq'),
  instantValue: document.getElementById('instantValue'),
  xAmpVal: document.getElementById('xAmpVal'),
  xWidthVal: document.getElementById('xWidthVal'),
  xShiftVal: document.getElementById('xShiftVal'),
  xFreqVal: document.getElementById('xFreqVal'),
  hAmpVal: document.getElementById('hAmpVal'),
  hWidthVal: document.getElementById('hWidthVal'),
  hShiftVal: document.getElementById('hShiftVal'),
  hFreqVal: document.getElementById('hFreqVal'),
  xFreqGroup: document.getElementById('xFreqGroup'),
  hFreqGroup: document.getElementById('hFreqGroup'),
  xFreehandCtrl: document.getElementById('xFreehandControls'),
  hFreehandCtrl: document.getElementById('hFreehandControls'),
  xParamControls: document.getElementById('xParamControls'),
  hParamControls: document.getElementById('hParamControls'),
  tMinInput: document.getElementById('tMinInput'),
  tMaxInput: document.getElementById('tMaxInput'),
  applyRange: document.getElementById('applyRange'),
  samplesSlider: document.getElementById('samplesSlider'),
  samplesVal: document.getElementById('samplesVal'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  lineWidthSlider: document.getElementById('lineWidthSlider'),
  lineWidthVal: document.getElementById('lineWidthVal'),
  canvasHeight: document.getElementById('canvasHeight'),
  canvasHeightVal: document.getElementById('canvasHeightVal'),
};

// ── Durum ──
let tauShift = 0;
let isDragging = false;
let dragStartPx = 0;
let dragStartTau = 0;
let gridAlpha = 0.15;
let lineW = 2;

// Serbest çizim
let xFreehand = new Float64Array(NUM_SAMPLES);
let hFreehand = new Float64Array(NUM_SAMPLES);
let xFreehandMode = false;
let hFreehandMode = false;

function resetFree() {
  xFreehand = new Float64Array(NUM_SAMPLES);
  hFreehand = new Float64Array(NUM_SAMPLES);
}

// ============================================
// İŞARET ÜRETİCİ
// ============================================
function gen(type, t, amp, w, sh, per, freq) {
  const hw = w / 2;
  let te = t - sh;
  if (per && freq > 0) {
    const T = 1 / freq;
    te = te - T * Math.floor(te / T + 0.5);
  }
  switch (type) {
    case 'rect':     return Math.abs(te) <= hw ? amp : 0;
    case 'triangle': return Math.abs(te) > hw ? 0 : amp * (1 - Math.abs(te) / hw);
    case 'delta':    return Math.abs(te) <= dt * 1.5 ? amp / (dt * 3) : 0;
    case 'step':     return te >= 0 ? amp : 0;
    case 'sine':
      return per ? amp * Math.sin(2 * Math.PI * freq * te)
                 : (Math.abs(te) > hw ? 0 : amp * Math.sin(2 * Math.PI * te / w));
    case 'cosine':
      return per ? amp * Math.cos(2 * Math.PI * freq * te)
                 : (Math.abs(te) > hw ? 0 : amp * Math.cos(2 * Math.PI * te / w));
    case 'ramp':     return te < 0 ? 0 : te >= w ? amp : amp * te / w;
    case 'expDecay': return te < 0 ? 0 : amp * Math.exp(-te / (w * 0.3));
    case 'gaussian': return amp * Math.exp(-0.5 * (te / (w * 0.2)) ** 2);
    default: return 0;
  }
}

function makeSignal(prefix) {
  const type = ui[prefix + 'Type'].value;
  if (type === 'freehand') {
    const d = prefix === 'x' ? xFreehand : hFreehand;
    return d.length === NUM_SAMPLES ? d.slice() : new Float64Array(NUM_SAMPLES);
  }
  const amp = parseFloat(ui[prefix + 'Amp'].value);
  const w = parseFloat(ui[prefix + 'Width'].value);
  const sh = parseFloat(ui[prefix + 'Shift'].value);
  const per = ui[prefix + 'Periodic'].checked;
  const freq = parseFloat(ui[prefix + 'Freq'].value);
  const a = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    a[i] = gen(type, tArr[i], amp, w, sh, per, freq);
  }
  return a;
}

// ============================================
// KONVOLÜSYON
// ============================================
function convolve(x, h) {
  const N = NUM_SAMPLES;
  const Ny = 2 * N - 1;
  const y = new Float64Array(Ny);
  for (let n = 0; n < Ny; n++) {
    let s = 0;
    const kStart = Math.max(0, n - N + 1);
    const kEnd = Math.min(N - 1, n);
    for (let k = kStart; k <= kEnd; k++) {
      s += x[k] * h[n - k];
    }
    y[n] = s * dt;
  }
  return y;
}

function convTAxis() {
  const Ny = 2 * NUM_SAMPLES - 1;
  const a = new Float64Array(Ny);
  for (let i = 0; i < Ny; i++) {
    a[i] = 2 * T_MIN + i * dt;
  }
  return a;
}

// Anlık değer hesabı (kırmızı nokta için)
function valueAtTau(yArr, cT, tau) {
  if (cT.length === 0) return 0;
  const cMin = cT[0];
  const cdt = cT[1] - cT[0];
  const idx = Math.round((tau - cMin) / cdt);
  if (idx < 0 || idx >= yArr.length) return 0;
  return yArr[idx];
}

// ============================================
// ÇİZİM
// ============================================
const COL = {
  x: '#39ff85',
  h: '#ff8c42',
  y: '#7b8cff',
  marker: '#ff4f9a',
  axis: 'rgba(100,140,255,0.3)',
  axisLabel: 'rgba(180,190,220,0.55)',
  overlapFill: 'rgba(120,80,255,0.30)',
};

function prep(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr;
  cv.height = r.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height, ctx };
}

function yBounds(a) {
  let mn = 0, mx = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] < mn) mn = a[i];
    if (a[i] > mx) mx = a[i];
  }
  if (mn === mx) { mn = -1; mx = 1; }
  const r = mx - mn;
  mn -= r * 0.15;
  mx += r * 0.15;
  return { mn, mx };
}

function drawGrid(ctx, w, h, xMin, xMax, yMin, yMax) {
  ctx.strokeStyle = `rgba(100,160,255,${gridAlpha})`;
  ctx.lineWidth = 0.7;
  const xR = xMax - xMin || 1;
  let step = xR / 20;
  // güzel adım
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  step = Math.ceil(step / mag) * mag;
  for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) {
    const x = ((v - xMin) / xR) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  const yR = yMax - yMin || 1;
  let yStep = yR / 8;
  const ymag = Math.pow(10, Math.floor(Math.log10(yStep)));
  yStep = Math.ceil(yStep / ymag) * ymag;
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const y = h - ((v - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawAxes(ctx, w, h, xMin, xMax, yMin, yMax) {
  ctx.strokeStyle = COL.axis;
  ctx.lineWidth = 1.2;
  if (yMin <= 0 && yMax >= 0) {
    const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(w, y0); ctx.stroke();
  }
  if (xMin <= 0 && xMax >= 0) {
    const x0 = ((0 - xMin) / (xMax - xMin)) * w;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
  }
  ctx.fillStyle = COL.axisLabel;
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'center';
  const xR = xMax - xMin;
  let step = xR / 12;
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  step = Math.ceil(step / mag) * mag;
  const y0px = (yMin <= 0 && yMax >= 0) ? h - ((0 - yMin) / (yMax - yMin)) * h : h - 10;
  for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) {
    const x = ((v - xMin) / xR) * w;
    const label = Math.abs(v) < 1e-9 ? '0' : (Number.isInteger(v) ? v.toString() : v.toFixed(1));
    ctx.fillText(label, x, Math.min(y0px + 14, h - 2));
  }
}

function drawLine(ctx, w, h, xMin, xMax, yMin, yMax, arr, tAx, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  for (let i = 0; i < arr.length; i++) {
    const x = ((tAx[i] - xMin) / (xMax - xMin)) * w;
    const y = h - ((arr[i] - yMin) / (yMax - yMin)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawFill(ctx, w, h, xMin, xMax, yMin, yMax, arr, tAx) {
  const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
  ctx.fillStyle = COL.overlapFill;
  ctx.beginPath();
  ctx.moveTo(((tAx[0] - xMin) / (xMax - xMin)) * w, y0);
  for (let i = 0; i < arr.length; i++) {
    const x = ((tAx[i] - xMin) / (xMax - xMin)) * w;
    const y = h - ((arr[i] - yMin) / (yMax - yMin)) * h;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(((tAx[arr.length - 1] - xMin) / (xMax - xMin)) * w, y0);
  ctx.closePath();
  ctx.fill();
}

function drawMarkerLine(ctx, w, h, xMin, xMax, pos) {
  const x = ((pos - xMin) / (xMax - xMin)) * w;
  if (x < 0 || x > w) return;
  ctx.strokeStyle = COL.marker;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  ctx.setLineDash([]);
}

function drawDot(ctx, w, h, xMin, xMax, yMin, yMax, pos, val) {
  const x = ((pos - xMin) / (xMax - xMin)) * w;
  const y = h - ((val - yMin) / (yMax - yMin)) * h;
  if (x < 0 || x > w) return;
  ctx.fillStyle = COL.marker;
  ctx.shadowColor = COL.marker;
  ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
}

// ============================================
// RENDER (4 ekran)
// ============================================

// y(t) tek seferlik hesaplanır, sadece tau değişir
let cachedY = null;
let cachedCT = null;
let cachedYBounds = null;

function recomputeY() {
  const xArr = makeSignal('x');
  const hArr = makeSignal('h');
  cachedY = convolve(xArr, hArr);
  cachedCT = convTAxis();
  cachedYBounds = yBounds(cachedY);
  return { xArr, hArr };
}

function render(skipRecompute) {
  let xArr, hArr;
  if (!skipRecompute || !cachedY) {
    const r = recomputeY();
    xArr = r.xArr;
    hArr = r.hArr;
  } else {
    xArr = makeSignal('x');
    hArr = makeSignal('h');
  }

  const tau = tauShift;

  // h(tau − τ)
  const hFlip = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const tf = tau - tArr[i];
    const idx = Math.round((tf - T_MIN) / dt);
    hFlip[i] = (idx >= 0 && idx < NUM_SAMPLES) ? hArr[idx] : 0;
  }
  const prod = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) prod[i] = xArr[i] * hFlip[i];

  const inst = valueAtTau(cachedY, cachedCT, tau);
  ui.instantValue.textContent = `y(${tau.toFixed(2)}) = ${inst.toFixed(3)}`;

  // 1: x(t) — t aralığı T_MIN..T_MAX, SABİT
  const s1 = prep(cvX); s1.ctx.clearRect(0, 0, s1.w, s1.h);
  const bx = yBounds(xArr);
  drawGrid(s1.ctx, s1.w, s1.h, T_MIN, T_MAX, bx.mn, bx.mx);
  drawAxes(s1.ctx, s1.w, s1.h, T_MIN, T_MAX, bx.mn, bx.mx);
  drawLine(s1.ctx, s1.w, s1.h, T_MIN, T_MAX, bx.mn, bx.mx, xArr, tArr, COL.x);

  // 2: h(t) — SABİT
  const s2 = prep(cvH); s2.ctx.clearRect(0, 0, s2.w, s2.h);
  const bh = yBounds(hArr);
  drawGrid(s2.ctx, s2.w, s2.h, T_MIN, T_MAX, bh.mn, bh.mx);
  drawAxes(s2.ctx, s2.w, s2.h, T_MIN, T_MAX, bh.mn, bh.mx);
  drawLine(s2.ctx, s2.w, s2.h, T_MIN, T_MAX, bh.mn, bh.mx, hArr, tArr, COL.h);

  // 3: çakışma (interaktif)
  const s3 = prep(cvO); s3.ctx.clearRect(0, 0, s3.w, s3.h);
  const all = new Float64Array(NUM_SAMPLES * 3);
  all.set(xArr); all.set(hFlip, NUM_SAMPLES); all.set(prod, NUM_SAMPLES * 2);
  const bo = yBounds(all);
  drawGrid(s3.ctx, s3.w, s3.h, T_MIN, T_MAX, bo.mn, bo.mx);
  drawAxes(s3.ctx, s3.w, s3.h, T_MIN, T_MAX, bo.mn, bo.mx);
  drawFill(s3.ctx, s3.w, s3.h, T_MIN, T_MAX, bo.mn, bo.mx, prod, tArr);
  drawLine(s3.ctx, s3.w, s3.h, T_MIN, T_MAX, bo.mn, bo.mx, xArr, tArr, COL.x);
  drawLine(s3.ctx, s3.w, s3.h, T_MIN, T_MAX, bo.mn, bo.mx, hFlip, tArr, COL.h);
  drawMarkerLine(s3.ctx, s3.w, s3.h, T_MIN, T_MAX, tau);

  // 4: y(t) — TAMAMEN SABİT, sadece kırmızı nokta gezer
  const s4 = prep(cvY); s4.ctx.clearRect(0, 0, s4.w, s4.h);
  const cMin = cachedCT[0];
  const cMax = cachedCT[cachedCT.length - 1];
  const by = cachedYBounds;
  drawGrid(s4.ctx, s4.w, s4.h, cMin, cMax, by.mn, by.mx);
  drawAxes(s4.ctx, s4.w, s4.h, cMin, cMax, by.mn, by.mx);
  drawLine(s4.ctx, s4.w, s4.h, cMin, cMax, by.mn, by.mx, cachedY, cachedCT, COL.y);
  // Kırmızı nokta — yalnızca o
  drawDot(s4.ctx, s4.w, s4.h, cMin, cMax, by.mn, by.mx, tau, inst);
}

// ============================================
// FARE KAYDIRMA (3. ekran)
// ============================================
cvO.addEventListener('mousedown', e => {
  isDragging = true;
  dragStartPx = e.clientX;
  dragStartTau = tauShift;
  cvO.style.cursor = 'grabbing';
  e.preventDefault();
});
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const rect = cvO.getBoundingClientRect();
  const dx = e.clientX - dragStartPx;
  tauShift = dragStartTau + (dx / rect.width) * (T_MAX - T_MIN);
  tauShift = Math.max(2 * T_MIN, Math.min(2 * T_MAX, tauShift));
  render(true); // y'yi yeniden hesaplama
});
window.addEventListener('mouseup', () => {
  if (isDragging) { isDragging = false; cvO.style.cursor = 'ew-resize'; }
});

cvO.addEventListener('touchstart', e => {
  e.preventDefault();
  isDragging = true;
  dragStartPx = e.touches[0].clientX;
  dragStartTau = tauShift;
}, { passive: false });
window.addEventListener('touchmove', e => {
  if (!isDragging) return;
  const rect = cvO.getBoundingClientRect();
  const dx = e.touches[0].clientX - dragStartPx;
  tauShift = dragStartTau + (dx / rect.width) * (T_MAX - T_MIN);
  tauShift = Math.max(2 * T_MIN, Math.min(2 * T_MAX, tauShift));
  render(true);
}, { passive: false });
window.addEventListener('touchend', () => { isDragging = false; });

// ============================================
// SERBEST ÇİZİM (Jezzamon stili: lineer enterpolasyon)
// ============================================
function setupFreehand(canvas, prefix) {
  let drawing = false;
  let prevIdx = -1;
  let prevAmp = 0;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0].clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0].clientY);
    const xPx = clientX - rect.left;
    const yPx = clientY - rect.top;
    const idx = Math.round((xPx / rect.width) * (NUM_SAMPLES - 1));
    const yNorm = 1 - (yPx / rect.height);
    const amp = (yNorm - 0.5) * 4;
    return { idx, amp };
  }

  function isActive() {
    return prefix === 'x' ? xFreehandMode : hFreehandMode;
  }

  function getArr() {
    return prefix === 'x' ? xFreehand : hFreehand;
  }

  function plotInterpolated(idx, amp) {
    const arr = getArr();
    if (prevIdx < 0 || prevIdx === idx) {
      if (idx >= 0 && idx < NUM_SAMPLES) arr[idx] = amp;
    } else {
      // Önceki nokta ile bu nokta arasındaki TÜM indeksleri lineer enterpolasyon ile doldur
      const start = Math.min(prevIdx, idx);
      const end = Math.max(prevIdx, idx);
      const startAmp = prevIdx < idx ? prevAmp : amp;
      const endAmp = prevIdx < idx ? amp : prevAmp;
      const span = end - start;
      for (let i = start; i <= end; i++) {
        if (i < 0 || i >= NUM_SAMPLES) continue;
        const t = span === 0 ? 0 : (i - start) / span;
        arr[i] = startAmp + (endAmp - startAmp) * t;
      }
    }
    prevIdx = idx;
    prevAmp = amp;
  }

  canvas.addEventListener('mousedown', e => {
    if (!isActive()) return;
    drawing = true;
    prevIdx = -1;
    const p = getPos(e);
    plotInterpolated(p.idx, p.amp);
    render(); // tam re-render (x veya h değişti)
    e.preventDefault();
    e.stopPropagation();
  });

  canvas.addEventListener('mousemove', e => {
    if (!drawing || !isActive()) return;
    const p = getPos(e);
    plotInterpolated(p.idx, p.amp);
    render();
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    drawing = false;
    prevIdx = -1;
  });

  canvas.addEventListener('touchstart', e => {
    if (!isActive()) return;
    drawing = true;
    prevIdx = -1;
    const p = getPos(e);
    plotInterpolated(p.idx, p.amp);
    render();
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (!drawing || !isActive()) return;
    const p = getPos(e);
    plotInterpolated(p.idx, p.amp);
    render();
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    drawing = false;
    prevIdx = -1;
  });
}
setupFreehand(cvX, 'x');
setupFreehand(cvH, 'h');

// Butonlar
document.getElementById('xClear').onclick = () => {
  xFreehand = new Float64Array(NUM_SAMPLES); render();
};
document.getElementById('xNormalize').onclick = () => {
  let m = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) m = Math.max(m, Math.abs(xFreehand[i]));
  if (m > 0) for (let i = 0; i < NUM_SAMPLES; i++) xFreehand[i] /= m;
  render();
};
document.getElementById('xSmooth').onclick = () => {
  const s = new Float64Array(NUM_SAMPLES);
  for (let i = 1; i < NUM_SAMPLES - 1; i++) s[i] = (xFreehand[i-1] + xFreehand[i] + xFreehand[i+1]) / 3;
  s[0] = xFreehand[0]; s[NUM_SAMPLES - 1] = xFreehand[NUM_SAMPLES - 1];
  xFreehand = s; render();
};
document.getElementById('hClear').onclick = () => {
  hFreehand = new Float64Array(NUM_SAMPLES); render();
};
document.getElementById('hNormalize').onclick = () => {
  let m = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) m = Math.max(m, Math.abs(hFreehand[i]));
  if (m > 0) for (let i = 0; i < NUM_SAMPLES; i++) hFreehand[i] /= m;
  render();
};
document.getElementById('hSmooth').onclick = () => {
  const s = new Float64Array(NUM_SAMPLES);
  for (let i = 1; i < NUM_SAMPLES - 1; i++) s[i] = (hFreehand[i-1] + hFreehand[i] + hFreehand[i+1]) / 3;
  s[0] = hFreehand[0]; s[NUM_SAMPLES - 1] = hFreehand[NUM_SAMPLES - 1];
  hFreehand = s; render();
};

// ============================================
// UI OLAYLARI
// ============================================
function updDisp() {
  ui.xAmpVal.textContent = parseFloat(ui.xAmp.value).toFixed(2);
  ui.xWidthVal.textContent = parseFloat(ui.xWidth.value).toFixed(2);
  ui.xShiftVal.textContent = parseFloat(ui.xShift.value).toFixed(2);
  ui.xFreqVal.textContent = parseFloat(ui.xFreq.value).toFixed(2);
  ui.hAmpVal.textContent = parseFloat(ui.hAmp.value).toFixed(2);
  ui.hWidthVal.textContent = parseFloat(ui.hWidth.value).toFixed(2);
  ui.hShiftVal.textContent = parseFloat(ui.hShift.value).toFixed(2);
  ui.hFreqVal.textContent = parseFloat(ui.hFreq.value).toFixed(2);
  ui.gridAlphaVal.textContent = parseFloat(ui.gridAlpha.value).toFixed(2);
  ui.lineWidthVal.textContent = parseFloat(ui.lineWidthSlider.value).toFixed(1);
  ui.canvasHeightVal.textContent = ui.canvasHeight.value;
  ui.samplesVal.textContent = ui.samplesSlider.value;
}

function updFreq() {
  ui.xFreq.disabled = !ui.xPeriodic.checked;
  ui.xFreqGroup.classList.toggle('disabled', !ui.xPeriodic.checked);
  ui.hFreq.disabled = !ui.hPeriodic.checked;
  ui.hFreqGroup.classList.toggle('disabled', !ui.hPeriodic.checked);
}

function updFree() {
  const xF = ui.xType.value === 'freehand';
  const hF = ui.hType.value === 'freehand';
  xFreehandMode = xF;
  hFreehandMode = hF;
  ui.xFreehandCtrl.style.display = xF ? 'flex' : 'none';
  ui.hFreehandCtrl.style.display = hF ? 'flex' : 'none';
  ui.xParamControls.style.display = xF ? 'none' : 'block';
  ui.hParamControls.style.display = hF ? 'none' : 'block';
  cvX.classList.toggle('freehand-active', xF);
  cvH.classList.toggle('freehand-active', hF);
}

function onIn() {
  updDisp(); updFreq(); updFree(); render();
}

[ui.xType, ui.hType, ui.xAmp, ui.xWidth, ui.xShift, ui.xFreq,
 ui.hAmp, ui.hWidth, ui.hShift, ui.hFreq, ui.xPeriodic, ui.hPeriodic
].forEach(e => {
  e.addEventListener('input', onIn);
  e.addEventListener('change', onIn);
});

ui.gridAlpha.addEventListener('input', () => {
  gridAlpha = parseFloat(ui.gridAlpha.value);
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);
  render(true);
});
ui.lineWidthSlider.addEventListener('input', () => {
  lineW = parseFloat(ui.lineWidthSlider.value);
  ui.lineWidthVal.textContent = lineW.toFixed(1);
  render(true);
});
ui.canvasHeight.addEventListener('input', () => {
  const h = parseInt(ui.canvasHeight.value);
  ui.canvasHeightVal.textContent = h;
  document.querySelectorAll('.graph-container canvas').forEach(c => {
    c.style.height = h + 'px';
  });
  render(true);
});
ui.samplesSlider.addEventListener('input', () => {
  NUM_SAMPLES = parseInt(ui.samplesSlider.value);
  ui.samplesVal.textContent = NUM_SAMPLES;
  tArr = buildT();
  resetFree();
  render();
});
ui.applyRange.addEventListener('click', () => {
  const mn = parseFloat(ui.tMinInput.value);
  const mx = parseFloat(ui.tMaxInput.value);
  if (isNaN(mn) || isNaN(mx) || mn >= mx) return;
  T_MIN = mn; T_MAX = mx;
  tArr = buildT();
  resetFree();
  tauShift = 0;
  render();
});

// ============================================
// ARKAPLAN
// ============================================
function initBg() {
  const c = document.getElementById('bgCanvas');
  const ctx = c.getContext('2d');
  function rs() { c.width = innerWidth; c.height = innerHeight; }
  rs();
  window.addEventListener('resize', rs);
  const pts = [];
  for (let i = 0; i < 50; i++) pts.push({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.3,
    dx: (Math.random() - 0.5) * 0.18,
    dy: (Math.random() - 0.5) * 0.1,
    a: Math.random() * 0.18 + 0.03
  });
  (function lp() {
    ctx.clearRect(0, 0, c.width, c.height);
    const t = Date.now() * 0.0003;
    ctx.strokeStyle = 'rgba(80,120,255,0.025)';
    ctx.lineWidth = 1;
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
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(lp);
  })();
}

// ============================================
// BAŞLAT
// ============================================
window.addEventListener('resize', () => render(true));
initBg();
updDisp();
updFreq();
updFree();
render();
