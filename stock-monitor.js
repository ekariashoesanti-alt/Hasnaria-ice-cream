/* Hasnaria Stock — reconciliation UI loader */
(function () {
  'use strict';

  function css() {
    var s = document.getElementById('stk-css');
    if (!s) { s = document.createElement('style'); s.id = 'stk-css'; document.head.appendChild(s); }
    s.textContent = '#stok .sr-shell{min-width:0}';
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

  function loadReconciliation() {
    if (window.__HASNARIA_STOCK_RECONCILE_LOADING) return;
    window.__HASNARIA_STOCK_RECONCILE_LOADING = true;
    var s = document.createElement('script');
    s.src = '/stock-reconcile.js?v=1';
    s.async = false;
    s.onload = function () { window.__HASNARIA_STOCK_RECONCILE_READY = true; };
    s.onerror = function () {
      window.__HASNARIA_STOCK_RECONCILE_LOADING = false;
      console.error('Hasnaria Stock reconciliation module gagal dimuat.');
    };
    document.head.appendChild(s);
  }

  css();
  guardFutureDates();
  loadReconciliation();
})();
