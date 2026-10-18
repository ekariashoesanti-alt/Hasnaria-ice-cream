/* Hasnaria Owner-only Data Quality Center: read-only, lazy, no second business ledger. */
(function(){
'use strict';
if(window.__HASNARIA_OWNER_NOTIFICATIONS_V1)return;
window.__HASNARIA_OWNER_NOTIFICATIONS_V1=true;
var db=null,ctx=null,seq=0,loading=false,data=null,error='',period='',filter='backlog',selected='';
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]})}
function money(v){return 'Rp '+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:0})}
function owner(){return !!(window.__HASNARIA_CONTEXT&&window.__HASNARIA_CONTEXT.role==='owner')}
function active(){var h=document.getElementById('notifikasi'),a=document.getElementById('app');return owner()&&h&&!h.classList.contains('hidden')&&(!a||!a.classList.contains('hidden'))}
function label(p){var n=Number(p.slice(5,7));return (MONTHS[n-1]||'Periode')+' '+p.slice(0,4)}
function current(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function entry(id,title,description,amount,kind,scope){
 return{id:id,title:title,description:description,amount:amount,kind:kind,scope:scope||'Pembelian'}
}
function analyze(){
 var out=[],p=data&&data.purchase,c=data&&data.conversions;
 if(p){
  var rows=Array.isArray(p.rows)?p.rows:[],control=p.control||{};
  if(rows.length){
   out.push(entry('source','Sumber Pembelian kanonis tersedia','Transaksi bersumber dari data kanonis; ini bukan persetujuan Stok atau jurnal.',rows.length+' transaksi','success'));
   if(control.finance_link_status!=='MATCH'){
    out.push(entry('finance','Rekonsiliasi Pembelian → Keuangan','Jurnal Pembelian belum cocok. Periksa klasifikasi akun, pembayaran, dan preview dampak sebelum posting.',money(control.purchase_journal_delta||control.purchase_amount||0)+' selisih','backlog','Keuangan'));
   }else out.push(entry('finance-ok','Pembelian → Keuangan cocok','Link finance berstatus MATCH menurut kontrak rekonsiliasi periode.', 'MATCH','success','Keuangan'));
   var unitted=rows.filter(function(r){return (r.stock_status==='ready_to_stock'||r.stock_status==='stock_review_required')&&!String(r.source_stock_unit||'').trim()}).length;
   if(unitted)out.push(entry('units','Satuan stok sumber belum lengkap','Lengkapi satuan dan bukti fisik kemasan. Tidak ada posting Stok otomatis.',unitted+' transaksi','backlog','Stok'));
   var unmapped=rows.filter(function(r){return r.stock_status==='stock_review_required'||/unmatched|ambiguous/i.test(String(r.stock_mapping_status||''))}).length;
   if(unmapped)out.push(entry('mapping','Mapping SKU perlu pemeriksaan','Cocokkan alias/master SKU berdasarkan faktur; jangan pilih barang berdasarkan kemiripan nama saja.',unmapped+' transaksi','backlog','Stok'));
   if(control.stock_link_status!=='OK')out.push(entry('stock','Rekonsiliasi Pembelian → Stok','Saldo Stok belum berstatus OK untuk periode ini. Periksa opname dan konversi sebelum perubahan.', 'PERLU REVIEW','backlog','Stok'));
   else out.push(entry('stock-ok','Pembelian → Stok sesuai','Kontrak rekonsiliasi Stok berstatus OK.', 'MATCH','success','Stok'));
  }else out.push(entry('empty','Belum ada Pembelian kanonis','Tidak ada transaksi pada periode ini. Belum dapat menyimpulkan hasil rekonsiliasi.', '0 transaksi','info'));
 }
 if(c&&Number(c.pending_rules)>0)out.push(entry('conversion','Aturan konversi belum diverifikasi','Verifikasi satuan dan faktor draft dengan label kemasan/nota. Jalur verifikasi lama tetap ditahan.',Number(c.pending_rules)+' draft','backlog','Stok'));
 if(!out.length&&!error&&!loading)out.push(entry('none','Tidak ada hasil pemeriksaan','Gunakan Muat Ulang setelah periode dipilih.','—','info'));
 return out;
}
function draw(){
 var h=document.getElementById('notifikasi');
 if(!h||!active())return;
 var list=analyze(),back=list.filter(function(x){return x.kind==='backlog'}),ok=list.filter(function(x){return x.kind==='success'});
 var shown=list.filter(function(x){return filter==='all'||(filter==='backlog'?x.kind==='backlog':x.kind==='success')});
 var chosen=shown.find(function(x){return x.id===selected})||shown[0]||null;
 var k='<section class="hqn-shell"><div class="hqn-head"><div><small>OWNER · DATA QUALITY CENTER</small><h1>Notifikasi</h1><p>Status data berhasil dan backlog perbaikan Source of Truth. Semua pemeriksaan read-only.</p></div><div class="hqn-tools"><label>Bulan <input type="month" id="hqnPeriod" value="'+esc(period)+'"></label><button type="button" data-hqn-refresh>↻ Refresh</button></div></div>';
 k+='<div class="hqn-kpis"><article><span>BERHASIL</span><strong>'+ok.length+'</strong><small>Kontrol cocok</small></article><article><span>BACKLOG</span><strong>'+back.length+'</strong><small>Perlu review Owner</small></article><article><span>DATA SUMBER</span><strong>'+esc(data&&data.purchase&&data.purchase.rows?data.purchase.rows.length:'—')+'</strong><small>Transaksi periode ini</small></article><article><span>KONVERSI DRAFT</span><strong>'+esc(data&&data.conversions?data.conversions.pending_rules:'—')+'</strong><small>Belum verified</small></article></div>';
 if(loading)k+='<div class="hqn-message">Memeriksa data periode…</div>';
 if(error)k+='<div class="hqn-message hqn-error" role="alert">'+esc(error)+'</div>';
 k+='<div class="hqn-panel"><div class="hqn-panel-title"><div><h2>Antrean Cleansing & Review Owner</h2><p>Keputusan hapus atau koreksi harus memiliki bukti dan audit trail; tidak dilakukan dari ringkasan ini.</p></div><div class="hqn-tabs">';
 [['backlog','Backlog'],['success','Berhasil'],['all','Semua']].forEach(function(x){k+='<button type="button" data-hqn-filter="'+x[0]+'" class="'+(filter===x[0]?'active':'')+'">'+x[1]+'</button>'});k+='</div></div><div class="hqn-two"><div class="hqn-list">';
 shown.forEach(function(x){k+='<button type="button" data-hqn-item="'+esc(x.id)+'" class="hqn-item '+(chosen&&chosen.id===x.id?'active':'')+'"><span class="hqn-icon '+esc(x.kind)+'">'+(x.kind==='success'?'✓':x.kind==='backlog'?'!':'i')+'</span><span><b>'+esc(x.title)+'</b><small>'+esc(x.scope)+' · '+esc(x.amount)+'</small></span><span class="hqn-arrow">›</span></button>'});
 if(!shown.length)k+='<div class="hqn-message">Tidak ada item pada filter ini.</div>';
 k+='</div><div class="hqn-detail">';
 if(chosen)k+='<small>'+esc(chosen.scope)+' · '+esc(chosen.kind==='success'?'BERHASIL':chosen.kind==='backlog'?'PERLU REVIEW':'INFORMASI')+'</small><h3>'+esc(chosen.title)+'</h3><strong>'+esc(chosen.amount)+'</strong><p>'+esc(chosen.description)+'</p>'+(chosen.kind==='backlog'?'<div class="hqn-guidance">Bukti asli, keputusan Owner dan pratinjau dampak diperlukan sebelum perubahan data.</div><button type="button" class="hqn-primary" data-hqn-purchase>Buka Review di Pembelian →</button>':'<div class="hqn-guidance">Pemeriksaan ini tidak mengubah Stok maupun jurnal.</div>');
 else k+='<p>Belum ada item untuk ditampilkan.</p>';
 k+='</div></div></div></section>';h.innerHTML=k;
}
async function load(force){
 if(!active())return;
 db=db||window.__HASNARIA_DB;if(!db){error='Sesi database belum siap.';draw();return}
 if(loading&&!force)return;
 var id=++seq,sess=window.__HASNARIA_CONTEXT,month=period;loading=true;error='';draw();
 try{
  var result=await Promise.allSettled([
   db.rpc('get_purchase_control_period_v1',{p_brand:sess.brandId,p_period:month+'-01'}),
   db.rpc('owner_conversion_review_queue_v1')
  ]);
  if(id!==seq||!active()||window.__HASNARIA_CONTEXT!==sess||period!==month)return;
  var failure=[],next={};
  if(result[0].status==='fulfilled'&&!result[0].value.error)next.purchase=result[0].value.data||{rows:[],control:{}};
  else failure.push('Pembelian: '+(result[0].status==='rejected'?String(result[0].reason):result[0].value.error.message));
  if(result[1].status==='fulfilled'&&!result[1].value.error)next.conversions=result[1].value.data||{};
  else failure.push('Konversi: '+(result[1].status==='rejected'?String(result[1].reason):result[1].value.error.message));
  data=next;error=failure.join(' · ');
 }catch(e){if(id===seq)error=e&&e.message?e.message:String(e)}
 finally{if(id===seq&&active()){loading=false;draw()}}
}
function mount(){if(!active())return;var s=window.__HASNARIA_CONTEXT;if(ctx!==s){ctx=s;data=null;period=current();filter='backlog';selected='';}
 draw();if(!data&&!loading)load(false)}
document.addEventListener('click',function(e){if(!active())return;var t=e.target&&e.target.closest?e.target.closest('[data-hqn-refresh],[data-hqn-filter],[data-hqn-item],[data-hqn-purchase]'):null;if(!t)return;
 if(t.hasAttribute('data-hqn-refresh')){load(true);return}
 if(t.hasAttribute('data-hqn-filter')){filter=t.getAttribute('data-hqn-filter');selected='';draw();return}
 if(t.hasAttribute('data-hqn-item')){selected=t.getAttribute('data-hqn-item');draw();return}
 if(t.hasAttribute('data-hqn-purchase')&&window.__HASNARIA_OWNER_SHELL)window.__HASNARIA_OWNER_SHELL.navigate('pembelian');
},true);
document.addEventListener('change',function(e){if(e.target&&e.target.id==='hqnPeriod'&&active()){var p=e.target.value;if(/^\d{4}-(0[1-9]|1[0-2])$/.test(p)){period=p;data=null;selected='';load(true)}}},true);
window.__HASNARIA_OWNER_NOTIFICATIONS={mount:mount,refresh:function(){if(active())load(true)}};
})();
