/* Hasnaria Stock Control v3
 * Progressive read-only inventory control.
 * Critical path: reconciliation rows render first.
 * Supplemental path: Incoming PO + BOM coverage loads after the table is visible.
 */
(function () {
  'use strict';

  if (window.__HASNARIA_STOCK_CONTROL_V3) return;
  window.__HASNARIA_STOCK_CONTROL_V3 = true;

  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var PAGE_SIZE = 18;
  var AUX_CHUNK = 40;
  var S = {
    raw: [],
    items: [],
    search: '',
    category: '',
    status: '',
    page: 1,
    baseLoading: false,
    baseLoaded: false,
    auxLoading: false,
    auxLoaded: false,
    error: '',
    auxError: '',
    loadSeq: 0,
    accessToken: '',
    tokenAt: 0
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function fmt(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }

  function signed(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return (n > 0 ? '+' : '') + fmt(n);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dateLabel(value) {
    if (!value) return '-';
    var p = String(value).slice(0, 10).split('-');
    if (p.length !== 3) return value;
    return Number(p[2]) + '/' + Number(p[1]) + '/' + p[0];
  }

  function elapsedDays(value) {
    if (!value) return null;
    var start = new Date(String(value).slice(0, 10) + 'T00:00:00');
    var end = new Date(today() + 'T00:00:00');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  }

  async function token() {
    if (S.accessToken && Date.now() - S.tokenAt < 30000) return S.accessToken;
    if (window.__HASNARIA_GET_ACCESS_TOKEN) {
      try {
        var t = await window.__HASNARIA_GET_ACCESS_TOKEN();
        if (t) {
          S.accessToken = t;
          S.tokenAt = Date.now();
          return t;
        }
      } catch (_) {}
    }
    for (var i = 0; i < localStorage.length; i++) {
      try {
        var raw = localStorage.getItem(localStorage.key(i));
        var parsed = JSON.parse(raw || '');
        if (parsed && parsed.access_token) {
          S.accessToken = parsed.access_token;
          S.tokenAt = Date.now();
          return S.accessToken;
        }
      } catch (_) {}
    }
    return null;
  }

  async function request(path) {
    var t = await token();
    if (!t) throw new Error('Session belum tersedia. Silakan login kembali.');
    var res = await fetch(SB + '/rest/v1/' + path, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + t }
    });
    if (!res.ok) {
      var text = '';
      try { text = await res.text(); } catch (_) {}
      throw new Error('Gagal memuat kontrol stok (' + res.status + ')' + (text ? ': ' + text.slice(0, 140) : ''));
    }
    return res.json();
  }

  function qs(obj) {
    var q = new URLSearchParams();
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (v !== null && v !== undefined && v !== '') q.set(k, v);
    });
    return q.toString();
  }

  function ensureCss() {
    if (document.getElementById('stock-control-v3-css')) return;
    var l = document.createElement('link');
    l.id = 'stock-control-v3-css';
    l.rel = 'stylesheet';
    l.href = '/stock-control-v3.css?v=2';
    document.head.appendChild(l);
  }

  function initialStatus(x) {
    if (!x.tracking_active) return 'untracked';
    var balance = num(x.system_qty);
    if (balance <= 0) return 'critical';
    if (num(x.min_qty) > 0 && balance < num(x.min_qty)) return 'order';
    return 'ok';
  }

  function baseItem(x) {
    return Object.assign({}, x, {
      balance_qty: x.tracking_active ? num(x.system_qty) : null,
      incoming_qty: null,
      projected_qty: null,
      demand_ready: null,
      avg_usage: null,
      days_cover: null,
      suggested_order_qty: null,
      ui_status: initialStatus(x)
    });
  }

  function applySupplemental(recipeRows, poRows, receiptRows) {
    var recipeMap = {};
    (recipeRows || []).forEach(function (r) {
      if (r.inventory_item_id) recipeMap[r.inventory_item_id] = true;
    });

    var receivedByLine = {};
    (receiptRows || []).forEach(function (r) {
      var id = r.purchase_order_item_id;
      if (!id) return;
      receivedByLine[id] = (receivedByLine[id] || 0) + num(r.qty_received);
    });

    var incomingByItem = {};
    (poRows || []).forEach(function (r) {
      if (!r.inventory_item_id) return;
      var remaining = Math.max(0, num(r.ordered_qty) - num(receivedByLine[r.id]));
      incomingByItem[r.inventory_item_id] = (incomingByItem[r.inventory_item_id] || 0) + remaining;
    });

    S.items = S.raw.map(function (x) {
      var tracked = !!x.tracking_active;
      var balance = tracked ? num(x.system_qty) : null;
      var incoming = num(incomingByItem[x.inventory_item_id]);
      var projected = tracked ? balance + incoming : null;
      var minQty = num(x.min_qty);
      var orderQty = num(x.order_qty);
      var demandReady = !!recipeMap[x.inventory_item_id];
      var age = tracked ? elapsedDays(x.last_opname_date) : null;
      var usage = demandReady && tracked ? num(x.sales_usage_qty) : null;
      var avg = demandReady && tracked && age ? usage / age : null;
      var cover = avg !== null && avg > 0 ? Math.max(balance, 0) / avg : null;
      var suggested = null;

      if (tracked) {
        suggested = 0;
        if (minQty > 0 && projected < minQty) {
          suggested = Math.max(orderQty, minQty - projected);
        }
      }

      var status = 'ok';
      if (!tracked) status = 'untracked';
      else if (balance <= 0) status = 'critical';
      else if (minQty > 0 && projected < minQty) status = 'order';
      else if (minQty > 0 && balance < minQty && incoming > 0 && projected >= minQty) status = 'incoming';

      return Object.assign({}, x, {
        balance_qty: balance,
        incoming_qty: incoming,
        projected_qty: projected,
        demand_ready: demandReady,
        avg_usage: avg,
        days_cover: cover,
        suggested_order_qty: suggested,
        ui_status: status
      });
    });
  }

  async function loadRecipes(ids) {
    var out = [];
    for (var i = 0; i < ids.length; i += AUX_CHUNK) {
      var chunk = ids.slice(i, i + AUX_CHUNK);
      var q = qs({
        brand_id: 'eq.' + BRAND,
        active: 'eq.true',
        inventory_item_id: 'in.(' + chunk.join(',') + ')',
        select: 'inventory_item_id',
        limit: String(AUX_CHUNK * 50)
      });
      var rows = await request('inventory_recipe_components?' + q);
      out = out.concat(rows || []);
    }
    return out;
  }

  async function loadReceipts(lineIds) {
    var out = [];
    for (var i = 0; i < lineIds.length; i += AUX_CHUNK) {
      var chunk = lineIds.slice(i, i + AUX_CHUNK);
      var q = qs({
        purchase_order_item_id: 'in.(' + chunk.join(',') + ')',
        select: 'purchase_order_item_id,qty_received,goods_receipts!inner(brand_id,status)',
        'goods_receipts.brand_id': 'eq.' + BRAND,
        'goods_receipts.status': 'eq.posted',
        limit: String(AUX_CHUNK * 50)
      });
      var rows = await request('goods_receipt_items?' + q);
      out = out.concat(rows || []);
    }
    return out;
  }

  async function loadAux(seq) {
    if (seq !== S.loadSeq || !S.baseLoaded) return;
    var trackedIds = S.raw.filter(function (x) { return !!x.tracking_active; }).map(function (x) { return x.inventory_item_id; });
    if (!trackedIds.length) {
      S.auxLoaded = true;
      S.auxLoading = false;
      render();
      return;
    }

    S.auxLoading = true;
    S.auxLoaded = false;
    S.auxError = '';
    render();

    try {
      var trackedSet = {};
      trackedIds.forEach(function (id) { trackedSet[id] = true; });
      var poQuery = qs({
        select: 'id,inventory_item_id,ordered_qty,purchase_orders!inner(brand_id,status)',
        'purchase_orders.brand_id': 'eq.' + BRAND,
        'purchase_orders.status': 'in.(issued,partially_received)',
        limit: '1000'
      });

      var pair = await Promise.all([
        loadRecipes(trackedIds),
        request('purchase_order_items?' + poQuery)
      ]);
      if (seq !== S.loadSeq) return;

      var recipeRows = pair[0] || [];
      var poRows = (pair[1] || []).filter(function (r) { return !!trackedSet[r.inventory_item_id]; });
      var receiptRows = poRows.length ? await loadReceipts(poRows.map(function (r) { return r.id; })) : [];
      if (seq !== S.loadSeq) return;

      applySupplemental(recipeRows, poRows, receiptRows);
      S.auxLoaded = true;
    } catch (e) {
      if (seq !== S.loadSeq) return;
      S.auxError = e && e.message ? e.message : String(e);
    } finally {
      if (seq === S.loadSeq) {
        S.auxLoading = false;
        render();
      }
    }
  }

  function scheduleAux(seq) {
    var run = function () { loadAux(seq); };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 300 });
    } else {
      setTimeout(run, 60);
    }
  }

  async function loadBase() {
    if (S.baseLoading) return;
    var seq = ++S.loadSeq;
    S.baseLoading = true;
    S.error = '';
    S.auxError = '';
    S.auxLoaded = false;
    S.auxLoading = false;
    render();

    try {
      var baseQuery = qs({
        brand_id: 'eq.' + BRAND,
        select: 'inventory_item_id,item_name,category,unit,min_qty,order_qty,purchase_qty,sales_usage_qty,system_qty,last_opname_date,last_physical_qty,last_variance,tracking_active,status',
        order: 'category.asc,item_name.asc'
      });
      var rows = await request('inventory_stock_reconciliation?' + baseQuery);
      if (seq !== S.loadSeq) return;
      S.raw = rows || [];
      S.items = S.raw.map(baseItem);
      S.baseLoaded = true;
    } catch (e) {
      if (seq !== S.loadSeq) return;
      S.error = e && e.message ? e.message : String(e);
    } finally {
      if (seq === S.loadSeq) {
        S.baseLoading = false;
        render();
        if (S.baseLoaded) scheduleAux(seq);
      }
    }
  }

  function statusLabel(status) {
    if (status === 'critical') return 'Kritis / Habis';
    if (status === 'order') return 'Perlu Beli';
    if (status === 'incoming') return 'Dalam Pesanan';
    if (status === 'untracked') return 'Perlu Opname Awal';
    return 'Aman';
  }

  function chip(status) {
    return '<span class="sc3-chip sc3-' + esc(status || 'ok') + '">' + esc(statusLabel(status)) + '</span>';
  }

  function varianceHtml(value) {
    if (value === null || value === undefined || value === '') return '<span class="sc3-muted">-</span>';
    var n = Number(value);
    var cls = n < 0 ? 'sc3-neg' : n > 0 ? 'sc3-pos' : 'sc3-zero';
    return '<span class="' + cls + '">' + signed(n) + '</span>';
  }

  function categoryOptions() {
    var seen = {}, out = [];
    S.items.forEach(function (x) {
      var c = String(x.category || 'Lainnya');
      if (!seen[c]) { seen[c] = true; out.push(c); }
    });
    out.sort(function (a, b) { return a.localeCompare(b, 'id'); });
    return '<option value="">Semua Kategori</option>' + out.map(function (c) {
      return '<option value="' + esc(c) + '"' + (S.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function filteredItems() {
    var q = S.search.trim().toLowerCase();
    var rows = S.items.filter(function (x) {
      if (S.category && String(x.category || 'Lainnya') !== S.category) return false;
      if (S.status === 'diff') {
        if (!(x.last_variance !== null && x.last_variance !== undefined && Math.abs(num(x.last_variance)) > 0.00001)) return false;
      } else if (S.status && x.ui_status !== S.status) return false;
      if (q && (String(x.item_name || '') + ' ' + String(x.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var rank = { critical: 0, order: 1, incoming: 2, untracked: 3, ok: 4 };
    rows.sort(function (a, b) {
      var ra = rank[a.ui_status] == null ? 9 : rank[a.ui_status];
      var rb = rank[b.ui_status] == null ? 9 : rank[b.ui_status];
      if (ra !== rb) return ra - rb;
      return String(a.item_name || '').localeCompare(String(b.item_name || ''), 'id');
    });
    return rows;
  }

  function kpis() {
    var out = { tracked: 0, untracked: 0, need: 0, critical: 0, incoming: 0 };
    S.items.forEach(function (x) {
      if (x.ui_status === 'untracked') out.untracked++;
      else out.tracked++;
      if (x.ui_status === 'order') out.need++;
      if (x.ui_status === 'critical') out.critical++;
      if (x.ui_status === 'incoming') out.incoming++;
    });
    return out;
  }

  function renderHeader() {
    var k = kpis();
    var buyNote = S.auxLoaded ? fmt(k.incoming) + ' item sudah dalam pesanan' : 'Incoming dilengkapi setelah data utama';
    return '<div class="sc3-head"><div><div class="sc3-eyebrow">KONTROL PERSEDIAAN</div><h2>Stok &amp; Kebutuhan Material</h2><p>Monitoring kuantitas dari pembelian, pemakaian penjualan/BOM, hasil stok opname, dan saldo terkini.</p></div>' +
      '<div class="sc3-actions"><button type="button" class="sc3-btn" data-sc3-action="refresh">↻ Refresh</button><button type="button" class="sc3-btn" data-sc3-action="export"' + (!S.baseLoaded ? ' disabled' : '') + '>Export CSV</button></div></div>' +
      '<div class="sc3-kpis">' +
        '<div class="sc3-kpi"><span>Item Terkontrol</span><strong>' + fmt(k.tracked) + '</strong><small>dari ' + fmt(S.items.length) + ' item master</small></div>' +
        '<div class="sc3-kpi sc3-kpi-muted"><span>Perlu Opname Awal</span><strong>' + fmt(k.untracked) + '</strong><small>saldo belum boleh dianggap aktual</small></div>' +
        '<div class="sc3-kpi sc3-kpi-warn"><span>Perlu Beli</span><strong>' + fmt(k.need) + '</strong><small>' + buyNote + '</small></div>' +
        '<div class="sc3-kpi sc3-kpi-danger"><span>Kritis / Habis</span><strong>' + fmt(k.critical) + '</strong><small>berdasarkan saldo fisik-terkini</small></div>' +
      '</div>';
  }

  function renderFormula() {
    return '<div class="sc3-formula">' +
      '<div><span>CHECKPOINT</span><strong>Stok Opname</strong><small>input dari interface operasional</small></div><b>+</b>' +
      '<div><span>MASUK</span><strong>Pembelian</strong><small>setelah opname terakhir</small></div><b>−</b>' +
      '<div><span>KELUAR</span><strong>Pemakaian</strong><small>penjualan × BOM</small></div><b>=</b>' +
      '<div class="sc3-formula-result"><span>POSISI TERKINI</span><strong>Saldo</strong><small>single current stock position</small></div>' +
      '<div class="sc3-formula-note">Incoming PO dipantau terpisah dan belum menambah Saldo sampai barang diterima.</div>' +
    '</div>';
  }

  function renderAuxState() {
    if (!S.baseLoaded) return '';
    if (S.auxLoading) return '<div class="sc3-auxbar"><span class="sc3-pulse"></span><b>Data utama sudah tampil.</b> Melengkapi Incoming PO dan BOM tanpa menahan tabel.</div>';
    if (S.auxError) return '<div class="sc3-auxbar sc3-aux-warn"><b>Data utama tetap tersedia.</b> Incoming/BOM belum berhasil dilengkapi; gunakan Refresh untuk mencoba lagi.</div>';
    return '';
  }

  function renderFilters() {
    return '<div class="sc3-filters">' +
      '<input id="sc3Search" type="search" placeholder="Cari material..." value="' + esc(S.search) + '">' +
      '<select id="sc3Category">' + categoryOptions() + '</select>' +
      '<select id="sc3Status"><option value="">Semua Status</option>' +
        '<option value="critical"' + (S.status === 'critical' ? ' selected' : '') + '>Kritis / Habis</option>' +
        '<option value="order"' + (S.status === 'order' ? ' selected' : '') + '>Perlu Beli</option>' +
        '<option value="incoming"' + (S.status === 'incoming' ? ' selected' : '') + '>Dalam Pesanan</option>' +
        '<option value="untracked"' + (S.status === 'untracked' ? ' selected' : '') + '>Perlu Opname Awal</option>' +
        '<option value="ok"' + (S.status === 'ok' ? ' selected' : '') + '>Aman</option>' +
        '<option value="diff"' + (S.status === 'diff' ? ' selected' : '') + '>Ada Selisih Opname</option>' +
      '</select>' +
      '<div class="sc3-filter-links"><button type="button" data-sc3-jump="pembelian">Buka Pembelian →</button><button type="button" data-sc3-jump="sales">Buka Penjualan →</button></div>' +
    '</div>';
  }

  function renderPager(count, pages) {
    if (pages <= 1) return '<div class="sc3-pager"><span>Menampilkan ' + count + ' item</span></div>';
    var buttons = [], from = Math.max(1, S.page - 2), to = Math.min(pages, S.page + 2);
    if (from > 1) buttons.push('<button type="button" data-sc3-page="1">1</button>');
    if (from > 2) buttons.push('<span>…</span>');
    for (var p = from; p <= to; p++) buttons.push('<button type="button" data-sc3-page="' + p + '" class="' + (p === S.page ? 'on' : '') + '">' + p + '</button>');
    if (to < pages - 1) buttons.push('<span>…</span>');
    if (to < pages) buttons.push('<button type="button" data-sc3-page="' + pages + '">' + pages + '</button>');
    return '<div class="sc3-pager"><span>Halaman ' + S.page + ' dari ' + pages + '</span><div>' + buttons.join('') + '</div></div>';
  }

  function opnameHtml(x) {
    if (!x.tracking_active) return '<span class="sc3-muted">Belum ada</span>';
    return '<strong>' + fmt(x.last_physical_qty) + '</strong><small>' + dateLabel(x.last_opname_date) + '</small>';
  }

  function coverHtml(x) {
    if (!S.auxLoaded) return '<span class="sc3-muted">…</span><small>BOM dimuat setelah tabel</small>';
    if (!x.demand_ready) return '<span class="sc3-muted">Belum BOM</span>';
    if (x.avg_usage === null || !(x.avg_usage > 0)) return '<span class="sc3-muted">-</span><small>0 pemakaian/hari</small>';
    return '<strong>' + fmt(x.days_cover) + ' hari</strong><small>avg ' + fmt(x.avg_usage) + '/hari</small>';
  }

  function renderTable() {
    var rows = filteredItems();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (S.page > pages) S.page = pages;
    var start = (S.page - 1) * PAGE_SIZE;
    var pageRows = rows.slice(start, start + PAGE_SIZE);
    var body = pageRows.map(function (x) {
      var balance = x.tracking_active ? '<strong>' + fmt(x.balance_qty) + '</strong><small>' + esc(x.unit || 'pcs') + '</small>' : '<span class="sc3-muted">-</span>';
      var need = !S.auxLoaded ? '<span class="sc3-muted">…</span>' : (x.suggested_order_qty === null ? '<span class="sc3-muted">-</span>' : (x.suggested_order_qty > 0 ? '<strong class="sc3-need">' + fmt(x.suggested_order_qty) + '</strong>' : '<span>0</span>'));
      var incoming = !S.auxLoaded ? '<span class="sc3-muted">…</span>' : (x.incoming_qty > 0 ? '<strong class="sc3-incoming">+' + fmt(x.incoming_qty) + '</strong>' : '<span class="sc3-muted">0</span>');
      return '<tr>' +
        '<td class="sc3-item"><strong>' + esc(x.item_name) + '</strong><small>' + esc(x.category || 'Lainnya') + ' · ' + esc(x.unit || 'pcs') + '</small></td>' +
        '<td class="sc3-num sc3-plus">+' + fmt(x.purchase_qty) + '</td>' +
        '<td class="sc3-num sc3-minus">-' + fmt(x.sales_usage_qty) + '</td>' +
        '<td class="sc3-num sc3-opname">' + opnameHtml(x) + '</td>' +
        '<td class="sc3-num">' + varianceHtml(x.last_variance) + '</td>' +
        '<td class="sc3-num">' + incoming + '</td>' +
        '<td class="sc3-num">' + fmt(x.min_qty) + '</td>' +
        '<td class="sc3-num">' + need + '</td>' +
        '<td class="sc3-num sc3-cover">' + coverHtml(x) + '</td>' +
        '<td>' + chip(x.ui_status) + '</td>' +
        '<td class="sc3-num sc3-balance">' + balance + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="sc3-table-card"><div class="sc3-table-head"><div><strong>Posisi Persediaan Terkini</strong><span>Data utama tampil lebih dulu; Incoming/BOM dilengkapi sesudahnya.</span></div><span>' + rows.length + ' item</span></div>' +
      '<div class="sc3-table-wrap"><table class="sc3-table"><thead><tr>' +
        '<th>Material</th><th>+ Pembelian</th><th>− Pemakaian</th><th>Stok Opname</th><th>Selisih</th><th>Incoming</th><th>Min/Par</th><th>Kebutuhan</th><th>Days Cover</th><th>Status</th><th class="sc3-balance-head">Saldo</th>' +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="11" class="sc3-empty">Tidak ada item sesuai filter.</td></tr>') + '</tbody></table></div>' + renderPager(rows.length, pages) + '</div>';
  }

  function renderNotes() {
    return '<div class="sc3-notes">' +
      '<article><span>AKURASI</span><strong>Saldo hanya aktif setelah opname awal</strong><p>Item tanpa opname awal tidak diberi saldo aktual agar angka opening lama tidak dianggap posisi fisik terkini.</p></article>' +
      '<article><span>KEBUTUHAN</span><strong>Incoming mengurangi kebutuhan beli</strong><p>PO issued dipantau sebagai incoming, tetapi baru menambah saldo setelah penerimaan barang.</p></article>' +
      '<article><span>PERFORMA</span><strong>Data utama tidak menunggu BOM</strong><p>Saldo, opname, pembelian dan pemakaian ditampilkan dulu agar Tab Stok tetap ringan.</p></article>' +
    '</div>';
  }

  function render() {
    var host = document.getElementById('stok');
    if (!host) return;
    ensureCss();
    host.__sc3Rendering = true;
    var alert = S.error ? '<div class="sc3-alert">' + esc(S.error) + '</div>' : '';
    var loading = S.baseLoading && !S.baseLoaded ? '<div class="sc3-loading">Memuat data utama persediaan…</div>' : '';
    var refresh = S.baseLoading && S.baseLoaded ? '<div class="sc3-auxbar"><span class="sc3-pulse"></span>Memperbarui data utama tanpa mengosongkan tabel…</div>' : '';
    host.innerHTML = '<div class="sc3-shell">' + renderHeader() + alert + loading + (S.baseLoaded ? refresh + renderFormula() + renderAuxState() + renderFilters() + renderTable() + renderNotes() : '') + '</div>';
    bind(host);
    host.__sc3Rendering = false;
  }

  function bind(host) {
    host.onclick = function (e) {
      var button = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!button) return;
      if (button.hasAttribute('data-sc3-page')) {
        S.page = Number(button.getAttribute('data-sc3-page')) || 1;
        render();
        return;
      }
      if (button.hasAttribute('data-sc3-jump')) {
        var target = button.getAttribute('data-sc3-jump');
        var nav = document.querySelector('[data-tab="' + target + '"]') || document.querySelector('[data-page="' + target + '"]');
        if (nav && nav.click) nav.click();
        return;
      }
      var action = button.getAttribute('data-sc3-action');
      if (action === 'refresh') loadBase();
      if (action === 'export' && S.baseLoaded) exportCsv();
    };
    host.oninput = function (e) {
      var el = e.target;
      if (el.id === 'sc3Search') {
        S.search = el.value || '';
        S.page = 1;
        render();
        var search = document.getElementById('sc3Search');
        if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
      }
    };
    host.onchange = function (e) {
      var el = e.target;
      if (el.id === 'sc3Category') { S.category = el.value || ''; S.page = 1; render(); }
      if (el.id === 'sc3Status') { S.status = el.value || ''; S.page = 1; render(); }
    };
  }

  function exportCsv() {
    var rows = [['Material','Kategori','Satuan','Pembelian Setelah Opname','Pemakaian Setelah Opname','Stok Opname','Tanggal Opname','Selisih Opname','Incoming','Min/Par','Kebutuhan','Avg Pemakaian','Days Cover','Status','Saldo']];
    filteredItems().forEach(function (x) {
      rows.push([
        x.item_name, x.category, x.unit, x.purchase_qty, x.sales_usage_qty,
        x.tracking_active ? x.last_physical_qty : '', x.last_opname_date || '', x.last_variance == null ? '' : x.last_variance,
        S.auxLoaded ? x.incoming_qty : '', x.min_qty, S.auxLoaded && x.suggested_order_qty != null ? x.suggested_order_qty : '',
        S.auxLoaded && x.avg_usage != null ? x.avg_usage : '', S.auxLoaded && x.days_cover != null ? x.days_cover : '',
        statusLabel(x.ui_status), x.balance_qty == null ? '' : x.balance_qty
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? '' : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hasnaria-kontrol-stok-' + today() + '.csv';
    document.body.appendChild(a);
    a.click();
    var href = a.href;
    a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(href); } catch (_) {} }, 0);
  }

  function active() {
    var host = document.getElementById('stok');
    return !!(host && !host.classList.contains('hidden'));
  }

  function mount(force) {
    var host = document.getElementById('stok');
    if (!host || !active()) return;
    ensureCss();
    if (host.querySelector('.sc3-shell') && !force) return;
    render();
    if (!S.baseLoaded && !S.baseLoading) loadBase();
  }

  function watch() {
    var host = document.getElementById('stok');
    if (!host || host.__sc3Observer) return;
    host.__sc3Observer = new MutationObserver(function () {
      if (host.__sc3Rendering || !active()) return;
      if (!host.querySelector('.sc3-shell')) setTimeout(function () { mount(true); }, 0);
    });
    host.__sc3Observer.observe(host, { childList: true });
  }

  document.addEventListener('click', function (e) {
    var tab = e.target && e.target.closest ? e.target.closest('[data-tab="stok"],.tab') : null;
    if (!tab) return;
    var id = tab.getAttribute('data-tab');
    if (id && id !== 'stok') return;
    if (id === 'stok' || String(tab.textContent || '').trim().toLowerCase() === 'stok') {
      setTimeout(function () { watch(); mount(true); }, 0);
    }
  }, true);

  ensureCss();
  watch();
  mount(true);
})();
