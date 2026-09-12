/* Hasnaria — Rata-rata Jam Penjualan Bulanan UI patch v3 */
(function () {
  'use strict';

  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var host = null;
  var observer = null;
  var timer = null;

  function apiBase() { return String(window.HASNARIA_SB || '').replace(/\/$/, ''); }
  function apiKey() { return window.HASNARIA_KEY || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function daysInMonth(ym) {
    var p = String(ym || '').split('-');
    if (p.length !== 2) return 0;
    return new Date(Number(p[0]), Number(p[1]), 0).getDate();
  }
  function selectedMonth() {
    var el = document.getElementById('sbMonth');
    if (el && /^\d{4}-\d{2}$/.test(el.value)) return el.value;
    var from = document.getElementById('sbFrom');
    return from && /^\d{4}-\d{2}-\d{2}$/.test(from.value) ? from.value.slice(0, 7) : '';
  }
  function isDailyMode() {
    var el = document.querySelector('#sales [data-mode].on');
    if (el) return el.getAttribute('data-mode') === 'daily';
    return true;
  }
  function moneyNumber(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  async function loadHourly(ym) {
    if (!ym) return [];
    var first = ym + '-01';
    var last = ym + '-' + String(daysInMonth(ym)).padStart(2, '0');
    /* Prefer the shared Supabase client so the hourly chart uses the same
       project/session/RLS context as the rest of the Sales dashboard. */
    try {
      if (window.__HASNARIA_DB && window.__HASNARIA_DB.from) {
        var q = await window.__HASNARIA_DB.from('sales')
          .select('sold_at,sold_hour,transaction_count')
          .eq('brand_id', BRAND)
          .gte('sold_at', first)
          .lte('sold_at', last)
          .order('sold_at', { ascending: true })
          .limit(50000);
        if (q && q.error) throw q.error;
        return (q && q.data) || [];
      }
    } catch (e) {
      console.warn('Hourly chart shared client query failed; using REST fallback.', e);
    }
    var base = apiBase(), key = apiKey();
    if (!base || !key) throw new Error('Supabase connection is not ready.');
    var url = base + '/rest/v1/sales?brand_id=eq.' + encodeURIComponent(BRAND) +
      '&sold_at=gte.' + encodeURIComponent(first) +
      '&sold_at=lte.' + encodeURIComponent(last) +
      '&select=sold_at,sold_hour,transaction_count&limit=50000&order=sold_at.asc';
    var r = await fetch(url, {
      headers: { apikey: key, Authorization: 'Bearer ' + key },
      cache: 'no-store'
    });
    if (!r.ok) throw new Error('Hourly sales HTTP ' + r.status);
    return await r.json();
  }

  function buildChart(rows, ym) {
    var sums = Array(24).fill(0), validCount = 0;
    (rows || []).forEach(function (r) {
      var h = Number(r && r.sold_hour);
      if (!isFinite(h) || h < 0 || h > 23) return;
      validCount++;
      sums[h] += moneyNumber(r.transaction_count);
    });
    var denominator = daysInMonth(ym);
    var avgs = sums.map(function (v) { return denominator ? v / denominator : 0; });
    var max = Math.max.apply(Math, avgs);
    var peak = avgs.indexOf(max);

    if (!validCount) {
      return '<div class="sb-empty-chart sb-hourly-empty">' +
        '<b>Data jam transaksi belum tersedia</b>' +
        '<br><small>' + (rows || []).length.toLocaleString('id-ID') + ' transaksi untuk <b>' + esc(ym) + '</b> sudah tersimpan, tetapi belum memiliki waktu transaksi asli (<code>sold_hour</code>).</small>' +
        '<br><small>Grafik tidak akan menggunakan <code>created_at</code> atau membuat jam berdasarkan asumsi.</small>' +
        '</div>';
    }

    var W = 960, H = 290, L = 54, R = 20, T = 24, B = 48;
    var pw = W - L - R, ph = H - T - B;
    var ymax = max > 0 ? Math.ceil(max * 1.15 * 10) / 10 : 1;
    var pts = avgs.map(function (v, i) {
      return { x: L + pw * (i / 23), y: T + ph - (v / ymax) * ph, v: v, h: i };
    });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var grid = '';
    [0, .25, .5, .75, 1].forEach(function (q) {
      var y = T + ph - q * ph;
      var val = ymax * q;
      grid += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W-R) + '" y2="' + y.toFixed(1) + '" stroke="currentColor" opacity=".10" />' +
        '<text x="' + (L-8) + '" y="' + (y+4).toFixed(1) + '" text-anchor="end" fill="currentColor" opacity=".60">' + val.toFixed(1) + '</text>';
    });
    var labels = '';
    pts.forEach(function (p, i) {
      if (i % 2 === 0 || i === 23) labels += '<text x="' + p.x.toFixed(1) + '" y="' + (H-18) + '" text-anchor="middle" fill="currentColor" opacity=".68">' + String(i).padStart(2,'0') + ':00</text>';
    });
    var dots = pts.map(function (p) {
      var peakCls = p.h === peak && max > 0 ? ' sb-hourly-peak' : '';
      return '<circle class="sb-chart-point' + peakCls + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (p.h === peak && max > 0 ? '5' : '3') + '" data-hour="' + p.h + '" />';
    }).join('');
    var peakText = max > 0 ? ('<div class="sb-hourly-peak-label">Jam tersibuk: <b>' + String(peak).padStart(2,'0') + ':00</b> · rata-rata <b>' + max.toFixed(1) + ' transaksi/hari</b></div>') : '';
    return '<div class="sb-chart-wrap sb-hourly-chart-wrap">' +
      '<svg class="sb-chart sb-hourly-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Rata-rata transaksi per jam bulan ' + esc(ym) + '">' +
      grid + '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity=".85" />' + dots + labels +
      '</svg>' + peakText +
      '</div>';
  }

  async function render() {
    host = document.getElementById('sales');
    if (!host || !host.isConnected) return;
    if (!isDailyMode()) return;
    var grid = host.querySelector('.sb-grid-main');
    var trend = grid && grid.querySelector('.sb-trend');
    if (!grid || !trend) return;
    var ym = selectedMonth();
    if (!ym) return;

    var existing = grid.querySelector('.sb-hourly-average');
    if (existing) {
      var existingYm = existing.getAttribute('data-hourly-month');
      if (existingYm === ym) return;
      existing.remove();
    }

    var card = document.createElement('section');
    card.className = 'sb-card sb-hourly-average';
    card.setAttribute('data-hourly-month', ym);
    card.innerHTML = '<div class="sb-card-head"><div><h3>Rata-rata Jam Penjualan Bulanan</h3><span>' + esc(ym) + ' · rata-rata transaksi per jam</span></div></div><div class="sb-hourly-body"><div class="sb-empty-chart">Memuat data jam transaksi…</div></div>';
    grid.appendChild(card);

    try {
      var rows = await loadHourly(ym);
      if (!card.isConnected) return;
      var body = card.querySelector('.sb-hourly-body');
      if (body) body.innerHTML = buildChart(rows, ym);
    } catch (e) {
      var b = card.querySelector('.sb-hourly-body');
      if (b) b.innerHTML = '<div class="sb-empty-chart">Data jam transaksi gagal dimuat. Silakan refresh halaman.</div>';
      console.error('Hasnaria hourly chart:', e);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { render(); }, 80);
  }

  function init() {
    host = document.getElementById('sales');
    if (!host) { setTimeout(init, 150); return; }
    if (observer) observer.disconnect();
    observer = new MutationObserver(schedule);
    observer.observe(host, { childList: true, subtree: true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
