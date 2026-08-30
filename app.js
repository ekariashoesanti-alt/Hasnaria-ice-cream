(function () {
  'use strict';
  var CORE = 'https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js';
  var STOCK = '/stock-monitor.js?v=13';
  var SALES = '/sales-board.js?v=2';
  function load(src, done) {
    var s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = function () { if (done) done(); };
    s.onerror = function () { console.error('Hasnaria module gagal dimuat:', src); if (done) done(); };
    document.head.appendChild(s);
  }
  function fixStockLayout() {
    var id = 'hasnaria-stock-layout-fix', st = document.getElementById(id);
    if (!st) { st = document.createElement('style'); st.id = id; document.head.appendChild(st); }
    st.textContent =
      '#stok .stk-form{display:grid!important;grid-template-columns:minmax(0,1.05fr) minmax(0,.82fr) minmax(0,.82fr) minmax(0,1.08fr) minmax(0,1.08fr) minmax(132px,.78fr)!important;column-gap:10px!important;row-gap:0!important;align-items:start!important;width:100%!important;max-width:100%!important;overflow:visible!important;background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;}' +
      '#stok .stk-form>*{min-width:0!important;max-width:100%!important;}' +
      '#stok .stk-form>.stk-buy{border:0!important;padding:0!important;background:transparent!important;border-radius:0!important;}' +
      '#stok .stk-form>.stk-save{grid-column:6!important;grid-row:1!important;width:100%!important;min-width:132px!important;max-width:100%!important;height:62px!important;margin:0!important;padding:0 8px!important;border-radius:12px!important;align-self:start!important;justify-self:stretch!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:15px!important;font-weight:800!important;line-height:1!important;}' +
      '#stok .stk-save .ico,#stok .stk-save small{display:none!important;}' +
      '#stok .stk-form>.stk-buy .stk-buy-row{height:56px!important;width:100%!important;max-width:100%!important;background:#fff!important;border:1.5px solid #bcc8c2!important;box-shadow:none!important;border-radius:12px!important;padding:0 12px!important;overflow:hidden!important;}' +
      '#stok .stk-form>.stk-buy .stk-buy-row:focus-within{border-color:#9cada4!important;box-shadow:0 0 0 1px rgba(156,173,164,.10)!important;}' +
      '#stok .stk-form>.stk-buy .stk-buy-row input{height:52px!important;padding:0!important;border:0!important;box-shadow:none!important;background:transparent!important;min-width:0!important;max-width:100%!important;}' +
      '#stok .stk-form>.stk-buy .unit{white-space:nowrap!important;font-size:14px!important;color:#6b7a74!important;}' +
      '#stok .stk-form>div>label{font-size:14px!important;font-weight:700!important;color:#13251d!important;margin-bottom:7px!important;white-space:nowrap!important;}' +
      '#stok .stk-form>div:nth-child(1) select,#stok .stk-form>div:nth-child(2)>input,#stok .stk-form>div:nth-child(3)>input{height:60px!important;width:100%!important;max-width:100%!important;border-radius:12px!important;}' +
      '#stok .stk-form>div:nth-child(2)>input,#stok .stk-form>div:nth-child(3)>input{background:#f7f9f8!important;font-weight:700!important;}' +
      '#stok .stk-form>.stk-buy .stk-hint{font-size:12px!important;line-height:1.25!important;margin-top:8px!important;padding:0!important;}' +
      '@media(max-width:1100px){#stok .stk-form{grid-template-columns:1fr 1fr!important;row-gap:12px!important;}#stok .stk-buy{grid-column:1/-1!important;}#stok .stk-save{grid-column:1/-1!important;grid-row:auto!important;width:100%!important;height:58px!important;}}' +
      '@media(max-width:700px){#stok .stk-form{grid-template-columns:1fr!important;}#stok .stk-buy{grid-column:auto!important;}#stok .stk-save{grid-column:auto!important;width:100%!important;}}';
    var host = document.getElementById('stok'); if (!host) return;
    var form = host.querySelector('.stk-form');
    if (form && window.innerWidth > 1100) {
      form.style.setProperty('display','grid','important');
      form.style.setProperty('grid-template-columns','minmax(0,1.05fr) minmax(0,.82fr) minmax(0,.82fr) minmax(0,1.08fr) minmax(0,1.08fr) minmax(132px,.78fr)','important');
      form.style.setProperty('gap','10px','important'); form.style.setProperty('width','100%','important'); form.style.setProperty('max-width','100%','important'); form.style.setProperty('box-sizing','border-box','important');
    }
    var qty = host.querySelector('#stkBuy'), qtyUnit = qty && qty.parentElement ? qty.parentElement.querySelector('.unit') : null;
    if (qtyUnit) qtyUnit.textContent = 'pcs';
    var price = host.querySelector('#stkBuyPrice'), priceBox = price && price.parentElement ? price.parentElement : null;
    if (priceBox) { var units = priceBox.querySelectorAll('.unit'); if (units.length) units[units.length - 1].textContent = '/ pcs'; }
  }
  function afterCore() {
    load(STOCK, function () { fixStockLayout(); setTimeout(fixStockLayout,150); setTimeout(fixStockLayout,500); setTimeout(fixStockLayout,1200); });
    load(SALES);
    document.addEventListener('click', function (e) {
      var b=e.target&&e.target.closest?e.target.closest('button'):null; if(!b)return;
      var id=b.id||'', watch=id==='sSave'||id==='oSave'||id==='cSave'||id==='lzSave'||id==='svOpen'||id==='svHand'||id==='svClose'||b.hasAttribute('data-stk')||b.hasAttribute('data-ok')||b.hasAttribute('data-no')||b.hasAttribute('data-lzok')||b.hasAttribute('data-lzno');
      if(!watch)return; if(b.getAttribute('data-busy')==='1'){e.preventDefault();e.stopImmediatePropagation();return;}
      b.setAttribute('data-busy','1'); setTimeout(function(){try{b.removeAttribute('data-busy');}catch(_){}},1800);
    },true);
  }
  load(CORE,afterCore);
})();
