/* Hasnaria Majoo normalized sales importer v1 */
(function(){
  'use strict';
  function norm(v){return String(v==null?'':v).trim().toLowerCase().replace(/\s+/g,' ').replace(/[‐‑‒–—]/g,'-');}
  function num(v){
    if(v==null||v==='') return 0;
    if(typeof v==='number'&&isFinite(v)) return v;
    var s=String(v).trim().replace(/rp\.?/ig,'').replace(/\s/g,'');
    if(!s) return 0;
    if(/^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
    else if(/^[-+]?\d+(?:,\d+)?$/.test(s)) s=s.replace(',','.');
    else s=s.replace(/[^0-9.-]/g,'');
    var n=Number(s); return isFinite(n)?n:0;
  }
  function pick(keys,pats){for(var i=0;i<keys.length;i++)for(var j=0;j<pats.length;j++)if(pats[j].test(keys[i]))return keys[i];return null;}
  function parseDate(v){
    if(!v)return null;
    if(v instanceof Date&&!isNaN(v.getTime()))return v.toISOString().slice(0,10);
    var s=String(v).trim(),m=s.match(/(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)/);if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
    m=s.match(/([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})/);if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
    var d=new Date(s);return isNaN(d.getTime())?null:d.toISOString().slice(0,10);
  }
  function paymentKey(v){var s=norm(v);if(!s)return null;if(/qris|quick response|qr/.test(s))return'qris';if(/transfer|bank|bca|bri|bni|mandiri|bsi|tf/.test(s))return'tf';if(/cash|tunai|uang tunai/.test(s))return'cash';return null;}
  function isVoidedOrRefunded(v){return /void|refund|dikembalikan|batal|cancel/.test(norm(v));}
  function hashText(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return('00000000'+(h>>>0).toString(16)).slice(-8);}
  async function sha256(file){try{if(window.crypto&&crypto.subtle){var b=await file.arrayBuffer(),d=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(d)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');}}catch(e){}return hashText(file.name+'|'+file.size+'|'+file.lastModified);}
  async function run(fileOrFiles,ctx){
    var files=Array.isArray(fileOrFiles)?fileOrFiles:(fileOrFiles?[fileOrFiles]:[]);if(!files.length)return;
    var STATE=ctx.STATE,BRAND=ctx.BRAND,SB=ctx.SB,KEY=ctx.KEY,setImportStatus=ctx.setImportStatus,draw=ctx.draw,getFileMatrix=ctx.getFileMatrix,loadMetrics=ctx.loadMetrics,getTok=ctx.getTok;
    STATE.importing=true;STATE.error='';STATE.msg='';setImportStatus('progress','Phase 2 — membaca Majoo','Membangun transaksi unik dan item produk…',5);draw();
    try{
      var all=[];
      for(var fi=0;fi<files.length;fi++){
        var file=files[fi];setImportStatus('progress','Membaca file '+(fi+1)+'/'+files.length,file.name,8+Math.round(fi/files.length*20));draw();
        var matrix=await getFileMatrix(file),rows=[];for(var r=0;r<matrix.length;r++){var raw=matrix[r]||[];if(raw.some(function(x){return String(x||'').trim();}))rows.push(raw);}
        var headerIdx=-1,headers=[];for(var hi=0;hi<Math.min(30,rows.length);hi++){var hs=rows[hi].map(function(x){return norm(x);});if(hs.some(function(x){return /no transaksi|order id|nomor transaksi|no order|struk/.test(x);})&&hs.some(function(x){return /produk|item|penjualan|waktu|tanggal/.test(x);})){headerIdx=hi;headers=hs;break;}}
        if(headerIdx<0)throw new Error('Format Detail Transaksi Majoo tidak terdeteksi pada '+file.name+'. Pastikan file memiliki No Transaksi dan Produk.');
        var data=rows.slice(headerIdx+1).map(function(a){var o={};headers.forEach(function(h,i){if(h)o[h]=a[i];});return o;});
        var kId=pick(headers,[/no transaksi/,/nomor transaksi/,/order id/,/no order/,/struk/]),kDate=pick(headers,[/waktu order/,/waktu bayar/,/tanggal/,/tgl/,/date/,/waktu/]),kProd=pick(headers,[/^produk$/,/nama produk/,/^item$/,/sku/]),kSku=pick(headers,[/^sku$/,/kode sku/,/kode produk/]),kQty=pick(headers,[/^qty$/,/jumlah/,/quantity/]),kTotal=pick(headers,[/penjualan bersih/,/total penjualan/,/penjualan rp/,/omzet/,/omset/,/^penjualan$/,/total/]),kPay=pick(headers,[/metode pembayaran/,/metode bayar/,/pembayaran/,/payment/]),kStatus=pick(headers,[/status pembayaran/,/^status$/,/status transaksi/]),kUnit=pick(headers,[/harga jual/,/harga satuan/,/unit price/,/harga/]);
        if(!kId||!kDate)throw new Error('Kolom ID transaksi atau tanggal tidak ditemukan pada '+file.name+'.');
        var groups={};data.forEach(function(row){var id=String(row[kId]||'').trim();if(!id)return;var d=parseDate(row[kDate]);if(!d)return;var g=groups[id]||(groups[id]={id:id,date:d,total:null,cash:0,qris:0,tf:0,items:[],status:kStatus?String(row[kStatus]||''):''});if(kStatus&&row[kStatus])g.status=String(row[kStatus]);var t=num(kTotal?row[kTotal]:0);if(g.total==null&&t>0)g.total=t;var pm=paymentKey(kPay?row[kPay]:'');if(pm&&t>0)g[pm]=Math.max(g[pm],t);var prod=String(kProd?row[kProd]:'').trim(),sku=String(kSku?row[kSku]:'').trim(),q=num(kQty?row[kQty]:0),up=num(kUnit?row[kUnit]:0);if(prod||sku)g.items.push({name:prod,sku:sku,qty:q>0?q:1,unit_price:up>0?up:null,rev:up>0&&q>0?up*q:null});});
        Object.keys(groups).forEach(function(id){var g=groups[id];g.file=file.name;all.push(g);});
      }
      var txMap={};all.forEach(function(g){if(!txMap[g.id])txMap[g.id]=g;else{txMap[g.id].items=txMap[g.id].items.concat(g.items||[]);}});var txs=Object.keys(txMap).map(function(k){return txMap[k];}),duplicateTransactions=all.length-txs.length,active=txs.filter(function(g){return!isVoidedOrRefunded(g.status);});
      var totalAmount=active.reduce(function(s,g){return s+(g.total||0);},0),cash=active.reduce(function(s,g){return s+g.cash;},0),qris=active.reduce(function(s,g){return s+g.qris;},0),tf=active.reduce(function(s,g){return s+g.tf;},0);
      setImportStatus('progress','Rekonsiliasi awal',txs.length.toLocaleString('id-ID')+' transaksi unik · '+duplicateTransactions+' duplikat ID',32);draw();
      var tok=await getTok();if(!tok)throw new Error('Sesi login belum siap. Silakan masuk kembali.');
      async function api(path,opts){var cfg=opts||{};cfg.headers=Object.assign({apikey:KEY,Authorization:'Bearer '+tok},cfg.headers||{});var rr=await fetch(SB+'/rest/v1/'+path,cfg),txt=await rr.text();if(!rr.ok)throw new Error(txt||('Supabase '+rr.status));if(!txt)return null;try{return JSON.parse(txt);}catch(e){return null;}}
      var products=await api('products?brand_id=eq.'+encodeURIComponent(BRAND)+'&select=id,name,sku&limit=5000')||[],bySku={},byName={};products.forEach(function(p){if(p.sku)bySku[norm(p.sku)]=p;if(p.name)byName[norm(p.name)]=p;});
      var unmatched={};txs.forEach(function(g){(g.items||[]).forEach(function(it){var pr=(it.sku&&bySku[norm(it.sku)])||byName[norm(it.name)]||null;if(!pr)unmatched[it.sku||it.name||'(tanpa nama)']=(unmatched[it.sku||it.name||'(tanpa nama)']||0)+1;});});
      if(Object.keys(unmatched).length)throw new Error('Ada '+Object.keys(unmatched).length+' produk Majoo yang belum terpetakan ke tabel products: '+Object.keys(unmatched).slice(0,8).join(', ')+(Object.keys(unmatched).length>8?' …':''));
      var hashes=[];for(var fh=0;fh<files.length;fh++)hashes.push(await sha256(files[fh]));
      var filename=files.map(function(f){return f.name;}).join(', '),from=txs.reduce(function(m,g){return!m||g.date<m?g.date:m;},null),to=txs.reduce(function(m,g){return!m||g.date>m?g.date:m;},null);
      var batch=await api('sales_import_batches',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({brand_id:BRAND,filename:filename,file_hash:hashes.join(','),source:'majoo',period_from:from,period_to:to,row_count:all.length,transaction_count:txs.length,total_amount:totalAmount,status:'preview'})});var batchId=batch&&batch[0]&&batch[0].id;if(!batchId)throw new Error('Gagal membuat sales_import_batches.');
      var salesRows=txs.map(function(g){return{brand_id:BRAND,external_transaction_id:g.id,source_batch_id:batchId,sold_at:g.date,transaction_count:1,total_amount:g.total||0,cash_amount:g.cash||0,qris_amount:g.qris||0,tf_amount:g.tf||0,channel:'majoo',notes:g.status?'status='+g.status:null};});
      var saved=await api('sales?on_conflict=brand_id,external_transaction_id',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(salesRows)})||[],saleByExt={};saved.forEach(function(s){saleByExt[s.external_transaction_id]=s;});
      if(!saved.length){var ids=txs.map(function(g){return encodeURIComponent(g.id);});for(var si=0;si<ids.length;si+=80){var got=await api('sales?brand_id=eq.'+encodeURIComponent(BRAND)+'&external_transaction_id=in.('+ids.slice(si,si+80).join(',')+')&select=id,external_transaction_id')||[];got.forEach(function(s){saleByExt[s.external_transaction_id]=s;});}}
      var allItems=[];Object.keys(saleByExt).forEach(function(id){var sale=saleByExt[id],src=txMap[id];(src.items||[]).forEach(function(it){var pr=(it.sku&&bySku[norm(it.sku)])||byName[norm(it.name)];if(pr)allItems.push({sale_id:sale.id,product_id:pr.id,qty:it.qty,unit_price:it.unit_price||0,unit_cogs:0});});});
      var saleIds=Object.keys(saleByExt).map(function(k){return saleByExt[k].id;});for(var di=0;di<saleIds.length;di+=60){var ds=saleIds.slice(di,di+60);await api('sale_items?sale_id=in.('+ds.map(encodeURIComponent).join(',')+')',{method:'DELETE',headers:{Prefer:'return=minimal'}});}
      for(var ii=0;ii<allItems.length;ii+=100){var chunk=allItems.slice(ii,ii+100);await api('sale_items',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(chunk)});setImportStatus('progress','Menyimpan detail produk',Math.min(94,60+Math.round((Math.min(allItems.length,ii+100)/Math.max(1,allItems.length))*30))+'%',60+Math.round((Math.min(allItems.length,ii+100)/Math.max(1,allItems.length))*30));draw();}
      await api('sales_import_batches?id=eq.'+encodeURIComponent(batchId),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({status:'completed'})});
      STATE.stagedFiles=[];STATE.stagedFileType='';STATE.importing=false;STATE.importProgress='';setImportStatus('success','Phase 2 selesai','Tersimpan '+txs.length.toLocaleString('id-ID')+' transaksi unik dan '+allItems.length.toLocaleString('id-ID')+' baris produk. Duplikat ID yang digabung: '+duplicateTransactions+'.',100);STATE.msg='✓ Import Majoo ternormalisasi: '+txs.length+' transaksi unik.';STATE.error='';await loadMetrics();draw();
    }catch(e){STATE.importing=false;STATE.importProgress='';setImportStatus('error','Phase 2 gagal',e&&e.message?e.message:'Terjadi kesalahan.');STATE.error='Gagal import ternormalisasi: '+(e&&e.message?e.message:e);STATE.msg='';draw();}
  }
  window.__HASNARIA_IMPORT_V2=run;
})();
