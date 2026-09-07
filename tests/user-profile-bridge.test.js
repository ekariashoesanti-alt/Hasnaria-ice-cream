'use strict';

const assert = require('assert');
const path = require('path');

const calls = [];

function makeBuilder(meta) {
  const builder = {
    eq(column, value) {
      meta.filters.push(['eq', column, value]);
      return builder;
    },
    like(column, value) {
      meta.filters.push(['like', column, value]);
      return builder;
    },
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    }
  };
  return builder;
}

function makeRelation(table) {
  return {
    select(columns) {
      const meta = { table, op: 'select', columns, filters: [] };
      calls.push(meta);
      return makeBuilder(meta);
    },
    insert(values) {
      const meta = { table, op: 'insert', values, filters: [] };
      calls.push(meta);
      return makeBuilder(meta);
    },
    update(values) {
      const meta = { table, op: 'update', values, filters: [] };
      calls.push(meta);
      return makeBuilder(meta);
    },
    upsert(values) {
      const meta = { table, op: 'upsert', values, filters: [] };
      calls.push(meta);
      return makeBuilder(meta);
    }
  };
}

const db = {
  from(table) {
    return makeRelation(table);
  },
  rpc(name) {
    calls.push({ table: 'rpc', op: name, filters: [] });
    return Promise.resolve({
      data: [{ id: 'owner-id', name: 'HASNARIA_USER|owner-id|owner|owner@example.com|Owner' }],
      error: null
    });
  }
};

global.window = { __HASNARIA_DB: db };
require(path.join(__dirname, '..', 'user-profile-bridge.js'));

assert.strictEqual(global.window.__HASNARIA_PROFILE_AUTHORITY, 'user_profiles');
assert.strictEqual(db.__hasnariaProfileAuthorityBridge, true);

(async () => {
  calls.length = 0;
  const roster = await db.from('products')
    .select('id,name')
    .eq('brand_id', 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4')
    .like('name', 'HASNARIA_USER|%');
  assert.strictEqual(roster.error, null);
  assert(calls.some(c => c.table === 'rpc' && c.op === 'client_roster_rows'), 'legacy roster read must route to canonical RPC');

  calls.length = 0;
  await db.from('products').insert({
    brand_id: 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4',
    name: 'HASNARIA_USER|user-1|owner|new@example.com|New User',
    selling_price: 0,
    cogs: 0,
    active: true
  });
  const insertedProfile = calls.find(c => c.table === 'user_profiles' && c.op === 'insert');
  assert(insertedProfile, 'legacy roster insert must target user_profiles');
  assert.strictEqual(insertedProfile.values.id, 'user-1');
  assert.strictEqual(insertedProfile.values.role, 'pending', 'client may never bootstrap itself as Owner');
  assert.strictEqual(insertedProfile.values.full_name, 'New User');
  assert(!calls.some(c => c.table === 'products' && c.op === 'insert'), 'synthetic user row must not be inserted into products');

  calls.length = 0;
  await db.from('products')
    .update({ name: 'HASNARIA_USER|user-2|head_store|head@example.com|Head Store' })
    .eq('id', 'user-2');
  const updatedProfile = calls.find(c => c.table === 'user_profiles' && c.op === 'update');
  assert(updatedProfile, 'legacy role update must target user_profiles');
  assert.strictEqual(updatedProfile.values.role, 'head_store');
  assert.deepStrictEqual(updatedProfile.filters[0], ['eq', 'id', 'user-2']);
  assert(!calls.some(c => c.table === 'products' && c.op === 'update'), 'synthetic user row must not be updated in products');

  calls.length = 0;
  await db.from('user_profiles').upsert({ id: 'user-2', display_name: 'head_store::Head Store' });
  const cleanProfile = calls.find(c => c.table === 'user_profiles' && c.op === 'update');
  assert(cleanProfile, 'legacy display-name upsert must become a profile update');
  assert.strictEqual(cleanProfile.values.display_name, 'Head Store');
  assert.strictEqual(cleanProfile.values.full_name, 'Head Store');

  calls.length = 0;
  await db.from('products')
    .select('id,name,selling_price')
    .eq('brand_id', 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4')
    .like('name', 'HASNARIA_PAR|%');
  assert(calls.some(c => c.table === 'products' && c.op === 'select' && c.filters.some(f => f[0] === 'like' && f[2] === 'HASNARIA_PAR|%')), 'non-user product queries must remain on products');
  assert(!calls.some(c => c.table === 'rpc'), 'PAR query must not route through roster RPC');

  console.log('user profile authority bridge: ok');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
