/* ============================================================
   DOPPLER RADAR — Hız Tespiti Simülasyonu
   ============================================================
   Sinyal işleme zinciri:
     TX (taşıyıcı f_c) → Hedeften saçılma → RX (f_c + f_d)
     → I/Q karıştırma (mixer)   ⇒ baseband Doppler at f_d
     → Slow-time örnekleme (her PRI)
     → (opsiyonel MTI)
     → Hann pencere + FFT  ⇒ tepe → hız tahmini
============================================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
(() => {
  // ---------- Fizik sabitleri ----------
  const C_LIGHT = 3e8;                  // m/s

  // ---------- Canvas yardımcıları ----------
  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  function cssColor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const cvScene = $('cvScene'), cvDop = $('cvDoppler');
  const cvTx = $('cvTx'),       cvRx = $('cvRx');
  const cvWf = $('cvWaterfall');

  let ctxScene, ctxDop, ctxTx, ctxRx, ctxWf;
  function refit() {
    ctxScene = fitCanvas(cvScene);
    ctxDop   = fitCanvas(cvDop);
    ctxTx    = fitCanvas(cvTx);
    ctxRx    = fitCanvas(cvRx);
    ctxWf    = fitCanvas(cvWf);
  }
  refit();
  window.addEventListener('resize', refit);

  // Read-outs
  const out = {
    range:   $('rdRange'),
    rangeE:  $('rdRangeEst'),
    dR:      $('rdDR'),
    vr:      $('rdVr'),
    ang:     $('rdAng'),
    cos:     $('rdCos'),
    fd:      $('rdFd'),
    vest:    $('rdVest'),
    fdTrue:  $('rdFdTrue'),
    err:     $('rdErr'),
    lam:     $('rdLam'),
    vmax:    $('rdVmax'),
  };

  // ---------- Kontrol değerleri ----------
  const ui = {
    vSpd:    $('vSpd'),    vSpdVal: $('vSpdVal'),
    vHdg:    $('vHdg'),    vHdgVal: $('vHdgVal'),
    fc:      $('fc'),      fcVal:   $('fcVal'),
    prf:     $('prf'),     prfVal:  $('prfVal'),
    rmax:    $('rmax'),    rmaxVal: $('rmaxVal'),
    snr:     $('snr'),     snrVal:  $('snrVal'),
    noiseless: $('noiseless'),
    clutterOn: $('clutterOn'),
    cluLvl:  $('cluLvl'),  cluVal:  $('cluVal'),
    mti:     $('mti'),
    trail:   $('trail'),
    btnReset: $('btnResetPlane'),
    btnPause: $('btnPause'),
  };

  const P = {
    // Uçak (sahne metre cinsinden; sahne tipik 0..maxR boyutunda)
    plane: { x: 2500, y: 1500, spd: 100, hdg: 45 * Math.PI/180 },
    // Radar
    radar: { x: 0,    y: 0 },
    fc:   2.0e9,   // Hz
    prf:  4000,    // Hz
    rmaxM: 8000,   // metre (görüntü kapsama)
    // Kanal
    snrDb: 5,
    noiseless: false,
    clutter: true,
    cluDb: 10,     // hedef üstüne dB
    mti: false,
    trail: [],
    paused: false,
  };

  // Sahne metre↔piksel ölçek (her çizimde güncellenir)
  let sceneScale = 0.1; // px / m

  // ---------- Kontrol senkronu ----------
  function refreshLabels() {
    ui.vSpdVal.textContent = (+ui.vSpd.value).toFixed(0);
    ui.vHdgVal.textContent = (+ui.vHdg.value).toFixed(0);
    ui.fcVal.textContent   = (+ui.fc.value).toFixed(1);
    ui.prfVal.textContent  = (+ui.prf.value).toFixed(0);
    ui.rmaxVal.textContent = (+ui.rmax.value).toFixed(1);
    ui.snrVal.textContent  = ui.noiseless.checked ? '∞'
                              : ((+ui.snr.value >= 0 ? '+' : '') + (+ui.snr.value).toFixed(0));
    ui.cluVal.textContent  = ((+ui.cluLvl.value >= 0 ? '+' : '') + (+ui.cluLvl.value).toFixed(0));
    ui.snr.disabled = ui.noiseless.checked;
    ui.cluLvl.disabled = !ui.clutterOn.checked;
  }
  function pullUI() {
    P.plane.spd = +ui.vSpd.value;
    P.plane.hdg = (+ui.vHdg.value) * Math.PI / 180;
    P.fc        = (+ui.fc.value) * 1e9;
    P.prf       = +ui.prf.value;
    P.rmaxM     = (+ui.rmax.value) * 1000;
    P.snrDb     = +ui.snr.value;
    P.noiseless = ui.noiseless.checked;
    P.clutter   = ui.clutterOn.checked;
    P.cluDb     = +ui.cluLvl.value;
    P.mti       = ui.mti.checked;
    refreshLabels();
  }
  [
    ui.vSpd, ui.vHdg, ui.fc, ui.prf, ui.rmax, ui.snr, ui.cluLvl,
    ui.noiseless, ui.clutterOn, ui.mti, ui.trail
  ].forEach(el => el.addEventListener('input', pullUI));

  ui.btnReset.addEventListener('click', () => {
    P.plane.x = 2500; P.plane.y = 1500;
    P.plane.spd = 100; P.plane.hdg = 45 * Math.PI / 180;
    ui.vSpd.value = 100; ui.vHdg.value = 45;
    P.trail.length = 0;
    pullUI();
  });
  ui.btnPause.addEventListener('click', () => {
    P.paused = !P.paused;
    ui.btnPause.textContent = P.paused ? '▶ Devam' : '⏸ Duraklat';
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      ui.btnPause.click();
    }
  });

  // ---------- Sahne etkileşim ----------
  // Sol tık → uçağın burun yönünü tıklanan noktaya çevir
  // Radar üzerine basılı sürükleme → radarı taşı
  let draggingRadar = false;
  cvScene.addEventListener('mousedown', (e) => {
    const { mx, my } = mouseMeters(e);
    const rx = P.radar.x, ry = P.radar.y;
    const distM = Math.hypot(mx - rx, my - ry);
    // 22 px'lik tıklama tampon → metreye çevir
    if (distM * sceneScale < 22) {
      draggingRadar = true;
      return;
    }
    // Yön ata: tıklanan noktaya uçağın burnunu çevir
    const dx = mx - P.plane.x;
    const dy = my - P.plane.y;
    P.plane.hdg = Math.atan2(dy, dx);
    ui.vHdg.value = ((P.plane.hdg * 180 / Math.PI) + 360) % 360;
    refreshLabels();
  });
  window.addEventListener('mousemove', (e) => {
    if (!draggingRadar) return;
    const { mx, my } = mouseMeters(e);
    // Sahne içine sınırla (görsel kolaylık)
    P.radar.x = Math.max(-P.rmaxM, Math.min(P.rmaxM, mx));
    P.radar.y = Math.max(-P.rmaxM, Math.min(P.rmaxM, my));
  });
  window.addEventListener('mouseup', () => { draggingRadar = false; });

  function mouseMeters(e) {
    const r = cvScene.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    // sceneCenter ve scale en son çizimden alınır
    const w = r.width, h = r.height;
    const cx = w / 2, cy = h / 2;
    const mx = (px - cx) / sceneScale;
    const my = (py - cy) / sceneScale;
    return { mx, my };
  }

  // ---------- FFT (radix-2 Cooley-Tukey) ----------
  function fft(re, im) {
    const N = re.length;
    // bit reversal
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1;
      const tableStep = -2 * Math.PI / size;
      for (let i = 0; i < N; i += size) {
        for (let k = 0; k < half; k++) {
          const ang = tableStep * k;
          const wr = Math.cos(ang), wi = Math.sin(ang);
          const a = i + k, b = a + half;
          const tr = wr * re[b] - wi * im[b];
          const ti = wr * im[b] + wi * re[b];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr;        im[a] += ti;
        }
      }
    }
  }

  // Gauss rastgele (Box–Muller)
  function gauss() {
    let u1 = Math.random(), u2 = Math.random();
    if (u1 < 1e-12) u1 = 1e-12;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ---------- Slow-time tampon: her kareyi yeni darbe gibi düşün ----------
  // N seçimi → bütünleşme kazancı: 10·log10(N·3/8) (Hann pencere için)
  // N=512 ⇒ ~23 dB; -15 dB SNR'da tespit marjinal, -30 dB'de net başarısızlık.
  const N = 512;                     // FFT boyu
  const slowI = new Float32Array(N); // I bileşeni
  const slowQ = new Float32Array(N); // Q bileşeni
  let slowPhase = 0;                 // önceki kareden devralınan faz
  // Waterfall geçmişi
  const WF_LINES = 90;
  const wfHist = []; // her satır: |spectrum| (uzunluk N)

  // Spektrum dizi tamponu
  const specRe = new Float32Array(N);
  const specIm = new Float32Array(N);

  // Mevcut Doppler durumu (paylaşılan)
  const state = {
    fdTrue: 0, fdMeas: 0,
    R: 0, Rest: 0, dR: 150,
    vr: 0, ang: 0,
    snrLin: 1, peakDb: 0, noiseFloorDb: 0,
    detected: true,
  };

  // Sabit darbe genişliği (pedagoji için): 1 µs → menzil çözünürlüğü 150 m
  const PULSE_WIDTH = 1e-6;

  // ---------- Doppler/RX hesaplama (her kare bir tam slow-time bloğu üretiyoruz) ----------
  function computeSlowTime() {
    // Anlık geometri
    const dx = P.plane.x - P.radar.x;
    const dy = P.plane.y - P.radar.y;
    const R  = Math.hypot(dx, dy);
    state.R = R;
    // LOS birim vektör (radardan hedefe)
    const ux = R > 1e-3 ? dx / R : 1, uy = R > 1e-3 ? dy / R : 0;
    // Hız vektörü (uçak burun yönüne göre)
    const vx = P.plane.spd * Math.cos(P.plane.hdg);
    const vy = P.plane.spd * Math.sin(P.plane.hdg);
    // Radyal hız (uzaklaşma negatif Doppler ile temsil edilebilir; klasik tanım radara doğru = pozitif fd)
    // v_r = -v·u  → radara yaklaşma pozitif
    const vr = -(vx * ux + vy * uy);
    state.vr = vr;

    const lam = C_LIGHT / P.fc;
    const fdTrue = 2 * vr / lam;   // Hz
    state.fdTrue = fdTrue;
    state.ang = Math.atan2(uy, ux);

    // Slow-time örnek hızı = PRF
    const Ts = 1 / P.prf;

    // Hedef genlik (basit: 1/R^2 etkisi)
    const A = 1.0 / (1 + (R / 2000) ** 2);

    // SNR'a göre gürültü gücü ayarı
    // Hedef gücü = A^2/2; sigma_n^2 = signal_power / SNR_linear
    const sigP = (A * A) / 2;
    let noiseStd;
    if (P.noiseless) noiseStd = 0;
    else {
      const snrLin = Math.pow(10, P.snrDb / 10);
      noiseStd = Math.sqrt(sigP / snrLin / 2); // /2 → I ve Q ayrı bağımsız
    }
    state.snrLin = P.noiseless ? Infinity : Math.pow(10, P.snrDb / 10);

    // Clutter genliği (hedef gücünün cluDb fazlası)
    let cluA = 0;
    if (P.clutter) {
      const cluPow = sigP * Math.pow(10, P.cluDb / 10);
      cluA = Math.sqrt(2 * cluPow); // |clutter cos| RMS ≈ A/√2 → A=√(2P)
    }
    // Clutter küçük rastgele Doppler dağılımı (yer rüzgârı vs.): σ ≈ 5 Hz
    const cluSigma = 5;

    // Slow-time'da Doppler kompleks fazor: e^{j 2π fd n Ts} + clutter + gürültü
    const w = 2 * Math.PI * fdTrue * Ts;

    for (let n = 0; n < N; n++) {
      // Hedef baseband
      const ph = slowPhase + w * n;
      let I = A * Math.cos(ph);
      let Q = A * Math.sin(ph);

      // Clutter (dar bant, sıfır-Doppler etrafı)
      if (cluA > 0) {
        // küçük rastgele faz / küçük rastgele frekans modülasyonu
        const cluPh = 2 * Math.PI * (cluSigma * gauss() * n * Ts);
        I += cluA * Math.cos(cluPh);
        Q += cluA * Math.sin(cluPh);
      }

      // Gürültü
      if (noiseStd > 0) {
        I += noiseStd * gauss();
        Q += noiseStd * gauss();
      }

      slowI[n] = I;
      slowQ[n] = Q;
    }
    // Sonraki blok için faz devamlılığı
    slowPhase = (slowPhase + w * N) % (2 * Math.PI);

    // MTI: y[n] = x[n] - x[n-1]
    if (P.mti) {
      for (let n = N - 1; n > 0; n--) {
        slowI[n] -= slowI[n - 1];
        slowQ[n] -= slowQ[n - 1];
      }
      slowI[0] = 0; slowQ[0] = 0;
    }

    // Hann pencere + FFT
    for (let n = 0; n < N; n++) {
      const w_ = 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
      specRe[n] = slowI[n] * w_;
      specIm[n] = slowQ[n] * w_;
    }
    fft(specRe, specIm);

    // |X|
    const mag = new Float32Array(N);
    let peakBin = 0, peakVal = -Infinity;
    // MTI sonrası DC bin'i tepe aday olarak değerlendirmemek için clutter+MTI durumunda
    // sıfır-Doppler bölgesini biraz dışla; aksi halde tepe DC'ye sıkışabilir.
    const skipDcBins = (P.clutter && !P.mti) ? 6 : 0;
    for (let k = 0; k < N; k++) {
      const m = Math.hypot(specRe[k], specIm[k]);
      mag[k] = m;
      // Pozitif ve negatif sıfır-Doppler komşusunu hariç tut
      const kShift = (k >= N / 2) ? (k - N) : k;
      if (Math.abs(kShift) < skipDcBins) continue;
      if (m > peakVal) { peakVal = m; peakBin = k; }
    }

    // Gürültü tabanını medyan ile tahmin et
    const sorted = Float32Array.from(mag);
    sorted.sort();
    const noiseFloor = sorted[Math.floor(N * 0.5)] + 1e-12;
    state.noiseFloorDb = 20 * Math.log10(noiseFloor);
    state.peakDb = 20 * Math.log10(peakVal + 1e-12);

    // CFAR-benzeri eşik: tepe, gürültü tabanından en az ~9 dB üstte olmalı
    const peakOverNoiseDb = state.peakDb - state.noiseFloorDb;
    state.detected = peakOverNoiseDb >= 9;

    // FFT bin → frekans
    const fdBin = (peakBin >= N / 2) ? (peakBin - N) : peakBin;
    state.fdMeas = state.detected ? (fdBin * (P.prf / N)) : NaN;

    // ----- Menzil tahmini -----
    // Pulse genişliği τ_p → menzil çözünürlüğü Δr = c τ_p / 2
    state.dR = (C_LIGHT * PULSE_WIDTH) / 2;
    // CRB benzeri menzil hatası: σ_R ≈ Δr / sqrt(2·SNR_eff·N)
    const snrLinNow = P.noiseless ? 1e6 : Math.max(1e-4, Math.pow(10, P.snrDb / 10));
    const snrEff = snrLinNow * N;          // bütünleşme kazancı
    const sigR = state.dR / Math.sqrt(2 * snrEff);
    if (state.detected) {
      state.Rest = state.R + gauss() * sigR;
    } else {
      state.Rest = NaN;
    }

    return mag;
  }

  // ---------- Sahne çizimi ----------
  function drawScene() {
    const ctx = ctxScene;
    const r = cvScene.getBoundingClientRect();
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);

    // sceneScale: P.rmaxM tüm yarıçapı kapsasın (genel görüntü için 0.45·min(W,H))
    sceneScale = (0.45 * Math.min(W, H)) / P.rmaxM;
    const cx = W / 2, cy = H / 2;
    const toPx = (mx, my) => [cx + mx * sceneScale, cy + my * sceneScale];

    const isLight = document.body.classList.contains('light-theme');
    const gridColor = isLight ? 'rgba(40,70,170,0.18)' : 'rgba(100,160,255,0.12)';
    const axisColor = isLight ? 'rgba(40,70,170,0.45)' : 'rgba(180,200,255,0.30)';

    // Izgara
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const gridStep = 1000; // metre
    for (let g = -P.rmaxM; g <= P.rmaxM; g += gridStep) {
      const [x1, y1] = toPx(g, -P.rmaxM);
      const [x2, y2] = toPx(g,  P.rmaxM);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toPx(-P.rmaxM, g);
      const [x4, y4] = toPx( P.rmaxM, g);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Eksen
    ctx.strokeStyle = axisColor;
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.stroke();

    // Menzil halkaları (1, 2, 4, 8 km gibi)
    const ringColor = isLight ? 'rgba(168,67,10,0.4)' : 'rgba(255,140,66,0.32)';
    ctx.strokeStyle = ringColor;
    ctx.setLineDash([4, 6]);
    ctx.font = "11px 'Fira Code', monospace";
    ctx.fillStyle = ringColor;
    const [rxPx, ryPx] = toPx(P.radar.x, P.radar.y);
    const targets = [1000, 2000, 4000, 8000, 16000, 24000].filter(d => d <= P.rmaxM * 1.05);
    for (const d of targets) {
      ctx.beginPath();
      ctx.arc(rxPx, ryPx, d * sceneScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${(d/1000)} km`, rxPx + d * sceneScale + 4, ryPx - 2);
    }
    ctx.setLineDash([]);

    // Yayılan pulse halkaları (animasyon)
    drawPulses(ctx, rxPx, ryPx);

    // LOS çizgisi radar→uçak
    const [pxPx, pyPx] = toPx(P.plane.x, P.plane.y);
    ctx.strokeStyle = isLight ? 'rgba(176,30,106,0.5)' : 'rgba(255,79,154,0.45)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(rxPx, ryPx); ctx.lineTo(pxPx, pyPx); ctx.stroke();
    ctx.setLineDash([]);

    // Trail
    if (P.trail.length > 1 && ui.trail.checked) {
      ctx.strokeStyle = isLight ? 'rgba(14,110,46,0.5)' : 'rgba(57,255,133,0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < P.trail.length; i++) {
        const [tx, ty] = toPx(P.trail[i].x, P.trail[i].y);
        if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    }

    // Uçak (üstten görünüş, üçgen)
    drawPlane(ctx, pxPx, pyPx, P.plane.hdg);

    // Yön oku (burnundan çıkan ok)
    drawHeadingArrow(ctx, pxPx, pyPx, P.plane.hdg);

    // Radar üçgeni / kule
    drawRadar(ctx, rxPx, ryPx);

    // Doppler değeri overlay
    ctx.fillStyle = isLight ? 'rgba(13,18,38,0.85)' : 'rgba(226,230,240,0.85)';
    ctx.font = "12px 'Fira Code', monospace";
    ctx.fillText(`R = ${(state.R/1000).toFixed(2)} km`, 10, 18);
    ctx.fillText(`v_r = ${state.vr.toFixed(1)} m/s`, 10, 34);
    ctx.fillText(`f_d = ${state.fdTrue.toFixed(1)} Hz`, 10, 50);
  }

  // Yayılan dalgalı puls halkaları
  const pulses = [];
  let lastPulseAt = 0;
  function spawnPulse(now) {
    pulses.push({ born: now, radius: 0, returning: false });
  }
  function drawPulses(ctx, rxPx, ryPx) {
    const now = performance.now();
    // 600 ms'de bir yeni puls
    if (now - lastPulseAt > 600 && !P.paused) {
      spawnPulse(now);
      lastPulseAt = now;
    }
    const isLight = document.body.classList.contains('light-theme');
    const txCol = isLight ? 'rgba(20,140,80,'  : 'rgba(57,255,133,';
    const rxCol = isLight ? 'rgba(180,40,40,'  : 'rgba(255,79,154,';

    // Sahne genelinde 2 saniyede menzilin tamamını gezsin (animasyon — fiziksel ışık hızı değil)
    const ringSpd = (P.rmaxM * 1.1) / 1.6;   // m/s görsel
    const planeR = state.R;

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const age = (now - p.born) / 1000; // s

      const rMeters = ringSpd * age;
      let alpha, color, drawR;
      if (!p.returning) {
        // Gidiş halkası
        if (rMeters >= planeR) {
          p.returning = true; p.born = now;
        }
        drawR = Math.min(rMeters, planeR);
        alpha = Math.max(0, 0.55 - age * 0.18);
        color = txCol;
      } else {
        // Dönüş — küçülerek geri gelen
        const back = planeR - ringSpd * age;
        if (back <= 0) { pulses.splice(i, 1); continue; }
        drawR = back;
        alpha = Math.max(0, 0.7 - age * 0.18);
        color = rxCol;
      }
      ctx.strokeStyle = color + alpha.toFixed(3) + ')';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(rxPx, ryPx, drawR * sceneScale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlane(ctx, px, py, hdg) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(hdg);
    const isLight = document.body.classList.contains('light-theme');
    const body = isLight ? '#0e6e2e' : '#39ff85';
    ctx.fillStyle = body;
    ctx.strokeStyle = isLight ? 'rgba(13,18,38,0.7)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    // Üstten görünüş — uçak şekli
    ctx.beginPath();
    // gövde
    ctx.moveTo(16, 0);
    ctx.lineTo(-6, 4);
    ctx.lineTo(-12, 4);
    ctx.lineTo(-12, -4);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // kanatlar
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-6, 14);
    ctx.lineTo(-10, 14);
    ctx.lineTo(-8, 2);
    ctx.lineTo(-8, -2);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-6, -14);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // kuyruk
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-12, 5);
    ctx.lineTo(-14, 5);
    ctx.lineTo(-14, -5);
    ctx.lineTo(-12, -5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawHeadingArrow(ctx, px, py, hdg) {
    const len = 40;
    const tipX = px + len * Math.cos(hdg);
    const tipY = py + len * Math.sin(hdg);
    const isLight = document.body.classList.contains('light-theme');
    ctx.strokeStyle = isLight ? '#a8430a' : '#ff8c42';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 18 * Math.cos(hdg), py + 18 * Math.sin(hdg));
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // ok başı
    const a = hdg, ah = Math.PI / 6, hl = 8;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - hl * Math.cos(a - ah), tipY - hl * Math.sin(a - ah));
    ctx.lineTo(tipX - hl * Math.cos(a + ah), tipY - hl * Math.sin(a + ah));
    ctx.closePath();
    ctx.fill();
  }

  function drawRadar(ctx, px, py) {
    const isLight = document.body.classList.contains('light-theme');
    // taban
    ctx.fillStyle = isLight ? 'rgba(168,67,10,0.85)' : 'rgba(255,140,66,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fill();
    // çanak hattı
    ctx.strokeStyle = isLight ? '#a8430a' : '#ff8c42';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 14, py + 8);
    ctx.lineTo(px + 14, py + 8);
    ctx.moveTo(px, py + 8);
    ctx.lineTo(px, py - 6);
    ctx.stroke();
    // halka
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.stroke();
    // etiket
    ctx.fillStyle = isLight ? '#0d1226' : '#e2e6f0';
    ctx.font = "11px 'Fira Code', monospace";
    ctx.fillText('RADAR', px + 18, py + 4);
  }

  // ---------- Doppler spektrumu çizimi ----------
  function drawDopplerSpectrum(mag) {
    const ctx = ctxDop;
    const r = cvDop.getBoundingClientRect();
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);
    const isLight = document.body.classList.contains('light-theme');

    const padL = 56, padR = 38, padT = 18, padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // fftshift indeksleme
    const half = N / 2;
    const shifted = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      shifted[k] = mag[(k + half) % N];
    }
    // dB normalize
    let mx = 1e-12;
    for (let k = 0; k < N; k++) if (shifted[k] > mx) mx = shifted[k];
    const db = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      db[k] = 20 * Math.log10((shifted[k] + 1e-12) / mx);
    }
    const dbMin = -60, dbMax = 0;
    const fmin = -P.prf / 2, fmax = P.prf / 2;

    // Izgara
    ctx.strokeStyle = isLight ? 'rgba(40,70,170,0.18)' : 'rgba(100,160,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = padT + (i / 6) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    for (let i = 0; i <= 10; i++) {
      const x = padL + (i / 10) * plotW;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
    // Y ekseni etiketleri
    ctx.fillStyle = isLight ? '#3a4060' : '#7a82a6';
    ctx.font = "10px 'Fira Code', monospace";
    ctx.textAlign = 'right';
    for (let i = 0; i <= 6; i++) {
      const y = padT + (i / 6) * plotH;
      const d = dbMax - (i / 6) * (dbMax - dbMin);
      ctx.fillText(`${d.toFixed(0)} dB`, padL - 6, y + 3);
    }
    // X ekseni etiketleri (Hz)
    const NT2 = 8;
    for (let i = 0; i <= NT2; i++) {
      const x = padL + (i / NT2) * plotW;
      const f = fmin + (i / NT2) * (fmax - fmin);
      ctx.textAlign = (i === 0) ? 'left' : (i === NT2) ? 'right' : 'center';
      ctx.fillText(`${f.toFixed(0)}`, x, padT + plotH + 14);
    }
    ctx.textAlign = 'center';
    ctx.fillText('Doppler frekansı (Hz)', padL + plotW / 2, H - 6);
    ctx.save();
    ctx.translate(12, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Genlik (dB)', 0, 0);
    ctx.restore();

    // Sıfır Doppler çizgisi
    ctx.strokeStyle = isLight ? 'rgba(40,70,170,0.4)' : 'rgba(180,200,255,0.3)';
    ctx.setLineDash([4, 4]);
    const x0 = padL + plotW / 2;
    ctx.beginPath(); ctx.moveTo(x0, padT); ctx.lineTo(x0, padT + plotH); ctx.stroke();
    ctx.setLineDash([]);

    // Belirsiz hız aralığı işareti
    // (zaten görüntü ekseni −PRF/2 .. +PRF/2)

    // Spektrum doldurma + çizgi
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, isLight ? 'rgba(168,67,10,0.55)' : 'rgba(255,140,66,0.55)');
    grad.addColorStop(1, isLight ? 'rgba(168,67,10,0.05)' : 'rgba(255,140,66,0.05)');
    ctx.fillStyle = grad;
    ctx.strokeStyle = isLight ? '#a8430a' : '#ff8c42';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const x = padL + (k / (N - 1)) * plotW;
      let v = (db[k] - dbMin) / (dbMax - dbMin);
      v = Math.max(0, Math.min(1, v));
      const y = padT + (1 - v) * plotH;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.lineTo(padL, padT + plotH);
    ctx.closePath();
    ctx.fill();
    // çizgi
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const x = padL + (k / (N - 1)) * plotW;
      let v = (db[k] - dbMin) / (dbMax - dbMin);
      v = Math.max(0, Math.min(1, v));
      const y = padT + (1 - v) * plotH;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Tepe çizgisi (ölçülen fd) — sadece detection varsa
    if (state.detected && isFinite(state.fdMeas)) {
      const fdFrac = (state.fdMeas - fmin) / (fmax - fmin);
      const xPk = padL + fdFrac * plotW;
      ctx.strokeStyle = isLight ? '#0e6e2e' : '#39ff85';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(xPk, padT); ctx.lineTo(xPk, padT + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isLight ? '#0e6e2e' : '#39ff85';
      ctx.textAlign = 'left';
      ctx.fillText(`f̂_d = ${state.fdMeas.toFixed(1)} Hz`, xPk + 4, padT + 14);
    } else {
      ctx.fillStyle = isLight ? '#b01e6a' : '#ff4f9a';
      ctx.font = "11px 'Fira Code', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(_t({tr: '⚠ tepe gürültü tabanının altında — tespit yok', en: '⚠ peak below noise floor — no detection'}),
                   padL + plotW/2, padT + 14);
    }

    // Gerçek fd (referans)
    const fdtFrac = (state.fdTrue - fmin) / (fmax - fmin);
    if (fdtFrac >= 0 && fdtFrac <= 1) {
      const xTr = padL + fdtFrac * plotW;
      ctx.strokeStyle = isLight ? 'rgba(176,30,106,0.7)' : 'rgba(255,79,154,0.7)';
      ctx.setLineDash([1, 3]);
      ctx.beginPath(); ctx.moveTo(xTr, padT); ctx.lineTo(xTr, padT + plotH); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---------- TX & RX zaman çizgisi (görselleştirme için ölçek) ----------
  function drawTxRx() {
    // Doğrudan f_c'yi (GHz) çizemeyeceğimiz için
    // ekrandaki TX'i ~8 periyot olarak gösteren bir "scaled IF" kullanıyoruz.
    // Önemli olan TX↔RX arasındaki faz/frekans farkını sezdirmek.
    const rTx = cvTx.getBoundingClientRect();
    const rRx = cvRx.getBoundingClientRect();
    const isLight = document.body.classList.contains('light-theme');

    function frame(ctx, W, H, label) {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = isLight ? 'rgba(40,70,170,0.18)' : 'rgba(100,160,255,0.12)';
      ctx.lineWidth = 1;
      const midY = H / 2;
      ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
      ctx.fillStyle = isLight ? '#3a4060' : '#7a82a6';
      ctx.font = "10px 'Fira Code', monospace";
      ctx.fillText(label, 8, 14);
    }
    const Wt = rTx.width, Ht = rTx.height;
    const Wr = rRx.width, Hr = rRx.height;
    frame(ctxTx, Wt, Ht, 'TX:  cos(2π f_c t)');
    frame(ctxRx, Wr, Hr, 'RX:  A·cos(2π(f_c+f_d)(t-τ)) + n(t) + clutter');

    const Nshow = 600;
    const cyclesTx = 8;   // ekran içinde gösterilen taşıyıcı döngüsü
    // RX'in TX'e göre küçük bir oransal frekans farkı olacak şekilde Doppler'ı abartıyoruz
    const fdRel = Math.tanh((state.fdTrue) / 500) * 0.55; // -0.55..0.55 normalize "kayma"
    const txCol = isLight ? '#2a3a9a' : '#7b8cff';
    const rxCol = isLight ? '#b01e6a' : '#ff4f9a';

    // TX (mavi)
    ctxTx.strokeStyle = txCol; ctxTx.lineWidth = 1.6;
    ctxTx.beginPath();
    for (let i = 0; i < Nshow; i++) {
      const x = (i / (Nshow - 1)) * Wt;
      const t = i / (Nshow - 1);
      const y = Ht / 2 - Math.sin(2 * Math.PI * cyclesTx * t) * (Ht * 0.35);
      if (i === 0) ctxTx.moveTo(x, y); else ctxTx.lineTo(x, y);
    }
    ctxTx.stroke();

    // RX (pembe) — frekans hafifçe değişmiş, gürültü & clutter eklenir
    let noiseAmp = 0;
    if (!P.noiseless) {
      const snrLin = Math.pow(10, P.snrDb / 10);
      noiseAmp = Math.min(1.0, 1 / Math.sqrt(Math.max(snrLin, 1e-3)));
    }
    const cluAmp = P.clutter ? Math.min(1.5, Math.pow(10, P.cluDb / 20) * 0.05) : 0;
    const recvAmp = 1 / (1 + (state.R / 4000) ** 2);

    ctxRx.strokeStyle = rxCol; ctxRx.lineWidth = 1.4;
    ctxRx.beginPath();
    for (let i = 0; i < Nshow; i++) {
      const x = (i / (Nshow - 1)) * Wr;
      const t = i / (Nshow - 1);
      const carrier = Math.sin(2 * Math.PI * (cyclesTx + fdRel) * t);
      const clu = cluAmp * 0.6 * Math.cos(2 * Math.PI * 0.3 * t + 0.7);
      const noise = noiseAmp * (Math.random() - 0.5) * 1.4;
      const y = Hr / 2 - (recvAmp * carrier + clu + noise) * (Hr * 0.32);
      if (i === 0) ctxRx.moveTo(x, y); else ctxRx.lineTo(x, y);
    }
    ctxRx.stroke();
  }

  // ---------- Waterfall (zaman-hız) ----------
  function pushWaterfall(mag) {
    // fftshift'li dB satırı
    const half = N / 2;
    const line = new Float32Array(N);
    let mx = 1e-12;
    for (let k = 0; k < N; k++) {
      const v = mag[(k + half) % N];
      line[k] = v;
      if (v > mx) mx = v;
    }
    for (let k = 0; k < N; k++) {
      line[k] = 20 * Math.log10((line[k] + 1e-12) / mx);
    }
    wfHist.push(line);
    while (wfHist.length > WF_LINES) wfHist.shift();
  }
  function drawWaterfall() {
    const ctx = ctxWf;
    const r = cvWf.getBoundingClientRect();
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);

    if (wfHist.length === 0) return;
    // padL/padR: sağdaki en uzun etiket "−2000 Hz" ~55 px, sol "geçmiş" ~40 px
    const padL = 48, padR = 8, padT = 16, padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const isLight = document.body.classList.contains('light-theme');

    const dbMin = -50, dbMax = 0;

    // ImageData ile hızlı çiz — putImageData transform'u yok sayar,
    // bu yüzden DPR'yi manuel uygulamak gerekir (aksi halde heatmap
    // canvas'ın sol-üst 1/dpr köşesine sıkışır).
    const dpr = window.devicePixelRatio || 1;
    const imgW = Math.max(1, Math.round(plotW * dpr));
    const imgH = Math.max(1, Math.round(plotH * dpr));
    const img = ctx.createImageData(imgW, imgH);
    const stepX = N / imgW;
    for (let row = 0; row < imgH; row++) {
      const histIdx = wfHist.length - 1 - Math.floor((row / imgH) * wfHist.length);
      const line = wfHist[Math.max(0, Math.min(wfHist.length - 1, histIdx))];
      for (let col = 0; col < imgW; col++) {
        const k = Math.min(N - 1, Math.floor(col * stepX));
        let v = (line[k] - dbMin) / (dbMax - dbMin);
        v = Math.max(0, Math.min(1, v));
        const [R, G, B] = viridis(v);
        const idx = (row * imgW + col) * 4;
        img.data[idx]   = R;
        img.data[idx+1] = G;
        img.data[idx+2] = B;
        img.data[idx+3] = 230;
      }
    }
    ctx.putImageData(img, Math.round(padL * dpr), Math.round(padT * dpr));

    // Çerçeve
    ctx.strokeStyle = isLight ? 'rgba(40,70,170,0.4)' : 'rgba(100,160,255,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(padL) + 0.5, Math.round(padT) + 0.5,
                   Math.round(plotW), Math.round(plotH));

    // X etiketleri (Doppler Hz) — canvas genişliğine dayalı, taşma olmaz
    ctx.fillStyle = isLight ? '#3a4060' : '#7a82a6';
    ctx.font = "10px 'Fira Code', monospace";
    const fmin = -P.prf / 2, fmax = P.prf / 2;
    const labelY = padT + plotH + 16;
    const NT = 6;
    for (let i = 0; i <= NT; i++) {
      const xPx = padL + (i / NT) * plotW;
      const f = fmin + (i / NT) * (fmax - fmin);
      const lbl = `${f.toFixed(0)} Hz`;
      ctx.textAlign = (i === 0) ? 'left' : (i === NT) ? 'right' : 'center';
      ctx.fillText(lbl, xPx, labelY);
    }
    // Sol yan etiketler (şimdi / geçmiş)
    ctx.textAlign = 'right';
    ctx.font = "9px 'Fira Code', monospace";
    ctx.fillText(_t({tr: 'şimdi', en: 'now'}),   padL - 5, padT + 10);
    ctx.fillText(_t({tr: 'geçmiş', en: 'past'}),  padL - 5, padT + plotH);

    // Sıfır Doppler çizgisi
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([4, 4]);
    const x0 = padL + plotW / 2;
    ctx.beginPath(); ctx.moveTo(x0, padT); ctx.lineTo(x0, padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Basit viridis-benzeri renk haritası
  function viridis(t) {
    // 0 → koyu mor, 0.5 → mavi-yeşil, 1 → sarı
    const c0 = [13, 8, 60];
    const c1 = [60, 30, 130];
    const c2 = [30, 110, 150];
    const c3 = [80, 200, 130];
    const c4 = [250, 230, 80];
    let a, b, f;
    if (t < 0.25)      { a = c0; b = c1; f = t / 0.25; }
    else if (t < 0.5)  { a = c1; b = c2; f = (t - 0.25) / 0.25; }
    else if (t < 0.75) { a = c2; b = c3; f = (t - 0.5) / 0.25; }
    else               { a = c3; b = c4; f = (t - 0.75) / 0.25; }
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ];
  }

  // ---------- Read-out güncelle ----------
  function updateReadouts() {
    out.range.textContent = `${(state.R/1000).toFixed(2)} km`;
    out.vr.textContent    = `${state.vr.toFixed(1)} m/s`;
    out.ang.textContent   = `${(state.ang * 180 / Math.PI).toFixed(1)} °`;
    // Aspect: v ile (hedef→radar) yönü arasındaki açının kosinüsü.
    // (hedef→radar) = −u; v·(−u) = −v·u = v_r  ⇒  cos(aspect) = v_r / |v|
    const aspectCos = (P.plane.spd > 0) ? (state.vr / P.plane.spd) : 0;
    out.cos.textContent = aspectCos.toFixed(3);

    if (state.detected) {
      out.fd.textContent    = `${state.fdMeas.toFixed(1)} Hz`;
      const vEst = (C_LIGHT * state.fdMeas) / (2 * P.fc);
      out.vest.textContent  = `${vEst.toFixed(1)} m/s`;
      const err = Math.abs(vEst - state.vr);
      const tag = err < 2 ? 'acc' : err < 8 ? 'warn' : 'err';
      out.err.className = 'val ' + tag;
      out.err.textContent = `Δv = ${err.toFixed(2)} m/s`;
      out.rangeE.textContent = `${(state.Rest/1000).toFixed(2)} km`;
      out.rangeE.className = 'val acc';
    } else {
      out.fd.textContent    = `— (yok)`;
      out.vest.textContent  = `tespit ✗`;
      out.err.className = 'val err';
      out.err.textContent = `gürültüye gömüldü`;
      out.rangeE.textContent = `— (yok)`;
      out.rangeE.className = 'val err';
    }
    out.fdTrue.textContent= `${state.fdTrue.toFixed(1)} Hz`;
    out.dR.textContent    = `${state.dR.toFixed(0)} m`;

    const lam = C_LIGHT / P.fc;
    out.lam.textContent  = `${(lam * 100).toFixed(2)} cm`;
    const vMaxAmb = (C_LIGHT * P.prf) / (4 * P.fc);
    out.vmax.textContent = `± ${vMaxAmb.toFixed(1)} m/s`;
  }

  // ---------- Ana animasyon döngüsü ----------
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (!P.paused) {
      // Uçak fiziği: konum + hız vektörü
      P.plane.x += P.plane.spd * Math.cos(P.plane.hdg) * dt;
      P.plane.y += P.plane.spd * Math.sin(P.plane.hdg) * dt;
      // Çok uzaklaşırsa karşı tarafa "wrap" (sahnede tutmak için)
      const lim = P.rmaxM * 1.1;
      if (Math.abs(P.plane.x) > lim) P.plane.x = -Math.sign(P.plane.x) * lim;
      if (Math.abs(P.plane.y) > lim) P.plane.y = -Math.sign(P.plane.y) * lim;

      // Trail
      P.trail.push({ x: P.plane.x, y: P.plane.y });
      if (P.trail.length > 240) P.trail.shift();
    }

    const mag = computeSlowTime();
    pushWaterfall(mag);

    drawScene();
    drawDopplerSpectrum(mag);
    drawTxRx();
    drawWaterfall();
    updateReadouts();

    requestAnimationFrame(loop);
  }

  pullUI();
  requestAnimationFrame(loop);
})();
