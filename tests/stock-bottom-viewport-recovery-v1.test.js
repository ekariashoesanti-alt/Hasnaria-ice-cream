'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const stock=read('stock-control-v3.css');
const legacy=read('owner-one-view.css');
const js=read('stock-control-v3.js');
const fix=stock.slice(stock.indexOf('/* 2026-10-31 / Owner Stok bottom-edge recovery'));
const route='html body.hasnaria-owner-erp #app>main.wrap>section#stok:not(.hidden):has(.sc22-dashboard)';

test('root cause: global one-view clips taller Stock section; override is specific to Stock only',()=>{
 assert.match(legacy,/body\.hasnaria-owner-erp #app>main\.wrap>section:not\(\.hidden\)\{[\s\S]*?overflow:hidden!important/);
 assert.ok(fix.startsWith('/* 2026-10-31 / Owner Stok bottom-edge recovery'));
 assert.match(fix,/@media \(min-width:901px\)/);
 assert.ok(fix.includes(route+'{'));
 assert.match(fix,/overflow-x:hidden!important;overflow-y:auto!important/);
 assert.match(fix,/height:100%!important;max-height:100%!important;min-height:0!important/);
 assert.match(fix,/scrollbar-gutter:stable/);
 assert.match(fix,/padding-bottom:clamp\(24px,3\.5vh,44px\)!important/);
 // Avoid breaking other one-view ERP sections when fixing Stock.
 assert.doesNotMatch(fix,/#sales\b|#pembelian\b|#ops\b|#operasional\b|#dashboard\b/);
 assert.doesNotMatch(fix,/(?:html,body)\s*\{/);
});

test('outer scroll plus natural-height inner shell makes last chart captions reachable',()=>{
 assert.match(fix,/>.sc3-shell\{[\s\S]*?height:auto!important;max-height:none!important/);
 assert.match(fix,/>.sc3-shell\{[\s\S]*?overflow:visible!important/);
 assert.match(fix,/scroll-padding-bottom:24px/);
 assert.match(fix,/overscroll-behavior-y:contain/);
 assert.match(fix,/@media \(min-width:901px\) and \(max-height:850px\)/);
 assert.match(fix,/\.sc22-dual>.sc5-panel\{[\s\S]*?min-height:0!important/);
 assert.doesNotMatch(fix,/\.sc22-plot-svg\{[\s\S]*?(?:display:none|max-height:0)/);
});

test('the corrected release is CSS-only: no stock math or backend changes',()=>{
 assert.match(js,/stock-control-v3\.css\?v=32/);
 for(const p of ['stock-monitor.js','stock-v3-runtime-fix.js']){
  assert.match(read(p),/stock-control-v3\.js\?v=38/);
 }
 for(const label of ['Tren Stok Akhir Bulanan','Stok Saat Ini vs Batas Aman','Ringkasan empat KPI stok']){
  assert.ok(js.includes(label),label);
 }
 assert.match(read('scripts/vercel-build-check.js'),/stock-bottom-viewport-recovery-v1\.test\.js/);
});
