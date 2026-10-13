/* HSN P0.2 Owner-only documentary master-unit review.
 * Physical decision first. NO edit to inventory_items.unit/Stock/BOM/Finance.
 */
(function(){
'use strict';
if(window.__HASNARIA_MASTER_UNIT_REVIEW_V1)return;
window.__HASNARIA_MASTER_UNIT_REVIEW_V1=true;
var db=null,dialog=null,opened=false,busy=false,rows=[],selected='',preview=null,
    decision='',unit='',evidence='',reason='',error='',notice='',showAll=false,
    seq=0,sessionContext=null;
function owner(){var c=window.__HASNARIA_CONTEXT;return !!(c&&c.role==='owner')}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(x){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[x]})}
function current(){return rows.find(function(x){return x.item_id===selected})||null}
function permitted(){return opened&&owner()&&sessionContext===window.__HASNARIA_CONTEXT}
function invalidate(){preview=null;var b=dialog&&dialog.querySelector('[data-hsn-master-apply]');if(b)b.disabled=true}
function clearForm(){decision='';unit='';evidence='';reason='';preview=null;error='';notice=''}
function close(){seq++;opened=false;selected='';preview=null;sessionContext=null;if(dialog){dialog.remove();dialog=null}}
function entry(){
 var host=document.getElementById('purchaseFinanceAlignment');if(!host)return;
 var old=host.querySelector('[data-hsn-master-entry]');
 if(!owner()){if(old)old.remove();if(opened)close();return}
 if(old)return;
 var el=document.createElement('div');el.className='pfa-detail-cta pfa-unit-entry';
 el.setAttribute('data-hsn-master-entry','1');
 el.innerHTML='<div><b>Verifikasi satuan master SKU</b><span>Prioritas SKU yang dipakai Stok, penerimaan atau resep. Keputusan Owner dicatat tanpa mengganti satuan master otomatis.</span></div><button type="button" data-hsn-master-open="1">Periksa SKU prioritas</button>';
 host.appendChild(el);
}
function markup(){
 if(!permitted())return;
 if(!dialog){dialog=document.createElement('div');dialog.className='pfa-modal-backdrop';dialog.setAttribute('data-hsn-master-backdrop','1');document.body.appendChild(dialog)}
 var x=current();
 var head='<div class="pfa-modal-head"><div><div class="pfa-eyebrow">OWNER · MASTER SKU</div><h3 id="hsnMasterTitle">Verifikasi satuan master Stok</h3><p>Hanya dokumentasi Owner · Master, movement, BOM dan Finance tidak berubah</p></div><button type="button" data-hsn-master-close="1" class="pfa-close" aria-label="Tutup">×</button></div>';
 var toggle='<label style="font-size:12px"><input type="checkbox" data-hsn-master-all="1"'+(showAll?' checked':'')+'> Tampilkan juga SKU placeholder yang belum digunakan</label>';
 var table=rows.length?'<div class="pfa-table-scroll pfa-unit-table"><table class="pfa-table"><thead><tr><th>SKU</th><th>Satuan lama</th><th>Ketergantungan</th><th>Review</th><th>Aksi</th></tr></thead><tbody>'+rows.map(function(v){
  var risk=[v.tracking_active?'Tracking':'',v.receipt_count>0?'Receipt '+v.receipt_count:'',v.active_recipe_count>0?'Resep '+v.active_recipe_count:'',v.pending_purchase_count>0?'Pending '+v.pending_purchase_count:''].filter(Boolean).join(' · ')||'Belum ada pemakaian aktif';
  return'<tr'+(v.item_id===selected?' class="pfa-unit-active"':'')+'><td><b>'+esc(v.item_name)+'</b><small>'+esc(v.category||'')+'</small></td><td>'+esc(v.master_unit||'[kosong]')+'</td><td>'+esc(risk)+'</td><td>'+esc(v.review_id?'Terdokumentasi':'Belum diverifikasi')+'</td><td><button type="button" data-hsn-master-select="'+esc(v.item_id)+'"'+(busy?' disabled':'')+'>Periksa</button></td></tr>';
 }).join('')+'</tbody></table></div>':'<div class="pfa-empty">Tidak ada SKU placeholder untuk filter ini.</div>';
 var form='';
 if(x){
  form='<div class="pfa-unit-form"><h4>'+esc(x.item_name)+'</h4><p>Satuan master saat ini: <b>'+esc(x.master_unit||'[kosong]')+'</b> · '+esc(x.priority)+'</p><p class="pfa-unit-hint">Opname terakhir: '+esc(x.last_opname_date||'belum ada')+' · '+esc(x.receipt_count)+' penerimaan · '+esc(x.movement_count)+' movement · '+esc(x.active_recipe_count)+' resep aktif</p>';
  if(x.review_id){
   form+='<p class="pfa-unit-success">Keputusan Owner tercatat: '+esc(x.decision)+' '+esc(x.proposed_stock_unit||'')+'. Satuan master belum diubah.</p><label>Alasan pembatalan (30 karakter atau lebih)<textarea data-hsn-master-field="reason" rows="2" maxlength="1000">'+esc(reason)+'</textarea></label><div class="pfa-unit-controls"><button type="button" data-hsn-master-revoke="1"'+(busy?' disabled':'')+'>Batalkan review</button></div>';
  }else{
   var options=[['DOCUMENT_UNIT','Dokumentasikan satuan fisik'],['HOLD_FOR_EVIDENCE','Tunda hingga ada bukti'],['NOT_FOR_STOCK','Tidak perlu tracking Stok']].map(function(v){return'<option value="'+v[0]+'"'+(decision===v[0]?' selected':'')+'>'+v[1]+'</option>'}).join('');
   form+='<div class="pfa-unit-fields"><label>Keputusan<select data-hsn-master-field="decision"><option value="">Pilih keputusan</option>'+options+'</select></label>'+
    '<label>Usulan satuan master<input data-hsn-master-field="unit" maxlength="40" placeholder="Contoh: pcs, gram, ml, porsi" value="'+esc(unit)+'"'+(decision!=='DOCUMENT_UNIT'?' disabled':'')+'></label>'+
    '<label>Referensi bukti/kemasan<input data-hsn-master-field="evidence" maxlength="400" value="'+esc(evidence)+'" placeholder="Nama foto label atau nomor nota"></label>'+
    '<label>Alasan Owner<textarea data-hsn-master-field="reason" rows="3" maxlength="1000" placeholder="Ukuran fisik, peruntukan, dan efek pada resep/stok">'+esc(reason)+'</textarea></label></div>'+
    '<p class="pfa-unit-hint">Satuan stok yang digunakan untuk resep, opname dan riwayat tidak boleh diubah hanya dengan dokumen ini.</p>'+
    '<div class="pfa-unit-controls"><button type="button" data-hsn-master-preview="1"'+(busy?' disabled':'')+'>Pratinjau keputusan</button>'+
    (preview?'<button type="button" class="primary" data-hsn-master-apply="1"'+(busy?' disabled':'')+'>Simpan bukti Owner</button>':'')+'</div>';
   if(preview)form+='<p class="pfa-unit-preview"><b>'+esc(preview.decision)+'</b> '+esc(preview.proposed_stock_unit||'')+' — hanya bukti, tidak mengubah SKU, Stok, resep atau Keuangan.</p>';
  }
  form+='</div>';
 }
 dialog.innerHTML='<section class="pfa-modal pfa-unit-modal" role="dialog" aria-modal="true" aria-labelledby="hsnMasterTitle">'+head+
 (busy?'<p>Memuat atau menyimpan pemeriksaan…</p>':'')+(error?'<p class="pfa-error" role="alert">'+esc(error)+'</p>':'')+
 (notice?'<p class="pfa-unit-success" role="status">'+esc(notice)+'</p>':'')+toggle+table+form+'</section>';
}
async function load(){
 if(!permitted())return;
 db=db||window.__HASNARIA_DB;if(!db){error='Koneksi database belum siap';markup();return}
 var token=++seq,context=sessionContext;
 busy=true;error='';markup();
 try{
  var r=await db.rpc('owner_master_unit_queue_v1',{p_critical_only:!showAll});
  if(r.error)throw r.error;
  if(!permitted()||seq!==token||sessionContext!==context)return;
  rows=Array.isArray(r.data&&r.data.items)?r.data.items:[];
  if(selected&&!current())selected='',invalidate();
 }catch(e){if(permitted()&&seq===token)error=e&&e.message?e.message:String(e)}
 finally{if(permitted()&&seq===token){busy=false;markup()}}
}
function args(){
 if(!current()||!decision)throw Error('Pilih SKU dan keputusan dahulu');
 return {p_item_id:selected,p_decision:decision,p_unit:decision==='DOCUMENT_UNIT'?unit.trim():null};
}
async function getPreview(){
 if(!permitted()||busy||!current())return;
 var token=++seq,context=sessionContext;
 busy=true;error='';notice='';invalidate();markup();
 try{
  var r=await db.rpc('owner_master_unit_preview_v1',args());
  if(r.error)throw r.error;
  if(permitted()&&seq===token&&sessionContext===context&&r.data&&r.data.item_id===selected)preview=r.data;
 }catch(e){if(permitted()&&seq===token)error=e&&e.message?e.message:String(e)}
 finally{if(permitted()&&seq===token){busy=false;markup()}}
}
async function apply(){
 if(!permitted()||busy||!preview)return;
 var token=++seq,context=sessionContext;
 busy=true;error='';markup();
 try{
  var a=args();
  if(a.p_item_id!==preview.item_id||a.p_decision!==preview.decision||
   (a.p_unit||null)!==(preview.proposed_stock_unit||null))
   throw Error('Isian telah berubah. Jalankan pratinjau ulang.');
  var r=await db.rpc('owner_master_unit_apply_v1',Object.assign(a,{
   p_token:preview.token,p_evidence:evidence.trim(),p_reason:reason.trim()
  }));
  if(r.error)throw r.error;
  if(!permitted()||seq!==token||sessionContext!==context)return;
  preview=null;notice='Bukti Owner tersimpan; satuan master, Stok dan resep tidak berubah.';
  busy=false;await load();return;
 }catch(e){if(permitted()&&seq===token)error=e&&e.message?e.message:String(e)}
 finally{if(permitted()&&seq===token){busy=false;markup()}}
}
async function revoke(){
 var x=current();if(!permitted()||busy||!x||!x.review_id)return;
 var token=++seq,context=sessionContext;
 busy=true;error='';markup();
 try{
  var r=await db.rpc('owner_master_unit_revoke_v1',{p_review_id:x.review_id,p_reason:reason.trim()});
  if(r.error)throw r.error;
  if(!permitted()||seq!==token||sessionContext!==context)return;
  selected='';invalidate();decision='';unit='';reason='';evidence='';
  notice='Review dibatalkan, catatan keputusan tetap disimpan sebagai histori.';
  busy=false;await load();return;
 }catch(e){if(permitted()&&seq===token)error=e&&e.message?e.message:String(e)}
 finally{if(permitted()&&seq===token){busy=false;markup()}}
}
document.addEventListener('click',function(ev){
 var el=ev.target;if(!el||!el.closest)return;
 if(el.closest('[data-hsn-master-open]')){
  if(!owner())return;opened=true;sessionContext=window.__HASNARIA_CONTEXT;
  selected='';clearForm();showAll=false;load();return;
 }
 if(!permitted())return;
 var closeBtn=el.closest('[data-hsn-master-close],[data-hsn-master-backdrop]');
 if(closeBtn&&el===closeBtn){close();return}
 var row=el.closest('[data-hsn-master-select]');
 if(row&&!busy){selected=row.getAttribute('data-hsn-master-select');clearForm();markup();return}
 if(el.closest('[data-hsn-master-preview]')){getPreview();return}
 if(el.closest('[data-hsn-master-apply]')){apply();return}
 if(el.closest('[data-hsn-master-revoke]')){revoke();return}
},true);
document.addEventListener('change',function(ev){
 if(!permitted()||!ev.target||!ev.target.getAttribute)return;
 if(ev.target.getAttribute('data-hsn-master-all')){
  showAll=!!ev.target.checked;selected='';clearForm();load();return;
 }
 var key=ev.target.getAttribute('data-hsn-master-field');
 if(key==='decision'){
  decision=ev.target.value;if(decision!=='DOCUMENT_UNIT')unit='';
  invalidate();markup();
 }
},true);
document.addEventListener('input',function(ev){
 if(!permitted()||!ev.target||!ev.target.getAttribute)return;
 var key=ev.target.getAttribute('data-hsn-master-field');
 if(key==='unit')unit=ev.target.value;
 else if(key==='reason')reason=ev.target.value;
 else if(key==='evidence')evidence=ev.target.value;
 else return;
 invalidate();
},true);
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&opened)close()},true);
function boot(){
 var host=document.getElementById('pembelian');if(!host)return;
 var pending=false;
 function schedule(){
  if(pending)return;pending=true;
  setTimeout(function(){pending=false;entry();if(opened&&!permitted())close()},80);
 }
 new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
 schedule();
}
// Hide sensitive documentary queue if authentication causes the app to be
// hidden. This prevents orphaned body-level modals surviving Owner logout.
function closeIfAppHidden(){
 var app=document.getElementById('app');
 if(!app)return;
 if(app.classList.contains('hidden')&&opened)close();
}
function monitorAppVisibility(){
 var app=document.getElementById('app');
 if(!app)return;
 new MutationObserver(closeIfAppHidden).observe(app,{
  attributes:true,attributeFilter:['class']
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
monitorAppVisibility();
})();