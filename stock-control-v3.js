/* Hasnaria Stock Control v3
 * Progressive read-only inventory control.
 * Critical path: reconciliation rows render first.
 * Supplemental path: Incoming PO + BOM coverage loads after the table is visible.
 */
(function () {
  'use strict';

  if (window.__HASNARIA_STOCK_CONTROL_V3) return;
  window.__HASNARIA_STOCK_CONTROL_V3 = true;
  window.__HASNARIA_STOCK_UI4 = true;

  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  function previewUsesProductionDatabase(){
    var host=window.location&&window.location.hostname;
    if(!host)return false;
    if(String(window.HASNARIA_SB||'').indexOf('bnnhmtkpdjlgehsvgoda.supabase.co')<0)return false;
    return host!=='hasnaria-business-analyzer.vercel.app'&&
      host!=='hasnaria-business-analyzer-ekariashoesanti-9951s-projects.vercel.app';
  }
  var PAGE_SIZE = 18;
  var AUX_CHUNK = 40;
  var S = {
    raw: [],
    items: [],
    search: '',
    category: '',
    status: '',
    page: 1,
    baseLoading: false,
    baseLoaded: false,
    firstPeriodLoaded: false,
    auxLoading: false,
    auxLoaded: false,
    error: '',
    auxError: '',
    loadSeq: 0,
    periodSeq: 0,
    ledgerSeq: 0,
    viewSeq: 0,
    syncSeq: 0,
    periods: [],
    period: '',
    overview: null,
    activity: [],
    trend: [],
    monthEndRows: [],
    monthEndUnavailable: false,
    periodLoading: false,
    periodError: '',
    modal: '',
    ledger: [],
    ledgerLoading: false,
    ledgerError: '',
    ledgerPage: 1,
    accessToken: '',
    tokenAt: 0,
    correction: null,
    correctionNotice: '',
    ledgerAudit: {state:'loading',items:[],count:0},
    lastVerifiedAt: '',
    pendingStockRefresh: false,
    verifiedRefreshing: false,
    pendingUploadRuns: null,
    valuation: null,
    verifiedCosts: [],
    valuationLoaded: false,
    valuationLoading: false,
    valuationError: '',
    valuationSeq: 0,
    movingLoading: false,
    movingLoaded: false,
    movingRows: [],
    movingError: '',
    movingSeq: 0,
    salesLinkAudit: null,
    salesLinkAuditUnavailable: false,
    purchaseImportEvidence: null,
    purchaseImportEvidenceUnavailable: false,
    recipeReviewRows: [],
    recipeReviewLoaded: false,
    recipeReviewLoading: false,
    recipeReviewError: '',
    recipeReviewSeq: 0,
    recipeDetail: null,
    recipeSearch: '',
    recipeFilter: 'all',
    recipePage: 1,
    combinedOpen: false,
    combinedRows: [],
    combinedLoading: false,
    combinedLoaded: false,
    combinedError: '',
    combinedSeq: 0,
    formulaRows: [],
    formulaLoading: false,
    formulaLoaded: false,
    formulaError: '',
    formulaSeq: 0,
    formulaPage: 1,
    formulaSearch: '',
    integrationAudit: null,
    integrationLoading: false,
    integrationError: '',
    integrationSeq: 0,
    integrationPeriod: '',
    chartUnit: '',
    chartPage: 1
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function fmt(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString('id-ID', { maximumFractionDigits: 6 });
  }

  function signed(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return (n > 0 ? '+' : '') + fmt(n);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dateLabel(value) {
    if (!value) return '-';
    var p = String(value).slice(0, 10).split('-');
    if (p.length !== 3) return value;
    return Number(p[2]) + '/' + Number(p[1]) + '/' + p[0];
  }

  var MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

  function monthKey(value) {
    var s = String(value || '');
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
  }

  function monthLabel(value) {
    var k = monthKey(value);
    if (!k) return 'Periode belum tersedia';
    return MONTHS[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4);
  }

  function cutLabel() {
    var k = monthKey(S.period);
    if (!k) return 'Periode belum tersedia';
    var y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7));
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return '1–' + last + ' ' + monthLabel(k);
  }

  function isOwner() {
    var x = window.__HASNARIA_CONTEXT;
    return !!(x && x.role === 'owner');
  }

  function elapsedDays(value) {
    if (!value) return null;
    var start = new Date(String(value).slice(0, 10) + 'T00:00:00');
    var end = new Date(today() + 'T00:00:00');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  }

  async function token() {
    if (S.accessToken && Date.now() - S.tokenAt < 30000) return S.accessToken;
    if (window.__HASNARIA_GET_ACCESS_TOKEN) {
      try {
        var t = await window.__HASNARIA_GET_ACCESS_TOKEN();
        if (t) {
          S.accessToken = t;
          S.tokenAt = Date.now();
          return t;
        }
      } catch (_) {}
    }
    for (var i = 0; i < localStorage.length; i++) {
      try {
        var raw = localStorage.getItem(localStorage.key(i));
        var parsed = JSON.parse(raw || '');
        if (parsed && parsed.access_token) {
          S.accessToken = parsed.access_token;
          S.tokenAt = Date.now();
          return S.accessToken;
        }
      } catch (_) {}
    }
    return null;
  }

  async function request(path) {
    var t = await token();
    if (!t) throw new Error('Session belum tersedia. Silakan login kembali.');
    var res = await fetch(SB + '/rest/v1/' + path, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + t }
    });
    if (!res.ok) {
      var text = '';
      try { text = await res.text(); } catch (_) {}
      throw new Error('Gagal memuat kontrol stok (' + res.status + ')' + (text ? ': ' + text.slice(0, 140) : ''));
    }
    return res.json();
  }

  async function rpc(name, payload) {
    var t = await token();
    if (!t) throw new Error('Session belum tersedia. Silakan login kembali.');
    var res = await fetch(SB + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) {
      var text = '';
      try { text = await res.text(); } catch (_) {}
      throw new Error('Gagal memuat kontrol stok (' + res.status + ')' + (text ? ': ' + text.slice(0, 140) : ''));
    }
    return res.json();
  }

  function qs(obj) {
    var q = new URLSearchParams();
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (v !== null && v !== undefined && v !== '') q.set(k, v);
    });
    return q.toString();
  }

  function ensureCss() {
    if (document.getElementById('stock-control-v3-css')) return;
    var l = document.createElement('link');
    l.id = 'stock-control-v3-css';
    l.rel = 'stylesheet';
    l.href = '/stock-control-v3.css?v=32';
    document.head.appendChild(l);
  }

  function initialStatus(x) {
    if (!x.tracking_active) return 'untracked';
    var balance = num(x.system_qty);
    if (balance <= 0) return 'critical';
    if (num(x.min_qty) > 0 && balance < num(x.min_qty)) return 'order';
    return 'ok';
  }

  function baseItem(x) {
    return Object.assign({}, x, {
      balance_qty: x.tracking_active ? num(x.system_qty) : null,
      incoming_qty: null,
      projected_qty: null,
      demand_ready: null,
      avg_usage: null,
      days_cover: null,
      suggested_order_qty: null,
      ui_status: initialStatus(x)
    });
  }

  function supplementalItems(raw, recipeRows, poRows, receiptRows) {
    var recipeMap = {};
    (recipeRows || []).forEach(function (r) {
      if (r.inventory_item_id) recipeMap[r.inventory_item_id] = true;
    });

    var receivedByLine = {};
    (receiptRows || []).forEach(function (r) {
      var id = r.purchase_order_item_id;
      if (!id) return;
      receivedByLine[id] = (receivedByLine[id] || 0) + num(r.qty_received);
    });

    var incomingByItem = {};
    (poRows || []).forEach(function (r) {
      if (!r.inventory_item_id) return;
      var remaining = Math.max(0, num(r.ordered_qty) - num(receivedByLine[r.id]));
      incomingByItem[r.inventory_item_id] = (incomingByItem[r.inventory_item_id] || 0) + remaining;
    });

    return raw.map(function (x) {
      var tracked = !!x.tracking_active;
      var balance = tracked ? num(x.system_qty) : null;
      var incoming = num(incomingByItem[x.inventory_item_id]);
      var projected = tracked ? balance + incoming : null;
      var minQty = num(x.min_qty);
      var orderQty = num(x.order_qty);
      var demandReady = !!recipeMap[x.inventory_item_id];
      var age = tracked ? elapsedDays(x.last_opname_date) : null;
      var usage = demandReady && tracked ? num(x.sales_usage_qty) : null;
      var avg = demandReady && tracked && age ? usage / age : null;
      var cover = avg !== null && avg > 0 ? Math.max(balance, 0) / avg : null;
      var suggested = null;

      if (tracked) {
        suggested = 0;
        if (minQty > 0 && projected < minQty) {
          suggested = Math.max(orderQty, minQty - projected);
        }
      }

      var status = 'ok';
      if (!tracked) status = 'untracked';
      else if (balance <= 0) status = 'critical';
      else if (minQty > 0 && projected < minQty) status = 'order';
      else if (minQty > 0 && balance < minQty && incoming > 0 && projected >= minQty) status = 'incoming';

      return Object.assign({}, x, {
        balance_qty: balance,
        incoming_qty: incoming,
        projected_qty: projected,
        demand_ready: demandReady,
        avg_usage: avg,
        days_cover: cover,
        suggested_order_qty: suggested,
        ui_status: status
      });
    });
  }

  async function loadRecipes(ids) {
    var out = [];
    for (var i = 0; i < ids.length; i += AUX_CHUNK) {
      var chunk = ids.slice(i, i + AUX_CHUNK);
      var q = qs({
        brand_id: 'eq.' + BRAND,
        active: 'eq.true',
        inventory_item_id: 'in.(' + chunk.join(',') + ')',
        select: 'inventory_item_id',
        limit: String(AUX_CHUNK * 50)
      });
      var rows = await request('inventory_recipe_components?' + q);
      out = out.concat(rows || []);
    }
    return out;
  }

  async function loadReceipts(lineIds) {
    var out = [];
    for (var i = 0; i < lineIds.length; i += AUX_CHUNK) {
      var chunk = lineIds.slice(i, i + AUX_CHUNK);
      var q = qs({
        purchase_order_item_id: 'in.(' + chunk.join(',') + ')',
        select: 'purchase_order_item_id,qty_received,goods_receipts!inner(brand_id,status)',
        'goods_receipts.brand_id': 'eq.' + BRAND,
        'goods_receipts.status': 'eq.posted',
        limit: String(AUX_CHUNK * 50)
      });
      var rows = await request('goods_receipt_items?' + q);
      out = out.concat(rows || []);
    }
    return out;
  }

  async function loadAux(seq) {
    if (seq !== S.loadSeq || !S.baseLoaded) return;
    var trackedIds = S.raw.filter(function (x) { return !!x.tracking_active; }).map(function (x) { return x.inventory_item_id; });
    if (!trackedIds.length) {
      S.auxLoaded = true;
      S.auxLoading = false;
      render();
      return;
    }

    S.auxLoading = true;
    S.auxLoaded = false;
    S.auxError = '';
    render();

    try {
      var trackedSet = {};
      trackedIds.forEach(function (id) { trackedSet[id] = true; });
      var poQuery = qs({
        select: 'id,inventory_item_id,ordered_qty,purchase_orders!inner(brand_id,status)',
        'purchase_orders.brand_id': 'eq.' + BRAND,
        'purchase_orders.status': 'in.(issued,partially_received)',
        limit: '1000'
      });

      var pair = await Promise.all([
        loadRecipes(trackedIds),
        request('purchase_order_items?' + poQuery)
      ]);
      if (seq !== S.loadSeq) return;

      var recipeRows = pair[0] || [];
      var poRows = (pair[1] || []).filter(function (r) { return !!trackedSet[r.inventory_item_id]; });
      var receiptRows = poRows.length ? await loadReceipts(poRows.map(function (r) { return r.id; })) : [];
      if (seq !== S.loadSeq) return;

      S.items = supplementalItems(S.raw, recipeRows, poRows, receiptRows);
      S.auxLoaded = true;
    } catch (e) {
      if (seq !== S.loadSeq) return;
      S.auxError = e && e.message ? e.message : String(e);
    } finally {
      if (seq === S.loadSeq) {
        S.auxLoading = false;
        render();
      }
    }
  }

  function scheduleAux(seq) {
    var run = function () { loadAux(seq); };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 300 });
    } else {
      setTimeout(run, 60);
    }
  }


  // Compare two authenticated, read-only server views. Never alter ledger or guess units.
  function auditLedgerPositions(rows, ledgerRows) {
    var byId = new Map();
    (ledgerRows || []).forEach(function(r){byId.set(r.inventory_item_id,r)});
    var items=[],tracked=0;
    (rows || []).forEach(function(row){
      if(!row.tracking_active)return;
      tracked++;
      var ledger=byId.get(row.inventory_item_id);
      if(!ledger || ledger.ledger_qty == null){
        items.push({id:row.inventory_item_id,name:row.item_name,category:row.category,
          unit:row.unit,reason:'missing-ledger',reconcile:row.system_qty,ledger:null});return;
      }
      var a=Number(row.system_qty),b=Number(ledger.ledger_qty);
      if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>0.00001){
        items.push({id:row.inventory_item_id,name:row.item_name,category:row.category,
          unit:row.unit,reason:'mismatch',reconcile:row.system_qty,ledger:ledger.ledger_qty});
      }
    });
    return {state:'checked',count:items.length,tracked:tracked,items:items};
  }

  function loadVerifiedAudit(rows) {
    return request('inventory_ledger_balance?' + qs({
      brand_id:'eq.'+BRAND,select:'inventory_item_id,ledger_qty,tracking_active',order:'inventory_item_id.asc'
    })).then(function(ledger){return auditLedgerPositions(rows,ledger)})
      .catch(function(){return {state:'unavailable',count:0,tracked:0,items:[]};});
  }


  function renderUploadStatus(){
    if(!isOwner())return '';
    if(S.pendingUploadRuns===null)return '';
    var all=S.pendingUploadRuns||[],draft=all.filter(function(x){return x.status==='draft'||x.status==='in_progress'}).length,
        submitted=all.filter(function(x){return x.status==='submitted'}).length;
    return '<div class="sc4-upload-state" role="status"><span><b>Upload Opname</b> · '+fmt(all.length)+' batch menunggu tindak lanjut</span>'+
      '<span>'+fmt(draft)+' draft / belum lengkap · '+fmt(submitted)+' menunggu persetujuan</span>'+
      (all.length?'<button type="button" data-sc4-action="open-operasional">Lanjutkan di Operasional →</button>':'')+'</div>';
  }

  async function readPendingUploads(){
    var rows=await request('operational_runs?' + qs({
      brand_id:'eq.'+BRAND,run_type:'eq.stock_opname',status:'in.(draft,in_progress,submitted)',
      select:'id,title,status,scheduled_date',order:'scheduled_date.desc',limit:'250'
    }));
    return (rows||[]).filter(function(x){return String(x.title||'').indexOf('[UPLOAD_OPNAME]')===0});
  }

  async function loadPendingUploads(seq){
    if(!isOwner())return;
    try{
      var rows=await readPendingUploads();
      if(seq===S.periodSeq)S.pendingUploadRuns=rows;
    }catch(_){if(seq===S.periodSeq)S.pendingUploadRuns=null}
  }

  // Read-only Owner review; no recipe approval or inventory posting.
  async function loadRecipeReview(){
    if(!isOwner()||!S.period)return;
    var period=S.period,seq=++S.recipeReviewSeq;
    S.recipeReviewLoading=true;S.recipeReviewLoaded=false;
    S.recipeReviewRows=[];S.recipeReviewError='';S.recipeDetail=null;
    S.recipeSearch='';S.recipeFilter='all';S.recipePage=1;
    S.combinedOpen=false;S.combinedRows=[];S.combinedLoaded=false;S.combinedError='';
    ++S.combinedSeq;render();
    try{
      var rows=await request('ui_stock_recipe_review_v1?'+qs({
        brand_id:'eq.'+BRAND,period_month:'eq.'+period+'-01',
        select:'product_id,product_name,sale_item_rows,sold_units,active_components,verified_components,pending_components,recipe_status,effective_from,review_state',
        order:'sale_item_rows.desc,product_name.asc',limit:'200'
      }));
      if(seq!==S.recipeReviewSeq||period!==S.period)return;
      S.recipeReviewRows=Array.isArray(rows)?rows:[];
      S.recipeReviewLoaded=true;
    }catch(e){
      if(seq!==S.recipeReviewSeq||period!==S.period)return;
      S.recipeReviewError=e&&e.message?e.message:String(e);
    }finally{
      if(seq===S.recipeReviewSeq){S.recipeReviewLoading=false;render();}
    }
  }

  // Monthly sales and a persistent master recipe effective_from are separate.
  function recipeReviewStatus(x){
    var state=x.review_state||'component_pending';
    if(state==='eligible')return {label:'Resep sudah disetujui',tone:'ok',detail:'Berlaku mulai '+dateLabel(x.effective_from)+', sampai resep diubah.'};
    if(state==='effective_date_partial')return {label:'Berlaku sebagian bulan',tone:'warn',detail:'Resep berlaku sejak '+dateLabel(x.effective_from)+'; penjualan sebelumnya perlu diperiksa.'};
    if(state==='missing_bom')return {label:'Belum ada resep',tone:'missing',detail:'Daftar bahan untuk menu ini belum tersedia.'};
    if(state==='component_pending')return {label:'Perlu cek bahan',tone:'warn',detail:'Ada bahan atau takaran yang belum diperiksa.'};
    return {label:'Menunggu persetujuan',tone:'pending',detail:'Bahan sudah tercatat, perlu persetujuan resep oleh Owner.'};
  }

  function renderRecipeReview(){
    if(!isOwner())return '<div class="sc3-alert">Daftar resep hanya untuk Owner.</div>';
    if(S.recipeReviewLoading)return '<div class="sc3-loading">Mengambil data penjualan dan resep…</div>';
    if(S.recipeReviewError)return '<div class="sc3-alert">Daftar resep belum bisa ditampilkan: '+esc(S.recipeReviewError)+'. Stok tidak berubah.</div>';
    if(!S.recipeReviewLoaded)return '<div class="sc3-loading">Buka Cek Resep untuk memuat data.</div>';
    var rows=S.recipeReviewRows||[];
    if(!rows.length)return '<div class="sc3-loading">Belum ada produk terjual pada '+esc(monthLabel(S.period))+'.</div>';
    if(S.recipeDetail)return '<div class="sc19-help"><b>Resep berlaku lintas bulan.</b> Tanggal efektif tidak perlu dibuat ulang setiap bulan, kecuali bahan atau takarannya berubah.</div>'+renderRecipeDetail();

    var total=rows.reduce(function(sum,x){return sum+num(x.sale_item_rows)},0);
    var ready=rows.filter(function(x){return x.review_state==='eligible'}).length;
    var missing=rows.filter(function(x){return x.review_state==='missing_bom'}).length;
    var query=String(S.recipeSearch||'').trim().toLocaleLowerCase('id-ID');
    var filtered=rows.filter(function(x){
      if(query&&String(x.product_name||'').toLocaleLowerCase('id-ID').indexOf(query)===-1)return false;
      if(S.recipeFilter==='all')return true;
      if(S.recipeFilter==='check')return x.review_state==='component_pending'||x.review_state==='missing_bom';
      if(S.recipeFilter==='approval')return x.review_state==='product_approval_pending';
      if(S.recipeFilter==='approved')return x.review_state==='eligible'||x.review_state==='effective_date_partial';
      return true;
    });
    var pageSize=10,pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    S.recipePage=Math.min(Math.max(1,S.recipePage||1),pages);
    var start=(S.recipePage-1)*pageSize;
    var visible=filtered.slice(start,start+pageSize);
    var body=visible.map(function(x,k){
      var state=recipeReviewStatus(x);
      var duration=x.effective_from&&x.recipe_status==='verified'
        ?' <small>Mulai '+esc(dateLabel(x.effective_from))+'</small>':'';
      return '<tr>'+
        '<td class="sc19-number">'+(start+k+1)+'</td>'+
        '<td class="sc19-name"><b>'+esc(x.product_name||'Nama menu tidak tersedia')+'</b></td>'+
        '<td class="sc19-qty">'+fmt(x.sold_units)+'</td>'+
        '<td><span class="sc19-status sc19-'+state.tone+'">'+esc(state.label)+'</span>'+duration+'</td>'+
        '<td class="sc19-action"><button type="button" class="sc19-check" data-sc17-product="'+esc(x.product_id)+
        '" title="'+esc(state.detail)+'">Periksa <span aria-hidden="true">›</span></button></td>'+
      '</tr>';
    }).join('');
    var paging='<div class="sc19-pagination"><span>Menampilkan '+fmt(filtered.length?start+1:0)+'–'+
      fmt(Math.min(start+pageSize,filtered.length))+' dari '+fmt(filtered.length)+' menu</span>'+
      '<div><button type="button" data-sc19-page="'+(S.recipePage-1)+'"'+
      (S.recipePage<=1?' disabled':'')+'>‹ Sebelumnya</button>'+
      '<span>Halaman '+S.recipePage+' / '+pages+'</span>'+
      '<button type="button" data-sc19-page="'+(S.recipePage+1)+'"'+
      (S.recipePage>=pages?' disabled':'')+'>Berikutnya ›</button></div></div>';
    var unmapped=S.salesLinkAudit?num(S.salesLinkAudit.unmapped_product_rows):0;
    return '<div class="sc19-summary">'+
      '<div><b>'+fmt(rows.length)+'</b><span>Jenis menu terjual</span></div>'+
      '<div><b>'+fmt(total)+'</b><span>Baris detail penjualan</span></div>'+
      '<div><b>'+fmt(ready)+'</b><span>Resep siap untuk seluruh penjualan bulan ini</span></div>'+
      '</div>'+
      '<div class="sc19-help"><b>Perhatikan:</b> Data penjualan mengikuti bulan '+esc(monthLabel(S.period))+
      '. <b>Resep yang sudah disetujui berlaku terus</b> sejak tanggal efektif sampai bahan atau takaran berubah. Tidak perlu disetujui ulang tiap bulan. Halaman ini tidak mengubah stok.</div>'+
      (unmapped>0?'<div class="sc3-alert">'+fmt(unmapped)+' baris penjualan belum memiliki nama menu yang terhubung.</div>':'')+
      '<div class="sc19-section-head"><b>Daftar menu dan status resep</b>'+
      '<span>'+fmt(missing)+' menu belum memiliki daftar bahan</span></div>'+
      '<div class="sc19-toolbar">'+
      '<label for="sc19RecipeSearch">Cari menu'+
      '<input type="search" id="sc19RecipeSearch" placeholder="Ketik nama menu…" value="'+esc(S.recipeSearch)+'" autocomplete="off"></label>'+
      '<label for="sc19RecipeFilter">Tampilkan'+
      '<select id="sc19RecipeFilter">'+
      '<option value="all"'+(S.recipeFilter==='all'?' selected':'')+'>Semua status</option>'+
      '<option value="check"'+(S.recipeFilter==='check'?' selected':'')+'>Perlu cek bahan / belum ada resep</option>'+
      '<option value="approval"'+(S.recipeFilter==='approval'?' selected':'')+'>Menunggu persetujuan</option>'+
      '<option value="approved"'+(S.recipeFilter==='approved'?' selected':'')+'>Resep sudah berlaku</option>'+
      '</select></label></div>'+
      '<div class="sc19-list-wrap"><table class="sc19-review-table"><colgroup>'+
      '<col style="width:6%"><col style="width:39%"><col style="width:13%">'+
      '<col style="width:27%"><col style="width:15%"></colgroup><thead><tr>'+
      '<th>No.</th><th>Nama menu</th><th>Terjual (item)</th><th>Status resep</th><th>Tindakan</th>'+
      '</tr></thead><tbody>'+
      (body||'<tr><td colspan="5" class="sc19-empty">Tidak ada menu yang cocok. Ubah pencarian atau filter.</td></tr>')+
      '</tbody></table></div>'+paging+
      renderCombinedRecipeImpact();
  }


  // Combined by physical SKU, on-demand; unposted quantity estimates only.
  async function loadCombinedRecipeImpact(){
    if(!isOwner()||S.modal!=='recipes'||!S.period)return;
    var period=S.period,seq=++S.combinedSeq;
    S.combinedOpen=true;S.combinedLoading=true;S.combinedLoaded=false;
    S.combinedRows=[];S.combinedError='';render();
    try{
      var data=await request('ui_stock_recipe_combined_impact_v1?'+qs({
        brand_id:'eq.'+BRAND,period_month:'eq.'+period+'-01',
        select:'inventory_item_id,sku_name,sku_unit,contributing_products,mapped_sale_items,existing_movement_matches,lines_before_checkpoint,unverified_component_lines,unposted_after_checkpoint_lines,hypothetical_usage,approved_candidate_usage,tracking_active,baseline_date,current_system_qty,hypothetical_remaining_qty',
        order:'hypothetical_usage.desc,sku_name.asc',
        limit:'250'
      }));
      if(seq!==S.combinedSeq||period!==S.period||!S.combinedOpen)return;
      S.combinedRows=Array.isArray(data)?data:[];S.combinedLoaded=true;
    }catch(e){
      if(seq!==S.combinedSeq||period!==S.period||!S.combinedOpen)return;
      S.combinedError=e&&e.message?e.message:String(e);
    }finally{
      if(seq===S.combinedSeq){S.combinedLoading=false;render();}
    }
  }

  function renderCombinedRecipeImpact(){
    var button='<button type="button" class="sc18-toggle" data-sc18-combined="1">'+
      (S.combinedOpen?'Tutup perkiraan bahan':'Lihat perkiraan kebutuhan bahan →')+'</button>';
    var head='<div class="sc19-material-section"><div><b>Perkiraan kebutuhan bahan baku</b>'+
      '<p>Gabungkan kebutuhan bahan dari seluruh menu yang terjual pada bulan ini.</p></div>'+button+'</div>';
    if(!S.combinedOpen)return head;
    if(S.combinedLoading)return head+'<div class="sc3-loading">Menghitung kebutuhan bahan semua menu…</div>';
    if(S.combinedError)return head+'<div class="sc3-alert">Perkiraan belum dapat ditampilkan: '+esc(S.combinedError)+'</div>';
    if(!S.combinedLoaded)return head;
    var data=S.combinedRows||[];
    var negative=data.filter(function(x){
      return x.tracking_active&&x.hypothetical_remaining_qty!==null&&Number(x.hypothetical_remaining_qty)<0;
    }).length;
    var unknown=data.filter(function(x){return !x.tracking_active}).length;
    var rows=data.map(function(x){
      var risk=x.tracking_active&&x.hypothetical_remaining_qty!==null&&Number(x.hypothetical_remaining_qty)<0;
      var flag=!x.tracking_active?'Belum opname':risk?'Berpotensi minus':
        num(x.unverified_component_lines)>0?'Perlu cek takaran':'Perkiraan';
      var tone=!x.tracking_active||risk?'sc19-missing':'sc19-warn';
      return '<tr><td class="sc19-name"><b>'+esc(x.sku_name||'Bahan')+'</b>'+
        '<small>'+esc(x.sku_unit||'Satuan belum terisi')+'</small></td>'+
        '<td class="sc19-qty">'+fmt(x.contributing_products)+'</td>'+
        '<td class="sc19-qty">'+fmt(x.hypothetical_usage)+' '+esc(x.sku_unit||'')+'</td>'+
        '<td class="sc19-qty">'+(x.tracking_active?fmt(x.current_system_qty):'Belum opname')+'</td>'+
        '<td class="sc19-qty'+(risk?' sc17-impact-negative':'')+'">'+
          (x.tracking_active?fmt(x.hypothetical_remaining_qty):'Belum dapat dihitung')+'</td>'+
        '<td><span class="sc19-status '+tone+'">'+esc(flag)+'</span></td></tr>';
    }).join('');
    return head+'<div class="sc18-summary"><strong>'+fmt(data.length)+' bahan dicatat · '+
      fmt(negative)+' berpotensi minus · '+fmt(unknown)+' belum opname</strong>'+
      '<p>Gabungan seluruh produk dengan BOM aktif. Produk tanpa BOM tidak termasuk. Ini hanya perkiraan dari penjualan setelah stok fisik terakhir, bukan saldo final. Transaksi yang sudah masuk stok tidak dikurangi ulang.</p>'+
      '<div class="sc19-list-wrap"><table class="sc19-combined-table"><colgroup>'+
      '<col style="width:25%"><col style="width:10%"><col style="width:20%">'+
      '<col style="width:14%"><col style="width:16%"><col style="width:15%"></colgroup><thead><tr>'+
      '<th>Nama bahan</th><th>Dipakai menu</th><th>Perkiraan dipakai</th>'+
      '<th>Stok tercatat</th><th>Perkiraan sisa</th><th>Keterangan</th>'+
      '</tr></thead><tbody>'+(rows||'<tr><td colspan="6">Belum ada bahan yang dapat dihitung.</td></tr>')+
      '</tbody></table></div></div>';
  }

  async function loadRecipeImpact(productId){
    if(!isOwner()||S.modal!=='recipes'||!S.period)return;
    var found=(S.recipeReviewRows||[]).find(function(x){return x.product_id===productId});
    if(!found)return;
    var detail={id:productId,period:S.period,productName:found.product_name,
      loading:true,saving:false,error:'',notice:'',components:[],
      decision:'HOLD_FOR_CORRECTION',effective:'',evidence:'',reason:'',attested:false};
    S.recipeDetail=detail;render();
    try{
      var rows=await request('ui_stock_recipe_component_impact_v1?'+qs({
        brand_id:'eq.'+BRAND,period_month:'eq.'+detail.period+'-01',
        product_id:'eq.'+productId,
        select:'component_id,inventory_item_id,sku_name,sku_unit,qty_per_sale,bom_status,evidence_note,sold_units,estimated_usage,tracking_active,current_system_qty,hypothetical_remaining_qty',
        order:'sku_name.asc',limit:'80'
      }));
      if(S.recipeDetail!==detail||S.period!==detail.period)return;
      detail.components=Array.isArray(rows)?rows:[];
    }catch(e){
      if(S.recipeDetail!==detail)return;
      detail.error=e&&e.message?e.message:String(e);
    }finally{
      if(S.recipeDetail===detail){detail.loading=false;render();}
    }
  }

  function renderRecipeDetail(){
    var d=S.recipeDetail;
    if(!d)return '';
    var status=d.loading?'<div class="sc3-loading">Memuat bahan dari database…</div>':
      d.error?'<div class="sc3-alert">'+esc(d.error)+'</div>':'';
    var negative=(d.components||[]).filter(function(x){
      return x.tracking_active&&Number(x.hypothetical_remaining_qty)<0;
    }).length;
    var untracked=(d.components||[]).filter(function(x){return !x.tracking_active}).length;
    var componentBody=(d.components||[]).map(function(x){
      var estimated=x.tracking_active?Number(x.hypothetical_remaining_qty):null;
      var flag=estimated!==null&&estimated<0?' sc17-impact-negative':'';
      return '<tr><td><b>'+esc(x.sku_name||'Bahan')+'</b></td>'+
        '<td class="sc3-num">'+esc(fmt(x.qty_per_sale))+' '+esc(x.sku_unit||'')+'</td>'+
        '<td>'+esc(x.bom_status==='verified'?'Sudah diperiksa':x.bom_status==='suggested'?'Perlu diperiksa':'Belum lengkap')+'</td>'+
        '<td class="sc3-num">'+fmt(x.estimated_usage)+' '+esc(x.sku_unit||'')+'</td>'+
        '<td class="sc3-num">'+(x.tracking_active?fmt(x.current_system_qty):'Belum opname')+'</td>'+
        '<td class="sc3-num'+flag+'">'+(estimated===null?'Tidak tersedia':fmt(estimated))+'</td></tr>';
    }).join('');
    var done=!d.loading&&!d.error;
    return '<section class="sc17-detail">'+
      '<div class="sc17-detail-head"><button type="button" data-sc17-back="1">‹ Kembali ke daftar</button>'+
      '<strong>'+esc(d.productName||'Produk')+'</strong></div>'+
      status+
      (done?'<p class="sc17-review-note">Simulasi jika hanya produk ini diposting berdasarkan seluruh penjualan bulan terpilih. Belum memperhitungkan konsumsi produk lain, tanggal opname, dan potensi pergerakan yang sudah tercatat. Bukan saldo final.</p>'+
        '<div class="sc3-table-wrap"><table class="sc3-table sc17-impact-table"><thead><tr>'+
        '<th>Nama bahan</th><th>Takaran per item</th><th>Status bahan</th><th>Perkiraan dipakai</th>'+
        '<th>Stok tercatat</th><th>Perkiraan sisa</th></tr></thead><tbody>'+
        (componentBody||'<tr><td colspan="6">Resep belum memiliki bahan terdaftar. Jangan setujui.</td></tr>')+
        '</tbody></table></div>'+
        (negative||untracked?'<div class="sc17-impact-warning">Perhatian: '+fmt(negative)+' bahan berpotensi saldo negatif; '+fmt(untracked)+' belum opname. Catatan review tidak akan mengubah stok.</div>':'')+
        '<div class="sc17-evidence-form"><strong>Catat hasil pemeriksaan (tidak langsung menyetujui resep)</strong>'+
        '<label>Keputusan<select data-sc17-field="decision"><option value="HOLD_FOR_CORRECTION"'+(d.decision==='HOLD_FOR_CORRECTION'?' selected':'')+'>Tahan — perlu koreksi resep / stok</option>'+
        '<option value="EVIDENCE_RECORDED"'+(d.decision==='EVIDENCE_RECORDED'?' selected':'')+'>Dokumentasikan bukti — belum disetujui</option></select></label>'+
        '<label>Rencana tanggal mulai berlaku resep (belum diterapkan)<input data-sc17-field="effective" type="date" value="'+esc(d.effective)+'"></label>'+
        '<label>Bukti yang diperiksa (foto, nota, atau catatan fisik)<textarea data-sc17-field="evidence" rows="2" maxlength="400" placeholder="Minimal 12 karakter, contoh nomor foto / berita acara">'+esc(d.evidence)+'</textarea></label>'+
        '<label>Catatan hasil pemeriksaan bahan dan takaran<textarea data-sc17-field="reason" rows="3" maxlength="1000" placeholder="Minimal 30 karakter, tuliskan apa yang sudah dan belum terbukti">'+esc(d.reason)+'</textarea></label>'+
        '<label class="sc17-attest"><input data-sc17-field="attested" type="checkbox"'+(d.attested?' checked':'')+'><span>Saya Owner dan telah memeriksa sumber bukti asli. Saya memahami langkah ini tidak menyetujui resep atau memposting stok.</span></label>'+
        '<button type="button" data-sc17-save="1"'+(d.saving?' disabled':'')+'>'+
        (d.saving?'Menyimpan bukti…':'Simpan catatan review')+'</button>'+
        (d.notice?'<p class="sc17-saved" role="status">'+esc(d.notice)+'</p>':'')+
        '</div>':'')+'</section>';
  }

  async function saveRecipeEvidence(){
    var d=S.recipeDetail;
    if(!isOwner()||S.modal!=='recipes'||!d||d.loading||d.saving)return;
    var evidence=String(d.evidence||'').trim(),reason=String(d.reason||'').trim();
    if(evidence.length<12||reason.length<30){
      d.notice='Referensi bukti minimal 12 karakter dan alasan minimal 30 karakter.';render();return;
    }
    if(d.decision==='EVIDENCE_RECORDED'&&!d.attested){
      d.notice='Centang konfirmasi pemeriksaan bukti sebelum mendokumentasikan review.';render();return;
    }
    d.saving=true;d.notice='';render();
    try{
      var result=await rpc('owner_stock_recipe_record_review_v1',{
        p_product_id:d.id,p_period_month:d.period+'-01',
        p_decision:d.decision,
        p_proposed_effective_from:d.effective||null,
        p_evidence_reference:evidence,p_reason:reason,p_attested:!!d.attested
      });
      if(S.recipeDetail!==d)return;
      if(!result||result.stock_changed!==false||result.recipe_approved!==false)
        throw new Error('Respons server tidak sesuai kontrak review-only.');
      d.notice='Review tersimpan ('+String(result.review_id||'').slice(0,8)+'). Tidak ada perubahan stok atau status resep.';
    }catch(e){
      if(S.recipeDetail!==d)return;
      d.notice='Gagal menyimpan: '+(e&&e.message?e.message:String(e));
    }finally{
      if(S.recipeDetail===d){d.saving=false;render();}
    }
  }

  function renderSalesStockAudit(){
    if(!S.period)return '';
    var a=S.salesLinkAudit;
    if(!a){
      return S.salesLinkAuditUnavailable?
        '<div class="sc16-sales-status sc16-sales-pending" role="status">'+
        '<b>Penjualan → Stok</b><span>Audit belum tersedia; stok tidak diubah.</span></div>':'';
    }
    var total=num(a.sale_item_rows),linked=num(a.linked_sale_item_rows);
    var missing=num(a.unlinked_sale_item_rows),ready=num(a.eligible_verified_rows);
    var warn=total>0&&(missing>0||ready<total);
    var label=total?fmt(linked)+' / '+fmt(total)+' detail item tertaut'+
      (warn?' · '+fmt(missing)+' belum tertaut':''):'Belum ada detail penjualan';
    var tip='Detail '+fmt(total)+'; tertaut '+fmt(linked)+
      '; resep siap posting '+fmt(ready)+
      '; tanpa resep '+fmt(a.no_recipe_rows)+
      '; komponen belum valid '+fmt(a.unverified_components_rows)+
      '. Satu detail penjualan bisa memakai beberapa bahan.';
    return '<div class="sc16-sales-status'+(warn?' sc16-sales-pending':' sc16-sales-ok')+
      '" title="'+esc(tip)+'" role="status"><b>Penjualan → Stok</b>'+
      '<span>'+esc(label)+'</span></div>';
  }

  function renderLedgerAudit() {
    var a=S.ledgerAudit || {};
    if(a.state==='loading')return '';
    if(a.state==='unavailable')return '<div class="sc4-backend-integrity warn" role="status"><b>Audit kesesuaian saldo belum dapat dibaca</b><span>Infografis berasal dari server, tetapi keselarasan view rekonsiliasi dengan ledger belum diverifikasi. Coba Refresh.</span></div>';
    if(!a.count)return '<div class="sc4-backend-integrity ok" role="status"><b>Saldo dua sumber server cocok</b><span>'+fmt(a.tracked)+' SKU dengan opname telah dibandingkan dengan ledger. Pemeriksaan '+esc(S.lastVerifiedAt||'')+'.</span></div>';
    var examples=a.items.slice(0,3).map(function(x){return esc(x.name)+' ('+esc(fmt(x.reconcile))+' / '+esc(x.ledger==null?'belum ada':fmt(x.ledger))+' '+esc(x.unit||'unit')+')'}).join(' · ');
    return '<div class="sc4-backend-integrity warn" role="alert"><div><b>'+fmt(a.count)+' SKU tidak sama antara rekonsiliasi dan ledger</b><span>Angka pertama = view rekonsiliasi, angka kedua = ledger. Contoh: '+examples+'. Tidak ada saldo yang diubah otomatis.</span></div><button type="button" data-sc4-audit="open">Periksa SKU →</button></div>';
  }

  async function refreshCommittedData(){
    if(!active()){S.pendingStockRefresh=true;return}
    if(S.verifiedRefreshing || S.baseLoading || S.periodLoading || S.ledgerLoading){
      S.pendingStockRefresh=true;return;
    }
    var h=document.getElementById('stok'),sync=window.__HASNARIA_DATA_SYNC;
    if(sync && !sync.canRefresh(h,'#sc4Period,#sc3Search,#sc3Category,#sc3Status')){
      S.pendingStockRefresh=true;return;
    }
    if(window.__HASNARIA_STOCK_UPLOAD_V1&&window.__HASNARIA_STOCK_UPLOAD_V1.active()){
      S.pendingStockRefresh=true;return;
    }
    S.verifiedRefreshing=true;S.pendingStockRefresh=false;
    try{
      await Promise.all([loadBase(),loadPeriodData(true)]);
      await loadVerifiedValuation(true);
      if(S.modal==='ledger')await loadLedger();
    }finally{
      S.verifiedRefreshing=false;
      // A second committed write may arrive during the first reload. Do not lose it.
      // Keep deferred updates waiting if a user is editing a form.
      if(S.pendingStockRefresh && active() && !S.correction &&
         !(window.__HASNARIA_STOCK_UPLOAD_V1&&window.__HASNARIA_STOCK_UPLOAD_V1.active())){
        setTimeout(function(){if(S.pendingStockRefresh)refreshCommittedData()},0);
      }
    }
  }

  async function loadBase() {
    if (S.baseLoading) return;
    var seq = ++S.loadSeq;
    S.baseLoading = true;
    S.error = '';
    S.auxError = '';
    if(!S.baseLoaded){S.auxLoaded = false;S.auxLoading = false;}
    render();

    try {
      var baseQuery = qs({
        brand_id: 'eq.' + BRAND,
        select: 'inventory_item_id,item_name,category,unit,min_qty,order_qty,purchase_qty,sales_usage_qty,system_qty,last_opname_date,last_physical_qty,last_variance,tracking_active,status',
        order: 'category.asc,item_name.asc'
      });
      var rows = await request('inventory_stock_reconciliation?' + baseQuery);
      if (seq !== S.loadSeq) return;
      S.raw = rows || [];
      // The independent ledger audit is not part of the first dashboard paint.
      // Do not delay the real stock balances on a second database query.
      var auditSeq=seq;
      var auditRun=function(){
        if(auditSeq!==S.loadSeq)return;
        loadVerifiedAudit(rows).then(function(audit){
          if(auditSeq!==S.loadSeq)return;
          S.ledgerAudit=audit;
        });
      };
      if(window.requestIdleCallback)window.requestIdleCallback(auditRun,{timeout:1800});
      else setTimeout(auditRun,200);
      S.lastVerifiedAt = new Date().toLocaleString('id-ID');
      S.items = S.raw.map(baseItem);
      S.baseLoaded = true;
    } catch (e) {
      if (seq !== S.loadSeq) return;
      S.error = e && e.message ? e.message : String(e);
    } finally {
      if (seq === S.loadSeq) {
        S.baseLoading = false;
        render();
        if (S.baseLoaded) {
          // Defer rarely used PO/BOM detail; the main two charts do not need it.
          if(!S.auxLoaded&&!S.auxLoading&&S.modal==='position')scheduleAux(seq);
          if(!S.valuationLoaded&&!S.valuationLoading)loadVerifiedValuation();
        }
        schedulePendingCommittedRefresh();
      }
    }
  }

  // Data-change events may arrive while initial Stock reads are in-flight.
  // Replay one deferred refresh once BOTH base and period reads are idle.
  function schedulePendingCommittedRefresh(){
    if(!S.pendingStockRefresh||S.verifiedRefreshing||S.baseLoading||S.periodLoading||S.ledgerLoading)return;
    setTimeout(function(){
      if(S.pendingStockRefresh && !S.verifiedRefreshing && !S.baseLoading &&
         !S.periodLoading && !S.ledgerLoading && active() && !S.correction &&
         !(window.__HASNARIA_STOCK_UPLOAD_V1&&window.__HASNARIA_STOCK_UPLOAD_V1.active())){
        refreshCommittedData();
      }
    },0);
  }

  async function loadPeriodData(force) {
    if (S.periodLoading && !force) return;
    var seq = ++S.periodSeq;
    S.periodLoading = true;
    S.periodError = '';
    if(!S.firstPeriodLoaded)render();
    try {
      if (!S.periods.length || force) {
        var ps = await rpc('get_ui_period_catalog_fast_v1', { p_brand: BRAND, p_module: 'stok' });
        if (seq !== S.periodSeq) return;
        S.periods = ps || [];
        if (!S.period || !S.periods.some(function (x) { return monthKey(x.period_start || x.period_key) === S.period; })) {
          S.period = S.periods.length ? monthKey(S.periods[0].period_start || S.periods[0].period_key) : '';
        }
      }
      if (!S.period) {
        await loadPendingUploads(seq);
        S.overview = null;
        S.activity = [];
        S.trend = [];
        S.monthEndRows = [];
        S.monthEndUnavailable = false;
        S.salesLinkAudit = null;
        S.salesLinkAuditUnavailable = false;
        S.purchaseImportEvidence = null;
        S.purchaseImportEvidenceUnavailable = false;
        ++S.integrationSeq;S.integrationAudit=null;S.integrationPeriod='';S.integrationError='';S.integrationLoading=false;
        ++S.recipeReviewSeq;
        S.recipeReviewLoaded = false;
        S.recipeReviewRows = [];
        S.recipeReviewError = '';
        S.recipeDetail = null;
        S.recipeSearch = '';
        S.recipeFilter = 'all';
        S.recipePage = 1;
        ++S.combinedSeq;
        S.combinedOpen = false;
        S.combinedRows = [];
        S.combinedLoaded = false;
        S.movingRows = [];
        S.movingLoaded = false;
        return;
      }
      var month = S.period + '-01';
      var y=Number(S.period.slice(0,4)),m=Number(S.period.slice(5,7))-1;
      var fromMonth=new Date(Date.UTC(y,m-9,1)).toISOString().slice(0,10);
      var tq=qs({brand_id:'eq.'+BRAND,period_month:'gte.'+fromMonth,
        select:'period_month,unit,total_unit_skus,checkpoint_skus,recorded_end_qty,period_movement_rows,unlinked_sale_rows,data_status',order:'period_month.asc',limit:'200'})+
        '&period_month=lte.'+month;
      // First paint only waits for the actual monthly stock-end series.
      // Previously six unrelated requests (status/upload/activities/import)
      // blocked this chart even though their cards were removed from the UI.
      var trendRows=await request('ui_stock_month_end_trend_v1?' + tq);
      if(seq!==S.periodSeq)return;
      S.monthEndRows=Array.isArray(trendRows)?trendRows:[];
      S.monthEndUnavailable=false;
      S.trend=[];
      S.firstPeriodLoaded=true;
      // These operational sources belong to detail/actions, not dashboard
      // first paint. Retain lazy, read-only access when those panels are used.
      S.salesLinkAuditUnavailable=false;
      S.purchaseImportEvidenceUnavailable=false;
      // Moving FIFO is not visible on the current two-panel dashboard.
    } catch (e) {
      if (seq !== S.periodSeq) return;
      S.periodError = e && e.message ? e.message : String(e);
      S.overview = null;
      S.activity = [];
      S.trend = [];
        S.monthEndRows = [];
        S.monthEndUnavailable = false;
        S.salesLinkAudit = null;
        S.salesLinkAuditUnavailable = false;
        S.purchaseImportEvidence = null;
        S.purchaseImportEvidenceUnavailable = false;
    } finally {
      if (seq === S.periodSeq) {
        S.periodLoading = false;
        S.firstPeriodLoaded=true;
        render();
        schedulePendingCommittedRefresh();
      }
    }
  }

  async function loadLedger() {
    if (!S.period || S.ledgerLoading) return;
    var seq = ++S.ledgerSeq, period = S.period;
    S.ledgerLoading = true;
    S.ledgerError = '';
    S.ledger = [];
    S.ledgerPage = 1;
    render();
    try {
      var out = await readLedger(period);
      if (seq !== S.ledgerSeq || period !== S.period) return;
      S.ledger = out;
    } catch (e) {
      if (seq !== S.ledgerSeq || period !== S.period) return;
      S.ledgerError = e && e.message ? e.message : String(e);
    } finally {
      if (seq === S.ledgerSeq) {
        S.ledgerLoading = false;
        if (period === S.period) render();
      }
    }
  }

  async function readLedger(period) {
    var out = [], offset = 0, limit = 500;
    while (offset < 5000) {
      var q = qs({
        brand_id: 'eq.' + BRAND, period_month: 'eq.' + period + '-01',
        select: 'movement_id,inventory_item_id,sku_code,sku_name,base_unit,movement_date,ledger_type,source_movement_type,qty_delta,unit_cost,reference_type,reference_id,system_generated,notes',
        order: 'movement_date.desc', limit: String(limit), offset: String(offset)
      });
      var part = await request('ui_stock_detail_v1?' + q);
      out = out.concat(part || []);
      if (!part || part.length < limit) break;
      offset += limit;
    }
    return out;
  }

  function syncContext() {
    return JSON.stringify([S.loadSeq, S.periodSeq, S.ledgerSeq, S.viewSeq, S.period, S.modal,
      S.search, S.category, S.status, S.page, S.ledgerPage, window.__HASNARIA_CONTEXT || null]);
  }

  function canSync() {
    if (S.correction || (window.__HASNARIA_STOCK_UPLOAD_V1&&window.__HASNARIA_STOCK_UPLOAD_V1.active())) return false; // Never overwrite a draft form.
    var host = document.getElementById('stok'), sync = window.__HASNARIA_DATA_SYNC;
    if (!sync || !active() || !S.baseLoaded || S.baseLoading || S.auxLoading || S.periodLoading || S.ledgerLoading) return false;
    var focused = document.activeElement;
    if (focused && host.contains(focused) && focused.matches('input,textarea,select')) return false;
    return sync.canRefresh(host, '#sc4Period,#sc3Search,#sc3Category,#sc3Status');
  }

  // Freshness reads never post/rebuild inventory or replace an in-progress view.
  async function syncRefresh() {
    if (!canSync()) return;
    var seq = ++S.syncSeq, context = syncContext(), period = S.period, modal = S.modal;
    try {
      var baseQuery = qs({brand_id: 'eq.' + BRAND,
        select: 'inventory_item_id,item_name,category,unit,min_qty,order_qty,purchase_qty,sales_usage_qty,system_qty,last_opname_date,last_physical_qty,last_variance,tracking_active,status',
        order: 'category.asc,item_name.asc'});
      var reads = [
        request('inventory_stock_reconciliation?' + baseQuery),
        rpc('get_ui_period_catalog_fast_v1', { p_brand: BRAND, p_module: 'stok' })
      ];
      if (period) {
        reads.push(request('ui_stock_overview_v1?' + qs({brand_id: 'eq.' + BRAND, period_month: 'eq.' + period + '-01', select: '*', limit: '1'})));
        reads.push(request('ui_stock_activity_chart_v1?' + qs({brand_id: 'eq.' + BRAND, period_month: 'eq.' + period + '-01', select: 'movement_type,movement_rows,sku_count', order: 'movement_rows.desc'})));
      }
      if (modal === 'ledger' && period) reads.push(readLedger(period));
      // Recheck audited upload drafts on every cross-tab/data-change notification.
      // Append this read LAST to preserve the existing detail/overview indices.
      var pendingIndex=reads.length;
      // The upload-status panel is OPTIONAL. Failure to read operational_runs must
      // never prevent the authoritative Stock and infographic snapshots refreshing.
      reads.push(isOwner()?readPendingUploads().catch(function(){return null}):Promise.resolve(S.pendingUploadRuns));
      var result = await Promise.all(reads);
      if (seq !== S.syncSeq || context !== syncContext() || !canSync()) return;
      var raw = result[0] || [], audit = await loadVerifiedAudit(raw);
      if (seq !== S.syncSeq || context !== syncContext() || !canSync()) return;
      var trackedIds = raw.filter(function (x) { return !!x.tracking_active; }).map(function (x) { return x.inventory_item_id; });
      var recipes = [], poRows = [], receipts = [];
      if (trackedIds.length) {
        var trackedSet = {};
        trackedIds.forEach(function (id) { trackedSet[id] = true; });
        var aux = await Promise.all([
          loadRecipes(trackedIds),
          request('purchase_order_items?' + qs({select: 'id,inventory_item_id,ordered_qty,purchase_orders!inner(brand_id,status)',
            'purchase_orders.brand_id': 'eq.' + BRAND, 'purchase_orders.status': 'in.(issued,partially_received)', limit: '1000'}))
        ]);
        recipes = aux[0] || [];
        poRows = (aux[1] || []).filter(function (row) { return !!trackedSet[row.inventory_item_id]; });
        if (poRows.length) receipts = await loadReceipts(poRows.map(function (row) { return row.id; }));
      }
      if (seq !== S.syncSeq || context !== syncContext() || !canSync()) return;
      var items = supplementalItems(raw, recipes, poRows, receipts);
      var overview = period && result[2] && result[2][0] ? result[2][0] : null;
      var activity = period ? result[3] || [] : [];
      var ledger = modal === 'ledger' && period ? result[4] || [] : S.ledger;
      var periods = result[1] || [];
      if (period && !periods.some(function (x) { return monthKey(x.period_start || x.period_key) === period; })) {
        var selected = S.periods.find(function (x) { return monthKey(x.period_start || x.period_key) === period; });
        periods = periods.concat([selected || { period_start: period + '-01' }]);
      }
      var pendingUploads=result[pendingIndex];
      if(pendingUploads===null)pendingUploads=S.pendingUploadRuns; // Keep last verified status when optional read fails.
      var next = [raw, items, periods, overview, activity, ledger, audit, pendingUploads, true, '', '', '', modal === 'ledger' ? '' : S.ledgerError];
      var current = [S.raw, S.items, S.periods, S.overview, S.activity, S.ledger, S.ledgerAudit, S.pendingUploadRuns, S.auxLoaded, S.error, S.auxError, S.periodError, S.ledgerError];
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      S.raw = raw; S.items = items; S.periods = periods;
      S.ledgerAudit = audit;
      S.pendingUploadRuns = pendingUploads;
      S.lastVerifiedAt = new Date().toLocaleString('id-ID');
      S.overview = overview; S.activity = activity; S.ledger = ledger;
      S.auxLoaded = true; S.error = ''; S.auxError = ''; S.periodError = '';
      if (modal === 'ledger') S.ledgerError = '';
      render();
    } catch (_) {
      // Keep the last successful snapshot; the next visible signal retries.
    }
  }

  function registerSync() {
    if (window.__HASNARIA_DATA_SYNC) window.__HASNARIA_DATA_SYNC.register('stock-control-v3', syncRefresh);
  }

  function statusLabel(status) {
    if (status === 'critical') return 'Kritis / Habis';
    if (status === 'order') return 'Perlu Beli';
    if (status === 'incoming') return 'Dalam Pesanan';
    if (status === 'untracked') return 'Perlu Opname Awal';
    return 'Aman';
  }

  function chip(status) {
    return '<span class="sc3-chip sc3-' + esc(status || 'ok') + '">' + esc(statusLabel(status)) + '</span>';
  }

  function varianceHtml(value) {
    if (value === null || value === undefined || value === '') return '<span class="sc3-muted">-</span>';
    var n = Number(value);
    var cls = n < 0 ? 'sc3-neg' : n > 0 ? 'sc3-pos' : 'sc3-zero';
    return '<span class="' + cls + '">' + signed(n) + '</span>';
  }

  function categoryOptions() {
    var seen = {}, out = [];
    S.items.forEach(function (x) {
      var c = String(x.category || 'Lainnya');
      if (!seen[c]) { seen[c] = true; out.push(c); }
    });
    out.sort(function (a, b) { return a.localeCompare(b, 'id'); });
    return '<option value="">Semua Kategori</option>' + out.map(function (c) {
      return '<option value="' + esc(c) + '"' + (S.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function filteredItems() {
    var q = S.search.trim().toLowerCase();
    var rows = S.items.filter(function (x) {
      if (S.category && String(x.category || 'Lainnya') !== S.category) return false;
      if (S.status === 'ledger-diff') {
        if(!(S.ledgerAudit&&S.ledgerAudit.items.some(function(i){return i.id===x.inventory_item_id;})))return false;
      } else if (S.status === 'diff') {
        if (!(x.last_variance !== null && x.last_variance !== undefined && Math.abs(num(x.last_variance)) > 0.00001)) return false;
      } else if (S.status && x.ui_status !== S.status) return false;
      if (q && (String(x.item_name || '') + ' ' + String(x.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var rank = { critical: 0, order: 1, incoming: 2, untracked: 3, ok: 4 };
    rows.sort(function (a, b) {
      var ra = rank[a.ui_status] == null ? 9 : rank[a.ui_status];
      var rb = rank[b.ui_status] == null ? 9 : rank[b.ui_status];
      if (ra !== rb) return ra - rb;
      return String(a.item_name || '').localeCompare(String(b.item_name || ''), 'id');
    });
    return rows;
  }

  function kpis() {
    var out = { tracked: 0, untracked: 0, need: 0, critical: 0, incoming: 0 };
    S.items.forEach(function (x) {
      if (x.ui_status === 'untracked') out.untracked++;
      else out.tracked++;
      if (x.ui_status === 'order') out.need++;
      if (x.ui_status === 'critical') out.critical++;
      if (x.ui_status === 'incoming') out.incoming++;
    });
    return out;
  }


  // Corrections are explicit new physical checkpoints, never backdated edits to Excel.
  function takeCorrectionRequest() {
    if (!isOwner()) return;
    var req = window.__HASNARIA_STOCK_CORRECTION_PENDING;
    if (!req) return;
    delete window.__HASNARIA_STOCK_CORRECTION_PENDING;
    S.correction = { id: String(req.inventoryItemId || ''), physical: '', reason: '', busy: false, error: '' };
    S.correctionNotice = '';
    S.modal = '';
  }

  function renderCorrectionPanel() {
    if (!isOwner()) return '';
    if (!S.correction) return S.correctionNotice ?
      '<div class="sc4-correction-note" role="status">' + esc(S.correctionNotice) + '</div>' : '';
    var c = S.correction, item = S.items.find(function(x){return x.inventory_item_id === c.id;});
    var found = !!item, missing = S.baseLoaded && !found, quantity = String(c.physical || '');
    var number = quantity.trim() === '' ? NaN : Number(quantity.replace(',', '.'));
    var valid = Number.isFinite(number) && number >= 0;
    var preview = found && valid ? '<strong>Selisih jika disimpan: ' + esc(signed(number - num(item.system_qty))) +
      ' ' + esc(item.unit || 'unit') + '</strong>' : 'Masukkan jumlah fisik terbaru untuk melihat selisih.';
    return '<div class="sc4-modal-backdrop"><section class="sc4-correction-panel" role="dialog" aria-modal="true" aria-labelledby="sc4CorrectionTitle">' +
      '<div class="sc4-correction-title"><div><small>REKONSILIASI · VERIFIKASI OWNER</small><h3 id="sc4CorrectionTitle">Entry Koreksi Stok</h3>' +
      '<p>Selisih historis perlu ditelusuri dahulu. Entri ini menyimpan hasil hitung fisik TERBARU, bukan menimpa saldo bulan sebelumnya.</p></div>' +
      '<button type="button" data-sc4-correction="cancel">Tutup</button></div>' +
      (c.error ? '<p class="sc3-alert" role="alert">' + esc(c.error) + '</p>' : '') +
      (missing ? '<p class="sc3-alert">SKU yang dirujuk tidak ditemukan dalam stok brand aktif. Periksa mapping sebelum koreksi.</p>' : '') +
      (!S.baseLoaded ? '<p>Memuat referensi SKU dari server…</p>' :
        '<div class="sc4-correction-fields"><div><label>Material</label><strong>' + esc(item ? item.item_name : 'Tidak ditemukan') +
          '</strong><small>' + esc(item ? (item.category || 'Lainnya') + ' · ' + (item.unit || 'unit') : '') + '</small></div>' +
        '<div><label>Saldo sistem saat ini</label><strong>' + (found ? esc(fmt(item.system_qty)) : '—') + '</strong>' +
          '<small>Selisih opname sebelumnya: ' + (found && item.last_variance != null ? esc(signed(item.last_variance)) : '—') + '</small></div>' +
        '<label>Hasil hitung fisik hari ini<input id="sc4CorrectionPhysical" type="number" min="0" step="any" inputmode="decimal" ' +
          'value="' + esc(quantity) + '" placeholder="Jumlah fisik aktual" ' + (c.busy ? 'disabled' : '') + '></label>' +
        '<label>Alasan dan bukti koreksi<textarea id="sc4CorrectionReason" rows="2" maxlength="500" placeholder="Sumber selisih, hasil cek fisik, bukti..." ' +
          (c.busy ? 'disabled' : '') + '>' + esc(c.reason) + '</textarea></label></div>') +
      '<div class="sc4-correction-actions"><span id="sc4CorrectionPreview">' + preview + '</span>' +
      '<button type="button" data-sc4-correction="save" ' + (!found || c.busy ? 'disabled' : '') + '>' +
      (c.busy ? 'Menyimpan…' : 'Konfirmasi & Simpan Opname Baru') + '</button></div>' +
      '<p class="sc4-correction-footnote">Tanggal otomatis hari ini. Entri baru memiliki audit trail. Jika ingin mengoreksi arsip September/Oktober, verifikasi dokumen sumber terlebih dahulu; jangan gunakan angka historis sebagai hasil hitung fisik hari ini.</p></section></div>';
  }

  async function saveCorrection() {
    var c = S.correction;
    if (!isOwner() || !c || c.busy) return;
    var item = S.items.find(function(x){return x.inventory_item_id === c.id;});
    var qty = Number(String(c.physical).trim().replace(',', '.'));
    var reason = String(c.reason || '').trim();
    if (!item) { c.error = 'Material belum ditemukan di master Stok.'; render(); return; }
    if (String(c.physical).trim() === '' || !Number.isFinite(qty) || qty < 0) {
      c.error = 'Masukkan hasil hitung fisik yang valid (minimal 0).'; render(); return;
    }
    if (reason.length < 12) { c.error = 'Tuliskan alasan dan bukti koreksi minimal 12 karakter.'; render(); return; }
    if(previewUsesProductionDatabase()){c.error='Preview memakai database produksi. Koreksi fisik diblokir sampai staging terisolasi siap.';render();return;}
    c.busy = true; c.error = ''; render();
    try {
      // RPC posts from the canonical inventory ledger, so the visible snapshot must agree first.
      var latest = await request('inventory_ledger_balance?' + qs({
        brand_id: 'eq.' + BRAND, inventory_item_id: 'eq.' + c.id, select: 'ledger_qty', limit: '1'
      }));
      if (!latest.length || Math.abs(num(latest[0].ledger_qty) - num(item.system_qty)) > 0.00001) {
        throw new Error('Saldo ledger dan dashboard belum cocok. Refresh Stok dan rekonsiliasi sumber terlebih dahulu. Tidak ada koreksi disimpan.');
      }
      if (!window.confirm('Simpan hasil hitung fisik terbaru untuk ' + item.item_name +
        '? Saldo sistem: ' + fmt(item.system_qty) + ' ' + (item.unit || '') +
        ', fisik: ' + fmt(qty) + ', selisih: ' + signed(qty - num(item.system_qty)) +
        '. Tindakan membuat checkpoint baru dan audit trail, bukan mengubah arsip Excel.')) return;
      await rpc('resolve_physical_stock_opname', {
        p_inventory_item_id: c.id, p_physical_qty: qty, p_opname_date: today(),
        p_reason: '[Review selisih stok] ' + reason
      });
      S.correction = null;
      S.correctionNotice = 'Stock opname koreksi tersimpan dengan audit trail. Periksa saldo dan riwayat terbaru.';
      window.__HASNARIA_STOCK_NOTIFICATION_REFRESH_NEEDED = true;
      await loadBase();
      return;
    } catch (e) {
      c.error = e && e.message ? e.message : String(e);
    } finally {
      if (S.correction === c) { c.busy = false; render(); }
    }
  }

  function renderHeader() {
    var options=(S.periods||[]).map(function(x){
      var k=monthKey(x.period_start||x.period_key);
      return '<option value="'+esc(k)+'"'+(k===S.period?' selected':'')+'>'+esc(monthLabel(k))+'</option>';
    }).join('');
    // Tahap 1: one compact toolbar. Existing actions keep their
    // original identifiers to preserve upload, ledger and opname routing.
    return '<header class="sc5-head sc7-head"><div class="sc5-head-copy"><span class="sc5-eyebrow">STOK</span>'+
      '<h2>Dashboard Stok</h2><p>Persediaan &amp; aktivitas terkini</p></div>'+
      '<div class="sc5-head-right sc7-head-right">'+
      '<div class="sc5-head-buttons sc7-actions">'+
        (isOwner()?'<button type="button" class="sc5-primary" data-sc4-action="upload-opname">⇧ Upload Excel Stok</button>':'')+
        '<button type="button" class="sc5-secondary" data-sc4-modal="position" aria-haspopup="dialog">▣ Detail Stok</button>'+
        (isOwner()?'<button type="button" class="sc5-secondary" data-sc4-action="opname">＋ Input Opname</button>':'')+
      '</div></div></header><div class="sc5-head-filters sc7-tools sc23-period-row">'+
        '<label><span>Bulan</span><select id="sc4Period" data-month-filter="stok">'+options+'</select></label>'+
        '<button type="button" class="sc5-text-btn" data-sc4-modal="ledger" aria-haspopup="dialog">Ledger Periode</button>'+ 
        (isOwner()?'<button type="button" class="sc5-text-btn" data-sc4-modal="recipes" aria-haspopup="dialog">Cek Resep Produk</button>':'')+
        (isOwner()?'<button type="button" class="sc5-text-btn" data-sc4-modal="formula-audit" aria-haspopup="dialog">Periksa Hitungan</button>':'')+
        (isOwner()?'<button type="button" class="sc5-text-btn" data-sc4-action="upload-purchase">Upload Pembelian</button>':'')+
        '<button type="button" class="sc5-refresh" data-sc3-action="refresh" aria-label="Refresh data Stok">↻</button>'+
      '</div>';
  }

  function renderFormula() {
    return '<div class="sc3-formula">' +
      '<div><span>CHECKPOINT</span><strong>Stok Opname</strong><small>input dari interface operasional</small></div><b>+</b>' +
      '<div><span>MASUK</span><strong>Pembelian</strong><small>setelah opname terakhir</small></div><b>−</b>' +
      '<div><span>KELUAR</span><strong>Pemakaian</strong><small>penjualan × BOM</small></div><b>=</b>' +
      '<div class="sc3-formula-result"><span>POSISI TERKINI</span><strong>Saldo</strong><small>single current stock position</small></div>' +
      '<div class="sc3-formula-note">Incoming PO dipantau terpisah dan belum menambah Saldo sampai barang diterima.</div>' +
    '</div>';
  }

  function renderAuxState() {
    if (!S.baseLoaded) return '';
    if (S.auxLoading) return '<div class="sc3-auxbar"><span class="sc3-pulse"></span><b>Data utama sudah tampil.</b> Melengkapi Incoming PO dan BOM tanpa menahan tabel.</div>';
    if (S.auxError) return '<div class="sc3-auxbar sc3-aux-warn"><b>Data utama tetap tersedia.</b> Incoming/BOM belum berhasil dilengkapi; gunakan Refresh untuk mencoba lagi.</div>';
    return '';
  }

  function renderFilters() {
    return '<div class="sc3-filters">' +
      '<input id="sc3Search" type="search" placeholder="Cari material..." value="' + esc(S.search) + '">' +
      '<select id="sc3Category">' + categoryOptions() + '</select>' +
      '<select id="sc3Status"><option value="">Semua Status</option>' +
        '<option value="critical"' + (S.status === 'critical' ? ' selected' : '') + '>Kritis / Habis</option>' +
        '<option value="order"' + (S.status === 'order' ? ' selected' : '') + '>Perlu Beli</option>' +
        '<option value="incoming"' + (S.status === 'incoming' ? ' selected' : '') + '>Dalam Pesanan</option>' +
        '<option value="untracked"' + (S.status === 'untracked' ? ' selected' : '') + '>Perlu Opname Awal</option>' +
        '<option value="ok"' + (S.status === 'ok' ? ' selected' : '') + '>Aman</option>' +
        '<option value="diff"' + (S.status === 'diff' ? ' selected' : '') + '>Ada Selisih Opname</option>' +
        '<option value="ledger-diff"' + (S.status === 'ledger-diff' ? ' selected' : '') + '>Beda Saldo Ledger</option>' +
      '</select>' +
      '<div class="sc3-filter-links"><button type="button" data-sc3-jump="pembelian">Buka Pembelian →</button><button type="button" data-sc3-jump="sales">Buka Penjualan →</button></div>' +
    '</div>';
  }

  function renderPager(count, pages) {
    if (pages <= 1) return '<div class="sc3-pager"><span>Menampilkan ' + count + ' item</span></div>';
    var buttons = [], from = Math.max(1, S.page - 2), to = Math.min(pages, S.page + 2);
    if (from > 1) buttons.push('<button type="button" data-sc3-page="1">1</button>');
    if (from > 2) buttons.push('<span>…</span>');
    for (var p = from; p <= to; p++) buttons.push('<button type="button" data-sc3-page="' + p + '" class="' + (p === S.page ? 'on' : '') + '">' + p + '</button>');
    if (to < pages - 1) buttons.push('<span>…</span>');
    if (to < pages) buttons.push('<button type="button" data-sc3-page="' + pages + '">' + pages + '</button>');
    return '<div class="sc3-pager"><span>Halaman ' + S.page + ' dari ' + pages + '</span><div>' + buttons.join('') + '</div></div>';
  }

  function opnameHtml(x) {
    if (!x.tracking_active) return '<span class="sc3-muted">Belum ada</span>';
    return '<strong>' + fmt(x.last_physical_qty) + '</strong><small>' + dateLabel(x.last_opname_date) + '</small>';
  }

  function coverHtml(x) {
    if (!S.auxLoaded) return '<span class="sc3-muted">…</span><small>BOM dimuat setelah tabel</small>';
    if (!x.demand_ready) return '<span class="sc3-muted">Belum BOM</span>';
    if (x.avg_usage === null || !(x.avg_usage > 0)) return '<span class="sc3-muted">-</span><small>0 pemakaian/hari</small>';
    return '<strong>' + fmt(x.days_cover) + ' hari</strong><small>avg ' + fmt(x.avg_usage) + '/hari</small>';
  }

  function renderTable() {
    var rows = filteredItems();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (S.page > pages) S.page = pages;
    var start = (S.page - 1) * PAGE_SIZE;
    var pageRows = rows.slice(start, start + PAGE_SIZE);
    var body = pageRows.map(function (x) {
      var balance = x.tracking_active ? '<strong>' + fmt(x.balance_qty) + '</strong><small>' + esc(x.unit || 'pcs') + '</small>' : '<span class="sc3-muted">-</span>';
      var need = !S.auxLoaded ? '<span class="sc3-muted">…</span>' : (x.suggested_order_qty === null ? '<span class="sc3-muted">-</span>' : (x.suggested_order_qty > 0 ? '<strong class="sc3-need">' + fmt(x.suggested_order_qty) + '</strong>' : '<span>0</span>'));
      var incoming = !S.auxLoaded ? '<span class="sc3-muted">…</span>' : (x.incoming_qty > 0 ? '<strong class="sc3-incoming">+' + fmt(x.incoming_qty) + '</strong>' : '<span class="sc3-muted">0</span>');
      return '<tr>' +
        '<td class="sc3-item"><strong>' + esc(x.item_name) + '</strong><small>' + esc(x.category || 'Lainnya') + ' · ' + esc(x.unit || 'pcs') + '</small></td>' +
        '<td class="sc3-num sc3-plus">+' + fmt(x.purchase_qty) + '</td>' +
        '<td class="sc3-num sc3-minus">-' + fmt(x.sales_usage_qty) + '</td>' +
        '<td class="sc3-num sc3-opname">' + opnameHtml(x) + '</td>' +
        '<td class="sc3-num">' + varianceHtml(x.last_variance) + '</td>' +
        '<td class="sc3-num">' + incoming + '</td>' +
        '<td class="sc3-num">' + fmt(x.min_qty) + '</td>' +
        '<td class="sc3-num">' + need + '</td>' +
        '<td class="sc3-num sc3-cover">' + coverHtml(x) + '</td>' +
        '<td>' + chip(x.ui_status) + '</td>' +
        '<td class="sc3-num sc3-balance">' + balance + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="sc3-table-card"><div class="sc3-table-head"><div><strong>Posisi Persediaan Terkini</strong><span>Data utama tampil lebih dulu; Incoming/BOM dilengkapi sesudahnya.</span></div><span>' + rows.length + ' item</span></div>' +
      '<div class="sc3-table-wrap"><table class="sc3-table"><thead><tr>' +
        '<th>Material</th><th>+ Pembelian</th><th>− Pemakaian</th><th>Stok Opname</th><th>Selisih</th><th>Incoming</th><th>Min/Par</th><th>Kebutuhan</th><th>Days Cover</th><th>Status</th><th class="sc3-balance-head">Saldo</th>' +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="11" class="sc3-empty">Tidak ada item sesuai filter.</td></tr>') + '</tbody></table></div>' + renderPager(rows.length, pages) + '</div>';
  }

  function renderNotes() {
    return '<div class="sc3-notes">' +
      '<article><span>AKURASI</span><strong>Saldo hanya aktif setelah opname awal</strong><p>Item tanpa opname awal tidak diberi saldo aktual agar angka opening lama tidak dianggap posisi fisik terkini.</p></article>' +
      '<article><span>KEBUTUHAN</span><strong>Incoming mengurangi kebutuhan beli</strong><p>PO issued dipantau sebagai incoming, tetapi baru menambah saldo setelah penerimaan barang.</p></article>' +
      '<article><span>PERFORMA</span><strong>Data utama tidak menunggu BOM</strong><p>Saldo, opname, pembelian dan pemakaian ditampilkan dulu agar Tab Stok tetap ringan. Upload Pembelian belum otomatis menambah stok sebelum penerimaan dibukukan.</p></article>' +
    '</div>';
  }


  // Current valuation is intentionally partial: only explicitly verified costs.
  // Never infer prices from raw purchase spending or unverified conversions.
  function stockMoney(v,compact){
    if(v===null||v===undefined||!Number.isFinite(Number(v)))return '—';
    var n=Number(v);
    if(compact&&Math.abs(n)>=1000000)return 'Rp '+(n/1000000).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';
    if(compact&&Math.abs(n)>=1000)return 'Rp '+(n/1000).toLocaleString('id-ID',{maximumFractionDigits:1})+' rb';
    return 'Rp '+n.toLocaleString('id-ID',{maximumFractionDigits:0});
  }
  async function loadVerifiedValuation(force){
    // Force invalidates an in-flight request so Refresh cannot retain stale cost coverage.
    if(S.valuationLoading&&!force)return;
    var seq=++S.valuationSeq;
    S.valuationLoading=true;
    if(force)S.valuationLoaded=false;
    S.valuationError='';
    try{
      var rs=await Promise.all([
        request('inventory_valuation_verified_summary?'+qs({brand_id:'eq.'+BRAND,select:'inventory_items,valued_items,cost_coverage_pct,inventory_value',limit:'1'})),
        request('inventory_verified_cost_current?'+qs({brand_id:'eq.'+BRAND,select:'inventory_item_id,unit_cost',limit:'500'}))
      ]);
      if(seq!==S.valuationSeq)return;
      S.valuation=rs[0]&&rs[0][0]?rs[0][0]:null;
      S.verifiedCosts=(rs[1]||[]).filter(function(x){
        return x.inventory_item_id&&Number.isFinite(Number(x.unit_cost))&&Number(x.unit_cost)>0;
      });
      S.valuationLoaded=true;
    }catch(e){
      if(seq!==S.valuationSeq)return;
      S.valuationError=e&&e.message?e.message:String(e);
      S.valuationLoaded=false;
      S.valuation=null;S.verifiedCosts=[];
    }finally{
      if(seq===S.valuationSeq){S.valuationLoading=false;render()}
    }
  }
  function verifiedValuationRows(){
    if(!S.baseLoaded||!S.valuationLoaded)return [];
    var byId={};
    (S.items||[]).forEach(function(x){byId[x.inventory_item_id]=x});
    return (S.verifiedCosts||[]).map(function(c){
      var item=byId[c.inventory_item_id];
      if(!item||!item.tracking_active)return null;
      var cost=Number(c.unit_cost),quantity=Math.max(0,num(item.system_qty));
      return {name:item.item_name||'SKU',category:item.category||'Lainnya',
        unit:item.unit||'unit',qty:quantity,value:Math.max(0,cost*quantity)};
    }).filter(function(x){return x&&x.value>0&&Number.isFinite(x.value)});
  }
  function stockValueByCategory(){
    if(S.valuationLoading||!S.baseLoaded)return '<div class="sc5-empty">Memuat nilai stok terverifikasi…</div>';
    if(!S.valuationLoaded||!S.valuation)return '<div class="sc5-empty">Data nilai stok belum dapat dimuat. Periksa koneksi dan lakukan Refresh.</div>';

    // A slice is ONLY a share of items with verified costs and positive stock.
    // Never substitute sample/mockup categories or present partial valuation as all stock.
    var verified=verifiedValuationRows(),groups=Object.create(null);
    var colors=['#076b49','#2aa46b','#76c95b','#a8e1ba'];
    verified.forEach(function(r){
      var key=String(r.category||'Lainnya').trim()||'Lainnya';
      if(!groups[key])groups[key]={name:key,value:0,sku:0};
      groups[key].value+=r.value;groups[key].sku++;
    });
    var parts=Object.keys(groups).map(function(key){return groups[key]})
      .sort(function(a,b){return b.value-a.value||a.name.localeCompare(b.name)});
    if(parts.length>4){
      var other=parts.slice(3).reduce(function(a,x){a.value+=x.value;a.sku+=x.sku;return a},
        {name:'Kategori lainnya',value:0,sku:0});
      parts=parts.slice(0,3).concat(other);
    }
    var total=parts.reduce(function(sum,x){return sum+x.value},0);
    var summary=S.valuation||{},valued=num(summary.valued_items);
    var denominator=num(summary.inventory_items)||S.items.length;
    var coverage=denominator?Math.min(100,Math.max(0,100*valued/denominator)):0;
    var fmtPercent=function(n){return Number(n).toLocaleString('id-ID',{maximumFractionDigits:1})};
    var share=function(value){return total>0?100*value/total:0};

    var chart='';
    if(total>0){
      // SVG circles have explicit geometry; CSS flex and aspect ratio cannot collapse
      // the sector to an invisible conic-gradient box. pathLength normalizes to 100%.
      var arcStart=0,arcs=[];
      parts.forEach(function(p,i){
        var pct=share(p.value),segmentStart=arcStart;
        // No seams for the single-category (100%) case.
        var visible=parts.length===1?100:Math.max(0,pct-.45);
        arcs.push('<circle class="sc13-donut-sector" cx="110" cy="110" r="78" pathLength="100" '+
          'fill="none" stroke="'+colors[i]+'" stroke-width="30" stroke-linecap="butt" '+
          'stroke-dasharray="'+visible.toFixed(3)+' '+(100-visible).toFixed(3)+'" '+
          'stroke-dashoffset="'+(-segmentStart).toFixed(3)+'" transform="rotate(-90 110 110)"></circle>');
        arcStart+=pct;
      });
      chart='<div class="sc13-donut-figure" role="img" aria-label="'+
        esc('Komposisi nilai terverifikasi '+parts.map(function(p){return p.name+' '+fmtPercent(share(p.value))+' persen'}).join(', '))+'">'+
        '<div class="sc13-donut-visual">'+
          '<svg class="sc13-donut-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220" aria-hidden="true" focusable="false">'+
            '<circle class="sc13-donut-base" cx="110" cy="110" r="78" fill="none" stroke="#e7f3eb" stroke-width="30"></circle>'+
            arcs.join('')+
            '<text class="sc13-donut-number" x="110" y="109" text-anchor="middle">'+
              esc(stockMoney(total,true))+'</text>'+
            '<text class="sc13-donut-label" x="110" y="127" text-anchor="middle">Nilai terverifikasi</text>'+
          '</svg>'+
        '</div>'+
        '<small>Komposisi nilai yang sudah terverifikasi</small>'+
      '</div>';
    }else{
      chart='<div class="sc13-donut-empty"><strong>Belum ada nilai terverifikasi</strong>'+
        '<small>Lengkapi biaya pokok dan saldo untuk menampilkan komposisi.</small></div>';
    }

    var legend=total>0?parts.map(function(p,i){
      return '<div class="sc13-legend-row" title="'+esc(p.name+' — '+stockMoney(p.value,false))+'">'+
        '<span class="sc13-legend-label"><i style="background:'+colors[i]+'"></i>'+
          '<b>'+esc(p.name)+'</b></span>'+
        '<span class="sc13-legend-percent">'+fmtPercent(share(p.value))+'%</span>'+
        '<strong class="sc13-legend-value">'+esc(stockMoney(p.value,true))+'</strong>'+
      '</div>';
    }).join(''):'<p class="sc13-legend-empty">Tidak ada kategori dengan saldo dan harga pokok terverifikasi.</p>';

    return '<div class="sc13-category-main">'+chart+
        '<div class="sc13-category-legend"><span class="sc13-legend-title">Nilai kategori dari '+fmt(valued)+' SKU dengan harga pokok</span>'+
          legend+'</div></div>'+
      '<div class="sc13-category-coverage">'+
        '<div class="sc13-coverage-text"><b>Cakupan harga pokok, bukan validasi fisik</b><span>'+
          fmt(valued)+' dari '+fmt(denominator)+' SKU · '+fmtPercent(coverage)+'%</span></div>'+
        '<div class="sc13-coverage-track" role="progressbar" aria-label="Cakupan harga pokok seluruh SKU" '+
          'aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+coverage.toFixed(1)+'">'+
          '<i style="width:'+coverage.toFixed(3)+'%"></i></div>'+
        '<p class="sc13-coverage-note">Valuasi parsial dari saldo ledger dan harga pokok yang tersedia; bukan total seluruh persediaan atau bukti stok fisik.</p>'+
      '</div>';
  }
  function lowestStockFive(){
    if(!S.baseLoaded)return '<div class="sc5-empty">Memuat saldo SKU terpantau…</div>';
    // Don't rank 157 SKUs with no opening opname: their missing balance isn't zero.
    // Show the signed ledger balance, even if negative, rather than clamping it.
    var monitored=(S.items||[]).filter(function(x){
      return !!x.tracking_active && x.system_qty!==null && x.system_qty!==undefined &&
        x.system_qty!=='' && Number.isFinite(Number(x.system_qty));
    });
    // Mixed units (gram/pcs/porsi) cannot be ranked by raw numeric quantity.
    // Select by risk status first; use numeric ordering ONLY within the same unit.
    function rank(x){
      var q=Number(x.system_qty),min=Math.max(0,num(x.min_qty));
      return q<0?0:q===0?1:min>0&&q<min?2:3;
    }
    var lowest=monitored.slice().sort(function(a,b){
      var ra=rank(a),rb=rank(b);
      if(ra!==rb)return ra-rb;
      if(String(a.unit||'')===String(b.unit||'')){
        var diff=Number(a.system_qty)-Number(b.system_qty);
        if(diff)return diff;
      }
      return String(a.item_name||'').localeCompare(String(b.item_name||''),'id');
    }).slice(0,5);
    if(!lowest.length)return '<div class="sc14-low-empty"><strong>Belum ada saldo SKU yang terpantau</strong>'+
      '<span>Masukkan opname awal agar item dapat diranking berdasarkan stoknya.</span></div>';
    return '<div class="sc14-low-wrap" aria-label="Lima SKU dengan saldo terpantau paling rendah">'+
      '<div class="sc14-low-summary"><span>Prioritas risiko; satuan berbeda tidak dibandingkan</span>'+
        '<strong>'+fmt(lowest.length)+' dari '+fmt(monitored.length)+' SKU</strong></div>'+
      '<div class="sc14-low-list">'+lowest.map(function(x,i){
        var qty=Number(x.system_qty),minimum=Math.max(0,num(x.min_qty));
        var negative=qty<0,zero=qty===0,low=minimum>0&&qty<minimum;
        var state=negative?'negative':zero?'zero':low?'reorder':'normal';
        var tag=negative?'Saldo negatif':zero?'Stok habis':low?'Perlu beli':'Terpantau';
        // Bar represents stock status relative to the SKU's own minimum threshold,
        // not an invalid comparison across grams / portions / pieces.
        var width=negative||zero?100:minimum>0?Math.max(3,Math.min(100,qty/minimum*100)):100;
        var qtyLabel=fmt(qty)+' '+String(x.unit||'unit');
        return '<div class="sc14-low-item sc14-low-'+state+'" title="'+esc(
          String(x.item_name||'SKU')+' · '+qtyLabel+' · '+tag
        )+'">'+
          '<div class="sc14-low-row">'+
            '<span class="sc14-low-rank">'+(i+1)+'</span>'+
            '<div class="sc14-low-title"><strong>'+esc(x.item_name||'SKU')+'</strong>'+
              '<small>'+esc(x.category||'Tanpa kategori')+' · '+tag+'</small></div>'+
            '<b class="sc14-low-quantity">'+esc(qtyLabel)+'</b>'+
          '</div>'+
          '<div class="sc14-low-track" role="img" aria-label="'+esc(
            tag+'; saldo '+qtyLabel+(minimum>0?', minimum '+fmt(minimum):'')
          )+'"><i style="width:'+width.toFixed(1)+'%"></i></div>'+
        '</div>';
      }).join('')+'</div>'+
      '<p class="sc14-low-note">Saldo berdasarkan ledger; satuan antar-SKU berbeda. Nilai negatif perlu direkonsiliasi.</p>'+
    '</div>';
  }
  function stockMovingPanel(){
    if(!S.period)return '<div class="sc15-moving-empty">Pilih bulan untuk menghitung perputaran stok.</div>';
    if(S.movingLoading&&!S.movingLoaded)return '<div class="sc15-moving-empty">Menghitung batch pembelian dan pengeluaran stok (FIFO)…</div>';
    if(S.movingError)return '<div class="sc15-moving-error"><strong>Data moving belum dapat dimuat</strong>'+
      '<small>'+esc(S.movingError)+'</small></div>';
    if(!S.movingLoaded)return '<div class="sc15-moving-empty">Memuat perputaran stok terverifikasi…</div>';

    // When a month has sales but zero linked sale-item inventory movements,
    // historical FIFO estimates cannot be presented as its current moving data.
    var saleAudit=S.salesLinkAudit;
    if(saleAudit&&num(saleAudit.sale_item_rows)>0&&num(saleAudit.linked_sale_item_rows)===0){
      return '<div class="sc15-moving-empty"><strong>Belum dapat dihitung untuk '+esc(monthLabel(S.period))+'</strong>'+
        '<small>'+fmt(saleAudit.unlinked_sale_item_rows)+' baris penjualan belum terhubung ke pemakaian stok. '+
        'Angka perputaran periode sebelumnya tidak dipakai sebagai angka bulan ini.</small></div>';
    }
    var rows=S.movingRows||[],groups={fast:0,normal:0,slow:0,unknown:0,untracked:0};
    var latest='';
    rows.forEach(function(r){
      var k=String(r.moving_status||'unknown');
      if(!(k in groups))k='unknown';
      groups[k]++;
      if(r.latest_sale_date&&String(r.latest_sale_date)>latest)latest=String(r.latest_sale_date);
    });
    var total=rows.length,unknown=groups.unknown+groups.untracked;
    var types=[
      {kind:'fast',name:'Fast Moving',days:'Batch habis dalam 0–7 hari',icon:'↗'},
      {kind:'normal',name:'Normal Moving',days:'Batch habis dalam 8–30 hari',icon:'→'},
      {kind:'slow',name:'Slow Moving',days:'Batch habis setelah 30 hari',icon:'↘'}
    ];
    var cards=types.map(function(t){
      return '<div class="sc15-moving-row sc15-moving-'+t.kind+'">'+
        '<span class="sc15-moving-symbol" aria-hidden="true">'+t.icon+'</span>'+
        '<div class="sc15-moving-copy"><strong>'+t.name+'</strong><small>'+t.days+'</small></div>'+
        '<strong class="sc15-moving-count">'+fmt(groups[t.kind])+'<small> SKU</small></strong>'+
      '</div>';
    }).join('');
    var stale=latest&&monthKey(latest)<S.period;
    var footer='FIFO estimasi dari pembelian hingga batch habis terpakai (90 hari terakhir).';
    if(stale)footer+=' Pemakaian ledger terbaru '+dateLabel(latest)+'; periode terpilih belum lengkap.';
    return '<div class="sc15-moving-wrap" aria-label="Status kecepatan pengeluaran stok setelah pembelian">'+
      '<div class="sc15-moving-heading"><span>Perputaran berdasarkan batch pembelian</span>'+
        '<strong>'+fmt(total)+' SKU</strong></div>'+
      '<div class="sc15-moving-cards">'+cards+'</div>'+
      '<div class="sc15-moving-unclassified"><span>Belum dapat dihitung</span>'+
        '<strong>'+fmt(unknown)+' SKU</strong></div>'+
      '<p class="sc15-moving-foot">'+esc(footer)+
        (groups.untracked?' '+fmt(groups.untracked)+' SKU belum opname.':'')+'</p>'+
    '</div>';
  }

  async function loadMovingStatus(period){
    if(!period)return;
    var seq=++S.movingSeq;
    S.movingLoading=true;
    S.movingLoaded=false;
    S.movingRows=[];
    S.movingError='';
    render();
    try{
      var rows=await rpc('get_stock_moving_fifo_v1',{p_brand:BRAND,p_period:period+'-01'});
      if(seq!==S.movingSeq||S.period!==period)return;
      S.movingRows=Array.isArray(rows)?rows:[];
      S.movingLoaded=true;
    }catch(e){
      if(seq!==S.movingSeq||S.period!==period)return;
      S.movingError=e&&e.message?e.message:String(e);
    }finally{
      if(seq===S.movingSeq){S.movingLoading=false;render();}
    }
  }

  function stockKpiIcon(kind){
    var paths={
      package:'<path d="m12 3 8 4.5v9L12 21 4 16.5v-9L12 3Z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/>',
      value:'<ellipse cx="12" cy="5.5" rx="7" ry="3"/><path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/><path d="M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
      warning:'<path d="M10.3 3.7a2 2 0 0 1 3.4 0l8.1 14.4a2 2 0 0 1-1.7 3H3.9a2 2 0 0 1-1.7-3l8.1-14.4Z"/><path d="M12 9v5"/><path d="M12 17.5h.01"/>',
      opname:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5A2.5 2.5 0 0 1 11.5 2h1A2.5 2.5 0 0 1 15 4.5V6H9V4.5Z"/><path d="M9 11h6M9 15h6"/>'
    };
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[kind]||paths.package)+'</svg>';
  }
  function overviewKpis() {
    var items=S.items||[],loading=!S.baseLoaded;
    var need=items.filter(function(x){return x.ui_status==='critical'||x.ui_status==='order'}).length;
    var untracked=items.filter(function(x){return x.ui_status==='untracked'}).length;
    var v=S.valuation,valuationReady=!!(S.valuationLoaded&&v);
    var valuationSkuCount=valuationReady?num(v.inventory_items):0;
    var coverage=valuationSkuCount>0?num(v.valued_items)/valuationSkuCount*100:0;
    function quantity(n){return loading?'…':fmt(n)}
    var cards=[
      {kind:'package',label:'Total Item (SKU)',value:quantity(items.length),
       note:loading?'Memuat master stok…':'Item terdaftar di backend'},
      {kind:'value',label:'Nilai Stok (Parsial)',
       value:valuationReady?stockMoney(v.inventory_value,true):S.valuationError?'—':'…',
       note:valuationReady?('Biaya terverifikasi: '+fmt(v.valued_items)+' dari '+fmt(v.inventory_items)+' SKU ('+
         coverage.toLocaleString('id-ID',{maximumFractionDigits:1})+'%)'):
         (S.valuationError?'Data valuasi belum tersedia':'Menunggu biaya terverifikasi'),
       partial:valuationReady&&num(v.valued_items)<num(v.inventory_items)},
      {kind:'warning',label:'Item Stok Rendah',value:quantity(need),
       note:loading?'Memuat status stok…':'Kritis atau di bawah minimum'},
      {kind:'opname',label:'Belum Opname Awal',value:quantity(untracked),
       note:loading?'Memuat status opname…':'Belum ada checkpoint awal'}
    ];
    return '<div class="sc5-kpis sc6-kpis sc8-kpis" aria-label="Ringkasan empat KPI stok">'+cards.map(function(c){
      return '<article class="sc5-kpi sc8-kpi sc8-kpi-'+c.kind+'">'+
        '<span class="sc5-kpi-icon sc8-kpi-icon">'+stockKpiIcon(c.kind)+'</span>'+
        '<div class="sc8-kpi-copy"><span class="sc8-kpi-label" title="'+esc(c.label)+'">'+esc(c.label)+'</span>'+
        '<strong class="sc8-kpi-value" title="'+esc(c.value)+'">'+esc(c.value)+'</strong>'+
        '<small class="sc8-kpi-note" title="'+esc(c.note)+'">'+esc(c.note)+'</small></div></article>';
    }).join('')+'</div>';
  }

  function activityName(type) {
    if (type === 'PURCHASE_RECEIPT') return 'Pembelian masuk';
    if (type === 'SALE_CONSUMPTION' || type === 'SALE_USAGE' || type === 'SALE') return 'Konsumsi penjualan';
    if (type === 'OPNAME_CORRECTION') return 'Koreksi opname';
    if (type === 'ADJUSTMENT') return 'Adjustment';
    if (type === 'BASELINE') return 'Baseline';
    return String(type || 'Aktivitas');
  }

  function renderActivity() {
    var rows = S.activity || [];
    if (S.periodLoading && !rows.length) return '<div class="sc3-loading">Memuat aktivitas periode…</div>';
    if (!rows.length) return '<div class="sc4-empty">Belum ada movement pada periode ini.</div>';
    var max = Math.max.apply(null, rows.map(function (x) { return num(x.movement_rows); }).concat([1]));
    return '<div class="sc4-chart">' + rows.map(function (x) {
      var pct = Math.max(2, Math.min(100, num(x.movement_rows) / max * 100));
      return '<div class="sc4-chart-row"><div><span>' + esc(activityName(x.movement_type)) + '</span><b>' + fmt(x.movement_rows) + ' aktivitas</b></div><progress max="100" value="' + pct.toFixed(2) + '">' + pct.toFixed(0) + '%</progress><small>' + fmt(x.sku_count) + ' SKU terlibat</small></div>';
    }).join('') + '</div>';
  }

  function renderPeriodControl() {
    var v = S.overview || {};
    return '<div class="sc4-control-grid">' +
      '<div><span>SKU ada pembelian</span><strong>' + fmt(v.sku_with_purchase) + '</strong></div>' +
      '<div><span>SKU ada konsumsi</span><strong>' + fmt(v.sku_with_consumption) + '</strong></div>' +
      '<div><span>SKU ada adjustment</span><strong>' + fmt(v.sku_with_adjustment) + '</strong></div>' +
      '<div><span>Opname</span><strong>' + fmt(v.opname_rows) + '</strong></div>' +
      '<div><span>Selisih opname</span><strong>' + fmt(v.opname_variance_rows) + '</strong></div>' +
    '</div>';
  }

  function ledgerTypeLabel(x) {
    if (x === 'PURCHASE') return 'Pembelian';
    if (x === 'SALE') return 'Konsumsi';
    if (x === 'ADJUSTMENT') return 'Adjustment';
    if (x === 'OPENING') return 'Opening';
    return x || 'Lainnya';
  }

  function renderLedgerTable() {
    if (S.ledgerLoading) return '<div class="sc3-loading">Memuat ledger ' + esc(monthLabel(S.period)) + '…</div>';
    if (S.ledgerError) return '<div class="sc3-alert">' + esc(S.ledgerError) + '</div>';
    var pageSize = 50, pages = Math.max(1, Math.ceil(S.ledger.length / pageSize));
    if (S.ledgerPage > pages) S.ledgerPage = pages;
    var start = (S.ledgerPage - 1) * pageSize;
    var rows = S.ledger.slice(start, start + pageSize);
    var body = rows.map(function (x) {
      var q = num(x.qty_delta), cls = q < 0 ? 'sc3-neg' : q > 0 ? 'sc3-pos' : 'sc3-zero';
      return '<tr><td>' + esc(dateLabel(x.movement_date)) + '</td><td><b>' + esc(x.sku_name || x.sku_code || 'SKU') + '</b><small>' + esc(x.base_unit || '') + '</small></td><td>' + esc(ledgerTypeLabel(x.ledger_type)) + '<small>' + esc(x.source_movement_type || '') + '</small></td><td class="sc3-num"><strong class="' + cls + '">' + esc(signed(q)) + '</strong></td><td>' + esc(x.reference_type || '—') + '</td><td>' + esc(x.notes || '—') + '</td></tr>';
    }).join('');
    var buttons = [];
    for (var p = Math.max(1, S.ledgerPage - 2); p <= Math.min(pages, S.ledgerPage + 2); p++) buttons.push('<button type="button" data-sc4-ledger-page="' + p + '" class="' + (p === S.ledgerPage ? 'on' : '') + '">' + p + '</button>');
    return '<div class="sc4-ledger-meta">' + S.ledger.length.toLocaleString('id-ID') + ' movement · ' + esc(monthLabel(S.period)) + '</div><div class="sc3-table-wrap"><table class="sc3-table sc4-ledger-table"><thead><tr><th>Tanggal</th><th>SKU</th><th>Jenis</th><th>Qty Δ</th><th>Referensi</th><th>Catatan</th></tr></thead><tbody>' + (body || '<tr><td colspan="6" class="sc3-empty">Belum ada movement.</td></tr>') + '</tbody></table></div><div class="sc3-pager"><span>Halaman ' + S.ledgerPage + ' dari ' + pages + '</span><div>' + buttons.join('') + '</div></div>';
  }



  // Read-only; no inventory movement or opening stock is ever created here.
  async function loadIntegrationAudit(){
    if(!isOwner()||S.modal!=='formula-audit')return;
    var period=monthKey(S.period),seq=++S.integrationSeq;
    S.integrationPeriod=period;S.integrationAudit=null;S.integrationError='';S.integrationLoading=true;
    if(!period){S.integrationError='Pilih periode terlebih dahulu.';S.integrationLoading=false;return;}
    var year=Number(period.slice(0,4)),month=Number(period.slice(5,7));
    var next=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10),from=period+'-01';
    var results=await Promise.allSettled([
      request('ui_stock_sales_link_audit_v1?'+qs({brand_id:'eq.'+BRAND,period_month:'eq.'+from,
        select:'period_month,sale_item_rows,linked_sale_item_rows,unlinked_sale_item_rows,no_recipe_rows,unverified_components_rows,eligible_verified_rows,awaiting_recipe_approval_rows,sale_consumption_movements',limit:'1'})),
      request('purchase_inventory_bridge?'+qs({brand_id:'eq.'+BRAND,purchase_date:'gte.'+from,
        select:'ready_for_inventory,inventory_item_id',limit:'2000'})+'&purchase_date=lt.'+next)
    ]);
    if(seq!==S.integrationSeq||S.modal!=='formula-audit'||monthKey(S.period)!==period)return;
    var salesOk=results[0].status==='fulfilled',purchaseOk=results[1].status==='fulfilled';
    var sales=salesOk&&Array.isArray(results[0].value)?results[0].value[0]||null:null;
    var rows=purchaseOk&&Array.isArray(results[1].value)?results[1].value:null;
    S.integrationAudit={
      sales:s,salesOk:salesOk,purchaseOk:purchaseOk,
      purchaseTotal:rows?rows.length:null,
      purchaseMapped:rows?rows.filter(function(x){return !!x.inventory_item_id}).length:null,
      purchaseReady:rows?rows.filter(function(x){return x.ready_for_inventory===true}).length:null,
      purchaseReview:rows?rows.filter(function(x){return x.ready_for_inventory!==true}).length:null
    };
    if(!salesOk||!purchaseOk)S.integrationError='Sebagian sumber gagal dibaca; data lain tetap ditampilkan.';
    S.integrationLoading=false;render();
  }

  function renderIntegrationAudit(){
    if(!isOwner())return '';
    var a=S.integrationAudit||{},sale=a.sales||{};
    var out='<div class="sc24-integration" aria-label="Audit integrasi Penjualan Pembelian Stok">'+
      '<div class="sc24-title"><b>Audit Integrasi · '+esc(monthLabel(S.period))+'</b>'+
      '<span>READ ONLY · tanpa posting transaksi</span></div>';
    if(S.integrationLoading||S.integrationPeriod!==monthKey(S.period))return out+
      '<p class="sc20-note">Memeriksa kaitan penjualan, resep dan pembelian periode terpilih…</p></div>';
    if(S.integrationError)out+='<div class="sc20-note">'+esc(S.integrationError)+'</div>';
    if(!a.salesOk&&!a.purchaseOk)return out+
      '<div class="sc20-note">Belum dapat memverifikasi integrasi; saldo tidak diubah.</div></div>';
    var cell=function(v,name,note){return '<div><b>'+esc(v)+'</b><span>'+esc(name)+
      '</span><small>'+esc(note)+'</small></div>'};
    out+='<div class="sc20-cards sc24-metrics">'+
      cell(a.salesOk?fmt(sale.unlinked_sale_item_rows||0):'—','Baris jual belum tertaut','Belum mengurangi saldo stok')+
      cell(a.salesOk?fmt(sale.awaiting_recipe_approval_rows||0):'—','Menunggu persetujuan resep','Jangan posting otomatis')+
      cell(a.purchaseOk?fmt(a.purchaseReview):'—','Pembelian perlu review','Mapping/satuan/penerimaan belum lengkap')+
      cell(a.purchaseOk?fmt(a.purchaseReady):'—','Data pembelian terpetakan','Belum berarti barang diterima')+
      '</div><div class="sc20-note">'+
      (a.salesOk?'<b>Penjualan:</b> '+fmt(sale.sale_item_rows||0)+' baris; '+
        fmt(sale.linked_sale_item_rows||0)+' tertaut; '+fmt(sale.sale_consumption_movements||0)+
        ' event pemakaian; '+fmt(sale.no_recipe_rows||0)+' tanpa resep; '+
        fmt(sale.unverified_components_rows||0)+' komponen belum terverifikasi. ':'')+
      (a.purchaseOk?'<b>Pembelian:</b> '+fmt(a.purchaseTotal)+' baris; '+fmt(a.purchaseMapped)+
        ' punya referensi SKU. ':'')+
      'Kategori penyebab bisa tumpang-tindih. Tidak ada transaksi yang otomatis dibukukan.</div>'+
      '<div class="sc24-actions"><button type="button" data-sc24-review="recipes">Periksa Resep</button>'+
      '<button type="button" data-sc24-review="pembelian">Review Pembelian</button></div></div>';
    return out;
  }

  // Independent virtual view: every row is calculated from existing opname + ledger,
  // not inserted as a new physical stock or movement.
  async function loadFormulaAudit(){
    if(!isOwner())return;
    var seq=++S.formulaSeq;
    S.formulaLoading=true;S.formulaLoaded=false;S.formulaError='';S.formulaRows=[];
    S.formulaPage=1;S.formulaSearch='';render();
    loadIntegrationAudit();
    try{
      var data=await request('ui_stock_formula_verification_v1?'+qs({
        brand_id:'eq.'+BRAND,
        select:'inventory_item_id,item_name,unit,opname_date,physical_qty,receipts_after_opname,usage_after_opname,other_movements_after_opname,independently_calculated_qty,existing_ledger_qty,arithmetic_difference,has_physical_baseline,same_day_ambiguous_rows,estimated_bom_usage_rows,counted_movement_rows,audit_status',
        order:'item_name.asc',limit:'250'
      }));
      if(seq!==S.formulaSeq||S.modal!=='formula-audit')return;
      S.formulaRows=Array.isArray(data)?data:[];S.formulaLoaded=true;
    }catch(e){
      if(seq!==S.formulaSeq||S.modal!=='formula-audit')return;
      S.formulaError=e&&e.message?e.message:String(e);
    }finally{
      if(seq===S.formulaSeq){S.formulaLoading=false;render();}
    }
  }

  function renderFormulaAudit(){
    if(!isOwner())return '<div class="sc3-alert">Pemeriksaan rumus hanya tersedia bagi Owner.</div>';
    if(S.formulaLoading)return '<div class="sc3-loading">Menghitung ulang seluruh SKU dari sumber transaksi…</div>';
    if(S.formulaError)return '<div class="sc3-alert">Audit belum tersedia: '+esc(S.formulaError)+'. Stok tidak diubah.</div>';
    if(!S.formulaLoaded)return '<div class="sc3-loading">Buka Periksa Hitungan untuk memuat data.</div>';
    var all=S.formulaRows||[],tracked=all.filter(function(x){return x.has_physical_baseline}).length;
    var missing=all.length-tracked;
    var mismatched=all.filter(function(x){return x.has_physical_baseline&&Number(x.arithmetic_difference)!==0}).length;
    var dateRisk=all.filter(function(x){return num(x.same_day_ambiguous_rows)>0}).length;
    var estimateRisk=all.filter(function(x){return num(x.estimated_bom_usage_rows)>0}).length;
    var minus=all.filter(function(x){return x.has_physical_baseline&&Number(x.independently_calculated_qty)<0}).length;
    var q=String(S.formulaSearch||'').trim().toLocaleLowerCase('id-ID');
    var priority=function(x){
      if(!x.has_physical_baseline)return 4;
      if(Number(x.arithmetic_difference)!==0)return 0;
      if(num(x.same_day_ambiguous_rows)>0||num(x.estimated_bom_usage_rows)>0)return 1;
      if(Number(x.independently_calculated_qty)<0)return 2;
      return 3;
    };
    var filtered=all.filter(function(x){
      return !q||String(x.item_name||'').toLocaleLowerCase('id-ID').indexOf(q)>=0;
    }).slice().sort(function(a,b){return priority(a)-priority(b)||
      String(a.item_name||'').localeCompare(String(b.item_name||''),'id')});
    var pageSize=12,pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    S.formulaPage=Math.max(1,Math.min(S.formulaPage,pages));
    var start=(S.formulaPage-1)*pageSize;
    var visible=filtered.slice(start,start+pageSize);
    var body=visible.map(function(x){
      var flags=[];
      if(!x.has_physical_baseline)flags.push('Belum ada stok fisik awal');
      if(x.has_physical_baseline&&Number(x.arithmetic_difference)!==0)flags.push('HITUNGAN BERBEDA');
      if(num(x.same_day_ambiguous_rows)>0)flags.push(fmt(x.same_day_ambiguous_rows)+' transaksi di hari opname');
      if(num(x.estimated_bom_usage_rows)>0)flags.push(fmt(x.estimated_bom_usage_rows)+' pemakaian masih perkiraan');
      if(x.has_physical_baseline&&Number(x.independently_calculated_qty)<0)flags.push('Saldo sistem minus');
      if(!flags.length)flags.push('Rumus cocok; kelengkapan sumber belum final');
      var hasBaseline=!!x.has_physical_baseline;
      var expected=hasBaseline?fmt(x.independently_calculated_qty):'Belum bisa dihitung';
      var existing=hasBaseline?fmt(x.existing_ledger_qty):'Belum terverifikasi';
      var extra=hasBaseline&&num(x.other_movements_after_opname)!==0?
        '<small>Penyesuaian lain: '+esc(signed(x.other_movements_after_opname))+'</small>':'';
      return '<tr><td><b>'+esc(x.item_name||'Bahan')+'</b><small>'+esc(x.unit||'Satuan tidak diketahui')+'</small></td>'+
        '<td class="sc20-num">'+(hasBaseline?fmt(x.physical_qty):'—')+
          '<small>'+esc(x.opname_date?dateLabel(x.opname_date):'Belum opname')+'</small></td>'+
        '<td class="sc20-num">'+(hasBaseline?fmt(x.receipts_after_opname):'—')+'</td>'+
        '<td class="sc20-num">'+(hasBaseline?fmt(x.usage_after_opname):'—')+'</td>'+
        '<td class="sc20-num"><b>'+esc(expected)+'</b>'+extra+'</td>'+
        '<td class="sc20-num">'+esc(existing)+'</td>'+
        '<td>'+flags.map(function(f){return '<span class="sc20-flag">'+esc(f)+'</span>'}).join('')+'</td></tr>';
    }).join('');
    var pager='<div class="sc20-pager"><span>'+fmt(filtered.length?start+1:0)+'–'+
      fmt(Math.min(start+pageSize,filtered.length))+' dari '+fmt(filtered.length)+' bahan</span><div>'+
      '<button type="button" data-sc20-page="'+(S.formulaPage-1)+'"'+(S.formulaPage<=1?' disabled':'')+'>‹</button>'+
      ' '+S.formulaPage+' / '+pages+' '+
      '<button type="button" data-sc20-page="'+(S.formulaPage+1)+'"'+(S.formulaPage>=pages?' disabled':'')+'>›</button>'+
      '</div></div>';
    return renderIntegrationAudit()+'<div class="sc20-cards"><div><b>'+fmt(tracked)+'</b><span>SKU dengan stok awal</span></div>'+
      '<div><b>'+fmt(missing)+'</b><span>Belum opname</span></div>'+
      '<div><b>'+fmt(mismatched)+'</b><span>Selisih perhitungan</span></div>'+
      '<div><b>'+fmt(dateRisk)+'</b><span>Perlu cek tanggal opname</span></div>'+
      '</div>'+
      '<div class="sc20-note"><b>Rumus yang diperiksa:</b> Stok fisik terakhir + barang masuk − bahan terpakai ± penyesuaian = saldo sistem. '+
      'Selisih hitung 0 hanya berarti rumus cocok, bukan stok fisik sudah terbukti benar. '+
      '<b>'+fmt(minus)+' saldo minus</b> dan <b>'+fmt(estimateRisk)+' SKU dengan pemakaian resep perkiraan</b> perlu perhatian. '+
      'Data penjualan yang belum diposting serta Pembelian yang belum terbukti diterima tidak otomatis ditambahkan ke stok. '+
      'Perhitungan menggunakan transaksi <b>setelah tanggal opname</b>; transaksi di hari yang sama diberi peringatan, bukan ditebak urutannya.</div>'+
      '<label class="sc20-search">Cari bahan <input type="search" id="sc20FormulaSearch" value="'+esc(S.formulaSearch)+
      '" placeholder="Nama bahan…" autocomplete="off"></label>'+
      '<div class="sc20-table-wrap"><table class="sc20-table"><colgroup>'+
      '<col style="width:19%"><col style="width:12%"><col style="width:10%">'+
      '<col style="width:10%"><col style="width:12%"><col style="width:11%"><col style="width:26%"></colgroup>'+
      '<thead><tr><th>Nama bahan</th><th>Stok awal</th><th>+ Masuk</th><th>− Keluar</th>'+
      '<th>Hitung ulang</th><th>Saldo sistem</th><th>Hasil audit</th></tr></thead><tbody>'+
      (body||'<tr><td colspan="7">Tidak ada bahan yang cocok.</td></tr>')+
      '</tbody></table></div>'+pager;
  }

  function renderStockIntegrityWarning(){
    if(!S.baseLoaded)return '';
    var tracked=S.items.filter(function(x){return !!x.tracking_active}).length;
    var missing=S.items.length-tracked;
    var unlinked=S.salesLinkAudit?num(S.salesLinkAudit.unlinked_sale_item_rows):null;
    var purchase=S.purchaseImportEvidence;
    return '<div class="sc20-integrity" role="status"><b>Saldo stok belum terverifikasi penuh</b>'+
      '<span>'+fmt(tracked)+' SKU sudah punya opname · '+fmt(missing)+' belum punya opname'+
      (unlinked!==null?' · '+fmt(unlinked)+' baris jual '+esc(monthLabel(S.period))+' belum tertaut ke pengurangan stok':'')+
      (purchase&&purchase.total?' · '+fmt(purchase.total)+' data Pembelian impor ('+fmt(purchase.quantityMapped)+' jumlah+SKU terpetakan, '+fmt(purchase.needsReview)+' perlu verifikasi)':'')+
      '</span>'+(isOwner()?'<button type="button" data-sc4-modal="formula-audit">Lihat perhitungan</button>':'')+
      '</div>';
  }

  function renderModal() {
    if (!S.modal) return '';
    var title = S.modal === 'ledger' ? 'Ledger · ' + monthLabel(S.period) :
      S.modal === 'recipes' ? 'Cek Resep Produk · ' + monthLabel(S.period) :
      S.modal === 'formula-audit' ? 'Periksa Hitungan Stok' : 'Posisi SKU Saat Ini';
    var body = S.modal === 'ledger' ? renderLedgerTable() :
      S.modal === 'recipes' ? renderRecipeReview() :
      S.modal === 'formula-audit' ? renderFormulaAudit() :
      renderFormula() + renderAuxState() + renderFilters() + renderTable();
    return '<div class="sc4-modal-backdrop" data-sc4-close="1"><section class="sc4-modal" role="dialog" aria-modal="true" aria-labelledby="sc4ModalTitle" tabindex="-1"><div class="sc4-modal-head"><div><div class="sc3-eyebrow">DETAIL STOK</div><h3 id="sc4ModalTitle">' + esc(title) + '</h3><p>' + (S.modal === 'ledger' ? 'Movement periode terpilih; quantity tetap dalam satuan masing-masing SKU.' : S.modal === 'recipes' ? 'Penjualan berdasarkan bulan; resep berlaku terus sejak disetujui sampai diubah.' :
        S.modal === 'formula-audit' ? 'Audit hitung ulang semua SKU berdasarkan data yang sudah tercatat, bukan stok fisik baru.' :
        'Saldo terkini, opname, incoming, kebutuhan dan days cover.') + '</p></div><button type="button" data-sc4-close="1" class="sc4-close" aria-label="Tutup">×</button></div><div class="sc4-modal-body">' + body + '</div></section></div>';
  }

  function openOpname() {
    function clickCreate(tries) {
      var b = document.querySelector('[data-op-action="new-opname"]');
      if (b && b.click) { b.click(); return; }
      if (tries > 0) setTimeout(function () { clickCreate(tries - 1); }, 100);
    }
    if (window.__HASNARIA_OWNER_SHELL && window.__HASNARIA_OWNER_SHELL.navigate) {
      window.__HASNARIA_OWNER_SHELL.navigate('operasional');
      clickCreate(20);
      return;
    }
    var nav = document.querySelector('[data-tab="operasional"]') || document.querySelector('[data-page="operasional"]');
    if (nav && nav.click) { nav.click(); clickCreate(20); }
  }


  var topSkuMode='in';
  function compositionInfographic(){
    var v=S.overview||{},a=Math.max(0,num(v.positive_skus)),b=Math.max(0,num(v.zero_skus)),c=Math.max(0,num(v.negative_skus)),sum=a+b+c;
    if(S.periodLoading&&!S.overview)return'<div class="sc3-loading">Memuat posisi SKU…</div>';
    if(!sum)return'<div class="sc4-empty">Komposisi SKU belum tersedia untuk periode ini.</div>';
    var aa=+(100*a/sum).toFixed(1),ab=+(100*(a+b)/sum).toFixed(1),bb=+(100*b/sum).toFixed(1),cc=+(100*c/sum).toFixed(1);
    return'<div class="sc4-donut-wrap"><div class="sc4-donut" style="background:conic-gradient(#176b55 0% '+aa+'%,#a3cbb7 '+aa+'% '+ab+'%,#e4b84e '+ab+'% 100%)"><span>'+fmt(v.sku_count==null?sum:v.sku_count)+'<small>Total SKU</small></span></div><div class="sc4-donut-legend">'+
     '<div><span><i style="background:#176b55"></i>Saldo Positif</span><b>'+fmt(a)+' · '+aa+'%</b></div>'+
     '<div><span><i style="background:#a3cbb7"></i>Saldo Nol</span><b>'+fmt(b)+' · '+bb+'%</b></div>'+
     '<div><span><i style="background:#e4b84e"></i>Historical Discrepancy</span><b>'+fmt(c)+' · '+cc+'%</b></div></div></div>'+
     (v.sku_count!=null&&num(v.sku_count)!==sum?'<div class="sc4-info">Jumlah status berbeda dari total SKU. Periksa basis data periode.</div>':'');
  }
  function topSkuInfographic(){
    var activeCount=(S.activity||[]).reduce(function(t,z){return t+num(z.movement_rows)},0);
    if(S.periodLoading&&!S.activity.length)return'<div class="sc3-loading">Memuat movement…</div>';
    if(!activeCount)return'<div class="sc4-blank-insight">Belum ada movement pada periode ini. Ranking SKU tidak ditampilkan tanpa sumber.</div>';
    if(S.ledgerLoading)return'<div class="sc3-loading">Memuat ledger SKU…</div>';
    if(!S.ledger.length)return'<div class="sc4-blank-insight"><div>Ranking SKU dimuat hanya saat diminta agar dashboard tetap ringan.<p><button class="sc4-btn-small" type="button" data-sc4-top-load>Muat Top 5 SKU</button></p></div></div>';
    var choices={},sign=topSkuMode==='in'?1:-1;
    S.ledger.forEach(function(z){var name=String(z.sku_name||z.sku_code||'').trim(),qty=num(z.qty_delta);if(!name||!(qty*sign>0))return;var key=name.toUpperCase();if(!choices[key])choices[key]={name:name,count:0};choices[key].count++});
    var best=Object.keys(choices).map(function(k){return choices[k]}).sort(function(a,b){return b.count-a.count}).slice(0,5);
    var buttons='<div class="sc4-sku-toggle"><button type="button" data-sc4-top-mode="in" class="'+(topSkuMode==='in'?'on':'')+'">Masuk</button><button type="button" data-sc4-top-mode="out" class="'+(topSkuMode==='out'?'on':'')+'">Keluar</button></div>';
    if(!best.length)return buttons+'<div class="sc4-blank-insight">Tidak ada movement '+(sign>0?'masuk':'keluar')+' pada periode ini.</div>';
    return buttons+'<div class="sc4-sku-list">'+best.map(function(z,i){return'<div class="sc4-sku-row"><span>'+(i+1)+'. <b>'+esc(z.name)+'</b></span><strong>'+fmt(z.count)+' movement</strong><progress max="100" value="'+(z.count/best[0].count*100).toFixed(1)+'"></progress></div>'}).join('')+'</div><div class="sc4-info">Ranking berdasarkan jumlah event, bukan penjumlahan quantity beda satuan.</div>';
  }
  function anomalyInfographic(){
    var v=S.overview||{},items=[];
    if(num(v.negative_skus)>0)items.push(['Saldo negatif historis',fmt(v.negative_skus)+' SKU · informasional']);
    if(num(v.opname_rows)===0)items.push(['Belum ada opname periode','Input opname hanya berdasarkan hitung fisik']);
    if(!(S.activity||[]).some(function(z){return num(z.movement_rows)>0}))items.push(['Belum ada movement','Tidak berarti transaksi Pembelian belum ada']);
    if(num(v.opname_variance_rows)>0)items.push(['Selisih opname',fmt(v.opname_variance_rows)+' perlu pemeriksaan']);
    if(!items.length)items.push(['Tidak ada anomali tercatat','Periksa backlog satuan pada Notifikasi']);
    return'<div class="sc4-anomaly">'+items.map(function(z){return'<div><b>'+esc(z[0])+'</b><span>'+esc(z[1])+'</span></div>'}).join('')+
       (isOwner()?'<button type="button" class="sc4-btn-small" data-sc4-notifications>Periksa di Notifikasi →</button>':'')+'</div>';
  }

  var SC5_COLORS=['#09563f','#187957','#35a374','#5abd91','#83ca72','#b4dfab'];
  function sc5Donut(parts,center,label) {
    var total=parts.reduce(function(a,x){return a+x.value},0);
    if(!total)return '<div class="sc5-empty">Belum ada data yang dapat ditampilkan.</div>';
    var pos=0,stops=[];
    parts.forEach(function(x,i){if(!x.value)return;var next=pos+x.value/total*100;
      stops.push(SC5_COLORS[i%SC5_COLORS.length]+' '+pos.toFixed(3)+'% '+next.toFixed(3)+'%');pos=next});
    return '<div class="sc5-donut-row"><div class="sc5-donut" style="background:conic-gradient('+stops.join(',')+')">'+
      '<div class="sc5-donut-hole"><strong>'+fmt(center)+'</strong><small>'+esc(label)+'</small></div></div>'+
      '<div class="sc5-donut-legend">'+parts.filter(function(x){return x.value>0}).map(function(x){
        var i=parts.indexOf(x);
        return '<div><span class="sc5-legend-name"><i style="background:'+SC5_COLORS[i%SC5_COLORS.length]+'"></i>'+esc(x.label)+'</span><b>'+fmt(x.value)+' <small>'+Math.round(100*x.value/total)+'%</small></b></div>';
      }).join('')+'</div></div>';
  }
  function categoryInfographic(){
    if(!S.baseLoaded)return '<div class="sc5-empty">Memuat kategori SKU dari backend…</div>';
    var dict={};S.items.forEach(function(x){var k=String(x.category||'Lainnya').trim().toUpperCase();dict[k]=(dict[k]||0)+1});
    var parts=Object.keys(dict).map(function(k){return {label:k,value:dict[k]}}).sort(function(a,b){return b.value-a.value});
    return sc5Donut(parts,S.items.length,'SKU master')+
      '<p class="sc5-caption">Komposisi jumlah SKU, bukan nilai rupiah atau total unit berbeda satuan.</p>';
  }
  // Current stock balance vs per-SKU minimum. One unit per chart:
  // never aggregate or compare quantities across grams, pieces and portions.
  function stockSafetyInfographic(){
    if(!S.baseLoaded)return '<div class="sc5-empty">Memuat saldo dan batas aman setiap barang…</div>';
    var candidates=(S.items||[]).filter(function(x){
      return x.tracking_active&&x.system_qty!==null&&x.system_qty!==undefined&&
        x.system_qty!==''&&Number.isFinite(Number(x.system_qty))&&
        x.min_qty!==null&&x.min_qty!==undefined&&x.min_qty!==''&&
        Number.isFinite(Number(x.min_qty))&&Number(x.min_qty)>0&&
        String(x.unit||'').trim()&&x.unit!=='purchase_unit';
    });
    if(!candidates.length)return '<div class="sc12-no-data">'+
      '<strong>Belum ada barang dengan saldo dan batas aman yang dapat dibandingkan</strong>'+
      '<small>Grafik membutuhkan opname awal dan batas minimum barang yang sudah ditetapkan. '+
      'Barang tanpa data tersebut tidak dianggap stok nol.</small></div>';

    var groups=Object.create(null);
    candidates.forEach(function(x){
      var unit=String(x.unit).trim();
      (groups[unit]||(groups[unit]=[])).push(x);
    });
    var units=Object.keys(groups).sort(function(a,b){
      return groups[b].length-groups[a].length||a.localeCompare(b,'id');
    });
    if(!S.chartUnit||!groups[S.chartUnit])S.chartUnit=units[0];
    var unit=S.chartUnit;
    var priority=function(x){
      var stock=Number(x.system_qty),minimum=Number(x.min_qty);
      return stock<=0?0:stock<minimum?1:2;
    };
    var list=groups[unit].slice().sort(function(a,b){
      return priority(a)-priority(b)||
        (Number(a.system_qty)-Number(a.min_qty))-(Number(b.system_qty)-Number(b.min_qty))||
        String(a.item_name||'').localeCompare(String(b.item_name||''),'id');
    });
    var size=6,pages=Math.max(1,Math.ceil(list.length/size));
    S.chartPage=Math.max(1,Math.min(S.chartPage||1,pages));
    var start=(S.chartPage-1)*size,shown=list.slice(start,start+size);
    var neg=Math.min.apply(null,shown.map(function(x){return Number(x.system_qty)}).concat([0]));
    var positive=Math.max.apply(null,shown.map(function(x){
      return Math.max(Number(x.system_qty),Number(x.min_qty));
    }).concat([1]));
    var span=positive-neg;
    var left=247,right=682,plotW=right-left;
    var xcoord=function(v){return left+((v-neg)/span)*plotW};
    var zeroX=xcoord(0);
    var chartHeight=52+shown.length*35;
    var lines=shown.map(function(item,i){
      var stock=Number(item.system_qty),minimum=Number(item.min_qty);
      var y=51+i*35,barcode=stock<0?'negative':stock<minimum?'low':'normal';
      var label=String(item.item_name||'Barang');
      var short=label.length>27?label.slice(0,26)+'…':label;
      var stockX=xcoord(stock),safeX=xcoord(minimum);
      var startStock=Math.min(stockX,zeroX),widthStock=Math.max(1,Math.abs(stockX-zeroX));
      var safeWidth=Math.max(1,safeX-zeroX);
      return '<g class="sc21-stock-row sc21-'+barcode+'">'+
        '<title>'+esc(label+': saldo sistem '+fmt(stock)+' '+unit+
        ', batas aman '+fmt(minimum)+' '+unit)+'</title>'+
        '<text class="sc21-stock-label" x="18" y="'+(y+10)+'">'+esc(short)+'</text>'+
        '<line class="sc21-zero" x1="'+zeroX.toFixed(2)+'" y1="'+(y-6)+
        '" x2="'+zeroX.toFixed(2)+'" y2="'+(y+22)+'"/>'+
        '<rect class="sc21-safe-bar" x="'+zeroX.toFixed(2)+'" y="'+(y-3)+
        '" width="'+safeWidth.toFixed(2)+'" height="7" rx="3"/>'+
        '<rect class="sc21-current-bar" x="'+startStock.toFixed(2)+'" y="'+(y+8)+
        '" width="'+widthStock.toFixed(2)+'" height="7" rx="3"/>'+
        '<text class="sc21-stock-value'+(stock<minimum?' sc21-value-alert':'')+
        '" x="702" y="'+(y+7)+'">Saat ini: '+esc(fmt(stock))+'</text>'+
        '<text class="sc21-safe-value" x="702" y="'+(y+21)+'">Aman: '+esc(fmt(minimum))+'</text>'+
      '</g>';
    }).join('');
    var buttons='<div class="sc21-page"><button type="button" data-sc21-page="'+(S.chartPage-1)+'"'+
      (S.chartPage===1?' disabled':'')+' aria-label="Halaman sebelumnya">‹</button>'+
      '<span>'+S.chartPage+' / '+pages+'</span>'+
      '<button type="button" data-sc21-page="'+(S.chartPage+1)+'"'+
      (S.chartPage>=pages?' disabled':'')+' aria-label="Halaman berikutnya">›</button></div>';
    return '<div class="sc21-comparison">'+
      '<div class="sc21-controls"><div class="sc21-legend">'+
        '<span><i class="sc21-legend-current"></i>Saldo saat ini</span>'+
        '<span><i class="sc21-legend-safe"></i>Batas aman</span></div>'+
        '<label>Satuan <select id="sc21StockUnit" aria-label="Pilih satuan grafik stok">'+
        units.map(function(u){return '<option value="'+esc(u)+'"'+(u===unit?' selected':'')+'>'+
          esc(u)+' ('+fmt(groups[u].length)+' SKU)</option>'}).join('')+
        '</select></label></div>'+
      '<div class="sc21-stat"><span>'+fmt(list.length)+' SKU dengan batas aman · '+esc(unit)+
      '</span><span>Menampilkan '+(start+1)+'–'+Math.min(start+size,list.length)+' SKU '+buttons+'</span></div>'+
      '<div class="sc21-chart-frame"><svg class="sc21-comparison-svg" viewBox="0 0 925 '+chartHeight+
        '" role="img" aria-label="Perbandingan saldo sistem stok saat ini dan batas aman per barang dalam satuan '+esc(unit)+'">'+
        '<line class="sc21-axis" x1="'+left+'" y1="32" x2="'+right+'" y2="32"/>'+
        '<text class="sc21-axis-label" x="'+left+'" y="23">Minus</text>'+
        '<text class="sc21-axis-label" x="'+right+'" y="23" text-anchor="end">Jumlah ('+esc(unit)+')</text>'+
        lines+'</svg></div>'+
      '<p class="sc21-foot">Stok saat ini = <b>saldo sistem dari transaksi yang telah tercatat</b>, bukan hasil hitung fisik terbaru. '+
      'Batas aman = <b>minimum per SKU</b> yang tersimpan. Saldo negatif ditampilkan apa adanya. '+
      'Hanya barang yang sudah opname dan memiliki batas minimum ditampilkan; angka ini bukan tren bulanan.</p>'+
    '</div>';
  }
  function monthlyStockEndInfographic(){
    if(!S.period)return '<div class="sc5-empty">Pilih periode stok.</div>';
    if(S.periodLoading&&!S.monthEndRows.length)return '<div class="sc5-empty">Menghitung stok akhir bulan…</div>';
    if(S.monthEndUnavailable)return '<div class="sc5-empty">Data stok akhir bulanan belum dapat dimuat; saldo tidak diubah.</div>';
    var unit=S.chartUnit||'';
    if(!unit)return '<div class="sc5-empty">Pilih satuan pada grafik kanan.</div>';
    var lookup=Object.create(null);
    (S.monthEndRows||[]).forEach(function(x){if(x.unit===unit)lookup[String(x.period_month).slice(0,10)]=x;});
    var year=Number(S.period.slice(0,4)),month=Number(S.period.slice(5,7))-1;
    var names=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    var months=[];
    for(var k=9;k>=0;k--){
      var d=new Date(Date.UTC(year,month-k,1)),key=d.toISOString().slice(0,10),row=lookup[key]||null;
      var n=row&&row.recorded_end_qty!==null?Number(row.recorded_end_qty):null;
      var noSync=!!(row&&row.data_status==='NO_POSTED_SALES');
      months.push({key:key,label:names[d.getUTCMonth()],year:d.getUTCFullYear(),
        n:row&&Number(row.checkpoint_skus)>0&&!noSync&&Number.isFinite(n)?n:null,
        row:row,noSync:noSync});
    }
    var existing=months.filter(function(x){return x.n!==null;});
    if(!existing.length)return '<div class="sc22-empty"><b>Belum tersedia saldo akhir bulanan yang dapat digrafikkan</b>'+
      '<small>Data opname baru tersedia mulai September 2026; Oktober belum tersinkronisasi. Bulan tanpa dasar hitung tidak dibuat nol.</small></div>';
    var values=existing.map(function(x){return x.n;}).concat([0]);
    var min=Math.min.apply(null,values),max=Math.max.apply(null,values);
    var pad=Math.max(1,(max-min)*.15);min-=pad;max+=pad;
    var left=65,right=682,top=40,bottom=223;
    var xc=function(i){return left+(right-left)*i/9;};
    var yc=function(v){return bottom-(v-min)/(max-min)*(bottom-top);};
    var ticks=[0,1,2,3,4].map(function(k){
      var yy=bottom-k*(bottom-top)/4;
      return '<line class="sc22-gridline" x1="'+left+'" y1="'+yy+'" x2="'+right+'" y2="'+yy+'"/>'+
        '<text class="sc22-axis-label" x="'+(left-8)+'" y="'+(yy+4)+'" text-anchor="end">'+
        esc(fmt(min+(max-min)*k/4))+'</text>';
    }).join('');
    var paths=[],run=[];
    months.forEach(function(x,i){
      if(x.n===null){if(run.length>1)paths.push(run.join(' '));run=[];}
      else run.push(xc(i).toFixed(1)+','+yc(x.n).toFixed(1));
    });
    if(run.length>1)paths.push(run.join(' '));
    var lines=paths.map(function(x){return '<polyline class="sc22-trend-line" points="'+x+'"/>';}).join('');
    var points=months.map(function(x,i){
      var xx=xc(i),axis='<text class="sc22-month-label" x="'+xx.toFixed(1)+
        '" y="251" text-anchor="middle">'+esc(x.label+(i===0||x.label==='Jan'?' '+String(x.year).slice(-2):''))+'</text>';
      if(x.n===null)return '<g><title>'+esc(x.label+' '+x.year+': '+
        (x.noSync?'penjualan belum disinkronkan':'belum ada data opname'))+
        '</title><text class="sc22-missing-point" x="'+xx.toFixed(1)+'" y="'+(bottom-10)+
        '" text-anchor="middle">—</text>'+axis+'</g>';
      var yy=yc(x.n),partial=x.row.data_status!=='LEDGER_RECORDED';
      var title=x.label+' '+x.year+': '+fmt(x.n)+' '+unit+
        '; '+x.row.checkpoint_skus+'/'+x.row.total_unit_skus+' SKU ber-opname'+
        (partial?'; belum lengkap':'');
      return '<g><title>'+esc(title)+'</title><circle class="sc22-trend-dot'+
        (partial?' sc22-partial':'')+'" cx="'+xx.toFixed(1)+'" cy="'+yy.toFixed(1)+
        '" r="5.7"/><text class="sc22-point-value" x="'+xx.toFixed(1)+
        '" y="'+Math.max(26,yy-12).toFixed(1)+'" text-anchor="middle">'+esc(fmt(x.n))+
        '</text>'+axis+'</g>';
    }).join('');
    var last=existing[existing.length-1],d=last.row;
    return '<div class="sc22-month-end">'+
      '<div class="sc22-summary"><span>Saldo akhir terhitung · '+esc(unit)+'</span>'+
      '<strong>'+esc(fmt(last.n))+' <small>'+esc(unit)+'</small></strong></div>'+
      '<div class="sc22-summary-note">'+esc(last.label+' '+last.year)+' · '+fmt(d.checkpoint_skus)+' dari '+
        fmt(d.total_unit_skus)+' SKU · <b>data parsial, bukan stok fisik final</b></div>'+
      '<div class="sc22-plot"><svg class="sc22-plot-svg" viewBox="0 0 740 269" role="img" aria-label="Tren saldo akhir bulanan agregat dalam satuan '+esc(unit)+'">'+
        ticks+lines+points+'</svg></div>'+
      '<p class="sc22-chart-note">Total per bulan = jumlah saldo akhir SKU <b>'+esc(unit)+
      '</b> yang punya opname, setelah pergerakan tercatat. '+
      (existing.length<2?'Titik historis belum cukup untuk membentuk garis tren. ':'')+
      'Tanda — berarti belum dapat dihitung. Angka parsial tidak berarti seluruh transaksi sudah masuk.</p>'+
    '</div>';
  }

  function attentionSkuInfographic(){
    if(!S.baseLoaded)return '<div class="sc5-empty">Memuat prioritas item…</div>';
    var rank={critical:0,order:1};
    var items=S.items.filter(function(x){return Object.prototype.hasOwnProperty.call(rank,x.ui_status)})
      .sort(function(a,b){return rank[a.ui_status]-rank[b.ui_status]||
        num(a.system_qty)-num(b.system_qty)}).slice(0,5);
    if(!items.length)return '<div class="sc5-empty">Tidak ada SKU kritis atau perlu beli.</div>';
    return '<div class="sc5-top-list">'+items.map(function(x,i){
      var label=x.ui_status==='critical'?'Kritis':'Perlu beli';
      return '<div class="sc5-top-row"><span class="sc5-top-name">'+(i+1)+'. '+esc(x.item_name||'SKU')+'</span>'+
        '<b>'+esc(fmt(x.system_qty))+' '+esc(x.unit||'unit')+'</b>'+
        '<small>'+label+' · '+esc(x.category||'Lainnya')+'</small>'+
        '<div class="sc5-top-track"><i style="width:'+(x.ui_status==='critical'?95:68)+'%"></i></div></div>';
    }).join('')+'</div><p class="sc5-caption">Prioritas berdasarkan status backend; tanpa estimasi nilai stok.</p>';
  }
  function healthInfographic(){
    if(!S.baseLoaded)return '<div class="sc5-empty">Memuat status stok…</div>';
    var c={ok:0,critical:0,order:0,incoming:0,untracked:0};
    S.items.forEach(function(x){c[x.ui_status]=(c[x.ui_status]||0)+1});
    return '<div class="sc5-status-grid">'+
      '<div class="sc5-status-tile sc5-status-ok"><span>Normal / Aman</span><strong>'+fmt(c.ok)+'</strong><small>SKU tercatat aman</small></div>'+
      '<div class="sc5-status-tile sc5-status-critical"><span>Kritis / Habis</span><strong>'+fmt(c.critical)+'</strong><small>Perlu penanganan</small></div>'+
      '<div class="sc5-status-tile sc5-status-order"><span>Perlu Beli</span><strong>'+fmt(c.order)+'</strong><small>Di bawah minimum</small></div>'+
      '<div class="sc5-status-tile sc5-status-untracked"><span>Belum Opname</span><strong>'+fmt(c.untracked)+'</strong><small>Belum terverifikasi</small></div>'+
      (c.incoming?'<div class="sc5-status-tile"><span>Dalam Pesanan</span><strong>'+fmt(c.incoming)+'</strong></div>':'')+'</div>';
  }
  function periodCompositionInfographic(){
    var v=S.overview||{},parts=[
      {label:'Saldo positif',value:Math.max(0,num(v.positive_skus))},
      {label:'Saldo nol',value:Math.max(0,num(v.zero_skus))},
      {label:'Negatif historis',value:Math.max(0,num(v.negative_skus))}
    ];
    if(S.periodLoading&&!S.overview)return '<div class="sc5-empty">Memuat posisi periode…</div>';
    var total=parts.reduce(function(a,x){return a+x.value},0);
    return sc5Donut(parts,total,'SKU pada periode')+
      '<p class="sc5-caption">Posisi dari laporan historis '+esc(monthLabel(S.period))+'. Jangan disamakan dengan jumlah SKU master.</p>';
  }
  function opnameControlInfographic(){
    if(!S.baseLoaded)return '<div class="sc5-empty">Memuat status opname…</div>';
    var dates=S.items.map(function(x){return x.last_opname_date}).filter(Boolean).sort();
    var latest=dates.length?dateLabel(dates[dates.length-1]):'Belum ada';
    var tracked=S.items.filter(function(x){return !!x.tracking_active}).length;
    var diff=S.ledgerAudit||{};
    var audit=diff.state==='unavailable'?'Belum dapat diperiksa':
      diff.state==='loading'?'Memuat…':fmt(diff.count)+' SKU';
    return '<div class="sc5-control-list">'+
      '<div><span>Opname terakhir</span><strong>'+esc(latest)+'</strong></div>'+
      '<div><span>SKU aktif dengan checkpoint</span><strong>'+fmt(tracked)+' / '+fmt(S.items.length)+'</strong></div>'+
      '<div><span>Selisih rekonsiliasi vs ledger</span><strong>'+esc(audit)+'</strong></div>'+
      '<div><span>Opname dalam periode</span><strong>'+fmt((S.overview||{}).opname_rows||0)+' baris</strong></div>'+
      '</div><p class="sc5-caption">Data kedaluwarsa dan valuasi belum ditampilkan tanpa sumber terverifikasi.</p>';
  }

  function render() {
    var host = document.getElementById('stok');
    if (!host) return;
    S.viewSeq++;
    ensureCss();
    host.__sc3Rendering = true;
    var currentDialog=host.querySelector('.sc4-modal');
    var preserveDialogFocus=!!(S.modal&&currentDialog&&currentDialog.contains(document.activeElement));
    var shell = host.querySelector('.sc3-shell,[data-stock-v3-boot="1"]');
    if (!shell) { shell = document.createElement('div'); host.replaceChildren(shell); }
    shell.className = 'sc3-shell';
    shell.removeAttribute('data-stock-v3-boot');
    shell.setAttribute('data-stock-v4','1');
    var alert = S.error ? '<div class="sc3-alert">' + esc(S.error) + '</div>' : '';
    var pAlert = S.periodError ? '<div class="sc3-alert">' + esc(S.periodError) + '</div>' : '';
    var loading = S.baseLoading && !S.baseLoaded ? '<div class="sc3-loading">Memuat posisi SKU terkini…</div>' : '';
    // Preserve mounted chart DOM. Only update the fragment whose data changed.
    var headerHtml=renderHeader(),correctionHtml=renderCorrectionPanel();
    var kpiHtml=overviewKpis(),stockComparison=stockSafetyInfographic();
    var trendHtml='<article class="sc5-panel sc22-trend-panel"><h3>↗ Tren Stok Akhir Bulanan</h3>'+monthlyStockEndInfographic()+'</article>';
    var comparisonHtml='<article class="sc5-panel sc22-compare-panel"><h3>▥ Stok Saat Ini vs Batas Aman</h3>'+stockComparison+'</article>';
    var currentParts={header:headerHtml,kpis:kpiHtml,left:trendHtml,right:comparisonHtml};
    var previous=shell.__sc3Parts;
    var stable=previous&&previous.header===headerHtml&&!S.modal&&!S.correction&&
      !pAlert&&!alert&&!loading&&
      shell.querySelector('.sc8-kpis')&&shell.querySelector('.sc22-trend-panel')&&
      shell.querySelector('.sc22-compare-panel');
    if(stable){
      if(previous.kpis!==kpiHtml)shell.querySelector('.sc8-kpis').outerHTML=kpiHtml;
      if(previous.left!==trendHtml)shell.querySelector('.sc22-trend-panel').outerHTML=trendHtml;
      if(previous.right!==comparisonHtml)shell.querySelector('.sc22-compare-panel').outerHTML=comparisonHtml;
    }else{
      var html=headerHtml+correctionHtml+pAlert+kpiHtml+alert+loading+
        '<div class="sc5-dashboard sc6-dashboard sc22-dashboard" aria-label="Dashboard Stok Hasnaria">'+
          '<div class="sc22-dual">'+trendHtml+comparisonHtml+'</div>'+
        '</div>'+renderModal();
      if(shell.__sc3LastHtml!==html){
        shell.innerHTML=html;
        shell.__sc3LastHtml=html;
      }
    }
    shell.__sc3Parts=currentParts;
    bind(host);
    // Data refresh may rebuild the dialog; keep keyboard focus within the dialog.
    if(preserveDialogFocus)stockDialogFocus(host);
    host.__sc3Rendering = false;
  }


  // Preserve keyboard navigation when the modal DOM is replaced by a Stock render.
  function stockDialogFocus(host) {
    var close=host.querySelector('.sc4-modal .sc4-close');
    if(close&&close.focus)close.focus({preventScroll:true});
  }
  function stockCloseDialog(host) {
    var previous=S.modal;
    S.modal='';
    render();
    var source=host.querySelector('[data-sc4-modal="'+previous+'"]');
    if(source&&source.focus)source.focus({preventScroll:true});
  }
  function stockNavigate(target){
    if(window.__HASNARIA_OWNER_SHELL&&window.__HASNARIA_OWNER_SHELL.navigate){
      window.__HASNARIA_OWNER_SHELL.navigate(target);return true;
    }
    var nav=document.querySelector('[data-tab="'+target+'"]')||
      document.querySelector('[data-page="'+target+'"]');
    if(nav&&nav.click){nav.click();return true}
    return false;
  }

  function bind(host) {
    host.onclick = function (e) {
      var stockChartPage=e.target&&e.target.closest?e.target.closest('[data-sc21-page]'):null;
      if(stockChartPage&&!stockChartPage.disabled){
        S.chartPage=Number(stockChartPage.getAttribute('data-sc21-page'))||1;
        render();return;
      }
      var formulaPage=e.target&&e.target.closest?e.target.closest('[data-sc20-page]'):null;
      if(formulaPage&&S.modal==='formula-audit'&&!formulaPage.disabled){
        S.formulaPage=Number(formulaPage.getAttribute('data-sc20-page'))||1;render();return;
      }
      var combine=e.target&&e.target.closest?e.target.closest('[data-sc18-combined]'):null;
      if(combine&&isOwner()&&S.modal==='recipes'){
        if(S.combinedOpen){S.combinedOpen=false;++S.combinedSeq;S.combinedRows=[];S.combinedLoaded=false;render();}
        else loadCombinedRecipeImpact();
        return;
      }
      var recipePage=e.target&&e.target.closest?e.target.closest('[data-sc19-page]'):null;
      if(recipePage&&isOwner()&&S.modal==='recipes'&&!recipePage.disabled){
        S.recipePage=Number(recipePage.getAttribute('data-sc19-page'))||1;
        render();
        var modalBody=host.querySelector('.sc4-modal-body');
        if(modalBody&&modalBody.scrollTo)modalBody.scrollTo({top:0,behavior:'instant'});
        return;
      }
      var recipeOpen=e.target&&e.target.closest?e.target.closest('[data-sc17-product]'):null;
      if(recipeOpen&&isOwner()&&S.modal==='recipes'){loadRecipeImpact(recipeOpen.getAttribute('data-sc17-product'));return;}
      var recipeBack=e.target&&e.target.closest?e.target.closest('[data-sc17-back]'):null;
      if(recipeBack&&S.modal==='recipes'){S.recipeDetail=null;render();return;}
      var recipeSave=e.target&&e.target.closest?e.target.closest('[data-sc17-save]'):null;
      if(recipeSave&&isOwner()&&S.modal==='recipes'){saveRecipeEvidence();return;}
      var integrationReview=e.target&&e.target.closest?e.target.closest('[data-sc24-review]'):null;
      if(integrationReview&&isOwner()&&S.modal==='formula-audit'){
        var dest=integrationReview.getAttribute('data-sc24-review');
        if(dest==='recipes'){S.modal='recipes';loadRecipeReview();}
        else if(dest==='pembelian')stockNavigate('pembelian');
        return;
      }
      var auditButton = e.target && e.target.closest ? e.target.closest('[data-sc4-audit]') : null;
      if(auditButton){S.modal='position';S.status='ledger-diff';S.page=1;render();stockDialogFocus(host);return;}
      var correction = e.target && e.target.closest ? e.target.closest('[data-sc4-correction]') : null;
      if (correction && S.correction) {
        if (correction.getAttribute('data-sc4-correction') === 'cancel') { S.correction = null; render(); }
        else saveCorrection();
        return;
      }
      var close = e.target && e.target.closest ? e.target.closest('[data-sc4-close]') : null;
      if (close && (e.target === close || close.classList.contains('sc4-close'))) {
        stockCloseDialog(host);
        return;
      }
      var modal = e.target && e.target.closest ? e.target.closest('[data-sc4-modal]') : null;
      if (modal) {
        S.modal = modal.getAttribute('data-sc4-modal') || '';
        if (S.modal === 'ledger' && !S.ledgerLoading) loadLedger();
        else if (S.modal === 'recipes') loadRecipeReview();
        else if (S.modal === 'formula-audit') loadFormulaAudit();
        else render();
        stockDialogFocus(host);
        return;
      }
      var lp = e.target && e.target.closest ? e.target.closest('[data-sc4-ledger-page]') : null;
      if (lp) {
        S.ledgerPage = Number(lp.getAttribute('data-sc4-ledger-page')) || 1;
        render();
        return;
      }
      var note = e.target && e.target.closest ? e.target.closest('[data-sc4-notifications]') : null;
      if (note && isOwner() && window.__HASNARIA_OWNER_SHELL) { window.__HASNARIA_OWNER_SHELL.navigate('notifikasi'); return; }
      var top = e.target && e.target.closest ? e.target.closest('[data-sc4-top-load]') : null;
      if (top) { loadLedger(); return; }
      var mode = e.target && e.target.closest ? e.target.closest('[data-sc4-top-mode]') : null;
      if (mode) { topSkuMode=mode.getAttribute('data-sc4-top-mode')==='out'?'out':'in'; render(); return; }
      var ui4 = e.target && e.target.closest ? e.target.closest('[data-sc4-action]') : null;
      if (ui4 && ui4.getAttribute('data-sc4-action') === 'open-operasional') {
        stockNavigate('operasional');
        return;
      }
      if (ui4 && ui4.getAttribute('data-sc4-action') === 'upload-opname') {
        if(window.__HASNARIA_STOCK_UPLOAD_V1)window.__HASNARIA_STOCK_UPLOAD_V1.open();
        else window.alert('Form upload sedang dimuat. Coba sekali lagi setelah halaman siap.');
        return;
      }
      if (ui4 && ui4.getAttribute('data-sc4-action') === 'upload-purchase') {
        if(!stockNavigate('pembelian'))window.alert('Menu Pembelian tidak ditemukan. Buka melalui sidebar Hasnaria.');
        return;
      }
      if (ui4 && ui4.getAttribute('data-sc4-action') === 'opname') {
        openOpname();
        return;
      }
      var button = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!button) return;
      if (button.hasAttribute('data-sc3-page')) {
        S.page = Number(button.getAttribute('data-sc3-page')) || 1;
        render();
        return;
      }
      if (button.hasAttribute('data-sc3-jump')) {
        var target = button.getAttribute('data-sc3-jump');
        var nav = document.querySelector('[data-tab="' + target + '"]') || document.querySelector('[data-page="' + target + '"]');
        if (nav && nav.click) nav.click();
        return;
      }
      var action = button.getAttribute('data-sc3-action');
      if (action === 'refresh') { loadBase(); loadPeriodData(true); loadVerifiedValuation(true); }
      if (action === 'export' && S.baseLoaded) exportCsv();
    };
    host.oninput = function (e) {
      var el = e.target;
      if(el.id==='sc20FormulaSearch'&&S.modal==='formula-audit'){
        var cursor=el.selectionStart;
        S.formulaSearch=el.value||'';S.formulaPage=1;render();
        var again=document.getElementById('sc20FormulaSearch');
        if(again){again.focus({preventScroll:true});try{again.setSelectionRange(cursor,cursor)}catch(_){}}
        return;
      }
      if(S.recipeDetail&&el.hasAttribute&&el.hasAttribute('data-sc17-field')){
        var field=el.getAttribute('data-sc17-field');
        if(field==='evidence'||field==='reason'||field==='effective')S.recipeDetail[field]=el.value;
        if(field==='decision')S.recipeDetail.decision=el.value;
        if(field==='attested')S.recipeDetail.attested=!!el.checked;
        return;
      }
      if(el.id==='sc19RecipeSearch'&&isOwner()&&S.modal==='recipes'){
        var cursor=el.selectionStart;
        S.recipeSearch=el.value||'';
        S.recipePage=1;
        render();
        var again=document.getElementById('sc19RecipeSearch');
        if(again){again.focus({preventScroll:true});try{again.setSelectionRange(cursor,cursor)}catch(_){}}
        return;
      }
      if (S.correction && (el.id === 'sc4CorrectionPhysical' || el.id === 'sc4CorrectionReason')) {
        if (el.id === 'sc4CorrectionPhysical') S.correction.physical = el.value;
        else S.correction.reason = el.value;
        var it = S.items.find(function(x){return x.inventory_item_id===S.correction.id;});
        var qty = Number(String(S.correction.physical).replace(',','.'));
        var pv = document.getElementById('sc4CorrectionPreview');
        if (pv && it) pv.textContent = S.correction.physical.trim() !== '' && Number.isFinite(qty) && qty >= 0 ?
          'Selisih jika disimpan: ' + signed(qty - num(it.system_qty)) + ' ' + (it.unit || 'unit') : 'Masukkan jumlah fisik terbaru untuk melihat selisih.';
        return;
      }
      if (el.id === 'sc3Search') {
        S.search = el.value || '';
        S.page = 1;
        render();
        var search = document.getElementById('sc3Search');
        if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
      }
    };
    host.onchange = function (e) {
      var el = e.target;
      if(el.id==='sc21StockUnit'){
        S.chartUnit=el.value||'';
        S.chartPage=1;
        render();
        return;
      }
      if(S.recipeDetail&&el.hasAttribute&&el.hasAttribute('data-sc17-field')){
        var field=el.getAttribute('data-sc17-field');
        if(field==='decision')S.recipeDetail.decision=el.value;
        if(field==='attested')S.recipeDetail.attested=!!el.checked;
        if(field==='effective')S.recipeDetail.effective=el.value;
        return;
      }
      if(el.id==='sc19RecipeFilter'&&isOwner()&&S.modal==='recipes'){
        S.recipeFilter=el.value||'all';
        S.recipePage=1;
        render();
        return;
      }
      if (el.id === 'sc4Period') {
        S.period = monthKey(el.value);
        S.overview = null;
        S.activity = [];
        S.ledger = [];
        S.ledgerPage = 1;
        S.modal = '';
        S.trend = [];
        S.monthEndRows = [];
        S.monthEndUnavailable = false;
        S.salesLinkAudit = null;
        S.salesLinkAuditUnavailable = false;
        S.purchaseImportEvidence = null;
        S.purchaseImportEvidenceUnavailable = false;
        ++S.integrationSeq;S.integrationAudit=null;S.integrationPeriod='';S.integrationError='';S.integrationLoading=false;
        ++S.recipeReviewSeq;
        S.recipeReviewLoaded = false;
        S.recipeReviewRows = [];
        S.recipeReviewError = '';
        S.recipeDetail = null;
        S.recipeSearch = '';
        S.recipeFilter = 'all';
        S.recipePage = 1;
        ++S.combinedSeq;
        S.combinedOpen = false;
        S.combinedRows = [];
        S.combinedLoaded = false;
        S.movingRows = [];
        S.movingLoaded = false;
        S.movingError = '';
        loadPeriodData(false);
        return;
      }
      if (el.id === 'sc3Category') { S.category = el.value || ''; S.page = 1; render(); }
      if (el.id === 'sc3Status') { S.status = el.value || ''; S.page = 1; render(); }
    };
    host.onkeydown = function (e) {
      if (e.key === 'Escape' && S.modal) { stockCloseDialog(host); }
    };
  }

  function exportCsv() {
    var rows = [['Material','Kategori','Satuan','Pembelian Setelah Opname','Pemakaian Setelah Opname','Stok Opname','Tanggal Opname','Selisih Opname','Incoming','Min/Par','Kebutuhan','Avg Pemakaian','Days Cover','Status','Saldo']];
    filteredItems().forEach(function (x) {
      rows.push([
        x.item_name, x.category, x.unit, x.purchase_qty, x.sales_usage_qty,
        x.tracking_active ? x.last_physical_qty : '', x.last_opname_date || '', x.last_variance == null ? '' : x.last_variance,
        S.auxLoaded ? x.incoming_qty : '', x.min_qty, S.auxLoaded && x.suggested_order_qty != null ? x.suggested_order_qty : '',
        S.auxLoaded && x.avg_usage != null ? x.avg_usage : '', S.auxLoaded && x.days_cover != null ? x.days_cover : '',
        statusLabel(x.ui_status), x.balance_qty == null ? '' : x.balance_qty
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? '' : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hasnaria-kontrol-stok-' + today() + '.csv';
    document.body.appendChild(a);
    a.click();
    var href = a.href;
    a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(href); } catch (_) {} }, 0);
  }

  function active() {
    var host = document.getElementById('stok');
    return !!(host && !host.classList.contains('hidden'));
  }

  function mount(force) {
    var host = document.getElementById('stok');
    if (!host || !active()) return;
    takeCorrectionRequest();
    ensureCss();
    if (host.querySelector('.sc3-shell') && !force) return;
    render();
    if (!S.periods.length && !S.periodLoading) loadPeriodData(false);
    if (!S.baseLoaded && !S.baseLoading) loadBase();
    else if(S.baseLoaded&&!S.valuationLoaded&&!S.valuationLoading)loadVerifiedValuation();
  }

  function watch() {
    var host = document.getElementById('stok');
    if (!host || host.__sc3Observer) return;
    host.__sc3Observer = new MutationObserver(function () {
      if (host.__sc3Rendering || !active()) return;
      if (!host.querySelector('.sc3-shell')) setTimeout(function () { mount(true); }, 0);
    });
    host.__sc3Observer.observe(host, { childList: true });
  }

  document.addEventListener('click', function (e) {
    var tab = e.target && e.target.closest ? e.target.closest('[data-tab="stok"],.tab') : null;
    if (!tab) return;
    var id = tab.getAttribute('data-tab');
    if (id && id !== 'stok') return;
    if (id === 'stok' || String(tab.textContent || '').trim().toLowerCase() === 'stok') {
      setTimeout(function () { watch(); mount(false); }, 0);
    }
  }, true);

  window.__HASNARIA_STOCK_REVIEW = { openPending: function(){takeCorrectionRequest();if(active()){render();if(!S.baseLoaded&&!S.baseLoading)loadBase();}} };
  window.__HASNARIA_STOCK_REFRESH_VERIFIED = refreshCommittedData;
  document.addEventListener('hasnaria:stock-posted',function(){refreshCommittedData()},true);
  document.addEventListener('hasnaria:write-complete',function(e){
    if(e&&e.detail&&e.detail.module==='stok')refreshCommittedData();
  },true);
  document.addEventListener('hasnaria:purchase-imported',function(){refreshCommittedData()},true);
  document.addEventListener('hasnaria:owner-shell-navigate',function(e){
    if(e.detail&&e.detail.tab==='stok'){
      // Navigation is not a stock write. The initial cache remains usable;
      // real write events and the explicit Refresh button still reload.
      if(S.pendingStockRefresh)refreshCommittedData();
      else mount(false);
    }
  },true);
  ensureCss();
  registerSync();
  document.addEventListener('hasnaria:data-sync-ready', registerSync);
  watch();
  mount(true);
})();
