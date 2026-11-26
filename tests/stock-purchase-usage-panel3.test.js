'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const css=fs.readFileSync('stock-control-v3.css','utf8');
const migration=fs.readFileSync('supabase/migrations/20261123170000_create_stock_purchase_usage_monthly_reporting_v1.sql','utf8');
const panel=js.slice(js.indexOf('function renderPurchaseUsageYtd'),js.indexOf('function renderYtdAnalytics'));
const aclMigration=fs.readFileSync('supabase/migrations/20261123173000_restrict_stock_purchase_usage_view_to_select.sql','utf8');

test('panel 3 reads the period-scoped monthly reporting view and supports unit selection',()=>{
 assert.match(js,/async function loadPurchaseUsageYtd\(\)/);
 assert.match(js,/ui_stock_purchase_usage_monthly_v1/);
 assert.match(js,/period_month:'gte\.'\+start/);
 assert.match(js,/period_month=lt\.'\+end/);
 assert.match(js,/scytdPurchaseUnit/);
 assert.match(js,/S\.purchaseUsageUnits/);
 assert.match(js,/S\.purchaseUsageUnit/);
});

test('panel 3 keeps missing verified BOM data visibly unavailable, not as a fabricated zero',()=>{
 assert.doesNotMatch(panel,/BOM_BASELINE_ESTIMATE_V1/);
 assert.match(panel,/var hasUsage=selectedRows\.some\(function\(x\)\{return num\(x\.usage_rows\)>0\|\|num\(x\.usage_qty\)>0;\}\)/);
 assert.match(panel,/hasUsage\?fmt\(usageTotal\).*:'—'/);
 assert.match(panel,/Data pemakaian BOM belum tersedia pada rentang YTD/);
 assert.match(panel,/scytd-usage-bar/);
 assert.doesNotMatch(panel,/style=/);
});

test('reporting view is read-only, unit-qualified and security-invoker',()=>{
 assert.match(migration,/with \(security_invoker = true\)/i);
 assert.match(migration,/ledger_type = 'PURCHASE'/);
 assert.match(migration,/ledger_type = 'SALE'/);
 assert.match(migration,/rv\.status = 'verified'/);
 assert.match(migration,/rv\.effective_from <= s\.sold_at/);
 assert.match(migration,/base_unit/);
 assert.doesNotMatch(migration,/BOM_BASELINE_ESTIMATE_V1/);
 assert.match(migration,/revoke all .* from anon, public/i);
 assert.match(migration,/grant select .* to authenticated/i);
 assert.match(aclMigration,/revoke all .* from anon, authenticated, public/i);
 assert.match(aclMigration,/grant select .* to authenticated/i);
 assert.doesNotMatch(migration,/insert into public\.|update public\.|delete from public\./i);
});

test('panel 3 uses separate series styles and refreshed CSS cache',()=>{
 assert.match(js,/stock-control-v3\.css\?v=42/);
 assert.ok(css.includes('.scytd-purchase-bar'));
 assert.ok(css.includes('.scytd-usage-bar'));
 assert.ok(css.includes('.scytd-unit-select'));
 assert.ok(css.includes('.scytd-comparison-track'));
 assert.ok(css.includes('.scytd-comparison-row'));
 assert.ok(css.includes('.scytd-comparison-track-bg'));
});

test('panel 3 aggregates every month from January through the selected month',()=>{
 assert.match(panel,/var selected=monthKey\(S\.period\)/);
 assert.match(panel,/period>=selected\.slice\(0,4\)\+'-01'&&period<=selected/);
 assert.match(panel,/selectedRows\.reduce\(function\(total,x\)\{return total\+num\(x\.purchase_qty\);\},0\)/);
 assert.match(panel,/selectedRows\.reduce\(function\(total,x\)\{return total\+num\(x\.usage_qty\);\},0\)/);
 assert.doesNotMatch(panel,/S\.purchaseUsageRows\.find/);
 assert.match(panel,/scytd-comparison-row/);
 assert.match(panel,/scytd-purchase-bar/);
 assert.match(panel,/scytd-usage-bar/);
 assert.doesNotMatch(panel,/Array\.from\(\{length:last\}/);
 assert.match(js,/<small>Akumulasi 1 Januari–\'\+esc\(monthLabel\(S\.period\)\)/);
});

test('health donut remains horizontal and proportionate on desktop and mobile',()=>{
 assert.ok(css.includes('.scytd-donut-layout'));
 assert.ok(css.includes('minmax(112px,.88fr) minmax(145px,1.12fr)'));
 assert.ok(css.includes('width:min(100%,148px)'));
 assert.ok(css.includes('@media (max-width:760px)'));
 assert.ok(fs.readFileSync('stock-panel3-ytd.css','utf8').includes('.scytd-comparison-row'));
 assert.ok(fs.readFileSync('stock-oneview-hsn821.css','utf8').length>10000);
});
