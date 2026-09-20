(function(){
  'use strict';
  if(window.__HASNARIA_FINANCE_STOCK_V2)return;
  window.__HASNARIA_FINANCE_STOCK_V2=true;

  var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var db=null,cache=null,loading=null,timer=0;
  var S={period:'',financeView:'pl',stockGroup:'raw',stockPage:1,stockPerPage:16};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){var n=Number(v);return isFinite(n)?n:0;}
  function clean(v){return String(v==null?'':v).trim().replace(/\s+/g,' ');}
  function monthKey(v){return /^\d{4}-\d{2}/.test(String(v||''))?String(v).slice(0,7):'';}
  function monthLabel(p){if(!/^\d{4}-\d{2}$/.test(String(p||'')))return'—';return MONTHS[Number(p.slice(5,7))-1]+' '+p.slice(0,4);}
  function dateLabel(v){var s=String(v||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return'—';var a=s.split('-');return Number(a[2])+' '+MONTHS[Number(a[1])-1].slice(0,3)+' '+a[0];}
  function rawObj(r){if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;if(r&&typeof r.raw_data==='string'){try{return JSON.parse(r.raw_data);}catch(_){}}return{};}
  function money(v){var n=num(v),a=Math.abs(n);if(a>=1e9)return'Rp '+(n/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(n/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(n/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+n.toLocaleString('id-ID',{maximumFractionDigits:0});}
  function qty(v){return num(v).toLocaleString('id-ID',{maximumFractionDigits:2});}

  function addCss(){if(document.getElementById('hasnaria-finance-stock-v2-css'))return;var l=document.createElement('link');l.id='hasnaria-finance-stock-v2-css';l.rel='stylesheet';l.href='/finance-stock-v2.css?v=1';document.head.appendChild(l);}
  function waitDb(){return new Promise(function(resolve,reject){var n=0;(function tick(){db=db||window.__HASNARIA_DB||null;if(db)return resolve(db);if(n++>150)return reject(new Error('Database belum siap'));setTimeout(tick,100);})();});}

  async function paged(table,select,build){
    var out=[],from=0,size=1000;
    while(true){
      var q=db.from(table).select(select).range(from,from+size-1);
      if(build)q=build(q);
      var r=await q;
      if(r.error)throw r.error;
      var rows=r.data||[];out=out.concat(rows);
      if(rows.length<size)break;
      from+=size;
      if(from>30000)break;
    }
    return out;
  }

  function loadData(force){
    if(cache&&!force)return Promise.resolve(cache);
    if(loading)return loading;
    loading=waitDb().then(function(){
      return Promise.all([
        paged('finance_daily_summary','brand_id,metric_date,revenue,cogs,operating_expense,operating_profit,sales_cash_in,supplier_payments,net_cash_movement,cogs_coverage_pct',function(q){return q.eq('brand_id',BRAND).order('metric_date',{ascending:true});}),
        paged('sales','id,sold_at,total_amount,cash_amount,qris_amount,tf_amount,channel',function(q){return q.eq('brand_id',BRAND).order('sold_at',{ascending:true});}),
        paged('offline_purchase_history','id,source_period,purchase_date,item_name,total_amount,payment_method,raw_data',function(q){return q.eq('brand_id',BRAND).order('purchase_date',{ascending:true});}),
        paged('expenses','id,expense_date,category,amount,status,notes,source_history_id',function(q){return q.eq('brand_id',BRAND).order('expense_date',{ascending:true});}),
        paged('inventory_purchase_log','id,inventory_item_id,purchase_date,qty,unit_cost,total_amount,source_history_id',function(q){return q.eq('brand_id',BRAND).order('purchase_date',{ascending:true});}),
        paged('inventory_stock_reconciliation','brand_id,inventory_item_id,item_name,category,unit,min_qty,order_qty,baseline_date,baseline_qty,purchase_qty,sales_usage_qty,system_qty,last_opname_date,last_physical_qty,last_variance,tracking_active,status',function(q){return q.eq('brand_id',BRAND).order('category',{ascending:true}).order('item_name',{ascending:true});}),
        paged('purchase_inventory_bridge','id,source_period,purchase_date,item_name,inventory_item_id,inventory_qty,ready_for_inventory,mapping_status,rule_type',function(q){return q.eq('brand_id',BRAND);}),
        paged('finance_accounts','code,name,account_type,active',function(q){return q.eq('brand_id',BRAND).eq('active',true).order('code',{ascending:true});})
      ]);
    }).then(function(r){cache={finance:r[0],sales:r[1],purchases:r[2],expenses:r[3],inventoryLogs:r[4],stock:r[5],bridge:r[6],accounts:r[7]};return cache;}).finally(function(){loading=null;});
    return loading;
  }

  function validExpense(r){return['recorded','approved'].indexOf(String(r.status||'recorded'))>=0;}
  function periods(d){var m={};d.finance.forEach(function(r){var p=monthKey(r.metric_date);if(p)m[p]=1;});d.purchases.forEach(function(r){var p=monthKey(r.purchase_date||r.source_period);if(p)m[p]=1;});d.expenses.forEach(function(r){var p=monthKey(r.expense_date);if(p)m[p]=1;});return Object.keys(m).sort();}
  function selectedPeriod(d){var p=periods(d);if(!S.period||p.indexOf(S.period)<0)S.period=p.length?p[p.length-1]:'';return S.period;}

  function purchaseClassification(d,p){
    var exp={},inv={};
    d.expenses.forEach(function(x){if(validExpense(x)&&x.source_history_id)exp[x.source_history_id]=1;});
    d.inventoryLogs.forEach(function(x){if(x.source_history_id)inv[x.source_history_id]=1;});
    var rows=d.purchases.filter(function(x){return monthKey(x.purchase_date||x.source_period)===p;});
    var out={all:rows,inventory:[],expense:[],pending:[],total:0,inventoryTotal:0,expenseTotal:0,pendingTotal:0};
    rows.forEach(function(x){var a=num(x.total_amount);out.total+=a;if(exp[x.id]){out.expense.push(x);out.expenseTotal+=a;}else if(inv[x.id]){out.inventory.push(x);out.inventoryTotal+=a;}else{out.pending.push(x);out.pendingTotal+=a;}});
    return out;
  }

  function financeMetrics(d,p){
    var rows=d.finance.filter(function(x){return monthKey(x.metric_date)===p;}),revenue=0,cogs=0,opex=0,weighted=0,weight=0;
    rows.forEach(function(x){var rev=num(x.revenue);revenue+=rev;cogs+=num(x.cogs);opex+=num(x.operating_expense);if(rev>0){weighted+=num(x.cogs_coverage_pct)*rev;weight+=rev;}});
    var coverage=weight?weighted/weight:0,gross=revenue-cogs,profit=gross-opex,pc=purchaseClassification(d,p);
    return{rows:rows,revenue:revenue,cogs:cogs,opex:opex,gross:gross,profit:profit,coverage:coverage,purchases:pc};
  }

  function accountName(d,code){var a=d.accounts.find(function(x){return String(x.code)===String(code);});if(a)return a.name;return({'1000':'Cash','1100':'Bank / QRIS Settlement','1300':'Inventory','2000':'Accounts Payable','4000':'Sales Revenue','5000':'Cost of Goods Sold','6000':'Operating Expenses'})[code]||('Account '+code);}
  function creditAccountForPurchase(r){var m=String(r.payment_method||'').toLowerCase();if(/tunai|cash/.test(m))return'1000';if(/qris|bank|transfer|tf/.test(m))return'1100';return'2000';}

  function journal(d,p){
    var lines=[],seq=0,pc=purchaseClassification(d,p),purchaseById={};
    pc.all.forEach(function(x){purchaseById[x.id]=x;});
    function add(date,ref,desc,code,debit,credit,source){lines.push({seq:++seq,date:date,ref:ref,desc:desc,code:String(code),account:accountName(d,String(code)),debit:num(debit),credit:num(credit),source:source||''});}
    var daily={};
    d.sales.filter(function(x){return monthKey(x.sold_at)===p;}).forEach(function(x){var k=x.sold_at;if(!daily[k])daily[k]={total:0,cash:0,bank:0};daily[k].total+=num(x.total_amount);daily[k].cash+=num(x.cash_amount);daily[k].bank+=num(x.qris_amount)+num(x.tf_amount);});
    Object.keys(daily).sort().forEach(function(dt){var x=daily[dt],known=x.cash+x.bank,rest=Math.max(0,x.total-known),ref='SALE-'+dt.replace(/-/g,'');if(x.cash+rest>0)add(dt,ref,'Penerimaan penjualan tunai','1000',x.cash+rest,0,'Penjualan');if(x.bank>0)add(dt,ref,'Penerimaan QRIS / transfer','1100',x.bank,0,'Penjualan');add(dt,ref,'Pendapatan penjualan','4000',0,x.total,'Penjualan');});
    d.expenses.filter(function(x){return validExpense(x)&&monthKey(x.expense_date)===p;}).forEach(function(x,i){var ref='EXP-'+String(i+1).padStart(3,'0'),src=x.source_history_id&&purchaseById[x.source_history_id],credit=src?creditAccountForPurchase(src):'1000';add(x.expense_date,ref,clean(x.category||'Beban operasional'),'6000',x.amount,0,'Pengeluaran');add(x.expense_date,ref,'Lawan transaksi beban',credit,0,x.amount,'Pengeluaran');});
    pc.inventory.forEach(function(x,i){var raw=rawObj(x),ref=clean(raw.invoice_no)||('INV-'+String(i+1).padStart(3,'0')),dt=x.purchase_date||x.source_period;add(dt,ref,'Pembelian persediaan — '+clean(x.item_name),'1300',x.total_amount,0,'Pembelian Persediaan');add(dt,ref,'Lawan pembelian persediaan',creditAccountForPurchase(x),0,x.total_amount,'Pembelian Persediaan');});
    d.finance.filter(function(x){return monthKey(x.metric_date)===p&&num(x.cogs)>0;}).forEach(function(x){var ref='COGS-'+String(x.metric_date).replace(/-/g,'');add(x.metric_date,ref,'Pengakuan HPP','5000',x.cogs,0,'HPP');add(x.metric_date,ref,'Pengurangan persediaan akibat HPP','1300',0,x.cogs,'HPP');});
    return lines.sort(function(a,b){return String(a.date).localeCompare(String(b.date))||a.seq-b.seq;});
  }

  function normalCredit(code){return['2000','3000','4000'].indexOf(String(code))>=0;}
  function ledgerGroups(d,lines){var g={};lines.forEach(function(x){if(!g[x.code])g[x.code]={code:x.code,name:x.account,debit:0,credit:0,rows:[]};g[x.code].debit+=x.debit;g[x.code].credit+=x.credit;g[x.code].rows.push(x);});return Object.keys(g).sort().map(function(code){var x=g[code],bal=0;x.detail=x.rows.map(function(r){bal+=normalCredit(code)?r.credit-r.debit:r.debit-r.credit;return Object.assign({},r,{balance:bal});});x.balance=bal;return x;});}

  function pnlRows(f){
    var provisional=f.coverage<95;
    return '<div class="fsv2-pl">'+
      '<div class="fsv2-pl-row"><span>Pendapatan Penjualan</span><strong>'+money(f.revenue)+'</strong></div>'+
      '<div class="fsv2-pl-row"><span>Harga Pokok Penjualan terverifikasi</span><strong>('+money(f.cogs)+')</strong></div>'+
      '<div class="fsv2-pl-row sub"><span>Laba Kotor'+(provisional?' (sementara)':'')+'</span><strong>'+money(f.gross)+'</strong></div>'+
      '<div class="fsv2-pl-row"><span>Beban Operasional</span><strong>('+money(f.opex)+')</strong></div>'+
      '<div class="fsv2-pl-row total '+(f.profit<0?'neg':'')+'"><span>Laba (Rugi) Usaha'+(provisional?' *':'')+'</span><strong>'+money(f.profit)+'</strong></div>'+
    '</div>';
  }

  function financeHtml(d){
    var p=selectedPeriod(d),ps=periods(d),f=financeMetrics(d,p),margin=f.revenue?f.profit/f.revenue*100:0,provisional=f.coverage<95;
    return '<div class="fsv2-shell" data-fsv2="finance">'+
      '<div class="fsv2-head"><div><div class="fsv2-eyebrow">FINANCIAL REPORTING</div><h1>Keuangan</h1><p>Laba rugi, jurnal umum, dan buku besar dari data backend Hasnaria.</p></div><div class="fsv2-head-right"><label class="fsv2-field"><span>Periode</span><select id="fsv2Period">'+ps.map(function(x){return'<option value="'+esc(x)+'"'+(x===p?' selected':'')+'>'+esc(monthLabel(x))+'</option>';}).join('')+'</select></label><button class="fsv2-btn ghost" data-fsv2-refresh="1">↻ Refresh</button></div></div>'+
      '<div class="fsv2-pl-grid"><article class="fsv2-report"><div class="fsv2-report-title"><div><small>HASNARIA TERRACE</small><h2>Laporan Laba Rugi</h2><p>Periode '+esc(monthLabel(p))+' · basis akrual sederhana / SAK EMKM-style</p></div><span class="fsv2-badge '+(provisional?'warn':'')+'">'+(provisional?'HPP belum lengkap':'Siap review')+'</span></div>'+
      '<div class="fsv2-kpis"><div class="fsv2-kpi"><span>Pendapatan</span><strong>'+money(f.revenue)+'</strong></div><div class="fsv2-kpi"><span>HPP Terverifikasi</span><strong>'+money(f.cogs)+'</strong></div><div class="fsv2-kpi"><span>Laba Usaha'+(provisional?'*':'')+'</span><strong class="'+(f.profit<0?'neg':'')+'">'+money(f.profit)+'</strong></div><div class="fsv2-kpi"><span>Margin'+(provisional?'*':'')+'</span><strong>'+margin.toLocaleString('id-ID',{maximumFractionDigits:1})+'%</strong></div></div>'+pnlRows(f)+
      '<div class="fsv2-reconcile"><div class="fsv2-recon"><span>Pembelian → Persediaan</span><strong>'+money(f.purchases.inventoryTotal)+'</strong><small>'+f.purchases.inventory.length+' baris sudah terhubung ke stok</small></div><div class="fsv2-recon"><span>Pembelian → Beban</span><strong>'+money(f.purchases.expenseTotal)+'</strong><small>'+f.purchases.expense.length+' baris sudah diklasifikasi sebagai beban</small></div><div class="fsv2-recon"><span>Menunggu Klasifikasi</span><strong>'+money(f.purchases.pendingTotal)+'</strong><small>'+f.purchases.pending.length+' baris belum diposting ke persediaan / beban</small></div></div>'+
      (provisional?'<div class="fsv2-note warn"><b>Catatan akuntansi:</b> HPP belum lengkap (coverage '+f.coverage.toLocaleString('id-ID',{maximumFractionDigits:1})+'%). Pembelian persediaan tidak langsung dibebankan ke laba rugi; nilainya masuk aset Persediaan sampai pemakaian/HPP terverifikasi. Angka laba bertanda * masih sementara.</div>':'<div class="fsv2-note"><b>Catatan:</b> pembelian persediaan dicatat sebagai aset dan baru menjadi HPP saat dikonsumsi/terjual. Ini mencegah pembelian stok periode berjalan langsung menekan laba rugi.</div>')+
      '</article><aside class="fsv2-side"><button class="fsv2-btn" data-fsv2-view="journal"><b>Jurnal</b><small>Debit / kredit per transaksi</small></button><button class="fsv2-btn" data-fsv2-view="ledger"><b>Ledger</b><small>Buku besar per akun</small></button><div class="fsv2-side-card"><b>Chart of Accounts</b><p>1000 Cash · 1100 Bank/QRIS · 1300 Inventory · 2000 AP · 4000 Sales Revenue · 5000 COGS · 6000 Operating Expenses.</p></div></aside></div>'+financeOverlay(d,p)+'</div>';
  }

  function financeOverlay(d,p){
    if(S.financeView==='pl')return'';
    var lines=journal(d,p),debit=lines.reduce(function(a,x){return a+x.debit;},0),credit=lines.reduce(function(a,x){return a+x.credit;},0),body='';
    if(S.financeView==='journal'){
      body='<div class="fsv2-journal-summary"><span class="fsv2-mini">Total Debit <b>'+money(debit)+'</b></span><span class="fsv2-mini">Total Kredit <b>'+money(credit)+'</b></span><span class="fsv2-mini">Selisih <b>'+money(debit-credit)+'</b></span></div><div class="fsv2-table-wrap"><table class="fsv2-table"><thead><tr><th>Tanggal</th><th>Referensi</th><th>Keterangan</th><th>Akun</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead><tbody>'+lines.map(function(x){return'<tr><td>'+esc(dateLabel(x.date))+'</td><td>'+esc(x.ref)+'</td><td>'+esc(x.desc)+'</td><td>'+esc(x.code+' · '+x.account)+'</td><td class="num">'+(x.debit?money(x.debit):'—')+'</td><td class="num">'+(x.credit?money(x.credit):'—')+'</td></tr>';}).join('')+'</tbody></table></div>';
    }else{
      var groups=ledgerGroups(d,lines);body='<div class="fsv2-ledger-list">'+groups.map(function(g){return'<details class="fsv2-ledger-card"><summary><div><b>'+esc(g.code+' · '+g.name)+'</b><span>'+g.rows.length+' baris jurnal</span></div><span>D '+money(g.debit)+' · K '+money(g.credit)+'</span><strong>'+money(g.balance)+'</strong></summary><div class="fsv2-table-wrap"><table class="fsv2-table"><thead><tr><th>Tanggal</th><th>Referensi</th><th>Keterangan</th><th class="num">Debit</th><th class="num">Kredit</th><th class="num">Saldo</th></tr></thead><tbody>'+g.detail.map(function(x){return'<tr><td>'+esc(dateLabel(x.date))+'</td><td>'+esc(x.ref)+'</td><td>'+esc(x.desc)+'</td><td class="num">'+(x.debit?money(x.debit):'—')+'</td><td class="num">'+(x.credit?money(x.credit):'—')+'</td><td class="num">'+money(x.balance)+'</td></tr>';}).join('')+'</tbody></table></div></details>';}).join('')+'</div>';
    }
    return'<div class="fsv2-overlay"><div class="fsv2-modal"><div class="fsv2-modal-head"><div><h2>'+(S.financeView==='journal'?'Jurnal Umum':'Ledger / Buku Besar')+'</h2><p>'+esc(monthLabel(p))+' · sumber: penjualan, pengeluaran, persediaan, dan HPP terverifikasi</p></div><button class="fsv2-close" data-fsv2-close="1">×</button></div><div class="fsv2-modal-body">'+body+'</div></div></div>';
  }

  function stockGroup(r){var c=String(r.category||'').toUpperCase(),n=String(r.item_name||'').toUpperCase();if(/KEMASAN|ATK|PERLENGKAP|SUPPL|CLEAN|KEBERSIHAN/.test(c+' '+n))return'supplies';return'raw';}
  function stockStatus(r){if(!r.tracking_active)return'untracked';if(String(r.status)==='critical'||num(r.system_qty)<=0)return'critical';if(String(r.status)==='order'||(num(r.min_qty)>0&&num(r.system_qty)<num(r.min_qty)))return'reorder';return'ok';}
  function statusLabel(s){return s==='critical'?'Kritis / Habis':s==='reorder'?'Stok Minim':s==='ok'?'Aman':'Belum Dipantau';}
  function statusChip(s){return'<span class="fsv2-status '+s+'">'+statusLabel(s)+'</span>';}

  function pendingByInventory(d){var posted={};d.inventoryLogs.forEach(function(x){if(x.source_history_id)posted[x.source_history_id]=1;});var out={};d.bridge.forEach(function(x){if(!x.ready_for_inventory||!x.inventory_item_id||posted[x.id])return;out[x.inventory_item_id]=(out[x.inventory_item_id]||0)+num(x.inventory_qty);});return out;}
  function stockRows(d,group){var p=pendingByInventory(d);return d.stock.filter(function(r){return stockGroup(r)===group;}).map(function(r){var x=Object.assign({},r);x.pending_purchase_qty=p[r.inventory_item_id]||0;x._status=stockStatus(x);return x;}).sort(function(a,b){var rank={critical:0,reorder:1,untracked:2,ok:3},ra=rank[a._status],rb=rank[b._status];return ra-rb||String(a.item_name||'').localeCompare(String(b.item_name||''),'id');});}

  function stockHtml(d){
    var raw=stockRows(d,'raw'),sup=stockRows(d,'supplies'),rows=S.stockGroup==='raw'?raw:sup,totalPages=Math.max(1,Math.ceil(rows.length/S.stockPerPage));if(S.stockPage>totalPages)S.stockPage=totalPages;var pageRows=rows.slice((S.stockPage-1)*S.stockPerPage,S.stockPage*S.stockPerPage);
    var all=raw.concat(sup),critical=all.filter(function(x){return x._status==='critical';}).length,low=all.filter(function(x){return x._status==='reorder';}).length,untracked=all.filter(function(x){return x._status==='untracked';}).length,pending=all.reduce(function(a,x){return a+num(x.pending_purchase_qty);},0);
    var body=pageRows.map(function(r){var st=r._status,rowClass=st==='critical'?'critical':st==='reorder'?'low':st==='untracked'?'untracked':'',stock=r.tracking_active?qty(r.system_qty):'—',projected=r.tracking_active?qty(num(r.system_qty)+num(r.pending_purchase_qty)):'—';return'<tr class="'+rowClass+'"><td class="item"><b>'+esc(r.item_name)+'</b><small>'+esc(r.category||'—')+'</small></td><td>'+esc(r.unit||'pcs')+'</td><td class="num">'+(r.tracking_active?qty(r.baseline_qty):'—')+'</td><td class="num">'+(r.tracking_active?('+'+qty(r.purchase_qty)):'—')+(r.pending_purchase_qty>0?'<small style="display:block;color:#9a6800">+'+qty(r.pending_purchase_qty)+' pending</small>':'')+'</td><td class="num">'+(r.tracking_active?('-'+qty(r.sales_usage_qty)):'—')+'</td><td class="num"><b>'+stock+'</b></td><td class="num">'+projected+'</td><td class="num">'+(num(r.min_qty)>0?qty(r.min_qty):'—')+'</td><td>'+statusChip(st)+'</td></tr>';}).join('');
    return'<div class="fsv2-shell" data-fsv2="stock"><div class="fsv2-head"><div><div class="fsv2-eyebrow">INVENTORY CONTROL</div><h1>Stok</h1><p>Ketersediaan persediaan berbasis baseline/opname + pembelian − pemakaian dari penjualan.</p></div><div class="fsv2-head-right"><button class="fsv2-btn ghost" data-fsv2-refresh="1">↻ Refresh</button></div></div>'+
      '<div class="fsv2-stock-kpis"><div class="fsv2-stock-kpi"><span>Total Item</span><strong>'+all.length.toLocaleString('id-ID')+'</strong></div><div class="fsv2-stock-kpi danger"><span>Kritis / Habis</span><strong>'+critical.toLocaleString('id-ID')+'</strong></div><div class="fsv2-stock-kpi warn"><span>Stok Minim</span><strong>'+low.toLocaleString('id-ID')+'</strong></div><div class="fsv2-stock-kpi"><span>Belum Dipantau</span><strong>'+untracked.toLocaleString('id-ID')+'</strong></div></div>'+
      '<div class="fsv2-stock-tabs"><button data-fsv2-stock="raw" class="'+(S.stockGroup==='raw'?'on':'')+'">Bahan Baku <small>'+raw.length+'</small></button><button data-fsv2-stock="supplies" class="'+(S.stockGroup==='supplies'?'on':'')+'">Perlengkapan / ATK <small>'+sup.length+'</small></button></div>'+
      '<article class="fsv2-stock-card"><div class="fsv2-stock-card-head"><div><h2>'+(S.stockGroup==='raw'?'Stok Bahan Baku':'Stok Perlengkapan / ATK')+'</h2><p>'+(S.stockGroup==='raw'?'Makanan, minuman, ice cream, bumbu, dan bahan produksi.':'Kemasan, perlengkapan, supplies, kebersihan, dan ATK yang tercatat sebagai persediaan.')+'</p></div><div class="legend"><i class="r"></i>Kritis <i class="y"></i>Minim <i class="g"></i>Aman <i class="x"></i>Belum dipantau</div></div>'+
      '<div class="fsv2-table-wrap"><table class="fsv2-table"><thead><tr><th>Item</th><th>Unit</th><th class="num">Baseline</th><th class="num">+ Pembelian</th><th class="num">- Pemakaian</th><th class="num">Stok Sistem</th><th class="num">Proyeksi*</th><th class="num">Min.</th><th>Status</th></tr></thead><tbody>'+(body||'<tr><td colspan="9" class="fsv2-empty">Belum ada item di kelompok ini.</td></tr>')+'</tbody></table></div>'+
      '<div class="fsv2-pager"><span>Halaman '+S.stockPage+' / '+totalPages+' · '+rows.length+' item'+(pending>0?' · ada pembelian yang menunggu posting stok':'')+'</span><div><button data-fsv2-page="prev" '+(S.stockPage<=1?'disabled':'')+'>← Sebelumnya</button><button data-fsv2-page="next" '+(S.stockPage>=totalPages?'disabled':'')+'>Berikutnya →</button></div></div>'+
      '<div class="fsv2-note"><b>*Proyeksi</b> = Stok Sistem + pembelian yang sudah berhasil dimapping ke item tetapi belum diposting ke ledger stok. Item “Belum Dipantau” belum mempunyai baseline/opname yang valid sehingga sistem tidak menampilkan angka stok palsu.</div></article></div>';
  }

  function renderFinance(force){var host=document.getElementById('ops');if(!host)return;loadData(force).then(function(d){if(!host.isConnected)return;host.innerHTML=financeHtml(d);}).catch(function(e){host.innerHTML='<div class="fsv2-shell"><div class="fsv2-note warn">Gagal memuat Keuangan: '+esc(e&&e.message?e.message:e)+'</div></div>';});}
  function renderStock(force){var host=document.getElementById('stok');if(!host)return;loadData(force).then(function(d){if(!host.isConnected)return;host.innerHTML=stockHtml(d);}).catch(function(e){host.innerHTML='<div class="fsv2-shell"><div class="fsv2-note warn">Gagal memuat Stok: '+esc(e&&e.message?e.message:e)+'</div></div>';});}
  function schedule(kind,delay){clearTimeout(timer);timer=setTimeout(function(){if(kind==='finance')renderFinance(false);else if(kind==='stock')renderStock(false);else{var a=document.getElementById('ops'),s=document.getElementById('stok');if(a&&!a.classList.contains('hidden'))renderFinance(false);if(s&&!s.classList.contains('hidden'))renderStock(false);}},delay==null?120:delay);}

  function bind(){
    document.addEventListener('change',function(e){if(e.target&&e.target.id==='fsv2Period'){S.period=e.target.value;S.financeView='pl';renderFinance(false);}},true);
    document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('button,[data-tab]'):null;if(!t)return;
      if(t.hasAttribute('data-fsv2-view')){S.financeView=t.getAttribute('data-fsv2-view');renderFinance(false);return;}
      if(t.hasAttribute('data-fsv2-close')){S.financeView='pl';renderFinance(false);return;}
      if(t.hasAttribute('data-fsv2-stock')){S.stockGroup=t.getAttribute('data-fsv2-stock');S.stockPage=1;renderStock(false);return;}
      if(t.hasAttribute('data-fsv2-page')){var dir=t.getAttribute('data-fsv2-page');S.stockPage=Math.max(1,S.stockPage+(dir==='next'?1:-1));renderStock(false);return;}
      if(t.hasAttribute('data-fsv2-refresh')){cache=null;loading=null;if(document.getElementById('ops')&&!document.getElementById('ops').classList.contains('hidden'))renderFinance(true);if(document.getElementById('stok')&&!document.getElementById('stok').classList.contains('hidden'))renderStock(true);return;}
      var tab=t.getAttribute('data-tab');if(tab==='ops'){setTimeout(function(){renderFinance(false);},120);setTimeout(function(){renderFinance(false);},650);setTimeout(function(){renderFinance(false);},1300);}else if(tab==='stok'){setTimeout(function(){renderStock(false);},120);setTimeout(function(){renderStock(false);},650);setTimeout(function(){renderStock(false);},1300);}
    },true);
  }

  function observeHost(id,kind){var host=document.getElementById(id);if(!host)return false;var obs=new MutationObserver(function(){if(host.classList.contains('hidden'))return;var marker=host.querySelector('[data-fsv2="'+(kind==='finance'?'finance':'stock')+'"]');if(!marker)schedule(kind,80);});obs.observe(host,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});return true;}
  function boot(){addCss();bind();var tries=0;(function wait(){var a=observeHost('ops','finance'),b=observeHost('stok','stock');db=db||window.__HASNARIA_DB||null;if(a&&b&&db){var oh=document.getElementById('ops'),sh=document.getElementById('stok');if(oh&&!oh.classList.contains('hidden'))renderFinance(false);if(sh&&!sh.classList.contains('hidden'))renderStock(false);return;}if(tries++<160)setTimeout(wait,100);})();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
