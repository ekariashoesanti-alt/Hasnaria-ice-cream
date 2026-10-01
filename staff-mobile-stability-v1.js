(function(){
  'use strict';

  if(!window.matchMedia || !window.matchMedia('(max-width: 760px)').matches) return;

  var root=document.getElementById('staffRoot');
  if(!root) return;

  function shell(){return root.querySelector('.staff-shell');}
  function isOwnerShell(s){
    if(!s) return false;
    if(s.classList.contains('owner-shell')) return true;
    if(s.querySelector('.owner-nav') || s.querySelector('.owner-mobile-nav')) return true;
    var brand=s.querySelector('.staff-brand-copy b');
    return !!(brand && /Owner Mobile/i.test(brand.textContent||''));
  }
  function isAppShell(s){
    return !!(s && (isOwnerShell(s) || s.querySelector('.staff-nav')));
  }
  function provisionalItem(center){
    return '<button type="button" tabindex="-1" aria-hidden="true" class="mobile-nav-item'+(center?' mobile-nav-center':'')+'"><span></span><small></small></button>';
  }
  function ensureProvisionalNav(s,owner){
    if(!s || s.querySelector('#hasnariaMobileNav')) return;
    var nav=document.createElement('nav');
    nav.id='hasnariaMobileNav';
    nav.className='mobile-app-nav '+(owner?'owner-nav':'staff-nav-v2');
    nav.setAttribute('aria-hidden','true');
    nav.setAttribute('data-mobile-provisional','1');
    nav.style.pointerEvents='none';
    nav.innerHTML=provisionalItem(false)+provisionalItem(false)+provisionalItem(true)+provisionalItem(false)+provisionalItem(false);
    s.appendChild(nav);
  }
  function sync(){
    var s=shell();
    if(!isAppShell(s)) return;

    var owner=isOwnerShell(s);
    s.classList.add('mobile-app-mode');
    if(owner) s.classList.add('mobile-owner-mode');

    // Reserve the exact final bottom-nav geometry before the mobile enhancer
    // runs. Matching the five real button boxes prevents the bar from jumping
    // when the provisional node is replaced by the canonical navigation.
    ensureProvisionalNav(s,owner);
  }

  var observer=new MutationObserver(sync);
  observer.observe(root,{childList:true,subtree:true});
  sync();
})();
