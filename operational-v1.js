/* Hasnaria Operational Workbench P1
 * Lightweight workflow: run headers first, 25 detail rows per server page, member list on create only.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_OPERATIONS_V1)return;
  window.__HASNARIA_OPERATIONS_V1=true;

  var PAGE_SIZE=25;
  var state={
    runs:[],loading:false,error:'',loaded:false,
    activeRun:null,items:[],itemPage:1,itemTotal:0,itemLoading:false,itemError:'',
    createOpen:false,members:[],membersLoading:false,membersLoaded:false,membersError:'',
    busy:false,notice:'',actionError:''
  };

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function db(){return window.__HASNARIA_DB||null}
  function host(){return document.getElementById('operasional')}
  function active(){var h=host();return!!(h&&!h.classList.contains('hidden'))}
  function context(){return window.__HASNARIA_CONTEXT||{}}
  function isOwner(){return context().role==='owner'}
  function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function fmtDate(v){if(!v)return'—';var p=String(v).slice(0,10).split('-');return p.length===3?Number(p[2])+'/'+Number(p[1])+'/'+p[0]:v}
  function statusLabel(s){return{draft:'Draft',in_progress:'Dikerjakan',submitted:'Menunggu Review',approved:'Disetujui',rejected:'Perlu Koreksi',closed:'Ditutup'}[s]||s||'—'}
  function typeLabel(t){return{stock_opname:'Stock Opname',opening:'Opening',closing:'Closing',hygiene:'Hygiene',equipment:'Peralatan',custom:'Operasional'}[t]||t||'Operasional'}
  function editable(r){return!!(r&&['draft','in_progress','rejected'].indexOf(r.status)>=0)}
  function reviewable(r){return!!(r&&r.status==='submitted'&&isOwner())}
  function css(){if(document.getElementById('operational-v1-css'))return;var l=document.createElement('link');l.id='operational-v1-css';l.rel='stylesheet';l.href='/operational-v1.css?v=2';document.head.appendChild(l)}
  function memberName(m){return m.full_name||m.display_name||m.email||m.id}
  function clearAction(){state.notice='';state.actionError=''}

  function counts(){var x={open:0,review:0,done:0};state.runs.forEach(function(r){if(r.status==='submitted')x.review++;else if(r.status==='approved'||r.status==='closed')x.done++;else x.open++});return x}

  function renderRunList(){
    if(!state.runs.length)return '<div class="op1-empty"><b>Belum ada pekerjaan operasional.</b><span>Buat Stock Opname hanya saat diperlukan. Daftar detail tidak dimuat sebelum pekerjaan dibuka.</span></div>';
    return '<div class="op1-list">'+state.runs.map(function(r){return '<button type="button" class="op1-run '+(state.activeRun&&state.activeRun.id===r.id?'on':'')+'" data-op-run="'+esc(r.id)+'"><div><span>'+esc(typeLabel(r.run_type))+'</span><strong>'+esc(r.title)+'</strong><small>'+fmtDate(r.scheduled_date)+' · '+esc(statusLabel(r.status))+'</small></div><i>›</i></button>'}).join('')+'</div>';
  }

  function renderCreate(){
    if(!state.createOpen)return'';
    var opts=state.members.map(function(m){return '<option value="'+esc(m.id)+'"'+(m.id===context().userId?' selected':'')+'>'+esc(memberName(m))+' · '+esc(m.role)+'</option>'}).join('');
    var body=state.membersLoading?'<div class="op1-loading">Memuat pegawai aktif…</div>':(state.membersError?'<div class="op1-alert">'+esc(state.membersError)+'</div>':'<div class="op1-create-grid"><label><span>Judul</span><input id="opCreateTitle" value="Stock Opname"></label><label><span>Tanggal</span><input id="opCreateDate" type="date" value="'+today()+'"></label><label class="wide"><span>Pelaksana</span><select id="opCreateAssignee">'+opts+'</select></label></div>');
    return '<div class="op1-create"><div class="op1-create-head"><div><strong>Buat Stock Opname</strong><span>Master item baru dibuat di server setelah konfirmasi.</span></div><button type="button" data-op-action="close-create">×</button></div>'+body+(state.membersLoaded&&!state.membersError?'<div class="op1-create-actions"><button type="button" data-op-action="confirm-create" class="primary" '+(state.busy?'disabled':'')+'>'+(state.busy?'Membuat…':'Buat Pekerjaan')+'</button></div>':'')+'</div>';
  }

  function displayValue(i){
    if(i.item_type==='stock_count')return i.numeric_value==null?'<span class="op1-pending">Belum dihitung</span>':'<strong>'+esc(i.numeric_value)+'</strong>';
    if(i.item_type==='check')return i.bool_value==null?'<span class="op1-pending">Belum diisi</span>':(i.bool_value?'Ya':'Tidak');
    if(i.item_type==='number')return i.numeric_value==null?'<span class="op1-pending">Belum diisi</span>':esc(i.numeric_value);
    return i.text_value?esc(i.text_value):'<span class="op1-pending">Belum diisi</span>';
  }

  function editValue(i){
    if(i.item_type==='stock_count'||i.item_type==='number')return '<input class="op1-count" data-op-value="'+esc(i.id)+'" type="number" min="0" step="any" value="'+(i.numeric_value==null?'':esc(i.numeric_value))+'" placeholder="0">';
    if(i.item_type==='check')return '<select data-op-bool="'+esc(i.id)+'"><option value="">Pilih</option><option value="true"'+(i.bool_value===true?' selected':'')+'>Ya</option><option value="false"'+(i.bool_value===false?' selected':'')+'>Tidak</option></select>';
    return '<input data-op-text="'+esc(i.id)+'" value="'+esc(i.text_value||'')+'">';
  }

  function renderReviewActions(r){
    if(!reviewable(r))return'';
    return '<div class="op1-review"><label><span>Catatan review</span><textarea id="opReviewNotes" rows="2" placeholder="Opsional untuk approve, wajib untuk reject"></textarea></label><div><button type="button" data-op-action="reject" class="danger" '+(state.busy?'disabled':'')+'>Kembalikan</button><button type="button" data-op-action="approve" class="primary" '+(state.busy?'disabled':'')+'>'+(state.busy?'Memproses…':'Approve & Posting Stok')+'</button></div></div>';
  }

  function renderDetails(){
    if(!state.activeRun)return '<div class="op1-detail op1-detail-empty"><b>Pilih pekerjaan</b><span>Detail dimuat 25 item per halaman langsung dari server.</span></div>';
    var r=state.activeRun;
    if(state.itemLoading)return '<div class="op1-detail"><div class="op1-detail-head"><div><span>'+esc(typeLabel(r.run_type))+'</span><h3>'+esc(r.title)+'</h3></div></div><div class="op1-loading">Memuat 25 item…</div></div>';
    if(state.itemError)return '<div class="op1-detail"><div class="op1-alert">'+esc(state.itemError)+'</div></div>';
    var canEdit=editable(r),pages=Math.max(1,Math.ceil(state.itemTotal/PAGE_SIZE));
    var rows=state.items.map(function(i){
      var val=canEdit?editValue(i):displayValue(i);
      var note=canEdit?'<input class="op1-note" data-op-note="'+esc(i.id)+'" value="'+esc(i.notes||'')+'" placeholder="Catatan bila perlu">':esc(i.notes||'—');
      var action=canEdit?'<button type="button" class="op1-save" data-op-save="'+esc(i.id)+'" '+(state.busy?'disabled':'')+'>Simpan</button>':'';
      return '<tr><td><strong>'+esc(i.label)+'</strong><small>'+esc(i.item_type==='stock_count'?'Hitung fisik':'Checklist')+'</small></td><td class="num">'+(i.expected_qty==null?'—':esc(i.expected_qty))+'</td><td>'+val+'</td><td>'+note+'</td><td>'+action+'</td></tr>';
    }).join('');
    var pager=pages>1?'<div class="op1-pager"><button type="button" data-op-page="'+Math.max(1,state.itemPage-1)+'" '+(state.itemPage<=1?'disabled':'')+'>←</button><span>Halaman '+state.itemPage+' / '+pages+' · '+state.itemTotal+' item</span><button type="button" data-op-page="'+Math.min(pages,state.itemPage+1)+'" '+(state.itemPage>=pages?'disabled':'')+'>→</button></div>':'';
    var submit=canEdit?'<button type="button" class="op1-submit" data-op-action="submit" '+(state.busy?'disabled':'')+'>Kirim untuk Review</button>':'';
    var rejected=r.status==='rejected'&&r.review_notes?'<div class="op1-rejected"><b>Catatan koreksi:</b> '+esc(r.review_notes)+'</div>':'';
    return '<div class="op1-detail"><div class="op1-detail-head"><div><span>'+esc(typeLabel(r.run_type))+'</span><h3>'+esc(r.title)+'</h3><small>'+fmtDate(r.scheduled_date)+' · '+esc(statusLabel(r.status))+'</small></div><div class="op1-detail-actions"><div class="op1-badge">'+state.itemTotal+' item</div>'+submit+'</div></div>'+rejected+renderReviewActions(r)+'<div class="op1-table-wrap"><table><thead><tr><th>Item</th><th>System Snapshot</th><th>Hitung Fisik</th><th>Catatan</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+pager+'</div>';
  }

  function render(){
    var h=host();if(!h)return;css();var c=counts();
    h.innerHTML='<div class="op1-shell" data-operational-v1="1"><div class="op1-head"><div><div class="op1-eyebrow">OPERASIONAL</div><h2>Pelaksanaan & Kontrol Harian</h2><p>Daftar pekerjaan ringan; anggota tim dan detail opname hanya dimuat saat dibutuhkan.</p></div><div class="op1-head-actions">'+(isOwner()?'<button type="button" class="op1-new" data-op-action="new-opname">+ Stock Opname</button>':'')+'<button type="button" class="op1-refresh" data-op-action="refresh">↻ Refresh</button></div></div>'+
      '<div class="op1-kpis"><div><span>Aktif</span><strong>'+c.open+'</strong></div><div><span>Menunggu Review</span><strong>'+c.review+'</strong></div><div><span>Selesai</span><strong>'+c.done+'</strong></div></div>'+
      (state.notice?'<div class="op1-notice">'+esc(state.notice)+'</div>':'')+(state.actionError?'<div class="op1-alert">'+esc(state.actionError)+'</div>':'')+(state.error?'<div class="op1-alert">'+esc(state.error)+'</div>':'')+(state.loading&&!state.loaded?'<div class="op1-loading">Memuat daftar pekerjaan…</div>':'')+
      renderCreate()+'<div class="op1-grid"><section><div class="op1-section-title"><strong>Pekerjaan terbaru</strong><span>Maks. 30 run</span></div>'+renderRunList()+'</section>'+renderDetails()+'</div>'+
      '<div class="op1-foot"><span>Loading policy</span><b>30 run header → 25 item/page → pegawai hanya saat create.</b></div></div>';
    bind(h);
  }

  async function loadRuns(keepId){
    if(state.loading)return;var d=db();if(!d){state.error='Sesi database belum siap.';render();return}
    state.loading=true;state.error='';if(!state.loaded)render();
    try{
      var q=await d.from('operational_runs').select('id,run_type,title,scheduled_date,status,priority,assigned_to,review_notes,submitted_at,reviewed_at,updated_at').order('scheduled_date',{ascending:false}).order('updated_at',{ascending:false}).limit(30);
      if(q.error)throw q.error;state.runs=q.data||[];state.loaded=true;
      var id=keepId||(state.activeRun&&state.activeRun.id),same=id&&state.runs.find(function(x){return x.id===id});
      if(same)state.activeRun=same;else if(id){state.activeRun=null;state.items=[];state.itemTotal=0}
    }catch(e){state.error=e&&e.message?e.message:String(e)}finally{state.loading=false;render()}
  }

  async function loadMembers(){
    if(state.membersLoading||state.membersLoaded)return;state.membersLoading=true;state.membersError='';render();
    try{
      var q=await db().from('user_profiles').select('id,full_name,display_name,email,role').eq('status','active').in('role',['owner','head_store','pic','pelaksana']).order('full_name',{ascending:true,nullsFirst:false}).limit(100);
      if(q.error)throw q.error;state.members=q.data||[];state.membersLoaded=true;
    }catch(e){state.membersError=e&&e.message?e.message:String(e)}finally{state.membersLoading=false;render()}
  }

  async function loadItemPage(runId,page){
    if(!runId||state.itemLoading)return;state.itemLoading=true;state.itemError='';state.itemPage=page||1;render();
    try{
      var from=(state.itemPage-1)*PAGE_SIZE,to=from+PAGE_SIZE-1;
      var q=await db().from('operational_run_items').select('id,item_order,label,item_type,required,inventory_item_id,expected_qty,bool_value,numeric_value,text_value,notes,completed_at',{count:'exact'}).eq('run_id',runId).order('item_order',{ascending:true}).range(from,to);
      if(q.error)throw q.error;state.items=q.data||[];state.itemTotal=q.count||0;
    }catch(e){state.itemError=e&&e.message?e.message:String(e)}finally{state.itemLoading=false;render()}
  }

  async function openRun(id){
    var r=state.runs.find(function(x){return x.id===id});if(!r)return;clearAction();state.activeRun=r;state.items=[];state.itemTotal=0;state.itemPage=1;render();await loadItemPage(id,1);
  }

  async function createRun(){
    var title=document.getElementById('opCreateTitle'),date=document.getElementById('opCreateDate'),assignee=document.getElementById('opCreateAssignee');
    if(!title||!date||!assignee||!assignee.value){state.actionError='Judul, tanggal, dan pelaksana wajib diisi.';render();return}
    state.busy=true;clearAction();render();
    try{
      var q=await db().rpc('create_stock_opname_run',{p_assigned_to:assignee.value,p_scheduled_date:date.value,p_title:title.value.trim()||'Stock Opname'});
      if(q.error)throw q.error;var id=q.data;state.createOpen=false;state.notice='Stock Opname berhasil dibuat. Isi hitungan fisik per item, lalu kirim untuk review.';await loadRuns(id);if(id)await openRun(id);
    }catch(e){state.actionError=e&&e.message?e.message:String(e)}finally{state.busy=false;render()}
  }

  function itemById(id){return state.items.find(function(x){return x.id===id})}
  async function saveItem(id,button){
    var item=itemById(id);if(!item||!editable(state.activeRun)||state.busy)return;
    var valueEl=host().querySelector('[data-op-value="'+id+'"]'),boolEl=host().querySelector('[data-op-bool="'+id+'"]'),textEl=host().querySelector('[data-op-text="'+id+'"]'),noteEl=host().querySelector('[data-op-note="'+id+'"]');
    var numeric=null,boolVal=null,textVal=null;
    if(item.item_type==='stock_count'||item.item_type==='number'){
      if(!valueEl||valueEl.value===''){state.actionError='Isi nilai sebelum menyimpan.';render();return}
      numeric=Number(valueEl.value);if(!Number.isFinite(numeric)||numeric<0){state.actionError='Nilai harus angka 0 atau lebih.';render();return}
    }else if(item.item_type==='check'){
      if(!boolEl||!boolEl.value){state.actionError='Pilih nilai checklist.';render();return}boolVal=boolEl.value==='true';
    }else{textVal=textEl?textEl.value.trim():''}
    if(button){button.disabled=true;button.textContent='Menyimpan…'}
    state.actionError='';
    try{
      var q=await db().rpc('set_operational_run_item',{p_item_id:id,p_bool_value:boolVal,p_numeric_value:numeric,p_text_value:textVal||null,p_notes:noteEl&&noteEl.value.trim()?noteEl.value.trim():null});
      if(q.error)throw q.error;var row=Array.isArray(q.data)?q.data[0]:q.data;if(row)Object.assign(item,row);if(state.activeRun.status==='draft'||state.activeRun.status==='rejected')state.activeRun.status='in_progress';
      if(button){button.textContent='Tersimpan';button.classList.add('saved');setTimeout(function(){if(button&&button.isConnected){button.textContent='Simpan';button.classList.remove('saved');button.disabled=false}},900)}
    }catch(e){state.actionError=e&&e.message?e.message:String(e);if(button){button.disabled=false;button.textContent='Simpan'}render()}
  }

  async function submitRun(){
    if(!state.activeRun||!editable(state.activeRun)||state.busy)return;
    if(!window.confirm('Kirim Stock Opname ini untuk review? Setelah dikirim, hitungan tidak bisa diedit sampai dikembalikan reviewer.'))return;
    state.busy=true;clearAction();render();var id=state.activeRun.id;
    try{var q=await db().rpc('submit_operational_run',{p_run_id:id});if(q.error)throw q.error;state.notice='Stock Opname dikirim untuk review.';await loadRuns(id);await loadItemPage(id,state.itemPage)}catch(e){state.actionError=e&&e.message?e.message:String(e)}finally{state.busy=false;render()}
  }

  function reviewNotes(){var el=document.getElementById('opReviewNotes');return el?el.value.trim():''}
  async function approveRun(){
    if(!reviewable(state.activeRun)||state.busy)return;
    if(!window.confirm('Approve Stock Opname dan posting hasil hitung ke saldo stok? Proses ini akan membuat checkpoint opname final untuk seluruh item.'))return;
    var id=state.activeRun.id,notes=reviewNotes();state.busy=true;clearAction();render();
    try{var q=await db().rpc('approve_stock_opname_run',{p_run_id:id,p_review_notes:notes||null});if(q.error)throw q.error;state.notice='Stock Opname disetujui dan checkpoint stok berhasil diposting.';await loadRuns(id);await loadItemPage(id,state.itemPage)}catch(e){state.actionError=e&&e.message?e.message:String(e)}finally{state.busy=false;render()}
  }

  async function rejectRun(){
    if(!reviewable(state.activeRun)||state.busy)return;var notes=reviewNotes();if(!notes){state.actionError='Catatan koreksi wajib diisi sebelum mengembalikan pekerjaan.';render();return}
    if(!window.confirm('Kembalikan Stock Opname ini untuk dikoreksi?'))return;
    var id=state.activeRun.id;state.busy=true;clearAction();render();
    try{var q=await db().rpc('reject_operational_run',{p_run_id:id,p_review_notes:notes});if(q.error)throw q.error;state.notice='Stock Opname dikembalikan untuk koreksi.';await loadRuns(id);await loadItemPage(id,state.itemPage)}catch(e){state.actionError=e&&e.message?e.message:String(e)}finally{state.busy=false;render()}
  }

  function bind(h){
    h.onclick=function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var action=b.getAttribute('data-op-action');
      if(action==='refresh'){clearAction();loadRuns();return}
      if(action==='new-opname'){state.createOpen=true;clearAction();render();loadMembers();return}
      if(action==='close-create'){state.createOpen=false;clearAction();render();return}
      if(action==='confirm-create'){createRun();return}
      if(action==='submit'){submitRun();return}
      if(action==='approve'){approveRun();return}
      if(action==='reject'){rejectRun();return}
      var id=b.getAttribute('data-op-run');if(id){openRun(id);return}
      var save=b.getAttribute('data-op-save');if(save){saveItem(save,b);return}
      var p=b.getAttribute('data-op-page');if(p&&state.activeRun){loadItemPage(state.activeRun.id,Number(p)||1)}
    };
  }

  function mount(opts){if(!active())return;css();render();if(!state.loaded&&!state.loading)loadRuns();else if(opts&&opts.force&&!state.loading)loadRuns(state.activeRun&&state.activeRun.id)}
  window.__HASNARIA_OPERATIONS_V1_MOUNT=mount;
  css();
  setTimeout(function(){if(active())mount({force:false})},0);
})();
