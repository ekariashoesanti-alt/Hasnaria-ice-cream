(function(){
'use strict';
if(window.__HASNARIA_ADMIN_V2&&typeof window.__HASNARIA_ADMIN_V2.mount==='function')return;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var S={periods:[],period:'',overview:null,chart:[],detail:[],loading:false,error:'',detailOpen:false,detailLoading:false,detailError:'',seq:0};

function db(){return window.__HASNARIA_DB}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return Number.isFinite(v)?v:0}
function money(v){return'Rp'+n(v).toLocaleString('id-ID',{maximumFractionDigits:0})}
function key(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function monthLabel(v){var k=key(v);return k?MONTHS[Number(k.slice(5,7))-1]+' '+k.slice(0,4):'Periode belum tersedia'}
function cutLabel(){var k=key(S.period);if(!k)return'Periode belum tersedia';var y=Number(k.slice(0,4)),m=Number(k.slice(5,7)),last=new Date(Date.UTC(y,m,0)).getUTCDate();return'1–'+last+' '+monthLabel(k)}
function dateLabel(v){var s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—'}
function ensureCss(){if(document.getElementById('administration-ui5-css'))return;var l=document.createElement('link');l.id='administration-ui5-css';l.rel='stylesheet';l.href='/administration-v1.css?v=1';document.head.appendChild(l)}

function periodOptions(){
 return S.periods.map(function(x){var k=key(x.period_start||x.period_key);return'<option value="'+esc(k)+'"'+(k===S.period?' selected':'')+'>'+esc(monthLabel(k))+'</option>'}).join('');
}
function card(label,value,sub,cls){return'<article class="ad5-card '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||'')+'</small></article>'}
function chartMarkup(){
 if(S.loading&&!S.chart.length)return'<div class="ad5-empty">Memuat kategori…</div>';
 if(!S.chart.length)return'<div class="ad5-empty">Belum ada transaksi Administrasi pada periode ini.</div>';
 var max=Math.max.apply(null,S.chart.map(function(x){return n(x.amount)}).concat([1]));
 return'<div class="ad5-chart">'+S.chart.map(function(x){var value=n(x.amount),pct=Math.max(2,Math.min(100,value/max*100));return'<div class="ad5-chart-row"><div><span>'+esc(x.category||'Administrasi')+'</span><b>'+esc(money(value))+'</b></div><progress max="100" value="'+pct.toFixed(2)+'">'+pct.toFixed(0)+'%</progress><small>'+n(x.admin_rows).toLocaleString('id-ID')+' transaksi</small></div>'}).join('')+'</div>';
}
function detailTable(){
 if(S.detailLoading)return'<div class="ad5-empty">Memuat detail transaksi…</div>';
 if(S.detailError)return'<div class="ad5-error">'+esc(S.detailError)+'</div>';
 if(!S.detail.length)return'<div class="ad5-empty">Tidak ada transaksi Administrasi pada periode ini.</div>';
 return'<div class="ad5-table-wrap"><table class="ad5-table"><thead><tr><th>Tanggal</th><th>Item / Biaya</th><th>Kategori</th><th>Jumlah</th><th>Harga Satuan</th><th>Nominal</th><th>Pembayaran</th><th>Finance</th></tr></thead><tbody>'+
 S.detail.map(function(x){var qty=[x.quantity_text,x.unit_text].filter(Boolean).join(' ');return'<tr><td>'+esc(dateLabel(x.purchase_date))+'</td><td><b>'+esc(x.item_name||'—')+'</b><small>'+esc(x.notes||'')+'</small></td><td>'+esc(x.expense_category||'Administrasi')+'</td><td>'+esc(qty||'—')+'</td><td>'+esc(money(x.unit_price))+'</td><td class="num"><b>'+esc(money(x.total_amount))+'</b></td><td>'+esc(x.payment_method||'—')+'</td><td><span class="ad5-pill '+(x.journal_status==='posted'?'ok':'warn')+'">'+esc(x.journal_status||'—')+'</span></td></tr>'}).join('')+
 '</tbody></table></div>';
}
function modalMarkup(){
 if(!S.detailOpen)return'';
 return'<div class="ad5-modal-backdrop" data-ad5-close="1"><section class="ad5-modal" role="dialog" aria-modal="true" aria-labelledby="ad5ModalTitle"><div class="ad5-modal-head"><div><div class="ad5-eyebrow">DETAIL ADMINISTRASI</div><h3 id="ad5ModalTitle">'+esc(monthLabel(S.period))+'</h3><p>Rincian transaksi non-stock yang dirutekan dari Pembelian dan tersinkron ke Keuangan.</p></div><button type="button" class="ad5-close" data-ad5-close="1" aria-label="Tutup">×</button></div><div class="ad5-modal-body">'+detailTable()+'</div></section></div>';
}
function render(){
 var h=document.getElementById('administrasi');if(!h)return;ensureCss();
 var v=S.overview||{},sync=v.sync_ok===true;
 h.innerHTML='<section class="ad5-shell">'+
   '<div class="ad5-head"><div><div class="ad5-eyebrow">ADMINISTRASI · '+esc(cutLabel())+'</div><h2>Administrasi</h2><p>Pengeluaran operasional non-inventory. Nilai berasal dari Pembelian, tidak mengubah stok, dan otomatis masuk Keuangan.</p></div><div class="ad5-period"><label><span>Cut periode</span><select id="ad5Period">'+periodOptions()+'</select></label></div></div>'+
   (S.error?'<div class="ad5-error">'+esc(S.error)+'</div>':'')+
   '<div class="ad5-cards">'+
     card('Total Administrasi',S.loading&&!S.overview?'…':money(v.admin_amount),n(v.admin_rows).toLocaleString('id-ID')+' transaksi','total')+
     card('Kategori',S.loading&&!S.overview?'…':n(v.category_count).toLocaleString('id-ID'),'kategori pengeluaran','category')+
     card('Transaksi',S.loading&&!S.overview?'…':n(v.admin_rows).toLocaleString('id-ID'),cutLabel(),'rows')+
     card('Sinkron Keuangan',S.loading&&!S.overview?'…':(sync?'OK':'Periksa'),sync?'jurnal sesuai sumber':'butuh rekonsiliasi',sync?'sync':'warn')+
   '</div>'+
   '<div class="ad5-grid"><article class="ad5-panel"><div class="ad5-panel-head"><div><h3>Komposisi Pengeluaran</h3><p>Nominal per kategori pada periode terpilih.</p></div></div>'+chartMarkup()+'</article><article class="ad5-panel"><div class="ad5-panel-head"><div><h3>Alur Data</h3><p>Administrasi bukan input keuangan kedua.</p></div></div><div class="ad5-flow"><div><span>1</span><b>Pembelian</b><small>transaksi sumber</small></div><i>→</i><div><span>2</span><b>Administrasi</b><small>non-stock</small></div><i>→</i><div><span>3</span><b>Keuangan</b><small>jurnal otomatis</small></div></div><div class="ad5-sync '+(sync?'ok':'warn')+'"><span>Status periode</span><b>'+(sync?'TERSINKRON':'PERLU PERIKSA')+'</b></div></article></div>'+
   '<div class="ad5-cta"><div><b>'+n(v.admin_rows).toLocaleString('id-ID')+' transaksi · '+esc(monthLabel(S.period))+'</b><span>Detail transaksi tidak memenuhi halaman utama.</span></div><button type="button" class="primary" data-ad5-detail="1">Lihat Detail Administrasi</button></div>'+
   modalMarkup()+
 '</section>';
 bind(h);
}
async function loadPeriods(){
 var q=await db().from('ui_period_catalog_v1').select('period_start,period_key').eq('brand_id',BRAND).eq('module','administrasi').order('period_start',{ascending:false});
 if(q.error)throw q.error;S.periods=q.data||[];
 if(!S.period||!S.periods.some(function(x){return key(x.period_start||x.period_key)===S.period}))S.period=S.periods.length?key(S.periods[0].period_start||S.periods[0].period_key):'';
}
async function loadSummary(force){
 if(S.loading&&!force)return;var seq=++S.seq;S.loading=true;S.error='';render();
 try{
   if(!S.periods.length||force)await loadPeriods();
   if(seq!==S.seq)return;
   if(!S.period){S.overview=null;S.chart=[];return}
   var month=S.period+'-01';
   var pair=await Promise.all([
     db().from('ui_administration_overview_v1').select('*').eq('brand_id',BRAND).eq('period_month',month).limit(1),
     db().from('ui_administration_category_chart_v1').select('category,admin_rows,amount').eq('brand_id',BRAND).eq('period_month',month).order('amount',{ascending:false})
   ]);
   if(seq!==S.seq)return;
   if(pair[0].error)throw pair[0].error;if(pair[1].error)throw pair[1].error;
   S.overview=pair[0].data&&pair[0].data[0]?pair[0].data[0]:null;S.chart=pair[1].data||[];
 }catch(e){if(seq!==S.seq)return;S.overview=null;S.chart=[];S.error='Gagal memuat Administrasi: '+(e&&e.message?e.message:String(e))}
 finally{if(seq===S.seq){S.loading=false;render()}}
}
async function loadDetail(){
 if(!S.period||S.detailLoading)return;S.detailLoading=true;S.detailError='';S.detail=[];render();
 try{
   var q=await db().from('ui_administration_detail_v1').select('*').eq('brand_id',BRAND).eq('period_month',S.period+'-01').order('purchase_date',{ascending:false});
   if(q.error)throw q.error;S.detail=q.data||[];
 }catch(e){S.detailError=e&&e.message?e.message:String(e)}
 finally{S.detailLoading=false;render()}
}
function bind(h){
 h.onclick=function(e){
   var close=e.target&&e.target.closest?e.target.closest('[data-ad5-close]'):null;
   if(close&&(e.target===close||close.classList.contains('ad5-close'))){S.detailOpen=false;render();return}
   var detail=e.target&&e.target.closest?e.target.closest('[data-ad5-detail]'):null;
   if(detail){S.detailOpen=true;loadDetail();return}
 };
 h.onchange=function(e){
   if(e.target&&e.target.id==='ad5Period'){S.period=key(e.target.value);S.overview=null;S.chart=[];S.detail=[];S.detailOpen=false;loadSummary(false)}
 };
 h.onkeydown=function(e){if(e.key==='Escape'&&S.detailOpen){S.detailOpen=false;render()}};
}
async function mount(o){
 var h=document.getElementById('administrasi');if(!h||h.classList.contains('hidden'))return;ensureCss();
 if(S.loading)return;
 if(S.overview&&!(o&&o.force)){render();return}
 await loadSummary(!!(o&&o.force));
}
window.__HASNARIA_ADMIN_V2={mount:mount};
window.__HASNARIA_ADMIN_V1=window.__HASNARIA_ADMIN_V2;
})();