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
const deviceRows=[
 {cloud_id:'device',device_person_id:'1',employee_name:'Dania',scan_date:'2026-11-01',scan_time:'08:00:00',conversion_mode:'first_last'},
 {cloud_id:'device',device_person_id:'1',employee_name:'Dania',scan_date:'2026-11-01',scan_time:'16:00:00',conversion_mode:'first_last'},
 {cloud_id:'device',device_person_id:'1',employee_name:'Dania',scan_date:'2026-11-02',scan_time:'09:00:00',conversion_mode:'first_last'},
 {cloud_id:'device',device_person_id:'2',employee_name:'Tari',scan_date:'2026-11-01',scan_time:'12:00:00',conversion_mode:'first_last'},
 {cloud_id:'device',device_person_id:'2',employee_name:'Tari',scan_date:'2026-11-01',scan_time:'18:00:00',conversion_mode:'first_last'},
 {cloud_id:'device',device_person_id:'3',employee_name:'Karin',scan_date:'2026-11-01',scan_time:'11:00:00',conversion_mode:'raw_only'},
 {cloud_id:'device',device_person_id:'3',employee_name:'Karin',scan_date:'2026-11-01',scan_time:'19:00:00',conversion_mode:'raw_only'},
 {cloud_id:'device',device_person_id:'4',employee_name:'Ulya',scan_date:'2026-11-01',scan_time:'12:00:00',conversion_mode:'first_last'},
 {cloud_id:'device',device_person_id:'4',employee_name:'Ulya',scan_date:'2026-11-01',scan_time:'12:00:00',conversion_mode:'first_last'}
];
const device=m.summarizeDeviceScans(deviceRows);
assert.equal(device.rawScans,9);
assert.equal(device.people,4);
assert.equal(device.personDays,5);
assert.equal(device.pairedDays,2);
assert.equal(device.totalHours,14);
assert.equal(device.averageHours,7);
assert.equal(device.ranking[0].name,'Tari'); // 1/1 valid, 100% coverage
assert.equal(device.ranking[1].name,'Dania'); // 1/2 valid
assert.equal(device.ranking[2].validDays,0);
const workforceWithScans=m.summarizeWorkforce([],deviceRows.length,[],[],[],deviceRows);
assert.equal(workforceWithScans.validShifts,0,'raw device logs must NOT become verified shifts');
assert.equal(workforceWithScans.total,0,'raw device logs must NOT become official paid hours');
assert.equal(workforceWithScans.device.totalHours,14);
const scanPriority=m.businessPriorities({workforce:workforceWithScans,loyalty:{expected:0,coverage:0}}, {}, '2026-11');
assert.ok(scanPriority.some(p=>p.id==='workforce'&&p.evidence.includes('2/5 hari')));
const monthly=m.summarizeMonthlySales([
 {metric_date:'2026-01-01',revenue:1000,transactions:2},
 {metric_date:'2026-01-02',revenue:2000,transactions:3},
 {metric_date:'2026-02-01',revenue:4000,transactions:4},
 {metric_date:'2026-12-01',revenue:999999,transactions:999}
],'2026-03');
assert.equal(monthly.months.length,3);
assert.equal(monthly.revenue,7000);
assert.equal(monthly.transactions,9);
assert.equal(monthly.actualMonths,2);
assert.equal(monthly.lastMonth,'2026-02');
assert.equal(monthly.months[2].hasData,false,'missing months must not be fabricated as zero sales');
assert.equal((m.salesTrendSvg(monthly).match(/<rect /g)||[]).length,2,'chart contains only real data bars');
assert.equal(m.summarizeMonthlySales([],'2026-11').revenue,0);
assert.equal(m.summarizeMonthlySales([],'2026-11').actualMonths,0);
assert.ok(m.sparkline(monthly).includes('<svg'));
assert.equal(m.summarizeMonthlySales([{metric_date:'2025-01-01',revenue:200,transactions:3}],'2026-11').actualMonths,0);

const ceoCss=fs.readFileSync(path.join(ROOT,'owner-ceo-kpi-v1.css'),'utf8');
assert.ok(ceoCss.includes('grid-template-rows:auto auto auto'),'desktop one-view must use content-aware KPI and insight rows');
assert.ok(ceoCss.includes('#hx7Insights')&&ceoCss.includes('.hx7-insight-item'),'CEO priority panels must remain visible');
assert.ok(!ceoCss.includes('overflow-y:auto'),'CEO tiles must never have internal vertical scrollbars');
assert.ok(ceoCss.includes('body.hasnaria-owner-erp #dashboard .hx6-shell .hx7-body') && ceoCss.includes('overflow:visible'),'CEO card and insight copy must remain completely visible');
assert.ok(!ceoCss.includes('hx7-collapsible'),'obsolete expand button must have no CSS spacing');
assert.ok(ceoCss.includes('.hx7-insight-open')&&ceoCss.includes('-webkit-line-clamp:2'),'CEO insight preview must be compact');
assert.ok(ceoCss.includes('.hx7-insight-dialog'),'full insight dialog remains accessible');
assert.ok(ceoCss.includes('@media(min-width:1101px)'),'desktop one-view compaction is responsive');
const preview=m.insightsMarkup([{id:'finance',priority:'P1',rank:1,title:'Periksa laporan',area:'Keuangan',evidence:'Selisih laporan',action:'Rekonsiliasi HPP',guard:'Jangan ubah database',confidence:'Terbatas'}]);
assert.ok(preview.includes('data-hx7-insight-id="finance"')&&preview.includes('Rekonsiliasi HPP'));
assert.ok(!preview.includes('<details'),'overview must not expand and displace other CEO tiles');
const ceoRuntime=fs.readFileSync(path.join(ROOT,'owner-ceo-kpi-v1.js'),'utf8');
assert.ok(ceoRuntime.includes('TOTAL DURASI ANTAR-SCAN*')&&ceoRuntime.includes('Estimasi scan, bukan jam kerja resmi'),'CEO must label raw scans as an estimate');
assert.ok(ceoRuntime.includes("select('cloud_id,device_person_id,employee_name,scan_date,scan_time,conversion_mode')"),'CEO must fetch actual scan times, not only row count');

const dashboard=fs.readFileSync(path.join(ROOT,'owner-dashboard-one-view.js'),'utf8');
const guard=fs.readFileSync(path.join(ROOT,'owner-shell-guard.js'),'utf8');
assert.ok(dashboard.includes('id="hx8SalesTrend"')&&dashboard.includes('hx8-bottom-grid'),'YTD sales visualization must be in current CEO page');
assert.ok(ceoCss.includes('background:#fff')&&ceoCss.includes('HASNARIA'), 'existing green-white aesthetic must remain');
assert.ok(ceoCss.includes('.hx8-attendance-track')&&ceoCss.includes('.hx8-progress'), 'inventory and attendance charts should be visible');
assert.ok(dashboard.includes('id="hx7Cards"'));
assert.ok(dashboard.includes('__HASNARIA_CEO_KPI_V1.mount'));
assert.ok(guard.includes('/owner-ceo-kpi-v1.js?v=5'));
assert.ok(!dashboard.includes('data-hx7-expand')&&!dashboard.includes('Tampilkan tren & status transaksi'),'retired trend/status button must not be rendered');
assert.ok(dashboard.includes('data-hx6-detail'),'CEO detail modal remains accessible');
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
