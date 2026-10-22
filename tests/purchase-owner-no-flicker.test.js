// Regression: Owner Purchase must never paint the legacy card tree before the canonical panel.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const read = name => fs.readFileSync(name, 'utf8');
const core = read('core-app.js');
const guard = read('owner-shell-guard.js');
const analytics = read('purchase-analytics.js');
const app = read('app.js');
const build = read('scripts/build-index-runtime.js');
const lazy = read('purchase-lazy-loader.js');
const index = read('index.html');

const legacyStart = core.indexOf("    var pRows = expenses.filter(function");
const legacyPaint = core.indexOf('    $("pembelian").innerHTML =', legacyStart);
const legacyEnd = core.indexOf('    $("ops").innerHTML', legacyStart);
const nonOwnerGate = core.lastIndexOf("    if (role !== 'owner') {", legacyStart);
assert(legacyStart >= 0 && legacyPaint > legacyStart && legacyEnd > legacyPaint);
assert(nonOwnerGate >= 0 && nonOwnerGate < legacyStart, 'Owner cannot enter legacy Purchase renderer');
assert.match(core.slice(legacyPaint, legacyEnd), /\n    }\n$/, 'Old Purchase markup and callbacks are entirely gated');
assert.equal((core.match(/\$\("pembelian"\)\.innerHTML =/g) || []).length, 1, 'No second core Purchase writer');

assert.match(guard, /function ensurePurchase\(\)[\s\S]*?data-purchase-pending/, 'Owner paints a stable placeholder before async loads');
assert.match(analytics, /function renderOwnerShell\(host\)\{[\s\S]*?if\(host\.querySelector\('#paRoot\.pa-owner-single-render'\)\)return;/, 'Canonical Owner panel is preserved on reload');

// Exercise the guard without the backend: a second Owner render may not replace a mounted panel.
const functionText = analytics.slice(analytics.indexOf('  function renderOwnerShell(host){'), analytics.indexOf('  function render(){')).trim();
const ownerRender = vm.runInNewContext('(' + functionText + ')');
let replaced = 0;
const host = { querySelector: () => ({ id: 'paRoot' }), set innerHTML(_) { replaced++; } };
ownerRender(host);
assert.equal(replaced, 0, 'Repeated Owner render should leave canonical summary and upload controls mounted');

assert.match(app, /core-app\.js\?v=9/);
assert.match(app, /owner-shell-guard\.js\?v=11/);
assert.match(index, /app\.js\?v=p072/);
assert.match(build, /owner-shell-guard\.js\?v=10/);
assert.match(build, /purchase-lazy-loader\.js\?v=3/);
assert.match(lazy, /purchase-analytics\.js\?v=7/);
console.log('Purchase Owner flicker regression: PASS');
