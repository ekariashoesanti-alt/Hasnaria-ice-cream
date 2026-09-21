/* Compatibility shim: Owner Finance uses deterministic accuracy v5; Stock keeps recall v4. */
(function(){
  'use strict';
  window.__HASNARIA_OWNER_FINSTOCK_V3=true;
  function load(id,src){
    if(document.getElementById(id))return;
    var s=document.createElement('script');
    s.id=id;s.src=src;s.async=true;document.head.appendChild(s);
  }
  load('hasnaria-finance-accuracy-v5-js','/finance-accuracy-v5.js?v=1');
  load('hasnaria-stock-recall-v4-js','/stock-recall-v4.js?v=2');
})();
