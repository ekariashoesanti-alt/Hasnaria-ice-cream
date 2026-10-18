(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V12)return;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V12=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var CATS=['Beban Administrasi','Beban Pemeliharaan','Beban Bahan Baku','Beban Kepegawaian'];
var CAT_LABEL={'Beban Administrasi':'6100 · Administrasi','Beban Pemeliharaan':'6110 · Pemeliharaan','Beban Bahan Baku':'6120 · Bahan Baku','Beban Kepegawaian':'6200 · Kepegawaian'};
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var infographicMode='value';
var db=null,rows=[],control={},overview=null,chartRows=[],periods=[],loading=false,error='',observer=null,timer=0,loadedAt=0,loadedPeriod='',syncingStock=false,lastStockSync='',category='all',modalOpen=false,requestSeq=0,syncing=false,unitOpen=false,unitBusy=false,unitError='',unitNotice='',unitQueue=[],unitSelected='',unitPreview=null,unitPeriod='',unitDraft={sourceUnit:'',factor:'',evidence:'',reason:''},unitSession=null,unitSeq=0;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return isFinite(v)?v:0}
function money(v){var x=n(v),a=Math.abs(x);if(a>=1e9)return'Rp '+(x/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(a>=1e6)return'Rp '+(x/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(x/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+x.toLocaleString('id-ID',{maximumFractionDigits:0})}
function qty(v){var x=n(v);return x.toLocaleString('id-ID',{maximumFractionDigits:3})}
function periodKey(v){var s=String(v||'');return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):''}
function dateLabel(v){var s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—'}
function total(a){return a.reduce(function(s,r){return s+n(r.total_amount)},0)}
function periodValue(){var p=document.getElementById('paPeriod');return p?periodKey(p.value):''}
function categoryValue(){var s=document.getElementById('pfaCategory');return s?s.value:category}
function detailRows(){var s=categoryValue();return rows.filter(function(r){return s==='all'||r.expense_category===s})}
function byCat(a,cat){return a.filter(function(r){return r.expense_category===cat})}
function monthRange(){var p=periodValue();if(!/^\d{4}-\d{2}$/.test(p))return null;var y=+p.slice(0,4),m=+p.slice(5,7);return{from:p+'-01',to:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),key:p}}
function monthLabel(v){var p=periodKey(v);if(!p)return'—';return MONTHS[Number(p.slice(5,7))-1]+' '+p.slice(0,4)}
function cutLabel(){var r=monthRange();if(!r)return'Periode belum tersedia';return'1–'+String(r.to).slice(8,10)+' '+monthLabel(r.key)}
function statusPill(text,type){return'<span class="pfa-status '+(type||'')+'">'+esc(text)+'</span>'}

function patchCore(root){
  var sub=root.querySelector('.pa-title p');if(sub)sub.textContent='Ringkasan visual Pembelian. Rincian transaksi tersedia saat dibutuhkan.';
  var legacyScope=root.querySelector('#paScope');if(legacyScope&&legacyScope.closest('label'))legacyScope.closest('label').style.display='none';
  var branch=root.querySelector('.pa-controls select[disabled]');if(branch&&branch.closest('label'))branch.closest('label').style.display='none';
}
function syncPeriodOptions(){
  var sel=document.getElementById('paPeriod');if(!sel||!periods.length)return;
  var current=periodValue(),html=periods.map(function(x){var k=periodKey(x.period_start||x.period_key);return'<option value="'+esc(k)+'">'+esc(monthLabel(k))+'</option>'}).join('');
  if(!html)return;
  if(sel.innerHTML!==html)sel.innerHTML=html;
  var available=periods.some(function(x){return periodKey(x.period_start||x.period_key)===current});
  sel.value=available?current:periodKey(periods[0].period_start||periods[0].period_key);
}
function card(label,value,sub,cls){return'<article class="pfa-card '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||'')+'</small></article>'}
function stockCell(r){
  if(r.stock_status==='posted_to_stock')return statusPill('+'+qty(r.posted_stock_qty||r.source_stock_qty)+' '+(r.posted_stock_unit||r.source_stock_unit||'unit'),'ok')+'<small class="pfa-action">'+esc(r.inventory_item_name||'Stok')+'</small>';
  if(r.stock_status==='ready_to_stock')return statusPill(!r.source_stock_unit?'Perlu verifikasi satuan':'Cek satuan & konversi','warn')+'<small class="pfa-action">'+esc(qty(r.source_stock_qty))+' '+esc(r.source_stock_unit||'satuan belum ada')+' · '+esc(r.inventory_item_name||'stok')+'</small>';
  if(r.stock_status==='stock_review_required')return statusPill('Perlu mapping','warn')+'<small class="pfa-action">'+esc(r.stock_mapping_status||'mapping stok')+'</small>';
  return statusPill('Non-stok','');
}
function financeStatus(r){return r.category_status==='provisional'?statusPill('Sumber bayar belum lengkap','warn'):statusPill('Terjurnal','ok')}
function table(a){
  var show=a.slice().sort(function(x,y){return String(y.effective_date||'').localeCompare(String(x.effective_date||''))||n(y.total_amount)-n(x.total_amount)}).slice(0,220);
  if(!show.length)return'<div class="pfa-empty">Tidak ada transaksi Pembelian untuk kategori/periode ini.</div>';
  return'<div class="pfa-table-scroll"><table class="pfa-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Akun Beban</th><th class="num">Nilai</th><th>Stok Qty</th><th>Finance</th></tr></thead><tbody>'+show.map(function(r){return'<tr><td>'+esc(dateLabel(r.effective_date))+'</td><td><b>'+esc(r.item_name||'Tanpa nama')+'</b><small>'+esc(r.analytics_category||r.analytics_group||'')+'</small></td><td><b>'+esc(r.expense_account_code)+' · '+esc(r.expense_category)+'</b></td><td class="num">'+esc(money(r.total_amount))+'</td><td>'+stockCell(r)+'</td><td>'+financeStatus(r)+'</td></tr>'}).join('')+'</tbody></table></div>'+(a.length>show.length?'<div class="pfa-more">Menampilkan 220 transaksi terbaru dari '+a.length.toLocaleString('id-ID')+' transaksi.</div>':'')
}
function filterMarkup(){return'<label class="pfa-modal-filter">Kategori<select id="pfaCategory"><option value="all"'+(category==='all'?' selected':'')+'>Semua kategori</option>'+CATS.map(function(x){return'<option value="'+esc(x)+'"'+(category===x?' selected':'')+'>'+esc(CAT_LABEL[x]||x)+'</option>'}).join('')+'</select></label>'}
function chartMarkup(){
  var source=chartRows&&chartRows.length?chartRows:CATS.map(function(cat){var a=byCat(rows,cat);return{category:cat,purchase_rows:a.length,amount:total(a)}}).filter(function(x){return x.purchase_rows});
  if(!source.length)return'<div class="pfa-empty">Belum ada kategori untuk periode ini.</div>';
  var max=Math.max.apply(null,source.map(function(x){return n(x.amount)}).concat([1]));
  return'<div class="pfa-chart">'+source.slice().sort(function(a,b){return n(b.amount)-n(a.amount)}).map(function(x){var value=n(x.amount),pct=Math.max(0,Math.min(100,value/max*100)),label=CAT_LABEL[x.category]||x.category||'Lainnya';return'<div class="pfa-chart-row"><div class="pfa-chart-label"><span>'+esc(label)+'</span><b>'+esc(money(value))+'</b></div><progress max="100" value="'+pct.toFixed(2)+'">'+pct.toFixed(0)+'%</progress><small>'+n(x.purchase_rows).toLocaleString('id-ID')+' transaksi</small></div>'}).join('')+'</div>'
}
function summaryValues(){
  if(overview)return overview;
  var inv=rows.filter(function(r){return r.expense_account_code==='6120'}),review=rows.filter(function(r){return r.expense_account_code==='1990'||r.category_status==='provisional'}),ops=rows.filter(function(r){return r.expense_account_code!=='6120'&&r.expense_account_code!=='1990'});
  return{purchase_rows:rows.length,total_purchase_amount:total(rows),inventory_rows:inv.length,inventory_amount:total(inv),operating_rows:ops.length,operating_amount:total(ops),review_rows:review.length,review_amount:total(review),sync_ok:control.finance_link_status==='MATCH'}
}
function syncMarkup(){
  var finance=control.finance_link_status==='MATCH',stock=control.stock_link_status==='OK',review=n(control.provisional_journal_rows)+n(control.stock_review_rows);
  return'<div class="pfa-sync-grid"><div><span>Keuangan</span><strong>'+statusPill(finance?'Sinkron':'Periksa',finance?'ok':'bad')+(finance?'':' · delta '+esc(money(control.purchase_journal_delta)))+'</strong></div><div><span>Stok</span><strong>'+statusPill(stock?'Sinkron':'Perlu review',stock?'ok':'warn')+'</strong></div><div><span>Perlu perhatian</span><strong>'+review.toLocaleString('id-ID')+'</strong></div></div>'
}
function modalMarkup(){
  if(!modalOpen)return'';
  var a=detailRows();
  return'<div class="pfa-modal-backdrop" data-pfa-detail-close="1"><section class="pfa-modal" role="dialog" aria-modal="true" aria-labelledby="pfaModalTitle"><div class="pfa-modal-head"><div><div class="pfa-eyebrow">DETAIL PEMBELIAN</div><h3 id="pfaModalTitle">'+esc(monthLabel(periodValue()))+'</h3><p>'+a.length.toLocaleString('id-ID')+' transaksi · '+esc(money(total(a)))+'</p></div><button type="button" class="pfa-close" data-pfa-detail-close="1" aria-label="Tutup">×</button></div><div class="pfa-modal-tools">'+filterMarkup()+'</div>'+table(a)+'</section></div>'
}

function ownerUnitRole(){var c=window.__HASNARIA_CONTEXT;return!!(c&&c.role==='owner')}
function unitAllowed(){
 var app=document.getElementById('app'),panel=document.getElementById('pembelian');
 return unitOpen&&ownerUnitRole()&&unitSession===window.__HASNARIA_CONTEXT&&
  (!app||!app.classList.contains('hidden'))&&
  (!panel||!panel.classList.contains('hidden'));
}
function closeUnitReview(){
 unitSeq++;unitOpen=false;unitBusy=false;unitSession=null;
 unitQueue=[];unitSelected='';unitPeriod='';unitPreview=null;unitError='';unitNotice='';
 unitDraft={sourceUnit:'',factor:'',evidence:'',reason:''};
}
function activeUnitItem(){return unitQueue.find(function(x){return x.source_id===unitSelected})||null}
function unitBaseline(v){return v==='PRE_OR_ON_OPNAME'?'Sebelum/pada opname terakhir':v==='POST_OPNAME'?'Sesudah opname terakhir':'Belum ada opname fisik'}
function unitVerificationMarkup(){
  if(!ownerUnitRole())return '';
  var button='<div class="pfa-detail-cta pfa-unit-entry"><div><b>Verifikasi satuan Pembelian → Stok</b><span>Owner memeriksa kemasan, faktor isi dan bukti. Tidak ada posting Stok atau jurnal Keuangan pada tahap ini.</span></div><button type="button" data-pfa-unit-open="1">Periksa satuan'+(unitPeriod===periodValue()&&unitQueue.length?' ('+unitQueue.length+')':'')+'</button></div>';
  if(!unitOpen)return button;
  var active=activeUnitItem(),values=unitQueue||[];
  var tableHtml=values.length?'<div class="pfa-table-scroll pfa-unit-table"><table class="pfa-table"><thead><tr><th>Tanggal</th><th>SKU</th><th>Qty sumber</th><th>Nilai</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+values.map(function(x){
    return '<tr'+(x.source_id===unitSelected?' class="pfa-unit-active"':'')+'><td>'+esc(dateLabel(x.purchase_date))+'</td><td><b>'+esc(x.stock_item||x.item_name)+'</b><small>'+esc(x.stock_unit||'satuan belum ada')+' · '+esc(unitBaseline(x.baseline_effect))+'</small></td><td>'+esc(qty(x.source_qty))+' '+esc(x.canonical_source_unit||'[kosong]')+'</td><td>'+esc(money(x.amount))+'</td><td>'+statusPill(x.approval_id?'Bukti tercatat':x.status==='MASTER_UNIT_NEEDS_CORRECTION'?'Perbaiki satuan master':'Perlu verifikasi',x.approval_id?'ok':'warn')+'</td><td><button type="button" data-pfa-unit-select="'+esc(x.source_id)+'">Periksa</button></td></tr>'
  }).join('')+'</tbody></table></div>':'<div class="pfa-empty">Tidak ada transaksi pending untuk diverifikasi pada periode ini.</div>';
  var formHtml='';
  if(active){
    var current=active.approval_id,blockedMaster=active.status==='MASTER_UNIT_NEEDS_CORRECTION';
    formHtml='<div class="pfa-unit-form"><h4>'+esc(active.item_name||active.stock_item)+'</h4><p>Qty sumber: <b>'+esc(qty(active.source_qty))+'</b> · Satuan stok: <b>'+esc(active.stock_unit||'—')+'</b> · Nilai '+esc(money(active.amount))+'</p><p class="pfa-unit-hint">'+esc(unitBaseline(active.baseline_effect))+'. Bukti wajib dari nota atau kemasan. Input ini tidak menambahkan stok.</p>';
    if(blockedMaster){
      formHtml+='<p role="alert" class="pfa-error">Satuan master SKU masih purchase_unit / kosong. Verifikasi ditahan sampai master SKU ditetapkan berdasarkan bukti fisik. Jangan mengisi faktor konversi atau posting sebelum satuan master sah.</p>';
    }else if(current){
      formHtml+='<p>'+statusPill('Verifikasi terdokumentasi, belum posting','ok')+' · '+esc(active.approved_unit||'')+' × '+esc(qty(active.approved_multiplier))+' = '+esc(qty(active.approved_qty))+' '+esc(active.stock_unit)+'</p><label>Alasan pembatalan/revisi (min. 20 karakter)<textarea data-pfa-unit-field="reason" rows="2" placeholder="Jelaskan bukti koreksi">'+esc(unitDraft.reason)+'</textarea></label><button type="button" data-pfa-unit-revoke="1"'+(unitBusy?' disabled':'')+'>Batalkan verifikasi</button>';
    }else{
      formHtml+='<div class="pfa-unit-fields"><label>Satuan saat beli<input data-pfa-unit-field="sourceUnit" maxlength="40" placeholder="Contoh: pack / pcs / botol" value="'+esc(unitDraft.sourceUnit)+'"></label><label>Faktor ke '+esc(active.stock_unit)+'<input data-pfa-unit-field="factor" type="number" min="0.000001" max="999999.999" step="any" placeholder="Isi sesuai bukti" value="'+esc(unitDraft.factor)+'"></label><label>Referensi bukti<input data-pfa-unit-field="evidence" maxlength="400" placeholder="Nomor nota, nama file, foto kemasan" value="'+esc(unitDraft.evidence)+'"></label><label>Alasan verifikasi<textarea data-pfa-unit-field="reason" rows="2" maxlength="1000" placeholder="Jelaskan isi kemasan dan satuan yang diperiksa">'+esc(unitDraft.reason)+'</textarea></label></div><div class="pfa-unit-controls"><button type="button" data-pfa-unit-preview="1"'+(unitBusy?' disabled':'')+'>Pratinjau kuantitas</button>'+(unitPreview?'<button type="button" class="primary" data-pfa-unit-apply="1"'+(unitBusy?' disabled':'')+'>Simpan bukti verifikasi</button>':'')+'</div>';
      if(unitPreview)formHtml+='<div class="pfa-unit-preview">Hasil terverifikasi: <b>'+esc(qty(unitPreview.stock_qty))+' '+esc(unitPreview.stock_unit)+'</b> dari '+esc(qty(unitPreview.source_qty))+' '+esc(unitPreview.source_unit)+' × '+esc(qty(unitPreview.multiplier))+'. <strong>Tidak ada posting stok/keuangan.</strong></div>';
    }
    formHtml+='</div>';
  }
  return button+'<div class="pfa-modal-backdrop" data-pfa-unit-close="1"><section class="pfa-modal pfa-unit-modal" role="dialog" aria-modal="true" aria-labelledby="pfaUnitTitle"><div class="pfa-modal-head"><div><div class="pfa-eyebrow">OWNER · PEMBELIAN</div><h3 id="pfaUnitTitle">Verifikasi satuan '+esc(monthLabel(periodValue()))+'</h3><p>Hanya dokumentasi satuan dan bukti · Stock dan Finance tidak berubah</p></div><button type="button" data-pfa-unit-close="1" class="pfa-close" aria-label="Tutup">×</button></div>'+(unitBusy?'<p>Memproses verifikasi…</p>':'')+(unitError?'<p role="alert" class="pfa-error">'+esc(unitError)+'</p>':'')+(unitNotice?'<p role="status" class="pfa-unit-success">'+esc(unitNotice)+'</p>':'')+(unitPeriod!==periodValue()?'':tableHtml)+formHtml+'</section></div>';
}
async function unitLoad(){
  if(!unitAllowed())return;
  var ctx=unitSession,call=++unitSeq,p=periodValue();if(!p||!db)return;
  unitBusy=true;unitError='';render();
  try{
    var res=await db.rpc('owner_purchase_unit_queue_v1',{p_period:p+'-01'});
    if(res.error)throw res.error;
    if(!unitAllowed()||unitSession!==ctx||call!==unitSeq||p!==periodValue())return;
    unitPeriod=p;unitQueue=Array.isArray(res.data&&res.data.items)?res.data.items:[];
    if(unitSelected&&!unitQueue.some(function(x){return x.source_id===unitSelected})){unitSelected='';unitPreview=null}
   }catch(e){if(unitAllowed()&&call===unitSeq)unitError='Gagal memuat verifikasi satuan: '+(e&&e.message?e.message:String(e))}
  finally{if(unitAllowed()&&call===unitSeq){unitBusy=false;render()}}
}
function unitFormValues(){
  var d=Object.assign({},unitDraft),valid=Number(d.factor);
  if(!d.sourceUnit.trim()||!d.factor.trim()||!Number.isFinite(valid)||valid<=0)throw Error('Masukkan satuan beli dan faktor konversi yang benar.');
  return{p_source_id:unitSelected,p_source_unit:d.sourceUnit.trim(),p_multiplier:valid};
}
async function unitPreviewSelected(){
  if(!unitAllowed()||!activeUnitItem()||unitBusy)return;
  var ctx=unitSession,call=++unitSeq,source=unitSelected,snapshot=JSON.stringify(unitDraft);
  unitBusy=true;unitError='';unitNotice='';unitPreview=null;
  try{
    var args=unitFormValues(),q=await db.rpc('owner_purchase_unit_preview_v1',args);
    if(q.error)throw q.error;
    if(!unitAllowed()||unitSession!==ctx||call!==unitSeq||source!==unitSelected||snapshot!==JSON.stringify(unitDraft)||!activeUnitItem())return;
    unitPreview=q.data;
  }catch(e){unitError=e&&e.message?e.message:String(e)}
  finally{unitBusy=false;render()}
}
async function unitApplySelected(){
  if(!unitAllowed()||!unitPreview||unitBusy)return;
  unitBusy=true;unitError='';
  try{
    var args=unitFormValues();
    if(args.p_source_id!==unitPreview.source_id||
       args.p_source_unit!==unitPreview.source_unit||
       args.p_multiplier!==Number(unitPreview.multiplier))throw Error('Isian berubah, buat ulang pratinjau.');
    var q=await db.rpc('owner_purchase_unit_apply_v1',Object.assign(args,{
      p_token:unitPreview.token,p_evidence:unitDraft.evidence.trim(),p_reason:unitDraft.reason.trim()
    }));
    if(q.error)throw q.error;
    unitNotice='Bukti verifikasi berhasil dicatat. Belum ada perubahan saldo Stok maupun jurnal Keuangan.';
    unitPreview=null;
    var k=periodValue(),r=await db.rpc('owner_purchase_unit_queue_v1',{p_period:k+'-01'});
    if(r.error)throw r.error;
    if(k===periodValue()){unitQueue=Array.isArray(r.data&&r.data.items)?r.data.items:[];unitPeriod=k}
  }catch(e){unitError=e&&e.message?e.message:String(e)}
  finally{unitBusy=false;render()}
}
async function unitRevokeSelected(){
  var a=activeUnitItem();
  if(!unitAllowed()||!a||!a.approval_id||unitBusy)return;
  unitBusy=true;unitError='';
  try{
    var q=await db.rpc('owner_purchase_unit_revoke_v1',{
      p_review_id:a.approval_id,p_reason:unitDraft.reason.trim()
    });
    if(q.error)throw q.error;
    unitNotice='Verifikasi dibatalkan; bukti tersimpan sebagai histori. Tidak ada perubahan Stok.';
    unitSelected='';unitPreview=null;unitDraft={sourceUnit:'',factor:'',evidence:'',reason:''};
    var p=periodValue(),r=await db.rpc('owner_purchase_unit_queue_v1',{p_period:p+'-01'});
    if(r.error)throw r.error;
    if(p===periodValue()){unitQueue=Array.isArray(r.data&&r.data.items)?r.data.items:[];unitPeriod=p}
  }catch(e){unitError=e&&e.message?e.message:String(e)}
  finally{unitBusy=false;render()}
}


function purchaseDailyMarkup(){
 var daily={};rows.forEach(function(r){var d=String(r.purchase_date||'').slice(0,10);if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(d))return;
  if(!daily[d])daily[d]={date:d,count:0,amount:0};daily[d].count++;daily[d].amount+=n(r.total_amount)
 });
 var series=Object.keys(daily).sort().map(function(k){return daily[k]});
 if(!series.length)return'<div class="pfa-empty">Tidak ada tanggal transaksi terverifikasi untuk grafik harian.</div>';
 var highest=Math.max.apply(null,series.map(function(r){return infographicMode==='value'?r.amount:r.count}).concat([1]));
 return'<div class="pfa-mode"><button type="button" data-pfa-mode="value" class="'+(infographicMode==='value'?'on':'')+'">Nilai</button><button type="button" data-pfa-mode="count" class="'+(infographicMode==='count'?'on':'')+'">Transaksi</button></div>'+
 '<div class="pfa-day-chart" role="img" aria-label="Grafik Pembelian per hari dari transaksi kanonis">'+series.map(function(r){var v=infographicMode==='value'?r.amount:r.count;var h=Math.max(2,Math.round(v/highest*112));
 return'<div class="pfa-day" title="'+esc(dateLabel(r.date)+' · '+r.count+' transaksi · '+money(r.amount))+'"><b>'+esc(infographicMode==='value'?money(r.amount):String(r.count))+'</b><i style="height:'+h+'px"></i><small>'+esc(r.date.slice(8,10)+'/'+r.date.slice(5,7))+'</small></div>'
 }).join('')+'</div><div class="pfa-note-banner">Distribusi harian dihitung dari transaksi Pembelian kanonis. Angka nol tidak dibuat untuk hari tanpa sumber.</div>'
}
function purchaseTopMarkup(){
 var g={};rows.forEach(function(r){var label=String(r.item_name||r.source_name||r.purchase_item_name||'').trim();if(!label)return;var k=label.toUpperCase();if(!g[k])g[k]={label:label,amount:0,count:0};g[k].amount+=n(r.total_amount);g[k].count++});
 var list=Object.keys(g).map(function(k){return g[k]}).sort(function(a,b){return b.amount-a.amount}).slice(0,5);
 if(!list.length)return'<div class="pfa-empty">Nama item tidak tersedia dari pack kanonis.</div>';
 var max=Math.max.apply(null,list.map(function(r){return r.amount}).concat([1]));
 return list.map(function(r,i){return'<div class="pfa-share-row"><div><span>'+(i+1)+'. '+esc(r.label)+'</span><b>'+esc(money(r.amount))+'</b></div><progress max="100" value="'+Math.max(1,r.amount/max*100).toFixed(1)+'"></progress><small>'+r.count+' baris pembelian</small></div>'}).join('');
}
function purchasePaymentMarkup(){
 var g={};rows.forEach(function(r){var k=String(r.payment_method||r.payment_label||'Belum dipetakan').trim()||'Belum dipetakan';g[k]=(g[k]||0)+n(r.total_amount)});
 var labels=Object.keys(g).sort(function(a,b){return g[b]-g[a]});
 if(!labels.length)return'<div class="pfa-empty">Metode pembayaran tidak tersedia.</div>';
 var value=total(rows)||1;return labels.slice(0,6).map(function(k){return'<div class="pfa-share-row"><div><span>'+esc(k)+'</span><b>'+esc(money(g[k]))+'</b></div><progress max="100" value="'+Math.max(0,g[k]/value*100).toFixed(1)+'"></progress></div>'}).join('')+
 '<div class="pfa-note-banner">Metode pembayaran, sumber dana dan kategori beban adalah konsep berbeda; jangan membuat jurnal duplikat.</div>';
}
function infographicMarkup(){
 return'<div class="pfa-insights-grid"><article class="pfa-insight-panel"><h3>Tren Pembelian Harian</h3><p>Nilai dan frekuensi transaksi periode terpilih</p>'+purchaseDailyMarkup()+'</article>'+
 '<article class="pfa-insight-panel"><h3>Status Sinkronisasi</h3><p>Perbandingan Pembelian → Keuangan dan Stok</p>'+syncMarkup()+'<div class="pfa-note-banner">Penerimaan Stok hanya dibukukan setelah satuan dan bukti diperiksa. Mapping cocok belum berarti quantity aman ditambahkan ke Stok; opname tetap harus diperiksa.</div></article></div>'+
 '<div class="pfa-insight-two"><article class="pfa-insight-panel"><h3>Komposisi Pembelian</h3><p>Nilai per akun Beban untuk '+esc(cutLabel())+'</p>'+chartMarkup()+'</article>'+
 '<article class="pfa-insight-panel"><h3>Top 5 Item Pembelian</h3><p>Urutan berdasarkan total nilai sumber</p>'+purchaseTopMarkup()+'</article></div>'+
 '<div class="pfa-insight-two"><article class="pfa-insight-panel"><h3>Komposisi Pembayaran</h3><p>Sumber pembiayaan dari transaksi kanonis</p>'+purchasePaymentMarkup()+'</article>'+
 '<article class="pfa-insight-panel"><h3>Kontrol Data Berkualitas</h3><p>Review dan bukti Owner dipisah dari posting</p>'+
 '<div class="pfa-note-banner"><b>'+esc(String(n(control.stock_review_rows)+n(control.provisional_journal_rows)))+' kandidat perlu perhatian</b>. Pemeriksaan bukti Owner dilakukan melalui tombol review di bawah; mengunggah Excel tidak otomatis memposting Stok.</div>'+
 '<button type="button" class="primary" data-pfa-notifications>Periksa di Notifikasi →</button></article></div>';
}
function render(){
  if(unitOpen&&!unitAllowed())closeUnitReview();
  var root=document.getElementById('paRoot');if(!root)return;patchCore(root);syncPeriodOptions();
  var target=root.querySelector('.pa-controls');if(!target)return;
  var wrap=document.getElementById('purchaseFinanceAlignment');
  if(!wrap){wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';target.insertAdjacentElement('afterend',wrap)}
  if(loading){wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">PEMBELIAN</div><h2>Ringkasan Pembelian</h2><p>Memuat periode terpilih…</p></div></div>';return}
  if(error){wrap.innerHTML='<div class="pfa-head"><div><h2>Ringkasan Pembelian</h2><p class="pfa-error">'+esc(error)+'</p></div><button id="pfaRetry" type="button">Muat ulang</button></div>';var rb=document.getElementById('pfaRetry');if(rb)rb.onclick=function(){load(true)};return}
  var v=summaryValues(),finance=control.finance_link_status==='MATCH';
  wrap.innerHTML='<div class="pfa-head"><div><div class="pfa-eyebrow">PEMBELIAN · '+esc(cutLabel())+'</div><h2>Ringkasan Pembelian</h2><p>Visual utama menampilkan nilai dan kategori. Rincian transaksi disimpan di popup agar halaman tetap ringkas.</p></div><span class="pfa-sync '+(finance?'ok':'warn')+'">'+(finance?'TERSINKRON':'PERLU PERIKSA')+'</span></div>'+
    '<div class="pfa-cards">'+
      card('Total Pembelian',money(v.total_purchase_amount),n(v.purchase_rows).toLocaleString('id-ID')+' transaksi','total')+
      card('Inventory',money(v.inventory_amount),n(v.inventory_rows).toLocaleString('id-ID')+' transaksi','inventory')+
      card('Operasional',money(v.operating_amount),n(v.operating_rows).toLocaleString('id-ID')+' transaksi','expense')+
      card('Review',money(v.review_amount),n(v.review_rows).toLocaleString('id-ID')+' transaksi','review')+
    '</div>'+
    infographicMarkup()+
    '<div class="pfa-detail-cta"><div><b>'+n(v.purchase_rows).toLocaleString('id-ID')+' transaksi pada '+esc(monthLabel(periodValue()))+'</b><span>Tabel lengkap tidak ditampilkan di halaman utama.</span></div><button type="button" class="primary" data-pfa-detail-open="1">Lihat Detail Pembelian</button></div>'+
    unitVerificationMarkup()+
    modalMarkup();
}
async function loadPeriods(){
  db=db||window.__HASNARIA_DB;if(!db)return;
  try{var q=await db.rpc('get_ui_period_catalog_fast_v1',{p_brand:BRAND,p_module:'pembelian'});if(q.error)throw q.error;periods=q.data||[];syncPeriodOptions()}catch(e){if(console&&console.warn)console.warn('Purchase period catalog:',e)}
}
function purchasePack(period){return db.rpc('get_purchase_control_period_v1',{p_brand:BRAND,p_period:period+'-01'})}
async function load(force){
  var p=periodValue();if(!p)return;
  if(loading){if(force)requestSeq++;return}
  if(!force&&rows.length&&loadedPeriod===p&&Date.now()-loadedAt<60000){render();return}
  var seq=++requestSeq;db=db||window.__HASNARIA_DB;if(!db)return;loading=true;error='';render();
  try{
    var q=await purchasePack(p);
    if(seq!==requestSeq)return;
    if(q.error)throw q.error;
    var pack=q.data||{};rows=Array.isArray(pack.rows)?pack.rows:[];control=pack.control||{};
    // Overview and category chart are derived locally from the same selected-month
    // pack. This avoids two expensive aggregate views and keeps one canonical read.
    overview=null;chartRows=[];
    loadedAt=Date.now();loadedPeriod=p;
  }catch(e){if(seq!==requestSeq)return;rows=[];control={};overview=null;chartRows=[];loadedPeriod='';loadedAt=0;error='Gagal memuat ringkasan Pembelian: '+(e&&e.message?e.message:String(e))}
  finally{if(seq===requestSeq){loading=false;render()}else{loading=false;setTimeout(function(){if(periodValue())load(true)},0)}}
}
function canSyncReport(){var h=document.getElementById('pembelian'),c=window.__HASNARIA_CONTEXT,s=window.__HASNARIA_DATA_SYNC;return!!(h&&!h.classList.contains('hidden')&&c&&c.role==='owner'&&document.getElementById('paRoot')&&!modalOpen&&!unitOpen&&s&&s.canRefresh(h,'#paPeriod,#pfaCategory'))}
async function syncReport(){
  if(loading||syncing||syncingStock||!canSyncReport())return;var p=periodValue();db=db||window.__HASNARIA_DB;if(!p||!db)return;
  var seq=requestSeq,c=window.__HASNARIA_CONTEXT,root=document.getElementById('paRoot');syncing=true;
  try{
    // Polling reads persisted Stock/Finance status; only import events post stock.
    var all=await Promise.all([
      purchasePack(p),
      db.rpc('get_ui_period_catalog_fast_v1',{p_brand:BRAND,p_module:'pembelian'})
    ]);
    if(seq!==requestSeq||loading||p!==periodValue()||c!==window.__HASNARIA_CONTEXT||root!==document.getElementById('paRoot')||!canSyncReport())return;
    all.forEach(function(r){if(r.error)throw r.error});
    // Derive the same summary/chart as the foreground canonical pack, so a
    // freshness tick cannot switch reporting sources or reintroduce slow views.
    var next=all[0].data||{},nr=Array.isArray(next.rows)?next.rows:[],nc=next.control||{},no=null,chart=[],ps=all[1].data||[];
    // A removed catalog entry must not relabel the selected month's snapshot.
    if(!ps.some(function(x){return periodKey(x.period_start||x.period_key)===p})){
      var selected=periods.find(function(x){return periodKey(x.period_start||x.period_key)===p});
      ps=ps.concat([selected||{period_start:p+'-01'}]);
    }
    var changed=!!error||JSON.stringify([rows,control,overview,chartRows,periods])!==JSON.stringify([nr,nc,no,chart,ps]);
    rows=nr;control=nc;overview=no;chartRows=chart;periods=ps;loadedAt=Date.now();loadedPeriod=p;error='';
    if(changed)render();
  }finally{syncing=false}
}
function registerSync(){var s=window.__HASNARIA_DATA_SYNC;if(s)s.register('owner-purchase-report',syncReport)}
registerSync();window.addEventListener('hasnaria:data-sync-ready',registerSync);
function resetData(){rows=[];control={};overview=null;chartRows=[];loadedAt=0;loadedPeriod='';category='all';modalOpen=false;closeUnitReview()}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){if(!document.getElementById('paRoot'))return;render();if(!loading&&(!rows.length||loadedPeriod!==periodValue()))load(false)},80)}
window.__HASNARIA_PURCHASE_FINANCE_REFRESH=syncReport;
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var host=document.getElementById('pembelian');if(db&&host){
    observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});
    document.addEventListener('change',function(e){if(!e.target)return;if(e.target.id==='paPeriod'){resetData();lastStockSync='';load(true);return}if(e.target.id==='pfaCategory'){category=e.target.value;render()}},true);
    document.addEventListener('click',function(e){
      var mode=e.target&&e.target.closest?e.target.closest('[data-pfa-mode]'):null;
      if(mode){infographicMode=mode.getAttribute('data-pfa-mode')==='count'?'count':'value';render();return}
      var notice=e.target&&e.target.closest?e.target.closest('[data-pfa-notifications]'):null;
      if(notice&&window.__HASNARIA_OWNER_SHELL){window.__HASNARIA_OWNER_SHELL.navigate('notifikasi');return}
      var unitOpenBtn=e.target&&e.target.closest?e.target.closest('[data-pfa-unit-open]'):null;
      if(unitOpenBtn&&ownerUnitRole()){closeUnitReview();unitSession=window.__HASNARIA_CONTEXT;unitOpen=true;modalOpen=false;unitLoad();return}
      var unitCloseBtn=e.target&&e.target.closest?e.target.closest('[data-pfa-unit-close]'):null;
      if(unitCloseBtn&&e.target===unitCloseBtn){closeUnitReview();render();return}
      var unitSelectBtn=e.target&&e.target.closest?e.target.closest('[data-pfa-unit-select]'):null;
      if(unitSelectBtn&&unitAllowed()&&!unitBusy){unitSelected=unitSelectBtn.getAttribute('data-pfa-unit-select');unitDraft={sourceUnit:'',factor:'',evidence:'',reason:''};unitPreview=null;unitError='';unitNotice='';render();return}
      if(e.target&&e.target.closest&&e.target.closest('[data-pfa-unit-preview]')){unitPreviewSelected();return}
      if(e.target&&e.target.closest&&e.target.closest('[data-pfa-unit-apply]')){unitApplySelected();return}
      if(e.target&&e.target.closest&&e.target.closest('[data-pfa-unit-revoke]')){unitRevokeSelected();return}
      var open=e.target&&e.target.closest?e.target.closest('[data-pfa-detail-open]'):null;if(open){modalOpen=true;render();return}
      var close=e.target&&e.target.closest?e.target.closest('[data-pfa-detail-close]'):null;if(close&&e.target===close){modalOpen=false;render();return}
      var b=e.target&&e.target.closest?e.target.closest('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn,[data-tab="pembelian"]'):null;if(!b)return;
      if(b.matches('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn'))setTimeout(function(){resetData();lastStockSync='';loadPeriods().then(function(){load(true)})},350);else setTimeout(schedule,120)
    },true);
    document.addEventListener('input',function(e){var key=e.target&&e.target.getAttribute&&e.target.getAttribute('data-pfa-unit-field');if(key&&Object.prototype.hasOwnProperty.call(unitDraft,key)){unitDraft[key]=e.target.value;unitPreview=null;var save=document.querySelector('[data-pfa-unit-apply]');if(save)save.disabled=true;var p=document.querySelector('.pfa-unit-preview');if(p)p.textContent='Input berubah. Jalankan pratinjau ulang sebelum menyimpan.'}},true);
    document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(unitOpen){closeUnitReview();render()}else if(modalOpen){modalOpen=false;render()}}},true);
    document.addEventListener('hasnaria:purchase-imported',function(){resetData();loadPeriods().then(function(){load(true)})},true);
    loadPeriods().then(function(){load(true)});return
  }if(tries++<150)setTimeout(wait,100)})()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
