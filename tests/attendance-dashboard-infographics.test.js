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
test('history is lazy, searchable in a modal without chart flicker', () => {
  const main=fs.readFileSync('attendance-v1.js','utf8');
  const op=fs.readFileSync('operational-v1.js','utf8');
  const css=fs.readFileSync('attendance-v1.css','utf8');
  assert.match(main,/at1HistoryResults/);
  assert.match(main,/target\.innerHTML=historyTable\(\)/);
  assert.match(main,/data-at="history"/);
  assert.match(main,/role="dialog"/);
  assert.ok(!main.includes('Riwayat Scan Attendance</strong>'));
  assert.match(op,/attendance-v1\.js\?v=3/);
  assert.match(css,/at1-history-backdrop/);
  assert.match(css,/grid-template-columns:repeat\(6/);
});
test('history modal opens from header, filters by name/status and closes safely', async () => {
  const scans=[
    log('1','Dania','2026-11-08','15:11:00'),log('1','Dania','2026-11-08','21:16:00'),
    log('2','Karin','2026-11-08','11:28:00'),
    log('3','Tari','2026-11-08','11:12:00','raw_only'),log('3','Tari','2026-11-08','17:11:00','raw_only')
  ].concat(Array.from({length:12},(_,i)=>log(String(10+i),'Anggota '+i,'2026-11-01','08:00:00')));
  const results={innerHTML:''},focus={focus(){}};
  const root={innerHTML:'',querySelector(selector){
    if(selector==='#at1HistoryResults')return results;
    if(selector==='#at1HistorySearch'||selector==='[data-at="history"]')return focus;
    return null;
  }};
  const document={
    getElementById(id){return id==='opAttendanceHost'?root:id==='attendance-v1-css'?{}:null},
    activeElement:null
  };
  const query={
    select(){return this},eq(){return this},gte(){return this},lt(){return this},order(){return this},
    limit(){return Promise.resolve({data:scans,error:null})}
  };
  const instance={
    __HASNARIA_CONTEXT:{role:'owner',brandId:'test-brand'},
    __HASNARIA_DB:{from(){return query}},
    __HASNARIA_ATTENDANCE_CHARTS_V2:chart
  };
  vm.runInNewContext(fs.readFileSync('attendance-v1.js','utf8'),{window:instance,document,location:{hostname:'localhost'}});
  instance.__HASNARIA_ATTENDANCE_MOUNT();
  // Let the fake Supabase promise and the module's async load()/finally finish before asserting the rendered rows.
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(root.innerHTML,/data-at="history"/);
  assert.ok(!root.innerHTML.includes('at1-history-dialog'));
  assert.ok(!root.innerHTML.includes('at1-panel'));
  const click=(action,page)=>root.onclick({target:{closest(){return{disabled:false,getAttribute(key){return key==='data-at'?action:key==='data-page'?String(page):null}}}}});
  click('history');
  assert.match(root.innerHTML,/role="dialog"/);
  assert.match(root.innerHTML,/Cari pegawai/);
  assert.match(root.innerHTML,/Dania/);
  assert.match(root.innerHTML,/1\/2 halaman/);
  root.oninput({target:{id:'at1HistorySearch',value:'DANIA'}});
  assert.match(results.innerHTML,/Dania/);
  assert.ok(!results.innerHTML.includes('Karin'));
  root.oninput({target:{id:'at1HistorySearch',value:''}});
  root.onchange({target:{id:'at1HistoryStatus',value:'review'}});
  assert.match(results.innerHTML,/Karin/);
  assert.ok(!results.innerHTML.includes('Dania'));
  root.onchange({target:{id:'at1HistoryStatus',value:'all'}});
  click('history-page',2);
  assert.match(results.innerHTML,/2\/2 halaman/);
  click('history-close');
  assert.ok(!root.innerHTML.includes('at1-history-dialog'));
  assert.match(root.innerHTML,/at1-history-trigger/);
  click('history');
  root.onkeydown({key:'Escape',preventDefault(){}});
  assert.ok(!root.innerHTML.includes('at1-history-dialog'));
});
