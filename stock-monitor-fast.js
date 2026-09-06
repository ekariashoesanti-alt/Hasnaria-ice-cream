/* Hasnaria Stock fast loader: batch XLSX import + original UI */
(function(){
  'use strict';
  var SRC='/stock-monitor.js?v=25';
  fetch(SRC,{cache:'no-cache'}).then(function(r){
    if(!r.ok) throw new Error('Gagal memuat modul stok ('+r.status+')');
    return r.text();
  }).then(function(code){
    var replacement = `async function upsertParsed(rows) {
    var byKey = {}, i, rec, body, keys = ['item_name','category','stock_june','purchase_july','sold_july','stock_august','discrepancy'], ki, k;
    S.items.forEach(function(x){ byKey[String(x.category||'').toUpperCase()+'|'+normName(x.item_name)] = x; });
    var inserts = [], updates = [];
    for(i=0;i<rows.length;i++){
      rec=rows[i]; body={};
      for(ki=0;ki<keys.length;ki++){ k=keys[ki]; if(rec[k]!=null && rec[k]!=='') body[k]=rec[k]; }
      var key=String(rec.category||'').toUpperCase()+'|'+normName(rec.item_name), ex=byKey[key];
      if(ex && ex.id){ body.id=ex.id; updates.push(body); }
      else { body.brand_id=BRAND; body.source_period='2026-07-01'; body.unit='pcs'; inserts.push(body); }
    }
    var t=tok(); if(!t) throw Error('Session belum tersedia. Silakan login kembali.');
    async function batch(path, method, data){
      if(!data.length) return;
      var r=await fetch(SB+'/rest/v1/'+path,{method:method,headers:{apikey:KEY,Authorization:'Bearer '+t,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(data)});
      if(!r.ok){var tx=await r.text();throw Error('Gagal menyimpan inventory ('+r.status+'): '+tx);}
    }
    var B=80;
    for(i=0;i<updates.length;i+=B) await batch('inventory_items?on_conflict=id','POST',updates.slice(i,i+B));
    for(i=0;i<inserts.length;i+=B) await batch('inventory_items?on_conflict=brand_id,source_period,category,item_name','POST',inserts.slice(i,i+B));
  }`;
    var re=/async function upsertParsed\(rows\) \{[\s\S]*?\n  \}\n  function setUploadMsg/;
    if(!re.test(code)) throw new Error('Fungsi import stok tidak ditemukan');
    code=code.replace(re,replacement+'\n  function setUploadMsg');
    var s=document.createElement('script');s.text=code;document.head.appendChild(s);
  }).catch(function(e){console.error('Hasnaria stock fast loader gagal:',e);var h=document.getElementById('stok');if(h)h.innerHTML='<div style="padding:16px;color:#b42318">Gagal memuat Monitoring Stok: '+String(e.message||e)+'</div>';});
})();
