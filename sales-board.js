/* Hasnaria Sales — infographic overlay + Majoo import */
(function () {
  'use strict';

  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var TAG_SKU = '⟦SKU:';
  var TAG_PAY_RE = /⟦PAY:cash=([\d.]+)\|qris=([\d.]+)\|tf=([\d.]+)⟧/;
  var STATE = { mode: 'daily', rows: [], loading: false, fetched: false, importing: false, fileName: '', msg: '', error: '', draw: false };

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
  function money(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim().replace(/\s/g, '');
    if (!s) return null;
    if (/^-?\d+(?:[.,]\d+)?$/.test(s)) {
      if (s.indexOf('.') >= 0 && s.indexOf(',') >= 0) return Number(s.replace(/\./g, '').replace(',', '.'));
      if (s.indexOf(',') >= 0) return Number(s.replace(',', '.'));
      if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
      return Number(s);
    }
    var m = s.match(/-?[\d.,]+/);
    if (!m) return null;
    var z = m[0];
    if (z.indexOf('.') >= 0 && z.indexOf(',') >= 0) z = z.replace(/\./g, '').replace(',', '.');
    else if (z.indexOf('.') >= 0 && /\.\d{3}(?:$|\D)/.test(z)) z = z.replace(/\./g, '');
    else z = z.replace(',', '.');
    var n = Number(z);
    return isFinite(n) ? n : null;
  }
  function normHeader(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[\u00a0_\-\/\\()\[\]{}:;,.]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function findKey(keys, patterns) {
    var norm = keys.map(function (k) { return { raw: k, n: normHeader(k) }; });
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      for (var j = 0; j < norm.length; j++) {
        if (p.test(norm[j].n)) return norm[j].raw;
      }
    }
    return null;
  }
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && isFinite(v)) {
      var d0 = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(d0.getTime())) return d0.toISOString().slice(0, 10);
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s|$)/);
    if (m) {
      var y = Number(m[3]); if (y < 100) y += 2000;
      return y + '-' + String(Number(m[2])).padStart(2, '0') + '-' + String(Number(m[1])).padStart(2, '0');
    }
    m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (m) return m[1] + '-' + String(Number(m[2])).padStart(2, '0') + '-' + String(Number(m[3])).padStart(2, '0');
    var mon = {jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,jun:6,juni:6,jul:7,juli:7,agu:8,agt:8,ags:8,agustus:8,sep:9,sept:9,september:9,okt:10,oktober:10,nov:11,november:11,des:12,desember:12};
    m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})/);
    if (m && mon[m[2].toLowerCase()]) {
      var y2 = Number(m[3]); if (y2 < 100) y2 += 2000;
      return y2 + '-' + String(mon[m[2].toLowerCase()]).padStart(2, '0') + '-' + String(Number(m[1])).padStart(2, '0');
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  function isoFromDateOnly(s) { return new Date(s + 'T00:00:00'); }
  function addDays(s, days) { var d = isoFromDateOnly(s); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  function startOfWeek(s) { var d = isoFromDateOnly(s); var day = d.getDay(); var diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10); }
  function monthStart(s) { var d = isoFromDateOnly(s); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }
  function previousWindow(end, mode) {
    if (mode === 'daily') return { end: addDays(end, -14), start: addDays(end, -27) };
    if (mode === 'weekly') {
      var w = startOfWeek(end);
      return { end: addDays(w, -7), start: addDays(w, -83) };
    }
    var m = monthStart(end), d = isoFromDateOnly(m); d.setMonth(d.getMonth() - 12);
    var st = d.toISOString().slice(0, 10); var e = isoFromDateOnly(m); e.setDate(e.getDate() - 1);
    return { start: st, end: e.toISOString().slice(0, 10) };
  }
  function activeWindow(latest, mode) {
    if (mode === 'daily') return { start: addDays(latest, -13), end: latest };
    if (mode === 'weekly') { var w = startOfWeek(latest); return { start: addDays(w, -77), end: latest }; }
    var m = monthStart(latest); var d = isoFromDateOnly(m); d.setMonth(d.getMonth() - 11); return { start: d.toISOString().slice(0, 10), end: latest };
  }
  function daysBetween(a, b) { return Math.max(0, Math.round((isoFromDateOnly(b) - isoFromDateOnly(a)) / 86400000)); }
  function pickDate(rows) {
    var dates = rows.map(function (r) { return r.metric_date; }).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }
  function percent(curr, prev) {
    if (prev === 0) return curr === 0 ? '0%' : 'Baru';
    var p = ((curr - prev) / Math.abs(prev)) * 100;
    return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
  }
  function pctClass(curr, prev) { return curr >= prev ? 'up' : 'down'; }
  function parseSku(raw) {
    var out = [];
    var s = String(raw || '');
    var m = s.match(/⟦SKU:([^⟧]*)⟧/);
    if (!m) return out;
    m[1].split('|').forEach(function (piece) {
      var z = piece.split('='); if (z.length < 2) return;
      var q = num(z.slice(1).join('=')); if (q == null) return;
      out.push({ name: z[0].trim(), qty: q });
    });
    return out;
  }
  function removeSku(notes) { return String(notes || '').replace(/⟦SKU:[^⟧]*⟧\s*/g, '').trim(); }
  function setPay(notes, cash, qris, tf) {
    var base = String(notes || '').replace(TAG_PAY_RE, '').trim();
    return '⟦PAY:cash=' + Math.round(cash || 0) + '|qris=' + Math.round(qris || 0) + '|tf=' + Math.round(tf || 0) + '⟧' + (base ? ' ' + base : '');
  }
  function preservePayAndSku(oldNotes, newSku, pay) {
    var base = removeSku(oldNotes);
    if (pay) base = setPay(base, pay.cash, pay.qris, pay.tf);
    var skuText = newSku.length ? '⟦SKU:' + newSku.map(function (x) { return x.name + '=' + Math.round(x.qty); }).join('|') + '⟧' : '';
    return [base, skuText].filter(Boolean).join(' ').trim();
  }
  async function api(path, opts) {
    var t = tok(); if (!t) throw new Error('Sesi login belum siap. Silakan masuk kembali.');
    var cfg = opts || {}; cfg.headers = Object.assign({ apikey: KEY, Authorization: 'Bearer ' + t }, cfg.headers || {});
    var r = await fetch(SB + '/rest/v1/' + path, cfg);
    if (!r.ok) { var tx = await r.text(); throw new Error(tx || ('Supabase error ' + r.status)); }
    var ct = r.headers.get('content-type') || '';
    return ct.indexOf('application/json') >= 0 ? r.json() : null;
  }
  async function loadMetrics() {
    if (STATE.loading) return;
    STATE.loading = true;
    if (!STATE.fetched) draw();
    try {
      STATE.rows = await api('daily_metrics?brand_id=eq.' + encodeURIComponent(BRAND) + '&select=metric_date,cash_revenue,transactions,notes,brand_id&order=metric_date.asc');
      STATE.rows = (STATE.rows || []).map(function (r) { return Object.assign({}, r, { cash_revenue: Number(r.cash_revenue || 0), transactions: Number(r.transactions || 0) }); });
      STATE.loading = false; STATE.fetched = true; STATE.error = ''; draw();
    } catch (e) { STATE.loading = false; STATE.fetched = true; STATE.error = e.message; draw(); }
  }
  function aggregateSku(rows) {
    var map = {};
    rows.forEach(function (r) {
      parseSku(r.notes).forEach(function (x) { map[x.name] = (map[x.name] || 0) + x.qty; });
    });
    return Object.keys(map).map(function (k) { return { name: k, qty: map[k] }; }).sort(function (a,b) { return b.qty - a.qty; });
  }
  function groupTrend(rows, mode) {
    var map = {};
    rows.forEach(function (r) {
      var key = r.metric_date;
      var label = key;
      if (mode === 'weekly') { key = startOfWeek(r.metric_date); label = 'Minggu ' + key.slice(8) + '/' + key.slice(5,7); }
      if (mode === 'monthly') { key = monthStart(r.metric_date); label = key.slice(5,7) + '/' + key.slice(0,4); }
      if (!map[key]) map[key] = { key: key, label: label, omzet: 0, trx: 0, days: 0 };
      map[key].omzet += r.cash_revenue; map[key].trx += r.transactions; map[key].days += 1;
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }
  function statsFor(rows) {
    var omzet = rows.reduce(function (a,r) { return a + r.cash_revenue; }, 0);
    var trx = rows.reduce(function (a,r) { return a + r.transactions; }, 0);
    return { omzet: omzet, trx: trx, atv: trx ? omzet / trx : 0, days: rows.length };
  }
  function kpiCard(title, value, sub, cls) {
    return '<div class="sb-kpi"><div class="sb-kpi-label">' + title + '</div><div class="sb-kpi-value">' + value + '</div><div class="sb-kpi-sub ' + cls + '">' + sub + '</div></div>';
  }
  function lineChart(data) {
    if (!data.length) return '<div class="sb-empty-chart">Belum ada data pada periode ini.</div>';
    var w = 760, h = 250, padL = 46, padR = 16, padT = 18, padB = 42;
    var max = Math.max.apply(null, data.map(function (x) { return x.omzet; }).concat([1]));
    var pts = data.map(function (x, i) {
      var xx = padL + (data.length === 1 ? 0 : i * ((w - padL - padR) / (data.length - 1)));
      var yy = padT + (h - padT - padB) * (1 - x.omzet / max);
      return { x: xx, y: yy, d: x };
    });
    var path = pts.map(function (p,i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var area = 'M' + pts[0].x.toFixed(1) + ' ' + (h-padB) + ' ' + pts.map(function (p) { return 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ') + ' L' + pts[pts.length-1].x.toFixed(1) + ' ' + (h-padB) + ' Z';
    var labels = pts.map(function (p,i) { return (i % Math.max(1, Math.ceil(data.length/6)) === 0 || i === data.length-1) ? '<text x="' + p.x + '" y="' + (h-16) + '" text-anchor="middle">' + esc(p.d.label) + '</text>' : ''; }).join('');
    return '<svg class="sb-chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Tren omzet">' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (h-padB) + '" class="axis"/><line x1="' + padL + '" y1="' + (h-padB) + '" x2="' + (w-padR) + '" y2="' + (h-padB) + '" class="axis"/>' +
      '<path d="' + area + '" class="area"/><path d="' + path + '" class="trend"/>' +
      pts.map(function (p) { return '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" class="point"><title>' + esc(p.d.label) + ' • ' + esc(money(p.d.omzet)) + '</title></circle>'; }).join('') +
      '<text x="8" y="18" class="ylabel">' + esc(money(max)) + '</text>' + labels + '</svg>';
  }
  function barList(items, total) {
    if (!items.length) return '<div class="sb-empty-list">Belum ada data SKU.</div>';
    var mx = Math.max.apply(null, items.map(function (x) { return x.qty; }).concat([1]));
    return '<div class="sb-bars">' + items.slice(0,5).map(function (x, i) {
      return '<div class="sb-bar-row"><div class="sb-bar-rank">' + (i+1) + '</div><div class="sb-bar-label"><span>' + esc(x.name) + '</span><b>' + x.qty.toLocaleString('id-ID') + ' qty</b></div><div class="sb-bar-track"><div class="sb-bar-fill" style="width:' + Math.max(4, x.qty / mx * 100) + '%"></div></div></div>';
    }).join('') + '</div>';
  }
  function rangeRows(w) { return STATE.rows.filter(function (r) { return r.metric_date >= w.start && r.metric_date <= w.end; }); }
  function latestDate() { return pickDate(STATE.rows); }
  function renderImportBlock() {
    return '<div class="sb-actions"><label class="sb-upload"><input id="sbFile" type="file" accept=".csv,.xlsx,.xls,.txt" hidden><span>↥</span> Update dari Majoo</label><button type="button" class="sb-help" id="sbFormat">Format Majoo</button></div>';
  }
  function draw() {
    var host = document.getElementById('sales'); if (!host) return;
    var board = host.querySelector('.sale-board');
    if (!board) {
      board = document.createElement('div'); board.className = 'sale-board'; board.id = 'saleBoard';
      host.insertBefore(board, host.firstChild);
    }
    if (STATE.draw) return;
    STATE.draw = true;
    var html = '<div class="sb-wrap">' +
      '<div class="sb-head"><div><div class="sb-eyebrow">SALES INTELLIGENCE</div><h2>Dashboard Penjualan</h2><p>Tren omzet, produktivitas produk, dan update data dari export Majoo.</p></div>' + renderImportBlock() + '</div>';
    if (STATE.error) html += '<div class="sb-error">' + esc(STATE.error) + '</div>';
    if (STATE.loading) { board.innerHTML = html + '<div class="sb-loading">Memuat data penjualan…</div></div>'; STATE.draw = false; bind(); return; }
    if (!STATE.rows.length) {
      board.innerHTML = html + '<div class="sb-empty"><div class="sb-empty-icon">◌</div><h3>Belum ada data penjualan</h3><p>Upload export Majoo untuk membangun dashboard. Data contoh tidak digunakan sebagai data live.</p></div></div>';
      STATE.draw = false; bind(); return;
    }
    var latest = latestDate();
    var active = activeWindow(latest, STATE.mode), prev = previousWindow(latest, STATE.mode);
    var ar = rangeRows(active), pr = rangeRows(prev), a = statsFor(ar), p = statsFor(pr);
    var trend = groupTrend(ar, STATE.mode), sku = aggregateSku(ar), top = sku.slice(0,5), worst = sku.slice().reverse().slice(0,5);
    var periodLabel = STATE.mode === 'daily' ? '14 hari terakhir' : STATE.mode === 'weekly' ? '12 minggu terakhir' : '12 bulan terakhir';
    html += '<div class="sb-period"><div><b>Periode aktif:</b> ' + esc(active.start) + ' s/d ' + esc(active.end) + ' <span>' + periodLabel + '</span></div><div class="sb-toggle">' + ['daily','weekly','monthly'].map(function(m){var t=m==='daily'?'Harian':m==='weekly'?'Mingguan':'Bulanan';return '<button type="button" class="'+(STATE.mode===m?'on':'')+'" data-mode="'+m+'">'+t+'</button>';}).join('') + '</div></div>';
    html += '<div class="sb-kpis">' +
      kpiCard('Omzet', money(a.omzet), percent(a.omzet,p.omzet) + ' vs periode sebelumnya', pctClass(a.omzet,p.omzet)) +
      kpiCard('Jumlah transaksi', a.trx.toLocaleString('id-ID'), percent(a.trx,p.trx) + ' vs periode sebelumnya', pctClass(a.trx,p.trx)) +
      kpiCard('ATV / nota', money(a.atv), percent(a.atv,p.atv) + ' vs periode sebelumnya', pctClass(a.atv,p.atv)) +
      kpiCard('Hari tercatat', a.days.toLocaleString('id-ID'), 'periode sebelumnya: ' + p.days + ' hari', '') + '</div>';
    html += '<div class="sb-grid-main"><section class="sb-card sb-trend"><div class="sb-card-head"><div><h3>Tren Omzet</h3><span>Agregasi sesuai toggle periode aktif</span></div></div>' + lineChart(trend) + '</section>';
    html += '<section class="sb-card"><div class="sb-card-head"><div><h3>Top 5 Seller (Qty)</h3><span>Produk terlaris pada periode aktif</span></div></div>' + barList(top) + '</section></div>';
    html += '<div class="sb-grid-main"><section class="sb-card"><div class="sb-card-head"><div><h3>5 Worst Performer (Qty)</h3><span>Produk dengan qty terendah</span></div></div>' + barList(worst) + '</section>';
    html += '<section class="sb-card sb-import"><div class="sb-card-head"><div><h3>Update dari Majoo</h3><span>Upload laporan untuk mengganti data produk per tanggal tanpa menambah duplikat</span></div></div>' +
      '<div class="sb-import-copy"><b>Format diterima</b><div>.csv · .xlsx · .xls · .txt</div><p>Kenali ekspor Majoo: Penjualan Per Periode (Periode, Penjualan, Total Transaksi) dan Penjualan Produk (Produk, SKU, Jumlah, Penjualan Rp).</p></div>' + renderImportBlock() + (STATE.msg ? '<div class="sb-ok">' + esc(STATE.msg) + '</div>' : '') + '</section></div>';
    html += '<div class="sb-live-note">Data dashboard hanya berasal dari tabel <b>daily_metrics</b>. Import Majoo melakukan upsert berdasarkan <b>brand_id + tanggal</b>, mengganti tag SKU pada tanggal yang sama dan mempertahankan tag PAY yang sudah ada bila data pembayaran tidak tersedia.</div>';
    html += '<div class="sb-legacy-note"><b>Form omzet + kas harian tetap ada di bawah dashboard ini.</b></div></div>';
    board.innerHTML = html; STATE.draw = false; bind();
  }
  function bind() {
    var host = document.getElementById('sales'); if (!host) return;
    host.querySelectorAll('[data-mode]').forEach(function (b) { b.onclick = function () { STATE.mode = b.getAttribute('data-mode'); draw(); }; });
    host.querySelectorAll('#sbFormat').forEach(function (b) { b.onclick = function () { alert('Pakai Laporan Penjualan Per Periode (Periode, Penjualan, Total Transaksi) dan/atau Penjualan Produk (Produk, SKU, Jumlah, Penjualan Rp).'); }; });
    host.querySelectorAll('#sbFile').forEach(function (input) { input.onchange = function () { if (input.files && input.files[0]) importFile(input.files[0]); }; });
  }
  function addScript(src) { return new Promise(function(resolve,reject){ var s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); }); }
  async function ensureXLSX() { if (window.XLSX) return; await addScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); }
  function parseText(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (x) { return x.trim(); });
    if (!lines.length) return [];
    var delim = lines[0].indexOf('\t') >= 0 ? '\t' : (lines[0].indexOf(';') >= 0 ? ';' : ',');
    function split(line) {
      var out=[], cur='', q=false;
      for(var i=0;i<line.length;i++){var c=line[i];if(c==='"'){if(q && line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===delim && !q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;
    }
    var heads = split(lines[0]);
    return lines.slice(1).map(function(line){var a=split(line),o={};heads.forEach(function(h,i){o[h]=a[i] == null ? '' : a[i];});return o;});
  }
  async function readFile(file) {
    var ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'xlsx' || ext === 'xls') {
      await ensureXLSX();
      var buf = await file.arrayBuffer(); var wb = XLSX.read(buf, { type:'array', cellDates:true });
      var sh = wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(sh, { defval:'' });
    }
    return parseText(await file.text());
  }
  function normalizeImport(rows) {
    if (!rows.length) throw new Error('File kosong atau sheet pertama tidak berisi data.');
    var keys = Object.keys(rows[0]);
    var kDate = findKey(keys, [/^(tanggal|tgl|date|periode|period|hari)$/,/tanggal/,/periode/,/period/,/date/]);
    var kTotal = findKey(keys, [/total penjualan/,/penjualan bersih/,/penjualan kotor/,/penjualan rp/,/grand total/,/omzet/,/^penjualan$/,/penjualan/]);
    var kTrx = findKey(keys, [/jumlah transaksi/,/jumlah struk/,/transaksi/,/struk/]);
    var kProd = findKey(keys, [/nama produk/,/produk/,/item/,/sku/]);
    var kQty = findKey(keys, [/qty/,/quantity/,/kuantitas/,/jumlah/]);
    var kCash = findKey(keys, [/tunai/,/^cash/,/cash/]);
    var kQris = findKey(keys, [/qris/]);
    var kTf = findKey(keys, [/transfer/,/^tf$/,/ tf /]);
    var fallbackDate = null;
    if (!kDate) {
      rows.slice(0, 25).forEach(function (row) {
        Object.keys(row).forEach(function (k) {
          if (fallbackDate) return;
          fallbackDate = parseDate(row[k]);
        });
      });
      if (!fallbackDate) fallbackDate = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      STATE.msg = (STATE.msg ? STATE.msg + ' ' : '') + 'Kolom tanggal tidak ada; data dipasang ke ' + fallbackDate + '.';
    }
    if (!kTotal && !(kProd && kQty)) throw new Error('Kolom omzet/penjualan atau produk+qty tidak ditemukan.');
    var groups = {};
    rows.forEach(function(row){
      var date = kDate ? parseDate(row[kDate]) : fallbackDate; if (!date) return;
      var g = groups[date] || (groups[date] = { date:date, omzet:0, trx:0, trxVals:[], cash:[], qris:[], tf:[], skus:{} });
      var rev = kTotal ? num(row[kTotal]) : null; if (rev != null) g.omzet += rev;
      var trx = num(kTrx ? row[kTrx] : null); if (trx != null) g.trxVals.push(trx);
      var prod = kProd ? String(row[kProd] || '').trim() : '';
      var qty = num(kQty ? row[kQty] : null);
      if (prod && qty != null) g.skus[prod] = (g.skus[prod] || 0) + qty;
      if (kCash) { var c = num(row[kCash]); if (c != null) g.cash.push(c); }
      if (kQris) { var q = num(row[kQris]); if (q != null) g.qris.push(q); }
      if (kTf) { var t = num(row[kTf]); if (t != null) g.tf.push(t); }
    });
    var out = Object.keys(groups).sort().map(function(date){
      var g=groups[date];
      function payment(vals){ if(!vals.length)return 0; var same=vals.every(function(v){return v===vals[0];}); return same && vals.length>1 ? vals[0] : vals.reduce(function(a,b){return a+b;},0); }
      var sameRevRows = kTotal ? rows.filter(function(r){ return (kDate ? parseDate(r[kDate]) : fallbackDate)===date; }).map(function(r){return num(r[kTotal]);}).filter(function(v){return v!=null;}) : [];
      if (sameRevRows.length > 1 && sameRevRows.every(function(v){return v===sameRevRows[0];})) g.omzet = sameRevRows[0];
      var trx = g.trxVals.length ? Math.max.apply(null,g.trxVals) : 0;
      return { date:date, omzet:g.omzet, trx:trx, cash:payment(g.cash), qris:payment(g.qris), tf:payment(g.tf), skus:Object.keys(g.skus).map(function(k){return {name:k,qty:g.skus[k]};}) };
    }).filter(function(x){ return x.omzet || x.trx || x.skus.length || x.cash || x.qris || x.tf; });
    if (!out.length) throw new Error('Tidak ada baris valid setelah parsing. Periksa format tanggal dan omzet.');
    return out;
  }
  async function importFile(file) {
    STATE.importing = true; STATE.msg = 'Membaca ' + file.name + '…'; STATE.error = ''; draw();
    try {
      var raw = await readFile(file); var data = normalizeImport(raw);
      var dates = data.map(function(x){return x.date;});
      var inList = dates.map(function(d){return '"'+d+'"';}).join(',');
      var old = await api('daily_metrics?brand_id=eq.' + encodeURIComponent(BRAND) + '&metric_date=in.(' + dates.join(',') + ')&select=metric_date,notes');
      var oldMap = {}; (old || []).forEach(function(r){ oldMap[r.metric_date] = r.notes || ''; });
      var payload = data.map(function(x){
        var payAvailable = x.cash || x.qris || x.tf;
        var notesOld = oldMap[x.date] || '';
        var notes = preservePayAndSku(notesOld, x.skus, payAvailable ? {cash:x.cash,qris:x.qris,tf:x.tf} : null);
        return { brand_id:BRAND, metric_date:x.date, cash_revenue:Math.round(x.omzet), transactions:Math.round(x.trx), notes:notes };
      });
      try {
        await api('daily_metrics?on_conflict=brand_id,metric_date', { method:'POST', headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify(payload) });
      } catch (upErr) {
        for (var ui = 0; ui < payload.length; ui++) {
          var prow = payload[ui];
          var hit = await api('daily_metrics?brand_id=eq.' + encodeURIComponent(BRAND) + '&metric_date=eq.' + prow.metric_date + '&select=id');
          if (hit && hit[0] && hit[0].id) {
            await api('daily_metrics?id=eq.' + hit[0].id, { method:'PATCH', headers:{'Content-Type':'application/json',Prefer:'return=minimal'}, body:JSON.stringify(prow) });
          } else {
            await api('daily_metrics', { method:'POST', headers:{'Content-Type':'application/json',Prefer:'return=minimal'}, body:JSON.stringify(prow) });
          }
        }
      }
      STATE.fileName = file.name; STATE.msg = 'Berhasil update ' + payload.length + ' tanggal dari ' + file.name + '. Data SKU per tanggal diganti (REPLACE), bukan ditambah dobel.'; STATE.importing = false;
      await loadMetrics();
    } catch(e) { STATE.importing=false; STATE.error='Import gagal: '+e.message; STATE.msg=''; draw(); }
  }
  function css() {
    if (document.getElementById('sales-board-css')) return;
    var s=document.createElement('style'); s.id='sales-board-css'; s.textContent =
      '#sales{background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important}' +
      '.sale-board{width:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#13251d}' +
      '.sb-wrap{background:#f4f7f5;border:1px solid #dfe9e4;border-radius:18px;padding:22px 24px 24px;margin-bottom:14px}' +
      '.sb-head{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}.sb-eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;color:#176b55}.sb-head h2{font-size:24px;margin:4px 0 4px;color:#101714}.sb-head p{color:#66756e;font-size:13px}.sb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sb-upload{display:inline-flex;align-items:center;gap:8px;background:#176b55;color:#fff;border-radius:10px;min-height:40px;padding:0 14px;font-size:13px;font-weight:800;cursor:pointer}.sb-upload span{font-size:18px}.sb-help{min-height:40px;padding:0 12px;background:#fff;border:1px solid #d4dfd9;color:#176b55;border-radius:10px}.sb-period{margin-top:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.sb-period span{color:#7a8983;font-size:12px}.sb-toggle{display:flex;gap:3px;background:#e8efeb;border-radius:10px;padding:3px}.sb-toggle button{min-height:34px;padding:0 13px;background:transparent;border:0;border-radius:8px;font-size:12px}.sb-toggle button.on{background:#176b55;color:#fff}.sb-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}.sb-kpi{background:#fff;border:1px solid #e0e8e4;border-radius:14px;padding:15px}.sb-kpi-label{font-size:12px;color:#6e7d76;font-weight:700}.sb-kpi-value{font-size:23px;font-weight:800;margin-top:5px;color:#101714}.sb-kpi-sub{font-size:11px;margin-top:6px;color:#7a8982}.sb-kpi-sub.up{color:#1d7b59}.sb-kpi-sub.down{color:#b43b3b}.sb-grid-main{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,.9fr);gap:14px;margin-top:14px}.sb-card{background:#fff;border:1px solid #e0e8e4;border-radius:14px;padding:16px}.sb-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sb-card h3{font-size:16px;margin:0}.sb-card-head span{display:block;font-size:11px;color:#7a8983;margin-top:3px}.sb-chart{width:100%;height:auto;margin-top:8px}.sb-chart .axis{stroke:#dfe7e2;stroke-width:1}.sb-chart .area{fill:rgba(23,107,85,.08)}.sb-chart .trend{fill:none;stroke:#176b55;stroke-width:3}.sb-chart .point{fill:#176b55}.sb-chart text{font-size:10px;fill:#7a8983}.sb-chart .ylabel{font-size:10px}.sb-bars{margin-top:12px}.sb-bar-row{margin:13px 0}.sb-bar-label{display:flex;justify-content:space-between;gap:8px;font-size:12px}.sb-bar-label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-bar-label b{font-weight:800}.sb-bar-rank{display:inline-flex;float:left;width:20px;height:20px;border-radius:50%;background:#eef3f0;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#176b55;margin-right:7px}.sb-bar-track{height:9px;background:#edf2ef;border-radius:99px;margin:7px 0 0 27px;overflow:hidden}.sb-bar-fill{height:100%;background:#176b55;border-radius:99px}.sb-empty,.sb-loading,.sb-empty-chart,.sb-empty-list{background:#fff;border:1px dashed #cbd8d1;border-radius:14px;padding:24px;text-align:center;color:#6e7d76}.sb-empty{margin-top:14px}.sb-empty-icon{font-size:28px;color:#176b55}.sb-empty h3{margin:8px 0 4px;color:#101714}.sb-error{margin-top:12px;background:#fff1f1;color:#a61b1b;border:1px solid #f3c6c6;border-radius:12px;padding:10px 12px;font-size:12px}.sb-ok{margin-top:10px;background:#ecf8f1;color:#176b55;border-radius:10px;padding:10px 12px;font-size:12px}.sb-import-copy{margin-top:10px;background:#f7faf8;border-radius:10px;padding:11px 12px;font-size:12px;color:#66756e}.sb-import-copy b{color:#13251d}.sb-import-copy p{margin-top:5px;line-height:1.45}.sb-import .sb-actions{margin-top:10px}.sb-live-note{margin-top:14px;background:#eef6f3;border-radius:12px;padding:10px 12px;font-size:11px;color:#42665a}.sb-legacy-note{margin-top:8px;color:#5d6d66;font-size:12px;padding:0 2px}.sb-wrap button{cursor:pointer}.sb-wrap input[type=file]{display:none}@media(max-width:920px){.sb-kpis{grid-template-columns:1fr 1fr}.sb-grid-main{grid-template-columns:1fr}}@media(max-width:620px){.sb-wrap{padding:16px}.sb-kpis{grid-template-columns:1fr}.sb-grid-main{grid-template-columns:1fr}.sb-head h2{font-size:21px}}';
    document.head.appendChild(s);
  }
  function hasBoard(h) { return !!(h && h.querySelector && h.querySelector('.sale-board')); }
  function ensureBoard() { var h=document.getElementById('sales'); if(!h || !document.getElementById('app') || document.getElementById('app').classList.contains('hidden')) return; if(!hasBoard(h)){ draw(); } }
  function watch() { var h=document.getElementById('sales'); if(!h || h.__saleObs)return; h.__saleObs=true; new MutationObserver(function(){ if(STATE.draw)return; if(!hasBoard(h)) { draw(); } }).observe(h,{childList:true}); }
  function mount() { css(); var h=document.getElementById('sales'); if(!h)return; watch(); ensureBoard(); }
  document.addEventListener('click', function(e){ var t=e.target&&e.target.closest?e.target.closest('[data-tab="sales"],.tab'):null; if(!t)return; var id=t.getAttribute('data-tab'); if(id==='sales'||(t.textContent||'').toLowerCase().indexOf('penjualan')!==-1){ setTimeout(mount,40); setTimeout(function(){if(!STATE.fetched)loadMetrics();},220); } }, true);
  var tries=0; (function wait(){ mount(); if(document.getElementById('sales') && !STATE.fetched && tok()) loadMetrics(); if(!STATE.fetched && tries++<80)setTimeout(wait,400); })();
})();
