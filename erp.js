(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value == null ? 'Belum tersedia' : Number(value).toLocaleString('id-ID');
  const money = value => value == null ? 'Belum tersedia' : 'Rp' + Number(value).toLocaleString('id-ID', {maximumFractionDigits:0});
  const pct = value => value == null ? 'Belum tersedia' : number(value) + '%';
  const state = {key:null, page:'overview', data:null, loading:false, error:'', generation:0, month:'', query:'', priority:'', type:'', details:{}, detailError:''};
  const pages = {overview:'Ringkasan CEO', actions:'Prioritas owner', inventory:'Persediaan', costing:'HPP & resep', finance:'Arus kas', quality:'Kelengkapan data', audit:'Aktivitas ERP'};
  const views = {actions:['ui_erp_action_queue_v4','action_rank'],inventory:['ui_inventory_items','item_name'],costing:['ui_hpp_blockers','product_name'],audit:['ui_recent_erp_audit','created_at']};
  const routes = {pack_conversion:'stok',recipe_verification:'stok',missing_recipe:'stok',missing_component_cost:'stok',untracked_stock:'stok',inventory_baseline_confirmation:'stok',invalid_purchase_qty:'pembelian',unmatched_purchase:'pembelian',unverified_inventory:'pembelian',zero_amount_purchase:'pembelian',sale_item_mapping:'sales',selling_price_confirmation:'sales',financing_payment_review:'ops'};
  const names = {pack_conversion:'Konversi kemasan',recipe_verification:'Verifikasi resep',missing_recipe:'Resep belum lengkap',missing_component_cost:'Biaya bahan',untracked_stock:'Stok belum terpantau',inventory_baseline_confirmation:'Baseline historis',invalid_purchase_qty:'Kuantitas pembelian',unmatched_purchase:'Pemetaan pembelian',unverified_inventory:'Verifikasi bahan',zero_amount_purchase:'Pembelian tanpa nominal',sale_item_mapping:'Pemetaan produk',selling_price_confirmation:'Konfirmasi harga jual',financing_payment_review:'Tinjau pembiayaan'};
  const context = () => window.__HASNARIA_CONTEXT;
  const btn = (text,action) => '<button type="button" data-erp="'+esc(action)+'">'+esc(text)+'</button>';
  const card = (title,value,note) => '<div class="erp-kpi"><div>'+esc(title)+'</div><div class="value">'+value+'</div><div class="caption">'+esc(note||'')+'</div></div>';
  const panel = (title,body,action='') => '<article class="erp-panel"><div class="erp-row"><h2>'+esc(title)+'</h2>'+action+'</div>'+body+'</article>';
  const table = (head,rows) => '<div class="erp-scroll"><table><thead><tr>'+head.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+head.length+'" class="erp-empty">Belum ada data.</td></tr>')+'</tbody></table></div>';
  const badge = value => '<span class="erp-status">'+esc(value||'Belum tersedia')+'</span>';
  const list = value => Array.isArray(value)?value:[];
  function scoped(value) {
    if (Array.isArray(value)) return value.map(scoped);
    if (value && typeof value === 'object') {
      if (value.brand_id && value.brand_id !== context().brandId) throw new Error('Data tidak sesuai brand akun.');
      Object.values(value).forEach(scoped);
    }
    return value;
  }
  async function load() {
    const generation = ++state.generation;
    state.loading=true; state.error=''; state.details={}; state.detailError=''; render();
    try {
      const result = await window.__HASNARIA_DB.rpc('get_ui_bootstrap_v4').abortSignal(AbortSignal.timeout(30000));
      if(result.error) throw result.error;
      if(!result.data || !result.data.owner) throw new Error('Ringkasan belum tersedia untuk akun ini.');
      if(generation!==state.generation)return;
      state.data=scoped(result.data);
      const months=list(state.data.monthly_trend);
      if(!months.some(m=>m.month===state.month))state.month=months[0]?.month||'';
      state.updated=new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'});
    } catch(error) {if(generation===state.generation){state.error=error.message;state.data=null;}}
    finally {if(generation===state.generation){state.loading=false;render();if(views[state.page]&&state.data)loadDetails(state.page);}}
  }
  async function loadDetails(page) {
    const generation=state.generation;
    state.details[page]=null;state.detailError='';render();
    try {
      const [view,order]=views[page];
      const result=await window.__HASNARIA_DB.from(view).select('*').eq('brand_id',context().brandId).order(order,{ascending:page!=='audit'}).limit(500).abortSignal(AbortSignal.timeout(30000));
      if(result.error)throw result.error;
      if(generation===state.generation)state.details[page]=scoped(result.data);
    } catch(error){if(generation===state.generation)state.detailError=error.message;}
    if(generation===state.generation)render();
  }
  function actionsTable(items) {
    return table(['Urutan','Prioritas','Perlu ditindaklanjuti','Nilai terkait',''],items.map(a=>[number(a.action_rank),badge(a.priority),'<b>'+esc(a.subject)+'</b><small class="erp-block">'+esc(names[a.action_type]||a.action_type)+'</small>',money(a.financial_impact),btn('Lihat detail','action:'+a.action_rank)]));
  }
  function overview() {
    const d=state.data,o=d.owner,m=list(d.monthly_trend).find(x=>x.month===state.month)||{},h=d.hpp_summary||{};
    const trend=list(d.monthly_trend).slice().reverse();const max=Math.max(1,...trend.map(x=>Number(x.sales_revenue)||0));
    const chart='<div class="erp-chart" role="img" aria-label="Tren omzet bulanan; rincian tersedia di Arus kas">'+trend.map(x=>'<div class="erp-day" title="'+esc(x.month+': '+money(x.sales_revenue))+'"><svg viewBox="0 0 24 160" preserveAspectRatio="none" aria-hidden="true"><rect x="3" y="'+(160-(Number(x.sales_revenue)||0)/max*150)+'" width="18" height="'+Math.max(1,(Number(x.sales_revenue)||0)/max*150)+'" rx="3" fill="#367cf5"/></svg><small>'+esc(String(x.month).slice(5,7))+'</small></div>').join('')+'</div>';
    return '<div class="erp-kpis">'+card('Omzet',money(m.sales_revenue),state.month?String(state.month).slice(0,7):'Periode belum tersedia')+card('Kas masuk diketahui',money(m.known_cash_in),'Arus kas terklasifikasi')+card('Kas keluar diketahui',money(m.known_cash_out),'Bukan seluruh biaya usaha')+card('Pergerakan kas bersih',money(m.net_known_cash_movement),'Bukan saldo kas/bank')+'</div>'+
      '<div class="erp-readiness"><div><span>Persediaan terverifikasi</span><strong>'+money(o.verified_inventory_value)+'</strong></div><div><span>Cakupan biaya persediaan</span><strong>'+pct(o.verified_inventory_cost_coverage_pct)+'</strong></div><div><span>Pembelian terpetakan</span><strong>'+pct(o.purchase_mapping_coverage_pct)+'</strong></div><div><span>Produk siap HPP</span><strong>'+number(h.ready_products)+' / '+number(h.product_count)+'</strong></div></div>'+
      '<div class="erp-panels"><div>'+panel('Tren omzet bulanan',chart,btn('Rincian arus kas','page:finance'))+panel('Status laba', '<div class="erp-kpis">'+card('Laba kotor terverifikasi',money(m.gross_profit_verified),'Mengikuti HPP terverifikasi dari backend')+card('Laba operasi terverifikasi',money(m.operating_profit_verified),'Nilai kosong berarti belum tersedia')+'</div><p>'+esc(m.profit_status||h.overall_profit_readiness||'Belum terverifikasi')+'</p>')+'</div><div>'+panel('Keputusan yang perlu perhatian','<div class="erp-kpis">'+card('Tindakan terbuka',number(o.total_open_actions),'Seluruh antrean ERP')+card('Prioritas tinggi',number(o.high_priority_actions),'Perlu ditinjau owner')+'</div>'+actionsTable(list(d.top_actions).slice(0,4)),btn('Buka antrean','page:actions'))+'</div></div>'+panel('Kondisi persediaan','<div class="erp-kpis">'+card('Stok kritis',number(o.inventory_critical),'')+card('Perlu pembelian',number(o.inventory_reorder),'')+card('Belum terpantau',number(o.inventory_untracked),'Butuh baseline atau opname')+card('Pengeluaran tercatat',money(m.recorded_expense_amount),'Periode terpilih')+'</div>',btn('Lihat persediaan','page:inventory'));
  }
  function body() {
    const d=state.data;
    if(state.page==='overview')return overview();
    if(views[state.page]&&!state.details[state.page])return panel(pages[state.page],state.detailError?'<p role="alert">'+esc(state.detailError)+'</p>'+btn('Coba lagi','retry'):'<p role="status">Memuat rincian…</p>');
    const rows=state.details[state.page]||[];
    if(state.page==='actions'){
      const selected=rows.filter(x=>(!state.priority||x.priority===state.priority)&&(!state.type||x.action_type===state.type)&&(x.subject+' '+x.action_type).toLowerCase().includes(state.query.toLowerCase()));
      return panel('Antrean keputusan','<div class="erp-controls"><label>Cari<input id="erp-search" type="search" value="'+esc(state.query)+'" placeholder="Cari produk atau masalah"></label><label>Prioritas<select id="erp-priority"><option value="">Semua prioritas</option>'+['high','medium','low'].map(x=>'<option '+(state.priority===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label>Jenis<select id="erp-type"><option value="">Semua jenis</option>'+[...new Set(rows.map(x=>x.action_type))].map(x=>'<option value="'+esc(x)+'" '+(state.type===x?'selected':'')+'>'+esc(names[x]||x)+'</option>').join('')+'</select></label></div>'+actionsTable(selected)+'<p class="erp-meta">Maksimal 500 tindakan. Nilai terkait dapat merujuk transaksi yang sama; jangan dijumlahkan sebagai kerugian.</p>');
    }
    if(state.page==='inventory')return panel('Persediaan & status pemantauan',table(['Bahan','Satuan','Stok ledger','Status'],rows.map(x=>[esc(x.item_name),esc(x.unit),x.tracking_active?number(x.ledger_qty):'Belum terpantau',badge(x.ui_status||x.status)])),btn('Kelola stok & opname','nav:stok'))+'<p class="erp-note">Persediaan menunjukkan kondisi terkini. Baseline historis adalah stok akhir periode, bukan stok opname hari ini. Maksimal 500 bahan.</p>';
    if(state.page==='costing')return panel('Kesiapan HPP per produk',table(['Produk','Resep','Biaya komponen','HPP','Status'],rows.map(x=>[esc(x.product_name),x.recipe_verified?'Terverifikasi':x.has_recipe?'Draft':'Belum ada',number(x.costed_component_count)+' / '+number(x.component_count),x.can_use_for_hpp?money(x.raw_recipe_cost):'Belum terverifikasi',badge(x.costing_status)])),btn('Kelola resep & bahan','nav:stok'))+'<p class="erp-note">Resep aktif belum tentu terverifikasi. Biaya tidak diisi dari perkiraan. Maksimal 500 produk.</p>';
    if(state.page==='finance')return panel('Arus kas bulanan',table(['Bulan','Omzet','Kas masuk diketahui','Kas keluar diketahui','Pergerakan bersih','Kredit/campuran','Pembiayaan dibayar','Hanya kewajiban','Status'],list(d.monthly_trend).map(x=>[esc(String(x.month).slice(0,7)),money(x.sales_revenue),money(x.known_cash_in),money(x.known_cash_out),money(x.net_known_cash_movement),money(x.credit_or_mixed_purchase),money(x.financing_cash_paid),money(x.financing_liability_only),badge(x.cashflow_data_status)])),btn('Buka keuangan & approval','nav:ops'))+'<p class="erp-note">Paylater/utang tidak otomatis menjadi kas keluar. Pergerakan kas diketahui bukan saldo kas atau bank. Maksimal 12 bulan dari ringkasan ERP.</p>';
    if(state.page==='audit')return panel('Aktivitas ERP terbaru',table(['Waktu','Entitas','Tindakan','Alasan','Pelaku'],rows.map(x=>[esc(x.created_at),esc(x.entity_type),esc(x.action),esc(x.reason),esc(x.actor_name||'—')]))+'<p class="erp-meta">Maksimal 500 aktivitas terbaru.</p>');
    return panel('Yang masih perlu dilengkapi',table(['Kebutuhan','Prioritas','Jumlah','Nilai terkait','Petunjuk'],list(d.manual_input_requirements).map(x=>[esc(names[x.requirement_type]||x.requirement_type),badge(x.priority),number(x.open_items),money(x.financial_context),esc(x.instruction)])))+panel('Kemutakhiran data',table(['Sumber','Tanggal terakhir'],[['Penjualan',esc(d.freshness?.latest_sale_date||'Belum tersedia')],['Pembelian',esc(d.freshness?.latest_purchase_date||'Belum tersedia')],['Opname',esc(d.freshness?.latest_opname_date||'Belum tersedia')]]));
  }
  function render() {
    const host=$('dashboard');if(!host||!context())return;
    host.classList.add('erp');
    host.innerHTML='<div class="erp-top"><div><div class="eyebrow">Hasnaria · Command Center</div><h1>Kendali bisnis, satu pandangan.</h1><p>Ringkasan owner dari data operasional yang tercatat.</p></div>'+btn('Perbarui','refresh')+'</div><nav class="erp-tabs" aria-label="Analisis bisnis">'+Object.entries(pages).map(([key,label])=>'<button type="button" data-erp="page:'+key+'" aria-current="'+(state.page===key?'page':'false')+'">'+label+'</button>').join('')+'</nav>'+
      (state.data?'<div class="erp-controls">'+(state.page==='overview'?'<label>Periode ringkasan<select id="erp-month">'+list(state.data.monthly_trend).map(x=>'<option value="'+esc(x.month)+'" '+(x.month===state.month?'selected':'')+'>'+esc(String(x.month).slice(0,7))+'</option>').join('')+'</select></label>':'')+'<span class="erp-meta">Diperbarui '+esc(state.updated)+' WIB</span></div>':'')+
      (state.loading?panel('Ringkasan bisnis','<p role="status">Memuat data terbaru…</p>'):state.error?panel('Data belum dapat dimuat','<p role="alert">'+esc(state.error)+'</p>'+btn('Coba lagi','refresh')):state.data?body():'')+'<dialog id="erp-dialog" aria-labelledby="erp-dialog-title"></dialog>';
    host.onclick=e=>{const b=e.target.closest('[data-erp]');if(!b)return;const [action,value]=b.dataset.erp.split(':');
      if(action==='page'){state.page=value;state.detailError='';render();if(views[value]&&!state.details[value])loadDetails(value);}
      if(action==='refresh'&&!state.loading)load();
      if(action==='retry')loadDetails(state.page);
      if(action==='nav'){$('erp-dialog').close();context().navigate(value);window.scrollTo({top:0});}
      if(action==='close')$('erp-dialog').close();
      if(action==='action'){
        const a=[...(state.details.actions||[]),...list(state.data.top_actions)].find(x=>String(x.action_rank)===value);if(!a)return;
        $('erp-dialog').innerHTML='<h2 id="erp-dialog-title">'+esc(a.subject)+'</h2><p>'+esc(a.action_needed)+'</p><p>Nilai terkait: <b>'+money(a.financial_impact)+'</b></p><p>Aktivitas terkait: '+number(a.activity_impact)+'</p><p class="erp-note">Periksa data sumber di modul terkait. Konfirmasi bisnis tetap dilakukan melalui alur operasional yang tersedia.</p><div class="erp-form-actions">'+btn('Tutup','close')+btn('Buka modul terkait','nav:'+(routes[a.action_type]||'stok'))+'</div>';
        $('erp-dialog').showModal();
      }
    };
    if($('erp-month'))$('erp-month').onchange=e=>{state.month=e.target.value;render();};
    for(const [id,key] of [['erp-search','query'],['erp-priority','priority'],['erp-type','type']])if($(id))$(id).oninput=e=>{state[key]=e.target.value;const pos=e.target.selectionStart;render();$(id).focus();if(pos!=null)$(id).setSelectionRange(pos,pos);};
  }
  function mount(){
    if(!context())return;
    const key=[context().brandId,context().userId,context().role].join(':');
    if(state.key!==key){state.key=key;state.data=null;state.details={};state.error='';state.generation++;state.loading=false;}
    render();if(!state.data&&!state.loading&&!state.error)load();
  }
  window.HasnariaERP={mount};
})();
