'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
function part(a,b){const i=js.indexOf(a),j=js.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Function '+a+' found');return js.slice(i,j).trim();}
function fn(a,b,ctx){return vm.runInNewContext('('+part(a,b)+')',ctx,{timeout:1200});}
function sku(id,status,unit){return {inventory_item_id:id,ui_status:status,item_name:id,category:'Tes',unit:unit||'pcs'};}
test('HSN-416 KPI low/verified/untracked filters match actual rows',()=>{
 const S={baseLoaded:true,items:[sku('a','critical'),sku('b','order'),sku('c','untracked'),sku('d','ok')],
  search:'',category:'',status:'low',page:1,valuationLoaded:true,
  valuation:{inventory_items:4,valued_items:1,inventory_value:100},
  verifiedCosts:[{inventory_item_id:'d',unit_cost:1}],error:''};
 const filter=fn('function filteredItems() {','function kpis() {',{S,num:Number});
 assert.equal(filter().length,2);
 S.status='untracked';assert.equal(filter().length,1);
 S.status='valued';assert.equal(filter().length,1);
 S.status='';assert.equal(filter().length,4);
 const html=fn('function overviewKpis() {','function activityName(',{S,esc:String,fmt:String,num:Number,
  stockMoney:()=>'Rp 100',stockKpiIcon:()=>''})();
 ['data-sc4-kpi=""','data-sc4-kpi="low"','data-sc4-kpi="untracked"',
  'data-sc4-kpi="valued"'].forEach(x=>assert.ok(html.includes(x),x));
 assert.match(html,/sc8-kpi-warning[\s\S]*?<strong[^>]*>2<\/strong>/);
 assert.match(js,/S\.status=kpi\.getAttribute\('data-sc4-kpi'\)\|\|''/);
 assert.match(js,/S\.page=1;S\.modal='position';render\(\);stockDialogFocus\(host\)/);
});
test('HSN-416 provenance distinguishes no ledger entries from missing source',()=>{
 assert.match(js,/inventory_movements\?'\+qs\(\{/);
 assert.match(js,/brand_id:'eq\.'\+BRAND/);
 assert.match(js,/order:'movement_date.desc',limit:'1'/);
 assert.match(js,/loadLatestMovement\(false\)/);
 const S={baseLoaded:true,items:[{tracking_active:true,unit:'pcs'},
  {tracking_active:false,unit:'purchase_unit'}],
  valuationLoaded:true,valuation:{valued_items:1,inventory_items:2},
  latestMovementLoaded:true,latestMovementDate:'2026-09-30',
  period:'2026-11',periodLoading:false,periodError:'',
  monthEndRows:[
   {period_month:'2026-10-01',data_status:'NO_POSTED_SALES',unlinked_sale_rows:3,period_movement_rows:0},
   {period_month:'2026-11-01',data_status:'SAME_DAY_AMBIGUOUS',unlinked_sale_rows:0,period_movement_rows:0}]};
 const ctx={S,fmt:String,esc:String,num:Number,dateLabel:()=> '30/9/2026',monthLabel:()=> 'November 2026'};
 const text=fn('function renderPositionCoverage(){','function renderModal() {',ctx)();
 assert.match(text,/30\/9\/2026/);assert.match(text,/1 \/ 2/);
 assert.match(text,/Saldo bawaan melewati periode/);
 assert.match(text,/Tidak ada mutasi ledger tercatat/);
 assert.match(text,/data-sc4-filter="untracked"/);
 assert.match(text,/data-sc4-filter="unit-review"/);
 S.periodError='Gagal data';
 assert.match(fn('function renderPositionCoverage(){','function renderModal() {',ctx)(),/Gagal memuat arus/);
});
test('HSN-416 later partial month never draws a false continuity line',()=>{
 const S={period:'2026-11',chartUnit:'porsi',periodLoading:false,periodError:'',monthEndUnavailable:false,
  monthEndRows:[
   {period_month:'2026-09-01',unit:'porsi',recorded_end_qty:155.5,checkpoint_skus:15,total_unit_skus:48,unlinked_sale_rows:790,period_movement_rows:378,data_status:'PARTIAL_SALES'},
   {period_month:'2026-10-01',unit:'porsi',recorded_end_qty:155.5,checkpoint_skus:15,total_unit_skus:48,unlinked_sale_rows:1823,period_movement_rows:0,data_status:'NO_POSTED_SALES'},
   {period_month:'2026-11-01',unit:'porsi',recorded_end_qty:155.5,checkpoint_skus:15,total_unit_skus:48,unlinked_sale_rows:0,period_movement_rows:0,data_status:'SAME_DAY_AMBIGUOUS'}]};
 const ctx={S,esc:String,fmt:String,num:Number};
 const h=fn('function monthlyStockEndInfographic(){','function attentionSkuInfographic(){',ctx)();
 assert.match(h,/155\.5/);
 assert.match(h,/saldo bawaan melewati bulan yang belum sinkron/);
 assert.doesNotMatch(h,/class="sc22-trend-line"/);
 assert.match(h,/data parsial, bukan stok fisik final/);
 S.periodError='Network issue';
 assert.match(fn('function monthlyStockEndInfographic(){','function attentionSkuInfographic(){',ctx)(),/gagal dimuat/);
});
test('HSN-416 modal close refreshes DOM; no stock writes in provenance',()=>{
 assert.match(part('function render() {','function stockDialogFocus('),/!shell\.querySelector\('\.sc4-modal'\)/);
 assert.match(js,/function stockCloseDialog\(host\)/);
 assert.match(js,/if \(e\.key === 'Escape' && S\.modal\)/);
 assert.match(js,/S\.page = Number\(button\.getAttribute\('data-sc3-page'\)\)/);
 assert.doesNotMatch(part('function renderPositionCoverage(){','function renderModal() {'),/\b(?:POST|PATCH|DELETE|INSERT|UPSERT)\b/);
});
