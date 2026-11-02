'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const source=fs.readFileSync('sales-board.part0.js','utf8');
const hourly=fs.readFileSync('sales-hourly-chart.js','utf8');
const begin=source.indexOf('  async function loadMetrics() {');
const finish=source.indexOf('  function rangeRows(w) {',begin);
assert.ok(begin>=0&&finish>begin,'canonical loader remains identifiable');
const loader=source.slice(begin,finish);
function harness(){
  const STATE={rows:[],hourlySales:[],loading:false,fetched:false,error:'',viewFrom:''};
  let resolveToken, requests=[],draws=0,fail=false;
  const pending=new Promise(resolve=>{resolveToken=resolve;});
  const context={
    STATE, BRAND:'brand-test',encodeURIComponent,
    getTok(){return pending;},
    api(path){requests.push(path);return fail?Promise.reject(new Error('network offline')):Promise.resolve([
      {metric_date:'2026-11-01',cash_revenue:'10000',transactions:'2',notes:'',brand_id:'brand-test'}
    ]);},
    draw(){draws++;},ensureView(){STATE.viewFrom='2026-11-01';}
  };
  const execute=vm.runInNewContext(loader+';loadMetrics',context);
  return {STATE,execute,resolveToken,requests,get draws(){return draws},setFail(v){fail=v}};
}
test('cold Sales requests are single flight even when token resolution is pending',async()=>{
  const e=harness();const a=e.execute(),b=e.execute(),c=e.execute();
  assert.equal(e.STATE.loading,true);
  e.resolveToken('access-token');await Promise.all([a,b,c]);
  assert.equal(e.requests.length,1);
  assert.match(e.requests[0],/daily_metrics\?/);
  assert.equal(e.STATE.rows[0].cash_revenue,10000);
  assert.equal(e.STATE.rows[0].transactions,2);
  assert.equal(e.STATE.fetched,true);
  assert.equal(e.STATE.loading,false);
  assert.ok(e.draws>0);
});
test('valid first Sales response does not depend on a 50k-row hourly fetch',async()=>{
  const e=harness(),p=e.execute();e.resolveToken('access-token');await p;
  assert.equal(e.requests.length,1);
  assert.doesNotMatch(e.requests[0],/\/sales\?|limit=50000/);
  assert.doesNotMatch(loader,/sold_at=gte\.|limit=50000/);
  assert.match(hourly,/get_sales_hourly_month_v1/);
  assert.equal((source.match(/renderHourlyAverageChart\(/g)||[]).length,1,'legacy all-history helper is not called');
});
test('loading lock releases after network error so explicit retry can recover',async()=>{
  const e=harness();e.setFail(true);const first=e.execute();e.resolveToken('access-token');await first;
  assert.equal(e.STATE.fetched,false);assert.equal(e.STATE.loading,false);
  assert.match(e.STATE.error,/network offline/);
  e.setFail(false);await e.execute();
  assert.equal(e.STATE.fetched,true);assert.equal(e.requests.length,2);
});
test('a missing access token does not leave the first-load lock stuck',async()=>{
  const e=harness(),p=e.execute();e.resolveToken(null);await p;
  assert.equal(e.STATE.loading,false);
  assert.equal(e.requests.length,0);
});
