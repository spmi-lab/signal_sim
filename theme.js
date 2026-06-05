// theme.js — paylaşılan tema değiştirici
// nav-home → Gabor ikonu üstte, yazı altta + 3 grubu kendi panelinde topla
(function navTabsEnhance() {
  function buildGaborPath() {
    const W = 72, H = 40, cx = W/2, cy = H/2, sigma = W/6.5, f = 0.20;
    let d = '';
    for (let x = 0; x <= W; x++) {
      const t = x - cx;
      const env = Math.exp(-(t*t) / (2 * sigma * sigma));
      const y = cy - (H/2 - 4) * env * Math.cos(2 * Math.PI * f * t);
      d += (x === 0 ? 'M' : 'L') + x + ',' + y.toFixed(2) + ' ';
    }
    return `<svg class="gabor-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="${d.trim()}"/></svg>`;
  }
  function transform() {
    // Ana Sayfa: ikon (Gabor) + yazı
    document.querySelectorAll('.nav-home').forEach(el => {
      if (el.querySelector('.gabor-svg')) return;
      const txt = el.textContent.trim();
      const m = txt.match(/^(\p{Extended_Pictographic}|🏠|\S+?)\s+(.+)$/u);
      const lb = m ? m[2] : txt;
      el.innerHTML = `<span class="home-ic">${buildGaborPath()}</span><span class="home-tx">${lb}</span>`;
    });
    // Üç grubu paneline sar (etiket+satır eşleri)
    document.querySelectorAll('.nav-tabs').forEach(nav => {
      if (nav.querySelector('.nav-groups-panel')) return;
      const labels = Array.from(nav.querySelectorAll('.nav-group-label'));
      if (!labels.length) return;
      const panel = document.createElement('div');
      panel.className = 'nav-groups-panel';
      labels.forEach(lbl => {
        const row = document.createElement('div');
        row.className = 'nav-tabs-row';
        let s = lbl.nextElementSibling;
        while (s && !s.classList.contains('nav-group-label') && !s.classList.contains('nav-home')) {
          const next = s.nextElementSibling;
          if (s.classList.contains('nav-tab')) row.appendChild(s);
          else if (s.classList.contains('nav-group-sep')) s.remove();
          s = next;
        }
        panel.appendChild(lbl);
        panel.appendChild(row);
      });
      nav.querySelectorAll('.nav-group-sep').forEach(s => s.remove());
      nav.appendChild(panel);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', transform);
  } else {
    transform();
  }
})();
(function () {
  const KEY = 'convolution-theme';
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  function apply(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      btn.textContent = '☀️';
      btn.title = 'Açık tema — koyu temaya geç';
    } else {
      document.body.classList.remove('light-theme');
      btn.textContent = '🌙';
      btn.title = 'Koyu tema — açık temaya geç';
    }
  }

  // Başlangıç teması
  const saved = (function () {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  })() || 'dark';
  apply(saved);

  btn.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light-theme');
    const next = isLight ? 'dark' : 'light';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (_) {}
    // Tema değişti — render'a haber ver (varsa)
    if (typeof window.onThemeChange === 'function') {
      window.onThemeChange(next);
    }
  });
})();
