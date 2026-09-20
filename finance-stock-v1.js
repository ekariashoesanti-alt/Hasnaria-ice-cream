(function(){
  'use strict';
  if(window.__HASNARIA_FINANCE_STOCK_V1)return;
  window.__HASNARIA_FINANCE_STOCK_V1=true;

  var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var db=null,cache=null,loading=null,timer=0;
  var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var stockState={group:'raw',page:1,perPage:12};
  var financeState={period:'',view:'pl',ledgerAccount:'1000'};

  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function num(v){var n=Number(v);return isFinite(n)?n:0;}
  function clean(v){return String(v==null?'':v).trim().replace(/\s+/g,' ');}
  function rawObj(r){if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;if(r&&typeof r.raw_data==='string'){try{return JSON.parse(r.raw_data);}catch(_){}}return{};}
  function fmtMoney(v){var n=num(v),a=Math.abs(n);if(a>=1e9)return'Rp '+(n/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(n/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(n/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+n.toLocaleString('id-ID',{maximumFractionDigits:0});}
  function fmtQty(v){return num(v).toLocaleString('id-ID',{maximumFractionDigits:2});}
  function monthKey(d){return /^\d{4}-\d{2}/.test(String(d||''))?String(d).slice(0,7):'';}
  function monthLabel(p){if(!/^\d{4}-\d{2}$/.test(String(p||'')))return'—';return MONTHS[Number(p.slice(5,7))-1]+' '+p.slice(0,4);}
  function dateLabel(d){if(!/^\d{4}-\d{2}-\d{2}/.test(String(d||'')))return'—';var x=String(d).slice(0,10).split('-');return x[2]+' '+MONTHS[Number(x[1])-1].slice(0,3)+' '+x[0];}
  function safeId(v){return String(v||'').replace(/[^a-zA-Z0-9_-]/g,'');}

  function addCss(){
    if(document.getElementById('hasnaria-finance-stock-v1-css'))return;
    var l=document.createElement('link');l.id='hasnaria-finance-stock-v1-css';l.rel='stylesheet';l.href='/finance-stock-v1.css?v=1';document.head.appendChild(l);
  }

  function waitDb(){
    return new Promise(function(resolve,reject){var n=0;(function tick(){db=db||window.__HASNARIA_DB||null;if(db)return resolve(db);if(n++>150)return reject(new Error('Database belum siap'));setTimeout(tick,100);})();});
  }

  function loadData(force){
    if(cache&&!force)return Promise.resolve(cache);
    if(loading)return loading;
    loading=waitDb().then(function(){
      return Promise.all([
        db.from('sales').select('id,sold_at,total_amount,cash_amount,qris_amount,tf_amount,channel').eq('brand_id',BRAND).order('sold_at',{ascending:true}).limit(10000),
        db.from('offline_purchase_history').select('id,source_period,purchase_date,item_name,total_amount,payment_method,raw_data').eq('brand_id',BRAND).order('purchase_date',{ascending:true}).limit(10000),
        db.from('expenses').select('id,expense_date,category,amount,status,notes,source_history_id').eq('brand_id',BRAND).order('expense_date',{ascending:true}).limit(10000),
        db.from('finance_accounts').select('code,name,account_type').eq('brand_id',BRAND).eq('active',true).order('code',{ascending:true}),
        db.from('ui_inventory_items').select('brand_id,inventory_item_id,item_name,category,unit,min_qty,order_qty,baseline_date,baseline_qty,net_movement,ledger_qty,tracking_active,status,ui_status').order('category',{ascending:true}).order('item_name',{ascending:true}).limit(1000)
      ]);
    }).then(function(res){
      res.forEach(function(r){if(r.error)throw r.error;});
      cache={sales:res[0].data||[],purchases:res[1].data||[],expenses:res[2].data||[],accounts:res[3].data||[],inventory:res[4].data||[]};
      return cache;
    }).finally(function(){loading=null;});
    return loading;
  }

  function purchaseGroup(r){
    var raw=rawObj(r),g=clean(raw.analytics_group||'');
    if(g)return g;
    var c=(clean(raw.analytics_category||'')+' '+clean(r.item_name)).toUpperCase();
    if(/INVEST|ASET|MESIN|FURNITURE|FREEZER/.test(c))return'Investasi';
    if(/GAJI|KARYAWAN|SERAGAM/.test(c))return'Karyawan';
    if(/ATK|ADMIN|KERTAS|PRINT|PULPEN/.test(c))return'Administrasi';
    return'Operasi';
  }
  function isExpenseValid(r){return r&&['recorded','approved'].indexOf(String(r.status||'recorded'))>=0;}
  function paymentCreditAccount(p){
    var m=String(p.payment_method||'').toLowerCase();
    if(/cash|tunai/.test(m))return'1000';
    if(/qris|transfer|bank|tf/.test(m))return'1100';
    return'2000';
  }
  function accountName(code,data){
    var a=(data.accounts||[]).find(function(x){return String(x.code)===String(code);});
    if(a)return a.name;
    var fall={'1000':'Cash','1100':'Bank / QRIS Settlement','1300':'Inventory / Asset','2000':'Accounts Payable','4000':'Sales Revenue','5000':'Cost of Goods Sold','6000':'Operating Expenses'};
    return fall[code]||('Account '+code);
  }

  function periods(data){
    var s={};
    data.sales.forEach(function(r){var p=monthKey(r.sold_at);if(p)s[p]=1;});
    data.purchases.forEach(function(r){var p=monthKey(r.purchase_date||r.source_period);if(p)s[p]=1;});
    data.expenses.forEach(function(r){var p=monthKey(r.expense_date);if(p)s[p]=1;});
    return Object.keys(s).sort();
  }

  function monthFinance(data,p){
    var sales=data.sales.filter(function(r){return monthKey(r.sold_at)===p;});
    var purchases=data.purchases.filter(function(r){return monthKey(r.purchase_date||r.source_period)===p;});
    var expenses=data.expenses.filter(function(r){return monthKey(r.expense_date)===p&&isExpenseValid(r)&&!r.source_history_id;});
    var revenue=sales.reduce(function(a,r){return a+num(r.total_amount);},0);
    var purchase={Operasi:0,Administrasi:0,Karyawan:0,Investasi:0};
    purchases.forEach(function(r){var g=purchaseGroup(r);purchase[g]=(purchase[g]||0)+num(r.total_amount);});
    var extraOpex=0,extraEmployee=0,extraCapex=0;
    expenses.forEach(function(r){var c=String(r.category||'').toLowerCase(),v=num(r.amount);if(/invest|asset|aset/.test(c))extraCapex+=v;else if(/employee|salary|wage|gaji|kepegawaian/.test(c))extraEmployee+=v;else extraOpex+=v;});
    var cogs=purchase.Operasi;
    var gross=revenue-cogs;
    var admin=purchase.Administrasi;
    var employee=purchase.Karyawan+extraEmployee;
    var other=extraOpex;
    var opex=admin+employee+other;
    var profit=gross-opex;
    var capex=purchase.Investasi+extraCapex;
    return{sales:sales,purchases:purchases,expenses:expenses,revenue:revenue,cogs:cogs,gross:gross,admin:admin,employee:employee,other:other,opex:opex,profit:profit,capex:capex,purchase:purchase};
  }

  function journalFor(data,p){
    var f=monthFinance(data,p),lines=[],seq=0;
    function add(date,ref,desc,code,debit,credit,source){lines.push({seq:++seq,date:date,ref:ref,desc:desc,code:code,account:accountName(code,data),debit:num(debit),credit:num(credit),source:source||''});}
    var daily={};
    f.sales.forEach(function(r){var d=r.sold_at;if(!daily[d])daily[d]={total:0,cash:0,bank:0};daily[d].total+=num(r.total_amount);daily[d].cash+=num(r.cash_amount);daily[d].bank+=num(r.qris_amount)+num(r.tf_amount);});
    Object.keys(daily).sort().forEach(function(d){var x=daily[d],known=x.cash+x.bank,rest=Math.max(0,x.total-known);if(x.cash+rest>0)add(d,'SALE-'+d.replace(/-/g,''),'Penjualan '+dateLabel(d),'1000',x.cash+rest,0,'Penjualan');if(x.bank>0)add(d,'SALE-'+d.replace(/-/g,''),'Penjualan QRIS/Transfer '+dateLabel(d),'1100',x.bank,0,'Penjualan');add(d,'SALE-'+d.replace(/-/g,''),'Pendapatan penjualan '+dateLabel(d),'4000',0,x.total,'Penjualan');});
    f.purchases.forEach(function(r,i){var d=r.purchase_date||r.source_period,g=purchaseGroup(r),amt=num(r.total_amount),raw=rawObj(r),ref=clean(raw.invoice_no)||('BUY-'+(i+1)),debitCode=g==='Investasi'?'1300':(g==='Operasi'?'5000':'6000'),desc=(g==='Investasi'?'Belanja investasi':g==='Operasi'?'Pembelian operasional / HPP':'Beban '+g)+' — '+clean(r.item_name);add(d,ref,desc,debitCode,amt,0,'Pembelian');add(d,ref,'Lawan transaksi '+clean(r.item_name),paymentCreditAccount(r),0,amt,'Pembelian');});
    f.expenses.forEach(function(r,i){var d=r.expense_date,amt=num(r.amount),ref='EXP-'+String(i+1).padStart(3,'0');add(d,ref,clean(r.category||'Beban operasional'), '6000',amt,0,'Pengeluaran');add(d,ref,'Pembayaran beban','1000',0,amt,'Pengeluaran');});
    return lines.sort(function(a,b){return String(a.date).localeCompare(String(b.date))||a.seq-b.seq;});
  }

  function ledgerRows(lines,code){
    var a=lines.filter(function(x){return String(x.code)===String(code);}),bal=0,normalCredit=['2000','3000','4000'].indexOf(String(code))>=0;
    return a.map(function(x){bal+=normalCredit?(x.credit-x.debit):(x.debit-x.credit);return Object.assign({},x,{balance:bal});});
  }

  function pnlRows(f){
    return '<div class="fs-pl-table">'+
      '<div class="fs-pl-row fs-main"><span>Pendapatan Penjualan</span><strong>'+fmtMoney(f.revenue)+'</strong></div>'+
      '<div class="fs-pl-row"><span>HPP / Pembelian Operasional</span><strong>('+fmtMoney(f.cogs)+')</strong></div>'+
      '<div class="fs-pl-row fs-subtotal"><span>Laba Kotor</span><strong>'+fmtMoney(f.gross)+'</strong></div>'+
      '<div class="fs-pl-row"><span>Beban Administrasi</span><strong>('+fmtMoney(f.admin)+')</strong></div>'+
      '<div class="fs-pl-row"><span>Beban Karyawan</span><strong>('+fmtMoney(f.employee)+')</strong></div>'+
      '<div class="fs-pl-row"><span>Beban Operasional Lainnya</span><strong>('+fmtMoney(f.other)+')</strong></div>'+
      '<div class="fs-pl-row fs-total '+(f.profit<0?'neg':'pos')+'"><span>Laba (Rugi) Usaha</span><strong>'+fmtMoney(f.profit)+'</strong></div>'+
    '</div>';
  }

  function financeHtml(data){
    var ps=periods(data);if(!financeState.period||ps.indexOf(financeState.period)<0)financeState.period=ps.length?ps[ps.length-1]:'';
    var f=monthFinance(data,financeState.period),margin=f.revenue?f.profit/f.revenue*100:0;
    return '<div class="fs-finance-shell">'+
      '<div class="fs-page-head"><div><span class="fs-eyebrow">FINANCIAL REPORTING</span><h1>Keuangan</h1><p>Laporan laba rugi sederhana berbasis data penjualan dan pengeluaran backend.</p></div><label class="fs-period"><span>Periode</span><select id="fsFinancePeriod">'+ps.map(function(p){return'<option value="'+p+'" '+(p===financeState.period?'selected':'')+'>'+esc(monthLabel(p))+'</option>';}).join('')+'</select></label></div>'+
      '<div class="fs-finance-layout">'+
        '<article class="fs-report-page">'+
          '<div class="fs-report-title"><div><small>HASNARIA TERRACE</small><h2>Laporan Laba Rugi</h2><p>Periode '+esc(monthLabel(financeState.period))+'</p></div><div class="fs-report-badge">UMKM · Internal</div></div>'+
          '<div class="fs-kpis"><div><span>Pendapatan</span><strong>'+fmtMoney(f.revenue)+'</strong></div><div><span>Laba Kotor</span><strong>'+fmtMoney(f.gross)+'</strong></div><div><span>Laba Usaha</span><strong class="'+(f.profit<0?'fs-red':'')+'">'+fmtMoney(f.profit)+'</strong></div><div><span>Margin Usaha</span><strong>'+margin.toLocaleString('id-ID',{maximumFractionDigits:1})+'%</strong></div></div>'+
          pnlRows(f)+
          '<div class="fs-report-note"><b>Catatan:</b> belanja investasi '+fmtMoney(f.capex)+' tidak dibebankan ke laba rugi. HPP sementara memakai pembelian operasional karena HPP berbasis resep/unit cost belum terverifikasi penuh.</div>'+
        '</article>'+
        '<aside class="fs-report-actions"><button type="button" data-fs-view="journal"><span>Jurnal</span><small>Debit / kredit transaksi</small></button><button type="button" data-fs-view="ledger"><span>Ledger</span><small>Buku besar per akun</small></button><div class="fs-coa"><b>Chart of Accounts</b><small>1000 Cash · 1100 Bank/QRIS · 1300 Inventory/Asset · 2000 AP · 4000 Revenue · 5000 COGS · 6000 Expense</small></div></aside>'+
      '</div>'+modalHtml(data)+'</div>';
  }

  function modalHtml(data){
    if(financeState.view==='pl')return'';
    var lines=journalFor(data,financeState.period),title=financeState.view==='journal'?'Jurnal Umum':'Ledger / Buku Besar';
    var body='';
    if(financeState.view==='journal'){
      body='<div class="fs-table-wrap"><table class="fs-table"><thead><tr><th>Tanggal</th><th>Referensi</th><th>Keterangan</th><th>Akun</th><th>Debit</th><th>Kredit</th></tr></thead><tbody>'+lines.map(function(x){return'<tr><td>'+esc(dateLabel(x.date))+'</td><td>'+esc(x.ref)+'</td><td>'+esc(x.desc)+'</td><td>'+esc(x.code+' · '+x.account)+'</td><td class="num">'+(x.debit?fmtMoney(x.debit):'—')+'</td><td class="num">'+(x.credit?fmtMoney(x.credit):'—')+'</td></tr>';}).join('')+'</tbody></table></div>';
    }else{
      var accts=(data.accounts||[]).filter(function(a){return['1000','1100','1300','2000','4000','5000','6000'].indexOf(String(a.code))>=0;});
      if(!accts.length)accts=[{code:'1000',name:'Cash'},{code:'1100',name:'Bank / QRIS Settlement'},{code:'1300',name:'Inventory / Asset'},{code:'2000',name:'Accounts Payable'},{code:'4000',name:'Sales Revenue'},{code:'5000',name:'Cost of Goods Sold'},{code:'6000',name:'Operating Expenses'}];
      if(!financeState.ledgerAccount||!accts.some(function(a){return String(a.code)===String(financeState.ledgerAccount);}))financeState.ledgerAccount=String(accts[0].code);
      var lr=ledgerRows(lines,financeState.ledgerAccount);
      body='<div class="fs-ledger-select"><label>Akun<select id="fsLedgerAccount">'+accts.map(function(a){return'<option value="'+esc(a.code)+'" '+(String(a.code)===String(financeState.ledgerAccount)?'selected':'')+'>'+esc(a.code+' · '+a.name)+'</option>';}).join('')+'</select></label><div><span>Saldo akhir periode</span><strong>'+fmtMoney(lr.length?lr[lr.length-1].balance:0)+'</strong></div></div><div class="fs-table-wrap"><table class="fs-table"><thead><tr><th>Tanggal</th><th>Referensi</th><th>Keterangan</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr></thead><tbody>'+(lr.length?lr.map(function(x){return'<tr><td>'+esc(dateLabel(x.date))+'</td><td>'+esc(x.ref)+'</td><td>'+esc(x.desc)+'</td><td class="num">'+(x.debit?fmtMoney(x.debit):'—')+'</td><td class="num">'+(x.credit?fmtMoney(x.credit):'—')+'</td><td class="num"><b>'+fmtMoney(x.balance)+'</b></td></tr>';}).join(''):'<tr><td colspan="6" class="fs-empty">Belum ada transaksi pada akun ini.</td></tr>')+'</tbody></table></div>';
    }
    return'<div class="fs-modal"><div class="fs-modal-card"><div class="fs-modal-head"><div><span class="fs-eyebrow">'+esc(monthLabel(financeState.period))+'</span><h2>'+title+'</h2></div><button type="button" data-fs-close aria-label="Tutup">×</button></div>'+body+'</div></div>';
  }

  function stockGroup(cat){var c=String(cat||'').toUpperCase();if(/KEMASAN|ATK|PERLENGKAP|SUPPL|CLEAN|KEBERSIHAN/.test(c))return'supplies';return'raw';}
  function stockStatus(r){if(!r.tracking_active)return'untracked';if(String(r.ui_status)==='critical'||String(r.status)==='critical'||num(r.ledger_qty)<=0)return'critical';if(String(r.ui_status)==='reorder'||String(r.status)==='order'||(num(r.min_qty)>0&&num(r.ledger_qty)<num(r.min_qty)))return'reorder';return'ok';}
  function stockStatusLabel(s){return s==='critical'?'Kritis':s==='reorder'?'Minim':s==='ok'?'Aman':'Belum dipantau';}
  function stockRows(data,group){return(data.inventory||[]).filter(function(r){return stockGroup(r.category)===group;}).sort(function(a,b){var rank={critical:0,reorder:1,untracked:2,ok:3},ra=rank[stockStatus(a)],rb=rank[stockStatus(b)];return ra-rb||String(a.item_name).localeCompare(String(b.item_name));});}

  function stockHtml(data){
    var rows=stockRows(data,stockState.group),totalPages=Math.max(1,Math.ceil(rows.length/stockState.perPage));if(stockState.page>totalPages)stockState.page=totalPages;if(stockState.page<1)stockState.page=1;
    var pageRows=rows.slice((stockState.page-1)*stockState.perPage,stockState.page*stockState.perPage);
    var low=rows.filter(function(r){var s=stockStatus(r);return s==='critical'||s==='reorder';}).length,tracked=rows.filter(function(r){return r.tracking_active;}).length;
    var body=pageRows.map(function(r){var s=stockStatus(r),qty=r.tracking_active?fmtQty(r.ledger_qty):'—';return'<tr class="fs-stock-'+s+'"><td><b>'+esc(r.item_name)+'</b><small>'+esc(r.category||'—')+'</small></td><td>'+esc(r.unit||'pcs')+'</td><td class="num"><b>'+qty+'</b></td><td class="num">'+(num(r.min_qty)>0?fmtQty(r.min_qty):'—')+'</td><td class="num">'+(num(r.order_qty)>0?fmtQty(r.order_qty):'—')+'</td><td><span class="fs-status '+s+'">'+stockStatusLabel(s)+'</span></td><td>'+esc(r.baseline_date?dateLabel(r.baseline_date):'—')+'</td></tr>';}).join('');
    var pages=[];for(var i=1;i<=totalPages;i++){if(i===1||i===totalPages||Math.abs(i-stockState.page)<=1)pages.push('<button type="button" data-fs-page="'+i+'" class="'+(i===stockState.page?'on':'')+'">'+i+'</button>');else if(pages[pages.length-1]!=='<span>…</span>')pages.push('<span>…</span>');}
    return'<div class="fs-stock-shell">'+
      '<div class="fs-page-head"><div><span class="fs-eyebrow">INVENTORY CONTROL</span><h1>Stok</h1><p>Ketersediaan stok dihitung dari baseline/opname + pembelian − pemakaian penjualan.</p></div><div class="fs-stock-summary"><div><span>Dipantau</span><strong>'+tracked+'/'+rows.length+'</strong></div><div><span>Stok Minim</span><strong class="'+(low?'fs-red':'')+'">'+low+'</strong></div></div></div>'+ 
      '<div class="fs-stock-tabs"><button type="button" data-fs-stock-group="raw" class="'+(stockState.group==='raw'?'on':'')+'">Bahan Baku</button><button type="button" data-fs-stock-group="supplies" class="'+(stockState.group==='supplies'?'on':'')+'">Perlengkapan / ATK</button></div>'+ 
      '<article class="fs-stock-card"><div class="fs-stock-card-head"><div><h2>'+(stockState.group==='raw'?'Stok Bahan Baku':'Stok Perlengkapan / ATK')+'</h2><p>'+(stockState.group==='raw'?'Makanan, minuman, ice cream, bumbu dan bahan produksi.':'Kemasan, perlengkapan, supplies dan ATK yang tercatat sebagai persediaan.')+'</p></div><span>'+rows.length+' item</span></div><div class="fs-table-wrap"><table class="fs-table fs-stock-table"><thead><tr><th>Item</th><th>Satuan</th><th>Stok Saat Ini</th><th>Min.</th><th>Order</th><th>Status</th><th>Baseline/Opname</th></tr></thead><tbody>'+(body||'<tr><td colspan="7" class="fs-empty">Belum ada item pada kategori ini.</td></tr>')+'</tbody></table></div><div class="fs-pager"><button type="button" data-fs-prev '+(stockState.page<=1?'disabled':'')+'>‹</button><div>'+pages.join('')+'</div><button type="button" data-fs-next '+(stockState.page>=totalPages?'disabled':'')+'>›</button><span>Halaman '+stockState.page+' / '+totalPages+'</span></div></article>'+ 
      '<div class="fs-stock-note"><b>Highlight stok:</b> <span class="fs-dot critical"></span>Kritis ≤ 0 · <span class="fs-dot reorder"></span>Minim &lt; minimum · <span class="fs-dot ok"></span>Aman. Item “Belum dipantau” belum memiliki baseline/opname fisik sehingga sistem tidak mengarang saldo.</div>'+ 
    '</div>';
  }

  function renderFinance(data){var host=document.getElementById('ops');if(!host||host.classList.contains('hidden'))return;if(host.querySelector('.fs-finance-shell'))return;host.innerHTML=financeHtml(data);}
  function rerenderFinance(data){var host=document.getElementById('ops');if(!host)return;host.innerHTML=financeHtml(data);}
  function renderStock(data){var host=document.getElementById('stok');if(!host||host.classList.contains('hidden'))return;if(host.querySelector('.fs-stock-shell'))return;host.innerHTML=stockHtml(data);}
  function rerenderStock(data){var host=document.getElementById('stok');if(!host)return;host.innerHTML=stockHtml(data);}

  function wireEvents(){
    document.addEventListener('change',function(e){
      if(e.target&&e.target.id==='fsFinancePeriod'){financeState.period=e.target.value;financeState.view='pl';loadData().then(rerenderFinance);}
      if(e.target&&e.target.id==='fsLedgerAccount'){financeState.ledgerAccount=e.target.value;loadData().then(rerenderFinance);}
    },true);
    document.addEventListener('click',function(e){
      var b=e.target&&e.target.closest?e.target.closest('[data-fs-view],[data-fs-close],[data-fs-stock-group],[data-fs-page],[data-fs-prev],[data-fs-next],[data-tab="ops"],[data-tab="stok"]'):null;if(!b)return;
      if(b.hasAttribute('data-fs-view')){financeState.view=b.getAttribute('data-fs-view');loadData().then(rerenderFinance);return;}
      if(b.hasAttribute('data-fs-close')){financeState.view='pl';loadData().then(rerenderFinance);return;}
      if(b.hasAttribute('data-fs-stock-group')){stockState.group=b.getAttribute('data-fs-stock-group');stockState.page=1;loadData().then(rerenderStock);return;}
      if(b.hasAttribute('data-fs-page')){stockState.page=Number(b.getAttribute('data-fs-page'))||1;loadData().then(rerenderStock);return;}
      if(b.hasAttribute('data-fs-prev')){stockState.page=Math.max(1,stockState.page-1);loadData().then(rerenderStock);return;}
      if(b.hasAttribute('data-fs-next')){stockState.page+=1;loadData().then(rerenderStock);return;}
      if(b.getAttribute('data-tab')==='ops'||b.getAttribute('data-tab')==='stok'){setTimeout(refresh,120);}
    },true);
  }

  function observe(){
    var app=document.getElementById('app');if(!app)return;
    var mo=new MutationObserver(function(muts){if(muts.some(function(m){return m.type==='childList'||(m.type==='attributes'&&m.attributeName==='class');}))schedule(60);});
    mo.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }
  function schedule(ms){clearTimeout(timer);timer=setTimeout(refresh,ms||50);}
  function refresh(){loadData().then(function(data){renderFinance(data);renderStock(data);}).catch(function(e){console.warn('Finance/Stock v1:',e&&e.message?e.message:e);});}
  function boot(){addCss();wireEvents();observe();schedule(200);setInterval(function(){var o=document.getElementById('ops'),s=document.getElementById('stok');if((o&&!o.classList.contains('hidden')&&!o.querySelector('.fs-finance-shell'))||(s&&!s.classList.contains('hidden')&&!s.querySelector('.fs-stock-shell')))schedule(20);},800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
