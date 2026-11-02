'use strict';
const {test,expect}=require('@playwright/test');
const BASE=process.env.HASNARIA_BASE_URL;
function mockMarkup(){
const card=(a,b,c)=>'<article class="sc5-kpi sc8-kpi"><div class="sc8-kpi-copy"><span class="sc8-kpi-label">'+a+'</span><strong class="sc8-kpi-value">'+b+'</strong><small class="sc8-kpi-note">'+c+'</small></div></article>';
const leftSvg='<svg class="sc22-plot-svg" viewBox="0 0 740 269"><line x1="65" x2="682" y1="223" y2="223" stroke="#ddd"/><circle cx="490" cy="96" r="6" fill="#e8a64a"/><text x="490" y="80">155,5</text><text x="65" y="251">Feb 26</text><text x="682" y="251">Nov</text></svg>';
const rightSvg='<svg class="sc21-comparison-svg" viewBox="0 0 925 262"><text x="18" y="51">AYAM KATSU</text><text x="18" y="86">ICE CREAM POTONG TELLER</text><rect x="247" y="51" width="245" height="8" fill="#168159"/><rect x="247" y="86" width="300" height="8" fill="#e9b85d"/><text x="702" y="53">Saat ini: 12</text><text x="702" y="85">Aman: 7</text></svg>';
return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}#app>main.wrap{margin-left:260px;width:calc(100% - 260px);max-width:none;padding:14px;background:#f7faf8}</style><link rel="stylesheet" href="'+BASE+'/owner-one-view.css?v=12"><link rel="stylesheet" href="'+BASE+'/stock-control-v3.css?v=34"></head><body class="hasnaria-owner-erp"><div id="app"><main class="wrap"><section id="stok"><div class="sc3-shell">'+
'<header class="sc5-head sc7-head"><div class="sc5-head-copy"><span class="sc5-eyebrow">STOK</span><h2>Dashboard Stok</h2><p>Persediaan &amp; aktivitas terkini</p></div><div class="sc5-head-right sc7-head-right"><div class="sc7-actions">'+['Upload Excel Stok','Detail Stok','Input Opname'].map(x=>'<button>'+x+'</button>').join('')+'</div></div></header>'+
'<div class="sc23-period-row"><label>Bulan<select><option>November 2026</option></select></label>'+['Ledger Periode','Cek Resep Produk','Periksa Hitungan','Upload Pembelian','↻'].map(x=>'<button>'+x+'</button>').join('')+'</div>'+
'<div class="sc8-kpis">'+card('Total Item (SKU)','198','Item terdaftar di backend')+card('Nilai Stok (Parsial)','Rp 3,16 jt','Biaya terverifikasi: 1 dari 198 SKU (0,5%)')+card('Item Stok Rendah','15','Kritis atau di bawah minimum')+card('Belum Opname Awal','157','Belum ada checkpoint awal')+'</div>'+
'<div class="sc22-dashboard"><div class="sc22-dual"><article class="sc5-panel sc22-trend-panel"><h3>↗ Tren Stok Akhir Bulanan</h3><div class="sc22-month-end"><div class="sc22-summary"><span>Saldo akhir terhitung · porsi</span><strong>155,5 <small>porsi</small></strong></div><div class="sc22-summary-note">Nov 2026 · 15 dari 48 SKU · data parsial, bukan stok fisik final</div><div class="sc22-plot">'+leftSvg+'</div><p class="sc22-chart-note">Total per bulan = jumlah saldo akhir SKU porsi yang punya opname, setelah pergerakan tercatat. Tanda — berarti belum dapat dihitung. Angka parsial tidak berarti seluruh transaksi sudah masuk.</p></div></article>'+
'<article class="sc5-panel sc22-compare-panel"><h3>▥ Stok Saat Ini vs Batas Aman</h3><div class="sc21-comparison"><div class="sc21-controls"><div class="sc21-legend"><span><i class="sc21-legend-current"></i>Saldo saat ini</span><span><i class="sc21-legend-safe"></i>Batas aman</span></div><label>Satuan<select><option>porsi (14 SKU)</option></select></label></div><div class="sc21-stat"><span>14 SKU dengan batas aman · porsi</span><span>Menampilkan 7–12 SKU <span class="sc21-page"><button>‹</button>2 / 3<button>›</button></span></span></div><div class="sc21-chart-frame">'+rightSvg+'</div><p class="sc21-foot">Stok saat ini = saldo sistem dari transaksi yang telah tercatat, bukan hasil hitung fisik terbaru. Batas aman = minimum per SKU yang tersimpan. Saldo negatif ditampilkan apa adanya. Hanya barang yang sudah opname dan memiliki batas minimum ditampilkan; angka ini bukan tren bulanan.</p></div></article></div></div></div></section></main></div></body></html>';
}
test('Desktop Stock at 100%: no vertical clipping or horizontal chart overflow',async({page})=>{
 for(const [width,height] of [[1708,800],[1440,900],[1280,760]]){
  await page.setViewportSize({width,height});await page.setContent(mockMarkup(),{waitUntil:'load'});
  const g=await page.evaluate(()=>{
   const el=s=>document.querySelector(s),box=s=>el(s).getBoundingClientRect();
   const section=el('#stok'),panel=box('.sc22-compare-panel'),chart=box('.sc21-comparison-svg'),frame=box('.sc21-chart-frame');
   return {viewport:[innerWidth,innerHeight],overflowY:section.scrollHeight-section.clientHeight,overflowX:section.scrollWidth-section.clientWidth,bodyX:document.body.scrollWidth-innerWidth,panelsBottom:Math.max(box('.sc22-compare-panel').bottom,box('.sc22-trend-panel').bottom),right:panel.right,chartRight:chart.right,frameRight:frame.right,notesBottom:box('.sc21-foot').bottom,kpi:box('.sc8-kpi').height,title:parseFloat(getComputedStyle(el('.sc7-head h2')).fontSize)};
  });
  expect(g.overflowY,JSON.stringify(g)).toBeLessThanOrEqual(3);
  expect(g.overflowX,JSON.stringify(g)).toBeLessThanOrEqual(3);
  expect(g.bodyX,JSON.stringify(g)).toBeLessThanOrEqual(3);
  expect(g.panelsBottom,JSON.stringify(g)).toBeLessThanOrEqual(height+2);
  expect(g.notesBottom,JSON.stringify(g)).toBeLessThanOrEqual(height+2);
  expect(g.right,JSON.stringify(g)).toBeLessThanOrEqual(width+2);
  expect(g.chartRight,JSON.stringify(g)).toBeLessThanOrEqual(g.frameRight+2);
  expect(g.kpi).toBeLessThanOrEqual(66);
  expect(g.title).toBeLessThanOrEqual(19);
 }
});
test('Short screens retain scrolling instead of clipping content',async({page})=>{
 await page.setViewportSize({width:1440,height:650});await page.setContent(mockMarkup(),{waitUntil:'load'});
 expect(await page.locator('#stok').evaluate(el=>getComputedStyle(el).overflowY)).toBe('auto');
});
