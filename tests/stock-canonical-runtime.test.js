const fs=require('fs');
const assert=require('assert');

const shim=fs.readFileSync('owner-finance-stock-v3.js','utf8');
const bridge=fs.readFileSync('stock-v3-runtime-fix.js','utf8');
const css=fs.readFileSync('stock-readable-density.css','utf8');

assert(!shim.includes('stock-recall-v4.js'),'owner shim must not load legacy Stock recall v4');
assert(shim.includes('stock-v3-runtime-fix.js'),'owner shim must load the canonical Stock v3 bridge');
assert(bridge.includes("/stock-control-v3.js?v=12"),'canonical bridge must load Stock Control v3');
assert(bridge.includes("setAttribute('data-stock-v4','1')"),'canonical shell must satisfy the existing owner guard marker');
assert(css.includes('#stok .sc3-table{width:100%;min-width:0;table-layout:fixed;font-size:8.3px}'),'desktop Stock table must keep the readable fixed-width density override');
assert(!css.includes('font-size:5.4px'),'readable override must not regress to the previous ultra-small status text');
console.log('stock canonical runtime checks passed');

const ui4=fs.readFileSync('stock-control-v3.js','utf8');
assert(ui4.includes('__HASNARIA_STOCK_UI4'),'Stock UI-4 runtime marker must be present');
assert(ui4.includes('ui_stock_overview_v1')&&ui4.includes('ui_stock_activity_chart_v1')&&ui4.includes('ui_stock_detail_v1'),'Stock UI-4 must use canonical overview, activity, and ledger views');
assert(ui4.includes('data-sc4-modal="ledger"')&&ui4.includes('data-sc4-action="opname"'),'Stock UI-4 must keep ledger detail and direct opname actions');
assert(ui4.includes('sc5-dashboard') && ui4.includes('categoryInfographic()') && ui4.includes('monthlyTrendInfographic()'),'Stock green dashboard must load canonical category and ledger trends');
assert(ui4.includes('attentionSkuInfographic()') && ui4.includes('healthInfographic()') && ui4.includes('periodCompositionInfographic()') && ui4.includes('opnameControlInfographic()'),'Stock must have six data-driven panels');
assert(ui4.includes("request('ui_stock_activity_chart_v1?' + tq)") && ui4.includes("request('inventory_stock_reconciliation?'"),'Stock must use backend data rather than dummy mockup values');
assert(!ui4.includes("18,73 jt") && !ui4.includes("4.321"),'No invented inventory valuations or demo SKU counts');
assert(!ui4.includes("' + renderActivity() + '</article>'"),'Stock one-view must not show the legacy panel layout');
const greenCss=fs.readFileSync('stock-control-v3.css','utf8');
assert(greenCss.includes('#stok .sc5-grid-top') && greenCss.includes('#stok .sc5-grid-bottom'),'green panels stay scoped to Stock');
assert(greenCss.includes('#125644'),'Stock palette must match the Hasnaria sidebar');


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
