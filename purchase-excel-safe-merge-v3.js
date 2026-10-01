/* Hasnaria Purchase Excel safe merge v3
   - Legacy RENCANA BELANJA workbooks: BELANJA is the transaction source.
   - B OPERASIONAL is planning/reconciliation metadata, never posted as a purchase transaction.
   - Exact existing Excel rows are refreshed, new rows appended; unrelated evidence is preserved.
   - Unknown payment accounts remain in evidence and are surfaced to Staff Kasir reconciliation.
*/
(function(){
  'use strict';
  if(window.__HASNARIA_PURCHASE_EXCEL_SAFE_MERGE_V3)return;
  window.__HASNARIA_PURCHASE_EXCEL_SAFE_MERGE_V3=true;

  var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var EVID='purchase_import_evidence';

  function c(v){return String(v==null?'':v).trim().replace(/\s+/g,' ')}
  function n(v){return c(v).toUpperCase().replace(/^#+/,'').replace(/[^A-Z0-9]+/g,'')}
  function num(v){
    if(typeof v==='number')return isFinite(v)?v:0;
    var s=String(v==null?'':v).replace(/rp\.?/ig,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
    var x=Number(s);return isFinite(x)?x:0;
  }
  function iso(v){
    if(v instanceof Date&&!isNaN(v))return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
    if(typeof v==='number'&&window.XLSX&&XLSX.SSF){var d=XLSX.SSF.parse_date_code(v);if(d)return d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0')}
    var s=c(v),m=s.match(/(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)/);if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
    m=s.match(/([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})/);return m?m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'):null;
  }
  function per(d){return d&&/^\d{4}-\d{2}/.test(d)?d.slice(0,7)+'-01':null}
  function idx(h,re){for(var i=0;i<h.length;i++)if(re.test(c(h[i])))return i;return-1}
  function raw(r){if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;if(r&&typeof r.raw_data==='string')try{return JSON.parse(r.raw_data)}catch(_){}return{}}
  function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return('00000000'+(h>>>0).toString(16)).slice(-8)}
  function money(v){return'Rp '+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:0})}
  function payNorm(v){
    var s=c(v).toUpperCase();
    if(s==='TUNAI'||s==='CASH')return'TUNAI';
    if(s==='REK MANDIRI'||s==='TRANSFER'||s==='TF'||s==='BANK TRANSFER')return'TRANSFER';
    if(s==='QRIS')return'QRIS';
    if(s==='UTANG'||s==='HUTANG'||s==='UTANG RIA')return'UTANG';
    if(s==='PAYLATER'||s==='PAY LATER')return'PAYLATER';
    return null;
  }
  function cat(item){
    var u=c(item).toUpperCase();
    if(/MIKA|KARDUS|PLASTIK|SENDOK|GARPU|GELAS|CONE|TISU|TISSUE|MANGKOK|PAPER|SEDOTAN|TUSUK/.test(u))return'Kemasan & Supplies';
    if(/SIRUP|LECI|LYCHEE|TEH|KRIMER|MINUM|SPRITE|NATA|JELLY/.test(u))return'Minuman';
    if(/ICE CREAM|ES KRIM|TOPPING/.test(u))return'Ice Cream';
    if(/FOTO COPY|FOTOKOPI|PRINT|PULPEN|ATK|RETRIBUSI/.test(u))return'Administrasi';
    return'Makanan';
  }
  function grp(item,category){var s=(c(item)+' '+c(category)).toUpperCase();if(/GAJI|KARYAWAN|MAKAN SIANG|SERAGAM/.test(s))return'Karyawan';if(/INVEST|FREEZER|FURNITURE|MESIN|ASET/.test(s))return'Investasi';if(category==='Administrasi')return'Administrasi';return'Operasi'}
  function expandRef(ws){
    if(!ws||!window.XLSX||!XLSX.utils)return;
    var minR=Infinity,minC=Infinity,maxR=-1,maxC=-1;
    Object.keys(ws).forEach(function(k){if(!k||k.charAt(0)==='!')return;try{var z=XLSX.utils.decode_cell(k);minR=Math.min(minR,z.r);minC=Math.min(minC,z.c);maxR=Math.max(maxR,z.r);maxC=Math.max(maxC,z.c)}catch(_){}});
    if(maxR<0)return;var a={s:{r:minR,c:minC},e:{r:maxR,c:maxC}},cur=null;try{cur=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):null}catch(_){}if(!cur||a.s.r<cur.s.r||a.s.c<cur.s.c||a.e.r>cur.e.r||a.e.c>cur.e.c)ws['!ref']=XLSX.utils.encode_range(a);
  }
  function matrix(ws){expandRef(ws);return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true})}
  function sourceRank(t){return t==='majoo'?3:t==='excel'?2:t==='excel_legacy'?1:0}
  function kind(r){return raw(r).analytics_kind||'purchase_item'}
  function coreKey(r){return [r.purchase_date||'',n(r.item_name),Math.round((+r.total_amount||0)*100)/100].join('|')}
  function toast(msg,type,ttl){var old=document.getElementById('purchaseDualToast');if(old)old.remove();var x=document.createElement('div');x.id='purchaseDualToast';x.className='purchase-dual-toast '+(type||'info');x.textContent=msg;document.body.appendChild(x);if(ttl!==0)setTimeout(function(){if(x.isConnected)x.remove()},ttl||5000)}
  function busy(on){var b=document.getElementById('purchaseExcelBtn');if(b)b.disabled=!!on}

  function parseLegacy(wb,file){
    var sn=wb.SheetNames.find(function(s){return c(s).toUpperCase()==='BELANJA'});if(!sn)throw Error('Sheet BELANJA tidak ditemukan.');
    var a=matrix(wb.Sheets[sn]),hi=-1;
    for(var i=0;i<Math.min(30,a.length);i++){var rr=a[i]||[];if(idx(rr,/^tgl$|tanggal|date/i)>=0&&idx(rr,/nama.*bahan|nama.*barang|^bahan$|^item$|^produk$|^nama$/i)>=0){hi=i;break}}
    if(hi<0)throw Error('Header BELANJA tidak dikenali.');
    var h=a[hi],D=idx(h,/^tgl$|tanggal|date/i),N=idx(h,/nama.*bahan|nama.*barang|^bahan$|^item$|^produk$|^nama$/i),Q=idx(h,/^jumlah$|qty|quantity/i),P=idx(h,/harga.*satuan|unit price|^harga$/i),T=idx(h,/^total$|amount/i);
    var payCols=[];
    for(i=0;i<h.length;i++){
      var label=c(h[i]),norm=payNorm(label);
      if(norm||/tunai|cash|paylater|pay later|utang|hutang|qris|rek.*mandiri|transfer|bank/i.test(label))payCols.push({i:i,label:label,norm:norm});
    }
    var out=[],last=null,invalid=0,unmapped=0,occ={};
    for(i=hi+1;i<a.length;i++){
      var r=a[i]||[],d=D>=0?iso(r[D]):null;if(d)last=d;
      var item=N>=0?c(r[N]):'';if(!item||/^TOTAL$/i.test(item)||!last)continue;
      var q=Q>=0?num(r[Q]):0,pr=P>=0?num(r[P]):0,amount=T>=0?num(r[T]):0,labels=[],methods=[];
      payCols.forEach(function(pc){var v=num(r[pc.i]);if(v){if(T<0)amount+=v;labels.push(pc.label);if(pc.norm)methods.push(pc.norm)}});
      if(!(amount>0)&&q&&pr)amount=q*pr;if(!(amount>0)){invalid++;continue}
      var method=null;if(methods.length===1&&labels.length===1)method=methods[0];else if(methods.length===1&&methods.every(function(x){return x===methods[0]}))method=methods[0];
      if(!method)unmapped++;
      var category=cat(item),base=[last,n(item),Math.round(amount*100)/100,method||labels.join('+')||'UNMAPPED'].join('|');occ[base]=(occ[base]||0)+1;
      out.push({
        brand_id:BRAND,source_type:'excel',source_period:per(last),source_file:file.name,source_record_key:'excel:v3:'+hash(base)+':'+occ[base],row_no:i+1,
        purchase_date:last,item_name:item,normalized_item:n(item),sku:null,quantity:q>0?q:null,unit_text:null,unit_price:pr>0?pr:null,total_amount:amount,
        payment_method:method,supplier_name:null,invoice_no:null,source_status:method?'VALID':'ACCOUNT_REVIEW',
        raw_data:{source_type:'excel',format:'legacy_belanja_v3',source_sheet:sn,source_row:i+1,original_file:file.name,analytics_group:grp(item,category),analytics_category:category,analytics_kind:'purchase_item',source_payment_label:labels.join(' + '),account_mapping_status:method?'mapped':'unmapped'}
      });
    }
    if(!out.length)throw Error('Tidak ditemukan transaksi pembelian valid pada BELANJA.');
    return{rows:out,invalid:invalid,unmapped:unmapped,hasOps:!!wb.SheetNames.find(function(s){return c(s).toUpperCase()==='B OPERASIONAL'})};
  }

  async function fetchEvidence(db,period){var q=await db.from(EVID).select('*').eq('brand_id',BRAND).eq('source_period',period).order('row_no',{ascending:true}).limit(10000);if(q.error)throw q.error;return q.data||[]}
  async function mergeEvidence(db,period,candidates){
    var existing=await fetchEvidence(db,period),pool=existing.filter(function(r){return r.source_type==='excel'||r.source_type==='excel_legacy'}),used={},inserted=0,replaced=0;
    for(var i=0;i<candidates.length;i++){
      var r=candidates[i],match=null;
      for(var j=0;j<pool.length;j++){
        var x=pool[j];if(used[x.id])continue;
        if(x.purchase_date===r.purchase_date&&n(x.item_name)===n(r.item_name)&&Math.abs((+x.total_amount||0)-(+r.total_amount||0))<0.01){match=x;break}
      }
      if(match){
        used[match.id]=1;var upd=Object.assign({},r);delete upd.brand_id;delete upd.source_type;delete upd.source_period;delete upd.source_record_key;
        upd.raw_data=Object.assign({},raw(match),r.raw_data,{replaced_exact_evidence_id:match.id,merge_version:'v3_exact_preserve'});
        var u=await db.from(EVID).update(upd).eq('id',match.id);if(u.error)throw u.error;replaced++;
      }else{
        var ins=await db.from(EVID).insert(r);if(ins.error){
          if(String(ins.error.code||'')==='23505'){var u2=await db.from(EVID).update(r).eq('brand_id',BRAND).eq('source_type','excel').eq('source_period',period).eq('source_record_key',r.source_record_key);if(u2.error)throw u2.error;replaced++}else throw ins.error;
        }else inserted++;
      }
    }
    return{inserted:inserted,replaced:replaced};
  }

  function canonicalize(rows){
    rows=rows.filter(function(r){return kind(r)==='purchase_item'&&(+r.total_amount||0)>0});
    var groups={};rows.forEach(function(r){var k=coreKey(r),g=groups[k]||(groups[k]={});(g[r.source_type]||(g[r.source_type]=[])).push(r)});
    var selected=[];
    Object.keys(groups).forEach(function(k){var g=groups[k],types=Object.keys(g),max=0;types.forEach(function(t){g[t].sort(function(a,b){return(+a.row_no||0)-(+b.row_no||0)});max=Math.max(max,g[t].length)});
      for(var i=0;i<max;i++){
        var opts=[];types.forEach(function(t){if(g[t][i])opts.push(g[t][i])});if(!opts.length)continue;
        opts.sort(function(a,b){var ar=payNorm(a.payment_method)?100:0,br=payNorm(b.payment_method)?100:0;return(br+sourceRank(b.source_type))-(ar+sourceRank(a.source_type))});
        selected.push(opts[0]);
      }
    });
    selected.sort(function(a,b){return String(a.purchase_date||'').localeCompare(String(b.purchase_date||''))||(+a.row_no||0)-(+b.row_no||0)});
    return selected;
  }

  async function materialize(db,period){
    var evidence=await fetchEvidence(db,period),sel=canonicalize(evidence),unresolved=sel.filter(function(r){return!payNorm(r.payment_method)}),resolved=sel.filter(function(r){return!!payNorm(r.payment_method)});
    var rows=resolved.map(function(r,i){var z=raw(r),category=z.analytics_category||cat(r.item_name);return{
      source_file:'HASNARIA_PURCHASE_UNIFIED_'+period.slice(0,7)+'.xlsx',row_no:i+1,purchase_date:r.purchase_date,item_name:r.item_name,
      quantity_text:r.quantity==null?'':String(r.quantity),unit_text:r.unit_text||'',unit_price:r.unit_price,total_amount:r.total_amount,payment_method:payNorm(r.payment_method),notes:'UNIFIED V3 · '+(z.analytics_group||grp(r.item_name,category))+' · '+category,
      raw_data:Object.assign({},z,{unified_source_v1:true,dedup_version:'v3_exact_multiplicity',canonical_source_type:r.source_type,canonical_source_file:r.source_file,canonical_source_record_key:r.source_record_key,analytics_category:category,analytics_kind:'purchase_item'})
    }});
    var rpc=await db.rpc('replace_purchase_canonical_period_v1',{p_source_period:period,p_rows:rows});if(rpc.error)throw rpc.error;
    return{canonical:rows.length,unresolved:unresolved.length,unresolvedAmount:unresolved.reduce(function(s,r){return s+(+r.total_amount||0)},0)};
  }

  async function process(file,input){
    var db=window.__HASNARIA_DB;if(!db)throw Error('Database Pembelian belum siap.');
    if(!window.XLSX&&window.__HASNARIA_XLSX_READY)await window.__HASNARIA_XLSX_READY;if(!window.XLSX)throw Error('Parser Excel belum siap.');
    var wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});wb.SheetNames.forEach(function(s){expandRef(wb.Sheets[s])});
    var p=parseLegacy(wb,file),periods={};p.rows.forEach(function(r){(periods[r.source_period]||(periods[r.source_period]=[])).push(r)});
    var ps=Object.keys(periods);if(!ps.length)throw Error('Periode transaksi tidak ditemukan.');
    var total=p.rows.reduce(function(s,r){return s+(+r.total_amount||0)},0),known=p.rows.filter(function(r){return!!payNorm(r.payment_method)}).reduce(function(s,r){return s+(+r.total_amount||0)},0);
    var preview='Excel Pembelian aman\n'+p.rows.length+' transaksi · '+money(total)+'\n'+money(known)+' sudah punya akun pembayaran.';
    if(p.unmapped)preview+='\n'+p.unmapped+' transaksi belum punya akun pembayaran dan akan masuk antrean Kasir Staff.';
    if(p.hasOps)preview+='\nRingkasan B OPERASIONAL tidak diposting sebagai transaksi agar tidak double count.';
    if(!confirm(preview+'\n\nLanjutkan safe merge?'))return;
    busy(true);toast('Safe merge Pembelian: mengganti transaksi yang persis dan menambah transaksi baru…','info',0);
    var ins=0,rep=0,canon=0,unres=0,unresAmt=0;
    for(var i=0;i<ps.length;i++){
      var m=await mergeEvidence(db,ps[i],periods[ps[i]]);ins+=m.inserted;rep+=m.replaced;
      var mat=await materialize(db,ps[i]);canon+=mat.canonical;unres+=mat.unresolved;unresAmt+=mat.unresolvedAmount;
    }
    toast('Selesai: '+rep+' transaksi lama persis diperbarui · '+ins+' transaksi baru ditambah · '+canon+' canonical.'+(unres?' '+unres+' transaksi ('+money(unresAmt)+') menunggu koreksi akun di Kasir Staff.':''),'success',0);
    setTimeout(function(){location.reload()},1800);
  }

  document.addEventListener('change',function(e){
    var input=e.target;if(!input||input.id!=='purchaseExcelFile'||!input.files||!input.files[0])return;
    var f=input.files[0];if(!/RENCANA\s*BELANJA|BELANJA\s*(SEPT|OKT|NOV|DES|JAN|FEB|MAR|APR|MEI|JUN|JUL|AGU)/i.test(f.name))return;
    e.preventDefault();e.stopImmediatePropagation();
    process(f,input).catch(function(err){console.error(err);toast('Upload gagal: '+(err&&err.message?err.message:err),'error',8000);busy(false)}).finally(function(){try{input.value=''}catch(_){}});
  },true);
})();