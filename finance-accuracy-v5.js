(function(){
'use strict';
if(window.__HASNARIA_FINANCE_ACCURACY_V5)return;
window.__HASNARIA_FINANCE_ACCURACY_V5=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null, cache=null, detailCache={}, loading=null, period='';
var M=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function n(v){v=Number(v);return isFinite(v)?v:0}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function mon(v){return /^\d{4}-\d{2}/.test(String(v||''))?String(v).slice(0,7):''}
function ml(p){if(!p)return'—';return M[+p.slice(5,7)-1]+' '+p.slice(0,4)}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function nextMonth(p){var y=+p.slice(0,4),m=+p.slice(5,7)+1;if(m===13){m=1;y++}return y+'-'+String(m).padStart(2,'0')+'-01'}
function raw(r){if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;try{return JSON.parse(r.raw_data||'{}')}catch(_){return{}}}

function ensureCss(){
  if(!document.getElementById('hasnaria-finance-stock-v2-css')){
    var l=document.createElement('link');l.id='hasnaria-finance-stock-v2-css';l.rel='stylesheet';l.href='/finance-stock-v2.css?v=1';document.head.appendChild(l);
  }
  if(!document.getElementById('hasnaria-finance-v5-css')){
    var s=document.createElement('style');s.id='hasnaria-finance-v5-css';
    s.textContent='.finv5-loading{min-height:170px;display:grid;place-items:center}.finv5-loading span{display:inline-flex;gap:8px;align-items:center;color:#60766d}.finv5-loading span:before{content:"";width:14px;height:14px;border:2px solid #d9e7e1;border-top-color:#2f6f59;border-radius:50%;animation:finv5spin .8s linear infinite}@keyframes finv5spin{to{transform:rotate(360deg)}}.finv5-q{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 10px}.finv5-q span{border:1px solid #dde9e4;background:#fff;border-radius:999px;padding:5px 8px;font-size:9px;color:#63786f}.finv5-q b{color:#173f34}.finv5-q .warn{background:#fff8df;border-color:#f0dda0;color:#765812}.finv5-a{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:12px}.finv5-a>div{border:1px solid #e0ebe6;border-radius:11px;padding:8px 9px;background:#fbfdfc}.finv5-a span{display:block;font-size:9px;color:#71847c}.finv5-a strong{display:block;font-size:11.5px;margin-top:2px}.finv5-a small{display:block;font-size:8.5px;color:#87958f;margin-top:2px}@media(max-width:900px){.finv5-a{grid-template-columns:repeat(2,1fr)}}';
    document.head.appendChild(s);
  }
}

function waitReady(){
  return new Promise(function(resolve,reject){var i=0;(function tick(){db=db||window.__HASNARIA_DB;var c=window.__HASNARIA_CONTEXT;if(db&&c&&c.role==='owner')return resolve(db);if(i++>=50)return reject(new Error('Database / sesi Owner belum siap'));setTimeout(tick,100)})()});
}

function skeleton(host){
  if(host.querySelector('[data-finance-v5="1"]'))return;
  host.innerHTML='<div class="fsv2-shell" data-finance-v5="1"><div class="fsv2-head"><div><div class="fsv2-eyebrow">FINANCIAL REPORTING</div><h1>Keuangan</h1><p>Menyiapkan rekonsiliasi data…</p></div></div><div class="fsv2-report finv5-loading"><span>Memuat data keuangan…</span></div></div>';
}

function aggregateFallback(rows){
  var m={};(rows||[]).forEach(function(r){var p=mon(r.metric_date);if(!p)return;if(!m[p])m[p]={brand_id:BRAND,period_month:p+'-01',sales_rows:0,sales_revenue:0,tender_total:0,tender_unclassified_delta:0,sale_units:0,cogs_known_units:0,cogs_coverage_pct:0,item_cogs:0,finance_revenue:0,finance_cogs:0,finance_opex:0,expense_rows:0,expense_total:0,purchase_rows:0,purchase_total:0,revenue_delta:0,opex_delta:0,_fallback:true};var x=m[p];x.sales_revenue+=n(r.revenue);x.finance_revenue+=n(r.revenue);x.item_cogs+=n(r.cogs);x.finance_cogs+=n(r.cogs);x.expense_total+=n(r.operating_expense);x.finance_opex+=n(r.operating_expense);var rev=n(r.revenue);if(rev>0){x._covw=(x._covw||0)+n(r.cogs_coverage_pct)*rev;x._revw=(x._revw||0)+rev}});return Object.keys(m).sort().map(function(p){var x=m[p];x.cogs_coverage_pct=x._revw?x._covw/x._revw:0;delete x._covw;delete x._revw;return x})
}

async function fetchMonthly(force){
  if(cache&&!force)return cache;
  if(loading&&!force)return loading;
  loading=(async function(){
    await waitReady();
    var signal=(window.AbortSignal&&AbortSignal.timeout)?AbortSignal.timeout(9000):null;
    try{
      var q=db.rpc('get_finance_monthly_reconciliation_v1',{p_brand:BRAND});
      if(signal&&q.abortSignal)q=q.abortSignal(signal);
      var r=await q;
      if(r.error)throw r.error;
      if(r.data&&r.data.length){cache=r.data;return cache}
      throw new Error('Rekonsiliasi bulanan kosong');
    }catch(primary){
      var q2=db.from('finance_daily_summary').select('metric_date,revenue,cogs,operating_expense,cogs_coverage_pct').eq('brand_id',BRAND).order('metric_date',{ascending:true});
      if(window.AbortSignal&&AbortSignal.timeout&&q2.abortSignal)q2=q2.abortSignal(AbortSignal.timeout(9000));
      var r2=await q2;
      if(r2.error)throw new Error((primary&&primary.message?primary.message+' · ':'')+r2.error.message);
      cache=aggregateFallback(r2.data||[]);
      if(!cache.length)throw new Error('Data keuangan belum tersedia');
      return cache;
    }
  })();
  try{return await loading}finally{loading=null}
}

function selected(rows){var ps=rows.map(function(x){return mon(x.period_month)}).filter(Boolean);if(!period||ps.indexOf(period)<0)period=ps[ps.length-1]||'';return {periods:ps,row:rows.find(function(x){return mon(x.period_month)===period})||{}}}

function markup(rows){
  var s=selected(rows),a=s.row,cov=n(a.cogs_coverage_pct),complete=cov>=99.99,revenue=n(a.sales_revenue||a.finance_revenue),cogs=n(a.item_cogs||a.finance_cogs),opex=n(a.expense_total||a.finance_opex),surplus=revenue-opex,profit=complete?revenue-cogs-opex:null,margin=complete&&revenue?profit/revenue*100:null,td=n(a.tender_unclassified_delta),rd=n(a.revenue_delta),fallback=!!a._fallback;
  return '<div class="fsv2-shell" data-finance-v5="1"><div class="fsv2-head"><div><div class="fsv2-eyebrow">FINANCIAL REPORTING</div><h1>Keuangan</h1><p>Laporan laba rugi dengan kontrol akurasi dan cakupan data.</p></div><div class="fsv2-head-right"><label class="fsv2-field"><span>Periode</span><select id="financeV5Period">'+s.periods.map(function(p){return'<option value="'+p+'"'+(p===period?' selected':'')+'>'+ml(p)+'</option>'}).join('')+'</select></label><button class="fsv2-btn ghost" data-fin-v5-refresh>↻ Refresh</button></div></div><div class="finv5-q"><span>Revenue reconcile <b>'+money(Math.abs(rd))+'</b></span><span class="'+(cov>=95?'':'warn')+'">Coverage HPP <b>'+cov.toLocaleString('id-ID',{maximumFractionDigits:1})+'%</b></span><span class="'+(Math.abs(td)<1?'':'warn')+'">Tender belum terklasifikasi <b>'+money(td)+'</b></span>'+(fallback?'<span class="warn">Mode fallback summary</span>':'')+'</div><div class="fsv2-pl-grid"><article class="fsv2-report"><div class="fsv2-report-title"><div><small>HASNARIA TERRACE</small><h2>Laporan Laba Rugi</h2><p>'+ml(period)+' · laba final hanya jika HPP lengkap</p></div><span class="fsv2-badge '+(complete?'':'warn')+'">'+(complete?'Siap review':'HPP belum lengkap')+'</span></div><div class="fsv2-kpis"><div class="fsv2-kpi"><span>Pendapatan</span><strong>'+money(revenue)+'</strong></div><div class="fsv2-kpi"><span>HPP terverifikasi</span><strong>'+money(cogs)+'</strong></div><div class="fsv2-kpi"><span>'+(complete?'Laba Usaha':'Surplus sebelum HPP')+'</span><strong>'+money(complete?profit:surplus)+'</strong></div><div class="fsv2-kpi"><span>Margin laba</span><strong>'+(complete?margin.toLocaleString('id-ID',{maximumFractionDigits:1})+'%':'—')+'</strong></div></div><div class="fsv2-pl"><div class="fsv2-pl-row"><span>Pendapatan Penjualan</span><strong>'+money(revenue)+'</strong></div><div class="fsv2-pl-row"><span>HPP terverifikasi ('+cov.toLocaleString('id-ID',{maximumFractionDigits:1})+'%)</span><strong>'+(cogs?'('+money(cogs)+')':'—')+'</strong></div><div class="fsv2-pl-row sub"><span>Laba Kotor</span><strong>'+(complete?money(revenue-cogs):'Belum dapat ditetapkan')+'</strong></div><div class="fsv2-pl-row"><span>Beban Operasional tercatat</span><strong>'+(opex?'('+money(opex)+')':'Rp 0')+'</strong></div><div class="fsv2-pl-row total"><span>'+(complete?'Laba (Rugi) Usaha':'Surplus sebelum HPP')+'</span><strong>'+money(complete?profit:surplus)+'</strong></div></div><div class="finv5-a"><div><span>Penjualan backend</span><strong>'+(fallback?'—':n(a.sales_rows).toLocaleString('id-ID')+' transaksi')+'</strong><small>'+money(revenue)+'</small></div><div><span>Pembelian backend</span><strong>'+(fallback?'—':n(a.purchase_rows).toLocaleString('id-ID')+' baris')+'</strong><small>'+(fallback?'Rekonsiliasi penuh belum termuat':money(a.purchase_total))+'</small></div><div><span>Beban tercatat</span><strong>'+(fallback?'—':n(a.expense_rows).toLocaleString('id-ID')+' baris')+'</strong><small>'+money(opex)+'</small></div><div><span>Selisih tender</span><strong>'+money(td)+'</strong><small>Tidak diasumsikan tunai</small></div><div><span>Recall HPP</span><strong>'+(fallback?cov.toLocaleString('id-ID',{maximumFractionDigits:1})+'%':n(a.cogs_known_units).toLocaleString('id-ID')+' / '+n(a.sale_units).toLocaleString('id-ID')+' unit')+'</strong><small>'+cov.toLocaleString('id-ID',{maximumFractionDigits:1})+'% terbiaya</small></div></div><div class="fsv2-note '+(complete?'':'warn')+'">'+(complete?'Cakupan HPP lengkap untuk periode ini.':'HPP belum lengkap. Sistem tidak menampilkan margin laba final sebelum biaya persediaan terverifikasi.')+'</div></article><aside class="fsv2-side"><button class="fsv2-btn" data-fin-v5-open="journal"><b>Jurnal Umum</b><small>Debit / kredit transaksi periode</small></button><button class="fsv2-btn soft" data-fin-v5-open="ledger"><b>Ledger / Buku Besar</b><small>Mutasi dan saldo per akun</small></button><div class="fsv2-side-card"><b>Kontrol akurasi</b><p>Selisih metode bayar masuk akun clearing 1199, bukan dipaksa sebagai kas.</p></div></aside></div></div>';
}

async function render(force){
  var h=document.getElementById('ops');if(!h||h.classList.contains('hidden'))return;
  if(!cache)skeleton(h);
  try{var rows=await fetchMonthly(!!force);if(!h.isConnected||h.classList.contains('hidden'))return;h.innerHTML=markup(rows)}catch(e){if(h.isConnected&&!h.classList.contains('hidden'))h.innerHTML='<div class="fsv2-shell" data-finance-v5="1"><div class="fsv2-head"><div><div class="fsv2-eyebrow">FINANCIAL REPORTING</div><h1>Keuangan</h1></div><button class="fsv2-btn ghost" data-fin-v5-refresh>↻ Coba lagi</button></div><div class="fsv2-note warn">Gagal memuat Keuangan: '+esc(e.message||e)+'</div></div>'}
}

async function loadDetail(force){
  if(detailCache[period]&&!force)return detailCache[period];
  await waitReady();var a=period+'-01',b=nextMonth(period),queries=[
    db.from('sales').select('sold_at,total_amount,cash_amount,qris_amount,tf_amount').eq('brand_id',BRAND).gte('sold_at',a).lt('sold_at',b),
    db.from('offline_purchase_history').select('id,purchase_date,source_period,item_name,total_amount,payment_method,raw_data').eq('brand_id',BRAND).gte('purchase_date',a).lt('purchase_date',b),
    db.from('expenses').select('expense_date,category,amount,status,source_history_id').eq('brand_id',BRAND).gte('expense_date',a).lt('expense_date',b),
    db.from('inventory_purchase_log').select('source_history_id').eq('brand_id',BRAND).gte('purchase_date',a).lt('purchase_date',b),
    db.from('finance_daily_summary').select('metric_date,cogs').eq('brand_id',BRAND).gte('metric_date',a).lt('metric_date',b)
  ];
  if(window.AbortSignal&&AbortSignal.timeout)queries=queries.map(function(q){return q.abortSignal?q.abortSignal(AbortSignal.timeout(12000)):q});
  var rr=await Promise.all(queries);rr.forEach(function(x){if(x.error)throw x.error});
  return detailCache[period]={sales:rr[0].data||[],purchases:rr[1].data||[],expenses:rr[2].data||[],inv:rr[3].data||[],finance:rr[4].data||[]};
}

function accountName(c){return({'1000':'Kas','1100':'Bank / QRIS','1199':'Penerimaan Belum Terklasifikasi','1300':'Persediaan','2000':'Utang Usaha','4000':'Pendapatan Penjualan','5000':'Harga Pokok Penjualan','6000':'Beban Operasional'})[c]||c}
function journal(d){var L=[],seq=0,inv={};d.inv.forEach(function(x){if(x.source_history_id)inv[x.source_history_id]=1});function add(dt,ref,desc,code,dr,cr){L.push({seq:++seq,date:dt,ref:ref,desc:desc,code:code,debit:n(dr),credit:n(cr)})}var day={};d.sales.forEach(function(x){var k=x.sold_at;if(!day[k])day[k]={t:0,c:0,b:0};day[k].t+=n(x.total_amount);day[k].c+=n(x.cash_amount);day[k].b+=n(x.qris_amount)+n(x.tf_amount)});Object.keys(day).sort().forEach(function(dt){var x=day[dt],delta=x.t-x.c-x.b,ref='SALE-'+String(dt).replace(/-/g,'');if(x.c)add(dt,ref,'Penerimaan tunai','1000',x.c,0);if(x.b)add(dt,ref,'Penerimaan QRIS / transfer','1100',x.b,0);if(delta>0)add(dt,ref,'Penerimaan belum terklasifikasi','1199',delta,0);if(delta<0)add(dt,ref,'Kelebihan tender belum terklasifikasi','1199',0,-delta);add(dt,ref,'Pendapatan penjualan','4000',0,x.t)});d.purchases.forEach(function(x,i){if(!inv[x.id])return;var r=raw(x),ref=r.invoice_no||('INV-'+(i+1)),pm=String(x.payment_method||'').toLowerCase(),cr=/cash|tunai/.test(pm)?'1000':(/qris|bank|transfer|tf/.test(pm)?'1100':'2000');add(x.purchase_date||x.source_period,ref,'Pembelian persediaan — '+x.item_name,'1300',x.total_amount,0);add(x.purchase_date||x.source_period,ref,'Lawan pembelian persediaan',cr,0,x.total_amount)});d.expenses.filter(function(x){return['recorded','approved'].indexOf(String(x.status||'recorded'))>=0&&!x.source_history_id}).forEach(function(x,i){var ref='EXP-'+(i+1);add(x.expense_date,ref,x.category||'Beban operasional','6000',x.amount,0);add(x.expense_date,ref,'Pembayaran beban','1000',0,x.amount)});d.finance.forEach(function(x){if(n(x.cogs)<=0)return;var ref='COGS-'+String(x.metric_date).replace(/-/g,'');add(x.metric_date,ref,'Pengakuan HPP terverifikasi','5000',x.cogs,0);add(x.metric_date,ref,'Pengurangan persediaan','1300',0,x.cogs)});return L.sort(function(a,b){return String(a.date).localeCompare(String(b.date))||a.seq-b.seq})}

function modal(kind,d){
  var lines=journal(d),body='';
  if(kind==='journal'){
    var dr=lines.reduce(function(a,x){return a+x.debit},0),cr=lines.reduce(function(a,x){return a+x.credit},0);
    body='<div class="fsv2-journal-summary"><span class="fsv2-mini">Baris <b>'+lines.length+'</b></span><span class="fsv2-mini">Debit <b>'+money(dr)+'</b></span><span class="fsv2-mini">Kredit <b>'+money(cr)+'</b></span><span class="fsv2-mini">Selisih <b>'+money(dr-cr)+'</b></span></div><div class="fsv2-table-wrap"><table class="fsv2-table"><thead><tr><th>Tanggal</th><th>Ref</th><th>Keterangan</th><th>Akun</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead><tbody>'+lines.map(function(x){return'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.ref)+'</td><td>'+esc(x.desc)+'</td><td>'+esc(x.code+' · '+accountName(x.code))+'</td><td class="num">'+(x.debit?money(x.debit):'—')+'</td><td class="num">'+(x.credit?money(x.credit):'—')+'</td></tr>'}).join('')+'</tbody></table></div>';
  }else{
    var g={};lines.forEach(function(x){if(!g[x.code])g[x.code]=[];g[x.code].push(x)});
    body='<div class="fsv2-ledger-list">'+Object.keys(g).sort().map(function(c){var bal=0,nc=['2000','4000'].indexOf(c)>=0,trs=g[c].map(function(x){bal+=nc?x.credit-x.debit:x.debit-x.credit;return'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.ref)+'</td><td>'+esc(x.desc)+'</td><td class="num">'+(x.debit?money(x.debit):'—')+'</td><td class="num">'+(x.credit?money(x.credit):'—')+'</td><td class="num">'+money(bal)+'</td></tr>'}).join('');return'<details class="fsv2-ledger-card"><summary><b>'+esc(c+' · '+accountName(c))+'</b><span>'+g[c].length+' baris</span><strong>'+money(bal)+'</strong></summary><div class="fsv2-table-wrap"><table class="fsv2-table"><thead><tr><th>Tanggal</th><th>Ref</th><th>Keterangan</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr></thead><tbody>'+trs+'</tbody></table></div></details>'}).join('')+'</div>';
  }
  var old=document.getElementById('finV5Modal');if(old)old.remove();var el=document.createElement('div');el.id='finV5Modal';el.className='fsv2-overlay';el.innerHTML='<div class="fsv2-modal"><div class="fsv2-modal-head"><div><h2>'+(kind==='journal'?'Jurnal Umum':'Ledger / Buku Besar')+'</h2><p>'+ml(period)+'</p></div><button class="fsv2-close" data-fin-v5-close>×</button></div><div class="fsv2-modal-body">'+body+'</div></div>';document.body.appendChild(el);
}
async function openDetail(kind){try{modal(kind,await loadDetail(false))}catch(e){alert('Gagal memuat '+kind+': '+(e.message||e))}}

function bind(){
  if(window.__HASNARIA_FINANCE_V5_BOUND)return;window.__HASNARIA_FINANCE_V5_BOUND=true;
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='financeV5Period'){period=e.target.value;var h=document.getElementById('ops');if(h&&cache)h.innerHTML=markup(cache)}},true);
  document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-fin-v5-open],[data-fin-v5-close],[data-fin-v5-refresh]');if(!t)return;if(t.hasAttribute('data-fin-v5-close')){var m=document.getElementById('finV5Modal');if(m)m.remove()}else if(t.hasAttribute('data-fin-v5-refresh')){cache=null;detailCache={};render(true)}else openDetail(t.getAttribute('data-fin-v5-open'))},true);
  document.addEventListener('hasnaria:owner-shell-navigate',function(e){if(e.detail&&e.detail.tab==='ops'){var h=document.getElementById('ops');if(h&&!h.querySelector('[data-finance-v5="1"]'))render(false)}});
}
function boot(){ensureCss();bind();var i=0;(function tick(){var h=document.getElementById('ops'),c=window.__HASNARIA_CONTEXT;if(h&&c&&c.role==='owner'){if(!h.classList.contains('hidden'))render(false);return}if(i++<80)setTimeout(tick,100)})()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
