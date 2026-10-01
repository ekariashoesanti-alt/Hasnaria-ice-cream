(function(){
'use strict';
if(!window.matchMedia||!window.matchMedia('(max-width:760px)').matches)return;
var SB_URL='https://bnnhmtkpdjlgehsvgoda.supabase.co';
var SB_KEY='sb_publishable_eXrgSxWTXoa9q-hVpLx-sQ_IaEiUbeO';
var AUTH_KEY='hasnaria-auth-v2';
var db=null,bypass=false,busy=false;
function root(){return document.getElementById('staffRoot')}
function client(){if(db)return db;if(!window.supabase||!window.supabase.createClient)return null;db=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:AUTH_KEY}});return db}
function hasStoredOwnerSession(){try{return !!localStorage.getItem(AUTH_KEY)}catch(_){return false}}
function showError(text){var r=root();if(!r)return;var old=r.querySelector('[data-hso-entry-error]');if(old)old.remove();var target=r.querySelector('[data-act="owner-login"]');if(!target)return;var box=document.createElement('div');box.setAttribute('data-hso-entry-error','1');box.className='staff-msg';box.textContent=text||'Login Owner gagal.';target.insertAdjacentElement('afterend',box)}
function triggerStable(){var r=root();if(!r||r.querySelector('#hsoShell'))return;var old=r.querySelector('[data-hso-entry-sentinel]');if(old)return;var sentinel=document.createElement('div');sentinel.className='owner-mobile-nav';sentinel.hidden=true;sentinel.setAttribute('aria-hidden','true');sentinel.setAttribute('data-hso-entry-sentinel','1');r.appendChild(sentinel)}
function replay(target){bypass=true;try{target.click()}finally{bypass=false}}
function boot(){document.addEventListener('click',function(e){if(bypass||document.getElementById('hsoShell'))return;var t=e.target&&e.target.closest?e.target.closest('[data-act]'):null;if(!t)return;var act=t.getAttribute('data-act');if(act==='owner-open'&&hasStoredOwnerSession()){
 e.preventDefault();e.stopImmediatePropagation();var c=client();if(!c){replay(t);return}c.auth.getSession().then(function(res){if(res.data&&res.data.session)triggerStable();else replay(t)}).catch(function(){replay(t)});return;
}
if(act==='owner-login'){
 e.preventDefault();e.stopImmediatePropagation();if(busy)return;var email=document.getElementById('oemail'),pass=document.getElementById('opass'),c2=client();if(!c2||!email||!pass){replay(t);return}busy=true;t.disabled=true;c2.auth.signInWithPassword({email:email.value,password:pass.value}).then(function(res){if(res.error)throw res.error;triggerStable()}).catch(function(err){showError(err&&err.message?err.message:String(err||'Login Owner gagal.'))}).finally(function(){busy=false;if(document.body.contains(t))t.disabled=false});return;
}
},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
