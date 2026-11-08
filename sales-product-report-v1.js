/* Majoo monthly product-sales report parser & staging client.
 * This is not a transaction importer. It never writes to sales, daily_metrics,
 * sale_items, recipe tables, or inventory_movements. Inactive until explicitly wired.
 */
(function (root) {
  'use strict';

  var MONTHS = {jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,jun:6,juni:6,jul:7,juli:7,agu:8,agt:8,agustus:8,sep:9,september:9,okt:10,oktober:10,nov:11,november:11,des:12,desember:12};

  function fail(message) { throw new Error('Laporan Produk Majoo: ' + message); }
  function str(value) { return value == null ? '' : String(value).trim(); }
  function header(value) {
    return str(value).toLowerCase().replace(/[\u00a0_\-\/\\()[\]{}:;,.%]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function numeric(value, field, required) {
    if ((value == null || str(value) === '') && !required) return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('Angka tidak valid pada ' + field);
      return value;
    }
    var s=str(value).replace(/rp\.?/ig,'').replace(/[\s\u00a0]/g,'');
    if (!s) fail('Kolom wajib kosong: '+field);
    if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
    else if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) s=s.replace(/,/g,'');
    else if (/^[+-]?\d+,\d+$/.test(s)) s=s.replace(',','.');
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) fail('Angka tidak valid pada '+field);
    var result=Number(s);
    if (!Number.isFinite(result)) fail('Angka tidak valid pada '+field);
    return result;
  }
  function int(value, field, min, max) {
    var n=numeric(value,field,true);
    if (!Number.isSafeInteger(n) || n<min || n>max) fail(field+' harus bilangan bulat '+min+'–'+max);
    return n;
  }
  function amount(value, field, required) {
    var n=numeric(value,field,required);
    if (n!==null && (n<0 || n>999999999999)) fail('Nilai negatif / di luar batas pada '+field);
    return n;
  }
  function dateParts(day,month,year){
    var m=MONTHS[str(month).toLowerCase()];
    if (!m) fail('Nama bulan tidak dikenal: '+month);
    var y=Number(year),d=Number(day),max=new Date(Date.UTC(y,m,0)).getUTCDate();
    if(y<2020||y>2100||!Number.isInteger(d)||d<1||d>max)fail('Tanggal periode tidak valid');
    return {date:y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'),y:y,m:m,d:d,max:max};
  }
  function detectPeriod(matrix,headerRow) {
    for(var i=0;i<headerRow;i++){
      var row=matrix[i]||[];
      for(var j=0;j<row.length;j++){
        if(header(row[j])!=='periode')continue;
        var sample=str(row[j+1]);
        var match=sample.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*[-–—]\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
        if(!match)fail('Rentang periode tanggal harus ada dan terbaca');
        var a=dateParts(match[1],match[2],match[3]),b=dateParts(match[4],match[5],match[6]);
        if(a.y!==b.y||a.m!==b.m||a.d!==1||b.d!==b.max)
          fail('Hanya laporan satu bulan penuh yang dapat disimpan (tanggal 1–akhir bulan)');
        return a.y+'-'+String(a.m).padStart(2,'0')+'-01';
      }
    }
    fail('Metadata Periode tidak ditemukan');
  }
  function metadataNumber(matrix,headerRow,needle) {
    for(var i=0;i<headerRow;i++){
      var row=matrix[i]||[];
      for(var j=0;j<row.length;j++){
        if(header(row[j])===needle){
          var value=str(row[j+1]);
          if(!value)fail('Ringkasan '+needle+' tidak memiliki nilai');
          return amount(value,needle,true);
        }
      }
    }
    fail('Ringkasan '+needle+' tidak ditemukan');
  }
  function cols(matrix, index) {
    var row=(matrix[index]||[]).map(header);
    function required(label) {
      var x=row.indexOf(label);
      if(x<0) fail('Kolom tidak ditemukan: '+label);
      return x;
    }
    return {
      name:required('produk'),sku:required('sku'),outlet:required('outlet'),
      qty:required('jumlah terjual'),sales:required('penjualan rp'),hpp:required('hpp'),
      refundQty:required('jumlah refund'),refundSales:required('refund rp'),refundHpp:required('hpp refund'),
      gross:required('laba kotor rp')
    };
  }
  function parseMatrix(matrix){
    if(!Array.isArray(matrix)||!matrix.length)fail('File kosong/tidak terbaca');
    var headerRow=-1;
    for(var i=0;i<Math.min(35,matrix.length);i++){
      var hs=(matrix[i]||[]).map(header);
      if(hs.includes('produk')&&hs.includes('sku')&&hs.includes('jumlah terjual')&&hs.includes('penjualan rp')){
        headerRow=i;break;
      }
    }
    if(headerRow<0)fail('Header Produk, SKU, Jumlah Terjual, Penjualan (Rp.) tidak ditemukan');
    var fields=cols(matrix,headerRow),month=detectPeriod(matrix,headerRow);
    var reportedUnits=metadataNumber(matrix,headerRow,'total produk terjual');
    var reportedSales=metadataNumber(matrix,headerRow,'total penjualan');
    var reportedProfit=metadataNumber(matrix,headerRow,'total laba kotor');
    var result=[],seen=new Set(),outlets=new Set();
    for(var rowIdx=headerRow+1;rowIdx<matrix.length;rowIdx++){
      var row=matrix[rowIdx]||[];
      if(!row.some(function(v){return str(v)!=='';}))continue;
      var name=str(row[fields.name]),sku=str(row[fields.sku]),outlet=str(row[fields.outlet]);
      if(!name && !sku)continue;
      if(!name || !sku || !outlet)fail('Baris '+(rowIdx+1)+' tidak lengkap (Produk/SKU/Outlet)');
      if(/^total|grand total$/i.test(name))continue;
      if(name.length>300||sku.length>100)fail('Nama/SKU terlalu panjang baris '+(rowIdx+1));
      var key=sku.toUpperCase();
      if(seen.has(key))fail('SKU duplikat: '+sku);
      seen.add(key);outlets.add(outlet.toLowerCase());
      var quantity=int(row[fields.qty],'Jumlah Terjual baris '+(rowIdx+1),1,100000000);
      var refundQty=int(row[fields.refundQty],'Jumlah Refund baris '+(rowIdx+1),0,quantity);
      var sales=amount(row[fields.sales],'Penjualan baris '+(rowIdx+1),true);
      var cogs=amount(row[fields.hpp],'HPP baris '+(rowIdx+1),false);
      var gross=numeric(row[fields.gross],'Laba Kotor baris '+(rowIdx+1),false);
      var refundSales=amount(row[fields.refundSales],'Refund baris '+(rowIdx+1),true);
      var refundHpp=amount(row[fields.refundHpp],'HPP Refund baris '+(rowIdx+1),false);
      if(refundQty===0 && refundSales>0)fail('Refund rupiah tanpa unit refund pada SKU '+sku);
      result.push({line_no:result.length+1,sku:sku,name:name,quantity:quantity,
        sales_amount:sales,cogs_amount:cogs,gross_profit:gross,
        refund_qty:refundQty,refund_amount:refundSales,refund_cogs:refundHpp});
    }
    if(result.length<1 || result.length>5000)fail('Jumlah SKU di luar rentang 1–5000');
    if(outlets.size!==1)fail('Laporan multi-outlet tidak boleh dicampur menjadi satu batch');
    var sum=function(k){return result.reduce(function(s,r){return s+Number(r[k]||0);},0);};
    var qty=sum('quantity'),sales=sum('sales_amount'),profit=sum('gross_profit');
    if(qty!==reportedUnits)fail('Total unit berbeda: detail '+qty+' vs ringkasan '+reportedUnits);
    if(Math.abs(sales-reportedSales)>0.01)fail('Omzet berbeda: detail '+sales+' vs ringkasan '+reportedSales);
    if(result.some(function(r){return r.gross_profit===null;}))fail('Nilai laba kotor per SKU wajib lengkap');
    if(Math.abs(profit-reportedProfit)>2)fail('Laba kotor berbeda lebih dari toleransi pembulatan Rp2');
    return {
      source_format:'majoo_product_report',
      period_month:month,outlet_name:Array.from(outlets)[0],header_row:headerRow+1,
      source_row_count:result.length,
      totals:{quantity:qty,sales:sales,hpp:sum('cogs_amount'),refund_qty:sum('refund_qty'),
        refund_amount:sum('refund_amount'),gross_profit:profit},
      rows:result,
      stock_posting_allowed:false,daily_allocation_allowed:false
    };
  }
  async function sha256File(file){
    if(!file || typeof file.arrayBuffer!=='function')fail('File asli wajib tersedia untuk checksum');
    if(typeof crypto==='undefined'||!crypto.subtle)fail('Browser tidak mendukung SHA256 aman');
    var buff=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buff);
    return Array.from(new Uint8Array(hash)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  }
  async function stagePreview(file,matrix,opts){
    opts=opts||{};
    if(opts.enableWrite!==true || opts.confirmed!==true)fail('Simpan draft memerlukan konfirmasi Owner');
    var parsed=parseMatrix(matrix);
    if(!opts.brandId||!opts.outletId||!opts.supabaseUrl||!opts.publishableKey||
       typeof opts.getAccessToken!=='function')fail('Konfigurasi staging tidak lengkap');
    if(opts.expectedOutletName && header(opts.expectedOutletName)!==header(parsed.outlet_name))
      fail('Outlet file tidak sesuai dengan outlet terpilih');
    var token=await opts.getAccessToken();
    if(!token)fail('Sesi Owner belum aktif');
    var fileHash=await sha256File(file);
    var response=await fetch(opts.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/stage_sales_product_report_v1',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':opts.publishableKey,
        'Authorization':'Bearer '+token},
      body:JSON.stringify({p_brand:opts.brandId,p_outlet:opts.outletId,
        p_period_month:parsed.period_month,p_filename:file.name,p_file_sha256:fileHash,p_rows:parsed.rows})
    });
    if(!response.ok){
      var message=await response.text();fail('Supabase menolak draft ('+response.status+'): '+message.slice(0,350));
    }
    var receipt=await response.json();
    return {status:receipt && receipt.status === 'under_review' ? 'under_review' : (receipt && receipt.status === 'existing' ? 'existing' : 'unknown'),receipt:receipt,preview:parsed};
  }
  // Preview can be explicitly opted into ONLY against the Singapore synthetic UAT backend.
  // URL alone cannot enable the feature on Tokyo production.
  function previewFeatureAllowed(host) {
    var target=String(host && host.HASNARIA_SB || '');
    var search=String(host && host.location && host.location.search || '');
    return /^https:\/\/rynnpndtzjwpekbiwiif\.supabase\.co\/?$/.test(target)
      && /(?:^\?|&)sales_product_preview=1(?:&|$)/.test(search);
  }
  if (root) root.__HASNARIA_ENABLE_PRODUCT_REPORT_V1=previewFeatureAllowed(root);
  var api={parseMatrix:parseMatrix,stagePreview:stagePreview,previewFeatureAllowed:previewFeatureAllowed};
  if(root)root.__HASNARIA_PRODUCT_REPORT_V1=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null);
