from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"P0 patch anchor missing: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# core-app.js — make the application shell non-blocking and legacy data lazy.
# Owner ERP pages use their own RPCs, so legacy bulk datasets are skipped.
# ---------------------------------------------------------------------------
p = Path("core-app.js")
s = p.read_text()

state_anchor = '  var db, me = null, role = "pending", metrics = [], expenses = [], social = [], roster = [], stock = [], tab = "dashboard";\n'
state_new = state_anchor + '  var legacyLoaded = { metrics:false, expenses:false, purchases:false, social:false, stock:false };\n  var legacyLoading = {};\n'
s = replace_once(s, state_anchor, state_new, "core legacy state")

# Keep profile lookup on the critical path, but move roster/legacy PAR seeding away
# from first paint. The Owner modern ERP does not need either to mount its dashboard.
s = replace_once(
    s,
    '    role = me.role;\n    await loadRoster();\n    if (role === "owner") await seedPar();\n',
    '    role = me.role;\n',
    "bootstrap roster/seed removal",
)

load_pattern = re.compile(r'  async function loadAll\(\) \{.*?\n  \}\n  function show\(id\)', re.S)
load_match = load_pattern.search(s)
if not load_match:
    raise SystemExit("P0 patch anchor missing: core loadAll block")

load_new = '''  function legacyFromDate() {
    var from = new Date(); from.setDate(from.getDate() - 89);
    return from.toISOString().slice(0, 10);
  }
  function onceLegacy(key, loader, force) {
    if (force) legacyLoaded[key] = false;
    if (legacyLoaded[key]) return Promise.resolve();
    if (legacyLoading[key]) return legacyLoading[key];
    legacyLoading[key] = Promise.resolve().then(loader).then(function () {
      legacyLoaded[key] = true;
    }).finally(function () { legacyLoading[key] = null; });
    return legacyLoading[key];
  }
  function loadLegacyMetrics(force) {
    return onceLegacy('metrics', async function () {
      var r = await db.from("daily_metrics").select("*").eq("brand_id", BRAND).gte("metric_date", legacyFromDate()).order("metric_date");
      if (r.error) throw r.error;
      metrics = (r.data || []).map(function (x) { x.pay = parsePay(x.notes); x.cash_revenue = Number(x.cash_revenue || 0); return x; });
    }, force);
  }
  function loadLegacyExpenses(force) {
    return onceLegacy('expenses', async function () {
      var r = await db.from("expenses").select("*").eq("brand_id", BRAND).gte("expense_date", legacyFromDate()).order("expense_date", { ascending: false });
      if (r.error) throw r.error;
      expenses = (r.data || []).map(function (x) {
        var p = parseNotes(x.notes);
        return Object.assign({}, x, { amount: Number(x.amount || 0), status: p.status, displayNotes: p.notes });
      });
    }, force);
  }
  function loadLegacyPurchases(force) {
    return onceLegacy('purchases', async function () {
      var r = await db.from("offline_purchase_history").select("*").eq("brand_id", BRAND).order("purchase_date", { ascending: false }).limit(5000);
      if (r.error) throw r.error;
      purchaseImportRows = r.data || [];
    }, force);
  }
  function loadLegacySocial(force) {
    return onceLegacy('social', async function () {
      var r = await db.from("social_contents").select("*").eq("brand_id", BRAND).gte("posted_at", legacyFromDate()).order("posted_at", { ascending: false });
      if (r.error) throw r.error;
      social = r.data || [];
    }, force);
  }
  function loadLegacyStock(force) {
    return onceLegacy('stock', async function () {
      var r = await db.from("products").select("id,name,selling_price").eq("brand_id", BRAND).like("name", "HASNARIA_PAR|%");
      if (r.error) throw r.error;
      stock = (r.data || []).map(function (row) {
        var p = parsePar(row.name, row.selling_price);
        if (p) p.id = row.id;
        return p;
      }).filter(Boolean);
      var cfg = await db.from("products").select("selling_price").eq("brand_id", BRAND).like("name", "HASNARIA_CFG|daily_target%").maybeSingle();
      if (cfg.data && Number(cfg.data.selling_price) > 0) TARGET = Number(cfg.data.selling_price);
    }, force);
  }
  function legacyRequirements(id, force) {
    if (role === "owner") return [];
    if (id === "dashboard") return [loadLegacyMetrics(force), loadLegacyExpenses(force), loadLegacySocial(force), loadLegacyStock(force)];
    if (id === "sales") return [loadLegacyMetrics(force)];
    if (id === "pembelian") return [loadLegacyExpenses(force), loadLegacyPurchases(force)];
    if (id === "ops" || id === "approval") return [loadLegacyExpenses(force)];
    if (id === "stok") return [loadLegacyStock(force)];
    if (id === "shift" || id === "social") return [loadLegacySocial(force)];
    if (id === "team") return [loadLegacySocial(force), loadRoster()];
    return [];
  }
  function ensureLegacyForTab(id, force) {
    var jobs = legacyRequirements(id || tab, !!force);
    return jobs.length ? Promise.all(jobs) : Promise.resolve();
  }
  function scheduleLegacyTabData(id) {
    var target = id || tab;
    ensureLegacyForTab(target, false).then(function () {
      if (tab === target) render();
    }).catch(function (e) {
      if (console && console.warn) console.warn('Hasnaria lazy data:', e);
    });
  }
  async function loadAll() {
    await ensureLegacyForTab(tab, true);
  }
  function show(id)'''
s = s[: load_match.start()] + load_new + s[load_match.end() :]

s = replace_once(
    s,
    '    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === id); });\n    render();\n  }\n  function tabs() {',
    '    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === id); });\n    render();\n    scheduleLegacyTabData(id);\n  }\n  function tabs() {',
    "core setTab lazy schedule",
)

s = replace_once(
    s,
    '      await loadAll();\n      show("app");\n      render();',
    '      show("app");\n      render();\n      scheduleLegacyTabData(tab);',
    "core non-blocking enter",
)

# Explicit successful import becomes the Stock sync trigger.
s = replace_once(
    s,
    '$("purchaseUploadStatus").textContent="Upload berhasil. Data Pembelian sudah diperbarui.";purchaseReadyRows=null;await loadAll();render();',
    '$("purchaseUploadStatus").textContent="Upload berhasil. Data Pembelian sudah diperbarui.";purchaseReadyRows=null;try{document.dispatchEvent(new CustomEvent("hasnaria:purchase-imported",{detail:{period:rows[0]&&rows[0].source_period||""}}));}catch(_){}await loadAll();render();',
    "core Purchase import event",
)

p.write_text(s)


# ---------------------------------------------------------------------------
# app.js — lazy-load Purchase/XLSX and Stock, keeping only core/owner shell eager.
# ---------------------------------------------------------------------------
p = Path("app.js")
s = p.read_text()
s = replace_once(s, "var CORE = '/core-app.js?v=7';", "var CORE = '/core-app.js?v=8';", "app core cache")
s = replace_once(
    s,
    "  var STOCK = '/stock-monitor.js?v=28';\n",
    "  var STOCK = '/stock-monitor.js?v=28';\n  var PURCHASE = '/xlsx-preload.js?v=6';\n",
    "app Purchase runtime constant",
)

sales_anchor = "  window.__HASNARIA_LOAD_SALES=ensureSalesRuntime;\n"
lazy_block = sales_anchor + """  var purchaseRuntimePromise=null;
  function ensurePurchaseRuntime(){if(purchaseRuntimePromise)return purchaseRuntimePromise;purchaseRuntimePromise=loadOnce('hasnaria-purchase-runtime',PURCHASE);return purchaseRuntimePromise;}
  window.__HASNARIA_LOAD_PURCHASE=ensurePurchaseRuntime;
  var stockRuntimePromise=null;
  function ensureStockRuntime(){if(stockRuntimePromise)return stockRuntimePromise;stockRuntimePromise=loadOnce('hasnaria-stock-runtime',STOCK).then(function(){fixStockLayout();setTimeout(fixStockLayout,150);setTimeout(fixStockLayout,500);});return stockRuntimePromise;}
  window.__HASNARIA_LOAD_STOCK=ensureStockRuntime;
"""
s = replace_once(s, sales_anchor, lazy_block, "app lazy runtime functions")

after_pattern = re.compile(r'  function afterCore\(\)\{.*?\n  \}\n  window\.hasnariaGoogleHref', re.S)
m = after_pattern.search(s)
if not m:
    raise SystemExit("P0 patch anchor missing: app afterCore")
after_new = '''  function afterCore(){
    load(OWNER_SHELL);
    document.addEventListener('click',function(e){
      var tab=e.target&&e.target.closest?e.target.closest('[data-tab]'):null;
      if(tab){var target=tab.getAttribute('data-tab');if(target==='sales')ensureSalesRuntime();else if(target==='pembelian')ensurePurchaseRuntime();else if(target==='stok')ensureStockRuntime();}
      var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var id=b.id||'',watch=id==='sSave'||id==='oSave'||id==='cSave'||id==='lzSave'||id==='svOpen'||id==='svHand'||id==='svClose'||b.hasAttribute('data-stk')||b.hasAttribute('data-ok')||b.hasAttribute('data-no')||b.hasAttribute('data-lzok')||b.hasAttribute('data-lzno');if(!watch)return;if(b.getAttribute('data-busy')==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.setAttribute('data-busy','1');setTimeout(function(){try{b.removeAttribute('data-busy');}catch(_){}},1800);
    },true);
    setTimeout(function(){
      var sales=document.getElementById('sales');if(sales&&!sales.classList.contains('hidden'))ensureSalesRuntime();
      var purchase=document.getElementById('pembelian');if(purchase&&!purchase.classList.contains('hidden'))ensurePurchaseRuntime();
      var stock=document.getElementById('stok');if(stock&&!stock.classList.contains('hidden'))ensureStockRuntime();
    },250);
  }
  window.hasnariaGoogleHref'''
s = s[: m.start()] + after_new + s[m.end() :]
p.write_text(s)


# ---------------------------------------------------------------------------
# index.html — SheetJS is heavy and only required for import; do not block login.
# Both Sales and Purchase have lazy SheetJS loaders already.
# ---------------------------------------------------------------------------
p = Path("index.html")
s = p.read_text()
s = replace_once(
    s,
    '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0"></script>',
    "index eager SheetJS",
)
p.write_text(s)


# ---------------------------------------------------------------------------
# Purchase canonical runtime — period reads are read-only. Quantity sync occurs
# only after successful Purchase import, not whenever the page is rendered.
# ---------------------------------------------------------------------------
p = Path("purchase-finance-alignment-v1.js")
s = p.read_text()
s = replace_once(
    s,
    "__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V10",
    "__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V11",
    "Purchase guard declaration",
)
s = s.replace("__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V10", "__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V11")

auto_sync = "    if(n(control.stock_ready_rows)>0){var synced=await syncStockForPeriod();if(synced){loading=false;rows=[];control={};loadedAt=0;loadedPeriod='';return load(true)}}\n"
s = replace_once(s, auto_sync, "", "Purchase render-time stock sync")

boot_anchor = "    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn,[data-tab=\"pembelian\"]'):null;if(!b)return;if(b.matches('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn'))setTimeout(function(){rows=[];control={};loadedAt=0;loadedPeriod='';lastStockSync='';category='all';load(true)},350);else setTimeout(schedule,120)},true);\n    load(true);return\n"
boot_new = "    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn,[data-tab=\"pembelian\"]'):null;if(!b)return;if(b.matches('#paUpload,#purchaseExcelBtn,#purchaseMajooBtn'))setTimeout(function(){rows=[];control={};loadedAt=0;loadedPeriod='';lastStockSync='';category='all';load(true)},350);else setTimeout(schedule,120)},true);\n    document.addEventListener('hasnaria:purchase-imported',function(){lastStockSync='';syncStockForPeriod().then(function(){rows=[];control={};loadedAt=0;loadedPeriod='';load(true)})},true);\n    load(true);return\n"
s = replace_once(s, boot_anchor, boot_new, "Purchase import-triggered stock sync")
p.write_text(s)

p = Path("xlsx-preload.js")
s = p.read_text()
s = replace_once(s, "purchase-finance-alignment-v1.js?v=5", "purchase-finance-alignment-v1.js?v=6", "Purchase alignment cache")
p.write_text(s)


# ---------------------------------------------------------------------------
# Regression tests — protect P0 startup behavior from being reintroduced.
# ---------------------------------------------------------------------------
p = Path("tests/erp-tracker.test.js")
s = p.read_text()
s = replace_once(
    s,
    "const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');\n",
    "const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');\nconst coreSource = fs.readFileSync(path.join(root, 'core-app.js'), 'utf8');\nconst indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');\n",
    "tests core/index source",
)
s = replace_once(
    s,
    "assert(appSource.includes(\"load('/xlsx-preload.js?v=6');\"), 'Purchase preload must load once after Owner shell');",
    "assert(!appSource.includes(\"load('/xlsx-preload.js?v=6');\"), 'Purchase/XLSX must not load unconditionally at startup');\nassert(appSource.includes('window.__HASNARIA_LOAD_PURCHASE=ensurePurchaseRuntime'), 'Purchase runtime must be exposed as a lazy loader');\nassert(appSource.includes('window.__HASNARIA_LOAD_STOCK=ensureStockRuntime'), 'Stock runtime must be exposed as a lazy loader');\nassert(appSource.includes(\"target==='pembelian'\") && appSource.includes(\"target==='stok'\"), 'Purchase and Stock runtimes must load from tab navigation');\nassert(!indexSource.includes('xlsx.full.min.js'), 'SheetJS must not block initial page/login loading');",
    "tests startup lazy asserts",
)
s = replace_once(
    s,
    "assert(!/function afterCore\\(\\)[\\s\\S]*?load\\(SALES[,)]/.test(appSource), 'Sales must not be fetched unconditionally during application startup');\n",
    "assert(!/function afterCore\\(\\)[\\s\\S]*?load\\(SALES[,)]/.test(appSource), 'Sales must not be fetched unconditionally during application startup');\nassert(!/function afterCore\\(\\)[\\s\\S]*?load\\(STOCK[,)]/.test(appSource), 'Stock must not be fetched unconditionally during application startup');\nassert(coreSource.includes('scheduleLegacyTabData(tab);'), 'core app must show/render before lazy legacy data finishes');\nassert(coreSource.includes('legacyRequirements(id, force)') && coreSource.includes('if (role === \\\"owner\\\") return [];'), 'Owner startup must bypass legacy bulk datasets');\nassert(!coreSource.includes('await loadAll();\\n      show(\\\"app\\\");'), 'app shell must not wait for legacy loadAll before becoming visible');\n",
    "tests core nonblocking asserts",
)
s = replace_once(
    s,
    "assert(purchasePreloadSource.includes(\"purchase-finance-alignment-v1.js?v=5\"), 'canonical Purchase runtime cache version must be current');",
    "assert(purchasePreloadSource.includes(\"purchase-finance-alignment-v1.js?v=6\"), 'canonical Purchase runtime cache version must be current');",
    "tests Purchase cache",
)
s = replace_once(
    s,
    "assert(purchaseFinanceSource.includes('__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V10'), 'Purchase runtime must use the v10 idempotency guard');",
    "assert(purchaseFinanceSource.includes('__HASNARIA_PURCHASE_FINANCE_ALIGNMENT_V11'), 'Purchase runtime must use the v11 idempotency guard');",
    "tests Purchase guard",
)
stock_assert = "assert(purchaseFinanceSource.includes(\"sync_purchase_quantity_stock_v1\"), 'Purchase screen must sync eligible quantities into Stock');"
s = replace_once(
    s,
    stock_assert,
    stock_assert
    + "\nassert(!purchaseFinanceSource.includes('if(n(control.stock_ready_rows)>0)'), 'opening/rendering Purchase must not trigger Stock synchronization');"
    + "\nassert(purchaseFinanceSource.includes(\"addEventListener('hasnaria:purchase-imported'\"), 'Stock synchronization must be triggered by a successful Purchase import event');",
    "tests event stock sync",
)
p.write_text(s)

print("P0 patch applied to working tree")
