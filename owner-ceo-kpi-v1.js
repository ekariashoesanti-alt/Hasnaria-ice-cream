/* HSN-814 | HASNARIA CEO four-pillar scorecards. All metrics read live from Supabase;
   owner-only RLS / existing owner-gated RPCs, no cached mock values or writes. */
(function(){
'use strict';
if(window.__HASNARIA_CEO_KPI_V1)return;
var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var state={period:'',loaded:'',loading:false,seq:0,data:{},errors:{},refreshedAt:0};
var TITLES=['Kondisi Finansial','Kondisi Persediaan','Kondisi Pelanggan','Kondisi Karyawan'];
function db(){return window.__HASNARIA_DB}
function owner(){var c=window.__HASNARIA_CONTEXT||{};return c.role==='owner'&&c.brandId===BRAND}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function val(x){var n=Number(x);return Number.isFinite(n)?n:0}
function num(x){return val(x).toLocaleString('id-ID',{maximumFractionDigits:0})}
function money(x){return 'Rp'+Math.round(val(x)).toLocaleString('id-ID')}
function dec(x){return val(x).toLocaleString('id-ID',{maximumFractionDigits:2})}
function hours(x){return val(x).toLocaleString('id-ID',{maximumFractionDigits:1})+' jam'}
function monthTitle(s){return new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(s+'-01T00:00:00Z'))}
function monthEnd(p){return p+'-'+String(new Date(Number(p.slice(0,4)),Number(p.slice(5,7)),0).getDate()).padStart(2,'0')}
function check(r){if(r.error)throw r.error;return r.data}
function css(){if(document.getElementById('hx7-css'))return;var l=document.createElement('link');l.id='hx7-css';l.rel='stylesheet';l.href='/owner-ceo-kpi-v1.css?v=6';document.head.appendChild(l)}
function summarizeFinance(rows,period){
 var y=Number(period.slice(0,4)),expected=Number(period.slice(5,7)),months=new Set(),revenue=0,cost=0,profit=0,provisional=0;
 (rows||[]).forEach(function(r){
  var k=String(r.period_month||'').slice(0,7);if(k.slice(0,4)!==String(y)||k>period)return;
  months.add(k);revenue+=val(r.revenue_sales)+val(r.other_income);
  cost+=val(r.cogs_display)+val(r.operating_expense_adjusted)+val(r.finance_expense)+val(r.tax_expense);
  profit+=val(r.profit_after_tax_display);
  if(!r.is_final_hpp)provisional++;
 });
 return {revenue:revenue,cost:cost,profit:profit,months:months.size,expected:expected,provisional:provisional,
  reconciled:Math.abs(revenue-cost-profit)<1,margin:revenue?100*profit/revenue:null};
}
function summarizeStock(items,audits){
 var lookup=Object.create(null),verified=[];
 (items||[]).forEach(function(x){lookup[x.id]=x});
 (audits||[]).forEach(function(v){
  var i=lookup[v.inventory_item_id],q=Number(v.independently_calculated_qty),threshold=i&&Number(i.min_qty);
  if(!i||!Number.isFinite(q)||!Number.isFinite(threshold)||threshold<=0||
    v.has_physical_baseline!==true||val(v.same_day_ambiguous_rows)!==0||
    val(v.estimated_bom_usage_rows)!==0||Math.abs(val(v.arithmetic_difference))>0.0001)return;
  verified.push({name:i.item_name,unit:i.unit||'',qty:q,min:threshold,ratio:q/threshold});
 });
 verified.sort(function(a,b){return a.ratio-b.ratio||String(a.name).localeCompare(String(b.name))});
 return {critical:verified[0]||null,safest:verified.length?verified[verified.length-1]:null,
  eligible:verified.length,total:(items||[]).length,asOf:'Stok sistem terkini · baseline fisik teruji'};
}
function summarizeLoyalty(month,ytd){
 var cov=ytd&&ytd.coverage||{};
 return {top3:month&&Array.isArray(month.customers)?month.customers.slice(0,3):[],
  mostLoyal:ytd&&Array.isArray(ytd.customers)?ytd.customers[0]||null:null,
  coverage:Number(cov.imported_months||0),expected:Number(cov.expected_months||0),
  missing:Array.isArray(cov.missing_months)?cov.missing_months:[]};
}
function summarizeWorkforce(rows,scans,employees,rosters,templates,deviceRows){
 var valid=(rows||[]).filter(function(a){
  if(!a.check_in_at||!a.check_out_at)return false;
  var delta=Date.parse(a.check_out_at)-Date.parse(a.check_in_at);
  return Number.isFinite(delta)&&delta>0&&delta<=24*3600000;
 });
 var total=valid.reduce(function(s,a){return s+(Date.parse(a.check_out_at)-Date.parse(a.check_in_at))/3600000},0);
 var names=Object.create(null),shifts=Object.create(null),byRoster=Object.create(null);
 (employees||[]).forEach(function(e){names[e.id]=e.full_name});
 (templates||[]).forEach(function(t){shifts[t.id]=t});
 valid.forEach(function(a){if(a.roster_id)byRoster[a.roster_id]=a});
 var scored=Object.create(null);
 (rosters||[]).forEach(function(r){
  if(['cancelled','canceled','leave','off'].includes(String(r.status||'').toLowerCase()))return;
  var s=shifts[r.shift_template_id];if(!s)return;
  var key=r.employee_id;
  if(!scored[key])scored[key]={name:names[key]||'Pegawai',scheduled:0,complete:0,punctual:0};
  var row=scored[key],a=byRoster[r.id];row.scheduled++;
  if(!a)return;row.complete++;
  var start=Date.parse(r.shift_date+'T'+String(s.start_time).slice(0,8)+'+07:00');
  var end=Date.parse(r.shift_date+'T'+String(s.end_time).slice(0,8)+'+07:00');
  if(end<=start)end+=86400000;
  if(Date.parse(a.check_in_at)<=start+5*60000&&Date.parse(a.check_out_at)>=end-5*60000)row.punctual++;
 });
 var ranking=Object.keys(scored).map(function(k){var r=scored[k];r.score=r.scheduled?100*r.punctual/r.scheduled:0;return r})
  .filter(function(r){return r.scheduled>=3&&r.complete>=1})
  .sort(function(a,b){return b.score-a.score||b.complete-a.complete||a.name.localeCompare(b.name)}).slice(0,3);
 return {total:total,average:valid.length?total/valid.length:null,validShifts:valid.length,
  rawScans:Number(scans||0),ranking:ranking,device:summarizeDeviceScans(deviceRows||[])};
}

/* Scan-based durations are only an ESTIMATE of the within-day first-to-last scan span.
   Never post these values to payroll or conflate them with verified shift attendance. */
function summarizeDeviceScans(scans){
 var groups=Object.create(null),people=Object.create(null);
 (scans||[]).forEach(function(s){
  if(!s||!s.scan_date||!s.device_person_id)return;
  var key=String(s.cloud_id||'')+'|'+String(s.device_person_id);
  var groupKey=key+'|'+String(s.scan_date);
  if(!groups[groupKey])groups[groupKey]={person:key,times:[],raw:false};
  var time=String(s.scan_time||'').slice(0,5);
  if(/^\d{2}:\d{2}$/.test(time)){
   var parts=time.split(':').map(Number),mins=parts[0]*60+parts[1];
   if(parts[0]<24&&parts[1]<60)groups[groupKey].times.push(mins);
  }
  if(s.conversion_mode==='raw_only')groups[groupKey].raw=true;
  if(!people[key])people[key]={name:String(s.employee_name||'Pegawai').trim(),days:0,validDays:0,totalMinutes:0};
 });
 Object.keys(groups).forEach(function(key){
  var g=groups[key],p=people[g.person];
  var times=Array.from(new Set(g.times)).sort(function(a,b){return a-b});
  p.days++;
  if(!g.raw&&times.length>=2&&times[times.length-1]>times[0]){
   p.validDays++;
   p.totalMinutes+=times[times.length-1]-times[0];
  }
 });
 var all=Object.keys(people).map(function(k){var p=people[k];p.rate=p.days?p.validDays/p.days:0;return p});
 all.sort(function(a,b){return b.rate-a.rate||b.validDays-a.validDays||a.name.localeCompare(b.name,'id')});
 var days=all.reduce(function(n,p){return n+p.days},0);
 var paired=all.reduce(function(n,p){return n+p.validDays},0);
 var minutes=all.reduce(function(n,p){return n+p.totalMinutes},0);
 return {rawScans:(scans||[]).length,people:all.length,personDays:days,pairedDays:paired,
  totalHours:minutes/60,averageHours:paired?minutes/60/paired:null,ranking:all.slice(0,3)};
}

/* Decisions are conditional on database evidence, not LLM-generated claims.
   Priorities are recomputed whenever the selected period or live KPI values change. */
function businessPriorities(data,errors,period){
 data=data||{};errors=errors||{};
 var out=[],f=data.finance,s=data.stock,c=data.loyalty,w=data.workforce;
 function add(id,priority,title,evidence,action,guard,confidence,area){
  out.push({id:id,priority:priority,title:title,evidence:evidence,action:action,guard:guard,confidence:confidence,area:area});
 }
 if(s&&s.critical&&s.critical.ratio<1){
  add('inventory','P1','Validasi stok kritis sebelum restock',
   String(s.critical.name)+' '+dec(s.critical.qty)+' '+String(s.critical.unit||'')+' / batas '+dec(s.critical.min)+
   ' ('+dec(s.critical.ratio)+'×); '+num(s.eligible)+'/'+num(s.total)+' SKU memenuhi filter audit',
   'Cek fisik SKU kritis, riwayat konsumsi BOM dan penerimaan yang sah; putuskan pembelian berdasarkan hasil verifikasi.',
   'Jika angka berbeda dengan fisik, lakukan koreksi melalui alur opname/approval, bukan mengubah saldo otomatis.',
   'Terbatas untuk kondisi fisik','Stok → Periksa Hitungan');
 }else if(s&&s.total&&s.eligible<s.total){
  add('inventory','P2','Perluas validasi stok sebelum menyimpulkan aman',
   num(s.eligible)+' dari '+num(s.total)+' SKU layak diranking; sisanya belum memenuhi aturan baseline/ambiguitas.',
   'Prioritaskan opname dan pemeriksaan BOM pada SKU bernilai/bergerak tinggi.',
   'Jangan memaknai SKU yang belum tercakup sebagai stok aman atau stok habis.','Terbatas','Stok → Audit');
 }else if(errors.stock||!s){
  add('inventory','P2','Pulihkan visibilitas persediaan',
   'KPI persediaan tidak tersedia dari sumber audit.',
   'Periksa pembacaan inventory, minimum stok dan baseline fisik.',
   'Tunda keputusan reorder berbasis peringkat sampai data tersedia.','Belum tersedia','Stok');
 }
 if(f&&f.months>0&&(!f.reconciled||f.provisional>0||f.months<f.expected)){
  add('finance',f.reconciled?'P1':'P1',f.reconciled?'Pastikan laba YTD benar sebelum keputusan ekspansi':'Rekonsiliasi selisih laporan keuangan',
   'Laba tercatat '+money(f.profit)+' (provisional); '+num(f.months)+'/'+num(f.expected)+
   ' bulan tercakup; '+num(f.provisional)+' bulan HPP belum final'+(f.reconciled?'':'; aritmetika laporan tidak cocok'),
   'Lengkapi periode yang kosong, verifikasi biaya dan HPP berbasis resep/stock, lalu cocokkan kembali jurnal dan laporan.',
   'Pertahankan label provisional; jangan gunakan margin sementara sebagai laba final atau dasar komitmen investasi.',
   'Terbatas','Keuangan → Laporan Laba Rugi');
 }else if(f&&f.months===0){
  add('finance','P1','Lengkapi laporan finansial YTD',
   'Belum ada periode yang dapat dihitung untuk tahun '+String(period).slice(0,4)+'.',
   'Audit impor penjualan, pembelian dan jurnal, lalu lakukan rekonsiliasi.',
   'Tahan interpretasi laba; jangan mengganti data kosong dengan nol.','Belum tersedia','Keuangan');
 }else if(errors.finance||!f){
  add('finance','P1','Periksa sumber keuangan',
   'KPI laporan keuangan belum berhasil dimuat.',
   'Periksa Finance provisional, akses dan sinkronisasi laporan.',
   'Tidak menyimpulkan hasil bisnis dari angka yang belum dapat diverifikasi.','Belum tersedia','Keuangan');
 }else{
  add('finance','P3','Pantau margin dan pertumbuhan terukur',
   'Margin periode akumulasi '+dec(f.margin)+'%, '+num(f.months)+' bulan terlapor dengan HPP final.',
   'Bandingkan tren penjualan dan efisiensi biaya dengan periode sebelumnya sebelum menetapkan target.',
   'Pertahankan aturan rekonsiliasi sumber jika periode berubah.','Cukup','Keuangan');
 }
 if(w&&w.validShifts===0){
  var device=w.device||{},pairDays=Number(device.pairedDays||0);
  add('workforce','P2',pairDays?'Validasi estimasi jam kerja sebelum menilai disiplin':'Lengkapi absen masuk–keluar sebelum menilai disiplin',
   num(w.rawScans)+' scan perangkat di bulan pilihan; '+num(pairDays)+'/'+num(device.personDays||0)+' hari memiliki pasangan scan; '+num(w.validShifts)+' shift terverifikasi.',
   pairDays?'Verifikasi pasangan scan pertama–terakhir terhadap shift dan bukti kehadiran, lalu lengkapi check-out resmi.':'Pastikan staf melakukan check-out yang benar; lengkapi jadwal dan koreksi berbukti melalui prosedur.',
   'Rentang scan hanya estimasi; bukan bukti jam kerja, ketepatan waktu, lembur, atau dasar payroll.',
   'Tinggi untuk cakupan scan, rendah untuk jam kerja resmi','Operasional → Attendance');
 }else if(w&&w.ranking.length===0){
  add('workforce','P2','Perbaiki cakupan penilaian disiplin',
   num(w.validShifts)+' shift lengkap, tetapi belum cukup jadwal/pasangan absensi untuk peringkat adil.',
   'Lengkapi roster, shift serta check-in/out untuk cakupan yang representatif.',
   'Jangan menyebut pegawai paling disiplin sebelum syarat minimal ranking tercapai.',
   'Terbatas','Operasional → Attendance');
 }else if(w){
  add('workforce','P3','Pertahankan kepatuhan dan pemerataan jam kerja',
   num(w.validShifts)+' shift tervalidasi; rata-rata '+hours(w.average)+' per shift.',
   'Pantau staf dengan kelengkapan absensi rendah serta perbedaan jam aktual vs roster.',
   'Evaluasi dengan bukti dan aturan jadwal yang berlaku, bukan dari ranking semata.','Sedang','Operasional → Attendance');
 }else{
  add('workforce','P2','Pulihkan sumber absensi terverifikasi','Data jam kerja belum tersedia.',
   'Periksa attendance dan jadwal shift tanpa membuat estimasi jam kerja.',
   'Jangan tampilkan peringkat disiplin tanpa data.','Belum tersedia','Operasional → Attendance');
 }
 if(c&&c.expected>0&&c.coverage<c.expected){
  add('loyalty','P2','Lengkapi riwayat loyalitas sebelum ekspansi CRM',
   num(c.coverage)+'/'+num(c.expected)+' bulan laporan pelanggan tersedia (YTD hingga '+monthTitle(period)+').',
   'Impor snapshot Majoo bulan yang hilang; jalankan uji retensi terbatas pada pelanggan yang sudah teridentifikasi.',
   'Jangan menyatakan pelanggan terloyal sepanjang tahun dari bulan yang belum tercakup; cegah duplikasi snapshot.',
   'Terbatas','Operasional → Loyalty');
 }else if(c&&c.mostLoyal){
  add('loyalty','P3','Pertahankan pelanggan dengan pembelian berulang',
   'Pelanggan teratas yang tercatat memiliki '+num(c.mostLoyal.visits)+' kunjungan pada data YTD lengkap.',
   'Uji program apresiasi dan pantau peningkatan repeat visit yang terukur.',
   'Gunakan kontak hanya sesuai izin pemasaran dan hindari menambah omzet dari snapshot Loyalty.',
   'Cukup','Operasional → Loyalty');
 }else{
  add('loyalty','P2','Lengkapi intelijen pelanggan','Ranking dan cakupan Loyalty belum dapat diperiksa.',
   'Periksa laporan pelanggan Majoo dan periode yang benar sebelum menargetkan program retensi.',
   'Jangan menyimpulkan churn dari data kosong.','Belum tersedia','Operasional → Loyalty');
 }
 var order={P1:0,P2:1,P3:2};out.sort(function(a,b){return order[a.priority]-order[b.priority]||a.id.localeCompare(b.id)});
 return out.map(function(p,i){p.rank=i+1;return p});
}
function insightsMarkup(items){
 return '<section class="hx7-insights" aria-labelledby="hx7InsightTitle">'+
  '<div class="hx7-insights-heading"><div><span class="hx7-overline">CEO DECISION INTELLIGENCE</span>'+
  '<h2 id="hx7InsightTitle">Insight & Prioritas Bisnis</h2><p>Empat prioritas utama berdasarkan KPI dan kualitas sumber data.</p></div>'+
  '<span class="hx7-insight-count">'+num(items.length)+' tindakan</span></div>'+
  '<div class="hx7-insight-grid">'+items.map(function(p){
   return '<article class="hx7-insight-item">'+
    '<div class="hx7-insight-top"><span class="hx7-insight-priority '+(p.priority==='P1'?'urgent':'')+'">'+esc(p.priority)+'</span>'+
    '<small>#'+p.rank+' · '+esc(p.area)+'</small></div>'+
    '<h3 title="'+esc(p.title)+'">'+esc(p.title)+'</h3>'+
    '<p class="hx7-insight-evidence" title="'+esc(p.evidence)+'">'+esc(p.evidence)+'</p>'+
    '<p class="hx7-insight-action" title="'+esc(p.action)+'"><b>Aksi:</b> '+esc(p.action)+'</p>'+
    '<button type="button" class="hx7-insight-open" data-hx7-insight-id="'+esc(p.id)+'" aria-label="Lihat tindakan lengkap: '+esc(p.title)+'">Lihat tindakan lengkap</button>'+
    '</article>';
  }).join('')+'</div></section>';
}
function showInsightDetail(p){
 if(!p)return;
 var old=document.getElementById('hx7InsightDialog');if(old&&old.close)old.close();if(old)old.remove();
 var dialog=document.createElement('dialog');dialog.id='hx7InsightDialog';dialog.className='hx7-insight-dialog';
 dialog.setAttribute('aria-labelledby','hx7DetailTitle');
 dialog.innerHTML='<div class="hx7-dialog-head"><div><span class="hx7-insight-priority '+(p.priority==='P1'?'urgent':'')+'">'+esc(p.priority)+'</span>'+
  '<span class="hx7-dialog-area">#'+num(p.rank)+' · '+esc(p.area)+'</span>'+
  '<h2 id="hx7DetailTitle">'+esc(p.title)+'</h2></div>'+
  '<button type="button" class="hx7-dialog-close" aria-label="Tutup rincian">×</button></div>'+
  '<div class="hx7-dialog-section"><strong>Dasar penetapan prioritas</strong><p>'+esc(p.evidence)+'</p></div>'+
  '<div class="hx7-dialog-section"><strong>Tindakan yang disarankan</strong><p>'+esc(p.action)+'</p></div>'+
  '<div class="hx7-dialog-section"><strong>Mitigasi & jalur pemulihan</strong><p>'+esc(p.guard)+'</p></div>'+
  '<p class="hx7-dialog-confidence">Keyakinan sumber: '+esc(p.confidence)+'</p>';
 dialog.addEventListener('close',function(){dialog.remove()});
 dialog.addEventListener('click',function(e){if(e.target===dialog||e.target.closest('.hx7-dialog-close'))dialog.close()});
 document.body.appendChild(dialog);
 if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
}
function renderInsights(){
 var root=document.getElementById('hx7Insights');if(!root||!owner())return;
 if(state.loading&&state.loaded!==state.period){root.textContent='Menyusun prioritas dari KPI Supabase…';return}
 var items=businessPriorities(state.data,state.errors,state.period);
 root.innerHTML=insightsMarkup(items);
 root.onclick=function(e){
  var trigger=e.target&&e.target.closest?e.target.closest('[data-hx7-insight-id]'):null;
  if(!trigger||!root.contains(trigger))return;
  var id=trigger.getAttribute('data-hx7-insight-id');
  var p=items.find(function(x){return x.id===id});
  showInsightDetail(p);
 };
}
/* HSN-818 | Lightweight, verified YTD series from the existing sales_daily_kpis view.
   The series is for visualization only; it is not added to posted Finance income. */
function summarizeMonthlySales(rows,period){
 var year=String(period||'').slice(0,4),expected=Number(String(period||'').slice(5,7));
 var months=[],index=Object.create(null),revenue=0,transactions=0,actualMonths=0,lastMonth='';
 if(!/^\d{4}$/.test(year)||expected<1||expected>12)return {months:[],revenue:0,transactions:0,actualMonths:0,expected:0,lastMonth:''};
 for(var m=1;m<=expected;m++){
  var key=year+'-'+String(m).padStart(2,'0');
  var record={key:key,label:['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][m-1],revenue:0,transactions:0,days:0,hasData:false};
  months.push(record);index[key]=record;
 }
 (rows||[]).forEach(function(x){
  var key=String(x.metric_date||'').slice(0,7),target=index[key];
  if(!target)return;
  target.revenue+=val(x.revenue);
  target.transactions+=val(x.transactions);
  target.days++;target.hasData=true;
 });
 months.forEach(function(x){if(!x.hasData)return;revenue+=x.revenue;transactions+=x.transactions;actualMonths++;lastMonth=x.key});
 return {months:months,revenue:revenue,transactions:transactions,actualMonths:actualMonths,expected:expected,lastMonth:lastMonth};
}
function shortMoney(amount){
 var a=Number(amount);
 if(!Number.isFinite(a))return '—';
 var abs=Math.abs(a),div=abs>=1000000000?1000000000:abs>=1000000?1000000:abs>=1000?1000:1;
 var suffix=div===1000000000?' M':div===1000000?' jt':div===1000?' rb':'';
 return 'Rp'+(a/div).toLocaleString('id-ID',{maximumFractionDigits:1})+suffix;
}
function sparkline(trend){
 if(!trend||!trend.months)return '';
 var values=trend.months.filter(function(x){return x.hasData}).map(function(x){return x.revenue});
 if(!values.length)return '';
 var max=Math.max.apply(null,values.concat([1])),min=Math.min.apply(null,values.concat([0]));
 var range=Math.max(1,max-min),points=values.map(function(v,i){
  var x=8+(values.length===1?102:i*204/(values.length-1)),y=31-(v-min)/range*23;
  return x.toFixed(1)+','+y.toFixed(1);
 }).join(' ');
 var pts=points.split(' '),last=pts[pts.length-1].split(',');
 return '<svg class="hx8-sparkline" viewBox="0 0 220 38" preserveAspectRatio="none" role="img" aria-label="Kurva penjualan bulanan YTD dari transaksi yang tersedia">'+
  '<polygon points="8,36 '+points+' 212,36" fill="#e6f5ee"/>'+
  '<polyline points="'+points+'" fill="none" stroke="#178466" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'+
  '<circle cx="'+last[0]+'" cy="'+last[1]+'" r="3" fill="#fff" stroke="#178466" stroke-width="2"/></svg>';
}
function salesTrendSvg(trend){
 if(!trend||!trend.months||!trend.actualMonths)return '';
 var list=trend.months,n=list.length,left=34,right=503,baseline=117,top=23,width=(right-left)/Math.max(n,1);
 var maxRevenue=Math.max.apply(null,list.filter(function(x){return x.hasData}).map(function(x){return x.revenue}).concat([1]));
 var maxTx=Math.max.apply(null,list.filter(function(x){return x.hasData}).map(function(x){return x.transactions}).concat([1]));
 var svg='<svg viewBox="0 0 530 153" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Tren bulanan YTD: batang pendapatan rupiah, garis jumlah transaksi">';
 for(var z=0;z<=3;z++){
  var gy=baseline-z*29.5;
  svg+='<line x1="'+left+'" x2="'+right+'" y1="'+gy+'" y2="'+gy+'" stroke="#e5efea" stroke-dasharray="3 4"/>';
  svg+='<text x="27" y="'+(gy+3)+'" text-anchor="end" font-size="9" fill="#76918a">'+(maxRevenue*z/3/1000000).toLocaleString('id-ID',{maximumFractionDigits:1})+'</text>';
 }
 var lines=[];
 list.forEach(function(x,i){
  var cx=left+(i+.5)*width,barw=Math.min(24,width*.56);
  svg+='<text x="'+cx.toFixed(1)+'" y="136" text-anchor="middle" font-size="9" fill="#688379">'+esc(x.label)+'</text>';
  if(!x.hasData)return;
  var h=x.revenue/maxRevenue*88.5;
  svg+='<rect x="'+(cx-barw/2).toFixed(1)+'" y="'+(baseline-h).toFixed(1)+'" width="'+barw.toFixed(1)+'" height="'+Math.max(0,h).toFixed(1)+'" rx="3" fill="#198768"><title>'+esc(x.label)+': '+esc(money(x.revenue))+' · '+num(x.transactions)+' transaksi</title></rect>';
  lines.push(cx.toFixed(1)+','+(baseline-x.transactions/maxTx*88.5).toFixed(1));
 });
 if(lines.length>1)svg+='<polyline points="'+lines.join(' ')+'" fill="none" stroke="#53a744" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/>';
 lines.forEach(function(pt){var p=pt.split(',');svg+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3" fill="#fff" stroke="#53a744" stroke-width="2"/>'});
 return svg+'</svg>';
}
function renderTrend(){
 var root=document.getElementById('hx8SalesTrend');if(!root||!owner())return;
 var trend=state.data.trend,err=state.errors.trend;
 var header='<div class="hx8-trend-head"><div><span class="hx7-overline">PERFORMANCE MONITOR</span><h2>Tren Penjualan YTD</h2></div>'+
  '<div class="hx8-chart-legend"><span><i class="bars"></i> Penjualan (Rp jt)</span><span><i class="line"></i> Transaksi</span></div></div>';
 if(err){root.innerHTML=header+'<p class="hx8-trend-empty">Tren tidak dapat dimuat dari penjualan. '+esc(err.message||err)+'</p>';return}
 if(!trend){root.innerHTML=header+'<p class="hx8-trend-empty">'+(state.loading?'Mengambil tren penjualan…':'Data penjualan belum tersedia.')+'</p>';return}
 if(!trend.actualMonths){root.innerHTML=header+'<p class="hx8-trend-empty">Tidak ada data transaksi pada periode yang dipilih.</p>';return}
 var suffix=trend.actualMonths<trend.expected?' · '+(trend.expected-trend.actualMonths)+' bulan belum memiliki data':'';
 root.innerHTML=header+'<div class="hx8-chart-wrap">'+salesTrendSvg(trend)+'</div>'+
  '<div class="hx8-trend-foot"><span>'+esc(monthTitle(trend.lastMonth))+' terakhir tersedia'+esc(suffix)+'</span><strong>'+shortMoney(trend.revenue)+' · '+num(trend.transactions)+' transaksi</strong></div>';
}

function pill(t,cls){return '<span class="hx7-pill '+esc(cls||'')+'">'+esc(t)+'</span>'}
function metric(label,value,cls){return '<div class="hx7-metric"><span>'+esc(label)+'</span><strong class="'+esc(cls||'')+'" title="'+esc(value)+'">'+esc(value)+'</strong></div>'}
function stockRow(label,x,cls){
 return '<div class="hx7-stock"><span>'+esc(label)+'</span>'+
  (x?'<b title="'+esc(x.name)+'">'+esc(x.name)+'</b><strong class="'+esc(cls||'')+'">'+dec(x.qty)+' '+esc(x.unit)+' <small> / batas '+dec(x.min)+' · '+dec(x.ratio)+'×</small></strong>':
      '<b>Belum dapat ditentukan</b>')+'</div>';
}
function rankRow(i,x,suffix){
 return '<li><span class="hx7-rank-number">'+(i+1)+'</span><b title="'+esc(x.name)+'">'+esc(x.name)+'</b><strong>'+esc(suffix(x))+'</strong></li>';
}
function cardIcon(i){
 var strokes=[
  '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M7 3h10"/>',
  '<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
  '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
 ];
 return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+strokes[i]+'</svg>';
}
function cardStatus(i,d){
 // Status is visualized by a small colored dot; the full meaning stays
 // accessible through the dot's title and aria-label.
 var key=['finance','stock','loyalty','workforce'][i];
 if(state.loading&&!d&&!state.errors[key])return ['Sedang memuat data','neutral'];
 if(i===0)return state.errors.finance?['Laporan keuangan tertunda','caution']:
  d&&d.months?[(d.provisional?'HPP provisional · laba belum final':'HPP final'),d.provisional?'caution':'good']:
  ['Laporan keuangan belum lengkap','caution'];
 if(i===1){
  if(!d)return ['Data stok belum tersedia','neutral'];
  if(d.critical&&d.critical.ratio<1)return ['Stok kritis','danger'];
  return d.total&&d.eligible===d.total?['Stok tervalidasi','good']:['Cakupan audit stok belum lengkap','caution'];
 }
 if(i===2)return !d?['Data pelanggan belum tersedia','neutral']:
  d.expected&&d.coverage===d.expected?['Riwayat pelanggan lengkap','good']:['Riwayat pelanggan belum lengkap','caution'];
 return !d?['Data scan belum tersedia','neutral']:['Estimasi scan · bukan jam kerja resmi','neutral'];
}
function cardBody(i,d){
 if(i===0){
  var trend=state.data.trend,hasFinance=!!(d&&d.months),salesRevenue=trend&&trend.actualMonths?trend.revenue:null;
  var revenue=hasFinance?d.revenue:salesRevenue;
  if(revenue===null)return '<div class="hx7-empty">'+(state.errors.finance?'Laporan keuangan gagal dimuat. Data penjualan juga belum tersedia.':'Belum ada data finansial untuk periode terpilih.')+'</div>';
  return '<div class="hx8-metric-caption">PENDAPATAN AKUMULASI TAHUN BERJALAN</div>'+
   '<div class="hx8-hero-number" title="'+esc(money(revenue))+'">'+shortMoney(revenue)+'</div>'+
   '<div class="hx8-finance-spark">'+sparkline(trend)+'</div>'+
   '<div class="hx8-finance-row"><div><small>Biaya'+(hasFinance?' · sementara':'')+'</small><strong>'+((hasFinance)?shortMoney(d.cost):'—')+'</strong></div>'+
   '<div><small>Laba / Rugi</small><strong class="'+(hasFinance&&d.profit<0?'negative':'')+'">'+(hasFinance?shortMoney(d.profit):'—')+'</strong></div>'+
   '<div><small>Margin</small><strong>'+((hasFinance&&d.margin!==null)?dec(d.margin)+'%':'—')+'</strong></div></div>'+
   '<div class="hx8-card-caveat">'+(hasFinance?
    (d.months+'/'+d.expected+' bulan · '+(d.provisional?'Laba belum final':'HPP final')+(d.reconciled?'':' · Perlu rekonsiliasi')):
    'Pendapatan berasal dari penjualan aktual. Biaya dan laba belum tersedia dari laporan keuangan.')+'</div>';
 }
 if(i===1){
  if(!d)return '<div class="hx7-empty">Data stok belum tersedia dari audit persediaan.</div>';
  var critical=d.critical,ratio=critical?critical.ratio:0;
  var percentage=Math.max(0,Math.min(100,ratio*100));
  return '<div class="hx8-metric-caption">STOK PALING KRITIS</div>'+
   '<div class="hx8-inventory-title" title="'+esc(critical?critical.name:'')+'">'+esc(critical?critical.name:'Belum dapat ditentukan')+'</div>'+
   (critical?'<div class="hx8-inventory-big"><strong>'+dec(critical.qty)+' '+esc(critical.unit)+'</strong><span>/ batas '+dec(critical.min)+' · '+dec(ratio)+'×</span></div>'+
    '<div class="hx8-progress"><i class="'+(ratio<1?'critical':'')+'" style="width:'+percentage.toFixed(2)+'%"></i></div>'+
    '<div class="hx8-progress-caption">'+dec(percentage)+'% dari batas aman</div>':'')+
   '<div class="hx8-safe-stock"><span>STOK PALING AMAN</span><strong title="'+esc(d.safest?d.safest.name:'')+'">'+esc(d.safest?d.safest.name:'Belum tersedia')+'</strong><b>'+esc(d.safest?dec(d.safest.ratio)+'× batas aman':'—')+'</b></div>'+
   '<div class="hx8-card-caveat">'+num(d.eligible)+'/'+num(d.total)+' SKU layak diranking · berdasarkan stok terverifikasi</div>';
 }
 if(i===2){
  if(!d)return '<div class="hx7-empty">Data Loyalty belum tersedia.</div>';
  var loyal=d.mostLoyal;
  return '<div class="hx8-metric-caption">MOST LOYAL CUSTOMER TO DATE</div>'+
   '<div class="hx8-loyal-hero"><div><strong title="'+esc(loyal?loyal.name:'')+'">'+esc(loyal?loyal.name:'Belum teridentifikasi')+'</strong><span>'+(loyal?num(loyal.visits)+'× kunjungan':'Belum ada histori')+'</span></div><span class="hx8-loyal-star">★</span></div>'+
   '<div class="hx8-metric-caption hx8-top-customer-label">CUSTOMER OF THE MONTH · TOP 3</div>'+
   (d.top3.length?'<ol class="hx8-top-customers">'+d.top3.map(function(x,j){return '<li><span class="hx8-rank">'+(j+1)+'</span><b title="'+esc(x.name)+'">'+esc(x.name)+'</b><strong>'+shortMoney(x.revenue)+'</strong></li>'}).join('')+'</ol>':
    '<div class="hx7-empty small">Belum ada transaksi pelanggan pada bulan terpilih.</div>')+
   '<div class="hx8-card-caveat">Cakupan laporan pelanggan '+num(d.coverage)+'/'+num(d.expected)+' bulan · ranking hanya dari data tersedia</div>';
 }
 if(i===3){
  if(!d)return '<div class="hx7-empty">Data kehadiran belum tersedia.</div>';
  var scanned=d.device||{},paired=Number(scanned.pairedDays||0);
  return '<div class="hx8-attendance-head"><div><span>TOTAL DURASI ANTAR-SCAN*</span><strong>'+(paired?hours(scanned.totalHours):'—')+'</strong></div>'+
   '<div><span>RERATA / HARI BERPASANGAN*</span><strong>'+(paired?hours(scanned.averageHours):'—')+'</strong></div></div>'+
   '<div class="hx8-metric-caption hx8-attendance-label">KELENGKAPAN PASANGAN SCAN</div>'+
   ((scanned.ranking||[]).length?'<div class="hx8-attendance-list">'+scanned.ranking.map(function(x){
    var pct=x.days?Math.min(100,100*x.validDays/x.days):0;
    return '<div class="hx8-attendance-person"><span class="hx8-employee-name" title="'+esc(x.name)+'">'+esc(x.name)+'</span>'+
     '<div class="hx8-attendance-track"><i style="width:'+pct.toFixed(1)+'%"></i></div>'+
     '<b>'+num(x.validDays)+'/'+num(x.days)+' hari</b></div>';
   }).join('')+'</div>':'<div class="hx7-empty small">Belum ada pasangan scan yang dapat ditampilkan.</div>')+
   '<div class="hx8-card-caveat">'+num(paired)+'/'+num(scanned.personDays||0)+' hari berpasangan · '+num(d.rawScans)+' scan · '+num(d.validShifts)+' shift resmi.<br>*Estimasi scan, bukan jam kerja resmi atau ranking disiplin.</div>';
 }
 return '';
}
function render(){
 var root=document.getElementById('hx7Cards');if(!root||!owner())return;css();
 root.innerHTML=TITLES.map(function(title,i){
  var key=['finance','stock','loyalty','workforce'][i],d=state.data[key],err=state.errors[key];
  var pending=state.loading&&!d&&!err,stat=cardStatus(i,d);
  var body=pending?'<div class="hx7-empty">Mengambil data Supabase…</div>':
   err&&i!==0?'<div class="hx7-empty" role="alert">Data belum tersedia. '+esc(String(err).slice(0,115))+'</div>':
   cardBody(i,d);
  return '<article class="hx7-card hx8-ceo-card hx7-card-'+key+'">'+
   '<div class="hx7-header hx8-ceo-header"><div class="hx8-heading"><span class="hx8-card-icon">'+cardIcon(i)+'</span><h2>'+esc(title)+'</h2></div>'+
   '<span class="hx8-status-dot hx8-status-'+esc(stat[1])+'" title="Status: '+esc(stat[0])+'" role="img" aria-label="Status: '+esc(stat[0])+'" tabindex="0"></span></div>'+
   '<div class="hx7-body hx8-ceo-body">'+body+'</div>'+
   '<div class="hx7-source">SUMBER · '+esc(['Finance & Sales','Inventory + Audit','Majoo Loyalty','Attendance + Roster'][i])+'</div></article>';
 }).join('');
 renderInsights();
 renderTrend();
}

async function workforceData(period){
 var start=period+'-01',end=monthEnd(period);
 var pair=await Promise.all([
  db().from('attendance').select('employee_id,attendance_date,check_in_at,check_out_at,roster_id,status').eq('brand_id',BRAND).gte('attendance_date',start).lte('attendance_date',end),
  db().from('attendance_device_scans_v1').select('cloud_id,device_person_id,employee_name,scan_date,scan_time,conversion_mode').eq('brand_id',BRAND).gte('scan_date',start).lte('scan_date',end).limit(3000)
 ]);
 var attendance=check(pair[0]),scans=check(pair[1])||[];
 var validated=(attendance||[]).some(function(x){return x.check_in_at&&x.check_out_at&&Date.parse(x.check_out_at)>Date.parse(x.check_in_at)});
 if(!validated)return summarizeWorkforce(attendance,scans.length,[],[],[],scans);
 var refs=await Promise.all([
  db().from('employees').select('id,full_name').eq('brand_id',BRAND),
  db().from('shift_roster').select('id,employee_id,shift_date,shift_template_id,status').eq('brand_id',BRAND).gte('shift_date',start).lte('shift_date',end),
  db().from('shift_templates').select('id,start_time,end_time').eq('brand_id',BRAND)
 ]);
 return summarizeWorkforce(attendance,scans.length,check(refs[0]),check(refs[1]),check(refs[2]),scans);
}
async function load(){
 if(state.loading||!state.period||!owner()||!db())return;
 var period=state.period,seq=++state.seq,year=period.slice(0,4),periodDate=period+'-01';
 state.loading=true;state.errors={};render();
 var keys=['finance','stock','loyalty','workforce','trend'];
 var queries=[
  db().from('finance_income_statement_provisional_v1')
   .select('period_month,revenue_sales,other_income,cogs_display,operating_expense_adjusted,finance_expense,tax_expense,profit_after_tax_display,is_final_hpp')
   .eq('brand_id',BRAND).gte('period_month',year+'-01-01').lte('period_month',periodDate).order('period_month'),
  Promise.all([
   db().from('inventory_items').select('id,item_name,unit,min_qty').eq('brand_id',BRAND),
   db().from('ui_stock_formula_verification_v1')
    .select('inventory_item_id,independently_calculated_qty,has_physical_baseline,same_day_ambiguous_rows,estimated_bom_usage_rows,arithmetic_difference').eq('brand_id',BRAND)
  ]),
  Promise.all([
   db().rpc('get_loyalty_dashboard_v1',{p_period_month:periodDate,p_search:'',p_sort:'spend',p_limit:3,p_offset:0}),
   db().rpc('get_loyalty_ytd_dashboard_v1',{p_period_month:periodDate,p_search:'',p_sort:'visits',p_limit:1,p_offset:0})
  ]),
  workforceData(period),
  db().from('sales_daily_kpis').select('metric_date,revenue,transactions')
   .eq('brand_id',BRAND).gte('metric_date',year+'-01-01').lte('metric_date',monthEnd(period)).order('metric_date').limit(400)
 ];
 // Progressive source resolution: slow Finance must not hide healthy Stock/CRM/Attendance/Sales.
 await Promise.all(queries.map(function(p,i){
  return Promise.resolve(p).then(function(v){
   if(seq!==state.seq||period!==state.period||!owner())return;
   var k=keys[i];
   try{
    state.data[k]=i===0?summarizeFinance(check(v),period):
     i===1?summarizeStock(check(v[0]),check(v[1])):
     i===2?summarizeLoyalty(check(v[0]),check(v[1])):
     i===3?v:summarizeMonthlySales(check(v),period);
    delete state.errors[k];
   }catch(e){state.data[k]=null;state.errors[k]=(e&&e.message)||String(e)}
   render();
  },function(e){
   if(seq!==state.seq||period!==state.period||!owner())return;
   var k=keys[i];state.data[k]=null;state.errors[k]=(e&&e.message)||String(e);
   render();
  });
 }));
 if(seq!==state.seq||period!==state.period||!owner())return;
 state.loading=false;state.loaded=period;state.refreshedAt=Date.now();render();
}
function mount(period){
 if(!owner()||!db()||!/^\d{4}-\d{2}$/.test(period||''))return;
 if(state.period!==period){var dlg=document.getElementById('hx7InsightDialog');if(dlg&&dlg.close)dlg.close();state.period=period;state.data={};state.errors={};state.loaded='';state.refreshedAt=0;state.seq++;state.loading=false}
 render();if(state.loaded!==period&&!state.loading)load();
}
function invalidate(){state.loaded='';state.refreshedAt=0;state.seq++;state.loading=false;if(state.period&&document.getElementById('hx7Cards'))load()}
function maybeRefresh(){var root=document.getElementById('hx7Cards'),h=document.getElementById('dashboard');if(!root||!h||h.classList.contains('hidden')||!owner()||state.loading||!state.loaded)return; if(Date.now()-state.refreshedAt>=300000)load()}
window.__HASNARIA_CEO_KPI_V1={mount:mount,invalidate:invalidate,maybeRefresh:maybeRefresh};
window.__HASNARIA_CEO_KPI_MATH={titles:TITLES,summarizeFinance:summarizeFinance,summarizeStock:summarizeStock,summarizeLoyalty:summarizeLoyalty,summarizeWorkforce:summarizeWorkforce,summarizeDeviceScans:summarizeDeviceScans,businessPriorities:businessPriorities,cardStatus:cardStatus,insightsMarkup:insightsMarkup,summarizeMonthlySales:summarizeMonthlySales,salesTrendSvg:salesTrendSvg,sparkline:sparkline};
})();