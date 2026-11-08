/* HASNARIA Owner-only Majoo recipe import: staging evidence, never live BOM writes. */
(function(root){
'use strict';
if(root.__HASNARIA_RECIPE_IMPORT_V1)return;
var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var TOKYO='bnnhmtkpdjlgehsvgoda.supabase.co';
var PROD_HOSTS=['hasnaria-business-analyzer.vercel.app','hasnaria-business-analyzer-ekariashoesanti-9951s-projects.vercel.app'];
var state={open:false,busy:false,error:'',notice:'',file:null,hash:'',parsed:null,comparison:null,
  savedBatch:'',saving:false,dbData:null,step:'idle',history:null,historyBusy:false,historyError:'',verifiedLines:null,receipt:null,pendingBatch:''};
var dialog=null,enginePromise=null,stylePromise=null,excelPromise=null;
function owner(){var ctx=root.__HASNARIA_CONTEXT;return !!(ctx&&ctx.role==='owner');}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function productionTarget(){
 var host=root.location&&root.location.hostname;
 return PROD_HOSTS.includes(host)&&String(root.HASNARIA_SB||'').includes(TOKYO);
}
function db(){if(!root.__HASNARIA_DB)throw Error('Koneksi database tidak tersedia; login ulang.');return root.__HASNARIA_DB;}
function ensureStyles(){
 if(stylePromise)return stylePromise;
 stylePromise=new Promise(function(resolve,reject){
  var l=document.getElementById('hsri-css');
  if(l&&l.sheet){resolve();return;}
  if(!l){l=document.createElement('link');l.rel='stylesheet';l.id='hsri-css';
   l.href='/stock-recipe-import-v1.css?v=2';}
  l.addEventListener('load',function(){resolve();},{once:true});
  l.addEventListener('error',function(){reject(Error('Desain popup gagal dimuat. Silakan refresh halaman.'));},{once:true});
  if(!l.isConnected)document.head.appendChild(l);
 }).catch(function(e){stylePromise=null;throw e;});
 return stylePromise;
}
/* Stock must load its own pinned Excel parser even if Sales was never opened. */
function ensureExcelEngine(){
 if(root.XLSX&&typeof root.XLSX.read==='function')return Promise.resolve(root.XLSX);
 if(excelPromise)return excelPromise;
 excelPromise=(async function(){
  if(root.__HASNARIA_XLSX_READY){
   try{
    await Promise.race([
     Promise.resolve(root.__HASNARIA_XLSX_READY),
     new Promise(function(resolve){setTimeout(resolve,3000);})
    ]);
   }catch(_){}
   if(root.XLSX&&typeof root.XLSX.read==='function')return root.XLSX;
  }
  return await new Promise(function(resolve,reject){
   var script=document.createElement('script'),settled=false;
   var guard=setTimeout(function(){
    if(settled)return;settled=true;
    reject(Error('Parser Excel tidak merespons. Periksa koneksi cdn.sheetjs.com dan coba lagi.'));
   },15000);
   function finish(error){
    if(settled)return;settled=true;clearTimeout(guard);
    if(error)reject(error);
    else if(root.XLSX&&typeof root.XLSX.read==='function')resolve(root.XLSX);
    else reject(Error('Library Excel termuat tetapi XLSX.read tidak tersedia.'));
   }
   script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
   script.async=true;
   script.onload=function(){finish();};
   script.onerror=function(){finish(Error('Gagal memuat parser Excel. Periksa koneksi internet dan coba lagi.'));};
   document.head.appendChild(script);
  });
 })().catch(function(err){excelPromise=null;throw err;});
 return excelPromise;
}
function model(){
 if(root.__HASNARIA_RECIPE_IMPORT_MODEL_V1)return Promise.resolve(root.__HASNARIA_RECIPE_IMPORT_MODEL_V1);
 if(enginePromise)return enginePromise;
 enginePromise=new Promise(function(resolve,reject){
  var s=document.createElement('script');s.src='/stock-recipe-import-model-v1.js?v=1';s.async=true;
  s.onload=function(){var v=root.__HASNARIA_RECIPE_IMPORT_MODEL_V1;v?resolve(v):reject(Error('Parser resep tidak termuat'));};
  s.onerror=function(){reject(Error('Gagal memuat parser resep'));};document.head.appendChild(s);
 }).catch(function(e){enginePromise=null;throw e;});
 return enginePromise;
}
function reason(x){
 var labels={
  PRODUCT_AMBIGUOUS:'Produk ambigu',PRODUCT_UNRESOLVED:'Produk belum terpetakan',
  NAME_ONLY_REVIEW:'Cocok berdasarkan nama; SKU belum disahkan',
  INGREDIENT_AMBIGUOUS:'Bahan ambigu',INGREDIENT_UNRESOLVED:'Bahan belum terpetakan',
  UNIT_REVIEW:'Satuan berbeda',NEW_COMPONENT:'Komponen baru',DUPLICATE_CURRENT_BOM:'Duplikat di BOM lama',
  QTY_DIFFERENT:'Takaran berbeda',COMPONENT_NOT_VERIFIED:'Komponen lama belum verified',
  RECIPE_NOT_APPROVED:'Resep draft / belum approved'
 };return (x||[]).map(function(k){return labels[k]||k;}).join(' · ');}
function transferState(){
 var steps={idle:['Belum ada file diproses','idle'],reading:['Membaca dan memvalidasi Excel','active'],
    comparing:['Mencocokkan SKU, BOM, dan bahan Tokyo','active'],
    ready:['Pratinjau lengkap · siap disimpan sebagai usulan','ready'],
    saving:['Mengirim usulan resep ke database Tokyo','active'],
    verifying:['Memeriksa kembali jumlah baris di database','active'],
    saved:['Tersimpan & terverifikasi di database Tokyo','done'],
    already:['File ini sudah tersimpan · tidak diunggah ulang','done'],
    unconfirmed:['Penyimpanan belum dapat dikonfirmasi','warning'],
    failed:['Proses belum berhasil','warning']};
 return steps[state.step]||steps.idle;
}
function receiptSummary(){
 var t=transferState(),p=state.parsed;
 var count=p&&p.rows?p.rows.length:0,verified=state.verifiedLines;
 var label=(state.step==='saved'||state.step==='already')&&verified!==null?
   ' · '+verified+'/'+count+' baris terverifikasi':'';
 var body='<div class="hsri-transfer hsri-transfer-'+t[1]+'" role="status" aria-live="polite">'+
   '<div class="hsri-transfer-header"><b>'+esc(t[0]+label)+'</b>'+
   (state.saving?'<span class="hsri-spinner" aria-hidden="true"></span>':'')+'</div>'+
   '<div class="hsri-stepper"><span class="'+(state.step==='reading'?'hsri-step-active':'')+'">1 · Baca file</span>'+
   '<span class="'+(state.step==='comparing'?'hsri-step-active':'')+'">2 · Cocokkan</span>'+
   '<span class="'+(state.step==='saving'?'hsri-step-active':'')+'">3 · Simpan</span>'+
   '<span class="'+(state.step==='verifying'?'hsri-step-active':'')+'">4 · Verifikasi</span></div>'+
   (state.savedBatch?'<small>Batch terverifikasi: '+esc(state.savedBatch)+' · status under_review</small>':'')+
   '</div>';
 return body;
}
function historySummary(){
 if(state.historyBusy)return '<div class="hsri-history"><strong>Riwayat impor</strong><span>Memeriksa unggahan terakhir…</span></div>';
 if(state.historyError)return '<div class="hsri-history"><strong>Riwayat impor</strong><span>'+esc(state.historyError)+'</span>'+
  '<button type="button" data-hsri-history>Coba lagi</button></div>';
 if(!Array.isArray(state.history))return '';
 if(!state.history.length)return '<div class="hsri-history"><strong>Riwayat impor</strong><span>Belum ada file resep tersimpan.</span></div>';
 var last=state.history[0],valid=last.verified_count===last.source_row_count,
  status=valid?'Terverifikasi':'Perlu pemeriksaan';
 return '<div class="hsri-history"><strong>Riwayat impor terakhir</strong>'+
  '<div class="hsri-history-detail"><span>'+esc(last.source_filename)+'</span>'+
  '<b>'+esc(last.verified_count)+'/'+esc(last.source_row_count)+' baris · '+esc(status)+'</b>'+
  '<small>Batch '+esc(last.id)+' · '+esc(last.status)+'</small></div></div>';
}
function render(){
 if(!state.open||!dialog)return;
 var p=state.parsed,c=state.comparison;
 var table=c?c.products.slice(0,100).map(function(r){
  return '<tr><td>'+esc(r.sku)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.quantity_sold)+'</td>'+
   '<td>'+esc(r.component_count)+'</td><td>'+esc(reason(r.reasons)||'Cocok secara struktural — tetap review Owner')+'</td></tr>';
 }).join(''):'';
 var raw=c?c.rows.filter(function(r){return r.reason_codes.includes('UNIT_REVIEW')||
   r.reason_codes.includes('INGREDIENT_UNRESOLVED')||r.reason_codes.includes('INGREDIENT_AMBIGUOUS');}).slice(0,30).map(function(r){
   return '<tr><td>'+esc(r.ingredient_code)+'</td><td>'+esc(r.ingredient_name)+'</td>'+
    '<td>'+esc(r.source_qty)+' '+esc(r.source_unit)+'</td><td>'+esc(r.inventory_name||'—')+
    ' ('+esc(r.inventory_unit||'—')+')</td><td>'+esc(reason(r.reason_codes))+'</td></tr>';
 }).join(''):'';
 dialog.innerHTML='<div class="hsri-backdrop"><section class="hsri-panel" role="dialog" aria-modal="true" aria-labelledby="hsriTitle">'+
 '<header class="hsri-header"><div class="hsri-heading"><small>STOK / RESEP PRODUK</small><h3 id="hsriTitle">Impor &amp; Review Resep</h3>'+
 '<p>Bandingkan sumber Majoo dengan BOM Tokyo. File hanya disimpan sebagai usulan, tidak mengubah stok.</p></div>'+
 '<button type="button" class="hsri-close" data-hsri-close aria-label="Tutup" '+(state.busy||state.saving?'disabled':'')+'>×</button></header>'+
 (state.error?'<div class="hsri-error" role="alert">'+esc(state.error)+'</div>':'')+
 (state.notice?'<div class="hsri-notice" role="status">'+esc(state.notice)+'</div>':'')+
 receiptSummary()+
 '<div class="hsri-upload"><div class="hsri-upload-copy"><strong>File Resep Produk Majoo (.xlsx)</strong>'+
 '<small>Pilih ekspor asli berisi 3 sheet. Maksimal 5 MB.</small>'+
 '<span class="hsri-file-name" aria-live="polite">'+esc(state.file?'✓ '+state.file.name:'Belum ada file dipilih')+'</span></div>'+
 '<input id="hsriFile" class="hsri-file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" tabindex="-1" aria-label="File resep Majoo" '+(state.busy||state.saving?'disabled':'')+'>'+
 '<button type="button" class="hsri-choose" data-hsri-choose '+(state.busy||state.saving?'disabled':'')+'>Pilih File Excel</button></div>'+
 (state.parserStatus==='loading'?'<div class="hsri-loader" role="status">Menyiapkan parser Excel…</div>':'')+
 (state.busy?'<div class="hsri-loading">Memvalidasi workbook dan mencocokkan master Tokyo…</div>':'')+
 (p?'<div class="hsri-kpis"><div><b>'+esc(p.source_skus)+'</b><span>SKU ekspor</span></div>'+
 '<div><b>'+esc(p.rows.length)+'</b><span>Komponen</span></div>'+
 '<div><b>'+esc(c?c.product_review_count:'—')+'</b><span>Perlu review</span></div>'+
 '<div><b>'+esc(c?c.ingredient_unresolved_count:'—')+'</b><span>Baris bahan belum cocok</span></div></div>'+
 '<p class="hsri-caption">Waktu ekspor: '+esc(p.exported_at)+' · Outlet: '+esc(p.source_outlet)+
 ' · SHA-256: '+esc(state.hash.slice(0,16))+'…</p>':'')+
 (c?'<h4>Prioritas pemeriksaan resep · urut Qty Majoo Oktober</h4><div class="hsri-table-wrap"><table><thead>'+
 '<tr><th>SKU</th><th>Produk</th><th>Qty terjual</th><th>Bahan</th><th>Status</th></tr></thead><tbody>'+table+'</tbody></table></div>'+
 '<h4>Detail bahan / satuan yang perlu diselesaikan</h4><div class="hsri-table-wrap"><table><thead>'+
 '<tr><th>SKU bahan</th><th>Nama bahan</th><th>Resep Majoo</th><th>Inventory Tokyo</th><th>Validasi</th></tr></thead>'+
 '<tbody>'+raw+'</tbody></table></div>':'')+
 historySummary()+
 '<footer><span>Semua data tetap <b>under_review</b>. Tidak ada pengurangan stok atau persetujuan BOM otomatis.</span>'+
 (state.savedBatch?'<span>Batch: '+esc(state.savedBatch.slice(0,12))+'…</span>':'')+
 (state.step==='unconfirmed'?'<button type="button" data-hsri-recheck '+(state.busy||state.saving?'disabled':'')+'>Periksa Status</button>':'')+
 '<button type="button" data-hsri-save '+(!p||!c||!productionTarget()||!owner()||state.saving||state.busy||!!state.savedBatch||state.step==='unconfirmed'?'disabled':'')+'>'+
 (state.saving?'Memproses…':state.savedBatch?'Sudah Tersimpan':'Simpan Usulan Resep (Owner)')+'</button></footer>'+
 (!productionTarget()?'<p class="hsri-warning">Preview atau koneksi backend bukan produksi resmi; penyimpanan diblokir. Gunakan deployment produksi setelah lulus UAT.</p>':'')+
 '</section></div>';
}
function close(){
 if(state.busy||state.saving)return;
 state.open=false;state.file=null;state.parsed=null;state.comparison=null;state.dbData=null;
 document.removeEventListener('keydown',onEscape,true);
 if(dialog){dialog.remove();dialog=null;}
}
async function loadDatabase(){
 var d=db();
 var requests=await Promise.all([
  d.from('products').select('id,name,sku,active').eq('brand_id',BRAND).limit(500),
  d.from('inventory_items').select('id,item_name,unit').eq('brand_id',BRAND).limit(1000),
  d.from('inventory_recipe_components').select('product_id,inventory_item_id,qty_per_sale,active,bom_status').eq('brand_id',BRAND).limit(1000),
  d.from('product_recipe_verifications').select('product_id,status').eq('brand_id',BRAND).limit(500),
  d.from('sales_product_report_batches').select('id,period_month,source_row_count,status').eq('brand_id',BRAND).order('created_at',{ascending:false}).limit(20),
  d.from('outlets').select('id,name,brand_id').eq('brand_id',BRAND).limit(5)
 ]);
 requests.forEach(function(r,i){if(r.error)throw Error('Gagal mengambil master '+(i+1)+': '+r.error.message);});
 var batches=requests[4].data||[],chosen=batches.find(function(x){return String(x.period_month).slice(0,7)==='2026-10';});
 var sold=[];
 if(chosen){
  var req=await d.from('sales_product_report_lines').select('source_sku,source_product_name,quantity').eq('batch_id',chosen.id).limit(500);
  if(req.error)throw Error('Gagal membaca Qty Majoo: '+req.error.message);
  sold=req.data||[];
 }
 var outlets=requests[5].data||[];
 if(outlets.length!==1)throw Error('Outlet aktif harus tepat satu; hentikan untuk menghindari salah outlet.');
 return {products:requests[0].data||[],items:requests[1].data||[],components:requests[2].data||[],
  approvals:requests[3].data||[],sold:sold,outlet:outlets[0]};
}
async function countLines(batchId){
 var q=await db().from('recipe_import_lines_v1').select('line_no',{count:'exact',head:true}).eq('batch_id',batchId);
 if(q.error)throw Error('Gagal membaca jumlah baris tersimpan: '+q.error.message);
 if(typeof q.count!=='number')throw Error('Database tidak mengembalikan hitungan baris');
 return q.count;
}
async function verifyReceipt(batchId,hash,expected){
 var q=await db().from('recipe_import_batches_v1')
  .select('id,file_sha256,source_row_count,status,source_filename,created_at')
  .eq('id',batchId).eq('brand_id',BRAND).maybeSingle();
 if(q.error)throw Error('Gagal memeriksa batch: '+q.error.message);
 var b=q.data;
 if(!b||b.file_sha256!==hash||b.status!=='under_review'||b.source_row_count!==expected)
  throw Error('Batch tersimpan tidak sesuai sumber file yang dipilih');
 var actual=await countLines(batchId);
 if(actual!==expected)throw Error('Jumlah baris tersimpan '+actual+' berbeda dari '+expected+' baris file');
 return {batch:b,actual:actual};
}
async function loadHistory(){
 if(!state.open||!owner())return;
 state.historyBusy=true;state.historyError='';render();
 try{
  var q=await db().from('recipe_import_batches_v1')
   .select('id,file_sha256,source_row_count,source_filename,status,created_at')
   .eq('brand_id',BRAND).order('created_at',{ascending:false}).limit(3);
  if(q.error)throw Error(q.error.message);
  var rows=q.data||[];
  if(rows.length)rows[0].verified_count=await countLines(rows[0].id);
  state.history=rows;
 }catch(e){state.historyError='Riwayat gagal dimuat: '+(e&&e.message?e.message:String(e));}
 finally{state.historyBusy=false;if(state.open)render();}
}
async function read(file){
 if(!owner()||!file)return;
 state.error='';state.notice='';state.file=file;state.parsed=null;state.comparison=null;
 state.savedBatch='';state.verifiedLines=null;state.receipt=null;state.pendingBatch='';
 state.step='reading';state.busy=true;render();
 try{
  if(!/\.xlsx$/i.test(file.name))throw Error('Pilih ekspor resep berformat .xlsx');
  if(file.size<100||file.size>5*1024*1024)throw Error('Ukuran file harus 100 B – 5 MB');
  var m=await model();
  var xlsx=await ensureExcelEngine();
  if(!root.crypto||!root.crypto.subtle)throw Error('SHA-256 memerlukan HTTPS / peramban modern');
  var buffer=await file.arrayBuffer();
  var digest=await root.crypto.subtle.digest('SHA-256',buffer);
  var hash=Array.from(new Uint8Array(digest)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  var w=xlsx.read(buffer,{type:'array',cellDates:false});
  var sheets={};
  ['Ekspor Resep','Daftar Bahan','Daftar Master Resep'].forEach(function(name){
   var exact=w.SheetNames.find(function(x){return x.trim().toLowerCase()===name.toLowerCase();});
   if(!exact)throw Error('Sheet tidak ada: '+name);
   sheets[name]=xlsx.utils.sheet_to_json(w.Sheets[exact],{header:1,raw:true,defval:''});
  });
  var parsed=m.parse(sheets);
  state.step='comparing';render();
  var data=await loadDatabase();
  if(String(data.outlet.name).toLocaleLowerCase('id-ID')===''){
    throw Error('Nama outlet tidak tersedia');
  }
  if(parsed.source_outlet!=='hasnaria ice cream')throw Error('Outlet ekspor tidak cocok dengan HASNARIA; tidak boleh digabung.');
  state.dbData=data;state.hash=hash;state.parsed=parsed;state.comparison=m.compare(parsed,data);
  var existing=await db().from('recipe_import_batches_v1')
    .select('id,file_sha256,source_row_count,status').eq('brand_id',BRAND)
    .eq('file_sha256',hash).limit(2);
  if(existing.error)throw new Error('Gagal memeriksa apakah file sudah tersimpan: '+existing.error.message);
  if((existing.data||[]).length>1)throw Error('File duplikat ambigu; hentikan untuk audit');
  if(existing.data&&existing.data.length){
    var receipt=await verifyReceipt(existing.data[0].id,hash,parsed.rows.length);
    state.savedBatch=receipt.batch.id;state.verifiedLines=receipt.actual;state.receipt=receipt.batch;
    state.step='already';state.notice='';
  }else{
    state.step='ready';
    state.notice='Pratinjau berhasil. Data belum disimpan; klik Simpan Usulan Resep untuk mengunggah.';
  }
 }catch(e){
  state.step='failed';state.error=e&&e.message?e.message:String(e);state.parsed=null;state.comparison=null;
 }finally{state.busy=false;render();}
}
async function stage(){
 if(!owner()||!productionTarget()||!state.parsed||!state.comparison||
    state.saving||state.savedBatch||state.step==='unconfirmed')return;
 state.saving=true;state.error='';state.notice='';state.step='saving';render();
 try{
  var f=state.file,p=state.parsed,data=state.dbData;
  if(!data||!data.outlet||!data.outlet.id)throw Error('Outlet belum diverifikasi');
  var response=await db().rpc('stage_recipe_import_v1',{
   p_brand:BRAND,p_outlet:data.outlet.id,p_filename:f.name,p_file_sha256:state.hash,
   p_exported_at:p.exported_at,p_source_outlet:p.source_outlet,p_rows:p.rows
  });
  if(response.error)throw response.error;
  var result=response.data||{};
  if(!result.batch_id)throw Error('Respons database tidak berisi batch ID');
  state.pendingBatch=result.batch_id;state.step='verifying';render();
  var verified=await verifyReceipt(result.batch_id,state.hash,p.rows.length);
  state.savedBatch=result.batch_id;state.verifiedLines=verified.actual;state.receipt=verified.batch;
  state.step='saved';state.pendingBatch='';
  state.notice='Berhasil: '+verified.actual+'/'+p.rows.length+
    ' baris tersimpan dan terbaca kembali dari database Tokyo. BOM serta stok tidak berubah.';
  await loadHistory();
 }catch(e){
  state.step='unconfirmed';
  state.error='Belum bisa memastikan hasil penyimpanan: '+(e&&e.message?e.message:String(e))+
    '. Jangan unggah ulang dulu; gunakan Periksa Status.';
 }finally{state.saving=false;render();}
}
async function recheck(){
 if(!owner()||state.saving||state.busy)return;
 state.busy=true;state.error='';state.step='verifying';render();
 try{
  var p=state.parsed,hash=state.hash;
  if(!p||!hash)throw Error('Pilih kembali file sumber untuk verifikasi');
  var q=await db().from('recipe_import_batches_v1')
    .select('id,file_sha256,source_row_count,status').eq('brand_id',BRAND)
    .eq('file_sha256',hash).limit(2);
  if(q.error)throw Error(q.error.message);
  if(!q.data||!q.data.length){
    state.step='ready';state.notice='Belum ada batch di server untuk file ini. Anda boleh menyimpan usulan.';
    return;
  }
  if(q.data.length!==1)throw Error('Ditemukan batch ambigu');
  var result=await verifyReceipt(q.data[0].id,hash,p.rows.length);
  state.savedBatch=result.batch.id;state.verifiedLines=result.actual;state.receipt=result.batch;
  state.step='already';state.notice=result.actual+'/'+p.rows.length+' baris sudah tersimpan sebelumnya.';
  await loadHistory();
 }catch(e){state.step='unconfirmed';state.error=e&&e.message?e.message:String(e);}
 finally{state.busy=false;render();}
}
function open(){
 if(!owner())return;
 if(state.open)return;
 state={open:true,busy:false,error:'',notice:'',file:null,hash:'',parsed:null,
  comparison:null,savedBatch:'',saving:false,dbData:null,parserStatus:'loading',
  step:'idle',history:null,historyBusy:false,historyError:'',verifiedLines:null,
  receipt:null,pendingBatch:''};
 dialog=document.createElement('div');dialog.id='hsri-root';document.body.appendChild(dialog);
 ensureStyles().then(function(){
  if(!state.open)return;
  render();
  loadHistory();
  ensureExcelEngine().then(function(){
   if(!state.open)return;
   state.parserStatus='ready';render();
  }).catch(function(error){
   if(!state.open)return;
   state.parserStatus='error';
   state.error=(error&&error.message?error.message:String(error))+' Pilih ulang file untuk mencoba kembali.';
   render();
  });
 }).catch(function(error){if(state.open){state.error=error&&error.message?error.message:String(error);render();}});
 dialog.addEventListener('change',function(ev){
  if(ev.target&&ev.target.id==='hsriFile'&&ev.target.files&&ev.target.files[0])read(ev.target.files[0]);
 });
 dialog.addEventListener('click',function(ev){
  if(ev.target.closest('[data-hsri-close]')){close();return;}
  if(ev.target.closest('[data-hsri-choose]')){
   var fileInput=dialog&&dialog.querySelector('#hsriFile');
   if(fileInput&&!fileInput.disabled)fileInput.click();
   return;
  }
  if(ev.target.closest('[data-hsri-save]')){stage();return;}
  if(ev.target.closest('[data-hsri-recheck]')){recheck();return;}
  if(ev.target.closest('[data-hsri-history]')){loadHistory();return;}
 });
 document.addEventListener('keydown',onEscape,true);
 render();
}
function onEscape(e){if(e.key==='Escape'&&state.open&&!state.busy&&!state.saving){document.removeEventListener('keydown',onEscape,true);close();}}
root.__HASNARIA_RECIPE_IMPORT_V1={open:open};
})(window);
