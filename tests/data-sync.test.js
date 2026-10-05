const assert=require('assert/strict');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function setup(){
  const winEvents={},docEvents={},timers=new Map(),writes=[],posted=[];
  let timerId=0,interval;
  const field={disabled:false,readOnly:false,type:'text',matches:()=>false};
  const host={querySelectorAll:()=>[field]};
  const document={visibilityState:'visible',activeElement:null,addEventListener:(n,f)=>docEvents[n]=f,dispatchEvent:e=>docEvents[e.type]?.(e)};
  const window={addEventListener:(n,f)=>winEvents[n]=f,dispatchEvent:e=>winEvents[e.type]?.(e)};
  class BroadcastChannel{constructor(){setup.channel=this}postMessage(v){posted.push(v)}}
  window.BroadcastChannel=BroadcastChannel;
  const context={window,document,navigator:{onLine:true},WeakSet,Promise,Date,Math,CustomEvent:class{constructor(type){this.type=type}},BroadcastChannel,localStorage:{setItem:(k,v)=>writes.push([k,v])},setInterval:f=>interval=f,setTimeout:f=>{timers.set(++timerId,f);return timerId},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','data-sync.js'),'utf8'),context);
  return {sync:window.__HASNARIA_DATA_SYNC,context,winEvents,docEvents,field,host,writes,posted,interval:()=>interval(),flush:async()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(f=>f());await tick()}};
}

(async()=>{
  const x=setup();let reads=0,finish;
  x.sync.register('one',()=>{reads++;return new Promise(resolve=>finish=resolve)});
  x.interval();await tick();assert.equal(reads,1);
  x.interval();await tick();assert.equal(reads,1,'one read per handler at a time');
  finish();await tick();await x.flush();assert.equal(reads,2,'pending refresh resumes after current read');finish();await tick();
  x.context.document.visibilityState='hidden';x.interval();await tick();assert.equal(reads,2,'hidden tabs do not poll');
  x.context.document.visibilityState='visible';x.context.navigator.onLine=false;x.interval();await tick();assert.equal(reads,2,'offline tabs do not poll');
  x.context.navigator.onLine=true;x.winEvents.online();await x.flush();assert.equal(reads,3);finish();await tick();
  assert.equal(x.sync.canRefresh(x.host),true);
  x.context.document.activeElement=x.field;assert.equal(x.sync.canRefresh(x.host),false,'focused draft survives');
  x.context.document.activeElement=null;x.docEvents.input({target:{...x.field,matches:()=>true}});
  x.field.matches=()=>true;x.docEvents.change({target:x.field});assert.equal(x.sync.canRefresh(x.host),false,'blurred draft survives');
  assert.equal(x.sync.canRefresh(x.host,'#period'),true,'filter controls can be excluded');
  x.sync.clearDraft(x.host);assert.equal(x.sync.canRefresh(x.host),true);
  x.sync.notify();assert.equal(x.posted.length,1);assert.equal(x.writes.length,1);
  const signal=JSON.parse(x.writes[0][1]);assert.deepEqual(Object.keys(signal).sort(),['nonce','type'],'channel carries no business/session data');
  await x.flush();assert.equal(reads,4);finish();await tick();
  x.winEvents.storage({key:x.writes[0][0],newValue:x.writes[0][1]});await x.flush();assert.equal(reads,4,'storage and channel duplicate signals deduplicate');
  x.sync.register('failed',()=>{throw Error('network')});let healthy=0;x.sync.register('healthy',()=>healthy++);
  x.interval();await tick();assert.equal(healthy,1,'one failed reader does not block others');finish();await tick();
  console.log('Data sync visibility, single-flight, draft and signal tests: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
