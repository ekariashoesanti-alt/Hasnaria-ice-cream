'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {parseDetailMatrix,reconcile}=require('../sales-reconciliation-v1.js');
const header=['No Transaksi','Waktu Order','Waktu Bayar','Outlet','Produk','Jenis Order',
  'Sisa Tagihan (Rp.)','Total Penjualan (Rp)','Metode Pembayaran','Bayar','Order'];
const row=(id,date,products,sales,payment='Cash')=>
  [id,date+' 10:00:00',date+' 10:05:00','Hasnaria Ice Cream',products,'Bungkus','0',String(sales),payment,'MORNING','MORNING'];
function detail(rows,total,net){
  return [
    ['Periode','01 Oktober 2026 00:00:00 - 31 Oktober 2026 23:59:59'],
    ['Zona Waktu','Asia/Jakarta (GMT +7)'],
    ['Total Penjualan',String(total)],
    ['Penerimaan Pembayaran',String(total)],
    ['Total Penjualan Bersih',String(net)],
    ['Total Transaksi',String(rows.length)],
    ['Date Generated','08/11/2026'],
    header.slice(),
    ...rows
  ];
}
function product(){
  return {period_month:'2026-10-01',totals:{sales:25000,refund_amount:1000,quantity:4},
    rows:[
      {name:'Topokki',sku:'F053',quantity:1,sales_amount:10000},
      {name:'ODENG',sku:'FO1',quantity:3,sales_amount:15000}
    ]};
}
test('cross-source financial gap does not double count and accounts for refunds symmetrically',()=>{
  const d=detail([row('CS/1','01-10-2026','Topokki,ODENG',15000),
    row('CS/2','02-10-2026','ODENG',20000)],35000,34000);
  const result=reconcile(d,product());
  assert.equal(result.transaction_count,2);
  assert.equal(result.product_occurrences,3);
  assert.equal(result.report_units,4);
  assert.equal(result.gross_gap,10000);
  assert.equal(result.net_gap,10000);
  assert.equal(result.refund_gap,0);
  assert.equal(result.requires_review,true);
  assert.equal(result.has_reliable_per_receipt_sku_qty,false);
  assert.equal(result.allowed_to_add_data_sources,false);
  assert.equal(result.stock_posting_allowed,false);
  assert.equal(result.daily_sku_allocation_allowed,false);
});
test('identifies ticket below one-each reference price without modifying it',()=>{
  const d=detail([row('CS/3','30-10-2026','Topokki,ODENG',14000)],14000,14000);
  const r=reconcile(d,product());
  assert.equal(r.receipt_exceptions.length,1);
  assert.equal(r.receipt_exceptions[0].gap,-1000);
  assert.equal(r.receipt_exceptions[0].issue,'BELOW_ONE_EACH_REFERENCE');
});
test('large ticket requires unit breakdown, not synthesized quantities',()=>{
  const d=detail([row('CS/4','05-10-2026','Topokki,ODENG',1512000,'Bank Transfer - QRIS MANDIRI')],1512000,1512000);
  const r=reconcile(d,product());
  assert.equal(r.receipt_exceptions.length,1);
  assert.equal(r.receipt_exceptions[0].issue,'HIGH_VALUE_NEEDS_QTY_REVIEW');
});
test('keep original comma-separated product names; repeated list entries are occurrences, not source unit quantity',()=>{
  const d=detail([row('CS/5','01-10-2026','ODENG,ODENG,Topokki',20000)],20000,20000);
  const raw=parseDetailMatrix(d);
  assert.equal(raw.product_name_appearances,3);
  assert.equal(raw.sku_quantity_known,false);
  assert.equal(raw.per_day['2026-10-01'].appearances,3);
});
test('report name mismatch needs review; no auto-creation of product alias',()=>{
  const d=detail([row('CS/6','01-10-2026','TOPPOKKI',10000)],10000,10000);
  const r=reconcile(d,product());
  assert.deepEqual(r.unknown_names,['TOPPOKKI']);
  assert.equal(r.receipt_exceptions[0].issue,'UNKNOWN_PRODUCT_NAME');
  assert.equal(r.stock_posting_allowed,false);
});
test('detect source product-name appearances above reported gross units',()=>{
  const d=detail([row('CS/7','01-10-2026','Topokki,Topokki,Topokki',30000)],30000,30000);
  const r=reconcile(d,product());
  assert.equal(r.quantity_exceptions[0].sku,'F053');
});
test('never trust duplicate or missing transaction identifiers',()=>{
  const dup=detail([row('DUP','01-10-2026','ODENG',5000),row('DUP','01-10-2026','ODENG',5000)],10000,10000);
  assert.throws(()=>parseDetailMatrix(dup),/duplikat/);
  const blank=detail([row('','01-10-2026','ODENG',5000)],5000,5000);
  assert.throws(()=>parseDetailMatrix(blank),/kosong/);
});
test('transaction footer totals must reconcile before audit',()=>{
  const d=detail([row('CS/8','01-10-2026','ODENG',5000)],4000,4000);
  assert.throws(()=>parseDetailMatrix(d),/Total penjualan tidak cocok/);
  const d2=detail([row('CS/9','01-10-2026','ODENG',5000)],5000,6000);
  assert.throws(()=>parseDetailMatrix(d2),/bersih tidak valid/);
});
test('reject out-of-month detail data and cross-month report matching',()=>{
  const d=detail([row('CS/10','01-11-2026','ODENG',5000)],5000,5000);
  assert.throws(()=>parseDetailMatrix(d),/di luar periode/);
  const d2=detail([row('CS/11','01-10-2026','ODENG',5000)],5000,5000);
  const p=product();p.period_month='2026-09-01';
  assert.throws(()=>reconcile(d2,p),/Bulan Detail/);
});
test('reject malformed price and missing product/payment columns',()=>{
  const d=detail([row('CS/12','01-10-2026','ODENG',5000)],5000,5000);
  d[8][7]='not money';
  assert.throws(()=>parseDetailMatrix(d),/Angka tidak valid/);
  const d2=detail([row('CS/13','01-10-2026','ODENG',5000)],5000,5000);
  d2[7][8]='Unknown';
  assert.throws(()=>parseDetailMatrix(d2),/Kolom detail wajib/);
});
test('do not silently accept ambiguous normalized names in SKU report',()=>{
  const d=detail([row('CS/14','01-10-2026','ODENG',5000)],5000,5000);
  const p=product();p.rows.push({name:' odeng ',sku:'FO99',quantity:1,sales_amount:5000});
  assert.throws(()=>reconcile(d,p),/Nama produk ambigu/);
});


test('source category and payment controls are aggregated without treating them as SKU revenue',()=>{
  const a=row('CS/101','01-10-2026','Topokki',10000,'Cash');a[5]='Bungkus';
  const b=row('CS/102','01-10-2026','ODENG',15000,'Bank Transfer - GOJEK');b[5]='Ojek Online - Go-Jek';
  const c=row('CS/103','02-10-2026','ODENG',5000,'Cash');c[5]='Free Table';
  const det=detail([a,b,c],30000,30000);
  const src=parseDetailMatrix(det);
  assert.deepEqual(src.per_order_type['Bungkus'],{receipts:1,gross:10000});
  assert.deepEqual(src.per_order_type['Ojek Online - Go-Jek'],{receipts:1,gross:15000});
  assert.deepEqual(src.per_order_type['Free Table'],{receipts:1,gross:5000});
  assert.deepEqual(src.per_payment['Cash'],{receipts:2,gross:15000});
  assert.deepEqual(src.per_payment['Bank Transfer - GOJEK'],{receipts:1,gross:15000});
  const result=reconcile(det,product());
  assert.equal(result.gross_gap,5000);
  assert.equal(result.by_order_type['Ojek Online - Go-Jek'].gross,15000);
  assert.equal(result.by_payment_method['Cash'].receipts,2);
  assert.equal(result.allowed_to_add_data_sources,false);
  assert.equal(result.stock_posting_allowed,false);
});
test('incomplete order types are rejected instead of silently dropping source revenue category',()=>{
  const x=row('CS/104','01-10-2026','ODENG',5000);
  x[5]='';
  assert.throws(()=>parseDetailMatrix(detail([x],5000,5000)),/Jenis order kosong/);
});
test('special order category keys cannot corrupt the category summary prototype',()=>{
  const x=row('CS/105','01-10-2026','ODENG',5000);
  x[5]='__proto__';
  const result=parseDetailMatrix(detail([x],5000,5000));
  assert.equal(result.per_order_type['__proto__'].gross,5000);
  assert.equal(Object.getPrototypeOf(result.per_order_type),null);
});
