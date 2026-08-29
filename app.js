(function () {
  'use strict';
  var CORE = 'https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js';
  var STOCK = '/stock-monitor.js?v=6';
  function load(src, done) {
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = function () { if (done) done(); };
    s.onerror = function () { console.error('Hasnaria module gagal dimuat:', src); if (done) done(); };
    document.head.appendChild(s);
  }
  function fixStockLayout() {
    var id = 'hasnaria-stock-layout-fix';
    var st = document.getElementById(id);
    if (!st) {
      st = document.createElement('style');
      st.id = id;
      document.head.appendChild(st);
    }
    st.textContent =
      '#stok .stk-form{' +
      'display:grid!important;' +
      'grid-template-columns:minmax(135px,1.05fr) minmax(120px,.78fr) minmax(120px,.78fr) minmax(215px,1.30fr) minmax(165px,.88fr) 112px!important;' +
      'gap:10px!important;' +
      'align-items:start!important;' +
      'width:100%!important;' +
      '}' +
      '#stok .stk-form>.stk-buy{' +
      'border:0!important;' +
      'padding:0!important;' +
      'background:transparent!important;' +
      'border-radius:0!important;' +
      '}' +
      '#stok .stk-form>.stk-save{' +
      'grid-column:6!important;' +
      'grid-row:1!important;' +
      'align-self:stretch!important;' +
      'justify-self:stretch!important;' +
      'width:112px!important;' +
      'min-width:112px!important;' +
      'height:70px!important;' +
      'margin:0!important;' +
      '}' +
      '#stok .stk-save .ico{' +
      'display:none!important;' +
      '}' +
      '#stok .stk-save{' +
      'padding:8px 10px!important;' +
      'gap:2px!important;' +
      'font-size:16px!important;' +
      '}' +
      '#stok .stk-save small{' +
      'font-size:10px!important;' +
      'line-height:1.15!important;' +
      '}' +
      '#stok .stk-form>.stk-buy .stk-buy-row{' +
      'background:#fff!important;' +
      '}' +
      '#stok .stk-form>.stk-buy .stk-hint{' +
      'padding-left:0!important;' +
      '}' +
      '#stok .stk-form>.stk-buy .unit{white-space:nowrap!important;}' +
      '@media(max-width:1100px){' +
      '#stok .stk-form{grid-template-columns:1fr 1fr!important;}' +
      '#stok .stk-buy{grid-column:1/-1!important;}' +
      '#stok .stk-save{grid-column:1/-1!important;grid-row:auto!important;width:100%!important;height:58px!important;}' +
      '}' +
      '@media(max-width:700px){' +
      '#stok .stk-form{grid-template-columns:1fr!important;}' +
      '#stok .stk-buy{grid-column:auto!important;}' +
      '#stok .stk-save{grid-column:auto!important;width:100%!important;}' +
      '}';
    var host = document.getElementById('stok');
    if (!host) return;
    var qty = host.querySelector('#stkBuy');
    var qtyUnit = qty && qty.parentElement ? qty.parentElement.querySelector('.unit') : null;
    if (qtyUnit) qtyUnit.textContent = 'pcs';
    var price = host.querySelector('#stkBuyPrice');
    var priceBox = price && price.parentElement ? price.parentElement : null;
    if (priceBox) {
      var units = priceBox.querySelectorAll('.unit');
      if (units.length) units[units.length - 1].textContent = '/ pcs';
    }
  }
  function afterCore() {
    load(STOCK, function () {
      fixStockLayout();
      setTimeout(fixStockLayout, 150);
      setTimeout(fixStockLayout, 500);
      setTimeout(fixStockLayout, 1200);
    });
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      var id = b.id || '';
      var watch = id === 'sSave' || id === 'oSave' || id === 'cSave' || id === 'lzSave' || id === 'svOpen' || id === 'svHand' || id === 'svClose' || b.hasAttribute('data-stk') || b.hasAttribute('data-ok') || b.hasAttribute('data-no') || b.hasAttribute('data-lzok') || b.hasAttribute('data-lzno');
      if (!watch) return;
      if (b.getAttribute('data-busy') === '1') { e.preventDefault(); e.stopImmediatePropagation(); return; }
      b.setAttribute('data-busy', '1');
      setTimeout(function () { try { b.removeAttribute('data-busy'); } catch (_) {} }, 1800);
    }, true);
  }
  load(CORE, afterCore);
})();
