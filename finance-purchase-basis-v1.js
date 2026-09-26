(function(){
'use strict';
if(window.__HASNARIA_FINANCE_PURCHASE_BASIS_V3)return;
window.__HASNARIA_FINANCE_PURCHASE_BASIS_V3=true;
window.__HASNARIA_FINANCE_PURCHASE_BASIS_V2=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,pack=null,observer=null,timer=0,patching=false,loading=false,loadedPeriod='';
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function n(v){v=Number(v);return isFinite(v)?v:0}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7)+'-01':''}
function monthLabel(v){var p=periodKey(v);if(!p)return'—';return MONTHS[Number(p.slice(5,7))-1]+' '+p.slice(0,4)}
function isOwner(){var c=window.__HASNARIA_CONTEXT;return!!(c&&c.role==='owner')}
function host(){var h=document.getElementById('ops');return h&&!h.classList.contains('hidden')?h:null}
function root(){var h=host();return h?h.querySelector('[data-finance-v6="1"]'):null}
function selectedPeriod(){var e=document.getElementById('financeV6Period');return periodKey(e&&e.value)}
function incomeActive(r){return!!(r&&r.querySelector('[data-fin-view="income"].on'))}
function row(label,cur,prev,cls,negative){return'<div class="finv7-row '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+(negative?'-':'')+esc(money(cur))+'</strong><strong>'+(negative?'-':'')+esc(money(prev))+'</strong></div>'}
function pill(text,cls){return'<span class="finmg-pill '+(cls||'')+'">'+esc(text)+'</span>'}
function ensureCss(){if(document.getElementById('finance-management-v3-css'))return;var s=document.createElement('style');s.id='finance-management-v3-css';s.textContent='.finmg-control{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.finmg-control>div{border:1px solid #e0ebe6;border-radius:11px;padding:9px 10px;background:#fafcfb}.finmg-control b{display:block;font-size:9.5px;color:#315e4f;margin-bottom:4px}.finmg-control span{font-size:9px;color:#687d74}.finmg-pill{display:inline-block!important;border-radius:999px;padding:3px 6px!important;font-size:8.5px!important;font-weight:900!important;background:#eef3f1;color:#52675f}.finmg-pill.ok{background:#e7f7ef;color:#176b55}.finmg-pill.warn{background:#fff6dc;color:#8a6615}.finmg-pill.bad{background:#fff0f0;color:#a13d3d}.finmg-note{margin-top:9px;border-radius:10px;padding:8px 10px;font-size:9.5px;line-height:1.5;background:#eef8f4;color:#315e4f}.finmg-note.warn{background:#fff8df;color:#735710}.finmg-note.bad{background:#fff0f0;color:#973d3d}@media(max-width:760px){.finmg-control{grid-template-columns:1fr}}';document.head.appendChild(s)}

function patchHealth(r){
  var h=r&&r.querySelector('.finv7-health');if(!h)return;
  Array.prototype.slice.call(h.children).forEach(function(x){if(/Coverage HPP|Basis laporan/i.test(x.textContent||''))x.remove()});
  var c=pack&&pack.purchase_control_current||{},match=c.finance_link_status==='MATCH';
  var basis=h.querySelector('[data-finmg-basis]');if(!basis){basis=document.createElement('span');basis.setAttribute('data-finmg-basis','1');h.insertBefore(basis,h.firstChild)}basis.innerHTML='Basis laporan <b>Pembelian</b>';
  var link=h.querySelector('[data-finmg-link]');if(!link){link=document.createElement('span');link.setAttribute('data-finmg-link','1');h.insertBefore(link,basis.nextSibling)}link.className=match?'':'warn';link.innerHTML='Purchase → Journal <b>'+(match?'MATCH':'CHECK')+'</b>';
}
function patchNotesCards(report){
  Array.prototype.forEach.call(report.querySelectorAll('.finv7-note-card'),function(card){var s=card.querySelector('span'),b=card.querySelector('b');if(s&&/Status HPP/i.test(s.textContent||'')){s.textContent='Basis biaya';if(b)b.textContent='Pembelian · jurnal double-entry'}})
  Array.prototype.forEach.call(report.querySelectorAll('.fsv2-note'),function(note){if(/HPP|coverage/i.test(note.textContent||'')){note.classList.remove('warn');note.textContent='Model aktif tidak menggunakan HPP. Nilai Pembelian menjadi beban; kuantitas stockable tetap masuk Stok.'}})
}
function renderIncome(report){
  if(!pack)return;var c=pack.current||{},p=pack.previous||{},ctl=pack.purchase_control_current||{},match=ctl.finance_link_status==='MATCH',stockOk=ctl.stock_link_status==='OK';
  var curRev=n(c.revenue_sales)+n(c.other_income),prevRev=n(p.revenue_sales)+n(p.other_income);
  report.innerHTML='<div class="fsv2-report-title"><div><small>HASNARIA TERRACE · LAPORAN MANAJEMEN</small><h2>Laba Rugi</h2><p>'+esc(monthLabel(pack.period))+' · komparatif '+esc(monthLabel(pack.previous_period))+'</p></div><span class="fsv2-badge '+(match?'':'warn')+'">Basis Pembelian · Jurnal</span></div>'+
    '<div class="fsv2-kpis"><div class="fsv2-kpi"><span>Pendapatan</span><strong>'+esc(money(curRev))+'</strong></div><div class="fsv2-kpi"><span>Total Beban Pembelian</span><strong>'+esc(money(c.total_purchase_expense))+'</strong></div><div class="fsv2-kpi"><span>Laba / Rugi Bersih</span><strong>'+esc(money(c.profit_after_tax))+'</strong></div><div class="fsv2-kpi"><span>Relasi Purchase → Finance</span><strong>'+(match?'MATCH':'CHECK')+'</strong></div></div>'+
    '<div class="finmg-control"><div><b>Kontrol Purchase → Finance</b><span>'+pill(match?'MATCH':'MISMATCH',match?'ok':'bad')+' · delta '+esc(money(ctl.purchase_journal_delta))+'</span></div><div><b>Sumber pembayaran</b><span>'+pill(n(ctl.provisional_journal_rows)===0?'Lengkap':n(ctl.provisional_journal_rows)+' provisional',n(ctl.provisional_journal_rows)===0?'ok':'warn')+'</span></div><div><b>Relasi Stok</b><span>'+pill(stockOk?'OK':'Perlu review',stockOk?'ok':'warn')+' · '+n(ctl.stock_review_rows)+' mapping</span></div></div>'+
    '<div class="fsv2-pl"><div class="finv7-compare-head"><span>Akun</span><span>'+esc(monthLabel(pack.period))+'</span><span>'+esc(monthLabel(pack.previous_period))+'</span></div>'+
      row('Pendapatan Penjualan',c.revenue_sales,p.revenue_sales)+row('Pendapatan Lain-lain',c.other_income,p.other_income)+row('Jumlah Pendapatan',curRev,prevRev,'sub')+
      row('Beban Administrasi',c.admin_expense,p.admin_expense,'',true)+row('Beban Pemeliharaan',c.maintenance_expense,p.maintenance_expense,'',true)+row('Beban Bahan Baku',c.raw_material_expense,p.raw_material_expense,'',true)+row('Beban Kepegawaian',c.personnel_expense,p.personnel_expense,'',true)+
      row('Total Beban Pembelian',c.total_purchase_expense,p.total_purchase_expense,'sub',true)+
      (n(c.other_operating_expense)||n(p.other_operating_expense)?row('Beban Operasional Lain',c.other_operating_expense,p.other_operating_expense,'',true):'')+
      row('Beban Keuangan',c.finance_expense,p.finance_expense,'',true)+row('Laba (Rugi) Sebelum Pajak',c.profit_before_tax,p.profit_before_tax,'sub')+row('Beban Pajak Penghasilan',c.tax_expense,p.tax_expense,'',true)+row('Laba (Rugi) Setelah Pajak',c.profit_after_tax,p.profit_after_tax,'total')+
    '</div>'+
    '<div class="finmg-note">Konsep aktif: nilai Pembelian dibebankan sekali melalui jurnal double-entry; kuantitas barang tetap dikelola di Stok. HPP tidak digunakan.</div>'+
    (n(ctl.provisional_journal_rows)>0?'<div class="finmg-note warn"><b>'+n(ctl.provisional_journal_rows).toLocaleString('id-ID')+' transaksi</b> belum memiliki sumber pembayaran final. Nilai beban tetap tercatat, tetapi akun lawan sementara harus direkonsiliasi sebelum tutup buku.</div>':'')+
    (!match?'<div class="finmg-note bad">Nilai Pembelian dan jurnal belum sama. Tutup buku tidak boleh dilakukan sampai delta menjadi Rp0.</div>':'');
}
function patchReport(){
  if(patching)return;var r=root();if(!r)return;patchHealth(r);var report=r.querySelector('.fsv2-report');if(!report)return;
  patching=true;try{if(incomeActive(r)&&pack)renderIncome(report);else patchNotesCards(report)}finally{patching=false}
}
async function load(force){
  if(!db||!isOwner())return;var p=selectedPeriod();if(!p||loading)return;
  if(!force&&pack&&loadedPeriod===p){patchReport();return}
  loading=true;
  try{var q=await db.rpc('get_finance_management_period_v1',{p_brand:BRAND,p_period:p});if(q.error)throw q.error;pack=q.data||null;loadedPeriod=p;setTimeout(patchReport,20)}catch(e){if(window.console&&console.warn)console.warn('Finance management purchase-journal:',e&&e.message?e.message:e)}finally{loading=false}
}
function schedule(force){ensureCss();clearTimeout(timer);timer=setTimeout(function(){patchReport();load(!!force)},80)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var h=document.getElementById('ops');if(db&&h&&isOwner()){
    ensureCss();observer=new MutationObserver(function(){if(!patching&&root())schedule(false)});observer.observe(h,{childList:true,subtree:true});
    document.addEventListener('change',function(e){if(e.target&&e.target.id==='financeV6Period'){pack=null;loadedPeriod='';schedule(true)}},true);
    document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('[data-tab="ops"],[data-fin-view]'):null;if(t)setTimeout(function(){schedule(false)},120)},true);
    window.addEventListener('hasnaria:finance-rebuilt',function(){pack=null;loadedPeriod='';schedule(true)});
    schedule(true);return
  }if(tries++<150)setTimeout(wait,100)})()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
