(function () {
  'use strict';
  var CORE = 'https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js';
  var STOCK = '/stock-monitor.js?v=24';
  var SALES = '/sales-board.js?v=7';
  var SALES_UI = '/sales-ui-patch.js?v=4';
  function load(src, done) { var s=document.createElement('script'); s.src=src; s.async=false; s.onload=function(){if(done)done();}; s.onerror=function(){console.error('Hasnaria module gagal dimuat:',src);if(done)done();}; document.head.appendChild(s); }
  function fixStockLayout() { var host=document.getElementById('stok');if(!host)return;var form=host.querySelector('.stk-form');if(form){form.style.minWidth='0';form.style.maxWidth='100%';}var qty=host.querySelector('#stkBuy'),price=host.querySelector('#stkBuyPrice'),priceBox=price&&price.parentElement;if(priceBox){var units=priceBox.querySelectorAll('.unit');if(units.length)units[units.length-1].textContent='/ pcs';} }
  function afterCore() {
    load(STOCK,function(){fixStockLayout();setTimeout(fixStockLayout,150);setTimeout(fixStockLayout,500);setTimeout(fixStockLayout,1200);});
    load(SALES,function(){load(SALES_UI);});
    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var id=b.id||'',watch=id==='sSave'||id==='oSave'||id==='cSave'||id==='lzSave'||id==='svOpen'||id==='svHand'||id==='svClose'||b.hasAttribute('data-stk')||b.hasAttribute('data-ok')||b.hasAttribute('data-no')||b.hasAttribute('data-lzok')||b.hasAttribute('data-lzno');if(!watch)return;if(b.getAttribute('data-busy')==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.setAttribute('data-busy','1');setTimeout(function(){try{b.removeAttribute('data-busy');}catch(_){}},1800);},true);
  }
  load(CORE,afterCore);
})();
