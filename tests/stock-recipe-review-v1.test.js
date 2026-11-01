'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=(p)=>fs.readFileSync(p,'utf8');
const js=read('stock-control-v3.js');
const css=read('stock-control-v3.css');
const sql=read('supabase/migrations/20261027160000_stock_recipe_readiness_review_v1.sql');

test('recipe review view is RLS invoker, authenticated and read-only',()=>{
  assert.match(sql,/ui_stock_recipe_review_v1\s+with\s*\(security_invoker\s*=\s*true\)/i);
  assert.match(sql,/revoke all on public\.ui_stock_recipe_review_v1 from public,anon/i);
  assert.match(sql,/grant select on public\.ui_stock_recipe_review_v1 to authenticated,service_role/i);
  for(const table of ['sales','sale_items','products','inventory_recipe_components','product_recipe_verifications']){
    assert.ok(sql.includes('public.'+table),table);
  }
  assert.match(sql,/count\(\*\)::bigint as sale_item_rows/);
  assert.match(sql,/coalesce\(sum\(si\.qty\),0\)::numeric as sold_units/);
  assert.match(sql,/when coalesce\(bom\.active_components,0\)=0 then 'missing_bom'/);
  assert.match(sql,/when rv\.status is distinct from 'verified'/);
  assert.match(sql,/when rv\.effective_from>sold\.first_sale_date/);
  assert.doesNotMatch(sql,/^\s*(insert|update|delete|truncate)\s/m);
});

test('read-only Owner review is requested on demand, month scoped, versioned',()=>{
  assert.match(js,/if\(!isOwner\(\)\|\|!S\.period\)return/);
  assert.match(js,/data-sc4-modal="recipes"/);
  assert.match(js,/else if \(S\.modal === 'recipes'\) loadRecipeReview\(\)/);
  assert.match(js,/ui_stock_recipe_review_v1\?/);
  assert.match(js,/period_month:'eq\.'\+period\+'-01'/);
  assert.match(js,/seq!==S\.recipeReviewSeq\|\|period!==S\.period/);
  assert.match(js,/renderRecipeReview\(\)/);
  assert.match(js,/function renderRecipeReview\(\)[\s\S]*?if\(!isOwner\(\)\)return/);
  const segment=js.slice(js.indexOf('async function loadRecipeReview'),js.indexOf('async function loadRecipeImpact'));
  assert.doesNotMatch(segment,/\bfetch\(/);
  assert.doesNotMatch(segment,/\brpc\(/);
  assert.doesNotMatch(segment,/method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)/i);
  assert.match(segment,/function renderRecipeReview/);
});

test('new modal shares controlled scrolling and cache pins',()=>{
  assert.match(css,/\.sc17-review-table\{min-width:800px\}/);
  assert.match(js,/stock-control-v3\.css\?v=33/);
  for(const f of ['stock-monitor.js','stock-v3-runtime-fix.js']){
    assert.ok(read(f).includes('/stock-control-v3.js?v=39'),f);
  }
  assert.match(read('scripts/vercel-build-check.js'),/stock-recipe-review-v1\.test\.js/);
});
