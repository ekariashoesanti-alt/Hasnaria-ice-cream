'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('purchase-finance-alignment-v1.js','utf8');
const css=fs.readFileSync('owner-one-view.css','utf8');
const from=source.indexOf('function trendMonths('),end=source.indexOf('function purchaseTopMarkup()',from);
assert.ok(from>=0&&end>from,'isolated monthly and pie helpers remain available');
const contexts=[];
function make(selected,rows,periods){
 const calls=[],cache={},elem={innerHTML:''};
 const state={
  selected,rows:rows||[],periods:periods||[],
  purchaseTrendCache:cache,trendLoadSequence:0,trendLoadingKey:'',
  purchaseView:'summary',db:{},console,Promise,Math,Date,Number,String,Array,Object,JSON,
  MONTHS:['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],
  periodKey(v){return String(v||'').slice(0,7)},
  periodValue(){return state.selected},
  monthLabel(key){let m=Number(key.slice(5,7));return state.MONTHS[m-1]+' '+key.slice(0,4)},
  esc(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')},
  n(v){let n=Number(v);return Number.isFinite(n)?n:0},
  money(v){return 'Rp '+Number(v).toLocaleString('id-ID',{maximumFractionDigits:0})},
  total(a){return a.reduce((sum,x)=>sum+Number(x.total_amount||0),0)},
  document:{getElementById(id){return id==='pfaMonthlyTrend'?elem:null}},
  purchasePack(period){calls.push(period);return Promise.resolve({data:{rows:[{total_amount:Number(period.slice(5,7))*100}]}})}
 };
 let functions=vm.runInNewContext(source.slice(from,end)+';({trendMonths,goodsKind,purchasePieMarkup,monthlyTrendMarkup,ensureMonthlyTrend,rememberTrendMonth})',state);
 return{state,functions,calls,cache,elem};
}
const mo=make('2026-10');
assert.equal(mo.functions.trendMonths('2026-10').length,10,'October covers January–October');
assert.deepEqual(Array.from(mo.functions.trendMonths('2026-03'),m=>m.key),['2026-01','2026-02','2026-03']);
const two=make('2026-03',[],[{period_start:'2026-01-01'},{period_start:'2026-03-01'}]);
two.functions.rememberTrendMonth('2026-01',[{total_amount:100}]);
two.functions.rememberTrendMonth('2026-03',[{total_amount:900}]);
let trend=two.functions.monthlyTrendMarkup();
assert.match(trend,/Januari–Maret 2026/);
assert.match(trend,/Rp 100/);
assert.match(trend,/Rp 900/);
assert.match(trend,/bulan tanpa sumber pembelian/,'missing February is not recorded as Rp 0');
assert.match(trend,/pfa-trend-line/,'monthly trend draws a connected data line');
assert.doesNotMatch(trend,/grafik harian/i);

const pie=make('2026-10',[
 {analytics_category:'Makanan',expense_account_code:'6120',total_amount:100},
 {analytics_category:'Minuman',expense_account_code:'6120',total_amount:100},
 {analytics_category:'Ice Cream',expense_account_code:'6120',total_amount:200},
 {analytics_category:'Kemasan & Supplies',expense_account_code:'6120',total_amount:400},
 {analytics_category:'Administrasi',expense_account_code:'6100',total_amount:900},
 {analytics_category:'',expense_account_code:'6120',total_amount:200},
 {analytics_category:'Makanan',expense_account_code:'6120',total_amount:-100}
]);
let html=pie.functions.purchasePieMarkup();
assert.match(html,/Makanan/);assert.match(html,/Minuman/);assert.match(html,/Es Krim/);assert.match(html,/Kemasan/);
assert.match(html,/Belum diklasifikasikan/);
assert.match(html,/pfa-pie-color-/);
assert.match(html,/Biaya nonbarang Rp 900 tidak masuk porsi/);
assert.match(html,/1 transaksi koreksi negatif tidak dihitung/);
assert.match(html,/Total barang berkategori/);
assert.match(html,/Rp 1\.000/);
assert.doesNotMatch(html,/pfa-sync-grid|Perbandingan Pembelian|Penerimaan Stok/);

const empty=make('2026-10',[{analytics_category:'Administrasi',expense_account_code:'6100',total_amount:100}]);
assert.match(empty.functions.purchasePieMarkup(),/Belum ada nilai pembelian barang berkategori/);
const monthCalls=make('2026-04',[],['2026-01','2026-02','2026-03','2026-04'].map(k=>({period_start:k+'-01'})));
(async()=>{
 monthCalls.functions.ensureMonthlyTrend();
 for(let i=0;i<30;i++)await Promise.resolve();
 assert.deepEqual(monthCalls.calls,['2026-01','2026-02','2026-03','2026-04']);
 assert.equal(monthCalls.cache['2026-01'].value,100);
 assert.equal(monthCalls.cache['2026-04'].value,400);
 monthCalls.functions.ensureMonthlyTrend();
 for(let i=0;i<6;i++)await Promise.resolve();
 assert.equal(monthCalls.calls.length,4,'cached year-to-month data is not re-requested');
 assert.match(monthCalls.elem.innerHTML,/Tren pembelian bulanan Januari sampai April 2026/);
 assert.match(source,/get_purchase_control_period_v1/);
 assert.match(source,/Promise\.all\(\[worker\(\),worker\(\),worker\(\)\]\)/,'bounded read concurrency');
 assert.match(source,/function purchasePieMarkup/);
 assert.match(source,/Tren Pembelian Bulanan/);
 assert.match(source,/Porsi Pembelian/);
 assert.doesNotMatch(source.slice(source.indexOf('function infographicMarkup(){'),source.indexOf('function mountOwnerControls(')),/syncMarkup\(\)/);
 assert.match(css,/\.pfa-pie-wrap/);
 assert.match(css,/\.pfa-trend-line/);
 console.log('Purchase yearly monthly trend + selected-month goods pie: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
