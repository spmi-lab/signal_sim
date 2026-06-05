/* ============================================
   RADYO SİMÜLASYONU
   - Dinamik kanallar (max 5)
   - Dosya yükle / mikrofon kayıt / region selection
   - Anti-aliasing LPF
   - DSB-SC modülasyon: s(t) = m(t) · cos(2π f_c t)
   - Composite + gürültü
   - Senkron demodülasyon (heterodyne):
       composite · cos(2π f_t t)  →  LPF(BW/2)  →  ses
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
const MAX_CHANNELS = 5;
const SR = 32000;          // TÜM zincir 32 kHz'de çalışır: ses örnekleme, composite, modülasyon, AudioContext.
                           // Nyquist = 16 kHz → kullanıcı 0-16 kHz spektrumu inceleyebilir.
const AUDIO_SR = SR;       // Eski ayrı isimler tek SR ile birleşti
const COLORS = ['#39ff85', '#ff8c42', '#7b8cff', '#ff4f9a', '#ffd23f'];

// === Global state ===
const STATE = {
  channels: [],            // { id, file, samplesOrig (Float32@SR), selStart, selEnd, sr, centerFreq, bandwidth, antiAlias, samplesProcessed (Float32 = m(t) after AA), samplesMod (= s(t)) }
  noiseLevel: 0.05,
  maxFreq: 16000,
  defaultBw: 800,
  loopDur: 10,
  composite: null,         // Float32Array (SR * loopDur)
  audioCtx: null,
  bufferSource: null,
  lo: null,                // Lokal osilatör (OscillatorNode @ tunerFreq)
  mixer: null,             // GainNode: gain.value=0, LO→gain.gain ile çarpıcı
  lpfs: null,              // 3 biquad cascade = 6. derece Butterworth LPF (cutoff = BW/2)
  gain: null,              // Volume gain
  playing: false,
  channelIdCounter: 0,
};

// === UI elements ===
const ui = {
  defaultBw: document.getElementById('defaultBw'),
  defaultBwVal: document.getElementById('defaultBwVal'),
  noiseLevel: document.getElementById('noiseLevel'),
  noiseLevelVal: document.getElementById('noiseLevelVal'),
  maxFreq: document.getElementById('maxFreq'),
  maxFreqVal: document.getElementById('maxFreqVal'),
  loopDur: document.getElementById('loopDur'),
  loopDurVal: document.getElementById('loopDurVal'),
  channelsList: document.getElementById('channelsList'),
  addChannelBtn: document.getElementById('addChannelBtn'),
  cvComposite: document.getElementById('cvComposite'),
  cvTowers: document.getElementById('cvTowers'),
  towerLegend: document.getElementById('towerLegend'),
  tunerFreq: document.getElementById('tunerFreq'),
  tunerFreqVal: document.getElementById('tunerFreqVal'),
  tunerBW: document.getElementById('tunerBW'),
  tunerBWVal: document.getElementById('tunerBWVal'),
  btnBroadcast: document.getElementById('btnBroadcast'),
  btnStopAll: document.getElementById('btnStopAll'),
  volume: document.getElementById('volume'),
  volumeVal: document.getElementById('volumeVal'),
  broadcastStatus: document.getElementById('broadcastStatus'),
};

// ============================================
// FFT (in-place complex)
// ============================================
function fft(re, im, n, inverse) {
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    let k = n >> 1; while (k <= j) { j -= k; k >>= 1; } j += k;
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, ang = (inverse ? 2 : -2) * Math.PI / len;
    const wRe0 = Math.cos(ang), wIm0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tRe = wRe * re[b] - wIm * im[b], tIm = wRe * im[b] + wIm * re[b];
        re[b] = re[a] - tRe; im[b] = im[a] - tIm;
        re[a] += tRe; im[a] += tIm;
        const tw = wRe * wRe0 - wIm * wIm0; wIm = wRe * wIm0 + wIm * wRe0; wRe = tw;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// ============================================
// Sinc LPF + FFT konvolüsyon
// ============================================
function sincLPF(cutoff, sr, M) {
  // M tek yapalım (lineer faz simetri için)
  if ((M & 1) === 0) M += 1;
  const fc = cutoff / sr;
  const h = new Float64Array(M);
  const mid = (M - 1) / 2;
  for (let n = 0; n < M; n++) {
    const k = n - mid;
    let v;
    if (k === 0) v = 2 * fc;
    else v = Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    // Hamming
    v *= 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (M - 1));
    h[n] = v;
  }
  // DC normalize
  let sum = 0; for (let n = 0; n < M; n++) sum += h[n];
  for (let n = 0; n < M; n++) h[n] /= sum;
  return h;
}

function fftConvolve(x, h) {
  const Lx = x.length, Lh = h.length;
  const Lout = Lx + Lh - 1;
  const N = nextPow2(Lout);
  const Xre = new Float64Array(N), Xim = new Float64Array(N);
  const Hre = new Float64Array(N), Him = new Float64Array(N);
  for (let i = 0; i < Lx; i++) Xre[i] = x[i];
  for (let i = 0; i < Lh; i++) Hre[i] = h[i];
  fft(Xre, Xim, N, false);
  fft(Hre, Him, N, false);
  for (let k = 0; k < N; k++) {
    const a = Xre[k], b = Xim[k], c = Hre[k], d = Him[k];
    Xre[k] = a * c - b * d; Xim[k] = a * d + b * c;
  }
  fft(Xre, Xim, N, true);
  const out = new Float32Array(Lx);
  const offset = Math.floor((Lh - 1) / 2);
  for (let i = 0; i < Lx; i++) out[i] = Xre[i + offset] || 0;
  return out;
}

// ============================================
// Resample (lineer enterpolasyon — sadece upsample için)
// ============================================
function resampleLinear(input, srIn, srOut) {
  if (srIn === srOut) return Float32Array.from(input);
  const ratio = srIn / srOut;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = idx - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

// Anti-aliasing filtreli downsample: FFT ile spektrumu Nyquist altına kes
// 44.1 kHz → 16 kHz gibi indirgemelerde aliasing'i önler
function antiAliasDownsample(input, srIn, srOut) {
  if (srOut >= srIn) return Float32Array.from(input);
  const N_in = input.length;
  const M = nextPow2(N_in);
  const re = new Float64Array(M), im = new Float64Array(M);
  for (let i = 0; i < N_in; i++) re[i] = input[i];
  fft(re, im, M, false);
  // Spektrumun srOut/2 (=Nyquist) üstünü sıfırla
  const cutoffBin = Math.floor(srOut * M / (2 * srIn));
  for (let k = cutoffBin + 1; k < M - cutoffBin; k++) { re[k] = 0; im[k] = 0; }
  fft(re, im, M, true);
  // Şimdi decimation
  const ratio = srIn / srOut;
  const N_out = Math.floor(N_in / ratio);
  const out = new Float32Array(N_out);
  for (let i = 0; i < N_out; i++) out[i] = re[Math.floor(i * ratio)] || 0;
  return out;
}

// ============================================
// Tema farkındalığı
// ============================================
function isLight() { return document.body.classList.contains('light-theme'); }
function themeColors() {
  const light = isLight();
  return {
    grid:    light ? 'rgba(40,70,170,0.20)' : 'rgba(120,160,255,0.15)',
    axis:    light ? 'rgba(20,40,140,0.6)'  : 'rgba(180,200,255,0.4)',
    text:    light ? '#0d1226' : '#e2e6f0',
    textDim: light ? '#3a4060' : '#7a82a6',
    bg:      light ? '#ffffff' : 'rgba(4,4,18,0.5)',
    // Dalga renkleriyle çakışmasın diye tema-uyumlu nötr ton:
    // dark → açık beyaz, light → koyu siyah; her ikisinde de tüm renk paletinden ayrışır
    selection: light ? 'rgba(20,30,60,0.18)' : 'rgba(255,255,255,0.18)',
    selectionBorder: light ? 'rgba(20,30,60,0.85)' : 'rgba(255,255,255,0.9)',
  };
}

// ============================================
// Kanal renkleri
// ============================================
function chColor(idx, light) {
  const dark = ['#39ff85', '#ff8c42', '#7b8cff', '#ff4f9a', '#ffd23f'];
  const lite = ['#0e6e2e', '#a8430a', '#2a3a9a', '#b01e6a', '#7a5800'];
  return (light ? lite : dark)[idx % 5];
}

// ============================================
// Canvas yardımcısı
// ============================================
function fit(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

function drawWave(ctx, w, h, data, color, options = {}) {
  if (!data || data.length === 0) {
    const C = themeColors();
    ctx.fillStyle = C.textDim;
    ctx.font = '11px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(options.empty || 'veri yok', w / 2, h / 2);
    return;
  }
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]); if (a > peak) peak = a;
  }
  if (peak === 0) peak = 1;
  const y0 = h / 2;
  const yScale = (h / 2) * 0.9 / peak;
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath();
  if (data.length <= w * 2) {
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = y0 - data[i] * yScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  } else {
    for (let px = 0; px < w; px++) {
      const s = Math.floor((px / w) * data.length);
      const e = Math.min(data.length, Math.floor(((px + 1) / w) * data.length));
      let mn = 0, mx = 0;
      for (let i = s; i < e; i++) { if (data[i] < mn) mn = data[i]; if (data[i] > mx) mx = data[i]; }
      ctx.moveTo(px + 0.5, y0 - mx * yScale);
      ctx.lineTo(px + 0.5, y0 - mn * yScale);
    }
  }
  ctx.stroke();
}

function drawGrid(ctx, w, h) {
  const C = themeColors();
  ctx.strokeStyle = C.grid; ctx.lineWidth = 0.6;
  for (let i = 1; i < 8; i++) {
    const x = (i / 8) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
}

// ============================================
// Spektrum hesabı (mag, log/lineer)
// ============================================
function computeSpectrum(data, sr) {
  const N = Math.min(8192, nextPow2(data.length));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = N;
  for (let i = 0; i < Math.min(data.length, N); i++) {
    // Hann window
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    re[i] = data[i] * w;
  }
  fft(re, im, N, false);
  const Nh = N / 2;
  const mag = new Float32Array(Nh);
  for (let k = 0; k < Nh; k++) mag[k] = Math.hypot(re[k], im[k]) / Nh;
  const freqs = new Float32Array(Nh);
  for (let k = 0; k < Nh; k++) freqs[k] = k * sr / N;
  return { freqs, mag, sr };
}

function drawSpectrum(ctx, w, h, spec, color, maxFreq) {
  drawGrid(ctx, w, h);
  if (!spec) {
    const C = themeColors();
    ctx.fillStyle = C.textDim;
    ctx.font = '11px "Fira Code", monospace'; ctx.textAlign = 'center';
    ctx.fillText('hesaplanmadı', w / 2, h / 2);
    return;
  }
  let peak = 0;
  for (let k = 0; k < spec.mag.length; k++) {
    if (spec.freqs[k] > maxFreq) break;
    if (spec.mag[k] > peak) peak = spec.mag[k];
  }
  if (peak === 0) peak = 1;
  const C = themeColors();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  let first = true;
  for (let k = 0; k < spec.mag.length; k++) {
    const f = spec.freqs[k];
    if (f > maxFreq) break;
    const x = (f / maxFreq) * w;
    const y = h - (spec.mag[k] / peak) * h * 0.92;
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.globalAlpha = 0.25; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  first = true;
  for (let k = 0; k < spec.mag.length; k++) {
    const f = spec.freqs[k];
    if (f > maxFreq) break;
    const x = (f / maxFreq) * w;
    const y = h - (spec.mag[k] / peak) * h * 0.92;
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Freq etiketleri
  ctx.fillStyle = C.textDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.textAlign = 'left';
  for (let f = 0; f <= maxFreq; f += Math.ceil(maxFreq / 5 / 1000) * 1000) {
    const x = (f / maxFreq) * w;
    const lbl = f >= 1000 ? (f / 1000).toFixed(0) + 'k' : '0';
    ctx.fillText(lbl, x + 2, h - 2);
  }
}

// ============================================
// Modülasyon: DSB-SC (Double-Sideband Suppressed Carrier)
// s[n] = m[n] · cos(2π f_c n / sr)
// Demodülasyon: lokal osilatör ile çarp + LPF (heterodyne)
//   s(t)·cos(2π f_t t) = m/2 · [cos((f_c−f_t)·2πt) + cos((f_c+f_t)·2πt)]
//   LPF → f_t ≈ f_c ise m/2 baseband'a iner; diğer kanallar BW/2 dışında kalır
// ============================================
function modulateDSBSC(samples, sr, fc) {
  const out = new Float32Array(samples.length);
  const omega = 2 * Math.PI * fc / sr;
  for (let n = 0; n < samples.length; n++) {
    out[n] = samples[n] * Math.cos(omega * n);
  }
  return out;
}

// ============================================
// Kanal işleme: orijinal → anti-alias → modülasyon
// Pipeline (her şey 32 kHz'de, ayrı SR'ler yok):
//   1. Region kesimi
//   2. Anti-aliasing LPF (cutoff = bandwidth/2)
//      → çünkü radyo kanalı bandwidth = 2 × m(t) bandwidth (DSB gerçeği)
//   3. Normalize (|m| ≤ 0.9)
//   4. DSB-SC modülasyon: s[n] = m[n] · cos(2π f_c n / SR)
// ============================================
function processChannel(ch) {
  const start = ch.selStart;
  const end = Math.min(ch.samplesOrig.length, ch.selEnd);
  let segment = ch.samplesOrig.slice(start, end);
  if (segment.length === 0) {
    ch.samplesProcessed = null;
    ch.samplesMod = null;
    return;
  }

  // 2. Anti-aliasing LPF — cutoff yarısı (radyo kanalı genişliği tanımı)
  if (ch.antiAlias) {
    const cutoff = ch.bandwidth / 2;
    const M = 257;
    const h = sincLPF(cutoff, AUDIO_SR, M);
    segment = fftConvolve(segment, h);
  }

  // 3. Normalize (|m| ≤ 0.9)
  let peak = 0;
  for (let i = 0; i < segment.length; i++) {
    const a = Math.abs(segment[i]); if (a > peak) peak = a;
  }
  if (peak > 0) {
    const sc = 0.9 / peak;
    for (let i = 0; i < segment.length; i++) segment[i] *= sc;
  }

  ch.samplesProcessed = segment;  // AUDIO_SR (= SR) — spektrum + modülasyon aynı oranda

  // 4. DSB-SC modülasyon (m[n] × cos(2π f_c n / SR))
  const modulated = modulateDSBSC(segment, SR, ch.centerFreq);

  // 5. RMS normalize → composite'te eşit "ses gücü" + spektrumda yaklaşık eşit peak
  // (peak normalize yapınca kısa pikler hedeflendiği için ortalama enerji düşer ve
  //  zayıf kanal gürültüye gömülür → spektrumda da görünmez olur)
  let sumSq = 0;
  for (let i = 0; i < modulated.length; i++) sumSq += modulated[i] * modulated[i];
  const rms = Math.sqrt(sumSq / Math.max(1, modulated.length));
  const targetRms = 0.18;
  if (rms > 1e-6) {
    const sc = targetRms / rms;
    for (let i = 0; i < modulated.length; i++) modulated[i] *= sc;
  }
  ch.samplesMod = modulated;
}

// ============================================
// Composite oluştur (tüm modüleli sinyalleri topla + gürültü)
// ============================================
function buildComposite() {
  const totalLen = Math.floor(SR * STATE.loopDur);
  const comp = new Float32Array(totalLen);

  let activeChannels = 0;

  for (const ch of STATE.channels) {
    if (!ch.samplesMod || ch.samplesMod.length === 0) continue;
    // Loop'la doldur (kısa segmenti tekrarla)
    for (let i = 0; i < totalLen; i++) {
      comp[i] += ch.samplesMod[i % ch.samplesMod.length];
    }
    activeChannels++;
  }

  // Gürültü ekle (beyaz)
  const nl = STATE.noiseLevel;
  for (let i = 0; i < totalLen; i++) {
    comp[i] += (Math.random() * 2 - 1) * nl;
  }

  // Normalize (peak max 0.9)
  let peak = 0;
  for (let i = 0; i < totalLen; i++) {
    const a = Math.abs(comp[i]); if (a > peak) peak = a;
  }
  if (peak > 0.9) {
    const sc = 0.9 / peak;
    for (let i = 0; i < totalLen; i++) comp[i] *= sc;
  }

  // Loop edge fade — comp[0] ≠ comp[N-1] olunca her loop'ta click oluşur.
  // 5 ms fade-in/out tüm "click → broadband cızırtı" sızıntısını ortadan kaldırır.
  const fadeLen = Math.min(Math.floor(SR * 0.005), Math.floor(totalLen / 2));
  for (let i = 0; i < fadeLen; i++) {
    const s = i / fadeLen;
    comp[i] *= s;
    comp[totalLen - 1 - i] *= s;
  }

  STATE.composite = comp;
  return comp;
}

// ============================================
// KANAL UI
// ============================================
function makeChannelCard(ch) {
  const idx = STATE.channels.indexOf(ch);
  const num = idx + 1;
  const color = chColor(idx, isLight());

  const card = document.createElement('div');
  card.className = 'channel-card glass-panel';
  card.dataset.id = ch.id;

  card.innerHTML = `
    <div class="channel-header">
      <span class="channel-num" style="color:${color}; border-color:${color}; background:${color}15;">📻 KANAL ${num}</span>
      <div class="channel-input-group">
        Merkez Freq:
        <input type="number" class="ch-center" value="${ch.centerFreq}" min="500" max="${STATE.maxFreq}" step="50" />
        <span>Hz</span>
      </div>
      <div class="channel-input-group">
        Bandwidth:
        <input type="number" class="ch-bw" value="${ch.bandwidth}" min="100" max="3000" step="50" />
        <span>Hz</span>
      </div>
      <button class="channel-rm" title="Kanalı sil">✕ Sil</button>
    </div>

    <div class="channel-toolbar">
      <div class="ch-file-wrap ch-btn file">
        📁 Dosya Yükle
        <input type="file" class="ch-file" accept="audio/*,.mp3,.wav,.ogg,.m4a" />
      </div>
      <button class="ch-btn mic">🎤 Kayıt</button>
      <span class="ch-status">Henüz ses yüklenmedi</span>

      <div class="ch-antialias">
        <input type="checkbox" class="ch-aa" ${ch.antiAlias ? 'checked' : ''} />
        Anti-aliasing LPF
      </div>
    </div>

    <div class="channel-graphs">
      <div class="ch-graph">
        <div class="ch-graph-header">
          <span class="ch-graph-title orig">m(t) — Orijinal Ses (Bölge Seç)</span>
          <button class="ch-btn play play-orig" disabled>▶</button>
        </div>
        <canvas class="cv-orig selectable"></canvas>
        <div class="ch-graph-info">
          <span class="orig-info">—</span>
          <span class="ch-region-controls">
            <label>Bşl: <input class="ch-start" type="number" min="0" step="0.1" value="0" disabled /> sn</label>
            <label>Bts: <input class="ch-end" type="number" min="0" step="0.1" value="0" disabled /> sn</label>
          </span>
        </div>
      </div>

      <div class="ch-graph">
        <div class="ch-graph-header">
          <span class="ch-graph-title spec">|M(f)| — Spektrum</span>
          <button class="ch-btn play play-aa" disabled>▶</button>
        </div>
        <canvas class="cv-spec"></canvas>
        <div class="ch-graph-info"><span class="spec-info">—</span></div>
      </div>

      <div class="ch-graph">
        <div class="ch-graph-header">
          <span class="ch-graph-title mod">s(t)=m(t)·cos(2π f<sub>c</sub>t)</span>
          <button class="ch-btn play play-mod" disabled>▶</button>
        </div>
        <canvas class="cv-mod"></canvas>
        <div class="ch-graph-info"><span class="mod-info">—</span></div>
      </div>
    </div>
  `;

  // Inputs
  const centerInp = card.querySelector('.ch-center');
  const bwInp = card.querySelector('.ch-bw');
  const aaInp = card.querySelector('.ch-aa');
  const fileInp = card.querySelector('.ch-file');
  const micBtn = card.querySelector('.ch-btn.mic');
  const status = card.querySelector('.ch-status');
  const playOrig = card.querySelector('.play-orig');
  const playAA = card.querySelector('.play-aa');
  const playMod = card.querySelector('.play-mod');
  const cvOrig = card.querySelector('.cv-orig');
  const cvSpec = card.querySelector('.cv-spec');
  const cvMod = card.querySelector('.cv-mod');
  const origInfo = card.querySelector('.orig-info');
  const specInfo = card.querySelector('.spec-info');
  const modInfo = card.querySelector('.mod-info');
  const chStart = card.querySelector('.ch-start');
  const chEnd = card.querySelector('.ch-end');

  // Saniye input'larından bölge seç
  function applyTimeInputs() {
    if (!ch.samplesOrig) return;
    const sSec = Math.max(0, parseFloat(chStart.value) || 0);
    const eSec = Math.max(sSec + 0.01, parseFloat(chEnd.value) || 0);
    ch.selStart = Math.max(0, Math.min(ch.samplesOrig.length - 1, Math.floor(sSec * AUDIO_SR)));
    ch.selEnd   = Math.max(ch.selStart + 1, Math.min(ch.samplesOrig.length, Math.floor(eSec * AUDIO_SR)));
    chStart.value = (ch.selStart / AUDIO_SR).toFixed(2);
    chEnd.value   = (ch.selEnd   / AUDIO_SR).toFixed(2);
    reprocessChannel(ch);
  }
  chStart.addEventListener('change', applyTimeInputs);
  chEnd.addEventListener('change', applyTimeInputs);

  centerInp.addEventListener('change', () => {
    const v = parseFloat(centerInp.value);
    if (isNaN(v)) return;
    ch.centerFreq = Math.max(500, Math.min(STATE.maxFreq, v));
    centerInp.value = ch.centerFreq;
    reprocessChannel(ch);
  });
  bwInp.addEventListener('change', () => {
    const v = parseFloat(bwInp.value);
    if (isNaN(v)) return;
    ch.bandwidth = Math.max(100, Math.min(3000, v));
    bwInp.value = ch.bandwidth;
    reprocessChannel(ch);
  });
  aaInp.addEventListener('change', () => {
    ch.antiAlias = aaInp.checked;
    reprocessChannel(ch);
  });

  // File load — ses doğrudan AUDIO_SR (32 kHz) olarak indirgenir + anti-alias
  fileInp.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    status.textContent = `Yükleniyor: ${file.name}...`;
    status.className = 'ch-status';
    try {
      const arr = await file.arrayBuffer();
      const tmp = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await tmp.decodeAudioData(arr);
      let mono;
      const ch0 = buf.getChannelData(0);
      if (buf.numberOfChannels >= 2) {
        const ch1 = buf.getChannelData(1);
        mono = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) mono[i] = 0.5 * (ch0[i] + ch1[i]);
      } else {
        mono = Float32Array.from(ch0);
      }
      // Anti-alias filter before decimation (orjinal SR'de)
      // Sonra AUDIO_SR'e düşür
      const downsampled = antiAliasDownsample(mono, buf.sampleRate, AUDIO_SR);
      ch.samplesOrig = downsampled;
      ch.sr = AUDIO_SR;
      ch.selStart = 0;
      ch.selEnd = Math.min(downsampled.length, Math.floor(AUDIO_SR * 5));
      status.textContent = `✓ ${file.name} · ${buf.duration.toFixed(1)}s · 32 kHz`;
      status.className = 'ch-status ok';
      // Saniye input'larını aktifleştir + max değer + güncel değer
      const durSec = downsampled.length / AUDIO_SR;
      chStart.disabled = false; chEnd.disabled = false;
      chStart.max = durSec.toFixed(2); chEnd.max = durSec.toFixed(2);
      chStart.value = (ch.selStart / AUDIO_SR).toFixed(2);
      chEnd.value   = (ch.selEnd   / AUDIO_SR).toFixed(2);
      reprocessChannel(ch);
      tmp.close();
    } catch (err) {
      status.textContent = '✗ ' + err.message;
      status.className = 'ch-status err';
    }
  });

  // Mic record
  let mediaRecorder = null, recordedChunks = [], micStream = null;
  micBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(micStream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const arr = await blob.arrayBuffer();
        try {
          const tmp = new (window.AudioContext || window.webkitAudioContext)();
          const buf = await tmp.decodeAudioData(arr);
          let mono;
          const ch0 = buf.getChannelData(0);
          if (buf.numberOfChannels >= 2) {
            const ch1 = buf.getChannelData(1);
            mono = new Float32Array(ch0.length);
            for (let i = 0; i < ch0.length; i++) mono[i] = 0.5 * (ch0[i] + ch1[i]);
          } else {
            mono = Float32Array.from(ch0);
          }
          const downsampled = antiAliasDownsample(mono, buf.sampleRate, AUDIO_SR);
          ch.samplesOrig = downsampled;
          ch.sr = AUDIO_SR;
          ch.selStart = 0;
          ch.selEnd = downsampled.length;
          status.textContent = `✓ Kayıt · ${buf.duration.toFixed(1)}s · 32 kHz`;
          status.className = 'ch-status ok';
          const durSec = downsampled.length / AUDIO_SR;
          chStart.disabled = false; chEnd.disabled = false;
          chStart.max = durSec.toFixed(2); chEnd.max = durSec.toFixed(2);
          chStart.value = (ch.selStart / AUDIO_SR).toFixed(2);
          chEnd.value   = (ch.selEnd   / AUDIO_SR).toFixed(2);
          reprocessChannel(ch);
          tmp.close();
        } catch (err) {
          status.textContent = '✗ ' + err.message;
          status.className = 'ch-status err';
        }
        if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
        micBtn.classList.remove('recording');
        micBtn.textContent = '🎤 Kayıt';
      };
      mediaRecorder.start();
      micBtn.classList.add('recording');
      micBtn.textContent = '⏹ Bitir';
      status.textContent = _t({tr: '● Kayıt yapılıyor...', en: '● Recording…'});
    } catch (err) {
      status.textContent = '✗ Mikrofon reddedildi';
      status.className = 'ch-status err';
    }
  });

  // Delete channel
  card.querySelector('.channel-rm').addEventListener('click', () => {
    if (ch.previewPlayer) ch.previewPlayer.stop();
    STATE.channels = STATE.channels.filter(c => c.id !== ch.id);
    refreshChannels();
    updateTowers();
    if (STATE.playing) restartBroadcast();
  });

  // Play buttons (per-channel preview)
  playOrig.addEventListener('click', () => previewPlayChannel(ch, 'orig'));
  playAA.addEventListener('click', () => previewPlayChannel(ch, 'aa'));
  playMod.addEventListener('click', () => previewPlayChannel(ch, 'mod'));

  // Region selection on original waveform
  initRegionSelector(cvOrig, ch);

  // Store refs
  ch.dom = { card, status, playOrig, playAA, playMod, cvOrig, cvSpec, cvMod, origInfo, specInfo, modInfo, chStart, chEnd };

  return card;
}

// ============================================
// Region selector (orijinal dalga üzerinde shaded)
// ============================================
function initRegionSelector(cv, ch) {
  let dragging = false, dragMode = 'new'; // 'new' | 'movestart' | 'moveend'
  let startX = 0;

  function pxToSample(px) {
    const r = cv.getBoundingClientRect();
    if (!ch.samplesOrig) return 0;
    return Math.max(0, Math.min(ch.samplesOrig.length, Math.round(px / r.width * ch.samplesOrig.length)));
  }
  function sampleToPx(s) {
    const r = cv.getBoundingClientRect();
    if (!ch.samplesOrig) return 0;
    return s / ch.samplesOrig.length * r.width;
  }

  cv.addEventListener('mousedown', (e) => {
    if (!ch.samplesOrig) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left;
    const startPx = sampleToPx(ch.selStart);
    const endPx = sampleToPx(ch.selEnd);
    // Handle: kenar yakınsa kenar oynat, yoksa yeni seçim
    if (Math.abs(px - startPx) < 8) { dragMode = 'movestart'; }
    else if (Math.abs(px - endPx) < 8) { dragMode = 'moveend'; }
    else { dragMode = 'new'; ch.selStart = pxToSample(px); ch.selEnd = ch.selStart; }
    dragging = true;
    startX = px;
  });
  cv.addEventListener('mousemove', (e) => {
    if (!ch.samplesOrig) return;
    if (!dragging) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left;
    const s = pxToSample(px);
    if (dragMode === 'new')   ch.selEnd = Math.max(ch.selStart, s);
    if (dragMode === 'movestart') ch.selStart = Math.min(s, ch.selEnd - 1);
    if (dragMode === 'moveend')   ch.selEnd = Math.max(s, ch.selStart + 1);
    drawChannelGraphs(ch);
  });
  window.addEventListener('mouseup', () => {
    if (dragging && ch.samplesOrig) {
      // Inputs'u drag sonrası senkronize et
      if (ch.dom && ch.dom.chStart && ch.dom.chEnd) {
        ch.dom.chStart.value = (ch.selStart / AUDIO_SR).toFixed(2);
        ch.dom.chEnd.value   = (ch.selEnd   / AUDIO_SR).toFixed(2);
      }
      reprocessChannel(ch);
    }
    dragging = false;
  });
}

// ============================================
// Bir kanalın grafikleri çiz
// ============================================
function drawChannelGraphs(ch) {
  if (!ch.dom) return;
  const idx = STATE.channels.indexOf(ch);
  const color = chColor(idx, isLight());

  // Orijinal (selection ile)
  const o = fit(ch.dom.cvOrig);
  drawGrid(o.ctx, o.w, o.h);
  if (ch.samplesOrig) {
    drawWave(o.ctx, o.w, o.h, ch.samplesOrig, color);
    // Selection shaded
    const x1 = ch.selStart / ch.samplesOrig.length * o.w;
    const x2 = ch.selEnd / ch.samplesOrig.length * o.w;
    const C = themeColors();
    o.ctx.fillStyle = C.selection;
    o.ctx.fillRect(x1, 0, x2 - x1, o.h);
    o.ctx.strokeStyle = C.selectionBorder; o.ctx.lineWidth = 1.5;
    o.ctx.setLineDash([4, 3]);
    o.ctx.beginPath();
    o.ctx.moveTo(x1, 0); o.ctx.lineTo(x1, o.h);
    o.ctx.moveTo(x2, 0); o.ctx.lineTo(x2, o.h);
    o.ctx.stroke();
    o.ctx.setLineDash([]);
    // Etiketler — orijinal 32 kHz'de
    const durSel = (ch.selEnd - ch.selStart) / AUDIO_SR;
    ch.dom.origInfo.textContent = `Seçim: ${durSel.toFixed(2)} sn · ${ch.selEnd - ch.selStart} sample @ 32 kHz`;
    ch.dom.playOrig.disabled = false;
  } else {
    o.ctx.fillStyle = themeColors().textDim;
    o.ctx.font = '11px "Fira Code", monospace'; o.ctx.textAlign = 'center';
    o.ctx.fillText(_t({tr: 'ses yükleyin', en: 'upload audio'}), o.w / 2, o.h / 2);
    ch.dom.origInfo.textContent = '—';
    ch.dom.playOrig.disabled = true;
  }

  // Spektrum (anti-alias sonrası, AUDIO_SR'de)
  const s = fit(ch.dom.cvSpec);
  if (ch.samplesProcessed) {
    const spec = computeSpectrum(ch.samplesProcessed, AUDIO_SR);
    // m(t)'nin spektrumu: 0 — AUDIO_SR/2 (16 kHz)
    // BW/2'ye kadar gösterilir (m'nin bandwidth'i = kanal_BW/2)
    const displayMaxF = Math.min(AUDIO_SR / 2, Math.max(ch.bandwidth, 2000));
    drawSpectrum(s.ctx, s.w, s.h, spec, color, displayMaxF);
    const C = themeColors();
    // Bandwidth/2 göstergesi (m(t) için cutoff)
    s.ctx.strokeStyle = '#ff5577'; s.ctx.lineWidth = 1.5;
    s.ctx.setLineDash([3, 3]);
    const cutoff = ch.bandwidth / 2;
    const xBw = (cutoff / displayMaxF) * s.w;
    s.ctx.beginPath(); s.ctx.moveTo(xBw, 0); s.ctx.lineTo(xBw, s.h); s.ctx.stroke();
    s.ctx.setLineDash([]);
    // Etiket
    s.ctx.fillStyle = '#ff5577';
    s.ctx.font = '10px "Fira Code", monospace'; s.ctx.textAlign = 'left';
    s.ctx.fillText('cutoff = BW/2 = '+cutoff+'Hz', xBw + 3, 12);
    ch.dom.specInfo.textContent = `${ch.antiAlias ? '✓ Anti-aliased' : '⚠ Filtresiz (üst frekanslar geçer)'} · m(t) cutoff = ${cutoff} Hz · kanal BW = ${ch.bandwidth} Hz`;
    ch.dom.playAA.disabled = false;
  } else {
    s.ctx.fillStyle = themeColors().textDim;
    s.ctx.font = '11px "Fira Code", monospace'; s.ctx.textAlign = 'center';
    s.ctx.fillText('—', s.w / 2, s.h / 2);
    ch.dom.specInfo.textContent = '—';
    ch.dom.playAA.disabled = true;
  }

  // Modüleli (zaman penceresi: ilk 200ms snapshot)
  const m = fit(ch.dom.cvMod);
  drawGrid(m.ctx, m.w, m.h);
  if (ch.samplesMod && ch.samplesMod.length > 0) {
    const snapLen = Math.min(ch.samplesMod.length, Math.floor(SR * 0.1));
    const snap = ch.samplesMod.slice(0, snapLen);
    drawWave(m.ctx, m.w, m.h, snap, color);
    ch.dom.modInfo.textContent = `f_c = ${ch.centerFreq} Hz · spektrum ±BW/2 etrafında`;
    ch.dom.playMod.disabled = false;
  } else {
    m.ctx.fillStyle = themeColors().textDim;
    m.ctx.font = '11px "Fira Code", monospace'; m.ctx.textAlign = 'center';
    m.ctx.fillText('—', m.w / 2, m.h / 2);
    ch.dom.modInfo.textContent = '—';
    ch.dom.playMod.disabled = true;
  }
}

// ============================================
// Kanal yeniden işle (UI değişikliklerinde)
// ============================================
function reprocessChannel(ch) {
  if (!ch.samplesOrig) {
    drawChannelGraphs(ch);
    updateTowers();
    return;
  }
  processChannel(ch);
  drawChannelGraphs(ch);
  drawComposite();
  updateTowers();
  if (STATE.playing) restartBroadcast();
}

// ============================================
// Tüm kanalları yeniden çiz (silme sonrası)
// ============================================
function refreshChannels() {
  ui.channelsList.innerHTML = '';
  for (const ch of STATE.channels) {
    const card = makeChannelCard(ch);
    ui.channelsList.appendChild(card);
    drawChannelGraphs(ch);
  }
  ui.addChannelBtn.disabled = STATE.channels.length >= MAX_CHANNELS;
  drawComposite();
}

// ============================================
// Yeni kanal ekleme
// ============================================
function addChannel() {
  if (STATE.channels.length >= MAX_CHANNELS) return;
  // Default merkez frekansı: mevcut kanalların arasında boş bir frekansa yerleştir
  const used = STATE.channels.map(c => c.centerFreq).sort((a, b) => a - b);
  let defCenter;
  if (used.length === 0) defCenter = 4000;
  else if (used.length === 1) defCenter = used[0] + 3000;
  else {
    // En büyük boşluğu bul
    defCenter = used[used.length - 1] + 3000;
    if (defCenter > STATE.maxFreq) defCenter = used[0] - 2000;
    if (defCenter < 1000) defCenter = 1000;
  }
  defCenter = Math.max(500, Math.min(STATE.maxFreq, defCenter));

  const ch = {
    id: ++STATE.channelIdCounter,
    samplesOrig: null,
    sr: SR,
    selStart: 0,
    selEnd: 0,
    centerFreq: defCenter,
    bandwidth: STATE.defaultBw,
    antiAlias: true,
    samplesProcessed: null,
    samplesMod: null,
    dom: null,
    previewPlayer: null,
  };
  STATE.channels.push(ch);
  refreshChannels();
  updateTowers();
}

// ============================================
// Kanal preview çalma (toggle: çalıyorsa durdur, çalmıyorsa çal)
// ============================================
function previewPlayChannel(ch, type) {
  // Toggle: aynı tip oynuyorsa durdur
  if (ch.previewPlayer && ch.previewType === type) {
    try { ch.previewPlayer.stop(); } catch(_){}
    ch.previewPlayer = null;
    ch.previewType = null;       // ikonun ▶'a dönmesi için
    updatePlayButtons(ch);
    return;
  }
  // Başka tip çalıyorsa onu durdur
  if (ch.previewPlayer) {
    try { ch.previewPlayer.stop(); } catch(_){}
    ch.previewPlayer = null;
    ch.previewType = null;
  }

  if (!STATE.audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    try { STATE.audioCtx = new AC({ sampleRate: SR }); }
    catch (_) { STATE.audioCtx = new AC(); }
  }
  const ctx = STATE.audioCtx;
  let samples;
  let bufSR;
  if (type === 'orig') {
    samples = ch.samplesOrig ? ch.samplesOrig.slice(ch.selStart, ch.selEnd) : null;
    bufSR = AUDIO_SR;
  } else if (type === 'aa') {
    samples = ch.samplesProcessed;
    bufSR = AUDIO_SR;
  } else if (type === 'mod') {
    samples = ch.samplesMod;
    bufSR = SR;
  }
  if (!samples || samples.length === 0) return;

  // Web Audio min SR ~8 kHz desteklemeli ama bazı tarayıcılar minSampleRate'i değişken kabul eder
  const playSR = Math.max(8000, bufSR);
  const buf = ctx.createBuffer(1, samples.length, playSR);
  buf.getChannelData(0).set(samples);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.7;
  src.connect(g); g.connect(ctx.destination);
  src.onended = () => {
    if (ch.previewPlayer === src) {
      ch.previewPlayer = null;
      ch.previewType = null;
      updatePlayButtons(ch);
    }
  };
  src.start();
  ch.previewPlayer = src;
  ch.previewType = type;
  updatePlayButtons(ch);
}

// Play butonlarını güncel duruma getir (▶ veya ■)
function updatePlayButtons(ch) {
  if (!ch.dom) return;
  const btns = { orig: ch.dom.playOrig, aa: ch.dom.playAA, mod: ch.dom.playMod };
  for (const [type, btn] of Object.entries(btns)) {
    if (ch.previewType === type) {
      btn.textContent = '■';
      btn.classList.add('stopping');
    } else {
      btn.textContent = '▶';
      btn.classList.remove('stopping');
    }
  }
}

// ============================================
// COMPOSITE ÇİZ (spektrum)
// ============================================
function drawComposite() {
  buildComposite();
  const { ctx, w, h } = fit(ui.cvComposite);
  ctx.fillStyle = themeColors().bg; ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h);

  if (!STATE.composite || STATE.channels.length === 0) {
    ctx.fillStyle = themeColors().textDim;
    ctx.font = '13px "Saira", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Kanal ekleyin', w / 2, h / 2);
    return;
  }

  // Composite spektrum — alt yarı
  const spec = computeSpectrum(STATE.composite, SR);
  const maxF = STATE.maxFreq;
  let peak = 0;
  for (let k = 0; k < spec.mag.length; k++) {
    if (spec.freqs[k] > maxF) break;
    if (spec.mag[k] > peak) peak = spec.mag[k];
  }
  if (peak === 0) peak = 1;

  const C = themeColors();
  // Doluluk
  const light = isLight();
  ctx.fillStyle = light ? 'rgba(8,18,70,0.18)' : 'rgba(123,140,255,0.18)';
  ctx.strokeStyle = light ? '#0e6e2e' : '#39ff85';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let first = true;
  for (let k = 0; k < spec.mag.length; k++) {
    const f = spec.freqs[k]; if (f > maxF) break;
    const x = (f / maxF) * w;
    const y = h - (spec.mag[k] / peak) * h * 0.88;
    if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
  }
  const lineEndY = h;
  ctx.lineTo(w, lineEndY); ctx.lineTo(0, lineEndY); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  first = true;
  for (let k = 0; k < spec.mag.length; k++) {
    const f = spec.freqs[k]; if (f > maxF) break;
    const x = (f / maxF) * w;
    const y = h - (spec.mag[k] / peak) * h * 0.88;
    if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Kanal taşıyıcı frekansları — dikey kesikli çizgiler
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.3;
  ctx.font = 'bold 10px "Fira Code", monospace';
  ctx.textAlign = 'center';
  const carrierColor = light ? '#b89000' : '#ffd23f';
  STATE.channels.forEach((ch, idx) => {
    const fc = ch.centerFreq;
    if (fc < 0 || fc > maxF) return;
    const xC = (fc / maxF) * w;
    ctx.strokeStyle = carrierColor;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(xC, 0); ctx.lineTo(xC, h); ctx.stroke();
    // Üstteki etiket (f_n = ... Hz)
    ctx.globalAlpha = 1;
    ctx.fillStyle = carrierColor;
    ctx.fillText(`f${idx + 1}=${fc} Hz`, xC, h - 16);
  });
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.restore();

  // Tuner pencere — BW SABİT (frekansla genişlemiyor)
  const tunerF = parseFloat(ui.tunerFreq.value);
  const bw = parseFloat(ui.tunerBW.value);   // kullanıcı tanımlı, sabit Hz
  const xT = (tunerF / maxF) * w;
  const xL = ((tunerF - bw / 2) / maxF) * w;
  const xR = ((tunerF + bw / 2) / maxF) * w;
  // Vurgu kutusu
  ctx.fillStyle = 'rgba(255,79,154,0.15)';
  ctx.fillRect(xL, 0, xR - xL, h);
  ctx.strokeStyle = '#ff4f9a';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(xL, 0); ctx.lineTo(xL, h);
  ctx.moveTo(xR, 0); ctx.lineTo(xR, h); ctx.stroke();
  ctx.setLineDash([]);
  // Merkez çizgisi (kalın)
  ctx.strokeStyle = '#ff4f9a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(xT, 0); ctx.lineTo(xT, h); ctx.stroke();
  // Etiket
  ctx.fillStyle = '#ff4f9a';
  ctx.font = 'bold 11px "Saira Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`f_t = ${tunerF} Hz`, xT, 14);

  // Frekans ekseni
  ctx.fillStyle = C.textDim;
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'center';
  for (let f = 0; f <= maxF; f += Math.ceil(maxF / 10 / 1000) * 1000) {
    const x = (f / maxF) * w;
    const lbl = (f / 1000).toFixed(0) + 'k';
    ctx.fillText(lbl, x, h - 4);
  }
}

// Composite üzerinde slider mantığı (tıklayarak tuner pozisyonu)
ui.cvComposite.addEventListener('click', (e) => {
  const r = ui.cvComposite.getBoundingClientRect();
  const px = e.clientX - r.left;
  const f = Math.round((px / r.width) * STATE.maxFreq / 10) * 10;
  ui.tunerFreq.value = f;
  ui.tunerFreqVal.textContent = f + ' Hz';
  applyTunerFreq(f);
  drawComposite();
});

// ============================================
// 🗼 KULELER
// ============================================
function updateTowers() {
  const { ctx, w, h } = fit(ui.cvTowers);
  ctx.fillStyle = themeColors().bg; ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h);

  const C = themeColors();
  const maxF = STATE.maxFreq;

  // Eksen
  ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h - 20); ctx.lineTo(w, h - 20); ctx.stroke();

  // Frekans grid + etiket
  ctx.fillStyle = C.textDim;
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'center';
  for (let f = 0; f <= maxF; f += 2000) {
    const x = (f / maxF) * w;
    ctx.fillText((f / 1000).toFixed(0) + 'k', x, h - 5);
  }

  // Kuleler
  const light = isLight();
  STATE.channels.forEach((ch, idx) => {
    const color = chColor(idx, light);
    const xC = (ch.centerFreq / maxF) * w;
    const halfBw = (ch.bandwidth / 2) / maxF * w;
    const tower_h = h - 30;
    // Yayın bandı (shaded)
    ctx.fillStyle = color + '33';
    ctx.fillRect(xC - halfBw, 5, halfBw * 2, tower_h - 5);
    // Kule (dikey çizgi)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(xC, 5); ctx.lineTo(xC, tower_h); ctx.stroke();
    // Kule üstü (üçgen anten)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xC, 0); ctx.lineTo(xC - 5, 8); ctx.lineTo(xC + 5, 8); ctx.closePath();
    ctx.fill();
    // Label
    ctx.fillStyle = color;
    ctx.font = 'bold 10px "Saira Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`#${idx + 1}`, xC, tower_h + 12);
    ctx.font = '9px "Fira Code", monospace';
    ctx.fillStyle = C.textDim;
    ctx.fillText(`${ch.centerFreq}Hz`, xC, tower_h + 22);
  });

  // Tuner göstergesi (canlı)
  const tF = parseFloat(ui.tunerFreq.value);
  const xT = (tF / maxF) * w;
  ctx.strokeStyle = '#ff4f9a';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(xT, 0); ctx.lineTo(xT, h - 20); ctx.stroke();
  // Tuner ok
  ctx.fillStyle = '#ff4f9a';
  ctx.beginPath();
  ctx.moveTo(xT, h - 20);
  ctx.lineTo(xT - 6, h - 30);
  ctx.lineTo(xT + 6, h - 30);
  ctx.closePath();
  ctx.fill();

  // Legend
  ui.towerLegend.innerHTML = '';
  if (STATE.channels.length === 0) {
    ui.towerLegend.innerHTML = '<span style="color:var(--text-dim); font-style:italic;">Henüz kanal yok — aşağıdan ekleyin</span>';
    return;
  }
  STATE.channels.forEach((ch, idx) => {
    const color = chColor(idx, light);
    const item = document.createElement('span');
    item.className = 'tower-legend-item';
    item.innerHTML = `<span class="tower-legend-color" style="background:${color};"></span>
                      #${idx + 1} · ${ch.centerFreq} Hz · BW ${ch.bandwidth} Hz`;
    ui.towerLegend.appendChild(item);
  });
}

// ============================================
// WEB AUDIO ZİNCİRİ — Senkron demodülasyon (heterodyne)
//
//   composite ──► mixer (× LO) ──► LPF₁ ──► LPF₂ ──► LPF₃ ──► volume ──► çıkış
//                    ▲             └──── 6. derece Butterworth ────┘
//                    │              (3 biquad cascade, cutoff = BW/2)
//                 LO (cos @ f_t)
//
// Mixer: GainNode gain.value=0; LO output → gain.gain (audio-rate param mod).
// Çıkış = composite × LO_sample = m(t)·cos(ω_c t)·cos(ω_t t).
// 6. derece (36 dB/oct) LPF → sadece f_t ≈ f_c olan kanalın baseband bileşeni
// (m/2) geçer; komşu kanallar (|f_n − f_t| > BW/2) pratik olarak susturulur.
// ============================================
async function startBroadcast() {
  if (STATE.playing) return;
  if (!STATE.composite || STATE.channels.length === 0) {
    ui.broadcastStatus.textContent = _t({tr: 'Önce kanal ekleyin ve ses yükleyin', en: 'First add a channel and upload audio'});
    return;
  }
  if (!STATE.audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    try { STATE.audioCtx = new AC({ sampleRate: SR }); }
    catch (_) { STATE.audioCtx = new AC(); }
  }
  const ctx = STATE.audioCtx;
  if (ctx.state === 'suspended') await ctx.resume();

  // Composite buffer
  const buf = ctx.createBuffer(1, STATE.composite.length, SR);
  buf.getChannelData(0).set(STATE.composite);

  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;

  const tunerF = parseFloat(ui.tunerFreq.value);
  const tunerBW = parseFloat(ui.tunerBW.value);

  // Lokal osilatör: cos(2π f_t t)
  const lo = ctx.createOscillator();
  lo.type = 'sine';
  lo.frequency.value = tunerF;

  // Mixer: GainNode, gain.value=0 + LO → gain.gain (audio-rate çarpan)
  const mixer = ctx.createGain();
  mixer.gain.value = 0;
  lo.connect(mixer.gain);

  // 6. derece Butterworth LPF — 3 biquad cascade (cutoff = BW/2)
  // Q değerleri Butterworth tasarımı için sabit: 1/(2·cos(π(2k-1)/(2N))), N=6
  // 2. derece (12 dB/oct) yerine 36 dB/oct → komşu kanal sızıntısı pratik olarak yok
  const BUTTERWORTH_6 = [0.5176, 0.7071, 1.9319];
  const cutoff = Math.max(200, tunerBW / 2);
  const lpfs = BUTTERWORTH_6.map(q => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = q;
    return f;
  });

  // Volume — demod /2 + LPF zayıflaması için gain'i artırdık
  const gain = ctx.createGain();
  gain.gain.value = parseFloat(ui.volume.value) * 8.0;

  src.connect(mixer);
  mixer.connect(lpfs[0]);
  lpfs[0].connect(lpfs[1]);
  lpfs[1].connect(lpfs[2]);
  lpfs[2].connect(gain);
  gain.connect(ctx.destination);

  src.start();
  lo.start();

  STATE.bufferSource = src;
  STATE.lo = lo;
  STATE.mixer = mixer;
  STATE.lpfs = lpfs;
  STATE.gain = gain;
  STATE.playing = true;

  ui.btnBroadcast.disabled = true;
  ui.btnStopAll.disabled = false;
  ui.broadcastStatus.textContent = _t({tr: '📡 Yayın akıyor — slider ile gezinin', en: '📡 Broadcast active — use the slider to navigate'});
  ui.broadcastStatus.style.color = 'var(--accent-1)';
}

function stopBroadcast() {
  if (!STATE.playing) return;
  try { STATE.bufferSource.stop(); } catch (_) {}
  try { STATE.lo.stop(); } catch (_) {}
  try {
    STATE.bufferSource.disconnect();
    STATE.lo.disconnect();
    STATE.mixer.disconnect();
    if (STATE.lpfs) STATE.lpfs.forEach(f => { try { f.disconnect(); } catch(_){} });
    STATE.gain.disconnect();
  } catch (_) {}
  STATE.playing = false;
  STATE.bufferSource = null;
  STATE.lo = null;
  STATE.mixer = null;
  STATE.lpfs = null;
  STATE.gain = null;
  ui.btnBroadcast.disabled = false;
  ui.btnStopAll.disabled = true;
  ui.broadcastStatus.textContent = 'Durduruldu';
  ui.broadcastStatus.style.color = 'var(--text-secondary)';
}

function restartBroadcast() {
  const wasPlaying = STATE.playing;
  stopBroadcast();
  if (wasPlaying) setTimeout(startBroadcast, 50);
}

// Tuner ayarları gerçek zamanlı
function applyTunerFreq(f) {
  if (STATE.lo) {
    const ctx = STATE.audioCtx;
    STATE.lo.frequency.cancelScheduledValues(ctx.currentTime);
    STATE.lo.frequency.linearRampToValueAtTime(f, ctx.currentTime + 0.05);
  }
}
function applyTunerBW(bw) {
  if (STATE.lpfs) {
    const ctx = STATE.audioCtx;
    const cutoff = Math.max(200, bw / 2);
    STATE.lpfs.forEach(f => {
      f.frequency.cancelScheduledValues(ctx.currentTime);
      f.frequency.linearRampToValueAtTime(cutoff, ctx.currentTime + 0.05);
    });
  }
}
function applyVolume(v) {
  if (STATE.gain) {
    const ctx = STATE.audioCtx;
    STATE.gain.gain.cancelScheduledValues(ctx.currentTime);
    STATE.gain.gain.linearRampToValueAtTime(v * 8.0, ctx.currentTime + 0.05);
  }
}

// ============================================
// UI EVENT'LERİ
// ============================================
ui.addChannelBtn.addEventListener('click', addChannel);

ui.defaultBw.addEventListener('input', () => {
  STATE.defaultBw = parseFloat(ui.defaultBw.value);
  ui.defaultBwVal.textContent = STATE.defaultBw;
});
ui.noiseLevel.addEventListener('input', () => {
  STATE.noiseLevel = parseFloat(ui.noiseLevel.value);
  ui.noiseLevelVal.textContent = STATE.noiseLevel.toFixed(3);
  drawComposite();
  if (STATE.playing) restartBroadcast();
});
ui.maxFreq.addEventListener('input', () => {
  STATE.maxFreq = parseFloat(ui.maxFreq.value);
  ui.maxFreqVal.textContent = STATE.maxFreq;
  ui.tunerFreq.max = STATE.maxFreq;
  STATE.channels.forEach(drawChannelGraphs);
  drawComposite();
  updateTowers();
});
ui.loopDur.addEventListener('input', () => {
  STATE.loopDur = parseFloat(ui.loopDur.value);
  ui.loopDurVal.textContent = STATE.loopDur;
});
ui.loopDur.addEventListener('change', () => {
  drawComposite();
  if (STATE.playing) restartBroadcast();
});

ui.tunerFreq.addEventListener('input', () => {
  const f = parseFloat(ui.tunerFreq.value);
  ui.tunerFreqVal.textContent = f + ' Hz';
  applyTunerFreq(f);
  drawComposite();
  updateTowers();
});
ui.tunerBW.addEventListener('input', () => {
  const bw = parseFloat(ui.tunerBW.value);
  ui.tunerBWVal.textContent = bw + ' Hz';
  applyTunerBW(bw);
  drawComposite();
});
ui.volume.addEventListener('input', () => {
  const v = parseFloat(ui.volume.value);
  ui.volumeVal.textContent = v.toFixed(2);
  applyVolume(v);
});

ui.btnBroadcast.addEventListener('click', startBroadcast);
ui.btnStopAll.addEventListener('click', stopBroadcast);

window.addEventListener('resize', () => {
  STATE.channels.forEach(drawChannelGraphs);
  drawComposite();
  updateTowers();
});
window.onThemeChange = () => {
  STATE.channels.forEach(drawChannelGraphs);
  drawComposite();
  updateTowers();
};

// ============================================
// ARKAPLAN (basit nokta)
// ============================================
(function () {
  const c = document.getElementById('bgCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const rs = () => { c.width = innerWidth; c.height = innerHeight; }; rs();
  window.addEventListener('resize', rs);
  const pts = [];
  for (let i = 0; i < 45; i++) pts.push({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.3,
    dx: (Math.random() - 0.5) * 0.16, dy: (Math.random() - 0.5) * 0.1,
    a: Math.random() * 0.18 + 0.04,
  });
  (function lp() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of pts) {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
      if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
      ctx.fillStyle = `rgba(100,160,255,${p.a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(lp);
  })();
})();

// ============================================
// İLK ÇİZİM
// ============================================
drawComposite();
updateTowers();
ui.tunerFreqVal.textContent = ui.tunerFreq.value + ' Hz';
ui.tunerBWVal.textContent = ui.tunerBW.value + ' Hz';
ui.volumeVal.textContent = parseFloat(ui.volume.value).toFixed(2);
ui.defaultBwVal.textContent = ui.defaultBw.value;
ui.noiseLevelVal.textContent = parseFloat(ui.noiseLevel.value).toFixed(3);
ui.maxFreqVal.textContent = ui.maxFreq.value;
ui.loopDurVal.textContent = ui.loopDur.value;
