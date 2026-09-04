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
    try{var u=window.__HASNARIA_DB&&window.__HASNARIA_DB.auth&&window.__HASNARIA_DB.auth.getUser;return u?null:null}catch(_){}
    var who=document.getElementById('whoMeta');
    if(who){var m=who.textContent||'';email=(m.split('·')[1]||'').trim().toLowerCase()}
    return email==='harisnu@gmail.com';
  }

  function closeAccountMenu(){
    var menu=document.getElementById('hasnariaAccountMenu');
    var btn=document.getElementById('hasnariaAccountMenuBtn');
    if(menu){menu.classList.remove('open');menu.setAttribute('aria-hidden','true')}
    if(btn)btn.setAttribute('aria-expanded','false');
  }

  function openAccountSettings(){
    closeAccountMenu();
    var modal=document.getElementById('hasnariaAccountModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='hasnariaAccountModal';
      modal.innerHTML='<div class="hasnaria-account-backdrop" data-account-close></div><div class="hasnaria-account-dialog" role="dialog" aria-modal="true" aria-labelledby="hasnariaAccountTitle"><div class="hasnaria-account-head"><div><div class="hasnaria-account-kicker">AKUN</div><h2 id="hasnariaAccountTitle">Pengaturan Akun</h2></div><button type="button" class="hasnaria-account-close" data-account-close aria-label="Tutup">×</button></div><div class="hasnaria-account-body"><div class="hasnaria-account-row"><span>Nama</span><b id="hasnariaAccountName">—</b></div><div class="hasnaria-account-row"><span>Email</span><b id="hasnariaAccountEmail">—</b></div><div class="hasnaria-account-row"><span>Akses</span><b id="hasnariaAccountRole">—</b></div><div class="hasnaria-account-row"><span>Status</span><b id="hasnariaAccountStatus">Aktif</b></div><div id="hasnariaAccountMsg" class="small" style="min-height:18px;margin-top:12px"></div><button type="button" class="primary" id="hasnariaResetPassword" style="width:100%;margin-top:8px">Kirim link ubah password</button></div></div>';
      document.body.appendChild(modal);
      Array.prototype.forEach.call(modal.querySelectorAll('[data-account-close]'),function(x){x.addEventListener('click',function(){modal.classList.remove('open')})});
      document.getElementById('hasnariaResetPassword').addEventListener('click',async function(){
        var btn=this,msg=document.getElementById('hasnariaAccountMsg'),email=document.getElementById('hasnariaAccountEmail').textContent.trim();
        if(!email)return;
        btn.disabled=true;msg.textContent='Mengirim link…';
        try{
          var db=window.__HASNARIA_DB;
          var r=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
          if(r.error)throw r.error;
          msg.style.color='#166534';msg.textContent='Link ubah password sudah dikirim ke email.';
        }catch(e){msg.style.color='#b43b3b';msg.textContent=e&&e.message?e.message:'Gagal mengirim link.'}
        btn.disabled=false;
      });
    }
    var name=document.getElementById('whoName'),meta=document.getElementById('whoMeta');
    document.getElementById('hasnariaAccountName').textContent=(name&&name.textContent)||'—';
    var email=(meta&&meta.textContent.split('·')[1]||'').trim();
    document.getElementById('hasnariaAccountEmail').textContent=email||'—';
    document.getElementById('hasnariaAccountRole').textContent=superAdmin()?'Super Admin':'User';
    document.getElementById('hasnariaAccountStatus').textContent='Aktif';
    document.getElementById('hasnariaAccountMsg').textContent='';
    document.getElementById('hasnariaAccountModal').classList.add('open');
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

  function run(){injectStyle();moveNav();styleButtons();syncGroupedContent();ensureAccountMenu();loadSettings()}
  function start(){run();new MutationObserver(run).observe(document.body,{childList:true,subtree:true});setInterval(run,1000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();