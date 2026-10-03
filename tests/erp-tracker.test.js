const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const trackerPath = path.join(root, 'docs', 'HASNARIA_ERP_TRACKER.json');
const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const coreSource = fs.readFileSync(path.join(root, 'core-app.js'), 'utf8');
const erpSource = fs.readFileSync(path.join(root, 'erp.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navSource = fs.readFileSync(path.join(root, 'nav-patch.js'), 'utf8');
const accountManagerSource = fs.readFileSync(path.join(root, 'account-manager-v1.js'), 'utf8');
const accountManagerCss = fs.readFileSync(path.join(root, 'account-manager-v1.css'), 'utf8');
const staffV5Source = fs.readFileSync(path.join(root, 'staff-v5.js'), 'utf8');
const staffOwnerStableSource = fs.readFileSync(path.join(root, 'staff-owner-stable-v1.js'), 'utf8');
const ownerShellSource = fs.readFileSync(path.join(root, 'owner-shell-guard.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'owner-dashboard-one-view.js'), 'utf8');
const administrationSource = fs.readFileSync(path.join(root, 'administration-v1.js'), 'utf8');
const administrationCss = fs.readFileSync(path.join(root, 'administration-v1.css'), 'utf8');
const ownerFinanceStockSource = fs.readFileSync(path.join(root, 'owner-finance-stock-v3.js'), 'utf8');
const purchaseBasisSource = fs.readFileSync(path.join(root, 'finance-purchase-basis-v1.js'), 'utf8');
const salesBoardSource = fs.readFileSync(path.join(root, 'sales-board.js'), 'utf8');
const salesHourlySource = fs.readFileSync(path.join(root, 'sales-hourly-chart.js'), 'utf8');
const operationalBridgeSource = fs.readFileSync(path.join(root, 'operational-role-bridge.js'), 'utf8');
const operationalSource = fs.readFileSync(path.join(root, 'operational-v1.js'), 'utf8');
const purchasePreloadSource = fs.readFileSync(path.join(root, 'xlsx-preload.js'), 'utf8');
const purchaseInventorySource = fs.readFileSync(path.join(root, 'purchase-inventory-status.js'), 'utf8');
const purchaseFinanceSource = fs.readFileSync(path.join(root, 'purchase-finance-alignment-v1.js'), 'utf8');
const purchaseFinanceCss = fs.readFileSync(path.join(root, 'purchase-finance-alignment-v1.css'), 'utf8');
const purchaseSplitMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260926082000_purchase_value_expense_stock_quantity_split.sql'), 'utf8');
const purchasePeriodRpcFastPath = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260926104000_purchase_period_rpc_fast_path.sql'), 'utf8');
const canonicalPurchaseFinanceMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260926131500_simplify_purchase_finance_canonical_flow.sql'), 'utf8');
const purchaseControlRpcMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260926132000_purchase_control_period_rpc.sql'), 'utf8');
const financePeriodFastPath = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260926094000_finance_period_pack_fast_path.sql'), 'utf8');
const financeReportingFastPath = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260926094500_finance_reporting_pack_fast_path.sql'), 'utf8');
const performanceMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260927005000_performance_runtime_reduce_roundtrips.sql'), 'utf8');
const p1ActionFastPath = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260928010000_p1_dashboard_action_queue_fast_path.sql'), 'utf8');
const p1LazyBootstrap = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260928011000_p1_bootstrap_lazy_monthly_trend.sql'), 'utf8');

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

assert(appSource.includes("var OWNER_SHELL = '/owner-shell-guard.js?v=5';"), 'owner navigation guard cache version is current');
assert(!appSource.includes("load('/xlsx-preload.js?v=6');"), 'Purchase/XLSX must not load unconditionally at startup');
assert(appSource.includes('window.__HASNARIA_LOAD_PURCHASE=ensurePurchaseRuntime'), 'Purchase runtime must be exposed as a lazy loader');
assert(appSource.includes('window.__HASNARIA_LOAD_STOCK=ensureStockRuntime'), 'Stock runtime must be exposed as a lazy loader');
assert(appSource.includes("target==='pembelian'") && appSource.includes("target==='stok'"), 'Purchase and Stock runtimes must load from tab navigation');
assert(!indexSource.includes('xlsx.full.min.js'), 'SheetJS must not block initial page/login loading');
assert(indexSource.includes('/nav-patch.js?v=14'), 'UI-7 account navigation cache must be current');
assert(navSource.includes("/account-manager-v1.js?v=2") && navSource.includes("if(mode!=='password')ensureAccountManager()"), 'UI-7 account manager must lazy-load only from settings mode');
assert(accountManagerSource.includes('hamAccountSummary') && accountManagerSource.includes('hamDetailModal'), 'UI-7 account settings must render snapshot plus detail modal');
assert(accountManagerSource.includes("account_manager_list_v1") && accountManagerSource.includes("account_manager_upsert_v1") && accountManagerSource.includes("generate-account-link"), 'UI-7 account settings must preserve canonical account actions');
assert(accountManagerCss.includes('.ham-summary') && accountManagerCss.includes('.ham-modal-backdrop'), 'UI-7 account summary/modal styles must be present');
assert(staffV5Source.includes('PEGAWAI · DATA PER') && staffV5Source.includes("staff-detail-open"), 'UI-7 Staff portal must show employee snapshot and explicit detail overlay');
assert(staffV5Source.includes("staff_pin_login") && staffV5Source.includes("staff_owner_save"), 'UI-7 Staff portal must preserve PIN login and owner save flows');
assert(staffOwnerStableSource.includes('hso-ui7-summary') && staffOwnerStableSource.includes("data-hso-action=\"staff-detail\""), 'UI-7 Owner Mobile must use employee snapshot and isolated detail overlay');
assert(!appSource.includes("load('/finance-purchase-basis-v1.js"), 'Finance management runtime must be lazy-owned by the Owner Finance shell');
assert(appSource.includes("var SALES = '/sales-board.js?v=47';"), 'Sales lazy runtime cache version is current');
assert(appSource.includes('window.__HASNARIA_LOAD_SALES=ensureSalesRuntime'), 'Sales runtime must be exposed as a lazy loader');
assert(!appSource.includes('purchase-inventory-status.js'), 'startup must not load the legacy 10k-row Purchase inventory helper');
assert(!/function afterCore\(\)[\s\S]*?load\(SALES[,)]/.test(appSource), 'Sales must not be fetched unconditionally during application startup');
assert(!/function afterCore\(\)[\s\S]*?load\(STOCK[,)]/.test(appSource), 'Stock must not be fetched unconditionally during application startup');
assert(coreSource.includes('scheduleLegacyTabData(tab);'), 'core app must show/render before lazy legacy data finishes');
assert(coreSource.includes('legacyRequirements(id, force)') && coreSource.includes('if (role === "owner") return [];'), 'Owner startup must bypass legacy bulk datasets');
assert(!coreSource.includes('await loadAll();\n      show("app");'), 'app shell must not wait for legacy loadAll before becoming visible');

assert(indexSource.includes('/erp.js?v=ui2'), 'P1 ERP runtime cache version must be current');
assert(erpSource.includes("get_ui_bootstrap_v6"), 'Owner dashboard must use the P1 lightweight bootstrap');
assert(!erpSource.includes("get_ui_bootstrap_v5"), 'Owner dashboard must not call the superseded blocking bootstrap');
assert(erpSource.includes("get_ui_action_queue_active_v1"), 'Owner action queue must use the secure server-side fast path');
assert(erpSource.includes("get_ui_manual_input_requirements_v1"), 'Quality requirements must be loaded on demand');
assert(erpSource.includes("get_ui_monthly_trend_v1"), 'monthly management trend must be loaded on demand');
assert(erpSource.includes("ensurePageData(state.page)"), 'secondary Owner data must load after the blocking bootstrap has rendered');
assert(p1ActionFastPath.includes('security definer') && p1ActionFastPath.includes("set search_path=''"), 'P1 action RPC must keep a fixed definer security boundary');
assert(p1ActionFastPath.includes('private.same_brand(p_brand)'), 'P1 action RPC must authorize the brand once');
assert(p1ActionFastPath.includes("action_type not in ('missing_recipe','missing_component_cost','recipe_verification')"), 'retired HPP/recipe actions must stay outside the active queue');
assert(p1LazyBootstrap.includes('get_ui_bootstrap_v6') && p1LazyBootstrap.includes("'monthly_trend','[]'::jsonb"), 'P1 bootstrap must keep monthly trend off the critical path');
assert(p1LazyBootstrap.includes('get_ui_monthly_trend_v1') && p1LazyBootstrap.includes('private.same_brand(p_brand)'), 'lazy monthly trend RPC must retain authenticated brand isolation');

assert(ownerShellSource.includes('window.__HASNARIA_OWNER_SHELL_BOOTSTRAPPED'), 'Owner executive guard must remain idempotent');
assert(ownerShellSource.includes("var EXEC_SRC='/owner-executive-v1.js?v=1'"), 'Owner shell must load the executive one-view runtime');
assert(ownerShellSource.includes("var DASH_SRC='/owner-dashboard-one-view.js?v=4'"), 'Owner shell must load the UI-6 dashboard cache');
assert(dashboardSource.includes('__HASNARIA_DASHBOARD_UI6'), 'Dashboard UI-6 runtime marker must be present');
assert(dashboardSource.includes('get_ui_dashboard_pack_v1') && dashboardSource.includes('p_months:18'), 'Dashboard UI-6 must use the bounded canonical dashboard RPC');
assert(dashboardSource.includes("purchase_sync_state==='POSTED_CANONICAL'") && dashboardSource.includes("'POSTED'"), 'Dashboard must label journal-backed Purchase as POSTED instead of source MATCH');
assert(dashboardSource.includes('data-hx6-detail') && dashboardSource.includes('hx6-modal'), 'Dashboard UI-6 must keep breakdown detail behind a modal');
assert(!dashboardSource.includes("owner_executive_tab_v1"), 'Dashboard UI-6 must not return to the legacy executive aggregation RPC');
assert(ownerShellSource.includes("return !!(c&&c.role==='owner')"), 'Owner shell must remain scoped to Owner role');
assert(ownerShellSource.includes('window.__HASNARIA_EXECUTIVE_OWNER'), 'legacy navigation blocking must activate only in executive mode');
assert(ownerShellSource.includes('event.stopPropagation();'), 'Owner executive navigation must block legacy bubble handlers');
assert(!ownerShellSource.includes('event.stopImmediatePropagation();'), 'Owner guard must not suppress unrelated capture listeners');
assert(ownerShellSource.includes('c.navigate=safeNavigate'), 'Owner context navigation must be redirected to executive safe navigation');
assert(ownerShellSource.includes('if(++tries<80)setTimeout(boot,100)'), 'Owner executive bootstrap retry must stay bounded');
assert(!ownerShellSource.includes('owner-finance-stock-v3.js'), 'Owner shell must not load the legacy Finance/Stock shell in executive mode');
assert(ownerShellSource.includes("/administration-v1.js?v=2"), 'Owner shell must load the UI-5 Administrasi runtime cache');
assert(administrationSource.includes('__HASNARIA_ADMIN_V2'), 'Administrasi UI-5 runtime marker must be present');
assert(administrationSource.includes('ui_period_catalog_v1') && administrationSource.includes('ui_administration_overview_v1') && administrationSource.includes('ui_administration_category_chart_v1') && administrationSource.includes('ui_administration_detail_v1'), 'Administrasi UI-5 must use canonical period, overview, category, and detail views');
assert(administrationSource.includes('data-ad5-detail') && administrationSource.includes('ad5-modal'), 'Administrasi UI-5 must keep transaction detail behind a modal action');
assert(administrationCss.includes('.ad5-chart') && administrationCss.includes('.ad5-modal'), 'Administrasi UI-5 styles must include chart and modal layouts');
assert(!ownerShellSource.includes('finance-hpp-p3.js'), 'HPP workbench must not be loaded by Owner shell');
assert(!/\.(?:from|insert|update|delete|rpc)\s*\(/.test(ownerShellSource), 'Owner navigation guard contains no database mutation/query path');

assert(ownerFinanceStockSource.includes("finance-purchase-basis-v1.js?v=4"), 'Owner Finance shim must load Purchase-journal reporting v3');
assert(!ownerFinanceStockSource.includes('finance-no-hpp-mode-v1.js'), 'legacy no-HPP override must stay retired');
assert(!ownerFinanceStockSource.includes('finance-provisional-sync-v1.js'), 'legacy provisional HPP panel must stay retired');
assert(purchaseBasisSource.includes("get_finance_management_period_v1"), 'Finance management UI must read the journal-based management period RPC');
assert(purchaseBasisSource.includes('__HASNARIA_FINANCE_PURCHASE_BASIS_V3'), 'Finance management runtime must use the v3 idempotency guard');
assert(purchaseBasisSource.includes('purchase_control_current'), 'Finance Laba Rugi must surface Purchase-to-journal reconciliation control');
assert(!purchaseBasisSource.includes('Kontrol Purchase → Finance') && !purchaseBasisSource.includes('Sumber pembayaran</b>') && !purchaseBasisSource.includes('Relasi Stok</b>'), 'Finance Laba Rugi must keep the redundant reconciliation strip hidden');
assert(purchaseBasisSource.includes('patchHealth(r)'), 'Finance management UI must replace the legacy HPP health chip');
assert(purchaseBasisSource.includes('Beban Administrasi') && purchaseBasisSource.includes('Beban Pemeliharaan') && purchaseBasisSource.includes('Beban Bahan Baku') && purchaseBasisSource.includes('Beban Kepegawaian'), 'Finance report must expose the four approved expense categories');
assert(purchaseBasisSource.includes("observer.observe(h,{childList:true,subtree:true})"), 'Finance observer must be scoped to the Finance host');
assert(!purchaseBasisSource.includes("observe(document.body,{childList:true,subtree:true})"), 'Finance management runtime must not observe the whole document');
assert(financePeriodFastPath.includes('with tb as materialized'), 'period reporting pack must materialize the trial balance once');
assert(financePeriodFastPath.includes("'hpp_status','tidak digunakan pada model aktif'"), 'period reporting pack must keep HPP retired in report notes');
assert(financeReportingFastPath.includes("'income','[]'::jsonb"), 'reporting-pack bootstrap must stay lightweight and defer detail to the selected-period RPC');
assert(performanceMigration.includes('get_sales_hourly_month_v1'), 'Sales hourly aggregation must live in a server-side RPC');
assert(performanceMigration.includes('finance_journal_entries_purchase_provisional_idx'), 'Purchase provisional alert path must be indexed');
assert(performanceMigration.includes('PURCHASE_PAYMENT_PROVISIONAL'), 'Finance alerts must use the active Purchase-journal concept');
assert(!performanceMigration.includes('HPP_RECIPE_MISSING'), 'active Finance alerts must not restore retired HPP blockers');

assert(salesHourlySource.includes("db.rpc('get_sales_hourly_month_v1'"), 'hourly Sales chart must read the aggregated monthly RPC');
assert(!salesHourlySource.includes("from('sales')"), 'hourly Sales chart must not download raw Sales rows');
assert(!salesHourlySource.includes('limit(50000)'), '50k-row Sales fetch must stay retired');
assert(salesHourlySource.includes("host.classList.contains('hidden')"), 'hourly chart must not query while Sales is hidden');
assert(!salesBoardSource.includes('sales-hourly-chart.js'), 'Sales board must not inject a duplicate hourly runtime');

assert(!purchasePreloadSource.includes('purchase-rankings-five.js'), 'legacy Purchase ranking patch must not load beside canonical Finance reconciliation');
assert(!purchasePreloadSource.includes('purchase-chart-redesign.js'), 'legacy Purchase chart patch must not race the canonical Purchase DOM');
assert(purchasePreloadSource.includes("purchase-finance-alignment-v1.css?v=5"), 'canonical Purchase layout cache version must be current');
assert(purchasePreloadSource.includes("purchase-finance-alignment-v1.js?v=7"), 'canonical Purchase runtime cache version must be current');
assert(!purchaseInventorySource.includes('pa-stock-grid'), 'Purchase inventory helper must not inject detailed Stock cards back into Pembelian');
assert(!purchaseInventorySource.includes("querySelectorAll('.pa-lower-grid article')"), 'Purchase inventory helper must remain KPI-only');
assert(purchaseFinanceCss.includes(':has(>#purchaseFinanceAlignment)'), 'Purchase canonical layout must activate only when reconciliation is present');
assert(purchaseFinanceCss.includes('>.pa-kpis') && purchaseFinanceCss.includes('>.pa-main-grid') && purchaseFinanceCss.includes('>.pa-lower-grid'), 'legacy Purchase KPI and analytics grids must be removed from canonical layout');
assert(purchaseFinanceSource.includes("get_purchase_control_period_v1"), 'Purchase screen must use one selected-period detail/control RPC');
assert(purchaseFinanceSource.includes("ui_period_catalog_v1") && purchaseFinanceSource.includes("ui_purchase_overview_v1") && purchaseFinanceSource.includes("ui_purchase_category_chart_v1"), 'Purchase UI-3 must use canonical period, overview, and category views');
assert(purchaseFinanceSource.includes('data-pfa-detail-open') && purchaseFinanceSource.includes('pfa-modal'), 'Purchase UI-3 must keep transaction detail behind an explicit modal action');
assert(purchaseFinanceSource.includes('__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V12'), 'Purchase runtime must use the v11 idempotency guard');
assert(purchaseFinanceSource.includes('finance_link_status') && purchaseFinanceSource.includes('purchase_journal_delta'), 'Purchase screen must show the Finance reconciliation result');
assert(purchaseFinanceSource.includes('id="pfaCategory"'), 'Purchase canonical expense filter must be owned by the canonical panel');
assert(purchaseFinanceSource.includes("legacyScope.closest('label').style.display='none'"), 'legacy analytics scope must be hidden instead of repurposed');
assert(!purchaseFinanceSource.includes("e.target.id==='paScope'"), 'canonical category filter must not race the legacy Purchase renderer');
assert(purchaseFinanceSource.includes("sync_purchase_quantity_stock_v1"), 'Purchase screen must sync eligible quantities into Stock');
assert(!purchaseFinanceSource.includes('if(n(control.stock_ready_rows)>0)'), 'opening/rendering Purchase must not trigger Stock synchronization');
assert(purchaseFinanceSource.includes("addEventListener('hasnaria:purchase-imported'"), 'Stock synchronization must be triggered by a successful Purchase import event');
assert(purchaseFinanceSource.includes('6100 · Administrasi') && purchaseFinanceSource.includes('6110 · Pemeliharaan') && purchaseFinanceSource.includes('6120 · Bahan Baku') && purchaseFinanceSource.includes('6200 · Kepegawaian'), 'Purchase screen must expose the four expense account codes');
assert(!purchaseFinanceSource.includes('Persediaan · 1300'), 'Purchase screen must not present inventory value as the management expense model');
assert(purchasePeriodRpcFastPath.includes('security definer'), 'legacy selected-period fast path must remain protected by one authenticated brand check');
assert(purchaseControlRpcMigration.includes('private.same_brand(p_brand)'), 'Purchase control RPC must validate brand access once');
assert(purchaseControlRpcMigration.includes('finance_purchase_reconciliation_monthly_v1'), 'Purchase control RPC must return Purchase/Finance/Stock reconciliation');
assert(purchaseControlRpcMigration.includes('x.period_month=v_period'), 'Purchase control RPC must filter to the requested month server-side');
assert(purchaseSplitMigration.includes("'6110','Beban Pemeliharaan','EXPENSE'"), 'migration must create maintenance expense account');
assert(purchaseSplitMigration.includes("'6120','Beban Bahan Baku','EXPENSE'"), 'migration must create raw-material expense account');
assert(purchaseSplitMigration.includes("set name='Beban Kepegawaian'"), 'migration must align personnel expense naming');
assert(purchaseSplitMigration.includes('when rule_type is null and inventory_match_count=1 then quantity_numeric'), 'exact inventory-name purchases must post quantity 1:1');
assert(purchaseSplitMigration.includes("unit_cost=null"), 'Purchase-to-Stock upsert must remain quantity-only');
assert(purchaseSplitMigration.includes('finance_purchase_dual_posting_v1'), 'migration must expose dual finance/stock audit view');
assert(canonicalPurchaseFinanceMigration.includes("'purchase_expense'"), 'canonical Purchase reconciliation must create expense journals');
assert(canonicalPurchaseFinanceMigration.includes("'inventory_value_entries',0"), 'canonical Purchase reconciliation must not create inventory-value postings');
assert(canonicalPurchaseFinanceMigration.includes("'stock_value_policy','quantity_only'"), 'canonical Purchase journal metadata must preserve quantity-only stock policy');
assert(canonicalPurchaseFinanceMigration.includes('finance_purchase_reconciliation_monthly_v1'), 'canonical migration must expose monthly Purchase/Finance/Stock controls');
assert(canonicalPurchaseFinanceMigration.includes('get_finance_management_period_v1'), 'canonical migration must expose journal-based management reporting');
assert(canonicalPurchaseFinanceMigration.includes("'hpp','retired'"), 'management concept must explicitly retire HPP');

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

console.log('ERP tracker test: PASS (' + data.tasks.length + ' tasks, ' + data.milestones.length + ' milestones; canonical Purchase/Finance + lazy performance contract locked)');