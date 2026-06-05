/* ============================================
   DFT / FFT — Sayısal Spektrum
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
const PI = Math.PI;
const TWO_PI = 2 * PI;

// ── Canvas ──
const cvXn   = document.getElementById('cvXn');
const cvWin  = document.getElementById('cvWin');
const cvSpec = document.getElementById('cvSpec');
const cvIDFT = document.getElementById('cvIDFT');

// ── UI ──
const ui = {
  signalType: document.getElementById('signalType'),
  k0Slider: document.getElementById('k0Slider'),
  k0Val: document.getElementById('k0Val'),
  k1Group: document.getElementById('k1Group'),
  k1Slider: document.getElementById('k1Slider'),
  k1Val: document.getElementById('k1Val'),
  ampSlider: document.getElementById('ampSlider'),
  ampVal: document.getElementById('ampVal'),
  n0Group: document.getElementById('n0Group'),
  n0Slider: document.getElementById('n0Slider'),
  n0Val: document.getElementById('n0Val'),
  freehandControls: document.getElementById('freehandControls'),
  drawClear: document.getElementById('drawClear'),
  drawSmooth: document.getElementById('drawSmooth'),
  drawNormalize: document.getElementById('drawNormalize'),
  NSlider: document.getElementById('NSlider'),
  NVal: document.getElementById('NVal'),
  NzpSlider: document.getElementById('NzpSlider'),
  NzpVal: document.getElementById('NzpVal'),
  windowType: document.getElementById('windowType'),
  MSlider: document.getElementById('MSlider'),
  MVal: document.getElementById('MVal'),
  dtftOverlay: document.getElementById('dtftOverlay'),
  twoSided: document.getElementById('twoSided'),
  specMode: document.getElementById('specMode'),
  xAxisMode: document.getElementById('xAxisMode'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  canvasHeight: document.getElementById('canvasHeight'),
  canvasHeightVal: document.getElementById('canvasHeightVal'),
  dotSize: document.getElementById('dotSize'),
  dotSizeVal: document.getElementById('dotSizeVal'),
  NRO: document.getElementById('NRO'),
  NzpRO: document.getElementById('NzpRO'),
  binRO: document.getElementById('binRO'),
  rmseRO: document.getElementById('rmseRO'),
  fftBadge: document.getElementById('fftBadge'),
  dftBadge: document.getElementById('dftBadge'),
  speedup: document.getElementById('speedup'),
  benchBtn: document.getElementById('benchBtn'),
  benchN: document.getElementById('benchN'),
  xnHint: document.getElementById('xnHint'),
};

// ── Durum ──
let signalType = 'cosine';
let k0 = 4, k1 = 10, amp = 1, n0 = 8;
let N = 32, Nzp = 32, M = 16;
let windowType = 'rect';
let dtftOverlay = true, twoSided = false;
let specMode = 'linear';
let xAxisMode = 'bin';
let gridAlpha = 0.16;
let dotR = 3.0;
let markerBin = -1;

let drawn = new Float64Array(N);
let drawing = false, prevIdx = -1, prevAmp = 0;
let noiseSeed = new Float64Array(0);

// ============================================
// SİNYAL ÜRETİCİ
// ============================================
function makeSignal() {
  if (signalType === 'freehand') {
    if (drawn.length !== N) {
      const r = new Float64Array(N);
      const ratio = drawn.length / N;
      for (let i = 0; i < N; i++) {
        const j = Math.floor(i * ratio);
        r[i] = drawn[Math.min(j, drawn.length - 1)] || 0;
      }
      drawn = r;
    }
    return drawn.slice();
  }
  if (signalType === 'noise') {
    if (noiseSeed.length !== N) {
      noiseSeed = new Float64Array(N);
      for (let i = 0; i < N; i++) noiseSeed[i] = (Math.random() * 2 - 1);
    }
    const out = new Float64Array(N);
    for (let i = 0; i < N; i++) out[i] = amp * noiseSeed[i];
    return out;
  }
  const x = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let v = 0;
    switch (signalType) {
      case 'cosine':    v = amp * Math.cos(TWO_PI * k0 * n / N); break;
      case 'sumcos':    v = amp * (Math.cos(TWO_PI * k0 * n / N) + 0.6 * Math.cos(TWO_PI * k1 * n / N)); break;
      case 'cosNonInt': v = amp * Math.cos(TWO_PI * (k0 + 0.5) * n / N); break;
      case 'chirp': {
        const k0c = k0;
        const k1c = Math.max(k0 + 1, k1);
        const kInst = k0c + (k1c - k0c) * (n / N) * 0.5;
        v = amp * Math.cos(TWO_PI * kInst * n / N);
        break;
      }
      case 'rect':      v = (n >= Math.max(0, n0 - 4) && n <= Math.min(N - 1, n0 + 4)) ? amp : 0; break;
      case 'delta':     v = (n === Math.round(n0)) ? amp : 0; break;
      case 'gauss': {
        const sigma = Math.max(2, N / 12);
        v = amp * Math.exp(-((n - n0) ** 2) / (2 * sigma * sigma));
        break;
      }
    }
    x[n] = v;
  }
  return x;
}

// ============================================
// PENCERE FONKSİYONLARI
// ============================================
function makeWindow(len) {
  const w = new Float64Array(len);
  for (let n = 0; n < len; n++) {
    const t = n / (len - 1);
    let v = 1;
    switch (windowType) {
      case 'rect':     v = 1; break;
      case 'hann':     v = 0.5 * (1 - Math.cos(TWO_PI * t)); break;
      case 'hamming':  v = 0.54 - 0.46 * Math.cos(TWO_PI * t); break;
      case 'blackman': v = 0.42 - 0.5 * Math.cos(TWO_PI * t) + 0.08 * Math.cos(2 * TWO_PI * t); break;
      case 'flattop':  v = 0.21557895 - 0.41663158*Math.cos(TWO_PI*t) + 0.277263158*Math.cos(2*TWO_PI*t)
                          - 0.083578947*Math.cos(3*TWO_PI*t) + 0.006947368*Math.cos(4*TWO_PI*t); break;
    }
    w[n] = v;
  }
  return w;
}

// ============================================
// FFT (Radix-2 Cooley-Tukey)
// ============================================
function fft(re, im, n, inverse) {
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
    let k = n >> 1;
    while (k <= j) { j -= k; k >>= 1; }
    j += k;
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (inverse ? 2 : -2) * PI / len;
    const wRe0 = Math.cos(ang), wIm0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      for (let kk = 0; kk < half; kk++) {
        const a = i + kk, b = a + half;
        const tRe = wRe * re[b] - wIm * im[b];
        const tIm = wRe * im[b] + wIm * re[b];
        re[b] = re[a] - tRe; im[b] = im[a] - tIm;
        re[a] += tRe; im[a] += tIm;
        const tw = wRe * wRe0 - wIm * wIm0;
        wIm = wRe * wIm0 + wIm * wRe0; wRe = tw;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function nextPow2(v) { let p = 1; while (p < v) p <<= 1; return p; }

// Doğrudan DFT (O(N²))
function directDFT(re, im, n) {
  const Re = new Float64Array(n), Im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0, si = 0;
    for (let nn = 0; nn < n; nn++) {
      const ang = -TWO_PI * k * nn / n;
      const c = Math.cos(ang), s = Math.sin(ang);
      sr += re[nn] * c - im[nn] * s;
      si += re[nn] * s + im[nn] * c;
    }
    Re[k] = sr; Im[k] = si;
  }
  return { Re, Im };
}

// ============================================
// DTFT (sürekli) — pencerelenmiş x üzerinden, üst-örneklenmiş ω ile
// ============================================
function computeDTFTCurve(xWin, nOmega) {
  const re = new Float64Array(nOmega);
  const im = new Float64Array(nOmega);
  const mag = new Float64Array(nOmega);
  // ω ∈ [0, 2π) (tek yanlı), veya [-π, π] (twoSided)
  for (let k = 0; k < nOmega; k++) {
    const w = twoSided
      ? (-PI + (TWO_PI * k / nOmega))
      : (TWO_PI * k / nOmega);
    let r = 0, i = 0;
    for (let nn = 0; nn < xWin.length; nn++) {
      const a = -w * nn;
      r += xWin[nn] * Math.cos(a);
      i += xWin[nn] * Math.sin(a);
    }
    re[k] = r; im[k] = i;
    mag[k] = Math.sqrt(r * r + i * i);
  }
  return { re, im, mag };
}

// ============================================
// ÇİZİM YARDIMCILARI
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

function yBounds(arr) {
  let mn = 0, mx = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < mn) mn = arr[i];
    if (arr[i] > mx) mx = arr[i];
  }
  if (mn === mx) { mn = -1; mx = 1; }
  const r = mx - mn;
  return { mn: mn - r * 0.12, mx: mx + r * 0.12 };
}

function drawGrid(ctx, w, h, xMin, xMax, yMin, yMax) {
  ctx.strokeStyle = `rgba(100,160,255,${gridAlpha})`;
  ctx.lineWidth = 0.7;
  const xR = xMax - xMin || 1;
  let step = xR / 16;
  const m = Math.pow(10, Math.floor(Math.log10(step)));
  step = Math.ceil(step / m) * m;
  for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) {
    const x = ((v - xMin) / xR) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  const yR = yMax - yMin || 1;
  let yStep = yR / 8;
  const ym = Math.pow(10, Math.floor(Math.log10(yStep)));
  yStep = Math.ceil(yStep / ym) * ym;
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const y = h - ((v - yMin) / yR) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawAxes(ctx, w, h, xMin, xMax, yMin, yMax, xLabelFn) {
  ctx.strokeStyle = 'rgba(100,140,255,0.32)';
  ctx.lineWidth = 1.2;
  if (yMin <= 0 && yMax >= 0) {
    const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(w, y0); ctx.stroke();
  }
  if (xMin <= 0 && xMax >= 0) {
    const x0 = ((0 - xMin) / (xMax - xMin)) * w;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(180,190,220,0.62)';
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'center';
  const y0px = (yMin <= 0 && yMax >= 0) ? h - ((0 - yMin) / (yMax - yMin)) * h : h - 10;
  if (xLabelFn) xLabelFn(ctx, w, h, xMin, xMax, y0px);
}

function xLabelsN(ctx, w, h, xMin, xMax, y0px) {
  const xR = xMax - xMin;
  let step = Math.max(1, Math.ceil(xR / 14));
  for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) {
    const x = ((v - xMin) / xR) * w;
    ctx.fillText(v.toString(), x, Math.min(y0px + 13, h - 2));
  }
}

function drawStem(ctx, w, h, xMin, xMax, yMin, yMax, xArr, vArr, color, hl) {
  const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
  for (let i = 0; i < xArr.length; i++) {
    const v = vArr[i];
    const x = ((xArr[i] - xMin) / (xMax - xMin)) * w;
    if (x < -3 || x > w + 3) continue;
    const y = h - ((v - yMin) / (yMax - yMin)) * h;
    const isHL = hl ? hl(i) : false;
    ctx.strokeStyle = isHL ? '#ff4f9a' : color;
    ctx.fillStyle = isHL ? '#ff4f9a' : color;
    ctx.lineWidth = isHL ? 2.4 : 1.6;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, isHL ? dotR + 1.6 : dotR, 0, TWO_PI); ctx.fill();
  }
}

function drawLine(ctx, w, h, xMin, xMax, yMin, yMax, xArr, yArr, color, lw, alpha) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 1.5;
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < xArr.length; i++) {
    const x = ((xArr[i] - xMin) / (xMax - xMin)) * w;
    const y = h - ((yArr[i] - yMin) / (yMax - yMin)) * h;
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ============================================
// RENDER
// ============================================
let cachedX = null;     // x[n]
let cachedW = null;     // pencere
let cachedXw = null;    // x*w
let cachedXk = null;    // DFT/FFT (Re, Im)
let cachedDTFT = null;  // sürekli DTFT eğrisi
let lastFFTtime = 0, lastDFTtime = 0;

function recomputeAll() {
  cachedX = makeSignal();
  cachedW = makeWindow(N);
  cachedXw = new Float64Array(N);
  for (let i = 0; i < N; i++) cachedXw[i] = cachedX[i] * cachedW[i];

  // Zero-pad
  const Nfft = Math.max(Nzp, N);
  const Npow = nextPow2(Nfft);
  const re = new Float64Array(Npow), im = new Float64Array(Npow);
  for (let i = 0; i < N; i++) re[i] = cachedXw[i];

  // FFT timing
  const t1 = performance.now();
  fft(re, im, Npow, false);
  lastFFTtime = performance.now() - t1;

  // İlk Nfft bin kullanılır (Npow >= Nfft)
  cachedXk = { Re: re.slice(0, Npow), Im: im.slice(0, Npow), Npow };

  // DTFT eğrisi (üst-örnekli)
  if (dtftOverlay) {
    cachedDTFT = computeDTFTCurve(cachedXw, 1024);
  }
}

function quickDFTTime() {
  // Sadece UI'da göstermek için: 1 örnek doğrudan DFT zamanı
  const Nm = Math.min(N, 256);
  const re = new Float64Array(Nm), im = new Float64Array(Nm);
  for (let i = 0; i < Nm; i++) re[i] = cachedXw[i] || 0;
  const t1 = performance.now();
  directDFT(re, im, Nm);
  lastDFTtime = performance.now() - t1;
  // ölçeklendir: N²/Nm² oranıyla N için tahmin
  if (Nm < N) lastDFTtime = lastDFTtime * (N / Nm) * (N / Nm);
}

function renderXn() {
  const s = prep(cvXn);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const xArr = []; for (let i = 0; i < N; i++) xArr.push(i);
  const b = yBounds(cachedX);
  drawGrid(s.ctx, s.w, s.h, -0.5, N - 0.5, b.mn, b.mx);
  drawAxes(s.ctx, s.w, s.h, -0.5, N - 0.5, b.mn, b.mx, xLabelsN);
  drawStem(s.ctx, s.w, s.h, -0.5, N - 0.5, b.mn, b.mx, xArr, cachedX, '#39ff85');
}

function renderWin() {
  const s = prep(cvWin);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const Nfft = Math.max(Nzp, N);
  const b = yBounds(cachedXw);
  const yMin = Math.min(b.mn, -0.1);
  const yMax = Math.max(b.mx, 1.15);
  drawGrid(s.ctx, s.w, s.h, -0.5, Nfft - 0.5, yMin, yMax);
  drawAxes(s.ctx, s.w, s.h, -0.5, Nfft - 0.5, yMin, yMax, xLabelsN);
  // Pencere (turuncu çizgi)
  const winX = [], winY = [];
  for (let i = 0; i < N; i++) { winX.push(i); winY.push(cachedW[i]); }
  drawLine(s.ctx, s.w, s.h, -0.5, Nfft - 0.5, yMin, yMax, winX, winY, '#ffd166', 1.4, 0.7);

  // Pencerelenmiş x stem
  const nA = [], nV = [];
  for (let i = 0; i < N; i++) { nA.push(i); nV.push(cachedXw[i]); }
  drawStem(s.ctx, s.w, s.h, -0.5, Nfft - 0.5, yMin, yMax, nA, nV, '#39ff85');

  // Zero-pad bölgesi gri kutu
  if (Nfft > N) {
    s.ctx.fillStyle = 'rgba(120,120,140,0.08)';
    const xL = ((N - 0.5 - (-0.5)) / Nfft) * s.w;
    s.ctx.fillRect(xL, 0, s.w - xL, s.h);
    s.ctx.fillStyle = 'rgba(140,150,180,0.5)';
    s.ctx.font = '10px Consolas, monospace';
    s.ctx.textAlign = 'center';
    s.ctx.fillText('← sıfır-doldurma →', (xL + s.w) / 2, 14);
  }
}

function specXAxis(kBin) {
  // bin indis → kullanıcı X ekseni dönüşümü
  if (xAxisMode === 'omega') return TWO_PI * kBin / cachedXk.Npow;
  if (xAxisMode === 'cps')   return kBin / cachedXk.Npow;
  return kBin;
}
function specXLabels(ctx, w, h, xMin, xMax, y0px) {
  const xR = xMax - xMin;
  if (xAxisMode === 'bin') {
    let step = Math.max(1, Math.ceil(xR / 14));
    for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) {
      const x = ((v - xMin) / xR) * w;
      ctx.fillText(v.toString(), x, Math.min(y0px + 13, h - 2));
    }
  } else if (xAxisMode === 'omega') {
    const ticks = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
    for (const tickK of ticks) {
      const v = tickK * PI;
      if (v < xMin || v > xMax) continue;
      const x = ((v - xMin) / xR) * w;
      const lab = tickK === 0 ? '0' : (tickK === 1 ? 'π' : tickK === -1 ? '−π'
                   : tickK === 0.5 ? 'π/2' : tickK === -0.5 ? '−π/2'
                   : tickK === 2 ? '2π' : `${tickK}π`);
      ctx.fillText(lab, x, Math.min(y0px + 13, h - 2));
    }
  } else {
    let step = 0.1;
    for (let v = Math.ceil(xMin / step) * step; v <= xMax + 1e-9; v += step) {
      const x = ((v - xMin) / xR) * w;
      ctx.fillText(v.toFixed(1), x, Math.min(y0px + 13, h - 2));
    }
  }
}

function renderSpec() {
  const s = prep(cvSpec);
  s.ctx.clearRect(0, 0, s.w, s.h);

  const Npow = cachedXk.Npow;
  const binArr = [], magArr = [];
  let maxMag = 0;
  // Çift yanlı modda fftshift
  if (twoSided) {
    const half = Npow / 2;
    for (let k = 0; k < Npow; k++) {
      const kSrc = (k + half) % Npow;
      const Re = cachedXk.Re[kSrc], Im = cachedXk.Im[kSrc];
      const m = Math.sqrt(Re * Re + Im * Im);
      const kBin = k - half; // -N/2 ... N/2-1
      binArr.push(specXAxis(kBin));
      magArr.push(m);
      if (m > maxMag) maxMag = m;
    }
  } else {
    for (let k = 0; k < Npow; k++) {
      const Re = cachedXk.Re[k], Im = cachedXk.Im[k];
      const m = Math.sqrt(Re * Re + Im * Im);
      binArr.push(specXAxis(k));
      magArr.push(m);
      if (m > maxMag) maxMag = m;
    }
  }
  if (maxMag < 1e-12) maxMag = 1;

  // X aralığı
  let xMin, xMax;
  if (xAxisMode === 'bin') {
    xMin = twoSided ? -Npow / 2 : 0;
    xMax = twoSided ?  Npow / 2 : Npow;
  } else if (xAxisMode === 'omega') {
    xMin = twoSided ? -PI : 0;
    xMax = twoSided ?  PI : TWO_PI;
  } else {
    xMin = twoSided ? -0.5 : 0;
    xMax = twoSided ?  0.5 : 1;
  }

  // Y aralığı
  let dispMag = magArr, yMin, yMax;
  if (specMode === 'db') {
    dispMag = magArr.map(v => v > 1e-6 ? 20 * Math.log10(v / maxMag) : -80);
    yMin = -60; yMax = 5;
  } else {
    yMin = -maxMag * 0.07; yMax = maxMag * 1.18;
  }

  drawGrid(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax);
  drawAxes(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, specXLabels);

  // DTFT arka planı
  if (dtftOverlay && cachedDTFT) {
    const Ndtft = cachedDTFT.mag.length;
    const xDT = new Float64Array(Ndtft);
    const yDT = new Float64Array(Ndtft);
    for (let i = 0; i < Ndtft; i++) {
      const w = twoSided ? (-PI + TWO_PI * i / Ndtft) : (TWO_PI * i / Ndtft);
      // ω → kBin (Npow eşdeğeri)
      const kBin = (w / TWO_PI) * Npow;
      xDT[i] = specXAxis(kBin);
      const m = cachedDTFT.mag[i];
      yDT[i] = (specMode === 'db')
        ? (m > 1e-6 ? 20 * Math.log10(m / maxMag) : -80)
        : m;
    }
    drawLine(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, xDT, yDT, '#7b8cff', 1.4, 0.55);
  }

  // DFT stem
  drawStem(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, binArr, dispMag, '#ff8c42',
    (i) => i === markerBin);

  // Marker okuma
  if (markerBin >= 0 && markerBin < binArr.length) {
    ui.binRO.textContent = `imleç bin: k=${twoSided ? markerBin - Npow / 2 : markerBin} · |X|=${magArr[markerBin].toFixed(3)}`;
  } else {
    ui.binRO.textContent = `imleç bin: k = — (spektruma tıkla)`;
  }
}

function renderIDFT() {
  const s = prep(cvIDFT);
  s.ctx.clearRect(0, 0, s.w, s.h);

  // İlk M bin ve simetrik eşi tutulup IDFT
  const Npow = cachedXk.Npow;
  const Re = new Float64Array(Npow), Im = new Float64Array(Npow);
  // M ≤ Npow/2: ilk M bin + ayna (Npow-k) → gerçek-sinyal koruma
  for (let k = 0; k < Npow; k++) {
    if (k <= M || k >= Npow - M) {
      Re[k] = cachedXk.Re[k];
      Im[k] = cachedXk.Im[k];
    }
  }
  fft(Re, Im, Npow, true);
  // İlk N örnek
  const recon = new Float64Array(N);
  for (let i = 0; i < N; i++) recon[i] = Re[i];

  // RMSE
  let rmse = 0;
  for (let i = 0; i < N; i++) rmse += (cachedX[i] - recon[i]) ** 2;
  rmse = Math.sqrt(rmse / N);
  ui.rmseRO.textContent = `RMSE = ${rmse.toFixed(4)}`;

  const xA = []; for (let i = 0; i < N; i++) xA.push(i);
  const all = new Float64Array(N * 2);
  all.set(cachedX); all.set(recon, N);
  const b = yBounds(all);
  drawGrid(s.ctx, s.w, s.h, -0.5, N - 0.5, b.mn, b.mx);
  drawAxes(s.ctx, s.w, s.h, -0.5, N - 0.5, b.mn, b.mx, xLabelsN);
  // Orijinal (açık tonda)
  drawLine(s.ctx, s.w, s.h, -0.5, N - 0.5, b.mn, b.mx, xA, cachedX, '#39ff85', 1.5, 0.35);
  // Rekonstrüksiyon stem
  drawStem(s.ctx, s.w, s.h, -0.5, N - 0.5, b.mn, b.mx, xA, recon, '#7b8cff');
}

function renderAll() {
  recomputeAll();
  renderXn();
  renderWin();
  renderSpec();
  renderIDFT();
  updateReadouts();
  // Süre ölçümü her render'da çalışmaz — yalnız "N-atış Benchmark" butonu çalıştırır.
}

function formatTime(ms) {
  if (ms < 1)   return `${(ms * 1000).toFixed(2)} µs`;
  if (ms < 100) return `${ms.toFixed(3)} ms`;
  return `${ms.toFixed(1)} ms`;
}

// Sırala, min/max düş, ortalama ± standart sapma hesapla
function trimmedStats(arr) {
  if (arr.length < 3) return { mean: 0, std: 0, n: arr.length, ok: false };
  const sorted = arr.slice().sort((a, b) => a - b);
  const sliced = sorted.slice(1, sorted.length - 1);  // min ve max'ı düş
  const n = sliced.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sliced[i];
  const mean = sum / n;
  let varAcc = 0;
  for (let i = 0; i < n; i++) varAcc += (sliced[i] - mean) ** 2;
  const std = Math.sqrt(varAcc / Math.max(1, n - 1));   // örnek standart sapma
  return { mean, std, n, ok: true };
}

// ============================================
// SPEKTRUM ÜZERİNE TIKLAMA → bin seçimi
// ============================================
function setMarkerFromMouse(e) {
  const rect = cvSpec.getBoundingClientRect();
  const px = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  const Npow = cachedXk.Npow;
  // İlgili xAxis'e göre bin
  let xMin, xMax;
  if (xAxisMode === 'bin') { xMin = twoSided ? -Npow/2 : 0; xMax = twoSided ? Npow/2 : Npow; }
  else if (xAxisMode === 'omega') { xMin = twoSided ? -PI : 0; xMax = twoSided ? PI : TWO_PI; }
  else { xMin = twoSided ? -0.5 : 0; xMax = twoSided ? 0.5 : 1; }
  const v = xMin + (px / rect.width) * (xMax - xMin);
  let kBin;
  if (xAxisMode === 'bin') kBin = Math.round(v);
  else if (xAxisMode === 'omega') kBin = Math.round(v * Npow / TWO_PI);
  else kBin = Math.round(v * Npow);
  if (twoSided) markerBin = (kBin + Npow / 2 + Npow) % Npow;
  else markerBin = ((kBin % Npow) + Npow) % Npow;
  renderSpec();
}
cvSpec.addEventListener('mousedown', setMarkerFromMouse);
let dragSpec = false;
cvSpec.addEventListener('mousedown', () => { dragSpec = true; });
window.addEventListener('mousemove', e => { if (dragSpec) setMarkerFromMouse(e); });
window.addEventListener('mouseup', () => { dragSpec = false; });

// ============================================
// FREEHAND ÇİZİM
// ============================================
function getXnPos(e) {
  const rect = cvXn.getBoundingClientRect();
  const cx = e.clientX ?? e.touches?.[0]?.clientX;
  const cy = e.clientY ?? e.touches?.[0]?.clientY;
  const xPx = cx - rect.left, yPx = cy - rect.top;
  const idx = Math.round((xPx / rect.width) * (N - 1));
  const yNorm = 1 - (yPx / rect.height);
  const a = (yNorm - 0.5) * 3;
  return { idx, amp: a };
}
function fhPlot(idx, ampV) {
  if (drawn.length !== N) drawn = new Float64Array(N);
  if (prevIdx < 0 || prevIdx === idx) {
    if (idx >= 0 && idx < N) drawn[idx] = ampV;
  } else {
    const s = Math.min(prevIdx, idx), e = Math.max(prevIdx, idx);
    const a0 = prevIdx < idx ? prevAmp : ampV, a1 = prevIdx < idx ? ampV : prevAmp;
    const span = e - s;
    for (let i = s; i <= e; i++) {
      if (i < 0 || i >= N) continue;
      const t = span === 0 ? 0 : (i - s) / span;
      drawn[i] = a0 + (a1 - a0) * t;
    }
  }
  prevIdx = idx; prevAmp = ampV;
}
cvXn.addEventListener('mousedown', e => {
  if (signalType !== 'freehand') return;
  drawing = true; prevIdx = -1;
  const p = getXnPos(e); fhPlot(p.idx, p.amp);
  renderAll(); e.preventDefault();
});
cvXn.addEventListener('mousemove', e => {
  if (!drawing || signalType !== 'freehand') return;
  const p = getXnPos(e); fhPlot(p.idx, p.amp);
  renderAll();
});
window.addEventListener('mouseup', () => { drawing = false; prevIdx = -1; });

ui.drawClear.addEventListener('click', () => {
  drawn = new Float64Array(N); renderAll();
});
ui.drawSmooth.addEventListener('click', () => {
  const s = new Float64Array(N);
  for (let i = 1; i < N - 1; i++) s[i] = (drawn[i-1] + drawn[i] + drawn[i+1]) / 3;
  s[0] = drawn[0]; s[N-1] = drawn[N-1];
  drawn = s; renderAll();
});
ui.drawNormalize.addEventListener('click', () => {
  let mx = 0;
  for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(drawn[i]));
  if (mx > 0) for (let i = 0; i < N; i++) drawn[i] /= mx;
  renderAll();
});

// ============================================
// UI
// ============================================
function updateVisibility() {
  const isFree = signalType === 'freehand';
  ui.freehandControls.style.display = isFree ? 'flex' : 'none';
  cvXn.classList.toggle('draw-active', isFree);
  cvXn.classList.toggle('freehand-active', isFree);
  ui.k1Group.style.display = (signalType === 'sumcos' || signalType === 'chirp') ? 'block' : 'none';
  ui.n0Group.style.display = (['rect','delta','gauss'].includes(signalType)) ? 'block' : 'none';
}

function updateReadouts() {
  ui.k0Val.textContent = k0.toFixed(2);
  ui.k1Val.textContent = k1.toFixed(2);
  ui.ampVal.textContent = amp.toFixed(2);
  ui.n0Val.textContent = n0;
  ui.NVal.textContent = N;
  ui.NzpVal.textContent = Nzp;
  ui.MVal.textContent = M;
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);
  ui.dotSizeVal.textContent = dotR.toFixed(1);
  ui.canvasHeightVal.textContent = ui.canvasHeight.value;
  ui.NRO.textContent = `N = ${N}`;
  ui.NzpRO.textContent = `N_fft = ${Math.max(Nzp, N)} → ${nextPow2(Math.max(Nzp, N))}`;
  ui.xnHint.textContent = signalType === 'freehand' ? '✏️ fare ile çizim' : 'önset · işaret tipi seçili';
  // M üst sınırı Npow/2
  const Npow = nextPow2(Math.max(Nzp, N));
  ui.MSlider.max = Math.floor(Npow / 2);
}

function onSignalChange() {
  signalType = ui.signalType.value;
  k0 = parseFloat(ui.k0Slider.value);
  k1 = parseFloat(ui.k1Slider.value);
  amp = parseFloat(ui.ampSlider.value);
  n0 = parseInt(ui.n0Slider.value);
  // noise yeniden başlatma
  if (signalType !== 'noise') noiseSeed = new Float64Array(0);
  updateVisibility();
  renderAll();
}
function onDFTChange() {
  const oldN = N;
  N = parseInt(ui.NSlider.value);
  // Nzp: kullanıcı seçimi (2'nin kuvveti), ama mutlaka N'den büyük olmalı
  let selectedNzp = parseInt(ui.NzpSlider.value);
  Nzp = Math.max(selectedNzp, N);
  // 2'nin kuvvetine yuvarla (yukarı)
  Nzp = nextPow2(Nzp);
  // Eğer hesaplanan Nzp seçili değerden farklıysa, select'i güncelle
  if (selectedNzp < Nzp && ui.NzpSlider.tagName === 'SELECT') {
    const opts = Array.from(ui.NzpSlider.options).map(o => parseInt(o.value));
    const target = opts.find(v => v >= Nzp) || opts[opts.length - 1];
    ui.NzpSlider.value = target;
    Nzp = target;
  }
  windowType = ui.windowType.value;
  M = parseInt(ui.MSlider.value);
  if (N !== oldN) {
    // boyut değişti → drawn/noise reset
    if (drawn.length !== N) {
      const r = new Float64Array(N);
      const ratio = drawn.length / N;
      for (let i = 0; i < N; i++) {
        const j = Math.floor(i * ratio);
        r[i] = drawn[Math.min(j, drawn.length - 1)] || 0;
      }
      drawn = r;
    }
    noiseSeed = new Float64Array(0);
    ui.n0Slider.max = N - 1;
    if (n0 >= N) { n0 = Math.floor(N / 2); ui.n0Slider.value = n0; }
    ui.k0Slider.max = Math.max(N - 1, 1);
    ui.k1Slider.max = Math.max(N - 1, 1);
    if (k0 > N - 1) { k0 = Math.min(k0, N - 1); ui.k0Slider.value = k0; }
    if (k1 > N - 1) { k1 = Math.min(k1, N - 1); ui.k1Slider.value = k1; }
  }
  renderAll();
}
function onDisplayChange() {
  dtftOverlay = ui.dtftOverlay.checked;
  twoSided = ui.twoSided.checked;
  specMode = ui.specMode.value;
  xAxisMode = ui.xAxisMode.value;
  gridAlpha = parseFloat(ui.gridAlpha.value);
  dotR = parseFloat(ui.dotSize.value);
  renderAll();
}

ui.signalType.addEventListener('change', onSignalChange);
[ui.k0Slider, ui.k1Slider, ui.ampSlider, ui.n0Slider].forEach(el => el.addEventListener('input', onSignalChange));
[ui.NSlider, ui.NzpSlider, ui.windowType, ui.MSlider].forEach(el => {
  el.addEventListener('input', onDFTChange);
  el.addEventListener('change', onDFTChange);
});
[ui.dtftOverlay, ui.twoSided, ui.specMode, ui.xAxisMode, ui.gridAlpha, ui.dotSize].forEach(el => {
  el.addEventListener('input', onDisplayChange);
  el.addEventListener('change', onDisplayChange);
});

ui.canvasHeight.addEventListener('input', () => {
  const h = parseInt(ui.canvasHeight.value);
  ui.canvasHeightVal.textContent = h;
  document.querySelectorAll('.dft-grid canvas').forEach(c => c.style.height = h + 'px');
  renderAll();
});

// N-atış benchmark:
//   - Önce Niter DFT, sonra Niter FFT çalıştırır
//   - Süreler sıralanır, en yüksek ve en düşük düşürülür
//   - Kalan (Niter-2) değer üzerinden ortalama ± standart sapma
//   - Yalnız butona tıklayınca çalışır.
ui.benchBtn.addEventListener('click', () => {
  const Niter = Math.max(3, Math.min(500, parseInt(ui.benchN.value) || 10));
  const Nb = N;
  const Npow = nextPow2(Nb);

  // Sinyal verisi snapshotu
  const sig = new Float64Array(Nb);
  for (let i = 0; i < Nb; i++) sig[i] = cachedXw[i] || 0;

  // Buton görsel olarak "çalışıyor" durumuna geç
  ui.benchBtn.disabled = true;
  ui.benchBtn.textContent = `⏳ çalışıyor (${Niter}×) ...`;
  ui.fftBadge.textContent = 'FFT: ...';
  ui.dftBadge.textContent = 'DFT: ...';

  // requestAnimationFrame ile DOM güncellemesinden sonra çalıştır
  requestAnimationFrame(() => {
    // ─── Doğrudan DFT: Niter adet ölçüm ───
    const dftTimes = new Array(Niter);
    for (let i = 0; i < Niter; i++) {
      const re = new Float64Array(Nb), im = new Float64Array(Nb);
      for (let j = 0; j < Nb; j++) re[j] = sig[j];
      const t0 = performance.now();
      directDFT(re, im, Nb);
      const t1 = performance.now();
      dftTimes[i] = t1 - t0;
    }
    // ─── FFT: Niter adet ölçüm ───
    const fftTimes = new Array(Niter);
    for (let i = 0; i < Niter; i++) {
      const re = new Float64Array(Npow), im = new Float64Array(Npow);
      for (let j = 0; j < Nb; j++) re[j] = sig[j];
      const t0 = performance.now();
      fft(re, im, Npow, false);
      const t1 = performance.now();
      fftTimes[i] = t1 - t0;
    }

    // İstatistikler: min ve max düşürülüp ortalama ± std
    const dftS = trimmedStats(dftTimes);
    const fftS = trimmedStats(fftTimes);

    ui.dftBadge.textContent = dftS.ok
      ? `DFT μ±σ: ${formatTime(dftS.mean)} ± ${formatTime(dftS.std)}  (n=${dftS.n} / ${Niter})`
      : _t({tr: 'DFT: ölçüm yetersiz', en: 'DFT: insufficient samples'});
    ui.fftBadge.textContent = fftS.ok
      ? `FFT μ±σ: ${formatTime(fftS.mean)} ± ${formatTime(fftS.std)}  (n=${fftS.n} / ${Niter})`
      : _t({tr: 'FFT: ölçüm yetersiz', en: 'FFT: insufficient samples'});
    const sp = (dftS.ok && fftS.ok && fftS.mean > 1e-9)
      ? (dftS.mean / fftS.mean).toFixed(1)
      : '—';
    ui.speedup.textContent = `${sp} ×`;

    ui.benchBtn.disabled = false;
    ui.benchBtn.textContent = '🏃 N-atış Benchmark';
  });
});

window.addEventListener('resize', renderAll);

// ============================================
// ARKAPLAN
// ============================================
function initBg() {
  const c = document.getElementById('bgCanvas');
  const ctx = c.getContext('2d');
  function rs() { c.width = innerWidth; c.height = innerHeight; }
  rs(); window.addEventListener('resize', rs);
  const pts = [];
  for (let i = 0; i < 60; i++) pts.push({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.3,
    dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.08,
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
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(lp);
  })();
}

initBg();
updateVisibility();
renderAll();
