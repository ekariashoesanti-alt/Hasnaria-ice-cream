const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const trackerPath = path.join(root, 'docs', 'HASNARIA_ERP_TRACKER.json');
const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ownerShellSource = fs.readFileSync(path.join(root, 'owner-shell-guard.js'), 'utf8');
const ownerFinanceStockSource = fs.readFileSync(path.join(root, 'owner-finance-stock-v3.js'), 'utf8');
const purchaseBasisSource = fs.readFileSync(path.join(root, 'finance-purchase-basis-v1.js'), 'utf8');
const operationalBridgeSource = fs.readFileSync(path.join(root, 'operational-role-bridge.js'), 'utf8');
const operationalSource = fs.readFileSync(path.join(root, 'operational-v1.js'), 'utf8');
const purchasePreloadSource = fs.readFileSync(path.join(root, 'xlsx-preload.js'), 'utf8');
const purchaseInventorySource = fs.readFileSync(path.join(root, 'purchase-inventory-status.js'), 'utf8');
const purchaseFinanceSource = fs.readFileSync(path.join(root, 'purchase-finance-alignment-v1.js'), 'utf8');
const purchaseFinanceCss = fs.readFileSync(path.join(root, 'purchase-finance-alignment-v1.css'), 'utf8');
const purchaseSplitMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260926082000_purchase_value_expense_stock_quantity_split.sql'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('ERP tracker test failed: ' + msg);
    process.exit(1);
  }
}

const allowedStatus = new Set(['TODO','IN_PROGRESS','BLOCKED','REVIEW','DONE']);
const allowedPriority = new Set(['P0','P1','P2']);
const milestoneIds = new Set((data.milestones || []).map(m => m.id));
const ids = new Set();

assert(Array.isArray(data.milestones) && data.milestones.length > 0, 'milestones missing');
assert(Array.isArray(data.tasks) && data.tasks.length > 0, 'tasks missing');
assert(data.milestones.reduce((s,m)=>s+Number(m.weight||0),0) === 100, 'milestone weights must total 100');

for (const task of data.tasks) {
  assert(/^HSN-\d+$/.test(task.id), 'invalid task id ' + task.id);
  assert(!ids.has(task.id), 'duplicate task id ' + task.id);
  ids.add(task.id);
  assert(milestoneIds.has(task.milestone), 'unknown milestone for ' + task.id);
  assert(allowedStatus.has(task.status), 'invalid status for ' + task.id);
  assert(allowedPriority.has(task.priority), 'invalid priority for ' + task.id);
  assert(typeof task.title === 'string' && task.title.trim(), 'missing title for ' + task.id);
  assert(typeof task.acceptance === 'string' && task.acceptance.trim(), 'missing acceptance for ' + task.id);
  assert(Array.isArray(task.dependencies), 'dependencies must be an array for ' + task.id);
}

for (const task of data.tasks) {
  for (const dep of task.dependencies) {
    assert(ids.has(dep), 'unknown dependency ' + dep + ' referenced by ' + task.id);
    assert(dep !== task.id, 'self dependency on ' + task.id);
  }
}

assert(appSource.includes("var OWNER_SHELL = '/owner-shell-guard.js?v=2';"), 'owner navigation guard cache version is current');
assert(appSource.includes("function afterCore(){load(OWNER_SHELL);load('/finance-purchase-basis-v1.js?v=1');load('/xlsx-preload.js?v=3')"), 'Purchase-basis retirement patch loads globally after core before business modules');
assert(ownerShellSource.includes("c.role!=='owner'"), 'guard is scoped to Owner role only');
assert(ownerShellSource.includes('c.navigate=safeNavigate'), 'ERP module navigation is redirected to the safe Owner navigator');
assert(ownerShellSource.includes('event.stopPropagation();'), 'Owner top navigation blocks legacy target/bubble tab render');
assert(!ownerShellSource.includes('event.stopImmediatePropagation();'), 'Stock capture listener remains able to run on the same document node');
assert(ownerShellSource.includes("typeof window.__hasnariaReloadSales==='function'"), 'Sales renderer is explicitly restored when needed');
assert(ownerShellSource.includes("data-owner-shell-stock-nudge"), 'Stock reconciliation renderer is explicitly woken after safe navigation');
assert(!/\.(?:from|insert|update|delete|rpc)\s*\(/.test(ownerShellSource), 'navigation guard contains no database mutation/query path');

assert(ownerFinanceStockSource.includes("finance-purchase-basis-v1.js?v=1"), 'Owner Finance must load Purchase-basis reporting');
assert(!ownerFinanceStockSource.includes('finance-no-hpp-mode-v1.js'), 'legacy no-HPP override must stay retired');
assert(!ownerFinanceStockSource.includes('finance-provisional-sync-v1.js'), 'legacy provisional HPP panel must stay retired');
assert(!ownerShellSource.includes('finance-hpp-p3.js'), 'HPP workbench must not be loaded by Owner shell');
assert(purchaseBasisSource.includes("finance_income_statement_purchase_basis_v1"), 'Finance Purchase-basis UI must read the canonical Purchase-basis view');
assert(purchaseBasisSource.includes('Beban Administrasi') && purchaseBasisSource.includes('Beban Pemeliharaan') && purchaseBasisSource.includes('Beban Bahan Baku') && purchaseBasisSource.includes('Beban Kepegawaian'), 'Finance report must expose the four approved expense categories');

assert(!purchasePreloadSource.includes('purchase-rankings-five.js'), 'legacy Purchase ranking patch must not load beside canonical Finance reconciliation');
assert(!purchasePreloadSource.includes('purchase-chart-redesign.js'), 'legacy Purchase chart patch must not race the canonical Purchase DOM');
assert(purchasePreloadSource.includes("purchase-finance-alignment-v1.css?v=2"), 'canonical Purchase Finance layout cache version must be current');
assert(purchasePreloadSource.includes("purchase-finance-alignment-v1.js?v=2"), 'Purchase expense-stock split runtime cache version must be current');
assert(!purchaseInventorySource.includes('pa-stock-grid'), 'Purchase inventory helper must not inject detailed Stock cards back into Pembelian');
assert(!purchaseInventorySource.includes("querySelectorAll('.pa-lower-grid article')"), 'Purchase inventory helper must remain KPI-only');
assert(purchaseFinanceCss.includes(':has(>#purchaseFinanceAlignment)'), 'Purchase canonical layout must activate only when Finance reconciliation is present');
assert(purchaseFinanceCss.includes('>.pa-main-grid') && purchaseFinanceCss.includes('>.pa-lower-grid'), 'legacy Purchase analytics grids must be removed from canonical layout');
assert(purchaseFinanceSource.includes("finance_purchase_dual_posting_v1"), 'Purchase screen must read the dual expense-and-stock view');
assert(purchaseFinanceSource.includes("sync_purchase_quantity_stock_v1"), 'Purchase screen must sync eligible quantities into Stock');
assert(purchaseFinanceSource.includes('6100 · Beban Administrasi') && purchaseFinanceSource.includes('6110 · Beban Pemeliharaan') && purchaseFinanceSource.includes('6120 · Beban Bahan Baku') && purchaseFinanceSource.includes('6200 · Beban Kepegawaian'), 'Purchase screen must expose the four expense account codes');
assert(!purchaseFinanceSource.includes('Persediaan · 1300'), 'Purchase screen must not present inventory value as the management expense model');

assert(purchaseSplitMigration.includes("'6110','Beban Pemeliharaan','EXPENSE'"), 'migration must create maintenance expense account');
assert(purchaseSplitMigration.includes("'6120','Beban Bahan Baku','EXPENSE'"), 'migration must create raw-material expense account');
assert(purchaseSplitMigration.includes("set name='Beban Kepegawaian'"), 'migration must align personnel expense naming');
assert(purchaseSplitMigration.includes('when rule_type is null and inventory_match_count=1 then quantity_numeric'), 'exact inventory-name purchases must post quantity 1:1');
assert(purchaseSplitMigration.includes("unit_cost=null"), 'Purchase-to-Stock upsert must remain quantity-only');
assert(purchaseSplitMigration.includes('finance_purchase_dual_posting_v1'), 'migration must expose dual finance/stock audit view');

assert(operationalBridgeSource.includes("Object.defineProperty(window,'__HASNARIA_OPERATIONS_V1_MOUNT'"), 'Operasional bridge intercepts mount assignment for an idempotency guard');
assert(operationalBridgeSource.includes("if(!force&&mounted())return"), 'observer-driven non-force Operasional mounts are skipped after the shell exists');
assert(operationalBridgeSource.includes('__hasnariaOperationalMountGuard'), 'wrapped Operasional mount is marked to prevent duplicate wrapping');
assert(operationalBridgeSource.includes("s.src='/operational-v1.js?v=3'"), 'Operasional runtime remains lazy-loaded only when needed');
assert(operationalBridgeSource.includes("state.navObserver.observe(tabs,{childList:true})"), 'Operasional bridge observes only direct navigation child changes');
assert(operationalBridgeSource.includes("state.mainObserver.observe(main,{childList:true})"), 'Operasional bridge observes only direct main-section child changes');
assert(!operationalBridgeSource.includes("observe(document.body,{childList:true,subtree:true})"), 'Operasional bridge must not observe the entire document subtree');
assert(operationalBridgeSource.includes('state.readyAttempts<80'), 'Operasional context readiness uses a bounded lightweight retry');
assert(!/\.(?:from|insert|update|delete|rpc)\s*\(/.test(operationalBridgeSource), 'Operasional bridge remains zero-query and zero-mutation');

assert(operationalSource.includes('var PAGE_SIZE=25;'), 'Operasional detail page budget must remain 25 rows');
assert(operationalSource.includes(".limit(30)"), 'Operasional run header budget must remain capped at 30');
assert(operationalSource.includes(".limit(100)"), 'Operasional member lookup must remain bounded');
assert(operationalSource.includes(".range(from,to)"), 'Operasional item details must remain server-paginated');
assert(operationalSource.includes("if(action==='new-opname'){state.createOpen=true;clearAction();render();loadMembers();return}"), 'member list must load only when the create-opname form opens');
const saveStart = operationalSource.indexOf('async function saveItem');
const submitStart = operationalSource.indexOf('async function submitRun');
assert(saveStart >= 0 && submitStart > saveStart, 'saveItem/submitRun boundaries must exist');
const saveItemSource = operationalSource.slice(saveStart, submitStart);
assert(saveItemSource.includes('Object.assign(item,row)'), 'single-row save must update local state from the RPC response');
assert(!saveItemSource.includes('loadItemPage('), 'single-row save must not reload the 25-row detail page');
assert(!saveItemSource.includes('loadRuns('), 'single-row save must not reload the 30-run header list');

console.log('ERP tracker test: PASS (' + data.tasks.length + ' tasks, ' + data.milestones.length + ' milestones; Purchase value→expense + quantity→stock split locked)');