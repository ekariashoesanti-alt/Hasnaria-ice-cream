/* Hasnaria Majoo normalized sales importer v2 — audit-hardened */
(function () {
  'use strict';
  function norm(v){return String(v==null?'':v).trim().toLowerCase().replace(/\s+/g,' ').replace(/[‐‑‒–—]/g,'-');}
  function num(v){if(v==null||v==='')return 0;if(typeof v==='number'&&isFinite(v))return v;var s=String(v).trim().replace(/rp\.?/ig,'').replace(/\s/g,'');if(!s)return 0;if(/^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s))s=s.replace(/\./g,'').replace(',','.');else if(/^[-+]?\d+(?:,\d+)?$/.test(s))s=s.replace(',','.');else s=s.replace(/[^0-9.-]/g,'');var n=Number(s);return isFinite(n)?n:0;}
  function pick(keys,pats){for(var i=0;i<keys.length;i++)for(var j=0;j<pats.length;j++)if(pats[j].test(keys[i]))return keys[i];return null;}
  function parseDateTime(v){
    if(v==null||v==='')return null;
    if(v instanceof Date&&!isNaN(v.getTime())){
      var y=v.getFullYear(),mo=String(v.getMonth()+1).padStart(2,'0'),da=String(v.getDate()).padStart(2,'0');
      var hh=String(v.getHours()).padStart(2,'0'),mi=String(v.getMinutes()).padStart(2,'0'),ss=String(v.getSeconds()).padStart(2,'0');
      return y+'-'+mo+'-'+da+'T'+hh+':'+mi+':'+ss+ '+07:00';
    }
    var s=String(v).trim(),m=s.match(/^(\d{1,2})[-\/]([01]?\d)[-\/](\d{4})(?:\s+|T)([01]?\d):([0-5]\d)(?::([0-5]\d))?$/);
    if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0')+'T'+String(m[4]).padStart(2,'0')+':'+m[5]+':'+String(m[6]||'00').padStart(2,'0')+'+07:00';
    m=s.match(/^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)(?:\s+|T)([01]?\d):([0-5]\d)(?::([0-5]\d))?$/);
    if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0')+'T'+String(m[4]).padStart(2,'0')+':'+m[5]+':'+String(m[6]||'00').padStart(2,'0')+'+07:00';
    return null;
  }
  function parseHour(v){
    if(v==null||v==='')return null;
    if(v instanceof Date&&!isNaN(v.getTime()))return v.getHours();
    var s=String(v).trim(),m=s.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:\s|$)/);
    return m?Number(m[1]):null;
  }
  function parseDate(v){
    var dt=parseDateTime(v);
    if(dt)return dt.slice(0,10);
    if(!v)return null;
    var s=String(v).trim(),m=s.match(/(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)/);
    if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
    m=s.match(/([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})/);
    if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
    var d=new Date(s);
    return isNaN(d.getTime())?null:d.toISOString().slice(0,10);
  }
  function paymentKey(v){var s=norm(v);if(!s)return null;if(/qris|quick response|qr/.test(s))return'qris';if(/transfer|bank|bca|bri|bni|mandiri|bsi|tf/.test(s))return'tf';if(/cash|tunai|uang tunai/.test(s))return'cash';return null;}
  function isVoided(v){return /void|refund|dikembalikan|batal|cancel/.test(norm(v));}
  function hashText(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return('00000000'+(h>>>0).toString(16)).slice(-8);}
  async function sha256(file){try{if(window.crypto&&crypto.subtle){var b=await file.arrayBuffer(),d=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(d)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');}}catch(_){}return hashText(file.name+'|'+file.size+'|'+file.lastModified);}
  function stripToken(notes,name){return String(notes||'').replace(new RegExp('\\s*⟦'+name+':[^⟧]*⟧','g'),'').trim();}
  function makeDailyNotes(oldNotes,d){var base=stripToken(stripToken(oldNotes,'PAY'),'SKU');var pay='⟦PAY:cash='+Math.round(d.cash)+'|qris='+Math.round(d.qris)+'|tf='+Math.round(d.tf)+'⟧';var keys=Object.keys(d.skus).sort();var sku=keys.length?'⟦SKU:'+keys.map(function(k){return String(k).replace(/[|=⟦⟧]/g,' ')+'='+Math.round(d.skus[k]);}).join('|')+'⟧':'';return[pay,sku,base].filter(Boolean).join(' ');}

  async function run(fileOrFiles,ctx){
    var files=Array.isArray(fileOrFiles)?fileOrFiles:(fileOrFiles?[fileOrFiles]:[]);if(!files.length)return;
    var STATE=ctx.STATE,BRAND=ctx.BRAND,SB=ctx.SB,KEY=ctx.KEY,setImportStatus=ctx.setImportStatus,draw=ctx.draw,getFileMatrix=ctx.getFileMatrix,loadMetrics=ctx.loadMetrics,getTok=ctx.getTok;
    STATE.importing=true;STATE.error='';STATE.msg='';setImportStatus('progress','Membaca Majoo','Membangun transaksi unik tanpa mengubah data lama…',5);draw();
    try{
      var rawTx=[];
      for(var fi=0;fi<files.length;fi++){
        var file=files[fi];setImportStatus('progress','Membaca file '+(fi+1)+'/'+files.length,file.name,8+Math.round(fi/files.length*20));draw();
        var matrix=await getFileMatrix(file),rows=[];for(var r=0;r<matrix.length;r++){var raw=matrix[r]||[];if(raw.some(function(x){return String(x||'').trim();}))rows.push(raw);}
        var headerIdx=-1,headers=[];for(var hi=0;hi<Math.min(30,rows.length);hi++){var hs=rows[hi].map(norm);if(hs.some(function(x){return /no transaksi|order id|nomor transaksi|no order|struk/.test(x);})&&hs.some(function(x){return /produk|item|penjualan|waktu|tanggal/.test(x);})){headerIdx=hi;headers=hs;break;}}
        if(headerIdx<0)throw new Error('Format Detail Transaksi Majoo tidak terdeteksi pada '+file.name+'.');
        var data=rows.slice(headerIdx+1).map(function(a){var o={};headers.forEach(function(h,i){if(h)o[h]=a[i];});return o;});
        var kId=pick(headers,[/no transaksi/,/nomor transaksi/,/order id/,/no order/,/struk/]),kOrder=pick(headers,[/^waktu order$/,/waktu order/]),kDate=kOrder||pick(headers,[/^tanggal$/,/^tgl$/,/^date$/,/tanggal/,/tgl/,/date/]),kProd=pick(headers,[/^produk$/,/nama produk/,/^item$/]),kSku=pick(headers,[/^sku$/,/kode sku/,/kode produk/]),kQty=pick(headers,[/^qty$/,/^jumlah$/,/quantity/]),kTotal=pick(headers,[/penjualan bersih/,/total penjualan/,/penjualan rp/,/omzet/,/omset/,/^penjualan$/,/^total$/]),kPay=pick(headers,[/metode pembayaran/,/metode bayar/,/^pembayaran$/,/payment/]),kStatus=pick(headers,[/status pembayaran/,/^status$/,/status transaksi/]),kUnit=pick(headers,[/harga jual/,/harga satuan/,/unit price/,/^harga$/]);
        if(!kId||!kDate)throw new Error('Kolom ID transaksi atau tanggal tidak ditemukan pada '+file.name+'.');
        var groups={};data.forEach(function(row){var id=String(row[kId]||'').trim();if(!id)return;var date=parseDate(row[kDate]);if(!date)return;var orderDt=kOrder?parseDateTime(row[kOrder]):null;var g=groups[id]||(groups[id]={id:id,date:date,datetime:orderDt,hour:orderDt?parseHour(row[kOrder]):null,total:0,cash:0,qris:0,tf:0,status:'',items:[]});if(orderDt){if(!g.datetime)g.datetime=orderDt;g.date=orderDt.slice(0,10);g.hour=parseHour(row[kOrder]);}if(kStatus&&row[kStatus])g.status=String(row[kStatus]);var t=num(kTotal?row[kTotal]:0);if(t>0)g.total=Math.max(g.total,t);var pm=paymentKey(kPay?row[kPay]:'');if(pm&&t>0)g[pm]=Math.max(g[pm],t);var name=String(kProd?row[kProd]:'').trim(),sku=String(kSku?row[kSku]:'').trim(),qty=num(kQty?row[kQty]:0),unit=num(kUnit?row[kUnit]:0);if(name||sku)g.items.push({name:name||sku,sku:sku,qty:qty>0?qty:1,unit_price:unit>0?unit:0});});
        Object.keys(groups).forEach(function(id){var g=groups[id];if(!g.total)g.total=g.items.reduce(function(s,it){return s+(it.unit_price*it.qty);},0);rawTx.push(g);});
      }
      var txMap={};rawTx.forEach(function(g){var p=txMap[g.id];if(!p){txMap[g.id]=g;return;}p.total=Math.max(p.total||0,g.total||0);p.cash=Math.max(p.cash||0,g.cash||0);p.qris=Math.max(p.qris||0,g.qris||0);p.tf=Math.max(p.tf||0,g.tf||0);if(!p.status&&g.status)p.status=g.status;if((g.items||[]).length>(p.items||[]).length)p.items=g.items;});
      var txs=Object.keys(txMap).map(function(k){return txMap[k];}),active=txs.filter(function(g){return!isVoided(g.status);}),excluded=txs.length-active.length;if(!active.length)throw new Error('Tidak ada transaksi aktif setelah transaksi void/refund dikeluarkan.');
      setImportStatus('progress','Rekonsiliasi awal',active.length.toLocaleString('id-ID')+' transaksi aktif · '+excluded+' void/refund dikeluarkan',32);draw();
      var tok=await getTok();if(!tok)throw new Error('Sesi login belum siap. Silakan masuk kembali.');
      async function api(path,opts){var cfg=opts||{};cfg.headers=Object.assign({apikey:KEY,Authorization:'Bearer '+tok},cfg.headers||{});var rr=await fetch(SB+'/rest/v1/'+path,cfg),txt=await rr.text();if(!rr.ok)throw new Error(txt||('Supabase '+rr.status));if(!txt)return null;try{return JSON.parse(txt);}catch(_){return null;}}
      var products=await api('products?brand_id=eq.'+encodeURIComponent(BRAND)+'&select=id,name,sku&limit=5000')||[],bySku={},byName={};products.forEach(function(p){if(p.sku)bySku[norm(p.sku)]=p;if(p.name&&p.name.indexOf('HASNARIA_')!==0)byName[norm(p.name)]=p;});
      var hashes=[];for(var fh=0;fh<files.length;fh++)hashes.push(await sha256(files[fh]));var fileHash=hashes.join(','),dup=await api('sales_import_batches?brand_id=eq.'+encodeURIComponent(BRAND)+'&file_hash=eq.'+encodeURIComponent(fileHash)+'&status=eq.completed&select=id&limit=1')||[];var isReimport=dup.length>0;if(isReimport){setImportStatus('progress','Memperbarui import Majoo','File sebelumnya sudah pernah diimpor. Data transaksi akan di-merge aman; jam Waktu Order akan dilengkapi bila tersedia.',34);draw();}
      var from=active.reduce(function(m,g){return!m||g.date<m?g.date:m;},null),to=active.reduce(function(m,g){return!m||g.date>m?g.date:m;},null),totalAmount=active.reduce(function(s,g){return s+(g.total||0);},0),filename=files.map(function(f){return f.name;}).join(', ');
      var batch=await api('sales_import_batches',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({brand_id:BRAND,filename:filename,file_hash:fileHash,source:'majoo',period_from:from,period_to:to,row_count:rawTx.length,transaction_count:active.length,total_amount:totalAmount,status:'preview'})}),batchId=batch&&batch[0]&&batch[0].id;if(!batchId)throw new Error('Gagal membuat sales_import_batches.');
      try{
        var existingSales=[],existingByExt={};var needsExistingTime=active.some(function(g){return g.hour==null;});if(needsExistingTime){var existingIds=active.map(function(g){return g.id;});for(var esi=0;esi<existingIds.length;esi+=80){var eids=existingIds.slice(esi,esi+80);var egot=await api('sales?brand_id=eq.'+encodeURIComponent(BRAND)+'&external_transaction_id=in.('+eids.map(encodeURIComponent).join(',')+')&select=id,external_transaction_id,sold_at,sold_hour,notes,total_amount,cash_amount,qris_amount,tf_amount&limit=5000')||[];existingSales=existingSales.concat(egot);}existingSales.forEach(function(s){existingByExt[s.external_transaction_id]=s;});}var salesRows=active.map(function(g){var ex=existingByExt[g.id]||{};return{brand_id:BRAND,external_transaction_id:g.id,source_batch_id:batchId,sold_at:g.date||ex.sold_at||null,sold_hour:g.hour!=null?g.hour:(ex.sold_hour!=null?ex.sold_hour:null),transaction_count:1,total_amount:Math.round(g.total||ex.total_amount||0),cash_amount:Math.round(g.cash||ex.cash_amount||0),qris_amount:Math.round(g.qris||ex.qris_amount||0),tf_amount:Math.round(g.tf||ex.tf_amount||0),channel:'majoo',notes:g.status?'status='+g.status:(ex.notes||null)};});
        var saved=await api('sales?on_conflict=brand_id,external_transaction_id',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(salesRows)})||[],saleByExt={};saved.forEach(function(s){saleByExt[s.external_transaction_id]=s;});
        if(Object.keys(saleByExt).length<active.length){for(var si=0;si<active.length;si+=80){var ids=active.slice(si,si+80).map(function(g){return encodeURIComponent(g.id);});var got=await api('sales?brand_id=eq.'+encodeURIComponent(BRAND)+'&external_transaction_id=in.('+ids.join(',')+')&select=id,external_transaction_id')||[];got.forEach(function(s){saleByExt[s.external_transaction_id]=s;});}}
        var allItems=[],unmatched={};active.forEach(function(g){var sale=saleByExt[g.id];if(!sale)return;(g.items||[]).forEach(function(it){var pr=(it.sku&&bySku[norm(it.sku)])||byName[norm(it.name)]||null;if(!pr)unmatched[it.sku||it.name||'(tanpa nama)']=(unmatched[it.sku||it.name||'(tanpa nama)']||0)+1;allItems.push({sale_id:sale.id,product_id:pr?pr.id:null,item_name:it.name||it.sku||'(tanpa nama)',external_sku:it.sku||null,qty:Math.max(1,Math.round(it.qty||1)),unit_price:Math.round(it.unit_price||0),unit_cogs:0});});});
        var saleIds=Object.keys(saleByExt).map(function(k){return saleByExt[k].id;});var incomingSaleIds=active.filter(function(g){return(g.items||[]).length>0;}).map(function(g){return saleByExt[g.id]&&saleByExt[g.id].id;}).filter(Boolean);for(var di=0;di<incomingSaleIds.length;di+=60){var ds=incomingSaleIds.slice(di,di+60);await api('sale_items?sale_id=in.('+ds.map(encodeURIComponent).join(',')+')',{method:'DELETE',headers:{Prefer:'return=minimal'}});}
        for(var ii=0;ii<allItems.length;ii+=100){var chunk=allItems.slice(ii,ii+100);await api('sale_items',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(chunk)});setImportStatus('progress','Menyimpan detail produk',Math.min(allItems.length,ii+100)+'/'+allItems.length+' baris',58+Math.round((Math.min(allItems.length,ii+100)/Math.max(1,allItems.length))*20));draw();}
        var days={};active.forEach(function(g){var d=days[g.date]||(days[g.date]={omzet:0,trx:0,cash:0,qris:0,tf:0,skus:{}});d.omzet+=g.total||0;d.trx++;d.cash+=g.cash||0;d.qris+=g.qris||0;d.tf+=g.tf||0;(g.items||[]).forEach(function(it){var n=it.name||it.sku||'(tanpa nama)';d.skus[n]=(d.skus[n]||0)+(it.qty||1);});});
        var old=await api('daily_metrics?brand_id=eq.'+encodeURIComponent(BRAND)+'&metric_date=gte.'+from+'&metric_date=lte.'+to+'&select=metric_date,notes&limit=5000')||[],oldMap={};old.forEach(function(r){oldMap[r.metric_date]=r.notes||'';});var daily=Object.keys(days).sort().map(function(date){var d=days[date];return{brand_id:BRAND,metric_date:date,cash_revenue:Math.round(d.omzet),transactions:d.trx,notes:makeDailyNotes(oldMap[date],d)};});
        for(var dpi=0;dpi<daily.length;dpi+=80)await api('daily_metrics?on_conflict=brand_id,metric_date',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(daily.slice(dpi,dpi+80))});
        await api('sales_import_batches?id=eq.'+encodeURIComponent(batchId),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({status:isReimport?'replaced':'completed'})});
        STATE.stagedFiles=[];STATE.stagedFileType='';STATE.importing=false;STATE.importProgress='';var unmatchedCount=Object.keys(unmatched).length;setImportStatus('success','Import Majoo selesai',active.length.toLocaleString('id-ID')+' transaksi · '+allItems.length.toLocaleString('id-ID')+' item · '+excluded+' void/refund dikeluarkan'+(unmatchedCount?' · '+unmatchedCount+' produk disimpan sebagai raw item':''),100);STATE.msg='✓ Import Majoo ternormalisasi selesai tanpa menggandakan transaksi.';STATE.error='';await loadMetrics();draw();
      }catch(writeErr){try{await api('sales_import_batches?id=eq.'+encodeURIComponent(batchId),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({status:'failed'})});}catch(_){}throw writeErr;}
    }catch(e){STATE.importing=false;STATE.importProgress='';setImportStatus('error','Import Majoo gagal',e&&e.message?e.message:'Terjadi kesalahan.');STATE.error='Gagal import: '+(e&&e.message?e.message:e);STATE.msg='';draw();}
  }
  window.__HASNARIA_IMPORT_V2=run;
})();
