const assert = require('assert/strict');
const TOKEN_KEY = 'hasnaria-staff-session-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const { browserFixture } = require('./helpers/staff-browser-fixture');

function staffFixture() {
  const fixture = browserFixture();
  fixture.run('data-sync.js', 'canRefresh');
  fixture.api = fixture.run('staff-v5.js', 'state,render,syncRefresh,requestContext,sameContext,loadHist,refreshAttendance,openAbs,doClock,submitCorrection,saveUser,decide,staffLogout');
  const state = fixture.api.state;
  Object.assign(state, {
    view: 'staff', token: 'session-a', staff: { employeeId: 'employee-a', fullName: 'Staff A', modules: ['absensi', 'kasir'] },
    module: 'absensi', sub: 'history', month: new Date(2026, 9, 1), selected: '2026-10-01',
    today: { attendance_date: '2026-10-03', check_in_at: null }, hist: [], corr: [], msg: ''
  });
  fixture.handlers.set('staff_session_info', () => [{ employee_id: 'employee-a', full_name: 'Staff A', modules: ['absensi', 'kasir'] }]);
  fixture.handlers.set('staff_attendance_today', () => [clone(state.today)]);
  fixture.handlers.set('staff_attendance_history', () => clone(state.hist));
  fixture.handlers.set('staff_attendance_corrections', () => clone(state.corr));
  fixture.handlers.set('staff_login_directory', () => []);
  fixture.handlers.set('staff_owner_list', () => clone(state.ownerRows));
  fixture.handlers.set('staff_owner_attendance_approvals', () => clone(state.approvals));
  fixture.handlers.set('staff_owner_attendance_location', () => state.loc ? [clone(state.loc)] : []);
  fixture.api.render();
  return fixture;
}

async function staffCases() {
  const bootstrap = browserFixture(), directory = deferred();
  bootstrap.run('data-sync.js', 'canRefresh');
  const bootstrapApi = bootstrap.run('staff-v5.js', 'state,start,ownerOpen');
  bootstrap.handlers.set('staff_login_directory', () => directory.promise);
  bootstrap.window.supabase.createClient().auth.getSession = async () => ({ data: { session: null }, error: null });
  const starting = bootstrapApi.start();
  await tick();
  await bootstrapApi.ownerOpen();
  const email = bootstrap.document.getElementById('oemail');
  const password = bootstrap.document.getElementById('opass');
  email.value = 'owner@example.test';
  password.value = 'unsaved login input';
  const loginWrites = bootstrap.root.writes;
  directory.resolve([{ employee_id: 'employee-a', full_name: 'Staff A' }]);
  await starting;
  assert.equal(bootstrapApi.state.view, 'owner-login', 'late staff directory cannot leave the Owner login');
  assert.equal(bootstrap.root.writes, loginWrites, 'bootstrap does not replace an active Owner login form');
  assert.equal(bootstrap.document.getElementById('oemail'), email);
  assert.equal(password.value, 'unsaved login input');
  assert.equal(bootstrap.calls.some(call => call.name === 'staff_session_info'), false, 'bootstrap cannot resume Staff after opening Owner login');

  const unchanged = staffFixture();
  const content = unchanged.root.querySelector('.staff-content');
  const header = unchanged.root.querySelector('.staff-top');
  const navigation = unchanged.root.querySelector('.staff-nav');
  const originalWrites = [unchanged.root.writes, content.writes, header.writes, navigation.writes];
  await unchanged.api.syncRefresh();
  assert.deepEqual([unchanged.root.writes, content.writes, header.writes, navigation.writes], originalWrites,
    'identical attendance and session reads do not replace DOM');
  unchanged.handlers.set('staff_attendance_history', () => [{ attendance_date: '2026-10-01', check_in_at: '2026-10-01T00:00:00Z' }]);
  await unchanged.api.syncRefresh();
  assert.equal(unchanged.api.state.hist.length, 1, 'web attendance updates reach staff state');
  assert.match(content.innerHTML, /class="mark check">✓/);
  assert.equal(unchanged.root.writes, originalWrites[0], 'background updates preserve the root');
  assert.equal(unchanged.root.querySelector('.staff-top'), header, 'header keeps its DOM instance');
  assert.equal(unchanged.root.querySelector('.staff-nav'), navigation, 'bottom navigation keeps its DOM instance');
  assert.equal(header.writes, originalWrites[2]);
  assert.equal(navigation.writes, originalWrites[3]);

  const network = staffFixture();
  network.handlers.set('staff_session_info', () => ({ error: { message: 'Network unavailable' } }));
  const beforeFailure = network.root.innerHTML;
  await network.api.syncRefresh();
  assert.equal(network.api.state.view, 'staff');
  assert.equal(network.api.state.token, 'session-a');
  assert.equal(network.storage.get(TOKEN_KEY), 'session-a', 'network failures preserve resumable session');
  assert.equal(network.root.innerHTML, beforeFailure);
  network.handlers.set('staff_session_info', () => []);
  await network.api.syncRefresh();
  assert.equal(network.api.state.view, 'login', 'empty authoritative session response returns to login');
  assert.equal(network.api.state.token, '');
  assert.equal(network.api.state.staff, null);
  assert.equal(network.storage.has(TOKEN_KEY), false);

  const tokenRace = staffFixture(), oldSession = deferred();
  tokenRace.api.state.module = 'home'; tokenRace.api.render();
  tokenRace.handlers.set('staff_session_info', () => oldSession.promise);
  const readingOldSession = tokenRace.api.syncRefresh();
  await tick(); tokenRace.storage.set(TOKEN_KEY, 'session-b');
  oldSession.resolve([{ employee_id: 'employee-a', full_name: 'Late old identity', modules: ['absensi'] }]);
  await readingOldSession;
  assert.equal(tokenRace.api.state.staff.fullName, 'Staff A', 'storage token changes discard in-flight identity reads');
  assert.doesNotMatch(tokenRace.root.innerHTML, /Late old identity/);
  tokenRace.handlers.set('staff_session_info', args => {
    assert.equal(args.p_token, 'session-b', 'replacement resume only validates the stored session');
    return [{ employee_id: 'employee-b', full_name: 'Staff B', modules: ['gudang'] }];
  });
  tokenRace.api.state.today = { attendance_date: '2026-10-03', check_in_at: 'old-private-record' };
  tokenRace.api.state.hist = [{ attendance_date: '2026-10-01', employee_id: 'employee-a' }];
  await tokenRace.api.syncRefresh();
  assert.equal(tokenRace.api.state.token, 'session-b');
  assert.equal(tokenRace.api.state.staff.employeeId, 'employee-b');
  assert.equal(tokenRace.api.state.today, null);
  assert.deepEqual(clone(tokenRace.api.state.hist), [], 'the new staff never inherits old attendance');
  assert.match(tokenRace.root.innerHTML, /Staff B/);
  tokenRace.storage.delete(TOKEN_KEY);
  const beforeStorageLogout = tokenRace.calls.filter(call => call.name === 'staff_session_info').length;
  await tokenRace.api.syncRefresh();
  assert.equal(tokenRace.api.state.view, 'login');
  assert.equal(tokenRace.api.state.staff, null);
  assert.equal(tokenRace.calls.filter(call => call.name === 'staff_session_info').length, beforeStorageLogout,
    'storage logout clears the old view without validating the departed session');

  const explicitLogout = staffFixture();
  explicitLogout.handlers.set('staff_logout', () => []);
  await explicitLogout.api.staffLogout();
  assert.equal(explicitLogout.api.state.view, 'login');
  assert.equal(explicitLogout.api.state.staff, null);
  assert.equal(explicitLogout.storage.has(TOKEN_KEY), false, 'explicit logout remains valid after storage context guards');

  const storageEvent = staffFixture(), lateResume = deferred();
  storageEvent.handlers.set('staff_session_info', () => lateResume.promise);
  storageEvent.storage.set(TOKEN_KEY, 'session-b');
  storageEvent.window.emit('storage', { key: TOKEN_KEY });
  assert.equal(storageEvent.api.state.view, 'login', 'cross-tab replacement removes old staff data before validating its replacement');
  assert.equal(storageEvent.api.state.staff, null);
  lateResume.resolve([{ employee_id: 'employee-b', full_name: 'Staff B', modules: ['gudang'] }]);
  await tick();
  assert.equal(storageEvent.api.state.token, 'session-b');
  assert.equal(storageEvent.api.state.staff.employeeId, 'employee-b');

  const oldMutation = staffFixture();
  oldMutation.api.state.geo = { inRange: true, lat: -7, lng: 110, accuracy: 1 };
  oldMutation.storage.delete(TOKEN_KEY);
  await oldMutation.api.doClock('in');
  const oldCorrection = staffFixture();
  oldCorrection.api.state.sub = 'corr'; oldCorrection.api.render(); oldCorrection.storage.delete(TOKEN_KEY);
  await oldCorrection.api.submitCorrection();
  assert.ok([...oldMutation.calls, ...oldCorrection.calls].every(call => !['staff_attendance_check_in', 'staff_attendance_correction_submit'].includes(call.name)),
    'a stale staff screen cannot dispatch attendance writes with the previous storage token');

  const navigationRace = staffFixture();
  const pendingHistory = deferred();
  navigationRace.handlers.set('staff_attendance_history', () => pendingHistory.promise);
  const attendanceRead = navigationRace.api.syncRefresh();
  await tick();
  navigationRace.api.state.module = 'home';
  navigationRace.api.state.sub = '';
  navigationRace.api.render();
  const home = navigationRace.root.innerHTML;
  pendingHistory.resolve([{ attendance_date: '2026-10-01', check_in_at: '2026-10-01T00:00:00Z' }]);
  await attendanceRead;
  assert.deepEqual(clone(navigationRace.api.state.hist), [], 'attendance finishing after navigation is discarded');
  assert.equal(navigationRace.root.innerHTML, home, 'delayed attendance cannot restore the old screen');

  const months = staffFixture();
  const october = deferred();
  months.handlers.set('staff_attendance_history', args => args.p_from === '2026-10-01' ? october.promise : [{ attendance_date: '2026-11-01' }]);
  const oldMonth = months.api.loadHist();
  months.api.state.month = new Date(2026, 10, 1);
  months.api.state.selected = '2026-11-01';
  await months.api.loadHist();
  october.resolve([{ attendance_date: '2026-10-01' }]);
  await oldMonth;
  assert.deepEqual(clone(months.api.state.hist), [{ attendance_date: '2026-11-01' }], 'older month cannot overwrite the selected month');

  const correction = staffFixture();
  correction.api.state.sub = 'corr';
  correction.api.render();
  const reason = correction.document.getElementById('creason');
  reason.value = 'Alasan yang belum dikirim';
  correction.document.emit('input', reason);
  correction.handlers.set('staff_attendance_corrections', () => [{ correction_id: 'web-correction', status: 'approved' }]);
  await correction.api.syncRefresh();
  assert.equal(correction.document.getElementById('creason'), reason);
  assert.equal(reason.value, 'Alasan yang belum dikirim', 'dirty correction form survives external updates');

  const owner = staffFixture();
  Object.assign(owner.api.state, { view: 'owner', owner: { id: 'owner-a' }, ownerTab: 'users', ownerRows: [{ employee_id: 'employee-a', full_name: 'Staff A', modules: ['absensi'], staff_active: true, pin_set: true }] });
  owner.api.render();
  const ownerContent = owner.root.querySelector('.staff-content');
  const focusedButton = ownerContent.querySelector('button');
  const input = owner.document.createElement('input');
  input.value = 'Focused draft';
  ownerContent.appendChild(input);
  owner.document.activeElement = input;
  owner.handlers.set('staff_owner_list', () => [{ employee_id: 'employee-a', full_name: 'Changed on web', modules: ['absensi'] }]);
  await owner.api.syncRefresh();
  assert.ok(ownerContent.contains(input), 'focused form prevents background content replacement');
  assert.equal(input.value, 'Focused draft');
  assert.equal(ownerContent.querySelector('button'), focusedButton);
  owner.document.activeElement = null;
  assert.match(owner.root.innerHTML, /ui7-staff-overview/, 'latest Pegawai overview markup remains present');
  owner.document.emit('click', owner.root.querySelector('[data-act="staff-detail-open"]'));
  assert.equal(owner.api.state.employeeDetailOpen, true);
  const detailModal = owner.root.querySelector('.ui7-staff-modal');
  await owner.api.syncRefresh();
  assert.equal(owner.root.querySelector('.ui7-staff-modal'), detailModal, 'silent refresh preserves an opened employee detail modal');
  owner.api.state.edit = { employee_id: 'employee-a', full_name: 'Owner draft', modules: ['absensi'], staff_active: true, pin_set: true };
  owner.api.render();
  const name = owner.document.getElementById('ename');
  name.value = 'Unsaved owner edit';
  await owner.api.syncRefresh();
  assert.equal(owner.document.getElementById('ename'), name);
  assert.equal(name.value, 'Unsaved owner edit', 'active owner editor remains intact');
  owner.document.emit('click', owner.root.querySelector('[data-act="staff-detail-close"]'));
  assert.equal(owner.api.state.employeeDetailOpen, false);
  assert.equal(owner.root.querySelector('.ui7-staff-modal'), null);

  const coalesced = staffFixture();
  const session = deferred();
  coalesced.handlers.set('staff_session_info', () => session.promise);
  const first = coalesced.api.syncRefresh();
  const second = coalesced.api.syncRefresh();
  await tick();
  assert.equal(coalesced.calls.filter(call => call.name === 'staff_session_info').length, 1, 'silent refreshes cannot overlap');
  session.resolve([{ employee_id: 'employee-a', full_name: 'Staff A', modules: ['absensi', 'kasir'] }]);
  await Promise.all([first, second]);

  const mutation = staffFixture();
  mutation.api.state.sub = 'corr';
  mutation.api.render();
  mutation.document.getElementById('cdate').value = '2026-10-01';
  mutation.document.getElementById('ctime').value = '08:00';
  mutation.document.getElementById('creason').value = 'Koreksi waktu masuk';
  const write = deferred();
  mutation.handlers.set('staff_attendance_correction_submit', () => write.promise);
  const saving = mutation.api.submitCorrection();
  await tick();
  const beforeSilent = mutation.calls.length;
  await mutation.api.syncRefresh();
  assert.equal(mutation.calls.length, beforeSilent, 'silent work waits for a business mutation');
  write.resolve([]);
  await saving;
}

function reconciliationFixture() {
  const fixture = browserFixture();
  fixture.run('data-sync.js', 'canRefresh');
  fixture.root.innerHTML = '<section class="staff-content"><div class="staff-card"><h1>Pembelian</h1></div></section>';
  fixture.card = fixture.root.querySelector('.staff-card');
  fixture.card.dataset.purchaseReconV3 = '1';
  fixture.api = fixture.run('staff-purchase-reconciliation-v3.js', 'refresh,load,rowKey,captureSelections,get current(){return current},get accounts(){return accounts}');
  fixture.queue = {
    rows: [
      { issue_type: 'payment_account', evidence_id: 'payment-a', item_name: 'Nota A', business_date: '2026-10-01', total_amount: 12000 },
      { issue_type: 'expense_account', source_history_id: 'expense-b', item_name: 'Nota B', business_date: '2026-10-02', total_amount: 16000 }
    ],
    payment_options: [{ method: 'cash', account_code: '1001', account_name: 'Kas' }, { method: 'qris', account_code: '1002', account_name: 'QRIS' }]
  };
  fixture.accountRows = [{ account_code: '5101', account_name: 'Pembelian bahan' }, { account_code: '5102', account_name: 'Operasional' }];
  fixture.handlers.set('staff_purchase_reconciliation_queue_v3', () => clone(fixture.queue));
  fixture.handlers.set('staff_purchase_account_options_v3', () => clone(fixture.accountRows));
  return fixture;
}

async function reconciliationCases() {
  const unchanged = reconciliationFixture();
  await unchanged.api.refresh(unchanged.card, '2026-10');
  const cardWrites = unchanged.card.writes;
  const oldSelect = unchanged.card.querySelector('.spr-select');
  await unchanged.api.refresh(unchanged.card, '2026-10', true);
  assert.equal(unchanged.card.writes, cardWrites, 'identical reconciliation reads preserve card markup');
  assert.equal(unchanged.card.querySelector('.spr-select'), oldSelect);
  const beforeLoad = clone(unchanged.api.current);
  unchanged.queue.rows[0].item_name = 'New payload only';
  const loaded = await unchanged.api.load('2026-10', 'session-a');
  assert.equal(loaded.current.rows[0].item_name, 'New payload only');
  assert.deepEqual(clone(unchanged.api.current), beforeLoad, 'load returns a payload without committing global queue');
  assert.equal(unchanged.card.writes, cardWrites, 'load has no rendering side effect');

  const periods = reconciliationFixture();
  const october = deferred();
  const novemberQueue = { rows: [{ issue_type: 'expense_account', source_history_id: 'november', item_name: 'November' }], payment_options: [] };
  periods.handlers.set('staff_purchase_reconciliation_queue_v3', args => args.p_period === '2026-10-01' ? october.promise : clone(novemberQueue));
  const older = periods.api.refresh(periods.card, '2026-10');
  await tick();
  await periods.api.refresh(periods.card, '2026-11');
  october.resolve(clone(periods.queue));
  await older;
  assert.equal(periods.api.current.rows[0].source_history_id, 'november', 'delayed old period cannot overwrite current queue');
  assert.equal(periods.document.getElementById('sprPeriod').value, '2026-11');
  assert.match(periods.card.innerHTML, /November/);
  assert.doesNotMatch(periods.card.innerHTML, /Nota A/);

  const tokenRace = reconciliationFixture();
  await tokenRace.api.refresh(tokenRace.card, '2026-10');
  const pending = deferred();
  tokenRace.handlers.set('staff_purchase_reconciliation_queue_v3', () => pending.promise);
  const current = clone(tokenRace.api.current), stableHtml = tokenRace.card.innerHTML;
  const oldSession = tokenRace.api.refresh(tokenRace.card, '2026-10', true);
  await tick();
  tokenRace.storage.set(TOKEN_KEY, 'session-b');
  pending.resolve({ rows: [{ issue_type: 'expense_account', source_history_id: 'old-session', item_name: 'Private old session row' }], payment_options: [] });
  await oldSession;
  assert.deepEqual(clone(tokenRace.api.current), current, 'token changes discard old-session reconciliation data');
  assert.equal(tokenRace.card.innerHTML, stableHtml);

  const cards = reconciliationFixture();
  const oldQueue = deferred();
  let firstCall = true;
  cards.handlers.set('staff_purchase_reconciliation_queue_v3', () => {
    if (firstCall) { firstCall = false; return oldQueue.promise; }
    return { rows: [{ issue_type: 'expense_account', source_history_id: 'new-card', item_name: 'Current screen' }], payment_options: [] };
  });
  const abandoned = cards.api.refresh(cards.card, '2026-10');
  await tick();
  cards.root.innerHTML = '<section class="staff-content"><div class="staff-card"><h1>Pembelian</h1></div></section>';
  const freshCard = cards.root.querySelector('.staff-card');
  freshCard.dataset.purchaseReconV3 = '1';
  await cards.api.refresh(freshCard, '2026-10');
  oldQueue.resolve(clone(cards.queue));
  await abandoned;
  assert.equal(cards.api.current.rows[0].source_history_id, 'new-card', 'replaced card prevents stale global commit');
  assert.match(freshCard.innerHTML, /Current screen/);

  const selections = reconciliationFixture();
  await selections.api.refresh(selections.card, '2026-10');
  const selects = selections.card.querySelectorAll('.spr-select');
  selects[0].value = 'qris';
  selects[1].value = '5102';
  selections.queue.rows.reverse();
  selections.queue.rows.unshift({ issue_type: 'expense_account', source_history_id: 'inserted', item_name: 'Inserted row' });
  await selections.api.refresh(selections.card, '2026-10', true);
  const reordered = selections.card.querySelectorAll('.spr-select');
  assert.deepEqual(reordered.map(select => select.value), ['', '5102', 'qris'],
    'row insertion and reordering preserve selections by issue identity');

  const inFlightChoice = reconciliationFixture();
  await inFlightChoice.api.refresh(inFlightChoice.card, '2026-10');
  const choice = inFlightChoice.card.querySelector('.spr-select');
  choice.value = 'cash';
  const delayedQueue = deferred();
  inFlightChoice.handlers.set('staff_purchase_reconciliation_queue_v3', () => delayedQueue.promise);
  const reading = inFlightChoice.api.refresh(inFlightChoice.card, '2026-10', true);
  await tick();
  choice.value = 'qris';
  inFlightChoice.document.emit('change', choice);
  const changedQueue = clone(inFlightChoice.queue);
  changedQueue.rows[0].item_name = 'External update during choice';
  delayedQueue.resolve(changedQueue);
  await reading;
  assert.equal(inFlightChoice.card.querySelector('.spr-select').value, 'qris', 'selection changed during a read uses the latest draft');

  const draft = reconciliationFixture();
  await draft.api.refresh(draft.card, '2026-10');
  const draftSelect = draft.card.querySelector('.spr-select');
  draftSelect.value = 'qris';
  draft.document.activeElement = draftSelect;
  draft.queue.rows[0].item_name = 'Changed during selection';
  const draftWrites = draft.card.writes;
  await draft.api.refresh(draft.card, '2026-10', true);
  assert.equal(draft.card.querySelector('.spr-select'), draftSelect, 'focused account choice remains attached');
  assert.equal(draftSelect.value, 'qris');
  assert.equal(draft.card.writes, draftWrites);
  draft.document.activeElement = null;
  draft.document.emit('change', draftSelect);
  await draft.api.refresh(draft.card, '2026-10', true);
  assert.equal(draft.card.querySelector('.spr-select').value, 'qris', 'account choice survives a later changed queue read');

  const busy = reconciliationFixture();
  await busy.api.refresh(busy.card, '2026-10');
  const write = deferred();
  busy.handlers.set('staff_purchase_resolve_payment_v3', () => write.promise);
  busy.card.querySelector('.spr-select').value = 'cash';
  const saveButton = busy.card.querySelector('.spr-save');
  const saving = saveButton.onclick();
  await tick();
  const beforeSync = busy.calls.length;
  await busy.api.refresh(busy.card, '2026-10', true);
  assert.equal(busy.calls.length, beforeSync, 'silent queue read waits for reconciliation save');
  write.resolve([]);
  await saving;
  assert.ok(busy.calls.length > beforeSync, 'successful reconciliation reloads its queue');
  assert.ok(busy.storage.has('hasnaria-data-change-v1'), 'successful resolution signals peer refreshes');

  const reloadFailure = reconciliationFixture();
  await reloadFailure.api.refresh(reloadFailure.card, '2026-10');
  reloadFailure.card.querySelector('.spr-select').value = 'cash';
  reloadFailure.handlers.set('staff_purchase_resolve_payment_v3', () => []);
  reloadFailure.handlers.set('staff_purchase_reconciliation_queue_v3', () => { throw new Error('Network unavailable'); });
  await reloadFailure.card.querySelector('.spr-save').onclick();
  assert.match(reloadFailure.card.querySelector('.spr-error').textContent, /Koreksi tersimpan.*Muat ulang antrean/,
    'a committed correction followed by a failed read has a visible recovery message');
  assert.ok(reloadFailure.storage.has('hasnaria-data-change-v1'), 'committed correction still notifies peers after read failure');

  const savingPeriod = reconciliationFixture();
  await savingPeriod.api.refresh(savingPeriod.card, '2026-10');
  savingPeriod.card.querySelector('.spr-select').value = 'cash';
  const oldSave = deferred();
  savingPeriod.handlers.set('staff_purchase_resolve_payment_v3', () => oldSave.promise);
  const resolving = savingPeriod.card.querySelector('.spr-save').onclick();
  await tick();
  savingPeriod.handlers.set('staff_purchase_reconciliation_queue_v3', () => ({ rows: [{ issue_type: 'expense_account', source_history_id: 'november-after-save', item_name: 'New chosen period' }], payment_options: [] }));
  await savingPeriod.api.refresh(savingPeriod.card, '2026-11');
  oldSave.resolve([]);
  await resolving;
  assert.equal(savingPeriod.document.getElementById('sprPeriod').value, '2026-11', 'old save completion preserves a newly chosen period');
  assert.equal(savingPeriod.api.current.rows[0].source_history_id, 'november-after-save');
}

async function main() {
  await staffCases();
  await reconciliationCases();
  console.log('staff runtime synchronization: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
