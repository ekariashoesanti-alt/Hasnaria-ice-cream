'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'owner-master-unit-review-v1.js'),'utf8');
test('P0.2 UI is owner-only, loads queue without saving and preserves original Stock',async()=>{
 const listeners={},pending=[],requests=[];
 let role='staff',context={role},dialog=null,hidden=false;
 const host={children:[],querySelector(sel){return this.children.find(e=>e.selector===sel)||null},appendChild(el){this.children.push(el)}};
 function node(){return {innerHTML:'',setAttribute(k,v){this.selector='['+k+']'},querySelector(){return null},remove(){if(dialog===this)dialog=null}};}
 const doc={readyState:'loading',addEventListener(t,fn){(listeners[t]||=[]).push(fn)},createElement:node,
 getElementById(id){if(id==='app')return{classList:{contains(n){return n==='hidden'&&hidden}}};
 if(id==='pembelian'||id==='purchaseFinanceAlignment')return host;return null;},
 body:{appendChild(el){dialog=el}}};
 const db={rpc(name,args){requests.push({name,args});return new Promise(resolve=>pending.push(resolve))}};
 const window={__HASNARIA_CONTEXT:context,__HASNARIA_DB:db};
 const observers=[];
 const env={window,document:doc,MutationObserver:class {constructor(f){observers.push(f)}observe(){}},setTimeout(f){f();return 0},clearTimeout(){},console,Promise,Math,Date};
 vm.runInNewContext(source,env,{filename:'owner-master-unit-review-v1.js'});
 (listeners.DOMContentLoaded||[]).forEach(fn=>fn());
 function open(){const e={closest(s){return s.includes('[data-hsn-master-open]')?{}:null}};(listeners.click||[]).forEach(fn=>fn({target:e}));}
 open();assert.equal(requests.length,0,'Staff opened private queue');
 context={role:'owner',id:'OWNER_A'};window.__HASNARIA_CONTEXT=context;
 open();assert.equal(requests.length,1);
 assert.equal(requests[0].name,'owner_master_unit_queue_v1');
 pending[0]({data:{items:[{item_id:'NORI',item_name:'NORI',master_unit:'purchase_unit',priority:'P0_ACTIVE_DEPENDENCY',receipt_count:0,movement_count:0,active_recipe_count:1,pending_purchase_count:0}]}});
 for(let n=0;n<8;n++)await Promise.resolve();
 assert.match(dialog.innerHTML,/NORI/);
 assert.equal(requests.length,1,'open queue must not mutate business tables');
 hidden=true;observers.forEach(fn=>fn());
 assert.equal(dialog,null,'Logout must remove documentary modal');
});
test('P0.2 remains a documentary review only',()=>{
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(index,/owner-master-unit-review-v1\.js\?v=1/);
 assert.match(source,/owner_master_unit_apply_v1/);
 assert.doesNotMatch(source,/\.from\(['"](?:inventory_items|inventory_movements|inventory_purchase_log|inventory_recipe_components)['"]\)\.(?:update|delete|insert|upsert)/);
 assert.match(source,/c&&c.role==='owner'/);
 const css=fs.readFileSync(path.join(root,'purchase-finance-alignment-v1.css'),'utf8');
 assert.match(css,/\.pfa-unit-modal/);
});
