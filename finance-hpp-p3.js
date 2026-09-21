(function(){
'use strict';
if(window.__HASNARIA_FINANCE_HPP_P3)return;
window.__HASNARIA_FINANCE_HPP_P3=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var db=null,scheduled=false;
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function n(v){v=Number(v);return isFinite(v)?v:0}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function pct(v){return n(v).toLocaleString('id-ID',{maximumFractionDigits:2})+'%'}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7)+'-01':''}
function monthLabel(v){var p=periodKey(v);if(!p)return'—';return MONTHS[Number(p.slice(5,7))-1]+' '+p.slice(0,4)}
function monthEnd(p){p=periodKey(p);if(!p)return'';var y=+p.slice(0,4),m=+p.slice(5,7),d=new Date(Date.UTC(y,m,0));return d.toISOString().slice(0,10)}
function isOwner(){var c=window.__HASNARIA_CONTEXT;return!!(c&&c.role==='owner')}
function financeRoot(){var h=document.getElementById('ops');return h&&!h.classList.contains('hidden')?h.querySelector('[data-finance-v6="1"]'):null}
function currentPeriod(){var e=document.getElementById('financeV6Period');return periodKey(e&&e.value)}
function client(){db=db||window.__HASNARIA_DB;return db}

function ensureCss(){if(document.getElementById('hasnaria-finance-hpp-p3-css'))return;var l=document.createElement('link');l.id='hasnaria-finance-hpp-p3-css';l.rel='stylesheet';l.href='/finance-hpp-p3.css?v=1';document.head.appendChild(l)}
function scheduleInject(){if(scheduled)return;scheduled=true;setTimeout(function(){scheduled=false;inject()},0)}
function inject(){
  ensureCss();
  if(!isOwner())return;
  var root=financeRoot();if(!root)return;
  var side=root.querySelector('.fsv2-side');if(!side||side.querySelector('[data-fin-hpp-p3-open]'))return;
  var b=document.createElement('button');b.className='fsv2-btn soft finhpp-p3-btn';b.setAttribute('data-fin-hpp-p3-open','1');b.innerHTML='<b>HPP Workbench</b><small>Coverage, blocker resep & biaya</small>';
  var card=side.querySelector('.fsv2-side-card');if(card)side.insertBefore(b,card);else side.appendChild(b);
}

function reasonLabel(x){return({missing_product_mapping:'Produk belum termapping',missing_recipe:'Resep belum ada',recipe_unverified:'Resep belum diverifikasi',recipe_effective_date_missing:'Tanggal efektif resep belum ada',missing_component_cost:'Biaya komponen belum terverifikasi',invalid_recipe_cost:'Biaya resep tidak valid',ready_for_temporal_costing:'Siap dihitung ulang'})[x]||x||'Perlu review'}
function actionLabel(x){return({map_product:'Map produk',define_recipe:'Definisikan resep',verify_recipe:'Verifikasi resep',set_recipe_effective_date:'Isi tanggal efektif',verify_component_cost:'Verifikasi biaya komponen',review_recipe_cost:'Review biaya resep',refresh_hpp:'Refresh HPP'})[x]||x||'Review'}

async function loadPack(){
  var c=client();if(!c)throw new Error('Database belum siap');
  var p=currentPeriod();if(!p)throw new Error('Periode belum dipilih');
  var r=await c.rpc('get_finance_hpp_workbench_v1',{p_brand:BRAND,p_period:p});if(r.error)throw r.error;return r.data||{};
}
function blockersTable(rows){rows=rows||[];if(!rows.length)return'<div class="finhpp-p3-empty">Tidak ada blocker HPP pada periode ini.</div>';return'<div class="fsv2-table-wrap"><table class="fsv2-table"><thead><tr><th>Prioritas</th><th>Produk</th><th class="num">Unit belum HPP</th><th class="num">Nilai penjualan terdampak</th><th>Kendala</th><th>Tindakan</th></tr></thead><tbody>'+rows.map(function(x){return'<tr><td>#'+esc(x.priority_rank)+'</td><td class="item"><b>'+esc(x.product_name)+'</b><small>'+esc(x.recipe_summary||'Resep belum tersedia')+'</small></td><td class="num">'+n(x.uncovered_units).toLocaleString('id-ID')+'</td><td class="num">'+money(x.uncovered_sales_value)+'</td><td>'+esc(reasonLabel(x.blocker_reason))+'</td><td>'+esc(actionLabel(x.required_action))+'</td></tr>'}).join('')+'</tbody></table></div>'}
function renderModal(pack){
  var old=document.getElementById('finHppP3Modal');if(old)old.remove();
  var cov=pack.coverage||{},s=pack.summary||{},rows=pack.blockers||[];
  var el=document.createElement('div');el.id='finHppP3Modal';el.className='fsv2-overlay';
  el.innerHTML='<div class="fsv2-modal finhpp-p3-modal"><div class="fsv2-modal-head"><div><h2>HPP Workbench</h2><p>'+esc(monthLabel(pack.period||currentPeriod()))+' · temporal verified costing</p></div><div class="finhpp-p3-head-actions"><button class="fsv2-btn soft" data-fin-hpp-p3-refresh>Refresh HPP</button><button class="fsv2-close" data-fin-hpp-p3-close>×</button></div></div><div class="fsv2-modal-body"><div class="finv7-modal-status finhpp-p3-summary"><span class="finv7-pill">Coverage <b>'+pct(cov.coverage_pct)+'</b></span><span class="finv7-pill">Unit belum HPP <b>'+n(cov.uncovered_units).toLocaleString('id-ID')+'</b></span><span class="finv7-pill">Nilai terdampak <b>'+money(cov.uncovered_sales_value)+'</b></span><span class="finv7-pill">Resep belum ada <b>'+n(s.products_missing_recipe).toLocaleString('id-ID')+'</b></span><span class="finv7-pill">Belum diverifikasi <b>'+n(s.products_recipe_unverified).toLocaleString('id-ID')+'</b></span><span class="finv7-pill">Kurang biaya komponen <b>'+n(s.products_missing_component_cost).toLocaleString('id-ID')+'</b></span></div><div class="finhpp-p3-note">Workbench ini tidak membuat resep atau biaya secara otomatis. Refresh hanya menghitung ulang produk yang resep, tanggal efektif, dan biaya komponennya sudah terverifikasi.</div>'+blockersTable(rows)+'</div></div>';
  document.body.appendChild(el);
}
async function openWorkbench(){try{renderModal(await loadPack())}catch(e){alert('Gagal memuat HPP Workbench: '+(e.message||e))}}
async function refreshHpp(btn){
  var c=client(),p=currentPeriod();if(!c||!p)return;
  if(btn)btn.disabled=true;
  try{
    var r=await c.rpc('refresh_finance_hpp_v1',{p_from:p,p_to:monthEnd(p)});if(r.error)throw r.error;
    if(window.__HASNARIA_FINANCE_V6_MOUNT)window.__HASNARIA_FINANCE_V6_MOUNT({force:true});
    renderModal(await loadPack());
  }catch(e){alert('Gagal refresh HPP: '+(e.message||e))}finally{if(btn)btn.disabled=false}
}

function bind(){
  document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-fin-hpp-p3-open],[data-fin-hpp-p3-close],[data-fin-hpp-p3-refresh]');if(!t)return;
    if(t.hasAttribute('data-fin-hpp-p3-close')){var m=document.getElementById('finHppP3Modal');if(m)m.remove();return}
    if(t.hasAttribute('data-fin-hpp-p3-refresh')){refreshHpp(t);return}
    if(t.hasAttribute('data-fin-hpp-p3-open'))openWorkbench();
  },true);
}
function start(){ensureCss();bind();new MutationObserver(scheduleInject).observe(document.body,{childList:true,subtree:true});scheduleInject()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
