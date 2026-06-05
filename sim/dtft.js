/* ============================================
   DTFT — Ayrık Zaman Fourier Dönüşümü
   X(e^{jω}) = Σ_n x[n] e^{-jωn}
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
const PI = Math.PI;
const TWO_PI = 2 * PI;

// ── Canvas ──
const cvXn  = document.getElementById('cvXn');
const cvUC  = document.getElementById('cvUC');
const cvMag = document.getElementById('cvMag');

// ── UI ──
const ui = {
  signalType: document.getElementById('signalType'),
  ampSlider: document.getElementById('ampSlider'),
  ampVal: document.getElementById('ampVal'),
  widthGroup: document.getElementById('widthGroup'),
  widthSlider: document.getElementById('widthSlider'),
  widthVal: document.getElementById('widthVal'),
  aGroup: document.getElementById('aGroup'),
  aSlider: document.getElementById('aSlider'),
  aVal: document.getElementById('aVal'),
  omega0Group: document.getElementById('omega0Group'),
  omega0Slider: document.getElementById('omega0Slider'),
  omega0Val: document.getElementById('omega0Val'),
  drawClear: document.getElementById('drawClear'),
  drawSmooth: document.getElementById('drawSmooth'),
  drawNormalize: document.getElementById('drawNormalize'),
  freehandControls: document.getElementById('freehandControls'),
  nMinInput: document.getElementById('nMinInput'),
  nMaxInput: document.getElementById('nMaxInput'),
  applyN: document.getElementById('applyN'),
  omRangeSlider: document.getElementById('omRangeSlider'),
  omRangeVal: document.getElementById('omRangeVal'),
  omSampSlider: document.getElementById('omSampSlider'),
  omSampVal: document.getElementById('omSampVal'),
  periodHL: document.getElementById('periodHL'),
  magMode: document.getElementById('magMode'),
  markerSlider: document.getElementById('markerSlider'),
  markerVal: document.getElementById('markerVal'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  canvasHeight: document.getElementById('canvasHeight'),
  canvasHeightVal: document.getElementById('canvasHeightVal'),
  nRangeRO: document.getElementById('nRangeRO'),
  markerRO: document.getElementById('markerRO'),
  magRO: document.getElementById('magRO'),
  xnHint: document.getElementById('xnHint'),
  animToggle: document.getElementById('animToggle'),
  animReset: document.getElementById('animReset'),
  ucHint: document.getElementById('ucHint'),
};

// ── Durum ──
let signalType = 'rect';
let amp = 1, width = 5, aExp = 0.8, omega0 = PI / 2;
let nMin = -20, nMax = 20;
let omRange = 2;   // ekseni ±omRange*π
let omSamp  = 1024;
let periodHL = true;
let magMode = 'linear';
let markerOmega = 0;
let gridAlpha = 0.16;

// ── 3D döndürme durumu ──
let viewYaw   = 0.0;     // z ekseni etrafında (sağa-sola)
let viewPitch = 0.55;    // x ekseni etrafında (öne yatış)
let animPlaying = true;  // play/stop bayrağı
let isRotating = false;
let rotStartX = 0, rotStartY = 0, rotStartYaw = 0, rotStartPitch = 0;

let drawn = new Float64Array(nMax - nMin + 1);
let drawing = false, prevIdx = -1, prevAmp = 0;

// ============================================
// SİNYAL ÜRETİCİ
// ============================================
function makeSignal() {
  const len = nMax - nMin + 1;
  const x = new Float64Array(len);
  if (signalType === 'freehand') {
    if (drawn.length !== len) {
      const resized = new Float64Array(len);
      const ratio = drawn.length / len;
      for (let i = 0; i < len; i++) {
        const j = Math.floor(i * ratio);
        resized[i] = drawn[Math.min(j, drawn.length - 1)] || 0;
      }
      drawn = resized;
    }
    return drawn.slice();
  }
  for (let i = 0; i < len; i++) {
    const n = nMin + i;
    let v = 0;
    switch (signalType) {
      case 'delta':    v = n === 0 ? amp : 0; break;
      case 'rect':     v = Math.abs(n) <= width ? amp : 0; break;
      case 'triangle': v = Math.abs(n) <= width ? amp * (1 - Math.abs(n) / (width + 1)) : 0; break;
      case 'step':     v = (n >= 0 && n <= 2 * width) ? amp : 0; break;
      case 'expDec':   v = n >= 0 ? amp * Math.pow(aExp, n) : 0; break;
      case 'cosine':   v = Math.abs(n) <= width ? amp * Math.cos(omega0 * n) : 0; break;
      case 'sine':     v = Math.abs(n) <= width ? amp * Math.sin(omega0 * n) : 0; break;
      case 'modCos': {
        // Hann pencere ile modüle kosinüs (parçalı bant geçişli FIR taslağı)
        if (Math.abs(n) <= width) {
          const wnd = 0.5 * (1 + Math.cos(PI * n / (width + 1)));
          v = amp * wnd * Math.cos(omega0 * n);
        }
        break;
      }
      case 'sinc': {
        // ideal düşük-geçiren impulse response: ωc = omega0
        const wc = Math.max(0.01, omega0);
        if (Math.abs(n) > width) v = 0;
        else if (n === 0) v = amp * wc / PI;
        else v = amp * Math.sin(wc * n) / (PI * n);
        break;
      }
    }
    x[i] = v;
  }
  return x;
}

// ============================================
// DTFT  X(e^{jω}) = Σ x[n] e^{-jωn}
// ============================================
function computeDTFT(x) {
  // ω ekseni: [-omRange*π, +omRange*π]
  const omMax = omRange * PI;
  const M = omSamp;
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  const om = new Float64Array(M);
  const len = x.length;
  for (let k = 0; k < M; k++) {
    const w = -omMax + (2 * omMax) * (k / (M - 1));
    om[k] = w;
    let r = 0, i = 0;
    for (let i2 = 0; i2 < len; i2++) {
      const n = nMin + i2;
      const a = -w * n;
      r += x[i2] * Math.cos(a);
      i += x[i2] * Math.sin(a);
    }
    re[k] = r; im[k] = i;
  }
  const mag = new Float64Array(M);
  const pha = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    pha[k] = Math.atan2(im[k], re[k]);
  }
  return { om, mag, pha, re, im };
}

// Tek bir ω için DTFT'yi değerlendir (imleç için)
function evalDTFTat(x, omega) {
  let r = 0, i = 0;
  for (let k = 0; k < x.length; k++) {
    const n = nMin + k;
    const a = -omega * n;
    r += x[k] * Math.cos(a);
    i += x[k] * Math.sin(a);
  }
  return { re: r, im: i, mag: Math.sqrt(r * r + i * i), pha: Math.atan2(i, r) };
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
  if (xLabelFn) {
    xLabelFn(ctx, w, h, xMin, xMax, y0px);
  }
}

function xLabelsN(ctx, w, h, xMin, xMax, y0px) {
  const xR = xMax - xMin;
  let step = Math.max(1, Math.ceil(xR / 14));
  for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) {
    const x = ((v - xMin) / xR) * w;
    ctx.fillText(v.toString(), x, Math.min(y0px + 13, h - 2));
  }
}

function xLabelsOmega(ctx, w, h, xMin, xMax, y0px) {
  // π katlarında etiketle
  const xR = xMax - xMin;
  const ticks = [-4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  for (const tickK of ticks) {
    const v = tickK * PI;
    if (v < xMin || v > xMax) continue;
    const x = ((v - xMin) / xR) * w;
    let label;
    if (tickK === 0) label = '0';
    else if (tickK === 1) label = 'π';
    else if (tickK === -1) label = '−π';
    else if (Number.isInteger(tickK)) label = `${tickK}π`;
    else label = `${tickK}π`;
    ctx.fillText(label, x, Math.min(y0px + 13, h - 2));
  }
}

function drawStem(ctx, w, h, xMin, xMax, yMin, yMax, nArr, vArr, color) {
  const y0 = h - ((0 - yMin) / (yMax - yMin)) * h;
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 1.7;
  for (let i = 0; i < nArr.length; i++) {
    const x = ((nArr[i] - xMin) / (xMax - xMin)) * w;
    const y = h - ((vArr[i] - yMin) / (yMax - yMin)) * h;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, TWO_PI); ctx.fill();
  }
}

function drawCurve(ctx, w, h, xMin, xMax, yMin, yMax, xArr, yArr, color, lw, alpha) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 1.8;
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

function drawMarker(ctx, w, h, xMin, xMax, om, color) {
  if (om < xMin || om > xMax) return;
  const x = ((om - xMin) / (xMax - xMin)) * w;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  ctx.setLineDash([]);
}

// ============================================
// RENDER
// ============================================
let cached = null;
let xCached = null;

function recomputeAll() {
  xCached = makeSignal();
  cached = computeDTFT(xCached);
}

function renderXn() {
  const s = prep(cvXn);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const nArr = [];
  for (let n = nMin; n <= nMax; n++) nArr.push(n);
  const b = yBounds(xCached);
  drawGrid(s.ctx, s.w, s.h, nMin - 0.5, nMax + 0.5, b.mn, b.mx);
  drawAxes(s.ctx, s.w, s.h, nMin - 0.5, nMax + 0.5, b.mn, b.mx, xLabelsN);
  drawStem(s.ctx, s.w, s.h, nMin - 0.5, nMax + 0.5, b.mn, b.mx, nArr, xCached, '#39ff85');
}

// ─── 3D birim çember + unroll animasyonu ───
let animT = 0;
let lastAnimMs = performance.now();
let animRAF = null;

function easeUnroll(t) {
  // Animasyon sahneleri (1 tam döngü = animT 0..1):
  //  0.00..0.25: 3D modu
  //  0.25..0.45: 3D → düz açılma
  //  0.45..0.70: düz mod
  //  0.70..0.90: düz → 3D sarılma
  //  0.90..1.00: 3D'de bekle
  if (t < 0.25) return 0;
  if (t < 0.45) {
    const u = (t - 0.25) / 0.20;
    return u * u * (3 - 2 * u);
  }
  if (t < 0.70) return 1;
  if (t < 0.90) {
    const u = 1 - (t - 0.70) / 0.20;
    return u * u * (3 - 2 * u);
  }
  return 0;
}

function renderUC() {
  const s = prep(cvUC);
  const W = s.w, H = s.h;
  const ctx = s.ctx;
  ctx.clearRect(0, 0, W, H);

  // === Görünüm parametreleri ===
  const cx = W / 2;
  const cy3D = H * 0.40;
  // viewPitch ve viewYaw kullanıcı tarafından sürüklenebilir
  const pitch = viewPitch;
  const yaw   = viewYaw;
  const sinP = Math.sin(pitch), cosP = Math.cos(pitch);
  const sinY = Math.sin(yaw),   cosY = Math.cos(yaw);
  const r0 = Math.min(W, H) * 0.18;
  const hScale = Math.min(W, H) * 0.18;
  const flatHalfW = Math.min(W * 0.42, 320);
  const flatCy = H * 0.86;

  // Mağnitüd normalizasyonu
  const Mom = cached.om.length;
  let maxMag = 0;
  for (let k = 0; k < Mom; k++) {
    if (cached.om[k] >= -PI && cached.om[k] <= PI && cached.mag[k] > maxMag) maxMag = cached.mag[k];
  }
  if (maxMag < 1e-12) maxMag = 1;

  // 3D → 2D projeksiyon
  // Eksen konvansiyonu: +z YUKARI (dünyada), +y derinlik (ekran içine doğru)
  // Önce Z (yaw), sonra X (pitch).
  function proj(x3, y3, z3, originY) {
    // Yaw: z-ekseni etrafında (xy düzleminde döndürme)
    const x1 = x3 * cosY - y3 * sinY;
    const y1 = x3 * sinY + y3 * cosY;
    const z1 = z3;
    // Pitch: x-ekseni etrafında (yz düzleminde döndürme)
    // y' = y*cos(p) + z*sin(p)  →  pozitif z (yukarı) ekranı yukarı taşır
    const y2 = y1 * cosP + z1 * sinP;
    return { sx: cx + x1, sy: originY - y2 };
  }

  // Animasyon fazı (animasyon duruyorsa morphing yok)
  const tA = easeUnroll(animT);

  // === Zemin gridi ===
  // Duruyorken her zaman tam (her iki şekil de görünür)
  // Oynarken tA ile fade
  const gridFade = animPlaying ? (1 - tA) : 1;
  if (gridFade > 0.03) {
    ctx.strokeStyle = `rgba(100,160,255,${0.22 * gridFade})`;
    ctx.lineWidth = 0.7;
    // Eş merkezli çemberler (zeminde, z=0)
    for (let g = 1; g <= 3; g++) {
      const rr = r0 * g / 3;
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const th = (i / 64) * TWO_PI;
        const p = proj(Math.cos(th) * rr, Math.sin(th) * rr, 0, cy3D);
        if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }
    // Polar radyal hatlar (her π/4 noktasına)
    ctx.strokeStyle = `rgba(100,160,255,${0.15 * gridFade})`;
    for (let j = 0; j < 8; j++) {
      const th = j * (PI / 4);
      const p0 = proj(0, 0, 0, cy3D);
      const p1 = proj(Math.cos(th) * r0 * 1.04, Math.sin(th) * r0 * 1.04, 0, cy3D);
      ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
    }
    // Yükseklik gridi (cylinder üzerinde, sabit h çemberleri)
    ctx.strokeStyle = `rgba(255,209,102,${0.16 * gridFade})`;
    ctx.lineWidth = 0.6;
    for (let h = 0.25; h <= 1.001; h += 0.25) {
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const th = (i / 64) * TWO_PI;
        const p = proj(Math.cos(th) * r0, Math.sin(th) * r0, h * hScale, cy3D);
        if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }
    // Düz birim çember (referans, z=0 zemininde, kesik çizgili)
    ctx.strokeStyle = `rgba(255,209,102,${0.55 * gridFade})`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const th = (i / 96) * TWO_PI;
      const p = proj(Math.cos(th) * r0, Math.sin(th) * r0, 0, cy3D);
      if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // === ω etiketleri (3D mod): -π, 0, +π, ±π/2 ===
  if (gridFade > 0.05) {
    ctx.fillStyle = `rgba(255,209,102,${gridFade})`;
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.textAlign = 'center';
    // ω=0 (Re ekseninin pozitif tarafı): konum (r0, 0, 0)
    const p0 = proj(r0 * 1.18, 0, 0, cy3D);
    ctx.fillText('ω = 0', p0.sx, p0.sy + 4);
    // ω=±π (Re ekseninin negatif tarafı, birleşik nokta)
    const pp = proj(-r0 * 1.18, 0, 0, cy3D);
    ctx.fillText('ω = ±π', pp.sx, pp.sy + 4);
    // ω=+π/2 (Im pozitif)
    const ph = proj(0, r0 * 1.18, 0, cy3D);
    ctx.fillText('ω = +π/2', ph.sx, ph.sy - 4);
    // ω=−π/2 (Im negatif)
    const pn = proj(0, -r0 * 1.18, 0, cy3D);
    ctx.fillText('ω = −π/2', pn.sx, pn.sy + 12);
    // Re/Im eksen etiketleri
    ctx.fillStyle = `rgba(180,190,220,${0.6 * gridFade})`;
    ctx.font = '10px Consolas, monospace';
    const pRe = proj(r0 * 1.45, 0, 0, cy3D);
    ctx.fillText('Re', pRe.sx, pRe.sy - 4);
    const pIm = proj(0, r0 * 1.45, 0, cy3D);
    ctx.fillText('Im', pIm.sx, pIm.sy - 4);
  }

  // === "Kesim" işareti — ω=±π'de bir kesik çizgi (animasyon orta fazında parlasın) ===
  if (animT > 0.25 && animT < 0.55) {
    const intens = 1 - Math.abs((animT - 0.40) / 0.15);
    ctx.strokeStyle = `rgba(255,79,154,${0.8 * Math.max(0, intens)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    // ω=π noktasından zeminden yukarıya dikey çizgi
    const pTop = proj(-r0, 0, hScale * 1.1, cy3D);
    const pBot = proj(-r0, 0, 0, cy3D);
    ctx.beginPath(); ctx.moveTo(pTop.sx, pTop.sy); ctx.lineTo(pBot.sx, pBot.sy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,79,154,${Math.max(0, intens)})`;
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(' ✂ kesim @ ω=±π', pTop.sx + 6, pTop.sy);
  }

  // === Mağnitüd profili ===
  // Animasyon DURMUŞ ise: 3D çember şeklini VE düz DTFT şeklini AYNI ANDA çiz.
  // Animasyon OYNUYOR ise: tA ile blend edilmiş tek bir morphing eğri çiz.
  ctx.strokeStyle = '#ff8c42';
  ctx.lineWidth = 2.2;
  ctx.shadowColor = '#ff8c42';
  ctx.shadowBlur = 5;

  if (!animPlaying) {
    // ─── DURDU: 3D eğri ─────────────────────
    ctx.beginPath();
    let startedA = false;
    for (let k = 0; k < Mom; k++) {
      const w = cached.om[k];
      if (w < -PI || w > PI) continue;
      const mag = cached.mag[k] / maxMag;
      const p3 = proj(Math.cos(w) * r0, Math.sin(w) * r0, mag * hScale, cy3D);
      if (!startedA) { ctx.moveTo(p3.sx, p3.sy); startedA = true; }
      else ctx.lineTo(p3.sx, p3.sy);
    }
    ctx.stroke();
    // ─── DURDU: düz DTFT eğrisi ─────────────
    ctx.beginPath();
    let startedB = false;
    for (let k = 0; k < Mom; k++) {
      const w = cached.om[k];
      if (w < -PI || w > PI) continue;
      const mag = cached.mag[k] / maxMag;
      const xF = cx + (w / PI) * flatHalfW;
      const yF = flatCy - mag * hScale;
      if (!startedB) { ctx.moveTo(xF, yF); startedB = true; }
      else ctx.lineTo(xF, yF);
    }
    ctx.stroke();
  } else {
    // ─── OYNUYOR: morph (linear blend) ──────
    ctx.beginPath();
    let started = false;
    for (let k = 0; k < Mom; k++) {
      const w = cached.om[k];
      if (w < -PI || w > PI) continue;
      const mag = cached.mag[k] / maxMag;
      const p3 = proj(Math.cos(w) * r0, Math.sin(w) * r0, mag * hScale, cy3D);
      const xF = cx + (w / PI) * flatHalfW;
      const yF = flatCy - mag * hScale;
      const sx = p3.sx * (1 - tA) + xF * tA;
      const sy = p3.sy * (1 - tA) + yF * tA;
      if (!started) { ctx.moveTo(sx, sy); started = true; }
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // === Düz mod ekseni ve etiketleri ===
  // Duruyorken her zaman tam görünür
  const flatAxisVisible = !animPlaying || tA > 0.05;
  if (flatAxisVisible) {
    const fAl = animPlaying ? tA : 1;
    ctx.strokeStyle = `rgba(100,140,255,${0.45 * fAl})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - flatHalfW, flatCy);
    ctx.lineTo(cx + flatHalfW, flatCy);
    ctx.stroke();
    // Tick'ler -π, -π/2, 0, +π/2, +π
    ctx.fillStyle = `rgba(255,209,102,${0.85 * fAl})`;
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.textAlign = 'center';
    const ticks = [
      ['−π', -1], ['−π/2', -0.5], ['0', 0], ['+π/2', 0.5], ['+π', 1]
    ];
    for (const [lab, fr] of ticks) {
      const x = cx + fr * flatHalfW;
      ctx.fillRect(x - 0.6, flatCy - 4, 1.4, 8);
      ctx.fillText(lab, x, flatCy + 16);
    }
    // y ekseni etiketi
    ctx.fillStyle = `rgba(180,190,220,${0.6 * fAl})`;
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('|X(e^{jω})|', cx - flatHalfW - 5, flatCy - hScale * 0.5);
  }

  // === İmleç ===
  const wm = ((markerOmega + PI) % TWO_PI + TWO_PI) % TWO_PI - PI;
  const evalRes = evalDTFTat(xCached, wm);
  const magM = evalRes.mag / maxMag;

  // 3D imleç pozisyonu
  const p3M = proj(Math.cos(wm) * r0, Math.sin(wm) * r0, magM * hScale, cy3D);
  const p3B = proj(Math.cos(wm) * r0, Math.sin(wm) * r0, 0, cy3D);

  // Düz imleç pozisyonu
  const xFM = cx + (wm / PI) * flatHalfW;
  const yFM = flatCy - magM * hScale;

  const drawMarkerAt = (bx, by, sx, sy, omTag) => {
    // Dikey indikatör
    ctx.strokeStyle = 'rgba(255,79,154,0.55)'; ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.setLineDash([]);
    // Zemin noktası
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, TWO_PI); ctx.fill();
    // Tepe
    ctx.fillStyle = '#ff4f9a'; ctx.shadowColor = '#ff4f9a'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(sx, sy, 5.5, 0, TWO_PI); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, TWO_PI); ctx.fill();
    // ω etiketi
    ctx.fillStyle = '#ffd166';
    ctx.font = '11px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(omTag, bx, by - 8);
  };

  if (!animPlaying) {
    // İki imleç de çizilir
    drawMarkerAt(p3B.sx, p3B.sy, p3M.sx, p3M.sy, `ω=${(wm/PI).toFixed(2)}π`);
    drawMarkerAt(xFM, flatCy, xFM, yFM, `ω=${(wm/PI).toFixed(2)}π`);
  } else {
    // Blend
    const mSx = p3M.sx * (1 - tA) + xFM * tA;
    const mSy = p3M.sy * (1 - tA) + yFM * tA;
    const mBx = p3B.sx * (1 - tA) + xFM * tA;
    const mBy = p3B.sy * (1 - tA) + flatCy * tA;
    drawMarkerAt(mBx, mBy, mSx, mSy, `ω=${(wm/PI).toFixed(2)}π`);
  }

  // === Anim durum etiketi (sol alt) ===
  ctx.fillStyle = 'rgba(180,190,220,0.5)';
  ctx.font = '9px Consolas, monospace';
  ctx.textAlign = 'left';
  const phaseLabel = tA < 0.05 ? '3D · birim çember'
                    : tA > 0.95 ? '2D · ω düzlemi'
                    : (animT < 0.5 ? '↓ kesim/açılma...' : '↑ sarılma...');
  ctx.fillText(`◉ anim: ${phaseLabel}`, 8, H - 6);

  ui.markerRO.textContent = `ω = ${wm.toFixed(3)} (= ${(wm/PI).toFixed(3)}π) · |X|=${evalRes.mag.toFixed(3)} · ∠X=${evalRes.pha.toFixed(3)}`;
}

// Sürekli animasyon döngüsü (sadece UC paneli)
function animLoop() {
  const now = performance.now();
  const dt = (now - lastAnimMs) / 1000;
  lastAnimMs = now;
  if (animPlaying) {
    animT = (animT + dt / 6) % 1;   // 6 saniyelik tam döngü
  }
  if (cached) renderUC();
  animRAF = requestAnimationFrame(animLoop);
}

function renderMag() {
  const s = prep(cvMag);
  s.ctx.clearRect(0, 0, s.w, s.h);
  const xMin = -omRange * PI, xMax = omRange * PI;
  let yArr;
  let yMin, yMax;
  if (magMode === 'db') {
    let mx = 0;
    for (let i = 0; i < cached.mag.length; i++) if (cached.mag[i] > mx) mx = cached.mag[i];
    if (mx < 1e-12) mx = 1;
    yArr = new Float64Array(cached.mag.length);
    for (let i = 0; i < cached.mag.length; i++) {
      yArr[i] = cached.mag[i] > 1e-6 ? 20 * Math.log10(cached.mag[i] / mx) : -80;
    }
    yMin = -60; yMax = 5;
  } else {
    yArr = cached.mag;
    let mx = 0;
    for (let i = 0; i < yArr.length; i++) if (yArr[i] > mx) mx = yArr[i];
    if (mx < 1e-12) mx = 1;
    yMin = -mx * 0.08; yMax = mx * 1.15;
  }

  drawGrid(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax);

  // Periyodiklik vurgusu: [-π, π] dışında olanlar farklı tonla
  if (periodHL) {
    s.ctx.fillStyle = 'rgba(255,209,102,0.06)';
    const xLeft = ((-PI - xMin) / (xMax - xMin)) * s.w;
    const xRight = ((PI - xMin) / (xMax - xMin)) * s.w;
    s.ctx.fillRect(xLeft, 0, xRight - xLeft, s.h);

    s.ctx.strokeStyle = 'rgba(255,209,102,0.6)';
    s.ctx.lineWidth = 1.2;
    s.ctx.setLineDash([5, 4]);
    s.ctx.beginPath(); s.ctx.moveTo(xLeft, 0); s.ctx.lineTo(xLeft, s.h); s.ctx.stroke();
    s.ctx.beginPath(); s.ctx.moveTo(xRight, 0); s.ctx.lineTo(xRight, s.h); s.ctx.stroke();
    s.ctx.setLineDash([]);
    s.ctx.fillStyle = '#ffd166';
    s.ctx.font = '10px Consolas, monospace';
    s.ctx.textAlign = 'center';
    s.ctx.fillText('temel periyot [−π, +π]', (xLeft + xRight)/2, 12);
  }

  drawAxes(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, xLabelsOmega);

  // Eğri
  drawCurve(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, cached.om, yArr, '#ff8c42', 2.0);

  // İmleç
  drawMarker(s.ctx, s.w, s.h, xMin, xMax, markerOmega, '#ff4f9a');

  // ω = 0 değeri
  const ev0 = evalDTFTat(xCached, 0);
  ui.magRO.textContent = `|X(0)| = ${ev0.mag.toFixed(3)}`;
}

function h2y(v, yMin, yMax, h) { return h - ((v - yMin) / (yMax - yMin)) * h; }

function renderAll() {
  recomputeAll();
  renderXn();
  renderUC();
  renderMag();
  updateReadouts();
}

// ============================================
// İMLEÇ ETKİLEŞİMİ (Mag canvas üzerinde)
// ============================================
let dragging = false;
function omFromCanvasX(e) {
  const rect = cvMag.getBoundingClientRect();
  const px = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  const xMin = -omRange * PI, xMax = omRange * PI;
  return xMin + (px / rect.width) * (xMax - xMin);
}
function omFromUC(e) {
  const rect = cvUC.getBoundingClientRect();
  const px = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  const py = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
  // Düz mod tıklaması: alt yarıda ise ω = (x - cx) / flatHalfW * π
  // 3D mod tıklaması: cy3D etrafında polar açı
  const cx = rect.width / 2;
  const flatCy = rect.height * 0.86;
  const cy3D = rect.height * 0.40;
  const flatHalfW = Math.min(rect.width * 0.42, 320);
  // Alt yarıya yakın tıklama → düz mod yorumla
  if (Math.abs(py - flatCy) < rect.height * 0.18) {
    let omg = ((px - cx) / flatHalfW) * PI;
    return Math.max(-PI, Math.min(PI, omg));
  }
  // Aksi takdirde 3D çember için polar açı (cy3D etrafında)
  const dx = px - cx, dy = cy3D - py;
  return Math.atan2(dy, dx);
}
cvMag.addEventListener('mousedown', e => {
  dragging = true;
  markerOmega = omFromCanvasX(e);
  syncMarker();
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  markerOmega = omFromCanvasX(e);
  syncMarker();
});
window.addEventListener('mouseup', () => { dragging = false; });
cvMag.addEventListener('touchstart', e => {
  dragging = true;
  markerOmega = omFromCanvasX(e); syncMarker();
  e.preventDefault();
}, { passive: false });
cvMag.addEventListener('touchmove', e => {
  if (!dragging) return;
  markerOmega = omFromCanvasX(e); syncMarker();
  e.preventDefault();
}, { passive: false });
cvMag.addEventListener('touchend', () => { dragging = false; });

let draggingUC = false;
cvUC.addEventListener('mousedown', e => {
  if (animPlaying) {
    // Animasyon oynarken: imleç ω'sını ayarla
    draggingUC = true;
    markerOmega = omFromUC(e); syncMarker();
  } else {
    // Durmuş: 3D görünümü döndür
    isRotating = true;
    rotStartX = e.clientX;
    rotStartY = e.clientY;
    rotStartYaw = viewYaw;
    rotStartPitch = viewPitch;
    cvUC.style.cursor = 'grabbing';
  }
});
window.addEventListener('mousemove', e => {
  if (draggingUC) {
    markerOmega = omFromUC(e); syncMarker();
  } else if (isRotating) {
    const rect = cvUC.getBoundingClientRect();
    const dx = (e.clientX - rotStartX) / rect.width;
    const dy = (e.clientY - rotStartY) / rect.height;
    viewYaw   = rotStartYaw + dx * Math.PI * 1.5;
    viewPitch = Math.max(-0.05, Math.min(1.45, rotStartPitch + dy * Math.PI * 1.0));
    if (cached) renderUC();
  }
});
window.addEventListener('mouseup', () => {
  draggingUC = false;
  if (isRotating) {
    isRotating = false;
    cvUC.style.cursor = animPlaying ? 'crosshair' : 'grab';
  }
});

function syncMarker() {
  ui.markerSlider.value = markerOmega;
  ui.markerVal.textContent = markerOmega.toFixed(2);
  renderUC();
  renderMag();
}

function drawingActiveCanvas() { return signalType === 'freehand' ? cvXn : null; }

// ============================================
// FREEHAND
// ============================================
function getXnPos(e) {
  const rect = cvXn.getBoundingClientRect();
  const cx = e.clientX ?? e.touches?.[0]?.clientX;
  const cy = e.clientY ?? e.touches?.[0]?.clientY;
  const xPx = cx - rect.left, yPx = cy - rect.top;
  const len = nMax - nMin + 1;
  const idx = Math.round((xPx / rect.width) * (len - 1));
  const yNorm = 1 - (yPx / rect.height);
  const a = (yNorm - 0.5) * 3;
  return { idx, amp: a };
}
function fhPlot(idx, ampV) {
  const len = nMax - nMin + 1;
  if (drawn.length !== len) drawn = new Float64Array(len);
  if (prevIdx < 0 || prevIdx === idx) {
    if (idx >= 0 && idx < len) drawn[idx] = ampV;
  } else {
    const s = Math.min(prevIdx, idx), e = Math.max(prevIdx, idx);
    const a0 = prevIdx < idx ? prevAmp : ampV, a1 = prevIdx < idx ? ampV : prevAmp;
    const span = e - s;
    for (let i = s; i <= e; i++) {
      if (i < 0 || i >= len) continue;
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
cvXn.addEventListener('touchstart', e => {
  if (signalType !== 'freehand') return;
  drawing = true; prevIdx = -1;
  const p = getXnPos(e); fhPlot(p.idx, p.amp);
  renderAll(); e.preventDefault();
}, { passive: false });
cvXn.addEventListener('touchmove', e => {
  if (!drawing || signalType !== 'freehand') return;
  const p = getXnPos(e); fhPlot(p.idx, p.amp);
  renderAll(); e.preventDefault();
}, { passive: false });
cvXn.addEventListener('touchend', () => { drawing = false; prevIdx = -1; });

ui.drawClear.addEventListener('click', () => {
  drawn = new Float64Array(nMax - nMin + 1);
  renderAll();
});
ui.drawSmooth.addEventListener('click', () => {
  const len = drawn.length;
  const s = new Float64Array(len);
  for (let i = 1; i < len - 1; i++) s[i] = (drawn[i-1] + drawn[i] + drawn[i+1]) / 3;
  s[0] = drawn[0]; s[len-1] = drawn[len-1];
  drawn = s; renderAll();
});
ui.drawNormalize.addEventListener('click', () => {
  let mx = 0;
  for (let i = 0; i < drawn.length; i++) mx = Math.max(mx, Math.abs(drawn[i]));
  if (mx > 0) for (let i = 0; i < drawn.length; i++) drawn[i] /= mx;
  renderAll();
});

// ============================================
// UI OLAYLARI
// ============================================
function updateVisibility() {
  const isFree = signalType === 'freehand';
  ui.freehandControls.style.display = isFree ? 'flex' : 'none';
  cvXn.classList.toggle('draw-active', isFree);
  cvXn.classList.toggle('freehand-active', isFree);

  const showWidth = ['rect','triangle','step','cosine','sine','modCos','sinc'].includes(signalType);
  ui.widthGroup.style.display = showWidth ? 'block' : 'none';

  ui.aGroup.style.display = (signalType === 'expDec') ? 'block' : 'none';
  ui.omega0Group.style.display = ['cosine','sine','modCos','sinc'].includes(signalType) ? 'block' : 'none';
}

function updateReadouts() {
  ui.ampVal.textContent = amp.toFixed(2);
  ui.widthVal.textContent = width;
  ui.aVal.textContent = aExp.toFixed(2);
  ui.omega0Val.textContent = `${(omega0/PI).toFixed(2)}π`;
  ui.omRangeVal.textContent = `±${omRange}π`;
  ui.omSampVal.textContent = omSamp;
  ui.markerVal.textContent = markerOmega.toFixed(2);
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);
  ui.canvasHeightVal.textContent = ui.canvasHeight.value;
  ui.nRangeRO.textContent = `n ∈ [${nMin}, ${nMax}]`;
  ui.xnHint.textContent = signalType === 'freehand' ? '✏️ fare ile çiz (örnek başına 1)' : 'önset · işaret tipi seçili';
}

function onSignalChange() {
  signalType = ui.signalType.value;
  amp = parseFloat(ui.ampSlider.value);
  width = parseInt(ui.widthSlider.value);
  aExp = parseFloat(ui.aSlider.value);
  omega0 = parseFloat(ui.omega0Slider.value);
  updateVisibility();
  renderAll();
}

function onAxisChange() {
  omRange = parseFloat(ui.omRangeSlider.value);
  omSamp = parseInt(ui.omSampSlider.value);
  ui.markerSlider.min = (-omRange * PI).toFixed(5);
  ui.markerSlider.max = ( omRange * PI).toFixed(5);
  if (markerOmega < -omRange * PI) markerOmega = -omRange * PI;
  if (markerOmega >  omRange * PI) markerOmega =  omRange * PI;
  renderAll();
}

function onDisplayChange() {
  periodHL = ui.periodHL.checked;
  magMode = ui.magMode.value;
  gridAlpha = parseFloat(ui.gridAlpha.value);
  renderAll();
}

ui.signalType.addEventListener('change', onSignalChange);
[ui.ampSlider, ui.widthSlider, ui.aSlider, ui.omega0Slider].forEach(el => el.addEventListener('input', onSignalChange));
[ui.omRangeSlider, ui.omSampSlider].forEach(el => el.addEventListener('input', onAxisChange));
[ui.periodHL, ui.magMode, ui.gridAlpha].forEach(el => {
  el.addEventListener('input', onDisplayChange);
  el.addEventListener('change', onDisplayChange);
});
ui.markerSlider.addEventListener('input', () => {
  markerOmega = parseFloat(ui.markerSlider.value);
  ui.markerVal.textContent = markerOmega.toFixed(2);
  renderUC(); renderMag();
});

ui.applyN.addEventListener('click', () => {
  const mn = parseInt(ui.nMinInput.value), mx = parseInt(ui.nMaxInput.value);
  if (isNaN(mn) || isNaN(mx) || mn >= mx) return;
  nMin = mn; nMax = mx;
  drawn = new Float64Array(nMax - nMin + 1);
  renderAll();
});

ui.canvasHeight.addEventListener('input', () => {
  const h = parseInt(ui.canvasHeight.value);
  ui.canvasHeightVal.textContent = h;
  document.querySelectorAll('.dtft-grid canvas').forEach(c => {
    if (c.id === 'cvUC') c.style.height = Math.max(h, 320) * 1.6 + 'px';   // UC paneli daha yüksek
    else c.style.height = h + 'px';
  });
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
// PLAY / STOP & 3D RESET BUTONLARI
// ============================================
function updateAnimButton() {
  if (!ui.animToggle) return;
  ui.animToggle.textContent = animPlaying ? '⏸ Stop' : '▶ Play';
  if (ui.ucHint) {
    ui.ucHint.textContent = animPlaying
      ? 'animasyon oynar · imleç için çember/eksen tıkla'
      : 'STOP — sürükle: 3D döndür (yaw + pitch)';
  }
  if (cvUC) cvUC.style.cursor = animPlaying ? 'crosshair' : 'grab';
}
if (ui.animToggle) {
  ui.animToggle.addEventListener('click', () => {
    animPlaying = !animPlaying;
    updateAnimButton();
  });
}
if (ui.animReset) {
  ui.animReset.addEventListener('click', () => {
    viewYaw = 0;
    viewPitch = 0.55;
    if (cached) renderUC();
  });
}

initBg();
updateVisibility();
renderAll();
// Sürekli birim çember animasyonunu başlat
lastAnimMs = performance.now();
animLoop();
updateAnimButton();
