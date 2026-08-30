/* Hasnaria Stock — minimum monitoring UI */
(function () {
  'use strict';
  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var PAGE = 10;
  var S = { items: [], buys: {}, selected: null, page: 1, mode: 'period', view: 'buy', loading: false };

  function tok() {
    for (var i = 0; i < localStorage.length; i++) {
      var v = localStorage.getItem(localStorage.key(i));
      try {
        var j = JSON.parse(v || '');
        if (j && j.access_token) return j.access_token;
      } catch (e) {}
    }
    return null;
  }
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(x) {
    if (x == null || x === '') return null;
    var m = String(x).match(/-?\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(',', '.')) : null;
  }
  function n(x) { return x == null ? '-' : Number(x).toLocaleString('id-ID'); }
  function signed(x) {
    if (x == null) return '-';
    return (x > 0 ? '+' : '') + Number(x).toLocaleString('id-ID');
  }
  function unit(x) { return (x && x.unit) || 'pcs'; }
  function name(x) {
    return String(x.item_name || '').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function todayLabel() {
    var d = new Date();
    var mon = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return d.getDate() + ' ' + mon[d.getMonth()] + ' ' + d.getFullYear();
  }
  async function get(table, q) {
    var t = tok();
    if (!t) throw Error('Session belum tersedia. Silakan login kembali.');
    var r = await fetch(SB + '/rest/v1/' + table + '?' + new URLSearchParams(q), {
      headers: { apikey: KEY, Authorization: 'Bearer ' + t }
    });
    if (!r.ok) throw Error('Gagal membaca ' + table + ' (' + r.status + ')');
    return r.json();
  }
  async function postPurchase(id, qty) {
    var t = tok();
    if (!t) throw Error('Session belum tersedia.');
    var it = S.items.find(function (x) { return x.id === id; });
    var r = await fetch(SB + '/rest/v1/inventory_purchase_log', {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        brand_id: BRAND,
        inventory_item_id: id,
        purchase_date: new Date().toISOString().slice(0, 10),
        qty: Number(qty),
        unit: unit(it),
        notes: 'Input pembelian hari ini dari Monitoring Stok Minimum'
      })
    });
    if (!r.ok) throw Error('Gagal menyimpan pembelian (' + r.status + ')');
  }
  function enrich(x) {
    var a = num(x.stock_june), b = num(x.purchase_july), u = num(x.sold_july), e = num(x.stock_august), d = num(x.discrepancy);
    var min = num(x.min_qty), ord = num(x.order_qty);
    if (min == null) min = Math.max(1, Math.round((a != null ? a : (e || 1)) * 0.6));
    if (ord == null) ord = Math.max(min, Math.round(min * 2.5));
    var q = e != null ? e : a;
    return { id: x.id, item_name: x.item_name, display: name(x), category: x.category, unit: unit(x), awal: a, beli: b, pakai: u, akhir: e, disc: d, qty: q, min: min, order: ord };
  }
  async function load() {
    S.loading = true; render();
    try {
      var rows = await get('inventory_items', {
        brand_id: 'eq.' + BRAND,
        source_period: 'eq.2026-07-01',
        select: 'id,item_name,category,stock_june,purchase_july,sold_july,stock_august,discrepancy,min_qty,order_qty,unit',
        order: 'item_name.asc'
      });
      S.items = (rows || []).map(enrich);
      var today = new Date().toISOString().slice(0, 10);
      var logs = await get('inventory_purchase_log', {
        brand_id: 'eq.' + BRAND,
        purchase_date: 'eq.' + today,
        select: 'inventory_item_id,qty'
      });
      S.buys = {};
      (logs || []).forEach(function (x) {
        S.buys[x.inventory_item_id] = (S.buys[x.inventory_item_id] || 0) + Number(x.qty || 0);
      });
      if (!S.selected && S.items.length) {
        var o = S.items.find(function (x) { return x.item_name.toUpperCase() === 'ODENG'; });
        S.selected = (o || S.items[0]).id;
      }
      S.loading = false;
      render();
    } catch (e) {
      S.loading = false;
      render(e.message);
    }
  }
  function current(x) { return (x.qty == null ? 0 : x.qty) + (S.buys[x.id] || 0); }
  function level(x) {
    var q = current(x);
    if (q <= 0) return 'critical';
    if (q < x.min) return 'order';
    return 'ok';
  }
  function stats() {
    var a = 0, b = 0, c = 0;
    S.items.forEach(function (x) {
      var l = level(x);
      if (l === 'ok') a++; else if (l === 'order') b++; else c++;
    });
    return { ok: a, order: b, crit: c, total: S.items.length, pct: S.items.length ? Math.round((a / S.items.length) * 1000) / 10 : 0 };
  }
  function pages() {
    var last = Math.max(1, Math.ceil(S.items.length / PAGE)), out = [], i;
    if (last <= 7) {
      for (i = 1; i <= last; i++) out.push(i);
      return out;
    }
    out.push(1);
    if (S.page > 3) out.push('...');
    var from = Math.max(2, S.page - 1), to = Math.min(last - 1, S.page + 1);
    if (S.page <= 3) { from = 2; to = 3; }
    if (S.page >= last - 2) { from = last - 2; to = last - 1; }
    for (i = from; i <= to; i++) out.push(i);
    if (S.page < last - 2) out.push('...');
    out.push(last);
    return out;
  }
  function exportExcel() {
    var rows = [['No','Produk','Satuan','Stok Awal Juni 2026','Pembelian Juli 2026','Terpakai Juli 2026','Stok Akhir Awal Ags 2026','Selisih','Status','Stok Saat Ini','Minimum','Order']];
    S.items.forEach(function (x, i) {
      var l = level(x);
      rows.push([i + 1, x.display, unit(x), x.awal == null ? '' : x.awal, x.beli == null ? '' : x.beli, x.pakai == null ? '' : x.pakai, x.akhir == null ? '' : x.akhir, x.disc == null ? '' : x.disc, l === 'ok' ? 'Aman' : l === 'order' ? 'Perlu Order' : 'Kritis', current(x), x.min, x.order]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'hasnaria-monitoring-stok-juli-2026.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function css() {
    var s = document.getElementById('stk-css');
    if (!s) { s = document.createElement('style'); s.id = 'stk-css'; document.head.appendChild(s); }
    s.textContent =
      'html:has(#stok:not(.hidden)),body:has(#stok:not(.hidden)){height:100%;overflow:hidden}' +
      '#app:has(#stok:not(.hidden)){height:100dvh;max-height:100dvh;overflow:hidden;display:flex;flex-direction:column}' +
      '#app:has(#stok:not(.hidden))>header{flex:0 0 auto}' +
      '#app:has(#stok:not(.hidden))>main.wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;max-width:100%;width:100%;padding-top:8px;padding-bottom:8px}' +
      '#app:has(#stok:not(.hidden)) .tabs{flex:0 0 auto;margin-bottom:4px}' +
      '#stok:not(.hidden){flex:1 1 auto;min-height:0;display:flex!important;flex-direction:column;overflow:hidden;background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important}' +
      '.stk-wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111827;background:#f3f5f4;border:1px solid #e5ebe8;border-radius:14px;padding:6px 10px 8px;width:100%;max-width:100%}' +
      '.stk-wrap *{box-sizing:border-box}.stk-wrap h2{margin:0;font-size:13px;letter-spacing:.03em;font-weight:800;color:#111}' +
      '.stk-sub{margin:0 0 4px;color:#6b7a74;font-size:11px}' +
      '.stk-form{flex:0 0 auto;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.7fr) minmax(0,.7fr) minmax(0,1.15fr) minmax(0,1.15fr) 110px;gap:12px;align-items:start;background:#fff;border:1px solid #e6ece9;border-radius:14px;padding:14px 16px}' +
      '.stk-form>*{min-width:0}' +
      '.stk-form label{display:block;font-weight:700;font-size:13px;color:#1f2937;margin-bottom:6px}' +
      '.stk-form input,.stk-form select{width:100%;height:40px;border:1px solid #d7e0dc;border-radius:10px;padding:0 12px;font-size:14.5px;background:#fff;color:#111}' +
      '.stk-form input[disabled]{background:#f3f4f6;color:#111;font-weight:800}' +
      '.stk-hint{font-size:11px;color:#8a9690;margin-top:6px;line-height:1.3}' +
      '.stk-buy{border:0;padding:0;background:transparent}' +
      '.stk-buy-row{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #d7e0dc;border-radius:10px;padding:0 12px;height:40px}' +
      '.stk-buy-row input{border:0;height:38px;padding:0;font-size:15px;font-weight:600;outline:none;background:transparent}' +
      '.stk-buy-row .unit{font-size:13px;color:#6b7a74;white-space:nowrap;font-weight:600}' +
      '.stk-save{margin-top:26px;height:40px;width:100%;min-width:0;border:0;border-radius:10px;background:#08783f;color:#fff;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;padding:0 10px}' +
      '.stk-save:hover{background:#066a38}.stk-save:disabled{opacity:.65;cursor:wait}' +
      '.stk-save .ico,.stk-save small{display:none}' +
      '.stk-grid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,34%);gap:8px;margin-top:0;margin-left:-6px;align-items:stretch}' +
      '.stk-left{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}' +
      '.stk-scroll{flex:1 1 auto;min-width:0;min-height:0;overflow:auto}' +
      '.stk-left h3,.stk-gauge-card h3{margin:0;font-size:14px;font-weight:800;color:#111}' +
      '.stk-filters{flex:0 0 auto;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:0 0 4px}' +
      '.stk-filters label{display:block;font-weight:700;font-size:11px;color:#374151;margin-bottom:2px}' +
      '.stk-seg{display:inline-flex;background:#eef2f0;border-radius:8px;padding:2px}' +
      '.stk-seg button{height:24px;min-height:24px!important;padding:0 10px;border:0;background:transparent;font-weight:700;font-size:11px;border-radius:6px;cursor:pointer}' +
      '.stk-seg .on{background:#176b55;color:#fff}.stk-period{height:24px;min-height:24px;border:1px solid #d7e0dc;border-radius:6px;padding:0 8px;background:#fff;min-width:120px;font-size:11px}' +
      '.stk-xls{margin-left:auto;height:24px;min-height:24px!important;padding:0 10px;border:1px solid #d7e0dc;background:#fff;border-radius:6px;font-weight:700;font-size:11px;color:#176b55;cursor:pointer}' +
      '.stk-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px}' +
      '.stk-table th{background:#f7f9f8;font-weight:700;padding:6px;border-bottom:1px solid #edf1ef;text-align:center}' +
      '.stk-table td{padding:6px;border-bottom:1px solid #f0f3f1;text-align:center}' +
      '.stk-table th:nth-child(2),.stk-table td:nth-child(2){text-align:left}.stk-thsub{display:block;font-size:11px;color:#8a9690;font-weight:500}' +
      '.stk-pager{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 2px;color:#6b7a74;font-size:12px}' +
      '.stk-pages{display:flex;gap:3px;align-items:center}.stk-pages button{min-width:22px;width:22px;height:22px;min-height:22px!important;padding:0;border:1px solid #e2e8e5;background:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;line-height:22px}' +
      '.stk-pages .on{background:#176b55;color:#fff;border-color:#176b55}.stk-pages .dots{border:0;background:transparent}' +
      '.stk-foot{flex:0 0 auto;margin:0;font-size:12px;color:#6b7a74}.stk-info-i{display:inline-flex;width:16px;height:16px;border-radius:99px;border:1px solid #c5d0cb;color:#6b7a74;font-size:11px;margin-left:4px;align-items:center;justify-content:center}' +
      '.stk-gauge-card{min-height:0;overflow:auto;padding:4px 4px 0}.stk-gauge{width:100%;max-width:none;display:block;margin:-8px auto 0}.stk-score{text-align:center;margin-top:-10px}.stk-score strong{display:block;font-size:34px;line-height:1.05;color:#176b55}' +
      '.stk-score .lab{font-size:18px;font-weight:800;color:#176b55}.stk-score small{display:block;color:#6b7a74;font-size:12px}' +
      '.stk-legend{margin-top:8px;border:1px solid #e4ebe8;border-radius:12px;padding:8px 10px;background:#fff}' +
      '.stk-leg{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}.stk-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}' +
      '.stk-note{margin-top:8px;padding:8px 10px;border:1px solid #bfd6f5;background:#f3f8ff;border-radius:12px;color:#1e4b8c;font-size:12px}' +
      '.stk-tabs{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap;margin:0 0 6px}' +
      '.stk-tab{height:26px;min-height:26px!important;padding:0 10px;border:1px solid #d7e0dc;background:#fff;color:#374151;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer}' +
      '.stk-tab.on{background:#176b55;color:#fff;border-color:#176b55}' +
      '.stk-pane{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}' +
      '.stk-pane-buy{justify-content:flex-start}' +
      '@media(max-width:1100px){html:has(#stok:not(.hidden)),body:has(#stok:not(.hidden)),#app:has(#stok:not(.hidden)){height:auto;max-height:none;overflow:auto}#stok:not(.hidden),.stk-wrap,.stk-left,.stk-grid,.stk-pane{overflow:visible;height:auto;max-height:none;flex:none}.stk-form{grid-template-columns:1fr 1fr}.stk-buy{grid-column:1/-1}.stk-save{width:100%;height:40px;margin-top:0;grid-column:1/-1}.stk-grid{grid-template-columns:1fr}.stk-xls{margin-left:0}}' +
      '@media(max-width:700px){.stk-form{grid-template-columns:1fr}}';

  }
  function chip(l) {
    return '<span class="stk-chip ' + (l === 'ok' ? 'stk-ok' : l === 'order' ? 'stk-order' : 'stk-critical') + '">' + (l === 'ok' ? 'Aman' : l === 'order' ? 'Perlu Order' : 'Kritis') + '</span>';
  }
  function gauge(p) {
    var pct = Math.max(0, Math.min(100, p)), ang = Math.PI + Math.PI * (pct / 100), cx = 160, cy = 148, nr = 78;
    var x = cx + Math.cos(ang) * nr, y = cy + Math.sin(ang) * nr;
    function lab(deg, text) {
      var a = Math.PI * deg / 180, px = cx + Math.cos(a) * 114, py = cy + Math.sin(a) * 114;
      return '<text x="' + px.toFixed(1) + '" y="' + py.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" fill="#8a9690" font-size="12">' + text + '</text>';
    }
    return '<div><svg class="stk-gauge" viewBox="0 0 320 200">' +
      '<path d="M68 148 A92 92 0 0 1 252 148" fill="none" stroke="#ef4444" stroke-width="16" stroke-linecap="round" stroke-dasharray="72 400"/>' +
      '<path d="M68 148 A92 92 0 0 1 252 148" fill="none" stroke="#f59e0b" stroke-width="16" stroke-dasharray="145 400" stroke-dashoffset="-70"/>' +
      '<path d="M68 148 A92 92 0 0 1 252 148" fill="none" stroke="#22c55e" stroke-width="16" stroke-linecap="round" stroke-dasharray="80 400" stroke-dashoffset="-214"/>' +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#145c3f" stroke-width="10" stroke-linecap="round"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="11" fill="#145c3f"/>' +
      lab(180, '0%') + lab(135, '25%') + lab(90, '50%') + lab(45, '75%') + lab(0, '100%') + '</svg></div>';
  }
  function render(err) {
    css();
    var host = document.getElementById('stok');
    if (!host) return;
    S.drawing = true;
    var st = stats(), it = S.items.find(function (x) { return x.id === S.selected; }) || S.items[0];
    var last = Math.max(1, Math.ceil(S.items.length / PAGE));
    var view = S.view === 'cmp' ? 'cmp' : 'buy';
    var html = '<div class="stk-wrap"><h2>MONITORING STOK MINIMUM</h2><p class="stk-sub">Bukan “kalau habis baru beli”. Sampai minimum → PIC order angka Order.</p>';
    html += '<div class="stk-tabs">' +
      '<button type="button" class="stk-tab' + (view === 'buy' ? ' on' : '') + '" data-stk-view="buy">Input Pembelian</button>' +
      '<button type="button" class="stk-tab' + (view === 'cmp' ? ' on' : '') + '" data-stk-view="cmp">Perbandingan Stok per Periode</button>' +
      '</div>';
    if (err) {
      host.innerHTML = html + '<div class="stk-form" style="color:#b42318">' + esc(err) + '</div></div>';
      S.drawing = false;
      return;
    }
    if (S.loading) {
      host.innerHTML = html + '<div class="stk-form">Memuat data stok...</div></div>';
      S.drawing = false;
      return;
    }
    var buy = S.buys[it ? it.id : ''] || '';
    if (view === 'buy') {
      html += '<div class="stk-pane stk-pane-buy"><div class="stk-form">' +
        '<div><label>Pilih produk</label><select id="stkPick">' +
        S.items.map(function (x) { return '<option value="' + x.id + '"' + (it && x.id === it.id ? ' selected' : '') + '>' + esc(x.display) + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label>Stok Saat Ini (Qty)</label><input value="' + n(it ? current(it) : null) + '" disabled><div class="stk-hint">(Per ' + todayLabel() + ')</div></div>' +
        '<div><label>Minimum (Min)</label><input value="' + n(it ? it.min : null) + '" disabled><div class="stk-hint">(Dari data historis)</div></div>' +
        '<div class="stk-buy"><label>Jumlah barang yang dibeli</label><div class="stk-buy-row"><input id="stkBuy" type="number" min="0" step="1" value="' + esc(buy === '' || buy == null ? '0' : String(buy)) + '" placeholder="0"><span class="unit">' + esc(it ? unit(it) : 'pcs') + '</span></div><div class="stk-hint">Masukkan jumlah barang yang dibeli hari ini</div></div>' +
        '<div class="stk-buy"><label>Harga beli satuan</label><div class="stk-buy-row"><span class="unit">Rp</span><input id="stkBuyPrice" type="number" min="0" step="1" placeholder="0"><span class="unit">/ pcs</span></div><div class="stk-hint">Masukkan harga beli satuan per pcs</div></div>' +
        '<button type="button" class="stk-save" id="stkSave">SIMPAN</button>' +
        '</div></div></div>';
      host.innerHTML = html;
      bind();
      setTimeout(function () { S.drawing = false; }, 0);
      return;
    }
    html += '<div class="stk-pane"><div class="stk-grid"><div class="stk-left">' +
      '<div class="stk-filters"><div><label>Lihat berdasarkan</label><div class="stk-seg"><button type="button" class="' + (S.mode === 'period' ? 'on' : '') + '" data-mode="period">Periode</button><button type="button" class="' + (S.mode === 'date' ? 'on' : '') + '" data-mode="date">Per Tanggal</button></div></div>' +
      '<div><label>Periode</label><select id="stkPeriod" class="stk-period"><option value="2026-07">Juli 2026</option></select></div>' +
      '<button type="button" class="stk-xls" id="stkExport">Export Excel</button></div><div class="stk-scroll"><table class="stk-table"><thead><tr>' +
      '<th>No</th><th>Produk</th><th>Satuan</th><th>Stok Awal<span class="stk-thsub">Juni 2026</span></th><th>Pembelian<span class="stk-thsub">Juli 2026</span></th><th>Terpakai<span class="stk-thsub">Juli 2026</span></th><th>Stok Akhir<span class="stk-thsub">Awal Ags 2026</span></th><th>Selisih</th><th>Status</th></tr></thead><tbody>';
    var start = (S.page - 1) * PAGE;
    S.items.slice(start, start + PAGE).forEach(function (x, i) {
      html += '<tr><td>' + (start + i + 1) + '</td><td>' + esc(x.display) + '</td><td>' + esc(unit(x)) + '</td><td>' + n(x.awal) + '</td><td>' + n(x.beli) + '</td><td>' + n(x.pakai) + '</td><td>' + n(x.akhir) + '</td><td>' + signed(x.disc) + '</td><td>' + chip(level(x)) + '</td></tr>';
    });
    html += '</tbody></table></div><div class="stk-pager"><span>Menampilkan ' + (S.items.length ? start + 1 : 0) + '-' + Math.min(start + PAGE, S.items.length) + ' dari ' + S.items.length + ' item</span><div class="stk-pages">' +
      '<button type="button" data-pg="' + Math.max(1, S.page - 1) + '">&lt;</button>';
    pages().forEach(function (p) {
      if (p === '...') html += '<button type="button" class="dots" disabled>...</button>';
      else html += '<button type="button" class="' + (p === S.page ? 'on' : '') + '" data-pg="' + p + '">' + p + '</button>';
    });
    html += '<button type="button" data-pg="' + Math.min(last, S.page + 1) + '">&gt;</button></div></div>' +
      '<div class="stk-foot">Keterangan: Selisih = Stok Akhir - (Stok Awal + Pembelian - Terpakai)</div></div>';
    var orderPct = st.total ? ((st.order / st.total) * 100).toFixed(1) : '0.0';
    var critPct = st.total ? ((st.crit / st.total) * 100).toFixed(1) : '0.0';
    html += '<div class="stk-gauge-card"><h3>Kecukupan Stok (PAR)</h3>' + gauge(st.pct) +
      '<div class="stk-score"><strong>' + st.pct.toFixed(1) + '%</strong><div class="lab">' + (st.pct >= 75 ? 'Aman' : st.pct >= 50 ? 'Waspada' : 'Kritis') + '</div><small>' + st.ok + ' dari ' + st.total + ' item di atas minimum</small></div>' +
      '<div class="stk-legend"><div class="stk-leg"><span><i class="stk-dot" style="background:#22c55e"></i>Aman (&gt;= Min)</span><b>' + st.ok + ' item (' + st.pct.toFixed(1) + '%)</b></div>' +
      '<div class="stk-leg"><span><i class="stk-dot" style="background:#f59e0b"></i>Perlu Order</span><b>' + st.order + ' item (' + orderPct + '%)</b></div>' +
      '<div class="stk-leg"><span><i class="stk-dot" style="background:#ef4444"></i>Kritis</span><b>' + st.crit + ' item (' + critPct + '%)</b></div></div>' +
      '<div class="stk-note">Semakin tinggi persentase, semakin aman kecukupan stok Anda.</div></div></div></div></div>';
    host.innerHTML = html;
    bind();
    setTimeout(function () { S.drawing = false; }, 0);
  }
  function bind() {
    document.querySelectorAll('#stok [data-stk-view]').forEach(function (x) {
      x.onclick = function () {
        S.view = x.getAttribute('data-stk-view') || 'buy';
        render();
      };
    });
    var p = document.getElementById('stkPick');
    if (p) p.onchange = function () {
      S.selected = this.value;
      render();
    };
    var save = document.getElementById('stkSave');
    if (save) save.onclick = async function () {
      var q = Number(document.getElementById('stkBuy') ? document.getElementById('stkBuy').value : 0);
      if (!q || q < 0) {
        alert('Masukkan jumlah barang yang dibeli hari ini.');
        return;
      }
      save.disabled = true;
      try {
        await postPurchase(S.selected, q);
        await load();
      } catch (e) {
        alert(e.message);
        save.disabled = false;
      }
    };
    var ex = document.getElementById('stkExport');
    if (ex) ex.onclick = exportExcel;
    document.querySelectorAll('#stok [data-mode]').forEach(function (x) {
      x.onclick = function () {
        S.mode = x.getAttribute('data-mode');
        render();
      };
    });
    document.querySelectorAll('#stok [data-pg]').forEach(function (x) {
      x.onclick = function () {
        S.page = Number(x.getAttribute('data-pg'));
        render();
      };
    });
  }
  function hasUi(h) { return !!(h && h.querySelector && h.querySelector('.stk-wrap')); }
  function ready() {
    var app = document.getElementById('app'), h = document.getElementById('stok');
    return !!(h && app && !app.classList.contains('hidden') && tok());
  }
  function watch() {
    var h = document.getElementById('stok');
    if (!h || h.__stkObs) return;
    h.__stkObs = true;
    new MutationObserver(function () {
      if (S.drawing) return;
      if (!hasUi(h)) {
        if (S.items.length) render(); else if (tok()) load();
      }
    }).observe(h, { childList: true });
  }
  function mount() {
    var h = document.getElementById('stok');
    if (!h || !ready()) return;
    watch();
    if (!hasUi(h)) {
      if (S.items.length) render(); else load();
    }
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-tab="stok"],.tab') : null;
    if (!t) return;
    var id = t.getAttribute('data-tab');
    if (id && id !== 'stok') return;
    if (id === 'stok' || (t.textContent || '').toLowerCase().indexOf('stok') !== -1) {
      setTimeout(mount, 30);
      setTimeout(mount, 250);
    }
  }, true);
  var tries = 0;
  (function wait() {
    mount();
    if (tries++ < 400) setTimeout(wait, 250);
  })();
})();
