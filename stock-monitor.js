/* Hasnaria Stock — minimum monitoring UI (mockup match) */
(function () {
  'use strict';
  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var PAGE = 10;
  var S = { items: [], buys: {}, selected: null, page: 1, mode: 'period', loading: false };

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
  function n(x) {
    return x == null ? '-' : Number(x).toLocaleString('id-ID');
  }
  function signed(x) {
    if (x == null) return '-';
    return (x > 0 ? '+' : '') + Number(x).toLocaleString('id-ID');
  }
  function unit(x) {
    return (x && x.unit) || 'pcs';
  }
  function name(x) {
    return String(x.item_name || '').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }
  function todayLabel() {
    var d = new Date();
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
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
      headers: {
        apikey: KEY,
        Authorization: 'Bearer ' + t,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
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
    var a = num(x.stock_june);
    var b = num(x.purchase_july);
    var u = num(x.sold_july);
    var e = num(x.stock_august);
    var d = num(x.discrepancy);
    var min = num(x.min_qty);
    var ord = num(x.order_qty);
    if (min == null) min = Math.max(1, Math.round((a != null ? a : (e || 1)) * 0.6));
    if (ord == null) ord = Math.max(min, Math.round(min * 2.5));
    var q = e != null ? e : a;
    return {
      id: x.id,
      item_name: x.item_name,
      display: name(x),
      category: x.category,
      unit: unit(x),
      awal: a,
      beli: b,
      pakai: u,
      akhir: e,
      disc: d,
      qty: q,
      min: min,
      order: ord
    };
  }
  async function load() {
    S.loading = true;
    render();
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
  function current(x) {
    return (x.qty == null ? 0 : x.qty) + (S.buys[x.id] || 0);
  }
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
      if (l === 'ok') a++;
      else if (l === 'order') b++;
      else c++;
    });
    return {
      ok: a,
      order: b,
      crit: c,
      total: S.items.length,
      pct: S.items.length ? Math.round((a / S.items.length) * 1000) / 10 : 0
    };
  }
  function pages() {
    var last = Math.max(1, Math.ceil(S.items.length / PAGE));
    var out = [];
    var i;
    if (last <= 7) {
      for (i = 1; i <= last; i++) out.push(i);
      return out;
    }
    out.push(1);
    if (S.page > 3) out.push('\u2026');
    var from = Math.max(2, S.page - 1);
    var to = Math.min(last - 1, S.page + 1);
    if (S.page <= 3) { from = 2; to = 3; }
    if (S.page >= last - 2) { from = last - 2; to = last - 1; }
    for (i = from; i <= to; i++) out.push(i);
    if (S.page < last - 2) out.push('\u2026');
    out.push(last);
    return out;
  }
  function exportExcel() {
    var rows = [['No', 'Produk', 'Satuan', 'Stok Awal Juni 2026', 'Pembelian Juli 2026', 'Terpakai Juli 2026', 'Stok Akhir Awal Ags 2026', 'Selisih', 'Status', 'Stok Saat Ini', 'Minimum', 'Order']];
    S.items.forEach(function (x, i) {
      var l = level(x);
      rows.push([
        i + 1,
        x.display,
        unit(x),
        x.awal == null ? '' : x.awal,
        x.beli == null ? '' : x.beli,
        x.pakai == null ? '' : x.pakai,
        x.akhir == null ? '' : x.akhir,
        x.disc == null ? '' : x.disc,
        l === 'ok' ? 'Aman' : l === 'order' ? 'Perlu Order' : 'Kritis',
        current(x),
        x.min,
        x.order
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hasnaria-monitoring-stok-juli-2026.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function css() {
    if (document.getElementById('stk-css')) return;
    var s = document.createElement('style');
    s.id = 'stk-css';
    s.textContent = [
      '#stok{background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important}',
      '#stok .card{display:none}',
      '.stk-wrap{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111827;background:#f3f5f4;border:1px solid #e5ebe8;border-radius:18px;padding:22px 24px 18px}',
      '.stk-wrap *{box-sizing:border-box}',
      '.stk-wrap h2{margin:0;font-size:20px;letter-spacing:.04em;font-weight:800;color:#111}',
      '.stk-sub{margin:6px 0 16px;color:#6b7a74;font-size:13.5px}',
      '.stk-form{display:grid;grid-template-columns:1.25fr .85fr .85fr 1.25fr .95fr .7fr;gap:14px;align-items:start;background:#fff;border:1px solid #e6ece9;border-radius:14px;padding:16px 16px 14px}',
      '.stk-form label{display:block;font-weight:700;font-size:13px;color:#1f2937;margin-bottom:7px}',
      '.stk-form input,.stk-form select{width:100%;height:42px;border:1px solid #d7e0dc;border-radius:10px;padding:0 12px;font-size:14.5px;background:#fff;color:#111}',
      '.stk-form input[disabled]{background:#f7f9f8;color:#111;font-weight:700}',
      '.stk-hint{font-size:11px;color:#8a9690;margin-top:6px}',
      '.stk-buy{border:1.5px solid #2f8f73;border-radius:12px;padding:8px 10px 10px;background:#fff}',
      '.stk-buy label{margin-bottom:6px}',
      '.stk-buy-row{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #d7e0dc;border-radius:10px;padding:0 10px;height:42px}',
      '.stk-buy-row input{border:0;height:40px;padding:0;font-size:15px;font-weight:600}',
      '.stk-buy-row .unit{font-size:13px;color:#6b7a74;white-space:nowrap}',
      '.stk-status{height:42px;display:flex;align-items:center}',
      '.stk-chip{display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.2}',
      '.stk-ok{background:#e7f8ee;color:#157a48}',
      '.stk-order{background:#fff1d6;color:#b45309}',
      '.stk-critical{background:#ffe4e4;color:#b42318}',
      '.stk-grid{display:grid;grid-template-columns:minmax(0,1.72fr) minmax(280px,.88fr);gap:22px;margin-top:22px;align-items:start}',
      '.stk-left h3,.stk-gauge-card h3{margin:0;font-size:18px;font-weight:800;color:#111}',
      '.stk-filters{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;margin:12px 0 10px;position:relative}',
      '.stk-filters label{display:block;font-weight:700;font-size:12.5px;color:#374151;margin-bottom:6px}',
      '.stk-seg{display:inline-flex;background:#eef2f0;border-radius:10px;padding:3px}',
      '.stk-seg button{height:34px;padding:0 14px;border:0;background:transparent;font-weight:700;font-size:13px;color:#374151;border-radius:8px;cursor:pointer}',
      '.stk-seg .on{background:#176b55;color:#fff}',
      '.stk-period{height:38px;border:1px solid #d7e0dc;border-radius:10px;padding:0 12px;background:#fff;min-width:140px}',
      '.stk-xls{margin-left:auto;height:36px;border:1px solid #d7e0dc;background:#fff;border-radius:10px;padding:0 12px;font-weight:700;font-size:13px;color:#176b55;cursor:pointer;display:inline-flex;align-items:center;gap:6px}',
      '.stk-xls:hover{background:#f3faf7}',
      '.stk-scroll{overflow:auto}',
      '.stk-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}',
      '.stk-table th{background:#f7f9f8;font-weight:700;color:#111;padding:10px 8px;border-top:1px solid #edf1ef;border-bottom:1px solid #edf1ef;text-align:center;white-space:nowrap}',
      '.stk-table th:first-child{border-radius:10px 0 0 0}',
      '.stk-table th:last-child{border-radius:0 10px 0 0}',
      '.stk-table td{padding:11px 8px;border-bottom:1px solid #f0f3f1;text-align:center;color:#1f2937}',
      '.stk-table th:nth-child(2),.stk-table td:nth-child(2){text-align:left}',
      '.stk-thsub{display:block;font-size:11px;color:#8a9690;font-weight:500;margin-top:1px}',
      '.stk-pager{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 2px 4px;color:#6b7a74;font-size:13px}',
      '.stk-pages{display:flex;gap:6px;align-items:center}',
      '.stk-pages button{min-width:32px;height:32px;border:1px solid #e2e8e5;background:#fff;border-radius:8px;cursor:pointer;color:#111}',
      '.stk-pages .on{background:#176b55;color:#fff;border-color:#176b55}',
      '.stk-pages .dots{border:0;background:transparent;min-width:18px;cursor:default}',
      '.stk-foot{margin-top:8px;font-size:12.5px;color:#6b7a74}',
      '.stk-gauge-card{padding:4px 4px 0}',
      '.stk-info-i{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:99px;border:1px solid #c5d0cb;color:#6b7a74;font-size:11px;margin-left:4px;cursor:help;vertical-align:middle}',
      '.stk-gauge-wrap{position:relative;max-width:320px;margin:8px auto 0}',
      '.stk-gauge{width:100%;display:block}',
      '.stk-score{text-align:center;margin-top:-6px}',
      '.stk-score strong{display:block;font-size:40px;line-height:1;color:#176b55;font-weight:800}',
      '.stk-score .lab{font-size:18px;font-weight:800;color:#176b55;margin-top:4px}',
      '.stk-score small{display:block;color:#6b7a74;font-size:13px;margin-top:4px}',
      '.stk-legend{margin-top:16px;border:1px solid #e4ebe8;border-radius:12px;padding:12px 14px;background:#fff}',
      '.stk-leg{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;color:#374151}',
      '.stk-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}',
      '.stk-note{margin-top:12px;padding:12px 14px;border:1px solid #bfd6f5;background:#f3f8ff;border-radius:12px;color:#1e4b8c;font-size:13px;line-height:1.45}',
      '@media(max-width:1100px){.stk-form{grid-template-columns:1fr 1fr;}.stk-buy{grid-column:1/-1}.stk-grid{grid-template-columns:1fr}.stk-xls{margin-left:0}}',
      '@media(max-width:700px){.stk-form{grid-template-columns:1fr}.stk-wrap{padding:16px}}'
    ].join('');
    document.head.appendChild(s);
  }
  function chip(l) {
    var cls = l === 'ok' ? 'stk-ok' : l === 'order' ? 'stk-order' : 'stk-critical';
    var txt = l === 'ok' ? 'Aman' : l === 'order' ? 'Perlu Order' : 'Kritis';
    return '<span class="stk-chip ' + cls + '">' + txt + '</span>';
  }
  function gauge(p) {
    var pct = Math.max(0, Math.min(100, p));
    var start = Math.PI;
    var sweep = Math.PI * (pct / 100);
    var ang = start + sweep;
    var cx = 160, cy = 148, r = 92, nr = 78;
    var x = cx + Math.cos(ang) * nr;
    var y = cy + Math.sin(ang) * nr;
    function pt(deg, rad) {
      var a = (Math.PI * deg) / 180;
      return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    }
    function label(deg, text) {
      var p2 = pt(deg, 114);
      return '<text x="' + p2[0].toFixed(1) + '" y="' + p2[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" fill="#8a9690" font-size="12">' + text + '</text>';
    }
    return (
      '<div class="stk-gauge-wrap"><svg class="stk-gauge" viewBox="0 0 320 200">' +
      '<path d="M68 148 A92 92 0 0 1 252 148" fill="none" stroke="#ef4444" stroke-width="16" stroke-linecap="round" stroke-dasharray="72 400"/>' +
      '<path d="M68 148 A92 92 0 0 1 252 148" fill="none" stroke="#f59e0b" stroke-width="16" stroke-linecap="butt" stroke-dasharray="145 400" stroke-dashoffset="-70"/>' +
      '<path d="M68 148 A92 92 0 0 1 252 148" fill="none" stroke="#22c55e" stroke-width="16" stroke-linecap="round" stroke-dasharray="80 400" stroke-dashoffset="-214"/>' +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#145c3f" stroke-width="10" stroke-linecap="round"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="11" fill="#145c3f"/>' +
      label(180, '0%') + label(135, '25%') + label(90, '50%') + label(45, '75%') + label(0, '100%') +
      '</svg></div>'
    );
  }
  function render(err) {
    css();
    var host = document.getElementById('stok') || document.querySelector('[data-tab-content="stok"]') || document.getElementById('app');
    if (!host) return;
    var st = stats();
    var it = S.items.find(function (x) { return x.id === S.selected; }) || S.items[0];
    var last = Math.max(1, Math.ceil(S.items.length / PAGE));
    var html = '<div class="stk-wrap"><h2>MONITORING STOK MINIMUM</h2><p class="stk-sub">Bukan \u201ckalau habis baru beli\u201d. Sampai minimum \u2192 PIC order angka Order.</p>';
    if (err) {
      html += '<div class="stk-form" style="color:#b42318">' + esc(err) + '</div></div>';
      host.innerHTML = html;
      return;
    }
    if (S.loading) {
      html += '<div class="stk-form">Memuat data stok\u2026</div></div>';
      host.innerHTML = html;
      return;
    }
    var buy = S.buys[it ? it.id : ''] || '';
    html += '<div class="stk-form">';
    html += '<div><label>Pilih produk</label><select id="stkPick">' + S.items.map(function (x) {
      return '<option value="' + x.id + '"' + (it && x.id === it.id ? ' selected' : '') + '>' + esc(x.display) + '</option>';
    }).join('') + '</select></div>';
    html += '<div><label>Stok Saat Ini (Qty)</label><input value="' + n(it ? current(it) : null) + '" disabled><div class="stk-hint">(Per ' + todayLabel() + ')</div></div>';
    html += '<div><label>Minimum (Min)</label><input value="' + n(it ? it.min : null) + '" disabled><div class="stk-hint">(Dari data historis)</div></div>';
    html += '<div class="stk-buy"><label>Input Pembelian Hari Ini</label><div class="stk-buy-row"><input id="stkBuy" type="number" min="0" value="' + esc(buy) + '" placeholder="0"><span class="unit">' + esc(it ? unit(it) : 'pcs') + '</span></div><div class="stk-hint">Isi jumlah stok baru yang dibeli</div></div>';
    html += '<div><label>Order (Qty/pcs/porsi)</label><input value="' + (it ? n(it.order) + ' ' + unit(it) : '-') + '" disabled><div class="stk-hint">(Dari data historis)</div></div>';
    html += '<div><label>Status</label><div class="stk-status">' + chip(it ? level(it) : 'ok') + '</div></div>';
    html += '</div>';
    html += '<div class="stk-grid"><div class="stk-left">';
    html += '<h3>Perbandingan Stok per Periode</h3>';
    html += '<div class="stk-filters"><div><label>Lihat berdasarkan</label><div class="stk-seg"><button type="button" class="' + (S.mode === 'period' ? 'on' : '') + '" data-mode="period">Periode</button><button type="button" class="' + (S.mode === 'date' ? 'on' : '') + '" data-mode="date">Per Tanggal</button></div></div>';
    html += '<div><label>Periode</label><select id="stkPeriod" class="stk-period"><option value="2026-07">Juli 2026</option></select></div>';
    html += '<button type="button" class="stk-xls" id="stkExport"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#21a366"/><path d="M8 8h3l1 4 1-4h3l-2.2 8H12L11 12l-1 4H8.2L8 8z" fill="#fff"/></svg> Export Excel</button></div>';
    html += '<div class="stk-scroll"><table class="stk-table"><thead><tr>';
    html += '<th>No</th><th>Produk</th><th>Satuan</th>';
    html += '<th>Stok Awal<span class="stk-thsub">Juni 2026</span></th>';
    html += '<th>Pembelian<span class="stk-thsub">Juli 2026</span></th>';
    html += '<th>Terpakai<span class="stk-thsub">Juli 2026</span></th>';
    html += '<th>Stok Akhir<span class="stk-thsub">Awal Ags 2026</span></th>';
    html += '<th>Selisih <span class="stk-info-i" title="Selisih = Stok Akhir \u2013 (Stok Awal + Pembelian \u2013 Terpakai)">?</span></th>';
    html += '<th>Status</th></tr></thead><tbody>';
    var start = (S.page - 1) * PAGE;
    S.items.slice(start, start + PAGE).forEach(function (x, i) {
      html += '<tr><td>' + (start + i + 1) + '</td><td>' + esc(x.display) + '</td><td>' + esc(unit(x)) + '</td><td>' + n(x.awal) + '</td><td>' + n(x.beli) + '</td><td>' + n(x.pakai) + '</td><td>' + n(x.akhir) + '</td><td>' + signed(x.disc) + '</td><td>' + chip(level(x)) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="stk-pager"><span>Menampilkan ' + (S.items.length ? start + 1 : 0) + '\u2013' + Math.min(start + PAGE, S.items.length) + ' dari ' + S.items.length + ' item</span><div class="stk-pages">';
    html += '<button type="button" data-pg="' + Math.max(1, S.page - 1) + '">\u2039</button>';
    pages().forEach(function (p) {
      if (p === '\u2026') html += '<button type="button" class="dots" disabled>\u2026</button>';
      else html += '<button type="button" class="' + (p === S.page ? 'on' : '') + '" data-pg="' + p + '">' + p + '</button>';
    });
    html += '<button type="button" data-pg="' + Math.min(last, S.page + 1) + '">\u203a</button></div></div>';
    html += '<div class="stk-foot">Keterangan: Selisih = Stok Akhir \u2013 (Stok Awal + Pembelian \u2013 Terpakai)</div>';
    html += '</div>';
    var orderPct = st.total ? ((st.order / st.total) * 100).toFixed(1) : '0.0';
    var critPct = st.total ? ((st.crit / st.total) * 100).toFixed(1) : '0.0';
    html += '<div class="stk-gauge-card"><h3>Kecukupan Stok (PAR) <span class="stk-info-i" title="Persentase jenis item dengan stok saat ini \u2265 minimum">?</span></h3>';
    html += gauge(st.pct);
    html += '<div class="stk-score"><strong>' + st.pct.toFixed(1) + '%</strong><div class="lab">' + (st.pct >= 75 ? 'Aman' : st.pct >= 50 ? 'Waspada' : 'Kritis') + '</div><small>' + st.ok + ' dari ' + st.total + ' item di atas minimum</small></div>';
    html += '<div class="stk-legend">';
    html += '<div class="stk-leg"><span><i class="stk-dot" style="background:#22c55e"></i>Aman (\u2265 Min)</span><b>' + st.ok + ' item (' + st.pct.toFixed(1) + '%)</b></div>';
    html += '<div class="stk-leg"><span><i class="stk-dot" style="background:#f59e0b"></i>Perlu Order (&lt; Min s.d. Order)</span><b>' + st.order + ' item (' + orderPct + '%)</b></div>';
    html += '<div class="stk-leg"><span><i class="stk-dot" style="background:#ef4444"></i>Kritis (\u2264 0 / Habis)</span><b>' + st.crit + ' item (' + critPct + '%)</b></div>';
    html += '</div>';
    html += '<div class="stk-note">\u24d8 Semakin tinggi persentase, semakin aman kecukupan stok Anda.</div></div></div></div>';
    host.innerHTML = html;
    bind();
  }
  function bind() {
    var p = document.getElementById('stkPick');
    if (p) p.onchange = function () { S.selected = this.value; render(); };
    var b = document.getElementById('stkBuy');
    if (b) b.onchange = async function () {
      var q = Number(this.value);
      if (!q) return;
      try { await postPurchase(S.selected, q); await load(); }
      catch (e) { alert(e.message); await load(); }
    };
    var ex = document.getElementById('stkExport');
    if (ex) ex.onclick = exportExcel;
    document.querySelectorAll('#stok [data-mode]').forEach(function (x) {
      x.onclick = function () { S.mode = x.getAttribute('data-mode'); render(); };
    });
    document.querySelectorAll('#stok [data-pg]').forEach(function (x) {
      x.onclick = function () { S.page = Number(x.getAttribute('data-pg')); render(); };
    });
  }
  function mount() {
    var h = document.getElementById('stok');
    if (h && !h.__stkMounted) {
      h.__stkMounted = true;
      load();
    }
  }
  var tries = 0;
  (function wait() {
    mount();
    if (tries++ < 200) setTimeout(wait, 250);
  })();
})();
