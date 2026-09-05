/* Hasnaria Sales — Interactive Infographic Dashboard + Multi-Format Majoo Import */
(function () {
  'use strict';

  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var TAG_SKU = '⟦SKU:';
  var TAG_PAY_RE = /⟦PAY:cash=([\d.]+)\|qris=([\d.]+)\|tf=([\d.]+)⟧/;

  // Standard Majoo Menu Price Dictionary (used for SKU revenue calculations)
  var PRICE_MAP = {
    'TOPOKKI': 10000,
    'ODENG': 5000,
    'DUMPLING CHEESE': 2000,
    'ODENG TIPIS': 3000,
    'SIOMAY': 1000,
    'SCALLOP': 2000,
    'KUAH ODENG': 0,
    'CHIKUWA': 2000,
    'ES KRIM TURKIY': 5000,
    'SHRIMP TAIL': 3000,
    'BAKSO IKAN': 1500,
    'RABOKKI': 15000,
    'FISHROLL': 2500,
    'SOSIS AYAM': 4000,
    'CRAB STICK': 2500,
    'FISH TOFU': 2000,
    'KUAH TOMYAM': 0,
    'DUMPLING AYAM': 2000,
    'MIE PEDAS': 6000,
    'SALMON STICK': 2500,
    'ICE CREAM BOWL': 5000,
    'BAKSO UDANG': 1500,
    'JASMINE TEA': 4000,
    'MINI NORI': 2000,
    'MIE KUNING': 2000,
    'NASI AYAM KATSU': 12000,
    'BAKSO AYAM': 1000,
    'POP MIE': 8000,
    'ICE LYCHEE TEA': 10000,
    'ICE LEMON TEA': 5000,
    'AIR MINERAL BESAR': 4000,
    'SNACK 3000': 3000,
    'CHOCO PANDAN': 11000,
    'KENTANG GORENG': 8000,
    'ES KRIM POTONG COKELAT': 8000,
    'ES KRIM POTONG NEOPOLITAN': 8000,
    'MATCHA LATTE': 9000,
    'MILO': 8000,
    'VANILLA LATTE': 9000,
    'ES KRIM POTONG DURIAN': 10000,
    'CAPPUCINO': 10000,
    'ROTI BAKAR KEJU SUSU': 7000,
    'ES KRIM TURKIY MIX RASA': 6000,
    'BLACK COFFE': 8000,
    'CHOCOLATE': 9000,
    'COFFE LATTE': 9000,
    'MOCCACINO': 9000,
    'BUTTERSCOOTH LATTE': 10000,
    'HAZELNUT CHOCO LATTE': 10000,
    'MIX PLATER': 10000,
    'THAI TEA': 10000,
    'ROTI BAKAR COKELAT KEJU': 8000,
    'BANANA SPLIT': 11000,
    'MIE SEDAP': 5000
  };

  var STATE = {
    mode: 'daily', // 'daily' | 'weekly' | 'monthly'
    slice: null, // null or { type: 'day'|'week'|'month', id: string, label: string }
    skuMetric: 'qty', // 'qty' | 'rev'
    rows: [],
    loading: false,
    fetched: false,
    importing: false,
    importProgress: '',
    stagedFiles: [],
    stagedFileType: '',
    stagedFileRows: 0,
    showHelp: false,
    msg: '',
    error: '',
    draw: false,
    viewFrom: '',
    viewTo: '',
    viewMonth: '',
    tooltip: null
  };

  function jwtAlive(token) {
    try {
      var part = String(token || '').split('.')[1];
      if (!part) return false;
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var payload = JSON.parse(atob(b64));
      return !!(payload && payload.exp && (payload.exp * 1000 > Date.now() + 5000));
    } catch (e) { return false; }
  }

  function pickTokenFromStorage() {
    var prefer = ['hasnaria-auth-v2'];
    var i, k, v, j, t;
    for (i = 0; i < prefer.length; i++) {
      try {
        v = localStorage.getItem(prefer[i]);
        j = JSON.parse(v || '');
        t = j && (j.access_token || (j.currentSession && j.currentSession.access_token));
        if (t && jwtAlive(t)) return t;
      } catch (e) {}
    }
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i) || '';
      if (k.indexOf('auth') < 0 && k.indexOf('supabase') < 0 && k.indexOf('sb-') < 0) continue;
      try {
        v = localStorage.getItem(k);
        j = JSON.parse(v || '');
        t = j && (j.access_token || (j.currentSession && j.currentSession.access_token));
        if (t && jwtAlive(t)) return t;
      } catch (e) {}
    }
    return null;
  }

  async function getTok() {
    if (typeof window.__HASNARIA_GET_ACCESS_TOKEN === 'function') {
      try {
        var fresh = await window.__HASNARIA_GET_ACCESS_TOKEN();
        if (fresh && jwtAlive(fresh)) return fresh;
      } catch (e) {}
    }
    try {
      if (window.__HASNARIA_DB && window.__HASNARIA_DB.auth && window.__HASNARIA_DB.auth.getSession) {
        var res = await window.__HASNARIA_DB.auth.getSession();
        var sess = res && res.data && res.data.session;
        if (sess && sess.access_token && jwtAlive(sess.access_token)) return sess.access_token;
      }
    } catch (e) {}
    return pickTokenFromStorage();
  }

  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

  var monNames = {jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,jun:6,juni:6,jul:7,juli:7,agu:8,agt:8,ags:8,agustus:8,sep:9,sept:9,september:9,okt:10,oktober:10,nov:11,november:11,des:12,desember:12};

  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && isFinite(v)) {
      var d0 = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(d0.getTime())) return d0.toISOString().slice(0, 10);
    }
    var s = String(v).trim().replace(/^[a-zA-Z]+,\s*/, '');
    var m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (m) {
      var y = Number(m[3]); if (y < 100) y += 2000;
      return y + '-' + String(Number(m[2])).padStart(2, '0') + '-' + String(Number(m[1])).padStart(2, '0');
    }
    m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (m) return m[1] + '-' + String(Number(m[2])).padStart(2, '0') + '-' + String(Number(m[3])).padStart(2, '0');
    m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})/);
    if (m && monNames[m[2].toLowerCase()]) {
      var y2 = Number(m[3]); if (y2 < 100) y2 += 2000;
      return y2 + '-' + String(monNames[m[2].toLowerCase()]).padStart(2, '0') + '-' + String(Number(m[1])).padStart(2, '0');
    }
    return null;
  }

  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim().replace(/Rp\.?/i, '').replace(/\s/g, '');
    if (!s) return null;
    if (s.indexOf('.') >= 0 && s.indexOf(',') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
      var n = Number(s); return isFinite(n) ? n : null;
    }
    if (s.indexOf(',') >= 0) {
      s = s.replace(/%/g, '').replace(',', '.');
      var n2 = Number(s); return isFinite(n2) ? n2 : null;
    }
    if (s.indexOf('.') >= 0) {
      if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
      var parts = s.split('.');
      if (parts.length === 2 && parts[1].length <= 2) return Number(s);
    }
    var n3 = Number(s.replace(/[^0-9.-]/g, ''));
    return isFinite(n3) ? n3 : null;
  }


  // Majoo can export omzet as a value in thousands (e.g. 5.835 = Rp5.835.000).
  // Normalize only suspiciously small revenue totals; normal full-rupiah values
  // such as 5.835.000 are already parsed correctly and remain unchanged.
  function revenue(v) {
    var n = num(v);
    if (n == null) return null;
    return (n > 0 && n < 10000) ? n * 1000 : n;
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

  function isoFromDateOnly(s) { return new Date(s + 'T00:00:00'); }
  function addDays(s, days) { var d = isoFromDateOnly(s); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  function startOfWeek(s) { var d = isoFromDateOnly(s); var day = d.getDay(); var diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10); }
  function monthStart(s) { var d = isoFromDateOnly(s); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }

  function lastDayOfMonth(ym) {
    var y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7));
    var d = new Date(y, mo, 0);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function monthsInData() {
    var m = {};
    STATE.rows.forEach(function (r) { if (r.metric_date) m[r.metric_date.slice(0, 7)] = true; });
    return Object.keys(m).sort();
  }

  function dataMinMax() {
    var ds = STATE.rows.map(function (r) { return r.metric_date; }).filter(Boolean).sort();
    return ds.length ? { min: ds[0], max: ds[ds.length - 1] } : { min: '', max: '' };
  }

  function ensureView() {
    var mm = dataMinMax();
    if (!mm.max) return;
    if (STATE.viewFrom && STATE.viewTo) return;
    var months = monthsInData();
    var ym = months.length ? months[months.length - 1] : mm.max.slice(0, 7);
    STATE.viewMonth = ym;
    STATE.viewFrom = ym + '-01';
    STATE.viewTo = lastDayOfMonth(ym);
  }

  function selectedWindow() {
    ensureView();
    if (STATE.viewFrom && STATE.viewTo && STATE.viewFrom <= STATE.viewTo) return { start: STATE.viewFrom, end: STATE.viewTo };
    var mm = dataMinMax();
    return { start: mm.min || '', end: mm.max || '' };
  }

  function previousFor(w) {
    if (!w.start || !w.end) return { start: '', end: '' };
    if (STATE.mode === 'monthly') {
      var y = String(Number(w.start.slice(0, 4)) - 1);
      return { start: y + '-01-01', end: y + '-12-31' };
    }
    var ym = (STATE.viewMonth || w.start.slice(0, 7));
    var y0 = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7)) - 1;
    if (mo < 1) { mo = 12; y0 -= 1; }
    var pym = y0 + '-' + String(mo).padStart(2, '0');
    return { start: pym + '-01', end: lastDayOfMonth(pym) };
  }

  function monthOfView() {
    if (STATE.viewMonth) return STATE.viewMonth;
    if (STATE.viewFrom) return STATE.viewFrom.slice(0, 7);
    var months = monthsInData();
    return months.length ? months[months.length - 1] : '';
  }

  function weekOfMonth(iso) {
    var d = Number(String(iso).slice(8, 10));
    if (!d) return 1;
    return Math.min(5, Math.ceil(d / 7));
  }

  function lastWeekOfMonth(ym) {
    return Number(lastDayOfMonth(ym).slice(8, 10)) > 28 ? 5 : 4;
  }

  function applyModeWindow() {
    STATE.slice = null; // reset slice when switching period granularity
    if (STATE.mode === 'monthly' && !STATE.viewMonth) {
      var mm = dataMinMax();
      STATE.viewFrom = mm.min; STATE.viewTo = mm.max;
      return;
    }
    var ym = monthOfView();
    if (!ym) return;
    if (STATE.mode === 'monthly') {
      var y = ym.slice(0, 4);
      STATE.viewFrom = y + '-01-01'; STATE.viewTo = y + '-12-31';
    } else {
      STATE.viewFrom = ym + '-01'; STATE.viewTo = lastDayOfMonth(ym);
      STATE.viewMonth = ym;
    }
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
      var name = z[0].trim();
      var unitPrice = PRICE_MAP[name.toUpperCase()] || 0;
      out.push({ name: name, qty: q, rev: q * unitPrice });
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
    var skuText = (newSku && newSku.length) ? '⟦SKU:' + newSku.map(function (x) { return x.name + '=' + Math.round(x.qty); }).join('|') + '⟧' : '';
    return [base, skuText].filter(Boolean).join(' ').trim();
  }

  async function api(path, opts) {
    var t = await getTok();
    if (!t) throw new Error('Sesi login belum siap. Silakan masuk kembali.');
    var cfg = opts || {};
    cfg.headers = Object.assign({ apikey: KEY, Authorization: 'Bearer ' + t }, cfg.headers || {});
    var r = await fetch(SB + '/rest/v1/' + path, cfg);
    if (!r.ok) {
      var tx = await r.text();
      throw new Error(tx || ('Supabase error ' + r.status));
    }
    var ct = r.headers.get('content-type') || '';
    return ct.indexOf('application/json') >= 0 ? r.json() : null;
  }

  async function loadMetrics() {
    if (STATE.loading) return;
    var t = await getTok();
    if (!t) return;
    STATE.loading = true; STATE.error = ''; draw();
    try {
      var rows = await api('daily_metrics?brand_id=eq.' + encodeURIComponent(BRAND) + '&limit=5000&select=metric_date,cash_revenue,transactions,notes,brand_id&order=metric_date.asc');
      STATE.rows = (rows || []).map(function (r) {
        return Object.assign({}, r, {
          cash_revenue: Number(r.cash_revenue || 0),
          transactions: Number(r.transactions || 0)
        });
      });
      STATE.loading = false; STATE.fetched = true; STATE.error = '';
      if (!STATE.viewFrom) ensureView();
      draw();
    } catch (e) {
      STATE.loading = false; STATE.fetched = false; STATE.error = e.message;
      draw();
    }
  }

  function rangeRows(w) {
    return STATE.rows.filter(function (r) { return r.metric_date >= w.start && r.metric_date <= w.end; });
  }

  function getSlicedRows(ar) {
    if (!STATE.slice) return ar;
    if (STATE.slice.type === 'day') {
      return ar.filter(function (r) { return r.metric_date === STATE.slice.id; });
    }
    if (STATE.slice.type === 'week') {
      return ar.filter(function (r) { return ('w' + weekOfMonth(r.metric_date)) === STATE.slice.id; });
    }
    if (STATE.slice.type === 'month') {
      return ar.filter(function (r) { return (r.metric_date || '').slice(0, 7) === STATE.slice.id; });
    }
    return ar;
  }

  function aggregateSku(rows) {
    var map = {};
    rows.forEach(function (r) {
      parseSku(r.notes).forEach(function (x) {
        if (!map[x.name]) map[x.name] = { name: x.name, qty: 0, rev: 0 };
        map[x.name].qty += x.qty;
        map[x.name].rev += (x.rev || (x.qty * (PRICE_MAP[x.name.toUpperCase()] || 0)));
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function statsFor(rows) {
    var omzet = rows.reduce(function (a, r) { return a + r.cash_revenue; }, 0);
    var trx = rows.reduce(function (a, r) { return a + r.transactions; }, 0);
    return { omzet: omzet, trx: trx, atv: trx ? Math.round(omzet / trx) : 0, days: rows.length };
  }

  function groupTrend(rows, mode) {
    var IDM = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    if (mode === 'weekly') {
      var ym = monthOfView();
      var lastW = ym ? lastWeekOfMonth(ym) : 5;
      var mapW = {};
      var wRanges = {
        w1: '01 - 07', w2: '08 - 14', w3: '15 - 21', w4: '22 - 28', w5: '29 - 31'
      };
      for (var w = 1; w <= lastW; w++) {
        mapW['w' + w] = { key: 'w' + w, type: 'week', label: 'Minggu ' + w, sub: wRanges['w' + w], omzet: 0, trx: 0, days: 0 };
      }
      rows.forEach(function (r) {
        var wk = weekOfMonth(r.metric_date);
        var g = mapW['w' + wk]; if (!g) return;
        g.omzet += r.cash_revenue; g.trx += r.transactions; g.days += 1;
      });
      return Object.keys(mapW).sort().map(function (k) { return mapW[k]; });
    }
    if (mode === 'monthly') {
      // Monthly view = total omzet for every month in the active year.
      // The selected month determines the year (e.g. Feb 2026 -> Jan–Dec 2026).
      // Aggregate by the YYYY-MM text directly so timezone/date parsing cannot
      // accidentally turn valid daily records into zero-value months.
      var selectedYm = monthOfView() || (STATE.viewFrom || '').slice(0, 7);
      var y = selectedYm ? selectedYm.slice(0, 4) : (STATE.viewFrom || '').slice(0, 4);
      var mapM = {};
      if (!y) return [];
      for (var m = 1; m <= 12; m++) {
        var ym2 = y + '-' + String(m).padStart(2, '0');
        mapM[ym2] = { key: ym2, type: 'month', label: IDM[m], sub: y, omzet: 0, trx: 0, days: 0 };
      }
      rows.forEach(function (r) {
        var date = String(r.metric_date || '');
        if (date.slice(0, 4) !== y) return;
        var keyM = date.slice(0, 7);
        var g2 = mapM[keyM];
        if (!g2) return;
        g2.omzet += Number(r.cash_revenue || 0);
        g2.trx += Number(r.transactions || 0);
        g2.days += 1;
      });
      return Object.keys(mapM).sort().map(function (k) { return mapM[k]; });
    }
    // Mode Daily
    var mapD = {};
    rows.forEach(function (r) {
      var keyD = r.metric_date;
      if (!mapD[keyD]) {
        mapD[keyD] = { key: keyD, type: 'day', label: keyD.slice(8, 10) + '/' + keyD.slice(5, 7), sub: keyD, omzet: 0, trx: 0, days: 0 };
      }
      mapD[keyD].omzet += r.cash_revenue; mapD[keyD].trx += r.transactions; mapD[keyD].days += 1;
    });
    return Object.keys(mapD).sort().map(function (k) { return mapD[k]; });
  }

  function kpiCard(title, value, sub, cls) {
    return '<div class="sb-kpi"><div class="sb-kpi-label">' + title + '</div><div class="sb-kpi-value">' + value + '</div><div class="sb-kpi-sub ' + cls + '">' + sub + '</div></div>';
  }

  // Modern Interactive SVG Chart
  function renderChart(data) {
    if (!data.length) return '<div class="sb-empty-chart">Belum ada data pada periode ini.</div>';
    var w = 760, h = 230, padL = 60, padR = 20, padT = 20, padB = 44;
    var max = Math.max.apply(null, data.map(function (x) { return x.omzet; }).concat([1]));

    if (STATE.mode === 'daily') {
      var pts = data.map(function (x, i) {
        var xx = padL + (data.length === 1 ? (w - padL - padR) / 2 : i * ((w - padL - padR) / (data.length - 1)));
        var yy = padT + (h - padT - padB) * (1 - x.omzet / max);
        var isSelected = STATE.slice && STATE.slice.type === 'day' && STATE.slice.id === x.key;
        return { x: xx, y: yy, d: x, sel: isSelected };
      });

      var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
      var area = 'M' + pts[0].x.toFixed(1) + ' ' + (h - padB) + ' ' + pts.map(function (p) { return 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ') + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (h - padB) + ' Z';

      var labelStep = Math.max(1, Math.ceil(data.length / 8));
      var labels = pts.map(function (p, i) {
        if (i % labelStep === 0 || i === data.length - 1) {
          return '<text x="' + p.x + '" y="' + (h - 16) + '" text-anchor="middle" class="x-label">' + esc(p.d.label) + '</text>';
        }
        return '';
      }).join('');

      var dots = pts.map(function (p) {
        var tip = esc(p.d.sub) + ' · ' + esc(money(p.d.omzet)) + ' (' + p.d.trx + ' trx)';
        var dotClass = 'sb-chart-point' + (p.sel ? ' on-slice' : '');
        return '<g class="sb-chart-dot-group" data-slice-type="day" data-slice-id="' + p.d.key + '" data-slice-label="Tgl ' + esc(p.d.sub) + '">' +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="12" class="sb-touch-target"/>' +
          (p.sel ? '<circle cx="' + p.x + '" cy="' + p.y + '" r="8" class="sb-chart-ring"/>' : '') +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (p.sel ? '5' : '4') + '" class="' + dotClass + '"/>' +
          '<title>' + tip + ' • Klik untuk slice</title></g>';
      }).join('');

      return '<div class="sb-chart-wrap">' +
        '<svg class="sb-chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
        '<defs>' +
        '<linearGradient id="sbAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#176b55" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="#176b55" stop-opacity="0.01"/>' +
        '</linearGradient>' +
        '</defs>' +
        '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (h - padB) + '" class="axis"/>' +
        '<line x1="' + padL + '" y1="' + (h - padB) + '" x2="' + (w - padR) + '" y2="' + (h - padB) + '" class="axis"/>' +
        '<line x1="' + padL + '" y1="' + padT + '" x2="' + (w - padR) + '" y2="' + padT + '" class="grid-line"/>' +
        '<line x1="' + padL + '" y1="' + ((padT + h - padB) / 2) + '" x2="' + (w - padR) + '" y2="' + ((padT + h - padB) / 2) + '" class="grid-line"/>' +
        '<path d="' + area + '" fill="url(#sbAreaGrad)"/>' +
        '<path d="' + path + '" class="trend"/>' +
        dots +
        '<text x="8" y="' + (padT + 4) + '" class="ylabel">' + esc(money(max)) + '</text>' +
        '<text x="8" y="' + ((padT + h - padB) / 2 + 4) + '" class="ylabel">' + esc(money(max / 2)) + '</text>' +
        '<text x="8" y="' + (h - padB) + '" class="ylabel">Rp 0</text>' +
        labels +
        '</svg>' +
        '<div class="sb-chart-hint">💡 Klik titik pada grafik harian untuk slice langsung performa produk hari tersebut</div>' +
        '</div>';
    }

    // Weekly or Monthly Bar Chart
    var nBars = data.length;
    var availW = w - padL - padR;
    var colW = availW / nBars;
    var barW = Math.min(54, colW * 0.65);

    var barsHtml = data.map(function (item, i) {
      var barH = max > 0 ? (h - padT - padB) * (item.omzet / max) : 0;
      var bx = padL + i * colW + (colW - barW) / 2;
      var by = (h - padB) - barH;
      var isSelected = STATE.slice && STATE.slice.type === item.type && STATE.slice.id === item.key;
      var barClass = 'sb-chart-bar' + (isSelected ? ' on-slice' : '');
      var tip = esc(item.label) + (item.sub ? ' (' + item.sub + ')' : '') + ': ' + money(item.omzet) + ' · ' + item.trx + ' trx. Klik untuk slice.';

      return '<g class="sb-bar-group" data-slice-type="' + item.type + '" data-slice-id="' + item.key + '" data-slice-label="' + esc(item.label) + (item.sub ? ' (' + item.sub + ')' : '') + '">' +
        '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + Math.max(3, barH) + '" rx="5" class="' + barClass + '"/>' +
        (item.omzet > 0 ? '<text x="' + (bx + barW / 2) + '" y="' + (by - 6) + '" text-anchor="middle" class="bar-val-text">' + esc(money(item.omzet)) + '</text>' : '') +
        '<text x="' + (bx + barW / 2) + '" y="' + (h - 22) + '" text-anchor="middle" class="x-label-bold">' + esc(item.label) + '</text>' +
        (item.sub ? '<text x="' + (bx + barW / 2) + '" y="' + (h - 9) + '" text-anchor="middle" class="x-sub-label">' + esc(item.sub) + '</text>' : '') +
        '<title>' + tip + '</title></g>';
    }).join('');

    return '<div class="sb-chart-wrap">' +
      '<svg class="sb-chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
      '<line x1="' + padL + '" y1="' + (h - padB) + '" x2="' + (w - padR) + '" y2="' + (h - padB) + '" class="axis"/>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + (w - padR) + '" y2="' + padT + '" class="grid-line"/>' +
      '<line x1="' + padL + '" y1="' + ((padT + h - padB) / 2) + '" x2="' + (w - padR) + '" y2="' + ((padT + h - padB) / 2) + '" class="grid-line"/>' +
      barsHtml +
      '<text x="8" y="' + (padT + 4) + '" class="ylabel">' + esc(money(max)) + '</text>' +
      '<text x="8" y="' + (h - padB) + '" class="ylabel">Rp 0</text>' +
      '</svg>' +
      '<div class="sb-chart-hint">💡 Klik batang periode untuk mengisolasi dan melihat Top/Worst Performer pada minggu/bulan tersebut</div>' +
      '</div>';
  }

  // Interactive Top & Worst Performer Bar List
  function renderSkuList(items, isWorst, totalQty, totalRev) {
    if (!items.length) {
      return '<div class="sb-empty-list">Belum ada rincian SKU pada slice ini.<br><span style="font-size:11px;color:#7a8982">Upload Detail Transaksi Majoo untuk performa produk harian.</span></div>';
    }
    var metric = STATE.skuMetric;
    var maxVal = Math.max.apply(null, items.map(function (x) { return metric === 'rev' ? x.rev : x.qty; }).concat([1]));
    var grandTotal = metric === 'rev' ? (totalRev || 1) : (totalQty || 1);

    return '<div class="sb-bars">' + items.map(function (x, i) {
      var val = metric === 'rev' ? x.rev : x.qty;
      var valDisplay = metric === 'rev' ? money(val) : (x.qty.toLocaleString('id-ID') + ' pcs');
      var sharePct = ((val / grandTotal) * 100).toFixed(1) + '%';
      var barWidth = Math.max(5, (val / maxVal) * 100);
      var fillClass = isWorst ? 'sb-bar-fill worst' : 'sb-bar-fill';
      var rankClass = isWorst ? 'sb-bar-rank worst' : 'sb-bar-rank';

      return '<div class="sb-bar-row">' +
        '<div class="' + rankClass + '">' + (i + 1) + '</div>' +
        '<div class="sb-bar-label">' +
        '<span title="' + esc(x.name) + '">' + esc(x.name) + '</span>' +
        '<b>' + esc(valDisplay) + ' <small class="sb-share">(' + sharePct + ')</small></b>' +
        '</div>' +
        '<div class="sb-bar-track">' +
        '<div class="' + fillClass + '" style="width:' + barWidth.toFixed(1) + '%"></div>' +
        '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderUploadSection() {
    var hasFiles = STATE.stagedFiles && STATE.stagedFiles.length > 0;
    var pillHtml = '';
    if (hasFiles) {
      var count = STATE.stagedFiles.length;
      var totalBytes = STATE.stagedFiles.reduce(function (sum, f) { return sum + (f.size || 0); }, 0);
      var totalKb = Math.round(totalBytes / 1024);
      var sizeDisp = totalKb >= 1024 ? (totalKb / 1024).toFixed(1) + ' MB' : totalKb + ' KB';

      var titleText = count === 1 ? STATE.stagedFiles[0].name : (count + ' File Dipilih (Multi-Bulan / Periode)');
      var tagText = count === 1 ? (STATE.stagedFileType || 'File Majoo') + ' (' + sizeDisp + ')' : (count + ' file Majoo · Total ' + sizeDisp);

      pillHtml = '<div class="sb-file-pill active" id="sbFilePill">' +
        '<span class="sb-file-icon">' + (count > 1 ? '📚' : '📄') + '</span>' +
        '<div class="sb-file-info">' +
        '<span class="sb-file-name" title="' + esc(titleText) + '">' + esc(titleText) + '</span>' +
        '<span class="sb-file-tag">' + esc(tagText) + '</span>' +
        '</div>' +
        '<button type="button" class="sb-file-del" id="sbBtnCancelFile" title="Batalkan pilihan file">✕</button>' +
        '</div>';
    }

    return '<div class="sb-upload-wrap">' +
      '<input id="sbFileInput" type="file" accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" multiple style="display:none">' +
      '<button type="button" class="sb-btn-upload" id="sbBtnChoose">' +
      '<span>📁</span> Upload Majoo (.xlsx, .xls, .csv)' +
      '</button>' +
      pillHtml +
      '<button type="button" class="sb-btn-submit ' + (hasFiles && !STATE.importing ? 'ready' : '') + '" id="sbBtnSubmit" ' + (!hasFiles || STATE.importing ? 'disabled' : '') + '>' +
      (STATE.importing ? '<span class="sb-spin">⏳</span> ' + esc(STATE.importProgress || 'Memproses…') : '<span>⬆</span> Submit Data') +
      '</button>' +
      '<button type="button" class="sb-btn-format" id="sbBtnFormat" title="Panduan multi-periode & 3 format file Majoo">' +
      'Format & Multi-Periode' +
      '</button>' +
      '</div>';
  }

  function renderFormatHelpModal() {
    if (!STATE.showHelp) return '';
    return '<div class="sb-modal-overlay" id="sbModalOverlay">' +
      '<div class="sb-modal-card">' +
      '<div class="sb-modal-head">' +
      '<h3>Panduan Upload & Multi-Periode Majoo</h3>' +
      '<button type="button" class="sb-modal-close" id="sbModalClose">✕</button>' +
      '</div>' +
      '<div class="sb-modal-body">' +
      '<div class="sb-fmt-box" style="background:#f0fdf4;border-color:#bbf7d0">' +
      '<b>✨ Mendukung Multi-Periode (Januari – Desember):</b>' +
      '<p style="margin:4px 0 0">Anda dapat meng-upload <b>1 file langsung rentang 1 tahun penuh</b>, ATAU memilih <b>sekaligus banyak file bulanan</b> (misal 12 file CSV/Excel Jan–Des dengan menahan tombol Ctrl/Shift). Sistem otomatis membagi dalam batch 50 hari ke Supabase tanpa error/timeout dan langsung menyajikan grafik 12 bulan.</p>' +
      '</div>' +
      '<p style="margin-top:10px">Sistem Hasnaria mendeteksi 3 jenis file export Majoo POS:</p>' +
      '<div class="sb-fmt-box">' +
      '<b>1. Laporan Detail Transaksi (CSV) — Sangat Direkomendasikan ⭐</b>' +
      '<p>Export per nota/struk: tanggal, nomor struk, omzet, metode bayar (Cash, QRIS, Transfer/Gojek), dan <b>rincian produk terjual harian</b>.</p>' +
      '<small>Kolom: No Transaksi, Waktu Order, Produk, Total Penjualan, Metode Pembayaran.</small>' +
      '</div>' +
      '<div class="sb-fmt-box">' +
      '<b>2. Laporan Penjualan per Periode (CSV)</b>' +
      '<p>Ringkasan penjualan harian: tanggal penjualan, omzet harian, jumlah transaksi harian, dan laba kotor.</p>' +
      '<small>Kolom: Periode (Kamis, 01 Jan 2026), Penjualan (Rp.), Total Transaksi.</small>' +
      '</div>' +
      '<div class="sb-fmt-box">' +
      '<b>3. Laporan Penjualan Produk (CSV / Excel)</b>' +
      '<p>Rekapitulasi penjualan per SKU produk, jumlah pcs terjual, omzet produk, dan HPP.</p>' +
      '<small>Kolom: Produk, SKU, Jumlah Terjual, Penjualan (Rp.), Laba Kotor.</small>' +
      '</div>' +
      '<p style="font-size:12px;color:#5d6d66;margin-top:10px">💡 Catatan Database: Upload bulan baru tidak akan menimpa/menghapus bulan yang sudah ada di Supabase. Data tersimpan rapi per tanggal.</p>' +
      '</div>' +
      '<div class="sb-modal-foot">' +
      '<button type="button" class="sb-btn-modal-ok" id="sbModalOk">Mengerti</button>' +
      '</div>' +
      '</div>' +
      '</div>';
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
      '<div class="sb-head">' +
      '<div>' +
      '<div class="sb-eyebrow">SALES INTELLIGENCE</div>' +
      '<h2>Dashboard Penjualan</h2>' +
      '<p>Tren omzet, performa produk terlaris & terendah, serta integrasi export Majoo.</p>' +
      '</div>' +
      renderUploadSection() +
      '</div>';

    if (STATE.error) html += '<div class="sb-error">' + esc(STATE.error) + '</div>';
    if (STATE.msg) html += '<div class="sb-ok">' + esc(STATE.msg) + '</div>';
    if (STATE.importing) {
      html += '<div class="sb-progress-banner" style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px">' +
        '<div class="sb-spin" style="font-size:22px">⏳</div>' +
        '<div style="flex:1">' +
        '<div style="font-weight:700;font-size:14px;color:#166534">' + esc(STATE.importProgress || 'Sedang memproses upload data…') + '</div>' +
        '<div style="font-size:12px;color:#15803d;margin-top:2px">Proses upload sedang berjalan cepat ke database Supabase. Mohon jangan tutup halaman ini.</div>' +
        '</div>' +
        '</div>';
    }

    if (STATE.loading) {
      board.innerHTML = html + '<div class="sb-loading">Memuat data penjualan…</div></div>' + renderFormatHelpModal();
      STATE.draw = false; bind(); return;
    }

    if (!STATE.rows.length) {
      html += '<div class="sb-empty">' +
        '<div class="sb-empty-icon">📊</div>' +
        '<h3>Belum ada data penjualan tersimpan</h3>' +
        '<p>Upload file export Majoo (Detail Transaksi, Laporan Periode, atau Laporan Produk) untuk langsung mengaktifkan dashboard interaktif.</p>' +
        '<div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button type="button" class="sb-btn-upload" id="sbBtnChooseEmpty"><span>📁</span> Pilih File Majoo Sekarang</button>' +
        '<button type="button" class="sb-help" id="sbBtnSeedDemo" style="background:#eef7f3;border-color:#176b55;color:#176b55;font-weight:700">⚡ Muat Data Majoo Jan 2026 (337 Transaksi)</button>' +
        '</div>' +
        '</div></div>' + renderFormatHelpModal();
      board.innerHTML = html; STATE.draw = false; bind(); return;
    }

    ensureView();
    var active = selectedWindow(), prev = previousFor(active);
    var ar = rangeRows(active), pr = rangeRows(prev);
    var slicedRows = getSlicedRows(ar);

    var aStats = statsFor(slicedRows.length ? slicedRows : ar);
    var pStats = statsFor(pr);
    var trendData = groupTrend(ar, STATE.mode);

    // SKUs
    var allSkus = aggregateSku(slicedRows);
    var totalSkuQty = allSkus.reduce(function (s, x) { return s + x.qty; }, 0);
    var totalSkuRev = allSkus.reduce(function (s, x) { return s + x.rev; }, 0);

    var metricKey = STATE.skuMetric === 'rev' ? 'rev' : 'qty';
    var sortedSkus = allSkus.slice().sort(function (x, y) { return y[metricKey] - x[metricKey]; });
    var top5 = sortedSkus.slice(0, 5);
    var worst5 = sortedSkus.slice().filter(function (x) { return (x[metricKey] || 0) > 0; }).reverse().slice(0, 5);

    var mm = dataMinMax();
    var months = monthsInData();
    var monthOpts = '<option value="">Semua</option>' + months.map(function (ym) {
      var IDM = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      var lab = IDM[Number(ym.slice(5, 7))] + ' ' + ym.slice(0, 4);
      return '<option value="' + ym + '"' + (STATE.viewMonth === ym ? ' selected' : '') + '>' + lab + '</option>';
    }).join('');

    var vsLab = STATE.mode === 'monthly' ? 'vs tahun lalu' : 'vs bulan lalu';
    var trendLab = STATE.mode === 'monthly' ? (STATE.viewMonth ? 'Januari–Desember tahun yang sama' : 'Semua bulan dalam data') : (STATE.mode === 'weekly' ? 'Minggu 1–5 di bulan ' + monthOfView() : 'Harian di bulan ' + monthOfView());

    // Filter toolbar
    html += '<div class="sb-period">' +
      '<div class="sb-cal">' +
      '<b>Periode</b>' +
      '<label>Bulan <select id="sbMonth">' + monthOpts + '</select></label>' +
      '<label>Dari <input id="sbFrom" type="date" value="' + esc(STATE.viewFrom) + '" min="' + esc(mm.min) + '" max="' + esc(mm.max) + '"></label>' +
      '<label>Sampai <input id="sbTo" type="date" value="' + esc(STATE.viewTo) + '" min="' + esc(mm.min) + '" max="' + esc(mm.max) + '"></label>' +
      '<span>' + esc(active.start) + ' s/d ' + esc(active.end) + ' · ' + ar.length + ' hari aktif</span>' +
      '</div>' +
      '<div class="sb-toggle">' +
      ['daily', 'weekly', 'monthly'].map(function (m) {
        var t = m === 'daily' ? 'Harian' : m === 'weekly' ? 'Mingguan' : 'Bulanan';
        return '<button type="button" class="' + (STATE.mode === m ? 'on' : '') + '" data-mode="' + m + '">' + t + '</button>';
      }).join('') +
      '</div>' +
      '</div>';

    // Interactive Slice Alert Banner
    if (STATE.slice) {
      var sliceTypeLabel = STATE.slice.type === 'day' ? 'Harian' : (STATE.slice.type === 'week' ? 'Mingguan' : 'Bulanan');
      html += '<div class="sb-slice-alert">' +
        '<div class="sb-slice-info">' +
        '<span class="sb-slice-badge">⚡ Slice Aktif</span>' +
        '<span>Menampilkan data <b>' + sliceTypeLabel + '</b>: <b>' + esc(STATE.slice.label) + '</b> (' + slicedRows.length + ' hari)</span>' +
        '</div>' +
        '<button type="button" class="sb-slice-reset" id="sbResetSlice">✕ Tampilkan Semua ' + (STATE.mode === 'daily' ? 'Hari' : (STATE.mode === 'weekly' ? 'Minggu' : 'Bulan')) + '</button>' +
        '</div>';
    }

    // KPIs
    html += '<div class="sb-kpis">' +
      kpiCard('Omzet Terpilih', money(aStats.omzet), percent(aStats.omzet, pStats.omzet) + ' ' + vsLab, pctClass(aStats.omzet, pStats.omzet)) +
      kpiCard('Jumlah Transaksi', aStats.trx.toLocaleString('id-ID'), percent(aStats.trx, pStats.trx) + ' ' + vsLab, pctClass(aStats.trx, pStats.trx)) +
      kpiCard('ATV / Rata-rata Struk', money(aStats.atv), percent(aStats.atv, pStats.atv) + ' ' + vsLab, pctClass(aStats.atv, pStats.atv)) +
      kpiCard('Produk Terjual (Qty)', totalSkuQty ? (totalSkuQty.toLocaleString('id-ID') + ' pcs') : (aStats.days + ' hari'), totalSkuQty ? (allSkus.length + ' SKU terdaftar') : 'pembanding: ' + pStats.days + ' hari', '') +
      '</div>';

    // Main Grid: Trend Chart on Left, Stack of Top Seller & Worst Performer on Right
    var skuSubLab = STATE.slice ? ('Slice: ' + STATE.slice.label) : (STATE.mode === 'daily' ? 'Bulan terpilih' : (STATE.mode === 'weekly' ? 'Bulan terpilih' : 'Tahun terpilih'));

    html += '<div class="sb-grid-main">' +
      '<section class="sb-card sb-trend">' +
      '<div class="sb-card-head">' +
      '<div>' +
      '<h3>Tren Omzet ' + (STATE.mode === 'daily' ? 'Harian' : (STATE.mode === 'weekly' ? 'Mingguan' : 'Bulanan')) + '</h3>' +
      '<span>' + esc(trendLab) + '</span>' +
      '</div>' +
      '</div>' +
      renderChart(trendData) +
      '</section>' +
      '<div class="sales-right-stack">' +
      // Top 5 Seller Card
      '<section class="sb-card sb-top-seller">' +
      '<div class="sb-card-head">' +
      '<div>' +
      '<h3>Top 5 Seller</h3>' +
      '<span>' + esc(skuSubLab) + '</span>' +
      '</div>' +
      '<div class="sb-sku-metric-toggle">' +
      '<button type="button" class="' + (STATE.skuMetric === 'qty' ? 'on' : '') + '" data-sku-metric="qty">Qty</button>' +
      '<button type="button" class="' + (STATE.skuMetric === 'rev' ? 'on' : '') + '" data-sku-metric="rev">Omzet</button>' +
      '</div>' +
      '</div>' +
      renderSkuList(top5, false, totalSkuQty, totalSkuRev) +
      '</section>' +
      // 5 Worst Performer Card
      '<section class="sb-card sb-worst-seller">' +
      '<div class="sb-card-head">' +
      '<div>' +
      '<h3>5 Worst Performer (Slow Moving)</h3>' +
      '<span>' + esc(skuSubLab) + '</span>' +
      '</div>' +
      '</div>' +
      renderSkuList(worst5, true, totalSkuQty, totalSkuRev) +
      '</section>' +
      '</div>' +
      '</div>';

    html += '</div>' + renderFormatHelpModal();
    board.innerHTML = html;
    STATE.draw = false;
    bind();
  }

  function bind() {
    var host = document.getElementById('sales'); if (!host) return;

    // Mode switches
    host.querySelectorAll('[data-mode]').forEach(function (b) {
      b.onclick = function () {
        STATE.mode = b.getAttribute('data-mode');
        applyModeWindow();
        draw();
      };
    });

    // SKU Metric toggle (Qty vs Omzet)
    host.querySelectorAll('[data-sku-metric]').forEach(function (b) {
      b.onclick = function () {
        STATE.skuMetric = b.getAttribute('data-sku-metric');
        draw();
      };
    });

    // Reset slice button
    var resetBtn = host.querySelector('#sbResetSlice');
    if (resetBtn) {
      resetBtn.onclick = function () {
        STATE.slice = null;
        draw();
      };
    }

    // Chart slice triggers (dots on daily, bars on weekly/monthly)
    host.querySelectorAll('[data-slice-type]').forEach(function (el) {
      el.onclick = function () {
        var t = el.getAttribute('data-slice-type');
        var id = el.getAttribute('data-slice-id');
        var lab = el.getAttribute('data-slice-label');
        if (STATE.slice && STATE.slice.type === t && STATE.slice.id === id) {
          STATE.slice = null; // toggle off if already selected
        } else {
          STATE.slice = { type: t, id: id, label: lab };
        }
        draw();
      };
    });

    // Format Help Modal
    var btnFormat = host.querySelector('#sbBtnFormat');
    if (btnFormat) btnFormat.onclick = function () { STATE.showHelp = true; draw(); };
    var modalClose = host.querySelector('#sbModalClose');
    if (modalClose) modalClose.onclick = function () { STATE.showHelp = false; draw(); };
    var modalOk = host.querySelector('#sbModalOk');
    if (modalOk) modalOk.onclick = function () { STATE.showHelp = false; draw(); };
    var modalOverlay = host.querySelector('#sbModalOverlay');
    if (modalOverlay) {
      modalOverlay.onclick = function (e) {
        if (e.target === modalOverlay) { STATE.showHelp = false; draw(); }
      };
    }

    // File selection & staging
    var fileInput = host.querySelector('#sbFileInput');
    var btnChoose = host.querySelector('#sbBtnChoose') || host.querySelector('#sbBtnChooseEmpty');
    if (btnChoose && fileInput) {
      btnChoose.onclick = function () { fileInput.click(); };
    }

    if (fileInput) {
      fileInput.onchange = async function () {
        if (fileInput.files && fileInput.files.length) {
          var flist = Array.prototype.slice.call(fileInput.files);
          STATE.stagedFiles = flist;
          STATE.error = '';
          STATE.msg = '';
          if (flist.length === 1) {
            try {
              var rawPreview = await previewFileType(flist[0]);
              STATE.stagedFileType = rawPreview.label;
              STATE.stagedFileRows = rawPreview.count;
            } catch (e) {
              STATE.stagedFileType = 'File Majoo (' + flist[0].name.split('.').pop().toUpperCase() + ')';
            }
          } else {
            STATE.stagedFileType = flist.length + ' File Majoo';
            STATE.stagedFileRows = 0;
          }
          draw();
        }
      };
    }

    var btnCancelFile = host.querySelector('#sbBtnCancelFile');
    if (btnCancelFile) {
      btnCancelFile.onclick = function () {
        STATE.stagedFiles = [];
        STATE.stagedFileType = '';
        if (fileInput) fileInput.value = '';
        draw();
      };
    }

    // Submit button
    var btnSubmit = host.querySelector('#sbBtnSubmit');
    if (btnSubmit) {
      btnSubmit.onclick = function () {
        if (STATE.stagedFiles && STATE.stagedFiles.length && !STATE.importing) {
          importFiles(STATE.stagedFiles);
        }
      };
    }

    // Demo Data Seeder (quick load of Jan 2026 data if empty)
    var btnSeedDemo = host.querySelector('#sbBtnSeedDemo');
    if (btnSeedDemo) {
      btnSeedDemo.onclick = function () {
        seedJanuary2026();
      };
    }

    // Date filters
    var monthEl = host.querySelector('#sbMonth'), fromEl = host.querySelector('#sbFrom'), toEl = host.querySelector('#sbTo');
    if (monthEl) {
      monthEl.onchange = function () {
        var ym = monthEl.value;
        STATE.viewMonth = ym;
        STATE.slice = null;
        if (!ym) {
          var mm = dataMinMax();
          STATE.viewFrom = mm.min; STATE.viewTo = mm.max;
        } else {
          applyModeWindow();
        }
        draw();
      };
    }

    function applyDates() {
      if (!fromEl || !toEl) return;
      var a = fromEl.value, b = toEl.value;
      if (!a || !b) return;
      STATE.viewFrom = a <= b ? a : b;
      STATE.viewTo = a <= b ? b : a;
      STATE.viewMonth = (STATE.viewFrom.slice(0, 7) === STATE.viewTo.slice(0, 7)) ? STATE.viewFrom.slice(0, 7) : '';
      STATE.slice = null;
      draw();
    }
    if (fromEl) fromEl.onchange = applyDates;
    if (toEl) toEl.onchange = applyDates;
  }

  function addScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  async function ensureXLSX() {
    if (window.XLSX) return;
    await addScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  }

  function parseTextLines(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (x) { return x.trim(); });
    if (!lines.length) return [];
    var sample = lines.slice(0, 15).join('\n');
    var delim = (sample.match(/;/g) || []).length >= (sample.match(/,/g) || []).length ? ';' : ',';
    if ((sample.match(/\t/g) || []).length > (sample.match(/;/g) || []).length) delim = '\t';
    function split(line) {
      if (line.indexOf('"') === -1) return line.split(delim);
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') {
          if (q && line[i + 1] === '"') { cur += '"'; i++; }
          else q = !q;
        } else if (c === delim && !q) {
          out.push(cur); cur = '';
        } else cur += c;
      }
      out.push(cur);
      return out;
    }
    return lines.map(split);
  }

  async function readFileMatrix(file) {
    var ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'xlsx' || ext === 'xls') {
      await ensureXLSX();
      var buf = await file.arrayBuffer();
      var wb = XLSX.read(buf, { type: 'array', cellDates: true });
      var sh = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    }
    return parseTextLines(await file.text());
  }

  function detectMajooType(matrix) {
    for (var i = 0; i < Math.min(25, matrix.length); i++) {
      var row = (matrix[i] || []).map(normHeader);
      // Format 1: Detail Transaksi
      if (row.some(function (c) { return c.includes('no transaksi'); }) && row.some(function (c) { return c.includes('produk') || c.includes('penjualan') || c.includes('waktu'); })) {
        return { type: 'transactions', headerRow: i, label: 'Detail Transaksi Majoo' };
      }
      // Format 2: Laporan Penjualan Produk
      if (row.some(function (c) { return c === 'produk'; }) && row.some(function (c) { return c === 'sku'; }) && row.some(function (c) { return c.includes('jumlah'); })) {
        return { type: 'products', headerRow: i, label: 'Laporan Penjualan Produk Majoo' };
      }
      // Format 3: Laporan Penjualan per Periode
      if (row.some(function (c) { return c.includes('periode'); }) && row.some(function (c) { return c.includes('penjualan'); }) && row.some(function (c) { return c.includes('transaksi') || c.includes('produk'); })) {
        return { type: 'daily_period', headerRow: i, label: 'Laporan Penjualan per Periode Majoo' };
      }
    }
    return { type: 'generic', headerRow: 0, label: 'File Majoo Standard' };
  }

  async function previewFileType(file) {
    var ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'xlsx' || ext === 'xls') {
      var matrix = await readFileMatrix(file);
      var det = detectMajooType(matrix);
      return { label: det.label, count: matrix.length - det.headerRow - 1 };
    }
    // Instant preview by inspecting first 32KB without parsing entire file twice
    var slice = file.slice(0, 32768);
    var text = await slice.text();
    var sampleMatrix = parseTextLines(text);
    var det2 = detectMajooType(sampleMatrix);
    return { label: det2.label, count: 0 };
  }

  function normalizeImport(matrix) {
    if (!matrix || !matrix.length) throw new Error('File kosong atau tidak terbaca.');
    var det = detectMajooType(matrix);
    var hi = det.headerRow;
    var heads = (matrix[hi] || []).map(function (x, i) { var h = String(x == null ? '' : x).trim(); return h || ('col' + i); });
    var rows = [];

    for (var r = hi + 1; r < matrix.length; r++) {
      var vals = matrix[r] || [];
      var joined = vals.map(function (x) { return String(x == null ? '' : x).trim(); }).join(' ').toLowerCase();
      if (!joined || joined.indexOf('powered by') >= 0) continue;
      var o = {};
      heads.forEach(function (h, idx) { o[h] = vals[idx] == null ? '' : vals[idx]; });
      rows.push(o);
    }
    if (!rows.length) throw new Error('Tidak ada baris data setelah header ' + det.label);

    var keys = Object.keys(rows[0]);

    // TYPE 1: DETAIL TRANSAKSI
    if (det.type === 'transactions') {
      var kDate = findKey(keys, [/waktu order/, /waktu bayar/, /tanggal/, /date/, /periode/]);
      var kTotal = findKey(keys, [/total penjualan/, /penjualan bersih/, /penjualan rp/, /omzet/, /omset/, /^penjualan$/]);
      var kProd = findKey(keys, [/^produk$/, /nama produk/, /item/, /sku/]);
      var kPay = findKey(keys, [/metode pembayaran/, /metode bayar/, /pembayaran/, /payment/]);
      var kTrx = findKey(keys, [/no transaksi/, /order id/, /struk/]);

      var groups = {};
      rows.forEach(function (row, idx) {
        var d = parseDate(kDate ? row[kDate] : null);
        if (!d) return;
        var g = groups[d] || (groups[d] = { date: d, omzet: 0, trxSet: new Set(), cash: 0, qris: 0, tf: 0, skus: {} });
        var tot = revenue(kTotal ? row[kTotal] : null) || 0;
        g.omzet += tot;
        var tid = (kTrx && row[kTrx] ? String(row[kTrx]).trim() : '') || ('r' + idx);
        g.trxSet.add(tid);

        var pay = (kPay && row[kPay] ? String(row[kPay]).toLowerCase() : '');
        if (pay.includes('cash') || pay.includes('tunai')) g.cash += tot;
        else if (pay.includes('qris')) g.qris += tot;
        else g.tf += tot;

        var prodStr = kProd ? String(row[kProd] || '') : '';
        if (prodStr) {
          prodStr.split(',').forEach(function (p) {
            var pName = p.trim();
            if (pName) g.skus[pName] = (g.skus[pName] || 0) + 1;
          });
        }
      });

      return Object.keys(groups).sort().map(function (d) {
        var g = groups[d];
        return {
          date: d,
          omzet: Math.round(g.omzet),
          trx: g.trxSet.size,
          cash: Math.round(g.cash),
          qris: Math.round(g.qris),
          tf: Math.round(g.tf),
          skus: Object.keys(g.skus).map(function (k) {
            var qty = g.skus[k];
            var up = PRICE_MAP[k.toUpperCase()] || 0;
            return { name: k, qty: qty, rev: qty * up };
          }).sort(function (a, b) { return b.qty - a.qty; })
        };
      });
    }

    // TYPE 2: LAPORAN PENJUALAN PRODUK
    if (det.type === 'products') {
      var kProdName = findKey(keys, [/^produk$/, /nama produk/, /item/]);
      var kQty = findKey(keys, [/jumlah terjual/, /qty/, /quantity/, /terjual/]);
      var kRev = findKey(keys, [/penjualan rp/, /penjualan/, /total penjualan/, /omzet/]);

      // Extract date range from top metadata lines
      var rangeStart = '', rangeEnd = '';
      for (var mi = 0; mi < hi; mi++) {
        var metaLine = (matrix[mi] || []).join(' ');
        var mRange = metaLine.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
        if (mRange) {
          rangeStart = parseDate(mRange[1]); rangeEnd = parseDate(mRange[2]);
          break;
        }
      }
      if (!rangeStart) rangeStart = new Date().toISOString().slice(0, 10);
      if (!rangeEnd) rangeEnd = rangeStart;

      var parsedSkus = [];
      rows.forEach(function (row) {
        var p = kProdName ? String(row[kProdName] || '').trim() : '';
        var q = num(kQty ? row[kQty] : null);
        var r = num(kRev ? row[kRev] : null) || 0;
        if (p && q != null && q > 0) {
          parsedSkus.push({ name: p, qty: Math.round(q), rev: Math.round(r) });
        }
      });

      // Distribute SKU proportionally onto the dates of this range
      var outList = [];
      var curDate = rangeStart;
      while (curDate <= rangeEnd) {
        outList.push({ date: curDate, omzet: 0, trx: 0, cash: 0, qris: 0, tf: 0, skus: [] });
        curDate = addDays(curDate, 1);
      }
      // Put the products on the month
      if (outList.length === 1) {
        outList[0].skus = parsedSkus;
      } else {
        // Distribute or attach to days
        var nDays = outList.length;
        parsedSkus.forEach(function (item) {
          var perDay = item.qty / nDays;
          outList.forEach(function (dRow) {
            dRow.skus.push({ name: item.name, qty: Math.max(0.01, perDay), rev: item.rev / nDays });
          });
        });
      }
      return outList;
    }

    // TYPE 3 & GENERIC: LAPORAN PENJUALAN PER PERIODE
    var kDate3 = findKey(keys, [/^(periode|tanggal|tgl|date|hari)$/, /tanggal/, /periode/]);
    var kTotal3 = findKey(keys, [/penjualan rp/, /total penjualan/, /penjualan bersih/, /omzet/, /omset/, /^penjualan$/]);
    var kTrx3 = findKey(keys, [/total transaksi/, /jumlah transaksi/, /transaksi/, /struk/]);
    var groups3 = {};

    rows.forEach(function (row) {
      var d = parseDate(kDate3 ? row[kDate3] : null);
      if (!d) return;
      var g = groups3[d] || (groups3[d] = { date: d, omzet: 0, trx: 0, cash: 0, qris: 0, tf: 0, skus: [] });
      var rev = revenue(kTotal3 ? row[kTotal3] : null);
      if (rev != null) g.omzet += rev;
      var tx = num(kTrx3 ? row[kTrx3] : null);
      if (tx != null) g.trx = Math.max(g.trx, tx);
    });

    return Object.keys(groups3).sort().map(function (d) {
      var g = groups3[d];
      return {
        date: d,
        omzet: Math.round(g.omzet),
        trx: g.trx,
        cash: 0, qris: 0, tf: 0, skus: []
      };
    });
  }

  async function importFiles(fileOrFiles) {
    var files = Array.isArray(fileOrFiles) ? fileOrFiles : (fileOrFiles ? [fileOrFiles] : []);
    if (!files.length) return;

    STATE.importing = true;
    STATE.error = '';
    STATE.msg = '';
    STATE.importProgress = 'Membaca ' + files.length + ' file…';
    draw();

    try {
      var allDataByDate = {}; // date -> { date, omzet, trx, cash, qris, tf, skusMap: {} }
      var totalParsed = 0;

      for (var fi = 0; fi < files.length; fi++) {
        var file = files[fi];
        STATE.importProgress = 'Membaca file ' + (fi + 1) + '/' + files.length + ' (' + file.name + ')…';
        draw();

        var matrix = await readFileMatrix(file);
        var fileRows = normalizeImport(matrix);
        totalParsed += fileRows.length;

        fileRows.forEach(function (r) {
          var d = r.date;
          if (!d) return;
          var cur = allDataByDate[d];
          if (!cur) {
            allDataByDate[d] = {
              date: d,
              omzet: r.omzet || 0,
              trx: r.trx || 0,
              cash: r.cash || 0,
              qris: r.qris || 0,
              tf: r.tf || 0,
              skusMap: {}
            };
            (r.skus || []).forEach(function (s) {
              allDataByDate[d].skusMap[s.name] = { name: s.name, qty: s.qty, rev: s.rev };
            });
          } else {
            // Overlapping date: merge smartly
            if (r.omzet > 0) cur.omzet = Math.max(cur.omzet, r.omzet);
            if (r.trx > 0) cur.trx = Math.max(cur.trx, r.trx);
            if (r.cash > 0 || r.qris > 0 || r.tf > 0) {
              cur.cash = Math.max(cur.cash, r.cash || 0);
              cur.qris = Math.max(cur.qris, r.qris || 0);
              cur.tf = Math.max(cur.tf, r.tf || 0);
            }
            (r.skus || []).forEach(function (s) {
              var prevSku = cur.skusMap[s.name];
              if (prevSku) {
                prevSku.qty = Math.max(prevSku.qty, s.qty);
                prevSku.rev = Math.max(prevSku.rev, s.rev);
              } else {
                cur.skusMap[s.name] = { name: s.name, qty: s.qty, rev: s.rev };
              }
            });
          }
        });
      }

      var sortedDates = Object.keys(allDataByDate).sort();
      if (!sortedDates.length) throw new Error('Tidak ada data valid setelah membaca ' + files.length + ' file. Periksa format file.');

      var minDate = sortedDates[0];
      var maxDate = sortedDates[sortedDates.length - 1];

      // Fetch existing records safely using date range (prevents HTTP 414 URI Too Long for 365 days)
      STATE.importProgress = 'Mengecek data lama di Supabase…';
      draw();

      var oldMap = {};
      try {
        var old = await api('daily_metrics?brand_id=eq.' + encodeURIComponent(BRAND) + '&metric_date=gte.' + minDate + '&metric_date=lte.' + maxDate + '&limit=5000&select=id,metric_date,cash_revenue,transactions,notes');
        (old || []).forEach(function (r) { oldMap[r.metric_date] = r; });
      } catch (eOld) {
        console.warn('Could not fetch old metrics for date range', eOld);
      }

      var payload = sortedDates.map(function (d) {
        var x = allDataByDate[d];
        var oldRec = oldMap[d];
        var notesOld = oldRec ? (oldRec.notes || '') : '';
        var payAvailable = x.cash || x.qris || x.tf;

        var skusList = Object.keys(x.skusMap).map(function (k) { return x.skusMap[k]; }).sort(function (a, b) { return b.qty - a.qty; });
        var newSkus = skusList.length ? skusList : parseSku(notesOld);
        var notes = preservePayAndSku(notesOld, newSkus, payAvailable ? { cash: x.cash, qris: x.qris, tf: x.tf } : null);

        var finalOmzet = x.omzet > 0 ? x.omzet : (oldRec ? oldRec.cash_revenue : 0);
        var finalTrx = x.trx > 0 ? x.trx : (oldRec ? oldRec.transactions : 0);

        return {
          brand_id: BRAND,
          metric_date: d,
          cash_revenue: Math.round(finalOmzet),
          transactions: Math.round(finalTrx),
          notes: notes
        };
      });

      // Upsert in batches of 100 for high throughput
      var BATCH_SIZE = 100;
      for (var bi = 0; bi < payload.length; bi += BATCH_SIZE) {
        var chunk = payload.slice(bi, bi + BATCH_SIZE);
        var processed = Math.min(payload.length, bi + chunk.length);
        var percent = Math.round((processed / payload.length) * 100);
        STATE.importProgress = 'Menyimpan ' + processed + ' / ' + payload.length + ' hari (' + percent + '%)…';
        draw();

        try {
          await api('daily_metrics?on_conflict=brand_id,metric_date', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(chunk)
          });
        } catch (chunkErr) {
          // Ultra-fast parallel fallback if unique constraint is not yet present:
          var toInsert = [];
          var toUpdate = [];
          for (var ci = 0; ci < chunk.length; ci++) {
            var prow = chunk[ci];
            var exist = oldMap[prow.metric_date];
            if (exist && exist.id) {
              toUpdate.push({ id: exist.id, row: prow });
            } else {
              toInsert.push(prow);
            }
          }
          // 1. Bulk insert all new dates in 1 single HTTP POST
          if (toInsert.length) {
            await api('daily_metrics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify(toInsert)
            });
          }
          // 2. Parallel updates in batches of 15 (takes ~300ms instead of 60s)
          for (var ui = 0; ui < toUpdate.length; ui += 15) {
            var subBatch = toUpdate.slice(ui, ui + 15);
            await Promise.all(subBatch.map(function (item) {
              return api('daily_metrics?id=eq.' + item.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify(item.row)
              });
            }));
          }
        }
      }

      STATE.stagedFiles = [];
      STATE.stagedFileType = '';
      STATE.importing = false;
      STATE.importProgress = '';
      STATE.msg = '✓ Berhasil update ' + payload.length + ' tanggal (' + minDate + ' s/d ' + maxDate + ') dari ' + files.length + ' file Majoo!';

      // Adjust date filter: if multi-month, switch to monthly view for 12-month overview
      STATE.viewFrom = minDate;
      STATE.viewTo = maxDate;
      if (minDate.slice(0, 7) === maxDate.slice(0, 7)) {
        STATE.viewMonth = minDate.slice(0, 7);
      } else {
        STATE.viewMonth = '';
        STATE.mode = 'monthly';
      }
      STATE.slice = null;
      await loadMetrics();
    } catch (e) {
      STATE.importing = false;
      STATE.importProgress = '';
      STATE.error = 'Gagal upload: ' + e.message;
      STATE.msg = '';
      draw();
    }
  }

  function importFile(f) { return importFiles(f); }

  // Pre-seed 337 transactions of Jan 2026 if user clicks quick load
  async function seedJanuary2026() {
    STATE.loading = true;
    STATE.msg = 'Mengimpor 337 transaksi Majoo Januari 2026…';
    STATE.error = '';
    draw();

    // The complete monthly breakdown for January 2026 from user's Majoo data
    var rawPeriodData = [
      { d: '2026-01-01', rev: 209000, tx: 13, skus: 'KUAH ODENG=2|ODENG=3|SOSIS AYAM=2|DUMPLING AYAM=2|CHIKUWA=5|SALMON STICK=2|Banana split=1|SIOMAY=2|Mie sedap=1|Topokki=3|ODENG TIPIS=2|BAKSO UDANG=1|DUMPLING CHEESE=4|SCALLOP=5|BAKSO IKAN=6|BAKSO AYAM=3|CRAB STICK=5|FISHROLL=5|KUAH TOMYAM=1|SHRIMP TAIL=5|MIE KUNING=1', cash: 147000, qris: 46500, tf: 15500 },
      { d: '2026-01-02', rev: 170000, tx: 10, skus: 'RABOKKI=2|SOSIS AYAM=2|BAKSO IKAN=2|FISHROLL=2|CHIKUWA=2|KUAH TOMYAM=2|DUMPLING AYAM=2|NASI AYAM KATSU=2|Mie sedap=2|SIOMAY=2|Topokki=4|ODENG TIPIS=3|ICE LEMON TEA=1|BAKSO UDANG=1|KUAH ODENG=1|SCALLOP=1', cash: 97000, qris: 50000, tf: 23000 },
      { d: '2026-01-03', rev: 278000, tx: 14, skus: 'CHOCOLATE=1|BLACK COFFE=1|VANILLA LATTE=1|Topokki=6|Es Krim Potong Cokelat=1|RABOKKI=4|KUAH TOMYAM=1|BAKSO AYAM=2|SCALLOP=2|BAKSO IKAN=1|SHRIMP TAIL=1|MIE KUNING=1|Kentang Goreng=2|CHIKUWA=3|DUMPLING AYAM=3|KUAH ODENG=3|ODENG=2|SALMON STICK=2|SOSIS AYAM=2|SIOMAY=1|ODENG TIPIS=3|FISHROLL=1|BAKSO UDANG=1|ICE LYCHEE TEA=1|NASI AYAM KATSU=1|COFFE LATTE=1|JASMINE TEA=1', cash: 159000, qris: 30000, tf: 89000 },
      { d: '2026-01-04', rev: 272000, tx: 14, skus: 'KUAH ODENG=2|ODENG=2|SOSIS AYAM=2|DUMPLING AYAM=2|CHIKUWA=2|SALMON STICK=2|Choco Pandan=1|Es krim Turkiy=1|ICE CREAM BOWL=2|Topokki=4|NASI AYAM KATSU=1|Mie Pedas=4|SIOMAY=4|MINI NORI=1|KUAH TOMYAM=3|FISHROLL=3|SHRIMP TAIL=3|DUMPLING CHEESE=4|CRAB STICK=3|SCALLOP=4|FISH TOFU=3|BAKSO IKAN=3|ODENG TIPIS=2|RABOKKI=1|AIR MINERAL BESAR=1|BAKSO UDANG=1', cash: 221000, qris: 26000, tf: 25000 },
      { d: '2026-01-05', rev: 60000, tx: 4, skus: 'KUAH TOMYAM=1|SHRIMP TAIL=1|FISH TOFU=1|SCALLOP=1|BAKSO IKAN=1|MIE KUNING=1|Mie Pedas=1|DUMPLING CHEESE=1|SIOMAY=1|Es krim Turkiy=1|ICE CREAM BOWL=2|POP MIE=1', cash: 60000, qris: 0, tf: 0 },
      { d: '2026-01-06', rev: 284000, tx: 15, skus: 'KUAH ODENG=4|ODENG TIPIS=1|DUMPLING CHEESE=5|CHIKUWA=3|SCALLOP=4|BAKSO UDANG=1|RABOKKI=2|Es Krim Potong Durian=1|Choco Pandan=1|MINI NORI=1|Topokki=6|ODENG=4|DUMPLING AYAM=2|SALMON STICK=2|SOSIS AYAM=3|BAKSO IKAN=4|CRAB STICK=3|FISH TOFU=4|FISHROLL=3|KUAH TOMYAM=3|SHRIMP TAIL=4|ICE LYCHEE TEA=1|MIE KUNING=1|JASMINE TEA=1', cash: 209000, qris: 50000, tf: 25000 },
      { d: '2026-01-07', rev: 193000, tx: 14, skus: 'SHRIMP TAIL=1|FISH TOFU=1|SCALLOP=2|BAKSO IKAN=1|MIE KUNING=1|KUAH TOMYAM=1|Es krim Turkiy=1|ICE CREAM BOWL=2|ROTI BAKAR KEJU SUSU=1|Kentang Goreng=1|BLACK COFFE=1|KUAH ODENG=2|ODENG TIPIS=4|DUMPLING CHEESE=2|CHIKUWA=2|BAKSO UDANG=1|ODENG=2|SOSIS AYAM=1|DUMPLING AYAM=1|SALMON STICK=1|Topokki=6|NASI AYAM KATSU=1|Choco Pandan=1|RABOKKI=1', cash: 129000, qris: 10000, tf: 54000 },
      { d: '2026-01-08', rev: 187000, tx: 8, skus: 'KUAH TOMYAM=2|SHRIMP TAIL=3|FISH TOFU=2|BAKSO IKAN=3|SCALLOP=2|MIE KUNING=2|RABOKKI=1|Topokki=3|ODENG TIPIS=1|Es Krim Potong Neopolitan=1|ODENG=1|KUAH ODENG=1|CRAB STICK=1|FISHROLL=1|ICE LYCHEE TEA=1', cash: 119000, qris: 15000, tf: 53000 },
      { d: '2026-01-09', rev: 155000, tx: 9, skus: 'SHRIMP TAIL=3|FISH TOFU=2|SCALLOP=3|BAKSO UDANG=1|MIE KUNING=2|KUAH TOMYAM=2|Topokki=3|KUAH ODENG=1|ODENG=2|SOSIS AYAM=2|DUMPLING AYAM=1|CHIKUWA=1|SALMON STICK=1|ICE CREAM BOWL=1|FISHROLL=1|DUMPLING CHEESE=1|CRAB STICK=1|BAKSO IKAN=2|SIOMAY=2|Mie Pedas=2|ODENG TIPIS=2|JASMINE TEA=1|MINI NORI=1', cash: 121000, qris: 0, tf: 34000 },
      { d: '2026-01-10', rev: 192000, tx: 11, skus: 'RABOKKI=2|BAKSO IKAN=3|CRAB STICK=2|DUMPLING CHEESE=3|FISH TOFU=3|FISHROLL=2|SCALLOP=3|SHRIMP TAIL=3|KUAH TOMYAM=3|Es krim Turkiy=2|Topokki=3|MIE KUNING=1|BAKSO UDANG=1|CHIKUWA=1|ODENG TIPIS=2|KUAH ODENG=1|SIOMAY=1|Mie Pedas=1|JASMINE TEA=1|ICE LEMON TEA=1|Kentang Goreng=1|ROTI BAKAR KEJU SUSU=1|POP MIE=1|NASI AYAM KATSU=1', cash: 135000, qris: 15000, tf: 42000 },
      { d: '2026-01-11', rev: 500000, tx: 16, skus: 'JASMINE TEA=2|ICE LEMON TEA=1|ICE LYCHEE TEA=1|CAPPUCINO=1|NASI AYAM KATSU=1|Mie Pedas=1|SIOMAY=1|MILO=1|HAZELNUT CHOCO LATTE=1|Topokki=2|MINI NORI=2|Es krim Turkiy=1|ICE CREAM BOWL=4|KUAH ODENG=2|ODENG TIPIS=1|DUMPLING CHEESE=2|SCALLOP=2|CHIKUWA=2|BAKSO UDANG=2|RABOKKI=3|ODENG=3|Es Krim Potong Durian=1|Es Krim Potong Cokelat=1|BAKSO IKAN=1|KUAH TOMYAM=1|FISH TOFU=1|SHRIMP TAIL=1|MIE KUNING=1|DUMPLING AYAM=1|SOSIS AYAM=1|SALMON STICK=1', cash: 406000, qris: 94000, tf: 0 },
      { d: '2026-01-12', rev: 182000, tx: 14, skus: 'Mie Pedas=1|SIOMAY=1|DUMPLING CHEESE=4|NASI AYAM KATSU=1|Es Krim Potong Neopolitan=1|BAKSO UDANG=1|CHIKUWA=3|KUAH ODENG=3|ODENG TIPIS=2|SCALLOP=4|SOSIS AYAM=1|SALMON STICK=1|ODENG=2|DUMPLING AYAM=2|Topokki=3|Es krim Turkiy=1|RABOKKI=1|BAKSO IKAN=3|CRAB STICK=3|FISH TOFU=3|FISHROLL=3|KUAH TOMYAM=3|SHRIMP TAIL=3|MINI NORI=1', cash: 118000, qris: 64000, tf: 0 },
      { d: '2026-01-13', rev: 196000, tx: 12, skus: 'ROTI BAKAR KEJU SUSU=1|COFFE LATTE=1|KUAH ODENG=2|ODENG TIPIS=4|SCALLOP=3|DUMPLING CHEESE=4|CHIKUWA=2|BAKSO UDANG=2|Es krim Turkiy=1|Topokki=4|SIOMAY=3|Mie Pedas=3|BAKSO IKAN=2|CRAB STICK=2|FISH TOFU=2|FISHROLL=2|SHRIMP TAIL=2|KUAH TOMYAM=1|RABOKKI=1|MINI NORI=1|ICE CREAM BOWL=1', cash: 196000, qris: 0, tf: 0 },
      { d: '2026-01-14', rev: 77000, tx: 4, skus: 'Topokki=2|ODENG TIPIS=1|RABOKKI=2|AIR MINERAL BESAR=1|ODENG=1|JASMINE TEA=1', cash: 28000, qris: 0, tf: 49000 },
      { d: '2026-01-15', rev: 188000, tx: 11, skus: 'Topokki=1|ODENG=5|MINI NORI=2|KUAH ODENG=4|ODENG TIPIS=2|SCALLOP=2|DUMPLING CHEESE=3|CHIKUWA=4|BAKSO UDANG=2|Mie Pedas=1|SIOMAY=1|RABOKKI=2|ICE CREAM BOWL=1|SOSIS AYAM=3|DUMPLING AYAM=3|SALMON STICK=3|CAPPUCINO=1|JASMINE TEA=1|BAKSO IKAN=1|SHRIMP TAIL=1|MIE KUNING=1|FISH TOFU=1', cash: 160000, qris: 28000, tf: 0 },
      { d: '2026-01-16', rev: 247000, tx: 14, skus: 'ICE CREAM BOWL=1|KUAH ODENG=2|ODENG=3|DUMPLING CHEESE=3|Snack 3000=1|AIR MINERAL BESAR=1|Topokki=3|ODENG TIPIS=3|RABOKKI=3|CHIKUWA=1|DUMPLING AYAM=1|SALMON STICK=1|SOSIS AYAM=1|ICE LEMON TEA=1|JASMINE TEA=1|Mie Pedas=1|SIOMAY=1|BAKSO IKAN=4|CRAB STICK=2|FISHROLL=2|FISH TOFU=4|KUAH TOMYAM=4|SCALLOP=4|SHRIMP TAIL=4|MIE KUNING=2|Es Krim Turkiy Mix rasa=1|Choco Pandan=1', cash: 235000, qris: 12000, tf: 0 },
      { d: '2026-01-17', rev: 184000, tx: 15, skus: 'KUAH ODENG=4|ODENG=4|SOSIS AYAM=3|CHIKUWA=5|DUMPLING AYAM=3|SALMON STICK=3|Es Krim Potong Cokelat=2|KUAH TOMYAM=1|SHRIMP TAIL=2|BAKSO IKAN=2|FISH TOFU=1|SCALLOP=3|MIE KUNING=2|Mie Pedas=2|SIOMAY=3|Es krim Turkiy=1|Topokki=2|ODENG TIPIS=3|DUMPLING CHEESE=3|CRAB STICK=2|FISHROLL=3|Snack 3000=1|NASI AYAM KATSU=1|BAKSO UDANG=1', cash: 125500, qris: 18000, tf: 40500 },
      { d: '2026-01-18', rev: 152000, tx: 7, skus: 'MIX PLATER=1|ROTI BAKAR COKELAT KEJU=1|AIR MINERAL BESAR=1|Topokki=5|ODENG TIPIS=4|NASI AYAM KATSU=2|MATCHA LATTE=3', cash: 128000, qris: 24000, tf: 0 },
      { d: '2026-01-19', rev: 78000, tx: 6, skus: 'Es krim Turkiy=2|Topokki=2|ODENG TIPIS=2|Snack 3000=1|RABOKKI=1|SOSIS AYAM=1|POP MIE=1|BAKSO UDANG=1|CHIKUWA=1|DUMPLING CHEESE=1|SCALLOP=1|KUAH ODENG=1', cash: 66000, qris: 12000, tf: 0 },
      { d: '2026-01-20', rev: 112000, tx: 8, skus: 'Topokki=3|ODENG TIPIS=2|Es krim Turkiy=1|RABOKKI=3|SIOMAY=1|Mie Pedas=1|CHIKUWA=1|DUMPLING AYAM=1|KUAH ODENG=1|ODENG=2|SALMON STICK=1|SOSIS AYAM=1', cash: 97000, qris: 15000, tf: 0 },
      { d: '2026-01-21', rev: 150000, tx: 9, skus: 'Topokki=7|ODENG TIPIS=4|DUMPLING CHEESE=1|ODENG=1|SHRIMP TAIL=1|FISHROLL=1|CRAB STICK=1|Snack 3000=1|JASMINE TEA=1|RABOKKI=2', cash: 108000, qris: 0, tf: 42000 },
      { d: '2026-01-22', rev: 132000, tx: 7, skus: 'MOCCACINO=1|ICE LEMON TEA=1|Es Krim Potong Neopolitan=1|RABOKKI=1|Mie Pedas=1|SIOMAY=1|DUMPLING CHEESE=2|ODENG TIPIS=2|Topokki=5|BAKSO UDANG=1|CHIKUWA=1|KUAH ODENG=2|SCALLOP=1|ICE CREAM BOWL=1', cash: 132000, qris: 0, tf: 0 },
      { d: '2026-01-23', rev: 146000, tx: 10, skus: 'Choco Pandan=1|VANILLA LATTE=1|NASI AYAM KATSU=1|SIOMAY=2|Mie Pedas=2|CHIKUWA=4|DUMPLING AYAM=2|ODENG=2|SALMON STICK=2|SOSIS AYAM=2|KUAH ODENG=4|JASMINE TEA=2|BUTTERSCOOTH LATTE=1|MILO=1|BAKSO UDANG=2|DUMPLING CHEESE=2|ODENG TIPIS=2|SCALLOP=2|Topokki=2', cash: 75000, qris: 57000, tf: 14000 },
      { d: '2026-01-24', rev: 240500, tx: 11, skus: 'KUAH TOMYAM=2|FISHROLL=3|SHRIMP TAIL=2|DUMPLING CHEESE=2|CRAB STICK=2|SCALLOP=2|FISH TOFU=3|BAKSO IKAN=3|RABOKKI=4|Topokki=3|ODENG TIPIS=2|Es krim Turkiy=1|ICE CREAM BOWL=1|KUAH ODENG=2|SOSIS AYAM=3|CHIKUWA=2|DUMPLING AYAM=2|ODENG=2|SALMON STICK=2|ICE LYCHEE TEA=1|THAI TEA=1|SIOMAY=1|BLACK COFFE=1|MIE KUNING=1', cash: 165500, qris: 75000, tf: 0 },
      { d: '2026-01-25', rev: 422000, tx: 26, skus: 'Es krim Turkiy=12|ICE CREAM BOWL=6|Es Krim Turkiy Mix rasa=1|RABOKKI=2|Topokki=3|MINI NORI=1|KUAH ODENG=5|ODENG TIPIS=3|SCALLOP=4|DUMPLING CHEESE=4|CHIKUWA=5|BAKSO UDANG=3|KUAH TOMYAM=2|SHRIMP TAIL=2|FISHROLL=2|CRAB STICK=2|FISH TOFU=2|BAKSO IKAN=2|JASMINE TEA=2|SOSIS AYAM=3|DUMPLING AYAM=3|SALMON STICK=3|ICE LEMON TEA=1|AIR MINERAL BESAR=1|ODENG=3|NASI AYAM KATSU=1', cash: 318000, qris: 64000, tf: 40000 },
      { d: '2026-01-26', rev: 218000, tx: 16, skus: 'KUAH TOMYAM=4|FISHROLL=4|SHRIMP TAIL=4|DUMPLING CHEESE=5|CRAB STICK=4|SCALLOP=6|FISH TOFU=4|BAKSO IKAN=4|Es krim Turkiy=1|ICE LYCHEE TEA=1|ODENG=4|KUAH ODENG=6|ODENG TIPIS=3|CHIKUWA=6|BAKSO UDANG=4|SIOMAY=2|Mie Pedas=2|DUMPLING AYAM=4|SALMON STICK=3|SOSIS AYAM=2|MINI NORI=1|Es Krim Potong Durian=1', cash: 169000, qris: 49000, tf: 0 },
      { d: '2026-01-27', rev: 110000, tx: 6, skus: 'POP MIE=2|Snack 3000=1|ODENG=4|BAKSO UDANG=1|CHIKUWA=1|DUMPLING CHEESE=2|KUAH ODENG=1|ODENG TIPIS=1|SCALLOP=1|CRAB STICK=1|FISHROLL=1|KUAH TOMYAM=1|SHRIMP TAIL=1', cash: 95000, qris: 15000, tf: 0 },
      { d: '2026-01-28', rev: 113000, tx: 7, skus: 'Choco Pandan=1|POP MIE=1|SOSIS AYAM=3|BAKSO IKAN=2|CRAB STICK=3|DUMPLING CHEESE=3|FISH TOFU=2|FISHROLL=2|KUAH TOMYAM=1|SCALLOP=2|SHRIMP TAIL=2|KUAH ODENG=2|ODENG=2|CHIKUWA=2|RABOKKI=2', cash: 86000, qris: 12000, tf: 15000 },
      { d: '2026-01-29', rev: 101000, tx: 9, skus: 'Topokki=4|ODENG TIPIS=4|SOSIS AYAM=2|DUMPLING CHEESE=1|ICE CREAM BOWL=1|RABOKKI=1|Mie Pedas=2|SIOMAY=2', cash: 73000, qris: 28000, tf: 0 },
      { d: '2026-01-30', rev: 175000, tx: 9, skus: 'Topokki=3|RABOKKI=3|NASI AYAM KATSU=1|JASMINE TEA=1|SHRIMP TAIL=2|FISH TOFU=2|SCALLOP=2|BAKSO IKAN=2|DUMPLING CHEESE=2|ODENG TIPIS=2|ICE LYCHEE TEA=2|Kentang Goreng=1', cash: 74000, qris: 0, tf: 101000 },
      { d: '2026-01-31', rev: 111000, tx: 8, skus: 'Topokki=1|MILO=1|VANILLA LATTE=1|CHIKUWA=4|CRAB STICK=2|DUMPLING AYAM=2|KUAH ODENG=3|ODENG=2|SOSIS AYAM=2|BAKSO IKAN=1|DUMPLING CHEESE=3|ODENG TIPIS=2|SCALLOP=3|BAKSO UDANG=2|FISH TOFU=1|SHRIMP TAIL=1|MIE KUNING=1|KUAH TOMYAM=1|JASMINE TEA=1', cash: 64000, qris: 47000, tf: 0 }
    ];

    try {
      var payload = rawPeriodData.map(function (row) {
        var notes = '⟦PAY:cash=' + row.cash + '|qris=' + row.qris + '|tf=' + row.tf + '⟧ ⟦SKU:' + row.skus + '⟧';
        return {
          brand_id: BRAND,
          metric_date: row.d,
          cash_revenue: row.rev,
          transactions: row.tx,
          notes: notes
        };
      });

      await api('daily_metrics?on_conflict=brand_id,metric_date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload)
      });

      STATE.msg = '✓ Berhasil memuat 31 hari data penjualan Januari 2026 (337 transaksi)!';
      STATE.viewFrom = '2026-01-01';
      STATE.viewTo = '2026-01-31';
      STATE.viewMonth = '2026-01';
      STATE.slice = null;
      await loadMetrics();
    } catch (e) {
      STATE.loading = false;
      STATE.error = 'Gagal memuat data contoh: ' + e.message;
      draw();
    }
  }

  function css() {
    if (document.getElementById('sales-board-css')) return;
    var s = document.createElement('style'); s.id = 'sales-board-css'; s.textContent =
      '#sales{background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important}' +
      '.sale-board{width:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#13251d}' +
      '.sb-wrap{background:#f4f7f5;border:1px solid #dfe9e4;border-radius:18px;padding:16px 20px 20px;margin-bottom:14px;box-sizing:border-box}' +
      '.sb-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}' +
      '.sb-eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;color:#176b55}' +
      '.sb-head h2{font-size:22px;margin:2px 0 2px;color:#101714;font-weight:800}' +
      '.sb-head p{color:#66756e;font-size:12.5px;margin:0}' +
      '.sb-upload-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.sb-btn-upload{display:inline-flex;align-items:center;gap:6px;background:#176b55;color:#fff;border:0;border-radius:10px;min-height:38px;padding:0 14px;font-size:12.5px;font-weight:700;cursor:pointer;transition:background .15s}' +
      '.sb-btn-upload:hover{background:#125644}' +
      '.sb-file-pill{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #22c55e;padding:4px 10px;border-radius:10px;max-width:280px}' +
      '.sb-file-icon{font-size:15px}' +
      '.sb-file-info{display:flex;flex-direction:column;min-width:0}' +
      '.sb-file-name{font-size:11.5px;font-weight:700;color:#13251d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.sb-file-tag{font-size:10px;color:#166534;font-weight:600}' +
      '.sb-file-del{background:transparent;border:0;color:#991b1b;font-weight:800;font-size:13px;cursor:pointer;padding:2px 4px;line-height:1}' +
      '.sb-btn-submit{display:inline-flex;align-items:center;gap:6px;background:#cbd8d1;color:#55665e;border:0;border-radius:10px;min-height:38px;padding:0 14px;font-size:12.5px;font-weight:800;cursor:not-allowed;transition:all .2s}' +
      '.sb-btn-submit.ready{background:#16a34a;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(22,163,74,.25)}' +
      '.sb-btn-submit.ready:hover{background:#15803d}' +
      '.sb-btn-format{min-height:38px;padding:0 12px;background:#fff;border:1px solid #d4dfd9;color:#176b55;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer}' +
      '.sb-btn-format:hover{background:#f0f5f2}' +
      '.sb-period{margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}' +
      '.sb-cal{display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
      '.sb-cal b{font-size:12px;color:#13251d}' +
      '.sb-cal label{display:flex;align-items:center;gap:6px;font-size:12px;color:#5d6d66;font-weight:700;margin:0}' +
      '.sb-cal select,.sb-cal input[type=date]{min-height:34px;padding:3px 8px;border:1px solid #d4dfd9;border-radius:8px;background:#fff;font:inherit;color:#13251d;font-size:12px}' +
      '.sb-cal span{color:#7a8983;font-size:11.5px;margin-left:4px}' +
      '.sb-toggle{display:flex;gap:3px;background:#e2ebe6;border-radius:10px;padding:3px}' +
      '.sb-toggle button{min-height:32px;padding:0 12px;background:transparent;border:0;border-radius:7px;font-size:12px;font-weight:700;color:#52645c;cursor:pointer}' +
      '.sb-toggle button.on{background:#176b55;color:#fff}' +
      '.sb-slice-alert{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:8px 14px;margin-top:12px;font-size:12px;color:#065f46;flex-wrap:wrap}' +
      '.sb-slice-info{display:flex;align-items:center;gap:8px}' +
      '.sb-slice-badge{background:#10b981;color:#fff;padding:2px 8px;border-radius:99px;font-weight:800;font-size:11px}' +
      '.sb-slice-reset{background:#fff;border:1px solid #6ee7b7;color:#047857;border-radius:8px;padding:4px 10px;font-size:11.5px;font-weight:700;cursor:pointer}' +
      '.sb-slice-reset:hover{background:#d1fae5}' +
      '.sb-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}' +
      '.sb-kpi{background:#fff;border:1px solid #e0e8e4;border-radius:12px;padding:12px 14px}' +
      '.sb-kpi-label{font-size:11.5px;color:#6e7d76;font-weight:700}' +
      '.sb-kpi-value{font-size:20px;font-weight:800;margin-top:4px;color:#101714;letter-spacing:-.01em}' +
      '.sb-kpi-sub{font-size:11px;margin-top:4px;color:#7a8982}' +
      '.sb-kpi-sub.up{color:#1d7b59;font-weight:700}' +
      '.sb-kpi-sub.down{color:#b43b3b;font-weight:700}' +
      '.sb-grid-main{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(260px,1fr);gap:12px;margin-top:12px;align-items:stretch}' +
      '.sb-card{background:#fff;border:1px solid #e0e8e4;border-radius:14px;padding:14px 16px}' +
      '.sb-card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px}' +
      '.sb-card h3{font-size:15px;font-weight:800;margin:0;color:#101714}' +
      '.sb-card-head span{display:block;font-size:11px;color:#7a8983;margin-top:2px}' +
      '.sb-chart-wrap{position:relative;width:100%}' +
      '.sb-chart{width:100%;height:auto;margin-top:4px}' +
      '.sb-chart .axis{stroke:#dfe7e2;stroke-width:1}' +
      '.sb-chart .grid-line{stroke:#f0f5f2;stroke-width:1;stroke-dasharray:3 3}' +
      '.sb-chart .trend{fill:none;stroke:#176b55;stroke-width:2.5}' +
      '.sb-chart-point{fill:#176b55;cursor:pointer;transition:all .15s}' +
      '.sb-chart-point.on-slice{fill:#059669;r:6px}' +
      '.sb-chart-ring{fill:none;stroke:#34d399;stroke-width:3;opacity:.7}' +
      '.sb-touch-target{fill:transparent;cursor:pointer}' +
      '.sb-chart text{font-size:10px;fill:#7a8983}' +
      '.sb-chart .ylabel{font-size:10px;fill:#8a9992}' +
      '.sb-chart .x-label{font-size:9.5px;fill:#6b7c75}' +
      '.sb-chart .x-label-bold{font-size:11px;fill:#101714;font-weight:700}' +
      '.sb-chart .x-sub-label{font-size:9px;fill:#8a9992}' +
      '.sb-chart .bar-val-text{font-size:9.5px;fill:#176b55;font-weight:800}' +
      '.sb-chart-bar{fill:#176b55;cursor:pointer;transition:fill .15s;opacity:.9}' +
      '.sb-chart-bar:hover{opacity:1;fill:#115240}' +
      '.sb-chart-bar.on-slice{fill:#059669;stroke:#34d399;stroke-width:2}' +
      '.sb-chart-hint{font-size:10.5px;color:#7a8982;text-align:right;margin-top:6px;font-style:italic}' +
      '.sales-right-stack{display:flex;flex-direction:column;gap:10px;min-width:0}' +
      '.sb-sku-metric-toggle{display:flex;gap:2px;background:#e8efeb;border-radius:8px;padding:2px}' +
      '.sb-sku-metric-toggle button{border:0;background:transparent;padding:2px 8px;font-size:10.5px;font-weight:700;border-radius:6px;cursor:pointer;color:#5a6d65}' +
      '.sb-sku-metric-toggle button.on{background:#176b55;color:#fff}' +
      '.sb-bars{margin-top:8px}' +
      '.sb-bar-row{margin:10px 0}' +
      '.sb-bar-label{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:1.3}' +
      '.sb-bar-label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1a2b23;font-weight:600}' +
      '.sb-bar-label b{font-weight:800;color:#101714;white-space:nowrap}' +
      '.sb-share{font-size:10.5px;color:#7a8982;font-weight:500}' +
      '.sb-bar-rank{display:inline-flex;float:left;width:19px;height:19px;border-radius:50%;background:#eaf3ee;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#176b55;margin-right:8px}' +
      '.sb-bar-rank.worst{background:#fef3c7;color:#b45309}' +
      '.sb-bar-track{height:8px;background:#eef4f1;border-radius:99px;margin:6px 0 0 27px;overflow:hidden}' +
      '.sb-bar-fill{height:100%;background:#176b55;border-radius:99px}' +
      '.sb-bar-fill.worst{background:#d97706}' +
      '.sb-empty,.sb-loading,.sb-empty-chart,.sb-empty-list{background:#fff;border:1px dashed #cbd8d1;border-radius:14px;padding:22px;text-align:center;color:#6e7d76}' +
      '.sb-empty{margin-top:14px}' +
      '.sb-empty-icon{font-size:32px;color:#176b55}' +
      '.sb-error{margin-top:10px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;font-size:12px;font-weight:600}' +
      '.sb-ok{margin-top:10px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:10px;padding:10px 14px;font-size:12px;font-weight:600}' +
      '.sb-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,25,18,.5);z-index:9999;display:grid;place-items:center;padding:16px}' +
      '.sb-modal-card{background:#fff;border-radius:18px;max-width:540px;width:100%;box-shadow:0 12px 36px rgba(0,0,0,.2);overflow:hidden}' +
      '.sb-modal-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef3f0}' +
      '.sb-modal-head h3{margin:0;font-size:16px;color:#101714;font-weight:800}' +
      '.sb-modal-close{background:transparent;border:0;font-size:18px;cursor:pointer;color:#7a8982;font-weight:700}' +
      '.sb-modal-body{padding:16px 20px;max-height:70vh;overflow-y:auto}' +
      '.sb-fmt-box{background:#f8faf9;border:1px solid #e2ece7;border-radius:12px;padding:12px;margin:10px 0}' +
      '.sb-fmt-box b{font-size:12.5px;color:#176b55;display:block}' +
      '.sb-fmt-box p{font-size:12px;color:#4a5953;margin:4px 0 4px}' +
      '.sb-fmt-box small{font-size:11px;color:#7a8982}' +
      '.sb-modal-foot{padding:12px 20px;background:#f8faf9;border-top:1px solid #eef3f0;text-align:right}' +
      '.sb-btn-modal-ok{background:#176b55;color:#fff;border:0;border-radius:10px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer}' +
      '@media(max-width:980px){.sb-kpis{grid-template-columns:1fr 1fr}.sb-grid-main{grid-template-columns:1fr}}' +
      '@media(max-width:640px){.sb-wrap{padding:14px}.sb-kpis{grid-template-columns:1fr}.sb-head h2{font-size:20px}}';
    document.head.appendChild(s);
  }

  function hasBoard(h) { return !!(h && h.querySelector && h.querySelector('.sale-board')); }
  function ensureBoard() {
    var h = document.getElementById('sales');
    if (!h || !document.getElementById('app') || document.getElementById('app').classList.contains('hidden')) return;
    if (!hasBoard(h)) { draw(); }
  }

  function watch() {
    var h = document.getElementById('sales');
    if (!h || h.__saleObs) return;
    h.__saleObs = true;
    new MutationObserver(function () {
      if (STATE.draw) return;
      if (!hasBoard(h)) { draw(); }
    }).observe(h, { childList: true });
  }

  function mount() {
    css();
    var h = document.getElementById('sales');
    if (!h) return;
    watch();
    ensureBoard();
  }

  window.__hasnariaReloadSales = function () {
    STATE.fetched = false;
    STATE.error = '';
    loadMetrics();
  };

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-tab="sales"],.tab') : null;
    if (!t) return;
    var id = t.getAttribute('data-tab');
    if (id === 'sales' || (t.textContent || '').toLowerCase().indexOf('penjualan') !== -1) {
      setTimeout(mount, 40);
      setTimeout(function () {
        if (!STATE.fetched || STATE.error || !STATE.rows.length) loadMetrics();
      }, 150);
    }
  }, true);

  if (window.__HASNARIA_AUTH_READY && typeof window.__HASNARIA_AUTH_READY.then === 'function') {
    window.__HASNARIA_AUTH_READY.then(function () {
      setTimeout(function () {
        if (!STATE.fetched || STATE.error || !STATE.rows.length) loadMetrics();
      }, 200);
    });
  }

  var tries = 0;
  (function wait() {
    mount();
    if (document.getElementById('sales') && (!STATE.fetched || !STATE.rows.length) && pickTokenFromStorage()) {
      loadMetrics();
    }
    if ((!STATE.fetched || !STATE.rows.length) && tries++ < 80) {
      setTimeout(wait, 400);
    }
  })();
})();
