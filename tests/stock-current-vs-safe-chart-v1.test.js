'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const css=fs.readFileSync('stock-control-v3.css','utf8');
const a=js.indexOf('function stockSafetyInfographic(){'),b=js.indexOf('function attentionSkuInfographic(){',a);
assert(a>=0&&b>a,'safety chart must replace monthly activity renderer');
const chart=js.slice(a,b);
const sku=(name,unit,stock,min,tracked=true)=>({
 item_name:name,unit,system_qty:stock,min_qty:min,tracking_active:tracked
});
const render=(items,opts={})=>{
 const S={baseLoaded:true,period:'2026-10',items,chartUnit:'',chartPage:1,...opts};
 const html=vm.runInNewContext(chart+';stockSafetyInfographic()',{
  S,fmt:n=>Number(n).toLocaleString('id-ID',{maximumFractionDigits:6}),
  esc:t=>String(t),num:n=>Number(n)||0
 });
 return {html,S};
};
test('per-SKU chart shows exactly actual system stock and configured safety minimum',()=>{
 const out=render([
  sku('MIE KUNING','porsi',26,7),
  sku('ODENG','porsi',-18,20),
  sku('AIR MINERAL BESAR','pcs',-7,11),
  sku('NO BASELINE','porsi',999,8,false),
  sku('NO MINIMUM','porsi',30,0),
  sku('NO STOCK','porsi',null,8)
 ]);
 assert.match(out.html,/Stok saat ini =/);
 assert.match(out.html,/Batas aman =/);
 assert.match(out.html,/Saldo saat ini/);
 assert.match(out.html,/Saat ini: -18/);
 assert.match(out.html,/Aman: 20/);
 assert.match(out.html,/Saat ini: 26/);
 assert.match(out.html,/Aman: 7/);
 assert.doesNotMatch(out.html,/AIR MINERAL BESAR: saldo sistem/);
 assert.doesNotMatch(out.html,/NO BASELINE/);
 assert.doesNotMatch(out.html,/NO MINIMUM/);
 assert.doesNotMatch(out.html,/NO STOCK/);
 assert.doesNotMatch(out.html,/8\.131|event tercatat|aktivitas ledger|1\.035/);
 assert.match(out.html,/class="sc21-stock-row sc21-negative"/);
 assert.match(out.html,/sc21-value-alert/);
 assert.match(out.html,/data-sc21-page/);
});
test('different unit types never appear in same chart, unit selector actually switches',()=>{
 const items=[
  sku('MIE','porsi',26,7),
  sku('ICE','porsi',5,10),
  sku('GELAS','pcs',401,574),
  sku('PISAU','pcs',8,5),
  sku('MATCHA','gram',-408,16)
 ];
 const p=render(items,{chartUnit:'porsi'});
 const x=render(items,{chartUnit:'pcs'});
 assert.match(p.html,/MIE: saldo sistem 26 porsi/);
 assert.doesNotMatch(p.html,/GELAS: saldo sistem/);
 assert.match(x.html,/GELAS: saldo sistem 401 pcs/);
 assert.doesNotMatch(x.html,/MIE: saldo sistem/);
 assert.match(x.html,/aria-label="Pilih satuan grafik stok"/);
 assert.match(js,/if\(el\.id==='sc21StockUnit'\)/);
 assert.match(js,/S\.chartUnit=el\.value/);
});
test('more than six SKUs are paged without being silently dropped',()=>{
 const rows=Array.from({length:14},(_,i)=>sku('PORSI '+(i+1),'porsi',i-2,7));
 const first=render(rows,{chartUnit:'porsi'});
 const second=render(rows,{chartUnit:'porsi',chartPage:2});
 assert.match(first.html,/Menampilkan 1–6 SKU/);
 assert.match(second.html,/Menampilkan 7–12 SKU/);
 assert.equal((first.html.match(/class="sc21-stock-row/g)||[]).length,6);
 assert.equal((second.html.match(/class="sc21-stock-row/g)||[]).length,6);
 assert.match(second.html,/data-sc21-page="3"/);
 assert.match(js,/data-sc21-page/);
});
test('does not fake a valid zero or force false safe thresholds',()=>{
 const empty=render([sku('UNKNOWN','pcs',null,null),sku('NOT TRACKED','pcs',0,5,false)]);
 assert.match(empty.html,/Belum ada barang dengan saldo dan batas aman/);
 assert.match(empty.html,/tidak dianggap stok nol/);
 const minUnset=render([sku('NO SAFE','pcs',3,0)]);
 assert.match(minUnset.html,/Belum ada barang/);
 const fraction=render([sku('SAUS','porsi',40.5,5)]);
 assert.match(fraction.html,/Saat ini: 40,5/);
});
test('monthly activity chart removed from main dashboard and warning kept in Owner audit',()=>{
 assert.match(js,/Stok Saat Ini vs Batas Aman/);
 assert.match(js,/stockSafetyInfographic\(\)/);
 assert.doesNotMatch(js,/monthlyTrendInfographic\(\)/);
 assert.doesNotMatch(js,/renderStockIntegrityWarning\(\) \+/);
 assert.match(js,/data-sc4-modal="formula-audit"/);
 assert.match(js,/Saldo stok belum terverifikasi penuh/);
 assert.match(js,/stock-control-v3\.css\?v=31/);
 for(const f of ['stock-monitor.js','stock-v3-runtime-fix.js']){
  assert.match(fs.readFileSync(f,'utf8'),/stock-control-v3\.js\?v=37/);
 }
 assert.match(css,/#stok \.sc21-comparison-svg/);
 assert.match(css,/#stok \.sc21-safe-bar/);
 assert.match(css,/#stok \.sc21-current-bar/);
});
