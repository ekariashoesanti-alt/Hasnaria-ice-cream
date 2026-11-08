'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const mod=require('../stock-sku-simulation-v1.js');

function fixture(){
  return {
    batch:{id:'batch-oct',period_month:'2026-10-01',status:'under_review',
      source_row_count:3,file_sha256:'a'.repeat(64)},
    lines:[
      {source_sku:'FO1',source_product_name:'Topokki',quantity:8,refund_quantity:2},
      {source_sku:'DD1',source_product_name:'Es Teh',quantity:4,refund_quantity:0},
      {source_sku:'FO2',source_product_name:'No Recipe',quantity:3,refund_quantity:0}
    ],
    products:[
      {id:'p1',name:' topokki ',active:true,sku:null},
      {id:'p2',name:'Es Teh',active:true,sku:null},
      {id:'p3',name:'No Recipe',active:true,sku:null}
    ],
    components:[
      {product_id:'p1',inventory_item_id:'rice',qty_per_sale:50,bom_status:'suggested',active:true},
      {product_id:'p1',inventory_item_id:'sauce',qty_per_sale:0.025,bom_status:'verified',active:true},
      {product_id:'p2',inventory_item_id:'sauce',qty_per_sale:1,bom_status:'verified',active:true}
    ],
    items:[
      {id:'rice',item_name:'Beras',unit:'Gram'},
      {id:'sauce',item_name:'Saus',unit:'L'}
    ],
    approvals:[
      {product_id:'p1',status:'draft'},
      {product_id:'p2',status:'verified'}
    ],
    conversions:[
      {product_id:'p1',inventory_item_id:'rice',status:'needs_verification',units_per_purchase_unit:1000},
      {product_id:'p1',inventory_item_id:'sauce',status:'verified',units_per_purchase_unit:1},
      {product_id:'p2',inventory_item_id:'sauce',status:'verified',units_per_purchase_unit:1}
    ]
  };
}

test('54-style monthly source uses GROSS sales × active BOM, preserves units and no posting',()=>{
  const r=mod.calculate(fixture());
  assert.equal(r.source_sku_count,3);
  assert.equal(r.total_units,15);
  assert.equal(r.refunded_units,2);
  assert.equal(r.bom_sku_count,2);
  assert.equal(r.bom_units,12);
  assert.equal(r.no_bom_sku_count,1);
  assert.equal(r.no_bom_units,3);
  assert.equal(r.recipe_verified_sku_count,1);
  assert.equal(r.report_not_final,true);
  assert.equal(r.ingredients.length,2);
  assert.equal(r.ingredients.find(x=>x.inventory_item_id==='rice').raw_requirement,400);
  assert.equal(r.ingredients.find(x=>x.inventory_item_id==='rice').possible_refund_raw,100);
  assert.equal(r.ingredients.find(x=>x.inventory_item_id==='sauce').raw_requirement,4.2);
  assert.equal(r.ingredients.find(x=>x.inventory_item_id==='sauce').possible_refund_raw,0.05);
  assert.equal(r.ingredients.find(x=>x.inventory_item_id==='sauce').contributing_products,2);
  assert.equal(r.can_modify_operational_stock,false);
  assert.equal(r.stock_posting_allowed,false);
  assert.equal(r.can_calculate_physical_warehouse_deduction,false);
  assert.equal(r.unresolved[0].reason,'NO_BOM');
});

test('same ingredient with different source units cannot silently mix',()=>{
  const a=fixture();
  a.components.push({product_id:'p2',inventory_item_id:'rice',qty_per_sale:2,bom_status:'verified',active:true});
  a.items.push({id:'rice-other',item_name:'Beras',unit:'Kg'});
  a.components.push({product_id:'p2',inventory_item_id:'rice-other',qty_per_sale:0.1,bom_status:'verified',active:true});
  const r=mod.calculate(a);
  const sameName=r.ingredients.filter(x=>x.item_name==='Beras');
  assert.equal(sameName.length,2);
  assert.deepEqual(sameName.map(x=>x.unit).sort(),['Gram','Kg']);
});

test('if source row count is wrong, fail closed before simulation',()=>{
  const a=fixture();a.batch.source_row_count=54;
  assert.throws(()=>mod.calculate(a),/Jumlah baris SKU berbeda/);
});
test('duplicate source SKU must not double-consume stock',()=>{
  const a=fixture();a.lines[2].source_sku='FO1';
  assert.throws(()=>mod.calculate(a),/duplikat/);
});
test('ambiguous product mapping or unknown names are explicitly blocked',()=>{
  const a=fixture();a.products.push({id:'duplicate',name:'TOPoKKI',active:true});
  const r=mod.calculate(a);
  assert.equal(r.bom_sku_count,1);
  assert.equal(r.unresolved.find(x=>x.sku==='FO1').reason,'AMBIGUOUS_NAME');
  assert.equal(r.stock_posting_allowed,false);
});
test('invalid component quantity and unknown inventory item block affected SKU only',()=>{
  const a=fixture();a.components[0].qty_per_sale=-5;
  const r=mod.calculate(a);
  assert.equal(r.unresolved.find(x=>x.sku==='FO1').reason,'INVALID_BOM');
  assert.equal(r.bom_sku_count,1);
  assert.equal(r.ingredients.some(x=>x.inventory_item_id==='rice'),false);
});
test('reject refunded count exceeding sold quantity',()=>{
  const a=fixture();a.lines[0].refund_quantity=50;
  assert.throws(()=>mod.calculate(a),/Qty \/ refund/);
});
test('never count inactive recipe components, all draft verification requires Owner',()=>{
  const a=fixture();a.components[0].active=false;
  const r=mod.calculate(a);
  assert.equal(r.ingredients.some(x=>x.inventory_item_id==='rice'),false);
  assert.equal(r.recipe_verified_sku_count,1);
  assert.equal(r.stock_posting_allowed,false);
});
test('UI is lazy Owner-only, GET-only and not allowed to mutate ledger',()=>{
  const stock=fs.readFileSync(path.join(__dirname,'..','stock-control-v3.js'),'utf8');
  const pure=fs.readFileSync(path.join(__dirname,'..','stock-sku-simulation-v1.js'),'utf8');
  assert.match(stock,/data-sc4-modal="sku-sim"/);
  assert.match(stock,/isOwner\(\).*S\.skuSimLoading/);
  assert.match(stock,/S\.modal === 'sku-sim' \? renderSkuSimulation\(\)/);
  assert.match(stock,/S\.modal === 'sku-sim'\) loadSkuSimulation\(\)/);
  assert.match(stock,/Promise\.all\(\[/);
  assert.match(stock,/sales_product_report_lines\?/);
  assert.match(stock,/inventory_recipe_components\?/);
  assert.match(stock,/source_row_count/);
  assert.match(stock,/lebih dari satu batch SKU|Lebih dari satu batch SKU/);
  assert.match(stock,/stock-sku-simulation-v1\.js/);
  assert.doesNotMatch(pure,/fetch\(|XMLHttpRequest|(?:supabase|db)\.from\(|method:\s*['"](?:POST|PATCH|DELETE)/);
});
