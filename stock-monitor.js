/* Hasnaria Stock — lightweight lazy loader */
(function () {
  'use strict';

  if (window.__HASNARIA_STOCK_LAZY_LOADER) return;
  window.__HASNARIA_STOCK_LAZY_LOADER = true;

  function css() {
    var s = document.getElementById('stk-css');
    if (!s) { s = document.createElement('style'); s.id = 'stk-css'; document.head.appendChild(s); }
    s.textContent = '#pembelian .pa-lower-grid>article:has(.pa-stock-grid){display:none!important}' +
      '@media(min-width:980px){#pembelian .pa-lower-grid:has(>article:has(.pa-stock-grid)){grid-template-columns:minmax(0,1.72fr) minmax(225px,.68fr)!important}}' +
      '@media(min-width:980px) and (max-width:1450px){#pembelian .pa-lower-grid:has(>article:has(.pa-stock-grid)){grid-template-columns:minmax(0,1.6fr) minmax(205px,.65fr)!important}}';
  }

  function chip(l) { return l; }

  function stockHost() {
    return document.getElementById('stok');
  }

  function stockActive() {
    var host = stockHost();
    return !!(host && !host.classList.contains('hidden'));
  }

  function showOpeningState() {
    var host = stockHost();
    if (!host || host.querySelector('.sc3-shell') || host.querySelector('[data-stock-opening]')) return;
    host.innerHTML = '<div class="card" data-stock-opening="1"><h2>Stok &amp; Kebutuhan Material</h2><p class="small">Menyiapkan data persediaan…</p></div>';
  }

  function loadControl() {
    if (!stockActive()) return;
    if (window.__HASNARIA_STOCK_CONTROL_V3 || document.getElementById('hasnaria-stock-control-v3-loader')) return;

    showOpeningState();
    var s = document.createElement('script');
    s.id = 'hasnaria-stock-control-v3-loader';
    s.src = '/stock-control-v3.js?v=2';
    s.async = true;
    s.onload = function () {
      window.__HASNARIA_STOCK_RECONCILE_READY = true;
    };
    s.onerror = function () {
      var host = stockHost();
      if (host && stockActive()) {
        host.innerHTML = '<div class="card"><h2>Stok</h2><p class="msg">Modul kontrol stok gagal dimuat. Refresh halaman atau coba lagi nanti.</p></div>';
      }
    };
    document.head.appendChild(s);
  }

  function maybeLoad() {
    if (stockActive()) loadControl();
  }

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-tab],.tab') : null;
    if (!el) return;
    var id = el.getAttribute('data-tab');
    var text = String(el.textContent || '').trim().toLowerCase();
    if (id === 'stok' || (!id && text === 'stok')) {
      setTimeout(loadControl, 0);
    }
  }, true);

  css();
  setTimeout(maybeLoad, 250);
  setTimeout(maybeLoad, 1200);
})();
