/* Hasnaria sales-board multipart loader v38 — with visible error */
(function () {
  var PARTS = [
    '/sales-board.part0.js?v=38',
    '/sales-board.part1.js?v=38',
    '/sales-board.part2.js?v=38',
    '/sales-board.part3.js?v=38',
    '/sales-board.part4.js?v=38'
  ];

  function showError(msg) {
    var host = document.getElementById('sales');
    if (!host) { console.error('Hasnaria sales-board load failed:', msg); return; }
    host.innerHTML = '<div style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:12px 0;font-family:sans-serif;font-size:13px"><b>Dashboard Penjualan gagal dimuat.</b><br>Coba refresh halaman (tekan F5). Kalau masih gagal, screenshot pesan ini dan kirim ke admin:<br><code style="font-size:11px;word-break:break-all">' + String(msg) + '</code></div>';
  }
  function fail(e) { console.error('Hasnaria sales-board load failed:', e); showError(e && e.message ? e.message : e); }

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
  }).catch(fail);
})();
