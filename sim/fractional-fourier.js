/* ============================================
   FRACTIONAL FOURIER — Optik (2D) & Sinyal (1D)
   ============================================
   - 1D Ozaktas–Kutay ayrık FrFT (chirp–FFT–chirp)
   - 2D ayrılabilir FrFT (önce satır, sonra sütun)
   - El çizimi 2D harf → 3 mercek düzlemi
   - 1D sinyal kütüphanesi + chirp + el çizimi + müzik
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
// ---------------------------------------------
//  KÜÇÜK KARMAŞIK SAYI / FFT KÜTÜPHANESİ
// ---------------------------------------------
function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

/**
 * Iteratif radix-2 FFT (in-place). re/im uzunlukları 2^k olmalı.
 * dir = +1 (ileri), -1 (geri, ölçek 1/N harici).
 */
function fft(re, im, dir = 1) {
  const N = re.length;
  if ((N & (N - 1)) !== 0) throw new Error('FFT length must be power of 2');
  // bit-tersine permütasyon
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = dir * (-2 * Math.PI / len);
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < N; i += len) {
      let cRe = 1, cIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tRe = cRe * re[b] - cIm * im[b];
        const tIm = cRe * im[b] + cIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] = re[a] + tRe;
        im[a] = im[a] + tIm;
        const nRe = cRe * wRe - cIm * wIm;
        const nIm = cRe * wIm + cIm * wRe;
        cRe = nRe; cIm = nIm;
      }
    }
  }
}

/** İleri FFT (kopya döndürür). */
function FFT(re, im) {
  const N = re.length;
  const M = nextPow2(N);
  const R = new Float64Array(M), I = new Float64Array(M);
  for (let i = 0; i < N; i++) { R[i] = re[i]; I[i] = im[i] || 0; }
  fft(R, I, 1);
  return { re: R, im: I, M };
}

/** Ters FFT (1/N ölçekli). */
function iFFT(re, im) {
  const N = re.length;
  const R = re.slice(), I = im.slice();
  fft(R, I, -1);
  const inv = 1 / N;
  for (let i = 0; i < N; i++) { R[i] *= inv; I[i] *= inv; }
  return { re: R, im: I };
}

// ---------------------------------------------
//  AYRIK 1D FRACTIONAL FOURIER (Ozaktas–Kutay tarzı)
// ---------------------------------------------
/**
 * frft1d(xRe, xIm, a)
 *  - xRe, xIm: aynı uzunlukta (en iyisi 2^k); fizik aralığı [-Δx/2, Δx/2]
 *  - a       : kesirli sıra ∈ [-2, 2] periyodik
 *  - dönüş   : { re, im } (aynı uzunlukta)
 *
 * Kullanılan formül (eğitim için sadeleştirilmiş):
 *  α  = a   (-2..2 modüler)
 *  φ  = α·π/2
 *  cot φ ve csc φ singüler olan α∈{0, ±2} durumları analitik özel-durum.
 *  |α| < 0.5 ya da |α-2| < 0.5 olduğunda iki adımlı kompozisyon kullanılır:
 *      F^α = F^(α-1) · F^1   (tek chirp katmanı + FFT)
 */
const TWOPI = 2 * Math.PI;
const SQRT_2PI = Math.sqrt(TWOPI);

function frft1d(xRe, xIm, a) {
  const N = xRe.length;
  // α'yı [-2, 2] aralığına indirgey
  let alpha = ((a % 4) + 4) % 4;       // [0,4)
  if (alpha > 2) alpha -= 4;            // (-2, 2]

  // ---- Özel durumlar ----
  if (Math.abs(alpha) < 1e-6) {
    // F^0 = I
    return { re: Float64Array.from(xRe), im: Float64Array.from(xIm) };
  }
  if (Math.abs(alpha - 2) < 1e-6) {
    // F^2 = parity (x(-t))
    const reO = new Float64Array(N), imO = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      reO[i] = xRe[N - 1 - i];
      imO[i] = xIm[N - 1 - i];
    }
    return { re: reO, im: imO };
  }
  if (Math.abs(alpha + 2) < 1e-6) {
    return frft1d(xRe, xIm, 2);
  }
  // Ana iç bölge: chirp-FFT-chirp tek geçişte stabildir.
  // (Boundary discontinuity'sini ortadan kaldırmak için tüm aralığı tek formülle kapatıyoruz.)
  return frftCore(xRe, xIm, alpha);
}

/**
 * frftCore: 1D ayrık FrFT — Ozaktas-Kutay chirp-FFT-chirp (α-bağımlı ızgara).
 *
 * Sürekli FrFT'ın enerji koruyan ayrıklaştırması.
 *   Δt = √(2π·|sin φ|/N),   Δu = Δt   (output u-ekseni α ile ölçeklenir)
 *   X_α[m] = (A_φ · Δt) · exp(j·π·k²·c/N) · DFT_±{ exp(j·π·n²·c/N)·x[n] }[m]
 *   A_φ·Δt = exp(j·sgn(s)·π/4 − j·φ/2) / √N   (unitary)
 *
 * Parseval: ||F^α x||² = ||x||²  (tam korunur, |sin φ| > 0 için).
 * Karmaşıklık: O(N log N).
 *
 * NOT: α-bağımlı ızgara, çıktı u-ekseninin α ile ölçeklenmesine yol açar.
 * Bu yüzden 2D optik görselde α≈0 civarında "Fresnel-benzeri" yumuşak
 * geçiş elde etmek için imshow tarafında giriş yoğunluğu ile harmanlama
 * yapılır (computeOpticPlanes içinde).
 */
function frftCore(xRe, xIm, alpha) {
  const N = xRe.length;
  const phi = alpha * Math.PI / 2;
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  if (Math.abs(s) < 1e-9) {
    return { re: Float64Array.from(xRe), im: Float64Array.from(xIm) };
  }
  const sign = s >= 0 ? 1 : -1;
  const half = N >> 1;

  // 1) Pre-chirp: y[n] = exp(j·π·k²·c/N) · x[n],   k = n − N/2
  const yRe = new Float64Array(N), yIm = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const k = n - half;
    const ph = Math.PI * k * k * c / N;
    const cp = Math.cos(ph), sp = Math.sin(ph);
    const xr = xRe[n], xi = xIm[n];
    yRe[n] = xr * cp - xi * sp;
    yIm[n] = xr * sp + xi * cp;
  }

  // 2) DFT (fftshift)
  const ysRe = new Float64Array(N), ysIm = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    ysRe[n] = yRe[(n + half) % N];
    ysIm[n] = yIm[(n + half) % N];
  }
  let F;
  if (sign > 0) {
    F = FFT(ysRe, ysIm);
  } else {
    F = iFFT(ysRe, ysIm);
    for (let i = 0; i < N; i++) { F.re[i] *= N; F.im[i] *= N; }
  }
  const zRe = new Float64Array(N), zIm = new Float64Array(N);
  for (let m = 0; m < N; m++) {
    zRe[m] = F.re[(m + half) % N];
    zIm[m] = F.im[(m + half) % N];
  }

  // 3) Post-chirp × (A_φ · Δt)
  const Aang = sign * Math.PI / 4 - phi / 2;
  const Amag = 1 / Math.sqrt(N);
  const ARe = Amag * Math.cos(Aang);
  const AIm = Amag * Math.sin(Aang);

  const outRe = new Float64Array(N), outIm = new Float64Array(N);
  for (let m = 0; m < N; m++) {
    const k = m - half;
    const ph = Math.PI * k * k * c / N;
    const cp = Math.cos(ph), sp = Math.sin(ph);
    const mRe = ARe * cp - AIm * sp;
    const mIm = ARe * sp + AIm * cp;
    const r = zRe[m], i = zIm[m];
    outRe[m] = mRe * r - mIm * i;
    outIm[m] = mRe * i + mIm * r;
  }
  return { re: outRe, im: outIm };
}

/** F^1 (klasik Fourier, Ozaktas çerçevesi içinde normalize) */
function frftCore_F1(xRe, xIm) {
  const N = xRe.length;
  // basit DFT eşdeğeri: u_n ↔ DFT, ardından merkezlendirilmiş
  // burada şu eşdeğeri kullanıyoruz: F^1{x}[k] = IFFT-shift(FFT(FFT-shift(x))) / sqrt(N)
  const shRe = new Float64Array(N), shIm = new Float64Array(N);
  const half = N >> 1;
  for (let i = 0; i < N; i++) {
    shRe[i] = xRe[(i + half) % N];
    shIm[i] = xIm[(i + half) % N];
  }
  const X = FFT(shRe, shIm);
  const outRe = new Float64Array(N), outIm = new Float64Array(N);
  const norm = 1 / Math.sqrt(N);
  for (let i = 0; i < N; i++) {
    const k = (i + half) % N; // tekrar shift
    outRe[i] = X.re[k] * norm;
    outIm[i] = X.im[k] * norm;
  }
  return { re: outRe, im: outIm };
}
function frftCore_Fm1(xRe, xIm) {
  const N = xRe.length;
  const shRe = new Float64Array(N), shIm = new Float64Array(N);
  const half = N >> 1;
  for (let i = 0; i < N; i++) {
    shRe[i] = xRe[(i + half) % N];
    shIm[i] = xIm[(i + half) % N];
  }
  const X = iFFT(shRe, shIm);
  // iFFT 1/N ölçekli; biz 1/sqrt(N) istiyoruz
  const outRe = new Float64Array(N), outIm = new Float64Array(N);
  const k0 = Math.sqrt(N); // çarpan
  for (let i = 0; i < N; i++) {
    const k = (i + half) % N;
    outRe[i] = X.re[k] * k0;
    outIm[i] = X.im[k] * k0;
  }
  return { re: outRe, im: outIm };
}

// ---------------------------------------------
//  2D AYRILABILIR FRACTIONAL FOURIER
// ---------------------------------------------
/**
 * frft2d: 2D ayrık FrFT — önce satırlar, sonra sütunlar boyunca 1D FrFT.
 * gRe, gIm: NxN Float64Array, satır-major (i*N + j).
 */
function frft2d(gRe, gIm, alpha) {
  const N = Math.round(Math.sqrt(gRe.length));
  // satır boyunca
  const tRe = new Float64Array(N * N), tIm = new Float64Array(N * N);
  const rowR = new Float64Array(N), rowI = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      rowR[j] = gRe[i * N + j];
      rowI[j] = gIm[i * N + j];
    }
    const r = frft1d(rowR, rowI, alpha);
    for (let j = 0; j < N; j++) {
      tRe[i * N + j] = r.re[j];
      tIm[i * N + j] = r.im[j];
    }
  }
  // sütun boyunca
  const oRe = new Float64Array(N * N), oIm = new Float64Array(N * N);
  const colR = new Float64Array(N), colI = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      colR[i] = tRe[i * N + j];
      colI[i] = tIm[i * N + j];
    }
    const r = frft1d(colR, colI, alpha);
    for (let i = 0; i < N; i++) {
      oRe[i * N + j] = r.re[i];
      oIm[i * N + j] = r.im[i];
    }
  }
  return { re: oRe, im: oIm };
}

// ---------------------------------------------
//  TEMA / DOM YARDIMCILARI
// ---------------------------------------------
const $ = (id) => document.getElementById(id);

function cssVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

function prep(cv, hCss) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = r.width;
  const h = hCss || r.height;
  // Buffer (pixel grid) — yüksek DPI için ölçekli
  cv.width = w * dpr;
  cv.height = h * dpr;
  // CSS boyutunu da açıkça sabitle — aksi takdirde canvas.height
  // attribute'u displayed height olarak yorumlanıp flex layout'u
  // büyütebilir (pusula canvas'ının her redraw'da büyümesi gibi).
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, ctx };
}

// ---------------------------------------------
//  ====================================
//   2D OPTİK SAHNE
//  ====================================
// ---------------------------------------------
const Optic = {
  N: 128,
  draw: {
    canvas: null, ctx: null,
    drawing: false,
    last: null,
    brush: 5,
  },
  buf: null,       // Float64Array NxN (giriş yoğunluğu)
  midCanvas: null,
  focalCanvas: null,
  alpha: 0.5,
  showMode: 'mag',
  focalLog: false,  // odak düzleminde logaritmik ölçek (default off)
  scratch: { re: null, im: null },
  needsRefresh: true,
  rafQueued: false,
};

function opticBufferReset() {
  Optic.buf = new Float64Array(Optic.N * Optic.N);
  Optic.scratch.re = new Float64Array(Optic.N * Optic.N);
  Optic.scratch.im = new Float64Array(Optic.N * Optic.N);
}

function clearDrawCanvas() {
  Optic.draw.ctx.save();
  Optic.draw.ctx.setTransform(1, 0, 0, 1, 0, 0);
  // clearRect → CSS gradient background görünür
  Optic.draw.ctx.clearRect(0, 0, Optic.draw.canvas.width, Optic.draw.canvas.height);
  Optic.draw.ctx.restore();
  opticBufferReset();
  scheduleOpticRefresh();
}

function setupDrawCanvas() {
  const cv = $('canvasDraw');
  Optic.draw.canvas = cv;
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr;
  cv.height = r.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  Optic.draw.ctx = ctx;
  clearDrawCanvas();

  const pos = (ev) => {
    const r = cv.getBoundingClientRect();
    if (ev.touches && ev.touches[0]) {
      return { x: ev.touches[0].clientX - r.left, y: ev.touches[0].clientY - r.top };
    }
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const start = (ev) => { ev.preventDefault(); Optic.draw.drawing = true; Optic.draw.last = pos(ev); };
  const move = (ev) => {
    if (!Optic.draw.drawing) return;
    ev.preventDefault();
    const p = pos(ev);
    const ctx = Optic.draw.ctx;
    ctx.strokeStyle = '#ffffff';
    if (document.body.classList.contains('light-theme')) ctx.strokeStyle = '#000000';
    ctx.lineWidth = Optic.draw.brush;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(Optic.draw.last.x, Optic.draw.last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    Optic.draw.last = p;
    rasterizeDrawingToBuffer();
    scheduleOpticRefresh();
  };
  const end = (ev) => { Optic.draw.drawing = false; Optic.draw.last = null; };

  cv.addEventListener('mousedown', start);
  cv.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  cv.addEventListener('touchstart', start, { passive: false });
  cv.addEventListener('touchmove', move, { passive: false });
  cv.addEventListener('touchend', end);
}

// Çizim kanvasını NxN gri-tonlamalı yoğunluk haritasına döker
function rasterizeDrawingToBuffer() {
  const cv = Optic.draw.canvas;
  const lightMode = document.body.classList.contains('light-theme');
  // küçük ofscreen
  const off = document.createElement('canvas');
  off.width = Optic.N; off.height = Optic.N;
  const octx = off.getContext('2d');
  // CSS gradient'i atla — yalnızca çizgi pikselleri istiyoruz.
  // Dark tema: çizgiler beyaz → siyah arkaplana koy, gri tonlama parlaklık ver.
  // Light tema: çizgiler siyah → beyaz arkaplana koy, sonra 1-v ile ters çevir.
  octx.fillStyle = lightMode ? '#ffffff' : '#000000';
  octx.fillRect(0, 0, Optic.N, Optic.N);
  octx.drawImage(cv, 0, 0, Optic.N, Optic.N);
  const img = octx.getImageData(0, 0, Optic.N, Optic.N).data;
  for (let i = 0; i < Optic.N * Optic.N; i++) {
    const r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2];
    let v = (r + g + b) / (3 * 255);
    if (lightMode) v = 1 - v;
    Optic.buf[i] = v;
  }
}

// Preset harfler / şekiller
function drawPresetA() {
  const ctx = Optic.draw.ctx;
  clearDrawCanvas();
  const r = Optic.draw.canvas.getBoundingClientRect();
  const w = r.width, h = r.height;
  ctx.strokeStyle = '#fff';
  if (document.body.classList.contains('light-theme')) ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(4, Optic.draw.brush);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.85);
  ctx.lineTo(w * 0.5, h * 0.18);
  ctx.lineTo(w * 0.7, h * 0.85);
  ctx.moveTo(w * 0.37, h * 0.6);
  ctx.lineTo(w * 0.63, h * 0.6);
  ctx.stroke();
  rasterizeDrawingToBuffer();
  scheduleOpticRefresh();
}
function drawPresetF() {
  const ctx = Optic.draw.ctx;
  clearDrawCanvas();
  const r = Optic.draw.canvas.getBoundingClientRect();
  const w = r.width, h = r.height;
  ctx.strokeStyle = '#fff';
  if (document.body.classList.contains('light-theme')) ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(4, Optic.draw.brush);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.35, h * 0.15);
  ctx.lineTo(w * 0.35, h * 0.85);
  ctx.moveTo(w * 0.35, h * 0.15);
  ctx.lineTo(w * 0.7, h * 0.15);
  ctx.moveTo(w * 0.35, h * 0.48);
  ctx.lineTo(w * 0.62, h * 0.48);
  ctx.stroke();
  rasterizeDrawingToBuffer();
  scheduleOpticRefresh();
}
function drawPresetSquare() {
  const ctx = Optic.draw.ctx;
  clearDrawCanvas();
  const r = Optic.draw.canvas.getBoundingClientRect();
  const w = r.width, h = r.height;
  ctx.fillStyle = '#fff';
  if (document.body.classList.contains('light-theme')) ctx.fillStyle = '#000';
  ctx.fillRect(w * 0.35, h * 0.35, w * 0.3, h * 0.3);
  rasterizeDrawingToBuffer();
  scheduleOpticRefresh();
}
function drawPresetDots() {
  const ctx = Optic.draw.ctx;
  clearDrawCanvas();
  const r = Optic.draw.canvas.getBoundingClientRect();
  const w = r.width, h = r.height;
  ctx.fillStyle = '#fff';
  if (document.body.classList.contains('light-theme')) ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(w * 0.4, h * 0.5, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.6, h * 0.5, 7, 0, Math.PI * 2); ctx.fill();
  rasterizeDrawingToBuffer();
  scheduleOpticRefresh();
}

// 2D çıktıyı renkli (jet/hot benzeri) bir paletle kanvasa basar
function imshow(canvas, dataRe, dataIm, mode, N) {
  const cv = canvas;
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // değerleri çıkar
  const total = N * N;
  const buf = new Float64Array(total);
  if (mode === 're') {
    for (let i = 0; i < total; i++) buf[i] = dataRe[i];
  } else if (mode === 'log') {
    for (let i = 0; i < total; i++) {
      const mag = Math.hypot(dataRe[i], dataIm[i]);
      buf[i] = Math.log10(mag + 1e-4);
    }
  } else {
    for (let i = 0; i < total; i++) buf[i] = Math.hypot(dataRe[i], dataIm[i]);
  }

  // min/max
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < total; i++) {
    const v = buf[i];
    if (!isFinite(v)) continue;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!isFinite(mn) || mn === mx) { mn = 0; mx = 1; }

  // FFT-shift: low frequency centered for α=1 görüntülerde estetik
  // (üst-üste binmiş, döngüsel kayma)
  const halfN = N >> 1;
  // resmi oluştur (NxN imageData)
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const v = (buf[i * N + j] - mn) / (mx - mn || 1);
      const ci = (i * N + j) * 4;
      const rgb = colormapHot(v);
      img.data[ci] = rgb[0];
      img.data[ci + 1] = rgb[1];
      img.data[ci + 2] = rgb[2];
      img.data[ci + 3] = 255;
    }
  }
  // ekranı temizle
  ctx.fillStyle = document.body.classList.contains('light-theme') ? '#f6f7fb' : '#04040a';
  ctx.fillRect(0, 0, r.width, r.height);
  // küçük resmi büyüt
  // ImageData boyutunu doğrudan çizemediğimiz için ofscreen canvas:
  const tmp = document.createElement('canvas');
  tmp.width = N; tmp.height = N;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, r.width, r.height);
}

// "Hot" benzeri colormap (siyah → kırmızı → sarı → beyaz)
function colormapHot(v) {
  v = Math.max(0, Math.min(1, v));
  // basit segmentler
  const r = Math.min(1, v * 2.5);
  const g = Math.max(0, Math.min(1, v * 2.5 - 0.7));
  const b = Math.max(0, Math.min(1, v * 2.5 - 1.5));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function scheduleOpticRefresh() {
  if (Optic.rafQueued) return;
  Optic.rafQueued = true;
  requestAnimationFrame(() => {
    Optic.rafQueued = false;
    computeOpticPlanes();
  });
}

function computeOpticPlanes() {
  if (!Optic.buf) return;
  const N = Optic.N;
  const reIn = new Float64Array(N * N);
  const imIn = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) reIn[i] = Optic.buf[i];

  // Ara düzlem (z = α·f): saf F^α{f} (teoriye uygun)
  const alpha = Optic.alpha;
  const mid = frft2d(reIn, imIn, alpha);
  imshow(Optic.midCanvas, mid.re, mid.im, Optic.showMode, N);

  // Odak düzlemi α=1: klasik Fourier (FFT'li hızlı yol)
  const focal = computeFocalPlane(reIn, imIn, N);
  imshow(Optic.focalCanvas, focal.re, focal.im, Optic.focalLog ? 'log' : 'mag', N);

  drawOpticSchematic();
}

function computeFocalPlane(reIn, imIn, N) {
  // Satır FFT
  const tRe = new Float64Array(N * N), tIm = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    const rowR = new Float64Array(N), rowI = new Float64Array(N);
    for (let j = 0; j < N; j++) { rowR[j] = reIn[i * N + j]; rowI[j] = imIn[i * N + j]; }
    const fr = FFT(rowR, rowI);
    for (let j = 0; j < N; j++) { tRe[i * N + j] = fr.re[j]; tIm[i * N + j] = fr.im[j]; }
  }
  // Sütun FFT
  const oRe = new Float64Array(N * N), oIm = new Float64Array(N * N);
  for (let j = 0; j < N; j++) {
    const colR = new Float64Array(N), colI = new Float64Array(N);
    for (let i = 0; i < N; i++) { colR[i] = tRe[i * N + j]; colI[i] = tIm[i * N + j]; }
    const fc = FFT(colR, colI);
    for (let i = 0; i < N; i++) { oRe[i * N + j] = fc.re[i]; oIm[i * N + j] = fc.im[i]; }
  }
  // shift center (fftshift)
  const half = N >> 1;
  const sRe = new Float64Array(N * N), sIm = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const ii = (i + half) % N;
      const jj = (j + half) % N;
      sRe[ii * N + jj] = oRe[i * N + j];
      sIm[ii * N + jj] = oIm[i * N + j];
    }
  }
  return { re: sRe, im: sIm };
}

// Optik şema: mercek + iki düzlem + α işaretçisi
function drawOpticSchematic() {
  const cv = $('opticCanvas');
  const p = prep(cv);
  const ctx = p.ctx;
  ctx.clearRect(0, 0, p.w, p.h);
  const cy = p.h / 2;
  const padL = 30, padR = 30;
  const x0 = padL;
  const xLens = padL + (p.w - padL - padR) * 0.30;
  const xFocal = padL + (p.w - padL - padR);

  // Eksenler (ışın taşıyıcı çizgi)
  ctx.strokeStyle = cssVar('--text-dim', '#7a82a6');
  ctx.lineWidth = 0.6;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(xFocal, cy); ctx.stroke();
  ctx.setLineDash([]);

  // Giriş düzlemi
  ctx.strokeStyle = cssVar('--color-y', '#7b8cff');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, cy - 22); ctx.lineTo(x0, cy + 22); ctx.stroke();

  // Mercek (yatık elips)
  ctx.strokeStyle = cssVar('--accent-1', '#39ff85');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(xLens, cy, 5, 32, 0, 0, Math.PI * 2);
  ctx.stroke();
  // mercek tepe okları (ince kenarlı)
  ctx.beginPath(); ctx.moveTo(xLens - 3, cy - 36); ctx.lineTo(xLens, cy - 32); ctx.lineTo(xLens + 3, cy - 36); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xLens - 3, cy + 36); ctx.lineTo(xLens, cy + 32); ctx.lineTo(xLens + 3, cy + 36); ctx.stroke();

  // odak düzlemi
  ctx.strokeStyle = cssVar('--accent-2', '#ff8c42');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(xFocal, cy - 22); ctx.lineTo(xFocal, cy + 22); ctx.stroke();

  // ara düzlem (α)
  const xMid = xLens + (xFocal - xLens) * Optic.alpha;
  ctx.strokeStyle = cssVar('--color-marker', '#ff4f9a');
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(xMid, cy - 28); ctx.lineTo(xMid, cy + 28); ctx.stroke();
  ctx.fillStyle = cssVar('--color-marker', '#ff4f9a');
  ctx.font = '11px Saira, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`z = ${Optic.alpha.toFixed(2)}·f`, xMid, cy - 40);

  // etiketler
  ctx.fillStyle = cssVar('--text-secondary', '#7a82a6');
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('giriş f(x,y)', x0, cy + 50);
  ctx.fillText('ince mercek', xLens, cy + 50);
  ctx.fillText('odak |F{f}|', xFocal, cy + 50);

  // ışın ipuçları
  ctx.strokeStyle = cssVar('--accent-1', '#39ff85');
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let dy = -16; dy <= 16; dy += 16) {
    ctx.beginPath();
    ctx.moveTo(x0, cy + dy);
    ctx.lineTo(xLens, cy + dy);
    ctx.lineTo(xFocal, cy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------
//  ====================================
//   1D SİNYAL TARAFI
//  ====================================
// ---------------------------------------------
const Sig = {
  N: 512,
  tmin: -4, tmax: 4,
  source: 'basic',
  basic: {
    type: 'gauss',
    amp: 1, freq: 2, shift: 0, width: 1.5, sigma: 0.5,
  },
  chirp: { f0: 1, k: 2, A: 1, sigma: 1.2 },
  drawn: null,        // Float64Array N
  draw1d: { canvas: null, ctx: null, drawing: false, last: null },
  audio: {
    buffer: null,     // AudioBuffer
    pcm: null,        // mono Float32Array
    sr: 0,
    start: 0,
    len: 0.5,
  },
  alpha: 0.5,
  // pre-allocated input buffers
  xRe: null,
  xIm: null,
  // last FrFT output
  YRe: null, YIm: null,
};

function buildBasicSignal() {
  const N = Sig.N;
  const t = new Float64Array(N);
  const y = new Float64Array(N);
  const dt = (Sig.tmax - Sig.tmin) / (N - 1);
  const b = Sig.basic;
  for (let i = 0; i < N; i++) {
    const tt = Sig.tmin + i * dt;
    t[i] = tt;
    const te = tt - b.shift;
    switch (b.type) {
      case 'cos': y[i] = b.amp * Math.cos(TWOPI * b.freq * te); break;
      case 'sin': y[i] = b.amp * Math.sin(TWOPI * b.freq * te); break;
      case 'rect': y[i] = Math.abs(te) <= b.width / 2 ? b.amp : 0; break;
      case 'tri': {
        const r = Math.abs(te);
        y[i] = r >= b.width / 2 ? 0 : b.amp * (1 - 2 * r / b.width);
        break;
      }
      case 'gauss': {
        const s = Math.max(b.sigma, 1e-3);
        y[i] = b.amp * Math.exp(-(te * te) / (2 * s * s));
        break;
      }
      case 'sinc': {
        const u = te / Math.max(b.width, 1e-6);
        if (Math.abs(u) < 1e-8) y[i] = b.amp;
        else y[i] = b.amp * Math.sin(Math.PI * u) / (Math.PI * u);
        break;
      }
      case 'dirac': {
        const eps = Math.max(dt * 1.5, 0.04);
        const r = Math.abs(te);
        y[i] = r >= eps ? 0 : b.amp * (1 - r / eps) / eps;
        break;
      }
      case 'expDec': {
        if (te < 0) y[i] = 0;
        else y[i] = b.amp * Math.exp(-Math.max(b.sigma, 1e-3) * te);
        break;
      }
      case 'square': {
        y[i] = b.amp * Math.sign(Math.sin(TWOPI * b.freq * te));
        break;
      }
      default: y[i] = 0;
    }
  }
  return { t, y };
}

function buildChirpSignal() {
  const N = Sig.N;
  const t = new Float64Array(N);
  const y = new Float64Array(N);
  const dt = (Sig.tmax - Sig.tmin) / (N - 1);
  const c = Sig.chirp;
  for (let i = 0; i < N; i++) {
    const tt = Sig.tmin + i * dt;
    t[i] = tt;
    const env = Math.exp(-(tt * tt) / (2 * c.sigma * c.sigma));
    const phase = TWOPI * (c.f0 * tt + 0.5 * c.k * tt * tt);
    y[i] = c.A * env * Math.cos(phase);
  }
  return { t, y };
}

function buildDrawnSignal() {
  const N = Sig.N;
  const t = new Float64Array(N);
  const y = new Float64Array(N);
  const dt = (Sig.tmax - Sig.tmin) / (N - 1);
  if (!Sig.drawn || Sig.drawn.length !== N) {
    Sig.drawn = new Float64Array(N);
  }
  for (let i = 0; i < N; i++) {
    t[i] = Sig.tmin + i * dt;
    y[i] = Sig.drawn[i];
  }
  return { t, y };
}

function buildAudioSignal() {
  const N = Sig.N;
  const t = new Float64Array(N);
  const y = new Float64Array(N);
  const dt = (Sig.tmax - Sig.tmin) / (N - 1);
  for (let i = 0; i < N; i++) t[i] = Sig.tmin + i * dt;
  if (!Sig.audio.pcm) return { t, y };
  const sr = Sig.audio.sr;
  const start = Math.floor(Sig.audio.start * sr);
  const lenSamples = Math.floor(Sig.audio.len * sr);
  const stride = Math.max(1, Math.floor(lenSamples / N));
  for (let i = 0; i < N; i++) {
    const k = start + i * stride;
    if (k < 0 || k >= Sig.audio.pcm.length) y[i] = 0;
    else y[i] = Sig.audio.pcm[k];
  }
  // pencere uçlarını yumuşat (Tukey)
  const taper = Math.max(2, Math.floor(N * 0.08));
  for (let i = 0; i < taper; i++) {
    const w = 0.5 - 0.5 * Math.cos(Math.PI * i / taper);
    y[i] *= w;
    y[N - 1 - i] *= w;
  }
  return { t, y };
}

function buildInput() {
  switch (Sig.source) {
    case 'chirp': return buildChirpSignal();
    case 'draw':  return buildDrawnSignal();
    case 'audio': return buildAudioSignal();
    case 'basic':
    default:      return buildBasicSignal();
  }
}

// ---- 1D plot ----
function drawPlot(canvasId, t, y, opts = {}) {
  const cv = $(canvasId);
  const p = prep(cv);
  const ctx = p.ctx;
  const bg = cssVar('--canvas-bg', 'rgba(4,4,18,0.5)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, p.w, p.h);

  const padL = 36, padR = 8, padT = 8, padB = 22;
  const W = p.w - padL - padR, H = p.h - padT - padB;

  let mn = opts.mn, mx = opts.mx;
  if (mn === undefined) {
    mn = Infinity; mx = -Infinity;
    for (let i = 0; i < y.length; i++) {
      const v = y[i];
      if (!isFinite(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!isFinite(mn)) { mn = -1; mx = 1; }
    if (mn === mx) { mn -= 0.5; mx += 0.5; }
    const pad = (mx - mn) * 0.12;
    mn -= pad; mx += pad;
  }
  const tmin = t[0], tmax = t[t.length - 1];
  const X = (tv) => padL + (tv - tmin) / (tmax - tmin) * W;
  const Y = (v) => padT + (1 - (v - mn) / (mx - mn)) * H;

  // grid
  ctx.strokeStyle = 'rgba(120,140,200,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const x = padL + i * W / 8;
    ctx.moveTo(x, padT); ctx.lineTo(x, padT + H);
  }
  for (let j = 0; j <= 4; j++) {
    const yy = padT + j * H / 4;
    ctx.moveTo(padL, yy); ctx.lineTo(padL + W, yy);
  }
  ctx.stroke();

  // eksen
  const axisColor = cssVar('--border-glow-strong', 'rgba(100,180,255,0.55)');
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  const y0 = Y(0);
  ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(padL + W, y0); ctx.stroke();

  // tick labels
  ctx.fillStyle = cssVar('--text-secondary', '#7a82a6');
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const tv = tmin + i * (tmax - tmin) / 4;
    ctx.fillText(tv.toFixed(1), padL + i * W / 4, padT + H + 14);
  }
  ctx.textAlign = 'right';
  for (let j = 0; j <= 2; j++) {
    const vv = mn + (1 - j / 2) * (mx - mn);
    ctx.fillText(vv.toFixed(2), padL - 4, padT + j * H / 2 + 4);
  }

  // curve
  ctx.strokeStyle = opts.color || cssVar('--accent-1', '#39ff85');
  ctx.lineWidth = opts.lw || 1.6;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < t.length; i++) {
    const v = y[i];
    if (!isFinite(v)) { started = false; continue; }
    const xp = X(t[i]), yp = Y(v);
    if (!started) { ctx.moveTo(xp, yp); started = true; }
    else ctx.lineTo(xp, yp);
  }
  ctx.stroke();

  // label
  if (opts.label) {
    ctx.fillStyle = cssVar('--text-dim', '#4a5070');
    ctx.font = '10px Saira, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(opts.label, padL + 4, padT + 12);
  }
}

function update1d() {
  const { t, y } = buildInput();
  // normalize for visualization (input pad)
  drawPlot('canvasInput', t, y, { color: cssVar('--color-y', '#7b8cff') });

  // FrFT
  const N = Sig.N;
  const xRe = new Float64Array(N), xIm = new Float64Array(N);
  for (let i = 0; i < N; i++) xRe[i] = y[i];
  const F = frft1d(xRe, xIm, Sig.alpha);

  // u-axis (frekansa benzer)
  const u = new Float64Array(N);
  // u_n = (n - N/2) * dx burada Δu ≈ Δt, görselleştirme için aynı [tmin,tmax]
  const du = (Sig.tmax - Sig.tmin) / (N - 1);
  for (let i = 0; i < N; i++) u[i] = Sig.tmin + i * du;

  const mag = new Float64Array(N);
  for (let i = 0; i < N; i++) mag[i] = Math.hypot(F.re[i], F.im[i]);

  drawPlot('canvasRe',  u, F.re, { color: cssVar('--accent-1', '#39ff85') });
  drawPlot('canvasIm',  u, F.im, { color: cssVar('--accent-2', '#ff8c42') });
  drawPlot('canvasMag', u, mag,  { color: cssVar('--color-marker', '#ff4f9a'), lw: 1.8 });

  Sig.YRe = F.re; Sig.YIm = F.im;
  drawAlphaRose();
}

// ---- alpha rose (kartezyen pusula) ----
function drawAlphaRose() {
  const cv = $('alphaRose');
  const p = prep(cv);
  const ctx = p.ctx;
  ctx.clearRect(0, 0, p.w, p.h);
  const cx = p.w / 2, cy = p.h / 2;
  const R = Math.min(p.w, p.h) * 0.38;

  // axes
  ctx.strokeStyle = cssVar('--border-glow-strong', 'rgba(100,180,255,0.5)');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); // t
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); // Ω
  ctx.stroke();
  // labels
  ctx.fillStyle = cssVar('--text-secondary', '#7a82a6');
  ctx.font = '11px "Fira Code", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('t  (α=0)', cx + R + 2, cy - 4);
  ctx.textAlign = 'center';
  ctx.fillText('Ω', cx - 8, cy - R - 2);
  ctx.fillText('(α=1)', cx - 8, cy - R + 12);

  // grid arcs
  ctx.strokeStyle = 'rgba(120,140,200,0.18)';
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * i / 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  // arc showing angle 0..φ
  const phi = Sig.alpha * Math.PI / 2;
  ctx.strokeStyle = cssVar('--accent-1', '#39ff85');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.3, 0, -phi, true);
  ctx.stroke();

  // current axis (rotated)
  ctx.strokeStyle = cssVar('--color-marker', '#ff4f9a');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - R * Math.cos(phi), cy + R * Math.sin(phi));
  ctx.lineTo(cx + R * Math.cos(phi), cy - R * Math.sin(phi));
  ctx.stroke();
  // arrow tip
  ctx.fillStyle = cssVar('--color-marker', '#ff4f9a');
  ctx.beginPath();
  const tipX = cx + R * Math.cos(phi);
  const tipY = cy - R * Math.sin(phi);
  ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
  ctx.fill();

  // φ label
  ctx.fillStyle = cssVar('--accent-2', '#ff8c42');
  ctx.font = '12px "Fira Code", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('φ = ' + (phi * 180 / Math.PI).toFixed(1) + '°', cx + R * 0.35, cy - R * 0.05);

  // info bar text
  const phiDeg = phi * 180 / Math.PI;
  const cosp = Math.cos(phi).toFixed(2);
  const sinp = Math.sin(phi).toFixed(2);
  const phiEl = $('alphaPhiV');
  const mixEl = $('alphaMix');
  if (phiEl) phiEl.textContent = phiDeg.toFixed(1) + '°';
  if (mixEl) mixEl.textContent = `t·${cosp} + Ω·${sinp}`;
}

// ---------------------------------------------
//  1D ÇİZİM PADİ
// ---------------------------------------------
function setupDraw1d() {
  // Çizim doğrudan x(t) (canvasInput) grafiği üstünde yapılır
  const cv = $('canvasInput');
  if (!cv) return;
  Sig.draw1d.canvas = cv;
  Sig.draw1d.ctx = cv.getContext('2d');

  Sig.drawn = new Float64Array(Sig.N);
  cv.style.cursor = 'crosshair';

  const pos = (ev) => {
    const r = cv.getBoundingClientRect();
    if (ev.touches && ev.touches[0]) {
      return { x: ev.touches[0].clientX - r.left, y: ev.touches[0].clientY - r.top };
    }
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  // y → değer dönüşümü: tepe = +1, taban = -1
  const valFromY = (y) => {
    const r = cv.getBoundingClientRect();
    return 1 - 2 * (y / r.height);
  };
  const idxFromX = (x) => {
    const r = cv.getBoundingClientRect();
    return Math.max(0, Math.min(Sig.N - 1, Math.floor(x / r.width * Sig.N)));
  };

  const stroke = (a, b) => {
    const ia = idxFromX(a.x), ib = idxFromX(b.x);
    const va = valFromY(a.y), vb = valFromY(b.y);
    const i0 = Math.min(ia, ib), i1 = Math.max(ia, ib);
    for (let i = i0; i <= i1; i++) {
      const f = (i1 === i0) ? 0 : (i - i0) / (i1 - i0);
      Sig.drawn[i] = va * (1 - f) + vb * f;
    }
    update1d();
  };

  const start = (ev) => {
    if (Sig.source !== 'draw') return;
    ev.preventDefault();
    Sig.draw1d.drawing = true;
    Sig.draw1d.last = pos(ev);
    stroke(Sig.draw1d.last, Sig.draw1d.last);
  };
  const move = (ev) => {
    if (!Sig.draw1d.drawing || Sig.source !== 'draw') return;
    ev.preventDefault();
    const p = pos(ev);
    stroke(Sig.draw1d.last, p);
    Sig.draw1d.last = p;
  };
  const end = () => { Sig.draw1d.drawing = false; Sig.draw1d.last = null; };

  cv.addEventListener('mousedown', start);
  cv.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  cv.addEventListener('touchstart', start, { passive: false });
  cv.addEventListener('touchmove', move, { passive: false });
  cv.addEventListener('touchend', end);
}

function drawDraw1dBackground() {
  // Çizim artık canvasInput üstüne entegre: arka planı update1d/drawPlot çiziyor.
  if (Sig.source === 'draw') update1d();
  return;
  /* eski stand-alone pad çizimi devre dışı: */
  // eslint-disable-next-line no-unreachable
  const cv = Sig.draw1d.canvas;
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  const ctx = Sig.draw1d.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // clearRect → CSS gradient görünür kalır
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.restore();
  // grid
  const mid = r.height / 2;
  ctx.strokeStyle = 'rgba(120,140,200,0.25)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, mid); ctx.lineTo(r.width, mid);
  ctx.stroke();
  // dikey hafif tik'ler
  ctx.strokeStyle = 'rgba(120,140,200,0.12)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 1; i < 8; i++) {
    const x = i * r.width / 8;
    ctx.moveTo(x, 0); ctx.lineTo(x, r.height);
  }
  ctx.stroke();
  // çizim sinyali
  ctx.strokeStyle = cssVar('--color-y', '#7b8cff');
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < Sig.N; i++) {
    const x = i / (Sig.N - 1) * r.width;
    const v = Sig.drawn ? Sig.drawn[i] : 0;
    const yp = (1 - (v + 1) / 2) * r.height;
    if (i === 0) ctx.moveTo(x, yp);
    else ctx.lineTo(x, yp);
  }
  ctx.stroke();
}

function clearDraw1d() {
  Sig.drawn = new Float64Array(Sig.N);
  drawDraw1dBackground();
  update1d();
}
function smoothDraw1d() {
  if (!Sig.drawn) return;
  const N = Sig.N;
  const out = new Float64Array(N);
  const k = 3;
  for (let i = 0; i < N; i++) {
    let s = 0, c = 0;
    for (let j = -k; j <= k; j++) {
      const ii = i + j;
      if (ii < 0 || ii >= N) continue;
      s += Sig.drawn[ii]; c++;
    }
    out[i] = s / c;
  }
  Sig.drawn = out;
  drawDraw1dBackground();
  update1d();
}

// ---------------------------------------------
//  MÜZİK YÜKLEME
// ---------------------------------------------
let audioCtxGlobal = null;
function getAudioCtx() {
  if (audioCtxGlobal) return audioCtxGlobal;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  audioCtxGlobal = new C();
  return audioCtxGlobal;
}

async function handleAudioFile(file) {
  const status = $('audioStatus');
  if (!file) return;
  status.textContent = 'yükleniyor…';
  try {
    const arr = await file.arrayBuffer();
    const ctx = getAudioCtx();
    if (!ctx) { status.textContent = 'AudioContext yok'; return; }
    const buf = await ctx.decodeAudioData(arr);
    // mono
    const ch = buf.numberOfChannels;
    const len = buf.length;
    const pcm = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) pcm[i] += d[i] / ch;
    }
    // normalize
    let maxAbs = 0;
    for (let i = 0; i < len; i++) if (Math.abs(pcm[i]) > maxAbs) maxAbs = Math.abs(pcm[i]);
    if (maxAbs > 0) for (let i = 0; i < len; i++) pcm[i] /= maxAbs;
    Sig.audio.buffer = buf;
    Sig.audio.pcm = pcm;
    Sig.audio.sr = buf.sampleRate;
    // slider güncelle
    const dur = buf.duration;
    const startSl = $('audioStart');
    startSl.disabled = false;
    startSl.min = 0;
    startSl.max = Math.max(0, dur - Sig.audio.len);
    startSl.step = Math.max(0.001, dur / 1000);
    startSl.value = 0;
    Sig.audio.start = 0;
    $('audioStartV').textContent = '0.00';
    status.textContent = `✓ ${file.name} · ${dur.toFixed(2)} sn · ${buf.sampleRate} Hz`;
    update1d();
  } catch (e) {
    status.textContent = 'Hata: ' + e.message;
  }
}

// ---------------------------------------------
//  UI bağlama
// ---------------------------------------------
function bindRange(input, valEl, key, parent, fmt = (v) => v.toFixed(2)) {
  input.addEventListener('input', () => {
    parent[key] = parseFloat(input.value);
    if (valEl) valEl.textContent = fmt(parent[key]);
    if (parent === Sig.basic || parent === Sig.chirp) update1d();
  });
}

function applyParamVisibility() {
  const t = Sig.basic.type;
  const showMap = {
    cos:   ['amp1d', 'freq1d', 'shift1d'],
    sin:   ['amp1d', 'freq1d', 'shift1d'],
    rect:  ['amp1d', 'shift1d', 'width1d'],
    tri:   ['amp1d', 'shift1d', 'width1d'],
    gauss: ['amp1d', 'shift1d', 'sigma1d'],
    sinc:  ['amp1d', 'shift1d', 'width1d'],
    dirac: ['amp1d', 'shift1d'],
    expDec:['amp1d', 'shift1d', 'sigma1d'],   // sigma = alpha (decay)
    square:['amp1d', 'freq1d', 'shift1d'],
  };
  const showSet = new Set(showMap[t] || []);
  document.querySelectorAll('#srcBasic .ctrl-row[data-param]').forEach(row => {
    const k = row.getAttribute('data-param');
    row.setAttribute('data-hidden', showSet.has(k) ? '0' : '1');
  });
}

function init() {
  // 2D scene
  Optic.midCanvas = $('canvasMid');
  Optic.focalCanvas = $('canvasFocal');
  opticBufferReset();
  setupDrawCanvas();
  drawPresetA();

  // optic alpha slider
  $('alpha2d').addEventListener('input', (e) => {
    Optic.alpha = parseFloat(e.target.value);
    $('alpha2dV').textContent = Optic.alpha.toFixed(2);
    $('alpha2dPill').textContent = 'α = ' + Optic.alpha.toFixed(2);
    $('midPlaneLabel').textContent = `z = α·f, α = ${Optic.alpha.toFixed(2)}`;
    scheduleOpticRefresh();
  });
  $('midShow').addEventListener('change', (e) => {
    Optic.showMode = e.target.value;
    scheduleOpticRefresh();
  });
  const focalLogCb = $('focalLog');
  if (focalLogCb) {
    focalLogCb.addEventListener('change', (e) => {
      Optic.focalLog = !!e.target.checked;
      scheduleOpticRefresh();
    });
  }
  $('grid2dN').addEventListener('change', (e) => {
    Optic.N = parseInt(e.target.value);
    opticBufferReset();
    rasterizeDrawingToBuffer();
    scheduleOpticRefresh();
  });
  $('brushSize').addEventListener('change', (e) => {
    Optic.draw.brush = parseInt(e.target.value);
  });
  $('clearDraw').addEventListener('click', clearDrawCanvas);
  $('presetA').addEventListener('click', drawPresetA);
  $('presetF').addEventListener('click', drawPresetF);
  $('presetSquare').addEventListener('click', drawPresetSquare);
  $('presetDots').addEventListener('click', drawPresetDots);

  // 1D source tabs
  document.querySelectorAll('#sourceTabs .source-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sourceTabs .source-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Sig.source = btn.dataset.src;
      ['Basic', 'Chirp', 'Draw', 'Audio'].forEach(s => {
        const sec = $('src' + s);
        if (sec) sec.setAttribute('data-hidden', s.toLowerCase() === Sig.source ? '0' : '1');
      });
      update1d();
    });
  });

  // Basic params
  $('basicType').addEventListener('change', e => {
    Sig.basic.type = e.target.value;
    applyParamVisibility();
    update1d();
  });
  bindRange($('amp1d'),   $('amp1dV'),   'amp',   Sig.basic);
  bindRange($('freq1d'),  $('freq1dV'),  'freq',  Sig.basic);
  bindRange($('shift1d'), $('shift1dV'), 'shift', Sig.basic);
  bindRange($('width1d'), $('width1dV'), 'width', Sig.basic);
  bindRange($('sigma1d'), $('sigma1dV'), 'sigma', Sig.basic);

  // t penceresi (basic + chirp ortak)
  const tminEl = $('tmin1d'), tmaxEl = $('tmax1d');
  const tminV = $('tmin1dV'), tmaxV = $('tmax1dV');
  if (tminEl) {
    tminEl.addEventListener('input', () => {
      let v = parseFloat(tminEl.value);
      if (v >= Sig.tmax - 0.5) v = Sig.tmax - 0.5;
      Sig.tmin = v;
      if (tminV) tminV.textContent = v.toFixed(2);
      update1d();
    });
  }
  if (tmaxEl) {
    tmaxEl.addEventListener('input', () => {
      let v = parseFloat(tmaxEl.value);
      if (v <= Sig.tmin + 0.5) v = Sig.tmin + 0.5;
      Sig.tmax = v;
      if (tmaxV) tmaxV.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
      update1d();
    });
  }

  applyParamVisibility();

  // Chirp
  bindRange($('chirpF0'),  $('chirpF0V'),  'f0',    Sig.chirp);
  bindRange($('chirpK'),   $('chirpKV'),   'k',     Sig.chirp);
  bindRange($('chirpA'),   $('chirpAV'),   'A',     Sig.chirp);
  bindRange($('chirpSig'), $('chirpSigV'), 'sigma', Sig.chirp);

  // Draw1d
  setupDraw1d();
  $('clearDraw1d').addEventListener('click', clearDraw1d);
  $('smoothDraw1d').addEventListener('click', smoothDraw1d);

  // Audio
  $('audioFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleAudioFile(f);
  });
  $('audioStart').addEventListener('input', e => {
    Sig.audio.start = parseFloat(e.target.value);
    $('audioStartV').textContent = Sig.audio.start.toFixed(2);
    if (Sig.source === 'audio') update1d();
  });
  $('audioLen').addEventListener('input', e => {
    Sig.audio.len = parseFloat(e.target.value);
    $('audioLenV').textContent = Sig.audio.len.toFixed(2);
    if (Sig.audio.buffer) {
      const dur = Sig.audio.buffer.duration;
      const sl = $('audioStart');
      sl.max = Math.max(0, dur - Sig.audio.len);
      if (Sig.audio.start > sl.max) {
        Sig.audio.start = sl.max;
        sl.value = sl.max;
        $('audioStartV').textContent = sl.max.toFixed(2);
      }
    }
    if (Sig.source === 'audio') update1d();
  });

  // α slider (1D)
  $('alpha1d').addEventListener('input', e => {
    Sig.alpha = parseFloat(e.target.value);
    $('alpha1dV').textContent = Sig.alpha.toFixed(3);
    const pill = $('alpha1dPill');
    if (pill) pill.textContent = 'α = ' + Sig.alpha.toFixed(2);
    update1d();
  });

  $('resetSignal').addEventListener('click', () => {
    Sig.basic = { type: 'gauss', amp: 1, freq: 2, shift: 0, width: 1.5, sigma: 0.5 };
    Sig.chirp = { f0: 1, k: 2, A: 1, sigma: 1.2 };
    Sig.alpha = 0.5;
    $('alpha1d').value = 0.5; $('alpha1dV').textContent = '0.500';
    const pill = $('alpha1dPill'); if (pill) pill.textContent = 'α = 0.50';
    $('basicType').value = 'gauss';
    ['amp1d', 'freq1d', 'shift1d', 'width1d', 'sigma1d'].forEach(id => {
      const def = { amp1d:1, freq1d:2, shift1d:0, width1d:1.5, sigma1d:0.5 }[id];
      $(id).value = def; $(id+'V').textContent = def.toFixed(2);
    });
    applyParamVisibility();
    update1d();
  });

  // tema değişimi
  const observer = new MutationObserver(() => {
    rasterizeDrawingToBuffer();
    scheduleOpticRefresh();
    drawDraw1dBackground();
    update1d();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // resize
  window.addEventListener('resize', () => {
    // çizim kanvası boyutu değiştiyse yeniden raster
    const cv = Optic.draw.canvas;
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const oldData = cv.toDataURL();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    Optic.draw.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const img = new Image();
    img.onload = () => {
      Optic.draw.ctx.drawImage(img, 0, 0, r.width, r.height);
      rasterizeDrawingToBuffer();
      scheduleOpticRefresh();
    };
    img.src = oldData;

    // 1D çizim canvasInput üstünde — update1d() zaten yeniden boyamayı yapar

    update1d();
    drawOpticSchematic();
  });

  // initial render
  update1d();
}

document.addEventListener('DOMContentLoaded', init);
