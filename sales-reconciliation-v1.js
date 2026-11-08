/* Hasnaria Majoo dual-source reconciliation v1.
 * READ-ONLY. Compares monthly SKU report to exported detail receipts.
 * It NEVER guesses per-receipt product quantity or posts sales/stock entries.
 */
(function (root) {
  'use strict';
  var MONTHS={januari:1,februari:2,maret:3,april:4,mei:5,juni:6,juli:7,agustus:8,september:9,oktober:10,november:11,desember:12};
  function err(msg){throw new Error('Rekonsiliasi Majoo: '+msg);}
  function str(v){return v==null?'':String(v).trim();}
  function key(v){return str(v).toLocaleLowerCase('id-ID').replace(/\s+/g,' ');}
  function head(v){return key(v).replace(/[\u00a0_\-\/\\()[\]{}:;,.%]+/g,' ').replace(/\s+/g,' ').trim();}
  function money(v,field){
    if(typeof v==='number'){if(!Number.isFinite(v))err('Angka tidak valid: '+field);return v;}
    var s=str(v).replace(/rp\.?/ig,'').replace(/[\s\u00a0]/g,'');
    if(/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
    else if(/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s))s=s.replace(/,/g,'');
    else if(/^[+-]?\d+,\d+$/.test(s))s=s.replace(',','.');
    if(!/^[+-]?\d+(?:\.\d+)?$/.test(s))err('Angka tidak valid: '+field);
    var n=Number(s);if(!Number.isFinite(n))err('Angka tidak valid: '+field);return n;
  }
  function round2(v){return Math.round((v+Number.EPSILON)*100)/100;}
  function dateValue(d,m,y){
    var mm=MONTHS[str(m).toLowerCase()],dd=Number(d),yy=Number(y);
    if(!mm||!Number.isInteger(dd)||dd<1||yy<2020||yy>2100||dd>new Date(Date.UTC(yy,mm,0)).getUTCDate())
      err('Tanggal Majoo tidak valid: '+d+' '+m+' '+y);
    return {month:yy+'-'+String(mm).padStart(2,'0')+'-01',ym:yy+'-'+String(mm).padStart(2,'0'),
      day:yy+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0'),
      dayNum:dd,last:new Date(Date.UTC(yy,mm,0)).getUTCDate()};
  }
  function parsePeriod(raw){
    var m=str(raw).match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})[\s\S]*?\s+-\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
    if(!m)err('Periode file Detail Transaksi tidak terbaca');
    var a=dateValue(m[1],m[2],m[3]),b=dateValue(m[4],m[5],m[6]);
    return {period_month:a.month,range_from:a.day,range_to:b.day,
      full_month:a.month===b.month&&a.dayNum===1&&b.dayNum===b.last};
  }
  function columnIndices(row){
    var cols=row.map(head);
    function one(label){
      var index=cols.indexOf(label);
      if(index<0)err('Kolom detail wajib tidak ditemukan: '+label);
      return index;
    }
    return {id:one('no transaksi'),order:one('waktu order'),outlet:one('outlet'),products:one('produk'),
      amount:one('total penjualan rp'),payment:one('metode pembayaran'),orderType:one('jenis order')};
  }
  function parseDetailMatrix(matrix){
    if(!Array.isArray(matrix)||matrix.length<2)err('File Detail Transaksi kosong');
    var headerRow=-1,cols;
    for(var i=0;i<Math.min(35,matrix.length);i++){
      var h=(matrix[i]||[]).map(head);
      if(h.includes('no transaksi')&&h.includes('waktu order')&&h.includes('produk')&&h.includes('total penjualan rp')){
        headerRow=i;cols=columnIndices(matrix[i]);break;
      }
    }
    if(headerRow<0)err('Header Detail Transaksi Majoo tidak ditemukan');
    var meta=new Map();
    for(var k=0;k<headerRow;k++){
      var row=matrix[k]||[];
      if(row.length>=2)meta.set(head(row[0]),row[1]);
    }
    var period=parsePeriod(meta.get('periode'));
    var rows=[],ids=new Set(),outlets=new Set(),nameOccurrences=0,perMethod=Object.create(null),perOrderType=Object.create(null),perDay=Object.create(null),total=0;
    for(var j=headerRow+1;j<matrix.length;j++){
      var rec=matrix[j]||[];
      if(!rec.some(function(x){return str(x)!=='';}))continue;
      var id=str(rec[cols.id]),dt=str(rec[cols.order]);
      if(!id)err('Nomor transaksi kosong pada baris '+(j+1));
      if(ids.has(id))err('Nomor transaksi duplikat: '+id);
      var tm=dt.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s|$)/);
      if(!tm)err('Waktu order tidak terbaca: '+id);
      var numericDay=Number(tm[1]),numericMonth=Number(tm[2]),year=Number(tm[3]);
      var stamp=new Date(Date.UTC(year,numericMonth,0)).getUTCDate();
      if(year<2020||year>2100||numericMonth<1||numericMonth>12||numericDay<1||numericDay>stamp)
        err('Tanggal transaksi tidak valid: '+id);
      var day=tm[3]+'-'+tm[2]+'-'+tm[1];
      if(day<period.range_from||day>period.range_to)err('Tanggal di luar periode file: '+id);
      var price=money(rec[cols.amount],'Total Penjualan '+id);
      if(price<0)err('Nilai transaksi negatif: '+id);
      var names=str(rec[cols.products]).split(',').map(str).filter(Boolean);
      if(!names.length)err('Daftar produk transaksi kosong: '+id);
      var pay=str(rec[cols.payment]);
      var orderType=str(rec[cols.orderType]);
      var outlet=str(rec[cols.outlet]);
      if(!pay)err('Metode pembayaran kosong: '+id);
      if(!orderType)err('Jenis order kosong: '+id);
      if(!outlet)err('Outlet transaksi kosong: '+id);
      outlets.add(key(outlet));
      if(outlets.size>1)err('File Detail Transaksi mencampur beberapa outlet. Pilih satu outlet.');
      ids.add(id);nameOccurrences+=names.length;total+=price;
      var method=perMethod[pay]||(perMethod[pay]={receipts:0,gross:0});
      method.receipts++;method.gross+=price;
      var channel=perOrderType[orderType]||(perOrderType[orderType]={receipts:0,gross:0});
      channel.receipts++;channel.gross+=price;
      var dayItem=perDay[day]||(perDay[day]={receipts:0,gross:0,appearances:0});
      dayItem.receipts++;dayItem.gross+=price;dayItem.appearances+=names.length;
      rows.push({transaction_id:id,order_date:day,total_sales:price,payment_method:pay,order_type:orderType,outlet:outlet,names:names});
    }
    if(!rows.length)err('Tidak ditemukan transaksi untuk direkonsiliasi');
    var expectedCount=money(meta.get('total transaksi'),'Total Transaksi');
    var expectedSales=money(meta.get('total penjualan'),'Total Penjualan');
    var expectedNet=money(meta.get('total penjualan bersih'),'Total Penjualan Bersih');
    if(!Number.isSafeInteger(expectedCount)||expectedCount!==rows.length)
      err('Jumlah transaksi tidak cocok dengan footer Majoo ('+rows.length+' vs '+expectedCount+')');
    if(Math.abs(total-expectedSales)>0.01)
      err('Total penjualan tidak cocok dengan footer Majoo');
    if(expectedNet>expectedSales || expectedNet<0)err('Nilai penjualan bersih tidak valid');
    return {period_month:period.period_month,date_range_complete:period.full_month,
      outlet_name:Array.from(outlets)[0],
      detail_from:period.range_from,detail_to:period.range_to,
      receipts:rows.length,product_name_appearances:nameOccurrences,
      gross:round2(total),net:round2(expectedNet),reported_refund:round2(total-expectedNet),
      per_payment:perMethod,per_order_type:perOrderType,per_day:perDay,rows:rows,
      sku_quantity_known:false,stock_posting_allowed:false};
  }
  function reconcile(detailMatrix,productReport){
    if(!productReport||!Array.isArray(productReport.rows)||!productReport.period_month)
      err('Preview Rekap Produk belum valid');
    var det=parseDetailMatrix(detailMatrix);
    if(det.period_month!==productReport.period_month)err('Bulan Detail Transaksi dan Rekap Produk berbeda');
    if(!productReport.outlet_name || key(det.outlet_name)!==key(productReport.outlet_name))
      err('Outlet Detail Transaksi tidak sama dengan Outlet Rekap Produk');
    var products=new Map();
    productReport.rows.forEach(function(p){
      var k=key(p.name);
      if(products.has(k))err('Nama produk ambigu pada rekap: '+p.name);
      if(!(p.quantity>0)||!(p.sales_amount>=0))err('Qty/harga SKU tidak valid: '+p.sku);
      products.set(k,{sku:p.sku,name:p.name,qty:p.quantity,price:p.sales_amount/p.quantity});
    });
    var appearances={}, unknown=[], exceptions=[];
    det.rows.forEach(function(rec){
      var ref=0,missing=[];
      rec.names.forEach(function(name){
        var k=key(name),p=products.get(k);
        appearances[k]=(appearances[k]||0)+1;
        if(!p){missing.push(name);unknown.push(name);}
        else ref+=p.price;
      });
      var gap=round2(rec.total_sales-ref);
      if(missing.length||gap< -0.01 || (rec.total_sales>=500000 && ref>0 && rec.total_sales/ref>=10)){
        exceptions.push({transaction_id:rec.transaction_id,date:rec.order_date,
          receipt_total:rec.total_sales,reference_one_each:round2(ref),gap:gap,
          issue:missing.length?'UNKNOWN_PRODUCT_NAME':(gap < -0.01?'BELOW_ONE_EACH_REFERENCE':'HIGH_VALUE_NEEDS_QTY_REVIEW'),
          product_names:rec.names.slice(),unmapped_names:missing.slice()});
      }
    });
    var qtyExceptions=[];
    products.forEach(function(p,k){
      var occurrences=appearances[k]||0;
      if(occurrences>p.qty)qtyExceptions.push({sku:p.sku,name:p.name,occurrences:occurrences,reported_units:p.qty});
    });
    var grossReport=round2(productReport.totals.sales);
    var refunds=round2(productReport.totals.refund_amount);
    var netReport=round2(grossReport-refunds);
    return {
      period_month:det.period_month,transaction_count:det.receipts,
      product_occurrences:det.product_name_appearances,
      report_skus:productReport.rows.length,report_units:productReport.totals.quantity,
      detail_gross:det.gross,detail_net:det.net,
      product_gross:grossReport,product_net:netReport,
      detail_refund:det.reported_refund,product_refund:refunds,
      by_order_type:det.per_order_type,by_payment_method:det.per_payment,
      gross_gap:round2(det.gross-grossReport),
      net_gap:round2(det.net-netReport),
      refund_gap:round2(det.reported_refund-refunds),
      unknown_names:Array.from(new Set(unknown)),quantity_exceptions:qtyExceptions,
      receipt_exceptions:exceptions,
      complete_month_requested:det.date_range_complete,
      requires_review:true,
      has_reliable_per_receipt_sku_qty:false,
      allowed_to_add_data_sources:false,stock_posting_allowed:false,
      daily_sku_allocation_allowed:false
    };
  }
  var api={parseDetailMatrix:parseDetailMatrix,reconcile:reconcile};
  if(root)root.__HASNARIA_SALES_RECONCILE_V1=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null);
