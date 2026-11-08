'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const mod=require('../stock-recipe-import-model-v1.js');
function sheets(){
 return {
  'Ekspor Resep':[
   ['Ekspor Resep Produk'],['Outlet','Semua Outlet'],['Tanggal Ekspor','08/11/2026 22:12'],[],
   ['Outlet/Grup Outlet','SKU Produk*','Nama Produk*','Nama Kategori','SKU Bahan*','Nama Bahan*','Kuantitas*','Satuan*','Kode Master Resep*','Nama Master Resep*'],
   ['Hasnaria Ice Cream','DR70','CHOCOLATE','Minuman','#DR10','#CHOCOLATE DELFI',1,'SACHET','',''],
   ['Hasnaria Ice Cream','FO22','BINTANG','Menu','#FO17','#BINTANG',1,'Buah','',''],
   ['Hasnaria Ice Cream','FO45','MUKBANG RABOKKI','Menu','#FO20','Saus topokki',200,'Gram','','']
  ],
  'Daftar Bahan':[
   ['Daftar Bahan'],['Tanggal Ekspor','08/11/2026 22:12'],[],
   ['Kode SKU','Nama Bahan','Satuan'],
   ['#DR10','#CHOCOLATE DELFI','SACHET'],['#FO17','#BINTANG','Buah'],['#FO20','Saus topokki','Gram']
  ],
  'Daftar Master Resep':[
   ['Daftar Master Resep'],['Tanggal Ekspor','08/11/2026 22:12'],[],
   ['Kode Master Resep*','Nama Master Resep*','SKU Bahan*','Nama Bahan*','Kuantitas*','Satuan*'],['','','','','','']
  ]
 };
}
const db={
 products:[{id:'p1',sku:'DR70',name:'CHOCOLATE'},{id:'p2',sku:'FO22',name:'BINTANG'},{id:'p3',sku:'FO45',name:'MUKBANG RABOKKI'}],
 items:[{id:'i1',item_name:'COKELAT DELFI',unit:'sachet'},
        {id:'i2',item_name:'BINTANG',unit:'purchase_unit'},
        {id:'i3',item_name:'SAUS TOPOKKI',unit:'porsi'}],
 components:[],approvals:[],
 sold:[{source_sku:'DR70',quantity:31},{source_sku:'FO22',quantity:11},{source_sku:'FO45',quantity:10}]
};
test('Majoo export validates 3 named sheets, rows and provenance',()=>{
 const p=mod.parse(sheets());
 assert.equal(p.rows.length,3);assert.equal(p.source_skus,3);assert.equal(p.source_materials,3);
 assert.equal(p.rows[0].ingredient_code,'#DR10');
 assert.equal(p.source_only,true);assert.equal(p.can_modify_operational_stock,false);
 assert.equal(p.can_approve_recipe,false);
});
test('read-only comparison does not infer pack / physical units or approve',()=>{
 const c=mod.compare(mod.parse(sheets()),db);
 assert.equal(c.source_component_count,3);
 assert.deepEqual(c.products.map(x=>x.sku),['DR70','FO22','FO45']);
 assert.equal(c.unit_review_count,2);
 assert.equal(c.product_review_count,3);
 assert.equal(c.stock_posting_allowed,false);
 assert.equal(c.can_modify_operational_stock,false);
 assert.equal(c.can_approve_recipe,false);
});
test('duplicate Majoo SKU and ingredient code is a hard fail',()=>{
 const w=sheets();w['Ekspor Resep'].push([...w['Ekspor Resep'][5]]);
 assert.throws(()=>mod.parse(w),/duplikat/);
});
test('unregistered ingredient code is a hard fail',()=>{
 const w=sheets();w['Ekspor Resep'][5][4]='#NOT-IN-MASTER';
 assert.throws(()=>mod.parse(w),/Daftar Bahan/);
});
test('multisite source is blocked instead of silently combining outlets',()=>{
 const w=sheets();w['Ekspor Resep'][6][0]='Another Outlet';
 assert.throws(()=>mod.parse(w),/outlet/);
});
test('invalid or zero BOM quantities are rejected',()=>{
 const w=sheets();w['Ekspor Resep'][5][6]=0;
 assert.throws(()=>mod.parse(w),/positif|batas/);
});
test('nested Majoo master recipe requires separate validation',()=>{
 const w=sheets();w['Daftar Master Resep'][4]=['M001','Sauce','#FO20','Saus topokki',1,'Gram'];
 assert.throws(()=>mod.parse(w),/subresep/);
});
test('owner UI and atomic DB proposal never mutate operational tables',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','stock-recipe-import-v1.js'),'utf8');
 const stock=fs.readFileSync(path.join(__dirname,'..','stock-control-v3.js'),'utf8');
 const sql=fs.readFileSync(path.join(__dirname,'..','supabase/migrations/20261108223000_owner_majoo_recipe_import_review_v1.sql'),'utf8');
 assert.match(stock,/data-sc4-action="import-recipe"/);
 assert.match(ui,/stage_recipe_import_v1/);
 assert.match(ui,/productionTarget\(\)/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/private\.is_owner/);
 assert.match(sql,/unique \(brand_id, outlet_id, file_sha256\)/);
 assert.match(sql,/on conflict \(brand_id,outlet_id,file_sha256\) do nothing/i);
 assert.doesNotMatch(sql,/\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:inventory_movements|inventory_recipe_components|product_recipe_verifications|sales|sale_items)\b/i);
 assert.doesNotMatch(ui,/.from\(['"](?:inventory_movements|inventory_recipe_components|product_recipe_verifications)['"]\)\.(?:insert|update|delete|upsert)\(/);
});

test('Stock recipe popup is independently styled and XLSX file chooser works without preload',async()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','stock-recipe-import-v1.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','stock-recipe-import-v1.css'),'utf8');
 assert.match(css,/#hsri-root \.hsri-header/);
 assert.match(css,/background:#fff!important/);
 assert.match(ui,/cdn\.sheetjs\.com\/xlsx-0\.20\.3/);
 assert.match(ui,/data-hsri-choose/);
 assert.match(ui,/fileInput\.click\(\)/);
 assert.match(ui,/await ensureExcelEngine\(\)/);
 const mock={
  __HASNARIA_CONTEXT:{role:'owner'},
  location:{hostname:'hasnaria-business-analyzer.vercel.app'},
  HASNARIA_SB:'https://bnnhmtkpdjlgehsvgoda.supabase.co'
 };
 const linked={};
 const handlers={};
 let scriptLoads=0,chooserClicks=0,dialog=null;
 function element(tag){
  return {
   tag, isConnected:false, handlers:{},
   addEventListener(name,fn){this.handlers[name]=fn;},
   querySelector(q){if(q==='#hsriFile')return {disabled:false,click(){chooserClicks++;}};return null;},
   remove(){},
  };
 }
 const doc={
  getElementById(id){return linked[id]||null;},
  createElement:element,
  head:{appendChild(el){
   el.isConnected=true;if(el.id)linked[el.id]=el;
   if(el.tag==='link'){el.sheet={};setImmediate(()=>el.handlers.load?.());return;}
   if(el.tag==='script'){
    scriptLoads++;
    if(el.src.includes('cdn.sheetjs.com'))mock.XLSX={read(){}};
    setImmediate(()=>el.onload?.());
   }
  }},
  body:{appendChild(el){el.isConnected=true;dialog=el;linked[el.id]=el;}},
  addEventListener(name,fn){handlers[name]=fn;},
  removeEventListener(name){delete handlers[name];}
 };
 const vm=require('node:vm');
 vm.runInNewContext(ui,{window:mock,document:doc,setTimeout,clearTimeout,Promise,console});
 assert.equal(typeof mock.__HASNARIA_RECIPE_IMPORT_V1?.open,'function');
 mock.__HASNARIA_RECIPE_IMPORT_V1.open();
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.ok(dialog,'modal exists');
 assert.match(dialog.innerHTML,/data-hsri-choose/);
 assert.match(dialog.innerHTML,/File Resep Produk Majoo/);
 assert.ok(scriptLoads>=1,'XLSX CDN loaded without Sales preloader');
 assert.equal(typeof mock.XLSX.read,'function');
 dialog.handlers.click({target:{closest(sel){return sel==='[data-hsri-choose]'?{}:null;}}});
 assert.equal(chooserClicks,1,'file input is opened by a direct user click');
});


test('Recipe upload exposes staged progress and performs readback before saying success',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','stock-recipe-import-v1.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','stock-recipe-import-v1.css'),'utf8');
 assert.match(ui,/step:'saving'|state\.step='saving'/);
 assert.match(ui,/state\.step='verifying'/);
 assert.match(ui,/verifyReceipt\(result\.batch_id,state\.hash,p\.rows\.length\)/);
 assert.match(ui,/source_row_count!==expected/);
 assert.match(ui,/actual!==expected/);
 assert.match(ui,/count:'exact',head:true/);
 assert.match(ui,/Tidak ada pengurangan stok|Tidak ada pengurangan stok|tidak mengubah stok/);
 assert.match(ui,/loadHistory\(\)/);
 assert.match(ui,/data-hsri-recheck/);
 assert.doesNotMatch(ui,/153 atau lebih baris resep tersimpan/);
 assert.match(css,/\.hsri-panel>\.hsri-table-wrap\{height:168px!important/);
 assert.match(css,/flex:0 0 auto!important/);
 assert.match(css,/hsri-transfer-done/);
});

test('Atomic upload receipt is verified and restored from history after reopening without re-upload',async()=>{
 const vm=require('node:vm');
 const ui=fs.readFileSync(path.join(__dirname,'..','stock-recipe-import-v1.js'),'utf8');
 const parsed=mod.parse(sheets());
 const hash='1e7ac69f33ee9ac060bdb4e34086e633ebfa52399d32cc5a13d90acae1d4397b';
 const batchId='75272dfd-39a7-4361-a233-5fabb257cbfd';
 let staged=false,rpcCalls=0,verifiedReadback=0,modal=null;
 const rows={
   products:db.products,inventory_items:db.items,inventory_recipe_components:db.components,
   product_recipe_verifications:db.approvals,
   sales_product_report_batches:[],
   outlets:[{id:'outlet1',name:'Hasnaria Main',brand_id:'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'}],
   sales_product_report_lines:db.sold
 };
 const batch={id:batchId,file_sha256:hash,status:'under_review',
   source_row_count:parsed.rows.length,source_filename:'Ekspor Resep Produk.xlsx',
   created_at:'2026-11-08T20:24:59Z'};
 function query(table){
  const filters={};let selectOptions={};
  return {
   select(cols,options){selectOptions=options||{};return this;},
   eq(k,v){filters[k]=v;return this;},
   order(){return this;},
   limit(){return Promise.resolve(result());},
   maybeSingle(){const r=result();return Promise.resolve({data:r.data[0]||null,error:null});},
   then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}
  };
  function result(){
   if(table==='recipe_import_batches_v1'){
    const matches=staged&&(!filters.id||filters.id===batchId)&&(!filters.file_sha256||filters.file_sha256===hash);
    return {data:matches?[batch]:[],error:null};
   }
   if(table==='recipe_import_lines_v1'){
    verifiedReadback++;
    return {data:[],error:null,count:staged?parsed.rows.length:0};
   }
   return {data:rows[table]||[],error:null};
  }
 }
 const root={
  __HASNARIA_CONTEXT:{role:'owner'},
  __HASNARIA_RECIPE_IMPORT_MODEL_V1:mod,
  __HASNARIA_DB:{
    from:query,
    rpc(name,payload){
     assert.equal(name,'stage_recipe_import_v1');
     assert.equal(payload.p_rows.length,parsed.rows.length);
     rpcCalls++;staged=true;
     return Promise.resolve({data:{batch_id:batchId,reused:false},error:null});
    }
  },
  XLSX:{
   read(){return {SheetNames:Object.keys(sheets()),Sheets:sheets()};},
   utils:{sheet_to_json(sheet){return sheet;}}
  },
  crypto:{subtle:{digest(){return Promise.resolve(Uint8Array.from(Buffer.from(hash,'hex')).buffer);}}},
  location:{hostname:'hasnaria-business-analyzer.vercel.app'},
  HASNARIA_SB:'https://bnnhmtkpdjlgehsvgoda.supabase.co'
 };
 const linked={};
 function create(tag){
  return {tag,handlers:{},isConnected:false,
   addEventListener(type,fn){this.handlers[type]=fn;},
   remove(){if(modal===this)modal=null;},
   querySelector(){return null;}};
 }
 const document={
  createElement:create,
  getElementById(id){return linked[id]||null;},
  head:{appendChild(el){
   el.isConnected=true;if(el.id)linked[el.id]=el;
   if(el.tag==='link'){el.sheet={};setImmediate(()=>el.handlers.load?.());}
  }},
  body:{appendChild(el){modal=el;el.isConnected=true;linked[el.id]=el;}},
  addEventListener(){},removeEventListener(){}
 };
 vm.runInNewContext(ui,{window:root,document,Promise,setTimeout,clearTimeout,console});
 function clickSelector(sel){modal.handlers.click({target:{closest(x){return x===sel?{}:null;}}});}
 const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
 root.__HASNARIA_RECIPE_IMPORT_V1.open();await tick();
 const file={name:'Ekspor Resep Produk.xlsx',size:1234,arrayBuffer:async()=>new ArrayBuffer(100)};
 modal.handlers.change({target:{id:'hsriFile',files:[file]}});
 await tick();
 assert.match(modal.innerHTML,/Pratinjau lengkap/);
 assert.equal(rpcCalls,0);
 clickSelector('[data-hsri-save]');
 await tick();await tick();
 assert.equal(rpcCalls,1);
 assert.ok(verifiedReadback>=1);
 assert.match(modal.innerHTML,/Tersimpan &amp; terverifikasi|Tersimpan & terverifikasi/);
 assert.match(modal.innerHTML,/3\/3 baris terverifikasi/);
 assert.match(modal.innerHTML,/Batch terverifikasi/);
 assert.match(modal.innerHTML,/Sudah Tersimpan/);
 clickSelector('[data-hsri-close]');
 assert.equal(modal,null);
 root.__HASNARIA_RECIPE_IMPORT_V1.open();
 await tick();
 assert.match(modal.innerHTML,/Riwayat impor terakhir/);
 assert.match(modal.innerHTML,/3\/3 baris/);
 assert.equal(rpcCalls,1);
});
