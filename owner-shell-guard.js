/* Hasnaria Owner shell — Executive Dashboard only.
 * Keeps legacy heavy renderers out of Owner navigation.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_OWNER_SHELL_BOOTSTRAPPED)return;
  window.__HASNARIA_OWNER_SHELL_BOOTSTRAPPED=true;

  var EXEC_SRC='/owner-executive-v1.js?v=1';
  var tries=0,loaded=false,guardBound=false,execAbort=null;

  function context(){return window.__HASNARIA_CONTEXT||null;}
  function isOwner(){var c=context();return !!(c&&c.role==='owner');}

  function installExecutiveRpcGuard(){
    var db=window.__HASNARIA_DB;
    if(!db||db.__hasnariaOwnerExecAbortGuard||typeof db.rpc!=='function')return;
    var rawRpc=db.rpc.bind(db);
    db.rpc=function(name,args,options){
      if(name!=='owner_executive_tab_v1')return rawRpc(name,args,options);
      if(execAbort){try{execAbort.abort();}catch(_){}execAbort=null;}
      var controller=typeof AbortController==='function'?new AbortController():null;
      if(controller)execAbort=controller;
      var query=rawRpc(name,args,options);
      if(controller&&query&&typeof query.abortSignal==='function')query=query.abortSignal(controller.signal);
      return query;
    };
    db.__hasnariaOwnerExecAbortGuard=true;
  }

  function blockLegacyBubble(event){
    if(!window.__HASNARIA_EXECUTIVE_OWNER)return;
    var t=event.target&&event.target.closest?event.target.closest('#tabs [data-tab]'):null;
    if(!t)return;
    /* Executive listener is registered before this guard. Stop the event before
       old button-level listeners can call core-app render/load paths. */
    event.preventDefault();
    event.stopPropagation();
  }

  function bindGuard(){
    if(guardBound)return;
    guardBound=true;
    document.addEventListener('click',blockLegacyBubble,true);
  }

  function safeNavigate(id){
    if(!isOwner())return false;
    var b=document.querySelector('#tabs [data-tab="'+String(id||'')+'"]');
    if(!b)return false;
    b.click();
    return true;
  }

  function patchContext(){
    var c=context();
    if(c&&c.role==='owner')c.navigate=safeNavigate;
  }

  function loadExecutive(){
    if(loaded||!isOwner())return;
    installExecutiveRpcGuard();
    var existing=document.getElementById('hasnaria-owner-executive-v1-js');
    if(existing){loaded=true;bindGuard();patchContext();return;}
    loaded=true;
    var s=document.createElement('script');
    s.id='hasnaria-owner-executive-v1-js';
    s.src=EXEC_SRC;
    s.async=true;
    s.onload=function(){bindGuard();patchContext();};
    s.onerror=function(){loaded=false;console.error('Hasnaria Executive Dashboard gagal dimuat.');};
    document.head.appendChild(s);
  }

  function boot(){
    if(isOwner()){loadExecutive();return;}
    if(++tries<80)setTimeout(boot,100);
  }

  window.__HASNARIA_OWNER_SHELL={
    navigate:safeNavigate,
    isOwner:isOwner,
    reconcile:function(){if(isOwner()){installExecutiveRpcGuard();patchContext();loadExecutive();}}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
