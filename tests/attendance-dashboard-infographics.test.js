/* Regression tests for owner Attendance infographics. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const window = {};
vm.runInNewContext(fs.readFileSync('attendance-charts-v2.js','utf8'), {window});
const chart = window.__HASNARIA_ATTENDANCE_CHARTS_V2;
function log(id,name,date,time,mode='first_last'){
  return {cloud_id:'scan-device',device_person_id:id,employee_name:name,scan_date:date,scan_time:time,conversion_mode:mode};
}
test('pairs scans only when at least two distinct times and first_last', () => {
  const rows = [
    log('1','Dania','2026-11-08','15:11:00'),log('1','Dania','2026-11-08','21:16:00'),
    log('2','Karin','2026-11-08','11:28:00'),
    log('3','Tari','2026-11-08','11:12:00','raw_only'),log('3','Tari','2026-11-08','17:11:00','raw_only')
  ];
  const m=chart.analyze(rows,'2026-11');
  assert.equal(m.scans,5);
  assert.equal(m.employees,3);
  assert.equal(m.personDays,3);
  assert.equal(m.paired,1);
  assert.equal(m.singles,1);
  assert.equal(m.rawOnly,1);
  assert.equal(m.firstAvg,(15*60+11+11*60+28+11*60+12)/3);
  assert.equal(m.lastAvg,21*60+16);
  assert.match(chart.kpis(m),/33%/);
  assert.match(chart.kpis(m),/Perlu review<\/span><strong>2<\/strong>/i);
});
test('repeated same-time scans do not become a verified exit', () => {
  const m=chart.analyze([log('1','Dania','2026-11-01','08:00:00'),log('1','Dania','2026-11-01','08:00:00')],'2026-11');
  assert.equal(m.paired,0);
  assert.equal(m.singles,1);
  assert.equal(m.lastAvg,null);
  assert.match(chart.kpis(m),/—/);
});
test('charts contain four infographics but no false attendance-rate or late ranking', () => {
  const m=chart.analyze([log('1','Dania','2026-11-08','15:11:00'),log('1','Dania','2026-11-08','21:16:00')],'2026-11');
  const html=chart.charts(m);
  for (const title of ['Tren Kehadiran Tercatat','Komposisi Status Scan','Distribusi Jam Scan Pertama','Peringkat Kelengkapan Log']) {
    assert.ok(html.includes(title));
  }
  assert.equal((html.match(/class="at2-panel"/g)||[]).length,4);
  assert.ok(!html.includes('Tepat Waktu'));
  assert.ok(!html.includes('Paling Telat'));
});
test('user-provided employee names are escaped', () => {
  const rows=[log('1','<img src=x onerror=alert(1)>','2026-11-08','15:00:00')];
  const html=chart.charts(chart.analyze(rows,'2026-11'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});
test('empty month shows informative placeholders instead of NaN', () => {
  const m=chart.analyze([],'2026-11');
  assert.equal(m.personDays,0);
  assert.ok(!chart.kpis(m).includes('NaN'));
  assert.equal((chart.charts(m).match(/Belum ada data/g)||[]).length,4);
});
test('search only refreshes detail table, protecting charts from flicker', () => {
  const main=fs.readFileSync('attendance-v1.js','utf8');
  const op=fs.readFileSync('operational-v1.js','utf8');
  const css=fs.readFileSync('attendance-v1.css','utf8');
  assert.match(main,/at1TableContainer/);
  assert.match(main,/t\.innerHTML=table\(\)/);
  assert.match(op,/attendance-charts-v2\.js/);
  assert.match(css,/grid-template-columns:repeat\(6/);
});
