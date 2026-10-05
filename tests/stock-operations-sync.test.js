const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

// Run the real module reads/renders with bounded, read-only database fixtures.
function fixture(file, exports, tab) {
  const nodes = new Map(), handlers = new Map(), queries = [], registered = new Map();
  const listeners = new Map();
  function node(id) {
    let markup = '';
    const element = {
      id, hidden: true, writes: 0, fields: new Map(),
      classList: { contains(value) { return value === 'hidden' && element.hidden; } },
      querySelector(selector) { return element.fields.get(selector) || (selector.includes('.sc3-shell') ? shell : null); },
      querySelectorAll() { return []; }, contains(field) { return field === document.activeElement; },
      setAttribute() {}, removeAttribute() {}, replaceChildren() {},
      get innerHTML() { return markup; },
      set innerHTML(value) { markup = String(value); element.writes++; }
    };
    return element;
  }
  const shell = node('shell');
  const host = node(tab); nodes.set(tab, host);
  const document = {
    activeElement: null, visibilityState: 'visible',
    getElementById(id) { return nodes.get(id) || null; },
    createElement() { return node(); },
    addEventListener(name, listener) { listeners.set(name, listener); },
    head: { appendChild(element) { nodes.set(element.id, element); } }
  };
  const f = { host, shell, document, handlers, queries, registered, dirty: false, notifications: 0, cleared: [] };
  const sync = {
    register(name, refresh) { registered.set(name, refresh); },
    notify() { f.notifications++; },
    canRefresh() { return !f.dirty && !document.activeElement; },
    clearDraft(row) { f.cleared.push(row); f.dirty = false; }
  };
  const db = {
    from(table) {
      const query = { table, filters: [] };
      const builder = {
        select(fields, options) { query.fields = fields; query.options = options; return builder; },
        order() { return builder; }, limit(limit) { query.limit = limit; return builder; },
        eq(key, value) { query.filters.push([key, value]); return builder; },
        range(from, to) { query.range = [from, to]; return builder; },
        then(yes, no) {
          queries.push(clone(query));
          const handler = handlers.get(table);
          return Promise.resolve().then(() => {
            assert.ok(handler, 'expected SELECT ' + table);
            return handler(query);
          }).then(yes, no);
        }
      };
      return builder;
    },
    async rpc(name, args) {
      queries.push({ rpc: name, args: clone(args) });
      const handler = handlers.get(name);
      assert.ok(handler, 'explicit RPC ' + name);
      return handler(args);
    }
  };
  const window = {
    __HASNARIA_DATA_SYNC: sync, __HASNARIA_DB: db,
    __HASNARIA_CONTEXT: { role: 'owner', userId: 'owner-a' },
    HASNARIA_SB: 'https://example.supabase.co', HASNARIA_KEY: 'public-key',
    __HASNARIA_GET_ACCESS_TOKEN: async () => 'test-token'
  };
  const context = {
    window, document, URLSearchParams, Date, Number, Promise, JSON,
    localStorage: { length: 0 }, MutationObserver: function() { this.observe = () => {}; },
    setTimeout() { return 1; },
    async fetch(url, options) {
      const [table, query] = url.split('/rest/v1/')[1].split('?');
      queries.push({ table, method: options.method || 'GET', query: Object.fromEntries(new URLSearchParams(query)) });
      const handler = handlers.get(table);
      assert.ok(handler, 'expected GET ' + table);
      const data = await handler(queries[queries.length - 1]);
      return { ok: true, json: async () => clone(data) };
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const exposed = source.replace(/\}\)\(\);\s*$/, '\nwindow.__test = {' + exports + '};\n})();');
  vm.runInNewContext(exposed, context, { filename: file });
  f.api = window.__test; f.window = window; host.hidden = false;
  return f;
}

function stockFixture() {
  const f = fixture('stock-control-v3.js', 'S,syncRefresh,supplementalItems,render,loadLedger', 'stok');
  const raw = Array.from({ length: 40 }, (_, i) => ({ inventory_item_id: 'sku-' + i, item_name: 'Material ' + i,
    category: 'Bahan', unit: 'kg', min_qty: 2, order_qty: 4, system_qty: 10, purchase_qty: 4,
    sales_usage_qty: 1, last_opname_date: '2026-10-01', last_physical_qty: 7, tracking_active: true }));
  const recipes = raw.map(row => ({ inventory_item_id: row.inventory_item_id }));
  const periods = [{ period_start: '2026-11-01' }, { period_start: '2026-10-01' }];
  const overview = { sku_count: 40, movement_rows: 3 };
  const activity = [{ movement_type: 'PURCHASE', movement_rows: 3, sku_count: 2 }];
  const ledger = Array.from({ length: 80 }, (_, i) => ({ movement_id: i, movement_date: '2026-10-01', qty_delta: 1 }));
  const data = { raw, recipes, periods, overview, activity, ledger };
  Object.assign(f.api.S, { raw: clone(raw), items: f.api.supplementalItems(clone(raw), recipes, [], []), baseLoaded: true,
    auxLoaded: true, periods: clone(periods), period: '2026-10', overview: clone(overview), activity: clone(activity),
    modal: 'position', category: 'Bahan', page: 2 });
  for (const [table, value] of [
    ['inventory_stock_reconciliation', 'raw'], ['ui_period_catalog_v1', 'periods'],
    ['inventory_recipe_components', 'recipes'], ['ui_stock_activity_chart_v1', 'activity'], ['ui_stock_detail_v1', 'ledger']
  ]) f.handlers.set(table, () => clone(data[value]));
  f.handlers.set('ui_stock_overview_v1', () => [clone(data.overview)]);
  f.handlers.set('purchase_order_items', () => []);
  f.api.render(); f.data = data;
  return f;
}

function operationsFixture() {
  const f = fixture('operational-v1.js', 'state,syncRefresh,render,loadItemPage,saveItem', 'operasional');
  const run = { id: 'run-a', run_type: 'stock_opname', title: 'Opname', scheduled_date: '2026-10-01', status: 'in_progress', updated_at: 'old' };
  const items = [{ id: 'item-26', label: 'Susu', item_type: 'stock_count', numeric_value: 10, notes: '', expected_qty: 9 }];
  const data = { runs: [run], selected: run, items, total: 80 };
  Object.assign(f.api.state, { loaded: true, runs: clone(data.runs), activeRun: clone(run), items: clone(items), itemPage: 2, itemTotal: 80 });
  f.handlers.set('operational_runs', query => ({ data: clone(query.filters.length ? [data.selected] : data.runs), error: null }));
  f.handlers.set('operational_run_items', () => ({ data: clone(data.items), count: data.total, error: null }));
  f.api.render(); f.data = data;
  return f;
}

async function main() {
  const stock = stockFixture(), operations = operationsFixture();
  assert.equal(stock.registered.get('stock-control-v3'), stock.api.syncRefresh);
  assert.equal(operations.registered.get('operational-v1'), operations.api.syncRefresh);
  for (const f of [stock, operations]) {
    const display = f === stock ? f.shell : f.host;
    const writes = display.writes, markup = display.innerHTML;
    await f.api.syncRefresh();
    assert.equal(display.writes, writes, 'unchanged data does not replace the existing view');
    assert.equal(display.innerHTML, markup);
    const queryCount = f.queries.length;
    f.dirty = true; await f.api.syncRefresh(); f.dirty = false;
    f.document.activeElement = { matches: () => true }; await f.api.syncRefresh(); f.document.activeElement = null;
    f.host.hidden = true; await f.api.syncRefresh(); f.host.hidden = false;
    assert.equal(f.queries.length, queryCount, 'dirty, focused, or hidden views do not read');
    const state = f === stock ? f.api.S : f.api.state;
    const blocked = f === stock ? ['baseLoading', 'auxLoading', 'periodLoading', 'ledgerLoading'] : ['loading', 'itemLoading', 'membersLoading', 'busy', 'itemSaves', 'createOpen'];
    for (const field of blocked) {
      state[field] = true; await f.api.syncRefresh(); state[field] = false;
      assert.equal(f.queries.length, queryCount, field + ' defers background reads');
    }
  }

  stock.data.raw[0].system_qty = 5;
  stock.data.overview.movement_rows = 4;
  await stock.api.syncRefresh();
  assert.equal(stock.api.S.items[0].balance_qty, 5);
  assert.equal(stock.api.S.period, '2026-10', 'newest catalog entry does not select a different period');
  assert.equal(stock.api.S.category, 'Bahan'); assert.equal(stock.api.S.page, 2); assert.equal(stock.api.S.modal, 'position');
  assert.ok(stock.queries.every(query => query.method === 'GET'), 'background stock refresh only performs GET reads');
  stock.api.S.modal = 'ledger'; stock.api.S.ledger = clone(stock.data.ledger); stock.api.S.ledgerPage = 2;
  stock.data.ledger[0].qty_delta = 3;
  await stock.api.syncRefresh();
  assert.equal(stock.api.S.ledger[0].qty_delta, 3); assert.equal(stock.api.S.ledgerPage, 2);
  assert.ok(stock.queries.filter(q => q.table === 'ui_stock_detail_v1').every(q => q.query.period_month === 'eq.2026-10-01'));

  operations.data.selected.status = 'submitted'; operations.data.items[0].numeric_value = 12;
  await operations.api.syncRefresh();
  assert.equal(operations.api.state.activeRun.status, 'submitted');
  assert.equal(operations.api.state.items[0].numeric_value, 12); assert.equal(operations.api.state.itemPage, 2);
  assert.ok(operations.queries.every(query => !query.rpc), 'background operations refresh performs SELECT reads only');
  assert.ok(operations.queries.filter(q => q.table === 'operational_run_items').every(q => q.range.join(',') === '25,49'));
  operations.data.runs = [];
  await operations.api.syncRefresh();
  assert.equal(operations.api.state.activeRun.id, 'run-a', 'opened run stays selected outside the latest 30 headers');

  // Failures, a navigation change, or a new edit during reads keep the last successful view.
  for (const f of [stock, operations]) {
    const display = f === stock ? f.shell : f.host;
    const table = f === stock ? 'inventory_stock_reconciliation' : 'operational_runs';
    const original = f.handlers.get(table), writes = display.writes;
    f.handlers.set(table, () => { throw new Error('temporary network failure'); });
    await f.api.syncRefresh(); assert.equal(display.writes, writes);
    for (const mutate of [() => { f.dirty = true; }, () => { f.host.hidden = true; }, () => {
      if (f === stock) f.api.S.period = '2026-09'; else f.api.state.itemPage = 3;
    }]) {
      const pending = deferred(); f.handlers.set(table, () => pending.promise);
      const request = f.api.syncRefresh(); await tick();
      assert.equal(display.writes, writes, 'refresh has no loading render');
      mutate(); pending.resolve(original({ filters: [] })); await request;
      assert.equal(display.writes, writes, 'late result cannot replace a changed view');
      f.dirty = false; f.host.hidden = false;
      if (f === stock) f.api.S.period = '2026-10'; else f.api.state.itemPage = 2;
    }
    f.handlers.set(table, original);
  }

  // Item saves are explicit mutations; refresh waits and only the saved row is cleared.
  const f = operationsFixture(), pendingSave = deferred(), row = {};
  const value = { value: '14' }, note = { value: 'saved note' };
  const button = { disabled: false, textContent: 'Simpan', closest: () => row, classList: { add() {}, remove() {} } };
  f.host.fields.set('[data-op-value="item-26"]', value); f.host.fields.set('[data-op-note="item-26"]', note);
  f.handlers.set('set_operational_run_item', () => pendingSave.promise);
  const save = f.api.saveItem('item-26', button);
  const beforeRefresh = f.queries.length;
  await f.api.syncRefresh(); assert.equal(f.queries.length, beforeRefresh);
  pendingSave.resolve({ data: [{ numeric_value: 14, notes: 'saved note' }], error: null }); await save;
  assert.equal(f.api.state.itemSaves, 0); assert.equal(f.notifications, 1); assert.equal(f.cleared[0], row);
  const changedSave = deferred(); f.handlers.set('set_operational_run_item', () => changedSave.promise);
  const saveAgain = f.api.saveItem('item-26', button); value.value = '15';
  changedSave.resolve({ data: [{ numeric_value: 14 }], error: null }); await saveAgain;
  assert.equal(f.cleared.length, 1, 'a newer unsaved edit is not cleared by an earlier save');

  // A detail response for a previously selected run never replaces the next run.
  const page = operationsFixture(), stale = deferred();
  page.handlers.set('operational_run_items', query => query.filters[0][1] === 'run-a' ? stale.promise : { data: [{ id: 'run-b-item' }], count: 1 });
  const oldPage = page.api.loadItemPage('run-a', 2);
  await tick(); page.api.state.activeRun = { id: 'run-b', status: 'approved' };
  await page.api.loadItemPage('run-b', 1);
  stale.resolve({ data: [{ id: 'stale-item' }], count: 1 }); await oldPage;
  assert.equal(page.api.state.items[0].id, 'run-b-item'); assert.equal(page.api.state.itemLoading, false);
  console.log('stock/operations synchronization: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
