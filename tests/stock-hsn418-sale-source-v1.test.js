'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
const ITEM='11111111-1111-4111-8111-111111111111';
const MOV='22222222-2222-4222-8222-222222222222';
const REF='33333333-3333-4333-8333-333333333333';
const SALE='44444444-4444-4444-8444-444444444444';
const OUTLET='55555555-5555-4555-8555-555555555555';
function extract(a,b){let i=js.indexOf(a),j=js.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'function '+a);return js.slice(i,j).trim();}
function ctx(overrides={}){
 const S={modal:'position',selectedItemId:ITEM,itemSourceSeq:0,itemSourceDoc:null,
  itemDetail:{movements:[{id:MOV,inventory_item_id:ITEM,reference_type:'sale_item',reference_id:REF,
   movement_date:'2026-09-13',outlet_id:OUTLET}]}};
 const calls=[],base={id:REF,sale_id:SALE,item_name:'ICE CREAM TEST',qty:2,external_sku:'FO22',
  sales:{id:SALE,brand_id:BRAND,outlet_id:OUTLET,sold_at:'2026-09-13',external_transaction_id:'M-abc',source_batch_id:null}};
 const env={S,BRAND,isOwner:()=>true,render:()=>{},qs:o=>Object.keys(o).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(o[k])).join('&'),
  request:async u=>{calls.push(u);return[base]},...overrides};
 return {S,calls,fn:vm.runInNewContext('('+extract('async function loadStockItemSource(movementId){','function renderStockItemDetail(){')+')',env,{timeout:1500}),base};
}
test('HSN-418 source detail reads once on demand and uses ID + same brand + outlet',async()=>{
 const c=ctx();
 await c.fn(MOV);
 assert.equal(c.calls.length,1);
 assert.match(c.calls[0],/sale_items\?/);
 assert.match(decodeURIComponent(c.calls[0]),/sales!inner/);
 assert.match(decodeURIComponent(c.calls[0]),/sales.brand_id=eq\./);
 assert.match(decodeURIComponent(c.calls[0]),/id=eq\./);
 assert.equal(c.S.itemSourceDoc.error,'');
 assert.equal(c.S.itemSourceDoc.record.id,REF);
 assert.equal(c.S.itemSourceDoc.outletChecked,true);
 assert.equal(c.S.itemSourceDoc.dateMatches,true);
});
test('HSN-418 refuses source when Owner permission or movement identity missing',async()=>{
 for(const [env,id] of [[{isOwner:()=>false},MOV],[{},'66666666-6666-4666-8666-666666666666']]){
  const c=ctx(env);await c.fn(id);assert.equal(c.calls.length,0);assert.equal(c.S.itemSourceDoc,null);
 }
});
test('HSN-418 fail closed for cross-brand, cross-outlet and source ID mismatch',async()=>{
 const changes=[
  x=>{x.sales.brand_id='77777777-7777-4777-8777-777777777777';},
  x=>{x.sales.outlet_id='88888888-8888-4888-8888-888888888888';},
  x=>{x.sale_id='99999999-9999-4999-8999-999999999999';},
  x=>{x.id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';}
 ];
 for(const change of changes){
  const c=ctx({request:async u=>{let x=JSON.parse(JSON.stringify(c.base));change(x);c.calls.push(u);return[x]}});
  await c.fn(MOV);
  assert.equal(c.S.itemSourceDoc.record,null);
  assert.ok(c.S.itemSourceDoc.error,'must show unverified reference');
 }
});
test('HSN-418 async source response cannot leak into another item after close',async()=>{
 let resolve;
 const c=ctx({request:()=>new Promise(r=>{resolve=r})});
 const work=c.fn(MOV);assert.equal(c.S.itemSourceDoc.loading,true);
 c.S.modal='';c.S.selectedItemId='';c.S.itemSourceSeq++;
 resolve([c.base]);await work;
 assert.equal(c.S.itemSourceDoc.record,null);
});
test('HSN-418 no source mutation, no name matching, no artificial product=ingredient mapping',()=>{
 const source=extract('async function loadStockItemSource(movementId){','function renderStockItemDetail(){');
 const detail=extract('function renderStockItemDetail(){','function renderPositionCoverage(){');
 const bind=extract('function bind(host) {','host.oninput = function');
 assert.match(source,/entry\.reference_type!=='sale_item'/);
 assert.match(source,/entry\.inventory_item_id!==S\.selectedItemId/);
 assert.match(source,/sale\.brand_id!==BRAND/);
 assert.match(source,/entry\.outlet_id&&sale\.outlet_id&&entry\.outlet_id!==sale\.outlet_id/);
 assert.doesNotMatch(source,/method:|POST|PATCH|DELETE|UPSERT/);
 assert.match(detail,/data-sc418-sale/);
 assert.match(detail,/SKU produk pada transaksi tidak otomatis menjadi SKU bahan Majoo/);
 assert.match(detail,/Nomor transaksi Majoo\/POS/);
 assert.match(detail,/Outlet tidak tercantum lengkap/);
 assert.match(detail,/Tanggal transaksi dan tanggal ledger berbeda/);
 assert.match(bind,/data-sc418-close-source/);
 assert.match(bind,/data-sc418-sale/);
 assert.match(bind,/isOwner\(\)/);
});
