(function () {
  'use strict';
  var CORE = 'https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js';
  var STOCK = '/stock-monitor.js?v=25';
  var SALES = '/sales-board.js?v=8';
  var SALES_UI = '/sales-ui-patch.js?v=5';
  var AUTH_URL = window.HASNARIA_SB;
  var AUTH_KEY = window.HASNARIA_KEY;
  if (typeof supabase !== 'undefined' && AUTH_URL && AUTH_KEY) {
    try { localStorage.removeItem('hasnaria-auth'); localStorage.removeItem('hasnaria-recovery'); } catch (_) {}
    try {
      var originalCreateClient = supabase.createClient.bind(supabase);
      var sharedAuthClient = originalCreateClient(AUTH_URL, AUTH_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'hasnaria-auth-v2' } });
      var originalOnAuthStateChange = sharedAuthClient.auth.onAuthStateChange.bind(sharedAuthClient.auth);
      sharedAuthClient.auth.onAuthStateChange = function (callback) {
        return originalOnAuthStateChange(function (event, session) {
          if (event === 'SIGNED_IN') return;
          setTimeout(function () { callback(event, session); }, 0);
        });
      };
      window.__HASNARIA_DB = sharedAuthClient;
      window.__HASNARIA_ORIGINAL_CREATE_CLIENT = originalCreateClient;
      window.__HASNARIA_GET_ACCESS_TOKEN = async function () {
        var s = await sharedAuthClient.auth.getSession();
        return s && s.data && s.data.session ? s.data.session.access_token : null;
      };
      supabase.createClient = function (url, key, options) {
        if (url === AUTH_URL && key === AUTH_KEY) {
          var a = (options && options.auth) || {};
          if (a.storageKey === 'hasnaria-reset' || a.persistSession === false) return originalCreateClient(url, key, options);
          return window.__HASNARIA_DB;
        }
        return originalCreateClient(url, key, options);
      };
    } catch (e) { console.error('Hasnaria Auth client init gagal:', e); }
  }
  function load(src, done) { var s=document.createElement('script'); s.src=src; s.async=false; s.onload=function(){if(done)done();}; s.onerror=function(){console.error('Hasnaria module gagal dimuat:',src);if(done)done();}; document.head.appendChild(s); }
  function fixStockLayout() { var host=document.getElementById('stok');if(!host)return;var form=host.querySelector('.stk-form');if(form){form.style.minWidth='0';form.style.maxWidth='100%';}var price=host.querySelector('#stkBuyPrice'),priceBox=price&&price.parentElement;if(priceBox){var units=priceBox.querySelectorAll('.unit');if(units.length)units[units.length-1].textContent='/ pcs';} }
  function afterCore() {
    load(STOCK,function(){fixStockLayout();setTimeout(fixStockLayout,150);setTimeout(fixStockLayout,500);setTimeout(fixStockLayout,1200);});
    load(SALES,function(){load(SALES_UI);});
    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var id=b.id||'',watch=id==='sSave'||id==='oSave'||id==='cSave'||id==='lzSave'||id==='svOpen'||id==='svHand'||id==='svClose'||b.hasAttribute('data-stk')||b.hasAttribute('data-ok')||b.hasAttribute('data-no')||b.hasAttribute('data-lzok')||b.hasAttribute('data-lzno');if(!watch)return;if(b.getAttribute('data-busy')==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.setAttribute('data-busy','1');setTimeout(function(){try{b.removeAttribute('data-busy');}catch(_){}},1800);},true);
  }
  window.hasnariaGoogleHref = function () { return '#'; };
  load(CORE,afterCore);
})();
