/* Compatibility shim: Owner Finance uses stable v6 with canonical Purchase-journal management reporting; Stock uses canonical Stock Control v3. */
(function(){
  'use strict';
  window.__HASNARIA_OWNER_FINSTOCK_V3=true;
  function load(id,src){
    if(document.getElementById(id))return;
    var s=document.createElement('script');
    s.id=id;s.src=src;s.async=true;document.head.appendChild(s);
  }
  load('hasnaria-finance-accuracy-v6-js','/finance-accuracy-v6.js?v=2');
  load('hasnaria-finance-purchase-basis-v1-js','/finance-purchase-basis-v1.js?v=3');
  load('hasnaria-stock-v3-runtime-fix-js','/stock-v3-runtime-fix.js?v=1');
})();