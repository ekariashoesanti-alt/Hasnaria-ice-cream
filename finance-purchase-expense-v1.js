(function(){
'use strict';
if(window.__HASNARIA_FIN_PURCHASE_LINKAGE_V2)return;
window.__HASNARIA_FIN_PURCHASE_LINKAGE_V2=true;
window.__HASNARIA_FIN_PURCHASE_EXPENSE_V1=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,timer=0,loading=false,lastPeriod='',observer=null;
var data={classRows:[],journalRows:[],current:null,previous:null};

function n(v){v=Number(v);return isFinite(v)?v:0}
function esc(v){return String(v==null?'':v).replace(/[<>"'&]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function period(){var s=document.getElementById('financeV6Period');return s?String(s.value||'').slice(0,10):''}
function prevPeriod(p){if(!/^\d{4}-\d{2}-\d{2}$/.test(p))return'';var y=+p.slice(0,4),m=+p.slice(5,7);return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,10)}
function dateLabel(v){var s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}/.test(s))return'—';return s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4)}
function host(){return document.querySelector('#ops [data-finance-v6="1"]')}
function isReview(x){return x.accounting_treatment==='payment_review'||x.accounting_treatment==='classification_review'||x.accounting_treatment==='asset_review'||x.accounting_treatment==='expense_review'||x.finance_status==='review_required'}
function blank(){return{total_amount:0,inventory_amount:0,expense_amount:0,asset_amount:0,review_amount:0,inventory_count:0,expense_count:0,review_count:0,provisional_count:0,posted_count:0,journal_total:0,journal_inventory:0,journal_expense:0,journal_asset:0,journal_count:0,delta:0}}
function periodOf(v){return String(v||'').slice(0,10)}
function expectedAmount(s){return n(s.inventory_amount)+n(s.expense_amount)}
function actualAmount(s){return n(s.journal_inventory)+n(s.journal_expense)+n(s.journal_asset)}
function syncOk(s){return Math.abs(n(s.delta))<.01}

function summarize(p){
  var s=blank();
  data.classRows.filter(function(x){return periodOf(x.source_period)===p}).forEach(function(x){
    var a=n(x.total_amount);s.total_amount+=a;
    if(x.accounting_treatment==='inventory'){s.inventory_amount+=a;s.inventory_count++}
    else if(x.accounting_treatment==='expense'){s.expense_amount+=a;s.expense_count++}
    else if(x.accounting_treatment==='asset'){s.asset_amount+=a}
    else if(isReview(x)){s.review_amount+=a;s.review_count++}
    if(x.finance_status==='provisional')s.provisional_count++;
    if(x.finance_status==='posted')s.posted_count++;
  });
  data.journalRows.filter(function(x){return periodOf(x.period_month)===p&&n(x.line_no)===1&&n(x.debit)>0}).forEach(function(x){
    var a=n(x.debit);s.journal_total+=a;s.journal_count++;
    if(x.account_code==='1300')s.journal_inventory+=a;
    else if(x.account_code==='1500')s.journal_asset+=a;
    else if(/^6\d{3}$/.test(String(x.account_code||'')))s.journal_expense+=a;
  });
  s.delta=actualAmount(s)-expectedAmount(s);
  return s;
}

function ensureCss(){if(document.getElementById('finPurchaseLinkageCss'))return;var s=document.createElement('style');s.id='finPurchaseLinkageCss';s.textContent='\
.fin-purchase-card{margin:0 0 10px;border:1px solid #dce9e3;background:#fbfdfc;border-radius:13px;padding:11px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.fin-purchase-copy{min-width:0;flex:1 1 680px}.fin-purchase-eyebrow{font-size:8.5px;font-weight:900;letter-spacing:.08em;color:#0d7b61}.fin-purchase-title{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-top:2px}.fin-purchase-title b{font-size:13px;color:#173f34}.fin-purchase-title strong{font-size:15px;color:#173f34}.fin-purchase-meta{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:6px;margin-top:8px}.fin-purchase-metric{border:1px solid #e0ebe6;background:#fff;border-radius:9px;padding:6px 8px;min-width:0}.fin-purchase-metric span{display:block;font-size:7.5px;color:#72857d;text-transform:uppercase;letter-spacing:.03em}.fin-purchase-metric b{display:block;margin-top:2px;font-size:10px;color:#244c3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fin-purchase-metric.review{background:#fff9ed;border-color:#eadbb0}.fin-purchase-metric.journal.bad{background:#fff0f0;border-color:#efcaca}.fin-purchase-note{font-size:9px;color:#75877f;margin-top:7px;line-height:1.4}.fin-purchase-note.bad{color:#973737}.fin-purchase-open{border:0;border-radius:9px;background:#176b55;color:#fff;padding:8px 10px;font-size:9.5px;font-weight:900;cursor:pointer}.fin-purchase-subrow{background:#f7fbf9;color:#60776e}.fin-purchase-subrow>span{padding-left:14px}.fin-purchase-subrow small{display:block;font-size:8.5px;color:#82928b;margin-top:1px}.fin-purchase-modal-status{display:flex;gap:7px;flex-wrap:wrap;padding-bottom:10px}.fin-purchase-modal-status span{border:1px solid #dfeae5;border-radius:999px;padding:5px 8px;font-size:9.5px}.fin-purchase-badge{display:inline-block;border-radius:999px;padding:3px 6px;font-size:8.5px;font-weight:900}.fin-purchase-badge.ok{background:#e7f7ef;color:#176b55}.fin-purchase-badge.warn{background:#fff6dc;color:#8a6615}.fin-purchase-badge.bad{background:#fff0f0;color:#a13d3d}@media(max-width:900px){.fin-purchase-meta{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.fin-purchase-card{align-items:flex-start}.fin-purchase-open{width:100%}.fin-purchase-meta{grid-template-columns:1fr 1fr}}';document.head.appendChild(s)}

function metric(label,value,cls){return'<div class="fin-purchase-metric '+(cls||'')+'"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>'}
function insertIncomeRow(){
  var root=host();if(!root)return;var old=root.querySelector('.fin-purchase-subrow');if(old)old.remove();
  var pl=root.querySelector('.fsv2-pl');if(!pl)return;
  var target=Array.prototype.find.call(pl.querySelectorAll('.finv7-row'),function(r){var s=r.querySelector(':scope > span');return s&&String(s.childNodes[0]&&s.childNodes[0].textContent||'').trim()==='Beban Operasional'});if(!target)return;
  var c=data.current||blank(),pr=data.previous||blank();var row=document.createElement('div');row.className='finv7-row fin-purchase-subrow';
  row.innerHTML='<span>↳ Beban asal Pembelian<small>subtotal jurnal Pembelian; sudah termasuk dalam Beban Operasional</small></span><strong>'+(n(c.journal_expense)>0?'-'+esc(money(c.journal_expense)):'—')+'</strong><strong>'+(n(pr.journal_expense)>0?'-'+esc(money(pr.journal_expense)):'—')+'</strong>';
  target.insertAdjacentElement('afterend',row)
}
function renderPanel(){
  var root=host(),p=period();if(!root||!p)return;ensureCss();var old=document.getElementById('finPurchaseExpensePanel');if(old)old.remove();var anchor=root.querySelector('.finv7-health');if(!anchor)return;
  var c=data.current||blank(),ok=syncOk(c);var panel=document.createElement('section');panel.id='finPurchaseExpensePanel';panel.className='fin-purchase-card';
  panel.innerHTML='<div class="fin-purchase-copy"><div class="fin-purchase-eyebrow">PEMBELIAN → KEUANGAN</div><div class="fin-purchase-title"><b>Rekonsiliasi Pembelian</b><strong>'+esc(money(c.total_amount))+'</strong><span class="fin-purchase-badge '+(ok?'ok':'bad')+'">'+(ok?'Sinkron':'Perlu rekonsiliasi')+'</span></div><div class="fin-purchase-meta">'+
    metric('Persediaan · 1300',money(c.inventory_amount))+
    metric('Beban periode',money(c.expense_amount))+
    metric('Perlu review',money(c.review_amount),'review')+
    metric('Jurnal Finance',money(actualAmount(c)),'journal '+(ok?'':'bad'))+
    metric('Selisih klasifikasi',money(c.delta),'journal '+(ok?'':'bad'))+
    '</div><div class="fin-purchase-note '+(ok?'':'bad')+'">Persediaan masuk Laporan Posisi Keuangan; beban masuk Laba Rugi; transaksi review belum boleh dianggap final.'+(ok?'':' Nilai jurnal belum sama dengan klasifikasi canonical Pembelian dan perlu dibetulkan sebelum periode ditutup.')+'</div></div><button type="button" class="fin-purchase-open" data-fin-purchase-detail>Lihat rekonsiliasi</button>';
  anchor.insertAdjacentElement('afterend',panel);insertIncomeRow()
}

function journalMap(p){var m={};data.journalRows.filter(function(x){return periodOf(x.period_month)===p&&n(x.line_no)===1&&n(x.debit)>0}).forEach(function(x){if(x.source_id)m[x.source_id]=x});return m}
function rowStatus(x,j){if(isReview(x)&&j)return['Jurnal perlu koreksi','bad'];if(isReview(x))return['Review','warn'];if(!j)return['Belum masuk jurnal','bad'];if(x.debit_account_code&&x.debit_account_code!==j.account_code)return['Akun tidak sinkron','bad'];return[j.status==='provisional'?'Provisional':'Terhubung',j.status==='provisional'?'warn':'ok']}
function table(rows,p){if(!rows.length)return'<div class="finv7-empty">Tidak ada data Pembelian pada periode ini.</div>';var jm=journalMap(p);return'<div class="fsv2-table-wrap"><table class="fsv2-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Klasifikasi</th><th>Akun seharusnya</th><th>Akun jurnal</th><th class="num">Nilai</th><th>Status</th></tr></thead><tbody>'+rows.map(function(x){var j=jm[x.source_history_id],st=rowStatus(x,j);return'<tr><td>'+esc(dateLabel(x.effective_date||x.source_period))+'</td><td>'+esc(x.item_name||'—')+'</td><td>'+esc(x.accounting_label||x.accounting_treatment||'—')+'</td><td>'+esc((x.debit_account_code||'—')+(x.debit_account_name?' · '+x.debit_account_name:''))+'</td><td>'+esc(j?((j.account_code||'—')+(j.account_name?' · '+j.account_name:'')):'—')+'</td><td class="num">'+esc(money(x.total_amount))+'</td><td><span class="fin-purchase-badge '+st[1]+'">'+esc(st[0])+'</span>'+(x.required_action?'<small style="display:block;margin-top:3px;color:#7b8c85">'+esc(x.required_action)+'</small>':'')+'</td></tr>'}).join('')+'</tbody></table></div>'}
async function openDetail(){var p=period();if(!p)return;var rows=data.classRows.filter(function(x){return periodOf(x.source_period)===p}).sort(function(a,b){return String(a.effective_date||'').localeCompare(String(b.effective_date||''))||n(b.total_amount)-n(a.total_amount)});var c=data.current||blank();var old=document.getElementById('finPurchaseExpenseModal');if(old)old.remove();var el=document.createElement('div');el.id='finPurchaseExpenseModal';el.className='fsv2-overlay';el.innerHTML='<div class="fsv2-modal"><div class="fsv2-modal-head"><div><h2>Rekonsiliasi Pembelian → Keuangan</h2><p>'+esc(p.slice(5,7)+'/'+p.slice(0,4))+' · klasifikasi Purchase dibanding jurnal canonical Finance</p></div><button class="fsv2-close" data-fin-purchase-close>×</button></div><div class="fsv2-modal-body"><div class="fin-purchase-modal-status"><span>Total Pembelian <b>'+esc(money(c.total_amount))+'</b></span><span>Persediaan <b>'+esc(money(c.inventory_amount))+'</b></span><span>Beban <b>'+esc(money(c.expense_amount))+'</b></span><span>Review <b>'+esc(money(c.review_amount))+'</b></span><span>Jurnal <b>'+esc(money(actualAmount(c)))+'</b></span><span>Selisih <b>'+esc(money(c.delta))+'</b></span></div>'+table(rows,p)+'</div></div>';document.body.appendChild(el)}

async function load(force){
  var p=period();if(!p||loading)return;if(!force&&p===lastPeriod&&document.getElementById('finPurchaseExpensePanel')){insertIncomeRow();return}db=db||window.__HASNARIA_DB;if(!db)return;loading=true;
  try{
    var pp=prevPeriod(p);var pair=await Promise.all([
      db.from('ui_purchase_accounting_detail_v1').select('source_history_id,source_period,effective_date,item_name,total_amount,payment_method,accounting_treatment,accounting_label,debit_account_code,debit_account_name,finance_status,mapping_status,required_action').eq('brand_id',BRAND).in('source_period',[p,pp]).limit(10000),
      db.from('finance_journal_view_v1').select('period_month,entry_date,source_type,source_id,status,line_no,account_code,account_name,debit,credit,description').eq('brand_id',BRAND).in('period_month',[p,pp]).in('source_type',['purchase','purchase_expense']).limit(10000)
    ]);
    if(pair[0].error)throw pair[0].error;if(pair[1].error)throw pair[1].error;
    data.classRows=pair[0].data||[];data.journalRows=pair[1].data||[];data.current=summarize(p);data.previous=summarize(pp);lastPeriod=p;renderPanel()
  }catch(e){var root=host(),anchor=root&&root.querySelector('.finv7-health');if(anchor){var old=document.getElementById('finPurchaseExpensePanel');if(old)old.remove();var x=document.createElement('section');x.id='finPurchaseExpensePanel';x.className='fin-purchase-card';x.innerHTML='<div class="fin-purchase-copy"><div class="fin-purchase-eyebrow">PEMBELIAN → KEUANGAN</div><div class="fin-purchase-title"><b>Rekonsiliasi Pembelian belum termuat</b></div><div class="fin-purchase-note bad">'+esc(e&&e.message?e.message:String(e))+'</div></div>';anchor.insertAdjacentElement('afterend',x)}}finally{loading=false}
}
function schedule(force,delay){clearTimeout(timer);timer=setTimeout(function(){load(!!force)},delay==null?500:delay)}
function observe(){var h=document.getElementById('ops');if(!h||observer)return;observer=new MutationObserver(function(){lastPeriod='';schedule(true,650)});observer.observe(h,{childList:true,subtree:false})}
function boot(){ensureCss();var tries=0;(function wait(){db=db||window.__HASNARIA_DB||null;if(db&&document.getElementById('ops')){observe();schedule(true,800);setTimeout(function(){schedule(true,0)},1800);return}if(tries++<120)setTimeout(wait,100)})();document.addEventListener('change',function(e){if(e.target&&e.target.id==='financeV6Period'){lastPeriod='';schedule(true,900)}},true);document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('[data-fin-purchase-detail],[data-fin-purchase-close],[data-fin-v6-refresh],[data-fin-view],[data-tab="ops"]'):null;if(!t)return;if(t.hasAttribute('data-fin-purchase-detail')){openDetail();return}if(t.hasAttribute('data-fin-purchase-close')){var m=document.getElementById('finPurchaseExpenseModal');if(m)m.remove();return}lastPeriod='';setTimeout(function(){schedule(true,0)},1200)},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
