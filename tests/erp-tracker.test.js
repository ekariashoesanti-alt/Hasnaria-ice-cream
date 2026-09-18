const fs = require('fs');
const path = require('path');

const trackerPath = path.join(__dirname, '..', 'docs', 'HASNARIA_ERP_TRACKER.json');
const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));

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

console.log('ERP tracker test: PASS (' + data.tasks.length + ' tasks, ' + data.milestones.length + ' milestones)');
