'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {parseMatrix,stagePreview,previewFeatureAllowed}=require('../sales-product-report-v1.js');
const h=['Produk','SKU','Outlet','Departemen','Kategori','Jenis Produk','Jumlah Terjual','Jumlah Terjual (%)','Penjualan (Rp.)','Penjualan (%)','HPP','Jumlah Refund','Refund (Rp.)','HPP Refund','Laba Kotor (Rp.)'];
const r=(name,sku,qty,sales,cogs,refundQty=0,refund=0,profit)=>[
  name,sku,'Hasnaria Ice Cream','Tanpa Departemen','MENU UTAMA','Produk Satuan',
  qty,0,sales,0,cogs,refundQty,refund,0,profit ?? sales-cogs
];
function matrix(){
  return [
    ['Laporan Penjualan Produk'],[''],[''],
    ['Periode','01 Oktober 2026 - 31 Oktober 2026',null],
    ['Zona Waktu','Asia/Jakarta (GMT +7)'],
    ['','',null,null,null,null,null,null,null,null,null,null,null,'Total Penjualan',21000],
    ['','',null,null,null,null,null,null,null,null,null,null,null,'Total Laba Kotor',11000],
    ['','',null,null,null,null,null,null,null,null,null,null,null,'Total Produk Terjual',3],
    ['Date Generated 08/11/2026 - 09:54 WIB'],
    [],
    h,
    r('ODENG','FO1',2,10000,4000),
    r('Topokki','F053',1,11000,6000),
    []
  ];
}
test('parse complete Majoo monthly SKU report, preserve product SKU and monthly-only semantics',()=>{
  const m=matrix(),p=parseMatrix(m);
  assert.equal(p.period_month,'2026-10-01');
  assert.equal(p.rows.length,2);
  assert.deepEqual(p.rows.map(x=>x.sku),['FO1','F053']);
  assert.equal(p.rows[0].quantity,2);
  assert.equal(p.totals.quantity,3);
  assert.equal(p.totals.sales,21000);
  assert.equal(p.totals.gross_profit,11000);
  assert.equal(p.stock_posting_allowed,false);
  assert.equal(p.daily_allocation_allowed,false);
  assert.ok(!p.rows[0].date && !p.rows[0].transaction_id);
});
test('do not fabricate monthly period from missing metadata',()=>{
  const m=matrix();m[3]=['wrong header','value'];
  assert.throws(()=>parseMatrix(m),/Periode tidak ditemukan/);
});
test('reject partial month, never invent missing daily trend',()=>{
  const m=matrix();m[3][1]='01 Oktober 2026 - 18 Oktober 2026';
  assert.throws(()=>parseMatrix(m),/satu bulan penuh/);
});
test('catch typo/unknown month and bad period boundaries',()=>{
  const m=matrix();m[3][1]='01 Okto 2026 - 31 Okto 2026';
  assert.throws(()=>parseMatrix(m),/Nama bulan tidak dikenal/);
});
test('reject duplicate SKU regardless of case/whitespace',()=>{
  const m=matrix();m[12][1]=' fo1 ';
  assert.throws(()=>parseMatrix(m),/SKU duplikat/);
});
test('reject aggregation from multiple outlets into one batch',()=>{
  const m=matrix();m[12][2]='Other Outlet';
  assert.throws(()=>parseMatrix(m),/multi-outlet/);
});
test('reject mismatch between source header quantity and product lines',()=>{
  const m=matrix();m[7][14]=99;
  assert.throws(()=>parseMatrix(m),/Total unit berbeda/);
});
test('reject mismatch of monthly report sales vs item sum',()=>{
  const m=matrix();m[5][14]=99999;
  assert.throws(()=>parseMatrix(m),/Omzet berbeda/);
});
test('reject missing required fields, negative revenue and fractional qty',()=>{
  const m=matrix();m[11][6]=1.4;
  assert.throws(()=>parseMatrix(m),/bilangan bulat/);
  const m2=matrix();m2[11][8]=-5;
  assert.throws(()=>parseMatrix(m2),/Nilai negatif/);
  const m3=matrix();m3[11][1]='';
  assert.throws(()=>parseMatrix(m3),/tidak lengkap/);
});
test('reject refund units greater than quantity or refund value without units',()=>{
  const m=matrix();m[11][11]=3;
  assert.throws(()=>parseMatrix(m),/bilangan bulat/);
  const m2=matrix();m2[11][12]=1000;
  assert.throws(()=>parseMatrix(m2),/Refund rupiah tanpa unit/);
});
test('preserve source gross profit (may differ from sales minus HPP due to refund)',()=>{
  const m=matrix();m[11][11]=1;m[11][12]=1000;m[11][14]=6500;m[6][14]=11500;
  const p=parseMatrix(m);
  assert.equal(p.rows[0].gross_profit,6500);
  assert.equal(p.rows[0].refund_qty,1);
});
test('reject unsupported Detail Transaksi file',()=>{
  const matrix=[['No Transaksi','Waktu Order','Produk','Total Penjualan'],['CS/2026/001','01-10-2026','Topokki',10000]];
  assert.throws(()=>parseMatrix(matrix),/Header Produk, SKU/);
});
test('staging is disabled without explicit review+write authorization',async()=>{
  const m=matrix();
  await assert.rejects(stagePreview(null,m,{}),/konfirmasi Owner/);
  await assert.rejects(stagePreview(null,m,{enableWrite:true}),/konfirmasi Owner/);
});
test('checks sales totals and handles Indonesian numeric formatted values',()=>{
  const m=matrix();
  m[5][14]='21.000,00';m[6][14]='11.000,00';m[7][14]='3';
  m[11][6]='2';m[11][8]='10.000,00';
  assert.equal(parseMatrix(m).totals.sales,21000);
});
test('product report chooser is disabled on production even with query flag',()=>{
  assert.equal(previewFeatureAllowed({HASNARIA_SB:'https://bnnhmtkpdjlgehsvgoda.supabase.co',location:{search:'?sales_product_preview=1'}}),false);
  assert.equal(previewFeatureAllowed({HASNARIA_SB:'https://rynnpndtzjwpekbiwiif.supabase.co',location:{search:''}}),false);
  assert.equal(previewFeatureAllowed({HASNARIA_SB:'https://rynnpndtzjwpekbiwiif.supabase.co',location:{search:'?sales_product_preview=1'}}),true);
});

console.log('Sales product report strict staging parser regression: registered');
