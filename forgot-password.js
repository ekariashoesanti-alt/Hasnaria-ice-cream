(function(){
'use strict';
function $(id){return document.getElementById(id)}
function msg(text,type){var el=$('forgotMsg');if(!el)return;el.className='recovery-msg '+(type||'');el.textContent=text||''}
function ready(){
  var form=$('forgotForm');if(!form)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var email=String($('forgotEmail').value||'').trim().toLowerCase();
    if(!email||email.indexOf('@')<1){msg('Masukkan email akun yang valid.','error');return}
    msg('Minta Super Admin membuat “Link Reset” untuk '+email+' dari Pengaturan Akun, lalu kirim link tersebut kepada Anda melalui WhatsApp. Tidak ada email reset otomatis.','ok');
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
