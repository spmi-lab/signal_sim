/* ============================================
   2D SPEKTRUM AKIŞI — Canlı STFT
   - Manuel radix-2 FFT (gerçek pencere kontrolü için)
   - 8 pencere fonksiyonu (Rectangular, Hann, Hamming,
     Blackman, Blackman-Harris, Nuttall, Flat-top, Tukey)
   - Konfigüre edilebilir overlap (%0 — %90)
   - ScriptProcessorNode ile sürekli sample yakalama
   - Sağdan sola 2D waterfall + dikey canlı spektrum
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
const STATE = {
  audioCtx: null,
  source: null,
  stream: null,
  processor: null,        // ScriptProcessorNode (ses yakalama)

  fftSize: 2048,
  windowName: 'blackman',
  overlap: 0.5,           // 0..0.9
  freqScale: 'linear',
  palette: 'inferno',
  liveColor: 'auto',      // 'auto' = paletten; veya 'green','cyan','orange','magenta','gold','red','white'
  winScaleMode: 'dB',     // 'dB' veya 'linear' — pencere |W(f)| gösterim modu
  minFreq: 100,           // Hz
  maxFreq: 15000,         // Hz; 0 = nyquist
  minDb: -100,
  maxDb: -10,
  smoothing: 0.0,
  spectrumSmooth: 2,      // |X(f)| piksel-uzayında ek yumuşatma (komşu ortalama yarıçapı)

  // İşleme buffer'ları
  ringBuf: null,          // Float32Array (power-of-2)
  ringSize: 1 << 15,      // 32768
  ringMask: (1 << 15) - 1,
  totalWritten: 0,
  nextAnalysisAt: 0,

  windowCache: null,      // { name, N, w, sum, sumSq }
  fftReal: null,
  fftImag: null,
  magDb: null,            // Float32Array(N/2)

  smoothedMag: null,      // EMA buffer

  // Görselleştirme
  visBins: 256,           // canvas yüksekliğine eşitleyeceğiz
  history: [],            // Array<Float32Array(visBins)> — newest 0. index
  historyLen: 800,        // waterfall canvas piksel genişliğine eşitlenecek

  running: false,
  paused: false,
  rafId: null,
  audioElement: null,
  sourceType: null,       // 'mic' | 'file' | 'preset'
  presetHandle: null,
};

const ui = {
  fftSize2: document.getElementById('fftSize2'),
  windowType: document.getElementById('windowType'),
  overlap: document.getElementById('overlap'),
  overlapVal: document.getElementById('overlapVal'),
  freqScale2: document.getElementById('freqScale2'),
  palette2: document.getElementById('palette2'),
  liveColor: document.getElementById('liveColor'),
  minFreqInput: document.getElementById('minFreqInput'),
  maxFreqInput: document.getElementById('maxFreqInput'),
  freqRangeVal: document.getElementById('freqRangeVal'),
  freqPresetBtn: document.getElementById('freqPresetBtn'),
  freqPresetMenu: document.getElementById('freqPresetMenu'),
  winScaleDb: document.getElementById('winScaleDb'),
  winScaleLin: document.getElementById('winScaleLin'),
  minDb2: document.getElementById('minDb2'),
  minDb2Val: document.getElementById('minDb2Val'),
  maxDb2: document.getElementById('maxDb2'),
  maxDb2Val: document.getElementById('maxDb2Val'),
  smoothing2: document.getElementById('smoothing2'),
  smoothing2Val: document.getElementById('smoothing2Val'),
  hopVal: document.getElementById('hopVal'),

  btnMic2: document.getElementById('btnMic2'),
  fileInput2: document.getElementById('fileInput2'),
  btnPause2: document.getElementById('btnPause2'),
  btnStop2: document.getElementById('btnStop2'),
  presetSelect2: document.getElementById('presetSelect2'),
  status2: document.getElementById('status2'),
  outVol2: document.getElementById('outVol2'),
  outVolVal: document.getElementById('outVolVal'),

  cvWaterfall: document.getElementById('cvWaterfall'),
  cvSpecVert: document.getElementById('cvSpecVert'),
  cvLive2: document.getElementById('cvLive2'),
  cvWindow: document.getElementById('cvWindow'),
  paletteBar2: document.getElementById('paletteBar2'),
  minDbLabel: document.getElementById('minDbLabel'),
  maxDbLabel: document.getElementById('maxDbLabel'),
  mainLobeBins: document.getElementById('mainLobeBins'),
  sideLobeDb: document.getElementById('sideLobeDb'),
  enbw: document.getElementById('enbw'),
};

// ============================================
// PENCERE FONKSİYONLARI
// ============================================
const WIN_INFO = {
  rectangular:    { mainLobe: 0.89, sideLobeDb: -13, enbw: 1.00 },
  hann:           { mainLobe: 1.44, sideLobeDb: -31, enbw: 1.50 },
  hamming:        { mainLobe: 1.30, sideLobeDb: -43, enbw: 1.36 },
  blackman:       { mainLobe: 1.68, sideLobeDb: -58, enbw: 1.73 },
  blackmanHarris: { mainLobe: 1.90, sideLobeDb: -92, enbw: 2.00 },
  nuttall:        { mainLobe: 1.98, sideLobeDb: -98, enbw: 2.02 },
  flatTop:        { mainLobe: 3.86, sideLobeDb: -93, enbw: 3.77 },
  tukey:          { mainLobe: 1.15, sideLobeDb: -15, enbw: 1.22 },
};

function buildWindow(name, N) {
  const w = new Float32Array(N);
  const M = N - 1;
  switch (name) {
    case 'rectangular':
      w.fill(1);
      break;
    case 'hann':
      for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / M));
      break;
    case 'hamming':
      for (let n = 0; n < N; n++) w[n] = 0.54 - 0.46 * Math.cos(2 * Math.PI * n / M);
      break;
    case 'blackman':
      for (let n = 0; n < N; n++) {
        const t = 2 * Math.PI * n / M;
        w[n] = 0.42 - 0.5 * Math.cos(t) + 0.08 * Math.cos(2 * t);
      }
      break;
    case 'blackmanHarris':
      for (let n = 0; n < N; n++) {
        const t = 2 * Math.PI * n / M;
        w[n] = 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t);
      }
      break;
    case 'nuttall':
      for (let n = 0; n < N; n++) {
        const t = 2 * Math.PI * n / M;
        w[n] = 0.355768 - 0.487396 * Math.cos(t) + 0.144232 * Math.cos(2 * t) - 0.012604 * Math.cos(3 * t);
      }
      break;
    case 'flatTop':
      for (let n = 0; n < N; n++) {
        const t = 2 * Math.PI * n / M;
        w[n] = 0.21557895
             - 0.41663158 * Math.cos(t)
             + 0.277263158 * Math.cos(2 * t)
             - 0.083578947 * Math.cos(3 * t)
             + 0.006947368 * Math.cos(4 * t);
      }
      break;
    case 'tukey': {
      const alpha = 0.5;
      const aM = alpha * M / 2;
      for (let n = 0; n < N; n++) {
        if (n < aM) w[n] = 0.5 * (1 + Math.cos(Math.PI * (n / aM - 1)));
        else if (n > M - aM) w[n] = 0.5 * (1 + Math.cos(Math.PI * ((n - M + aM) / aM)));
        else w[n] = 1;
      }
      break;
    }
    default:
      w.fill(1);
  }
  // Coherent gain (mean) ile normalize ediyoruz — pencereler arası seviye kalibrasyonu
  let sum = 0, sumSq = 0;
  for (let n = 0; n < N; n++) { sum += w[n]; sumSq += w[n] * w[n]; }
  return { w, sum, sumSq };
}

function ensureWindow() {
  if (
    !STATE.windowCache ||
    STATE.windowCache.name !== STATE.windowName ||
    STATE.windowCache.N !== STATE.fftSize
  ) {
    const { w, sum, sumSq } = buildWindow(STATE.windowName, STATE.fftSize);
    STATE.windowCache = { name: STATE.windowName, N: STATE.fftSize, w, sum, sumSq };
  }
  return STATE.windowCache;
}

// ============================================
// RADIX-2 İN-PLACE FFT
// ============================================
function fftRadix2(real, imag) {
  const N = real.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
    }
  }
  // Cooley-Tukey
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wlr = Math.cos(ang), wli = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < half; k++) {
        const xr = real[i + k + half] * wr - imag[i + k + half] * wi;
        const xi = real[i + k + half] * wi + imag[i + k + half] * wr;
        real[i + k + half] = real[i + k] - xr;
        imag[i + k + half] = imag[i + k] - xi;
        real[i + k] += xr;
        imag[i + k] += xi;
        const nwr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = nwr;
      }
    }
  }
}

// ============================================
// PALETLER (3D sayfasıyla uyumlu + Turbo)
// ============================================
const PALETTES = {
  jet(v) {
    const stops = [
      [0,0,127],[0,0,204],[0,51,255],[0,153,255],[0,255,255],
      [0,255,128],[51,255,0],[204,255,0],[255,153,0],[255,51,0],[127,0,0]
    ];
    return interpStops(stops, v);
  },
  inferno(v) {
    const stops = [
      [0,0,4],[40,11,84],[101,21,110],[159,42,99],
      [212,72,66],[245,125,21],[250,193,39],[252,255,164]
    ];
    return interpStops(stops, v);
  },
  viridis(v) {
    const stops = [
      [68,1,84],[72,35,116],[64,67,135],[52,94,141],
      [41,120,142],[32,144,140],[34,167,132],[68,190,112],
      [121,209,81],[189,222,38],[253,231,36]
    ];
    return interpStops(stops, v);
  },
  plasma(v) {
    const stops = [
      [13,8,135],[75,3,161],[125,3,168],[168,34,150],
      [203,70,121],[229,107,93],[248,148,65],[253,195,40],[240,249,33]
    ];
    return interpStops(stops, v);
  },
  magma(v) {
    const stops = [
      [0,0,4],[28,16,68],[79,18,123],[129,37,129],
      [181,54,122],[229,80,100],[251,135,97],[254,194,135],[252,253,191]
    ];
    return interpStops(stops, v);
  },
  turbo(v) {
    const stops = [
      [48,18,59],[64,82,162],[64,148,219],[64,200,198],
      [110,237,143],[183,237,76],[239,205,38],[252,131,32],[222,52,21],[122,4,3]
    ];
    return interpStops(stops, v);
  },
  grayscale(v) {
    const g = Math.round(clamp01(v) * 255);
    return [g, g, g];
  },
  cyber(v) {
    const stops = [
      [4,4,18],[10,30,80],[20,110,180],[60,230,220],
      [100,255,130],[240,255,80],[255,120,200],[255,255,255]
    ];
    return interpStops(stops, v);
  },
};

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function interpStops(stops, v) {
  v = clamp01(v);
  const N = stops.length - 1;
  const x = v * N;
  const i = Math.min(N - 1, Math.floor(x));
  const t = x - i;
  const a = stops[i], b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// 256-entry LUT — pixel başına palet hesabı yapmamak için
let PALETTE_LUT = null;
function rebuildLut() {
  const fn = PALETTES[STATE.palette];
  PALETTE_LUT = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = fn(i / 255);
    PALETTE_LUT[i * 3] = r;
    PALETTE_LUT[i * 3 + 1] = g;
    PALETTE_LUT[i * 3 + 2] = b;
  }
}

function updatePaletteBar() {
  const N = 24;
  const stops = [];
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    const [r, g, b] = PALETTES[STATE.palette](v);
    stops.push(`rgb(${r},${g},${b}) ${Math.round(v * 100)}%`);
  }
  ui.paletteBar2.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
}

// ============================================
// Anlık spektrum çizgi rengi seçenekleri
// ============================================
const LIVE_COLORS = {
  green:   { stroke: '#39ff85', fillTop: 'rgba(57,255,133,0.42)', fillBot: 'rgba(57,255,133,0.04)' },
  cyan:    { stroke: '#5ad8ff', fillTop: 'rgba(90,216,255,0.42)', fillBot: 'rgba(90,216,255,0.04)' },
  orange:  { stroke: '#ff8c42', fillTop: 'rgba(255,140,66,0.42)', fillBot: 'rgba(255,140,66,0.04)' },
  magenta: { stroke: '#ff5fc8', fillTop: 'rgba(255,95,200,0.42)', fillBot: 'rgba(255,95,200,0.04)' },
  gold:    { stroke: '#ffd24a', fillTop: 'rgba(255,210,74,0.42)', fillBot: 'rgba(255,210,74,0.04)' },
  red:     { stroke: '#ff5577', fillTop: 'rgba(255,85,119,0.42)', fillBot: 'rgba(255,85,119,0.04)' },
  white:   { stroke: '#ffffff', fillTop: 'rgba(255,255,255,0.30)', fillBot: 'rgba(255,255,255,0.04)' },
};

function getLiveColorScheme() {
  if (STATE.liveColor !== 'auto' && LIVE_COLORS[STATE.liveColor]) {
    return LIVE_COLORS[STATE.liveColor];
  }
  // Auto — waterfall paletinden
  const [r1, g1, b1] = PALETTES[STATE.palette](0.9);
  const [r2, g2, b2] = PALETTES[STATE.palette](0.5);
  return {
    stroke: `rgb(${r1},${g1},${b1})`,
    fillTop: `rgba(${r2},${g2},${b2},0.45)`,
    fillBot: `rgba(${r2},${g2},${b2},0.05)`,
  };
}

// ============================================
// Pürüzsüz çizgi (quadratic Bezier) — points: [[x,y], ...]
// İlk noktadan moveTo + ara noktaları "kontrol noktası" yapıp orta noktalardan geçirir.
// ============================================
function pathSmoothLine(ctx, points) {
  const N = points.length;
  if (N === 0) return;
  ctx.moveTo(points[0][0], points[0][1]);
  if (N === 1) return;
  if (N === 2) { ctx.lineTo(points[1][0], points[1][1]); return; }
  for (let i = 1; i < N - 1; i++) {
    const xc = (points[i][0] + points[i + 1][0]) * 0.5;
    const yc = (points[i][1] + points[i + 1][1]) * 0.5;
    ctx.quadraticCurveTo(points[i][0], points[i][1], xc, yc);
  }
  ctx.lineTo(points[N - 1][0], points[N - 1][1]);
}

// Komşu ortalama (basit gauss benzeri) yumuşatma — radius pikseli kullanır
function smoothArray(src, radius) {
  const N = src.length;
  const out = new Float32Array(N);
  if (radius <= 0) { out.set(src); return out; }
  // 3-tap gauss ağırlık kernel (radius=1 için [1,2,1]/4; radius=2 için [1,4,6,4,1]/16 vs.)
  // Genel: binom katsayısı — radius=R => 2R+1 katsayı
  const R = Math.min(6, Math.max(1, Math.round(radius)));
  const K = new Float32Array(2 * R + 1);
  let sum = 0;
  for (let i = 0; i <= 2 * R; i++) {
    // binom(2R, i)
    let c = 1;
    for (let j = 0; j < i; j++) c = c * (2 * R - j) / (j + 1);
    K[i] = c; sum += c;
  }
  for (let i = 0; i < 2 * R + 1; i++) K[i] /= sum;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < 2 * R + 1; j++) {
      const idx = Math.max(0, Math.min(N - 1, i + j - R));
      s += src[idx] * K[j];
    }
    out[i] = s;
  }
  return out;
}

// ============================================
// TEMA
// ============================================
function isLight() { return document.body.classList.contains('light-theme'); }
function themeColors() {
  const light = isLight();
  return {
    bg:      light ? '#f5f7fb' : '#050518',
    panel:   light ? '#ffffff' : 'rgba(4,4,18,0.5)',
    grid:    light ? 'rgba(40,70,170,0.18)'  : 'rgba(120,160,255,0.13)',
    axis:    light ? 'rgba(20,40,140,0.65)'  : 'rgba(180,200,255,0.45)',
    text:    light ? '#0d1226'               : '#e2e6f0',
    textDim: light ? '#3a4060'               : '#7a82a6',
  };
}

// ============================================
// CANVAS YARDIMCISI
// ============================================
function fit(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height, dpr };
}

// Waterfall arkaplan canvas (pixel boyutunda)
const WF = {
  canvas: document.createElement('canvas'),
  ctx: null,
  W: 0, H: 0,
  pyToBin: null,    // her piksel satırı → bin (linear bin grid)
  pyToFreq: null,   // her piksel satırı → Hz (etiketler için)
};
WF.ctx = WF.canvas.getContext('2d', { willReadFrequently: false });

function ensureWaterfallCanvas() {
  const r = ui.cvWaterfall.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(100, Math.round(r.width * dpr));
  const H = Math.max(100, Math.round(r.height * dpr));
  if (WF.W !== W || WF.H !== H) {
    // Yeni boyut — temizle ve yeniden çiz
    WF.canvas.width = W;
    WF.canvas.height = H;
    WF.W = W; WF.H = H;
    STATE.historyLen = W;
    // Önceki geçmişi at (yeni eksene uymuyor)
    rebuildAxisMappings();
    clearWaterfallBg();
    redrawHistoryAll();
  }
}

function clearWaterfallBg() {
  const c = themeColors();
  WF.ctx.fillStyle = c.bg;
  WF.ctx.fillRect(0, 0, WF.W, WF.H);
}

// Yardımcı: efektif min/max frekans aralığı (sr'a göre clamp + log için min>0)
function effectiveFreqRange() {
  const sr = STATE.audioCtx ? STATE.audioCtx.sampleRate : 48000;
  const nyq = sr / 2;
  let fMax = (STATE.maxFreq > 0) ? Math.min(STATE.maxFreq, nyq) : nyq;
  let fMin = Math.max(0, STATE.minFreq);
  if (STATE.freqScale === 'log' && fMin < 1) fMin = 1;
  if (fMin >= fMax) fMin = Math.max(0, fMax * 0.5);
  return { fMin, fMax, nyq };
}

function rebuildAxisMappings() {
  const H = WF.H;
  const { fMin, fMax } = effectiveFreqRange();
  STATE.visBins = H;        // bir piksel satırı = bir bin
  STATE.history.length = 0; // axis değişti — geçmiş geçersiz

  const pyToFreq = new Float32Array(H);
  if (STATE.freqScale === 'log') {
    const logMin = Math.log(fMin), logMax = Math.log(fMax);
    for (let py = 0; py < H; py++) {
      const u = 1 - py / (H - 1); // alt = 0, üst = 1
      pyToFreq[py] = Math.exp(logMin + (logMax - logMin) * u);
    }
  } else {
    for (let py = 0; py < H; py++) {
      const u = 1 - py / (H - 1);
      pyToFreq[py] = fMin + u * (fMax - fMin);
    }
  }
  WF.pyToFreq = pyToFreq;
}

// ============================================
// RING BUFFER / CAPTURE
// ============================================
function resetCapture() {
  if (!STATE.ringBuf) STATE.ringBuf = new Float32Array(STATE.ringSize);
  else STATE.ringBuf.fill(0);
  STATE.totalWritten = 0;
  STATE.nextAnalysisAt = STATE.fftSize;
  STATE.smoothedMag = null;
  STATE.history.length = 0;
  ensureBuffers();
  rebuildAxisMappings();
  clearWaterfallBg();
}

function ensureBuffers() {
  if (!STATE.fftReal || STATE.fftReal.length !== STATE.fftSize) {
    STATE.fftReal = new Float32Array(STATE.fftSize);
    STATE.fftImag = new Float32Array(STATE.fftSize);
    STATE.magDb = new Float32Array(STATE.fftSize / 2);
    STATE.smoothedMag = null;
  }
}

function setupCapture(srcNode) {
  // ScriptProcessor — buffer size 1024, mono in/out
  const proc = STATE.audioCtx.createScriptProcessor(1024, 1, 1);
  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const ring = STATE.ringBuf;
    const mask = STATE.ringMask;
    const base = STATE.totalWritten;
    for (let i = 0; i < input.length; i++) {
      ring[(base + i) & mask] = input[i];
    }
    STATE.totalWritten = base + input.length;
    const output = e.outputBuffer.getChannelData(0);
    if (STATE.sourceType === 'mic') {
      output.fill(0); // feedback önle
    } else {
      output.set(input);
    }
  };
  srcNode.connect(proc);
  proc.connect(STATE.outputGain || STATE.audioCtx.destination);
  STATE.processor = proc;
}

// ============================================
// ANALİZ — yeni hop'lar geldikçe FFT çalıştır
// ============================================
function runAnalysisStep() {
  const N = STATE.fftSize;
  const hop = Math.max(1, Math.floor(N * (1 - STATE.overlap)));
  ui.hopVal.textContent = hop;

  if (STATE.nextAnalysisAt < N) STATE.nextAnalysisAt = N;

  // Çok geri kalırsak (örn. sekme arka planda iken), yakına atla
  if (STATE.totalWritten - STATE.nextAnalysisAt > N * 6) {
    STATE.nextAnalysisAt = STATE.totalWritten - N + hop;
  }

  const win = ensureWindow().w;
  const ring = STATE.ringBuf;
  const mask = STATE.ringMask;
  const real = STATE.fftReal;
  const imag = STATE.fftImag;
  const mag = STATE.magDb;
  const sr = STATE.audioCtx.sampleRate;

  let produced = 0;
  // Bir frame'de çok fazla analysis yapmamak için tavan
  const MAX_PER_FRAME = 4;

  while (STATE.totalWritten >= STATE.nextAnalysisAt && produced < MAX_PER_FRAME) {
    const startAbs = STATE.nextAnalysisAt - N;
    // Window uygula + complex'e doldur
    for (let i = 0; i < N; i++) {
      real[i] = ring[(startAbs + i) & mask] * win[i];
      imag[i] = 0;
    }
    fftRadix2(real, imag);

    // |X[k]|^2 → dB
    const half = N >> 1;
    // Normalizasyon: pencere coherent gain (sum) — sinüs için tepe genliği N/2 olur
    const norm = STATE.windowCache.sum * 0.5;
    if (norm > 0) {
      for (let k = 0; k < half; k++) {
        const re = real[k], im = imag[k];
        const m = Math.sqrt(re * re + im * im) / norm;
        mag[k] = 20 * Math.log10(m + 1e-12);
      }
    }

    // EMA yumuşatma (zaman ekseninde)
    if (STATE.smoothing > 0) {
      if (!STATE.smoothedMag || STATE.smoothedMag.length !== half) {
        STATE.smoothedMag = new Float32Array(half);
        STATE.smoothedMag.set(mag);
      } else {
        const a = STATE.smoothing;
        for (let k = 0; k < half; k++) {
          STATE.smoothedMag[k] = a * STATE.smoothedMag[k] + (1 - a) * mag[k];
        }
      }
    }

    // Görsel bin'lere indirgeme (visBins = canvas H) + dB → [0,1]
    const slice = buildVisSlice(STATE.smoothing > 0 ? STATE.smoothedMag : mag, sr, half);
    STATE.history.unshift(slice);
    // Geçmiş canvas genişliği kadar — fazlasını at
    if (STATE.history.length > STATE.historyLen + 4) STATE.history.length = STATE.historyLen;

    // Waterfall'a yeni sütun (sağda) — bir piksel kaydır + yaz
    scrollAndPushColumn(slice);

    STATE.nextAnalysisAt += hop;
    produced++;
  }
}

// FFT bin'i (k → Hz: k * sr/N) görsel piksel satırına haritala.
// visBins = canvas H — her piksel satırı için belirli frekansa en yakın FFT bin'in dB değerini al.
// Slice'lar HAM dB değeri saklar; normalizasyon çizim zamanında yapılır (min/max dB anlık değişebilsin).
function buildVisSlice(magDb, sr, half) {
  const H = WF.H;
  const out = new Float32Array(H);
  const N = STATE.fftSize;
  const binHz = sr / N;
  const pyToFreq = WF.pyToFreq;

  for (let py = 0; py < H; py++) {
    const f = pyToFreq[py];
    if (f <= 0) { out[py] = -200; continue; }
    const fLo = pyToFreq[Math.min(H - 1, py + 1)];
    const fHi = pyToFreq[Math.max(0, py - 1)];
    const kLo = Math.max(0, Math.floor(fLo / binHz));
    const kHi = Math.min(half - 1, Math.ceil(fHi / binHz));
    let m = -1e9;
    if (kHi >= kLo) {
      for (let k = kLo; k <= kHi; k++) if (magDb[k] > m) m = magDb[k];
    } else {
      const kx = f / binHz;
      const k0 = Math.max(0, Math.min(half - 1, Math.floor(kx)));
      const k1 = Math.min(half - 1, k0 + 1);
      const t = kx - k0;
      m = magDb[k0] * (1 - t) + magDb[k1] * t;
    }
    out[py] = m;
  }
  return out;
}

// Ham dB değerini [0,1] aralığına haritala (paletle eşleme için)
function dbToNorm(db) {
  const range = STATE.maxDb - STATE.minDb;
  if (range <= 0) return 0;
  const v = (db - STATE.minDb) / range;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ============================================
// WATERFALL — 1 piksel sola kaydır, sağa yeni sütun
// ============================================
function scrollAndPushColumn(slice) {
  if (WF.W <= 1 || WF.H <= 1) return;
  // Sola kaydır
  WF.ctx.drawImage(WF.canvas, 1, 0, WF.W - 1, WF.H, 0, 0, WF.W - 1, WF.H);
  // Sağ kenara yeni sütun (1px)
  const img = WF.ctx.createImageData(1, WF.H);
  const data = img.data;
  const lut = PALETTE_LUT;
  for (let py = 0; py < WF.H; py++) {
    const v = dbToNorm(slice[py]);
    const idx = Math.min(255, Math.max(0, Math.round(v * 255)));
    const li = idx * 3;
    const o = py * 4;
    data[o]     = lut[li];
    data[o + 1] = lut[li + 1];
    data[o + 2] = lut[li + 2];
    data[o + 3] = 255;
  }
  WF.ctx.putImageData(img, WF.W - 1, 0);
}

// Geçmişten tüm waterfall'ı yeniden çiz (palet / dB / eksen değişiminde)
function redrawHistoryAll() {
  if (!PALETTE_LUT) rebuildLut();
  clearWaterfallBg();
  const lut = PALETTE_LUT;
  const N = Math.min(STATE.history.length, WF.W);
  for (let k = 0; k < N; k++) {
    const slice = STATE.history[k];
    if (!slice || slice.length !== WF.H) continue;
    const x = WF.W - 1 - k;
    if (x < 0) break;
    const img = WF.ctx.createImageData(1, WF.H);
    const data = img.data;
    for (let py = 0; py < WF.H; py++) {
      const v = dbToNorm(slice[py]);
      const idx = Math.min(255, Math.max(0, Math.round(v * 255)));
      const li = idx * 3;
      const o = py * 4;
      data[o] = lut[li];
      data[o + 1] = lut[li + 1];
      data[o + 2] = lut[li + 2];
      data[o + 3] = 255;
    }
    WF.ctx.putImageData(img, x, 0);
  }
}

// ============================================
// ÇİZİM — Ana waterfall canvas (offscreen blit + axes)
// ============================================
function drawWaterfall() {
  ensureWaterfallCanvas();
  const { ctx, w, h, dpr } = fit(ui.cvWaterfall);
  const c = themeColors();
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);

  // Offscreen waterfall'ı blit et
  // CSS pikselleri → pixel canvas: setTransform(dpr,..) ile zaten dpr scale var,
  // dolayısıyla w*dpr = WF.W (yaklaşık). drawImage CSS koordinatlarında çalışır.
  ctx.drawImage(WF.canvas, 0, 0, w, h);

  drawWaterfallAxes(ctx, w, h, c);
  drawTimeIndicators(ctx, w, h, c);
}

function drawWaterfallAxes(ctx, w, h, c) {
  const { fMin, fMax } = effectiveFreqRange();

  ctx.fillStyle = c.textDim;
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'right';
  ctx.strokeStyle = c.axis;
  ctx.lineWidth = 0.7;

  if (STATE.freqScale === 'log') {
    const candidates = [10,20,30,50,80,100,200,300,500,800,1000,2000,3000,5000,8000,10000,15000,20000];
    const ticks = candidates.filter(f => f >= fMin && f <= fMax);
    const logMin = Math.log(fMin), logMax = Math.log(fMax);
    for (const f of ticks) {
      const u = (Math.log(f) - logMin) / (logMax - logMin);
      const y = h - u * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(6, y); ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.globalAlpha = 1;
      const lbl = f >= 1000 ? (f / 1000) + 'k' : f + '';
      ctx.fillStyle = c.text;
      ctx.fillText(lbl + ' Hz', w - 6, y - 2);
    }
  } else {
    const span = fMax - fMin;
    const step = span > 12000 ? 2000 : span > 6000 ? 1000 : span > 2000 ? 500 : span > 500 ? 100 : 50;
    const startF = Math.ceil(fMin / step) * step;
    for (let f = startF; f <= fMax; f += step) {
      const u = (f - fMin) / span;
      const y = h - u * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(6, y); ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.globalAlpha = 1;
      const lbl = f >= 1000 ? (f / 1000) + 'k' : f + '';
      ctx.fillStyle = c.text;
      ctx.fillText(lbl + ' Hz', w - 6, y - 2);
    }
  }
}

function drawTimeIndicators(ctx, w, h, c) {
  // Zaman ekseni: sağ = şimdi, sol = geçmiş
  // dt = hop / sr saniye/sütun
  if (!STATE.audioCtx) return;
  const hop = Math.max(1, Math.floor(STATE.fftSize * (1 - STATE.overlap)));
  const dt = hop / STATE.audioCtx.sampleRate;
  const totalSec = dt * WF.W;
  ctx.fillStyle = c.textDim;
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'left';
  // Üst-sol "şimdiden geriye"
  ctx.fillText(`−${totalSec.toFixed(2)} s`, 4, 14);
  ctx.textAlign = 'right';
  ctx.fillText(_t({tr: 'şimdi ▶', en: 'now ▶'}), w - 4, 14);

  // Alt zaman ok'u
  ctx.textAlign = 'center';
  ctx.fillStyle = c.text;
  ctx.font = 'bold 11px "Saira Condensed", sans-serif';
  ctx.fillText('◀ ZAMAN AKIŞI  (yeni dilim sağda doğar → sola akar)', w / 2, h - 4);
}

// ============================================
// ÇİZİM — Sağ dikey spektrum (en yeni dilim, pürüzsüz)
// ============================================
function drawVertSpectrum() {
  const cv = ui.cvSpecVert;
  // tam temizleme (yarı saydam panel'in altındaki eski piksellerden kurtul)
  const ctx0 = cv.getContext('2d');
  ctx0.setTransform(1, 0, 0, 1, 0, 0);
  ctx0.clearRect(0, 0, cv.width, cv.height);

  const { ctx, w, h } = fit(cv);
  const c = themeColors();
  ctx.fillStyle = c.panel;
  ctx.fillRect(0, 0, w, h);

  // Grid (dikey çizgiler = dB seviyeleri)
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 0.6;
  for (let i = 1; i < 4; i++) {
    const x = (i / 4) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }

  if (STATE.history.length === 0) {
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('—', w / 2, h / 2);
    return;
  }

  const sliceRaw = STATE.history[0]; // newest — visBins = WF.H (ham dB)
  const slice = smoothArray(sliceRaw, STATE.spectrumSmooth);

  // Slice→canvas: orta yoğunluklu örnekleme + smooth bezier
  const N = slice.length;
  const SAMPLES = Math.min(N, Math.max(80, Math.floor(h / 1.5))); // pürüzsüzlük için makul örnek
  const pts = new Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const u = i / (SAMPLES - 1);
    const idx = Math.min(N - 1, Math.round(u * (N - 1)));
    const mag = dbToNorm(slice[idx]);
    const x = mag * (w - 8) + 2;
    const y = u * (h - 1);
    pts[i] = [x, y];
  }

  // Dolgu (paletten veya seçilen renkten)
  const col = getLiveColorScheme();
  ctx.beginPath();
  pathSmoothLine(ctx, pts);
  ctx.lineTo(2, h - 1);
  ctx.lineTo(2, 0);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, col.fillBot);
  grad.addColorStop(1, col.fillTop);
  ctx.fillStyle = grad;
  ctx.fill();

  // Kontur — pürüzsüz
  ctx.beginPath();
  pathSmoothLine(ctx, pts);
  ctx.strokeStyle = col.stroke;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Etiket
  ctx.fillStyle = c.textDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('dB →', w / 2, h - 3);

  // Tepe işaretle (ham slice üzerinden)
  // Etiket rengi: eğri rengiyle iç içe girmesin → her zaman zıt yüksek-kontrast renk kullan
  let peakIdx = 0, peakRawDb = -1e9;
  for (let i = 0; i < N; i++) if (slice[i] > peakRawDb) { peakRawDb = slice[i]; peakIdx = i; }
  const peakV = dbToNorm(peakRawDb);
  if (peakV > 0.05 && WF.pyToFreq) {
    const py = Math.round((peakIdx / (N - 1)) * (h - 1));
    const fHz = WF.pyToFreq[Math.min(WF.pyToFreq.length - 1, peakIdx)];
    // Zıt renk: açık temada beyaz+koyu çerçeve, koyu temada siyah+beyaz çerçeve
    const peakLabelColor = isLight() ? '#ffffff' : '#0d1226';
    const peakBgColor    = isLight() ? '#0d1226' : '#ffffff';
    const fLbl = (fHz >= 1000 ? (fHz / 1000).toFixed(2) + 'k' : Math.round(fHz) + '') + ' Hz';
    ctx.font = '11px "Fira Code", monospace';
    ctx.textAlign = 'right';
    const tw = ctx.measureText(fLbl).width;
    const tx = w - 6, ty = Math.max(14, Math.min(py, h - 6));
    // Arka plan kutusu
    ctx.fillStyle = peakBgColor;
    ctx.globalAlpha = 0.82;
    ctx.fillRect(tx - tw - 8, ty - 11, tw + 10, 14);
    ctx.globalAlpha = 1;
    // Nokta işareti
    ctx.fillStyle = peakBgColor;
    ctx.beginPath(); ctx.arc(w - 5, py, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = peakLabelColor; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(w - 5, py, 4, 0, Math.PI * 2); ctx.stroke();
    // Etiket metni
    ctx.fillStyle = peakLabelColor;
    ctx.fillText(fLbl, tx - 2, ty);
  }
}

// ============================================
// ÇİZİM — Anlık spektrum (yatay, üst sağ panel, pürüzsüz)
// ============================================
function drawLive() {
  const cv = ui.cvLive2;
  // tam temizleme (yarı saydam panel'in altındaki eski piksellerden kurtul)
  const ctx0 = cv.getContext('2d');
  ctx0.setTransform(1, 0, 0, 1, 0, 0);
  ctx0.clearRect(0, 0, cv.width, cv.height);

  const { ctx, w, h } = fit(cv);
  const c = themeColors();
  ctx.fillStyle = c.panel;
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = c.grid; ctx.lineWidth = 0.6;
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  if (STATE.history.length === 0) {
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('—', w / 2, h / 2);
    return;
  }

  const sliceRaw = STATE.history[0];
  const slice = smoothArray(sliceRaw, STATE.spectrumSmooth);
  const N = slice.length;

  // Örnekleme — canvas genişliği boyunca smooth nokta dizisi
  const SAMPLES = Math.min(N, Math.max(120, Math.floor(w / 2)));
  const pts = new Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const u = i / (SAMPLES - 1);
    // x=0 → düşük freq → slice indeks N-1 (slice py=0 üstte=yüksek freq)
    const idx = Math.min(N - 1, Math.round((1 - u) * (N - 1)));
    const mag = dbToNorm(slice[idx]);
    const x = u * (w - 1);
    const y = h - mag * h * 0.95;
    pts[i] = [x, y];
  }

  const col = getLiveColorScheme();

  // Dolgu (pürüzsüz)
  ctx.beginPath();
  pathSmoothLine(ctx, pts);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, col.fillBot);
  grad.addColorStop(1, col.fillTop);
  ctx.fillStyle = grad;
  ctx.fill();

  // Kontur (pürüzsüz)
  ctx.beginPath();
  pathSmoothLine(ctx, pts);
  ctx.strokeStyle = col.stroke;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Frekans etiketleri
  const { fMin, fMax } = effectiveFreqRange();
  ctx.fillStyle = c.textDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.textAlign = 'center';
  if (STATE.freqScale === 'log') {
    const candidates = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const ticks = candidates.filter(f => f >= fMin && f <= fMax);
    const logMin = Math.log(fMin), logMax = Math.log(fMax);
    for (const f of ticks) {
      const u = (Math.log(f) - logMin) / (logMax - logMin);
      const lbl = f >= 1000 ? (f / 1000) + 'k' : f + '';
      ctx.fillText(lbl, u * w, h - 3);
    }
  } else {
    const span = fMax - fMin;
    const step = span > 6000 ? 2000 : span > 2000 ? 1000 : span > 500 ? 250 : 100;
    const startF = Math.ceil(fMin / step) * step;
    for (let f = startF; f <= fMax; f += step) {
      const u = (f - fMin) / span;
      const lbl = f >= 1000 ? (f / 1000) + 'k' : f + '';
      ctx.fillText(lbl, u * w, h - 3);
    }
  }
}

// Yan lob tepesi bulucu — ana lob bittiği yerden sonraki ilk lokal max'ı verir
function findFirstSideLobe(arr) {
  const N = arr.length;
  // Ana lob: k=0'dan başla, ilk lokal min'e kadar in
  let i = 1;
  while (i < N - 1 && arr[i] >= arr[i + 1]) i++;
  // i = first local minimum after main lobe
  let mainEnd = i;
  // Sonraki ilk lokal max (yan lob)
  let peakIdx = -1, peakDb = -Infinity;
  for (let j = mainEnd + 1; j < N - 1; j++) {
    if (arr[j] > arr[j - 1] && arr[j] > arr[j + 1]) {
      if (arr[j] > peakDb) { peakDb = arr[j]; peakIdx = j; }
      break;
    }
  }
  return { mainEnd, peakIdx, peakDb };
}

// ============================================
// ÇİZİM — Pencere şekli + frekans yanıtı
// (her çağrıda canvas tam temizlenir — yarı saydam panel arkaplanı üst üste binmesin)
// ============================================
function drawWindowShape() {
  const cv = ui.cvWindow;
  // 1) Önce mutlak temizleme (transform-free clearRect)
  const ctx0 = cv.getContext('2d');
  ctx0.setTransform(1, 0, 0, 1, 0, 0);
  ctx0.clearRect(0, 0, cv.width, cv.height);

  // 2) DPR-aware transform + arkaplan
  const { ctx, w, h } = fit(cv);
  const c = themeColors();
  ctx.fillStyle = c.panel;
  ctx.fillRect(0, 0, w, h);

  const N = 256; // gösterim için sabit
  const { w: win } = buildWindow(STATE.windowName, N);

  const halfW = w / 2 - 6;
  const rightX = w / 2 + 6;
  const rightW = w - rightX - 4;

  // Orta ayraç
  ctx.strokeStyle = c.grid; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();

  // === SOL: Zaman şekli w[n] (pürüzsüz) ===
  const pts = new Array(N);
  for (let n = 0; n < N; n++) {
    const x = (n / (N - 1)) * (halfW - 8) + 4;
    const y = h - 6 - win[n] * (h - 18);
    pts[n] = [x, y];
  }
  // Dolgu
  ctx.beginPath();
  pathSmoothLine(ctx, pts);
  ctx.lineTo((halfW - 8) + 4, h - 6);
  ctx.lineTo(4, h - 6);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(123,140,255,0.45)');
  grad.addColorStop(1, 'rgba(123,140,255,0.05)');
  ctx.fillStyle = grad;
  ctx.fill();
  // Kontur
  ctx.beginPath();
  pathSmoothLine(ctx, pts);
  ctx.strokeStyle = '#7b8cff';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = c.textDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('w[n]', 6, 12);

  // === SAĞ: Frekans yanıtı |W(f)| ===
  const NPAD = 2048; // daha fazla zero-pad → ana/yan lob daha net görünür
  const real = new Float32Array(NPAD);
  const imag = new Float32Array(NPAD);
  for (let i = 0; i < N; i++) real[i] = win[i];
  fftRadix2(real, imag);
  const halfPad = NPAD >> 1;
  const mags = new Float32Array(halfPad);
  let maxM = 0;
  for (let k = 0; k < halfPad; k++) {
    const m = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
    mags[k] = m;
    if (m > maxM) maxM = m;
  }
  const dB = new Float32Array(halfPad);
  for (let k = 0; k < halfPad; k++) {
    dB[k] = 20 * Math.log10(mags[k] / maxM + 1e-12);
  }

  // Gösterilen bin sayısı — penceredeki ana/yan lob detayını yakalar
  const SHOW_BINS = Math.min(96, halfPad);
  const yArea = h - 18;
  const yOff = 6;

  // y haritalama: dB veya Lineer
  const mode = STATE.winScaleMode;
  const yMinDb = -100;

  // Y haritalama: peak (max / 0 dB) → ÜST, minimum → ALT
  function valueToY(k) {
    if (mode === 'linear') {
      // v=1 (peak) → top, v=0 → bottom
      const v = mags[k] / maxM;
      return yOff + (1 - v) * yArea;
    } else {
      // dB=0 (peak) → top, dB=yMinDb → bottom
      const dbVal = Math.max(yMinDb, dB[k]);
      const yU = dbVal / yMinDb; // 0 dB →0 (top), -100 dB →1 (bottom)
      return yOff + yU * yArea;
    }
  }

  // Yatay grid + dB/lineer etiketleri
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 0.4;
  ctx.font = '8px "Fira Code", monospace';
  ctx.fillStyle = c.textDim;
  ctx.textAlign = 'right';
  if (mode === 'linear') {
    const ticks = [0.25, 0.5, 0.75, 1.0];
    for (const v of ticks) {
      const y = yOff + (1 - v) * yArea;
      ctx.beginPath(); ctx.moveTo(rightX, y); ctx.lineTo(rightX + rightW, y); ctx.stroke();
      ctx.fillText(v.toFixed(2), rightX + rightW - 2, y - 1);
    }
  } else {
    // -20 → üste yakın, -80 → alta yakın
    for (let db = -20; db >= -80; db -= 20) {
      const u = db / yMinDb;     // -20/-100 = 0.2 (üst), -80/-100 = 0.8 (alt)
      const y = yOff + u * yArea;
      ctx.beginPath(); ctx.moveTo(rightX, y); ctx.lineTo(rightX + rightW, y); ctx.stroke();
      ctx.fillText(db + ' dB', rightX + rightW - 2, y - 1);
    }
  }

  // |W(f)| pürüzsüz çizgi
  const fpts = new Array(SHOW_BINS);
  for (let k = 0; k < SHOW_BINS; k++) {
    const u = k / (SHOW_BINS - 1);
    fpts[k] = [rightX + u * rightW, valueToY(k)];
  }
  // Dolgu (hafif)
  ctx.beginPath();
  pathSmoothLine(ctx, fpts);
  ctx.lineTo(rightX + rightW, yOff + yArea);
  ctx.lineTo(rightX, yOff + yArea);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,140,66,0.10)';
  ctx.fill();
  // Kontur
  ctx.beginPath();
  pathSmoothLine(ctx, fpts);
  ctx.strokeStyle = '#ff8c42';
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Tepe (peak) işareti — k=0 (DC, ana lob tepesi)
  ctx.fillStyle = '#39ff85';
  ctx.beginPath(); ctx.arc(fpts[0][0], fpts[0][1], 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.text;
  ctx.font = 'bold 9px "Fira Code", monospace';
  ctx.textAlign = 'left';
  const peakLbl = mode === 'linear' ? '1.00' : '0 dB';
  ctx.fillText('peak ' + peakLbl, fpts[0][0] + 5, fpts[0][1] + 3);

  // İlk yan lob tepesini bul ve işaretle (dB üzerinde, mod ne olursa olsun anlamı dB cinsinden gösterilir)
  const sl = findFirstSideLobe(dB);
  if (sl.peakIdx > 0 && sl.peakIdx < SHOW_BINS) {
    const px = fpts[sl.peakIdx][0];
    const py = fpts[sl.peakIdx][1];
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.text;
    ctx.font = '9px "Fira Code", monospace';
    ctx.textAlign = 'left';
    const slDb = sl.peakDb.toFixed(0);
    ctx.fillText(`1.SL: ${slDb} dB`, Math.min(px + 5, rightX + rightW - 60), py + 3);

    // Ana lob — yan lob fark çizgisi (dikey ok)
    ctx.strokeStyle = 'rgba(255,224,102,0.5)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, fpts[0][1]);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = c.textDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(mode === 'linear' ? '|W(f)| lineer' : '|W(f)| dB', rightX + 4, 12);

  // Info güncelle
  const info = WIN_INFO[STATE.windowName];
  if (info) {
    ui.mainLobeBins.textContent = info.mainLobe.toFixed(2);
    ui.sideLobeDb.textContent = info.sideLobeDb.toFixed(0);
    ui.enbw.textContent = info.enbw.toFixed(2);
  }
}

// ============================================
// AUDIO KAYNAKLARI
// ============================================
function ensureCtx() {
  if (!STATE.audioCtx) {
    STATE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!STATE.outputGain) {
    STATE.outputGain = STATE.audioCtx.createGain();
    const v = ui.outVol2 ? (+ui.outVol2.value) / 100 : 1;
    STATE.outputGain.gain.value = v;
    STATE.outputGain.connect(STATE.audioCtx.destination);
  }
  ensureBuffers();
  if (!STATE.ringBuf) STATE.ringBuf = new Float32Array(STATE.ringSize);
  rebuildAxisMappings();
}

async function startMic() {
  if (STATE.running && STATE.sourceType === 'mic') return;
  if (STATE.running) stopSource();
  try {
    setStatus('Mikrofon izni isteniyor...', '');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    ensureCtx();
    if (STATE.audioCtx.state === 'suspended') await STATE.audioCtx.resume();
    STATE.source = STATE.audioCtx.createMediaStreamSource(stream);
    STATE.stream = stream;
    STATE.sourceType = 'mic';
    resetCapture();
    setupCapture(STATE.source);
    STATE.running = true;
    STATE.paused = false;
    setStatus('🎤 Mikrofon canlı', 'live');
    ui.btnMic2.classList.add('active');
    ui.btnPause2.disabled = false;
    ui.btnStop2.disabled = false;
    runLoop();
  } catch (e) {
    setStatus('✗ Mikrofon erişimi reddedildi', 'err');
  }
}

async function loadFile(file) {
  if (!file) return;
  if (STATE.running) stopSource();
  try {
    setStatus(`Yükleniyor: ${file.name}...`, '');
    ensureCtx();
    if (STATE.audioCtx.state === 'suspended') await STATE.audioCtx.resume();
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = url;
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    await audio.play().catch(() => {});
    STATE.audioElement = audio;
    STATE.source = STATE.audioCtx.createMediaElementSource(audio);
    STATE.sourceType = 'file';
    resetCapture();
    setupCapture(STATE.source);
    STATE.running = true;
    STATE.paused = false;
    setStatus(`▶ ${file.name}`, 'live');
    ui.btnMic2.classList.remove('active');
    ui.btnPause2.disabled = false;
    ui.btnStop2.disabled = false;
    runLoop();
  } catch (e) {
    setStatus('✗ ' + e.message, 'err');
  }
}

// ============================================
// PRESETLER — son çıkış node'unu döndürür (capture'a routed)
// ============================================
const PRESETS = {
  sine440: {
    label: '🎵 Saf Ton (440 Hz)',
    play(ctx) {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 440;
      const g = ctx.createGain(); g.gain.value = 0.18;
      osc.connect(g);
      osc.start();
      return { node: g, stop() { try { osc.stop(); } catch(_){} try { osc.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  doubleTone: {
    label: '✌️ İki Ton (440 + 554 Hz)',
    play(ctx) {
      const o1 = ctx.createOscillator(); o1.type='sine'; o1.frequency.value=440;
      const o2 = ctx.createOscillator(); o2.type='sine'; o2.frequency.value=554;
      const m = ctx.createGain(); m.gain.value=0.5;
      const g = ctx.createGain(); g.gain.value=0.18;
      o1.connect(m); o2.connect(m); m.connect(g);
      o1.start(); o2.start();
      return { node: g, stop() { try { o1.stop(); o2.stop(); } catch(_){} try { o1.disconnect(); o2.disconnect(); m.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  closeTones: {
    label: '🔍 Yakın Tonlar (1000 + 1020 Hz)',
    play(ctx) {
      const o1 = ctx.createOscillator(); o1.type='sine'; o1.frequency.value=1000;
      const o2 = ctx.createOscillator(); o2.type='sine'; o2.frequency.value=1020;
      const m = ctx.createGain(); m.gain.value=0.5;
      const g = ctx.createGain(); g.gain.value=0.18;
      o1.connect(m); o2.connect(m); m.connect(g);
      o1.start(); o2.start();
      return { node: g, stop() { try { o1.stop(); o2.stop(); } catch(_){} try { o1.disconnect(); o2.disconnect(); m.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  chirpUp: {
    label: '📈 Frekans Tarama (200→4000 Hz)',
    play(ctx) {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      const g = ctx.createGain(); g.gain.value = 0.18;
      osc.connect(g);
      osc.start();
      let cancelled = false;
      function schedule() {
        if (cancelled) return;
        const t = ctx.currentTime;
        osc.frequency.cancelScheduledValues(t);
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(4000, t + 2.8);
        setTimeout(schedule, 3200);
      }
      schedule();
      return { node: g, stop() { cancelled = true; try { osc.stop(); } catch(_){} try { osc.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  vibrato: {
    label: '🌊 Vibrato (440 ± 30 Hz)',
    play(ctx) {
      const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value=440;
      const lfo = ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value=5;
      const lfoG = ctx.createGain(); lfoG.gain.value=30;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      const g = ctx.createGain(); g.gain.value=0.18;
      osc.connect(g);
      osc.start(); lfo.start();
      return { node: g, stop() { try { osc.stop(); lfo.stop(); } catch(_){} try { osc.disconnect(); lfo.disconnect(); lfoG.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  birdChirp: {
    label: '🐦 Kuş Çığlığı',
    play(ctx) {
      const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value=2000;
      const env = ctx.createGain(); env.gain.value = 0;
      osc.connect(env);
      const g = ctx.createGain(); g.gain.value=0.6;
      env.connect(g);
      osc.start();
      let cancelled = false;
      function chirp() {
        if (cancelled) return;
        const t = ctx.currentTime;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const f0 = 1500 + Math.random() * 1500;
        const f1 = f0 + dir * (1000 + Math.random() * 2000);
        osc.frequency.cancelScheduledValues(t);
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(200, f1), t + 0.12);
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.4, t + 0.01);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        setTimeout(chirp, 180 + Math.random() * 320);
      }
      chirp();
      return { node: g, stop() { cancelled = true; try { osc.stop(); } catch(_){} try { osc.disconnect(); env.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  square220: {
    label: '🎺 Kare Dalga (220 Hz)',
    play(ctx) {
      const osc = ctx.createOscillator(); osc.type='square'; osc.frequency.value=220;
      const g = ctx.createGain(); g.gain.value=0.10;
      osc.connect(g);
      osc.start();
      return { node: g, stop() { try { osc.stop(); } catch(_){} try { osc.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  saw330: {
    label: '🎻 Testere Dişi (330 Hz)',
    play(ctx) {
      const osc = ctx.createOscillator(); osc.type='sawtooth'; osc.frequency.value=330;
      const g = ctx.createGain(); g.gain.value=0.10;
      osc.connect(g);
      osc.start();
      return { node: g, stop() { try { osc.stop(); } catch(_){} try { osc.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  harmonicStack: {
    label: '🎼 Harmonik Yığın (220 Hz × 8)',
    play(ctx) {
      const f0 = 220;
      const m = ctx.createGain(); m.gain.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0.20;
      const oscs = [];
      for (let k = 1; k <= 8; k++) {
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value = f0 * k;
        const og = ctx.createGain(); og.gain.value = 1 / k;
        o.connect(og); og.connect(m);
        oscs.push({o, og});
      }
      m.connect(g);
      oscs.forEach(x => x.o.start());
      return { node: g, stop() {
        oscs.forEach(x => { try { x.o.stop(); } catch(_){} try { x.o.disconnect(); x.og.disconnect(); } catch(_){} });
        try { m.disconnect(); g.disconnect(); } catch(_){}
      }};
    },
  },
  fmTone: {
    label: '🎛️ FM Sentez (660 × 110 Hz)',
    play(ctx) {
      const car = ctx.createOscillator(); car.type='sine'; car.frequency.value = 660;
      const mod = ctx.createOscillator(); mod.type='sine'; mod.frequency.value = 110;
      const modG = ctx.createGain(); modG.gain.value = 400;
      mod.connect(modG); modG.connect(car.frequency);
      const g = ctx.createGain(); g.gain.value = 0.18;
      car.connect(g);
      car.start(); mod.start();
      return { node: g, stop() { try { car.stop(); mod.stop(); } catch(_){} try { car.disconnect(); mod.disconnect(); modG.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  vowelA: {
    label: '🗣️ Ünlü "A" (formant)',
    play(ctx) {
      const src = ctx.createOscillator(); src.type='sawtooth'; src.frequency.value=120;
      const formants = [
        { f: 730,  q: 12, gain: 1.0 },
        { f: 1090, q: 14, gain: 0.6 },
        { f: 2440, q: 16, gain: 0.4 },
      ];
      const m = ctx.createGain(); m.gain.value = 0.5;
      const filters = [];
      formants.forEach(F => {
        const bp = ctx.createBiquadFilter();
        bp.type='bandpass'; bp.frequency.value=F.f; bp.Q.value=F.q;
        const fg = ctx.createGain(); fg.gain.value=F.gain;
        src.connect(bp); bp.connect(fg); fg.connect(m);
        filters.push({bp, fg});
      });
      const g = ctx.createGain(); g.gain.value=0.45;
      m.connect(g);
      src.start();
      return { node: g, stop() { try { src.stop(); } catch(_){} try { src.disconnect(); filters.forEach(f=>{f.bp.disconnect();f.fg.disconnect();}); m.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  dtmf1: {
    label: '📞 DTMF "1"',
    play(ctx) {
      const o1 = ctx.createOscillator(); o1.type='sine'; o1.frequency.value=697;
      const o2 = ctx.createOscillator(); o2.type='sine'; o2.frequency.value=1209;
      const m = ctx.createGain(); m.gain.value=0.5;
      o1.connect(m); o2.connect(m);
      const g = ctx.createGain(); g.gain.value=0.20;
      m.connect(g);
      o1.start(); o2.start();
      return { node: g, stop() { try { o1.stop(); o2.stop(); } catch(_){} try { o1.disconnect(); o2.disconnect(); m.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  whiteNoise: {
    label: '❄️ Beyaz Gürültü',
    play(ctx) {
      const len = 2 * ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(g);
      src.start();
      return { node: g, stop() { try { src.stop(); } catch(_){} try { src.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
  pinkNoise: {
    label: '🌧️ Pembe Gürültü',
    play(ctx) {
      const len = 4 * ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759; b2=0.96900*b2+w*0.1538520;
        b3=0.86650*b3+w*0.3104856; b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;
        b6=w*0.115926;
      }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0.30;
      src.connect(g);
      src.start();
      return { node: g, stop() { try { src.stop(); } catch(_){} try { src.disconnect(); g.disconnect(); } catch(_){} } };
    },
  },
};

async function playPreset(name) {
  if (!PRESETS[name]) return;
  if (STATE.running) stopSource();
  try {
    ensureCtx();
    if (STATE.audioCtx.state === 'suspended') await STATE.audioCtx.resume();
    const handle = PRESETS[name].play(STATE.audioCtx);
    STATE.presetHandle = handle;
    STATE.source = handle.node;
    STATE.sourceType = 'preset';
    resetCapture();
    setupCapture(STATE.source);
    STATE.running = true;
    STATE.paused = false;
    setStatus('▶ ' + PRESETS[name].label, 'live');
    ui.btnMic2.classList.remove('active');
    ui.btnPause2.disabled = false;
    ui.btnStop2.disabled = false;
    runLoop();
  } catch (e) {
    setStatus('✗ ' + e.message, 'err');
  }
}

function togglePause() {
  if (!STATE.running) return;
  STATE.paused = !STATE.paused;
  ui.btnPause2.textContent = STATE.paused ? '▶ Devam' : '⏸ Duraklat';
  if (STATE.sourceType === 'file' && STATE.audioElement) {
    if (STATE.paused) STATE.audioElement.pause();
    else STATE.audioElement.play().catch(()=>{});
  }
}

function stopSource() {
  if (STATE.rafId) {
    cancelAnimationFrame(STATE.rafId);
    STATE.rafId = null;
  }
  if (STATE.processor) {
    try { STATE.processor.disconnect(); } catch(_) {}
    STATE.processor.onaudioprocess = null;
    STATE.processor = null;
  }
  if (STATE.presetHandle) {
    try { STATE.presetHandle.stop(); } catch(_) {}
    STATE.presetHandle = null;
  }
  if (STATE.source) {
    try { STATE.source.disconnect(); } catch(_) {}
    STATE.source = null;
  }
  if (STATE.stream) {
    STATE.stream.getTracks().forEach(t => t.stop());
    STATE.stream = null;
  }
  if (STATE.audioElement) {
    try { STATE.audioElement.pause(); } catch(_) {}
    try { URL.revokeObjectURL(STATE.audioElement.src); } catch(_) {}
    STATE.audioElement = null;
  }
  STATE.running = false;
  STATE.paused = false;
  STATE.sourceType = null;
  STATE.history.length = 0;
  STATE.totalWritten = 0;
  STATE.nextAnalysisAt = 0;
  STATE.smoothedMag = null;
  ui.btnMic2.classList.remove('active');
  ui.btnPause2.disabled = true;
  ui.btnStop2.disabled = true;
  ui.btnPause2.textContent = '⏸ Duraklat';
  if (ui.presetSelect2) ui.presetSelect2.value = '';
  setStatus('Durduruldu', '');
  clearWaterfallBg();
  drawWaterfall(); drawVertSpectrum(); drawLive();
}

function setStatus(text, cls) {
  ui.status2.textContent = text;
  ui.status2.className = 'sp2-status' + (cls ? ' ' + cls : '');
}

// ============================================
// ANA LOOP
// ============================================
function runLoop() {
  function frame() {
    if (!STATE.running) return;
    STATE.rafId = requestAnimationFrame(frame);
    if (!STATE.paused && STATE.audioCtx) {
      runAnalysisStep();
    }
    drawWaterfall();
    drawVertSpectrum();
    drawLive();
  }
  frame();
}

// ============================================
// UI EVENT HANDLERS
// ============================================
ui.btnMic2.addEventListener('click', () => {
  if (STATE.sourceType === 'mic' && STATE.running) stopSource();
  else startMic();
});
ui.fileInput2.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) loadFile(file);
  e.target.value = '';
});
ui.btnPause2.addEventListener('click', togglePause);
ui.btnStop2.addEventListener('click', stopSource);
if (ui.outVol2) {
  ui.outVol2.addEventListener('input', () => {
    const v = +ui.outVol2.value;
    if (ui.outVolVal) ui.outVolVal.textContent = v + '%';
    if (STATE.outputGain) STATE.outputGain.gain.value = v / 100;
  });
}
if (ui.presetSelect2) {
  ui.presetSelect2.addEventListener('change', () => {
    const v = ui.presetSelect2.value;
    if (v && PRESETS[v]) playPreset(v);
  });
}

ui.fftSize2.addEventListener('change', () => {
  STATE.fftSize = parseInt(ui.fftSize2.value, 10);
  ensureBuffers();
  ensureWindow();
  STATE.nextAnalysisAt = STATE.totalWritten + STATE.fftSize;
  STATE.smoothedMag = null;
  drawWindowShape();
});

ui.windowType.addEventListener('change', () => {
  STATE.windowName = ui.windowType.value;
  ensureWindow();
  drawWindowShape();
});

ui.overlap.addEventListener('input', () => {
  STATE.overlap = parseInt(ui.overlap.value, 10) / 100;
  ui.overlapVal.textContent = Math.round(STATE.overlap * 100) + '%';
  const hop = Math.max(1, Math.floor(STATE.fftSize * (1 - STATE.overlap)));
  ui.hopVal.textContent = hop;
});

ui.freqScale2.addEventListener('change', () => {
  STATE.freqScale = ui.freqScale2.value;
  // Log moduna geçtiyse min>0 gerekir — input ile yeniden uygula
  applyFreqRangeFromInputs();
});

ui.palette2.addEventListener('change', () => {
  STATE.palette = ui.palette2.value;
  rebuildLut();
  updatePaletteBar();
  redrawHistoryAll();
  drawLive();
  drawVertSpectrum();
});

// Frekans aralığı (min/max number input) — kullanıcı serbest girer
function applyFreqRangeFromInputs() {
  let mn = parseFloat(ui.minFreqInput.value);
  let mx = parseFloat(ui.maxFreqInput.value);
  const sr = STATE.audioCtx ? STATE.audioCtx.sampleRate : 48000;
  const nyq = sr / 2;
  if (!isFinite(mn) || mn < 0) mn = 0;
  if (!isFinite(mx) || mx < 50) mx = 50;
  if (mn >= mx) mn = Math.max(0, mx - 50);
  if (mx > nyq) mx = nyq;
  if (mn > nyq - 50) mn = nyq - 50;
  if (STATE.freqScale === 'log' && mn < 1) mn = 1;
  STATE.minFreq = mn;
  STATE.maxFreq = mx;
  ui.minFreqInput.value = Math.round(mn);
  ui.maxFreqInput.value = Math.round(mx);
  ui.freqRangeVal.textContent = `${Math.round(mn)} — ${Math.round(mx)}`;
  rebuildAxisMappings();
  clearWaterfallBg();
}
ui.minFreqInput.addEventListener('change', applyFreqRangeFromInputs);
ui.maxFreqInput.addEventListener('change', applyFreqRangeFromInputs);

// Hazır aralık menüsü
ui.freqPresetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = ui.freqPresetMenu;
  menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
});
document.addEventListener('click', (e) => {
  if (!ui.freqPresetMenu.contains(e.target) && e.target !== ui.freqPresetBtn) {
    ui.freqPresetMenu.style.display = 'none';
  }
});
ui.freqPresetMenu.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    ui.minFreqInput.value = b.dataset.min;
    ui.maxFreqInput.value = b.dataset.max;
    ui.freqPresetMenu.style.display = 'none';
    applyFreqRangeFromInputs();
  });
});

// Anlık spektrum çizgi rengi
ui.liveColor.addEventListener('change', () => {
  STATE.liveColor = ui.liveColor.value;
  drawLive();
  drawVertSpectrum();
});

// Pencere |W(f)| dB / Lineer toggle
function setWinScale(mode) {
  STATE.winScaleMode = mode;
  ui.winScaleDb.classList.toggle('active', mode === 'dB');
  ui.winScaleLin.classList.toggle('active', mode === 'linear');
  drawWindowShape();
}
ui.winScaleDb.addEventListener('click', () => setWinScale('dB'));
ui.winScaleLin.addEventListener('click', () => setWinScale('linear'));

ui.minDb2.addEventListener('input', () => {
  STATE.minDb = parseInt(ui.minDb2.value, 10);
  ui.minDb2Val.textContent = STATE.minDb;
  if (STATE.maxDb < STATE.minDb + 5) {
    STATE.maxDb = STATE.minDb + 5;
    ui.maxDb2.value = STATE.maxDb;
    ui.maxDb2Val.textContent = STATE.maxDb;
  }
  ui.minDbLabel.textContent = STATE.minDb + ' dB';
  ui.maxDbLabel.textContent = STATE.maxDb + ' dB';
  redrawHistoryAll();
});

ui.maxDb2.addEventListener('input', () => {
  STATE.maxDb = parseInt(ui.maxDb2.value, 10);
  ui.maxDb2Val.textContent = STATE.maxDb;
  if (STATE.maxDb < STATE.minDb + 5) {
    STATE.minDb = STATE.maxDb - 5;
    ui.minDb2.value = STATE.minDb;
    ui.minDb2Val.textContent = STATE.minDb;
  }
  ui.minDbLabel.textContent = STATE.minDb + ' dB';
  ui.maxDbLabel.textContent = STATE.maxDb + ' dB';
  redrawHistoryAll();
});

ui.smoothing2.addEventListener('input', () => {
  STATE.smoothing = parseFloat(ui.smoothing2.value);
  ui.smoothing2Val.textContent = STATE.smoothing.toFixed(2);
});

window.addEventListener('resize', () => {
  ensureWaterfallCanvas();
  drawWindowShape();
  drawWaterfall();
  drawVertSpectrum();
  drawLive();
});

window.onThemeChange = () => {
  clearWaterfallBg();
  redrawHistoryAll();
  drawWindowShape();
  drawWaterfall();
  drawVertSpectrum();
  drawLive();
  updatePaletteBar();
};

// ============================================
// ARKAPLAN — basit hareketli noktalar
// ============================================
(function () {
  const c = document.getElementById('bgCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const rs = () => { c.width = innerWidth; c.height = innerHeight; }; rs();
  window.addEventListener('resize', rs);
  const pts = [];
  for (let i = 0; i < 55; i++) pts.push({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.3,
    dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.09,
    a: Math.random() * 0.18 + 0.04,
  });
  (function lp() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of pts) {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
      if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
      ctx.fillStyle = `rgba(140,180,255,${p.a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(lp);
  })();
})();

// ============================================
// ÖZEL SİNYAL OLUŞTURUCU
// x(t) = Σ aᵢ · sin(2π·fᵢ·t + φᵢ)
// ============================================
const CUSTOM = {
  components: [
    { id: 1, amp: 0,  freq: 440, phase: 0 },
  ],
  nextId: 2,
  outGain: null,
  running: false,
};

const CUSTOM_PRESETS = {
  closeRes: { name: '🔍 Yakın 2-tonlu', comps: [
    { amp: 0, freq: 1000, phase: 0 }, { amp: 0, freq: 1020, phase: 0 }
  ]},
  triClose: { name: '🔍🔍 3-tonlu yakın', comps: [
    { amp: 0, freq: 1000, phase: 0 }, { amp: 0, freq: 1015, phase: 0 }, { amp: 0, freq: 1040, phase: 0 }
  ]},
  dynRange: { name: '📊 Dinamik aralık', comps: [
    { amp: 0, freq: 1000, phase: 0 }, { amp: -60, freq: 1100, phase: 0 }
  ]},
  dynRange2: { name: '📊 Geniş dinamik', comps: [
    { amp: 0, freq: 1000, phase: 0 }, { amp: -40, freq: 1500, phase: 0 }, { amp: -80, freq: 3000, phase: 0 }
  ]},
  offBin: { name: '📌 Off-bin scalloping', comps: [
    { amp: 0, freq: 1023.456, phase: 0 }
  ]},
  dtmf1:    { name: 'DTMF "1"', comps: [{amp:0,freq:697,phase:0},{amp:0,freq:1209,phase:0}] },
  dtmf5:    { name: 'DTMF "5"', comps: [{amp:0,freq:770,phase:0},{amp:0,freq:1336,phase:0}] },
  dtmf9:    { name: 'DTMF "9"', comps: [{amp:0,freq:852,phase:0},{amp:0,freq:1477,phase:0}] },
  dtmf0:    { name: 'DTMF "0"', comps: [{amp:0,freq:941,phase:0},{amp:0,freq:1336,phase:0}] },
  dtmfStar: { name: 'DTMF "*"', comps: [{amp:0,freq:941,phase:0},{amp:0,freq:1209,phase:0}] },
  cmajor:   { name: 'C-majör akor', comps: [{amp:0,freq:261.63,phase:0},{amp:0,freq:329.63,phase:0},{amp:0,freq:392.00,phase:0}] },
  aminor:   { name: 'A-minör akor', comps: [{amp:0,freq:440.00,phase:0},{amp:0,freq:523.25,phase:0},{amp:0,freq:659.25,phase:0}] },
  octaveStack: { name: 'Oktav yığını', comps: [
    {amp:0,freq:1000,phase:0},{amp:-6,freq:2000,phase:0},{amp:-12,freq:4000,phase:0},{amp:-18,freq:8000,phase:0}
  ]},
  harmonic: { name: 'Harmonik seri (220×k)', comps: [
    {amp:0,freq:220,phase:0},{amp:-6,freq:440,phase:0},{amp:-9.5,freq:660,phase:0},
    {amp:-12,freq:880,phase:0},{amp:-14,freq:1100,phase:0},{amp:-16,freq:1320,phase:0}
  ]},
  cancel:   { name: 'Faz iptali (440 + 440 φ=180°)', comps: [{amp:0,freq:440,phase:0},{amp:0,freq:440,phase:180}] },
  quadrature: { name: 'Quadrature (cos + sin)', comps: [{amp:0,freq:440,phase:90},{amp:0,freq:440,phase:0}] },
  beat:     { name: 'Vuru (440 + 442)', comps: [{amp:0,freq:440,phase:0},{amp:0,freq:442,phase:0}] },
};

const customUi = {
  list: document.getElementById('customComponents'),
  presetSelect: document.getElementById('customPresetSelect'),
  addBtn: document.getElementById('customAddBtn'),
  clearBtn: document.getElementById('customClearBtn'),
  playBtn: document.getElementById('customPlayBtn'),
  dtmfTable: document.getElementById('dtmfTable'),
};

function dbToLinear(db) { return Math.pow(10, db / 20); }

function sumLinear() {
  let s = 0;
  for (const c of CUSTOM.components) s += dbToLinear(c.amp);
  return s;
}

// Çıkış normalizasyonu: bileşenlerin doğrusal genliklerinin toplamına bölerek
// final sinyalin [-1, 1] aralığında kalmasını garanti et
function customMasterGain() {
  const s = sumLinear();
  return s > 0.0001 ? 0.85 / s : 0;
}

// Tek bir bileşen için oscillator + gain düğümlerini kur, başlat
function buildAndStartOsc(c, ctx, destNode, startTime) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = Math.max(0.1, c.freq);

  const g = ctx.createGain();
  g.gain.value = dbToLinear(c.amp);

  osc.connect(g);
  g.connect(destNode);

  // Faz: oscillator t=0 anında sin(0)=0'dan başlar.
  // sin(2π·f·t + φ) için, start zamanını -φ/(2π·f) kadar geri kaydırmamız lazım,
  // ama geri kaydıramayız → eşdeğer olarak (2π - φ)/(2π·f) kadar ileri kaydır.
  const phaseRad = ((c.phase % 360) + 360) % 360 * Math.PI / 180;
  // Eğer φ=0 ise gecikme = 1/f (tam bir periyot — eşdeğer).
  // Daha temizi: gecikme = ((2π - φ) mod 2π) / (2π·f)
  const delay = ((2 * Math.PI - phaseRad) % (2 * Math.PI)) / (2 * Math.PI * Math.max(1, c.freq));
  osc.start(startTime + delay);

  c.osc = osc;
  c.gain = g;
}

function stopOneOsc(c) {
  if (c.osc) {
    try { c.osc.stop(); } catch(_) {}
    try { c.osc.disconnect(); } catch(_) {}
    c.osc = null;
  }
  if (c.gain) {
    try { c.gain.disconnect(); } catch(_) {}
    c.gain = null;
  }
}

async function playCustom() {
  if (CUSTOM.components.length === 0) {
    setStatus(_t({tr: '✗ Bileşen yok — önce ekleyin', en: '✗ No components — add some first'}), 'err');
    return;
  }
  // Mevcut başka kaynak varsa kapat
  if (STATE.running) stopSource();

  ensureCtx();
  if (STATE.audioCtx.state === 'suspended') await STATE.audioCtx.resume();
  const ctx = STATE.audioCtx;

  // Master gain (normalize)
  const outGain = ctx.createGain();
  outGain.gain.value = customMasterGain();

  // Tüm oscillator'ları aynı startTime ile başlat ki fazlar tutarlı olsun
  const startTime = ctx.currentTime + 0.06;
  for (const c of CUSTOM.components) {
    buildAndStartOsc(c, ctx, outGain, startTime);
  }

  CUSTOM.outGain = outGain;
  CUSTOM.running = true;

  STATE.source = outGain;
  STATE.presetHandle = {
    stop() {
      for (const c of CUSTOM.components) stopOneOsc(c);
      try { outGain.disconnect(); } catch(_) {}
      CUSTOM.outGain = null;
      CUSTOM.running = false;
    }
  };
  STATE.sourceType = 'preset'; // capture chain'i preset gibi davransın (ses çıkışı aktif)

  resetCapture();
  setupCapture(STATE.source);

  STATE.running = true;
  STATE.paused = false;
  setStatus(`▶ Özel Sinyal (${CUSTOM.components.length} bileşen)`, 'live');
  ui.btnMic2.classList.remove('active');
  ui.btnPause2.disabled = false;
  ui.btnStop2.disabled = false;
  runLoop();
}

// Çalarken bir bileşenin değerini günceller
// amp/freq: kayarak (setTargetAtTime), faz: tek bileşeni yeniden başlat
function updateCustomLive(comp, field) {
  if (!CUSTOM.running || !STATE.audioCtx) return;
  const ctx = STATE.audioCtx;
  if (field === 'amp' && comp.gain) {
    comp.gain.gain.setTargetAtTime(dbToLinear(comp.amp), ctx.currentTime, 0.02);
    // Master'ı da yeniden normalize et
    if (CUSTOM.outGain) {
      CUSTOM.outGain.gain.setTargetAtTime(customMasterGain(), ctx.currentTime, 0.03);
    }
  } else if (field === 'freq' && comp.osc) {
    comp.osc.frequency.setTargetAtTime(Math.max(0.1, comp.freq), ctx.currentTime, 0.02);
  } else if (field === 'phase') {
    // Bu tek bileşeni durdurup yeniden başlat
    if (comp.osc && CUSTOM.outGain) {
      stopOneOsc(comp);
      buildAndStartOsc(comp, ctx, CUSTOM.outGain, ctx.currentTime + 0.05);
    }
  }
}

// ============================================
// UI: Bileşen listesini DOM'a render et
// ============================================
function renderComponents() {
  const container = customUi.list;
  container.innerHTML = '';
  if (CUSTOM.components.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'custom-empty';
    empty.textContent = 'Henüz bileşen yok — "+ Bileşen" ile ekleyin veya hazır bir kombinasyon seçin';
    container.appendChild(empty);
    return;
  }
  CUSTOM.components.forEach((c, idx) => {
    const row = document.createElement('div');
    row.className = 'comp-row';
    row.dataset.id = c.id;
    row.innerHTML = `
      <span class="comp-idx">${idx + 1}</span>
      <div class="comp-field" title="Genlik (dB) — 0 dB tepe, negatif değerler daha sessiz">
        <span class="comp-field-label">A</span>
        <input type="number" class="comp-amp" step="3" min="-120" max="20" value="${c.amp}" />
        <span class="comp-field-unit">dB</span>
      </div>
      <div class="comp-field" title="Frekans (Hz)">
        <span class="comp-field-label">f</span>
        <input type="number" class="comp-freq" step="10" min="0.1" max="24000" value="${c.freq}" />
        <span class="comp-field-unit">Hz</span>
      </div>
      <div class="comp-field" title="Başlangıç fazı (derece)">
        <span class="comp-field-label">φ</span>
        <input type="number" class="comp-phase" step="15" min="-360" max="360" value="${c.phase}" />
        <span class="comp-field-unit">°</span>
      </div>
      <button class="comp-del" title="Sil">×</button>
    `;
    // Event'ler
    const ampIn = row.querySelector('.comp-amp');
    const freqIn = row.querySelector('.comp-freq');
    const phaseIn = row.querySelector('.comp-phase');
    const delBtn = row.querySelector('.comp-del');

    ampIn.addEventListener('change', () => {
      const v = parseFloat(ampIn.value);
      if (isFinite(v)) { c.amp = v; updateCustomLive(c, 'amp'); }
    });
    freqIn.addEventListener('change', () => {
      const v = parseFloat(freqIn.value);
      if (isFinite(v) && v > 0) { c.freq = v; updateCustomLive(c, 'freq'); }
    });
    phaseIn.addEventListener('change', () => {
      const v = parseFloat(phaseIn.value);
      if (isFinite(v)) { c.phase = v; updateCustomLive(c, 'phase'); }
    });
    delBtn.addEventListener('click', () => removeComponent(c.id));

    container.appendChild(row);
  });
}

function addComponent(values) {
  const def = values || { amp: 0, freq: 1000, phase: 0 };
  CUSTOM.components.push({ id: CUSTOM.nextId++, amp: def.amp, freq: def.freq, phase: def.phase });
  renderComponents();
  // Çalarken yapısal değişim — yeniden başlat
  if (CUSTOM.running) playCustom();
}

function removeComponent(id) {
  const idx = CUSTOM.components.findIndex(c => c.id === id);
  if (idx < 0) return;
  const c = CUSTOM.components[idx];
  if (c.osc) stopOneOsc(c);
  CUSTOM.components.splice(idx, 1);
  renderComponents();
  if (CUSTOM.running) {
    if (CUSTOM.components.length === 0) stopSource();
    else playCustom();
  }
}

function clearComponents() {
  for (const c of CUSTOM.components) stopOneOsc(c);
  CUSTOM.components.length = 0;
  renderComponents();
  if (STATE.sourceType === 'preset' && CUSTOM.running) stopSource();
}

function loadCustomPreset(key) {
  const p = CUSTOM_PRESETS[key];
  if (!p) return;
  // Önceki bileşenleri temizle
  for (const c of CUSTOM.components) stopOneOsc(c);
  CUSTOM.components = p.comps.map(x => ({
    id: CUSTOM.nextId++, amp: x.amp, freq: x.freq, phase: x.phase,
  }));
  renderComponents();
  // Otomatik çal
  playCustom();
}

// DTMF tablosu — tıklanan tuş için 2 bileşen oluştur + oynat
function loadDtmfKey(rowHz, colHz, label) {
  for (const c of CUSTOM.components) stopOneOsc(c);
  CUSTOM.components = [
    { id: CUSTOM.nextId++, amp: 0, freq: rowHz, phase: 0 },
    { id: CUSTOM.nextId++, amp: 0, freq: colHz, phase: 0 },
  ];
  renderComponents();
  playCustom();
  setStatus(`▶ DTMF "${label}" — ${rowHz} + ${colHz} Hz`, 'live');
}

// ============================================
// Özel sinyal UI event'leri
// ============================================
customUi.addBtn.addEventListener('click', () => addComponent());
customUi.clearBtn.addEventListener('click', () => clearComponents());
customUi.playBtn.addEventListener('click', () => playCustom());
customUi.presetSelect.addEventListener('change', () => {
  const v = customUi.presetSelect.value;
  if (v && CUSTOM_PRESETS[v]) {
    loadCustomPreset(v);
    customUi.presetSelect.value = '';
  }
});

// DTMF tablosu tıklamaları
if (customUi.dtmfTable) {
  customUi.dtmfTable.addEventListener('click', (e) => {
    const td = e.target.closest('td[data-row][data-col]');
    if (!td) return;
    const rowHz = parseFloat(td.dataset.row);
    const colHz = parseFloat(td.dataset.col);
    const label = td.dataset.label;
    loadDtmfKey(rowHz, colHz, label);
    // Sayfayı en üste kaydırma yerine waterfall'a kaydır
    document.getElementById('cvWaterfall').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// ============================================
// İLK KURULUM
// ============================================
function initDefaults() {
  STATE.fftSize = parseInt(ui.fftSize2.value, 10);
  STATE.windowName = ui.windowType.value;
  STATE.overlap = parseInt(ui.overlap.value, 10) / 100;
  STATE.freqScale = ui.freqScale2.value;
  STATE.palette = ui.palette2.value;
  STATE.liveColor = ui.liveColor.value;
  STATE.minFreq = parseFloat(ui.minFreqInput.value) || 20;
  STATE.maxFreq = parseFloat(ui.maxFreqInput.value) || 8000;
  STATE.minDb = parseInt(ui.minDb2.value, 10);
  STATE.maxDb = parseInt(ui.maxDb2.value, 10);
  STATE.smoothing = parseFloat(ui.smoothing2.value);
  STATE.winScaleMode = 'dB';

  ui.overlapVal.textContent = Math.round(STATE.overlap * 100) + '%';
  ui.minDb2Val.textContent = STATE.minDb;
  ui.maxDb2Val.textContent = STATE.maxDb;
  ui.smoothing2Val.textContent = STATE.smoothing.toFixed(2);
  ui.minDbLabel.textContent = STATE.minDb + ' dB';
  ui.maxDbLabel.textContent = STATE.maxDb + ' dB';
  ui.freqRangeVal.textContent = `${Math.round(STATE.minFreq)} — ${Math.round(STATE.maxFreq)}`;
  ui.hopVal.textContent = Math.max(1, Math.floor(STATE.fftSize * (1 - STATE.overlap)));

  ensureBuffers();
  rebuildLut();
  updatePaletteBar();
  ensureWindow();
  ensureWaterfallCanvas();
  drawWindowShape();
  drawWaterfall();
  drawVertSpectrum();
  drawLive();

  // Özel sinyal bileşenleri ilk render
  renderComponents();
}

initDefaults();
