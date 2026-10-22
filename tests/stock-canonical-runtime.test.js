const fs=require('fs');
const assert=require('assert');

const shim=fs.readFileSync('owner-finance-stock-v3.js','utf8');
const bridge=fs.readFileSync('stock-v3-runtime-fix.js','utf8');
const css=fs.readFileSync('stock-readable-density.css','utf8');

assert(!shim.includes('stock-recall-v4.js'),'owner shim must not load legacy Stock recall v4');
assert(shim.includes('stock-v3-runtime-fix.js'),'owner shim must load the canonical Stock v3 bridge');
assert(bridge.includes("/stock-control-v3.js?v=14"),'canonical bridge must load Stock Control v3');
assert(bridge.includes("setAttribute('data-stock-v4','1')"),'canonical shell must satisfy the existing owner guard marker');
assert(css.includes('#stok .sc3-table{width:100%;min-width:0;table-layout:fixed;font-size:8.3px}'),'desktop Stock table must keep the readable fixed-width density override');
assert(!css.includes('font-size:5.4px'),'readable override must not regress to the previous ultra-small status text');
console.log('stock canonical runtime checks passed');

const ui4=fs.readFileSync('stock-control-v3.js','utf8');
assert(ui4.includes('__HASNARIA_STOCK_UI4'),'Stock UI-4 runtime marker must be present');
assert(ui4.includes('ui_stock_overview_v1')&&ui4.includes('ui_stock_activity_chart_v1')&&ui4.includes('ui_stock_detail_v1'),'Stock UI-4 must use canonical overview, activity, and ledger views');
assert(ui4.includes('data-sc4-modal="ledger"')&&ui4.includes('data-sc4-action="opname"'),'Stock UI-4 must keep ledger detail and direct opname actions');
assert(ui4.includes('sc6-dashboard') && ui4.includes('monthlyTrendInfographic()'),'Stock green dashboard must retain backend monthly trend');
assert(ui4.includes('sc6-main-column')&&ui4.includes('sc6-side-column'),'Stock must use the approved two-column layout');
assert(ui4.indexOf('sc6-trend-panel')<ui4.indexOf('sc6-category-panel'),'Value per category must sit directly below the trend');
assert(ui4.includes('stockValueByCategory()')&&ui4.includes('stockValueTopFive()')&&ui4.includes('expiryAndOpnamePanel()'),'All visible panels must use backend-driven data or explicit missing-data copy');
assert(!ui4.includes('sc5-grid-bottom'),'Removed obsolete lower infographic row');
assert(ui4.includes('inventory_valuation_verified_summary')&&ui4.includes('inventory_verified_cost_current'),'Stock value must use verified unit costs only');
assert(ui4.includes('Valuasi parsial')&&ui4.includes('Bukan total nilai seluruh persediaan'),'Incomplete value coverage must be disclosed');
assert(ui4.includes('Data kedaluwarsa belum tersedia'),'No fictional expiry date counts');
assert(ui4.includes("request('ui_stock_activity_chart_v1?' + tq)") && ui4.includes("request('inventory_stock_reconciliation?'"),'Stock must use backend data rather than dummy mockup values');
assert(!ui4.includes("18,73 jt") && !ui4.includes("4.321"),'No invented inventory valuations or demo SKU counts');
assert(!ui4.includes("' + renderActivity() + '</article>'"),'Stock one-view must not show the legacy panel layout');
const greenCss=fs.readFileSync('stock-control-v3.css','utf8');
assert(greenCss.includes('#stok .sc6-grid') && greenCss.includes('#stok .sc6-value-layout'),'updated green panels stay scoped to Stock');
assert(greenCss.includes('#125644'),'Stock palette must match the Hasnaria sidebar');

assert(ui4.includes('sc5-head sc7-head'),'Stage-1 Stock header must be compact');
assert(ui4.includes('sc7-actions')&&ui4.includes('sc7-tools'),'Stock action and period controls must share header');
assert(ui4.includes('data-sc4-action="upload-opname"')&&ui4.includes('data-sc4-action="opname"'),'Stock upload and manual opname must remain accessible');
assert(ui4.includes('data-sc4-modal="position"')&&ui4.includes('data-sc4-modal="ledger"'),'Stock detail and ledger must remain accessible');
assert(ui4.includes('data-sc4-action="upload-purchase"'),'Existing purchase upload route must remain');
assert(!ui4.includes('sc5-footer-actions'),'Floating footer button bar should be absent');
assert(ui4.indexOf('sc6-trend-panel')<ui4.indexOf('sc6-category-panel'),'Trend must remain immediately above category');
assert(ui4.includes('/stock-control-v3.css?v=8'),'Stage-1 CSS cache version must be fresh');
assert(greenCss.includes('.sc7-head') && greenCss.includes('min-height:64px!important'),'Stock header spacing is compact');
assert(greenCss.includes('background:#fff!important') && greenCss.includes('sc6-grid'),'White toolbar must be isolated from green sidebar');
assert(greenCss.includes('.sc6-main-column')&&greenCss.includes('.sc6-side-column'),'Both two-row Stock grid columns remain available');



const notifications = fs.readFileSync('owner-notifications-v1.js','utf8');
const ownerShell = fs.readFileSync('owner-shell-guard.js','utf8');
assert(ownerShell.includes('owner-notifications-v1.js?v=2'), 'owner navigation must fetch the updated notifications asset');
assert(notifications.includes("from('inventory_stock_reconciliation')"), 'variances must come from authenticated canonical stock data, not hardcoded Excel');
assert(notifications.includes('data-hqn-stock'), 'variance notification must link to the stock correction entry');
assert(notifications.includes('__HASNARIA_STOCK_CORRECTION_PENDING'), 'notification must carry exact stock item ID into the stock entry');
assert(ui4.includes('Entry Koreksi Stok'), 'stock tab must provide a correction form');
assert(ui4.includes('takeCorrectionRequest'), 'stock tab must consume the notification deep link');
assert(ui4.includes("rpc('resolve_physical_stock_opname'"), 'correction must use audited stock RPC');
assert(ui4.includes("request('inventory_ledger_balance?'"), 'stock writes must check the canonical ledger before posting');
assert(ui4.includes('if (!isOwner() || !c || c.busy) return'), 'stock write must be Owner-only and non-repeatable');
assert(ui4.includes('if (reason.length < 12)'), 'correction must require explanation');
assert(ui4.includes('window.confirm('), 'correction must require Owner confirmation');
assert(!notifications.includes("rpc('resolve_physical_stock_opname'"), 'notification view must be read-only');
console.log('HSN-413 notification-to-stock-correction safety checks passed');
