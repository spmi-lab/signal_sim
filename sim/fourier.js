/* ============================================
   FOURIER SERİSİ
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
// ── Canvas ──
const cvSignal = document.getElementById('canvasSignal');
const cvSpec = document.getElementById('canvasSpectrum');
const cvPartial = document.getElementById('canvasPartial');
const cvDraw = document.getElementById('canvasDraw');

// ── UI ──
const ui = {
  signalType: document.getElementById('signalType'),
  T0Slider: document.getElementById('T0Slider'),
  T0Val: document.getElementById('T0Val'),
  ampSlider: document.getElementById('ampSlider'),
  ampVal: document.getElementById('ampVal'),
  dutyGroup: document.getElementById('dutyGroup'),
  dutySlider: document.getElementById('dutySlider'),
  dutyVal: document.getElementById('dutyVal'),
  F0Val: document.getElementById('F0Val'),
  Omega0Val: document.getElementById('Omega0Val'),
  NSlider: document.getElementById('NSlider'),
  NVal: document.getElementById('NVal'),
  KmaxSlider: document.getElementById('KmaxSlider'),
  KmaxVal: document.getElementById('KmaxVal'),
  periodsSlider: document.getElementById('periodsSlider'),
  periodsVal: document.getElementById('periodsVal'),
  samplesSlider: document.getElementById('samplesSlider'),
  samplesVal: document.getElementById('samplesVal'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  canvasHeight: document.getElementById('canvasHeight'),
  canvasHeightVal: document.getElementById('canvasHeightVal'),
  specMode: document.getElementById('specMode'),
  periodReadout: document.getElementById('periodReadout'),
  x_freqReadout: document.getElementById('x_freqReadout'),
  harmonicReadout: document.getElementById('harmonicReadout'),
  errorReadout: document.getElementById('errorReadout'),
  sweepBtn: document.getElementById('sweepBtn'),
  sweepSpeed: document.getElementById('sweepSpeed'),
  sweepSpeedVal: document.getElementById('sweepSpeedVal'),
  freehandControls: document.getElementById('freehandControls'),
  openDrawBtn: document.getElementById('openDrawBtn'),
  phaseSlider: document.getElementById('phaseSlider'),
  phaseVal: document.getElementById('phaseVal'),
  // Modal
  modal: document.getElementById('freehandModal'),
  drawApplyBtn: document.getElementById('drawApplyBtn'),
  drawClearBtn: document.getElementById('drawClearBtn'),
  drawSmoothBtn: document.getElementById('drawSmoothBtn'),
  drawNormalizeBtn: document.getElementById('drawNormalizeBtn'),
  drawCancelBtn: document.getElementById('drawCancelBtn'),
  symDrawToggle: document.getElementById('symDrawToggle'),
};

// ── Durum ──
let T0 = 1.0;
let F0 = 1.0;
let Omega0 = 2 * Math.PI;
let amp = 1.0;
let duty = 0.5;
let Kmax = 50;
let N = 5;
let numPeriods = 3;
let numSamples = 1024;
let gridAlpha = 0.18;
let specMode = 'linear';
let signalType = 'square';
let phaseRad = 0;   // sinyali zamanda kaydıran faz (rad): t' = t - φ/(2π) * T0

// Fourier katsayıları (kompleks)
let ckRe = new Float64Array(2 * Kmax + 1);   // index 0 = k = -Kmax, index Kmax = k=0
let ckIm = new Float64Array(2 * Kmax + 1);

// Spektrum çubuğu sürükleme
let isDraggingBar = false;

// Sweep animasyon
let sweepActive = false;
let sweepRAF = null;
let sweepStartTime = 0;
let sweepStartN = 0;

// Freehand
const DRAW_SAMPLES = 512;  // bir period (-T0..+T0 → 2T0 aralık, ama bir period = T0)
// Freehand veriler: bir periyodu temsil eder (0..T0 aralığı), 256 sample
const FH_PER_PERIOD = 256;
let freehandPeriod = new Float64Array(FH_PER_PERIOD);
let drawingActive = false;

// Modal çizim için: -T0..+T0 = 2 periyot
// Bu 2 periyot çizimde gösterilir, ama hesaplamada sadece [-T0/2..+T0/2] = 1 periyot kullanılır
const MODAL_SAMPLES = 2 * FH_PER_PERIOD;
let modalDrawData = new Float64Array(MODAL_SAMPLES);
let modalPrevIdx = -1;
let modalPrevAmp = 0;
let modalDrawing = false;
let symmetricDraw = false;

// ============================================
// ANALİTİK FOURIER KATSAYILARI
// ============================================
// Tüm formüller A=1, T0=1 için verildi, scale ile ölçeklenir.
// c_k = (1/T0) ∫_{T0} x(t) e^{-j k Ω0 t} dt
// Kompleks formda: c_k = re + j*im

function computeCk_square(k, A, duty) {
  // Kare dalga: x(t) = A, 0<t<duty*T0; -A, duty*T0<t<T0
  // Veya genel: x(t) = A, |t|<duty*T0/2; 0 outside (within period)
  // Simetrik kare dalga (±A) için:
  if (k === 0) return { re: A * (2 * duty - 1), im: 0 };
  // c_k = A * 2 * sin(k*pi*duty) / (k*pi)  for ±A square wave
  // Daha doğrusu: x(t) = A for 0<t<duty*T, -A for duty*T<t<T
  // c_k = (1/T0)[A*(1-e^{-jk2π*duty})/(jkΩ0) + (-A)*(e^{-jk2π*duty} - e^{-jk2π})/(jkΩ0)]
  // Simplifies to: c_k = (A/(jkπ)) * (1 - 2*e^{-jk2π*duty} + e^{-jk2π})
  // Since e^{-jk2π}=1: = (A/(jkπ)) * (2 - 2*e^{-jk2π*duty}) = (2A/(jkπ))*(1 - e^{-jk2π*duty})
  const theta = 2 * Math.PI * k * duty;
  const factor = A / (k * Math.PI);
  // c_k = (A/(jkπ)) * (1 - e^{-jθ})
  // 1 - e^{-jθ} = 1 - cosθ + j sinθ
  // (1/j) * (1 - e^{-jθ}) = -j(1 - cosθ) + sinθ ... no
  // 1/j = -j, so (1/j)(1 - cosθ + j sinθ) = -j + j cosθ + sinθ = sinθ + j(cosθ - 1) ... 
  // Wait: -j*(1-cosθ) + (-j)*(j sinθ) = -j(1-cosθ) + sinθ
  // So re = sinθ, im = -(1-cosθ) = cosθ - 1
  const re = factor * Math.sin(theta);
  const im = -factor * (1 - Math.cos(theta));
  return { re, im };
}

function computeCk_triangle(k, A) {
  // Üçgen dalga (peak A in middle): tepe -T0/2'de, -A T0/2'de yan
  // Yaygın bir tanım: x(t) = A*(1 - 2|t|/T0) for |t|<T0/2
  // c_0 = 0 (sıfır ortalamalı)
  if (k === 0) return { re: 0, im: 0 };
  if (k % 2 === 0) return { re: 0, im: 0 };
  // Bu üçgen dalga: peak +A at center, -A at edges → negatif katsayı
  const re = -(4 * A) / (k * k * Math.PI * Math.PI);
  return { re, im: 0 };
}

function computeCk_sawtooth(k, A) {
  // Testere dişi: x(t) = A * (2t/T0 - 1) for 0<t<T0  (-A → +A linear)
  // c_0 = 0, c_k = jA/(kπ) for k≠0
  if (k === 0) return { re: 0, im: 0 };
  // c_k = -A/(jkπ) = jA/(kπ) ... işaret konvansiyonuna göre
  // Daha standart: c_k = A*(-1)^k / (jkπ) → tek tek incelenir
  // En basit testere için: c_k = jA/(kπ) * (-1)^k... gerçekten symbolic test yapalım:
  // x(t) = (2A/T0)*t - A for 0<t<T0
  // c_k = (1/T0) ∫_0^T0 [(2A/T0)t - A] e^{-jkΩ0t} dt
  // ∫t*e^{-jkΩ0t} dt = (t/(-jkΩ0))e^{-jkΩ0t} - 1/(-jkΩ0)^2 e^{-jkΩ0t} + const
  // Bu sonuçta: c_k = A/(jkπ) * (-1)... aslında negatif olabilir
  // Daha pratik: değerleri sayısal hesabıyla sonra karşılaştıracağız.
  // Standart sonuç: c_k = jA/(kπ) (k≠0)  [sawtooth -A→A linear ramp]
  return { re: 0, im: A / (k * Math.PI) };
}

function computeCk_sine(k, A) {
  // x(t) = A*sin(Ω0 t)
  // Tek harmonik: c_1 = -jA/2, c_{-1} = jA/2, diğerleri 0
  if (k === 1) return { re: 0, im: -A / 2 };
  if (k === -1) return { re: 0, im: A / 2 };
  return { re: 0, im: 0 };
}

function computeCk_cosine(k, A) {
  // x(t) = A*cos(Ω0 t)
  // c_1 = A/2, c_{-1} = A/2, diğerleri 0
  if (k === 1 || k === -1) return { re: A / 2, im: 0 };
  return { re: 0, im: 0 };
}

function computeCk_halfwave(k, A) {
  // Yarım dalga doğrultulmuş: x(t) = A*sin(Ω0 t) for 0<t<T0/2, 0 for T0/2<t<T0
  // c_0 = A/π
  // c_1 = -jA/4 (and conjugate for -1)
  // c_k for k even (k≠0): -A/(π(k²-1)) wait let me look up standard
  if (k === 0) return { re: A / Math.PI, im: 0 };
  if (k === 1) return { re: 0, im: -A / 4 };
  if (k === -1) return { re: 0, im: A / 4 };
  // For other k: numerical formula. Use general:
  // c_k = (A/T0) ∫_0^{T0/2} sin(Ω0 t) e^{-jkΩ0 t} dt
  // = -A/(π(k²-1)) for k even, 0 for k odd (k≠±1)
  if (k % 2 !== 0) return { re: 0, im: 0 };
  const re = -A / (Math.PI * (k * k - 1));
  return { re, im: 0 };
}

function computeCk_fullwave(k, A) {
  // Tam dalga doğrultulmuş: x(t) = A|sin(Ω0 t)|
  // ASIL periyodu T0/2, ama T0 üzerinde Fourier alırsak:
  // tüm tek harmonikler 0, çift harmonikler dolu
  // c_0 = 2A/π
  if (k === 0) return { re: 2 * A / Math.PI, im: 0 };
  if (k % 2 !== 0) return { re: 0, im: 0 };
  const re = -2 * A / (Math.PI * (k * k - 1));
  return { re, im: 0 };
}

function computeCk_pulse(k, A, duty) {
  // Darbe dizisi: x(t) = A for |t - T0/2| < duty*T0/2 (T0/2 ortalı), 0 otherwise
  // Centered-at-0 pulse: c_k = A·duty·sinc(k·duty)
  // T0/2 ortalı için zaman kaymasından e^{-jkπ} = (-1)^k faz çarpanı eklenir:
  // c_k = A·duty·sinc(k·duty)·(-1)^k
  if (k === 0) return { re: A * duty, im: 0 };
  const arg = Math.PI * k * duty;
  const sinc = Math.sin(arg) / arg;
  const sign = (k % 2 === 0) ? 1 : -1;
  return { re: A * duty * sinc * sign, im: 0 };
}

// ============================================
// SAYISAL FFT (audio.js'tekiyle aynı)
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
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wRe0 = Math.cos(ang);
    const wIm0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tRe = wRe * re[b] - wIm * im[b];
        const tIm = wRe * im[b] + wIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const tw = wRe * wRe0 - wIm * wIm0;
        wIm = wRe * wIm0 + wIm * wRe0;
        wRe = tw;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// Freehand için sayısal c_k hesabı
function computeCk_numerical() {
  // freehandPeriod: bir periyodu temsil eden FH_PER_PERIOD örnek
  // FFT yap, ilk Kmax+1 örnek pozitif freq, son Kmax negatif freq
  const N_fft = FH_PER_PERIOD;
  const re = new Float64Array(N_fft);
  const im = new Float64Array(N_fft);
  for (let i = 0; i < N_fft; i++) re[i] = freehandPeriod[i];
  fft(re, im, N_fft, false);
  // FFT'nin normalizasyonu: X[k] = sum, c_k = X[k]/N
  // FFT'de pozitif k: k=0..N/2-1, negatif k: k=N/2..N-1 (k=-N/2..-1)
  for (let k = -Kmax; k <= Kmax; k++) {
    let fftIdx;
    if (k >= 0) fftIdx = k;
    else fftIdx = (N_fft + k);  // -1 → N-1, vs.
    if (fftIdx < 0 || fftIdx >= N_fft) {
      ckRe[k + Kmax] = 0;
      ckIm[k + Kmax] = 0;
    } else {
      ckRe[k + Kmax] = re[fftIdx] / N_fft;
      ckIm[k + Kmax] = im[fftIdx] / N_fft;
    }
  }
}

// ============================================
// c_k DİZİSİNİ DOLDUR (analitik VEYA sayısal)
// ============================================
function computeAllCk() {
  if (signalType === 'freehand') {
    computeCk_numerical();
  } else {
    for (let k = -Kmax; k <= Kmax; k++) {
      let c;
      switch (signalType) {
        case 'square':    c = computeCk_square(k, amp, duty); break;
        case 'triangle':  c = computeCk_triangle(k, amp); break;
        case 'sawtooth':  c = computeCk_sawtooth(k, amp); break;
        case 'sine':      c = computeCk_sine(k, amp); break;
        case 'cosine':    c = computeCk_cosine(k, amp); break;
        case 'halfwave':  c = computeCk_halfwave(k, amp); break;
        case 'fullwave':  c = computeCk_fullwave(k, amp); break;
        case 'pulse':     c = computeCk_pulse(k, amp, duty); break;
        default: c = { re: 0, im: 0 };
      }
      ckRe[k + Kmax] = c.re;
      ckIm[k + Kmax] = c.im;
    }
  }
  // Faz kaydırması uygula: c_k → c_k * e^{-jkφ}
  // x(t-τ) ↔ c_k e^{-jkΩ0 τ}; burada φ = Ω0 τ
  if (phaseRad !== 0) {
    for (let k = -Kmax; k <= Kmax; k++) {
      const re = ckRe[k + Kmax], im = ckIm[k + Kmax];
      const a = k * phaseRad;
      const c = Math.cos(a), s = Math.sin(a);
      ckRe[k + Kmax] = re * c + im * s;
      ckIm[k + Kmax] = im * c - re * s;
    }
  }
}

// ============================================
// x(t) ÖRNEKLEME (ekran 1)
// ============================================
function sampleSignal(tArr) {
  const out = new Float64Array(tArr.length);
  // Faz kaydırması: t' = t - phaseT, phaseT = (phaseRad/2π) * T0
  // Böylece kullanıcı faz çevirdikçe orijinal işaret c_k * e^{-jkφ} ile aynı şekilde kayar.
  const phaseT = (phaseRad / (2 * Math.PI)) * T0;
  if (signalType === 'freehand') {
    for (let i = 0; i < tArr.length; i++) {
      let tMod = (((tArr[i] - phaseT) % T0) + T0) % T0;
      const idx = Math.floor((tMod / T0) * FH_PER_PERIOD) % FH_PER_PERIOD;
      out[i] = freehandPeriod[idx];
    }
    return out;
  }
  for (let i = 0; i < tArr.length; i++) {
    const t = tArr[i] - phaseT;
    let tNorm = ((t % T0) + T0) % T0;
    let val = 0;
    switch (signalType) {
      case 'square': {
        // +A for 0 < tNorm < duty*T0, else -A (±A symmetric — matches c_k)
        val = (tNorm < duty * T0) ? amp : -amp;
        break;
      }
      case 'triangle': {
        // Tepe T0/2'de A; kenarlarda -A — formülle uyumlu (c_k: -4A/(k²π²))
        const x = tNorm / T0;
        val = amp * (1 - 4 * Math.abs(x - 0.5));
        break;
      }
      case 'sawtooth': {
        // -A → +A doğrusal rampa
        val = amp * (2 * (tNorm / T0) - 1);
        break;
      }
      case 'sine':   val = amp * Math.sin(Omega0 * t); break;
      case 'cosine': val = amp * Math.cos(Omega0 * t); break;
      case 'halfwave': {
        const s = Math.sin(Omega0 * t);
        val = s > 0 ? amp * s : 0;
        break;
      }
      case 'fullwave': val = amp * Math.abs(Math.sin(Omega0 * t)); break;
      case 'pulse': {
        // T0/2 ortalı pulse — c_k'da (-1)^k faz çarpanı ile telafi edilir
        const dist = Math.abs(tNorm - T0 / 2);
        val = (dist < duty * T0 / 2) ? amp : 0;
        break;
      }
    }
    out[i] = val;
  }
  return out;
}

// ============================================
// KISMI TOPLAM x_N(t)
// ============================================
function partialSum(tArr, N) {
  const out = new Float64Array(tArr.length);
  // x_N(t) = sum_{k=-N}^{+N} c_k e^{jkΩ0 t}
  // = c_0 + 2*Re(sum_{k=1}^{N} c_k e^{jkΩ0 t})
  // (gerçek sinyaller için: c_{-k} = c_k*)
  // Genel kompleks işleyiş daha sağlam:
  for (let i = 0; i < tArr.length; i++) {
    let sumRe = 0;
    const t = tArr[i];
    for (let k = -N; k <= N; k++) {
      const re = ckRe[k + Kmax];
      const im = ckIm[k + Kmax];
      const arg = k * Omega0 * t;
      const cosA = Math.cos(arg);
      const sinA = Math.sin(arg);
      // c_k * e^{j arg} = (re + j*im)(cos + j*sin) = (re*cos - im*sin) + j(re*sin + im*cos)
      sumRe += re * cosA - im * sinA;
    }
    out[i] = sumRe;
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

function drawAxes(ctx, w, h, xMin, xMax, yMin, yMax, xUnit = '') {
  ctx.strokeStyle = 'rgba(100,140,255,0.3)';
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
  let step = xR / 12;
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  step = Math.ceil(step / mag) * mag;
  const y0px = (yMin <= 0 && yMax >= 0) ? h - ((0 - yMin) / (yMax - yMin)) * h : h - 10;
  for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) {
    const x = ((v - xMin) / xR) * w;
    const label = Math.abs(v) < 1e-9 ? '0' : (Number.isInteger(v) ? v.toString() : v.toFixed(2));
    ctx.fillText(label + xUnit, x, Math.min(y0px + 14, h - 2));
  }
}

function drawLine(ctx, w, h, xMin, xMax, yMin, yMax, arr, xArr, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = color;
  ctx.shadowBlur = 3;
  ctx.beginPath();
  for (let i = 0; i < arr.length; i++) {
    const x = ((xArr[i] - xMin) / (xMax - xMin)) * w;
    const y = h - ((arr[i] - yMin) / (yMax - yMin)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawStem(ctx, w, h, xMin, xMax, yMin, yMax, kArr, valArr, color, highlight) {
  const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
  for (let i = 0; i < kArr.length; i++) {
    const k = kArr[i];
    const v = valArr[i];
    const x = ((k - xMin) / (xMax - xMin)) * w;
    const y = h - ((v - yMin) / (yMax - yMin)) * h;
    const isHl = highlight ? highlight(k) : false;
    ctx.strokeStyle = isHl ? color : (color + '88');
    ctx.fillStyle = isHl ? color : (color + '88');
    ctx.lineWidth = isHl ? 2.4 : 1.4;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, isHl ? 4 : 2.8, 0, Math.PI * 2); ctx.fill();
  }
}

// ============================================
// RENDER FONKSİYONLARI
// ============================================

function renderSignal() {
  const s = prep(cvSignal);
  s.ctx.clearRect(0, 0, s.w, s.h);
  // x ekseni: 0..numPeriods*T0
  const xMin = 0;
  const xMax = numPeriods * T0;
  const tArr = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) tArr[i] = xMin + (i / (numSamples - 1)) * (xMax - xMin);
  const xVals = sampleSignal(tArr);
  const b = yBounds(xVals);
  drawGrid(s.ctx, s.w, s.h, xMin, xMax, b.mn, b.mx);
  drawAxes(s.ctx, s.w, s.h, xMin, xMax, b.mn, b.mx, 's');
  // İlk period vurgusu
  const xPeriodEnd = ((T0 - xMin) / (xMax - xMin)) * s.w;
  s.ctx.fillStyle = 'rgba(57,255,133,0.05)';
  s.ctx.fillRect(0, 0, xPeriodEnd, s.h);
  drawLine(s.ctx, s.w, s.h, xMin, xMax, b.mn, b.mx, xVals, tArr, '#39ff85', 2);
}

function renderSpectrum() {
  const s = prep(cvSpec);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const xMin = -Kmax * F0;
  const xMax = Kmax * F0;
  // y değerleri: |c_k| veya dB
  const kArr = [];
  const valArr = [];
  let maxAbs = 0;
  for (let k = -Kmax; k <= Kmax; k++) {
    const re = ckRe[k + Kmax];
    const im = ckIm[k + Kmax];
    const mag = Math.sqrt(re * re + im * im);
    kArr.push(k * F0);
    let val;
    if (specMode === 'db') {
      val = mag > 1e-12 ? 20 * Math.log10(mag) : -80;
    } else {
      val = mag;
    }
    valArr.push(val);
    if (Math.abs(val) > maxAbs) maxAbs = Math.abs(val);
  }
  let yMin, yMax;
  if (specMode === 'db') {
    yMin = -80; yMax = Math.max(0, maxAbs + 5);
  } else {
    yMin = -maxAbs * 0.1; yMax = maxAbs * 1.15;
    if (yMax === 0) { yMin = -1; yMax = 1; }
  }
  drawGrid(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax);
  drawAxes(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, ' Hz');

  // Shaded alan: |k| ≤ N → [-N*F0, +N*F0]
  const xLeft = ((-N * F0 - xMin) / (xMax - xMin)) * s.w;
  const xRight = ((N * F0 - xMin) / (xMax - xMin)) * s.w;
  // Yarım bar genişliği kadar pad
  const halfBar = Math.max(2, (s.w / (xMax - xMin)) * F0 * 0.5);
  s.ctx.fillStyle = 'rgba(255,140,66,0.13)';
  s.ctx.fillRect(xLeft - halfBar, 0, xRight - xLeft + 2 * halfBar, s.h);
  s.ctx.strokeStyle = 'rgba(255,140,66,0.5)';
  s.ctx.lineWidth = 1.5;
  s.ctx.setLineDash([5, 4]);
  s.ctx.beginPath();
  s.ctx.moveTo(xLeft - halfBar, 0); s.ctx.lineTo(xLeft - halfBar, s.h);
  s.ctx.moveTo(xRight + halfBar, 0); s.ctx.lineTo(xRight + halfBar, s.h);
  s.ctx.stroke();
  s.ctx.setLineDash([]);

  // Stem plot: |k| ≤ N highlight
  drawStem(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, kArr, valArr, '#ff8c42',
    (kF) => Math.abs(kF / F0) <= N + 0.001);
}

function renderPartial() {
  const s = prep(cvPartial);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const xMin = 0;
  const xMax = numPeriods * T0;
  const tArr = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) tArr[i] = xMin + (i / (numSamples - 1)) * (xMax - xMin);
  const xVals = sampleSignal(tArr);
  const xN = partialSum(tArr, N);
  // RMSE
  let rmse = 0;
  for (let i = 0; i < xVals.length; i++) rmse += (xVals[i] - xN[i]) ** 2;
  rmse = Math.sqrt(rmse / xVals.length);
  ui.errorReadout.textContent = `RMSE = ${rmse.toFixed(4)}`;

  const allVals = new Float64Array(numSamples * 2);
  allVals.set(xVals); allVals.set(xN, numSamples);
  const b = yBounds(allVals);
  drawGrid(s.ctx, s.w, s.h, xMin, xMax, b.mn, b.mx);
  drawAxes(s.ctx, s.w, s.h, xMin, xMax, b.mn, b.mx, 's');
  // Açık renkli orijinal
  drawLine(s.ctx, s.w, s.h, xMin, xMax, b.mn, b.mx, xVals, tArr, 'rgba(57,255,133,0.35)', 1.5);
  // Koyu renkli kısmi
  drawLine(s.ctx, s.w, s.h, xMin, xMax, b.mn, b.mx, xN, tArr, '#7b8cff', 2.2);
}

function renderAll() {
  computeAllCk();
  renderSignal();
  renderSpectrum();
  renderPartial();
}

// ============================================
// SPEKTRUM ÇUBUĞU SÜRÜKLEME
// ============================================
cvSpec.addEventListener('mousedown', (e) => {
  isDraggingBar = true;
  updateNfromMouse(e);
});
window.addEventListener('mousemove', (e) => {
  if (!isDraggingBar) return;
  updateNfromMouse(e);
});
window.addEventListener('mouseup', () => { isDraggingBar = false; });

cvSpec.addEventListener('touchstart', (e) => {
  isDraggingBar = true;
  updateNfromTouch(e);
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', (e) => {
  if (!isDraggingBar) return;
  updateNfromTouch(e);
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchend', () => { isDraggingBar = false; });

function updateNfromMouse(e) {
  const rect = cvSpec.getBoundingClientRect();
  const xPx = e.clientX - rect.left;
  const xMin = -Kmax * F0;
  const xMax = Kmax * F0;
  const f = xMin + (xPx / rect.width) * (xMax - xMin);
  // |f| / F0 → N
  let newN = Math.round(Math.abs(f) / F0);
  newN = Math.max(0, Math.min(Kmax, newN));
  if (newN !== N) {
    N = newN;
    ui.NSlider.value = N;
    ui.NVal.textContent = N;
    ui.harmonicReadout.textContent = `N = ${N}`;
    renderSpectrum();
    renderPartial();
  }
}

function updateNfromTouch(e) {
  const rect = cvSpec.getBoundingClientRect();
  const xPx = e.touches[0].clientX - rect.left;
  const xMin = -Kmax * F0;
  const xMax = Kmax * F0;
  const f = xMin + (xPx / rect.width) * (xMax - xMin);
  let newN = Math.round(Math.abs(f) / F0);
  newN = Math.max(0, Math.min(Kmax, newN));
  if (newN !== N) {
    N = newN;
    ui.NSlider.value = N;
    ui.NVal.textContent = N;
    ui.harmonicReadout.textContent = `N = ${N}`;
    renderSpectrum();
    renderPartial();
  }
}

// ============================================
// OTOMATİK SÜPÜR
// ============================================
ui.sweepBtn.addEventListener('click', () => {
  if (sweepActive) {
    stopSweep();
  } else {
    startSweep();
  }
});

function startSweep() {
  sweepActive = true;
  ui.sweepBtn.classList.add('active');
  ui.sweepBtn.textContent = '⏸ Süpürmeyi Durdur';
  sweepStartTime = performance.now();
  sweepStartN = 0;
  N = 0;
  ui.NSlider.value = 0;
  ui.NVal.textContent = 0;
  function step() {
    if (!sweepActive) return;
    const elapsed = (performance.now() - sweepStartTime) / 1000;
    const speed = parseFloat(ui.sweepSpeed.value);
    // ~3 saniyede max'a ulaş, hız 1x ile
    const fraction = Math.min(1, elapsed * speed / 3);
    const target = Math.round(fraction * Kmax);
    if (target !== N) {
      N = target;
      ui.NSlider.value = N;
      ui.NVal.textContent = N;
      ui.harmonicReadout.textContent = `N = ${N}`;
      renderSpectrum();
      renderPartial();
    }
    if (fraction >= 1) {
      stopSweep();
      return;
    }
    sweepRAF = requestAnimationFrame(step);
  }
  step();
}

function stopSweep() {
  sweepActive = false;
  if (sweepRAF) cancelAnimationFrame(sweepRAF);
  ui.sweepBtn.classList.remove('active');
  ui.sweepBtn.textContent = '▶ Otomatik Süpür (0 → max)';
}

// ============================================
// FREEHAND MODAL
// ============================================
ui.openDrawBtn.addEventListener('click', () => {
  ui.modal.classList.add('active');
  // Modal verisini freehandPeriod'tan başlat (2 periyot olarak)
  for (let i = 0; i < MODAL_SAMPLES; i++) {
    // i ∈ [0, 2*FH_PER_PERIOD) → t ∈ [-T0, +T0)
    // freehandPeriod tek periyodu temsil eder (0..T0)
    // Modal'da -T0..+T0 göstermek için freehand'i 2 kere yan yana koyalım
    const periodIdx = i % FH_PER_PERIOD;
    modalDrawData[i] = freehandPeriod[periodIdx];
  }
  setTimeout(() => renderModalCanvas(), 50);
});

ui.drawCancelBtn.addEventListener('click', () => {
  ui.modal.classList.remove('active');
});

ui.drawApplyBtn.addEventListener('click', () => {
  // Modal data'nın merkez periyodunu al (-T0/2..+T0/2 = ortadaki yarım) → freehandPeriod'a koy
  // Daha basit: modal -T0..+T0 → 2 periyot. Birinci periyodu [0..FH_PER_PERIOD) al
  // Ama kullanıcı simetrik çizdiğinde sağ ve sol simetrik olmuş olur
  // En sağlıklısı: modalDrawData'nın TAMAMINI bir periyot kabul edip al
  // Yani modal -T0..+T0 → bunu yeni periyot olarak T0' = 2*T0 yap? Hayır kullanıcı tek periyot çiziyor
  // En doğrusu: modal -T0..+T0 → orta yarım [-T0/2..+T0/2] tek periyodu temsil eder
  // index: T0/2'den +3T0/2 (yani modal[FH_PER_PERIOD/2 .. 3*FH_PER_PERIOD/2])
  const start = Math.floor(FH_PER_PERIOD / 2);
  for (let i = 0; i < FH_PER_PERIOD; i++) {
    freehandPeriod[i] = modalDrawData[start + i];
  }
  signalType = 'freehand';
  ui.signalType.value = 'freehand';
  ui.modal.classList.remove('active');
  updateUIVisibility();
  renderAll();
});

ui.drawClearBtn.addEventListener('click', () => {
  modalDrawData = new Float64Array(MODAL_SAMPLES);
  renderModalCanvas();
});

ui.drawSmoothBtn.addEventListener('click', () => {
  const s = new Float64Array(MODAL_SAMPLES);
  for (let i = 1; i < MODAL_SAMPLES - 1; i++) {
    s[i] = (modalDrawData[i - 1] + modalDrawData[i] + modalDrawData[i + 1]) / 3;
  }
  s[0] = modalDrawData[0]; s[MODAL_SAMPLES - 1] = modalDrawData[MODAL_SAMPLES - 1];
  modalDrawData = s;
  renderModalCanvas();
});

ui.drawNormalizeBtn.addEventListener('click', () => {
  let mx = 0;
  for (let i = 0; i < MODAL_SAMPLES; i++) mx = Math.max(mx, Math.abs(modalDrawData[i]));
  if (mx > 0) {
    for (let i = 0; i < MODAL_SAMPLES; i++) modalDrawData[i] /= mx;
  }
  renderModalCanvas();
});

ui.symDrawToggle.addEventListener('change', () => {
  symmetricDraw = ui.symDrawToggle.checked;
});

function renderModalCanvas() {
  const s = prep(cvDraw);
  s.ctx.clearRect(0, 0, s.w, s.h);
  // x ekseni: -T0..+T0
  const xMin = -T0;
  const xMax = T0;
  drawGrid(s.ctx, s.w, s.h, xMin, xMax, -2, 2);
  // Eksenleri çiz
  s.ctx.strokeStyle = 'rgba(100,140,255,0.4)';
  s.ctx.lineWidth = 1.2;
  // y=0
  const y0 = s.h / 2;
  s.ctx.beginPath(); s.ctx.moveTo(0, y0); s.ctx.lineTo(s.w, y0); s.ctx.stroke();
  // x=0 (orta)
  const xMid = s.w / 2;
  s.ctx.beginPath(); s.ctx.moveTo(xMid, 0); s.ctx.lineTo(xMid, s.h); s.ctx.stroke();
  // Periyot sınırları (-T0/2 ve +T0/2 = bir periyot)
  s.ctx.setLineDash([5, 4]);
  s.ctx.strokeStyle = 'rgba(57,255,133,0.5)';
  s.ctx.lineWidth = 1.5;
  const xLeft = s.w * 0.25;   // -T0/2
  const xRight = s.w * 0.75;  // +T0/2
  s.ctx.beginPath(); s.ctx.moveTo(xLeft, 0); s.ctx.lineTo(xLeft, s.h); s.ctx.stroke();
  s.ctx.beginPath(); s.ctx.moveTo(xRight, 0); s.ctx.lineTo(xRight, s.h); s.ctx.stroke();
  s.ctx.setLineDash([]);
  // Etiketler
  s.ctx.fillStyle = 'rgba(180,190,220,0.7)';
  s.ctx.font = '11px Consolas, monospace';
  s.ctx.textAlign = 'center';
  s.ctx.fillText('−T₀', 0, s.h - 5);
  s.ctx.fillText('−T₀/2', xLeft, s.h - 5);
  s.ctx.fillText('0', xMid, s.h - 5);
  s.ctx.fillText('+T₀/2', xRight, s.h - 5);
  s.ctx.fillText('+T₀', s.w, s.h - 5);
  // Çizilen veri
  s.ctx.strokeStyle = '#39ff85';
  s.ctx.lineWidth = 2;
  s.ctx.shadowColor = '#39ff85';
  s.ctx.shadowBlur = 3;
  s.ctx.beginPath();
  const yScale = (s.h / 2) * 0.85;
  for (let i = 0; i < MODAL_SAMPLES; i++) {
    const x = (i / (MODAL_SAMPLES - 1)) * s.w;
    const y = y0 - modalDrawData[i] * yScale;
    if (i === 0) s.ctx.moveTo(x, y); else s.ctx.lineTo(x, y);
  }
  s.ctx.stroke();
  s.ctx.shadowBlur = 0;
  // Periyot etiketi
  s.ctx.fillStyle = 'rgba(57,255,133,0.7)';
  s.ctx.font = '10px Consolas, monospace';
  s.ctx.fillText('← tek periyot ekseninde çiz (içte kalan kısım kullanılır) →', s.w / 2, 15);
}

// Modal çizim olayları
function modalGetPos(e) {
  const rect = cvDraw.getBoundingClientRect();
  const cX = e.clientX ?? (e.touches && e.touches[0].clientX);
  const cY = e.clientY ?? (e.touches && e.touches[0].clientY);
  const xPx = cX - rect.left;
  const yPx = cY - rect.top;
  const idx = Math.round((xPx / rect.width) * (MODAL_SAMPLES - 1));
  const yScale = (rect.height / 2) * 0.85;
  const y0 = rect.height / 2;
  const amp = (y0 - yPx) / yScale;
  return { idx, amp };
}

function modalPlot(idx, amp) {
  if (modalPrevIdx < 0 || modalPrevIdx === idx) {
    if (idx >= 0 && idx < MODAL_SAMPLES) {
      modalDrawData[idx] = amp;
      if (symmetricDraw) {
        const mirror = MODAL_SAMPLES - 1 - idx;
        if (mirror >= 0 && mirror < MODAL_SAMPLES) modalDrawData[mirror] = amp;
      }
    }
  } else {
    const start = Math.min(modalPrevIdx, idx);
    const end = Math.max(modalPrevIdx, idx);
    const startAmp = modalPrevIdx < idx ? modalPrevAmp : amp;
    const endAmp = modalPrevIdx < idx ? amp : modalPrevAmp;
    const span = end - start;
    for (let i = start; i <= end; i++) {
      if (i < 0 || i >= MODAL_SAMPLES) continue;
      const t = span === 0 ? 0 : (i - start) / span;
      const val = startAmp + (endAmp - startAmp) * t;
      modalDrawData[i] = val;
      if (symmetricDraw) {
        const mirror = MODAL_SAMPLES - 1 - i;
        if (mirror >= 0 && mirror < MODAL_SAMPLES) modalDrawData[mirror] = val;
      }
    }
  }
  modalPrevIdx = idx;
  modalPrevAmp = amp;
}

cvDraw.addEventListener('mousedown', (e) => {
  modalDrawing = true;
  modalPrevIdx = -1;
  const p = modalGetPos(e);
  modalPlot(p.idx, p.amp);
  renderModalCanvas();
  e.preventDefault();
});

cvDraw.addEventListener('mousemove', (e) => {
  if (!modalDrawing) return;
  const p = modalGetPos(e);
  modalPlot(p.idx, p.amp);
  renderModalCanvas();
  e.preventDefault();
});

window.addEventListener('mouseup', () => {
  modalDrawing = false;
  modalPrevIdx = -1;
});

cvDraw.addEventListener('touchstart', (e) => {
  modalDrawing = true;
  modalPrevIdx = -1;
  const p = modalGetPos(e);
  modalPlot(p.idx, p.amp);
  renderModalCanvas();
  e.preventDefault();
}, { passive: false });

cvDraw.addEventListener('touchmove', (e) => {
  if (!modalDrawing) return;
  const p = modalGetPos(e);
  modalPlot(p.idx, p.amp);
  renderModalCanvas();
  e.preventDefault();
}, { passive: false });

cvDraw.addEventListener('touchend', () => {
  modalDrawing = false;
  modalPrevIdx = -1;
});

// ============================================
// UI / OLAYLAR
// ============================================
function updateUIVisibility() {
  const isFree = signalType === 'freehand';
  ui.freehandControls.style.display = isFree ? 'block' : 'none';

  // Duty slider sadece bazı tiplerde
  const showDuty = (signalType === 'square' || signalType === 'pulse');
  ui.dutyGroup.style.display = showDuty ? 'block' : 'none';
}

function updateReadouts() {
  ui.T0Val.textContent = T0.toFixed(2);
  ui.ampVal.textContent = amp.toFixed(2);
  ui.dutyVal.textContent = duty.toFixed(2);
  if (ui.phaseVal) ui.phaseVal.textContent = `${(phaseRad / Math.PI).toFixed(2)}π`;
  ui.NVal.textContent = N;
  ui.KmaxVal.textContent = Kmax;
  ui.periodsVal.textContent = numPeriods;
  ui.samplesVal.textContent = numSamples;
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);
  ui.canvasHeightVal.textContent = ui.canvasHeight.value;
  ui.sweepSpeedVal.textContent = parseFloat(ui.sweepSpeed.value).toFixed(1);

  F0 = 1 / T0;
  Omega0 = 2 * Math.PI * F0;
  ui.F0Val.textContent = `${F0.toFixed(3)} Hz`;
  ui.Omega0Val.textContent = `${Omega0.toFixed(3)} rad/s`;
  ui.periodReadout.textContent = `T₀ = ${T0.toFixed(2)} s`;
  ui.x_freqReadout.textContent = `F₀ = ${F0.toFixed(3)} Hz · Ω₀ = ${Omega0.toFixed(2)} rad/s`;
  ui.harmonicReadout.textContent = `N = ${N}`;
}

function onAnyInputChange() {
  signalType = ui.signalType.value;
  T0 = parseFloat(ui.T0Slider.value);
  amp = parseFloat(ui.ampSlider.value);
  duty = parseFloat(ui.dutySlider.value);
  phaseRad = ui.phaseSlider ? parseFloat(ui.phaseSlider.value) : 0;
  N = parseInt(ui.NSlider.value);
  Kmax = parseInt(ui.KmaxSlider.value);
  numPeriods = parseInt(ui.periodsSlider.value);
  numSamples = parseInt(ui.samplesSlider.value);
  gridAlpha = parseFloat(ui.gridAlpha.value);
  specMode = ui.specMode.value;

  // Kmax değişirse ck dizilerini yeniden boyutlandır
  if (ckRe.length !== 2 * Kmax + 1) {
    ckRe = new Float64Array(2 * Kmax + 1);
    ckIm = new Float64Array(2 * Kmax + 1);
  }
  // N kmax'ı aşamaz
  if (N > Kmax) {
    N = Kmax;
    ui.NSlider.value = N;
  }
  ui.NSlider.max = Kmax;

  updateReadouts();
  updateUIVisibility();
  renderAll();
}

[ui.signalType, ui.T0Slider, ui.ampSlider, ui.dutySlider, ui.phaseSlider, ui.NSlider,
 ui.KmaxSlider, ui.periodsSlider, ui.samplesSlider, ui.gridAlpha, ui.specMode,
 ui.sweepSpeed
].forEach(el => {
  if (!el) return;
  el.addEventListener('input', onAnyInputChange);
  el.addEventListener('change', onAnyInputChange);
});

ui.canvasHeight.addEventListener('input', () => {
  const h = parseInt(ui.canvasHeight.value);
  ui.canvasHeightVal.textContent = h;
  document.querySelectorAll('.fourier-graphs canvas').forEach(c => {
    c.style.height = h + 'px';
  });
  renderAll();
});

// ============================================
// ALT SEKMELER
// ============================================
document.querySelectorAll('.subtab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('disabled')) return;
    document.querySelectorAll('.subtab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const id = 'tab-' + tab.dataset.tab;
    document.getElementById(id).classList.add('active');
  });
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
    dx: (Math.random() - 0.5) * 0.18, dy: (Math.random() - 0.5) * 0.1,
    a: Math.random() * 0.18 + 0.03
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

window.addEventListener('resize', renderAll);

// ============================================
// BAŞLAT
// ============================================
initBg();
updateReadouts();
updateUIVisibility();
renderAll();
