/* Hasnaria P0.3 + P0.4, Owner-only documentary reconciliation.
 * Month boundaries use LOCAL BUSINESS DATES, not import job created_at.
 * All writes (if authorized) are private Owner mapping *evidence* only.
 * Never posts Stock, Finance, Sales, or Purchase into production.
 */
(function(){
'use strict';
if(window.__HASNARIA_P03_P04_REVIEW_V1)return;
window.__HASNARIA_P03_P04_REVIEW_V1=true;
var db=null,shown=false,tab='p03',isBusy=false,modal=null,context=null,token=0,
    currentDate=new Date(),p03Month='2026-09',p04Month=
      currentDate.getFullYear()+'-'+String(currentDate.getMonth()+1).padStart(2,'0'),
    queue={pending_unit:[],mapping_review:[]},report=null,
    selected='',decision='',target='',expense='',evidence='',reason='',preview=null,
    inventory=[],error='',notice='';
var categories=['Beban Administrasi','Beban Pemeliharaan','Beban Bahan Baku','Beban Kepegawaian'];
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(x){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]})}
function money(x){return 'Rp '+Number(x||0).toLocaleString('id-ID',{maximumFractionDigits:0})}
function owner(){var c=window.__HASNARIA_CONTEXT;return !!(c&&c.role==='owner')}
function valid(){return shown&&owner()&&window.__HASNARIA_CONTEXT===context}
function month(v){return /^\d{4}-(0[1-9]|1[0-2])$/.test(v)?v+'-01':null}
function selectedRow(){return(queue.mapping_review||[]).find(function(x){return x.source_id===selected})||null}
function resetForm(){selected='';decision='';target='';expense='';evidence='';reason='';preview=null;error='';notice=''}
function close(){token++;shown=false;context=null;resetForm();if(modal){modal.remove();modal=null}}
function entry(){
 var root=document.getElementById('pfaReviewSlot');
 if(!root)return;
 var button=root.querySelector('[data-hsn-p03-entry]');
 if(!owner()){if(button)button.remove();if(shown)close();return}
 if(button)return;
 button=document.createElement('div');
 button.setAttribute('data-hsn-p03-entry','1');button.className='pfa-detail-cta pfa-unit-entry';
 button.innerHTML='<div><b>P0.3 & P0.4 — Rekonsiliasi Pembelian / Oktober</b>'+
 '<span>Periksa 32 transaksi belum posted, 33 mapping, dan sumber impor Oktober. Keputusan Owner hanya dicatat, tanpa posting otomatis.</span></div>'+
 '<button type="button" data-hsn-p03-open="1">Periksa rekonsiliasi</button>';
 root.appendChild(button);
}
function pendingMarkup(){
 var r=queue.pending_unit||[],summary={pre:0,post:0,none:0};
 r.forEach(function(x){if(x.baseline_effect==='PRE_OR_ON_OPNAME')summary.pre++;
 else if(x.baseline_effect==='POST_OPNAME')summary.post++;else summary.none++});
 var text='<div class="pfa-unit-preview"><b>Antrean satuan / belum diposting: '+r.length+'</b> · Sebelum/pada opname: '+summary.pre+
 ' · Sesudah opname: '+summary.post+' · Tanpa baseline: '+summary.none+
 '. Semua tetap memerlukan bukti satuan. Tidak boleh diposting ulang hanya karena status ready.</div>';
 return text;
}
function choices(){
 var a=[['MAP_EXISTING_SKU','Tautkan ke SKU yang sudah ada (rencana saja)'],
  ['CLASSIFY_EXPENSE','Usulkan kategori Beban'],
  ['NOT_FOR_STOCK','Tidak menambah Stok'],
  ['HOLD_FOR_EVIDENCE','Tunda sampai ada bukti']];
 return '<option value="">Pilih keputusan Owner</option>'+a.map(function(x){
  return'<option value="'+esc(x[0])+'"'+(decision===x[0]?' selected':'')+'>'+esc(x[1])+'</option>';
 }).join('');
}
function itemEditor(){
 var row=selectedRow();if(!row)return '';
 var body='<div class="pfa-unit-form"><h4>'+esc(row.item_name)+'</h4>'+
 '<p>'+esc(row.purchase_date)+' · '+esc(row.mapping_status)+' · '+money(row.amount)+'</p>'+
 '<p class="pfa-unit-hint">'+esc(row.source_file)+' · baris '+esc(row.row_no)+
 ' · kandidat SKU '+esc(row.inventory_match_count)+'</p>';
 if(row.review_id){
  body+='<p class="pfa-unit-success">Keputusan terdokumentasi: '+esc(row.review_decision)+
 ' (belum diterapkan ke Stok atau Keuangan)</p>'+
 '<label>Alasan revisi minimal 30 karakter<textarea rows="2" maxlength="1000" data-hsn-p03-field="reason">'+
 esc(reason)+'</textarea></label><button type="button" data-hsn-p03-revoke="1"'+(isBusy?' disabled':'')+
 '>Batalkan keputusan dan simpan jejak audit</button>';
 }else{
  body+='<div class="pfa-unit-fields"><label>Keputusan<select data-hsn-p03-field="decision">'+choices()+'</select></label>';
  if(decision==='MAP_EXISTING_SKU'){
   body+='<label>SKU target terverifikasi<select data-hsn-p03-field="target"><option value="">Pilih SKU</option>'+
    inventory.map(function(x){return'<option value="'+esc(x.id)+'"'+(target===x.id?' selected':'')+'>'+esc(x.item_name)+' ('+esc(x.unit||'—')+')</option>'}).join('')+
    '</select></label>';
  }else if(decision==='CLASSIFY_EXPENSE'){
   body+='<label>Kategori Beban<select data-hsn-p03-field="expense"><option value="">Pilih kategori</option>'+
    categories.map(function(c){return'<option value="'+esc(c)+'"'+(expense===c?' selected':'')+'>'+esc(c)+'</option>'}).join('')+
    '</select></label>';
  }
  body+='<label>Referensi nota/bukti<input data-hsn-p03-field="evidence" maxlength="400" value="'+esc(evidence)+'" placeholder="Nomor nota / nama arsip"></label>'+
   '<label>Alasan Owner<textarea data-hsn-p03-field="reason" rows="3" maxlength="1000">'+esc(reason)+'</textarea></label></div>'+
   '<p class="pfa-unit-hint">Ini adalah rencana mapping terdokumentasi. Tidak menambah receipt, jurnal, atau mengubah canonical Purchase.</p>'+
   '<div class="pfa-unit-controls"><button type="button" data-hsn-p03-preview="1"'+(isBusy?' disabled':'')+'>Pratinjau keputusan</button>'+
   (preview?'<button type="button" class="primary" data-hsn-p03-save="1"'+(isBusy?' disabled':'')+'>Simpan keputusan Owner</button>':'')+
   '</div>';
  if(preview)body+='<p class="pfa-unit-preview">Verifikasi: '+esc(preview.decision)+
   ' · tidak akan memposting Stok, Keuangan, atau mengubah rule otomatis.</p>';
 }
 return body+'</div>';
}
function p03Markup(){
 var review=queue.mapping_review||[];
 var table=review.length?'<div class="pfa-table-scroll pfa-unit-table"><table class="pfa-table"><thead><tr>'+
  '<th>Nama Pembelian</th><th>Tanggal</th><th>Status mapping</th><th>Nominal</th><th>Review</th><th>Aksi</th>'+
  '</tr></thead><tbody>'+
  review.map(function(x){return'<tr'+(selected===x.source_id?' class="pfa-unit-active"':'')+'>'+
   '<td><b>'+esc(x.item_name)+'</b><small>'+esc(x.source_file)+' #'+esc(x.row_no)+'</small></td>'+
   '<td>'+esc(x.purchase_date)+'</td><td>'+esc(x.mapping_status)+'</td><td>'+money(x.amount)+'</td>'+
   '<td>'+esc(x.review_id?'Terdokumentasi':'Butuh Owner')+'</td>'+
   '<td><button type="button" data-hsn-p03-select="'+esc(x.source_id)+'"'+(isBusy?' disabled':'')+'>Periksa</button></td></tr>'}).join('')+
  '</tbody></table></div>':'<div class="pfa-empty">Tidak ada mapping yang belum diputuskan untuk bulan ini.</div>';
 return '<label>Periode Pembelian <input type="month" data-hsn-p03-period="1" value="'+esc(p03Month)+'"></label>'+
 pendingMarkup()+'<p><b>Antrean mapping yang memerlukan keputusan: '+review.length+'</b></p>'+
 table+itemEditor();
}
function statusLabel(v){
 if(v==='NO_SOURCE_UPLOAD_FOUND')return 'Belum ditemukan file/batch untuk periode ini';
 if(v==='UPLOAD_ATTEMPT_NO_CANONICAL_DATA')return 'Ada upaya impor, tetapi belum ada data transaksi kanonis';
 if(v==='PRESENT_IN_CANONICAL')return 'Data periode ini ada di database';
 return 'Perlu pemeriksaan';
}
function p04Markup(){
 var r=report;var body='<label>Periode transaksi <input type="month" data-hsn-p04-period="1" value="'+esc(p04Month)+'"></label>';
 if(!r)return body+'<div class="pfa-empty">Klik muat ulang untuk memeriksa sumber impor.</div>';
 body+='<div class="pfa-unit-preview"><b>Periode bisnis '+esc(p04Month)+'</b>: '+
  'Penjualan '+esc(r.sales_canonical_rows)+' baris, Pembelian '+esc(r.purchase_canonical_rows)+' baris, bukti faktur '+esc(r.purchase_invoice_evidence_rows)+' baris.</div>'+
  '<p><b>Penjualan:</b> '+esc(statusLabel(r.sales_status))+
  ' · batch untuk periode: '+esc(r.sales_batches_for_period)+
  ' · batch gagal: '+esc(r.failed_sales_batches_for_period)+'</p>'+
  '<p><b>Pembelian:</b> '+esc(statusLabel(r.purchase_status))+
  ' · job: '+esc(r.purchase_jobs_for_period)+
  ' · job gagal: '+esc(r.failed_import_jobs_for_period)+'</p>'+
  '<p class="pfa-unit-hint">Tanggal file diunggah bukan tanggal transaksi. Impor file September pada Oktober tetap termasuk transaksi September.</p>';
 if(r.sales_status!=='PRESENT_IN_CANONICAL'||r.purchase_status!=='PRESENT_IN_CANONICAL'){
  body+='<p role="alert" class="pfa-error">Belum ada bukti lengkap untuk periode '+esc(p04Month)+
  '. Periksa apakah file Penjualan Majoo dan Pembelian pada periode ini sudah diunduh dari sumber, lalu unggah melalui menu impor masing-masing. Jangan menyalin transaksi September atau menjalankan posting berulang.</p>';
 }else{
  body+='<p class="pfa-unit-success">Data sumber periode ini ada. Lanjutkan rekonsiliasi jumlah dan jurnal sebelum menutup periode.</p>';
 }
 return body;
}
function draw(){
 if(!valid())return;
 if(!modal){modal=document.createElement('div');modal.className='pfa-modal-backdrop';modal.setAttribute('data-hsn-p03-backdrop','1');document.body.appendChild(modal)}
 modal.innerHTML='<section class="pfa-modal pfa-unit-modal" role="dialog" aria-modal="true" aria-labelledby="hsnP03Title">'+
 '<div class="pfa-modal-head"><div><div class="pfa-eyebrow">OWNER · PRIORITAS P0.3 / P0.4</div>'+
 '<h3 id="hsnP03Title">Rekonsiliasi Pembelian & Periode Oktober</h3>'+
 '<p>Rekonsiliasi dokumenter, tanpa posting Stok atau jurnal otomatis.</p></div>'+
 '<button type="button" class="pfa-close" aria-label="Tutup" data-hsn-p03-close="1">×</button></div>'+
 '<div class="pfa-unit-controls"><button type="button" data-hsn-p03-tab="p03"'+(tab==='p03'?' class="primary"':'')+'>Mapping & satuan</button>'+
 '<button type="button" data-hsn-p03-tab="p04"'+(tab==='p04'?' class="primary"':'')+'>Kelengkapan periode</button>'+
 '<button type="button" data-hsn-p03-refresh="1"'+(isBusy?' disabled':'')+'>Muat ulang</button></div>'+
 (isBusy?'<p>Memeriksa database…</p>':'')+
 (error?'<p role="alert" class="pfa-error">'+esc(error)+'</p>':'')+
 (notice?'<p role="status" class="pfa-unit-success">'+esc(notice)+'</p>':'')+
 (tab==='p03'?p03Markup():p04Markup())+'</section>';
}
function rpcArgs(){
 if(!selectedRow()||!decision)throw Error('Pilih sumber dan keputusan Owner');
 return{p_source:selected,p_decision:decision,
   p_target:decision==='MAP_EXISTING_SKU'?(target||null):null,
   p_expense:decision==='CLASSIFY_EXPENSE'?(expense||null):null};
}
function invalidate(){
 preview=null;
 var b=modal&&modal.querySelector('[data-hsn-p03-save]');if(b)b.disabled=true;
}
async function load(){
 if(!valid())return;
 db=db||window.__HASNARIA_DB;
 if(!db){error='Koneksi database belum siap';draw();return}
 var t=++token,ctx=context;isBusy=true;error='';draw();
 try{
  var tasks=tab==='p03'?[
    db.rpc('owner_p03_work_queue_v1',{p_period:month(p03Month)}),
    db.from('inventory_items').select('id,item_name,unit').eq('brand_id','a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4').order('item_name').limit(1000)
  ]:[db.rpc('owner_p04_import_readiness_v1',{p_period:month(p04Month)})];
  var all=await Promise.all(tasks);
  all.forEach(function(x){if(x.error)throw x.error});
  if(!valid()||ctx!==context||t!==token)return;
  if(tab==='p03'){queue=all[0].data||{pending_unit:[],mapping_review:[]};inventory=all[1].data||[];
    if(selected&&!selectedRow())selected='',invalidate();}
  else report=all[0].data||null;
 }catch(e){if(valid()&&t===token)error=e&&e.message?e.message:String(e)}
 finally{if(valid()&&t===token){isBusy=false;draw()}}
}
async function getPreview(){
 if(!valid()||isBusy||!selectedRow())return;
 var t=++token,ctx=context;isBusy=true;error='';notice='';invalidate();draw();
 try{var r=await db.rpc('owner_purchase_unmapped_preview_v1',rpcArgs());
  if(r.error)throw r.error;if(valid()&&t===token&&ctx===context)preview=r.data;
 }catch(e){if(valid()&&t===token)error=e&&e.message?e.message:String(e)}
 finally{if(valid()&&t===token){isBusy=false;draw()}}
}
async function save(){
 if(!valid()||isBusy||!preview)return;
 var t=++token,ctx=context;isBusy=true;error='';draw();
 try{
  var a=rpcArgs();
  if(a.p_source!==preview.source_id||a.p_decision!==preview.decision||
    (a.p_target||null)!==(preview.target_inventory_item_id||null)||
    (a.p_expense||null)!==(preview.expense_category||null))
    throw Error('Keputusan berubah. Jalankan ulang pratinjau.');
  var r=await db.rpc('owner_purchase_unmapped_apply_v1',Object.assign(a,{
    p_token:preview.token,p_evidence:evidence.trim(),p_reason:reason.trim()
  }));
  if(r.error)throw r.error;
  if(!valid()||t!==token||ctx!==context)return;
  preview=null;notice='Keputusan Owner disimpan sebagai dokumen. Saldo Stok dan jurnal tidak berubah.';
  isBusy=false;await load();return;
 }catch(e){if(valid()&&t===token)error=e&&e.message?e.message:String(e)}
 finally{if(valid()&&t===token){isBusy=false;draw()}}
}
async function revoke(){
 var x=selectedRow();if(!valid()||isBusy||!x||!x.review_id)return;
 var t=++token,ctx=context;isBusy=true;error='';draw();
 try{var r=await db.rpc('owner_purchase_unmapped_revoke_v1',{
  p_review:x.review_id,p_reason:reason.trim()});
  if(r.error)throw r.error;
  if(!valid()||t!==token||ctx!==context)return;
  resetForm();notice='Pembatalan dicatat, histori keputusan tetap tersimpan.';
  isBusy=false;await load();return;
 }catch(e){if(valid()&&t===token)error=e&&e.message?e.message:String(e)}
 finally{if(valid()&&t===token){isBusy=false;draw()}}
}
document.addEventListener('click',function(ev){
 var e=ev.target;if(!e||!e.closest)return;
 if(e.closest('[data-hsn-p03-open]')){if(!owner())return;shown=true;context=window.__HASNARIA_CONTEXT;resetForm();tab='p03';load();return}
 if(!valid())return;
 var closeBtn=e.closest('[data-hsn-p03-close],[data-hsn-p03-backdrop]');
 if(closeBtn&&e===closeBtn){close();return}
 var x=e.closest('[data-hsn-p03-tab]');
 if(x){tab=x.getAttribute('data-hsn-p03-tab');resetForm();load();return}
 if(e.closest('[data-hsn-p03-refresh]')){load();return}
 var row=e.closest('[data-hsn-p03-select]');
 if(row&&!isBusy){resetForm();selected=row.getAttribute('data-hsn-p03-select');draw();return}
 if(e.closest('[data-hsn-p03-preview]')){getPreview();return}
 if(e.closest('[data-hsn-p03-save]')){save();return}
 if(e.closest('[data-hsn-p03-revoke]')){revoke();return}
},true);
document.addEventListener('change',function(ev){
 if(!valid()||!ev.target||!ev.target.getAttribute)return;
 var p03=ev.target.getAttribute('data-hsn-p03-period');
 if(p03){p03Month=ev.target.value;resetForm();load();return}
 var p04=ev.target.getAttribute('data-hsn-p04-period');
 if(p04){p04Month=ev.target.value;report=null;load();return}
 var key=ev.target.getAttribute('data-hsn-p03-field');
 if(key==='decision'){decision=ev.target.value;target='';expense='';invalidate();draw()}
 else if(key==='target'){target=ev.target.value;invalidate()}
 else if(key==='expense'){expense=ev.target.value;invalidate()}
},true);
document.addEventListener('input',function(ev){
 if(!valid()||!ev.target||!ev.target.getAttribute)return;
 var key=ev.target.getAttribute('data-hsn-p03-field');
 if(key==='reason')reason=ev.target.value;
 else if(key==='evidence')evidence=ev.target.value;
 else return;
 invalidate();
},true);
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&shown)close()},true);
function boot(){
 var root=document.getElementById('pembelian');if(!root)return;
 var busyUpdate=false;
 new MutationObserver(function(){if(busyUpdate)return;busyUpdate=true;
  setTimeout(function(){busyUpdate=false;entry();if(shown&&!valid())close()},80)
 }).observe(root,{subtree:true,childList:true});
 entry();
 var app=document.getElementById('app');
 if(app)new MutationObserver(function(){if(app.classList.contains('hidden')&&shown)close()})
 .observe(app,{attributes:true,attributeFilter:['class']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();