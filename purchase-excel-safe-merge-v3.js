/* Hasnaria Purchase Excel safe merge v3
   - Legacy RENCANA BELANJA workbooks: BELANJA is the transaction source.
   - B OPERASIONAL is planning/reconciliation metadata, never posted as a purchase transaction.
   - Exact existing Excel rows are refreshed, new rows appended; unrelated evidence is preserved.
   - Unknown payment accounts enter canonical Purchase as BELUM_DIPETAKAN/provisional and are surfaced to Staff Kasir reconciliation.
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
  /* BELANJA C×D determines purchase value; E,F cash/bank, G,H liabilities.
     A positive shortfall becomes TUNAI; overfunding stops import. */
  function balanceFunding(value,funding,rowNo){
    function cents(x){return Math.round(Number(x||0)*100)}
    var order=['cash','bank_mandiri','paylater','related_party_loan_jas_hujan'],v=cents(value);
    if(!Number.isFinite(v)||v<=0)throw Error('BELANJA baris '+rowNo+': jumlah × harga harus positif.');
    var f={};order.forEach(function(k){var x=cents(funding[k]);if(!Number.isFinite(x)||x<0)throw Error('BELANJA baris '+rowNo+': sumber dana '+k+' tidak valid.');f[k]=x});
    var recorded=order.reduce(function(n,k){return n+f[k]},0);
    if(recorded>v)throw Error('BELANJA baris '+rowNo+': pendanaan melebihi C × D sebesar Rp '+((recorded-v)/100).toLocaleString('id-ID')+'. Perlu review.');
    var extra=v-recorded;f.cash+=extra;
    var amounts={};order.forEach(function(k){amounts[k]=f[k]/100});
    return {purchase_value:v/100,recorded_funding_total:recorded/100,additional_cash:extra/100,breakdown:amounts,funding_total:v/100};
  }
  window.__HASNARIA_PURCHASE_FUNDING_V1={balanceFunding:balanceFunding};

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
      if(norm||/tunai|cash|paylater|pay later|utang|hutang|qris|rek.*mandiri|transfer|bank|pinjam|jas\s*hujan/i.test(label))payCols.push({i:i,label:label,norm:norm});
    }
    var out=[],last=null,invalid=0,invalidRows=[],unmapped=0,occ={};
    for(i=hi+1;i<a.length;i++){
      var r=a[i]||[],d=D>=0?iso(r[D]):null;if(d)last=d;
      var item=N>=0?c(r[N]):'';if(!item||/^TOTAL$/i.test(item))continue;
      if(!last){invalid++;invalidRows.push({row:i+1,item:item,reason:'Tanggal transaksi kosong'});continue}
      var q=Q>=0?num(r[Q]):0,pr=P>=0?num(r[P]):0;
      if(!(q>0)||!(pr>0)){invalid++;invalidRows.push({row:i+1,item:item,reason:'Jumlah atau harga satuan kosong/tidak positif',quantity:q,unit_price:pr});continue}
      var amount=Math.round(q*pr*100)/100,parts={cash:0,bank_mandiri:0,paylater:0,related_party_loan_jas_hujan:0},labels=[];
      payCols.forEach(function(pc){
        var v=num(r[pc.i]);if(!v)return;
        var label=c(pc.label).toUpperCase(),key=/JAS\s*HUJAN/.test(label)?'related_party_loan_jas_hujan':
          pc.norm==='TUNAI'?'cash':pc.norm==='TRANSFER'?'bank_mandiri':
          pc.norm==='PAYLATER'?'paylater':null;
        if(!key)throw Error('BELANJA baris '+(i+1)+': sumber dana '+pc.label+' tidak dikenali.');
        if(v<0)throw Error('BELANJA baris '+(i+1)+': nominal sumber dana negatif.');
        parts[key]+=v;labels.push(pc.label);
      });
      var funding=balanceFunding(amount,parts,i+1);
      if(T>=0&&num(r[T])>0&&Math.abs(num(r[T])-amount)>.01)throw Error('BELANJA baris '+(i+1)+': TOTAL berbeda dari JUMLAH × HARGA SATUAN.');
      if(funding.additional_cash>0)labels.push('TUNAI (pelengkap)');
      var used=Object.keys(funding.breakdown).filter(function(k){return funding.breakdown[k]>0});
      var method=used.length===1&&used[0]==='cash'?'TUNAI':
        used.length===1&&used[0]==='bank_mandiri'?'TRANSFER':
        used.length===1&&used[0]==='paylater'?'PAYLATER':null;
      // Group loans and mixed tenders remain under financing review until
      // the finance ledger supports independent counter-account lines.
      if(!method)unmapped++;
      var category=cat(item),base=[last,n(item),Math.round(amount*100)/100,method||labels.join('+')||'UNMAPPED'].join('|');occ[base]=(occ[base]||0)+1;
      out.push({
        brand_id:BRAND,source_type:'excel',source_period:per(last),source_file:file.name,source_record_key:'excel:v3:'+hash(base)+':'+occ[base],row_no:i+1,
        purchase_date:last,item_name:item,normalized_item:n(item),sku:null,quantity:q>0?q:null,unit_text:null,unit_price:pr>0?pr:null,total_amount:amount,
        payment_method:method,supplier_name:null,invoice_no:null,source_status:method?'VALID':'ACCOUNT_REVIEW',
        raw_data:{source_type:'excel',format:'legacy_belanja_v3',source_sheet:sn,source_row:i+1,original_file:file.name,analytics_group:grp(item,category),analytics_category:category,analytics_kind:'purchase_item',source_payment_label:labels.join(' + '),account_mapping_status:method?'mapped':'financing_review',funding_breakdown:funding.breakdown,source_funding_total:funding.recorded_funding_total,auto_cash_adjustment:funding.additional_cash,source_purchase_value:amount,source_funding_status:funding.additional_cash>0?'AUTO_CASH_COMPLETED':'BALANCED',source_funding_policy:'BELANJA_CxD_vs_EFGH_v1'}
      });
    }
    if(!out.length)throw Error('Tidak ditemukan transaksi pembelian valid pada BELANJA.');
    return{rows:out,invalid:invalid,invalidRows:invalidRows,unmapped:unmapped,operations:opsReference(wb),hasOps:!!wb.SheetNames.find(function(s){return c(s).toUpperCase()==='B OPERASIONAL'})};
  }

  function opsReference(wb){
    var title=wb.SheetNames.find(function(k){return c(k).toUpperCase()==='B OPERASIONAL'});
    if(!title)return {found:false,amount:null,valid:false};
    var cells=matrix(wb.Sheets[title]);
    for(var i=0;i<cells.length;i++){
      var label=c((cells[i]||[])[1]).toUpperCase();
      if(/^(BELANJA BAHAN|BELANJA MATERIAL|BELANJA PEMBELIAN)$/.test(label)){
        var value=(cells[i]||[])[2],valid=typeof value==='number'&&isFinite(value);
        return {found:true,amount:valid?value:null,valid:valid,row:i+1,raw_value:value};
      }
    }
    return {found:true,amount:null,valid:false,row:null};
  }
  function fundingOverview(parsed){
    var base={cash:0,bank_mandiri:0,paylater:0,related_party_loan_jas_hujan:0},topup=0;
    parsed.rows.forEach(function(r){var z=raw(r),f=z.funding_breakdown||{};
      Object.keys(base).forEach(function(k){base[k]+=Number(f[k]||0)});
      topup+=Number(z.auto_cash_adjustment||0);
    });
    var amount=parsed.rows.reduce(function(n,r){return n+Number(r.total_amount||0)},0);
    var sum=Object.keys(base).reduce(function(n,k){return n+base[k]},0);
    return {purchase:amount,credits:base,credit_total:sum,delta:Math.round((amount-sum)*100)/100,auto_cash:topup};
  }
  window.__HASNARIA_PURCHASE_FUNDING_V1.fundingOverview=fundingOverview;

  /* A single source file must never overwrite a period containing unrelated
     canonical/Stock-linked history. Only a totally new, complete, single-counter
     period may use the existing atomic RPC. Mixed/loan funding awaits a tested
     multi-credit journal backend; no evidence staging occurs before validation. */
  async function process(file,input){
    var db=window.__HASNARIA_DB;if(!db)throw Error('Database Pembelian belum siap.');
    if(!window.XLSX&&window.__HASNARIA_XLSX_READY)await window.__HASNARIA_XLSX_READY;
    if(!window.XLSX)throw Error('Parser Excel belum siap.');
    var wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    wb.SheetNames.forEach(function(k){expandRef(wb.Sheets[k])});
    var p=parseLegacy(wb,file),periods={};
    p.rows.forEach(function(row){(periods[row.source_period]||(periods[row.source_period]=[])).push(row)});
    var ps=Object.keys(periods);
    if(!ps.length)throw Error('Periode transaksi BELANJA tidak ditemukan.');
    var summary=fundingOverview(p),ref=p.operations||{},reviewNote='';
    if(ref.found&&ref.valid&&Math.abs(summary.purchase-ref.amount)>0.01)
      reviewNote='\\nRekap BELANJA BAHAN di B OPERASIONAL = '+money(ref.amount)+'; selisih '+money(summary.purchase-ref.amount)+'. Ini hanya referensi (bukan transaksi kedua).';
    else if(ref.found&&!ref.valid)
      reviewNote='\\nB OPERASIONAL tidak memiliki rekap BELANJA BAHAN numerik yang dapat diaudit. Tidak menambah jurnal.';
    var preview='PEMERIKSAAN BELANJA · '+file.name+'\\n'+p.rows.length+' baris valid · '+money(summary.purchase)+' dari C × D'+
      '\\nTunai '+money(summary.credits.cash)+' · Mandiri '+money(summary.credits.bank_mandiri)+
      '\\nPayLater '+money(summary.credits.paylater)+' · Utang Jas Hujan '+money(summary.credits.related_party_loan_jas_hujan)+
      '\\nSelisih debit-kredit '+money(summary.delta)+' · Tambahan Tunai '+money(summary.auto_cash)+
      '\\nBaris tidak lengkap '+p.invalid+' · Pembiayaan perlu review '+p.unmapped+reviewNote;
    if(p.hasOps)preview+='\\nSheet B OPERASIONAL hanya untuk kontrol; tidak membentuk transaksi baru.';
    if(p.invalid){
      var examples=p.invalidRows.slice(0,5).map(function(z){return'baris '+z.row+' ('+z.item+'): '+z.reason}).join('; ');
      toast('Upload ditahan: '+p.invalid+' baris BELANJA perlu dilengkapi. '+examples,'error',11000);
      if(window.alert)window.alert(preview+'\\n\\nPERLU DILENGKAPI: '+examples);
      return;
    }
    if(Math.abs(summary.delta)>0.01)throw Error('Total debit-kredit sumber pendanaan tidak seimbang.');
    if(ps.length!==1)throw Error('Satu file berisi lebih dari satu bulan transaksi. Pisahkan per periode sebelum upload.');
    if(p.unmapped){
      toast('Upload ditahan: '+p.unmapped+' baris memakai pembiayaan campuran/pinjaman yang butuh jurnal multi-akun. Pratinjau tetap dapat dipakai, tetapi jangan paksa sebagai Tunai/Utang pemasok.','error',12000);
      if(window.alert)window.alert(preview+'\n\nPosting jurnal multi-kredit belum tersedia. File ini belum ditulis ke database.');
      return;
    }
    var period=ps[0];
    var check=await db.from('offline_purchase_history').select('id',{count:'exact',head:true})
      .eq('brand_id',BRAND).eq('source_period',period);
    if(check.error)throw check.error;
    if(!Number.isInteger(check.count))throw Error('Jumlah transaksi kanonis periode tidak dapat diverifikasi; upload ditahan.');
    if(check.count!==0){
      toast('Upload ditahan: '+check.count+' transaksi Pembelian sudah ada untuk '+period+
        '. Tidak ada penggantian seluruh periode. Perlu mekanisme merge berbukti tanpa menimpa transaksi/Stock lama.','error',12000);
      console.info(preview);
      return;
    }
    // No staged evidence mutation. One transactional canonical RPC for an empty
    // period; the server will enforce permission and payment method validity.
    if(!confirm(preview+'\\n\\nPeriode ini belum memiliki transaksi kanonis. Import '+p.rows.length+
      ' baris sekaligus? Pembukuan keuangan hanya mengikuti periode/akun yang telah tersedia.'))return;
    var payload=p.rows.map(function(z,i){return {
      source_file:file.name,row_no:z.row_no,purchase_date:z.purchase_date,item_name:z.item_name,
      quantity_text:z.quantity==null?'':String(z.quantity),unit_text:z.unit_text||'',
      unit_price:z.unit_price,total_amount:z.total_amount,payment_method:z.payment_method,
      notes:'BELANJA · '+(raw(z).analytics_group||'Operasi')+' · '+(raw(z).analytics_category||''),
      raw_data:Object.assign({},raw(z),{canonical_source_record_key:z.source_record_key,
        import_scope:'BELANJA_ONLY',ledger_policy:'CXD_FUNDING_EFGH'})
    }});
    busy(true);
    try{
      var out=await db.rpc('replace_purchase_canonical_period_v1',{p_source_period:period,p_rows:payload});
      if(out.error)throw out.error;
      toast('Berhasil: '+payload.length+' transaksi Pembelian '+period+' tercatat tanpa sumber ganda. Status jurnal mengikuti hasil rekonsiliasi server.','success',0);
      setTimeout(function(){location.reload()},1800);
    }finally{busy(false)}
  }

  document.addEventListener('change',function(e){
    var input=e.target;if(!input||input.id!=='purchaseExcelFile'||!input.files||!input.files[0])return;
    var f=input.files[0];if(!/RENCANA\s*BELANJA|BELANJA\s*(SEPT|OKT|NOV|DES|JAN|FEB|MAR|APR|MEI|JUN|JUL|AGU)/i.test(f.name))return;
    e.preventDefault();e.stopImmediatePropagation();
    process(f,input).catch(function(err){console.error(err);toast('Upload gagal: '+(err&&err.message?err.message:err),'error',8000);busy(false)}).finally(function(){try{input.value=''}catch(_){}});
  },true);
})();