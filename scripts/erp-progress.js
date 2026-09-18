const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'docs', 'HASNARIA_ERP_TRACKER.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const scores = data.status_scale || {TODO:0,BLOCKED:.25,IN_PROGRESS:.5,REVIEW:.85,DONE:1};

function pct(n){ return (Math.round(n * 10) / 10).toFixed(1); }

let weighted = 0;
let done = 0;
console.log('Hasnaria ERP Progress');
console.log('=====================');
for (const m of data.milestones) {
  const tasks = data.tasks.filter(t => t.milestone === m.id);
  const avg = tasks.length ? tasks.reduce((s,t)=>s+(scores[t.status] ?? 0),0) / tasks.length : 0;
  weighted += avg * m.weight;
  done += tasks.filter(t=>t.status==='DONE').length;
  console.log(`${m.id.padEnd(3)} ${m.name.padEnd(38)} ${pct(avg*100).padStart(6)}%  (${tasks.length} tasks)`);
}
console.log('---------------------');
console.log(`Overall weighted progress: ${pct(weighted)}%`);
console.log(`DONE: ${done}/${data.tasks.length} tasks`);
