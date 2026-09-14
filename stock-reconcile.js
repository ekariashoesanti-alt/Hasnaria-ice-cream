(async function () {
  try {
    var url = 'https://raw.githubusercontent.com/ekariashoesanti-alt/Hasnaria-ice-cream/ac8e0b32831116f9f6a0d00a75b26b98075b20c4/stock-reconcile.js?cb=srfix1';
    var src = await (await fetch(url, { cache: 'no-store' })).text();
    if (!src || src.indexOf('async function loadAll') < 0) throw new Error('restore fetch failed');
    src = src.replace('/stock-reconcile.css?v=1', '/stock-reconcile.css?v=2');
    src = src.replace(
      '  function renderFilters(showStatus) {\n    return \'<div class="sr-filters">\' +',
      '  function renderFilters(showStatus) {\n    return \'<div class="sr-filters\' + (showStatus ? \'\' : \' sr-filters-2\') + \'">\' +'
    );
    src = src.replace(
      'if (S.category && x.category !== S.category) return false;',
      "if (S.category) { var cat = String(x.category || 'Lainnya'); if (cat !== S.category) return false; }"
    );
    src = src.replace(
      'async function loadAll() {\n    if (S.loading) return;\n    S.loading = true;\n    S.error = \'\';\n    render();\n    var timedOut = false;\n    var loadWatch = setTimeout(function () {\n      if (!S.loading) return;\n      timedOut = true;\n      S.loading = false;\n      if (!S.loaded) {\n        S.error = \'Memuat stok terlalu lama atau gagal. Periksa koneksi lalu tap Refresh.\';\n        render();\n      }\n    }, 20000);\n    try {\n      var items = await request(',
      'async function loadAll() {\n    if (S.loading) return;\n    var loadGen = (S.loadGen = (S.loadGen || 0) + 1);\n    S.loading = true;\n    S.error = \'\';\n    render();\n    var timedOut = false;\n    var loadWatch = setTimeout(function () {\n      if (loadGen !== S.loadGen || !S.loading) return;\n      timedOut = true;\n      S.loading = false;\n      if (!S.loaded) {\n        S.error = \'Memuat stok terlalu lama atau gagal. Periksa koneksi lalu tap Refresh.\';\n        render();\n      }\n    }, 20000);\n    try {\n      var items = await request('
    );
    src = src.replace(
      '}));\n      S.items = items || [];\n\n      var purchases = await request(',
      '}));\n      if (loadGen !== S.loadGen) return;\n      S.items = items || [];\n\n      var purchases = await request('
    );
    src = src.replace(
      '}));\n      S.purchases = purchases || [];\n\n      var opnames = await request(',
      '}));\n      if (loadGen !== S.loadGen) return;\n      S.purchases = purchases || [];\n\n      var opnames = await request('
    );
    src = src.replace(
      '}));\n      S.opnames = opnames || [];\n      S.loaded = true;\n    } catch (e) {\n      if (!timedOut) S.error = e && e.message ? e.message : String(e);\n    } finally {\n      clearTimeout(loadWatch);\n      if (!timedOut) {\n        S.loading = false;\n        render();\n      }\n    }\n  }',
      '}));\n      if (loadGen !== S.loadGen) return;\n      S.opnames = opnames || [];\n      S.loaded = true;\n      S.error = \'\';\n    } catch (e) {\n      if (loadGen !== S.loadGen) return;\n      S.error = e && e.message ? e.message : String(e);\n    } finally {\n      clearTimeout(loadWatch);\n      if (loadGen === S.loadGen) {\n        S.loading = false;\n        render();\n      }\n    }\n  }'
    );
    (0, eval)(src);
    window.__HASNARIA_STOCK_RECONCILE_READY = true;
  } catch (e) {
    console.error('[stock-reconcile restore]', e);
    var host = document.getElementById('stok');
    if (host) host.innerHTML = '<div class="card"><p>Gagal memuat modul Stok. Muat ulang halaman atau tap Refresh.</p></div>';
  }
})();
