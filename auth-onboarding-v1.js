(function(){
'use strict';
if(window.__HASNARIA_AUTH_ONBOARDING_V1)return;
window.__HASNARIA_AUTH_ONBOARDING_V1=true;

function ensureStyle(){
  if(document.getElementById('hasnariaAuthOnboardingCss'))return;
  var l=document.createElement('link');
  l.id='hasnariaAuthOnboardingCss';
  l.rel='stylesheet';
  l.href='/auth-onboarding-v1.css?v=2';
  document.head.appendChild(l);
}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function db(){return window.__HASNARIA_DB||null}
function close(){var x=document.getElementById('hoaBackdrop');if(x)x.remove();document.body.classList.remove('hoa-open')}
function setMsg(text,ok){var m=document.getElementById('hoaMsg');if(!m)return;m.className='hoa-msg'+(ok?' ok':'');m.textContent=text||''}
function loginEmail(){var e=document.getElementById('email');return e&&e.value?e.value.trim():''}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||''))}
function validPassword(v){v=String(v||'');return v.length>=12&&/[a-z]/.test(v)&&/[A-Z]/.test(v)&&/[0-9]/.test(v)&&/[^A-Za-z0-9]/.test(v)}
function modalShell(inner,closable){return '<section class="hoa-modal" role="dialog" aria-modal="true" aria-label="Setup akun Hasnaria"><div class="hoa-top"><div class="hoa-brand"><div class="hoa-mark">H</div><div><b>Hasnaria</b><small>Account Setup</small></div></div>'+(closable?'<button class="hoa-close" type="button" data-hoa="close" aria-label="Tutup">✕</button>':'')+'</div>'+inner+'</section>'}
function mount(html){ensureStyle();close();var back=document.createElement('div');back.id='hoaBackdrop';back.className='hoa-backdrop';back.innerHTML=html;document.body.appendChild(back);document.body.classList.add('hoa-open');return back}

function renderSignup(mode){
  mode=mode==='link'?'link':'password';
  var email=loginEmail();
  var body='<div class="hoa-kicker">DAFTAR AKUN</div><h2>Siapkan akses akun</h2><p class="hoa-lead">Pilih mau membuat password sekarang atau menerima link setup melalui email.</p>'+
  '<label class="hoa-field"><span>Email</span><input id="hoaEmail" type="email" autocomplete="email" value="'+esc(email)+'" placeholder="nama@email.com"></label>'+
  '<div class="hoa-choice"><button type="button" data-hoa-mode="password" class="'+(mode==='password'?'on':'')+'"><b>Buat password sekarang</b><small>Isi password dan konfirmasi langsung dari halaman ini.</small></button><button type="button" data-hoa-mode="link" class="'+(mode==='link'?'on':'')+'"><b>Kirim link setup</b><small>Kami kirim link aman ke email untuk membuat password.</small></button></div>'+
  '<div id="hoaPasswordFields" class="'+(mode==='link'?'hoa-hidden':'')+'"><label class="hoa-field"><span>Password baru</span><input id="hoaPassword" type="password" autocomplete="new-password" placeholder="Minimal 12 karakter"></label><label class="hoa-field"><span>Ulangi password</span><input id="hoaConfirm" type="password" autocomplete="new-password" placeholder="Ulangi password"></label><div class="hoa-policy">Password wajib minimal 12 karakter dan memuat huruf kecil, huruf besar, angka, serta simbol.</div></div>'+
  '<div id="hoaLinkInfo" class="'+(mode==='link'?'':'hoa-hidden')+' hoa-policy">Link hanya bisa dipakai oleh pemilik email. Setelah link dibuka, halaman akan meminta Anda membuat password aplikasi.</div>'+
  '<div class="hoa-actions"><button type="button" class="hoa-btn" data-hoa="close">Batal</button><button type="button" class="hoa-btn primary" id="hoaSubmit">'+(mode==='link'?'Kirim Link Setup':'Buat Akun')+'</button></div><div id="hoaMsg" class="hoa-msg"></div>';
  var back=mount(modalShell(body,true));
  back.dataset.mode=mode;
}
function switchMode(mode){var back=document.getElementById('hoaBackdrop');if(!back)return;mode=mode==='link'?'link':'password';back.dataset.mode=mode;Array.prototype.forEach.call(back.querySelectorAll('[data-hoa-mode]'),function(b){b.classList.toggle('on',b.getAttribute('data-hoa-mode')===mode)});var p=document.getElementById('hoaPasswordFields'),l=document.getElementById('hoaLinkInfo'),s=document.getElementById('hoaSubmit');if(p)p.classList.toggle('hoa-hidden',mode==='link');if(l)l.classList.toggle('hoa-hidden',mode!=='link');if(s)s.textContent=mode==='link'?'Kirim Link Setup':'Buat Akun';setMsg('',false)}
function mailClient(){var create=window.__HASNARIA_ORIGINAL_CREATE_CLIENT;if(!create&&window.supabase)create=window.supabase.createClient.bind(window.supabase);if(!create)throw new Error('Layanan autentikasi belum siap');return create(window.HASNARIA_SB,window.HASNARIA_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:'implicit',storageKey:'hasnaria-onboarding-mail'}})}
async function submitSignup(){
  var back=document.getElementById('hoaBackdrop');if(!back)return;
  var mode=back.dataset.mode||'password',email=(document.getElementById('hoaEmail').value||'').trim().toLowerCase(),btn=document.getElementById('hoaSubmit');
  if(!validEmail(email)){setMsg('Masukkan alamat email yang valid.',false);return}
  btn.disabled=true;setMsg(mode==='link'?'Mengirim link setup…':'Membuat akun…',false);
  try{
    if(mode==='link'){
      var c=mailClient();
      var r=await c.auth.signInWithOtp({email:email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname+'?setup-password=1'}});
      if(r.error)throw r.error;
      setMsg('Link setup sudah dikirim. Buka email tersebut untuk membuat password.',true);
      var login=document.getElementById('email');if(login)login.value=email;
      btn.textContent='Link Terkirim';return;
    }
    var p=document.getElementById('hoaPassword').value||'',cf=document.getElementById('hoaConfirm').value||'';
    if(!validPassword(p))throw new Error('Password belum memenuhi syarat keamanan.');
    if(p!==cf)throw new Error('Konfirmasi password belum sama.');
    var c2=db();if(!c2)throw new Error('Layanan autentikasi belum siap');
    var s=await c2.auth.signUp({email:email,password:p,options:{emailRedirectTo:location.origin+location.pathname}});
    if(s.error)throw s.error;
    var loginEmailEl=document.getElementById('email'),loginPassEl=document.getElementById('password');
    if(loginEmailEl)loginEmailEl.value=email;if(loginPassEl)loginPassEl.value='';
    if(s.data&&s.data.session){setMsg('Akun berhasil dibuat dan sudah masuk.',true);setTimeout(function(){close();location.reload()},900)}else{setMsg('Akun dibuat. Cek email untuk konfirmasi, lalu masuk menggunakan password yang tadi dibuat.',true);btn.textContent='Selesai'}
  }catch(e){setMsg(e&&e.message?e.message:'Gagal menyiapkan akun.',false);btn.disabled=false}
}
function stripSetupParam(){try{var u=new URL(location.href);u.searchParams.delete('setup-password');history.replaceState({},'',u.pathname+(u.search||'')+(u.hash||''))}catch(_){}}
async function renderSetupPassword(){
  var body='<span class="hoa-setup-badge">Email terverifikasi</span><h2>Buat password aplikasi</h2><p class="hoa-lead">Link setup berhasil dibuka. Buat password untuk login berikutnya.</p><label class="hoa-field"><span>Password baru</span><input id="hoaSetupPassword" type="password" autocomplete="new-password" placeholder="Minimal 12 karakter"></label><label class="hoa-field"><span>Ulangi password</span><input id="hoaSetupConfirm" type="password" autocomplete="new-password" placeholder="Ulangi password"></label><div class="hoa-policy">Minimal 12 karakter · huruf kecil · huruf besar · angka · simbol.</div><div class="hoa-actions"><button type="button" class="hoa-btn primary" id="hoaSaveSetup">Aktifkan Password</button></div><div id="hoaMsg" class="hoa-msg">Menyiapkan sesi akun…</div>';
  mount(modalShell(body,false));
  var c=db();if(!c){setMsg('Sesi autentikasi belum siap. Refresh halaman dari link email.',false);return}
  var session=null;
  try{var g=await c.auth.getSession();session=g&&g.data&&g.data.session;if(!session&&typeof window.__HASNARIA_ENSURE_RECOVERY_SESSION==='function')session=await window.__HASNARIA_ENSURE_RECOVERY_SESSION()}catch(_){}
  if(!session){setMsg('Sesi dari link email belum terbentuk. Buka kembali link terbaru dari email.',false);return}
  setMsg('Sesi siap. Buat password baru.',true);
  document.getElementById('hoaSaveSetup').onclick=async function(){var save=this,p=document.getElementById('hoaSetupPassword').value||'',cf=document.getElementById('hoaSetupConfirm').value||'';if(!validPassword(p)){setMsg('Password belum memenuhi syarat keamanan.',false);return}if(p!==cf){setMsg('Konfirmasi password belum sama.',false);return}save.disabled=true;setMsg('Menyimpan password…',false);try{var r=await c.auth.updateUser({password:p});if(r.error)throw r.error;setMsg('Password berhasil diaktifkan. Akun siap digunakan.',true);stripSetupParam();setTimeout(function(){close();location.href=location.pathname},1200)}catch(e){setMsg(e&&e.message?e.message:'Gagal menyimpan password.',false);save.disabled=false}}
}
function replaceSignupButton(){var old=document.getElementById('signupBtn');if(!old||old.dataset.hoa==='1')return;var b=old.cloneNode(true);b.dataset.hoa='1';b.textContent='Daftar';old.parentNode.replaceChild(b,old);b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();renderSignup('password')})}
function bind(){document.addEventListener('click',function(e){var c=e.target&&e.target.closest?e.target.closest('[data-hoa="close"]'):null;if(c){e.preventDefault();close();return}var m=e.target&&e.target.closest?e.target.closest('[data-hoa-mode]'):null;if(m){e.preventDefault();switchMode(m.getAttribute('data-hoa-mode'));return}var s=e.target&&e.target.closest?e.target.closest('#hoaSubmit'):null;if(s){e.preventDefault();submitSignup();return}},true)}
function boot(){ensureStyle();replaceSignupButton();bind();if(location.search.indexOf('setup-password=1')>=0){setTimeout(renderSetupPassword,80)}var n=0,t=setInterval(function(){replaceSignupButton();if(++n>30)clearInterval(t)},300)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
