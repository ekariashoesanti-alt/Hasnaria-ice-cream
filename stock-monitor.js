/* Hasnaria Stock — lightweight lazy loader */
(function () {
  'use strict';

  if (window.__HASNARIA_STOCK_LAZY_LOADER) return;
  window.__HASNARIA_STOCK_LAZY_LOADER = true;

  function css() {
    var s = document.getElementById('stk-css');
    if (!s) { s = document.createElement('style'); s.id = 'stk-css'; document.head.appendChild(s); }
    s.textContent = '#stok .sr-shell{min-width:0}' +
      '#pembelian .pa-lower-grid>article:has(.pa-stock-grid){display:none!important}' +
      '@media(min-width:980px){#pembelian .pa-lower-grid:has(>article:has(.pa-stock-grid)){grid-template-columns:minmax(0,1.72fr) minmax(225px,.68fr)!important}}' +
      '@media(min-width:980px) and (max-width:1450px){#pembelian .pa-lower-grid:has(>article:has(.pa-stock-grid)){grid-template-columns:minmax(0,1.6fr) minmax(205px,.65fr)!important}}' +
      '#stok .sr-purchase-status{margin:0 0 10px;min-width:0}' +
      '#stok .sr-purchase-status-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 7px;padding:0 2px}' +
      '#stok .sr-purchase-status-head>div{display:flex;flex-direction:column;gap:2px;min-width:0}' +
      '#stok .sr-purchase-status-head strong{font-size:12px;color:#153e32}' +
      '#stok .sr-purchase-status-head span{font-size:9px;color:#7a8882;overflow-wrap:anywhere}' +
      '#stok .sr-purchase-status-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;min-width:0}' +
      '#stok .sr-cycle-card{min-width:0;background:#fff;border:1px solid #dfe8e4;border-radius:13px;padding:10px 11px;overflow:hidden}' +
      '#stok .sr-cycle-card-muted{background:#fbfdfc}' +
      '#stok .sr-cycle-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}' +
      '#stok .sr-cycle-card-head h3{margin:0;font-size:12px;color:#153e32;min-width:0}' +
      '#stok .sr-cycle-card-head>span{flex:0 0 auto;padding:3px 7px;border-radius:999px;background:#e5f3ed;color:#125644;font-size:8px;font-weight:900;white-space:nowrap}' +
      '#stok .sr-cycle-card>p{margin:3px 0 7px;font-size:8px;line-height:1.25;color:#728079}' +
      '#stok .sr-cycle-list{display:grid;gap:4px;min-width:0}' +
      '#stok .sr-cycle-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 7px;align-items:center;min-width:0;padding:5px 7px;border:1px solid #e5ece8;border-radius:8px;background:#fff}' +
      '#stok .sr-cycle-item>span{min-width:0;font-size:9px;font-weight:800;color:#173c31;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#stok .sr-cycle-item>b{font-size:7.5px;line-height:1;padding:3px 6px;border-radius:999px;background:#edf5f2;color:#125644;white-space:nowrap}' +
      '#stok .sr-cycle-item>small{grid-column:1/-1;min-width:0;font-size:7px;line-height:1.15;color:#84918c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#stok .sr-cycle-card-muted .sr-cycle-item>b{background:#f0f1ef;color:#6f7773}' +
      '#stok .sr-cycle-more{font-size:7.5px;color:#75827c;text-align:right;margin-top:4px}' +
      '#stok .sr-cycle-empty{min-height:52px;display:grid;place-items:center;padding:8px;text-align:center;color:#83908a;font-size:8.5px;border:1px dashed #dfe8e4;border-radius:8px;background:#fbfdfc}' +
      '@media(max-width:760px){#stok .sr-purchase-status-grid{grid-template-columns:1fr}#stok .sr-purchase-status-head{align-items:flex-start}}';
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

  function loadOperationalBridge() {
    if (window.__HASNARIA_OPERATIONAL_ROLE_BRIDGE || document.getElementById('hasnaria-operational-role-bridge-loader')) return;
    var append = function () {
      if (window.__HASNARIA_OPERATIONAL_ROLE_BRIDGE || document.getElementById('hasnaria-operational-role-bridge-loader')) return;
      var s = document.createElement('script');
      s.id = 'hasnaria-operational-role-bridge-loader';
      s.src = '/operational-role-bridge.js?v=1';
      s.async = true;
      document.head.appendChild(s);
    };
    if (window.requestIdleCallback) window.requestIdleCallback(append, { timeout: 1200 });
    else setTimeout(append, 600);
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
  loadOperationalBridge();
  setTimeout(maybeLoad, 250);
  setTimeout(maybeLoad, 1200);
})();
