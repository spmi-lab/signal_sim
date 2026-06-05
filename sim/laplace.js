/* ============================================
   LAPLACE 3D — s-düzlemi, kutup/sıfır, jΩ Fourier
   2D (heatmap + tıkla-ekle) + 3D yüzey + animasyonlu frekans yanıtı
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
const _t_sn = () => _t({tr: 'sn', en: 's'});
// === DURUM ===
const STATE = {
  poles: [],         // {re, im}
  zeros: [],
  rotX: 35 * Math.PI / 180,
  rotY: -55 * Math.PI / 180,
  zoom: 1.2,
  cap: 5,
  gridRes: 0.4,
  showSurface: true,
  showJOmega: true,
  showGrid: true,
  showDist: true,
  sigmaRange: 4,     // -4..+4
  omegaRange: 6,     // -6..+6
  mouseMode: 'pole', // 'pole' | 'zero'
  // animasyon
  omega: 0,
  speed: 1,
  playing: false,
  lastTime: 0,
};

// === UI ===
const ui = {
  pzList: document.getElementById('pzList'),
  addRe: document.getElementById('addRe'),
  addIm: document.getElementById('addIm'),
  rotX: document.getElementById('rotX'),
  rotY: document.getElementById('rotY'),
  rotXVal: document.getElementById('rotXVal'),
  rotYVal: document.getElementById('rotYVal'),
  zoom: document.getElementById('zoom'),
  zoomVal: document.getElementById('zoomVal'),
  cap: document.getElementById('cap'),
  capVal: document.getElementById('capVal'),
  gridRes: document.getElementById('gridRes'),
  gridResVal: document.getElementById('gridResVal'),
  showSurface: document.getElementById('showSurface'),
  showJOmega: document.getElementById('showJOmega'),
  showGrid: document.getElementById('showGrid'),
  showDist: document.getElementById('showDist'),
  nPoles: document.getElementById('nPoles'),
  nZeros: document.getElementById('nZeros'),
  stability: document.getElementById('stability'),
  modePole: document.getElementById('modePole'),
  modeZero: document.getElementById('modeZero'),
  // playback
  playBtn: document.getElementById('playBtn'),
  omegaSlider: document.getElementById('omegaSlider'),
  speed: document.getElementById('speed'),
  speedVal: document.getElementById('speedVal'),
  omegaDisplay: document.getElementById('omegaDisplay'),
  freqLive: document.getElementById('freqLive'),
};

// === H(s) hesabı ===
function magH(sRe, sIm) {
  let numRe = 1, numIm = 0;
  let denRe = 1, denIm = 0;

  for (const z of STATE.zeros) {
    const dRe = sRe - z.re;
    const dIm = sIm - z.im;
    const nr = numRe * dRe - numIm * dIm;
    const ni = numRe * dIm + numIm * dRe;
    numRe = nr; numIm = ni;
  }
  for (const p of STATE.poles) {
    const dRe = sRe - p.re;
    const dIm = sIm - p.im;
    const nr = denRe * dRe - denIm * dIm;
    const ni = denRe * dIm + denIm * dRe;
    denRe = nr; denIm = ni;
  }

  const numMag = Math.sqrt(numRe * numRe + numIm * numIm);
  const denMag = Math.sqrt(denRe * denRe + denIm * denIm);
  if (denMag < 1e-10) return STATE.cap * 2;
  return numMag / denMag;
}

// === CANVAS REFERANSLARI ===
const cv2d   = document.getElementById('cv2d');
const ctx2d  = cv2d.getContext('2d');
const cv3d   = document.getElementById('cv3d');
const ctx3d  = cv3d.getContext('2d');
const cvFreq = document.getElementById('cvFreq');
const ctxFreq = cvFreq.getContext('2d');

function fitCanvas(cv, ctx) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width  = Math.max(1, Math.floor(r.width  * dpr));
  cv.height = Math.max(1, Math.floor(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height, dpr };
}

function isLight() { return document.body.classList.contains('light-theme'); }

function colors() {
  const light = isLight();
  return {
    grid:        light ? 'rgba(40,70,170,0.30)'  : 'rgba(120,140,200,0.22)',
    gridStrong:  light ? 'rgba(20,40,140,0.55)'  : 'rgba(180,200,255,0.45)',
    surfaceLine: light ? 'rgba(40,70,170,0.4)'   : 'rgba(120,160,255,0.55)',
    jOmegaAxis:  light ? '#a8430a'               : '#ff8c42',
    sigmaAxis:   light ? '#0e6e2e'               : '#39ff85',
    pole:        light ? '#b01e6a'               : '#ff4f9a',
    zero:        light ? '#0e6e2e'               : '#39ff85',
    freqLine:    light ? '#a8430a'               : '#ff8c42',
    movePt:      light ? '#d8195a'               : '#ff3366',
    distP:       light ? 'rgba(176,30,106,0.55)' : 'rgba(255,79,154,0.6)',
    distZ:       light ? 'rgba(14,110,46,0.55)'  : 'rgba(57,255,133,0.6)',
    label:       light ? '#0d1226'               : '#e2e6f0',
    labelDim:    light ? '#3a4060'               : '#7a82a6',
    bg:          light ? '#ffffff'               : 'rgba(4,4,18,0.5)',
  };
}

/* =========================================================
   2D s-DÜZLEMİ
   ========================================================= */
function s2px(sigma, omega, size) {
  const R = STATE.sigmaRange, RO = STATE.omegaRange;
  const x = (sigma + R) / (2 * R) * size.w;
  const y = (RO - omega) / (2 * RO) * size.h;
  return { x, y };
}
function px2s(px, py, size) {
  const R = STATE.sigmaRange, RO = STATE.omegaRange;
  const sigma = -R + (2 * R) * (px / size.w);
  const omega = RO  - (2 * RO) * (py / size.h);
  return { sigma, omega };
}

function draw2D() {
  const size = fitCanvas(cv2d, ctx2d);
  const C = colors();
  ctx2d.fillStyle = C.bg;
  ctx2d.fillRect(0, 0, size.w, size.h);

  const R = STATE.sigmaRange, RO = STATE.omegaRange;

  // Kararsızlık bölgesi (sağ yarı düzlem) hafif kırmızı tint
  const xAx = s2px(0, 0, size).x;
  const yAx = s2px(0, 0, size).y;
  ctx2d.fillStyle = isLight() ? 'rgba(255,80,100,0.05)' : 'rgba(255,80,100,0.07)';
  ctx2d.fillRect(xAx, 0, size.w - xAx, size.h);

  // Grid (3D'deki gibi ince çizgili — yarım birim aralıklı)
  if (STATE.showGrid) {
    ctx2d.strokeStyle = C.grid;
    ctx2d.lineWidth = 0.5;
    // Dikey çizgiler (sabit σ)
    for (let s = -R; s <= R; s += 0.5) {
      const p = s2px(s, 0, size);
      ctx2d.beginPath();
      ctx2d.moveTo(p.x, 0); ctx2d.lineTo(p.x, size.h);
      ctx2d.stroke();
    }
    // Yatay çizgiler (sabit Ω)
    for (let o = -RO; o <= RO; o += 0.5) {
      const p = s2px(0, o, size);
      ctx2d.beginPath();
      ctx2d.moveTo(0, p.y); ctx2d.lineTo(size.w, p.y);
      ctx2d.stroke();
    }
    // Tam sayı çizgileri daha belirgin
    ctx2d.strokeStyle = C.gridStrong;
    ctx2d.lineWidth = 0.7;
    for (let s = -R; s <= R; s++) {
      const p = s2px(s, 0, size);
      ctx2d.beginPath();
      ctx2d.moveTo(p.x, 0); ctx2d.lineTo(p.x, size.h);
      ctx2d.stroke();
    }
    for (let o = -RO; o <= RO; o++) {
      const p = s2px(0, o, size);
      ctx2d.beginPath();
      ctx2d.moveTo(0, p.y); ctx2d.lineTo(size.w, p.y);
      ctx2d.stroke();
    }
  }

  // Eksenler
  ctx2d.lineWidth = 1.8;
  // σ ekseni (yatay, ω=0)
  ctx2d.strokeStyle = C.sigmaAxis;
  ctx2d.beginPath();
  ctx2d.moveTo(0, yAx); ctx2d.lineTo(size.w, yAx);
  ctx2d.stroke();
  // jΩ ekseni (dikey, σ=0)
  ctx2d.strokeStyle = C.jOmegaAxis;
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.moveTo(xAx, 0); ctx2d.lineTo(xAx, size.h);
  ctx2d.stroke();

  // Pozitif yön ok başları — "+" işaretleri
  // σ pozitif → sağ uç
  ctx2d.fillStyle = C.sigmaAxis;
  ctx2d.font = 'bold 14px "Saira Condensed", sans-serif';
  ctx2d.fillText('+σ', size.w - 26, yAx - 8);
  ctx2d.font = 'bold 11px "Saira Condensed", sans-serif';
  ctx2d.fillText('−σ', 4, yAx - 8);
  // Ok ucu (sağ)
  ctx2d.strokeStyle = C.sigmaAxis;
  ctx2d.lineWidth = 1.8;
  ctx2d.beginPath();
  ctx2d.moveTo(size.w - 1, yAx); ctx2d.lineTo(size.w - 8, yAx - 4);
  ctx2d.moveTo(size.w - 1, yAx); ctx2d.lineTo(size.w - 8, yAx + 4);
  ctx2d.stroke();

  // jΩ pozitif → üst uç
  ctx2d.fillStyle = C.jOmegaAxis;
  ctx2d.font = 'bold 14px "Saira Condensed", sans-serif';
  ctx2d.fillText('+jΩ', xAx + 8, 14);
  ctx2d.font = 'bold 11px "Saira Condensed", sans-serif';
  ctx2d.fillText('−jΩ', xAx + 8, size.h - 6);
  // Ok ucu (üst)
  ctx2d.strokeStyle = C.jOmegaAxis;
  ctx2d.lineWidth = 1.8;
  ctx2d.beginPath();
  ctx2d.moveTo(xAx, 1); ctx2d.lineTo(xAx - 4, 8);
  ctx2d.moveTo(xAx, 1); ctx2d.lineTo(xAx + 4, 8);
  ctx2d.stroke();

  // Tam sayı tick etiketleri (eksen üzeri)
  ctx2d.fillStyle = C.labelDim;
  ctx2d.font = '9px "Fira Code", monospace';
  for (let s = -R; s <= R; s++) {
    if (s === 0) continue;
    const p = s2px(s, 0, size);
    ctx2d.fillText(String(s), p.x + 2, yAx + 11);
  }
  for (let o = -RO; o <= RO; o++) {
    if (o === 0) continue;
    const p = s2px(0, o, size);
    ctx2d.fillText(String(o), xAx - 16, p.y + 3);
  }

  // Kutuplar
  ctx2d.lineWidth = 2.5;
  for (const p of STATE.poles) {
    const pt = s2px(p.re, p.im, size);
    ctx2d.strokeStyle = C.pole;
    ctx2d.shadowColor = C.pole; ctx2d.shadowBlur = 8;
    ctx2d.beginPath();
    ctx2d.moveTo(pt.x - 7, pt.y - 7); ctx2d.lineTo(pt.x + 7, pt.y + 7);
    ctx2d.moveTo(pt.x + 7, pt.y - 7); ctx2d.lineTo(pt.x - 7, pt.y + 7);
    ctx2d.stroke();
  }
  // Sıfırlar
  for (const z of STATE.zeros) {
    const pt = s2px(z.re, z.im, size);
    ctx2d.strokeStyle = C.zero;
    ctx2d.shadowColor = C.zero; ctx2d.shadowBlur = 8;
    ctx2d.beginPath();
    ctx2d.arc(pt.x, pt.y, 6.5, 0, Math.PI * 2);
    ctx2d.stroke();
  }
  ctx2d.shadowBlur = 0;

  // Hareketli nokta + uzaklık çizgileri
  const movePt = s2px(0, STATE.omega, size);
  if (STATE.showDist) {
    ctx2d.lineWidth = 1.2;
    for (const p of STATE.poles) {
      const pt = s2px(p.re, p.im, size);
      ctx2d.strokeStyle = C.distP;
      ctx2d.setLineDash([4, 3]);
      ctx2d.beginPath();
      ctx2d.moveTo(movePt.x, movePt.y); ctx2d.lineTo(pt.x, pt.y);
      ctx2d.stroke();
    }
    for (const z of STATE.zeros) {
      const pt = s2px(z.re, z.im, size);
      ctx2d.strokeStyle = C.distZ;
      ctx2d.setLineDash([4, 3]);
      ctx2d.beginPath();
      ctx2d.moveTo(movePt.x, movePt.y); ctx2d.lineTo(pt.x, pt.y);
      ctx2d.stroke();
    }
    ctx2d.setLineDash([]);
  }
  // Hareketli kırmızı nokta
  ctx2d.fillStyle = C.movePt;
  ctx2d.shadowColor = C.movePt; ctx2d.shadowBlur = 12;
  ctx2d.beginPath();
  ctx2d.arc(movePt.x, movePt.y, 6, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.shadowBlur = 0;
  // Halka
  ctx2d.strokeStyle = C.movePt;
  ctx2d.lineWidth = 1.5;
  ctx2d.beginPath();
  ctx2d.arc(movePt.x, movePt.y, 10, 0, Math.PI * 2);
  ctx2d.stroke();
}

/* =========================================================
   3D YÜZEY (orijinal, projeksiyonlu)
   ========================================================= */
function project(x, y, z, cv) {
  const cosY = Math.cos(STATE.rotY), sinY = Math.sin(STATE.rotY);
  let x1 = x * cosY + z * sinY;
  let z1 = -x * sinY + z * cosY;
  const cosX = Math.cos(STATE.rotX), sinX = Math.sin(STATE.rotX);
  let y2 = y * cosX - z1 * sinX;
  let z2 = y * sinX + z1 * cosX;
  const dist = 18;
  const persp = dist / (dist + z2 + 5);
  const scale = 38 * STATE.zoom * persp;
  return {
    sx: cv.width / 2 + x1 * scale,
    sy: cv.height / 2 - y2 * scale,
    depth: z2, persp,
  };
}

function drawAxes3D(size) {
  const C = colors();
  const R = STATE.sigmaRange, RO = STATE.omegaRange;
  const cv = { width: size.w, height: size.h };

  if (STATE.showGrid) {
    ctx3d.strokeStyle = C.grid;
    ctx3d.lineWidth = 0.6;
    for (let omega = -RO; omega <= RO; omega++) {
      ctx3d.beginPath();
      let first = true;
      for (let s = -R; s <= R; s += 0.4) {
        const p = project(s, 0, omega, cv);
        if (first) { ctx3d.moveTo(p.sx, p.sy); first = false; }
        else       ctx3d.lineTo(p.sx, p.sy);
      }
      ctx3d.stroke();
    }
    for (let s = -R; s <= R; s++) {
      ctx3d.beginPath();
      let first = true;
      for (let omega = -RO; omega <= RO; omega += 0.4) {
        const p = project(s, 0, omega, cv);
        if (first) { ctx3d.moveTo(p.sx, p.sy); first = false; }
        else       ctx3d.lineTo(p.sx, p.sy);
      }
      ctx3d.stroke();
    }
  }

  // σ ekseni
  ctx3d.strokeStyle = C.sigmaAxis;
  ctx3d.lineWidth = 1.6;
  ctx3d.beginPath();
  let p0 = project(-R, 0, 0, cv);
  ctx3d.moveTo(p0.sx, p0.sy);
  let p1 = project(R, 0, 0, cv);
  ctx3d.lineTo(p1.sx, p1.sy);
  ctx3d.stroke();
  ctx3d.fillStyle = C.sigmaAxis;
  ctx3d.font = 'bold 14px "Saira Condensed", sans-serif';
  let pl = project(R + 0.5, 0, 0, cv);
  ctx3d.fillText('+σ', pl.sx, pl.sy);
  ctx3d.font = 'bold 10px "Saira Condensed", sans-serif';
  let pln = project(-R - 0.4, 0, 0, cv);
  ctx3d.fillText('−σ', pln.sx - 14, pln.sy);

  // jΩ ekseni
  ctx3d.strokeStyle = C.jOmegaAxis;
  ctx3d.lineWidth = 2;
  ctx3d.beginPath();
  let q0 = project(0, 0, -RO, cv);
  ctx3d.moveTo(q0.sx, q0.sy);
  let q1 = project(0, 0, RO, cv);
  ctx3d.lineTo(q1.sx, q1.sy);
  ctx3d.stroke();
  ctx3d.fillStyle = C.jOmegaAxis;
  ctx3d.font = 'bold 14px "Saira Condensed", sans-serif';
  let ql = project(0, 0, RO + 0.5, cv);
  ctx3d.fillText('+jΩ', ql.sx, ql.sy);
  ctx3d.font = 'bold 10px "Saira Condensed", sans-serif';
  let qln = project(0, 0, -RO - 0.4, cv);
  ctx3d.fillText('−jΩ', qln.sx - 18, qln.sy);

  // Y referans çubuğu
  ctx3d.strokeStyle = C.labelDim;
  ctx3d.lineWidth = 0.8;
  ctx3d.setLineDash([3, 3]);
  ctx3d.beginPath();
  let v0 = project(0, 0, 0, cv);
  ctx3d.moveTo(v0.sx, v0.sy);
  let v1 = project(0, STATE.cap, 0, cv);
  ctx3d.lineTo(v1.sx, v1.sy);
  ctx3d.stroke();
  ctx3d.setLineDash([]);
  ctx3d.fillStyle = C.labelDim;
  ctx3d.font = '10px "Saira", sans-serif';
  ctx3d.fillText('|H(s)|', v1.sx + 5, v1.sy);
}

function drawSurface3D(size) {
  if (!STATE.showSurface) return;
  const C = colors();
  const R = STATE.sigmaRange, RO = STATE.omegaRange;
  const STEP = STATE.gridRes;
  const cv = { width: size.w, height: size.h };

  ctx3d.strokeStyle = C.surfaceLine;
  ctx3d.lineWidth = 0.7;

  for (let omega = -RO; omega <= RO; omega += STEP) {
    ctx3d.beginPath();
    let first = true;
    for (let s = -R; s <= R; s += STEP) {
      const m = Math.min(STATE.cap, magH(s, omega));
      const p = project(s, m, omega, cv);
      if (first) { ctx3d.moveTo(p.sx, p.sy); first = false; }
      else       ctx3d.lineTo(p.sx, p.sy);
    }
    ctx3d.stroke();
  }
  for (let s = -R; s <= R; s += STEP) {
    ctx3d.beginPath();
    let first = true;
    for (let omega = -RO; omega <= RO; omega += STEP) {
      const m = Math.min(STATE.cap, magH(s, omega));
      const p = project(s, m, omega, cv);
      if (first) { ctx3d.moveTo(p.sx, p.sy); first = false; }
      else       ctx3d.lineTo(p.sx, p.sy);
    }
    ctx3d.stroke();
  }
}

function drawJOmegaCurve3D(size) {
  if (!STATE.showJOmega) return;
  const C = colors();
  const RO = STATE.omegaRange;
  const STEP = 0.06;
  const cv = { width: size.w, height: size.h };

  ctx3d.strokeStyle = C.freqLine;
  ctx3d.lineWidth = 2.5;
  ctx3d.shadowColor = C.freqLine; ctx3d.shadowBlur = 5;
  ctx3d.beginPath();
  let first = true;
  for (let omega = -RO; omega <= RO; omega += STEP) {
    const m = Math.min(STATE.cap, magH(0, omega));
    const p = project(0, m, omega, cv);
    if (first) { ctx3d.moveTo(p.sx, p.sy); first = false; }
    else       ctx3d.lineTo(p.sx, p.sy);
  }
  ctx3d.stroke();
  ctx3d.shadowBlur = 0;

  // Hareketli nokta (3D üzerinde)
  const m = Math.min(STATE.cap, magH(0, STATE.omega));
  const p = project(0, m, STATE.omega, cv);
  ctx3d.fillStyle = C.movePt;
  ctx3d.shadowColor = C.movePt; ctx3d.shadowBlur = 12;
  ctx3d.beginPath();
  ctx3d.arc(p.sx, p.sy, 5, 0, Math.PI * 2);
  ctx3d.fill();
  ctx3d.shadowBlur = 0;
  // jΩ üzerindeki nokta için yere düşen referans
  const p0 = project(0, 0, STATE.omega, cv);
  ctx3d.strokeStyle = C.movePt;
  ctx3d.lineWidth = 1;
  ctx3d.setLineDash([3, 3]);
  ctx3d.beginPath(); ctx3d.moveTo(p.sx, p.sy); ctx3d.lineTo(p0.sx, p0.sy); ctx3d.stroke();
  ctx3d.setLineDash([]);
}

function drawPolesZeros3D(size) {
  const C = colors();
  const cv = { width: size.w, height: size.h };
  ctx3d.lineWidth = 2.5;
  for (const p of STATE.poles) {
    const proj = project(p.re, 0, p.im, cv);
    ctx3d.strokeStyle = C.pole;
    ctx3d.shadowColor = C.pole; ctx3d.shadowBlur = 6;
    ctx3d.beginPath();
    ctx3d.moveTo(proj.sx - 7, proj.sy - 7); ctx3d.lineTo(proj.sx + 7, proj.sy + 7);
    ctx3d.moveTo(proj.sx + 7, proj.sy - 7); ctx3d.lineTo(proj.sx - 7, proj.sy + 7);
    ctx3d.stroke();
  }
  for (const z of STATE.zeros) {
    const proj = project(z.re, 0, z.im, cv);
    ctx3d.strokeStyle = C.zero;
    ctx3d.shadowColor = C.zero; ctx3d.shadowBlur = 6;
    ctx3d.beginPath();
    ctx3d.arc(proj.sx, proj.sy, 6.5, 0, Math.PI * 2);
    ctx3d.stroke();
  }
  ctx3d.shadowBlur = 0;
}

function draw3D() {
  const size = fitCanvas(cv3d, ctx3d);
  const C = colors();
  ctx3d.fillStyle = C.bg;
  ctx3d.fillRect(0, 0, size.w, size.h);
  drawAxes3D(size);
  drawSurface3D(size);
  drawJOmegaCurve3D(size);
  drawPolesZeros3D(size);
}

/* =========================================================
   FREKANS YANITI (animasyon + hareketli nokta)
   ========================================================= */
function drawFreqResponse() {
  const size = fitCanvas(cvFreq, ctxFreq);
  const C = colors();
  ctxFreq.fillStyle = C.bg;
  ctxFreq.fillRect(0, 0, size.w, size.h);

  const RO = STATE.omegaRange;
  const N = 500;
  const values = [];
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const omega = -RO + (2 * RO) * i / (N - 1);
    const m = magH(0, omega);
    values.push({ omega, m });
    if (m > peak && isFinite(m)) peak = m;
  }
  if (peak === 0) peak = 1;
  const yMax = Math.min(peak, STATE.cap);
  const yScale = (size.h - 30) / yMax;
  const yBase = size.h - 18;

  // Grid
  ctxFreq.strokeStyle = C.grid;
  ctxFreq.lineWidth = 0.6;
  for (let k = -RO; k <= RO; k++) {
    const x = (k + RO) / (2 * RO) * size.w;
    ctxFreq.beginPath();
    ctxFreq.moveTo(x, 0); ctxFreq.lineTo(x, size.h - 18);
    ctxFreq.stroke();
  }
  for (let i = 1; i <= 4; i++) {
    const y = yBase - i * (yBase / 5);
    ctxFreq.beginPath();
    ctxFreq.moveTo(0, y); ctxFreq.lineTo(size.w, y);
    ctxFreq.stroke();
  }
  // Ω=0 ekseni
  const x0 = size.w / 2;
  ctxFreq.strokeStyle = C.gridStrong;
  ctxFreq.lineWidth = 1;
  ctxFreq.beginPath();
  ctxFreq.moveTo(x0, 0); ctxFreq.lineTo(x0, yBase);
  ctxFreq.moveTo(0, yBase); ctxFreq.lineTo(size.w, yBase);
  ctxFreq.stroke();

  // Eğri (gradient dolgu)
  ctxFreq.strokeStyle = C.freqLine;
  ctxFreq.lineWidth = 2;
  ctxFreq.shadowColor = C.freqLine; ctxFreq.shadowBlur = 6;
  ctxFreq.beginPath();
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const x = (v.omega + RO) / (2 * RO) * size.w;
    const y = yBase - Math.min(v.m, STATE.cap) * yScale;
    if (i === 0) ctxFreq.moveTo(x, y); else ctxFreq.lineTo(x, y);
  }
  ctxFreq.stroke();
  ctxFreq.shadowBlur = 0;

  // Doldurma
  ctxFreq.lineTo(size.w, yBase);
  ctxFreq.lineTo(0, yBase);
  ctxFreq.closePath();
  const grad = ctxFreq.createLinearGradient(0, 0, 0, yBase);
  grad.addColorStop(0, 'rgba(255,140,66,0.32)');
  grad.addColorStop(1, 'rgba(255,140,66,0.02)');
  ctxFreq.fillStyle = grad;
  ctxFreq.fill();

  // Hareketli nokta
  const mNow = magH(0, STATE.omega);
  const xNow = (STATE.omega + RO) / (2 * RO) * size.w;
  const yNow = yBase - Math.min(mNow, STATE.cap) * yScale;
  // Dikey çizgi
  ctxFreq.strokeStyle = C.movePt;
  ctxFreq.lineWidth = 1.2;
  ctxFreq.setLineDash([4, 3]);
  ctxFreq.beginPath();
  ctxFreq.moveTo(xNow, 0); ctxFreq.lineTo(xNow, yBase);
  ctxFreq.stroke();
  ctxFreq.setLineDash([]);
  // Nokta
  ctxFreq.fillStyle = C.movePt;
  ctxFreq.shadowColor = C.movePt; ctxFreq.shadowBlur = 12;
  ctxFreq.beginPath();
  ctxFreq.arc(xNow, yNow, 6, 0, Math.PI * 2);
  ctxFreq.fill();
  ctxFreq.shadowBlur = 0;
  ctxFreq.strokeStyle = C.movePt;
  ctxFreq.lineWidth = 1.5;
  ctxFreq.beginPath();
  ctxFreq.arc(xNow, yNow, 10, 0, Math.PI * 2);
  ctxFreq.stroke();

  // Etiketler
  ctxFreq.fillStyle = C.label;
  ctxFreq.font = '10px "Fira Code", monospace';
  ctxFreq.fillText('Ω = -' + RO, 4, size.h - 4);
  ctxFreq.fillText('Ω = +' + RO, size.w - 52, size.h - 4);
  ctxFreq.fillText('Ω = 0', x0 + 4, size.h - 4);
  ctxFreq.fillStyle = C.freqLine;
  ctxFreq.font = 'bold 11px "Saira Condensed", sans-serif';
  ctxFreq.fillText('|H(jΩ)|', 6, 14);
  // tepe değer etiketi
  ctxFreq.fillStyle = C.labelDim;
  ctxFreq.font = '10px "Fira Code", monospace';
  ctxFreq.fillText('max ≈ ' + yMax.toFixed(2), size.w - 96, 14);
}

/* =========================================================
   KUTUP / SIFIR YÖNETİMİ
   ========================================================= */
function renderList() {
  ui.pzList.innerHTML = '';
  const items = [
    ...STATE.poles.map((p, i) => ({ type: 'pole', idx: i, pt: p })),
    ...STATE.zeros.map((z, i) => ({ type: 'zero', idx: i, pt: z })),
  ];
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'pz-item ' + it.type;
    const tag = it.type === 'pole' ? 'P' : 'Z';
    const tagClass = it.type === 'pole' ? 'p' : 'z';
    div.innerHTML = `
      <span class="pz-tag ${tagClass}">${tag}${it.idx + 1}</span>
      <span class="pz-coords">σ = ${it.pt.re.toFixed(2)}, Ω = ${it.pt.im.toFixed(2)}</span>
      <span class="pz-rm" data-type="${it.type}" data-idx="${it.idx}">✕</span>
    `;
    ui.pzList.appendChild(div);
  }
  ui.pzList.querySelectorAll('.pz-rm').forEach(el => {
    el.onclick = () => {
      const t = el.dataset.type;
      const i = parseInt(el.dataset.idx);
      if (t === 'pole') STATE.poles.splice(i, 1);
      else STATE.zeros.splice(i, 1);
      updateAll();
    };
  });
  const unstable = STATE.poles.some(p => p.re >= 0);
  ui.stability.textContent = STATE.poles.length === 0 ? '—' : (unstable ? _t({tr: '⚠ Kararsız', en: '⚠ Unstable'}) : _t({tr: '✓ Kararlı', en: '✓ Stable'}));
  ui.stability.style.color = STATE.poles.length === 0 ? '' : (unstable ? '#ff5577' : 'var(--accent-1)');
  ui.nPoles.textContent = STATE.poles.length;
  ui.nZeros.textContent = STATE.zeros.length;
}

function addPointAt(type, re, im) {
  const pt = { re, im };
  const arr = (type === 'pole') ? STATE.poles : STATE.zeros;
  arr.push(pt);
  if (Math.abs(im) > 0.05) arr.push({ re, im: -im });
  updateAll();
}
window.addPoint = function (type) {
  const re = parseFloat(ui.addRe.value);
  const im = parseFloat(ui.addIm.value);
  if (isNaN(re) || isNaN(im)) return;
  addPointAt(type, re, im);
};

window.loadPreset = function (name) {
  STATE.poles = []; STATE.zeros = [];
  switch (name) {
    case 'lp1':
      STATE.poles.push({ re: -1, im: 0 });
      break;
    case 'lp2':
      STATE.poles.push({ re: -0.7, im: 0.7 });
      STATE.poles.push({ re: -0.7, im: -0.7 });
      break;
    case 'bp':
      STATE.poles.push({ re: -0.3, im: 2 });
      STATE.poles.push({ re: -0.3, im: -2 });
      STATE.zeros.push({ re: 0, im: 0 });
      break;
    case 'notch':
      STATE.zeros.push({ re: 0, im: 2 });
      STATE.zeros.push({ re: 0, im: -2 });
      STATE.poles.push({ re: -0.5, im: 2 });
      STATE.poles.push({ re: -0.5, im: -2 });
      break;
    case 'clear':
    default:
      break;
  }
  updateAll();
};

window.setMouseMode = function (mode) {
  STATE.mouseMode = mode;
  ui.modePole.classList.toggle('active', mode === 'pole');
  ui.modeZero.classList.toggle('active', mode === 'zero');
};

/* =========================================================
   FARE / ETKILEŞIM
   ========================================================= */
function findNearestPZ(sigma, omega, threshold = 0.3) {
  let best = null, bestD = threshold;
  STATE.poles.forEach((p, i) => {
    const d = Math.hypot(p.re - sigma, p.im - omega);
    if (d < bestD) { bestD = d; best = { type: 'pole', idx: i }; }
  });
  STATE.zeros.forEach((z, i) => {
    const d = Math.hypot(z.re - sigma, z.im - omega);
    if (d < bestD) { bestD = d; best = { type: 'zero', idx: i }; }
  });
  return best;
}

// 2D — sol tık: ekle/sürükle, sağ tık: en yakın kutup/sıfırı sil
let drag2D = null;
// Sağ tık menüsünü engelle
cv2d.addEventListener('contextmenu', (e) => e.preventDefault());
cv2d.addEventListener('mousedown', (e) => {
  const r = cv2d.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const size = { w: r.width, h: r.height };
  const { sigma, omega } = px2s(px, py, size);

  // Sağ tık → en yakın kutup/sıfırı kaldır (varsa eşleniği ile birlikte)
  if (e.button === 2) {
    e.preventDefault();
    const hit = findNearestPZ(sigma, omega, 0.4);
    if (hit) {
      const arr = (hit.type === 'pole') ? STATE.poles : STATE.zeros;
      const target = arr[hit.idx];
      arr.splice(hit.idx, 1);
      // Ekleme ile simetrik: |im| > 0.05 ise eşlenik de silinsin
      if (target && Math.abs(target.im) > 0.05) {
        const cjIdx = arr.findIndex(p =>
          Math.abs(p.re - target.re) < 0.05 &&
          Math.abs(p.im + target.im) < 0.05
        );
        if (cjIdx >= 0) arr.splice(cjIdx, 1);
      }
      updateAll();
    }
    return;
  }

  // Sol tık: önce mevcut bir kutup/sıfıra yakınsak, sürükleme moduna geç
  const hit = findNearestPZ(sigma, omega, 0.3);
  if (hit) {
    drag2D = { type: hit.type, idx: hit.idx };
    return;
  }

  // Yeni ekle
  addPointAt(STATE.mouseMode, +sigma.toFixed(2), +omega.toFixed(2));
});
window.addEventListener('mousemove', (e) => {
  if (!drag2D) return;
  const r = cv2d.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const size = { w: r.width, h: r.height };
  const { sigma, omega } = px2s(px, py, size);
  const arr = drag2D.type === 'pole' ? STATE.poles : STATE.zeros;
  if (!arr[drag2D.idx]) { drag2D = null; return; }
  arr[drag2D.idx].re = +sigma.toFixed(2);
  arr[drag2D.idx].im = +omega.toFixed(2);
  renderList();
  draw2D(); draw3D(); drawFreqResponse();
});
window.addEventListener('mouseup', () => { drag2D = null; });

// 3D — fareyle döndürme + scroll zoom (mevcut)
let dragging3D = false, dragSX = 0, dragSY = 0, dragRotX = 0, dragRotY = 0;
cv3d.addEventListener('mousedown', (e) => {
  dragging3D = true; dragSX = e.clientX; dragSY = e.clientY;
  dragRotX = STATE.rotX; dragRotY = STATE.rotY;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging3D) return;
  const dx = e.clientX - dragSX;
  const dy = e.clientY - dragSY;
  STATE.rotY = dragRotY + dx * 0.005;
  STATE.rotX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, dragRotX + dy * 0.005));
  ui.rotX.value = Math.round(STATE.rotX * 180 / Math.PI);
  ui.rotY.value = Math.round(STATE.rotY * 180 / Math.PI);
  ui.rotXVal.textContent = ui.rotX.value + '°';
  ui.rotYVal.textContent = ui.rotY.value + '°';
  draw3D();
});
window.addEventListener('mouseup', () => { dragging3D = false; });

cv3d.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  STATE.zoom = Math.max(0.4, Math.min(2.5, STATE.zoom + delta));
  ui.zoom.value = STATE.zoom.toFixed(2);
  ui.zoomVal.textContent = STATE.zoom.toFixed(2);
  draw3D();
}, { passive: false });

// Frekans canvas — tıkla Ω seç
cvFreq.addEventListener('mousedown', (e) => {
  const r = cvFreq.getBoundingClientRect();
  const x = e.clientX - r.left;
  const RO = STATE.omegaRange;
  const omega = -RO + (2 * RO) * (x / r.width);
  setOmega(omega);
});
cvFreq.addEventListener('mousemove', (e) => {
  if (e.buttons !== 1) return;
  const r = cvFreq.getBoundingClientRect();
  const x = e.clientX - r.left;
  const RO = STATE.omegaRange;
  const omega = -RO + (2 * RO) * (x / r.width);
  setOmega(omega);
});

function setOmega(o) {
  const RO = STATE.omegaRange;
  STATE.omega = Math.max(-RO, Math.min(RO, o));
  ui.omegaSlider.value = STATE.omega.toFixed(2);
  updateOmegaDisplay();
  draw2D(); draw3D(); drawFreqResponse();
}

function updateOmegaDisplay() {
  const m = magH(0, STATE.omega);
  const mStr = (!isFinite(m) || m > 999) ? '∞' : m.toFixed(2);
  ui.omegaDisplay.textContent =
    `Ω = ${STATE.omega.toFixed(2)} · |H(jΩ)| = ${m.toFixed(3)}`;
  if (ui.freqLive) {
    ui.freqLive.textContent = `|H(jΩ)| = ${mStr} · Ω = ${STATE.omega.toFixed(2)}`;
  }
}

/* =========================================================
   SLIDER OLAYLARI
   ========================================================= */
ui.rotX.addEventListener('input', () => {
  STATE.rotX = parseFloat(ui.rotX.value) * Math.PI / 180;
  ui.rotXVal.textContent = ui.rotX.value + '°';
  draw3D();
});
ui.rotY.addEventListener('input', () => {
  STATE.rotY = parseFloat(ui.rotY.value) * Math.PI / 180;
  ui.rotYVal.textContent = ui.rotY.value + '°';
  draw3D();
});
ui.zoom.addEventListener('input', () => {
  STATE.zoom = parseFloat(ui.zoom.value);
  ui.zoomVal.textContent = STATE.zoom.toFixed(2);
  draw3D();
});
ui.cap.addEventListener('input', () => {
  STATE.cap = parseFloat(ui.cap.value);
  ui.capVal.textContent = STATE.cap.toFixed(1);
  updateAll();
});
ui.gridRes.addEventListener('input', () => {
  STATE.gridRes = parseFloat(ui.gridRes.value);
  ui.gridResVal.textContent = STATE.gridRes.toFixed(2);
  draw3D();
});

ui.showSurface.addEventListener('change', () => { STATE.showSurface = ui.showSurface.checked; draw3D(); });
ui.showJOmega .addEventListener('change', () => { STATE.showJOmega  = ui.showJOmega .checked; draw3D(); });
ui.showGrid   .addEventListener('change', () => { STATE.showGrid    = ui.showGrid   .checked; draw2D(); draw3D(); });
ui.showDist   .addEventListener('change', () => { STATE.showDist    = ui.showDist   .checked; draw2D(); });

ui.omegaSlider.addEventListener('input', () => {
  setOmega(parseFloat(ui.omegaSlider.value));
});
ui.speed.addEventListener('input', () => {
  STATE.speed = parseFloat(ui.speed.value);
  ui.speedVal.textContent = STATE.speed.toFixed(1) + '×';
});

window.togglePlay = function () {
  STATE.playing = !STATE.playing;
  ui.playBtn.textContent = STATE.playing ? '⏸' : '▶';
  ui.playBtn.classList.toggle('playing', STATE.playing);
  if (STATE.playing) {
    STATE.lastTime = performance.now();
    requestAnimationFrame(animLoop);
  }
};

function animLoop(now) {
  if (!STATE.playing) return;
  const dt = (now - STATE.lastTime) / 1000;
  STATE.lastTime = now;
  const RO = STATE.omegaRange;
  STATE.omega += STATE.speed * dt;
  if (STATE.omega > RO) STATE.omega = -RO;
  ui.omegaSlider.value = STATE.omega.toFixed(2);
  updateOmegaDisplay();
  draw2D(); draw3D(); drawFreqResponse();
  requestAnimationFrame(animLoop);
}

/* =========================================================
   SİNYAL TESTİ — bileşen oluşturma + filtreden geçirme
   ========================================================= */
const SIG = {
  components: [],
  T: 20,            // saniye — kayıt süresi
  dt: 0.01,         // saniye — istenen örnek aralığı (kullanıcı girer)
  N: 2048,          // FFT noktası — T/dt'den türetilir (power of 2)
  Neff: 2048,       // gerçek N (UI'da gösterilir)
  dtEff: 0.0098,    // gerçek dt = T/N
  plotTmax: 5,      // çizilen zaman aralığı (sn) — slider ile değişir
  plotOmegaMax: 8,  // çizilen Ω aralığı (rad/s)
  maxComps: 8,
  showH: true,
  hAlpha: 0.4,
  gridDensity: 2,   // 1=major-only, 2-5 minor subdivisions
  gridAlpha: 0.45,
  specCursorOm: 1.0,    // |Y(jΩ)| imleç frekansı (rad/s)
  _lastYData: null,     // imleç readout için son veri
};

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }
function niceStep(maxVal) {
  if (maxVal < 1e-9) return 1;
  const rough = maxVal / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(rough)));
  const m = rough / exp;
  if (m < 1.5) return exp;
  if (m < 3.5) return 2 * exp;
  if (m < 7) return 5 * exp;
  return 10 * exp;
}
function fmtTick(v, step) {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return v.toFixed(d);
}

// Her bileşene rastgele bir hue ataması — drawSignalPanel/list bunu kullanır
function randomCompHue() {
  // 8 görsel olarak farklı hue civarından seç + ufak jitter
  const buckets = [10, 50, 95, 135, 170, 205, 260, 300, 330];
  const base = buckets[Math.floor(Math.random() * buckets.length)];
  return (base + Math.floor((Math.random() - 0.5) * 25) + 360) % 360;
}
const hueLine = (h) => `hsl(${h}, 78%, 62%)`;
const hueGlow = (h) => `hsl(${h}, 90%, 65%)`;
const hueBg   = (h, a) => `hsla(${h}, 78%, 62%, ${a})`;

const sigUi = {
  type:  document.getElementById('sigType'),
  A:     document.getElementById('sigA'),
  F:     document.getElementById('sigF'),
  P:     document.getElementById('sigP'),
  Aval:  document.getElementById('sigAval'),
  Fval:  document.getElementById('sigFval'),
  Pval:  document.getElementById('sigPval'),
  // Aperiyodik kutular
  A_ap:  document.getElementById('sigA_ap'),
  W_ap:  document.getElementById('sigW_ap'),
  periodic: document.getElementById('sigPeriodic'),
  ctlAperiodic: document.getElementById('ctlAperiodic'),
  ctlPeriodic:  document.getElementById('ctlPeriodic'),
  ctlPeriodicCtl: document.getElementById('ctlPeriodicCtl'),
  ctlCustom: document.getElementById('ctlCustom'),
  drawStatus: document.getElementById('drawStatus'),
  list:  document.getElementById('sigCompList'),
  count: document.getElementById('sigCount'),
  addBtn:document.getElementById('sigAddBtn'),
  cvComps:document.getElementById('cvComps'),
  cvXt:  document.getElementById('cvXt'),
  cvXf:  document.getElementById('cvXf'),
  cvYt:  document.getElementById('cvYt'),
  cvYf:  document.getElementById('cvYf'),
  T:     document.getElementById('sigT'),
  Tval:  document.getElementById('sigTval'),
  dt:    document.getElementById('sigDt'),
  Ninfo: document.getElementById('sigNinfo'),
  dtEff: document.getElementById('sigDtEff'),
  domega:document.getElementById('sigDomega'),
  Tplot: document.getElementById('sigTplot'),
  TplotVal: document.getElementById('sigTplotVal'),
  omegaMax:    document.getElementById('sigOmegaMax'),
  omegaMaxVal: document.getElementById('sigOmegaMaxVal'),
  showH: document.getElementById('sigShowH'),
  hAlpha:document.getElementById('sigHAlpha'),
  hAlphaVal:document.getElementById('sigHAlphaVal'),
  gridDens: document.getElementById('sigGridDens'),
  gridDensVal: document.getElementById('sigGridDensVal'),
  gridAlpha: document.getElementById('sigGridAlpha'),
  gridAlphaVal: document.getElementById('sigGridAlphaVal'),
};

// Tip + periodic checkbox değişince görünürlüğü yenile
function updateSigTypeUI() {
  if (!sigUi.type) return;
  const t = sigUi.type.value;
  const isPerOnly = (t === 'sin' || t === 'cos');
  const isCustom  = (t === 'custom');
  const periodic  = isPerOnly || (sigUi.periodic && sigUi.periodic.checked);

  // Aperiyodik kutucuklar (A+W) → periyodik OR sin/cos durumunda gizle
  if (sigUi.ctlAperiodic)
    sigUi.ctlAperiodic.style.display = (isPerOnly || periodic) ? 'none' : '';

  // Custom: el ile çiz butonu — sadece custom için (her durumda)
  if (sigUi.ctlCustom)
    sigUi.ctlCustom.style.display = isCustom ? '' : 'none';

  // Periyodik anahtar: sin/cos için yok (zaten periyodik), diğerleri için var
  if (sigUi.ctlPeriodic)
    sigUi.ctlPeriodic.style.display = isPerOnly ? 'none' : '';

  // F+φ slider'ları + A slider: periyodik (sin/cos veya periodic=true) için göster
  if (sigUi.ctlPeriodicCtl)
    sigUi.ctlPeriodicCtl.style.display = periodic ? '' : 'none';
}

function sampleComp(c, t) {
  // Görsel merkez — periyodik olmayanlarda darbe burada merkez alınır
  const tCenter = SIG.plotTmax / 2;
  const tRel = t - tCenter;
  const isPer = c.periodic || c.type === 'sin' || c.type === 'cos';

  if (isPer) {
    // c.F artık Hz cinsinden saklanıyor → Ω = 2π·F
    const omega = 2 * Math.PI * (c.F || 1);
    const phase = omega * t + (c.ph || 0);
    switch (c.type) {
      case 'sin': return c.A * Math.sin(phase);
      case 'cos': return c.A * Math.cos(phase);
      case 'square': return c.A * Math.sign(Math.sin(phase));
      case 'triangle': return c.A * (2 / Math.PI) * Math.asin(Math.sin(phase));
      case 'gauss': {
        // Periyodik Gauss train, period = 1/F (s), σ = W/4
        const period = 1 / Math.max(0.01, c.F || 1);
        const sigma  = (c.width || 1) / 4;
        const tMod = ((t - tCenter - (c.ph || 0)) % period + period * 1.5) % period - period / 2;
        return c.A * Math.exp(-0.5 * Math.pow(tMod / Math.max(0.02, sigma), 2));
      }
      case 'custom': {
        if (!c.drawData || c.drawData.length === 0) return 0;
        const Nd = c.drawData.length;
        const period = 1 / Math.max(0.01, c.F || 1);
        const u = ((t - (c.ph || 0)) / period % 1 + 1) % 1;
        const idx = Math.floor(u * (Nd - 1));
        return c.A * c.drawData[idx];
      }
      default: return 0;
    }
  } else {
    // Aperiyodik — görsel merkez etrafında simetrik, yarı-genişlik W/2
    const W = Math.max(0.05, c.width || 1);
    const halfW = W / 2;
    const d = Math.abs(tRel);
    switch (c.type) {
      case 'square':   return (d <= halfW) ? c.A : 0;
      case 'triangle': return (d <= halfW) ? c.A * (1 - d / halfW) : 0;
      case 'gauss': {
        // σ = W/4 → ±2σ aralığı W'ye karşılık gelir, görsel olarak doğal
        const sigma = W / 4;
        return c.A * Math.exp(-0.5 * Math.pow(tRel / sigma, 2));
      }
      case 'custom': {
        if (!c.drawData || c.drawData.length === 0) return 0;
        if (d > halfW) return 0;
        const Nd = c.drawData.length;
        const u = (tRel + halfW) / W;  // 0..1
        const idx = Math.max(0, Math.min(Nd - 1, Math.floor(u * (Nd - 1))));
        return c.A * c.drawData[idx];
      }
      default: return 0;
    }
  }
}

// Cooley–Tukey iteratif FFT (in-place, kompleks)
function fft(re, im) {
  const N = re.length;
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < N; i += len) {
      let wkRe = 1, wkIm = 0;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k], aIm = im[i + k];
        const bRe = re[i + k + half] * wkRe - im[i + k + half] * wkIm;
        const bIm = re[i + k + half] * wkIm + im[i + k + half] * wkRe;
        re[i + k]        = aRe + bRe;
        im[i + k]        = aIm + bIm;
        re[i + k + half] = aRe - bRe;
        im[i + k + half] = aIm - bIm;
        const nwRe = wkRe * wRe - wkIm * wIm;
        const nwIm = wkRe * wIm + wkIm * wRe;
        wkRe = nwRe; wkIm = nwIm;
      }
    }
  }
}
function ifft(re, im) {
  const N = re.length;
  for (let i = 0; i < N; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < N; i++) {
    re[i] /= N;
    im[i] = -im[i] / N;
  }
}

// H(jΩ) — kompleks değer
function H_complex(omega) {
  let numRe = 1, numIm = 0;
  let denRe = 1, denIm = 0;
  for (const z of STATE.zeros) {
    const dRe = -z.re;
    const dIm = omega - z.im;
    const nr = numRe * dRe - numIm * dIm;
    const ni = numRe * dIm + numIm * dRe;
    numRe = nr; numIm = ni;
  }
  for (const p of STATE.poles) {
    const dRe = -p.re;
    const dIm = omega - p.im;
    const nr = denRe * dRe - denIm * dIm;
    const ni = denRe * dIm + denIm * dRe;
    denRe = nr; denIm = ni;
  }
  const den2 = denRe * denRe + denIm * denIm;
  if (den2 < 1e-20) return { re: 0, im: 0 };
  return {
    re: (numRe * denRe + numIm * denIm) / den2,
    im: (numIm * denRe - numRe * denIm) / den2,
  };
}

// Saf sinüs/kosinüs bileşeni mi? Bunlar tek bir Ω'da delta — analitik süzgeçleyebiliriz.
function isPureSinusoid(c) {
  return c.type === 'sin' || c.type === 'cos';
}

function computeSignalIO() {
  const T = SIG.T;
  // İstenen dt'den N'i türet — 256..16384 ve power of 2
  let nWant = Math.round(T / Math.max(0.0005, SIG.dt));
  let N = nextPow2(Math.max(256, Math.min(16384, nWant)));
  SIG.N = SIG.Neff = N;
  const dt = T / N;
  SIG.dtEff = dt;
  const dOmega = 2 * Math.PI / T;

  // Bileşenleri ikiye ayır:
  //  - pureComps  : saf sin/cos → analitik süzgeçleme (sızıntısız)
  //  - other      : aperiyodik / periyodik kare-üçgen-gauss / el çizim → FFT yolu
  const pureComps = [];
  const otherComps = [];
  for (const c of SIG.components) {
    if (isPureSinusoid(c)) pureComps.push(c); else otherComps.push(c);
  }

  // 1) x(t) — toplam giriş ve "other" parça ayrı ayrı
  const xt = new Float64Array(N);
  const xtOther = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i * dt;
    let vTot = 0, vOth = 0;
    for (const c of pureComps)  vTot += sampleComp(c, t);
    for (const c of otherComps) { const v = sampleComp(c, t); vTot += v; vOth += v; }
    xt[i] = vTot;
    xtOther[i] = vOth;
  }

  // 2) "other" parçası için FFT süzgeçleme: X_o → ·H(jω) → IFFT
  const Xre = Float64Array.from(xtOther), Xim = new Float64Array(N);
  fft(Xre, Xim);
  const Yre = new Float64Array(N), Yim = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const kk = (k <= N / 2) ? k : k - N;
    const omega = kk * dOmega;
    const h = H_complex(omega);
    Yre[k] = Xre[k] * h.re - Xim[k] * h.im;
    Yim[k] = Xre[k] * h.im + Xim[k] * h.re;
  }
  const yOther = Float64Array.from(Yre), yOtherIm = Float64Array.from(Yim);
  ifft(yOther, yOtherIm);

  // 3) Saf sin/cos bileşenleri için analitik süzgeçleme:
  //    y_c(t) = A·|H(jΩ)|·cos/sin(Ωt + φ + arg H(jΩ))
  const yt = new Float64Array(N);
  for (let i = 0; i < N; i++) yt[i] = yOther[i];
  for (const c of pureComps) {
    const Fhz = c.F || 0;
    const omega = 2 * Math.PI * Fhz;
    const A  = c.A || 0;
    const ph = c.ph || 0;
    const h  = H_complex(omega);
    const Hmag = Math.hypot(h.re, h.im);
    const Hph  = Math.atan2(h.im, h.re);
    const Aout = A * Hmag;
    const phOut = ph + Hph;
    if (c.type === 'sin') {
      for (let i = 0; i < N; i++) yt[i] += Aout * Math.sin(omega * i * dt + phOut);
    } else { // cos
      for (let i = 0; i < N; i++) yt[i] += Aout * Math.cos(omega * i * dt + phOut);
    }
  }

  // 4) Görüntü için spektrumlar — toplam giriş ve çıkışın FFT'si
  const XtotRe = Float64Array.from(xt), XtotIm = new Float64Array(N);
  fft(XtotRe, XtotIm);
  const YtotRe = Float64Array.from(yt), YtotIm = new Float64Array(N);
  fft(YtotRe, YtotIm);

  const Xmag = new Float64Array(N), Ymag = new Float64Array(N);
  const norm = 2 / N;
  for (let k = 0; k < N; k++) {
    Xmag[k] = Math.hypot(XtotRe[k], XtotIm[k]) * norm;
    Ymag[k] = Math.hypot(YtotRe[k], YtotIm[k]) * norm;
  }

  return { xt, yt, Xmag, Ymag, dt, dOmega, N };
}

function drawTimePlot(cv, signal, dt, color) {
  const ctx = cv.getContext('2d');
  const size = fitCanvas(cv, ctx);
  const C = colors();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);

  const N = signal.length;
  const Tplot = Math.min(SIG.plotTmax, SIG.T);  // kayıt süresini aşma
  const Nplot = Math.min(N, Math.max(2, Math.floor(Tplot / dt)));
  let yPeak = 0;
  for (let i = 0; i < Nplot; i++) {
    const a = Math.abs(signal[i]);
    if (a > yPeak) yPeak = a;
  }
  if (yPeak < 1e-9) yPeak = 1;
  const step = niceStep(yPeak);
  const yMax = Math.ceil(yPeak / step) * step;        // ekseni tam tick'e yuvarla
  const leftPad = 42;                                 // sol Y eksen etiket payı
  const y0 = size.h / 2;
  const yAmp = size.h / 2 - 14;
  const plotW = size.w - leftPad - 4;

  const sub = Math.max(1, SIG.gridDensity);
  const a = SIG.gridAlpha;
  const gridMaj = isLight() ? `rgba(20,40,140,${0.55 * a})` : `rgba(180,200,255,${0.55 * a})`;
  const gridMin = isLight() ? `rgba(20,40,140,${0.28 * a})` : `rgba(180,200,255,${0.28 * a})`;

  // Dikey grid (zaman)
  for (let k = 0; k <= Tplot * sub; k++) {
    const tk = k / sub;
    const x = leftPad + (tk / Tplot) * plotW;
    ctx.strokeStyle = (k % sub === 0) ? gridMaj : gridMin;
    ctx.lineWidth = (k % sub === 0) ? 0.7 : 0.4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.h); ctx.stroke();
  }
  // Yatay grid (genlik) — yMax'ten step'le
  for (let v = -yMax; v <= yMax + 1e-9; v += step / sub) {
    const isMajor = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const y = y0 - (v / yMax) * yAmp;
    ctx.strokeStyle = isMajor ? gridMaj : gridMin;
    ctx.lineWidth = isMajor ? 0.7 : 0.4;
    ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(size.w, y); ctx.stroke();
  }
  // 0 ekseni
  ctx.strokeStyle = C.gridStrong;
  ctx.lineWidth = 1.0;
  ctx.beginPath(); ctx.moveTo(leftPad, y0); ctx.lineTo(size.w, y0); ctx.stroke();
  // Y ekseni dik çizgi
  ctx.strokeStyle = C.gridStrong;
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(leftPad, 0); ctx.lineTo(leftPad, size.h); ctx.stroke();

  // Y eksen tick etiketleri (büyük puntoyla)
  ctx.fillStyle = C.label;
  ctx.font = 'bold 11px "Fira Code", monospace';
  for (let v = -yMax; v <= yMax + 1e-9; v += step) {
    if (Math.abs(v) < 1e-9 && yMax > 0) continue;
    const y = y0 - (v / yMax) * yAmp;
    let lbl = fmtTick(v, step);
    if (v > 0 && lbl.charAt(0) !== '+') lbl = '+' + lbl;
    ctx.fillText(lbl, 3, y + 4);
  }
  // 0 etiketi
  ctx.fillStyle = C.labelDim;
  ctx.font = 'bold 10px "Fira Code", monospace';
  ctx.fillText('0', 3, y0 + 4);

  // Sinyal eğrisi
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = color; ctx.shadowBlur = 4;
  ctx.beginPath();
  for (let i = 0; i < Nplot; i++) {
    const x = leftPad + (i / (Nplot - 1)) * plotW;
    const y = y0 - (signal[i] / yMax) * yAmp;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Zaman etiketleri
  ctx.fillStyle = C.labelDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.fillText('t = 0', leftPad + 2, size.h - 3);
  ctx.fillText('t = ' + Tplot.toFixed(Tplot < 10 ? 1 : 0) + ' ' + _t_sn(), size.w - 60, size.h - 3);
  // Tepe değeri sağ üstte
  ctx.fillStyle = color;
  ctx.font = 'bold 11px "Fira Code", monospace';
  ctx.fillText('peak = ' + yPeak.toFixed(3), size.w - 110, 14);
}

function drawSpectrum(cv, mag, dOmega, N, color, gradColor, opts) {
  const ctx = cv.getContext('2d');
  const size = fitCanvas(cv, ctx);
  const C = colors();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);

  opts = opts || {};
  const omegaMax = SIG.plotOmegaMax;
  // (omega, mag) çiftlerini topla ve sırala
  const pts = [];
  for (let k = 0; k < N; k++) {
    const kk = (k <= N / 2) ? k : k - N;
    const omega = kk * dOmega;
    if (omega >= -omegaMax && omega <= omegaMax) {
      pts.push({ omega, m: mag[k] });
    }
  }
  pts.sort((a, b) => a.omega - b.omega);

  let peak = 0;
  for (const p of pts) if (p.m > peak) peak = p.m;
  if (peak < 1e-9) peak = 1;
  const yBase = size.h - 16;
  // Tam tick'e yuvarlanmış y ekseni
  const _hStep = niceStep(peak);
  const _hMax = Math.ceil(peak / _hStep) * _hStep;
  const yScale = (yBase - 8) / _hMax;

  // Grid — major + minor
  const sub = Math.max(1, SIG.gridDensity);
  const ga = SIG.gridAlpha;
  const gridMaj = isLight() ? `rgba(20,40,140,${0.55 * ga})` : `rgba(180,200,255,${0.55 * ga})`;
  const gridMin = isLight() ? `rgba(20,40,140,${0.28 * ga})` : `rgba(180,200,255,${0.28 * ga})`;
  // Dikey grid (Ω)
  const totalSteps = omegaMax * 2 * sub;
  for (let k = 0; k <= totalSteps; k++) {
    const om = -omegaMax + k / sub;
    const x = (om + omegaMax) / (2 * omegaMax) * size.w;
    ctx.strokeStyle = (k % sub === 0) ? gridMaj : gridMin;
    ctx.lineWidth = (k % sub === 0) ? 0.7 : 0.4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, yBase); ctx.stroke();
  }
  // Yatay grid (peak normalleştirilmiş)
  const hStep = _hStep, hMax = _hMax;
  for (let v = 0; v <= hMax + 1e-9; v += hStep / sub) {
    const isMajor = Math.abs(v / hStep - Math.round(v / hStep)) < 1e-6;
    const y = yBase - (v / hMax) * (yBase - 8);
    ctx.strokeStyle = isMajor ? gridMaj : gridMin;
    ctx.lineWidth = isMajor ? 0.7 : 0.4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.w, y); ctx.stroke();
  }
  // Eksenler
  const x0 = size.w / 2;
  ctx.strokeStyle = C.gridStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, 0); ctx.lineTo(x0, yBase);
  ctx.moveTo(0, yBase); ctx.lineTo(size.w, yBase);
  ctx.stroke();
  // Y eksen tick'leri
  ctx.fillStyle = C.label;
  ctx.font = 'bold 10px "Fira Code", monospace';
  for (let v = hStep; v <= hMax + 1e-9; v += hStep) {
    const y = yBase - (v / hMax) * (yBase - 8);
    ctx.fillText(fmtTick(v, hStep), 3, y + 4);
  }

  // Eğri
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = color; ctx.shadowBlur = 5;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const x = (p.omega + omegaMax) / (2 * omegaMax) * size.w;
    const y = yBase - p.m * yScale;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Gölgeli dolgu (filtre tasarımındaki gibi)
  ctx.lineTo(size.w, yBase);
  ctx.lineTo(0, yBase);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, yBase);
  grad.addColorStop(0, gradColor + '52'); // ~32% alpha
  grad.addColorStop(1, gradColor + '05');
  ctx.fillStyle = grad;
  ctx.fill();

  // H(jΩ) overlay — yalnızca |Y| ekranı istediğinde
  if (opts.overlayH && SIG.hAlpha > 0.005) {
    // H(jΩ) genliklerini örnekle ve grafik yüksekliğine normalize et
    const STEP = (2 * omegaMax) / Math.max(60, Math.min(400, size.w));
    let hPeak = 0, hPeakOm = 0, hPeakIdx = 0;
    const hSamples = [];
    for (let om = -omegaMax; om <= omegaMax; om += STEP) {
      const h = H_complex(om);
      const m = Math.hypot(h.re, h.im);
      hSamples.push({ om, m });
      if (m > hPeak && isFinite(m)) {
        hPeak = m; hPeakOm = om; hPeakIdx = hSamples.length - 1;
      }
    }
    if (hPeak < 1e-9) hPeak = 1;
    const hCap = Math.min(hPeak, STATE.cap);
    const hScale = (yBase - 8) / hCap;
    const a = SIG.hAlpha;
    // MOR renk — turuncudan ayrı dursun
    const hCol = isLight() ? `rgba(140,40,200,${a})` : `rgba(200,120,255,${a})`;
    const hColSolid = isLight() ? '#8c28c8' : '#c878ff';
    ctx.save();
    ctx.strokeStyle = hCol;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i < hSamples.length; i++) {
      const s = hSamples[i];
      const x = (s.om + omegaMax) / (2 * omegaMax) * size.w;
      const y = yBase - Math.min(s.m, hCap) * hScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // |H(jΩ)| etiketi — TEPE ORTASINDA MOR, BÜYÜK
    ctx.save();
    const txt = '|H(jΩ)|';
    ctx.font = 'bold 14px "Fira Code", monospace';
    const tw = ctx.measureText(txt).width;
    const labelX = size.w / 2;
    const labelY = 16;
    ctx.fillStyle = isLight() ? 'rgba(255,255,255,0.88)' : 'rgba(8,10,28,0.82)';
    ctx.fillRect(labelX - tw/2 - 6, labelY - 13, tw + 12, 18);
    ctx.fillStyle = hColSolid;
    ctx.textAlign = 'center';
    ctx.fillText(txt, labelX, labelY);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── Hareketli düşey imleç (|Y| paneli için) ──
  if (opts.showCursor) {
    const omC = Math.max(-omegaMax, Math.min(omegaMax, SIG.specCursorOm));
    // En yakın örnekten genliği oku
    let mC = 0;
    if (pts.length) {
      let best = pts[0], bestD = Math.abs(pts[0].omega - omC);
      for (const p of pts) {
        const d = Math.abs(p.omega - omC);
        if (d < bestD) { bestD = d; best = p; }
      }
      mC = best.m;
    }
    const xC = (omC + omegaMax) / (2 * omegaMax) * size.w;
    const yC = yBase - mC * yScale;

    // Kesintili çizgi
    ctx.save();
    ctx.strokeStyle = isLight() ? 'rgba(255,79,154,0.95)' : 'rgba(255,140,200,0.95)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xC, 0); ctx.lineTo(xC, yBase); ctx.stroke();
    ctx.setLineDash([]);
    // Nokta
    ctx.fillStyle = isLight() ? '#ff4f9a' : '#ff78c8';
    ctx.beginPath(); ctx.arc(xC, yC, 4.5, 0, Math.PI * 2); ctx.fill();
    // Readout — Ω ve |Y|
    const readout = `Ω = ${omC.toFixed(2)} · |Y| = ${mC.toFixed(3)}`;
    ctx.font = 'bold 10.5px "Fira Code", monospace';
    const rw = ctx.measureText(readout).width;
    let rx = xC + 8;
    if (rx + rw + 8 > size.w) rx = xC - 8 - rw - 6;
    const ry = Math.max(14, yC - 8);
    ctx.fillStyle = isLight() ? 'rgba(255,255,255,0.92)' : 'rgba(8,10,28,0.88)';
    ctx.fillRect(rx - 4, ry - 11, rw + 8, 15);
    ctx.fillStyle = isLight() ? '#c8166d' : '#ff9ed0';
    ctx.fillText(readout, rx, ry);
    ctx.restore();

    // Veriyi sakla (dışarıdan da okunabilir)
    SIG._lastYData = { om: omC, mag: mC };
  }

  // Etiketler
  ctx.fillStyle = C.label;
  ctx.font = '9px "Fira Code", monospace';
  ctx.fillText('Ω = -' + omegaMax, 4, size.h - 4);
  ctx.fillText('Ω = +' + omegaMax, size.w - 56, size.h - 4);
  ctx.fillText('Ω = 0', x0 + 4, size.h - 4);
  ctx.fillStyle = color;
  ctx.font = 'bold 10px "Fira Code", monospace';
  ctx.fillText('peak ≈ ' + peak.toFixed(2), size.w - 88, 12);
}

function drawComponentsStack(cv, comps, dt, N) {
  const ctx = cv.getContext('2d');
  const size = fitCanvas(cv, ctx);
  const C = colors();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);

  const Tplot = Math.min(SIG.plotTmax, SIG.T);
  const Nplot = Math.min(N, Math.max(2, Math.floor(Tplot / dt)));
  const count = Math.max(1, comps.length);
  const stripH = size.h / count;
  const leftPad = 130;  // sol etiket alanı
  const typeNames = { sin: _t({tr: 'Sinüs', en: 'Sine'}), cos: _t({tr: 'Kosinüs', en: 'Cosine'}), square: _t({tr: 'Kare', en: 'Square'}), triangle: _t({tr: 'Üçgen', en: 'Triangle'}), gauss: _t({tr: 'Gauss', en: 'Gaussian'}), custom: _t({tr: 'Çizim', en: 'Drawn'}) };

  // Boşsa açıklama yaz
  if (comps.length === 0) {
    ctx.fillStyle = C.labelDim;
    ctx.font = '11px "Saira", sans-serif';
    ctx.fillText(_t({tr: 'Henüz bileşen eklenmedi — sol panelden ekle (en fazla 8)', en: 'No components yet — add from the left panel (max 8)'}), 12, size.h / 2);
    return;
  }

  comps.forEach((c, idx) => {
    const yC = idx * stripH + stripH / 2;
    const hue = (typeof c.hue === 'number') ? c.hue : 140;
    const color = hueLine(hue);

    // Şerit ayırıcı çizgi
    if (idx > 0) {
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, idx * stripH); ctx.lineTo(size.w, idx * stripH);
      ctx.stroke();
    }
    // 0 ekseni
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.4;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(leftPad, yC); ctx.lineTo(size.w - 4, yC);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sol etiket
    ctx.fillStyle = color;
    ctx.font = 'bold 11px "Fira Code", monospace';
    ctx.fillText(`C${idx + 1}`, 6, yC - 4);
    ctx.fillStyle = C.label;
    ctx.font = '9.5px "Fira Code", monospace';
    const typeNm = typeNames[c.type] || c.type;
    ctx.fillText(typeNm, 30, yC - 4);
    ctx.fillStyle = C.labelDim;
    ctx.font = '8.5px "Fira Code", monospace';
    const isAp = !c.periodic && c.type !== 'sin' && c.type !== 'cos';
    const par = isAp
      ? `A=${c.A.toFixed(1)} W=${(c.width||0).toFixed(2)} ${_t_sn()}`
      : `A=${c.A.toFixed(1)} F=${(c.F||0).toFixed(1)}Hz φ=${(c.ph||0).toFixed(2)}`;
    ctx.fillText(par, 6, yC + 9);

    // Tepe genliği (bu bileşen için)
    let yMax = 0;
    const samples = new Float64Array(Nplot);
    for (let i = 0; i < Nplot; i++) {
      const t = i * dt;
      const v = sampleComp(c, t);
      samples[i] = v;
      const a = Math.abs(v);
      if (a > yMax) yMax = a;
    }
    if (yMax < 1e-9) yMax = 1;
    const yAmp = stripH * 0.40;

    // Dalga formu
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = color; ctx.shadowBlur = 3;
    ctx.beginPath();
    const wPlot = size.w - leftPad - 4;
    for (let i = 0; i < Nplot; i++) {
      const x = leftPad + (i / (Nplot - 1)) * wPlot;
      const y = yC - (samples[i] / yMax) * yAmp;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  // Üst zaman etiketleri
  ctx.fillStyle = C.labelDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.fillText(`t = 0`, leftPad + 2, 10);
  ctx.fillText(`t = ${SIG.plotTmax} ${_t_sn()}`, size.w - 52, 10);
}

function drawSignalPanel() {
  if (!sigUi.cvXt) return;
  const data = computeSignalIO();
  drawComponentsStack(sigUi.cvComps, SIG.components, data.dt, data.N);
  drawTimePlot(sigUi.cvXt, data.xt, data.dt, '#39ff85');
  drawTimePlot(sigUi.cvYt, data.yt, data.dt, '#ff8c42');
  drawSpectrum(sigUi.cvXf, data.Xmag, data.dOmega, data.N, '#39ff85', '#39ff85');
  drawSpectrum(sigUi.cvYf, data.Ymag, data.dOmega, data.N, '#ff8c42', '#ff8c42',
               { overlayH: SIG.showH, showCursor: true });
  refreshSpectrumInfo();
}

function renderSigCompList() {
  if (!sigUi.list) return;
  sigUi.list.innerHTML = '';
  const typeNames = { sin: _t({tr: 'Sinüs', en: 'Sine'}), cos: _t({tr: 'Kosinüs', en: 'Cosine'}), square: _t({tr: 'Kare', en: 'Square'}), triangle: _t({tr: 'Üçgen', en: 'Triangle'}), gauss: _t({tr: 'Gauss', en: 'Gaussian'}), custom: _t({tr: 'Çizim', en: 'Drawn'}) };
  SIG.components.forEach((c, idx) => {
    const div = document.createElement('div');
    div.className = 'sig-comp-item';
    const hue = (typeof c.hue === 'number') ? c.hue : 140;
    const col = hueLine(hue);
    const colBg = hueBg(hue, 0.18);
    div.style.borderLeftColor = col;
    const tn = typeNames[c.type] || c.type;
    let sym;
    if (c.periodic || c.type === 'sin' || c.type === 'cos') {
      sym = `${tn}·per · A=${c.A.toFixed(1)} · F=${(c.F||0).toFixed(1)}Hz · φ=${(c.ph||0).toFixed(2)}`;
    } else {
      sym = `${tn}·ap · A=${c.A.toFixed(1)} · W=${(c.width||0).toFixed(2)} ${_t_sn()}`;
    }
    div.innerHTML = `
      <span class="sig-comp-tag" style="color:${col}; background:${colBg};">C${idx + 1}</span>
      <span class="sig-comp-coords">${sym}</span>
      <span class="sig-comp-rm" data-idx="${idx}">✕</span>
    `;
    sigUi.list.appendChild(div);
  });
  sigUi.list.querySelectorAll('.sig-comp-rm').forEach(el => {
    el.onclick = () => {
      SIG.components.splice(parseInt(el.dataset.idx), 1);
      updateSignalPanel();
    };
  });
  sigUi.count.textContent = SIG.components.length;
  sigUi.addBtn.disabled = SIG.components.length >= SIG.maxComps;
}

// === Pending custom draw ===
const DRAW = {
  N: 200,
  data: new Float64Array(200),
  drawing: false,
  hasData: false,
  lastIdx: -1,
};

function renderDrawCanvas() {
  const cv = document.getElementById('drawCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const size = fitCanvas(cv, ctx);
  const C = colors();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);
  // Grid + 0 ekseni
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 0.5;
  for (let k = 0; k <= 10; k++) {
    const x = k / 10 * size.w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.h); ctx.stroke();
  }
  for (let k = 0; k <= 4; k++) {
    const y = k / 4 * size.h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.w, y); ctx.stroke();
  }
  const y0 = size.h / 2;
  ctx.strokeStyle = C.gridStrong;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(size.w, y0); ctx.stroke();
  // Etiketler
  ctx.fillStyle = C.labelDim;
  ctx.font = '10px "Fira Code", monospace';
  ctx.fillText('+A', 4, 12);
  ctx.fillText(' 0', 4, y0 + 4);
  ctx.fillText('−A', 4, size.h - 4);
  ctx.fillText('−W/2', 28, size.h - 4);
  ctx.fillText('+W/2', size.w - 40, size.h - 4);

  // Veri eğrisi
  ctx.strokeStyle = '#c878ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#c878ff';
  ctx.shadowBlur = 5;
  ctx.beginPath();
  for (let i = 0; i < DRAW.N; i++) {
    const x = i / (DRAW.N - 1) * size.w;
    const y = y0 - DRAW.data[i] * (size.h / 2 - 6);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

window.openDrawModal = function() {
  document.getElementById('drawModal').classList.add('active');
  setTimeout(renderDrawCanvas, 50);
};
window.closeDrawModal = function() {
  document.getElementById('drawModal').classList.remove('active');
};
window.clearDraw = function() {
  DRAW.data = new Float64Array(DRAW.N);
  renderDrawCanvas();
};
window.smoothDraw = function() {
  const s = new Float64Array(DRAW.N);
  for (let i = 1; i < DRAW.N - 1; i++) {
    s[i] = (DRAW.data[i - 1] + DRAW.data[i] + DRAW.data[i + 1]) / 3;
  }
  s[0] = DRAW.data[0];
  s[DRAW.N - 1] = DRAW.data[DRAW.N - 1];
  DRAW.data = s;
  renderDrawCanvas();
};
window.saveDraw = function() {
  // Normalize: |max| ≤ 1
  let peak = 0;
  for (let i = 0; i < DRAW.N; i++) {
    const a = Math.abs(DRAW.data[i]);
    if (a > peak) peak = a;
  }
  if (peak > 1e-6) {
    for (let i = 0; i < DRAW.N; i++) DRAW.data[i] /= peak;
  }
  DRAW.hasData = true;
  if (sigUi.drawStatus) sigUi.drawStatus.textContent = '✓ Çizim hazır — "Bileşen Ekle" ile uygula';
  if (sigUi.drawStatus) sigUi.drawStatus.style.color = '#39ff85';
  closeDrawModal();
};

// Mouse olayları
(function setupDrawMouse() {
  const cv = document.getElementById('drawCanvas');
  if (!cv) return;
  function getXY(e) {
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const idx = Math.max(0, Math.min(DRAW.N - 1, Math.floor((px / r.width) * DRAW.N)));
    const v = Math.max(-1, Math.min(1, 1 - 2 * (py / r.height)));
    return { idx, v };
  }
  cv.addEventListener('mousedown', (e) => {
    DRAW.drawing = true;
    const { idx, v } = getXY(e);
    DRAW.data[idx] = v;
    DRAW.lastIdx = idx;
    renderDrawCanvas();
  });
  cv.addEventListener('mousemove', (e) => {
    if (!DRAW.drawing) return;
    const { idx, v } = getXY(e);
    // İki nokta arası interpolasyon
    if (DRAW.lastIdx >= 0 && DRAW.lastIdx !== idx) {
      const lo = Math.min(DRAW.lastIdx, idx);
      const hi = Math.max(DRAW.lastIdx, idx);
      const vLo = DRAW.data[DRAW.lastIdx];
      for (let i = lo; i <= hi; i++) {
        const t = (hi === lo) ? 1 : (i - lo) / (hi - lo);
        DRAW.data[i] = vLo + (v - vLo) * (idx > DRAW.lastIdx ? t : 1 - t);
      }
    } else {
      DRAW.data[idx] = v;
    }
    DRAW.lastIdx = idx;
    renderDrawCanvas();
  });
  window.addEventListener('mouseup', () => { DRAW.drawing = false; DRAW.lastIdx = -1; });
})();

window.addSignalComp = function () {
  if (SIG.components.length >= SIG.maxComps) return;
  const t = sigUi.type.value;
  const isPerOnly = (t === 'sin' || t === 'cos');
  const periodicChecked = isPerOnly ? true : !!(sigUi.periodic && sigUi.periodic.checked);

  let A, W, F, ph;
  if (isPerOnly || periodicChecked) {
    A  = parseFloat(sigUi.A.value);
    F  = parseFloat(sigUi.F.value);
    ph = parseFloat(sigUi.P.value);
    W  = Math.PI / Math.max(0.1, F);  // periyodik gauss için varsayılan
  } else {
    A  = parseFloat(sigUi.A_ap.value);
    W  = parseFloat(sigUi.W_ap.value);
    F  = 1; ph = 0;  // ignored
  }

  const c = {
    type: t,
    A: isNaN(A) ? 1 : A,
    F: isNaN(F) ? 1 : F,
    ph: isNaN(ph) ? 0 : ph,
    width: isNaN(W) ? 1 : W,
    periodic: periodicChecked,
    hue: randomCompHue(),
  };
  if (t === 'custom') {
    if (!DRAW.hasData) {
      alert('Önce "El ile Çiz" butonu ile bir şekil çiz.');
      return;
    }
    c.drawData = Float64Array.from(DRAW.data);
  }
  SIG.components.push(c);
  updateSignalPanel();
};
window.clearSignalComps = function () {
  SIG.components = [];
  updateSignalPanel();
};

if (sigUi.A) sigUi.A.addEventListener('input', () => sigUi.Aval.textContent = parseFloat(sigUi.A.value).toFixed(1));
if (sigUi.F) sigUi.F.addEventListener('input', () => sigUi.Fval.textContent = parseFloat(sigUi.F.value).toFixed(1));
if (sigUi.P) sigUi.P.addEventListener('input', () => sigUi.Pval.textContent = parseFloat(sigUi.P.value).toFixed(2));
if (sigUi.type) sigUi.type.addEventListener('change', updateSigTypeUI);
if (sigUi.periodic) sigUi.periodic.addEventListener('change', updateSigTypeUI);

function refreshSpectrumInfo() {
  const dOmega = (2 * Math.PI / SIG.T);
  if (sigUi.domega) sigUi.domega.textContent = dOmega.toFixed(3);
  if (sigUi.Ninfo) sigUi.Ninfo.textContent = SIG.Neff;
  if (sigUi.dtEff) sigUi.dtEff.textContent = SIG.dtEff.toFixed(4);
}
if (sigUi.T) sigUi.T.addEventListener('input', () => {
  SIG.T = parseFloat(sigUi.T.value);
  sigUi.Tval.textContent = SIG.T.toFixed(0);
  drawSignalPanel();
  refreshSpectrumInfo();
});
if (sigUi.dt) sigUi.dt.addEventListener('input', () => {
  const v = parseFloat(sigUi.dt.value);
  const warn = document.getElementById('sigDtWarn');
  if (isNaN(v) || v < 0.001) {
    if (warn) warn.style.display = '';
    return;  // uygulama yok, son geçerli değer korunuyor
  }
  if (warn) warn.style.display = 'none';
  SIG.dt = v;
  drawSignalPanel();
  refreshSpectrumInfo();
});
if (sigUi.Tplot) sigUi.Tplot.addEventListener('input', () => {
  SIG.plotTmax = parseFloat(sigUi.Tplot.value);
  sigUi.TplotVal.textContent = SIG.plotTmax.toFixed(1);
  drawSignalPanel();
});
if (sigUi.omegaMax) sigUi.omegaMax.addEventListener('input', () => {
  SIG.plotOmegaMax = parseFloat(sigUi.omegaMax.value);
  sigUi.omegaMaxVal.textContent = SIG.plotOmegaMax.toFixed(0);
  drawSignalPanel();
});
if (sigUi.showH) sigUi.showH.addEventListener('change', () => {
  SIG.showH = sigUi.showH.checked;
  drawSignalPanel();
});
if (sigUi.hAlpha) sigUi.hAlpha.addEventListener('input', () => {
  SIG.hAlpha = parseFloat(sigUi.hAlpha.value);
  sigUi.hAlphaVal.textContent = SIG.hAlpha.toFixed(2);
  drawSignalPanel();
});
if (sigUi.gridDens) sigUi.gridDens.addEventListener('input', () => {
  SIG.gridDensity = parseInt(sigUi.gridDens.value);
  sigUi.gridDensVal.textContent = SIG.gridDensity;
  drawSignalPanel();
});
if (sigUi.gridAlpha) sigUi.gridAlpha.addEventListener('input', () => {
  SIG.gridAlpha = parseFloat(sigUi.gridAlpha.value);
  sigUi.gridAlphaVal.textContent = SIG.gridAlpha.toFixed(2);
  drawSignalPanel();
});

/* === |Y(jΩ)| hareketli imleç — fare ile tıkla/sürükle === */
if (sigUi.cvYf) {
  let dragging = false;
  const updateFromEvt = (evt) => {
    const r = sigUi.cvYf.getBoundingClientRect();
    const x = evt.clientX - r.left;
    const omegaMax = SIG.plotOmegaMax;
    let om = -omegaMax + (x / r.width) * (2 * omegaMax);
    om = Math.max(-omegaMax, Math.min(omegaMax, om));
    SIG.specCursorOm = om;
    drawSignalPanel();
  };
  sigUi.cvYf.style.cursor = 'crosshair';
  sigUi.cvYf.addEventListener('mousedown', (e) => {
    dragging = true; updateFromEvt(e);
  });
  window.addEventListener('mousemove', (e) => { if (dragging) updateFromEvt(e); });
  window.addEventListener('mouseup', () => { dragging = false; });
  sigUi.cvYf.addEventListener('mouseleave', () => { /* keep cursor */ });
}

function updateSignalPanel() {
  renderSigCompList();
  drawSignalPanel();
  refreshSpectrumInfo();
}

/* =========================================================
   YENILEME
   ========================================================= */
function updateAll() {
  renderList();
  draw2D();
  draw3D();
  drawFreqResponse();
  updateOmegaDisplay();
  drawSignalPanel();
}

window.addEventListener('resize', () => updateAll());
window.onThemeChange = () => updateAll();

/* =========================================================
   ARKAPLAN (basit nokta)
   ========================================================= */
(function () {
  const c = document.getElementById('bgCanvas');
  const ctx = c.getContext('2d');
  const rs = () => { c.width = innerWidth; c.height = innerHeight; }; rs();
  window.addEventListener('resize', rs);
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.3,
    dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.1,
    a: Math.random() * 0.16 + 0.04,
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

// === BAŞLAT ===
// Sinyal testi için varsayılan bileşenler (filtre etkisini gösterir)
SIG.components = [
  { type: 'sin', A: 1.0, F: 0.4, ph: 0, width: 1, periodic: true, hue: randomCompHue() },
  { type: 'sin', A: 0.7, F: 1.2, ph: 0, width: 1, periodic: true, hue: randomCompHue() },
];
updateSigTypeUI();
loadPreset('lp2');
renderSigCompList();
