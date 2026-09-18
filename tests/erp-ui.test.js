const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'erp.js'), 'utf8');
const actionSource = fs.readFileSync(path.join(ROOT, 'erp-actions.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const coreSource = fs.readFileSync(path.join(ROOT, 'core-app.js'), 'utf8');

function assertShellIntegration() {
  for (const id of ['dashboard','sales','pembelian','ops','stok','shift','social','approval','team','sistem']) {
    assert.match(indexSource, new RegExp(`id=["']${id}["']`), `index keeps legacy module host #${id}`);
  }

  const erpScript = indexSource.indexOf('<script src="/erp.js?v=ui1"></script>');
  const appScript = indexSource.indexOf('<script src="/app.js?v=p053"></script>');
  assert.ok(erpScript >= 0, 'ERP runtime is loaded by index');
  assert.ok(appScript > erpScript, 'ERP runtime loads before app/core rendering begins');

  const sharedDb = appSource.indexOf('window.__HASNARIA_DB=sharedAuthClient');
  const startCore = appSource.indexOf('function startCore()');
  assert.ok(sharedDb >= 0, 'shared authenticated Supabase client is exported for ERP UI');
  assert.ok(startCore > sharedDb, 'Supabase client is exported before core-app can load');

  const context = coreSource.indexOf('window.__HASNARIA_CONTEXT = {brandId:BRAND,userId:me.userId,role:role,navigate:setTab};');
  const legacyDashboard = coreSource.indexOf('$("dashboard").innerHTML =');
  const mount = coreSource.indexOf('window.HasnariaERP.mount()', legacyDashboard);
  const salesRender = coreSource.indexOf('$("sales").innerHTML =', mount);
  assert.ok(context >= 0, 'core-app exports authenticated Hasnaria context');
  assert.ok(legacyDashboard >= 0 && mount > legacyDashboard, 'ERP mount replaces the legacy dashboard after legacy render starts');
  assert.ok(context < mount, 'brand/user/role context exists before ERP mount');
  assert.ok(salesRender > mount, 'legacy Sales module still renders after ERP dashboard mount');

  for (const marker of [
    '$("pembelian").innerHTML =',
    '$("ops").innerHTML =',
    '$("stok").innerHTML ='
  ]) assert.ok(coreSource.includes(marker), `core-app still owns existing module: ${marker}`);

  for (const contract of [
    'get_ui_bootstrap_v4',
    'ui_erp_action_queue_v4',
    'ui_inventory_items',
    'ui_hpp_blockers',
    'ui_recent_erp_audit'
  ]) assert.ok(source.includes(contract), `ERP UI keeps backend contract ${contract}`);

  assert.ok(source.includes('context().navigate(value)'), 'ERP detail actions route back into existing modules');
  assert.ok(source.includes('/erp-actions.js?v=1'), 'ERP action forms are lazy-loaded as a production runtime asset');
  assert.ok(source.includes('hasnaria:erp-action-resolved'), 'successful ERP action resolution refreshes dashboard contracts');
  console.log('ERP shell integration wiring: PASS');
}

function assertActionContracts() {
  const window = {__HASNARIA_CONTEXT:{brandId:'hasnaria',userId:'owner',role:'owner'}};
  vm.runInNewContext(actionSource, {window,document:{},Date,console,AbortSignal,FormData:function(){},CustomEvent:function(){}});
  const api = window.HasnariaERPActions;
  assert.ok(api, 'ERP action module exports API');

  for (const type of ['pack_conversion','recipe_verification','sale_item_mapping','selling_price_confirmation','inventory_baseline_confirmation','financing_payment_review','invalid_purchase_qty']) {
    assert.equal(api.canHandle(type), true, `${type} is directly resolvable`);
  }
  for (const type of ['unmatched_purchase','unverified_inventory','zero_amount_purchase','missing_recipe','missing_component_cost','untracked_stock']) {
    assert.equal(api.canHandle(type), false, `${type} stays manual until row-specific safe input exists`);
  }

  const request = (action, values) => JSON.parse(JSON.stringify(api._buildRequest(action, values)));
  assert.deepEqual(request({action_type:'pack_conversion',metadata:{conversion_id:'c1'}},{units_per_purchase_unit:'50',reason:'Kemasan supplier'}), {
    rpc:'resolve_inventory_conversion',params:{p_conversion_id:'c1',p_units_per_purchase_unit:50,p_reason:'Kemasan supplier'}
  });
  assert.deepEqual(request({action_type:'recipe_verification',metadata:{product_id:'p1'}},{effective_from:'2026-09-18',reason:'BOM diperiksa'}), {
    rpc:'resolve_product_recipe_verification_v2',params:{p_product_id:'p1',p_verified:true,p_effective_from:'2026-09-18',p_reason:'BOM diperiksa'}
  });
  assert.deepEqual(request({action_type:'sale_item_mapping',subject:'MUKBANG RABOKKI',metadata:{suggested_product_id:'p2'}},{reason:'Nama transaksi sama'}), {
    rpc:'resolve_sale_item_product_mapping',params:{p_source_name:'MUKBANG RABOKKI',p_product_id:'p2',p_reason:'Nama transaksi sama'}
  });
  assert.deepEqual(request({action_type:'selling_price_confirmation',metadata:{product_id:'p3'}},{selling_price:'15000',reason:'Konfirmasi owner'}), {
    rpc:'resolve_product_selling_price',params:{p_product_id:'p3',p_selling_price:15000,p_reason:'Konfirmasi owner'}
  });
  assert.deepEqual(request({action_type:'inventory_baseline_confirmation',metadata:{source_history_id:'h1'}},{reason:'Sesuai stock akhir Juli'}), {
    rpc:'resolve_inventory_baseline_candidate',params:{p_source_history_id:'h1',p_reason:'Sesuai stock akhir Juli'}
  });
  assert.deepEqual(request({action_type:'financing_payment_review',metadata:{source_history_id:'h2'}},{resolution:'liability_only',reason:'Belum ada bukti kas keluar'}), {
    rpc:'resolve_financing_payment_candidate',params:{p_source_history_id:'h2',p_resolution:'liability_only',p_cash_date:null,p_cash_amount:null,p_reason:'Belum ada bukti kas keluar'}
  });
  assert.deepEqual(request({action_type:'financing_payment_review',metadata:{source_history_id:'h3'}},{resolution:'cash_paid',cash_date:'2026-09-18',cash_amount:'82000',reason:'Mutasi bank terverifikasi'}), {
    rpc:'resolve_financing_payment_candidate',params:{p_source_history_id:'h3',p_resolution:'cash_paid',p_cash_date:'2026-09-18',p_cash_amount:82000,p_reason:'Mutasi bank terverifikasi'}
  });
  assert.deepEqual(request({action_type:'invalid_purchase_qty',metadata:{}},{source_history_id:'h5',effective_qty:'3',reason:'Dokumen sumber'}), {
    rpc:'resolve_purchase_quantity_override',params:{p_source_history_id:'h5',p_effective_qty:3,p_reason:'Dokumen sumber'}
  });
  assert.ok(actionSource.includes('ui_invalid_quantity_queue'), 'invalid quantity resolution loads source rows before mutation');
  assert.throws(()=>api._buildRequest({action_type:'pack_conversion',metadata:{conversion_id:'c1'}},{units_per_purchase_unit:'0',reason:'x'}),/lebih dari 0/);
  assert.throws(()=>api._buildRequest({action_type:'financing_payment_review',metadata:{source_history_id:'h4'}},{resolution:'cash_paid',reason:'x'}),/Tanggal pembayaran kas/);
  assert.throws(()=>api._buildRequest({action_type:'invalid_purchase_qty',metadata:{}},{source_history_id:'',effective_qty:'3',reason:'x'}),/Pilih baris pembelian/);
  assert.throws(()=>api._buildRequest({action_type:'invalid_purchase_qty',metadata:{}},{source_history_id:'h5',effective_qty:'0',reason:'x'}),/lebih dari 0/);
  console.log('ERP action RPC contracts and safety gates: PASS');
}

async function renderFixture(data, error) {
  const nodes = new Map();
  const document = {
    head:{appendChild(){}},
    addEventListener(){},
    createElement(){return {};},
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, {innerHTML:'', classList:{add(){}}, close(){}, showModal(){}});
      return nodes.get(id);
    }
  };
  let calls = 0;
  const window = {__HASNARIA_CONTEXT:{brandId:'hasnaria',userId:'owner',role:'owner'},
    __HASNARIA_DB:{rpc(name) {
      assert.equal(name, 'get_ui_bootstrap_v4');calls++;
      return {abortSignal:async()=>({data,error})};
    }}};
  vm.runInNewContext(source, {window,document,AbortSignal,Date,console});
  window.HasnariaERP.mount();
  await new Promise(resolve=>setImmediate(resolve));
  return {html:nodes.get('dashboard').innerHTML,calls};
}

(async()=>{
  assertShellIntegration();
  assertActionContracts();
  const empty = await renderFixture({owner:{brand_id:'hasnaria'},monthly_trend:[{month:'2026-09-01',gross_profit_verified:null,operating_profit_verified:null}]});
  assert.equal(empty.calls,1);
  assert.match(empty.html,/Belum tersedia/);
  assert.doesNotMatch(empty.html,/Rp0/);
  const scoped = await renderFixture({owner:{brand_id:'other-brand'}});
  assert.match(scoped.html,/Data tidak sesuai brand akun/);
  assert.doesNotMatch(scoped.html,/Tren omzet bulanan/);
  const failure=await renderFixture(null,{message:'Statement timeout'});
  assert.match(failure.html,/Coba lagi/);
  assert.match(failure.html,/Statement timeout/);
  console.log('ERP UI verified metrics, brand boundary and retry: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
