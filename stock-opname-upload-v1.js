/* HSN-402: Owner-only stock count file -> audited Operational draft.
   No workbook directly posts physical balances or finance journals.
   Only an approved operational run can post a physical checkpoint. */
(function(){
'use strict';
if(window.__HASNARIA_STOCK_UPLOAD_V1)return;
var st={open:false,busy:false,file:null,rows:null,hash:'',error:'',notice:'',date:'',runId:'',saving:0};
var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4',db=null,dialog=null,master=null;
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function norm(x){return String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'')}
function owner(){var c=window.__HASNARIA_CONTEXT;return !!(c&&c.role==='owner')}
function previewUsesProductionDatabase(){
  var host=window.location&&window.location.hostname;
  if(!host)return false; // Headless unit tests; real browsers always provide location.
  if(String(window.HASNARIA_SB||'').indexOf('bnnhmtkpdjlgehsvgoda.supabase.co')<0)return false;
  return host!=='hasnaria-business-analyzer.vercel.app'&&
    host!=='hasnaria-business-analyzer-ekariashoesanti-9951s-projects.vercel.app';
}
function getDb(){db=window.__HASNARIA_DB||null;if(!db)throw Error('Database Hasnaria belum siap. Masuk kembali dan ulangi.');return db}
function close(){if(st.busy)return;st.open=false;st.file=null;st.rows=null;st.error='';st.notice='';if(dialog){dialog.remove();dialog=null}if(window.__HASNARIA_STOCK_REFRESH_VERIFIED)window.__HASNARIA_STOCK_REFRESH_VERIFIED()}
function template(){
 return master.map(function(x){return [x.id,x.item_name,x.unit,''].map(function(v){var z=String(v==null?'':v);return '"'+z.replace(/"/g,'""')+'"'}).join(',')}).join('\r\n')
}
async function loadMaster(){
 var q=await getDb().from('inventory_items').select('id,item_name,category,unit').eq('brand_id',BRAND).order('item_name',{ascending:true}).limit(500);
 if(q.error)throw q.error;
 if(!Array.isArray(q.data)||!q.data.length)throw Error('Master SKU Stok tidak tersedia.');
 return q.data;
}
function col(headers,pattern){return headers.findIndex(function(x){return pattern.test(String(x||'').trim())})}
async function parseFile(file){
 if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw Error('Gunakan Excel/CSV berformat STOCK_OPNAME.');
 if(file.size>5*1024*1024)throw Error('Ukuran file maksimal 5 MB.');
 if(!window.XLSX && window.__HASNARIA_XLSX_READY)await window.__HASNARIA_XLSX_READY;
 if(!window.XLSX)throw Error('Parser Excel belum siap; muat ulang sebelum mencoba upload.');
 if(!window.crypto || !window.crypto.subtle)throw Error('Peramban harus mendukung SHA-256 pada HTTPS untuk mencegah upload ganda.');
 var bytes=await file.arrayBuffer();
 var digest=await window.crypto.subtle.digest('SHA-256',bytes);
 var hash=Array.from(new Uint8Array(digest)).map(function(x){return x.toString(16).padStart(2,'0')}).join('');
 var wb=window.XLSX.read(bytes,{type:'array',cellDates:false});
 var sn=wb.SheetNames.find(function(x){return norm(x)==='STOCKOPNAME'});
 if(!sn&&/\.csv$/i.test(file.name)&&norm(file.name.replace(/\.csv$/i,''))==='STOCKOPNAME')sn=wb.SheetNames[0];
 if(!sn)throw Error('File Rencana Belanja kategori hanya untuk rekonsiliasi historis. Untuk koreksi stok fisik gunakan sheet STOCK_OPNAME dengan template dari halaman ini; tidak ada saldo yang berubah.');
 var data=window.XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true});
 var head=-1,idx=null;
 for(var n=0;n<Math.min(12,data.length);n++){
   var h=(data[n]||[]).map(function(x){return String(x||'').trim().toUpperCase()});
   var i=col(h,/^(INVENTORY[_ ]?ITEM[_ ]?ID|SKU ID|ID SKU)$/i),
       j=col(h,/^(ITEM[_ ]?NAME|NAMA BARANG|NAMA ITEM|ITEM)$/i),
       k=col(h,/^(UNIT|SATUAN)$/i),
       z=col(h,/^(PHYSICAL[_ ]?QTY|QTY[_ ]?FISIK|JUMLAH FISIK|HASIL OPNAME)$/i);
   if((i>=0||j>=0)&&k>=0&&z>=0){head=n;idx={i:i,j:j,k:k,z:z};break}
 }
 if(head<0)throw Error('Kolom wajib tidak ditemukan: INVENTORY_ITEM_ID/NAMA BARANG, UNIT/SATUAN, PHYSICAL_QTY.');
 var records=[],errors=[],seen=new Set(),byId=new Map(),byName=new Map();
 master.forEach(function(x){byId.set(String(x.id),x);var n=norm(x.item_name);var list=byName.get(n)||[];list.push(x);byName.set(n,list)});
 for(var ri=head+1;ri<data.length;ri++){
   var row=data[ri]||[],qty=row[idx.z],id=idx.i>=0?String(row[idx.i]||'').trim():'',
       name=idx.j>=0?String(row[idx.j]||'').trim():'';
   if(qty===''||qty===null||qty===undefined){continue}
   if(records.length>=500){errors.push('Maksimal 500 baris terisi per file');break}
   var value=typeof qty==='number'?qty:Number(String(qty).trim().replace(',','.'));
   if(!Number.isFinite(value)||value<0){errors.push('Baris '+(ri+1)+': jumlah fisik tidak numerik');continue}
   var item=id?byId.get(id):null;
   if(!item&&id){errors.push('Baris '+(ri+1)+': ID SKU tidak ditemukan; tidak boleh mengganti berdasarkan nama');continue}
   if(!item&&!id&&name){var a=byName.get(norm(name))||[];if(a.length===1)item=a[0];else if(a.length>1)errors.push('Baris '+(ri+1)+': nama SKU ambigu, gunakan ID')}
   if(!item){errors.push('Baris '+(ri+1)+': SKU tidak ditemukan dalam master backend');continue}
   if(name&&norm(name)!==norm(item.item_name)){errors.push('Baris '+(ri+1)+': nama dan ID SKU tidak sama');continue}
   if(!String(row[idx.k]||'').trim()||norm(row[idx.k])!==norm(item.unit)){
     errors.push('Baris '+(ri+1)+': satuan tidak cocok dengan master '+item.unit);continue
   }
   if(seen.has(item.id)){errors.push('Baris '+(ri+1)+': SKU terduplikasi');continue}
   seen.add(item.id);records.push({id:item.id,qty:value,row:ri+1,name:item.item_name,unit:item.unit});
 }
 if(!records.length)errors.push('Tidak ada jumlah fisik numerik untuk diproses');
 if(errors.length)throw Error('Upload diblokir: '+errors.slice(0,5).join(' · ')+(errors.length>5?' (+'+(errors.length-5)+' lainnya)':''));
 return {rows:records,hash:hash,sheet:sn};
}
function render(){
 if(!st.open||!dialog)return;
 var filled=st.rows?st.rows.length:0,total=master?master.length:0;
 dialog.innerHTML='<div class="hso-backdrop"><section class="hso-panel" role="dialog" aria-modal="true" aria-labelledby="hsoTitle">'+
 '<header><div><small>STOK · UPLOAD TERKENDALI</small><h3 id="hsoTitle">Upload Stock Opname</h3><p>Data file masuk sebagai draft Operasional. Saldo dan infografis aktual berubah hanya setelah approval dan posting backend.</p></div><button type="button" data-hso-close '+(st.busy?'disabled':'')+'>×</button></header>'+
 (st.error?'<p role="alert" class="hso-error">'+esc(st.error)+'</p>':'')+
 (st.notice?'<p role="status" class="hso-success">'+esc(st.notice)+'</p>':'')+
 '<div class="hso-form"><label>Tanggal hitung fisik<input type="date" data-hso-date value="'+esc(st.date)+'" '+(st.busy?'disabled':'')+'></label>'+
 '<label>File Excel/CSV<input type="file" id="hsoUploadFile" accept=".xlsx,.xls,.csv" '+(st.busy?'disabled':'')+'></label>'+
 '<button type="button" data-hso-template '+(st.busy?'disabled':'')+'>Unduh Template SKU</button></div>'+
 '<div class="hso-file">'+(st.file?esc(st.file.name):'Belum ada file dipilih')+'</div>'+
 (st.rows?'<div class="hso-preview"><b>Preview sumber valid: '+filled+' dari '+total+' SKU master</b><p>'+st.rows.slice(0,8).map(function(x){return esc(x.name)+' = '+esc(x.qty)+' '+esc(x.unit)}).join(' · ')+'</p><small>'+(total-filled)+' SKU lainnya belum terisi; wajib dilengkapi di Operasional sebelum dapat diajukan untuk approval.</small></div>':'')+
 '<footer><span>'+(st.busy?'Menyimpan '+st.saving+' / '+filled+' baris ke draft backend…':'Tidak ada stok yang diposting otomatis')+'</span>'+
 (st.runId?'<button type="button" data-hso-operasional>Buka Operasional →</button>':'')+
 '<button type="button" data-hso-save '+(!filled||st.busy||!!st.runId?'disabled':'')+'>Simpan Draft Terverifikasi</button></footer>'+
 '</section></div>';
}
async function preview(file){
 st.file=file;st.rows=null;st.hash='';st.error='';st.notice='';st.runId='';st.busy=true;render();
 try{if(!master)master=await loadMaster();var p=await parseFile(file);st.rows=p.rows;st.hash=p.hash}
 catch(e){st.error=e&&e.message?e.message:String(e)}
 finally{st.busy=false;render()}
}
async function stage(){
 if(!owner()||st.busy||!st.rows||st.runId)return;
 if(previewUsesProductionDatabase()){st.error='Preview masih terhubung ke database PRODUKSI. Simpan draft diblokir demi keamanan. Gunakan staging terisolasi untuk UAT atau situs produksi setelah rilis disetujui.';render();return;}
 if(st.date!==today()){st.error='Upload hitungan fisik harus bertanggal hari ini. Arsip Rencana Belanja historis tidak boleh menggantikan saldo live.';render();return}
 if(!window.confirm('Simpan '+st.rows.length+' hasil hitung fisik sebagai DRAFT Operasional? Tidak ada saldo yang berubah sebelum seluruh item diverifikasi dan disetujui.'))return;
 st.busy=true;st.error='';st.notice='';st.saving=0;render();
 var runId='';
 try{
  var title='[UPLOAD_OPNAME] '+st.date+' '+st.hash.slice(0,16);
  var existing=await getDb().from('operational_runs').select('id,status').eq('brand_id',BRAND).eq('title',title).limit(1);
  if(existing.error)throw existing.error;
  if(existing.data&&existing.data.length){st.runId=existing.data[0].id;throw Error('File sama sudah pernah masuk ke draft Operasional. Buka dokumen lama, jangan upload ulang.')}
  var created=await getDb().rpc('create_stock_opname_run',{p_scheduled_date:st.date,p_title:title});
  if(created.error)throw created.error;
  runId=created.data;st.runId=runId;
  var q=await getDb().from('operational_run_items').select('id,inventory_item_id').eq('run_id',runId).eq('item_type','stock_count').range(0,999);
  if(q.error)throw q.error;
  var m=new Map((q.data||[]).map(function(x){return [x.inventory_item_id,x.id]}));
  if(st.rows.some(function(x){return !m.has(x.id)}))throw Error('Master SKU berubah ketika draft dibuat; data ditahan untuk koreksi manual.');
  // Bounded concurrency; any failure leaves an auditable draft, never half-posted inventory.
  for(var pos=0;pos<st.rows.length;pos+=3){
    var chunk=st.rows.slice(pos,pos+3);
    var result=await Promise.all(chunk.map(function(x){
      return getDb().rpc('set_operational_run_item',{
        p_item_id:m.get(x.id),p_numeric_value:x.qty,
        p_notes:'Upload '+st.file.name+' · baris '+x.row+' · sha256:'+st.hash.slice(0,16)
      })
    }));
    result.forEach(function(x){if(x.error)throw x.error});
    st.saving=Math.min(pos+chunk.length,st.rows.length);render();
  }
  var check=await getDb().from('operational_run_items').select('inventory_item_id,numeric_value').eq('run_id',runId).eq('item_type','stock_count').range(0,999);
  if(check.error)throw check.error;
  var stored=new Map((check.data||[]).map(function(x){return [x.inventory_item_id,x.numeric_value]}));
  if(st.rows.some(function(x){return !stored.has(x.id)||Math.abs(Number(stored.get(x.id))-x.qty)>.000001}))
    throw Error('Sebagian nilai tidak terverifikasi di backend. Draft tetap tersimpan; periksa Operasional.');
  st.notice='Berhasil: '+st.rows.length+' baris tersimpan sebagai draft di backend. Selesaikan seluruh SKU, kirim untuk review lalu approve di Operasional agar grafik dan saldo ikut berubah.';
  try{document.dispatchEvent(new CustomEvent('hasnaria:write-complete',{detail:{module:'stok',mode:'draft'}}))}catch(_){}
 }catch(e){st.error=e&&e.message?e.message:String(e);if(runId)st.error+=' Draft '+runId+' tetap tersedia untuk recovery melalui Operasional.'}
 finally{st.busy=false;render()}
}
function download(){
 if(!owner()||st.busy)return;
 var done=function(){
  var csv='INVENTORY_ITEM_ID,ITEM_NAME,UNIT,PHYSICAL_QTY\r\n'+template()+'\r\n';
  var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='STOCK_OPNAME.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},300);
 };
 if(master){done();return}st.busy=true;render();loadMaster().then(function(x){master=x;done()}).catch(function(e){st.error=e.message||String(e)}).finally(function(){st.busy=false;render()});
}
function open(){
 if(!owner())return;
 if(st.open)return;
 st={open:true,busy:false,file:null,rows:null,hash:'',error:'',notice:'',date:today(),runId:'',saving:0};
 dialog=document.createElement('div');dialog.id='hsoUploadDialog';
 document.body.appendChild(dialog);
 dialog.addEventListener('click',function(e){
   if(e.target.closest('[data-hso-close]')){close();return}
   if(e.target.closest('[data-hso-template]')){download();return}
   if(e.target.closest('[data-hso-save]')){stage();return}
   if(e.target.closest('[data-hso-operasional]')){close();window.__HASNARIA_OWNER_SHELL&&window.__HASNARIA_OWNER_SHELL.navigate('operasional')}
 });
 dialog.addEventListener('change',function(e){
   if(e.target.matches('[data-hso-date]')){st.date=e.target.value;st.rows=null;st.runId='';st.error='';st.notice='';render()}
   if(e.target.id==='hsoUploadFile'&&e.target.files&&e.target.files[0])preview(e.target.files[0])
 });
 render();
}
window.__HASNARIA_STOCK_UPLOAD_V1={open:open,active:function(){return st.open},close:close};
})();
