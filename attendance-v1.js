/* Hasnaria Attendance: owner-only device-scanner history; never infer check-out from repeated check-ins. */
(function(){
'use strict';
if(window.__HASNARIA_ATTENDANCE_V1)return;
window.__HASNARIA_ATTENDANCE_V1=true;
var state={month:new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0'),rows:[],loading:false,loaded:false,busy:false,preview:null,file:null,error:'',notice:'',progress:'',search:'',conversionMode:'first_last',seq:0};
var months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function h(){return document.getElementById('opAttendanceHost')}
function db(){return window.__HASNARIA_DB}
function context(){return window.__HASNARIA_CONTEXT||{}}
function owner(){return context().role==='owner'}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
function label(m){return months[Number(m.slice(5,7))-1]+' '+m.slice(0,4)}
function fmt(d){return String(d||'').slice(8,10)+'/'+String(d||'').slice(5,7)+'/'+String(d||'').slice(0,4)}
function options(){var y=new Date().getFullYear(),current=state.month;var result=[];for(var year=y;year>=2025;year--)for(var m=12;m>=1;m--){var value=year+'-'+String(m).padStart(2,'0');if(value>y+'-'+String(new Date().getMonth()+1).padStart(2,'0')||value<='2025-01')continue;result.push('<option value="'+value+'"'+(current===value?' selected':'')+'>'+label(value)+'</option>')}if(result.every(function(o){return o.indexOf('value="'+current+'"')<0}))result.unshift('<option value="'+current+'" selected>'+label(current)+'</option>');return result.join('')}
function css(){if(document.getElementById('attendance-v1-css'))return;var l=document.createElement('link');l.id='attendance-v1-css';l.rel='stylesheet';l.href='/attendance-v1.css?v=1';document.head.appendChild(l)}
function conversionStats(a){var groups={};a.forEach(function(r){var key=r.cloud_id+'|'+r.device_person_id+'|'+r.scan_date;if(!groups[key])groups[key]=[];groups[key].push(r.scan_time)});var paired=0,single=0;Object.keys(groups).forEach(function(k){var times=Array.from(new Set(groups[k]));if(times.length>=2)paired++;else single++});return {paired:paired,single:single}}
function distinctDays(a){var s={};a.forEach(function(r){s[r.device_person_id+'|'+r.scan_date]=1});return Object.keys(s).length}
function summary(a){var people={},days={};a.forEach(function(r){people[r.cloud_id+'|'+r.device_person_id]=r.employee_name;days[r.scan_date]=1});return {people:Object.keys(people).length,days:Object.keys(days).length,personDays:distinctDays(a)}}
function table(){
var matches=state.rows.filter(function(r){var q=state.search.toLowerCase();return !q||r.employee_name.toLowerCase().includes(q)||r.device_person_id.toLowerCase().includes(q)||r.scan_date.includes(q)});
if(!matches.length)return '<div class="at1-empty">Belum ada scan yang cocok pada bulan ini.</div>';
var groups={},records=[];matches.forEach(function(r){var key=r.cloud_id+'|'+r.device_person_id+'|'+r.scan_date;if(!groups[key]){groups[key]={name:r.employee_name,id:r.device_person_id,date:r.scan_date,times:[],types:{},modes:{}};records.push(groups[key])}groups[key].times.push(String(r.scan_time).slice(0,5));groups[key].types[r.scan_type]=1;groups[key].modes[r.conversion_mode||'first_last']=1});
records.sort(function(a,b){return b.date.localeCompare(a.date)||a.name.localeCompare(b.name)});
return '<div class="at1-table-scroll"><table><thead><tr><th>Tanggal</th><th>Pegawai</th><th>ID Mesin</th><th>Jam Masuk</th><th>Jam Keluar</th><th>Jumlah Scan</th><th>Status Konversi</th></tr></thead><tbody>'+records.map(function(r){r.times.sort();var unique=Array.from(new Set(r.times));var convertible=!r.modes.raw_only&&unique.length>=2;var mode=r.modes.raw_only?'Log mentah':convertible?'Konversi otomatis · perlu validasi':'Scan tunggal · belum ada jam keluar';return '<tr><td>'+fmt(r.date)+'</td><td><strong>'+esc(r.name)+'</strong></td><td>'+esc(r.id)+'</td><td>'+esc(unique[0])+'</td><td>'+esc(convertible?unique[unique.length-1]:'—')+'</td><td>'+r.times.length+'</td><td><span class="at1-tag">'+esc(mode)+'</span></td></tr>'}).join('')+'</tbody></table></div><div class="at1-foot">'+records.length+' pegawai-hari ditampilkan · '+matches.length+' scan · Jam keluar otomatis berasal dari scan terakhir pada tanggal yang sama, bukan kepulangan terverifikasi.</div>';
}
function render(){
var root=h();if(!root)return;css();
var s=summary(state.rows),p=state.preview,cs=p?conversionStats(p.rows):null;
root.innerHTML='<div class="at1-shell"><div class="at1-heading"><div><div class="at1-eyebrow">OPERASIONAL · ATTENDANCE</div><h2>Rekap Kehadiran Pegawai</h2><p>Data log mesin absensi wajah · scan pertama dan terakhir per hari, tanpa asumsi jam pulang.</p></div><div class="at1-controls"><label>BULAN<select id="at1Month">'+options()+'</select></label><button type="button" data-at="refresh">↻ Refresh</button><label class="at1-upload">+ Upload Excel<input id="at1File" type="file" accept=".xlsx,.xls" hidden></label></div></div>'+
'<div class="at1-kpis">'+[['Pegawai Tercatat',s.people],['Hari dengan Scan',s.days],['Pegawai-Hari',s.personDays],['Total Scan',state.rows.length]].map(function(k){return '<div><span>'+k[0]+'</span><strong>'+k[1].toLocaleString('id-ID')+'</strong></div>'}).join('')+'</div>'+
(state.error?'<div class="at1-error" role="alert">'+esc(state.error)+'</div>':'')+(state.notice?'<div class="at1-success">'+esc(state.notice)+'</div>':'')+
(state.loading?'<div class="at1-info">Memuat data attendance…</div>':'')+
(p?'<div class="at1-preview"><div><b>Review unggahan: '+esc(state.file.name)+'</b><small>'+p.rows.length+' scan valid · '+p.people+' pegawai · '+p.days+' tanggal · rentang '+fmt(p.min)+'–'+fmt(p.max)+'</small><small>'+esc(p.warnings.join(' · ')||'Tidak ada duplikasi dalam file.')+'</small><label class="at1-conversion">Konversi scan saat upload<select id="at1Conversion"><option value="first_last"'+(state.conversionMode==='first_last'?' selected':'')+'>Otomatis: pertama = masuk, terakhir = keluar</option><option value="raw_only"'+(state.conversionMode==='raw_only'?' selected':'')+'>Log mentah saja (tanpa jam keluar)</option></select></label><small>'+cs.paired+' pegawai-hari dapat dikonversi · '+cs.single+' scan tunggal (tanpa jam keluar)</small></div><div><button type="button" data-at="cancel" '+(state.busy?'disabled':'')+'>Batal</button><button class="at1-primary" type="button" data-at="commit" '+(state.busy?'disabled':'')+'>Konfirmasi Impor</button></div></div>':'')+
(state.progress?'<div class="at1-info" role="status">'+esc(state.progress)+'</div>':'')+
'<section class="at1-panel"><div class="at1-panel-head"><strong>Riwayat Scan Attendance</strong><input id="at1Search" placeholder="Cari pegawai / ID / tanggal" value="'+esc(state.search)+'"></div>'+table()+'</section><div class="at1-caution">Catatan: scan pertama menjadi jam masuk; bila ada minimal dua waktu berbeda untuk ID dan tanggal sama, scan terakhir menjadi jam keluar hasil konversi. Jam keluar ini provisional, bukan bukti kepulangan, keterlambatan, atau lembur. Tidak mengubah tabel absensi internal dan penggajian.</div></div>';
root.onchange=function(ev){var el=ev.target;if(el.id==='at1Month'){state.month=el.value;state.search='';state.preview=null;load()}if(el.id==='at1File')choose(el.files&&el.files[0]);if(el.id==='at1Conversion'){state.conversionMode=el.value==='raw_only'?'raw_only':'first_last';render()}};
root.oninput=function(ev){if(ev.target.id==='at1Search'){state.search=ev.target.value;var caret=ev.target.selectionStart;render();var input=h()&&h().querySelector('#at1Search');if(input){input.focus();try{input.setSelectionRange(caret,caret)}catch(_){}}}};
root.onclick=function(ev){var b=ev.target.closest&&ev.target.closest('[data-at]');if(!b)return;var action=b.getAttribute('data-at');if(action==='refresh')load();if(action==='cancel'){state.preview=null;state.file=null;state.progress='';render()}if(action==='commit')commit()};
}
async function load(){
if(!owner()||!db())return;var seq=++state.seq;state.loading=true;state.error='';render();
try{var start=state.month+'-01',end=new Date(Number(state.month.slice(0,4)),Number(state.month.slice(5,7)),1).toISOString().slice(0,10);
var q=await db().from('attendance_device_scans_v1').select('cloud_id,device_person_id,employee_name,scan_date,scan_time,scan_type,conversion_mode').eq('brand_id',context().brandId).gte('scan_date',start).lt('scan_date',end).order('scan_date',{ascending:false}).order('scan_time',{ascending:false}).limit(3000);
if(q.error)throw q.error;if(seq!==state.seq)return;state.rows=q.data||[];state.loaded=true;
}catch(e){if(seq===state.seq)state.error='Gagal memuat Attendance: '+(e.message||String(e))}
finally{if(seq===state.seq){state.loading=false;render()}}
}
async function ensureXlsx(){if(window.XLSX)return;if(!window.__HASNARIA_XLSX_READY){await new Promise(function(resolve,reject){var x=document.createElement('script');x.src='/xlsx-preload.js?v=1';x.onload=resolve;x.onerror=function(){reject(Error('Pembaca XLSX tidak tersedia'))};document.head.appendChild(x)})}if(window.__HASNARIA_XLSX_READY)await window.__HASNARIA_XLSX_READY;if(!window.XLSX)throw Error('Gagal memuat Excel parser')}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s}
function parseDate(x){if(typeof x==='number'&&window.XLSX&&XLSX.SSF){var d=XLSX.SSF.parse_date_code(x);if(d)return d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0')}return String(x||'').trim().slice(0,10)}
function parseTime(x){if(typeof x==='number'){var mins=Math.round((x-Math.floor(x))*1440)%1440;return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0')+':00'}var s=String(x||'').trim();return /^\d{2}:\d{2}$/.test(s)?s+':00':s}
function parse(wb){
var a=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''});
if(!a.length)throw Error('File kosong');
var required=['Cloud ID','ID','Nama','Tanggal Absensi','Jam Absensi','Verifikasi','Tipe Absensi','Jabatan','Kantor'];
var head=(a[0]||[]).map(function(x){return String(x).trim()});required.forEach(function(k){if(head.indexOf(k)<0)throw Error('Kolom tidak ada: '+k)});
var ix=function(n){return head.indexOf(n)},seen={},rows=[],people={},days={},warnings=[];
for(var i=1;i<a.length;i++){var r=a[i];if(!r||r.every(function(x){return String(x||'').trim()===''}))continue;
var date=parseDate(r[ix('Tanggal Absensi')]),time=parseTime(r[ix('Jam Absensi')]),id=String(r[ix('ID')]||'').trim(),cloud=String(r[ix('Cloud ID')]||'').trim(),name=String(r[ix('Nama')]||'').trim(),type=String(r[ix('Tipe Absensi')]||'').trim();
if(!cloud||!id||!name||!validDate(date)||!/^\d{2}:\d{2}:\d{2}$/.test(time)||time.slice(0,2)>'23'||time.slice(3,5)>'59'||time.slice(6,8)>'59')throw Error('Baris '+(i+1)+' tidak valid (ID, tanggal, waktu, nama)');
var k=[cloud,id,date,time,type].join('|');if(seen[k]){warnings.push('Scan duplikat dilewati');continue}seen[k]=1;
if(type!=='Absensi Masuk')warnings.push('Ada tipe scan selain Absensi Masuk, cek sebelum menentukan jam pulang');
people[cloud+'|'+id]=1;days[date]=1;
rows.push({cloud_id:cloud.slice(0,64),device_person_id:id.slice(0,64),employee_name:name.slice(0,160),scan_date:date,scan_time:time,verification:String(r[ix('Verifikasi')]||'').trim().slice(0,80),scan_type:type.slice(0,80),job_title:String(r[ix('Jabatan')]||'').trim().slice(0,80),office:String(r[ix('Kantor')]||'').trim().slice(0,80)});
}
if(!rows.length||rows.length>3000)throw Error('Jumlah scan harus 1–3000.');
rows.sort(function(a,b){return a.scan_date.localeCompare(b.scan_date)});
return {rows:rows,people:Object.keys(people).length,days:Object.keys(days).length,min:rows[0].scan_date,max:rows[rows.length-1].scan_date,warnings:Array.from(new Set(warnings))};
}
async function choose(file){
if(!file)return;state.file=null;state.preview=null;state.error='';state.notice='';
if(!/\.xlsx?$/.test(file.name.toLowerCase())||file.size>8*1024*1024){state.error='Pilih file Excel XLS/XLSX maksimal 8 MB.';render();return}
state.busy=true;state.progress='Membaca file…';render();
try{await ensureXlsx();var workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});state.preview=parse(workbook);state.file=file;state.conversionMode='first_last';state.month=state.preview.max.slice(0,7)}
catch(e){state.error=e.message||String(e)}
finally{state.busy=false;state.progress='';render()}
}
function unsafePreview(){var host=location.hostname||'';return String(window.HASNARIA_SB||'').includes('bnnhmtkpdjlgehsvgoda')&&host!=='hasnaria-business-analyzer.vercel.app'&&host!=='hasnaria-business-analyzer-ekariashoesanti-9951s-projects.vercel.app'}
async function commit(){
if(!owner()||!state.preview||!state.file||state.busy)return;
if(unsafePreview()){state.error='Preview yang memakai database produksi diblokir. Gunakan domain produksi atau staging terisolasi.';render();return}
var rows=state.preview.rows;
if(!window.confirm('Impor '+rows.length+' scan Attendance dengan mode '+(state.conversionMode==='first_last'?'konversi masuk/keluar otomatis':'log mentah')+'? Scan identik akan dilewati; tabel absensi utama tidak berubah.'))return;
state.busy=true;state.error='';state.notice='';render();
try{var batch=100,done=0;
for(var i=0;i<rows.length;i+=batch){
var a=rows.slice(i,i+batch).map(function(r){return Object.assign({brand_id:context().brandId,source_file:state.file.name.slice(0,255),conversion_mode:state.conversionMode},r)});
var q=await db().from('attendance_device_scans_v1').upsert(a,{onConflict:'brand_id,cloud_id,device_person_id,scan_date,scan_time,scan_type',ignoreDuplicates:true});
if(q.error)throw q.error;done+=a.length;state.progress='Memproses '+done+'/'+rows.length+' scan…';render();
}
state.notice='Impor selesai. '+done+' scan telah diproses; scan identik tidak digandakan.';
state.file=null;state.preview=null;state.progress='';await load();
}catch(e){state.error='Impor terhenti: '+(e.message||String(e))+'; batch sukses tetap aman, upload ulang file yang sama untuk melanjutkan.'}
finally{state.busy=false;render()}
}
function mount(){if(!h()||!owner())return;render();if(!state.loaded&&!state.loading)load()}
window.__HASNARIA_ATTENDANCE_MOUNT=mount;
})();