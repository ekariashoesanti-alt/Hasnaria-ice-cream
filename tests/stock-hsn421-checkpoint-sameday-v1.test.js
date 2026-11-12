'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const start=js.indexOf('function itemLedgerRunningRows(movements,checkpoint,inventoryId){');
const end=js.indexOf('// HSN-419: Ledger-only monthly flow',start);
assert.ok(start>0 && end>start,'HSN-421 running calculator is available');
const calc=vm.runInNewContext('('+js.slice(start,end).trim()+')',{}, {timeout:1500});
const sku='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const cp={opname_date:'2026-09-12',physical_qty:10};
function event(id,date,type,delta,source=''){
 return {id,inventory_item_id:sku,movement_date:date,created_at:date+'T12:00:00Z',
   movement_type:type,qty_delta:delta,source_key:source};
}
test('HSN-421 normal checkpoint correction remains known; movements sorted before pagination',()=>{
 const rows=[
 event('z','2026-09-14','SALE_CONSUMPTION',-2,'s1'),
 event('x','2026-09-12','OPNAME_CORRECTION',10,'c1'),
 event('y','2026-09-13','PURCHASE_RECEIPT',5,'p1')
 ];
 const r=calc(rows,cp,sku);
 assert.equal(r.valid,true);assert.equal(r.same_day,0);
 assert.equal(r.opening,10);assert.equal(r.closing,13);
 assert.deepEqual(Array.from(r.rows.map(x=>x.id)),['x','y','z']);
 assert.deepEqual(Array.from(r.rows.map(x=>x.running_balance)),[null,15,13]);
 assert.equal(r.rows.slice().reverse()[0].running_balance,13);
});
test('HSN-421 same-day sales make all post-checkpoint balances unknown, never zero',()=>{
 const rows=[event('a','2026-09-12','SALE_CONSUMPTION',-1,'sale-a'),
 event('b','2026-09-13','PURCHASE_RECEIPT',5,'receipt-b')];
 const r=calc(rows,cp,sku);
 assert.equal(r.checkpoint_valid,true);assert.equal(r.same_day,1);
 assert.equal(r.valid,false);assert.equal(r.closing,null);
 assert.equal(r.rows[1].running_balance,null);
 assert.match(r.rows[0].balance_reason,/Hari yang sama/);
 assert.match(r.reason,/urutan fisik/);
});
test('HSN-421 same-day purchase similarly blocks continuation',()=>{
 const r=calc([event('a','2026-09-12','PURCHASE_RECEIPT',3),
 event('b','2026-09-17','SALE_CONSUMPTION',-2)],cp,sku);
 assert.equal(r.valid,false);assert.equal(r.same_day,1);
 assert.equal(r.rows[1].running_balance,null);assert.equal(r.closing,null);
});
test('HSN-421 later corrections, duplicated source keys and invalid signs block ledger',()=>{
 const x=event('a','2026-09-13','PURCHASE_RECEIPT',2,'purchase-key');
 const cases=[
 [event('adj','2026-09-14','OPNAME_CORRECTION',7)],
 [event('base','2026-09-14','BASELINE',40)],
 [event('reverse','2026-09-14','PURCHASE_RECEIPT',-2)],
 [event('reverse2','2026-09-14','SALE_CONSUMPTION',2)],
 [event('bad','2026-09-14','SALE_CONSUMPTION',null)],
 [x,event('b','2026-09-14','SALE_CONSUMPTION',-2,'purchase-key')],
 [x,{...x,movement_date:'2026-09-14'}],
 [{...x,inventory_item_id:other}]
 ];
 for(const rows of cases){
  const r=calc(rows,cp,sku);
  assert.equal(r.valid,false,JSON.stringify(rows));
  assert.equal(r.closing,null);
  assert.ok(r.reason);
 }
});
test('HSN-421 absence of physical checkpoint remains unknown',()=>{
 const r=calc([event('a','2026-09-13','PURCHASE_RECEIPT',5)],null,sku);
 assert.equal(r.valid,false);assert.equal(r.opening,null);
 assert.equal(r.closing,null);assert.equal(r.rows[0].running_balance,null);
});
test('HSN-421 only item detail changes; alerts are explicit and no business writes',()=>{
 assert.match(js,/itemLedgerRunningRows\(d\.movements,checkpoint,item\.inventory_item_id\)/);
 assert.match(js,/saldo berjalan ditahan, bukan dianggap nol/);
 assert.match(js,/Saldo belum dapat diverifikasi:/);
 assert.match(js,/S\.itemDetailPage/);
 const body=js.slice(start,end);
 assert.doesNotMatch(body,/\b(?:POST|PATCH|DELETE|UPSERT|INSERT)\b/);
 assert.doesNotMatch(body,/request\(/);
});
