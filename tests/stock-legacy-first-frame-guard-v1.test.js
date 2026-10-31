'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=x=>fs.readFileSync(x,'utf8');
const nav=source('owner-shell-guard.js');
const legacy=source('stock-reconcile-v2.js');
const monitor=source('stock-monitor.js');
const bridge=source('stock-v3-runtime-fix.js');
const shim=source('owner-finance-stock-v3.js');
const indexBuild=source('scripts/build-index-runtime.js');
test('Owner navigation claims the canonical Stock surface before any async legacy renderer can paint',()=>{
 const claim=nav.slice(nav.indexOf('function claimStockHost(){'),nav.indexOf('function setExecutiveFlag(',nav.indexOf('function claimStockHost(){')));
 assert.match(claim,/__HASNARIA_STOCK_OWNER_CLAIMED=true/);
 assert.match(claim,/data-stock-v3-boot/);
 assert.match(claim,/h\.replaceChildren\(boot\)/);
 assert.match(claim,/Dashboard Stok/);
 assert.match(nav,/setVisibility\(id\);if\(id==='stok'\)claimStockHost\(\)/);
 assert.match(nav,/setVisibility\(state\.active\);if\(state\.active==='stok'\)claimStockHost\(\)/);
 assert.match(nav,/function ensureStock\(requestRender\)\{claimStockHost\(\)/);
 assert.doesNotMatch(nav,/setTimeout\(nudgeLegacyStockFallback,700\)/);
 assert.match(nav,/if\(id==='stok'&&stockReady\(\)\)/);
});
test('Owner always blocks old stock-reconcile-v2 even before canonical boot JS has executed',()=>{
 assert.match(legacy,/function canonicalOwnsStock\(\)/);
 assert.match(legacy,/window\.__HASNARIA_STOCK_OWNER_CLAIMED/);
 assert.match(legacy,/ctx&&ctx\.role==='owner'/);
 assert.match(legacy,/hasnaria-owner-erp/);
 const start=legacy.indexOf('function render() {');
 const seg=legacy.slice(start,start+180);
 assert.match(seg,/if\(canonicalOwnsStock\(\)\)return/);
 assert.match(legacy,/async function mount\(force\) \{ if\(canonicalOwnsStock\(\)\)return/);
 assert.match(legacy,/host\.__srRendering \|\| !active\(\) \|\| canonicalOwnsStock\(\)/);
});
test('lazy monitor cannot replace Owner canonical loading view with old stock card or duplicate script',()=>{
 assert.match(monitor,/window\.__HASNARIA_STOCK_OWNER_CLAIMED\)return/);
 assert.match(monitor,/owner\|\|window\.__HASNARIA_STOCK_OWNER_CLAIMED/);
 assert.match(monitor,/\.sc3-shell,\[data-stock-v3-boot\],\[data-stock-opening\]/);
 assert.match(monitor,/if\(window\.__HASNARIA_STOCK_V3_RUNTIME_FIX\)/);
 assert.match(bridge,/getElementById\('hasnaria-stock-control-v3-loader'\)/);
});
test('boot placeholder text is identical, stylesheet is not relinked on every Stock navigation',()=>{
 assert.match(bridge,/<strong>Dashboard Stok<\/strong><span>Memuat saldo dan grafik stok/);
 assert.match(nav,/<strong>Dashboard Stok<\/strong><span>Memuat saldo dan grafik stok/);
 assert.match(bridge,/if\(!link\.isConnected\)document\.head\.appendChild\(link\)/);
 assert.match(bridge,/if\(!trim\.isConnected\)document\.head\.appendChild\(trim\)/);
 assert.doesNotMatch(bridge,/setTimeout\(markCanonical,500\)/);
});
test('versioned runtime prevents browser from using outdated Owner navigation and Stock bridge code',()=>{
 assert.match(indexBuild,/owner-shell-guard\.js\?v=13/);
 assert.match(nav,/owner-finance-stock-v3'\+'\.js\?v=15/);
 assert.match(shim,/stock-v3-runtime-fix\.js\?v=5/);
 assert.match(bridge,/stock-control-v3\.js\?v=38/);
 assert.match(source('scripts/vercel-build-check.js'),/stock-legacy-first-frame-guard-v1\.test\.js/);
});
test('old renderer block is presentation-only; stock calculation paths remain untouched',()=>{
 const main=source('stock-control-v3.js');
 for(const s of ['inventory_stock_reconciliation','ui_stock_month_end_trend_v1','Stok Saat Ini vs Batas Aman','Tren Stok Akhir Bulanan']){
  assert.ok(main.includes(s),s);
 }
 assert.match(main,/stock-control-v3\.css\?v=32/);
});
