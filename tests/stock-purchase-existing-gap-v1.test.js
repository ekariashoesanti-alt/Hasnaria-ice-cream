'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('stock-control-v3.js');
test('monthly dashboard does not block on purchase imports or manufacture receipts',()=>{
 const period=js.slice(js.indexOf('async function loadPeriodData(force)'),js.indexOf('async function loadLedger()'));
 assert.match(period,/request\('ui_stock_month_end_trend_v1\?' \+ tq\)/);
 assert.doesNotMatch(period,/request\('purchase_inventory_bridge\?|request\('ui_stock_activity_chart_v1\?|loadPendingUploads\(/);
 assert.doesNotMatch(period,/method:\s*['"](?:POST|PATCH|PUT|DELETE)/i);
 assert.match(js,/Pembelian yang belum terbukti diterima tidak otomatis ditambahkan ke stok/);
});
test('purchase records remain separate from verified inventory movements',()=>{
  assert.match(js,/data Pembelian impor/);
  assert.match(js,/jumlah\+SKU terpetakan/);
  assert.match(js,/perlu verifikasi/);
  assert.match(js,/purchaseImportEvidence = null/);
  assert.match(js,/stock-control-v3\.css\?v=32/);
  for(const f of ['stock-monitor.js','stock-v3-runtime-fix.js'])assert.match(read(f),/stock-control-v3\.js\?v=38/);
  assert.match(read('scripts/vercel-build-check.js'),/stock-purchase-existing-gap-v1\.test\.js/);
});
