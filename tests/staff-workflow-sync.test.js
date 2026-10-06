const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync('staff-workflow-v2.js', 'utf8');
const instrumented = source.replace(/\}\)\(\);\s*$/, `window.__workflowTest = {
  loadContext, openWorkflow, loadDay, closeOverlay, refreshWorkflow,
  openSupervisor, openSupervisorDetail, closeSupervisor, loadSupervisor,
  mutateDay, mutateSupervisor, submitDay,
  addStock, updateLastQty,
  context: function () { return context; },
  state: function () { return overlayState; }
}; })();`);
const contextRow = { employee_id: 'staff-a', full_name: 'Staff A', modules: ['kasir', 'gudang'], is_supervisor: true };
const dayRow = { status: 'draft', sales: { cash_amount: 0 }, purchases: [], stock: [] };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const nodes = new Map(), calls = [], handlers = new Map(), callbacks = new Map();
  let sessionToken = 'token-a', blocked = false, notifications = 0;
  let currentTime = Date.parse('2026-10-03T16:59:00Z');
  class WorkflowDate extends Date {
    constructor(...args) { super(...(args.length ? args : [currentTime])); }
    static now() { return currentTime; }
  }
  function register(node) {
    node.isConnected = true;
    if (node.id) nodes.set(node.id, node);
    node.children.forEach(register);
  }
  function unregister(node) {
    node.isConnected = false;
    if (nodes.get(node.id) === node) nodes.delete(node.id);
    node.children.forEach(unregister);
  }
  class Element {
    constructor() { this.id = ''; this.children = []; this.writes = 0; this.dataset = {}; this.isConnected = false; }
    set innerHTML(value) {
      this.children.forEach(unregister); this.children = [];
      this.html = value; this.writes++;
      if (value.includes('id="hswSupervisorBody"')) {
        const body = new Element(); body.id = 'hswSupervisorBody'; this.children.push(body);
        if (this.isConnected) register(body);
      }
    }
    get innerHTML() { return this.html || ''; }
    appendChild(node) { this.children.push(node); if (this.isConnected) register(node); return node; }
    remove() { unregister(this); }
    setAttribute() {}
  }
  const body = new Element(); body.isConnected = true;
  const staffRoot = new Element(); staffRoot.id = 'staffRoot'; body.appendChild(staffRoot);
  const document = {
    readyState: 'complete', body,
    getElementById: id => nodes.get(id) || null,
    querySelector: () => null,
    createElement: () => new Element(),
    addEventListener() {}
  };
  const defaults = {
    staff_session_context_v2: [contextRow], staff_daily_context_v1: dayRow,
    staff_inventory_options_v1: [{ inventory_item_id: 'ice', item_name: 'Ice', ledger_qty: 1, unit: 'kg' }],
    staff_stock_opname_history_v1: [{ inventory_item_id: 'ice', item_name: 'Ice', physical_qty: 3, opname_date: '2026-10-02', unit: 'kg' }],
    staff_supervisor_queue_v1: [{ batch_id: 'batch-a', full_name: 'Staff A', status: 'submitted' }],
    staff_supervisor_batch_detail_v1: { batch_id: 'batch-a', full_name: 'Staff A', status: 'submitted' }
  };
  const window = {
    supabase: { createClient: () => ({ rpc(name, args) {
      calls.push({ name, args });
      try { return Promise.resolve(handlers.has(name) ? handlers.get(name)(args) : defaults[name])
        .then(data => ({ data, error: null })); }
      catch (error) { return Promise.reject(error); }
    } }) },
    __HASNARIA_DATA_SYNC: {
      register: (name, fn) => callbacks.set(name, fn),
      notify: () => { notifications++; },
      canRefresh: host => host.isConnected && !blocked
    }
  };
  vm.runInNewContext(instrumented, {
    window, document, localStorage: { getItem: () => sessionToken },
    Intl, Date: WorkflowDate, Promise, setTimeout() {}, prompt: () => 'reason', alert() {}
  });
  return {
    api: window.__workflowTest, document, calls, handlers, defaults, callbacks,
    token(value) { sessionToken = value; }, block(value) { blocked = value; },
    time(value) { currentTime = Date.parse(value); },
    field(id, value) { const field = new Element(); field.id = id; field.value = value; document.getElementById('hswOverlay').appendChild(field); return field; },
    notifications: () => notifications
  };
}

test('workflow registers with shared sync and unchanged data preserves overlay DOM', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  assert(h.callbacks.has('staff-workflow'));
  const host = h.document.getElementById('hswOverlay'), writes = host.writes;
  await h.callbacks.get('staff-workflow')('interval');
  assert.equal(host.writes, writes);
  h.defaults.staff_daily_context_v1 = { ...dayRow, status: 'submitted' };
  await h.api.refreshWorkflow();
  assert.equal(h.api.state().day.status, 'submitted');
  assert.equal(host.writes, writes + 1);
  assert(host.innerHTML.includes('Menunggu Supervisor'));
});

test('background refresh keeps active drafts both before and during RPC', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  const host = h.document.getElementById('hswOverlay'), writes = host.writes;
  h.block(true);
  const count = h.calls.filter(x => x.name === 'staff_daily_context_v1').length;
  await h.api.loadDay('kasir', true);
  assert.equal(h.calls.filter(x => x.name === 'staff_daily_context_v1').length, count);
  h.block(false);
  const request = deferred(); h.handlers.set('staff_daily_context_v1', () => request.promise);
  const pending = h.api.loadDay('kasir', true); h.block(true);
  request.resolve({ ...dayRow, status: 'submitted' }); await pending;
  assert.equal(host.writes, writes);
  assert.equal(h.api.state().day.status, 'draft');
});

test('Gudang refresh refetches cached inventory quantities', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('gudang');
  h.defaults.staff_inventory_options_v1 = [{ inventory_item_id: 'ice', item_name: 'Ice', ledger_qty: 8, unit: 'kg' }];
  await h.api.loadDay('gudang', true);
  assert.equal(h.api.state().inventory[0].ledger_qty, 8);
  assert.equal(h.calls.filter(x => x.name === 'staff_inventory_options_v1').length, 2);
});

test('Gudang refresh updates opname history and preserves the current quantity flow from main', async () => {
  const h = harness(); h.defaults.staff_daily_context_v1 = { ...dayRow, is_supervisor: true };
  await h.api.loadContext(true); await h.api.openWorkflow('gudang');
  const host = h.document.getElementById('hswOverlay');
  assert(host.innerHTML.includes('Qty saat ini')); assert(!host.innerHTML.includes('hswSType'));
  assert(host.innerHTML.includes('Riwayat Stok Opname'));
  const item = h.field('hswSItem', 'ice'), quantity = h.field('hswSQty', ''), notes = h.field('hswSNotes', '');
  h.api.updateLastQty(); assert.equal(quantity.value, 3); assert.equal(quantity.placeholder, 'Qty terakhir');
  assert(notes.value.includes('2026-10-02'));
  quantity.value = '7'; notes.value = 'Physical count'; h.block(true);
  const historyCalls = h.calls.filter(call => call.name === 'staff_stock_opname_history_v1').length;
  await h.api.loadDay('gudang', true);
  assert.equal(h.calls.filter(call => call.name === 'staff_stock_opname_history_v1').length, historyCalls);
  assert.equal(quantity.value, '7', 'unsaved physical quantity stays attached');
  await h.api.addStock();
  const write = h.calls.find(call => call.name === 'staff_daily_add_stock_v1');
  assert.equal(write.args.p_inventory_item_id, item.value);
  assert.equal(write.args.p_movement_type, 'OPNAME_CORRECTION'); assert.equal(write.args.p_qty_delta, 7);
  assert.equal(write.args.p_date, '2026-10-03'); assert.equal(h.api.state().msg, 'Kuantitas stok hari ini disimpan.');
  h.defaults.staff_stock_opname_history_v1 = [{ inventory_item_id: 'ice', item_name: 'Ice', physical_qty: 9, opname_date: '2026-10-03', unit: 'kg' }];
  h.block(false); await h.api.loadDay('gudang', true);
  assert.equal(h.api.state().opnameHistory[0].physical_qty, 9);
  const latestQuantity = h.field('hswSQty', ''), latestNotes = h.field('hswSNotes', ''); h.field('hswSItem', 'ice');
  h.api.updateLastQty(); assert.equal(latestQuantity.value, 9); assert(latestNotes.value.includes('2026-10-03'));
});

test('old token context cannot replace a new staff context', async () => {
  const h = harness(); await h.api.loadContext(true);
  const old = deferred();
  h.handlers.set('staff_session_context_v2', args => args.p_token === 'token-a' ? old.promise : [{ ...contextRow, employee_id: 'staff-b', full_name: 'Staff B' }]);
  const pending = h.api.loadContext(true); h.token('token-b'); await h.api.loadContext(true);
  old.resolve([contextRow]); await pending;
  assert.equal(h.api.context().employeeId, 'staff-b');
});

test('transient context failure preserves Supervisor action and authoritative empty removes it', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.refreshWorkflow();
  await h.api.openWorkflow('kasir'); await h.api.openSupervisor();
  const fab = h.document.getElementById('hswSupervisorFab'); assert(fab);
  h.handlers.set('staff_session_context_v2', () => { throw new Error('network timeout'); });
  await h.api.refreshWorkflow();
  assert.equal(h.document.getElementById('hswSupervisorFab'), fab);
  assert.equal(h.api.context().employeeId, 'staff-a');
  assert(h.document.getElementById('hswOverlay')); assert(h.document.getElementById('hswSupervisorModal'));
  h.handlers.delete('staff_session_context_v2'); h.defaults.staff_session_context_v2 = [];
  await h.api.refreshWorkflow();
  assert.equal(h.api.context(), null); assert.equal(h.document.getElementById('hswSupervisorFab'), null);
  assert.equal(h.document.getElementById('hswOverlay'), null);
  assert.equal(h.document.getElementById('hswSupervisorModal'), null);
});

test('a dirty draft crossing Jakarta midnight writes and reloads its displayed business date', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  assert.equal(h.api.state().date, '2026-10-03');
  const host = h.document.getElementById('hswOverlay'), writes = host.writes;
  h.block(true); h.time('2026-10-03T17:01:00Z');
  await h.api.refreshWorkflow();
  assert.equal(host.writes, writes, 'the unsaved prior-day draft stays attached');
  await h.api.mutateDay('staff_daily_save_sales_v1', { p_date: '2026-10-04', p_transaction_count: 1, p_cash: 12000 }, '');
  const save = h.calls.find(call => call.name === 'staff_daily_save_sales_v1');
  assert.equal(save.args.p_date, '2026-10-03', 'visible old-date figures never post to the new business day');
  assert.equal(h.calls.filter(call => call.name === 'staff_daily_context_v1').at(-1).args.p_date, '2026-10-03');
  assert.equal(h.api.state().date, '2026-10-03'); assert(host.innerHTML.includes('2026-10-03'));
  h.block(false); await h.api.refreshWorkflow();
  assert.equal(h.api.state().date, '2026-10-04', 'a later clean refresh moves to the new day');
});

test('a daily read crossing midnight is discarded and the next refresh recovers', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  const old = deferred(); h.handlers.set('staff_daily_context_v1', () => old.promise);
  const reading = h.api.loadDay('kasir', true); h.time('2026-10-03T17:01:00Z');
  old.resolve({ ...dayRow, status: 'posted' }); await reading;
  assert.equal(h.api.state().day.status, 'draft');
  h.handlers.delete('staff_daily_context_v1'); await h.api.refreshWorkflow();
  assert.equal(h.api.state().date, '2026-10-04', 'discarded reads release the loading guard');
});

test('a successful mutation crossing midnight acknowledges its original day and replaces the saved draft', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  const save = deferred(); h.handlers.set('staff_daily_save_sales_v1', () => save.promise);
  const host = h.document.getElementById('hswOverlay'), writes = host.writes;
  const saving = h.api.mutateDay('staff_daily_save_sales_v1', { p_date: '2026-10-03', p_cash: 12000 }, 'Rekap penjualan tersimpan.');
  h.time('2026-10-03T17:01:00Z'); save.resolve({}); await saving;
  assert.equal(h.calls.find(call => call.name === 'staff_daily_save_sales_v1').args.p_date, '2026-10-03');
  assert.equal(h.calls.filter(call => call.name === 'staff_daily_context_v1').at(-1).args.p_date, '2026-10-03');
  assert.equal(h.api.state().date, '2026-10-03');
  assert.equal(h.api.state().msg, 'Rekap penjualan tersimpan.'); assert(host.writes > writes);
  assert.equal(h.notifications(), 1);
});

test('closed or replaced overlays reject old daily data and stale errors', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  const old = deferred(); h.handlers.set('staff_daily_context_v1', () => old.promise);
  const pending = h.api.loadDay('kasir'); h.api.closeOverlay();
  h.handlers.delete('staff_daily_context_v1'); await h.api.openWorkflow('gudang');
  const host = h.document.getElementById('hswOverlay'), writes = host.writes;
  old.reject(new Error('old request failed')); await pending;
  assert.equal(h.api.state().module, 'gudang'); assert.equal(host.writes, writes);
});

test('latest module request wins when Kasir response arrives after Gudang', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  const old = deferred(); let requests = 0;
  h.handlers.set('staff_daily_context_v1', () => ++requests === 1 ? old.promise : dayRow);
  const pending = h.api.loadDay('kasir'); await h.api.loadDay('gudang');
  old.resolve({ ...dayRow, status: 'rejected' }); await pending;
  assert.equal(h.api.state().module, 'gudang'); assert.equal(h.api.state().day.status, 'draft');
});

test('mutation completion after close publishes invalidation without reopening', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  const mutation = deferred(); h.handlers.set('staff_daily_submit_v1', () => mutation.promise);
  const count = h.calls.filter(x => x.name === 'staff_daily_context_v1').length;
  const pending = h.api.submitDay(); h.api.closeOverlay(); mutation.resolve({}); await pending;
  assert.equal(h.notifications(), 1); assert.equal(h.api.state(), null);
  assert.equal(h.calls.filter(x => x.name === 'staff_daily_context_v1').length, count);
});

test('mutation invalidation is published even when post-commit reload fails', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  h.handlers.set('staff_daily_context_v1', () => { throw new Error('reload failed'); });
  await assert.rejects(h.api.submitDay(), /reload failed/);
  assert.equal(h.notifications(), 1);
});

test('repeated Staff mutation clicks send one write while a request is pending', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir');
  const mutation = deferred(); h.handlers.set('staff_daily_add_purchase_v1', () => mutation.promise);
  const pending = h.api.mutateDay('staff_daily_add_purchase_v1', { p_item_name: 'Ice', p_quantity: 1 }, '');
  await h.api.mutateDay('staff_daily_add_purchase_v1', { p_item_name: 'Ice', p_quantity: 1 }, '');
  assert.equal(h.calls.filter(x => x.name === 'staff_daily_add_purchase_v1').length, 1);
  mutation.resolve({}); await pending; assert.equal(h.notifications(), 1);
});

test('supervisor queue preserves unchanged DOM and receives external changes', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openSupervisor();
  const body = h.document.getElementById('hswSupervisorBody'), writes = body.writes;
  await h.api.loadSupervisor(true); assert.equal(body.writes, writes);
  h.defaults.staff_supervisor_queue_v1 = [{ batch_id: 'batch-a', full_name: 'Staff A', status: 'approved' }];
  await h.api.loadSupervisor(true);
  assert.equal(body.writes, writes + 1); assert(body.innerHTML.includes('Post ke Sistem'));
});

test('old supervisor queue cannot overwrite a newer detail or reopen closed modal', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openSupervisor();
  const old = deferred(); h.handlers.set('staff_supervisor_queue_v1', () => old.promise);
  const pending = h.api.loadSupervisor(false); await h.api.openSupervisorDetail('batch-a');
  const body = h.document.getElementById('hswSupervisorBody'), writes = body.writes;
  old.resolve([]); await pending; assert.equal(body.writes, writes);
  const mutation = deferred(); h.handlers.set('staff_supervisor_post_approved_v1', () => mutation.promise);
  const posting = h.api.mutateSupervisor('staff_supervisor_post_approved_v1', { p_batch_id: 'batch-a' });
  h.api.closeSupervisor(); mutation.resolve({}); await posting;
  assert.equal(h.document.getElementById('hswSupervisorModal'), null); assert.equal(h.notifications(), 1);
});

test('repeated Supervisor action clicks send one write while a request is pending', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openSupervisor();
  const mutation = deferred(); h.handlers.set('staff_supervisor_post_approved_v1', () => mutation.promise);
  const pending = h.api.mutateSupervisor('staff_supervisor_post_approved_v1', { p_batch_id: 'batch-a' });
  await h.api.mutateSupervisor('staff_supervisor_post_approved_v1', { p_batch_id: 'batch-a' });
  assert.equal(h.calls.filter(x => x.name === 'staff_supervisor_post_approved_v1').length, 1);
  mutation.resolve({}); await pending; assert.equal(h.notifications(), 1);
});

test('token replacement closes protected overlays before fetching new data', async () => {
  const h = harness(); await h.api.loadContext(true); await h.api.openWorkflow('kasir'); await h.api.openSupervisor();
  h.token('token-b'); await h.api.refreshWorkflow();
  assert.equal(h.document.getElementById('hswOverlay'), null);
  assert.equal(h.document.getElementById('hswSupervisorModal'), null);
});
