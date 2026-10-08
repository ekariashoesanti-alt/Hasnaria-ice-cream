(function(){
'use strict';
if(!window.matchMedia||!window.matchMedia('(max-width:760px)').matches)return;
if(window.__HASNARIA_MOBILE_FLICKER_GUARD_V1)return;
window.__HASNARIA_MOBILE_FLICKER_GUARD_V1=true;

var SB_URL='https://bnnhmtkpdjlgehsvgoda.supabase.co';
var SB_KEY='sb_publishable_eXrgSxWTXoa9q-hVpLx-sQ_IaEiUbeO';
var STAFF_TOKEN_KEY='hasnaria-staff-session-v1';
var bypass=false;

function root(){return document.getElementById('staffRoot')}
function ownerActive(){
  var r=root();
  if(!r)return false;
  if(r.querySelector('#hsoShell'))return true;
  if(r.querySelector('.owner-shell'))return true;
  var legacy=r.querySelector('.owner-mobile-nav:not([hidden])');
  return !!legacy;
}
function staffReady(){var r=root();return !!(r&&r.querySelector('.staff-nav'))}
function mobileStaffReady(){var r=root();return !!(r&&r.querySelector('.mobile-dashboard-head'))}
function moduleButton(mod){var r=root();return r&&r.querySelector('.staff-nav [data-mod="'+mod+'"]')}
function storedStaffToken(){try{return localStorage.getItem(STAFF_TOKEN_KEY)||''}catch(_){return''}}

// Returning Staff sessions used to paint the login view while staff-v5 checked
// the stored token. Keep a stable cover above the app until the enhanced mobile
// home is ready. Expired tokens release quickly and a hard timeout guarantees
// recovery if session probing or enhancement fails.
function installBootCover(){
  var token=storedStaffToken(),r=root();
  if(!token||!r||ownerActive())return;
  var cover=document.createElement('div');
  cover.id='hasnariaStaffBootCover';
  cover.className='hfg-boot-cover';
  cover.setAttribute('role','status');
  cover.setAttribute('aria-live','polite');
  var box=document.createElement('div');
  box.className='hfg-boot-box';
  var img=document.createElement('img');
  img.className='hfg-boot-logo';
  img.src='/hasnaria-logo.svg';
  img.alt='Hasnaria';
  var title=document.createElement('strong');
  title.className='hfg-boot-title';
  title.textContent='Hasnaria Team';
  var note=document.createElement('span');
  note.className='hfg-boot-note';
  note.textContent='Memuat sesi…';
  box.appendChild(img);box.appendChild(title);box.appendChild(note);cover.appendChild(box);document.body.appendChild(cover);

  var released=false,observer=null;
  function release(){
    if(released)return;
    released=true;
    if(observer)observer.disconnect();
    if(cover.parentNode)cover.remove();
  }
  function settleInvalid(){
    var start=Date.now();
    (function waitLogin(){
      var rr=root(),sel=rr&&rr.querySelector('#emp');
      if(sel&&sel.options&&sel.options.length>1){release();return}
      if(Date.now()-start>900){release();return}
      setTimeout(waitLogin,60);
    })();
  }
  observer=new MutationObserver(function(){if(mobileStaffReady())release()});
  observer.observe(r,{childList:true,subtree:true});
  if(mobileStaffReady()){release();return}

  if(window.supabase&&window.supabase.createClient){
    try{
      var probe=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      probe.rpc('staff_session_info',{p_token:token}).then(function(res){
        var valid=!res.error&&Array.isArray(res.data)&&res.data.length>0;
        if(!valid)settleInvalid();
      }).catch(settleInvalid);
    }catch(_){settleInvalid()}
  }else settleInvalid();
  setTimeout(release,7000);
}

// The legacy Staff router enters Absensi first and only selects the requested
// sub-page on a later timer. Dispatch module and sub-route in one event turn so
// the intermediate menu never becomes the visible target.
function routeStaff(mod,sub){
  if(!staffReady())return false;
  var r=root(),btn=moduleButton(mod);
  if(!r||!btn||btn.disabled)return false;
  bypass=true;
  try{
    btn.click();
    if(sub){
      var ghost=document.createElement('button');
      ghost.type='button';
      ghost.hidden=true;
      ghost.tabIndex=-1;
      ghost.setAttribute('aria-hidden','true');
      ghost.setAttribute('data-sub',sub);
      ghost.setAttribute('data-flicker-route','1');
      r.appendChild(ghost);
      ghost.click();
      ghost.remove();
    }
  }finally{bypass=false}
  return true;
}
function routeNamed(name){
  if(name==='att-clock')return routeStaff('absensi','clock');
  if(name==='att-history')return routeStaff('absensi','history');
  if(name==='att-summary')return routeStaff('absensi','summary');
  if(name==='att-correction')return routeStaff('absensi','corr');
  if(name==='att-approvals')return routeStaff('absensi','mine');
  return false;
}
function intercept(e){
  if(bypass||ownerActive())return;
  var t=e.target&&e.target.closest?e.target.closest('[data-mobile-route],[data-mobile-target]'):null;
  if(!t)return;
  var named=t.getAttribute('data-mobile-route');
  if(named&&routeNamed(named)){
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  var target=t.getAttribute('data-mobile-target');
  var ok=false;
  if(target==='action')ok=routeStaff('absensi','clock');
  else if(target==='approval')ok=routeStaff('absensi','mine');
  if(ok){
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

document.addEventListener('click',intercept,true);
installBootCover();
})();
