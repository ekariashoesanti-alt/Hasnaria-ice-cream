(function () {
  'use strict';
  var CORE = '/core-app.js?v=3';
  var STOCK = '/stock-monitor.js?v=26';
  var SALES = '/sales-board.js?v=44';
  var SALES_FALLBACK = false;
  var SALES_UI = '/sales-ui-patch.js?v=12';
  var AUTH_URL = window.HASNARIA_SB;
  var AUTH_KEY = window.HASNARIA_KEY;
  if (typeof supabase !== 'undefined' && AUTH_URL && AUTH_KEY) {
    try { localStorage.removeItem('hasnaria-auth'); localStorage.removeItem('hasnaria-recovery'); } catch (_) {}
    try {
      var originalCreateClient = supabase.createClient.bind(supabase);
      var sharedAuthClient = originalCreateClient(AUTH_URL, AUTH_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'hasnaria-auth-v2' } });
      var passwordPolicy = window.__HASNARIA_PASSWORD_POLICY;
      function passwordPolicyError(password) {
        if (!passwordPolicy || typeof passwordPolicy.validate !== 'function') return null;
        var result = passwordPolicy.validate(password);
        if (result && !result.ok) {
          var err = new Error(result.message || 'Password baru tidak memenuhi kebijakan keamanan.');
          err.name = 'HasnariaPasswordPolicyError';
          return err;
        }
        return null;
      }
      var originalSignUp = sharedAuthClient.auth.signUp.bind(sharedAuthClient.auth);
      sharedAuthClient.auth.signUp = function (credentials) {
        var err = credentials && Object.prototype.hasOwnProperty.call(credentials, 'password') ? passwordPolicyError(credentials.password) : null;
        if (err) return Promise.resolve({ data: { user: null, session: null }, error: err });
        return originalSignUp(credentials);
      };
      var originalUpdateUser = sharedAuthClient.auth.updateUser.bind(sharedAuthClient.auth);
      sharedAuthClient.auth.updateUser = function (attributes, options) {
        var err = attributes && Object.prototype.hasOwnProperty.call(attributes, 'password') ? passwordPolicyError(attributes.password) : null;
        if (err) return Promise.resolve({ data: { user: null }, error: err });
        return originalUpdateUser(attributes, options);
      };
      var nativeFetch = window.fetch.bind(window);
      var authRefreshPromise = null;
      function isSupabaseRestRequest(input) {
        try { return String(typeof input === 'string' ? input : (input && input.url) || '').indexOf(String(AUTH_URL) + '/rest/v1/') === 0; } catch (_) { return false; }
      }
      function refreshAuthSession() {
        if (authRefreshPromise) return authRefreshPromise;
        authRefreshPromise = sharedAuthClient.auth.refreshSession().then(function (res) {
          if (res && res.error) throw res.error;
          return res && res.data && res.data.session ? res.data.session : null;
        }).finally(function () { authRefreshPromise = null; });
        return authRefreshPromise;
      }
      window.fetch = async function(input, init) {
        var res = await nativeFetch(input, init);
        if (!isSupabaseRestRequest(input) || res.ok) return res;
        var body = '';
        try { body = await res.clone().text(); } catch (_) {}
        if (!/PGREST303|JWT issued at future/i.test(body)) return res;
        try {
          var session = await refreshAuthSession();
          if (!session || !session.access_token) return res;
          var retryInit = Object.assign({}, init || {});
          var headers = new Headers((init && init.headers) || {});
          headers.set('Authorization', 'Bearer ' + session.access_token);
          retryInit.headers = headers;
          return await nativeFetch(input, retryInit);
        } catch (_) { return res; }
      };
      try { if (/[?&]password-activation=1(?:&|$)/.test(location.search) || /type=recovery/i.test(location.hash || '')) window.__HASNARIA_PASSWORD_ACTIVATION = true; } catch (_) {}
      sharedAuthClient.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') window.__HASNARIA_PASSWORD_ACTIVATION = true; });
      var originalOnAuthStateChange = sharedAuthClient.auth.onAuthStateChange.bind(sharedAuthClient.auth), lastSignedInAt = 0;
      sharedAuthClient.auth.onAuthStateChange = function (callback) { return originalOnAuthStateChange(function (event, session) { if (event === 'SIGNED_IN') { var now = Date.now(); if (now - lastSignedInAt < 2000) return; lastSignedInAt = now; } setTimeout(function () { callback(event, session); }, 0); }); };
      var pendingOAuth = /[?&]code=/.test(location.search) || /[?#&]access_token=/.test(location.href), wantsPwAct = !!window.__HASNARIA_PASSWORD_ACTIVATION;
      function waitForAuthSession(timeoutMs) { return sharedAuthClient.auth.getSession().then(function (res) { if (res && res.data && res.data.session) return res; return new Promise(function (resolve) { var done=false, sub=sharedAuthClient.auth.onAuthStateChange(function(ev,sess){ if(done)return; if((ev==='SIGNED_IN'||ev==='INITIAL_SESSION'||ev==='PASSWORD_RECOVERY')&&sess){if(ev==='PASSWORD_RECOVERY')window.__HASNARIA_PASSWORD_ACTIVATION=true;done=true;try{sub.data.subscription.unsubscribe();}catch(_){}resolve({data:{session:sess}});}}); setTimeout(function(){if(done)return;done=true;try{sub.data.subscription.unsubscribe();}catch(_){}resolve(res);},timeoutMs||8000); }); }); }
      window.__HASNARIA_ENSURE_RECOVERY_SESSION = function(){ return waitForAuthSession(3000).then(function(res){ if(res&&res.data&&res.data.session)return res.data.session; try{var hp=new URLSearchParams((location.hash||'').replace(/^#/,'')),at=hp.get('access_token'),rt=hp.get('refresh_token')||''; if(at&&sharedAuthClient.auth.setSession)return sharedAuthClient.auth.setSession({access_token:at,refresh_token:rt}).then(function(ss){if(ss&&ss.error){window.__HASNARIA_RECOVERY_ERROR=ss.error.message||String(ss.error);return null;}window.__HASNARIA_PASSWORD_ACTIVATION=true;return ss&&ss.data?ss.data.session:null;}).catch(function(e){window.__HASNARIA_RECOVERY_ERROR=e&&e.message?e.message:String(e);return null;});}catch(_){} var code=null;try{code=new URLSearchParams(location.search).get('code');}catch(_){} if(!code||!sharedAuthClient.auth.exchangeCodeForSession)return null; return sharedAuthClient.auth.exchangeCodeForSession(code).then(function(ex){if(ex&&ex.error){window.__HASNARIA_RECOVERY_ERROR=ex.error.message||String(ex.error);return null;}window.__HASNARIA_PASSWORD_ACTIVATION=true;return ex&&ex.data?ex.data.session:null;}).catch(function(e){window.__HASNARIA_RECOVERY_ERROR=e&&e.message?e.message:String(e);return null;}); }); };
      window.__HASNARIA_AUTH_READY = (pendingOAuth || wantsPwAct) ? waitForAuthSession(10000) : Promise.resolve(null);
      window.__HASNARIA_DB=sharedAuthClient; window.__HASNARIA_ORIGINAL_CREATE_CLIENT=originalCreateClient;
      window.__HASNARIA_GET_ACCESS_TOKEN=async function(){var s=await sharedAuthClient.auth.getSession();return s&&s.data&&s.data.session?s.data.session.access_token:null;};
      supabase.createClient=function(url,key,options){if(url===AUTH_URL&&key===AUTH_KEY){var a=(options&&options.auth)||{};if(a.storageKey==='hasnaria-reset'||a.persistSession===false)return originalCreateClient(url,key,options);return window.__HASNARIA_DB;}return originalCreateClient(url,key,options);};
    } catch(e){console.error('Hasnaria Auth client init gagal:',e);}
  }
  function load(src,done){var s=document.createElement('script');s.src=src;s.async=false;s.onload=function(){if(done)done();};s.onerror=function(){console.error('Hasnaria module gagal dimuat:',src);if(done)done();};document.head.appendChild(s);}
  function fixStockLayout(){var host=document.getElementById('stok');if(!host)return;var form=host.querySelector('.stk-form');if(form){form.style.minWidth='0';form.style.maxWidth='100%';}var price=host.querySelector('#stkBuyPrice'),priceBox=price&&price.parentElement;if(priceBox){var units=priceBox.querySelectorAll('.unit');if(units.length)units[units.length-1].textContent='/ pcs';}}
  function afterCore(){load('/xlsx-preload.js?v=2');load(STOCK,function(){fixStockLayout();setTimeout(fixStockLayout,150);setTimeout(fixStockLayout,500);setTimeout(fixStockLayout,1200);});load(SALES,function(){load(SALES_UI);});document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var id=b.id||'',watch=id==='sSave'||id==='oSave'||id==='cSave'||id==='lzSave'||id==='svOpen'||id==='svHand'||id==='svClose'||b.hasAttribute('data-stk')||b.hasAttribute('data-ok')||b.hasAttribute('data-no')||b.hasAttribute('data-lzok')||b.hasAttribute('data-lzno');if(!watch)return;if(b.getAttribute('data-busy')==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.setAttribute('data-busy','1');setTimeout(function(){try{b.removeAttribute('data-busy');}catch(_){}},1800);},true);}
  window.hasnariaGoogleHref=function(){return '#';};
  function startCore(){load(CORE,afterCore);}
  if(window.__HASNARIA_AUTH_READY&&typeof window.__HASNARIA_AUTH_READY.then==='function'){window.__HASNARIA_AUTH_READY.then(function(){startCore();}).catch(function(){startCore();});}else startCore();
})();