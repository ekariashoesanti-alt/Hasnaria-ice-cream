'use strict';

// P0 regression: a destructive canonical Purchase re-import must never touch
// evidence/history before verifying its Stock receipts. No Supabase calls here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'purchase-excel-safe-merge-v3.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261011110000_guard_purchase_stock_source_lineage.sql'), 'utf8');

async function runUpload({receipts = [], queryError = null, allowConfirm = true} = {}) {
  let onChange, confirmCount = 0;
  const requests = [], writes = [], toasts = [];
  const db = {
    from(table) {
      const q = {table};
      const b = {
        select(fields) { q.fields = fields; return b; },
        eq(k, v) { (q.filters ||= []).push(['eq',k,v]); return b; },
        gte(k, v) { (q.filters ||= []).push(['gte',k,v]); return b; },
        lte(k, v) { (q.filters ||= []).push(['lte',k,v]); return b; },
        limit(n) {
          q.limit = n; requests.push(q);
          if (table !== 'inventory_purchase_log') writes.push(q);
          return Promise.resolve(queryError ? {error: queryError} : {data: receipts, error: null});
        },
        insert() { writes.push({table, verb: 'insert'}); return Promise.resolve({error: null}); },
        update() { writes.push({table, verb: 'update'}); return b; }
      };
      return b;
    },
    rpc(name) { writes.push({verb:'rpc', name}); return Promise.resolve({error:null}); }
  };
  const sheet = {};
  const XLSX = {
    read() { return {SheetNames:['BELANJA'], Sheets:{BELANJA:sheet}}; },
    utils: {
      sheet_to_json() {
        return [
          ['Tanggal','Nama','Jumlah','Harga','Total','Tunai'],
          ['2026-09-04','ODENG',1,10000,10000,10000]
        ];
      },
      decode_cell() { return {r:0,c:0}; },
      decode_range() { return {s:{r:0,c:0},e:{r:1,c:5}}; },
      encode_range() { return 'A1:F2'; }
    }
  };
  const document = {
    addEventListener(type, cb) { if (type === 'change') onChange = cb; },
    getElementById() { return null; },
    createElement() { return {isConnected:true, remove() { this.isConnected=false; }}; },
    body:{appendChild(node) { toasts.push(node); }}
  };
  const sandbox = {
    window:{__HASNARIA_DB:db, XLSX},
    document, XLSX, Date, Math, Number, String, Object, RegExp, Array, JSON, Error, Promise,
    console:{error(){}}, confirm() { confirmCount++; return allowConfirm; },
    setTimeout() {}, clearTimeout() {}
  };
  vm.runInNewContext(source, sandbox, {filename:'purchase-excel-safe-merge-v3.js'});
  const input = {id:'purchaseExcelFile', value:'', files:[{name:'RENCANA BELANJA SEPTEMBER.xlsx', arrayBuffer: async()=>new ArrayBuffer(1)}]};
  assert.equal(typeof onChange,'function');
  onChange({target:input, preventDefault(){}, stopImmediatePropagation(){}});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  return {requests, writes, toasts:toasts.map(x=>x.textContent), confirmCount, input};
}

test('linked or orphan Stock receipts stop canonical import before any evidence mutation', async () => {
  const r = await runUpload({receipts:[{id:'posted-stock-1'}]});
  assert.equal(r.requests.length,1);
  assert.equal(r.requests[0].table,'inventory_purchase_log');
  assert.equal(r.requests[0].limit,1);
  assert.equal(r.writes.length,0);
  assert.equal(r.confirmCount,0);
  assert.match(r.toasts.join(' '),/ditahan: sudah ada penerimaan Stok/);
});

test('preflight query failure also fails closed, no side effects', async () => {
  const r = await runUpload({queryError:{message:'no inventory read permission'}});
  assert.equal(r.writes.length,0);
  assert.equal(r.confirmCount,0);
  assert.match(r.toasts.join(' '),/Preflight relasi Stok gagal/);
});

test('new period with zero receipts proceeds to normal confirmation', async () => {
  const r = await runUpload({receipts:[],allowConfirm:false});
  assert.equal(r.writes.length,0);
  assert.equal(r.confirmCount,1);
  assert.equal(r.toasts.length,0);
});

test('database guard is enforced before delete and semantic updates', () => {
  assert.match(migration,/before delete or update of/i);
  assert.match(migration,/inventory_purchase_log/i);
  assert.match(migration,/source_history_id\s*=\s*v_source/i);
  assert.match(migration,/before delete or update of\s+id, brand_id/i);
  assert.match(migration,/new\.id is not distinct from old\.id/i);
  assert.doesNotMatch(migration,/v_source\s*:=\s*new\.id\s*;/i);
  assert.match(migration,/raise exception using/i);
  assert.doesNotMatch(migration,/^\s*delete\s+from\s+public\./im);
  assert.doesNotMatch(migration,/^\s*update\s+public\./im);
  assert.doesNotMatch(migration,/^\s*insert\s+into\s+public\./im);
});


const parityMigration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261011180000_stock_reconciliation_ledger_parity.sql'), 'utf8');
const recoveryPreview = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'tests', 'purchase_stock_recovery_preflight_v1.sql'), 'utf8');

test('Stock screen reads only posted verified movements, not proposed draft BOM', () => {
  assert.match(parityMigration,/create or replace view public\.inventory_stock_reconciliation/i);
  assert.match(parityMigration,/security_invoker\s*=\s*true/i);
  assert.match(parityMigration,/LEFT JOIN inventory_movements m/i);
  assert.match(parityMigration,/m\.movement_type = 'SALE_CONSUMPTION'/i);
  assert.match(parityMigration,/m\.movement_date > b_1\.baseline_date/i);
  assert.match(parityMigration,/m\.movement_date <= CURRENT_DATE/i);
  assert.doesNotMatch(parityMigration,/JOIN inventory_recipe_components/i);
  assert.doesNotMatch(parityMigration,/JOIN sale_items\s+si/i);
});

test('recovery preview has no data-changing statements or action RPCs', () => {
  const stripped = recoveryPreview.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(stripped,/\b(insert\s+into|update\s+\w|delete\s+from|truncate\s+|drop\s+table|alter\s+table|call\s+)\b/i);
  assert.match(stripped,/BLOCK_SOURCE_UNIT_MISSING/);
  assert.match(stripped,/NEGATIVE_IS_VIRTUAL_RECIPE_USAGE/);
  assert.match(stripped,/finance_sales_sync_status_v1/);
});


const verifiedReceiptMigration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations',
    '20261011190000_guard_purchase_receipt_verified_units.sql'), 'utf8');
const pausedSyncRollback = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'rollback',
    '20261011190000_pause_purchase_stock_sync.sql'), 'utf8');
const purchaseUI = fs.readFileSync(
  path.join(__dirname, '..', 'purchase-finance-alignment-v1.js'), 'utf8');

// Independent business-rule fixtures; PostgreSQL trigger execution on a real
// isolated database remains a separate release gate.
function eligibilityFixture({sourceUnit, stockUnit, sourceQty=1, postedQty,
                            conversionFactor=null, verified=false,
                            ownerReviewed=false, reviewMultiplier=null}) {
  const unit = String(sourceUnit||'').trim().toLowerCase();
  const stock = String(stockUnit||'').trim().toLowerCase();
  if (!stock || !(sourceQty>0)) return false;
  let expected = null;
  if (ownerReviewed && reviewMultiplier>0) expected=sourceQty*reviewMultiplier;
  else if (unit && unit===stock) expected=sourceQty;
  else if (unit && verified && conversionFactor>0) expected=sourceQty*conversionFactor;
  return expected!=null && postedQty===expected;
}
test('no source unit or unverified pack conversion can inflate Stock', () => {
  assert.equal(eligibilityFixture({sourceUnit:null,stockUnit:'pcs',sourceQty:3,postedQty:3}),false);
  assert.equal(eligibilityFixture({sourceUnit:'pack',stockUnit:'pcs',sourceQty:1,postedQty:1}),false);
  assert.equal(eligibilityFixture({sourceUnit:'pack',stockUnit:'pcs',sourceQty:1,postedQty:20,conversionFactor:20,verified:false}),false);
  assert.equal(eligibilityFixture({sourceUnit:'pack',stockUnit:'pcs',sourceQty:1,postedQty:1,conversionFactor:20,verified:true}),false);
  assert.equal(eligibilityFixture({sourceUnit:'pack',stockUnit:'pcs',sourceQty:1,postedQty:20,conversionFactor:20,verified:true}),true);
  assert.equal(eligibilityFixture({sourceUnit:'pcs',stockUnit:'pcs',sourceQty:3,postedQty:3}),true);
  assert.equal(eligibilityFixture({sourceUnit:null,stockUnit:'pcs',sourceQty:3,postedQty:30,ownerReviewed:true,reviewMultiplier:10}),true);
  assert.equal(eligibilityFixture({sourceUnit:null,stockUnit:'pcs',sourceQty:3,postedQty:3,ownerReviewed:false,reviewMultiplier:10}),false);
});

test('new SQL receipt trigger defends direct writes and real unit conversions', () => {
  assert.match(verifiedReceiptMigration,/create trigger guard_purchase_receipt_unit_v1/i);
  assert.match(verifiedReceiptMigration,/before insert or update/i);
  assert.match(verifiedReceiptMigration,/source_history_id/i);
  assert.match(verifiedReceiptMigration,/public\.purchase_inventory_bridge/i);
  assert.match(verifiedReceiptMigration,/inventory_unit_conversions/i);
  assert.match(verifiedReceiptMigration,/status='verified'/i);
  assert.match(verifiedReceiptMigration,/v_conversion_count=1/i);
  assert.match(verifiedReceiptMigration,/b\.quantity_numeric\*v_factor/i);
  assert.match(verifiedReceiptMigration,/new\.source_history_id is distinct from old\.source_history_id/i);
  assert.match(verifiedReceiptMigration,/new\.id is distinct from old\.id/i);
  assert.match(verifiedReceiptMigration,/before delete on public\.inventory_purchase_log/i);
  assert.match(verifiedReceiptMigration,/not exists \(\s*select 1\s*from public\.inventory_purchase_log existing/i);
  assert.match(verifiedReceiptMigration,/pg_advisory_xact_lock/i);
  assert.match(migration,/pg_advisory_xact_lock/i);
  assert.match(verifiedReceiptMigration,/new\.qty is distinct from v_qty/i);
  assert.match(verifiedReceiptMigration,/new\.unit_cost is not null/i);
  assert.match(verifiedReceiptMigration,/on conflict \(source_history_id\)/i);
  assert.match(verifiedReceiptMigration,/on conflict \(source_history_id\)[\s\S]*?do nothing\s+returning id/i);
  assert.doesNotMatch(verifiedReceiptMigration,/on conflict \(source_history_id\)[\s\S]*?do update set/i);
});

test('automatic Purchase sync skips instead of posting unknown units', () => {
  assert.match(verifiedReceiptMigration,/create or replace function private\.sync_purchase_quantity_stock_v1/i);
  assert.match(verifiedReceiptMigration,/qualified as materialized/i);
  assert.match(verifiedReceiptMigration,/where b\.stock_qty>0/i);
  assert.match(verifiedReceiptMigration,/blocked_for_unit_review/i);
  assert.match(verifiedReceiptMigration,/new\.total_amount is distinct from b\.total_amount/i);
  assert.match(verifiedReceiptMigration,/status='verified'/i);
  assert.doesNotMatch(verifiedReceiptMigration,/drop table/i);
  assert.doesNotMatch(verifiedReceiptMigration,/delete from public\.inventory_purchase_log/i);
  assert.doesNotMatch(verifiedReceiptMigration,/update public\.inventory_purchase_log/i);
  assert.match(pausedSyncRollback,/emergency_stock_sync_paused/i);
  assert.doesNotMatch(pausedSyncRollback,/insert into public\.inventory_purchase_log/i);
  assert.match(purchaseUI,/Perlu verifikasi satuan/);
  assert.doesNotMatch(purchaseUI,/Siap sinkron/);
});


const ownerUnitApprovalMigration=fs.readFileSync(
  path.join(__dirname,'..','supabase','migrations',
    '20261011200000_owner_purchase_source_unit_attestations.sql'),'utf8');
const ownerUnitUI=fs.readFileSync(
  path.join(__dirname,'..','purchase-finance-alignment-v1.js'),'utf8');

test('Owner unit approval is documentary only and private, never Stock or Finance DML',()=>{
  assert.match(ownerUnitApprovalMigration,/create table if not exists private\.purchase_unit_attestations_v1/i);
  assert.match(ownerUnitApprovalMigration,/enable row level security/i);
  assert.match(ownerUnitApprovalMigration,/revoke all on private\.purchase_unit_attestations_v1 from public,anon,authenticated/i);
  assert.match(ownerUnitApprovalMigration,/private\.owner_stock_review_assert_v1\(\)/i);
  assert.match(ownerUnitApprovalMigration,/auth\.uid\(\)/i);
  assert.match(ownerUnitApprovalMigration,/not exists\(select 1 from public\.inventory_purchase_log/i);
  assert.match(ownerUnitApprovalMigration,/p_token is distinct from v_preview->>'token'/i);
  assert.match(ownerUnitApprovalMigration,/will_post_stock',false/i);
  assert.match(ownerUnitApprovalMigration,/will_change_finance',false/i);
  assert.match(ownerUnitApprovalMigration,/unique index if not exists purchase_unit_attestations_one_active_source_v1/i);
  assert.match(ownerUnitApprovalMigration,/to authenticated,service_role/i);
  assert.doesNotMatch(ownerUnitApprovalMigration,/insert into public\.inventory_purchase_log/i);
  assert.doesNotMatch(ownerUnitApprovalMigration,/insert into public\.inventory_movements/i);
  assert.doesNotMatch(ownerUnitApprovalMigration,/insert into public\.finance_/i);
});

test('Owner verification UI requires preview before persistence and has no auto-post path',()=>{
  assert.match(ownerUnitUI,/function ownerUnitRole\(\).*role==='owner'/);
  assert.match(ownerUnitUI,/async function unitPreviewSelected\(/);
  assert.match(ownerUnitUI,/owner_purchase_unit_preview_v1/);
  assert.match(ownerUnitUI,/owner_purchase_unit_apply_v1/);
  assert.match(ownerUnitUI,/owner_purchase_unit_revoke_v1/);
  assert.match(ownerUnitUI,/unitPreview\.token/);
  assert.match(ownerUnitUI,/unitVerificationMarkup\(\)\+/);
  assert.match(ownerUnitUI,/Belum ada perubahan saldo Stok maupun jurnal Keuangan/);
  const apply=ownerUnitUI.slice(ownerUnitUI.indexOf('async function unitApplySelected()'),ownerUnitUI.indexOf('async function unitRevokeSelected()'));
  assert.doesNotMatch(apply,/syncStockForPeriod/);
  assert.doesNotMatch(apply,/notify\('purchase-stock-synced'\)/);
});


const readOnlyReleaseGateSql=fs.readFileSync(
  path.join(__dirname,'..','supabase','tests',
    'p0_live_release_gate_read_only_20261011.sql'),'utf8');
test('Production release gate stays SELECT-only and checks Purchase, Sales, Stock & provenance',()=>{
  const sections=readOnlyReleaseGateSql.split(/(?=-- [1-4]\. )/).slice(1);
  assert.equal(sections.length,4);
  for(const [index,part] of sections.entries()){
    const sql=part.replace(/^--.*$/gm,'').trim();
    assert.match(sql,/^(select|with)\b/i,'Audit section '+(index+1)+' must be read-only SELECT/CTE');
    assert.doesNotMatch(sql,/\b(?:insert\s+into|delete\s+from|update\s+\w+|drop\s+\w+|alter\s+\w+|grant\s+|revoke\s+|create\s+\w+|call\s+)\b/i);
  }
  assert.match(readOnlyReleaseGateSql,/finance_purchase_reconciliation_monthly_v1/);
  assert.match(readOnlyReleaseGateSql,/finance_sales_sync_status_v1/);
  assert.match(readOnlyReleaseGateSql,/purchase_journal_delta/);
  assert.match(readOnlyReleaseGateSql,/journal_balance_delta/);
  assert.match(readOnlyReleaseGateSql,/inventory_stock_reconciliation/);
  assert.match(readOnlyReleaseGateSql,/inventory_purchase_log/);
  assert.match(readOnlyReleaseGateSql,/owner_unit_table_live/);
  assert.match(readOnlyReleaseGateSql,/orphan_receipt_count/);
});


const orphanActiveLedgerMigration=fs.readFileSync(path.join(
 __dirname,'..','supabase','migrations',
 '20261011210000_private_orphan_active_ledger_gate.sql'),'utf8');
const stage0SnapshotSql=fs.readFileSync(path.join(
 __dirname,'..','supabase','tests',
 'p0_stage0_baseline_checksum_read_only_20261011.sql'),'utf8');
test('P0 #1 private orphan ledger gate is readonly and detects post-opname exposure',()=>{
 const body=orphanActiveLedgerMigration.replace(/^--.*$/gm,'').trim();
 assert.match(body,/view private\.orphan_receipt_active_ledger_gate_v1/i);
 assert.match(body,/security_invoker\s*=\s*true/i);
 assert.match(body,/revoke all on private\.orphan_receipt_active_ledger_gate_v1/i);
 assert.match(body,/source_history_id is not null and p\.id is null/i);
 assert.match(body,/movement_integrity_failed/i);
 assert.match(body,/active_ledger_exposure/i);
 assert.match(body,/BLOCK_RELEASE_ACTIVE_ORPHAN/);
 assert.match(body,/BLOCK_RELEASE_RECEIPT_MOVEMENT_MISMATCH/);
 assert.doesNotMatch(body,/\b(?:insert\s+into|delete\s+from|update\s+\w+|alter\s+table|truncate\s+table)\b/i);
});
test('Stage 0 fingerprint is read-only, deterministic and explicitly not a backup',()=>{
 const body=stage0SnapshotSql.replace(/^--.*$/gm,'').trim();
 assert.match(body,/^with report as/i);
 assert.match(body,/string_agg\(row_to_json\(x\)::text,E'\\n' order by x\.id::text\)/i);
 for(const table of ['offline_purchase_history','inventory_purchase_log','inventory_movements',
                    'inventory_stock_opname','purchase_import_evidence','inventory_items'])
   assert.match(body,new RegExp('public\\.'+table+'\\b','i'));
 assert.doesNotMatch(body,/\b(?:insert\s+into|delete\s+from|update\s+\w+|alter\s+\w+|drop\s+\w+|grant\s+|revoke\s+|create\s+\w+)\b/i);
});


const unitMappingTriageMigration=fs.readFileSync(
 path.join(__dirname,'..','supabase','migrations',
  '20261011220000_private_purchase_unit_mapping_triage.sql'),'utf8');
const unitMappingLiveAudit=fs.readFileSync(
 path.join(__dirname,'..','supabase','tests',
  'p0_unit_conversion_live_audit_read_only_20261011.sql'),'utf8');
test('P0 #2 unit conversion review stays private and refuses to auto-certify unknown factors',()=>{
 assert.match(unitMappingTriageMigration,/with\s*\(security_invoker\s*=\s*true\)/i);
 assert.match(unitMappingTriageMigration,/private\.inventory_unit_conversion_triage_v1/);
 assert.match(unitMappingTriageMigration,/private\.purchase_unit_mapping_gate_v1/);
 assert.match(unitMappingTriageMigration,/BLOCK_MASTER_UNIT_PLACEHOLDER/);
 assert.match(unitMappingTriageMigration,/BLOCK_MASTER_SALE_UNIT_CONFLICT/);
 assert.match(unitMappingTriageMigration,/BLOCK_DUPLICATE_OR_CONTRADICTING_FACTORS/);
 assert.match(unitMappingTriageMigration,/REVIEW_DUPLICATE_UNVERIFIED_RULES/);
 assert.match(unitMappingTriageMigration,/REVIEW_MISSING_PURCHASE_UNIT/);
 assert.match(unitMappingTriageMigration,/revoke all on private\.inventory_unit_conversion_triage_v1/);
 assert.doesNotMatch(unitMappingTriageMigration,/\b(?:insert\s+into|update\s+\w+|delete\s+from|alter\s+table|truncate\s+table)\b/i);
});
test('P0 #2 live production audit is strictly SELECT only and checks all four missing-unit gates',()=>{
 const sections=unitMappingLiveAudit.split(/(?=-- [A-E]\. )/).slice(1);
 assert.equal(sections.length,5);
 for(const part of sections){
  const statement=part.replace(/^--.*$/gm,'').trim();
  assert.match(statement,/^(select|with)\b/i);
  assert.doesNotMatch(statement,/\b(?:insert\s+into|update\s+\w+|delete\s+from|drop\s+\w+|alter\s+\w+|grant\s+|revoke\s+|create\s+\w+)\b/i);
 }
 for(const text of ['inventory_items','inventory_unit_conversions',
                   'purchase_inventory_bridge','inventory_purchase_log',
                   'inventory_stock_reconciliation','mapping_status'])
  assert.match(unitMappingLiveAudit,new RegExp(text,'i'));
});
test('Owner unit preview never trusts a conflict with VERIFIED conversion or placeholder master unit',()=>{
 assert.match(ownerUnitApprovalMigration,/v_conflicts>0/);
 assert.match(ownerUnitApprovalMigration,/v_verified_count>1/);
 assert.match(ownerUnitApprovalMigration,/p_multiplier<>v_verified_factor/);
 assert.match(ownerUnitApprovalMigration,/v_rule_snapshot/);
 assert.match(ownerUnitApprovalMigration,/rule_catalog_snapshot/);
 assert.match(ownerUnitApprovalMigration,/MASTER_UNIT_NEEDS_CORRECTION/);
 assert.match(ownerUnitUI,/blockedMaster=active\.status==='MASTER_UNIT_NEEDS_CORRECTION'/);
 assert.match(ownerUnitUI,/Perbaiki satuan master/);
 assert.match(ownerUnitUI,/Jangan mengisi faktor konversi atau posting/);
});


const ownerSafeConversionMigration=fs.readFileSync(path.join(
 __dirname,'..','supabase','migrations',
 '20261011223000_owner_conversion_no_recipe_bom.sql'),'utf8');
const erpActionUi=fs.readFileSync(path.join(__dirname,'..','erp-actions.js'),'utf8');
test('Legacy conversion is fail closed and Owner ERP verification never rewrites active recipe/BOM',()=>{
 assert.match(ownerSafeConversionMigration,/private\.guard_verified_inventory_conversion_v1/);
 assert.match(ownerSafeConversionMigration,/private\.owner_stock_review_assert_v1\(\)/);
 assert.match(ownerSafeConversionMigration,/create trigger guard_verified_inventory_conversion_v1\s+before insert or update or delete on public\.inventory_unit_conversions/i);
 assert.match(ownerSafeConversionMigration,/returns trigger language plpgsql security invoker/i);
 assert.match(ownerSafeConversionMigration,/current_user is distinct from/i);
 assert.match(ownerSafeConversionMigration,/Direct conversion verification forbidden/);
 assert.match(ownerSafeConversionMigration,/create or replace function private\.apply_inventory_unit_conversion/i);
 assert.match(ownerSafeConversionMigration,/Konversi lama dihentikan/);
 assert.match(ownerSafeConversionMigration,/create or replace function private\.resolve_inventory_conversion_ui/i);
 assert.match(ownerSafeConversionMigration,/length\(btrim\(coalesce\(p_reason,''\)\)\)<20/);
 assert.match(ownerSafeConversionMigration,/v_before\.units_per_purchase_unit is distinct from p_units_per_purchase_unit/);
 assert.match(ownerSafeConversionMigration,/qty_per_sale',null/);
 assert.match(ownerSafeConversionMigration,/recipe_bom_modified',false/);
 assert.match(ownerSafeConversionMigration,/private\.write_audit_log/);
 assert.doesNotMatch(ownerSafeConversionMigration,/\binsert\s+into\s+public\.inventory_recipe_components/i);
 assert.doesNotMatch(ownerSafeConversionMigration,/\bupdate\s+public\.inventory_recipe_components/i);
 assert.doesNotMatch(ownerSafeConversionMigration,/\binsert\s+into\s+public\.inventory_movements/i);
 assert.doesNotMatch(ownerSafeConversionMigration,/\binsert\s+into\s+public\.inventory_purchase_log/i);
 assert.match(erpActionUi,/source_reference/);
 assert.match(erpActionUi,/confirm_packaging/);
 assert.match(erpActionUi,/tidak.*mengubah resep\/BOM/);
});


const ownerOrphanEvidenceMigration=fs.readFileSync(
 path.join(__dirname,'..','supabase','migrations',
 '20261011230000_owner_orphan_receipt_evidence_reviews.sql'),'utf8');
const ownerOrphanEvidencePause=fs.readFileSync(
 path.join(__dirname,'..','supabase','rollback',
 '20261011230000_pause_owner_orphan_receipt_reviews.sql'),'utf8');
const ownerOrphanUi=fs.readFileSync(
 path.join(__dirname,'..','owner-orphan-receipt-review-v1.js'),'utf8');
const ownerOrphanIndex=fs.readFileSync(
 path.join(__dirname,'..','index.html'),'utf8');
test('P0.1 Owner historical review cannot rewrite Stock, Finance or historical source UUIDs',()=>{
 assert.match(ownerOrphanEvidenceMigration,/create table if not exists private\.orphan_receipt_owner_reviews_v1/i);
 assert.match(ownerOrphanEvidenceMigration,/enable row level security/i);
 assert.match(ownerOrphanEvidenceMigration,/revoke all on private\.orphan_receipt_owner_reviews_v1/i);
 assert.match(ownerOrphanEvidenceMigration,/private\.owner_stock_review_assert_v1\(\)/i);
 assert.match(ownerOrphanEvidenceMigration,/private\.orphan_receipt_active_ledger_gate_v1/i);
 assert.match(ownerOrphanEvidenceMigration,/private\.inventory_receipt_lineage_triage_v1/i);
 assert.match(ownerOrphanEvidenceMigration,/source_snapshot jsonb not null/i);
 assert.match(ownerOrphanEvidenceMigration,/p_token is distinct from v_preview->>'token'/i);
 assert.match(ownerOrphanEvidenceMigration,/BLOCK_LEDGER_INTEGRITY_REPAIR/);
 assert.match(ownerOrphanEvidenceMigration,/COMMENT ON TABLE/i);
 assert.doesNotMatch(ownerOrphanEvidenceMigration,
   /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:inventory_purchase_log|offline_purchase_history|inventory_movements|finance_\w+)/i);
 assert.match(ownerOrphanEvidencePause,/P0\.1 PAUSED/);
 assert.doesNotMatch(ownerOrphanEvidencePause,/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i);
});
test('P0.1 historical UI is Owner-only and uses documentary-only RPCs',()=>{
 assert.match(ownerOrphanIndex,/\/owner-orphan-receipt-review-v1\.js\?v=1/);
 assert.match(ownerOrphanUi,/c&&c\.role==='owner'/);
 for(const call of ['owner_orphan_receipt_queue_v1','owner_orphan_receipt_preview_v1',
    'owner_orphan_receipt_apply_v1','owner_orphan_receipt_revoke_v1'])
    assert.match(ownerOrphanUi,new RegExp("db\\.rpc\\('"+call+"'"));
 assert.match(ownerOrphanUi,/preview=null/);
 assert.match(ownerOrphanUi,/Keputusan berubah\. Pratinjau ulang/);
 assert.match(ownerOrphanUi,/Tidak ada perubahan Stock, Finance atau source UUID/);
 assert.doesNotMatch(ownerOrphanUi,/db\.(?:from\(['"](?:inventory_movements|inventory_purchase_log|offline_purchase_history)|rpc\(['"]sync_purchase_quantity_stock_v1)/i);
});


const restoreAcceptanceAudit=fs.readFileSync(path.join(
 __dirname,'..','supabase','tests','p0_restore_acceptance_read_only_20261011.sql'),'utf8');
const backupOperatorScript=fs.readFileSync(path.join(
 __dirname,'..','scripts','p0_backup_hsn_supabase_free.ps1'),'utf8');
const releaseRecoveryRunbook=fs.readFileSync(path.join(
 __dirname,'..','docs','P0_RELEASE_UAT_AND_ROLLBACK_RUNBOOK_2026-10-11.md'),'utf8');
test('Hasnaria pre/post restore gate checks Auth, migration history, Storage, ledger and Finance read-only',()=>{
 const statement=restoreAcceptanceAudit.replace(/^--.*$/gm,'').trim();
 const stmts=statement.split(/;\s*(?=select f\.)/i);
 assert.equal(stmts.length,2);
 for(const part of stmts){
  assert.match(part,/^(with|select)\b/i);
  assert.doesNotMatch(part,/\b(?:insert\s+into|update\s+\w+|delete\s+from|drop\s+\w+|alter\s+\w+|grant\s+|revoke\s+|create\s+\w+)\b/i);
 }
 for(const name of ['auth.users','auth.identities','storage.buckets','storage.objects',
                    'supabase_migrations.schema_migrations','inventory_purchase_log',
                    'inventory_movements','inventory_unit_conversions',
                    'finance_purchase_reconciliation_monthly_v1','finance_sales_sync_status_v1'])
   assert.match(statement,new RegExp(name.replace(/\./g,'\\.'),'i'));
 assert.match(statement,/NOT_A_FULL_BACKUP_OR_LIVE_AUTH_UAT/);
 assert.match(statement,/BLOCK_AUTH_NOT_RESTORED/);
});
test('Supabase Free backup handoff captures migration history without claiming Auth or Storage backup',()=>{
 assert.match(backupOperatorScript,/--role-only/);
 assert.match(backupOperatorScript,/--use-copy --data-only/);
 assert.match(backupOperatorScript,/--schema supabase_migrations/);
 assert.match(backupOperatorScript,/Get-FileHash -LiteralPath \$_ -Algorithm SHA256/);
 assert.match(backupOperatorScript,/auth_users_restored_and_login_tested = \$false/);
 assert.match(backupOperatorScript,/physical_storage_objects_included = \$false/);
 assert.match(backupOperatorScript,/restore_verified = \$false/);
 assert.doesNotMatch(backupOperatorScript,/\b(?:supabase db reset|supabase db push|psql .*--file|drop database)\b/i);
 assert.match(releaseRecoveryRunbook,/p0_restore_acceptance_read_only_20261011\.sql/);
 assert.match(releaseRecoveryRunbook,/20261011230000/);
 assert.match(releaseRecoveryRunbook,/Akun `auth\.users`\s*\|\s*\*\*4\*\*/i);
});


const ownerMasterUnitReviewMigration=fs.readFileSync(path.join(__dirname,'..',
 'supabase','migrations','20261011233000_owner_master_unit_evidence_review.sql'),'utf8');
const ownerMasterUnitUI=fs.readFileSync(path.join(__dirname,'..',
 'owner-master-unit-review-v1.js'),'utf8');
test('P0.2 Owner SKU master review is private, signed and documentary only',()=>{
 assert.match(ownerMasterUnitReviewMigration,/private\.inventory_master_unit_attestations_v1/);
 assert.match(ownerMasterUnitReviewMigration,/alter table private\.inventory_master_unit_attestations_v1 enable row level security/i);
 assert.match(ownerMasterUnitReviewMigration,/revoke all on private\.inventory_master_unit_attestations_v1/i);
 assert.match(ownerMasterUnitReviewMigration,/private\.owner_stock_review_assert_v1\(\)/);
 assert.match(ownerMasterUnitReviewMigration,/private\.owner_master_unit_preview_v1/);
 assert.match(ownerMasterUnitReviewMigration,/private\.owner_master_unit_apply_v1/);
 assert.match(ownerMasterUnitReviewMigration,/private\.owner_master_unit_revoke_v1/);
 assert.match(ownerMasterUnitReviewMigration,/pg_advisory_xact_lock/);
 assert.match(ownerMasterUnitReviewMigration,/p_token is distinct from v_source->>'token'/);
 assert.match(ownerMasterUnitReviewMigration,/DOCUMENTED_NOT_APPLIED/);
 assert.match(ownerMasterUnitReviewMigration,/grant execute on function public\.owner_master_unit_queue_v1/);
 assert.doesNotMatch(ownerMasterUnitReviewMigration,
  /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:inventory_items|inventory_movements|inventory_purchase_log|inventory_recipe_components|offline_purchase_history|finance_\w+)/i);
});
test('Owner master-unit web view cannot directly post Stock or change BOM',()=>{
 assert.match(ownerOrphanIndex,/owner-master-unit-review-v1\.js\?v=1/);
 assert.match(ownerMasterUnitUI,/c&&c\.role==='owner'/);
 for(const rpc of ['owner_master_unit_queue_v1','owner_master_unit_preview_v1',
     'owner_master_unit_apply_v1','owner_master_unit_revoke_v1'])
   assert.match(ownerMasterUnitUI,new RegExp("db\\.rpc\\('"+rpc+"'"));
 assert.match(ownerMasterUnitUI,/sessionContext===window\.__HASNARIA_CONTEXT/);
 assert.match(ownerMasterUnitUI,/monitorAppVisibility/);
 assert.match(ownerOrphanUi,/monitorAppVisibility/);
 assert.match(ownerMasterUnitUI,/snapshot|pratinjau ulang/i);
 assert.doesNotMatch(ownerMasterUnitUI,
  /db\.(?:from\(['"](?:inventory_items|inventory_movements|inventory_purchase_log|inventory_recipe_components)|rpc\(['"]sync_purchase_quantity_stock_v1)/i);
});


const masterReviewPause=fs.readFileSync(path.join(__dirname,'..',
 'supabase','rollback','20261011233000_pause_owner_master_unit_reviews.sql'),'utf8');
test('P0.2 master evidence emergency pause keeps read-only queue and old evidence',()=>{
 assert.match(masterReviewPause,/create or replace function private\.owner_master_unit_apply_v1/i);
 assert.match(masterReviewPause,/create or replace function private\.owner_master_unit_revoke_v1/i);
 assert.match(masterReviewPause,/private\.owner_stock_review_assert_v1\(\)/);
 assert.match(masterReviewPause,/P0\.2 PAUSED/);
 assert.doesNotMatch(masterReviewPause,/\b(?:insert\s+into|delete\s+from|update\s+\w+|drop\s+table|truncate\s+table)\b/i);
});
