const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const migration = read('supabase/migrations/20261003105000_p2_owner_runtime_fast_paths.sql');
const dashboard = read('owner-dashboard-one-view.js');
const admin = read('administration-v1.js');
const stock = read('stock-control-v3.js');
const nav = read('nav-patch.js');
const sales = read('sales-ui-patch.js');
const app = read('app.js');
const index = read('index.html');
const shell = read('owner-shell-guard.js');
const buildIndex = read('scripts/build-index-runtime.js');

assert.match(migration, /create or replace function public\.get_ui_dashboard_pack_v1[\s\S]*security definer/i,
  'dashboard pack must keep the one-check SECURITY DEFINER fast path');
assert.match(migration, /private\.same_brand\(p_brand\)/,
  'dashboard/period fast paths must keep explicit same-brand authorization');
assert.match(migration, /finance_journal_entries_sale_period_fast_idx/,
  'dashboard fast path must include targeted Sales journal index');
assert.match(migration, /finance_journal_entries_purchase_period_fast_idx/,
  'dashboard fast path must include targeted Purchase journal index');
assert.match(migration, /get_ui_period_catalog_fast_v1/,
  'module-specific period catalog fast path must exist');

assert.match(dashboard, /rpc\('get_ui_dashboard_pack_v1'/,
  'CEO dashboard must use the optimized dashboard pack contract');

assert.match(admin, /rpc\('get_ui_period_catalog_fast_v1',[\s\S]*p_module:'administrasi'/,
  'Administration must use the module-specific fast period RPC');
assert.doesNotMatch(admin, /from\('ui_period_catalog_v1'\)/,
  'Administration must not query the monolithic period catalog');

assert.match(stock, /rpc\('get_ui_period_catalog_fast_v1',[\s\S]*p_module:\s*'stok'/,
  'Stock must use the module-specific fast period RPC');
assert.doesNotMatch(stock, /request\('ui_period_catalog_v1\?/,
  'Stock must not fetch the monolithic period catalog');

assert.doesNotMatch(nav, /MutationObserver\(scheduleRun\)\.observe\(document\.body,\{childList:true,subtree:true\}\)/,
  'navigation patch must not watch the whole document body');
assert.match(nav, /observe\(tabs,\{childList:true,subtree:true\}\)/,
  'navigation patch should watch the navigation surface only');

assert.doesNotMatch(sales, /MutationObserver\(schedule\)\.observe\(document\.body/,
  'Sales patch must not watch the whole document body');
assert.match(sales, /MutationObserver\(schedule\)\.observe\(host, \{ childList: true, subtree: true \}\)/,
  'Sales patch should watch only the Sales host');

assert.match(app, /SALES_UI = '\/sales-ui-patch\.js\?v=13'/,
  'Sales performance patch must be cache-busted');
assert.match(index, /\/app\.js\?v=p056/,
  'application runtime must be cache-busted');
assert.match(index, /\/nav-patch\.js\?v=15/,
  'navigation runtime must be cache-busted');
assert.match(shell, /\/administration-v1\.js\?v=5/,
  'Administration runtime must be cache-busted');
assert.match(buildIndex, /owner-shell-guard\.js\?v=3/,
  'production Owner shell must be cache-busted');

console.log('P2 Owner runtime performance contracts: PASS');
