/* ============================================
   DCT ANALİZİ — Ses Sıkıştırma (v2)
   Tüm DCT türleri için FFT-tabanlı O(N log N)
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
// ── Canvas ──
const cvFull = document.getElementById('cvFull');
const cvOrig = document.getElementById('cvOrig');
const cvSym = document.getElementById('cvSym');
const cvCoef = document.getElementById('cvCoef');
const cvRecon = document.getElementById('cvRecon');

// ── UI ──
const ui = {
  fileInput: document.getElementById('fileInput'),
  micBtn: document.getElementById('micBtn'),
  statusMsg: document.getElementById('statusMsg'),
  stripInfo: document.getElementById('stripInfo'),
  targetSR: document.getElementById('targetSR'),
  cutStart: document.getElementById('cutStart'),
  cutStartVal: document.getElementById('cutStartVal'),
  cutLen: document.getElementById('cutLen'),
  cutLenVal: document.getElementById('cutLenVal'),
  playOrig: document.getElementById('playOrig'),
  playRecon: document.getElementById('playRecon'),
  stopAll: document.getElementById('stopAll'),
  dlRecon: document.getElementById('dlRecon'),
  dctType: document.getElementById('dctType'),
  keepSlider: document.getElementById('keepSlider'),
  keepVal: document.getElementById('keepVal'),
  threshMode: document.getElementById('threshMode'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  lineW: document.getElementById('lineW'),
  lineWVal: document.getElementById('lineWVal'),
  coefDisplay: document.getElementById('coefDisplay'),
  origInfo: document.getElementById('origInfo'),
  symInfo: document.getElementById('symInfo'),
  coefInfo: document.getElementById('coefInfo'),
  reconInfo: document.getElementById('reconInfo'),
  symFormula: document.getElementById('symFormula'),
  dctFormula: document.getElementById('dctFormula'),
  statTotal: document.getElementById('statTotal'),
  statKept: document.getElementById('statKept'),
  statRatio: document.getElementById('statRatio'),
  statRMSE: document.getElementById('statRMSE'),
  statSNR: document.getElementById('statSNR'),
  statTime: document.getElementById('statTime'),
};

// ── Durum ──
let audioCtx = null;
let audioBuffer = null;         // ham (orijinal SR)
let currentSampleRate = 16000;  // hedef SR (kullanıcı seçimi)
let xSegment = null;            // hedef SR'de kesilmiş parça (ham uzunluk)
let xPadded = null;             // pow2'ye pad edilmiş (DCT girişi)
let xSymmetric = null;
let dctCoefs = null;
let reconSignal = null;
let currentSource = null;
let isDraggingBar = false;
let mediaRecorder = null;
let recordedChunks = [];
let micStream = null;

let gridAlpha = 0.18;
let waveLineW = 1.0;
let coefDisplayMode = 'linear';
let dctType = 2;
let keepK = 1;
let threshMode = 'topK';

// MAX_SECONDS × max SR = 7 × 44100 = 308,700; pow2 = 524,288. Bunun 2N FFT = 1,048,576. Hala makul.
const MAX_SECONDS = 7;

// ============================================
// FFT — Cooley-Tukey radix-2
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
        const a = i + k, b = a + half;
        const tRe = wRe * re[b] - wIm * im[b];
        const tIm = wRe * im[b] + wIm * re[b];
        re[b] = re[a] - tRe; im[b] = im[a] - tIm;
        re[a] += tRe; im[a] += tIm;
        const tw = wRe * wRe0 - wIm * wIm0;
        wIm = wRe * wIm0 + wIm * wRe0;
        wRe = tw;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// ============================================
// DCT-II — FFT TABANLI O(N log N)
// 2N noktalı zero-pad FFT yöntemi (doğrulanmış)
// ============================================
// NOT: Bu fonksiyon N'in 2'nin kuvveti olmasını bekler (M = 2N tam pow2).
// processDCT bu koşulu sağlar (zero-pad ile).
function dctII(x) {
  const N = x.length;
  const M = 2 * N;
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  for (let n = 0; n < N; n++) re[n] = x[n];
  fft(re, im, M, false);
  const X = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const ang = -Math.PI * k / M;
    X[k] = Math.cos(ang) * re[k] - Math.sin(ang) * im[k];
  }
  return X;
}

// IDCT-II — FFT tabanlı (N pow2 varsayımı)
function idctII(X) {
  const N = X.length;
  const M = 2 * N;
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  re[0] = X[0];
  for (let k = 1; k < N; k++) {
    const ang = Math.PI * k / M;
    re[k] = X[k] * Math.cos(ang);
    im[k] = X[k] * Math.sin(ang);
  }
  for (let k = 1; k < N; k++) {
    re[M - k] = re[k];
    im[M - k] = -im[k];
  }
  fft(re, im, M, true);
  const x = new Float64Array(N);
  for (let n = 0; n < N; n++) x[n] = 2 * re[n];
  return x;
}

// ============================================
// DCT-I — FFT TABANLI
// y[0..N-1] = x, y[N..2N-3] = x[N-2..1]  (tam-sample simetri)
// 2(N-1) noktalı dizi → pow2'ye padding ile FFT
// X[k] = Re{FFT[k]} (DC'yi düzeltmek için ufak ek)
// ============================================
// DCT-I: N'in 2^k + 1 olmasını bekler → 2(N-1) tam pow2.
// processDCT bunu sağlar.
function dctI(x) {
  const N = x.length;
  if (N < 2) return new Float64Array(N);
  const M = 2 * (N - 1);
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  for (let i = 0; i < N; i++) re[i] = x[i];
  for (let i = 1; i < N - 1; i++) re[M - i] = x[i];
  fft(re, im, M, false);
  const X = new Float64Array(N);
  for (let k = 0; k < N; k++) X[k] = re[k];
  return X;
}

// IDCT-I — DCT-I kendi tersidir (skala faktörlü)
function idctI(X) {
  const N = X.length;
  if (N < 2) return new Float64Array(N);
  const M = 2 * (N - 1);
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  for (let i = 0; i < N; i++) re[i] = X[i];
  for (let i = 1; i < N - 1; i++) re[M - i] = X[i];
  fft(re, im, M, false);
  const x = new Float64Array(N);
  for (let n = 0; n < N; n++) x[n] = re[n] / (N - 1) * 0.5;
  return x;
}

// ============================================
// DCT-III — DCT-II'nin inverse versiyonu
// Matematiksel olarak DCT-III(x) = IDCT-II(x) * N / 2 (skalalı)
// Pratik: ileri DCT-III için DCT-II'nin tersini kullanırız → IDCT-II
// Geri için DCT-II
// ============================================
// DCT-III: N'in pow2 olmasını bekler (M = 2N)
function dctIII(x) {
  const N = x.length;
  const M = 2 * N;
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  re[0] = x[0];
  for (let k = 1; k < N; k++) {
    const ang = Math.PI * k / M;
    re[k] = x[k] * Math.cos(ang);
    im[k] = x[k] * Math.sin(ang);
  }
  for (let k = 1; k < N; k++) {
    re[M - k] = re[k];
    im[M - k] = -im[k];
  }
  fft(re, im, M, true);
  const X = new Float64Array(N);
  for (let n = 0; n < N; n++) X[n] = 2 * re[n];
  return X;
}

function idctIII(X) {
  // DCT-III'ün tersi = DCT-II
  return dctII(X);
}

// ============================================
// SİMETRİK UZATMA (görüntü amaçlı)
// ============================================
function symmetricExtend_II(x) {
  const N = x.length;
  const ext = new Float64Array(2 * N);
  for (let i = 0; i < N; i++) {
    ext[i] = x[i];
    ext[2 * N - 1 - i] = x[i];
  }
  return ext;
}
function symmetricExtend_I(x) {
  const N = x.length;
  const M = 2 * (N - 1);
  const ext = new Float64Array(M);
  for (let i = 0; i < N; i++) ext[i] = x[i];
  for (let i = 1; i < N - 1; i++) ext[N - 1 + i] = x[N - 1 - i];
  return ext;
}
function getSymmetric(x, type) {
  if (type === 1) return symmetricExtend_I(x);
  return symmetricExtend_II(x);
}

// ============================================
// ANTI-ALIASED DOWNSAMPLE
// Frekans alanında ideal LP + decimation
// ============================================
function antiAliasedDownsample(input, srIn, srOut) {
  if (srOut >= srIn) return input;  // upsample yok
  const N_in = input.length;

  // 1. Adım: input'u pow2'ye pad et, FFT
  const M = nextPow2(N_in);
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  for (let i = 0; i < N_in; i++) re[i] = input[i];
  fft(re, im, M, false);

  // 2. Adım: Nyquist üstü frekansları sıfırla (LP)
  // srIn'deki indeks i → frekans i*srIn/M Hz
  // Nyquist_out = srOut/2
  // Bin index_cutoff = (srOut/2) / (srIn/M) = srOut * M / (2 * srIn)
  const cutoffBin = Math.floor(srOut * M / (2 * srIn));
  // [cutoffBin+1, M-cutoffBin-1] aralığını sıfırla
  for (let k = cutoffBin + 1; k < M - cutoffBin; k++) {
    re[k] = 0; im[k] = 0;
  }

  // 3. Adım: IFFT → filtrelenmiş sinyal
  fft(re, im, M, true);

  // 4. Adım: Decimate (örnek atla)
  const ratio = srIn / srOut;
  const N_out = Math.floor(N_in / ratio);
  const out = new Float32Array(N_out);
  for (let i = 0; i < N_out; i++) {
    out[i] = re[Math.floor(i * ratio)];
  }
  return out;
}

// ============================================
// AUDIO CONTEXT
// ============================================
function getAudioContext(targetSR) {
  if (!audioCtx || (targetSR && audioCtx.sampleRate !== targetSR)) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: targetSR || undefined
      });
    } catch (_) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  return audioCtx;
}

// ============================================
// DOSYA YÜKLE
// ============================================
ui.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  ui.statusMsg.textContent = `Yükleniyor: ${file.name}...`;
  ui.statusMsg.className = 'status-msg';
  try {
    const arr = await file.arrayBuffer();
    // Dosyayı decode et — orijinal SR'de
    const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await tmpCtx.decodeAudioData(arr);
    onAudioReady(file.name);
  } catch (err) {
    ui.statusMsg.textContent = '✗ ' + err.message;
    ui.statusMsg.className = 'status-msg err';
  }
});

function onAudioReady(name) {
  const dur = audioBuffer.duration;
  const srOrig = audioBuffer.sampleRate;
  currentSampleRate = parseInt(ui.targetSR.value);
  ui.statusMsg.textContent = `✓ ${name} • ${dur.toFixed(2)}s • orijinal ${srOrig}Hz → hedef ${currentSampleRate}Hz`;
  ui.statusMsg.className = 'status-msg ok';

  ui.cutStart.disabled = false;
  ui.cutLen.disabled = false;
  ui.cutStart.max = Math.max(0, dur - 0.05);
  ui.cutStart.value = 0;
  // Max parça uzunluğu = min(dosya süresi, MAX_SECONDS)
  const maxLen = Math.min(dur, MAX_SECONDS);
  ui.cutLen.max = maxLen;
  ui.cutLen.value = Math.min(2, maxLen);

  ui.playOrig.disabled = false;
  ui.keepSlider.disabled = false;

  updateSliderDisplays();
  extractSegment();
  processDCT();
}

// ============================================
// MİKROFON KAYIT (durdurana kadar)
// ============================================
ui.micBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopMicRecording();
    return;
  }
  try {
    const targetSR = parseInt(ui.targetSR.value);
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: targetSR,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(micStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const arr = await blob.arrayBuffer();
      try {
        const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioBuffer = await tmpCtx.decodeAudioData(arr);
        onAudioReady('Mikrofon Kaydı');
      } catch (err) {
        ui.statusMsg.textContent = '✗ Decode hatası: ' + err.message;
        ui.statusMsg.className = 'status-msg err';
      }
      if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
      }
    };
    mediaRecorder.start();
    ui.micBtn.classList.add('recording');
    ui.micBtn.textContent = '⏹ Kaydı Durdur';
    ui.statusMsg.textContent = _t({tr: '● Kayıt yapılıyor... bitirmek için butona tekrar bas', en: '● Recording… press the button again to stop'});
    ui.statusMsg.className = 'status-msg';
  } catch (err) {
    ui.statusMsg.textContent = '✗ Mikrofon erişimi reddedildi: ' + err.message;
    ui.statusMsg.className = 'status-msg err';
  }
});

function stopMicRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  ui.micBtn.classList.remove('recording');
  ui.micBtn.textContent = '🎤 Kaydı Başlat';
}

// ============================================
// SEÇİMİ ÇIKAR (orijinal SR'den hedef SR'ye downsample)
// ============================================
function updateSliderDisplays() {
  ui.cutStartVal.textContent = parseFloat(ui.cutStart.value).toFixed(2);
  ui.cutLenVal.textContent = parseFloat(ui.cutLen.value).toFixed(2);
  ui.gridAlphaVal.textContent = parseFloat(ui.gridAlpha.value).toFixed(2);
  ui.lineWVal.textContent = parseFloat(ui.lineW.value).toFixed(1);
}

function extractSegment() {
  if (!audioBuffer) return;
  const srOrig = audioBuffer.sampleRate;
  const startSec = parseFloat(ui.cutStart.value);
  const lenSec = Math.min(parseFloat(ui.cutLen.value), MAX_SECONDS);
  const startIdx = Math.floor(startSec * srOrig);
  const lenIdx = Math.floor(lenSec * srOrig);
  const ch0 = audioBuffer.getChannelData(0);
  const end = Math.min(startIdx + lenIdx, ch0.length);
  let raw = new Float32Array(end - startIdx);
  if (audioBuffer.numberOfChannels >= 2) {
    const ch1 = audioBuffer.getChannelData(1);
    for (let i = 0; i < raw.length; i++) raw[i] = 0.5 * (ch0[startIdx + i] + ch1[startIdx + i]);
  } else {
    for (let i = 0; i < raw.length; i++) raw[i] = ch0[startIdx + i];
  }
  // Anti-aliased downsample to currentSampleRate
  currentSampleRate = parseInt(ui.targetSR.value);
  if (srOrig !== currentSampleRate) {
    xSegment = antiAliasedDownsample(raw, srOrig, currentSampleRate);
  } else {
    xSegment = raw;
  }
}

// ============================================
// ANA İŞLEM
// ============================================
function processDCT() {
  if (!xSegment) return;

  // DCT tipine göre uygun uzunluğa zero-pad:
  // DCT-II, III → N pow2 (M=2N pow2)
  // DCT-I → N = 2^k+1 (2(N-1) pow2)
  const rawN = xSegment.length;
  let N;
  if (dctType === 1) {
    // En yakın 2^k+1 (yukarı): 2^k >= rawN-1
    let p = 1;
    while (p < rawN - 1) p <<= 1;
    N = p + 1;
  } else {
    // En yakın pow2 (yukarı)
    N = nextPow2(rawN);
  }

  const x = new Float64Array(N);  // zero-pad
  for (let i = 0; i < rawN && i < N; i++) x[i] = xSegment[i];

  const t0 = performance.now();

  let X;
  if (dctType === 1) X = dctI(x);
  else if (dctType === 3) X = dctIII(x);
  else X = dctII(x);

  dctCoefs = X;
  // İşlemde kullanılan padded sinyali sakla (recon ve stats için)
  xPadded = x;
  const elapsedDCT = performance.now() - t0;

  // Simetrik uzatma (görüntü için) — padded sinyalden
  xSymmetric = getSymmetric(x, dctType);

  // Slider ayarla
  ui.keepSlider.max = N;
  let curK = parseInt(ui.keepSlider.value);
  if (curK > N || curK < 1) {
    curK = Math.max(1, Math.floor(N / 4));
    ui.keepSlider.value = curK;
  }
  keepK = curK;
  ui.keepVal.textContent = keepK;

  // Formülleri güncelle
  if (dctType === 1) {
    ui.dctFormula.textContent = '$X[k] = \\tfrac{1}{2}(x[0] + (-1)^k x[N{-}1]) + \\sum x[n]\\cos[\\pi k n/(N{-}1)]$';
    ui.symFormula.textContent = 'DCT-I: tam-sample simetri, period 2(N−1)';
  } else if (dctType === 3) {
    ui.dctFormula.textContent = '$X[k] = \\tfrac{1}{2}x[0] + \\sum x[n]\\cos[\\tfrac{\\pi}{N}(k+\\tfrac{1}{2})n]$';
    ui.symFormula.textContent = 'DCT-III: yarım-sample simetri';
  } else {
    ui.dctFormula.textContent = '$X[k] = \\sum x[n]\\cos[\\tfrac{\\pi}{N}(n+\\tfrac{1}{2})k]$';
    ui.symFormula.textContent = 'DCT-II: yarım-sample simetri, period 2N';
  }
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(ui.dctFormula, {delimiters:[{left:'$',right:'$',display:false}]});
      window.renderMathInElement(ui.symFormula, {delimiters:[{left:'$',right:'$',display:false}]});
    } catch (_) {}
  }

  reconstructAndStats();
  drawAll();

  const durSec = (rawN / currentSampleRate).toFixed(2);
  ui.origInfo.textContent = `${rawN}→${N} sample · ${currentSampleRate}Hz · ${durSec}s`;
  ui.statTime.textContent = `${elapsedDCT.toFixed(0)} ms`;
  ui.symInfo.textContent = `${xSymmetric.length} sample`;
  ui.coefInfo.textContent = `K = ${keepK} / ${N}`;
}

function reconstructAndStats() {
  if (!dctCoefs || !xPadded) return;
  const N = dctCoefs.length;

  // Tutulacak katsayıları seç
  const Xkept = new Float64Array(N);
  if (threshMode === 'firstK') {
    for (let k = 0; k < keepK && k < N; k++) Xkept[k] = dctCoefs[k];
  } else {
    const indices = Array.from({ length: N }, (_, i) => i);
    indices.sort((a, b) => Math.abs(dctCoefs[b]) - Math.abs(dctCoefs[a]));
    for (let i = 0; i < keepK && i < N; i++) {
      const idx = indices[i];
      Xkept[idx] = dctCoefs[idx];
    }
  }

  // Inverse DCT
  let x;
  if (dctType === 1) x = idctI(Xkept);
  else if (dctType === 3) x = idctIII(Xkept);
  else x = idctII(Xkept);

  reconSignal = x;

  // İstatistikler — padded sinyalle karşılaştır
  let rms_x = 0, rms_err = 0;
  for (let i = 0; i < N; i++) {
    rms_x += xPadded[i] * xPadded[i];
    const err = xPadded[i] - x[i];
    rms_err += err * err;
  }
  rms_x = Math.sqrt(rms_x / N);
  const rmse = Math.sqrt(rms_err / N);
  const snr = rms_x > 0 && rmse > 0 ? 20 * Math.log10(rms_x / rmse) : Infinity;
  const ratio = N / keepK;

  ui.statTotal.textContent = N;
  ui.statKept.textContent = keepK;
  ui.statRatio.textContent = ratio.toFixed(2) + ':1';
  ui.statRMSE.textContent = rmse.toExponential(2);
  ui.statSNR.textContent = (snr === Infinity ? '∞' : snr.toFixed(1)) + ' dB';
  ui.reconInfo.textContent = `RMSE = ${rmse.toExponential(2)} · SNR = ${snr === Infinity ? '∞' : snr.toFixed(1)} dB`;

  ui.playRecon.disabled = false;
  ui.dlRecon.disabled = false;
}

// ============================================
// ÇİZİM
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

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = `rgba(100,160,255,${gridAlpha})`;
  ctx.lineWidth = 0.7;
  for (let i = 1; i < 10; i++) {
    const x = (i / 10) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(100,140,255,0.3)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
}

function drawWaveform(ctx, w, h, data, color) {
  if (!data || data.length === 0) return;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  if (peak === 0) peak = 1;
  const y0 = h / 2;
  const yScale = (h / 2) * 0.9 / peak;

  ctx.strokeStyle = color;
  ctx.lineWidth = waveLineW;
  ctx.shadowColor = color;
  ctx.shadowBlur = 2;

  const samplesPerPx = Math.max(1, Math.floor(data.length / w));
  if (samplesPerPx <= 2) {
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = y0 - data[i] * yScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      const s = Math.floor((px / w) * data.length);
      const e = Math.min(data.length, Math.floor(((px + 1) / w) * data.length));
      let mn = 0, mx = 0;
      for (let i = s; i < e; i++) {
        if (data[i] < mn) mn = data[i];
        if (data[i] > mx) mx = data[i];
      }
      ctx.moveTo(px + 0.5, y0 - mx * yScale);
      ctx.lineTo(px + 0.5, y0 - mn * yScale);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function drawCoefs() {
  const s = prep(cvCoef);
  s.ctx.clearRect(0, 0, s.w, s.h);
  drawGrid(s.ctx, s.w, s.h);
  if (!dctCoefs) return;
  const N = dctCoefs.length;

  let keepMask = null;
  if (threshMode === 'topK') {
    keepMask = new Uint8Array(N);
    const indices = Array.from({ length: N }, (_, i) => i);
    indices.sort((a, b) => Math.abs(dctCoefs[b]) - Math.abs(dctCoefs[a]));
    for (let i = 0; i < keepK && i < N; i++) keepMask[indices[i]] = 1;
  }

  // Görüntü için stride — en fazla 500 stem
  const maxStems = 500;
  let stride = Math.max(1, Math.ceil(N / maxStems));
  if (N > 2000) stride = Math.max(stride, Math.ceil(N / 500));

  let maxMag = 0;
  for (let k = 0; k < N; k++) {
    const v = coefDisplayMode === 'log'
      ? (Math.abs(dctCoefs[k]) > 1e-12 ? Math.log10(Math.abs(dctCoefs[k])) : -12)
      : Math.abs(dctCoefs[k]);
    if (Math.abs(v) > maxMag) maxMag = Math.abs(v);
  }
  if (maxMag === 0) maxMag = 1;

  if (threshMode === 'firstK') {
    const xRight = (keepK / N) * s.w;
    s.ctx.fillStyle = 'rgba(255,140,66,0.13)';
    s.ctx.fillRect(0, 0, xRight, s.h);
    s.ctx.strokeStyle = 'rgba(255,140,66,0.6)';
    s.ctx.lineWidth = 1.5;
    s.ctx.setLineDash([5, 4]);
    s.ctx.beginPath(); s.ctx.moveTo(xRight, 0); s.ctx.lineTo(xRight, s.h); s.ctx.stroke();
    s.ctx.setLineDash([]);
  }

  const y0 = s.h / 2;
  const yScale = (s.h / 2) * 0.85 / maxMag;

  for (let k = 0; k < N; k += stride) {
    const x = (k / (N - 1)) * s.w;
    const v = coefDisplayMode === 'log'
      ? (Math.abs(dctCoefs[k]) > 1e-12 ? Math.log10(Math.abs(dctCoefs[k])) : -12)
      : dctCoefs[k];
    const y = y0 - v * yScale;
    const isKept = threshMode === 'firstK' ? (k < keepK) : (keepMask && keepMask[k] === 1);
    const color = isKept ? '#ff8c42' : 'rgba(255,140,66,0.25)';
    s.ctx.strokeStyle = color;
    s.ctx.fillStyle = color;
    s.ctx.lineWidth = isKept ? 1.6 : 0.8;
    s.ctx.beginPath(); s.ctx.moveTo(x, y0); s.ctx.lineTo(x, y); s.ctx.stroke();
    s.ctx.beginPath(); s.ctx.arc(x, y, isKept ? 2.2 : 1.4, 0, Math.PI * 2); s.ctx.fill();
  }

  s.ctx.fillStyle = 'rgba(180,190,220,0.6)';
  s.ctx.font = '10px Consolas, monospace';
  s.ctx.textAlign = 'center';
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * s.w;
    const k = Math.round((i / 10) * N);
    s.ctx.fillText('k=' + k, x, s.h - 2);
  }
  s.ctx.textAlign = 'right';
  s.ctx.fillStyle = 'rgba(180,190,220,0.5)';
  s.ctx.fillText(`her ${stride}'de bir gösteriliyor (N=${N})`, s.w - 5, 14);
}

// Tüm dosyayı çiz, seçili bölgeyi gölgeli göster
function drawFileStrip() {
  const s = prep(cvFull);
  s.ctx.clearRect(0, 0, s.w, s.h);
  drawGrid(s.ctx, s.w, s.h);
  if (!audioBuffer) {
    s.ctx.fillStyle = 'rgba(180,190,220,0.4)';
    s.ctx.font = '13px Consolas, monospace';
    s.ctx.textAlign = 'center';
    s.ctx.fillText(_t({tr: 'Ses dosyası yükleyin veya kayıt yapın', en: 'Upload an audio file or record one'}), s.w / 2, s.h / 2);
    return;
  }

  const ch0 = audioBuffer.getChannelData(0);
  const dur = audioBuffer.duration;

  // Tüm dalga formu (min/max peak)
  drawWaveform(s.ctx, s.w, s.h, ch0, '#39ff85');

  // Zaman ekseni etiketleri
  s.ctx.fillStyle = 'rgba(180,190,220,0.55)';
  s.ctx.font = '10px Consolas, monospace';
  s.ctx.textAlign = 'center';
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * s.w;
    const t = (i / 10) * dur;
    s.ctx.fillText(t.toFixed(2) + 's', x, s.h - 2);
  }

  // Seçili bölgeyi gölgeli göster
  const startSec = parseFloat(ui.cutStart.value);
  const lenSec = parseFloat(ui.cutLen.value);
  const x1 = (startSec / dur) * s.w;
  const x2 = ((startSec + lenSec) / dur) * s.w;
  s.ctx.fillStyle = 'rgba(255,79,154,0.18)';
  s.ctx.fillRect(x1, 0, x2 - x1, s.h);
  s.ctx.strokeStyle = 'rgba(255,79,154,0.75)';
  s.ctx.lineWidth = 1.5;
  s.ctx.setLineDash([4, 3]);
  s.ctx.beginPath();
  s.ctx.moveTo(x1, 0); s.ctx.lineTo(x1, s.h);
  s.ctx.moveTo(x2, 0); s.ctx.lineTo(x2, s.h);
  s.ctx.stroke();
  s.ctx.setLineDash([]);

  ui.stripInfo.textContent = `${startSec.toFixed(2)}s → ${(startSec + lenSec).toFixed(2)}s (${lenSec.toFixed(2)}s) / toplam ${dur.toFixed(2)}s`;
}

function drawAll() {
  drawFileStrip();

  const s1 = prep(cvOrig); s1.ctx.clearRect(0, 0, s1.w, s1.h);
  drawGrid(s1.ctx, s1.w, s1.h);
  if (xSegment) drawWaveform(s1.ctx, s1.w, s1.h, xSegment, '#39ff85');

  const s2 = prep(cvSym); s2.ctx.clearRect(0, 0, s2.w, s2.h);
  drawGrid(s2.ctx, s2.w, s2.h);
  if (xSymmetric) {
    drawWaveform(s2.ctx, s2.w, s2.h, xSymmetric, '#b490ff');
    if (xSegment) {
      const xMid = (xSegment.length / xSymmetric.length) * s2.w;
      s2.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      s2.ctx.lineWidth = 1;
      s2.ctx.setLineDash([4, 3]);
      s2.ctx.beginPath(); s2.ctx.moveTo(xMid, 0); s2.ctx.lineTo(xMid, s2.h); s2.ctx.stroke();
      s2.ctx.setLineDash([]);
      s2.ctx.fillStyle = 'rgba(180,190,220,0.6)';
      s2.ctx.font = '10px Consolas, monospace';
      s2.ctx.fillText('orijinal | ayna', xMid, 12);
    }
  }

  drawCoefs();

  const s4 = prep(cvRecon); s4.ctx.clearRect(0, 0, s4.w, s4.h);
  drawGrid(s4.ctx, s4.w, s4.h);
  if (reconSignal && xPadded) {
    drawWaveform(s4.ctx, s4.w, s4.h, xPadded, 'rgba(57,255,133,0.25)');
    drawWaveform(s4.ctx, s4.w, s4.h, reconSignal, '#7b8cff');
  }
}

// ============================================
// SES ÇALMA
// ============================================
function stopAll() {
  if (currentSource) {
    try { currentSource.stop(); } catch (_) {}
    currentSource = null;
  }
}

function playBuffer(data, sr) {
  stopAll();
  const f32 = data instanceof Float32Array ? data : Float32Array.from(data);
  const safe = new Float32Array(f32.length);
  for (let i = 0; i < f32.length; i++) safe[i] = Math.max(-0.99, Math.min(0.99, f32[i]));
  // Play context — keep separate to avoid SR conflicts
  const playCtx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = playCtx.createBuffer(1, safe.length, sr);
  buf.getChannelData(0).set(safe);
  const src = playCtx.createBufferSource();
  src.buffer = buf;
  src.connect(playCtx.destination);
  src.onended = () => {
    if (currentSource === src) currentSource = null;
    try { playCtx.close(); } catch (_) {}
  };
  src.start();
  currentSource = src;
}

ui.playOrig.addEventListener('click', () => { if (xSegment) playBuffer(xSegment, currentSampleRate); });
ui.playRecon.addEventListener('click', () => { if (reconSignal) playBuffer(reconSignal, currentSampleRate); });
ui.stopAll.addEventListener('click', stopAll);

// ============================================
// WAV İNDİR
// ============================================
function encodeWav(samples, sr) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  function wStr(o, s) { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
  wStr(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true);
  wStr(8, 'WAVE'); wStr(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wStr(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

ui.dlRecon.addEventListener('click', () => {
  if (!reconSignal) return;
  const blob = encodeWav(reconSignal, currentSampleRate);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'dct_reconstructed.wav';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ============================================
// TÜM DOSYA ŞERİDİ — SÜRÜKLEYEREK SEÇİM
// ============================================
let isSelectingFile = false;
let fileDragStartSec = 0;

function fileStripTimeFromX(clientX) {
  if (!audioBuffer) return 0;
  const rect = cvFull.getBoundingClientRect();
  const ratio = (clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(audioBuffer.duration, ratio * audioBuffer.duration));
}

function applyFileSelection() {
  // Slider'ları güncelle + parça yeniden çıkar + işle
  updateSliderDisplays();
  extractSegment();
  processDCT();
}

cvFull.addEventListener('mousedown', (e) => {
  if (!audioBuffer) return;
  isSelectingFile = true;
  fileDragStartSec = fileStripTimeFromX(e.clientX);
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!isSelectingFile || !audioBuffer) return;
  const tNow = fileStripTimeFromX(e.clientX);
  let start = Math.min(fileDragStartSec, tNow);
  let len = Math.abs(tNow - fileDragStartSec);
  len = Math.max(0.05, Math.min(len, MAX_SECONDS));
  // Dosya sonunu aşma
  if (start + len > audioBuffer.duration) start = Math.max(0, audioBuffer.duration - len);
  ui.cutStart.value = start;
  ui.cutLen.value = len;
  updateSliderDisplays();
  drawFileStrip();  // sürüklerken sadece şeridi güncelle (hafif)
});

window.addEventListener('mouseup', () => {
  if (isSelectingFile) {
    isSelectingFile = false;
    applyFileSelection();  // bırakınca DCT'yi yeniden hesapla
  }
});

// Dokunmatik
cvFull.addEventListener('touchstart', (e) => {
  if (!audioBuffer) return;
  isSelectingFile = true;
  fileDragStartSec = fileStripTimeFromX(e.touches[0].clientX);
  e.preventDefault();
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  if (!isSelectingFile || !audioBuffer) return;
  const tNow = fileStripTimeFromX(e.touches[0].clientX);
  let start = Math.min(fileDragStartSec, tNow);
  let len = Math.abs(tNow - fileDragStartSec);
  len = Math.max(0.05, Math.min(len, MAX_SECONDS));
  if (start + len > audioBuffer.duration) start = Math.max(0, audioBuffer.duration - len);
  ui.cutStart.value = start;
  ui.cutLen.value = len;
  updateSliderDisplays();
  drawFileStrip();
  e.preventDefault();
}, { passive: false });

window.addEventListener('touchend', () => {
  if (isSelectingFile) {
    isSelectingFile = false;
    applyFileSelection();
  }
});

// ============================================
// ÇUBUK SÜRÜKLEME — throttled
// ============================================
let pendingUpdate = false;
function scheduleUpdate() {
  if (pendingUpdate) return;
  pendingUpdate = true;
  requestAnimationFrame(() => {
    pendingUpdate = false;
    reconstructAndStats();
    drawAll();
  });
}

cvCoef.addEventListener('mousedown', (e) => {
  if (!dctCoefs) return;
  isDraggingBar = true;
  updateKFromMouse(e);
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!isDraggingBar) return;
  updateKFromMouse(e);
});
window.addEventListener('mouseup', () => { isDraggingBar = false; });

function updateKFromMouse(e) {
  if (!dctCoefs) return;
  const rect = cvCoef.getBoundingClientRect();
  const xPx = e.clientX - rect.left;
  const N = dctCoefs.length;
  let k = Math.round((xPx / rect.width) * N);
  k = Math.max(1, Math.min(N, k));
  if (k !== keepK) {
    keepK = k;
    ui.keepSlider.value = k;
    ui.keepVal.textContent = k;
    ui.coefInfo.textContent = `K = ${k} / ${N}`;
    scheduleUpdate();
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
ui.cutStart.addEventListener('input', () => {
  updateSliderDisplays();
  extractSegment();
  processDCT();
});
ui.cutLen.addEventListener('input', () => {
  updateSliderDisplays();
  extractSegment();
  processDCT();
});
ui.targetSR.addEventListener('change', () => {
  if (!audioBuffer) return;
  currentSampleRate = parseInt(ui.targetSR.value);
  extractSegment();
  processDCT();
});
ui.dctType.addEventListener('change', () => {
  dctType = parseInt(ui.dctType.value);
  processDCT();
});
ui.keepSlider.addEventListener('input', () => {
  keepK = parseInt(ui.keepSlider.value);
  ui.keepVal.textContent = keepK;
  if (dctCoefs) ui.coefInfo.textContent = `K = ${keepK} / ${dctCoefs.length}`;
  scheduleUpdate();
});
ui.threshMode.addEventListener('change', () => {
  threshMode = ui.threshMode.value;
  scheduleUpdate();
});
ui.gridAlpha.addEventListener('input', () => {
  gridAlpha = parseFloat(ui.gridAlpha.value);
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);
  drawAll();
});
ui.lineW.addEventListener('input', () => {
  waveLineW = parseFloat(ui.lineW.value);
  ui.lineWVal.textContent = waveLineW.toFixed(1);
  drawAll();
});
ui.coefDisplay.addEventListener('change', () => {
  coefDisplayMode = ui.coefDisplay.value;
  drawAll();
});

// ============================================
// ARKAPLAN
// ============================================
function initBg() {
  const c = document.getElementById('bgCanvas');
  const ctx = c.getContext('2d');
  function rs() { c.width = innerWidth; c.height = innerHeight; }
  rs(); window.addEventListener('resize', rs);
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

window.addEventListener('resize', drawAll);

initBg();
updateSliderDisplays();
drawAll();
