const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const navPath = path.join(process.cwd(), 'dist', 'nav-patch.js');
if (!fs.existsSync(navPath)) {
  console.error('P4/P5 nav runtime patch failed: dist/nav-patch.js missing');
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

const fallbackMarker = "  var runTimer=null;";
const fallbackCode = "  var settingsFallbackTimer=null,settingsFallbackAttempts=0;\n  function scheduleSettingsFallback(){if(settingsFallbackTimer||window.__HASNARIA_EXECUTIVE_OWNER||settingsFallbackAttempts>=4)return;settingsFallbackTimer=setTimeout(function(){settingsFallbackTimer=null;settingsFallbackAttempts++;if(window.__HASNARIA_EXECUTIVE_OWNER)return;var c=window.__HASNARIA_CONTEXT||null;if(c&&c.role==='owner'){loadSettings();return}if(!c)scheduleSettingsFallback()},1500)}\n\n  var runTimer=null;";
if (!source.includes(fallbackMarker)) {
  console.error('P5 nav runtime patch failed: settings fallback marker missing');
  process.exit(1);
}
source = source.replace(fallbackMarker, fallbackCode);

const oldRun = "function run(){injectStyle();injectAccountPageStyle();moveNav();styleButtons();if(!ownerShellActive())syncGroupedContent();ensureAccountMenu();loadSettings();watchPasswordRecovery();showPasswordActivation()}";
const newRun = "function run(){injectStyle();moveNav();styleButtons();if(!ownerShellActive())syncGroupedContent();ensureAccountMenu();scheduleSettingsFallback();watchPasswordRecovery();showPasswordActivation()}";
if (!source.includes(oldRun)) {
  console.error('P4/P5 nav runtime patch failed: startup run marker missing');
  process.exit(1);
}
source = source.replace(oldRun, newRun);

const oldSuperAdmin = "  function superAdmin(){\n    var email='';\n    var who=document.getElementById('whoMeta');\n    if(who){\n      var parts=(who.textContent||'').split('·').map(function(x){return x.trim()});\n      for(var i=0;i<parts.length;i++){\n        if(parts[i].indexOf('@')>=0){email=parts[i].toLowerCase();break}\n      }\n    }\n    // Super admin: Harisnu + Hasnaria owner email\n    return email==='harisnu@gmail.com'||email==='ekariashoesanti@gmail.com';\n  }";
const newSuperAdmin = "  function superAdmin(){\n    var email='';\n    var who=document.getElementById('whoMeta');\n    if(who){\n      var parts=(who.textContent||'').split('·').map(function(x){return x.trim()});\n      for(var i=0;i<parts.length;i++){\n        if(parts[i].indexOf('@')>=0){email=parts[i].toLowerCase();break}\n      }\n    }\n    return email==='harisnu@gmail.com';\n  }";
if (!source.includes(oldSuperAdmin)) {
  console.error('Account manager patch failed: legacy super admin marker missing');
  process.exit(1);
}
source = source.replace(oldSuperAdmin, newSuperAdmin);

const oldPasswordRole = "role.textContent=(low==='harisnu@gmail.com'||low==='ekariashoesanti@gmail.com')?'SUPER ADMIN':'USER';";
const newPasswordRole = "role.textContent=low==='harisnu@gmail.com'?'SUPER ADMIN':(low==='ekariashoesanti@yahoo.com'?'OWNER':'USER');";
if (!source.includes(oldPasswordRole)) {
  console.error('Account manager patch failed: password role marker missing');
  process.exit(1);
}
source = source.replace(oldPasswordRole, newPasswordRole);

const oldAccountOpen = "async function showAccountPage(mode){\n    var page=document.getElementById('hasnariaAccountPage');";
const accountManagerLoader = "function loadAccountManager(){\n    if(window.__HASNARIA_ACCOUNT_MANAGER_V1&&typeof window.__HASNARIA_ACCOUNT_MANAGER_V1.mount==='function'){window.__HASNARIA_ACCOUNT_MANAGER_V1.mount();return}\n    if(document.getElementById('hasnaria-account-manager-v1-js'))return;\n    var s=document.createElement('script');s.id='hasnaria-account-manager-v1-js';s.src='/account-manager-v1.js?v=1';s.async=true;\n    s.onload=function(){if(window.__HASNARIA_ACCOUNT_MANAGER_V1&&typeof window.__HASNARIA_ACCOUNT_MANAGER_V1.mount==='function')window.__HASNARIA_ACCOUNT_MANAGER_V1.mount()};\n    document.head.appendChild(s);\n  }\n\n  async function showAccountPage(mode){\n    injectAccountPageStyle();\n    var page=document.getElementById('hasnariaAccountPage');";
if (!source.includes(oldAccountOpen)) {
  console.error('P4 nav runtime patch failed: account page entry marker missing');
  process.exit(1);
}
source = source.replace(oldAccountOpen, accountManagerLoader);

const activationClear = "      document.getElementById('hasnariaActivationMsg').textContent='';";
const activationWithAccounts = "      document.getElementById('hasnariaActivationMsg').textContent='';\n      loadAccountManager();";
if (!source.includes(activationClear)) {
  console.error('Account manager patch failed: settings activation marker missing');
  process.exit(1);
}
source = source.replace(activationClear, activationWithAccounts);

if (source.includes(oldObserver) || !source.includes("observe(navRoot,{childList:true,subtree:true})")) {
  console.error('P4 nav runtime patch failed: observer replacement verification failed');
  process.exit(1);
}
if (source.includes(oldRun) || !source.includes("function loadAccountManager()")) {
  console.error('P4/account manager runtime verification failed');
  process.exit(1);
}
if (!source.includes('scheduleSettingsFallback()') || source.includes('ensureAccountMenu();loadSettings();watchPasswordRecovery()')) {
  console.error('P5 nav runtime patch failed: legacy settings still eager');
  process.exit(1);
}
if (source.includes("email==='harisnu@gmail.com'||email==='ekariashoesanti@gmail.com'")) {
  console.error('Account manager patch failed: legacy super-admin email rule remains');
  process.exit(1);
}
if (!source.includes("s.src='/account-manager-v1.js?v=1'")) {
  console.error('Account manager patch failed: runtime loader missing');
  process.exit(1);
}

fs.writeFileSync(navPath, source);
const check = spawnSync(process.execPath, ['--check', navPath], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P4/P5 nav runtime patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P4 nav observer scope: PASS (document.body -> #app>header)');
console.log('P4 account page style: PASS (startup -> on-demand)');
console.log('P5 user settings runtime: PASS (executive owner skips legacy settings script)');
console.log('Account manager: PASS (Harisnu SUPER ADMIN, Ekaria OWNER, lazy account list runtime)');
