const assert = require('assert/strict');
const path = require('path');
const vm = require('vm');
const { buildCanonicalSalesRuntime } = require('../scripts/build-sales-runtime');

const brand = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const jwt = user => 'test.' + Buffer.from(JSON.stringify({ sub: user, exp: 4000000000 })).toString('base64url') + '.signature';
const metric = revenue => [{ metric_date: '2026-10-01', cash_revenue: revenue, transactions: 2, notes: '', brand_id: brand }];
const hourly = count => [{ sold_at: '2026-10-01', sold_hour: 11, transaction_count: count }];

function setup(lateCoordinator = false) {
  let hidden = false, appHidden = false, safe = true, token = jwt('owner'), handler, renders = 0, html = '';
  let board = { get innerHTML() { return html; }, set innerHTML(value) { html = value; renders++; } };
  const requests = [], events = {}, month = { value: '2026-10' };
  const host = {
    classList: { contains: name => name === 'hidden' && hidden },
    querySelector: selector => selector === '.sale-board' ? board : selector === '#sbMonth' ? month : null,
    querySelectorAll: () => [],
    contains: target => target === month
  };
  let currentHost = host;
  const document = {
    getElementById: id => id === 'sales' ? currentHost : id === 'app' ? { classList: { contains: name => name === 'hidden' && appHidden } } : id === 'sales-board-css' ? {} : null,
    addEventListener(name, callback) { (events[name] || (events[name] = [])).push(callback); }
  };
  const coordinator = {
    register(name, callback) { assert.equal(name, 'owner-sales'); handler = callback; },
    canRefresh(h, ignore) { assert.equal(h, currentHost); assert.equal(ignore, '#sbMonth'); return safe; }
  };
  const window = {
    HASNARIA_SB: 'https://test.invalid', HASNARIA_KEY: 'public-test-key',
    __HASNARIA_CONTEXT: { role: 'owner', userId: 'owner', brandId: brand },
    __HASNARIA_GET_ACCESS_TOKEN: async () => token,
    addEventListener: document.addEventListener,
    __HASNARIA_DATA_SYNC: lateCoordinator ? null : coordinator
  };
  // Expose the closure's state for setup, while retaining the canonical generated
  // API and real chart renderer/bindings used in production.
  const source = buildCanonicalSalesRuntime(path.join(__dirname, '..')).replace(
    '  var tries = 0;', '  window.salesTest = { state: STATE, draw: draw };\n  var tries = 0;'
  );
  vm.runInNewContext(source, {
    window, document, Date, Intl, Number, String, Array, Object, Promise, JSON, encodeURIComponent,
    atob: value => Buffer.from(value, 'base64').toString(),
    localStorage: { length: 0, getItem: () => null },
    MutationObserver: class { observe() {} },
    setTimeout() {}, clearTimeout() {},
    fetch(url, options) {
      assert.equal(options.method, undefined, 'silent synchronization performs GET reads only');
      assert.equal(options.body, undefined, 'background reads cannot submit an import or posting');
      return new Promise(resolve => requests.push({ url, options, resolve }));
    }
  });
  const state = window.salesTest.state;
  state.rows = metric(100); state.hourlySales = hourly(2);
  state.fetched = true; state.viewFrom = '2026-10-01'; state.viewTo = '2026-10-31'; state.viewMonth = '2026-10';
  window.salesTest.draw();
  return {
    window, state, requests, events, coordinator, host, month,
    get renders() { return renders; }, get html() { return html; },
    set safe(value) { safe = value; }, set hidden(value) { hidden = value; }, set appHidden(value) { appHidden = value; },
    set token(value) { token = value; },
    refresh() { return handler('interval'); },
    dispatch(name, target) { (events[name] || []).forEach(callback => callback({ target })); },
    replaceBoard() { board = {}; }, replaceHost() { currentHost = Object.assign({}, host); },
    respond(request, data, fail = false) {
      request.resolve({ ok: !fail, status: fail ? 503 : 200, headers: { get: () => 'application/json' }, json: async () => clone(data), text: async () => 'temporarily unavailable' });
    },
    async read(revenue = 100, count = 2) {
      const before = requests.length, pending = handler('interval');
      await tick(); assert.equal(requests.length, before + 1);
      this.respond(requests[before], metric(revenue)); await tick();
      assert.equal(requests.length, before + 2);
      this.respond(requests[before + 1], hourly(count)); await pending;
    }
  };
}

(async () => {
  const x = setup(), initialRenders = x.renders;
  assert.equal(x.requests.length, 0, 'registering a reader does not trigger an immediate reload');
  await x.read('100', 2);
  assert.equal(x.state.rows[0].cash_revenue, 100);
  assert.equal(x.renders, initialRenders, 'unchanged metrics/hourly rows preserve the current DOM');
  const beforeChange = x.renders;
  await x.read(250, 4);
  assert.equal(x.renders, beforeChange + 1, 'changed persisted data renders once, without loading placeholders');
  assert.match(x.html, /250/); assert.doesNotMatch(x.html, /Memuat data penjualan/);
  assert.equal(x.state.viewMonth, '2026-10');
  assert.equal(x.state.loading, false);
  assert.ok(x.requests[0].url.includes('daily_metrics?brand_id=eq.' + brand));
  assert.ok(x.requests[1].url.includes('sold_at=gte.2026-10-01&sold_at=lte.2026-10-01'));
  assert.ok(x.requests[1].url.includes('select=sold_at,sold_hour,transaction_count&limit=50000'));

  const suppressions = [
    [() => { x.hidden = true; }, () => { x.hidden = false; }],
    [() => { x.appHidden = true; }, () => { x.appHidden = false; }],
    [() => { x.safe = false; }, () => { x.safe = true; }],
    [() => { x.state.fetched = false; }, () => { x.state.fetched = true; }],
    [() => { x.state.loading = true; }, () => { x.state.loading = false; }],
    [() => { x.state.importing = true; }, () => { x.state.importing = false; }],
    [() => { x.state.stagedFiles = [{}]; }, () => { x.state.stagedFiles = []; }],
    [() => { x.state.showHelp = true; }, () => { x.state.showHelp = false; }],
    [() => { x.state.importStatus = { type: 'success' }; }, () => { x.state.importStatus = null; }],
    [() => { x.window.__HASNARIA_CONTEXT.role = 'staff'; }, () => { x.window.__HASNARIA_CONTEXT.role = 'owner'; }],
    [() => { x.window.__HASNARIA_CONTEXT.brandId = 'other'; }, () => { x.window.__HASNARIA_CONTEXT.brandId = brand; }]
  ];
  for (const [start, restore] of suppressions) {
    const reads = x.requests.length, writes = x.renders;
    start(); await x.refresh(); restore();
    assert.equal(x.requests.length, reads, 'inactive views and protected forms defer their reads');
    assert.equal(x.renders, writes);
  }

  const pending = x.refresh(); await tick();
  const reads = x.requests.length, writes = x.renders;
  await x.refresh(); assert.equal(x.requests.length, reads, 'overlapping ticks share a single flight');
  x.respond(x.requests.at(-1), metric(700)); await tick();
  x.safe = false; x.respond(x.requests.at(-1), hourly(20)); await pending; x.safe = true;
  assert.equal(x.renders, writes, 'a draft begun during the reads prevents committing the result');
  assert.equal(x.state.rows[0].cash_revenue, 250, 'draft protection applies before replacing the data snapshot');

  for (const change of [
    y => { y.window.__HASNARIA_CONTEXT = Object.assign({}, y.window.__HASNARIA_CONTEXT); },
    y => { y.token = jwt('new-owner'); },
    y => { y.hidden = true; },
    y => y.replaceHost(),
    y => y.replaceBoard(),
    y => { y.state.viewMonth = '2026-09'; },
    y => { y.state.mode = 'weekly'; },
    y => { y.state.slice = { type: 'day', id: '2026-10-01' }; },
    y => { y.state.rows = clone(y.state.rows); },
    y => { y.state.stagedFiles = [{}]; },
    y => y.dispatch('change', y.month)
  ]) {
    const y = setup(), count = y.renders, previous = y.state.rows;
    const p = y.refresh(); await tick();
    y.respond(y.requests[0], metric(900)); await tick();
    assert.equal(y.requests.length, 2);
    change(y); y.respond(y.requests[1], hourly(40)); await p;
    assert.equal(y.renders, count, 'stale account/view/filter/foreground generations cannot replace the current DOM');
    assert.notEqual(y.state.rows[0].cash_revenue, 900);
    if (y.state.rows === previous) assert.equal(y.state.rows[0].cash_revenue, 100);
  }

  const failed = setup(), oldRows = failed.state.rows, oldHourly = failed.state.hourlySales, count = failed.renders;
  const partial = failed.refresh(); await tick(); failed.respond(failed.requests[0], metric(888)); await tick();
  failed.respond(failed.requests[1], null, true); await partial;
  assert.equal(failed.state.rows, oldRows); assert.equal(failed.state.hourlySales, oldHourly);
  assert.equal(failed.renders, count, 'a failed hourly read retains the entire previous successful report');
  await failed.read(150, 3);
  assert.equal(failed.state.rows[0].cash_revenue, 150, 'the next successful tick retries after a failure');

  const switched = setup(), oldSessionRead = switched.refresh(); await tick();
  switched.token = jwt('other-owner'); switched.respond(switched.requests[0], metric(999)); await oldSessionRead;
  assert.equal(switched.requests.length, 1, 'a changed session stops the remaining read before querying hourly data');
  assert.equal(switched.state.rows[0].cash_revenue, 100);

  const foreground = setup(), oldBackground = foreground.refresh(); await tick();
  foreground.respond(foreground.requests[0], metric(999)); await tick();
  foreground.window.__hasnariaReloadSales(); await tick();
  assert.equal(foreground.requests.length, 3, 'the existing public hook still starts the foreground reload');
  foreground.respond(foreground.requests[2], metric(175)); await tick();
  foreground.respond(foreground.requests[3], hourly(3)); await tick();
  assert.equal(foreground.state.loading, false);
  const foregroundHtml = foreground.html, foregroundRenders = foreground.renders;
  foreground.respond(foreground.requests[1], hourly(40)); await oldBackground;
  assert.equal(foreground.state.rows[0].cash_revenue, 175, 'an older background result cannot overwrite a completed public reload');
  assert.equal(foreground.html, foregroundHtml); assert.equal(foreground.renders, foregroundRenders);

  const empty = setup(), emptyRead = empty.refresh(); await tick();
  empty.respond(empty.requests[0], []); await emptyRead;
  assert.equal(empty.requests.length, 1, 'an empty authoritative daily set skips the hourly query');
  assert.equal(empty.state.rows.length, 0); assert.equal(empty.state.hourlySales.length, 0);
  assert.match(empty.html, /Belum ada data penjualan tersimpan/);

  const late = setup(true); late.window.__HASNARIA_DATA_SYNC = late.coordinator;
  late.dispatch('hasnaria:data-sync-ready');
  assert.equal(late.requests.length, 0, 'the readiness event registers without triggering foreground loading');
  await late.read(175, 3);
  assert.equal(late.state.rows[0].cash_revenue, 175);

  assert.equal(typeof x.window.__hasnariaReloadSales, 'function', 'the established public reload hook remains available');
  assert.ok(initialRenders > 0, 'the test exercises the production chart renderer');
  console.log('Owner Sales silent synchronization, GET contracts, real rendering, draft/session/filter guards and retries: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
