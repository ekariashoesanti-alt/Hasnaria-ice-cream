(function(){
  'use strict';

  if(!window.matchMedia || !window.matchMedia('(max-width: 760px)').matches) return;

  var STYLE_ID='hasnariaStaffAtomicStyle';
  var PENDING='staff-mobile-atomic-pending';
  var root=document.getElementById('staffRoot');
  if(!root) return;

  if(!document.getElementById(STYLE_ID)){
    var style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent='@media(max-width:760px){html.'+PENDING+'{background:#fff!important}html.'+PENDING+' body{background:#fff!important}html.'+PENDING+' #staffRoot{visibility:hidden!important}}';
    document.head.appendChild(style);
  }

  var fallback=0;

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
  function isReady(s){
    return !!(s && s.classList.contains('mobile-app-mode') && s.querySelector('#hasnariaMobileNav'));
  }
  function reveal(){
    document.documentElement.classList.remove(PENDING);
    if(fallback){clearTimeout(fallback);fallback=0;}
  }
  function conceal(){
    document.documentElement.classList.add(PENDING);
    if(fallback) clearTimeout(fallback);
    fallback=setTimeout(reveal,1200);
  }
  function sync(){
    var s=shell();
    if(!isAppShell(s)){reveal();return;}

    // Hold the first mobile paint until the canonical mobile shell and nav
    // are both present. This prevents the desktop/legacy Owner Staff setup
    // from flashing before the mobile enhancer takes ownership.
    s.classList.add('mobile-app-mode');
    if(isOwnerShell(s)) s.classList.add('mobile-owner-mode');

    if(isReady(s)) reveal();
    else conceal();
  }

  // Owner setup actions in staff-v5 render synchronously from the click
  // handler. Conceal in capture phase so the raw replacement can never own
  // a paint frame before the mobile shell enhancer rebuilds navigation.
  document.addEventListener('click',function(e){
    var target=e.target&&e.target.closest?e.target.closest('[data-edit],[data-otab],[data-act="new-user"],[data-act="cancel-edit"]'):null;
    var s=shell();
    if(target&&isOwnerShell(s)) conceal();
  },true);

  var observer=new MutationObserver(sync);
  observer.observe(root,{childList:true,subtree:true});
  sync();
})();