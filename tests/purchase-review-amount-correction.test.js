'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const script=fs.readFileSync('purchase-review-amount-v1.js','utf8');
const css=fs.readFileSync('owner-one-view.css','utf8');
const preload=fs.readFileSync('xlsx-preload.js','utf8');
const schema=fs.readFileSync('supabase/migrations/20261021225000_purchase_review_amount_requests_v1.sql','utf8');
const core=fs.readFileSync('purchase-finance-alignment-v1.js','utf8');
const schemaV2=fs.readFileSync('supabase/migrations/20261022070000_purchase_review_payment_method_requests_v2.sql','utf8');
assert.match(schemaV2,/PINJAMAN_USAHA_LAIN/);
assert.match(schemaV2,/proposed_payment_method/);
assert.match(schemaV2,/v_old=v_new AND v_new_payment IS NULL/);
assert.match(schemaV2,/private\.owner_stock_review_assert_v1\(\)/);
assert.match(schemaV2,/pg_advisory_xact_lock/);
assert.match(schemaV2,/FOR UPDATE/);
assert.match(schemaV2,/finance_posted',false/);
assert.doesNotMatch(schemaV2,/\bUPDATE public\.offline_purchase_history\b|\bTRUNCATE\b/);
assert.match(css,/\.hsn-rv-chip/);
assert.match(css,/select\[data-hsn-rv-payment\]/);

assert.match(preload,/purchase-review-amount-v1\.js\?v=4/);
assert.match(css,/#hasnaria-review-correction-root/);
assert.match(css,/\.hsn-rv-scroll/);
assert.match(schema,/private\.owner_stock_review_assert_v1\(\)/);
assert.match(schema,/pg_advisory_xact_lock/);
assert.match(schema,/FOR UPDATE/);
assert.match(schema,/original_amount IS DISTINCT FROM v_old|v_history\.total_amount IS DISTINCT FROM v_old/);
assert.match(schema,/pending_finance_review/);
assert.match(schema,/finance_posted',false/);
assert.match(schema,/source_history_id/);
assert.doesNotMatch(schema,/\bUPDATE public\.offline_purchase_history\b|\bDELETE FROM public\.offline_purchase_history\b|\bTRUNCATE\b/);
assert.match(core,/card\('Review',money\(v\.review_amount\)/,'KPI remains linked to canonical Review');
const handlers={},el=[],calls=[],validId='9b75434d-6c04-42dd-b6cc-a98d88ea54a5',paymentOnlyId='9b75434d-6c04-42dd-b6cc-a98d88ea54a6';
let appended=null,submitted=[];
const card={attributes:{},getAttribute(k){return this.attributes[k]},setAttribute(k,v){this.attributes[k]=v},tabIndex:0};
const host={};
const period={value:'2026-10'};
const body={appendChild(x){appended=x;el.push(x)}};
const doc={
 readyState:'complete',body,
 getElementById(id){return id==='pembelian'?host:id==='paPeriod'?period:null},
 querySelector(sel){return sel.includes('.pfa-card.review')?card:null},
 createElement(tag){return{tag,innerHTML:'',querySelector(){return null},remove(){appended=null}}},
 addEventListener(name,fn){(handlers[name]||(handlers[name]=[])).push(fn)}
};
const view=[
 {source_history_id:validId,expense_account_code:'6120',category_status:'provisional',
  item_name:'ODENG',effective_date:'2026-10-01',payment_method:'BELUM_DIPETAKAN',total_amount:595000},
 {source_history_id:paymentOnlyId,expense_account_code:'1990',category_status:'provisional',
  item_name:'SIRUP LECI',effective_date:'2026-10-01',payment_method:'BELUM_DIPETAKAN',total_amount:10800},
 {source_history_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expense_account_code:'6120',
  category_status:'classified',item_name:'OTHER',total_amount:1000}
];
const w={
 __HASNARIA_CONTEXT:{role:'owner'},
 __HASNARIA_DB:{async rpc(name,args){
  calls.push({name,args});
  if(name==='get_purchase_control_period_v1')return{data:{rows:view},error:null};
  if(name==='get_purchase_review_amount_requests_v1')return{data:submitted,error:null};
  if(name==='submit_purchase_review_corrections_v2'){
   submitted=args.p_changes.map(x=>({source_history_id:x.source_history_id,proposed_amount:x.corrected_amount,proposed_payment_method:x.corrected_payment_method,status:'pending_finance_review'}));
   return{data:{status:'pending_finance_review',submitted_rows:args.p_changes.length,batch_id:'abc123456789'},error:null};
  }
  throw Error('Unexpected '+name);
 }},
 confirm:()=>true
};
vm.runInNewContext(script,{window:w,document:doc,MutationObserver:class{observe(){}},
 setTimeout(){},Number,String,Object,Array,Date,Promise,Math,console});
assert.equal(card.attributes['role'],'button');
assert.equal(card.attributes['aria-haspopup'],'dialog');
function target(looked,id,value){
 return{
  value,
  closest(sel){
   if(looked==='card'&&sel.includes('.pfa-card.review'))return card;
   if(looked==='input'&&sel==='[data-hsn-rv-value]')return{getAttribute:()=>id,value};
   if(looked==='payment'&&sel==='[data-hsn-rv-payment]')return{getAttribute:()=>id,value};
   if(looked==='stage'&&sel==='[data-hsn-rv-stage]')return{getAttribute:()=>id};
   if(looked==='submit'&&sel==='[data-hsn-rv-submit]')return{};
   if(looked==='history'&&sel==='[data-hsn-rv-history]')return{};
   if(looked==='close'&&sel==='[data-hsn-rv-close]')return this;
   return null;
  }
 }
}
function send(name,e){for(let f of handlers[name]||[])f(e)}
(async()=>{
 send('click',{target:target('card'),preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(appended,'dialog mounts to body');
 assert.match(appended.innerHTML,/ODENG/);
 assert.match(appended.innerHTML,/595\.000/);
 assert.match(appended.innerHTML,/Nilai Saat Ini/);
 assert.match(appended.innerHTML,/Nilai Koreksi/);
 assert.match(appended.innerHTML,/Jenis Pembayaran/);
 assert.match(appended.innerHTML,/Pinjaman usaha lain \(Jas Hujan\)/);
 assert.match(appended.innerHTML,/hsn-rv-meta/);
 assert.match(appended.innerHTML,/Koreksi Transaksi/);
 assert.match(appended.innerHTML,/Submit ke Database/);
 assert.doesNotMatch(appended.innerHTML,/OTHER<\/strong>/,'only Review transactions');
 assert.equal(calls.filter(q=>q.name==='submit_purchase_review_corrections_v2').length,0,
  'opening dialog does not write to database');
 send('input',{target:target('input',validId,'600000')});
 send('change',{target:target('payment',validId,'PINJAMAN_USAHA_LAIN')});
 send('click',{target:target('stage',validId)});
 // Payment-only corrections are valid: no amount is typed.
 send('change',{target:target('payment',paymentOnlyId,'TRANSFER')});
 send('click',{target:target('stage',paymentOnlyId)});
 assert.match(appended.innerHTML,/2 baris disimpan/);
 assert.equal(calls.filter(q=>q.name==='submit_purchase_review_amount_corrections_v1').length,0,
  'row checkmark only stages locally');
 send('click',{target:target('submit')});
 await new Promise(resolve=>setImmediate(resolve));
 const writes=calls.filter(q=>q.name==='submit_purchase_review_corrections_v2');
 assert.equal(writes.length,1);
 assert.equal(writes[0].args.p_period,'2026-10-01');
 assert.equal(writes[0].args.p_changes[0].source_history_id,validId);
 assert.equal(writes[0].args.p_changes[0].current_amount,595000);
 assert.equal(writes[0].args.p_changes[0].corrected_amount,600000);
 assert.equal(writes[0].args.p_changes[0].corrected_payment_method,'PINJAMAN_USAHA_LAIN');
 assert.equal(writes[0].args.p_changes[1].source_history_id,paymentOnlyId);
 assert.equal(writes[0].args.p_changes[1].current_amount,10800);
 assert.equal(writes[0].args.p_changes[1].corrected_amount,10800);
 assert.equal(writes[0].args.p_changes[1].corrected_payment_method,'TRANSFER');
 assert.match(appended.innerHTML,/belum diproses/);
 assert.match(appended.innerHTML,/Pengajuan tersimpan: 2 transaksi/);
 assert.match(appended.innerHTML,/Semua transaksi sudah diajukan/);
 assert.match(appended.innerHTML,/0 perlu koreksi/);
 assert.match(appended.innerHTML,/data-hsn-rv-success/);
 assert.doesNotMatch(appended.innerHTML,new RegExp('<strong>ODENG</strong>'));
 send('click',{target:target('history')});
 assert.match(appended.innerHTML,/Riwayat pengajuan/);
 assert.match(appended.innerHTML,/ODENG/);
 send('click',{target:target('history')});
 const close=target('close'); send('click',{target:close});
 send('click',{target:target('card'),preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(appended.innerHTML,/Semua transaksi sudah diajukan/);
 assert.equal(calls.filter(x=>x.name==='submit_purchase_review_corrections_v2').length,1);
 console.log('Purchase Review submission UX and reopen persisted queue PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
