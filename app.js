(function () {
  'use strict';
  var CORE = 'https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js';
  var STOCK = '/stock-monitor.js?v=4';
  function load(src, done) {
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = function () { if (done) done(); };
    s.onerror = function () { console.error('Hasnaria module gagal dimuat:', src); if (done) done(); };
    document.head.appendChild(s);
  }
  function fixStockLayout() {
    if (!document.getElementById('hasnaria-stock-layout-fix')) {
      var st = document.createElement('style');
      st.id = 'hasnaria-stock-layout-fix';
      st.textContent = '#stok .stk-form{grid-template-columns:minmax(140px,1.15fr) minmax(130px,.82fr) minmax(130px,.82fr) minmax(250px,1.55fr) minmax(180px,.9fr) 112px!important;align-items:start!important}' +
        '#stok .stk-save{grid-column:auto!important;grid-row:auto!important;align-self:stretch!important;width:112px!important;min-width:112px!important;height:70px!important;margin:0!important}' +
        '#stok .stk-buy-row .unit{white-space:nowrap!important}' +
        '@media(max-width:1100px){#stok .stk-form{grid-template-columns:1fr 1fr!important}#stok .stk-buy{grid-column:1/-1!important}#stok .stk-save{grid-column:1/-1!important;width:100%!important;height:58px!important}}' +
        '@media(max-width:700px){#stok .stk-form{grid-template-columns:1fr!important}#stok .stk-buy{grid-column:auto!important}#stok .stk-save{grid-column:auto!important;width:100%!important}}';
      document.head.appendChild(st);
    }
    var host = document.getElementById('stok');
    if (!host) return;
    var qtyUnit = host.querySelector('#stkBuy') && host.querySelector('#stkBuy').parentElement ? host.querySelector('#stkBuy').parentElement.querySelector('.unit') : null;
    var priceBox = host.querySelector('#stkBuyPrice') && host.querySelector('#stkBuyPrice').parentElement ? host.querySelector('#stkBuyPrice').parentElement : null;
    if (qtyUnit) qtyUnit.textContent = 'pcs';
    if (priceBox) {
      var units = priceBox.querySelectorAll('.unit');
      if (units.length) units[units.length - 1].textContent = '/ pcs';
    }
  }
  function afterCore() {
    load(STOCK, function () {
      fixStockLayout();
      new MutationObserver(function () { fixStockLayout(); }).observe(document.body, { childList: true, subtree: true });
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
