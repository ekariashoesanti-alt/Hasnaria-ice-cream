const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Asset wiring and existing manual hooks survive the move from forced
// mounts/clicks to independent, read-only module handlers.
const entryVersions = [];
for (const file of ['index.html', 'staff.html', 'staff/index.html']) {
  const tags = [...read(file).matchAll(/<script[^>]+src="\/data-sync\.js\?v=(\d+)"/g)];
  assert.equal(tags.length, 1, file + ': load one shared sync coordinator');
  assert.ok(Number(tags[0][1]) > 1, file + ': invalidate the prior coordinator asset');
  entryVersions.push(tags[0][1]);
}
assert.equal(new Set(entryVersions).size, 1, 'web and mobile entrypoints use the same coordinator asset');
assert.match(read('staff-owner-stable-v1.js'), /__HASNARIA_OWNER_STABLE_REFRESH\s*=\s*silentRefresh/, 'Owner mobile manual hook uses its guarded silent reader');
assert.match(read('purchase-finance-alignment-v1.js'), /__HASNARIA_PURCHASE_FINANCE_REFRESH\s*=\s*syncReport/, 'Purchase manual hook uses the canonical read-only report refresh');
assert.match(read('purchase-analytics.js'), /__HASNARIA_PURCHASE_ANALYTICS_REFRESH/, 'the existing Purchase analytics manual hook remains available');
for (const [file, asset, previous] of [
  ['staff.html', 'staff-owner-stable-v1.js', 4],
  ['staff/index.html', 'staff-owner-stable-v1.js', 4],
  ['xlsx-preload.js', 'purchase-finance-alignment-v1.js', 9]
]) {
  const version = read(file).match(new RegExp('/' + asset.replace(/\./g, '\\.') + '\\?v=(\\d+)'));
  assert.ok(version && Number(version[1]) > previous, file + ': refresh hook changes invalidate the previous asset');
}
for (const [file, name] of [
  ['owner-dashboard-one-view.js', 'owner-dashboard'],
  ['administration-v1.js', 'owner-administration-report'],
  ['operational-v1.js', 'operational-v1'],
  ['finance-accuracy-v6.js', 'owner-finance-report'],
  ['finance-purchase-basis-v1.js', 'owner-finance-management'],
  ['purchase-finance-alignment-v1.js', 'owner-purchase-report'],
  ['stock-control-v3.js', 'stock-control-v3'],
  ['staff-owner-stable-v1.js', 'owner-mobile']
]) {
  assert.match(read(file), new RegExp("\\.register\\(\\s*['\"]" + name + "['\"]"), file + ': register its own guarded data reader');
}

function setup() {
  const nodes = new Map(), winEvents = {}, docEvents = {}, timers = new Map();
  let timerId = 0, activeTab = 'dashboard';
  function element(id, tagName = 'DIV', type = '') {
    const el = {
      id, tagName, type, hidden: false, disabled: false, readOnly: false,
      value: '', defaultValue: '', checked: false, defaultChecked: false,
      files: [], options: [], isContentEditable: false, monthFilter: false,
      display: 'block', visibility: 'visible', fields: [],
      querySelectorAll() { return this.fields; },
      contains(node) { return node === this || this.fields.includes(node); },
      matches(selector) { return selector.split(',').some(part => part.trim() === '#' + this.id || part.trim().toUpperCase() === this.tagName || part.includes('contenteditable') && this.isContentEditable); },
      hasAttribute(name) { return name === 'data-month-filter' && this.monthFilter; },
      getAttribute(name) { return name === 'data-tab' ? activeTab : name === 'contenteditable' ? String(this.isContentEditable) : null; }
    };
    nodes.set(id, el); return el;
  }
  const body = element('body'), dashboard = element('dashboard'), staff = element('staffRoot');
  staff.hidden = true;
  const overlay = element('hswOverlay'), editor = element('hsoEditor');
  overlay.hidden = editor.hidden = true;
  const document = {
    body, visibilityState: 'visible', hidden: false, activeElement: body,
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => selector.includes('#tabs') && activeTab ? { getAttribute: () => activeTab } : null,
    addEventListener(name, callback) { docEvents[name] = callback; },
    dispatchEvent(event) { docEvents[event.type]?.(event); }
  };
  const window = {
    __HASNARIA_OWNER_SHELL: { getActive: () => activeTab },
    addEventListener(name, callback) { winEvents[name] = callback; },
    dispatchEvent(event) { winEvents[event.type]?.(event); }
  };
  const getComputedStyle = el => ({ display: el.hidden ? 'none' : el.display, visibility: el.visibility });
  window.getComputedStyle = getComputedStyle;
  const navigator = { onLine: true };
  vm.runInNewContext(read('data-sync.js'), {
    window, document, navigator, getComputedStyle, WeakSet, WeakMap, Promise, Date, Math, JSON,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    localStorage: { setItem() {} }, setInterval() {},
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  }, { filename: 'data-sync.js' });
  return {
    sync: window.__HASNARIA_DATA_SYNC, window, document, navigator, element,
    body, dashboard, staff, overlay, editor, winEvents, docEvents,
    set activeTab(value) { activeTab = value; },
    async flush() {
      const pending = [...timers.values()]; timers.clear();
      pending.forEach(callback => callback()); await tick();
    }
  };
}

(async () => {
  const h = setup(), s = h.sync;
  for (const name of ['register', 'notify', 'canRefresh', 'clearDraft', 'request', 'refreshNow', 'protectedNow', 'activeRoot']) {
    assert.equal(typeof s[name], 'function', 'coordinator keeps the public ' + name + ' API');
  }
  assert.equal(s.activeRoot(), h.dashboard);
  h.staff.hidden = false; h.activeTab = '';
  assert.equal(s.activeRoot(), h.staff, 'staff root is selected when no owner tab is visible');
  h.editor.hidden = false;
  assert.equal(s.activeRoot(), h.editor, 'the visible Owner editor protects its own fields');
  assert.equal(s.protectedNow(), true, 'an open Owner editor always protects refresh');
  h.overlay.hidden = false;
  assert.equal(s.activeRoot(), h.overlay, 'a workflow overlay takes precedence over the Owner editor');
  h.editor.hidden = h.overlay.hidden = true;
  h.staff.hidden = true;
  assert.equal(s.activeRoot(), h.body);
  h.activeTab = 'dashboard';
  assert.equal(s.protectedNow(), false);

  // Programmatic changes and autofill protect drafts without input/change events.
  const dirtyCases = [
    ['text', 'INPUT', 'text', el => { el.value = 'draft'; }],
    ['textarea', 'TEXTAREA', '', el => { el.value = 'draft'; }],
    ['checkbox', 'INPUT', 'checkbox', el => { el.checked = true; }],
    ['radio', 'INPUT', 'radio', el => { el.checked = true; }],
    ['file', 'INPUT', 'file', el => { el.files = [{ name: 'draft.csv' }]; }],
    ['select', 'SELECT', '', el => { el.options = [{ selected: false, defaultSelected: true }, { selected: true, defaultSelected: false }]; }],
    ['contenteditable', 'DIV', '', el => { el.isContentEditable = true; }]
  ];
  for (const [id, tagName, type, change] of dirtyCases) {
    const field = h.element(id, tagName, type); change(field);
    h.dashboard.fields = [field];
    assert.equal(s.canRefresh(h.dashboard), false, id + ': native unsaved state protects its host');
    assert.equal(s.protectedNow(), true, id + ': the current surface is protected');
    field.hidden = true;
    assert.equal(s.canRefresh(h.dashboard), true, id + ': hidden fields do not block visible data');
    field.hidden = false; field.disabled = true;
    assert.equal(s.canRefresh(h.dashboard), true, id + ': disabled controls do not hold a draft');
    field.disabled = false; field.readOnly = true;
    assert.equal(s.canRefresh(h.dashboard), true, id + ': readonly controls do not hold a draft');
  }
  const implicit = h.element('implicit-default', 'SELECT');
  implicit.multiple = false;
  implicit.options = [{ selected: true, defaultSelected: false }, { selected: false, defaultSelected: false }];
  h.dashboard.fields = [implicit];
  assert.equal(s.canRefresh(h.dashboard), true, 'a native single select without a selected attribute starts clean on its implicit first option');
  implicit.options[0].selected = false; implicit.options[1].selected = true;
  assert.equal(s.canRefresh(h.dashboard), false, 'changing an implicit-default select protects the unsaved selection');
  s.clearDraft(h.dashboard);
  assert.equal(s.canRefresh(h.dashboard), true, 'saving accepts the selected option as its new default');
  const period = h.element('period', 'SELECT');
  period.monthFilter = true; period.options = [{ selected: true, defaultSelected: false }];
  h.dashboard.fields = [period];
  assert.equal(s.canRefresh(h.dashboard, '#period'), true, 'changed period filters remain readable');
  h.document.activeElement = period;
  assert.equal(s.canRefresh(h.dashboard, '#period'), false, 'focused filters retain their interaction');
  assert.equal(s.protectedNow(), true);
  h.document.activeElement = h.body;

  const field = h.element('saved', 'INPUT', 'text');
  field.value = 'saved value'; h.dashboard.fields = [field];
  h.docEvents.input({ target: field });
  assert.equal(s.canRefresh(h.dashboard), false);
  s.clearDraft(h.dashboard);
  assert.equal(s.canRefresh(h.dashboard), true, 'saving accepts the current control value as its clean baseline');
  assert.equal(field.value, 'saved value', 'clearing draft metadata preserves the visible value');

  let reads = 0, forcedMounts = 0, clicks = 0, release;
  h.window.__HASNARIA_FINANCE_V6_MOUNT = () => { forcedMounts++; };
  h.window.__HASNARIA_OPERATIONS_V1_MOUNT = () => { forcedMounts++; };
  h.dashboard.click = () => { clicks++; };
  s.register('guarded-report', () => {
    if (!s.canRefresh(h.dashboard)) return false;
    reads++; return new Promise(resolve => { release = resolve; });
  });
  const manual = s.refreshNow(); await tick();
  assert.equal(reads, 1, 'manual refresh requests registered readers');
  let done = false; Promise.resolve(manual).then(() => { done = true; });
  await tick(); assert.equal(done, false, 'manual refresh waits for its active read');
  release(true); await manual;
  assert.equal(forcedMounts, 0); assert.equal(clicks, 0, 'sync never simulates mutation buttons');
  field.value = 'new draft'; await s.refreshNow();
  assert.equal(reads, 1, 'manual requests honor module draft guards');
  s.clearDraft(h.dashboard);
  h.document.visibilityState = 'hidden'; h.document.hidden = true;
  await s.refreshNow(); assert.equal(reads, 1, 'manual API does not bypass the visible-surface guard');
  h.document.visibilityState = 'visible'; h.document.hidden = false;
  h.navigator.onLine = false;
  await s.refreshNow(); assert.equal(reads, 1, 'manual API does not poll offline');
  h.navigator.onLine = true;

  for (const [events, event] of [[h.docEvents, 'hasnaria:write-complete'], [h.winEvents, 'hasnaria:purchase-finance-synced']]) {
    assert.equal(typeof events[event], 'function', event + ': keep the existing data-change signal');
    events[event]({}); await h.flush();
    assert.equal(reads, event === 'hasnaria:write-complete' ? 2 : 3, event + ': schedule registered readers');
    release(true); await tick();
  }
  console.log('Guarded sync entrypoints, read-only registration, public APIs and native draft protection: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
