/* Canonical Stock v3 owner boot bridge.
 * Claims the Stock tab before legacy owner render, loads Stock Control v3,
 * and keeps the compatibility marker expected by the existing owner guard.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_STOCK_V3_RUNTIME_FIX)return;
  window.__HASNARIA_STOCK_V3_RUNTIME_FIX=true;

  function host(){return document.getElementById('stok')}
  function visible(h){return !!(h&&!h.classList.contains('hidden'))}

  function placeReadableCssLast(){
    var id='stock-readable-density-css';
    var link=document.getElementById(id);
    if(!link){
      link=document.createElement('link');
      link.id=id;
      link.rel='stylesheet';
      link.href='/stock-readable-density.css?v=1';
    }
    document.head.appendChild(link);
  }

  function markCanonical(){
    var h=host();
    if(!h)return false;
    var shell=h.querySelector('.sc3-shell');
    if(!shell)return false;
    shell.setAttribute('data-stock-v4','1');
    placeReadableCssLast();
    return true;
  }

  function claim(){
    var h=host();
    if(!visible(h)||h.querySelector('.sc3-shell'))return;
    h.innerHTML='<div data-stock-v4="1" data-stock-v3-boot="1" class="sc3-boot"><strong>Stok &amp; Kebutuhan Material</strong><span>Memuat posisi persediaan terkini…</span></div>';
  }

  function loadCanonical(){
    placeReadableCssLast();
    if(window.__HASNARIA_STOCK_CONTROL_V3){
      setTimeout(markCanonical,0);
      return;
    }
    if(document.getElementById('hasnaria-stock-control-v3-canonical-js'))return;
    var s=document.createElement('script');
    s.id='hasnaria-stock-control-v3-canonical-js';
    s.src='/stock-control-v3.js?v=4';
    s.async=false;
    s.onload=function(){
      setTimeout(markCanonical,0);
      setTimeout(markCanonical,120);
      setTimeout(markCanonical,500);
    };
    document.head.appendChild(s);
  }

  function wake(){
    var h=host();
    if(!visible(h))return;
    claim();
    loadCanonical();
  }

  document.addEventListener('hasnaria:owner-shell-navigate',function(e){
    if(e&&e.detail&&e.detail.tab==='stok')wake();
  });

  var h=host();
  if(h){
    new MutationObserver(function(){
      if(visible(h))markCanonical();
    }).observe(h,{childList:true,subtree:false});
  }

  placeReadableCssLast();
  wake();
})();
