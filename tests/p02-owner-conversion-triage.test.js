'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'owner-conversion-triage-v1.js'),'utf8');
test('Owner conversion triage is read-only, role gated and not loaded until opened',async()=>{
 const listeners={},requests=[],dom={entry:null,modal:null},pending=[];
 let context={role:'owner',user_id:'A'};
 const host={querySelector(){return dom.entry},appendChild(x){dom.entry=x},classList:{contains(){return false}}};
 function element(){return {innerHTML:'',setAttribute(){},className:'',remove(){dom.modal=null}}}
 const doc={readyState:'loading',addEventListener(k,fn){(listeners[k]||=[]).push(fn)},
  getElementById(k){return ['pembelian','purchaseFinanceAlignment','app'].includes(k)?host:null},
  createElement:element,body:{appendChild(x){dom.modal=x}}};
 const db={rpc(name){requests.push(name);return new Promise(resolve=>pending.push(resolve))}};
 const win={__HASNARIA_CONTEXT:context,__HASNARIA_DB:db};
 const sandbox={window:win,document:doc,console,Promise,Array,String,
 MutationObserver:class{observe(){}},setTimeout(){return 1},clearTimeout(){},Math,Date};
 vm.runInNewContext(js,sandbox,{filename:'owner-conversion-triage-v1.js'});
 (listeners.DOMContentLoaded||[]).forEach(fn=>fn());
 assert.ok(dom.entry,'Owner entry visible');
 assert.equal(requests.length,0,'No API calls during initial app load');
 const button={closest(sel){return sel.includes('data-hsn-conversion-open')?button:null}};
 (listeners.click||[]).forEach(fn=>fn({target:button}));
 assert.deepEqual(requests,['owner_conversion_review_queue_v1']);
 pending[0]({data:{pending_rules:25,verified_rules:3,group_count:23,items:[{sku:'BAKSO AYAM',master_unit:'pack',purchase_unit:'pack',sale_unit:'pcs',draft_factor_min:36,draft_factor_max:36,pending_rules:1,gate:'BLOCK_MASTER_SALE_UNIT_CONFLICT'}]}});
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.match(dom.modal.innerHTML,/BAKSO AYAM/);
 assert.match(dom.modal.innerHTML,/25 aturan draft/);
 assert.equal(requests.length,1,'Review is strictly read-only');
 context={role:'staff',user_id:'B'};win.__HASNARIA_CONTEXT=context;
 const esc={key:'Escape'};(listeners.keydown||[]).forEach(fn=>fn(esc));
 assert.equal(dom.modal,null);
 (listeners.click||[]).forEach(fn=>fn({target:button}));
 assert.equal(requests.length,1,'Staff cannot make Owner RPC');
});
test('No Stock, conversion approval, recipe or Finance write paths exist',()=>{
 for(const forbidden of ['sync_purchase_quantity_stock','resolve_inventory_conversion','apply_inventory_unit_conversion','inventory_purchase_log','inventory_recipe_components'])
   assert.equal(js.includes(forbidden),false,forbidden+' may not be used');
 assert.match(js,/owner_conversion_review_queue_v1/);
 assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/owner-conversion-triage-v1\.js\?v=1/);
});
