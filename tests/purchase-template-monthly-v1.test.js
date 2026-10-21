'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('purchase-excel-safe-merge-v3.js','utf8');
const heading=['TGL','NAMA BAHAN','JUMLAH','HARGA SATUAN','TUNAI','REK MANDIRI','PAYLATER','KET'];
function build(rows,ops,rawSource=src){
 const alerts=[],toasts=[],writes=[],calls=[];
 const db={from(table){
   calls.push(table);
   return {select(){return {eq(){return {eq(){return Promise.resolve({count:5,error:null})}}}}}};
 },rpc(name,args){if(name==='import_purchase_reviewed_append_v1'&&!args.p_commit)return Promise.resolve({data:{existing_rows:5,existing_excel:5,existing_non_excel:0,incoming_rows:args.p_rows.length,unchanged_rows:args.p_rows.length,append_rows:0,conflict_rows:0,append_amount:0,can_commit:true},error:null});writes.push({name,args});return Promise.resolve({data:{inserted_rows:args.p_rows.length},error:null})}};
 const document={addEventListener(){},getElementById(){return null},createElement(){return {remove(){},isConnected:false}},body:{appendChild(v){toasts.push(v.textContent)}}};
 const XLSX={utils:{sheet_to_json:ws=>ws.grid,decode_cell(){throw new Error('fake-grid')}},read(){return workbook}};
 const workbook={SheetNames:['BELANJA','B OPERASIONAL'],Sheets:{BELANJA:{grid:rows},'B OPERASIONAL':{grid:ops||[['NO','JENIS','EST OMSET'],[1,'BELANJA BAHAN',0]]}}};
 const w={XLSX,__HASNARIA_DB:db,alert(s){alerts.push(s)},__HASNARIA_CONTEXT:{role:'owner'}};
 const text=rawSource.replace(/\}\)\(\);\s*$/,"window.__PARSE__=parseLegacy;window.__PROCESS__=process;})();");
 assert.notEqual(text,rawSource);
 vm.runInNewContext(text,{window:w,document,XLSX,Date,String,Number,Math,Array,Object,JSON,Promise,console,confirm:()=>true,setTimeout:()=>{}});
 return {window:w,db,alerts,toasts,writes,calls,workbook,parse:()=>w.__PARSE__(workbook,{name:'RENCANA BELANJA TEMPLATE 2026.xlsx'}),
 process:()=>w.__PROCESS__({name:'RENCANA BELANJA TEMPLATE 2026.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)},{})};
}
test('January: stale DESEMBER title and reordered F=PayLater,G=Mandiri work from header on row 3',()=>{
 const wb=build([['BELANJA','DESEMBER'],[],['TGL','NAMA BAHAN','JUMLAH','HARGA SATUAN','TUNAI','PAYLATER','REK MANDIRI','KET'],
 ['2026-01-01','SUNLIGHT',2,7950,15900,null,null,''],
 [null,'GULA PASIR',1,17300,0,7300,10000,'catatan bukan dana']]);
 const p=wb.parse();
 assert.equal(p.rows.length,2);
 assert.equal(p.rows[0].purchase_date,'2026-01-01');
 assert.equal(p.rows[1].purchase_date,'2026-01-01');
 assert.equal(p.rows[1].raw_data.funding_breakdown.paylater,7300);
 assert.equal(p.rows[1].raw_data.funding_breakdown.bank_mandiri,10000);
 assert.equal(p.invalid,0);
});
test('July: E-G credit sources; H=KET ignored; 106560+19980 positive shortages become TUNAI',()=>{
 const wb=build([heading,['2026-07-01','ODENG',8,111000,0,781440,0,'info'],
 [null,'BUMBU ODENG',1,166500,0,146520,0,'suplier']]);
 const p=wb.parse();assert.equal(p.rows.length,2);
 assert.equal(p.rows[0].total_amount,888000);
 assert.equal(p.rows[0].raw_data.auto_cash_adjustment,106560);
 assert.equal(p.rows[1].raw_data.auto_cash_adjustment,19980);
 assert.equal(wb.window.__HASNARIA_PURCHASE_FUNDING_V1.fundingOverview(p).auto_cash,126540);
});
test('August: missing C x D inputs create explicit row backlog and never auto-import partial file',async()=>{
 const wb=build([heading,['2026-08-01','AQUVIVA',12,1600,19200,0,0,''],[null,'ODENG',8,null,888000,0,0,'']]);
 const p=wb.parse();assert.equal(p.invalid,1);assert.equal(p.invalidRows[0].row,3);
 await wb.process();assert.equal(wb.writes.length,0);assert.equal(wb.calls.length,0);
});
test('September: PayLater G recorded, H=note never becomes extra funding',()=>{
 const wb=build([heading,['2026-09-01','ICE CREAM PAIL',1,150000,0,0,150000,'SUDAH MASUK INVENTORI']]);
 const p=wb.parse();assert.equal(p.rows.length,1);assert.equal(p.rows[0].raw_data.funding_breakdown.paylater,150000);
 assert.equal(p.rows[0].raw_data.funding_breakdown.related_party_loan_jas_hujan,0);
});
test('October: H=related-party Jas Hujan, B OPERASIONAL review is not a second transaction',async()=>{
 const h=['TGL','NAMA BAHAN','JUMLAH','HARGA SATUAN','TUNAI','REK MANDIRI','PAYLATER','PINJAM UANG JAS HUJAN'];
 const ops=[[],['NO','JENIS','EST OMSET'],[8,'BELANJA BAHAN',3586234]];
 const wb=build([h,['2026-10-01','ODENG',8,74375,0,0,0,595000]],ops);
 const p=wb.parse();assert.equal(p.rows.length,1);assert.equal(p.rows[0].total_amount,595000);
 assert.equal(p.rows[0].payment_method,null);
 assert.equal(p.rows[0].raw_data.funding_breakdown.related_party_loan_jas_hujan,595000);
 assert.equal(p.operations.amount,3586234);
 await wb.process();assert.equal(wb.writes.length,0,'mixed/loan source cannot force single-credit journal');
 assert.equal(wb.calls.length,0,'no evidence staging before credit validation');
});
test('Existing canonical month: never call destructive replacement RPC, even if input exactly matches',async()=>{
 const wb=build([heading,['2026-09-01','SIRUP',1,1000,1000,0,0,'']]);
 await wb.process();
 assert.deepEqual(wb.calls,[],'no RLS-visible history preflight');
 assert.equal(wb.writes.length,0);
});
test('No unguarded two-step old mutation paths remain in importer',()=>{
 assert.doesNotMatch(src,/function mergeEvidence\(/);
 assert.doesNotMatch(src,/function materialize\(/);
 assert.doesNotMatch(src,/check\.count!==0/);
 assert.match(src,/if\(p\.invalid\)/);
 assert.match(src,/if\(p\.unmapped\)/);
 assert.match(src,/import_purchase_reviewed_append_v1/);
 assert.doesNotMatch(src,/import_purchase_empty_period_v1/);
 assert.doesNotMatch(src,/replace_purchase_canonical_period_v1/);
 assert.doesNotMatch(src,/db\.from\(EVID\)\.update/);
 assert.doesNotMatch(src,/db\.from\(EVID\)\.insert/);
});
