/* Hasnaria sales-board multipart loader v40 — restore Penjualan tab + visible errors */
(function () {
  'use strict';

  var PARTS = [
    '/sales-board.part0.js?v=40',
    '/sales-board.part1.js?v=40',
    '/sales-board.part2.js?v=40',
    '/sales-board.part3.js?v=40',
    '/sales-board.part4.js?v=40'
  ];

  function showError(msg) {
    var host = document.getElementById('sales');
    if (!host) { console.error('Hasnaria sales-board load failed:', msg); return; }
    host.innerHTML = '<div style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:12px 0;font-family:sans-serif;font-size:13px"><b>Dashboard Penjualan gagal dimuat.</b><br>Coba refresh halaman (tekan F5). Kalau masih gagal, screenshot pesan ini dan kirim ke admin:<br><code style="font-size:11px;word-break:break-all">' + String(msg) + '</code></div>';
  }
  function fail(e) { console.error('Hasnaria sales-board load failed:', e); showError(e && e.message ? e.message : e); }

  // Safety net: the core app normally creates the Penjualan tab, but if a
  // cache/version race leaves it out, recreate it here and wire the view
  // directly so the tab can never disappear.
  function ensureSalesTab() {
    var tabs = document.getElementById('tabs');
    if (!tabs) return false;
    var btn = tabs.querySelector('[data-tab="sales"]');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab';
      btn.setAttribute('data-tab', 'sales');
      btn.setAttribute('aria-label', 'Penjualan');
      btn.textContent = 'Penjualan';
      tabs.insertBefore(btn, tabs.firstChild ? tabs.children[1] || null : null);
    }
    btn.style.display = '';
    btn.textContent = 'Penjualan';
    btn.onclick = function () {
      ['dashboard','sales','ops','stok','shift','social','approval','team','sistem'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== 'sales');
      });
      tabs.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b === btn); });
      setTimeout(function () {
        if (typeof window.__hasnariaReloadSales === 'function') window.__hasnariaReloadSales();
      }, 80);
    };
    return true;
  }

  function watchSalesTab() {
    var tries = 0;
    function tick() {
      if (ensureSalesTab() || tries++ > 80) return;
      setTimeout(tick, 100);
    }
    tick();
    try {
      var tabs = document.getElementById('tabs');
      if (tabs && window.MutationObserver) {
        new MutationObserver(function () { ensureSalesTab(); }).observe(tabs, { childList: true });
      }
    } catch (_) {}
  }

  Promise.all(PARTS.map(function (u) {
    return fetch(u, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(u + ' HTTP ' + r.status);
      return r.text();
    });
  })).then(function (chunks) {
    var code = chunks.join('');
    if (code.indexOf('Hasnaria Sales') < 0) throw new Error('reassembled sales-board looks empty');
    var s = document.createElement('script');
    s.text = code;
    document.head.appendChild(s);
    watchSalesTab();
  }).catch(fail);
})();
