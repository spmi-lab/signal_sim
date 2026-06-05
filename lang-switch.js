// lang-switch.js — TR/EN language toggle (folder-based i18n)
(function () {
  const STORAGE_KEY = 'spmi_lang';

  function getLang() {
    var p = location.pathname;
    if (p.indexOf('/en/') !== -1) return 'en';
    if (p.indexOf('/tr/') !== -1) return 'tr';
    try { return localStorage.getItem(STORAGE_KEY) || 'tr'; } catch (_) { return 'tr'; }
  }

  window._lang = getLang();

  // _t() for JS-generated strings
  window._t = function (obj) {
    if (typeof obj === 'string') return obj;
    return obj[window._lang] || obj['tr'] || '';
  };

  function switchLang() {
    var current = getLang();
    var next = current === 'en' ? 'tr' : 'en';
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    var p = location.pathname;
    if (p.indexOf('/' + current + '/') !== -1) {
      location.href = p.replace('/' + current + '/', '/' + next + '/');
    } else {
      location.href = p.replace(/\/[^/]*$/, '/' + next + '/index.html');
    }
  }

  function injectToggle() {
    if (document.getElementById('langToggle')) return;
    var btn = document.createElement('button');
    btn.id = 'langToggle';
    btn.className = 'lang-toggle';
    btn.textContent = window._lang === 'en' ? 'TR' : 'EN';
    btn.title = window._lang === 'en' ? 'Switch to Turkish' : 'Switch to English';
    btn.addEventListener('click', switchLang);
    document.body.appendChild(btn);

    var style = document.createElement('style');
    style.textContent =
      '.lang-toggle{position:fixed;top:1rem;right:4.2rem;z-index:9999;' +
      'background:var(--bg-panel,rgba(20,24,40,0.85));' +
      'border:1.5px solid var(--accent-1,#39ff85);color:var(--accent-1,#39ff85);' +
      "font-family:'Fira Code','Saira Condensed',monospace;" +
      'font-size:.78rem;font-weight:700;letter-spacing:.1em;' +
      'padding:.45rem .7rem;border-radius:8px;cursor:pointer;transition:all .2s ease;' +
      'backdrop-filter:blur(8px)}' +
      '.lang-toggle:hover{background:var(--accent-1,#39ff85);color:#06060f;' +
      'transform:translateY(-1px);box-shadow:0 4px 12px rgba(57,255,133,.35)}' +
      'body.light-theme .lang-toggle{background:#fff;border-color:#2846aa;color:#2846aa}' +
      'body.light-theme .lang-toggle:hover{background:#2846aa;color:#fff}';
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle);
  } else {
    injectToggle();
  }
})();
