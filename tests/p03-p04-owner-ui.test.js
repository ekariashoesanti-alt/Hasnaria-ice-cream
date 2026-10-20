'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'owner-p03-p04-reconciliation-v1.js'),'utf8');

test('P0.3 owner UI loads both documentary queues; Staff cannot see private results',async()=>{
 const listeners={},calls=[],pending=[],view={dialog:null,entry:null},rootNode={querySelector(){return view.entry},appendChild(el){view.entry=el}};
 let context={role:'staff'};
 const doc={readyState:'loading',addEventListener(k,f){(listeners[k]||=[]).push(f)},getElementById(id){
  if(id==='pembelian'||id==='pfaReviewSlot')return rootNode;
  if(id==='app')return{classList:{contains(){return false}}};return null;
 },createElement(){return{innerHTML:'',setAttribute(){},getAttribute(){return null},remove(){view.dialog=null}}},body:{appendChild(x){view.dialog=x}}};
 const db={rpc(name,args){calls.push({name,args});if(name==='owner_p03_work_queue_v1')
   return Promise.resolve({data:{pending_unit:[{baseline_effect:'POST_OPNAME'}],mapping_review:[{source_id:'X',item_name:'ES BATU',mapping_status:'ambiguous_inventory_name',amount:5000}],pending_unit_count:1,mapping_review_count:1}});
  if(name==='owner_p04_import_readiness_v1')return Promise.resolve({data:{sales_status:'NO_SOURCE_UPLOAD_FOUND',purchase_status:'NO_SOURCE_UPLOAD_FOUND',sales_canonical_rows:0,purchase_canonical_rows:0}});
  throw Error('Unexpected modifying RPC '+name)},
  from(table){assert.equal(table,'inventory_items');return{select(){return{eq(){return{order(){return{limit(){return Promise.resolve({data:[]})}}}}}}}}}};
 const window={__HASNARIA_CONTEXT:context,__HASNARIA_DB:db};
 const e={window,document:doc,MutationObserver:class{observe(){}},setTimeout(f){f();return 0},clearTimeout(){},console,Date,Promise,Number,Array,Math,JSON};
 vm.runInNewContext(js,e,{filename:'owner-p03-p04-reconciliation-v1.js'});
 (listeners.DOMContentLoaded||[]).forEach(f=>f());
 function click(kind,value){const target={closest(selector){return selector.includes('['+kind+']')?target:null},getAttribute(k){return k===kind?value:null}};(listeners.click||[]).forEach(f=>f({target}));}
 click('data-hsn-p03-open','1');assert.equal(calls.length,0,'Staff must not load owner reports');
 context={role:'owner',id:'ONE'};window.__HASNARIA_CONTEXT=context;
 click('data-hsn-p03-open','1');
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(calls[0].name,'owner_p03_work_queue_v1');
 assert.match(view.dialog.innerHTML,/ES BATU/);
 click('data-hsn-p03-tab','p04');
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(calls[1].name,'owner_p04_import_readiness_v1');
 assert.match(view.dialog.innerHTML,/Belum ditemukan file/);
 assert.equal(calls.length,2,'Opening and switching tabs must not mutate business data');
});
test('P0.3 feature is linked, is documentary-only and does not use direct business writes',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/owner-p03-p04-reconciliation-v1\.js\?v=2/);
 for(const marker of ['owner_p03_work_queue_v1','owner_p04_import_readiness_v1','owner_purchase_unmapped_preview_v1','owner_purchase_unmapped_apply_v1'])
 assert.ok(js.includes(marker),'missing '+marker);
 assert.doesNotMatch(js,/\.from\(['"](?:inventory_purchase_log|inventory_movements|offline_purchase_history|sales|finance_journal_entries)['"]\)/);
 assert.match(js,/c&&c.role==='owner'/);
});
