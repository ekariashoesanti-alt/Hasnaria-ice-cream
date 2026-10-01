(function(){
'use strict';
if(!window.matchMedia||!window.matchMedia('(max-width:760px)').matches)return;
if(window.__HASNARIA_MOBILE_FLICKER_GUARD_V1)return;
window.__HASNARIA_MOBILE_FLICKER_GUARD_V1=true;

var bypass=false;
function root(){return document.getElementById('staffRoot')}
function q(sel,r){return (r||document).querySelector(sel)}
function ownerActive(){
  var r=root();
  if(!r)return false;
  if(r.querySelector('#hsoShell'))return true;
  if(r.querySelector('.owner-shell'))return true;
  var legacy=r.querySelector('.owner-mobile-nav:not([hidden])');
  return !!legacy;
}
function staffReady(){var r=root();return !!(r&&r.querySelector('.staff-nav'))}
function moduleButton(mod){var r=root();return r&&r.querySelector('.staff-nav [data-mod="'+mod+'"]')}

// The legacy Staff router enters Absensi first and only selects the requested
// sub-page on a later timer. On phones that makes the intermediate menu paint
// briefly. Dispatch the module and sub-route in the same event turn instead.
// staff-v5 updates state.module synchronously before its first await, so the
// second click can set state.sub immediately; both async completions then paint
// the same final page instead of Menu -> Target.
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

// Register before staff-v5/mobile-shell so this capture handler owns only the
// two-stage mobile routes above. Other navigation continues through the normal
// application handlers unchanged.
document.addEventListener('click',intercept,true);
})();
