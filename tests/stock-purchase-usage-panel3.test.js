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

test('panel 3 does not represent missing verified BOM data as zero usage',()=>{
 assert.match(js,/Number\(r\.usage_rows\|\|0\)===0/);
 assert.doesNotMatch(panel,/BOM_BASELINE_ESTIMATE_V1/);
 assert.match(js,/Pemakaian BOM belum tersedia/);
 assert.match(js,/Belum ada pemakaian BOM yang memenuhi verifikasi/);
 assert.match(js,/BOM terverifikasi/);
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

test('panel 3 chart uses distinct unit-specific series styles and refreshed CSS cache',()=>{
 assert.match(js,/stock-control-v3\.css\?v=41/);
 assert.ok(css.includes('.scytd-purchase-bar'));
 assert.ok(css.includes('.scytd-usage-bar'));
 assert.ok(css.includes('.scytd-unit-select'));
});
