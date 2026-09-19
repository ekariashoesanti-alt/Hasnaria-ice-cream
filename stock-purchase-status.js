/* Hasnaria Stock — purchase-cycle inventory status
 * Moves the 'Persediaan Kurang' / 'Persediaan Hapus' analysis into Stok
 * while preserving the existing purchase-history rules and source data.
 */
(function () {
  'use strict';
  if (window.__HASNARIA_STOCK_PURCHASE_STATUS) return;
  window.__HASNARIA_STOCK_PURCHASE_STATUS = true;

  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var STOCK_CATS = {'Makanan':1,'Minuman':1,'Ice Cream':1,'Snack':1,'Kemasan & Supplies':1};
  var db = null;
  var loading = null;
  var cache = null;
  var lastStatus = null;
  var lastPeriod = '';
  var hostObserver = null;
  var timer = 0;

  function clean(v) { return String(v == null ? '' : v).trim().replace(/\s+/g, ' '); }
  function norm(v) { return clean(v).toUpperCase().replace(/[^A-Z0-9]+/g, ''); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function periodLabel(p) { if (!/^\d{4}-\d{2}/.test(String(p || ''))) return 'Periode terbaru'; return (MONTHS[Number(p.slice(5,7))-1] || p.slice(5,7)) + ' ' + p.slice(0,4); }
  function rawObj(r) { if (r && r.raw_data && typeof r.raw_data === 'object') return r.raw_data; if (r && typeof r.raw_data === 'string') { try { return JSON.parse(r.raw_data); } catch (_) {} } return {}; }
  function analytics(r) { var raw = rawObj(r), cat = raw.analytics_category || raw.category || '', group = raw.analytics_group || '', kind = raw.analytics_kind || (raw.record_type === 'RINGKASAN_BIAYA' ? 'cost_component' : 'purchase_item'); return {category:cat, group:group, kind:kind}; }

  function fallbackStockable(r) {
    var a = analytics(r), u = clean(r.item_name).toUpperCase();
    if (a.kind !== 'purchase_item') return false;
    if (a.group && a.group !== 'Operasi') return false;
    if (/TOKEN LISTRIK|LISTRIK|INTERNET|PAKET DATA|SEWA|GAJI|KARYAWAN|PROMOSI|MAJOO|FOTOKOPI|FC LAPORAN|PULPEN|ATK|LAPORAN|INVEST|AKRILIK|FREEZER|FURNITURE|MESIN|ASET/.test(u)) return false;
    if (STOCK_CATS[a.category]) return true;
    return /GAS|GALON|AQUA|AIR MINERAL|PLASTIK|KEMASAN|CUP|CONE|SENDOK|GARPU|MANGKOK|PAPER|TISU|TISSUE|SABUN|SUNLIGHT|DETERGEN|SARUNG TANGAN|BUSA|SEDOTAN|STRAW|BOTOL|TUTUP|BAHAN|BUMBU|ODENG|TOPOKKI|TTEOK|SOSIS|MIE|SIRUP|TEH|KRIMER|CREAMER|ICE CREAM|ES KRIM|TOPPING/.test(u);
  }

  function loadData(force) {
    if (cache && !force) return Promise.resolve(cache);
    if (loading) return loading;
    db = db || window.__HASNARIA_DB;
    if (!db) return Promise.reject(new Error('Database belum siap'));
    loading = Promise.all([
      db.from('offline_purchase_history').select('source_period,item_name,total_amount,raw_data').eq('brand_id', BRAND).order('source_period', {ascending:true}).limit(10000),
      db.from('purchase_item_rules').select('source_name,normalized_source_name,inventory_item_id,rule_type,active').eq('brand_id', BRAND).eq('active', true).limit(2000),
      db.from('inventory_items').select('id,item_name,category').eq('brand_id', BRAND).limit(2000)
    ]).then(function (all) {
      if (all[0].error) throw all[0].error;
      cache = {
        rows: all[0].data || [],
        rules: all[1] && all[1].error ? [] : (all[1].data || []),
        inventory: all[2] && all[2].error ? [] : (all[2].data || [])
      };
      return cache;
    }).finally(function () { loading = null; });
    return loading;
  }

  function buildIdentity(data) {
    var inv = {}, invByNorm = {}, alias = {};
    data.inventory.forEach(function (x) { inv[x.id] = x; var n = norm(x.item_name); if (n) invByNorm[n] = x.id; });
    data.rules.forEach(function (x) { if (x.rule_type !== 'inventory_alias' || !x.inventory_item_id) return; var n = norm(x.normalized_source_name || x.source_name); if (n) alias[n] = x.inventory_item_id; });
    return function (r) {
      var n = norm(r.item_name), id = alias[n] || invByNorm[n] || null, x = id ? inv[id] : null;
      return {key:id ? 'inv:' + id : 'name:' + n, name:x && x.item_name ? clean(x.item_name) : clean(r.item_name), inventory:x || null, stockable:!!x || fallbackStockable(r)};
    };
  }

  function availablePeriods(rows) {
    var set = {};
    rows.forEach(function (r) { var p = String(r.source_period || '').slice(0,7); if (/^\d{4}-\d{2}$/.test(p)) set[p] = 1; });
    return Object.keys(set).sort();
  }

  function selectedPeriod(data) {
    var purchasePeriod = document.getElementById('paPeriod');
    if (purchasePeriod && /^\d{4}-\d{2}$/.test(String(purchasePeriod.value || ''))) return purchasePeriod.value;
    var ps = availablePeriods(data.rows);
    return ps.length ? ps[ps.length - 1] : '';
  }

  function compute(data, selected) {
    var identify = buildIdentity(data), pSet = {}, meta = {}, by = {};
    data.rows.forEach(function (r) { var p = String(r.source_period || '').slice(0,7); if (/^\d{4}-\d{2}$/.test(p)) pSet[p] = 1; });
    var periods = Object.keys(pSet).sort().filter(function (p) { return !selected || p <= selected; });
    if (!selected && periods.length) selected = periods[periods.length - 1];
    var idx = periods.indexOf(selected);
    periods.forEach(function (p) { by[p] = {}; });
    if (idx < 0) return {shortage:[], discontinue:[], periods:periods};

    data.rows.forEach(function (r) {
      var p = String(r.source_period || '').slice(0,7);
      if (periods.indexOf(p) < 0 || !(Number(r.total_amount || 0) > 0)) return;
      var id = identify(r);
      if (!id.key || !id.stockable) return;
      if (!by[p][id.key]) by[p][id.key] = 0;
      by[p][id.key] += Number(r.total_amount || 0);
      if (!meta[id.key]) meta[id.key] = {name:id.name || clean(r.item_name), category:(id.inventory && id.inventory.category) || analytics(r).category || 'Persediaan'};
    });

    var shortage = [], discontinue = [];
    Object.keys(meta).forEach(function (k) {
      if (by[selected] && by[selected][k] > 0) return;
      var last = -1;
      for (var i = idx - 1; i >= 0; i--) { if (by[periods[i]] && by[periods[i]][k] > 0) { last = i; break; } }
      if (last < 0) return;
      var streak = idx - last;
      var item = {name:meta[k].name, category:meta[k].category, lastPeriod:periods[last], streak:streak, lastAmount:by[periods[last]][k] || 0};
      if (streak >= 3) discontinue.push(item);
      else if (streak >= 1) shortage.push(item);
    });
    shortage.sort(function (a,b) { return b.lastAmount - a.lastAmount || a.name.localeCompare(b.name); });
    discontinue.sort(function (a,b) { return b.streak - a.streak || b.lastAmount - a.lastAmount || a.name.localeCompare(b.name); });
    return {shortage:shortage, discontinue:discontinue, periods:periods};
  }

  function listHtml(arr, type) {
    if (!arr.length) return '<div class="sr-cycle-empty">' + (type === 'shortage' ? 'Tidak ada item persediaan yang perlu perhatian pada periode ini.' : 'Belum ada item yang memenuhi aturan 3 periode tanpa pembelian.') + '</div>';
    var shown = arr.slice(0,4), more = arr.length - shown.length;
    return '<div class="sr-cycle-list">' + shown.map(function (x) {
      var badge = type === 'discontinue' ? 'Discontinue' : (x.streak + ' / 3 periode');
      var note = 'Terakhir dibeli ' + periodLabel(x.lastPeriod) + (type === 'discontinue' ? ' · ' + x.streak + ' periode data valid tanpa pembelian' : ' · cek stok / reorder');
      return '<div class="sr-cycle-item"><span>' + esc(x.name) + '</span><b>' + esc(badge) + '</b><small>' + esc(note) + '</small></div>';
    }).join('') + '</div>' + (more > 0 ? '<div class="sr-cycle-more">+' + more.toLocaleString('id-ID') + ' item lainnya</div>' : '');
  }

  function signature(status, period) {
    return period + '|' + status.shortage.map(function (x) { return x.name + ':' + x.streak; }).join(',') + '|' + status.discontinue.map(function (x) { return x.name + ':' + x.streak; }).join(',');
  }

  function render(status, period) {
    var host = document.getElementById('stok');
    var shell = host && host.querySelector('.sr-shell');
    if (!shell) return false;
    var sig = signature(status, period);
    var panel = document.getElementById('srPurchaseStatus');
    if (panel && panel.getAttribute('data-status-signature') === sig && panel.parentNode === shell) return true;
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'srPurchaseStatus';
      panel.className = 'sr-purchase-status';
    }
    panel.setAttribute('data-status-signature', sig);
    panel.innerHTML = '<div class="sr-purchase-status-head"><div><strong>Status Siklus Pembelian Persediaan</strong><span>Analisis ' + esc(periodLabel(period)) + ' · berbasis histori pembelian stockable</span></div></div>' +
      '<div class="sr-purchase-status-grid">' +
        '<article class="sr-cycle-card"><div class="sr-cycle-card-head"><h3>Persediaan Kurang</h3><span>' + status.shortage.length.toLocaleString('id-ID') + ' item</span></div><p>Tidak dibeli lagi selama 1–2 periode data valid.</p>' + listHtml(status.shortage, 'shortage') + '</article>' +
        '<article class="sr-cycle-card sr-cycle-card-muted"><div class="sr-cycle-card-head"><h3>Persediaan Hapus</h3><span>' + status.discontinue.length.toLocaleString('id-ID') + ' item</span></div><p>Tidak dibeli ≥3 periode data valid berturut-turut.</p>' + listHtml(status.discontinue, 'discontinue') + '</article>' +
      '</div>';
    var kpis = shell.querySelector('.sr-kpis');
    if (kpis && kpis.parentNode === shell) kpis.insertAdjacentElement('afterend', panel);
    else {
      var tabs = shell.querySelector('.sr-tabs');
      if (tabs) shell.insertBefore(panel, tabs); else shell.appendChild(panel);
    }
    return true;
  }

  function renderLast() { if (lastStatus) render(lastStatus, lastPeriod); }

  function refresh(force) {
    clearTimeout(timer);
    timer = setTimeout(function () {
      loadData(!!force).then(function (data) {
        var p = selectedPeriod(data);
        lastPeriod = p;
        lastStatus = compute(data, p);
        renderLast();
      }).catch(function (e) { console.warn('Stock purchase-cycle status:', e && e.message ? e.message : e); });
    }, 40);
  }

  function watchHost() {
    var host = document.getElementById('stok');
    if (!host || hostObserver) return;
    hostObserver = new MutationObserver(function () { setTimeout(renderLast, 0); });
    hostObserver.observe(host, {childList:true, subtree:true});
  }

  function boot() {
    db = window.__HASNARIA_DB || null;
    var tries = 0;
    (function wait() {
      db = db || window.__HASNARIA_DB || null;
      var stock = document.getElementById('stok');
      if (db && stock) {
        watchHost();
        document.addEventListener('click', function (e) {
          var tab = e.target && e.target.closest ? e.target.closest('[data-tab="stok"],[data-tab="pembelian"]') : null;
          if (!tab) return;
          setTimeout(function () { refresh(tab.getAttribute('data-tab') === 'stok'); }, 120);
        }, true);
        document.addEventListener('change', function (e) { if (e.target && e.target.id === 'paPeriod') refresh(false); }, true);
        refresh(true);
        return;
      }
      if (tries++ < 120) setTimeout(wait, 100);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
