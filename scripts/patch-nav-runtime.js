const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const navPath = path.join(process.cwd(), 'dist', 'nav-patch.js');
if (!fs.existsSync(navPath)) {
  console.error('P4 nav runtime patch failed: dist/nav-patch.js missing');
  process.exit(1);
}

const before = fs.readFileSync(navPath, 'utf8');
const oldMarker = "function start(){run();new MutationObserver(scheduleRun).observe(document.body,{childList:true,subtree:true})}";
const newMarker = "function start(){run();var navRoot=document.querySelector('#app>header');if(!navRoot)return;new MutationObserver(scheduleRun).observe(navRoot,{childList:true,subtree:true})}";

if (!before.includes(oldMarker)) {
  console.error('P4 nav runtime patch failed: expected body observer marker missing');
  process.exit(1);
}
if ((before.match(/observe\(document\.body,\{childList:true,subtree:true\}\)/g) || []).length !== 1) {
  console.error('P4 nav runtime patch failed: unexpected body observer count');
  process.exit(1);
}

const after = before.replace(oldMarker, newMarker);
if (after.includes(oldMarker) || !after.includes("observe(navRoot,{childList:true,subtree:true})")) {
  console.error('P4 nav runtime patch failed: replacement verification failed');
  process.exit(1);
}

fs.writeFileSync(navPath, after);
const check = spawnSync(process.execPath, ['--check', navPath], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P4 nav runtime patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P4 nav observer scope: PASS (document.body -> #app>header)');
