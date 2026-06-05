/* ============================================
   Z-DÖNÜŞÜMÜ 3D — z-düzlemi, kutup/sıfır, DTFT, h[n]
   2D z-düzlemi + 3D |H(z)| yüzey + DTFT + h[n] stem
   + Ayrık sinyal-test modülü (x[n] → y[n] = h[n]*x[n])
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
// === DURUM ===
const STATE = {
  poles: [],         // {re, im}
  zeros: [],
  rotX: -23 * Math.PI / 180,
  rotY:  35 * Math.PI / 180,
  zoom: 1.0,
  cap: 30,
  N3d: 60,            // 3B ızgara çözünürlüğü
  range: 1.5,         // z-düzlemi yarı yarıçapı (Re/Im, ±range)
  hLen: 40,           // h[n] uzunluğu
  h: new Float64Array(40),
  showSurface: true,
  showUnitCircle: true,
  showGrid: true,
  showDist: true,
  autoRot: false,
  mouseMode: 'pole',
  // animasyon
  omega: 0,            // -π..π
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
  range: document.getElementById('range'),
  rangeVal: document.getElementById('rangeVal'),
  hLen: document.getElementById('hLen'),
  hLenVal: document.getElementById('hLenVal'),
  hNcount: document.getElementById('hNcount'),
  showSurface: document.getElementById('showSurface'),
  showUnitCircle: document.getElementById('showUnitCircle'),
  showGrid: document.getElementById('showGrid'),
  showDist: document.getElementById('showDist'),
  autoRot: document.getElementById('autoRot'),
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

/* -------- Kompleks aritmetik -------- */
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({ re: a.re*b.re - a.im*b.im, im: a.re*b.im + a.im*b.re });
const cDiv = (a, b) => {
  const d = b.re*b.re + b.im*b.im;
  return { re: (a.re*b.re + a.im*b.im) / d, im: (a.im*b.re - a.re*b.im) / d };
};
const cAbs = a => Math.hypot(a.re, a.im);

/* === H(z) hesabı (genel z için) === */
function H_complex(zRe, zIm) {
  let numRe = 1, numIm = 0;
  let denRe = 1, denIm = 0;
  for (const z of STATE.zeros) {
    const dRe = zRe - z.re, dIm = zIm - z.im;
    const nr = numRe*dRe - numIm*dIm;
    const ni = numRe*dIm + numIm*dRe;
    numRe = nr; numIm = ni;
  }
  for (const p of STATE.poles) {
    const dRe = zRe - p.re, dIm = zIm - p.im;
    const nr = denRe*dRe - denIm*dIm;
    const ni = denRe*dIm + denIm*dRe;
    denRe = nr; denIm = ni;
  }
  const den2 = denRe*denRe + denIm*denIm;
  if (den2 < 1e-20) return { re: 0, im: 0, big: true };
  return {
    re: (numRe*denRe + numIm*denIm) / den2,
    im: (numIm*denRe - numRe*denIm) / den2,
    big: false,
  };
}
function magH(zRe, zIm) {
  const h = H_complex(zRe, zIm);
  if (h.big) return STATE.cap * 2;
  return Math.hypot(h.re, h.im);
}
function H_unitCircle(omega) {
  return H_complex(Math.cos(omega), Math.sin(omega));
}

/* === IMPULSE CEVABI — fark denklemiyle === */
function expandPolyFromRoots(roots) {
  let poly = [{ re: 1, im: 0 }];
  for (const r of roots) {
    const newPoly = new Array(poly.length + 1).fill(0).map(() => ({ re: 0, im: 0 }));
    for (let k = 0; k < poly.length; k++) {
      newPoly[k+1] = cAdd(newPoly[k+1], poly[k]);
      newPoly[k]   = cSub(newPoly[k],   cMul({ re: r.re, im: r.im }, poly[k]));
    }
    poly = newPoly;
  }
  return poly.map(c => c.re);
}

function computeImpulse() {
  const M = STATE.poles.length;
  const N = STATE.zeros.length;
  const hLen = STATE.hLen;
  const h = new Float64Array(hLen);

  if (M === 0 && N === 0) {
    h[0] = 1;
    STATE.h = h;
    return;
  }

  const Bp = expandPolyFromRoots(STATE.zeros);
  const Ap = expandPolyFromRoots(STATE.poles);

  const Mref = Math.max(M, N);
  const b = new Float64Array(Mref + 1);
  const a = new Float64Array(Mref + 1);
  for (let k = 0; k <= Mref; k++) {
    const i = Mref - k;
    if (i >= 0 && i <= N) b[k] = Bp[i];
  }
  for (let k = 0; k <= Mref; k++) {
    const i = Mref - k;
    if (i >= 0 && i <= M) a[k] = Ap[i];
  }
  if (Math.abs(a[0]) < 1e-12) a[0] = 1;
  const a0 = a[0];
  for (let k = 0; k <= Mref; k++) { a[k] /= a0; b[k] /= a0; }

  for (let n = 0; n < hLen; n++) {
    let yn = 0;
    if (n <= Mref) yn += b[n];
    for (let k = 1; k <= Mref && k <= n; k++) {
      yn -= a[k] * h[n - k];
    }
    h[n] = yn;
  }
  STATE.h = h;
}

/* === CANVAS REFERANSLARI === */
const cv2d   = document.getElementById('cv2d');
const ctx2d  = cv2d.getContext('2d');
const cv3d   = document.getElementById('cv3d');
const ctx3d  = cv3d.getContext('2d');
const cvFreq = document.getElementById('cvFreq');
const ctxFreq = cvFreq.getContext('2d');
const cvImp  = document.getElementById('cvImp');
const ctxImp = cvImp.getContext('2d');

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
    unitCircle:  light ? '#a8430a'               : '#ff8c42',
    reAxis:      light ? '#0e6e2e'               : '#39ff85',
    imAxis:      light ? '#1e5cc8'               : '#7b8cff',
    pole:        light ? '#b01e6a'               : '#ff4f9a',
    zero:        light ? '#0e6e2e'               : '#39ff85',
    freqLine:    light ? '#0e6e2e'               : '#39ff85',
    movePt:      light ? '#d8195a'               : '#ff3366',
    distP:       light ? 'rgba(176,30,106,0.55)' : 'rgba(255,79,154,0.6)',
    distZ:       light ? 'rgba(14,110,46,0.55)'  : 'rgba(57,255,133,0.6)',
    stem:        light ? '#b01e6a'               : '#ff5577',
    label:       light ? '#0d1226'               : '#e2e6f0',
    labelDim:    light ? '#3a4060'               : '#7a82a6',
    bg:          light ? '#ffffff'               : 'rgba(4,4,18,0.5)',
  };
}

/* =========================================================
   2D z-DÜZLEMİ
   ========================================================= */
function z2px(zRe, zIm, size) {
  const R = STATE.range;
  const cx = size.w / 2, cy = size.h / 2;
  const scale = Math.min(size.w, size.h) / (2 * R);
  return { x: cx + zRe * scale, y: cy - zIm * scale, scale };
}
function px2z(px, py, size) {
  const R = STATE.range;
  const cx = size.w / 2, cy = size.h / 2;
  const scale = Math.min(size.w, size.h) / (2 * R);
  return { re: (px - cx) / scale, im: -(py - cy) / scale };
}

function draw2D() {
  const size = fitCanvas(cv2d, ctx2d);
  const C = colors();
  ctx2d.fillStyle = C.bg;
  ctx2d.fillRect(0, 0, size.w, size.h);

  const R = STATE.range;
  const { x: cx, y: cy, scale } = z2px(0, 0, size);

  // Birim çember dışı kararsızlık bölgesi — hafif kırmızı tint
  ctx2d.fillStyle = isLight() ? 'rgba(255,80,100,0.05)' : 'rgba(255,80,100,0.06)';
  ctx2d.fillRect(0, 0, size.w, size.h);
  // İçini tekrar bg ile boyamak yerine sadece dış halkayı vurgulamak yeterli.
  ctx2d.fillStyle = C.bg;
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, scale, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();

  // Grid
  if (STATE.showGrid) {
    ctx2d.strokeStyle = C.grid;
    ctx2d.lineWidth = 0.5;
    for (let s = -Math.ceil(R); s <= R; s += 0.5) {
      const p1 = z2px(s, -R, size), p2 = z2px(s, R, size);
      ctx2d.beginPath(); ctx2d.moveTo(p1.x, p1.y); ctx2d.lineTo(p2.x, p2.y); ctx2d.stroke();
      const p3 = z2px(-R, s, size), p4 = z2px(R, s, size);
      ctx2d.beginPath(); ctx2d.moveTo(p3.x, p3.y); ctx2d.lineTo(p4.x, p4.y); ctx2d.stroke();
    }
    ctx2d.strokeStyle = C.gridStrong;
    ctx2d.lineWidth = 0.7;
    for (let s = -Math.ceil(R); s <= R; s++) {
      const p1 = z2px(s, -R, size), p2 = z2px(s, R, size);
      ctx2d.beginPath(); ctx2d.moveTo(p1.x, p1.y); ctx2d.lineTo(p2.x, p2.y); ctx2d.stroke();
      const p3 = z2px(-R, s, size), p4 = z2px(R, s, size);
      ctx2d.beginPath(); ctx2d.moveTo(p3.x, p3.y); ctx2d.lineTo(p4.x, p4.y); ctx2d.stroke();
    }
  }

  // Eksenler
  ctx2d.lineWidth = 1.8;
  ctx2d.strokeStyle = C.reAxis;
  ctx2d.beginPath();
  ctx2d.moveTo(0, cy); ctx2d.lineTo(size.w, cy);
  ctx2d.stroke();
  ctx2d.strokeStyle = C.imAxis;
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.moveTo(cx, 0); ctx2d.lineTo(cx, size.h);
  ctx2d.stroke();

  // Birim çember (vurgulanmış)
  ctx2d.strokeStyle = C.unitCircle;
  ctx2d.lineWidth = 2.2;
  ctx2d.shadowColor = C.unitCircle; ctx2d.shadowBlur = 6;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, scale, 0, Math.PI * 2);
  ctx2d.stroke();
  ctx2d.shadowBlur = 0;

  // Ok başları + etiketler
  ctx2d.fillStyle = C.reAxis;
  ctx2d.font = 'bold 14px "Saira Condensed", sans-serif';
  ctx2d.fillText('+Re', size.w - 32, cy - 8);
  ctx2d.font = 'bold 11px "Saira Condensed", sans-serif';
  ctx2d.fillText('−Re', 4, cy - 8);
  ctx2d.strokeStyle = C.reAxis; ctx2d.lineWidth = 1.8;
  ctx2d.beginPath();
  ctx2d.moveTo(size.w - 1, cy); ctx2d.lineTo(size.w - 8, cy - 4);
  ctx2d.moveTo(size.w - 1, cy); ctx2d.lineTo(size.w - 8, cy + 4);
  ctx2d.stroke();

  ctx2d.fillStyle = C.imAxis;
  ctx2d.font = 'bold 14px "Saira Condensed", sans-serif';
  ctx2d.fillText('+jIm', cx + 8, 14);
  ctx2d.font = 'bold 11px "Saira Condensed", sans-serif';
  ctx2d.fillText('−jIm', cx + 8, size.h - 6);
  ctx2d.strokeStyle = C.imAxis; ctx2d.lineWidth = 1.8;
  ctx2d.beginPath();
  ctx2d.moveTo(cx, 1); ctx2d.lineTo(cx - 4, 8);
  ctx2d.moveTo(cx, 1); ctx2d.lineTo(cx + 4, 8);
  ctx2d.stroke();

  // |z|=1 etiketi
  ctx2d.fillStyle = C.unitCircle;
  ctx2d.font = 'bold 10px "Fira Code", monospace';
  ctx2d.fillText('|z|=1', cx + scale + 4, cy - 6);

  // Tam sayı tick etiketleri
  ctx2d.fillStyle = C.labelDim;
  ctx2d.font = '9px "Fira Code", monospace';
  for (let s = -Math.ceil(R); s <= R; s++) {
    if (s === 0) continue;
    const p = z2px(s, 0, size);
    ctx2d.fillText(String(s), p.x + 2, cy + 11);
    const q = z2px(0, s, size);
    ctx2d.fillText(String(s), cx + 4, q.y + 3);
  }

  // Uzaklık çizgileri — ω noktasından kutuplara/sıfırlara
  if (STATE.showDist) {
    const wRe = Math.cos(STATE.omega), wIm = Math.sin(STATE.omega);
    const wp = z2px(wRe, wIm, size);
    ctx2d.lineWidth = 1.0;
    ctx2d.setLineDash([3, 3]);
    for (const p of STATE.poles) {
      const pp = z2px(p.re, p.im, size);
      ctx2d.strokeStyle = C.distP;
      ctx2d.beginPath(); ctx2d.moveTo(wp.x, wp.y); ctx2d.lineTo(pp.x, pp.y); ctx2d.stroke();
    }
    for (const z of STATE.zeros) {
      const zp = z2px(z.re, z.im, size);
      ctx2d.strokeStyle = C.distZ;
      ctx2d.beginPath(); ctx2d.moveTo(wp.x, wp.y); ctx2d.lineTo(zp.x, zp.y); ctx2d.stroke();
    }
    ctx2d.setLineDash([]);
  }

  // Kutuplar (×)
  ctx2d.strokeStyle = C.pole;
  ctx2d.lineWidth = 2.4;
  ctx2d.shadowColor = C.pole; ctx2d.shadowBlur = 6;
  for (const p of STATE.poles) {
    const pt = z2px(p.re, p.im, size);
    ctx2d.beginPath();
    ctx2d.moveTo(pt.x - 6, pt.y - 6); ctx2d.lineTo(pt.x + 6, pt.y + 6);
    ctx2d.moveTo(pt.x - 6, pt.y + 6); ctx2d.lineTo(pt.x + 6, pt.y - 6);
    ctx2d.stroke();
  }
  // Sıfırlar (◯)
  ctx2d.strokeStyle = C.zero;
  ctx2d.shadowColor = C.zero;
  for (const z of STATE.zeros) {
    const pt = z2px(z.re, z.im, size);
    ctx2d.beginPath();
    ctx2d.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
    ctx2d.stroke();
  }
  ctx2d.shadowBlur = 0;

  // Birim çember üzerinde ω noktası
  const wRe = Math.cos(STATE.omega), wIm = Math.sin(STATE.omega);
  const wp = z2px(wRe, wIm, size);
  ctx2d.fillStyle = C.movePt;
  ctx2d.shadowColor = C.movePt; ctx2d.shadowBlur = 8;
  ctx2d.beginPath();
  ctx2d.arc(wp.x, wp.y, 6, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.shadowBlur = 0;
  ctx2d.fillStyle = C.label;
  ctx2d.font = 'bold 10px "Fira Code", monospace';
  ctx2d.fillText(`ω=${STATE.omega.toFixed(2)}`, wp.x + 8, wp.y - 8);

  // İmleç tooltip — ω, r
  if (Z2D_HOVER.active) {
    const hr = Math.hypot(Z2D_HOVER.re, Z2D_HOVER.im);
    const hw = Math.atan2(Z2D_HOVER.im, Z2D_HOVER.re);
    ctx2d.save();
    ctx2d.strokeStyle = '#ffd24a';
    ctx2d.lineWidth = 1;
    ctx2d.setLineDash([3, 3]);
    ctx2d.beginPath();
    ctx2d.moveTo(cx, cy); ctx2d.lineTo(Z2D_HOVER.x, Z2D_HOVER.y);
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.fillStyle = '#ffd24a';
    ctx2d.beginPath();
    ctx2d.arc(Z2D_HOVER.x, Z2D_HOVER.y, 3, 0, Math.PI*2);
    ctx2d.fill();
    const txt = `ω=${hw.toFixed(3)} (${(hw/Math.PI).toFixed(2)}π) · r=${hr.toFixed(3)}`;
    ctx2d.font = 'bold 11px "Fira Code", monospace';
    const tw = ctx2d.measureText(txt).width;
    let bx = Z2D_HOVER.x + 10, by = Z2D_HOVER.y - 24;
    if (bx + tw + 12 > size.w) bx = Z2D_HOVER.x - tw - 18;
    if (by < 4) by = Z2D_HOVER.y + 10;
    ctx2d.fillStyle = isLight() ? 'rgba(255,255,255,0.95)' : 'rgba(8,10,28,0.92)';
    ctx2d.strokeStyle = '#ffd24a';
    ctx2d.lineWidth = 1;
    ctx2d.fillRect(bx, by, tw + 12, 18);
    ctx2d.strokeRect(bx, by, tw + 12, 18);
    ctx2d.fillStyle = '#ffd24a';
    ctx2d.fillText(txt, bx + 6, by + 13);
    ctx2d.restore();
  }
}

/* =========================================================
   3D |H(z)| YÜZEYİ
   ========================================================= */
function project3D(X, Y, Z, size) {
  const cosX = Math.cos(STATE.rotX), sinX = Math.sin(STATE.rotX);
  const cosY = Math.cos(STATE.rotY), sinY = Math.sin(STATE.rotY);
  const R = STATE.range;
  const sScale = Math.min(size.w, size.h) / (2.4 * R) * STATE.zoom;
  const hHeightScale = R * 0.7;
  const cx = size.w / 2, cy = size.h / 2;

  // Yaw — |H| ekseni etrafında dönüş (Re-Im düzleminde)
  const Xr = X * cosY - Y * sinY;
  const Yr = X * sinY + Y * cosY;
  // Yükseklik ölçekle
  const Zh = Z * (hHeightScale / STATE.cap);
  // Pitch — yatay (Xr) eksen etrafında tilt
  const Y1 = Yr * cosX - Zh * sinX;
  return { x: cx + Xr * sScale, y: cy - Y1 * sScale };
}

function drawSurface3D(size) {
  const C = colors();
  const N = STATE.N3d;
  const R = STATE.range;
  const cap = STATE.cap;

  const grid = [];
  for (let i = 0; i <= N; i++) {
    const row = [];
    const re = -R + (2 * R) * (i / N);
    for (let j = 0; j <= N; j++) {
      const im = -R + (2 * R) * (j / N);
      const m = Math.min(cap, magH(re, im));
      row.push({ re, im, m });
    }
    grid.push(row);
  }

  function heightColor(h) {
    if (isLight()) {
      const t = Math.min(1, h / cap);
      const r = Math.round(120 + 100 * t);
      const g = Math.round(60 + 40 * t);
      const b = Math.round(170 - 80 * t);
      const a = 0.35 + 0.4 * t;
      return `rgba(${r},${g},${b},${a})`;
    }
    const t = Math.min(1, h / cap);
    const r = Math.round(255 * t);
    const g = Math.round(140 + 60 * t);
    const b = Math.round(140 * (1 - t) + 40);
    const a = 0.4 + 0.5 * t;
    return `rgba(${r},${g},${b},${a})`;
  }
  ctx3d.lineWidth = 0.8;
  for (let i = 0; i <= N; i++) {
    ctx3d.beginPath();
    for (let j = 0; j <= N; j++) {
      const g = grid[i][j];
      const p = project3D(g.re, g.im, g.m, size);
      if (j === 0) ctx3d.moveTo(p.x, p.y); else ctx3d.lineTo(p.x, p.y);
    }
    ctx3d.strokeStyle = (i % 5 === 0)
      ? heightColor(grid[i][Math.floor(N/2)].m) : C.grid;
    ctx3d.stroke();
  }
  for (let j = 0; j <= N; j++) {
    ctx3d.beginPath();
    for (let i = 0; i <= N; i++) {
      const g = grid[i][j];
      const p = project3D(g.re, g.im, g.m, size);
      if (i === 0) ctx3d.moveTo(p.x, p.y); else ctx3d.lineTo(p.x, p.y);
    }
    ctx3d.strokeStyle = (j % 5 === 0)
      ? heightColor(grid[Math.floor(N/2)][j].m) : C.grid;
    ctx3d.stroke();
  }
}

function drawUnitCircle3D(size) {
  const C = colors();
  ctx3d.strokeStyle = C.freqLine;
  ctx3d.lineWidth = 2.6;
  ctx3d.shadowColor = C.freqLine; ctx3d.shadowBlur = 7;
  const Nw = 360;
  ctx3d.beginPath();
  for (let i = 0; i <= Nw; i++) {
    const w = (2 * Math.PI) * (i / Nw);
    const re = Math.cos(w), im = Math.sin(w);
    const m = Math.min(STATE.cap, magH(re, im));
    const p = project3D(re, im, m, size);
    if (i === 0) ctx3d.moveTo(p.x, p.y); else ctx3d.lineTo(p.x, p.y);
  }
  ctx3d.stroke();
  ctx3d.shadowBlur = 0;

  // Birim çember tabanı (taban dairesi)
  ctx3d.strokeStyle = C.unitCircle;
  ctx3d.lineWidth = 1.4;
  ctx3d.setLineDash([4, 3]);
  ctx3d.beginPath();
  for (let i = 0; i <= Nw; i++) {
    const w = (2 * Math.PI) * (i / Nw);
    const p = project3D(Math.cos(w), Math.sin(w), 0, size);
    if (i === 0) ctx3d.moveTo(p.x, p.y); else ctx3d.lineTo(p.x, p.y);
  }
  ctx3d.stroke();
  ctx3d.setLineDash([]);
}

function drawPolesZeros3D(size) {
  const C = colors();
  // Sıfırlar (taban düzleminde)
  ctx3d.strokeStyle = C.zero; ctx3d.lineWidth = 2;
  ctx3d.shadowColor = C.zero; ctx3d.shadowBlur = 5;
  for (const z of STATE.zeros) {
    const p = project3D(z.re, z.im, 0, size);
    ctx3d.beginPath(); ctx3d.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx3d.stroke();
  }
  // Kutuplar — taban → kapak yüksekliğine kadar dikey kırmızı sütun
  ctx3d.strokeStyle = C.pole; ctx3d.lineWidth = 2.2;
  ctx3d.shadowColor = C.pole;
  for (const p of STATE.poles) {
    const pBot = project3D(p.re, p.im, 0, size);
    const pTop = project3D(p.re, p.im, STATE.cap, size);
    ctx3d.beginPath(); ctx3d.moveTo(pBot.x, pBot.y); ctx3d.lineTo(pTop.x, pTop.y); ctx3d.stroke();
    // × işareti taban düzleminde
    ctx3d.beginPath();
    ctx3d.moveTo(pBot.x - 5, pBot.y - 5); ctx3d.lineTo(pBot.x + 5, pBot.y + 5);
    ctx3d.moveTo(pBot.x - 5, pBot.y + 5); ctx3d.lineTo(pBot.x + 5, pBot.y - 5);
    ctx3d.stroke();
  }
  ctx3d.shadowBlur = 0;
}

function drawAxes3D(size) {
  const C = colors();
  const R = STATE.range;
  ctx3d.strokeStyle = C.gridStrong; ctx3d.lineWidth = 1;
  // Re ekseni
  const pRe0 = project3D(-R*1.05, 0, 0, size), pReE = project3D(R*1.05, 0, 0, size);
  ctx3d.beginPath(); ctx3d.moveTo(pRe0.x, pRe0.y); ctx3d.lineTo(pReE.x, pReE.y); ctx3d.stroke();
  // Im ekseni
  const pIm0 = project3D(0, -R*1.05, 0, size), pImE = project3D(0, R*1.05, 0, size);
  ctx3d.beginPath(); ctx3d.moveTo(pIm0.x, pIm0.y); ctx3d.lineTo(pImE.x, pImE.y); ctx3d.stroke();
  // |H| ekseni
  const pZ0 = project3D(0, 0, 0, size), pZE = project3D(0, 0, STATE.cap*1.05, size);
  ctx3d.beginPath(); ctx3d.moveTo(pZ0.x, pZ0.y); ctx3d.lineTo(pZE.x, pZE.y); ctx3d.stroke();

  // Birim çember üzerindeki ω etiketleri
  ctx3d.fillStyle = C.label;
  ctx3d.font = 'bold 11px "Fira Code", monospace';
  // ω = 0 → (1, 0)
  const p0  = project3D(1.12, 0, 0, size);
  ctx3d.fillText('ω=0', p0.x + 2, p0.y);
  // ω = π/2 → (0, 1)
  const pP2 = project3D(0, 1.12, 0, size);
  ctx3d.fillText('ω=π/2', pP2.x + 2, pP2.y - 2);
  // ω = π → (-1, 0)
  const pPi = project3D(-1.12, 0, 0, size);
  ctx3d.fillText('ω=±π', pPi.x - 32, pPi.y);
  // ω = -π/2 → (0, -1)
  const pMP2 = project3D(0, -1.12, 0, size);
  ctx3d.fillText('ω=-π/2', pMP2.x + 2, pMP2.y + 10);

  // |H| eksen başı
  ctx3d.fillStyle = C.freqLine;
  ctx3d.fillText('|H(z)|', pZE.x, pZE.y - 4);

  // Eksen başlarında küçük tick noktaları
  ctx3d.fillStyle = C.unitCircle;
  [[1,0],[0,1],[-1,0],[0,-1]].forEach(([cr, ci]) => {
    const p = project3D(cr, ci, 0, size);
    ctx3d.beginPath(); ctx3d.arc(p.x, p.y, 2.4, 0, Math.PI*2); ctx3d.fill();
  });
}

function draw3D() {
  const size = fitCanvas(cv3d, ctx3d);
  const C = colors();
  ctx3d.fillStyle = C.bg;
  ctx3d.fillRect(0, 0, size.w, size.h);

  drawAxes3D(size);
  if (STATE.showSurface) drawSurface3D(size);
  if (STATE.showUnitCircle) drawUnitCircle3D(size);
  drawPolesZeros3D(size);

  // ω noktası
  const wre = Math.cos(STATE.omega), wim = Math.sin(STATE.omega);
  const wmag = Math.min(STATE.cap, magH(wre, wim));
  const mp = project3D(wre, wim, wmag, size);
  ctx3d.fillStyle = C.movePt;
  ctx3d.shadowColor = C.movePt; ctx3d.shadowBlur = 8;
  ctx3d.beginPath(); ctx3d.arc(mp.x, mp.y, 5.5, 0, Math.PI * 2); ctx3d.fill();
  ctx3d.shadowBlur = 0;
}

/* =========================================================
   FREKANS YANITI |H(e^jω)|  (ω ∈ [-π, π])
   ========================================================= */
function drawFreqResponse() {
  const size = fitCanvas(cvFreq, ctxFreq);
  const C = colors();
  ctxFreq.fillStyle = C.bg;
  ctxFreq.fillRect(0, 0, size.w, size.h);

  const Nw = 512;
  const samples = new Float64Array(Nw + 1);
  let yPeak = 0;
  for (let i = 0; i <= Nw; i++) {
    const w = -Math.PI + (2 * Math.PI) * (i / Nw);
    const m = Math.min(STATE.cap, magH(Math.cos(w), Math.sin(w)));
    samples[i] = m;
    if (m > yPeak) yPeak = m;
  }
  if (yPeak < 1e-9) yPeak = 1;
  const yMax = Math.min(STATE.cap, Math.max(yPeak, 0.5));

  const padL = 36, padR = 10, padT = 12, padB = 22;
  const wPlot = size.w - padL - padR;
  const hPlot = size.h - padT - padB;

  // Y grid
  ctxFreq.strokeStyle = C.grid;
  ctxFreq.lineWidth = 1;
  const yStep = niceStep(yMax / 4);
  ctxFreq.fillStyle = C.labelDim;
  ctxFreq.font = "9.5px 'Fira Code', monospace";
  for (let v = 0; v <= yMax + 1e-9; v += yStep) {
    const y = padT + hPlot - (v / yMax) * hPlot;
    ctxFreq.beginPath(); ctxFreq.moveTo(padL, y); ctxFreq.lineTo(padL + wPlot, y); ctxFreq.stroke();
    ctxFreq.fillText(v.toFixed(yStep < 1 ? 2 : 1), 4, y + 3);
  }

  // X grid — ω = -π, -π/2, 0, π/2, π
  const xLabels = [
    { w: -Math.PI,    l: '-π' },
    { w: -Math.PI/2,  l: '-π/2' },
    { w: 0,           l: '0' },
    { w: Math.PI/2,   l: 'π/2' },
    { w: Math.PI,     l: 'π' },
  ];
  for (const xl of xLabels) {
    const x = padL + ((xl.w + Math.PI) / (2*Math.PI)) * wPlot;
    ctxFreq.strokeStyle = C.grid;
    ctxFreq.beginPath(); ctxFreq.moveTo(x, padT); ctxFreq.lineTo(x, padT + hPlot); ctxFreq.stroke();
    ctxFreq.fillStyle = C.labelDim;
    ctxFreq.fillText(xl.l, x - 10, padT + hPlot + 14);
  }
  // ω=0 vurgu çizgisi (DC) — orta
  const x0 = padL + 0.5 * wPlot;
  ctxFreq.strokeStyle = C.unitCircle;
  ctxFreq.setLineDash([3, 3]);
  ctxFreq.beginPath(); ctxFreq.moveTo(x0, padT); ctxFreq.lineTo(x0, padT + hPlot); ctxFreq.stroke();
  ctxFreq.setLineDash([]);

  // Gradyan dolgu
  const grad = ctxFreq.createLinearGradient(0, padT, 0, padT + hPlot);
  grad.addColorStop(0, 'rgba(57,255,133,0.40)');
  grad.addColorStop(1, 'rgba(57,255,133,0.02)');
  ctxFreq.fillStyle = grad;
  ctxFreq.beginPath();
  ctxFreq.moveTo(padL, padT + hPlot);
  for (let i = 0; i <= Nw; i++) {
    const x = padL + (i / Nw) * wPlot;
    const y = padT + hPlot - (samples[i] / yMax) * hPlot;
    ctxFreq.lineTo(x, y);
  }
  ctxFreq.lineTo(padL + wPlot, padT + hPlot);
  ctxFreq.closePath(); ctxFreq.fill();

  // Eğri
  ctxFreq.strokeStyle = C.freqLine;
  ctxFreq.lineWidth = 2.0;
  ctxFreq.shadowColor = C.freqLine; ctxFreq.shadowBlur = 4;
  ctxFreq.beginPath();
  for (let i = 0; i <= Nw; i++) {
    const x = padL + (i / Nw) * wPlot;
    const y = padT + hPlot - (samples[i] / yMax) * hPlot;
    if (i === 0) ctxFreq.moveTo(x, y); else ctxFreq.lineTo(x, y);
  }
  ctxFreq.stroke();
  ctxFreq.shadowBlur = 0;

  // ω marker — STATE.omega ∈ [-π, π]
  const xMk = padL + ((STATE.omega + Math.PI) / (2*Math.PI)) * wPlot;
  const mVal = Math.min(STATE.cap, magH(Math.cos(STATE.omega), Math.sin(STATE.omega)));
  const yMk = padT + hPlot - (mVal / yMax) * hPlot;
  ctxFreq.strokeStyle = C.movePt;
  ctxFreq.lineWidth = 1.4;
  ctxFreq.beginPath(); ctxFreq.moveTo(xMk, padT); ctxFreq.lineTo(xMk, padT + hPlot); ctxFreq.stroke();
  ctxFreq.fillStyle = C.movePt;
  ctxFreq.shadowColor = C.movePt; ctxFreq.shadowBlur = 8;
  ctxFreq.beginPath(); ctxFreq.arc(xMk, yMk, 5, 0, Math.PI * 2); ctxFreq.fill();
  ctxFreq.shadowBlur = 0;

  // Peak değer sağ üstte
  ctxFreq.fillStyle = C.label;
  ctxFreq.font = "bold 11px 'Fira Code', monospace";
  ctxFreq.fillText(`|H| = ${mVal.toFixed(3)}`, padL + wPlot - 100, padT + 12);

  // Fare basılı tutma kutucuğu
  if (FREQ_TT.active && FREQ_TT.canvas === 'top') {
    drawFreqTooltip(ctxFreq, size, padL, padT, wPlot, hPlot,
                    FREQ_TT.x, FREQ_TT.omega, FREQ_TT.mag, C, '#39ff85');
  }
}

function drawFreqTooltip(ctx, size, padL, padT, wPlot, hPlot, mouseX, omega, mag, C, color) {
  const xMk = Math.max(padL, Math.min(padL + wPlot, mouseX));
  ctx.save();
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(xMk, padT); ctx.lineTo(xMk, padT + hPlot); ctx.stroke();
  ctx.setLineDash([]);

  const omegaPiStr = (omega / Math.PI).toFixed(3) + 'π';
  const txt = `ω=${omega.toFixed(3)} (${omegaPiStr}) · |H|=${mag.toFixed(4)}`;
  ctx.font = 'bold 11px "Fira Code", monospace';
  const tw = ctx.measureText(txt).width;
  let bx = xMk + 8, by = padT + 4;
  if (bx + tw + 12 > size.w) bx = xMk - tw - 16;
  ctx.fillStyle = isLight() ? 'rgba(255,255,255,0.95)' : 'rgba(8,10,28,0.92)';
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 1;
  ctx.fillRect(bx, by, tw + 12, 20);
  ctx.strokeRect(bx, by, tw + 12, 20);
  ctx.fillStyle = '#ffd24a';
  ctx.fillText(txt, bx + 6, by + 14);
  ctx.restore();
}

/* =========================================================
   h[n] STEM
   ========================================================= */
function drawImpulse() {
  const size = fitCanvas(cvImp, ctxImp);
  const C = colors();
  ctxImp.fillStyle = C.bg;
  ctxImp.fillRect(0, 0, size.w, size.h);

  const h = STATE.h;
  const N = h.length;
  let absMax = 1e-9;
  for (let i = 0; i < N; i++) if (Math.abs(h[i]) > absMax) absMax = Math.abs(h[i]);
  absMax = Math.min(absMax, 50);
  const padL = 36, padR = 12, padT = 14, padB = 22;
  const wPlot = size.w - padL - padR;
  const hPlot = size.h - padT - padB;
  const y0 = padT + hPlot / 2;
  const yScale = (hPlot * 0.42) / absMax;

  ctxImp.strokeStyle = C.grid; ctxImp.lineWidth = 1;
  const yStep = niceStep(absMax / 2);
  ctxImp.fillStyle = C.labelDim;
  ctxImp.font = "9.5px 'Fira Code', monospace";
  for (let v = -Math.ceil(absMax/yStep)*yStep; v <= absMax + 1e-9; v += yStep) {
    const y = y0 - v * yScale;
    if (y < padT - 2 || y > padT + hPlot + 2) continue;
    ctxImp.beginPath(); ctxImp.moveTo(padL, y); ctxImp.lineTo(padL + wPlot, y); ctxImp.stroke();
    ctxImp.fillText(v.toFixed(yStep < 1 ? 2 : 1), 2, y + 3);
  }

  // 0 ekseni
  ctxImp.strokeStyle = C.gridStrong;
  ctxImp.lineWidth = 1.5;
  ctxImp.beginPath(); ctxImp.moveTo(padL, y0); ctxImp.lineTo(padL + wPlot, y0); ctxImp.stroke();

  const xStep = Math.max(1, Math.round(N / 8));
  for (let n = 0; n < N; n += xStep) {
    const x = padL + (n / Math.max(1, N - 1)) * wPlot;
    ctxImp.strokeStyle = C.grid;
    ctxImp.beginPath(); ctxImp.moveTo(x, padT); ctxImp.lineTo(x, padT + hPlot); ctxImp.stroke();
    ctxImp.fillStyle = C.labelDim;
    ctxImp.fillText(`${n}`, x - 5, padT + hPlot + 14);
  }
  ctxImp.fillStyle = C.label;
  ctxImp.font = "10px 'Fira Code', monospace";
  ctxImp.fillText('n →', padL + wPlot - 25, padT + hPlot + 14);

  // Stem
  ctxImp.strokeStyle = C.stem;
  ctxImp.fillStyle = C.stem;
  ctxImp.lineWidth = 1.6;
  ctxImp.shadowColor = C.stem; ctxImp.shadowBlur = 4;
  for (let n = 0; n < N; n++) {
    const x = padL + (n / Math.max(1, N - 1)) * wPlot;
    const y = y0 - h[n] * yScale;
    ctxImp.beginPath(); ctxImp.moveTo(x, y0); ctxImp.lineTo(x, y); ctxImp.stroke();
    ctxImp.beginPath(); ctxImp.arc(x, y, 3.3, 0, Math.PI * 2); ctxImp.fill();
  }
  ctxImp.shadowBlur = 0;
}

/* =========================================================
   KUTUP-SIFIR LİSTESİ & UI
   ========================================================= */
function renderList() {
  if (!ui.pzList) return;
  ui.pzList.innerHTML = '';
  STATE.poles.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'pz-item pole';
    div.innerHTML = `
      <span class="pz-tag p">P${idx+1}</span>
      <span class="pz-coords">${p.re.toFixed(3)} ${p.im >= 0 ? '+' : '−'} j${Math.abs(p.im).toFixed(3)}</span>
      <span class="pz-rm" data-type="pole" data-idx="${idx}">✕</span>`;
    ui.pzList.appendChild(div);
  });
  STATE.zeros.forEach((z, idx) => {
    const div = document.createElement('div');
    div.className = 'pz-item zero';
    div.innerHTML = `
      <span class="pz-tag z">Z${idx+1}</span>
      <span class="pz-coords">${z.re.toFixed(3)} ${z.im >= 0 ? '+' : '−'} j${Math.abs(z.im).toFixed(3)}</span>
      <span class="pz-rm" data-type="zero" data-idx="${idx}">✕</span>`;
    ui.pzList.appendChild(div);
  });
  ui.pzList.querySelectorAll('.pz-rm').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.idx);
      const arr = el.dataset.type === 'pole' ? STATE.poles : STATE.zeros;
      arr.splice(idx, 1);
      updateAll();
    };
  });
  ui.nPoles.textContent = STATE.poles.length;
  ui.nZeros.textContent = STATE.zeros.length;
  let maxR = 0;
  for (const p of STATE.poles) maxR = Math.max(maxR, cAbs(p));
  let stab;
  if (STATE.poles.length === 0) stab = 'stabil (FIR)';
  else if (maxR < 1 - 1e-4) stab = `KARARLI ✓ (max|p|=${maxR.toFixed(3)})`;
  else if (maxR > 1 + 1e-4) stab = `KARARSIZ ✗ (max|p|=${maxR.toFixed(3)})`;
  else stab = `sınırda (max|p|=${maxR.toFixed(3)})`;
  ui.stability.textContent = stab;
  ui.stability.style.color = (maxR > 1 + 1e-4) ? '#ff5577' :
                              (maxR > 1 - 1e-4) ? '#ffb84a' : 'var(--accent-1)';
}

function addPointAt(type, re, im) {
  const arr = (type === 'pole') ? STATE.poles : STATE.zeros;
  arr.push({ re, im });
  if (Math.abs(im) > 1e-6) arr.push({ re, im: -im });
}

window.addPoint = function (type) {
  const re = parseFloat(ui.addRe.value);
  const im = parseFloat(ui.addIm.value);
  if (isNaN(re) || isNaN(im)) return;
  addPointAt(type, re, im);
  updateAll();
};

window.loadPreset = function (name) {
  STATE.poles = []; STATE.zeros = [];
  switch (name) {
    case 'ma3':
      // 3-tap MA: H(z) = (1 + z^-1 + z^-2)/3 — sıfırlar z = e^{±j2π/3}
      STATE.zeros.push({ re: Math.cos(2*Math.PI/3), im:  Math.sin(2*Math.PI/3) });
      STATE.zeros.push({ re: Math.cos(2*Math.PI/3), im: -Math.sin(2*Math.PI/3) });
      STATE.poles.push({ re: 0, im: 0 });
      STATE.poles.push({ re: 0, im: 0 });
      break;
    case 'lp1':
      // y[n] = (1-α)x[n] + α y[n-1], α=0.8
      STATE.poles.push({ re: 0.8, im: 0 });
      STATE.zeros.push({ re: -1, im: 0 });
      break;
    case 'lp2':
      addPointAt('pole', 0.7, 0.25);
      STATE.zeros.push({ re: -1, im: 0 });
      STATE.zeros.push({ re: -1, im: 0 });
      break;
    case 'hp1':
      STATE.poles.push({ re: -0.7, im: 0 });
      STATE.zeros.push({ re: 1, im: 0 });
      break;
    case 'bp':
      addPointAt('pole', 0.3, 0.85);
      STATE.zeros.push({ re: 1, im: 0 });
      STATE.zeros.push({ re: -1, im: 0 });
      break;
    case 'notch': {
      const w0 = Math.PI / 3;
      STATE.zeros.push({ re: Math.cos(w0), im:  Math.sin(w0) });
      STATE.zeros.push({ re: Math.cos(w0), im: -Math.sin(w0) });
      addPointAt('pole', 0.92 * Math.cos(w0), 0.92 * Math.sin(w0));
      break;
    }
    case 'allpass': {
      const ar = 0.7, ai = 0.4;
      addPointAt('pole', ar, ai);
      const am2 = ar*ar + ai*ai;
      addPointAt('zero', ar/am2, ai/am2);
      break;
    }
    case 'clear':
    default:
      break;
  }
  updateAll();
};

window.setMouseMode = function (mode) {
  STATE.mouseMode = mode;
  if (ui.modePole) ui.modePole.classList.toggle('active', mode === 'pole');
  if (ui.modeZero) ui.modeZero.classList.toggle('active', mode === 'zero');
};

/* =========================================================
   2D FARE
   ========================================================= */
function findNearestPZ(re, im, threshold = 0.12) {
  let best = null, bestD = threshold;
  STATE.poles.forEach((p, i) => {
    const d = Math.hypot(p.re - re, p.im - im);
    if (d < bestD) { bestD = d; best = { type: 'pole', idx: i }; }
  });
  STATE.zeros.forEach((z, i) => {
    const d = Math.hypot(z.re - re, z.im - im);
    if (d < bestD) { bestD = d; best = { type: 'zero', idx: i }; }
  });
  return best;
}

let drag2D = null;
const Z2D_HOVER = { active: false, re: 0, im: 0, x: 0, y: 0 };
cv2d.addEventListener('contextmenu', e => e.preventDefault());
cv2d.addEventListener('mousemove', e => {
  const r = cv2d.getBoundingClientRect();
  const size = { w: r.width, h: r.height };
  const { re, im } = px2z(e.clientX - r.left, e.clientY - r.top, size);
  Z2D_HOVER.active = true;
  Z2D_HOVER.re = re;
  Z2D_HOVER.im = im;
  Z2D_HOVER.x = e.clientX - r.left;
  Z2D_HOVER.y = e.clientY - r.top;
  if (!drag2D) draw2D();
});
cv2d.addEventListener('mouseleave', () => { Z2D_HOVER.active = false; draw2D(); });

cv2d.addEventListener('mousedown', e => {
  const r = cv2d.getBoundingClientRect();
  const size = { w: r.width, h: r.height };
  const { re, im } = px2z(e.clientX - r.left, e.clientY - r.top, size);

  if (e.button === 2) {
    e.preventDefault();
    const hit = findNearestPZ(re, im, 0.12);
    if (hit) {
      const arr = (hit.type === 'pole') ? STATE.poles : STATE.zeros;
      const target = arr[hit.idx];
      arr.splice(hit.idx, 1);
      if (target && Math.abs(target.im) > 0.05) {
        const cj = arr.findIndex(p =>
          Math.abs(p.re - target.re) < 0.05 &&
          Math.abs(p.im + target.im) < 0.05);
        if (cj >= 0) arr.splice(cj, 1);
      }
      updateAll();
    }
    return;
  }
  const hit = findNearestPZ(re, im, 0.10);
  if (hit) {
    drag2D = { type: hit.type, idx: hit.idx };
    return;
  }
  addPointAt(STATE.mouseMode, +re.toFixed(3), +im.toFixed(3));
  updateAll();
});
window.addEventListener('mousemove', e => {
  if (!drag2D) return;
  const r = cv2d.getBoundingClientRect();
  const size = { w: r.width, h: r.height };
  const { re, im } = px2z(e.clientX - r.left, e.clientY - r.top, size);
  const arr = drag2D.type === 'pole' ? STATE.poles : STATE.zeros;
  if (!arr[drag2D.idx]) { drag2D = null; return; }
  arr[drag2D.idx].re = +re.toFixed(3);
  arr[drag2D.idx].im = +im.toFixed(3);
  draw2D(); draw3D(); drawFreqResponse();
});
window.addEventListener('mouseup', () => {
  if (drag2D) { drag2D = null; updateAll(); }
});

/* =========================================================
   3D FARE / ZOOM
   ========================================================= */
let dragging3D = false, dragSX = 0, dragSY = 0, dragRotX = 0, dragRotY = 0;
cv3d.addEventListener('mousedown', e => {
  dragging3D = true;
  dragSX = e.clientX; dragSY = e.clientY;
  dragRotX = STATE.rotX; dragRotY = STATE.rotY;
});
window.addEventListener('mousemove', e => {
  if (!dragging3D) return;
  const dx = e.clientX - dragSX, dy = e.clientY - dragSY;
  STATE.rotY = dragRotY + dx * 0.006;
  STATE.rotX = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, dragRotX + dy * 0.006));
  if (ui.rotX) { ui.rotX.value = Math.round(STATE.rotX * 180/Math.PI); ui.rotXVal.textContent = ui.rotX.value + '°'; }
  if (ui.rotY) { ui.rotY.value = Math.round(STATE.rotY * 180/Math.PI); ui.rotYVal.textContent = ui.rotY.value + '°'; }
  draw3D();
});
window.addEventListener('mouseup', () => { dragging3D = false; });
cv3d.addEventListener('wheel', e => {
  e.preventDefault();
  STATE.zoom = Math.max(0.4, Math.min(2.5, STATE.zoom + (e.deltaY > 0 ? -0.08 : 0.08)));
  if (ui.zoom)    ui.zoom.value = STATE.zoom;
  if (ui.zoomVal) ui.zoomVal.textContent = STATE.zoom.toFixed(2);
  draw3D();
}, { passive: false });

/* =========================================================
   FREKANS CANVAS TIKLAMA / TUT — ω seç + değer kutusu
   ========================================================= */
const FREQ_TT = { active: false, canvas: null, x: 0, omega: 0, mag: 0 };

function freqTTUpdate(e, which, cv) {
  const r = cv.getBoundingClientRect();
  const x = e.clientX - r.left;
  let omega;
  if (which === 'top') {
    // drawFreqResponse: padL=36, padR=10, ω ∈ [-π, π]
    const padL = 36, padR = 10;
    const wPlot = r.width - padL - padR;
    const ratio = Math.max(0, Math.min(1, (x - padL) / wPlot));
    omega = -Math.PI + ratio * 2 * Math.PI;
  } else {
    // drawDTFTSpectrum: padding YOK; x ∈ [0, w], ω ∈ [-omegaMax, +omegaMax]
    const omegaMax = SIG.plotOmegaMax;
    const ratio = Math.max(0, Math.min(1, x / r.width));
    omega = -omegaMax + ratio * 2 * omegaMax;
  }
  FREQ_TT.active = true;
  FREQ_TT.canvas = which;
  FREQ_TT.x = x;
  FREQ_TT.omega = omega;
  if (which === 'top') {
    FREQ_TT.mag = Math.min(STATE.cap, magH(Math.cos(omega), Math.sin(omega)));
    setOmega(omega);
  } else {
    // sinyal spektrumları: en yakın FFT noktasının değerini al
    const mag = (which === 'xf') ? (SPEC_CACHE.Xmag) : (SPEC_CACHE.Ymag);
    const N = SPEC_CACHE.N, dOmega = SPEC_CACHE.dOmega;
    if (mag && N) {
      let kk = Math.round(omega / dOmega);
      let k = (kk + N) % N;
      FREQ_TT.mag = mag[k];
    }
    drawSignalPanel();
  }
}

cvFreq.addEventListener('mousedown', e => {
  freqTTUpdate(e, 'top', cvFreq);
});
window.addEventListener('mousemove', e => {
  if (!FREQ_TT.active) return;
  if (FREQ_TT.canvas === 'top') freqTTUpdate(e, 'top', cvFreq);
  else if (FREQ_TT.canvas === 'xf') freqTTUpdate(e, 'xf', sigUiCanvasFor('xf'));
  else if (FREQ_TT.canvas === 'yf') freqTTUpdate(e, 'yf', sigUiCanvasFor('yf'));
});
window.addEventListener('mouseup', () => {
  if (FREQ_TT.active) {
    FREQ_TT.active = false;
    if (FREQ_TT.canvas === 'top') drawFreqResponse();
    else drawSignalPanel();
  }
});
function sigUiCanvasFor(which) {
  return which === 'xf' ? document.getElementById('cvXf') : document.getElementById('cvYf');
}

/* =========================================================
   ANİMASYON
   ========================================================= */
function wrapOmega(o) {
  // [-π, π) aralığına sar
  let v = ((o + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
  return v;
}
function setOmega(o) {
  STATE.omega = wrapOmega(o);
  if (ui.omegaSlider) ui.omegaSlider.value = STATE.omega;
  updateOmegaDisplay();
  draw2D(); draw3D(); drawFreqResponse();
}
function updateOmegaDisplay() {
  const m = magH(Math.cos(STATE.omega), Math.sin(STATE.omega));
  const mStr = isFinite(m) ? m.toFixed(3) : '∞';
  if (ui.omegaDisplay) ui.omegaDisplay.textContent = `ω = ${STATE.omega.toFixed(2)} · |H(e^jω)| = ${mStr}`;
  if (ui.freqLive) ui.freqLive.textContent = `|H(e^jω)| = ${mStr} · ω = ${STATE.omega.toFixed(2)}`;
}

window.togglePlay = function () {
  STATE.playing = !STATE.playing;
  if (ui.playBtn) {
    ui.playBtn.textContent = STATE.playing ? '⏸' : '▶';
    ui.playBtn.classList.toggle('playing', STATE.playing);
  }
};

function animLoop(now) {
  const dt = (now - STATE.lastTime) / 1000;
  STATE.lastTime = now;
  let need2D = false, need3D = false, needFreq = false;
  if (STATE.playing) {
    STATE.omega = wrapOmega(STATE.omega + dt * STATE.speed * (Math.PI * 0.6));
    if (ui.omegaSlider) ui.omegaSlider.value = STATE.omega;
    updateOmegaDisplay();
    need2D = need3D = needFreq = true;
  }
  if (STATE.autoRot) {
    // "Bana doğru" yön: X ekseni etrafında oscillation — kullanıcı birim
    // çemberin tüm -π..+π DTFT izini farklı dikey açılardan görebilsin.
    // Pitch (rotX) ~ -60° ile +20° arasında sin tabanlı salınım.
    STATE.autoRotPhase = (STATE.autoRotPhase || 0) + dt * 0.55;
    const center = -22 * Math.PI / 180;       // ortalama bakış açısı
    const ampOsc =  42 * Math.PI / 180;       // ± genlik
    STATE.rotX = center + Math.sin(STATE.autoRotPhase) * ampOsc;
    if (ui.rotX) {
      ui.rotX.value = Math.round(STATE.rotX * 180/Math.PI);
      if (ui.rotXVal) ui.rotXVal.textContent = ui.rotX.value + '°';
    }
    need3D = true;
  }
  if (need2D) draw2D();
  if (need3D) draw3D();
  if (needFreq) drawFreqResponse();
  requestAnimationFrame(animLoop);
}
requestAnimationFrame(animLoop);

/* =========================================================
   SLIDER BAĞLAMA
   ========================================================= */
if (ui.rotX) ui.rotX.addEventListener('input', () => {
  STATE.rotX = parseFloat(ui.rotX.value) * Math.PI / 180;
  ui.rotXVal.textContent = ui.rotX.value + '°';
  draw3D();
});
if (ui.rotY) ui.rotY.addEventListener('input', () => {
  STATE.rotY = parseFloat(ui.rotY.value) * Math.PI / 180;
  ui.rotYVal.textContent = ui.rotY.value + '°';
  draw3D();
});
if (ui.zoom) ui.zoom.addEventListener('input', () => {
  STATE.zoom = parseFloat(ui.zoom.value);
  ui.zoomVal.textContent = STATE.zoom.toFixed(2);
  draw3D();
});
if (ui.cap) ui.cap.addEventListener('input', () => {
  STATE.cap = parseFloat(ui.cap.value);
  ui.capVal.textContent = STATE.cap.toFixed(1);
  updateAll();
});
if (ui.gridRes) ui.gridRes.addEventListener('input', () => {
  STATE.N3d = parseInt(ui.gridRes.value);
  ui.gridResVal.textContent = STATE.N3d;
  draw3D();
});
if (ui.range) ui.range.addEventListener('input', () => {
  STATE.range = parseFloat(ui.range.value);
  ui.rangeVal.textContent = STATE.range.toFixed(2);
  draw2D(); draw3D();
});
if (ui.hLen) ui.hLen.addEventListener('input', () => {
  STATE.hLen = parseInt(ui.hLen.value);
  ui.hLenVal.textContent = STATE.hLen;
  if (ui.hNcount) ui.hNcount.textContent = STATE.hLen;
  computeImpulse();
  drawImpulse();
});
if (ui.showSurface) ui.showSurface.addEventListener('change', () => {
  STATE.showSurface = ui.showSurface.checked; draw3D();
});
if (ui.showUnitCircle) ui.showUnitCircle.addEventListener('change', () => {
  STATE.showUnitCircle = ui.showUnitCircle.checked; draw3D();
});
if (ui.showGrid) ui.showGrid.addEventListener('change', () => {
  STATE.showGrid = ui.showGrid.checked; draw2D();
});
if (ui.showDist) ui.showDist.addEventListener('change', () => {
  STATE.showDist = ui.showDist.checked; draw2D();
});
if (ui.autoRot) ui.autoRot.addEventListener('change', () => {
  STATE.autoRot = ui.autoRot.checked;
});
if (ui.omegaSlider) ui.omegaSlider.addEventListener('input', () => {
  setOmega(parseFloat(ui.omegaSlider.value));
});
if (ui.speed) ui.speed.addEventListener('input', () => {
  STATE.speed = parseFloat(ui.speed.value);
  ui.speedVal.textContent = STATE.speed.toFixed(1) + '×';
});

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

/* =========================================================
   ============== AYRIK SİNYAL TESTİ MODÜLÜ ===============
   ========================================================= */
const SIG = {
  components: [],
  N: 512,           // örnek sayısı (FFT noktası, power of 2)
  plotNmax: 120,    // çizim aralığı (örnek)
  plotOmegaMax: Math.PI,  // ω görüntü aralığı (rad/örnek)
  maxComps: 8,
  showH: true,
  hAlpha: 0.4,
  gridDensity: 2,
  gridAlpha: 0.45,
  specCap: Infinity,     // |X|, |Y| spektrumlarında y kapağı
  yZoom: 1.0,            // y[n] zoom çarpanı (1 = otomatik)
  overlayX: true,        // y[n] üstüne saydam x[n] çiz
};
// Spektrum verilerini tooltip için sakla
const SPEC_CACHE = { Xmag: null, Ymag: null, N: 0, dOmega: 0 };
// y[n] üzerine bırakılan ölçüm noktaları (n indeksi)
const YT_MARKERS = [];
// y[n] çizim parametrelerini cache'le → tıklamada n koordinatı çıkar
const YT_GEOM = { padL: 42, plotW: 0, Nplot: 0 };

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

function randomCompHue() {
  const buckets = [10, 50, 95, 135, 170, 205, 260, 300, 330];
  const base = buckets[Math.floor(Math.random() * buckets.length)];
  return (base + Math.floor((Math.random() - 0.5) * 25) + 360) % 360;
}
const hueLine = (h) => `hsl(${h}, 78%, 62%)`;
const hueBg   = (h, a) => `hsla(${h}, 78%, 62%, ${a})`;

const sigUi = {
  type:  document.getElementById('sigType'),
  A:     document.getElementById('sigA'),
  F:     document.getElementById('sigF'),
  P:     document.getElementById('sigP'),
  Aval:  document.getElementById('sigAval'),
  Fval:  document.getElementById('sigFval'),
  Pval:  document.getElementById('sigPval'),
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
  N:     document.getElementById('sigN'),
  Nval:  document.getElementById('sigNval'),
  Ninfo: document.getElementById('sigNinfo'),
  domega:document.getElementById('sigDomega'),
  Nplot: document.getElementById('sigNplot'),
  NplotVal: document.getElementById('sigNplotVal'),
  omegaMax:    document.getElementById('sigOmegaMax'),
  omegaMaxVal: document.getElementById('sigOmegaMaxVal'),
  showH: document.getElementById('sigShowH'),
  hAlpha:document.getElementById('sigHAlpha'),
  hAlphaVal:document.getElementById('sigHAlphaVal'),
  gridDens: document.getElementById('sigGridDens'),
  gridDensVal: document.getElementById('sigGridDensVal'),
  gridAlpha: document.getElementById('sigGridAlpha'),
  gridAlphaVal: document.getElementById('sigGridAlphaVal'),
  specCap:    document.getElementById('sigSpecCap'),
  specCapVal: document.getElementById('sigSpecCapVal'),
  yZoom:      document.getElementById('sigYzoom'),
  yZoomVal:   document.getElementById('sigYzoomVal'),
  overlayX:   document.getElementById('sigOverlayX'),
};

function updateSigTypeUI() {
  if (!sigUi.type) return;
  const t = sigUi.type.value;
  const isPerOnly = (t === 'sin' || t === 'cos');
  const isImpStep = (t === 'impulse' || t === 'step');
  const isCustom  = (t === 'custom');
  const periodic  = isPerOnly || (sigUi.periodic && sigUi.periodic.checked);

  if (sigUi.ctlAperiodic)
    sigUi.ctlAperiodic.style.display = (isPerOnly || isImpStep || periodic) ? 'none' : '';

  if (sigUi.ctlCustom)
    sigUi.ctlCustom.style.display = isCustom ? '' : 'none';

  if (sigUi.ctlPeriodic)
    sigUi.ctlPeriodic.style.display = (isPerOnly || isImpStep) ? 'none' : '';

  if (sigUi.ctlPeriodicCtl)
    sigUi.ctlPeriodicCtl.style.display = (periodic && !isImpStep) ? '' : 'none';
}

/* Bileşeni n=0..N-1 arasında örnekle.
   Aperiyodik darbeler görünür çizim alanının ortasına (SIG.plotNmax/2) merkezlenir. */
function sampleComp(c, n, N) {
  const nCenter = Math.floor(Math.min(N, Math.max(2, SIG.plotNmax)) / 2);
  const nRel = n - nCenter;
  const isPer = c.periodic || c.type === 'sin' || c.type === 'cos';

  if (c.type === 'impulse') {
    return (n === nCenter) ? c.A : 0;
  }
  if (c.type === 'step') {
    return (n >= nCenter) ? c.A : 0;
  }

  if (isPer) {
    const w0 = c.omega0 || 0.3;
    const phase = w0 * n + (c.ph || 0);
    switch (c.type) {
      case 'sin': return c.A * Math.sin(phase);
      case 'cos': return c.A * Math.cos(phase);
      case 'square': return c.A * Math.sign(Math.sin(phase) || 1);
      case 'triangle': return c.A * (2 / Math.PI) * Math.asin(Math.sin(phase));
      case 'gauss': {
        const period = Math.max(2, 2 * Math.PI / Math.max(0.01, w0));
        const sigma = Math.max(1, (c.width || 8) / 4);
        const phN = ((n - (c.ph || 0) / Math.max(0.001, w0)) % period + period * 1.5) % period - period / 2;
        return c.A * Math.exp(-0.5 * Math.pow(phN / sigma, 2));
      }
      case 'custom': {
        if (!c.drawData || c.drawData.length === 0) return 0;
        const Nd = c.drawData.length;
        const period = Math.max(2, 2 * Math.PI / Math.max(0.01, w0));
        const u = ((n - (c.ph || 0) / Math.max(0.001, w0)) / period % 1 + 1) % 1;
        const idx = Math.floor(u * (Nd - 1));
        return c.A * c.drawData[idx];
      }
      default: return 0;
    }
  } else {
    const W = Math.max(2, c.width || 30);
    const halfW = W / 2;
    const d = Math.abs(nRel);
    switch (c.type) {
      case 'square':   return (d <= halfW) ? c.A : 0;
      case 'triangle': return (d <= halfW) ? c.A * (1 - d / halfW) : 0;
      case 'gauss': {
        const sigma = W / 4;
        return c.A * Math.exp(-0.5 * Math.pow(nRel / sigma, 2));
      }
      case 'custom': {
        if (!c.drawData || c.drawData.length === 0) return 0;
        if (d > halfW) return 0;
        const Nd = c.drawData.length;
        const u = (nRel + halfW) / W;
        const idx = Math.max(0, Math.min(Nd - 1, Math.floor(u * (Nd - 1))));
        return c.A * c.drawData[idx];
      }
      default: return 0;
    }
  }
}

/* Cooley–Tukey FFT */
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

function isPureSinusoid(c) {
  return c.type === 'sin' || c.type === 'cos';
}

function computeSignalIO() {
  const N = nextPow2(Math.max(64, Math.min(8192, SIG.N)));
  SIG.N = N;

  const pureComps  = [];
  const otherComps = [];
  for (const c of SIG.components) {
    if (isPureSinusoid(c)) pureComps.push(c); else otherComps.push(c);
  }

  // 1) x[n] toplam + "other" parça ayrı
  const xn = new Float64Array(N);
  const xnOther = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let vT = 0, vO = 0;
    for (const c of pureComps)  vT += sampleComp(c, n, N);
    for (const c of otherComps) { const v = sampleComp(c, n, N); vT += v; vO += v; }
    xn[n] = vT;
    xnOther[n] = vO;
  }

  // 2) "other" parça için FFT yoluyla filtre
  const Xre = Float64Array.from(xnOther), Xim = new Float64Array(N);
  fft(Xre, Xim);
  const Yre = new Float64Array(N), Yim = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const omega = (2 * Math.PI * k) / N;  // 0..2π
    const h = H_unitCircle(omega);
    Yre[k] = Xre[k] * h.re - Xim[k] * h.im;
    Yim[k] = Xre[k] * h.im + Xim[k] * h.re;
  }
  const yOther = Float64Array.from(Yre), yOtherIm = Float64Array.from(Yim);
  ifft(yOther, yOtherIm);

  // 3) Saf sin/cos için analitik filtreleme
  const yn = new Float64Array(N);
  for (let n = 0; n < N; n++) yn[n] = yOther[n];
  for (const c of pureComps) {
    const w0 = c.omega0 || 0;
    const A  = c.A || 0;
    const ph = c.ph || 0;
    const h  = H_unitCircle(w0);
    const Hmag = Math.hypot(h.re, h.im);
    const Hph  = Math.atan2(h.im, h.re);
    const Aout = A * Hmag;
    const phOut = ph + Hph;
    if (c.type === 'sin') {
      for (let n = 0; n < N; n++) yn[n] += Aout * Math.sin(w0 * n + phOut);
    } else {
      for (let n = 0; n < N; n++) yn[n] += Aout * Math.cos(w0 * n + phOut);
    }
  }

  // 4) Spektrumlar
  const Xt = Float64Array.from(xn), Xti = new Float64Array(N);
  fft(Xt, Xti);
  const Yt = Float64Array.from(yn), Yti = new Float64Array(N);
  fft(Yt, Yti);

  const Xmag = new Float64Array(N), Ymag = new Float64Array(N);
  const norm = 2 / N;
  for (let k = 0; k < N; k++) {
    Xmag[k] = Math.hypot(Xt[k], Xti[k]) * norm;
    Ymag[k] = Math.hypot(Yt[k], Yti[k]) * norm;
  }
  const dOmega = 2 * Math.PI / N;
  return { xn, yn, Xmag, Ymag, N, dOmega };
}

/* Ayrık stem çizimi (yoğunsa çizgi şeklinde sönükleştir).
   opts: { overlay: Float64Array | null, overlayColor: string, yZoom: number,
           refSignal: Float64Array (for shared yMax) } */
function drawStemPlot(cv, signal, color, opts) {
  opts = opts || {};
  const ctx = cv.getContext('2d');
  const size = fitCanvas(cv, ctx);
  const C = colors();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);

  const N = signal.length;
  const Nplot = Math.min(N, Math.max(2, SIG.plotNmax));
  let peak = 0;
  for (let i = 0; i < Nplot; i++) {
    const a = Math.abs(signal[i]);
    if (a > peak) peak = a;
  }
  // referans sinyal (overlay) zirvesi de hesaba katılır ki ölçek tutarlı olsun
  if (opts.overlay) {
    for (let i = 0; i < Nplot && i < opts.overlay.length; i++) {
      const a = Math.abs(opts.overlay[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak < 1e-9) peak = 1;
  const yZoom = Math.max(0.01, opts.yZoom || 1.0);
  const peakScaled = peak / yZoom;
  const step = niceStep(peakScaled);
  const yMax = Math.ceil(peakScaled / step) * step;

  const leftPad = 42;
  const y0 = size.h / 2;
  const yAmp = size.h / 2 - 14;
  const plotW = size.w - leftPad - 4;

  const sub = Math.max(1, SIG.gridDensity);
  const a = SIG.gridAlpha;
  const gridMaj = isLight() ? `rgba(20,40,140,${0.55 * a})` : `rgba(180,200,255,${0.55 * a})`;
  const gridMin = isLight() ? `rgba(20,40,140,${0.28 * a})` : `rgba(180,200,255,${0.28 * a})`;

  // Dikey grid (n)
  const xStep = Math.max(1, Math.round(Nplot / 8));
  for (let n = 0; n <= Nplot; n += Math.max(1, Math.floor(xStep / sub))) {
    const x = leftPad + (n / Math.max(1, Nplot - 1)) * plotW;
    const isMajor = (n % xStep === 0);
    ctx.strokeStyle = isMajor ? gridMaj : gridMin;
    ctx.lineWidth = isMajor ? 0.7 : 0.4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.h); ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = C.labelDim;
      ctx.font = '9px "Fira Code", monospace';
      ctx.fillText(`${n}`, x - 5, size.h - 3);
    }
  }
  // Yatay grid
  for (let v = -yMax; v <= yMax + 1e-9; v += step / sub) {
    const isMajor = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const y = y0 - (v / yMax) * yAmp;
    ctx.strokeStyle = isMajor ? gridMaj : gridMin;
    ctx.lineWidth = isMajor ? 0.7 : 0.4;
    ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(size.w, y); ctx.stroke();
  }
  // 0 ekseni & Y ekseni
  ctx.strokeStyle = C.gridStrong;
  ctx.lineWidth = 1.0;
  ctx.beginPath(); ctx.moveTo(leftPad, y0); ctx.lineTo(size.w, y0); ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(leftPad, 0); ctx.lineTo(leftPad, size.h); ctx.stroke();

  // Y tick'leri
  ctx.fillStyle = C.label;
  ctx.font = 'bold 11px "Fira Code", monospace';
  for (let v = -yMax; v <= yMax + 1e-9; v += step) {
    if (Math.abs(v) < 1e-9 && yMax > 0) continue;
    const y = y0 - (v / yMax) * yAmp;
    let lbl = fmtTick(v, step);
    if (v > 0 && lbl.charAt(0) !== '+') lbl = '+' + lbl;
    ctx.fillText(lbl, 3, y + 4);
  }
  ctx.fillStyle = C.labelDim;
  ctx.font = 'bold 10px "Fira Code", monospace';
  ctx.fillText('0', 3, y0 + 4);

  // Stem mi çizgi mi karar: çok yoğunsa çizgi
  const stemDx = plotW / Math.max(1, Nplot - 1);
  const useStem = stemDx >= 5;

  // OVERLAY (saydam x[n] arka plan) — önce çiz ki ana eğri üstte kalsın
  if (opts.overlay) {
    const oCol = opts.overlayColor || 'rgba(57,255,133,0.30)';
    ctx.save();
    ctx.strokeStyle = oCol;
    ctx.fillStyle = oCol;
    ctx.lineWidth = useStem ? 1.0 : 1.2;
    if (useStem) {
      for (let n = 0; n < Nplot; n++) {
        const x = leftPad + (n / Math.max(1, Nplot - 1)) * plotW;
        const y = y0 - (opts.overlay[n] / yMax) * yAmp;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.beginPath();
      for (let n = 0; n < Nplot; n++) {
        const x = leftPad + (n / Math.max(1, Nplot - 1)) * plotW;
        const y = y0 - (opts.overlay[n] / yMax) * yAmp;
        if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  if (useStem) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = color; ctx.shadowBlur = 3;
    for (let n = 0; n < Nplot; n++) {
      const x = leftPad + (n / Math.max(1, Nplot - 1)) * plotW;
      const y = y0 - (signal[n] / yMax) * yAmp;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    ctx.beginPath();
    for (let n = 0; n < Nplot; n++) {
      const x = leftPad + (n / Math.max(1, Nplot - 1)) * plotW;
      const y = y0 - (signal[n] / yMax) * yAmp;
      if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = C.labelDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.fillText('n = 0', leftPad + 2, 11);
  ctx.fillText(`n = ${Nplot - 1}`, size.w - 56, 11);
  ctx.fillStyle = color;
  ctx.font = 'bold 11px "Fira Code", monospace';
  ctx.fillText('peak = ' + peak.toFixed(3), size.w - 120, 14);

  // y[n] üzerine bırakılan ölçüm noktalarını çiz
  if (opts.markers && opts.markers.length) {
    YT_GEOM.padL = leftPad;
    YT_GEOM.plotW = plotW;
    YT_GEOM.Nplot = Nplot;
    ctx.save();
    for (let mi = 0; mi < opts.markers.length; mi++) {
      const m = opts.markers[mi];
      if (m.n < 0 || m.n >= Nplot) continue;
      const x = leftPad + (m.n / Math.max(1, Nplot - 1)) * plotW;
      const v = signal[m.n];
      const y = y0 - (v / yMax) * yAmp;
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, size.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI*2); ctx.fill();
      ctx.font = 'bold 10px "Fira Code", monospace';
      const lbl = `M${mi+1}: n=${m.n} · y=${v.toFixed(3)}`;
      const tw = ctx.measureText(lbl).width;
      let bx = x + 6, by = 14 + mi * 16;
      if (bx + tw + 8 > size.w) bx = x - tw - 10;
      ctx.fillStyle = isLight() ? 'rgba(255,255,255,0.92)' : 'rgba(8,10,28,0.88)';
      ctx.fillRect(bx, by - 11, tw + 8, 14);
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(bx, by - 11, tw + 8, 14);
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(lbl, bx + 4, by);
    }
    ctx.restore();
  }
  // Ölçüm etiketi → canvas dışı, header'a yaz (üstte boş alan)
  if (opts.showMeasure) updateMeasureHeader(cv, opts.markers);
}

function updateMeasureHeader(cv, markers) {
  const card = cv.closest('.sig-card') || cv.parentElement;
  if (!card) return;
  const header = card.querySelector('.canvas-header');
  if (!header) return;
  let badge = header.querySelector('.yt-measure');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'yt-measure';
    badge.style.cssText = [
      'font-family:"Fira Code",monospace',
      'font-weight:700',
      'font-size:0.78rem',
      'color:#5ec8ff',
      'background:rgba(94,200,255,0.10)',
      'border:1px solid #5ec8ff',
      'border-radius:6px',
      'padding:0.15rem 0.5rem',
      'margin:0 0.4rem',
      'white-space:nowrap',
      'order:1',
      'flex:1',
      'text-align:center',
      'box-shadow:0 0 8px rgba(94,200,255,0.18)',
    ].join(';');
    // title'dan sonra, hint'ten önce yerleştir
    const title = header.querySelector('.canvas-title');
    if (title && title.nextSibling) header.insertBefore(badge, title.nextSibling);
    else header.appendChild(badge);
  }
  if (markers && markers.length >= 2) {
    const a = markers[markers.length - 2].n;
    const b = markers[markers.length - 1].n;
    const N0 = Math.abs(b - a);
    if (N0 > 0) {
      const f0 = 1 / N0;
      const w0 = 2 * Math.PI * f0;
      badge.textContent = `N0 = ${N0} · f0 = 1/${N0} ≈ ${f0.toFixed(4)} · ω0 = ${w0.toFixed(3)}`;
      badge.style.display = '';
      return;
    }
  }
  if (markers && markers.length === 1) {
    const isEN = (document.documentElement.lang || '').toLowerCase().startsWith('en');
    badge.textContent = isEN
      ? `M1: n=${markers[0].n} · click second point`
      : `M1: n=${markers[0].n} · ikinci nokta için tıkla`;
    badge.style.display = '';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

function drawDTFTSpectrum(cv, mag, dOmega, N, color, gradColor, opts) {
  const ctx = cv.getContext('2d');
  const size = fitCanvas(cv, ctx);
  const C = colors();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);

  opts = opts || {};
  const omegaMax = SIG.plotOmegaMax;
  const cap = (isFinite(SIG.specCap) && SIG.specCap > 0) ? SIG.specCap : Infinity;
  // (omega, mag) çiftleri — k > N/2 → ω = (k-N)·dω (negatif yarı)
  const pts = [];
  for (let k = 0; k < N; k++) {
    const kk = (k <= N / 2) ? k : k - N;
    const omega = kk * dOmega;
    if (omega >= -omegaMax && omega <= omegaMax) {
      const m = isFinite(cap) ? Math.min(cap, mag[k]) : mag[k];
      pts.push({ omega, m, mRaw: mag[k] });
    }
  }
  pts.sort((a, b) => a.omega - b.omega);

  let peak = 0, peakRaw = 0;
  for (const p of pts) { if (p.m > peak) peak = p.m; if (p.mRaw > peakRaw) peakRaw = p.mRaw; }
  if (peak < 1e-9) peak = 1;
  const yBase = size.h - 16;
  const _hStep = niceStep(peak);
  const _hMax = Math.ceil(peak / _hStep) * _hStep;
  const yScale = (yBase - 8) / _hMax;

  const sub = Math.max(1, SIG.gridDensity);
  const ga = SIG.gridAlpha;
  const gridMaj = isLight() ? `rgba(20,40,140,${0.55 * ga})` : `rgba(180,200,255,${0.55 * ga})`;
  const gridMin = isLight() ? `rgba(20,40,140,${0.28 * ga})` : `rgba(180,200,255,${0.28 * ga})`;

  // Dikey grid — ω = 0, ±π/4, ±π/2, ±3π/4, ±π gibi anahtar noktalar
  const tickFracs = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  for (const fr of tickFracs) {
    const om = fr * Math.PI;
    if (Math.abs(om) > omegaMax + 1e-9) continue;
    const x = (om + omegaMax) / (2 * omegaMax) * size.w;
    ctx.strokeStyle = (fr === 0) ? C.gridStrong : gridMaj;
    ctx.lineWidth = (fr === 0) ? 1.0 : 0.7;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, yBase); ctx.stroke();
  }
  // İnce sub-grid
  if (sub > 1) {
    const minorStep = (Math.PI / 4) / sub;
    for (let om = -omegaMax; om <= omegaMax + 1e-9; om += minorStep) {
      const closest = Math.round(om / (Math.PI / 4)) * (Math.PI / 4);
      if (Math.abs(om - closest) < 1e-6) continue;
      const x = (om + omegaMax) / (2 * omegaMax) * size.w;
      ctx.strokeStyle = gridMin; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, yBase); ctx.stroke();
    }
  }
  // Yatay grid
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

  // Y tick etiketleri
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

  // Gölgeli dolgu
  ctx.lineTo(size.w, yBase);
  ctx.lineTo(0, yBase);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, yBase);
  grad.addColorStop(0, gradColor + '52');
  grad.addColorStop(1, gradColor + '05');
  ctx.fillStyle = grad;
  ctx.fill();

  // H(e^jω) overlay
  if (opts.overlayH && SIG.hAlpha > 0.005) {
    const STEP = (2 * omegaMax) / Math.max(60, Math.min(400, size.w));
    let hPeak = 0;
    const hSamples = [];
    for (let om = -omegaMax; om <= omegaMax; om += STEP) {
      const h = H_unitCircle(om);
      const m = Math.hypot(h.re, h.im);
      hSamples.push({ om, m });
      if (m > hPeak && isFinite(m)) {
        hPeak = m;
      }
    }
    if (hPeak < 1e-9) hPeak = 1;
    const hCap = Math.min(hPeak, STATE.cap);
    const hScale = (yBase - 8) / hCap;
    const a = SIG.hAlpha;
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

    // Etiket — ω=0 noktasında (tam ortada)
    const labelX = size.w / 2;
    // ω=0 değerinden y koordinatı çıkar (örnek değerini kullan)
    const h0 = H_unitCircle(0);
    const h0mag = Math.min(hCap, Math.hypot(h0.re, h0.im));
    const labelY = Math.max(14, yBase - h0mag * hScale - 8);
    ctx.save();
    const txt = '|H(e^jω)|';
    ctx.font = 'bold 11px "Fira Code", monospace';
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = isLight() ? 'rgba(255,255,255,0.92)' : 'rgba(8,10,28,0.85)';
    ctx.fillRect(labelX - tw/2 - 4, labelY - 11, tw + 8, 14);
    ctx.fillStyle = hColSolid;
    ctx.textAlign = 'center';
    ctx.fillText(txt, labelX, labelY);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ω etiketleri
  ctx.fillStyle = C.label;
  ctx.font = '9px "Fira Code", monospace';
  const omLabel = (omegaMax / Math.PI).toFixed(2);
  ctx.fillText(`ω = -${omLabel}π`, 4, size.h - 4);
  ctx.fillText(`ω = +${omLabel}π`, size.w - 66, size.h - 4);
  ctx.fillText('ω = 0', x0 + 4, size.h - 4);
  ctx.fillStyle = color;
  ctx.font = 'bold 10px "Fira Code", monospace';
  ctx.fillText('peak ≈ ' + peakRaw.toFixed(2) + (isFinite(cap) && peakRaw > cap ? ' (cap)' : ''), size.w - 130, 12);

  // Tooltip — fare basılı tutuluyorsa
  if (FREQ_TT.active && FREQ_TT.canvas === opts.which) {
    const r = cv.getBoundingClientRect();
    const xMk = Math.max(0, Math.min(size.w, FREQ_TT.x));
    ctx.save();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(xMk, 0); ctx.lineTo(xMk, yBase); ctx.stroke();
    ctx.setLineDash([]);

    const om = FREQ_TT.omega;
    const omegaPiStr = (om / Math.PI).toFixed(3) + 'π';
    const txt = `ω=${om.toFixed(3)} (${omegaPiStr}) · |${opts.which === 'xf' ? 'X' : 'Y'}|=${FREQ_TT.mag.toFixed(4)}`;
    ctx.font = 'bold 11px "Fira Code", monospace';
    const tw = ctx.measureText(txt).width;
    let bx = xMk + 8, by = 6;
    if (bx + tw + 12 > size.w) bx = xMk - tw - 16;
    ctx.fillStyle = isLight() ? 'rgba(255,255,255,0.95)' : 'rgba(8,10,28,0.92)';
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, tw + 12, 20);
    ctx.strokeRect(bx, by, tw + 12, 20);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(txt, bx + 6, by + 14);
    ctx.restore();
  }
}

function drawComponentsStack(cv, comps, N) {
  const ctx = cv.getContext('2d');
  const size = fitCanvas(cv, ctx);
  const C = colors();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);

  const Nplot = Math.min(N, Math.max(2, SIG.plotNmax));
  const count = Math.max(1, comps.length);
  const stripH = size.h / count;
  const leftPad = 130;
  const typeNames = { sin: _t({tr: 'Sinüs', en: 'Sine'}), cos: _t({tr: 'Kosinüs', en: 'Cosine'}), square: _t({tr: 'Kare', en: 'Square'}), triangle: _t({tr: 'Üçgen', en: 'Triangle'}), gauss: _t({tr: 'Gauss', en: 'Gaussian'}), impulse: 'δ[n]', step: 'u[n]', custom: _t({tr: 'Çizim', en: 'Drawn'}) };

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

    if (idx > 0) {
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, idx * stripH); ctx.lineTo(size.w, idx * stripH);
      ctx.stroke();
    }
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.4;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(leftPad, yC); ctx.lineTo(size.w - 4, yC);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = 'bold 11px "Fira Code", monospace';
    ctx.fillText(`C${idx + 1}`, 6, yC - 4);
    ctx.fillStyle = C.label;
    ctx.font = '9.5px "Fira Code", monospace';
    const typeNm = typeNames[c.type] || c.type;
    ctx.fillText(typeNm, 30, yC - 4);
    ctx.fillStyle = C.labelDim;
    ctx.font = '8.5px "Fira Code", monospace';
    const isAp = !c.periodic && c.type !== 'sin' && c.type !== 'cos' && c.type !== 'impulse' && c.type !== 'step';
    let par;
    if (c.type === 'impulse' || c.type === 'step') {
      par = `A=${c.A.toFixed(2)}`;
    } else if (isAp) {
      par = `A=${c.A.toFixed(1)} W=${(c.width||0).toFixed(0)} örn`;
    } else {
      par = `A=${c.A.toFixed(1)} ω₀=${(c.omega0||0).toFixed(2)} φ=${(c.ph||0).toFixed(2)}`;
    }
    ctx.fillText(par, 6, yC + 9);

    let yMax = 0;
    const samples = new Float64Array(Nplot);
    for (let n = 0; n < Nplot; n++) {
      const v = sampleComp(c, n, N);
      samples[n] = v;
      const a = Math.abs(v);
      if (a > yMax) yMax = a;
    }
    if (yMax < 1e-9) yMax = 1;
    const yAmp = stripH * 0.40;
    const wPlot = size.w - leftPad - 4;
    const dx = wPlot / Math.max(1, Nplot - 1);
    const useStem = dx >= 5;

    if (useStem) {
      // Şerit içinde 0 ekseni (kesik çizgi zaten çizildi, üzerine küçük taban düz çizgi)
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.lineWidth = 1.0;
      ctx.shadowColor = color; ctx.shadowBlur = 2;
      for (let n = 0; n < Nplot; n++) {
        const x = leftPad + (n / Math.max(1, Nplot - 1)) * wPlot;
        const y = yC - (samples[n] / yMax) * yAmp;
        ctx.beginPath(); ctx.moveTo(x, yC); ctx.lineTo(x, y); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = color; ctx.shadowBlur = 3;
      ctx.beginPath();
      for (let n = 0; n < Nplot; n++) {
        const x = leftPad + (n / (Nplot - 1)) * wPlot;
        const y = yC - (samples[n] / yMax) * yAmp;
        if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  });

  ctx.fillStyle = C.labelDim;
  ctx.font = '9px "Fira Code", monospace';
  ctx.fillText(`n = 0`, leftPad + 2, 10);
  ctx.fillText(`n = ${Nplot - 1}`, size.w - 56, 10);
}

function drawSignalPanel() {
  if (!sigUi.cvXt) return;
  const data = computeSignalIO();
  // Cache for tooltip lookups
  SPEC_CACHE.Xmag = data.Xmag; SPEC_CACHE.Ymag = data.Ymag;
  SPEC_CACHE.N = data.N; SPEC_CACHE.dOmega = data.dOmega;

  drawComponentsStack(sigUi.cvComps, SIG.components, data.N);
  drawStemPlot(sigUi.cvXt, data.xn, '#39ff85');
  drawStemPlot(sigUi.cvYt, data.yn, '#ff8c42', {
    overlay: SIG.overlayX ? data.xn : null,
    overlayColor: isLight() ? 'rgba(14,110,46,0.30)' : 'rgba(57,255,133,0.28)',
    yZoom: SIG.yZoom,
    markers: YT_MARKERS,
    showMeasure: true,
  });
  drawDTFTSpectrum(sigUi.cvXf, data.Xmag, data.dOmega, data.N, '#39ff85', '#39ff85', { which: 'xf' });
  drawDTFTSpectrum(sigUi.cvYf, data.Ymag, data.dOmega, data.N, '#ff8c42', '#ff8c42',
               { overlayH: SIG.showH, which: 'yf' });
  refreshSpectrumInfo();
}

function renderSigCompList() {
  if (!sigUi.list) return;
  sigUi.list.innerHTML = '';
  const typeNames = { sin: _t({tr: 'Sinüs', en: 'Sine'}), cos: _t({tr: 'Kosinüs', en: 'Cosine'}), square: _t({tr: 'Kare', en: 'Square'}), triangle: _t({tr: 'Üçgen', en: 'Triangle'}), gauss: _t({tr: 'Gauss', en: 'Gaussian'}), impulse: 'δ[n]', step: 'u[n]', custom: _t({tr: 'Çizim', en: 'Drawn'}) };
  SIG.components.forEach((c, idx) => {
    const div = document.createElement('div');
    div.className = 'sig-comp-item';
    const hue = (typeof c.hue === 'number') ? c.hue : 140;
    const col = hueLine(hue);
    const colBg = hueBg(hue, 0.18);
    div.style.borderLeftColor = col;
    const tn = typeNames[c.type] || c.type;
    let sym;
    if (c.type === 'impulse' || c.type === 'step') {
      sym = `${tn} · A=${c.A.toFixed(2)}`;
    } else if (c.periodic || c.type === 'sin' || c.type === 'cos') {
      sym = `${tn}·per · A=${c.A.toFixed(1)} · ω₀=${(c.omega0||0).toFixed(2)} · φ=${(c.ph||0).toFixed(2)}`;
    } else {
      sym = `${tn}·ap · A=${c.A.toFixed(1)} · W=${(c.width||0).toFixed(0)} örn`;
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

/* Çizim modalı */
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
  ctx.fillStyle = C.labelDim;
  ctx.font = '10px "Fira Code", monospace';
  ctx.fillText('+A', 4, 12);
  ctx.fillText(' 0', 4, y0 + 4);
  ctx.fillText('−A', 4, size.h - 4);
  ctx.fillText('−W/2', 28, size.h - 4);
  ctx.fillText('+W/2', size.w - 40, size.h - 4);

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
  let peak = 0;
  for (let i = 0; i < DRAW.N; i++) {
    const a = Math.abs(DRAW.data[i]);
    if (a > peak) peak = a;
  }
  if (peak > 1e-6) {
    for (let i = 0; i < DRAW.N; i++) DRAW.data[i] /= peak;
  }
  DRAW.hasData = true;
  if (sigUi.drawStatus) { sigUi.drawStatus.textContent = '✓ Drawing ready — "Bileşen Ekle" ile uygula'; sigUi.drawStatus.style.color = '#39ff85'; }
  closeDrawModal();
};

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
  const isImpStep = (t === 'impulse' || t === 'step');
  const periodicChecked = isPerOnly ? true : !!(sigUi.periodic && sigUi.periodic.checked);

  let A, W, w0, ph;
  if (isImpStep) {
    A = parseFloat(sigUi.A_ap && sigUi.A_ap.value ? sigUi.A_ap.value : sigUi.A.value);
    if (isNaN(A) || A === 0) A = parseFloat(sigUi.A.value);
    W = 0; w0 = 0; ph = 0;
  } else if (isPerOnly || periodicChecked) {
    A  = parseFloat(sigUi.A.value);
    w0 = parseFloat(sigUi.F.value);
    ph = parseFloat(sigUi.P.value);
    W  = Math.max(4, Math.round(2 * Math.PI / Math.max(0.05, w0)));
  } else {
    A  = parseFloat(sigUi.A_ap.value);
    W  = parseFloat(sigUi.W_ap.value);
    w0 = 0.3; ph = 0;
  }

  const c = {
    type: t,
    A: isNaN(A) ? 1 : A,
    omega0: isNaN(w0) ? 0.3 : w0,
    ph: isNaN(ph) ? 0 : ph,
    width: isNaN(W) ? 30 : W,
    periodic: periodicChecked,
    hue: randomCompHue(),
  };
  if (t === 'custom') {
    if (!DRAW.hasData) {
      alert('First "El ile Çiz" butonu ile bir şekil çiz.');
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

// Spektrum canvas'ları için tıkla-tut tooltip
if (sigUi.cvXf) sigUi.cvXf.addEventListener('mousedown', e => freqTTUpdate(e, 'xf', sigUi.cvXf));
if (sigUi.cvYf) sigUi.cvYf.addEventListener('mousedown', e => freqTTUpdate(e, 'yf', sigUi.cvYf));

if (sigUi.A) sigUi.A.addEventListener('input', () => sigUi.Aval.textContent = parseFloat(sigUi.A.value).toFixed(1));
if (sigUi.F) sigUi.F.addEventListener('input', () => sigUi.Fval.textContent = parseFloat(sigUi.F.value).toFixed(2));
if (sigUi.P) sigUi.P.addEventListener('input', () => sigUi.Pval.textContent = parseFloat(sigUi.P.value).toFixed(2));
if (sigUi.type) sigUi.type.addEventListener('change', updateSigTypeUI);
if (sigUi.periodic) sigUi.periodic.addEventListener('change', updateSigTypeUI);

function refreshSpectrumInfo() {
  const dOmega = (2 * Math.PI / SIG.N);
  if (sigUi.domega) sigUi.domega.textContent = dOmega.toFixed(4);
  if (sigUi.Ninfo) sigUi.Ninfo.textContent = SIG.N;
}
if (sigUi.N) sigUi.N.addEventListener('input', () => {
  SIG.N = parseInt(sigUi.N.value);
  sigUi.Nval.textContent = SIG.N;
  drawSignalPanel();
  refreshSpectrumInfo();
});
if (sigUi.Nplot) sigUi.Nplot.addEventListener('input', () => {
  SIG.plotNmax = parseInt(sigUi.Nplot.value);
  sigUi.NplotVal.textContent = SIG.plotNmax;
  drawSignalPanel();
});
if (sigUi.omegaMax) sigUi.omegaMax.addEventListener('input', () => {
  const fr = parseFloat(sigUi.omegaMax.value);
  SIG.plotOmegaMax = fr * Math.PI;
  sigUi.omegaMaxVal.textContent = fr.toFixed(2) + 'π';
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
if (sigUi.specCap) sigUi.specCap.addEventListener('input', () => {
  const v = parseFloat(sigUi.specCap.value);
  // 5'in üstündeki konum = sınırsız
  SIG.specCap = (v >= 5.0) ? Infinity : v;
  if (sigUi.specCapVal) sigUi.specCapVal.textContent = isFinite(SIG.specCap) ? SIG.specCap.toFixed(2) : '∞';
  drawSignalPanel();
});
if (sigUi.yZoom) sigUi.yZoom.addEventListener('input', () => {
  SIG.yZoom = parseFloat(sigUi.yZoom.value);
  if (sigUi.yZoomVal) sigUi.yZoomVal.textContent = SIG.yZoom.toFixed(1) + '×';
  drawSignalPanel();
});
if (sigUi.overlayX) sigUi.overlayX.addEventListener('change', () => {
  SIG.overlayX = sigUi.overlayX.checked;
  drawSignalPanel();
});

function updateSignalPanel() {
  renderSigCompList();
  drawSignalPanel();
  refreshSpectrumInfo();
}

/* =========================================================
   YENILEME
   ========================================================= */
function updateAll() {
  computeImpulse();
  if (ui.hNcount) ui.hNcount.textContent = STATE.hLen;
  renderList();
  draw2D();
  draw3D();
  drawFreqResponse();
  drawImpulse();
  updateOmegaDisplay();
  drawSignalPanel();
}
window.addEventListener('resize', () => updateAll());
window.onThemeChange = () => updateAll();

/* =========================================================
   ARKAPLAN (basit nokta animasyonu)
   ========================================================= */
(function () {
  const c = document.getElementById('bgCanvas');
  if (!c) return;
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

/* =========================================================
   y[n] tıklama ile ölçüm — N0, f0, ω0
   ========================================================= */
if (sigUi.cvYt) {
  sigUi.cvYt.style.cursor = 'crosshair';
  sigUi.cvYt.addEventListener('click', (e) => {
    const r = sigUi.cvYt.getBoundingClientRect();
    const px = e.clientX - r.left;
    const Nplot = YT_GEOM.Nplot || SIG.plotNmax;
    const padL = YT_GEOM.padL || 42;
    const plotW = YT_GEOM.plotW || (r.width - padL - 4);
    if (px < padL) return;
    const n = Math.round(((px - padL) / Math.max(1, plotW)) * (Nplot - 1));
    if (n < 0 || n >= Nplot) return;
    // Mevcut bir markere yakınsa kaldır
    const hitIdx = YT_MARKERS.findIndex(m => Math.abs(m.n - n) <= 1);
    if (hitIdx >= 0) {
      YT_MARKERS.splice(hitIdx, 1);
    } else {
      YT_MARKERS.push({ n });
      // En fazla iki marker tut → eski olanı bırak (kayar pencere)
      while (YT_MARKERS.length > 2) YT_MARKERS.shift();
    }
    drawSignalPanel();
  });
}

/* =========================================================
   BAŞLAT
   ========================================================= */
SIG.components = [
  { type: 'sin', A: 1.0, omega0: 0.3,  ph: 0, width: 21, periodic: true, hue: randomCompHue() },
  { type: 'sin', A: 0.7, omega0: 1.5,  ph: 0, width: 5,  periodic: true, hue: randomCompHue() },
];

// Varsayılan filtre: LP 1.derece
loadPreset('lp1');
updateSigTypeUI();
