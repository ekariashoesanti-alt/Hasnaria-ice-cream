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
function css(){if(document.getElementById('hx7-css'))return;var l=document.createElement('link');l.id='hx7-css';l.rel='stylesheet';l.href='/owner-ceo-kpi-v1.css?v=1';document.head.appendChild(l)}
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
function summarizeWorkforce(rows,scans,employees,rosters,templates){
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
  rawScans:Number(scans||0),ranking:ranking};
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
  add('workforce','P2','Lengkapi absen masuk–keluar sebelum menilai disiplin',
   num(w.rawScans)+' scan perangkat di bulan pilihan; '+num(w.validShifts)+' pasangan masuk–keluar sah.',
   'Pastikan staf melakukan check-out yang benar; lengkapi jadwal dan koreksi berbukti melalui prosedur.',
   'Jam kerja dan ranking disiplin ditahan sampai tersedia pasangan waktu yang sah, bukan estimasi dari scan masuk.',
   'Tinggi untuk kelengkapan data','Operasional → Attendance');
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
  '<h2 id="hx7InsightTitle">Insight & Prioritas Bisnis</h2><p>Prioritas otomatis berdasarkan 4 KPI dan kualitas data yang tersedia; bukan prediksi atau laba audit.</p></div>'+
  '<span class="hx7-insight-count">'+num(items.length)+' tindakan</span></div>'+
  '<div class="hx7-insight-grid">'+items.map(function(p){
    return '<article class="hx7-insight-item">'+
     '<div class="hx7-insight-top"><span class="hx7-insight-priority '+(p.priority==='P1'?'urgent':'')+'">'+esc(p.priority)+'</span>'+
     '<small>#'+p.rank+' · '+esc(p.area)+'</small></div>'+
     '<h3>'+esc(p.title)+'</h3>'+
     '<p class="hx7-insight-evidence">'+esc(p.evidence)+'</p>'+
     '<p class="hx7-insight-action"><b>Aksi:</b> '+esc(p.action)+'</p>'+
     '<details class="hx7-insight-more"><summary>Mitigasi & kualitas data</summary><p>'+esc(p.guard)+'</p><small>Keyakinan sumber: '+esc(p.confidence)+'</small></details>'+
     '</article>';
  }).join('')+'</div></section>';
}
function renderInsights(){
 var root=document.getElementById('hx7Insights');if(!root||!owner())return;
 if(state.loading&&state.loaded!==state.period){root.textContent='Menyusun prioritas dari KPI Supabase…';return}
 root.innerHTML=insightsMarkup(businessPriorities(state.data,state.errors,state.period));
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
function cardBody(i,d){
 if(i===0){if(!d||!d.months)return'<div class="hx7-empty">Laporan keuangan periode ini belum tersedia. Angka tidak diisi dengan asumsi nol.</div>';
  return '<div class="hx7-main-value"><small>Akumulasi Januari–'+esc(monthTitle(state.period))+'</small>'+metric('Pendapatan',money(d.revenue))+metric('Biaya',money(d.cost))+metric('Laba / Rugi',money(d.profit),d.profit<0?'negative':'positive')+'</div>'+
   '<div class="hx7-detail">'+pill(d.provisional?'HPP provisional':'HPP final',d.provisional?'caution':'good')+
   '<span>'+d.months+'/'+d.expected+' bulan · margin '+(d.margin==null?'—':dec(d.margin)+'%')+'</span></div>'+
   (!d.reconciled?'<p class="hx7-warning">Selisih rekonsiliasi, periksa Finance.</p>':'');
 }
 if(i===1){if(!d)return'<div class="hx7-empty">Data stok belum tersedia.</div>';
  return '<div class="hx7-stock-pair">'+stockRow('STOK PALING AMAN',d.safest,'positive')+
    stockRow('STOK PALING KRITIS',d.critical,'negative')+'</div>'+
   '<div class="hx7-detail">'+pill(d.eligible+'/'+d.total+' SKU layak diranking',d.eligible===d.total?'good':'caution')+'</div>'+
   '<p class="hx7-foot">Menggunakan saldo hasil opname & pergerakan valid. Stok ditampilkan per kondisi terkini, bukan historis bulan yang dipilih.</p>';
 }
 if(i===2){if(!d)return'<div class="hx7-empty">Data Loyalty belum tersedia.</div>';
  return '<div class="hx7-subhead">CUSTOMER OF THE MONTH <small>Top 3 · nilai belanja '+esc(monthTitle(state.period))+'</small></div>'+
   (d.top3.length?'<ol class="hx7-rankings">'+d.top3.map(function(x,j){return rankRow(j,x,function(y){return money(y.revenue)})}).join('')+'</ol>':
    '<div class="hx7-empty small">Belum ada laporan pelanggan bulan ini.</div>')+
   '<div class="hx7-subhead second">MOST LOYAL CUSTOMER TO DATE <small>Frekuensi transaksi YTD</small></div>'+
   (d.mostLoyal?'<div class="hx7-loyal"><b>'+esc(d.mostLoyal.name)+'</b><strong>'+num(d.mostLoyal.visits)+'× kunjungan</strong><small>'+money(d.mostLoyal.revenue)+' total belanja teridentifikasi</small></div>':
    '<div class="hx7-empty small">Belum ada riwayat pelanggan.</div>')+
   '<div class="hx7-detail">'+pill('Cakupan '+d.coverage+'/'+d.expected+' bulan',d.coverage===d.expected?'good':'caution')+'</div>';
 }
 if(i===3){if(!d)return'<div class="hx7-empty">Data absensi belum tersedia.</div>';
  return metric('Total jam hadir',d.average==null?'—':hours(d.total))+
   metric('Rata-rata per shift lengkap',d.average==null?'—':hours(d.average))+
   '<div class="hx7-subhead second">RANKING DISIPLIN ABSEN MASUK–KELUAR <small>Jadwal, ketepatan waktu & kelengkapan</small></div>'+
   (d.ranking.length?'<ol class="hx7-rankings">'+d.ranking.map(function(x,j){return rankRow(j,x,function(y){return dec(y.score)+'%'})}).join('')+'</ol>':
    '<div class="hx7-empty small">Belum ada shift terverifikasi yang memenuhi syarat ranking.</div>')+
   '<div class="hx7-detail">'+pill(num(d.validShifts)+' shift lengkap',d.validShifts?'good':'caution')+
   '<span>'+num(d.rawScans)+' scan perangkat tidak otomatis dihitung</span></div>';
 }
 return '';
}
function render(){
 var root=document.getElementById('hx7Cards');if(!root||!owner())return;css();
 root.innerHTML=TITLES.map(function(title,i){
  var key=['finance','stock','loyalty','workforce'][i],err=state.errors[key];
  var body=err?'<div class="hx7-empty" role="alert">Data belum dapat dimuat. '+esc(err)+'</div>':
    state.loading&&!state.data[key]?'<div class="hx7-empty">Mengambil data Supabase…</div>':
    cardBody(i,state.data[key]);
  return '<article class="hx7-card hx7-card-'+key+'"><div class="hx7-header"><div><span class="hx7-overline">EXECUTIVE SIGNAL · 0'+(i+1)+'</span><h2>'+esc(title)+'</h2></div><span class="hx7-indicator" aria-hidden="true"></span></div>'+
   '<div class="hx7-body">'+body+'</div>'+
   '<div class="hx7-source">SUMBER · '+esc(['Finance provisional','Inventory + Audit','Majoo Loyalty','Attendance + Roster'][i])+'</div></article>';
 }).join('');
 renderInsights();
}
async function workforceData(period){
 var start=period+'-01',end=monthEnd(period);
 var pair=await Promise.all([
  db().from('attendance').select('employee_id,attendance_date,check_in_at,check_out_at,roster_id,status').eq('brand_id',BRAND).gte('attendance_date',start).lte('attendance_date',end),
  db().from('attendance_device_scans_v1').select('id',{count:'exact',head:true}).eq('brand_id',BRAND).gte('scan_date',start).lte('scan_date',end)
 ]);
 var attendance=check(pair[0]),scans=pair[1];if(scans.error)throw scans.error;
 var validated=(attendance||[]).some(function(x){return x.check_in_at&&x.check_out_at&&Date.parse(x.check_out_at)>Date.parse(x.check_in_at)});
 if(!validated)return summarizeWorkforce(attendance,scans.count||0,[],[],[]);
 var refs=await Promise.all([
  db().from('employees').select('id,full_name').eq('brand_id',BRAND),
  db().from('shift_roster').select('id,employee_id,shift_date,shift_template_id,status').eq('brand_id',BRAND).gte('shift_date',start).lte('shift_date',end),
  db().from('shift_templates').select('id,start_time,end_time').eq('brand_id',BRAND)
 ]);
 return summarizeWorkforce(attendance,scans.count||0,check(refs[0]),check(refs[1]),check(refs[2]));
}
async function load(){
 if(state.loading||!state.period||!owner()||!db())return;
 var period=state.period,seq=++state.seq,y=period.slice(0,4),periodDate=period+'-01';
 state.loading=true;state.errors={};render();
 var calls=[
  db().from('finance_income_statement_provisional_v1').select('period_month,revenue_sales,other_income,cogs_display,operating_expense_adjusted,finance_expense,tax_expense,profit_after_tax_display,is_final_hpp').eq('brand_id',BRAND).gte('period_month',y+'-01-01').lte('period_month',periodDate).order('period_month'),
  Promise.all([
   db().from('inventory_items').select('id,item_name,unit,min_qty').eq('brand_id',BRAND),
   db().from('ui_stock_formula_verification_v1').select('inventory_item_id,independently_calculated_qty,has_physical_baseline,same_day_ambiguous_rows,estimated_bom_usage_rows,arithmetic_difference').eq('brand_id',BRAND)
  ]),
  Promise.all([
   db().rpc('get_loyalty_dashboard_v1',{p_period_month:periodDate,p_search:'',p_sort:'spend',p_limit:3,p_offset:0}),
   db().rpc('get_loyalty_ytd_dashboard_v1',{p_period_month:periodDate,p_search:'',p_sort:'visits',p_limit:1,p_offset:0})
  ]),
  workforceData(period)
 ];
 var settled=await Promise.allSettled(calls);
 if(seq!==state.seq||period!==state.period||!owner())return;
 var keys=['finance','stock','loyalty','workforce'];
 settled.forEach(function(r,i){
  var k=keys[i];
  try{
   if(r.status==='rejected')throw r.reason;
   var v=r.value;
   state.data[k]=i===0?summarizeFinance(check(v),period):
    i===1?summarizeStock(check(v[0]),check(v[1])):
    i===2?summarizeLoyalty(check(v[0]),check(v[1])):v;
  }catch(e){state.data[k]=null;state.errors[k]=(e&&e.message)||String(e)}
 });
 state.loading=false;state.loaded=period;state.refreshedAt=Date.now();render();
}
function mount(period){
 if(!owner()||!db()||!/^\d{4}-\d{2}$/.test(period||''))return;
 if(state.period!==period){state.period=period;state.data={};state.errors={};state.loaded='';state.refreshedAt=0;state.seq++;state.loading=false}
 render();if(state.loaded!==period&&!state.loading)load();
}
function invalidate(){state.loaded='';state.refreshedAt=0;state.seq++;state.loading=false;if(state.period&&document.getElementById('hx7Cards'))load()}
function maybeRefresh(){var root=document.getElementById('hx7Cards'),h=document.getElementById('dashboard');if(!root||!h||h.classList.contains('hidden')||!owner()||state.loading||!state.loaded)return; if(Date.now()-state.refreshedAt>=300000)load()}
window.__HASNARIA_CEO_KPI_V1={mount:mount,invalidate:invalidate,maybeRefresh:maybeRefresh};
window.__HASNARIA_CEO_KPI_MATH={summarizeFinance:summarizeFinance,summarizeStock:summarizeStock,summarizeLoyalty:summarizeLoyalty,summarizeWorkforce:summarizeWorkforce,businessPriorities:businessPriorities};
})();