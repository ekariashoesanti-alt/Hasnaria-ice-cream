'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const stock=read('stock-control-v3.js');
const legacy=read('stock-reconcile-v2.js');
const opener=read('stock-monitor.js');
const bridge=read('stock-v3-runtime-fix.js');
const range=(a,b)=>{
  const start=stock.indexOf(a);
  const end=stock.indexOf(b,start);
  assert.ok(start>=0&&end>start,a+' -> '+b);
  return stock.slice(start,end);
};
test('legacy Stok v2 can never overwrite canonical v3 after script or on navigation',()=>{
  assert.match(legacy,/function canonicalOwnsStock\(\)/);
  assert.match(legacy,/if\(canonicalOwnsStock\(\)\)return; var host/);
  assert.match(legacy,/if \(host\.__srRendering \|\| !active\(\) \|\| canonicalOwnsStock\(\)\) return/);
  assert.match(opener,/if\(window\.__HASNARIA_STOCK_V3_RUNTIME_FIX\)/);
  assert.match(opener,/window\.__HASNARIA_STOCK_WAKE/);
  assert.match(bridge,/window\.__HASNARIA_STOCK_WAKE=wake/);
  assert.match(bridge,/getElementById\('hasnaria-stock-control-v3-loader'\)/);
  assert.match(bridge,/data-stock-v3-boot/);
});
test('opening Stok only waits for reconciliation and actual monthly end trend',()=>{
  const period=range('async function loadPeriodData(force)','async function loadLedger()');
  const base=range('async function loadBase()','function schedulePendingCommittedRefresh()');
  assert.match(base,/await request\('inventory_stock_reconciliation\?'/);
  assert.doesNotMatch(base,/var audit = await loadVerifiedAudit/);
  assert.match(base,/window\.requestIdleCallback\(auditRun/);
  assert.match(period,/await request\('ui_stock_month_end_trend_v1\?' \+ tq\)/);
  assert.doesNotMatch(period,/Promise\.all\(\[/);
  assert.doesNotMatch(period,/request\('purchase_inventory_bridge\?|request\('ui_stock_activity_chart_v1\?|loadPendingUploads\(seq\),/);
  assert.doesNotMatch(period,/loadMovingStatus\(S\.period\)/);
  assert.match(stock,/if\(!S\.auxLoaded&&!S\.auxLoading&&S\.modal==='position'\)scheduleAux\(seq\)/);
});
test('background reads do not rebuild both charts, while real data changes patch only one region',()=>{
  const render=range('function render() {','function stockDialogFocus(');
  assert.match(render,/if\(stable\)\{/);
  assert.match(render,/previous\.kpis!==kpiHtml/);
  assert.match(render,/previous\.left!==trendHtml/);
  assert.match(render,/previous\.right!==comparisonHtml/);
  assert.match(render,/shell\.querySelector\('\.sc22-trend-panel'\)\.outerHTML=trendHtml/);
  assert.match(render,/shell\.__sc3LastHtml!==html/);
  assert.match(stock,/mount\(false\);/);
  assert.doesNotMatch(stock,/setTimeout\(function \(\) \{ watch\(\); mount\(true\); \}, 0\)/);
  assert.match(stock,/if\(S\.pendingStockRefresh\)refreshCommittedData\(\)/);
  assert.match(stock,/else mount\(false\)/);
});
test('version pins, KPI source and data integrity remain untouched',()=>{
  assert.match(stock,/stock-control-v3\.css\?v=32/);
  assert.match(bridge,/stock-control-v3\.js\?v=38/);
  assert.match(opener,/stock-control-v3\.js\?v=38/);
  for(const x of ['inventory_stock_reconciliation','ui_stock_month_end_trend_v1','inventory_valuation_verified_summary','Nilai Stok (Parsial)','Stok Saat Ini vs Batas Aman']){
    assert.ok(stock.includes(x),x);
  }
  assert.match(read('scripts/vercel-build-check.js'),/stock-first-paint-no-flicker-v1\.test\.js/);
});
