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
