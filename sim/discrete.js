/* ============================================
   AYRIK ZAMAN KONVOLÜSYONU
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
let N_MIN = -20;
let N_MAX = 20;
let nArr = buildNArr();

function buildNArr() {
  const arr = [];
  for (let i = N_MIN; i <= N_MAX; i++) arr.push(i);
  return arr;
}

const cvX = document.getElementById('canvasX');
const cvH = document.getElementById('canvasH');
const cvO = document.getElementById('canvasOverlap');
const cvY = document.getElementById('canvasY');

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
  nMinInput: document.getElementById('nMinInput'),
  nMaxInput: document.getElementById('nMaxInput'),
  applyRange: document.getElementById('applyRange'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  dotSize: document.getElementById('dotSize'),
  dotSizeVal: document.getElementById('dotSizeVal'),
  stemWidth: document.getElementById('stemWidth'),
  stemWidthVal: document.getElementById('stemWidthVal'),
  canvasHeight: document.getElementById('canvasHeight'),
  canvasHeightVal: document.getElementById('canvasHeightVal'),
};

let tauShift = 0;
let isDragging = false;
let dragStartPx = 0;
let dragStartTau = 0;
let gridAlpha = 0.15;
let dotRadius = 4;
let stemLineW = 2;

let xFreehand = null;
let hFreehand = null;
let xFreehandMode = false;
let hFreehandMode = false;

function resetFreehand() {
  const len = nArr.length;
  xFreehand = new Float64Array(len);
  hFreehand = new Float64Array(len);
}
resetFreehand();

// ============================================
// İŞARET ÜRETİCİ
// ============================================
function genSignal(type, n, amp, width, shift, periodic, freq) {
  const hw = Math.floor(width / 2);
  let ne = n - shift;
  if (periodic && freq > 0) {
    const T = Math.round(1 / freq);
    if (T > 0) { ne = ((ne % T) + T) % T; if (ne > T / 2) ne -= T; }
  }
  switch (type) {
    case 'rect':     return (ne >= -hw && ne <= hw) ? amp : 0;
    case 'triangle': return Math.abs(ne) > hw ? 0 : amp * (1 - Math.abs(ne) / hw);
    case 'delta':    return ne === 0 ? amp : 0;
    case 'step':     return ne >= 0 ? amp : 0;
    case 'sine':
      if (!periodic) return Math.abs(ne) > hw ? 0 : amp * Math.sin(2 * Math.PI * ne / width);
      return amp * Math.sin(2 * Math.PI * freq * ne);
    case 'cosine':
      if (!periodic) return Math.abs(ne) > hw ? 0 : amp * Math.cos(2 * Math.PI * ne / width);
      return amp * Math.cos(2 * Math.PI * freq * ne);
    case 'ramp':     return ne < 0 ? 0 : ne >= width ? amp : amp * ne / width;
    case 'expDecay': return ne < 0 ? 0 : amp * Math.exp(-ne / (width * 0.3));
    case 'gaussian': return amp * Math.exp(-0.5 * (ne / (width * 0.2)) ** 2);
    default: return 0;
  }
}

function makeSignal(prefix) {
  const type = ui[prefix + 'Type'].value;
  const N = nArr.length;
  if (type === 'freehand') {
    const d = prefix === 'x' ? xFreehand : hFreehand;
    return d.length === N ? d.slice() : new Float64Array(N);
  }
  const amp = parseFloat(ui[prefix + 'Amp'].value);
  const width = parseInt(ui[prefix + 'Width'].value);
  const shift = parseInt(ui[prefix + 'Shift'].value);
  const periodic = ui[prefix + 'Periodic'].checked;
  const freq = parseFloat(ui[prefix + 'Freq'].value);
  const arr = new Float64Array(N);
  for (let i = 0; i < N; i++) arr[i] = genSignal(type, nArr[i], amp, width, shift, periodic, freq);
  return arr;
}

// ============================================
// KONVOLÜSYON
// ============================================
function convolve(x, h) {
  const Nx = x.length, Nh = h.length, Ny = Nx + Nh - 1;
  const y = new Float64Array(Ny);
  for (let n = 0; n < Ny; n++) {
    let s = 0;
    for (let k = 0; k < Nx; k++) {
      const j = n - k;
      if (j >= 0 && j < Nh) s += x[k] * h[j];
    }
    y[n] = s;
  }
  return y;
}

function convNAxis() {
  const Ny = 2 * nArr.length - 1;
  const arr = [];
  for (let i = 0; i < Ny; i++) arr.push(2 * N_MIN + i);
  return arr;
}

function valueAtTau(yArr, cN, tau) {
  if (!cN.length) return 0;
  const idx = tau - cN[0];
  if (idx < 0 || idx >= yArr.length) return 0;
  return yArr[idx];
}

// ============================================
// ÇİZİM
// ============================================
const COL = {
  x: '#39ff85', h: '#ff8c42', y: '#7b8cff', marker: '#ff4f9a',
  axis: 'rgba(100,140,255,0.3)',
  axisLabel: 'rgba(180,190,220,0.55)',
  overlapFill: 'rgba(120,80,255,0.30)',
};

function prep(cv) {
  const rect = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = rect.width * dpr;
  cv.height = rect.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: rect.width, h: rect.height, ctx };
}

function yBounds(arr) {
  let mn = 0, mx = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < mn) mn = arr[i];
    if (arr[i] > mx) mx = arr[i];
  }
  if (mn === mx) { mn = -1; mx = 1; }
  const r = mx - mn;
  mn -= r * 0.15;
  mx += r * 0.15;
  return { mn, mx };
}

function drawGrid(ctx, w, h, nMin, nMax, yMin, yMax) {
  ctx.strokeStyle = `rgba(100,160,255,${gridAlpha})`;
  ctx.lineWidth = 0.7;
  const nRange = nMax - nMin || 1;
  const step = Math.max(1, Math.ceil(nRange / 25));
  for (let n = Math.ceil(nMin / step) * step; n <= nMax; n += step) {
    const x = ((n - nMin) / nRange) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  const yRange = yMax - yMin || 1;
  let yStep = yRange / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(yStep)));
  yStep = Math.ceil(yStep / mag) * mag;
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const y = h - ((v - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawAxes(ctx, w, h, nMin, nMax, yMin, yMax) {
  ctx.strokeStyle = COL.axis; ctx.lineWidth = 1.2;
  if (yMin <= 0 && yMax >= 0) {
    const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(w, y0); ctx.stroke();
  }
  if (nMin <= 0 && nMax >= 0) {
    const x0 = ((0 - nMin) / (nMax - nMin)) * w;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
  }
  ctx.fillStyle = COL.axisLabel;
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'center';
  const nRange = nMax - nMin || 1;
  const step = Math.max(1, Math.ceil(nRange / 14));
  const y0px = (yMin <= 0 && yMax >= 0) ? h - ((0 - yMin) / (yMax - yMin)) * h : h - 10;
  for (let n = Math.ceil(nMin / step) * step; n <= nMax; n += step) {
    const x = ((n - nMin) / nRange) * w;
    ctx.fillText(n, x, Math.min(y0px + 14, h - 2));
  }
}

function drawStem(ctx, w, h, nMin, nMax, yMin, yMax, arr, nAxis, color) {
  const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
  const nRange = nMax - nMin || 1;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = stemLineW;
  for (let i = 0; i < arr.length; i++) {
    const x = ((nAxis[i] - nMin) / nRange) * w;
    const y = h - ((arr[i] - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, dotRadius, 0, Math.PI * 2); ctx.fill();
  }
}

function drawOverlapBars(ctx, w, h, nMin, nMax, yMin, yMax, arr, nAxis) {
  const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
  const nRange = nMax - nMin || 1;
  const barW = Math.max(2, (w / nRange) * 0.35);
  ctx.fillStyle = COL.overlapFill;
  ctx.strokeStyle = 'rgba(120,80,255,0.45)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0) continue;
    const x = ((nAxis[i] - nMin) / nRange) * w;
    const y = h - ((arr[i] - yMin) / (yMax - yMin)) * h;
    ctx.fillRect(x - barW / 2, Math.min(y, y0), barW, Math.abs(y - y0));
    ctx.strokeRect(x - barW / 2, Math.min(y, y0), barW, Math.abs(y - y0));
  }
}

function drawMarker(ctx, w, h, nMin, nMax, nPos) {
  const x = ((nPos - nMin) / (nMax - nMin)) * w;
  if (x < 0 || x > w) return;
  ctx.strokeStyle = COL.marker; ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  ctx.setLineDash([]);
}

function drawDot(ctx, w, h, nMin, nMax, yMin, yMax, nPos, val) {
  const x = ((nPos - nMin) / (nMax - nMin)) * w;
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
// RENDER
// ============================================

let cachedY = null;
let cachedCN = null;
let cachedYBounds = null;

function recomputeY() {
  const xArr = makeSignal('x');
  const hArr = makeSignal('h');
  cachedY = convolve(xArr, hArr);
  cachedCN = convNAxis();
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

  const tau = Math.round(tauShift);
  const N = nArr.length;

  const hFlip = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const tgt = tau - nArr[i];
    const idx = tgt - N_MIN;
    hFlip[i] = (idx >= 0 && idx < N) ? hArr[idx] : 0;
  }
  const product = new Float64Array(N);
  for (let i = 0; i < N; i++) product[i] = xArr[i] * hFlip[i];

  const inst = valueAtTau(cachedY, cachedCN, tau);
  ui.instantValue.textContent = `y[${tau}] = ${inst.toFixed(3)}`;

  // 1: x[n]
  const s1 = prep(cvX); s1.ctx.clearRect(0, 0, s1.w, s1.h);
  const bx = yBounds(xArr);
  drawGrid(s1.ctx, s1.w, s1.h, N_MIN, N_MAX, bx.mn, bx.mx);
  drawAxes(s1.ctx, s1.w, s1.h, N_MIN, N_MAX, bx.mn, bx.mx);
  drawStem(s1.ctx, s1.w, s1.h, N_MIN, N_MAX, bx.mn, bx.mx, xArr, nArr, COL.x);

  // 2: h[n]
  const s2 = prep(cvH); s2.ctx.clearRect(0, 0, s2.w, s2.h);
  const bh = yBounds(hArr);
  drawGrid(s2.ctx, s2.w, s2.h, N_MIN, N_MAX, bh.mn, bh.mx);
  drawAxes(s2.ctx, s2.w, s2.h, N_MIN, N_MAX, bh.mn, bh.mx);
  drawStem(s2.ctx, s2.w, s2.h, N_MIN, N_MAX, bh.mn, bh.mx, hArr, nArr, COL.h);

  // 3: çakışma
  const s3 = prep(cvO); s3.ctx.clearRect(0, 0, s3.w, s3.h);
  const all = new Float64Array(N * 3);
  all.set(xArr); all.set(hFlip, N); all.set(product, N * 2);
  const bo = yBounds(all);
  drawGrid(s3.ctx, s3.w, s3.h, N_MIN, N_MAX, bo.mn, bo.mx);
  drawAxes(s3.ctx, s3.w, s3.h, N_MIN, N_MAX, bo.mn, bo.mx);
  drawOverlapBars(s3.ctx, s3.w, s3.h, N_MIN, N_MAX, bo.mn, bo.mx, product, nArr);
  drawStem(s3.ctx, s3.w, s3.h, N_MIN, N_MAX, bo.mn, bo.mx, xArr, nArr, COL.x);
  drawStem(s3.ctx, s3.w, s3.h, N_MIN, N_MAX, bo.mn, bo.mx, hFlip, nArr, COL.h);
  drawMarker(s3.ctx, s3.w, s3.h, N_MIN, N_MAX, tau);

  // 4: y[n] — TAMAMEN SABİT, sadece kırmızı nokta gezsin
  const s4 = prep(cvY); s4.ctx.clearRect(0, 0, s4.w, s4.h);
  const cMin = cachedCN[0];
  const cMax = cachedCN[cachedCN.length - 1];
  const by = cachedYBounds;
  drawGrid(s4.ctx, s4.w, s4.h, cMin, cMax, by.mn, by.mx);
  drawAxes(s4.ctx, s4.w, s4.h, cMin, cMax, by.mn, by.mx);
  drawStem(s4.ctx, s4.w, s4.h, cMin, cMax, by.mn, by.mx, cachedY, cachedCN, COL.y);
  // Kırmızı nokta
  drawDot(s4.ctx, s4.w, s4.h, cMin, cMax, by.mn, by.mx, tau, inst);
}

// ============================================
// FARE KAYDIRMA
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
  tauShift = dragStartTau + (dx / rect.width) * (N_MAX - N_MIN);
  tauShift = Math.max(2 * N_MIN, Math.min(2 * N_MAX, tauShift));
  render(true);
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
  tauShift = dragStartTau + (dx / rect.width) * (N_MAX - N_MIN);
  tauShift = Math.max(2 * N_MIN, Math.min(2 * N_MAX, tauShift));
  render(true);
}, { passive: false });
window.addEventListener('touchend', () => { isDragging = false; });

// ============================================
// SERBEST ÇİZİM (Jezzamon stili)
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
    const idx = Math.round((xPx / rect.width) * (nArr.length - 1));
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
    const N = nArr.length;
    if (prevIdx < 0 || prevIdx === idx) {
      if (idx >= 0 && idx < N) arr[idx] = amp;
    } else {
      const start = Math.min(prevIdx, idx);
      const end = Math.max(prevIdx, idx);
      const startAmp = prevIdx < idx ? prevAmp : amp;
      const endAmp = prevIdx < idx ? amp : prevAmp;
      const span = end - start;
      for (let i = start; i <= end; i++) {
        if (i < 0 || i >= N) continue;
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
    render();
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
  xFreehand = new Float64Array(nArr.length); render();
};
document.getElementById('xNormalize').onclick = () => {
  let mx = 0;
  for (let i = 0; i < xFreehand.length; i++) mx = Math.max(mx, Math.abs(xFreehand[i]));
  if (mx > 0) for (let i = 0; i < xFreehand.length; i++) xFreehand[i] /= mx;
  render();
};
document.getElementById('xSmooth').onclick = () => {
  const s = new Float64Array(nArr.length);
  for (let i = 1; i < nArr.length - 1; i++) s[i] = (xFreehand[i-1] + xFreehand[i] + xFreehand[i+1]) / 3;
  s[0] = xFreehand[0]; s[nArr.length - 1] = xFreehand[nArr.length - 1];
  xFreehand = s; render();
};
document.getElementById('hClear').onclick = () => {
  hFreehand = new Float64Array(nArr.length); render();
};
document.getElementById('hNormalize').onclick = () => {
  let mx = 0;
  for (let i = 0; i < hFreehand.length; i++) mx = Math.max(mx, Math.abs(hFreehand[i]));
  if (mx > 0) for (let i = 0; i < hFreehand.length; i++) hFreehand[i] /= mx;
  render();
};
document.getElementById('hSmooth').onclick = () => {
  const s = new Float64Array(nArr.length);
  for (let i = 1; i < nArr.length - 1; i++) s[i] = (hFreehand[i-1] + hFreehand[i] + hFreehand[i+1]) / 3;
  s[0] = hFreehand[0]; s[nArr.length - 1] = hFreehand[nArr.length - 1];
  hFreehand = s; render();
};

// ============================================
// UI OLAYLARI
// ============================================
function updateDisplays() {
  ui.xAmpVal.textContent = parseFloat(ui.xAmp.value).toFixed(2);
  ui.xWidthVal.textContent = ui.xWidth.value;
  ui.xShiftVal.textContent = ui.xShift.value;
  ui.xFreqVal.textContent = parseFloat(ui.xFreq.value).toFixed(2);
  ui.hAmpVal.textContent = parseFloat(ui.hAmp.value).toFixed(2);
  ui.hWidthVal.textContent = ui.hWidth.value;
  ui.hShiftVal.textContent = ui.hShift.value;
  ui.hFreqVal.textContent = parseFloat(ui.hFreq.value).toFixed(2);
  ui.gridAlphaVal.textContent = parseFloat(ui.gridAlpha.value).toFixed(2);
  ui.dotSizeVal.textContent = parseFloat(ui.dotSize.value).toFixed(1);
  ui.stemWidthVal.textContent = parseFloat(ui.stemWidth.value).toFixed(1);
  ui.canvasHeightVal.textContent = ui.canvasHeight.value;
}

function updateFreq() {
  const xP = ui.xPeriodic.checked;
  ui.xFreq.disabled = !xP;
  ui.xFreqGroup.classList.toggle('disabled', !xP);
  const hP = ui.hPeriodic.checked;
  ui.hFreq.disabled = !hP;
  ui.hFreqGroup.classList.toggle('disabled', !hP);
}

function updateFreehand() {
  const xF = ui.xType.value === 'freehand';
  const hF = ui.hType.value === 'freehand';
  xFreehandMode = xF; hFreehandMode = hF;
  ui.xFreehandCtrl.style.display = xF ? 'flex' : 'none';
  ui.hFreehandCtrl.style.display = hF ? 'flex' : 'none';
  ui.xParamControls.style.display = xF ? 'none' : 'block';
  ui.hParamControls.style.display = hF ? 'none' : 'block';
  cvX.classList.toggle('freehand-active', xF);
  cvH.classList.toggle('freehand-active', hF);
}

function onInput() {
  updateDisplays(); updateFreq(); updateFreehand(); render();
}

[ui.xType, ui.hType, ui.xAmp, ui.xWidth, ui.xShift, ui.xFreq,
 ui.hAmp, ui.hWidth, ui.hShift, ui.hFreq, ui.xPeriodic, ui.hPeriodic
].forEach(el => {
  el.addEventListener('input', onInput);
  el.addEventListener('change', onInput);
});

ui.gridAlpha.addEventListener('input', () => {
  gridAlpha = parseFloat(ui.gridAlpha.value);
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);
  render(true);
});
ui.dotSize.addEventListener('input', () => {
  dotRadius = parseFloat(ui.dotSize.value);
  ui.dotSizeVal.textContent = dotRadius.toFixed(1);
  render(true);
});
ui.stemWidth.addEventListener('input', () => {
  stemLineW = parseFloat(ui.stemWidth.value);
  ui.stemWidthVal.textContent = stemLineW.toFixed(1);
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

ui.applyRange.addEventListener('click', () => {
  const mn = parseInt(ui.nMinInput.value);
  const mx = parseInt(ui.nMaxInput.value);
  if (isNaN(mn) || isNaN(mx) || mn >= mx) return;
  N_MIN = mn; N_MAX = mx;
  nArr = buildNArr();
  resetFreehand();
  tauShift = 0;
  render();
});

// ============================================
// ARKAPLAN
// ============================================
function initBg() {
  const c = document.getElementById('bgCanvas');
  const ctx = c.getContext('2d');
  function resize() { c.width = innerWidth; c.height = innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  const pts = [];
  for (let i = 0; i < 50; i++) pts.push({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.3,
    dx: (Math.random() - 0.5) * 0.18,
    dy: (Math.random() - 0.5) * 0.1,
    a: Math.random() * 0.18 + 0.03
  });
  (function loop() {
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
    requestAnimationFrame(loop);
  })();
}

window.addEventListener('resize', () => render(true));
initBg();
updateDisplays();
updateFreq();
updateFreehand();
render();
