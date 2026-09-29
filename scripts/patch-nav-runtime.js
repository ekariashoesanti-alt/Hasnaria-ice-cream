const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const authPatch = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', 'patch-auth-recovery-runtime.js')], { stdio: 'inherit' });
if (authPatch.status !== 0) process.exit(authPatch.status || 1);

const navPath = path.join(process.cwd(), 'dist', 'nav-patch.js');
if (!fs.existsSync(navPath)) {
  console.error('nav runtime patch failed: dist/nav-patch.js missing');
  process.exit(1);
}
let source = fs.readFileSync(navPath, 'utf8');

const oldObserver = "function start(){run();new MutationObserver(scheduleRun).observe(document.body,{childList:true,subtree:true})}";
const newObserver = "function start(){run();var navRoot=document.querySelector('#app>header');if(!navRoot)return;new MutationObserver(scheduleRun).observe(navRoot,{childList:true,subtree:true})}";
if (!source.includes(oldObserver)) throw new Error('nav observer marker missing');
source = source.replace(oldObserver, newObserver);

const oldSuperAdmin = "  function superAdmin(){\n    var email='';\n    var who=document.getElementById('whoMeta');\n    if(who){\n      var parts=(who.textContent||'').split('·').map(function(x){return x.trim()});\n      for(var i=0;i<parts.length;i++){\n        if(parts[i].indexOf('@')>=0){email=parts[i].toLowerCase();break}\n      }\n    }\n    // Super admin: Harisnu + Hasnaria owner email\n    return email==='harisnu@gmail.com'||email==='ekariashoesanti@gmail.com';\n  }";
const newSuperAdmin = "  function superAdmin(){\n    var email='';\n    var who=document.getElementById('whoMeta');\n    if(who){var parts=(who.textContent||'').split('·').map(function(x){return x.trim()});for(var i=0;i<parts.length;i++){if(parts[i].indexOf('@')>=0){email=parts[i].toLowerCase();break}}}\n    return email==='harisnu@gmail.com';\n  }";
if (source.includes(oldSuperAdmin)) source = source.replace(oldSuperAdmin, newSuperAdmin);

const blockStart = source.indexOf('  // Recovery emails must use a REAL implicit client');
const blockEnd = source.indexOf('  function ensureAccountMenu(){');
if (blockStart < 0 || blockEnd <= blockStart) throw new Error('legacy account/password block markers missing');
const cleanAccountBlock = `  var accountManagerPromise=null;\n  function loadAccountManager(){\n    if(window.__HASNARIA_ACCOUNT_MANAGER_V1&&typeof window.__HASNARIA_ACCOUNT_MANAGER_V1.mount==='function')return Promise.resolve(window.__HASNARIA_ACCOUNT_MANAGER_V1.mount());\n    if(accountManagerPromise)return accountManagerPromise;\n    accountManagerPromise=new Promise(function(resolve,reject){\n      var old=document.getElementById('hasnaria-account-manager-v1-js');\n      if(old){old.addEventListener('load',function(){Promise.resolve(window.__HASNARIA_ACCOUNT_MANAGER_V1.mount()).then(resolve,reject)},{once:true});old.addEventListener('error',reject,{once:true});return}\n      var s=document.createElement('script');s.id='hasnaria-account-manager-v1-js';s.src='/account-manager-v1.js?v=4';s.async=true;\n      s.onload=function(){if(!window.__HASNARIA_ACCOUNT_MANAGER_V1)return reject(new Error('Account Manager tidak tersedia'));Promise.resolve(window.__HASNARIA_ACCOUNT_MANAGER_V1.mount()).then(resolve,reject)};\n      s.onerror=function(){accountManagerPromise=null;reject(new Error('Account Manager gagal dimuat'))};document.head.appendChild(s);\n    });\n    return accountManagerPromise;\n  }\n  function ensureAccountPage(){\n    var page=document.getElementById('hasnariaAccountPage');if(page)return page;\n    page=document.createElement('div');page.id='hasnariaAccountPage';page.className='hasnaria-account-page';\n    page.innerHTML='<div class="hasnaria-account-page-top"><button type="button" class="hasnaria-back-btn" id="hasnariaAccountBack">← Kembali</button><div class="hasnaria-page-brand">HASNARIA</div></div><main class="hasnaria-account-page-main"><section class="hasnaria-account-hero"><div class="hasnaria-account-kicker">AKUN</div><h1>Pengaturan Akun</h1><p>Kelola daftar akun, akses, aktivasi, dan reset password Hasnaria.</p></section><section class="hasnaria-account-panel"><div class="hasnaria-account-profile"><div class="hasnaria-avatar" id="hasnariaAccountAvatar">H</div><div><h2 id="hasnariaAccountPageName">—</h2><p id="hasnariaAccountPageEmail">—</p><span class="hasnaria-access-badge" id="hasnariaAccountPageRole">—</span></div></div><div class="hasnaria-account-divider"></div><div id="hasnariaAccountSettingsBody"><div class="ham-loading">Menyiapkan daftar akun…</div></div></section></main>';\n    document.body.appendChild(page);\n    document.getElementById('hasnariaAccountBack').addEventListener('click',function(){page.classList.remove('open')});\n    return page;\n  }\n  async function showAccountPage(){\n    injectAccountPageStyle();var page=ensureAccountPage(),name=document.getElementById('whoName'),email=getAccountEmail(),role=document.getElementById('hasnariaAccountPageRole');\n    document.getElementById('hasnariaAccountPageName').textContent=(name&&name.textContent)||'—';document.getElementById('hasnariaAccountPageEmail').textContent=email||'—';\n    role.textContent=superAdmin()?'SUPER ADMIN':((email||'').toLowerCase()==='ekariashoesanti@gmail.com'?'OWNER':'USER');document.getElementById('hasnariaAccountAvatar').textContent=((name&&name.textContent)||'H').trim().charAt(0).toUpperCase();\n    await loadAccountManager();page.classList.add('open');\n  }\n  function openAccountSettings(){closeAccountMenu();showAccountPage().catch(function(e){var page=ensureAccountPage(),host=document.getElementById('hasnariaAccountSettingsBody');if(host)host.innerHTML='<div class="ham-empty ham-error">'+String(e&&e.message||'Gagal membuka Pengaturan Akun')+'</div>';page.classList.add('open')})}\n\n`;
source = source.slice(0, blockStart) + cleanAccountBlock + source.slice(blockEnd);

source = source.replace(/function run\(\)\{injectStyle\(\);injectAccountPageStyle\(\);moveNav\(\);styleButtons\(\);if\(!ownerShellActive\(\)\)syncGroupedContent\(\);ensureAccountMenu\(\);loadSettings\(\);watchPasswordRecovery\(\);showPasswordActivation\(\)\}/,
  "function run(){injectStyle();moveNav();styleButtons();if(!ownerShellActive())syncGroupedContent();ensureAccountMenu()}");
source = source.replace(/function run\(\)\{injectStyle\(\);moveNav\(\);styleButtons\(\);if\(!ownerShellActive\(\)\)syncGroupedContent\(\);ensureAccountMenu\(\);scheduleSettingsFallback\(\);watchPasswordRecovery\(\);showPasswordActivation\(\)\}/,
  "function run(){injectStyle();moveNav();styleButtons();if(!ownerShellActive())syncGroupedContent();ensureAccountMenu()}");

if (/hasnariaSendActivation|hasnariaPasswordBody|watchPasswordRecovery|showPasswordActivation|Password aplikasi/.test(source)) throw new Error('legacy password/account renderer still present');
if (!source.includes("s.src='/account-manager-v1.js?v=4'")) throw new Error('Account Manager v4 loader missing');
if (!source.includes("await loadAccountManager();page.classList.add('open')")) throw new Error('atomic account page open missing');
if (!source.includes("observe(navRoot,{childList:true,subtree:true})")) throw new Error('scoped observer missing');

fs.writeFileSync(navPath, source);
const check = spawnSync(process.execPath, ['--check', navPath], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status || 1);
console.log('Owner nav/account runtime: PASS (atomic Account Manager v4, no legacy password renderer)');