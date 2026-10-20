'use strict';
// Purchase Owner top navigation: one source of truth, three visible views,
// hidden non-interactive documentary anchor until Notification migration.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=n=>fs.readFileSync(n,'utf8');
const src=read('purchase-finance-alignment-v1.js'),css=read('owner-one-view.css');
const i=src.indexOf('function infographicMarkup(){'),j=src.indexOf('function mountOwnerControls(',i);
const hs=src.indexOf('function purchaseSalesHeader('),he=src.indexOf('function render(){',hs);
assert.ok(i>0&&j>i&&hs>0&&he>hs);
const stub={
 purchaseView:'summary',MONTHS:['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],
 esc:x=>String(x),n:Number,control:{stock_review_rows:3,provisional_journal_rows:1},
 periodValue:()=> '2026-10', monthLabel:()=> 'Oktober 2026',cutLabel:()=> '1–31 Oktober 2026',
 monthlyTrendMarkup:()=>'<span>MONTHLY_TREND_YTD</span>',
 monthlyPaymentMarkup:()=>'<span>MONTHLY_PAYMENT_100</span>',
 purchasePieMarkup:()=>'<span>GOODS_PIE</span>',
 chartMarkup:()=>'<span>CATEGORY_VALUES</span>',
 purchaseTopMarkup:()=>'<span>TOP_ITEMS</span>',
 purchasePaymentMarkup:()=>'<span>CANONICAL_PAYMENTS</span>',
 unitVerificationMarkup:()=>'<button data-pfa-unit-open="1">Owner Unit Review</button>',
 monthRange:()=>({from:'2026-10-01',to:'2026-10-31'})
};
let graph=vm.runInNewContext('('+src.slice(i,j).trim()+')',stub);
let header=vm.runInNewContext('('+src.slice(hs,he).trim()+')',stub);
for(const [view,needle] of [['summary','MONTHLY_TREND_YTD'],['items','CATEGORY_VALUES'],['payments','Kontrol Data Berkualitas']]){
 stub.purchaseView=view;
 const html=graph(),toolbar=header({purchase_rows:57},false);
 assert.match(html,new RegExp(needle),'content retained: '+view);
 if(view==='summary'){assert.match(html,/MONTHLY_PAYMENT_100/);assert.match(html,/TOP_ITEMS/)}
 if(view==='items')assert.doesNotMatch(html.slice(html.indexOf('id="pfaPanel-items"'),html.indexOf('id="pfaPanel-payments"')),/Top 5 Item Pembelian/);
 assert.match(toolbar,new RegExp('data-pfa-view="'+view+'" aria-pressed="true"'),'active top tab: '+view);
 assert.equal((html.match(/class="pfa-view-panel"/g)||[]).length,3,'exactly three view panels');
 assert.equal((toolbar.match(/data-pfa-view="/g)||[]).length,3,'exactly three top navigation buttons');
 assert.doesNotMatch(html,/pfa-view-tabs|data-pfa-view-panel="reviews"|pfaTab-reviews|pfaPanel-reviews/);
 assert.doesNotMatch(toolbar,/Pemeriksaan/);
 assert.match(html,/id="pfaReviewSlot"[^>]* hidden aria-hidden="true"/,'review compatibility anchor is inaccessible');
 const panels=Array.from(html.matchAll(/<section class="pfa-view-panel"[^>]+>/g),m=>m[0]);
 assert.equal(panels.filter(x=>!x.includes(' hidden')).length,1,'one and only one visible content panel');
}
assert.match(src,/if\(\['summary','items','payments'\]\.indexOf\(nextView\)<0\)return;/,'unknown/deprecated routes ignored');
assert.match(src,/if\(purchaseView==='summary'\)ensureMonthlyTrend\(\)/);
assert.match(src,/data-pfa-notifications/,'quality review still points to Notifications');
assert.match(css,/\.pfa-review-compat\[hidden\][\s\S]*?display:none!important/);
assert.match(css,/\.pfa-quick-switch button.active/);
assert.match(src,/function purchasePieMarkup\(/);
assert.match(src,/function monthlyTrendMarkup\(/);
assert.match(src,/id="pfaReviewSlot"/);
assert.match(read('owner-master-unit-review-v1.js'),/getElementById\('pfaReviewSlot'\)/);
assert.match(read('owner-p03-p04-reconciliation-v1.js'),/getElementById\('pfaReviewSlot'\)/);
assert.match(read('owner-conversion-triage-v1.js'),/getElementById\('pfaReviewSlot'\)/);
console.log('Purchase single top navigation and safe deferred review: PASS');
