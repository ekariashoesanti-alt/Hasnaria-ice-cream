'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');
const stockJS=read('stock-control-v3.js');
const stockCSS=read('stock-control-v3.css');
const sales=read('sales-board.part4.js');
const stockStyle=stockCSS.slice(stockCSS.indexOf('/* HASNARIA 2026-10-31 / Sales'));
assert.ok(stockStyle.length>3500,'sales-aligned scoped stock styles present');

test('matches Sales page visual system without changing other tabs',()=>{
 for(const salesRule of ['.sb-wrap{background:#f4f7f5;border:1px solid #dfe9e4;border-radius:18px;padding:16px 20px',
  '.sb-head{display:flex','.sb-kpis{display:grid','.sb-card{background:#fff']){
   assert.ok(sales.includes(salesRule),salesRule);
 }
 assert.match(stockStyle,/\.sc3-shell:has\(\.sc22-dashboard\)\{/);
 assert.match(stockStyle,/background:#f4f7f5!important;border:1px solid #dfe9e4!important/);
 assert.match(stockStyle,/border-radius:18px!important/);
 assert.match(stockStyle,/padding:16px 20px 20px!important/);
 assert.match(stockStyle,/\.sc7-head h2\{[\s\S]*?font-size:22px!important/);
 assert.match(stockStyle,/\.sc22-dual>.sc5-panel\{[\s\S]*?border-radius:14px!important/);
 assert.doesNotMatch(stockStyle,/^#sales\b/m);
});

test('single-row Stock toolbar shows only period, Upload Data and refresh',()=>{
 const header=stockJS.slice(stockJS.indexOf('function renderHeader() {'),stockJS.indexOf('function renderUploadChoices()'));
 assert.match(header,/sc5-head sc7-head sc28-simple-head/);
 assert.match(header,/sc28-simple-tools/);
 assert.match(header,/id="sc4Period"/);
 assert.match(header,/data-sc4-modal="upload-data"/);
 assert.match(header,/data-sc3-action="refresh"/);
 for(const excluded of ['upload-opname','import-recipe','position','opname','ledger','recipes','formula-audit','sku-sim','upload-purchase']){
  assert.ok(!header.includes('data-sc4-action="'+excluded+'"')&&!header.includes('data-sc4-modal="'+excluded+'"'),
   'No extra Stock toolbar action: '+excluded);
 }
 const menu=stockJS.slice(stockJS.indexOf('function renderUploadChoices() {'),stockJS.indexOf('function renderFormula() {'));
 for(const upload of ['data-sc4-action="upload-opname"','data-sc4-action="import-recipe"']){
  assert.ok(menu.includes(upload),'Both upload routes present: '+upload);
 }
 assert.match(menu,/data-sc4-modal="recipes"/);
 assert.match(stockStyle,/\.sc28-simple-head/);
 assert.match(stockStyle,/\.sc28-upload-modal/);
});


test('four existing KPI values and chart computations are unchanged; KPI CSS is only compacted',()=>{
 const kpi=stockJS.slice(stockJS.indexOf('function overviewKpis() {'),stockJS.indexOf('function activityName(type)'));
 for(const label of ['Total Item (SKU)','Nilai Stok (Parsial)','Item Stok Rendah','Belum Opname Awal']){
  assert.ok(kpi.includes(label),label);
 }
 assert.match(stockStyle,/\.sc8-kpi-icon\{display:none!important\}/);
 assert.match(stockStyle,/\.sc8-kpi \.sc8-kpi-value\{[\s\S]*?overflow-wrap:anywhere!important/);
 assert.match(stockStyle,/\.sc8-kpi \.sc8-kpi-note\{[\s\S]*?white-space:normal!important/);
 const render=stockJS.slice(stockJS.indexOf('function render() {'),stockJS.indexOf('function stockDialogFocus(',stockJS.indexOf('function render() {')));
 assert.match(render,/overviewKpis\(\)/);
 assert.match(render,/monthlyStockEndInfographic\(\)/);
 assert.match(render,/stockSafetyInfographic\(\)/);
 assert.doesNotMatch(render,/lowestStockFive\(|renderSalesStockAudit\(/);
 assert.match(stockJS,/ui_stock_month_end_trend_v1/);
 assert.match(stockJS,/inventory_stock_reconciliation/);
});

test('responsive panels keep charts and data visible at narrower widths',()=>{
 assert.match(stockStyle,/\.sc22-dual\{[\s\S]*?grid-template-columns:minmax\(0,1\.25fr\) minmax\(0,1fr\)/);
 assert.match(stockStyle,/@media\(max-width:1050px\)/);
 assert.match(stockStyle,/@media\(max-width:900px\)/);
 assert.match(stockStyle,/@media\(max-width:640px\)/);
 assert.match(stockStyle,/\.sc21-chart-frame\{[\s\S]*?overflow-x:auto!important/);
 assert.match(stockStyle,/\.sc22-dual>.sc5-panel\{[\s\S]*?max-height:none!important/);
 assert.match(stockJS,/stock-control-v3\.css\?v=34/);
 for(const f of ['stock-monitor.js','stock-v3-runtime-fix.js']){
  assert.match(read(f),/stock-control-v3\.js\?v=39/);
 }
});


test('HSN-821: tested Stock one-view geometry is linked without mutating existing calculations',()=>{
 const index=read('index.html'),oneView=read('stock-oneview-hsn821.css');
 assert.match(index,/stock-oneview-hsn821\.css\?v=2/);
 assert.match(oneView,/@media \(min-width:901px\) and \(min-height:520px\)/);
 assert.match(oneView,/sc22-dual>.sc5-panel/);
 assert.match(oneView,/sc21-comparison-svg/);
 assert.match(oneView,/sc28-simple-head/);
 assert.match(oneView,/sc28-upload-btn/);
 assert.match(oneView,/:not\(:has\(\.sc4-modal\)\)/);
 assert.doesNotMatch(oneView,/#sales\b|#pembelian\b|#operasional\b|#dashboard\b/);
});

test('HSN-822: 100% browser zoom with 125-150% OS scaling keeps Stock compact',()=>{
 const css=read('stock-oneview-hsn821.css');
 const media='@media (min-width:901px) and (min-height:520px)';
 assert.equal(css.split(media).length-1,2,'base compact and header toolbar must share realistic breakpoint');
 assert.match(css,/@media \(min-width:901px\) and \(min-height:520px\) and \(max-height:660px\)/);
 assert.match(css,/sc22-plot-svg\{[^}]*max-height:100%!important/);
 assert.match(css,/sc21-comparison-svg\{[^}]*min-width:0!important/);
 assert.match(css,/sc22-chart-note\{[^}]*flex:0 0 auto!important/);
 assert.match(css,/sc21-foot\{[^}]*flex:0 0 auto!important/);
 assert.match(css,/sc3-shell>.sc7-head.sc28-simple-head/);
});
