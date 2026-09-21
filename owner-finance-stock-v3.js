/* Compatibility shim: old Owner finance/stock entry now delegates to the fast lazy loader. */
(function(){
  'use strict';
  if(window.__HASNARIA_FINANCE_STOCK_FAST_V3)return;
  var id='hasnaria-finance-stock-fast-v3-js';
  if(document.getElementById(id))return;
  var s=document.createElement('script');
  s.id=id;
  s.src='/finance-stock-fast-v3.js?v=2';
  s.async=true;
  document.head.appendChild(s);
})();
