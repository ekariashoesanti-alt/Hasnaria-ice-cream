(function(){
'use strict';
var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4',rows=[];
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function rp(n){return 'Rp'+Number(n||0).toLocaleString('id-ID')}
function db(){return window.__HASNARIA_DB}
async function load(){
 var q=await db().from('ui_administration_purchase_v1').select('*').eq('brand_id',BRAND).order('purchase_date',{ascending:false}).limit(5000);
 if(q.error)throw q.error;rows=q.data||[];
}
function render(){
 var h=document.getElementById('administrasi');if(!h)return;
 var names=new Set(rows.map(function(x){return x.normalized_source_name})).size;
 var total=rows.reduce(function(a,x){return a+Number(x.total_amount||0)},0);
 var months=new Set(rows.map(function(x){return String(x.purchase_date||x.source_period||'').slice(0,7)}).filter(Boolean)).size;
 h.innerHTML='<div class="card"><div class="label">ADMINISTRASI · NON-STOCK</div><h2 style="margin-top:4px">Administrasi</h2><p class="small">Pengeluaran administratif dan operasional non-inventory. Data tetap berasal dari transaksi pembelian, tetapi tidak menambah atau mengurangi stok.</p><div class="grid-3" style="margin-top:14px"><div><div class="label">Jenis teridentifikasi</div><div class="metric">'+names+'</div></div><div><div class="label">Transaksi</div><div class="metric">'+rows.length.toLocaleString('id-ID')+'</div></div><div><div class="label">Total historis</div><div class="metric">'+rp(total)+'</div><div class="small">'+months+' periode bulan</div></div></div></div>'+
 '<div class="card"><h2>Riwayat Administrasi</h2><div style="overflow:auto"><table><thead><tr><th>Tanggal</th><th>Item / biaya</th><th>Jumlah</th><th>Nominal</th><th>Pembayaran</th><th>Sumber</th></tr></thead><tbody>'+
 (rows.map(function(x){return '<tr><td>'+esc(x.purchase_date||'—')+'</td><td><b>'+esc(x.item_name||'—')+'</b></td><td>'+esc(x.quantity_text||'—')+'</td><td>'+rp(x.total_amount)+'</td><td>'+esc(x.payment_method||'—')+'</td><td>'+esc(x.source_file||'—')+'</td></tr>'}).join('')||'<tr><td colspan="6" class="small">Belum ada transaksi administrasi.</td></tr>')+
 '</tbody></table></div></div>';
}
async function mount(o){var h=document.getElementById('administrasi');if(!h||h.classList.contains('hidden'))return;h.innerHTML='<div class="card"><h2>Administrasi</h2><p class="small">Memuat data…</p></div>';try{await load();render()}catch(e){h.innerHTML='<div class="redbox">Gagal memuat Administrasi: '+esc(e&&e.message||e)+'</div>'}}
window.__HASNARIA_ADMIN_V1={mount:mount};
})();