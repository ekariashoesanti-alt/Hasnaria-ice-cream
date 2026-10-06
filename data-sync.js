/* Shared freshness signals. Business data stays in Supabase, never in this channel. */
(function(){
  'use strict';
  if(window.__HASNARIA_DATA_SYNC)return;
  window.__HASNARIA_DATA_SYNC_V1=true;
  var handlers={},dirty=new WeakSet(),timer=null,channel=null,seen=[];
  var SIGNAL_KEY='hasnaria-data-change-v1';
  function available(){return document.visibilityState!=='hidden'&&navigator.onLine!==false}
  function visible(el){
    if(!el||el.hidden)return false;
    var style=window.getComputedStyle?window.getComputedStyle(el):null;
    return !(style&&(style.display==='none'||style.visibility==='hidden'));
  }
  function inputDirty(field){
    if(field.isContentEditable)return true;
    if(field.type==='file')return !!(field.files&&field.files.length);
    if(field.type==='checkbox'||field.type==='radio')return field.defaultChecked!==undefined&&!!field.checked!==!!field.defaultChecked;
    if(String(field.tagName||'').toLowerCase()==='select'){
      var options=field.options||[];
      if(field.multiple){
        for(var i=0;i<options.length;i++)if(!!options[i].selected!==!!options[i].defaultSelected)return true;
        return false;
      }
      var expected=-1;
      for(var j=0;j<options.length;j++)if(options[j].defaultSelected)expected=j;
      if(expected<0&&(!field.size||field.size<=1)){
        for(var k=0;k<options.length;k++)if(!options[k].disabled){expected=k;break;}
      }
      for(var n=0;n<options.length;n++)if(!!options[n].selected!==(n===expected))return true;
      return false;
    }
    return field.defaultValue!==undefined&&String(field.value||'')!==String(field.defaultValue||'');
  }
  function hasUnsavedInput(host,ignore){
    if(!host||!host.querySelectorAll)return false;
    var fields=host.querySelectorAll('input,textarea,select,[contenteditable="true"]');
    for(var i=0;i<fields.length;i++){
      var field=fields[i];
      if(!visible(field)||field.disabled||field.readOnly||field.type==='hidden'||/^(button|submit|reset)$/.test(field.type))continue;
      if(field===document.activeElement)return true;
      if(ignore&&field.matches(ignore))continue;
      if(dirty.has(field)||inputDirty(field))return true;
    }
    return false;
  }
  function canRefresh(host,ignore){
    return !!host&&!hasUnsavedInput(host,ignore);
  }
  function activeRoot(){
    var get=document.getElementById?function(id){return document.getElementById(id)}:function(){return null};
    var overlay=get('hswOverlay');if(visible(overlay))return overlay;
    var editor=get('hsoEditor');if(visible(editor))return editor;
    var tab=window.__HASNARIA_OWNER_SHELL&&window.__HASNARIA_OWNER_SHELL.getActive?window.__HASNARIA_OWNER_SHELL.getActive():'';
    var selected=!tab&&document.querySelector?document.querySelector('#tabs .tab.on[data-tab]'):null;
    if(selected)tab=selected.getAttribute('data-tab');
    var owner=tab&&get(tab);if(visible(owner))return owner;
    var staff=get('staffRoot');return visible(staff)?staff:document.body;
  }
  function protectedNow(){
    var focused=document.activeElement;
    if(visible(focused)&&(focused.isContentEditable||(focused.matches&&focused.matches('input,textarea,select'))))return true;
    var editor=document.getElementById&&document.getElementById('hsoEditor');
    return visible(editor)||hasUnsavedInput(activeRoot(),'[data-month-filter]');
  }
  function remember(e){var t=e.target;if(t&&t.matches&&t.matches('input,textarea,select,[contenteditable="true"]'))dirty.add(t)}
  function request(reason){
    if(!available())return Promise.resolve(false);
    var jobs=[];
    Object.keys(handlers).forEach(function(name){
      var entry=handlers[name];
      if(entry.running){entry.pending=reason;jobs.push(entry.promise);return}
      entry.running=true;
      entry.promise=Promise.resolve().then(function(){return entry.refresh(reason)}).catch(function(){
        // Preserve the last successful view; the next visible tick retries.
      }).finally(function(){
        entry.running=false;
        if(entry.pending){var next=entry.pending;entry.pending=null;schedule(next)}
      });
      jobs.push(entry.promise);
    });
    return Promise.all(jobs);
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
  document.addEventListener('hasnaria:write-complete',notify);
  window.addEventListener('hasnaria:purchase-finance-synced',function(){schedule('purchase-finance')});
  window.__HASNARIA_DATA_SYNC={
    register:function(name,refresh){if(typeof refresh==='function')handlers[name]={refresh:refresh,running:false,pending:null}},
    notify:notify,canRefresh:canRefresh,
    request:schedule,refreshNow:function(){return protectedNow()?Promise.resolve(false):request('manual')},
    protectedNow:protectedNow,activeRoot:activeRoot,
    clearDraft:function(host){if(host)Array.prototype.forEach.call(host.querySelectorAll('input,textarea,select'),function(field){
      dirty.delete(field);
      if(field.defaultValue!==undefined&&field.type!=='file')field.defaultValue=field.value;
      if(field.defaultChecked!==undefined)field.defaultChecked=field.checked;
      Array.prototype.forEach.call(field.options||[],function(option){option.defaultSelected=option.selected});
    })}
  };
  window.dispatchEvent(new CustomEvent('hasnaria:data-sync-ready'));
  setInterval(function(){request('interval')},30000);
})();
