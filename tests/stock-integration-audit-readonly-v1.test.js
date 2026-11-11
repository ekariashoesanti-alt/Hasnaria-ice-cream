'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('stock-control-v3.js');
const css=read('stock-control-v3.css');
const b=read('stock-v3-runtime-fix.js');
function section(a,z){const i=js.indexOf(a),j=js.indexOf(z,i);assert.ok(i>=0&&j>i,a);return js.slice(i,j)}
const integ=section('async function loadIntegrationAudit()', '// Independent virtual view:');
test('Owner-only integration audit is lazy and cannot delay first dashboard paint',()=>{
 assert.match(integ,/if\(!isOwner\(\)\|\|S\.modal!=='formula-audit'\)return/);
 assert.match(integ,/S\.integrationPeriod=period/);
 assert.match(integ,/Promise\.allSettled\(\[/);
 const mount=section('function mount(force) {','function watch() {');
 const period=section('async function loadPeriodData(force)', 'async function loadLedger()');
 const base=section('async function loadBase()','function schedulePendingCommittedRefresh()');
 for(const body of [mount,period,base]){
   assert.doesNotMatch(body,/loadIntegrationAudit\(/);
   assert.doesNotMatch(body,/ui_stock_sales_link_audit_v1/);
   assert.doesNotMatch(body,/inventory_purchase_backfill_audit_p5_v1\?/);
 }
 const formula=section('async function loadFormulaAudit()', 'function renderFormulaAudit()');
 assert.match(formula,/loadIntegrationAudit\(\)/);
});
test('Sales and purchase reconciliation is period and brand scoped, reads are GET only',()=>{
 assert.match(integ,/request\('ui_stock_sales_link_audit_v1\?'/);
 assert.match(integ,/request\('inventory_purchase_backfill_audit_p5_v1\?'/);
 assert.match(integ,/brand_id:'eq\.'\+BRAND/);
 assert.match(integ,/period_month:'eq\.'\+from/);
 assert.match(integ,/source_period:'eq\.'\+from/);
 assert.match(integ,/purchase_date,item_name,quantity_text,unit_text,inventory_qty,mapping_status,backfill_status,ready_for_inventory,inventory_item_id/);
 assert.match(integ,/seq!==S\.integrationSeq/);
 assert.match(integ,/monthKey\(S\.period\)!==period/);
 assert.doesNotMatch(integ,/\b(method:|POST|PATCH|DELETE|INSERT|UPDATE|UPSERT)\b/);
});
test('No fake stock posting when source incomplete and counters are non-additive',()=>{
 assert.match(integ,/purchasePending:countStatus\('READY_NOT_POSTED'\)/);
 assert.match(integ,/purchaseReview:rows\?countStatus\('REVIEW'\)\+unknown:null/);
 assert.match(integ,/Tidak ada transaksi yang otomatis dibukukan/);
 assert.match(integ,/Kategori penyebab bisa tumpang-tindih/);
 assert.match(integ,/Belum berarti barang diterima/);
 assert.match(integ,/S\.integrationError='Sebagian sumber gagal dibaca/);
 assert.match(js,/S\.modal='recipes';loadRecipeReview\(\)/);
 assert.match(js,/stockNavigate\('pembelian'\)/);
});
test('Audit stays inside existing scrollable Formula modal and Stock dashboard keeps one view',()=>{
 assert.match(js,/return renderIntegrationAudit\(\)\+'<div class="sc20-cards"/);
 assert.match(js,/data-sc24-review="recipes"/);
 assert.match(js,/data-sc24-review="pembelian"/);
 assert.match(css,/#stok \.sc24-integration\{/);
 assert.match(css,/#stok \.sc24-title/);
 assert.match(css,/#stok \.sc24-actions/);
 assert.match(css,/#stok \.sc4-modal-body:has\(\.sc20-cards\)\{/);
 assert.match(js,/stock-control-v3\.css\?v=34/);
 assert.match(b,/stock-control-v3\.js\?v=40/);
 const dashboard=section('function render() {','function stockDialogFocus(');
 assert.ok(dashboard.includes('<div class="sc22-dual"'),'main dashboard still has two-column stock charts');
 assert.match(dashboard,/monthlyStockEndInfographic\(\)/);
 assert.match(dashboard,/stockSafetyInfographic\(\)/);
 assert.doesNotMatch(dashboard,/loadIntegrationAudit\(/);
});

test('Recovery read-only audit distinguishes posted, pending, review and non-stock',()=>{
 assert.match(integ,/countStatus\('POSTED'\)/);
 assert.match(integ,/countStatus\('POSTED_LEGACY_SOURCE'\)/);
 assert.match(integ,/purchasePending:countStatus\('READY_NOT_POSTED'\)/);
 assert.match(integ,/purchaseNonStock:countStatus\('NON_STOCK'\)/);
 assert.match(integ,/purchaseReview:rows\?countStatus\('REVIEW'\)\+unknown:null/);
 assert.match(integ,/source_period:'eq\.'\+from/);
 assert.match(integ,/Ada status pembelian yang belum dikenali/);
 assert.doesNotMatch(integ,/request\('inventory_movements\?/);
});

test('Owner can open the read-only integration audit from Detail Stok, without adding a dashboard toolbar button',()=>{
 const modal=section('function renderModal() {','function render() {');
 const header=section('function renderHeader() {','function renderUploadChoices()');
 assert.match(modal,/data-sc4-modal="formula-audit">Audit Integrasi/);
 assert.match(modal,/sc28-detail-quick/);
 assert.doesNotMatch(header,/data-sc4-modal="formula-audit"/);
 const actions=section('function bind(host) {','function mount(force) {');
 assert.match(actions,/S\.modal === 'formula-audit'\) loadFormulaAudit\(\)/);
});

test('Stage 2 Owner triage is lazy, read-only and prioritizes real purchase and BOM blockers',()=>{
 assert.match(integ,/request\('ui_stock_recipe_review_v1\?'/);
 assert.match(integ,/select:'product_name,sale_item_rows,sold_units,active_components,verified_components,pending_components,recipe_status,review_state'/);
 assert.match(integ,/order:'sale_item_rows.desc,product_name.asc'/);
 assert.match(integ,/brand_id:'eq\.'\+BRAND/);
 assert.match(integ,/period_month:'eq\.'\+from/);
 assert.match(integ,/purchaseSourceUnitMissing:sourceUnitsMissing/);
 assert.match(integ,/purchaseRows:openRows/);
 assert.match(integ,/purchaseUnknown:unknown/);
 assert.match(integ,/recipePendingComponents:pendingComponents/);
 assert.match(integ,/recipePendingApproval:pendingApproval/);
 assert.match(integ,/recipeMissingBOM:missingBOM/);
 assert.match(integ,/data-sc24-review="recipes"/);
 assert.match(integ,/sc24-queue/);
 assert.match(integ,/sourceUnitsMissing=rows\?rows\.filter/);
 assert.match(integ,/Status siap teknis BUKAN bukti barang diterima/);
 assert.match(integ,/tidak ada posting dari daftar ini/i);
 assert.doesNotMatch(integ,/request\('inventory_movements\?/);
 assert.doesNotMatch(integ,/\b(?:method:|POST|PATCH|DELETE|INSERT|UPDATE|UPSERT)\b/);
 const mount=section('function mount(force) {','function watch() {');
 assert.doesNotMatch(mount,/ui_stock_recipe_review_v1\?/);
 assert.doesNotMatch(mount,/inventory_purchase_backfill_audit_p5_v1\?/);
});
