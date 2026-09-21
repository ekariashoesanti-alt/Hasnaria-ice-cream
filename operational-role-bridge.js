/* Hasnaria Operasional role bridge.
 * Zero database queries on startup. It only exposes the Operasional surface for
 * Head Store, PIC, and Pelaksana; operational-v1 is fetched after the tab opens.
 * Mount calls triggered by shell observers are idempotent once the workbench exists.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_OPERATIONAL_ROLE_BRIDGE)return;
  window.__HASNARIA_OPERATIONAL_ROLE_BRIDGE=true;

  var ALLOWED={head_store:true,pic:true,pelaksana:true};
  var SECTIONS=['dashboard','sales','pembelian','operasional','ops','stok','shift','social','approval','team','sistem'];
  var state={active:false,load:null,scheduled:false};
  var mountValue=null;

  function ctx(){return window.__HASNARIA_CONTEXT||null}
  function allowed(){var c=ctx();return!!(c&&ALLOWED[c.role])}
  function section(){return document.getElementById('operasional')}
  function mounted(){var h=section();return!!(h&&h.querySelector('[data-operational-v1="1"]'))}

  function wrapMount(fn){
    if(typeof fn!=='function'||fn.__hasnariaOperationalMountGuard)return fn;
    var wrapped=function(opts){
      var force=!!(opts&&opts.force);
      if(!force&&mounted())return;
      return fn(opts);
    };
    wrapped.__hasnariaOperationalMountGuard=true;
    wrapped.__hasnariaOriginalMount=fn;
    return wrapped;
  }

  function installMountGuard(){
    try{
      var current=window.__HASNARIA_OPERATIONS_V1_MOUNT;
      mountValue=wrapMount(current);
      var setter=function(fn){mountValue=wrapMount(fn)};
      setter.__hasnariaOperationalMountSetter=true;
      Object.defineProperty(window,'__HASNARIA_OPERATIONS_V1_MOUNT',{
        configurable:true,
        enumerable:true,
        get:function(){return mountValue},
        set:setter
      });
    }catch(_){
      if(typeof window.__HASNARIA_OPERATIONS_V1_MOUNT==='function')window.__HASNARIA_OPERATIONS_V1_MOUNT=wrapMount(window.__HASNARIA_OPERATIONS_V1_MOUNT);
    }
  }

  installMountGuard();

  function ensureSection(){
    var main=document.querySelector('#app main'),el=section();
    if(!main)return null;
    if(!el){el=document.createElement('section');el.id='operasional';el.className='hidden';var finance=document.getElementById('ops');main.insertBefore(el,finance||null)}
    return el;
  }

  function ensureTab(){
    var tabs=document.getElementById('tabs');if(!tabs)return null;
    var b=tabs.querySelector('.tab[data-tab="operasional"]');
    if(!b){b=document.createElement('button');b.type='button';b.className='tab';b.id='userSettingsTab';b.setAttribute('data-tab','operasional');b.textContent='Operasional';b.setAttribute('aria-label','Operasional');var finance=tabs.querySelector('.tab[data-tab="ops"]');tabs.insertBefore(b,finance||null)}
    b.textContent='Operasional';b.setAttribute('aria-label','Operasional');b.style.display='';
    return b;
  }

  function setVisibility(){
    SECTIONS.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.toggle('hidden',id!=='operasional')});
    Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab[data-tab]'),function(b){b.classList.toggle('on',b.getAttribute('data-tab')==='operasional')});
  }

  function mount(force){
    if(typeof window.__HASNARIA_OPERATIONS_V1_MOUNT==='function'){window.__HASNARIA_OPERATIONS_V1_MOUNT({force:!!force});return}
    if(state.load){state.load.then(function(){if(state.active&&typeof window.__HASNARIA_OPERATIONS_V1_MOUNT==='function')window.__HASNARIA_OPERATIONS_V1_MOUNT({force:!!force})});return}
    state.load=new Promise(function(resolve){var s=document.createElement('script');s.id='hasnaria-operational-role-runtime';s.src='/operational-v1.js?v=3';s.async=true;s.onload=resolve;s.onerror=function(){state.load=null;resolve()};document.head.appendChild(s)});
    state.load.then(function(){if(state.active&&typeof window.__HASNARIA_OPERATIONS_V1_MOUNT==='function')window.__HASNARIA_OPERATIONS_V1_MOUNT({force:!!force})});
  }

  function activate(){if(!allowed())return;ensureSection();ensureTab();state.active=true;setVisibility();mount(false)}

  function sync(){
    if(!allowed())return;
    ensureSection();ensureTab();
    if(state.active){setVisibility();mount(false)}
  }

  function schedule(){if(state.scheduled)return;state.scheduled=true;setTimeout(function(){state.scheduled=false;sync()},0)}

  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('#tabs .tab[data-tab]'):null;if(!b||!allowed())return;
    var id=b.getAttribute('data-tab');
    if(id==='operasional'){e.preventDefault();e.stopImmediatePropagation();activate()}
    else state.active=false;
  },true);

  function start(){
    if(!document.body)return;
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
