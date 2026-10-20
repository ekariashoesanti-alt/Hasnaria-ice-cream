'use strict';
// Guard against the Owner page reintroducing a separate Purchase header,
// Majoo button, or destroying month/upload event listeners during re-render.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=n=>fs.readFileSync(n,'utf8');
const analytics=read('purchase-analytics.js');
const report=read('purchase-finance-alignment-v1.js');
const upload=read('purchase-dual-source-v2.js');
const css=read('owner-one-view.css');

const ownerStart=analytics.indexOf('  function renderOwnerShell(host){');
const ownerEnd=analytics.indexOf('  function render(){',ownerStart);
const ownerShell=analytics.slice(ownerStart,ownerEnd);
assert.ok(ownerStart>=0&&ownerEnd>ownerStart);
assert.doesNotMatch(ownerShell,/class="pa-title"/, 'Owner must not paint a second Purchase title');
assert.match(ownerShell,/pa-unified-card/);
assert.match(ownerShell,/id="paPeriod"/, 'the original month selector remains');
assert.match(ownerShell,/pa-upload-wrap/, 'the original upload anchor remains');

assert.match(upload,/\(owner\?'':'<button id="purchaseMajooBtn"/, 'Owner does not receive a Majoo control');
assert.match(upload,/if\(mb&&mf\)mb\.onclick/, 'Staff Majoo listener remains optional');
assert.match(upload,/id="purchaseExcelBtn"/);
assert.match(upload,/id="purchaseExcelFile"/);

const start=report.indexOf('function mountOwnerControls(');
const end=report.indexOf('function render(){',start);
assert.ok(start>=0&&end>start,'controls mover exists before canonical renderer');
const mount=vm.runInNewContext('('+report.slice(start,end).trim()+')');
const select={value:'2026-10',onchange(){return 'kept'}};
const excel={onclick(){return 'kept'}};
const controls={id:'pa-controls',select,excel,parentNode:null};
let rootMoves=0,slotMoves=0,updated=0,slot=null;
const root={
  querySelector(q){return q==='.pa-controls'?controls:null},
  appendChild(node){assert.strictEqual(node,controls);controls.parentNode=this;rootMoves++}
};
controls.parentNode=root;
const wrap={
  set innerHTML(html){updated++;slot=html.includes('pfa-controls-slot')?{
    appendChild(node){assert.strictEqual(node,controls);controls.parentNode=this;slotMoves++}
  }:null},
  querySelector(q){return q==='.pfa-controls-slot'?slot:null}
};
mount(root,wrap,'<div class="pfa-head"></div><div class="pfa-controls-slot"></div>');
assert.equal(slotMoves,1,'controls inserted into card on first render');
assert.equal(rootMoves,0,'first paint does not detach needlessly');
mount(root,wrap,'<div class="pfa-head">new data</div><div class="pfa-controls-slot"></div>');
assert.equal(rootMoves,1,'controls extracted before HTML replacement');
assert.equal(slotMoves,2,'controls returned into the refreshed report');
assert.strictEqual(controls.select,select,'same month selector instance');
assert.strictEqual(controls.excel,excel,'same Excel upload instance');
assert.equal(controls.select.value,'2026-10','month remains selected');
assert.match(report,/if\(wrap\.__pfaCanonicalMarkup!==nextMarkup\)/, 'no redraw for unchanged data');
assert.match(report,/pfa-controls-slot/);

assert.match(css,/pa-root\.pa-owner-single-render\.pa-unified-card:has\(>#purchaseFinanceAlignment\)/);
assert.match(css,/#purchaseFinanceAlignment \.pfa-controls-slot>/);
assert.match(css,/grid-template-rows:minmax\(0,1fr\)!important/);
console.log('Purchase Owner unified-card & event-preserving mount: PASS');
