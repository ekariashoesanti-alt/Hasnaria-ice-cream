(function(){
  'use strict';

  var scheduled=false;
  var ownerLandingShown=false;
  var memo={staffName:'Staff',modules:{absensi:false,kasir:false,gudang:false},ownerCounts:{users:'',approvals:'',location:''}};

  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function text(el){return el?(el.textContent||'').trim():'';}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function shell(){return q('#staffRoot .staff-shell');}
  function overlay(){return q('#hasnariaMobileOverlay');}
  function mobileNav(){return q('#hasnariaMobileNav');}
  function stableOwnerHandoff(){return !!q('#hsoShell')||!!q('[data-hso-entry-sentinel="1"]');}
  function ownerLoginVisible(){return !!q('[data-act="owner-login"]')||!!(q('#oemail')&&q('#opass'));}
  function isOwner(){return !ownerLoginVisible()&&(!!q('.owner-mobile-nav')||/Owner Mobile/i.test(text(q('.staff-brand-copy b'))));}
  function isStaff(){return !!q('.staff-nav');}
  function isLogin(){return ownerLoginVisible()||(!isOwner()&&!isStaff());}

  function icon(name){
    var path={
      home:'<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/><path d="M9 22v-7h6v7"/>',
      grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      finger:'<path d="M9 11V5a2 2 0 1 1 4 0v6"/><path d="M13 10V7a2 2 0 1 1 4 0v5"/><path d="M17 11V9a2 2 0 1 1 4 0v7c0 4-3 7-7 7h-1c-3 0-5-1-7-4l-3-5a2 2 0 0 1 3-2l3 3v-4a2 2 0 0 1 4 0"/>',
      check:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 2 2 4-4"/><path d="M8 15h8"/>',
      user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 3.3-6 8-6s7.2 2 8 6"/>',
      pin:'<path d="M12 22s7-5.3 7-12a7 7 0 1 0-14 0c0 6.7 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
      cart:'<path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20 8H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
      box:'<path d="m4 7 8-4 8 4-8 4Z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/>',
      shop:'<rect x="5" y="2" width="14" height="20" rx="1"/><path d="M10 22v-5h4v5M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
    }[name]||'';
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
  }

  function captureStaff(){
    var greeting=q('.staff-greeting h1');
    if(greeting){memo.staffName=text(greeting).replace(/^Halo,\s*/i,'')||memo.staffName;}
    var topAction=q('.attendance-shell .staff-top-action');
    if(topAction && !/Kembali|Keluar/i.test(text(topAction))) memo.staffName=text(topAction)||memo.staffName;
    qa('.staff-nav [data-mod]').forEach(function(btn){
      var key=btn.getAttribute('data-mod');
      if(key&&key!=='home')memo.modules[key]=!btn.disabled;
    });
  }

  function captureOwner(){
    qa('.owner-mobile-nav [data-otab]').forEach(function(btn){
      var key=btn.getAttribute('data-otab');
      var small=q('small',btn);
      memo.ownerCounts[key]=text(small);
    });
  }

  function clearShellClasses(){
    var s=shell();if(!s)return;
    ['mobile-home-mode','mobile-clock-mode','mobile-owner-mode','mobile-app-mode','mobile-overlay-mode'].forEach(function(c){s.classList.remove(c);});
    s.classList.add('mobile-app-mode');
  }

  function enhanceHome(){
    var card=q('.staff-greeting');
    var s=shell();
    if(!card||!s||card.getAttribute('data-mobile-enhanced')==='1')return;
    captureStaff();
    s.classList.add('mobile-home-mode');
    card.setAttribute('data-mobile-enhanced','1');
    var enabled=Object.keys(memo.modules).filter(function(k){return memo.modules[k];});
    var moduleLabel={absensi:'Absensi',kasir:'Kasir',gudang:'Gudang'};
    var moduleIcon={absensi:'clock',kasir:'cart',gudang:'box'};
    var tiles=enabled.map(function(k){return '<button class="mobile-explore-tile" data-mod="'+k+'"><span>'+icon(moduleIcon[k])+'</span><b>'+moduleLabel[k]+'</b></button>';}).join('');
    var parent=card.parentNode;
    parent.innerHTML=''
      +'<div class="mobile-dashboard-head"><div><span class="mobile-kicker">Hasnaria Staff</span><h1>Halo, '+esc(memo.staffName)+'</h1><p>Selamat bekerja. Semua aktivitas utama ada di satu tempat.</p></div><img src="/hasnaria-logo.svg" alt="Hasnaria"></div>'
      +'<section class="mobile-section"><div class="mobile-section-head"><h2>Informasi Untuk Anda</h2></div><button class="mobile-info-card mobile-info-action" data-mobile-route="att-clock"><span>'+icon('clock')+'</span><div><b>Status Kehadiran</b><small>Buka absensi untuk melihat status dan lokasi hari ini.</small></div><i>›</i></button></section>'
      +'<section class="mobile-section"><div class="mobile-section-head"><h2>Akses Kerja Anda</h2><button data-mobile-target="explore">Lihat Semua</button></div><div class="mobile-home-grid">'+(tiles||'<div class="mobile-empty-card">Belum ada modul yang ditugaskan.</div>')+'</div></section>'
      +'<section class="mobile-section"><div class="mobile-section-head"><h2>Pekerjaan Anda</h2></div><div class="mobile-empty-card">Akses aktif: '+esc(enabled.map(function(k){return moduleLabel[k];}).join(', ')||'belum ada')+'</div></section>';
  }

  function enhanceClock(){
    var s=shell();var box=q('.attendance-illustration-card');
    if(!s||!box)return;
    s.classList.add('mobile-clock-mode');
    var timeContainer=q('.attendance-times',box);
    var timeBoxes=timeContainer?timeContainer.children:[];
    var inTime=timeBoxes[0]?text(q('strong',timeBoxes[0])):'—';
    var outTime=timeBoxes[1]?text(q('strong',timeBoxes[1])):'—';
    // The source times come from persisted attendance, never a button click or GPS result.
    var validTime=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
    inTime=validTime.test(inTime)?inTime:'';
    outTime=validTime.test(outTime)?outTime:'';
    var history=q('.mobile-today-history',box);
    var timesKey=inTime+'|'+outTime;
    if(history&&history.getAttribute('data-clock-times')===timesKey)return;
    if(!history){
      history=document.createElement('div');
      history.className='mobile-today-history';
      box.insertBefore(history,box.firstChild);
    }
    box.setAttribute('data-mobile-enhanced','1');
    history.setAttribute('data-clock-times',timesKey);
    function card(kind,time,label){
      if(!time)return '';
      var savedStatus='Absensi '+label+' tersimpan otomatis; tidak memerlukan persetujuan Owner.';
      return '<div class="mobile-history-card mobile-history-'+kind+'" data-clock-record="'+kind+'">'
        +'<span class="mobile-history-accent" aria-hidden="true"></span><time class="mobile-history-time">'+esc(time)+'</time>'
        +'<span class="mobile-history-icon">'+icon('shop')+'</span><b>'+label+'</b>'
        +'<span class="mobile-history-status" title="'+esc(savedStatus)+'" aria-label="'+esc(savedStatus)+'">Disetujui</span></div>';
    }
    history.innerHTML='<h2>Riwayat Hari Ini</h2><div class="mobile-history-list">'
      +card('in',inTime,'Clock In')+card('out',outTime,'Clock Out')
      +'</div>';
  }

  function staffExploreHtml(){
    var cards=[];
    if(memo.modules.absensi)cards.push(['absensi','clock','clock','Kehadiran']);
    if(memo.modules.kasir)cards.push(['kasir','', 'cart','Kasir']);
    if(memo.modules.gudang)cards.push(['gudang','', 'box','Gudang']);
    if(memo.modules.absensi){
      cards.push(['route','att-history','check','Riwayat']);
      cards.push(['route','att-summary','grid','Kehadiran Saya']);
      cards.push(['route','att-correction','clock','Koreksi']);
    }
    return '<div class="mobile-overlay-head"><span class="mobile-kicker">Hasnaria Staff</span><h1>Jelajah</h1><p>Pilih fungsi kerja yang dibutuhkan.</p></div><div class="mobile-explore-grid">'+cards.map(function(c){
      var attr=c[0]==='route'?'data-mobile-route="'+c[1]+'"':'data-mod="'+c[0]+'"';
      return '<button class="mobile-explore-tile" '+attr+'><span>'+icon(c[2])+'</span><b>'+esc(c[3])+'</b></button>';
    }).join('')+'</div>';
  }

  function ownerExploreHtml(){
    return '<div class="mobile-overlay-head"><span class="mobile-kicker">Owner Mobile</span><h1>Jelajah</h1><p>Kelola staff, persetujuan, dan lokasi absensi.</p></div><div class="mobile-explore-grid">'
      +'<button class="mobile-explore-tile" data-otab="users"><span>'+icon('user')+'</span><b>Akun Staff</b></button>'
      +'<button class="mobile-explore-tile" data-otab="approvals"><span>'+icon('check')+'</span><b>Persetujuan</b></button>'
      +'<button class="mobile-explore-tile" data-otab="location"><span>'+icon('pin')+'</span><b>Lokasi Absensi</b></button>'
      +'</div>';
  }

  function profileHtml(owner){
    var name=owner?'Owner Hasnaria':memo.staffName;
    return '<div class="mobile-overlay-head"><span class="mobile-kicker">'+(owner?'Owner Mobile':'Hasnaria Staff')+'</span><h1>Profil</h1></div>'
      +'<div class="mobile-profile-card"><div class="mobile-avatar">'+icon('user')+'</div><div><b>'+esc(name)+'</b><small>'+(owner?'Owner':'Pegawai')+'</small></div></div>'
      +(owner?'<button class="mobile-list-row" data-otab="users"><span>'+icon('user')+'</span><div><b>Kelola Akun Staff</b><small>PIN, akses, dan status staff</small></div><i>›</i></button><button class="mobile-list-row" data-otab="location"><span>'+icon('pin')+'</span><div><b>Lokasi Absensi</b><small>Atur titik Warung dan radius 50 m</small></div><i>›</i></button><button class="staff-btn ghost mobile-logout" data-act="owner-out">Keluar Owner</button>':'<button class="mobile-list-row" data-mobile-route="att-summary"><span>'+icon('check')+'</span><div><b>Kehadiran Saya</b><small>Lihat ringkasan kehadiran</small></div><i>›</i></button><button class="staff-btn ghost mobile-logout" data-act="staff-out">Keluar</button>');
  }

  function ownerHomeHtml(){
    var users=memo.ownerCounts.users||'Pegawai';
    var approvals=memo.ownerCounts.approvals||'0 koreksi';
    var location=memo.ownerCounts.location||'Belum diset';
    return '<div class="mobile-dashboard-head mobile-owner-dashboard"><div><span class="mobile-kicker">Owner Mobile</span><h1>Beranda</h1><p>Ringkasan operasional staff Hasnaria.</p></div><img src="/hasnaria-logo.svg" alt="Hasnaria"></div>'
      +'<section class="mobile-section"><div class="mobile-section-head"><h2>Informasi Untuk Anda</h2></div><div class="mobile-owner-summary"><button data-otab="users"><span>'+icon('user')+'</span><b>'+esc(users)+'</b><small>Akun staff</small></button><button data-otab="approvals"><span>'+icon('check')+'</span><b>'+esc(approvals)+'</b><small>Persetujuan</small></button><button data-otab="location"><span>'+icon('pin')+'</span><b>'+esc(location)+'</b><small>Lokasi absensi</small></button></div></section>'
      +'<section class="mobile-section"><div class="mobile-section-head"><h2>Tindakan Cepat</h2><button data-mobile-target="explore">Lihat Semua</button></div><button class="mobile-info-card mobile-info-action" data-otab="approvals"><span>'+icon('check')+'</span><div><b>Periksa Koreksi Kehadiran</b><small>Setujui atau tolak koreksi manual pegawai.</small></div><i>›</i></button></section>';
  }

  function showOverlay(kind){
    var s=shell();if(!s)return;
    removeOverlay();
    var owner=isOwner();
    var box=document.createElement('section');
    box.id='hasnariaMobileOverlay';
    box.className='mobile-app-overlay';
    box.setAttribute('data-mobile-kind',kind);
    if(kind==='explore')box.innerHTML=owner?ownerExploreHtml():staffExploreHtml();
    else if(kind==='profile')box.innerHTML=profileHtml(owner);
    else if(kind==='owner-home')box.innerHTML=ownerHomeHtml();
    s.appendChild(box);
    s.classList.add('mobile-overlay-mode');
    ensureNav();
  }

  function removeOverlay(){var o=overlay();if(o)o.remove();var s=shell();if(s)s.classList.remove('mobile-overlay-mode');}

  function hiddenStaffButton(mod){return q('.staff-nav [data-mod="'+mod+'"]');}
  function routeStaff(mod,sub){
    removeOverlay();
    var b=hiddenStaffButton(mod)||q('[data-mod="'+mod+'"]');
    if(!b||b.disabled)return;
    b.click();
    if(sub)setTimeout(function(){var s=q('[data-sub="'+sub+'"]');if(s)s.click();},80);
  }
  function routeOwner(tab){removeOverlay();var b=q('.owner-mobile-nav [data-otab="'+tab+'"]')||q('[data-otab="'+tab+'"]');if(b)b.click();}

  function routeNamed(name){
    if(name==='att-clock')routeStaff('absensi','clock');
    else if(name==='att-history')routeStaff('absensi','history');
    else if(name==='att-summary')routeStaff('absensi','summary');
    else if(name==='att-correction')routeStaff('absensi','corr');
    else if(name==='att-approvals')routeStaff('absensi','mine');
  }

  function activeTarget(owner){
    var o=overlay();if(o){var k=o.getAttribute('data-mobile-kind');if(k==='explore')return'explore';if(k==='profile')return'profile';if(k==='owner-home')return'home';}
    if(owner){
      var on=q('.owner-mobile-nav [data-otab].on');
      var tab=on&&on.getAttribute('data-otab');
      if(tab==='approvals')return'action';
      if(tab==='location')return'location';
      return'explore';
    }
    if(q('.mobile-clock-mode')||q('.attendance-full-head'))return'action';
    var title=text(q('.attendance-page-title h1'));
    if(/Koreksi Saya/i.test(title))return'approval';
    var onStaff=q('.staff-nav [data-mod].on');
    var mod=onStaff&&onStaff.getAttribute('data-mod');
    if(mod==='home')return'home';
    return'explore';
  }

  function navButton(target,label,iconName,active,center){return '<button type="button" data-mobile-target="'+target+'" class="mobile-nav-item '+(active===target?'on ':'')+(center?'mobile-nav-center':'')+'"><span>'+icon(iconName)+'</span><small>'+esc(label)+'</small></button>';}

  function ensureNav(){
    var s=shell();if(!s||isLogin())return;
    var owner=isOwner();var active=activeTarget(owner);var old=mobileNav();
    var key=(owner?'owner':'staff')+':'+active;
    if(old&&old.getAttribute('data-mobile-key')===key)return;
    if(old)old.remove();
    var nav=document.createElement('nav');nav.id='hasnariaMobileNav';nav.className='mobile-app-nav '+(owner?'owner-nav':'staff-nav-v2');nav.setAttribute('data-mobile-key',key);
    nav.innerHTML=navButton('home','Beranda','home',active,false)+navButton('explore','Jelajah','grid',active,false)+navButton('action',owner?'Persetujuan':'Absensi',owner?'check':'finger',active,true)+(owner?navButton('location','Lokasi','pin',active,false):navButton('approval','Persetujuan','check',active,false))+navButton('profile','Profil','user',active,false);
    s.appendChild(nav);
  }

  function handleMobileTarget(target){
    var owner=isOwner();
    if(owner){
      if(target==='home')showOverlay('owner-home');
      else if(target==='explore')showOverlay('explore');
      else if(target==='action')routeOwner('approvals');
      else if(target==='location')routeOwner('location');
      else if(target==='profile')showOverlay('profile');
      return;
    }
    if(target==='home')routeStaff('home','');
    else if(target==='explore')showOverlay('explore');
    else if(target==='action')routeStaff('absensi','clock');
    else if(target==='approval')routeStaff('absensi','mine');
    else if(target==='profile')showOverlay('profile');
  }

  function enhance(){
    scheduled=false;
    if(stableOwnerHandoff()){removeOverlay();var stableNav=mobileNav();if(stableNav)stableNav.remove();return;}
    if(!shell()||isLogin()){removeOverlay();var n=mobileNav();if(n)n.remove();return;}
    clearShellClasses();
    if(isOwner()){
      captureOwner();
      shell().classList.add('mobile-owner-mode');
      if(!ownerLandingShown){ownerLandingShown=true;showOverlay('owner-home');return;}
    }else{
      captureStaff();
      if(q('.staff-greeting'))enhanceHome();
      if(q('.attendance-full-head'))enhanceClock();
    }
    ensureNav();
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}

  document.addEventListener('click',function(e){
    var target=e.target.closest('[data-mobile-target]');
    if(target){e.preventDefault();e.stopPropagation();handleMobileTarget(target.getAttribute('data-mobile-target'));return;}
    var route=e.target.closest('[data-mobile-route]');
    if(route){e.preventDefault();e.stopPropagation();routeNamed(route.getAttribute('data-mobile-route'));return;}
  },true);

  var obs=new MutationObserver(schedule);
  obs.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
})();
