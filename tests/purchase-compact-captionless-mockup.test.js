'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('purchase-finance-alignment-v1.js','utf8');
const css=fs.readFileSync('owner-one-view.css','utf8');
const start=source.indexOf('function trendMonths('),end=source.indexOf('function purchaseJournalReconciliation()',start);
assert.ok(start>0&&end>start,'monthly read helpers present');
const ctx={
 purchaseTrendCache:{},periods:[],rows:[],purchaseView:'summary',
 Math,Date,Number,String,Array,Object,JSON,Promise,console,
 MONTHS:['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],
 periodKey:v=>String(v||'').slice(0,7),periodValue:()=> '2026-10',
 monthLabel:k=>ctx.MONTHS[Number(k.slice(5,7))-1]+' '+k.slice(0,4),
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 n:v=>Number.isFinite(Number(v))?Number(v):0,
 money:v=>'Rp '+Number(v).toLocaleString('id-ID'),
 total:a=>a.reduce((s,r)=>s+Number(r.total_amount||0),0)
};
const f=vm.runInNewContext(source.slice(start,end)+';({monthlyTrendMarkup,monthlyPaymentMarkup,rememberTrendMonth})',ctx);
f.rememberTrendMonth('2026-01',[{total_amount:100,payment_method:'TUNAI'}]);
f.rememberTrendMonth('2026-10',[{total_amount:200,payment_method:'TRANSFER'}]);
let trend=f.monthlyTrendMarkup(),payment=f.monthlyPaymentMarkup();
assert.match(trend,/pfa-monthly-chart/);
assert.match(trend,/pfa-trend-line/);
assert.match(trend,/aria-label="Tren pembelian bulanan/);
assert.match(trend,/bulan tanpa sumber pembelian/,'missing source remains accessible');
assert.doesNotMatch(trend,/pfa-trend-foot|pfa-trend-note/,'no captions below trend');
assert.match(payment,/pfa-payment-svg/);
assert.match(payment,/pfa-payment-legend/);
assert.match(payment,/pfa-payment-missing/,'hatched missing months retained');
assert.match(payment,/Multi-sumber tanpa rincian tetap Belum Dipetakan/,'finance semantics accessible');
assert.doesNotMatch(payment,/pfa-payment-caveat/,'no captions below payment chart');
assert.match(css,/Purchase mockup parity: compact clean infographic/);
assert.match(css,/height:49px!important;min-height:49px!important;max-height:49px!important/,'KPI cards compact');
assert.match(css,/height:27px!important;min-height:27px!important;max-height:27px!important/,'desktop header buttons 70%');
assert.match(css,/font-size:13px!important;line-height:1\.1!important;margin:1px 0!important/,'KPI text adjusted');
assert.match(css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)!important/,'left/right lower panels align');
assert.match(css,/\.pfa-four-infographics \.pfa-summary-stack>\.pfa-insight-panel/,'both left panels same width');
assert.match(css,/\.pfa-summary-top \.pfa-share-row progress::-webkit-progress-value/,'Chrome progress bar green');
assert.match(css,/\.pfa-summary-top \.pfa-share-row progress::-moz-progress-bar/,'Firefox progress bar green');
assert.match(css,/linear-gradient\(90deg,#125644,#289b7a\)/,'same green palette as pie');
assert.doesNotMatch(source.slice(source.indexOf('function monthlyTrendMarkup(){'),source.indexOf('function goodsKind(')),/class="pfa-trend-foot"/);
assert.doesNotMatch(source.slice(source.indexOf('function monthlyPaymentMarkup(){'),end),/pfa-payment-caveat/);
console.log('Purchase compact final mockup: aligned 2x2, accessible caption-free charts and green bars PASS');
