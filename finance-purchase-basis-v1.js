(function(){
'use strict';
if(window.__HASNARIA_FINANCE_PURCHASE_BASIS_V1)return;
window.__HASNARIA_FINANCE_PURCHASE_BASIS_V1=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,current=null,previous=null,observer=null,timer=0,patching=false;

function n(v){v=Number(v);return isFinite(v)?v:0}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7)+'-01':''}
function prevPeriod(p){p=periodKey(p);if(!p)return'';var y=+p.slice(0,4),m=+p.slice(5,7)-1;if(m===0){m=12;y--}return y+'-'+String(m).padStart(2,'0')+'-01'}
function isOwner(){var c=window.__HASNARIA_CONTEXT;return!!(c&&c.role==='owner')}
function root(){var h=document.getElementById('ops');return h&&!h.classList.contains('hidden')?h.querySelector('[data-finance-v6="1"]'):null}
function selectedPeriod(){var e=document.getElementById('financeV6Period');return periodKey(e&&e.value)}

function findKpi(report,label){var cards=report.querySelectorAll('.fsv2-kpi');for(var i=0;i<cards.length;i++){var s=cards[i].querySelector('span');if(s&&s.textContent.trim()===label)return cards[i]}return null}
function patchKpi(report,oldLabel,newLabel,value){var c=findKpi(report,oldLabel)||findKpi(report,newLabel);if(!c)return;var s=c.querySelector('span'),b=c.querySelector('strong');if(s)s.textContent=newLabel;if(b)b.textContent=value}
function findRow(report,label){var rows=report.querySelectorAll('.finv7-row');for(var i=0;i<rows.length;i++){var s=rows[i].querySelector(':scope > span');if(s&&String(s.childNodes[0]&&s.childNodes[0].textContent||s.textContent).trim()===label)return rows[i]}return null}
function setRow(report,oldLabel,newLabel,cur,prev,cls){var r=findRow(report,oldLabel)||findRow(report,newLabel);if(!r)return null;var s=r.querySelector(':scope > span');if(s)s.textContent=newLabel;var cells=r.querySelectorAll(':scope > strong');if(cells[0])cells[0].textContent=cur;if(cells[1])cells[1].textContent=prev;if(cls){r.classList.remove('sub','total','warn');cls.split(/\s+/).forEach(function(x){if(x)r.classList.add(x)})}return r}
function removeRow(report,label){var r=findRow(report,label);if(r)r.remove()}
function expenseRow(label,cur,prev){var d=document.createElement('div');d.className='finv7-row fin-purchase-basis-detail';d.setAttribute('data-purchase-basis-row','1');d.innerHTML='<span>'+esc(label)+'</span><strong>-'+esc(money(cur))+'</strong><strong>-'+esc(money(prev))+'</strong>';return d}

function patchHealth(r){var h=r.querySelector('.finv7-health');if(!h)return;Array.prototype.slice.call(h.children).forEach(function(x){if(/Coverage HPP/i.test(x.textContent||''))x.remove()});if(!h.querySelector('[data-purchase-basis-health]')){var s=document.createElement('span');s.setAttribute('data-purchase-basis-health','1');s.innerHTML='Basis laporan <b>Pembelian</b>';h.insertBefore(s,h.firstChild)}}
function patchNotes(report){var notes=report.querySelectorAll('.fsv2-note');var found=false;for(var i=0;i<notes.length;i++){if(/HPP|coverage/i.test(notes[i].textContent||'')){notes[i].classList.remove('warn');notes[i].textContent='Laba rugi manajerial memakai seluruh transaksi Pembelian positif dan membaginya ke empat kategori beban. Data review tetap ikut perhitungan manajerial dan ditandai terpisah untuk kontrol.';found=true}}if(!found){var pl=report.querySelector('.fsv2-pl');if(pl){var d=document.createElement('div');d.className='fsv2-note';d.setAttribute('data-purchase-basis-note','1');d.textContent='Basis Pembelian: Beban Administrasi, Beban Pemeliharaan, Beban Bahan Baku, dan Beban Kepegawaian.';pl.insertAdjacentElement('afterend',d)}}}
function patchDashboard(){
  var m=document.getElementById('finHppP3Modal');if(m)m.remove();
  var b=document.querySelector('[data-fin-hpp-p3-open]');if(b)b.remove();
  var host=document.getElementById('dashboard');if(!host)return;
  Array.prototype.forEach.call(host.querySelectorAll('span,small,b,strong'),function(el){var t=(el.textContent||'').trim();if(t==='Produk siap HPP'||/Mengikuti HPP terverifikasi/i.test(t)){var box=el.closest('.erp-readiness>div,.erp-kpi,.erp-card');if(!box)box=el.parentElement;if(box)box.style.display='none'}})
}

function patchReport(){
  if(patching||!current)return;var r=root();if(!r)return;var report=r.querySelector('.fsv2-report');if(!report)return;
  patching=true;
  try{
    patchDashboard();patchHealth(r);
    var title=report.querySelector('.fsv2-report-title');if(title){var badge=title.querySelector('.fsv2-badge');if(badge){badge.textContent='Basis Pembelian';badge.classList.remove('warn')}}
    patchKpi(report,'HPP','Total Beban Pembelian',money(current.total_purchase_expense));
    patchKpi(report,'Total Beban Pembelian','Total Beban Pembelian',money(current.total_purchase_expense));
    patchKpi(report,'Laba setelah pajak','Laba / Rugi Bersih',money(current.profit_after_tax));
    patchKpi(report,'Laba / Rugi Bersih','Laba / Rugi Bersih',money(current.profit_after_tax));
    patchKpi(report,'Coverage HPP','Basis Laporan','Pembelian');
    patchKpi(report,'Basis Laporan','Basis Laporan','Pembelian');

    removeRow(report,'Harga Pokok Penjualan');
    removeRow(report,'Laba Kotor');
    Array.prototype.slice.call(report.querySelectorAll('[data-purchase-basis-row]')).forEach(function(x){x.remove()});

    var totalRow=setRow(report,'Beban Operasional','Total Beban Pembelian','-'+money(current.total_purchase_expense),'-'+money(previous&&previous.total_purchase_expense),'sub');
    if(!totalRow)totalRow=setRow(report,'Total Beban Pembelian','Total Beban Pembelian','-'+money(current.total_purchase_expense),'-'+money(previous&&previous.total_purchase_expense),'sub');
    if(totalRow){
      var rows=[
        ['Beban Administrasi',current.admin_expense,previous&&previous.admin_expense],
        ['Beban Pemeliharaan',current.maintenance_expense,previous&&previous.maintenance_expense],
        ['Beban Bahan Baku',current.raw_material_expense,previous&&previous.raw_material_expense],
        ['Beban Kepegawaian',current.personnel_expense,previous&&previous.personnel_expense]
      ];
      rows.forEach(function(x){totalRow.parentNode.insertBefore(expenseRow(x[0],x[1],x[2]),totalRow)})
    }
    setRow(report,'Laba (Rugi) Sebelum Pajak','Laba (Rugi) Sebelum Pajak',money(current.profit_before_tax),money(previous&&previous.profit_before_tax),'sub');
    setRow(report,'Laba (Rugi) Setelah Pajak','Laba (Rugi) Setelah Pajak',money(current.profit_after_tax),money(previous&&previous.profit_after_tax),'total');
    patchNotes(report);
  }finally{patching=false}
}

async function load(){
  if(!db||!isOwner())return;var p=selectedPeriod();if(!p)return;var pp=prevPeriod(p);
  try{
    var q=await db.from('finance_income_statement_purchase_basis_v1').select('period_month,revenue_sales,other_income,admin_expense,maintenance_expense,raw_material_expense,personnel_expense,total_purchase_expense,finance_expense,tax_expense,profit_before_tax,profit_after_tax,purchase_rows,review_rows,review_amount,report_basis').eq('brand_id',BRAND).in('period_month',[p,pp]);
    if(q.error)throw q.error;
    current=(q.data||[]).find(function(x){return periodKey(x.period_month)===p})||null;
    previous=(q.data||[]).find(function(x){return periodKey(x.period_month)===pp})||null;
    setTimeout(patchReport,20);
  }catch(e){if(window.console&&console.warn)console.warn('Hasnaria purchase-basis finance:',e&&e.message?e.message:e)}
}
function schedule(){clearTimeout(timer);timer=setTimeout(load,70)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var h=document.getElementById('ops');if(db&&h&&isOwner()){
    observer=new MutationObserver(function(){if(!patching&&root())schedule();patchDashboard()});observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('change',function(e){if(e.target&&e.target.id==='financeV6Period')schedule()},true);
    document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('[data-tab="ops"],[data-tab="dashboard"]'):null;if(t)setTimeout(function(){schedule();patchDashboard()},140)},true);
    window.addEventListener('hasnaria:finance-rebuilt',schedule);
    patchDashboard();schedule();return;
  }if(tries++<150)setTimeout(wait,100)})();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
