(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V12)return;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V12=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var CATS=['Beban Administrasi','Beban Pemeliharaan','Beban Bahan Baku','Beban Kepegawaian'];
var CAT_LABEL={'Beban Administrasi':'6100 · Administrasi','Beban Pemeliharaan':'6110 · Pemeliharaan','Beban Bahan Baku':'6120 · Bahan Baku','Beban Kepegawaian':'6200 · Kepegawaian'};
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var db=null,rows=[],control={},overview=null,chartRows=[],periods=[],loading=false,error='',observer=null,timer=0,loadedAt=0,loadedPeriod='',syncingStock=false,lastStockSync='',category='all',modalOpen=false,requestSeq=0,syncing=false;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return isFinite(v)?v:0}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function qty(v){var x=n(v);return x.toLocaleString('id-ID',{maximumFractionDigits:3})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function dateLabel(v){var s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—'}
function total(a){return a.reduce(function(s,r){return s+n(r.total_amount)},0)}
function periodValue(){var p=document.getElementById('paPeriod');return p?periodKey(p.value):''}
function categoryValue(){var s=document.getElementById('pfaCategory');return s?s.value:category}
function detailRows(){var s=categoryValue();return rows.filter(function(r){return s==='all'||r.expense_category===s})}
function byCat(a,cat){return a.filter(function(r){return r.expense_category===cat})}
function monthRange(){var p=periodValue();if(!/^\d{4}-\d{2}$/.test(p))return null;var y=+p.slice(0,4),m=+p.slice(5,7);return{from:p+'-01',to:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),key:p}}
function monthLabel(v){var p=periodKey(v);if(!p)return'—';return MONTHS[Number(p.slice(5,7))-1]+' '+p.slice(0,4)}
function cutLabel(){var r=monthRange();if(!r)return'Periode belum tersedia';return'1–'+String(r.to).slice(8,10)+' '+monthLabel(r.key)}
function statusPill(text,type){return'<span class="pfa-status '+(type||'')+'">'+esc(text)+'</span>'}

function patchCore(root){
  var sub=root.querySelector('.pa-title p');if(sub)sub.textContent='Ringkasan visual Pembelian. Rincian transaksi tersedia saat dibutuhkan.';
  var legacyScope=root.querySelector('#paScope');if(legacyScope&&legacyScope.closest('label'))legacyScope.closest('label').style.display='none';
  var branch=root.querySelector('.pa-controls select[disabled]');if(branch&&branch.closest('label'))branch.closest('label').style.display='none';
}
function syncPeriodOptions(){
  var sel=document.getElementById('paPeriod');if(!sel||!periods.length)return;
  var current=periodValue(),html=periods.map(function(x){var k=periodKey(x.period_start||x.period_key);return'<option value="'+esc(k)+'">'+esc(monthLabel(k))+'</option>'}).join('');
  if(!html)return;
  sel.innerHTML=html;
  var available=periods.some(function(x){return periodKey(x.period_start||x.period_key)===current});
  sel.value=available?current:periodKey(periods[0].period_start||periods[0].period_key);
}
function card(label,value,sub,cls){return'<article class="pfa-card '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||'')+'</small></article>'}
function stockCell(r){
  if(r.stock_status==='posted_to_stock')return statusPill('+'+qty(r.posted_stock_qty||r.source_stock_qty)+' '+(r.posted_stock_unit||r.source_stock_unit||'unit'),'ok')+'<small class="pfa-action">'+esc(r.inventory_item_name||'Stok')+'</small>';
  if(r.stock_status==='ready_to_stock')return statusPill('Siap sinkron','warn')+'<small class="pfa-action">'+esc(qty(r.source_stock_qty))+' '+esc(r.source_stock_unit||'unit')+' · '+esc(r.inventory_item_name||'stok')+'</small>';
  if(r.stock_status==='stock_review_required')return statusPill('Perlu mapping','warn')+'<small class="pfa-action">'+esc(r.stock_mapping_status||'mapping stok')+'</small>';
  return statusPill('Non-stok','');
}
function financeStatus(r){return r.category_status==='provisional'?statusPill('Sumber bayar belum lengkap','warn'):statusPill('Terjurnal','ok')}
function table(a){
  var show=a.slice().sort(function(x,y){return String(y.effective_date||'').localeCompare(String(x.effective_date||''))||n(y.total_amount)-n(x.total_amount)}).slice(0,220);
  if(!show.length)return'<div class="pfa-empty">Tidak ada transaksi Pembelian untuk kategori/periode ini.</div>';
  return'<div class="pfa-table-scroll"><table class="pfa-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Akun Beban</th><th class="num">Nilai</th><th>Stok Qty</th><th>Finance</th></tr></thead><tbody>'+show.map(function(r){return'<tr><td>'+esc(dateLabel(r.effective_date))+'</td><td><b>'+esc(r.item_name||'Tanpa nama')+'</b><small>'+esc(r.analytics_category||r.analytics_group||'')+'</small></td><td><b>'+esc(r.expense_account_code)+' · '+esc(r.expense_category)+'</b></td><td class="num">'+esc(money(r.total_amount))+'</td><td>'+stockCell(r)+'</td><td>'+financeStatus(r)+'</td></tr>'}).join('')+'</tbody></table></div>'+(a.length>show.length?'<div class="pfa-more">Menampilkan 220 transaksi terbaru dari '+a.length.toLocaleString('id-ID')+' transaksi.</div>':'')
}
function filterMarkup(){return'<label class="pfa-modal-filter">Kategori<select id="pfaCategory"><option value="all"'+(category==='all'?' selected':'')+'>Semua kategori</option>'+CATS.map(function(x){return'<option value="'+esc(x)+'"'+(category===x?' selected':'')+'>'+esc(CAT_LABEL[x]||x)+'</option>'}).join('')+'</select></label>'}
function chartMarkup(){
  var source=chartRows&&chartRows.length?chartRows:CATS.map(function(cat){var a=byCat(rows,cat);return{category:cat,purchase_rows:a.length,amount:total(a)}}).filter(function(x){return x.purchase_rows});
  if(!source.length)return'<div class="pfa-empty">Belum ada kategori untuk periode ini.</div>';
  var max=Math.max.apply(null,source.map(function(x){return n(x.amount)}).concat([1]));
  return'<div class="pfa-chart">'+source.slice().sort(function(a,b){return n(b.amount)-n(a.amount)}).map(function(x){var value=n(x.amount),pct=Math.max(0,Math.min(100,value/max*100)),label=CAT_LABEL[x.category]||x.category||'Lainnya';return'<div class="pfa-chart-row"><div class="pfa-chart-label"><span>'+esc(label)+'</span><b>'+esc(money(value))+'</b></div><progress max="100" value="'+pct.toFixed(2)+'">'+pct.toFixed(0)+'%</progress><small>'+n(x.purchase_rows).toLocaleString('id-ID')+' transaksi</small></div>'}).join('')+'</div>'
}
function summaryValues(){
  if(overview)return overview;
  var inv=rows.filter(function(r){return r.expense_account_code==='6120'}),review=rows.filter(function(r){return r.expense_account_code==='1990'||r.category_status==='provisional'}),ops=rows.filter(function(r){return r.expense_account_code!=='6120'&&r.expense_account_code!=='1990'});
  return{purchase_rows:rows.length,total_purchase_amount:total(rows),inventory_rows:inv.length,inventory_amount:total(inv),operating_rows:ops.length,operating_amount:total(ops),review_rows:review.length,review_amount:total(review),sync_ok:control.finance_link_status==='MATCH'}
}
function syncMarkup(){
  var finance=control.finance_link_status==='MATCH',stock=control.stock_link_status==='OK',review=n(control.provisional_journal_rows)+n(control.stock_review_rows);
  return'<div class="pfa-sync-grid"><div><span>Keuangan</span><strong>'+statusPill(finance?'Sinkron':'Periksa',finance?'ok':'bad')+(finance?'':' · delta '+esc(money(control.purchase_journal_delta)))+'</strong></div><div><span>Stok</span><strong>'+statusPill(stock?'Sinkron':'Perlu review',stock?'ok':'warn')+'</strong></div><div><span>Perlu perhatian</span><strong>'+review.toLocaleString('id-ID')+'</strong></div></div>'
}
function modalMarkup(){
  if(!modalOpen)return'';
  var a=detailRows();
  return'<div class="pfa-modal-backdrop" data-pfa-detail-close="1"><section class="pfa-modal" role="dialog" aria-modal="true" aria-labelledby="pfaModalTitle"><div class="pfa-modal-head"><div><div class="pfa-eyebrow">DETAIL PEMBELIAN</div><h3 id="pfaModalTitle">'+esc(monthLabel(periodValue()))+'</h3><p>'+a.length.toLocaleString('id-ID')+' transaksi · '+esc(money(total(a)))+'</p></div><button type="button" class="pfa-close" data-pfa-detail-close="1" aria-label="Tutup">×</button></div><div class="pfa-modal-tools">'+filterMarkup()+'</div>'+table(a)+'</section></div>'
}
function render(){
  var root=document.getElementById('paRoot');if(!root)return;patchCore(root);syncPeriodOptions();
  var target=root.querySelector('.pa-controls');if(!target)return;
  var wrap=document.getElementById('purchaseFinanceAlignment');
  if(!wrap){wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';target.insertAdjacentElement('afterend',wrap)}
  if(loading){wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">PEMBELIAN</div><h2>Ringkasan Pembelian</h2><p>Memuat periode terpilih…</p></div></div>';return}
  if(error){wrap.innerHTML='<div class="pfa-head"><div><h2>Ringkasan Pembelian</h2><p class="pfa-error">'+esc(error)+'</p></div><button id="pfaRetry" type="button">Muat ulang</button></div>';var rb=document.getElementById('pfaRetry');if(rb)rb.onclick=function(){load(true)};return}
  var v=summaryValues(),finance=control.finance_link_status==='MATCH';
  wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">PEMBELIAN · '+esc(cutLabel())+'</div><h2>Ringkasan Pembelian</h2><p>Visual utama menampilkan nilai dan kategori. Rincian transaksi disimpan di popup agar halaman tetap ringkas.</p></div><span class="pfa-sync '+(finance?'ok':'warn')+'">'+(finance?'TERSINKRON':'PERLU PERIKSA')+'</span></div>'+
    '<div class="pfa-cards">'+
      card('Total Pembelian',money(v.total_purchase_amount),n(v.purchase_rows).toLocaleString('id-ID')+' transaksi','total')+
      card('Inventory',money(v.inventory_amount),n(v.inventory_rows).toLocaleString('id-ID')+' transaksi','inventory')+
      card('Operasional',money(v.operating_amount),n(v.operating_rows).toLocaleString('id-ID')+' transaksi','expense')+
      card('Review',money(v.review_amount),n(v.review_rows).toLocaleString('id-ID')+' transaksi','review')+
    '</div>'+
    '<div class="pfa-main-grid"><article class="pfa-panel"><div class="pfa-panel-head"><div><h3>Komposisi Pembelian</h3><p>Nilai per kategori untuk cut '+esc(cutLabel())+'.</p></div></div>'+chartMarkup()+'</article><article class="pfa-panel"><div class="pfa-panel-head"><div><h3>Status Sinkronisasi</h3><p>Pembelian terhubung otomatis ke Keuangan dan Stok.</p></div></div>'+syncMarkup()+'<div class="pfa-note">Nilai rupiah masuk Keuangan satu kali. SKU stockable menambah kuantitas Stok tanpa membuat jurnal nilai kedua.</div></article></div>'+
    '<div class="pfa-detail-cta"><div><b>'+n(v.purchase_rows).toLocaleString('id-ID')+' transaksi pada '+esc(monthLabel(periodValue()))+'</b><span>Tabel lengkap tidak ditampilkan di halaman utama.</span></div><button type="button" class="primary" data-pfa-detail-open="1">Lihat Detail Pembelian</button></div>'+
    modalMarkup();
}
async function loadPeriods(){
  db=db||window.__HASNARIA_DB;if(!db)return;
  try{var q=await db.from('ui_period_catalog_v1').select('period_start,period_key').eq('brand_id',BRAND).eq('module','pembelian').order('period_start',{ascending:false});if(q.error)throw q.error;periods=q.data||[];syncPeriodOptions()}catch(e){if(console&&console.warn)console.warn('Purchase period catalog:',e)}
}
async function syncStockForPeriod(){
  var r=monthRange();if(!db||!r||syncingStock||lastStockSync===r.key)return false;
  syncingStock=true;
  try{var q=await db.rpc('sync_purchase_quantity_stock_v1',{p_from:r.from,p_to:r.to});if(q.error)throw q.error;lastStockSync=r.key;if(window.__HASNARIA_DATA_SYNC)window.__HASNARIA_DATA_SYNC.notify('purchase-stock-synced');return true}catch(e){if(console&&console.warn)console.warn('Purchase quantity → Stock sync:',e);return false}finally{syncingStock=false}
}
async function load(force){
  var p=periodValue();if(!p)return;
  if(loading){if(force)requestSeq++;return}
  if(!force&&rows.length&&loadedPeriod===p&&Date.now()-loadedAt<60000){render();return}
  var seq=++requestSeq;db=db||window.__HASNARIA_DB;if(!db)return;loading=true;error='';render();
  try{
    var all=await Promise.all([
      db.rpc('get_purchase_control_period_v1',{p_brand:BRAND,p_period:p+'-01'}),
      db.from('ui_purchase_overview_v1').select('*').eq('brand_id',BRAND).eq('period_month',p+'-01').limit(1),
      db.from('ui_purchase_category_chart_v1').select('category,purchase_rows,amount').eq('brand_id',BRAND).eq('period_month',p+'-01').order('amount',{ascending:false})
    ]);
    if(seq!==requestSeq)return;
    if(all[0].error)throw all[0].error;
    var pack=all[0].data||{};rows=Array.isArray(pack.rows)?pack.rows:[];control=pack.control||{};
    overview=!all[1].error&&all[1].data&&all[1].data.length?all[1].data[0]:null;
    chartRows=!all[2].error&&Array.isArray(all[2].data)?all[2].data:[];
    loadedAt=Date.now();loadedPeriod=p;
  }catch(e){if(seq!==requestSeq)return;rows=[];control={};overview=null;chartRows=[];loadedPeriod='';loadedAt=0;error='Gagal memuat ringkasan Pembelian: '+(e&&e.message?e.message:String(e))}
  finally{if(seq===requestSeq){loading=false;render()}else{loading=false;setTimeout(function(){if(periodValue())load(true)},0)}}
}
function canSyncReport(){var h=document.getElementById('pembelian'),c=window.__HASNARIA_CONTEXT,s=window.__HASNARIA_DATA_SYNC;return!!(h&&!h.classList.contains('hidden')&&c&&c.role==='owner'&&document.getElementById('paRoot')&&!modalOpen&&s&&s.canRefresh(h,'#paPeriod,#pfaCategory'))}
async function syncReport(){
  if(loading||syncing||syncingStock||!canSyncReport())return;var p=periodValue();db=db||window.__HASNARIA_DB;if(!p||!db)return;
  var seq=requestSeq,c=window.__HASNARIA_CONTEXT,root=document.getElementById('paRoot');syncing=true;
  try{
    // Polling reads persisted Stock/Finance status; only import events post stock.
    var all=await Promise.all([
      db.rpc('get_purchase_control_period_v1',{p_brand:BRAND,p_period:p+'-01'}),
      db.from('ui_purchase_overview_v1').select('*').eq('brand_id',BRAND).eq('period_month',p+'-01').limit(1),
      db.from('ui_purchase_category_chart_v1').select('category,purchase_rows,amount').eq('brand_id',BRAND).eq('period_month',p+'-01').order('amount',{ascending:false}),
      db.from('ui_period_catalog_v1').select('period_start,period_key').eq('brand_id',BRAND).eq('module','pembelian').order('period_start',{ascending:false})
    ]);
    if(seq!==requestSeq||loading||p!==periodValue()||c!==window.__HASNARIA_CONTEXT||root!==document.getElementById('paRoot')||!canSyncReport())return;
    all.forEach(function(r){if(r.error)throw r.error});
    var next=all[0].data||{},nr=Array.isArray(next.rows)?next.rows:[],nc=next.control||{},no=all[1].data&&all[1].data[0]||null,chart=all[2].data||[],ps=all[3].data||[];
    var changed=!!error||JSON.stringify([rows,control,overview,chartRows,periods])!==JSON.stringify([nr,nc,no,chart,ps]);
    rows=nr;control=nc;overview=no;chartRows=chart;periods=ps;loadedAt=Date.now();loadedPeriod=p;error='';
    if(changed)render();
  }finally{syncing=false}
}
function registerSync(){var s=window.__HASNARIA_DATA_SYNC;if(s)s.register('owner-purchase-report',syncReport)}
registerSync();window.addEventListener('hasnaria:data-sync-ready',registerSync);
function resetData(){rows=[];control={};overview=null;chartRows=[];loadedAt=0;loadedPeriod='';category='all';modalOpen=false}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){if(!document.getElementById('paRoot'))return;render();if(!loading&&(!rows.length||loadedPeriod!==periodValue()))load(false)},80)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var host=document.getElementById('pembelian');if(db&&host){
    observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});
    document.addEventListener('change',function(e){if(!e.target)return;if(e.target.id==='paPeriod'){resetData();lastStockSync='';load(true);return}if(e.target.id==='pfaCategory'){category=e.target.value;render()}},true);
    document.addEventListener('click',function(e){
      var open=e.target&&e.target.closest?e.target.closest('[data-pfa-detail-open]'):null;if(open){modalOpen=true;render();return}
      var close=e.target&&e.target.closest?e.target.closest('[data-pfa-detail-close]'):null;if(close&&e.target===close){modalOpen=false;render();return}
      var b=e.target&&e.target.closest?e.target.closest('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn,[data-tab="pembelian"]'):null;if(!b)return;
      if(b.matches('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn'))setTimeout(function(){resetData();lastStockSync='';loadPeriods().then(function(){load(true)})},350);else setTimeout(schedule,120)
    },true);
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modalOpen){modalOpen=false;render()}},true);
    document.addEventListener('hasnaria:purchase-imported',function(){lastStockSync='';syncStockForPeriod().then(function(){resetData();return loadPeriods()}).then(function(){load(true)})},true);
    loadPeriods().then(function(){load(true)});return
  }if(tries++<150)setTimeout(wait,100)})()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
