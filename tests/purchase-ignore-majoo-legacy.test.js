'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('purchase-excel-safe-merge-v3.js','utf8');
const report=fs.readFileSync('purchase-finance-alignment-v1.js','utf8');
function simulate(response){
 const writes=[],calls=[],prompts=[],events=[];
 const workbook={SheetNames:['BELANJA'],Sheets:{
  BELANJA:{grid:[
   ['TGL','NAMA BAHAN','JUMLAH','HARGA SATUAN','TUNAI','REK MANDIRI','PAYLATER'],
   ['2026-08-01','BAKSO IKAN',2,5000,10000,0,0],
   ['2026-08-02','GULA',1,7500,0,7500,0]
  ]}
 }};
 const XLSX={read:()=>workbook,utils:{sheet_to_json:w=>w.grid,decode_cell:()=>{throw Error('Sheet mock requires no range expansion')}}};
 const db={
  from(table){assert.equal(table,'offline_purchase_history');return{select(s,opts){
   assert.equal(opts.head,true);return{eq(){return{eq(){return Promise.resolve({count:13,error:null})}}}}
  }}},
  async rpc(name,args){calls.push({name,args:JSON.parse(JSON.stringify(args))});
   assert.equal(name,'import_purchase_reviewed_append_v1');
   if(!args.p_commit)return{data:Object.assign({existing_rows:13,existing_excel:0,existing_non_excel:13,append_rows:2,append_amount:17500,unchanged_rows:0,conflict_rows:0,replaced_rows:0},response||{}),error:null};
   writes.push(args);
   return{data:{append_rows:2,unchanged_rows:0,replaced_rows:0},error:null};
  }
 };
 const dom={addEventListener(){},dispatchEvent:e=>events.push(e),getElementById:()=>null,createElement:()=>({isConnected:false,remove(){},textContent:''}),body:{appendChild(){}}};
 const w={XLSX,__HASNARIA_DB:db,location:{hostname:'hasnaria-business-analyzer.vercel.app'},HASNARIA_SB:'https://bnnhmtkpdjlgehsvgoda.supabase.co',CustomEvent:function(name,o){return{type:name,detail:o.detail}}};
 const executable=src.replace(/\}\)\(\);\s*$/,'window.__safeProcess=process;})();');
 assert.notEqual(executable,src);
 vm.runInNewContext(executable,{window:w,document:dom,XLSX,Promise,Number,String,Date,Array,Object,JSON,Math,console,
  confirm:msg=>{prompts.push(msg);return true},setTimeout:()=>{}});
 return{run:()=>w.__safeProcess({name:'RENCANA BELANJA AGUSTUS 2026.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)},null),calls,writes,prompts,events};
}
(async()=>{
 const ok=simulate();
 await ok.run();
 assert.equal(ok.calls.length,2,'dry run then confirmed write');
 assert.equal(ok.calls[0].args.p_commit,false);
 assert.equal(ok.calls[1].args.p_commit,true);
 assert.equal(ok.calls[1].args.p_expected_count,13,'ALL-source count retained for race safety');
 assert.equal(ok.writes.length,1);
 assert.equal(ok.writes[0].p_rows.length,2);
 assert.equal(ok.writes[0].p_rows[0].raw_data.source_sheet,'BELANJA');
 assert.ok(ok.prompts[0].includes('BELANJA sebelumnya 0 baris'));
 assert.ok(ok.prompts[0].includes('13 transaksi sumber lain tersimpan terpisah'));
 assert.ok(ok.prompts[0].includes('Majoo tidak masuk dashboard'));
 assert.ok(ok.prompts[0].includes('tanpa menghapus atau menjumlahkan Majoo'));
 assert.equal(ok.events.filter(x=>x.type==='hasnaria:purchase-imported').length,1);
 const x=ok.events[0].detail;
 assert.equal(x.period,'2026-08-01');
 assert.equal(x.source,'belanja-reviewed-append');
 assert.equal(x.stockPosted,false);
 const invalid=simulate({existing_excel:0,existing_non_excel:12});
 await assert.rejects(()=>invalid.run(),/Ringkasan sumber Pembelian tidak konsisten/);
 assert.equal(invalid.writes.length,0,'fail closed on inconsistent snapshot');
 const conflict=simulate({conflict_rows:1});
 await conflict.run();
 assert.equal(conflict.writes.length,0,'conflicts never write');
 assert.match(report,/get_purchase_control_period_v1/);
 assert.match(src,/import_purchase_empty_period_v1/,'empty-month safe importer retained');
 assert.doesNotMatch(src,/\.delete\(/,'never delete Majoo history');
 console.log('Legacy Majoo ignored in reviewed BELANJA upload, idempotent source safety: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
