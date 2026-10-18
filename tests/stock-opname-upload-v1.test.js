'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('stock-opname-upload-v1.js','utf8');

function harness(inputRows,opts={}){
 const calls=[],writes=new Map(),sku=[
  {id:'sku-1',item_name:'ODENG',unit:'porsi',category:'Makanan'},
  {id:'sku-2',item_name:'ICE CREAM MATCHA',unit:'pcs',category:'Ice Cream'}
 ];
 const data={SheetNames:opts.sheetNames||['STOCK_OPNAME'],Sheets:{STOCK_OPNAME:inputRows,Sheet1:inputRows}};
 const user={role:opts.role||'owner'};
 const db={
  from(table){
   const args={table,fields:''};
   const builder={
    select(columns){args.fields=columns;return builder},
    eq(){return builder},order(){return builder},limit(){return builder},range(){return builder},
    then(done,fail){
     calls.push('read:'+table);
     let rows=[];
     if(table==='operational_runs')rows=opts.duplicate?[{id:'already-imported',status:'in_progress'}]:[];
     if(table==='operational_run_items'){
      if(args.fields.includes('numeric_value'))rows=sku.map((x,i)=>({inventory_item_id:x.id,numeric_value:writes.get(x.id)??null}));
      else rows=sku.map((x,i)=>({id:'row-'+(i+1),inventory_item_id:x.id}));
     }
     if(table==='inventory_items')rows=sku;
     return Promise.resolve({data:rows,error:null}).then(done,fail);
    }
   };return builder
  },
  async rpc(name,args){
   calls.push('rpc:'+name);
   if(name==='create_stock_opname_run')return {data:'run-1',error:null};
   if(name==='set_operational_run_item'){
     const id=sku[Number(args.p_item_id.split('-')[1])-1].id;
     writes.set(id,args.p_numeric_value);return {data:{id:args.p_item_id},error:null};
   }
   throw Error('Unexpected write '+name);
  }
 };
 const win={
  __HASNARIA_CONTEXT:user,__HASNARIA_DB:db,
  location:{hostname:opts.preview?'hasnaria-business-analyzer-test123.vercel.app':'hasnaria-business-analyzer.vercel.app'},
  HASNARIA_SB:'https://bnnhmtkpdjlgehsvgoda.supabase.co',
  crypto:{subtle:{digest:async()=>Uint8Array.from([1,2,3]).buffer}},
  XLSX:{read:()=>data,utils:{sheet_to_json:s=>s}},
  confirm:()=>true
 };
 const doc={addEventListener(){},dispatchEvent(){},createElement(){return{innerHTML:'',addEventListener(){},remove(){}}},body:{appendChild(){}}};
 const ctx={window:win,document:doc,Number,Date,Math,Promise,Map,Set,String,JSON,Uint8Array,Array,
  setTimeout(fn){return 0},console,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}}};
 const exposed=source.replace(/\}\)\(\);\s*$/, '\nwindow.__test={parseFile,stage,st,today,setMaster:function(v){master=v}};\n})();');
 vm.runInNewContext(exposed,ctx,{filename:'stock-opname-upload-v1.js'});
 win.__test.setMaster(sku);
 return {api:win.__test,calls,writes,sku,win};
}
const sheet=(rows)=>[['INVENTORY_ITEM_ID','ITEM_NAME','UNIT','PHYSICAL_QTY'],...rows];
const file=(name='stock.xlsx')=>({name,size:40,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});

test('valid exact master SKU and physical quantity zero are accepted (read-only preview)',async()=>{
 const f=harness(sheet([['sku-1','ODENG','porsi',0],['sku-2','ICE CREAM MATCHA','pcs',3]]));
 const parsed=await f.api.parseFile(file());assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].qty,0);
 assert.equal(f.calls.length,0,'parsing must not post or query finance');
});
test('generated STOCK_OPNAME.csv template works even with generic worksheet name',async()=>{
 const f=harness(sheet([['sku-1','ODENG','porsi',1]]),{sheetNames:['Sheet1']});
 assert.equal((await f.api.parseFile(file('STOCK_OPNAME.csv'))).rows.length,1);
});
test('reject Rencana Belanja category workbook without any write',async()=>{
 const f=harness(sheet([['sku-1','ODENG','porsi',1]]),{sheetNames:['MAKANAN']});
 await assert.rejects(f.api.parseFile(file('RENCANA BELANJA OKTOBER 2026.xlsx')),/STOCK_OPNAME/);
 assert.deepEqual(f.calls,[]);
});
test('reject invalid unit, duplicate SKU, negative count, unknown explicit ID',async()=>{
 const cases=[
  [['sku-1','ODENG','kg',2]], [['sku-1','ODENG','porsi',-1]],
  [['sku-1','ODENG','porsi',1],['sku-1','ODENG','porsi',2]],
  [['wrong-sku','ODENG','porsi',3]]
 ];
 for(const rows of cases){
  const f=harness(sheet(rows));await assert.rejects(f.api.parseFile(file()),/Upload diblokir/);
  assert.deepEqual(f.calls,[],'bad file must never cause DB writes');
 }
});
test('staging saves only an auditable operational draft; no ledger posting',async()=>{
 const f=harness(sheet([['sku-1','ODENG','porsi',2]]));
 f.api.st.rows=(await f.api.parseFile(file())).rows;
 Object.assign(f.api.st,{date:f.api.today(),file:file(),hash:'abcdef9876543210',runId:'',busy:false});
 await f.api.stage();
 assert.equal(f.writes.get('sku-1'),2);
 assert.equal(f.api.st.runId,'run-1');
 assert.match(f.api.st.notice,/draft/i);
 assert.ok(!f.calls.some(x=>/approve_stock_opname_run|post_inventory_movement|resolve_physical_stock_opname/.test(x)),'draft must not post actual Stock');
});
test('duplicate import is stopped before any write',async()=>{
 const f=harness(sheet([['sku-1','ODENG','porsi',4]]),{duplicate:true});
 Object.assign(f.api.st,{rows:(await f.api.parseFile(file())).rows,date:f.api.today(),file:file(),hash:'ffffeeeeaaaabbbb',runId:'',busy:false});
 await f.api.stage();
 assert.ok(!f.calls.some(x=>x.startsWith('rpc:')));
 assert.match(f.api.st.error,/sudah pernah masuk/);
});
test('staff cannot stage an opname',async()=>{
 const f=harness(sheet([['sku-1','ODENG','porsi',1]]),{role:'staff'});
 Object.assign(f.api.st,{rows:[{id:'sku-1',qty:1}],date:f.api.today(),hash:'qwer',busy:false,runId:''});
 await f.api.stage();assert.equal(f.calls.length,0);
});

test('PR preview connected to live Supabase cannot stage any Stock mutation',async()=>{
 const f=harness(sheet([['sku-1','ODENG','porsi',2]]),{preview:true});
 f.api.st.rows=(await f.api.parseFile(file())).rows;
 Object.assign(f.api.st,{date:f.api.today(),file:file(),hash:'abcxyz',runId:'',busy:false});
 await f.api.stage();
 assert.equal(f.calls.length,0,'preview guard must reject before even checking canonical runs');
 assert.match(f.api.st.error,/PRODUKSI/);
 assert.equal(f.api.st.runId,'');
});
