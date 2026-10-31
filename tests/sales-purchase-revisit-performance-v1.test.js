'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=x=>fs.readFileSync(x,'utf8');
const shell=read('owner-shell-guard.js');
const sales=read('sales-board.part4.js');
const purchase=read('purchase-finance-alignment-v1.js');
const app=read('app.js');
const runtime=read('xlsx-preload.js');
const salesStart=shell.indexOf('function ensureSales(){');
const salesEnd=shell.indexOf('function ensurePurchase(){',salesStart);
const purchaseStart=shell.indexOf('function ensurePurchase(){');
const purchaseEnd=shell.indexOf('function dispatchStock()',purchaseStart);
const salesLogic=shell.slice(salesStart,salesEnd);
const purchaseLogic=shell.slice(purchaseStart,purchaseEnd);
test('Sales Owner navigation reuses existing mount without forcing backend GETs',()=>{
 assert.match(salesLogic,/if\(h\.querySelector\('\.sale-board'\)\)/);
 assert.match(salesLogic,/window\.__HASNARIA_SALES_MOUNT\(\)/);
 assert.doesNotMatch(salesLogic,/window\.__hasnariaReloadSales\(\)/);
 assert.match(sales,/window\.__HASNARIA_SALES_MOUNT=mount/);
 assert.match(sales,/window\.__hasnariaReloadSales = function \(\)/); // Explicit refresh remains
});
test('Sales empty but fetched state does not trigger repeated 400 ms polling or API calls',()=>{
 assert.match(sales,/if \(!STATE\.fetched \|\| STATE\.error\) loadMetrics\(\)/);
 assert.doesNotMatch(sales,/if \(!STATE\.fetched \|\| STATE\.error \|\| !STATE\.rows\.length\) loadMetrics\(\)/);
 assert.match(sales,/if \(!STATE\.fetched && tries\+\+ < 80\)/);
 assert.match(sales,/if \(document\.getElementById\('sales'\) && !STATE\.fetched && !STATE\.loading/);
});
test('Purchase reentry keeps canonical dashboard and data without loading skeleton',()=>{
 assert.match(purchaseLogic,/h\.querySelector\('#paRoot\.pa-owner-single-render'\)&&h\.querySelector\('#purchaseFinanceAlignment'\)\)return/);
 assert.match(purchaseLogic,/data-purchase-pending/);
 assert.match(purchase,/if\(!force&&loadedPeriod===p&&loadedAt\)/);
 assert.match(purchase,/Date\.now\(\)-loadedAt>60000&&!syncing&&canSyncReport\(\)/);
 assert.match(purchase,/syncReport\(\)\.catch/);
 assert.match(purchase,/function resetData\(\)/); // User period changes still invalidate snapshot
 assert.match(purchase,/if\(e\.target\.id==='paPeriod'\)\{resetData\(\)/);
 assert.match(purchase,/hasnaria:purchase-imported/);
});
test('only navigation/performance changes; stock code and money source remain untouched',()=>{
 assert.match(read('stock-control-v3.js'),/ui_stock_month_end_trend_v1/);
 assert.match(read('stock-control-v3.js'),/inventory_stock_reconciliation/);
 assert.match(purchase,/get_purchase_control_period_v1/);
 assert.match(sales,/getTok\(\)/);
 assert.match(app,/owner-shell-guard\.js\?v=14/);
 assert.match(app,/sales-board\.js\?v=50/);
 assert.match(app,/xlsx-preload\.js\?v=29/);
 assert.match(runtime,/purchase-finance-alignment-v1\.js\?v=30/);
 assert.match(read('scripts/vercel-build-check.js'),/sales-purchase-revisit-performance-v1\.test\.js/);
});
