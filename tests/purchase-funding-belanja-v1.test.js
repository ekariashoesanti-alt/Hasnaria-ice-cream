'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const safe=fs.readFileSync('purchase-excel-safe-merge-v3.js','utf8');
const legacy=fs.readFileSync('purchase-dual-source-v2.js','utf8');
function setup(){
  const window={};
  const document={addEventListener(){}};
  const ctx={window,document,Number,Math,String,Array,Object,Date,Promise,JSON,console};
  vm.runInNewContext(safe,ctx,{filename:'purchase-excel-safe-merge-v3.js'});
  return window.__HASNARIA_PURCHASE_FUNDING_V1.balanceFunding;
}
test('Purchase value is C times D and funding E-H only; all four methods retained',()=>{
  const balance=setup();
  const p=balance(100,{cash:10,bank_mandiri:20,paylater:30,related_party_loan_jas_hujan:40},2);
  assert.equal(p.purchase_value,100);
  assert.equal(p.funding_total,100);
  assert.equal(p.additional_cash,0);
  assert.deepEqual(JSON.parse(JSON.stringify(p.breakdown)),{
    cash:10,bank_mandiri:20,paylater:30,related_party_loan_jas_hujan:40
  });
});
test('positive financing shortage is added ONLY to TUNAI, preserving recorded debt and bank',()=>{
  const p=setup()(100,{cash:10,bank_mandiri:20,paylater:30,related_party_loan_jas_hujan:0},7);
  assert.equal(p.additional_cash,40);
  assert.equal(p.breakdown.cash,50);
  assert.equal(p.breakdown.bank_mandiri,20);
  assert.equal(p.breakdown.paylater,30);
  assert.equal(p.funding_total,100);
});
test('overfunding, negative sources, invalid purchase values are blocked',()=>{
  const b=setup();
  assert.throws(()=>b(100,{cash:110},9),/pendanaan melebihi C/);
  assert.throws(()=>b(100,{cash:-1},10),/tidak valid/);
  assert.throws(()=>b(0,{cash:0},11),/harus positif/);
});
test('C x D always drives purchase, Jas Hujan loan gets own source and audit metadata',()=>{
  assert.match(safe,/amount=Math\.round\(q\*pr\*100\)\/100/);
  assert.match(safe,/related_party_loan_jas_hujan/);
  assert.match(safe,/pinjam\|jas\\s\*hujan/i);
  assert.match(safe,/funding_breakdown:funding\.breakdown/);
  assert.match(safe,/auto_cash_adjustment:funding\.additional_cash/);
  assert.match(safe,/source_sheet:sn/);
  assert.match(safe,/hasOps:/);
  assert.match(safe,/B OPERASIONAL tidak diposting sebagai transaksi/);
  assert.match(legacy,/Workbook BELANJA hanya boleh melalui safe merge v3/);
});
test('dashboard cannot call a finance row posted when no journal exists',()=>{
  const ui=fs.readFileSync('purchase-finance-alignment-v1.js','utf8');
  assert.match(ui,/if\(n\(control\.journal_rows\)===0\)return statusPill\('Belum dijurnal'/);
});

test('BELANJA parser reads exactly E-H funding and does not import B OPERASIONAL as purchases',()=>{
 const fakeRows=[
  ['TGL','NAMA BAHAN','JUMLAH','HARGA SATUAN','TUNAI','REK MANDIRI','PAYLATER','PINJAM UANG JAS HUJAN'],
  ['2026-10-01','Topokki',2,50,10,20,30,40],
  [null,'Sprite',2,50,null,20,null,null]
 ];
 const wb={SheetNames:['BELANJA','B OPERASIONAL'],Sheets:{
  'BELANJA':{grid:fakeRows},
  'B OPERASIONAL':{grid:[['NO','JENIS','EST OMSET'],[1,'BIAYA KARYAWAN',6000000]]}
 }};
 const js=safe.replace(/\}\)\(\);\s*$/,"window.__TEST_PARSE__=parseLegacy;})();");
 assert.notEqual(js,safe,'parser instrumentation must be inserted in test sandbox');
 const w={XLSX:{utils:{sheet_to_json:ws=>ws.grid,decode_cell:()=>{throw new Error('fake sheet')}}}};
 const doc={addEventListener(){}};
 const ctx={window:w,document:doc,Number,Math,String,Array,Object,Date,Promise,JSON,console};
 vm.runInNewContext(js,ctx,{filename:'purchase-excel-safe-merge-v3.js'});
 const result=w.__TEST_PARSE__(wb,{name:'RENCANA BELANJA OKTOBER 2026.xlsx'});
 assert.equal(result.rows.length,2);
 assert.equal(result.hasOps,true);
 assert.equal(result.rows[0].total_amount,100);
 assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0].raw_data.funding_breakdown)),{
   cash:10,bank_mandiri:20,paylater:30,related_party_loan_jas_hujan:40
 });
 assert.equal(result.rows[0].payment_method,null,'mixed financing must stay in documented review');
 assert.equal(result.rows[1].total_amount,100);
 assert.equal(result.rows[1].payment_method,null,'cash + bank = mixed counter-account review');
 assert.equal(result.rows[1].raw_data.auto_cash_adjustment,80);
 assert.equal(result.rows[1].raw_data.funding_breakdown.cash,80);
 assert.equal(result.rows[1].raw_data.funding_breakdown.bank_mandiri,20);
});
