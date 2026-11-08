/* Majoo gross-revenue scope bridge — deterministic READ-ONLY review utility.
 * No network or mutation code. Evidence must be traceable to a separate source;
 * matching the Rp622,000 residual is never permission to post sales or stock.
 */
(function (root) {
  'use strict';
  var REPORTS=new Set(['sales_summary','extra_sales','sub_extra_sales','itemized_receipts']);
  var COMPONENTS=new Set(['transaction_discount','tax','service_fee','delivery_fee','extra','rounding','other_adjustment']);
  var ADD_ONLY=new Set(['tax','service_fee','delivery_fee','extra']);
  var SUB_ONLY=new Set(['transaction_discount']);
  function fail(message){throw new Error('Rekonsiliasi cakupan Majoo: '+message);}
  function str(v){return v==null?'':String(v).trim();}
  function cents(v,label){
    if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000000000)
      fail(label+' harus nilai numerik terbatas; tidak boleh mengarang angka');
    var n=Math.round(v*100);
    if(!Number.isSafeInteger(n)||Math.abs(v*100-n)>0.015)
      fail(label+' memiliki presisi lebih dari dua desimal');
    return n;
  }
  function monthly(v){return /^20\d{2}-(0[1-9]|1[0-2])-01$/.test(str(v));}
  function outlet(v){return str(v).toLowerCase().replace(/\s+/g,' ');}
  function bridge(reconciliation,lines){
    var r=reconciliation||{};
    if(!monthly(r.period_month)||!str(r.outlet_name))
      fail('periode atau outlet pembanding belum tervalidasi');
    var receipt=cents(r.detail_gross,'Total struk');
    var product=cents(r.product_gross,'Total penjualan SKU');
    if(receipt<0||product<0)fail('Omzet sumber tidak boleh negatif');
    if(receipt-product!==cents(r.gross_gap,'Selisih omzet'))
      fail('Selisih sumber tidak sesuai dua total yang dibandingkan');
    var sourceRefund=cents(r.detail_refund,'Refund struk');
    var skuRefund=cents(r.product_refund,'Refund SKU');
    if(sourceRefund<0||skuRefund<0)fail('Refund negatif');
    if(!Array.isArray(lines)||lines.length>200)fail('Maksimal 200 item bukti');
    var identified=0,seenRefs=new Set(),seenEconomic=new Set(),entries=[];
    lines.forEach(function(line,index){
      var x=line||{},label='Bukti '+(index+1);
      if(!REPORTS.has(x.report_type)||!COMPONENTS.has(x.component))
        fail(label+' kategori laporan/komponen tidak dikenal');
      if(x.period_month!==r.period_month||outlet(x.outlet_name)!==outlet(r.outlet_name))
        fail(label+' beda periode atau outlet');
      if(!/^[a-f0-9]{64}$/i.test(str(x.source_sha256)))
        fail(label+' memerlukan SHA-256 file sumber');
      if(!str(x.source_line_key)||str(x.source_line_key).length>150)
        fail(label+' memerlukan identitas baris asli');
      if(!str(x.economic_event_key)||str(x.economic_event_key).length>150)
        fail(label+' memerlukan identitas ekonomi untuk pemeriksaan duplikasi');
      var ref=str(x.source_sha256).toLowerCase()+'|'+str(x.source_line_key).toLowerCase();
      var economic=str(x.economic_event_key).toLowerCase();
      if(seenRefs.has(ref)||seenEconomic.has(economic))
        fail(label+' duplikat bukti/komponen ekonomi; tidak boleh dihitung dua kali');
      seenRefs.add(ref);seenEconomic.add(economic);
      if(x.direction!=='add'&&x.direction!=='subtract')
        fail(label+' arah perbedaan harus add atau subtract');
      if(ADD_ONLY.has(x.component)&&x.direction!=='add' ||
         SUB_ONLY.has(x.component)&&x.direction!=='subtract')
        fail(label+' arah komponen tidak sesuai; periksa definisi laporan');
      var amount=cents(x.amount,'Nominal '+label);
      if(amount<=0)fail(label+' nilai harus positif; arah disimpan terpisah');
      var signed=(x.direction==='add'?1:-1)*amount;
      identified+=signed;
      if(!Number.isSafeInteger(identified))fail('Total bukti melebihi batas aman');
      entries.push({report_type:x.report_type,component:x.component,
        source_line_key:str(x.source_line_key),economic_event_key:str(x.economic_event_key),
        amount_rupiah:amount/100,direction:x.direction,signed_rupiah:signed/100});
    });
    var gap=receipt-product;
    var remaining=gap-identified;
    return {
      period_month:r.period_month,outlet_name:str(r.outlet_name),
      receipt_gross:receipt/100,sku_gross:product/100,
      gap_rupiah:gap/100,evidence_count:entries.length,
      evidenced_net_rupiah:identified/100,unallocated_rupiah:remaining/100,
      refund_agrees:sourceRefund===skuRefund,
      arithmetic_balanced:remaining===0&&sourceRefund===skuRefund,
      review_status:remaining===0&&sourceRefund===skuRefund?'MATH_MATCH_OWNER_REVIEW':'EVIDENCE_PENDING',
      owner_approval_recorded:false,posting_authorized:false,
      stock_posting_allowed:false,daily_sku_allocation_allowed:false,
      evidence:entries
    };
  }
  var api={calculate:bridge};
  if(root)root.__HASNARIA_SCOPE_BRIDGE_V1=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null);
