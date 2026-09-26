(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V6)return;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V6=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,rows=[],loading=false,error='',observer=null,timer=0,loadedAt=0;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return isFinite(v)?v:0}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function dateLabel(v){var s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—'}
function total(a){return a.reduce(function(s,r){return s+n(r.total_amount)},0)}
function periodValue(){var p=document.getElementById('paPeriod');return p?periodKey(p.value):''}
function scopeValue(){var s=document.getElementById('paScope');return s?s.value:'all'}
function scoped(){var p=periodValue(),s=scopeValue();return rows.filter(function(r){if(periodKey(r.effective_date||r.period_month)!==p)return false;return s==='all'||r.analytics_group===s})}
function byCat(a,cat){return a.filter(function(r){return r.expense_category===cat})}
function reviews(a){return a.filter(function(r){return r.category_status==='provisional_review'})}

function patchCore(root){
  var sub=root.querySelector('.pa-title p');if(sub)sub.textContent='Monitoring pembelian dan pengelompokan beban manajerial berdasarkan tanggal transaksi efektif.';
  var first=root.querySelector('.pa-kpis article:first-child span');if(first&&/^Total Pengeluaran/.test(first.textContent))first.textContent=first.textContent.replace(/^Total Pengeluaran/,'Total Data Pembelian');
}
function card(label,value,sub,cls){return'<article class="pfa-card '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></article>'}
function table(a){
  var show=a.slice().sort(function(x,y){return String(y.effective_date||'').localeCompare(String(x.effective_date||''))||n(y.total_amount)-n(x.total_amount)}).slice(0,180);
  if(!show.length)return'<div class="pfa-empty">Tidak ada transaksi Pembelian untuk periode ini.</div>';
  return'<div class="pfa-table-scroll"><table class="pfa-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Kategori Beban</th><th>Sumber Kategori</th><th>Nilai</th><th>Status</th></tr></thead><tbody>'+show.map(function(r){var review=r.category_status==='provisional_review';return'<tr><td>'+esc(dateLabel(r.effective_date))+'</td><td><b>'+esc(r.item_name||'Tanpa nama')+'</b><small>'+esc(r.analytics_category||r.analytics_group||'')+'</small></td><td><b>'+esc(r.expense_category)+'</b></td><td>'+esc(r.analytics_group||'—')+' / '+esc(r.analytics_category||'—')+'</td><td class="num">'+esc(money(r.total_amount))+'</td><td><span class="pfa-status '+(review?'warn':'ok')+'">'+(review?'Review sumber':'Terklasifikasi')+'</span></td></tr>'}).join('')+'</tbody></table></div>'+(a.length>show.length?'<div class="pfa-more">Menampilkan 180 transaksi terbaru dari '+a.length.toLocaleString('id-ID')+' transaksi.</div>':'')
}
function render(){
  var root=document.getElementById('paRoot');if(!root)return;patchCore(root);
  var old=document.getElementById('purchaseFinanceAlignment');if(old)old.remove();
  var target=root.querySelector('.pa-kpis')||root.querySelector('.pa-controls');if(!target)return;
  var wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';
  if(loading){wrap.innerHTML='<div class="pfa-head"><div><h2>Kategori Beban Pembelian</h2><p>Memuat klasifikasi beban…</p></div></div>';target.insertAdjacentElement('afterend',wrap);return}
  if(error){wrap.innerHTML='<div class="pfa-head"><div><h2>Kategori Beban Pembelian</h2><p class="pfa-error">'+esc(error)+'</p></div><button id="pfaRetry" type="button">Muat ulang</button></div>';target.insertAdjacentElement('afterend',wrap);var rb=document.getElementById('pfaRetry');if(rb)rb.onclick=function(){load(true)};return}
  var a=scoped(),admin=byCat(a,'Beban Administrasi'),maint=byCat(a,'Beban Pemeliharaan'),raw=byCat(a,'Beban Bahan Baku'),people=byCat(a,'Beban Kepegawaian'),rr=reviews(a);
  wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">PEMBELIAN → LAPORAN HASIL USAHA</div><h2>Kategori Beban Pembelian</h2><p>Seluruh Pembelian positif dikelompokkan ke empat kategori beban manajerial. Model ini tidak memakai komponen HPP.</p></div><span class="pfa-sync">'+a.length.toLocaleString('id-ID')+' transaksi · '+esc(money(total(a)))+'</span></div>'+
    '<div class="pfa-cards">'+
      card('Beban Administrasi',money(total(admin)),admin.length+' transaksi','expense')+
      card('Beban Pemeliharaan',money(total(maint)),maint.length+' transaksi','inventory')+
      card('Beban Bahan Baku',money(total(raw)),raw.length+' transaksi','inventory')+
      card('Beban Kepegawaian',money(total(people)),people.length+' transaksi','expense')+
    '</div>'+
    '<div class="pfa-meta"><div><b>Kontrol periode</b><span>Total Pembelian <strong>'+esc(money(total(a)))+'</strong></span><span>Transaksi review <strong>'+rr.length.toLocaleString('id-ID')+'</strong></span><span>Nilai review <strong>'+esc(money(total(rr)))+'</strong></span></div><div><b>Basis perhitungan</b><span>Administrasi <strong>'+esc(money(total(admin)))+'</strong></span><span>Pemeliharaan <strong>'+esc(money(total(maint)))+'</strong></span><span>Bahan Baku <strong>'+esc(money(total(raw)))+'</strong></span><span>Kepegawaian <strong>'+esc(money(total(people)))+'</strong></span></div></div>'+
    '<div class="pfa-note"><b>Catatan:</b> kategori ini dipakai untuk laporan manajerial berbasis Pembelian. Data jurnal historis tetap disimpan untuk audit; transaksi review tetap ditandai agar sumbernya dapat ditelusuri.</div>'+
    '<div class="pfa-review-head"><div><h3>Rincian Transaksi</h3><p>Transaksi periode terpilih beserta kategori beban yang digunakan pada laporan hasil usaha.</p></div><span>'+a.length.toLocaleString('id-ID')+' transaksi</span></div>'+table(a);
  target.insertAdjacentElement('afterend',wrap);
}
async function load(force){
  if(loading)return;if(!force&&rows.length&&Date.now()-loadedAt<60000){render();return}db=db||window.__HASNARIA_DB;if(!db)return;loading=true;error='';render();
  try{var q=await db.from('finance_purchase_expense_category_v1').select('source_history_id,source_period,effective_date,period_month,item_name,total_amount,payment_method,analytics_group,analytics_category,expense_category,category_status').eq('brand_id',BRAND).order('effective_date',{ascending:true}).limit(10000);if(q.error)throw q.error;rows=q.data||[];loadedAt=Date.now()}catch(e){error='Gagal memuat kategori beban: '+(e&&e.message?e.message:String(e))}
  loading=false;render();
}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){if(document.getElementById('paRoot')){render();if(!rows.length&&!loading)load(false)}},60)}
function boot(){db=window.__HASNARIA_DB||null;var tries=0;(function wait(){db=db||window.__HASNARIA_DB||null;var host=document.getElementById('pembelian');if(db&&host){observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});document.addEventListener('change',function(e){if(e.target&&(e.target.id==='paPeriod'||e.target.id==='paScope'))schedule()},true);document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn,[data-tab="pembelian"]'):null;if(b)setTimeout(function(){rows=[];loadedAt=0;load(true)},180)},true);load(true);return}if(tries++<150)setTimeout(wait,100)})()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();