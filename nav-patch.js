(function () {
  'use strict';
  var LABELS = { dashboard: 'Hari Ini', sales: 'Penjualan', ops: 'Keuangan', stok: 'Stok', shift: 'HR', social: 'Medsos' };

  function moveNav() {
    var app=document.getElementById('app'),header=app&&app.querySelector('header'),head=header&&header.querySelector('.head'),tabs=document.getElementById('tabs');
    if(!head||!tabs)return;
    if(tabs.parentElement!==head)head.insertBefore(tabs,head.querySelector('.user-box')||null);
    tabs.classList.add('hasnaria-header-nav');
  }

  function styleButtons(){
    var tabs=document.getElementById('tabs');
    if(!tabs)return;
    Array.prototype.forEach.call(tabs.querySelectorAll('.tab'),function(b){
      var id=b.getAttribute('data-tab'),label=LABELS[id];
      if(label){b.textContent=label;b.setAttribute('aria-label',label);b.style.display=''}
      else if(b.id!=='userSettingsTab')b.style.display='none'
    });
  }

  function syncGroupedContent(){
    var active=document.querySelector('#tabs .tab.on'),id=active&&active.getAttribute('data-tab'),team=document.getElementById('team'),approval=document.getElementById('approval');
    if(id==='shift'){if(team)team.classList.remove('hidden');if(approval)approval.classList.add('hidden')}
    else if(id==='ops'){if(approval)approval.classList.remove('hidden');if(team)team.classList.add('hidden')}
    else{if(approval)approval.classList.add('hidden');if(team)team.classList.add('hidden')}
  }

  function superAdmin(){
    var email='';
    var who=document.getElementById('whoMeta');
    if(who){
      var parts=(who.textContent||'').split('·').map(function(x){return x.trim()});
      for(var i=0;i<parts.length;i++){
        if(parts[i].indexOf('@')>=0){email=parts[i].toLowerCase();break}
      }
    }
    // Super admin: Harisnu + Hasnaria owner email
    return email==='harisnu@gmail.com'||email==='ekariashoesanti@gmail.com';
  }

  function closeAccountMenu(){
    var menu=document.getElementById('hasnariaAccountMenu');
    var btn=document.getElementById('hasnariaAccountMenuBtn');
    if(menu){menu.classList.remove('open');menu.setAttribute('aria-hidden','true')}
    if(btn)btn.setAttribute('aria-expanded','false');
  }

  function getAccountEmail(){
    var meta=document.getElementById('whoMeta');
    if(!meta) return '';
    var parts=(meta.textContent||'').split('·').map(function(x){return x.trim()});
    for(var i=0;i<parts.length;i++){
      if(parts[i].indexOf('@')>=0) return parts[i];
    }
    return '';
  }

  function showAccountPage(mode){
    var page=document.getElementById('hasnariaAccountPage');
    if(!page){
      page=document.createElement('div');
      page.id='hasnariaAccountPage';
      page.className='hasnaria-account-page';
      page.innerHTML='<div class="hasnaria-account-page-top"><button type="button" class="hasnaria-back-btn" id="hasnariaAccountBack">← Kembali</button><div class="hasnaria-page-brand">HASNARIA <span>TERRACE</span></div></div><main class="hasnaria-account-page-main"><section class="hasnaria-account-hero"><div class="hasnaria-account-kicker">AKUN</div><h1 id="hasnariaAccountPageTitle">Pengaturan Akun</h1><p id="hasnariaAccountPageDesc">Kelola akses akun dan password aplikasi Hasnaria.</p></section><section class="hasnaria-account-panel"><div class="hasnaria-account-profile"><div class="hasnaria-avatar" id="hasnariaAccountAvatar">H</div><div><h2 id="hasnariaAccountPageName">—</h2><p id="hasnariaAccountPageEmail">—</p><span class="hasnaria-access-badge" id="hasnariaAccountPageRole">—</span></div></div><div class="hasnaria-account-divider"></div><div id="hasnariaAccountSettingsBody"><div class="hasnaria-setting-item"><div><b>Password aplikasi</b><p>Gunakan password sendiri untuk login menggunakan email + password, selain login dengan Google.</p></div><button class="primary" type="button" id="hasnariaSendActivation">Kirim aktivasi password</button></div><div id="hasnariaActivationMsg" class="hasnaria-page-msg"></div></div><div id="hasnariaPasswordBody" class="hidden"><div class="hasnaria-password-title">Buat password aplikasi</div><p class="hasnaria-password-help">Password ini akan menjadi cara login kedua untuk akun Anda. Minimal 8 karakter.</p><label>Password baru</label><input id="hasnariaNewPassword" type="password" autocomplete="new-password" placeholder="Minimal 8 karakter"><label style="margin-top:14px">Ulangi password</label><input id="hasnariaConfirmPassword" type="password" autocomplete="new-password" placeholder="Ulangi password"><button class="primary" type="button" id="hasnariaSavePassword" style="width:100%;margin-top:18px">Aktifkan password aplikasi</button><div id="hasnariaPasswordMsg" class="hasnaria-page-msg"></div></div></section></main></div>';
      document.body.appendChild(page);
      document.getElementById('hasnariaAccountBack').onclick=function(){page.classList.remove('open');};
      document.getElementById('hasnariaSendActivation').onclick=async function(){
        var btn=this,msg=document.getElementById('hasnariaActivationMsg'),email=getAccountEmail();
        if(!email){msg.textContent='Email akun tidak ditemukan.';return}
        btn.disabled=true;msg.textContent='Mengirim email aktivasi password…';
        try{
          var db=supabase.createClient(window.HASNARIA_SB,window.HASNARIA_KEY,{auth:{persistSession:true,detectSessionInUrl:true,flowType:"implicit",storageKey:"hasnaria-auth-v2"}});
          var r=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname+'?password-activation=1'});
          if(r.error)throw r.error;
          msg.style.color='#166534';msg.textContent='Email aktivasi sudah dikirim. Buka email tersebut untuk membuat password aplikasi.';
        }catch(e){msg.style.color='#b43b3b';msg.textContent=e&&e.message?e.message:'Gagal mengirim email aktivasi.'}
        btn.disabled=false;
      };
      document.getElementById('hasnariaSavePassword').onclick=async function(){
        var btn=this,msg=document.getElementById('hasnariaPasswordMsg'),p=document.getElementById('hasnariaNewPassword').value,c=document.getElementById('hasnariaConfirmPassword').value;
        if(p.length<8){msg.style.color='#b43b3b';msg.textContent='Password minimal 8 karakter.';return}
        if(p!==c){msg.style.color='#b43b3b';msg.textContent='Konfirmasi password belum sama.';return}
        btn.disabled=true;msg.style.color='#66756e';msg.textContent='Menyiapkan sesi lalu menyimpan…';
        try{
          var db=window.__HASNARIA_DB;
          if(typeof window.__HASNARIA_ENSURE_RECOVERY_SESSION==='function'){
            var sess=await window.__HASNARIA_ENSURE_RECOVERY_SESSION();
            if(!sess){
              var s2=await db.auth.getSession();
              sess=s2&&s2.data&&s2.data.session;
            }
            if(!sess) throw new Error(window.__HASNARIA_RECOVERY_ERROR || 'Auth session missing! Buka link email di browser yang sama, atau kirim ulang aktivasi.');
          }
          var r=await db.auth.updateUser({password:p});
          if(r.error)throw r.error;
          msg.style.color='#166534';msg.textContent='Password aplikasi berhasil diaktifkan. Sekarang Anda bisa login dengan Google atau email + password.';
          window.__HASNARIA_PASSWORD_ACTIVATION=false;
          passwordActivationArmed=false;
          setTimeout(function(){page.classList.remove('open'); location.href=location.pathname;},1800);
        }catch(e){msg.style.color='#b43b3b';msg.textContent=e&&e.message?e.message:'Gagal menyimpan password.'; btn.disabled=false;}
      };
    }
    var name=document.getElementById('whoName'),email=getAccountEmail(),role=document.getElementById('hasnariaAccountPageRole');
    document.getElementById('hasnariaAccountPageName').textContent=(name&&name.textContent)||'—';
    document.getElementById('hasnariaAccountPageEmail').textContent=email||'—';
    if(mode==='password'){
      try{
        var db=window.__HASNARIA_DB||supabase.createClient(window.HASNARIA_SB,window.HASNARIA_KEY,{auth:{persistSession:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'hasnaria-auth-v2'}});
        var gu=await db.auth.getUser();
        if(gu.data&&gu.data.user){
          var u=gu.data.user, meta=u.user_metadata||{};
          document.getElementById('hasnariaAccountPageName').textContent=meta.full_name||meta.name||u.email||'Pengguna';
          document.getElementById('hasnariaAccountPageEmail').textContent=u.email||email||'—';
          document.getElementById('hasnariaAccountAvatar').textContent=(meta.full_name||meta.name||u.email||'H').trim().charAt(0).toUpperCase();
          role.textContent=(u.email||'').toLowerCase()==='harisnu@gmail.com'?'SUPER ADMIN':'USER';
        }
      }catch(e){}
    }
    role.textContent=superAdmin()?'SUPER ADMIN':'USER';
    document.getElementById('hasnariaAccountAvatar').textContent=((name&&name.textContent)||'H').trim().charAt(0).toUpperCase();
    var settings=document.getElementById('hasnariaAccountSettingsBody'),pass=document.getElementById('hasnariaPasswordBody');
    var title=document.getElementById('hasnariaAccountPageTitle'),desc=document.getElementById('hasnariaAccountPageDesc');
    if(mode==='password'){
      settings.classList.add('hidden');pass.classList.remove('hidden');title.textContent='Aktivasi Password Aplikasi';desc.textContent='Buat password sendiri agar akun ini dapat login dengan email + password.';
    }else{
      settings.classList.remove('hidden');pass.classList.add('hidden');title.textContent='Pengaturan Akun';desc.textContent='Kelola akses akun dan password aplikasi Hasnaria.';
      document.getElementById('hasnariaActivationMsg').textContent='';
    }
    page.classList.add('open');
  }

  function openAccountSettings(){ closeAccountMenu(); showAccountPage('settings'); }

  var passwordActivationArmed=false;
  var passwordActivationOpened=false;
  function stripPasswordActivationParam(){
    try{
      var u=new URL(location.href);
      if(!u.searchParams.has('password-activation')) return;
      u.searchParams.delete('password-activation');
      history.replaceState({}, '', u.pathname + (u.search||'') + (u.hash||''));
    }catch(_){}
  }
  function fillPasswordPageIdentity(user){
    if(!user) return;
    var emailEl=document.getElementById('hasnariaAccountPageEmail');
    var nameEl=document.getElementById('hasnariaAccountPageName');
    var av=document.getElementById('hasnariaAccountAvatar');
    var role=document.getElementById('hasnariaAccountPageRole');
    var email=user.email||'';
    var nm=(user.user_metadata&& (user.user_metadata.full_name||user.user_metadata.name)) || (email||'H').split('@')[0];
    if(emailEl) emailEl.textContent=email||'—';
    if(nameEl) nameEl.textContent=nm||'—';
    if(av) av.textContent=String(nm||'H').trim().charAt(0).toUpperCase();
    if(role){
      var low=(email||'').toLowerCase();
      role.textContent=(low==='harisnu@gmail.com'||low==='ekariashoesanti@gmail.com')?'SUPER ADMIN':'USER';
    }
  }
  function setPasswordFormReady(ok, msg){
    var btn=document.getElementById('hasnariaSavePassword');
    var help=document.getElementById('hasnariaPasswordMsg');
    if(btn) btn.disabled=!ok;
    if(help && msg){ help.style.color=ok?'#166534':'#b43b3b'; help.textContent=msg; }
  }
  function openPasswordActivationPage(){
    if(passwordActivationOpened) return;
    passwordActivationOpened=true;
    passwordActivationArmed=true;
    window.__HASNARIA_PASSWORD_ACTIVATION=true;
    showAccountPage('password');
    setPasswordFormReady(false, 'Menyiapkan sesi aktivasi…');
    var db=window.__HASNARIA_DB;
    var ensure = (typeof window.__HASNARIA_ENSURE_RECOVERY_SESSION==='function')
      ? window.__HASNARIA_ENSURE_RECOVERY_SESSION()
      : (db&&db.auth?db.auth.getSession().then(function(r){return r&&r.data&&r.data.session;}):Promise.resolve(null));
    Promise.resolve(ensure).then(function(session){
      if(!session && db && db.auth && db.auth.getSession){
        return db.auth.getSession().then(function(r){ return r&&r.data&&r.data.session; });
      }
      return session;
    }).then(function(session){
      if(!session){
        var err = window.__HASNARIA_RECOVERY_ERROR || '';
        setPasswordFormReady(false,
          (err? (err+' — ') : '') +
          'Sesi aktivasi belum siap. Buka link email di browser yang sama saat Anda menekan Kirim aktivasi, lalu minta email baru jika perlu.'
        );
        return null;
      }
      stripPasswordActivationParam();
      setPasswordFormReady(true, '');
      if(db&&db.auth&&db.auth.getUser){
        return db.auth.getUser().then(function(r){
          fillPasswordPageIdentity(r&&r.data&&r.data.user);
        }).catch(function(){});
      }
    }).catch(function(e){
      setPasswordFormReady(false, (e&&e.message)?e.message:'Gagal menyiapkan sesi aktivasi.');
    });
  }
  function showPasswordActivation(){
    try{
      var wants = window.__HASNARIA_PASSWORD_ACTIVATION || passwordActivationArmed || location.search.indexOf('password-activation=1')>=0 || /type=recovery/i.test(location.hash||'');
      if(!wants || passwordActivationOpened) return;
      var wait=0;(function poll(){
        // Wait for auth client; session ensure happens inside openPasswordActivationPage
        if(window.__HASNARIA_DB){ openPasswordActivationPage(); return; }
        if(wait++<80)setTimeout(poll,200);
      })();
    }catch(_){}
  }
  function watchPasswordRecovery(){
    if(window.__hasnariaPwRecoveryWatch) return;
    var db=window.__HASNARIA_DB;
    if(!db || !db.auth || !db.auth.onAuthStateChange) return;
    window.__hasnariaPwRecoveryWatch=true;
    if(window.__HASNARIA_PASSWORD_ACTIVATION) passwordActivationArmed=true;
    db.auth.onAuthStateChange(function(ev){
      if(ev==='PASSWORD_RECOVERY'){
        passwordActivationArmed=true;
        window.__HASNARIA_PASSWORD_ACTIVATION=true;
        openPasswordActivationPage();
      }
    });
    if(passwordActivationArmed || window.__HASNARIA_PASSWORD_ACTIVATION) showPasswordActivation();
  }

  function ensureAccountMenu(){
    var box=document.querySelector('#app .user-box');
    if(!box)return;
    var old=document.getElementById('logoutBtn');
    if(old)old.classList.add('hasnaria-hidden-logout');

    var wrap=document.getElementById('hasnariaAccountMenuWrap');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='hasnariaAccountMenuWrap';
      wrap.className='hasnaria-account-menu-wrap';
      wrap.innerHTML='<button id="hasnariaAccountMenuBtn" class="hasnaria-account-menu-btn" type="button" aria-label="Menu akun" aria-expanded="false" aria-controls="hasnariaAccountMenu"><span></span><span></span><span></span></button><div id="hasnariaAccountMenu" class="hasnaria-account-menu" aria-hidden="true"><button type="button" id="hasnariaAccountSettings">Pengaturan Akun</button><button type="button" id="hasnariaAccountLogout">Keluar</button></div>';
      box.appendChild(wrap);
      document.getElementById('hasnariaAccountMenuBtn').addEventListener('click',function(e){
        e.stopPropagation();
        var menu=document.getElementById('hasnariaAccountMenu'),btn=document.getElementById('hasnariaAccountMenuBtn'),open=menu.classList.toggle('open');
        menu.setAttribute('aria-hidden',String(!open));btn.setAttribute('aria-expanded',String(open));
      });
      document.getElementById('hasnariaAccountSettings').addEventListener('click',openAccountSettings);
      document.getElementById('hasnariaAccountLogout').addEventListener('click',function(){var b=document.getElementById('logoutBtn');if(b)b.click()});
      document.addEventListener('click',function(e){
        var w=document.getElementById('hasnariaAccountMenuWrap');
        if(w&&!w.contains(e.target))closeAccountMenu();
      });
    }
  }

  function injectAccountPageStyle(){
    if(document.getElementById('hasnaria-account-page-style'))return;
    var s=document.createElement('style');s.id='hasnaria-account-page-style';
    s.textContent='.hasnaria-account-page{display:none;position:fixed;inset:0;z-index:5000;background:#f5f7f6;overflow:auto;color:#15241d}.hasnaria-account-page.open{display:block}.hasnaria-account-page-top{height:76px;background:#176b55;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 34px}.hasnaria-page-brand{font-weight:900;letter-spacing:.08em;font-size:18px}.hasnaria-page-brand span{display:block;font-size:8px;text-align:center;letter-spacing:.35em;font-weight:500;margin-top:-2px}.hasnaria-back-btn{background:rgba(255,255,255,.12)!important;color:#fff!important;border:1px solid rgba(255,255,255,.28)!important;border-radius:10px!important;min-height:40px!important;padding:8px 14px!important}.hasnaria-account-page-main{width:min(980px,calc(100% - 40px));margin:0 auto;padding:64px 0 80px}.hasnaria-account-hero{margin-bottom:30px}.hasnaria-account-kicker{font-size:12px;letter-spacing:.14em;font-weight:900;color:#176b55}.hasnaria-account-hero h1{font-size:38px;line-height:1.1;margin:8px 0}.hasnaria-account-hero p{color:#66756e;font-size:16px}.hasnaria-account-panel{background:#fff;border:1px solid #d7e2dc;border-radius:20px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,.06)}.hasnaria-account-profile{display:flex;align-items:center;gap:16px}.hasnaria-avatar{width:58px;height:58px;border-radius:16px;background:#176b55;color:#fff;display:grid;place-items:center;font-size:24px;font-weight:900}.hasnaria-account-profile h2{margin:0 0 2px;font-size:20px}.hasnaria-account-profile p{color:#66756e;margin-bottom:8px}.hasnaria-access-badge{display:inline-block;padding:5px 9px;border-radius:99px;background:#dcfce7;color:#166534;font-size:11px;font-weight:800}.hasnaria-account-divider{height:1px;background:#e5ece8;margin:24px 0}.hasnaria-setting-item{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:12px 0}.hasnaria-setting-item b{font-size:17px}.hasnaria-setting-item p,.hasnaria-password-help{color:#66756e;font-size:13px;max-width:640px;margin-top:5px}.hasnaria-setting-item .primary{white-space:nowrap;background:#176b55;color:#fff;border:0;border-radius:10px;min-height:46px;padding:10px 18px;font-weight:800}.hasnaria-page-msg{font-size:13px;color:#b43b3b;margin-top:12px;min-height:20px}.hasnaria-password-title{font-size:20px;font-weight:800;margin-bottom:4px}.hasnaria-account-page label{display:block;margin-top:22px;font-size:12px;color:#66756e}.hasnaria-account-page input{width:100%;min-height:48px;padding:12px;border:1px solid #d5dfda;border-radius:10px;font:inherit}.hasnaria-account-page #hasnariaSavePassword{background:#176b55;color:#fff;border:0;border-radius:10px;min-height:48px;padding:10px 18px;font-weight:800}@media(max-width:650px){.hasnaria-account-page-top{padding:0 16px}.hasnaria-account-page-main{width:min(100% - 24px,980px);padding:38px 0 50px}.hasnaria-account-hero h1{font-size:30px}.hasnaria-account-panel{padding:20px}.hasnaria-setting-item{align-items:stretch;flex-direction:column}.hasnaria-setting-item .primary{width:100%}}';
    document.head.appendChild(s);
  }

  function injectStyle(){
    if(document.getElementById('hasnaria-tesla-nav-style'))return;
    var s=document.createElement('style');
    s.id='hasnaria-tesla-nav-style';
    s.textContent='#app>header{position:sticky;top:0;z-index:1000;background:#176955;color:#fff;border-bottom:1px solid rgba(255,255,255,.12);box-shadow:0 1px 8px rgba(0,0,0,.08)}#app>header .head{width:100%;max-width:1440px;min-height:72px;padding:8px 24px;margin:0 auto;display:grid;grid-template-columns:190px minmax(0,1fr) 230px;align-items:center;gap:20px;box-sizing:border-box;flex-wrap:nowrap}#app>header .head>div:first-child{grid-column:1;min-width:0;display:flex;align-items:center;justify-content:flex-start}#app>header .brand-logo{display:block;height:46px;max-width:160px;width:auto;object-fit:contain;object-position:left center}#app>header .tagline{display:none}#app>header .hasnaria-header-nav{grid-column:2;display:flex;justify-content:center;align-items:center;gap:2px;margin:0;overflow:visible;min-width:0}#app>header .hasnaria-header-nav .tab{min-height:40px;padding:8px 14px;border-radius:4px;background:transparent;color:#fff;font-size:14px;font-weight:600;line-height:1.2;white-space:nowrap;transition:background-color .2s ease}#app>header .hasnaria-header-nav .tab:hover,#app>header .hasnaria-header-nav .tab.on{background:rgba(255,255,255,.16);color:#fff}#app>header .user-box{grid-column:3;justify-self:end;display:flex;align-items:center;gap:10px;position:relative}.hasnaria-hidden-logout{display:none!important}#app>header .user-info{text-align:right}#app>header .user-info #whoName{color:#fff;font-size:13px;font-weight:600}#app>header .user-info #whoMeta{color:rgba(255,255,255,.72);font-size:11px}.hasnaria-account-menu-wrap{position:relative;display:flex;align-items:center}.hasnaria-account-menu-btn{width:42px!important;height:42px!important;min-height:42px!important;padding:0!important;border:1px solid rgba(255,255,255,.35)!important;border-radius:50%!important;background:rgba(255,255,255,.10)!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important}.hasnaria-account-menu-btn:hover{background:rgba(255,255,255,.18)!important}.hasnaria-account-menu-btn span{display:block;width:17px;height:2px;border-radius:2px;background:#fff}.hasnaria-account-menu{display:none;position:absolute;right:0;top:calc(100% + 9px);width:190px;padding:6px;background:#fff;border:1px solid #d7e2dc;border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.16);z-index:2000}.hasnaria-account-menu.open{display:block}.hasnaria-account-menu button{width:100%;min-height:42px;padding:9px 11px;background:transparent;color:#15241d;text-align:left;border-radius:8px;font-size:13px;font-weight:600}.hasnaria-account-menu button:hover{background:#eef4f1}.hasnaria-account-menu button:last-child{color:#b43b3b}.hasnaria-account-dialog{position:relative;width:min(430px,calc(100vw - 32px));background:#fff;border:1px solid #d7e2dc;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.22);z-index:2;overflow:hidden}.hasnaria-account-backdrop{position:absolute;inset:0;background:rgba(9,29,21,.48)}#hasnariaAccountModal{display:none;position:fixed;inset:0;align-items:center;justify-content:center;padding:16px;z-index:3000}#hasnariaAccountModal.open{display:flex}.hasnaria-account-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #e3ebe7}.hasnaria-account-head h2{margin:2px 0 0;font-size:20px}.hasnaria-account-kicker{font-size:10px;letter-spacing:.12em;font-weight:800;color:#176b55}.hasnaria-account-close{min-height:34px!important;width:34px!important;padding:0!important;background:#eef4f1!important;color:#15241d!important;border-radius:50%!important;font-size:24px!important;line-height:1!important}.hasnaria-account-body{padding:18px 20px 20px}.hasnaria-account-row{display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid #edf1ef;font-size:13px}.hasnaria-account-row span{color:#66756e}.hasnaria-account-row b{text-align:right}.hasnaria-account-body .primary{background:#176b55;color:#fff;border:0;border-radius:10px;min-height:44px;padding:10px 14px;font-weight:700;cursor:pointer}@media(max-width:900px){#app>header .head{grid-template-columns:1fr auto;min-height:64px;padding:8px 14px;gap:10px}#app>header .head>div:first-child{grid-column:1}#app>header .user-box{grid-column:2}#app>header .hasnaria-header-nav{grid-column:1/-1;grid-row:2;justify-content:flex-start;overflow-x:auto;width:100%;padding-bottom:3px}#app>header .hasnaria-header-nav .tab{padding:7px 12px}#app>header .user-info{display:none}}@media(max-width:600px){#app>header .brand-logo{height:38px;max-width:140px}#app>header .hasnaria-account-menu-btn{width:38px!important;height:38px!important;min-height:38px!important}}';
    document.head.appendChild(s)
  }

  function loadSettings(){
    if(document.getElementById('hasnaria-user-settings-script'))return;
    var s=document.createElement('script');
    s.id='hasnaria-user-settings-script';
    s.src='/user-settings.js?v=2';
    s.async=false;
    document.head.appendChild(s)
  }

  var runTimer=null;
  function run(){injectStyle();injectAccountPageStyle();moveNav();styleButtons();syncGroupedContent();ensureAccountMenu();loadSettings();watchPasswordRecovery();showPasswordActivation()}
  function scheduleRun(){if(runTimer)return;runTimer=setTimeout(function(){runTimer=null;run()},120)}
  function start(){run();new MutationObserver(scheduleRun).observe(document.body,{childList:true,subtree:true});setInterval(run,2500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
