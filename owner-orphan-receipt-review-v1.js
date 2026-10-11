/* Hasnaria P0.1: Owner historical receipt evidence review (documentary only).
 * No Stock/Finance write paths: only four guarded RPCs in staging migration.
 */
(function(){
'use strict';
if(window.__HASNARIA_ORPHAN_OWNER_REVIEW_V1)return;
window.__HASNARIA_ORPHAN_OWNER_REVIEW_V1=true;
var db=null,opened=false,busy=false,items=[],chosen='',preview=null,
    filter='all',decision='',evidence='',reason='',error='',notice='',modal=null;
function owner(){var c=window.__HASNARIA_CONTEXT;return!!(c&&c.role==='owner')}
function safe(v){return String(v==null?'':v).replace(/[&<>"']/g,function(x){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]})}
function fmt(v){return Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:3})}
function rp(v){return 'Rp '+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:0})}
function current(){return items.find(function(x){return x.receipt_id===chosen})||null}
function uniq(x){return!!(x&&/(MAJOO|OTHER)_EVIDENCE_UNIQUE_REVIEW_ONLY/.test(x.evidence_status||''))}
function decisionOptions(x){
 var opts=uniq(x)?
 [['CONFIRM_EXTERNAL_EVIDENCE','Konfirmasi faktur eksternal unik'],
  ['KEEP_HISTORICAL_AUDIT','Pertahankan untuk audit lanjutan']]:
 [['REQUEST_ORIGINAL_SOURCE','Minta faktur/sumber asli'],
  ['KEEP_HISTORICAL_AUDIT','Pertahankan histori untuk audit']];
 return '<option value="">Pilih keputusan</option>'+opts.map(function(o){
  return'<option value="'+safe(o[0])+'"'+(decision===o[0]?' selected':'')+'>'+safe(o[1])+'</option>';
 }).join('');
}
function entry(){
 var host=document.getElementById('purchaseFinanceAlignment');
 if(!host)return;
 var old=host.querySelector('[data-hsn-legacy-review-entry]');
 if(!owner()){if(old)old.remove();if(opened)close();return}
 if(old)return;
 var el=document.createElement('div');
 el.className='pfa-detail-cta pfa-unit-entry';
 el.setAttribute('data-hsn-legacy-review-entry','1');
 el.innerHTML='<div><b>Audit bukti penerimaan Stok historis</b><span>Periksa referensi Pembelian lama dan faktur Majoo, tanpa mengubah saldo Stok atau jurnal.</span></div><button type="button" data-hsn-legacy-open="1">Tinjau ledger lama</button>';
 host.appendChild(el);
}
function selectedRows(){
 return items.filter(function(x){return filter==='all'||String(x.purchase_date||'').slice(0,7)===filter})
}
function draw(){
 if(!opened||!owner())return;
 if(!modal){modal=document.createElement('div');modal.className='pfa-modal-backdrop';modal.setAttribute('data-hsn-legacy-backdrop','1');document.body.appendChild(modal)}
 var x=current(),vis=selectedRows(),periods=Array.from(new Set(items.map(function(i){return String(i.purchase_date||'').slice(0,7)}))).filter(Boolean).sort();
 var head='<div class="pfa-modal-head"><div><div class="pfa-eyebrow">OWNER · HISTORI STOK</div><h3 id="hsnLegacyTitle">Audit bukti sumber Pembelian lama</h3><p>Dokumentasi saja · tidak menautkan UUID lama atau menambah Stok/Keuangan</p></div><button type="button" class="pfa-close" data-hsn-legacy-close="1" aria-label="Tutup">×</button></div>';
 var opt='<label>Periode historis <select data-hsn-legacy-filter="1"><option value="all">Semua periode ('+items.length+')</option>'+
 periods.map(function(p){return'<option value="'+safe(p)+'"'+(p===filter?' selected':'')+'>'+safe(p)+'</option>'}).join('')+'</select></label>';
 var table=vis.length?'<div class="pfa-table-scroll pfa-unit-table"><table class="pfa-table"><thead><tr><th>Tanggal</th><th>SKU</th><th>Qty</th><th>Bukti</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+
 vis.map(function(v){return'<tr'+(chosen===v.receipt_id?' class="pfa-unit-active"':'')+'><td>'+safe(v.purchase_date)+'</td><td><b>'+safe(v.item_name)+'</b><small>'+safe(v.baseline_effect)+'</small></td><td>'+safe(fmt(v.receipt_qty))+' '+safe(v.receipt_unit)+'</td><td>'+safe(uniq(v)?'Faktur unik':'Perlu bukti asli')+'</td><td>'+safe(v.review_id?'Terdokumentasi':v.status==='BLOCK_LEDGER_INTEGRITY_REPAIR'?'Ledger bermasalah':'Perlu review')+'</td><td><button type="button" data-hsn-legacy-select="'+safe(v.receipt_id)+'">Periksa</button></td></tr>'}).join('')+'</tbody></table></div>':'<div class="pfa-empty">Tidak ada baris pada periode ini.</div>';
 var form='';
 if(x){
  var locked=x.status==='BLOCK_LEDGER_INTEGRITY_REPAIR';
  form='<div class="pfa-unit-form"><h4>'+safe(x.item_name)+'</h4><p>'+safe(x.purchase_date)+' · '+safe(fmt(x.receipt_qty))+' '+safe(x.receipt_unit)+' · '+safe(rp(x.receipt_amount))+'</p>'+
  '<p class="pfa-unit-hint">UUID Purchase lama: '+safe(x.stale_purchase_uuid)+'</p>'+
  '<p class="pfa-unit-hint">Bukti faktur: '+safe(x.evidence_source_file||'Tidak ada bukti unik')+' · '+safe(x.evidence_source_key||'Butuh sumber asli')+'</p>';
  if(locked)form+='<p role="alert" class="pfa-error">Ditemukan dampak pada saldo aktif atau movement tidak konsisten. Review dihentikan; perlu pemeriksaan DBA.</p>';
  else if(x.review_id){
   form+='<p class="pfa-unit-success">Keputusan terdokumentasi: '+safe(x.review_decision)+' (bukan perbaikan UUID).</p>'+
    '<label>Alasan koreksi/pembatalan (minimal 30 karakter)<textarea data-hsn-legacy-field="reason" rows="2" maxlength="1000">'+safe(reason)+'</textarea></label>'+
    '<div class="pfa-unit-controls"><button type="button" data-hsn-legacy-revoke="1"'+(busy?' disabled':'')+'>Batalkan keputusan</button></div>';
  }else{
   form+='<div class="pfa-unit-fields"><label>Keputusan<select data-hsn-legacy-field="decision">'+decisionOptions(x)+'</select></label>'+
   '<label>Referensi arsip/nota<input data-hsn-legacy-field="evidence" maxlength="400" value="'+safe(evidence)+'" placeholder="Kode faktur, nama file atau permintaan dokumen"></label>'+
   '<label>Catatan pemeriksaan Owner (min. 30 karakter)<textarea data-hsn-legacy-field="reason" rows="3" maxlength="1000">'+safe(reason)+'</textarea></label></div>'+
   '<p class="pfa-unit-hint">'+(uniq(x)?'Bukti unik menurut metadata tetap perlu dicocokkan Owner dengan dokumen asli.':'Tidak ada bukti unik. Jangan menyatakan faktur cocok sebelum dokumen asli diperiksa.')+'</p>'+
   '<div class="pfa-unit-controls"><button type="button" data-hsn-legacy-preview="1"'+(busy?' disabled':'')+'>Pratinjau keputusan</button>'+
   (preview?'<button type="button" class="primary" data-hsn-legacy-apply="1"'+(busy?' disabled':'')+'>Catat hasil review</button>':'')+'</div>';
   if(preview)form+='<p class="pfa-unit-preview">Keputusan: <b>'+safe(preview.decision)+'</b> · Tidak ada perubahan Stock, Finance atau source UUID.</p>';
  }
  form+='</div>';
 }
 modal.innerHTML='<section class="pfa-modal pfa-unit-modal" role="dialog" aria-modal="true" aria-labelledby="hsnLegacyTitle">'+head+
 (busy?'<p>Memproses audit…</p>':'')+(error?'<p role="alert" class="pfa-error">'+safe(error)+'</p>':'')+
 (notice?'<p role="status" class="pfa-unit-success">'+safe(notice)+'</p>':'')+
 '<div class="pfa-modal-tools">'+opt+'</div>'+table+form+'</section>';
}
function close(){opened=false;chosen='';preview=null;if(modal){modal.remove();modal=null}}
async function load(){
 if(!opened||!owner())return;
 db=db||window.__HASNARIA_DB;
 if(!db){error='Koneksi database belum siap';draw();return}
 busy=true;error='';draw();
 try{
  var r=await db.rpc('owner_orphan_receipt_queue_v1',{p_period:null});
  if(r.error)throw r.error;
  if(!opened)return;
  items=Array.isArray(r.data&&r.data.items)?r.data.items:[];
  if(chosen&&!current()){chosen='';preview=null}
 }catch(e){error='Tidak dapat memuat antrean: '+(e&&e.message?e.message:String(e))}
 finally{busy=false;if(opened)draw()}
}
async function verify(){
 if(!opened||!owner()||!current()||busy)return;
 busy=true;preview=null;error='';notice='';draw();
 try{
  if(!decision)throw Error('Pilih keputusan review.');
  var r=await db.rpc('owner_orphan_receipt_preview_v1',{p_receipt_id:chosen,p_decision:decision});
  if(r.error)throw r.error;
  if(opened&&current())preview=r.data;
 }catch(e){error=e&&e.message?e.message:String(e)}
 finally{busy=false;if(opened)draw()}
}
async function apply(){
 if(!opened||!owner()||!preview||busy)return;
 busy=true;error='';draw();
 try{
  if(chosen!==preview.receipt_id||decision!==preview.decision)throw Error('Keputusan berubah. Pratinjau ulang.');
  var r=await db.rpc('owner_orphan_receipt_apply_v1',{
   p_receipt_id:chosen,p_decision:decision,p_token:preview.token,
   p_evidence_reference:evidence.trim(),p_reason:reason.trim()
  });
  if(r.error)throw r.error;
  preview=null;notice='Hasil review dicatat. UUID sumber, Stock dan Finance tetap.';
  await load();
 }catch(e){error=e&&e.message?e.message:String(e)}
 finally{busy=false;if(opened)draw()}
}
async function revoke(){
 var x=current();if(!opened||!owner()||!x||!x.review_id||busy)return;
 busy=true;error='';draw();
 try{
  var r=await db.rpc('owner_orphan_receipt_revoke_v1',{p_review_id:x.review_id,p_reason:reason.trim()});
  if(r.error)throw r.error;
  chosen='';preview=null;decision='';reason='';evidence='';
  notice='Keputusan dibatalkan; histori audit tetap tersimpan.';
  await load();
 }catch(e){error=e&&e.message?e.message:String(e)}
 finally{busy=false;if(opened)draw()}
}
document.addEventListener('click',function(ev){
 var e=ev.target;if(!e||!e.closest)return;
 if(e.closest('[data-hsn-legacy-open]')){if(!owner())return;opened=true;chosen='';preview=null;error='';notice='';load();return}
 if(!opened)return;
 var closeBtn=e.closest('[data-hsn-legacy-close],[data-hsn-legacy-backdrop]');
 if(closeBtn&&e===closeBtn){close();return}
 var selected=e.closest('[data-hsn-legacy-select]');
 if(selected){chosen=selected.getAttribute('data-hsn-legacy-select');decision='';evidence='';reason='';preview=null;error='';notice='';draw();return}
 if(e.closest('[data-hsn-legacy-preview]')){verify();return}
 if(e.closest('[data-hsn-legacy-apply]')){apply();return}
 if(e.closest('[data-hsn-legacy-revoke]')){revoke();return}
},true);
document.addEventListener('input',function(ev){
 if(!opened||!ev.target||!ev.target.getAttribute)return;
 var key=ev.target.getAttribute('data-hsn-legacy-field');
 if(!key)return;
 if(key==='decision')decision=ev.target.value;
 if(key==='evidence')evidence=ev.target.value;
 if(key==='reason')reason=ev.target.value;
 preview=null;
 var b=modal&&modal.querySelector('[data-hsn-legacy-apply]');if(b)b.disabled=true;
},true);
document.addEventListener('change',function(ev){
 if(!opened||!ev.target||!ev.target.getAttribute)return;
 if(ev.target.getAttribute('data-hsn-legacy-filter')){filter=ev.target.value;chosen='';preview=null;draw();return}
 if(ev.target.getAttribute('data-hsn-legacy-field')==='decision'){
  decision=ev.target.value;preview=null;draw();
 }
},true);
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&opened)close()},true);
function start(){
 var root=document.getElementById('pembelian');if(!root)return;
 var scheduled=false;function patch(){
  if(scheduled)return;scheduled=true;
  setTimeout(function(){scheduled=false;entry();if(opened&&!owner())close()},80);
 }
 new MutationObserver(patch).observe(root,{subtree:true,childList:true});
 patch();
}
// Never leave historical Purchase evidence visible after Owner logout.
function monitorAppVisibility(){
 var app=document.getElementById('app');
 if(!app)return;
 new MutationObserver(function(){
  if(app.classList.contains('hidden')&&opened)close();
 }).observe(app,{attributes:true,attributeFilter:['class']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
monitorAppVisibility();
})();