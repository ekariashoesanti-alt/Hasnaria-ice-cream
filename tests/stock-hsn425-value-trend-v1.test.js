'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8'),css=fs.readFileSync('stock-oneview-hsn821.css','utf8');
const a=js.indexOf('function stockValueTrendPoints('),b=js.indexOf('function stockValueTrendInfographic()',a);
assert.ok(a>=0&&b>a);const calc=vm.runInNewContext('('+js.slice(a,b).trim()+')');
const c={inventory_item_id:'A',unit_cost:100,effective_from:'2026-07-01'},cp={inventory_item_id:'A',id:'o',opname_date:'2026-09-05',physical_qty:10};
const m=(id,d,t,q)=>({inventory_item_id:'A',id,movement_date:d,movement_type:t,qty_delta:q});
const row=(d,n,t='LEDGER_RECORDED')=>({period_month:d,period_movement_rows:n,data_status:t});
const run=(moves=[],op=[cp],costs=[c],monthRows=[row('2026-09-01',2),row('2026-10-01',0,'NO_POSTED_SALES'),row('2026-11-01',0)])=>calc({costs,opnames:op,movements:moves},'2026-11',monthRows,'2026-11-16');
test('recorded costed system and observed physical separate, not a carried zero',()=>{
 const p=run([m('r','2026-09-06','PURCHASE_RECEIPT',5),m('s','2026-09-08','SALE_CONSUMPTION',-3)]);
 assert.equal(p[7].system,1200);assert.equal(p[7].physical,1000);assert.equal(p[7].sysCount,1);
 assert.equal(p[8].system,null);assert.equal(p[8].physical,null);assert.equal(p[9].system,null);
});
test('unknown, same-day and invalid events fail closed, physical stays actual',()=>{
 for(const moves of [[m('s','2026-09-05','SALE_CONSUMPTION',-1)],[m('a','2026-09-06','BASELINE',15)],[m('x','2026-09-06','SALE_CONSUMPTION',null)]]){
  const p=run(moves);assert.equal(p[7].system,null);assert.equal(p[7].physical,1000);
 }
 assert.equal(run([],[],[c])[7].system,null);
 assert.equal(run([], [cp], [{...c,effective_from:'2026-10-01'}])[7].physical,null);
 assert.equal(run([], [cp], [])[7].system,null);
});
test('latest physical observation only; no synthetic historical line',()=>{
 const p=run([], [{...cp,id:'old',opname_date:'2026-09-02',physical_qty:40},cp]);
 assert.equal(p[7].physical,1000);assert.equal(p[7].phyCount,1);assert.equal(p[6].physical,null);
});
test('aligned 4:2 common grid gap, retained existing chart and read-only paths',()=>{
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important;gap:8px!important/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;gap:8px!important/);
 assert.match(js,/S\.trendMode==='qty'\?monthlyStockEndInfographic\(\):stockValueTrendInfographic\(\)/);
 assert.match(js,/stockComparison=stockSafetyInfographic\(\)/);
 const read=js.slice(js.indexOf('async function readStockValueHistory'),a);
 assert.match(read,/inventory_verified_cost_current/);assert.match(read,/inventory_stock_opname/);assert.match(read,/inventory_movements/);
 assert.doesNotMatch(read,/\brpc\(|\b(?:INSERT|DELETE|PATCH|UPSERT)\b/);
});
