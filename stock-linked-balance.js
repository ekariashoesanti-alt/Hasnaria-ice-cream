/* Hasnaria Stock — linked balance table enhancer
 * Makes the stock table explicitly show:
 * Stok Awal + Pembelian - Penjualan = Sisa Stok.
 * Uses the reconciled quantities already rendered by stock-reconcile-v2.js.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_STOCK_LINKED_BALANCE)return;
  window.__HASNARIA_STOCK_LINKED_BALANCE=true;

  function css(){
    if(document.getElementById('stock-linked-balance-css'))return;
    var s=document.createElement('style');
    s.id='stock-linked-balance-css';
    s.textContent=
      '#stok .sr-linked-formula{display:grid;grid-template-columns:minmax(110px,1fr) 22px minmax(125px,1fr) 22px minmax(125px,1fr) 22px minmax(120px,1fr);align-items:center;gap:6px;padding:9px 12px;border-bottom:1px solid #e7efeb;background:#f8fbf9}' +
      '#stok .sr-linked-step{min-width:0;border:1px solid #dce8e3;background:#fff;border-radius:10px;padding:7px 9px;display:flex;flex-direction:column;gap:2px}' +
      '#stok .sr-linked-step span{font-size:8px;font-weight:900;letter-spacing:.06em;color:#75847d;text-transform:uppercase}' +
      '#stok .sr-linked-step strong{font-size:11px;color:#153e32;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#stok button.sr-linked-step{cursor:pointer;text-align:left;font:inherit}' +
      '#stok button.sr-linked-step:hover{border-color:#8db8a8;background:#f2f8f5}' +
      '#stok .sr-linked-step.sr-linked-result{background:#eaf6f1;border-color:#b9d9cd}' +
      '#stok .sr-linked-step.sr-linked-result strong{color:#0f6d54;font-size:12px}' +
      '#stok .sr-linked-op{font-size:16px;font-weight:900;text-align:center;color:#819089}' +
      '#stok .sr-linked-th{background:#edf7f3!important;color:#155d49!important}' +
      '#stok .sr-linked-th small{display:block;margin-top:1px;font-size:7px;font-weight:700;color:#789087}' +
      '#stok .sr-linked-base{color:#53645d}' +
      '#stok .sr-linked-balance{background:#f2faf6;color:#0c7257;font-weight:900}' +
      '#stok .sr-linked-balance strong{font-size:12px}' +
      '#stok .sr-table tbody tr:hover .sr-linked-balance{background:#eaf6f1}' +
      '@media(max-width:900px){#stok .sr-linked-formula{grid-template-columns:1fr 18px 1fr;row-gap:6px}#stok .sr-linked-formula .sr-linked-result{grid-column:1/-1}#stok .sr-linked-formula .sr-linked-op:nth-of-type(3){display:none}}' +
      '@media(max-width:600px){#stok .sr-linked-formula{display:flex;overflow-x:auto;gap:6px;padding:8px}#stok .sr-linked-step{flex:0 0 145px}#stok .sr-linked-op{flex:0 0 18px}}';
    document.head.appendChild(s);
  }

  function parseIdNumber(value){
    var t=String(value==null?'':value).trim();
    if(!t)return 0;
    var neg=t.indexOf('-')>=0;
    t=t.replace(/[^0-9.,]/g,'').replace(/\./g,'').replace(',','.');
    var n=Number(t);
    if(!Number.isFinite(n))return 0;
    return neg?-n:n;
  }

  function fmt(value){
    var n=Number(value);
    if(!Number.isFinite(n))return '-';
    return n.toLocaleString('id-ID',{maximumFractionDigits:2});
  }

  function findStockTable(host){
    var tables=host.querySelectorAll('.sr-table');
    for(var i=0;i<tables.length;i++){
      var text=String(tables[i].querySelector('thead')&&tables[i].querySelector('thead').textContent||'');
      if(text.indexOf('Pembelian')>=0&&text.indexOf('Penjualan')>=0&&text.indexOf('Stok Sistem')>=0)return tables[i];
      if(text.indexOf('Stok Awal')>=0&&text.indexOf('Sisa Stok')>=0)return tables[i];
    }
    return null;
  }

  function addFormula(card){
    if(!card||card.querySelector('.sr-linked-formula'))return;
    var wrap=document.createElement('div');
    wrap.className='sr-linked-formula';
    wrap.innerHTML=
      '<div class="sr-linked-step"><span>Baseline</span><strong>Stok Awal</strong></div>'+
      '<div class="sr-linked-op">+</div>'+
      '<button type="button" class="sr-linked-step" data-sr-jump="pembelian"><span>Data masuk</span><strong>Pembelian</strong></button>'+
      '<div class="sr-linked-op">−</div>'+
      '<button type="button" class="sr-linked-step" data-sr-jump="sales"><span>Data keluar</span><strong>Penjualan</strong></button>'+
      '<div class="sr-linked-op">=</div>'+
      '<div class="sr-linked-step sr-linked-result"><span>Saldo otomatis</span><strong>Sisa Stok</strong></div>';
    var head=card.querySelector('.sr-table-head');
    if(head&&head.nextSibling)card.insertBefore(wrap,head.nextSibling);else card.insertBefore(wrap,card.firstChild);
  }

  function enhance(){
    var host=document.getElementById('stok');
    if(!host||host.classList.contains('hidden'))return;
    css();
    var table=findStockTable(host);
    if(!table)return;
    var card=table.closest('.sr-table-card');
    addFormula(card);

    var head=card&&card.querySelector('.sr-table-head');
    if(head){
      var strong=head.querySelector('strong');
      var desc=head.querySelector('div span');
      if(strong)strong.textContent='Sisa Stok Terhubung';
      if(desc)desc.textContent='Stok Awal + Pembelian − Pemakaian Penjualan = Sisa Stok';
    }

    if(table.dataset.linkedBalance==='1')return;
    var ths=table.querySelectorAll('thead th');
    if(ths.length<8)return;

    var baselineTh=document.createElement('th');
    baselineTh.className='sr-linked-th';
    baselineTh.innerHTML='Stok Awal<small>baseline</small>';
    ths[0].parentNode.insertBefore(baselineTh,ths[1]);

    ths=table.querySelectorAll('thead th');
    if(ths[2])ths[2].innerHTML='+ Pembelian<small>masuk</small>';
    if(ths[3])ths[3].innerHTML='− Penjualan<small>pemakaian</small>';
    if(ths[4]){ths[4].innerHTML='Sisa Stok<small>otomatis</small>';ths[4].classList.add('sr-linked-th');}

    var rows=table.querySelectorAll('tbody tr');
    rows.forEach(function(row){
      var cells=row.children;
      if(cells.length===1&&cells[0].classList.contains('sr-empty')){
        cells[0].colSpan=9;
        return;
      }
      if(cells.length<8)return;
      var purchase=Math.abs(parseIdNumber(cells[1].textContent));
      var sales=Math.abs(parseIdNumber(cells[2].textContent));
      var balance=parseIdNumber(cells[3].textContent);
      var baseline=balance-purchase+sales;
      var td=document.createElement('td');
      td.className='sr-num sr-linked-base';
      td.innerHTML='<strong>'+fmt(baseline)+'</strong>';
      row.insertBefore(td,cells[1]);
      row.children[2].classList.add('sr-plus');
      row.children[3].classList.add('sr-minus');
      row.children[4].classList.add('sr-linked-balance');
    });
    table.dataset.linkedBalance='1';
  }

  var timer=0;
  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(enhance,45);
  }

  function watch(){
    var host=document.getElementById('stok');
    if(!host||host.__linkedBalanceObserver)return;
    host.__linkedBalanceObserver=new MutationObserver(schedule);
    host.__linkedBalanceObserver.observe(host,{childList:true,subtree:true});
  }

  document.addEventListener('click',function(e){
    var tab=e.target&&e.target.closest?e.target.closest('[data-tab="stok"],.tab'):null;
    if(!tab)return;
    var id=tab.getAttribute('data-tab');
    if(id==='stok'||(!id&&String(tab.textContent||'').toLowerCase().indexOf('stok')>=0))setTimeout(function(){watch();enhance();},90);
  },true);

  css();
  setTimeout(function(){watch();enhance();},250);
  setTimeout(enhance,900);
})();
