/* ============================================
   TEMEL SÜREKLİ İŞARETLER
   Periyodik & aperiyodik, Dirac, basamak,
   üstel, sinusoidal, sinc, gauss, ...
   ============================================ */

const _t = (o) => (window._t ? window._t(o) : (typeof o === "string" ? o : (o.tr || "")));
// ---------- Sinyal kütüphanesi ----------
// Her giriş: { id, name, sym, formula, desc, props, params, gen }
// props: { periodic, even, odd, energy, power, causal, bounded, T0(amp,w,freq) }
// params: { amp, width, shift, freq, sigma, alpha, periodic } -> görünen kontroller
const __i18n = (v) => (typeof v === 'string') ? v : ((window._t && window._t(v)) || v.tr || v.en || '');

/* Çalışma anı TR→EN ifade dönüştürücüsü.
 * Sinyal `props` değerleri TR olarak hesaplanır; EN sayfasında bu fonksiyon
 * sık kullanılan kalıpları İngilizceye çevirir. Yalnızca EN modunda etkindir. */
const __propI18n = (s) => {
  if (typeof s !== 'string') return s;
  if (window._lang !== 'en') return s;
  return s
    .replace(/\bzorlanmış\b/g, 'forced')
    .replace(/\borijinalin yarısı\b/g, 'half of the original')
    .replace(/\btepe ideal olarak\b/g, 'peak ideally')
    .replace(/\bimpulsler ideal\b/g, 'impulses ideal')
    .replace(/\biki yönlü\b/g, 'two-sided')
    .replace(/\biki taraflı\b/g, 'two-sided')
    .replace(/\bsönen yarı-periyodik\b/g, 'damped quasi-periodic')
    .replace(/\bfrekans zamanla değişir\b/g, 'frequency varies with time')
    .replace(/\bsadece\b/g, 'only')
    .replace(/\benerji sinyali\b/g, 'energy signal')
    .replace(/\bsaf salınım\b/g, 'pure oscillation')
    .replace(/\bsınırsız\b/g, 'unbounded')
    .replace(/\bsinüs integrali\b/g, 'sine integral')
    .replace(/\bbüyür\b/g, 'grows')
    .replace(/\bsonlu süreli pencere ile\b/g, 'with a finite-duration window')
    .replace(/\bdağılım\b/g, 'distribution')
    .replace(/\bkausal sürüm için\b/g, 'for the causal version')
    .replace(/\btanımsız\b/g, 'undefined')
    .replace(/\bdoublet dizisi\b/g, 'doublet series')
    .replace(/\bbasamak dizisi \(merdiven\)\b/g, 'staircase (step series)')
    .replace(/\bparabolik segmentler\b/g, 'parabolic segments')
    .replace(/\bkübik segmentler\b/g, 'cubic segments')
    .replace(/\bparça parça kuadratik \(kübik\)\b/g, 'piecewise quadratic (cubic)')
    .replace(/\brampa-trapez-rampa zinciri\b/g, 'ramp–trapezoid–ramp chain')
    .replace(/\bparçalı sürekli, lineer artan ortalamayla\b/g, 'piecewise continuous with a linearly increasing average')
    .replace(/\bparçalı: yarım periyot kosinüs zarfı \+ sabit kısım\b/g, 'piecewise: half-period cosine envelope + constant part')
    .replace(/\biki adımlı kare:\s*/g, 'two-step square: ')
    .replace(/\büçgen dalga \(kesintisiz\)\b/g, 'triangle wave (continuous)')
    .replace(/\bkare dalga\b/g, 'square wave')
    .replace(/\bperiyodik\b/g, 'periodic')
    .replace(/\bDirac taraklısı:\s*/g, 'Dirac comb: ')
    .replace(/\bsıçramaları\b/g, 'jumps')
    .replace(/\bsabit\b/g, 'constant')
    .replace(/\bdeğilse\b/g, 'otherwise')
    .replace(/\bpozitif yarımda, 0/g, 'on the positive half, $0$')
    .replace(/\bsıfır geçişlerinde işaret değişir\b/g, 'sign changes at zero crossings')
    .replace(/\bkesintili \(sıçramalı\):\s*/g, 'discontinuous (jumps): ')
    .replace(/\banalitik kapalı form\b/g, 'closed-form analytic')
    .replace(/\banlık frekans\b/g, 'instantaneous frequency')
    .replace(/\bFresnel integralleri\b/g, 'Fresnel integrals')
    .replace(/\bve\b/g, 'and')
    .replace(/\bevet\b/g, 'yes')
    .replace(/\bhayır\b/g, 'no')
    .replace(/\b ise\b/g, ' when')
    .replace(/\b için\b/g, ' for')
    .replace(/orijinalin/g, 'of the original');
};
// (radyan faz kaldırıldı; t₀ zaman kayması, sin/cos için aynı zamanda faz görevi görür)
const SIGNALS = [
  {
    id: 'dirac',
    name: { tr: 'Dirac Delta', en: 'Dirac Delta' },
    sym: 'A·δ(t − t₀)',
    formula: '$x(t) = A\\,\\delta(t - t_0)$',
    desc: { tr: '<strong>Genelleştirilmiş fonksiyon</strong> (dağılım). Klasik anlamda fonksiyon değildir, iki özelliği ile tanımlanır: $\\delta(t) = 0\\ (t \\neq 0)$ ve $\\int_{-\\infty}^{\\infty} \\delta(t)\\,dt = 1$. <strong>Eleme özelliği:</strong> $\\int f(t)\\delta(t-t_0)\\,dt = f(t_0)$. Simülasyonda dar bir üçgen ile yaklaşıklanır (alan ≈ $A$, dt yoğunluğuna bağlı tepe).', en: 'A <strong>generalised function</strong> (distribution). Not a function in the classical sense; it is defined by two properties: $\\delta(t) = 0\\ (t \\neq 0)$ and $\\int_{-\\infty}^{\\infty} \\delta(t)\\,dt = 1$. <strong>Sifting property:</strong> $\\int f(t)\\,\\delta(t-t_0)\\,dt = f(t_0)$. In the simulation it is approximated by a narrow triangle (area $\\approx A$, peak depending on the time step $dt$).' },
    use: ['amp', 'shift'],
    props: (p) => ({
      periodic: 'hayır',
      even: 'evet ($t_0 = 0$ için: $\\delta(-t) = \\delta(t)$)',
      odd: 'hayır',
      energySig: 'tanımsız (dağılım)', powerSig: 'tanımsız',
      causal: `${p.shift >= 0 ? 'evet' : 'hayır'} (sadece $t_0 \\geq 0$ ise)`,
      bounded: 'hayır (tepe ideal olarak $\\infty$)',
      integral: '$A\\,u(t-t_0)$',
      deriv: '$A\\,\\delta\'(t-t_0)$ (doublet)',
    }),
    gen(t, p, dt) {
      const eps = Math.max(dt * 1.5, 0.04);
      const te = t - p.shift;
      const r = Math.abs(te);
      if (r >= eps) return 0;
      return p.amp * (1 - r / eps) / eps;
    },
  },
  {
    id: 'step',
    name: { tr: 'Birim Basamak (Heaviside)', en: 'Unit Step (Heaviside)' },
    sym: 'A·u(t − t₀)',
    formula: '$x(t) = A\\,u(t - t_0) = \\begin{cases} A,& t \\geq t_0 \\\\ 0,& t < t_0 \\end{cases}$',
    desc: { tr: '<strong>Heaviside</strong> birim basamak: $t = t_0$\'da $0 \\to A$ sıçraması. <strong>Anahtarlama, devre tetiklemesi</strong> modelidir. Türevi Dirac deltasıdır: $\\frac{du}{dt} = \\delta(t)$. İntegrali rampadır.', en: 'The <strong>Heaviside</strong> unit step exhibits a $0 \\to A$ jump at $t = t_0$. It models <strong>switching and circuit triggering</strong>. Its derivative is the Dirac delta: $\\frac{du}{dt} = \\delta(t)$, and its integral is the ramp.' },
    use: ['amp', 'shift'],
    props: (p) => ({
      periodic: 'hayır',
      even: 'hayır', odd: 'hayır ($\\operatorname{sgn}/2 + 1/2$ ile ayrışır)',
      energySig: 'hayır ($E = \\infty$, $t \\geq t_0$\'da sabit)',
      powerSig: `evet ($P = A^2/2 = ${(p.amp*p.amp/2).toFixed(2)}$)`,
      causal: `${p.shift >= 0 ? 'evet' : 'hayır'} ($t_0 = ${p.shift.toFixed(2)}$)`,
      bounded: `evet ($|x| \\leq |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: 'rampa $r(t-t_0) = A(t-t_0)u(t-t_0)$',
      deriv: '$A\\,\\delta(t-t_0)$',
    }),
    gen(t, p) {
      return (t - p.shift) >= 0 ? p.amp : 0;
    },
  },
  {
    id: 'ramp',
    name: { tr: 'Rampa', en: 'Ramp' },
    sym: 'A·(t−t₀)·u(t−t₀)',
    formula: '$x(t) = A\\,(t - t_0)\\,u(t - t_0)$',
    desc: { tr: '<strong>Birim basamağın integrali.</strong> $t \\geq t_0$ için doğrusal artan; eğim $A$. Türevi: $r\'(t) = A\\,u(t-t_0)$. Pratik kullanım: doğrusal artan referans, sayaç sinyalleri, integratör çıkışı.', en: 'The integral of the unit step. For $t \\geq t_0$ it grows linearly with slope $A$. Its derivative is $r\'(t) = A\\,u(t-t_0)$. Typical uses include linearly increasing reference signals, counter signals, and integrator outputs.' },
    use: ['amp', 'shift'],
    props: (p) => ({
      periodic: 'hayır', even: 'hayır', odd: 'hayır',
      energySig: 'hayır ($E = \\infty$, kuadratik büyür)',
      powerSig: 'hayır ($P = \\infty$)',
      causal: `${p.shift >= 0 ? 'evet' : 'hayır'} ($t_0 = ${p.shift.toFixed(2)}$)`,
      bounded: 'hayır ($t \\to \\infty$\'da $x \\to \\infty$)',
      integral: '$\\frac{A}{2}(t-t_0)^2\\,u(t-t_0)$ (parabol)',
      deriv: '$A\\,u(t-t_0)$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      return te < 0 ? 0 : p.amp * te;
    },
  },
  {
    id: 'sgn',
    name: { tr: 'Signum (İşaret Fonksiyonu)', en: 'Signum (Sign Function)' },
    sym: 'A·sgn(t−t₀)',
    formula: '$x(t) = A\\,\\operatorname{sgn}(t - t_0) = \\begin{cases} +A,& t > t_0 \\\\ 0,& t = t_0 \\\\ -A,& t < t_0 \\end{cases}$',
    desc: { tr: 'Bir sayının işaretini veren fonksiyon. $\\operatorname{sgn}(t) = 2u(t) - 1$. <strong>Tek bir sinyaldir</strong> ($t_0 = 0$ için). Sıçrama büyüklüğü $2A$ olduğundan türevi $2A\\,\\delta(t-t_0)$.', en: 'A function returning the sign of its argument. $\\operatorname{sgn}(t) = 2u(t) - 1$. It is an <strong>odd</strong> signal (for $t_0 = 0$). Since the jump amplitude is $2A$, its derivative is $2A\\,\\delta(t-t_0)$.' },
    use: ['amp', 'shift'],
    props: (p) => ({
      periodic: 'hayır', even: 'hayır', odd: 'evet ($t_0 = 0$ ise)',
      energySig: 'hayır ($E = \\infty$)',
      powerSig: `evet ($P = A^2 = ${(p.amp*p.amp).toFixed(2)}$)`,
      causal: 'hayır (iki yönlü)',
      bounded: `evet ($|x| = |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: '$A\\,|t - t_0|$',
      deriv: '$2A\\,\\delta(t-t_0)$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      return te > 0 ? p.amp : (te < 0 ? -p.amp : 0);
    },
  },
  {
    id: 'rect',
    name: { tr: 'Dikdörtgen Darbe (Π)', en: 'Rectangular Pulse (Π)' },
    sym: 'A·rect((t−t₀)/T)',
    formula: '$x(t) = A\\,\\operatorname{rect}\\!\\left(\\dfrac{t - t_0}{T}\\right) = \\begin{cases} A,& |t-t_0| \\leq T/2 \\\\ 0,& \\text{aksi} \\end{cases}$',
    desc: { tr: 'Sonlu süreli, sabit genlikli <strong>aperiyodik</strong> darbe; süre $T$, merkez $t_0$. <strong>Fourier dönüşümü</strong>: $\\mathcal{F}\\{x\\}(\\Omega) = AT\\operatorname{sinc}(\\Omega T / 2) = AT\\cdot\\frac{\\sin(\\Omega T/2)}{\\Omega T/2}$ — sinc fonksiyonu. Örnekleme teoreminde ideal alçak-geçiren filtre frekans yanıtıdır.', en: 'A finite-duration, constant-amplitude <strong>aperiodic</strong> pulse of width $T$ centred at $t_0$. Its <strong>Fourier transform</strong> is $\\mathcal{F}\\{x\\}(\\Omega) = AT\\operatorname{sinc}(\\Omega T / 2) = AT\\cdot\\frac{\\sin(\\Omega T/2)}{\\Omega T/2}$ — the sinc function. It corresponds to the frequency response of the ideal low-pass filter in the sampling theorem.' },
    use: ['amp', 'width', 'shift'],
    props: (p) => ({
      periodic: 'hayır', even: 'evet ($t_0 = 0$ ise)', odd: 'hayır',
      energySig: `evet ($E = A^2 T = ${(p.amp*p.amp*p.width).toFixed(3)}$)`,
      powerSig: 'hayır ($P = 0$)', causal: 'hayır (iki yönlü, $t_0 = 0$ için)',
      bounded: `evet ($|x| \\leq |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: 'rampa-trapez-rampa zinciri',
      deriv: '$A\\bigl[\\delta(t-t_0+T/2) - \\delta(t-t_0-T/2)\\bigr]$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      return Math.abs(te) <= p.width / 2 ? p.amp : 0;
    },
  },
  {
    id: 'tri',
    name: { tr: 'Üçgen Darbe (Λ)', en: 'Triangular Pulse (Λ)' },
    sym: 'A·tri((t−t₀)/T)',
    formula: '$x(t) = A\\,\\operatorname{tri}\\!\\left(\\dfrac{t - t_0}{T}\\right) = A\\,\\max\\!\\left(0,\\,1 - \\dfrac{2|t-t_0|}{T}\\right)$',
    desc: { tr: 'Genişliği $T$ olan ve $t_0$\'da $A$ ile tepe yapan <strong>aperiyodik üçgen darbe</strong>. Aynı süreli iki dikdörtgenin konvolüsyonudur: $\\operatorname{tri}(t/T) = \\frac{1}{T}\\operatorname{rect}(t/T) * \\operatorname{rect}(t/T)$. <strong>Fourier dönüşümü</strong>: $\\frac{AT}{2}\\operatorname{sinc}^2(\\Omega T/4)$.', en: 'An <strong>aperiodic triangular pulse</strong> of width $T$ peaking at $t_0$ with amplitude $A$. It is the convolution of two rectangles of identical width: $\\operatorname{tri}(t/T) = \\frac{1}{T}\\operatorname{rect}(t/T) * \\operatorname{rect}(t/T)$. Its <strong>Fourier transform</strong> is $\\frac{AT}{2}\\operatorname{sinc}^2(\\Omega T/4)$.' },
    use: ['amp', 'width', 'shift'],
    props: (p) => ({
      periodic: 'hayır', even: 'evet ($t_0 = 0$ ise)', odd: 'hayır',
      energySig: `evet ($E = A^2 T/3 = ${(p.amp*p.amp*p.width/3).toFixed(3)}$)`,
      powerSig: 'hayır ($P = 0$)', causal: 'hayır',
      bounded: `evet ($|x| \\leq |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: 'parça parça kuadratik (kübik)',
      deriv: 'iki adımlı kare: $\\frac{2A}{T}$ ve $-\\frac{2A}{T}$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      const r = Math.abs(te);
      return r >= p.width / 2 ? 0 : p.amp * (1 - 2 * r / p.width);
    },
  },
  {
    id: 'sine',
    name: { tr: 'Sinüs', en: 'Sine' },
    sym: 'A·sin(2πF(t−t₀))',
    formula: '$x(t) = A\\,\\sin\\bigl(2\\pi F\\,(t - t_0)\\bigr)$',
    desc: { tr: 'Saf periyodik salınım. $T_0 = 1/F$ <em>temel periyot</em>, $\\Omega_0 = 2\\pi F$ <em>açısal temel frekans</em>. Tek bir frekans bileşeni içerir; Fourier serisinde temel yapı taşıdır. Zaman kayması $t_0$ aynı zamanda faz kayması $\\varphi = -2\\pi F t_0$ etkisi yapar.', en: 'A pure periodic oscillation. $T_0 = 1/F$ is the <em>fundamental period</em>, and $\\Omega_0 = 2\\pi F$ is the <em>angular fundamental frequency</em>. It contains a single frequency component and constitutes the fundamental building block of the Fourier series. A time shift $t_0$ also induces a phase shift $\\varphi = -2\\pi F\\,t_0$.' },
    use: ['amp', 'freq', 'shift'],
    props: (p) => ({
      periodic: `evet, $T_0 = ${(1/Math.max(p.freq,1e-6)).toFixed(2)}$ s, $F = ${p.freq.toFixed(2)}$ Hz`,
      even: '$t_0$ tam çeyrek periyot katı ise', odd: 'evet ($t_0 = 0$ ise)',
      energySig: 'hayır ($E = \\infty$)', powerSig: `evet ($P = A^2/2 = ${(p.amp*p.amp/2).toFixed(2)}$)`,
      causal: 'hayır (iki yönlü)', bounded: 'evet ($|x| \\leq |A|$)',
      integral: '$-\\frac{A}{2\\pi F}\\cos(2\\pi F(t-t_0))$', deriv: '$2\\pi F A\\cos(2\\pi F(t-t_0))$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      return p.amp * Math.sin(2 * Math.PI * p.freq * te);
    },
  },
  {
    id: 'cosine',
    name: { tr: 'Kosinüs', en: 'Cosine' },
    sym: 'A·cos(2πF(t−t₀))',
    formula: '$x(t) = A\\,\\cos\\bigl(2\\pi F\\,(t - t_0)\\bigr)$',
    desc: { tr: 'Sinüsün $\\pi/2$ kaymış hâli: $\\cos(\\theta) = \\sin(\\theta + \\pi/2)$. $t_0 = 0$ için <strong>çift</strong> bir sinyaldir. Periyodik, güç sinyali; Euler özdeşliği ile $\\cos(\\Omega t) = (e^{j\\Omega t} + e^{-j\\Omega t})/2$.', en: 'A phase-shifted version of the sine: $\\cos(\\theta) = \\sin(\\theta + \\pi/2)$. For $t_0 = 0$ it is an <strong>even</strong> signal. It is periodic and a power signal; by Euler\'s identity, $\\cos(\\Omega t) = (e^{j\\Omega t} + e^{-j\\Omega t})/2$.' },
    use: ['amp', 'freq', 'shift'],
    props: (p) => ({
      periodic: `evet, $T_0 = ${(1/Math.max(p.freq,1e-6)).toFixed(2)}$ s, $F = ${p.freq.toFixed(2)}$ Hz`,
      even: 'evet ($t_0 = 0$ ise)', odd: 'hayır',
      energySig: 'hayır ($E = \\infty$)', powerSig: `evet ($P = A^2/2 = ${(p.amp*p.amp/2).toFixed(2)}$)`,
      causal: 'hayır (iki yönlü)', bounded: 'evet ($|x| \\leq |A|$)',
      integral: '$\\frac{A}{2\\pi F}\\sin(2\\pi F(t-t_0))$', deriv: '$-2\\pi F A\\sin(2\\pi F(t-t_0))$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      return p.amp * Math.cos(2 * Math.PI * p.freq * te);
    },
  },
  {
    id: 'expGrowth',
    name: { tr: 'Üstel — İki Taraflı ($e^{αt}$)', en: 'Exponential — Two-Sided ($e^{αt}$)' },
    sym: 'A·e^(α(t−t₀))',
    formula: '$x(t) = A\\,e^{\\alpha (t - t_0)}$',
    desc: { tr: '<strong>$\\alpha > 0$</strong>: büyüyen üstel. <strong>$\\alpha < 0$</strong>: sönen üstel. <strong>$\\alpha = 0$</strong>: sabit. Karmaşık $s = \\sigma + j\\Omega$ üsteli LTI sistemlerin <em>özfonksiyonudur</em> — Laplace ve Fourier dönüşümlerinin temeli.', en: '<strong>$\\alpha > 0$</strong>: growing exponential. <strong>$\\alpha < 0$</strong>: decaying exponential. <strong>$\\alpha = 0$</strong>: constant. The complex exponential with $s = \\sigma + j\\Omega$ is the <em>eigenfunction</em> of LTI systems and forms the basis of the Laplace and Fourier transforms.' },
    use: ['amp', 'shift', 'alpha'],
    props: (p) => ({
      periodic: 'hayır',
      even: 'hayır', odd: 'hayır',
      energySig: 'hayır ($\\int_{-\\infty}^{\\infty} e^{2\\alpha t}dt = \\infty$, $\\alpha \\neq 0$)',
      powerSig: p.alpha === 0 ? `evet ($P = A^2$)` : 'hayır',
      causal: 'hayır (iki taraflı)',
      bounded: p.alpha === 0 ? 'evet' : 'hayır (sınırsız)',
      integral: '$\\frac{A}{\\alpha}e^{\\alpha (t-t_0)}$, $\\alpha \\neq 0$',
      deriv: '$\\alpha\\,x(t)$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      return p.amp * Math.exp(p.alpha * te);
    },
  },
  {
    id: 'expDecayCausal',
    name: { tr: 'Üstel Sönen (Kausal)', en: 'Decaying Exponential (Causal)' },
    sym: 'A·e^(−α(t−t₀))·u(t−t₀)',
    formula: '$x(t) = A\\,e^{-\\alpha (t - t_0)}\\,u(t - t_0),\\quad \\alpha > 0$',
    desc: { tr: 'RC devresinin doğal cevabı, deprem sonrası sönüm, radyoaktif bozunum modeli. <strong>Tipik enerji sinyali</strong>; Laplace dönüşümü $A/(s + \\alpha)$ kutbu $s = -\\alpha$\'dadır. $\\alpha$ pozitife sınırlanır.', en: 'Models the natural response of an RC circuit, post-earthquake damping, and radioactive decay. A <strong>typical energy signal</strong>; its Laplace transform $A/(s + \\alpha)$ has a pole at $s = -\\alpha$. The parameter $\\alpha$ is restricted to positive values.' },
    use: ['amp', 'shift', 'alpha'],
    props: (p) => {
      const a = Math.max(p.alpha, 1e-3);
      const E = p.amp * p.amp / (2 * a);
      return {
        periodic: 'hayır', even: 'hayır', odd: 'hayır',
        energySig: `evet ($E = A^2/(2\\alpha) = ${E.toFixed(3)}$)`,
        powerSig: 'hayır ($P = 0$ — enerji sinyali)',
        causal: 'evet ($t < t_0$ için $x = 0$)',
        bounded: `evet ($|x| \\leq |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
        integral: '$\\frac{A}{\\alpha}(1 - e^{-\\alpha(t-t_0)})u(t-t_0)$',
        deriv: '$A\\delta(t-t_0) - \\alpha\\,x(t)$',
      };
    },
    gen(t, p) {
      const te = t - p.shift;
      if (te < 0) return 0;
      const a = Math.max(p.alpha, 1e-3);  // α pozitife sınırla
      return p.amp * Math.exp(-a * te);
    },
  },
  {
    id: 'dampedSine',
    name: { tr: 'Sönümlü Sinüs', en: 'Damped Sine' },
    sym: 'A·e^(−α(t−t₀))·sin(2πF(t−t₀))',
    formula: '$x(t) = A\\,e^{-\\alpha (t-t_0)}\\,\\sin\\!\\bigl(2\\pi F(t-t_0)\\bigr)\\,u(t - t_0)$',
    desc: { tr: 'İkinci derece sistemlerin (RLC, kütle-yay-damper) <em>doğal cevabı</em>. $\\alpha$ sönüm katsayısı (Laplace kutbu $s = -\\alpha \\pm j2\\pi F$), $F$ ise sönümlü salınım frekansıdır. $t_0$ tetikleme anı (causal başlangıç).', en: 'The <em>natural response</em> of second-order systems (RLC, mass–spring–damper). The damping coefficient $\\alpha$ corresponds to Laplace poles at $s = -\\alpha \\pm j 2\\pi F$, and $F$ is the damped oscillation frequency. $t_0$ denotes the triggering instant (causal onset).' },
    use: ['amp', 'freq', 'shift', 'alpha'],
    props: (p) => {
      const a = Math.max(p.alpha, 0);
      return {
        periodic: 'hayır (sönen yarı-periyodik)', even: 'hayır', odd: 'hayır',
        energySig: a > 0 ? `evet ($\\alpha > 0$ ise)` : 'hayır ($\\alpha = 0$ ise saf salınım)',
        powerSig: a === 0 ? 'evet ($P = A^2/2$)' : 'hayır',
        causal: 'evet', bounded: 'evet ($|x| \\leq |A|$)',
        integral: 'analitik kapalı form',
        deriv: '$Ae^{-\\alpha(t-t_0)}\\!\\bigl[-\\alpha\\sin + 2\\pi F\\cos\\bigr] + A\\delta(t-t_0)\\cdot 0$',
      };
    },
    gen(t, p) {
      const te = t - p.shift;
      if (te < 0) return 0;
      const a = Math.max(p.alpha, 0);
      return p.amp * Math.exp(-a * te) * Math.sin(2 * Math.PI * p.freq * te);
    },
  },
  {
    id: 'gauss',
    name: { tr: 'Gauss Darbesi', en: 'Gaussian Pulse' },
    sym: 'A·e^(−(t−t₀)²/(2σ²))',
    formula: '$x(t) = A\\,\\exp\\!\\left(-\\dfrac{(t - t_0)^2}{2\\sigma^2}\\right)$',
    desc: { tr: 'Heisenberg <em>belirsizlik ilkesinin</em> en alt sınırını sağlayan tek sinyaldir: $\\Delta t \\cdot \\Delta f \\geq 1/(4\\pi)$. $\\sigma$ standart sapma — yarı yükseklikteki tam genişlik $\\text{FWHM} = 2\\sqrt{2\\ln 2}\\,\\sigma \\approx 2{,}355\\sigma$. <strong>Fourier dönüşümü yine bir Gauss\'tur:</strong> $\\mathcal{F}\\{x\\}(\\Omega) = A\\sigma\\sqrt{2\\pi}\\,e^{-\\Omega^2 \\sigma^2 / 2}$.', en: 'The unique signal attaining the lower bound of the Heisenberg <em>uncertainty principle</em>: $\\Delta t \\cdot \\Delta f \\geq 1/(4\\pi)$. The parameter $\\sigma$ is the standard deviation, with full width at half maximum $\\text{FWHM} = 2\\sqrt{2\\ln 2}\\,\\sigma \\approx 2.355\\,\\sigma$. <strong>Its Fourier transform is again a Gaussian:</strong> $\\mathcal{F}\\{x\\}(\\Omega) = A\\sigma\\sqrt{2\\pi}\\,e^{-\\Omega^2 \\sigma^2 / 2}$.' },
    use: ['amp', 'sigma', 'shift'],
    props: (p) => {
      const s = Math.max(p.sigma, 1e-3);
      const E = p.amp * p.amp * s * Math.sqrt(Math.PI);
      return {
        periodic: 'hayır', even: 'evet ($t_0 = 0$ ise)', odd: 'hayır',
        energySig: `evet ($E = A^2 \\sigma \\sqrt{\\pi} = ${E.toFixed(3)}$)`,
        powerSig: 'hayır ($P = 0$)',
        causal: 'hayır (iki yönlü)', bounded: `evet ($|x| \\leq |A|$, max $t = t_0$\'da)`,
        integral: '$\\frac{A\\sigma\\sqrt{\\pi}}{\\sqrt{2}}\\bigl[1+\\operatorname{erf}((t-t_0)/(\\sigma\\sqrt{2}))\\bigr]/2$',
        deriv: '$-\\dfrac{(t-t_0)}{\\sigma^2}\\,x(t)$',
      };
    },
    gen(t, p) {
      const te = t - p.shift;
      const s = Math.max(p.sigma, 1e-3);
      return p.amp * Math.exp(-(te * te) / (2 * s * s));
    },
  },
  {
    id: 'sinc',
    name: { tr: 'Sinc', en: 'Sinc' },
    sym: 'A·sinc((t−t₀)/T)',
    formula: '$x(t) = A\\,\\operatorname{sinc}\\!\\left(\\dfrac{t - t_0}{T}\\right) = A\\dfrac{\\sin\\bigl(\\pi(t-t_0)/T\\bigr)}{\\pi(t-t_0)/T},\\quad \\operatorname{sinc}(0) = 1$',
    desc: { tr: 'İdeal alçak-geçiren süzgecin <strong>impuls cevabı</strong>. <strong>Fourier dönüşümü dikdörtgendir</strong>: $\\mathcal{F}\\{x\\}(\\Omega) = AT\\operatorname{rect}(\\Omega T/(2\\pi))$ — kesim frekansı $\\Omega_c = \\pi/T$. <strong>Shannon-Whittaker interpolasyonu</strong>nun çekirdeğidir; sıfır geçişleri $t = t_0 + kT$ ($k \\neq 0$).', en: 'The <strong>impulse response</strong> of the ideal low-pass filter. <strong>Its Fourier transform is rectangular:</strong> $\\mathcal{F}\\{x\\}(\\Omega) = AT\\operatorname{rect}(\\Omega T/(2\\pi))$, with cut-off frequency $\\Omega_c = \\pi/T$. It is the kernel of <strong>Shannon–Whittaker interpolation</strong>; the zero crossings occur at $t = t_0 + kT$ for $k \\neq 0$.' },
    use: ['amp', 'width', 'shift'],
    props: (p) => ({
      periodic: 'hayır', even: 'evet ($t_0 = 0$ ise)', odd: 'hayır',
      energySig: `evet ($E = A^2 T = ${(p.amp*p.amp*p.width).toFixed(3)}$, Parseval ile)`,
      powerSig: 'hayır',
      causal: 'hayır (iki yönlü)',
      bounded: `evet ($|x| \\leq |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: '$\\frac{AT}{\\pi}\\operatorname{Si}(\\pi(t-t_0)/T)$ (sinüs integrali)',
      deriv: '$\\frac{A}{\\pi(t-t_0)}\\bigl[\\cos(\\pi(t-t_0)/T) - \\operatorname{sinc}(\\cdot)\\bigr]$',
    }),
    gen(t, p) {
      const te = (t - p.shift) / Math.max(p.width, 1e-6);
      if (Math.abs(te) < 1e-8) return p.amp;
      const x = Math.PI * te;
      return p.amp * Math.sin(x) / x;
    },
  },
  {
    id: 'square',
    name: { tr: 'Kare Dalga (Periyodik)', en: 'Square Wave (Periodic)' },
    sym: 'A·sgn(sin(2πF(t−t₀)))',
    formula: '$x(t) = A\\,\\operatorname{sgn}\\!\\bigl(\\sin(2\\pi F (t - t_0))\\bigr)$',
    desc: { tr: '%50 görev çevrimli, $\\pm A$ arasında geçen <strong>periyodik</strong> dalga. Fourier serisinde yalnızca <strong>tek harmonikler</strong> bulunur: $x(t) = \\frac{4A}{\\pi}\\sum_{k=1,3,5,\\ldots} \\frac{\\sin(2\\pi kF t)}{k}$. PWM, sayısal saat sinyalleri.', en: 'A <strong>periodic</strong> waveform with 50% duty cycle alternating between $\\pm A$. Its Fourier series contains only <strong>odd harmonics</strong>: $x(t) = \\frac{4A}{\\pi}\\sum_{k=1,3,5,\\ldots} \\frac{\\sin(2\\pi kF t)}{k}$. Used in PWM and digital clock signals.' },
    use: ['amp', 'freq', 'shift'],
    props: (p) => ({
      periodic: `evet, $T_0 = ${(1/Math.max(p.freq,1e-6)).toFixed(2)}$ s, $F = ${p.freq.toFixed(2)}$ Hz`,
      even: 'hayır', odd: 'evet ($t_0 = 0$ ise)',
      energySig: 'hayır ($E = \\infty$)',
      powerSig: `evet ($P = A^2 = ${(p.amp*p.amp).toFixed(2)}$)`,
      causal: 'hayır (iki yönlü)',
      bounded: `evet ($|x| = |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: 'üçgen dalga (kesintisiz)',
      deriv: 'Dirac taraklısı: $\\pm 2A\\delta(t - kT_0/2)$',
    }),
    gen(t, p) {
      const v = Math.sin(2 * Math.PI * p.freq * (t - p.shift));
      return p.amp * Math.sign(v);
    },
  },
  {
    id: 'sawtooth',
    name: { tr: 'Testere Dişi (Periyodik)', en: 'Sawtooth (Periodic)' },
    sym: 'A·(2/T₀)·((t−t₀) mod T₀ − T₀/2)',
    formula: '$x(t) = 2A\\!\\left[\\frac{t-t_0}{T_0} - \\left\\lfloor\\frac{t-t_0}{T_0} + \\frac{1}{2}\\right\\rfloor\\right],\\quad T_0 = 1/F$',
    desc: { tr: 'Doğrusal artıp birden sıçrayan periyodik dalga, $[-A, +A]$ aralığında. Fourier serisinde <strong>tüm harmonikler</strong> $\\frac{1}{k}$ ile azalır: $x(t) = -\\frac{2A}{\\pi}\\sum_{k=1}^{\\infty} \\frac{(-1)^k}{k}\\sin(2\\pi kF t)$. CRT taraması, müzik sentezi.', en: 'A periodic waveform that rises linearly and drops abruptly, taking values in $[-A, +A]$. Its Fourier series contains <strong>all harmonics</strong>, decaying as $1/k$: $x(t) = -\\frac{2A}{\\pi}\\sum_{k=1}^{\\infty} \\frac{(-1)^k}{k}\\sin(2\\pi kF t)$. Used in CRT scanning and music synthesis.' },
    use: ['amp', 'freq', 'shift'],
    props: (p) => ({
      periodic: `evet, $T_0 = ${(1/Math.max(p.freq,1e-6)).toFixed(2)}$ s, $F = ${p.freq.toFixed(2)}$ Hz`,
      even: 'hayır', odd: 'evet ($t_0 = 0$ ise)',
      energySig: 'hayır ($E = \\infty$)',
      powerSig: `evet ($P = A^2/3 = ${(p.amp*p.amp/3).toFixed(3)}$)`,
      causal: 'hayır (iki yönlü)',
      bounded: `evet ($|x| \\leq |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: 'parabolik segmentler',
      deriv: 'sabit $\\frac{2A}{T_0}$ ve periyodik $\\delta$ sıçramaları',
    }),
    gen(t, p) {
      const T = 1 / Math.max(p.freq, 1e-6);
      const u = (t - p.shift) / T;
      return p.amp * 2 * (u - Math.floor(u + 0.5));
    },
  },
  {
    id: 'triangleWave',
    name: { tr: 'Üçgen Dalga (Periyodik)', en: 'Triangle Wave (Periodic)' },
    sym: 'A·(2/π)·arcsin(sin(2πF(t−t₀)))',
    formula: '$x(t) = A\\,\\dfrac{2}{\\pi}\\arcsin\\!\\bigl(\\sin(2\\pi F(t - t_0))\\bigr)$',
    desc: { tr: 'Yumuşak köşeli (sürekli) periyodik dalga, $[-A, +A]$ aralığında. Fourier serisinde yalnızca <strong>tek harmonikler</strong> $\\frac{1}{k^2}$ ile azalır: $x(t) = \\frac{8A}{\\pi^2}\\sum_{k=0}^{\\infty} \\frac{(-1)^k\\sin(2\\pi(2k+1)F t)}{(2k+1)^2}$. Kare dalganın integralidir → daha az yüksek-frekans içeriği.', en: 'A continuous periodic waveform with smooth corners, taking values in $[-A, +A]$. Its Fourier series contains only <strong>odd harmonics</strong>, decaying as $1/k^2$: $x(t) = \\frac{8A}{\\pi^2}\\sum_{k=0}^{\\infty} \\frac{(-1)^k\\sin(2\\pi(2k+1)F t)}{(2k+1)^2}$. As the integral of the square wave, it has less high-frequency content.' },
    use: ['amp', 'freq', 'shift'],
    props: (p) => ({
      periodic: `evet, $T_0 = ${(1/Math.max(p.freq,1e-6)).toFixed(2)}$ s, $F = ${p.freq.toFixed(2)}$ Hz`,
      even: 'evet ($t_0 = 0$ ise)', odd: 'hayır',
      energySig: 'hayır ($E = \\infty$)',
      powerSig: `evet ($P = A^2/3 = ${(p.amp*p.amp/3).toFixed(3)}$)`,
      causal: 'hayır (iki yönlü)',
      bounded: `evet ($|x| \\leq |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: 'kübik segmentler',
      deriv: 'kare dalga ($\\pm 4AF$)',
    }),
    gen(t, p) {
      return p.amp * (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * p.freq * (t - p.shift)));
    },
  },
  {
    id: 'halfRect',
    name: { tr: 'Yarım Dalga Doğrultma', en: 'Half-Wave Rectification' },
    sym: 'A·max(sin(2πF(t−t₀)), 0)',
    formula: '$x(t) = A\\,\\max\\bigl(\\sin(2\\pi F(t-t_0)),\\,0\\bigr)$',
    desc: { tr: '<strong>Yarım dalga doğrultma</strong>: sinüsün yalnızca pozitif yarım periyodu geçirilir, negatif kısım sıfırlanır. Diyot tabanlı AC-DC dönüşümün ilk basamağı; <strong>DC bileşeni</strong> $A/\\pi$ ve harmonik içeriği zengindir.', en: '<strong>Half-wave rectification:</strong> only the positive half-cycle of the sine is passed, while the negative half is set to zero. It constitutes the first stage of diode-based AC-to-DC conversion; the <strong>DC component</strong> equals $A/\\pi$ and the harmonic content is rich.' },
    use: ['amp', 'freq', 'shift'],
    props: (p) => ({
      periodic: `evet, $T_0 = ${(1/Math.max(p.freq,1e-6)).toFixed(2)}$ s, $F = ${p.freq.toFixed(2)}$ Hz`,
      even: 'hayır', odd: 'hayır',
      energySig: 'hayır ($E = \\infty$)',
      powerSig: `evet ($P = A^2/4 = ${(p.amp*p.amp/4).toFixed(2)}$)`,
      causal: 'hayır', bounded: `evet ($0 \\leq x \\leq |A|$)`,
      integral: 'parçalı: yarım periyot kosinüs zarfı + sabit kısım',
      deriv: 'kesintili (sıçramalı): $A\\cdot 2\\pi F \\cos$ pozitif yarımda, 0 değilse',
    }),
    gen(t, p) {
      const v = Math.sin(2 * Math.PI * p.freq * (t - p.shift));
      return p.amp * Math.max(v, 0);
    },
  },
  {
    id: 'fullRect',
    name: { tr: 'Tam Dalga Doğrultma', en: 'Full-Wave Rectification' },
    sym: 'A·|sin(2πF(t−t₀))|',
    formula: '$x(t) = A\\,\\bigl|\\sin(2\\pi F(t-t_0))\\bigr|$',
    desc: { tr: '<strong>Tam dalga doğrultma</strong>: sinüsün mutlak değeri; her iki yarım periyot pozitife çevrilir. Periyot $T_0/2$ olur ($F\' = 2F$). <strong>DC bileşeni</strong> $2A/\\pi$, köprü diyot devresinin matematiksel modelidir.', en: '<strong>Full-wave rectification:</strong> the absolute value of the sine, in which both half-cycles are mapped to positive values. The period becomes $T_0/2$ ($F\' = 2F$). The <strong>DC component</strong> equals $2A/\\pi$ — the mathematical model of the bridge rectifier circuit.' },
    use: ['amp', 'freq', 'shift'],
    props: (p) => ({
      periodic: `evet, $T_0\' = ${(0.5/Math.max(p.freq,1e-6)).toFixed(2)}$ s (orijinalin yarısı)`,
      even: 'hayır', odd: 'hayır',
      energySig: 'hayır ($E = \\infty$)',
      powerSig: `evet ($P = A^2/2 = ${(p.amp*p.amp/2).toFixed(2)}$)`,
      causal: 'hayır', bounded: `evet ($0 \\leq x \\leq |A|$)`,
      integral: 'parçalı sürekli, lineer artan ortalamayla',
      deriv: 'kesintili: sıfır geçişlerinde işaret değişir',
    }),
    gen(t, p) {
      return p.amp * Math.abs(Math.sin(2 * Math.PI * p.freq * (t - p.shift)));
    },
  },
  {
    id: 'impTrain',
    name: { tr: 'Dirac Taraklısı', en: 'Dirac Comb' },
    sym: 'A·Σ δ(t − kT₀ − t₀)',
    formula: '$x(t) = A\\sum_{k=-\\infty}^{\\infty}\\delta\\bigl(t - kT_0 - t_0\\bigr),\\quad T_0 = 1/F$',
    desc: { tr: 'Periyodik impuls dizisi — <strong>örnekleme teoreminin matematiksel modeli</strong> ($x_s(t) = x(t)\\cdot \\delta_{T_0}(t)$). Fourier dönüşümü yine bir Dirac taraklısı: $\\mathcal{F}\\{\\delta_{T_0}\\}(\\Omega) = \\frac{2\\pi}{T_0}\\sum_k \\delta(\\Omega - 2\\pi k F)$ — Poisson toplam formülü.', en: 'A periodic impulse train — the <strong>mathematical model of the sampling theorem</strong> ($x_s(t) = x(t)\\cdot \\delta_{T_0}(t)$). Its Fourier transform is again a Dirac comb: $\\mathcal{F}\\{\\delta_{T_0}\\}(\\Omega) = \\frac{2\\pi}{T_0}\\sum_k \\delta(\\Omega - 2\\pi k F)$ — the Poisson summation formula.' },
    use: ['amp', 'freq', 'shift'],
    props: (p) => ({
      periodic: `evet, $T_0 = ${(1/Math.max(p.freq,1e-6)).toFixed(2)}$ s, $F = ${p.freq.toFixed(2)}$ Hz`,
      even: 'evet ($t_0 = 0$ ise)', odd: 'hayır',
      energySig: 'tanımsız (dağılım)', powerSig: 'tanımsız',
      causal: 'hayır', bounded: 'hayır (impulsler ideal $\\infty$)',
      integral: 'basamak dizisi (merdiven)',
      deriv: 'doublet dizisi',
    }),
    gen(t, p, dt) {
      const T = 1 / Math.max(p.freq, 1e-6);
      const eps = Math.max(dt * 1.5, 0.04);
      const te = t - p.shift;
      const k = Math.round(te / T);
      const r = Math.abs(te - k * T);
      if (r >= eps) return 0;
      return p.amp * (1 - r / eps) / eps;
    },
  },
  {
    id: 'chirp',
    name: { tr: 'Doğrusal Chirp', en: 'Linear Chirp' },
    sym: 'A·cos(2π(F·t + ½k·t²) + φ)',
    formula: '$x(t) = A\\,\\cos\\!\\bigl(2\\pi\\bigl[F\\,(t-t_0) + \\tfrac{1}{2}k\\,(t-t_0)^2\\bigr]\\bigr)$',
    desc: { tr: '<strong>Doğrusal frekans modülasyonlu</strong> sinyal: anlık frekans $f_i(t) = F + k(t-t_0)$ ile zamanla doğrusal artar (ya da $k<0$ için azalır). <strong>Radar / sonar (LFM)</strong>, ses sentezi, optik puls sıkıştırma. Fourier dönüşümünün genliği $1/\\sqrt{|k|}$ ile orantılı, fazı kuadratiktir → <strong>chirp impulsun ayna ikizidir</strong>: <em>fractional Fourier</em> dönüşümünde belirli bir $\\alpha$ değerinde impulsa dönüşür. $k$ chirp hızı (Hz/s), $\\alpha$ slider\'ı $k$ yerine kullanılır.', en: 'A <strong>linearly frequency-modulated</strong> signal: the instantaneous frequency $f_i(t) = F + k(t-t_0)$ varies linearly with time (decreasing when $k < 0$). Used in <strong>radar/sonar (LFM)</strong>, audio synthesis, and optical pulse compression. The magnitude of its Fourier transform is proportional to $1/\\sqrt{|k|}$ and its phase is quadratic; the chirp is thereby the <strong>mirror counterpart of the impulse</strong> — at a specific $\\alpha$ value of the <em>fractional Fourier</em> transform it maps to an impulse. The chirp rate $k$ is expressed in Hz/s; the $\\alpha$ slider is used in place of $k$.' },
    use: ['amp', 'freq', 'shift', 'alpha'],
    props: (p) => ({
      periodic: 'hayır (frekans zamanla değişir)',
      even: 'hayır', odd: 'hayır',
      energySig: 'evet (sonlu süreli pencere ile)', powerSig: 'hayır',
      causal: 'hayır (iki yönlü)', bounded: `evet ($|x| \\leq |A| = ${Math.abs(p.amp).toFixed(2)}$)`,
      integral: 'Fresnel integralleri',
      deriv: 'anlık frekans $f_i = F + k(t - t_0)$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      // alpha sliderını chirp hızı k olarak yorumla
      const k = p.alpha;
      const phase = 2 * Math.PI * (p.freq * te + 0.5 * k * te * te);
      return p.amp * Math.cos(phase);
    },
  },
  {
    id: 'complexExpReal',
    name: { tr: 'Kompleks Üstel (gerçel kısım)', en: 'Complex Exponential (real part)' },
    sym: 'Re{A·e^((α+j2πF)(t−t₀))}',
    formula: '$x(t) = \\text{Re}\\!\\left\\{A\\,e^{(\\alpha + j 2\\pi F)(t - t_0)}\\right\\} = A\\,e^{\\alpha(t-t_0)}\\cos\\!\\bigl(2\\pi F(t-t_0)\\bigr)$',
    desc: { tr: '<strong>Euler özdeşliği:</strong> $e^{j\\Omega t} = \\cos\\Omega t + j\\sin\\Omega t$. Karmaşık frekans $s = \\alpha + j2\\pi F$ — LTI sistemlerin <em>özfonksiyonu</em>: $T\\{e^{st}\\} = H(s)\\,e^{st}$. $\\alpha < 0$ sönen salınım, $\\alpha = 0$ saf salınım, $\\alpha > 0$ büyüyen salınım — Laplace düzlemindeki kutupların doğal yorumu.', en: '<strong>Euler\'s identity:</strong> $e^{j\\Omega t} = \\cos\\Omega t + j\\sin\\Omega t$. The complex frequency $s = \\alpha + j 2\\pi F$ is the <em>eigenfunction</em> of LTI systems: $T\\{e^{st}\\} = H(s)\\,e^{st}$. $\\alpha < 0$ corresponds to a damped oscillation, $\\alpha = 0$ to a pure oscillation, and $\\alpha > 0$ to a growing oscillation — the natural interpretation of poles in the Laplace plane.' },
    use: ['amp', 'freq', 'shift', 'alpha'],
    props: (p) => ({
      periodic: p.alpha === 0 ? `evet ($T_0 = ${(1/Math.max(p.freq,1e-6)).toFixed(2)}$ s)` : 'hayır ($\\alpha \\neq 0$)',
      even: 'evet ($\\alpha = 0$, $t_0 = 0$ ise $\\to \\cos$)', odd: 'hayır',
      energySig: p.alpha < 0 ? 'evet (kausal sürüm için)' : 'hayır',
      powerSig: p.alpha === 0 ? `evet ($P = A^2/2 = ${(p.amp*p.amp/2).toFixed(2)}$)` : 'hayır',
      causal: 'hayır (iki yönlü)',
      bounded: p.alpha <= 0 ? `evet ($|x| \\leq |A|$)` : 'hayır ($\\alpha > 0$ büyür)',
      integral: 'Re$\\{x/(\\alpha + j2\\pi F)\\}$',
      deriv: '$\\alpha\\,x(t) - 2\\pi F A e^{\\alpha(t-t_0)}\\sin(2\\pi F(t-t_0))$',
    }),
    gen(t, p) {
      const te = t - p.shift;
      return p.amp * Math.exp(p.alpha * te) * Math.cos(2 * Math.PI * p.freq * te);
    },
  },
];

// ---------- Her sinyale özgün renk -----------------------------------
// Periyodik sinyaller önce (gallery sırası), sonra aperiyodik/diğerleri.
// Renk paleti: birbirinden yeterince ayrışmış, dark/light temada okunakı.
const SIG_COLORS = {
  // --- Periyodik ---
  sine:          '#39ff85',   // canlı yeşil (accent-1)
  cosine:        '#7b8cff',   // lavanta-mavi (color-y)
  square:        '#ff8c42',   // turuncu (accent-2)
  sawtooth:      '#ff4f9a',   // fuşya (color-marker)
  triangleWave:  '#00d4ff',   // cyan
  impTrain:      '#c8b4ff',   // açık mor
  // --- Aperiyodik ---
  dirac:         '#ffd700',   // altın sarısı
  step:          '#ff6b6b',   // mercan kırmızı
  ramp:          '#ff9f43',   // kavun
  sgn:           '#48dbfb',   // gök mavisi
  rect:          '#1dd1a1',   // jade yeşil
  tri:           '#a29bfe',   // iris
  gauss:         '#fd79a8',   // pembe
  sinc:          '#fdcb6e',   // şeftali sarı
  expGrowth:     '#e17055',   // kiremit
  expDecayCausal:'#6c5ce7',   // mor
  dampedSine:    '#00b894',   // zümrüt
  complexExpReal:'#d63031',   // kırmızı
  chirp:         '#00cec9',   // turkuaz
  halfRect:      '#ff7675',   // mercan
  fullRect:      '#ffa502',   // amber
};

// Galeri sırası: periyodik olanlar önce, sonra aperiyodik/diğerleri
const PERIODIC_IDS = ['sine', 'cosine', 'square', 'sawtooth', 'triangleWave', 'halfRect', 'fullRect', 'impTrain'];
const SIGNALS_ORDERED = [
  ...PERIODIC_IDS.map(id => SIGNALS.find(s => s.id === id)).filter(Boolean),
  ...SIGNALS.filter(s => !PERIODIC_IDS.includes(s.id)),
];

const SIG_BY_ID = Object.fromEntries(SIGNALS.map(s => [s.id, s]));

// ---------- Durum ----------
let state = {
  signalId: 'sine',
  amp: 1, width: 2, shift: 0, freq: 1, sigma: 1.0, alpha: -0.5,
  periodic: false, showDeriv: true, showIntegral: true, showEvenOdd: false, showGrid: true,
  tmin: -6, tmax: 6, samples: 800,
};

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const gallery = $('signalCards');
const canvasMain = $('canvasMain');
const canvasDeriv = $('canvasDeriv');
const canvasIntegral = $('canvasIntegral');

const ui = {
  amp:$('amp'), width:$('width'), shift:$('shift'), freq:$('freq'), sigma:$('sigma'), alpha:$('alpha'),
  periodic:$('periodic'), showDeriv:$('showDeriv'), showIntegral:$('showIntegral'),
  showEvenOdd:$('showEvenOdd'), showGrid:$('showGrid'),
  tmin:$('tmin'), tmax:$('tmax'), samples:$('samples'),
  ampV:$('ampVal'), widthV:$('widthVal'), shiftV:$('shiftVal'), freqV:$('freqVal'),
  sigmaV:$('sigmaVal'), alphaV:$('alphaVal'), tminV:$('tminVal'), tmaxV:$('tmaxVal'), samplesV:$('samplesVal'),
  resetParams:$('resetParams'),
  mainTitle:$('mainTitle'), mainBadge:$('mainBadge'),
  infoName:$('infoName'), infoFormula:$('infoFormula'), infoDesc:$('infoDesc'),
  propTable:$('propTable'), paramsHint:$('paramsHint'),
  stMaxAbs:$('stMaxAbs'), stMean:$('stMean'), stRms:$('stRms'),
  stEnergy:$('stEnergy'), stPower:$('stPower'), stAtT0:$('stAtT0'),
};

// ---------- Galeri oluştur ----------
function buildGallery() {
  gallery.innerHTML = '';

  // "Periyodik" başlığı — ilk grup
  const sepPer = document.createElement('div');
  sepPer.style.cssText = 'grid-column:1/-1; display:flex; align-items:center; gap:0.5rem; margin:0 0 0.1rem;';
  sepPer.innerHTML = `
    <span style="flex:1;height:1px;background:var(--border-glow);"></span>
    <span style="font-family:\'Saira Condensed\',sans-serif;font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-1);">${__i18n({tr:'Periyodik',en:'Periodic'})}</span>
    <span style="flex:1;height:1px;background:var(--border-glow);"></span>`;
  gallery.appendChild(sepPer);

  // Periyodik/Aperiyodik grup ayracı
  let inAperiodic = false;
  SIGNALS_ORDERED.forEach((s, idx) => {
    // İlk aperiyodik başladığında grup başlığı ekle
    const isPeriodic = PERIODIC_IDS.includes(s.id);
    if (!isPeriodic && !inAperiodic) {
      inAperiodic = true;
      const sep = document.createElement('div');
      sep.style.cssText = 'grid-column:1/-1; display:flex; align-items:center; gap:0.5rem; margin:0.4rem 0 0.1rem;';
      sep.innerHTML = `
        <span style="flex:1;height:1px;background:var(--border-glow);"></span>
        <span style="font-family:\'Saira Condensed\',sans-serif;font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);">${__i18n({tr:'Aperiyodik',en:'Aperiodic'})}</span>
        <span style="flex:1;height:1px;background:var(--border-glow);"></span>`;
      gallery.appendChild(sep);
    }

    const card = document.createElement('div');
    card.className = 'sig-card' + (s.id === state.signalId ? ' active' : '');
    card.dataset.id = s.id;
    // Sinyale özgün renk border-left ile belirt
    const col = SIG_COLORS[s.id] || '#39ff85';
    card.style.borderLeftColor = col;
    card.innerHTML = `
      <canvas class="thumb" data-id="${s.id}"></canvas>
      <div class="label">${__i18n(s.name)}</div>
    `;
    card.addEventListener('click', () => selectSignal(s.id));
    gallery.appendChild(card);
  });
  // küçük önizlemeleri çiz
  requestAnimationFrame(() => {
    document.querySelectorAll('.sig-card .thumb').forEach(c => drawThumb(c, c.dataset.id));
  });
}

function drawThumb(cv, sigId) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height;
  ctx.clearRect(0, 0, W, H);

  const sig = SIG_BY_ID[sigId];
  // varsayılan parametreler ile mini çizim
  const p = { amp: 1, width: 1.5, shift: 0, freq: 1.2, sigma: 0.6, alpha: -0.6, periodic: false };
  const tmin = -3, tmax = 3, N = 220;
  const dt = (tmax - tmin) / (N - 1);
  const ys = new Array(N);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < N; i++) {
    const t = tmin + i * dt;
    const v = sig.gen(t, p, dt);
    ys[i] = v;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (mn === mx) { mn -= 0.5; mx += 0.5; }
  const pad = 4;
  const x0 = (t) => pad + (t - tmin) / (tmax - tmin) * (W - 2 * pad);
  const y0 = (v) => H - pad - (v - mn) / (mx - mn) * (H - 2 * pad);

  // eksen
  ctx.strokeStyle = 'rgba(120,140,200,0.25)';
  ctx.lineWidth = 0.8;
  const yZero = y0(0);
  ctx.beginPath(); ctx.moveTo(pad, yZero); ctx.lineTo(W - pad, yZero); ctx.stroke();

  // sinyal — sinyale özgün renk
  const col = SIG_COLORS[sigId] || getComputedStyle(document.body).getPropertyValue('--accent-1').trim() || '#39ff85';
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < N; i++) {
    const t = tmin + i * dt;
    const v = ys[i];
    if (!isFinite(v)) continue;
    if (!started) { ctx.moveTo(x0(t), y0(v)); started = true; }
    else ctx.lineTo(x0(t), y0(v));
  }
  ctx.stroke();
}

function selectSignal(id) {
  state.signalId = id;
  document.querySelectorAll('.sig-card').forEach(c => {
    const isActive = c.dataset.id === id;
    c.classList.toggle('active', isActive);
    // border-left rengi her zaman sinyale özgün kalsın
    const sigCol = SIG_COLORS[c.dataset.id];
    if (sigCol) {
      c.style.borderLeftColor = sigCol;
      if (isActive) c.style.boxShadow = `0 0 12px ${sigCol}30 inset, 0 0 0 1px ${sigCol}55`;
      else c.style.boxShadow = '';
    }
  });
  const s = SIG_BY_ID[id];
  redraw();
}

// ---------- Slider'lar ----------
function bindRange(input, valEl, key, fmt = (v) => v.toFixed(2)) {
  input.addEventListener('input', () => {
    state[key] = parseFloat(input.value);
    valEl.textContent = fmt(state[key]);
    redraw();
  });
}
function bindCheckbox(input, key) {
  input.addEventListener('change', () => { state[key] = input.checked; redraw(); });
}

bindRange(ui.amp, ui.ampV, 'amp');
bindRange(ui.width, ui.widthV, 'width');
bindRange(ui.shift, ui.shiftV, 'shift');
bindRange(ui.freq, ui.freqV, 'freq');
bindRange(ui.sigma, ui.sigmaV, 'sigma');
bindRange(ui.alpha, ui.alphaV, 'alpha');
bindRange(ui.tmin, ui.tminV, 'tmin', v => v.toFixed(1));
bindRange(ui.tmax, ui.tmaxV, 'tmax', v => v.toFixed(1));
bindRange(ui.samples, ui.samplesV, 'samples', v => v.toFixed(0));
bindCheckbox(ui.periodic, 'periodic');
bindCheckbox(ui.showDeriv, 'showDeriv');
bindCheckbox(ui.showIntegral, 'showIntegral');
bindCheckbox(ui.showEvenOdd, 'showEvenOdd');
bindCheckbox(ui.showGrid, 'showGrid');

ui.resetParams.addEventListener('click', () => {
  state.amp = 1; state.width = 2; state.shift = 0; state.freq = 1;
  state.sigma = 1.0; state.alpha = -0.5;
  ui.amp.value = 1; ui.width.value = 2; ui.shift.value = 0; ui.freq.value = 1;
  ui.sigma.value = 1.0; ui.alpha.value = -0.5;
  ui.ampV.textContent = '1.00'; ui.widthV.textContent = '2.00'; ui.shiftV.textContent = '0.00';
  ui.freqV.textContent = '1.00'; ui.sigmaV.textContent = '1.00'; ui.alphaV.textContent = '-0.50';
  redraw();
});

// ---------- Hesaplamalar ----------
function buildSamples() {
  const N = Math.round(state.samples);
  const tmin = state.tmin, tmax = state.tmax;
  const dt = (tmax - tmin) / (N - 1);
  const t = new Float64Array(N);
  const y = new Float64Array(N);
  const sig = SIG_BY_ID[state.signalId];
  const p = {
    amp: state.amp,
    width: Math.max(state.width, 1e-3),
    shift: state.shift,
    freq: Math.max(state.freq, 1e-3),
    sigma: Math.max(state.sigma, 1e-3),
    alpha: state.alpha,
  };
  for (let i = 0; i < N; i++) {
    t[i] = tmin + i * dt;
    let v = sig.gen(t[i], p, dt);
    y[i] = v;
  }
  // Periyodik tekrarla — yalnızca uygun olan aperiyodikler için
  if (state.periodic && !isInherentlyPeriodic(state.signalId)) {
    const T = Math.max(state.width, 0.3);
    for (let i = 0; i < N; i++) {
      const te = t[i] - state.shift;
      const teMod = te - T * Math.round(te / T);
      let v = sig.gen(teMod + state.shift, p, dt);
      y[i] = v;
    }
  }
  return { t, y, dt, N, p };
}

function isInherentlyPeriodic(id) {
  return ['sine','cosine','square','sawtooth','triangleWave','impTrain'].includes(id);
}

function deriv(y, dt) {
  const N = y.length;
  const d = new Float64Array(N);
  for (let i = 1; i < N - 1; i++) d[i] = (y[i+1] - y[i-1]) / (2 * dt);
  d[0] = (y[1] - y[0]) / dt;
  d[N-1] = (y[N-1] - y[N-2]) / dt;
  return d;
}

function integ(y, dt) {
  const N = y.length;
  const I = new Float64Array(N);
  let s = 0;
  for (let i = 0; i < N; i++) { s += y[i] * dt; I[i] = s; }
  return I;
}

function evenOddSplit(t, y) {
  // x_e(t) = (x(t) + x(-t))/2, x_o(t) = (x(t) - x(-t))/2
  // -t interpolasyonu (lineer) ile
  const N = y.length;
  const tmin = t[0], tmax = t[N-1];
  const dt = t[1] - t[0];
  const xe = new Float64Array(N), xo = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const tn = -t[i];
    // örnek dizisinde -t'nin yerini bul
    let yneg = 0;
    if (tn >= tmin && tn <= tmax) {
      const idxF = (tn - tmin) / dt;
      const idx = Math.floor(idxF);
      const frac = idxF - idx;
      if (idx >= 0 && idx + 1 < N) {
        yneg = y[idx] * (1 - frac) + y[idx + 1] * frac;
      } else if (idx === N - 1) yneg = y[N - 1];
    }
    xe[i] = 0.5 * (y[i] + yneg);
    xo[i] = 0.5 * (y[i] - yneg);
  }
  return { xe, xo };
}

// ---------- Çizim yardımcıları ----------
function prep(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr;
  cv.height = r.height * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height, ctx };
}

function bounds(arrs) {
  let mn = Infinity, mx = -Infinity;
  for (const a of arrs) {
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (!isFinite(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  if (!isFinite(mn)) { mn = -1; mx = 1; }
  if (mn === mx) { mn -= 0.5; mx += 0.5; }
  const pad = (mx - mn) * 0.12;
  return { mn: mn - pad, mx: mx + pad };
}

function drawAxes(ctx, w, h, tmin, tmax, mn, mx, label) {
  // arka plan
  const style = getComputedStyle(document.body);
  const bg = style.getPropertyValue('--canvas-bg').trim() || 'rgba(4,4,18,0.5)';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const padL = 38, padR = 14, padT = 14, padB = 28;
  const W = w - padL - padR, H = h - padT - padB;
  const X = (t) => padL + (t - tmin) / (tmax - tmin) * W;
  const Y = (v) => padT + (1 - (v - mn) / (mx - mn)) * H;

  // grid
  if (state.showGrid) {
    ctx.strokeStyle = 'rgba(120,140,200,0.15)';
    ctx.lineWidth = 1;
    const nx = 10, ny = 6;
    ctx.beginPath();
    for (let i = 0; i <= nx; i++) {
      const x = padL + i * W / nx;
      ctx.moveTo(x, padT); ctx.lineTo(x, padT + H);
    }
    for (let j = 0; j <= ny; j++) {
      const y = padT + j * H / ny;
      ctx.moveTo(padL, y); ctx.lineTo(padL + W, y);
    }
    ctx.stroke();
  }

  // eksenler
  const axisColor = style.getPropertyValue('--border-glow-strong').trim() || 'rgba(100,180,255,0.55)';
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1.2;
  // x ekseni (y=0)
  const y0 = Y(0);
  ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(padL + W, y0); ctx.stroke();
  // y ekseni (t=0 görünür ise)
  if (tmin <= 0 && tmax >= 0) {
    const x0 = X(0);
    ctx.beginPath(); ctx.moveTo(x0, padT); ctx.lineTo(x0, padT + H); ctx.stroke();
  }

  // tick label
  const txt = style.getPropertyValue('--text-secondary').trim() || '#7a82a6';
  ctx.fillStyle = txt;
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'center';
  const xticks = niceTicks(tmin, tmax, 8);
  for (const tv of xticks) {
    const xp = X(tv);
    ctx.fillText(tv.toFixed(tv % 1 === 0 ? 0 : 1), xp, padT + H + 14);
    ctx.strokeStyle = axisColor;
    ctx.beginPath(); ctx.moveTo(xp, padT + H); ctx.lineTo(xp, padT + H + 4); ctx.stroke();
  }
  ctx.textAlign = 'right';
  const yticks = niceTicks(mn, mx, 5);
  for (const yv of yticks) {
    const yp = Y(yv);
    ctx.fillText(yv.toFixed(yv % 1 === 0 ? 0 : 2), padL - 5, yp + 3);
    ctx.strokeStyle = axisColor;
    ctx.beginPath(); ctx.moveTo(padL - 4, yp); ctx.lineTo(padL, yp); ctx.stroke();
  }

  // ekseni etiketi
  ctx.fillStyle = style.getPropertyValue('--text-dim').trim() || '#4a5070';
  ctx.font = '11px Saira, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('t', padL + W - 2, padT + H - 5);
  ctx.textAlign = 'left';
  if (label) ctx.fillText(label, padL + 4, padT + 11);

  return { X, Y, padL, padR, padT, padB, W, H };
}

function niceTicks(mn, mx, target) {
  const span = mx - mn;
  const step0 = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3.5) step = 2 * mag;
  else if (norm < 7.5) step = 5 * mag;
  else step = 10 * mag;
  const out = [];
  const start = Math.ceil(mn / step) * step;
  for (let v = start; v <= mx + 1e-9; v += step) {
    out.push(Math.round(v / step) * step);
  }
  return out;
}

// ---------- Sayısal istatistik hesabı ----------
function fmtNum(v) {
  if (!isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a < 0.001 || a >= 1000) return v.toExponential(2);
  return v.toFixed(3);
}
function updateStats(t, y, dt, t0, sig) {
  if (!ui.stMaxAbs) return;
  const N = y.length;
  let mn = Infinity, mx = -Infinity, sum = 0, energy = 0, nFinite = 0;
  for (let i = 0; i < N; i++) {
    const v = y[i];
    if (!isFinite(v)) continue;
    if (v < mn) mn = v; if (v > mx) mx = v;
    sum += v;
    energy += v * v;
    nFinite++;
  }
  const T = t[N - 1] - t[0];
  const maxAbs = Math.max(Math.abs(mn), Math.abs(mx));
  const mean = sum / Math.max(nFinite, 1);
  const E = energy * dt;
  const P = E / Math.max(T, 1e-9);
  const rms = Math.sqrt(P);
  // x(t₀): t₀'a en yakın örneği bul
  let xAtT0 = 0;
  if (t0 >= t[0] && t0 <= t[N - 1]) {
    const idx = Math.round((t0 - t[0]) / dt);
    if (idx >= 0 && idx < N) xAtT0 = y[idx];
  }
  ui.stMaxAbs.textContent = fmtNum(maxAbs);
  ui.stMean.textContent = fmtNum(mean);
  ui.stRms.textContent = fmtNum(rms);
  ui.stEnergy.textContent = fmtNum(E);
  ui.stPower.textContent = fmtNum(P);
  ui.stAtT0.textContent = fmtNum(xAtT0);
}

function drawCurve(ctx, t, y, X, Y, color, lineW = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < t.length; i++) {
    const v = y[i];
    if (!isFinite(v)) { started = false; continue; }
    if (!started) { ctx.moveTo(X(t[i]), Y(v)); started = true; }
    else ctx.lineTo(X(t[i]), Y(v));
  }
  ctx.stroke();
}

// ---------- Adaptif kontrol gösterimi ----------
function applyParamVisibility(sig) {
  // Yalnızca sig.use içindeki parametre satırlarını göster
  document.querySelectorAll('#paramsCard .ctrl-row[data-param]').forEach(row => {
    const key = row.getAttribute('data-param');
    const visible = sig.use.includes(key);
    row.setAttribute('data-hidden', visible ? '0' : '1');
  });
  if (ui.paramsHint) {
    const names = {
      amp: 'A', shift: 't₀', freq: 'F', width: 'T', sigma: 'σ', alpha: 'α'
    };
    // Chirp için 'alpha' aslında chirp hızı k → etiketi değiştir
    if (sig.id === 'chirp') names.alpha = 'k (chirp hızı)';
    ui.paramsHint.textContent = sig.use.map(k => names[k] || k).join(' · ');
  }
  // Chirp seçildiğinde alpha slider'ının etiketini de güncelle
  const alphaLabel = document.querySelector('.ctrl-row[data-param="alpha"] label');
  if (alphaLabel) {
    if (sig.id === 'chirp') {
      alphaLabel.firstChild.textContent = 'Chirp hızı k (Hz/s) ';
    } else {
      alphaLabel.firstChild.textContent = 'Sönüm / Büyüme α ';
    }
  }
}

// ---------- Ana çizim ----------
function redraw() {
  // değer etiketleri
  ui.ampV.textContent = state.amp.toFixed(2);
  ui.widthV.textContent = state.width.toFixed(2);
  ui.shiftV.textContent = state.shift.toFixed(2);
  ui.freqV.textContent = state.freq.toFixed(2);
  ui.sigmaV.textContent = state.sigma.toFixed(2);
  ui.alphaV.textContent = state.alpha.toFixed(2);
  ui.tminV.textContent = state.tmin.toFixed(1);
  ui.tmaxV.textContent = state.tmax.toFixed(1);
  ui.samplesV.textContent = Math.round(state.samples).toString();

  const sig = SIG_BY_ID[state.signalId];
  applyParamVisibility(sig);
  const { t, y, dt, N, p } = buildSamples();

  // ana çizim
  const main = prep(canvasMain);
  const arrs = [y];
  let xe, xo;
  if (state.showEvenOdd) {
    const eo = evenOddSplit(t, y);
    xe = eo.xe; xo = eo.xo;
    arrs.push(xe); arrs.push(xo);
  }
  const b = bounds(arrs);
  const ax = drawAxes(main.ctx, main.w, main.h, state.tmin, state.tmax, b.mn, b.mx, __i18n(sig.name));

  const style = getComputedStyle(document.body);
  // Ana renk: sinyale özgün; çift/tek ayrışım renkleri sabit CSS değişkenlerinden
  const cMain = SIG_COLORS[sig.id] || style.getPropertyValue('--accent-1').trim() || '#39ff85';
  const cEven = style.getPropertyValue('--color-y').trim() || '#7b8cff';
  const cOdd  = style.getPropertyValue('--color-h').trim() || '#ff8c42';

  // sinyal
  drawCurve(main.ctx, t, y, ax.X, ax.Y, cMain, 2.2);

  // t₀ konumu marker'ı (dikey kesik çizgi)
  if (sig.use.includes('shift') && state.tmin <= state.shift && state.shift <= state.tmax) {
    const xT0 = ax.X(state.shift);
    main.ctx.save();
    main.ctx.setLineDash([4, 4]);
    main.ctx.strokeStyle = style.getPropertyValue('--color-marker').trim() || '#ff4f9a';
    main.ctx.lineWidth = 1.2;
    main.ctx.beginPath();
    main.ctx.moveTo(xT0, ax.padT);
    main.ctx.lineTo(xT0, ax.padT + ax.H);
    main.ctx.stroke();
    main.ctx.setLineDash([]);
    main.ctx.fillStyle = main.ctx.strokeStyle;
    main.ctx.font = '10px "Fira Code", monospace';
    main.ctx.textAlign = 'left';
    main.ctx.fillText(`t₀=${state.shift.toFixed(2)}`, xT0 + 4, ax.padT + 12);
    main.ctx.restore();
  }

  // İstatistikleri güncelle — sinyal döngüsünden sonra
  updateStats(t, y, dt, state.shift, sig);

  if (state.showEvenOdd) {
    drawCurve(main.ctx, t, xe, ax.X, ax.Y, cEven, 1.5);
    drawCurve(main.ctx, t, xo, ax.X, ax.Y, cOdd, 1.5);
    // legend
    main.ctx.font = '11px Saira, sans-serif';
    main.ctx.textAlign = 'left';
    let lx = ax.padL + 10, ly = ax.padT + 28;
    const items = [['x(t)', cMain], ['x_e(t)', cEven], ['x_o(t)', cOdd]];
    for (const [lbl, c] of items) {
      main.ctx.fillStyle = c;
      main.ctx.fillRect(lx, ly - 8, 14, 3);
      main.ctx.fillStyle = style.getPropertyValue('--text-primary').trim() || '#e2e6f0';
      main.ctx.fillText(lbl, lx + 20, ly);
      ly += 14;
    }
  }

  // Türev
  const derivContainer = canvasDeriv.parentElement;
  if (state.showDeriv) {
    derivContainer.style.display = '';
    const d = deriv(y, dt);
    const dctx = prep(canvasDeriv);
    const bd = bounds([d]);
    const axd = drawAxes(dctx.ctx, dctx.w, dctx.h, state.tmin, state.tmax, bd.mn, bd.mx, "dx/dt");
    drawCurve(dctx.ctx, t, d, axd.X, axd.Y, cOdd, 1.8);
  } else {
    derivContainer.style.display = 'none';
  }
  // İntegral
  const integralContainer = canvasIntegral.parentElement;
  if (state.showIntegral) {
    integralContainer.style.display = '';
    const I = integ(y, dt);
    const ictx = prep(canvasIntegral);
    const bi = bounds([I]);
    const axi = drawAxes(ictx.ctx, ictx.w, ictx.h, state.tmin, state.tmax, bi.mn, bi.mx, "∫ x dt");
    drawCurve(ictx.ctx, t, I, axi.X, axi.Y, cEven, 1.8);
  } else {
    integralContainer.style.display = 'none';
  }

  // Türev/İntegral kartını gizle/göster
  const compareCard = document.getElementById('compareCard');
  if (!state.showDeriv && !state.showIntegral) compareCard.style.display = 'none';
  else compareCard.style.display = '';

  // Bilgi paneli güncelle
  updateInfoPanel(sig, p);
}

function updateInfoPanel(sig, p) {
  ui.mainTitle.textContent = `x(t) — ${__i18n(sig.name)}`;
  const inherent = isInherentlyPeriodic(sig.id);
  const isPer = inherent || state.periodic;
  ui.mainBadge.textContent = __i18n(isPer ? {tr:'periyodik',en:'periodic'} : {tr:'aperiyodik',en:'aperiodic'});
  ui.mainBadge.className = 'graph-badge' + (isPer ? '' : ' aperiodic');

  ui.infoName.textContent = __i18n(sig.name);
  ui.infoFormula.innerHTML = sig.formula;
  ui.infoDesc.innerHTML = __i18n(sig.desc);

  const props = sig.props(p);
  // Periyodiklik override — zorlanmış tekrar modunda
  const isAperiodicByDefault = !inherent && /^hay/i.test(String(props.periodic));
  if (state.periodic && isAperiodicByDefault) {
    const T0 = sig.use.includes('width') ? state.width
             : sig.use.includes('sigma') ? state.sigma * 4
             : 2;
    props.periodic = `evet (zorlanmış), $T_0 = ${T0.toFixed(2)}$ s`;
  }

  const rows = [
    [_t({tr: 'periyodik', en: 'periodic'}),               props.periodic],
    [_t({tr: 'çift mi?', en: 'even?'}),                   props.even],
    [_t({tr: 'tek mi?',  en: 'odd?'}),                    props.odd],
    [_t({tr: 'enerji sinyali', en: 'energy signal'}),     props.energySig],
    [_t({tr: 'güç sinyali', en: 'power signal'}),         props.powerSig],
    [_t({tr: 'kausal (nedensel)', en: 'causal'}),         props.causal],
    [_t({tr: 'sınırlı (bounded)', en: 'bounded'}),        props.bounded],
    [_t({tr: 'türev', en: 'derivative'}),                 props.deriv],
    [_t({tr: 'integral', en: 'integral'}),                props.integral],
  ];
  ui.propTable.innerHTML = rows.map(([k, v]) => {
    let cls = '';
    if (typeof v === 'string') {
      // Sınıf tespiti TR değer üzerinden — translate ÖNCE class belirle
      if (/^evet/i.test(v)) cls = 'prop-yes';
      else if (/^hayır/i.test(v)) cls = 'prop-no';
    }
    // Sonra dil dönüşümü uygula (EN için)
    const v2 = __propI18n(v);
    return `<tr><td>${k}</td><td class="${cls}">${v2}</td></tr>`;
  }).join('');

  // KaTeX yeniden render et
  renderMath(ui.infoFormula);
  renderMath(ui.infoDesc);
  renderMath(ui.propTable);
  renderMath(document.querySelector('.primary-graph-header'));
}

function renderMath(el) {
  if (!el || !window.renderMathInElement) return;
  try {
    window.renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  } catch (e) { /* yoksay */ }
}

// ---------- Tema değişikliğinde yeniden çiz ----------
const observer = new MutationObserver(() => {
  buildGallery();
  redraw();
});
observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('resize', () => {
  buildGallery();
  redraw();
});

// ---------- İlk çalıştırma ----------
function waitForKatex(cb, tries = 0) {
  if (window.renderMathInElement) { cb(); return; }
  if (tries > 40) { cb(); return; } // ~2 sn sonra yine de devam et
  setTimeout(() => waitForKatex(cb, tries + 1), 50);
}

function init() {
  buildGallery();
  // İlk redraw — slider'lar ve canvas için
  setTimeout(() => {
    redraw();
    document.querySelectorAll('.sig-card .thumb').forEach(c => drawThumb(c, c.dataset.id));
    // KaTeX yüklenince info panelini bir kez daha render et
    waitForKatex(() => redraw());
  }, 30);
}
init();
