'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const css=fs.readFileSync('stock-control-v3.css','utf8');
const SKU='11111111-1111-4111-8111-111111111111';
function part(start,end){const a=js.indexOf(start),b=js.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'section '+start);return js.slice(a,b).trim();}
function flow(rows,cp,month='2026-10',id=SKU){
 const fn=vm.runInNewContext('('+part('function itemLedgerPeriodFlow(movements,checkpoint,period,inventoryId){','async function readAllItemMovements(id){')+')',
 {monthKey:k=>String(k).slice(0,7)},{timeout:1500});
 return fn(rows,cp,month,id);
}
function m(id,date,type,qty,key=''){return{id,inventory_item_id:SKU,movement_date:date,created_at:date+'T12:00:00Z',movement_type:type,qty_delta:qty,source_key:key};}
test('HSN-419 monthly single-SKU equation uses only same interval',()=>{
 const rows=[m('e5','2026-11-01','SALE_CONSUMPTION',-100),m('e3','2026-10-09','PURCHASE_RECEIPT',4),
 m('e1','2026-09-15','PURCHASE_RECEIPT',10),m('e4','2026-10-11','SALE_CONSUMPTION',-2),
 m('e2','2026-09-19','SALE_CONSUMPTION',-3),m('e0','2026-09-12','OPNAME_CORRECTION',20)];
 const r=flow(rows,{opname_date:'2026-09-12',physical_qty:20});
 assert.equal(r.available,true);assert.equal(r.opening,27);assert.equal(r.incoming,4);assert.equal(r.outgoing,2);
 assert.equal(r.closing,29);assert.equal(r.opening+r.incoming-r.outgoing,r.closing);
 assert.equal(r.events,2);assert.equal(r.to,'2026-11-01');
});
test('HSN-419 does not invent balances for missing or inside-period checkpoint',()=>{
 const rows=[m('x','2026-10-11','PURCHASE_RECEIPT',5)];
 assert.equal(flow(rows,null).opening,null);
 assert.equal(flow(rows,{opname_date:'2026-10-01',physical_qty:20}).closing,null);
 assert.equal(flow(null,{opname_date:'2026-09-12',physical_qty:20}).closing,null);
 const zero=flow([],{opname_date:'2026-09-12',physical_qty:20});
 assert.equal(zero.events,0);assert.equal(zero.closing,20);
 assert.match(js,/Pembelian yang belum diterima dan penjualan yang belum disinkron tidak termasuk/);
});
test('HSN-419 fail-closed on same-day ambiguity, wrong SKU, damaged/duplicate/unsupported mutations',()=>{
 const cp={opname_date:'2026-09-12',physical_qty:12},a=m('a','2026-10-02','PURCHASE_RECEIPT',2,'key');
 const bad=[
  [m('x','2026-09-12','SALE_CONSUMPTION',-1)],
  [{...a,inventory_item_id:'22222222-2222-4222-8222-222222222222'}],
  [{...a,qty_delta:null}],
  [{...a,qty_delta:-2}],
  [{...a,movement_type:'OPNAME_CORRECTION'}],
  [a,{...a,id:'b'}],
  [a,{...a,id:'c',source_key:'key'}]
 ];
 for(const rows of bad){const r=flow(rows,cp);assert.equal(r.available,false);assert.equal(r.closing,null);}
});
test('HSN-419 export uses exactly chosen columns and current filtered page',()=>{
 const items=[
  {item_name:'A',category:'Bahan',unit:'gram',tracking_active:true,purchase_qty:2,sales_usage_qty:1,
   last_physical_qty:30,last_opname_date:'2026-09-12',min_qty:4,ui_status:'ok',balance_qty:31},
  {item_name:'B',category:'Bahan',unit:'pcs',tracking_active:false,
   last_physical_qty:4,purchase_qty:3,sales_usage_qty:2,min_qty:2,ui_status:'untracked',balance_qty:null},
  {item_name:'C',category:'Kemasan',unit:'pack',tracking_active:false,min_qty:1,ui_status:'untracked',balance_qty:null}
 ];
 const S={exportColumns:null,exportPageOnly:false,page:2,auxLoaded:false};
 const src=part('function stockExportColumnDefinitions(){','function renderStockExportOptions(){');
 const ex=vm.runInNewContext(src+'\n({stockExportRows,stockCsvCell})',{S,PAGE_SIZE:2,filteredItems:()=>items,statusLabel:x=>x},{timeout:1500});
 const full=ex.stockExportRows();assert.equal(full.count,3);assert.equal(full.rows.length,4);
 assert.equal(full.rows[2][5],'');
 S.exportColumns=['name','unit','balance'];
 const sel=ex.stockExportRows();
 assert.deepEqual(Array.from(sel.rows[0]),['Material','Satuan dasar','Saldo sistem (parsial)']);
 assert.deepEqual(Array.from(sel.rows[2]),['B','pcs','']);
 S.exportPageOnly=true;
 const page=ex.stockExportRows();
 assert.equal(page.count,1);assert.equal(page.filteredCount,3);assert.equal(page.rows[1][0],'C');
 assert.equal(page.scope,'halaman-aktif');
});
test('HSN-419 CSV protects text against spreadsheet formulas',()=>{
 const src=part('function stockExportColumnDefinitions(){','function renderStockExportOptions(){');
 const c=vm.runInNewContext(src+'\nstockCsvCell',{S:{},PAGE_SIZE:2,filteredItems:()=>[],statusLabel:x=>x},{timeout:1500});
 assert.match(c('=HYPERLINK("test")'),/^"'/);
 assert.equal(c('@SUM(A1)'),"'@SUM(A1)");
 assert.equal(c('-cmd'),"'-cmd");
 assert.equal(c(-42),'-42');
 assert.equal(c('baris\nbaru'),'"baris\nbaru"');
});
test('HSN-419 changes are confined to existing Stok modal, no extra dashboard boxes or posting',()=>{
 const modal=part('function renderModal() {','function openOpname()');
 const item=part('function renderStockItemDetail(){','function renderPositionCoverage(){');
 const click=part('function bind(host) {','host.oninput = function');
 assert.match(modal,/renderStockExportOptions\(\)/);
 assert.match(item,/itemLedgerPeriodFlow\(hasLedger\?d\.movements:null,hasOpname\?checkpoint:null,S\.period,item\.inventory_item_id\)/);
 assert.match(item,/Saldo awal/);assert.match(item,/Saldo akhir ledger/);
 assert.match(click,/data-sc419-column/);assert.match(click,/data-sc419-export-scope/);
 assert.match(click,/data-sc419-export/);assert.match(js,/function exportCsv\(\)/);
 assert.match(css,/\.sc419-export-panel/);assert.match(css,/\.sc419-flow-grid/);
 assert.doesNotMatch(part('function render() {','function stockDialogFocus('),/sc419-flow-grid|sc419-export-panel/);
 assert.doesNotMatch(part('function itemLedgerPeriodFlow(movements,checkpoint,period,inventoryId){','async function readAllItemMovements(id){'),/\b(?:POST|PATCH|DELETE|UPSERT)\b/);
});
