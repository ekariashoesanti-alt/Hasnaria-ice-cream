'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname,'..');
const sql = name => fs.readFileSync(path.join(ROOT,'supabase','migrations',name),'utf8');
const rollback = name => fs.readFileSync(path.join(ROOT,'supabase','rollback',name),'utf8');
const stock = sql('20261018201000_hotfix_stock_ledger_balance_parity.sql');
const finance = sql('20261018202000_hotfix_finance_alerts_fast.sql');
const admin = sql('20261018203000_hotfix_administration_report_fast.sql');

test('SQL changes are view-only, retain security invoker, and have rollback snapshots', () => {
  for (const statement of [stock,finance,admin]) {
    assert.doesNotMatch(statement,/\b(?:insert\s+into|update\s+[\w.]+\s+set|delete\s+from|truncate\s+table|drop\s+table)\b/i);
    assert.match(statement,/create\s+or\s+replace\s+view\s+public\./i);
    assert.match(statement,/with\s*\(security_invoker\s*=\s*true\)/i);
  }
  for (const file of [
    '20261018201000_restore_pre_hotfix_inventory_stock_reconciliation.sql',
    '20261018202000_restore_pre_hotfix_ui_finance_alerts.sql',
    '20261018203000_restore_pre_hotfix_administration_views.sql',
  ]) assert.match(rollback(file), /create\s+or\s+replace\s+view/i);
});

test('Stock uses canonical posted ledger, never virtual draft-recipe consumption', () => {
  assert.match(stock,/ledger\s+as\s+materialized\s*\(select\s+\*\s+from\s+public\.inventory_ledger_balance\)/i);
  assert.match(stock,/l\.ledger_qty\s+as\s+system_qty/i);
  assert.match(stock,/m\.movement_type='SALE_CONSUMPTION'/);
  assert.doesNotMatch(stock,/\bjoin\s+public\.inventory_recipe_components\b/i);
  assert.doesNotMatch(stock,/\bjoin\s+public\.sale_items\b/i);
});

test('Finance alert counts canonical rows once and preserves unmatched Purchases', () => {
  assert.match(finance,/with\s+scope\s+as\s+materialized/i);
  assert.match(finance,/brand_id=\(select brand_id from scope\)/i);
  assert.match(finance,/count\(\*\) as canonical_rows/i);
  assert.match(finance,/c\.canonical_rows<>j\.journal_rows/i);
  assert.match(finance,/c\.divergent_rows>0/i);
  assert.match(finance,/PURCHASE_SYNC_MISMATCH/);
  assert.match(finance,/PURCHASE_PAYMENT_PROVISIONAL/);
  assert.doesNotMatch(finance,/from public\.finance_purchase_sync_status_v1/i);
  assert.doesNotMatch(finance,/from public\.finance_administration_sync_status_v1/i);
});

test('Administration preserves canonical source classification, historical totals, and journal read-only status', () => {
  assert.match(admin,/public\.offline_purchase_history h/);
  assert.match(admin,/finance_account_code_override/);
  assert.match(admin,/analytics_group/);
  assert.match(admin,/fa_asset\.code='1500'/);
  assert.match(admin,/fa_override\.name/);
  assert.match(admin,/abs\(total_amount-journal_debit\)<0\.01/);
  assert.doesNotMatch(admin,/\bjoin\s+public\.finance_purchase_expense_bridge_v1/i);
});

console.log('HSN P0 Stock/Finance SQL contract audit: passed all static assertions');
