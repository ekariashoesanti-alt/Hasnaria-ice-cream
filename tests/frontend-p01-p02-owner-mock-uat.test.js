'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
// Mocked UI exercise only. No user credentials, Supabase traffic or writes.
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}
function harness(file,role='owner'){
 const listeners={},pending=[],requests=[],observers=[];
 let context={role,user_id:'A'},dialog=null,hidden=false;
 const root={children:[],querySelector(s){return this.children.find(c=>c.attr===s)||null},
    appendChild(e){this.children.push(e)}};
 function node(){
  return{innerHTML:'',setAttribute(k,v){this.attr='['+k+']'},
   querySelector(){return null},remove(){if(dialog===this)dialog=null}};
 }
 const doc={
  readyState:'loading',
  addEventListener(k,fn){(listeners[k]||=[]).push(fn)},
  getElementById(id){if(id==='purchaseFinanceAlignment')return root;if(id==='app')return{classList:{contains(x){return hidden&&x==='hidden'}}};if(id==='pembelian')return root;return null},
  createElement:node,
  body:{appendChild(el){dialog=el}}
 };
 const db={rpc(name,args){requests.push({name,args});if(name.endsWith('_queue_v1')){const d=deferred();pending.push(d);return d.promise}throw Error('Mock UAT unexpectedly called mutating RPC: '+name)}};
 const window={__HASNARIA_CONTEXT:context,__HASNARIA_DB:db};
 const ctx={window,document:doc,MutationObserver:class{constructor(cb){observers.push(cb)}observe(){}},
   setTimeout(fn){fn();return 0},clearTimeout(){},console,Date,Math,Promise,Set,Array};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx,{filename:file});
 function event(type,attr,val){const e={getAttribute(k){return k===attr?val:null},closest(q){return q.split(',').some(z=>z.trim()==='['+attr+']')?e:null}};
  for(const cb of listeners[type]||[])cb({target:e})}
 function open(){event('click',file.includes('orphan')?'data-hsn-legacy-open':'data-hsn-master-open','1')}
 function switchRole(next,id){context={role:next,user_id:id};window.__HASNARIA_CONTEXT=context}
 function hide(){hidden=true;observers.forEach(fn=>fn())}
 async function settle(){for(let i=0;i<8;i++)await Promise.resolve()}
 for(const cb of listeners.DOMContentLoaded||[])cb();
 return{open,switchRole,hide,settle,pending,requests,event,get dialog(){return dialog}};
}
test('P0.1 stale receipt response does not leak across Owner account switch',async()=>{
 const h=harness('owner-orphan-receipt-review-v1.js');h.open();
 h.switchRole('owner','B');h.open();assert.equal(h.pending.length,2);
 h.pending[1].resolve({data:{items:[{receipt_id:'B',item_name:'SKU_OWNER_B',purchase_date:'2026-09-05',receipt_qty:2,receipt_unit:'pcs',receipt_amount:20}]}});
 await h.settle();assert.match(h.dialog.innerHTML,/SKU_OWNER_B/);
 h.pending[0].resolve({data:{items:[{receipt_id:'A',item_name:'SECRET_OWNER_A',purchase_date:'2026-09-02'}]}});
 await h.settle();assert.match(h.dialog.innerHTML,/SKU_OWNER_B/);assert.doesNotMatch(h.dialog.innerHTML,/SECRET_OWNER_A/);
 assert.equal(h.requests.length,2);
});
test('P0.1 Staff cannot load Owner receipt review and logout hides late result',async()=>{
 const h=harness('owner-orphan-receipt-review-v1.js','staff');h.open();assert.equal(h.requests.length,0);
 h.switchRole('owner','A');h.open();assert.equal(h.requests.length,1);h.hide();assert.equal(h.dialog,null);
 h.pending[0].resolve({data:{items:[{receipt_id:'X',item_name:'PRIVATE_PURCHASE'}]}});await h.settle();
 assert.equal(h.dialog,null);
});
test('P0.2 owner master SKU preview queue stays read-only and cannot open as Staff',async()=>{
 const h=harness('owner-master-unit-review-v1.js','staff');h.open();assert.equal(h.requests.length,0);
 h.switchRole('owner','A');h.open();assert.equal(h.requests.length,1);
 h.pending[0].resolve({data:{items:[{item_id:'NORI',item_name:'NORI',master_unit:'purchase_unit',priority:'P0_ACTIVE_DEPENDENCY',
  receipt_count:0,movement_count:0,active_recipe_count:1,pending_purchase_count:0,tracking_active:false}]}});
 await h.settle();assert.match(h.dialog.innerHTML,/NORI/);assert.match(h.dialog.innerHTML,/purchase_unit/);
 assert.deepEqual(h.requests.map(r=>r.name),['owner_master_unit_queue_v1']);
 h.hide();assert.equal(h.dialog,null);
});
