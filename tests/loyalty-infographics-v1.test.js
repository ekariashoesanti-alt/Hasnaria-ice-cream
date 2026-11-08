'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('loyalty-v1.js','utf8');
const css=fs.readFileSync('loyalty-v1.css','utf8');
const sql=fs.readFileSync('supabase/migrations/20261109034000_hsn715_loyalty_infographics.sql','utf8');
test('infographic is primary and table is secondary at 100 percent desktop',()=>{
 for(const x of ['Tren Kunjungan Bulanan','Segmentasi Frekuensi YTD','Top 3 Pelanggan Loyal','Detail Pelanggan · YTD'])assert.ok(js.includes(x),x);
 assert.match(js,/lo1-graphs lo1-infographics/);
 assert.ok(js.indexOf('lo1-graphs lo1-infographics')<js.indexOf('lo1-customers'), 'infographic panels must precede detail directory');
 assert.match(css,/\.lo1-graphs\.lo1-infographics\{[\s\S]*?grid-template-columns:minmax\(0,1\.26fr\) minmax\(0,1fr\) minmax\(0,1\.06fr\)/);
 assert.match(css,/\.lo1-infographics>section\{height:154px;min-height:154px/);
});
test('missing-month trend never conflates no file with zero visits',()=>{
 assert.match(js,/m\.available\?/);
 assert.match(js,/belum ada laporan/);
 assert.match(js,/lo1-trend/);
 assert.match(sql,/mt\.month_date is not null as available/);
 assert.match(sql,/left join month_totals mt/);
 assert.match(sql,/pg_catalog\.generate_series/);
 assert.match(sql,/jsonb_agg\(jsonb_build_object/);
});
test('leaderboard is cumulative by customer, private, and ranking stable',()=>{
 assert.match(sql,/group by s\.customer_id/);
 assert.match(sql,/sum\(s\.period_visits\)::bigint as visits/);
 assert.match(sql,/b\.is_current/);
 assert.match(sql,/order by c\.visits desc,c\.revenue desc/);
 assert.match(sql,/limit 3/);
 assert.match(sql,/right\(max\(c\.phone\),4\)/);
 assert.match(sql,/auth\.uid\(\) and u\.role='owner' and u\.status='active'/);
 assert.match(sql,/revoke all on function public\.get_loyalty_infographics_v1/);
 assert.match(sql,/grant execute on function public\.get_loyalty_infographics_v1/);
 assert.doesNotMatch(sql,/insert into public\.sales|update public\.sales|insert into public\.customers|update public\.customers/i);
});
test('cached analytics do not change by searching or paging customer table',()=>{
 assert.match(js,/get_loyalty_infographics_v1/);
 assert.match(js,/state\.infographic\.period_month!==state\.period/);
 assert.match(js,/if\(resetMonths\|\|!state\.infographic/);
 assert.match(js,/Promise\.all\(requests\)/);
 assert.match(js,/state\.infographic=null;load\(false\)/);
});
