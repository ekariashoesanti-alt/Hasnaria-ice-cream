/* HASNARIA Owner-only Majoo recipe import: staging evidence, never live BOM writes. */
(function(root){
'use strict';
if(root.__HASNARIA_RECIPE_IMPORT_V1)return;
var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var TOKYO='bnnhmtkpdjlgehsvgoda.supabase.co';
var PROD_HOSTS=['hasnaria-business-analyzer.vercel.app','hasnaria-business-analyzer-ekariashoesanti-9951s-projects.vercel.app'];
var state={open:false,busy:false,error:'',notice:'',file:null,hash:'',parsed:null,comparison:null,
  savedBatch:'',saving:false,dbData:null};
var dialog=null,enginePromise=null;
function owner(){var ctx=root.__HASNARIA_CONTEXT;return !!(ctx&&ctx.role==='owner');}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function productionTarget(){
 var host=root.location&&root.location.hostname;
 return PROD_HOSTS.includes(host)&&String(root.HASNARIA_SB||'').includes(TOKYO);
}
function db(){if(!root.__HASNARIA_DB)throw Error('Koneksi database tidak tersedia; login ulang.');return root.__HASNARIA_DB;}
function ensureStyles(){
 if(document.getElementById('hsri-css'))return;
 var l=document.createElement('link');l.rel='stylesheet';l.id='hsri-css';
 l.href='/stock-recipe-import-v1.css?v=1';document.head.appendChild(l);
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
 '<header><div><small>STOK · REVIEW RESEP MAJOO</small><h3 id="hsriTitle">Impor &amp; Review Resep Produk</h3>'+
 '<p>Sumber Majoo dibandingkan dengan BOM Tokyo. Penyimpanan hanya sebagai bukti review — tidak mengubah resep aktif, ledger, HPP atau stok.</p></div>'+
 '<button type="button" data-hsri-close aria-label="Tutup" '+(state.busy||state.saving?'disabled':'')+'>×</button></header>'+
 (state.error?'<div class="hsri-error" role="alert">'+esc(state.error)+'</div>':'')+
 (state.notice?'<div class="hsri-notice" role="status">'+esc(state.notice)+'</div>':'')+
 '<div class="hsri-controls"><label>Ekspor Resep Produk Majoo (.xlsx)'+
 '<input id="hsriFile" type="file" accept=".xlsx" '+(state.busy||state.saving?'disabled':'')+'></label>'+
 '<span>'+esc(state.file?state.file.name:'Belum ada file yang dipilih')+'</span></div>'+
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
 '<footer><span>Semua data tetap <b>under_review</b>. Tidak ada pengurangan stok atau persetujuan BOM otomatis.</span>'+
 (state.savedBatch?'<span>Batch: '+esc(state.savedBatch.slice(0,12))+'…</span>':'')+
 '<button type="button" data-hsri-save '+(!p||!c||!productionTarget()||!owner()||state.saving||state.busy||!!state.savedBatch?'disabled':'')+'>'+
 (state.saving?'Menyimpan…':'Simpan Usulan Resep (Owner)')+'</button></footer>'+
 (!productionTarget()?'<p class="hsri-warning">Preview atau koneksi backend bukan produksi resmi; penyimpanan diblokir. Gunakan deployment produksi setelah lulus UAT.</p>':'')+
 '</section></div>';
}
function close(){
 if(state.busy||state.saving)return;
 state.open=false;state.file=null;state.parsed=null;state.comparison=null;state.dbData=null;
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
async function read(file){
 if(!owner()||!file)return;
 state.error='';state.notice='';state.file=file;state.parsed=null;state.comparison=null;state.savedBatch='';
 state.busy=true;render();
 try{
  if(!/\.xlsx$/i.test(file.name))throw Error('Pilih ekspor resep berformat .xlsx');
  if(file.size<100||file.size>5*1024*1024)throw Error('Ukuran file harus 100 B – 5 MB');
  var m=await model();
  if(!root.XLSX&&root.__HASNARIA_XLSX_READY)await root.__HASNARIA_XLSX_READY;
  if(!root.XLSX)throw Error('Parser Excel belum siap; muat ulang halaman.');
  if(!root.crypto||!root.crypto.subtle)throw Error('SHA-256 memerlukan HTTPS / peramban modern');
  var buffer=await file.arrayBuffer();
  var digest=await root.crypto.subtle.digest('SHA-256',buffer);
  var hash=Array.from(new Uint8Array(digest)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  var w=root.XLSX.read(buffer,{type:'array',cellDates:false});
  var sheets={};
  ['Ekspor Resep','Daftar Bahan','Daftar Master Resep'].forEach(function(name){
   var exact=w.SheetNames.find(function(x){return x.trim().toLowerCase()===name.toLowerCase();});
   if(!exact)throw Error('Sheet tidak ada: '+name);
   sheets[name]=root.XLSX.utils.sheet_to_json(w.Sheets[exact],{header:1,raw:true,defval:''});
  });
  var parsed=m.parse(sheets),data=await loadDatabase();
  if(String(data.outlet.name).toLocaleLowerCase('id-ID')===''){
    throw Error('Nama outlet tidak tersedia');
  }
  if(parsed.source_outlet!=='hasnaria ice cream')throw Error('Outlet ekspor tidak cocok dengan HASNARIA; tidak boleh digabung.');
  state.dbData=data;state.hash=hash;state.parsed=parsed;state.comparison=m.compare(parsed,data);
  state.notice='Validasi struktur berhasil. Telusuri perbedaan sebelum menyimpan usulan.';
 }catch(e){state.error=e&&e.message?e.message:String(e);state.parsed=null;state.comparison=null;}
 finally{state.busy=false;render();}
}
async function stage(){
 if(!owner()||!productionTarget()||!state.parsed||!state.comparison||state.saving||state.savedBatch)return;
 state.saving=true;state.error='';render();
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
  state.savedBatch=result.batch_id;
  state.notice=result.reused?'File sama sudah ada; batch lama digunakan tanpa mutasi.':
   '153 atau lebih baris resep tersimpan dalam antrean review terisolasi. BOM dan stok tetap tidak berubah.';
 }catch(e){
  state.error='Status penyimpanan belum dapat dipastikan. Periksa hash di histori batch sebelum mencoba lagi: '+(e&&e.message?e.message:String(e));
 }finally{state.saving=false;render();}
}
function open(){
 if(!owner())return;
 if(state.open)return;
 state={open:true,busy:false,error:'',notice:'',file:null,hash:'',parsed:null,
  comparison:null,savedBatch:'',saving:false,dbData:null};
 ensureStyles();
 dialog=document.createElement('div');dialog.id='hsri-root';document.body.appendChild(dialog);
 dialog.addEventListener('change',function(ev){
  if(ev.target&&ev.target.id==='hsriFile'&&ev.target.files&&ev.target.files[0])read(ev.target.files[0]);
 });
 dialog.addEventListener('click',function(ev){
  if(ev.target.closest('[data-hsri-close]')){close();return;}
  if(ev.target.closest('[data-hsri-save]')){stage();return;}
 });
 document.addEventListener('keydown',onEscape,true);
 render();
}
function onEscape(e){if(e.key==='Escape'&&state.open&&!state.busy&&!state.saving){document.removeEventListener('keydown',onEscape,true);close();}}
root.__HASNARIA_RECIPE_IMPORT_V1={open:open};
})(window);
