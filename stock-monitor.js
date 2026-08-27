/* Hasnaria stock monitor overlay. Does not replace core sales/approval logic. */
(function () {
  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = "a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4";
  var PAGE = 10;
  var state = {
    items: [],
    page: 1,
    mode: "period",
    period: "2026-07",
    selected: null,
    buys: {},
    loaded: false,
    err: ""
  };

  function token() {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i), v = localStorage.getItem(k);
      if (!v) continue;
      try { var j = JSON.parse(v); if (j && j.access_token) return j.access_token; } catch (e) {}
    }
    return null;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;" }[c];
    });
  }
  function titleCase(s) {
    return String(s || "").toLowerCase().replace(/(^|\s)\S/g, function (x) { return x.toUpperCase(); });
  }
  function firstNum(raw) {
    if (raw == null || raw === "") return null;
    var m = String(raw).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  function dash(n) { return n == null || n === "" ? "—" : n; }
  function signed(n) {
    if (n == null) return "—";
    return (n > 0 ? "+" : "") + n;
  }
  function unitOf(name, category) {
    var n = String(name || "").toLowerCase();
    var c = String(category || "").toLowerCase();
    if (/odeng|topokki|saus|es krim|ice/.test(n)) return "porsi";
    if (/matcha|teh|cup|minuman/.test(n) || c === "minuman") return "cup";
    if (c === "kemasan") return "pcs";
    if (/sosis|udang|fish|dumpling|ekor/.test(n)) return "pcs";
    return c === "makanan" ? "porsi" : "pcs";
  }
  function loadBuys() {
    try { state.buys = JSON.parse(localStorage.getItem("hasnaria_today_buy") || "{}") || {}; }
    catch (e) { state.buys = {}; }
  }
  function saveBuys() {
    try { localStorage.setItem("hasnaria_today_buy", JSON.stringify(state.buys)); } catch (e) {}
  }
  function enrich(row) {
    var awal = firstNum(row.stock_june);
    var beli = firstNum(row.purchase_july);
    var pakai = firstNum(row.sold_july);
    var akhir = firstNum(row.stock_august);
    var disc = firstNum(row.discrepancy);
    if (disc == null && awal != null && beli != null && pakai != null && akhir != null) {
      disc = akhir - (awal + beli - pakai);
    }
    var qty = akhir != null ? akhir : awal;
    var min = Math.max(1, Math.round((awal != null ? awal : (qty || 1)) * 0.6));
    var order = Math.max(min, Math.round(min * 2.5));
    var name = titleCase(row.item_name);
    if (name === "Odeng") { min = 20; order = 50; }
    if (name === "Sosis") { min = 20; order = 30; }
    if (name === "Topokki") { min = 20; order = 40; }
    var lv = "ok";
    if (qty == null) lv = "na";
    else if (qty <= 0) lv = "critical";
    else if (qty < min) lv = "order";
    return {
      id: row.id,
      name: name,
      rawName: row.item_name,
      category: row.category,
      unit: unitOf(row.item_name, row.category),
      awal: awal, beli: beli, pakai: pakai, akhir: akhir, disc: disc,
      qty: qty, min: min, order: order, lv: lv,
      purchaseText: row.purchase_july
    };
  }
  function statusChip(lv) {
    if (lv === "critical") return '<span class="chip r">Kritis</span>';
    if (lv === "order") return '<span class="chip y">Perlu Order</span>';
    if (lv === "na") return '<span class="chip g">Aman</span>';
    return '<span class="chip g">Aman</span>';
  }
  async function fetchItems() {
    var t = token();
    if (!t) throw new Error("Session belum tersedia. Silakan login kembali.");
    var url = SB + "/rest/v1/inventory_items?brand_id=eq." + BRAND +
      "&select=id,category,item_name,stock_june,purchase_july,sold_july,stock_august,discrepancy,source_period" +
      "&order=item_name.asc";
    var r = await fetch(url, { headers: { apikey: KEY, Authorization: "Bearer " + t } });
    if (!r.ok) throw new Error("Gagal membaca stok (" + r.status + ")");
    var rows = await r.json();
    state.items = (rows || []).map(enrich);
    if (!state.selected && state.items.length) {
      var odeng = state.items.find(function (x) { return x.rawName && x.rawName.toUpperCase() === "ODENG"; });
      state.selected = (odeng || state.items[0]).id;
    }
    state.loaded = true;
  }
  function selected() {
    return state.items.find(function (x) { return x.id === state.selected; }) || state.items[0];
  }
  function stats() {
    var ok = 0, order = 0, crit = 0;
    state.items.forEach(function (x) {
      if (x.lv === "critical") crit++;
      else if (x.lv === "order") order++;
      else ok++;
    });
    var total = state.items.length || 1;
    return { ok: ok, order: order, crit: crit, total: total, pct: Math.round(ok / total * 1000) / 10 };
  }
  function gaugeSvg(pct) {
    var p = Math.max(0, Math.min(100, pct));
    var ang = -110 + (p / 100) * 220;
    var rad = ang * Math.PI / 180;
    var x = 100 + Math.cos(rad) * 62;
    var y = 108 + Math.sin(rad) * 62;
    return '<svg class="stk-gauge" viewBox="0 0 200 150" aria-hidden="true">' +
      '<path d="M20 108 A80 80 0 0 1 180 108" fill="none" stroke="#fecaca" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="M44 48 A80 80 0 0 1 100 28" fill="none" stroke="#fdba74" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="M100 28 A80 80 0 0 1 156 48" fill="none" stroke="#fde68a" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="M156 48 A80 80 0 0 1 180 108" fill="none" stroke="#86efac" stroke-width="14" stroke-linecap="round"/>' +
      '<circle cx="100" cy="108" r="8" fill="#166534"/>' +
      '<line x1="100" y1="108" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#166534" stroke-width="7" stroke-linecap="round"/>' +
      '<text x="22" y="128" font-size="11" fill="#66756e">0%</text>' +
      '<text x="48" y="52" font-size="11" fill="#66756e">25%</text>' +
      '<text x="90" y="22" font-size="11" fill="#66756e">50%</text>' +
      '<text x="148" y="52" font-size="11" fill="#66756e">75%</text>' +
      '<text x="168" y="128" font-size="11" fill="#66756e">100%</text>' +
      "</svg>";
  }
  function pages(total) {
    var last = Math.max(1, Math.ceil(total / PAGE));
    if (state.page > last) state.page = last;
    var out = [];
    function add(n) { out.push(n); }
    add(1);
    var s = Math.max(2, state.page - 1), e = Math.min(last - 1, state.page + 1);
    if (s > 2) out.push("…");
    for (var i = s; i <= e; i++) add(i);
    if (e < last - 1) out.push("…");
    if (last > 1) add(last);
    return { last: last, items: out };
  }
  function renderMonitor(item) {
    if (!item) return "<p class=\"small\">Belum ada data stok.</p>";
    var buy = state.buys[item.id] != null ? state.buys[item.id] : "";
    return '<div class="stk-head"><h2>MONITORING STOK MINIMUM</h2>' +
      '<p class="small">Bukan “kalau habis baru beli”. Sampai minimum → PIC order angka Order.</p></div>' +
      '<div class="stk-form">' +
      '<div><label>Pilih produk</label><select id="stkPick">' +
      state.items.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === item.id ? " selected" : "") + ">" + esc(x.name) + "</option>";
      }).join("") + "</select></div>" +
      '<div><label>Stok Saat Ini (Qty)</label><input id="stkQty" value="' + dash(item.qty) + '" disabled>' +
      '<div class="hint">Per awal Agustus 2026</div></div>' +
      '<div><label>Minimum (Min)</label><input value="' + item.min + '" disabled><div class="hint">Dari data historis</div></div>' +
      '<div class="stk-buy"><label>Input Pembelian Hari Ini</label>' +
      '<div class="stk-buy-row"><input id="stkBuy" type="number" min="0" value="' + esc(buy) + '" placeholder="0">' +
      '<span class="unit">' + esc(item.unit) + "</span></div>" +
      '<div class="hint">Isi jumlah stok baru yang dibeli</div></div>' +
      '<div><label>Order (Qty/pcs/porsi)</label><input value="' + item.order + " " + item.unit + '" disabled>' +
      '<div class="hint">Dari data historis</div></div>' +
      '<div><label>Status</label><div class="stk-status">' + statusChip(item.lv) + "</div></div>" +
      "</div>";
  }
  function renderTable() {
    var start = (state.page - 1) * PAGE;
    var slice = state.items.slice(start, start + PAGE);
    var pg = pages(state.items.length);
    var rows = slice.map(function (x, i) {
      return "<tr><td>" + (start + i + 1) + "</td><td>" + esc(x.name) + "</td><td>" + esc(x.unit) + "</td>" +
        "<td>" + dash(x.awal) + "</td><td>" + dash(x.beli) + "</td><td>" + dash(x.pakai) + "</td>" +
        "<td>" + dash(x.akhir) + "</td><td>" + signed(x.disc) + "</td><td>" + statusChip(x.lv) + "</td></tr>";
    }).join("");
    var btns = '<button type="button" class="pg" data-pg="' + Math.max(1, state.page - 1) + '"><</button>' +
      pg.items.map(function (n) {
        if (n === "…") return '<span class="pg-dots">…</span>';
        return '<button type="button" class="pg' + (n === state.page ? " on" : "") + '" data-pg="' + n + '">' + n + "</button>";
      }).join("") +
      '<button type="button" class="pg" data-pg="' + Math.min(pg.last, state.page + 1) + '">></button>';
    return '<div class="stk-split">' +
      '<div class="card stk-table-card">' +
      '<div class="stk-table-head"><div><h2>Perbandingan Stok per Periode</h2>' +
      '<div class="stk-filters">' +
      '<div><div class="label">Lihat berdasarkan</div>' +
      '<div class="seg"><button type="button" class="seg-btn' + (state.mode === "period" ? " on" : "") + '" data-mode="period">Periode</button>' +
      '<button type="button" class="seg-btn' + (state.mode === "date" ? " on" : "") + '" data-mode="date">Per Tanggal</button></div></div>' +
      '<div><label>Periode</label><select id="stkPeriod"><option value="2026-07">Juli 2026</option></select></div>' +
      "</div></div>" +
      '<button type="button" id="stkExport" class="xls">Export Excel</button></div>' +
      (state.mode === "date" ? '<p class="small" style="margin:8px 0 10px">Data harian belum dipecah. Menampilkan rekap Juli 2026.</p>' : "") +
      '<div class="stk-scroll"><table><thead><tr>' +
      "<th>No</th><th>Produk</th><th>Satuan</th>" +
      "<th>Stok Awal<br><span class=\"th-sub\">Juni 2026</span></th>" +
      "<th>Pembelian<br><span class=\"th-sub\">Juli 2026</span></th>" +
      "<th>Terpakai<br><span class=\"th-sub\">Juli 2026</span></th>" +
      "<th>Stok Akhir<br><span class=\"th-sub\">Awal Ags 2026</span></th>" +
      "<th>Selisih</th><th>Status</th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="9" class="small">Belum ada data inventory.</td></tr>') +
      "</tbody></table></div>" +
      '<div class="stk-pager"><div class="small">Menampilkan ' + (state.items.length ? (start + 1) : 0) + "–" +
      Math.min(start + PAGE, state.items.length) + " dari " + state.items.length + " item</div>" +
      '<div class="stk-pages">' + btns + "</div></div>" +
      '<p class="small" style="margin-top:10px">Keterangan: Selisih = Stok Akhir − (Stok Awal + Pembelian − Terpakai)</p>' +
      "</div>" +
      renderGauge() +
      "</div>";
  }
  function renderGauge() {
    var s = stats();
    var label = s.pct >= 75 ? "Aman" : s.pct >= 50 ? "Perlu pantau" : "Kritis";
    return '<div class="card stk-gauge-card"><div class="stk-gauge-title">Kecukupan Stok (PAR)</div>' +
      gaugeSvg(s.pct) +
      '<div class="stk-pct">' + s.pct + "%</div>" +
      '<div class="stk-pct-lab">' + label + "</div>" +
      '<div class="small" style="text-align:center">' + s.ok + " dari " + s.total + " item di atas minimum</div>" +
      '<div class="stk-leg">' +
      '<div><span class="dot g"></span> Aman (≥ Min)<b>' + s.ok + " item (" + (Math.round(s.ok / s.total * 1000) / 10) + "%)</b></div>" +
      '<div><span class="dot y"></span> Perlu Order (< Min s.d. Order)<b>' + s.order + " item (" + (Math.round(s.order / s.total * 1000) / 10) + "%)</b></div>" +
      '<div><span class="dot r"></span> Kritis (≤ 0 / Habis)<b>' + s.crit + " item (" + (Math.round(s.crit / s.total * 1000) / 10) + "%)</b></div>" +
      "</div>" +
      '<div class="stk-info">Semakin tinggi persentase, semakin aman kecukupan stok Anda.</div>' +
      "</div>";
  }
  function html() {
    if (state.err) return '<div class="card redbox">' + esc(state.err) + "</div>";
    if (!state.loaded) return '<div class="card"><p class="small">Memuat monitoring stok…</p></div>';
    var item = selected();
    return '<div id="stockMonitor">' +
      '<div class="card stk-monitor">' + renderMonitor(item) + "</div>" +
      renderTable() +
      "</div>";
  }
  function bind() {
    var root = document.getElementById("stok");
    if (!root) return;
    var pick = document.getElementById("stkPick");
    if (pick) pick.onchange = function () { state.selected = pick.value; paint(false); };
    var buy = document.getElementById("stkBuy");
    if (buy) {
      buy.onchange = buy.onblur = function () {
        var n = buy.value === "" ? "" : Number(buy.value);
        if (n === "" || isNaN(n)) delete state.buys[state.selected];
        else state.buys[state.selected] = n;
        saveBuys();
      };
    }
    root.querySelectorAll("[data-mode]").forEach(function (b) {
      b.onclick = function () { state.mode = b.getAttribute("data-mode"); paint(false); };
    });
    root.querySelectorAll("[data-pg]").forEach(function (b) {
      b.onclick = function () { state.page = Number(b.getAttribute("data-pg")); paint(false); };
    });
    var ex = document.getElementById("stkExport");
    if (ex) ex.onclick = exportCsv;
  }
  function exportCsv() {
    var lines = [["No", "Produk", "Satuan", "Stok Awal Juni 2026", "Pembelian Juli 2026", "Terpakai Juli 2026", "Stok Akhir Awal Ags 2026", "Selisih", "Status"].join(",")];
    state.items.forEach(function (x, i) {
      var st = x.lv === "critical" ? "Kritis" : x.lv === "order" ? "Perlu Order" : "Aman";
      lines.push([i + 1, '"' + x.name.replace(/"/g, '""') + '"', x.unit, x.awal == null ? "" : x.awal, x.beli == null ? "" : x.beli, x.pakai == null ? "" : x.pakai, x.akhir == null ? "" : x.akhir, x.disc == null ? "" : x.disc, st].join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hasnaria-stok-juli-2026.csv";
    a.click();
  }
  var painting = false;
  function paint(fromCore) {
    var el = document.getElementById("stok");
    if (!el) return;
    if (fromCore && document.getElementById("stockMonitor") && el.contains(document.getElementById("stockMonitor"))) return;
    painting = true;
    el.innerHTML = html();
    bind();
    setTimeout(function () { painting = false; }, 0);
  }
  async function boot() {
    loadBuys();
    try { await fetchItems(); state.err = ""; }
    catch (e) { state.err = e.message || String(e); }
    paint(false);
  }
  function watch() {
    var el = document.getElementById("stok");
    if (!el || el.getAttribute("data-stk-watch")) return;
    el.setAttribute("data-stk-watch", "1");
    new MutationObserver(function () {
      if (painting) return;
      if (!document.getElementById("stockMonitor")) paint(true);
    }).observe(el, { childList: true });
  }
  var n = 0;
  (function wait() {
    var app = document.getElementById("app");
    var stok = document.getElementById("stok");
    if (app && stok && !app.classList.contains("hidden")) {
      watch();
      boot();
    } else if (n++ < 160) setTimeout(wait, 250);
  })();
})();
