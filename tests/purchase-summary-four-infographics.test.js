'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('purchase-finance-alignment-v1.js','utf8');
const css=fs.readFileSync('owner-one-view.css','utf8');
const start=source.indexOf('function trendMonths('),end=source.indexOf('function purchaseJournalReconciliation()',start);
assert.ok(start>=0&&end>start);
const state={
  purchaseTrendCache:{},periods:[],rows:[],purchaseView:'summary',
  MONTHS:['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],
  Math,Number,String,Array,Object,JSON,Date,Promise,console,
  periodKey(v){return String(v||'').slice(0,7)},
  periodValue(){return '2026-04'},
  monthLabel(key){return state.MONTHS[Number(key.slice(5,7))-1]+' '+key.slice(0,4)},
  esc(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')},
  n(v){const x=Number(v);return Number.isFinite(x)?x:0},
  money(v){return 'Rp '+Number(v).toLocaleString('id-ID')},
  total(a){return a.reduce((sum,r)=>sum+Number(r.total_amount||0),0)}
};
const f=vm.runInNewContext(source.slice(start,end)+';({paymentClass,paymentParts,rememberTrendMonth,monthlyPaymentMarkup,purchaseTopMarkup})',state);
assert.equal(f.paymentClass({payment_method:'cash'}),'Tunai');
assert.equal(f.paymentClass({payment_method:'TRANSFER_BANK'}),'Transfer');
assert.equal(f.paymentClass({payment_method:'utang'}),'Paylater');
assert.equal(f.paymentClass({payment_method:'BELUM_DIPETAKAN'}),'Belum Dipetakan');
assert.equal(f.paymentClass({payment_method:'tidak diketahui'}),'Belum Dipetakan');
const jan=[
 {total_amount:500,payment_method:'TUNAI'},
 {total_amount:250,payment_method:'TRANSFER'},
 {total_amount:100,payment_method:'PAYLATER'},
 {total_amount:150,payment_method:'BELUM_DIPETAKAN'},
 {total_amount:-120,payment_method:'TUNAI'}
];
const part=f.paymentParts(jan);
assert.equal(part.total,1000);
assert.equal(part.corrections,1);
assert.equal(part.totals['Tunai'],500);
assert.equal(part.totals['Transfer'],250);
assert.equal(part.totals['Paylater'],100);
assert.equal(part.totals['Belum Dipetakan'],150);
f.rememberTrendMonth('2026-01',jan);
f.rememberTrendMonth('2026-03',[
 {total_amount:100,payment_label:'bank'},
 {total_amount:300,payment_label:'Tidak Ada'}
]);
state.periods=['2026-01','2026-03'].map(x=>({period_start:x+'-01'}));
const markup=f.monthlyPaymentMarkup();
assert.equal((markup.match(/class="pfa-payment-month-tick"/g)||[]).length,4,
 'Exactly 4 labels on x-axis, Jan through selected April');
assert.equal((markup.match(/class="pfa-payment-slice/g)||[]).length,6,
 'Jan has 4 nonzero stacked rectangles; March has 2');
assert.match(markup,/Januari 2026/);
assert.match(markup,/Maret 2026/);
assert.match(markup,/50/);
assert.match(markup,/25/);
assert.match(markup,/15/);
assert.match(markup,/bulan tanpa sumber/);
assert.match(markup,/Bukan dianggap 0%/);
assert.match(markup,/pfa-payment-svg/);
assert.match(markup,/0%<\/text>/);
assert.match(markup,/25%<\/text>/);
assert.match(markup,/50%<\/text>/);
assert.match(markup,/75%<\/text>/);
assert.match(markup,/100%<\/text>/);
assert.match(markup,/Multi-sumber tanpa rincian tetap Belum Dipetakan/);
assert.doesNotMatch(markup,/Mei 2026|Oktober 2026/);
assert.ok(!markup.includes('NaN%'));
assert.match(source,/var paymentSlot=document.getElementById\('pfaMonthlyPayments'\)/,'YTD worker updates stacked bars and trend together');
assert.match(source,/function paymentParts\(/,'Payment buckets calculated per historical canonical pack');
const i=source.indexOf('function infographicMarkup(){'),j=source.indexOf('function mountOwnerControls(',i);
const render=source.slice(i,j);
for(const label of ['Tren Pembelian Bulanan','Komposisi Pembayaran','Porsi Pembelian','Top 5 Item Pembelian']){
 assert.ok(render.includes(label),'Summary retains '+label);
}
assert.match(render,/pfa-four-infographics/);
assert.match(render,/pfa-summary-left/);
assert.match(render,/pfa-summary-right/);
assert.match(render,/id="pfaMonthlyPayments"/);
assert.doesNotMatch(render,/pfaPanel-items|pfaPanel-payments|Komposisi Pembelian|Kontrol Data Berkualitas/,'secondary views are removed');
assert.equal((render.match(/<section class="pfa-view-panel"/g)||[]).length,1,'one page only');
assert.match(render,/id="pfaReviewSlot"/,'Deferred reviews remain');
assert.match(css,/\.pfa-summary-left\{grid-template-rows:minmax\(0,42fr\) minmax\(0,58fr\)/);
assert.match(css,/\.pfa-summary-right\{grid-template-rows:minmax\(0,48fr\) minmax\(0,52fr\)/);
assert.match(css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)!important/,'same two rows in both columns');
assert.match(css,/\.pfa-payment-slice/);
assert.match(css,/\.pfa-payment-svg/);
assert.doesNotMatch(css,/grid-template-rows:repeat\(10,minmax\(0,1fr\)\)/,'horizontal layout rule removed');
assert.match(css,/\.pfa-pie-color-3/,'Payment and Pie share palette');
assert.match(source,/Promise\.all\(\[worker\(\),worker\(\),worker\(\)\]\)/,'No unbounded historical queries');
console.log('Purchase 2x2 one-view, 100% monthly payment and relocation: PASS');
