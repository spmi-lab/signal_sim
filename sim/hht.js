/* ============================================
   HİLBERT-HUANG (EMD) ANALİZİ
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
// ── Canvas ──
const cvStack = document.getElementById('cvStack');
const cvRecon = document.getElementById('cvRecon');
const cvSourceWave = document.getElementById('cvSourceWave');
const cvDraw = document.getElementById('cvDraw');

// ── UI ──
const ui = {
  compType: document.getElementById('compType'),
  aSlider: document.getElementById('aSlider'), aVal: document.getElementById('aVal'),
  fSlider: document.getElementById('fSlider'), fVal: document.getElementById('fVal'),
  phSlider: document.getElementById('phSlider'), phVal: document.getElementById('phVal'),
  addComp: document.getElementById('addComp'),
  compList: document.getElementById('compList'),
  useComposite: document.getElementById('useComposite'),

  openDraw: document.getElementById('openDraw'),
  drawDurSlider: document.getElementById('drawDurSlider'), drawDurVal: document.getElementById('drawDurVal'),
  drawSampSlider: document.getElementById('drawSampSlider'), drawSampVal: document.getElementById('drawSampVal'),
  drawStatus: document.getElementById('drawStatus'),

  targetSR: document.getElementById('targetSR'),
  fileInput: document.getElementById('fileInput'),
  micBtn: document.getElementById('micBtn'),
  audioStatus: document.getElementById('audioStatus'),
  cutStart: document.getElementById('cutStart'), cutStartVal: document.getElementById('cutStartVal'),
  cutLen: document.getElementById('cutLen'), cutLenVal: document.getElementById('cutLenVal'),
  useAudio: document.getElementById('useAudio'),

  maxIMF: document.getElementById('maxIMF'),
  layerSlider: document.getElementById('layerSlider'), layerVal: document.getElementById('layerVal'),
  reconKSlider: document.getElementById('reconKSlider'), reconKVal: document.getElementById('reconKVal'),
  statIMF: document.getElementById('statIMF'),
  statLen: document.getElementById('statLen'),
  statTime: document.getElementById('statTime'),
  statRMSE: document.getElementById('statRMSE'),

  playOrig: document.getElementById('playOrig'),
  playRecon: document.getElementById('playRecon'),
  stopAll: document.getElementById('stopAll'),
  dlRecon: document.getElementById('dlRecon'),

  stackInfo: document.getElementById('stackInfo'),
  reconInfo: document.getElementById('reconInfo'),

  drawModal: document.getElementById('drawModal'),
  drawApply: document.getElementById('drawApply'),
  drawClear: document.getElementById('drawClear'),
  drawSmooth: document.getElementById('drawSmooth'),
  drawCancel: document.getElementById('drawCancel'),
};

// ── Durum ──
let components = [];        // {type, A, F, ph}
let currentSignal = null;   // EMD'ye giren sinyal (Float64)
let signalSR = 1000;        // sinyalin örnekleme hızı (Hz) — çalma için
let imfs = [];              // EMD sonucu IMF'ler
let residual = null;        // EMD residual
let isAudioSignal = false;  // ses mi sentetik mi (çalma için)

let audioBuffer = null;
let currentSampleRate = 4000;
let mediaRecorder = null, recordedChunks = [], micStream = null;
let currentSource = null;

// Modal çizim
let drawData = null;        // çizilen sinyal
let drawPrevIdx = -1, drawPrevAmp = 0, drawing = false;

const MAX_SECONDS = 3;

// ============================================
// EMD ALGORİTMASI
// ============================================
function cubicSpline(xs, ys, xq) {
  const n = xs.length;
  const out = new Float64Array(xq.length);
  if (n < 2) { out.fill(ys[0] || 0); return out; }
  if (n === 2) {
    for (let q = 0; q < xq.length; q++) {
      const t = (xq[q] - xs[0]) / (xs[1] - xs[0]);
      out[q] = ys[0] + t * (ys[1] - ys[0]);
    }
    return out;
  }
  const h = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i];
  const alpha = new Float64Array(n);
  for (let i = 1; i < n - 1; i++)
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  const l = new Float64Array(n), mu = new Float64Array(n), z = new Float64Array(n);
  l[0] = 1;
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  l[n - 1] = 1;
  const c = new Float64Array(n), b = new Float64Array(n), d = new Float64Array(n);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  let seg = 0;
  for (let q = 0; q < xq.length; q++) {
    const x = xq[q];
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    while (seg > 0 && x < xs[seg]) seg--;
    const dx = x - xs[seg];
    out[q] = ys[seg] + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
  }
  return out;
}

function findExtrema(s) {
  const maxIdx = [], minIdx = [];
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] > s[i - 1] && s[i] >= s[i + 1]) maxIdx.push(i);
    else if (s[i] < s[i - 1] && s[i] <= s[i + 1]) minIdx.push(i);
  }
  return { maxIdx, minIdx };
}

function siftOnce(s) {
  const N = s.length;
  const { maxIdx, minIdx } = findExtrema(s);
  if (maxIdx.length < 2 || minIdx.length < 2) return null;
  const maxX = [0, ...maxIdx, N - 1];
  const maxY = [s[maxIdx[0]], ...maxIdx.map(i => s[i]), s[maxIdx[maxIdx.length - 1]]];
  const minX = [0, ...minIdx, N - 1];
  const minY = [s[minIdx[0]], ...minIdx.map(i => s[i]), s[minIdx[minIdx.length - 1]]];
  const xq = new Float64Array(N);
  for (let i = 0; i < N; i++) xq[i] = i;
  const upper = cubicSpline(maxX, maxY, xq);
  const lower = cubicSpline(minX, minY, xq);
  const result = new Float64Array(N);
  for (let i = 0; i < N; i++) result[i] = s[i] - (upper[i] + lower[i]) / 2;
  return result;
}

function extractIMF(s, maxSift) {
  let h = Float64Array.from(s);
  for (let iter = 0; iter < maxSift; iter++) {
    const next = siftOnce(h);
    if (!next) break;
    let sd = 0;
    for (let i = 0; i < h.length; i++)
      sd += (h[i] - next[i]) ** 2 / (h[i] * h[i] + 1e-10);
    h = next;
    if (sd < 0.2) break;
  }
  return h;
}

function emd(signal, maxIMF) {
  const out = [];
  let res = Float64Array.from(signal);
  for (let m = 0; m < maxIMF; m++) {
    const { maxIdx, minIdx } = findExtrema(res);
    if (maxIdx.length + minIdx.length < 3) break;
    const imf = extractIMF(res, 12);
    out.push(imf);
    const nr = new Float64Array(res.length);
    for (let i = 0; i < res.length; i++) nr[i] = res[i] - imf[i];
    res = nr;
  }
  return { imfs: out, residual: res };
}

// ============================================
// SİNYAL ÜRETME (bileşik)
// ============================================
function genComponent(type, A, F, ph, N, durSec) {
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = (i / N) * durSec;
    const phase = 2 * Math.PI * F * t + ph;
    let v;
    switch (type) {
      case 'square': v = Math.sign(Math.sin(phase)); break;
      case 'triangle': v = (2 / Math.PI) * Math.asin(Math.sin(phase)); break;
      case 'sawtooth': {
        const x = (F * t + ph / (2 * Math.PI)) % 1;
        v = 2 * (x - Math.floor(x + 0.5));
        break;
      }
      default: v = Math.sin(phase);
    }
    out[i] = A * v;
  }
  return out;
}

function buildComposite() {
  const N = 1000;
  const durSec = 2;
  const sig = new Float64Array(N);
  for (const c of components) {
    const comp = genComponent(c.type, c.A, c.F, c.ph, N, durSec);
    for (let i = 0; i < N; i++) sig[i] += comp[i];
  }
  signalSR = N / durSec;  // 500 Hz
  return sig;
}

// ============================================
// BİLEŞEN LİSTESİ
// ============================================
function renderCompList() {
  ui.compList.innerHTML = '';
  components.forEach((c, idx) => {
    const div = document.createElement('div');
    div.className = 'comp-item';
    const typeNames = { sine: _t({tr: 'Sinüs', en: 'Sine'}), square: _t({tr: 'Kare', en: 'Square'}), triangle: _t({tr: 'Üçgen', en: 'Triangle'}), sawtooth: _t({tr: 'Testere', en: 'Sawtooth'}) };
    div.innerHTML = `<span>${typeNames[c.type]} · A=${c.A} · F=${c.F}Hz · φ=${c.ph.toFixed(1)}</span>`;
    const rm = document.createElement('span');
    rm.className = 'rm'; rm.textContent = '✕';
    rm.onclick = () => { components.splice(idx, 1); renderCompList(); };
    div.appendChild(rm);
    ui.compList.appendChild(div);
  });
  if (components.length === 0) {
    ui.compList.innerHTML = '<div class="comp-item" style="opacity:0.5;">Henüz bileşen eklenmedi (örn. 5Hz + 30Hz sinüs)</div>';
  }
}

ui.addComp.addEventListener('click', () => {
  components.push({
    type: ui.compType.value,
    A: parseFloat(ui.aSlider.value),
    F: parseInt(ui.fSlider.value),
    ph: parseFloat(ui.phSlider.value),
  });
  renderCompList();
});

ui.useComposite.addEventListener('click', () => {
  if (components.length === 0) {
    // Liste boşsa: kullanıcının slider'larda seçtiği tek bileşeni kullan
    // (eski davranış: varsayılan 5+30 Hz sinüs zorla yüklerdi — kare/üçgen seçimini görmezden gelirdi)
    components = [{
      type: ui.compType.value,
      A: parseFloat(ui.aSlider.value),
      F: parseInt(ui.fSlider.value),
      ph: parseFloat(ui.phSlider.value),
    }];
    renderCompList();
  }
  currentSignal = buildComposite();
  isAudioSignal = false;
  runEMD();
});

// ============================================
// EL İLE ÇİZİM
// ============================================
ui.openDraw.addEventListener('click', () => {
  ui.drawModal.classList.add('active');
  const N = parseInt(ui.drawSampSlider.value);
  if (!drawData || drawData.length !== N) drawData = new Float64Array(N);
  setTimeout(renderDrawCanvas, 50);
});
ui.drawCancel.addEventListener('click', () => ui.drawModal.classList.remove('active'));
ui.drawClear.addEventListener('click', () => {
  drawData = new Float64Array(parseInt(ui.drawSampSlider.value));
  renderDrawCanvas();
});
ui.drawSmooth.addEventListener('click', () => {
  const s = new Float64Array(drawData.length);
  for (let i = 1; i < drawData.length - 1; i++)
    s[i] = (drawData[i - 1] + drawData[i] + drawData[i + 1]) / 3;
  s[0] = drawData[0]; s[s.length - 1] = drawData[drawData.length - 1];
  drawData = s; renderDrawCanvas();
});
ui.drawApply.addEventListener('click', () => {
  currentSignal = Float64Array.from(drawData);
  const durSec = parseFloat(ui.drawDurSlider.value);
  signalSR = drawData.length / durSec;
  isAudioSignal = false;
  ui.drawModal.classList.remove('active');
  ui.drawStatus.textContent = `✓ ${drawData.length} örnek çizildi`;
  ui.drawStatus.className = 'status-msg ok';
  runEMD();
});

function renderDrawCanvas() {
  const s = prep(cvDraw);
  s.ctx.clearRect(0, 0, s.w, s.h);
  // grid + eksen
  s.ctx.strokeStyle = 'rgba(100,160,255,0.12)'; s.ctx.lineWidth = 0.7;
  for (let i = 1; i < 10; i++) { const x = (i / 10) * s.w; s.ctx.beginPath(); s.ctx.moveTo(x, 0); s.ctx.lineTo(x, s.h); s.ctx.stroke(); }
  s.ctx.strokeStyle = 'rgba(100,140,255,0.35)'; s.ctx.lineWidth = 1.2;
  s.ctx.beginPath(); s.ctx.moveTo(0, s.h / 2); s.ctx.lineTo(s.w, s.h / 2); s.ctx.stroke();
  // sinyal
  s.ctx.strokeStyle = '#ff8c42'; s.ctx.lineWidth = 2; s.ctx.shadowColor = '#ff8c42'; s.ctx.shadowBlur = 3;
  s.ctx.beginPath();
  const yS = (s.h / 2) * 0.85;
  for (let i = 0; i < drawData.length; i++) {
    const x = (i / (drawData.length - 1)) * s.w;
    const y = s.h / 2 - drawData[i] * yS;
    if (i === 0) s.ctx.moveTo(x, y); else s.ctx.lineTo(x, y);
  }
  s.ctx.stroke(); s.ctx.shadowBlur = 0;
}

function drawPos(e) {
  const rect = cvDraw.getBoundingClientRect();
  const cX = e.clientX ?? (e.touches && e.touches[0].clientX);
  const cY = e.clientY ?? (e.touches && e.touches[0].clientY);
  const idx = Math.round(((cX - rect.left) / rect.width) * (drawData.length - 1));
  const amp = (rect.height / 2 - (cY - rect.top)) / ((rect.height / 2) * 0.85);
  return { idx, amp };
}
function drawPlot(idx, amp) {
  if (drawPrevIdx < 0 || drawPrevIdx === idx) {
    if (idx >= 0 && idx < drawData.length) drawData[idx] = amp;
  } else {
    const a = Math.min(drawPrevIdx, idx), b = Math.max(drawPrevIdx, idx);
    const sA = drawPrevIdx < idx ? drawPrevAmp : amp, eA = drawPrevIdx < idx ? amp : drawPrevAmp;
    for (let i = a; i <= b; i++) {
      if (i < 0 || i >= drawData.length) continue;
      const t = b === a ? 0 : (i - a) / (b - a);
      drawData[i] = sA + (eA - sA) * t;
    }
  }
  drawPrevIdx = idx; drawPrevAmp = amp;
}
cvDraw.addEventListener('mousedown', (e) => { drawing = true; drawPrevIdx = -1; const p = drawPos(e); drawPlot(p.idx, p.amp); renderDrawCanvas(); e.preventDefault(); });
cvDraw.addEventListener('mousemove', (e) => { if (!drawing) return; const p = drawPos(e); drawPlot(p.idx, p.amp); renderDrawCanvas(); });
window.addEventListener('mouseup', () => { drawing = false; drawPrevIdx = -1; });
cvDraw.addEventListener('touchstart', (e) => { drawing = true; drawPrevIdx = -1; const p = drawPos(e); drawPlot(p.idx, p.amp); renderDrawCanvas(); e.preventDefault(); }, { passive: false });
cvDraw.addEventListener('touchmove', (e) => { if (!drawing) return; const p = drawPos(e); drawPlot(p.idx, p.amp); renderDrawCanvas(); e.preventDefault(); }, { passive: false });
cvDraw.addEventListener('touchend', () => { drawing = false; drawPrevIdx = -1; });

// ============================================
// FFT (anti-alias downsample için)
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
        re[b] = re[a] - tRe; im[b] = im[a] - tIm; re[a] += tRe; im[a] += tIm;
        const tw = wRe * wRe0 - wIm * wIm0; wIm = wRe * wIm0 + wIm * wRe0; wRe = tw;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

function antiAliasedDownsample(input, srIn, srOut) {
  if (srOut >= srIn) return Float64Array.from(input);
  const N_in = input.length;
  const M = nextPow2(N_in);
  const re = new Float64Array(M), im = new Float64Array(M);
  for (let i = 0; i < N_in; i++) re[i] = input[i];
  fft(re, im, M, false);
  const cutoffBin = Math.floor(srOut * M / (2 * srIn));
  for (let k = cutoffBin + 1; k < M - cutoffBin; k++) { re[k] = 0; im[k] = 0; }
  fft(re, im, M, true);
  const ratio = srIn / srOut;
  const N_out = Math.floor(N_in / ratio);
  const out = new Float64Array(N_out);
  for (let i = 0; i < N_out; i++) out[i] = re[Math.floor(i * ratio)];
  return out;
}

// ============================================
// SES YÜKLE / KAYIT
// ============================================
ui.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  ui.audioStatus.textContent = `Yükleniyor: ${file.name}...`;
  ui.audioStatus.className = 'status-msg';
  try {
    const arr = await file.arrayBuffer();
    const tmp = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await tmp.decodeAudioData(arr);
    onAudioReady(file.name);
  } catch (err) {
    ui.audioStatus.textContent = '✗ ' + err.message;
    ui.audioStatus.className = 'status-msg err';
  }
});

function onAudioReady(name) {
  const dur = audioBuffer.duration;
  ui.audioStatus.textContent = `✓ ${name} • ${dur.toFixed(2)}s • ${audioBuffer.sampleRate}Hz`;
  ui.audioStatus.className = 'status-msg ok';
  ui.cutStart.disabled = false; ui.cutLen.disabled = false; ui.useAudio.disabled = false;
  ui.cutStart.max = Math.max(0, dur - 0.05); ui.cutStart.value = 0;
  ui.cutLen.max = Math.min(dur, MAX_SECONDS); ui.cutLen.value = Math.min(2, dur);
  updateCutDisplays();
  drawSourceWave();
}

ui.micBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') { stopMic(); return; }
  try {
    const sr = parseInt(ui.targetSR.value);
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: sr, channelCount: 1 } });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(micStream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const arr = await blob.arrayBuffer();
      try {
        const tmp = new (window.AudioContext || window.webkitAudioContext)();
        audioBuffer = await tmp.decodeAudioData(arr);
        onAudioReady('Mikrofon Kaydı');
      } catch (err) {
        ui.audioStatus.textContent = '✗ ' + err.message; ui.audioStatus.className = 'status-msg err';
      }
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    };
    mediaRecorder.start();
    ui.micBtn.classList.add('recording'); ui.micBtn.textContent = '⏹ Durdur';
    ui.audioStatus.textContent = _t({tr: '● Kayıt yapılıyor... tekrar bas', en: '● Recording… press again to stop'});
    ui.audioStatus.className = 'status-msg';
  } catch (err) {
    ui.audioStatus.textContent = '✗ Mikrofon reddedildi'; ui.audioStatus.className = 'status-msg err';
  }
});
function stopMic() {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  ui.micBtn.classList.remove('recording'); ui.micBtn.textContent = '🎤 Kayıt';
}

function updateCutDisplays() {
  ui.cutStartVal.textContent = parseFloat(ui.cutStart.value).toFixed(2);
  ui.cutLenVal.textContent = parseFloat(ui.cutLen.value).toFixed(2);
}

function getAudioSegment() {
  const srOrig = audioBuffer.sampleRate;
  const startSec = parseFloat(ui.cutStart.value);
  const lenSec = Math.min(parseFloat(ui.cutLen.value), MAX_SECONDS);
  const startIdx = Math.floor(startSec * srOrig);
  const lenIdx = Math.floor(lenSec * srOrig);
  const ch0 = audioBuffer.getChannelData(0);
  const end = Math.min(startIdx + lenIdx, ch0.length);
  const raw = new Float64Array(end - startIdx);
  if (audioBuffer.numberOfChannels >= 2) {
    const ch1 = audioBuffer.getChannelData(1);
    for (let i = 0; i < raw.length; i++) raw[i] = 0.5 * (ch0[startIdx + i] + ch1[startIdx + i]);
  } else {
    for (let i = 0; i < raw.length; i++) raw[i] = ch0[startIdx + i];
  }
  const targetSR = parseInt(ui.targetSR.value);
  const ds = antiAliasedDownsample(raw, srOrig, targetSR);
  return { sig: ds, sr: targetSR };
}

ui.cutStart.addEventListener('input', () => { updateCutDisplays(); drawSourceWave(); });
ui.cutLen.addEventListener('input', () => { updateCutDisplays(); drawSourceWave(); });
ui.targetSR.addEventListener('change', () => { if (audioBuffer) drawSourceWave(); });

ui.useAudio.addEventListener('click', () => {
  if (!audioBuffer) return;
  const { sig, sr } = getAudioSegment();
  currentSignal = sig;
  signalSR = sr;
  isAudioSignal = true;
  runEMD();
});

function drawSourceWave() {
  const s = prep(cvSourceWave);
  s.ctx.clearRect(0, 0, s.w, s.h);
  drawGridMini(s.ctx, s.w, s.h);
  if (!audioBuffer) {
    s.ctx.fillStyle = 'rgba(180,190,220,0.4)'; s.ctx.font = '11px Consolas'; s.ctx.textAlign = 'center';
    s.ctx.fillText('ses yok', s.w / 2, s.h / 2); return;
  }
  const ch0 = audioBuffer.getChannelData(0);
  const dur = audioBuffer.duration;
  drawWaveform(s.ctx, s.w, s.h, ch0, '#7b8cff');
  // seçili bölge
  const x1 = (parseFloat(ui.cutStart.value) / dur) * s.w;
  const x2 = ((parseFloat(ui.cutStart.value) + parseFloat(ui.cutLen.value)) / dur) * s.w;
  s.ctx.fillStyle = 'rgba(255,79,154,0.18)'; s.ctx.fillRect(x1, 0, x2 - x1, s.h);
  s.ctx.strokeStyle = 'rgba(255,79,154,0.7)'; s.ctx.lineWidth = 1.5; s.ctx.setLineDash([4, 3]);
  s.ctx.beginPath(); s.ctx.moveTo(x1, 0); s.ctx.lineTo(x1, s.h); s.ctx.moveTo(x2, 0); s.ctx.lineTo(x2, s.h); s.ctx.stroke();
  s.ctx.setLineDash([]);
}

// ============================================
// EMD ÇALIŞTIR
// ============================================
function runEMD() {
  if (!currentSignal || currentSignal.length < 4) return;
  const maxIMF = Math.max(1, Math.min(15, parseInt(ui.maxIMF.value) || 6));

  const t0 = performance.now();
  const res = emd(currentSignal, maxIMF);
  const dt = performance.now() - t0;

  imfs = res.imfs;
  residual = res.residual;

  // Slider max'ları güncelle (IMF sayısı + residual katmanı)
  const nLayers = imfs.length + 1;  // +residual
  ui.layerSlider.max = nLayers;
  ui.reconKSlider.max = imfs.length;
  if (parseInt(ui.layerSlider.value) > nLayers) ui.layerSlider.value = nLayers;
  if (parseInt(ui.reconKSlider.value) > imfs.length) ui.reconKSlider.value = imfs.length;

  // İstatistik
  ui.statIMF.textContent = imfs.length + ' + residual';
  ui.statLen.textContent = `${currentSignal.length} örnek · ${signalSR}Hz`;
  ui.statTime.textContent = `${dt.toFixed(0)} ms`;

  ui.playOrig.disabled = false;
  ui.playRecon.disabled = false;
  ui.dlRecon.disabled = false;

  updateLayerVal();
  updateReconVal();
  drawStack();
  drawReconGraph();
}

// ============================================
// ÇİZİM YARDIMCILARI
// ============================================
function prep(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height, ctx };
}
function drawGridMini(ctx, w, h) {
  ctx.strokeStyle = 'rgba(100,160,255,0.1)'; ctx.lineWidth = 0.6;
  for (let i = 1; i < 8; i++) { const x = (i / 8) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(100,140,255,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
}
function drawWaveform(ctx, w, h, data, color) {
  if (!data || data.length === 0) return;
  let peak = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  if (peak === 0) peak = 1;
  const y0 = h / 2, yScale = (h / 2) * 0.9 / peak;
  ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  const spp = Math.max(1, Math.floor(data.length / w));
  if (spp <= 2) {
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w, y = y0 - data[i] * yScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      const sIdx = Math.floor((px / w) * data.length), eIdx = Math.min(data.length, Math.floor(((px + 1) / w) * data.length));
      let mn = 0, mx = 0;
      for (let i = sIdx; i < eIdx; i++) { if (data[i] < mn) mn = data[i]; if (data[i] > mx) mx = data[i]; }
      ctx.moveTo(px + 0.5, y0 - mx * yScale); ctx.lineTo(px + 0.5, y0 - mn * yScale);
    }
    ctx.stroke();
  }
}

// ── İSTİFLİ AYRIŞIM ──
function updateLayerVal() { ui.layerVal.textContent = ui.layerSlider.value; }
function updateReconVal() { ui.reconKVal.textContent = ui.reconKSlider.value; }

function drawStack() {
  const s = prep(cvStack);
  s.ctx.clearRect(0, 0, s.w, s.h);
  if (!currentSignal) {
    s.ctx.fillStyle = 'rgba(180,190,220,0.4)'; s.ctx.font = '14px Consolas'; s.ctx.textAlign = 'center';
    s.ctx.fillText(_t({tr: 'Bir sinyal seç ve EMD çalıştır', en: 'Select a signal and run EMD'}), s.w / 2, s.h / 2);
    return;
  }

  // Katman slider: kaç IMF gösterilecek (0 = sadece orijinal, n = +IMFn)
  const layer = parseInt(ui.layerSlider.value);

  // Gösterilecek satırlar: [orijinal, IMF1, IMF2, ..., (residual)]
  // layer=0 → sadece orijinal; layer=k → orijinal + IMF1..IMFk; layer=imfs.length+1 → +residual
  const rows = [{ label: 'Orijinal x(t)', data: currentSignal, color: '#39ff85' }];
  const imfColors = ['#ff8c42', '#ffd23f', '#ff4f9a', '#b490ff', '#4fd6ff', '#7bff8c', '#ff6b6b'];
  const showImfs = Math.min(layer, imfs.length);
  for (let i = 0; i < showImfs; i++) {
    rows.push({ label: `IMF${i + 1}`, data: imfs[i], color: imfColors[i % imfColors.length] });
  }
  if (layer > imfs.length && residual) {
    rows.push({ label: 'Residual r(t)', data: residual, color: '#9aa6c0' });
  }

  const n = rows.length;
  const rowH = s.h / n;
  // Her satırı kendi şeridinde çiz (DC offset = şerit ortası)
  rows.forEach((row, idx) => {
    const cy = idx * rowH + rowH / 2;  // şerit ortası (DC seviyesi)
    // Şerit ayraç çizgisi
    if (idx > 0) {
      s.ctx.strokeStyle = 'rgba(120,140,200,0.15)'; s.ctx.lineWidth = 1;
      s.ctx.beginPath(); s.ctx.moveTo(0, idx * rowH); s.ctx.lineTo(s.w, idx * rowH); s.ctx.stroke();
    }
    // DC çizgisi (şerit ortası)
    s.ctx.strokeStyle = 'rgba(120,140,200,0.25)'; s.ctx.lineWidth = 0.8; s.ctx.setLineDash([3, 4]);
    s.ctx.beginPath(); s.ctx.moveTo(0, cy); s.ctx.lineTo(s.w, cy); s.ctx.stroke(); s.ctx.setLineDash([]);
    // peak (bu şeritte)
    let peak = 0;
    for (let i = 0; i < row.data.length; i++) { const a = Math.abs(row.data[i]); if (a > peak) peak = a; }
    if (peak === 0) peak = 1;
    const yScale = (rowH / 2) * 0.8 / peak;
    // dalga
    s.ctx.strokeStyle = row.color; s.ctx.lineWidth = 1.4; s.ctx.shadowColor = row.color; s.ctx.shadowBlur = 2;
    const data = row.data;
    const spp = Math.max(1, Math.floor(data.length / s.w));
    s.ctx.beginPath();
    if (spp <= 2) {
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * s.w, y = cy - data[i] * yScale;
        if (i === 0) s.ctx.moveTo(x, y); else s.ctx.lineTo(x, y);
      }
    } else {
      for (let px = 0; px < s.w; px++) {
        const a = Math.floor((px / s.w) * data.length), b = Math.min(data.length, Math.floor(((px + 1) / s.w) * data.length));
        let mn = 0, mx = 0;
        for (let i = a; i < b; i++) { if (data[i] < mn) mn = data[i]; if (data[i] > mx) mx = data[i]; }
        s.ctx.moveTo(px + 0.5, cy - mx * yScale); s.ctx.lineTo(px + 0.5, cy - mn * yScale);
      }
    }
    s.ctx.stroke(); s.ctx.shadowBlur = 0;
    // etiket
    s.ctx.fillStyle = row.color; s.ctx.font = 'bold 12px Consolas, monospace'; s.ctx.textAlign = 'left';
    s.ctx.fillText(row.label, 8, cy - rowH / 2 + 16);
  });

  ui.stackInfo.textContent = `${rows.length} katman gösteriliyor (toplam ${imfs.length} IMF + residual)`;
}

// ── KISMİ YENİDEN İNŞA ──
function getReconstruction() {
  if (!residual) return null;
  const K = parseInt(ui.reconKSlider.value);
  const N = currentSignal.length;
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) out[i] = residual[i];
  for (let k = 0; k < K && k < imfs.length; k++)
    for (let i = 0; i < N; i++) out[i] += imfs[k][i];
  return out;
}

function drawReconGraph() {
  const s = prep(cvRecon);
  s.ctx.clearRect(0, 0, s.w, s.h);
  drawGridMini(s.ctx, s.w, s.h);
  if (!currentSignal) return;
  const recon = getReconstruction();
  // ortak peak
  let peak = 0;
  for (let i = 0; i < currentSignal.length; i++) peak = Math.max(peak, Math.abs(currentSignal[i]));
  if (peak === 0) peak = 1;
  const y0 = s.h / 2, yScale = (s.h / 2) * 0.9 / peak;
  // orijinal (soluk)
  drawWaveformScaled(s.ctx, s.w, s.h, currentSignal, 'rgba(57,255,133,0.3)', y0, yScale);
  // recon
  if (recon) drawWaveformScaled(s.ctx, s.w, s.h, recon, '#7b8cff', y0, yScale);

  // RMSE
  if (recon) {
    let e = 0;
    for (let i = 0; i < currentSignal.length; i++) e += (currentSignal[i] - recon[i]) ** 2;
    const rmse = Math.sqrt(e / currentSignal.length);
    ui.statRMSE.textContent = rmse.toExponential(2);
    const K = parseInt(ui.reconKSlider.value);
    ui.reconInfo.textContent = `residual + ilk ${K} IMF · RMSE = ${rmse.toExponential(2)}`;
  }
}
function drawWaveformScaled(ctx, w, h, data, color, y0, yScale) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.4;
  const spp = Math.max(1, Math.floor(data.length / w));
  ctx.beginPath();
  if (spp <= 2) {
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w, y = y0 - data[i] * yScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  } else {
    for (let px = 0; px < w; px++) {
      const a = Math.floor((px / w) * data.length), b = Math.min(data.length, Math.floor(((px + 1) / w) * data.length));
      let mn = 0, mx = 0;
      for (let i = a; i < b; i++) { if (data[i] < mn) mn = data[i]; if (data[i] > mx) mx = data[i]; }
      ctx.moveTo(px + 0.5, y0 - mx * yScale); ctx.lineTo(px + 0.5, y0 - mn * yScale);
    }
  }
  ctx.stroke();
}

// ============================================
// SLIDER OLAYLARI
// ============================================
ui.layerSlider.addEventListener('input', () => { updateLayerVal(); drawStack(); });
ui.reconKSlider.addEventListener('input', () => { updateReconVal(); drawReconGraph(); });
ui.maxIMF.addEventListener('change', () => { if (currentSignal) runEMD(); });

ui.aSlider.addEventListener('input', () => ui.aVal.textContent = parseFloat(ui.aSlider.value).toFixed(1));
ui.fSlider.addEventListener('input', () => ui.fVal.textContent = ui.fSlider.value);
ui.phSlider.addEventListener('input', () => ui.phVal.textContent = parseFloat(ui.phSlider.value).toFixed(2));
ui.drawDurSlider.addEventListener('input', () => ui.drawDurVal.textContent = parseFloat(ui.drawDurSlider.value).toFixed(1));
ui.drawSampSlider.addEventListener('input', () => ui.drawSampVal.textContent = ui.drawSampSlider.value);

// ============================================
// SES ÇALMA
// ============================================
function stopAllAudio() {
  if (currentSource) { try { currentSource.stop(); } catch (_) {} currentSource = null; }
}
function playSignal(data, sr) {
  stopAllAudio();
  // Normalize (sentetik sinyaller ±1 dışında olabilir)
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak === 0) peak = 1;
  const safe = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) safe[i] = 0.9 * data[i] / peak;

  // Web Audio API minimum 8000 Hz buffer ister — düşük örnekleme hızında
  // upsample edilmiş bir kopya çal (zero-order hold), aslına aynı süre çalar.
  const MIN_SR = 8000;
  let playSR = sr;
  let playBuf = safe;
  if (sr < MIN_SR) {
    playSR = MIN_SR;
    const ratio = MIN_SR / sr;
    const newLen = Math.round(safe.length * ratio);
    playBuf = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i / ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(safe.length - 1, i0 + 1);
      const t = srcIdx - i0;
      playBuf[i] = safe[i0] * (1 - t) + safe[i1] * t;  // lineer enterpolasyon
    }
  }

  try {
    const playCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = playCtx.createBuffer(1, playBuf.length, playSR);
    buf.getChannelData(0).set(playBuf);
    const src = playCtx.createBufferSource();
    src.buffer = buf; src.connect(playCtx.destination);
    src.onended = () => { if (currentSource === src) currentSource = null; try { playCtx.close(); } catch (_) {} };
    src.start(); currentSource = src;
  } catch (err) {
    console.error('Ses çalma hatası:', err);
    ui.audioStatus.textContent = '✗ Ses çalınamadı: ' + err.message;
    ui.audioStatus.className = 'status-msg err';
  }
}
ui.playOrig.addEventListener('click', () => { if (currentSignal) playSignal(currentSignal, signalSR); });
ui.playRecon.addEventListener('click', () => { const r = getReconstruction(); if (r) playSignal(r, signalSR); });
ui.stopAll.addEventListener('click', stopAllAudio);

// WAV indir
function encodeWav(samples, sr) {
  let peak = 0; for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak === 0) peak = 1;

  // Minimum 8000 Hz: çoğu oynatıcı/Web Audio bunun altında sorun yaşar
  const MIN_SR = 8000;
  let outSR = sr;
  let outSamples = samples;
  if (sr < MIN_SR) {
    outSR = MIN_SR;
    const ratio = MIN_SR / sr;
    const newLen = Math.round(samples.length * ratio);
    outSamples = new Float64Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i / ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(samples.length - 1, i0 + 1);
      const t = srcIdx - i0;
      outSamples[i] = samples[i0] * (1 - t) + samples[i1] * t;
    }
  }

  const buffer = new ArrayBuffer(44 + outSamples.length * 2);
  const view = new DataView(buffer);
  const wStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  wStr(0, 'RIFF'); view.setUint32(4, 36 + outSamples.length * 2, true); wStr(8, 'WAVE'); wStr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, outSR, true); view.setUint32(28, outSR * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); wStr(36, 'data'); view.setUint32(40, outSamples.length * 2, true);
  let o = 44;
  for (let i = 0; i < outSamples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, 0.9 * outSamples[i] / peak));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
ui.dlRecon.addEventListener('click', () => {
  const r = getReconstruction();
  if (!r) return;
  const blob = encodeWav(r, signalSR);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'emd_reconstruct.wav';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ============================================
// ARKAPLAN
// ============================================
function initBg() {
  const c = document.getElementById('bgCanvas'); const ctx = c.getContext('2d');
  const rs = () => { c.width = innerWidth; c.height = innerHeight; }; rs(); window.addEventListener('resize', rs);
  const pts = [];
  for (let i = 0; i < 50; i++) pts.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.2 + 0.3, dx: (Math.random() - 0.5) * 0.18, dy: (Math.random() - 0.5) * 0.1, a: Math.random() * 0.18 + 0.03 });
  (function lp() {
    ctx.clearRect(0, 0, c.width, c.height);
    const t = Date.now() * 0.0003;
    ctx.strokeStyle = 'rgba(80,120,255,0.025)'; ctx.lineWidth = 1;
    for (let w = 0; w < 3; w++) {
      ctx.beginPath();
      for (let x = 0; x < c.width; x += 5) { const y = c.height * 0.5 + Math.sin(x * 0.004 + t + w * 2) * 50; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (const p of pts) {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0; if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
      ctx.fillStyle = `rgba(100,160,255,${p.a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(lp);
  })();
}

window.addEventListener('resize', () => { drawStack(); drawReconGraph(); drawSourceWave(); });

// ============================================
// BAŞLAT
// ============================================
initBg();
renderCompList();
drawSourceWave();
drawStack();
drawReconGraph();
