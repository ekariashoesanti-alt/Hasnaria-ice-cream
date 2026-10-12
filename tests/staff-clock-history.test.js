const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { browserFixture } = require('./helpers/staff-browser-fixture');

function clockFixture(inTime = '—', outTime = '—') {
  const fixture = browserFixture();
  fixture.root.innerHTML = '<div class="staff-shell attendance-shell">'
    + '<section class="attendance-full-head"><h1>Kehadiran</h1></section>'
    + '<section class="staff-content staff-content-tight"><div class="attendance-illustration-card">'
    + '<div class="attendance-alert">Anda berada dalam radius Warung Hasnaria</div>'
    + '<div class="attendance-times"><div><span>Masuk</span><strong></strong></div>'
    + '<div><span>Pulang</span><strong></strong></div></div>'
    + '<div class="attendance-action-row"><button data-clock="in">Clock In</button>'
    + '<button data-clock="out">Clock Out</button></div></div></section></div>';
  const box = fixture.root.querySelector('.attendance-illustration-card');
  const times = box.querySelectorAll('.attendance-times strong');
  times[0].textContent = inTime;
  times[1].textContent = outTime;
  const api = fixture.run('staff-mobile-shell-v1.js', 'enhanceClock');
  return { ...fixture, api, box, times,
    records() { return box.querySelectorAll('.mobile-history-card'); },
    history() { return box.querySelector('.mobile-today-history'); } };
}

test('today history stays empty until a persisted clock time is present', () => {
  const fixture = clockFixture();
  const alert = fixture.box.querySelector('.attendance-alert');
  const buttons = fixture.box.querySelector('.attendance-action-row');
  fixture.api.enhanceClock();
  assert.equal(fixture.records().length, 0, 'no placeholder Clock In/Out records');
  assert.equal(fixture.history().querySelector('h2').textContent, 'Riwayat Hari Ini');
  assert.equal(fixture.box.querySelector('.attendance-alert'), alert);
  assert.equal(fixture.box.querySelector('.attendance-action-row'), buttons);
  assert.equal(fixture.calls.length, 0, 'presentation never posts attendance');

  fixture.times[0].textContent = '07:51';
  fixture.api.enhanceClock();
  const records = fixture.records();
  assert.equal(records.length, 1);
  assert.equal(records[0].getAttribute('data-clock-record'), 'in');
  assert.equal(records[0].querySelector('.mobile-history-time').textContent, '07:51');
  assert.equal(records[0].querySelector('b').textContent, 'Clock In');
  assert.ok(records[0].classList.contains('mobile-history-in'));
  assert.equal(records[0].querySelector('.mobile-history-status').textContent, 'Disetujui');
  assert.match(records[0].querySelector('.mobile-history-status').getAttribute('aria-label'), /tersimpan otomatis; tidak memerlukan persetujuan Owner/);
  assert.deepEqual(records[0].children.map(node => node.className), [
    'mobile-history-accent', 'mobile-history-time', 'mobile-history-icon', '', 'mobile-history-status'
  ], 'time, shop icon, action and status form one horizontal row');
});

test('persisted Clock Out appears below Clock In with its own palette class', () => {
  const fixture = clockFixture('07:51');
  fixture.api.enhanceClock();
  fixture.times[1].textContent = '16:30';
  fixture.api.enhanceClock();
  assert.deepEqual(fixture.records().map(row => row.getAttribute('data-clock-record')), ['in', 'out']);
  const out = fixture.records()[1];
  assert.ok(out.classList.contains('mobile-history-out'));
  assert.equal(out.querySelector('.mobile-history-time').textContent, '16:30');
  assert.equal(out.querySelector('b').textContent, 'Clock Out');
  assert.equal(out.querySelector('.mobile-history-status').textContent, 'Disetujui');
  assert.match(out.querySelector('.mobile-history-status').getAttribute('title'), /Clock Out tersimpan otomatis/);
  assert.equal(fixture.box.querySelectorAll('.mobile-today-history').length, 1);
});

test('repeat enhancement preserves nodes and updates corrected or removed source times', () => {
  const fixture = clockFixture('00:00', '16:30');
  fixture.api.enhanceClock();
  const history = fixture.history();
  const originalRows = fixture.records();
  const writes = history.writes;
  fixture.api.enhanceClock();
  fixture.api.enhanceClock();
  assert.equal(history.writes, writes, 'unchanged history is not replaced');
  assert.equal(fixture.records()[0], originalRows[0]);
  assert.equal(fixture.records()[0].querySelector('.mobile-history-time').textContent, '00:00', 'midnight is a real time');

  fixture.times[0].textContent = '08:06';
  fixture.api.enhanceClock();
  assert.equal(fixture.history(), history, 'already enhanced boxes still refresh from canonical times');
  assert.equal(fixture.records()[0].querySelector('.mobile-history-time').textContent, '08:06');
  assert.equal(history.writes, writes + 1);

  fixture.times[1].textContent = '—';
  fixture.api.enhanceClock();
  assert.deepEqual(fixture.records().map(row => row.getAttribute('data-clock-record')), ['in'], 'removed Clock Out does not remain stale');
  fixture.times[0].textContent = '';
  fixture.api.enhanceClock();
  assert.equal(fixture.records().length, 0);
  assert.equal(fixture.box.querySelectorAll('.mobile-today-history').length, 1);
});

test('invalid or missing times cannot fabricate saved history records', () => {
  const fixture = clockFixture('Invalid Date', '25:30');
  fixture.api.enhanceClock();
  assert.equal(fixture.records().length, 0);
  fixture.times[0].textContent = '08:60';
  fixture.times[1].textContent = '<button>16:30</button>';
  fixture.api.enhanceClock();
  assert.equal(fixture.records().length, 0);
  fixture.times[0].textContent = '—';
  fixture.times[1].textContent = '23:59';
  fixture.api.enhanceClock();
  assert.deepEqual(fixture.records().map(row => row.getAttribute('data-clock-record')), ['out'], 'each displayed record requires its own saved valid time');
});

test('an older enhanced box is refreshed without duplicating its history section', () => {
  const fixture = clockFixture('07:51');
  fixture.box.setAttribute('data-mobile-enhanced', '1');
  const legacy = fixture.document.createElement('div');
  legacy.className = 'mobile-today-history';
  legacy.innerHTML = '<h2>Riwayat Hari Ini</h2><div class="mobile-history-card">Clock Out —</div>';
  fixture.box.insertBefore(legacy, fixture.box.firstChild);
  fixture.api.enhanceClock();
  assert.equal(fixture.history(), legacy);
  assert.equal(fixture.box.querySelectorAll('.mobile-today-history').length, 1);
  assert.deepEqual(fixture.records().map(row => row.getAttribute('data-clock-record')), ['in']);
});

test('Clock In and Clock Out use green and red accents and badges with flexible narrow columns', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'staff-mobile-shell-v1.css'), 'utf8');
  const rule = name => css.match(new RegExp('\\.' + name + '\\{([^}]+)\\}'))[1];
  const property = (body, name) => body.match(new RegExp(name + ':([^;]+)'))[1];
  const rgb = value => value.match(/[\da-f]{2}/gi).map(hex => parseInt(hex, 16));
  const green = rule('mobile-history-in'), red = rule('mobile-history-out');
  for (const body of [green, red]) {
    assert.match(body, /--history-badge-bg:#[\da-f]{6}/i);
    assert.match(body, /--history-badge-ink:#[\da-f]{6}/i);
  }
  const [inR, inG, inB] = rgb(property(green, '--history-accent'));
  const [outR, outG, outB] = rgb(property(red, '--history-accent'));
  assert.ok(inG > inR && inG > inB, 'Clock In accent is green');
  assert.ok(outR > outG && outR > outB, 'Clock Out accent is red');
  assert.notEqual(property(green, '--history-badge-bg'), property(red, '--history-badge-bg'));
  assert.match(rule('mobile-history-accent'), /background:var\(--history-accent\)/);
  assert.match(rule('mobile-history-status'), /background:var\(--history-badge-bg\)/);
  assert.match(rule('mobile-history-card'), /grid-template-columns:[^;]*minmax\(0,1fr\)/);
  assert.match(rule('mobile-history-card'), /min-width:0/);
  assert.match(css, /@media\(max-width:380px\)[\s\S]*\.mobile-history-card\{grid-template-columns:38px 22px minmax\(0,1fr\) auto/);
});
