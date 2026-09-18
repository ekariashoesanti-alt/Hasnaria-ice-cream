const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'erp.js'), 'utf8');
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
  console.log('ERP shell integration wiring: PASS');
}

async function renderFixture(data, error) {
  const nodes = new Map();
  const document = {getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {innerHTML:'', classList:{add(){}}, close(){}, showModal(){}});
    return nodes.get(id);
  }};
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
