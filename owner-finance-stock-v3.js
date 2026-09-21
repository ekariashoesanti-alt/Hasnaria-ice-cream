/* Compatibility shim: Owner Finance uses stable v6; Stock keeps recall v4. */
(function(){
  'use strict';
  window.__HASNARIA_OWNER_FINSTOCK_V3=true;
  function load(id,src){
    if(document.getElementById(id))return;
    var s=document.createElement('script');
    s.id=id;s.src=src;s.async=true;document.head.appendChild(s);
  }
  load('hasnaria-finance-accuracy-v6-js','/finance-accuracy-v6.js?v=1');
  load('hasnaria-stock-recall-v4-js','/stock-recall-v4.js?v=2');
})();
