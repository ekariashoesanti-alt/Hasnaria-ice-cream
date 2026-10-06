const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clone = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(file, handlerName) {
  const elements = {}, events = {}, handlers = {}, calls = [], timers = [];
  const control = { safe: true, hidden: false, gate: null, fail: false };
  const data = {
    get_finance_reporting_pack_v1: { periods: [{ period_month: '2026-10-01', period_status: 'closed' }] },
    get_finance_period_pack_v1: { period: '2026-10-01', income_current: { revenue_sales: 10 }, income_previous: {}, readiness: {} },
    get_finance_management_period_v1: { period: '2026-10-01', previous_period: '2026-09-01', current: { revenue_sales: 10 }, previous: {} },
    get_purchase_control_period_v1: { rows: [{ total_amount: 10, expense_account_code: '6100', expense_category: 'Beban Administrasi' }], control: { finance_link_status: 'MATCH' } },
    ui_finance_alerts: [],
    ui_period_catalog_v1: [{ period_start: '2026-10-01', period_key: '2026-10' }],
    ui_purchase_overview_v1: [{ total_purchase_amount: 10, purchase_rows: 1 }],
    ui_purchase_category_chart_v1: [{ category: 'Beban Administrasi', purchase_rows: 1, amount: 10 }],
    ui_administration_overview_v1: [{ admin_amount: 10, admin_rows: 1, category_count: 1, sync_ok: true }],
    ui_administration_category_chart_v1: [{ category: 'Beban Administrasi', admin_rows: 1, amount: 10 }],
    ui_administration_detail_v1: [],
    finance_journal_view_v1: [{ entry_date: '2026-10-01', debit: 10, credit: 0, account_code: '6100' }]
  };
  function element(id) {
    let html = '';
    const el = { id, writes: 0, value: '', className: '', classList: { contains: name => name === 'hidden' && control.hidden },
      querySelector: () => null, setAttribute() {}, hasAttribute: () => false,
      remove() { delete elements[this.id]; } };
    Object.defineProperty(el, 'innerHTML', {
      get() { return html; },
      set(value) {
        html = value; el.writes++;
        for (const field of ['financeV6Period', 'ad5Period']) {
          if (!value.includes('id="' + field + '"')) continue;
          const selected = value.match(/<option value="([^"]*)" selected/);
          if (selected) elements[field].value = selected[1];
        }
      }
    });
    return el;
  }
  ['ops', 'pembelian', 'administrasi', 'paRoot', 'purchaseFinanceAlignment', 'financeV6Period', 'paPeriod', 'ad5Period',
    'hasnaria-finance-stock-v2-css', 'hasnaria-finance-emkm-css', 'finance-management-v3-css', 'administration-ui5-css'].forEach(id => elements[id] = element(id));
  elements.financeV6Period.value = '2026-10-01';
  elements.paPeriod.value = elements.ad5Period.value = '2026-10';
  const root = element('finance-root'), report = element('finance-report'), adminRoot = element('admin-root');
  let activeRoot = root, activeAdminRoot = adminRoot;
  elements.ops.querySelector = selector => selector === '[data-finance-v6="1"]' ? activeRoot : null;
  root.querySelector = selector => selector === '.fsv2-report' ? report : selector === '[data-fin-view="income"].on' ? {} : null;
  elements.administrasi.querySelector = selector => selector === '.ad5-shell' ? activeAdminRoot : null;
  elements.paRoot.querySelector = selector => selector === '.pa-controls' ? {} : null;
  const client = {
    async rpc(name, args) {
      calls.push({ name, args, kind: 'rpc' });
      assert.match(name, /^get_/, 'report synchronization must never call a mutating RPC');
      assert.ok(name === 'get_ui_period_catalog_fast_v1' || Object.hasOwn(data, name), 'expected read RPC ' + name);
      const payload = clone(name === 'get_ui_period_catalog_fast_v1' ? data.ui_period_catalog_v1 : data[name]);
      if (payload && payload.period && args.p_period) payload.period = args.p_period;
      const failed = control.fail;
      if (control.gate) await control.gate.promise;
      return failed ? { error: new Error('Read unavailable') } : { data: payload };
    },
    from(name) {
      const args = {};
      const query = {
        select() { return this; }, eq(key, value) { args[key] = value; return this; }, order() { return this; }, limit() { return this; },
        then(resolve, reject) {
          calls.push({ name, args, kind: 'select' });
          const payload = clone(data[name]), failed = control.fail, gate = control.gate;
          return (async () => {
            if (gate) await gate.promise;
            return failed ? { error: new Error('Read unavailable') } : { data: payload };
          })().then(resolve, reject);
        }
      };
      return query;
    }
  };
  const document = {
    readyState: 'complete', getElementById: id => elements[id] || null,
    addEventListener(name, callback) { (events[name] ||= []).push(callback); },
    createElement: () => element(''), body: { appendChild(el) { elements[el.id] = el; } }
  };
  const window = { __HASNARIA_CONTEXT: { role: 'owner' }, __HASNARIA_DB: client,
    __HASNARIA_DATA_SYNC: { register(name, callback) { handlers[name] = callback; }, canRefresh: () => control.safe, notify() {} },
    addEventListener(name, callback) { (events[name] ||= []).push(callback); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    window, document, console, Date, Intl, Promise, Number, String, Array, JSON,
    setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {},
    MutationObserver: class { observe() {} }, alert(message) { throw new Error(message); }
  });
  async function settle() {
    for (let i = 0; i < 4; i++) {
      const pending = timers.splice(0); pending.forEach(callback => callback());
      await flush();
    }
  }
  function click(selector, value) {
    const target = { closest: query => query === selector ? target : null,
      getAttribute: () => value, hasAttribute: name => selector.includes('[' + name + ']') };
    for (const callback of events.click || []) callback({ target });
    if (file === 'administration-v1.js') elements.administrasi.onclick({ target });
  }
  return {
    elements, events, data, calls, control, window, settle, click,
    refresh: () => handlers[handlerName]('interval'),
    async start() { if (file === 'administration-v1.js') await window.__HASNARIA_ADMIN_V1.mount(); await settle(); },
    get writes() { return Object.values(elements).concat(root, report, adminRoot).reduce((sum, el) => sum + el.writes, 0); },
    get rendered() { return [root.innerHTML, report.innerHTML, elements.purchaseFinanceAlignment.innerHTML, elements.administrasi.innerHTML].join('\n'); },
    openModal() {
      if (file.startsWith('finance-')) elements.finV6Modal = element('finV6Modal');
      else if (file.startsWith('purchase-')) click('[data-pfa-detail-open]', '1');
      else click('[data-ad5-detail]', '1');
    },
    closeModal() {
      if (file.startsWith('finance-')) delete elements.finV6Modal;
      else if (file.startsWith('purchase-')) click('[data-pfa-detail-close]', '1');
      else click('[data-ad5-close]', '1');
    },
    changePeriod(value) {
      const id = file.startsWith('finance-') ? 'financeV6Period' : file.startsWith('purchase-') ? 'paPeriod' : 'ad5Period';
      const target = elements[id]; target.value = value;
      for (const callback of events.change || []) callback({ target });
      if (file === 'administration-v1.js') elements.administrasi.onchange({ target });
    },
    replaceRoot() {
      if (file.startsWith('finance-')) activeRoot = element('new-finance-root');
      else if (file.startsWith('purchase-')) elements.paRoot = element('new-purchase-root');
      else activeAdminRoot = element('new-admin-root');
    }
  };
}

(async () => {
  const modules = [
    ['finance-accuracy-v6.js', 'owner-finance-report', 'get_finance_period_pack_v1', x => x.income_current.revenue_sales = 90],
    ['finance-purchase-basis-v1.js', 'owner-finance-management', 'get_finance_management_period_v1', x => x.current.revenue_sales = 90],
    ['purchase-finance-alignment-v1.js', 'owner-purchase-report', 'get_purchase_control_period_v1', x => x.rows[0].total_amount = 90],
    ['administration-v1.js', 'owner-administration-report', 'ui_administration_overview_v1', x => x[0].admin_amount = 90]
  ];
  for (const [file, handlerName, table, change] of modules) {
    const h = harness(file, handlerName); await h.start();
    const initial = h.writes;
    await h.refresh(); await h.settle();
    assert.equal(h.writes, initial, file + ': unchanged payload preserves DOM');
    change(h.data[table]);
    await h.refresh(); await h.settle();
    assert.match(h.rendered, /90/, file + ': changed persisted values reach the existing report');
    const updated = h.writes, requestCount = h.calls.length;
    h.control.safe = false; await h.refresh();
    h.control.safe = true; h.control.hidden = true; await h.refresh();
    h.control.hidden = false; h.window.__HASNARIA_CONTEXT.role = 'staff'; await h.refresh();
    h.window.__HASNARIA_CONTEXT.role = 'owner';
    assert.equal(h.calls.length, requestCount, file + ': drafts, hidden tabs, and non-Owner roles defer reads');
    assert.equal(h.writes, updated);

    h.control.gate = deferred();
    const pending = h.refresh(); await flush();
    const inflightCount = h.calls.length;
    await h.refresh();
    assert.equal(h.calls.length, inflightCount, file + ': overlapping ticks do not duplicate reads');
    h.control.safe = false; h.control.gate.resolve(); await pending;
    assert.equal(h.writes, updated, file + ': a draft opened while fetching prevents rendering');
    h.control.safe = true; h.control.gate = null;

    h.control.fail = true;
    await assert.rejects(h.refresh(), /Read unavailable/);
    assert.equal(h.writes, updated, file + ': failed background read retains the last valid report');
    h.control.fail = false;
    await h.refresh();

    h.openModal(); await h.settle();
    const modalCount = h.calls.length, modalWrites = h.writes;
    await h.refresh();
    assert.equal(h.calls.length, modalCount, file + ': open detail modal defers reads');
    assert.equal(h.writes, modalWrites);
    h.closeModal(); await h.settle();
    if (file.startsWith('finance-')) {
      for (const modal of ['finP4Modal', 'finP4ActionModal', 'finP5Modal', 'finP5Reopen']) {
        h.elements[modal] = { writes: 0 };
        const before = h.calls.length; await h.refresh();
        assert.equal(h.calls.length, before, file + ': accounting and archive dialogs protect their active forms');
        delete h.elements[modal];
      }
    }

    h.control.gate = deferred();
    const identityRead = h.refresh(); await flush();
    const beforeIdentity = h.writes;
    h.window.__HASNARIA_CONTEXT = { role: 'owner' };
    h.control.gate.resolve(); await identityRead;
    assert.equal(h.writes, beforeIdentity, file + ': a replaced session rejects the old response');
    h.control.gate = deferred();
    const replacedRootRead = h.refresh(); await flush();
    const beforeRoot = h.writes;
    h.replaceRoot(); h.control.gate.resolve(); await replacedRootRead;
    assert.equal(h.writes, beforeRoot, file + ': replaced report shell rejects the old response');

    const periodCalls = h.calls.filter(call => call.args && (call.args.p_period || call.args.period_month));
    assert.ok(periodCalls.length, file + ': synchronization is scoped to the selected month');
    assert.ok(periodCalls.every(call => (call.args.p_period || call.args.period_month) === '2026-10-01'));
    if (file.startsWith('purchase-') || file.startsWith('administration-')) {
      assert.ok(h.calls.some(call => call.name === 'get_ui_period_catalog_fast_v1'), file + ': foreground and sync retain the fast period catalog');
      assert.ok(!h.calls.some(call => call.name === 'ui_period_catalog_v1'), file + ': sync does not regress to the monolithic period view');
    }
    if (file.startsWith('purchase-')) {
      assert.ok(!h.calls.some(call => /^ui_purchase_(overview|category_chart)_v1$/.test(call.name)), 'purchase refresh derives the report from the canonical pack without expensive aggregate reads');
    }

    if (file.startsWith('purchase-') || file.startsWith('administration-')) {
      const missing = harness(file, handlerName); await missing.start();
      missing.data.ui_period_catalog_v1 = [{ period_start: '2026-09-01', period_key: '2026-09' }];
      change(missing.data[table]); await missing.refresh(); await missing.settle();
      assert.equal(missing.elements[file.startsWith('purchase-') ? 'paPeriod' : 'ad5Period'].value, '2026-10', file + ': catalog removal cannot change the selected month');
      assert.match(missing.rendered, /Oktober 2026/, file + ': refreshed report stays labeled with its snapshot month');
      assert.match(missing.rendered, /90/, file + ': refreshed data is applied even when the catalog no longer lists its month');
    }

    const race = harness(file, handlerName);
    race.data.ui_period_catalog_v1.push({ period_start: '2026-09-01', period_key: '2026-09' });
    race.data.get_finance_reporting_pack_v1.periods.unshift({ period_month: '2026-09-01', period_status: 'closed' });
    await race.start();
    // Purchase boot starts immediately when the fixture is constructed. Apply
    // the expanded period catalog before simulating a user selecting September.
    await race.refresh(); await race.settle();
    race.control.gate = deferred();
    const oldPeriod = race.refresh(); await flush();
    change(race.data[table]);
    race.changePeriod(file.startsWith('finance-') ? '2026-09-01' : '2026-09');
    race.control.gate.resolve(); await oldPeriod; race.control.gate = null; await race.settle();
    assert.match(race.rendered, /90/, file + ': old-period response cannot overwrite the selected-period load');
    assert.match(race.rendered, /September 2026/, file + ': selected period remains unchanged by an older read');
  }
  const journal = harness('finance-accuracy-v6.js', 'owner-finance-report'); await journal.start();
  // Use the bound handler with the same attributes as the real detail button.
  const detailTarget = { closest: () => detailTarget, hasAttribute: key => key === 'data-fin-v6-open', getAttribute: () => 'journal' };
  for (const handler of journal.events.click || []) handler({ target: detailTarget });
  await journal.settle();
  journal.closeModal();
  const journalReads = journal.calls.filter(call => call.name === 'finance_journal_view_v1').length;
  await journal.refresh();
  for (const handler of journal.events.click || []) handler({ target: detailTarget });
  await journal.settle();
  assert.equal(journal.calls.filter(call => call.name === 'finance_journal_view_v1').length, journalReads + 1, 'successful read sync invalidates cached journal details');
  console.log('Web report read-only synchronization, DOM preservation, draft/modal, and stale-response tests: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
