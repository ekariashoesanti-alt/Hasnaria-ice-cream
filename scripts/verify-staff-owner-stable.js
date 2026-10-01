const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'staff.html'), 'utf8');
const owner = fs.readFileSync(path.join(ROOT, 'staff-owner-stable-v1.js'), 'utf8');
const ownerCss = fs.readFileSync(path.join(ROOT, 'staff-owner-stable-v1.css'), 'utf8');
const entry = fs.readFileSync(path.join(ROOT, 'staff-owner-entry-v1.js'), 'utf8');
const compat = fs.readFileSync(path.join(ROOT, 'staff-owner-compat-v1.js'), 'utf8');

const stableScript = html.indexOf('/staff-owner-stable-v1.js?v=1');
const entryScript = html.indexOf('/staff-owner-entry-v1.js?v=1');
const legacyRenderer = html.indexOf('/staff-v5.js?v=1');
const workflow = html.indexOf('/staff-workflow-v2.js?v=1');
const compatScript = html.indexOf('/staff-owner-compat-v1.js?v=1');

assert.ok(stableScript >= 0, 'Owner stable renderer must be loaded by /staff');
assert.ok(entryScript > stableScript && entryScript < legacyRenderer, 'Owner entry bridge must intercept before legacy staff-v5 renderer');
assert.ok(stableScript < legacyRenderer, 'Owner stable renderer must load before legacy staff-v5 renderer');
assert.ok(compatScript > legacyRenderer && compatScript < workflow, 'Owner compatibility sentinel must load after legacy renderer and before workflow observers');
assert.ok(html.includes('/staff-owner-stable-v1.css?v=2'), 'Owner stable stylesheet v2 must be loaded');

for (const marker of ['id="hsoShell"', 'id="hsoContent"', 'id="hsoEditor"', 'id="hsoNav"']) {
  assert.ok(owner.includes(marker), `Persistent Owner shell marker missing: ${marker}`);
}
assert.ok(owner.includes("data-hso-edit"), 'Staff account editor must use isolated Owner stable actions');
assert.ok(owner.includes("staff_owner_save"), 'Stable Staff account editor must keep canonical staff_owner_save RPC');
assert.ok(owner.includes("staff_owner_attendance_decide"), 'Stable Owner approval must keep canonical attendance decision RPC');
assert.ok(owner.includes("staff_owner_set_attendance_location"), 'Stable Owner location must keep canonical geofence RPC');
assert.ok(owner.includes("staff_owner_set_supervisor_v1"), 'Stable Owner supervisor setup must keep canonical supervisor RPC');
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
assert.ok(compat.includes("sentinel.hidden=true"), 'Compatibility sentinel must have zero visual layout output');

console.log('Owner Mobile persistent single-renderer gate: PASS');
