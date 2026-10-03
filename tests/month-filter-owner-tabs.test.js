const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const files = {
  dashboard: read('owner-dashboard-one-view.js'),
  sales: [0,1,2,3,4].map(i => read('sales-board.part'+i+'.js')).join('\n'),
  pembelian: read('purchase-analytics.js'),
  operasional: read('operational-v1.js'),
  administrasi: read('administration-v1.js'),
  ops: read('finance-accuracy-v6.js'),
  stok: read('stock-control-v3.js')
};

for (const [tab, source] of Object.entries(files)) {
  const marker = 'data-month-filter="' + tab + '"';
  assert.ok(source.includes(marker), tab + ' must expose exactly one monthly filter marker');
  assert.equal(source.split(marker).length - 1, 1, tab + ' must not duplicate the monthly filter');
}

assert.ok(files.sales.includes('id="sbMonth"'), 'Sales keeps the month selector');
assert.ok(!files.sales.includes('id="sbFrom"'), 'Sales must not expose a start-date filter');
assert.ok(!files.sales.includes('id="sbTo"'), 'Sales must not expose an end-date filter');
assert.ok(!files.sales.includes('<option value="">Semua</option>'), 'Sales month selector must list actual data months only');
assert.ok(files.sales.includes("['daily', 'weekly']"), 'Sales may change chart granularity without introducing another period filter');
assert.ok(!files.sales.includes("['daily', 'weekly', 'monthly']"), 'Sales annual scope control must not override the selected month');

assert.ok(files.operasional.includes("state.period=String(e.target.value||'').slice(0,7)"), 'Operations month selector must drive selected month');
assert.ok(files.operasional.includes(".gte('scheduled_date',from).lt('scheduled_date',to)"), 'Operations must query only the selected month');

for (const tab of ['dashboard','pembelian','operasional','administrasi','ops','stok']) {
  assert.match(files[tab], />Bulan<\/span>|>Bulan<\/label>|<span>Bulan<\/span>/, tab + ' must label the period selector as Bulan');
}

console.log('Owner single monthly filter contract: PASS');
