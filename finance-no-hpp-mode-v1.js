(function(){
'use strict';
if(window.__HASNARIA_FINANCE_NO_HPP_MODE_V1)return;
window.__HASNARIA_FINANCE_NO_HPP_MODE_V1=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,current=null,previous=null,observer=null,timer=0,patching=false;

function n(v){v=Number(v);return isFinite(v)?v:0}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7)+'-01':''}
function prevPeriod(p){p=periodKey(p);if(!p)return'';var y=+p.slice(0,4),m=+p.slice(5,7);m--;if(m===0){m=12;y--}return y+'-'+String(m).padStart(2,'0')+'-01'}
function isOwner(){var c=window.__HASNARIA_CONTEXT;return!!(c&&c.role==='owner')}
function root(){var h=document.getElementById('ops');return h&&!h.classList.contains('hidden')?h.querySelector('[data-finance-v6="1"]'):null}
function selectedPeriod(){var e=document.getElementById('financeV6Period');return periodKey(e&&e.value)}
function isFinal(r){return!!(r&&r.is_final_hpp)}
function beforeHppBeforeTax(r){return n(r&&r.revenue_sales)+n(r&&r.other_income)-n(r&&r.operating_expense_adjusted)-n(r&&r.finance_expense)}
function beforeHppAfterTax(r){return beforeHppBeforeTax(r)-n(r&&r.tax_expense)}

function ensureCss(){
  if(document.getElementById('finance-no-hpp-mode-v1-css'))return;
  var s=document.createElement('style');s.id='finance-no-hpp-mode-v1-css';
  s.textContent='\
.finv7-nohpp-tag{display:inline-flex;align-items:center;gap:5px;border:1px solid #e7cc79;background:#fff4cb;color:#735710;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:900;margin-left:6px}.finv7-nohpp-cell{color:#735710!important}.finv7-nohpp-note{border-color:#e7cc79!important;background:#fff8df!important;color:#735710!important}';
  document.head.appendChild(s);
}

function findKpi(report,label){
  var cards=report.querySelectorAll('.fsv2-kpi');
  for(var i=0;i<cards.length;i++){
    var sp=cards[i].querySelector('span');
    if(sp&&sp.textContent.trim()===label)return cards[i];
  }
  return null;
}
function patchKpi(report,label,newLabel,value){
  var c=findKpi(report,label);if(!c)return;
  var sp=c.querySelector('span'),st=c.querySelector('strong');
  if(sp)sp.textContent=newLabel;
  if(st){st.textContent=value;st.classList.add('finv7-nohpp-cell')}
}
function findRow(report,label){
  var rows=report.querySelectorAll('.finv7-row');
  for(var i=0;i<rows.length;i++){
    var sp=rows[i].querySelector('span');
    if(sp&&sp.textContent.trim()===label)return rows[i];
  }
  return null;
}
function setRow(report,label,newLabel,curVal,prevVal){
  var r=findRow(report,label);if(!r)return;
  var sp=r.querySelector('span');if(sp)sp.textContent=newLabel;
  var cells=r.querySelectorAll('strong');
  if(cells[0]&&curVal!=null){cells[0].textContent=curVal;cells[0].classList.add('finv7-nohpp-cell')}
  if(cells[1]&&prevVal!=null){cells[1].textContent=prevVal;cells[1].classList.add('finv7-nohpp-cell')}
}
function patchBridge(){
  var el=document.getElementById('financeProvisionalSync');if(!el||!current||isFinal(current))return;
  var cards=el.querySelectorAll('.fps-card');
  for(var i=0;i<cards.length;i++){
    var sp=cards[i].querySelector('span'),b=cards[i].querySelector('b');if(!sp||!b)continue;
    var t=sp.textContent.trim().toLowerCase();
    if(t.indexOf('hpp ')===0){sp.textContent='HPP · dilewati sementara';b.textContent='Belum dihitung'}
    if(t.indexOf('laba / rugi')===0){sp.textContent='Hasil sementara sebelum HPP';b.textContent=money(beforeHppAfterTax(current));b.classList.toggle('neg',beforeHppAfterTax(current)<0)}
  }
  var note=el.querySelector('.fps-note');
  if(note)note.innerHTML='<b>Mode tanpa HPP sementara.</b> Pendapatan dan beban yang sudah tercatat tetap dihitung; pembelian persediaan tidak dipaksakan menjadi HPP. Angka hasil adalah hasil sebelum HPP dan bukan laba bersih final.';
}
function patchReport(){
  if(patching||!current||isFinal(current))return;
  var r=root();if(!r)return;var report=r.querySelector('.fsv2-report');if(!report)return;
  patching=true;ensureCss();
  try{
    var title=report.querySelector('.fsv2-report-title');
    if(title){
      var badge=title.querySelector('.fsv2-badge');if(badge){badge.textContent='Mode sementara · HPP dilewati';badge.classList.add('warn')}
      if(!title.querySelector('.finv7-nohpp-tag')){var tag=document.createElement('span');tag.className='finv7-nohpp-tag';tag.textContent='BUKAN LABA FINAL';title.appendChild(tag)}
    }
    patchKpi(report,'HPP','HPP','Belum dihitung');
    patchKpi(report,'Laba setelah pajak','Hasil sebelum HPP',money(beforeHppAfterTax(current)));
    patchKpi(report,'Coverage HPP','Coverage HPP',String(n(current.cogs_coverage_pct).toLocaleString('id-ID',{maximumFractionDigits:1}))+'% · dilewati');

    var prevFinal=isFinal(previous);
    setRow(report,'Harga Pokok Penjualan','Harga Pokok Penjualan', 'Belum dihitung', prevFinal?null:'Belum dihitung');
    setRow(report,'Laba Kotor','Laba Kotor', 'Tidak dihitung', prevFinal?null:'Tidak dihitung');
    setRow(report,'Laba (Rugi) Sebelum Pajak','Hasil Sementara Sebelum HPP & Pajak',money(beforeHppBeforeTax(current)),prevFinal?null:money(beforeHppBeforeTax(previous)));
    setRow(report,'Laba (Rugi) Setelah Pajak','Hasil Sementara Sebelum HPP',money(beforeHppAfterTax(current)),prevFinal?null:money(beforeHppAfterTax(previous)));

    var notes=report.querySelectorAll('.fsv2-note');
    for(var j=0;j<notes.length;j++){
      if(/coverage HPP|Laba tidak ditetapkan|HPP belum/i.test(notes[j].textContent||'')){
        notes[j].classList.add('finv7-nohpp-note');
        notes[j].textContent='Mode sementara tanpa HPP: laporan menampilkan pendapatan, beban, pajak, dan hasil sebelum HPP. Pembelian persediaan tetap berada di neraca/persediaan dan tidak dianggap HPP sampai recipe atau metode costing tersedia. Angka ini bukan laba bersih final.';
      }
    }
    patchBridge();
  }finally{patching=false}
}

async function load(){
  if(!db||!isOwner())return;var p=selectedPeriod();if(!p)return;
  try{
    var pp=prevPeriod(p);
    var q=await db.from('finance_income_statement_provisional_v1').select('period_month,revenue_sales,other_income,cogs_coverage_pct,operating_expense_adjusted,finance_expense,tax_expense,is_final_hpp').eq('brand_id',BRAND).in('period_month',[p,pp]);
    if(q.error)throw q.error;
    current=(q.data||[]).find(function(x){return periodKey(x.period_month)===p})||null;
    previous=(q.data||[]).find(function(x){return periodKey(x.period_month)===pp})||null;
    setTimeout(patchReport,30);
  }catch(e){if(window.console&&console.warn)console.warn('Hasnaria no-HPP mode:',e)}
}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){load()},90)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var h=document.getElementById('ops');if(db&&h&&isOwner()){
    observer=new MutationObserver(function(){if(!patching&&root())schedule()});observer.observe(h,{childList:true,subtree:true});
    document.addEventListener('change',function(e){if(e.target&&e.target.id==='financeV6Period')schedule()},true);
    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-tab="ops"]'):null;if(b)setTimeout(schedule,180)},true);
    window.addEventListener('hasnaria:purchase-finance-synced',schedule);
    window.addEventListener('hasnaria:finance-rebuilt',schedule);
    schedule();return;
  }if(tries++<150)setTimeout(wait,100)})();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
