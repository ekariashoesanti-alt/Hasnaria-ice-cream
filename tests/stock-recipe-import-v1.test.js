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
