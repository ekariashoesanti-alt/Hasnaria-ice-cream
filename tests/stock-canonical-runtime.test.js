const fs=require('fs');
const assert=require('assert');

const shim=fs.readFileSync('owner-finance-stock-v3.js','utf8');
const bridge=fs.readFileSync('stock-v3-runtime-fix.js','utf8');
const css=fs.readFileSync('stock-readable-density.css','utf8');

assert(!shim.includes('stock-recall-v4.js'),'owner shim must not load legacy Stock recall v4');
assert(shim.includes('stock-v3-runtime-fix.js'),'owner shim must load the canonical Stock v3 bridge');
assert(bridge.includes("/stock-control-v3.js?v=18"),'canonical bridge must load Stock Control v3');
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
assert(greenCss.includes('#stok .sc6-grid') && greenCss.includes('#stok .sc10-category-layout'),'updated Stock category panel stays scoped and horizontal');
assert(greenCss.includes('#125644'),'Stock palette must match the Hasnaria sidebar');

assert(ui4.includes('sc5-head sc7-head'),'Stage-1 Stock header must be compact');
assert(ui4.includes('sc7-actions')&&ui4.includes('sc7-tools'),'Stock action and period controls must share header');
assert(ui4.includes('data-sc4-action="upload-opname"')&&ui4.includes('data-sc4-action="opname"'),'Stock upload and manual opname must remain accessible');
assert(ui4.includes('data-sc4-modal="position"')&&ui4.includes('data-sc4-modal="ledger"'),'Stock detail and ledger must remain accessible');
assert(ui4.includes('data-sc4-action="upload-purchase"'),'Existing purchase upload route must remain');
assert(!ui4.includes('sc5-footer-actions'),'Floating footer button bar should be absent');
assert(ui4.indexOf('sc6-trend-panel')<ui4.indexOf('sc6-category-panel'),'Trend must remain immediately above category');

assert(greenCss.includes('.sc7-head') && greenCss.includes('min-height:64px!important'),'Stock header spacing is compact');
assert(greenCss.includes('background:#fff!important') && greenCss.includes('sc6-grid'),'White toolbar must be isolated from green sidebar');
assert(greenCss.includes('.sc6-main-column')&&greenCss.includes('.sc6-side-column'),'Both two-row Stock grid columns remain available');
assert(ui4.includes('sc8-kpis')&&ui4.includes('stockKpiIcon('),'Stage-2 KPI cards must have crisp icons');
assert(ui4.includes('sc8-kpi-label')&&ui4.includes('sc8-kpi-value')&&ui4.includes('sc8-kpi-note'),'Every KPI has clear label, value and note');
assert(ui4.includes('Parsial · '),'Cost coverage is still disclosed clearly');
assert(ui4.includes('Menunggu biaya terverifikasi'),'Cost error/empty state is not an invented value');
assert(!ui4.includes('Rp 18,73 jt')&&!ui4.includes('4.321'),'No demo values in real KPI');

assert(greenCss.includes('.sc8-kpis')&&greenCss.includes('.sc8-kpi-icon')&&greenCss.includes('.sc8-kpi-value'),'Modern green stock cards are scoped');
assert(greenCss.includes('max-height:88px!important')&&greenCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'One-view equal-height desktop and responsive mobile KPI cards');

const vm = require('vm');
assert.doesNotThrow(()=>new vm.Script(ui4),'Stock frontend JavaScript must parse');
const trendStart=ui4.indexOf('function monthlyTrendInfographic(){');
const trendEnd=ui4.indexOf('function attentionSkuInfographic(){',trendStart);
assert(trendStart>=0&&trendEnd>trendStart,'Monthly ledger function must be present');
const trendSource=ui4.slice(trendStart,trendEnd).trim();
const fmtID=n=>Number(n).toLocaleString('id-ID',{maximumFractionDigits:0});
const renderTrend=records=>vm.runInNewContext(trendSource+';monthlyTrendInfographic()',{
  S:{period:'2026-09',periodLoading:false,trend:records},
  num:v=>Number(v)||0,fmt:fmtID,esc:v=>String(v)
});
const trendMock=[
 {period_month:'2026-09-01',movement_rows:44},
 {period_month:'2026-09-01',movement_rows:189},
 {period_month:'2026-09-01',movement_rows:88},
 {period_month:'2026-09-01',movement_rows:591},
 {period_month:'2026-04-01',movement_rows:1458},
];
const renderedTrend=renderTrend(trendMock);
assert(renderedTrend.includes('2.370'),'Summary totals recorded events across months');
assert(renderedTrend.includes('912'),'September must aggregate all four real ledger activity groups');
assert(renderedTrend.includes('1.458'),'April label must use native Indonesian number formatting');
assert.strictEqual((renderedTrend.match(/class="sc9-month(?:\s|")/g)||[]).length,10,'Exactly ten monthly columns');
assert(renderedTrend.includes('sc9-month-current'),'Selected month needs stronger emphasis');
assert(renderedTrend.includes('sc9-month-missing'),'No-data months should be distinguished');
assert(renderedTrend.includes('Tanda — = belum ada catatan'),'Missing source data must not be presented as confirmed zero');
assert(!renderedTrend.includes('Rp '),'Activity ledger chart must not pretend to be stock value');
assert(!renderedTrend.includes('NaN'),'Valid trend does not yield a NaN tick');
assert(renderTrend([]).includes('Belum ada aktivitas ledger'),'Entirely empty history should show honest empty state');

assert(greenCss.includes('.sc9-guide-lines')&&greenCss.includes('.sc9-y-labels')&&greenCss.includes('.sc9-month-current'),'Stage-3 chart needs guides, axis and current month emphasis');
assert(greenCss.includes('.sc9-bar')&&greenCss.includes('.sc9-count'),'Stage-3 count labels follow actual bar height');

assert(ui4.includes('/stock-control-v3.css?v=12'),'Stage-5 style cache version should be fresh');
assert(ui4.includes('sc10-category-layout')&&ui4.includes('sc10-category-progress'),'Horizontal Stock category layout must be used');
assert(ui4.includes('Cakupan harga pokok'),'Category coverage must be disclosed');
assert(greenCss.includes('.sc10-value-hero')&&greenCss.includes('.sc10-coverage-track'),'Compact verified-value and coverage UI must be styled');
const categoryStart=ui4.indexOf('function stockValueByCategory(){');
const categoryEnd=ui4.indexOf('function stockValueTopFive(){',categoryStart);
assert(categoryStart>=0&&categoryEnd>categoryStart,'Stage-4 Stock category function must exist');
const categorySource=ui4.slice(categoryStart,categoryEnd).trim();
assert(!categorySource.includes('sc6-value-donut'),'Category HTML must not render old donut chart');
assert(!categorySource.includes('conic-gradient'),'Category composition must be horizontal, not donut');
const renderCategory=(rows,valued=1,all=198)=>vm.runInNewContext(categorySource+';stockValueByCategory()',{
  S:{valuationLoading:false,baseLoaded:true,valuationLoaded:true,
    valuation:{valued_items:valued,inventory_items:all},items:Array(all).fill({})},
  verifiedValuationRows:()=>rows,
  num:v=>Number(v)||0,
  fmt:n=>Number(n).toLocaleString('id-ID'),
  esc:v=>String(v),
  stockMoney:(v)=>'Rp '+Math.round(Number(v)||0).toLocaleString('id-ID')
});
const singleCategory=renderCategory([{category:'BUMBU',value:3163500}]);
assert(singleCategory.includes('Rp 3.163.500'),'Verified total must use ledger costs, not invented overall valuation');
assert(singleCategory.includes('BUMBU'),'Real verified item category must be visible');
assert(singleCategory.includes('100% dari nilai terverifikasi'),'100% must refer only to verified portion');
assert(singleCategory.includes('1 dari 198 SKU · 0,5%'),'Cost coverage must clearly state only 0.5% SKU coverage');
assert(singleCategory.includes('Bukan total nilai seluruh persediaan'),'User must see accurate partial valuation disclaimer');
assert(!singleCategory.includes('sc6-value-donut'),'Single-category case must not render a donut');
const groupedCategory=renderCategory([
 {category:'BUMBU',value:50},{category:'MAKANAN',value:25},
 {category:'MINUMAN',value:15},{category:'ES KRIM',value:5},
 {category:'KEMASAN',value:5}
],5,198);
assert(groupedCategory.includes('Kategori lainnya'),'Long category lists are grouped to prevent overflow');
assert.strictEqual((groupedCategory.match(/class="sc10-category-row"/g)||[]).length,4,'Show no more than four category bars');
assert(!groupedCategory.includes('NaN'),'No invalid chart percentages');
const noBalance=renderCategory([]);
assert(noBalance.includes('Belum ada saldo bernilai positif'),'Do not fabricate values when no positive verified inventory is available');

const topStart=ui4.indexOf('function stockValueTopFive(){');
const topEnd=ui4.indexOf('function expiryAndOpnamePanel(){',topStart);
const healthEnd=ui4.indexOf('function stockKpiIcon(',topEnd);
assert(topStart>=0&&topEnd>topStart&&healthEnd>topEnd,'Both Stage-5 Stock right panels are retained');
const topSource=ui4.slice(topStart,topEnd).trim();
const healthSource=ui4.slice(topEnd,healthEnd).trim();
const renderTop=rows=>vm.runInNewContext(topSource+';stockValueTopFive()',{
  S:{valuationLoading:false,baseLoaded:true,valuationLoaded:true,verifiedCosts:rows},
  verifiedValuationRows:()=>rows,
  fmt:n=>Number(n).toLocaleString('id-ID'),
  esc:v=>String(v),
  stockMoney:v=>'Rp '+Math.round(v).toLocaleString('id-ID')
});
const oneRow=renderTop([{name:'BUMBU ODENG',qty:19,unit:'purchase_unit',value:3163500}]);
assert(oneRow.includes('BUMBU ODENG')&&oneRow.includes('Rp 3.163.500'),'One verified Top SKU keeps its actual value');
assert(oneRow.includes('1 dari maks. 5'),'Single SKU is not artificially filled to five');
assert.strictEqual((oneRow.match(/class="sc11-top-item"/g)||[]).length,1,'No phantom top-list rows');
const fiveRows=renderTop(Array.from({length:7},(_,i)=>({name:'SKU '+i,qty:i+1,unit:'pcs',value:700-i*80})));
assert.strictEqual((fiveRows.match(/class="sc11-top-item"/g)||[]).length,5,'Show only top five verified rows');
const health=vm.runInNewContext(healthSource+';expiryAndOpnamePanel()',{
  S:{baseLoaded:true,items:[
    {last_opname_date:'2026-09-12',tracking_active:true,ui_status:'ok'},
    {tracking_active:false,ui_status:'untracked'}
  ]},
  dateLabel:s=>s,fmt:n=>Number(n).toLocaleString('id-ID'),esc:v=>String(v)
});
assert.strictEqual((health.match(/class="sc11-health-row/g)||[]).length,3,'Exactly three health rows avoid footer clipping');
assert(health.includes('Data kedaluwarsa belum tersedia'),'Expiration must not be fabricated');
assert(health.includes('SKU dengan checkpoint')&&health.includes('1 / 2'),'Actual checkpoint count must be retained');
assert(health.includes('Opname terakhir')&&health.includes('2026-09-12'),'Latest valid opname date must be shown');
assert(ui4.includes('Kondisi Data &amp; Opname'),'Short health-panel title must remain distinct from its card');
assert(greenCss.includes('#stok .sc11-health-list')&&greenCss.includes('overflow:hidden!important'),
  'The right panel has scroll-free constrained child layout');
assert(greenCss.includes('.sc11-top-list')&&greenCss.includes('.sc11-top-item'),
  'Top five ranking has its own compact layout');
assert(greenCss.includes('#stok .sc9-bar-stage')&&greenCss.includes('sc9-bar-shell'),
  'The ledger bar layout must have definite height anchors to prevent zero-height chart');






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
