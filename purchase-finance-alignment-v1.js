(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V12)return;
window.__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V12=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var CATS=['Beban Administrasi','Beban Pemeliharaan','Beban Bahan Baku','Beban Kepegawaian'];
var CAT_LABEL={'Beban Administrasi':'6100 · Administrasi','Beban Pemeliharaan':'6110 · Pemeliharaan','Beban Bahan Baku':'6120 · Bahan Baku','Beban Kepegawaian':'6200 · Kepegawaian'};
var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var infographicMode='value';
var purchaseTrendCache={},trendLoadSequence=0,trendLoadingKey='';
var purchaseView='summary'; // stable desktop one-view, user-selected secondary insight page
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
function financeStatus(r){if(control.finance_link_status!=='MATCH'||n(control.journal_rows)<n(control.purchase_rows))return statusPill('Jurnal belum lengkap','warn');return r.category_status==='provisional'?statusPill('Jurnal provisi · review','warn'):statusPill('Terjurnal','ok')}
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


function trendMonths(selected){
 var p=periodKey(selected),year=p.slice(0,4),end=Number(p.slice(5,7)),out=[];
 if(!year||end<1||end>12)return out;
 for(var m=1;m<=end;m++){var key=year+'-'+String(m).padStart(2,'0');out.push({key:key,label:MONTHS[m-1].slice(0,3)})}
 return out;
}
function catalogHasPeriod(key){return periods.some(function(x){return periodKey(x.period_start||x.period_key)===key})}
function rememberTrendMonth(key,values){
 var p=periodKey(key);if(!p)return;
 purchaseTrendCache[p]={value:total(Array.isArray(values)?values:[]),count:Array.isArray(values)?values.length:0,seen:Date.now()};
}
function trendCacheFresh(key){var x=purchaseTrendCache[key];return!!(x&&Date.now()-x.seen<300000)}
function monthlyTrendMarkup(){
 var p=periodValue(),slots=trendMonths(p);
 if(!slots.length)return'<div class="pfa-empty">Pilih bulan untuk menampilkan tren tahun berjalan.</div>';
 var data=slots.map(function(x){var val=purchaseTrendCache[x.key];return{key:x.key,label:x.label,amount:val?val.value:null,count:val?val.count:0,available:catalogHasPeriod(x.key)||!!val}});
 var known=data.filter(function(x){return x.amount!==null});
 var failed=data.filter(function(x){return x.available&&purchaseTrendCache[x.key]&&purchaseTrendCache[x.key].error});
 var unresolved=data.filter(function(x){return x.available&&x.amount===null});
 var skipped=data.filter(function(x){return !x.available&&x.amount===null});
 if(!known.length)return'<div class="pfa-trend-state" role="status">'+(failed.length?'Gagal membaca tren Pembelian. Coba lagi setelah beberapa saat.':unresolved.length?'Memuat tren Pembelian Januari–'+esc(monthLabel(p))+'…':'Belum tersedia sumber Pembelian terverifikasi untuk tahun '+esc(p.slice(0,4))+'.')+'</div>';
 var amounts=known.map(function(x){return x.amount}),hi=Math.max.apply(null,[0].concat(amounts)),lo=Math.min.apply(null,[0].concat(amounts));
 if(hi===lo){hi+=1}
 var x0=57,x1=668,y0=25,y1=175,scale=function(v){return y1-(v-lo)/(hi-lo)*(y1-y0)};
 var xAt=function(i){return slots.length===1?(x0+x1)/2:x0+(x1-x0)*i/(slots.length-1)};
 var grids=[0,1,2,3,4].map(function(i){var val=lo+(hi-lo)*i/4,y=scale(val);return'<line class="pfa-trend-grid" x1="'+x0+'" x2="'+x1+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'"/><text class="pfa-trend-axis" x="'+(x0-7)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end">'+esc(money(val))+'</text>'}).join('');
 var path='',active=false;
 var dots=data.map(function(d,i){
  var x=xAt(i),axis='<text class="pfa-trend-month" x="'+x.toFixed(1)+'" y="199" text-anchor="middle">'+esc(d.label)+'</text>';
  if(d.amount===null){active=false;return axis+'<circle class="pfa-trend-missing" cx="'+x.toFixed(1)+'" cy="183" r="2.5"><title>'+esc(monthLabel(d.key))+' · belum ada sumber terverifikasi</title></circle>'}
  var y=scale(d.amount),point=x.toFixed(1)+' '+y.toFixed(1);
  path+=(active?' L':' M')+point;active=true;
  return axis+'<circle class="pfa-trend-point" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="5"><title>'+esc(monthLabel(d.key)+' · '+money(d.amount)+' · '+d.count+' transaksi')+'</title></circle>';
 }).join('');
 var note=failed.length?failed.length+' bulan gagal dibaca; coba buka ulang setelah beberapa saat.':unresolved.length?'Memuat '+unresolved.length+' bulan lainnya…':skipped.length?skipped.length+' bulan tanpa sumber pembelian; bukan dianggap Rp 0.':'';
 return'<div class="pfa-monthly-chart" role="img" aria-label="Tren pembelian bulanan Januari sampai '+esc(monthLabel(p))+' dari transaksi kanonis">'+
 '<svg viewBox="0 0 700 212" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+grids+'<path class="pfa-trend-line" d="'+path+'"/>'+dots+'</svg></div>'+
 '<div class="pfa-trend-foot"><span>Januari–'+esc(monthLabel(p))+'</span><strong>'+esc(known.length)+' dari '+esc(slots.length)+' bulan memiliki hasil pembacaan</strong></div>'+
 (note?'<div class="pfa-trend-note" role="status">'+esc(note)+'</div>':'');
}
function goodsKind(r){
 var c=String(r.analytics_category||'').trim().toUpperCase().replace(/\s+/g,' ');
 if(c==='MAKANAN'||c==='FOOD'||c==='SNACK')return'Makanan';
 if(c==='MINUMAN'||c==='DRINK'||c==='BEVERAGE')return'Minuman';
 if(c==='ICE CREAM'||c==='ES KRIM'||c==='ES KRIM/ICE CREAM'||c==='ICECREAM')return'Es Krim';
 if(c==='KEMASAN'||c==='KEMASAN & SUPPLIES'||c==='PACKAGING'||c==='SUPPLIES')return'Kemasan';
 if(c&&r.expense_account_code==='6120')return'Jenis lainnya';
 if(!c&&r.expense_account_code==='6120')return'Belum diklasifikasikan';
 return'';
}
function purchasePieMarkup(){
 var labels=['Makanan','Minuman','Es Krim','Kemasan','Jenis lainnya','Belum diklasifikasikan'],totals={},excluded=0,corrections=0;
 rows.forEach(function(r){
  var amt=n(r.total_amount),cat=goodsKind(r);
  if(amt<=0){if(amt<0)corrections++;return}
  if(!cat){excluded+=amt;return}
  totals[cat]=(totals[cat]||0)+amt;
 });
 var sum=labels.reduce(function(a,k){return a+(totals[k]||0)},0);
 if(sum<=0)return'<div class="pfa-trend-state">Belum ada nilai pembelian barang berkategori pada '+esc(monthLabel(periodValue()))+'.</div>';
 var slices=[],legend=[],acc=0,colors=labels.map(function(_,i){return'pfa-pie-color-'+i});
 labels.forEach(function(label,i){
  var val=totals[label]||0;if(val<=0)return;
  var share=val/sum,from=acc,to=acc+share;acc=to;
  function point(f){var a=f*Math.PI*2-Math.PI/2;return{x:100+76*Math.cos(a),y:100+76*Math.sin(a)}}
  var start=point(from),end=point(to);
  var shape=share>=.999999?'<circle cx="100" cy="100" r="76" class="'+colors[i]+'"/>':
   '<path d="M100 100 L'+start.x.toFixed(2)+' '+start.y.toFixed(2)+' A76 76 0 '+(share>.5?'1':'0')+' 1 '+end.x.toFixed(2)+' '+end.y.toFixed(2)+' Z" class="'+colors[i]+'"/>';
  slices.push('<g>'+shape+'<title>'+esc(label+' · '+(share*100).toLocaleString('id-ID',{maximumFractionDigits:1})+'% · '+money(val))+'</title></g>');
  legend.push('<div class="pfa-pie-legend-row"><span><i class="'+colors[i]+'"></i>'+esc(label)+'</span><b>'+esc((share*100).toLocaleString('id-ID',{maximumFractionDigits:1}))+'%</b></div>');
 });
 return'<div class="pfa-pie-wrap"><svg class="pfa-pie" viewBox="0 0 200 200" role="img" aria-label="Persentase nilai pembelian barang menurut kategori pada '+esc(monthLabel(periodValue()))+'">'+slices.join('')+'</svg>'+
 '<div class="pfa-pie-legend">'+legend.join('')+'</div></div>'+
 '<div class="pfa-pie-total">Total barang berkategori <strong>'+esc(money(sum))+'</strong></div>'+
 ((excluded>0||corrections>0)?'<p class="pfa-pie-note">'+(excluded>0?'Biaya nonbarang '+esc(money(excluded))+' tidak masuk porsi. ':'')+(corrections>0?corrections+' transaksi koreksi negatif tidak dihitung.':'')+'</p>':'');
}
function ensureMonthlyTrend(){
 var p=periodValue(),months=trendMonths(p);if(!months.length||!db)return;
 var key=p;
 var pending=months.filter(function(m){return catalogHasPeriod(m.key)&&!trendCacheFresh(m.key)});
 if(!pending.length){paintMonthlyTrend();return}
 if(trendLoadingKey===key)return;
 var token=++trendLoadSequence;trendLoadingKey=key;
 paintMonthlyTrend();
 var index=0,failed=0;
 async function worker(){
  while(index<pending.length){
   var item=pending[index++],cached=purchaseTrendCache[item.key];
   try{var q=await purchasePack(item.key);if(q.error)throw q.error;rememberTrendMonth(item.key,(q.data||{}).rows)}
   catch(e){failed++;if(!cached)purchaseTrendCache[item.key]={value:null,count:0,seen:Date.now(),error:true};if(console&&console.warn)console.warn('Monthly Purchase trend read '+item.key+':',e)}
   if(token!==trendLoadSequence)return;
  }
 }
 Promise.all([worker(),worker(),worker()]).then(function(){if(token===trendLoadSequence){trendLoadingKey='';paintMonthlyTrend();if(failed&&console&&console.warn)console.warn('Purchase trend: '+failed+' months unavailable')}})
}
function paintMonthlyTrend(){
 var slot=document.getElementById('pfaMonthlyTrend');if(!slot||purchaseView!=='summary')return;
 var markup=monthlyTrendMarkup();if(slot.innerHTML!==markup)slot.innerHTML=markup;
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
 '<div class="pfa-note-banner">Metode kanonis belum dapat menguraikan transaksi dengan beberapa sumber dana E–H tanpa breakdown yang sudah tersimpan. BELUM_DIPETAKAN bukan otomatis Tunai.</div>';
}
function purchaseJournalReconciliation(){
 var canonical=n(control.purchase_rows),journal=n(control.journal_rows),gap=n(control.purchase_journal_delta);
 var okay=control.finance_link_status==='MATCH'&&journal>=canonical&&Math.abs(gap)<0.01;
 return'<div class="pfa-note-banner" role="status"><b>'+(okay?'Jurnal cocok dengan Pembelian kanonis':'Jurnal Pembelian masih perlu rekonsiliasi')+
 '</b> · '+canonical+' transaksi sumber · '+journal+' entri jurnal · Selisih '+esc(money(Math.abs(gap)))+
 (n(control.provisional_journal_rows)>0?' · '+n(control.provisional_journal_rows)+' entri provisi perlu review':'')+
 '. B OPERASIONAL bukan Pembelian kedua.</div>';
}
function infographicMarkup(){
 // Header quick switch is the sole Owner navigation. Preserve the documentary
 // entry host (not displayed) until its workflow is migrated into Notifications.
 return'<div class="pfa-view-panels">'+
 '<section class="pfa-view-panel" role="region" aria-label="Ringkasan Pembelian" id="pfaPanel-summary" data-pfa-view-panel="summary"'+(purchaseView==='summary'?'':' hidden')+'>'+
 '<div class="pfa-insights-grid"><article class="pfa-insight-panel"><h3>Tren Pembelian Bulanan</h3><p>Nilai Pembelian Januari–'+esc(monthLabel(periodValue()))+'</p><div id="pfaMonthlyTrend">'+monthlyTrendMarkup()+'</div></article>'+
 '<article class="pfa-insight-panel"><h3>Porsi Pembelian</h3><p>Persentase nilai per jenis barang · '+esc(monthLabel(periodValue()))+'</p>'+purchasePieMarkup()+'</article></div></section>'+
 '<section class="pfa-view-panel" role="region" aria-label="Kategori dan Item Pembelian" id="pfaPanel-items" data-pfa-view-panel="items"'+(purchaseView==='items'?'':' hidden')+'>'+
 '<div class="pfa-insight-two"><article class="pfa-insight-panel"><h3>Komposisi Pembelian</h3><p>Nilai per akun Beban untuk '+esc(cutLabel())+'</p>'+chartMarkup()+'</article>'+
 '<article class="pfa-insight-panel"><h3>Top 5 Item Pembelian</h3><p>Urutan berdasarkan total nilai sumber</p>'+purchaseTopMarkup()+'</article></div></section>'+
 '<section class="pfa-view-panel" role="region" aria-label="Pembayaran dan Kontrol" id="pfaPanel-payments" data-pfa-view-panel="payments"'+(purchaseView==='payments'?'':' hidden')+'>'+
 '<div class="pfa-insight-two"><article class="pfa-insight-panel"><h3>Komposisi Pembayaran</h3><p>Sumber pembiayaan dari transaksi kanonis</p>'+purchasePaymentMarkup()+'</article>'+
 '<article class="pfa-insight-panel"><h3>Kontrol Data Berkualitas</h3><p>Review dan bukti Owner dipisah dari posting</p>'+
 '<div class="pfa-note-banner"><b>'+esc(String(n(control.stock_review_rows)+n(control.provisional_journal_rows)))+' kandidat perlu perhatian</b>. Lanjutkan pemeriksaan melalui Notifikasi; mengunggah Excel tidak otomatis memposting Stok.</div>'+
 '<button type="button" class="primary" data-pfa-notifications>Periksa di Notifikasi →</button></article></div></section></div>'+
 // Review workflows remain mounted for compatibility, not visible or navigable
 // here. Migrate them to Notifikasi in a separately tested future change.
 '<div id="pfaReviewSlot" class="pfa-review-list pfa-review-compat" hidden aria-hidden="true"><div class="pfa-note-banner pfa-review-safety">Penerimaan Stok hanya dibukukan setelah satuan dan bukti diperiksa. Review ini tidak melakukan posting Stok atau jurnal otomatis.</div>'+unitVerificationMarkup()+'</div>';
}
function mountOwnerControls(root,wrap,markup){
  // A native node move preserves #paPeriod value and Excel input event handlers.
  // Temporarily detach from old markup before replacing canonical content.
  var controls=root.querySelector('.pa-controls'),upload=root.querySelector('.pa-upload-wrap');
  // Both controls retain their original DOM identity, including file listeners.
  if(controls&&controls.parentNode!==root&&root.appendChild)root.appendChild(controls);
  if(upload&&upload.parentNode!==root&&root.appendChild)root.appendChild(upload);
  wrap.innerHTML=markup;
  var slot=wrap.querySelector('.pfa-controls-slot'),uploadSlot=wrap.querySelector('.pfa-upload-slot');
  if(slot&&controls)slot.appendChild(controls);
  if(uploadSlot&&upload)uploadSlot.appendChild(upload);
  else if(controls&&upload&&controls.appendChild)controls.appendChild(upload);
}
function purchaseSalesHeader(values,finance){
  var r=monthRange(),period=r?esc(r.from+' s/d '+r.to):'Periode belum tersedia';
  return'<div class="pfa-head pfa-sales-head"><div class="pfa-head-copy">'+
    '<div class="pfa-eyebrow">PURCHASE INTELLIGENCE</div><h2>Dashboard Pembelian</h2>'+
    '<p>Tren nilai pembelian, komposisi kategori, dan integrasi upload Excel.</p></div>'+
    '<div class="pfa-head-actions"><div class="pfa-upload-slot"></div>'+
    '<button type="button" class="pfa-summary-detail" data-pfa-detail-open="1">Lihat Detail Pembelian</button></div></div>'+
    '<div class="pfa-purchase-toolbar"><div class="pfa-purchase-period-left"><div class="pfa-controls-slot"></div>'+
    '<span class="pfa-purchase-period-meta">'+period+' · '+n(values.purchase_rows).toLocaleString('id-ID')+' transaksi</span></div>'+
    '<div class="pfa-purchase-toolbar-right"><span class="pfa-sync '+(finance?'ok':'warn')+'">'+(finance?'TERSINKRON':'PERLU PERIKSA')+'</span>'+
    '<div class="pfa-quick-switch" role="group" aria-label="Tampilan Pembelian">'+
    '<button type="button" data-pfa-view="summary" aria-pressed="'+(purchaseView==='summary'?'true':'false')+'" class="'+(purchaseView==='summary'?'active':'')+'">Ringkasan</button>'+
    '<button type="button" data-pfa-view="items" aria-pressed="'+(purchaseView==='items'?'true':'false')+'" class="'+(purchaseView==='items'?'active':'')+'">Kategori</button>'+
    '<button type="button" data-pfa-view="payments" aria-pressed="'+(purchaseView==='payments'?'true':'false')+'" class="'+(purchaseView==='payments'?'active':'')+'">Pembayaran &amp; Kontrol</button></div></div></div>';
}
function render(){
  if(unitOpen&&!unitAllowed())closeUnitReview();
  var root=document.getElementById('paRoot');if(!root)return;patchCore(root);syncPeriodOptions();
  var target=root.querySelector('.pa-controls');if(!target)return;
  var wrap=document.getElementById('purchaseFinanceAlignment');
  if(!wrap){wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';target.insertAdjacentElement('afterend',wrap)}
  if(loading){
    wrap.setAttribute('aria-busy','true');
    if(wrap.getAttribute('data-pfa-ready')==='1'){
      // Keep the current DOM and controls mounted; only mask the old period when it changes.
      wrap.classList.toggle('pfa-period-loading',wrap.getAttribute('data-pfa-period')!==periodValue());
      wrap.classList.toggle('pfa-updating',wrap.getAttribute('data-pfa-period')===periodValue());
      return;
    }
    if(!wrap.querySelector('.pfa-firstload'))mountOwnerControls(root,wrap,'<div class="pfa-firstload" role="status"><div class="pfa-head pfa-sales-head"><div><div class="pfa-eyebrow">PURCHASE INTELLIGENCE</div><h2>Dashboard Pembelian</h2><p>Menyiapkan ringkasan pembelian…</p></div><div class="pfa-upload-slot"></div></div><div class="pfa-purchase-toolbar"><div class="pfa-purchase-period-left"><div class="pfa-controls-slot"></div></div></div><div class="pfa-firstload-cards"></div><div class="pfa-firstload-panel">Memuat data pembelian…</div></div>');
    return;
  }
  if(error){wrap.__pfaCanonicalMarkup=null;wrap.classList.remove('pfa-period-loading','pfa-updating');wrap.removeAttribute('data-pfa-ready');wrap.removeAttribute('aria-busy');mountOwnerControls(root,wrap,'<div class="pfa-head pfa-sales-head"><div><div class="pfa-eyebrow">PURCHASE INTELLIGENCE</div><h2>Dashboard Pembelian</h2><p class="pfa-error">'+esc(error)+'</p></div><div class="pfa-head-actions"><div class="pfa-upload-slot"></div><button id="pfaRetry" type="button">Muat ulang</button></div></div><div class="pfa-purchase-toolbar"><div class="pfa-purchase-period-left"><div class="pfa-controls-slot"></div></div></div>');var rb=document.getElementById('pfaRetry');if(rb)rb.onclick=function(){load(true)};return}
  var v=summaryValues(),finance=control.finance_link_status==='MATCH';
  var nextMarkup=purchaseSalesHeader(v,finance)+
    '<div class="pfa-cards">'+
      card('Total Pembelian',money(v.total_purchase_amount),n(v.purchase_rows).toLocaleString('id-ID')+' transaksi','total')+
      card('Inventory',money(v.inventory_amount),n(v.inventory_rows).toLocaleString('id-ID')+' transaksi','inventory')+
      card('Operasional',money(v.operating_amount),n(v.operating_rows).toLocaleString('id-ID')+' transaksi','expense')+
      card('Review',money(v.review_amount),n(v.review_rows).toLocaleString('id-ID')+' transaksi','review')+
    '</div>'+
    purchaseJournalReconciliation()+
    infographicMarkup()+
    modalMarkup();
  // Review controls mount asynchronously into #pfaReviewSlot. Avoid comparing live
  // innerHTML to the template: add-on controls make them differ on every repaint.
  if(wrap.__pfaCanonicalMarkup!==nextMarkup){
    mountOwnerControls(root,wrap,nextMarkup);
    wrap.__pfaCanonicalMarkup=nextMarkup;
  }
  wrap.setAttribute('data-pfa-ready','1');
  wrap.setAttribute('data-pfa-period',periodValue());
  wrap.setAttribute('aria-busy','false');
  wrap.classList.remove('pfa-period-loading','pfa-updating');
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
    loadedAt=Date.now();loadedPeriod=p;rememberTrendMonth(p,rows);
  }catch(e){if(seq!==requestSeq)return;rows=[];control={};overview=null;chartRows=[];loadedPeriod='';loadedAt=0;error='Gagal memuat ringkasan Pembelian: '+(e&&e.message?e.message:String(e))}
  finally{if(seq===requestSeq){loading=false;render();if(!error)ensureMonthlyTrend()}else{loading=false;setTimeout(function(){if(periodValue())load(true)},0)}}
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
    rows=nr;control=nc;overview=no;chartRows=chart;periods=ps;loadedAt=Date.now();loadedPeriod=p;error='';rememberTrendMonth(p,rows);
    if(changed){render();ensureMonthlyTrend()}
  }finally{syncing=false}
}
function registerSync(){var s=window.__HASNARIA_DATA_SYNC;if(s)s.register('owner-purchase-report',syncReport)}
registerSync();window.addEventListener('hasnaria:data-sync-ready',registerSync);
function resetData(){trendLoadSequence++;trendLoadingKey='';rows=[];control={};overview=null;chartRows=[];loadedAt=0;loadedPeriod='';category='all';modalOpen=false;closeUnitReview()}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){if(!document.getElementById('paRoot'))return;if(!document.getElementById('purchaseFinanceAlignment'))render();if(!loading&&(loadedPeriod!==periodValue()||(loadedAt&&Date.now()-loadedAt>60000)))load(false)},80)}
window.__HASNARIA_PURCHASE_FINANCE_REFRESH=syncReport;
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var host=document.getElementById('pembelian');if(db&&host){
    observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});
    document.addEventListener('change',function(e){if(!e.target)return;if(e.target.id==='paPeriod'){resetData();lastStockSync='';load(true);return}if(e.target.id==='pfaCategory'){category=e.target.value;render()}},true);
    document.addEventListener('click',function(e){
      var view=e.target&&e.target.closest?e.target.closest('[data-pfa-view]'):null;
      if(view){
        var nextView=view.getAttribute('data-pfa-view');
        if(['summary','items','payments'].indexOf(nextView)<0)return;
        purchaseView=nextView;
        document.querySelectorAll('#purchaseFinanceAlignment [data-pfa-view]').forEach(function(b){
          var on=b.getAttribute('data-pfa-view')===purchaseView;
          b.classList.toggle('active',on);
          if(b.hasAttribute&&b.hasAttribute('aria-pressed'))b.setAttribute('aria-pressed',on?'true':'false');
        });
        document.querySelectorAll('#purchaseFinanceAlignment [data-pfa-view-panel]').forEach(function(p){p.hidden=p.getAttribute('data-pfa-view-panel')!==purchaseView});
        if(purchaseView==='summary')ensureMonthlyTrend();
        return;
      }
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
      // Opening a file picker is not an import: only the confirmed purchase-imported event refreshes data.
      if(!b.matches('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn'))setTimeout(schedule,120)
    },true);
    document.addEventListener('input',function(e){var key=e.target&&e.target.getAttribute&&e.target.getAttribute('data-pfa-unit-field');if(key&&Object.prototype.hasOwnProperty.call(unitDraft,key)){unitDraft[key]=e.target.value;unitPreview=null;var save=document.querySelector('[data-pfa-unit-apply]');if(save)save.disabled=true;var p=document.querySelector('.pfa-unit-preview');if(p)p.textContent='Input berubah. Jalankan pratinjau ulang sebelum menyimpan.'}},true);
    document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(unitOpen){closeUnitReview();render()}else if(modalOpen){modalOpen=false;render()}}},true);
    document.addEventListener('hasnaria:purchase-imported',function(e){purchaseTrendCache={};resetData();loadPeriods().then(function(){var p=e&&e.detail&&String(e.detail.period||'').slice(0,7),sel=document.getElementById('paPeriod');if(sel&&p&&Array.from(sel.options).some(function(o){return o.value===p}))sel.value=p;load(true)})},true);
    loadPeriods().then(function(){load(true)});return
  }if(tries++<150)setTimeout(wait,100)})()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
