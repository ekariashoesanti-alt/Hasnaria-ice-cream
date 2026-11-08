/* HASNARIA Majoo recipe evidence parser & read-only readiness comparison.
 * Never approves recipes, overwrites components or computes stock posting.
 */
(function(root){
'use strict';
function txt(x){return String(x==null?'':x).normalize('NFKC').trim().replace(/\s+/g,' ');}
function key(x){return txt(x).toLocaleLowerCase('id-ID');}
function h(x){return key(x).replace(/[\s*]+/g,' ');}
function safe(x,max,label){var t=txt(x);if(!t||t.length>max)throw Error(label+' kosong / terlalu panjang');return t;}
function fail(x){throw Error('Ekspor Resep Majoo: '+x);}
function positive(x,label){
 var s=typeof x==='number'?x:txt(x);
 if(typeof s==='string')s=s.replace(',','.');
 if(!/^(?:\d+)(?:\.\d+)?$/.test(String(s)))fail(label+' bukan angka positif');
 var n=Number(s);
 if(!Number.isFinite(n)||n<=0||n>10000000||Math.round(n*1000000)!==n*1000000)fail(label+' melewati batas');
 return n;
}
function headerIndex(row,names){
 var z=(row||[]).map(h);
 return names.map(function(n){return z.indexOf(h(n));});
}
function nonempty(row){return (row||[]).some(function(x){return txt(x)!=='';});}
function parse(sheets){
 if(!sheets||typeof sheets!=='object')fail('Workbook tidak tersedia');
 var recipe=sheets['Ekspor Resep'],materials=sheets['Daftar Bahan'],master=sheets['Daftar Master Resep'];
 if(!Array.isArray(recipe)||!Array.isArray(materials)||!Array.isArray(master))fail('Wajib ada 3 sheet Majoo: Ekspor Resep, Daftar Bahan, Daftar Master Resep');
 var headline=recipe.findIndex(function(r){return headerIndex(r,['SKU Produk*','SKU Bahan*','Kuantitas*']).every(function(i){return i>=0;});});
 if(headline<0||headline>15)fail('Header Ekspor Resep tidak cocok');
 var idx=headerIndex(recipe[headline],['Outlet/Grup Outlet','SKU Produk*','Nama Produk*','Nama Kategori','SKU Bahan*','Nama Bahan*','Kuantitas*','Satuan*','Kode Master Resep*','Nama Master Resep*']);
 if(idx.some(function(i){return i<0;}))fail('Kolom sumber resep tidak lengkap');
 var exportedAt=txt((recipe[2]||[])[1]),outletHead=txt((recipe[1]||[])[1]);
 if(h((recipe[1]||[])[0])!=='outlet'||h((recipe[2]||[])[0])!=='tanggal ekspor')fail('Metadata outlet / tanggal ekspor tidak valid');
 if(!exportedAt||exportedAt.length>50||!outletHead)fail('Metadata ekspor tidak lengkap');
 var mHead=materials.findIndex(function(r){return headerIndex(r,['Kode SKU','Nama Bahan','Satuan']).every(function(i){return i>=0;});});
 if(mHead<0||mHead>12)fail('Sheet Daftar Bahan tidak sesuai template');
 var im=headerIndex(materials[mHead],['Kode SKU','Nama Bahan','Satuan']);
 var materialByCode=new Map(),missingMaterial=0,sourceMaterials=[];
 for(var i=mHead+1;i<materials.length;i++){
  var r=materials[i]||[];if(!nonempty(r))continue;
  var code=safe(r[im[0]],100,'Kode bahan baris '+(i+1));
  var name=safe(r[im[1]],300,'Nama bahan '+code);
  var unit=safe(r[im[2]],100,'Satuan '+code);
  if(materialByCode.has(key(code)))fail('Kode bahan duplikat: '+code);
  var m={code:code,name:name,unit:unit};
  materialByCode.set(key(code),m);sourceMaterials.push(m);
  if(sourceMaterials.length>1000)fail('Master bahan terlalu banyak');
 }
 if(!sourceMaterials.length)fail('Daftar Bahan kosong');
 var rows=[],seen=new Set(),productNames=new Map(),usedMaterialNames=new Map(),outlets=new Set();
 for(var n=headline+1;n<recipe.length;n++){
  var a=recipe[n]||[];if(!nonempty(a))continue;
  var rowNumber=n+1,sku=safe(a[idx[1]],100,'SKU produk baris '+rowNumber),
    name=safe(a[idx[2]],300,'Nama produk baris '+rowNumber),
    sourceOutlet=safe(a[idx[0]],200,'Outlet baris '+rowNumber),
    materialCode=safe(a[idx[4]],100,'SKU bahan baris '+rowNumber),
    materialName=safe(a[idx[5]],300,'Nama bahan baris '+rowNumber),
    unit=safe(a[idx[7]],100,'Satuan baris '+rowNumber),
    quantity=positive(a[idx[6]],'Kuantitas baris '+rowNumber);
  if(txt(a[idx[8]])||txt(a[idx[9]]))fail('Master resep bertingkat belum didukung; file perlu audit khusus');
  var cat=txt(a[idx[3]]);if(cat.length>150)fail('Kategori terlalu panjang baris '+rowNumber);
  if(outlets.size&& !outlets.has(key(sourceOutlet)))fail('Beberapa outlet tercampur');
  outlets.add(key(sourceOutlet));
  var pair=key(sku)+'|'+key(materialCode);
  if(seen.has(pair))fail('SKU dan bahan duplikat baris '+rowNumber);
  seen.add(pair);
  if(productNames.has(key(sku))&&productNames.get(key(sku))!==key(name))fail('SKU produk mengarah ke nama berbeda: '+sku);
  productNames.set(key(sku),key(name));
  var masterMaterial=materialByCode.get(key(materialCode));
  if(!masterMaterial)fail('Bahan '+materialCode+' tidak ada pada sheet Daftar Bahan');
  if(key(masterMaterial.name)!==key(materialName)||key(masterMaterial.unit)!==key(unit))fail('Bahan '+materialCode+' berbeda dari Daftar Bahan');
  if(usedMaterialNames.has(key(materialCode))&&usedMaterialNames.get(key(materialCode))!==key(materialName)+'|'+key(unit))fail('Definisi bahan tidak konsisten');
  usedMaterialNames.set(key(materialCode),key(materialName)+'|'+key(unit));
  rows.push({line_no:rows.length+1,sku:sku,name:name,category:cat,
    ingredient_code:materialCode,ingredient_name:materialName,quantity:quantity,unit:unit});
  if(rows.length>3000)fail('Maksimal 3000 baris komposisi');
 }
 if(!rows.length)fail('Tidak ada resep untuk diperiksa');
 var h0=headerIndex(master[3]||[],['Kode Master Resep*','Nama Master Resep*','SKU Bahan*','Nama Bahan*','Kuantitas*','Satuan*']);
 if(h0.some(function(v){return v<0;}))fail('Sheet Daftar Master Resep tidak sesuai template');
 if(master.slice(4).some(nonempty))fail('Ada subresep di Daftar Master Resep; perlu alur rekursif terpisah');
 if(outletHead.toLowerCase()!=='semua outlet'&&key(outletHead)!==Array.from(outlets)[0])fail('Label outlet pada metadata dan baris tidak konsisten');
 return {exported_at:exportedAt,source_outlet:Array.from(outlets)[0],rows:rows,
  source_skus:productNames.size,source_materials:sourceMaterials.length,used_materials:usedMaterialNames.size,
  source_only:true,can_modify_operational_stock:false,can_approve_recipe:false};
}
function compare(parsed,db){
 var products=(db&&db.products)||[],items=(db&&db.items)||[],components=(db&&db.components)||[],
  sold=(db&&db.sold)||[],approvals=(db&&db.approvals)||[];
 var pBySku=new Map(),pByName=new Map(),iByName=new Map(),bom=new Map(),qtyBySku=new Map(),qtyByName=new Map(),approved=new Map();
 function add(map,k,v){var a=map.get(k)||[];a.push(v);map.set(k,a);}
 products.forEach(function(p){if(p.sku)add(pBySku,key(p.sku),p);if(p.name)add(pByName,key(p.name),p);});
 items.forEach(function(i){if(i.item_name)add(iByName,key(i.item_name),i);});
 components.forEach(function(c){if(c.active!==false&&c.product_id)add(bom,String(c.product_id),c);});
 sold.forEach(function(s){if(s.source_sku)qtyBySku.set(key(s.source_sku),Number(s.quantity)||0);if(s.source_product_name)qtyByName.set(key(s.source_product_name),Number(s.quantity)||0);});
 approvals.forEach(function(v){approved.set(v.product_id,v.status);});
 var result=[],groups=new Map();
 parsed.rows.forEach(function(r){
  var skuMatches=pBySku.get(key(r.sku))||[],nameMatches=pByName.get(key(r.name))||[];
  var prod=skuMatches.length===1&&key(skuMatches[0].name)===key(r.name)?skuMatches[0]:null;
  var matchKind=prod?'SKU_EXACT':'';
  if(!prod&&skuMatches.length===0&&nameMatches.length===1){prod=nameMatches[0];matchKind='NAME_ONLY_REVIEW';}
  var materialMatches=iByName.get(key(r.ingredient_name.replace(/^#/,'').trim()))||[];
  var inv=materialMatches.length===1?materialMatches[0]:null;
  var reasons=[];
  if(!prod)reasons.push(skuMatches.length>1||nameMatches.length>1?'PRODUCT_AMBIGUOUS':'PRODUCT_UNRESOLVED');
  if(matchKind==='NAME_ONLY_REVIEW')reasons.push(matchKind);
  if(!inv)reasons.push(materialMatches.length>1?'INGREDIENT_AMBIGUOUS':'INGREDIENT_UNRESOLVED');
  if(inv&&key(r.unit)!==key(inv.unit))reasons.push('UNIT_REVIEW');
  var current=prod&&inv?(bom.get(String(prod.id))||[]).filter(function(c){return c.inventory_item_id===inv.id;}):[];
  if(!current.length)reasons.push('NEW_COMPONENT');
  else if(current.length>1)reasons.push('DUPLICATE_CURRENT_BOM');
  else if(key(r.unit)===key(inv.unit)&&Math.abs(Number(current[0].qty_per_sale)-r.quantity)>0.000001)reasons.push('QTY_DIFFERENT');
  if(current.length===1&&current[0].bom_status!=='verified')reasons.push('COMPONENT_NOT_VERIFIED');
  if(prod&&approved.get(prod.id)!=='verified')reasons.push('RECIPE_NOT_APPROVED');
  var rr={line_no:r.line_no,sku:r.sku,product_name:r.name,ingredient_code:r.ingredient_code,
    ingredient_name:r.ingredient_name,source_qty:r.quantity,source_unit:r.unit,
    inventory_name:inv?inv.item_name:null,inventory_unit:inv?inv.unit:null,
    current_qty:current.length===1?Number(current[0].qty_per_sale):null,
    match_kind:matchKind,reason_codes:reasons,requires_owner_review:reasons.length>0,
    stock_posting_allowed:false};
  result.push(rr);
  var k=key(r.sku);if(!groups.has(k))groups.set(k,{sku:r.sku,name:r.name,lines:0,reasons:new Set(),quantity_sold:qtyBySku.get(k)||qtyByName.get(key(r.name))||0});
  var g=groups.get(k);g.lines++;reasons.forEach(function(code){g.reasons.add(code);});
 });
 var summary=Array.from(groups.values()).map(function(x){return {
  sku:x.sku,name:x.name,component_count:x.lines,quantity_sold:x.quantity_sold,
  reasons:Array.from(x.reasons),needs_review:x.reasons.size>0
 }}).sort(function(a,b){return b.quantity_sold-a.quantity_sold||key(a.sku).localeCompare(key(b.sku));});
 return {rows:result,products:summary,source_sku_count:summary.length,
  source_component_count:result.length,product_review_count:summary.filter(function(p){return p.needs_review}).length,
  ingredient_unresolved_count:result.filter(function(r){return r.reason_codes.includes('INGREDIENT_UNRESOLVED')||r.reason_codes.includes('INGREDIENT_AMBIGUOUS');}).length,
  unit_review_count:result.filter(function(r){return r.reason_codes.includes('UNIT_REVIEW');}).length,
  source_only:true,stock_posting_allowed:false,can_modify_operational_stock:false,can_approve_recipe:false};
}
var api={parse:parse,compare:compare};
if(root)root.__HASNARIA_RECIPE_IMPORT_MODEL_V1=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null);
