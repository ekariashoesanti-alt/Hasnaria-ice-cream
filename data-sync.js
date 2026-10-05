/* Shared freshness signals. Business data stays in Supabase, never in this channel. */
(function(){
  'use strict';
  if(window.__HASNARIA_DATA_SYNC)return;
  var handlers={},dirty=new WeakSet(),timer=null,channel=null,seen=[];
  var SIGNAL_KEY='hasnaria-data-change-v1';
  function available(){return document.visibilityState!=='hidden'&&navigator.onLine!==false}
  function canRefresh(host,ignore){
    if(!host)return false;
    var fields=host.querySelectorAll('input,textarea,select');
    for(var i=0;i<fields.length;i++){
      var field=fields[i];
      if(field.disabled||field.readOnly||field.type==='hidden')continue;
      if(field===document.activeElement)return false;
      if(ignore&&field.matches(ignore))continue;
      if(dirty.has(field))return false;
    }
    return true;
  }
  function remember(e){var t=e.target;if(t&&t.matches&&t.matches('input,textarea,select'))dirty.add(t)}
  function request(reason){
    if(!available())return;
    Object.keys(handlers).forEach(function(name){
      var entry=handlers[name];
      if(entry.running){entry.pending=reason;return}
      entry.running=true;
      Promise.resolve().then(function(){return entry.refresh(reason)}).catch(function(){
        // Preserve the last successful view; the next visible tick retries.
      }).finally(function(){
        entry.running=false;
        if(entry.pending){var next=entry.pending;entry.pending=null;schedule(next)}
      });
    });
  }
  function schedule(reason){if(timer!==null)clearTimeout(timer);timer=setTimeout(function(){timer=null;request(reason)},150)}
  function accept(signal){
    if(!signal||signal.type!=='changed'||typeof signal.nonce!=='string'||seen.indexOf(signal.nonce)>=0)return;
    seen.push(signal.nonce);if(seen.length>100)seen.shift();schedule('changed');
  }
  function notify(){
    var signal={type:'changed',nonce:Date.now()+'-'+Math.random().toString(36).slice(2)};
    accept(signal);
    try{if(channel)channel.postMessage(signal)}catch(_){}
    try{localStorage.setItem(SIGNAL_KEY,JSON.stringify(signal))}catch(_){}
  }
  try{if(window.BroadcastChannel){channel=new BroadcastChannel('hasnaria-data-sync-v1');channel.onmessage=function(e){accept(e.data)}}}catch(_){}
  window.addEventListener('storage',function(e){if(e.key!==SIGNAL_KEY||!e.newValue)return;try{accept(JSON.parse(e.newValue))}catch(_){}});
  window.addEventListener('focus',function(){schedule('focus')});
  window.addEventListener('online',function(){schedule('online')});
  document.addEventListener('visibilitychange',function(){if(available())schedule('visible')});
  document.addEventListener('input',remember,true);
  document.addEventListener('change',remember,true);
  document.addEventListener('hasnaria:purchase-imported',notify);
  window.__HASNARIA_DATA_SYNC={
    register:function(name,refresh){if(typeof refresh==='function')handlers[name]={refresh:refresh,running:false,pending:null}},
    notify:notify,canRefresh:canRefresh,
    clearDraft:function(host){if(host)Array.prototype.forEach.call(host.querySelectorAll('input,textarea,select'),function(field){dirty.delete(field)})}
  };
  window.dispatchEvent(new CustomEvent('hasnaria:data-sync-ready'));
  setInterval(function(){request('interval')},30000);
})();
