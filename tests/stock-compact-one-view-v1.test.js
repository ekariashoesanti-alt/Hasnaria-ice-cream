'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('stock-control-v3.css','utf8');
const src=fs.readFileSync('stock-control-v3.js','utf8');
const region=css.slice(css.indexOf('/* 2026-11-02 HSN-008 Stock compact one-view'));
const owner='html body.hasnaria-owner-erp #app>main.wrap>section#stok:not(.hidden):has(.sc22-dashboard):not(:has(.sc4-modal))';
test('Stock one-view is strictly Owner desktop and preserves modal/short-screen fallback',()=>{
 assert.ok(region.startsWith('/* 2026-11-02 HSN-008'));
 assert.match(region,/@media \(min-width:1101px\) and \(min-height:720px\)/);
 assert.ok(region.includes(owner+'{'));
 for(const s of ['#sales','#pembelian','#operasional','#dashboard','#ops'])assert.ok(!region.includes(s));
});
test('KPI, controls and both charts are retained and viewport-constrained',()=>{
 for(const s of ['>.sc3-shell .sc8-kpi{','>.sc3-shell .sc22-dual>.sc5-panel{','>.sc3-shell .sc21-foot{','>.sc3-shell .sc22-chart-note{'])assert.ok(region.includes(owner+s),s);
 assert.match(region,/\.sc21-comparison-svg\{[^}]*min-width:0!important/);
 assert.match(region,/\.sc22-plot-svg\{[^}]*min-width:0!important/);
 assert.ok(!/\.sc21-foot\{display:none|\.sc22-chart-note\{display:none/.test(region));
 for(const label of ['Total Item (SKU)','Nilai Stok (Parsial)','Item Stok Rendah','Belum Opname Awal','Tren Stok Akhir Bulanan','Stok Saat Ini vs Batas Aman'])assert.ok(src.includes(label),label);
 assert.match(src,/stock-control-v3\.css\?v=34/);
});
