(function () {
  var URL = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = "a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4";
  var OWNERS = ["harisnu@gmail.com"];
  var ROLE_L = { pending: "Menunggu persetujuan", owner: "Owner", head_store: "Head of Store", marketing: "Marketing", pic: "PIC Shift", pelaksana: "Pelaksana" };
  var LIM = { owner: { p: 1 / 0, k: 1 / 0 }, head_store: { p: 1500000, k: 50000 }, marketing: { p: 0, k: 0 }, pic: { p: 0, k: 15000 }, pelaksana: { p: 0, k: 0 } };
  var TAG = { recorded: "⟦H:recorded⟧", pending_approval: "⟦H:pending_approval⟧", approved: "⟦H:approved⟧", rejected: "⟦H:rejected⟧" };
  var CAT = { pembelian: "Pembelian", waste: "Waste", kompensasi: "Kompensasi", lainnya: "Lainnya" };
  var TARGET = 1500000;
  var OPENING = ["Kebersihan area","Peralatan siap","Bahan lengkap","Stok dicek vs PAR","Uang kas awal","Area pelanggan rapi","Produk siap jual","Freezer normal","Gas / listrik / air"];
  var HANDOVER = ["Stok diserahkan","Kas diserahkan","Pre-order dicatat","Masalah tamu","Bahan hampir habis","Pekerjaan belum selesai"];
  var CLOSING = ["Omzet diinput","Kas dihitung","Transaksi dicocokkan","Stok akhir","Waste dicatat","Kebersihan tutup","Alat dimatikan","Listrik / gas aman","Masalah hari ini + tindakan"];
  var PAR0 = [
    { sku: "odeng", min: 30, order: 50, qty: 35, unit: "porsi", name: "Odeng" },
    { sku: "topokki", min: 20, order: 40, qty: 25, unit: "porsi", name: "Topokki" },
    { sku: "sosis", min: 20, order: 30, qty: 22, unit: "pcs", name: "Sosis" },
    { sku: "cup", min: 50, order: 100, qty: 60, unit: "pcs", name: "Cup" },
    { sku: "eskrim_coklat", min: 15, order: 30, qty: 18, unit: "porsi", name: "Es Krim Coklat" },
    { sku: "eskrim_vanilla", min: 15, order: 30, qty: 12, unit: "porsi", name: "Es Krim Vanilla" },
    { sku: "susu", min: 8, order: 20, qty: 10, unit: "liter", name: "Susu" },
    { sku: "gas", min: 1, order: 2, qty: 1, unit: "tabung", name: "Gas" }
  ];
  var CAL = [["Senin","Produk"],["Selasa","Promo"],["Rabu","Pengalaman tamu"],["Kamis","Menu"],["Jumat","Promo"],["Sabtu","Ambience / hangout"],["Minggu","Keluarga / santai"]];
  var $ = function (id) { return document.getElementById(id); };
  var rp = function (n) { return "Rp" + Number(n || 0).toLocaleString("id-ID"); };
  var today = function () { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&"+"amp;").replace(/</g, "&"+"lt;").replace(/>/g, "&"+"gt;"); };
  var db, me = null, role = "pending", metrics = [], expenses = [], social = [], roster = [], stock = [], tab = "dashboard";

  function wrap(st, n) { return (TAG[st] || TAG.recorded) + (n || ""); }
  function parseNotes(raw) {
    var t = raw || "";
    for (var st in TAG) { if (t.indexOf(TAG[st]) === 0) return { status: st, notes: t.slice(TAG[st].length) }; }
    return { status: "recorded", notes: t };
  }
  function parsePay(notes) {
    var m = String(notes || "").match(/⟦PAY:cash=([\d.]+)\|qris=([\d.]+)\|tf=([\d.]+)⟧/);
    if (!m) return null;
    return { cash: Number(m[1]), qris: Number(m[2]), tf: Number(m[3]), rest: String(notes).replace(m[0], "") };
  }
  function decide(r, cat, amt) {
    if (r === "owner") return { status: "recorded", msg: "Tercatat langsung." };
    var lim = LIM[r] || { p: 0, k: 0 };
    if (cat === "pembelian") {
      if (!lim.p) return { status: "pending_approval", msg: "Pembelian bukan wewenang Anda. Diajukan ke atasan." };
      if (amt > lim.p) return { status: "pending_approval", msg: "Melebihi batas " + rp(lim.p) + ". Diajukan ke Owner." };
    }
    if (cat === "kompensasi") {
      if (!lim.k) return { status: "pending_approval", msg: "Kompensasi bukan wewenang Anda." };
      if (amt > lim.k) return { status: "pending_approval", msg: "Melebihi batas " + rp(lim.k) + ". Diajukan ke atasan." };
    }
    if (cat === "lainnya" && r !== "head_store" && amt > 500000) return { status: "pending_approval", msg: "Pengeluaran di atas Rp500.000 diajukan ke Owner." };
    return { status: "recorded", msg: "Tercatat dalam batas wewenang Anda." };
  }
  function canSales(r) { return ["owner", "head_store", "pic", "pelaksana"].indexOf(r) >= 0; }
  function canOps(r) { return ["owner", "head_store", "pic"].indexOf(r) >= 0; }
  function canSoc(r) { return ["owner", "marketing", "head_store"].indexOf(r) >= 0; }
  function canTeam(r) { return r === "owner"; }
  function canApproveRow(r, cat, amt) {
    if (r === "owner") return true;
    if (r !== "head_store") return false;
    if (cat === "pembelian") return amt <= 1500000;
    if (cat === "kompensasi") return amt <= 50000;
    return amt <= 500000;
  }
  function canAppr(r) { return r === "owner" || r === "head_store"; }
  function canStock(r) { return r === "owner" || r === "head_store" || r === "pic"; }
  function encode(m) { return "HASNARIA_USER|" + m.userId + "|" + m.role + "|" + m.email + "|" + (m.name || "").replace(/\|/g, "/"); }
  function parseM(name) {
    if (!name || name.indexOf("HASNARIA_USER|") !== 0) return null;
    var p = name.split("|");
    if (p.length < 5) return null;
    return { userId: p[1], role: p[2], email: p[3], name: p.slice(4).join("|"), prodId: null };
  }
  function parsePar(name, qty) {
    if (!name || name.indexOf("HASNARIA_PAR|") !== 0) return null;
    var p = name.split("|");
    if (p.length < 6) return null;
    return { sku: p[1], min: Number(p[2]), order: Number(p[3]), unit: p[4], name: p.slice(5).join("|"), qty: Number(qty || 0) };
  }
  function stockLv(p) {
    if (p.qty <= 0 || p.qty < p.min * 0.5) return "critical";
    if (p.qty <= p.min) return "order";
    return "ok";
  }
  function setAuthMessage(m) { var el = $("authMsg"); if (el) el.textContent = m || ""; }
  function waitDb() {
    return new Promise(function (resolve, reject) {
      var n = 0;
      (function tick() {
        if (typeof supabase !== "undefined") {
          db = supabase.createClient(URL, KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
          resolve(db);
        } else if (n++ > 80) reject(new Error("Pustaka login belum siap. Refresh halaman."));
        else setTimeout(tick, 50);
      })();
    });
  }

  async function loadRoster() {
    var r = await db.from("products").select("id,name").eq("brand_id", BRAND).like("name", "HASNARIA_USER|%");
    if (r.error) throw r.error;
    roster = (r.data || []).map(function (row) {
      var m = parseM(row.name);
      if (m) m.prodId = row.id;
      return m;
    }).filter(Boolean);
  }
  async function upsertMember(m) {
    var name = encode(m);
    var hit = roster.find(function (x) { return x.userId === m.userId; });
    if (hit && hit.prodId) {
      var u = await db.from("products").update({ name: name }).eq("id", hit.prodId);
      if (u.error) throw u.error;
    } else {
      var i = await db.from("products").insert({ brand_id: BRAND, name: name, selling_price: 0, cogs: 0, active: true });
      if (i.error) throw i.error;
    }
    await db.from("user_profiles").upsert({ id: m.userId, display_name: m.role + "::" + m.name });
  }
  async function seedPar() {
    var r = await db.from("products").select("id").eq("brand_id", BRAND).like("name", "HASNARIA_PAR|%").limit(1);
    if (r.error || (r.data && r.data.length)) return;
    var rows = PAR0.map(function (p) {
      return { brand_id: BRAND, name: "HASNARIA_PAR|" + p.sku + "|" + p.min + "|" + p.order + "|" + p.unit + "|" + p.name, selling_price: p.qty, cogs: p.min, active: true };
    });
    rows.push({ brand_id: BRAND, name: "HASNARIA_CFG|daily_target", selling_price: TARGET, cogs: 0, active: true });
    await db.from("products").insert(rows);
  }
  async function bootstrap(user) {
    await loadRoster();
    var email = (user.email || "").toLowerCase();
    var full = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || email.split("@")[0];
    var existing = roster.find(function (x) { return x.userId === user.id; });
    if (existing) {
      if (OWNERS.indexOf(email) >= 0 && existing.role !== "owner") {
        existing = { userId: existing.userId, role: "owner", email: email, name: full, prodId: existing.prodId };
        await upsertMember(existing);
      }
      me = existing; role = existing.role;
      if (role === "owner") await seedPar();
      return;
    }
    var hasOwner = roster.some(function (x) { return x.role === "owner" || OWNERS.indexOf((x.email || "").toLowerCase()) >= 0; });
    var r = (OWNERS.indexOf(email) >= 0 || !hasOwner) ? "owner" : "pending";
    me = { userId: user.id, email: email, name: full, role: r };
    role = r;
    await upsertMember(me);
    await loadRoster();
    if (r === "owner") await seedPar();
  }
  async function loadAll() {
    var from = new Date(); from.setDate(from.getDate() - 89);
    var f = from.toISOString().slice(0, 10);
    var r = await db.from("daily_metrics").select("*").eq("brand_id", BRAND).gte("metric_date", f).order("metric_date");
    if (r.error) throw r.error;
    metrics = (r.data || []).map(function (x) { x.pay = parsePay(x.notes); x.cash_revenue = Number(x.cash_revenue || 0); return x; });
    r = await db.from("expenses").select("*").eq("brand_id", BRAND).gte("expense_date", f).order("expense_date", { ascending: false });
    if (r.error) throw r.error;
    expenses = (r.data || []).map(function (x) {
      var p = parseNotes(x.notes);
      return Object.assign({}, x, { amount: Number(x.amount || 0), status: p.status, displayNotes: p.notes });
    });
    r = await db.from("social_contents").select("*").eq("brand_id", BRAND).gte("posted_at", f).order("posted_at", { ascending: false });
    if (r.error) throw r.error;
    social = r.data || [];
    r = await db.from("products").select("id,name,selling_price").eq("brand_id", BRAND).like("name", "HASNARIA_PAR|%");
    if (r.error) throw r.error;
    stock = (r.data || []).map(function (row) {
      var p = parsePar(row.name, row.selling_price);
      if (p) p.id = row.id;
      return p;
    }).filter(Boolean);
    var cfg = await db.from("products").select("selling_price").eq("brand_id", BRAND).like("name", "HASNARIA_CFG|daily_target%").maybeSingle();
    if (cfg.data && Number(cfg.data.selling_price) > 0) TARGET = Number(cfg.data.selling_price);
  }
  function show(id) { ["auth", "pending", "app"].forEach(function (x) { $(x).classList.toggle("hidden", x !== id); }); }
  function setTab(id) {
    tab = id;
    ["dashboard", "sales", "ops", "stok", "shift", "social", "approval", "team", "sistem"].forEach(function (x) { $(x).classList.toggle("hidden", x !== id); });
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === id); });
    render();
  }
  function tabs() {
    var pend = expenses.filter(function (x) { return x.status === "pending_approval"; }).length;
    var items = [["dashboard", "Hari ini"], ["sales", "Penjualan"], ["ops", "Uang & ops"], ["stok", "Stok"], ["shift", "Shift"], ["social", "Medsos"]];
    if (canAppr(role)) items.push(["approval", "Putusan" + (pend ? " (" + pend + ")" : "")]);
    if (canTeam(role)) items.push(["team", "Tim"]);
    items.push(["sistem", "Sistem"]);
    $("tabs").innerHTML = items.map(function (pair) {
      return '<button class="tab' + (tab === pair[0] ? " on" : "") + '" data-tab="' + pair[0] + '" type="button">' + pair[1] + "</button>";
    }).join("");
    document.querySelectorAll(".tab").forEach(function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); }); });
  }
  function tday() { return metrics.filter(function (x) { return x.metric_date === today(); }); }
  function redInbox() {
    var out = [];
    expenses.filter(function (x) { return x.status === "pending_approval"; }).forEach(function (x) {
      var red = x.category === "pembelian" && x.amount > 1500000 || x.amount >= 50000 && x.category !== "waste";
      out.push({ lv: red && role === "owner" ? "merah" : "kuning", t: (CAT[x.category] || x.category) + " " + rp(x.amount), d: x.displayNotes || x.expense_date });
    });
    stock.forEach(function (p) {
      var lv = stockLv(p);
      if (lv !== "ok") out.push({ lv: lv === "critical" ? "merah" : "kuning", t: p.name + " " + p.qty + "/" + p.min + " " + p.unit, d: "Order " + p.order + " " + p.unit });
    });
    var row = tday()[0];
    if (row && row.pay) {
      var gap = row.pay.cash + row.pay.qris + row.pay.tf - row.cash_revenue;
      if (Math.abs(gap) >= 1) out.push({ lv: Math.abs(gap) >= 50000 ? "merah" : "kuning", t: "Selisih kas " + rp(gap), d: "PIC wajib menjelaskan." });
    }
    social.filter(function (x) { return x.platform === "HASNARIA_HR" && (x.content_title || "").indexOf("|D|") >= 0; }).forEach(function (x) {
      out.push({ lv: "merah", t: "Izin tidak memenuhi ketentuan", d: x.content_title });
    });
    return out;
  }

  function render() {
    if (!me) return;
    $("whoName").textContent = me.name || "—";
    $("whoMeta").textContent = (ROLE_L[role] || role) + " · " + (me.email || "");
    tabs();
    var now = Date.now(), cut = new Date(now - 30 * 864e5).toISOString().slice(0, 10), prev = new Date(now - 60 * 864e5).toISOString().slice(0, 10);
    var cur = metrics.filter(function (x) { return x.metric_date >= cut; });
    var old = metrics.filter(function (x) { return x.metric_date >= prev && x.metric_date < cut; });
    var cr = cur.reduce(function (s, x) { return s + Number(x.cash_revenue || 0); }, 0);
    var ct = cur.reduce(function (s, x) { return s + Number(x.transactions || 0); }, 0);
    var pr = old.reduce(function (s, x) { return s + Number(x.cash_revenue || 0); }, 0);
    var g = pr ? ((cr - pr) / pr * 100) : null;
    var counted = expenses.filter(function (x) { return x.status === "recorded" || x.status === "approved"; });
    var e30 = counted.filter(function (x) { return x.expense_date >= cut; });
    var buy = e30.filter(function (x) { return x.category === "pembelian"; }).reduce(function (s, x) { return s + x.amount; }, 0);
    var waste = e30.filter(function (x) { return x.category === "waste"; }).reduce(function (s, x) { return s + x.amount; }, 0);
    var todayRow = tday()[0];
    var omzetH = todayRow ? todayRow.cash_revenue : 0;
    var txH = todayRow ? todayRow.transactions : 0;
    var ach = TARGET ? Math.round(omzetH / TARGET * 1000) / 10 : 0;
    var inbox = redInbox();
    var red = inbox.filter(function (x) { return x.lv === "merah"; });
    var yel = inbox.filter(function (x) { return x.lv === "kuning"; });
    var crit = stock.filter(function (p) { return stockLv(p) !== "ok"; });
    var hr = social.filter(function (x) { return x.platform === "HASNARIA_HR"; });
    var absen = hr.filter(function (x) { return (x.content_title || "").indexOf("|" + today() + "|") >= 0; });

    $("dashboard").innerHTML =
      '<div class="card"><h2>Laporan harian · ' + today() + '</h2><p class="small">15 menit. Bukan WhatsApp.</p>' +
      '<div class="grid" style="margin-top:12px"><div><div class="label">Omzet hari ini</div><div class="metric">' + rp(omzetH) + '</div></div>' +
      '<div><div class="label">Target</div><div class="metric">' + rp(TARGET) + '</div></div>' +
      '<div><div class="label">Pencapaian</div><div class="metric">' + ach + '%</div></div>' +
      '<div><div class="label">Pembeli / ATV</div><div class="metric">' + txH + ' · ' + rp(txH ? omzetH / txH : 0) + '</div></div></div>' +
      '<div class="grid" style="margin-top:12px"><div><div class="label">Tunai</div><div class="metric">' + (todayRow && todayRow.pay ? rp(todayRow.pay.cash) : "—") + '</div></div>' +
      '<div><div class="label">QRIS</div><div class="metric">' + (todayRow && todayRow.pay ? rp(todayRow.pay.qris) : "—") + '</div></div>' +
      '<div><div class="label">Transfer</div><div class="metric">' + (todayRow && todayRow.pay ? rp(todayRow.pay.tf) : "—") + '</div></div>' +
      '<div><div class="label">Selisih kas</div><div class="metric">' + (todayRow && todayRow.pay ? rp(todayRow.pay.cash + todayRow.pay.qris + todayRow.pay.tf - omzetH) : "Belum") + "</div></div></div></div>" +
      (red.length ? '<div class="redbox"><b>PERLU KEPUTUSAN OWNER</b>' + red.map(function (x) { return '<div style="margin-top:8px">' + esc(x.t) + '<div class="small">' + esc(x.d) + "</div></div>"; }).join("") + "</div>" : '<div class="okbox">Tidak ada keputusan merah hari ini. Owner cukup pantau.</div>') +
      (yel.length ? '<div class="warnbox"><b>PIC / Head yang kerjakan</b> — bukan Owner.' + yel.map(function (x) { return '<div style="margin-top:6px">' + esc(x.t) + " · " + esc(x.d) + "</div>"; }).join("") + "</div>" : "") +
      '<div class="grid-3"><div class="card"><div class="label">Omzet 30 hari</div><div class="metric">' + rp(cr) + '</div><div class="small">' + (g == null ? "—" : (g >= 0 ? "+" : "") + g.toFixed(1) + "% vs 30 hari lalu") + '</div></div>' +
      '<div class="card"><div class="label">Waste 30 hari</div><div class="metric">' + rp(waste) + '</div></div>' +
      '<div class="card"><div class="label">Stok kritis / izin hari ini</div><div class="metric">' + crit.length + " · " + absen.length + "</div></div></div>" +
      '<div class="card"><div class="label">Jalur komando</div><p style="margin-top:6px"><b>Owner → Head / PIC → Pelaksana</b>. Bukan Owner → semua orang.</p></div>';

    $("sales").innerHTML = '<div class="card"><h2>Omzet + kas harian</h2>' +
      (canSales(role) ? "" : '<p class="small" style="color:var(--d)">Role Anda tidak menginput penjualan.</p>') +
      '<div class="form"><div><label>Tanggal</label><input id="sDate" type="date" value="' + today() + '"></div>' +
      '<div><label>Omzet total</label><input id="sRev" type="number"></div>' +
      '<div><label>Jumlah transaksi</label><input id="sTx" type="number"></div>' +
      '<div><label>Catatan</label><input id="sNotes"></div>' +
      '<div><label>Tunai</label><input id="sCash" type="number" value="0"></div>' +
      '<div><label>QRIS</label><input id="sQris" type="number" value="0"></div>' +
      '<div><label>Transfer</label><input id="sTf" type="number" value="0"></div>' +
      '<div><label>Selisih (otomatis)</label><input id="sGap" disabled></div></div>' +
      '<p class="small" id="sHint" style="margin-top:10px">Selisih = (tunai + QRIS + transfer) − omzet. Harus 0. Kalau tidak, PIC wajib jelaskan.</p>' +
      '<button class="primary" id="sSave" ' + (canSales(role) ? "" : "disabled") + '>Simpan penjualan</button><p class="small" id="sMsg"></p></div>' +
      '<div class="card"><h2>Data terbaru</h2><div style="overflow:auto"><table><thead><tr><th>Tanggal</th><th>Omzet</th><th>Tx</th><th>Tunai</th><th>QRIS</th><th>TF</th></tr></thead><tbody>' +
      (metrics.slice().reverse().slice(0, 40).map(function (x) {
        return "<tr><td>" + x.metric_date + "</td><td>" + rp(x.cash_revenue) + "</td><td>" + (x.transactions || 0) + "</td><td>" + (x.pay ? rp(x.pay.cash) : "—") + "</td><td>" + (x.pay ? rp(x.pay.qris) : "—") + "</td><td>" + (x.pay ? rp(x.pay.tf) : "—") + "</td></tr>";
      }).join("") || '<tr><td colspan="6" class="small">Belum ada data.</td></tr>') + "</tbody></table></div></div>";
    function gapHint() {
      if (!$("sRev")) return;
      var tot = Number($("sRev").value || 0), c = Number($("sCash").value || 0), q = Number($("sQris").value || 0), t = Number($("sTf").value || 0);
      var gap = c + q + t - tot;
      $("sGap").value = rp(gap);
      $("sHint").textContent = gap === 0 ? "Selisih 0. Aman." : ("Selisih " + rp(gap) + (Math.abs(gap) >= 50000 ? " — naik ke Owner." : " — Head/PIC wajib jelaskan."));
    }
    ["sRev", "sCash", "sQris", "sTf"].forEach(function (id) { if ($(id)) $(id).addEventListener("input", gapHint); });
    if ($("sSave")) $("sSave").addEventListener("click", async function () {
      if (!canSales(role)) return;
      $("sMsg").textContent = "Menyimpan…";
      var pay = "⟦PAY:cash=" + Number($("sCash").value || 0) + "|qris=" + Number($("sQris").value || 0) + "|tf=" + Number($("sTf").value || 0) + "⟧";
      var p = { metric_date: $("sDate").value, cash_revenue: Number($("sRev").value || 0), transactions: Number($("sTx").value || 0), notes: pay + ($("sNotes").value || ""), brand_id: BRAND };
      try {
        var q = await db.from("daily_metrics").select("id").eq("brand_id", BRAND).eq("metric_date", p.metric_date).maybeSingle();
        if (q.error) throw q.error;
        var rr = q.data ? await db.from("daily_metrics").update(p).eq("id", q.data.id) : await db.from("daily_metrics").insert(p);
        if (rr.error) throw rr.error;
        $("sMsg").textContent = "Tersimpan.";
        await loadAll(); render();
      } catch (e) { $("sMsg").textContent = e.message; }
    });

    $("ops").innerHTML = '<div class="warnbox"><b>Pagar wewenang (' + (ROLE_L[role] || role) + ')</b><br>Di atas batas tidak final — naik ke atasan. Owner tidak menerima pertanyaan yang sudah ada aturannya.</div>' +
      '<div class="card"><h2>Pembelian · waste · kompensasi</h2>' + (canOps(role) ? "" : '<p class="small" style="color:var(--d)">Bukan wewenang Anda.</p>') +
      '<div class="form"><div><label>Tanggal</label><input id="oDate" type="date" value="' + today() + '"></div>' +
      '<div><label>Jenis</label><select id="oCat"><option value="pembelian">Pembelian bahan</option><option value="waste">Waste</option><option value="kompensasi">Kompensasi</option><option value="lainnya">Lainnya</option></select></div>' +
      '<div><label>Nominal</label><input id="oAmt" type="number"></div>' +
      '<div><label>Keterangan + solusi</label><input id="oNotes" placeholder="Stok odeng minimum, order 50 pcs"></div></div>' +
      '<p class="small" id="oHint" style="margin-top:10px"></p>' +
      '<button class="primary" id="oSave" ' + (canOps(role) ? "" : "disabled") + '>Simpan</button><p class="small" id="oMsg"></p></div>' +
      '<div class="card"><h2>Riwayat</h2><div style="overflow:auto"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Nominal</th><th>Status</th><th>Ket</th></tr></thead><tbody>' +
      (expenses.slice(0, 50).map(function (x) {
        return "<tr><td>" + x.expense_date + "</td><td>" + (CAT[x.category] || x.category) + "</td><td>" + rp(x.amount) + "</td><td>" + (x.status === "pending_approval" ? "Menunggu" : x.status === "approved" ? "Disetujui" : x.status === "rejected" ? "Ditolak" : "Tercatat") + "</td><td>" + esc(x.displayNotes || "—") + "</td></tr>";
      }).join("") || '<tr><td colspan="5" class="small">Belum ada data.</td></tr>') + "</tbody></table></div></div>";
    function hint() {
      if (!$("oCat") || !$("oAmt") || !$("oHint") || !$("oSave")) return;
      var d = decide(role, $("oCat").value, Number($("oAmt").value || 0));
      $("oHint").textContent = d.msg;
      $("oSave").textContent = d.status === "pending_approval" ? "Ajukan ke atasan" : "Simpan";
    }
    if ($("oAmt")) { $("oAmt").addEventListener("input", hint); $("oCat").addEventListener("change", hint); }
    if ($("oSave")) $("oSave").addEventListener("click", async function () {
      if (!canOps(role)) return;
      var d = decide(role, $("oCat").value, Number($("oAmt").value || 0));
      $("oMsg").textContent = "Menyimpan…";
      try {
        var r = await db.from("expenses").insert({ brand_id: BRAND, expense_date: $("oDate").value, category: $("oCat").value, amount: Number($("oAmt").value || 0), notes: wrap(d.status, $("oNotes").value || "") });
        if (r.error) throw r.error;
        $("oMsg").textContent = d.status === "pending_approval" ? "Diajukan ke atasan. Belum final." : "Tercatat.";
        await loadAll(); render();
      } catch (e) { $("oMsg").textContent = e.message; }
    });

    $("stok").innerHTML = '<div class="card"><h2>PAR stock</h2><p class="small">Bukan “kalau habis baru beli”. Sampai minimum → PIC order angka Order.</p>' +
      (canStock(role) ? "" : '<p class="small" style="color:var(--d)">Hanya PIC / Head / Owner yang mengubah stok.</p>') +
      '<div style="overflow:auto;margin-top:10px"><table><thead><tr><th>Bahan</th><th>Qty</th><th>Min</th><th>Order</th><th>Status</th><th></th></tr></thead><tbody>' +
      (stock.map(function (p) {
        var lv = stockLv(p);
        var lab = lv === "ok" ? '<span class="chip g">Aman</span>' : lv === "order" ? '<span class="chip y">Order ' + p.order + "</span>" : '<span class="chip r">Kritis</span>';
        return "<tr><td>" + esc(p.name) + "</td><td><input data-qty=\"" + p.id + "\" type=\"number\" value=\"" + p.qty + "\" style=\"width:88px;min-height:36px;padding:6px\"></td><td>" + p.min + "</td><td>" + p.order + " " + esc(p.unit) + "</td><td>" + lab + "</td><td>" + (canStock(role) ? '<button class="primary" data-stk="' + p.id + '">Simpan</button>' : "") + "</td></tr>";
      }).join("") || '<tr><td colspan="6" class="small">Belum ada PAR. Login Owner akan menanam daftar awal.</td></tr>') +
      "</tbody></table></div><p class=\"small\" id=\"stkMsg\"></p></div>";
    document.querySelectorAll("[data-stk]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var id = b.getAttribute("data-stk");
        var inp = document.querySelector('[data-qty="' + id + '"]');
        $("stkMsg").textContent = "Menyimpan…";
        var u = await db.from("products").update({ selling_price: Number(inp.value || 0) }).eq("id", id);
        $("stkMsg").textContent = u.error ? u.error.message : "Stok diperbarui.";
        await loadAll(); render();
      });
    });

    function boxList(arr, id) {
      return arr.map(function (t, i) { return '<label class="check"><input type="checkbox" data-ck="' + id + '" data-i="' + i + '"> ' + esc(t) + "</label>"; }).join("");
    }
    var shifts = social.filter(function (x) { return x.platform === "HASNARIA_SHIFT"; });
    $("shift").innerHTML = '<div class="card"><h2>Ritme harian</h2><p class="small">08.30 buka persiapan · 09.00 buka · 14.30 serah · 20.30 tutup. Tidak ada “hari ini harus ngapain?”.</p></div>' +
      '<div class="grid-3"><div class="card"><h2>Opening</h2>' + boxList(OPENING, "OPENING") + '<button class="primary" id="svOpen" style="margin-top:10px;width:100%">Simpan opening</button></div>' +
      '<div class="card"><h2>Handover</h2>' + boxList(HANDOVER, "HANDOVER") + '<button class="primary" id="svHand" style="margin-top:10px;width:100%">Simpan serah</button></div>' +
      '<div class="card"><h2>Closing</h2>' + boxList(CLOSING, "CLOSING") + '<button class="primary" id="svClose" style="margin-top:10px;width:100%">Simpan closing</button></div></div>' +
      '<p class="small" id="shMsg"></p><div class="card"><h2>Tercatat</h2>' +
      (shifts.slice(0, 12).map(function (x) { return '<div class="small" style="padding:6px 0;border-bottom:1px solid var(--bd)">' + esc(x.content_title) + " · " + x.views + "/" + x.likes + "</div>"; }).join("") || '<p class="small">Belum ada checklist tersimpan.</p>') + "</div>";
    async function saveCk(type, total) {
      var done = document.querySelectorAll('[data-ck="' + type + '"]:checked').length;
      $("shMsg").textContent = "Menyimpan…";
      var r = await db.from("social_contents").insert({
        brand_id: BRAND, posted_at: today(), platform: "HASNARIA_SHIFT",
        content_title: type + "|" + today() + "|" + (type === "HANDOVER" ? "siang" : type === "CLOSING" ? "malam" : "pagi"),
        views: done, likes: total, comments: 0, shares: 0, saves: done >= total ? 1 : 0, attributed_transactions: 0
      });
      $("shMsg").textContent = r.error ? r.error.message : (type + " tersimpan (" + done + "/" + total + ").");
      await loadAll(); render();
    }
    if ($("svOpen")) $("svOpen").addEventListener("click", function () { saveCk("OPENING", OPENING.length); });
    if ($("svHand")) $("svHand").addEventListener("click", function () { saveCk("HANDOVER", HANDOVER.length); });
    if ($("svClose")) $("svClose").addEventListener("click", function () { saveCk("CLOSING", CLOSING.length); });

    var posts = social.filter(function (x) { return x.platform !== "HASNARIA_HR" && x.platform !== "HASNARIA_SHIFT" && x.platform !== "roster"; });
    $("social").innerHTML = '<div class="card"><h2>Kalender konten</h2><p class="small">Hook: Pulang? Jangan langsung pulang. Positioning: Enak · Nyaman · Hemat. Satu campaign per bulan.</p><table><thead><tr><th>Hari</th><th>Tema</th></tr></thead><tbody>' +
      CAL.map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<div class="card"><h2>Input performa</h2>' + (canSoc(role) ? "" : '<p class="small" style="color:var(--d)">Hanya Marketing / Head / Owner.</p>') +
      '<div class="form"><div><label>Tanggal</label><input id="cDate" type="date" value="' + today() + '"></div>' +
      '<div><label>Platform</label><select id="cPlat"><option>Instagram</option><option>TikTok</option></select></div>' +
      '<div style="grid-column:1/-1"><label>Judul</label><input id="cTitle"></div>' +
      '<div><label>Views</label><input id="cViews" type="number" value="0"></div>' +
      '<div><label>Likes</label><input id="cLikes" type="number" value="0"></div></div>' +
      '<br><button class="primary" id="cSave" ' + (canSoc(role) ? "" : "disabled") + '>Simpan konten</button><p class="small" id="cMsg"></p></div>' +
      '<div class="card"><h2>Konten</h2>' + (posts.slice(0, 20).map(function (x) { return '<div class="small" style="padding:6px 0;border-bottom:1px solid var(--bd)">' + esc(x.posted_at) + " · " + esc(x.platform) + " · " + esc(x.content_title) + " · " + (x.views || 0) + " views</div>"; }).join("") || '<p class="small">Belum ada konten.</p>') + "</div>";
    if ($("cSave")) $("cSave").addEventListener("click", async function () {
      if (!canSoc(role)) return;
      $("cMsg").textContent = "Menyimpan…";
      try {
        var r = await db.from("social_contents").insert({ brand_id: BRAND, posted_at: $("cDate").value, platform: $("cPlat").value, content_title: $("cTitle").value, views: Number($("cViews").value || 0), likes: Number($("cLikes").value || 0), comments: 0, shares: 0, saves: 0, attributed_transactions: 0 });
        if (r.error) throw r.error;
        $("cMsg").textContent = "Tersimpan.";
        await loadAll(); render();
      } catch (e) { $("cMsg").textContent = e.message; }
    });

    var pending = expenses.filter(function (x) { return x.status === "pending_approval"; });
    $("approval").innerHTML = '<div class="card"><h2>Keputusan yang naik</h2><p class="small" style="margin-bottom:10px">Makin sedikit yang sampai ke sini, makin sehat delegasi. Yang hijau tidak boleh muncul di sini.</p>' +
      (pending.length ? pending.map(function (x) {
        var ok = canApproveRow(role, x.category, x.amount);
        return '<div class="pend"><b>' + (CAT[x.category] || x.category) + " · " + rp(x.amount) + '</b><div class="small">' + x.expense_date + " · " + esc(x.displayNotes || "—") + '</div><div style="margin-top:8px">' +
          (ok ? '<button class="primary" data-ok="' + x.id + '">Setujui</button> <button data-no="' + x.id + '">Tolak</button>' : '<span class="small">Di luar wewenang Anda — biarkan Owner.</span>') +
          "</div></div>";
      }).join("") : '<div class="okbox">Tidak ada antrean. Operasional berjalan di bawah.</div>') + "</div>";
    document.querySelectorAll("[data-ok]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var row = expenses.find(function (x) { return x.id === b.getAttribute("data-ok"); });
        await db.from("expenses").update({ notes: wrap("approved", row.displayNotes) }).eq("id", row.id);
        await loadAll(); render();
      });
    });
    document.querySelectorAll("[data-no]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var row = expenses.find(function (x) { return x.id === b.getAttribute("data-no"); });
        await db.from("expenses").update({ notes: wrap("rejected", row.displayNotes) }).eq("id", row.id);
        await loadAll(); render();
      });
    });

    var leaves = social.filter(function (x) { return x.platform === "HASNARIA_HR"; });
    $("team").innerHTML = '<div class="card"><h2>Tim & wewenang</h2><p class="small" style="margin-bottom:10px">User baru = menunggu. Karyawan tidak menjadikan Owner sebagai supervisor.</p><table><thead><tr><th>Nama</th><th>Email</th><th>Role</th></tr></thead><tbody>' +
      roster.map(function (m) {
        return "<tr><td>" + esc(m.name) + (m.userId === me.userId ? " (Anda)" : "") + "</td><td>" + esc(m.email) + '</td><td><select data-user="' + m.userId + '" ' + (m.userId === me.userId ? "disabled" : "") + ">" +
          Object.keys(ROLE_L).map(function (rr) { return '<option value="' + rr + '" ' + (m.role === rr ? "selected" : "") + ">" + ROLE_L[rr] + "</option>"; }).join("") + "</select></td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="card"><h2>Izin — kategori, bukan cerita</h2><p class="small">A Cuti · B Darurat · C Sakit · D Tidak memenuhi. PIC tidak menilai “saya percaya atau tidak”. Masuk kategori mana berdasarkan bukti.</p>' +
      (canOps(role) || canTeam(role) ? '<div class="form"><div><label>Nama</label><input id="lzName"></div><div><label>Tanggal</label><input id="lzDate" type="date" value="' + today() + '"></div><div><label>Kategori</label><select id="lzCat"><option value="A">A · Cuti</option><option value="B">B · Darurat</option><option value="C">C · Sakit</option><option value="D">D · Tidak memenuhi</option></select></div><div><label>Status</label><select id="lzSt"><option value="pending">Menunggu Head</option><option value="ok">Disetujui</option><option value="tolak">Ditolak</option></select></div></div><br><button class="primary" id="lzSave">Catat izin</button><p class="small" id="lzMsg"></p>' : "") +
      '<table style="margin-top:12px"><thead><tr><th>Tanggal</th><th>Nama</th><th>Kat</th><th>Status</th><th></th></tr></thead><tbody>' +
      (leaves.map(function (x) {
        var p = (x.content_title || "").split("|");
        var st = p[4] || "";
        var btns = (canOps(role) || canTeam(role)) && st === "pending"
          ? '<button class="primary" data-lzok="' + x.id + '">Setujui</button> <button data-lzno="' + x.id + '">Tolak</button>'
          : "";
        return "<tr><td>" + esc(p[3] || x.posted_at) + "</td><td>" + esc(p[1] || "") + "</td><td>" + esc(p[2] || "") + "</td><td>" + esc(st) + "</td><td>" + btns + "</td></tr>";
      }).join("") || '<tr><td colspan="5" class="small">Belum ada izin.</td></tr>') +
      "</tbody></table></div>";
    document.querySelectorAll("[data-user]").forEach(function (sel) {
      sel.addEventListener("change", async function () {
        var m = roster.find(function (x) { return x.userId === sel.getAttribute("data-user"); });
        m.role = sel.value;
        await upsertMember(m);
        await loadRoster();
        render();
      });
    });
    if ($("lzSave")) $("lzSave").addEventListener("click", async function () {
      $("lzMsg").textContent = "Menyimpan…";
      var title = "IZIN|" + ($("lzName").value || "—") + "|" + $("lzCat").value + "|" + $("lzDate").value + "|" + $("lzSt").value;
      var r = await db.from("social_contents").insert({ brand_id: BRAND, posted_at: $("lzDate").value, platform: "HASNARIA_HR", content_title: title, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, attributed_transactions: 0 });
      $("lzMsg").textContent = r.error ? r.error.message : "Izin tercatat.";
      await loadAll(); render();
    });
    async function setLz(id, st) {
      var row = leaves.find(function (x) { return x.id === id; });
      if (!row) return;
      var p = (row.content_title || "").split("|");
      var title = "IZIN|" + (p[1] || "—") + "|" + (p[2] || "A") + "|" + (p[3] || today()) + "|" + st;
      await db.from("social_contents").update({ content_title: title }).eq("id", id);
      await loadAll(); render();
    }
    document.querySelectorAll("[data-lzok]").forEach(function (b) { b.addEventListener("click", function () { setLz(b.getAttribute("data-lzok"), "ok"); }); });
    document.querySelectorAll("[data-lzno]").forEach(function (b) { b.addEventListener("click", function () { setLz(b.getAttribute("data-lzno"), "tolak"); }); });

    $("sistem").innerHTML =
      '<div class="card"><h2>Piramida & jalur komando</h2><p>Owner memegang strategi + kontrol + keputusan luar biasa. Bukan shift, bukan stok harian, bukan posting rutin.</p><p style="margin-top:8px"><b>Owner → Head / PIC → Pelaksana</b></p><p class="small" style="margin-top:8px">Level 1 karyawan boleh putuskan. Level 2 PIC/Head. Level 3 hanya uang besar, reputasi, kebijakan, fraud, PHK.</p></div>' +
      '<div class="card"><h2>Matriks wewenang</h2><table><thead><tr><th>Keputusan</th><th>PIC</th><th>Head</th><th>Owner</th></tr></thead><tbody>' +
      [["Tukar shift sesuai aturan","Boleh","Setujui","Laporan"],["Checklist harian","Jalankan","Pastikan","Pantau"],["Pembelian PAR","Usul","≤ Rp1,5jt","Di atas"],["Kompensasi","≤ Rp15rb","≤ Rp50rb","Di atas"],["Ganti orang tidak masuk","Lapor","Putuskan","Laporan"],["Ubah harga / menu","Tidak","Usul","Putuskan"],["Promo baru","Tidak","Koordinasi","Approve"],["Izin A/B/C","Ajukan","Putuskan","Laporan"],["Izin D / SP / PHK / fraud","Lapor","Rekomendasi","Putuskan"]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      '<div class="card"><h2>Jobdesk</h2><div class="grid-2">' +
      [["Owner","Target, harga, menu, ekspansi. 15 menit dashboard per hari. Hanya putusan merah."],["Head of Store","Warung berjalan: orang, stok, kas, komplain biasa. Lapor Owner yang merah."],["PIC Shift","Opening, kas, stok shift, kompensasi kecil, handover, closing."],["Pelaksana","Bahan, tamu, kebersihan. Tukar shift lewat aturan, bukan Owner."],["Marketing","Kalender 7 hari. 1 campaign/bulan. Jangkauan → masuk → beli → ulang."]].map(function (x) { return '<div><b>' + x[0] + "</b><div class=\"small\">" + x[1] + "</div></div>"; }).join("") +
      "</div></div>" +
      '<div class="card"><h2>Eskalasi</h2><table><thead><tr><th>Masalah</th><th>Level</th><th>Siapa</th></tr></thead><tbody>' +
      [["Gelas habis (ada cadangan)","<span class='chip g'>Hijau</span>","Pelaksana"],["Stok menipis sampai min","<span class='chip y'>Kuning</span>","PIC order PAR"],["Refund kecil","<span class='chip y'>Kuning</span>","PIC / Head sesuai batas"],["Karyawan tidak masuk","<span class='chip y'>Kuning</span>","Head ganti orang"],["Selisih kas < Rp50rb","<span class='chip y'>Kuning</span>","Head jelaskan"],["Selisih kas ≥ Rp50rb","<span class='chip r'>Merah</span>","Owner"],["Fraud / PHK / ubah harga","<span class='chip r'>Merah</span>","Owner"]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      '<div class="card"><h2>Keluarkan dari kepala Owner</h2><p class="small">Kalau Anda memutuskan hal yang sama dua kali, itu belum menjadi aturan.</p><ul style="margin:10px 0 0 18px;font-size:13px"><li>Siapa ganti shift</li><li>Kapan beli bahan (PAR)</li><li>Refund di bawah Rp50.000</li><li>Posting harian (kalender)</li><li>Komplain kecil</li><li>Pembelian di bawah Rp1,5 juta</li></ul></div>' +
      '<div class="card"><h2>5 aturan emas</h2><p>1. Masalah diselesaikan di level terendah yang mampu.</p><p>2. Yang diberi tanggung jawab harus diberi wewenang.</p><p>3. Owner tidak memutuskan hal yang sama dua kali.</p><p>4. Laporan membawa solusi.</p><p>5. Yang luar biasa naik. Yang rutin tetap di bawah.</p></div>' +
      '<div class="card"><h2>KPI</h2><p class="small">Owner: omzet vs target, jumlah putusan merah turun. Head: stok kritis 0, selisih kas 0. PIC: checklist lengkap. Marketing: 7/7 kalender.</p></div>' +
      '<div class="card"><h2>Ritme Owner</h2><p>Setiap hari 15 menit: dashboard. Setiap minggu 60 menit: 3 masalah terbesar. Setiap bulan 2–3 jam: apakah bisnis semakin sehat — bukan “karyawan A kenapa”.</p></div>' +
      '<div class="card"><h2>Menu — data, bukan feeling</h2><table><thead><tr><th>Tingkatan</th><th>Maksud</th></tr></thead><tbody>' +
      [["HERO","Wajib tersedia. Wajah Hasnaria."],["PROFIT","Margin bagus. Jaga stok."],["TRAFFIC","Murah, menarik orang datang."],["SUPPORT","Pelengkap."],["EVALUATION","Penjualan rendah atau merepotkan — tinjau."]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      '<div class="card"><h2>Pengalaman tamu</h2><p class="small">Lihat → tertarik → masuk → nyaman → makan → worth it → ingin kembali.</p><table><thead><tr><th>Saat</th><th>Standar</th></tr></thead><tbody>' +
      [["Datang","Disambut"],["Order","Dikonfirmasi"],["Menunggu","Ada standar waktu"],["Selesai","Dipastikan lengkap"],["Pulang","Closing interaction"]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("") +
      "</tbody></table></div>";
  }

  async function enter(user) {
    try {
      try { localStorage.removeItem("hasnaria_guest"); } catch (e) {}
      await bootstrap(user);
      if (role === "pending") {
        $("pendingEmail").textContent = user.email || "";
        show("pending");
        return;
      }
      await loadAll();
      show("app");
      render();
    } catch (e) {
      setAuthMessage("Gagal memuat: " + (e && e.message ? e.message : e));
      show("auth");
    }
  }
  async function login() {
    setAuthMessage("Sedang masuk…");
    var r = await db.auth.signInWithPassword({ email: ($("email").value || "").trim(), password: $("password").value || "" });
    if (r.error) setAuthMessage(r.error.message);
    else await enter(r.data.user);
  }
  async function signup() {
    if ((($("password").value || "").length) < 6) { setAuthMessage("Password minimal 6 karakter."); return; }
    setAuthMessage("Membuat akun…");
    var r = await db.auth.signUp({ email: ($("email").value || "").trim(), password: $("password").value, options: { emailRedirectTo: location.origin } });
    if (r.error) setAuthMessage(r.error.message);
    else if (r.data.session) await enter(r.data.user);
    else setAuthMessage("Akun dibuat. Cek email, atau masuk Google.");
  }

  waitDb().then(function () {
    var a = $("googleBtn");
    if (a) a.setAttribute("href", window.hasnariaGoogleHref());
    if ($("loginBtn")) $("loginBtn").addEventListener("click", login);
    if ($("signupBtn")) $("signupBtn").addEventListener("click", signup);
    if ($("logoutBtn")) $("logoutBtn").addEventListener("click", function () { db.auth.signOut(); location.reload(); });
    if ($("pendingOut")) $("pendingOut").addEventListener("click", function () { db.auth.signOut(); location.reload(); });
    if ($("password")) $("password").addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
    db.auth.getSession().then(function (x) {
      if (x.data && x.data.session) enter(x.data.session.user);
    });
    db.auth.onAuthStateChange(function (ev, sess) {
      if (ev === "SIGNED_IN" && sess) enter(sess.user);
    });
  }).catch(function (e) { setAuthMessage(e.message); });
})();
