const fs=require('fs');
const assert=require('assert');

const shim=fs.readFileSync('owner-finance-stock-v3.js','utf8');
const bridge=fs.readFileSync('stock-v3-runtime-fix.js','utf8');
const css=fs.readFileSync('stock-readable-density.css','utf8');

assert(!shim.includes('stock-recall-v4.js'),'owner shim must not load legacy Stock recall v4');
assert(shim.includes('stock-v3-runtime-fix.js'),'owner shim must load the canonical Stock v3 bridge');
assert(bridge.includes("/stock-control-v3.js?v=33"),'canonical bridge must load Stock Control v3');
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
assert(ui4.includes('stockValueByCategory()')&&ui4.includes('lowestStockFive()')&&ui4.includes('stockMovingPanel()'),'All visible panels must use backend-driven data or explicit missing-data copy');
assert(!ui4.includes('sc5-grid-bottom'),'Removed obsolete lower infographic row');
assert(ui4.includes('inventory_valuation_verified_summary')&&ui4.includes('inventory_verified_cost_current'),'Stock value must use verified unit costs only');
assert(ui4.includes('Valuasi parsial')&&ui4.includes('Bukan total nilai seluruh persediaan'),'Incomplete value coverage must be disclosed');
assert(ui4.includes('Status Pergerakan Stok')&&ui4.includes('get_stock_moving_fifo_v1'),'Moving dashboard must use real authenticated FIFO data');
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
const renderTrend=(records,period='2026-10')=>vm.runInNewContext(trendSource+';monthlyTrendInfographic()',{
  S:{period,periodLoading:false,trend:records},
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
assert(renderedTrend.includes('2.370'),'Summary sums real activity events across months');
assert(renderedTrend.includes('912'),'September sums all four ledger movement groups');
assert(renderedTrend.includes('1.458'),'April uses Indonesian number formatting');
assert(renderedTrend.includes('sc12-ledger-chart')&&renderedTrend.includes('<svg'),
  'Activity chart uses deterministic SVG instead of nested DIV percent heights');
assert.strictEqual((renderedTrend.match(/<g class="sc12-month(?:\s|")/g)||[]).length,10,
  'Exactly ten actual monthly data positions');
assert(renderedTrend.includes('sc12-month-selected'),'Selected month highlighted');
assert(renderedTrend.includes('Tanda — berarti belum ada catatan'),
  'Months without source rows must not be presented as confirmed zero');
assert(!renderedTrend.includes('Rp '),'Event ledger chart must not pretend to show rupiah');
assert(!renderedTrend.includes('NaN'),'Graph scales must be numeric and finite');
const actualBars=renderedTrend.match(/<rect class="sc12-ledger-bar[^>]+>/g)||[];
assert.strictEqual(actualBars.length,2,'Bars appear only for the 2 recorded months in mock');
actualBars.forEach(function(rect){
  var match=rect.match(/height="([0-9.]+)"/);
  assert(match&&Number(match[1])>20,'Positive ledger values need visible non-collapsing SVG rect heights');
  assert(rect.includes('fill="url(#sc12StockBarGradient)"'),'Bars use translucent Hasnaria-green gradient');
});
assert(!renderedTrend.includes('<polyline'),
  'No false line should cross the unrecorded months between April and September');
assert.strictEqual((renderedTrend.match(/<circle class="sc12-ledger-dot"/g)||[]).length,2,
  'Markers occur only on months with recorded data');

const nineMonths=[574,412,1436,1458,985,686,823,711,912].map((v,i)=>({
  period_month:'2026-'+String(i+1).padStart(2,'0')+'-01',movement_rows:v
}));
const realTenMonthView=renderTrend(nineMonths);
assert(realTenMonthView.includes('7.997'),'9 months of source ledger events total 7,997');
assert.strictEqual((realTenMonthView.match(/<rect class="sc12-ledger-bar/g)||[]).length,9,
  'Actual nine recorded months have nine visible bars');
assert(realTenMonthView.includes('<polyline')&&realTenMonthView.includes('sc12-ledger-line'),
  'Continuous recorded months get an actual connecting green line');
const nineHeights=(realTenMonthView.match(/<rect class="sc12-ledger-bar[^>]+>/g)||[])
  .map(rect=>Number(rect.match(/height="([0-9.]+)"/)[1]));
assert(Math.min(...nineHeights)>25,
  'Actual 2026 ledger sample cannot regress to one-pixel baselines');
assert(realTenMonthView.includes('Okt')&&realTenMonthView.includes('—'),
  'October stays explicitly unrecorded, not fabricated as zero');
assert(renderTrend([]).includes('Belum ada aktivitas ledger'),
  'Empty ledger should show an honest empty state');
assert(greenCss.includes('.sc12-ledger-chart')&&greenCss.includes('.sc12-ledger-bar')&&greenCss.includes('.sc12-ledger-line'),
  'New SVG chart uses a single scoped green visual system');
assert(greenCss.includes('#stok .sc12-chart-frame')&&greenCss.includes('min-height:125px'),
  'SVG chart has a definite positive visible area');
assert(ui4.includes('/stock-control-v3.css?v=27'),'New chart stylesheet cache version must be fresh');
assert(ui4.includes('sc12-status-strip')&&greenCss.includes('.sc12-status-strip'),
  'Healthy audit/upload state displays compactly to give dashboard more space');

assert(ui4.includes('sc13-category-main')&&ui4.includes('sc13-donut-svg'),
  'Stock verified valuation must render responsive donut, not previous horizontal composition');
assert(ui4.includes('Cakupan harga pokok'),'Partial stock-cost coverage must remain visible');
assert(greenCss.includes('.sc13-donut-number')&&greenCss.includes('.sc13-legend-row'),
  'New verified-value donut and legend are styled');
assert(ui4.includes('ui_stock_sales_link_audit_v1')&&ui4.includes('renderSalesStockAudit()'),
  'Dashboard must load a read-only Majoo sale_items to stock movement audit per month');
const sourceAudit=ui4.slice(ui4.indexOf('function renderSalesStockAudit(){'),
  ui4.indexOf('function renderLedgerAudit(){')).trim();
const salesAudit=vm.runInNewContext(sourceAudit+';renderSalesStockAudit()',{
 S:{period:'2026-10',salesLinkAudit:{
   sale_item_rows:1035,linked_sale_item_rows:0,unlinked_sale_item_rows:1035,
   eligible_verified_rows:0,no_recipe_rows:38,unverified_components_rows:0
 }},
 fmt:n=>Number(n).toLocaleString('id-ID'),num:n=>Number(n)||0,esc:v=>String(v)
});
assert(salesAudit.includes('0 / 1.035')&&salesAudit.includes('1.035 belum tertaut'),
  'October Majoo linkage backlog must not look like reconciled stock');
assert(salesAudit.includes('sc16-sales-pending'),'Unlinked recipes present an explicit warning');
assert(greenCss.includes('.sc16-sales-status'),'Sales→Stock status has compact dashboard styles');
const bridgeMigration=fs.readFileSync('supabase/migrations/20261026_stock_sales_bridge_ledger_coverage.sql','utf8');
assert(bridgeMigration.includes('left join public.inventory_sku_registry'),
  'Inventory ledger must keep valid master movements without registry mapping');
assert(bridgeMigration.includes('with (security_invoker=true)'),
  'Ledger and audit views must respect current user RLS');
assert(bridgeMigration.includes('create or replace view public.ui_stock_sales_link_audit_v1'),
  'Read-only sales coverage view must exist');
const synStart=bridgeMigration.indexOf('create or replace function private.sync_sale_item_inventory_movement');
const synEnd=bridgeMigration.indexOf('$function$;',synStart);
const safeSync=bridgeMigration.slice(synStart,synEnd);
assert(safeSync.indexOf("if v_approved is null then return") <
  safeSync.indexOf('update public.inventory_movements'),
  'Unverified recipes must never delete or update historical stock movements');
assert(!safeSync.includes('delete from public.inventory_movements'),
  'Do not erase historical posted sales while recipe is draft');

const categoryStart=ui4.indexOf('function stockValueByCategory(){');
const categoryEnd=ui4.indexOf('function lowestStockFive(){',categoryStart);
assert(categoryStart>=0&&categoryEnd>categoryStart,'Category function must be present');
const categorySource=ui4.slice(categoryStart,categoryEnd).trim();
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
assert(singleCategory.includes('Rp 3.163.500'),'Donut center must display real verified value');
assert(singleCategory.includes('class="sc13-donut-number"')&&singleCategory.includes('class="sc13-donut-label"'),
 'Amount and caption must be inside fixed SVG coordinates without HTML overlaid on the ring');
assert(singleCategory.includes('BUMBU'),'Current real BUMBU category is displayed');
assert(singleCategory.includes('100%'),'A single category composes 100% of verified value only');
assert(singleCategory.includes('1 dari 198 SKU · 0,5%'),'Coverage clarifies only one of 198 SKUs is verified');
assert(singleCategory.includes('Bukan total nilai seluruh persediaan'),'Do not imply entire stock has verified costs');
assert(singleCategory.includes('sc13-donut-svg')&&singleCategory.includes('<svg'),
  'Single-category donut must use SVG with explicit viewBox, not collapsing conic-gradient');
assert(singleCategory.includes('stroke="#076b49"')&&singleCategory.includes('stroke-dasharray="100.000 0.000"'),
  'One verified category renders complete full green ring with a nonzero SVG path');
assert(singleCategory.includes('width="220" height="220"'),
  'SVG always has intrinsic dimensions even when parent flex dimensions are constrained');
assert(!singleCategory.includes('conic-gradient('),'Retired CSS-only donut must not be present');
assert.strictEqual((singleCategory.match(/class="sc13-legend-row"/g)||[]).length,1,
  'Do not invent additional category rows');
const groupedCategory=renderCategory([
 {category:'BUMBU',value:50},{category:'MAKANAN',value:25},
 {category:'MINUMAN',value:15},{category:'ES KRIM',value:5},
 {category:'KEMASAN',value:5}
],5,198);
assert(groupedCategory.includes('Kategori lainnya'),'Overflowing categories grouped as Other');
assert.strictEqual((groupedCategory.match(/class="sc13-legend-row"/g)||[]).length,4,
  'Support four compact category legend rows');
assert(groupedCategory.includes('stroke="#076b49"')&&groupedCategory.includes('stroke-dasharray="49.550 50.450"'),
  'Multiple values create a proportional SVG half-ring rather than fake amounts');
assert.strictEqual((groupedCategory.match(/class="sc13-donut-sector"/g)||[]).length,4,
  'SVG has one independently colored sector per grouped verified category');
assert(!groupedCategory.includes('NaN'),'Percentages must be valid');
const noBalance=renderCategory([]);
assert(noBalance.includes('Belum ada nilai terverifikasi')&&noBalance.includes('sc13-donut-empty'),
  'No real verified balance must never create fake pie segments');
assert(!noBalance.includes('sc13-donut-svg'),'Empty values must not display a fabricated SVG ring');

const topStart=ui4.indexOf('function lowestStockFive(){');
const topEnd=ui4.indexOf('function stockMovingPanel(){',topStart);
const healthEnd=ui4.indexOf('function stockKpiIcon(',topEnd);
assert(topStart>=0&&topEnd>topStart&&healthEnd>topEnd,'Lowest-five Stock ranking and health panel exist');
const topSource=ui4.slice(topStart,topEnd).trim();
const healthSource=ui4.slice(topEnd,healthEnd).trim();
const trackedItem=(name,qty,unit='pcs',min=5,tracked=true)=>({
  item_name:name,system_qty:qty,unit,min_qty:min,tracking_active:tracked,category:'MAKANAN'
});
const renderTop=(rows,loaded=true)=>vm.runInNewContext(topSource+';lowestStockFive()',{
  S:{baseLoaded:loaded,items:rows},
  num:v=>Number(v)||0,
  fmt:n=>Number(n).toLocaleString('id-ID',{maximumFractionDigits:2}),
  esc:v=>String(v)
});
const lowFixture=[
  trackedItem('MAKANAN POSITIF',2,'pcs',7),
  trackedItem('UNTRACKED INVENTORY',-9999,'pcs',5,false),
  trackedItem('MATCHA',-408,'gram',16),
  trackedItem('ODENG',-18,'porsi',20),
  trackedItem('TOPOKKI',-65,'porsi',20),
  trackedItem('ZENLATTE THAI TEA',-472,'gram',16),
  trackedItem('DUMPLING CHEESE',-14,'pcs',7),
  trackedItem('STOK NOL',0,'pcs',7),
  trackedItem('STOK NORMAL',99,'pcs',7)
];
const ranked=renderTop(lowFixture);
assert(ranked.includes('Top')===false || ranked.includes('saldo'),'Status derives from actual stock balances');
assert(ranked.includes('ZENLATTE THAI TEA')&&ranked.includes('-472 gram'),
  'Worst negative balance is displayed accurately, not clamped to zero');
assert(ranked.includes('MATCHA')&&ranked.includes('-408 gram'),
  'Second worst negative balance is displayed');
assert(ranked.includes('TOPOKKI')&&ranked.includes('-65 porsi'),'Low stock ranking keeps original SKU units');
assert(ranked.includes('ODENG')&&ranked.includes('-18 porsi'),'Fourth worst row appears');
assert(ranked.includes('DUMPLING CHEESE')&&ranked.includes('-14 pcs'),'Fifth worst row appears');
assert(!ranked.includes('UNTRACKED INVENTORY'),
  'Untracked SKUs must never be ranked as if they had reliable balance');
assert(!ranked.includes('MAKANAN POSITIF'),'Positive item must not push out five lower negative values');
assert.strictEqual((ranked.match(/class="sc14-low-item sc14-low-/g)||[]).length,5,
  'Exactly five distinct tracked SKU rows are visible');
assert(ranked.includes('5 dari 8 SKU'),'Denominator must include only tracked SKU balances');
assert(ranked.includes('Saldo negatif')&&ranked.includes('sc14-low-negative'),
  'Negative ledger balances show an explicit alert');
assert(!ranked.includes('Rp '),'Low-stock quantities must not be presented as rupiah valuation');
const zeroCase=renderTop([trackedItem('ZERO',0,'pcs',5)]);
assert(zeroCase.includes('Stok habis')&&zeroCase.includes('sc14-low-zero'),'Zero stock gets empty-stock warning');
const reorderCase=renderTop([trackedItem('LOW',2,'pcs',7)]);
assert(reorderCase.includes('Perlu beli')&&reorderCase.includes('sc14-low-reorder'),
  'Positive stock below its own minimum is marked reorder');
const noTracked=renderTop([trackedItem('NO OPNAME',-30,'pcs',5,false)]);
assert(noTracked.includes('Belum ada saldo SKU yang terpantau'),'Empty state must not invent ranking');
assert(renderTop([],false).includes('Memuat saldo SKU terpantau'),'Loading state must remain honest');
assert(ui4.includes('Top 5 Item Stok Terendah'),'New right panel title reflects SKU balances');
assert(greenCss.includes('#stok .sc13-donut-visual')&&greenCss.includes('min-height:150px'),
  'Donut ring must retain a definite rendered height independent of flexbox sizing');
assert(greenCss.includes('#stok .sc13-donut-svg')&&greenCss.includes('visibility:visible!important'),
  'The actual SVG drawing must not be hidden by layout inherited styles');
assert(!greenCss.includes('.sc13-donut-ring'),'Broken CSS conic-gradient ring should be removed entirely');
assert(greenCss.includes('#stok .sc14-low-list{')&&greenCss.includes('justify-content:flex-start'),
  'Stock Top 5 list starts at first SKU rather than clipping its first row');
assert(greenCss.includes('.sc14-low-list')&&greenCss.includes('.sc14-low-quantity')&&greenCss.includes('.sc14-low-negative'),
  'Right-side low-stock ranking must have compact responsive error styling');
const movingSource=ui4.slice(topEnd,ui4.indexOf('async function loadMovingStatus(period){',topEnd)).trim();
const movingRows=[
  {moving_status:'fast',latest_sale_date:'2026-09-20'},
  {moving_status:'fast',latest_sale_date:'2026-09-25'},
  {moving_status:'normal',latest_sale_date:'2026-09-30'},
  {moving_status:'slow',latest_sale_date:'2026-09-15'},
  {moving_status:'unknown',latest_sale_date:null},
  {moving_status:'untracked',latest_sale_date:null}
];
const moving=vm.runInNewContext(movingSource+';stockMovingPanel()',{
 S:{period:'2026-10',movingLoading:false,movingLoaded:true,movingError:'',movingRows},
 fmt:n=>Number(n).toLocaleString('id-ID'),
 monthKey:s=>String(s||'').slice(0,7),
 dateLabel:s=>s,esc:s=>String(s)
});
assert.strictEqual((moving.match(/class="sc15-moving-row /g)||[]).length,3,
 'Moving panel has exactly three named status bands');
assert(moving.includes('Fast Moving')&&moving.includes('Normal Moving')&&moving.includes('Slow Moving'),
 'Expected purchase-to-consumption moving classes');
assert(moving.includes('0–7 hari')&&moving.includes('8–30 hari')&&moving.includes('setelah 30 hari'),
 'Velocity thresholds must describe completed purchase-batch duration');
assert(moving.includes('Belum dapat dihitung')&&moving.includes('2 SKU'),
 'Unknown and untracked stock must not be labeled slow');
assert(moving.includes('Pemakaian ledger terbaru 2026-09-30'),
 'October without sales history needs explicit stale-data disclosure');
assert(moving.includes('90 hari terakhir')&&moving.includes('FIFO estimasi'),
 'Panel must identify FIFO estimates and recent completed lots');
const noMoving=vm.runInNewContext(movingSource+';stockMovingPanel()',{
 S:{period:'2026-10',movingLoading:false,movingLoaded:true,movingError:'',movingRows:[]},
 fmt:n=>Number(n).toLocaleString('id-ID'),
 monthKey:s=>String(s||'').slice(0,7),dateLabel:s=>s,esc:s=>String(s)
});
assert(noMoving.includes('0 SKU'),'No source rows must not fabricate counts');
const movingError=vm.runInNewContext(movingSource+';stockMovingPanel()',{
 S:{period:'2026-10',movingLoading:false,movingLoaded:false,movingError:'Data unavailable',movingRows:[]},
 fmt:n=>Number(n).toLocaleString('id-ID'),
 monthKey:s=>String(s||'').slice(0,7),dateLabel:s=>s,esc:s=>String(s)
});
assert(movingError.includes('Data moving belum dapat dimuat'),
 'RPC errors must not silently display zeros as credible data');
assert(ui4.includes('loadMovingStatus(S.period);')&&ui4.includes("p_period:period+'-01'"),
 'Selected month drives authenticated FIFO computation');
assert(greenCss.includes('.sc15-moving-row')&&greenCss.includes('.sc15-moving-unclassified'),
 'Moving panel needs responsive status cards and unknown bucket');
const fifoSql=fs.readFileSync('supabase/migrations/20261024_stock_moving_fifo_v1.sql','utf8');
assert(fifoSql.includes('security invoker')&&fifoSql.includes('private.same_brand(p_brand)'),
 'Moving RPC must use invoker RLS and explicit same-brand guard');
assert(fifoSql.includes('grant execute on function public.get_stock_moving_fifo_v1(uuid,date) to authenticated'),
 'Moving RPC can only be executed by authenticated users');
assert(fifoSql.includes('ev.finish_date-ev.receipt_date')&&fifoSql.includes('ev.reliable'),
 'Calculation uses actual purchase-to-fully-consumed FIFO days with quality checks');
assert(greenCss.includes('.sc14-low-list')&&greenCss.includes('.sc14-low-item'),
  'Lowest-five SKU ranking has its own compact layout');
assert(!trendSource.includes('sc9-bar-shell'),'Old percentage-height bars must not be used by active chart');
assert(!greenCss.includes('/* Tahap 3 · monthly Stock ledger activity.'),'Old chart CSS block must be removed to avoid conflicting height rules');







/* Stage 6–7: action routing, fresh valuation, dialog accessibility and one view. */
assert(ui4.includes('loadVerifiedValuation(true);'),'Refresh must reload valuation data');
assert(ui4.includes('if(S.valuationLoading&&!force)return'),'Forced refresh may replace obsolete valuation request');
assert(ui4.includes("S.valuationLoaded=false;"),'Refreshing cost may clear stale valuation ready flag');
assert(ui4.includes("S.trend = [];"),'Period switch must not briefly show old chart data');
assert(ui4.includes('aria-haspopup="dialog"'),'Detail buttons must describe their popup purpose');
assert(ui4.includes('stockCloseDialog(host)')&&ui4.includes('stockDialogFocus(host)'),
  'Closing modal must restore focus and opening must focus dialog');
assert(ui4.includes('stockNavigate(\'pembelian\')'),'Purchase button has sidebar navigation fallback');
const focStart=ui4.indexOf('function stockDialogFocus(host)');
const focEnd=ui4.indexOf('function bind(host)',focStart);
assert(focStart>=0&&focEnd>focStart,'Keyboard modal helpers must be present');
let focusCount=0,returnCount=0;
const focusContext={
 S:{modal:'position'},render:()=>{returnCount++},
 window:{__HASNARIA_OWNER_SHELL:{navigate:()=>{}}},
 document:{querySelector:()=>null}
};
const stockHelpers=vm.runInNewContext(
  ui4.slice(focStart,focEnd)+';({stockDialogFocus,stockCloseDialog,stockNavigate})',
  focusContext
);
const mockHost={querySelector:selector=>{
 if(selector==='.sc4-modal .sc4-close')return {focus:()=>{focusCount++}};
 if(selector==='[data-sc4-modal="position"]')return {focus:()=>{focusCount++}};
 return null;
}};
stockHelpers.stockDialogFocus(mockHost);
assert.strictEqual(focusCount,1,'Opening Stock modal focuses its close button');
stockHelpers.stockCloseDialog(mockHost);
assert.strictEqual(focusCount,2,'Closing Stock modal restores its trigger focus');
assert.strictEqual(focusContext.S.modal,'','Closing Stock modal clears dialog state');
assert.strictEqual(returnCount,1,'Close action re-renders once');
const bindStart=ui4.indexOf('function bind(host)');
const bindEnd=ui4.indexOf('function exportCsv()',bindStart);
assert(bindStart>=0&&bindEnd>bindStart,'Delegated toolbar handlers must be present');
let refreshed=[0,0,0],ledgerOpened=0;
const fakeState={modal:'',correction:null,ledgerLoading:false,period:'2026-10'};
const testHost={};
const bindContext={
 S:fakeState,
 loadBase:()=>refreshed[0]++,
 loadPeriodData:()=>refreshed[1]++,
 loadVerifiedValuation:force=>{assert.strictEqual(force,true);refreshed[2]++},
 stockDialogFocus:()=>{},
 stockCloseDialog:()=>{},
 loadLedger:()=>{ledgerOpened++},
 render:()=>{},stockNavigate:()=>true,
 window:{__HASNARIA_STOCK_UPLOAD_V1:{open:()=>{}}},
 openOpname:()=>{},
 isOwner:()=>true
};
const mockBind=vm.runInNewContext(ui4.slice(bindStart,bindEnd)+';bind',bindContext);
mockBind(testHost);
const buttonFor=(attribute,value)=>({
 closest:selector=>{
  if(selector==='[data-sc4-action]'&&attribute==='data-sc4-action')return {getAttribute:()=>value};
  if(selector==='[data-sc4-modal]'&&attribute==='data-sc4-modal')return {getAttribute:()=>value};
  if(selector==='button'&&attribute==='data-sc3-action')return {hasAttribute:()=>false,getAttribute:()=>value};
  return null;
 }
});
testHost.onclick({target:buttonFor('data-sc3-action','refresh')});
assert.deepStrictEqual(refreshed,[1,1,1],'Refresh calls stocks, current month and verified costs together');
testHost.onclick({target:buttonFor('data-sc4-modal','ledger')});
assert.strictEqual(ledgerOpened,1,'Ledger button requests canonical ledger data');
assert.strictEqual(fakeState.modal,'ledger','Ledger button opens modal');
assert(ui4.includes("if (el.id === 'sc4Period')"),'Month dropdown handler must remain');
assert(ui4.includes("if (e.key === 'Escape' && S.modal)"),'Keyboard Escape closes detail');
assert(ui4.includes("data-sc4-action=\"upload-opname\"")&&ui4.includes("data-sc4-action=\"opname\""),
  'Upload and manual Opname Owner actions remain');
assert(greenCss.includes('max-height:min(88dvh,calc(100dvh - 20px))'),
  'Dialog is bounded to viewport height');
assert(greenCss.includes('#stok .sc4-modal-body')&&greenCss.includes('overflow:auto!important'),
  'Long modal content scrolls internally without clipping its header');
assert(greenCss.includes('@media(min-width:701px) and (max-width:1120px)')&&greenCss.includes('height:100%!important')&&greenCss.includes('max-height:100%!important'),
  'Mid-width desktop does not regress to full-page scroll mode');
assert(greenCss.includes('sc6-grid .sc5-panel>h3')&&greenCss.includes('min-height:16px!important'),
  'Panel headings have reserved height and do not overlap panel contents');


/* Canonical Stock dashboard style regression: no historical layout cascade. */
const canonicalStart=greenCss.indexOf('/* HASNARIA STOCK — CANONICAL DASHBOARD');
assert(canonicalStart>22000,'Canonical dashboard styles must follow preserved Stock table/dialog foundation');
const canonical=greenCss.slice(canonicalStart);
assert(greenCss.length<65000,'Stock stylesheet should be significantly smaller after consolidation');
assert(!canonical.includes('.sc9-')&&!canonical.includes('.sc6-value-donut'),
  'Retired DIV chart and donut rules must not return');
assert(!canonical.includes('.sc5-grid-top')&&!canonical.includes('.sc5-footer-actions'),
  'Retired Stock tab layout and footer cannot reintroduce overlap');
assert(canonical.includes('#stok .sc12-ledger-chart')&&canonical.includes('#stok .sc13-category-main'),
  'Actual ledger chart and new donut category panel must remain styled');
const uniqueBaseSelectors=[
 '#stok .sc6-grid', '#stok .sc6-dashboard',
 '#stok .sc6-column','#stok .sc6-main-column','#stok .sc6-side-column',
 '#stok .sc10-category-layout','#stok .sc11-health-list',
 '#stok .sc12-chart-frame','#stok .sc12-ledger-chart'
];
for(const sel of uniqueBaseSelectors){
 const occurrences=canonical.split('\n'+sel+'{').length-1;
 assert.strictEqual(occurrences,1,'One canonical root declaration required for '+sel);
}
const canonicalMedia=[
 '@media(max-width:700px)', '@media(min-width:701px) and (max-width:1120px)',
 '@media(min-width:701px) and (max-height:820px)'
];
for(const point of canonicalMedia)assert(canonical.includes(point),'Keep required desktop/mobile breakpoint: '+point);
assert(canonical.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),
  'Stock KPI mobile grid must retain 2 columns');
assert(canonical.includes('max-height:min(88dvh,calc(100dvh - 20px))'),
  'Stock modal must remain bounded by viewport');
assert(canonical.includes('#stok .sc13-category-main')&&canonical.includes('#stok .sc13-donut-svg'),
  'Current donut style must remain scoped to Stock UI');
assert(canonical.includes('@media(max-width:700px)'),
  'Mobile donut layout must stack into one column');

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
