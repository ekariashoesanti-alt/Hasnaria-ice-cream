(function(){
'use strict';
if(!window.matchMedia||!window.matchMedia('(max-width:760px)').matches)return;
function root(){return document.getElementById('staffRoot')}
function sync(){var r=root();if(!r)return;var stable=r.querySelector('#hsoShell'),sentinel=r.querySelector('#hsoOwnerLegacySentinel');if(stable&&!sentinel){sentinel=document.createElement('div');sentinel.id='hsoOwnerLegacySentinel';sentinel.className='owner-mobile-nav';sentinel.hidden=true;sentinel.setAttribute('aria-hidden','true');stable.appendChild(sentinel)}else if(!stable&&sentinel){sentinel.remove()}}
function boot(){var r=root();if(!r)return;new MutationObserver(sync).observe(r,{childList:true,subtree:true});sync()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
