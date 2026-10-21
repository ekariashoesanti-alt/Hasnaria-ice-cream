/* Hasnaria Owner Pembelian Review — batch amount correction submissions.
   Row ✓ stages in local form only; final Submit stores an audited Finance-review
   request in Supabase. Canonical purchase, Stock and journal stay unchanged. */
(function(){
 'use strict';
 if(window.__HASNARIA_PURCHASE_REVIEW_CORRECTION_V1)return;
 window.__HASNARIA_PURCHASE_REVIEW_CORRECTION_V1=true;
 var state={open:false,busy:false,loading:false,period:'',rows:[],pending:{},
   fields:{},staged:{},notice:'',req:0},overlay=null;
 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function amt(n){return'Rp '+Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:2})}
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
  var rows=state.rows||[];
  var body=rows.map(function(r){
   var id=String(r.source_history_id),current=Number(r.total_amount||0),existing=state.pending[id];
   var locked=!!existing||state.busy,staged=state.staged[id],value=existing?existing.proposed_amount:
     Object.prototype.hasOwnProperty.call(state.fields,id)?state.fields[id]:'';
   return'<tr><td><strong>'+esc(r.item_name||'Tanpa nama')+'</strong>'+
     '<small>'+esc(String(r.effective_date||'').slice(0,10))+' · '+
     esc(r.payment_method==='BELUM_DIPETAKAN'?'Pembayaran belum terpetakan':r.expense_account_code||'Review')+'</small></td>'+
     '<td class="hsn-rv-now">'+esc(amt(current))+'</td>'+
     '<td><input type="number" step="0.01" min="0.01" inputmode="decimal" '+
       'data-hsn-rv-value="'+esc(id)+'" value="'+esc(value)+'" placeholder="Isi nilai koreksi"'+
       (locked?' disabled':'')+' aria-label="Nilai koreksi '+esc(r.item_name||'transaksi')+'"></td>'+
     '<td><button type="button" class="hsn-rv-save'+(staged?' staged':'')+'" '+
       'data-hsn-rv-stage="'+esc(id)+'"'+(locked?' disabled':'')+' title="Simpan baris">'+
       (existing?'Terkirim':staged?'✓ Tersimpan':'✓')+'</button></td></tr>';
  }).join('');
  overlay.innerHTML='<div class="hsn-rv-shade" data-hsn-rv-close="1"></div>'+
   '<section class="hsn-rv-dialog" role="dialog" aria-modal="true" aria-labelledby="hsnRvTitle">'+
   '<header class="hsn-rv-head"><div><div class="hsn-rv-eyebrow">REVIEW PEMBELIAN</div>'+
   '<h3 id="hsnRvTitle">Koreksi Nilai Transaksi</h3>'+
   '<p>'+esc(state.period)+' · '+rows.length+' transaksi · nilai saat ini '+esc(amt(rows.reduce(function(a,b){return a+Number(b.total_amount||0)},0)))+'</p></div>'+
   '<button type="button" class="hsn-rv-close" data-hsn-rv-close="1" aria-label="Tutup">×</button></header>'+
   '<p class="hsn-rv-hint">Masukkan nilai koreksi, tekan <b>✓</b> untuk menyimpan tiap baris, kemudian <b>Submit ke Database</b>.</p>'+
   '<div class="hsn-rv-scroll"><table><thead><tr><th>Transaksi</th><th>Nilai Saat Ini</th><th>Nilai Koreksi</th><th>✓ Simpan Row</th></tr></thead>'+
   '<tbody>'+(state.loading?'<tr><td colspan="4">Memuat transaksi Review…</td></tr>':body||'<tr><td colspan="4">Tidak ada transaksi Review pada periode ini.</td></tr>')+'</tbody></table></div>'+
   '<footer class="hsn-rv-footer"><div><b data-hsn-rv-count>'+Object.keys(state.staged).length+' baris disimpan</b>'+
   '<small>Submit menyimpan usulan koreksi di database. Nilai transaksi dan jurnal asli tidak langsung berubah.</small>'+
   (state.notice?'<span role="status">'+esc(state.notice)+'</span>':'')+'</div>'+
   '<button type="button" class="hsn-rv-submit" data-hsn-rv-submit="1"'+
     (!Object.keys(state.staged).length||state.busy||state.loading?' disabled':'')+'>'+
     (state.busy?'Mengirim…':'Submit ke Database')+'</button></footer></section>';
 }
 function clear(){
  state.open=false;state.loading=false;state.busy=false;state.rows=[];state.staged={};
  state.fields={};state.pending={};state.req++;state.notice='';
  if(overlay){overlay.remove();overlay=null}
 }
 function close(){if(state.busy)return;if(Object.keys(state.staged).length&&!window.confirm('Batal dan buang koreksi yang belum disubmit?'))return;clear()}
 function verifiedId(id){return state.rows.find(function(x){return String(x.source_history_id)===id})}
 async function open(){
  if(state.open||!isOwner())return;
  var period=month(),api=db();if(!period||!api)return;
  state.open=true;state.period=period;state.loading=true;state.rows=[];
  state.fields={};state.staged={};state.pending={};state.notice='';render();
  var seq=++state.req,session=window.__HASNARIA_CONTEXT;
  try{
   var r=await Promise.all([
    api.rpc('get_purchase_control_period_v1',{p_brand:'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4',p_period:period+'-01'}),
    api.rpc('get_purchase_review_amount_requests_v1',{p_period:period+'-01'})
   ]);
   r.forEach(function(v){if(v.error)throw v.error});
   if(!state.open||state.req!==seq||session!==window.__HASNARIA_CONTEXT||state.period!==month())return;
   var pack=r[0].data||{};
   state.rows=(Array.isArray(pack.rows)?pack.rows:[]).filter(function(x){
     return(x.expense_account_code==='1990'||x.category_status==='provisional')&&
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(x.source_history_id||''));
   });
   (Array.isArray(r[1].data)?r[1].data:[]).forEach(function(x){if(x.source_history_id)state.pending[String(x.source_history_id)]=x});
  }catch(e){if(state.open&&state.req===seq)state.notice='Gagal memuat Review: '+(e.message||String(e))}
  finally{if(state.open&&state.req===seq){state.loading=false;render()}}
 }
 function stage(id){
  var r=verifiedId(id);if(!r||state.pending[id]||state.busy)return;
  var raw=String(state.fields[id]||'').trim();
  var val=Number(raw),old=Number(r.total_amount);
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(val)||val<=0||val===old){
   state.notice='Isi nominal koreksi positif yang berbeda dari nilai saat ini ('+String(r.item_name||'transaksi')+').';render();return;
  }
  state.staged[id]={source_history_id:id,current_amount:old,corrected_amount:val};
  state.notice='✓ '+String(r.item_name||'Transaksi')+' disimpan di formulir, belum ke database.';render();
 }
 async function submit(){
  if(!state.open||state.busy||state.loading||!isOwner())return;
  var list=Object.keys(state.staged).map(function(k){return state.staged[k]});
  if(!list.length)return;
  if(state.period!==month()){state.notice='Periode berubah; buka ulang formulir.';render();return}
  if(!window.confirm('Kirim '+list.length+' koreksi ke database sebagai usulan verifikasi Finance? Nilai transaksi dan jurnal belum diganti.'))return;
  state.busy=true;state.notice='Mengirim koreksi…';render();
  try{
   var r=await db().rpc('submit_purchase_review_amount_corrections_v1',{
    p_period:state.period+'-01',p_changes:list
   });
   if(r.error)throw r.error;
   var out=r.data||{};
   if(out.status!=='pending_finance_review'||Number(out.submitted_rows)!==list.length)
     throw Error('Respons database tidak sesuai jumlah koreksi. Periksa sebelum mencoba ulang.');
   list.forEach(function(item){state.pending[item.source_history_id]={proposed_amount:item.corrected_amount,status:'pending_finance_review'}});
   state.staged={};state.fields={};
   state.notice='Berhasil mengirim '+list.length+' baris ke database. Menunggu verifikasi Finance. Batch '+String(out.batch_id||'').slice(0,8)+'.';
  }catch(e){state.notice='Submit gagal: '+(e.message||String(e))}
  finally{state.busy=false;render()}
 }
 document.addEventListener('click',function(e){
  var k=e.target.closest&&e.target.closest('#pembelian #purchaseFinanceAlignment .pfa-card.review');
  if(k){e.preventDefault();open();return}
  if(!overlay)return;
  var z=e.target.closest&&e.target.closest('[data-hsn-rv-close]');
  if(z){if(z===e.target)close();return}
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
 document.addEventListener('change',function(e){if(e.target&&e.target.id==='paPeriod'&&state.open)clear()},true);
 function boot(){
  var host=document.getElementById('pembelian');
  if(!host){setTimeout(boot,150);return}
  markCard();
  var observer=new MutationObserver(function(){markCard()});
  observer.observe(host,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();