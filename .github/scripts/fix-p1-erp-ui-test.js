const fs = require('fs');
const file = 'tests/erp-ui.test.js';
let s = fs.readFileSync(file, 'utf8');
function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error('P1 test anchor missing: ' + label);
  s = s.replace(oldText, newText);
}
replaceOnce('/erp.js?v=ui1', '/erp.js?v=ui2', 'ERP cache');
replaceOnce("['get_ui_bootstrap_v5','ui_erp_action_queue_v4','ui_inventory_items','ui_recent_erp_audit']", "['get_ui_bootstrap_v6','get_ui_action_queue_active_v1','ui_inventory_items','ui_recent_erp_audit']", 'backend contracts');
replaceOnce(
  "  const window = {__HASNARIA_CONTEXT:{brandId:'hasnaria',userId:'owner',role:'owner'},__HASNARIA_DB:{rpc(name) {assert.equal(name, 'get_ui_bootstrap_v5');calls++;return {abortSignal:async()=>({data,error})};}}};",
  "  const bootstrapData=data?Object.assign({},data,{monthly_trend:[],manual_input_requirements:[]}):data;\n  const window = {__HASNARIA_CONTEXT:{brandId:'hasnaria',userId:'owner',role:'owner'},__HASNARIA_DB:{rpc(name) {\n    calls++;\n    if(name==='get_ui_bootstrap_v6')return {abortSignal:async()=>({data:bootstrapData,error})};\n    if(name==='get_ui_monthly_trend_v1')return {abortSignal:async()=>({data:(data&&data.monthly_trend)||[],error:null})};\n    throw new Error('Unexpected ERP fixture RPC: '+name);\n  }}};",
  'lazy RPC fixture'
);
replaceOnce('  assert.equal(empty.calls,1);', '  assert.equal(empty.calls,2);', 'lazy call count');
fs.writeFileSync(file, s);
