(function(){
'use strict';
if(window.__HASNARIA_DASHBOARD_UI6)return;
window.__HASNARIA_DASHBOARD_UI6=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var db=null,S={periods:[],rows:[],period:'',loading:false,error:'',detailOpen:false,seq:0,loaded:false,hpp:null,hppLoading:false,syncing:false,stale:false};

function $(id){return document.getElementById(id)}
function client(){return db||(db=window.__HASNARIA_DB)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return Number.isFinite(v)?v:0}
function money(v){return'Rp'+n(v).toLocaleString('id-ID',{maximumFractionDigits:0})}
function key(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function monthLabel(v){var k=key(v);return k?MONTHS[Number(k.slice(5,7))-1]+' '+k.slice(0,4):'Periode belum tersedia'}
function cutLabel(){var k=key(S.period);if(!k)return'Periode belum tersedia';var y=Number(k.slice(0,4)),m=Number(k.slice(5,7)),last=new Date(Date.UTC(y,m,0)).getUTCDate();return'1–'+last+' '+monthLabel(k)}
function pct(v){return n(v).toLocaleString('id-ID',{maximumFractionDigits:2})+'%'}
function hppText(){return S.hpp==null?'—':pct(S.hpp)}
function wait(ms){return new Promise(function(resolve){setTimeout(resolve,ms)})}
async function dashboardPack(){
  var r=await client().rpc('get_ui_dashboard_pack_v1',{p_brand:BRAND,p_months:18});
  if(r.error&&/statement timeout|canceling statement due to statement timeout/i.test(String(r.error.message||r.error))){
    await wait(450);
    r=await client().rpc('get_ui_dashboard_pack_v1',{p_brand:BRAND,p_months:18});
  }
  return r
}
function css(){if($('hx-exec-css')){var x=$('hx-exec-css');if(x.getAttribute('href')!=='/owner-executive-v1.css?v=5')x.href='/owner-executive-v1.css?v=5';return}var l=document.createElement('link');l.id='hx-exec-css';l.rel='stylesheet';l.href='/owner-executive-v1.css?v=5';document.head.appendChild(l)}
function current(){return S.rows.find(function(x){return key(x.period_month)===S.period})||null}
function periodOptions(){return S.periods.map(function(x){var k=key(x.period_start||x.period_key);return'<option value="'+esc(k)+'"'+(k===S.period?' selected':'')+'>'+esc(monthLabel(k))+'</option>'}).join('')}
function syncText(v){return v===true?'MATCH':v===false?'MISMATCH':'N/A'}
function syncClass(v){return v===true?'ok':v===false?'bad':'na'}
function purchaseText(v){return v&&v.purchase_sync_state==='POSTED_CANONICAL'?'POSTED':syncText(v&&v.purchase_sync_ok)}
function purchaseClass(v){return v&&v.purchase_sync_state==='POSTED_CANONICAL'?'ok':syncClass(v&&v.purchase_sync_ok)}
function kpi(label,value,meta,cls){return'<article class="hx6-kpi '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(meta||'')+'</small></article>'}

function trendRows(){
 var idx=S.rows.findIndex(function(x){return key(x.period_month)===S.period});
 if(idx<0)return[];
 return S.rows.slice(idx,idx+6).slice().reverse();
}
function trendMarkup(){
 var rows=trendRows();if(!rows.length)return'<div class="hx6-empty">Belum ada tren.</div>';
 var max=Math.max.apply(null,rows.reduce(function(a,x){a.push(n(x.sales_revenue),n(x.purchase_amount));return a},[1]));
 return'<div class="hx6-trend">'+rows.map(function(x){
   var s=Math.max(3,n(x.sales_revenue)/max*100),p=Math.max(2,n(x.purchase_amount)/max*100);
   return'<div class="hx6-trend-col"><div class="hx6-bars"><svg viewBox="0 0 44 100" role="img" aria-label="'+esc(monthLabel(x.period_month)+' · Penjualan '+money(x.sales_revenue)+' · Pembelian '+money(x.purchase_amount))+'"><rect class="sales" x="4" y="'+(100-s).toFixed(2)+'" width="14" height="'+s.toFixed(2)+'"><title>'+esc('Penjualan '+money(x.sales_revenue))+'</title></rect><rect class="purchase" x="26" y="'+(100-p).toFixed(2)+'" width="14" height="'+p.toFixed(2)+'"><title>'+esc('Pembelian '+money(x.purchase_amount))+'</title></rect></svg></div><b>'+esc(String(monthLabel(x.period_month)).split(' ')[0].slice(0,3))+'</b><small>'+esc(money(x.sales_revenue))+'</small></div>';
 }).join('')+'</div><div class="hx6-legend"><span><i class="sales"></i>Penjualan</span><span><i class="purchase"></i>Pembelian</span></div>';
}
function flowMarkup(v){
 return'<div class="hx6-flow">'+
   '<div class="hx6-flow-node sales"><span>SUMBER</span><b>Penjualan</b><strong>'+esc(money(v.sales_revenue))+'</strong><small>'+n(v.sales_rows).toLocaleString('id-ID')+' transaksi</small></div>'+
   '<i>→</i><div class="hx6-flow-node finance"><span>OUTPUT</span><b>Keuangan</b><strong class="'+syncClass(v.sales_sync_ok)+'">'+esc(syncText(v.sales_sync_ok))+'</strong><small>pendapatan otomatis</small></div>'+
   '<div class="hx6-flow-node purchase"><span>SUMBER</span><b>Pembelian</b><strong>'+esc(money(v.purchase_amount))+'</strong><small>'+n(v.purchase_rows).toLocaleString('id-ID')+' transaksi</small></div>'+
   '<i>→</i><div class="hx6-flow-split"><div><b>Keuangan</b><span class="'+purchaseClass(v)+'">'+esc(purchaseText(v))+'</span></div><div><b>Stok</b><span>Qty otomatis</span></div></div>'+
   '<div class="hx6-flow-node admin"><span>SUBSET PEMBELIAN</span><b>Administrasi</b><strong>'+esc(money(v.admin_amount))+'</strong><small>'+n(v.admin_rows).toLocaleString('id-ID')+' transaksi non-stock</small></div>'+
   '<i>→</i><div class="hx6-flow-node finance"><span>OUTPUT</span><b>Keuangan</b><strong class="'+syncClass(v.admin_sync_ok)+'">'+esc(syncText(v.admin_sync_ok))+'</strong><small>tanpa posting stok</small></div>'+
 '</div>';
}
function statusPanel(v){
 var rows=[
  ['Penjualan → Keuangan',syncText(v.sales_sync_ok),syncClass(v.sales_sync_ok)],
  ['Pembelian → Keuangan',purchaseText(v),purchaseClass(v)],
  ['Administrasi → Keuangan',syncText(v.admin_sync_ok),syncClass(v.admin_sync_ok)]
 ];
 return'<div class="hx6-status-list">'+rows.map(function(x){return'<div><span>'+esc(x[0])+'</span><b class="'+x[2]+'">'+esc(x[1])+'</b></div>'}).join('')+'</div>'+
 '<div class="hx6-info">Pembelian pada Ringkasan CEO dibaca dari jurnal canonical yang sudah ter-posting agar dashboard tetap cepat. Rekonsiliasi source-to-journal tetap dilakukan di tab Pembelian/Keuangan. Administrasi adalah subset Pembelian non-stock dan tidak dijumlahkan ulang.</div>';
}
function detailMarkup(v){
 if(!S.detailOpen)return'';
 var fields=[
  ['Penjualan',money(v.sales_revenue),n(v.sales_rows).toLocaleString('id-ID')+' transaksi'],
  ['Pembelian',money(v.purchase_amount),n(v.purchase_rows).toLocaleString('id-ID')+' jurnal canonical'],
  ['Administrasi',money(v.admin_amount),n(v.admin_rows).toLocaleString('id-ID')+' transaksi · subset Pembelian'],
  ['Coverage HPP model',hppText(),'coverage model penjualan saat ini']
 ];
 return'<div class="hx6-modal-backdrop" data-hx6-close="1"><section class="hx6-modal" role="dialog" aria-modal="true" aria-labelledby="hx6ModalTitle"><div class="hx6-modal-head"><div><div class="hx6-eyebrow">DETAIL RINGKASAN CEO</div><h3 id="hx6ModalTitle">'+esc(monthLabel(S.period))+'</h3><p>'+esc(cutLabel())+' · angka berasal dari sumber canonical per modul; Pembelian memakai jurnal posted.</p></div><button type="button" class="hx6-close" data-hx6-close="1" aria-label="Tutup">×</button></div><div class="hx6-detail-grid">'+fields.map(function(x){return'<article><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></article>'}).join('')+'</div><div class="hx6-detail-sync"><h4>Status Sinkronisasi</h4>'+statusPanel(v)+'</div></section></div>';
}
function render(){
 var h=$('dashboard');if(!h)return;css();
 var v=current()||{};
 if(S.loading&&!S.loaded){h.innerHTML='<div class="hx-shell"><div class="hx-loading">Memuat Ringkasan CEO…</div></div>';return}
 h.innerHTML='<div class="hx-shell hx6-shell" data-ceo-one-view="1">'+
  '<div class="hx6-toolbar"><div><div class="hx6-eyebrow">RINGKASAN CEO · '+esc(cutLabel())+'</div><h1>Ringkasan CEO</h1><p>Visual singkat lintas Penjualan, Pembelian, Administrasi, Keuangan, dan Stok.</p></div><div class="hx6-tools"><label><span>Bulan</span><select id="hx6Period" data-month-filter="dashboard">'+periodOptions()+'</select></label><button type="button" data-hx6-detail="1">Lihat Detail</button></div></div>'+
  (S.error?'<div class="hx-error">'+esc(S.error)+'</div>':'')+
  '<div class="hx6-kpis">'+
   kpi('Penjualan',S.loading&&!S.loaded?'…':money(v.sales_revenue),n(v.sales_rows).toLocaleString('id-ID')+' transaksi','sales')+
   kpi('Pembelian',S.loading&&!S.loaded?'…':money(v.purchase_amount),n(v.purchase_rows).toLocaleString('id-ID')+' jurnal canonical','purchase')+
   kpi('Administrasi',S.loading&&!S.loaded?'…':money(v.admin_amount),n(v.admin_rows).toLocaleString('id-ID')+' transaksi · subset Pembelian','admin')+
   kpi('Coverage HPP Model',S.loading&&!S.loaded?'…':hppText(),S.hppLoading?'memuat coverage…':'coverage model saat ini','hpp')+
  '</div>'+
  '<div class="hx6-main"><article class="hx6-panel"><div class="hx6-panel-head"><div><h2>Tren 6 Periode</h2><p>Penjualan dibanding Pembelian. Administrasi tetap bagian dari Pembelian.</p></div></div>'+trendMarkup()+'</article><article class="hx6-panel"><div class="hx6-panel-head"><div><h2>Status Sinkronisasi</h2><p>Hanya mismatch nyata yang ditandai.</p></div></div>'+statusPanel(v)+'</article></div>'+
  '<article class="hx6-panel hx6-flow-panel"><div class="hx6-panel-head"><div><h2>Alur Bisnis Otomatis</h2><p>Sumber transaksi menuju modul tujuan tanpa input nilai kedua.</p></div></div>'+flowMarkup(v)+'</article>'+
  detailMarkup(v)+
 '</div>';
 bind(h);
}
function sameView(ctx,h){return window.__HASNARIA_CONTEXT===ctx&&ctx&&ctx.role==='owner'&&h===$('dashboard')&&!h.classList.contains('hidden')}
async function loadHpp(seq){
  if(S.hppLoading)return;
  var ctx=window.__HASNARIA_CONTEXT,h=$('dashboard');
  S.hppLoading=true;render();
  try{
    var q=await client().from('hpp_sales_coverage_p11_v1').select('sales_volume_modeled_pct').eq('brand_id',BRAND).limit(1);
    if(seq!==S.seq||!sameView(ctx,h))return;
    if(!q.error&&q.data&&q.data[0])S.hpp=n(q.data[0].sales_volume_modeled_pct);
  }catch(_){}
  finally{if(seq===S.seq){S.hppLoading=false;if(sameView(ctx,h))render()}}
}
async function load(force){
  if(S.loading&&!force)return;var seq=++S.seq,ctx=window.__HASNARIA_CONTEXT,h=$('dashboard');S.loading=true;S.error='';render();
  try{
    var r=await dashboardPack();
    if(seq!==S.seq||!sameView(ctx,h))return;
    if(r.error)throw r.error;
    var pack=r.data||{};
    S.periods=Array.isArray(pack.periods)?pack.periods:[];
    S.rows=Array.isArray(pack.rows)?pack.rows:[];
    if(!S.period||!S.periods.some(function(x){return key(x.period_start||x.period_key)===S.period}))S.period=S.periods.length?key(S.periods[0].period_start||S.periods[0].period_key):'';
    S.loaded=true;S.stale=false;
  }catch(e){if(seq!==S.seq||!sameView(ctx,h))return;S.error='Gagal memuat Ringkasan CEO: '+(e&&e.message?e.message:String(e))}
  finally{if(seq===S.seq){S.loading=false;if(sameView(ctx,h)){render();if(S.loaded&&S.hpp==null)loadHpp(seq)}}}
}
function canSync(){var h=$('dashboard'),ctx=window.__HASNARIA_CONTEXT,sync=window.__HASNARIA_DATA_SYNC;return!!(h&&ctx&&ctx.role==='owner'&&!h.classList.contains('hidden')&&h.querySelector('[data-ceo-one-view="1"]')&&S.loaded&&!S.loading&&!S.hppLoading&&!S.detailOpen&&sync&&sync.canRefresh(h,'#hx6Period'))}
async function syncRefresh(){
  if(S.syncing||!client()||!canSync())return false;
  var seq=S.seq,p=S.period,ctx=window.__HASNARIA_CONTEXT,h=$('dashboard'),root=h.querySelector('[data-ceo-one-view="1"]');S.syncing=true;
  try{
    var all=await Promise.all([
      dashboardPack(),
      client().from('hpp_sales_coverage_p11_v1').select('sales_volume_modeled_pct').eq('brand_id',BRAND).limit(1)
    ]);
    if(seq!==S.seq||p!==S.period||!sameView(ctx,h)||root!==h.querySelector('[data-ceo-one-view="1"]')||!canSync())return false;
    all.forEach(function(q){if(q.error)throw q.error});
    var pack=all[0].data||{},periods=Array.isArray(pack.periods)?pack.periods:[],rows=Array.isArray(pack.rows)?pack.rows:[];
    if(p&&!periods.some(function(x){return key(x.period_start||x.period_key)===p})){
      var selected=S.periods.find(function(x){return key(x.period_start||x.period_key)===p});
      periods=periods.concat([selected||{period_start:p+'-01'}]);
    }
    var hpp=all[1].data&&all[1].data[0]?n(all[1].data[0].sales_volume_modeled_pct):null;
    var changed=!!S.error||JSON.stringify([S.periods,S.rows,S.hpp])!==JSON.stringify([periods,rows,hpp]);
    S.periods=periods;S.rows=rows;S.hpp=hpp;S.error='';S.stale=false;
    if(changed)render();
    return true;
  }catch(_){return false}
  finally{S.syncing=false}
}
function registerSync(){var sync=window.__HASNARIA_DATA_SYNC;if(sync)sync.register('owner-dashboard',function(reason){if(reason==='changed')window.__HASNARIA_DASHBOARD_ONE_VIEW.invalidate();return syncRefresh()})}
function bind(h){
 h.onclick=function(e){
  var close=e.target&&e.target.closest?e.target.closest('[data-hx6-close]'):null;
  if(close&&(e.target===close||close.classList.contains('hx6-close'))){S.detailOpen=false;render();return}
  var detail=e.target&&e.target.closest?e.target.closest('[data-hx6-detail]'):null;
  if(detail){S.detailOpen=true;render()}
 };
 h.onchange=function(e){if(e.target&&e.target.id==='hx6Period'){S.period=key(e.target.value);S.detailOpen=false;render()}};
 h.onkeydown=function(e){if(e.key==='Escape'&&S.detailOpen){S.detailOpen=false;render()}};
}
async function mount(opts){
 var ctx=window.__HASNARIA_CONTEXT,h=$('dashboard');
 if(!ctx||ctx.role!=='owner'||!client()||!h||h.classList.contains('hidden'))return false;
 if(opts&&opts.silent)return syncRefresh();
 css();
 if(S.loaded&&!S.stale&&!(opts&&opts.force)){render();return true}
 await load(!!(opts&&opts.force));return true;
}
window.__HASNARIA_DASHBOARD_ONE_VIEW={mount:mount,invalidate:function(){S.seq++;S.stale=true;S.loading=false;S.hppLoading=false}};
registerSync();window.addEventListener('hasnaria:data-sync-ready',registerSync);
})();
