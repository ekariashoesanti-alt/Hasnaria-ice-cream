'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('sales-board.js','utf8');
const start = source.indexOf('  function ensureSalesTab(){');
const end = source.indexOf('  function watchSalesTab(){',start);
assert.ok(start>=0 && end>start, 'Missing Sales navigation function');
const compiled = source.slice(start,end).trim();
function setup(initial='Penjualan',exists=true){
  let writes=0,inserts=0,visible=true,selected=false;
  const btn={style:{display:'none'},classList:{toggle(_,v){selected=v;}},attributes:{},get textContent(){return initial;},set textContent(v){writes++;initial=v;},
    setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];}};
  btn.setAttribute('data-tab','sales');
  let current=exists?btn:null;
  const tabs={firstChild:null,children:[],querySelector(){return current;},querySelectorAll(){return current?[current]:[];},
    insertBefore(b){current=b;inserts++;}};
  const sales={classList:{toggle(_,value){visible=!value;}}};
  const document={getElementById(id){return id==='tabs'?tabs:id==='sales'?sales:null;},createElement(){return {style:{},classList:{toggle(){}},setAttribute(){},textContent:''};}};
  const ensure=vm.runInNewContext('('+compiled+')',{document,window:{__hasnariaReloadSales(){}},setTimeout(){}});
  return{ensure,get current(){return current;},get writes(){return writes;},get inserts(){return inserts;}};
}
test('existing tab label is not rewritten across 100 reconciliations',()=>{
  const a=setup();for(let i=0;i<100;i++)a.ensure();assert.equal(a.writes,0);
});
test('incorrect label corrected once',()=>{
  const a=setup('Sales');for(let i=0;i<30;i++)a.ensure();assert.equal(a.writes,1);
  assert.equal(a.current.textContent,'Penjualan');
});
test('tab remains clickable after repeated reconciliation',()=>{
  const a=setup();a.ensure();assert.equal(typeof a.current.onclick,'function');
  a.current.onclick();assert.equal(a.current.style.display,'');
});
test('legacy data fetch and importer guards remain present',()=>{
  assert.match(source,/sales-board\.part0\.js\?v=41/);
  assert.match(source,/function patchSource\(code\)/);
});
