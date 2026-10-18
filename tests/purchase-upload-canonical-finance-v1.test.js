'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const safe=fs.readFileSync('purchase-excel-safe-merge-v3.js','utf8');
const majoo=fs.readFileSync('purchase-dual-source-v2.js','utf8');
const pfa=fs.readFileSync('purchase-finance-alignment-v1.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261018170000_purchase_empty_period_create_only.sql','utf8');
function runUpload(existing,opts={}){
 const writes=[],events=[],alerts=[],timeouts=[];
 const workbook={SheetNames:['BELANJA','B OPERASIONAL'],Sheets:{
  BELANJA:{grid:[['TGL','NAMA BAHAN','JUMLAH','HARGA SATUAN','TUNAI','REK MANDIRI','PAYLATER','KET'],['2026-11-01','GULA',2,500,1000,0,0,'']]},
  'B OPERASIONAL':{grid:[['NO','JENIS','REALISASI'],[1,'BELANJA BAHAN',1000]]}
 }};
 const XLSX={read(){return workbook},utils:{sheet_to_json:ws=>ws.grid,decode_cell(){throw Error('Unexpected real SheetJS cell')}}};
 const db={from(table){assert.equal(table,'offline_purchase_history');return{
   select(_cols,opts){assert.equal(opts.head,true);return {eq(){return {eq(){return Promise.resolve({count:existing,error:null})}}}}}
  }},rpc(name,args){writes.push({name,args});return Promise.resolve({data:{inserted_rows:args.p_rows.length,replaced_rows:0,finance_synced:false},error:null})}};
 const dom={addEventListener(){},dispatchEvent(e){events.push(e)},getElementById(){return null},
  createElement(){return {isConnected:false,remove(){},textContent:''}},body:{appendChild(){}}};
 const w={XLSX,__HASNARIA_DB:db,
  location:{hostname:opts.preview?'hasnaria-business-analyzer-test123.vercel.app':'hasnaria-business-analyzer.vercel.app'},
  HASNARIA_SB:'https://bnnhmtkpdjlgehsvgoda.supabase.co',
  CustomEvent:function(name,options){return {type:name,detail:options.detail}},
  alert(msg){alerts.push(msg)}};
 const source=safe.replace(/\}\)\(\);\s*$/,"window.__RUN_PURCHASE__=process;})();");
 assert.notEqual(source,safe);
 vm.runInNewContext(source,{window:w,document:dom,XLSX,Date,String,Number,Math,Array,Object,JSON,Promise,console,
   confirm:()=>true,setTimeout:fn=>timeouts.push(fn)});
 return {async process(){await w.__RUN_PURCHASE__({name:'HASnaria NOV 2026.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)},{});return {writes,events,alerts}},writes,events};
}
test('empty month creates one canonical Purchase transaction, then refreshes dashboards from database',async()=>{
 const result=await runUpload(0).process();
 assert.deepEqual(result.writes.map(x=>x.name),['import_purchase_empty_period_v1']);
 const req=result.writes[0].args;
 assert.equal(req.p_source_period,'2026-11-01');
 assert.equal(req.p_rows.length,1);
 assert.equal(req.p_rows[0].total_amount,1000);
 assert.equal(req.p_rows[0].raw_data.funding_breakdown.cash,1000);
 assert.equal(result.events.filter(x=>x.type==='hasnaria:purchase-imported').length,1);
 assert.equal(result.events[0].detail.period,'2026-11-01');
});
test('existing canonical month never invokes any mutating import RPC',async()=>{
 const result=await runUpload(2).process();
 assert.equal(result.writes.length,0);
});
test('safe backend owns serialization and eliminates old destructive RPC privilege',()=>{
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/IF EXISTS\(SELECT 1 FROM public\.offline_purchase_history/);
 assert.match(sql,/GET DIAGNOSTICS v_inserted=ROW_COUNT/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.replace_purchase_canonical_period_v1/);
 assert.doesNotMatch(sql,/^\s*DELETE FROM public\.offline_purchase_history/im);
 assert.match(sql,/private\.reconcile_purchase_classification_v2/);
 assert.match(sql,/source_funding_policy/);
 assert.match(sql,/funding_breakdown/);
});
test('Majoo legacy cannot delete, insert or rewrite Canonical Purchases',()=>{
 assert.doesNotMatch(majoo,/\.delete\(\)/);
 assert.doesNotMatch(majoo,/\.insert\(/);
 assert.doesNotMatch(majoo,/async function rebuild\(/);
 assert.doesNotMatch(majoo,/async function save\(/);
 assert.match(majoo,/PRATINJAU SAJA/);
 assert.match(majoo,/Review Faktur Majoo/);
});
test('all Owner reporting areas refresh on canonical Purchase import, with honest journal statuses',()=>{
 assert.match(pfa,/document\.addEventListener\('hasnaria:purchase-imported'/);
 assert.match(pfa,/loadPeriods\(\)\.then/);
 assert.match(pfa,/Jurnal Pembelian masih perlu rekonsiliasi/);
 for(const file of ['finance-purchase-basis-v1.js','finance-purchase-expense-v1.js','owner-notifications-v1.js'])
  assert.match(fs.readFileSync(file,'utf8'),/document\.addEventListener\('hasnaria:purchase-imported'/,file);
});

test('preview that still targets production Supabase cannot import BELANJA',async()=>{
 const result=await runUpload(0,{preview:true}).process();
 assert.equal(result.writes.length,0,'preview must not invoke even the create-only canonical RPC');
 assert.equal(result.events.length,0);
 assert.ok(result.alerts.some(x=>/PRODUKSI/.test(x)) || !result.writes.length);
});
