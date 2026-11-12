'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('stock-control-v3.js','utf8');
function section(a,b){
  const i=js.indexOf(a),j=js.indexOf(b,i+a.length);
  assert.ok(i>=0&&j>i,'source function '+a+' found');
  return js.slice(i,j).trim();
}
const prodDB='https://bnnhmtkpdjlgehsvgoda.supabase.co';
function environment(host='hasnaria-business-analyzer-preview.vercel.app',url=prodDB){
  const window={location:{hostname:host},HASNARIA_SB:url};
  const detector=vm.runInNewContext('('+section('function previewUsesProductionDatabase(){','var PAGE_SIZE')+'\n)',{window},{timeout:1500});
  const requests=[];
  let tokenCalls=0;
  const ctx={
    SB:url,KEY:'test-anon-key',previewUsesProductionDatabase:detector,
    token:async()=>{tokenCalls++;return'test-jwt'},
    fetch:async (target,options)=>{
      requests.push({target,options});
      return {ok:true,json:async()=>({ok:true,from:target}),text:async()=>''};
    }
  };
  const rpc=vm.runInNewContext('('+section('async function rpc(name, payload) {','function qs(obj) {')+'\n)',ctx,{timeout:1500});
  return {rpc,requests,tokenCalls:()=>tokenCalls,detector};
}
test('HSN-423 preview + production DB cannot call any mutating RPC, before token/fetch',async()=>{
  const x=environment();
  assert.equal(x.detector(),true);
  for(const name of ['owner_stock_recipe_record_review_v1','resolve_physical_stock_opname',
    'some_future_mutating_rpc']){
    await assert.rejects(x.rpc(name,{p_test:true}),/Preview terhubung ke database produksi/);
  }
  assert.equal(x.requests.length,0);
  assert.equal(x.tokenCalls(),0);
});
test('HSN-423 read-only period catalog and moving analysis remain accessible in preview',async()=>{
  const x=environment();
  for(const name of ['get_ui_period_catalog_fast_v1','get_stock_moving_fifo_v1']){
    const y=await x.rpc(name,{p_brand:'example'});
    assert.equal(y.ok,true);
    assert.match(y.from,new RegExp('/rest/v1/rpc/'+name+'$'));
  }
  assert.equal(x.requests.length,2);
  assert.equal(x.tokenCalls(),2);
  assert.ok(x.requests.every(x=>x.options.method==='POST'),'supabase read functions use HTTP POST');
});
test('HSN-423 approved production origin retains existing writes (guard only preview)',async()=>{
  const x=environment('hasnaria-business-analyzer.vercel.app');
  assert.equal(x.detector(),false);
  const result=await x.rpc('owner_stock_recipe_record_review_v1',{p_test:true});
  assert.equal(result.ok,true);
  assert.equal(x.requests.length,1);
});
test('HSN-423 preview with isolated staging DB not mistaken for production',async()=>{
  const x=environment('hasnaria-preview.vercel.app','https://rynnpndtzjwpekbiwiif.supabase.co');
  assert.equal(x.detector(),false);
  const r=await x.rpc('owner_stock_recipe_record_review_v1',{p_test:true});
  assert.equal(r.ok,true);
  assert.equal(x.requests.length,1);
});
test('HSN-423 review UI and handler visibly block preview writes',async()=>{
  const scope=section('async function saveRecipeEvidence(){','function renderSalesStockAudit(){');
  let count=0;
  const S={modal:'recipes',recipeDetail:{id:'x',period:'2026-10',saving:false,loading:false,
    decision:'HOLD_FOR_CORRECTION',evidence:'Bukti yang cukup',reason:'Alasan dan bukti tertulis detail dalam proses review'}};
  const fn=vm.runInNewContext('('+scope+'\n)',{
    S,isOwner:()=>true,previewUsesProductionDatabase:()=>true,
    render:()=>{count++},rpc:async()=>{throw Error('RPC write must never run');}
  },{timeout:1500});
  await fn();
  assert.match(S.recipeDetail.notice,/penyimpanan review.*diblokir/);
  assert.equal(count,1);
  const form=section('function renderRecipeDetail(){','async function saveRecipeEvidence(){');
  assert.match(form,/data-sc17-save/);
  assert.match(form,/d\.saving\|\|previewUsesProductionDatabase\(\)/);
  assert.match(form,/Simpan nonaktif pada preview/);
  assert.match(form,/Mode baca: preview memakai database produksi/);
  const corr=section('async function saveCorrection() {','// The Stock page presents outcomes.');
  assert.match(corr,/previewUsesProductionDatabase\(\)/);
});
test('HSN-423 no preview exception for unrecognized RPC; request GET unchanged',()=>{
  const src=section('async function rpc(name, payload) {','function qs(obj) {');
  assert.match(src,/name!=='get_ui_period_catalog_fast_v1'/);
  assert.match(src,/name!=='get_stock_moving_fifo_v1'/);
  assert.match(src,/if\(previewUsesProductionDatabase\(\)&&/);
  assert.match(src,/throw new Error\('Preview terhubung/);
  const get=section('async function request(path) {','async function rpc(name, payload) {');
  assert.match(get,/rest\/v1\//);
  assert.doesNotMatch(get,/previewUsesProductionDatabase/);
});
