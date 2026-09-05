/* Hasnaria sales-board multipart loader v29 — Tahunan omzet key fix */
(function () {
  var PARTS = [
    '/sales-board.part0.js?v=29',
    '/sales-board.part1.js?v=29',
    '/sales-board.part2.js?v=29',
    '/sales-board.part3.js?v=29',
    '/sales-board.part4.js?v=29'
  ];
  function fail(e) {
    console.error('Hasnaria sales-board load failed:', e);
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
  }).catch(fail);
})();
