'use strict';
// Oct 2026 Owner Purchase compact header/card parity with Sales.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const read=(path)=>fs.readFileSync(path,'utf8');
const source=read('purchase-finance-alignment-v1.js');
const css=read('owner-one-view.css');
const notes=read('owner-notifications-v1.js');
const cardStart=source.indexOf('function card(');
const cardEnd=source.indexOf('function stockCell(',cardStart);
assert.ok(cardStart>0&&cardEnd>cardStart,'isolated KPI markup exists');
const card=vm.runInNewContext('('+source.slice(cardStart,cardEnd).trim()+')',{esc:x=>String(x)});
for(const [cls,label,value] of [['total','Total Pembelian','Rp 3,73 jt'],['inventory','Inventory','Rp 3,66 jt'],['expense','Operasional','Rp 66 rb'],['review','Review','Rp 2,25 jt']]){
 const h=card(label,value,'57 transaksi',cls);
 assert.match(h,/class="pfa-card /);
 assert.ok(h.includes('pfa-card '+cls),'card class preserved: '+cls);
 assert.ok(h.includes(label)&&h.includes(value),'KPI source values remain displayed: '+label);
 assert.match(h,/aria-hidden="true"/);
 assert.match(h,/pfa-card-icon/,'compact decorative icon for '+cls);
 assert.match(h,/<svg viewBox=/);
}
const renderStart=source.indexOf('function render(){');
const renderEnd=source.indexOf('async function loadPeriods(){',renderStart);
assert.ok(renderStart>0&&renderEnd>renderStart);
const render=source.slice(renderStart,renderEnd);
assert.match(render,/card\('Total Pembelian'/);
assert.match(render,/card\('Inventory'/);
assert.match(render,/card\('Operasional'/);
assert.match(render,/card\('Review'/);
assert.match(render,/infographicMarkup\(\)/);
assert.doesNotMatch(render,/purchaseJournalReconciliation\(\)/,
 'Do not render a duplicated full-width reconciliation banner below KPIs');
assert.match(source,/function purchaseJournalReconciliation\(\)/,
 'Reconciliation computation/helper is not deleted');
assert.match(notes,/Rekonsiliasi Pembelian → Keuangan/,
 'The detailed reconciliation issue remains available through Notifications');
assert.match(source,/pfa-sync/,
 'Compact header continues to show data quality state');
assert.match(source,/function monthlyTrendMarkup\(\)/);
assert.match(source,/function purchasePieMarkup\(\)/);
assert.match(source,/function purchaseSalesHeader\(/);
assert.match(css,/Purchase dashboard compact parity with Sales/);
assert.match(css,/height:82px!important;min-height:82px!important;max-height:82px!important/);
assert.match(css,/max-height:750px/);
assert.match(css,/\.pfa-card-icon/);
assert.match(css,/\.pfa-quick-switch button/);
assert.match(css,/\.pfa-upload-slot #purchaseExcelBtn/);
assert.match(css,/\.pfa-view-panel .pfa-insight-panel/);
assert.match(read('purchase-finance-alignment-v1.js'),/if\(wrap\.__pfaCanonicalMarkup!==nextMarkup\)/,
 'Anti-flicker canonical render remains');
console.log('Purchase Sales-compact header/KPIs and safe alert relocation: PASS');
