(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V1)return;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V1=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,rows=[],loading=false,error='',observer=null,timer=0,loadedAt=0;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return isFinite(v)?v:0}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function total(a){return a.reduce(function(s,r){return s+n(r.total_amount)},0)}
function sumWhere(a,fn){return total(a.filter(fn))}
function countWhere(a,fn){return a.filter(fn).length}
function statusClass(s){return s==='posted'?'ok':s==='provisional'?'warn':'bad'}
function statusLabel(s){return s==='posted'?'Siap / posted':s==='provisional'?'Provisional':'Perlu review'}
function accountLabel(code,name){if(!code)return'—';return esc(code+' · '+(name||'Akun Finance'))}
function scopeValue(){var s=document.getElementById('paScope');return s?s.value:'all'}
function periodValue(){var p=document.getElementById('paPeriod');return p?periodKey(p.value):''}
function scoped(){var p=periodValue(),s=scopeValue();return rows.filter(function(r){if(periodKey(r.source_period)!==p)return false;return s==='all'||r.analytics_group===s})}
function reviewRows(a){return a.filter(function(r){return r.finance_status==='review_required'||r.accounting_treatment==='payment_review'||r.accounting_treatment==='classification_review'||r.accounting_treatment==='asset_review'||r.accounting_treatment==='expense_review'}).sort(function(a,b){return n(b.total_amount)-n(a.total_amount)})}
function patchCoreLabels(root){
  var sub=root.querySelector('.pa-title p');
  if(sub)sub.textContent='Monitoring pembelian, klasifikasi persediaan/beban/aset, dan kesiapan pencatatan ke Keuangan.';
  var first=root.querySelector('.pa-kpis article:first-child span');
  if(first&&/^Total Pengeluaran/.test(first.textContent))first.textContent=first.textContent.replace(/^Total Pengeluaran/,'Total Data Pembelian');
  var comp=root.querySelector('.pa-main-grid article:nth-child(2) h2');
  if(comp)comp.textContent=comp.textContent.replace('Komposisi Kategori','Komposisi Kategori Operasional');
}
function card(label,value,sub,cls){return'<article class="pfa-card '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></article>'}
function renderTable(a){
  var rr=reviewRows(a),show=rr.slice(0,12);
  if(!show.length)return'<div class="pfa-empty">Tidak ada transaksi yang memerlukan review untuk filter ini.</div>';
  return'<div class="pfa-table-scroll"><table class="pfa-table"><thead><tr><th>Item</th><th>Perlakuan</th><th>Akun Debit</th><th>Pembayaran / Akun Lawan</th><th>Nilai</th><th>Status</th></tr></thead><tbody>'+show.map(function(r){
    var pay=(r.payment_method||'Belum dirinci')+(r.counter_account_code?' · '+r.counter_account_code:'');
    return'<tr><td><b>'+esc(r.item_name||'Tanpa nama')+'</b><small>'+esc(r.analytics_category||r.analytics_group||'')+'</small></td><td>'+esc(r.accounting_label||'Perlu klasifikasi')+'</td><td>'+accountLabel(r.debit_account_code,r.debit_account_name)+'</td><td>'+esc(pay)+'</td><td class="num">'+esc(money(r.total_amount))+'</td><td><span class="pfa-status '+statusClass(r.finance_status)+'">'+esc(statusLabel(r.finance_status))+'</span>'+(r.required_action?'<small class="pfa-action">'+esc(r.required_action)+'</small>':'')+'</td></tr>'
  }).join('')+'</tbody></table></div>'+(rr.length>show.length?'<div class="pfa-more">Menampilkan 12 prioritas terbesar dari '+rr.length.toLocaleString('id-ID')+' transaksi yang perlu review.</div>':'')
}
function render(){
  var root=document.getElementById('paRoot');if(!root)return;
  patchCoreLabels(root);
  var old=document.getElementById('purchaseFinanceAlignment');if(old)old.remove();
  var target=root.querySelector('.pa-kpis')||root.querySelector('.pa-controls');if(!target)return;
  var wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';
  if(loading){wrap.innerHTML='<div class="pfa-head"><div><h2>Klasifikasi ke Keuangan</h2><p>Memuat mapping akun dari backend Finance…</p></div></div>';target.insertAdjacentElement('afterend',wrap);return}
  if(error){wrap.innerHTML='<div class="pfa-head"><div><h2>Klasifikasi ke Keuangan</h2><p class="pfa-error">'+esc(error)+'</p></div><button id="pfaRetry" type="button">Muat ulang</button></div>';target.insertAdjacentElement('afterend',wrap);var rb=document.getElementById('pfaRetry');if(rb)rb.onclick=function(){load(true)};return}
  var a=scoped();
  var inventory=a.filter(function(r){return r.accounting_treatment==='inventory'}),expense=a.filter(function(r){return r.accounting_treatment==='expense'}),asset=a.filter(function(r){return r.accounting_treatment==='asset_review'}),reviews=reviewRows(a),periodSummary=a.filter(function(r){return r.date_basis==='period_summary'}),provisional=a.filter(function(r){return r.finance_status==='provisional'});
  var expenseAccounts={};expense.forEach(function(r){var k=r.debit_account_code||'—';if(!expenseAccounts[k])expenseAccounts[k]={name:r.debit_account_name||'Beban',amount:0};expenseAccounts[k].amount+=n(r.total_amount)});
  var breakdown=Object.keys(expenseAccounts).sort().map(function(k){return'<span><b>'+esc(k)+'</b> '+esc(expenseAccounts[k].name)+' <strong>'+esc(money(expenseAccounts[k].amount))+'</strong></span>'}).join('');
  wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">BACKEND FINANCE · COA CANONICAL</div><h2>Klasifikasi ke Keuangan</h2><p>Bahan dagang masuk <b>Persediaan 1300</b>; HPP 5000 baru diakui saat penjualan. Pembelian yang merupakan biaya langsung masuk akun beban sesuai kategori.</p></div><span class="pfa-sync">'+a.length.toLocaleString('id-ID')+' baris periode ini</span></div>'+
    '<div class="pfa-cards">'+
      card('Persediaan · 1300',money(total(inventory)),inventory.length+' transaksi yang terhubung ke persediaan','inventory')+
      card('Beban periode',money(total(expense)),expense.length+' transaksi sudah punya akun beban','expense')+
      card('Kandidat aset · 1500',money(total(asset)),asset.length+' transaksi perlu konfirmasi kapitalisasi','asset')+
      card('Perlu review',money(total(reviews)),reviews.length+' transaksi belum final','review')+
    '</div>'+
    '<div class="pfa-meta"><div><b>Rincian akun beban</b>'+(breakdown||'<span>Belum ada beban terklasifikasi pada filter ini.</span>')+'</div><div><b>Kualitas pencatatan</b><span>'+periodSummary.length.toLocaleString('id-ID')+' ringkasan biaya memakai tanggal periode</span><span>'+provisional.length.toLocaleString('id-ID')+' jurnal provisional karena sumber pembayaran belum final</span></div></div>'+
    '<div class="pfa-note"><b>Prinsip pencatatan:</b> kategori seperti makanan/kemasan tetap dipakai untuk analitik Pembelian, sedangkan akun Finance ditentukan dari perlakuan akuntansinya. Jadi label “Operasi” tidak otomatis berarti HPP atau beban.</div>'+
    '<div class="pfa-review-head"><div><h3>Prioritas Rekonsiliasi</h3><p>Transaksi yang belum dapat dianggap final di Keuangan.</p></div><span>'+reviews.length.toLocaleString('id-ID')+' perlu review</span></div>'+renderTable(a);
  target.insertAdjacentElement('afterend',wrap);
}
async function load(force){
  if(loading)return;if(!force&&rows.length&&Date.now()-loadedAt<60000){render();return}
  db=db||window.__HASNARIA_DB;if(!db)return;
  loading=true;error='';render();
  try{
    var q=await db.from('ui_purchase_accounting_detail_v1').select('source_history_id,source_period,effective_date,date_basis,item_name,total_amount,payment_method,analytics_group,analytics_category,accounting_treatment,accounting_label,debit_account_code,debit_account_name,counter_account_code,counter_account_name,finance_status,mapping_status,required_action').eq('brand_id',BRAND).order('source_period',{ascending:true}).limit(10000);
    if(q.error)throw q.error;rows=q.data||[];loadedAt=Date.now();
  }catch(e){error='Gagal memuat klasifikasi Finance: '+(e&&e.message?e.message:String(e));}
  loading=false;render();
}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){var root=document.getElementById('paRoot');if(!root)return;render();if(!rows.length&&!loading)load(false)},60)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var host=document.getElementById('pembelian');if(db&&host){observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});document.addEventListener('change',function(e){if(e.target&&((e.target.id==='paPeriod')||(e.target.id==='paScope')))setTimeout(render,20)},true);document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-tab="pembelian"]'))setTimeout(function(){schedule();load(false)},80)},true);schedule();load(false);return}if(tries++<120)setTimeout(wait,100)})();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
