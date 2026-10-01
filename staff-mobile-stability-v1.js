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
  function ensureProvisionalNav(s,owner){
    if(!s || s.querySelector('#hasnariaMobileNav')) return;
    var nav=document.createElement('nav');
    nav.id='hasnariaMobileNav';
    nav.className='mobile-app-nav '+(owner?'owner-nav':'staff-nav-v2');
    nav.setAttribute('aria-hidden','true');
    nav.setAttribute('data-mobile-provisional','1');
    nav.innerHTML='<span></span><span></span><span></span><span></span><span></span>';
    s.appendChild(nav);
  }
  function sync(){
    var s=shell();
    if(!isAppShell(s)) return;

    // Apply the final mobile layout classes in the mutation microtask, before
    // the browser can paint the raw Owner/Staff renderer. Do not hide the
    // root: hiding it was the source of the visible white blink on phones.
    var owner=isOwnerShell(s);
    s.classList.add('mobile-app-mode');
    if(owner) s.classList.add('mobile-owner-mode');

    // Reserve the canonical bottom-nav frame immediately. The full mobile
    // shell replaces this provisional nav in its requestAnimationFrame pass,
    // so the user sees one stable frame instead of legacy -> blank -> mobile.
    ensureProvisionalNav(s,owner);
  }

  var observer=new MutationObserver(sync);
  observer.observe(root,{childList:true,subtree:true});
  sync();
})();
