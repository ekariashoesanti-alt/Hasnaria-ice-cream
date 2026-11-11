'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildStrictIndexRuntime } = require('../scripts/build-index-runtime');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const core = read('core-app.js');
const guard = read('owner-shell-guard.js');
const dashboard = read('owner-dashboard-one-view.js');
const kpis = read('owner-ceo-kpi-v1.js');

assert.match(core, /if\(role!=='owner'\)\s*\$\("dashboard"\)\.innerHTML\s*=/,
  'legacy daily report must never paint for an authenticated Owner');
assert.match(core, /if\(window\.HasnariaERP&&role!=='owner'\)window\.HasnariaERP\.mount\(\)/,
  'outdated ERP dashboard must never overwrite the canonical Owner screen');
assert.match(core, /data-ceo-boot="1"/, 'first Owner paint must show a stable branded skeleton');
const enter = core.slice(core.indexOf('async function enter(user)'), core.indexOf('async function login()', core.indexOf('async function enter(user)')));
assert.ok(enter.indexOf('render();') < enter.indexOf('show("app");'),
  'render and canonical ownership must be prepared before exposing the Owner app');
assert.match(enter, /__HASNARIA_OWNER_SHELL\.activate\(\)/,
  'first Owner bootstrap must activate canonical navigation synchronously');
assert.match(guard, /function claimDashboardHost\(\)/);
assert.match(guard, /\[data-ceo-one-view="1"\],\[data-ceo-boot="1"\]/,
  'claim must preserve existing CEO shell on navigation');
assert.match(guard, /function dashboardLoadError\(\)/);
assert.match(guard, /data-ceo-boot-retry="1"/,
  'failed module loads must provide an actionable retry instead of hiding content forever');
assert.match(guard, /function start\(\)[\s\S]*?reconcile\(\);\s*\}/,
  'Owner reconcile should occur before the first authenticated frame');
assert.match(dashboard, /if\(!h\.querySelector\('\[data-ceo-one-view="1"\]'\)\)render\(\)/,
  'returning to the CEO tab must reuse the mounted dashboard');
assert.doesNotMatch(dashboard, /S\.hppLoading=true;render\(\)/,
  'a background HPP fetch cannot tear down the entire dashboard twice');
assert.match(dashboard, /if\(!S\.loaded\|\|!h\|\|!h\.querySelector\('\[data-ceo-one-view="1"\]'\)\)render\(\)/,
  'refresh must retain the last healthy render');
assert.match(kpis, /root\.__hxCardMarkup=nextCards/,
  'four asynchronous KPI responses must update only changed cards');
assert.match(kpis, /previous\[i\]!==markup&&root\.children\[i\]/);
assert.match(kpis, /root\.__hxInsightHTML!==html/);
assert.match(kpis, /root\.__hxTrendMarkup!==html/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hasnaria-ceo-first-paint-'));
try {
 const built = buildStrictIndexRuntime(path.join(root, 'index.html'), temp);
 const html = built.html;
 const executive = '<link id="hx-exec-css" rel="stylesheet" href="/owner-executive-v1.css?v=5">';
 const kpiStyle = '<link id="hx7-css" rel="stylesheet" href="/owner-ceo-kpi-v1.css?v=6">';
 const app = html.indexOf('<script src="/app.js');
 assert.ok(html.includes(executive) && html.includes(kpiStyle),
   'canonical CEO styles must preload as render-blocking links');
 assert.ok(html.indexOf(executive) < app && html.indexOf(kpiStyle) < app,
   'canonical CEO styles must be available before the app boots');
 assert.equal(html.split(executive).length - 1, 1);
 assert.equal(html.split(kpiStyle).length - 1, 1);
} finally {
 fs.rmSync(temp, {recursive:true, force:true});
}
console.log('HSN-820 Owner first paint, stable KPI DOM, preloaded styles, safe retry: PASS');
