(function(){
'use strict';
if(!window.matchMedia||!window.matchMedia('(max-width:760px)').matches)return;
if(window.__HASNARIA_OWNER_DIRECT_ENTRY_V1)return;
window.__HASNARIA_OWNER_DIRECT_ENTRY_V1=true;

var SB_URL='https://bnnhmtkpdjlgehsvgoda.supabase.co';
var SB_KEY='sb_publishable_eXrgSxWTXoa9q-hVpLx-sQ_IaEiUbeO';
var AUTH_KEY='hasnaria-auth-v2';
var db=null,busy=false;

function root(){return document.getElementById('staffRoot')}
function client(){
  if(db)return db;
  if(!window.supabase||!window.supabase.createClient)throw new Error('Layanan login belum siap. Muat ulang halaman.');
  db=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:AUTH_KEY}});
  return db;
}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function handoff(){
  var r=root();
  if(!r)return;
  // Hidden sentinel is observed by staff-owner-stable-v1 in the same event loop.
  // The legacy Owner renderer never gets a chance to paint.
  r.innerHTML='<div class="owner-mobile-nav" hidden aria-hidden="true"></div>';
}
function loginMarkup(message){
  return '<div class="hso-shell">'
    +'<header class="hso-top"><div class="hso-brand"><img src="/hasnaria-logo.svg" alt="Hasnaria"><div class="hso-brand-copy"><b>Hasnaria Owner</b><span>Mobile Workspace</span></div></div><button type="button" class="hso-top-action" data-hdo-action="back">Kembali</button></header>'
    +'<main class="hso-main"><div class="hso-page-head"><div><h1>Masuk sebagai Owner</h1><p>Gunakan akun Owner Hasnaria.</p></div></div>'
    +(message?'<div class="hso-message show error">'+esc(message)+'</div>':'')
    +'<div class="hso-card"><div class="hso-stack">'
    +'<label class="hso-field"><span>Email Owner</span><input id="hdoEmail" type="email" autocomplete="email"></label>'
    +'<label class="hso-field"><span>Password</span><input id="hdoPassword" type="password" autocomplete="current-password"></label>'
    +'<button type="button" class="hso-primary hso-full" data-hdo-action="login">Masuk</button>'
    +'</div></div></main></div>';
}
function showLogin(message){var r=root();if(r)r.innerHTML=loginMarkup(message||'')}
async function openOwner(){
  if(busy)return;
  busy=true;
  try{
    var s=await client().auth.getSession();
    if(s&&s.data&&s.data.session){handoff();return;}
    showLogin('');
  }catch(e){showLogin(e&&e.message?e.message:'Sesi Owner tidak dapat diperiksa.');}
  finally{busy=false;}
}
async function login(){
  if(busy)return;
  var email=document.getElementById('hdoEmail');
  var pass=document.getElementById('hdoPassword');
  var ev=email&&email.value?email.value.trim():'';
  var pv=pass&&pass.value?pass.value:'';
  if(!ev||!pv){showLogin('Email dan password Owner wajib diisi.');return;}
  busy=true;
  try{
    var r=await client().auth.signInWithPassword({email:ev,password:pv});
    if(r.error)throw r.error;
    handoff();
  }catch(e){showLogin(e&&e.message?e.message:'Login Owner gagal.');}
  finally{busy=false;}
}

document.addEventListener('click',function(e){
  var ownerOpen=e.target&&e.target.closest?e.target.closest('[data-act="owner-open"],[data-action="owner-open"]'):null;
  if(ownerOpen){
    e.preventDefault();
    e.stopImmediatePropagation();
    openOwner();
    return;
  }
  var action=e.target&&e.target.closest?e.target.closest('[data-hdo-action]'):null;
  if(!action)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  var a=action.getAttribute('data-hdo-action');
  if(a==='login')login();
  else if(a==='back')location.reload();
},true);

document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&document.activeElement&&document.activeElement.id==='hdoPassword'){
    e.preventDefault();
    login();
  }
},true);
})();
