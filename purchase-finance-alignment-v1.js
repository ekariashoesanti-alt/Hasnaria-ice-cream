(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V4)return;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V4=true;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V3=true;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V2=true;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V1=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var SYNC_KEY='hasnaria-purchase-finance-sync-20260925-v1';
var db=null,rows=[],loading=false,error='',observer=null,timer=0,loadedAt=0,syncing=false,syncMsg='';

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return isFinite(v)?v:0}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function dateLabel(v){var s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—'}
function total(a){return a.reduce(function(s,r){return s+n(r.total_amount)},0)}
function isReview(r){return r.finance_status==='review_required'||r.accounting_treatment==='payment_review'||r.accounting_treatment==='classification_review'||r.accounting_treatment==='asset_review'||r.accounting_treatment==='expense_review'}
function isZero(r){return !isReview(r)&&Math.abs(n(r.total_amount))<.01}
function isSynced(r){return !isReview(r)&&!isZero(r)&&(r.finance_status==='posted'||r.finance_status==='provisional')}
function statusClass(r){if(isReview(r))return'bad';if(isZero(r))return'warn';return r.finance_status==='provisional'?'warn':'ok'}
function statusLabel(r){if(isReview(r))return'Review · belum diposting';if(isZero(r))return'Nilai 0 · tidak perlu jurnal';return r.finance_status==='provisional'?'Sinkron · provisional':'Sinkron / posted'}
function accountLabel(code,name){if(!code)return'—';return esc(code+' · '+(name||'Akun Finance'))}
function scopeValue(){var s=document.getElementById('paScope');return s?s.value:'all'}
function periodValue(){var p=document.getElementById('paPeriod');return p?periodKey(p.value):''}
function scoped(){var p=periodValue(),s=scopeValue();return rows.filter(function(r){if(periodKey(r.effective_date||r.source_period)!==p)return false;return s==='all'||r.analytics_group===s})}
function reviewRows(a){return a.filter(isReview).sort(function(a,b){return n(b.total_amount)-n(a.total_amount)})}
function syncDone(){try{return localStorage.getItem(SYNC_KEY)==='done'}catch(e){return false}}
function markSyncDone(){try{localStorage.setItem(SYNC_KEY,'done')}catch(e){}}
function suppressSyncThisSession(){try{sessionStorage.setItem(SYNC_KEY,'skip')}catch(e){}}
function syncSuppressed(){try{return sessionStorage.getItem(SYNC_KEY)==='skip'}catch(e){return false}}
function patchCoreLabels(root){
  var sub=root.querySelector('.pa-title p');
  if(sub)sub.textContent='Monitoring pembelian, kode akun, dan status rekonsiliasi ke Keuangan berdasarkan tanggal transaksi efektif.';
  var first=root.querySelector('.pa-kpis article:first-child span');
  if(first&&/^Total Pengeluaran/.test(first.textContent))first.textContent=first.textContent.replace(/^Total Pengeluaran/,'Total Data Pembelian');
  var comp=root.querySelector('.pa-main-grid article:nth-child(2) h2');
  if(comp)comp.textContent=comp.textContent.replace('Komposisi Kategori','Komposisi Kategori Operasional');
}
function card(label,value,sub,cls){return'<article class="pfa-card '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></article>'}
function rowNote(r){
  if(isReview(r))return r.required_action||'Kode 1990 dipakai sebagai akun review; transaksi belum diposting ke ledger final.';
  if(isZero(r))return'Nilai transaksi Rp0, sehingga tidak dibuat jurnal Finance.';
  if(r.finance_status==='provisional'&&r.counter_account_code==='2190')return'Metode pembayaran tidak tersedia di sumber. Nilai dan akun debit sudah masuk Finance; akun lawan sementara 2190.';
  if(r.finance_status==='provisional')return'Nilai dan akun debit sudah masuk Finance; akun lawan masih provisional.';
  return'Akun transaksi sudah terhubung ke Finance.';
}
function renderAllTable(a){
  var show=a.slice().sort(function(x,y){return String(y.effective_date||y.source_period||'').localeCompare(String(x.effective_date||x.source_period||''))||n(y.total_amount)-n(x.total_amount)}).slice(0,150);
  if(!show.length)return'<div class="pfa-empty">Tidak ada transaksi Pembelian untuk periode ini.</div>';
  return'<div class="pfa-table-scroll"><table class="pfa-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Akun Debit</th><th>Akun Lawan</th><th>Nilai</th><th>Status Finance</th></tr></thead><tbody>'+show.map(function(r){
    var counter=(r.counter_account_code||'—')+(r.counter_account_name?' · '+r.counter_account_name:'');
    return'<tr><td>'+esc(dateLabel(r.effective_date||r.source_period))+'</td><td><b>'+esc(r.item_name||'Tanpa nama')+'</b><small>'+esc(r.accounting_label||r.analytics_category||'')+'</small></td><td>'+accountLabel(r.debit_account_code,r.debit_account_name)+'</td><td>'+esc(counter)+'</td><td class="num">'+esc(money(r.total_amount))+'</td><td><span class="pfa-status '+statusClass(r)+'">'+esc(statusLabel(r))+'</span><small class="pfa-action">'+esc(rowNote(r))+'</small></td></tr>'
  }).join('')+'</tbody></table></div>'+(a.length>show.length?'<div class="pfa-more">Menampilkan 150 transaksi terbaru dari '+a.length.toLocaleString('id-ID')+' transaksi periode ini.</div>':'')
}
function renderReviewTable(a){
  var rr=reviewRows(a),show=rr.slice(0,20);
  if(!show.length)return'<div class="pfa-empty">Tidak ada transaksi review. Seluruh transaksi periode ini sudah memiliki perlakuan akun final/provisional.</div>';
  return'<div class="pfa-table-scroll"><table class="pfa-table"><thead><tr><th>Item</th><th>Perlakuan</th><th>Akun Review</th><th>Akun Lawan</th><th>Nilai</th><th>Tindakan</th></tr></thead><tbody>'+show.map(function(r){
    var counter=(r.counter_account_code||'—')+(r.counter_account_name?' · '+r.counter_account_name:'');
    return'<tr><td><b>'+esc(r.item_name||'Tanpa nama')+'</b><small>'+esc(r.analytics_category||r.analytics_group||'')+'</small></td><td>'+esc(r.accounting_label||'Perlu klasifikasi')+'</td><td>'+accountLabel(r.debit_account_code,r.debit_account_name)+'</td><td>'+esc(counter)+'</td><td class="num">'+esc(money(r.total_amount))+'</td><td><span class="pfa-status bad">Review · belum diposting</span><small class="pfa-action">'+esc(r.required_action||'Tentukan klasifikasi final sebelum posting.')+'</small></td></tr>'
  }).join('')+'</tbody></table></div>'+(rr.length>show.length?'<div class="pfa-more">Menampilkan 20 prioritas terbesar dari '+rr.length.toLocaleString('id-ID')+' transaksi review.</div>':'')
}
function render(){
  var root=document.getElementById('paRoot');if(!root)return;
  patchCoreLabels(root);
  var old=document.getElementById('purchaseFinanceAlignment');if(old)old.remove();
  var target=root.querySelector('.pa-kpis')||root.querySelector('.pa-controls');if(!target)return;
  var wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';
  if(loading){wrap.innerHTML='<div class="pfa-head"><div><h2>Pembelian ↔ Keuangan</h2><p>Memuat kode akun dan status rekonsiliasi…</p></div></div>';target.insertAdjacentElement('afterend',wrap);return}
  if(error){wrap.innerHTML='<div class="pfa-head"><div><h2>Pembelian ↔ Keuangan</h2><p class="pfa-error">'+esc(error)+'</p></div><button id="pfaRetry" type="button">Muat ulang</button></div>';target.insertAdjacentElement('afterend',wrap);var rb=document.getElementById('pfaRetry');if(rb)rb.onclick=function(){load(true)};return}
  var a=scoped();
  var inventory=a.filter(function(r){return r.accounting_treatment==='inventory'}),expense=a.filter(function(r){return r.accounting_treatment==='expense'}),reviews=reviewRows(a),zeroRows=a.filter(isZero),provisional=a.filter(function(r){return !isReview(r)&&!isZero(r)&&r.finance_status==='provisional'}),posted=a.filter(function(r){return !isReview(r)&&!isZero(r)&&r.finance_status==='posted'}),synced=a.filter(isSynced);
  var expenseAccounts={};expense.forEach(function(r){var k=r.debit_account_code||'—';if(!expenseAccounts[k])expenseAccounts[k]={name:r.debit_account_name||'Beban',amount:0};expenseAccounts[k].amount+=n(r.total_amount)});
  var breakdown=Object.keys(expenseAccounts).sort().map(function(k){return'<span><b>'+esc(k)+'</b> '+esc(expenseAccounts[k].name)+' <strong>'+esc(money(expenseAccounts[k].amount))+'</strong></span>'}).join('');
  var provisional2190=provisional.filter(function(r){return r.counter_account_code==='2190'});
  var syncLine=syncing?' · sinkronisasi jurnal berjalan':syncMsg?(' · '+syncMsg):'';
  wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">PEMBELIAN ↔ FINANCE · COA CANONICAL</div><h2>Rekonsiliasi Transaksi Pembelian</h2><p><b>Sinkron</b> berarti nilai dan akun debit sudah masuk Keuangan. <b>Provisional</b> berarti hanya metode pembayaran/akun lawan yang belum tersedia dari sumber.</p></div><span class="pfa-sync">'+a.length.toLocaleString('id-ID')+' transaksi periode ini'+esc(syncLine)+'</span></div>'+
    '<div class="pfa-cards">'+
      card('Sinkron ke Finance',money(total(synced)),synced.length+' transaksi canonical siap/terhubung','inventory')+
      card('Persediaan · 1300',money(total(inventory)),inventory.length+' transaksi persediaan','inventory')+
      card('Akun lawan provisional',money(total(provisional)),provisional.length+' transaksi; '+provisional2190.length+' memakai 2190','expense')+
      card('Perlu review',money(total(reviews)),reviews.length+' transaksi belum boleh diposting','review')+
    '</div>'+
    '<div class="pfa-meta"><div><b>Rincian akun beban</b>'+(breakdown||'<span>Tidak ada beban langsung pada periode/filter ini.</span>')+'</div><div><b>Status canonical</b><span>'+posted.length.toLocaleString('id-ID')+' posted/final</span><span>'+provisional.length.toLocaleString('id-ID')+' provisional</span><span>'+reviews.length.toLocaleString('id-ID')+' review</span><span>'+zeroRows.length.toLocaleString('id-ID')+' nilai Rp0</span></div></div>'+
    '<div class="pfa-note"><b>Catatan:</b> akun 2190 bukan transaksi hilang. Itu akun lawan sementara ketika file sumber tidak memberikan metode pembayaran. Rebuild jurnal hanya dijalankan lewat RPC Owner resmi.</div>'+
    '<div class="pfa-review-head"><div><h3>Transaksi ↔ Keuangan</h3><p>Seluruh transaksi periode terpilih beserta kode akun dan status pencatatannya.</p></div><span>'+synced.length.toLocaleString('id-ID')+' siap sinkron · '+reviews.length.toLocaleString('id-ID')+' review · '+zeroRows.length.toLocaleString('id-ID')+' nilai 0</span></div>'+renderAllTable(a)+
    '<div class="pfa-review-head"><div><h3>Prioritas Review</h3><p>Hanya transaksi yang belum boleh menjadi pencatatan final.</p></div><span>'+reviews.length.toLocaleString('id-ID')+' perlu review</span></div>'+renderReviewTable(a);
  target.insertAdjacentElement('afterend',wrap);
}
async function load(force){
  if(loading)return;if(!force&&rows.length&&Date.now()-loadedAt<60000){render();return}
  db=db||window.__HASNARIA_DB;if(!db)return;
  loading=true;error='';render();
  try{
    var q=await db.from('ui_purchase_accounting_detail_v1').select('source_history_id,source_period,effective_date,date_basis,item_name,total_amount,payment_method,analytics_group,analytics_category,accounting_treatment,accounting_label,debit_account_code,debit_account_name,counter_account_code,counter_account_name,finance_status,mapping_status,required_action').eq('brand_id',BRAND).order('effective_date',{ascending:true}).limit(10000);
    if(q.error)throw q.error;rows=q.data||[];loadedAt=Date.now();
  }catch(e){error='Gagal memuat klasifikasi Finance: '+(e&&e.message?e.message:String(e));}
  loading=false;render();
}
async function autoSyncFinance(){
  if(!db||syncing||syncDone()||syncSuppressed())return;
  syncing=true;syncMsg='';render();
  try{
    var r=await db.rpc('rebuild_finance_journal_v1',{p_from:'2026-06-01',p_to:'2026-09-30'});
    if(r.error)throw r.error;
    markSyncDone();syncMsg='jurnal diperbarui';
    rows=[];loadedAt=0;
    await load(true);
    try{window.dispatchEvent(new CustomEvent('hasnaria:finance-rebuilt',{detail:r.data||null}))}catch(e){}
  }catch(e){
    var msg=e&&e.message?String(e.message):String(e||'');
    if(/permission|not authorized|not allowed|row-level|jwt|auth/i.test(msg))suppressSyncThisSession();
    syncMsg='sync jurnal menunggu sesi Owner';
    if(window.console&&console.warn)console.warn('Hasnaria Purchase→Finance auto-sync pending:',e);
  }finally{syncing=false;render()}
}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){var root=document.getElementById('paRoot');if(!root)return;render();if(!rows.length&&!loading)load(false)},60)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var host=document.getElementById('pembelian');if(db&&host){
    observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});
    document.addEventListener('change',function(e){if(e.target&&((e.target.id==='paPeriod')||(e.target.id==='paScope')))setTimeout(render,20)},true);
    document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-tab="pembelian"]'))setTimeout(function(){schedule();load(false);autoSyncFinance()},80)},true);
    schedule();
    load(false).then(function(){setTimeout(autoSyncFinance,250)});
    return
  }if(tries++<120)setTimeout(wait,100)})();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
