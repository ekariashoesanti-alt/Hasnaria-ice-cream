'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('supabase/manual/hsn_stock_recovery_stage0_readonly.sql','utf8');
const docs=fs.readFileSync('docs/STOK_RECOVERY_STAGE0_1_20261112.md','utf8');
const stock=fs.readFileSync('stock-control-v3.js','utf8');
test('stage0 baseline is a deliberately read-only, repeatable audit',()=>{
 assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;/);
 assert.match(sql,/COMMIT;/);
 assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|VACUUM|COPY)\b/mi);
 assert.match(sql,/public\.inventory_stock_reconciliation/);
 assert.match(sql,/public\.ui_stock_sales_link_audit_v1/);
 assert.match(sql,/public\.inventory_purchase_backfill_audit_p5_v1/);
 assert.match(sql,/source_key/);
 assert.match(sql,/movements_on_opname_day/);
 assert.match(sql,/READ ONLY/);
});
test('stage1 counts cannot mistake an imported purchase for a posted receipt',()=>{
 assert.match(stock,/inventory_purchase_backfill_audit_p5_v1\?/);
 assert.match(stock,/countStatus\('POSTED_LEGACY_SOURCE'\)/);
 assert.match(stock,/purchasePending:countStatus\('READY_NOT_POSTED'\)/);
 assert.match(stock,/purchaseNonStock:countStatus\('NON_STOCK'\)/);
 assert.match(stock,/Ada status pembelian yang belum dikenali/);
 assert.match(docs,/Go\/No-Go/);
 assert.match(docs,/compensating ledger reconciliation/);
 assert.doesNotMatch(docs,/auto.?approve all draft/i);
});


test('stage2 preview is strictly SELECT-only and never approves or posts',()=>{
 const sql2=fs.readFileSync('supabase/manual/hsn_stock_recovery_stage2_preview_readonly.sql','utf8');
 const runbook=fs.readFileSync('docs/STOK_RECOVERY_STAGE2A_2B_20261112.md','utf8');
 assert.match(sql2,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;/);
 assert.match(sql2,/COMMIT;/);
 assert.doesNotMatch(sql2,/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|VACUUM|COPY)\b/mi);
 assert.match(sql2,/public\.inventory_purchase_backfill_audit_p5_v1/);
 assert.match(sql2,/public\.ui_stock_recipe_review_v1/);
 assert.match(sql2,/public\.recipe_import_lines_v1/);
 assert.match(sql2,/SOURCE_UNIT_MISSING/);
 assert.match(sql2,/RECEIPT_EVIDENCE_AND_UNIT_REQUIRED/);
 assert.match(sql2,/NO_PRODUCT_VERIFICATION/);
 assert.match(runbook,/Stage2 code is UI\+manual SELECT only/);
 assert.match(runbook,/effective_from/);
 assert.match(runbook,/not.*receipt/i);
});
