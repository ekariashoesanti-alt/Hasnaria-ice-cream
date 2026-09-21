/* Hasnaria Operational Workbench P0
 * Read-first, lightweight runtime. Run headers load first; item details load only on demand.
 */
(function(){
  'use strict';
  if(window.__HASNARIA_OPERATIONS_V1)return;
  window.__HASNARIA_OPERATIONS_V1=true;

  var PAGE_SIZE=25;
  var state={runs:[],loading:false,error:'',activeRun:null,items:[],itemPage:1,itemLoading:false,itemError:'',loaded:false};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function db(){return window.__HASNARIA_DB||null}
  function host(){return document.getElementById('operasional')}
  function active(){var h=host();return!!(h&&!h.classList.contains('hidden'))}
  function context(){return window.__HASNARIA_CONTEXT||{}}
  function fmtDate(v){if(!v)return'—';var p=String(v).slice(0,10).split('-');return p.length===3?Number(p[2])+'/'+Number(p[1])+'/'+p[0]:v}
  function statusLabel(s){return{draft:'Draft',in_progress:'Dikerjakan',submitted:'Menunggu Review',approved:'Disetujui',rejected:'Ditolak',closed:'Ditutup'}[s]||s||'—'}
  function typeLabel(t){return{stock_opname:'Stock Opname',opening:'Opening',closing:'Closing',hygiene:'Hygiene',equipment:'Peralatan',custom:'Operasional'}[t]||t||'Operasional'}
  function css(){if(document.getElementById('operational-v1-css'))return;var l=document.createElement('link');l.id='operational-v1-css';l.rel='stylesheet';l.href='/operational-v1.css?v=1';document.head.appendChild(l)}

  function counts(){var x={open:0,review:0,done:0};state.runs.forEach(function(r){if(r.status==='submitted')x.review++;else if(r.status==='approved'||r.status==='closed')x.done++;else x.open++});return x}

  function renderRunList(){
    if(!state.runs.length)return '<div class="op1-empty"><b>Belum ada pekerjaan operasional.</b><span>Fondasi workflow sudah siap. Pembuatan Stock Opname akan diaktifkan pada tahap berikutnya setelah shell ini tervalidasi.</span></div>';
    return '<div class="op1-list">'+state.runs.map(function(r){return '<button type="button" class="op1-run '+(state.activeRun&&state.activeRun.id===r.id?'on':'')+'" data-op-run="'+esc(r.id)+'"><div><span>'+esc(typeLabel(r.run_type))+'</span><strong>'+esc(r.title)+'</strong><small>'+fmtDate(r.scheduled_date)+' · '+esc(statusLabel(r.status))+'</small></div><i>›</i></button>'}).join('')+'</div>';
  }

  function valueCell(i){
    if(i.item_type==='stock_count')return i.numeric_value==null?'<span class="op1-pending">Belum dihitung</span>':'<strong>'+esc(i.numeric_value)+'</strong>';
    if(i.item_type==='check')return i.bool_value==null?'<span class="op1-pending">Belum diisi</span>':(i.bool_value?'Ya':'Tidak');
    if(i.item_type==='number')return i.numeric_value==null?'<span class="op1-pending">Belum diisi</span>':esc(i.numeric_value);
    return i.text_value?esc(i.text_value):'<span class="op1-pending">Belum diisi</span>';
  }

  function renderDetails(){
    if(!state.activeRun)return '<div class="op1-detail op1-detail-empty"><b>Pilih pekerjaan</b><span>Detail checklist/count dimuat hanya setelah dipilih agar halaman tetap ringan.</span></div>';
    var r=state.activeRun;
    if(state.itemLoading)return '<div class="op1-detail"><div class="op1-detail-head"><div><span>'+esc(typeLabel(r.run_type))+'</span><h3>'+esc(r.title)+'</h3></div></div><div class="op1-loading">Memuat detail pekerjaan…</div></div>';
    if(state.itemError)return '<div class="op1-detail"><div class="op1-alert">'+esc(state.itemError)+'</div></div>';
    var start=(state.itemPage-1)*PAGE_SIZE,end=start+PAGE_SIZE,pageRows=state.items.slice(start,end),pages=Math.max(1,Math.ceil(state.items.length/PAGE_SIZE));
    var rows=pageRows.map(function(i){return '<tr><td><strong>'+esc(i.label)+'</strong><small>'+esc(i.item_type==='stock_count'?'Hitung fisik':'Checklist')+'</small></td><td class="num">'+(i.expected_qty==null?'—':esc(i.expected_qty))+'</td><td class="num">'+valueCell(i)+'</td><td>'+esc(i.notes||'—')+'</td></tr>'}).join('');
    var pager=pages>1?'<div class="op1-pager"><button type="button" data-op-page="'+Math.max(1,state.itemPage-1)+'" '+(state.itemPage<=1?'disabled':'')+'>←</button><span>'+state.itemPage+' / '+pages+'</span><button type="button" data-op-page="'+Math.min(pages,state.itemPage+1)+'" '+(state.itemPage>=pages?'disabled':'')+'>→</button></div>':'';
    return '<div class="op1-detail"><div class="op1-detail-head"><div><span>'+esc(typeLabel(r.run_type))+'</span><h3>'+esc(r.title)+'</h3><small>'+fmtDate(r.scheduled_date)+' · '+esc(statusLabel(r.status))+'</small></div><div class="op1-badge">'+state.items.length+' item</div></div><div class="op1-table-wrap"><table><thead><tr><th>Item</th><th>System/Snapshot</th><th>Nilai</th><th>Catatan</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+pager+'</div>';
  }

  function render(){
    var h=host();if(!h)return;css();var c=counts();
    h.innerHTML='<div class="op1-shell" data-operational-v1="1"><div class="op1-head"><div><div class="op1-eyebrow">OPERASIONAL</div><h2>Pelaksanaan & Kontrol Harian</h2><p>Daftar kerja dimuat ringkas. Detail checklist dan Stock Opname hanya dimuat saat pekerjaan dibuka.</p></div><button type="button" class="op1-refresh" data-op-action="refresh">↻ Refresh</button></div>'+
      '<div class="op1-kpis"><div><span>Aktif</span><strong>'+c.open+'</strong></div><div><span>Menunggu Review</span><strong>'+c.review+'</strong></div><div><span>Selesai</span><strong>'+c.done+'</strong></div></div>'+
      (state.error?'<div class="op1-alert">'+esc(state.error)+'</div>':'')+(state.loading?'<div class="op1-loading">Memuat daftar pekerjaan…</div>':'')+
      '<div class="op1-grid"><section><div class="op1-section-title"><strong>Pekerjaan terbaru</strong><span>Maks. 30 run</span></div>'+renderRunList()+'</section>'+renderDetails()+'</div>'+
      '<div class="op1-foot"><span>Loading policy</span><b>Run list → detail on-demand → evidence/audit belakangan.</b></div></div>';
    bind(h);
  }

  async function loadRuns(){
    if(state.loading)return;var d=db();if(!d){state.error='Sesi database belum siap.';render();return}
    state.loading=true;state.error='';render();
    try{
      var q=await d.from('operational_runs').select('id,run_type,title,scheduled_date,status,priority,assigned_to,updated_at').order('scheduled_date',{ascending:false}).order('updated_at',{ascending:false}).limit(30);
      if(q.error)throw q.error;state.runs=q.data||[];state.loaded=true;
      if(state.activeRun){var same=state.runs.find(function(x){return x.id===state.activeRun.id});if(same)state.activeRun=same;else{state.activeRun=null;state.items=[]}}
    }catch(e){state.error=e&&e.message?e.message:String(e)}finally{state.loading=false;render()}
  }

  async function openRun(id){
    var r=state.runs.find(function(x){return x.id===id});if(!r)return;state.activeRun=r;state.items=[];state.itemPage=1;state.itemLoading=true;state.itemError='';render();
    try{
      var q=await db().from('operational_run_items').select('id,item_order,label,item_type,required,inventory_item_id,expected_qty,bool_value,numeric_value,text_value,notes,completed_at').eq('run_id',id).order('item_order',{ascending:true}).limit(500);
      if(q.error)throw q.error;state.items=q.data||[];
    }catch(e){state.itemError=e&&e.message?e.message:String(e)}finally{state.itemLoading=false;render()}
  }

  function bind(h){
    h.onclick=function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;
      if(b.getAttribute('data-op-action')==='refresh'){loadRuns();return}
      var id=b.getAttribute('data-op-run');if(id){openRun(id);return}
      var p=b.getAttribute('data-op-page');if(p){state.itemPage=Number(p)||1;render()}
    };
  }

  function mount(opts){if(!active())return;css();render();if(!state.loaded&&!state.loading)loadRuns();else if(opts&&opts.force&&!state.loading)loadRuns()}
  window.__HASNARIA_OPERATIONS_V1_MOUNT=mount;
  css();
  setTimeout(function(){if(active())mount({force:false})},0);
})();
