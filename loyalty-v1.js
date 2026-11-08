/* HSN-712 · Majoo customer report Loyalty analytics. Lazy owner-only workbench. */
(function(){
'use strict';
if(window.__HASNARIA_LOYALTY_V1)return;
window.__HASNARIA_LOYALTY_V1=true;
var state={loaded:false,loading:false,period:'',months:[],search:'',sort:'spend',page:0,data:null,preview:null,file:null,busy:false,error:'',notice:'',seq:0};
var LIMIT=5, MONTHS={'januari':'01','februari':'02','maret':'03','april':'04','mei':'05','juni':'06','juli':'07','agustus':'08','september':'09','oktober':'10','november':'11','desember':'12'};
function host(){return document.getElementById('opLoyaltyHost')}
function db(){return window.__HASNARIA_DB}
function ctxt(){return window.__HASNARIA_CONTEXT||{}}
function owner(){return ctxt().role==='owner'}
function e(x){return String(x==null?'':x).replace(/[&<>"']/g,function(v){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]})}
function money(x){return 'Rp'+Number(x||0).toLocaleString('id-ID',{maximumFractionDigits:0})}
function num(x){return Number(x||0).toLocaleString('id-ID')}
function date(x){if(!x)return'—';var s=String(x).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):e(s)}
function pct(n,d){return d?((100*n/d).toLocaleString('id-ID',{maximumFractionDigits:1})+'%'):'0%'}
function notify(s,err){if(err)state.error=s;else{state.notice=s;state.error=''}render()}
function normalizePhone(x){var s=String(x==null?'':x).trim().replace(/[^0-9]/g,'');if(/^8\d{8,12}$/.test(s))s='0'+s;if(/^08\d{8,12}$/.test(s))s='62'+s.slice(1);return /^628\d{8,12}$/.test(s)?s:''}
function parseMoney(x){if(typeof x==='number')return x;var s=String(x==null?'':x).trim().replace(/[^\d,.-]/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(',','.');return Number(s)}
function isoDate(x){if(x instanceof Date&&!isNaN(x))return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');if(typeof x==='number'&&window.XLSX&&XLSX.SSF){var d=XLSX.SSF.parse_date_code(x);return d?d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0'):''}var s=String(x||'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):''}
function isoTime(x){if(!x)return'';if(x instanceof Date&&!isNaN(x))return isoDate(x)+' '+String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')+':'+String(x.getSeconds()).padStart(2,'0');var s=String(x).trim();return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)?s.replace('T',' '):''}
function monthName(period){var m=Number(String(period).slice(5,7));return m>0&&m<=12?Object.keys(MONTHS)[m-1].replace(/^./,function(x){return x.toUpperCase()})+' '+String(period).slice(0,4):'—'}
function shortMonth(v){var n=Number(String(v).slice(5,7));return n>=1&&n<=12?['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][n-1]:'?'}
function coverageLine(c){if(!c)return'';var missing=Array.isArray(c.missing_months)?c.missing_months:[];var received=Array.isArray(c.loaded_months)?c.loaded_months:[];return '<div class="lo1-coverage '+(c.complete?'complete':'partial')+'" role="status"><b>'+(c.complete?'YTD lengkap':'YTD parsial')+' · '+num(c.imported_months)+'/'+num(c.expected_months)+' bulan</b><span>'+(c.complete?'Seluruh laporan bulanan tersedia.':'Tersedia: '+(received.length?received.map(shortMonth).join(', '):'belum ada')+' · Belum ada: '+missing.map(shortMonth).join(', ')+'. Total dari bulan terunggah saja.')+'</span></div>'}
function previewUnsafe(){
 var h=window.location&&window.location.hostname||'';
 return String(window.HASNARIA_SB||'').includes('bnnhmtkpdjlgehsvgoda')&&
 h!=='hasnaria-business-analyzer.vercel.app'; // Never write customer PII to production DB from a Vercel preview/staging alias
}
function css(){if(document.getElementById('loyalty-v1-css'))return;var l=document.createElement('link');l.id='loyalty-v1-css';l.rel='stylesheet';l.href='/loyalty-v1.css?v=1';document.head.appendChild(l)}
function kpi(k,v,sub){return '<div class="lo1-kpi"><span>'+e(k)+'</span><strong>'+e(v)+'</strong><small>'+e(sub||'')+'</small></div>'}
function chart(dist){var sum=dist.reduce(function(a,x){return a+Number(x.customers||0)},0);
 return '<div class="lo1-chart">'+dist.map(function(x){var width=sum?100*Number(x.customers)/sum:0;return '<div class="lo1-bar"><span>'+e(x.group)+' kali</span><progress max="100" value="'+width.toFixed(2)+'"></progress><b>'+num(x.customers)+'</b></div>'}).join('')+'</div>'}
function table(a){if(!a.length)return '<div class="lo1-empty">Tidak ada pelanggan yang cocok dengan filter.</div>';
 return '<div class="lo1-tablewrap"><table><thead><tr><th>Pelanggan</th><th>Telepon</th><th>Kunjungan YTD</th><th>Belanja YTD</th><th>Terakhir</th><th>Segmen</th></tr></thead><tbody>'+a.map(function(r){return '<tr><td>'+e(r.name)+'</td><td>•••• '+e(r.phone_last4)+'</td><td>'+num(r.visits)+'</td><td>'+money(r.revenue)+'</td><td>'+date(r.last_visit_at)+'</td><td><span class="lo1-chip '+e(r.segment)+'">'+(r.segment==='high_frequency'?'High Frequency':r.segment==='repeat'?'Repeat':'Satu kali')+'</span></td></tr>'}).join('')+'</tbody></table></div>'}
function render(){
 var h=host();if(!h)return;css();if(!owner()){h.innerHTML='<div class="lo1-alert">Halaman Loyalty khusus Owner.</div>';return}
 var d=state.data, sm=d&&d.summary, batch=d&&d.batch, cov=d&&d.coverage, dist=d&&d.distribution||[],rows=d&&d.customers||[];
 var options=state.months.length?state.months:[state.period||new Date().toISOString().slice(0,7)+'-01'];
 h.innerHTML='<div class="lo1-shell"><div class="lo1-heading"><div><strong>Customer Loyalty <em>YTD</em></strong><small>Akumulasi Januari–'+e(monthName(state.period))+' · pelanggan teridentifikasi Majoo, bukan omzet toko keseluruhan.</small></div><div class="lo1-controls"><label>Bulan<select id="lo1Period">'+options.map(function(m){return '<option value="'+e(m)+'"'+(m===state.period?' selected':'')+'>'+e(monthName(m))+'</option>'}).join('')+'</select></label><button type="button" data-lo1="refresh">↻ Refresh</button><label class="lo1-upload">+ Upload Excel<input id="lo1File" type="file" accept=".xlsx,.xls" hidden></label></div></div>'+
 (state.error?'<div role="alert" class="lo1-alert">'+e(state.error)+'</div>':'')+
 (state.notice?'<div class="lo1-notice">'+e(state.notice)+'</div>':'')+
 (state.loading&&!d?'<div class="lo1-empty">Memuat akumulasi pelanggan…</div>':'')+
 (cov?coverageLine(cov):'')+
 (sm?'<div class="lo1-kpis">'+kpi('Pelanggan Unik YTD',num(sm.customers),'Tidak dihitung ganda')+kpi('Repeat Customer YTD',pct(sm.repeat_customers,sm.customers),num(sm.repeat_customers)+' pelanggan')+kpi('Kunjungan YTD',num(sm.transactions),'Datang Jan–bulan terpilih')+kpi('Belanja Tercatat YTD',money(sm.revenue),'Pelanggan teridentifikasi')+kpi('Rata-rata / Kunjungan',money(sm.transactions?sm.revenue/sm.transactions:0),'Belanja ÷ kunjungan')+'</div>'+
 '<div class="lo1-graphs"><section><strong>Frekuensi Kunjungan YTD</strong>'+chart(dist)+'</section><section><strong>Kontribusi Pelanggan Berulang YTD</strong><div class="lo1-share">'+pct(sm.repeat_revenue,sm.revenue)+'</div><progress class="lo1-meter" max="100" value="'+(sm.revenue?Math.min(100,100*sm.repeat_revenue/sm.revenue):0).toFixed(2)+'"></progress><small>'+money(sm.repeat_revenue)+' dari '+money(sm.revenue)+'</small></section></div>':'')+
 (state.preview?renderPreview():'')+
 '<div class="lo1-customers"><div class="lo1-search"><div><b>Customer Intelligence · YTD</b>'+(batch?'<small>Data sampai '+e(monthName(state.period))+' · sumber terbaru: '+e(batch.source_file)+' · '+num(d.matched_rows)+' hasil</small>':'<small>Belum ada laporan Majoo hingga bulan ini. Upload laporan per bulan.</small>')+'</div><div class="lo1-filterbar"><input id="lo1Search" placeholder="Cari nama / HP" value="'+e(state.search)+'"><select id="lo1Sort"><option value="spend"'+(state.sort==='spend'?' selected':'')+'>Belanja tertinggi</option><option value="visits"'+(state.sort==='visits'?' selected':'')+'>Paling sering</option><option value="recent"'+(state.sort==='recent'?' selected':'')+'>Kunjungan terbaru</option><option value="name"'+(state.sort==='name'?' selected':'')+'>Nama A–Z</option></select><button type="button" data-lo1="search">Cari</button></div></div>'+
 table(rows)+(d&&d.matched_rows>LIMIT?'<div class="lo1-pager"><button data-lo1="prev" '+(!state.page?'disabled':'')+'>← Sebelumnya</button><span>Halaman '+(state.page+1)+' / '+Math.ceil(d.matched_rows/LIMIT)+'</span><button data-lo1="next" '+((state.page+1)*LIMIT>=d.matched_rows?'disabled':'')+'>Berikutnya →</button></div>':'')+'</div>'+
 '<p class="lo1-disclaimer">YTD dari snapshot Majoo bulanan terbaru; pelanggan unik per nomor dan kunjungan dijumlahkan. Bulan belum diunggah tidak diestimasi. Tidak mengubah Penjualan/Stok/BOM/Keuangan.</p></div>';
 bind(h);
}
function renderPreview(){var p=state.preview;
 return '<section class="lo1-preview"><div><b>Review impor · '+e(p.period.slice(0,7))+'</b><small>'+e(state.file.name)+' · '+num(p.rows.length)+' pelanggan · '+num(p.visits)+' transaksi · '+money(p.revenue)+'</small></div><div><span>'+e(p.warnings.join(' · ')||'Data lolos validasi format')+'</span><button data-lo1="cancel" type="button">Batal</button><button class="lo1-primary" data-lo1="commit" type="button" '+(state.busy?'disabled':'')+'>'+(state.busy?'Menyimpan…':'Konfirmasi Simpan')+'</button></div></section>'}
async function loadMonths(){
 var r=await db().from('loyalty_import_batches').select('period_month').eq('is_current',true).order('period_month',{ascending:false}).limit(100);
 if(r.error)throw r.error;
 var recorded=Array.from(new Set((r.data||[]).map(function(x){return x.period_month}))).filter(Boolean);
 var today=new Date(),year=today.getFullYear(),month=today.getMonth()+1;
 if(!state.period)state.period=recorded[0]||year+'-'+String(month).padStart(2,'0')+'-01';
 var years=Array.from(new Set([year].concat(recorded.map(function(m){return Number(m.slice(0,4))})).concat([Number(state.period.slice(0,4))]))).filter(function(y){return y>=2020&&y<=2100});
 var options=[];years.forEach(function(y){var last=y===year?month:12;for(var m=1;m<=last;m++)options.push(y+'-'+String(m).padStart(2,'0')+'-01')});
 state.months=Array.from(new Set(options.concat(recorded).concat([state.period]))).sort().reverse();
}
async function load(resetMonths){if(!owner()||!db())return;var seq=++state.seq;state.loading=true;state.error='';render();
 try{
  if(resetMonths)await loadMonths();
  var q=await db().rpc('get_loyalty_ytd_dashboard_v1',{p_period_month:state.period||null,p_search:state.search,p_sort:state.sort,p_limit:LIMIT,p_offset:state.page*LIMIT});
  if(q.error)throw q.error;if(seq!==state.seq)return;
  state.data=q.data;state.loaded=true;state.loading=false;render();
 }catch(err){if(seq!==state.seq)return;state.loading=false;state.loaded=true;state.error='Dashboard Loyalty belum tersedia: '+(err.message||String(err));render()}
}
async function ensureXlsx(){if(window.XLSX)return;if(window.__HASNARIA_XLSX_READY){await window.__HASNARIA_XLSX_READY;return}await new Promise(function(resolve,reject){var s=document.createElement('script');s.src='/xlsx-preload.js?v=1';s.onload=resolve;s.onerror=function(){reject(Error('Gagal memuat pembaca Excel.'))};document.head.appendChild(s)});if(window.__HASNARIA_XLSX_READY)await window.__HASNARIA_XLSX_READY;if(!window.XLSX)throw Error('Pembaca Excel tidak tersedia.')}
function periodFromHeader(s){var m=String(s||'').match(/(?:^|\D)(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);if(!m)return'';return m[3]+'-'+MONTHS[m[2].toLowerCase()]+'-01'}
function sourceTime(x){var m=String(x||'').match(/Date Generated\s+(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2}):(\d{2})\s*WIB/i);return m?m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4]+':'+m[5]+':'+m[6]+'+07:00':''}
function strictDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d}
function parseReport(wb){
 var sh=wb.Sheets[wb.SheetNames[0]],a=window.XLSX.utils.sheet_to_json(sh,{header:1,defval:'',raw:true});
 if(a.length<11)throw Error('File tidak memiliki baris pelanggan.');
 var title=String((a[0]||[])[0]).trim(),period=periodFromHeader((a[3]||[])[1]),generated=sourceTime((a[7]||[])[7]);
 if(!/laporan pelanggan/i.test(title))throw Error('File bukan Laporan Pelanggan Majoo.');
 if(!period||!generated)throw Error('Periode atau waktu ekspor Majoo tidak dikenali.');
 if(isNaN(Date.parse(generated)))throw Error('Waktu ekspor tidak valid.');
 var headers=a[9]||[],required=['Nama','No Telp','Tanggal Registrasi','Outlet Registrasi','Total Transaksi','Total Penjualan (Rp)','Last Visit'];
 required.forEach(function(h){if(!headers.some(function(x){return String(x).trim().toLowerCase()===h.toLowerCase()}))throw Error('Kolom wajib tidak ditemukan: '+h)});
 function col(n){return headers.findIndex(function(x){return String(x).trim().toLowerCase()===n.toLowerCase()})}
 var rows=[],seen={},total=0,visits=0,warnings=[],periodStart=new Date(period+'T00:00:00Z');
 for(var i=10;i<a.length;i++){
   var r=a[i]||[],name=String(r[col('Nama')]||'').trim(),phone0=r[col('No Telp')];
   if(!name&&!String(phone0||'').trim()){if(r.some(function(x){return String(x||'').trim()&&!/Powered By/i.test(String(x))}))throw Error('Baris '+(i+1)+' berisi data tanpa identitas.');continue}
   var phone=normalizePhone(phone0),rawTrx=r[col('Total Transaksi')],rawRev=r[col('Total Penjualan (Rp)')],n=parseMoney(rawTrx),rev=parseMoney(rawRev),reg=isoDate(r[col('Tanggal Registrasi')]),last=isoTime(r[col('Last Visit')]);
   if(!phone||!name||name.length>200||!Number.isInteger(n)||n<1||n>100000||!Number.isFinite(rev)||rev<0||rev>1e12||!strictDate(reg)||!last||!strictDate(last.slice(0,10)))throw Error('Data pelanggan tidak valid pada baris '+(i+1)+'. Periksa nomor HP, transaksi, jumlah, dan tanggal.');
   if(seen[phone])throw Error('Nomor pelanggan duplikat pada baris '+seen[phone]+' dan '+(i+1)+'.');
   seen[phone]=i+1;
   if(new Date(last.slice(0,10)+'T00:00:00Z')<periodStart||last.slice(0,10)>period.slice(0,4)+'-12-31')warnings.push('Periksa tanggal terakhir kunjungan di luar periode.');
   rows.push({name:name,phone:phone,registration_date:reg,registration_outlet:String(r[col('Outlet Registrasi')]||'').slice(0,160),visits:n,revenue:rev,last_visit_at:last,source_row:i+1});
   total+=rev;visits+=n;
 }
 if(rows.length<1||rows.length>2000)throw Error('Jumlah pelanggan harus antara 1 dan 2.000.');
 if(!warnings.length)warnings.push('Data pelanggan terbaca, tidak otomatis ditautkan ke transaksi Penjualan');
 return {period:period,generated:generated,rows:rows,revenue:total,visits:visits,warnings:Array.from(new Set(warnings))};
}
async function chooseFile(f){
 if(!f)return;state.file=null;state.preview=null;state.error='';state.notice='';
 if(!/\.xlsx?$/.test(f.name.toLowerCase()))return notify('Gunakan ekspor XLS atau XLSX Laporan Pelanggan Majoo.',true);
 if(f.size>5*1024*1024)return notify('Ukuran file maksimal 5 MB.',true);
 state.busy=true;render();
 try{await ensureXlsx();var buffer=await f.arrayBuffer(),wb=XLSX.read(buffer,{type:'array',cellDates:false,raw:true}),p=parseReport(wb);
   var hash=await crypto.subtle.digest('SHA-256',buffer);p.sha256=Array.from(new Uint8Array(hash)).map(function(n){return n.toString(16).padStart(2,'0')}).join('');
   state.preview=p;state.file=f;state.error='';state.period=p.period;if(!state.months.includes(p.period))state.months.unshift(p.period);
 }catch(err){state.error=err.message||String(err)}finally{state.busy=false;render()}
}
async function commit(){
 if(!state.preview||!state.file||state.busy)return;if(previewUnsafe())return notify('Preview masih terhubung ke database produksi. Upload diblokir demi keamanan. Gunakan domain produksi atau staging yang terisolasi.',true);
 if(!window.confirm('Simpan '+state.preview.rows.length+' pelanggan sebagai snapshot Majoo '+monthName(state.preview.period)+'? Snapshot lama disimpan sebagai riwayat dan angka Penjualan tetap tidak berubah.'))return;
 state.busy=true;state.error='';render();
 try{
  var p=state.preview;
  var result=await db().rpc('import_loyalty_majoo_v1',{p_period_month:p.period,p_filename:state.file.name,p_sha256:p.sha256,p_generated_at:p.generated,p_rows:p.rows});
  if(result.error)throw result.error;
  state.notice=result.data&&result.data.status==='duplicate'?'File identik telah tercatat; tidak ada duplikasi.':'Upload selesai: '+num(p.rows.length)+' pelanggan, '+num(p.visits)+' transaksi dari laporan Majoo.';
  state.preview=null;state.file=null;state.page=0;state.search='';await load(true);
 }catch(err){state.error=err.message||String(err)}finally{state.busy=false;render()}
}
function bind(h){
 h.onchange=function(ev){var t=ev.target;if(t.id==='lo1Period'){state.period=t.value;state.page=0;state.preview=null;state.data=null;load(false)}else if(t.id==='lo1Sort'){state.sort=t.value;state.page=0;load(false)}else if(t.id==='lo1File')chooseFile(t.files&&t.files[0])};
 h.onclick=function(ev){var t=ev.target.closest&&ev.target.closest('[data-lo1]');if(!t)return;var k=t.getAttribute('data-lo1');
 if(k==='refresh')load(true);else if(k==='search'){state.search=(h.querySelector('#lo1Search')||{}).value||'';state.page=0;load(false)}
 else if(k==='next'){state.page++;load(false)}else if(k==='prev'){state.page=Math.max(0,state.page-1);load(false)}
 else if(k==='cancel'){state.preview=null;state.file=null;render()}else if(k==='commit')commit();
 };
 var search=h.querySelector('#lo1Search');if(search)search.onkeydown=function(ev){if(ev.key==='Enter'){ev.preventDefault();state.search=search.value;state.page=0;load(false)}};
}
function mount(){if(!host()||!owner())return;render();if(!state.loaded&&!state.loading)load(true)}
window.__HASNARIA_LOYALTY_MOUNT=mount;
})();