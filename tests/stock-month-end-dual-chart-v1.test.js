'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const css=fs.readFileSync('stock-control-v3.css','utf8');
const sql=fs.readFileSync('supabase/migrations/20261031152000_stock_month_end_trend_readonly_v1.sql','utf8');
const a=js.indexOf('function monthlyStockEndInfographic(){');
const b=js.indexOf('function attentionSkuInfographic(){',a);
assert.ok(a>=0&&b>a,'Monthly end-of-stock chart exists');
const snippet=js.slice(a,b);
function render(rows,period='2026-10',unit='porsi'){
  const S={period,chartUnit:unit,monthEndRows:rows,monthEndUnavailable:false,periodLoading:false};
  const html=vm.runInNewContext(snippet+';monthlyStockEndInfographic()',{
   S,fmt:n=>Number(n).toLocaleString('id-ID',{maximumFractionDigits:6}),
   esc:n=>String(n),monthLabel:()=> 'Oktober 2026'
  });
  return String(html);
}
const sept={period_month:'2026-09-01',unit:'porsi',total_unit_skus:48,checkpoint_skus:15,
 recorded_end_qty:'155.5',period_movement_rows:378,unlinked_sale_rows:790,data_status:'PARTIAL_SALES'};
const oct={period_month:'2026-10-01',unit:'porsi',total_unit_skus:48,checkpoint_skus:15,
 recorded_end_qty:'155.5',period_movement_rows:0,unlinked_sale_rows:1035,data_status:'NO_POSTED_SALES'};
test('no cross-SKU unit mixing, no pre-September fabricated stock, no false October flat trend',()=>{
 const html=render([sept,oct,{...sept,unit:'pcs',recorded_end_qty:'656'}]);
 assert.match(html,/155,5/);
 assert.match(html,/15 dari 48 SKU/);
 assert.match(html,/data parsial, bukan stok fisik final/);
 assert.match(html,/Tanda — berarti belum dapat dihitung/);
 assert.match(html,/Tren saldo akhir bulanan agregat dalam satuan porsi/);
 assert.doesNotMatch(html,/656/);
 assert.doesNotMatch(html,/<polyline /);
 assert.equal((html.match(/class="sc22-trend-dot/g)||[]).length,1);
 assert.equal((html.match(/class="sc22-month-label"/g)||[]).length,10);
 assert.match(html,/penjualan belum disinkronkan/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('valid consecutive checkpoint months are chartable with a line',()=>{
 const html=render([sept,{...oct,data_status:'LEDGER_RECORDED',unlinked_sale_rows:0,period_movement_rows:80,recorded_end_qty:'142'}]);
 assert.match(html,/<polyline class="sc22-trend-line"/);
 assert.match(html,/142/);
 assert.equal((html.match(/class="sc22-trend-dot/g)||[]).length,2);
});
test('empty or unavailable history shows explanation instead of numeric zero',()=>{
 assert.match(render([oct]),/Belum tersedia saldo akhir bulanan/);
 assert.match(render([]),/Belum tersedia saldo akhir bulanan/);
 assert.match(js,/monthEndUnavailable/);
 assert.match(js,/ui_stock_month_end_trend_v1\?/);
 assert.match(js,/&period_month=lte\.'\+month/);
});
test('four YTD analytics panels render with selected-period range',()=>{
 const body=js.slice(js.indexOf('function render() {'),js.indexOf('function stockDialogFocus(',js.indexOf('function render() {')));
 assert.ok(body.includes('overviewKpis()'));
 assert.ok(body.includes('renderYtdAnalytics()'));
 const analytics=js.slice(js.indexOf('function renderYtdAnalytics(){'),js.indexOf('// HSN-424:',js.indexOf('function renderYtdAnalytics(){')));
 assert.ok(analytics.includes('scytd-grid'));
 assert.ok(analytics.includes('scytd-panel'));
 assert.ok(js.includes('1 Januari–'));
 assert.ok(js.includes('length:lastMonth'));
 assert.ok(css.includes('#stok .scytd-grid'));
 assert.ok(css.includes('#stok .scytd-panel'));
 assert.ok(css.includes('@media(max-width:760px)'));
 assert.ok(js.includes('stock-control-v3.css?v=38'));
 for(const f of ['stock-monitor.js','stock-v3-runtime-fix.js'])assert.ok(fs.readFileSync(f,'utf8').includes('stock-control-v3.js?v=44'));
});
test('ledger activity is counted for every month from January through selected period',()=>{
 const a=js.indexOf('function monthlyMovementActivityInfographic(){');
 const b=js.indexOf('async function loadLedger() {',a);
 assert.ok(a>=0&&b>a,'Monthly ledger activity chart exists');
 const chart=js.slice(a,b);
 assert.match(chart,/rows=\(S\.monthlyMovementRows\|\|\[\]\)/);
 assert.match(chart,/monthLabel\(x\.period\)/);
 const loader=js.slice(js.indexOf('async function loadMonthlyMovementActivity()'),a);
 assert.match(loader,/inventory_movements/);
 assert.ok(loader.includes("movement_date:'gte.'"));
 assert.ok(loader.includes("'&movement_date=lt.'"));
 assert.ok(loader.includes('requestExactCount(path)'));
 assert.ok(js.includes("method:'HEAD'"));
 assert.ok(js.includes("Prefer:'count=exact'"));
 assert.ok(js.includes('content-range'));
 assert.match(chart,/sc425-activity-bar/);
 assert.match(chart,/jumlah catatan mutasi/);
 assert.match(js,/loadMonthlyMovementActivity\(\)/);
 assert.match(js,/length:lastMonth/);
 assert.match(js,/renderYtdAnalytics\(\)/);
});
test('historical view uses physical checkpoint, cutoff and account RLS; no writes',()=>{
 assert.match(sql,/with \(security_invoker = true\)/);
 assert.match(sql,/o2\.opname_date<=least/);
 assert.match(sql,/order by o2\.opname_date desc,o2\.created_at desc,o2\.id desc/);
 assert.match(sql,/m\.movement_date>o\.opname_date/);
 assert.match(sql,/physical_qty\+movement_delta/);
 assert.match(sql,/not in \('BASELINE','OPNAME_CORRECTION'\)/);
 assert.match(sql,/when x\.checkpoint_skus=0 then null/);
 assert.match(sql,/when coalesce\(a\.unlinked_sale_item_rows,0\)>0/);
 assert.match(sql,/revoke all on public\.ui_stock_month_end_trend_v1 from public,anon/);
 assert.match(sql,/grant select on public\.ui_stock_month_end_trend_v1 to authenticated,service_role/);
 assert.doesNotMatch(sql,/^\s*(insert|delete|update|truncate)\s+(?:into\s+|from\s+)?public\./im);
});
