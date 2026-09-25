(function(){
'use strict';
if(window.__HASNARIA_FINANCE_PROVISIONAL_SYNC_V1)return;
window.__HASNARIA_FINANCE_PROVISIONAL_SYNC_V1=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,observer=null,timer=0,syncing=false,lastSync=0,lastPeriod='',row=null,syncRow=null,error='';
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function n(v){v=Number(v);return isFinite(v)?v:0}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7)+'-01':''}
function monthLabel(v){var p=periodKey(v);return p?(MONTHS[Number(p.slice(5,7))-1]+' '+p.slice(0,4)):'—'}
function isOwner(){var c=window.__HASNARIA_CONTEXT;return!!(c&&c.role==='owner')}
function currentPeriod(){var e=document.getElementById('financeV6Period');return periodKey(e&&e.value)}
function host(){var h=document.getElementById('ops');return h&&!h.classList.contains('hidden')?h:null}
function root(){var h=host();return h&&h.querySelector('[data-finance-v6="1"]')}
function css(){
  if(document.getElementById('finance-provisional-sync-v1-css'))return;
  var s=document.createElement('style');s.id='finance-provisional-sync-v1-css';
  s.textContent='\
.fps-wrap{margin:10px 0 12px;border:1px solid #ead89d;background:#fffaf0;border-radius:14px;padding:12px}.fps-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.fps-head h3{margin:0;font-size:13px;color:#493b19}.fps-head p{margin:4px 0 0;font-size:10px;line-height:1.45;color:#78683c}.fps-badge{white-space:nowrap;border:1px solid #ddc470;background:#fff4cb;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;color:#735710}.fps-badge.ok{background:#eaf6f1;border-color:#b8dccc;color:#176b55}.fps-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:10px}.fps-card{background:#fff;border:1px solid #eee3bf;border-radius:10px;padding:8px}.fps-card span{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;color:#8a7950}.fps-card b{display:block;margin-top:4px;font-size:12px;color:#3d3218}.fps-card b.neg{color:#a93434}.fps-note{margin-top:9px;font-size:9.5px;line-height:1.5;color:#76663c}.fps-note b{color:#4b3b13}.fps-review{margin-top:7px;padding-top:7px;border-top:1px dashed #e0ce94;font-size:9px;color:#846b26}@media(max-width:820px){.fps-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  document.head.appendChild(s);
}
function remove(){var x=document.getElementById('financeProvisionalSync');if(x)x.remove()}
function render(){
  var r=root();if(!r)return;css();remove();
  if(!row)return;
  var report=r.querySelector('.fsv2-report')||r;
  var title=report.querySelector('.fsv2-report-title');
  var el=document.createElement('section');el.id='financeProvisionalSync';el.className='fps-wrap';
  var provisional=row.pnl_basis==='purchase_basis_provisional';
  var syncOk=!syncRow||!syncRow.sync_required;
  var hasPurchase=n(row.inventory_purchase_amount)>0||n(row.canonical_purchase_expense)>0||n(row.purchase_review_rows)>0;
  var basis=provisional?'Basis Pembelian · Sementara':'HPP Terverifikasi';
  var note=provisional
    ?(hasPurchase?'HPP sementara menggunakan pembelian persediaan pada bulan ini. Angka ini untuk monitoring dan akan otomatis diganti saat HPP resep terverifikasi 100%.':'Belum ada data Pembelian pada bulan ini. Laba sementara belum memasukkan HPP dan tidak boleh dianggap final.')
    :'HPP sudah terverifikasi; angka formal Laba/Rugi menjadi acuan.';
  el.innerHTML='<div class="fps-head"><div><h3>Laba/Rugi '+(provisional?'Sementara':'Terhubung')+' · '+esc(monthLabel(row.period_month))+'</h3><p>Jembatan Pembelian → Keuangan tanpa double-count. Review/ambigu tidak dipaksa masuk.</p></div><span class="fps-badge '+(syncOk?'ok':'')+'">'+(syncing?'MENYINKRONKAN':(syncOk?'PURCHASE ↔ JOURNAL OK':'MENUNGGU SYNC'))+'</span></div>'+
    '<div class="fps-grid">'+
      '<div class="fps-card"><span>Pendapatan</span><b>'+money(row.revenue_sales)+'</b></div>'+
      '<div class="fps-card"><span>HPP '+(provisional?'sementara':'final')+'</span><b>'+money(row.cogs_display)+'</b></div>'+
      '<div class="fps-card"><span>Beban operasional</span><b>'+money(row.operating_expense_adjusted)+'</b></div>'+
      '<div class="fps-card"><span>Laba / rugi '+(provisional?'sementara':'final')+'</span><b class="'+(n(row.profit_after_tax_display)<0?'neg':'')+'">'+money(row.profit_after_tax_display)+'</b></div>'+
      '<div class="fps-card"><span>Review Pembelian</span><b>'+n(row.purchase_review_rows).toLocaleString('id-ID')+' · '+money(row.purchase_review_amount)+'</b></div>'+
    '</div>'+
    '<div class="fps-note"><b>'+esc(basis)+'.</b> '+esc(note)+'</div>'+
    (!syncOk?'<div class="fps-review">Jurnal bulan ini masih berbeda dengan canonical Pembelian. Auto-sync Owner akan merebuild hanya periode open yang memiliki gap.</div>':'')+
    (error?'<div class="fps-review">'+esc(error)+'</div>':'');
  if(title&&title.parentNode)title.insertAdjacentElement('afterend',el);else report.insertBefore(el,report.firstChild);
}
async function loadPeriod(){
  if(!db||!isOwner())return;
  var p=currentPeriod();if(!p)return;
  try{
    var a=await db.from('finance_income_statement_provisional_v1').select('*').eq('brand_id',BRAND).eq('period_month',p).maybeSingle();
    if(a.error)throw a.error;row=a.data||null;
    var b=await db.from('finance_purchase_sync_status_v1').select('period_month,sync_required,inventory_rows,inventory_purchase_amount,expense_rows,canonical_purchase_expense,journal_inventory_rows,journal_inventory_amount,journal_expense_rows,journal_expense_amount').eq('brand_id',BRAND).eq('period_month',p).maybeSingle();
    if(b.error)throw b.error;syncRow=b.data||null;error='';lastPeriod=p;render();
  }catch(e){error='Gagal memuat jembatan Pembelian → Laba/Rugi: '+(e&&e.message?e.message:String(e));render()}
}
async function syncAll(force){
  if(!db||!isOwner()||syncing)return;
  var now=Date.now();if(!force&&now-lastSync<60000)return;
  syncing=true;error='';render();
  try{
    var r=await db.rpc('sync_purchase_finance_all_open_v1');
    if(r.error)throw r.error;
    lastSync=Date.now();
    await loadPeriod();
    try{window.dispatchEvent(new CustomEvent('hasnaria:purchase-finance-synced',{detail:r.data||null}))}catch(_){ }
    if(window.__HASNARIA_FINANCE_V6_MOUNT)setTimeout(function(){window.__HASNARIA_FINANCE_V6_MOUNT({force:true});setTimeout(loadPeriod,450)},80);
  }catch(e){
    error='Auto-sync belum berhasil: '+(e&&e.message?e.message:String(e));
  }finally{syncing=false;render()}
}
function schedule(forceSync){clearTimeout(timer);timer=setTimeout(async function(){if(!root())return;await loadPeriod();if(forceSync)await syncAll(false)},120)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;if(db&&isOwner()){
    css();var h=document.getElementById('ops');if(h){observer=new MutationObserver(function(){if(root())schedule(false)});observer.observe(h,{childList:true,subtree:true})}
    document.addEventListener('change',function(e){if(e.target&&e.target.id==='financeV6Period')schedule(false)},true);
    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-tab="ops"]'):null;if(b)setTimeout(function(){schedule(true)},180)},true);
    document.addEventListener('visibilitychange',function(){if(!document.hidden&&root())syncAll(false)});
    window.addEventListener('hasnaria:finance-rebuilt',function(){schedule(false)});
    window.addEventListener('hasnaria:purchase-finance-synced',function(){schedule(false)});
    schedule(true);return;
  }if(tries++<150)setTimeout(wait,100)})();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
