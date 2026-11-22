'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const op=read('operational-v1.js');
const admin=read('administration-v1.js');
const adminCss=read('administration-v1.css');
const nav=read('nav-patch.js');

test('P2 Pengeluaran is mounted lazily inside Operasional for owners',()=>{
 assert.match(op,/data-op-action="show-expenses"/);
 assert.match(op,/state\.subtab==='expenses'/);
 assert.match(op,/id="opExpensesHost"/);
 assert.match(op,/function ensureExpenses\(\)/);
 assert.match(op,/window\.__HASNARIA_ADMIN_V2\.mount\(\{hostId:'opExpensesHost'\}\)/);
 assert.match(op,/sc\.src='\/administration-v1\.js\?v=1'/);
 assert.match(op,/if\(!isOwner\(\)\|\|!active\(\)\|\|state\.subtab!=='expenses'\)return/);
});

test('Administration report supports the new host and preserves the legacy host',()=>{
 assert.match(admin,/hostId:'administrasi'/);
 assert.match(admin,/function getHost\(\)\{return document\.getElementById\(S\.hostId\|\|'administrasi'\)\}/);
 assert.match(admin,/S\.hostId=o&&o\.hostId\?String\(o\.hostId\):'administrasi'/);
 assert.match(admin,/ui_administration_overview_v1/);
 assert.match(admin,/ui_administration_category_chart_v1/);
 assert.match(admin,/ui_administration_detail_v1/);
 assert.match(admin,/get_ui_period_catalog_fast_v1/);
 assert.match(adminCss,/:is\(#administrasi, #opExpensesHost\)/);
 assert.doesNotMatch(admin,/\.from\([^)]*\)\.(?:insert|update|upsert|delete)\s*\(/i);
 assert.doesNotMatch(admin,/\.rpc\(['"](?:create|update|delete|post)_/i);
});

test('P3 navigation label does not expose standalone Administrasi tab',()=>{
 assert.match(nav,/var LABELS = \{[^}]*ops: 'Keuangan'/);
 assert.doesNotMatch(nav,/administrasi:\s*'Administrasi'/);
 assert.match(nav,/else if\(b\.id!=='userSettingsTab'\)b\.style\.display='none'/);
});
