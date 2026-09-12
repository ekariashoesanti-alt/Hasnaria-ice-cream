(function () {
  'use strict';

  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var PAGE_SIZE = 14;
  var S = {
    items: [],
    purchases: [],
    opnames: [],
    tab: 'stock',
    search: '',
    category: '',
    status: '',
    page: 1,
    loading: false,
    error: '',
    loaded: false,
    opnameDate: '',
    drafts: {}
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
    var p = String(value).split('-');
    if (p.length !== 3) return value;
    return Number(p[2]) + '/' + Number(p[1]) + '/' + p[0];
  }

  async function token() {
    if (window.__HASNARIA_GET_ACCESS_TOKEN) {
      try {
        var t = await window.__HASNARIA_GET_ACCESS_TOKEN();
        if (t) return t;
      } catch (_) {}
    }
    for (var i = 0; i < localStorage.length; i++) {
      try {
        var raw = localStorage.getItem(localStorage.key(i));
        var parsed = JSON.parse(raw || '');
        if (parsed && parsed.access_token) return parsed.access_token;
      } catch (_) {}
    }
    return null;
  }

  async function request(path, options) {
    var t = await token();
    if (!t) throw new Error('Session belum tersedia. Silakan login kembali.');
    var opts = Object.assign({}, options || {});
    var headers = Object.assign({ apikey: KEY, Authorization: 'Bearer ' + t }, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    opts.headers = headers;
    var res = await fetch(SB + '/rest/v1/' + path, opts);
    if (!res.ok) {
      var text = '';
      try { text = await res.text(); } catch (_) {}
      throw new Error('Gagal memuat data stok (' + res.status + ')' + (text ? ': ' + text.slice(0, 180) : ''));
    }
    if (res.status === 204) return null;
    var ct = res.headers.get('content-type') || '';
    return ct.indexOf('application/json') >= 0 ? res.json() : null;
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
    if (document.getElementById('stock-reconcile-css')) return;
    var l = document.createElement('link');
    l.id = 'stock-reconcile-css';
    l.rel = 'stylesheet';
    l.href = '/stock-reconcile.css?v=1';
    document.head.appendChild(l);
  }

  function chip(status) {
    var label = status === 'untracked' ? 'Perlu Opname Awal' : status === 'critical' ? 'Habis/Kritis' : status === 'order' ? 'Perlu Order' : 'Aman';
    return '<span class="sr-chip sr-' + esc(status || 'ok') + '">' + label + '</span>';
  }

  function varianceHtml(value) {
    if (value === null || value === undefined || value === '') return '<span class="sr-muted">Belum opname</span>';
    var n = Number(value);
    var cls = n < 0 ? 'sr-var-neg' : n > 0 ? 'sr-var-pos' : 'sr-var-zero';
    return '<span class="' + cls + '">' + signed(n) + '</span>';
  }

  function categoryOptions() {
    var seen = {}, out = [];
    S.items.forEach(function (x) {
      var c = String(x.category || 'Lainnya');
      if (!seen[c]) { seen[c] = true; out.push(c); }
    });
    out.sort();
    return '<option value="">Semua Kategori</option>' + out.map(function (c) {
      return '<option value="' + esc(c) + '"' + (S.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function filteredItems() {
    var q = S.search.trim().toLowerCase();
    var rows = S.items.filter(function (x) {
      if (S.category && x.category !== S.category) return false;
      if (S.status === 'diff' && !(x.last_variance !== null && x.last_variance !== undefined && Math.abs(Number(x.last_variance)) > 0.00001)) return false;
      if (S.status && S.status !== 'diff' && x.status !== S.status) return false;
      if (q && (String(x.item_name || '') + ' ' + String(x.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var rank = { untracked: 0, critical: 1, order: 2, ok: 3 };
    rows.sort(function (a, b) {
      var ra = rank[a.status] == null ? 9 : rank[a.status];
      var rb = rank[b.status] == null ? 9 : rank[b.status];
      if (ra !== rb) return ra - rb;
      return String(a.item_name || '').localeCompare(String(b.item_name || ''), 'id');
    });
    return rows;
  }

  async function loadAll() {
    if (S.loading) return;
    S.loading = true;
    S.error = '';
    render();
    try {
      var items = await request('inventory_stock_reconciliation?' + qs({
        brand_id: 'eq.' + BRAND,
        select: 'brand_id,inventory_item_id,item_name,category,unit,min_qty,order_qty,baseline_date,baseline_qty,purchase_qty,sales_usage_qty,system_qty,last_opname_date,last_physical_qty,last_opname_system_qty,last_variance,tracking_active,status',
        order: 'category.asc,item_name.asc'
      }));
      S.items = items || [];

      var purchases = await request('inventory_purchase_log?' + qs({
        brand_id: 'eq.' + BRAND,
        select: 'id,inventory_item_id,purchase_date,qty,unit,notes,created_at',
        order: 'purchase_date.desc,created_at.desc',
        limit: '120'
      }));
      S.purchases = purchases || [];

      var opnames = await request('inventory_stock_opname?' + qs({
        brand_id: 'eq.' + BRAND,
        select: 'id,inventory_item_id,opname_date,system_qty,physical_qty,variance,notes,created_at',
        order: 'opname_date.desc,created_at.desc',
        limit: '250'
      }));
      S.opnames = opnames || [];
      S.loaded = true;
    } catch (e) {
      S.error = e && e.message ? e.message : String(e);
    } finally {
      S.loading = false;
      render();
    }
  }

  function itemById(id) {
    for (var i = 0; i < S.items.length; i++) if (S.items[i].inventory_item_id === id) return S.items[i];
    return null;
  }

  function kpis() {
    var need = 0, critical = 0, diff = 0, untracked = 0;
    S.items.forEach(function (x) {
      if (x.status === 'order' || x.status === 'critical') need++;
      if (x.status === 'untracked') untracked++;
      if (x.status === 'critical') critical++;
      if (x.last_variance !== null && x.last_variance !== undefined && Math.abs(Number(x.last_variance)) > 0.00001) diff++;
    });
    return { total: S.items.length, need: need, critical: critical, diff: diff, untracked: untracked };
  }

  function renderHeader() {
    var k = kpis();
    return '' +
      '<div class="sr-head"><div><div class="sr-eyebrow">INVENTORY MANAGEMENT</div><h2>Stok &amp; Persediaan</h2><p>Stok sistem terhubung ke Penjualan dan Pembelian. Stock opname fisik dipakai sebagai kontrol selisih.</p></div>' +
      '<div class="sr-actions"><button type="button" class="sr-btn sr-btn-soft" data-sr-action="refresh">Refresh</button><button type="button" class="sr-btn sr-btn-soft" data-sr-action="export">Export CSV</button></div></div>' +
      '<div class="sr-kpis">' +
        '<div class="sr-kpi"><span>Total Item</span><strong>' + fmt(k.total) + '</strong><small>' + fmt(k.untracked) + ' belum opname awal</small></div>' +
        '<div class="sr-kpi sr-kpi-warn"><span>Perlu Order</span><strong>' + fmt(k.need) + '</strong><small>' + fmt(k.critical) + ' kritis / habis</small></div>' +
        '<div class="sr-kpi sr-kpi-diff"><span>Selisih Opname</span><strong>' + fmt(k.diff) + '</strong><small>item berbeda dari stok sistem</small></div>' +
      '</div>' +
      '<div class="sr-tabs">' + tabButton('stock', 'Daftar Stok') + tabButton('purchase', 'Pembelian') + tabButton('opname', 'Stock Opname') + tabButton('history', 'Riwayat Opname') + '</div>';
  }

  function tabButton(id, label) {
    return '<button type="button" data-sr-tab="' + id + '" class="' + (S.tab === id ? 'on' : '') + '">' + label + '</button>';
  }

  function renderFilters(showStatus) {
    return '<div class="sr-filters">' +
      '<input id="srSearch" type="search" placeholder="Cari nama item..." value="' + esc(S.search) + '">' +
      '<select id="srCategory">' + categoryOptions() + '</select>' +
      (showStatus ? '<select id="srStatus"><option value="">Semua Status</option>' +
        '<option value="untracked"' + (S.status === 'untracked' ? ' selected' : '') + '>Perlu Opname Awal</option>' +
        '<option value="critical"' + (S.status === 'critical' ? ' selected' : '') + '>Kritis / Habis</option>' +
        '<option value="order"' + (S.status === 'order' ? ' selected' : '') + '>Perlu Order</option>' +
        '<option value="ok"' + (S.status === 'ok' ? ' selected' : '') + '>Aman</option>' +
        '<option value="diff"' + (S.status === 'diff' ? ' selected' : '') + '>Ada Selisih Opname</option></select>' : '') + '</div>';
  }

  function renderStock() {
    var rows = filteredItems();
    var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (S.page > totalPages) S.page = totalPages;
    var start = (S.page - 1) * PAGE_SIZE;
    var pageRows = rows.slice(start, start + PAGE_SIZE);
    var body = pageRows.map(function (x) {
      var phys = x.last_physical_qty === null || x.last_physical_qty === undefined ? '<span class="sr-muted">-</span>' : '<strong>' + fmt(x.last_physical_qty) + '</strong><small>' + dateLabel(x.last_opname_date) + '</small>';
      return '<tr><td class="sr-item"><strong>' + esc(x.item_name) + '</strong><small>' + esc(x.unit || 'pcs') + '</small></td><td>' + esc(x.category || '-') + '</td><td class="sr-num">' + fmt(x.baseline_qty) + '</td><td class="sr-num sr-plus">+' + fmt(x.purchase_qty) + '</td><td class="sr-num sr-minus">-' + fmt(x.sales_usage_qty) + '</td><td class="sr-num"><strong>' + fmt(x.system_qty) + '</strong></td><td class="sr-num sr-physical">' + phys + '</td><td class="sr-num">' + varianceHtml(x.last_variance) + '</td><td class="sr-num">' + fmt(x.min_qty) + '</td><td>' + chip(x.status) + '</td></tr>';
    }).join('');
    return renderFilters(true) + '<div class="sr-table-card"><div class="sr-table-head"><div><strong>Daftar Stok</strong><span>Stok Sistem = Baseline + Pembelian − Pemakaian Penjualan</span></div><span>' + rows.length + ' item</span></div><div class="sr-table-wrap"><table class="sr-table"><thead><tr><th>Item</th><th>Kategori</th><th>Baseline</th><th>+ Pembelian</th><th>- Penjualan</th><th>Stok Sistem</th><th>Fisik Terakhir</th><th>Selisih</th><th>Min.</th><th>Status</th></tr></thead><tbody>' + (body || '<tr><td colspan="10" class="sr-empty">Tidak ada item sesuai filter.</td></tr>') + '</tbody></table></div>' + renderPager(rows.length, totalPages) + '</div>' +
      '<p class="sr-note">Tracking otomatis mulai setelah Stock Opname pertama pada item. Sesudah baseline fisik terbentuk, Pembelian menambah stok dan Penjualan mengurangi stok sesuai mapping resep/BOM yang aktif.</p>';
  }

  function renderPager(count, pages) {
    if (pages <= 1) return '<div class="sr-pager"><span>Menampilkan ' + count + ' item</span></div>';
    var buttons = [], from = Math.max(1, S.page - 2), to = Math.min(pages, S.page + 2);
    if (from > 1) buttons.push('<button type="button" data-sr-page="1">1</button>');
    if (from > 2) buttons.push('<span>…</span>');
    for (var p = from; p <= to; p++) buttons.push('<button type="button" data-sr-page="' + p + '" class="' + (p === S.page ? 'on' : '') + '">' + p + '</button>');
    if (to < pages - 1) buttons.push('<span>…</span>');
    if (to < pages) buttons.push('<button type="button" data-sr-page="' + pages + '">' + pages + '</button>');
    return '<div class="sr-pager"><span>Halaman ' + S.page + ' dari ' + pages + '</span><div>' + buttons.join('') + '</div></div>';
  }

  function purchaseItemOptions() {
    return '<option value="">Pilih item</option>' + S.items.map(function (x) { return '<option value="' + esc(x.inventory_item_id) + '">' + esc(x.item_name) + ' — ' + esc(x.unit || 'pcs') + '</option>'; }).join('');
  }

  function renderPurchase() {
    var rows = S.purchases.slice(0, 60);
    var body = rows.map(function (p) {
      var it = itemById(p.inventory_item_id);
      return '<tr><td>' + dateLabel(p.purchase_date) + '</td><td class="sr-item"><strong>' + esc(it ? it.item_name : p.inventory_item_id) + '</strong><small>' + esc(it ? it.category : '') + '</small></td><td class="sr-num"><strong>+' + fmt(p.qty) + '</strong> ' + esc(p.unit || (it && it.unit) || '') + '</td><td>' + esc(p.notes || '-') + '</td></tr>';
    }).join('');
    return '<div class="sr-form-card"><div class="sr-section-title"><div><strong>Input Pembelian</strong><span>Pembelian langsung menambah Stok Sistem setelah baseline opname terbentuk.</span></div></div><div class="sr-purchase-form"><label>Tanggal<input id="srBuyDate" type="date" value="' + today() + '"></label><label>Item<select id="srBuyItem">' + purchaseItemOptions() + '</select></label><label>Qty<input id="srBuyQty" type="number" min="0.01" step="0.01" placeholder="0"></label><label>Catatan<input id="srBuyNote" type="text" maxlength="120" placeholder="Opsional"></label><button type="button" class="sr-btn sr-btn-primary" data-sr-action="save-purchase">Simpan Pembelian</button></div></div>' +
      '<div class="sr-table-card"><div class="sr-table-head"><div><strong>Riwayat Pembelian</strong><span>Input terbaru lebih dulu</span></div></div><div class="sr-table-wrap sr-short"><table class="sr-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Qty</th><th>Catatan</th></tr></thead><tbody>' + (body || '<tr><td colspan="4" class="sr-empty">Belum ada pembelian tercatat.</td></tr>') + '</tbody></table></div></div>';
  }

  function renderOpname() {
    var rows = filteredItems();
    var body = rows.map(function (x) {
      var draft = Object.prototype.hasOwnProperty.call(S.drafts, x.inventory_item_id) ? S.drafts[x.inventory_item_id] : '';
      var preview = draft === '' ? '-' : signed(num(draft) - num(x.system_qty));
      var last = x.last_physical_qty === null || x.last_physical_qty === undefined ? '-' : fmt(x.last_physical_qty) + ' (' + dateLabel(x.last_opname_date) + ')';
      return '<tr><td class="sr-item"><strong>' + esc(x.item_name) + '</strong><small>' + esc(x.category || '') + '</small></td><td>' + esc(x.unit || 'pcs') + '</td><td class="sr-num"><strong>' + fmt(x.system_qty) + '</strong></td><td class="sr-num sr-muted">' + last + '</td><td><input class="sr-opname-input" data-sr-opname="' + esc(x.inventory_item_id) + '" type="number" min="0" step="0.01" value="' + esc(draft) + '" placeholder="Hitung fisik"></td><td class="sr-num"><span data-sr-preview="' + esc(x.inventory_item_id) + '">' + preview + '</span></td><td><button type="button" class="sr-mini" data-sr-save-opname="' + esc(x.inventory_item_id) + '">Simpan</button></td></tr>';
    }).join('');
    return '<div class="sr-opname-bar"><div><strong>Stock Opname Fisik</strong><span>Opname pertama menjadi baseline nyata. Selisih = Fisik − Stok Sistem.</span></div><label>Tanggal Opname<input id="srOpnameDate" type="date" value="' + esc(S.opnameDate || today()) + '"></label></div>' + renderFilters(false) + '<div class="sr-table-card"><div class="sr-table-wrap sr-opname-table"><table class="sr-table"><thead><tr><th>Item</th><th>Satuan</th><th>Stok Sistem</th><th>Fisik Terakhir</th><th>Input Fisik</th><th>Selisih</th><th>Aksi</th></tr></thead><tbody>' + (body || '<tr><td colspan="7" class="sr-empty">Tidak ada item.</td></tr>') + '</tbody></table></div></div>';
  }

  function renderHistory() {
    var body = S.opnames.map(function (o) {
      var it = itemById(o.inventory_item_id);
      return '<tr><td>' + dateLabel(o.opname_date) + '</td><td class="sr-item"><strong>' + esc(it ? it.item_name : o.inventory_item_id) + '</strong><small>' + esc(it ? it.category : '') + '</small></td><td class="sr-num">' + fmt(o.system_qty) + '</td><td class="sr-num">' + fmt(o.physical_qty) + '</td><td class="sr-num">' + varianceHtml(o.variance) + '</td><td>' + esc(o.notes || '-') + '</td></tr>';
    }).join('');
    return '<div class="sr-table-card"><div class="sr-table-head"><div><strong>Riwayat Stock Opname</strong><span>Selisih tersimpan sebagai audit kontrol stok.</span></div></div><div class="sr-table-wrap"><table class="sr-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Stok Sistem</th><th>Fisik</th><th>Selisih</th><th>Catatan</th></tr></thead><tbody>' + (body || '<tr><td colspan="6" class="sr-empty">Belum ada stock opname.</td></tr>') + '</tbody></table></div></div>';
  }

  function renderContent() { if (S.tab === 'purchase') return renderPurchase(); if (S.tab === 'opname') return renderOpname(); if (S.tab === 'history') return renderHistory(); return renderStock(); }

  function render() {
    var host = document.getElementById('stok');
    if (!host) return;
    ensureCss();
    host.__srRendering = true;
    var alert = S.error ? '<div class="sr-alert">' + esc(S.error) + '</div>' : '';
    var loading = S.loading ? '<div class="sr-loading">Memuat data stok…</div>' : '';
    host.innerHTML = '<div class="sr-shell">' + renderHeader() + alert + loading + (!S.loading || S.loaded ? '<div class="sr-content">' + renderContent() + '</div>' : '') + '</div>';
    bind(host);
    host.__srRendering = false;
  }

  function bind(host) {
    host.onclick = async function (e) {
      var t = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      if (t.hasAttribute('data-sr-tab')) { S.tab = t.getAttribute('data-sr-tab'); S.page = 1; S.status = ''; render(); return; }
      if (t.hasAttribute('data-sr-page')) { S.page = Number(t.getAttribute('data-sr-page')) || 1; render(); return; }
      var action = t.getAttribute('data-sr-action');
      if (action === 'refresh') { await loadAll(); return; }
      if (action === 'export') { exportCsv(); return; }
      if (action === 'save-purchase') { await savePurchase(t); return; }
      if (t.hasAttribute('data-sr-save-opname')) await saveOpname(t.getAttribute('data-sr-save-opname'), t);
    };
    host.oninput = function (e) {
      var el = e.target;
      if (el.id === 'srSearch') { S.search = el.value || ''; S.page = 1; render(); var search = document.getElementById('srSearch'); if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); } return; }
      if (el.hasAttribute('data-sr-opname')) { var id = el.getAttribute('data-sr-opname'); S.drafts[id] = el.value; var it = itemById(id); var pv = host.querySelector('[data-sr-preview="' + id + '"]'); if (pv && it) pv.textContent = el.value === '' ? '-' : signed(num(el.value) - num(it.system_qty)); }
    };
    host.onchange = function (e) {
      var el = e.target;
      if (el.id === 'srCategory') { S.category = el.value || ''; S.page = 1; render(); }
      if (el.id === 'srStatus') { S.status = el.value || ''; S.page = 1; render(); }
      if (el.id === 'srOpnameDate') S.opnameDate = el.value || today();
    };
  }

  async function savePurchase(button) {
    var date = document.getElementById('srBuyDate'), item = document.getElementById('srBuyItem'), qty = document.getElementById('srBuyQty'), note = document.getElementById('srBuyNote');
    var id = item && item.value, q = qty ? Number(qty.value) : 0, it = itemById(id);
    if (!id || !it || !(q > 0)) { window.alert('Pilih item dan isi qty pembelian lebih dari 0.'); return; }
    button.disabled = true;
    try {
      await request('inventory_purchase_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ brand_id: BRAND, inventory_item_id: id, purchase_date: date && date.value ? date.value : today(), qty: q, unit: it.unit || 'pcs', notes: note && note.value ? note.value.trim() : null }) });
      if (qty) qty.value = ''; if (note) note.value = ''; await loadAll(); S.tab = 'purchase'; render();
    } catch (e) { window.alert(e.message || 'Gagal menyimpan pembelian.'); } finally { button.disabled = false; }
  }

  async function saveOpname(id, button) {
    var it = itemById(id), input = document.querySelector('[data-sr-opname="' + id + '"]'), value = input ? input.value : S.drafts[id];
    if (!it || value === '' || value === null || value === undefined || Number(value) < 0) { window.alert('Isi stok fisik dengan angka 0 atau lebih.'); return; }
    var physical = Number(value); button.disabled = true;
    try {
      await request('inventory_stock_opname?on_conflict=brand_id,inventory_item_id,opname_date', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ brand_id: BRAND, inventory_item_id: id, opname_date: S.opnameDate || today(), system_qty: num(it.system_qty), physical_qty: physical, notes: 'Stock opname fisik dari Dashboard Stok' }) });
      delete S.drafts[id]; await loadAll(); S.tab = 'opname'; render();
    } catch (e) { window.alert(e.message || 'Gagal menyimpan stock opname.'); } finally { button.disabled = false; }
  }

  function exportCsv() {
    var rows = [['Item','Kategori','Satuan','Baseline','Pembelian','Pemakaian Penjualan','Stok Sistem','Fisik Terakhir','Tanggal Opname','Selisih','Minimum','Status']];
    filteredItems().forEach(function (x) { rows.push([x.item_name,x.category,x.unit,x.baseline_qty,x.purchase_qty,x.sales_usage_qty,x.system_qty,x.last_physical_qty == null ? '' : x.last_physical_qty,x.last_opname_date || '',x.last_variance == null ? '' : x.last_variance,x.min_qty,x.status]); });
    var csv = rows.map(function (r) { return r.map(function (v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'hasnaria-stok-rekonsiliasi-' + today() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (_) {} }, 0);
  }

  function active() { var host = document.getElementById('stok'); return !!(host && !host.classList.contains('hidden')); }
  async function mount(force) { var host = document.getElementById('stok'); if (!host || !active()) return; ensureCss(); if (host.querySelector('.sr-shell') && !force) return; render(); if (!S.loaded && !S.loading) await loadAll(); }
  function watch() { var host = document.getElementById('stok'); if (!host || host.__srObserver) return; host.__srObserver = new MutationObserver(function () { if (host.__srRendering || !active()) return; if (!host.querySelector('.sr-shell')) setTimeout(function () { mount(true); }, 0); }); host.__srObserver.observe(host, { childList: true }); }

  document.addEventListener('click', function (e) { var tab = e.target && e.target.closest ? e.target.closest('[data-tab="stok"],.tab') : null; if (!tab) return; var id = tab.getAttribute('data-tab'); if (id && id !== 'stok') return; if (id === 'stok' || String(tab.textContent || '').toLowerCase().indexOf('stok') >= 0) setTimeout(function () { watch(); mount(true); }, 70); }, true);

  S.opnameDate = today(); ensureCss(); setTimeout(function () { watch(); mount(false); }, 250); setTimeout(function () { watch(); mount(false); }, 1000);
})();
