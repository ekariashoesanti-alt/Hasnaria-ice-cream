'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../sales-scope-bridge-v1.js');
const baseline={
  period_month:'2026-10-01',outlet_name:'Hasnaria Ice Cream',
  detail_gross:21614500,product_gross:20992500,gross_gap:622000,
  detail_refund:35000,product_refund:35000
};
const proof=(component,amount,direction,report_type,source_line_key,economic_event_key,hash='a'.repeat(64))=>({
  report_type,component,amount,direction,period_month:baseline.period_month,
  outlet_name:baseline.outlet_name,source_sha256:hash,
  source_line_key,economic_event_key
});

test('source-only October gap starts as Rp622k unallocated: no evidence, no financial/stock writes',()=>{
  const r=bridge.calculate(baseline,[]);
  assert.equal(r.gap_rupiah,622000);
  assert.equal(r.unallocated_rupiah,622000);
  assert.equal(r.evidence_count,0);
  assert.equal(r.review_status,'EVIDENCE_PENDING');
  assert.equal(r.refund_agrees,true);
  assert.equal(r.arithmetic_balanced,false);
  assert.equal(r.owner_approval_recorded,false);
  assert.equal(r.posting_authorized,false);
  assert.equal(r.stock_posting_allowed,false);
  assert.equal(r.daily_sku_allocation_allowed,false);
});

test('synthetic exact Rp622k breakdown is math-only: still requires independent Owner signoff',()=>{
  const records=[
    proof('extra',400000,'add','extra_sales','extra-oct','oct:extra'),
    proof('tax',250000,'add','sales_summary','tax-oct','oct:tax','b'.repeat(64)),
    proof('transaction_discount',28000,'subtract','sales_summary','discount-oct','oct:discount','b'.repeat(64))
  ];
  const r=bridge.calculate(baseline,records);
  assert.equal(r.evidence_count,3);
  assert.equal(r.evidenced_net_rupiah,622000);
  assert.equal(r.unallocated_rupiah,0);
  assert.equal(r.arithmetic_balanced,true);
  assert.equal(r.review_status,'MATH_MATCH_OWNER_REVIEW');
  assert.equal(r.owner_approval_recorded,false);
  assert.equal(r.posting_authorized,false);
  assert.equal(r.stock_posting_allowed,false);
});

test('same source line cannot be counted twice under different components',()=>{
  const a=proof('extra',500000,'add','extra_sales','same-row','oct:extra');
  const b=proof('tax',122000,'add','sales_summary','same-row','oct:tax');
  assert.throws(()=>bridge.calculate(baseline,[a,b]),/duplikat/);
});

test('same economic component cannot be counted from two reports',()=>{
  const a=proof('extra',400000,'add','extra_sales','extra-row','oct:extra');
  const b=proof('extra',400000,'add','sales_summary','extra-summary-row','oct:extra','c'.repeat(64));
  assert.throws(()=>bridge.calculate(baseline,[a,b]),/duplikat/);
});

test('proof must contain authentic immutable source hash and source-line reference',()=>{
  const a=proof('extra',400000,'add','extra_sales','one','oct:extra');
  const missingHash={...a,source_sha256:''};
  assert.throws(()=>bridge.calculate(baseline,[missingHash]),/SHA-256/);
  assert.throws(()=>bridge.calculate(baseline,[{...a,source_line_key:''}]),/identitas baris/);
  assert.throws(()=>bridge.calculate(baseline,[{...a,economic_event_key:''}]),/identitas ekonomi/);
  assert.throws(()=>bridge.calculate(baseline,[{...a,report_type:'unknown'}]),/kategori/);
  assert.throws(()=>bridge.calculate(baseline,[{...a,component:'unknown'}]),/kategori/);
});

test('reject different month, different outlet and mismatched receipt-SKU gap',()=>{
  const x=proof('extra',20000,'add','extra_sales','line','oct:extra');
  assert.throws(()=>bridge.calculate(baseline,[{...x,period_month:'2026-09-01'}]),/periode atau outlet/);
  assert.throws(()=>bridge.calculate(baseline,[{...x,outlet_name:'Other Outlet'}]),/periode atau outlet/);
  assert.throws(()=>bridge.calculate({...baseline,gross_gap:999999},[]),/Selisih sumber/);
  assert.throws(()=>bridge.calculate({...baseline,period_month:'2026-13-01'},[]),/periode atau outlet/);
});

test('discount is subtract-only and tax/extra are add-only; signed components never inferred',()=>{
  const x=proof('transaction_discount',28000,'add','sales_summary','discount-row','oct:disc');
  assert.throws(()=>bridge.calculate(baseline,[x]),/arah komponen/);
  const y=proof('tax',25000,'subtract','sales_summary','tax-row','oct:tax');
  assert.throws(()=>bridge.calculate(baseline,[y]),/arah komponen/);
  assert.throws(()=>bridge.calculate(baseline,[{...y,direction:'ignore'}]),/arah perbedaan/);
});

test('refund mismatch cannot be marked mathematically balanced, even with full gross gap',()=>{
  const a=proof('extra',622000,'add','extra_sales','extra','oct:extra');
  const r=bridge.calculate({...baseline,detail_refund:35000,product_refund:25000},[a]);
  assert.equal(r.unallocated_rupiah,0);
  assert.equal(r.refund_agrees,false);
  assert.equal(r.arithmetic_balanced,false);
  assert.equal(r.review_status,'EVIDENCE_PENDING');
  assert.equal(r.posting_authorized,false);
});

test('reject unsafe currency precision, negative adjustment and excessive evidence size',()=>{
  const x=proof('extra',1.001,'add','extra_sales','extra','oct:extra');
  assert.throws(()=>bridge.calculate(baseline,[x]),/presisi/);
  assert.throws(()=>bridge.calculate(baseline,[{...x,amount:-10}]),/harus positif/);
  assert.throws(()=>bridge.calculate(baseline,[{...x,amount:0}]),/harus positif/);
  assert.throws(()=>bridge.calculate(baseline,Array(201).fill(x)),/Maksimal 200/);
});
