'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=x=>fs.readFileSync(x,'utf8');
const js=read('stock-control-v3.js');
const css=read('stock-control-v3.css');
const reviewSQL=read('supabase/migrations/20261027160000_stock_recipe_readiness_review_v1.sql');
const approvalSQL=read('supabase/migrations/20261028160500_stock_recipe_approval_guard_combined_impact_v1.sql');

test('month-filtered sales do not become monthly recipe approval records',()=>{
  assert.match(js,/period_month:'eq\.'\+period\+'-01'/);
  assert.match(reviewSQL,/left join public\.product_recipe_verifications rv/);
  assert.match(reviewSQL,/rv\.effective_from/);
  assert.doesNotMatch(reviewSQL,/insert into public\.product_recipe_verifications/i);
  assert.match(js,/Resep yang sudah disetujui berlaku terus/);
  assert.match(js,/Tidak perlu disetujui ulang tiap bulan/);
  assert.match(js,/function recipeReviewStatus/);
  assert.match(js,/Berlaku sebagian bulan/);
  assert.match(js,/Resep sudah disetujui/);
  assert.match(approvalSQL,/when new\.status='verified'|if new\.status='verified'/);
});

test('Owner recipe overview is legible and five columns, not generic stock grid',()=>{
  assert.match(js,/Jenis menu terjual/);
  assert.match(js,/Baris detail penjualan/);
  assert.match(js,/Resep siap untuk seluruh penjualan bulan ini/);
  assert.match(js,/sc19-review-table/);
  for(const title of ['Nama menu','Terjual (item)','Status resep','Tindakan','Periksa']){
    assert.ok(js.includes(title),title);
  }
  assert.doesNotMatch(js.slice(js.indexOf('function renderRecipeReview()'),js.indexOf('// Combined by physical SKU')),/BOM valid|<th>Baris jual|<th>Qty jual|<th>Efektif/);
  assert.match(css,/#stok \.sc19-review-table,\#stok \.sc19-combined-table\{table-layout:fixed;width:100%;min-width:0/);
  assert.match(css,/#stok \.sc19-list-wrap\{[^}]*overflow-x:hidden/);
});

test('search, filter, pagination, and period resets have real handlers',()=>{
  assert.match(js,/id="sc19RecipeSearch"/);
  assert.match(js,/id="sc19RecipeFilter"/);
  assert.match(js,/data-sc19-page/);
  assert.match(js,/pageSize=10/);
  assert.match(js,/if\(el\.id==='sc19RecipeSearch'&&isOwner\(\)/);
  assert.match(js,/if\(el\.id==='sc19RecipeFilter'&&isOwner\(\)/);
  assert.match(js,/if\(recipePage&&isOwner\(\)/);
  assert.match(js,/S\.recipeSearch = '';/);
  assert.match(js,/S\.recipeFilter = 'all';/);
  assert.match(js,/S\.recipePage = 1;/);
  assert.match(js,/S\.recipeReviewSeq/);
});

test('ingredient scenario remains separate and cannot auto-post inventory',()=>{
  assert.match(js,/Lihat perkiraan kebutuhan bahan/);
  assert.match(js,/function renderCombinedRecipeImpact/);
  assert.match(js,/ui_stock_recipe_combined_impact_v1/);
  assert.match(js,/Produk tanpa BOM tidak termasuk/);
  assert.match(js,/Stok tercatat/);
  const a=js.indexOf('function renderRecipeReview()');
  const b=js.indexOf('async function loadRecipeImpact(',a);
  const section=js.slice(a,b);
  assert.doesNotMatch(section,/resolve_product_recipe_verification_v2\s*\(/);
  assert.doesNotMatch(section,/method:\s*['"](?:PATCH|POST|DELETE|PUT)/i);
  assert.match(js,/stock-control-v3\.css\?v=26/);
  for(const file of ['stock-monitor.js','stock-v3-runtime-fix.js']){
    assert.match(read(file),/stock-control-v3\.js\?v=32/);
  }
});
