'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'core-app.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

assert.match(core, /db\.from\("user_profiles"\)/, 'core must query user_profiles directly');
assert.match(core, /async function updateMemberRole/, 'team role updates must use native profile path');
assert.match(core, /role: "pending"/, 'new user bootstrap must remain pending');
assert.match(core, /status: "active"/, 'new user bootstrap must remain active while pending approval');
assert.match(core, /\.eq\("id", user\.id\)/, 'current profile must be bound to authenticated user id');
assert.match(core, /\.eq\("brand_id", BRAND\)/, 'role updates and roster reads must stay brand-scoped');

assert(!core.includes('HASNARIA_USER'), 'runtime core must not use legacy synthetic user registry');
assert(!core.includes('var OWNERS'), 'runtime core must not contain hardcoded owner authority');
assert(!core.includes('client_roster_rows'), 'runtime core must not depend on compatibility roster RPC');
assert(!core.includes('function encode('), 'legacy roster encoder must be removed');
assert(!core.includes('function parseM('), 'legacy roster parser must be removed');

assert.match(app, /var CORE = '\/core-app\.js\?v=2'/, 'loader must cache-bust native core');
assert(!app.includes('user-profile-bridge.js'), 'loader must not load compatibility profile bridge');
assert(!app.includes('__HASNARIA_PROFILE_AUTHORITY'), 'loader must not depend on bridge sentinel');

console.log('native user_profiles authority gate passed');
