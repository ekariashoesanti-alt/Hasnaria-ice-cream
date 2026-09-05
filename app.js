(function () {
  'use strict';
  var CORE = 'https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js';
  var STOCK = '/stock-monitor.js?v=25';
  var SALES = '/sales-board.js?v=24';
  var SALES_UI = '/sales-ui-patch.js?v=12';
  var AUTH_URL = window.HASNARIA_SB;
  var AUTH_KEY = window.HASNARIA_KEY;
  if (typeof supabase !== 'undefined' && AUTH_URL && AUTH_KEY) {
    try { localStorage.removeItem('hasnaria-auth'); localStorage.removeItem('hasnaria-recovery'); } catch (_) {}
    try {
      var originalCreateClient = supabase.createClient.bind(supabase);
      var sharedAuthClient = originalCreateClient(AUTH_URL, AUTH_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'hasnaria-auth-v2' } });
      // Arm password-activation early so nav-patch can open the page even if
      // PASSWORD_RECOVERY fired before that script loaded.
      try {
        if (/[?&]password-activation=1(?:&|$)/.test(location.search) || /type=recovery/i.test(location.hash || '')) {
          window.__HASNARIA_PASSWORD_ACTIVATION = true;
        }
      } catch (_) {}
      sharedAuthClient.auth.onAuthStateChange(function (ev) {
        if (ev === 'PASSWORD_RECOVERY') window.__HASNARIA_PASSWORD_ACTIVATION = true;
      });
      var originalOnAuthStateChange = sharedAuthClient.auth.onAuthStateChange.bind(sharedAuthClient.auth);
      // Do not swallow SIGNED_IN: after Google OAuth return, getSession can race
      // and miss the session; core enter() depends on SIGNED_IN / INITIAL_SESSION.
      // Debounce duplicate SIGNED_IN within 2s so bootstrap is not double-run.
      var lastSignedInAt = 0;
      sharedAuthClient.auth.onAuthStateChange = function (callback) {
        return originalOnAuthStateChange(function (event, session) {
          if (event === 'SIGNED_IN') {
            var now = Date.now();
            if (now - lastSignedInAt < 2000) return;
            lastSignedInAt = now;
          }
          setTimeout(function () { callback(event, session); }, 0);
        });
      };
      // Wait for PKCE/OAuth/recovery session. Code verifier lives in this client's
      // storageKey (hasnaria-auth-v2) — must match the client that sent the email.
      var pendingOAuth = /[?&]code=/.test(location.search) || /[?#&]access_token=/.test(location.href);
      var wantsPwAct = !!window.__HASNARIA_PASSWORD_ACTIVATION;
      function waitForAuthSession(timeoutMs) {
        return sharedAuthClient.auth.getSession().then(function (res) {
          if (res && res.data && res.data.session) return res;
          return new Promise(function (resolve) {
            var done = false;
            var sub = sharedAuthClient.auth.onAuthStateChange(function (ev, sess) {
              if (done) return;
              if ((ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION' || ev === 'PASSWORD_RECOVERY') && sess) {
                if (ev === 'PASSWORD_RECOVERY') window.__HASNARIA_PASSWORD_ACTIVATION = true;
                done = true;
                try { sub.data.subscription.unsubscribe(); } catch (_) {}
                resolve({ data: { session: sess } });
              }
            });
            setTimeout(function () {
              if (done) return;
              done = true;
              try { sub.data.subscription.unsubscribe(); } catch (_) {}
              resolve(res);
            }, timeoutMs || 8000);
          });
        });
      }
      window.__HASNARIA_ENSURE_RECOVERY_SESSION = function () {
        return waitForAuthSession(3000).then(function (res) {
          if (res && res.data && res.data.session) return res.data.session;
          // Implicit recovery links put tokens in the URL hash (works across browsers).
          try {
            var hash = (location.hash || '').replace(/^#/, '');
            var hp = new URLSearchParams(hash);
            var at = hp.get('access_token');
            var rt = hp.get('refresh_token') || '';
            if (at && sharedAuthClient.auth.setSession) {
              return sharedAuthClient.auth.setSession({ access_token: at, refresh_token: rt }).then(function (ss) {
                if (ss && ss.error) {
                  window.__HASNARIA_RECOVERY_ERROR = ss.error.message || String(ss.error);
                  return null;
                }
                window.__HASNARIA_PASSWORD_ACTIVATION = true;
                return ss && ss.data ? ss.data.session : null;
              }).catch(function (e) {
                window.__HASNARIA_RECOVERY_ERROR = (e && e.message) ? e.message : String(e);
                return null;
              });
            }
          } catch (_) {}
          var code = null;
          try { code = new URLSearchParams(location.search).get('code'); } catch (_) {}
          if (!code || !sharedAuthClient.auth.exchangeCodeForSession) {
            return null;
          }
          // PKCE path: detectSessionInUrl may still be racing; try explicit exchange once.
          return sharedAuthClient.auth.exchangeCodeForSession(code).then(function (ex) {
            if (ex && ex.error) {
              window.__HASNARIA_RECOVERY_ERROR = ex.error.message || String(ex.error);
              return null;
            }
            window.__HASNARIA_PASSWORD_ACTIVATION = true;
            return ex && ex.data ? ex.data.session : null;
          }).catch(function (e) {
            window.__HASNARIA_RECOVERY_ERROR = (e && e.message) ? e.message : String(e);
            return null;
          });
        });
      };
      window.__HASNARIA_AUTH_READY = (pendingOAuth || wantsPwAct)
        ? waitForAuthSession(10000)
        : Promise.resolve(null);
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
  function startCore() { load(CORE, afterCore); }
  if (window.__HASNARIA_AUTH_READY && typeof window.__HASNARIA_AUTH_READY.then === 'function') {
    window.__HASNARIA_AUTH_READY.then(function () { startCore(); }).catch(function () { startCore(); });
  } else {
    startCore();
  }
})();
