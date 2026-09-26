(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V8)return;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V8=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,rows=[],loading=false,error='',observer=null,timer=0,loadedAt=0,loadedPeriod='',syncingStock=false,lastStockSync='';

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return isFinite(v)?v:0}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function qty(v){var x=n(v);return x.toLocaleString('id-ID',{maximumFractionDigits:3})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function dateLabel(v){var s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—'}
function total(a){return a.reduce(function(s,r){return s+n(r.total_amount)},0)}
function periodValue(){var p=document.getElementById('paPeriod');return p?periodKey(p.value):''}
function scopeValue(){var s=document.getElementById('paScope');return s?s.value:'all'}
function scoped(){var p=periodValue(),s=scopeValue();return rows.filter(function(r){if(periodKey(r.effective_date||r.period_month)!==p)return false;return s==='all'||r.analytics_group===s})}
function byCat(a,cat){return a.filter(function(r){return r.expense_category===cat})}
function reviews(a){return a.filter(function(r){return r.category_status==='provisional_review'})}
function stockPosted(a){return a.filter(function(r){return r.stock_status==='posted_to_stock'})}
function stockReady(a){return a.filter(function(r){return r.stock_status==='ready_to_stock'})}
function stockReview(a){return a.filter(function(r){return r.stock_status==='stock_review_required'})}

function monthRange(){var p=periodValue();if(!/^\d{4}-\d{2}$/.test(p))return null;var y=+p.slice(0,4),m=+p.slice(5,7);var end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);return{from:p+'-01',to:end,key:p}}
async function syncStockForPeriod(force){
  var r=monthRange();if(!db||!r||syncingStock||(!force&&lastStockSync===r.key))return false;
  syncingStock=true;
  try{
    var q=await db.rpc('sync_purchase_quantity_stock_v1',{p_from:r.from,p_to:r.to});
    if(q.error)throw q.error;
    lastStockSync=r.key;rows=[];loadedAt=0;loadedPeriod='';
    return true;
  }catch(e){
    if(window.console&&console.warn)console.warn('Purchase quantity → Stock sync:',e);
    return false;
  }finally{syncingStock=false}
}

function patchCore(root){
  var sub=root.querySelector('.pa-title p');if(sub)sub.textContent='Nilai rupiah Pembelian masuk akun beban; jumlah barang yang terpetakan masuk Stok.';
  var first=root.querySelector('.pa-kpis article:first-child span');if(first&&/^Total Pengeluaran/.test(first.textContent))first.textContent=first.textContent.replace(/^Total Pengeluaran/,'Total Data Pembelian');
}
function card(label,value,sub,cls){return'<article class="pfa-card '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></article>'}
function stockCell(r){
  if(r.stock_status==='posted_to_stock')return'<span class="pfa-status ok">+'+esc(qty(r.posted_stock_qty||r.source_stock_qty))+' '+esc(r.posted_stock_unit||r.source_stock_unit||'unit')+'</span><small class="pfa-action">'+esc(r.inventory_item_name||'Stok')+'</small>';
  if(r.stock_status==='ready_to_stock')return'<span class="pfa-status warn">Siap sinkron</span><small class="pfa-action">'+esc(qty(r.source_stock_qty))+' '+esc(r.source_stock_unit||'unit')+' · '+esc(r.inventory_item_name||'stok')+'</small>';
  if(r.stock_status==='stock_review_required')return'<span class="pfa-status warn">Perlu mapping stok</span><small class="pfa-action">'+esc(r.stock_mapping_status||'mapping')+'</small>';
  return'<span class="pfa-status">Non-stok</span>';
}
function table(a){
  var show=a.slice().sort(function(x,y){return String(y.effective_date||'').localeCompare(String(x.effective_date||''))||n(y.total_amount)-n(x.total_amount)}).slice(0,180);
  if(!show.length)return'<div class="pfa-empty">Tidak ada transaksi Pembelian untuk periode ini.</div>';
  return'<div class="pfa-table-scroll"><table class="pfa-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Akun Beban</th><th class="num">Nilai Rupiah</th><th>Masuk Stok</th><th>Status</th></tr></thead><tbody>'+show.map(function(r){var review=r.category_status==='provisional_review';return'<tr><td>'+esc(dateLabel(r.effective_date))+'</td><td><b>'+esc(r.item_name||'Tanpa nama')+'</b><small>'+esc(r.analytics_category||r.analytics_group||'')+'</small></td><td><b>'+esc(r.expense_account_code)+' · '+esc(r.expense_category)+'</b></td><td class="num">'+esc(money(r.total_amount))+'</td><td>'+stockCell(r)+'</td><td><span class="pfa-status '+(review?'warn':'ok')+'">'+(review?'Review sumber':'Beban terklasifikasi')+'</span></td></tr>'}).join('')+'</tbody></table></div>'+(a.length>show.length?'<div class="pfa-more">Menampilkan 180 transaksi terbaru dari '+a.length.toLocaleString('id-ID')+' transaksi.</div>':'')
}
function render(){
  var root=document.getElementById('paRoot');if(!root)return;patchCore(root);
  var old=document.getElementById('purchaseFinanceAlignment');if(old)old.remove();
  var target=root.querySelector('.pa-kpis')||root.querySelector('.pa-controls');if(!target)return;
  var wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';
  if(loading){wrap.innerHTML='<div class="pfa-head"><div><h2>Pembelian → Beban + Stok</h2><p>Memuat periode terpilih…</p></div></div>';target.insertAdjacentElement('afterend',wrap);return}
  if(error){wrap.innerHTML='<div class="pfa-head"><div><h2>Pembelian → Beban + Stok</h2><p class="pfa-error">'+esc(error)+'</p></div><button id="pfaRetry" type="button">Muat ulang</button></div>';target.insertAdjacentElement('afterend',wrap);var rb=document.getElementById('pfaRetry');if(rb)rb.onclick=function(){load(true)};return}
  var a=scoped(),admin=byCat(a,'Beban Administrasi'),maint=byCat(a,'Beban Pemeliharaan'),raw=byCat(a,'Beban Bahan Baku'),people=byCat(a,'Beban Kepegawaian'),rr=reviews(a),sp=stockPosted(a),sr=stockReady(a),sm=stockReview(a);
  wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">PEMBELIAN → FINANCE + STOCK</div><h2>Pembelian → Beban + Stok</h2><p><b>Nilai rupiah</b> masuk akun beban. <b>Jumlah barang</b> masuk stok bila item dan satuannya sudah terpetakan. Tidak ada HPP pada model aktif.</p></div><span class="pfa-sync">'+a.length.toLocaleString('id-ID')+' transaksi · '+esc(money(total(a)))+'</span></div>'+
    '<div class="pfa-cards">'+
      card('6100 · Beban Administrasi',money(total(admin)),admin.length+' transaksi','expense')+
      card('6110 · Beban Pemeliharaan',money(total(maint)),maint.length+' transaksi','inventory')+
      card('6120 · Beban Bahan Baku',money(total(raw)),raw.length+' transaksi','inventory')+
      card('6200 · Beban Kepegawaian',money(total(people)),people.length+' transaksi','expense')+
    '</div>'+
    '<div class="pfa-meta"><div><b>Sinkronisasi stok</b><span>Sudah masuk stok <strong>'+sp.length.toLocaleString('id-ID')+'</strong></span><span>Siap disinkron <strong>'+sr.length.toLocaleString('id-ID')+'</strong></span><span>Perlu mapping stok <strong>'+sm.length.toLocaleString('id-ID')+'</strong></span></div><div><b>Kontrol Finance</b><span>Total beban Pembelian <strong>'+esc(money(total(a)))+'</strong></span><span>Transaksi review <strong>'+rr.length.toLocaleString('id-ID')+'</strong></span><span>Nilai review <strong>'+esc(money(total(rr)))+'</strong></span></div></div>'+
    '<div class="pfa-note"><b>Aturan:</b> rupiah Pembelian tidak menambah nilai aset Persediaan. Stok hanya menerima kuantitas operasional; nilai Pembelian tetap menjadi beban periode.</div>'+
    '<div class="pfa-review-head"><div><h3>Rincian Transaksi</h3><p>Satu transaksi menampilkan dua sisi sekaligus: akun beban rupiah dan kuantitas yang masuk Stok.</p></div><span>'+a.length.toLocaleString('id-ID')+' transaksi</span></div>'+table(a);
  target.insertAdjacentElement('afterend',wrap);
}
async function load(force){
  var p=periodValue();
  if(!p||loading)return;
  if(!force&&rows.length&&loadedPeriod===p&&Date.now()-loadedAt<60000){render();return}
  db=db||window.__HASNARIA_DB;if(!db)return;
  loading=true;error='';render();
  try{
    var q=await db.rpc('get_purchase_dual_posting_period_v1',{p_brand:BRAND,p_period:p+'-01'});
    if(q.error)throw q.error;
    rows=Array.isArray(q.data)?q.data:[];loadedAt=Date.now();loadedPeriod=p;
    if(rows.some(function(r){return r.stock_status==='ready_to_stock'})){
      var synced=await syncStockForPeriod(false);
      if(synced){loading=false;return load(true)}
    }
  }catch(e){
    rows=[];loadedPeriod='';loadedAt=0;
    error='Gagal memuat akun beban / stok: '+(e&&e.message?e.message:String(e));
  }
  loading=false;render();
}
function schedule(){
  clearTimeout(timer);
  timer=setTimeout(function(){
    if(!document.getElementById('paRoot'))return;
    render();
    if(!loading&&(!rows.length||loadedPeriod!==periodValue()))load(false);
  },60)
}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){
    db=db||window.__HASNARIA_DB||null;var host=document.getElementById('pembelian');
    if(db&&host){
      observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});
      document.addEventListener('change',function(e){
        if(!e.target)return;
        if(e.target.id==='paPeriod'){
          rows=[];loadedAt=0;loadedPeriod='';lastStockSync='';load(true);return;
        }
        if(e.target.id==='paScope')schedule();
      },true);
      document.addEventListener('click',function(e){
        var b=e.target&&e.target.closest?e.target.closest('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn,[data-tab="pembelian"]'):null;
        if(!b)return;
        if(b.matches('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn')){
          setTimeout(function(){rows=[];loadedAt=0;loadedPeriod='';lastStockSync='';load(true)},250);
        }else{
          setTimeout(schedule,120);
        }
      },true);
      load(true);return;
    }
    if(tries++<150)setTimeout(wait,100)
  })()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
