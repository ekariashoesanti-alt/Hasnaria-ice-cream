(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V9)return;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V9=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var CATS=['Beban Administrasi','Beban Pemeliharaan','Beban Bahan Baku','Beban Kepegawaian'];
var db=null,rows=[],control={},loading=false,error='',observer=null,timer=0,loadedAt=0,loadedPeriod='',syncingStock=false,lastStockSync='';

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return isFinite(v)?v:0}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function qty(v){var x=n(v);return x.toLocaleString('id-ID',{maximumFractionDigits:3})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function dateLabel(v){var s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—'}
function total(a){return a.reduce(function(s,r){return s+n(r.total_amount)},0)}
function periodValue(){var p=document.getElementById('paPeriod');return p?periodKey(p.value):''}
function scopeValue(){var s=document.getElementById('paScope');return s?s.value:'all'}
function scoped(){var s=scopeValue();return rows.filter(function(r){return s==='all'||r.expense_category===s})}
function byCat(a,cat){return a.filter(function(r){return r.expense_category===cat})}
function stockPosted(a){return a.filter(function(r){return r.stock_status==='posted_to_stock'})}
function stockReady(a){return a.filter(function(r){return r.stock_status==='ready_to_stock'})}
function stockReview(a){return a.filter(function(r){return r.stock_status==='stock_review_required'})}
function monthRange(){var p=periodValue();if(!/^\d{4}-\d{2}$/.test(p))return null;var y=+p.slice(0,4),m=+p.slice(5,7);return{from:p+'-01',to:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),key:p}}

function patchScope(root){
  var s=root.querySelector('#paScope');if(!s)return;
  var wanted=['all'].concat(CATS),same=s.options.length===wanted.length;
  if(same){for(var i=0;i<wanted.length;i++){if(s.options[i].value!==wanted[i]){same=false;break}}}
  if(!same){var current=CATS.indexOf(s.value)>=0?s.value:'all';s.innerHTML='<option value="all">Semua kategori beban</option>'+CATS.map(function(x){return'<option value="'+esc(x)+'">'+esc(x)+'</option>'}).join('');s.value=current}
  var label=s.closest('label');if(label){var text=label.childNodes[0];if(text&&text.nodeType===3)text.textContent='Kategori '}
}
function patchCore(root){
  var sub=root.querySelector('.pa-title p');if(sub)sub.textContent='Satu sumber Pembelian: nilai rupiah → akun beban, jumlah barang → Stok.';
  patchScope(root);
}
function card(label,value,sub,cls){return'<article class="pfa-card '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||'')+'</small></article>'}
function statusPill(text,type){return'<span class="pfa-status '+(type||'')+'">'+esc(text)+'</span>'}
function stockCell(r){
  if(r.stock_status==='posted_to_stock')return statusPill('+'+qty(r.posted_stock_qty||r.source_stock_qty)+' '+(r.posted_stock_unit||r.source_stock_unit||'unit'),'ok')+'<small class="pfa-action">'+esc(r.inventory_item_name||'Stok')+'</small>';
  if(r.stock_status==='ready_to_stock')return statusPill('Siap sinkron','warn')+'<small class="pfa-action">'+esc(qty(r.source_stock_qty))+' '+esc(r.source_stock_unit||'unit')+' · '+esc(r.inventory_item_name||'stok')+'</small>';
  if(r.stock_status==='stock_review_required')return statusPill('Perlu mapping','warn')+'<small class="pfa-action">'+esc(r.stock_mapping_status||'mapping stok')+'</small>';
  return statusPill('Non-stok','');
}
function financeStatus(r){return r.category_status==='provisional'?statusPill('Sumber bayar belum lengkap','warn'):statusPill('Terjurnal','ok')}
function table(a){
  var show=a.slice().sort(function(x,y){return String(y.effective_date||'').localeCompare(String(x.effective_date||''))||n(y.total_amount)-n(x.total_amount)}).slice(0,180);
  if(!show.length)return'<div class="pfa-empty">Tidak ada transaksi Pembelian untuk kategori/periode ini.</div>';
  return'<div class="pfa-table-scroll"><table class="pfa-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Akun Beban</th><th class="num">Nilai</th><th>Stok Qty</th><th>Finance</th></tr></thead><tbody>'+show.map(function(r){return'<tr><td>'+esc(dateLabel(r.effective_date))+'</td><td><b>'+esc(r.item_name||'Tanpa nama')+'</b><small>'+esc(r.analytics_category||r.analytics_group||'')+'</small></td><td><b>'+esc(r.expense_account_code)+' · '+esc(r.expense_category)+'</b></td><td class="num">'+esc(money(r.total_amount))+'</td><td>'+stockCell(r)+'</td><td>'+financeStatus(r)+'</td></tr>'}).join('')+'</tbody></table></div>'+(a.length>show.length?'<div class="pfa-more">Menampilkan 180 transaksi terbaru dari '+a.length.toLocaleString('id-ID')+' transaksi.</div>':'')
}
function controlMarkup(){
  var match=control.finance_link_status==='MATCH',stockOk=control.stock_link_status==='OK';
  return'<div class="pfa-control-grid">'+
    '<div><b>Finance</b><span>Jurnal Pembelian '+statusPill(match?'MATCH':'MISMATCH',match?'ok':'bad')+'</span><span>Nilai jurnal <strong>'+esc(money(control.journal_purchase_expense))+'</strong></span><span>Delta <strong>'+esc(money(control.purchase_journal_delta))+'</strong></span></div>'+
    '<div><b>Stok</b><span>Status '+statusPill(stockOk?'OK':'REVIEW',stockOk?'ok':'warn')+'</span><span>Sudah masuk <strong>'+n(control.stock_posted_rows).toLocaleString('id-ID')+'</strong></span><span>Perlu mapping <strong>'+n(control.stock_review_rows).toLocaleString('id-ID')+'</strong></span></div>'+
    '<div><b>Kelengkapan sumber</b><span>Jurnal provisional <strong>'+n(control.provisional_journal_rows).toLocaleString('id-ID')+'</strong></span><span>Non-stok <strong>'+n(control.non_stock_rows).toLocaleString('id-ID')+'</strong></span><span>Mismatch qty <strong>'+n(control.stock_qty_mismatch_rows).toLocaleString('id-ID')+'</strong></span></div>'+
  '</div>'
}
function render(){
  var root=document.getElementById('paRoot');if(!root)return;patchCore(root);
  var old=document.getElementById('purchaseFinanceAlignment');if(old)old.remove();
  var target=root.querySelector('.pa-controls');if(!target)return;
  var wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';
  if(loading){wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">PEMBELIAN · SUMBER DATA</div><h2>Pembelian → Beban + Stok</h2><p>Memuat periode terpilih…</p></div></div>';target.insertAdjacentElement('afterend',wrap);return}
  if(error){wrap.innerHTML='<div class="pfa-head"><div><h2>Pembelian → Beban + Stok</h2><p class="pfa-error">'+esc(error)+'</p></div><button id="pfaRetry" type="button">Muat ulang</button></div>';target.insertAdjacentElement('afterend',wrap);var rb=document.getElementById('pfaRetry');if(rb)rb.onclick=function(){load(true)};return}
  var a=scoped(),admin=byCat(a,'Beban Administrasi'),maint=byCat(a,'Beban Pemeliharaan'),raw=byCat(a,'Beban Bahan Baku'),people=byCat(a,'Beban Kepegawaian'),sp=stockPosted(a),sr=stockReady(a),sm=stockReview(a);
  wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">SATU SUMBER · DUA RELASI</div><h2>Pembelian → Beban + Stok</h2><p>Nilai rupiah dicatat satu kali sebagai beban. Barang yang stockable menambah kuantitas Stok tanpa menambah nilai persediaan/HPP.</p></div><span class="pfa-sync">'+a.length.toLocaleString('id-ID')+' transaksi · '+esc(money(total(a)))+'</span></div>'+
    '<div class="pfa-cards pfa-cards-five">'+
      card('Total Pembelian',money(total(a)),a.length+' transaksi','total')+
      card('6100 · Administrasi',money(total(admin)),admin.length+' transaksi','expense')+
      card('6110 · Pemeliharaan',money(total(maint)),maint.length+' transaksi','expense')+
      card('6120 · Bahan Baku',money(total(raw)),raw.length+' transaksi','inventory')+
      card('6200 · Kepegawaian',money(total(people)),people.length+' transaksi','expense')+
    '</div>'+controlMarkup()+
    '<div class="pfa-note"><b>SOP aktif:</b> Pembelian adalah sumber nilai. Finance menerima jurnal double-entry dari transaksi yang sama; Stok hanya menerima kuantitas. Data pembayaran yang belum ada tetap dicatat provisional dan harus direkonsiliasi sebelum tutup buku.</div>'+
    '<div class="pfa-review-head"><div><h3>Rincian Transaksi</h3><p>Hubungan akun beban, nilai rupiah, dan kuantitas stok ditampilkan dalam satu baris.</p></div><span>'+a.length.toLocaleString('id-ID')+' transaksi</span></div>'+table(a);
  target.insertAdjacentElement('afterend',wrap);
}
async function syncStockForPeriod(){
  var r=monthRange();if(!db||!r||syncingStock||lastStockSync===r.key)return false;
  syncingStock=true;
  try{var q=await db.rpc('sync_purchase_quantity_stock_v1',{p_from:r.from,p_to:r.to});if(q.error)throw q.error;lastStockSync=r.key;return true}catch(e){if(console&&console.warn)console.warn('Purchase quantity → Stock sync:',e);return false}finally{syncingStock=false}
}
async function load(force){
  var p=periodValue();if(!p||loading)return;
  if(!force&&rows.length&&loadedPeriod===p&&Date.now()-loadedAt<60000){render();return}
  db=db||window.__HASNARIA_DB;if(!db)return;loading=true;error='';render();
  try{
    var q=await db.rpc('get_purchase_control_period_v1',{p_brand:BRAND,p_period:p+'-01'});if(q.error)throw q.error;
    var pack=q.data||{};rows=Array.isArray(pack.rows)?pack.rows:[];control=pack.control||{};loadedAt=Date.now();loadedPeriod=p;
    if(n(control.stock_ready_rows)>0){var synced=await syncStockForPeriod();if(synced){loading=false;rows=[];control={};loadedAt=0;loadedPeriod='';return load(true)}}
  }catch(e){rows=[];control={};loadedPeriod='';loadedAt=0;error='Gagal memuat hubungan Pembelian / Finance / Stok: '+(e&&e.message?e.message:String(e))}
  loading=false;render();
}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){if(!document.getElementById('paRoot'))return;render();if(!loading&&(!rows.length||loadedPeriod!==periodValue()))load(false)},80)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var host=document.getElementById('pembelian');if(db&&host){
    observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});
    document.addEventListener('change',function(e){if(!e.target)return;if(e.target.id==='paPeriod'){rows=[];control={};loadedAt=0;loadedPeriod='';lastStockSync='';load(true);return}if(e.target.id==='paScope')render()},true);
    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn,[data-tab="pembelian"]'):null;if(!b)return;if(b.matches('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn'))setTimeout(function(){rows=[];control={};loadedAt=0;loadedPeriod='';lastStockSync='';load(true)},350);else setTimeout(schedule,120)},true);
    load(true);return
  }if(tries++<150)setTimeout(wait,100)})()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
