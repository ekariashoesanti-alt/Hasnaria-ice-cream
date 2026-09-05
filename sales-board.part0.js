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
    tooltip: null,
    importStatus: null
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
    return String(x == null ? '' : x).replace(/[&<>\"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c];
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

