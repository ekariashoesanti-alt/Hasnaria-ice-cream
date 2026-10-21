'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync('purchase-finance-alignment-v1.js','utf8'),css=fs.readFileSync('owner-one-view.css','utf8');
const start=js.indexOf('function trendMonths('),end=js.indexOf('function purchaseJournalReconciliation()',start);
assert.ok(start>0&&end>start);
let selected='2026-10';
const st={
 purchaseTrendCache:{},periods:[],rows:[],purchaseView:'summary',
 MONTHS:['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],
 Math,Number,String,Array,Object,JSON,Date,Promise,console,
 periodKey:v=>String(v||'').slice(0,7),periodValue:()=>selected,
 monthLabel:k=>st.MONTHS[Number(k.slice(5,7))-1]+' '+k.slice(0,4),
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 n:v=>Number.isFinite(Number(v))?Number(v):0,
 money:v=>'Rp '+Number(v).toLocaleString('id-ID'),
 total:r=>r.reduce((a,x)=>a+Number(x.total_amount||0),0)
};
const f=vm.runInNewContext(js.slice(start,end)+';({monthlyPaymentMarkup,rememberTrendMonth,paymentParts})',st);
f.rememberTrendMonth('2026-01',[
 {total_amount:500,payment_method:'TUNAI'},
 {total_amount:250,payment_method:'TRANSFER'},
 {total_amount:100,payment_method:'PAYLATER'},
 {total_amount:150,payment_method:'UNKNOWN'}
]);
f.rememberTrendMonth('2026-10',[{total_amount:500,payment_method:'TRANSFER'}]);
const markup=f.monthlyPaymentMarkup();
assert.match(markup,/class="pfa-payment-svg"/);
assert.match(markup,/viewBox="0 0 710 190"/);
assert.match(markup,/aria-label="Diagram kolom bertumpuk 100% pembayaran per bulan"/);
assert.equal((markup.match(/class="pfa-payment-month-tick"/g)||[]).length,10,'Jan-Oct x-axis labels');
assert.equal((markup.match(/class="pfa-payment-axis"/g)||[]).length,5,'0–100% y-axis tick labels');
for(const label of ['0%','25%','50%','75%','100%'])assert.ok(markup.includes('>'+label+'</text>'),'Y axis: '+label);
assert.equal((markup.match(/class="pfa-payment-missing"/g)||[]).length,8,'no-data months shown as hatched and not counted as zero');
assert.match(markup,/fill="url\(#pfa-payment-nodata\)"/);
assert.match(markup,/bulan tanpa sumber/);
assert.match(markup,/Bukan dianggap 0%/);
assert.doesNotMatch(markup,/class="pfa-payment-month"|class="pfa-payment-track"|style="width:/,'no horizontal elements');
const matches=[...markup.matchAll(/<rect class="pfa-payment-slice pfa-pie-color-(\d)" x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/g)];
assert.equal(matches.length,5,'four Jan funding slices plus one Oct transfer');
const jan=matches.slice(0,4),oct=matches[4],heightSum=jan.reduce((v,x)=>v+Number(x[5]),0);
assert.ok(Math.abs(heightSum-135)<.02,'Jan 100% stacks exactly 135 px in SVG plot');
assert.ok(Math.abs(Number(oct[5])-135)<.02,'Oct single method fills 100%');
assert.deepEqual(jan.map(x=>Number(x[1])),[0,1,2,3],'palette matches Porsi chart');
assert.equal(Number(oct[1]),1,'Oct transfer palette');
assert.equal(new Set(jan.map(x=>x[2])).size,1,'Jan shares the same x position');
assert.ok(Number(oct[2])>Number(jan[0][2]),'October column to the right of January');
for(const row of matches){
 let y=Number(row[3]),h=Number(row[5]);
 assert.ok(y>=17.99&&y+h<=153.02&&h>0,'every segment stays inside 0–100% boundaries');
}
assert.match(css,/\.pfa-payment-svg\{/);
assert.match(css,/\.pfa-payment-month-tick\{/);
assert.match(css,/\.pfa-payment-missing\{/);
assert.doesNotMatch(css,/grid-template-rows:repeat\(10,minmax\(0,1fr\)\)/,'old horizontal bars removed');
selected='2026-03';
let march=f.monthlyPaymentMarkup();
assert.equal((march.match(/class="pfa-payment-month-tick"/g)||[]).length,3);
assert.doesNotMatch(march,/Okt<\/text>/,'later months are not shown');
console.log('Purchase vertical 100% stacked payments: geometry, bounds, data gaps and palette PASS');
