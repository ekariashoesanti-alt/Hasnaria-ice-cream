/* HSN-814 no-mock KPI arithmetic regression; no database mutation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const win={};
vm.runInNewContext(fs.readFileSync(path.join(ROOT,'owner-ceo-kpi-v1.js'),'utf8'),{
 window:win,Date,Number,String,Intl,Math,Set,Object,Array,Promise
},{filename:'owner-ceo-kpi-v1.js'});
const m=win.__HASNARIA_CEO_KPI_MATH;
assert.ok(m,'KPI math must be available');
const finances=m.summarizeFinance([
 {period_month:'2026-01-01',revenue_sales:1000,other_income:0,cogs_display:200,operating_expense_adjusted:300,finance_expense:0,tax_expense:0,profit_after_tax_display:500,is_final_hpp:false},
 {period_month:'2026-02-01',revenue_sales:500,other_income:0,cogs_display:100,operating_expense_adjusted:100,finance_expense:0,tax_expense:0,profit_after_tax_display:300,is_final_hpp:false},
 {period_month:'2025-12-01',revenue_sales:999999,profit_after_tax_display:999999,is_final_hpp:false},
 {period_month:'2026-03-01',revenue_sales:3000,profit_after_tax_display:3000,is_final_hpp:false}
],'2026-02');
assert.equal(finances.revenue,1500);
assert.equal(finances.cost,700);
assert.equal(finances.profit,800);
assert.equal(finances.reconciled,true);
assert.equal(finances.months,2);
assert.equal(finances.provisional,2);
assert.equal(m.summarizeFinance([],'2026-11').months,0);
const inventory=m.summarizeStock([
 {id:'a',item_name:'Critical',unit:'pcs',min_qty:10},
 {id:'b',item_name:'Safe',unit:'pcs',min_qty:10},
 {id:'c',item_name:'Unverified',unit:'pcs',min_qty:10},
 {id:'d',item_name:'No threshold',unit:'gram',min_qty:null}
],[
 {inventory_item_id:'a',independently_calculated_qty:2,has_physical_baseline:true,same_day_ambiguous_rows:0,estimated_bom_usage_rows:0,arithmetic_difference:0},
 {inventory_item_id:'b',independently_calculated_qty:45,has_physical_baseline:true,same_day_ambiguous_rows:0,estimated_bom_usage_rows:0,arithmetic_difference:0},
 {inventory_item_id:'c',independently_calculated_qty:999,has_physical_baseline:false,same_day_ambiguous_rows:0,estimated_bom_usage_rows:0,arithmetic_difference:0},
 {inventory_item_id:'d',independently_calculated_qty:999,has_physical_baseline:true,same_day_ambiguous_rows:0,estimated_bom_usage_rows:0,arithmetic_difference:0}
]);
assert.equal(inventory.eligible,2);
assert.equal(inventory.critical.name,'Critical');
assert.equal(inventory.safest.name,'Safe');
assert.equal(inventory.total,4);
const loyalty=m.summarizeLoyalty({customers:[{name:'A'},{name:'B'},{name:'C'},{name:'D'}]},{
 customers:[{name:'Loyal',visits:14}],coverage:{imported_months:2,expected_months:11,missing_months:['2026-01']}
});
assert.equal(loyalty.top3.length,3);
assert.equal(loyalty.mostLoyal.visits,14);
assert.equal(loyalty.coverage,2);
const attendance=m.summarizeWorkforce([
 {employee_id:'p',check_in_at:'2026-11-02T08:00:00+07:00',check_out_at:null},
 {employee_id:'p',check_in_at:'2026-11-03T08:00:00+07:00',check_out_at:'2026-11-03T16:00:00+07:00'},
 {employee_id:'p',check_in_at:'2026-11-04T08:00:00+07:00',check_out_at:'2026-11-04T04:00:00+07:00'}
],42,[],[],[]);
assert.equal(attendance.total,8);
assert.equal(attendance.validShifts,1);
assert.equal(attendance.rawScans,42);
assert.equal(attendance.ranking.length,0);
assert.equal(m.summarizeWorkforce([],74,[],[],[]).average,null);
const dashboard=fs.readFileSync(path.join(ROOT,'owner-dashboard-one-view.js'),'utf8');
const guard=fs.readFileSync(path.join(ROOT,'owner-shell-guard.js'),'utf8');
assert.ok(dashboard.includes('id="hx7Cards"'));
assert.ok(dashboard.includes('__HASNARIA_CEO_KPI_V1.mount'));
assert.ok(guard.includes('/owner-ceo-kpi-v1.js?v=1'));
const priorities=m.businessPriorities({
 stock:{eligible:19,total:198,critical:{name:'FISHROLL',qty:2,min:14,ratio:2/14,unit:'pcs'}},
 finance:{revenue:179397000,cost:59279465,profit:120117535,months:10,expected:11,provisional:10,reconciled:true,margin:67},
 workforce:{rawScans:39,validShifts:0,ranking:[],average:null,total:0},
 loyalty:{coverage:2,expected:11,top3:[],mostLoyal:null}
}, {},'2026-11');
assert.equal(priorities.length,4,'four KPI sources must yield four actions');
assert.equal(priorities[0].priority,'P1');
assert.deepEqual([...priorities.map(x=>x.id)].sort(),['finance','inventory','loyalty','workforce']);
assert.ok(priorities.some(p=>p.id==='inventory'&&p.evidence.includes('FISHROLL')));
assert.ok(priorities.some(p=>p.id==='finance'&&p.evidence.includes('10/11')));

assert.ok(priorities.some(p=>p.id==='workforce'&&p.evidence.includes('39 scan')));
assert.ok(priorities.some(p=>p.id==='loyalty'&&p.evidence.includes('2/11')));
assert.ok(priorities.every(p=>/P[1-3]/.test(p.priority)&&p.action&&p.guard&&p.confidence));
const complete=m.businessPriorities({
 stock:{eligible:198,total:198,critical:{name:'Safe',qty:80,min:10,ratio:8,unit:'pcs'}},
 finance:{months:12,expected:12,provisional:0,reconciled:true,margin:15,profit:2000},
 workforce:{rawScans:20,validShifts:15,average:8,ranking:[{name:'A',score:95}]},
 loyalty:{coverage:12,expected:12,mostLoyal:{visits:20}}
}, {},'2026-12');
assert.ok(complete.every(p=>p.priority!=='P1'),'fully verified healthy data should not generate false urgent alerts');
assert.ok(dashboard.includes('id="hx7Insights"'),'insight host must be available');

console.log('HSN-814 CEO KPI arithmetic + safety gate: PASS');
