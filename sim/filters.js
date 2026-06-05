/* ============================================
   FILTRELER — Analog ve Sayısal Süzgeç Tasarımı
   Filters — Analog & Digital Filter Designer
   ============================================
   Pipeline (textbook IIR design flow):
     1. normalized analog low-pass prototype (Butterworth / Chebyshev I / II)
     2. LP→{LP,HP,BP,BS} frequency transform in the s-domain
     3. analog mode  → display H(jΩ), s-plane poles/zeros
        digital mode → bilinear transform (pre-warped) → H(e^{jω}), z-plane
     4. FIR family (digital): windowed-sinc design
     5. live demo: noisy two-tone signal filtered by the realized filter
   The math in this file is validated against the −3 dB Butterworth point,
   Chebyshev ripple/attenuation, BP/BS edges, bilinear pre-warping and
   FIR window stopband levels.
   All user-facing strings use _t({tr, en}) so both languages render.
*/

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
const PI = Math.PI, TWO_PI = 2 * PI;

// ── Complex helpers ──
const C = (re, im = 0) => ({ re, im });
const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const csub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im || 1e-30; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
const cabs = (a) => Math.hypot(a.re, a.im);
const cscale = (a, s) => ({ re: a.re * s, im: a.im * s });
const cinv = (a) => cdiv(C(1, 0), a);
const cexp = (a) => { const e = Math.exp(a.re); return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) }; };
const csqrt = (a) => { const r = Math.hypot(a.re, a.im); let re = Math.sqrt(Math.max(0, (r + a.re) / 2)); let im = Math.sqrt(Math.max(0, (r - a.re) / 2)); if (a.im < 0) im = -im; return { re, im }; };
// roots of s^2 + B s + Cc = 0
function quad(B, Cc) { const disc = csqrt(csub(cmul(B, B), cscale(Cc, 4))); const nB = cscale(B, -1); return [cscale(cadd(nB, disc), 0.5), cscale(csub(nB, disc), 0.5)]; }

// ── Canvas ──
const cvMag = document.getElementById('cvMag');
const cvPhase = document.getElementById('cvPhase');
const cvPZ = document.getElementById('cvPZ');
const cvImpulse = document.getElementById('cvImpulse');
const cvLiveTime = document.getElementById('cvLiveTime');
const cvLiveSpec = document.getElementById('cvLiveSpec');

// ── UI ──
const ui = {
  domain: document.getElementById('domain'),
  ftype: document.getElementById('ftype'),
  family: document.getElementById('family'),
  orderSlider: document.getElementById('orderSlider'),
  orderVal: document.getElementById('orderVal'),
  fsSlider: document.getElementById('fsSlider'),
  fsVal: document.getElementById('fsVal'),
  fcGroup: document.getElementById('fcGroup'),
  fcSlider: document.getElementById('fcSlider'),
  fcVal: document.getElementById('fcVal'),
  bandGroup: document.getElementById('bandGroup'),
  f1Slider: document.getElementById('f1Slider'),
  f1Val: document.getElementById('f1Val'),
  f2Slider: document.getElementById('f2Slider'),
  f2Val: document.getElementById('f2Val'),
  rpGroup: document.getElementById('rpGroup'),
  rpSlider: document.getElementById('rpSlider'),
  rpVal: document.getElementById('rpVal'),
  rsGroup: document.getElementById('rsGroup'),
  rsSlider: document.getElementById('rsSlider'),
  rsVal: document.getElementById('rsVal'),
  winGroup: document.getElementById('winGroup'),
  window: document.getElementById('window'),
  phaseMode: document.getElementById('phaseMode'),
  noiseSlider: document.getElementById('noiseSlider'),
  noiseVal: document.getElementById('noiseVal'),
  gridAlpha: document.getElementById('gridAlpha'),
  gridAlphaVal: document.getElementById('gridAlphaVal'),
  familyFir: document.getElementById('familyFir'),
  designRO: document.getElementById('designRO'),
  liveRO: document.getElementById('liveRO'),
  pzTitle: document.getElementById('pzTitle'),
  phaseTitle: document.getElementById('phaseTitle'),
  impTitle: document.getElementById('impTitle'),
};

// ── State ──
let domain = 'digital';   // 'digital' | 'analog'
let ftype = 'lp';         // lp hp bp bs
let family = 'butter';    // butter cheby1 cheby2 fir
let order = 4;
let fs = 100;             // Hz (sampling rate / live demo)
let fc = 12;              // Hz (lp/hp cutoff)
let f1 = 12, f2 = 30;     // Hz (bp/bs band edges)
let Rp = 1;               // dB passband ripple (cheby1)
let Rs = 40;              // dB stopband attenuation (cheby2)
let winType = 'hamming';
let phaseMode = 'phase';  // 'phase' | 'group'
let noiseLevel = 0.25;
let gridAlpha = 0.16;

const NF = 600;           // frequency-response resolution
const LIVE_N = 512;       // live demo length (power of two)

// fixed unit-variance noise buffer (so the noise slider only scales amplitude)
const noiseBuf = new Float64Array(LIVE_N);
(function () { for (let i = 0; i < LIVE_N; i += 2) { const u1 = Math.random() || 1e-9, u2 = Math.random(); const r = Math.sqrt(-2 * Math.log(u1)); noiseBuf[i] = r * Math.cos(TWO_PI * u2); if (i + 1 < LIVE_N) noiseBuf[i + 1] = r * Math.sin(TWO_PI * u2); } })();

// ── Theme colors ──
function cssVar(n, f) { const v = getComputedStyle(document.body).getPropertyValue(n).trim(); return v || f; }
let COL = {};
function refreshColors() {
  COL = {
    mag: cssVar('--color-h', '#ff8c42'),
    pha: cssVar('--color-y', '#7b8cff'),
    in: cssVar('--color-x', '#39ff85'),
    out: cssVar('--color-h', '#ff8c42'),
    mark: cssVar('--color-marker', '#ff4f9a'),
    pole: '#ff4f9a',
    zero: '#5ec8ff',
    ref: '#ffd166',
  };
}

// ============================================
// PROTOTYPE  (normalized analog LP, Ωc = 1)
// ============================================
function protoLP() {
  const N = order, poles = [], zeros = [];
  if (family === 'butter') {
    for (let k = 0; k < N; k++) { const th = PI * (2 * k + 1) / (2 * N) + PI / 2; poles.push(C(Math.cos(th), Math.sin(th))); }
  } else if (family === 'cheby1') {
    const eps = Math.max(1e-6, Math.sqrt(Math.pow(10, Rp / 10) - 1));
    const mu = Math.asinh(1 / eps) / N;
    for (let k = 0; k < N; k++) { const th = PI * (2 * k + 1) / (2 * N); poles.push(C(-Math.sinh(mu) * Math.sin(th), Math.cosh(mu) * Math.cos(th))); }
  } else if (family === 'cheby2') {
    const eps = 1 / Math.max(1e-6, Math.sqrt(Math.pow(10, Rs / 10) - 1));
    const mu = Math.asinh(1 / eps) / N;
    for (let k = 0; k < N; k++) {
      const th = PI * (2 * k + 1) / (2 * N);
      poles.push(cinv(C(-Math.sinh(mu) * Math.sin(th), Math.cosh(mu) * Math.cos(th))));
      const ct = Math.cos(th);
      if (Math.abs(ct) > 1e-8) zeros.push(C(0, 1 / ct));
    }
  }
  return { poles, zeros };
}

// LP→{LP,HP,BP,BS} transform in the s-domain (analog frequencies in rad/s)
function transformS(proto, wc, w1, w2) {
  const P = proto.poles, Z = proto.zeros, N = P.length, M = Z.length;
  let poles = [], zeros = [];
  if (ftype === 'lp') {
    poles = P.map(p => cscale(p, wc)); zeros = Z.map(z => cscale(z, wc));
  } else if (ftype === 'hp') {
    poles = P.map(p => cdiv(C(wc, 0), p)); zeros = Z.map(z => cdiv(C(wc, 0), z));
    for (let i = 0; i < N - M; i++) zeros.push(C(0, 0));
  } else if (ftype === 'bp') {
    const w0 = Math.sqrt(w1 * w2), bw = w2 - w1;
    for (const p of P) poles.push(...quad(cscale(p, -bw), C(w0 * w0, 0)));
    for (const z of Z) zeros.push(...quad(cscale(z, -bw), C(w0 * w0, 0)));
    for (let i = 0; i < N - M; i++) zeros.push(C(0, 0));
  } else { // bs
    const w0 = Math.sqrt(w1 * w2), bw = w2 - w1;
    for (const p of P) poles.push(...quad(cscale(cinv(p), -bw), C(w0 * w0, 0)));
    for (const z of Z) zeros.push(...quad(cscale(cinv(z), -bw), C(w0 * w0, 0)));
    for (let i = 0; i < N - M; i++) { zeros.push(C(0, w0)); zeros.push(C(0, -w0)); }
  }
  return { poles, zeros };
}

function bilinear(an, sampleRate) {
  const k = 2 * sampleRate;
  const poles = an.poles.map(s => cdiv(C(k + s.re, s.im), C(k - s.re, -s.im)));
  const zeros = an.zeros.map(s => cdiv(C(k + s.re, s.im), C(k - s.re, -s.im)));
  const nz = an.poles.length - an.zeros.length;
  for (let i = 0; i < nz; i++) zeros.push(C(-1, 0));
  return { poles, zeros };
}

const warp = (f, sr) => 2 * sr * Math.tan(PI * f / sr);

// expand polynomial from roots → real coefficients (highest power first)
function polyFromRoots(roots) {
  let coeffs = [C(1, 0)];
  for (const r of roots) {
    const next = new Array(coeffs.length + 1).fill(0).map(() => C(0, 0));
    for (let i = 0; i < coeffs.length; i++) {
      next[i] = cadd(next[i], coeffs[i]);
      next[i + 1] = csub(next[i + 1], cmul(coeffs[i], r));
    }
    coeffs = next;
  }
  return coeffs.map(c => c.re);
}

// FIR windowed-sinc design → taps h[]
function windowVal(n, M, type) {
  if (M === 0) return 1;
  const x = TWO_PI * n / M;
  if (type === 'hann') return 0.5 - 0.5 * Math.cos(x);
  if (type === 'hamming') return 0.54 - 0.46 * Math.cos(x);
  if (type === 'blackman') return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  return 1; // rectangular
}
function firLPtaps(fcHz, M) {
  const wc = TWO_PI * fcHz / fs, c = M / 2, h = new Float64Array(M + 1);
  for (let n = 0; n <= M; n++) { const k = n - c; h[n] = (Math.abs(k) < 1e-9 ? wc / PI : Math.sin(wc * k) / (PI * k)) * windowVal(n, M, winType); }
  return h;
}
function designFIR() {
  const M = order, c = M / 2;
  let h;
  if (ftype === 'lp') h = firLPtaps(fc, M);
  else if (ftype === 'hp') { const lp = firLPtaps(fc, M); h = new Float64Array(M + 1); for (let n = 0; n <= M; n++) h[n] = (Math.abs(n - c) < 1e-9 ? 1 : 0) - lp[n]; }
  else if (ftype === 'bp') { const a = firLPtaps(f1, M), b = firLPtaps(f2, M); h = new Float64Array(M + 1); for (let n = 0; n <= M; n++) h[n] = b[n] - a[n]; }
  else { const a = firLPtaps(f1, M), b = firLPtaps(f2, M); h = new Float64Array(M + 1); for (let n = 0; n <= M; n++) h[n] = (Math.abs(n - c) < 1e-9 ? 1 : 0) - (b[n] - a[n]); }
  return h;
}

// ============================================
// BUILD DESIGN  → {disp, live}
// disp: what is plotted (analog or digital)
// live: discrete realization used by the filtering demo ({b,a} or {h})
// ============================================
let D = null;

function hFromPZ(pz, x, gain) {
  let num = C(1, 0), den = C(1, 0);
  for (const z of pz.zeros) num = cmul(num, csub(x, z));
  for (const p of pz.poles) den = cmul(den, csub(x, p));
  return cscale(cdiv(num, den), gain);
}
function firH(h, w) { let re = 0, im = 0; for (let n = 0; n < h.length; n++) { re += h[n] * Math.cos(w * n); im -= h[n] * Math.sin(w * n); } return C(re, im); }

function build() {
  const disp = {}; let live = {};
  if (family === 'fir') {
    const h = designFIR();
    disp.kind = 'fir'; disp.h = h;
    live = { h };
  } else {
    // analog s-domain design
    const proto = protoLP();
    let an;
    if (ftype === 'lp') an = transformS(proto, domain === 'digital' ? warp(fc, fs) : TWO_PI * fc);
    else if (ftype === 'hp') an = transformS(proto, domain === 'digital' ? warp(fc, fs) : TWO_PI * fc);
    else an = transformS(proto, 0, domain === 'digital' ? warp(f1, fs) : TWO_PI * f1, domain === 'digital' ? warp(f2, fs) : TWO_PI * f2);

    if (domain === 'analog') {
      // normalize displayed peak over [0, fs/2]
      let pk = 1e-30;
      for (let k = 0; k <= NF; k++) { const W = TWO_PI * (fs / 2) * k / NF; pk = Math.max(pk, cabs(hFromPZ(an, C(0, W), 1))); }
      disp.kind = 'analog'; disp.poles = an.poles; disp.zeros = an.zeros; disp.gain = 1 / pk;
      // live demo needs a discrete realization → bilinear-transform the same design at fs
      const anLive = (ftype === 'bp' || ftype === 'bs')
        ? transformS(proto, 0, warp(f1, fs), warp(f2, fs))
        : transformS(proto, warp(fc, fs));
      live = pzToBA(bilinear(anLive, fs));
    } else {
      const dz = bilinear(an, fs);
      let pk = 1e-30;
      for (let k = 0; k <= NF; k++) { const w = PI * k / NF; pk = Math.max(pk, cabs(hFromPZ(dz, C(Math.cos(w), Math.sin(w)), 1))); }
      disp.kind = 'digital'; disp.poles = dz.poles; disp.zeros = dz.zeros; disp.gain = 1 / pk;
      live = pzToBA(dz);
    }
  }
  D = { disp, live };
}

function pzToBA(dz) {
  const a = polyFromRoots(dz.poles);
  let b = polyFromRoots(dz.zeros);
  // normalize peak |H(e^{jw})| = 1
  let pk = 1e-30;
  for (let k = 0; k <= 256; k++) {
    const w = PI * k / 256;
    let nu = C(0, 0), de = C(0, 0);
    for (let i = 0; i < b.length; i++) { const ang = -w * i; nu = cadd(nu, cscale(C(Math.cos(ang), Math.sin(ang)), b[i])); }
    for (let i = 0; i < a.length; i++) { const ang = -w * i; de = cadd(de, cscale(C(Math.cos(ang), Math.sin(ang)), a[i])); }
    pk = Math.max(pk, cabs(cdiv(nu, de)));
  }
  const g = 1 / pk;
  return { b: b.map(v => v * g), a };
}

// ============================================
// RESPONSES
// ============================================
function magPhaseGrid() {
  const f = new Float64Array(NF), mag = new Float64Array(NF), pha = new Float64Array(NF);
  for (let k = 0; k < NF; k++) {
    const fr = (fs / 2) * k / (NF - 1);
    f[k] = fr;
    let H;
    if (D.disp.kind === 'fir') H = firH(D.disp.h, TWO_PI * fr / fs);
    else if (D.disp.kind === 'analog') H = hFromPZ(D.disp, C(0, TWO_PI * fr), D.disp.gain);
    else H = hFromPZ(D.disp, C(Math.cos(TWO_PI * fr / fs), Math.sin(TWO_PI * fr / fs)), D.disp.gain);
    mag[k] = cabs(H); pha[k] = Math.atan2(H.im, H.re);
  }
  return { f, mag, pha };
}

// group delay from unwrapped phase: gd = -dφ/dω
function groupDelay(grid) {
  const N = grid.f.length, gd = new Float64Array(N);
  const ph = new Float64Array(N); let acc = grid.pha[0]; ph[0] = acc; let prev = grid.pha[0];
  for (let k = 1; k < N; k++) { let d = grid.pha[k] - prev; while (d > PI) d -= TWO_PI; while (d < -PI) d += TWO_PI; acc += d; ph[k] = acc; prev = grid.pha[k]; }
  const dw = (domain === 'analog' || D.disp.kind === 'analog')
    ? TWO_PI * (grid.f[1] - grid.f[0])           // rad/s  → delay in seconds
    : TWO_PI * (grid.f[1] - grid.f[0]) / fs;      // rad/sample → delay in samples
  for (let k = 1; k < N - 1; k++) gd[k] = -(ph[k + 1] - ph[k - 1]) / (2 * dw);
  gd[0] = gd[1]; gd[N - 1] = gd[N - 2];
  return gd;
}

// impulse response
function impulseResponse() {
  if (D.disp.kind === 'fir') {
    const h = D.disp.h, n = []; for (let i = 0; i < h.length; i++) n.push(i);
    return { kind: 'discrete', n, y: Array.from(h) };
  }
  if (D.disp.kind === 'digital') {
    const { b, a } = D.live; const L = 64, y = new Float64Array(L), x = new Float64Array(L); x[0] = 1;
    for (let nn = 0; nn < L; nn++) {
      let acc = 0; for (let i = 0; i < b.length; i++) if (nn - i >= 0) acc += b[i] * x[nn - i];
      for (let j = 1; j < a.length; j++) if (nn - j >= 0) acc -= a[j] * y[nn - j];
      y[nn] = acc / a[0];
    }
    const n = []; for (let i = 0; i < L; i++) n.push(i);
    return { kind: 'discrete', n, y: Array.from(y) };
  }
  // analog: residues h(t) = Σ Re(r_k e^{p_k t}), distinct poles
  const P = D.disp.poles, Z = D.disp.zeros, g = D.disp.gain;
  const res = P.map((pk, k) => {
    let num = C(g, 0); for (const z of Z) num = cmul(num, csub(pk, z));
    let den = C(1, 0); for (let m = 0; m < P.length; m++) if (m !== k) den = cmul(den, csub(pk, P[m]));
    return cdiv(num, den);
  });
  const Tmax = 8 / (fs / 2 * 0.12 + 1e-6);   // heuristic time span
  const span = Math.min(Tmax, 4 / Math.max(0.05, Math.min(...P.map(p => Math.abs(p.re)))));
  const L = 400, t = new Float64Array(L), y = new Float64Array(L);
  for (let i = 0; i < L; i++) {
    const tt = span * i / (L - 1); t[i] = tt; let s = 0;
    for (let k = 0; k < P.length; k++) { const e = cexp(cscale(P[k], tt)); s += res[k].re * e.re - res[k].im * e.im; }
    y[i] = s;
  }
  return { kind: 'cont', t, y, span };
}

// FFT (iterative radix-2, in place)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TWO_PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = ncwr;
      }
    }
  }
}

// type-aware demo tones: one in the passband, one in the stopband
function demoTones() {
  const ny = fs / 2;
  let pass, stop;
  if (ftype === 'lp') { pass = fc * 0.45; stop = Math.min(fc * 2.2, ny * 0.92); }
  else if (ftype === 'hp') { pass = Math.min(fc * 2.0, ny * 0.92); stop = fc * 0.45; }
  else if (ftype === 'bp') { pass = Math.sqrt(f1 * f2); stop = Math.min(f2 * 1.8, ny * 0.92); }
  else { pass = Math.max(f1 * 0.4, ny * 0.05); stop = Math.sqrt(f1 * f2); }
  return { pass: Math.max(0.5, pass), stop: Math.max(0.5, stop) };
}

function applyFilter(x) {
  const y = new Float64Array(x.length);
  if (D.live.h) {
    const h = D.live.h;
    for (let n = 0; n < x.length; n++) { let acc = 0; for (let i = 0; i < h.length; i++) if (n - i >= 0) acc += h[i] * x[n - i]; y[n] = acc; }
  } else {
    const { b, a } = D.live;
    for (let n = 0; n < x.length; n++) {
      let acc = 0; for (let i = 0; i < b.length; i++) if (n - i >= 0) acc += b[i] * x[n - i];
      for (let j = 1; j < a.length; j++) if (n - j >= 0) acc -= a[j] * y[n - j];
      y[n] = acc / a[0];
    }
  }
  return y;
}

let liveCache = null;
function computeLive() {
  const { pass, stop } = demoTones();
  const x = new Float64Array(LIVE_N);
  for (let n = 0; n < LIVE_N; n++) {
    x[n] = Math.sin(TWO_PI * pass * n / fs) + 0.9 * Math.sin(TWO_PI * stop * n / fs) + noiseLevel * noiseBuf[n];
  }
  const y = applyFilter(x);
  liveCache = { x, y, pass, stop };
  return liveCache;
}

// ============================================
// DRAW HELPERS
// ============================================
function prep(cv) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height, ctx };
}
function grid(ctx, w, h, xMin, xMax, yMin, yMax, nx, ny) {
  ctx.strokeStyle = `rgba(100,160,255,${gridAlpha})`; ctx.lineWidth = 0.7;
  for (let i = 0; i <= nx; i++) { const x = w * i / nx; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let i = 0; i <= ny; i++) { const y = h * i / ny; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}
function curve(ctx, w, h, xMin, xMax, yMin, yMax, xa, ya, color, lw, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = lw || 1.9; if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
  ctx.beginPath(); let st = false;
  for (let i = 0; i < xa.length; i++) {
    const yv = ya[i]; if (!isFinite(yv)) { st = false; continue; }
    const x = ((xa[i] - xMin) / (xMax - xMin)) * w, y = h - ((yv - yMin) / (yMax - yMin)) * h;
    if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.setLineDash([]);
}
function fillUnder(ctx, w, h, xMin, xMax, yMin, yMax, xa, ya, color) {
  ctx.fillStyle = color; ctx.beginPath(); let st = false;
  for (let i = 0; i < xa.length; i++) {
    const x = ((xa[i] - xMin) / (xMax - xMin)) * w, y = h - ((ya[i] - yMin) / (yMax - yMin)) * h;
    if (!st) { ctx.moveTo(x, h); ctx.lineTo(x, y); st = true; } else ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
}
function axisLabels(ctx, w, h, xMin, xMax, yMin, yMax, xunit, yunit) {
  ctx.fillStyle = 'rgba(180,190,220,0.6)'; ctx.font = '9px Consolas, monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) { const fr = xMin + (xMax - xMin) * i / 5; ctx.fillText(fr.toFixed(fr < 10 ? 1 : 0), w * i / 5, h - 2); }
  ctx.textAlign = 'left';
  ctx.fillText(yMax.toFixed(0) + (yunit || ''), 3, 9);
  ctx.fillText(yMin.toFixed(0) + (yunit || ''), 3, h - 11);
  ctx.textAlign = 'right'; ctx.fillText(xunit || '', w - 3, 9);
}
function vline(ctx, w, h, xMin, xMax, xv, color, label) {
  if (xv < xMin || xv > xMax) return;
  const x = ((xv - xMin) / (xMax - xMin)) * w;
  ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.setLineDash([]);
  if (label) { ctx.fillStyle = color; ctx.font = '9px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText(label, x, 10); }
}

// ============================================
// RENDER
// ============================================
let grid_, gd_;

function renderMag() {
  const s = prep(cvMag); s.ctx.clearRect(0, 0, s.w, s.h);
  const xMin = 0, xMax = fs / 2, yMin = -80, yMax = 6;
  grid(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, 6, 8);
  // passband/stopband shading
  const ny = fs / 2;
  s.ctx.fillStyle = 'rgba(57,255,133,0.05)';
  if (ftype === 'lp') s.ctx.fillRect(0, 0, (fc / ny) * s.w, s.h);
  else if (ftype === 'hp') s.ctx.fillRect((fc / ny) * s.w, 0, s.w, s.h);
  else if (ftype === 'bp') s.ctx.fillRect((f1 / ny) * s.w, 0, ((f2 - f1) / ny) * s.w, s.h);
  // -3 dB line
  const y3 = s.h - ((-3.01 - yMin) / (yMax - yMin)) * s.h;
  s.ctx.strokeStyle = 'rgba(255,209,102,0.4)'; s.ctx.lineWidth = 0.9; s.ctx.setLineDash([6, 4]);
  s.ctx.beginPath(); s.ctx.moveTo(0, y3); s.ctx.lineTo(s.w, y3); s.ctx.stroke(); s.ctx.setLineDash([]);
  s.ctx.fillStyle = 'rgba(255,209,102,0.7)'; s.ctx.font = '9px Consolas, monospace'; s.ctx.textAlign = 'left'; s.ctx.fillText('-3 dB', 4, y3 - 3);

  const db = new Float64Array(NF);
  for (let k = 0; k < NF; k++) db[k] = grid_.mag[k] > 1e-6 ? 20 * Math.log10(grid_.mag[k]) : -120;
  curve(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, grid_.f, db, COL.mag, 2.1);
  axisLabels(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, 'Hz', '');
  // cutoff markers
  if (ftype === 'lp' || ftype === 'hp') vline(s.ctx, s.w, s.h, xMin, xMax, fc, 'rgba(255,79,154,0.5)', 'fc');
  else { vline(s.ctx, s.w, s.h, xMin, xMax, f1, 'rgba(255,79,154,0.5)', 'f1'); vline(s.ctx, s.w, s.h, xMin, xMax, f2, 'rgba(255,79,154,0.5)', 'f2'); }
}

function renderPhase() {
  const s = prep(cvPhase); s.ctx.clearRect(0, 0, s.w, s.h);
  const xMin = 0, xMax = fs / 2;
  if (phaseMode === 'group') {
    let mx = 1e-9; for (let k = 1; k < NF - 1; k++) mx = Math.max(mx, gd_[k]);
    const yMin = 0, yMax = mx * 1.2 + 1e-6;
    grid(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, 6, 6);
    curve(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, grid_.f, gd_, COL.pha, 1.9);
    axisLabels(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, 'Hz', '');
    s.ctx.fillStyle = 'rgba(180,190,220,0.6)'; s.ctx.font = '9px Consolas, monospace'; s.ctx.textAlign = 'left';
    s.ctx.fillText((domain === 'analog' || D.disp.kind === 'analog') ? 's' : _t({ tr: 'örnek', en: 'samp' }), 3, 20);
  } else {
    const yMin = -PI - 0.2, yMax = PI + 0.2;
    grid(s.ctx, s.w, s.h, xMin, xMax, yMin, yMax, 6, 6);
    s.ctx.strokeStyle = 'rgba(123,140,255,0.22)'; s.ctx.lineWidth = 0.8;
    const ym = s.h / 2; s.ctx.beginPath(); s.ctx.moveTo(0, ym); s.ctx.lineTo(s.w, ym); s.ctx.stroke();
    // split at wrap discontinuities
    let seg = []; const segs = [seg];
    for (let k = 0; k < NF; k++) { if (k > 0 && Math.abs(grid_.pha[k] - grid_.pha[k - 1]) > PI) { seg = []; segs.push(seg); } seg.push(k); }
    s.ctx.strokeStyle = COL.pha; s.ctx.lineWidth = 1.9;
    for (const sg of segs) { s.ctx.beginPath(); for (let i = 0; i < sg.length; i++) { const k = sg[i]; const x = (grid_.f[k] / (fs / 2)) * s.w, y = s.h - ((grid_.pha[k] - yMin) / (yMax - yMin)) * s.h; i === 0 ? s.ctx.moveTo(x, y) : s.ctx.lineTo(x, y); } s.ctx.stroke(); }
    axisLabels(s.ctx, s.w, s.h, xMin, xMax, -3, 3, 'Hz', '');
  }
}

function renderPZ() {
  const s = prep(cvPZ); s.ctx.clearRect(0, 0, s.w, s.h);
  const W = s.w, H = s.h, cx = W / 2, cy = H / 2;
  const isZ = (D.disp.kind === 'digital' || D.disp.kind === 'fir');
  let poles = [], zeros = [];
  if (D.disp.kind === 'fir') {
    poles = []; // all at origin
    zeros = firZeros(D.disp.h);
  } else { poles = D.disp.poles; zeros = D.disp.zeros; }

  // scale
  let R = 1.2;
  if (!isZ) { for (const p of poles) R = Math.max(R, cabs(p) * 1.25); for (const z of zeros) R = Math.max(R, cabs(z) * 1.25); }
  const sc = Math.min(W, H) * 0.42 / R;

  // axes
  s.ctx.strokeStyle = 'rgba(100,140,255,0.3)'; s.ctx.lineWidth = 1;
  s.ctx.beginPath(); s.ctx.moveTo(0, cy); s.ctx.lineTo(W, cy); s.ctx.stroke();
  s.ctx.beginPath(); s.ctx.moveTo(cx, 0); s.ctx.lineTo(cx, H); s.ctx.stroke();
  s.ctx.fillStyle = 'rgba(180,190,220,0.6)'; s.ctx.font = '9px Consolas, monospace';
  s.ctx.textAlign = 'right'; s.ctx.fillText(isZ ? 'Re(z)' : 'σ', W - 3, cy - 4);
  s.ctx.textAlign = 'left'; s.ctx.fillText(isZ ? 'Im(z)' : 'jΩ', cx + 4, 10);

  if (isZ) {
    // unit circle + stability region
    s.ctx.strokeStyle = 'rgba(255,209,102,0.55)'; s.ctx.lineWidth = 1.3; s.ctx.setLineDash([5, 3]);
    s.ctx.beginPath(); s.ctx.arc(cx, cy, sc, 0, TWO_PI); s.ctx.stroke(); s.ctx.setLineDash([]);
  } else {
    // jΩ axis is the stability boundary; shade LHP
    s.ctx.fillStyle = 'rgba(57,255,133,0.04)'; s.ctx.fillRect(0, 0, cx, H);
  }

  const px = (z) => cx + z.re * sc, py = (z) => cy - z.im * sc;
  const finite = (z) => isFinite(z.re) && isFinite(z.im);
  // zeros ○
  s.ctx.strokeStyle = COL.zero; s.ctx.lineWidth = 1.8;
  for (const z of zeros) { if (!finite(z)) continue; const x = px(z), y = py(z); s.ctx.beginPath(); s.ctx.arc(x, y, 5, 0, TWO_PI); s.ctx.stroke(); }
  // poles ×
  s.ctx.strokeStyle = COL.pole; s.ctx.lineWidth = 2;
  for (const p of poles) { if (!finite(p)) continue; const x = px(p), y = py(p); s.ctx.beginPath(); s.ctx.moveTo(x - 5, y - 5); s.ctx.lineTo(x + 5, y + 5); s.ctx.moveTo(x + 5, y - 5); s.ctx.lineTo(x - 5, y + 5); s.ctx.stroke(); }
  if (D.disp.kind === 'fir') {
    const x = px(C(0, 0)), y = py(C(0, 0));
    s.ctx.strokeStyle = COL.pole; s.ctx.lineWidth = 2;
    s.ctx.beginPath(); s.ctx.moveTo(x - 5, y - 5); s.ctx.lineTo(x + 5, y + 5); s.ctx.moveTo(x + 5, y - 5); s.ctx.lineTo(x - 5, y + 5); s.ctx.stroke();
    s.ctx.fillStyle = 'rgba(180,190,220,0.7)'; s.ctx.font = '9px Consolas, monospace'; s.ctx.textAlign = 'left';
    s.ctx.fillText('×' + order + ' @ 0', x + 8, y - 6);
  }
  s.ctx.fillStyle = 'rgba(180,190,220,0.55)'; s.ctx.font = '9px Consolas, monospace'; s.ctx.textAlign = 'right';
  s.ctx.fillText('× ' + _t({ tr: 'kutup', en: 'pole' }) + '  ○ ' + _t({ tr: 'sıfır', en: 'zero' }), W - 4, H - 5);
}

// FIR zeros via Durand–Kerner (moderate orders only)
function firZeros(h) {
  const M = h.length - 1;
  if (M < 1 || M > 44) return [];
  // strip leading/trailing ~0 (none expected); coeffs highest power first = reverse of h? polynomial B(z)=Σ h[n] z^{-n}; zeros are roots of Σ h[n] z^{M-n} = 0
  const c = []; for (let i = 0; i <= M; i++) c.push(h[i]); // c[0] z^M + ... + c[M]
  if (Math.abs(c[0]) < 1e-12) return [];
  let roots = []; for (let i = 0; i < M; i++) { const ang = TWO_PI * i / M + 0.4; roots.push(C(0.9 * Math.cos(ang), 0.9 * Math.sin(ang))); }
  const evalP = (z) => { let r = C(c[0], 0); for (let i = 1; i <= M; i++) r = cadd(cmul(r, z), C(c[i], 0)); return r; };
  for (let it = 0; it < 80; it++) {
    let maxd = 0;
    for (let i = 0; i < M; i++) {
      let den = C(c[0], 0);
      for (let j = 0; j < M; j++) if (j !== i) den = cmul(den, csub(roots[i], roots[j]));
      const d = cdiv(evalP(roots[i]), den);
      roots[i] = csub(roots[i], d); maxd = Math.max(maxd, cabs(d));
    }
    if (maxd < 1e-9) break;
  }
  return roots;
}

function renderImpulse() {
  const s = prep(cvImpulse); s.ctx.clearRect(0, 0, s.w, s.h);
  const ir = impulseResponse();
  let mn = 0, mx = 0; for (const v of ir.y) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  if (mn === mx) { mn = -1; mx = 1; } const pad = (mx - mn) * 0.12; mn -= pad; mx += pad;
  grid(s.ctx, s.w, s.h, 0, 1, mn, mx, 6, 4);
  const y0 = s.h - ((0 - mn) / (mx - mn)) * s.h;
  s.ctx.strokeStyle = 'rgba(100,140,255,0.3)'; s.ctx.lineWidth = 1; s.ctx.beginPath(); s.ctx.moveTo(0, y0); s.ctx.lineTo(s.w, y0); s.ctx.stroke();
  if (ir.kind === 'discrete') {
    const N = ir.y.length;
    s.ctx.strokeStyle = COL.mag; s.ctx.fillStyle = COL.mag; s.ctx.lineWidth = 1.5;
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * s.w, y = s.h - ((ir.y[i] - mn) / (mx - mn)) * s.h;
      s.ctx.beginPath(); s.ctx.moveTo(x, y0); s.ctx.lineTo(x, y); s.ctx.stroke();
      s.ctx.beginPath(); s.ctx.arc(x, y, N > 80 ? 1.4 : 2.4, 0, TWO_PI); s.ctx.fill();
    }
    s.ctx.fillStyle = 'rgba(180,190,220,0.6)'; s.ctx.font = '9px Consolas, monospace'; s.ctx.textAlign = 'right'; s.ctx.fillText('n', s.w - 3, y0 - 3);
  } else {
    curve(s.ctx, s.w, s.h, 0, ir.span, mn, mx, ir.t, ir.y, COL.mag, 2.0);
    s.ctx.fillStyle = 'rgba(180,190,220,0.6)'; s.ctx.font = '9px Consolas, monospace'; s.ctx.textAlign = 'right'; s.ctx.fillText('t (s)', s.w - 3, y0 - 3);
  }
}

function renderLiveTime() {
  const s = prep(cvLiveTime); s.ctx.clearRect(0, 0, s.w, s.h);
  const L = liveCache.x, Y = liveCache.y, N = Math.min(256, LIVE_N);
  let mx = 1e-6; for (let i = 0; i < N; i++) { mx = Math.max(mx, Math.abs(L[i]), Math.abs(Y[i])); }
  const yMin = -mx * 1.1, yMax = mx * 1.1;
  grid(s.ctx, s.w, s.h, 0, 1, yMin, yMax, 8, 4);
  const xa = new Float64Array(N); for (let i = 0; i < N; i++) xa[i] = i / (N - 1);
  curve(s.ctx, s.w, s.h, 0, 1, yMin, yMax, xa, Array.from(L.slice(0, N)), 'rgba(120,150,200,0.55)', 1.2);
  curve(s.ctx, s.w, s.h, 0, 1, yMin, yMax, xa, Array.from(Y.slice(0, N)), COL.out, 2.0);
  s.ctx.fillStyle = 'rgba(180,190,220,0.65)'; s.ctx.font = '9px Consolas, monospace'; s.ctx.textAlign = 'left';
  s.ctx.fillText(_t({ tr: '— giriş (gürültülü)', en: '— input (noisy)' }), 6, 12);
  s.ctx.fillStyle = COL.out; s.ctx.fillText(_t({ tr: '— çıkış (süzülmüş)', en: '— output (filtered)' }), 6, 24);
}

function renderLiveSpec() {
  const s = prep(cvLiveSpec); s.ctx.clearRect(0, 0, s.w, s.h);
  const xr = liveCache.x.slice(), xi = new Float64Array(LIVE_N);
  const yr = liveCache.y.slice(), yi = new Float64Array(LIVE_N);
  // window to reduce leakage
  for (let n = 0; n < LIVE_N; n++) { const wv = 0.5 - 0.5 * Math.cos(TWO_PI * n / (LIVE_N - 1)); xr[n] *= wv; yr[n] *= wv; }
  fft(xr, xi); fft(yr, yi);
  const half = LIVE_N / 2;
  const Xs = new Float64Array(half), Ys = new Float64Array(half);
  let mx = 1e-9;
  for (let k = 0; k < half; k++) { Xs[k] = Math.hypot(xr[k], xi[k]); Ys[k] = Math.hypot(yr[k], yi[k]); mx = Math.max(mx, Xs[k]); }
  const toDb = (v) => v > mx * 1e-4 ? 20 * Math.log10(v / mx) : -80;
  const yMin = -70, yMax = 3;
  grid(s.ctx, s.w, s.h, 0, fs / 2, yMin, yMax, 6, 6);
  const f = new Float64Array(half); for (let k = 0; k < half; k++) f[k] = (fs / 2) * k / (half - 1);
  const xdb = new Float64Array(half), ydb = new Float64Array(half);
  for (let k = 0; k < half; k++) { xdb[k] = toDb(Xs[k]); ydb[k] = toDb(Ys[k]); }
  fillUnder(s.ctx, s.w, s.h, 0, fs / 2, yMin, yMax, f, xdb, 'rgba(120,150,200,0.12)');
  curve(s.ctx, s.w, s.h, 0, fs / 2, yMin, yMax, f, xdb, 'rgba(120,150,200,0.6)', 1.2);
  curve(s.ctx, s.w, s.h, 0, fs / 2, yMin, yMax, f, ydb, COL.out, 1.8);
  axisLabels(s.ctx, s.w, s.h, 0, fs / 2, yMin, yMax, 'Hz', '');
  vline(s.ctx, s.w, s.h, 0, fs / 2, liveCache.pass, 'rgba(57,255,133,0.5)', _t({ tr: 'geçen', en: 'pass' }));
  vline(s.ctx, s.w, s.h, 0, fs / 2, liveCache.stop, 'rgba(255,79,154,0.5)', _t({ tr: 'durdurulan', en: 'stop' }));
}

// ============================================
// READOUTS
// ============================================
function attenAt(fHz) {
  let H;
  if (D.disp.kind === 'fir') H = firH(D.disp.h, TWO_PI * fHz / fs);
  else if (D.disp.kind === 'analog') H = hFromPZ(D.disp, C(0, TWO_PI * fHz), D.disp.gain);
  else H = hFromPZ(D.disp, C(Math.cos(TWO_PI * fHz / fs), Math.sin(TWO_PI * fHz / fs)), D.disp.gain);
  const m = cabs(H);
  return m > 1e-6 ? 20 * Math.log10(m) : -120;
}
function famName() {
  return _t({
    butter: { tr: 'Butterworth', en: 'Butterworth' },
    cheby1: { tr: 'Chebyshev I', en: 'Chebyshev I' },
    cheby2: { tr: 'Chebyshev II', en: 'Chebyshev II' },
    fir: { tr: 'FIR (pencereli sinc)', en: 'FIR (windowed sinc)' },
  }[family]);
}
function typeName() {
  return _t({
    lp: { tr: 'alçak-geçiren', en: 'low-pass' },
    hp: { tr: 'yüksek-geçiren', en: 'high-pass' },
    bp: { tr: 'bant-geçiren', en: 'band-pass' },
    bs: { tr: 'bant-durduran', en: 'band-stop' },
  }[ftype]);
}
function updateReadouts() {
  const realization = family === 'fir' ? 'FIR' : (D.disp.kind === 'analog' ? _t({ tr: 'analog IIR', en: 'analog IIR' }) : 'IIR');
  const eff = (family !== 'fir' && (ftype === 'bp' || ftype === 'bs')) ? order * 2 : order;
  ui.designRO.textContent = realization + ' · ' + famName() + ' · ' + typeName() +
    ' · ' + _t({ tr: 'derece', en: 'order' }) + ' ' + eff;
  const stopAtt = attenAt(liveCache.stop);
  ui.liveRO.textContent = _t({ tr: 'durdurulan ton', en: 'stop tone' }) + ' ' + liveCache.stop.toFixed(1) +
    ' Hz: ' + stopAtt.toFixed(1) + ' dB';
}

// ============================================
// MASTER RENDER
// ============================================
function renderAll() {
  refreshColors();
  build();
  grid_ = magPhaseGrid();
  gd_ = groupDelay(grid_);
  computeLive();
  renderMag(); renderPhase(); renderPZ(); renderImpulse(); renderLiveTime(); renderLiveSpec();
  updateReadouts();
}

// ============================================
// CONTROL WIRING
// ============================================
function clampBand() {
  const ny = fs / 2;
  fc = Math.min(fc, ny * 0.98);
  f1 = Math.min(f1, ny * 0.9);
  f2 = Math.min(f2, ny * 0.98);
  if (f2 <= f1 + 0.5) f2 = Math.min(ny * 0.98, f1 + 0.5);
}

function updateVisibility() {
  const isBand = (ftype === 'bp' || ftype === 'bs');
  ui.fcGroup.style.display = isBand ? 'none' : 'block';
  ui.bandGroup.style.display = isBand ? 'block' : 'none';
  // FIR only in digital mode
  if (domain === 'analog' && family === 'fir') { family = 'butter'; ui.family.value = 'butter'; }
  if (ui.familyFir) ui.familyFir.disabled = (domain === 'analog');
  ui.rpGroup.style.display = (family === 'cheby1') ? 'block' : 'none';
  ui.rsGroup.style.display = (family === 'cheby2') ? 'block' : 'none';
  ui.winGroup.style.display = (family === 'fir') ? 'block' : 'none';
  // FIR uses many taps → widen order range; force EVEN order so M/2 is an
  // integer (needed for linear-phase symmetry and HP/BS spectral inversion).
  if (family === 'fir') { ui.orderSlider.min = 4; ui.orderSlider.max = 80; ui.orderSlider.step = 2; if (order % 2 === 1) order = Math.min(80, order + 1); }
  else { ui.orderSlider.min = 1; ui.orderSlider.max = 8; ui.orderSlider.step = 1; if (order > 8) { order = 8; ui.orderSlider.value = 8; } }
  if (ui.pzTitle) ui.pzTitle.textContent = (domain === 'digital' || family === 'fir')
    ? _t({ tr: 'Kutup–Sıfır (z-düzlemi)', en: 'Pole–Zero (z-plane)' })
    : _t({ tr: 'Kutup–Sıfır (s-düzlemi)', en: 'Pole–Zero (s-plane)' });
  if (ui.impTitle) ui.impTitle.textContent = (domain === 'digital' || family === 'fir')
    ? _t({ tr: 'Dürtü tepkisi h[n]', en: 'Impulse response h[n]' })
    : _t({ tr: 'Dürtü tepkisi h(t)', en: 'Impulse response h(t)' });
  if (ui.phaseTitle) ui.phaseTitle.textContent = (phaseMode === 'group')
    ? _t({ tr: 'Grup gecikmesi τ(f)', en: 'Group delay τ(f)' })
    : _t({ tr: 'Faz tepkisi ∠H(f)', en: 'Phase response ∠H(f)' });
}

function updateReadoutLabels() {
  ui.orderVal.textContent = order;
  ui.fsVal.textContent = fs.toFixed(0);
  ui.fcVal.textContent = fc.toFixed(1);
  ui.f1Val.textContent = f1.toFixed(1);
  ui.f2Val.textContent = f2.toFixed(1);
  ui.rpVal.textContent = Rp.toFixed(1);
  ui.rsVal.textContent = Rs.toFixed(0);
  ui.noiseVal.textContent = noiseLevel.toFixed(2);
  ui.gridAlphaVal.textContent = gridAlpha.toFixed(2);
}

function readControls() {
  domain = ui.domain.value;
  ftype = ui.ftype.value;
  family = ui.family.value;
  order = parseInt(ui.orderSlider.value);
  fs = parseFloat(ui.fsSlider.value);
  fc = parseFloat(ui.fcSlider.value);
  f1 = parseFloat(ui.f1Slider.value);
  f2 = parseFloat(ui.f2Slider.value);
  Rp = parseFloat(ui.rpSlider.value);
  Rs = parseFloat(ui.rsSlider.value);
  winType = ui.window.value;
  phaseMode = ui.phaseMode.value;
  noiseLevel = parseFloat(ui.noiseSlider.value);
  gridAlpha = parseFloat(ui.gridAlpha.value);
}

function onChange() {
  readControls();
  updateVisibility();
  clampBand();
  // reflect any clamping back to sliders
  ui.fcSlider.value = fc; ui.f1Slider.value = f1; ui.f2Slider.value = f2; ui.orderSlider.value = order;
  ui.family.value = family;
  updateReadoutLabels();
  renderAll();
}

['change'].forEach(ev => [ui.domain, ui.ftype, ui.family, ui.window, ui.phaseMode].forEach(el => el.addEventListener(ev, onChange)));
[ui.orderSlider, ui.fsSlider, ui.fcSlider, ui.f1Slider, ui.f2Slider, ui.rpSlider, ui.rsSlider, ui.noiseSlider, ui.gridAlpha].forEach(el => el.addEventListener('input', onChange));

window.addEventListener('resize', renderAll);
window.onThemeChange = () => renderAll();

// ============================================
// BACKGROUND
// ============================================
function initBg() {
  const c = document.getElementById('bgCanvas'); if (!c) return;
  const ctx = c.getContext('2d');
  function rs() { c.width = innerWidth; c.height = innerHeight; }
  rs(); window.addEventListener('resize', rs);
  const pts = [];
  for (let i = 0; i < 60; i++) pts.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.2 + 0.3, dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.08, a: Math.random() * 0.16 + 0.04 });
  (function lp() {
    ctx.clearRect(0, 0, c.width, c.height);
    const t = Date.now() * 0.0003;
    ctx.strokeStyle = 'rgba(80,120,255,0.025)'; ctx.lineWidth = 1;
    for (let w = 0; w < 3; w++) { ctx.beginPath(); for (let x = 0; x < c.width; x += 5) { const y = c.height * 0.5 + Math.sin(x * 0.004 + t + w * 2) * 50; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    for (const p of pts) { p.x += p.dx; p.y += p.dy; if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0; if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0; ctx.fillStyle = `rgba(100,160,255,${p.a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TWO_PI); ctx.fill(); }
    requestAnimationFrame(lp);
  })();
}

// ============================================
// INIT
// ============================================
initBg();
readControls();
updateVisibility();
clampBand();
updateReadoutLabels();
renderAll();
