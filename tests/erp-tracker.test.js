const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const trackerPath = path.join(root, 'docs', 'HASNARIA_ERP_TRACKER.json');
const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ownerShellSource = fs.readFileSync(path.join(root, 'owner-shell-guard.js'), 'utf8');
const operationalBridgeSource = fs.readFileSync(path.join(root, 'operational-role-bridge.js'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('ERP tracker test failed: ' + msg);
    process.exit(1);
  }
}

const allowedStatus = new Set(['TODO','IN_PROGRESS','BLOCKED','REVIEW','DONE']);
const allowedPriority = new Set(['P0','P1','P2']);
const milestoneIds = new Set((data.milestones || []).map(m => m.id));
const ids = new Set();

assert(Array.isArray(data.milestones) && data.milestones.length > 0, 'milestones missing');
assert(Array.isArray(data.tasks) && data.tasks.length > 0, 'tasks missing');
assert(data.milestones.reduce((s,m)=>s+Number(m.weight||0),0) === 100, 'milestone weights must total 100');

for (const task of data.tasks) {
  assert(/^HSN-\d+$/.test(task.id), 'invalid task id ' + task.id);
  assert(!ids.has(task.id), 'duplicate task id ' + task.id);
  ids.add(task.id);
  assert(milestoneIds.has(task.milestone), 'unknown milestone for ' + task.id);
  assert(allowedStatus.has(task.status), 'invalid status for ' + task.id);
  assert(allowedPriority.has(task.priority), 'invalid priority for ' + task.id);
  assert(typeof task.title === 'string' && task.title.trim(), 'missing title for ' + task.id);
  assert(typeof task.acceptance === 'string' && task.acceptance.trim(), 'missing acceptance for ' + task.id);
  assert(Array.isArray(task.dependencies), 'dependencies must be an array for ' + task.id);
}

for (const task of data.tasks) {
  for (const dep of task.dependencies) {
    assert(ids.has(dep), 'unknown dependency ' + dep + ' referenced by ' + task.id);
    assert(dep !== task.id, 'self dependency on ' + task.id);
  }
}

assert(appSource.includes("var OWNER_SHELL = '/owner-shell-guard.js?v=1';"), 'owner navigation guard is declared in runtime loader');
assert(appSource.includes("var OPERATIONAL_BRIDGE = '/operational-role-bridge.js?v=1';"), 'operational role bridge is declared in runtime loader');
const ownerLoad = appSource.indexOf('load(OWNER_SHELL)');
const operationalBridgeLoad = appSource.indexOf('load(OPERATIONAL_BRIDGE)');
const preloadLoad = appSource.indexOf("load('/xlsx-preload.js?v=2')");
assert(ownerLoad >= 0, 'owner navigation guard is loaded after core');
assert(operationalBridgeLoad > ownerLoad, 'operational role bridge loads after owner navigation guard');
assert(preloadLoad > operationalBridgeLoad, 'operational role bridge loads before heavier feature preload/modules');
assert(operationalBridgeSource.includes("s.src='/operational-v1.js?v=3'"), 'operational runtime stays lazy behind the role bridge');
assert(operationalBridgeSource.includes("if(id==='operasional')"), 'operational runtime is activated only from the Operasional tab');
assert(!/\.(?:from|insert|update|delete|rpc)\s*\(/.test(operationalBridgeSource), 'operational role bridge contains no database query or mutation path');
assert(ownerShellSource.includes("c.role!=='owner'"), 'guard is scoped to Owner role only');
assert(ownerShellSource.includes('c.navigate=safeNavigate'), 'ERP module navigation is redirected to the safe Owner navigator');
assert(ownerShellSource.includes('event.stopPropagation();'), 'Owner top navigation blocks legacy target/bubble tab render');
assert(!ownerShellSource.includes('event.stopImmediatePropagation();'), 'Stock capture listener remains able to run on the same document node');
assert(ownerShellSource.includes("typeof window.__hasnariaReloadSales==='function'"), 'Sales renderer is explicitly restored when needed');
assert(ownerShellSource.includes("data-owner-shell-stock-nudge"), 'Stock reconciliation renderer is explicitly woken after safe navigation');
assert(!/\.(?:from|insert|update|delete|rpc)\s*\(/.test(ownerShellSource), 'navigation guard contains no database mutation/query path');

console.log('ERP tracker test: PASS (' + data.tasks.length + ' tasks, ' + data.milestones.length + ' milestones; Owner guard + lazy zero-query Operasional bridge wired)');
