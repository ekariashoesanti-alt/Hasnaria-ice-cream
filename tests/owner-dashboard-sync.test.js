const assert=require('assert/strict');
const fs=require('fs');
const vm=require('vm');
const path=require('path');

function setup(){
  let html='',renders=0,hidden=false,safe=true,handler;
  const requests=[],events={};
  const host={get innerHTML(){return html},set innerHTML(v){html=v;renders++},classList:{contains:()=>hidden},querySelector:()=>html.includes('data-ceo-one-view')?{classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){}}:null};
  const document={getElementById:id=>id==='dashboard'?host:id==='hx-exec-css'?{}:null,addEventListener:(n,f)=>events[n]=f};
  const window={__HASNARIA_CONTEXT:{role:'owner'},__HASNARIA_DB:{rpc:(name,args)=>new Promise(resolve=>requests.push({name,args,resolve}))},__HASNARIA_DATA_SYNC:{canRefresh:()=>safe,register:(name,f)=>handler=f},requestIdleCallback(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','owner-dashboard-one-view.js'),'utf8'),{window,document,Date,Intl,Number,String,Array,Promise,JSON,setTimeout(){}});
  return {window,requests,events,host,get renders(){return renders},set safe(v){safe=v},set hidden(v){hidden=v},refresh:reason=>handler(reason)};
}

(async()=>{
 const x=setup(),mount=x.window.__HASNARIA_DASHBOARD_ONE_VIEW.mount;
 let initial=mount();assert.equal(x.requests.length,1);x.requests[0].resolve({data:{revenue:10}});await initial;
 const count=x.renders;let same=x.refresh('interval');x.requests[1].resolve({data:{revenue:10}});await same;assert.equal(x.renders,count,'unchanged payload keeps DOM');
 x.safe=false;await x.refresh('interval');assert.equal(x.requests.length,2,'draft guard avoids refresh');x.safe=true;
 let stale=x.refresh('interval');x.events.click({target:{closest:()=>({getAttribute:()=>1})}});assert.equal(x.requests.length,4);
 x.requests[3].resolve({data:{revenue:200}});await new Promise(resolve=>setImmediate(resolve));const current=x.host.innerHTML;
 x.requests[2].resolve({data:{revenue:100}});await stale;assert.equal(x.host.innerHTML,current,'previous-period response cannot replace current period');
 let hidden=x.refresh('interval');x.hidden=true;x.requests[4].resolve({data:{revenue:300}});await hidden;assert.equal(x.host.innerHTML,current,'hidden screen response is discarded');
 console.log('Owner dashboard unchanged DOM and stale-period tests: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
