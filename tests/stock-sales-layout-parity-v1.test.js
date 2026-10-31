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

test('header has same two-row hierarchy as Sales: heading/actions then month/filters',()=>{
 const header=stockJS.slice(stockJS.indexOf('function renderHeader() {'),stockJS.indexOf('function renderFormula() {'));
 assert.match(header,/sc5-head sc7-head/);
 assert.match(header,/sc7-actions/);
 assert.match(header,/'<\/div><\/div><\/header><div class="sc5-head-filters sc7-tools sc23-period-row">'\+/);
 assert.match(header,/id="sc4Period"/);
 for(const action of ['upload-opname','position','opname','ledger','recipes','formula-audit','upload-purchase','refresh']){
  assert.ok(header.includes(action),'existing action kept: '+action);
 }
 assert.match(stockStyle,/>.sc23-period-row/);
 assert.match(stockStyle,/margin-right:auto!important/);
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
 assert.match(stockJS,/stock-control-v3\.css\?v=31/);
 for(const f of ['stock-monitor.js','stock-v3-runtime-fix.js']){
  assert.match(read(f),/stock-control-v3\.js\?v=37/);
 }
});
