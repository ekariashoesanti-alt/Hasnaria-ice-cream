'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {parseMatrix,stagePreview,previewFeatureAllowed,resolveSingaporeOutlet,isMatchingStoredLines,isSingaporeUat}=require('../sales-product-report-v1.js');
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



test('security: only exact Singapore URL may ever stage a report',async()=>{
  assert.equal(isSingaporeUat('https://rynnpndtzjwpekbiwiif.supabase.co'),true);
  assert.equal(isSingaporeUat('https://bnnhmtkpdjlgehsvgoda.supabase.co'),false);
  assert.equal(isSingaporeUat('https://rynnpndtzjwpekbiwiif.supabase.co.evil.test'),false);
  await assert.rejects(stagePreview({size:1},matrix(),{
    enableWrite:true,confirmed:true,singaporeUatApproved:true,
    supabaseUrl:'https://bnnhmtkpdjlgehsvgoda.supabase.co'
  }),/Singapore UAT/);
  await assert.rejects(stagePreview({size:1},matrix(),{
    enableWrite:true,confirmed:true,
    supabaseUrl:'https://rynnpndtzjwpekbiwiif.supabase.co'
  }),/Singapore UAT/);
});

test('source identity: replay only when every saved SKU, sale and refund field matches',()=>{
  const rows=parseMatrix(matrix()).rows;
  const stored=rows.map(x=>({
    line_no:x.line_no,source_sku:x.sku,source_product_name:x.name,
    quantity:String(x.quantity),source_sales_amount:String(x.sales_amount),
    source_hpp_amount:String(x.cogs_amount),source_gross_profit:String(x.gross_profit),
    refund_quantity:String(x.refund_qty),refund_amount:String(x.refund_amount),
    refund_hpp_amount:String(x.refund_cogs)
  }));
  assert.equal(isMatchingStoredLines(rows,stored),true);
  assert.equal(isMatchingStoredLines(rows,stored.slice(0,1)),false);
  stored[1].quantity='99';
  assert.equal(isMatchingStoredLines(rows,stored),false);
  stored[1].quantity='1';
  stored[1].refund_amount='10';
  assert.equal(isMatchingStoredLines(rows,stored),false);
});

test('synthetic outlet resolution must reject any production-like or ambiguous outlet',async()=>{
  const prev=globalThis.fetch;
  let response=[{id:'out-1',brand_id:'brand-1',name:'[UAT SYNTHETIC] Outlet',active:true}];
  globalThis.fetch=async()=>({ok:true,json:async()=>response});
  try{
    const out=await resolveSingaporeOutlet('brand-1','owner-jwt','staging-publishable');
    assert.equal(out.id,'out-1');
    response=[{id:'prod-1',brand_id:'brand-1',name:'Hasnaria Ice Cream',active:true}];
    await assert.rejects(resolveSingaporeOutlet('brand-1','owner-jwt','staging-publishable'),/bukan outlet sintetis/);
    response=[{id:'one',brand_id:'brand-1',name:'[UAT SYNTHETIC] Outlet'},{id:'two',brand_id:'brand-1',name:'[UAT SYNTHETIC] Outlet'}];
    await assert.rejects(resolveSingaporeOutlet('brand-1','owner-jwt','staging-publishable'),/tepat satu outlet/);
  } finally {globalThis.fetch=prev;}
});

test('network: confirmed Owner staging request writes only once and rereads immutable rows',async()=>{
  const prev=globalThis.fetch,parsed=parseMatrix(matrix()),calls=[];
  const stored=parsed.rows.map(x=>({
    line_no:x.line_no,source_sku:x.sku,source_product_name:x.name,
    quantity:x.quantity,source_sales_amount:x.sales_amount,
    source_hpp_amount:x.cogs_amount,source_gross_profit:x.gross_profit,
    refund_quantity:x.refund_qty,refund_amount:x.refund_amount,
    refund_hpp_amount:x.refund_cogs
  }));
  let created=false;
  globalThis.fetch=async(url,opts)=>{
    calls.push({url:String(url),method:opts&&opts.method||'GET'});
    if(String(url).includes('sales_product_report_batches')){
      return {ok:true,json:async()=>created?[{id:'test-batch',status:'under_review',source_row_count:2}]:[]};
    }
    if(String(url).includes('sales_product_report_lines')){
      return {ok:true,json:async()=>stored};
    }
    if(String(url).includes('/rpc/stage_sales_product_report_v1')){
      const body=JSON.parse(opts.body);
      assert.equal(body.p_rows.length,2);
      assert.equal(body.p_rows[0].sku,'FO1');
      created=true;
      return {ok:true,json:async()=>({batch_id:'test-batch',status:'under_review',
        reused:false,line_count:2,quantity:3,sales:21000})};
    }
    throw Error('Unexpected URL '+url);
  };
  const bytes=new TextEncoder().encode('test Excel bytes');
  const file={name:'October.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer};
  try{
    const result=await stagePreview(file,matrix(),{
      singaporeUatApproved:true,enableWrite:true,confirmed:true,
      brandId:'brand-1',outletId:'out-1',
      supabaseUrl:'https://rynnpndtzjwpekbiwiif.supabase.co',
      publishableKey:'staging-publishable',getAccessToken:async()=> 'owner-jwt'
    });
    assert.equal(result.receipt.batch_id,'test-batch');
    assert.equal(result.status,'under_review');
    assert.equal(calls.filter(c=>c.method==='POST').length,1);
    assert.equal(calls.filter(c=>c.url.includes('sales_product_report_lines')).length,1);
  } finally {globalThis.fetch=prev;}
});

test('duplicate: replay verification never POSTs on exact original saved report',async()=>{
  const prev=globalThis.fetch,parsed=parseMatrix(matrix()),calls=[];
  const rows=parsed.rows.map(x=>({
    line_no:x.line_no,source_sku:x.sku,source_product_name:x.name,
    quantity:x.quantity,source_sales_amount:x.sales_amount,
    source_hpp_amount:x.cogs_amount,source_gross_profit:x.gross_profit,
    refund_quantity:x.refund_qty,refund_amount:x.refund_amount,
    refund_hpp_amount:x.refund_cogs
  }));
  globalThis.fetch=async(url,opts)=>{
    calls.push({url:String(url),method:opts&&opts.method||'GET'});
    return {ok:true,json:async()=>String(url).includes('sales_product_report_batches')
      ?[{id:'preexisting',status:'under_review',source_row_count:2}]:rows};
  };
  const bytes=new TextEncoder().encode('existing report bytes');
  try{
    const result=await stagePreview({name:'Existing.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer},matrix(),{
      singaporeUatApproved:true,enableWrite:true,confirmed:true,
      brandId:'brand-1',outletId:'out-1',
      supabaseUrl:'https://rynnpndtzjwpekbiwiif.supabase.co',
      publishableKey:'staging-publishable',getAccessToken:async()=> 'owner-jwt'
    });
    assert.equal(result.status,'existing');
    assert.equal(result.receipt.reused,true);
    assert.equal(calls.some(x=>x.method==='POST'),false);
  } finally {globalThis.fetch=prev;}
});

test('duplicate: same file hash but different stored SKU detail fails closed without POST',async()=>{
  const prev=globalThis.fetch,parsed=parseMatrix(matrix()),calls=[];
  const mismatch=parsed.rows.map(x=>({
    line_no:x.line_no,source_sku:x.sku,source_product_name:x.name,
    quantity:x.quantity,source_sales_amount:x.sales_amount,
    source_hpp_amount:x.cogs_amount,source_gross_profit:x.gross_profit,
    refund_quantity:x.refund_qty,refund_amount:x.refund_amount,
    refund_hpp_amount:x.refund_cogs
  }));
  mismatch[0].quantity=999;
  globalThis.fetch=async(url,opts)=>{
    calls.push({url:String(url),method:opts&&opts.method||'GET'});
    return {ok:true,json:async()=>String(url).includes('sales_product_report_batches')
      ?[{id:'preexisting',status:'under_review',source_row_count:2}]:mismatch};
  };
  const bytes=new TextEncoder().encode('existing mismatch bytes');
  try{
    await assert.rejects(stagePreview({name:'Existing.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer},matrix(),{
      singaporeUatApproved:true,enableWrite:true,confirmed:true,
      brandId:'brand-1',outletId:'out-1',
      supabaseUrl:'https://rynnpndtzjwpekbiwiif.supabase.co',
      publishableKey:'staging-publishable',getAccessToken:async()=> 'owner-jwt'
    }),/rincian SKU\/HPP berbeda/);
    assert.equal(calls.some(x=>x.method==='POST'),false);
  } finally {globalThis.fetch=prev;}
});
