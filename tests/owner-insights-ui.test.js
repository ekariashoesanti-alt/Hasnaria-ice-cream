'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const base=path.join(__dirname,'..');
const read=n=>fs.readFileSync(path.join(base,n),'utf8');
test('Owner navigation has one section and lazy Notifications below Stock',()=>{
 const s=read('owner-shell-guard.js');
 assert.match(s,/OWNER_TABS=\[[^\]]*'stok','notifikasi'/);
 assert.match(s,/SECTION_IDS=\[[^\]]*'stok','notifikasi'/);
 assert.match(s,/tabs\.querySelector\('\.tab\[data-tab="stok"\]'\)/);
 assert.match(s,/function ensureNotifications\(/);
 assert.match(s,/state\.active==='notifikasi'\)ensureNotifications\(\)/);
 assert.match(s,/hasnaria-owner-insight-css/);
});
test('Owner Purchase reuses a single canonical panel and does not call legacy destructive upload',()=>{
 const a=read('purchase-analytics.js'),p=read('purchase-finance-alignment-v1.js');
 assert.match(a,/if\(ownerCompact\(\)\)\{renderOwnerShell\(host\);return\}/);
 assert.match(a,/get_ui_period_catalog_fast_v1/);
 assert.match(a,/if\(ownerCompact\(\)\)\{state\.error='Jalur upload Excel lama ditutup/);
 assert.match(p,/get_purchase_control_period_v1/);
 assert.match(p,/pfa-insights-grid/);
 assert.match(p,/Tren Pembelian Harian/);
 assert.match(p,/Top 5 Item Pembelian/);
 assert.doesNotMatch(p,/pfa-main-grid/);
});
test('Stock infographic stays in canonical renderer, never fabricates movement and hides Export CSV',()=>{
 const s=read('stock-control-v3.js');
 assert.match(s,/function compositionInfographic\(/);
 assert.match(s,/function topSkuInfographic\(/);
 assert.match(s,/function anomalyInfographic\(/);
 assert.match(s,/if\(!activeCount\)return.*Belum ada movement/);
 assert.match(s,/if\(!S\.ledger\.length\)return.*Muat Top 5 SKU/);
 assert.doesNotMatch(s,/data-sc3-action="export"/);
 assert.match(s,/data-sc4-modal="position"/);
 assert.match(s,/data-sc4-modal="ledger"/);
 assert.match(s,/data-sc4-action="opname"/);
});
test('Owner notification uses only read-only RPC and rejects non-owner',async()=>{
 const source=read('owner-notifications-v1.js');
 assert.doesNotMatch(source,/\.(?:insert|update|upsert|delete)\s*\(/);
 assert.match(source,/get_purchase_control_period_v1/);
 assert.match(source,/owner_conversion_review_queue_v1/);
 const h={innerHTML:'',classList:{contains(){return false}}},listeners={};
 const context={role:'owner',brandId:'brand'};
 let calls=[];
 const db={rpc(name){calls.push(name);return Promise.resolve({data:name==='get_purchase_control_period_v1'?
  {rows:[{stock_status:'ready_to_stock',source_stock_unit:'',stock_mapping_status:'exact_name',total_amount:123}],control:{finance_link_status:'MISMATCH',stock_link_status:'REVIEW',purchase_journal_delta:-123}}:
  {pending_rules:25,verified_rules:3,items:[]}})}};
 const document={getElementById(id){return id==='notifikasi'||id==='app'?h:null},addEventListener(type,fn){listeners[type]=fn}};
 const win={__HASNARIA_CONTEXT:context,__HASNARIA_DB:db};
 vm.runInNewContext(source,{window:win,document,Promise,Date,Number,String,Array,Object,JSON,Math,console},{filename:'owner-notifications-v1.js'});
 assert.ok(win.__HASNARIA_OWNER_NOTIFICATIONS);
 win.__HASNARIA_OWNER_NOTIFICATIONS.mount();
 for(let i=0;i<18;i++)await Promise.resolve();
 assert.deepEqual(calls,['get_purchase_control_period_v1','owner_conversion_review_queue_v1']);
 assert.match(h.innerHTML,/Jurnal Pembelian|Rekonsiliasi Pembelian/);
 assert.match(h.innerHTML,/Aturan konversi/);
 const before=calls.length;
 win.__HASNARIA_CONTEXT={role:'staff',brandId:'brand'};
 win.__HASNARIA_OWNER_NOTIFICATIONS.refresh();
 assert.equal(calls.length,before,'Staff must never query Owner queue');
});
