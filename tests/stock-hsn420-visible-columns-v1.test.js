'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const css=fs.readFileSync('stock-control-v3.css','utf8');
function slice(start,end){
 const a=js.indexOf(start),b=js.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'source section found '+start);
 return js.slice(a,b);
}
function harness(override={}){
 const items=[
  {inventory_item_id:'idA',item_name:'SKU A',category:'Bahan',unit:'gram',tracking_active:true,
   purchase_qty:3,sales_usage_qty:1,last_physical_qty:20,last_opname_date:'2026-09-12',min_qty:5,
   last_variance:null,ui_status:'ok',balance_qty:22,incoming_qty:0,avg_usage:1,days_cover:22,
   suggested_order_qty:0},
  {inventory_item_id:'idB',item_name:'SKU B',category:'Bahan',unit:'pcs',tracking_active:false,
   purchase_qty:3,sales_usage_qty:1,last_physical_qty:null,last_opname_date:null,min_qty:5,
   last_variance:null,ui_status:'untracked',balance_qty:null,incoming_qty:0},
  {inventory_item_id:'idC',item_name:'SKU C',category:'Kemasan',unit:'pack',tracking_active:false,
   purchase_qty:0,sales_usage_qty:0,last_physical_qty:null,last_opname_date:null,min_qty:5,
   last_variance:null,ui_status:'untracked',balance_qty:null,incoming_qty:0}
 ];
 const S={exportColumns:null,exportPageOnly:false,exportColumnsOpen:false,page:1,auxLoaded:true,
  status:'',valuationLoaded:true,items, ...override};
 const ctx={S,PAGE_SIZE:2,filteredItems:()=>items,fmt:String,esc:x=>String(x),
  readableStockUnit:x=>x,dateLabel:x=>x,statusLabel:x=>x,
  isOwner:()=>true,opnameHtml:x=>x.tracking_active?String(x.last_physical_qty):'—',
  varianceHtml:x=>x==null?'—':String(x),coverHtml:x=>x.days_cover??'—',
  chip:x=>x,renderPager:()=>'<span class="pager"></span>'};
 const exports=slice('function stockExportColumnDefinitions(){','function renderStockExportOptions(){');
 const table=slice('function stockTableColumnDefinitions(){','function renderNotes()');
 const run=vm.runInNewContext(exports+'\n'+table+'\n({stockChosenColumnKeys,stockDefaultVisibleKeys,stockExportColumnDefinitions,stockExportRows,stockCsvCell,renderTable})',
  ctx,{timeout:2000});
 return {S,items,run};
}
function headings(html){return [...html.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map(m=>m[1])}
function bodyRowCount(html){const tbody=html.match(/<tbody>([\s\S]*?)<\/tbody>/);return tbody?(tbody[1].match(/<tr>/g)||[]).length:0}
test('HSN-420 default Stock table stays 11 columns and CSV uses exact same selection',()=>{
 const {S,run}=harness();
 const visible=Array.from(run.stockChosenColumnKeys());
 assert.deepEqual(visible,['name','purchase','usage','opname','variance','incoming','min','needs','cover','status','balance']);
 const exp=run.stockExportRows(),html=run.renderTable();
 assert.equal(exp.columns.length,11);
 assert.equal(headings(html).length,11);
 assert.equal(bodyRowCount(html),2);
 assert.equal(exp.count,3);
 assert.doesNotMatch(html,/sc420-table-wide/);
 assert.match(html,/data-sc417-item="idA"/);
 assert.match(html,/Tidak diketahui ≠ nol/);
});
test('HSN-420 arbitrary selected columns apply in identical order to table and CSV',()=>{
 const {S,run}=harness({exportColumns:['name','unit','balance'],exportPageOnly:true,page:2});
 const selected=Array.from(run.stockChosenColumnKeys());
 assert.deepEqual(selected,['name','unit','balance']);
 const exp=run.stockExportRows(),html=run.renderTable();
 assert.deepEqual(headings(html),['Material','Satuan dasar','Saldo']);
 assert.deepEqual(Array.from(exp.rows[0]),['Material','Satuan dasar','Saldo sistem (parsial)']);
 assert.equal(exp.count,1);
 assert.equal(exp.rows[1][0],'SKU C');
 assert.equal(bodyRowCount(html),1);
 assert.match(html,/sc420-column-table/);
});
test('HSN-420 extra sources are opt-in; full 15 columns use scoped horizontal scroll',()=>{
 const {S,run}=harness();
 S.exportColumns=Array.from(run.stockExportColumnDefinitions().map(x=>x.key));
 const html=run.renderTable(),exported=run.stockExportRows();
 assert.equal(headings(html).length,15);
 assert.equal(exported.columns.length,15);
 assert.match(html,/sc420-table-wide/);
 assert.match(html,/--sc420-min-width:1590px/);
 assert.match(css,/sc420-column-table\.sc420-table-wide/);
 assert.match(css,/@media\(max-width:700px\)/);
});
test('HSN-420 never fabricates pre-opname movement values or hides mandatory Material',()=>{
 const {S,run}=harness({exportColumns:['unit','usage','balance']});
 const keys=Array.from(run.stockChosenColumnKeys());
 assert.deepEqual(keys,['name','unit','usage','balance']);
 const html=run.renderTable();
 assert.match(html,/data-sc417-item="idB"/);
 assert.match(html,/—/);
 assert.equal(run.stockExportRows().rows[2][2],'');
 const onClick=slice('function bind(host) {','host.oninput = function');
 assert.match(onClick,/if\(key==='name'&&present\)return/);
 assert.match(onClick,/data-sc420-preset/);
 assert.match(js,/Material wajib tampil/);
});
test('HSN-420 configuration affects only modal; filters and pagination stay shared',()=>{
 const modal=slice('function renderModal() {','function openOpname()');
 const ui=slice('function renderStockExportOptions(){','function stockTableColumnDefinitions(){');
 assert.match(modal,/renderStockExportOptions\(\) \+ renderTable\(\)/);
 assert.match(ui,/Atur Kolom Tabel \+ CSV/);
 assert.match(ui,/data-sc420-preset="compact"/);
 assert.match(ui,/data-sc420-preset="all"/);
 const layout=slice('function render() {','function stockDialogFocus(');
 assert.doesNotMatch(layout,/sc420-column-table|stockChosenColumnKeys/);
 const exp=slice('function stockExportRows(){','function stockCsvCell(v){');
 assert.match(exp,/var filtered=filteredItems\(\),pageRows=filtered/);
 assert.match(exp,/S\.exportPageOnly/);
 assert.doesNotMatch(exp,/\b(?:POST|PATCH|DELETE|UPSERT)\b/);
});

test('HSN-420 missing numeric facts are not silently rendered as zeros',()=>{
 const {S,items,run}=harness();
 items[0].min_qty=null;items[0].purchase_qty=null;items[0].sales_usage_qty=undefined;
 items[0].incoming_qty=null;items[0].suggested_order_qty=undefined;
 items[0].last_physical_qty=null;
 const html=run.renderTable();
 assert.match(html,/Tidak diketahui ≠ nol/);
 assert.doesNotMatch(html,/\+\-/);
 assert.match(html,/class="sc3-muted">—<\/span>/);
 const csv=run.stockExportRows();
 assert.equal(run.stockCsvCell(csv.rows[1][1]),'');
 assert.equal(run.stockCsvCell(csv.rows[1][2]),'');
 assert.equal(run.stockCsvCell(csv.rows[1][6]),'');
});
