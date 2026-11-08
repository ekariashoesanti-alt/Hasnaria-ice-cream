/* HSN-814 | HASNARIA CEO four-pillar scorecards. All metrics read live from Supabase;
   owner-only RLS / existing owner-gated RPCs, no cached mock values or writes. */
(function(){
'use strict';
if(window.__HASNARIA_CEO_KPI_V1)return;
var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
var state={period:'',loaded:'',loading:false,seq:0,data:{},errors:{}};
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
 if(i===0){if(!d)return'<div class="hx7-empty">Laporan keuangan belum tersedia.</div>';
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
 state.loading=false;state.loaded=period;render();
}
function mount(period){
 if(!owner()||!db()||!/^\d{4}-\d{2}$/.test(period||''))return;
 if(state.period!==period){state.period=period;state.data={};state.errors={};state.loaded='';state.seq++;state.loading=false}
 render();if(state.loaded!==period&&!state.loading)load();
}
function invalidate(){state.loaded='';state.seq++;state.loading=false;if(state.period&&document.getElementById('hx7Cards'))load()}
window.__HASNARIA_CEO_KPI_V1={mount:mount,invalidate:invalidate};
window.__HASNARIA_CEO_KPI_MATH={summarizeFinance:summarizeFinance,summarizeStock:summarizeStock,summarizeLoyalty:summarizeLoyalty,summarizeWorkforce:summarizeWorkforce};
})();