/* Hasnaria Stock — reconciliation UI loader */
(function () {
  'use strict';

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

  function localToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function guardFutureDates() {
    function apply(el) {
      if (!el || (el.id !== 'srBuyDate' && el.id !== 'srOpnameDate')) return;
      var max = localToday();
      el.max = max;
      if (el.value && el.value > max) el.value = max;
    }
    document.addEventListener('focusin', function (e) { apply(e.target); }, true);
    document.addEventListener('change', function (e) { apply(e.target); }, true);
  }

  function loadPurchaseCycleStatus() {
    if (window.__HASNARIA_STOCK_PURCHASE_STATUS || document.getElementById('hasnaria-stock-purchase-status-loader')) return;
    var s = document.createElement('script');
    s.id = 'hasnaria-stock-purchase-status-loader';
    s.src = '/stock-purchase-status.js?v=1';
    s.async = false;
    s.onerror = function () { console.error('Hasnaria Stock purchase-cycle status gagal dimuat.'); };
    document.head.appendChild(s);
  }

  function loadReconciliation() {
    if (window.__HASNARIA_STOCK_RECONCILE_LOADING) return;
    window.__HASNARIA_STOCK_RECONCILE_LOADING = true;
    var s = document.createElement('script');
    s.src = '/stock-reconcile-v2.js?v=1';
    s.async = false;
    s.onload = function () { window.__HASNARIA_STOCK_RECONCILE_READY = true; loadPurchaseCycleStatus(); };
    s.onerror = function () {
      window.__HASNARIA_STOCK_RECONCILE_LOADING = false;
      console.error('Hasnaria Stock reconciliation module gagal dimuat.');
      var host = document.getElementById('stok');
      if (host && !host.querySelector('.sr-shell')) {
        host.innerHTML = '<div class="card"><h2>Stok</h2><p class="msg">Modul rekonsiliasi stok gagal dimuat. Refresh halaman atau coba lagi nanti.</p></div>';
      }
    };
    document.head.appendChild(s);
  }

  css();
  guardFutureDates();
  loadPurchaseCycleStatus();
  loadReconciliation();
})();
