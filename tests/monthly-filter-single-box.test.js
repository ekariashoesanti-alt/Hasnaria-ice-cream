// Contract: one period control = one month selector per Owner business tab.
const fs=require('fs');
const assert=require('assert/strict');

const read=(p)=>fs.readFileSync(p,'utf8');
const dashboard=read('owner-dashboard-one-view.js');
const sales1=read('sales-board.part1.js');
const sales2=read('sales-board.part2.js');
const purchase=read('purchase-analytics.js');
const operational=read('operational-v1.js');
const administration=read('administration-v1.js');
const finance=read('finance-accuracy-v6.js');
const stock=read('stock-control-v3.js');

assert(dashboard.includes('<span>Bulan</span><select id="hx6Period">'),'Dashboard must expose one monthly selector');
assert(sales2.includes('<label>Bulan <select id="sbMonth">'),'Sales must expose one monthly selector');
assert(!sales2.includes('id="sbFrom"')&&!sales2.includes('id="sbTo"'),'Sales must not expose date-range period boxes');
assert(!sales1.includes('<option value="">Semua</option>'),'Sales month selector must choose an actual data month');
assert(purchase.includes('<span>Bulan</span><select id="paPeriod">'),'Purchase must expose one monthly selector');
assert(operational.includes('id="opPeriod"')&&operational.includes('function visibleRuns()'),'Operational must filter run headers by one selected month');
assert(administration.includes('<span>Bulan</span><select id="ad5Period">'),'Administration must expose one monthly selector');
assert(finance.includes('<span>Bulan</span><select id="financeV6Period">'),'Finance must expose one monthly selector');
assert(stock.includes('<span>Bulan</span><select id="sc4Period">'),'Stock must expose one monthly selector');

for(const [name,source,id] of [
  ['Dashboard',dashboard,'hx6Period'],
  ['Sales',sales2,'sbMonth'],
  ['Purchase',purchase,'paPeriod'],
  ['Operational',operational,'opPeriod'],
  ['Administration',administration,'ad5Period'],
  ['Finance',finance,'financeV6Period'],
  ['Stock',stock,'sc4Period']
]){
  const count=(source.match(new RegExp('id="'+id+'"','g'))||[]).length;
  assert.equal(count,1,name+' must render exactly one monthly period selector');
}
console.log('Hasnaria monthly single-box filter contract: PASS');
