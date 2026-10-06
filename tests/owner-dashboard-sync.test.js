const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function pack(revenue = 10) {
  return {
    periods: [{ period_start: '2026-10-01' }, { period_start: '2026-09-01' }],
    rows: [{ period_month: '2026-10-01', sales_revenue: revenue, sales_rows: 1 },
      { period_month: '2026-09-01', sales_revenue: 80, sales_rows: 1 }]
  };
}

// Exercise the current UI6 dashboard and its optimized read contract. Keep the
// actual renderer/bindings so a refresh must protect its month selector/modal.
function setup() {
  let html = '', renders = 0, hidden = false, safe = true, handler, root = {};
  const requests = [], reads = [], events = {};
  const coverage = { value: 40, fail: false };
  const host = {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; renders++; },
    classList: { contains: name => name === 'hidden' && hidden },
    querySelector: () => html.includes('data-ceo-one-view') ? root : null
  };
  const document = {
    getElementById: id => id === 'dashboard' ? host : id === 'hx-exec-css' ? { getAttribute: () => '/owner-executive-v1.css?v=5' } : null,
    addEventListener(name, callback) { events[name] = callback; }
  };
  const window = {
    __HASNARIA_CONTEXT: { role: 'owner' },
    __HASNARIA_DB: {
      rpc(name, args) {
        assert.equal(name, 'get_ui_dashboard_pack_v1', 'dashboard refresh keeps the current optimized read RPC');
        assert.equal(args.p_months, 18);
        return new Promise(resolve => requests.push({ name, args, resolve }));
      },
      from(name) {
        assert.equal(name, 'hpp_sales_coverage_p11_v1', 'coverage refresh uses the same read model as foreground loading');
        const query = { name };
        const builder = {
          select(fields) { query.fields = fields; return builder; },
          eq(field, value) { query[field] = value; return builder; },
          limit(limit) { query.limit = limit; return builder; },
          then(resolve, reject) {
            reads.push(query);
            return Promise.resolve(coverage.fail ? { error: new Error('Coverage unavailable') } : { data: [{ sales_volume_modeled_pct: coverage.value }] }).then(resolve, reject);
          }
        };
        return builder;
      }
    },
    __HASNARIA_DATA_SYNC: { canRefresh: () => safe, register(name, callback) { assert.equal(name, 'owner-dashboard'); handler = callback; } },
    addEventListener(name, callback) { events[name] = callback; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'owner-dashboard-one-view.js'), 'utf8'), {
    window, document, Date, Intl, Number, String, Array, Promise, JSON, setTimeout() {}
  });
  return {
    window, requests, reads, events, coverage, host,
    get renders() { return renders; },
    set safe(value) { safe = value; },
    set hidden(value) { hidden = value; },
    refresh: reason => handler(reason || 'interval'),
    changePeriod(value) { host.onchange({ target: { id: 'hx6Period', value } }); },
    openDetail() {
      const target = { closest: selector => selector === '[data-hx6-detail]' ? target : null };
      host.onclick({ target });
    },
    closeDetail() { host.onkeydown({ key: 'Escape' }); },
    replaceRoot() { root = {}; },
    async start() {
      const initial = window.__HASNARIA_DASHBOARD_ONE_VIEW.mount();
      assert.equal(requests.length, 1);
      requests[0].resolve({ data: pack() });
      await initial; await tick();
    }
  };
}

(async () => {
  const x = setup(); await x.start();
  const initial = x.renders;
  let same = x.refresh(); x.requests[1].resolve({ data: pack() }); await same;
  assert.equal(x.renders, initial, 'unchanged pack and coverage preserve the existing DOM');
  const changed = x.refresh(); x.requests[2].resolve({ data: pack(90) }); await changed;
  assert.match(x.host.innerHTML, /Rp90/, 'persisted changes reach the current dashboard');
  const updated = x.renders;
  x.safe = false; await x.refresh(); x.safe = true;
  x.hidden = true; await x.refresh(); x.hidden = false;
  x.window.__HASNARIA_CONTEXT.role = 'staff'; await x.refresh(); x.window.__HASNARIA_CONTEXT.role = 'owner';
  assert.equal(x.requests.length, 3, 'drafts, hidden tabs and other roles defer background reads');
  assert.equal(x.renders, updated);

  const pending = x.refresh(); await tick();
  const inFlight = x.requests.length;
  await x.refresh();
  assert.equal(x.requests.length, inFlight, 'overlapping ticks do not duplicate reads');
  x.safe = false; x.requests[inFlight - 1].resolve({ data: pack(120) }); await pending;
  assert.equal(x.renders, updated, 'a new draft during reads prevents rendering'); x.safe = true;

  x.openDetail(); await x.refresh();
  assert.equal(x.requests.length, inFlight, 'an open detail modal protects its state'); x.closeDetail();
  const coverageUpdate = x.refresh(); x.coverage.value = 60; // The read snapshot already contains 40.
  x.requests.at(-1).resolve({ data: pack(90) }); await coverageUpdate;
  const nextCoverage = x.refresh(); x.requests.at(-1).resolve({ data: pack(90) }); await nextCoverage;
  assert.match(x.host.innerHTML, /60%/, 'coverage freshness follows the current canonical read model');

  for (const changeView of [
    () => { x.hidden = true; },
    () => { x.window.__HASNARIA_CONTEXT = { role: 'owner' }; },
    () => x.replaceRoot()
  ]) {
    const read = x.refresh(); await tick(); const writes = x.renders;
    changeView(); x.requests.at(-1).resolve({ data: pack(300) }); await read;
    assert.equal(x.renders, writes, 'a hidden/replaced view or session rejects the previous read'); x.hidden = false;
  }

  const oldPeriod = x.refresh(); await tick();
  x.changePeriod('2026-09'); const current = x.host.innerHTML;
  x.requests.at(-1).resolve({ data: pack(400) }); await oldPeriod;
  assert.equal(x.host.innerHTML, current, 'a previous-month response cannot replace the selected period');
  assert.match(current, /September 2026/);
  x.safe = false; await x.refresh('changed'); x.safe = true;
  assert.equal(x.host.innerHTML, current, 'cache invalidation leaves the selected month and DOM intact');
  const invalidated = x.refresh(); const fresh = pack(400); fresh.rows[1].sales_revenue = 125;
  x.requests.at(-1).resolve({ data: fresh }); await invalidated;
  assert.match(x.host.innerHTML, /September 2026/); assert.match(x.host.innerHTML, /Rp125/);

  const writes = x.renders;
  const failure = x.refresh(); x.requests.at(-1).resolve({ error: new Error('Read unavailable') }); await failure;
  assert.equal(x.renders, writes, 'a failed refresh retains the last valid dashboard');
  x.coverage.fail = true;
  const coverageFailure = x.refresh(); x.requests.at(-1).resolve({ data: pack(999) }); await coverageFailure;
  assert.equal(x.renders, writes, 'a failed coverage read cannot partially overwrite a successful report');
  assert.ok(x.reads.every(read => read.brand_id === x.requests[0].args.p_brand && read.limit === 1), 'the coverage read stays scoped to the same brand');
  const missing = setup(); await missing.start();
  const removedCatalog = missing.refresh(), remaining = pack(95);
  remaining.periods = remaining.periods.filter(period => period.period_start !== '2026-10-01');
  missing.requests.at(-1).resolve({ data: remaining }); await removedCatalog;
  assert.match(missing.host.innerHTML, /<option value="2026-10" selected>/, 'a removed catalog entry keeps the selected month visible in the dropdown');
  assert.match(missing.host.innerHTML, /Rp95/, 'retaining the selected catalog entry still applies its refreshed snapshot');
  console.log('Owner dashboard UI6 silent synchronization, month/modal preservation, optimized reads and stale-response tests: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
