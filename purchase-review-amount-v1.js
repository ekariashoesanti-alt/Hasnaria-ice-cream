/* Hasnaria Owner Pembelian Review — batch amount correction submissions.
   Row ✓ stages in local form only; final Submit stores an audited Finance-review
   request in Supabase. Canonical purchase, Stock and journal stay unchanged. */
(function(){
 'use strict';
 if(window.__HASNARIA_PURCHASE_REVIEW_CORRECTION_V1)return;
 window.__HASNARIA_PURCHASE_REVIEW_CORRECTION_V1=true;
 var state={open:false,busy:false,loading:false,period:'',rows:[],pending:{},
   fields:{},paymentFields:{},staged:{},notice:'',success:null,historyOpen:false,req:0},overlay=null;
 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function amt(n){return'Rp '+Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:2})}
 var paymentOptions=[
  ['TUNAI','Tunai / Cash'],['TRANSFER','Transfer / Rek Mandiri'],
  ['QRIS','QRIS'],['PAYLATER','PayLater'],
  ['UTANG','Utang pemasok'],['PINJAMAN_USAHA_LAIN','Pinjaman usaha lain (Jas Hujan)']
 ];
 function paymentLabel(value){
  var code=String(value||'').toUpperCase();
  var found=paymentOptions.find(function(p){return p[0]===code});
  return found?found[1]:code==='BELUM_DIPETAKAN'?'Pembayaran belum terpetakan':code||'Pembayaran belum terpetakan';
 }
 function validPayment(value){return paymentOptions.some(function(p){return p[0]===value})}
 function month(){var x=document.getElementById('paPeriod');return x&&/^\d{4}-\d{2}$/.test(x.value)?x.value:''}
 function isOwner(){return !!(window.__HASNARIA_CONTEXT&&window.__HASNARIA_CONTEXT.role==='owner')}
 function db(){return window.__HASNARIA_DB||null}
 function markCard(){
  var card=document.querySelector('#pembelian #purchaseFinanceAlignment .pfa-card.review');
  if(!card)return;
  if(card.getAttribute('data-pfa-review-correction-open')!=='1'){
   card.setAttribute('data-pfa-review-correction-open','1');
   card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-haspopup','dialog');
   card.setAttribute('aria-label','Buka formulir koreksi transaksi Review Pembelian');
   card.setAttribute('title','Klik untuk mengoreksi transaksi Review');
  }
 }
 function footer(){
  if(!overlay)return;
  var count=Object.keys(state.staged).length,el=overlay.querySelector('[data-hsn-rv-count]');
  if(el)el.textContent=count+' baris disimpan';
  var btn=overlay.querySelector('[data-hsn-rv-submit]');
  if(btn)btn.disabled=!count||state.busy||state.loading;
 }
 function render(){
  if(!state.open)return;
  if(!overlay){overlay=document.createElement('div');overlay.id='hasnaria-review-correction-root';document.body.appendChild(overlay)}
  var all=state.rows||[],rows=all.filter(function(r){
   return !state.pending[String(r.source_history_id)];
  }),pendingRows=all.filter(function(r){
   return !!state.pending[String(r.source_history_id)];

  }),visible=state.historyOpen?pendingRows:rows;
  var waitingRows=pendingRows.filter(function(r){return state.pending[String(r.source_history_id)].status==='pending_finance_review'});
  var appliedRows=pendingRows.filter(function(r){return state.pending[String(r.source_history_id)].status==='applied'});
  var readyBatch=waitingRows.length?String(state.pending[String(waitingRows[0].source_history_id)].batch_id||''):'';
  var batchRows=waitingRows.filter(function(r){return String(state.pending[String(r.source_history_id)].batch_id||'')===readyBatch});
  var eligible=readyBatch&&batchRows.length&&batchRows.every(function(r){
    var x=state.pending[String(r.source_history_id)];
    return x.proposed_payment_method==='PINJAMAN_USAHA_LAIN'&&
      Number(x.proposed_amount)===Number(r.total_amount);
  });
  var body=visible.map(function(r){
   var id=String(r.source_history_id),current=Number(r.total_amount||0),existing=state.pending[id];
   var locked=!!existing||state.busy,staged=state.staged[id],value=existing?existing.proposed_amount:
     Object.prototype.hasOwnProperty.call(state.fields,id)?state.fields[id]:'';
   var selected=existing?existing.proposed_payment_method||'':state.paymentFields[id]||'';
   var options='<option value="">Tidak diubah</option>'+paymentOptions.map(function(p){
     return'<option value="'+esc(p[0])+'"'+(selected===p[0]?' selected':'')+'>'+esc(p[1])+'</option>';
   }).join('');
   return'<tr><td><strong>'+esc(r.item_name||'Tanpa nama')+'</strong>'+
     '<small>'+esc(String(r.effective_date||'').slice(0,10))+' · '+
     esc(paymentLabel(r.payment_method))+'</small></td>'+
     '<td class="hsn-rv-now">'+esc(amt(current))+'</td>'+
     '<td><input type="number" step="0.01" min="0.01" inputmode="decimal" '+
       'data-hsn-rv-value="'+esc(id)+'" value="'+esc(value)+'" placeholder="Isi nilai koreksi"'+
       (locked?' disabled':'')+' aria-label="Nilai koreksi '+esc(r.item_name||'transaksi')+'"></td>'+
     '<td><select data-hsn-rv-payment="'+esc(id)+'"'+(locked?' disabled':'')+
       ' aria-label="Jenis pembayaran '+esc(r.item_name||'transaksi')+'">'+options+'</select></td>'+
     '<td><button type="button" class="hsn-rv-save'+(staged?' staged':'')+'" '+
       'data-hsn-rv-stage="'+esc(id)+'"'+(locked?' disabled':'')+' title="Simpan baris">'+
       (existing?(existing.status==='applied'?'Selesai':'Diajukan'):staged?'✓ Tersimpan':'✓')+'</button></td></tr>';
  }).join('');
  overlay.innerHTML='<div class="hsn-rv-shade" data-hsn-rv-close="1"></div>'+
   '<section class="hsn-rv-dialog" role="dialog" aria-modal="true" aria-labelledby="hsnRvTitle">'+
   '<header class="hsn-rv-head"><div class="hsn-rv-heading"><span class="hsn-rv-eyebrow">PEMBELIAN <span aria-hidden="true">/</span> REVIEW</span>'+
   '<h3 id="hsnRvTitle">Koreksi Transaksi</h3>'+
   '<div class="hsn-rv-meta"><span class="hsn-rv-chip">Periode <b>'+esc(state.period)+'</b></span>'+
   '<span class="hsn-rv-chip"><b>'+rows.length+'</b> perlu koreksi</span>'+
   '<span class="hsn-rv-chip"><b>'+waitingRows.length+'</b> belum diproses</span>'+
   '<span class="hsn-rv-chip"><b>'+appliedRows.length+'</b> selesai</span>'+
   '<span class="hsn-rv-chip">Total Review <b>'+esc(amt(all.reduce(function(a,b){return a+Number(b.total_amount||0)},0)))+'</b></span></div></div>'+
   '<button type="button" class="hsn-rv-close" data-hsn-rv-close="1" aria-label="Tutup dialog">×</button></header>'+
   (state.success?'<div class="hsn-rv-success" role="status" data-hsn-rv-success="1"><span class="hsn-rv-success-icon" aria-hidden="true">✓</span><div><b>'+esc(state.success.title)+'</b><span>'+esc(state.success.detail)+'</span></div></div>':'')+
   '<p class="hsn-rv-hint">Ubah nominal dan/atau jenis pembayaran → ✓ Simpan baris → Submit. Pinjaman Jas Hujan yang tervalidasi akan dijurnalkan otomatis; jika validasi gagal, usulan tetap tersimpan untuk diperbaiki.</p>'+
   '<div class="hsn-rv-list-tools"><strong>'+esc(state.historyOpen?'Riwayat pengajuan':'Daftar perlu koreksi')+'</strong><span>'+
   rows.length+' perlu koreksi · '+waitingRows.length+' belum diproses · '+appliedRows.length+' selesai</span>'+
   (pendingRows.length?'<button type="button" data-hsn-rv-history="1" aria-pressed="'+(state.historyOpen?'true':'false')+'">'+(state.historyOpen?'← Kembali ke koreksi':'Lihat riwayat ('+pendingRows.length+')')+'</button>':'')+
   (eligible?'<button type="button" class="hsn-rv-apply" data-hsn-rv-apply="'+esc(readyBatch)+'"'+(state.busy?' disabled':'')+'>✓ Proses Otomatis & Jurnalkan ('+batchRows.length+')</button>':'')+'</div>'+
   '<div class="hsn-rv-scroll"><table><thead><tr><th>Transaksi</th><th>Nilai Saat Ini</th><th>Nilai Koreksi</th><th>Jenis Pembayaran</th><th>'+(state.historyOpen?'Status':'✓ Simpan')+'</th></tr></thead>'+
   '<tbody>'+(state.loading?'<tr><td colspan="5">Memuat transaksi Review…</td></tr>':body||
    '<tr><td colspan="5" class="hsn-rv-empty">'+(state.historyOpen?'Belum ada riwayat koreksi.':waitingRows.length?'Semua transaksi sudah diajukan; '+waitingRows.length+' belum diproses.':appliedRows.length?'Seluruh '+appliedRows.length+' koreksi selesai dan tercatat di jurnal.':'Tidak ada transaksi yang perlu dikoreksi pada periode ini.')+'</td></tr>')+'</tbody></table></div>'+
   '<footer class="hsn-rv-footer"><div><b data-hsn-rv-count>'+Object.keys(state.staged).length+' baris disimpan</b>'+
   '<small>Koreksi pinjaman yang tervalidasi diposting secara atomik ke Finance. Stok fisik tidak diubah.</small>'+
   (state.notice?'<span role="status">'+esc(state.notice)+'</span>':'')+'</div>'+
   '<button type="button" class="hsn-rv-submit" data-hsn-rv-submit="1"'+
     (!Object.keys(state.staged).length||state.busy||state.loading?' disabled':'')+'>'+
     (state.busy?'Mengirim…':'Submit ke Database')+'</button></footer></section>';
 }
 function clear(){
  state.open=false;state.loading=false;state.busy=false;state.rows=[];state.staged={};
  state.fields={};state.paymentFields={};state.pending={};state.req++;state.notice='';state.success=null;state.historyOpen=false;
  if(overlay){overlay.remove();overlay=null}
 }
 function close(){if(state.busy)return;if(Object.keys(state.staged).length&&!window.confirm('Batal dan buang koreksi yang belum disubmit?'))return;clear()}
 function verifiedId(id){return state.rows.find(function(x){return String(x.source_history_id)===id})}
 async function open(){
  if(state.open||!isOwner())return;
  var period=month(),api=db();if(!period||!api)return;
  state.open=true;state.period=period;state.loading=true;state.rows=[];
  state.fields={};state.paymentFields={};state.staged={};state.pending={};state.notice='';state.success=null;state.historyOpen=false;render();
  var seq=++state.req,session=window.__HASNARIA_CONTEXT;
  try{
   var r=await Promise.all([
    api.rpc('get_purchase_control_period_v1',{p_brand:'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4',p_period:period+'-01'}),
    api.rpc('get_purchase_review_amount_requests_v1',{p_period:period+'-01'})
   ]);
   r.forEach(function(v){if(v.error)throw v.error});
   if(!state.open||state.req!==seq||session!==window.__HASNARIA_CONTEXT||state.period!==month())return;
   var pack=r[0].data||{};
   (Array.isArray(r[1].data)?r[1].data:[]).forEach(function(x){if(x.source_history_id)state.pending[String(x.source_history_id)]=x});
   state.rows=(Array.isArray(pack.rows)?pack.rows:[]).filter(function(x){
     return (x.expense_account_code==='1990'||x.category_status==='provisional'||
       !!state.pending[String(x.source_history_id)])&&
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(x.source_history_id||''));
   });
  }catch(e){if(state.open&&state.req===seq)state.notice='Gagal memuat Review: '+(e.message||String(e))}
  finally{if(state.open&&state.req===seq){state.loading=false;render()}}
 }
 function stage(id){
  var r=verifiedId(id);if(!r||state.pending[id]||state.busy)return;
  var raw=String(state.fields[id]||'').trim(),old=Number(r.total_amount);
  var val=raw===''?old:Number(raw),payment=state.paymentFields[id]||'';
  var paymentChanged=payment!==''&&payment!==String(r.payment_method||'').trim().toUpperCase();
  if((raw!==''&&!/^\d+(?:\.\d{1,2})?$/.test(raw))||
     !Number.isFinite(val)||val<=0||
     (payment!==''&&!validPayment(payment))||
     (val===old&&!paymentChanged)){
   state.notice='Ubah minimal satu nilai: nominal positif berbeda dan/atau jenis pembayaran yang baru ('+String(r.item_name||'transaksi')+').';render();return;
  }
  state.staged[id]={source_history_id:id,current_amount:old,corrected_amount:val,
    corrected_payment_method:paymentChanged?payment:null};
  state.notice='✓ '+String(r.item_name||'Transaksi')+' disimpan di formulir, belum ke database.';render();
 }
 async function applyBatch(batch,automatic){
  if(!state.open||state.busy||!isOwner()||!batch)return false;
  if(!automatic&&!window.confirm('Validasi sumber dana dan catat jurnal pembelian otomatis untuk batch '+batch.slice(0,8)+'? Jika jurnal tidak berimbang, seluruh proses dibatalkan.'))return false;
  state.busy=true;state.notice='Memvalidasi sumber dana dan menjurnalkan batch '+batch.slice(0,8)+'…';render();
  try{
   var result=await db().rpc('apply_purchase_review_owner_v1',{p_batch:batch});
   if(result.error)throw result.error;
   var x=result.data||{};
   if(x.status!=='applied'||!x.finance_posted&&x.already_applied!==true)throw Error('Konfirmasi posting Finance belum lengkap');
   Object.keys(state.pending).forEach(function(id){
    if(String(state.pending[id].batch_id)===batch)state.pending[id].status='applied';
   });
   state.success={title:'Selesai — '+x.applied_rows+' transaksi tercatat di Finance.',
     detail:'Batch '+batch.slice(0,8)+' · Jurnal debit dan kredit seimbang '+amt(x.debit||x.credit||0)+'. Akun pinjaman Jas Hujan 2110, tanpa perubahan Stock.'};
   state.notice='';state.historyOpen=true;
   if(typeof window.__HASNARIA_PURCHASE_FINANCE_REFRESH==='function'){
    window.__HASNARIA_PURCHASE_FINANCE_REFRESH();
   }
   return true;
  }catch(e){
   state.success=null;state.notice='Koreksi tersimpan, tetapi jurnal BELUM diterapkan: '+(e.message||String(e))+'. Periksa lalu gunakan tombol Proses Otomatis & Jurnalkan.';
   return false;
  }finally{state.busy=false;render()}
 }
 async function submit(){
  if(!state.open||state.busy||state.loading||!isOwner())return;
  var list=Object.keys(state.staged).map(function(k){return state.staged[k]});
  if(!list.length)return;
  if(state.period!==month()){state.notice='Periode berubah; buka ulang formulir.';render();return}
  if(!window.confirm('Kirim '+list.length+' usulan koreksi nominal/pembayaran untuk verifikasi Finance? Transaksi dan jurnal asli tidak berubah.'))return;
  state.busy=true;state.success=null;state.notice='Mengirim koreksi…';render();
  var outBatch='';
  try{
   var r=await db().rpc('submit_purchase_review_corrections_v2',{
    p_period:state.period+'-01',p_changes:list
   });
   if(r.error)throw r.error;
   var out=r.data||{};outBatch=String(out.batch_id||'');
   if(out.status!=='pending_finance_review'||Number(out.submitted_rows)!==list.length)
     throw Error('Respons database tidak sesuai jumlah koreksi. Periksa sebelum mencoba ulang.');
   list.forEach(function(item){state.pending[item.source_history_id]={proposed_amount:item.corrected_amount,proposed_payment_method:item.corrected_payment_method,status:'pending_finance_review',batch_id:String(out.batch_id||'')}});
   state.staged={};state.fields={};state.paymentFields={};state.historyOpen=false;
   state.notice='';
   state.success={title:'Pengajuan tersimpan: '+list.length+' transaksi.',
     detail:'Batch '+String(out.batch_id||'').slice(0,8)+' · Selanjutnya validasi dan posting otomatis untuk pinjaman Jas Hujan.'};
  }catch(e){state.notice='Submit gagal: '+(e.message||String(e))}
  finally{state.busy=false;render()}
  var automatic=list.every(function(a){return a.corrected_payment_method==='PINJAMAN_USAHA_LAIN'&&a.corrected_amount===a.current_amount});
  if(automatic&&state.open&&state.success&&outBatch)await applyBatch(outBatch,true);
 }
 document.addEventListener('click',function(e){
  var k=e.target.closest&&e.target.closest('#pembelian #purchaseFinanceAlignment .pfa-card.review');
  if(k){e.preventDefault();open();return}
  if(!overlay)return;
  var z=e.target.closest&&e.target.closest('[data-hsn-rv-close]');
  if(z){if(z===e.target)close();return}
  var apply=e.target.closest&&e.target.closest('[data-hsn-rv-apply]');
  if(apply){applyBatch(apply.getAttribute('data-hsn-rv-apply'),false);return}
  var history=e.target.closest&&e.target.closest('[data-hsn-rv-history]');
  if(history){state.historyOpen=!state.historyOpen;render();return}
  var row=e.target.closest&&e.target.closest('[data-hsn-rv-stage]');
  if(row){stage(row.getAttribute('data-hsn-rv-stage'));return}
  if(e.target.closest&&e.target.closest('[data-hsn-rv-submit]'))submit();
 });
 document.addEventListener('input',function(e){
  if(!state.open||!overlay)return;
  var el=e.target.closest&&e.target.closest('[data-hsn-rv-value]');
  if(!el)return;
  var id=el.getAttribute('data-hsn-rv-value');state.fields[id]=el.value;
  if(state.staged[id]){
   delete state.staged[id];
   var b=overlay.querySelector('[data-hsn-rv-stage="'+id+'"]');
   if(b)b.classList.remove('staged');
   footer();
  }
 });
 document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&state.open){e.preventDefault();close();return}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('#pembelian #purchaseFinanceAlignment .pfa-card.review')){
    e.preventDefault();open();
  }
 });
 document.addEventListener('change',function(e){
  if(e.target&&e.target.id==='paPeriod'&&state.open){clear();return}
  if(!state.open||!overlay)return;
  var el=e.target.closest&&e.target.closest('[data-hsn-rv-payment]');
  if(!el)return;
  var id=el.getAttribute('data-hsn-rv-payment');state.paymentFields[id]=el.value;
  if(state.staged[id]){
   delete state.staged[id];
   var b=overlay.querySelector('[data-hsn-rv-stage="'+id+'"]');
   if(b){b.classList.remove('staged');b.textContent='✓'}
   footer();
  }
 },true);
 function boot(){
  var host=document.getElementById('pembelian');
  if(!host){setTimeout(boot,150);return}
  markCard();
  var observer=new MutationObserver(function(){markCard()});
  observer.observe(host,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();