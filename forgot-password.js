(function(){
'use strict';
var URL='https://bnnhmtkpdjlgehsvgoda.supabase.co';
var KEY='sb_publishable_eXrgSxWTXoa9q-hVpLx-sQ_IaEiUbeO';
function $(id){return document.getElementById(id)}
function msg(text,type){var el=$('forgotMsg');if(!el)return;el.className='recovery-msg '+(type||'');el.textContent=text||''}
function ready(){
  var form=$('forgotForm');if(!form||typeof supabase==='undefined')return false;
  var client=supabase.createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:'implicit',storageKey:'hasnaria-forgot-password-v1'}});
  form.addEventListener('submit',async function(e){
    e.preventDefault();
    var email=String($('forgotEmail').value||'').trim().toLowerCase(),btn=$('forgotSubmit');
    if(!email){msg('Masukkan email akun.','error');return}
    btn.disabled=true;msg('Mengirim tautan reset…','');
    try{
      var redirect=location.origin+'/?password-activation=1&mode=recovery';
      var r=await client.auth.resetPasswordForEmail(email,{redirectTo:redirect});
      if(r.error)throw r.error;
      form.classList.add('recovery-hidden');
      msg('Jika email terdaftar, tautan reset password sudah dikirim. Silakan cek inbox dan folder spam.','ok');
    }catch(err){
      msg('Permintaan belum dapat diproses. Coba lagi beberapa saat.','error');
      btn.disabled=false;
    }
  });
  return true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){var n=0;(function wait(){if(ready())return;if(n++<80)setTimeout(wait,50)})();},{once:true});else{var n=0;(function wait(){if(ready())return;if(n++<80)setTimeout(wait,50)})()}
})();
