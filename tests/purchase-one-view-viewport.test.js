// Acceptance contracts for Owner Purchase one-viewport and no-flicker render.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const read=n=>fs.readFileSync(n,'utf8');
const css=read('owner-one-view.css');
const palette=read('owner-green.css');
const app=read('purchase-finance-alignment-v1.js');
const preload=read('xlsx-preload.js');
const shell=read('owner-shell-guard.js');

assert.match(css,/Purchase Owner: compact single-viewport workspace/);
assert.match(css,/\.pa-root\.pa-owner-single-render:has\(>#purchaseFinanceAlignment\)/);
assert.match(css,/grid-template-rows:auto auto minmax\(0,1fr\)!important/);
assert.match(css,/#purchaseFinanceAlignment>.pfa-view-panels/);
assert.match(css,/\.pfa-view-panel\[hidden\]/);
assert.match(css,/\.pfa-review-list/);
assert.match(css,/\.pfa-head-actions/);
assert.match(css,/flex:1 1 0!important/);
assert.match(css,/#purchaseFinanceAlignment\.pfa-period-loading::after/);
assert.match(css,/max-height:100%!important/);

for(const view of ['summary','items','payments']){
 assert.ok(app.includes("data-pfa-view-panel=\""+view+"\""),view+' content stays accessible');
 assert.ok(app.includes("data-pfa-view=\""+view+"\""),view+' quick switch is defined');
}
assert.doesNotMatch(app,/class="pfa-view-tabs"/,'duplicate lower navigation must not render');
assert.doesNotMatch(app,/data-pfa-view-panel="reviews"/,'Pemeriksaan is no longer a Purchase view');
assert.match(app,/role="group"/);
assert.match(app,/aria-pressed/);
assert.match(app,/\.setAttribute\('data-pfa-ready','1'\)/);
assert.match(app,/if\(wrap\.__pfaCanonicalMarkup!==nextMarkup\)/);
assert.match(app,/wrap\.__pfaCanonicalMarkup=nextMarkup/);
assert.match(app,/id="pfaReviewSlot"/);
assert.match(app,/pfa-review-compat" hidden aria-hidden="true"/);
assert.match(css,/\.pfa-review-compat\[hidden\]/);
assert.match(app,/data-pfa-detail-open="1"/);
assert.match(app,/wrap\.classList\.toggle\('pfa-period-loading'/);
assert.match(app,/if\(!document\.getElementById\('purchaseFinanceAlignment'\)\)render\(\)/);
assert.doesNotMatch(app,/if\(b\.matches\('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn'\)\)setTimeout\(function\(\)\{resetData\(\)/,
 'Opening the upload picker must not blank the live report');
assert.match(app,/hasnaria:purchase-imported/);
assert.match(app,/data-pfa-detail-open/);
assert.match(app,/data-pfa-unit-open/);

for(const path of ['purchase-analytics.css?v=1','purchase-finance-alignment-v1.css?v=5','purchase-dual-source.css?v=1','owner-insight-v1.css?v=1','owner-one-view.css?v=7']){
 assert.ok(palette.includes(path),'first-paint Owner CSS preloads '+path);
}
assert.match(preload,/purchase-finance-alignment-v1\.js\?v=21/);
assert.match(shell,/data-purchase-pending/);
console.log('Owner Purchase one-view and anti-flicker contract: PASS');

for(const file of ['owner-master-unit-review-v1.js','owner-p03-p04-reconciliation-v1.js','owner-conversion-triage-v1.js']){
 const source=read(file);
 assert.match(source,/getElementById\('pfaReviewSlot'\)/,file+' review button must be isolated from summary flow');
 assert.doesNotMatch(source,/getElementById\('purchaseFinanceAlignment'\)/,file+' must not append cards below the infographic');
}
for(const v of ['master-unit-review-v1','p03-p04-reconciliation-v1','conversion-triage-v1']){
 assert.ok(read('index.html').includes(v+'.js?v=2'),v+' bundle is cache busted');
}
console.log('Owner Purchase review-slot isolation: PASS');
