const fs=require('fs');
const assert=require('assert');

const shim=fs.readFileSync('owner-finance-stock-v3.js','utf8');
const bridge=fs.readFileSync('stock-v3-runtime-fix.js','utf8');
const css=fs.readFileSync('stock-readable-density.css','utf8');

assert(!shim.includes('stock-recall-v4.js'),'owner shim must not load legacy Stock recall v4');
assert(shim.includes('stock-v3-runtime-fix.js'),'owner shim must load the canonical Stock v3 bridge');
assert(bridge.includes("/stock-control-v3.js?v=4"),'canonical bridge must load Stock Control v3');
assert(bridge.includes("setAttribute('data-stock-v4','1')"),'canonical shell must satisfy the existing owner guard marker');
assert(css.includes('#stok .sc3-table{width:100%;min-width:0;table-layout:fixed;font-size:8.3px}'),'desktop Stock table must keep the readable fixed-width density override');
assert(!css.includes('font-size:5.4px'),'readable override must not regress to the previous ultra-small status text');
console.log('stock canonical runtime checks passed');
