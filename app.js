(function () {
  'use strict';
  var CORE = 'https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js';
  var STOCK = '/stock-monitor.js?v=5';
  function load(src, done) { var s = document.createElement('script'); s.src = src; s.async = false; s.onload = function () { if (done) done(); }; s.onerror = function () { console.error('Hasnaria module gagal dimuat:', src); if (done) done(); }; document.head.appendChild(s); }
  function fixStockLayout() {
    var id='hasnaria-stock-layout-fix', st=document.getElementById(id);
    if(!st){st=document.createElement('style');st.id=id;document.head.appendChild(st);}
    st.textContent='#stok .stk-form{display:grid!important;grid-template-columns:minmax(145px,1.05fr) minmax(125px,.78fr) minmax(125px,.78fr) minmax(220px,1.30fr) minmax(170px,.88fr) 112px!important;gap:10px!important;align-items:start!important;width:100%!important}#stok .stk-form>.stk-save{grid-column:6!important;grid-row:1!important;align-self:stretch!important;justify-self:stretch!important;width:112px!important;min-width:112px!important;height:70px!important;margin:0!important}#stok .stk-form>.stk-buy{min-width:0!important}#stok .stk-buy-row,#stok .stk-buy-row input{min-width:0!important}#stok .stk-buy-row .unit{white-space:nowrap!important}@media(max-width:1100px){#stok .stk-form{grid-template-columns:1fr 1fr!important}#stok .stk-buy{grid-column:1/-1!important}#stok .stk-save{grid-column:1/-1!important;grid-row:auto!important;width:100%!important;height:58px!important}}@media(max-width:700px){#stok .stk-form{grid-template-columns:1fr!important}#stok .stk-buy{grid-column:auto!important}#stok .stk-save{grid-column:auto!important;width:100%!important}}';
    var host=document.getElementById('stok'); if(!host)return;
    var qty=host.querySelector('#stkBuy'), qu=qty&&qty.parentElement?qty.parentElement.querySelector('.unit'):null; if(qu)qu.textContent='pcs';
    var price=host.querySelector('#stkBuyPrice'), pb=price&&price.parentElement?price.parentElement:null; if(pb){var us=pb.querySelectorAll('.unit');if(us.length)us[us.length-1].textContent='/ pcs';}
  }
  function afterCore(){load(STOCK,function(){fixStockLayout();new MutationObserver(function(){fixStockLayout();}).observe(document.body,{childList:true,subtree:true});});document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var id=b.id||'',watch=id==='sSave'||id==='oSave'||id==='cSave'||id==='lzSave'||id==='svOpen'||id==='svHand'||id==='svClose'||b.hasAttribute('data-stk')||b.hasAttribute('data-ok')||b.hasAttribute('data-no')||b.hasAttribute('data-lzok')||b.hasAttribute('data-lzno');if(!watch)return;if(b.getAttribute('data-busy')==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.setAttribute('data-busy','1');setTimeout(function(){try{b.removeAttribute('data-busy');}catch(_){ }},1800);},true);}
  load(CORE,afterCore);
})();
