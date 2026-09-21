const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const monitor = fs.readFileSync(path.join(root, 'stock-monitor.js'), 'utf8');
const control = fs.readFileSync(path.join(root, 'stock-control-v3.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(monitor.includes("s.src = '/stock-control-v3.js?v=2'"), 'Stock control v3 must use the progressive runtime version.');
assert(!monitor.includes('loadReconciliation();'), 'Stock runtime must not be loaded unconditionally during app startup.');
assert(monitor.includes('if (!stockActive()) return;'), 'Lazy loader must guard stock runtime behind active Stock tab.');
assert(control.includes("request('inventory_stock_reconciliation?' + baseQuery)"), 'Critical path must load reconciliation rows directly.');
assert(control.includes('S.baseLoaded = true;'), 'Critical path must mark base data ready before supplemental data.');
assert(control.includes('scheduleAux(seq);'), 'Supplemental data must be scheduled after base render.');
assert(control.includes('requestIdleCallback'), 'Supplemental data should prefer browser idle time.');
assert(control.includes('loadRecipes(trackedIds)'), 'BOM lookup must be scoped to tracked inventory items.');
assert(control.includes('poRows.length ? await loadReceipts'), 'Receipt lookup must be skipped when there are no open PO rows.');
assert(!control.includes("limit: '5000'"), 'Progressive stock runtime must not retain broad 5000-row supplemental queries.');
assert(control.includes('Data utama sudah tampil.'), 'UI must communicate non-blocking supplemental loading.');

console.log('Stock progressive loading test: PASS');
