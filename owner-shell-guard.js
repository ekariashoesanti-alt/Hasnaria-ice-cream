/* Owner navigation guard.
 * The authenticated Owner shell uses dedicated ERP/Sales/Finance/Stock renderers.
 * Prevent top-level Owner navigation from calling core-app setTab()->render(),
 * which would otherwise overwrite those mounted views with legacy HTML.
 * Non-owner roles are intentionally untouched.
 */
(function () {
  'use strict';

  if (window.__HASNARIA_OWNER_SHELL_BOOTSTRAPPED) return;
  window.__HASNARIA_OWNER_SHELL_BOOTSTRAPPED = true;

  var OWNER_TABS = ['dashboard','sales','pembelian','ops','stok'];
  var SECTION_IDS = ['dashboard','sales','pembelian','ops','stok','shift','social','approval','team','sistem'];
  var state = { active:'dashboard', initialized:false, scheduled:false, salesRetries:0, finStockLoad:null };

  function context() { return window.__HASNARIA_CONTEXT || null; }
  function isOwner() { var c=context(); return !!(c && c.role==='owner'); }
  function section(id) { return document.getElementById(id); }

  function currentActive() {
    var on=document.querySelector('#tabs .tab.on[data-tab]');
    var id=on && on.getAttribute('data-tab');
    if (OWNER_TABS.indexOf(id)>=0) return id;
    for (var i=0;i<OWNER_TABS.length;i++) {
      var el=section(OWNER_TABS[i]);
      if (el && !el.classList.contains('hidden')) return OWNER_TABS[i];
    }
    return 'dashboard';
  }

  function setVisibility(id) {
    SECTION_IDS.forEach(function(name){
      var el=section(name);
      if (el) el.classList.toggle('hidden', name!==id);
    });
    var tabs=document.querySelectorAll('#tabs .tab[data-tab]');
    Array.prototype.forEach.call(tabs,function(button){
      button.classList.toggle('on',button.getAttribute('data-tab')===id);
    });
  }

  function ensureDashboard() {
    var host=section('dashboard');
    if (!host || host.classList.contains('hidden') || host.querySelector('.erp-top')) return;
    if (window.HasnariaERP && typeof window.HasnariaERP.mount==='function') window.HasnariaERP.mount();
  }

  function ensureSales() {
    var host=section('sales');
    if (!host || host.classList.contains('hidden')) return;
    if (host.querySelector('.sale-board')) { state.salesRetries=0; return; }
    if (typeof window.__hasnariaReloadSales==='function') {
      state.salesRetries=0;
      window.__hasnariaReloadSales();
      return;
    }
    if (state.salesRetries>=40) return;
    state.salesRetries+=1;
    setTimeout(function(){ if (isOwner() && state.active==='sales') ensureSales(); },100);
  }

  function dispatchFinStock(id) {
    try { document.dispatchEvent(new CustomEvent('hasnaria:owner-shell-navigate',{detail:{tab:id}})); } catch (_) {}
  }

  function refreshFinStockCss() {
    var l=document.getElementById('ofs3-css');
    if (l) l.href='/owner-finance-stock-v3.css?v=2';
  }

  function ensureFinStockRuntime(id) {
    if (!isOwner()) return;
    var host=section(id);
    if (!host || host.classList.contains('hidden')) return;
    if (host.querySelector('.ofs3-shell')) { refreshFinStockCss(); return; }

    var existing=document.getElementById('hasnaria-owner-finance-stock-v3-js');
    if (existing) {
      if (window.__HASNARIA_OWNER_FINSTOCK_V3) { refreshFinStockCss(); dispatchFinStock(id); }
      else existing.addEventListener('load',function(){ refreshFinStockCss(); dispatchFinStock(id); },{once:true});
      return;
    }
    if (state.finStockLoad) {
      state.finStockLoad.then(function(){ refreshFinStockCss(); dispatchFinStock(id); });
      return;
    }
    state.finStockLoad=new Promise(function(resolve){
      var s=document.createElement('script');
      s.id='hasnaria-owner-finance-stock-v3-js';
      s.src='/owner-finance-stock-v3.js?v=2';
      s.async=true;
      s.onload=function(){ refreshFinStockCss(); resolve(); };
      s.onerror=function(){ state.finStockLoad=null; resolve(); };
      document.head.appendChild(s);
    });
    state.finStockLoad.then(function(){ refreshFinStockCss(); dispatchFinStock(id); });
  }

  function nudgeLegacyStockFallback() {
    var host=section('stok');
    if (!host || host.classList.contains('hidden') || host.querySelector('.ofs3-shell')) return;
    var marker=document.createElement('span');
    marker.hidden=true;
    marker.setAttribute('data-owner-shell-stock-nudge','1');
    host.appendChild(marker);
    host.removeChild(marker);
  }

  function ensureFinance() { ensureFinStockRuntime('ops'); }
  function ensureStock() {
    ensureFinStockRuntime('stok');
    setTimeout(nudgeLegacyStockFallback,700);
  }

  function patchContext() {
    var c=context();
    if (!c || c.role!=='owner') return;
    if (c.navigate!==safeNavigate) c.navigate=safeNavigate;
  }

  function safeNavigate(id) {
    if (!isOwner() || OWNER_TABS.indexOf(id)<0) return false;
    state.active=id;
    state.initialized=true;
    state.salesRetries=0;
    setVisibility(id);
    patchContext();
    if (id==='dashboard') ensureDashboard();
    if (id==='sales') ensureSales();
    if (id==='ops') setTimeout(ensureFinance,0);
    if (id==='stok') setTimeout(ensureStock,0);
    if (id!=='ops' && id!=='stok') dispatchFinStock(id);
    return true;
  }

  function reconcile() {
    if (!isOwner()) return;
    if (!state.initialized) { state.active=currentActive(); state.initialized=true; }
    patchContext();
    setVisibility(state.active);
    if (state.active==='dashboard') ensureDashboard();
    if (state.active==='sales') ensureSales();
    if (state.active==='ops') ensureFinance();
    if (state.active==='stok') ensureStock();
  }

  function scheduleReconcile() {
    if (state.scheduled) return;
    state.scheduled=true;
    setTimeout(function(){ state.scheduled=false; reconcile(); },0);
  }

  document.addEventListener('click',function(event){
    if (!isOwner()) return;
    var target=event.target && event.target.closest ? event.target.closest('#tabs .tab[data-tab]') : null;
    if (!target) return;
    var id=target.getAttribute('data-tab');
    if (OWNER_TABS.indexOf(id)<0) return;
    event.preventDefault();
    event.stopPropagation();
    safeNavigate(id);
  },true);

  function start() {
    if (!document.body) return;
    var observer=new MutationObserver(scheduleReconcile);
    observer.observe(document.body,{childList:true,subtree:true});
    scheduleReconcile();
  }

  window.__HASNARIA_OWNER_SHELL={
    navigate:safeNavigate,
    isOwner:isOwner,
    getActive:function(){return state.active;},
    reconcile:reconcile
  };

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start);
  else start();
})();
