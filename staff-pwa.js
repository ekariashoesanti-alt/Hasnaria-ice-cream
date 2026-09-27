(function(){
  'use strict';

  // HSN-614 — installable Staff portal shell. Authentication/session behavior stays in staff-v5.js.
  var deferredPrompt=null;
  var ua=navigator.userAgent||'';
  var isIOS=/iPad|iPhone|iPod/i.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  var isAndroid=/Android/i.test(ua);
  var isIOSSafari=isIOS && /Safari/i.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|FBAN|FBAV|Instagram|Line|ChatGPT)/i.test(ua);
  var standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone===true;

  function icon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M5 19h14"/></svg>';
  }

  function removeInstallButton(){
    var el=document.getElementById('hasnariaPwaInstall');
    if(el)el.remove();
  }

  function showInstallButton(){
    if(standalone || document.getElementById('hasnariaPwaInstall'))return;
    if(!isIOS && !isAndroid && !deferredPrompt)return;
    var btn=document.createElement('button');
    btn.type='button';
    btn.id='hasnariaPwaInstall';
    var needsSafari=isIOS&&!isIOSSafari;
    btn.setAttribute('aria-label',needsSafari?'Buka di Safari untuk memasang Hasnaria Staff':'Pasang Hasnaria Staff ke layar utama');
    btn.innerHTML=icon()+'<span>'+(needsSafari?'Buka di Safari untuk Pasang':'Pasang aplikasi')+'</span>';
    btn.addEventListener('click',installOrExplain);
    document.body.appendChild(btn);
  }

  function showSheet(title,body,steps){
    var old=document.getElementById('hasnariaPwaSheet');if(old)old.remove();
    var back=document.createElement('div');
    back.id='hasnariaPwaSheet';back.className='hasnaria-pwa-backdrop';
    back.innerHTML='<section class="hasnaria-pwa-sheet" role="dialog" aria-modal="true" aria-label="Pasang Hasnaria Staff">'
      +'<h2>'+title+'</h2><p>'+body+'</p><div class="hasnaria-pwa-steps">'
      +steps.map(function(s,i){return '<div class="hasnaria-pwa-step"><b>'+(i+1)+'</b><span>'+s+'</span></div>';}).join('')
      +'</div><div class="hasnaria-pwa-actions"><button type="button" class="hasnaria-pwa-close">Mengerti</button></div></section>';
    back.addEventListener('click',function(e){if(e.target===back || e.target.classList.contains('hasnaria-pwa-close'))back.remove();});
    document.body.appendChild(back);
  }

  function explainIOSInApp(){
    showSheet('Buka di Safari untuk memasang','Di iPhone, halaman dari browser di dalam aplikasi seperti ChatGPT tidak dapat memasang Hasnaria Staff langsung. Gunakan Safari sekali untuk menambahkannya ke Home Screen.',[
      'Tekan Share pada halaman ini lalu pilih “Open in Safari / Buka di Safari”.',
      'Setelah terbuka di Safari, tekan Share lagi.',
      'Pilih “Add to Home Screen / Tambahkan ke Layar Utama”, lalu tekan Add.'
    ]);
  }

  function explainIOS(){
    showSheet('Pasang Hasnaria Staff','Pemasangan iPhone dilakukan dari Safari. Setelah menekan Add, iOS tidak membuka aplikasi otomatis; kembali ke Home Screen lalu tap icon Hasnaria Staff.',[
      'Tekan Share (kotak dengan panah ke atas).',
      'Pilih “Add to Home Screen / Tambahkan ke Layar Utama”.',
      'Tekan Add. Setelah icon muncul di Home Screen, buka Hasnaria Staff dari icon tersebut.'
    ]);
  }

  function explainAndroid(){
    showSheet('Pasang Hasnaria Staff','Sesudah dipasang, portal dibuka dari icon Hasnaria dalam tampilan standalone tanpa address bar browser. Browser tidak selalu membuka PWA otomatis setelah instalasi.',[
      'Buka menu browser (⋮) bila prompt pemasangan belum muncul.',
      'Pilih “Install app” atau “Add to Home screen”.',
      'Konfirmasi, lalu kembali ke Home Screen dan buka Hasnaria Staff dari iconnya.'
    ]);
  }

  function showInstalledHint(){
    showSheet('Hasnaria Staff sudah dipasang','Pemasangan selesai. Sistem browser tidak selalu membuka aplikasi otomatis setelah instalasi.',[
      'Kembali ke Home Screen HP.',
      'Cari icon “Hasnaria Staff”.',
      'Tap icon tersebut untuk membuka portal dalam mode aplikasi.'
    ]);
  }

  function installOrExplain(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result){
        if(result&&result.outcome==='accepted'){
          removeInstallButton();
          setTimeout(showInstalledHint,300);
        }
        deferredPrompt=null;
      }).catch(function(){deferredPrompt=null;});
      return;
    }
    if(isIOS){
      if(isIOSSafari)explainIOS();
      else explainIOSInApp();
    }else explainAndroid();
  }

  if('serviceWorker' in navigator){
    window.addEventListener('load',function(){
      navigator.serviceWorker.register('/staff-sw.js',{scope:'/staff/'}).catch(function(err){console.warn('Hasnaria Staff SW gagal:',err);});
    });
  }

  window.addEventListener('beforeinstallprompt',function(event){
    event.preventDefault();
    deferredPrompt=event;
    showInstallButton();
  });

  window.addEventListener('appinstalled',function(){
    standalone=true;
    removeInstallButton();
    setTimeout(showInstalledHint,250);
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(showInstallButton,500);});
  else setTimeout(showInstallButton,500);
})();
