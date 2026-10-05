/* Hasnaria Purchase analytics — lazy runtime loader.
 * Purchase stays lazy for performance, but Owner is allowed to load it when
 * Pembelian is opened. The Owner shell no longer replaces Pembelian with the
 * executive summary renderer.
 */
(function () {
  'use strict';
  if (window.__HASNARIA_PURCHASE_LAZY_LOADER) return;
  window.__HASNARIA_PURCHASE_LAZY_LOADER = true;

  var loading = null;
  var loaded = false;

  function purchaseVisible() {
    var host = document.getElementById('pembelian');
    return !!(host && !host.classList.contains('hidden'));
  }

  function ensureCss() {
    if (document.getElementById('hasnaria-purchase-analytics-css')) return;
    var link = document.createElement('link');
    link.id = 'hasnaria-purchase-analytics-css';
    link.rel = 'stylesheet';
    link.href = '/purchase-analytics.css?v=1';
    document.head.appendChild(link);
  }

  function ensureRuntime() {
    if (loaded) return Promise.resolve(true);
    if (window.__HASNARIA_PURCHASE_ANALYTICS) { loaded = true; return Promise.resolve(true); }
    if (loading) return loading;
    ensureCss();
    loading = new Promise(function (resolve, reject) {
      var old = document.getElementById('hasnaria-purchase-analytics-js');
      if (old) {
        if (window.__HASNARIA_PURCHASE_ANALYTICS) { loaded = true; resolve(true); return; }
        old.addEventListener('load', function () { loaded = true; resolve(true); }, { once: true });
        old.addEventListener('error', function () { loading = null; reject(new Error('Purchase analytics gagal dimuat.')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.id = 'hasnaria-purchase-analytics-js';
      script.src = '/purchase-analytics.js?v=4';
      script.async = true;
      script.onload = function () { loaded = true; resolve(true); };
      script.onerror = function () { loading = null; reject(new Error('Purchase analytics gagal dimuat.')); };
      document.head.appendChild(script);
    });
    return loading;
  }

  function maybeLoad() {
    if (!purchaseVisible()) return;
    ensureRuntime().catch(function (error) {
      if (window.console && console.warn) console.warn('Purchase lazy loader:', error && error.message ? error.message : error);
    });
  }

  document.addEventListener('click', function (event) {
    var tab = event.target && event.target.closest ? event.target.closest('[data-tab="pembelian"]') : null;
    if (!tab) return;
    setTimeout(maybeLoad, 30);
  }, true);

  document.addEventListener('hasnaria:context-ready', function () { setTimeout(maybeLoad, 0); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(maybeLoad, 0); }, { once: true });
  else setTimeout(maybeLoad, 0);

  window.HasnariaPurchaseLazy = { load: ensureRuntime };
})();
