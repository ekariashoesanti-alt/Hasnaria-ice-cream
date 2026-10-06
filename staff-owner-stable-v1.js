(function(){
'use strict';
if(!window.matchMedia||!window.matchMedia('(max-width:760px)').matches)return;
if(window.__HASNARIA_OWNER_STABLE_V1)return;
window.__HASNARIA_OWNER_STABLE_V1=true;

var SB_URL='https://bnnhmtkpdjlgehsvgoda.supabase.co';
var SB_KEY='sb_publishable_eXrgSxWTXoa9q-hVpLx-sQ_IaEiUbeO';
var AUTH_KEY='hasnaria-auth-v2';
var MAP_URL='https://maps.app.goo.gl/WzUKVnPrLrLG9CbQ8';
var ADDRESS='Jl. Kates No.71, Utara, MAN1, Kec. Boyolali, Kabupaten Boyolali, Jawa Tengah 57311';
var db=null,active=false,loading=false,mutating=false,syncPromise=null,generation=0,loadSequence=0,dataLoaded=false;
var state={tab:'home',rows:[],approvals:[],loc:null,supervisor:null,edit:null,user:null};

function q(s,r){return (r||document).querySelector(s)}
function root(){return document.getElementById('staffRoot')}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]})}
function coords(v){return typeof v==='number'&&isFinite(v)?v.toFixed(6):'—'}
function snapshotDate(){try{return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric'}).format(new Date())}catch(_){return new Date().toISOString().slice(0,10)}}
function client(){if(db)return db;if(!window.supabase||!window.supabase.createClient)throw new Error('Layanan login belum siap. Muat ulang halaman.');db=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:AUTH_KEY}});return db}
async function rpc(name,args){var r=await client().rpc(name,args||{});if(r.error)throw r.error;return r.data||[]}
function legacyOwnerVisible(){var r=root();return!!(r&&r.querySelector('.owner-mobile-nav'))}
function shell(){return document.getElementById('hsoShell')}
function content(){return document.getElementById('hsoContent')}
function editor(){return document.getElementById('hsoEditor')}
function messageBox(){return document.getElementById('hsoMessage')}
function setMessage(text,error){var m=messageBox();if(!m)return;m.textContent=text||'';m.className='hso-message'+(text?' show':'')+(error?' error':'')}
function icon(k){return({home:'⌂',users:'◎',approvals:'✓',location:'⌖',profile:'○'})[k]||'•'}
function navButton(tab,label){return '<button type="button" data-hso-nav="'+tab+'" class="'+(state.tab===tab?'on':'')+'"><span>'+icon(tab)+'</span><b>'+label+'</b></button>'}
function stableMarkup(){return ''+
'<div id="hsoShell" class="hso-shell">'+
  '<header class="hso-top">'+
    '<div class="hso-brand"><img src="/hasnaria-logo.svg" alt="Hasnaria"><div class="hso-brand-copy"><b>Hasnaria Owner</b><span>Mobile Workspace</span></div></div>'+
    '<button type="button" class="hso-top-action" data-hso-action="logout">Keluar</button>'+
  '</header>'+
  '<main class="hso-main"><div id="hsoMessage" class="hso-message"></div><div id="hsoContent"><div class="hso-empty">Memuat data Owner…</div></div></main>'+
  '<section id="hsoEditor" class="hso-editor" hidden></section>'+
  '<nav id="hsoNav" class="hso-nav" aria-label="Navigasi Owner">'+
    navButton('home','Beranda')+navButton('users','Akun Staff')+navButton('approvals','Persetujuan')+navButton('location','Lokasi')+navButton('profile','Profil')+
  '</nav>'+
'</div>'}
function syncNav(){var n=document.getElementById('hsoNav');if(!n)return;Array.prototype.forEach.call(n.querySelectorAll('[data-hso-nav]'),function(b){b.classList.toggle('on',b.getAttribute('data-hso-nav')===state.tab)})}

function homeHtml(){var activeCount=state.rows.filter(function(x){return x.staff_active}).length,pinCount=state.rows.filter(function(x){return x.pin_set}).length,pending=state.approvals.length,loc=state.loc&&state.loc.configured;return ''+
'<div class="hso-page-head"><div><h1>Beranda</h1><p>Ringkasan operasional staff Hasnaria.</p></div></div>'+
'<div class="hso-summary">'+
  '<button type="button" data-hso-nav="users"><strong>'+activeCount+'</strong><b>Staff aktif</b><small>'+pinCount+' sudah punya PIN</small></button>'+
  '<button type="button" data-hso-nav="approvals"><strong>'+pending+'</strong><b>Persetujuan</b><small>Koreksi pending</small></button>'+
  '<button type="button" data-hso-nav="location"><strong>'+(loc?'50 m':'—')+'</strong><b>Geofence</b><small>'+(loc?'Aktif':'Belum diset')+'</small></button>'+
'</div>'+
'<div class="hso-card"><h2>Tindakan cepat</h2><p>Kelola akun staff tanpa merender ulang header dan bottom navigation.</p><div class="hso-actions" style="margin-top:13px"><button type="button" class="hso-secondary" data-hso-nav="users">Akun Staff</button><button type="button" class="hso-primary" data-hso-nav="approvals">Persetujuan</button></div></div>'}
function supervisorHtml(){var s=state.supervisor||{},eligible=state.rows.filter(function(x){return x.staff_active&&x.pin_set});var opts='<option value="">Pilih staff aktif</option>'+eligible.map(function(x){return '<option value="'+esc(x.employee_id)+'" '+(s.employee_id===x.employee_id?'selected':'')+'>'+esc(x.full_name)+'</option>'}).join('');return ''+
'<div class="hso-card">'+
  '<h2>Supervisor Operasional</h2><p>Satu Supervisor aktif untuk validasi harian. Supervisor tidak dapat menyetujui entry miliknya sendiri.</p>'+
  (s.employee_id?'<div class="hso-supervisor-current"><span>Supervisor saat ini</span><b>'+esc(s.full_name||'')+'</b></div>':'')+
  '<div class="hso-stack" style="margin-top:12px"><label class="hso-field"><span>Pilih Supervisor</span><select id="hsoSupervisor">'+opts+'</select></label><div class="hso-actions"><button type="button" class="hso-primary" data-hso-action="save-supervisor">Tetapkan</button>'+(s.employee_id?'<button type="button" class="hso-danger" data-hso-action="clear-supervisor">Nonaktifkan</button>':'')+'</div></div>'+
'</div>'}
function usersHtml(){
  var active=state.rows.filter(function(x){return x.staff_active}).length;
  var pin=state.rows.filter(function(x){return x.pin_set}).length;
  var assigned=state.rows.filter(function(x){return Array.isArray(x.modules)&&x.modules.length}).length;
  return '<div class="hso-page-head"><div><span class="hso-ui7-date">DATA PER '+esc(snapshotDate())+'</span><h1>Pegawai</h1><p>Ringkasan Staff PIN. Akun web email/password tetap dikelola terpisah.</p></div></div>'+
    '<div class="hso-ui7-summary"><div><span>Total</span><strong>'+state.rows.length+'</strong><small>pegawai</small></div><div><span>Aktif</span><strong>'+active+'</strong><small>login Staff</small></div><div><span>PIN Siap</span><strong>'+pin+'</strong><small>PIN tersedia</small></div><div><span>Ditugaskan</span><strong>'+assigned+'</strong><small>punya modul</small></div></div>'+
    '<div class="hso-card"><h2>Detail Pegawai</h2><p>Daftar, penugasan, PIN dan Supervisor dibuka hanya saat diperlukan.</p><button type="button" class="hso-primary hso-full" style="margin-top:13px" data-hso-action="staff-detail">Lihat Detail Pegawai</button></div>'
}
function usersDetailMarkup(){
  var list=state.rows.length?state.rows.map(function(x){return '<div class="hso-person"><div><b>'+esc(x.full_name)+'</b><small>'+esc((x.modules||[]).join(', ')||'Belum ditugaskan')+'</small><div class="hso-person-meta"><span class="hso-pill '+(x.staff_active?'on':'')+'">'+(x.staff_active?'Aktif':'Belum aktif')+'</span><span class="hso-pill '+(x.pin_set?'on':'')+'">'+(x.pin_set?'PIN siap':'PIN belum diset')+'</span></div></div><button type="button" data-hso-edit="'+esc(x.employee_id)+'">Atur</button></div>'}).join(''):'<div class="hso-empty">Belum ada data pegawai.</div>';
  return '<div class="hso-editor-inner"><div class="hso-editor-head"><div><span class="hso-ui7-date">DETAIL PEGAWAI</span><h1>Pegawai</h1></div><button type="button" class="hso-editor-close" data-hso-action="cancel-edit">×</button></div><div class="hso-card"><button type="button" class="hso-primary hso-full" data-hso-action="new-user">+ Tambah Pegawai</button><div class="hso-person-list" style="margin-top:10px">'+list+'</div></div>'+supervisorHtml()+'</div>'
}
function openUsersDetail(){var e=editor();if(!e)return;e.innerHTML=usersDetailMarkup();e.hidden=false;shell().classList.add('editor-open')}

function approvalsHtml(){var rows=state.approvals.length?state.approvals.map(function(x){return '<article><b>'+esc(x.employee_name)+'</b><small>'+esc(x.attendance_date)+' · '+(x.correction_type==='check_out'?'Clock Out':'Clock In')+' → '+esc(String(x.requested_time||'').slice(0,5))+'</small><p>'+esc(x.reason||'')+'</p><div class="hso-actions"><button type="button" class="hso-secondary" data-hso-reject="'+esc(x.correction_id)+'">Tolak</button><button type="button" class="hso-primary" data-hso-approve="'+esc(x.correction_id)+'">Setujui</button></div></article>'}).join(''):'<div class="hso-empty">Tidak ada koreksi pending.</div>';return '<div class="hso-page-head"><div><h1>Persetujuan</h1><p>Koreksi kehadiran manual yang menunggu Owner.</p></div></div><div class="hso-approval">'+rows+'</div>'}
function locationHtml(){var x=state.loc||{};return ''+
'<div class="hso-page-head"><div><h1>Lokasi Absensi</h1><p>Radius absensi dikunci 50 meter.</p></div></div>'+
'<div class="hso-card"><div class="hso-location"><b>'+esc(x.outlet_name||'Hasnaria Main')+'</b><span>'+esc(ADDRESS)+'</span><small>Koordinat: '+coords(x.attendance_lat)+' / '+coords(x.attendance_lng)+'</small><a href="'+MAP_URL+'" target="_blank" rel="noopener">Buka Google Maps</a></div><button type="button" class="hso-primary hso-full" data-hso-action="set-location">Gunakan Lokasi HP Ini</button></div>'}
function profileHtml(){var email=state.user&&state.user.email||'Owner Hasnaria';return '<div class="hso-page-head"><div><h1>Profil</h1><p>Akun Owner yang sedang digunakan.</p></div></div><div class="hso-card hso-profile"><div class="hso-avatar">H</div><b>Owner Hasnaria</b><small>'+esc(email)+'</small><button type="button" class="hso-danger hso-full" style="margin-top:18px" data-hso-action="logout">Keluar Owner</button></div>'}
function renderContent(){var c=content();if(!c)return;var html=state.tab==='users'?usersHtml():state.tab==='approvals'?approvalsHtml():state.tab==='location'?locationHtml():state.tab==='profile'?profileHtml():homeHtml();c.innerHTML=html;syncNav()}

function editorMarkup(){var x=state.edit||{};function ch(k){return (x.modules||[]).indexOf(k)>=0?'checked':''}return ''+
'<div class="hso-editor-inner"><div class="hso-editor-head"><h1>'+(x.employee_id?'Atur Staff':'Tambah Pegawai')+'</h1><button type="button" class="hso-editor-close" data-hso-action="cancel-edit">×</button></div>'+
'<div class="hso-card"><div class="hso-stack">'+
'<label class="hso-field"><span>Nama</span><input id="hsoName" value="'+esc(x.full_name||'')+'"></label>'+
'<label class="hso-field"><span>'+(x.pin_set?'PIN baru (opsional)':'PIN 6 digit')+'</span><input id="hsoPin" type="password" inputmode="numeric" maxlength="6"></label>'+
'<div class="hso-checks"><label class="hso-check"><input id="hsoMa" type="checkbox" '+ch('absensi')+'>Absensi</label><label class="hso-check"><input id="hsoMk" type="checkbox" '+ch('kasir')+'>Kasir</label><label class="hso-check"><input id="hsoMg" type="checkbox" '+ch('gudang')+'>Gudang</label></div>'+
'<label class="hso-active"><span>Aktifkan login</span><input id="hsoActive" type="checkbox" '+(x.staff_active?'checked':'')+'></label>'+
'<div class="hso-actions"><button type="button" class="hso-secondary" data-hso-action="cancel-edit">Batal</button><button type="button" class="hso-primary" data-hso-action="save-user">Simpan</button></div>'+
'</div></div></div>'}
function openEditor(row){state.edit=row?{employee_id:row.employee_id,full_name:row.full_name,modules:(row.modules||[]).slice(),staff_active:!!row.staff_active,pin_set:!!row.pin_set}:{employee_id:null,full_name:'',modules:['absensi'],staff_active:false,pin_set:false};var e=editor();if(!e)return;e.innerHTML=editorMarkup();e.hidden=false;shell().classList.add('editor-open')}
function closeEditor(){state.edit=null;var e=editor();if(!e)return;e.hidden=true;e.innerHTML='';var s=shell();if(s)s.classList.remove('editor-open')}

function current(token){return active&&token===generation&&!!shell()}
function dataKey(data){return JSON.stringify([data.rows,data.approvals,data.loc,data.supervisor])}
function canSync(){var sync=window.__HASNARIA_DATA_SYNC,c=content(),e=editor();return!!(active&&!loading&&!mutating&&!state.edit&&(!e||e.hidden)&&c&&sync&&sync.canRefresh(c))}
function notifyWrite(){var sync=window.__HASNARIA_DATA_SYNC;if(sync)try{sync.notify()}catch(_){}}
async function loadAll(silent){var token=generation,seq=++loadSequence,pair=await Promise.all([rpc('staff_owner_list'),rpc('staff_owner_attendance_approvals'),rpc('staff_owner_attendance_location'),rpc('staff_owner_supervisor_state_v1',{})]);if(!current(token)||seq!==loadSequence||(silent&&!canSync()))return false;var data={rows:Array.isArray(pair[0])?pair[0]:[],approvals:Array.isArray(pair[1])?pair[1]:[],loc:(Array.isArray(pair[2])?pair[2][0]:pair[2])||null,supervisor:(Array.isArray(pair[3])?pair[3][0]:pair[3])||null},changed=!dataLoaded||dataKey(data)!==dataKey(state);state.rows=data.rows;state.approvals=data.approvals;state.loc=data.loc;state.supervisor=data.supervisor;dataLoaded=true;return changed}
function silentRefresh(){if(syncPromise)return syncPromise;if(!canSync())return Promise.resolve(false);var token=generation,wasLoaded=dataLoaded;syncPromise=loadAll(true).then(function(changed){if(changed&&current(token)&&canSync()){renderContent();if(!wasLoaded)setMessage('',false)}return changed}).catch(function(){return false}).finally(function(){syncPromise=null});return syncPromise}
async function refreshSessionUser(){try{var s=await client().auth.getSession();state.user=s.data&&s.data.session?s.data.session.user:null}catch(_){state.user=null}}
async function activate(){if(active||loading)return;loading=true;var r=root();if(!r){loading=false;return}active=true;var token=++generation;r.innerHTML=stableMarkup();try{await refreshSessionUser();if(!current(token))return;await loadAll();if(!current(token))return;setMessage('',false);renderContent()}catch(e){if(!current(token))return;setMessage(e.message||String(e),true);var c=content();if(c)c.innerHTML='<div class="hso-empty">Data Owner belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.</div>'}finally{if(token===generation)loading=false}}

async function mutate(write,after,success,local){if(!active||loading||mutating)return;mutating=true;var token=++generation;try{var result=await write(token);notifyWrite();if(!current(token))return;if(!local)await loadAll();if(!current(token))return;after(result);setMessage(success,false)}catch(e){if(current(token))setMessage(e.message||String(e),true)}finally{if(token===generation)mutating=false}}

async function saveUser(){if(!state.edit||mutating||loading)return;var mods=[];if(q('#hsoMa')&&q('#hsoMa').checked)mods.push('absensi');if(q('#hsoMk')&&q('#hsoMk').checked)mods.push('kasir');if(q('#hsoMg')&&q('#hsoMg').checked)mods.push('gudang');var name=q('#hsoName')?q('#hsoName').value.trim():'',pin=q('#hsoPin')?q('#hsoPin').value.trim():'',isActive=!!(q('#hsoActive')&&q('#hsoActive').checked);if(!name||(pin&&!/^\d{6}$/.test(pin))||(isActive&&!mods.length)||(isActive&&!state.edit.pin_set&&!pin)){setMessage('Periksa nama, PIN 6 digit, penugasan, dan status aktif.',true);return}var args={p_employee_id:state.edit.employee_id||null,p_full_name:name,p_pin:pin||null,p_modules:mods,p_active:isActive};setMessage('Menyimpan perubahan staff…',false);await mutate(function(){return rpc('staff_owner_save',args)},function(){closeEditor();renderContent()},'Perubahan staff tersimpan.')}
async function decide(id,action){if(mutating||loading)return;var reason=null;if(action==='reject'){reason=prompt('Alasan penolakan koreksi:','');if(reason===null)return}setMessage('Memproses persetujuan…',false);await mutate(function(){return rpc('staff_owner_attendance_decide',{p_correction_id:id,p_action:action,p_reason:reason})},renderContent,action==='approve'?'Koreksi disetujui.':'Koreksi ditolak.')}
async function supervisorAction(clear){if(mutating||loading)return;var id=clear?(state.supervisor&&state.supervisor.employee_id):(q('#hsoSupervisor')&&q('#hsoSupervisor').value);if(!id){setMessage(clear?'Belum ada Supervisor aktif.':'Pilih staff aktif yang sudah memiliki PIN.',true);return}setMessage(clear?'Menonaktifkan Supervisor…':'Menetapkan Supervisor…',false);await mutate(function(){return rpc('staff_owner_set_supervisor_v1',{p_employee_id:id,p_active:!clear,p_note:clear?'Dinonaktifkan dari Owner Mobile':'Ditugaskan dari Owner Mobile'})},renderContent,clear?'Supervisor dinonaktifkan.':'Supervisor berhasil ditetapkan.')}
function setLocation(){if(mutating||loading)return;if(!navigator.geolocation){setMessage('GPS tidak tersedia pada perangkat ini.',true);return}setMessage('Mengambil lokasi HP…',false);mutate(function(token){return new Promise(function(resolve,reject){navigator.geolocation.getCurrentPosition(resolve,function(e){reject(new Error(e.message||'Izin lokasi ditolak.'))},{enableHighAccuracy:true,timeout:12000,maximumAge:0})}).then(function(p){if(!current(token))throw new Error('Sesi Owner sudah berakhir.');return rpc('staff_owner_set_attendance_location',{p_lat:p.coords.latitude,p_lng:p.coords.longitude})})},function(a){state.loc=(Array.isArray(a)?a[0]:a)||null;renderContent()},'Titik Warung tersimpan. Radius aktif 50 m.',true)}
async function logout(){active=false;generation++;try{await client().auth.signOut()}catch(_){}location.reload()}

function bind(){document.addEventListener('click',function(e){if(!active)return;var nav=e.target.closest('[data-hso-nav]');if(nav){e.preventDefault();state.tab=nav.getAttribute('data-hso-nav');closeEditor();setMessage('',false);renderContent();return}var edit=e.target.closest('[data-hso-edit]');if(edit){e.preventDefault();var id=edit.getAttribute('data-hso-edit'),row=state.rows.find(function(x){return x.employee_id===id});if(row)openEditor(row);return}var ap=e.target.closest('[data-hso-approve]');if(ap){e.preventDefault();decide(ap.getAttribute('data-hso-approve'),'approve');return}var rj=e.target.closest('[data-hso-reject]');if(rj){e.preventDefault();decide(rj.getAttribute('data-hso-reject'),'reject');return}var a=e.target.closest('[data-hso-action]');if(!a)return;e.preventDefault();var act=a.getAttribute('data-hso-action');if(act==='staff-detail')openUsersDetail();else if(act==='new-user')openEditor(null);else if(act==='cancel-edit')closeEditor();else if(act==='save-user')saveUser();else if(act==='set-location')setLocation();else if(act==='save-supervisor')supervisorAction(false);else if(act==='clear-supervisor')supervisorAction(true);else if(act==='logout')logout()},true)}

window.__HASNARIA_OWNER_STABLE_REFRESH=silentRefresh;
function boot(){bind();var r=root();if(!r)return;var sync=window.__HASNARIA_DATA_SYNC;if(sync)sync.register('owner-mobile',silentRefresh);var obs=new MutationObserver(function(){if(!active&&legacyOwnerVisible())activate()});obs.observe(r,{childList:true,subtree:true});if(legacyOwnerVisible())activate()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
