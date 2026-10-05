const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'staff-owner-stable-v1.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const elements = {}, listeners = {}, calls = [], callbacks = {};
  const data = {
    staff_owner_list: [{ employee_id: 'alice', full_name: 'Alice', staff_active: true, pin_set: true, modules: ['absensi'] }],
    staff_owner_attendance_approvals: [],
    staff_owner_attendance_location: [{ configured: true, attendance_lat: -7, attendance_lng: 110 }],
    staff_owner_supervisor_state_v1: [{ employee_id: 'alice', full_name: 'Alice' }]
  };
  const control = { canRefresh: true, notifications: 0, reloads: 0, failReads: false, readGate: null, writeGate: null, gps: null };
  function element(id) {
    const el = { id, writes: 0, hidden: false, textContent: '', className: '', value: '', checked: false,
      classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll() { return []; } };
    let html = '';
    Object.defineProperty(el, 'innerHTML', {
      get() { return html; },
      set(value) {
        html = value; el.writes++;
        if (id === 'staffRoot') {
          for (const key of ['hsoShell', 'hsoContent', 'hsoEditor', 'hsoNav', 'hsoMessage']) elements[key] = element(key);
        }
        if (id === 'hsoContent' && value.includes('id="hsoSupervisor"')) {
          elements.hsoSupervisor = element('hsoSupervisor');
          const selected = value.match(/<option value="([^"]*)" selected/);
          elements.hsoSupervisor.value = selected ? selected[1] : '';
        }
        if (id === 'hsoEditor' && value) {
          for (const key of ['hsoName', 'hsoPin', 'hsoMa', 'hsoMk', 'hsoMg', 'hsoActive']) elements[key] = element(key);
          elements.hsoName.value = (value.match(/id="hsoName" value="([^"]*)"/) || [])[1] || '';
          for (const key of ['hsoMa', 'hsoMk', 'hsoMg', 'hsoActive']) {
            const input = value.match(new RegExp('id="' + key + '"[^>]*>'));
            elements[key].checked = !!(input && input[0].includes('checked'));
          }
        }
      }
    });
    return el;
  }
  elements.staffRoot = element('staffRoot');
  elements.staffRoot.querySelector = selector => selector === '.owner-mobile-nav' ? {} : null;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { email: 'owner@example.test' } } } }), signOut: async () => {} },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (Object.hasOwn(data, name)) {
        if (control.failReads) return { error: new Error('Read unavailable') };
        const value = clone(data[name]);
        if (name === 'staff_owner_list' && control.readGate) await control.readGate.promise;
        return { data: value };
      }
      if (control.writeGate) await control.writeGate.promise;
      if (name === 'staff_owner_save') data.staff_owner_list[0].full_name = args.p_full_name;
      if (name === 'staff_owner_set_attendance_location') return { data: [{ configured: true, attendance_lat: args.p_lat, attendance_lng: args.p_lng }] };
      return { data: [] };
    }
  };
  const document = {
    readyState: 'complete',
    getElementById: id => elements[id] || null,
    querySelector: selector => elements[selector.slice(1)] || null,
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); }
  };
  const coordinator = {
    register(name, callback) { callbacks[name] = callback; },
    canRefresh() { return control.canRefresh; },
    notify() { control.notifications++; }
  };
  const window = { matchMedia: () => ({ matches: true }), supabase: { createClient: () => client }, __HASNARIA_DATA_SYNC: coordinator };
  vm.runInNewContext(source, {
    window, document, MutationObserver: class { observe() {} },
    navigator: { geolocation: { getCurrentPosition(success) { control.gps = success; } } },
    location: { reload() { control.reloads++; } }, prompt: () => 'Reason', console
  });
  function click(attribute, value) {
    const target = {
      closest(selector) { return selector === '[' + attribute + ']' ? this : null; },
      getAttribute(name) { return name === attribute ? value : null; }
    };
    for (const callback of listeners.click || []) callback({ target, preventDefault() {} });
  }
  return { elements, data, control, calls, refresh: () => callbacks['owner-mobile']('test'), click };
}

(async () => {
  const h = harness();
  await flush();
  h.click('data-hso-nav', 'users');
  assert.match(h.elements.hsoContent.innerHTML, /Alice/);
  const rootWrites = h.elements.staffRoot.writes, initialWrites = h.elements.hsoContent.writes;
  const shell = h.elements.hsoShell, nav = h.elements.hsoNav;
  await h.refresh();
  assert.equal(h.elements.hsoContent.writes, initialWrites, 'identical database reads must not rerender');
  h.data.staff_owner_list[0].full_name = 'Alice updated on web';
  await h.refresh();
  assert.match(h.elements.hsoContent.innerHTML, /Alice updated on web/);
  assert.equal(h.elements.staffRoot.writes, rootWrites, 'background refresh must preserve root markup');
  assert.equal(h.elements.hsoShell, shell);
  assert.equal(h.elements.hsoNav, nav, 'bottom navigation keeps its DOM instance');

  h.click('data-hso-edit', 'alice');
  h.elements.hsoName.value = 'Unsaved mobile name';
  h.data.staff_owner_list[0].full_name = 'Another web edit';
  const beforeEditorRead = h.calls.length, beforeEditorWrites = h.elements.hsoContent.writes;
  await h.refresh();
  assert.equal(h.calls.length, beforeEditorRead, 'open staff editor defers reads');
  assert.equal(h.elements.hsoName.value, 'Unsaved mobile name');
  assert.equal(h.elements.hsoContent.writes, beforeEditorWrites);
  h.click('data-hso-action', 'cancel-edit');
  h.control.canRefresh = false;
  h.elements.hsoSupervisor.value = 'unsaved-choice';
  await h.refresh();
  assert.equal(h.elements.hsoSupervisor.value, 'unsaved-choice', 'coordinator form guard preserves Supervisor selection');
  h.control.canRefresh = true;
  await h.refresh();
  assert.match(h.elements.hsoContent.innerHTML, /Another web edit/);

  h.control.readGate = deferred();
  h.data.staff_owner_list[0].full_name = 'Single flight';
  const beforeFlight = h.calls.filter(x => x.name === 'staff_owner_list').length;
  const first = h.refresh(), second = h.refresh();
  assert.equal(first, second, 'overlapping refreshes share one promise');
  assert.equal(h.calls.filter(x => x.name === 'staff_owner_list').length, beforeFlight + 1);
  h.click('data-hso-edit', 'alice');
  h.elements.hsoName.value = 'Draft while request in flight';
  h.control.readGate.resolve();
  await first;
  assert.equal(h.elements.hsoName.value, 'Draft while request in flight');
  assert.doesNotMatch(h.elements.hsoContent.innerHTML, /Single flight/, 'editor opened during fetch prevents applying response');
  h.control.readGate = null;
  h.click('data-hso-action', 'cancel-edit');
  await h.refresh();
  assert.match(h.elements.hsoContent.innerHTML, /Single flight/, 'deferred change appears after editor closes');

  h.click('data-hso-edit', 'alice');
  h.elements.hsoName.value = 'Saved mobile name';
  h.control.writeGate = deferred();
  h.click('data-hso-action', 'save-user');
  h.click('data-hso-action', 'save-user');
  assert.equal(h.calls.filter(x => x.name === 'staff_owner_save').length, 1, 'concurrent own saves are guarded');
  const beforeMutationRefresh = h.calls.length;
  await h.refresh();
  assert.equal(h.calls.length, beforeMutationRefresh, 'background refresh waits for mutation');
  h.control.failReads = true;
  h.control.writeGate.resolve();
  await flush();
  assert.equal(h.control.notifications, 1, 'successful write notifies peers even if subsequent refresh fails');
  h.control.failReads = false;
  h.control.writeGate = null;
  h.click('data-hso-action', 'cancel-edit');
  await h.refresh();
  assert.match(h.elements.hsoContent.innerHTML, /Saved mobile name/);

  const race = harness();
  await flush();
  race.click('data-hso-nav', 'users');
  const staleGate = deferred();
  race.control.readGate = staleGate;
  const staleRefresh = race.refresh();
  race.control.readGate = null;
  race.click('data-hso-edit', 'alice');
  race.elements.hsoName.value = 'Newer mutation';
  race.click('data-hso-action', 'save-user');
  await flush();
  assert.match(race.elements.hsoContent.innerHTML, /Newer mutation/);
  const afterMutation = race.elements.hsoContent.writes;
  staleGate.resolve();
  await staleRefresh;
  assert.equal(race.elements.hsoContent.writes, afterMutation, 'older read cannot overwrite a completed own mutation');
  assert.match(race.elements.hsoContent.innerHTML, /Newer mutation/);

  const failure = harness();
  await flush();
  failure.click('data-hso-nav', 'users');
  failure.control.failReads = true;
  const beforeFailure = failure.elements.hsoContent.innerHTML;
  await failure.refresh();
  assert.equal(failure.elements.hsoContent.innerHTML, beforeFailure, 'read failure retains last successful data');
  failure.control.failReads = false;
  failure.data.staff_owner_list[0].full_name = 'Recovered';
  await failure.refresh();
  assert.match(failure.elements.hsoContent.innerHTML, /Recovered/);

  const external = harness();
  await flush();
  external.click('data-hso-nav', 'users');
  external.data.staff_owner_list[0].full_name = 'Old response after logout';
  external.control.readGate = deferred();
  const late = external.refresh(), beforeLogout = external.elements.hsoContent.writes;
  external.click('data-hso-action', 'logout');
  external.control.readGate.resolve();
  await late;
  await flush();
  assert.equal(external.elements.hsoContent.writes, beforeLogout, 'logout discards pending background response');
  assert.equal(external.control.reloads, 1);

  const gps = harness();
  await flush();
  gps.click('data-hso-action', 'set-location');
  gps.click('data-hso-action', 'logout');
  gps.control.gps({ coords: { latitude: -8, longitude: 111 } });
  await flush();
  assert.equal(gps.calls.filter(x => x.name === 'staff_owner_set_attendance_location').length, 0, 'GPS completion after logout must not start a write');

  console.log('Owner Mobile sync: external updates, form preservation, single-flight, write notification and logout guards PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
