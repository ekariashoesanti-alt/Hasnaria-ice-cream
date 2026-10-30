'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=(p)=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261027234500_stock_recipe_owner_evidence_impact_v1.sql');
const js=read('stock-control-v3.js');
const css=read('stock-control-v3.css');

test('verified Stock scenario uses real sale qty, BOM and canonical ledger without write',()=>{
  assert.match(sql,/create or replace view public\.ui_stock_recipe_component_impact_v1\s+with\s*\(security_invoker=true\)/i);
  assert.match(sql,/sum\(si\.qty\)/);
  assert.match(sql,/sold\.sold_units\*c\.qty_per_sale/);
  assert.match(sql,/inventory_stock_reconciliation/);
  assert.match(sql,/when r\.tracking_active then r\.system_qty -/);
  assert.match(sql,/revoke all on public\.ui_stock_recipe_component_impact_v1 from public,anon/);
  assert.match(sql,/grant select on public\.ui_stock_recipe_component_impact_v1 to authenticated,service_role/);
});

test('Owner evidence stored in private append-only table with explicit checks',()=>{
  assert.match(sql,/create table if not exists private\.stock_recipe_owner_reviews_v1/);
  assert.match(sql,/check\(decision in \('EVIDENCE_RECORDED','HOLD_FOR_CORRECTION'\)\)/);
  assert.match(sql,/revoke all on private\.stock_recipe_owner_reviews_v1 from public,anon,authenticated/);
  assert.match(sql,/if auth\.uid\(\) is null or not private\.is_owner\(\)/);
  assert.match(sql,/not private\.same_brand\(v_brand\)/);
  assert.match(sql,/p_attested is distinct from true/);
  assert.match(sql,/date_trunc\('month',p_period_month\)/);
  assert.match(sql,/insert into private\.stock_recipe_owner_reviews_v1/);
  assert.match(sql,/'stock_changed',false,'recipe_approved',false,'finance_changed',false/);
  assert.match(sql,/grant execute on function public\.owner_stock_recipe_record_review_v1/);
  assert.doesNotMatch(sql,/^\s*(update|delete|truncate)\s+public\.(inventory_movements|inventory_recipe_components|product_recipe_verifications|sale_items)/im);
  assert.doesNotMatch(sql,/resolve_product_recipe_verification_v2\s*\(/);
});

test('Owner can inspect per-product BOM and record evidence without approving recipe',()=>{
  assert.match(js,/if\(!isOwner\(\)\|\|S\.modal!=='recipes'/);
  assert.match(js,/ui_stock_recipe_component_impact_v1\?/);
  assert.match(js,/period_month:'eq\.'\+detail\.period\+'-01'/);
  assert.match(js,/data-sc17-product/);
  assert.match(js,/data-sc17-field="evidence"/);
  assert.match(js,/data-sc17-field="reason"/);
  assert.match(js,/data-sc17-field="effective"/);
  assert.match(js,/data-sc17-field="attested"/);
  assert.match(js,/data-sc17-save/);
  assert.match(js,/owner_stock_recipe_record_review_v1/);
  assert.match(js,/if\(!result\|\|result\.stock_changed!==false\|\|result\.recipe_approved!==false\)/);
  assert.match(js,/Simulasi jika hanya produk ini diposting/);
  const f=js.slice(js.indexOf('async function loadRecipeImpact'),js.indexOf('function renderSalesStockAudit'));
  assert.doesNotMatch(f,/resolve_product_recipe_verification_v2/);
  assert.doesNotMatch(f,/sync_sale_item_inventory_movement/);
  assert.doesNotMatch(f,/inventory_movements\?(?:.*)/);
});

test('new layout is compact and both bridge loads are cache-busted',()=>{
  assert.match(css,/\.sc17-evidence-form\{/);
  assert.match(css,/\.sc17-impact-negative\{/);
  assert.match(js,/stock-control-v3\.css\?v=26/);
  for(const p of ['stock-monitor.js','stock-v3-runtime-fix.js'])
    assert.match(read(p),/stock-control-v3\.js\?v=32/,p);
  assert.match(read('scripts/vercel-build-check.js'),/stock-recipe-owner-evidence-v1\.test\.js/);
});
