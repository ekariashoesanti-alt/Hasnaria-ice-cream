'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('loyalty-v1.js','utf8');
const css=fs.readFileSync('loyalty-v1.css','utf8');
const sql=fs.readFileSync('supabase/migrations/20261109025500_hsn713_loyalty_ytd_cumulative.sql','utf8');
test('YTD accumulates unique customers and monthly visits, never extrapolates missing months',()=>{
 assert.match(sql,/get_loyalty_ytd_dashboard_v1/);
 assert.match(sql,/v_year_start := make_date\(extract\(year from v_period\)::int,1,1\)/);
 assert.match(sql,/b\.is_current/);
 assert.match(sql,/group by s\.customer_id/);
 assert.match(sql,/sum\(s\.period_visits\)::bigint as visits/);
 assert.match(sql,/sum\(s\.period_revenue\)::numeric as revenue/);
 assert.match(sql,/count\(\*\) filter \(where visits>=2\)/);
 assert.match(sql,/jsonb_agg\(to_char\(m\.month_date,'YYYY-MM'\)/);
 assert.match(sql,/loaded_months/);
 assert.match(sql,/missing_months/);
 assert.match(sql,/case when p_sort='visits' then visits end desc/);
 assert.doesNotMatch(sql,/insert into public\.sales|update public\.sales|insert into public\.inventory|update public\.inventory|insert into public\.finance/i);
});
test('owner-only read RPC masks phone and supports bounded pages',()=>{
 assert.match(sql,/u\.id=auth\.uid\(\) and u\.status='active' and u\.role='owner'/);
 assert.match(sql,/security definer/);
 assert.match(sql,/set search_path = ''/);
 assert.match(sql,/revoke all on function public\.get_loyalty_ytd_dashboard_v1/);
 assert.match(sql,/grant execute on function public\.get_loyalty_ytd_dashboard_v1/);
 assert.match(sql,/right\(max\(c\.phone\),4\)/);
 assert.match(sql,/select \* from ranked[\s\S]+where item_rank>p_offset/);
 assert.match(sql,/to_jsonb\(p\)-'item_rank'/);
});
test('Loyalty switches to YTD labels, available coverage and five-row pages',()=>{
 assert.match(js,/LIMIT=5/);
 assert.match(js,/get_loyalty_ytd_dashboard_v1/);
 assert.doesNotMatch(js,/db\(\)\.rpc\('get_loyalty_dashboard_v1'/);
 for(const x of ['Pelanggan Unik YTD','Repeat Customer YTD','Kunjungan YTD','Frekuensi Kunjungan YTD','Kunjungan YTD</th>','coverageLine(cov)','YTD parsial','state.data=null;load(false)']) assert.ok(js.includes(x),x);
 assert.match(js,/Data sampai/);
 assert.match(js,/years\.forEach\(function\(y\)/);
 assert.match(js,/tidak diestimasi/i);
});
test('100 percent one-view: no full-width filter stacking, 5-row pagination and compact sections',()=>{
 assert.match(css,/#operasional \.lo1-search \.lo1-filterbar\{display:grid;grid-template-columns:170px 165px 55px/);
 assert.match(css,/#operasional \.lo1-shell #lo1Period\{width:152px/);
 assert.match(css,/#operasional \.lo1-search\{display:flex;flex-direction:row;flex-wrap:nowrap/);
 assert.match(css,/#operasional \.lo1-kpis\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/#operasional \.lo1-tablewrap\{max-height:none;overflow-x:auto;overflow-y:visible/);
 assert.match(css,/#operasional \.lo1-tablewrap td\{font-size:10px;line-height:1\.15;padding:5px 8px;height:26px/);
 assert.match(js,/class="lo1-filterbar"/);
});
