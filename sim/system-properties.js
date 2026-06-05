/* ============================================
   SİSTEM ÖZELLİKLERİ — Etkileşimli Simülasyon
   - Kullanıcı tanımlı sistem ifadesi (T{x(t)} = ...)
   - x_1(t) ve x_2(t) seçilebilir/çizilebilir girişler
   - 5 sistem özelliği: belleksizlik, nedensellik,
     doğrusallık (süperpozisyon), zamanla değişmezlik,
     kararlılık (BIBO)
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));

/* === i18n helpers (TR / EN) === */
const __L = (tr, en) => (window._lang === 'en' ? en : tr);
const __i18n = (v) => (typeof v === 'string') ? v : ((window._t && window._t(v)) || v.tr || v.en || '');

/* =====================================================
   1) MATEMATİKSEL İFADE AYRIŞTIRICI (Recursive descent)
   ===================================================== */

const TOK = { NUM:'NUM', IDENT:'IDENT', OP:'OP', LP:'LP', RP:'RP', COMMA:'COMMA', END:'END' };

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    // Sayı
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      // bilimsel gösterim: 1e-3
      if (j < src.length && (src[j] === 'e' || src[j] === 'E')) {
        j++;
        if (j < src.length && (src[j] === '+' || src[j] === '-')) j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      const txt = src.slice(i, j);
      const v = parseFloat(txt);
      if (!isFinite(v)) throw new Error(`${__L('Geçersiz sayı','Invalid number')}: \"${txt}\"`);
      out.push({ type: TOK.NUM, val: v, raw: txt, pos: i });
      i = j;
      continue;
    }
    // Tanımlayıcı (harfle başlar, harf/rakam/altçizgi)
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ type: TOK.IDENT, val: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (c === '(') { out.push({ type: TOK.LP, pos: i }); i++; continue; }
    if (c === ')') { out.push({ type: TOK.RP, pos: i }); i++; continue; }
    if (c === ',') { out.push({ type: TOK.COMMA, pos: i }); i++; continue; }
    if ('+-*/^'.includes(c)) {
      out.push({ type: TOK.OP, val: c, pos: i });
      i++; continue;
    }
    throw new Error(`Beklenmeyen karakter '${c}' (poz ${i})`);
  }
  out.push({ type: TOK.END, pos: src.length });
  return out;
}

// AST düğümleri: { kind: 'num'|'var'|'call'|'binop'|'unary', ... }
function parseExpression(src) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (type, val) => {
    const t = toks[pos];
    if (t.type !== type || (val !== undefined && t.val !== val))
      throw new Error(`Beklenen ${type}${val ? "'"+val+"'" : ''}, bulunan: ${t.type}${t.val !== undefined ? "'"+t.val+"'" : ''}`);
    pos++; return t;
  };
  const accept = (type, val) => {
    const t = toks[pos];
    if (t.type !== type) return null;
    if (val !== undefined && t.val !== val) return null;
    pos++; return t;
  };

  function parseExpr() {
    let left = parseTerm();
    while (true) {
      const t = peek();
      if (t.type === TOK.OP && (t.val === '+' || t.val === '-')) {
        pos++;
        const right = parseTerm();
        left = { kind: 'binop', op: t.val, l: left, r: right };
      } else break;
    }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (true) {
      const t = peek();
      if (t.type === TOK.OP && (t.val === '*' || t.val === '/')) {
        pos++;
        const right = parseFactor();
        left = { kind: 'binop', op: t.val, l: left, r: right };
      } else break;
    }
    return left;
  }
  function parseFactor() {
    const left = parseUnary();
    const t = peek();
    if (t.type === TOK.OP && t.val === '^') {
      pos++;
      const right = parseFactor(); // right associative
      return { kind: 'binop', op: '^', l: left, r: right };
    }
    return left;
  }
  function parseUnary() {
    const t = peek();
    if (t.type === TOK.OP && (t.val === '+' || t.val === '-')) {
      pos++;
      const inner = parseUnary();
      if (t.val === '-') return { kind: 'unary', op: '-', e: inner };
      return inner;
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (t.type === TOK.NUM) { pos++; return { kind: 'num', val: t.val }; }
    if (t.type === TOK.LP) {
      pos++;
      const e = parseExpr();
      eat(TOK.RP);
      return e;
    }
    if (t.type === TOK.IDENT) {
      pos++;
      // fonksiyon çağrısı mı?
      if (peek().type === TOK.LP) {
        pos++; // LP
        const args = [];
        if (peek().type !== TOK.RP) {
          args.push(parseExpr());
          while (accept(TOK.COMMA)) args.push(parseExpr());
        }
        eat(TOK.RP);
        return { kind: 'call', name: t.val, args };
      }
      return { kind: 'var', name: t.val };
    }
    throw new Error(`Beklenmeyen sembol: ${t.type} (poz ${t.pos})`);
  }
  const node = parseExpr();
  if (peek().type !== TOK.END) {
    throw new Error(`${__L('İfade sonunda fazlalık','Excess at end of expression')} (${__L('poz','pos')} ${peek().pos})`);
  }
  return node;
}

/* =====================================================
   2) AST DEĞERLENDİRİCİ
   ctx = { t: number, x: (t)=>number, x1, x2 (opsiyonel) }
   ===================================================== */

const CONSTS = { pi: Math.PI, e: Math.E };

// Yardımcı fonksiyon kütüphanesi
function rectFn(t) { return Math.abs(t) <= 0.5 ? 1 : 0; }
function triFn(t) { const a = Math.abs(t); return a >= 1 ? 0 : 1 - a; }
function stepFn(t) { return t >= 0 ? 1 : 0; }
function sgnFn(t) { return t > 0 ? 1 : (t < 0 ? -1 : 0); }
function deltaFn(t, eps) {
  // dar üçgen yaklaşım, alanı = 1
  const r = Math.abs(t);
  if (r >= eps) return 0;
  return (1 - r / eps) / eps;
}

const FUNS = {
  cos: Math.cos, sin: Math.sin, tan: Math.tan,
  acos: Math.acos, asin: Math.asin, atan: Math.atan,
  cosh: Math.cosh, sinh: Math.sinh, tanh: Math.tanh,
  exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10,
  sqrt: Math.sqrt, abs: Math.abs,
  rect: rectFn, tri: triFn, u: stepFn, step: stepFn, sgn: sgnFn,
  // delta -> evaluator çağrıda eps verecek
};

function evalAST(node, ctx) {
  switch (node.kind) {
    case 'num': return node.val;
    case 'unary': return -evalAST(node.e, ctx);
    case 'binop': {
      const l = evalAST(node.l, ctx);
      const r = evalAST(node.r, ctx);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
      }
      throw new Error(`${__L('Bilinmeyen operatör','Unknown operator')}: ${node.op}`);
    }
    case 'var': {
      const n = node.name;
      if (n === 't') return ctx.t;
      if (n in CONSTS) return CONSTS[n];
      // Tek başına x → x(t) olarak yorumla
      if (n === 'x')  return ctx.x(ctx.t);
      if (n === 'x1' || n === 'x_1') return ctx.x1 ? ctx.x1(ctx.t) : ctx.x(ctx.t);
      if (n === 'x2' || n === 'x_2') return ctx.x2 ? ctx.x2(ctx.t) : 0;
      throw new Error(`${__L('Tanımsız değişken','Undefined variable')}: ${n}`);
    }
    case 'call': {
      const n = node.name;
      const args = node.args.map(a => evalAST(a, ctx));
      if (n === 'x')  return ctx.x(args[0]);
      if (n === 'x1' || n === 'x_1') return (ctx.x1 || ctx.x)(args[0]);
      if (n === 'x2' || n === 'x_2') return (ctx.x2 || (() => 0))(args[0]);
      if (n === 'delta') return deltaFn(args[0], ctx.deltaEps || 0.05);
      if (n in FUNS) return FUNS[n](...args);
      // Bazı kullanıcılar pi yazmak yerine 'pi()' yazabilir; korumalı
      if (n in CONSTS && args.length === 0) return CONSTS[n];
      throw new Error(`${__L('Tanımsız fonksiyon','Undefined function')}: ${n}`);
    }
  }
  throw new Error(`${__L('Geçersiz AST düğümü','Invalid AST node')}: ${node.kind}`);
}

/* =====================================================
   3) AST → LaTeX (görsel render için)
   ===================================================== */
function astToLatex(node) {
  switch (node.kind) {
    case 'num': {
      const v = node.val;
      if (v === Math.PI) return '\\pi';
      // sade sayı
      return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
    }
    case 'unary': return '-' + wrapIfBinop(node.e);
    case 'binop': {
      const op = node.op;
      const l = astToLatex(node.l);
      const r = astToLatex(node.r);
      if (op === '+') return l + ' + ' + r;
      if (op === '-') return l + ' - ' + (node.r.kind === 'binop' && (node.r.op === '+' || node.r.op === '-') ? '(' + r + ')' : r);
      if (op === '*') {
        const lw = wrapIfAddSub(node.l, l);
        const rw = wrapIfAddSub(node.r, r);
        return lw + ' \\cdot ' + rw;
      }
      if (op === '/') return '\\dfrac{' + l + '}{' + r + '}';
      if (op === '^') {
        const base = (node.l.kind === 'binop' || node.l.kind === 'unary') ? '\\left(' + l + '\\right)' : l;
        return base + '^{' + r + '}';
      }
      return l + op + r;
    }
    case 'var': {
      const n = node.name;
      if (n === 'pi') return '\\pi';
      if (n === 't') return 't';
      if (n === 'x' || n === 'x1' || n === 'x_1' || n === 'x2' || n === 'x_2') {
        const sub = (n === 'x1' || n === 'x_1') ? '_1' : (n === 'x2' || n === 'x_2') ? '_2' : '';
        return 'x' + sub + '(t)';
      }
      return n;
    }
    case 'call': {
      const n = node.name;
      const argsLatex = node.args.map(astToLatex);
      if (n === 'x' || n === 'x1' || n === 'x_1' || n === 'x2' || n === 'x_2') {
        const sub = (n === 'x1' || n === 'x_1') ? '_1' : (n === 'x2' || n === 'x_2') ? '_2' : '';
        return 'x' + sub + '\\!\\left(' + argsLatex.join(',') + '\\right)';
      }
      const funcMap = { cos: '\\cos', sin: '\\sin', tan: '\\tan',
        exp: '\\exp', log: '\\log', ln: '\\ln',
        sqrt: '\\sqrt{__}', abs: '\\left|__\\right|',
        rect: '\\operatorname{rect}', tri: '\\operatorname{tri}',
        u: 'u', step: 'u', sgn: '\\operatorname{sgn}', delta: '\\delta' };
      if (n === 'sqrt') return '\\sqrt{' + argsLatex.join(',') + '}';
      if (n === 'abs') return '\\left|' + argsLatex.join(',') + '\\right|';
      const fn = funcMap[n] || ('\\operatorname{' + n + '}');
      return fn + '\\!\\left(' + argsLatex.join(',') + '\\right)';
    }
  }
  return '';
}
function wrapIfBinop(n) {
  if (n.kind === 'binop') return '\\left(' + astToLatex(n) + '\\right)';
  return astToLatex(n);
}
function wrapIfAddSub(n, latex) {
  if (n.kind === 'binop' && (n.op === '+' || n.op === '-')) return '\\left(' + latex + '\\right)';
  return latex;
}

/* =====================================================
   4) GLOBAL DURUM
   ===================================================== */

const state = {
  expr: '',
  ast: null,
  exprErr: null,
  // zaman ekseni (ortak)
  t0: -6, t1: 6, dt: 0.02,
  // giriş işaretleri — her birinin kendi merkezi (tc)
  sigs: {
    1: { type: 'cos', amp: 1.0, freq: 0.5, width: 2.0, phase: 0, tc: 0.0,
         drawSamples: null /* {t:[], y:[]} */ },
    2: { type: 'sin', amp: 0.8, freq: 1.0, width: 3.0, phase: 0, tc: 0.0,
         drawSamples: null },
  },
  // özellik kontrolleri
  memInput: 'x1', cauInput: 'x1', tinvInput: 'x1', stabInput: 'x1',
  causTstar: 2.0,
  linA: 1.0, linB: 1.0,
  tinvT0: 1.5,
  impT: 0.0,
  // verdict önbelleği (LTI kapısı için)
  _linPass: false,
  _tinvPass: false,
};

/* =====================================================
   5) İŞARET ÜRETİMİ
   ===================================================== */

// Hangi zaman ızgarasını kullanıyoruz?
function buildTimeAxis() {
  const t0 = Math.min(state.t0, state.t1 - 0.5);
  const t1 = Math.max(state.t1, state.t0 + 0.5);
  const dt = Math.max(state.dt, 0.001);
  const N = Math.min(4000, Math.max(50, Math.floor((t1 - t0) / dt) + 1));
  const t = new Float64Array(N);
  for (let i = 0; i < N; i++) t[i] = t0 + i * dt;
  return { t, dt, N, t0, t1 };
}

// Her bir sinyal türünü üretir (örneklenmiş)
function sampleSignal(sigIdx, axis) {
  const cfg = state.sigs[sigIdx];
  const N = axis.N;
  const y = new Float64Array(N);
  const tc = cfg.tc; // her sinyalin kendi merkez kayması

  if (cfg.type === 'draw' && cfg.drawSamples && cfg.drawSamples.t.length >= 2) {
    // El çizimini doğrusal interpolasyonla mevcut ızgaraya yansıt
    const dt = cfg.drawSamples.t;
    const dy = cfg.drawSamples.y;
    const M = dt.length;
    let k = 0;
    for (let i = 0; i < N; i++) {
      const tq = axis.t[i] - tc;
      if (tq <= dt[0] || tq >= dt[M-1]) { y[i] = 0; continue; }
      while (k < M - 2 && dt[k+1] < tq) k++;
      // geri sarma (axis.t artıyor ama tq monoton olmayabilir → güvenli arama)
      if (dt[k] > tq) { k = 0; while (k < M - 2 && dt[k+1] < tq) k++; }
      const u = (tq - dt[k]) / (dt[k+1] - dt[k]);
      y[i] = dy[k] + u * (dy[k+1] - dy[k]);
    }
    return y;
  }

  const A = cfg.amp;
  const F = Math.max(cfg.freq, 1e-6);
  const W = Math.max(cfg.width, 1e-3);
  const ph = cfg.phase;

  for (let i = 0; i < N; i++) {
    const te = axis.t[i] - tc;
    let v = 0;
    switch (cfg.type) {
      case 'cos': v = A * Math.cos(2 * Math.PI * F * te + ph); break;
      case 'sin': v = A * Math.sin(2 * Math.PI * F * te + ph); break;
      case 'dirac': {
        const eps = Math.max(axis.dt * 1.5, 0.05);
        const r = Math.abs(te);
        v = r >= eps ? 0 : A * (1 - r / eps) / eps;
        break;
      }
      case 'square': {
        // aperiyodik kare: [-W/2, W/2] aralığında ±A (Yarı periyot içinde merkezli sinyal)
        // Basit aperiyodik form: tek bir kare darbe genişliği W
        v = Math.abs(te) <= W / 2 ? A : 0;
        break;
      }
      case 'triangle': {
        // aperiyodik üçgen: tepe A, taban genişliği W, te=0'da tepe
        const r = Math.abs(te);
        v = r >= W / 2 ? 0 : A * (1 - 2 * r / W);
        break;
      }
      default: v = 0;
    }
    y[i] = v;
  }
  return y;
}

// İnterpolasyonlu örnekleme (sistem değerlendirmesi sırasında x(t-3) için)
function makeSampler(t, y) {
  const N = y.length;
  const t0 = t[0], t1 = t[N-1];
  const dt = (t1 - t0) / (N - 1);
  return function (tq) {
    if (!isFinite(tq)) return 0;
    if (tq <= t0 || tq >= t1) return 0;
    const idxF = (tq - t0) / dt;
    const idx = Math.floor(idxF);
    const frac = idxF - idx;
    if (idx < 0 || idx + 1 >= N) return 0;
    return y[idx] * (1 - frac) + y[idx + 1] * frac;
  };
}

/* =====================================================
   6) SİSTEM UYGULA
   ===================================================== */
function applySystem(axis, xSampler, opts = {}) {
  const y = new Float64Array(axis.N);
  if (!state.ast) return y;
  const ctx = {
    t: 0,
    x: xSampler,
    x1: opts.x1 || null,
    x2: opts.x2 || null,
    deltaEps: Math.max(axis.dt * 1.5, 0.05),
  };
  for (let i = 0; i < axis.N; i++) {
    ctx.t = axis.t[i];
    try {
      const v = evalAST(state.ast, ctx);
      y[i] = isFinite(v) ? v : 0;
    } catch (e) {
      y[i] = 0;
    }
  }
  return y;
}

/* =====================================================
   7) ÇİZİM YARDIMCILARI
   ===================================================== */
function prepCv(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(20, r.width * dpr);
  cv.height = Math.max(20, r.height * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height, ctx };
}

function getStyle(k, fb) {
  const s = getComputedStyle(document.body).getPropertyValue(k).trim();
  return s || fb;
}

function niceTicks(mn, mx, target) {
  const span = mx - mn;
  if (span <= 0) return [mn];
  const step0 = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step;
  if (norm < 1.5) step = mag;
  else if (norm < 3.5) step = 2 * mag;
  else if (norm < 7.5) step = 5 * mag;
  else step = 10 * mag;
  const out = [];
  const start = Math.ceil(mn / step) * step;
  for (let v = start; v <= mx + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

function bounds(arrs, pad = 0.12) {
  let mn = Infinity, mx = -Infinity;
  for (const a of arrs) {
    if (!a) continue;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (!isFinite(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  if (!isFinite(mn)) { mn = -1; mx = 1; }
  if (mn === mx) { mn -= 0.5; mx += 0.5; }
  const p = (mx - mn) * pad;
  return { mn: mn - p, mx: mx + p };
}

function drawAxes(ctx, w, h, tmin, tmax, mn, mx) {
  const bg = getStyle('--canvas-bg', 'rgba(4,4,18,0.5)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const padL = 34, padR = 10, padT = 10, padB = 22;
  const W = w - padL - padR, H = h - padT - padB;
  const X = (t) => padL + (t - tmin) / (tmax - tmin) * W;
  const Y = (v) => padT + (1 - (v - mn) / (mx - mn)) * H;

  ctx.strokeStyle = 'rgba(120,140,200,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const x = padL + i * W / 10;
    ctx.moveTo(x, padT); ctx.lineTo(x, padT + H);
  }
  for (let j = 1; j < 5; j++) {
    const y = padT + j * H / 5;
    ctx.moveTo(padL, y); ctx.lineTo(padL + W, y);
  }
  ctx.stroke();

  const ax = getStyle('--border-glow-strong', 'rgba(100,180,255,0.55)');
  ctx.strokeStyle = ax; ctx.lineWidth = 1.2;
  const y0 = Y(0);
  ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(padL + W, y0); ctx.stroke();
  if (tmin <= 0 && tmax >= 0) {
    const x0 = X(0);
    ctx.beginPath(); ctx.moveTo(x0, padT); ctx.lineTo(x0, padT + H); ctx.stroke();
  }

  const txt = getStyle('--text-secondary', '#7a82a6');
  ctx.fillStyle = txt;
  ctx.font = '9px "Fira Code", monospace';
  ctx.textAlign = 'center';
  for (const tv of niceTicks(tmin, tmax, 7)) {
    const xp = X(tv);
    ctx.fillText(tv.toFixed(Math.abs(tv) < 10 ? 1 : 0), xp, padT + H + 12);
  }
  ctx.textAlign = 'right';
  for (const yv of niceTicks(mn, mx, 4)) {
    const yp = Y(yv);
    ctx.fillText(yv.toFixed(Math.abs(yv) < 10 ? 1 : 0), padL - 3, yp + 3);
  }

  return { X, Y, padL, padR, padT, padB, W, H };
}

function drawCurve(ctx, t, y, X, Y, color, lw = 1.8, dashed = false) {
  if (dashed) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < t.length; i++) {
    const v = y[i];
    if (!isFinite(v)) { started = false; continue; }
    if (!started) { ctx.moveTo(X(t[i]), Y(v)); started = true; }
    else ctx.lineTo(X(t[i]), Y(v));
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/* Bir veri seti çizme (eksen + tek eğri) */
function plotOne(cv, axis, y, color) {
  const p = prepCv(cv);
  const b = bounds([y]);
  const a = drawAxes(p.ctx, p.w, p.h, axis.t0, axis.t1, b.mn, b.mx);
  drawCurve(p.ctx, axis.t, y, a.X, a.Y, color, 2.0);
}

/* İki eğri overlay (örn. doğrusallık testinde) */
function plotTwo(cv, axis, yA, colA, yB, colB) {
  const p = prepCv(cv);
  const b = bounds([yA, yB]);
  const a = drawAxes(p.ctx, p.w, p.h, axis.t0, axis.t1, b.mn, b.mx);
  drawCurve(p.ctx, axis.t, yA, a.X, a.Y, colA, 2.4);
  drawCurve(p.ctx, axis.t, yB, a.X, a.Y, colB, 1.6, true);
}

/* =====================================================
   8) DOM BAĞLANTILARI
   ===================================================== */
const $ = (id) => document.getElementById(id);
const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function setExpr(expr) {
  state.expr = expr;
  $('sysExpr').value = expr;
  try {
    state.ast = parseExpression(expr);
    state.exprErr = null;
    $('sysExpr').classList.remove('invalid');
    const st = $('sysStatus');
    st.className = 'sysdef-status ok'; st.textContent = __L('✓ ifade geçerli','✓ expression is valid');
    renderExprLatex();
  } catch (e) {
    state.ast = null;
    state.exprErr = e.message;
    $('sysExpr').classList.add('invalid');
    const st = $('sysStatus');
    st.className = 'sysdef-status err'; st.textContent = '⚠ ' + e.message;
    $('sysRendered').innerHTML = '<span style="color:var(--color-marker);font-family:Fira Code,monospace;font-size:0.82rem;">' + e.message + '</span>';
  }
}

function renderExprLatex() {
  if (!state.ast) return;
  const latex = '$y(t) = T\\{x(t)\\} = ' + astToLatex(state.ast) + '$';
  $('sysRendered').innerHTML = latex;
  if (window.renderMathInElement) {
    window.renderMathInElement($('sysRendered'), {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
    });
  }
}

// Hazır örnekler
qa('.sysdef-presets button').forEach(b => {
  b.addEventListener('click', () => {
    setExpr(b.dataset.expr);
    redrawAll();
  });
});

$('sysExpr').addEventListener('input', (e) => {
  setExpr(e.target.value);
  redrawAll();
});

// Zaman ekseni
function bindAxis(input, valEl, key, fmt) {
  $(input).addEventListener('input', (e) => {
    state[key] = parseFloat(e.target.value);
    $(valEl).textContent = fmt(state[key]);
    redrawAll();
  });
}
bindAxis('t0', 't0Val', 't0', v => v.toFixed(1));
bindAxis('t1', 't1Val', 't1', v => v.toFixed(1));
bindAxis('dt', 'dtVal', 'dt', v => v.toFixed(3));

// Sinyal kartları (x1, x2)
function bindSignalCard(sigIdx) {
  const card = document.querySelector(`.signal-card[data-sig="${sigIdx}"]`);
  // tip butonları
  card.querySelectorAll('.sig-type-btn').forEach(b => {
    b.addEventListener('click', () => {
      const type = b.dataset.type;
      state.sigs[sigIdx].type = type;
      card.querySelectorAll('.sig-type-btn').forEach(x => x.classList.toggle('active', x === b));
      const wrap = card.querySelector('.sig-canvas-wrap');
      const clear = card.querySelector('.sig-clear-draw');
      if (type === 'draw') {
        wrap.classList.add('draw-mode');
        if (!wrap.querySelector('.draw-hint')) {
          const hint = document.createElement('div');
          hint.className = 'draw-hint'; hint.textContent = __L('✎ fareyle çiz','✎ draw with mouse');
          wrap.appendChild(hint);
        }
        clear.classList.add('show');
      } else {
        wrap.classList.remove('draw-mode');
        const h = wrap.querySelector('.draw-hint'); if (h) h.remove();
        clear.classList.remove('show');
      }
      redrawAll();
    });
  });
  // parametre slider'ları
  card.querySelectorAll('input[type="range"]').forEach(inp => {
    const key = inp.dataset.param;
    inp.addEventListener('input', () => {
      state.sigs[sigIdx][key] = parseFloat(inp.value);
      const vEl = card.querySelector(`.v[data-val="${key}"]`);
      if (vEl) vEl.textContent = state.sigs[sigIdx][key].toFixed(2);
      redrawAll();
    });
  });
  // elle çizim
  const drawCv = card.querySelector('canvas');
  let drawing = false;
  let lastDrawPos = null;

  function canvasToDataCoord(ev) {
    const r = drawCv.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width;
    const y = (ev.clientY - r.top) / r.height;
    // x kanvasta [t0, t1] aralığını gösterir; çizim sinyalin kendi merkez
    // sistemine kaydedilsin (cfg.tc) — sonra render'da axis.t - cfg.tc'ye yansır.
    const tq = state.t0 + x * (state.t1 - state.t0) - state.sigs[sigIdx].tc;
    const yLim = 2.5;
    const v = (1 - y * 2) * yLim;
    return { t: tq, y: Math.max(-yLim, Math.min(yLim, v)) };
  }

  drawCv.addEventListener('mousedown', (ev) => {
    if (state.sigs[sigIdx].type !== 'draw') return;
    drawing = true;
    const p = canvasToDataCoord(ev);
    state.sigs[sigIdx].drawSamples = { t: [p.t], y: [p.y] };
    lastDrawPos = p;
    redrawAll();
  });
  drawCv.addEventListener('mousemove', (ev) => {
    if (!drawing) return;
    const p = canvasToDataCoord(ev);
    const ds = state.sigs[sigIdx].drawSamples;
    if (ds && p.t > ds.t[ds.t.length - 1] + 1e-4) {
      ds.t.push(p.t); ds.y.push(p.y);
      lastDrawPos = p;
      redrawAll();
    }
  });
  window.addEventListener('mouseup', () => { drawing = false; });

  card.querySelector('.sig-clear-draw').addEventListener('click', () => {
    state.sigs[sigIdx].drawSamples = null;
    redrawAll();
  });
}
bindSignalCard(1);
bindSignalCard(2);

// Özellik kontrolleri
function bindPropRadioGroup(propGroupKey, stateKey) {
  qa(`.prop-radio-group[data-prop="${propGroupKey}"] .prop-radio`).forEach(b => {
    b.addEventListener('click', () => {
      const v = b.dataset.input;
      state[stateKey] = v;
      qa(`.prop-radio-group[data-prop="${propGroupKey}"] .prop-radio`).forEach(x => x.classList.toggle('active', x === b));
      redrawAll();
    });
  });
}
bindPropRadioGroup('mem', 'memInput');
bindPropRadioGroup('cau', 'cauInput');
bindPropRadioGroup('tinv', 'tinvInput');
bindPropRadioGroup('stab', 'stabInput');

$('causTstar').addEventListener('input', (e) => {
  state.causTstar = parseFloat(e.target.value);
  $('causTstarVal').textContent = state.causTstar.toFixed(1);
  redrawAll();
});
$('linA').addEventListener('input', (e) => {
  state.linA = parseFloat(e.target.value);
  $('linAVal').textContent = state.linA.toFixed(2);
  redrawAll();
});
$('linB').addEventListener('input', (e) => {
  state.linB = parseFloat(e.target.value);
  $('linBVal').textContent = state.linB.toFixed(2);
  redrawAll();
});
$('tinvT0').addEventListener('input', (e) => {
  state.tinvT0 = parseFloat(e.target.value);
  $('tinvT0Val').textContent = state.tinvT0.toFixed(1);
  redrawAll();
});
$('impT').addEventListener('input', (e) => {
  state.impT = parseFloat(e.target.value);
  $('impTVal').textContent = state.impT.toFixed(1);
  redrawAll();
});

/* =====================================================
   9) ANA ÇİZİM
   ===================================================== */

function redrawAll() {
  const axis = buildTimeAxis();
  // Sinyaller
  const x1 = sampleSignal(1, axis);
  const x2 = sampleSignal(2, axis);
  const x1Smp = makeSampler(axis.t, x1);
  const x2Smp = makeSampler(axis.t, x2);

  // Renkler
  const cX = getStyle('--accent-1', '#39ff85');
  const cY = getStyle('--color-y', '#7b8cff');
  const cH = getStyle('--accent-2', '#ff8c42');
  const cM = getStyle('--color-marker', '#ff4f9a');

  // --- Sinyal kartları kendi önizlemeleri ---
  const cv1 = document.querySelector('.signal-card[data-sig="1"] canvas');
  const cv2 = document.querySelector('.signal-card[data-sig="2"] canvas');
  plotOne(cv1, axis, x1, cX);
  plotOne(cv2, axis, x2, cH);

  // --- 1) Belleksizlik ---
  {
    const inSig = state.memInput === 'x1' ? x1 : x2;
    const inSmp = state.memInput === 'x1' ? x1Smp : x2Smp;
    const yOut = applySystem(axis, inSmp, { x1: x1Smp, x2: x2Smp });
    $('memInTag').textContent = state.memInput === 'x1' ? 'x₁' : 'x₂';
    plotOne($('memInCv'), axis, inSig, state.memInput === 'x1' ? cX : cH);
    plotOne($('memOutCv'), axis, yOut, cY);
    // Sezgisel AST kontrolü + runtime "iki giriş aynı t'de eşitse çıkış da eşit mi?"
    const memlessAST = isMemoryless(state.ast);
    // Runtime test: x_A = inSig, x_B = inSig'in farklı bir versiyonu (örn. ters zaman),
    // x_A(t0) == x_B(t0) olan bir nokta için T{x_A}(t0) == T{x_B}(t0) mu?
    // Bunu pratikte: x_2'yi inSig ile aynı genliğe scale edip değerlerin EŞLEŞTİĞİ tek bir nokta var
    // - bu kanıt yetersiz olur. AST kontrolünü yeterli sayıyoruz.
    setVerdict('memVerdict',
      memlessAST === true ? 'pass' : (memlessAST === false ? 'fail' : 'unknown'),
      memlessAST === true
        ? __L('Belleksiz ✓ — y(t) yalnızca x(t)\'nin aynı anki değerine bağlı (AST taraması).','Memoryless ✓ — y(t) depends only on the current value of x(t) (AST scan).')
        : memlessAST === false
        ? __L('Bellekli ✗ — ifadede x(t±a) (a≠0), x(at), x(−t) gibi geçmiş/gelecek erişim mevcut.','With memory ✗ — the expression contains past/future access such as x(t±a) (a≠0), x(at), or x(−t).')
        : 'Belirsiz.');
  }

  // --- 2) Nedensellik — KESİLMİŞ GİRİŞ TESTİ ---
  // Yöntem (gerek-yeter): x(t) seç. t* sonrasını sıfırla → x_kes(t) = x(t)·u(t*−t).
  // y_full = T{x}, y_kes = T{x_kes}. T nedensel ⇔ ∀ t ≤ t*: y_full(t) = y_kes(t).
  // Bu test x(t)^2, e^x gibi non-lineer ama nedensel sistemleri doğru tanır;
  // Dirac karesi gibi patolojik durumlardan kaçınır.
  {
    const inSig = state.cauInput === 'x1' ? x1 : x2;
    const inSmp = state.cauInput === 'x1' ? x1Smp : x2Smp;
    const tStar = state.causTstar;

    const xTrunc = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) xTrunc[i] = axis.t[i] <= tStar ? inSig[i] : 0;
    const xTruncSmp = makeSampler(axis.t, xTrunc);

    const yFull = applySystem(axis, inSmp, { x1: x1Smp, x2: x2Smp });
    const yTrunc = applySystem(axis, xTruncSmp, { x1: x1Smp, x2: x2Smp });

    // Giriş paneli: kesilmiş giriş (kalın) ve orijinal (kesik) — t* öncesinde çakışırlar
    plotTwo($('cauInCv'), axis, xTrunc, state.cauInput === 'x1' ? cX : cH, inSig, cM);
    // Çıkış paneli: y_full (kalın yeşil) ve y_kes (kesik pembe) — nedensel ise t<t* için çakışır
    plotTwo($('cauOutCv'), axis, yFull, cY, yTrunc, cM);

    // t < t* − guard aralığında RMSE
    let num = 0, den = 0;
    const guard = 3 * axis.dt;
    let nSamples = 0;
    for (let i = 0; i < axis.N; i++) {
      if (axis.t[i] <= tStar - guard) {
        const d = yFull[i] - yTrunc[i];
        num += d * d;
        den += yFull[i] * yFull[i];
        nSamples++;
      }
    }
    const rel = nSamples > 5 ? Math.sqrt(num / Math.max(den, 1e-12)) : NaN;

    let verdict, msg;
    if (!isFinite(rel)) {
      verdict = 'unknown';
      msg = __L('t* zaman aralığının dışında — kaydırın ve tekrar deneyin.','t* is outside the time range — please slide and try again.');
    } else if (rel < 1e-3) {
      verdict = 'pass';
      msg = `${__L('Nedensel ✓','Causal ✓')} (${__L('göreceli hata','relative error')} = ${rel.toExponential(2)}). ${__L('Girişin geleceği silinince çıkışın geçmişi değişmedi.','When the future of the input is discarded, the past of the output remains unchanged.')}`;
    } else if (rel < 0.05) {
      verdict = 'unknown';
      msg = `${__L('Yaklaşık çakışma','Approximate match')} (${__L('hata','error')} = ${rel.toExponential(2)}). ${__L('Sayısal interpolasyon gürültüsü olabilir; t* veya dt değiştirip tekrar deneyin.','May be due to numerical interpolation noise; change t* or dt and try again.')}`;
    } else {
      verdict = 'fail';
      msg = `${__L('Nedensel değil ✗','Not causal ✗')} (${__L('hata','error')} = ${rel.toExponential(2)}). ${__L('Çıkışın t<t* kısmı, girişin t>t* kısmına bağlı.','The output for t<t* depends on the input for t>t*.')}`;
    }
    setVerdict('cauVerdict', verdict, msg);
  }

  // --- 3) Doğrusallık ---
  {
    const a = state.linA, b = state.linB;
    // a·x1
    const aX1 = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) aX1[i] = a * x1[i];
    // b·x2
    const bX2 = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) bX2[i] = b * x2[i];
    // birleşik a·x1+b·x2
    const combined = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) combined[i] = aX1[i] + bX2[i];

    const T_aX1 = applySystem(axis, makeSampler(axis.t, aX1), { x1: x1Smp, x2: x2Smp });
    const T_bX2 = applySystem(axis, makeSampler(axis.t, bX2), { x1: x1Smp, x2: x2Smp });
    const T_combined = applySystem(axis, makeSampler(axis.t, combined), { x1: x1Smp, x2: x2Smp });

    // a·T{x1} + b·T{x2}  — ama bizim T_aX1 zaten "T{a·x1}" idi.
    // Süperpozisyonun tanımı: T{a·x1+b·x2} = a·T{x1} + b·T{x2}
    // Yani: önce x1'i sisteme ver, sonra a ile çarp.
    const T_x1_raw = applySystem(axis, x1Smp, { x1: x1Smp, x2: x2Smp });
    const T_x2_raw = applySystem(axis, x2Smp, { x1: x1Smp, x2: x2Smp });
    const sumExpected = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) sumExpected[i] = a * T_x1_raw[i] + b * T_x2_raw[i];

    const aTx1 = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) aTx1[i] = a * T_x1_raw[i];
    plotOne($('linIn1Cv'), axis, aX1, cX);
    plotOne($('linOut1Cv'), axis, aTx1, cY);

    plotOne($('linIn2Cv'), axis, bX2, cH);
    const bTx2 = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) bTx2[i] = b * T_x2_raw[i];
    plotOne($('linOut2Cv'), axis, bTx2, cY);

    plotOne($('linInSCv'), axis, combined, cX);
    plotTwo($('linOutSCv'), axis, T_combined, cY, sumExpected, cM);

    // RMSE karşılaştırma — boundary trimming (her iki yol da boundary'de sıfırlandığı için
    // safeRegion gerekmiyor, ama gürültüye karşı iç bölgeyi alıyoruz)
    let num = 0, den = 0;
    const guard = 3 * axis.dt;
    for (let i = 0; i < axis.N; i++) {
      if (axis.t[i] < axis.t0 + guard || axis.t[i] > axis.t1 - guard) continue;
      const d = T_combined[i] - sumExpected[i];
      num += d * d;
      den += T_combined[i] * T_combined[i];
    }
    const rel = Math.sqrt(num / Math.max(den, 1e-12));
    let verdict, msg;
    if (rel < 1e-3) { verdict = 'pass';
      msg = `${__L('Doğrusal ✓','Linear ✓')} (${__L('göreceli hata','relative error')} = ${rel.toExponential(2)}). ${__L('T{ax₁+bx₂} ile aT{x₁}+bT{x₂} çakışıyor.','T{ax₁+bx₂} matches aT{x₁}+bT{x₂}.')}`;
    } else if (rel < 0.05) { verdict = 'unknown';
      msg = `${__L('Yaklaşık çakışma','Approximate match')} (${__L('hata','error')} = ${rel.toExponential(2)}). ${__L('Sayısal gürültü veya zayıf doğrusalsızlık.','Numerical noise or weak non-linearity.')}`;
    } else { verdict = 'fail';
      msg = `${__L('Doğrusal değil ✗','Not linear ✗')} (${__L('hata','error')} = ${rel.toExponential(2)}). ${__L('Süperpozisyon ihlali görünür.','Superposition violation observed.')}`;
    }
    setVerdict('linVerdict', verdict, msg);
    state._linPass = (verdict === 'pass');
  }

  // --- 4) Zamanla Değişmezlik ---
  {
    const T0 = state.tinvT0;
    const inSmp = state.tinvInput === 'x1' ? x1Smp : x2Smp;
    // Yol A: önce gecikme, sonra sistem
    const xDel = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) xDel[i] = inSmp(axis.t[i] - T0);
    const yA = applySystem(axis, makeSampler(axis.t, xDel), { x1: x1Smp, x2: x2Smp });
    // Yol B: önce sistem, sonra çıkışı geciktir
    const yRaw = applySystem(axis, inSmp, { x1: x1Smp, x2: x2Smp });
    const yRawSmp = makeSampler(axis.t, yRaw);
    const yB = new Float64Array(axis.N);
    for (let i = 0; i < axis.N; i++) yB[i] = yRawSmp(axis.t[i] - T0);

    plotOne($('tinvInCv'), axis, xDel, state.tinvInput === 'x1' ? cX : cH);
    plotTwo($('tinvOutCv'), axis, yA, cY, yB, cM);

    // Karşılaştırma — kenar bölgesini kırp (T0 kayması yüzünden kenarlar sıfırlanır,
    // bunlar her iki yolda farklı tarzda olabilir → sahte fail önlemek için atla)
    let num = 0, den = 0;
    const guard = Math.abs(state.tinvT0) + 5 * axis.dt;
    let nSamples = 0;
    for (let i = 0; i < axis.N; i++) {
      if (axis.t[i] < axis.t0 + guard || axis.t[i] > axis.t1 - guard) continue;
      const d = yA[i] - yB[i];
      num += d * d;
      den += yA[i] * yA[i];
      nSamples++;
    }
    const rel = nSamples > 5 ? Math.sqrt(num / Math.max(den, 1e-12)) : NaN;
    let verdict, msg;
    if (!isFinite(rel)) {
      verdict = 'unknown'; msg = __L('T₀ aralık dışı — daha küçük seçin.','T₀ out of range — choose a smaller value.');
    } else if (rel < 1e-3) { verdict = 'pass';
      msg = `${__L('Zamanla değişmez ✓','Time-invariant ✓')} (${__L('hata','error')} = ${rel.toExponential(2)}). ${__L('Gecikme operasyonu sistemle yer değiştirebilir.','The delay operation commutes with the system.')}`;
    } else if (rel < 0.05) { verdict = 'unknown';
      msg = `${__L('Yaklaşık çakışma','Approximate match')} (${__L('hata','error')} = ${rel.toExponential(2)}). ${__L("T₀'yı değiştirip tekrar gözleyin.",'Change T₀ and observe again.')}`;
    } else { verdict = 'fail';
      msg = `${__L('Zamanla değişen ✗','Time-varying ✗')} (${__L('hata','error')} = ${rel.toExponential(2)}). T{x(t−T₀)} ≠ y(t−T₀).`;
    }
    setVerdict('tinvVerdict', verdict, msg);
    state._tinvPass = (verdict === 'pass');
  }

  // --- 5) Kararlılık ---
  {
    const inSig = state.stabInput === 'x1' ? x1 : x2;
    const inSmp = state.stabInput === 'x1' ? x1Smp : x2Smp;
    const yOut = applySystem(axis, inSmp, { x1: x1Smp, x2: x2Smp });
    plotOne($('stabInCv'), axis, inSig, state.stabInput === 'x1' ? cX : cH);
    plotOne($('stabOutCv'), axis, yOut, cY);

    let mx = 0, my = 0;
    for (let i = 0; i < axis.N; i++) {
      mx = Math.max(mx, Math.abs(inSig[i]));
      my = Math.max(my, Math.abs(yOut[i]));
    }
    $('stabMx').textContent = mx.toFixed(3);
    $('stabMy').textContent = isFinite(my) ? my.toFixed(3) : '∞';
    $('stabG').textContent = mx > 1e-9 ? (my / mx).toFixed(3) : '—';

    let verdict, msg;
    if (!isFinite(my) || my > 1e6) {
      verdict = 'fail';
      msg = `${__L('Karşı örnek bulundu ✗ — çıkış sınırsızca büyüyor','Counter-example found ✗ — the output grows without bound')} (max|y| ≈ ${isFinite(my) ? my.toExponential(1) : '∞'}). ${__L('Sistem BIBO kararsız.','The system is BIBO unstable.')}`;
    } else if (mx > 1e-9 && my / mx < 50) {
      verdict = 'pass';
      msg = `${__L('Bu giriş için sınırlı çıkış','Bounded output for this input')} (${__L('kazanç','gain')} ≈ ${(my/mx).toFixed(2)}). ${__L('Not: BIBO ispatı için TÜM sınırlı girişler için sınırlılık gerekir — bu test yalnızca karşı örnek arar.','Note: a BIBO proof requires boundedness for ALL bounded inputs — this test only searches for a counter-example.')}`;
    } else if (mx <= 1e-9) {
      verdict = 'unknown';
      msg = __L('Giriş ~0 — kararlılık değerlendirilemiyor.','Input ~0 — stability cannot be assessed.');
    } else {
      verdict = 'unknown';
      msg = `${__L('Çıkış kazancı yüksek','High output gain')} (${(my/Math.max(mx,1e-9)).toFixed(1)}). ${__L('Farklı girişlerle test ediniz; e^(αt) tipli sistemlerde α büyüdükçe patlar.','Test with different inputs; in e^(αt)-type systems, the output blows up as α grows.')}`;
    }
    setVerdict('stabVerdict', verdict, msg);
  }

  // --- ★ LTI ⇒ İMPULS CEVABI ---
  // LTI kapısı için arka planda zamanla değişmezliği BİRDEN ÇOK T0 değeri ile sınar.
  // Kullanıcı T0=0 veya periyot katı bir değer seçmişse tek bir testte sahte "pass"
  // alınabilir — gizli tarama bunu önler.
  {
    const ltiGate = $('ltiGate');
    let sweepTinvPass = state._tinvPass;
    let sweepLinPass = state._linPass;
    if (state.ast && state._tinvPass) {
      // 5 farklı T0 ile dene; herhangi biri fail olursa LTI değil say
      const sweepT0s = [0.37, 1.13, 1.97, 2.71, 3.43];
      const inSmpSweep = state.tinvInput === 'x1' ? x1Smp : x2Smp;
      const yRawAll = applySystem(axis, inSmpSweep, { x1: x1Smp, x2: x2Smp });
      const yRawSmpAll = makeSampler(axis.t, yRawAll);
      for (const T0s of sweepT0s) {
        const xDelS = new Float64Array(axis.N);
        for (let i = 0; i < axis.N; i++) xDelS[i] = inSmpSweep(axis.t[i] - T0s);
        const yAs = applySystem(axis, makeSampler(axis.t, xDelS), { x1: x1Smp, x2: x2Smp });
        let n = 0, d = 0, cnt = 0;
        const g = Math.abs(T0s) + 5 * axis.dt;
        for (let i = 0; i < axis.N; i++) {
          if (axis.t[i] < axis.t0 + g || axis.t[i] > axis.t1 - g) continue;
          const yBi = yRawSmpAll(axis.t[i] - T0s);
          const dd = yAs[i] - yBi;
          n += dd * dd; d += yAs[i] * yAs[i]; cnt++;
        }
        const r = cnt > 5 ? Math.sqrt(n / Math.max(d, 1e-12)) : 0;
        if (r >= 0.05) { sweepTinvPass = false; break; }
      }
    }
    // Doğrusallık için de (a,b) çiftlerinden bağımsız küçük tarama
    if (state.ast && state._linPass) {
      const trials = [[1, 1], [2.3, -1.1], [-0.7, 1.7]];
      const Tx1 = applySystem(axis, x1Smp, { x1: x1Smp, x2: x2Smp });
      const Tx2 = applySystem(axis, x2Smp, { x1: x1Smp, x2: x2Smp });
      for (const [a, b] of trials) {
        const comb = new Float64Array(axis.N);
        for (let i = 0; i < axis.N; i++) comb[i] = a * x1[i] + b * x2[i];
        const Tcomb = applySystem(axis, makeSampler(axis.t, comb), { x1: x1Smp, x2: x2Smp });
        let n = 0, d = 0;
        for (let i = 0; i < axis.N; i++) {
          const exp = a * Tx1[i] + b * Tx2[i];
          const dd = Tcomb[i] - exp;
          n += dd * dd; d += Tcomb[i] * Tcomb[i];
        }
        const r = Math.sqrt(n / Math.max(d, 1e-12));
        if (r >= 0.05) { sweepLinPass = false; break; }
      }
    }
    const isLTI = sweepLinPass && sweepTinvPass;
    if (!isLTI) {
      ltiGate.className = 'verdict fail';
      const why = [];
      if (!sweepLinPass) why.push(__L('doğrusal değil','non-linear'));
      if (!sweepTinvPass) why.push(__L('zamanla değişen','time-varying'));
      const noteSweep = (state._linPass && !sweepLinPass) || (state._tinvPass && !sweepTinvPass)
        ? ' <em style=\"color:var(--color-marker);\">' + __L('(gizli tarama farklı a/b/T₀ değerlerinde fail buldu — gösterilen slider değeri tesadüfen geçmiş.)','(A hidden sweep found failures at different a/b/T₀ values — the displayed slider value happened to pass.)') + '</em>'
        : '';
      ltiGate.innerHTML = `<strong>${__L('LTI değil ✗','Not LTI ✗')}</strong> <span>${__L('Sistem','The system is marked as')} ${why.join(__L(' ve ',' and '))} ${__L('olarak işaretlendi — h(t) tanımlı değildir.','— h(t) is not defined.')}${noteSweep}</span>`;
      const e1 = prepCv($('impInCv'));
      drawAxes(e1.ctx, e1.w, e1.h, axis.t0, axis.t1, -1, 1);
      const e2 = prepCv($('impOutCv'));
      drawAxes(e2.ctx, e2.w, e2.h, axis.t0, axis.t1, -1, 1);
    } else {
      ltiGate.className = 'verdict pass';
      ltiGate.innerHTML = `<strong>LTI ✓</strong> <span>${__L('Sistem hem doğrusal hem zamanla değişmez. Aşağıdaki h(t), bu sistemin <em>impuls cevabı</em>dır; her giriş için y = x ∗ h olarak hesaplanır.','The system is both linear and time-invariant. The h(t) shown below is the impulse response of this system; for each input y = x ∗ h is computed.')}</span>`;
      const tH = state.impT;
      const eps = Math.max(axis.dt * 1.5, 0.05);
      const xImp = new Float64Array(axis.N);
      for (let i = 0; i < axis.N; i++) {
        const r = Math.abs(axis.t[i] - tH);
        xImp[i] = r >= eps ? 0 : (1 - r / eps) / eps;
      }
      const impSmp = makeSampler(axis.t, xImp);
      const hOut = applySystem(axis, impSmp, { x1: x1Smp, x2: x2Smp });
      plotOne($('impInCv'), axis, xImp, cX);
      plotOne($('impOutCv'), axis, hOut, cY);
    }
  }
}

/* =====================================================
   10) ÖZELLİK SEZGİSEL TESTLERİ (AST tabanlı)
   ===================================================== */

// Belleksizlik: x(...) çağrılarının argümanı t mi (sadece t)?
function isMemoryless(node) {
  if (!node) return null;
  let memless = true;
  let saw = false;
  function visit(n) {
    if (!n) return;
    if (n.kind === 'call' && (n.name === 'x' || n.name === 'x1' || n.name === 'x_1' || n.name === 'x2' || n.name === 'x_2')) {
      saw = true;
      // argüman tam olarak 't' midi?
      const a = n.args[0];
      if (!(a && a.kind === 'var' && a.name === 't')) memless = false;
    }
    if (n.kind === 'binop') { visit(n.l); visit(n.r); }
    if (n.kind === 'unary') visit(n.e);
    if (n.kind === 'call') n.args.forEach(visit);
  }
  visit(node);
  if (!saw) return true; // sabit sistem — belleksiz sayılabilir
  return memless;
}

// Nedensellik: x(t+a) tipinde gelecek erişim var mı? (a sabit negatif veya tersinde gelecek)
function isCausal(node) {
  if (!node) return null;
  let causal = true;
  function visit(n) {
    if (!n) return;
    if (n.kind === 'call' && (n.name === 'x' || n.name === 'x1' || n.name === 'x_1' || n.name === 'x2' || n.name === 'x_2')) {
      const a = n.args[0];
      // a = t  -> nedensel
      // a = t - c, c >= 0  -> nedensel
      // a = t + c, c > 0  -> nedensel değil
      // a = -t veya x(2t) gibi -> belirsiz/sezgisel olarak nedensel değil
      if (a && a.kind === 'var' && a.name === 't') return;
      if (a && a.kind === 'binop' && (a.op === '+' || a.op === '-') &&
          a.l.kind === 'var' && a.l.name === 't' && a.r.kind === 'num') {
        if (a.op === '+' && a.r.val > 0) causal = false;
        if (a.op === '-' && a.r.val < 0) causal = false;
        return;
      }
      // x(2t), x(-t), x(t/2), ... — gelecek değerlere de bakar
      causal = false;
    }
    if (n.kind === 'binop') { visit(n.l); visit(n.r); }
    if (n.kind === 'unary') visit(n.e);
    if (n.kind === 'call') n.args.forEach(visit);
  }
  visit(node);
  return causal;
}

/* =====================================================
   11) Verdict yardımcısı
   ===================================================== */
function setVerdict(id, cls, msg) {
  const el = $(id);
  el.className = 'verdict ' + cls;
  // İlk strong'u koru
  const strongMap = {
    memVerdict: __L('Belleksiz mi?','Memoryless?'),
    cauVerdict: __L('Nedensel mi?','Causal?'),
    linVerdict: __L('Doğrusal mı?','Linear?'),
    tinvVerdict: __L('Zamanla değişmez mi?','Time-invariant?'),
    stabVerdict: __L('BIBO kararlı mı?','BIBO stable?'),
  };
  el.innerHTML = `<strong>${strongMap[id] || ''}</strong> <span>${msg}</span>`;
}

/* =====================================================
   12) Tema değişimi yeniden çizim
   ===================================================== */
const themeObs = new MutationObserver(() => requestAnimationFrame(redrawAll));
themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.addEventListener('resize', () => requestAnimationFrame(redrawAll));

/* =====================================================
   13) Başlat
   ===================================================== */
setExpr($('sysExpr').value);
// İlk çizim — KaTeX yüklü değilse de çalışsın
requestAnimationFrame(() => requestAnimationFrame(redrawAll));
