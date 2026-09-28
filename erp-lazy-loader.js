/* Hasnaria ERP runtime — role-aware lazy loader.
 * Owner uses owner-executive-v1 and must not boot the superseded ERP dashboard.
 * Non-owner roles keep the existing ERP mount behavior after app context is ready.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_ERP_LAZY_LOADER)return;
  window.__HASNARIA_ERP_LAZY_LOADER=true;

  var loading=null,loaded=false,tries=0;
  function context(){return window.__HASNARIA_CONTEXT||null;}
  function isOwner(){var c=context();return !!(c&&c.role==='owner');}
  function mount(){if(window.HasnariaERP&&typeof window.HasnariaERP.mount==='function')window.HasnariaERP.mount();}

  function ensureRuntime(){
    if(isOwner())return Promise.resolve(false);
    if(loaded||window.HasnariaERP){loaded=true;mount();return Promise.resolve(true);}
    if(loading)return loading;
    loading=new Promise(function(resolve,reject){
      var old=document.getElementById('hasnaria-erp-runtime');
      if(old){
        old.addEventListener('load',function(){loaded=true;mount();resolve(true);},{once:true});
        old.addEventListener('error',function(){loading=null;reject(new Error('ERP runtime gagal dimuat.'));},{once:true});
        return;
      }
      var s=document.createElement('script');
      s.id='hasnaria-erp-runtime';
      s.src='/erp.js?v=ui2';
      s.async=true;
      s.onload=function(){loaded=true;mount();resolve(true);};
      s.onerror=function(){loading=null;reject(new Error('ERP runtime gagal dimuat.'));};
      document.head.appendChild(s);
    });
    return loading;
  }

  function boot(){
    var c=context();
    if(c){if(!isOwner())ensureRuntime().catch(function(e){if(window.console&&console.warn)console.warn('ERP lazy loader:',e&&e.message?e.message:e);});return;}
    if(tries++<120)setTimeout(boot,100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.HasnariaERPLazy={load:ensureRuntime};
})();
