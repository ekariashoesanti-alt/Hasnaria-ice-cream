'use strict';
// Follow-up to merged PR #129: Sales-style Purchase header must preserve real
// month select, file upload, all graph tabs, and canonical financial data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=(name)=>fs.readFileSync(name,'utf8');
const source=read('purchase-finance-alignment-v1.js'),style=read('owner-one-view.css'),upload=read('purchase-dual-source-v2.js');
const hStart=source.indexOf('function purchaseSalesHeader('),hEnd=source.indexOf('function render(){',hStart);
const mStart=source.indexOf('function mountOwnerControls('),mEnd=source.indexOf('function purchaseSalesHeader(',mStart);
assert.ok(hStart>0&&hEnd>hStart&&mStart>0&&mEnd>mStart,'new header helper and stable node mover must be present');
const head=vm.runInNewContext('('+source.slice(hStart,hEnd).trim()+')',{
  monthRange(){return{from:'2026-10-01',to:'2026-10-31'}},
  esc(v){return String(v)},n(v){return Number(v)},purchaseView:'summary'
});
const markup=head({purchase_rows:57},false);
for(const token of ['PURCHASE INTELLIGENCE','Dashboard Pembelian','upload Excel.','Lihat Detail Pembelian','2026-10-01 s/d 2026-10-31','57 transaksi','PERLU PERIKSA','pfa-upload-slot','pfa-controls-slot']){
 assert.ok(markup.includes(token),'missing expected Sales-style layout: '+token);
}
assert.doesNotMatch(markup,/Format & Multi-Periode|Review Faktur Majoo/,'unrequested/legacy actions cannot be reintroduced');
assert.equal((markup.match(/data-pfa-detail-open="1"/g)||[]).length,1,'one detail action only');
assert.doesNotMatch(markup,/data-pfa-view=|pfa-quick-switch|Pembayaran &amp; Kontrol/,'navigation removed from header');
assert.doesNotMatch(markup,/Pemeriksaan/);
const move=vm.runInNewContext('('+source.slice(mStart,mEnd).trim()+')');
const select={value:'2026-10',onchange(){return true}};
const file={files:[],onchange(){return true}};
const submit={onclick(){return true}};
const controls={parentNode:null,appendChild(){}};
const excel={parentNode:controls,input:file,button:submit};
const host={
 querySelector(q){return q==='.pa-controls'?controls:q==='.pa-upload-wrap'?excel:null},
 appendChild(node){node.parentNode=host}
};
controls.parentNode=host;
let toolbar,uploadSlot,writes=0;
const wrapper={
 set innerHTML(s){
   writes++;
   toolbar=s.includes('pfa-controls-slot')?{appendChild(n){n.parentNode=toolbar}}:null;
   uploadSlot=s.includes('pfa-upload-slot')?{appendChild(n){n.parentNode=uploadSlot}}:null;
 },
 querySelector(q){return q==='.pfa-controls-slot'?toolbar:q==='.pfa-upload-slot'?uploadSlot:null}
};
move(host,wrapper,markup);
assert.strictEqual(controls.parentNode,toolbar);
assert.strictEqual(excel.parentNode,uploadSlot);
const saved=[select,file,submit];
move(host,wrapper,markup);
assert.equal(writes,2);
assert.strictEqual(excel.input,saved[1]);
assert.strictEqual(excel.button,saved[2]);
assert.strictEqual(controls.parentNode,toolbar);
assert.strictEqual(excel.parentNode,uploadSlot);
assert.equal(select.value,'2026-10','month value unaffected');
assert.match(source,/function monthlyTrendMarkup\(/,'merged PR #129 YTD trend remains');
assert.match(source,/function purchasePieMarkup\(/,'merged PR #129 goods pie remains');
assert.match(source,/if\(wrap\.__pfaCanonicalMarkup!==nextMarkup\)/,'render guard remains');
assert.doesNotMatch(source,/purchaseView|closest\('\[data-pfa-view\]'\)/,'obsolete navigation event removed');
assert.match(upload,/if\(mb&&mf\)mb\.onclick/,'Staff Majoo handler remains unaffected');
assert.match(style,/Owner Pembelian – Sales-inspired compact top dashboard/);
assert.match(style,/\.pfa-purchase-toolbar/);
assert.match(style,/\.pfa-quick-switch/);
assert.match(style,/\.pfa-monthly-chart/);
assert.match(style,/\.pfa-pie-wrap/);
console.log('Purchase header Sales parity and preserved PR #129 charts: PASS');
