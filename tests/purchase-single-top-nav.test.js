'use strict';
// Owner Pembelian is ONE permanent summary page. No tab switcher or hidden
// category/payment view is mounted. Retain separate detailed modal and review
// compatibility anchor used by Notifications and Owner unit verification.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=n=>fs.readFileSync(n,'utf8');
const src=read('purchase-finance-alignment-v1.js'),css=read('owner-one-view.css');
const i=src.indexOf('function infographicMarkup(){'),j=src.indexOf('function mountOwnerControls(',i);
const hs=src.indexOf('function purchaseSalesHeader('),he=src.indexOf('function render(){',hs);
assert.ok(i>0&&j>i&&hs>0&&he>hs);
const stub={
 MONTHS:['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],
 esc:x=>String(x),n:Number,control:{stock_review_rows:3,provisional_journal_rows:1},
 periodValue:()=> '2026-10',monthLabel:()=> 'Oktober 2026',
 monthlyTrendMarkup:()=>'<span>MONTHLY_TREND_YTD</span>',
 monthlyPaymentMarkup:()=>'<span>MONTHLY_PAYMENT_100</span>',
 purchasePieMarkup:()=>'<span>GOODS_PIE</span>',
 purchaseTopMarkup:()=>'<span>TOP_ITEMS</span>',
 unitVerificationMarkup:()=>'<button data-pfa-unit-open="1">Owner Unit Review</button>',
 monthRange:()=>({from:'2026-10-01',to:'2026-10-31'})
};
const render=vm.runInNewContext('('+src.slice(i,j).trim()+')',stub);
const head=vm.runInNewContext('('+src.slice(hs,he).trim()+')',stub);
const html=render(),toolbar=head({purchase_rows:57},false);
for(const token of ['MONTHLY_TREND_YTD','MONTHLY_PAYMENT_100','GOODS_PIE','TOP_ITEMS',
                    'Tren Pembelian Bulanan','Komposisi Pembayaran','Porsi Pembelian','Top 5 Item Pembelian'])
 assert.match(html,new RegExp(token),'summary kept '+token);
assert.equal((html.match(/<section class="pfa-view-panel"/g)||[]).length,1,'exactly one Purchase screen');
assert.match(html,/id="pfaPanel-summary"/);
assert.match(html,/data-pfa-view-panel="summary"/);
assert.doesNotMatch(html,/pfaPanel-items|pfaPanel-payments|data-pfa-view-panel="items"|data-pfa-view-panel="payments"/);
assert.doesNotMatch(html,/Komposisi Pembelian|Kontrol Data Berkualitas/,'secondary screens not rendered');
assert.doesNotMatch(html,/ hidden[^>]*>/,'summary must remain permanently visible');
assert.doesNotMatch(toolbar,/pfa-quick-switch|data-pfa-view=|aria-pressed=|>Ringkasan<\/button>|>Kategori<\/button>|Pembayaran &amp; Kontrol/);
assert.match(toolbar,/pfa-upload-slot/);
assert.match(toolbar,/data-pfa-detail-open="1"/);
assert.match(toolbar,/pfa-controls-slot/);
assert.match(toolbar,/pfa-sync/,'existing quality status remains');
assert.doesNotMatch(src,/purchaseView|data-pfa-view=|closest\('\[data-pfa-view\]'\)/,'view state & tab handlers removed');
assert.match(html,/id="pfaReviewSlot"[^>]* hidden aria-hidden="true"/,'hidden compatibility anchor remains safe');
assert.match(css,/\.pfa-review-compat\[hidden\][\s\S]*?display:none!important/);
assert.match(src,/function purchasePieMarkup\(/);
assert.match(src,/function monthlyTrendMarkup\(/);
assert.match(read('owner-master-unit-review-v1.js'),/getElementById\('pfaReviewSlot'\)/);
assert.match(read('owner-p03-p04-reconciliation-v1.js'),/getElementById\('pfaReviewSlot'\)/);
assert.match(read('owner-conversion-triage-v1.js'),/getElementById\('pfaReviewSlot'\)/);
console.log('Purchase single-page only, upload/details accessible, deferred review isolated: PASS');
