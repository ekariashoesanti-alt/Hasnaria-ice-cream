/* Hasnaria final sync coordinator v1
 * Keeps the currently visible surface fresh without overwriting unsaved input.
 * Only the active tab/surface is refreshed; background tabs stay idle.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_DATA_SYNC_V1)return;
  window.__HASNARIA_DATA_SYNC_V1=true;

  var MIN_GAP=15000;
  var INTERVAL=60000;
  var lastRun=0;
  var running=false;
  var queued=false;
  var timer=0;

  function visible(el){
    if(!el)return false;
    var s=window.getComputedStyle?getComputedStyle(el):null;
    return !el.hidden&&!(s&&s.display==='none')&&!(s&&s.visibility==='hidden');
  }

  function isEditable(el){
    if(!el)return false;
    if(el.isContentEditable)return true;
    var tag=String(el.tagName||'').toLowerCase();
    return tag==='input'||tag==='textarea'||tag==='select';
  }

  function activeOwnerTab(){
    try{
      if(window.__HASNARIA_OWNER_SHELL&&typeof window.__HASNARIA_OWNER_SHELL.getActive==='function'){
        return window.__HASNARIA_OWNER_SHELL.getActive()||'';
      }
    }catch(_){}
    var on=document.querySelector('#tabs .tab.on[data-tab]');
    return on?String(on.getAttribute('data-tab')||''):'';
  }

  function activeRoot(){
    var overlay=document.getElementById('hswOverlay');
    if(overlay&&visible(overlay))return overlay;
    var editor=document.getElementById('hsoEditor');
    if(editor&&visible(editor)&&!editor.hidden)return editor;
    var ownerTab=activeOwnerTab();
    if(ownerTab){
      var ownerRoot=document.getElementById(ownerTab);
      if(ownerRoot&&visible(ownerRoot))return ownerRoot;
    }
    var staff=document.getElementById('staffRoot');
    if(staff&&visible(staff))return staff;
    return document.body;
  }

  function selectDirty(el){
    if(!el||String(el.tagName||'').toLowerCase()!=='select')return false;
    var opts=el.options||[];
    for(var i=0;i<opts.length;i++){
      if(!!opts[i].selected!==!!opts[i].defaultSelected)return true;
    }
    return false;
  }

  function inputDirty(el){
    if(!el)return false;
    var tag=String(el.tagName||'').toLowerCase();
    if(tag==='select')return selectDirty(el);
    if(tag==='textarea')return String(el.value||'')!==String(el.defaultValue||'');
    if(tag!=='input')return false;
    var type=String(el.type||'text').toLowerCase();
    if(type==='button'||type==='submit'||type==='reset'||type==='hidden')return false;
    if(type==='checkbox'||type==='radio')return !!el.checked!==!!el.defaultChecked;
    if(type==='file')return !!(el.files&&el.files.length);
    return String(el.value||'')!==String(el.defaultValue||'');
  }

  function hasUnsavedInput(root){
    if(!root||!root.querySelectorAll)return false;
    var controls=root.querySelectorAll('input,textarea,select,[contenteditable="true"]');
    for(var i=0;i<controls.length;i++){
      var el=controls[i];
      if(!visible(el))continue;
      if(el.hasAttribute&&el.hasAttribute('data-month-filter'))continue;
      if(el.isContentEditable)return true;
      if(inputDirty(el))return true;
    }
    return false;
  }

  function protectedNow(){
    var a=document.activeElement;
    if(a&&a!==document.body&&isEditable(a)&&visible(a))return true;
    var editor=document.getElementById('hsoEditor');
    if(editor&&visible(editor)&&!editor.hidden)return true;
    return hasUnsavedInput(activeRoot());
  }

  function dispatchSync(tab,reason){
    try{
      document.dispatchEvent(new CustomEvent('hasnaria:data-sync',{detail:{tab:tab||'',reason:reason||'sync',at:Date.now()}}));
    }catch(_){}
  }

  function clickVisible(selector){
    var nodes=document.querySelectorAll(selector);
    for(var i=0;i<nodes.length;i++){
      if(visible(nodes[i])&&!nodes[i].disabled){nodes[i].click();return true;}
    }
    return false;
  }

  function refreshOwner(tab,reason){
    dispatchSync(tab,reason);
    if(tab==='dashboard'){
      var d=window.__HASNARIA_DASHBOARD_ONE_VIEW;
      if(d&&typeof d.invalidate==='function')d.invalidate();
      if(d&&typeof d.mount==='function')return Promise.resolve(d.mount());
      if(window.__HASNARIA_OWNER_SHELL&&typeof window.__HASNARIA_OWNER_SHELL.reconcile==='function')window.__HASNARIA_OWNER_SHELL.reconcile();
      return Promise.resolve();
    }
    if(tab==='sales'){
      if(typeof window.__hasnariaReloadSales==='function')return Promise.resolve(window.__hasnariaReloadSales());
      if(typeof window.__HASNARIA_LOAD_SALES==='function')return Promise.resolve(window.__HASNARIA_LOAD_SALES()).then(function(){if(typeof window.__hasnariaReloadSales==='function')return window.__hasnariaReloadSales();});
      return Promise.resolve();
    }
    if(tab==='pembelian'){
      function refreshPurchaseLayers(){
        var jobs=[];
        if(typeof window.__HASNARIA_PURCHASE_ANALYTICS_REFRESH==='function')jobs.push(Promise.resolve(window.__HASNARIA_PURCHASE_ANALYTICS_REFRESH()));
        if(typeof window.__HASNARIA_PURCHASE_FINANCE_REFRESH==='function')jobs.push(Promise.resolve(window.__HASNARIA_PURCHASE_FINANCE_REFRESH()));
        return Promise.all(jobs);
      }
      if(typeof window.__HASNARIA_PURCHASE_ANALYTICS_REFRESH==='function'||typeof window.__HASNARIA_PURCHASE_FINANCE_REFRESH==='function')return refreshPurchaseLayers();
      if(typeof window.__HASNARIA_LOAD_PURCHASE==='function')return Promise.resolve(window.__HASNARIA_LOAD_PURCHASE()).then(refreshPurchaseLayers);
      return Promise.resolve();
    }
    if(tab==='operasional'){
      if(typeof window.__HASNARIA_OPERATIONS_V1_MOUNT==='function')return Promise.resolve(window.__HASNARIA_OPERATIONS_V1_MOUNT({force:true}));
      return Promise.resolve();
    }
    if(tab==='administrasi'){
      var a=window.__HASNARIA_ADMIN_V2||window.__HASNARIA_ADMIN_V1;
      if(a&&typeof a.mount==='function')return Promise.resolve(a.mount({force:true}));
      return Promise.resolve();
    }
    if(tab==='ops'){
      if(typeof window.__HASNARIA_FINANCE_V6_MOUNT==='function')return Promise.resolve(window.__HASNARIA_FINANCE_V6_MOUNT({force:true}));
      return Promise.resolve();
    }
    if(tab==='stok'){
      if(clickVisible('#stok [data-sc3-action="refresh"]'))return Promise.resolve();
      try{document.dispatchEvent(new CustomEvent('hasnaria:owner-shell-navigate',{detail:{tab:'stok',force:true}}));}catch(_){}
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  function refreshStaff(reason){
    dispatchSync('staff',reason);
    var overlay=document.getElementById('hswOverlay');
    if(overlay&&visible(overlay)){
      clickVisible('#hswOverlay [data-hsw="refresh"]');
      return Promise.resolve();
    }
    var ownerShell=document.getElementById('hsoShell');
    if(ownerShell&&visible(ownerShell)&&typeof window.__HASNARIA_OWNER_STABLE_REFRESH==='function'){
      return Promise.resolve(window.__HASNARIA_OWNER_STABLE_REFRESH());
    }
    clickVisible('#staffRoot [data-action="attendance-refresh"],#staffRoot [data-action="approval-refresh"]');
    return Promise.resolve();
  }

  function run(reason,force){
    if(document.hidden&&!force)return Promise.resolve(false);
    if(running){queued=true;return Promise.resolve(false);}
    var now=Date.now();
    if(!force&&now-lastRun<MIN_GAP)return Promise.resolve(false);
    if(protectedNow())return Promise.resolve(false);
    running=true;
    lastRun=now;
    var staff=document.getElementById('staffRoot');
    var p=staff&&visible(staff)?refreshStaff(reason):refreshOwner(activeOwnerTab(),reason);
    return Promise.resolve(p).catch(function(e){
      if(window.console&&console.warn)console.warn('Hasnaria sync:',e&&e.message?e.message:e);
      return false;
    }).finally(function(){
      running=false;
      if(queued){queued=false;setTimeout(function(){run('queued',false);},250);}
    });
  }

  function request(reason){
    clearTimeout(timer);
    timer=setTimeout(function(){run(reason||'request',false);},220);
  }

  document.addEventListener('visibilitychange',function(){if(!document.hidden)request('visible');});
  window.addEventListener('focus',function(){request('focus');});
  window.addEventListener('online',function(){request('online');});
  window.addEventListener('hasnaria:purchase-finance-synced',function(){request('purchase-finance');});
  document.addEventListener('hasnaria:write-complete',function(){request('write-complete');});
  setInterval(function(){if(!document.hidden)run('interval',false);},INTERVAL);

  window.__HASNARIA_DATA_SYNC={
    request:request,
    refreshNow:function(){return run('manual',true);},
    protectedNow:protectedNow,
    activeRoot:activeRoot
  };
})();
