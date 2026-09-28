const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const navPath = path.join(process.cwd(), 'dist', 'nav-patch.js');
if (!fs.existsSync(navPath)) {
  console.error('P4 nav runtime patch failed: dist/nav-patch.js missing');
  process.exit(1);
}

let source = fs.readFileSync(navPath, 'utf8');

const oldObserver = "function start(){run();new MutationObserver(scheduleRun).observe(document.body,{childList:true,subtree:true})}";
const newObserver = "function start(){run();var navRoot=document.querySelector('#app>header');if(!navRoot)return;new MutationObserver(scheduleRun).observe(navRoot,{childList:true,subtree:true})}";
if (!source.includes(oldObserver)) {
  console.error('P4 nav runtime patch failed: expected body observer marker missing');
  process.exit(1);
}
if ((source.match(/observe\(document\.body,\{childList:true,subtree:true\}\)/g) || []).length !== 1) {
  console.error('P4 nav runtime patch failed: unexpected body observer count');
  process.exit(1);
}
source = source.replace(oldObserver, newObserver);

const oldRun = "function run(){injectStyle();injectAccountPageStyle();moveNav();styleButtons();if(!ownerShellActive())syncGroupedContent();ensureAccountMenu();loadSettings();watchPasswordRecovery();showPasswordActivation()}";
const newRun = "function run(){injectStyle();moveNav();styleButtons();if(!ownerShellActive())syncGroupedContent();ensureAccountMenu();loadSettings();watchPasswordRecovery();showPasswordActivation()}";
if (!source.includes(oldRun)) {
  console.error('P4 nav runtime patch failed: eager account-style marker missing');
  process.exit(1);
}
source = source.replace(oldRun, newRun);

const oldAccountOpen = "async function showAccountPage(mode){\n    var page=document.getElementById('hasnariaAccountPage');";
const newAccountOpen = "async function showAccountPage(mode){\n    injectAccountPageStyle();\n    var page=document.getElementById('hasnariaAccountPage');";
if (!source.includes(oldAccountOpen)) {
  console.error('P4 nav runtime patch failed: account page entry marker missing');
  process.exit(1);
}
source = source.replace(oldAccountOpen, newAccountOpen);

if (source.includes(oldObserver) || !source.includes("observe(navRoot,{childList:true,subtree:true})")) {
  console.error('P4 nav runtime patch failed: observer replacement verification failed');
  process.exit(1);
}
if (source.includes(oldRun) || !source.includes('async function showAccountPage(mode){\n    injectAccountPageStyle();')) {
  console.error('P4 nav runtime patch failed: lazy account style verification failed');
  process.exit(1);
}

fs.writeFileSync(navPath, source);
const check = spawnSync(process.execPath, ['--check', navPath], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P4 nav runtime patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P4 nav observer scope: PASS (document.body -> #app>header)');
console.log('P4 account page style: PASS (startup -> on-demand)');
