'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('stock-control-v3.js');
test('source purchase audit reads existing bridge by selected month and does not manufacture receipts',()=>{
  assert.match(js,/request\('purchase_inventory_bridge\?'\+purchaseImportQ\)/);
  assert.match(js,/purchase_date:'gte\.'\+month/);
  assert.match(js,/&purchase_date=lt\.'\+nextMonth/);
  assert.match(js,/Number\(x\.inventory_qty\)>0/);
  assert.match(js,/quantityMapped/);
  assert.match(js,/needsReview/);
  assert.match(js,/S\.purchaseImportEvidenceUnavailable=pair\[5\]===null/);
  const piece=js.slice(js.indexOf('var purchaseImportQ='),js.indexOf('loadMovingStatus(S.period)',js.indexOf('var purchaseImportQ=')));
  assert.doesNotMatch(piece,/method:\s*['"](?:POST|PATCH|PUT|DELETE)/i);
  assert.doesNotMatch(piece,/\binventory_movements\?|\binventory_purchase_log\?|\bpost.*receipt/i);
  assert.match(js,/Pembelian yang belum terbukti diterima tidak otomatis ditambahkan ke stok/);
});
test('new existing-data source label is disclosed but not equated to received stock',()=>{
  assert.match(js,/data Pembelian impor/);
  assert.match(js,/jumlah\+SKU terpetakan/);
  assert.match(js,/perlu verifikasi/);
  assert.match(js,/purchaseImportEvidence = null/);
  assert.match(js,/stock-control-v3\.css\?v=28/);
  for(const f of ['stock-monitor.js','stock-v3-runtime-fix.js'])assert.match(read(f),/stock-control-v3\.js\?v=34/);
  assert.match(read('scripts/vercel-build-check.js'),/stock-purchase-existing-gap-v1\.test\.js/);
});
