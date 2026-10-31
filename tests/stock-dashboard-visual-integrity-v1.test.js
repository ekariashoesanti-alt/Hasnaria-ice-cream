'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('stock-control-v3.js');
const css=read('stock-control-v3.css');
const overrides=css.slice(css.indexOf('/* Stock visual integrity 2026-10-30.'));
const stockSnippet=(start,end)=>{const a=js.indexOf(start),b=js.indexOf(end,a+1);assert.ok(a>=0&&b>a,start+' / '+end);return js.slice(a,b)};

test('keeps 4 KPIs and precisely two requested responsive panels',()=>{
  assert.match(js,/Ringkasan empat KPI stok/);
  const render=js.slice(js.indexOf('function render() {'),js.indexOf('function stockDialogFocus(',js.indexOf('function render() {')));
  assert.match(render,/sc22-dual/);
  assert.match(render,/sc22-trend-panel/);
  assert.match(render,/sc22-compare-panel/);
  assert.doesNotMatch(render,/sc12-status-strip|sc6-top-panel|sc15-moving-panel|sc6-category-panel/);
  assert.match(css,/#stok \.sc22-dual/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});

test('prevents fixed-height clipping and keeps SVG labels/legend/rows visible',()=>{
  assert.ok(overrides.length>5500,'scoped override exists');
  assert.match(overrides,/height:auto!important;min-height:100%!important;max-height:none!important/);
  assert.match(overrides,/\.sc6-dashboard\{height:auto!important;min-height:0!important;overflow:visible!important\}/);
  assert.match(overrides,/\.sc6-grid \.sc5-panel\{/);
  assert.match(overrides,/\.sc8-kpi\{[\s\S]*?max-height:none!important/);
  assert.match(overrides,/\.sc8-kpi \.sc8-kpi-value\{[\s\S]*?text-overflow:clip!important/);
  assert.match(css,/#stok \.sc21-comparison-svg/);
  assert.match(overrides,/\.sc13-donut-visual\{/);
  assert.match(overrides,/\.sc13-category-legend\{[\s\S]*?overflow:visible!important/);
  assert.match(overrides,/\.sc14-low-list\{[\s\S]*?overflow:visible!important/);
  assert.match(overrides,/\.sc15-moving-panel\{[\s\S]*?overflow:visible!important/);
  assert.match(overrides,/@media\(max-width:700px\)/);
  assert.match(overrides,/@media\(max-width:440px\)/);
  assert.match(js,/stock-control-v3\.css\?v=32/);
  for(const p of ['stock-monitor.js','stock-v3-runtime-fix.js'])assert.match(read(p),/stock-control-v3\.js\?v=38/);
});

test('verified valuation never falsely claims total stock; denominator consistent with backend',()=>{
  const src=stockSnippet('function stockKpiIcon(kind){','function activityName(type)');
  const rendered=vm.runInNewContext(src+';overviewKpis()',{
    S:{baseLoaded:true,items:[
      {ui_status:'ok'},{ui_status:'critical'},{ui_status:'order'},{ui_status:'untracked'}
    ],valuationLoading:false,valuationLoaded:true,
    valuation:{inventory_value:3163500,valued_items:1,inventory_items:198}},
    num:v=>Number(v)||0,
    fmt:v=>Number(v).toLocaleString('id-ID',{maximumFractionDigits:6}),
    esc:v=>String(v),
    stockMoney:n=>'Rp '+Number(n).toLocaleString('id-ID')
  });
  assert.match(rendered,/Nilai Stok \(Parsial\)/);
  assert.match(rendered,/Rp 3\.163\.500/);
  assert.match(rendered,/Biaya terverifikasi: 1 dari 198 SKU \(0,5%\)/);
  assert.match(rendered,/Kritis atau di bawah minimum/);
  assert.match(rendered,/Belum Opname Awal/);
  assert.doesNotMatch(rendered,/Nilai Stok Terverifikasi/);
  assert.match(js,/var valuationSkuCount=valuationReady\?num\(v\.inventory_items\):0/);
});

test('low-stock ranking never orders values of incompatible inventory units numerically',()=>{
  const src=stockSnippet('function lowestStockFive(){','function stockMovingPanel(){');
  const out=vm.runInNewContext(src+';lowestStockFive()',{
    S:{baseLoaded:true,items:[
      {item_name:'ALPHA GRAM',unit:'gram',system_qty:-408,min_qty:15,tracking_active:true},
      {item_name:'BETA PCS',unit:'pcs',system_qty:-7,min_qty:15,tracking_active:true},
      {item_name:'GAMMA UNIT',unit:'pcs',system_qty:0,min_qty:15,tracking_active:true},
      {item_name:'UNKNOWN',unit:'gram',system_qty:-999,tracking_active:false}
    ]},num:v=>Number(v)||0,fmt:v=>String(v),esc:v=>String(v)
  });
  assert.match(out,/ALPHA GRAM/);
  assert.match(out,/BETA PCS/);
  assert.match(out,/Prioritas risiko; satuan berbeda tidak dibandingkan/);
  assert.doesNotMatch(out,/UNKNOWN/);
  assert.match(js,/if\(String\(a\.unit\|\|''\)===String\(b\.unit\|\|''\)\)/);
});

test('FIFO does not present historical moving figures as complete October data',()=>{
  const src=stockSnippet('function stockMovingPanel(){','async function loadMovingStatus(period){');
  const out=vm.runInNewContext(src+';stockMovingPanel()',{
    S:{period:'2026-10',movingLoading:false,movingLoaded:true,movingError:'',
       salesLinkAudit:{sale_item_rows:1035,linked_sale_item_rows:0,unlinked_sale_item_rows:1035},
       movingRows:[{moving_status:'fast',latest_sale_date:'2026-09-30'}]},
    num:v=>Number(v)||0,fmt:v=>Number(v).toLocaleString('id-ID'),
    esc:v=>String(v),monthLabel:()=> 'Oktober 2026'
  });
  assert.match(out,/Belum dapat dihitung untuk Oktober 2026/);
  assert.match(out,/1\.035 baris penjualan belum terhubung/);
  assert.doesNotMatch(out,/Fast Moving/);
});

test('format no longer silently discards stock fractional precision over two places',()=>{
  const source=stockSnippet('function fmt(value) {','function signed(value) {');
  const out=vm.runInNewContext(source+';fmt(0.125)',{});
  assert.equal(out,'0,125');
  assert.match(source,/maximumFractionDigits: 6/);
});

test('layout patch is purely presentational and all changes leave stock tables unwritten',()=>{
  assert.doesNotMatch(overrides,/url\(https?:\/\//i);
  const src=stockSnippet('function overviewKpis() {','function activityName(type)');
  assert.doesNotMatch(src,/\brpc\(/);
  assert.doesNotMatch(src,/request\(/);
  assert.match(read('scripts/vercel-build-check.js'),/stock-dashboard-visual-integrity-v1\.test\.js/);
});
