(function(){
'use strict';
var URL='https://bnnhmtkpdjlgehsvgoda.supabase.co';
var KEY='sb_publishable_eXrgSxWTXoa9q-hVpLx-sQ_IaEiUbeO';
var client=null,mode='recovery',session=null;
function $(id){return document.getElementById(id)}
function show(id){['setPasswordChecking','setPasswordView','setPasswordExpired','setPasswordSuccess'].forEach(function(x){var el=$(x);if(el)el.classList.toggle('recovery-hidden',x!==id)})}
function msg(text,type){var el=$('setPasswordMsg');if(!el)return;el.className='recovery-msg '+(type||'');el.textContent=text||''}
function policy(password){if(window.__HASNARIA_PASSWORD_POLICY&&typeof window.__HASNARIA_PASSWORD_POLICY.validate==='function')return window.__HASNARIA_PASSWORD_POLICY.validate(password);var value=String(password||''),ok=value.length>=12&&/[a-z]/.test(value)&&/[A-Z]/.test(value)&&/[0-9]/.test(value)&&/[^A-Za-z0-9]/.test(value);return{ok:ok,message:ok?'':'Password baru minimal 12 karakter dan wajib memuat huruf kecil, huruf besar, angka, serta simbol.'}}
function cleanSensitiveUrl(){try{var u=new URL(location.href);u.searchParams.delete('code');u.searchParams.delete('password-activation');u.hash='';history.replaceState(null,'',u.pathname+(u.search||''))}catch(_){}}
function configureView(){
  var activate=mode==='activate';
  $('setPasswordKicker').textContent=activate?'Aktivasi Akun':'Reset Password';
  $('setPasswordTitle').textContent=activate?'Buat Password Hasnaria':'Buat Password Baru';
  $('setPasswordIntro').textContent=activate?'Selesaikan aktivasi akun dengan membuat password aplikasi.':'Masukkan password baru untuk akun Hasnaria.';
  $('setPasswordEmail').textContent=session&&session.user&&session.user.email?session.user.email:'';
  show('setPasswordView');
}
async function resolveSession(){
  var r=await client.auth.getSession();if(r&&r.data&&r.data.session)return r.data.session;
  var code='';try{code=new URLSearchParams(location.search).get('code')||''}catch(_){}
  if(code&&client.auth.exchangeCodeForSession){var ex=await client.auth.exchangeCodeForSession(code);if(ex&&ex.error)throw ex.error;if(ex&&ex.data&&ex.data.session)return ex.data.session}
  return await new Promise(function(resolve){var done=false;var sub=client.auth.onAuthStateChange(function(ev,s){if(done)return;if(s&&(ev==='PASSWORD_RECOVERY'||ev==='SIGNED_IN'||ev==='INITIAL_SESSION')){done=true;try{sub.data.subscription.unsubscribe()}catch(_){}resolve(s)}});setTimeout(function(){if(done)return;done=true;try{sub.data.subscription.unsubscribe()}catch(_){}resolve(null)},4500)});
}
async function finalizeActivation(){
  var r=await client.rpc('account_activation_finalize_v1');
  if(r.error)throw r.error;
  return r.data;
}
async function boot(){
  if(typeof supabase==='undefined'){show('setPasswordExpired');return}
  try{
    mode=(new URLSearchParams(location.search).get('mode')||'recovery').toLowerCase()==='activate'?'activate':'recovery';
    client=supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'hasnaria-password-setup-v1'}});
    session=await resolveSession();
    if(!session){show('setPasswordExpired');return}
    cleanSensitiveUrl();configureView();
  }catch(e){show('setPasswordExpired')}
}
async function save(e){
  e.preventDefault();if(!client||!session)return;
  var pass=String($('newPassword').value||''),confirm=String($('confirmPassword').value||''),btn=$('setPasswordSubmit');
  var check=policy(pass);if(!check.ok){msg(check.message,'error');return}
  if(pass!==confirm){msg('Konfirmasi password tidak sama.','error');return}
  btn.disabled=true;msg('Menyimpan password…','');
  try{
    var r=await client.auth.updateUser({password:pass});if(r.error)throw r.error;
    if(mode==='activate')await finalizeActivation();
    await client.auth.signOut();
    try{localStorage.removeItem('hasnaria-password-setup-v1')}catch(_){}
    show('setPasswordSuccess');
  }catch(err){msg(err&&err.message?err.message:'Gagal menyimpan password.','error');btn.disabled=false}
}
function start(){var f=$('setPasswordForm');if(f)f.addEventListener('submit',save);boot()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
