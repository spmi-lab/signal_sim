/* ============================================
   ÖRNEKLEME TEOREMİ
   Zamanda Δ ile çarpma == Frekansta Δ ile konvolüsyon
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
const PI = Math.PI;
const TWO_PI = 2 * PI;

// ── Canvas ──
const cvX  = document.getElementById('cvX');
const cvP  = document.getElementById('cvP');
const cvXs = document.getElementById('cvXs');
const cvXf = document.getElementById('cvXf');
const cvPf = document.getElementById('cvPf');
const cvXsf= document.getElementById('cvXsf');

// ── UI ──
const ui = {
  signalType: document.getElementById('signalType'),
  f0Slider: document.getElementById('f0Slider'),
  f0Val: document.getElementById('f0Val'),
  f1Group: document.getElementById('f1Group'),
  f1Slider: document.getElementById('f1Slider'),
  f1Val: document.getElementById('f1Val'),
  ampSlider: document.getElementById('ampSlider'),
  ampVal: document.getElementById('ampVal'),
  widthGroup: document.getElementById('widthGroup'),
  widthSlider: document.getElementById('widthSlider'),
  widthVal: document.getElementById('widthVal'),
  dtSlider: document.getElementById('dtSlider'),
  dtSlid: document.getElementById('dtSlid'),
  NSlider: document.getElementById('NSlider'),
  NVal: document.getElementById('NVal'),
  TsSlider: document.getElementById('TsSlider'),
  TsVal: document.getElementById('TsVal'),
  FsSlider: document.getElementById('FsSlider'),
  FsVal: document.getElementById('FsVal'),
  copySlider: document.getElementById('copySlider'),
  copyVal: document.getElementById('copyVal'),
  reconToggle: document.getElementById('reconToggle'),
  FmaxSlider: document.getElementById('FmaxSlider'),
  FmaxVal: document.getElementById('FmaxVal'),
  specMode: document.getElementById('specMode'),
  windowFn: document.getElementById('windowFn'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  canvasHeight: document.getElementById('canvasHeight'),
  canvasHeightVal: document.getElementById('canvasHeightVal'),
  aliasHL: document.getElementById('aliasHL'),
  drawClear: document.getElementById('drawClear'),
  drawSmooth: document.getElementById('drawSmooth'),
  drawNormalize: document.getElementById('drawNormalize'),
  freehandControls: document.getElementById('freehandControls'),
  modeBadge: document.getElementById('modeBadge'),
  dtRO: document.getElementById('dtRO'),
  fsRO: document.getElementById('fsRO'),
  readoutT: document.getElementById('readoutT'),
  readoutTs: document.getElementById('readoutTs'),
  readoutN: document.getElementById('readoutN'),
  readoutB: document.getElementById('readoutB'),
  readoutAlias: document.getElementById('readoutAlias'),
  aliasFlag: document.getElementById('aliasFlag'),
  drawHintX: document.getElementById('drawHintX'),
};

// ── Durum ──
let signalType = 'cosine';
let f0 = 5, f1 = 17, amp = 1, width = 0.2;
let dt = 0.001;          // s
let N  = 1024;
let Ts = 0.04;           // s
let copyCount = 3;
let Fmax = 200;
let gridAlpha = 0.16;
let specMode = 'linear';
let aliasHL = true;
let recon = true;
let lastEdit = 'Ts';     // 'Ts' veya 'Fs' (slider çakışmasını yönet)

// freehand verisi
let drawnSignal = new Float64Array(N);
let drawing = false, prevIdx = -1, prevAmp = 0;

// Pre-allocated tabanı her renderda yeniden hesapla:
let xFine = new Float64Array(N);
let pulses = [];     // örnek indeksleri (xFine içinde)
let Xmag = null;     // spectrum magnitude (ince işaretin sürekli zaman Fourier'i)
let Faxis = null;    // frekans ekseni (Hz)
let Nfft = 2048;

// ============================================
// SİNYAL ÜRETİCİ
// ============================================
function buildFineSignal() {
  // x(t), t = 0..N*dt, indis i ↦ t = i*dt
  if (signalType === 'freehand') {
    // mevcut çizim verisini geri ver
    if (drawnSignal.length !== N) {
      // boyut değiştiyse yeniden boyutlandır
      const newArr = new Float64Array(N);
      const ratio = drawnSignal.length / N;
      for (let i = 0; i < N; i++) {
        const j = Math.floor(i * ratio);
        newArr[i] = drawnSignal[Math.min(j, drawnSignal.length - 1)];
      }
      drawnSignal = newArr;
    }
    return drawnSignal.slice();
  }

  const x = new Float64Array(N);
  const T = N * dt;
  const tc = T / 2;
  for (let i = 0; i < N; i++) {
    const t = i * dt;
    const dtc = t - tc;
    let v = 0;
    switch (signalType) {
      case 'cosine':  v = amp * Math.cos(TWO_PI * f0 * t); break;
      case 'sine':    v = amp * Math.sin(TWO_PI * f0 * t); break;
      case 'sumcos':  v = amp * (Math.cos(TWO_PI*f0*t) + 0.6 * Math.cos(TWO_PI*f1*t)); break;
      case 'chirp': {
        // f(t): f0 → f0 + (f1-f0) * t/T
        const f0c = f0;
        const f1c = Math.max(f0 + 1, f1);
        const fInst = f0c + (f1c - f0c) * (t / Math.max(T, 1e-9)) * 0.5;
        v = amp * Math.cos(TWO_PI * fInst * t);
        break;
      }
      case 'gauss': {
        const sigma = Math.max(width, 1e-4);
        v = amp * Math.exp(-(dtc * dtc) / (2 * sigma * sigma));
        break;
      }
      case 'sinc': {
        // bant-sınırlı sinc, kesim frekansı: f0
        const arg = TWO_PI * f0 * dtc;
        v = (Math.abs(arg) < 1e-9) ? amp : amp * Math.sin(arg) / arg;
        break;
      }
      case 'rect': {
        v = (Math.abs(dtc) < width / 2) ? amp : 0;
        break;
      }
      case 'damped': {
        if (t < tc) { v = 0; }
        else {
          const tau = Math.max(width, 1e-4);
          v = amp * Math.exp(-(t - tc) / tau) * Math.cos(TWO_PI * f0 * (t - tc));
        }
        break;
      }
    }
    x[i] = v;
  }
  return x;
}

// ============================================
// ÖRNEKLEME İNDEKSLERİ
// ============================================
function computeSampleIdx() {
  // Ts'nin dt'nin tam katına en yakın hâli — örnek noktaları ince ızgaranın bir altkümesi
  const step = Math.max(1, Math.round(Ts / dt));
  const arr = [];
  for (let i = 0; i < N; i += step) arr.push(i);
  return arr;
}

// ============================================
// FFT (basic-signals/fourier ile aynı stil)
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
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
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

// ============================================
// PENCERE FONKSİYONLARI (FFT öncesi sızıntı bastırma)
// Her pencere, koherent kazanç (DC summ) ile normalize edilir → ölçek korunur
// ============================================
function buildWindow(name, N) {
  const w = new Float64Array(N);
  switch (name) {
    case 'hann': {
      for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
      break;
    }
    case 'hamming': {
      for (let n = 0; n < N; n++) w[n] = 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (N - 1));
      break;
    }
    case 'blackman': {
      for (let n = 0; n < N; n++) {
        const a = 2 * Math.PI * n / (N - 1);
        w[n] = 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
      }
      break;
    }
    case 'tukey': {
      // α = 0.5 — kenarlardaki %25'er bölüm konuslandırılır, orta düz
      const alpha = 0.5;
      const M = N - 1;
      for (let n = 0; n < N; n++) {
        if (n < alpha * M / 2) {
          w[n] = 0.5 * (1 + Math.cos(Math.PI * (2 * n / (alpha * M) - 1)));
        } else if (n > M * (1 - alpha / 2)) {
          w[n] = 0.5 * (1 + Math.cos(Math.PI * (2 * n / (alpha * M) - 2 / alpha + 1)));
        } else {
          w[n] = 1;
        }
      }
      break;
    }
    case 'rect':
    default: {
      for (let n = 0; n < N; n++) w[n] = 1;
    }
  }
  // Koherent kazançla normalize et: Σw/N = 1 olsun → DC genliği pencere türünden bağımsız
  let s = 0;
  for (let n = 0; n < N; n++) s += w[n];
  const g = s / N;
  if (g > 1e-9) for (let n = 0; n < N; n++) w[n] /= g;
  return w;
}

// ============================================
// SPECTRUM (sürekli yaklaşım: dt ile ölçeklenmiş DFT)
// X(F) ≈ dt * Σ x[n] e^{-j 2π F n dt}
// FFT bin frekansı F_k = k / (Nfft*dt)
// ============================================
function computeSpectrum(x) {
  Nfft = nextPow2(Math.max(2048, x.length * 2));
  const re = new Float64Array(Nfft);
  const im = new Float64Array(Nfft);
  // FFT öncesi pencere uygula (sadece sinyal uzunluğunda)
  const winName = (document.getElementById('windowFn') || {}).value || 'rect';
  const w = buildWindow(winName, x.length);
  for (let i = 0; i < x.length; i++) re[i] = x[i] * w[i];
  fft(re, im, Nfft, false);
  const mag = new Float64Array(Nfft);
  for (let i = 0; i < Nfft; i++) {
    mag[i] = dt * Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  // fftshift: pozitif/negatif freqs sıralı dizilsin
  const half = Nfft / 2;
  const shifted = new Float64Array(Nfft);
  const fAxis = new Float64Array(Nfft);
  const Ffine = 1 / dt; // Hz
  for (let k = 0; k < Nfft; k++) {
    let kShift = k - half;
    let srcIdx = (kShift + Nfft) % Nfft;
    shifted[k] = mag[srcIdx];
    fAxis[k] = kShift * (Ffine / Nfft);
  }
  return { mag: shifted, fAxis, Ffine };
}

// ============================================
// SİNC REKONSTRÜKSİYON
// y(t) = Σ x[nTs] sinc((t-nTs)/Ts)
// ============================================
function reconstruct(xFine, indices) {
  const out = new Float64Array(N);
  // sample değerleri
  const sVals = new Float64Array(indices.length);
  for (let i = 0; i < indices.length; i++) sVals[i] = xFine[indices[i]];
  for (let i = 0; i < N; i++) {
    const t = i * dt;
    let s = 0;
    for (let k = 0; k < indices.length; k++) {
      const tk = indices[k] * dt;
      const arg = PI * (t - tk) / Ts;
      const sincVal = Math.abs(arg) < 1e-9 ? 1 : Math.sin(arg) / arg;
      s += sVals[k] * sincVal;
    }
    out[i] = s;
  }
  return out;
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
  return { mn: mn - r * 0.1, mx: mx + r * 0.1 };
}

function drawGrid(ctx, w, h, xMin, xMax, yMin, yMax) {
  ctx.strokeStyle = `rgba(100,160,255,${gridAlpha})`;
  ctx.lineWidth = 0.7;
  const xR = xMax - xMin || 1;
  let step = xR / 18;
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  step = Math.ceil(step / mag) * mag;
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

function drawAxes(ctx, w, h, xMin, xMax, yMin, yMax, xUnit) {
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
  ctx.fillStyle = 'rgba(180,190,220,0.6)';
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'center';
  const xR = xMax - xMin || 1;
  let step = xR / 10;
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  step = Math.ceil(step / mag) * mag;
  const y0px = (yMin <= 0 && yMax >= 0) ? h - ((0 - yMin) / (yMax - yMin)) * h : h - 10;
  for (let v = Math.ceil(xMin / step) * step; v <= xMax + 1e-9; v += step) {
    const x = ((v - xMin) / xR) * w;
    let label;
    if (Math.abs(v) < 1e-9) label = '0';
    else if (Math.abs(v) >= 100) label = v.toFixed(0);
    else if (Math.abs(v) >= 1)  label = v.toFixed(1);
    else label = v.toFixed(2);
    ctx.fillText(label + (xUnit || ''), x, Math.min(y0px + 13, h - 2));
  }
}

function drawLine(ctx, w, h, xMin, xMax, yMin, yMax, arr, xArr, color, lw, alpha) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 1.8;
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.beginPath();
  for (let i = 0; i < arr.length; i++) {
    const x = ((xArr[i] - xMin) / (xMax - xMin)) * w;
    const y = h - ((arr[i] - yMin) / (yMax - yMin)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawStems(ctx, w, h, xMin, xMax, yMin, yMax, xs, ys, color, dotR, lw) {
  const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw || 1.6;
  for (let i = 0; i < xs.length; i++) {
    const x = ((xs[i] - xMin) / (xMax - xMin)) * w;
    if (x < -2 || x > w + 2) continue;
    const y = h - ((ys[i] - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, dotR || 2.8, 0, TWO_PI); ctx.fill();
    // Üçgen başlı ok (Δ vurgusu)
  }
}

function drawDeltaArrows(ctx, w, h, xMin, xMax, yMin, yMax, xs, color) {
  const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
  const yTop = h - ((1 - yMin) / (yMax - yMin)) * h;
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < xs.length; i++) {
    const x = ((xs[i] - xMin) / (xMax - xMin)) * w;
    if (x < -2 || x > w + 2) continue;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, yTop); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, yTop - 5);
    ctx.lineTo(x - 4, yTop + 3);
    ctx.lineTo(x + 4, yTop + 3);
    ctx.closePath(); ctx.fill();
  }
}

// ============================================
// RENDER
// ============================================
let cachedSpec = null;

function recomputeAll() {
  xFine = buildFineSignal();
  pulses = computeSampleIdx();
  cachedSpec = computeSpectrum(xFine);
}

function renderTimeRow() {
  // ─── 1) x(t) ───
  const s1 = prep(cvX);
  s1.ctx.clearRect(0, 0, s1.w, s1.h);
  const T = N * dt;
  const tArr = new Float64Array(N);
  for (let i = 0; i < N; i++) tArr[i] = i * dt;
  const bx = yBounds(xFine);
  drawGrid(s1.ctx, s1.w, s1.h, 0, T, bx.mn, bx.mx);
  drawAxes(s1.ctx, s1.w, s1.h, 0, T, bx.mn, bx.mx, ' s');
  drawLine(s1.ctx, s1.w, s1.h, 0, T, bx.mn, bx.mx, xFine, tArr, '#39ff85', 1.8);

  // ─── 2) p(t) Δ dizisi ───
  const s2 = prep(cvP);
  s2.ctx.clearRect(0, 0, s2.w, s2.h);
  drawGrid(s2.ctx, s2.w, s2.h, 0, T, -0.3, 1.2);
  drawAxes(s2.ctx, s2.w, s2.h, 0, T, -0.3, 1.2, ' s');
  const px = pulses.map(i => i * dt);
  drawDeltaArrows(s2.ctx, s2.w, s2.h, 0, T, -0.3, 1.2, px, '#ff8c42');

  // ─── 3) x_s(t) ───
  const s3 = prep(cvXs);
  s3.ctx.clearRect(0, 0, s3.w, s3.h);
  drawGrid(s3.ctx, s3.w, s3.h, 0, T, bx.mn, bx.mx);
  drawAxes(s3.ctx, s3.w, s3.h, 0, T, bx.mn, bx.mx, ' s');
  // arka plan: sinc rekonstrüksiyon (yarı saydam)
  if (recon && pulses.length > 1) {
    const rec = reconstruct(xFine, pulses);
    drawLine(s3.ctx, s3.w, s3.h, 0, T, bx.mn, bx.mx, rec, tArr, '#b490ff', 1.4, 0.55);
  }
  // orijinal arka plan
  drawLine(s3.ctx, s3.w, s3.h, 0, T, bx.mn, bx.mx, xFine, tArr, '#39ff85', 1.0, 0.25);
  // stemler
  const sx = pulses.map(i => i * dt);
  const sy = pulses.map(i => xFine[i]);
  drawStems(s3.ctx, s3.w, s3.h, 0, T, bx.mn, bx.mx, sx, sy, '#b490ff', 3.2, 1.8);
}

function renderFreqRow() {
  const Fs = 1 / Ts;
  const xMin = -Fmax, xMax = Fmax;

  // Y mağnitüdleri için ortak ölçek (X spektrumunun max'ı)
  let maxX = 0;
  for (let i = 0; i < cachedSpec.mag.length; i++) {
    if (cachedSpec.fAxis[i] >= xMin && cachedSpec.fAxis[i] <= xMax) {
      if (cachedSpec.mag[i] > maxX) maxX = cachedSpec.mag[i];
    }
  }
  if (maxX < 1e-12) maxX = 1;

  // BW tahmini: tepe değerinin %1'i üstündeki en büyük |F|
  let B = 0;
  for (let i = 0; i < cachedSpec.mag.length; i++) {
    if (cachedSpec.mag[i] > maxX * 0.01) {
      const f = Math.abs(cachedSpec.fAxis[i]);
      if (f > B) B = f;
    }
  }
  ui.readoutB.textContent = `B ≈ ${B.toFixed(1)} Hz`;

  // Aliasing tespiti (basit: B > Fs/2 → çakışma)
  const aliasing = (Fs / 2 < B);
  ui.readoutAlias.textContent = aliasing ? _t({tr: 'çakışma: VAR', en: 'aliasing: YES'}) : _t({tr: 'çakışma: yok', en: 'aliasing: none'});
  ui.aliasFlag.classList.toggle('ok', !aliasing);
  ui.aliasFlag.classList.toggle('bad', aliasing);
  ui.aliasFlag.textContent = aliasing
    ? `✗ Nyquist İHLAL: $F_s/2=${(Fs/2).toFixed(1)} < B=${B.toFixed(1)}$`.replace(/\$/g,'')
    : `✓ Nyquist sağlanıyor ($F_s/2=${(Fs/2).toFixed(1)} ≥ B=${B.toFixed(1)})`.replace(/\$/g,'');

  // ─── 4) X(F) ───
  const s4 = prep(cvXf);
  s4.ctx.clearRect(0, 0, s4.w, s4.h);
  let yMin, yMax;
  if (specMode === 'db') {
    yMin = -60; yMax = 5;
  } else {
    yMin = -maxX * 0.07; yMax = maxX * 1.15;
  }
  drawGrid(s4.ctx, s4.w, s4.h, xMin, xMax, yMin, yMax);
  drawAxes(s4.ctx, s4.w, s4.h, xMin, xMax, yMin, yMax, ' Hz');
  // dB modu için dönüştürülmüş array
  const xDisp = (specMode === 'db')
    ? cachedSpec.mag.map(v => v > 1e-6 ? 20 * Math.log10(v / maxX) : -80)
    : cachedSpec.mag;
  drawLine(s4.ctx, s4.w, s4.h, xMin, xMax, yMin, yMax, xDisp, cachedSpec.fAxis, '#39ff85', 1.6);

  // ─── 5) P(F) ───
  const s5 = prep(cvPf);
  s5.ctx.clearRect(0, 0, s5.w, s5.h);
  drawGrid(s5.ctx, s5.w, s5.h, xMin, xMax, -0.3, 1.2);
  drawAxes(s5.ctx, s5.w, s5.h, xMin, xMax, -0.3, 1.2, ' Hz');
  // kFs içinde olanlar
  const kMax = Math.ceil(xMax / Fs) + 2;
  const px = [];
  for (let k = -kMax; k <= kMax; k++) {
    const F = k * Fs;
    if (F >= xMin && F <= xMax) px.push(F);
  }
  drawDeltaArrows(s5.ctx, s5.w, s5.h, xMin, xMax, -0.3, 1.2, px, '#ff8c42');
  // etiketler ±F_s
  s5.ctx.fillStyle = '#ff8c42';
  s5.ctx.font = '10px Consolas, monospace';
  s5.ctx.textAlign = 'center';
  for (const F of px) {
    if (F === 0) continue;
    const x = ((F - xMin) / (xMax - xMin)) * s5.w;
    s5.ctx.fillText(`${(F/Fs).toFixed(0)}F_s`, x, 12);
  }

  // ─── 6) X_s(F) = Σ_k X(F - kFs) · Fs ───
  const s6 = prep(cvXsf);
  s6.ctx.clearRect(0, 0, s6.w, s6.h);
  // Sum replicas
  const Nfine = cachedSpec.fAxis.length;
  const sumMag = new Float64Array(Nfine);
  for (let i = 0; i < Nfine; i++) {
    const F = cachedSpec.fAxis[i];
    let s = 0;
    for (let k = -copyCount; k <= copyCount; k++) {
      const Fq = F - k * Fs;
      // Look up |X(Fq)| via linear interpolation on cachedSpec
      // fAxis is uniformly spaced
      const step = cachedSpec.Ffine / Nfine;
      const idxF = (Fq - cachedSpec.fAxis[0]) / step;
      if (idxF < 0 || idxF >= Nfine - 1) continue;
      const i0 = Math.floor(idxF), i1 = i0 + 1;
      const t = idxF - i0;
      s += (1 - t) * cachedSpec.mag[i0] + t * cachedSpec.mag[i1];
    }
    sumMag[i] = Fs * s;
  }
  let maxXs = 0;
  for (let i = 0; i < Nfine; i++) {
    if (cachedSpec.fAxis[i] >= xMin && cachedSpec.fAxis[i] <= xMax && sumMag[i] > maxXs) maxXs = sumMag[i];
  }
  if (maxXs < 1e-12) maxXs = 1;
  let yMin2, yMax2;
  if (specMode === 'db') {
    yMin2 = -60; yMax2 = 5;
  } else {
    yMin2 = -maxXs * 0.07; yMax2 = maxXs * 1.15;
  }
  drawGrid(s6.ctx, s6.w, s6.h, xMin, xMax, yMin2, yMax2);

  // Aliasing alanını vurgula: |F| > Fs/2 ve |F| < B+ ... aslında: Fs/2 etrafı
  if (aliasHL && aliasing) {
    // çakışma bölgesi: Fs/2 - (B - Fs/2) .. Fs/2 + (B - Fs/2) ve simetrik
    // basit: ±[Fs/2 - δ, Fs/2 + δ] bandını boyayalım, δ = (B - Fs/2)
    const delta = B - Fs / 2;
    if (delta > 0) {
      s6.ctx.fillStyle = 'rgba(255,79,154,0.13)';
      const drawBand = (cen) => {
        const a = cen - delta, b = cen + delta;
        const xa = Math.max(0, ((Math.max(a, xMin) - xMin) / (xMax - xMin)) * s6.w);
        const xb = Math.min(s6.w, ((Math.min(b, xMax) - xMin) / (xMax - xMin)) * s6.w);
        if (xb > xa) s6.ctx.fillRect(xa, 0, xb - xa, s6.h);
      };
      drawBand(+Fs/2);
      drawBand(-Fs/2);
      drawBand(+3*Fs/2);
      drawBand(-3*Fs/2);
    }
  }

  drawAxes(s6.ctx, s6.w, s6.h, xMin, xMax, yMin2, yMax2, ' Hz');

  // Tek tek replicaları renkle göster
  if (specMode === 'linear') {
    for (let k = -copyCount; k <= copyCount; k++) {
      const shifted = new Float64Array(Nfine);
      for (let i = 0; i < Nfine; i++) {
        const F = cachedSpec.fAxis[i];
        const Fq = F - k * Fs;
        const step = cachedSpec.Ffine / Nfine;
        const idxF = (Fq - cachedSpec.fAxis[0]) / step;
        if (idxF < 0 || idxF >= Nfine - 1) { shifted[i] = 0; continue; }
        const i0 = Math.floor(idxF), i1 = i0 + 1;
        const t = idxF - i0;
        shifted[i] = Fs * ((1 - t) * cachedSpec.mag[i0] + t * cachedSpec.mag[i1]);
      }
      const col = (k === 0) ? '#7b8cff' : 'rgba(180,144,255,0.4)';
      drawLine(s6.ctx, s6.w, s6.h, xMin, xMax, yMin2, yMax2, shifted, cachedSpec.fAxis, col, k === 0 ? 1.4 : 0.9, k === 0 ? 0.85 : 0.55);
    }
  }
  // Toplam (kalın çizgi)
  const xsDisp = (specMode === 'db')
    ? sumMag.map(v => v > 1e-6 ? 20 * Math.log10(v / maxXs) : -80)
    : sumMag;
  drawLine(s6.ctx, s6.w, s6.h, xMin, xMax, yMin2, yMax2, xsDisp, cachedSpec.fAxis, '#b490ff', 2.0);

  // ±Fs/2 (Nyquist) çizgileri
  s6.ctx.strokeStyle = aliasing ? '#ff4f9a' : 'rgba(57,255,133,0.65)';
  s6.ctx.lineWidth = 1.2;
  s6.ctx.setLineDash([5, 4]);
  const xpos = ((Fs/2 - xMin)/(xMax - xMin)) * s6.w;
  const xneg = ((-Fs/2 - xMin)/(xMax - xMin)) * s6.w;
  s6.ctx.beginPath(); s6.ctx.moveTo(xpos, 0); s6.ctx.lineTo(xpos, s6.h); s6.ctx.stroke();
  s6.ctx.beginPath(); s6.ctx.moveTo(xneg, 0); s6.ctx.lineTo(xneg, s6.h); s6.ctx.stroke();
  s6.ctx.setLineDash([]);
  s6.ctx.fillStyle = aliasing ? '#ff4f9a' : '#39ff85';
  s6.ctx.font = '10px Consolas, monospace';
  s6.ctx.textAlign = 'center';
  s6.ctx.fillText('+F_s/2', xpos, 12);
  s6.ctx.fillText('−F_s/2', xneg, 12);
}

function renderAll() {
  recomputeAll();
  renderTimeRow();
  renderFreqRow();
  updateReadouts();
}

// ============================================
// FREEHAND ÇİZİM (x(t) panelinde)
// ============================================
function drawHandlerSetup() {
  function getPos(e) {
    const rect = cvX.getBoundingClientRect();
    const cx = e.clientX ?? (e.touches && e.touches[0].clientX);
    const cy = e.clientY ?? (e.touches && e.touches[0].clientY);
    const xPx = cx - rect.left, yPx = cy - rect.top;
    const idx = Math.round((xPx / rect.width) * (N - 1));
    const yNorm = 1 - (yPx / rect.height);
    const amp = (yNorm - 0.5) * 3;
    return { idx, amp };
  }
  function plot(idx, ampV) {
    if (prevIdx < 0 || prevIdx === idx) {
      if (idx >= 0 && idx < N) drawnSignal[idx] = ampV;
    } else {
      const s = Math.min(prevIdx, idx), e = Math.max(prevIdx, idx);
      const a0 = prevIdx < idx ? prevAmp : ampV, a1 = prevIdx < idx ? ampV : prevAmp;
      const span = e - s;
      for (let i = s; i <= e; i++) {
        if (i < 0 || i >= N) continue;
        const t = span === 0 ? 0 : (i - s) / span;
        drawnSignal[i] = a0 + (a1 - a0) * t;
      }
    }
    prevIdx = idx; prevAmp = ampV;
  }
  function isActive() { return signalType === 'freehand'; }

  cvX.addEventListener('mousedown', e => {
    if (!isActive()) return;
    drawing = true; prevIdx = -1;
    const p = getPos(e); plot(p.idx, p.amp);
    renderAll();
    e.preventDefault();
  });
  cvX.addEventListener('mousemove', e => {
    if (!drawing || !isActive()) return;
    const p = getPos(e); plot(p.idx, p.amp);
    renderAll();
    e.preventDefault();
  });
  window.addEventListener('mouseup', () => { drawing = false; prevIdx = -1; });
  cvX.addEventListener('touchstart', e => {
    if (!isActive()) return;
    drawing = true; prevIdx = -1;
    const p = getPos(e); plot(p.idx, p.amp);
    renderAll(); e.preventDefault();
  }, { passive: false });
  cvX.addEventListener('touchmove', e => {
    if (!drawing || !isActive()) return;
    const p = getPos(e); plot(p.idx, p.amp);
    renderAll(); e.preventDefault();
  }, { passive: false });
  cvX.addEventListener('touchend', () => { drawing = false; prevIdx = -1; });
}
drawHandlerSetup();

// ============================================
// UI OLAYLARI
// ============================================
function updateReadouts() {
  ui.f0Val.textContent = f0.toFixed(1);
  ui.f1Val.textContent = f1.toFixed(1);
  ui.ampVal.textContent = amp.toFixed(2);
  ui.widthVal.textContent = width.toFixed(3);
  ui.dtSlid.textContent = (dt * 1000).toFixed(2);
  ui.NVal.textContent = N;
  ui.TsVal.textContent = (Ts * 1000).toFixed(2);
  ui.FsVal.textContent = (1 / Ts).toFixed(2);
  ui.copyVal.textContent = `±${copyCount}`;
  ui.FmaxVal.textContent = Fmax;
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);

  ui.dtRO.textContent = `${(dt * 1000).toFixed(2)} ms`;
  ui.fsRO.textContent = `${(1 / Ts).toFixed(2)} Hz`;
  ui.readoutT.textContent = `T = ${(N * dt).toFixed(3)} s`;
  ui.readoutTs.textContent = `T_s = ${(Ts * 1000).toFixed(2)} ms`;
  ui.readoutN.textContent = `N_s = ${pulses.length} örnek`;

  ui.modeBadge.textContent = (signalType === 'freehand')
    ? 'serbest çizim · drag'
    : 'preset · ' + signalType;

  ui.drawHintX.textContent = (signalType === 'freehand')
    ? '✏️ x(t) panelinde fare ile çiz'
    : 'önset · işaret tipi seçin';
}

function updateVisibility() {
  const isFree = signalType === 'freehand';
  ui.freehandControls.style.display = isFree ? 'flex' : 'none';
  cvX.classList.toggle('draw-active', isFree);
  cvX.classList.toggle('freehand-active', isFree);

  ui.f1Group.style.display = (signalType === 'sumcos' || signalType === 'chirp') ? 'block' : 'none';
  const showWidth = (signalType === 'gauss' || signalType === 'rect' || signalType === 'damped');
  ui.widthGroup.style.display = (isFree ? 'none' : (showWidth ? 'block' : 'none'));
}

function onSignalChange() {
  signalType = ui.signalType.value;
  f0 = parseFloat(ui.f0Slider.value);
  f1 = parseFloat(ui.f1Slider.value);
  amp = parseFloat(ui.ampSlider.value);
  width = parseFloat(ui.widthSlider.value);
  updateVisibility();
  renderAll();
}

function onSamplingChange(src) {
  if (src === 'dt') dt = parseFloat(ui.dtSlider.value) * 0.001;
  if (src === 'N')  N = parseInt(ui.NSlider.value);
  if (src === 'Ts') { Ts = parseFloat(ui.TsSlider.value) * 0.001; lastEdit = 'Ts'; ui.FsSlider.value = (1/Ts).toFixed(1); }
  if (src === 'Fs') { Ts = 1 / parseFloat(ui.FsSlider.value); lastEdit = 'Fs'; ui.TsSlider.value = (Ts * 1000).toFixed(1); }
  // freehand boyutunu yeniden boyutlandır
  if (drawnSignal.length !== N) {
    const newArr = new Float64Array(N);
    const ratio = drawnSignal.length / N;
    for (let i = 0; i < N; i++) {
      const j = Math.floor(i * ratio);
      newArr[i] = drawnSignal[Math.min(j, drawnSignal.length - 1)] || 0;
    }
    drawnSignal = newArr;
  }
  renderAll();
}

function onDisplayChange() {
  copyCount = parseInt(ui.copySlider.value);
  Fmax = parseInt(ui.FmaxSlider.value);
  gridAlpha = parseFloat(ui.gridAlpha.value);
  specMode = ui.specMode.value;
  aliasHL = ui.aliasHL.checked;
  recon = ui.reconToggle.checked;
  renderAll();
}

ui.signalType.addEventListener('change', onSignalChange);
[ui.f0Slider, ui.f1Slider, ui.ampSlider, ui.widthSlider].forEach(el => {
  el.addEventListener('input', onSignalChange);
});
ui.dtSlider.addEventListener('input', () => onSamplingChange('dt'));
ui.NSlider.addEventListener('input', () => onSamplingChange('N'));
ui.TsSlider.addEventListener('input', () => onSamplingChange('Ts'));
ui.FsSlider.addEventListener('input', () => onSamplingChange('Fs'));
[ui.copySlider, ui.FmaxSlider, ui.gridAlpha, ui.specMode, ui.aliasHL, ui.reconToggle, ui.windowFn].forEach(el => {
  el.addEventListener('input', onDisplayChange);
  el.addEventListener('change', onDisplayChange);
});

ui.canvasHeight.addEventListener('input', () => {
  const h = parseInt(ui.canvasHeight.value);
  ui.canvasHeightVal.textContent = h;
  document.querySelectorAll('.smp-grid canvas').forEach(c => c.style.height = h + 'px');
  renderAll();
});

ui.drawClear.addEventListener('click', () => {
  drawnSignal = new Float64Array(N);
  renderAll();
});
ui.drawSmooth.addEventListener('click', () => {
  const s = new Float64Array(N);
  for (let i = 1; i < N - 1; i++) s[i] = (drawnSignal[i-1] + drawnSignal[i] + drawnSignal[i+1]) / 3;
  s[0] = drawnSignal[0]; s[N-1] = drawnSignal[N-1];
  drawnSignal = s; renderAll();
});
ui.drawNormalize.addEventListener('click', () => {
  let mx = 0;
  for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(drawnSignal[i]));
  if (mx > 0) for (let i = 0; i < N; i++) drawnSignal[i] /= mx;
  renderAll();
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

// ============================================
// BAŞLAT
// ============================================
initBg();
updateVisibility();
renderAll();
