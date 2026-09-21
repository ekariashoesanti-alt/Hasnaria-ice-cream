/* Owner navigation guard.
 * Owner top-level pages are owned by dedicated renderers. This guard prevents
 * legacy core-app render() calls from becoming visible or racing the Finance UI.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_OWNER_SHELL_BOOTSTRAPPED)return;
  window.__HASNARIA_OWNER_SHELL_BOOTSTRAPPED=true;

  var OWNER_TABS=['dashboard','sales','pembelian','ops','stok'];
  var SECTION_IDS=['dashboard','sales','pembelian','ops','stok','shift','social','approval','team','sistem'];
  var state={active:'dashboard',initialized:false,scheduled:false,salesRetries:0,finStockLoad:null};

  function context(){return window.__HASNARIA_CONTEXT||null}
  function isOwner(){var c=context();return!!(c&&c.role==='owner')}
  function section(id){return document.getElementById(id)}
  function financeMounted(){var h=section('ops');return!!(h&&h.querySelector('[data-finance-v6="1"]'))}
  function stockMounted(){var h=section('stok');return!!(h&&h.querySelector('[data-stock-v4="1"],.ofs3-shell'))}

  function ensureShellCss(){
    var l=document.getElementById('ofs3-css');
    if(!l){l=document.createElement('link');l.id='ofs3-css';l.rel='stylesheet';l.href='/owner-finance-stock-v3.css?v=3';document.head.appendChild(l)}
    else if(l.getAttribute('href')!=='/owner-finance-stock-v3.css?v=3')l.href='/owner-finance-stock-v3.css?v=3';
  }

  function currentActive(){
    var on=document.querySelector('#tabs .tab.on[data-tab]'),id=on&&on.getAttribute('data-tab');
    if(OWNER_TABS.indexOf(id)>=0)return id;
    for(var i=0;i<OWNER_TABS.length;i++){var el=section(OWNER_TABS[i]);if(el&&!el.classList.contains('hidden'))return OWNER_TABS[i]}
    return'dashboard';
  }

  function setVisibility(id){
    SECTION_IDS.forEach(function(name){var el=section(name);if(el)el.classList.toggle('hidden',name!==id)});
    Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab[data-tab]'),function(b){b.classList.toggle('on',b.getAttribute('data-tab')===id)});
  }

  function ensureDashboard(){var h=section('dashboard');if(!h||h.classList.contains('hidden')||h.querySelector('.erp-top'))return;if(window.HasnariaERP&&typeof window.HasnariaERP.mount==='function')window.HasnariaERP.mount()}
  function ensureSales(){var h=section('sales');if(!h||h.classList.contains('hidden'))return;if(h.querySelector('.sale-board')){state.salesRetries=0;return}if(typeof window.__hasnariaReloadSales==='function'){state.salesRetries=0;window.__hasnariaReloadSales();return}if(state.salesRetries>=40)return;state.salesRetries++;setTimeout(function(){if(isOwner()&&state.active==='sales')ensureSales()},100)}
  function dispatchStock(){try{document.dispatchEvent(new CustomEvent('hasnaria:owner-shell-navigate',{detail:{tab:'stok'}}))}catch(_){}}

  function claimFinanceHost(){
    var h=section('ops');if(!h||h.classList.contains('hidden')||financeMounted())return;
    h.innerHTML='<div class="fsv2-shell" data-finance-boot="1"><div class="fsv2-head"><div><div class="fsv2-eyebrow">FINANCIAL REPORTING</div><h1>Keuangan</h1><p>Menyiapkan laporan keuangan…</p></div></div><div class="fsv2-report"><div class="fsv2-note">Memuat data…</div></div></div>';
  }

  function mountFinance(force){
    if(!isOwner())return false;
    var h=section('ops');if(!h||h.classList.contains('hidden'))return false;
    ensureShellCss();claimFinanceHost();
    if(typeof window.__HASNARIA_FINANCE_V6_MOUNT==='function'){window.__HASNARIA_FINANCE_V6_MOUNT({force:!!force});return true}
    return false;
  }

  function afterRuntime(id,requestRender){
    ensureShellCss();
    if(id==='ops'){
      if(!mountFinance(!!requestRender)){
        var js=document.getElementById('hasnaria-finance-accuracy-v6-js');
        if(js&&!js.__hasnariaMountHook){js.__hasnariaMountHook=true;js.addEventListener('load',function(){if(isOwner()&&state.active==='ops')mountFinance(!!requestRender)},{once:true})}
      }
      return;
    }
    if(id==='stok'&&requestRender)dispatchStock();
  }

  function ensureFinStockRuntime(id,requestRender){
    if(!isOwner())return;
    var h=section(id);if(!h||h.classList.contains('hidden'))return;
    ensureShellCss();
    if(id==='ops'&&financeMounted())return;
    if(id==='stok'&&stockMounted())return;
    if(id==='ops')claimFinanceHost();

    var existing=document.getElementById('hasnaria-owner-finance-stock-v3-js');
    if(existing){afterRuntime(id,requestRender);return}
    if(state.finStockLoad){state.finStockLoad.then(function(){afterRuntime(id,requestRender)});return}

    state.finStockLoad=new Promise(function(resolve){
      var s=document.createElement('script');s.id='hasnaria-owner-finance-stock-v3-js';s.src='/owner-finance-stock-v3.js?v=6';s.async=true;
      s.onload=function(){resolve()};s.onerror=function(){state.finStockLoad=null;resolve()};document.head.appendChild(s);
    });
    state.finStockLoad.then(function(){afterRuntime(id,requestRender)});
  }

  function nudgeLegacyStockFallback(){
    var h=section('stok');
    if(!h||h.classList.contains('hidden')||stockMounted())return;
    var marker=document.createElement('span');
    marker.hidden=true;
    marker.setAttribute('data-owner-shell-stock-nudge','1');
    h.appendChild(marker);h.removeChild(marker);
  }

  function ensureFinance(requestRender){ensureFinStockRuntime('ops',!!requestRender)}
  function ensureStock(requestRender){ensureFinStockRuntime('stok',!!requestRender);setTimeout(nudgeLegacyStockFallback,700)}
  function patchContext(){var c=context();if(!c||c.role!=='owner')return;if(c.navigate!==safeNavigate)c.navigate=safeNavigate}

  function safeNavigate(id){
    if(!isOwner()||OWNER_TABS.indexOf(id)<0)return false;
    state.active=id;state.initialized=true;state.salesRetries=0;setVisibility(id);patchContext();
    if(id==='dashboard')ensureDashboard();
    if(id==='sales')ensureSales();
    if(id==='ops')ensureFinance(true);
    if(id==='stok')ensureStock(true);
    return true;
  }

  function reconcile(){
    if(!isOwner())return;
    ensureShellCss();
    if(!state.initialized){state.active=currentActive();state.initialized=true}
    patchContext();setVisibility(state.active);
    if(state.active==='dashboard')ensureDashboard();
    if(state.active==='sales')ensureSales();
    if(state.active==='ops')ensureFinance(false);
    if(state.active==='stok')ensureStock(false);
  }

  function scheduleReconcile(){if(state.scheduled)return;state.scheduled=true;setTimeout(function(){state.scheduled=false;reconcile()},0)}

  document.addEventListener('click',function(event){
    if(!isOwner())return;
    var t=event.target&&event.target.closest?event.target.closest('#tabs .tab[data-tab]'):null;if(!t)return;
    var id=t.getAttribute('data-tab');if(OWNER_TABS.indexOf(id)<0)return;
    event.preventDefault();event.stopPropagation();safeNavigate(id);
  },true);

  function start(){if(!document.body)return;ensureShellCss();new MutationObserver(scheduleReconcile).observe(document.body,{childList:true,subtree:true});scheduleReconcile()}
  window.__HASNARIA_OWNER_SHELL={navigate:safeNavigate,isOwner:isOwner,getActive:function(){return state.active},reconcile:reconcile};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
