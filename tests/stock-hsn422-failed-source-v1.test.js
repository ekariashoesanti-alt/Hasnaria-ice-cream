'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
function part(a,b){
 const start=js.indexOf(a),end=js.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'source function '+a);
 return js.slice(start,end).trim();
}
const SKU='11111111-1111-4111-8111-111111111111';
const row={id:'m1',inventory_item_id:SKU,movement_date:'2026-09-13',created_at:'2026-09-13T12:00:00Z',
 movement_type:'SALE_CONSUMPTION',qty_delta:-1,reference_type:'sale_item',reference_id:null};
function render(options={}){
 const item={inventory_item_id:SKU,item_name:'Kue Beras',category:'Bahan',unit:'pcs',
  tracking_active:true,system_qty:9};
 const detail={
  loading:false,parts:[],registry:[],opnames:[],movements:[row],recipes:[],
  purchaseLogs:[],goodsReceipts:[],products:[],...options.detail
 };
 const S={items:[item],selectedItemId:SKU,itemDetail:detail,itemDetailPage:1,
  monthEndRows:[],period:'2026-09',itemSourceDoc:null};
 const running=vm.runInNewContext('('+part('function itemLedgerRunningRows(movements,checkpoint,inventoryId){','// HSN-419: Ledger-only monthly flow')+'\n)',{}, {timeout:1300});
 const ctx={S,isOwner:()=>options.owner!==false,esc:String,fmt:String,
  readableStockUnit:x=>x,dateLabel:x=>x,monthLabel:()=> 'September 2026',
  itemLedgerRunningRows:running,itemLedgerPeriodFlow:(movements,cp)=>{
   if(!cp||!movements)return{available:false,reason:'Checkpoint atau ledger belum tersedia'};
   return{available:true,opening:10,incoming:0,outgoing:1,closing:9,events:1};
  },signed:x=>String(x)};
 const fn=vm.runInNewContext('('+part('function renderStockItemDetail(){','function renderPositionCoverage(){')+'\n)',ctx,{timeout:2000});
 return fn();
}
test('HSN-422 failed opname & registry cannot masquerade as empty and ledger remains visible',()=>{
 const h=render({detail:{parts:['opnames','registry'],registry:[],opnames:[],movements:[row]}});
 assert.match(h,/Registri SKU ERP gagal dimuat/);
 assert.match(h,/SKU ERP<\/small><b>Belum dapat dimuat/);
 assert.match(h,/Riwayat opname gagal dimuat; belum dapat memastikan/);
 assert.match(h,/Saldo akhir hitungan: <b>Belum bisa dihitung<\/b>/);
 assert.match(h,/class="sc3-table sc417-ledger"/);
 assert.doesNotMatch(h,/Belum ada bukti opname fisik/);
});
test('HSN-422 successfully empty sources are distinguished from failed reads',()=>{
 const h=render();
 assert.match(h,/Belum ada di registri SKU ERP/);
 assert.match(h,/Belum ada bukti opname fisik/);
 assert.match(h,/Saldo akhir hitungan: <b>Belum bisa dihitung<\/b>/);
 assert.doesNotMatch(h,/Riwayat opname gagal dimuat/);
});
test('HSN-422 ledger failure is not zero transactions',()=>{
 const h=render({detail:{parts:['movements'],movements:null}});
 assert.match(h,/Ledger barang gagal dimuat. Saldo tidak dianggap nol/);
 assert.match(h,/Saldo akhir hitungan: <b>Belum bisa dihitung<\/b>/);
 assert.doesNotMatch(h,/Belum ada mutasi tercatat untuk barang ini/);
});
test('HSN-422 legitimate physical checkpoint still computes balance',()=>{
 const h=render({detail:{opnames:[{id:'o1',opname_date:'2026-09-12',physical_qty:10}]}});
 assert.match(h,/Saldo akhir hitungan: <b>9 pcs<\/b>/);
 assert.match(h,/Stok Opname|Opname fisik/);
 assert.doesNotMatch(h,/Riwayat opname gagal dimuat/);
});
test('HSN-422 detailed source data still unavailable to non-Owner',()=>{
 const h=render({owner:false});
 assert.match(h,/hanya tersedia untuk Owner/);
 assert.doesNotMatch(h,/Kue Beras/);
});
test('HSN-422 read-only source failures do not modify Stock dashboard or ledger',()=>{
 const src=part('function renderStockItemDetail(){','function renderPositionCoverage(){');
 assert.match(src,/failed\.indexOf\('opnames'\)<0/);
 assert.match(src,/failed\.indexOf\('movements'\)<0/);
 assert.match(src,/hasOpname\?checkpoint:null/);
 assert.match(src,/registryFailed\?'Registri SKU ERP gagal dimuat'/);
 assert.doesNotMatch(src,/\b(?:POST|PATCH|DELETE|UPSERT)\b/);
});
