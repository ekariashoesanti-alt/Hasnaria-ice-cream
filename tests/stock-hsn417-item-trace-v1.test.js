'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const css=fs.readFileSync('stock-control-v3.css','utf8');
function section(a,b){const i=js.indexOf(a),j=js.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'section '+a);return js.slice(i,j).trim();}
function fn(a,b){return vm.runInNewContext('('+section(a,b)+')',{}, {timeout:1200});}
test('HSN-417 checkpoint balance is deterministic across all pages',()=>{
 const calc=fn('function itemLedgerRunningRows(movements,checkpoint){','function itemLedgerPeriodFlow(movements,checkpoint,period,inventoryId){');
 const rows=[
 {id:'2',movement_date:'2026-09-14',created_at:'2026-09-14T12:00Z',movement_type:'SALE_CONSUMPTION',qty_delta:-3},
 {id:'1',movement_date:'2026-09-13',created_at:'2026-09-13T12:00Z',movement_type:'PURCHASE_RECEIPT',qty_delta:8},
 {id:'0',movement_date:'2026-09-12',created_at:'2026-09-12T12:00Z',movement_type:'OPNAME_CORRECTION',qty_delta:40},
 {id:'3',movement_date:'2026-09-14',created_at:'2026-09-14T12:00Z',movement_type:'SALE_CONSUMPTION',qty_delta:-1}
 ];
 const result=calc(rows,{opname_date:'2026-09-12',physical_qty:10});
 assert.equal(result.opening,10);assert.equal(result.closing,14);assert.equal(result.same_day,1);
 assert.deepEqual(Array.from(result.rows.map(x=>x.id)),['0','1','2','3']);
 assert.deepEqual(Array.from(result.rows.map(x=>x.running_balance)),[null,18,15,14]);
 const displayed=Array.from(result.rows.slice().reverse());
 assert.equal(displayed.slice(0,2)[0].running_balance,14);
 assert.equal(displayed.slice(2)[0].running_balance,18);
});
test('HSN-417 no checkpoint, invalid quantity, and same-day uncertainty are not zeroed',()=>{
 const calc=fn('function itemLedgerRunningRows(movements,checkpoint){','function itemLedgerPeriodFlow(movements,checkpoint,period,inventoryId){');
 const sale={id:'a',movement_date:'2026-09-13',created_at:'2026-09-13T12:00Z',movement_type:'SALE_CONSUMPTION',qty_delta:-4};
 assert.equal(calc([sale],null).closing,null);
 const bad=calc([sale,{id:'b',movement_date:'2026-09-14',created_at:'x',movement_type:'SALE_CONSUMPTION',qty_delta:null}],
 {opname_date:'2026-09-12',physical_qty:10});
 assert.equal(bad.closing,null);assert.equal(bad.invalid,1);assert.equal(bad.rows[1].running_balance,null);
});
test('HSN-417 modal back preserves filtered list state; item drilldown is Owner-only',()=>{
 const bind=section('function bind(host) {','host.oninput = function');
 for(const n of ['data-sc417-back','data-sc417-page','data-sc417-item'])assert.ok(bind.includes(n));
 assert.match(bind,/itemOpen&&S\.modal==='position'&&isOwner\(\)/);
 assert.match(bind,/loadStockItemDetail\(itemOpen\.getAttribute\('data-sc417-item'\)\)/);
 assert.match(bind,/S\.selectedItemId='';S\.itemDetail=null;\+\+S\.itemDetailSeq/);
 assert.match(js,/S\.selectedItemId\?renderStockItemDetail\(\):renderPositionCoverage\(\)/);
 assert.match(js,/isOwner\(\)\?'<button type="button" class="sc417-item-link"/);
});
test('HSN-417 detail reads only existing scoped sources, never posts, and fails closed at 2500',()=>{
 const loader=section('async function loadStockItemDetail(id){','function renderStockItemDetail(){');
 const hist=section('async function readAllItemMovements(id){','async function loadStockItemDetail(id){');
 assert.match(loader,/if\(!isOwner\(\)/);
 assert.match(loader,/S\.items\.some\(function\(x\)\{return x\.inventory_item_id===id\}\)/);
 for(const p of ['inventory_sku_registry?','inventory_stock_opname?','inventory_recipe_components?','inventory_purchase_log?','goods_receipt_items?'])assert.ok(loader.includes(p),p);
 assert.match(loader,/brand_id:'eq\.'\+BRAND/);
 assert.match(loader,/goods_receipts\.brand_id/);
 assert.match(hist,/inventory_item_id:'eq\.'\+id/);
 assert.match(hist,/movement_date\.asc,created_at\.asc,id\.asc/);
 assert.match(hist,/max=2500/);
 assert.match(hist,/throw Error\('Riwayat melebihi batas/);
 assert.doesNotMatch(loader,/\b(?:POST|PATCH|UPSERT|DELETE|INSERT)\b/);
});
test('HSN-417 keeps ERP SKU separate from unverified Majoo and never fabricates links',()=>{
 const detail=section('function renderStockItemDetail(){','function renderPositionCoverage(){');
 assert.match(detail,/SKU asli Majoo<\/small><b>Belum terverifikasi/);
 assert.match(detail,/SKU internal ERP/);
 assert.match(detail,/ty==='inventory_stock_opname'/);
 assert.match(detail,/ty==='inventory_purchase_log'/);
 assert.match(detail,/tautan palsu/);
 assert.match(detail,/status penerimaan belum diketahui/);
 assert.match(css,/\.sc417-identity/);
 assert.match(css,/@media\(max-width:700px\)/);
});
