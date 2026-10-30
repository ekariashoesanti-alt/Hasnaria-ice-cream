'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=(p)=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261028160500_stock_recipe_approval_guard_combined_impact_v1.sql');
const js=read('stock-control-v3.js');
const css=read('stock-control-v3.css');

test('every approval route including direct RLS updates is guarded in Postgres',()=>{
  assert.match(sql,/create or replace function private\.assert_product_recipe_approval_v1/i);
  assert.match(sql,/not private\.is_owner\(\)/);
  assert.match(sql,/not private\.same_brand\(p_brand_id\)/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/v_review\.decision<>'EVIDENCE_RECORDED'/);
  assert.match(sql,/v_review\.proposed_effective_from is distinct from p_effective_from/);
  assert.match(sql,/v_review_snapshot is distinct from v_live_snapshot/);
  assert.match(sql,/v_component_count<>v_verified_count/);
  assert.match(sql,/v_component_count<>v_unique_count/);
  assert.match(sql,/v_risk\.tracking_active is distinct from true/);
  assert.match(sql,/v_risk\.system_qty<v_risk\.prospective_usage/);
  assert.match(sql,/if new\.status='verified' then/);
  assert.match(sql,/before insert or update on public\.product_recipe_verifications/);
  assert.match(sql,/revoke all on function private\.assert_product_recipe_approval_v1/);
  assert.doesNotMatch(sql,/update\s+public\.inventory_movements/i);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.inventory_movements/i);
});

test('combined simulation is RLS invoker, grouped by SKU and avoids duplicate decrement',()=>{
  assert.match(sql,/view public\.ui_stock_recipe_combined_impact_v1\s+with\s*\(security_invoker=true\)/i);
  assert.match(sql,/group by brand_id,period_month,inventory_item_id/);
  assert.match(sql,/m\.reference_type='sale_item'/);
  assert.match(sql,/m\.reference_id=si\.id/);
  assert.match(sql,/m\.system_generated/);
  assert.match(sql,/not already_posted and sale_date>baseline_date/);
  assert.match(sql,/current_system_qty/);
  assert.match(sql,/unverified_component_lines/);
  assert.match(sql,/revoke all on public\.ui_stock_recipe_combined_impact_v1 from public,anon/);
  assert.match(sql,/grant select on public\.ui_stock_recipe_combined_impact_v1 to authenticated,service_role/);
});

test('Owner-only frontend reads combined scenario on demand and does not post',()=>{
  assert.match(js,/async function loadCombinedRecipeImpact/);
  assert.match(js,/if\(!isOwner\(\)\|\|S\.modal!=='recipes'\|\|!S\.period\)return/);
  assert.match(js,/ui_stock_recipe_combined_impact_v1\?/);
  assert.match(js,/period_month:'eq\.'\+period\+'-01'/);
  assert.match(js,/seq!==S\.combinedSeq\|\|period!==S\.period\|\|!S\.combinedOpen/);
  assert.match(js,/data-sc18-combined/);
  assert.match(js,/Gabungan seluruh produk dengan BOM aktif/);
  assert.match(js,/produk tanpa BOM/i);
  const section=js.slice(js.indexOf('async function loadCombinedRecipeImpact'),js.indexOf('async function loadRecipeImpact'));
  assert.doesNotMatch(section,/rpc\(/);
  assert.doesNotMatch(section,/method:\s*['"](?:POST|DELETE|PATCH|PUT)/i);
  assert.match(css,/\.sc18-summary/);
  assert.match(js,/stock-control-v3\.css\?v=25/);
  for(const p of ['stock-monitor.js','stock-v3-runtime-fix.js'])
    assert.match(read(p),/stock-control-v3\.js\?v=31/);
  assert.match(read('scripts/vercel-build-check.js'),/stock-recipe-approval-guard-v1\.test\.js/);
});
