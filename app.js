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
  var db, me = null, role = "pending", metrics = [], expenses = [], social = [], roster = [], stock = [], tab = "dashboard", busy = false, entering = false;
  try {
    var savedTab = sessionStorage.getItem("hasnaria_tab");
    if (savedTab) tab = savedTab;
  } catch (e) {}
