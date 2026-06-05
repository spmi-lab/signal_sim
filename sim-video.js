(function () {
  'use strict';

  /* ---- Slug ve dil ---- */
  var path = location.pathname.replace(/\\/g, '/');
  var file = (path.split('/').pop() || '').replace(/\.html?$/i, '');
  if (!file) return;

  var lang = (window._lang || (path.indexOf('/en/') !== -1 ? 'en' : 'tr'));
  var i18n = {
    tr: { btn: 'Video Rehberi', open: 'Videoyu Aç', close: 'Kapat', missing: 'Bu simülasyon için video henüz eklenmemiştir.' },
    en: { btn: 'Video Guide',   open: 'Open Video', close: 'Close', missing: 'No video has been added for this simulation yet.' }
  };
  var i18nExtra = {
    tr: { yt: 'YouTube\'da Aç' },
    en: { yt: 'Open on YouTube' }
  };
  var t = i18n[lang] || i18n.tr;
  var tx = i18nExtra[lang] || i18nExtra.tr;

  /* ---- Stiller (neon parıltı, modal, ışıma) ---- */
  function injectStyles() {
    if (document.getElementById('simVideoStyles')) return;
    var s = document.createElement('style');
    s.id = 'simVideoStyles';
    s.textContent =
      // Oval pill düğme: sürekli açık-turuncu neon sınır (sabit) + üzerinden
      // dolanan parlak ışık noktası.
      '.sv-play-btn{display:inline-flex;align-items:center;justify-content:center;' +
      'width:38px;height:28px;margin-left:0.55rem;vertical-align:middle;' +
      'border-radius:999px;cursor:pointer;text-decoration:none;' +
      'background:transparent;color:inherit;' +
      'transition:transform .25s ease, filter .3s ease;' +
      'position:relative;top:-0.12em;isolation:isolate;' +
      '-webkit-tap-highlight-color:transparent;' +
      // Genel hafif neon halo (arka plan ışıması)
      'filter:drop-shadow(0 0 4px rgba(255,170,90,0.45))}' +
      // SABİT açık-turuncu neon sınır (border + iç glow)
      '.sv-play-btn::after{content:"";position:absolute;inset:0;' +
      'border-radius:inherit;pointer-events:none;z-index:1;' +
      'border:1.4px solid rgba(255,170,90,0.65);' +
      'box-shadow:0 0 6px rgba(255,170,90,0.45),' +
      '0 0 14px rgba(255,170,90,0.22),' +
      'inset 0 0 7px rgba(255,170,90,0.18)}' +
      // ÇİZGİNİN ÜZERİNDE dolanan parlak ışık noktası
      // conic-gradient'in dar bir bölümü parlak, gerisi şeffaf
      '.sv-play-btn::before{content:"";position:absolute;inset:-1px;' +
      'border-radius:inherit;padding:2px;' +
      'background:conic-gradient(from 0deg,' +
      'transparent 0deg,' +
      'transparent 338deg,' +
      'rgba(255,210,140,0.85) 346deg,' +
      '#fff3d6 352deg,' +
      'rgba(255,210,140,0.85) 358deg,' +
      'transparent 360deg);' +
      // Sadece halka (ring) görünür: padding-box ile içeri maskele
      '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
      '-webkit-mask-composite:xor;' +
      'mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
      'mask-composite:exclude;' +
      'animation:sv-spin 3.4s linear infinite;' +
      'filter:drop-shadow(0 0 3px #ffd89a) drop-shadow(0 0 6px #ffaa55);' +
      'pointer-events:none;z-index:2}' +
      '.sv-play-btn svg{position:relative;z-index:3;width:11px;height:11px;' +
      'color:rgba(255,200,140,0.9);transition:transform .25s ease, color .25s ease}' +
      '.sv-play-btn:hover{transform:translateY(-1px);' +
      'filter:drop-shadow(0 0 6px rgba(255,170,90,0.9)) drop-shadow(0 0 14px rgba(255,170,90,0.55))}' +
      '.sv-play-btn:hover svg{transform:scale(1.15);color:#fff3d6}' +
      '.sv-play-btn:hover::before{animation-duration:1.6s}' +
      '@keyframes sv-spin{to{transform:rotate(360deg)}}' +
      'body.light-theme .sv-play-btn::after{border-color:rgba(210,110,30,0.65);' +
      'box-shadow:0 0 6px rgba(210,110,30,0.35),inset 0 0 6px rgba(210,110,30,0.15)}' +

      '.sv-modal{position:fixed;inset:0;background:rgba(2,4,12,0.78);' +
      'backdrop-filter:blur(6px);z-index:99998;display:none;' +
      'align-items:center;justify-content:center;padding:1.2rem}' +
      '.sv-modal.open{display:flex}' +
      '.sv-modal-card{background:#0d1020;border:1.5px solid rgba(120,160,255,0.35);' +
      'border-radius:14px;padding:1rem;max-width:980px;width:100%;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.55), 0 0 24px rgba(120,160,255,0.18)}' +
      '.sv-modal-head{display:flex;justify-content:space-between;align-items:center;' +
      "font-family:'Saira Condensed',sans-serif;font-weight:700;letter-spacing:.06em;" +
      'color:#cfd6ee;margin-bottom:0.6rem}' +
      '.sv-modal-actions{display:inline-flex;gap:0.5rem;align-items:center}' +
      '.sv-modal-yt{font-family:inherit;font-size:.78rem;letter-spacing:.04em;' +
      'border:1px solid #ff8c42;color:#ff8c42;background:transparent;' +
      'border-radius:8px;padding:0.3rem 0.7rem;text-decoration:none;' +
      'transition:background .2s ease,color .2s ease,box-shadow .25s ease}' +
      '.sv-modal-yt:hover{background:#ff8c42;color:#0d1020;' +
      'box-shadow:0 0 12px rgba(255,140,66,0.55)}' +
      '.sv-modal-close{background:transparent;border:1px solid #8aa0d8;color:#8aa0d8;' +
      'border-radius:8px;padding:0.3rem 0.7rem;cursor:pointer;font-size:.78rem}' +
      '.sv-modal-close:hover{background:#8aa0d8;color:#0d1020}' +
      '.sv-modal-frame-wrap{position:relative;width:100%;aspect-ratio:16/9;' +
      'background:#000;border-radius:8px;overflow:hidden}' +
      '.sv-modal-frame-wrap iframe{position:absolute;inset:0;width:100%;height:100%;' +
      'border:0}' +
      'body.light-theme .sv-modal{background:rgba(232,236,248,0.78)}' +
      'body.light-theme .sv-modal-card{background:#fff;border-color:#2846aa;color:#1a2240}';
    document.head.appendChild(s);
  }

  /* ---- YouTube / Dailymotion URL → embed ---- */
  function toEmbed(url) {
    url = (url || '').trim();
    if (!url) return null;
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = url.match(/dailymotion\.com\/video\/([^?/]+)/);
    if (m) return 'https://www.dailymotion.com/embed/video/' + m[1];
    return url; // bilinmiyorsa olduğu gibi dene
  }

  /* ---- Modal ---- */
  var modal, frameWrap, ytLink;
  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'sv-modal';
    modal.innerHTML =
      '<div class="sv-modal-card">' +
        '<div class="sv-modal-head">' +
          '<span>▶ ' + t.btn + '</span>' +
          '<span class="sv-modal-actions">' +
            '<a class="sv-modal-yt" target="_blank" rel="noopener noreferrer">↗ ' + tx.yt + '</a>' +
            '<button type="button" class="sv-modal-close">✕ ' + t.close + '</button>' +
          '</span>' +
        '</div>' +
        '<div class="sv-modal-frame-wrap"></div>' +
      '</div>';
    document.body.appendChild(modal);
    frameWrap = modal.querySelector('.sv-modal-frame-wrap');
    ytLink = modal.querySelector('.sv-modal-yt');
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.classList.contains('sv-modal-close')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }
  function openModal(embedUrl, externalUrl) {
    ensureModal();
    frameWrap.innerHTML = '<iframe src="' + embedUrl +
      '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    if (ytLink) ytLink.href = externalUrl || embedUrl;
    modal.classList.add('open');
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    if (frameWrap) frameWrap.innerHTML = '';
  }

  /* ---- Başlık yanı butonu — yeni sekmede YouTube ---- */
  function injectButton(embedUrl, externalUrl) {
    var title = document.querySelector('h1.site-title') || document.querySelector('header.site-header h1') || document.querySelector('h1');
    if (!title || title.querySelector('.sv-play-btn')) return;
    var ext = externalUrl || embedUrl;
    var btn = document.createElement('a');
    btn.href = ext;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.className = 'sv-play-btn';
    btn.title = t.open;
    btn.setAttribute('aria-label', t.open);
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="M8 5.5v13l11-6.5z"/>' +
      '</svg>';
    title.appendChild(document.createTextNode(' '));
    title.appendChild(btn);
  }

  /* ---- Sayfa altı footer yazısı — tıklanınca yeni sekmede YouTube ---- */
  function wireFooter(embedUrl, externalUrl) {
    var foot = document.querySelector('footer.site-footer');
    if (!foot || foot.dataset.svWired) return;
    foot.dataset.svWired = '1';
    foot.style.cursor = 'pointer';
    foot.title = t.open;
    var ext = externalUrl || embedUrl;
    foot.addEventListener('click', function (e) {
      // İçinde başka bir link varsa, ona dokunma
      if (e.target && e.target.closest('a')) return;
      e.preventDefault();
      window.open(ext, '_blank', 'noopener,noreferrer');
    });
    // Hafif görsel ipucu: küçük "▶" eki
    if (!foot.querySelector('.sv-foot-hint')) {
      var hint = document.createElement('span');
      hint.className = 'sv-foot-hint';
      hint.textContent = ' ▶';
      hint.style.cssText = 'margin-left:0.4rem;opacity:0.45;font-size:0.85em;transition:opacity .25s ease;';
      foot.appendChild(hint);
      foot.addEventListener('mouseenter', function(){ hint.style.opacity='1'; });
      foot.addEventListener('mouseleave', function(){ hint.style.opacity='0.45'; });
    }
  }

  /* ---- Akış ---- */
  function init() {
    injectStyles();
    // file:// protokolünde fetch() CORS sebebiyle çalışmaz.
    // Bu yüzden videos.js dosyası <script> ile yüklenip
    // window.SPMI_VIDEOS olarak global bırakılır.
    var data = (typeof window !== 'undefined' && window.SPMI_VIDEOS) || {};
    var raw = data[file];
    if (!raw) return;
    var embed = toEmbed(raw);
    if (!embed) return;
    injectButton(embed, raw);
    wireFooter(embed, raw);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
