const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'staff.html'), 'utf8');
const staffDirHtml = fs.readFileSync(path.join(ROOT, 'staff', 'index.html'), 'utf8');
const owner = fs.readFileSync(path.join(ROOT, 'staff-owner-stable-v1.js'), 'utf8');
const ownerCss = fs.readFileSync(path.join(ROOT, 'staff-owner-stable-v1.css'), 'utf8');
const entry = fs.readFileSync(path.join(ROOT, 'staff-owner-entry-v1.js'), 'utf8');
const compat = fs.readFileSync(path.join(ROOT, 'staff-owner-compat-v1.js'), 'utf8');
const mobileShell = fs.readFileSync(path.join(ROOT, 'staff-mobile-shell-v1.js'), 'utf8');
const manifest = fs.readFileSync(path.join(ROOT, 'staff.webmanifest'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(ROOT, 'staff-sw.js'), 'utf8');

function assertOwnerEntry(name, source) {
  const stableScript = source.indexOf('/staff-owner-stable-v1.js?');
  const entryScript = source.indexOf('/staff-owner-entry-v1.js?');
  const legacyRenderer = source.indexOf('/staff-v5.js?');
  const workflow = source.indexOf('/staff-workflow-v2.js?');
  const compatScript = source.indexOf('/staff-owner-compat-v1.js?');

  assert.ok(stableScript >= 0, `${name}: Owner stable renderer must be loaded`);
  assert.ok(entryScript > stableScript && entryScript < legacyRenderer, `${name}: Owner entry bridge must intercept before legacy staff-v5 renderer`);
  assert.ok(stableScript < legacyRenderer, `${name}: Owner stable renderer must load before legacy staff-v5 renderer`);
  assert.ok(compatScript > legacyRenderer && compatScript < workflow, `${name}: Owner compatibility sentinel must load after legacy renderer and before workflow observers`);
  assert.ok(source.includes('/staff-owner-stable-v1.css?v=3'), `${name}: Owner stable stylesheet v3 must be loaded`);
  assert.ok(source.includes('/staff-mobile-shell-v1.js?v=5'), `${name}: mobile shell v5 must yield to Owner stable handoff`);
  assert.ok(source.includes('/staff-mobile-stability-v2.css?v=1'), `${name}: mobile stability stylesheet must be loaded`);
}

assertOwnerEntry('staff.html', html);
assertOwnerEntry('staff/index.html', staffDirHtml);
assert.equal(staffDirHtml, html, '/staff/ and staff.html must stay byte-identical to prevent mobile entrypoint drift');

for (const marker of ['id="hsoShell"', 'id="hsoContent"', 'id="hsoEditor"', 'id="hsoNav"']) {
  assert.ok(owner.includes(marker), `Persistent Owner shell marker missing: ${marker}`);
}
assert.ok(owner.includes('data-hso-edit'), 'Staff account editor must use isolated Owner stable actions');
assert.ok(owner.includes('staff_owner_save'), 'Stable Staff account editor must keep canonical staff_owner_save RPC');
assert.ok(owner.includes('staff_owner_attendance_decide'), 'Stable Owner approval must keep canonical attendance decision RPC');
assert.ok(owner.includes('staff_owner_set_attendance_location'), 'Stable Owner location must keep canonical geofence RPC');
assert.ok(owner.includes('staff_owner_set_supervisor_v1'), 'Stable Owner supervisor setup must keep canonical supervisor RPC');
assert.ok(!owner.includes('mobile-app-nav'), 'Stable Owner nav must not reuse legacy mobile-app-nav renderer');
assert.ok(!owner.includes('hasnariaMobileNav'), 'Stable Owner nav must not participate in legacy nav replacement cycle');
assert.ok(ownerCss.includes('.hso-nav{position:fixed'), 'Owner bottom navigation must remain fixed and persistent');
assert.ok(ownerCss.includes('.hso-editor{position:fixed'), 'Staff account editor must be an overlay, not a root rerender');
assert.ok(!ownerCss.includes('backdrop-filter'), 'Owner stable shell must avoid backdrop-filter compositor flicker');
assert.ok(!ownerCss.includes('will-change:transform'), 'Owner stable nav must avoid forced compositor promotion');
assert.ok(!ownerCss.includes(':has('), 'Owner stable stylesheet must avoid dynamic :has selector recalculation');
assert.ok(entry.includes("act==='owner-login'"), 'Owner entry bridge must intercept Owner login before legacy render');
assert.ok(entry.includes('triggerStable()'), 'Owner entry bridge must activate stable shell directly');
assert.ok(compat.includes("className='owner-mobile-nav'"), 'Compatibility sentinel must preserve legacy Owner detection');
assert.ok(compat.includes('sentinel.hidden=true'), 'Compatibility sentinel must have zero visual layout output');
assert.ok(mobileShell.includes('function ownerLoginVisible()'), 'Mobile shell must recognize Owner login as a login state, not an authenticated Owner state');
assert.ok(mobileShell.includes('function stableOwnerHandoff()'), 'Mobile shell must detect the stable Owner handoff sentinel');
assert.ok(mobileShell.includes('if(stableOwnerHandoff())'), 'Mobile enhancer must stand down once stable Owner handoff begins');
assert.match(manifest, /"start_url"\s*:\s*"\/staff\/\?source=pwa"/, 'PWA must continue to enter through /staff/');
assert.match(manifest, /"scope"\s*:\s*"\/staff\/"/, 'PWA scope must stay on /staff/');
assert.ok(serviceWorker.includes("const CACHE_NAME='hasnaria-staff-pwa-v4'"), 'PWA cache must rotate after Team branding update');

console.log('Owner Mobile persistent single-renderer gate: PASS for staff.html and /staff/');
