const fs=require('fs');
const assert=require('assert/strict');

const alignment=fs.readFileSync('purchase-finance-alignment-v1.js','utf8');
const analytics=fs.readFileSync('purchase-analytics.js','utf8');
const preload=fs.readFileSync('xlsx-preload.js','utf8');
const lazy=fs.readFileSync('purchase-lazy-loader.js','utf8');
const app=fs.readFileSync('app.js','utf8');

assert.match(alignment,/rpc\('get_ui_period_catalog_fast_v1',[\s\S]*p_module:'pembelian'/,
  'Purchase period list must use the fast module RPC');
assert.doesNotMatch(alignment,/from\('ui_period_catalog_v1'\)/,
  'Purchase must not query the monolithic period catalog');
assert.doesNotMatch(alignment,/ui_purchase_overview_v1/,
  'Purchase must derive overview from the selected-month control pack');
assert.doesNotMatch(alignment,/ui_purchase_category_chart_v1/,
  'Purchase must derive category chart from the selected-month control pack');

const controlCalls=(alignment.match(/rpc\('get_purchase_control_period_v1'/g)||[]).length;
assert.equal(controlCalls,1,'Purchase canonical screen must use one selected-month data RPC');
assert.match(alignment,/overview=null;chartRows=\[\]/,
  'Purchase canonical summary must fall back to local derivation from the control pack');

assert.match(analytics,/select\('source_period,item_name,total_amount,raw_data'\)/,
  'Purchase analytics bootstrap must fetch only fields used for visual analytics');
assert.doesNotMatch(analytics,/select\('id,source_period,source_file,row_no,purchase_date,item_name,quantity_text,unit_text,unit_price,total_amount,payment_method,notes,raw_data'\)/,
  'Purchase analytics must not fetch the previous wide history payload');

assert.match(preload,/purchase-finance-alignment-v1\.js\?v=9/,
  'optimized canonical Purchase runtime must be cache-busted');
assert.match(lazy,/purchase-analytics\.js\?v=3/,
  'optimized Purchase analytics runtime must be cache-busted');
assert.match(app,/xlsx-preload\.js\?v=8/,
  'Purchase preload entry runtime must be cache-busted');

console.log('Purchase fast-load contract: PASS');
