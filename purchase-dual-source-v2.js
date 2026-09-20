(function(){
'use strict';
if(window.__HASNARIA_PURCHASE_DUAL_SOURCE_V2)return;
window.__HASNARIA_PURCHASE_DUAL_SOURCE_V2=true;
window.__HASNARIA_PURCHASE_DUAL_SOURCE=true;

var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var EVID='purchase_import_evidence';
var db=null,obs=null,timer=0;

function c(v){return String(v==null?'':v).trim().replace(/\s+/g,' ')}
function n(v){return c(v).toUpperCase().replace(/^#+/,'').replace(/[^A-Z0-9]+/g,'')}
function num(v){
  if(typeof v==='number')return isFinite(v)?v:0;
  var s=String(v==null?'':v).replace(/rp\.?/ig,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
  var x=Number(s);return isFinite(x)?x:0;
}
function raw(r){
  if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;
  if(r&&typeof r.raw_data==='string')try{return JSON.parse(r.raw_data)}catch(_){}
  return{};
}
function iso(v){
  if(v instanceof Date&&!isNaN(v))return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
  if(typeof v==='number'&&window.XLSX&&XLSX.SSF){var d=XLSX.SSF.parse_date_code(v);if(d)return d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0')}
  var s=c(v),m=s.match(/(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)/);
  if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  m=s.match(/([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})/);
  return m?m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'):null;
}
function per(d){return d&&/^\d{4}-\d{2}/.test(d)?d.slice(0,7)+'-01':null}
function money(v){return'Rp '+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:0})}
function pLabel(p){
  var M=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return /^\d{4}-\d{2}/.test(String(p||''))?(M[+String(p).slice(5,7)-1]+' '+String(p).slice(0,4)):'—';
}
function cat(item,sku){
  var s=c(sku).replace(/^#+/,'').toUpperCase(),u=c(item).toUpperCase();
  if(/^FO/.test(s))return'Makanan';
  if(/^IC/.test(s))return'Ice Cream';
  if(/^DR/.test(s))return'Minuman';
  if(/^KM/.test(s))return'Kemasan & Supplies';
  if(/MIKA|KARDUS|PLASTIK|SENDOK|GARPU|GELAS|CONE|TISU|SABUN|DETERGEN|MANGKOK|PAPER/.test(u))return'Kemasan & Supplies';
  if(/SIRUP|LECI|TEH|KRIMER|MATCHA|MINUM/.test(u))return'Minuman';
  if(/ICE CREAM|ES KRIM|TOPPING/.test(u))return'Ice Cream';
  if(/FC LAPORAN|FOTOKOPI|PULPEN|ATK|KERTAS KASIR|MAJOO/.test(u))return'Administrasi';
  return'Makanan';
}
function grp(item,category){
  var s=(c(item)+' '+c(category)).toUpperCase();
  if(/GAJI|KARYAWAN|MAKAN SIANG|SERAGAM/.test(s))return'Karyawan';
  if(/INVEST|FREEZER|FURNITURE|MESIN|ASET/.test(s))return'Investasi';
  if(category==='Administrasi'||/FOTOKOPI|PULPEN|ATK|LAPORAN|MAJOO/.test(s))return'Administrasi';
  return'Operasi';
}
function ev(type,period,file,row,key,date,item,qty,unit,price,amount,payment,category,kind,x){
  x=x||{};
  return{
    brand_id:BRAND,source_type:type,source_period:period,source_file:file,source_record_key:key,row_no:row,
    purchase_date:date||null,item_name:c(item),normalized_item:n(item),sku:c(x.sku)||null,
    quantity:qty>0?qty:null,unit_text:c(unit)||null,unit_price:price>0?price:null,total_amount:+amount||0,
    payment_method:c(payment)||null,supplier_name:c(x.supplier)||null,invoice_no:c(x.invoice)||null,source_status:c(x.status)||null,
    raw_data:Object.assign({source_type:type,analytics_group:grp(item,category),analytics_category:category,analytics_kind:kind||'purchase_item',original_file:file},x.raw||{})
  };
}
function idx(h,re){for(var i=0;i<h.length;i++)if(re.test(c(h[i])))return i;return-1}

function expandRef(ws){
  if(!ws||!window.XLSX||!XLSX.utils||!XLSX.utils.decode_cell||!XLSX.utils.encode_range)return;
  var minR=Infinity,minC=Infinity,maxR=-1,maxC=-1;
  Object.keys(ws).forEach(function(key){
    if(!key||key.charAt(0)==='!')return;
    try{var cell=XLSX.utils.decode_cell(key);minR=Math.min(minR,cell.r);minC=Math.min(minC,cell.c);maxR=Math.max(maxR,cell.r);maxC=Math.max(maxC,cell.c)}catch(_){}
  });
  if(maxR<0||maxC<0)return;
  var actual={s:{r:minR,c:minC},e:{r:maxR,c:maxC}},cur=null;
  try{cur=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):null}catch(_){}
  if(!cur||actual.s.r<cur.s.r||actual.s.c<cur.s.c||actual.e.r>cur.e.r||actual.e.c>cur.e.c)ws['!ref']=XLSX.utils.encode_range(actual);
}
function matrix(ws){expandRef(ws);return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true})}

function parseMajoo(wb,f){
  var sn=wb.SheetNames.find(function(s){return c(s).toUpperCase()==='EKSPOR FAKTUR PEMBELIAN'});
  if(!sn)throw Error('Sheet Ekspor Faktur Pembelian tidak ditemukan.');
  var a=matrix(wb.Sheets[sn]),hi=-1;
  for(var i=0;i<Math.min(a.length,30);i++)if(idx(a[i]||[],/^No Faktur Pembelian$/i)>=0&&idx(a[i]||[],/^Nama Barang$/i)>=0){hi=i;break}
  if(hi<0)throw Error('Header faktur Majoo tidak dikenali.');
  var h=a[hi],I={
    sup:idx(h,/^Nama Pemasok$/i),inv:idx(h,/^No Faktur Pembelian$/i),date:idx(h,/^Tanggal Faktur Pembelian/i),
    sku:idx(h,/^SKU$/i),item:idx(h,/^Nama Barang$/i),unit:idx(h,/^Satuan$/i),price:idx(h,/^Harga Beli$/i),
    qty:idx(h,/^Stok ditambahkan$/i),amt:idx(h,/^Total Nilai Setelah Diskon Per Produk$/i),gross:idx(h,/^Total Nilai Produk$/i),status:idx(h,/^Status$/i)
  };
  if(I.inv<0||I.date<0||I.item<0||I.status<0)throw Error('Kolom wajib Majoo tidak lengkap.');
  var out=[],ignored=0,bad=0;
  for(i=hi+1;i<a.length;i++){
    var r=a[i]||[],st=c(r[I.status]);if(!st)continue;
    if(st.toUpperCase()!=='SELESAI'){ignored++;continue}
    var d=iso(r[I.date]),p=per(d),item=c(r[I.item]),invoice=c(r[I.inv]),sku=I.sku>=0?c(r[I.sku]):'';
    var amt=I.amt>=0?num(r[I.amt]):0;if(!(amt>0)&&I.gross>=0)amt=num(r[I.gross]);
    if(!p||!item||!(amt>0)){bad++;continue}
    var q=I.qty>=0?num(r[I.qty]):0,pr=I.price>=0?num(r[I.price]):0,category=cat(item,sku);
    var key='majoo:'+n(invoice)+':'+n(sku||item)+':'+n(amt);
    out.push(ev('majoo',p,f.name,i+1,key,d,item,q,I.unit>=0?r[I.unit]:'',pr,amt,'',category,'purchase_item',{
      sku:sku,invoice:invoice,supplier:I.sup>=0?r[I.sup]:'',status:st,
      raw:{format:'majoo_invoice_export',source_sheet:sn,source_row:i+1}
    }));
  }
  if(!out.length)throw Error('Tidak ada transaksi Majoo berstatus Selesai.');
  return{rows:out,ignored:ignored,invalid:bad,label:'Faktur Majoo'};
}

function filePeriod(name,dates){
  var u=String(name||'').toUpperCase(),map={JANUARI:1,FEBRUARI:2,MARET:3,APRIL:4,MEI:5,JUNI:6,JULI:7,AGUSTUS:8,SEPTEMBER:9,OKTOBER:10,NOVEMBER:11,DESEMBER:12},m=null;
  Object.keys(map).some(function(k){if(u.indexOf(k)>=0){m=map[k];return true}});
  var y=(u.match(/20\d{2}/)||[])[0]||(dates[0]||'').slice(0,4);
  return m&&y?y+'-'+String(m).padStart(2,'0')+'-01':dates.length?dates[0].slice(0,7)+'-01':null;
}
function parseTemplate(wb,f){
  var sn=wb.SheetNames.find(function(s){return c(s).toUpperCase()==='UPLOAD_PEMBELIAN'});if(!sn)return null;
  var a=matrix(wb.Sheets[sn]),hi=-1;
  for(var i=0;i<20&&i<a.length;i++)if(c((a[i]||[])[0]).toUpperCase()==='PERIODE'){hi=i;break}
  if(hi<0)return[];
  var H={};(a[hi]||[]).forEach(function(x,j){H[c(x).toUpperCase()]=j});
  var out=[];
  for(i=hi+1;i<a.length;i++){
    var r=a[i]||[],typ=c(r[H.RECORD_TYPE]).toUpperCase(),item=c(r[H.ITEM]),amt=num(r[H.NOMINAL_AKTUAL]);
    if(!(amt>0)||typ==='DETAIL_KARYAWAN'||(typ==='DETAIL_PAYLATER'&&!item))continue;
    var pd=iso(r[H.PERIODE]),d=iso(r[H.TANGGAL]);if(!pd)continue;
    var p=pd.slice(0,7)+'-01',category=c(r[H.KATEGORI])||cat(item,''),kind=typ==='RINGKASAN_BIAYA'?'cost_component':'purchase_item';
    out.push(ev('excel',p,f.name,i+1,'excel:'+(i+1)+':'+n(d)+':'+n(item)+':'+n(amt),d,item,num(r[H.JUMLAH]),'',num(r[H.HARGA_SATUAN]),amt,c(r[H.METODE_PEMBAYARAN]),category,kind,{status:'VALID',raw:{format:'template',record_type:typ,source_sheet:sn,source_row:i+1}}));
  }
  return out;
}
function parseExcel(wb,f){
  var t=parseTemplate(wb,f);if(t!==null){if(!t.length)throw Error('Template Excel tidak berisi transaksi valid.');return{rows:t,ignored:0,invalid:0,label:'Excel Pembelian'}}
  var sn=wb.SheetNames.find(function(s){return c(s).toUpperCase()==='BELANJA'});if(!sn)throw Error('Sheet BELANJA atau UPLOAD_PEMBELIAN tidak ditemukan.');
  var a=matrix(wb.Sheets[sn]),hi=-1;
  for(var i=0;i<Math.min(a.length,30);i++){var rr=a[i]||[];if(idx(rr,/^tgl$|tanggal|date/i)>=0&&idx(rr,/nama.*bahan|nama.*barang|^bahan$|^item$|^produk$|^nama$/i)>=0){hi=i;break}}
  if(hi<0)throw Error('Header BELANJA tidak dikenali.');
  var h=a[hi],D=idx(h,/^tgl$|tanggal|date/i),N=idx(h,/nama.*bahan|nama.*barang|^bahan$|^item$|^produk$|^nama$/i),Q=idx(h,/^jumlah$|qty|quantity/i),P=idx(h,/harga.*satuan|unit price|^harga$/i),T=idx(h,/^total$|amount/i),pay=[];
  for(i=0;i<h.length;i++)if(/tunai|cash|paylater|utang|qris|rek.*mandiri|transfer/i.test(c(h[i])))pay.push(i);
  var tmp=[],dates=[],last=null;
  for(i=hi+1;i<a.length;i++){
    var r=a[i]||[],d=D>=0?iso(r[D]):null;if(d){last=d;dates.push(d)}
    var item=N>=0?c(r[N]):'';if(!item||/^TOTAL$/i.test(item)||!last)continue;
    var q=Q>=0?num(r[Q]):0,pr=P>=0?num(r[P]):0,amount=T>=0?num(r[T]):0,names=[];
    pay.forEach(function(pi){var v=num(r[pi]);if(v){if(T<0)amount+=v;names.push(c(h[pi]))}});
    if(!(amount>0)&&q&&pr)amount=q*pr;if(!(amount>0))continue;
    tmp.push({row:i+1,date:last,item:item,qty:q,price:pr,amount:amount,payment:names.join(' + ')});
  }
  var period=filePeriod(f.name,dates);if(!period)throw Error('Periode Excel tidak dapat dikenali.');
  var out=tmp.map(function(x){var category=cat(x.item,'');return ev('excel',period,f.name,x.row,'excel:'+x.row+':'+n(x.date)+':'+n(x.item)+':'+n(x.amount),x.date,x.item,x.qty,'',x.price,x.amount,x.payment,category,'purchase_item',{status:'VALID',raw:{format:'legacy_belanja',source_sheet:sn,source_row:x.row}})});
  var os=wb.SheetNames.find(function(s){return c(s).toUpperCase()==='B OPERASIONAL'});
  if(os){
    var b=matrix(wb.Sheets[os]),oh=-1;
    for(i=0;i<20&&i<b.length;i++)if(/^NO$/i.test(c((b[i]||[])[0]))&&/^JENIS$/i.test(c((b[i]||[])[1]))){oh=i;break}
    if(oh>=0)for(i=oh+1;i<b.length;i++){
      item=c((b[i]||[])[1]);if(!item)continue;if(/^TOTAL$/i.test(item))break;if(/^(BELANJA BAHAN|BELANJA KEMASAN)$/i.test(item))continue;
      amount=num((b[i]||[])[2]);if(!(amount>0))continue;var category=cat(item,'');
      out.push(ev('excel',period,f.name,10000+i,'excel:ops:'+i+':'+n(item)+':'+n(amount),null,item,0,'',0,amount,'Ringkasan biaya',category,'cost_component',{status:'VALID',raw:{format:'legacy_ops',source_sheet:os,source_row:i+1}}));
    }
  }
  if(!out.length)throw Error('Tidak ditemukan transaksi pembelian valid pada Excel.');
  return{rows:out,ignored:0,invalid:0,label:'Excel Pembelian'};
}
async function workbook(type,f){
  if(!window.XLSX&&window.__HASNARIA_XLSX_READY)await window.__HASNARIA_XLSX_READY;
  if(!window.XLSX)throw Error('Parser Excel belum siap.');
  var wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
  wb.SheetNames.forEach(function(sn){expandRef(wb.Sheets[sn])});
  return type==='majoo'?parseMajoo(wb,f):parseExcel(wb,f);
}

function legacy(r){
  var z=raw(r),category=z.analytics_category||cat(r.item_name,z.sku),kind=z.analytics_kind||(z.record_type==='RINGKASAN_BIAYA'?'cost_component':'purchase_item');
  return ev('excel_legacy',r.source_period,r.source_file||'legacy',r.row_no||1,'legacy:'+(r.id||r.row_no),r.purchase_date,r.item_name,num(r.quantity_text),r.unit_text,num(r.unit_price),num(r.total_amount),r.payment_method,category,kind,{status:'LEGACY',raw:Object.assign({},z,{legacy_offline_id:r.id||null})});
}
async function evidence(period){var q=await db.from(EVID).select('*').eq('brand_id',BRAND).eq('source_period',period).order('row_no',{ascending:true}).limit(10000);if(q.error)throw q.error;return q.data||[]}
async function seed(period){
  var x=await evidence(period);if(x.length)return x;
  var q=await db.from('offline_purchase_history').select('*').eq('brand_id',BRAND).eq('source_period',period).order('row_no',{ascending:true}).limit(10000);if(q.error)throw q.error;
  var rows=(q.data||[]).filter(function(r){return raw(r).unified_source_v1!==true}).map(legacy);
  for(var i=0;i<rows.length;i+=150){var ins=await db.from(EVID).insert(rows.slice(i,i+150));if(ins.error)throw ins.error}
  return rows;
}

function days(a,b){if(!a||!b)return 999;return Math.abs(Math.round((new Date(a+'T00:00:00')-new Date(b+'T00:00:00'))/86400000))}
function near(a,b,pct,min){var x=Math.abs((+a||0)-(+b||0)),m=Math.max(Math.abs(+a||0),Math.abs(+b||0),1);return x<=Math.max(min,m*pct)}
function kind(r){return raw(r).analytics_kind||'purchase_item'}
function rank(t){return t==='majoo'?3:t==='excel'?2:1}
function skuKey(r){return n(r&&r.sku)}
function qtyClose(a,b,pct){var x=+a||0,y=+b||0;if(!x||!y)return true;return Math.abs(x-y)<=Math.max(.001,Math.max(Math.abs(x),Math.abs(y))*pct)}
function priceClose(a,b,pct){var x=+a||0,y=+b||0;if(!x||!y)return true;return near(x,y,pct,250)}

function baseTokens(v){
  var s=c(v).toUpperCase().replace(/^#+/,' ').replace(/([0-9]+(?:[.,][0-9]+)?)\s*(KG|G|GR|GRAM|ML|L|LTR|LITER)\b/g,' ');
  var stop={PCS:1,PC:1,PACK:1,PAK:1,BUNGKUS:1,BKS:1,BOX:1,DUS:1,CTN:1,CARTON:1,ISI:1,UNIT:1};
  return s.split(/[^A-Z0-9]+/).filter(function(t){return t&&!/^\d+$/.test(t)&&!stop[t]});
}
function compactBase(v){return baseTokens(v).join('')}
function levRatio(a,b){
  a=String(a||'');b=String(b||'');if(a===b)return 1;if(!a||!b)return 0;
  if(a.length>b.length){var z=a;a=b;b=z}
  var prev=new Array(a.length+1),cur=new Array(a.length+1);for(var i=0;i<=a.length;i++)prev[i]=i;
  for(var j=1;j<=b.length;j++){
    cur[0]=j;for(i=1;i<=a.length;i++)cur[i]=Math.min(cur[i-1]+1,prev[i]+1,prev[i-1]+(a.charAt(i-1)===b.charAt(j-1)?0:1));
    z=prev;prev=cur;cur=z;
  }
  return 1-prev[a.length]/Math.max(a.length,b.length);
}
function itemSimilarity(a,b){
  var na=n(a),nb=n(b);if(na&&na===nb)return 1;
  var ta=baseTokens(a),tb=baseTokens(b),ca=ta.join(''),cb=tb.join('');if(ca&&ca===cb)return 1;
  var A={},B={},inter=0;ta.forEach(function(x){A[x]=1});tb.forEach(function(x){B[x]=1});Object.keys(A).forEach(function(x){if(B[x])inter++});
  var ua=Object.keys(A).length,ub=Object.keys(B).length,uni=ua+ub-inter,jac=uni?inter/uni:0;
  var contain=(ua>=2&&ub>=2&&Math.min(ua,ub)>0)?inter/Math.min(ua,ub):0;
  var edit=levRatio(ca||na,cb||nb);
  return Math.max(jac,contain,edit);
}
function matchDecision(a,b){
  if(!a||!b||a.source_type===b.source_type||kind(a)!==kind(b))return null;
  var dd=days(a.purchase_date,b.purchase_date);if(dd>1)return null;
  var sim=itemSimilarity(a.item_name,b.item_name),sameName=n(a.item_name)===n(b.item_name);
  var sa=skuKey(a),sb=skuKey(b),sameSku=!!(sa&&sb&&sa===sb);
  var amountExact=near(a.total_amount,b.total_amount,.005,500),amountLoose=near(a.total_amount,b.total_amount,.08,1500);
  var amountDelta=Math.abs((+a.total_amount||0)-(+b.total_amount||0));
  var qExact=qtyClose(a.quantity,b.quantity,.01),qLoose=qtyClose(a.quantity,b.quantity,.12);
  var pExact=priceClose(a.unit_price,b.unit_price,.015);
  var exactReason=null;
  if(dd===0&&amountExact&&qExact){
    if(sameSku)exactReason='same_sku_date_amount';
    else if(sameName)exactReason='same_name_date_amount';
    else if(sim>=.88&&pExact)exactReason='fuzzy_name_strong';
    else if(amountDelta<=1&&sim>=.78&&pExact)exactReason='fuzzy_name_same_amount';
  }
  if(exactReason)return{level:'exact',reason:exactReason,similarity:sim,days:dd,amount_delta:amountDelta};
  if(amountLoose&&qLoose&&(sameSku||sameName||sim>=.68))return{level:'possible',reason:sameSku?'sku_near':sameName?'name_near':'fuzzy_name_possible',similarity:sim,days:dd,amount_delta:amountDelta};
  return null;
}
function matchMeta(r,d){return{source_type:r.source_type,source_file:r.source_file,source_record_key:r.source_record_key,item_name:r.item_name,sku:r.sku||null,purchase_date:r.purchase_date,total_amount:r.total_amount,match_reason:d.reason,name_similarity:+d.similarity.toFixed(3),date_distance_days:d.days,amount_delta:d.amount_delta}}
function canon(rows){
  var a=rows.slice().sort(function(x,y){return rank(y.source_type)-rank(x.source_type)||String(x.purchase_date||'').localeCompare(String(y.purchase_date||''))});
  var sel=[],dups=0,poss=0,fuzzy=0;
  for(var k=0;k<a.length;k++){
    var r=a[k],best=null;
    for(var i=0;i<sel.length;i++){
      var d=matchDecision(r,sel[i].row);if(!d||d.level!=='exact')continue;
      var score=d.similarity-(d.amount_delta/Math.max(+r.total_amount||1,+sel[i].row.total_amount||1));
      if(!best||score>best.score)best={slot:sel[i],decision:d,score:score};
    }
    if(best){dups++;if(/^fuzzy_/.test(best.decision.reason))fuzzy++;best.slot.matches.push(matchMeta(r,best.decision));continue}
    sel.push({row:r,matches:[],possibleMatches:[]});
  }
  for(i=0;i<sel.length;i++)for(var j=i+1;j<sel.length;j++){
    var pd=matchDecision(sel[i].row,sel[j].row);if(pd&&pd.level==='possible'){
      poss++;
      sel[i].possibleMatches.push(matchMeta(sel[j].row,pd));
      sel[j].possibleMatches.push(matchMeta(sel[i].row,pd));
    }
  }
  return{selected:sel,exact:dups,fuzzy:fuzzy,possible:poss};
}

async function rebuild(period){
  var e=await evidence(period),x=canon(e);
  var rows=x.selected.map(function(s,i){
    var r=s.row,z=raw(r),category=z.analytics_category||cat(r.item_name,r.sku),group=z.analytics_group||grp(r.item_name,category);
    return{
      brand_id:BRAND,source_period:period,source_file:'HASNARIA_PURCHASE_UNIFIED_'+period.slice(0,7)+'.xlsx',row_no:i+1,
      purchase_date:r.purchase_date,item_name:r.item_name,quantity_text:r.quantity==null?'':String(r.quantity),unit_text:r.unit_text||'',unit_price:r.unit_price,total_amount:r.total_amount,payment_method:r.payment_method||'',
      notes:group+' · '+category+' · UNIFIED',
      raw_data:Object.assign({},z,{unified_source_v1:true,dedup_version:'v2_fuzzy',canonical_source_type:r.source_type,canonical_source_file:r.source_file,canonical_source_record_key:r.source_record_key,matched_sources:s.matches,possible_duplicate:s.possibleMatches.length>0,possible_duplicate_matches:s.possibleMatches,analytics_group:group,analytics_category:category,analytics_kind:kind(r),sku:r.sku||null,invoice_no:r.invoice_no||null,supplier_name:r.supplier_name||null})
    };
  });
  var d=await db.from('offline_purchase_history').delete().eq('brand_id',BRAND).eq('source_period',period);if(d.error)throw d.error;
  for(var i=0;i<rows.length;i+=150){var ins=await db.from('offline_purchase_history').insert(rows.slice(i,i+150));if(ins.error)throw ins.error}
  return{rows:rows.length,exact:x.exact,fuzzy:x.fuzzy,possible:x.possible};
}
async function preview(period,type,candidate){
  var e=await evidence(period);
  if(!e.length){var q=await db.from('offline_purchase_history').select('*').eq('brand_id',BRAND).eq('source_period',period).limit(10000);if(q.error)throw q.error;e=(q.data||[]).filter(function(r){return raw(r).unified_source_v1!==true}).map(legacy)}
  e=e.filter(function(r){return type==='excel'?(r.source_type!=='excel'&&r.source_type!=='excel_legacy'):r.source_type!==type});
  return canon(e.concat(candidate));
}
async function save(type,p){
  var by={};p.rows.forEach(function(r){(by[r.source_period]||(by[r.source_period]=[])).push(r)});
  var periods=Object.keys(by).sort(),sum=[];
  for(var k=0;k<periods.length;k++){
    var period=periods[k];await seed(period);
    var del=db.from(EVID).delete().eq('brand_id',BRAND).eq('source_period',period);
    del=type==='excel'?del.in('source_type',['excel','excel_legacy']):del.eq('source_type',type);
    var d=await del;if(d.error)throw d.error;
    var rows=by[period];for(var i=0;i<rows.length;i+=150){var ins=await db.from(EVID).insert(rows.slice(i,i+150));if(ins.error)throw ins.error}
    sum.push(await rebuild(period));
  }
  return sum;
}

function toast(msg,type,ttl){var old=document.getElementById('purchaseDualToast');if(old)old.remove();var x=document.createElement('div');x.id='purchaseDualToast';x.className='purchase-dual-toast '+(type||'info');x.textContent=msg;document.body.appendChild(x);if(ttl!==0)setTimeout(function(){if(x.isConnected)x.remove()},ttl||4500)}
function busy(on){['purchaseExcelBtn','purchaseMajooBtn'].forEach(function(id){var b=document.getElementById(id);if(b)b.disabled=!!on})}
async function handle(type,f){
  db=db||window.__HASNARIA_DB;if(!db)return toast('Database belum siap.','error');
  busy(true);toast('Membaca dan memvalidasi '+f.name+'…','info',0);
  try{
    var p=await workbook(type,f),by={};p.rows.forEach(function(r){(by[r.source_period]||(by[r.source_period]=[])).push(r)});
    var periods=Object.keys(by).sort(),dups=0,fuzzy=0,poss=0;
    for(var i=0;i<periods.length;i++){var v=await preview(periods[i],type,by[periods[i]]);dups+=v.exact;fuzzy+=v.fuzzy;poss+=v.possible}
    var total=p.rows.reduce(function(a,r){return a+(+r.total_amount||0)},0);
    var msg=p.label+'\n'+p.rows.length+' baris valid · '+money(total)+' · '+periods.map(pLabel).join(', ')+'\n\n'+dups+' duplikat pasti akan dihitung 1x';
    if(fuzzy)msg+=' ('+fuzzy+' terdeteksi dari nama barang mirip)';
    if(poss)msg+='\n'+poss+' possible duplicate tetap dihitung dan ditandai untuk audit';
    if(p.ignored)msg+='\n'+p.ignored+' transaksi Void/non-Selesai diabaikan';
    if(p.invalid)msg+='\n'+p.invalid+' baris tidak valid diabaikan';
    if(!confirm(msg+'\n\nSimpan ke backend Pembelian?')){busy(false);return toast('Upload dibatalkan.','info')}
    toast('Menyimpan evidence dan membangun transaksi canonical…','info',0);
    var s=await save(type,p),r=s.reduce(function(a,x){a.rows+=x.rows;a.exact+=x.exact;a.fuzzy+=x.fuzzy;a.possible+=x.possible;return a},{rows:0,exact:0,fuzzy:0,possible:0});
    toast('Selesai: '+r.rows+' transaksi canonical · '+r.exact+' duplikat digabung'+(r.fuzzy?' ('+r.fuzzy+' fuzzy)':'')+(r.possible?' · '+r.possible+' possible duplicate':'')+'.','success',0);
    setTimeout(function(){location.reload()},1200);
  }catch(e){console.error(e);toast('Upload gagal: '+(e.message||e),'error',7000);busy(false)}
}
function patch(){
  var w=document.querySelector('#pembelian .pa-upload-wrap');if(!w)return;
  if(w.classList.contains('purchase-dual-upload-v2'))return;
  w.classList.remove('purchase-dual-upload');w.classList.add('purchase-dual-upload-v2','purchase-dual-upload');
  w.innerHTML='<input id="purchaseExcelFile" type="file" accept=".xlsx,.xls" hidden><input id="purchaseMajooFile" type="file" accept=".xlsx,.xls" hidden><div class="purchase-dual-buttons"><button id="purchaseExcelBtn" class="purchase-source-btn excel" type="button">Upload Excel</button><button id="purchaseMajooBtn" class="purchase-source-btn majoo" type="button">Upload Faktur Majoo</button></div><small class="purchase-source-hint">2 sumber · fuzzy dedup v2 aktif</small>';
  var eb=document.getElementById('purchaseExcelBtn'),mb=document.getElementById('purchaseMajooBtn'),ef=document.getElementById('purchaseExcelFile'),mf=document.getElementById('purchaseMajooFile');
  eb.onclick=function(){ef.click()};mb.onclick=function(){mf.click()};
  ef.onchange=function(){if(this.files[0])handle('excel',this.files[0]);this.value=''};
  mf.onchange=function(){if(this.files[0])handle('majoo',this.files[0]);this.value=''};
}
function schedule(){clearTimeout(timer);timer=setTimeout(patch,40)}
function boot(){
  db=window.__HASNARIA_DB||null;var tries=0;
  (function wait(){db=db||window.__HASNARIA_DB||null;var h=document.getElementById('pembelian');if(db&&h){obs=new MutationObserver(schedule);obs.observe(h,{childList:true,subtree:false});document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-tab="pembelian"]'))setTimeout(schedule,50)},true);schedule();return}if(tries++<120)setTimeout(wait,100)})();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
