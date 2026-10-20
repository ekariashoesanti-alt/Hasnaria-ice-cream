/* Hasnaria Owner review: draft SKU conversion triage only.
 * No edits to inventory, receipts, units, conversion status, recipes or Finance.
 */
(function(){
'use strict';
if(window.__HASNARIA_CONVERSION_TRIAGE_V1)return;
window.__HASNARIA_CONVERSION_TRIAGE_V1=true;
var db=null,opened=false,ownerSession=null,seq=0,modal=null,data=null,error='',loading=false,timer=0;
function owner(){var x=window.__HASNARIA_CONTEXT;return !!(x&&x.role==='owner')}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function allowed(){
 var app=document.getElementById('app'),purchase=document.getElementById('pembelian');
 return opened&&owner()&&ownerSession===window.__HASNARIA_CONTEXT&&
  (!app||!app.classList.contains('hidden'))&&
  (!purchase||!purchase.classList.contains('hidden'));
}
function close(){seq++;opened=false;loading=false;ownerSession=null;data=null;error='';if(modal){modal.remove();modal=null}}
function entry(){
 var host=document.getElementById('pfaReviewSlot');if(!host)return;
 var btn=host.querySelector('[data-hsn-conversion-entry]');
 if(!owner()){if(btn)btn.remove();if(opened)close();return}
 if(btn)return;
 btn=document.createElement('div');
 btn.setAttribute('data-hsn-conversion-entry','1');
 btn.className='pfa-detail-cta pfa-unit-entry';
 btn.innerHTML='<div><b>Review 25 aturan konversi</b><span>Urutkan konflik dan duplikasi, lalu cocokkan faktor dengan label kemasan dan resep. Tidak mengubah Stok.</span></div>'+
 '<button type="button" data-hsn-conversion-open="1">Periksa konversi</button>';
 host.appendChild(btn);
}
function status(item){
 if(item.gate==='BLOCK_MASTER_SALE_UNIT_CONFLICT')return 'Satuan master tidak sesuai';
 if(item.gate==='REVIEW_DUPLICATE_UNVERIFIED_RULES')return 'Aturan draft duplikat';
 if(String(item.gate).indexOf('BLOCK_')===0)return 'Konflik: harus diperbaiki';
 return 'Menunggu bukti isi kemasan';
}
function draw(){
 if(!allowed())return;
 if(!modal){
  modal=document.createElement('div');modal.className='pfa-modal-backdrop';
  modal.setAttribute('data-hsn-conversion-backdrop','1');document.body.appendChild(modal);
 }
 var a=data&&Array.isArray(data.items)?data.items:[];
 var html=a.map(function(item){
  var factor=item.draft_factor_min==item.draft_factor_max?String(item.draft_factor_min):String(item.draft_factor_min)+'–'+String(item.draft_factor_max);
  return '<tr><td><b>'+esc(item.sku)+'</b><small>Satuan master: '+esc(item.master_unit)+'</small></td>'+
   '<td>'+esc(item.purchase_unit)+' → '+esc(item.sale_unit)+'</td>'+
   '<td>'+esc(factor)+'</td><td>'+esc(item.pending_rules)+'</td>'+
   '<td>'+esc(status(item))+'</td></tr>';
 }).join('');
 modal.innerHTML='<section class="pfa-modal pfa-unit-modal" role="dialog" aria-modal="true" aria-labelledby="hsnConvTitle">'+
 '<div class="pfa-modal-head"><div><div class="pfa-eyebrow">OWNER · REVIEW STOK</div>'+
 '<h3 id="hsnConvTitle">Pemeriksaan aturan konversi</h3>'+
 '<p>Faktor yang ditampilkan masih estimasi, bukan persetujuan isi kemasan.</p></div>'+
 '<button type="button" class="pfa-close" data-hsn-conversion-close="1" aria-label="Tutup">×</button></div>'+
 '<div class="pfa-unit-preview"><b>'+esc(data?data.pending_rules:'—')+' aturan draft</b> dalam '+esc(data?data.group_count:'—')+
 ' pasangan SKU–satuan. Sudah verified: '+esc(data?data.verified_rules:'—')+
 '. Tidak ada posting Stok maupun perubahan resep.</div>'+
 (loading?'<p>Memuat pemeriksaan…</p>':'')+
 (error?'<p role="alert" class="pfa-error">'+esc(error)+'</p>':'')+
 '<p class="pfa-unit-hint"><b>Prioritas:</b> perbaiki satuan master BAKSO AYAM; periksa aturan ganda NATA DE COCO dan SPRITE; lalu validasi isi kemasan untuk aturan lainnya. Jangan langsung klik verifikasi faktor estimasi.</p>'+
 (a.length?'<div class="pfa-table-scroll pfa-unit-table"><table class="pfa-table"><thead><tr><th>SKU</th><th>Beli → Stok</th><th>Faktor draft</th><th>Aturan</th><th>Hasil pemeriksaan</th></tr></thead><tbody>'+html+'</tbody></table></div>':
 (!loading&&!error?'<div class="pfa-empty">Tidak ada aturan konversi draft.</div>':''))+
 '<p class="pfa-unit-hint">Verifikasi membutuhkan label kemasan/nota pemasok dan konfirmasi satuan resep. Angka di tabel tidak mengubah transaksi atau saldo.</p></section>';
}
async function load(){
 if(!allowed())return;
 db=window.__HASNARIA_DB||db;
 var token=++seq,ctx=ownerSession;
 if(!db){error='Koneksi database belum tersedia';draw();return}
 loading=true;error='';draw();
 try{
  var result=await db.rpc('owner_conversion_review_queue_v1');
  if(result.error)throw result.error;
  if(!allowed()||ctx!==ownerSession||token!==seq)return;
  data=result.data;
 }catch(e){if(allowed()&&token===seq)error=e&&e.message?e.message:String(e)}
 finally{if(allowed()&&token===seq){loading=false;draw()}}
}
document.addEventListener('click',function(ev){
 var t=ev.target;if(!t||!t.closest)return;
 if(t.closest('[data-hsn-conversion-open]')){
  if(!owner())return;
  if(opened)close();
  ownerSession=window.__HASNARIA_CONTEXT;opened=true;load();return;
 }
 if(!allowed())return;
 if(t.closest('[data-hsn-conversion-close]'))close();
},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&opened)close()},true);
function boot(){
 var panel=document.getElementById('pembelian');if(!panel)return;
 new MutationObserver(function(){
  if(timer)clearTimeout(timer);
  timer=setTimeout(function(){timer=0;entry();if(opened&&!allowed())close()},85)
 }).observe(panel,{subtree:true,childList:true});
 var app=document.getElementById('app');
 if(app)new MutationObserver(function(){if(opened&&!allowed())close()}).observe(app,{attributes:true,attributeFilter:['class']});
 entry();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
