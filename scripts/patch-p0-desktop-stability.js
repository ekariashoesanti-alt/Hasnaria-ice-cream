const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const DIST=path.join(process.cwd(),'dist');
function fp(name){const p=path.join(DIST,name);if(!fs.existsSync(p))throw new Error(`dist/${name} missing`);return p}
function one(s,a,b,label){const i=s.indexOf(a);if(i<0)throw new Error(`${label}: marker missing`);if(s.indexOf(a,i+a.length)>=0)throw new Error(`${label}: marker ambiguous`);return s.slice(0,i)+b+s.slice(i+a.length)}
function reOne(s,re,b,label){const m=s.match(re);if(!m||m.length!==1)throw new Error(`${label}: regex count ${m?m.length:0}`);return s.replace(re,b)}
function save(name,s){const p=fp(name);fs.writeFileSync(p,s);const r=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});if(r.status!==0)throw new Error(`${name}: syntax check failed`)}
function patch(name,fn){let s=fs.readFileSync(fp(name),'utf8');s=fn(s);save(name,s);console.log(`P0 patched ${name}`)}

patch('owner-shell-guard.js',s=>{
 s=one(s,"var state={active:'dashboard',initialized:false,scheduled:false,salesRetries:0,finStockLoad:null,operationalLoad:null,dashboardLoad:null};","var state={active:'dashboard',initialized:false,scheduled:false,salesRetries:0,finStockLoad:null,operationalLoad:null,dashboardLoad:null,navEpoch:0};",'owner state');
 const old=`  function safeNavigate(id){\n    if(!isOwner()||OWNER_TABS.indexOf(id)<0)return false;\n    state.active=id;state.initialized=true;state.salesRetries=0;setExecutiveFlag(id==='dashboard');setVisibility(id);patchContext();\n    if(id==='dashboard')ensureDashboard();\n    if(id==='sales')ensureSales();\n    if(id==='pembelian')ensurePurchase();\n    if(id==='operasional')ensureOperational(true);\n    if(id==='ops')ensureFinance(true);\n    if(id==='stok')ensureStock(true);\n    return true;\n  }`;
 const neu=`  function safeNavigate(id){\n    if(!isOwner()||OWNER_TABS.indexOf(id)<0)return false;\n    var epoch=++state.navEpoch;\n    state.active=id;state.initialized=true;state.salesRetries=0;setExecutiveFlag(id==='dashboard');setVisibility(id);patchContext();\n    try{document.dispatchEvent(new CustomEvent('hasnaria:owner-tab-change',{detail:{tab:id,epoch:epoch}}))}catch(_){}\n    if(id==='dashboard')ensureDashboard();\n    if(id==='sales')ensureSales();\n    if(id==='pembelian')ensurePurchase();\n    if(id==='operasional')ensureOperational(true);\n    if(id==='ops')ensureFinance(true);\n    if(id==='stok')ensureStock(true);\n    return true;\n  }`;
 s=one(s,old,neu,'owner navigation');
 s=one(s,"window.__HASNARIA_OWNER_SHELL={navigate:safeNavigate,isOwner:isOwner,getActive:function(){return state.active},reconcile:reconcile};","window.__HASNARIA_OWNER_SHELL={navigate:safeNavigate,isOwner:isOwner,getActive:function(){return state.active},getEpoch:function(){return state.navEpoch},isCurrent:function(tab,epoch){return isOwner()&&state.active===tab&&(epoch==null||state.navEpoch===epoch)},reconcile:reconcile};",'owner lifecycle api');
 return s;
});

patch('sales-board.js',s=>one(s,
`  document.addEventListener('click', function (e) {\n    var t = e.target && e.target.closest ? e.target.closest('[data-tab="sales"],.tab') : null;`,
`  document.addEventListener('click', function (e) {\n    if(window.__HASNARIA_OWNER_SHELL&&window.__HASNARIA_OWNER_SHELL.isOwner&&window.__HASNARIA_OWNER_SHELL.isOwner())return;\n    var t = e.target && e.target.closest ? e.target.closest('[data-tab="sales"],.tab') : null;`,
'sales owner click'));

patch('purchase-lazy-loader.js',s=>one(s,
`    if (!tab) return;\n    setTimeout(maybeLoad, 30);`,
`    if (!tab) return;\n    if(window.__HASNARIA_OWNER_SHELL&&window.__HASNARIA_OWNER_SHELL.isOwner&&window.__HASNARIA_OWNER_SHELL.isOwner())return;\n    setTimeout(maybeLoad, 30);`,
'purchase owner click'));

patch('purchase-finance-alignment-v1.js',s=>{
 s=one(s,"var db=null,rows=[],control={},loading=false,error='',observer=null,timer=0,loadedAt=0,loadedPeriod='',syncingStock=false,lastStockSync='',category='all';","var db=null,rows=[],control={},loading=false,error='',observer=null,timer=0,loadedAt=0,loadedPeriod='',syncingStock=false,lastStockSync='',category='all',requestSeq=0;",'purchase seq');
 s=one(s,
`  var root=document.getElementById('paRoot');if(!root)return;patchCore(root);\n  var old=document.getElementById('purchaseFinanceAlignment');if(old)old.remove();\n  var target=root.querySelector('.pa-controls');if(!target)return;\n  var wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';`,
`  var root=document.getElementById('paRoot');if(!root)return;patchCore(root);\n  var target=root.querySelector('.pa-controls');if(!target)return;\n  var wrap=document.getElementById('purchaseFinanceAlignment');\n  if(!wrap){wrap=document.createElement('section');wrap.id='purchaseFinanceAlignment';wrap.className='pfa-wrap';target.insertAdjacentElement('afterend',wrap)}`,
'purchase stable root');
 s=one(s,";target.insertAdjacentElement('afterend',wrap);return}",";return}",'purchase loading reuse');
 s=one(s,";target.insertAdjacentElement('afterend',wrap);var rb=document.getElementById('pfaRetry')",";var rb=document.getElementById('pfaRetry')",'purchase error reuse');
 s=one(s,"  target.insertAdjacentElement('afterend',wrap);\n}","}\n",'purchase final reuse');
 const old=`async function load(force){\n  var p=periodValue();if(!p||loading)return;\n  if(!force&&rows.length&&loadedPeriod===p&&Date.now()-loadedAt<60000){render();return}\n  db=db||window.__HASNARIA_DB;if(!db)return;loading=true;error='';render();\n  try{\n    var q=await db.rpc('get_purchase_control_period_v1',{p_brand:BRAND,p_period:p+'-01'});if(q.error)throw q.error;\n    var pack=q.data||{};rows=Array.isArray(pack.rows)?pack.rows:[];control=pack.control||{};loadedAt=Date.now();loadedPeriod=p;\n  }catch(e){rows=[];control={};loadedPeriod='';loadedAt=0;error='Gagal memuat hubungan Pembelian / Finance / Stok: '+(e&&e.message?e.message:String(e))}\n  loading=false;render();\n}`;
 const neu=`async function load(force){\n  var p=periodValue();if(!p)return;\n  if(loading){if(force)requestSeq++;return}\n  if(!force&&rows.length&&loadedPeriod===p&&Date.now()-loadedAt<60000){render();return}\n  var seq=++requestSeq;db=db||window.__HASNARIA_DB;if(!db)return;loading=true;error='';render();\n  try{\n    var q=await db.rpc('get_purchase_control_period_v1',{p_brand:BRAND,p_period:p+'-01'});if(q.error)throw q.error;if(seq!==requestSeq)return;\n    var pack=q.data||{};rows=Array.isArray(pack.rows)?pack.rows:[];control=pack.control||{};loadedAt=Date.now();loadedPeriod=p;\n  }catch(e){if(seq!==requestSeq)return;rows=[];control={};loadedPeriod='';loadedAt=0;error='Gagal memuat hubungan Pembelian / Finance / Stok: '+(e&&e.message?e.message:String(e))}\n  finally{if(seq===requestSeq){loading=false;render()}else{loading=false;setTimeout(function(){if(periodValue())load(true)},0)}}\n}`;
 s=one(s,old,neu,'purchase stale guard');return s;
});

patch('operational-v1.js',s=>{
 s=one(s,"    h.innerHTML='<div class=\"op1-shell\" data-operational-v1=\"1\"><div class=\"op1-head\">","    var shell=h.querySelector('[data-operational-v1=\"1\"]');if(!shell){shell=document.createElement('div');shell.className='op1-shell';shell.setAttribute('data-operational-v1','1');h.replaceChildren(shell)}\n    shell.innerHTML='<div class=\"op1-head\">",'operational stable root');
 s=one(s,"      '<div class=\"op1-foot\"><span>Loading policy</span><b>30 run header → 25 item/page → pegawai hanya saat create.</b></div></div>';","      '<div class=\"op1-foot\"><span>Loading policy</span><b>30 run header → 25 item/page → pegawai hanya saat create.</b></div>';",'operational close');return s;
});

patch('finance-accuracy-v6.js',s=>{
 const a="function ensureRoot(){var h=getHost();if(!h||h.classList.contains('hidden'))return null;var r=h.querySelector('[data-finance-v6=\"1\"]');if(r)return r;h.innerHTML='<div class=\"fsv2-shell finv7-root\" data-finance-v6=\"1\"><div class=\"fsv2-report\" style=\"min-height:220px;display:grid;place-items:center\"><span class=\"finv7-spinner\"></span></div></div>';return h.querySelector('[data-finance-v6=\"1\"]')}";
 const b="function ensureRoot(){var h=getHost();if(!h||h.classList.contains('hidden'))return null;var r=h.querySelector('[data-finance-v6=\"1\"]');if(r)return r;var boot=h.querySelector('[data-finance-boot=\"1\"]');if(boot){boot.className='fsv2-shell finv7-root';boot.removeAttribute('data-finance-boot');boot.setAttribute('data-finance-v6','1');boot.innerHTML='<div class=\"fsv2-report\" style=\"min-height:220px;display:grid;place-items:center\"><span class=\"finv7-spinner\"></span></div>';return boot}h.innerHTML='<div class=\"fsv2-shell finv7-root\" data-finance-v6=\"1\"><div class=\"fsv2-report\" style=\"min-height:220px;display:grid;place-items:center\"><span class=\"finv7-spinner\"></span></div></div>';return h.querySelector('[data-finance-v6=\"1\"]')}";
 return one(s,a,b,'finance boot reuse');
});

patch('stock-v3-runtime-fix.js',s=>one(s,
"    if(!visible(h)||h.querySelector('.sc3-shell'))return;\n    h.innerHTML='<div data-stock-v4=\"1\" data-stock-v3-boot=\"1\" class=\"sc3-boot\"><strong>Stok &amp; Kebutuhan Material</strong><span>Memuat posisi persediaan terkini…</span></div>';",
"    if(!visible(h)||h.querySelector('.sc3-shell,[data-stock-v3-boot=\"1\"]'))return;\n    var boot=document.createElement('div');boot.setAttribute('data-stock-v4','1');boot.setAttribute('data-stock-v3-boot','1');boot.className='sc3-boot';boot.innerHTML='<strong>Stok &amp; Kebutuhan Material</strong><span>Memuat posisi persediaan terkini…</span>';h.replaceChildren(boot);",
'stock stable boot'));

patch('stock-control-v3.js',s=>{
 const a=`    host.__sc3Rendering = true;\n    var alert = S.error ? '<div class="sc3-alert">' + esc(S.error) + '</div>' : '';\n    var loading = S.baseLoading && !S.baseLoaded ? '<div class="sc3-loading">Memuat data utama persediaan…</div>' : '';\n    var refresh = S.baseLoading && S.baseLoaded ? '<div class="sc3-auxbar"><span class="sc3-pulse"></span>Memperbarui data utama tanpa mengosongkan tabel…</div>' : '';\n    host.innerHTML = '<div class="sc3-shell">' + renderHeader() + alert + loading + (S.baseLoaded ? refresh + renderFormula() + renderAuxState() + renderFilters() + renderTable() + renderNotes() : '') + '</div>';\n    bind(host);\n    host.__sc3Rendering = false;`;
 const b=`    host.__sc3Rendering = true;\n    var shell = host.querySelector('.sc3-shell,[data-stock-v3-boot="1"]');\n    if (!shell) { shell = document.createElement('div'); host.replaceChildren(shell); }\n    shell.className = 'sc3-shell'; shell.removeAttribute('data-stock-v3-boot'); shell.setAttribute('data-stock-v4','1');\n    var alert = S.error ? '<div class="sc3-alert">' + esc(S.error) + '</div>' : '';\n    var loading = S.baseLoading && !S.baseLoaded ? '<div class="sc3-loading">Memuat data utama persediaan…</div>' : '';\n    var refresh = S.baseLoading && S.baseLoaded ? '<div class="sc3-auxbar"><span class="sc3-pulse"></span>Memperbarui data utama tanpa mengosongkan tabel…</div>' : '';\n    shell.innerHTML = renderHeader() + alert + loading + (S.baseLoaded ? refresh + renderFormula() + renderAuxState() + renderFilters() + renderTable() + renderNotes() : '');\n    bind(host);\n    host.__sc3Rendering = false;`;
 return one(s,a,b,'stock stable root');
});

console.log('P0 desktop stability: PASS');
