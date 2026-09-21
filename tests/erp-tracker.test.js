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
assert(appSource.includes("function afterCore(){load(OWNER_SHELL);load('/xlsx-preload.js?v=2')"), 'owner navigation guard loads before Sales/Stock feature modules');
assert(ownerShellSource.includes("c.role!=='owner'"), 'guard is scoped to Owner role only');
assert(ownerShellSource.includes('c.navigate=safeNavigate'), 'ERP module navigation is redirected to the safe Owner navigator');
assert(ownerShellSource.includes('event.stopPropagation();'), 'Owner top navigation blocks legacy target/bubble tab render');
assert(!ownerShellSource.includes('event.stopImmediatePropagation();'), 'Stock capture listener remains able to run on the same document node');
assert(ownerShellSource.includes("typeof window.__hasnariaReloadSales==='function'"), 'Sales renderer is explicitly restored when needed');
assert(ownerShellSource.includes("data-owner-shell-stock-nudge"), 'Stock reconciliation renderer is explicitly woken after safe navigation');
assert(!/\.(?:from|insert|update|delete|rpc)\s*\(/.test(ownerShellSource), 'navigation guard contains no database mutation/query path');

assert(operationalBridgeSource.includes("Object.defineProperty(window,'__HASNARIA_OPERATIONS_V1_MOUNT'"), 'Operasional bridge intercepts mount assignment for an idempotency guard');
assert(operationalBridgeSource.includes("if(!force&&mounted())return"), 'observer-driven non-force Operasional mounts are skipped after the shell exists');
assert(operationalBridgeSource.includes('__hasnariaOperationalMountGuard'), 'wrapped Operasional mount is marked to prevent duplicate wrapping');
assert(operationalBridgeSource.includes("s.src='/operational-v1.js?v=3'"), 'Operasional runtime remains lazy-loaded only when needed');
assert(operationalBridgeSource.includes("state.navObserver.observe(tabs,{childList:true})"), 'Operasional bridge observes only direct navigation child changes');
assert(operationalBridgeSource.includes("state.mainObserver.observe(main,{childList:true})"), 'Operasional bridge observes only direct main-section child changes');
assert(!operationalBridgeSource.includes("observe(document.body,{childList:true,subtree:true})"), 'Operasional bridge must not observe the entire document subtree');
assert(operationalBridgeSource.includes('state.readyAttempts<80'), 'Operasional context readiness uses a bounded lightweight retry');
assert(!/\.(?:from|insert|update|delete|rpc)\s*\(/.test(operationalBridgeSource), 'Operasional bridge remains zero-query and zero-mutation');

console.log('ERP tracker test: PASS (' + data.tasks.length + ' tasks, ' + data.milestones.length + ' milestones; Owner guard + idempotent/scoped Operasional bridge wired)');
