(function(){
  'use strict';
  if(window.__HASNARIA_FINANCE_STOCK_V3)return;
  window.__HASNARIA_FINANCE_STOCK_V3=true;
  window.__HASNARIA_FINANCE_STOCK_V2=true;

  var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var db=null;
  var financeCache=null,stockCache=null,detailCache={};
  var state={period:'',financeView:'pl',ledgerCode:'',stockGroup:'raw',stockPage:1,perPage:15};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function n(v){var x=Number(v);return isFinite(x)?x:0;}
  function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0});}
  function qty(v){return n(v).toLocaleString('id-ID',{maximumFractionDigits:2});}
  function monthKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):'';}
  function monthLabel(p){if(!/^\d{4}-\d{2}$/.test(String(p||'')))return'—';return MONTHS[Number(p.slice(5,7))-1]+' '+p.slice(0,4);}
  function dateLabel(v){var s=String(v||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return'—';var a=s.split('-');return Number(a[2])+' '+MONTHS[Number(a[1])-1].slice(0,3)+' '+a[0];}
  function rawObj(r){if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;if(r&&typeof r.raw_data==='string'){try{return JSON.parse(r.raw_data);}catch(_){}}return{};}
  function nextMonth(p){var y=Number(p.slice(0,4)),m=Number(p.slice(5,7));m++;if(m===13){m=1;y++;}return y+'-'+String(m).padStart(2,'0')+'-01';}
  function startMonth(p){return p+'-01';}

  function ensureCss(){if(document.getElementById('hasnaria-finance-stock-v3-css'))return;var l=document.createElement('link');l.id='hasnaria-finance-stock-v3-css';l.rel='stylesheet';l.href='/finance-stock-v3.css?v=1';document.head.appendChild(l);}
  function waitDb(){return new Promise(function(resolve,reject){var i=0;(function tick(){db=db||window.__HASNARIA_DB||null;if(db)return resolve(db);if(i++>80)return reject(new Error('Database belum siap'));setTimeout(tick,75);})();});}

  function skeleton(title){return '<div class="fsv3-shell"><div class="fsv3-skeleton-head"><div><span></span><b>'+esc(title)+'</b><i></i></div><em></em></div><div class="fsv3-skeleton-grid"><div></div><div></div><div></div></div><div class="fsv3-skeleton-panel"></div></div>';}
  function showError(host,title,e,retry){host.innerHTML='<div class="fsv3-shell"><div class="fsv3-error"><b>'+esc(title)+'</b><span>'+esc(e&&e.message?e.message:String(e||'Gagal memuat data'))+'</span><button type="button" data-fsv3-retry="'+retry+'">Coba lagi</button></div></div>';}

  async function loadFinance(force){
    if(financeCache&&!force)return financeCache;
    await waitDb();
    var pair=await Promise.all([
      db.from('finance_daily_summary').select('metric_date,revenue,cogs,operating_expense,operating_profit,cogs_coverage_pct').eq('brand_id',BRAND).order('metric_date',{ascending:true}),
      db.from('finance_accounts').select('code,name,account_type').eq('brand_id',BRAND).eq('active',true).order('code',{ascending:true})
    ]);
    pair.forEach(function(r){if(r.error)throw r.error;});
    financeCache={summary:pair[0].data||[],accounts:pair[1].data||[]};
    return financeCache;
  }

  async function loadStock(force){
    if(stockCache&&!force)return stockCache;
    await waitDb();
    var r=await db.from('inventory_stock_reconciliation').select('inventory_item_id,item_name,category,unit,min_qty,order_qty,baseline_date,baseline_qty,purchase_qty,sales_usage_qty,system_qty,last_opname_date,last_physical_qty,last_variance,tracking_active,status').eq('brand_id',BRAND).order('category',{ascending:true}).order('item_name',{ascending:true}).limit(1000);
    if(r.error)throw r.error;
    stockCache=r.data||[];
    return stockCache;
  }

  function financePeriods(data){var m={};(data.summary||[]).forEach(function(r){var p=monthKey(r.metric_date);if(p)m[p]=1;});return Object.keys(m).sort();}
  function financeMetrics(data,p){var rows=(data.summary||[]).filter(function(r){return monthKey(r.metric_date)===p;}),rev=0,cogs=0,opex=0,covNum=0,covDen=0;rows.forEach(function(r){var rv=n(r.revenue);rev+=rv;cogs+=n(r.cogs);opex+=n(r.operating_expense);if(rv>0){covNum+=n(r.cogs_coverage_pct)*rv;covDen+=rv;}});var gross=rev-cogs,profit=gross-opex;return{revenue:rev,cogs:cogs,opex:opex,gross:gross,profit:profit,margin:rev?profit/rev*100:0,coverage:covDen?covNum/covDen:0};}

  function financePage(data){
    var periods=financePeriods(data);if(!state.period||periods.indexOf(state.period)<0)state.period=periods.length?periods[periods.length-1]:'';
    var f=financeMetrics(data,state.period),prov=f.coverage<95;
    return '<div class="fsv3-shell">'+
      '<div class="fsv3-head"><div><div class="fsv3-eyebrow">FINANCIAL REPORTING</div><h1>Keuangan</h1><p>Laporan laba rugi UMKM, jurnal umum dan buku besar dari backend Hasnaria.</p></div><div class="fsv3-head-actions"><label><span>Periode</span><select id="fsv3Period">'+periods.map(function(p){return'<option value="'+p+'"'+(p===state.period?' selected':'')+'>'+monthLabel(p)+'</option>';}).join('')+'</select></label><button type="button" data-fsv3-refresh="finance">↻ Refresh</button></div></div>'+ 
      '<div class="fsv3-fin-grid"><article class="fsv3-report"><div class="fsv3-report-title"><div><small>HASNARIA TERRACE</small><h2>Laporan Laba Rugi</h2><p>Periode '+esc(monthLabel(state.period))+'</p></div><span class="fsv3-pill '+(prov?'warn':'ok')+'">'+(prov?'HPP belum lengkap':'Siap review')+'</span></div>'+ 
      '<div class="fsv3-kpis"><div><span>Pendapatan</span><strong>'+money(f.revenue)+'</strong></div><div><span>HPP</span><strong>'+money(f.cogs)+'</strong></div><div><span>Laba Usaha</span><strong class="'+(f.profit<0?'neg':'')+'">'+money(f.profit)+'</strong></div><div><span>Margin</span><strong>'+f.margin.toLocaleString('id-ID',{maximumFractionDigits:1})+'%</strong></div></div>'+ 
      '<div class="fsv3-pl"><div><span>Pendapatan Penjualan</span><b>'+money(f.revenue)+'</b></div><div><span>Harga Pokok Penjualan</span><b>('+money(f.cogs)+')</b></div><div class="sub"><span>Laba Kotor</span><b>'+money(f.gross)+'</b></div><div><span>Beban Operasional</span><b>('+money(f.opex)+')</b></div><div class="total '+(f.profit<0?'neg':'')+'"><span>Laba (Rugi) Usaha'+(prov?' *':'')+'</span><b>'+money(f.profit)+'</b></div></div>'+ 
      '<div class="fsv3-note"><b>Catatan.</b> Laba bertanda * masih sementara bila cakupan HPP belum lengkap. Nilai tidak dipaksa dari total pembelian agar persediaan tidak langsung dianggap beban.</div></article>'+ 
      '<aside class="fsv3-side"><button type="button" data-fsv3-finview="journal"><span>Jurnal Umum</span><small>Lihat debit/kredit transaksi periode ini</small><b>→</b></button><button type="button" data-fsv3-finview="ledger"><span>Ledger / Buku Besar</span><small>Saldo per akun dan riwayat mutasi</small><b>→</b></button><div class="fsv3-coa"><span>Chart of Accounts</span><small>1000 Kas · 1100 Bank/QRIS · 1300 Persediaan · 2000 Utang · 4000 Pendapatan · 5000 HPP · 6000 Beban</small></div></aside></div><div id="fsv3FinanceDetail"></div></div>';
  }

  async function loadFinanceDetail(p,force){
    var key=p;if(detailCache[key]&&!force)return detailCache[key];
    await waitDb();var from=startMonth(p),to=nextMonth(p);
    var q=await Promise.all([
      db.from('sales').select('id,sold_at,total_amount,cash_amount,qris_amount,tf_amount,channel').eq('brand_id',BRAND).gte('sold_at',from).lt('sold_at',to).order('sold_at',{ascending:true}).limit(3000),
      db.from('offline_purchase_history').select('id,purchase_date,source_period,item_name,total_amount,payment_method,raw_data').eq('brand_id',BRAND).gte('purchase_date',from).lt('purchase_date',to).order('purchase_date',{ascending:true}).limit(3000),
      db.from('expenses').select('id,expense_date,category,amount,status,notes,source_history_id').eq('brand_id',BRAND).gte('expense_date',from).lt('expense_date',to).order('expense_date',{ascending:true}).limit(3000),
      db.from('inventory_purchase_log').select('source_history_id,purchase_date,total_amount').eq('brand_id',BRAND).gte('purchase_date',from).lt('purchase_date',to).limit(3000)
    ]);q.forEach(function(r){if(r.error)throw r.error;});
    detailCache[key]={sales:q[0].data||[],purchases:q[1].data||[],expenses:q[2].data||[],inventory:q[3].data||[]};return detailCache[key];
  }

  function accountName(code){var f=financeCache&&financeCache.accounts||[],x=f.find(function(a){return String(a.code)===String(code);});if(x)return x.name;return{'1000':'Kas','1100':'Bank / QRIS','1300':'Persediaan','2000':'Utang Usaha','4000':'Pendapatan Penjualan','5000':'Harga Pokok Penjualan','6000':'Beban Operasional'}[code]||code;}
  function purchaseCredit(r){var m=String(r.payment_method||'').toLowerCase();if(/cash|tunai/.test(m))return'1000';if(/bank|qris|transfer|tf/.test(m))return'1100';return'2000';}
  function journalRows(d){var lines=[],seq=0,inv={};d.inventory.forEach(function(x){if(x.source_history_id)inv[x.source_history_id]=1;});function add(date,ref,desc,code,debit,credit){lines.push({seq:++seq,date:date,ref:ref,desc:desc,code:String(code),account:accountName(String(code)),debit:n(debit),credit:n(credit)});}var byDay={};d.sales.forEach(function(r){var day=String(r.sold_at).slice(0,10);if(!byDay[day])byDay[day]={t:0,c:0,b:0};byDay[day].t+=n(r.total_amount);byDay[day].c+=n(r.cash_amount);byDay[day].b+=n(r.qris_amount)+n(r.tf_amount);});Object.keys(byDay).sort().forEach(function(day){var x=byDay[day],known=x.c+x.b,other=Math.max(0,x.t-known),ref='SALE-'+day.replace(/-/g,'');if(x.c+other)add(day,ref,'Penerimaan penjualan tunai','1000',x.c+other,0);if(x.b)add(day,ref,'Penerimaan QRIS / transfer','1100',x.b,0);add(day,ref,'Pendapatan penjualan','4000',0,x.t);});d.purchases.forEach(function(r,i){var raw=rawObj(r),ref=raw.invoice_no||('BUY-'+String(i+1).padStart(3,'0')),dt=r.purchase_date||r.source_period,asset=!!inv[r.id],debit=asset?'1300':'6000',desc=(asset?'Pembelian persediaan — ':'Pembelian/beban — ')+String(r.item_name||'');add(dt,ref,desc,debit,r.total_amount,0);add(dt,ref,'Lawan transaksi pembelian',purchaseCredit(r),0,r.total_amount);});d.expenses.forEach(function(r,i){if(r.source_history_id)return;if(['recorded','approved'].indexOf(String(r.status||'recorded'))<0)return;var ref='EXP-'+String(i+1).padStart(3,'0');add(r.expense_date,ref,String(r.category||'Beban operasional'),'6000',r.amount,0);add(r.expense_date,ref,'Pembayaran beban','1000',0,r.amount);});return lines.sort(function(a,b){return String(a.date).localeCompare(String(b.date))||a.seq-b.seq;});}

  function journalHtml(lines){return '<div class="fsv3-detail"><div class="fsv3-detail-head"><div><h3>Jurnal Umum</h3><p>'+esc(monthLabel(state.period))+' · '+lines.length+' baris jurnal</p></div><button type="button" data-fsv3-finview="close">Tutup</button></div><div class="fsv3-table-wrap"><table class="fsv3-table"><thead><tr><th>Tanggal</th><th>Referensi</th><th>Keterangan</th><th>Akun</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead><tbody>'+lines.map(function(x){return'<tr><td>'+dateLabel(x.date)+'</td><td>'+esc(x.ref)+'</td><td>'+esc(x.desc)+'</td><td>'+esc(x.code+' · '+x.account)+'</td><td class="num">'+(x.debit?money(x.debit):'—')+'</td><td class="num">'+(x.credit?money(x.credit):'—')+'</td></tr>';}).join('')+'</tbody></table></div></div>';}
  function ledgerHtml(lines){var g={};lines.forEach(function(x){if(!g[x.code])g[x.code]={code:x.code,name:x.account,debit:0,credit:0};g[x.code].debit+=x.debit;g[x.code].credit+=x.credit;});var groups=Object.keys(g).sort().map(function(k){var x=g[k],creditNormal=['2000','3000','4000'].indexOf(k)>=0;x.balance=creditNormal?x.credit-x.debit:x.debit-x.credit;return x;});return '<div class="fsv3-detail"><div class="fsv3-detail-head"><div><h3>Ledger / Buku Besar</h3><p>'+esc(monthLabel(state.period))+' · ringkasan saldo per akun</p></div><button type="button" data-fsv3-finview="close">Tutup</button></div><div class="fsv3-ledger-grid">'+groups.map(function(x){return'<article><span>'+esc(x.code+' · '+x.name)+'</span><b>'+money(x.balance)+'</b><small>Debit '+money(x.debit)+' · Kredit '+money(x.credit)+'</small></article>';}).join('')+'</div></div>';}

  function stockGroup(cat){var c=String(cat||'').toUpperCase();return /KEMASAN|ATK|PERLENGKAP|SUPPL|CLEAN|KEBERSIHAN/.test(c)?'supplies':'raw';}
  function stockStatus(r){if(!r.tracking_active)return'untracked';var q=n(r.system_qty),min=n(r.min_qty);if(q<=0)return'critical';if(min>0&&q<=min)return'low';return'ok';}
  function stockStatusLabel(s){return s==='critical'?'Kritis / Habis':s==='low'?'Stok Minim':s==='ok'?'Aman':'Belum Dipantau';}
  function stockPage(rows){var filtered=rows.filter(function(r){return stockGroup(r.category)===state.stockGroup;});var rank={critical:0,low:1,untracked:2,ok:3};filtered.sort(function(a,b){var da=rank[stockStatus(a)],db=rank[stockStatus(b)];return da-db||String(a.item_name).localeCompare(String(b.item_name),'id');});var pages=Math.max(1,Math.ceil(filtered.length/state.perPage));if(state.stockPage>pages)state.stockPage=pages;var page=filtered.slice((state.stockPage-1)*state.perPage,state.stockPage*state.perPage),critical=filtered.filter(function(r){return stockStatus(r)==='critical';}).length,low=filtered.filter(function(r){return stockStatus(r)==='low';}).length,untracked=filtered.filter(function(r){return stockStatus(r)==='untracked';}).length;return{all:filtered,page:page,pages:pages,critical:critical,low:low,untracked:untracked};}
  function stockHtml(rows){var s=stockPage(rows),title=state.stockGroup==='raw'?'Bahan Baku':'Perlengkapan / ATK';var body=s.page.map(function(r){var st=stockStatus(r),sys=r.tracking_active?qty(r.system_qty):'—',phys=r.last_physical_qty==null?'—':qty(r.last_physical_qty);return'<tr class="status-'+st+'"><td><b>'+esc(r.item_name)+'</b><small>'+esc(r.category||'Lainnya')+'</small></td><td>'+esc(r.unit||'pcs')+'</td><td class="num">'+qty(r.purchase_qty)+'</td><td class="num">'+qty(r.sales_usage_qty)+'</td><td class="num strong">'+sys+'</td><td class="num">'+phys+'</td><td class="num">'+(n(r.min_qty)>0?qty(r.min_qty):'—')+'</td><td><span class="fsv3-stock-pill '+st+'">'+stockStatusLabel(st)+'</span></td></tr>';}).join('');return '<div class="fsv3-shell"><div class="fsv3-head"><div><div class="fsv3-eyebrow">OPERASIONAL · STOK</div><h1>Stok &amp; Persediaan</h1><p>Saldo persediaan dari pembelian, pemakaian penjualan dan opname.</p></div><div class="fsv3-head-actions"><button type="button" data-fsv3-refresh="stock">↻ Refresh</button></div></div><div class="fsv3-stock-kpis"><div><span>Total '+title+'</span><b>'+s.all.length+'</b><small>item tercatat</small></div><div class="warn"><span>Stok Minim</span><b>'+s.low+'</b><small>perlu reorder</small></div><div class="danger"><span>Kritis / Habis</span><b>'+s.critical+'</b><small>butuh tindakan</small></div><div><span>Belum Dipantau</span><b>'+s.untracked+'</b><small>perlu baseline/opname</small></div></div><div class="fsv3-stock-tabs"><button type="button" data-fsv3-stock="raw" class="'+(state.stockGroup==='raw'?'on':'')+'">Bahan Baku</button><button type="button" data-fsv3-stock="supplies" class="'+(state.stockGroup==='supplies'?'on':'')+'">Perlengkapan / ATK</button></div><article class="fsv3-stock-card"><div class="fsv3-stock-title"><div><h2>'+title+'</h2><p>Stok minim dan kritis otomatis ditempatkan paling atas.</p></div><span>'+s.all.length+' item</span></div><div class="fsv3-table-wrap"><table class="fsv3-table stock"><thead><tr><th>Item</th><th>Unit</th><th class="num">+ Pembelian</th><th class="num">- Pemakaian</th><th class="num">Stok Sistem</th><th class="num">Fisik</th><th class="num">Min.</th><th>Status</th></tr></thead><tbody>'+(body||'<tr><td colspan="8" class="empty">Belum ada item pada kelompok ini.</td></tr>')+'</tbody></table></div><div class="fsv3-pager"><span>Halaman '+state.stockPage+' / '+s.pages+'</span><div><button type="button" data-fsv3-page="prev" '+(state.stockPage<=1?'disabled':'')+'>← Sebelumnya</button><button type="button" data-fsv3-page="next" '+(state.stockPage>=s.pages?'disabled':'')+'>Berikutnya →</button></div></div></article></div>';}

  async function renderFinance(force){var host=document.getElementById('ops');if(!host||host.classList.contains('hidden'))return;host.innerHTML=skeleton('Memuat laporan keuangan…');try{var d=await loadFinance(!!force);if(host.isConnected&&!host.classList.contains('hidden'))host.innerHTML=financePage(d);}catch(e){showError(host,'Keuangan gagal dimuat',e,'finance');}}
  async function renderStock(force){var host=document.getElementById('stok');if(!host||host.classList.contains('hidden'))return;host.innerHTML=skeleton('Memuat stok…');try{var d=await loadStock(!!force);if(host.isConnected&&!host.classList.contains('hidden'))host.innerHTML=stockHtml(d);}catch(e){showError(host,'Stok gagal dimuat',e,'stock');}}
  async function openFinanceDetail(kind){var host=document.getElementById('fsv3FinanceDetail');if(!host)return;host.innerHTML='<div class="fsv3-detail-loading">Memuat '+(kind==='journal'?'jurnal':'ledger')+' periode ini…</div>';try{var d=await loadFinanceDetail(state.period,false),lines=journalRows(d);host.innerHTML=kind==='journal'?journalHtml(lines):ledgerHtml(lines);}catch(e){host.innerHTML='<div class="fsv3-error compact"><span>'+esc(e&&e.message?e.message:e)+'</span><button type="button" data-fsv3-finview="close">Tutup</button></div>';}}

  function bind(){
    document.addEventListener('change',function(e){if(e.target&&e.target.id==='fsv3Period'){state.period=e.target.value;renderFinance(false);}},true);
    document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('[data-fsv3-refresh],[data-fsv3-finview],[data-fsv3-stock],[data-fsv3-page],[data-fsv3-retry]'):null;if(!t)return;if(t.hasAttribute('data-fsv3-refresh')){var k=t.getAttribute('data-fsv3-refresh');if(k==='finance'){financeCache=null;detailCache={};renderFinance(true);}else{stockCache=null;renderStock(true);}return;}if(t.hasAttribute('data-fsv3-retry')){var r=t.getAttribute('data-fsv3-retry');if(r==='finance')renderFinance(true);else renderStock(true);return;}if(t.hasAttribute('data-fsv3-finview')){var v=t.getAttribute('data-fsv3-finview');if(v==='close'){var h=document.getElementById('fsv3FinanceDetail');if(h)h.innerHTML='';}else openFinanceDetail(v);return;}if(t.hasAttribute('data-fsv3-stock')){state.stockGroup=t.getAttribute('data-fsv3-stock');state.stockPage=1;if(stockCache){var h2=document.getElementById('stok');if(h2)h2.innerHTML=stockHtml(stockCache);}return;}if(t.hasAttribute('data-fsv3-page')){state.stockPage+=t.getAttribute('data-fsv3-page')==='next'?1:-1;if(stockCache){var h3=document.getElementById('stok');if(h3)h3.innerHTML=stockHtml(stockCache);}return;}},true);
    document.addEventListener('hasnaria:owner-shell-navigate',function(e){var tab=e&&e.detail&&e.detail.tab;if(tab==='ops')setTimeout(function(){renderFinance(false);},20);if(tab==='stok')setTimeout(function(){renderStock(false);},20);});
    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#tabs .tab[data-tab]'):null;if(!b)return;var tab=b.getAttribute('data-tab');if(tab==='ops')setTimeout(function(){renderFinance(false);},80);if(tab==='stok')setTimeout(function(){renderStock(false);},80);},true);
  }

  function boot(){ensureCss();bind();setTimeout(function(){var o=document.getElementById('ops'),s=document.getElementById('stok');if(o&&!o.classList.contains('hidden'))renderFinance(false);if(s&&!s.classList.contains('hidden'))renderStock(false);},50);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
