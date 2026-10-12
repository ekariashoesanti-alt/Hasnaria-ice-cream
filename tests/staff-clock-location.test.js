const assert = require('assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { browserFixture } = require('./helpers/staff-browser-fixture');
const TOKEN_KEY = 'hasnaria-staff-session-v1';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(yes => resolve = yes); return { promise, resolve }; }
const inside = { get timestamp() { return Date.now(); }, coords: { latitude: -7.533, longitude: 110.598, accuracy: 8 } };
const outside = { get timestamp() { return Date.now(); }, coords: { latitude: -7.55, longitude: 110.62, accuracy: 8 } };
const date = '2026-10-08';
function fixture() {
  const f = browserFixture();
  f.now = Date.now();
  f.context.Date = class extends Date { static now() { return f.now; } };
  f.position = (p, timestamp = f.now) => ({ timestamp, coords: { ...p.coords } });
  f.timers = new Map(); let timerId = 0;
  f.context.setTimeout = (callback, delay) => { const id = ++timerId; f.timers.set(id, { callback, delay }); return id; };
  f.context.clearTimeout = id => f.timers.delete(id);
  f.runTimer = delay => {
    const timer = [...f.timers.entries()].find(([, value]) => value.delay === delay);
    assert.ok(timer, 'scheduled timer with delay ' + delay);
    f.timers.delete(timer[0]); f.now += delay; timer[1].callback();
  };
  const api = f.run('staff-v5.js', 'state,render,gps,doClock,applyClockResult');
  f.api = api;
  Object.assign(api.state, {
    view: 'staff', token: 'session-a', staff: { employeeId: 'staff-a', fullName: 'Staff A', modules: ['absensi'] },
    module: 'absensi', sub: 'clock', today: { attendance_date: date, location_configured: true, office_lat: -7.533, office_lng: 110.598, check_in_at: null, check_out_at: null },
    geo: { inRange: true, lat: -7.5331, lng: 110.5981, accuracy: 20 }, msg: ''
  });
  f.gpsOptions = [];
  f.context.navigator.geolocation = { getCurrentPosition(success, failure, options) { f.gpsOptions.push(options); success(inside); } };
  f.handlers.set('staff_attendance_today', () => [api.state.today]);
  api.render();
  return f;
}
const writes = f => f.calls.filter(c => /^staff_attendance_check_(in|out)$/.test(c.name));
function watchFixture() {
  const f = fixture();
  f.clearedWatches = [];
  f.context.navigator.geolocation = {
    watchPosition(success, failure, options) { f.watchSuccess = p => success(Object.hasOwn(p, 'timestamp') ? p : f.position(p)); f.watchFailure = failure; f.gpsOptions.push(options); return 42; },
    clearWatch(id) { f.clearedWatches.push(id); }
  };
  return f;
}
function permissionFixture(state = 'prompt') {
  const f = watchFixture(), listeners = new Set();
  f.permission = { state, addEventListener(name, listener) { if (name === 'change') listeners.add(listener); }, removeEventListener(name, listener) { listeners.delete(listener); } };
  f.permissionListeners = listeners;
  f.changePermission = value => { f.permission.state = value; for (const listener of [...listeners]) listener(); };
  f.context.navigator.permissions = { query: async () => f.permission };
  return f;
}
test('deployment permits first-party GPS for store attendance while restricting other device features', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const header = config.headers.find(route => route.source === '/(.*)').headers.find(h => h.key === 'Permissions-Policy');
  assert.match(header.value, /(?:^|,\s*)geolocation=\(self\)(?:,|$)/);
  for (const feature of ['camera', 'microphone', 'payment']) assert.ok(header.value.includes(feature + '=()'));
});
test('a clock click obtains fresh store coordinates before persisting the server timestamp', async () => {
  const f = fixture();
  f.handlers.set('staff_attendance_check_in', () => [{ attendance_id: 'attendance-a', attendance_date: date, check_in_at: date + 'T00:51:00Z', attendance_status: 'present' }]);
  await f.api.doClock('in');
  assert.equal(f.gpsOptions.length, 1);
  assert.equal(f.gpsOptions[0].maximumAge, 0);
  assert.equal(f.gpsOptions[0].enableHighAccuracy, true);
  assert.equal(writes(f).length, 1);
  assert.equal(writes(f)[0].args.p_lat, inside.coords.latitude);
  assert.equal(writes(f)[0].args.p_lng, inside.coords.longitude);
  assert.equal(f.api.state.today.check_in_at, date + 'T00:51:00Z');
  assert.match(f.root.textContent, /07:51/);
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, true);
  assert.equal(f.root.querySelector('[data-clock="out"]').disabled, false);
  assert.equal(f.timers.size, 0);
});
test('cached inside location cannot permit a write after staff moves outside', async () => {
  const f = fixture();
  f.context.navigator.geolocation.getCurrentPosition = success => success(outside);
  const saving = f.api.doClock('in'); f.runTimer(12000); await saving;
  assert.equal(writes(f).length, 0);
  assert.equal(f.api.state.today.check_in_at, null);
  assert.match(f.api.state.msg, /radius 50 m/);
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, false);
});
test('Clock In and Clock Out can recheck fresh GPS after a previous outside reading', async () => {
  for (const kind of ['in', 'out']) {
    const f = fixture();
    f.api.state.geo = { inRange: false, lat: outside.coords.latitude, lng: outside.coords.longitude, accuracy: 8 };
    if (kind === 'out') f.api.state.today.check_in_at = date + 'T00:51:00Z';
    f.handlers.set('staff_attendance_check_' + kind, () => [{ attendance_date: date, [kind === 'in' ? 'check_in_at' : 'check_out_at']: date + 'T09:30:00Z' }]);
    f.api.render();
    assert.equal(f.root.querySelector('[data-clock="' + kind + '"]').disabled, false);
    await f.api.doClock(kind);
    assert.equal(writes(f).length, 1);
    assert.equal(writes(f)[0].args.p_lat, inside.coords.latitude);
    assert.equal(f.api.state.geo.inRange, true);
    assert.equal(f.timers.size, 0);
  }
});
test('initial location waits past a coarse outside sample for a fresh precise store fix', async () => {
  const f = watchFixture(), locating = f.api.gps();
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, true);
  f.watchSuccess({ coords: { ...outside.coords, accuracy: 800 } });
  assert.equal(f.api.state.geo.loading, true);
  assert.equal(f.clearedWatches.length, 0);
  f.watchSuccess(inside); await locating;
  assert.equal(f.gpsOptions[0].maximumAge, 0);
  assert.equal(f.gpsOptions[0].enableHighAccuracy, true);
  assert.equal(f.api.state.geo.inRange, true);
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, false);
  assert.deepEqual(f.clearedWatches, [42]);
  assert.equal(f.timers.size, 0);
  assert.equal(writes(f).length, 0);
});
test('a clock watch waits for an accurate fix before writing and clears its watcher', async () => {
  const f = watchFixture();
  f.handlers.set('staff_attendance_check_in', () => [{ attendance_date: date, check_in_at: date + 'T00:51:00Z' }]);
  const saving = f.api.doClock('in');
  f.watchSuccess({ coords: { ...outside.coords, accuracy: 500 } }); await tick();
  assert.equal(writes(f).length, 0);
  f.watchSuccess(inside); await saving;
  assert.equal(writes(f).length, 1);
  assert.equal(writes(f)[0].args.p_accuracy_m, 8);
  assert.deepEqual(f.clearedWatches, [42]);
  assert.equal(f.timers.size, 0);
});
test('Android precise outside first fixes cannot discard a later inside fix with worse reported accuracy', async () => {
  for (const kind of ['in', 'out']) {
    const f = watchFixture();
    f.context.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile';
    if (kind === 'out') f.api.state.today.check_in_at = date + 'T00:51:00Z';
    f.handlers.set('staff_attendance_check_' + kind, () => [{ attendance_date: date, [kind === 'in' ? 'check_in_at' : 'check_out_at']: date + 'T09:30:00Z' }]);
    const saving = f.api.doClock(kind);
    f.watchSuccess(f.position({ coords: { latitude: -7.533 + 100 / 111195, longitude: 110.598, accuracy: 5 } })); await tick();
    assert.equal(writes(f).length, 0);
    assert.equal(f.clearedWatches.length, 0);
    f.watchSuccess(f.position({ coords: { ...inside.coords, accuracy: 30 } })); await saving;
    assert.equal(writes(f).length, 1);
    assert.equal(writes(f)[0].args.p_accuracy_m, 30);
    assert.equal(writes(f)[0].args.p_lat, inside.coords.latitude);
    assert.deepEqual(f.clearedWatches, [42]);
    assert.equal(f.timers.size, 0);
  }
});
test('stale, future, and invalid-timestamp inside fixes never authorize attendance', async () => {
  for (const timestamp of [now => now - 300000, now => now + 5000, () => NaN, () => undefined]) {
    const f = watchFixture(), saving = f.api.doClock('in');
    f.watchSuccess({ ...f.position(inside), timestamp: timestamp(f.now) }); await tick();
    assert.equal(writes(f).length, 0);
    f.watchSuccess(f.position({ coords: { latitude: -7.533 + 51 / 111195, longitude: 110.598, accuracy: 8 } }));
    f.runTimer(12000); await saving;
    assert.equal(writes(f).length, 0);
    assert.equal(f.api.state.today.check_in_at, null);
    assert.match(f.api.state.msg, /radius 50 m/);
    assert.equal(f.timers.size, 0);
  }
});
test('a fresh inside fix can recover after a stale inside callback', async () => {
  const f = watchFixture(), saving = f.api.doClock('in');
  f.handlers.set('staff_attendance_check_in', () => [{ attendance_date: date, check_in_at: date + 'T00:51:00Z' }]);
  f.watchSuccess(f.position(inside, f.now - 300000)); await tick();
  assert.equal(writes(f).length, 0);
  f.watchSuccess(f.position(inside)); await saving;
  assert.equal(writes(f).length, 1);
  assert.equal(f.timers.size, 0);
});
test('fresh precise coordinates just beyond 50 meters are rejected without any accuracy allowance', async () => {
  const f = watchFixture(), saving = f.api.doClock('in');
  f.watchSuccess({ coords: { latitude: -7.533 + 51 / 111195, longitude: 110.598, accuracy: 20 } });
  f.runTimer(12000); await saving;
  assert.ok(f.api.state.geo.distance > 50 && f.api.state.geo.distance < 52);
  assert.equal(writes(f).length, 0);
  assert.equal(f.api.state.today.check_in_at, null);
  assert.match(f.api.state.msg, /radius 50 m/);
  assert.deepEqual(f.clearedWatches, [42]);
  assert.equal(f.timers.size, 0);
});
test('coarse-only GPS stops at the deadline and reports the best accuracy without saving', async () => {
  const f = watchFixture(), saving = f.api.doClock('in');
  f.watchSuccess({ coords: { ...inside.coords, accuracy: 500 } });
  f.watchSuccess({ coords: { ...inside.coords, accuracy: 120 } });
  f.watchSuccess({ coords: { ...inside.coords, accuracy: 700 } });
  f.runTimer(12000); await saving;
  assert.equal(writes(f).length, 0);
  assert.equal(f.api.state.today.check_in_at, null);
  assert.match(f.api.state.msg, /belum cukup akurat.*120 m/);
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, false);
  assert.deepEqual(f.clearedWatches, [42]);
  assert.equal(f.timers.size, 0);
});
test('getCurrentPosition fallback retries a coarse fix with fresh options and clears retry timers', async () => {
  const f = fixture(); let sample = 0;
  f.context.navigator.geolocation.getCurrentPosition = (success, failure, options) => {
    f.gpsOptions.push(options); success(++sample === 1 ? f.position({ coords: { ...outside.coords, accuracy: 600 } }) : inside);
  };
  f.handlers.set('staff_attendance_check_in', () => [{ attendance_date: date, check_in_at: date + 'T00:51:00Z' }]);
  const saving = f.api.doClock('in');
  assert.equal(writes(f).length, 0);
  f.runTimer(250); await saving;
  assert.equal(writes(f).length, 1);
  assert.equal(f.gpsOptions.length, 2);
  assert.ok(f.gpsOptions.every(options => options.maximumAge === 0 && options.enableHighAccuracy));
  assert.equal(f.timers.size, 0);
});
test('denied or unavailable GPS never creates an attendance record', async () => {
  for (const absent of [false, true]) {
    const f = fixture();
    if (absent) delete f.context.navigator.geolocation;
    else f.context.navigator.geolocation.getCurrentPosition = (success, failure) => failure({ message: 'Izin lokasi ditolak' });
    await f.api.doClock('in');
    assert.equal(writes(f).length, 0);
    assert.equal(f.api.state.today.check_in_at, null);
    assert.ok(f.api.state.geo.error);
    assert.equal(f.root.querySelector('[data-clock="in"]').disabled, false);
    assert.equal(f.timers.size, 0);
  }
});
test('time spent approving the Android location prompt does not consume the acquisition deadline', async () => {
  const f = permissionFixture(), saving = f.api.doClock('in');
  f.handlers.set('staff_attendance_check_in', () => [{ attendance_date: date, check_in_at: date + 'T00:51:00Z' }]);
  await tick();
  assert.equal(f.gpsOptions.length, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.permissionListeners.size, 1);
  f.now += 20000;
  f.changePermission('granted');
  assert.equal(f.timers.size, 1);
  f.watchSuccess(f.position(outside));
  assert.equal(f.timers.size, 1, 'grant and callback arm only one deadline');
  f.watchSuccess(f.position(inside)); await saving;
  assert.equal(writes(f).length, 1);
  assert.equal(f.permissionListeners.size, 0);
  assert.equal(f.timers.size, 0);
});
test('denied permission and native Android timeout give localized guidance and clean all resources', async () => {
  for (const kind of ['permission', 'native timeout', 'unavailable']) {
    const f = permissionFixture(); f.context.navigator.userAgent = 'Android Chrome';
    const saving = f.api.doClock('in'); await tick();
    if (kind === 'permission') f.changePermission('denied');
    else if (kind === 'native timeout') { f.now += 20000; f.watchFailure({ code: 3, message: 'Timeout expired' }); }
    else { f.watchFailure({ code: 2, message: 'Position unavailable' }); f.runTimer(12000); }
    await saving;
    assert.equal(writes(f).length, 0);
    assert.match(f.api.state.msg, kind === 'permission' ? /Izin lokasi ditolak.*lokasi presisi/ : /Akurasi Lokasi Google/);
    assert.equal(f.permissionListeners.size, 0);
    assert.deepEqual(f.clearedWatches, [42]);
    assert.equal(f.timers.size, 0);
  }
});
test('a hanging permission query does not block native GPS or survive cancellation', async () => {
  for (const finish of ['fix', 'navigation']) {
    const f = permissionFixture(), query = deferred();
    f.context.navigator.permissions.query = () => query.promise;
    f.handlers.set('staff_attendance_check_in', () => [{ attendance_date: date, check_in_at: date + 'T00:51:00Z' }]);
    const saving = f.api.doClock('in');
    assert.equal(f.gpsOptions.length, 1);
    assert.equal(f.timers.size, 0);
    if (finish === 'fix') { f.now += 20000; f.watchSuccess(f.position(inside)); }
    else f.document.emit('click', f.root.querySelector('[data-mod="home"]'));
    await saving;
    query.resolve(f.permission); await tick();
    assert.equal(writes(f).length, finish === 'fix' ? 1 : 0);
    assert.equal(f.permissionListeners.size, 0);
    assert.deepEqual(f.clearedWatches, [42]);
    assert.equal(f.timers.size, 0);
  }
});
test('without Permissions API a long native prompt can still return a fresh fix', async () => {
  const f = watchFixture(), saving = f.api.doClock('in');
  f.handlers.set('staff_attendance_check_in', () => [{ attendance_date: date, check_in_at: date + 'T00:51:00Z' }]);
  assert.equal(f.timers.size, 0);
  f.now += 20000;
  f.watchSuccess(f.position(inside)); await saving;
  assert.equal(writes(f).length, 1);
  assert.equal(f.timers.size, 0);
});
test('repeated clicks during GPS or saving submit only one mutation', async () => {
  const f = fixture(), gps = deferred(), saved = deferred();
  f.context.navigator.geolocation.getCurrentPosition = success => gps.promise.then(success);
  f.handlers.set('staff_attendance_check_in', () => saved.promise);
  const first = f.api.doClock('in');
  await f.api.doClock('in');
  assert.equal(writes(f).length, 0);
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, true);
  gps.resolve(inside); await tick();
  await f.api.doClock('in');
  assert.equal(writes(f).length, 1);
  saved.resolve([{ attendance_date: date, check_in_at: date + 'T01:00:00Z' }]); await first;
});
test('saved Clock Out preserves Clock In even when the subsequent report read fails', async () => {
  const f = fixture(); f.api.state.today.check_in_at = date + 'T00:51:00Z';
  const report = deferred();
  f.handlers.set('staff_attendance_check_out', () => [{ attendance_date: date, check_out_at: date + 'T09:30:00Z' }]);
  f.handlers.set('staff_attendance_today', () => report.promise);
  const saving = f.api.doClock('out'); await tick();
  assert.equal(f.api.state.today.check_out_at, date + 'T09:30:00Z');
  assert.match(f.root.textContent, /16:30/);
  report.resolve({ error: { message: 'Read unavailable' } }); await saving;
  assert.equal(f.api.state.today.check_in_at, date + 'T00:51:00Z');
  assert.equal(f.api.state.today.check_out_at, date + 'T09:30:00Z');
  assert.match(f.api.state.msg, /sudah tersimpan/);
  assert.equal(f.root.querySelector('[data-clock="out"]').disabled, true);
});
test('failed server write does not fabricate timestamps and enables a safe retry', async () => {
  const f = fixture();
  f.handlers.set('staff_attendance_check_in', () => ({ error: { message: 'Di luar radius toko' } }));
  await f.api.doClock('in');
  assert.equal(f.api.state.today.check_in_at, null);
  assert.equal(f.api.state.today.check_out_at, null);
  assert.equal(f.calls.some(c => c.name === 'staff_attendance_today'), false);
  assert.match(f.api.state.msg, /Di luar radius/);
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, false);
});
test('session replacement or navigation while obtaining GPS cancels the write', async () => {
  for (const change of ['session', 'screen']) {
    const f = fixture(), gps = deferred();
    f.context.navigator.geolocation.getCurrentPosition = success => gps.promise.then(success);
    const saving = f.api.doClock('in');
    if (change === 'session') f.storage.set(TOKEN_KEY, 'session-b');
    else f.api.state.module = 'home';
    gps.resolve(inside); await saving;
    assert.equal(writes(f).length, 0);
    assert.equal(f.api.state.today.check_in_at, null);
  }
});
test('navigation and session changes immediately clear a pending clock watcher', async () => {
  for (const change of ['navigation', 'session']) {
    const f = watchFixture(), saving = f.api.doClock('in');
    if (change === 'navigation') f.document.emit('click', f.root.querySelector('[data-mod="home"]'));
    else {
      f.storage.set(TOKEN_KEY, 'session-b');
      f.window.emit('storage', { key: TOKEN_KEY });
    }
    await saving;
    assert.deepEqual(f.clearedWatches, [42]);
    assert.equal(f.timers.size, 0);
    f.watchSuccess(inside); await tick();
    assert.equal(writes(f).length, 0);
  }
});
test('hiding the page cancels location collection and allows a fresh retry without leaking timers', async () => {
  const f = watchFixture(), saving = f.api.doClock('in');
  f.document.visibilityState = 'hidden'; f.document.emit('visibilitychange', f.document);
  await saving;
  assert.deepEqual(f.clearedWatches, [42]);
  assert.equal(f.timers.size, 0);
  assert.equal(writes(f).length, 0);
  assert.equal(f.api.state.today.check_in_at, null);
  f.document.visibilityState = 'visible';
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, false);
});
test('canceling initial GPS when hidden does not leave clock buttons stuck loading', async () => {
  const f = watchFixture(), locating = f.api.gps();
  f.document.visibilityState = 'hidden'; f.document.emit('visibilitychange', f.document);
  await locating;
  assert.deepEqual(f.clearedWatches, [42]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.api.state.geo.loading, undefined);
  f.document.visibilityState = 'visible';
  assert.equal(f.root.querySelector('[data-clock="in"]').disabled, false);
  assert.equal(writes(f).length, 0);
});
test('immediate Android resume coalesces preview refresh and never restarts a canceled attendance write', async () => {
  const f = watchFixture(), saving = f.api.doClock('in');
  f.document.visibilityState = 'hidden'; f.document.emit('visibilitychange', f.document);
  f.document.visibilityState = 'visible'; f.document.emit('visibilitychange', f.document); f.window.emit('pageshow', {});
  assert.equal(f.timers.size, 1);
  await saving;
  assert.match(f.api.state.msg, /dibatalkan/);
  f.runTimer(0);
  assert.equal(f.gpsOptions.length, 2);
  f.watchSuccess(f.position(inside)); await tick();
  assert.equal(f.api.state.geo.inRange, true);
  assert.equal(f.api.state.msg, '');
  assert.equal(writes(f).length, 0);
  assert.deepEqual(f.clearedWatches, [42, 42]);
  assert.equal(f.timers.size, 0);
});
test('resume cannot create duplicate GPS requests or cross a navigation context', async () => {
  for (const change of ['pending GPS', 'navigation']) {
    const f = watchFixture();
    const locating = change === 'pending GPS' ? f.api.gps() : null;
    f.window.emit('pageshow', {}); f.document.emit('visibilitychange', f.document);
    if (change === 'navigation') f.document.emit('click', f.root.querySelector('[data-mod="home"]'));
    else f.runTimer(0);
    assert.equal(f.gpsOptions.length, change === 'pending GPS' ? 1 : 0);
    if (locating) { f.watchSuccess(f.position(inside)); await locating; }
    assert.equal(writes(f).length, 0);
    assert.equal(f.timers.size, 0);
  }
});
test('replacing an initial location request cancels its watcher without overwriting the new GPS state', async () => {
  const f = watchFixture(), first = f.api.gps();
  const staleSuccess = f.watchSuccess, second = f.api.gps();
  await first;
  assert.equal(f.api.state.geo.loading, true);
  assert.deepEqual(f.clearedWatches, [42]);
  staleSuccess(outside); await tick();
  assert.equal(f.api.state.geo.loading, true);
  f.watchSuccess(inside); await second;
  assert.equal(f.api.state.geo.inRange, true);
  assert.deepEqual(f.clearedWatches, [42, 42]);
  assert.equal(f.timers.size, 0);
});
test('an immediate watch callback still clears the watch ID after registration', async () => {
  const f = watchFixture();
  f.context.navigator.geolocation.watchPosition = (success, failure, options) => { f.gpsOptions.push(options); success(inside); return 42; };
  await f.api.gps();
  assert.deepEqual(f.clearedWatches, [42]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.api.state.geo.inRange, true);
});
test('a late save result cannot populate a different staff session', async () => {
  const f = fixture(), saved = deferred();
  f.handlers.set('staff_attendance_check_in', () => saved.promise);
  const saving = f.api.doClock('in'); await tick();
  f.storage.set(TOKEN_KEY, 'session-b'); f.api.state.token = 'session-b';
  f.api.state.today = { attendance_date: date, check_in_at: null, check_out_at: null };
  saved.resolve([{ attendance_date: date, check_in_at: date + 'T01:00:00Z' }]); await saving;
  assert.equal(f.api.state.today.check_in_at, null);
  assert.equal(f.calls.some(c => c.name === 'staff_attendance_today'), false);
});
test('a new-day server record clears previous-day timestamps and empty responses never invent time', () => {
  const f = fixture(); f.api.state.today.check_out_at = date + 'T09:30:00Z';
  f.api.applyClockResult('in', { attendance_date: '2026-10-09', check_in_at: '2026-10-09T01:00:00Z' });
  assert.equal(f.api.state.today.check_out_at, null);
  assert.equal(f.api.state.today.attendance_date, '2026-10-09');
  f.api.applyClockResult('out', null);
  f.api.applyClockResult('out', { attendance_date: '2026-10-09', check_out_at: 'invalid' });
  assert.equal(f.api.state.today.check_out_at, null);
});
