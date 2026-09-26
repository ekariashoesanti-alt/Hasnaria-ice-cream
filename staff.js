(function(){
  'use strict';

  var SB_URL='https://bnnhmtkpdjlgehsvgoda.supabase.co';
  var SB_KEY='sb_publishable_eXrgSxWTXoa9q-hVpLx-sQ_IaEiUbeO';
  var STAFF_TOKEN_KEY='hasnaria-staff-session-v1';
  var OWNER_STORAGE_KEY='hasnaria-auth-v2';
  var MODULES={
    absensi:{label:'Absensi',icon:'✓',desc:'Masuk, pulang, dan aktivitas shift'},
    kasir:{label:'Kasir',icon:'▣',desc:'Transaksi keuangan Penjualan dan Pembelian'},
    gudang:{label:'Gudang',icon:'□',desc:'Stok, penerimaan, dan opname'}
  };
  var KASIR_SUBMENU={
    penjualan:{label:'Penjualan',icon:'↑',desc:'Catat transaksi penjualan dan penerimaan pembayaran'},
    pembelian:{label:'Pembelian',icon:'↓',desc:'Catat transaksi pembelian dan pengeluaran usaha'}
  };
  var state={view:'login',directory:[],staff:null,staffToken:'',activeModule:'home',activeSubmodule:'',owner:null,ownerRows:[],edit:null,busy:false,msg:''};
  var db=null;

  function root(){return document.getElementById('staffRoot')}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function hasModule(key){return!!(state.staff&&Array.isArray(state.staff.modules)&&state.staff.modules.indexOf(key)>=0)}
  function getStoredToken(){try{return localStorage.getItem(STAFF_TOKEN_KEY)||''}catch(_){return''}}
  function setStoredToken(v){try{if(v)localStorage.setItem(STAFF_TOKEN_KEY,v);else localStorage.removeItem(STAFF_TOKEN_KEY)}catch(_){}}
  function client(){
    if(db)return db;
    if(!window.supabase)throw new Error('Layanan login belum siap. Muat ulang halaman.');
    db=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:OWNER_STORAGE_KEY}});
    return db;
  }
  function setMessage(msg){state.msg=msg||'';render()}
  function errorText(e){return e&&e.message?e.message:String(e||'Terjadi kesalahan.')}

  async function loadDirectory(){
    var r=await client().rpc('staff_login_directory');
    if(r.error)throw r.error;
    state.directory=r.data||[];
  }

  async function validateStaffSession(){
    var token=getStoredToken();
    if(!token)return false;
    var r=await client().rpc('staff_session_info',{p_token:token});
    if(r.error||!r.data||!r.data.length){setStoredToken('');return false}
    var row=r.data[0];
    state.staff={employeeId:row.employee_id,fullName:row.full_name,modules:row.modules||[],expiresAt:row.expires_at};
    state.staffToken=token;
    state.view='home';
    state.activeModule='home';
    state.activeSubmodule='';
    return true;
  }

  function topBar(actionLabel,actionId){
    return '<header class="staff-top"><div class="staff-brand"><img src="/hasnaria-logo.svg" alt="Hasnaria"><div class="staff-brand-copy"><b>Staff Portal</b><span>Hasnaria · Mobile Workspace</span></div></div>'+(actionLabel?'<button type="button" class="staff-top-action" data-action="'+esc(actionId)+'">'+esc(actionLabel)+'</button>':'')+'</header>';
  }

  function loginView(){
    var hasUsers=state.directory.length>0;
    var options='<option value="">Pilih nama pegawai</option>'+state.directory.map(function(x){return '<option value="'+esc(x.employee_id)+'">'+esc(x.full_name)+'</option>'}).join('');
    return '<div class="staff-shell">'+topBar('Owner','owner-open')+'<section class="staff-content"><div class="staff-card staff-hero"><div class="staff-eyebrow">Portal Pegawai</div><h1>Masuk kerja lebih cepat.</h1><p>Pilih nama kamu lalu masukkan PIN 6 digit yang dibuat Owner.</p>'+(hasUsers?'<label class="staff-field"><span>Nama pegawai</span><select id="staffEmployee">'+options+'</select></label><label class="staff-field"><span>PIN</span><input id="staffPin" class="staff-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="••••••"></label><button class="staff-btn primary" data-action="staff-login" type="button">Masuk</button>':'<div class="staff-empty"><div class="icon">＋</div><h2>Belum ada akun staff aktif</h2><p>Owner perlu membuat atau mengaktifkan akun pegawai dan menetapkan PIN terlebih dahulu.</p><button class="staff-btn primary" data-action="owner-open" type="button">Setup oleh Owner</button></div>')+(state.msg?'<div class="staff-msg">'+esc(state.msg)+'</div>':'')+'<div class="staff-login-owner"><button class="staff-link-btn" type="button" data-action="owner-open">Kelola akun staff sebagai Owner</button></div></div></section></div>';
  }

  function tile(key){
    var m=MODULES[key],allowed=hasModule(key);
    return '<button type="button" class="staff-tile'+(allowed?'':' locked')+'" data-module="'+key+'" '+(allowed?'':'disabled')+'><span class="tile-icon">'+m.icon+'</span><span><strong>'+m.label+'</strong><small>'+(allowed?m.desc:'Belum ditugaskan oleh Owner')+'</small></span><span class="arrow">›</span></button>';
  }

  function bottomNav(){
    var items=[['home','⌂','Home'],['absensi','✓','Absensi'],['kasir','▣','Kasir'],['gudang','□','Gudang']];
    return '<nav class="staff-nav" aria-label="Menu staff">'+items.map(function(it){var allowed=it[0]==='home'||hasModule(it[0]);return '<button type="button" data-module="'+it[0]+'" class="'+(state.activeModule===it[0]?'on':'')+'" '+(allowed?'':'disabled')+'><span class="nav-icon">'+it[1]+'</span><span>'+it[2]+'</span></button>'}).join('')+'</nav>';
  }

  function homeView(){
    if(!state.staff)return loginView();
    return '<div class="staff-shell">'+topBar('Keluar','staff-logout')+'<section class="staff-content"><div class="staff-card staff-greeting"><div class="staff-eyebrow">Selamat bekerja</div><h1>Halo, '+esc(state.staff.fullName)+'</h1><p>Pilih fungsi yang kamu butuhkan hari ini.</p><div class="staff-tiles">'+tile('absensi')+tile('kasir')+tile('gudang')+'</div></div></section>'+bottomNav()+'</div>';
  }

  function kasirMenuView(){
    var m=MODULES.kasir;
    return '<div class="staff-shell">'+topBar(state.staff?state.staff.fullName:'Staff','staff-profile')+'<section class="staff-content"><div class="staff-card"><div class="staff-module-head"><div class="big-icon">'+m.icon+'</div><div><div class="staff-eyebrow">Workspace Staff</div><h1>'+m.label+'</h1><p>'+m.desc+'</p></div></div><div class="staff-tiles">'+Object.keys(KASIR_SUBMENU).map(function(key){var x=KASIR_SUBMENU[key];return '<button type="button" class="staff-tile" data-kasir-menu="'+key+'"><span class="tile-icon">'+x.icon+'</span><span><strong>'+x.label+'</strong><small>'+x.desc+'</small></span><span class="arrow">›</span></button>';}).join('')+'</div></div></section>'+bottomNav()+'</div>';
  }

  function kasirSubView(key){
    var x=KASIR_SUBMENU[key];
    if(!x)return kasirMenuView();
    return '<div class="staff-shell">'+topBar('Kembali','kasir-back')+'<section class="staff-content"><div class="staff-card"><div class="staff-module-head"><div class="big-icon">'+x.icon+'</div><div><div class="staff-eyebrow">Kasir · Transaksi Keuangan</div><h1>'+x.label+'</h1><p>'+x.desc+'</p></div></div><div class="staff-coming">Menu '+x.label+' sudah disiapkan di bawah Kasir.<br>Transaksi akan menggunakan sesi PIN staff yang sama.</div></div></section>'+bottomNav()+'</div>';
  }

  function moduleView(key){
    var m=MODULES[key];
    if(!m||!hasModule(key))return homeView();
    if(key==='kasir')return state.activeSubmodule?kasirSubView(state.activeSubmodule):kasirMenuView();
    return '<div class="staff-shell">'+topBar(state.staff?state.staff.fullName:'Staff','staff-profile')+'<section class="staff-content"><div class="staff-card"><div class="staff-module-head"><div class="big-icon">'+m.icon+'</div><div><div class="staff-eyebrow">Workspace Staff</div><h1>'+m.label+'</h1><p>'+m.desc+'</p></div></div><div class="staff-coming">Akses '+m.label+' sudah aktif untuk akun ini.<br>Halaman kerja '+m.label+' akan menggunakan sesi PIN staff yang sama.</div></div></section>'+bottomNav()+'</div>';
  }

  function ownerLoginView(){
    return '<div class="staff-shell">'+topBar('Kembali','back-login')+'<section class="staff-content"><div class="staff-card staff-hero"><div class="staff-eyebrow">Setup Staff</div><h1>Masuk sebagai Owner</h1><p>Gunakan akun Owner Hasnaria yang sama dengan web utama. Jika Owner sudah login di browser ini, sesi tersebut akan digunakan otomatis.</p><label class="staff-field"><span>Email Owner</span><input id="ownerEmail" type="email" autocomplete="email"></label><label class="staff-field"><span>Password Owner</span><input id="ownerPassword" type="password" autocomplete="current-password"></label><button class="staff-btn primary" type="button" data-action="owner-login">Masuk sebagai Owner</button>'+(state.msg?'<div class="staff-msg">'+esc(state.msg)+'</div>':'')+'</div></section></div>';
  }

  function personRow(row){
    var modules=(row.modules||[]).map(function(x){return MODULES[x]?MODULES[x].label:x}).join(', ')||'Belum ada penugasan';
    return '<div class="owner-person"><div><b>'+esc(row.full_name)+'</b><small>'+esc(modules)+'</small><span class="status-pill '+(row.staff_active?'on':'')+'">'+(row.staff_active?'Aktif':'Belum aktif')+(row.pin_set?' · PIN siap':' · PIN belum diset')+'</span></div><button type="button" data-edit-staff="'+esc(row.employee_id)+'">Atur</button></div>';
  }

  function editForm(){
    var x=state.edit||{employee_id:null,full_name:'',modules:['absensi'],staff_active:false,pin_set:false};
    function checked(k){return (x.modules||[]).indexOf(k)>=0?' checked':''}
    return '<div class="staff-card"><h2 class="owner-form-title">'+(x.employee_id?'Atur akun staff':'Tambah pegawai')+'</h2><p class="staff-note">Nama bisa diganti kapan saja. PIN baru wajib 6 digit. Untuk pegawai yang sudah punya PIN, biarkan kolom PIN kosong jika tidak ingin menggantinya.</p><label class="staff-field"><span>Nama pegawai</span><input id="editName" value="'+esc(x.full_name||'')+'" autocomplete="off"></label><label class="staff-field"><span>'+(x.pin_set?'PIN baru (opsional)':'PIN 6 digit')+'</span><input id="editPin" class="staff-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" placeholder="••••••"></label><div class="owner-checks"><label class="owner-check"><input id="modAbsensi" type="checkbox"'+checked('absensi')+'>Absensi</label><label class="owner-check"><input id="modKasir" type="checkbox"'+checked('kasir')+'>Kasir</label><label class="owner-check"><input id="modGudang" type="checkbox"'+checked('gudang')+'>Gudang</label></div><label class="owner-active"><span>Aktifkan login staff</span><input id="editActive" type="checkbox"'+(x.staff_active?' checked':'')+'></label><div class="staff-inline"><button class="staff-btn ghost" type="button" data-action="owner-cancel-edit">Batal</button><button class="staff-btn primary" type="button" data-action="owner-save">Simpan</button></div>'+(state.msg?'<div class="staff-msg">'+esc(state.msg)+'</div>':'')+'</div>';
  }

  function ownerPanelView(){
    return '<div class="staff-shell">'+topBar('Keluar Owner','owner-logout')+'<section class="staff-content"><div class="staff-card"><div class="owner-head"><div><div class="staff-eyebrow">Owner Setup</div><h1>Akun Staff</h1><p>Buat akun, atur PIN dan penugasan.</p></div></div><button class="staff-btn primary" type="button" data-action="owner-new">+ Tambah pegawai</button><div class="owner-list">'+(state.ownerRows.length?state.ownerRows.map(personRow).join(''):'<div class="staff-note">Belum ada pegawai.</div>')+'</div></div>'+(state.edit?editForm():'')+'</section></div>';
  }

  function render(){
    var html='';
    if(state.view==='owner-login')html=ownerLoginView();
    else if(state.view==='owner')html=ownerPanelView();
    else if(state.view==='home')html=state.activeModule==='home'?homeView():moduleView(state.activeModule);
    else html=loginView();
    root().innerHTML=html;
  }

  async function staffLogin(){
    var emp=document.getElementById('staffEmployee'),pin=document.getElementById('staffPin');
    var employeeId=emp&&emp.value,pinValue=pin&&pin.value;
    if(!employeeId||!/^[0-9]{6}$/.test(pinValue||'')){setMessage('Pilih nama dan masukkan PIN 6 digit.');return}
    if(state.busy)return;state.busy=true;state.msg='';render();
    try{
      var r=await client().rpc('staff_pin_login',{p_employee_id:employeeId,p_pin:pinValue});
      if(r.error)throw r.error;
      if(!r.data||!r.data.length)throw new Error('Login staff gagal.');
      var row=r.data[0];
      state.staffToken=row.session_token;
      setStoredToken(row.session_token);
      state.staff={employeeId:row.employee_id,fullName:row.full_name,modules:row.modules||[],expiresAt:row.expires_at};
      state.view='home';state.activeModule='home';state.activeSubmodule='';state.msg='';
    }catch(e){state.view='login';state.msg=errorText(e)}finally{state.busy=false;render()}
  }

  async function staffLogout(){
    var token=state.staffToken||getStoredToken();
    try{if(token)await client().rpc('staff_logout',{p_token:token})}catch(_){}
    setStoredToken('');state.staffToken='';state.staff=null;state.activeModule='home';state.activeSubmodule='';state.view='login';state.msg='';
    try{await loadDirectory()}catch(e){state.msg=errorText(e)}
    render();
  }

  async function ownerLogin(){
    var email=document.getElementById('ownerEmail'),password=document.getElementById('ownerPassword');
    var ev=email&&email.value,pv=password&&password.value;
    if(!ev||!pv){setMessage('Email dan password Owner wajib diisi.');return}
    if(state.busy)return;state.busy=true;state.msg='';render();
    try{
      var r=await client().auth.signInWithPassword({email:ev,password:pv});
      if(r.error)throw r.error;
      state.owner=r.data&&r.data.user?r.data.user:null;
      await loadOwnerRows();
      state.view='owner';state.msg='';
    }catch(e){try{await client().auth.signOut()}catch(_){}state.owner=null;state.view='owner-login';state.msg=errorText(e)}finally{state.busy=false;render()}
  }

  async function loadOwnerRows(){
    var r=await client().rpc('staff_owner_list');
    if(r.error)throw r.error;
    state.ownerRows=r.data||[];
  }

  function openEdit(id){
    var row=state.ownerRows.find(function(x){return x.employee_id===id});
    if(!row)return;
    state.edit={employee_id:row.employee_id,full_name:row.full_name,modules:(row.modules||[]).slice(),staff_active:!!row.staff_active,pin_set:!!row.pin_set};
    state.msg='';render();
  }

  async function ownerSave(){
    var name=document.getElementById('editName'),pin=document.getElementById('editPin'),active=document.getElementById('editActive');
    var modules=[];
    if(document.getElementById('modAbsensi')&&document.getElementById('modAbsensi').checked)modules.push('absensi');
    if(document.getElementById('modKasir')&&document.getElementById('modKasir').checked)modules.push('kasir');
    if(document.getElementById('modGudang')&&document.getElementById('modGudang').checked)modules.push('gudang');
    var fullName=(name&&name.value||'').trim(),pinValue=(pin&&pin.value||'').trim(),activeValue=!!(active&&active.checked);
    if(!fullName){setMessage('Nama pegawai wajib diisi.');return}
    if(pinValue&&!/^[0-9]{6}$/.test(pinValue)){setMessage('PIN harus tepat 6 digit angka.');return}
    if(activeValue&&!modules.length){setMessage('Pilih minimal satu penugasan sebelum akun diaktifkan.');return}
    if(activeValue&&!state.edit.pin_set&&!pinValue){setMessage('Set PIN 6 digit sebelum akun diaktifkan.');return}
    if(state.busy)return;state.busy=true;state.msg='';render();
    try{
      var r=await client().rpc('staff_owner_save',{p_employee_id:state.edit.employee_id||null,p_full_name:fullName,p_pin:pinValue||null,p_modules:modules,p_active:activeValue});
      if(r.error)throw r.error;
      state.edit=null;state.msg='';
      await loadOwnerRows();
      await loadDirectory();
    }catch(e){state.msg=errorText(e)}finally{state.busy=false;render()}
  }

  async function ownerLogout(){
    try{await client().auth.signOut()}catch(_){}
    state.owner=null;state.ownerRows=[];state.edit=null;state.view='login';state.msg='';
    try{await loadDirectory()}catch(e){state.msg=errorText(e)}
    render();
  }

  async function resumeOwnerIfAny(){
    var r=await client().auth.getSession();
    var sess=r&&r.data?r.data.session:null;
    if(!sess)return false;
    try{state.owner=sess.user;await loadOwnerRows();return true}catch(_){return false}
  }

  document.addEventListener('click',function(e){
    var edit=e.target&&e.target.closest?e.target.closest('[data-edit-staff]'):null;
    if(edit){openEdit(edit.getAttribute('data-edit-staff'));return}
    var kasirMenu=e.target&&e.target.closest?e.target.closest('[data-kasir-menu]'):null;
    if(kasirMenu&&state.staff&&hasModule('kasir')){state.activeModule='kasir';state.activeSubmodule=kasirMenu.getAttribute('data-kasir-menu')||'';state.view='home';state.msg='';render();return}
    var mod=e.target&&e.target.closest?e.target.closest('[data-module]'):null;
    if(mod&&!mod.disabled&&state.staff){state.activeModule=mod.getAttribute('data-module')||'home';state.activeSubmodule='';state.view='home';state.msg='';render();return}
    var btn=e.target&&e.target.closest?e.target.closest('[data-action]'):null;
    if(!btn)return;
    var action=btn.getAttribute('data-action');
    if(action==='staff-login')staffLogin();
    else if(action==='staff-logout'||action==='staff-profile')staffLogout();
    else if(action==='kasir-back'){state.activeModule='kasir';state.activeSubmodule='';state.view='home';render()}
    else if(action==='owner-open'){state.msg='';resumeOwnerIfAny().then(function(ok){state.view=ok?'owner':'owner-login';render()})}
    else if(action==='owner-login')ownerLogin();
    else if(action==='owner-logout')ownerLogout();
    else if(action==='back-login'){state.view='login';state.msg='';render()}
    else if(action==='owner-new'){state.edit={employee_id:null,full_name:'',modules:['absensi'],staff_active:false,pin_set:false};state.msg='';render()}
    else if(action==='owner-cancel-edit'){state.edit=null;state.msg='';render()}
    else if(action==='owner-save')ownerSave();
  });

  document.addEventListener('keydown',function(e){
    if(e.key!=='Enter')return;
    if(state.view==='login'&&document.activeElement&&document.activeElement.id==='staffPin')staffLogin();
    if(state.view==='owner-login'&&document.activeElement&&document.activeElement.id==='ownerPassword')ownerLogin();
  });

  async function start(){
    render();
    try{
      client();
      await loadDirectory();
      await validateStaffSession();
    }catch(e){state.msg=errorText(e)}
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
