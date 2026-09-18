const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'erp.js'), 'utf8');

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
